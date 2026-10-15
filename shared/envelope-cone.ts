/**
 * ENVELOPE — expected-move cones (MODELLED, from the options-priced move).
 *
 *   σ(t)  = S · √(Σ variance share from now to t)
 *           S = the per-session 1σ $ move priced by the options market
 *           (server/chart-expected-move.ts cone.perSessionMove); the share is
 *           the SAME intraday variance curve the Path engine uses
 *           (shared/path-projection.ts buildSteps: 78 five-minute RTH weights,
 *           measured from our bars, U-shape fallback) plus an overnight share
 *           paid at each open the horizon crosses. So the cone opens fast at
 *           the open, flattens at lunch, widens into the close.
 *   skew  s = 25Δ put-vs-call IV skew (−0.25..0.25). Upper edge k·σ·(1−s),
 *           lower edge k·σ·(1+s): richer puts → the downside edge sits wider.
 *   bands 1σ (≈68 %) and 2σ (≈95 %) — normal-approximation coverage, a model.
 *
 * Horizons: Today (rest of the current/next session) · Next day (through the
 * following session's close) · Week (through Friday) · Month (through the
 * monthly OPEX). Holidays are not excluded (same as the Path engine).
 *
 * Frozen 09:40 cone: the first read at/after 09:40 ET freezes spot + S for the
 * day; "move vs priced" = how far price has moved from that anchor in units of
 * the σ the frozen cone priced for the elapsed time, and as a share of the full
 * day's 1σ. Pure + deterministic — scripts/test-envelope-cone.ts.
 */
import { buildSteps, defaultVarianceCurve, etInstant, etParts, horizonSessions, type PathHorizon } from './path-projection';

export type EnvelopeHorizon = 'today' | 'next' | 'week' | 'month';
export const ENVELOPE_HORIZONS: EnvelopeHorizon[] = ['today', 'next', 'week', 'month'];
export const ENVELOPE_LABEL: Record<EnvelopeHorizon, string> = { today: 'Today', next: 'Next day', week: 'Week', month: 'Month (OpEx)' };
export const ENVELOPE_NOTE = 'modelled cone from the options-priced move · 1σ ≈ 68 %, 2σ ≈ 95 % under a normal approximation';
const MAP: Record<EnvelopeHorizon, PathHorizon> = { today: 'session', next: 'tomorrow', week: 'week', month: 'opex' };
const RTH_OPEN = 570; const RTH_CLOSE = 960;

export function parseEnvelopeHorizon(v: unknown): EnvelopeHorizon {
  const s = String(v ?? '').toLowerCase();
  return (ENVELOPE_HORIZONS as string[]).includes(s) ? (s as EnvelopeHorizon) : 'today';
}

export interface EnvelopeInput {
  spot: number;
  nowMs: number;
  /** 1σ $ move for one full session (options-implied). */
  sessionMove: number;
  /** 78 RTH weights summing to 1 (else the U-shape fallback). */
  varianceCurve?: number[];
  overnightShare?: number;
  /** −0.25..0.25, + = puts richer. */
  skew?: number;
  maxPoints?: number;
}
export interface EnvelopePoint {
  t: number;
  /** RTH trading ms from nowMs to t (the chart maps this to bar slots). */
  tm: number;
  u1: number; l1: number; u2: number; l2: number;
}
export interface EnvelopeCone {
  horizon: EnvelopeHorizon;
  label: string;
  sessions: string[];
  endMs: number;
  /** Terminal 1σ (symmetric, before skew). */
  sd: number;
  up1: number; dn1: number; up2: number; dn2: number;
  points: EnvelopePoint[];
}

const clampSkew = (s: number | undefined) => Math.max(-0.25, Math.min(0.25, Number.isFinite(s as number) ? (s as number) : 0));
const curveOf = (c?: number[]) => (c && c.length === 78 ? c : defaultVarianceCurve());

