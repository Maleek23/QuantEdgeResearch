/**
 * QUANT BOT — paper-trades the platform's own signals, so the engine gets a track record.
 *
 * Everything upstream produces opinions; nothing was recording whether they worked. The
 * bot closes that loop: it takes the highest-conviction signals into a paper portfolio,
 * manages them against their own stop/target, and books the result. It is a paper-execution
 * ledger — one source of calibration evidence, never a replacement for the platform outcome
 * model or a signal's 0–100 evidence grade.
 *
 * Rules are deliberately mechanical. A bot that second-guesses the signal is no longer
 * measuring the signal.
 */
import { logger } from './logger';
import { storage } from './storage';
import { convictionDisplayPercent } from '@shared/conviction-display';
import {
  executeTradeIdea, checkStopsAndTargets, updatePositionPrices, closePosition,
  calculatePortfolioValue, recordEquitySnapshot,
  getOpenPositions, getClosedPositions,
} from './paper-trading-service';

const BOT_PORTFOLIO_NAME = 'Quant Bot';
const BOT_USER = 'system-quant-bot';

export interface BotConfig {
  minConviction: number;   // only take signals at/above this raw conviction score
  maxOpen: number;         // concurrent positions
  startingCapital: number;
  riskPerTradePct: number;
  /** refuse a signal that has already travelled this far entry -> T1 (chase guard) */
  maxProgressPct: number;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  // convictionScore is a raw CONFLUENCE-POINT sum, not a percent: it tops out around the
  // high 20s and the bands are S>=30 / A>=22 / B>=15. A threshold of 25 therefore left
  // only 3 eligible names out of 52. 18 takes solid B/A-band setups without scraping the
  // bottom of the board.
  minConviction: 18,
  maxOpen: 10,
  startingCapital: 10_000,
  riskPerTradePct: 2,
  // Past ~35% of the way to T1 the remaining reward no longer justifies the same risk.
  maxProgressPct: 35,
};

/** Read the dedicated portfolio without changing account state. */
async function findBotPortfolio() {
  const all = await storage.getAllPaperPortfolios();
  const existing = Array.isArray(all) ? all.find((p: any) => p.name === BOT_PORTFOLIO_NAME) : null;
  return existing ?? null;
}

/** The bot trades one dedicated portfolio; create it only when a cycle is explicitly run. */
export async function getBotPortfolio(cfg: BotConfig = DEFAULT_BOT_CONFIG) {
  const existing = await findBotPortfolio();
  if (existing) return existing;

  return storage.createPaperPortfolio({
    userId: BOT_USER,
    name: BOT_PORTFOLIO_NAME,
    startingCapital: cfg.startingCapital,
    cashBalance: cfg.startingCapital,
    totalValue: cfg.startingCapital,
    // riskPerTrade is stored as a FRACTION (0.02 = 2%). Passing the percent value made
    // the sizer read 2 as 200% risk, which then hit the flat $5,000 position cap — two
    // trades consumed the entire $10k account. A bot that goes all-in on two names isn't
    // measuring signals.
    riskPerTrade: cfg.riskPerTradePct / 100,
    maxPositionSize: Math.round((cfg.startingCapital * 0.15)),
  } as any);
}

export interface BotRunResult {
  ranAt: string;
  portfolioId: string;
  opened: { symbol: string; reason: string }[];
  closed: { symbol: string; reason: string }[];
  skipped: number;
  openCount: number;
  /** Levels the bot exited on. A later fill clears the name for re-entry. */
  gapWatch: { symbol: string; level: number }[];
  error?: string;
}

/**
 * One bot cycle: mark positions to market, take exits the signal itself defined, then
 * fill any remaining slots with the best signals available.
 */

/**
 * Announce a closed position. Every exit route funnels through here — stop, target,
 * expiry settlement, gap magnet — so an exit reason can never be reported one way
 * in the log and another way in Discord. A notification failure must never roll
 * back a real close, hence the swallow.
 */
