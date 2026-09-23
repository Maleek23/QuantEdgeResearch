/**
 * BULLFLOW TAPE SCANNER — the tape feeds the board directly.
 *
 * Why this exists: on 2026-09-09 META printed +$19M net bought (#1 on the
 * aggressor leaders) and the board showed metals and biotech, because every
 * idea path was price-pattern-first — a name with heavy accumulation but a
 * quiet chart was structurally invisible. Same again 2026-09-22: rotation
 * said semis +11.8% and the board answered with oil bull-flags.
 *
 * This scanner reads the Bullflow aggressor tape (measured ask-vs-bid fills,
 * not chain-snapshot inference) and publishes the heaviest one-sided names as
 * flow-primary ideas through the standard ingestion gates (dedup, loss
 * cooldown, cross-source held-check). It claims NO technical pattern — the
 * catalyst text says exactly what was measured and nothing else.
 *
 * Levels are measured, not invented: invalidation is the session low, falling
 * back to the prior close (gap-fill = thesis wrong); T1 is stated plainly as
 * 2R off that invalidation.
 *
 * Short discipline: net-SOLD names are logged and skipped — no short is
 * published without an event catalyst (operator rule), and this scanner does
 * not check catalysts. The skip is visible in the log, not silent.
 *
 * Review hardening (2026-09-23 adversarial pass):
 * - Bullflow net premium is SESSION-CUMULATIVE, so without memory a symbol
 *   whose idea stopped out would republish all day off the same morning tape
 *   at worse entries. A per-market-date decision map prevents any second
 *   publication attempt for a symbol the same day.
 * - The decision map is also checked BEFORE quotes are fetched, so blocked
 *   names stop costing Tradier/Yahoo calls on all ~39 daily sweeps.
 * - Leaders older than STALE_TAPE_MAX_MS (cache serving stale through a
 *   provider outage) are refused rather than narrated as "today's tape".
 * - Composition requirement: call-led tape, or ≥$30M net regardless — sized
 *   so every published idea genuinely clears the options_flow confidence
 *   floor (75) instead of slipping through the 3-signal bypass at 65.
 */
import { logger } from './logger';
import { bullflowEnabled, getTopTickers, getNetPremiumToday } from './bullflow-service';
import { FAVORITE_TICKERS } from '@shared/leadership-universe';
import { getTradierQuote } from './tradier-api';
import { ingestTradeIdea } from './trade-idea-ingestion';

/** Net premium (calls-minus-puts, aggressor-signed) required to publish. */
const TAPE_NET_MIN = Number(process.env.BULLFLOW_TAPE_IDEA_NET ?? 8_000_000);
/**
 * Operator observation 2026-09-23: heavy flow usually has a technical setup
 * behind it. When the TA engine independently confirms (bullish bias +
 * non-downtrend structure), the flow bar drops to this level — the two
 * measurements corroborate each other, and the card says what the chart
 * shows. Flow below this never publishes regardless of the chart.
 */
const TAPE_NET_MIN_WITH_TA = Number(process.env.BULLFLOW_TAPE_IDEA_NET_TA ?? 5_000_000);
/** Above this net, composition no longer matters — the tape is loud enough. */
const TAPE_NET_ANY_COMPOSITION = 30_000_000;
/** Cap per sweep — the tape rarely has more than a handful of real stories. */
const MAX_IDEAS_PER_SCAN = 5;
/** Invalidation farther than this from entry is a bad structure — skip. */
const MAX_RISK_PCT = 0.08;
/**
 * Invalidation closer than this is not a structure either — early in the
 * session the day low is minutes old and sits on top of last. Fall back to
 * the prior close (gap-fill = thesis wrong), else skip this sweep.
 */
const MIN_RISK_PCT = 0.012;
/** Refuse leader data older than this — stale cache is not "today's tape". */
const STALE_TAPE_MAX_MS = 30 * 60_000;

const fmtM = (n: number) => `${n < 0 ? '-' : '+'}$${(Math.abs(n) / 1e6).toFixed(1)}M`;

/**
 * One decision per symbol per market date. 'published' and 'blocked' are
 * terminal for the day; transient skips (no quote, no structure band, DB
 * hiccup) are NOT recorded so those names retry on later sweeps. Persisted
 * to disk so a process restart cannot re-publish a name that already
 * resolved today off the same cumulative tape.
 */
const dayDecisions = new Map<string, { date: string; verdict: 'published' | 'blocked' | 'short_logged' }>();
const DECISIONS_FILE = 'server/data/tape-scan-decisions.json';
/** Across all ~39 sweeps — a broad rally day must not mint 25 tape ideas. */
const MAX_DAILY_PUBLISH = 8;
let decisionsLoaded = false;

