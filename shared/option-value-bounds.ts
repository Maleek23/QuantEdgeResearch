/**
 * OPTION VALUE BOUNDS — the no-arbitrage ceiling on a contract's price and the
 * scale check that must pass before an intrinsic floor is applied.
 *
 * WHY (NEXUS book audit, 2026-10-06)
 * Two writers floor a recorded exit premium at intrinsic value:
 *   intrinsic = max(0, fill − strike)  (call)   max(0, strike − fill)  (put)
 * `fill` is the idea's recorded UNDERLYING exit. When that number is not on the
 * strike's scale — a premium-space ladder (an SMCI put with stop $1.55 against
 * a $40 strike), an SPX strike against a SPY-scale fill, a stale/foreign quote —
 * the "floor" invents a premium of ~the strike itself: a $3 put "exits" at $38
 * and one contract books +$3,500. A floor is a correction for a stale quote,
 * never a source of value, so it only applies when the fill is on the strike's
 * scale, and no recorded premium may exceed what the contract can be worth:
 *   call ≤ underlying        put ≤ strike
 */

/** A fill this far from the strike (ratio) is not on the strike's scale. */
export const FILL_SCALE_MIN = 0.5;
export const FILL_SCALE_MAX = 2;

export type OptionSide = 'call' | 'put';

export const optionSideOf = (t: string | null | undefined): OptionSide =>
  String(t ?? '').toLowerCase().startsWith('p') ? 'put' : 'call';

/** True when the underlying fill and the strike are plausibly the same instrument's scale. */
export function fillOnStrikeScale(fill: number | null | undefined, strike: number | null | undefined): boolean {
  const f = Number(fill), k = Number(strike);
  if (!(Number.isFinite(f) && f > 0 && Number.isFinite(k) && k > 0)) return false;
  const r = f / k;
  return r >= FILL_SCALE_MIN && r <= FILL_SCALE_MAX;
}

/**
 * Intrinsic value at the fill, or null when it cannot be trusted (missing
 * inputs or the fill is not on the strike's scale). Callers must treat null as
 * "no floor", never as 0.
 */
export function safeIntrinsic(type: string | null | undefined, strike: number | null | undefined, fill: number | null | undefined): number | null {
  if (!fillOnStrikeScale(fill, strike)) return null;
  const f = Number(fill), k = Number(strike);
  return optionSideOf(type) === 'put' ? Math.max(0, k - f) : Math.max(0, f - k);
}

/**
 * The most a single option (per share) can be worth: a call never exceeds the
 * underlying, a put never exceeds its strike. `underlying` may be null for a
 * put; for a call without an underlying the bound is unknown (Infinity).
 */
export function maxOptionValue(type: string | null | undefined, strike: number | null | undefined, underlying: number | null | undefined): number {
  const k = Number(strike), s = Number(underlying);
  if (optionSideOf(type) === 'put') return Number.isFinite(k) && k > 0 ? k : Infinity;
  return Number.isFinite(s) && s > 0 ? s : Infinity;
}

/** 1% tolerance on the ceiling (quotes round; deep-ITM marks sit at the bound). */
export const VALUE_CAP_TOLERANCE = 1.01;

export function exceedsOptionValue(premium: number, type: string | null | undefined, strike: number | null | undefined, underlying: number | null | undefined): boolean {
  const cap = maxOptionValue(type, strike, underlying);
  return Number.isFinite(cap) && premium > cap * VALUE_CAP_TOLERANCE;
}