async function announceExit(pos: any, exitPrice: number, reason: string): Promise<void> {
  try {
    const { sendBotTradeExitToDiscord } = await import('./discord-service');
    const mult = pos.assetType === 'option' ? 100 : 1;
    const pnl = (exitPrice - Number(pos.entryPrice)) * Number(pos.quantity) * mult;
    await sendBotTradeExitToDiscord({
      symbol: pos.symbol,
      assetType: pos.assetType ?? 'option',
      optionType: pos.optionType ?? null,
      strikePrice: pos.strikePrice ?? null,
      entryPrice: Number(pos.entryPrice),
      exitPrice,
      quantity: Number(pos.quantity),
      realizedPnL: pnl,
      exitReason: reason,
      portfolio: 'Quant Bot',
      source: 'quant-bot',
    });
  } catch (err: any) {
    logger.warn(`[QUANT-BOT] exit alert failed for ${pos?.symbol}: ${err?.message ?? err}`);
  }
}

export async function runBotCycle(cfg: BotConfig = DEFAULT_BOT_CONFIG): Promise<BotRunResult> {
  const ranAt = new Date().toISOString();
  const opened: BotRunResult['opened'] = [];
  const closed: BotRunResult['closed'] = [];
  // Levels we exited on, so a later fill can flip the name back to a candidate.
  const gapWatch: { symbol: string; level: number }[] = [];
  let skipped = 0;

  const portfolio: any = await getBotPortfolio(cfg);
  if (!portfolio?.id) {
    return { ranAt, portfolioId: '', opened, closed, skipped, openCount: 0, gapWatch: [], error: 'no portfolio' };
  }

  // ── A cycle, concretely ──────────────────────────────────────────────────
  // For shares a "cycle" is just re-price and check levels. Options add a clock: every
  // contract has an expiry, and a position nobody settles would sit in the book forever
  // claiming value it no longer has. So a cycle is four steps, in this order:
  //   1. RE-PRICE every open contract from the live chain,
  //   2. SETTLE anything at or past expiry,
  //   3. EXIT on the premium stop / target,
  //   4. ENTER with whatever capacity is left.
  // Exits precede entries so a slot freed this cycle is reusable immediately.

  // 1 — re-price
  try {
    await updatePositionPrices(portfolio.id);
  } catch (err) {
    logger.warn('[QUANT-BOT] re-price failed:', err);
  }

  // 2 — settle expiries. An option is not a share: at expiry it either has intrinsic
  //     value or it is worth nothing, and either way it leaves the book.
  try {
    const open = await getOpenPositions(portfolio.id);
    const today = new Date().toISOString().slice(0, 10);
    for (const pos of open as any[]) {
      if (!pos.expiryDate || !pos.optionType) continue;
      if (String(pos.expiryDate).slice(0, 10) > today) continue;

      // Intrinsic value at expiry — everything else (time value) is gone.
      const spot = Number(pos.underlyingPrice ?? pos.currentUnderlyingPrice ?? 0);
      const strike = Number(pos.strikePrice ?? 0);
      let settle = 0;
      if (spot > 0 && strike > 0) {
        settle = pos.optionType === 'call'
          ? Math.max(0, spot - strike)
          : Math.max(0, strike - spot);
      }
      const settlePx = Number(settle.toFixed(2));
      await closePosition(pos.id, settlePx, settle > 0 ? 'expired_itm' : 'expired_worthless');
      await announceExit(pos, settlePx, settle > 0 ? `expired ITM at $${settlePx.toFixed(2)}` : 'expired worthless');
      closed.push({ symbol: pos.symbol, reason: settle > 0 ? `expired ITM at $${settle.toFixed(2)}` : 'expired worthless' });
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] expiry settlement failed:', err);
  }

  // Announce anything the board has newly published. Piggy-backs on the bot cycle
  // because it already holds a fresh conviction set; a separate cron would rebuild
  // the same expensive thing on its own schedule and drift out of step with it.
  try {
    const { alertNewSignals } = await import('./signal-alerts');
    // peekConvictions() is a CACHE-ONLY read that returns null on a cold cache and
    // never computes. Using it here meant alerts fired only if a human had loaded
    // the Oracle page in this same process since the last restart — otherwise this
    // block silently did nothing, with no error and no log. Signals scored 92 and
    // were never announced anywhere. getCachedConvictions() builds on a miss.
    const { getCachedConvictions } = await import('./convictions-engine');
    const board = await getCachedConvictions();
    const picks = board?.picks ?? [];
    if (picks.length) {
      const sent = await alertNewSignals(picks as any);
      logger.info(`[QUANT-BOT] board has ${picks.length} pick(s); announced ${sent}`);
    } else {
      // Silence has to be loud. An empty board is a real condition worth seeing.
      logger.warn('[QUANT-BOT] conviction board returned 0 picks — nothing to announce');
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] signal alerts failed:', err);
  }

  // OPEX awareness. An IWM $296P was held into monthly expiration and settled
  // worthless because nothing in the cycle knew the date mattered. Contracts
  // expiring INTO the monthly are flagged before the roll/exit passes run, so the
  // decision is made with the calendar in view rather than after the fact.
  try {
    const { getOpexContext } = await import('@shared/opex-calendar');
    const opex = getOpexContext();
    if (opex.isOpexDay || opex.isOpexWeek) {
      const open = await getOpenPositions(portfolio.id);
      const atRisk = open.filter(
        (p: any) => p.assetType === 'option' && p.expiryDate && String(p.expiryDate).slice(0, 10) <= opex.thisMonth,
      );
      if (atRisk.length) {
        logger.warn(
          `[QUANT-BOT] ${opex.label}: ${atRisk.length} position(s) expire on or before ${opex.thisMonth} — ` +
          atRisk.map((p: any) => `${p.symbol} $${p.strikePrice}${String(p.optionType)[0].toUpperCase()}`).join(', '),
        );
      }
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] opex check failed:', err);
  }

  // 3.5 — gap magnets. A static stop and target cannot see that the underlying has
  // a high-confidence unfilled gap sitting below a position that is well in profit.
  // MARA ran to +159% with a gap 12.4% under it on a name that has filled 100% of
  // 31 past gaps in a median of 3 sessions, and the bot held it back to +74%
  // because nothing consulted that. This banks the gain and records the level, so
  // the fill becomes a re-entry trigger rather than just a loss avoided.
  try {
    const { evaluateGapExit, describeGapExit } = await import('./gap-aware-exits');
    const { rateLimited } = await import('./provider-cache');
    const stillOpen = await getOpenPositions(portfolio.id);

    for (const pos of stillOpen) {
      if (pos.assetType !== 'option') continue;
      const cost = Number(pos.entryPrice) * Number(pos.quantity) * 100;
      const gainPct = cost > 0 ? (Number(pos.unrealizedPnL ?? 0) / cost) * 100 : 0;
      if (gainPct < 40) continue;   // cheap pre-filter before any network call

      const chart: any = await rateLimited('yahoo', 1200, async () => {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${pos.symbol}?range=2y&interval=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } },
        );
        return r.ok ? r.json() : null;
      });
      const res = chart?.chart?.result?.[0];
      const q = res?.indicators?.quote?.[0];
      if (!res || !q) continue;
      const bars = (res.timestamp || [])
        .map((t: number, i: number) => ({
          time: t, open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i],
        }))
        .filter((b: any) => [b.open, b.high, b.low, b.close].every((v: any) => Number.isFinite(v)));

      // A long call is threatened by a gap below; a long put by one above.
      const dir = pos.optionType === 'put' ? 'short' : 'long';
      const signal = evaluateGapExit(bars, gainPct, dir as 'long' | 'short');
      if (signal.action !== 'scale_out') continue;

      logger.info(describeGapExit(pos.symbol, signal));
      const mark = Number(pos.currentPrice ?? pos.entryPrice);
      await closePosition(pos.id, mark, 'gap_magnet');
      await announceExit(pos, mark, `gap magnet at $${signal.gapLevel?.toFixed(2)} — banked +${gainPct.toFixed(0)}%`);
      closed.push({ symbol: pos.symbol, reason: `gap magnet at $${signal.gapLevel?.toFixed(2)} — banked +${gainPct.toFixed(0)}%` });
      gapWatch.push({ symbol: pos.symbol, level: signal.gapLevel ?? 0 });
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] gap-exit check failed:', err);
  }

  // 3 — premium stop / target
  try {
    const exited = await checkStopsAndTargets(portfolio.id);
    for (const p of exited ?? []) {
      const reason = (p as any).exitReason ?? 'stop/target';
      closed.push({ symbol: p.symbol, reason });
      await announceExit(p, Number((p as any).exitPrice ?? 0), reason);
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] exit check failed:', err);
  }

  // 2 — fill free slots with the best available signals
  try {
    const open = await getOpenPositions(portfolio.id);
    const slots = Math.max(0, cfg.maxOpen - open.length);

    if (slots > 0) {
      const { getCachedConvictions } = await import('./convictions-engine');
      const board = await getCachedConvictions({});
      const heldSymbols = new Set(open.map((p) => p.symbol));

      // ── Trade exactly what the board publishes, in the same order ────────────
      //
      // If the bot holds names the board isn't showing, the track record measures a
      // different strategy than the one on screen and proves nothing about the signals.
      // So: same list, same ranking, same rules the UI displays — plus the two gates the
      // board already shows and the bot was ignoring.
      const chaseGuard = (p: any) => {
        // How far price has already travelled entry -> T1. The board renders this as
        // "39% to T1". Entering there is the chase the desk warns about: the risk is the
        // same but most of the reward is gone, so the R:R the signal advertises is a lie
        // by the time we'd fill.
        const live = p.currentPrice;
        if (!live || !p.entryPrice || !p.targetPrice) return 0;
        const span = p.direction === 'long' ? p.targetPrice - p.entryPrice : p.entryPrice - p.targetPrice;
        const done = p.direction === 'long' ? live - p.entryPrice : p.entryPrice - live;
        return span > 0 ? (done / span) * 100 : 0;
      };

      const triggered = (p: any) => {
        // PENDING TRIGGER means price hasn't reached the entry yet. The board says so;
        // buying anyway means taking a trade the signal hasn't actually called.
        const live = p.currentPrice;
        if (!live || !p.entryPrice) return false;
        return p.direction === 'long' ? live >= p.entryPrice : live <= p.entryPrice;
      };

      const stoppedOut = (p: any) => {
        const live = p.currentPrice;
        if (!live || !p.stopLoss) return false;
        return p.direction === 'long' ? live <= p.stopLoss : live >= p.stopLoss;
      };

      // THE DAY IS A FILTER TOO. The board grades setups; nothing graded the tape,
      // so the bot would buy a conviction-30 call into a thin, negative-gamma OPEX
      // session and lose on direction, vol and chop at once — none of which the
      // setup's score knows about. Sitting in cash is a position, and this is the
      // only place the bot can take it.
      let tapeGate: { verdict: string; headline: string } | null = null;
      try {
        const { getTapeConditions } = await import('./tape-conditions');
        const tape = await getTapeConditions();
        tapeGate = { verdict: tape.verdict, headline: tape.headline };

        if (tape.verdict === 'sit_out') {
          logger.warn(`[QUANT-BOT] SIT OUT (tape ${tape.score}) — no entries this cycle. ${tape.headline}`);
          tape.signals.filter((x) => x.points < 0).forEach((x) => logger.warn(`  ${x.label}: ${x.detail}`));
          skipped += (board.picks ?? []).length;
          // openCount is computed after this block, so count the book directly.
          const held = await getOpenPositions(portfolio.id);
          return {
            ranAt, portfolioId: portfolio.id, opened, closed,
            skipped, openCount: held.length, gapWatch,
          };
        }
      } catch (err) {
        // A missing tape read must not stop the bot trading — it just loses the gate.
        logger.warn('[QUANT-BOT] tape read failed, proceeding without the gate:', err);
      }

      // On a SELECTIVE tape only take what is genuinely strong. The threshold moves
      // with conditions rather than the bot pretending every day is the same.
      const minConviction = tapeGate?.verdict === 'selective'
        ? Math.max(cfg.minConviction, 26)
        : cfg.minConviction;
      if (minConviction !== cfg.minConviction) {
        logger.info(`[QUANT-BOT] selective tape — conviction floor raised ${cfg.minConviction} -> ${minConviction}`);
      }

      const candidates = (board.picks ?? [])
        .filter((p) => p.convictionScore >= minConviction)
        .filter((p) => !heldSymbols.has(p.symbol))
        .filter((p) => {
          if (!triggered(p)) { skipped++; return false; }          // pending trigger
          if (stoppedOut(p)) { skipped++; return false; }          // already invalidated
          if (chaseGuard(p) > cfg.maxProgressPct) { skipped++; return false; } // chasing
          return true;
        })
        .sort((a, b) => b.convictionScore - a.convictionScore)
        .slice(0, slots);

      for (const pick of candidates) {
        const idea: any = await storage.getTradeIdeaById(pick.ideaId).catch(() => null);
        if (!idea) { skipped++; continue; }

        // Most signals are tagged assetType 'option', but the platform stores the
        // UNDERLYING stock levels on them — the thesis is on the stock and the Contract
        // Engine picks the vehicle separately. Paper-trading them as options would need
        // live premium data, which we don't have (Tradier is unfunded/401). So the bot
        // trades the underlying against those same levels: it measures the SIGNAL, which
        // is the point, instead of failing to fill on a dead options feed.
        // ── Fill an actual CONTRACT, not the underlying ──────────────────────
        //
        // Options are the product. Trading the underlying as a proxy measures whether the
        // signal was directionally right, but not what the trade would have made — an idea
        // that's +3% on the stock can be +90% or -100% on the contract. So option ideas
        // fill on a real premium.
        //
        // Every option idea already carries a concrete contract (symbol / type / strike /
        // expiry). A delayed chain is useful research data, but it is not an executable
        // fill. New bot entries therefore require a non-delayed provider mark. Existing
        // delayed paper positions remain visible for audit, but the ledger cannot create
        // more false-precision entries while the realtime provider is unavailable.
        let tradeable: any;

        if (idea.assetType === 'option' && idea.strikePrice && idea.expiryDate && idea.optionType) {
          const { getOptionMark } = await import('./tradier-api');
          const q = await getOptionMark({
            underlying: idea.symbol,
            optionType: idea.optionType as 'call' | 'put',
            strike: Number(idea.strikePrice),
            expiryDate: String(idea.expiryDate),
          }).catch(() => null);

          if (!q || q.delayed) {
            skipped++;
            logger.warn(`[QUANT-BOT] skipped ${idea.symbol}: ${q ? `${q.source} mark is delayed` : 'no contract mark'}`);
            continue;
          }

          const premium = q.mid;
          // Premium-based management: a -50% premium stop and a +100% target are the
          // desk-standard bracket for a directional long option, and they're expressed in
          // the same units as the fill so P&L is coherent.
          tradeable = {
            ...idea,
            assetType: 'option',
            optionType: idea.optionType,
            strikePrice: Number(idea.strikePrice),
            expiryDate: String(idea.expiryDate),
            currentPrice: premium,
            entryPrice: premium,
            targetPrice: Number((premium * 2).toFixed(2)),
            stopLoss: Number((premium * 0.5).toFixed(2)),
          };
        } else {
          // OPTIONS ONLY. This used to fall back to buying the underlying as shares
          // whenever an idea lacked a concrete contract, which is how UEC (134 shares,
          // $1,494) and INTA (37 shares, $1,486) ended up as nearly a third of the
          // account. Shares measure a different thing: an idea that is +3% on the
          // stock can be +90% or -100% on the contract, so mixing the two makes the
          // bot's record meaningless for the question it exists to answer.
          //
          // A signal with no contract is simply not tradeable by this bot. Skip it.
          skipped++;
          continue;
        }

        const res = await executeTradeIdea(portfolio.id, tradeable as any);
        if (res.success) {
          opened.push({
            symbol: pick.symbol,
            reason: `${pick.convictionBand}-band ${pick.convictionScore} · R:R 1:${(pick.riskRewardRatio ?? 0).toFixed(1)}`,
          });

          // Alert the entry. sendBotTradeEntryToDiscord has existed the whole time
          // and nothing ever called it from here, so the bot has been trading
          // silently — you only found out what it did by opening the page.
          // Never let a notification failure roll back a real fill.
          try {
            const { sendBotTradeEntryToDiscord } = await import('./discord-service');
            await sendBotTradeEntryToDiscord({
              symbol: pick.symbol,
              assetType: 'option',
              optionType: (tradeable as any).optionType ?? null,
              strikePrice: (tradeable as any).strikePrice ?? null,
              expiryDate: (tradeable as any).expiryDate ?? null,
              entryPrice: Number((tradeable as any).entryPrice ?? 0),
              quantity: Number(res.position?.quantity ?? 1),
              targetPrice: pick.targetPrice ?? null,
              stopLoss: pick.stopLoss ?? null,
              // Bot entry grades use the same 0–100 confidence index the
              // terminal displays, never the raw confluence-point total.
              confidence: convictionDisplayPercent(pick.convictionScore ?? 0),
              riskRewardRatio: pick.riskRewardRatio ?? null,
              analysis: pick.thesis ?? null,
              signals: (pick.layers ?? []).filter((l: any) => l.points > 0).slice(0, 4).map((l: any) => l.why).filter(Boolean),
              portfolio: 'Quant Bot',
              source: 'quant-bot',
            });
          } catch (err: any) {
            logger.warn(`[QUANT-BOT] entry alert failed for ${pick.symbol}: ${err?.message ?? err}`);
          }
        } else {
          skipped++;
          logger.debug(`[QUANT-BOT] skipped ${pick.symbol}: ${res.error ?? 'no fill'}`);
        }
      }
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] entry pass failed:', err);
  }

  // 3 — snapshot the curve so performance is measurable over time
  try { await recordEquitySnapshot(portfolio.id); } catch { /* non-fatal */ }

  const openCount = (await getOpenPositions(portfolio.id)).length;
  logger.info(`[QUANT-BOT] cycle: +${opened.length} opened, -${closed.length} closed, ${openCount} open`);
  // Persist the levels we left on. A gap exit is only half the trade the bot was
  // missing — the other half is noticing when that gap fills, because at that point
  // the reason for leaving is gone. This does NOT re-enter on its own: the
  // conviction engine still has to publish a fresh signal. It only clears the block,
  // which is the difference between a rule and a hunch.
  if (gapWatch.length) {
    try {
      const { setBotGapWatch } = await import('./gap-aware-exits');
      await setBotGapWatch(gapWatch);
      logger.info(`[QUANT-BOT] watching ${gapWatch.length} gap level(s) for re-entry`);
    } catch (err) {
      logger.warn('[QUANT-BOT] could not persist gap watch:', err);
    }
  }

  return { ranAt, portfolioId: portfolio.id, opened, closed, skipped, openCount, gapWatch };
}