function marketDateET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function loadDecisions(today: string): Promise<void> {
  if (decisionsLoaded) return;
  decisionsLoaded = true;
  try {
    const fs = await import('fs/promises');
    const raw = JSON.parse(await fs.readFile(DECISIONS_FILE, 'utf8'));
    if (raw?.date === today && raw.entries) {
      for (const [sym, verdict] of Object.entries(raw.entries)) {
        dayDecisions.set(sym, { date: today, verdict: verdict as any });
      }
      logger.info(`[TAPE-SCAN] restored ${dayDecisions.size} day decision(s) from disk`);
    }
  } catch { /* first run of the day, or no file — fine */ }
}

async function saveDecisions(today: string): Promise<void> {
  try {
    const fs = await import('fs/promises');
    const entries: Record<string, string> = {};
    for (const [sym, d] of dayDecisions.entries()) if (d.date === today) entries[sym] = d.verdict;
    await fs.writeFile(DECISIONS_FILE, JSON.stringify({ date: today, entries }));
  } catch { /* best-effort — memory map still guards this process */ }
}

function publishedToday(today: string): number {
  let n = 0;
  for (const d of dayDecisions.values()) if (d.date === today && d.verdict === 'published') n++;
  return n;
}

/** Ingestion rejections that the cumulative tape cannot change today. */
const TERMINAL_REASONS = /Duplicate|Already held|Loss cooldown|Leveraged\/inverse/i;

let yahooClient: any = null;
async function getYahoo(): Promise<any> {
  if (!yahooClient) {
    const YahooFinance = (await import('yahoo-finance2')).default as any;
    yahooClient = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  }
  return yahooClient;
}

/**
 * Last price + session low + prior close; Tradier first, Yahoo when Tradier
 * is down (it regularly is — the rest of the platform carries the same
 * fallback).
 */
export async function quoteWithDayLow(symbol: string): Promise<{ last: number; low: number; prevClose: number } | null> {
  try {
    const q = await getTradierQuote(symbol);
    if (q && Number.isFinite(q.last) && q.last > 0 && Number.isFinite(q.low) && q.low > 0) {
      return { last: q.last, low: q.low, prevClose: Number(q.prevclose) || NaN };
    }
  } catch { /* fall through to Yahoo */ }
  try {
    const y: any = await (await getYahoo()).quote(symbol);
    const last = Number(y?.regularMarketPrice);
    const low = Number(y?.regularMarketDayLow);
    if (Number.isFinite(last) && last > 0 && Number.isFinite(low) && low > 0) {
      return { last, low, prevClose: Number(y?.regularMarketPreviousClose) || NaN };
    }
  } catch { /* both providers failed */ }
  return null;
}

