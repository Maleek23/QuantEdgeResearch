/**
 * NEXUS GRADE — one transparent, shared setup score for rows and detail.
 * It ranks the current plan; it is not a probability of winning. Weighting is
 * explicit so evidence, technical quality, validity and timing cannot be
 * confused as competing scores.
 */
import { convictionDisplayPercent } from './conviction-display';
import { etDay, publishMsOf, setupLifecycle, type LifecycleInput, type LifecycleRead, type SetupLifecycle } from './setup-lifecycle';

export const NEXUS_GRADE_VERSION = 'g2-2026-10-03';
export const NEXUS_GRADE_POINTS = Object.freeze({ evidence: 25, technical: 15, valid: 25, stale: 5, resolved: 0, window: 25, session: 10 } as const);
export const NEXUS_GRADE_LETTERS: ReadonlyArray<readonly [number, NexusGradeLetter]> = Object.freeze([[90, 'A'], [80, 'B'], [65, 'C'], [45, 'D']] as const);

export type NexusGradeLetter = 'A' | 'B' | 'C' | 'D' | 'F';
export type GradeFactorKey = 'evidence' | 'technical' | 'lifecycle' | 'window' | 'session';
export interface GradeFactor { key: GradeFactorKey; label: string; points: number; max: number; validated: false; basis: 'measured evidence' | 'live gate' | 'timing'; }
export interface NexusGrade { score: number; letter: NexusGradeLetter; factors: GradeFactor[]; top: GradeFactor[]; validated: false; version: string; }
export interface GradeInput {
  lifecycle: SetupLifecycle;
  publishMs: number | null;
  windowEndsMs: number | null;
  publishedDay: string | null;
  today: string;
  nowMs: number;
  convictionScore?: number | null;
  layers?: ReadonlyArray<{ kind?: string | null; points?: number | null }> | null;
}
export function letterFor(score: number): NexusGradeLetter {
  const s = Number.isFinite(score) ? score : 0;
  for (const [cut, l] of NEXUS_GRADE_LETTERS) if (s >= cut) return l;
  return 'F';
}
/** Kept for the read-only historical audit; rotation is no longer a grade bonus. */
export function rotationAligned(layers: GradeInput['layers']): boolean {
  return !!layers?.some((l) => String(l.kind ?? '') === 'sector' && Number(l.points) > 0);
}
export function windowLeft(publishMs: number | null, windowEndsMs: number | null, nowMs: number): number {
  if (publishMs == null || windowEndsMs == null || !(windowEndsMs > publishMs)) return 0;
  return Math.max(0, Math.min(1, (windowEndsMs - nowMs) / (windowEndsMs - publishMs)));
}
const round1 = (x: number) => Math.round(x * 10) / 10;

export function nexusGrade(i: GradeInput): NexusGrade {
  const P = NEXUS_GRADE_POINTS;
  const live = i.lifecycle === 'fresh' || i.lifecycle === 'carried';
  const evidencePct = i.convictionScore == null ? 0 : convictionDisplayPercent(i.convictionScore);
  const techRaw = (i.layers ?? []).filter((l) => /^(technical|ta|structure)$/i.test(String(l.kind ?? ''))).reduce((s, l) => s + (Number.isFinite(Number(l.points)) ? Number(l.points) : 0), 0);
  const technicalPct = Math.max(0, Math.min(100, (techRaw / 10) * 100));
  const left = live ? windowLeft(i.publishMs, i.windowEndsMs, i.nowMs) : 0;
  const fresh = live && i.publishedDay != null && i.publishedDay === i.today;
  const factors: GradeFactor[] = [
    { key: 'evidence', label: `confluence ${evidencePct}/100`, points: round1(P.evidence * evidencePct / 100), max: P.evidence, validated: false, basis: 'measured evidence' },
    { key: 'technical', label: `technical ${Math.round(technicalPct)}/100`, points: round1(P.technical * technicalPct / 100), max: P.technical, validated: false, basis: 'measured evidence' },
    { key: 'lifecycle', label: live ? 'live & valid' : i.lifecycle, points: live ? P.valid : i.lifecycle === 'stale' ? P.stale : P.resolved, max: P.valid, validated: false, basis: 'live gate' },
    { key: 'window', label: `${Math.round(left * 100)}% of window left`, points: round1(P.window * left), max: P.window, validated: false, basis: 'timing' },
    { key: 'session', label: fresh ? 'current session' : 'earlier session', points: fresh ? P.session : 0, max: P.session, validated: false, basis: 'timing' },
  ];
  const score = round1(factors.reduce((s, f) => s + f.points, 0));
  const top = factors.map((f, idx) => ({ f, idx })).sort((a, b) => b.f.points - a.f.points || a.idx - b.idx).slice(0, 3).map(({ f }) => f);
  return { score, letter: letterFor(score), factors, top, validated: false, version: NEXUS_GRADE_VERSION };
}
export function whyRankedHere(g: Pick<NexusGrade, 'top'>): string { return g.top.map((f) => `${f.label} +${f.points}`).join(' · '); }
export function gradeFromLife(
  life: Pick<LifecycleRead, 'state' | 'publishedDay' | 'windowEndsMs'>,
  pick: Pick<LifecycleInput, 'calledAt' | 'generatedAt'> & { layers?: GradeInput['layers']; convictionScore?: number | null },
  nowMs: number,
): NexusGrade {
  return nexusGrade({ lifecycle: life.state, publishMs: publishMsOf(pick), windowEndsMs: life.windowEndsMs, publishedDay: life.publishedDay, today: etDay(nowMs), nowMs, layers: pick.layers, convictionScore: pick.convictionScore });
}
export function gradePick(pick: LifecycleInput & { layers?: GradeInput['layers']; convictionScore?: number | null }, nowMs: number = Date.now()): NexusGrade {
  return gradeFromLife(setupLifecycle(pick, nowMs), pick, nowMs);
}
