/**
 * NEXUS GRADE — the ONE grade shown for a setup on every surface (NEXUS rows,
 * grid and detail, Today, ticker, Catalyst, Quantinum, Discord, bot, journal,
 * alerts, trade audit). Pure; server and client call the same functions, and
 * every surface renders it through formatNexusGrade() so the same idea shows the
 * same letter and the same integer score everywhere.
 *
 * WHAT IT IS — label it once, exactly like NEXUS_GRADE_CAVEAT:
 *   an ACTIONABILITY score — how strong and how takeable the plan is right now.
 *   UNVALIDATED. NOT a win probability. Legacy scores (raw conviction points,
 *   confidence %, S/A/B/C bands) live only inside a collapsed
 *   "diagnostics (unvalidated)" section.
 *
 * FACTORS (g2, 0–100, they sum to 100) — docs/NEXUS_GRADE_G2_2026-10-03.md
 *   confluence   25  conviction display scale (shared/conviction-display.ts) × 25
 *   technical    15  positive technical / ta / structure layer points, capped at 10 raw
 *   live validity 25 fresh or carried 25 · stale 5 · resolved 0 (shared/setup-lifecycle.ts)
 *   window left  25  fraction of the setup's own holding window still ahead (0 unless live)
 *   session      10  published in the current ET session (and still live)
 *
 * LETTERS  A ≥ 90 · B ≥ 80 · C ≥ 65 · D ≥ 45 · F < 45, applied to the ROUNDED
 *          integer score (so "B 90" can never be displayed).
 *
 * EVIDENCE CAVEAT (docs/GRADE_AUDIT_2026-10-01.md): on the 443 bar-verified ideas the
 * confluence-family count ranked NEGATIVELY in both walk-forward halves, and raw R:R
 * did too. g2 weights confluence + technical at 40/100 because the operator asked for
 * a composite that rewards the strong-looking setup. Every published idea and every
 * bot entry logs its components (gradeComponentsTag / nexusGradeAtPublish) so
 * research/grade-audit.ts can test the weights out of sample.
 *
 * ── GRADE v3 (GRADE_VERSION=v3; default stays g2) ─────────────────────────
 * research/grade-v3-study.ts (verified-book study) · research/grade-audit.ts (v2 vs v3)
 * Two parts, shown together, never summed:
 *   QUALITY (0–100, the letter)  stop ≥ 1.25×ATR(14) 40 · not chased 30 · trend/regime
 *                                aligned 30 — a conservative structural PRIOR until the
 *                                study validates a feature (V3_VALIDATED). Shorts are not
 *                                penalised; confluence, R:R, gap, GEX are listed at 0 pts
 *                                ("measuring") — they did not rank outcomes.
 *   ACTIONABILITY (a state)      live validity, window left, session freshness → "actionable
 *                                now" / "not actionable now"; a gate and a sort tiebreak,
 *                                never points on the letter.
 * Version: explicit input → setGradeVersion() → env GRADE_VERSION (server) → the pick
 * carrying server-stamped `gradeInputs` (client; the server stamps them only under v3).
 */
import { convictionDisplayPercent } from './conviction-display';
import { etDay, publishMsOf, setupLifecycle, type LifecycleInput, type LifecycleRead, type SetupLifecycle } from './setup-lifecycle';
import { atr as atrOf, completedThrough, ema, type DayBar } from './setup-features';

export const NEXUS_GRADE_VERSION = 'g2-2026-10-03';
export const NEXUS_GRADE_LABEL = 'NEXUS grade';
export const NEXUS_GRADE_CAVEAT = 'actionability score — unvalidated, not a win probability';
export const NEXUS_GRADE_POINTS = Object.freeze({ evidence: 25, technical: 15, valid: 25, stale: 5, resolved: 0, window: 25, session: 10 } as const);
/** Raw positive technical/ta/structure points that earn the full technical factor. */
export const NEXUS_TECHNICAL_CAP = 10;
export const NEXUS_GRADE_LETTERS: ReadonlyArray<readonly [number, NexusGradeLetter]> = Object.freeze([[90, 'A'], [80, 'B'], [65, 'C'], [45, 'D']] as const);

export type NexusGradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';
export type GradeFactorKey = 'evidence' | 'technical' | 'lifecycle' | 'window' | 'session'
  | 'stop' | 'chase' | 'regime' | 'short' | 'confluence' | 'rr' | 'gap' | 'gex';