export interface BotStatus {
  portfolioId: string;
  name: string;
  startingCapital: number;
  cashBalance: number;
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  /** All closed exits, before the UI limits the rendered history to 25 rows. */
  closedCount: number;
  openPositions: any[];
  closedPositions: any[];
  config: BotConfig;
}

export async function getBotStatus(cfg: BotConfig = DEFAULT_BOT_CONFIG): Promise<BotStatus | null> {
  // A GET must never create a portfolio or disguise a storage failure as an empty $10k book.
  // The explicit "Re-price & manage" cycle remains the only place that may create one.
  const portfolio: any = await findBotPortfolio();
  if (!portfolio?.id) return null;

  try { await updatePositionPrices(portfolio.id); } catch { /* stale marks are still usable */ }

  // These are the execution ledger. If any cannot be read, the caller must show an
  // unavailable state rather than inventing an empty portfolio from fallback values.
  const [open, closedAll, value] = await Promise.all([
    getOpenPositions(portfolio.id),
    getClosedPositions(portfolio.id),
    calculatePortfolioValue(portfolio.id),
  ]);

  const startingCapital = portfolio.startingCapital ?? cfg.startingCapital;
  const totalValue = value?.totalValue ?? portfolio.totalValue ?? startingCapital;

  return {
    portfolioId: portfolio.id,
    name: portfolio.name,
    startingCapital,
    cashBalance: value?.cashBalance ?? portfolio.cashBalance ?? 0,
    totalValue,
    // PortfolioValue reports UNREALISED only, so total P&L is measured against the
    // starting capital — that captures realised and unrealised together.
    totalPnL: totalValue - startingCapital,
    totalPnLPercent: startingCapital > 0 ? ((totalValue - startingCapital) / startingCapital) * 100 : 0,
    closedCount: closedAll.length,
    openPositions: open,
    closedPositions: closedAll.slice(0, 25),
    config: cfg,
  };
}
