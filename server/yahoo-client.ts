/**
 * YAHOO CLIENT — one throttled door to a provider we were kicking down.
 *
 * 37 files called query1/query2.finance.yahoo.com directly and two of them went
 * through the shared rate limiter. The result was predictable: scanners, the
 * conviction rebuild, the rotation map and the quote service all bursting at once,
 * Yahoo returning 429, and then EVERY price on the platform freezing — because
 * Tradier is 401 on an unfunded account, so Yahoo is not a fallback, it is the
 * only source. A user watching a live board sees numbers that never move and
 * concludes the app is broken. It is, and we broke it ourselves.
 *
 * Everything goes through here now: one global limiter, a short cache so repeated
 * asks for the same symbol cost one request, host failover, and one retry on a
 * 429 rather than a burst of them.
 */
import { logger } from './logger';
import { rateLimited, cachedFetch } from './provider-cache';
import { dayChangeFromIntradayChart, type QuoteSession } from '../shared/price-change';
import { canonicalChartSymbol } from '../shared/index-symbols';

const HOSTS = ['query2', 'query1'] as const;

/** Yahoo tolerates roughly this cadence before it starts refusing. */
const MIN_GAP_MS = 350;

/** Same symbol asked for twice inside this window costs one request. */
const QUOTE_TTL_MS = 8_000;

let _throttled429Until = 0;

/**
 * Cash indices have no equity ticker, so Yahoo only knows them by their caret
 * symbol. The terminal keeps the canonical names (SPX, VIX) and callers pass
 * them straight through — measured over 2026-09-24..29 in production, that was
 * 2,511 `404`s on /chart/VIX and /chart/SPX, each one also costing a slot in
 * the shared rate budget that then 429'd the requests that mattered.
 *
 * Translate only at the provider boundary. DJX and XSP are deliberately absent:
 * they are fractional versions of an index (DJIA/100, SPX/10), so mapping them
 * to the parent would return a price ten or a hundred times too large.
 */
const YAHOO_INDEX_SYMBOLS: Record<string, string> = {
  SPX: '^GSPC',
  // SPXW (weeklies/0DTE) and NDXP settle on the cash index: chart the index.
  SPXW: '^GSPC',
  GSPC: '^GSPC',
  VIX: '^VIX',
  VIX9D: '^VIX9D',
  VIX3M: '^VIX3M',
  VVIX: '^VVIX',
  NDX: '^NDX',
  NDXP: '^NDX',
  RUT: '^RUT',
  DJI: '^DJI',
};

/** Provider-boundary symbol for Yahoo's chart API ("SPX" → "^GSPC"). Idempotent. */
export function toYahooSymbol(symbol: string): string {
  // "$SPX", "SPX.X", "^GSPC", "SPXW" → SPX first (shared/index-symbols.ts), then
  // the caret name. A raw "$SPX" used to reach Yahoo verbatim and 404.
  const canon = canonicalChartSymbol(symbol);
  return YAHOO_INDEX_SYMBOLS[canon] ?? canon;
}

/**
 * Raw throttled GET against Yahoo's chart API. Returns null rather than throwing:
 * a missing quote must degrade a panel, never take down a request that was
 * fetching twenty other things.
 */