/** v3: validated = held fit-one-half-test-other on the verified book; prior = structural prior; measuring = shown at 0 pts. */
export type GradeFeatureStatus = 'validated' | 'prior' | 'measuring';
export interface GradeFactor {
  key: GradeFactorKey; label: string; points: number; max: number; validated: boolean;
  basis: 'measured evidence' | 'live gate' | 'timing' | 'structure';
  /** v3 only: validation status of this feature and the one-line evidence note. */
  status?: GradeFeatureStatus; note?: string;
}
/** v3 only — actionability is a STATE (gate + sort tiebreak), never points on the letter. */
export interface GradeAction {
  state: 'actionable' | 'not_actionable';
  label: 'actionable now' | 'not actionable now';
  lifecycle: SetupLifecycle;
  windowLeft: number;
  currentSession: boolean;
  /** 0–1 tiebreak within one quality score (window left 0.6 + current session 0.4). */
  rank: number;
  reasons: string[];
}
export interface NexusGrade {
  score: number; letter: NexusGradeLetter; factors: GradeFactor[]; top: GradeFactor[]; validated: boolean; version: string;
  /** v3 only. */
  action?: GradeAction;
  /** v3 only: the measured inputs the quality part read. */
  inputs?: GradeV3Inputs | null;
}
export interface GradeInput {
  lifecycle: SetupLifecycle;
  publishMs: number | null;
  windowEndsMs: number | null;
  publishedDay: string | null;
  today: string;
  nowMs: number;
  convictionScore?: number | null;
  layers?: ReadonlyArray<{ kind?: string | null; points?: number | null }> | null;
  /** v3: measured quality inputs (server-stamped). */
  gradeInputs?: GradeV3Inputs | null;
  /** v3: plan fields the measuring rows read. */
  direction?: string | null;
  riskRewardRatio?: number | null;
  /** Force a version (tests / audit); else activeGradeVersion(). */
  version?: GradeVersion;
}

export function letterFor(score: number): NexusGradeLetter {
  const s = Number.isFinite(score) ? Math.round(score) : 0;
  for (const [cut, l] of NEXUS_GRADE_LETTERS) if (s >= cut) return l;
  return 'F';
}
/** Kept for the read-only historical audit; rotation is not a grade factor. */
export function rotationAligned(layers: GradeInput['layers']): boolean {
  if (!layers?.length) return false;
  let sum = 0, seen = false;
  for (const l of layers) {
    if (String(l?.kind ?? '') !== 'sector') continue;
    const p = Number(l?.points);
    if (Number.isFinite(p)) { sum += p; seen = true; }
  }
  return seen && sum > 0;
}
export function windowLeft(publishMs: number | null, windowEndsMs: number | null, nowMs: number): number {
  if (publishMs == null || windowEndsMs == null || !(windowEndsMs > publishMs)) return 0;
  return Math.max(0, Math.min(1, (windowEndsMs - nowMs) / (windowEndsMs - publishMs)));
}
/** Positive technical / ta / structure points (the "overview / technical" read). */
export function technicalPoints(layers: GradeInput['layers']): number {
  return (layers ?? [])
    .filter((l) => /^(technical|ta|structure)$/i.test(String(l?.kind ?? '')))
    .reduce((s, l) => { const p = Number(l?.points); return s + (Number.isFinite(p) && p > 0 ? p : 0); }, 0);
}
const round1 = (x: number) => Math.round(x * 10) / 10;

export function nexusGrade(i: GradeInput): NexusGrade {
  return resolveGradeVersion(i) === 'v3' ? nexusGradeV3(i) : nexusGradeG2(i);
}

export function nexusGradeG2(i: GradeInput): NexusGrade {
  const P = NEXUS_GRADE_POINTS;
  const live = i.lifecycle === 'fresh' || i.lifecycle === 'carried';
  const evidencePct = i.convictionScore == null || !Number.isFinite(Number(i.convictionScore)) ? 0 : convictionDisplayPercent(Number(i.convictionScore));
  const technicalPct = Math.min(1, technicalPoints(i.layers) / NEXUS_TECHNICAL_CAP) * 100;
  const left = live ? windowLeft(i.publishMs, i.windowEndsMs, i.nowMs) : 0;
  const current = live && i.publishedDay != null && i.publishedDay === i.today;
  const factors: GradeFactor[] = [
    { key: 'evidence', label: `confluence ${evidencePct}/100`, points: round1(P.evidence * evidencePct / 100), max: P.evidence, validated: false, basis: 'measured evidence' },
    { key: 'technical', label: `technical ${Math.round(technicalPct)}/100`, points: round1(P.technical * technicalPct / 100), max: P.technical, validated: false, basis: 'measured evidence' },
    { key: 'lifecycle', label: live ? 'live & valid' : i.lifecycle, points: live ? P.valid : i.lifecycle === 'stale' ? P.stale : P.resolved, max: P.valid, validated: false, basis: 'live gate' },
    { key: 'window', label: `${Math.round(left * 100)}% of window left`, points: round1(P.window * left), max: P.window, validated: false, basis: 'timing' },
    { key: 'session', label: current ? 'current session' : 'earlier session', points: current ? P.session : 0, max: P.session, validated: false, basis: 'timing' },
  ];
  // One integer score everywhere; the letter is read off the same integer.
  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
  const top = factors.map((f, idx) => ({ f, idx })).sort((a, b) => b.f.points - a.f.points || a.idx - b.idx).slice(0, 3).map(({ f }) => f);
  return { score, letter: letterFor(score), factors, top, validated: false, version: NEXUS_GRADE_VERSION };
}


