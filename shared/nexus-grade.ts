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
 */
import { convictionDisplayPercent } from './conviction-display';
import { etDay, publishMsOf, setupLifecycle, type LifecycleInput, type LifecycleRead, type SetupLifecycle } from './setup-lifecycle';

export const NEXUS_GRADE_VERSION = 'g2-2026-10-03';
export const NEXUS_GRADE_LABEL = 'NEXUS grade';
export const NEXUS_GRADE_CAVEAT = 'actionability score — unvalidated, not a win probability';
export const NEXUS_GRADE_POINTS = Object.freeze({ evidence: 25, technical: 15, valid: 25, stale: 5, resolved: 0, window: 25, session: 10 } as const);
/** Raw positive technical/ta/structure points that earn the full technical factor. */
export const NEXUS_TECHNICAL_CAP = 10;
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
  currentPrice?: number | null;
}
export function pickFromIdeaRow(row: IdeaRowLike): LifecycleInput & { layers: GradeInput['layers']; convictionScore: number | null } {
  const layers = (Array.isArray(row.layers) ? row.layers : Array.isArray(row.genScoringLayers) ? row.genScoringLayers : []) as GradeInput['layers'];
  const resolved = row.outcomeStatus != null && row.outcomeStatus !== '' && row.outcomeStatus !== 'open';
  return {
    direction: String(row.direction ?? 'long'),
    entryPrice: Number(row.entryPrice ?? 0), stopLoss: Number(row.stopLoss ?? 0), targetPrice: Number(row.targetPrice ?? 0),
    assetType: row.assetType ?? null, holdingPeriod: row.holdingPeriod ?? null, source: row.source ?? null,
    expiryDate: row.expiryDate ?? null, calledAt: row.timestamp ?? null, generatedAt: row.generationTimestamp ?? null,
    exitBy: row.exitBy ?? null, lifecycleState: resolved ? 'closed' : null, currentPrice: row.currentPrice ?? null,
    layers, convictionScore: row.convictionScore ?? row.genConvictionScore ?? null,
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

/** THE display string: "B 84". Every surface renders the grade through this. */
export function formatNexusGrade(g: Pick<NexusGrade, 'letter' | 'score'>): string {
  return `${g.letter} ${g.score}`;
}
/** Long form for embeds/tooltips: "NEXUS grade B 84/100 — actionability score — unvalidated, not a win probability". */
export function nexusGradeLine(g: Pick<NexusGrade, 'letter' | 'score'>): string {
  return `${NEXUS_GRADE_LABEL} ${g.letter} ${g.score}/100 — ${NEXUS_GRADE_CAVEAT}`;
}
/** Every factor with its points: "confluence 86/100 21.5/25 · technical …". */
export function gradeBreakdown(g: Pick<NexusGrade, 'factors'>): string {
  return g.factors.map((f) => `${f.label} ${f.points}/${f.max}`).join(' · ');
}
const LETTER_RANK: Record<NexusGradeLetter, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
export function gradeAtLeast(g: Pick<NexusGrade, 'letter'>, min: NexusGradeLetter): boolean {
  return LETTER_RANK[g.letter] >= LETTER_RANK[min];
}

/** Compact, parseable component record for validation logs (research/grade-audit.ts). */
export interface NexusGradeComponents { v: string; letter: NexusGradeLetter; score: number; at: string; f: Record<GradeFactorKey, number> }
export function gradeComponents(g: NexusGrade, atMs: number = Date.now()): NexusGradeComponents {
  const f = {} as Record<GradeFactorKey, number>;
  for (const x of g.factors) f[x.key] = x.points;
  return { v: g.version, letter: g.letter, score: g.score, at: new Date(atMs).toISOString(), f };
}
/** One-line tag: "nexus-grade:g2-2026-10-03:B:84|evidence=21.5|technical=9|lifecycle=25|window=18.5|session=10". */
export function gradeComponentsTag(g: NexusGrade): string {
  return `nexus-grade:${g.version}:${g.letter}:${g.score}|${g.factors.map((f) => `${f.key}=${f.points}`).join('|')}`;
}