export async function yahooChart(
  rawSymbol: string,
  opts: { range?: string; interval?: string; includePrePost?: boolean } = {},
): Promise<any | null> {
  const symbol = toYahooSymbol(rawSymbol);
  const range = opts.range ?? '1d';
  const interval = opts.interval ?? '1m';
  const pre = opts.includePrePost ? '&includePrePost=true' : '';
  const key = `yahoo:${symbol}:${range}:${interval}:${pre}`;

  // While Yahoo is actively refusing, stop asking. Continuing to hammer a host
  // that just 429'd is what turns a brief throttle into a long one.
  if (Date.now() < _throttled429Until) {
    logger.debug(`[YAHOO] backing off, skipping ${symbol}`);
    return null;
  }

  return cachedFetch(key, QUOTE_TTL_MS, async () =>
    rateLimited('yahoo', MIN_GAP_MS, async () => {
      for (const host of HOSTS) {
        try {
          const r = await fetch(
            `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${pre}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } },
          );
          if (r.status === 429) {
            // Sit out a window rather than rotating hosts into the same wall.
            _throttled429Until = Date.now() + 30_000;
            logger.warn(`[YAHOO] 429 on ${symbol} — backing off 30s`);
            return null;
          }
          if (!r.ok) continue;
          const j = await r.json();
          if (j?.chart?.result?.[0]) return j;
        } catch {
          // try the other host
        }
      }
      return null;
    }),
  );
}

export interface YahooQuote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  at: number;
  /** Session of the latest print (shared/price-change.ts). */
  session: QuoteSession;
  regularMarketPrice: number | null;
  regularChangePercent: number | null;
}

/**
 * A single current quote, or null when the provider genuinely has nothing.
 * Price/prev-close/% come from shared/price-change.ts — the one definition of
 * "% change today" (latest print, pre/post included, vs the prior regular close).
 */
export async function yahooQuote(symbol: string): Promise<YahooQuote | null> {
  const j = await yahooChart(symbol, { range: '1d', interval: '1m', includePrePost: true });
  const res = j?.chart?.result?.[0];
  const dc = dayChangeFromIntradayChart(res);
  if (!dc) return null;
  const m = res.meta;
  // Session volume, not the last 1-minute bar's. This used to return the newest
  // bar's volume, so every "Volume" stat (and its ×20d-average ratio) showed one
  // minute of trading as the day's. regularMarketVolume is the regular session's
  // cumulative volume; before today's open it is still YESTERDAY's, so it is
  // reported as 0 ("not reported yet") rather than passed off as today's.
  const sessionVolume = sessionVolumeFromMeta(m);
  return {
    symbol: symbol.toUpperCase(),
    price: dc.price,
    previousClose: dc.previousClose,
    change: dc.change,
    changePercent: dc.changePercent,
    volume: sessionVolume,
    // Preserve the market's timestamp. Consumer UI uses this to distinguish a
    // fresh print from a fresh HTTP response that happened to contain old data.
    // No bar (an index before the open): the print is regularMarketTime, never
    // "now" — stamping the response time made yesterday's SPX close look live.
    at: dc.at ?? (Number(m.regularMarketTime) > 0 ? Number(m.regularMarketTime) * 1000 : Date.now()),
    session: dc.session,
    regularMarketPrice: dc.regularMarketPrice,
    regularChangePercent: dc.regularChangePercent,
  };
}

/** Current regular session's cumulative volume from chart meta; 0 before the open or when absent. */
export function sessionVolumeFromMeta(m: any): number {
  const v = Number(m?.regularMarketVolume);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const rmt = Number(m?.regularMarketTime);
  const regStart = Number(m?.currentTradingPeriod?.regular?.start);
  if (Number.isFinite(rmt) && Number.isFinite(regStart) && rmt < regStart) return 0;
  return v;
}

/** Are we currently in a back-off window? Surfaced so the UI can say "stale". */
export function yahooBackoffRemainingMs(): number {
  return Math.max(0, _throttled429Until - Date.now());
}

/**
 * Yahoo's predefined screeners — the only candidate source on hand that returns
 * names we have NOT already thought of. Everything else in the platform reads
 * from a curated allowlist, which by construction can only re-rank what someone
 * already added. Discovery has to begin somewhere outside that.
 *
 * Uses the same limiter, cache and 429 back-off as every other call here.
 */
export async function yahooScreener(
  screenId: string,
  count = 50,
): Promise<Array<{ symbol: string; price: number; changePct: number; volume: number; marketCap: number | null }>> {
  if (Date.now() < _throttled429Until) {
    logger.debug(`[YAHOO] backing off, skipping screener ${screenId}`);
    return [];
  }

  const key = `yahoo:screener:${screenId}:${count}`;
  const j = await cachedFetch(key, 5 * 60_000, async () =>
    rateLimited('yahoo', MIN_GAP_MS, async () => {
      for (const host of HOSTS) {
        try {
          const r = await fetch(
            `https://${host}.finance.yahoo.com/v1/finance/screener/predefined/saved`
              + `?scrIds=${encodeURIComponent(screenId)}&count=${count}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } },
          );
          if (r.status === 429) {
            _throttled429Until = Date.now() + 30_000;
            logger.warn(`[YAHOO] 429 on screener ${screenId} — backing off 30s`);
            return null;
          }
          if (!r.ok) continue;
          const body = await r.json();
          if (body?.finance?.result?.[0]) return body;
        } catch {
          // try the other host
        }
      }
      return null;
    }),
  );

  const quotes = j?.finance?.result?.[0]?.quotes ?? [];
  return quotes
    .filter((q: any) => q?.symbol)
    .map((q: any) => ({
      symbol: String(q.symbol).toUpperCase(),
      price: Number(q.regularMarketPrice ?? 0),
      changePct: Number(q.regularMarketChangePercent ?? 0),
      volume: Number(q.regularMarketVolume ?? 0),
      marketCap: Number.isFinite(q.marketCap) ? Number(q.marketCap) : null,
    }));
}