// ══════════════════════════════════════════════════════════════════════════
// GRADE v3 — QUALITY (letter) + ACTIONABILITY (state). Pure.
// ══════════════════════════════════════════════════════════════════════════
export type GradeVersion = 'g2' | 'v3';
export const NEXUS_GRADE_V3_VERSION = 'v3-2026-10-07';
export const NEXUS_GRADE_V3_CAVEAT = 'quality grade — structural prior, unvalidated, not a win probability';
/** Quality points (sum 100). Only these three features earn points under the prior. */
export const V3_QUALITY_POINTS = Object.freeze({ stop: 40, chase: 30, regime: 30 } as const);
/** Prior thresholds. stop: 0 pts ≤ 0.5×ATR, full ≥ 1.25×ATR (linear between). chase: full ≤ 0.25 ATR past entry, 0 ≥ 1 ATR. */
export const V3_PRIOR = Object.freeze({ stopZero: 0.5, stopFull: 1.25, chaseFree: 0.25, chaseZero: 1.0 } as const);

/**
 * Measured quality inputs — computed ONCE at first board surfacing (server/grade-v3-inputs.ts)
 * from completed daily bars, persisted to convergence_signals_json.gradeInputs and carried on
 * the pick. research/grade-v3-study.ts computes the same fields with the same function.
 */
export interface GradeV3Inputs {
  v: 'v3';
  /** ISO time the inputs were measured (first surfacing ≈ publish). */
  at: string;
  /** Daily ATR(14) of the underlying from sessions completed before `at`. */
  atr: number | null;
  /** |entry − stop| ÷ ATR on underlying levels; null for premium-level option plans. */
  stopAtr: number | null;
  /** side × (price at measurement − entry) ÷ ATR. > 0 = price already past the entry in the trade's direction. */
  chaseAtr: number | null;
  /** SPY trend vs the trade (last completed close vs EMA20, ±0.25%): +1 with, −1 against, 0 flat. */
  regime: -1 | 0 | 1 | null;
  /** side × (today's open − prior close) ÷ ATR (measuring only). */
  gapAtr?: number | null;
}

/**
 * Validated bucket tables — EMPTY until research/grade-v3-study.ts shows a feature holding
 * fit-one-half-test-other on the verified book. The study prints a paste-ready entry
 * ({ edges, points }); a feature with an entry here is scored from it and shown "validated".
 * Points must be monotone and within 0..V3_QUALITY_POINTS[key].
 */
export const V3_VALIDATED: Readonly<Partial<Record<'stop' | 'chase' | 'regime', { edges: number[]; points: number[]; note: string }>>> = Object.freeze({});

