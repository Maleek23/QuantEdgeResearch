/**
 * "Validate All" (POST /api/performance/validate) — audit 2026-10-01 P0 #1.
 *
 * The route used to resolve every open idea against the carried
 * market_data.currentPrice column and write the outcome straight away, for any
 * beta user. It is now operator-only (server/route-guards.ts), and this module
 * holds the two rules the handler applies:
 *
 *   1. Price source: a LIVE quote only. A quote that is missing, zero, flagged
 *      stale (expired cache served because the live fetch failed) or older than
 *      MAX_QUOTE_AGE_MS is not used — that idea is skipped and reported, never
 *      resolved on a stored price. Options are always skipped: the quote is the
 *      underlying's, while entry/target/stop are premiums.
 *   2. Dry run by default: nothing is written unless the caller sends
 *      { apply: true } (or ?apply=true). The dry run returns what WOULD change.
 */

export const MAX_QUOTE_AGE_MS = 5 * 60_000;

export interface LiveQuoteLike {
  price: number;
  stale?: boolean;
  lastUpdate?: Date | string | null;
}

export interface ValidatableIdea {
  id: string;
  symbol: string;
  assetType?: string | null;
}

export interface SkippedIdea {
  id: string;
  symbol: string;
  reason: string;
}

export function quoteAssetType(assetType: string | null | undefined): 'stock' | 'crypto' | 'futures' | null {
  if (assetType === 'option') return null;
  if (assetType === 'crypto') return 'crypto';
  if (assetType === 'future' || assetType === 'futures') return 'futures';
  return 'stock';
}

/** Live price per symbol; every idea that cannot be priced live is listed with why. */
export function buildLivePriceMap(
  ideas: ValidatableIdea[],
  quotes: Map<string, LiveQuoteLike>,
  now: Date = new Date(),
  maxAgeMs: number = MAX_QUOTE_AGE_MS,
): { priceMap: Map<string, number>; skipped: SkippedIdea[] } {
  const priceMap = new Map<string, number>();
  const skipped: SkippedIdea[] = [];
  for (const idea of ideas) {
    if (quoteAssetType(idea.assetType) === null) {
      skipped.push({ id: idea.id, symbol: idea.symbol, reason: 'option — no contract mark; left to the outcome tracker' });
      continue;
    }
    const q = quotes.get(idea.symbol);
    if (!q || !Number.isFinite(q.price) || q.price <= 0) {
      skipped.push({ id: idea.id, symbol: idea.symbol, reason: 'quote unavailable' });
      continue;
    }
    if (q.stale) {
      skipped.push({ id: idea.id, symbol: idea.symbol, reason: 'quote stale (live fetch failed)' });
      continue;
    }
    const at = q.lastUpdate ? new Date(q.lastUpdate).getTime() : NaN;
    if (!Number.isFinite(at) || now.getTime() - at > maxAgeMs) {
      skipped.push({ id: idea.id, symbol: idea.symbol, reason: 'quote older than 5 min' });
      continue;
    }
    priceMap.set(idea.symbol, q.price);
  }
  return { priceMap, skipped };
}

/** Writes happen only on an explicit apply; the default is a dry run. */
export function isApplyRequest(body: unknown, query: unknown): boolean {
  const b = (body ?? {}) as Record<string, unknown>;
  const q = (query ?? {}) as Record<string, unknown>;
  return b.apply === true || q.apply === 'true' || q.apply === '1';
}
