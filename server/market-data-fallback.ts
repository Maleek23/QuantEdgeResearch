/**
 * MARKET DATA FALLBACK — one place the scorers can ask for bars and quotes
 * without depending on a single provider that is currently down.
 *
 * WHY
 * Five of the universal engine's seven scorers were returning their default 50
 * because every one of them called yahoo-finance2 directly and Yahoo has been
 * answering 429. Measured on ADSK:
 *
 *   technical     58   ← the only scorer with live data
 *   fundamental   50   default
 *   quantitative  50   "Data unavailable"
 *   ml            50   not implemented
 *   orderFlow     50   "Order flow data unavailable"
 *   sentiment     54   no analyst data
 *   catalysts     50   "No upcoming earnings data"  ← on a stock reporting that night
 *   ─────────────────
 *   OVERALL       57   presented as a considered grade
 *
 * A score built from one real reading and six placeholders is worse than no
 * score, because it looks deliberate. This does not fix every scorer, but it
 * removes the single shared cause: no working source for bars and quotes.
 *
 * ORDER
 *   bars    Polygon grouped-daily (via liquid-universe) → Yahoo
 *   quote   Finnhub → Yahoo
 *
 * Polygon leads for bars because one request per session covers 2000+ names and
 * it is the same series every backtest in research/ uses — so the scorers and
 * the research finally read identical data. They did not before, which means a
 * rule validated offline could behave differently live.
 *
 * PROVENANCE (SR 11-7 F4.1 / P0-5)
 * Every bar and quote now says which provider answered (`source`) and whether
 * that was a fallback down the chain (`isFallback`). Bars also carry
 * `adjusted`: Massive/Polygon grouped-daily is requested with `adjusted=true`;
 * the Yahoo path returns `close`, not `adjClose`, so dividends are NOT adjusted
 * out of it (`adjusted: false`). A consumer mixing the two can now tell.
 * Additive fields only — no existing reader changes behaviour.
 */
import { logger } from './logger';

export type BarSource = 'polygon' | 'yahoo';
export type QuoteSource = 'finnhub' | 'yahoo' | 'bars';

export interface Bar {
  date: Date; open: number; high: number; low: number; close: number; volume: number;
  /** Provider that produced this bar. */
  source?: BarSource;
  /** True when the primary (Polygon grouped-daily) did not answer. */
  isFallback?: boolean;
  /** true = provider was asked for adjusted bars; false = raw closes (Yahoo `close`, not `adjClose`). */
  adjusted?: boolean;
}

export interface FallbackQuote {
  price: number;
  changePct: number;
  prevClose: number;
  /** Provider that produced this quote ('bars' = derived from the last two daily closes). */
  source: QuoteSource;
  /** True when the primary (Finnhub) did not answer. */
  isFallback: boolean;
}

/** Daily bars, newest last. Returns [] rather than throwing — callers degrade. */
export async function getBars(symbol: string, days = 130): Promise<Bar[]> {
  const sym = symbol.toUpperCase();

  try {
    const { getUniverseBars, getLiquidSymbols, loadLiquidUniverseFromDisk } = await import('./liquid-universe');
    if (getLiquidSymbols().length === 0) await loadLiquidUniverseFromDisk();
    const all = await getUniverseBars(Math.max(days, 60));
    const ub = all.get(sym);
    if (ub && ub.length >= 30) {
      return ub.map((b: any) => ({
        date: new Date(b.time * 1000),
        open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
        source: 'polygon' as const, isFallback: false, adjusted: true,
      }));
    }
  } catch (e: any) {
    logger.debug(`[MKT-FALLBACK] universe bars miss for ${sym}: ${e?.message ?? e}`);
  }

  try {
    const { default: YahooFinance } = await import('yahoo-finance2');
    const yf = new YahooFinance();
    const start = new Date(); start.setDate(start.getDate() - Math.ceil(days * 1.5));
    const h: any[] = await yf.historical(sym, { period1: start, period2: new Date(), interval: '1d' });
    if (h?.length) {
      return h.map((b) => ({
        date: new Date(b.date), open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
        // `close` is Yahoo's unadjusted-for-dividends series (adjClose is ignored here).
        source: 'yahoo' as const, isFallback: true, adjusted: false,
      }));
    }
  } catch (e: any) {
    logger.debug(`[MKT-FALLBACK] yahoo historical failed for ${sym}: ${e?.message ?? e}`);
  }

  return [];
}

/** Last price + day change. Null when no source answers. */
export async function getQuote(symbol: string): Promise<FallbackQuote | null> {
  const sym = symbol.toUpperCase();

  try {
    const { getFinnhubQuote } = await import('./finnhub-adapter');
    const q = await getFinnhubQuote(sym);
    if (q?.price) {
      const prev = q.changePct !== 0 ? q.price / (1 + q.changePct / 100) : q.price;
      return { price: q.price, changePct: q.changePct, prevClose: prev, source: 'finnhub', isFallback: false };
    }
  } catch { /* next */ }

  try {
    const { default: YahooFinance } = await import('yahoo-finance2');
    const yf = new YahooFinance();
    const q: any = await yf.quote(sym);
    if (q?.regularMarketPrice) {
      return {
        price: q.regularMarketPrice,
        changePct: q.regularMarketChangePercent ?? 0,
        prevClose: q.regularMarketPreviousClose ?? q.regularMarketPrice,
        source: 'yahoo',
        isFallback: true,
      };
    }
  } catch { /* fall through */ }

  // Last resort: derive from the bars we may already have.
  const bars = await getBars(sym, 5);
  if (bars.length >= 2) {
    const c = bars[bars.length - 1].close, p = bars[bars.length - 2].close;
    // Not a live quote: the last daily close, from whichever bar source answered.
    return { price: c, changePct: p > 0 ? ((c - p) / p) * 100 : 0, prevClose: p, source: 'bars', isFallback: true };
  }
  return null;
}