export function readGradeVersion(env: Record<string, string | undefined> | null | undefined): GradeVersion {
  return String(env?.GRADE_VERSION ?? '').trim().toLowerCase() === 'v3' ? 'v3' : 'g2';
}
let forcedVersion: GradeVersion | null = null;
/** Pin the version for this process (client: from the convictions payload's gradeVersion; tests). null = unpin. */
export function setGradeVersion(v: GradeVersion | null): void { forcedVersion = v; }
function envOrNull(): Record<string, string | undefined> | null {
  const p = (globalThis as any).process;
  return p && p.env && typeof p.env === 'object' ? p.env : null;
}
/** The version in force: setGradeVersion() → env GRADE_VERSION (server; unset = g2) → null (browser: decide per pick). */
export function activeGradeVersion(): GradeVersion | null {
  if (forcedVersion) return forcedVersion;
  const env = envOrNull();
  return env ? readGradeVersion(env) : null;
}
export function resolveGradeVersion(i: Pick<GradeInput, 'version' | 'gradeInputs'>): GradeVersion {
  return i.version ?? activeGradeVersion() ?? (i.gradeInputs?.v === 'v3' ? 'v3' : 'g2');
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const fmtX = (x: number) => `${x.toFixed(2)}×ATR`;
function tablePoints(t: { edges: number[]; points: number[] }, x: number): number {
  let i = 0; while (i < t.edges.length && x >= t.edges[i]) i++;
  return t.points[Math.min(i, t.points.length - 1)];
}

/** Stop width prior: 0 at ≤ 0.5×ATR, full at ≥ 1.25×ATR. */
export function v3StopPoints(stopAtr: number | null | undefined): number {
  if (stopAtr == null || !Number.isFinite(stopAtr)) return 0;
  const t = V3_VALIDATED.stop; if (t) return tablePoints(t, stopAtr);
  return round1(V3_QUALITY_POINTS.stop * clamp01((stopAtr - V3_PRIOR.stopZero) / (V3_PRIOR.stopFull - V3_PRIOR.stopZero)));
}
/** Chase prior: full when ≤ 0.25 ATR past the entry (or still before it), 0 at ≥ 1 ATR past. */
export function v3ChasePoints(chaseAtr: number | null | undefined): number {
  if (chaseAtr == null || !Number.isFinite(chaseAtr)) return 0;
  const t = V3_VALIDATED.chase; if (t) return tablePoints(t, chaseAtr);
  return round1(V3_QUALITY_POINTS.chase * (1 - clamp01((chaseAtr - V3_PRIOR.chaseFree) / (V3_PRIOR.chaseZero - V3_PRIOR.chaseFree))));
}
/** Regime prior: with the SPY trend full, flat half, against 0. */
export function v3RegimePoints(regime: number | null | undefined): number {
  if (regime == null || !Number.isFinite(regime)) return 0;
  const t = V3_VALIDATED.regime; if (t) return tablePoints(t, regime);
  return regime > 0 ? V3_QUALITY_POINTS.regime : regime < 0 ? 0 : V3_QUALITY_POINTS.regime / 2;
}
const statusOf = (k: 'stop' | 'chase' | 'regime'): GradeFeatureStatus => (V3_VALIDATED[k] ? 'validated' : 'prior');

/** Families counted as confluence (shown, not scored). */
const V3_CONF_FAMILIES = ['technical', 'structure', 'regime', 'ta', 'premarket', 'breadth', 'compression', 'gex'];
export function confluenceFamilies(layers: GradeInput['layers']): number {
  const sum: Record<string, number> = {};
  for (const l of layers ?? []) { const k = String(l?.kind ?? ''); const p = Number(l?.points); if (k && Number.isFinite(p)) sum[k] = (sum[k] ?? 0) + p; }
  return V3_CONF_FAMILIES.filter((k) => (sum[k] ?? 0) > 0).length;
}

export function gradeAction(i: Pick<GradeInput, 'lifecycle' | 'publishMs' | 'windowEndsMs' | 'publishedDay' | 'today' | 'nowMs'>): GradeAction {
  const live = i.lifecycle === 'fresh' || i.lifecycle === 'carried';
  const left = live ? windowLeft(i.publishMs, i.windowEndsMs, i.nowMs) : 0;
  const current = live && i.publishedDay != null && i.publishedDay === i.today;
  // An unreadable window (no publish time) on a live plan stays actionable — the lifecycle read decides.
  const windowOpen = left > 0 || (live && (i.publishMs == null || i.windowEndsMs == null));
  const actionable = live && windowOpen;
  const reasons = [
    live ? 'live & valid' : i.lifecycle === 'stale' ? 'stale — past its window' : 'resolved — stop/target hit or closed',
    `${Math.round(left * 100)}% of window left`,
    current ? 'current session' : 'earlier session',
  ];
  return {
    state: actionable ? 'actionable' : 'not_actionable', label: actionable ? 'actionable now' : 'not actionable now',
    lifecycle: i.lifecycle, windowLeft: Math.round(left * 100) / 100, currentSession: current,
    rank: Math.round((0.6 * left + (current ? 0.4 : 0)) * 1000) / 1000, reasons,
  };
}

export function nexusGradeV3(i: GradeInput): NexusGrade {
  const q = i.gradeInputs ?? null;
  const short = String(i.direction ?? '').toLowerCase() === 'short';
  const conf = confluenceFamilies(i.layers);
  const rr = i.riskRewardRatio != null && Number.isFinite(Number(i.riskRewardRatio)) ? Number(i.riskRewardRatio) : null;
  const P = V3_QUALITY_POINTS;
  const regimeTxt = q?.regime == null ? 'regime: no SPY read' : q.regime > 0 ? 'with the SPY trend' : q.regime < 0 ? 'against the SPY trend' : 'SPY trend flat';
  const factors: GradeFactor[] = [
    { key: 'stop', label: q?.stopAtr == null ? 'stop width: no ATR read' : `stop ${fmtX(q.stopAtr)}`, points: v3StopPoints(q?.stopAtr), max: P.stop, validated: statusOf('stop') === 'validated', basis: 'structure', status: statusOf('stop'),
      note: V3_VALIDATED.stop?.note ?? `full at ≥ ${V3_PRIOR.stopFull}×ATR(14); stop width held sign in both halves (443 ideas, ρ +0.23/+0.11); median NEXUS stop was 0.51×ATR` },
    { key: 'chase', label: q?.chaseAtr == null ? 'entry: no publish price' : q.chaseAtr > V3_PRIOR.chaseFree ? `chased ${fmtX(q.chaseAtr)} past entry` : 'not chased', points: v3ChasePoints(q?.chaseAtr), max: P.chase, validated: statusOf('chase') === 'validated', basis: 'structure', status: statusOf('chase'),
      note: V3_VALIDATED.chase?.note ?? `full when price is ≤ ${V3_PRIOR.chaseFree} ATR past the entry at surfacing; gap-with-trade ranked negatively in both halves` },
    { key: 'regime', label: regimeTxt, points: v3RegimePoints(q?.regime), max: P.regime, validated: statusOf('regime') === 'validated', basis: 'structure', status: statusOf('regime'),
      note: V3_VALIDATED.regime?.note ?? 'SPY last completed close vs its EMA20, read against the trade; flat earns half' },
    { key: 'short', label: short ? 'short — not penalised' : 'long', points: 0, max: 0, validated: false, basis: 'structure', status: 'measuring', note: 'shorts ranked positively in both halves but failed fit-one-half-test-other' },
    { key: 'confluence', label: `${conf} confluence ${conf === 1 ? 'family' : 'families'} — not rewarded`, points: 0, max: 0, validated: false, basis: 'measured evidence', status: 'measuring', note: 'confluence-family count ranked NEGATIVELY in both halves (−0.11/−0.13)' },
    { key: 'rr', label: rr == null ? 'R:R n/a — not rewarded' : `R:R ${rr.toFixed(1)} — not rewarded`, points: 0, max: 0, validated: false, basis: 'structure', status: 'measuring', note: 'raw R:R ranked negatively in both halves (−0.17/−0.21)' },
    { key: 'gap', label: q?.gapAtr == null ? 'gap: n/a' : `gap ${q.gapAtr >= 0 ? '+' : ''}${q.gapAtr.toFixed(2)}×ATR with trade`, points: 0, max: 0, validated: false, basis: 'structure', status: 'measuring', note: 'gap with the trade held sign (negative) but failed fit-one-half-test-other' },
  ];
  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
  const scored = factors.filter((f) => f.max > 0);
  const top = scored.map((f, idx) => ({ f, idx })).sort((a, b) => b.f.points - a.f.points || a.idx - b.idx).slice(0, 3).map(({ f }) => f);
  const validated = scored.every((f) => f.status === 'validated');
  return { score, letter: letterFor(score), factors, top, validated, version: NEXUS_GRADE_V3_VERSION, action: gradeAction(i), inputs: q };
}

const byDay = (x: DayBar, y: DayBar) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0);
/**
 * Derive v3 quality inputs from bars. `daily` = the underlying's daily bars (any order, may include
 * the current session — only sessions completed before `atMs` are used); `spyDaily` likewise.
 * `levelsUnderlying` false (premium-level option plan) → no stop/chase read.
 */
