/**
 * NEXUS GRADE — the one composite that orders the NEXUS board and Today's book
 * when BOARD_SORT=grade (shared/board-sort.ts). Pure; server and client call it.
 * docs/GRADE_AUDIT_2026-10-01.md is the human statement of these rules.
 *
 * WHAT IT IS — AND IS NOT
 *   UNVALIDATED. Nothing in docs/SCORE_V2_STUDY.md held up as a ranking out of
 *   sample, and re-measuring the brief's suggested inputs on the same 443
 *   bar-verified ideas (research/grade-audit.ts --study) found:
 *     · confluence-family count: NEGATIVE in both halves (ρ −0.15 / −0.11; with
 *       the top 5 trades per half removed, 3+ families −0.22..−0.28R vs 2 at −0.04R)
 *     · R:R "sane band" (1.5–3.2): flips sign (ρ +0.22 H1 / −0.13 H2); raw R:R is
 *       negative in both halves (far targets did worse)
 *     · rotation alignment: flips / ~0 (ρ −0.07 / −0.00)
 *   So neither R:R nor confluence is rewarded here, and the evidence score is not
 *   an input at all. The grade is a transparent ACTIONABILITY order — can you still
 *   take this plan as published, and how much of its window is left — not a
 *   prediction that one setup will beat another.
 *
 * POINTS (0–100)
 *   live & valid    60   lifecycle fresh / carried (shared/setup-lifecycle.ts);
 *                        stale 10, resolved 0
 *   published today 20   ET calendar day of the publish
 *   window left     ≤15  15 × the fraction of the idea's own holding window still
 *                        ahead (its recency, normalised by its horizon)
 *   with rotation   +5   OPERATOR PRIOR, NOT VALIDATED: the sector / peers layer
 *                        is positive for the idea's side. Against or no read = 0,
 *                        never negative. Measured by research/grade-audit.ts as
 *                        `rotWith` (gen_scoring_layers sector points > 0).
 *
 * LETTERS   A ≥ 90 · B ≥ 80 · C ≥ 60 · D ≥ 10 · F < 10
 *   A fresh, most of its window ahead (or fresh + with rotation)   B fresh
 *   C carried, still valid   D stale   F resolved
 * Ties break newest first, then idea id (board-sort.ts).
 */
import { etDay, publishMsOf, setupLifecycle, type LifecycleInput, type LifecycleRead, type SetupLifecycle } from './setup-lifecycle';

export const NEXUS_GRADE_VERSION = 'g1-2026-10-01';

export const NEXUS_GRADE_POINTS = Object.freeze({
  valid: 60,
  stale: 10,
  resolved: 0,
  fresh: 20,
  window: 15,
  rotation: 5,
} as const);

export const NEXUS_GRADE_LETTERS: ReadonlyArray<readonly [number, NexusGradeLetter]> = Object.freeze([
  [90, 'A'], [80, 'B'], [60, 'C'], [10, 'D'],
] as const);

export type NexusGradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';
export type GradeFactorKey = 'lifecycle' | 'fresh' | 'window' | 'rotation';

export interface GradeFactor {
  key: GradeFactorKey;
  /** Short label for the "why ranked here" line. */
  label: string;
  points: number;
  max: number;
  /** Measured on the bar-verified record in both walk-forward halves? (none are yet) */
  validated: boolean;
  /** Where the factor's weight comes from. */
  basis: 'gate' | 'operator prior';
}

export interface NexusGrade {
  score: number;
  letter: NexusGradeLetter;
  /** Every factor, fixed order. */
  factors: GradeFactor[];
  /** The three factors that contributed most points (ties: fixed order) — "why ranked here". */
  top: GradeFactor[];
  rotationAligned: boolean;
  validated: false;
  version: string;
}

