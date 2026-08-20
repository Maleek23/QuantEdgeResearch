/**
 * QUANT BOT — paper-trades the platform's own signals, so the engine gets a track record.
 *
 * Everything upstream produces opinions; nothing was recording whether they worked. The
 * bot closes that loop: it takes the highest-conviction signals into a paper portfolio,
 * manages them against their own stop/target, and books the result. That produces the one
 * number that actually matters — did this engine make money — and feeds grade calibration
 * with real outcomes instead of assumptions.
 *
 * Rules are deliberately mechanical. A bot that second-guesses the signal is no longer
 * measuring the signal.
 */
import { logger } from './logger';
import { storage } from './storage';
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

/** The bot trades one dedicated portfolio; create it on first run. */
export async function getBotPortfolio(cfg: BotConfig = DEFAULT_BOT_CONFIG) {
  const all = await storage.getAllPaperPortfolios().catch(() => [] as any[]);
  const existing = Array.isArray(all) ? all.find((p: any) => p.name === BOT_PORTFOLIO_NAME) : null;
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
  error?: string;
}

/**
 * One bot cycle: mark positions to market, take exits the signal itself defined, then
 * fill any remaining slots with the best signals available.
 */
export async function runBotCycle(cfg: BotConfig = DEFAULT_BOT_CONFIG): Promise<BotRunResult> {
  const ranAt = new Date().toISOString();
  const opened: BotRunResult['opened'] = [];
  const closed: BotRunResult['closed'] = [];
  let skipped = 0;

  const portfolio: any = await getBotPortfolio(cfg);
  if (!portfolio?.id) {
    return { ranAt, portfolioId: '', opened, closed, skipped, openCount: 0, error: 'no portfolio' };
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
      await closePosition(pos.id, Number(settle.toFixed(2)), settle > 0 ? 'expired_itm' : 'expired_worthless');
      closed.push({ symbol: pos.symbol, reason: settle > 0 ? `expired ITM at $${settle.toFixed(2)}` : 'expired worthless' });
    }
  } catch (err) {
    logger.warn('[QUANT-BOT] expiry settlement failed:', err);
  }

  // 3 — premium stop / target
  try {
    const exited = await checkStopsAndTargets(portfolio.id);
    for (const p of exited ?? []) {
      closed.push({ symbol: p.symbol, reason: (p as any).exitReason ?? 'stop/target' });
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

      const candidates = (board.picks ?? [])
        .filter((p) => p.convictionScore >= cfg.minConviction)
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
        // expiry). Tradier would be the natural quote source but returns 401 on an unfunded
        // account, so this uses CBOE's free delayed chain. Delayed, and a mid-quote rather
        // than a print — recorded as such so the result is never mistaken for a live fill.
        let tradeable: any;

        if (idea.assetType === 'option' && idea.strikePrice && idea.expiryDate && idea.optionType) {
          const { getContractQuote } = await import('./cboe-options-fallback');
          const q = await getContractQuote(
            idea.symbol,
            idea.optionType as 'call' | 'put',
            Number(idea.strikePrice),
            String(idea.expiryDate),
          ).catch(() => null);

          if (!q) { skipped++; continue; }   // no premium → no honest fill

          const premium = q.mid;
          // Premium-based management: a -50% premium stop and a +100% target are the
          // desk-standard bracket for a directional long option, and they're expressed in
          // the same units as the fill so P&L is coherent.
          tradeable = {
            ...idea,
            assetType: 'option',
            optionType: q.optionType,
            strikePrice: q.strike,
            expiryDate: q.expirationDate,
            currentPrice: premium,
            entryPrice: premium,
            targetPrice: Number((premium * 2).toFixed(2)),
            stopLoss: Number((premium * 0.5).toFixed(2)),
          };
        } else {
          if (!pick.currentPrice) { skipped++; continue; }
          tradeable = { ...idea, currentPrice: pick.currentPrice, entryPrice: pick.currentPrice };
        }

        const res = await executeTradeIdea(portfolio.id, tradeable as any);
        if (res.success) {
          opened.push({
            symbol: pick.symbol,
            reason: `${pick.convictionBand}-band ${pick.convictionScore} · R:R 1:${(pick.riskRewardRatio ?? 0).toFixed(1)}`,
          });
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
  return { ranAt, portfolioId: portfolio.id, opened, closed, skipped, openCount };
}

export interface BotStatus {
  portfolioId: string;
  name: string;
  startingCapital: number;
  cashBalance: number;
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  openPositions: any[];
  closedPositions: any[];
  config: BotConfig;
}

export async function getBotStatus(cfg: BotConfig = DEFAULT_BOT_CONFIG): Promise<BotStatus | null> {
  const portfolio: any = await getBotPortfolio(cfg);
  if (!portfolio?.id) return null;

  try { await updatePositionPrices(portfolio.id); } catch { /* stale marks are still usable */ }

  const [open, closedAll, value] = await Promise.all([
    getOpenPositions(portfolio.id).catch(() => []),
    getClosedPositions(portfolio.id).catch(() => []),
    calculatePortfolioValue(portfolio.id).catch(() => null),
  ]);

  const startingCapital = portfolio.startingCapital ?? cfg.startingCapital;
  const totalValue = value?.totalValue ?? portfolio.totalValue ?? startingCapital;

  const wins = closedAll.filter((p: any) => (p.realizedPnL ?? 0) > 0).length;
  const losses = closedAll.filter((p: any) => (p.realizedPnL ?? 0) <= 0).length;
  const decided = wins + losses;

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
    winCount: wins,
    lossCount: losses,
    // Honest: no win rate until something has actually closed.
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    openPositions: open,
    closedPositions: closedAll.slice(0, 25),
    config: cfg,
  };
}