export function gradeV3InputsFrom(a: {
  direction: string; entry: number; stop: number; price: number | null; atMs: number; levelsUnderlying: boolean;
  daily: DayBar[]; spyDaily: DayBar[]; crypto?: boolean; todayOpen?: number | null;
}): GradeV3Inputs {
  const side = String(a.direction).toLowerCase() === 'short' ? -1 : 1;
  const sorted = [...a.daily].sort(byDay);
  const done = sorted.slice(0, completedThrough(sorted, a.atMs, !!a.crypto));
  const atr = done.length >= 15 ? atrOf(done.slice(-60), 14) : null;
  const ok = atr != null && atr > 0;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const stopAtr = ok && a.levelsUnderlying && a.entry > 0 && a.stop > 0 && a.entry !== a.stop ? r3(Math.abs(a.entry - a.stop) / atr!) : null;
  const chaseAtr = ok && a.levelsUnderlying && a.price != null && a.price > 0 && a.entry > 0 ? r3((side * (a.price - a.entry)) / atr!) : null;
  const spy = [...a.spyDaily].sort(byDay);
  const spyDone = spy.slice(0, completedThrough(spy, a.atMs));
  const e20 = spyDone.length >= 20 ? ema(spyDone.map((b) => b.c), 20) : null;
  const last = spyDone[spyDone.length - 1]?.c ?? null;
  let regime: -1 | 0 | 1 | null = null;
  if (e20 != null && last != null && e20 > 0) {
    const d = (last - e20) / e20;
    const trend = d > 0.0025 ? 1 : d < -0.0025 ? -1 : 0;
    regime = (trend === 0 ? 0 : trend * side) as -1 | 0 | 1;
  }
  const prevClose = done[done.length - 1]?.c ?? null;
  const gapAtr = ok && a.todayOpen != null && prevClose != null ? r3((side * (a.todayOpen - prevClose)) / atr!) : null;
  return { v: 'v3', at: new Date(a.atMs).toISOString(), atr: ok ? r3(atr!) : null, stopAtr, chaseAtr, regime, gapAtr };
}