/** One cone. Pure. */
export function buildCone(inp: EnvelopeInput, horizon: EnvelopeHorizon): EnvelopeCone {
  const sessions = horizonSessions(MAP[horizon], inp.nowMs);
  const steps = buildSteps(inp.nowMs, sessions, curveOf(inp.varianceCurve), inp.overnightShare ?? 0.2);
  const s = clampSkew(inp.skew);
  const S = Math.max(0, inp.sessionMove);
  const maxPts = Math.max(8, inp.maxPoints ?? 120);
  const every = Math.max(1, Math.ceil(steps.length / maxPts));
  const pt = (t: number, tm: number, sd: number): EnvelopePoint => ({
    t, tm,
    u1: inp.spot + sd * (1 - s), l1: inp.spot - sd * (1 + s),
    u2: inp.spot + 2 * sd * (1 - s), l2: inp.spot - 2 * sd * (1 + s),
  });
  const points: EnvelopePoint[] = [pt(inp.nowMs, 0, 0)];
  let cum = 0; let tm = 0; let prevT = inp.nowMs;
  steps.forEach((st, i) => {
    cum += st.varShare;
    // trading time: an overnight step adds none; an RTH slot adds its (possibly partial) length
    const { min } = etParts(st.t);
    const isOpenStep = min === RTH_OPEN;
    if (!isOpenStep) tm += Math.min(300_000, st.t - prevT);
    prevT = st.t;
    if ((i + 1) % every === 0 || i === steps.length - 1) points.push(pt(st.t, tm, S * Math.sqrt(cum)));
  });
  const sd = S * Math.sqrt(cum);
  return {
    horizon, label: ENVELOPE_LABEL[horizon], sessions,
    endMs: steps.length ? steps[steps.length - 1].t : inp.nowMs,
    sd, up1: sd * (1 - s), dn1: sd * (1 + s), up2: 2 * sd * (1 - s), dn2: 2 * sd * (1 + s), points,
  };
}

export function buildEnvelope(inp: EnvelopeInput, horizons: EnvelopeHorizon[] = ENVELOPE_HORIZONS): EnvelopeCone[] {
  if (!(inp.spot > 0) || !(inp.sessionMove > 0)) return [];
  return horizons.map((h) => buildCone(inp, h));
}

/* ── frozen 09:40 cone + move vs priced ── */
export const FREEZE_MIN = 580; // 09:40 ET
export interface FrozenCone {
  date: string;
  anchorSpot: number;
  anchorAt: number;
  sessionMove: number;
  skew: number;
  /** 1σ from the anchor to that day's close. */
  daySd: number;
}

/** Should a read at `nowMs` freeze today's cone (first read in 09:40–16:00 ET on a weekday)? Pure. */
export function shouldFreeze(nowMs: number, existing: FrozenCone | null | undefined): boolean {
  const { date, min } = etParts(nowMs);
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (wd === 0 || wd === 6 || min < FREEZE_MIN || min >= RTH_CLOSE) return false;
  return !existing || existing.date !== date;
}

/** Variance share of `date`'s RTH between two instants (no overnight). Pure. */
function shareBetween(date: string, a: number, b: number, curve: number[]): number {
  const open = etInstant(date, RTH_OPEN);
  let s = 0;
  for (let k = 0; k < 78; k++) {
    const t0 = open + k * 300_000; const t1 = t0 + 300_000;
    const ov = Math.max(0, Math.min(b, t1) - Math.max(a, t0));
    if (ov > 0) s += curve[k] * (ov / 300_000);
  }
  return s;
}

export function freezeCone(spot: number, sessionMove: number, nowMs: number, curve?: number[], skew = 0, overnightShare = 0.2): FrozenCone {
  const { date } = etParts(nowMs);
  const c = curveOf(curve);
  const share = (1 - overnightShare) * shareBetween(date, nowMs, etInstant(date, RTH_CLOSE), c);
  return { date, anchorSpot: spot, anchorAt: nowMs, sessionMove, skew: clampSkew(skew), daySd: sessionMove * Math.sqrt(share) };
}

export interface MoveVsPriced {
  move: number;
  /** σ priced for the elapsed time since the anchor. */
  pricedSoFar: number;
  /** move ÷ pricedSoFar (signed). */
  sigmas: number | null;
  /** |move| ÷ the frozen day's 1σ. */
  ofDay: number | null;
  text: string;
}

/** Realized move since the frozen anchor vs what the cone priced. Pure. */
export function moveVsPriced(f: FrozenCone, spotNow: number, nowMs: number, curve?: number[], overnightShare = 0.2): MoveVsPriced | null {
  if (!(spotNow > 0) || etParts(nowMs).date !== f.date || nowMs <= f.anchorAt) return null;
  const c = curveOf(curve);
  const end = Math.min(nowMs, etInstant(f.date, RTH_CLOSE));
  const pricedSoFar = f.sessionMove * Math.sqrt((1 - overnightShare) * shareBetween(f.date, f.anchorAt, end, c));
  const move = spotNow - f.anchorSpot;
  const sigmas = pricedSoFar > 0 ? move / pricedSoFar : null;
  const ofDay = f.daySd > 0 ? Math.abs(move) / f.daySd : null;
  const sgn = move >= 0 ? '+' : '−';
  const text = `${sgn}${Math.abs(move).toFixed(2)} since 09:40 · ${sigmas == null ? '—' : `${sigmas >= 0 ? '+' : '−'}${Math.abs(sigmas).toFixed(2)}σ`} of priced-so-far · ${ofDay == null ? '—' : `${Math.round(ofDay * 100)}%`} of the day's 1σ`;
  return { move, pricedSoFar, sigmas, ofDay, text };
}
