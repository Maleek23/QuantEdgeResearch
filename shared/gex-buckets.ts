/**
 * GEX BY HORIZON — the one definition of the per-DTE bucket levels.
 * ================================================================
 * Pure, no imports beyond shared/gex-math. Used by the main exposure engine
 * (server/options-exposures.ts) and the CBOE fallback (server/gex-cboe-fallback.ts)
 * so /api/gex/buckets, the GEX hub and the setup cards all read the same numbers.
 *
 * Why this exists (consistency audit 2026-09-29): the old bucket code computed
 *   - the flip as the first sign change of a cumulative per-strike sum, which
 *     triggers on the LOWEST strike whenever it carries any put OI. Live on prod
 *     every bucket's flip was ~60% of spot (SPY 460 at spot 765, NVDA 140 at 228)
 *     while the headline engine re-prices gamma and got ~768.
 *   - walls from NET GEX per strike, while the headline walls rank each leg's
 *     own gamma (pickWalls) — two different "call walls" for one ticker.
 *   - (CBOE path) totalGEX without the 0.01 per-1% factor: 100x the main path.
 *   - overlapping buckets (a 1-DTE contract counted in both today and week).
 *
 * Levels here use exactly the headline definitions (docs/GEX_VEX_METHODOLOGY.md):
 *   callWall / putWall   = pickWalls() on the bucket's per-strike leg GEX
 *   gammaFlipPrice       = gammaProfile() re-priced zero-gamma of the bucket's contracts,
 *                          null when the bucket's net GEX never changes sign in 0.8–1.2x spot
 *   maxGammaStrike       = strike with the largest |net GEX| in the bucket
 *   totalGEX             = $B per 1% move (same units as the headline totalGEX)
 */
import { gammaProfile, pickWalls, type GammaContract } from './gex-math';

/** Half-open [min, max) in calendar days to expiry. A contract lands in exactly one bucket. */
export const GEX_DTE_BUCKETS = [
  { key: 'today', min: 0, max: 1 },
  { key: 'week', min: 1, max: 8 },
  { key: 'month', min: 8, max: 31 },
  { key: 'quarter', min: 31, max: 91 },
  { key: 'leaps', min: 91, max: Infinity },
] as const;

export type GexBucketKey = typeof GEX_DTE_BUCKETS[number]['key'];

export function bucketForDte(dte: number): GexBucketKey | null {
  if (!Number.isFinite(dte) || dte < 0) return null;
  for (const b of GEX_DTE_BUCKETS) if (dte >= b.min && dte < b.max) return b.key;
  return null;
}

/** One contract's contribution, already signed-per-leg in $ per 1% (unsigned magnitudes). */
export interface BucketLeg {
  strike: number;
  dte: number;
  isCall: boolean;
  oi: number;
  /** |Γ|·OI·100·S²·0.01 in dollars (gexPer1Pct) — unsigned. */
  gexDollars: number;
  /** Years to expiry + IV for the re-priced flip; omit (or iv<=0) to exclude from the profile. */
  T?: number;
  iv?: number;
  expiry?: string;
}

export interface GexBucketSummary {
  expirationsCount: number;
  /** Net GEX, $B per 1% move (calls +, puts −). */
  totalGEX: number;
  callWall: number | null;
  putWall: number | null;
  maxGammaStrike: number | null;
  /** Re-priced zero-gamma of this bucket's book; null = no sign change in 0.8–1.2x spot. */
  gammaFlipPrice: number | null;
  /** $ of underlying dealers trade per 1% move (= totalGEX · 1e9). */
  dealerFlowPer1Pct: number;
}

export function summarizeBucketLegs(legs: BucketLeg[], spot: number): GexBucketSummary {
  const byStrike = new Map<number, { strike: number; callOI: number; putOI: number; callGEX: number; putGEX: number }>();
  const profile: GammaContract[] = [];
  const exps = new Set<string>();
  let net = 0;
  for (const l of legs) {
    if (!(l.oi > 0) || !Number.isFinite(l.gexDollars)) continue;
    const e = byStrike.get(l.strike) ?? { strike: l.strike, callOI: 0, putOI: 0, callGEX: 0, putGEX: 0 };
    if (l.isCall) { e.callGEX += l.gexDollars; e.callOI += l.oi; net += l.gexDollars; }
    else { e.putGEX += l.gexDollars; e.putOI += l.oi; net -= l.gexDollars; }
    byStrike.set(l.strike, e);
    exps.add(l.expiry ?? String(Math.round(l.dte * 100) / 100));
    if ((l.iv ?? 0) > 0 && (l.T ?? 0) > 0) profile.push({ strike: l.strike, T: l.T!, iv: l.iv!, oi: l.oi, isCall: l.isCall });
  }
  const strikes = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  const walls = pickWalls(strikes, spot);
  let maxGammaStrike: number | null = null; let maxAbs = 0;
  for (const s of strikes) {
    const n = Math.abs(s.callGEX - s.putGEX);
    if (n > maxAbs) { maxAbs = n; maxGammaStrike = s.strike; }
  }
  const flip = profile.length >= 2 ? gammaProfile(profile, spot, { lo: 0.8, hi: 1.2, steps: 80 }).zeroGamma : null;
  return {
    expirationsCount: exps.size,
    totalGEX: net / 1e9,
    callWall: walls.callWall,
    putWall: walls.putWall,
    maxGammaStrike,
    gammaFlipPrice: flip == null ? null : Math.round(flip * 100) / 100,
    dealerFlowPer1Pct: net,
  };
}

/** Group legs by horizon and summarise each. Buckets with no legs are omitted. */
/**
 * 'next7' = every contract expiring within 8 calendar days (today + week
 * buckets together) — the book a "this week" dealer map should read. Kept
 * outside GEX_DTE_BUCKETS so the disjoint buckets still sum to the headline.
 */
export type GexByDte = Partial<Record<GexBucketKey | 'next7', GexBucketSummary>>;

export function bucketizeLegs(legs: BucketLeg[], spot: number): GexByDte {
  const groups = new Map<GexBucketKey, BucketLeg[]>();
  for (const l of legs) {
    const k = bucketForDte(l.dte);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(l);
    groups.set(k, arr);
  }
  const out: GexByDte = {};
  for (const b of GEX_DTE_BUCKETS) {
    const g = groups.get(b.key);
    if (g?.length) out[b.key] = summarizeBucketLegs(g, spot);
  }
  const near = legs.filter((l) => Number.isFinite(l.dte) && l.dte >= 0 && l.dte < 8);
  if (near.length) out.next7 = summarizeBucketLegs(near, spot);
  return out;
}
