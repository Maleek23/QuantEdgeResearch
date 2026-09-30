/**
 * MASSIVE (formerly Polygon.io) — stocks market data.
 *
 * Added because the historical-price chain had no working link left. It ran
 * Tradier → Alpha Vantage → Yahoo, and on 2026-08-25 all three were down at
 * once: Tradier returning 401, Alpha Vantage exhausted at its 25-calls-per-day
 * cap, and Yahoo answering 429. Every candidate in the idea generator was
 * skipped for "no historical data" and the board published nothing at all.
 *
 * Two things make this the right primary source rather than another fallback:
 *
 *   • Unlimited API calls on the Starter plan. The Yahoo throttling was never
 *     really about Yahoo — it was about fetching one symbol at a time, hundreds
 *     of times per scan, against an endpoint with no quota agreement.
 *
 *   • `grouped daily` returns the ENTIRE US market in a single request — about
 *     12,500 tickers. Anything that needs a snapshot across many symbols (sector
 *     leadership, the heatmap, relative strength) should use that instead of
 *     N per-symbol calls.
 *
 * Data is 15-minute delayed on Starter, which is correct for this platform:
 * delayed market data carries no redistribution fee, and the operator trades
 * swing horizons where a 15-minute lag is immaterial.
 *
 * NOTE ON LICENSING: Massive's retail tiers are labelled "Individual Use". A
 * subscriber-facing product needs their business tier. Flagged here so it is
 * visible at the point of use rather than buried in a receipt.
 */

import { logger } from './logger';
import { registerCacheProbe } from './lib/bounded-cache';

const BASE = 'https://api.polygon.io';

/** Massive answers OK for real-time entitlements and DELAYED for 15-min tiers. Both are success. */
const OK_STATUSES = new Set(['OK', 'DELAYED']);

export function massiveEnabled(): boolean {
  return !!process.env.POLYGON_API_KEY?.trim();
}

interface AggBar {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

async function call(path: string): Promise<any | null> {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) return null;
  const sep = path.includes('?') ? '&' : '?';
  try {
    const res = await fetch(`${BASE}${path}${sep}apiKey=${key}`);
    if (!res.ok) {
      logger.debug(`[MASSIVE] HTTP ${res.status} on ${path.split('?')[0]}`);
      return null;
    }
    const data: any = await res.json();
    if (data?.status && !OK_STATUSES.has(data.status)) {
      // NOT_AUTHORIZED is an entitlement answer, not a transient failure — log
      // it at a level that surfaces a wrong-plan mistake instead of hiding it.
      if (data.status === 'NOT_AUTHORIZED') {
        logger.warn(`[MASSIVE] not entitled: ${path.split('?')[0]} — check the plan covers this asset class`);
      }
      return null;
    }
    return data;
  } catch (error) {
    logger.debug(`[MASSIVE] ${path.split('?')[0]}: ${(error as Error).message}`);
    return null;
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Daily closes, oldest first — the shape fetchHistoricalPrices returns.
 *
 * Asks for a wider calendar window than the requested bar count because
 * `periods` means trading days and the range is in calendar days; weekends and
 * holidays would otherwise short the result by roughly 30%.
 */
export async function fetchDailyCloses(symbol: string, periods = 60): Promise<number[]> {
  const to = new Date();
  const from = new Date(to.getTime() - Math.ceil(periods * 1.6) * 86_400_000);
  const data = await call(
    `/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/range/1/day/${iso(from)}/${iso(to)}?adjusted=true&sort=asc&limit=5000`,
  );
  const bars: AggBar[] = data?.results ?? [];
  return bars
    .map((b) => b.c)
    .filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0)
    .slice(-periods);
}

/**
 * The official (UNADJUSTED) close of one session, or null when that exact day
 * has no bar (holiday, not yet published, provider off). Used to settle option
 * expiries — a dividend-adjusted close would misstate intrinsic value.
 */
export async function fetchUnadjustedCloseOn(symbol: string, day: string): Promise<number | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const data = await call(
    `/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/range/1/day/${day}/${day}?adjusted=false&sort=asc&limit=5`,
  );
  const bar: AggBar | undefined = (data?.results ?? [])[0];
  return bar && Number.isFinite(bar.c) && bar.c > 0 ? bar.c : null;
}

/** Daily OHLC, oldest first. */
export async function fetchDailyOHLC(
  symbol: string,
  periods = 60,
): Promise<{ opens: number[]; highs: number[]; lows: number[]; closes: number[]; dates: string[] } | null> {
  const to = new Date();
  const from = new Date(to.getTime() - Math.ceil(periods * 1.6) * 86_400_000);
  const data = await call(
    `/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/range/1/day/${iso(from)}/${iso(to)}?adjusted=true&sort=asc&limit=5000`,
  );
  const bars: AggBar[] = (data?.results ?? []).filter(
    (b: AggBar) => Number.isFinite(b?.c) && Number.isFinite(b?.o),
  );
  if (bars.length === 0) return null;
  const slice = bars.slice(-periods);
  return {
    opens: slice.map((b) => b.o),
    highs: slice.map((b) => b.h),
    lows: slice.map((b) => b.l),
    closes: slice.map((b) => b.c),
    dates: slice.map((b) => new Date(b.t).toISOString().slice(0, 10)),
  };
}

