/**
 * ENVELOPE inputs (server side of shared/envelope-cone.ts): the intraday
 * variance curve from our 5-min bars and the 25Δ skew from the desk chain,
 * each cached 30 min per symbol so the expected-move endpoint stays cheap.
 * Flag ENVELOPE_V2 (default on; FLAG_ENVELOPE_V2=off disables).
 */
import { varianceCurveFromBars } from '@shared/path-projection';
import {
  buildEnvelope, freezeCone, moveVsPriced, shouldFreeze, ENVELOPE_NOTE,
  type EnvelopeCone, type FrozenCone, type MoveVsPriced,
} from '@shared/envelope-cone';
import { logger } from './logger';

export interface EnvelopePayload {
  label: 'modelled';
  note: string;
  cones: EnvelopeCone[];
  frozen: FrozenCone | null;
  moveVsPriced: MoveVsPriced | null;
  curve: 'bars' | 'fallback';
  curveSessions: number;
  skew: number;
}

const TTL = 30 * 60_000;
const curveCache = new Map<string, { at: number; v: { weights: number[]; sessions: number; source: 'bars' | 'fallback' } }>();

export async function varianceCurveFor(sym: string, nowMs = Date.now()) {
  const hit = curveCache.get(sym);
  if (hit && nowMs - hit.at < TTL) return hit.v;
  let v = varianceCurveFromBars([]);
  try {
    const yf = await (await import('./yahoo-finance-service')).getYahooFinance();
    const ySym = sym === 'SPX' ? '^SPX' : sym;
    const chart: any = await (yf as any).chart(ySym, { period1: new Date(nowMs - 16 * 86_400_000), interval: '5m' });
    const bars = (chart?.quotes ?? []).filter((q: any) => q.close > 0).map((q: any) => ({ time: Math.floor(new Date(q.date).getTime() / 1000), close: q.close }));
    v = varianceCurveFromBars(bars);
  } catch (e) { logger.debug?.(`[ENVELOPE] ${sym} bars: ${(e as Error).message}`); }
  curveCache.set(sym, { at: nowMs, v });
  if (curveCache.size > 300) curveCache.delete(curveCache.keys().next().value!);
  return v;
}

/** Assemble the envelope from the already-read chain + per-session move. `frozenIn` is the stored anchor. */
export async function buildEnvelopePayload(
  sym: string, spot: number, perSessionMove: number, chainRows: any[] | null, frozenIn: FrozenCone | null, nowMs = Date.now(),
): Promise<{ payload: EnvelopePayload; frozen: FrozenCone | null }> {
  const curve = await varianceCurveFor(sym, nowMs);
  let skew = 0;
  try { if (chainRows?.length) skew = (await import('./chart-path')).skewFromChain(chainRows); } catch { /* skew 0 */ }
  let frozen = frozenIn;
  if (shouldFreeze(nowMs, frozen)) frozen = freezeCone(spot, perSessionMove, nowMs, curve.weights, skew);
  const cones = buildEnvelope({ spot, nowMs, sessionMove: perSessionMove, varianceCurve: curve.weights, skew });
  const mvp = frozen ? moveVsPriced(frozen, spot, nowMs, curve.weights) : null;
  return {
    frozen,
    payload: {
      label: 'modelled', cones, frozen, moveVsPriced: mvp, curve: curve.source, curveSessions: curve.sessions, skew,
      note: `${ENVELOPE_NOTE}; intraday shape from ${curve.source === 'bars' ? `${curve.sessions} sessions of our 5-min bars` : 'a default U-curve (too few bars)'}; skew ${skew >= 0 ? '+' : ''}${skew.toFixed(3)} (25Δ put vs call IV); holidays not excluded.`,
    },
  };
}