/** Coerce a stored/wired value to GradeV3Inputs (null when it is not one). */
export function readGradeInputs(x: unknown): GradeV3Inputs | null {
  if (!x || typeof x !== 'object' || (x as any).v !== 'v3') return null;
  const o = x as any;
  const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const reg = n(o.regime);
  return { v: 'v3', at: String(o.at ?? ''), atr: n(o.atr), stopAtr: n(o.stopAtr), chaseAtr: n(o.chaseAtr), regime: reg == null ? null : ((reg > 0 ? 1 : reg < 0 ? -1 : 0) as -1 | 0 | 1), gapAtr: n(o.gapAtr) };
}

// ══════════════════════════════════════════════════════════════════════════
// Shared surface API (g2 + v3)
// ══════════════════════════════════════════════════════════════════════════
export function whyRankedHere(g: Pick<NexusGrade, 'top'>): string { return g.top.map((f) => `${f.label} +${f.points}`).join(' · '); }

/** One factor label, short enough for a board row ("live", "85% window", "stop 1.4×ATR"). */
export function shortFactorLabel(f: Pick<GradeFactor, 'key' | 'label'>): string {
  const l = String(f.label);
  switch (f.key) {
    case 'lifecycle': return l === 'live & valid' ? 'live' : l.split(' ')[0];
    case 'window': return l.replace(' of window left', ' window');
    case 'session': return l === 'current session' ? 'today' : 'earlier';
    case 'evidence': return l.replace('confluence ', 'confl ').replace('/100', '');
    case 'technical': return l.replace('technical ', 'tech ').replace('/100', '');
    case 'chase': return l.startsWith('chased') ? l.replace(' past entry', '') : l;
    default: return l.length > 22 ? `${l.slice(0, 21)}…` : l;
  }
}
/**
 * The board row's "why" line: the top two drivers, short labels, no point
 * arithmetic ("live · 85% window"). The full breakdown stays in the grade
 * chip's title and the Setup Detail (whyThisGrade).
 */
export function whyShort(g: Pick<NexusGrade, 'top'>, n = 2): string {
  return g.top.filter((f) => f.points > 0).slice(0, n).map(shortFactorLabel).join(' · ');
}

type PickExtras = { layers?: GradeInput['layers']; convictionScore?: number | null; gradeInputs?: unknown; riskRewardRatio?: number | null };

export function gradeFromLife(
  life: Pick<LifecycleRead, 'state' | 'publishedDay' | 'windowEndsMs'>,
  pick: Pick<LifecycleInput, 'calledAt' | 'generatedAt'> & { direction?: string | null } & PickExtras,
  nowMs: number,
): NexusGrade {
  return nexusGrade({
    lifecycle: life.state, publishMs: publishMsOf(pick), windowEndsMs: life.windowEndsMs, publishedDay: life.publishedDay, today: etDay(nowMs), nowMs,
    layers: pick.layers, convictionScore: pick.convictionScore, gradeInputs: readGradeInputs(pick.gradeInputs),
    direction: pick.direction ?? null, riskRewardRatio: pick.riskRewardRatio ?? null,
  });
}
export function gradePick(pick: LifecycleInput & PickExtras, nowMs: number = Date.now()): NexusGrade {
  return gradeFromLife(setupLifecycle(pick, nowMs), pick, nowMs);
}