// ─── WHOLE-MARKET SNAPSHOT ───────────────────────────────────────────────────
//
// One request covers every US ticker. Cached for the session because the
// underlying data is end-of-day for a given date and does not change.

interface GroupedBar {
  T: string; // ticker
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const groupedCache = new Map<string, { bars: Map<string, GroupedBar>; fetchedAt: number }>();
const GROUPED_TTL_MS = 15 * 60 * 1000;           // today's session (still settling)
const GROUPED_PAST_TTL_MS = 24 * 60 * 60 * 1000;  // a finished session never changes
const GROUPED_MAX_DAYS = 4;                        // memory cap: whole-market maps are large
/** One request per day in flight — concurrent callers share it (2026-09-30:
 *  229 whole-market downloads in 10 min from callers racing the cache). */
const groupedInFlight = new Map<string, Promise<GroupedBar[]>>();
registerCacheProbe('massive.groupedDaily', () => {
  let bars = 0;
  for (const e of groupedCache.values()) bars += e.bars.size;
  // ~12k tickers/day; a GroupedBar + its Map slot is ~200 bytes.
  return { entries: groupedCache.size, maxEntries: GROUPED_MAX_DAYS, approxBytes: bars * 200 };
}, (f) => {
  const keys = [...groupedCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt).map(([k]) => k);
  const drop = keys.length - Math.floor(keys.length * f);
  for (const k of keys.slice(0, Math.max(0, drop))) groupedCache.delete(k);
  return Math.max(0, drop);
});

/**
 * Every US stock's OHLCV for one session, keyed by ticker.
 *
 * Falls back a day at a time for up to four days so a weekend, holiday or a
 * not-yet-published session returns the last real trading day rather than
 * nothing. Returns an empty map if the whole window is unavailable — callers
 * must treat empty as "unknown", never as "no movement".
 */
export async function fetchGroupedDaily(date?: Date): Promise<Map<string, GroupedBar>> {
  const start = date ?? new Date();
  for (let back = 0; back < 5; back++) {
    const day = iso(new Date(start.getTime() - back * 86_400_000));
    const cached = groupedCache.get(day);
    const ttl = day < iso(new Date()) ? GROUPED_PAST_TTL_MS : GROUPED_TTL_MS;
    if (cached && Date.now() - cached.fetchedAt < ttl) return cached.bars;

    let pending = groupedInFlight.get(day);
    if (!pending) {
      pending = call(`/v2/aggs/grouped/locale/us/market/stocks/${day}?adjusted=true`)
        .then((data: any) => (data?.results ?? []) as GroupedBar[])
        .finally(() => groupedInFlight.delete(day));
      groupedInFlight.set(day, pending);
    }
    const results: GroupedBar[] = await pending;
    if (results.length > 0 && groupedCache.get(day) && Date.now() - groupedCache.get(day)!.fetchedAt < 5_000) return groupedCache.get(day)!.bars;
    if (results.length > 0) {
      const bars = new Map(results.map((b) => [b.T?.toUpperCase(), b] as const));
      groupedCache.set(day, { bars, fetchedAt: Date.now() });
      // Each entry is the whole US market (~10k rows): keep only the newest few
      // sessions or the 2 GB droplet swaps (2026-09-30).
      while (groupedCache.size > GROUPED_MAX_DAYS) {
        const oldest = Array.from(groupedCache.entries()).sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
        groupedCache.delete(oldest[0]);
      }
      logger.info(`[MASSIVE] grouped daily ${day}: ${bars.size} tickers in one call`);
      return bars;
    }
  }
  logger.warn('[MASSIVE] grouped daily returned nothing across a 5-day window');
  return new Map();
}

/**
 * Session change percent for many symbols from a single request.
 * Symbols with no bar are omitted rather than defaulted to zero — a missing
 * quote is not a flat quote.
 */
export async function fetchBatchChangePct(symbols: string[]): Promise<Map<string, number>> {
  const bars = await fetchGroupedDaily();
  const out = new Map<string, number>();
  for (const raw of symbols) {
    const bar = bars.get(raw.toUpperCase());
    if (!bar || !Number.isFinite(bar.o) || !Number.isFinite(bar.c) || bar.o <= 0) continue;
    out.set(raw.toUpperCase(), ((bar.c - bar.o) / bar.o) * 100);
  }
  return out;
}
