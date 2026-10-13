/**
 * GEX HORIZON VIEW — /api/gex-vex/terminal/:symbol?horizon=today|week|opex.
 *
 * Takes the all-expiry terminal payload and re-reads the dealer levels over
 * one expiry horizon (shared/gex-horizon.ts):
 *   walls / zero-γ / max-γ  ← engine byHorizon (headline definitions over the
 *                             horizon's contracts: pickWalls + re-priced profile)
 *   nodes                   ← the strike × expiry matrix summed per strike
 *                             inside the horizon (GEX $B/1%, VEX $M/IV pt)
 * When the engine has no byHorizon (CBOE fallback path) the levels are null
 * and the note says so — the all-expiry levels are never relabelled.
 */
import { HORIZON_LABEL, horizonLastExpiry, nodesForHorizon, topNodes, type GexHorizon, type MatrixCellLike } from '@shared/gex-horizon';
import type { GammaExposureResult } from './gamma-exposure';

export interface HorizonView {
  horizon: GexHorizon;
  label: string;
  lastExpiry: string | null;
  callWall: number | null;
  putWall: number | null;
  zeroGamma: number | null;
  maxGammaStrike: number | null;
  /** Net GEX of the horizon's book, $B per 1%. */
  totalGEX: number | null;
  expirations: number | null;
  /** [strike, gex $B/1%, vex $M/IV pt] — strongest by |GEX| ∪ |VEX|. */
  nodes: Array<[number, number, number]>;
  source: 'engine-byHorizon' | 'matrix-only' | 'none';
  note: string;
}

export function buildHorizonView(gex: Pick<GammaExposureResult, 'byHorizon' | 'strikeExpiryMatrix'> | null, matrix: MatrixCellLike[], horizon: GexHorizon, nowMs: number): HorizonView {
  const label = HORIZON_LABEL[horizon];
  const lastExpiry = horizonLastExpiry(horizon, nowMs);
  const nodes = topNodes(nodesForHorizon(matrix, horizon, nowMs));
  const lv = horizon === 'all' ? null : gex?.byHorizon?.[horizon];
  if (lv) {
    return {
      horizon, label, lastExpiry,
      callWall: lv.callWall, putWall: lv.putWall, zeroGamma: lv.gammaFlipPrice, maxGammaStrike: lv.maxGammaStrike,
      totalGEX: lv.totalGEX, expirations: lv.expirationsCount, nodes, source: 'engine-byHorizon',
      note: `${label}: contracts expiring by ${lastExpiry} 16:00 ET only — walls, zero-γ and max-γ use the headline definitions over that book.`,
    };
  }
  return {
    horizon, label, lastExpiry, callWall: null, putWall: null, zeroGamma: null, maxGammaStrike: null, totalGEX: null, expirations: null,
    nodes, source: nodes.length ? 'matrix-only' : 'none',
    note: nodes.length
      ? `${label}: this chain read (fallback path) has no per-horizon walls — nodes only, from the strike × expiry matrix.`
      : `${label}: no contracts in this chain read expire by ${lastExpiry}.`,
  };
}

/** The terminal payload with the snapshot's levels replaced by the horizon's. */
export function applyHorizonToTerminal<T extends { snapshot: any; strikeExpiryMatrix?: MatrixCellLike[] }>(
  payload: T, gex: GammaExposureResult | null, horizon: GexHorizon, nowMs: number,
): T & { horizon: GexHorizon; horizonView: HorizonView } {
  const view = buildHorizonView(gex, payload.strikeExpiryMatrix ?? [], horizon, nowMs);
  const snapshot = { ...payload.snapshot, horizon };
  if (view.source === 'engine-byHorizon') {
    snapshot.callWall = view.callWall;
    snapshot.putWall = view.putWall;
    snapshot.gammaFlipPrice = view.zeroGamma;
    snapshot.zeroGammaLevel = view.zeroGamma;
    if (view.maxGammaStrike != null) snapshot.maxGammaStrike = view.maxGammaStrike;
  } else {
    // No horizon levels: do not show all-expiry walls under a horizon label.
    snapshot.callWall = null; snapshot.putWall = null; snapshot.gammaFlipPrice = null; snapshot.zeroGammaLevel = null;
  }
  return { ...payload, snapshot, horizon, horizonView: view };
}