/**
 * A stored trade idea (DB row / API row) → the pick shape the grade reads.
 * The board's convictionScore/layers are the generation-time stamp
 * (genConvictionScore / genScoringLayers) unless the caller has live ones.
 */
export interface IdeaRowLike {
  direction?: string | null; entryPrice?: number | null; stopLoss?: number | null; targetPrice?: number | null;
  assetType?: string | null; holdingPeriod?: string | null; source?: string | null; expiryDate?: string | null;
  timestamp?: string | null; generationTimestamp?: string | null; exitBy?: string | null; outcomeStatus?: string | null;
  genConvictionScore?: number | null; genScoringLayers?: unknown; convictionScore?: number | null; layers?: unknown;
  currentPrice?: number | null; riskRewardRatio?: number | null;
  /** v3 inputs: a wired `gradeInputs`, else convergenceSignalsJson.gradeInputs. */
  gradeInputs?: unknown; convergenceSignalsJson?: unknown;
}
export function pickFromIdeaRow(row: IdeaRowLike): LifecycleInput & { layers: GradeInput['layers']; convictionScore: number | null; gradeInputs: GradeV3Inputs | null; riskRewardRatio: number | null } {
  const layers = (Array.isArray(row.layers) ? row.layers : Array.isArray(row.genScoringLayers) ? row.genScoringLayers : []) as GradeInput['layers'];
  const resolved = row.outcomeStatus != null && row.outcomeStatus !== '' && row.outcomeStatus !== 'open';
  const csj = row.convergenceSignalsJson && typeof row.convergenceSignalsJson === 'object' ? (row.convergenceSignalsJson as any) : null;
  return {
    direction: String(row.direction ?? 'long'),
    entryPrice: Number(row.entryPrice ?? 0), stopLoss: Number(row.stopLoss ?? 0), targetPrice: Number(row.targetPrice ?? 0),
    assetType: row.assetType ?? null, holdingPeriod: row.holdingPeriod ?? null, source: row.source ?? null,
    expiryDate: row.expiryDate ?? null, calledAt: row.timestamp ?? null, generatedAt: row.generationTimestamp ?? null,
    exitBy: row.exitBy ?? null, lifecycleState: resolved ? 'closed' : null, currentPrice: row.currentPrice ?? null,
    layers, convictionScore: row.convictionScore ?? row.genConvictionScore ?? null,
    gradeInputs: readGradeInputs(row.gradeInputs ?? csj?.gradeInputs), riskRewardRatio: row.riskRewardRatio ?? null,
  };
}
export function gradeIdeaRow(row: IdeaRowLike, nowMs: number = Date.now()): NexusGrade {
  return gradePick(pickFromIdeaRow(row), nowMs);
}

/**
 * The grade AS PUBLISHED — at first board surfacing (generationTimestamp when it
 * is at/after the publish, else the publish instant), before any outcome. The
 * journal and the audit use this; a live surface uses gradePick / gradeIdeaRow.
 */
export function gradeIdeaRowAtPublish(row: IdeaRowLike): NexusGrade | null {
  const pub = Date.parse(String(row.timestamp ?? ''));
  if (!Number.isFinite(pub)) return null;
  const gen = Date.parse(String(row.generationTimestamp ?? ''));
  const at = Number.isFinite(gen) && gen >= pub ? gen : pub;
  const pick = { ...pickFromIdeaRow(row), lifecycleState: null, currentPrice: null };
  return gradePick(pick, at);
}

type Shown = Pick<NexusGrade, 'letter' | 'score'> & Partial<Pick<NexusGrade, 'version' | 'action'>>;
/**
 * THE display string: "B 84". Every surface renders the grade through this.
 * v3 appends the actionability STATE when the plan is not actionable: "B 84 · not now".
 */
