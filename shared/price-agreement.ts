/**
 * PRICE AGREEMENT — one reference price per page (UI audit 2026-10-07 P0 #1/#2).
 *
 * A page that prints a quote AND levels derived from another feed (the option
 * chain's spot, the weekly-path spot, a GEX snapshot) must not silently mix
 * them: when two sources for the same symbol disagree by more than 5% one of
 * them is stale or wrong, so every value derived from "the price" (distance to
 * a wall, 52-week position, ATR % of price, the 1σ band) is suppressed and both
 * prices are shown with their ages instead. Never picks a winner.
 *
 * Pure — safe on client and server.
 */

export const PRICE_AGREEMENT_TOL = 0.05;

export interface PriceRead {
  /** Human label: "Quote", "Option chain", "Weekly path". */
  label: string;
  price: number | null | undefined;
  /** ISO string or epoch ms. */
  asOf?: string | number | null;
}

export interface PriceAgreement {
  /** True when every finite source sits within `tol` of the reference. */
  ok: boolean;
  /** The page's one reference price (the first finite read), or null. */
  reference: number | null;
  referenceRead: PriceRead | null;
  /** Sources that break the tolerance against the reference. */
  conflicts: Array<PriceRead & { price: number; diffPct: number }>;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Compare every read against the reference (the first finite one — pass the
 * displayed quote first). A read with no finite price is ignored, not a conflict.
 */
export function checkPriceAgreement(reads: PriceRead[], tol = PRICE_AGREEMENT_TOL): PriceAgreement {
  const usable = reads.filter((r) => finite(r.price)) as Array<PriceRead & { price: number }>;
  if (!usable.length) return { ok: true, reference: null, referenceRead: null, conflicts: [] };
  const ref = usable[0];
  const conflicts = usable.slice(1)
    .map((r) => ({ ...r, diffPct: ((r.price - ref.price) / ref.price) * 100 }))
    .filter((r) => Math.abs(r.diffPct) > tol * 100);
  return { ok: conflicts.length === 0, reference: ref.price, referenceRead: ref, conflicts };
}

export type Range52State = 'in' | 'below' | 'above' | 'unknown';

/**
 * Where `price` sits in the 52-week range, clamped to 0–100. Outside the range
 * (a fresh low/high the daily series has not caught yet, or a bad quote) the
 * state says so instead of printing −40% or 130%.
 */
export function position52w(price: number | null | undefined, low: number | null | undefined, high: number | null | undefined): { pct: number | null; state: Range52State } {
  if (!finite(price) || !finite(low) || !finite(high) || high <= low) return { pct: null, state: 'unknown' };
  if (price < low) return { pct: 0, state: 'below' };
  if (price > high) return { pct: 100, state: 'above' };
  return { pct: Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)), state: 'in' };
}

export function position52wLabel(p: { pct: number | null; state: Range52State }): string {
  if (p.state === 'below') return 'below 52w low';
  if (p.state === 'above') return 'above 52w high';
  if (p.pct == null) return '—';
  return `${Math.round(p.pct)}%`;
}
