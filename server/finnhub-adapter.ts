/**
 * Finnhub adapter — market capitalisation, and a quote path that is not Yahoo.
 * ===========================================================================
 * WHY THIS EXISTS
 * ---------------
 * Every market-cap source in the platform is currently unavailable:
 *
 *   Yahoo          429 Too Many Requests (crumb fetch fails outright)
 *   Alpha Vantage  25 requests/day free tier, already exhausted
 *   Tradier        token not approved for market data
 *   Schwab         not configured
 *
 * The only cap classification left was `MOVERS_UNIVERSE.capTier` in
 * shared/movers-types.ts — a hand-maintained list of 85 symbols, which covered
 * 12 of the 32 names in a recent strongest-movers screen. That is not enough to
 * run a "market cap above $1B" filter, which is the whole point of the screen.
 *
 * Finnhub's free tier gives 60 calls/minute and returns market cap from
 * /stock/profile2 with no OAuth and no weekly re-auth — unlike Schwab, whose
 * refresh token expires every 7 days.
 *
 * SETUP
 * -----
 *   1. Free key at https://finnhub.io/register
 *   2. FINNHUB_API_KEY=... in .env   (the var already exists there, empty)
 *
 * Until a key is present every function here returns null rather than throwing,
 * so callers degrade to "cap unknown" instead of failing.
 *
 * UNITS
 * -----
 * profile2 reports `marketCapitalization` in MILLIONS of the listing currency.
 * It is converted to absolute units here exactly once, because a screen that
 * silently compares millions against a dollars threshold would pass every
 * symbol on the board.
 */

import { logger } from './logger';

const BASE = 'https://finnhub.io/api/v1';

/** Free tier is 60/min. Stay under it — a 429 here costs the whole batch. */
const MAX_PER_MINUTE = 55;
const SPACING_MS = Math.ceil(60_000 / MAX_PER_MINUTE);

/** Caps do not move intraday in any way that matters. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CapEntry { marketCap: number | null; name: string | null; industry: string | null; at: number }
const cache = new Map<string, CapEntry>();

export function isFinnhubConfigured(): boolean {
  return !!(process.env.FINNHUB_API_KEY && process.env.FINNHUB_API_KEY.trim());
}

async function get(path: string): Promise<any | null> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}token=${key}`);
    if (res.status === 429) {
      logger.warn('[FINNHUB] 429 rate limited — backing off');
      return null;
    }
    if (!res.ok) return null;
    return await res.json();
  } catch (e: any) {
    logger.warn(`[FINNHUB] request failed: ${e?.message ?? e}`);
    return null;
  }
}

/**
 * Market cap in ABSOLUTE currency units (not millions), plus the company's own
 * industry label — which is finer-grained than the platform's 21 hand-defined
 * groups and useful for cross-checking them.
 */
export async function getCompanyProfile(symbol: string): Promise<CapEntry | null> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

  const d = await get(`/stock/profile2?symbol=${encodeURIComponent(sym)}`);
  if (!d) return null;

  // profile2 gives marketCapitalization in MILLIONS. Convert once, here.
  const millions = Number(d.marketCapitalization);
  const entry: CapEntry = {
    marketCap: Number.isFinite(millions) && millions > 0 ? millions * 1_000_000 : null,
    name: d.name ?? null,
    industry: d.finnhubIndustry ?? null,
    at: Date.now(),
  };
  cache.set(sym, entry);
  return entry;
}

/**
 * Batch profiles, paced under the free-tier ceiling.
 *
 * Deliberately sequential with spacing rather than parallel: the free tier is a
 * per-minute cap, and firing 32 concurrent requests trips it and returns nothing
 * for the whole screen. A 32-symbol screen takes ~35s cold and is then cached
 * for 12 hours.
 */
export async function getMarketCaps(symbols: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!isFinnhubConfigured()) return out;

  const wanted = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  let fetched = 0;

  for (const sym of wanted) {
    const cached = cache.get(sym);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      out.set(sym, cached.marketCap);
      continue;
    }
    const p = await getCompanyProfile(sym);
    out.set(sym, p?.marketCap ?? null);
    fetched++;
    if (fetched < wanted.length) await new Promise((r) => setTimeout(r, SPACING_MS));
  }

  if (fetched > 0) {
    const known = Array.from(out.values()).filter((v) => v != null).length;
    logger.info(`[FINNHUB] market caps: ${known}/${wanted.length} resolved (${fetched} fetched, rest cached)`);
  }
  return out;
}

/** Real-time quote. A second opinion when Yahoo is rate-limited. */
export async function getFinnhubQuote(symbol: string): Promise<{ price: number; changePct: number } | null> {
  const d = await get(`/quote?symbol=${encodeURIComponent(symbol.toUpperCase())}`);
  if (!d || typeof d.c !== 'number' || d.c <= 0) return null;
  return { price: d.c, changePct: typeof d.dp === 'number' ? d.dp : 0 };
}