export function formatNexusGrade(g: Shown): string {
  const base = `${g.letter} ${g.score}`;
  return g.action && g.action.state === 'not_actionable' ? `${base} · not now` : base;
}
export function nexusGradeCaveat(g?: Partial<Pick<NexusGrade, 'version'>> | null): string {
  return String(g?.version ?? '').startsWith('v3') ? NEXUS_GRADE_V3_CAVEAT : NEXUS_GRADE_CAVEAT;
}
/** Long form for embeds/tooltips: "NEXUS grade B 84/100 — actionability score — unvalidated, not a win probability" (v3: "… B 84/100 · actionable now — quality grade …"). */
export function nexusGradeLine(g: Shown): string {
  const state = g.action ? ` · ${g.action.label}` : '';
  return `${NEXUS_GRADE_LABEL} ${g.letter} ${g.score}/100${state} — ${nexusGradeCaveat(g)}`;
}
/** Every factor with its points: "confluence 86/100 21.5/25 · technical …" (v3: "stop 1.40×ATR 40/40 [prior] · … · actionable now (…)"). */
export function gradeBreakdown(g: Pick<NexusGrade, 'factors'> & Partial<Pick<NexusGrade, 'action'>>): string {
  const parts = g.factors.map((f) => (f.status ? `${f.label} ${f.points}/${f.max} [${f.status}]` : `${f.label} ${f.points}/${f.max}`));
  if (g.action) parts.push(`${g.action.label} (${g.action.reasons.join(', ')})`);
  return parts.join(' · ');
}
/** "Why this grade" rows for the detail view: every feature, its points and its validation status. */
export interface WhyRow { key: string; label: string; points: number; max: number; status: GradeFeatureStatus | 'unvalidated' | 'state'; note: string }
export function whyThisGrade(g: NexusGrade): WhyRow[] {
  const rows: WhyRow[] = g.factors.map((f) => ({
    key: f.key, label: f.label, points: f.points, max: f.max, status: f.status ?? 'unvalidated',
    note: f.note ?? (f.basis === 'live gate' || f.basis === 'timing' ? 'actionability (g2 adds it to the score)' : 'g2 weight — not validated'),
  }));
  if (g.action) rows.push({ key: 'action', label: g.action.label, points: 0, max: 0, status: 'state', note: `${g.action.reasons.join(' · ')} — a gate and sort tiebreak, not points` });
  return rows;
}
const LETTER_RANK: Record<NexusGradeLetter, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
/** Letter ≥ min. v3: the plan must also be actionable now (the v3 letter no longer encodes liveness). */
export function gradeAtLeast(g: Pick<NexusGrade, 'letter'> & Partial<Pick<NexusGrade, 'action'>>, min: NexusGradeLetter): boolean {
  if (g.action && g.action.state !== 'actionable') return false;
  return LETTER_RANK[g.letter] >= LETTER_RANK[min];
}
/** Live & valid. g2: the lifecycle factor at full points; v3: the action state. */
export function isGradeLive(g: Pick<NexusGrade, 'factors'> & Partial<Pick<NexusGrade, 'action'>>): boolean {
  if (g.action) return g.action.state === 'actionable';
  const life = g.factors.find((f) => f.key === 'lifecycle');
  return !!life && life.points >= NEXUS_GRADE_POINTS.valid;
}
/**
 * Board sort value. g2: the score. v3: actionable plans first, then quality score, then
 * the actionability rank as a tiebreak (it never changes the letter).
 */
export function gradeSortValue(g: { score: number; action?: Pick<GradeAction, 'state' | 'rank'> | null } | null | undefined): number {
  if (!g) return -1;
  if (!g.action) return g.score;
  return (g.action.state === 'actionable' ? 1000 : 0) + g.score + Math.min(0.999, Math.max(0, g.action.rank));
}

/** Compact, parseable component record for validation logs (research/grade-audit.ts). */
export interface NexusGradeComponents {
  v: string; letter: NexusGradeLetter; score: number; at: string; f: Partial<Record<GradeFactorKey, number>>;
  /** v3: measured inputs + action state. */
  q?: GradeV3Inputs | null; a?: { state: GradeAction['state']; windowLeft: number; session: boolean; lifecycle: SetupLifecycle };
}
export function gradeComponents(g: NexusGrade, atMs: number = Date.now()): NexusGradeComponents {
  const f: Partial<Record<GradeFactorKey, number>> = {};
  for (const x of g.factors) if (x.max > 0 || !g.action) f[x.key] = x.points;
  const out: NexusGradeComponents = { v: g.version, letter: g.letter, score: g.score, at: new Date(atMs).toISOString(), f };
  if (g.action) { out.q = g.inputs ?? null; out.a = { state: g.action.state, windowLeft: g.action.windowLeft, session: g.action.currentSession, lifecycle: g.action.lifecycle }; }
  return out;
}
/** One-line tag: "nexus-grade:g2-2026-10-03:B:84|evidence=21.5|technical=9|lifecycle=25|window=18.5|session=10" (v3: "|stop=…|chase=…|regime=…|act=actionable"). */
export function gradeComponentsTag(g: NexusGrade): string {
  const fs = g.factors.filter((f) => f.max > 0 || !g.action).map((f) => `${f.key}=${f.points}`);
  if (g.action) fs.push(`act=${g.action.state}`);
  return `nexus-grade:${g.version}:${g.letter}:${g.score}|${fs.join('|')}`;
}