export async function runBullflowTapeScan(): Promise<number> {
  if (!bullflowEnabled()) return 0;

  const top = await getTopTickers('net_premium', { excludeEtfs: true });
  const rows: any[] = top?.rows ?? [];
  if (!rows.length) {
    logger.info('[TAPE-SCAN] leaders empty — no session tape yet');
    return 0;
  }
  const generatedAt = Date.parse(String(top?.generatedAt ?? ''));
  if (!Number.isFinite(generatedAt)) {
    // Fail CLOSED: an unparseable timestamp means the freshness defense is
    // blind, and the cache layer serves stale payloads through outages.
    logger.warn('[TAPE-SCAN] leader payload has no parseable generatedAt — refusing to publish unverifiable tape');
    return 0;
  }
  if (Date.now() - generatedAt > STALE_TAPE_MAX_MS) {
    logger.warn(
      `[TAPE-SCAN] leader data is ${Math.round((Date.now() - generatedAt) / 60_000)} min old (provider outage?) — refusing to publish off stale tape`,
    );
    return 0;
  }

  const today = marketDateET();
  await loadDecisions(today);

  // FAVORITES interrogation: the operator's names get a per-symbol tape read
  // every sweep even when they don't crack the top-30 leaderboard. Reads are
  // 3-min cached in the service (~2 uncached calls/min across the day). The
  // same publish bars apply — favorites earn cards, they don't get them.
  const onLeaderboard = new Set(rows.map((r: any) => String(r.ticker).toUpperCase()));
  for (const fav of FAVORITE_TICKERS) {
    if (onLeaderboard.has(fav)) continue;
    if (dayDecisions.get(fav)?.date === today) continue;
    try {
      const read: any = await getNetPremiumToday(fav);
      if (!read) continue;
      const calls = Number(read.callsNetPremium ?? 0);
      const puts = Number(read.putsNetPremium ?? 0);
      rows.push({ ticker: fav, totalNetPremium: calls - puts, callNetPremium: calls, putNetPremium: puts });
    } catch { /* favorite read failed — next sweep */ }
  }

  if (publishedToday(today) >= MAX_DAILY_PUBLISH) {
    logger.info(`[TAPE-SCAN] daily publish cap (${MAX_DAILY_PUBLISH}) reached — sweep is read-only`);
    return 0;
  }
  const longs = rows
    .filter((r) => Number(r.totalNetPremium) >= TAPE_NET_MIN_WITH_TA)
    .sort((a, b) => Number(b.totalNetPremium) - Number(a.totalNetPremium));
  for (const r of rows.filter((x) => Number(x.totalNetPremium) <= -TAPE_NET_MIN)) {
    const sym = String(r.ticker).toUpperCase();
    if (dayDecisions.get(sym)?.date === today) continue; // one line per day, not 39
    dayDecisions.set(sym, { date: today, verdict: 'short_logged' });
    logger.info(
      `[TAPE-SCAN] \u26d4 ${sym} net SOLD ${fmtM(Number(r.totalNetPremium))} \u2014 short side skipped (no shorts without an event catalyst)`,
    );
  }
  if (!longs.length) {
    logger.info(`[TAPE-SCAN] no name over ${fmtM(TAPE_NET_MIN)} net bought this sweep`);
    return 0;
  }

  let ingested = 0;
  for (const r of longs) {
    if (ingested >= MAX_IDEAS_PER_SCAN) break;
    const symbol = String(r.ticker).toUpperCase();
    const net = Number(r.totalNetPremium);
    const callNet = Number(r.callNetPremium ?? 0);
    const putNet = Number(r.putNetPremium ?? 0);

    // Terminal decision already made today — costs nothing, not even a quote.
    const prior = dayDecisions.get(symbol);
    if (prior && prior.date === today) continue;

    // Composition, sign-aware: calls BOUGHT (callNet > 0) and puts SOLD
    // (putNet < 0) are both bullish dollars; calls sold / puts bought are
    // bearish dollars. The old check treated put SELLING as opposition and
    // wrongly skipped INTC (+$8.2M calls bought, $12.6M puts sold). Require
    // the bullish side to carry >=2/3 of the gross, or >=$30M net overrides.
    const bullDollars = Math.max(callNet, 0) + Math.max(-putNet, 0);
    const bearDollars = Math.max(-callNet, 0) + Math.max(putNet, 0);
    const bullishLed = bullDollars >= 2 * bearDollars;
    const callsBought = callNet > 0;
    if (!bullishLed && net < TAPE_NET_ANY_COMPOSITION) {
      dayDecisions.set(symbol, { date: today, verdict: 'blocked' });
      logger.info(
        `[TAPE-SCAN] ${symbol}: ${fmtM(net)} net but two-sided tape (bullish ${fmtM(bullDollars)} vs bearish ${fmtM(bearDollars)}) — skipped for today`,
      );
      continue;
    }
    const compText =
      `${callsBought ? `calls bought ${fmtM(callNet)}` : `calls sold ${fmtM(callNet)}`}` +
      ` · ${putNet < 0 ? `puts sold ${fmtM(Math.abs(putNet))}` : `puts bought ${fmtM(putNet)}`}`;

    try {
      const q = await quoteWithDayLow(symbol);
      if (!q) {
        logger.info(`[TAPE-SCAN] ${symbol}: no quote from any provider — will retry next sweep`);
        continue;
      }
      const entry = q.last;
      // Measured invalidation, in preference order: the session low, then the
      // prior close (gap-fill = thesis wrong). Each must leave a real but
      // bounded risk; a stop minutes old on top of last is not a structure.
      const riskOk = (s: number) =>
        Number.isFinite(s) && s > 0 && s < entry &&
        (entry - s) / entry >= MIN_RISK_PCT && (entry - s) / entry <= MAX_RISK_PCT;
      let stop = NaN;
      let stopBasis = '';
      if (riskOk(q.low)) { stop = q.low; stopBasis = 'session low'; }
      else if (riskOk(q.prevClose)) { stop = q.prevClose; stopBasis = 'prior close (gap-fill invalidation)'; }
      if (!Number.isFinite(stop)) {
        logger.info(
          `[TAPE-SCAN] ${symbol}: no measured invalidation in the ${(MIN_RISK_PCT * 100).toFixed(1)}–${(MAX_RISK_PCT * 100).toFixed(0)}% band (low $${q.low}, prevClose $${q.prevClose}) — will retry next sweep`,
        );
        continue;
      }
      // Independent chart read. Below the standalone flow bar, a bullish TA
      // confirmation is REQUIRED; above it, it is extra evidence on the card.
      let taConfirm: { score: number; why: string } | null = null;
      try {
        const { getCachedTARead } = await import('./ta-engine');
        const ta: any = await getCachedTARead(symbol, '3mo', '1d');
        if (ta?.bias?.direction === 'bullish' && ta?.structure?.trend !== 'downtrend') {
          taConfirm = {
            score: Number(ta.bias.score) || 0,
            why: [ta.structure?.trend ? `structure ${ta.structure.trend}` : null, ...(ta.bias.confluence ?? []).slice(0, 2)].filter(Boolean).join(' · '),
          };
        }
      } catch { /* TA unavailable — standalone flow bar applies */ }
      if (net < TAPE_NET_MIN && !taConfirm) {
        logger.info(`[TAPE-SCAN] ${symbol}: ${fmtM(net)} net is below the ${fmtM(TAPE_NET_MIN)} standalone bar and the chart does not confirm — will retry next sweep`);
        continue;
      }

      // Round the stop first, then derive the target from the ROUNDED risk —
      // otherwise the published triple contradicts its own "2R" claim.
      const roundedStop = Number(stop.toFixed(2));
      const risk = entry - roundedStop;
      const target = Number((entry + 2 * risk).toFixed(2));

      // Weights are sized so every combination that can reach this point
      // clears the options_flow confidence floor (75) on the ingestion
      // formula — the floor is real here, not bypassed.
      const signals = [
        {
          type: 'aggressor_net_premium',
          weight: net >= 30e6 ? 32 : net >= 15e6 ? 28 : net >= TAPE_NET_MIN ? 24 : 22,
          description: `${fmtM(net)} net premium bullish today (aggressor-measured)`,
        },
        {
          type: 'tape_decomposition',
          weight: bullishLed ? 12 : 6,
          description: `${compText} — ${bullishLed ? 'bullish flow leads' : 'two-sided, size overrides'}`,
        },
        {
          type: 'measured_invalidation',
          weight: 8,
          description: `invalidation at the ${stopBasis} $${roundedStop.toFixed(2)} (${((risk / entry) * 100).toFixed(1)}% risk)`,
        },
        ...(taConfirm ? [{
          type: 'chart_confirmation',
          weight: 8,
          description: `chart independently confirms: ${taConfirm.why || `bias +${taConfirm.score}`}`,
        }] : []),
      ];

      const result = await ingestTradeIdea({
        source: 'options_flow',
        symbol,
        assetType: 'stock',
        direction: 'bullish',
        signals,
        holdingPeriod: 'swing',
        currentPrice: entry,
        targetPrice: target,
        stopLoss: roundedStop,
        catalyst: `Aggressor tape: ${fmtM(net)} net bullish today (${compText}) — measured fills, not chain inference`,
        analysis:
          `Flow-primary idea: direction is read from actual ask-vs-bid fills on the options tape (Bullflow), ` +
          `not from a chart pattern — no technical setup is claimed. ${symbol}'s tape this session: ${compText} (${fmtM(net)} net bullish). ` +
          `Entry at last ($${entry.toFixed(2)}), invalidation at the ${stopBasis} ($${roundedStop.toFixed(2)}) — if the day that printed the buying ` +
          `gives that level back, the thesis is wrong. T1 $${target.toFixed(2)} is stated plainly as 2R off that invalidation, not a structural level.`,
        sourceMetadata: {
          scannerType: 'bullflow_tape',
          netPremium: net,
          callNetPremium: callNet,
          putNetPremium: putNet,
        },
      });

      if (result.success) {
        ingested++;
        dayDecisions.set(symbol, { date: today, verdict: 'published' });
        logger.info(`[TAPE-SCAN] 📤 published ${symbol} — ${fmtM(net)} net bought`);
      } else if (TERMINAL_REASONS.test(String(result.reason ?? ''))) {
        // Duplicate / already held / loss cooldown / blocked wrapper — the
        // cumulative tape cannot change these answers today.
        dayDecisions.set(symbol, { date: today, verdict: 'blocked' });
        logger.info(`[TAPE-SCAN] ${symbol} not published: ${result.reason} — done for today`);
      } else {
        // Transient (DB hiccup, generator null) — retry on a later sweep
        // rather than silently starving the day's strongest name.
        logger.info(`[TAPE-SCAN] ${symbol} not published: ${result.reason} — will retry next sweep`);
      }
    } catch (err: any) {
      logger.warn(`[TAPE-SCAN] ${symbol} failed: ${err?.message ?? err}`);
    }
  }

  await saveDecisions(today);
  logger.info(`[TAPE-SCAN] sweep done — ${ingested} tape idea(s) published from ${longs.length} qualifying name(s)`);
  return ingested;
}
