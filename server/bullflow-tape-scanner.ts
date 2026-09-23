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
 * Levels are measured, not invented: invalidation is the tape day's low (if
 * the day that printed the buying breaks its own low, the thesis is wrong),
 * T1 is stated plainly as 2R off that invalidation.
 *
 * Short discipline: net-SOLD names are logged and skipped — no short is
 * published without an event catalyst (operator rule), and this scanner does
 * not check catalysts. The skip is visible in the log, not silent.
 */
import { logger } from './logger';
import { bullflowEnabled, getTopTickers } from './bullflow-service';
import { getTradierQuote } from './tradier-api';
import { ingestTradeIdea } from './trade-idea-ingestion';

/** Net premium (calls-minus-puts, aggressor-signed) required to publish. */
const TAPE_NET_MIN = Number(process.env.BULLFLOW_TAPE_IDEA_NET ?? 8_000_000);
/** Cap per sweep — the tape rarely has more than a handful of real stories. */
const MAX_IDEAS_PER_SCAN = 5;
/** Invalidation farther than this from entry is a bad structure — skip. */
const MAX_RISK_PCT = 0.08;

const fmtM = (n: number) => `${n < 0 ? '-' : '+'}$${(Math.abs(n) / 1e6).toFixed(1)}M`;

/**
 * Last price + the session low, Tradier first, Yahoo when Tradier is down
 * (it regularly is — the rest of the platform carries the same fallback).
 */
async function quoteWithDayLow(symbol: string): Promise<{ last: number; low: number } | null> {
  try {
    const q = await getTradierQuote(symbol);
    if (q && Number.isFinite(q.last) && q.last > 0 && Number.isFinite(q.low) && q.low > 0) {
      return { last: q.last, low: q.low };
    }
  } catch { /* fall through to Yahoo */ }
  try {
    const YahooFinance = (await import('yahoo-finance2')).default as any;
    const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const y: any = await yahooFinance.quote(symbol);
    const last = Number(y?.regularMarketPrice);
    const low = Number(y?.regularMarketDayLow);
    if (Number.isFinite(last) && last > 0 && Number.isFinite(low) && low > 0) {
      return { last, low };
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

  const longs = rows
    .filter((r) => Number(r.totalNetPremium) >= TAPE_NET_MIN)
    .sort((a, b) => Number(b.totalNetPremium) - Number(a.totalNetPremium));
  const shorts = rows.filter((r) => Number(r.totalNetPremium) <= -TAPE_NET_MIN);
  for (const r of shorts) {
    logger.info(
      `[TAPE-SCAN] ⛔ ${r.ticker} net SOLD ${fmtM(Number(r.totalNetPremium))} — short side skipped (no shorts without an event catalyst)`,
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

    try {
      const q = await quoteWithDayLow(symbol);
      if (!q) {
        logger.info(`[TAPE-SCAN] ${symbol}: no quote from any provider — skipped`);
        continue;
      }
      const entry = q.last;
      const stop = q.low < entry ? q.low : NaN;
      if (!Number.isFinite(stop)) {
        logger.info(`[TAPE-SCAN] ${symbol}: session low ≥ last — no usable invalidation, skipped`);
        continue;
      }
      const risk = entry - stop;
      if (risk / entry > MAX_RISK_PCT) {
        logger.info(
          `[TAPE-SCAN] ${symbol}: day low is ${((risk / entry) * 100).toFixed(1)}% away — structure too loose, skipped`,
        );
        continue;
      }
      const target = Number((entry + 2 * risk).toFixed(2));

      // Signal weights scale with how one-sided the measured tape is.
      const signals = [
        {
          type: 'aggressor_net_premium',
          weight: net >= 30e6 ? 26 : net >= 15e6 ? 22 : 18,
          description: `${fmtM(net)} net premium bought at the ask today (aggressor-measured)`,
        },
        {
          type: 'tape_decomposition',
          weight: callNet > 0 && callNet >= Math.abs(putNet) ? 12 : 6,
          description: `calls ${fmtM(callNet)} · puts ${fmtM(putNet)} — ${callNet > 0 && callNet >= Math.abs(putNet) ? 'call buying leads' : 'mixed composition'}`,
        },
        {
          type: 'measured_invalidation',
          weight: 8,
          description: `invalidation at the tape day's low $${stop.toFixed(2)} (${((risk / entry) * 100).toFixed(1)}% risk)`,
        },
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
        stopLoss: Number(stop.toFixed(2)),
        catalyst: `Aggressor tape: ${fmtM(net)} net premium bought today (calls ${fmtM(callNet)} / puts ${fmtM(putNet)}) — measured fills, not chain inference`,
        analysis:
          `Flow-primary idea: direction is read from actual ask-vs-bid fills on the options tape (Bullflow), ` +
          `not from a chart pattern — no technical setup is claimed. ${fmtM(net)} of net premium was bought in ${symbol} this session. ` +
          `Entry at last ($${entry.toFixed(2)}), invalidation at the session low ($${stop.toFixed(2)}) — if the day that printed the buying ` +
          `breaks its own low, the thesis is wrong. T1 $${target.toFixed(2)} is stated plainly as 2R off that invalidation, not a structural level.`,
        sourceMetadata: {
          scannerType: 'bullflow_tape',
          netPremium: net,
          callNetPremium: callNet,
          putNetPremium: putNet,
        },
      });

      if (result.success) {
        ingested++;
        logger.info(`[TAPE-SCAN] 📤 published ${symbol} — ${fmtM(net)} net bought`);
      } else {
        logger.info(`[TAPE-SCAN] ${symbol} not published: ${result.reason}`);
      }
    } catch (err: any) {
      logger.warn(`[TAPE-SCAN] ${symbol} failed: ${err?.message ?? err}`);
    }
  }

  logger.info(`[TAPE-SCAN] sweep done — ${ingested} tape idea(s) published from ${longs.length} qualifying name(s)`);
  return ingested;
}
