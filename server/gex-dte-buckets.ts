/**
 * GEX DTE Bucketing — splits a flat options chain into time-horizon buckets
 * so each trader workflow gets its own snapshot:
 *
 *   today    → 0DTE pin levels
 *   week     → swing setups (1-7d)
 *   month    → monthly opex positioning (7-30d)
 *   quarter  → 30-90d
 *   leaps    → 90+d institutional positioning
 *
 * Plus the single most actionable GEX number:
 *   dealerFlowPer1Pct = totalGamma × spot² × 0.01 × 100
 *   "Dealers must buy/sell $X notional per 1% spot move."
 */
import type { GEXBucketSummary } from '../shared/gex-types';
import { GEX_DTE_BUCKETS, bucketizeLegs, type BucketLeg, type GexBucketKey } from '../shared/gex-buckets';
import { gexPer1Pct, expiryInstantMs } from '../shared/gex-math';

type BucketKey = GexBucketKey;

export interface BucketContract {
  expirationDate: string;     // YYYY-MM-DD
  strike: number;
  cp: 'C' | 'P';
  oi: number;
  gamma: number;
  /** Optional IV (decimal) + years to expiry — enables the re-priced per-bucket flip. */
  iv?: number;
  T?: number;
}

/** Days between an ISO date string and now. */
export function dteFromIso(iso: string, now = Date.now()): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 9999;
  return Math.max(0, Math.round((t - now) / 86_400_000));
}

/**
 * Convert raw gamma sum → dollar dealer flow per 1% move.
 * Formula: gammaSum × spot² × 0.01 × 100 (× 100 = per-contract multiplier)
 */
export function dealerFlowPer1PctFromGamma(gammaSum: number, spot: number): number {
  return gammaSum * spot * spot * 0.01 * 100;
}

/**
 * Convert totalGEX ($B per 1% move) → dollars of dealer hedging per 1% move.
 *
 * Every producer of totalGEX (options-exposures, the CBOE fallback) already
 * computes Γ·OI·100·S²·0.01 — i.e. PER 1% — then divides by 1e9. v1 of this
 * helper assumed "$B per 1.0 move" and multiplied by 0.01 again, so the main
 * path reported dealer flow 100× too small while the CBOE path (which uses
 * dealerFlowPer1PctFromGamma) was right. Measured 2026-09-29 on SPY:
 * −$80M (this helper, v1) vs −$10.1B (reference). Units: docs/GEX_VEX_METHODOLOGY.md.
 */
export function dealerFlowFromTotalGEX(totalGEXBillions: number): number {
  return totalGEXBillions * 1e9;
}

/**
 * Fallback only: bucket a per-expiration NET matrix (strike × expiry) when the
 * exposure engine did not supply canonical byDte. The matrix carries no leg split
 * and no IV, so walls are the net-GEX extremes and the flip is NOT computed (null)
 * rather than invented — see shared/gex-buckets.ts for why the old cumulative
 * flip was wrong (it returned the lowest listed strike).
 */
export function bucketizeMatrix(
  matrix: Array<{ strike: number; dte: number; netGEX: number }>,
  spot: number,
): Partial<Record<BucketKey, GEXBucketSummary>> {
  const out: Partial<Record<BucketKey, GEXBucketSummary>> = {};
  for (const b of GEX_DTE_BUCKETS) {
    const cells = matrix.filter(c => c.dte >= b.min && c.dte < b.max);
    if (cells.length === 0) continue;
    const byStrike = new Map<number, number>();
    for (const c of cells) byStrike.set(c.strike, (byStrike.get(c.strike) ?? 0) + c.netGEX);
    let callWall: number | null = null, callWallGEX = 0;
    let putWall: number | null = null, putWallGEX = 0;
    let maxGammaStrike: number | null = null, maxAbs = 0;
    let total = 0;
    for (const [strike, netGEX] of byStrike) {
      total += netGEX;
      if (strike > spot && netGEX > callWallGEX) { callWallGEX = netGEX; callWall = strike; }
      if (strike < spot && netGEX < putWallGEX) { putWallGEX = netGEX; putWall = strike; }
      if (Math.abs(netGEX) > maxAbs) { maxAbs = Math.abs(netGEX); maxGammaStrike = strike; }
    }
    out[b.key] = {
      expirationsCount: new Set(cells.map(c => c.dte)).size,
      totalGEX: total,
      callWall,
      putWall,
      maxGammaStrike,
      gammaFlipPrice: null,
      dealerFlowPer1Pct: dealerFlowFromTotalGEX(total),
    };
  }
  return out;
}

/**
 * Build per-DTE bucket summaries from a flat list of contracts (CBOE fallback).
 * Delegates to shared/gex-buckets.ts so the fallback reports exactly the same
 * definitions and units ($B per 1%) as the main engine. (v1 omitted the 0.01
 * per-1% factor here: totalGEX came out 100x the main path's.)
 */
export function bucketizeChain(
  contracts: BucketContract[],
  spot: number,
  now = Date.now(),
): Partial<Record<BucketKey, GEXBucketSummary>> {
  const legs: BucketLeg[] = [];
  for (const c of contracts) {
    if (!c.oi || c.oi <= 0 || !Number.isFinite(c.gamma)) continue;
    legs.push({
      strike: c.strike,
      dte: Math.max(0, (expiryInstantMs(c.expirationDate) - now) / 86_400_000),
      isCall: c.cp === 'C',
      oi: c.oi,
      gexDollars: gexPer1Pct(Math.abs(c.gamma), c.oi, spot),
      iv: c.iv,
      T: c.T,
      expiry: c.expirationDate,
    });
  }
  return bucketizeLegs(legs, spot);
}