export interface GradeInput {
  lifecycle: SetupLifecycle;
  /** Publish instant (epoch ms); null = unknown. */
  publishMs: number | null;
  /** When the idea's holding window ends (setupLifecycle().windowEndsMs); null = unknown. */
  windowEndsMs: number | null;
  /** ET calendar day of the publish and of now (setupLifecycle().publishedDay / etDay(now)). */
  publishedDay: string | null;
  today: string;
  nowMs: number;
  /** The board layers; only the sector / peers layer is read. */
  layers?: ReadonlyArray<{ kind?: string | null; points?: number | null }> | null;
}

export function letterFor(score: number): NexusGradeLetter {
  const s = Number.isFinite(score) ? score : 0;
  for (const [cut, l] of NEXUS_GRADE_LETTERS) if (s >= cut) return l;
  return 'F';
}

/** With-rotation: the sector / peers layer (kind 'sector') is net positive for the idea's side. */
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

/** Fraction of the holding window still ahead, [0, 1]; 0 when it cannot be read. */
export function windowLeft(publishMs: number | null, windowEndsMs: number | null, nowMs: number): number {
  if (publishMs == null || windowEndsMs == null || !(windowEndsMs > publishMs)) return 0;
  return Math.max(0, Math.min(1, (windowEndsMs - nowMs) / (windowEndsMs - publishMs)));
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function nexusGrade(i: GradeInput): NexusGrade {
  const P = NEXUS_GRADE_POINTS;
  const live = i.lifecycle === 'fresh' || i.lifecycle === 'carried';
  const lifePts = live ? P.valid : i.lifecycle === 'stale' ? P.stale : P.resolved;
  const fresh = live && i.publishedDay != null && i.publishedDay === i.today;
  const left = live ? windowLeft(i.publishMs, i.windowEndsMs, i.nowMs) : 0;
  const rot = rotationAligned(i.layers);

  const factors: GradeFactor[] = [
    { key: 'lifecycle', label: live ? 'live & valid' : i.lifecycle, points: lifePts, max: P.valid, validated: false, basis: 'gate' },
    { key: 'fresh', label: fresh ? 'published today' : 'earlier session', points: fresh ? P.fresh : 0, max: P.fresh, validated: false, basis: 'gate' },
    { key: 'window', label: `${Math.round(left * 100)}% of window left`, points: round1(P.window * left), max: P.window, validated: false, basis: 'gate' },
    { key: 'rotation', label: rot ? 'with sector rotation (operator prior)' : 'no rotation tailwind', points: rot ? P.rotation : 0, max: P.rotation, validated: false, basis: 'operator prior' },
  ];
  const score = round1(factors.reduce((s, f) => s + f.points, 0));
  const top = factors
    .map((f, idx) => ({ f, idx }))
    .sort((a, b) => b.f.points - a.f.points || a.idx - b.idx)
    .slice(0, 3)
    .map((x) => x.f);
  return { score, letter: letterFor(score), factors, top, rotationAligned: rot, validated: false, version: NEXUS_GRADE_VERSION };
}

/** One-line "why ranked here": the top three contributors with their points. */
export function whyRankedHere(g: Pick<NexusGrade, 'top'>): string {
  return g.top.map((f) => `${f.label} +${f.points}`).join(' · ');
}

/** Grade a board pick from a lifecycle read (the client passes its live-quote read). */
export function gradeFromLife(
  life: Pick<LifecycleRead, 'state' | 'publishedDay' | 'windowEndsMs'>,
  pick: Pick<LifecycleInput, 'calledAt' | 'generatedAt'> & { layers?: GradeInput['layers'] },
  nowMs: number,
): NexusGrade {
  return nexusGrade({
    lifecycle: life.state,
    publishMs: publishMsOf(pick),
    windowEndsMs: life.windowEndsMs,
    publishedDay: life.publishedDay,
    today: etDay(nowMs),
    nowMs,
    layers: pick.layers,
  });
}

/** Grade a board pick from its own fields + the price the caller has (server: the build-time read). */
export function gradePick(pick: LifecycleInput & { layers?: GradeInput['layers'] }, nowMs: number = Date.now()): NexusGrade {
  return gradeFromLife(setupLifecycle(pick, nowMs), pick, nowMs);
}
