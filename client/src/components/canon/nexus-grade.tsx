/**
 * CANON · NEXUS GRADE — the one setup grade (shared/nexus-grade.ts).
 *
 * Every surface that rates a setup renders it through these: the chip shows
 * formatNexusGrade() ("B 84"), the tooltip carries the full factor breakdown and
 * the caveat, and any legacy score (raw conviction points, confidence %, S/A/B/C
 * band) goes only inside <LegacyScoreDiagnostics>, collapsed and labelled
 * unvalidated. No other score may be shown next to the chip.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Fragment } from 'react';
import {
  formatNexusGrade, gradeBreakdown, gradePick, gradeIdeaRow, nexusGradeCaveat, NEXUS_GRADE_CAVEAT, NEXUS_GRADE_LABEL,
  type IdeaRowLike, type NexusGrade, type NexusGradeLetter, type GradeInput,
} from '@shared/nexus-grade';
import type { LifecycleInput } from '@shared/setup-lifecycle';

export { formatNexusGrade, NEXUS_GRADE_CAVEAT, NEXUS_GRADE_LABEL };

/** Token colour per letter (existing --grade-* tokens). */
export function nexusGradeColor(letter: NexusGradeLetter): string {
  return letter === 'A' ? 'var(--grade-a)' : letter === 'B' ? 'var(--grade-b)' : letter === 'C' ? 'var(--grade-c)' : letter === 'D' ? 'var(--grade-d)' : 'var(--grade-f)';
}

/** Tooltip: label, score, caveat, every factor (v3: with validation status + the actionability state). */
export function nexusGradeTitle(g: NexusGrade): string {
  return `${NEXUS_GRADE_LABEL} ${g.letter} ${g.score}/100${g.action ? ` · ${g.action.label}` : ''} — ${nexusGradeCaveat(g)}. ${gradeBreakdown(g)}.`;
}

/** Grade a board pick (live lifecycle read from its own fields) or a stored idea row. */
export function gradeOfPick(pick: LifecycleInput & { layers?: GradeInput['layers']; convictionScore?: number | null }, nowMs = Date.now()): NexusGrade {
  return gradePick(pick, nowMs);
}
/** A loosely-typed board row (landing / Today / ticker payloads): null when it lacks levels or a publish time. */
export function gradeOfLoosePick(p: Record<string, any> | null | undefined, nowMs = Date.now()): NexusGrade | null {
  if (!p || typeof p.convictionScore !== 'number' || p.isBotHeld) return null;
  if (!(Number(p.entryPrice) > 0) || !(Number(p.stopLoss) > 0) || !(Number(p.targetPrice) > 0)) return null;
  if (!p.calledAt && !p.generatedAt) return null;
  return gradePick({ ...(p as any), direction: String(p.direction ?? 'long'), entryPrice: Number(p.entryPrice), stopLoss: Number(p.stopLoss), targetPrice: Number(p.targetPrice) }, nowMs);
}
export function gradeOfRow(row: IdeaRowLike, nowMs = Date.now()): NexusGrade {
  return gradeIdeaRow(row, nowMs);
}

export function NexusGradeChip({ grade, size = 'sm', showLabel = false, style }: { grade: NexusGrade; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean; style?: CSSProperties }) {
  const fs = size === 'lg' ? 22 : size === 'md' ? 14 : 11;
  return (
    <span
      className={`nexus-grade-chip nexus-grade-${grade.letter}`}
      title={nexusGradeTitle(grade)}
      aria-label={`${NEXUS_GRADE_LABEL} ${grade.letter}, ${grade.score} of 100${grade.action ? `, ${grade.action.label}` : ''}, ${nexusGradeCaveat(grade)}`}
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, fontFamily: "'JetBrains Mono',monospace", fontSize: fs, fontWeight: 700, color: nexusGradeColor(grade.letter), whiteSpace: 'nowrap', ...style }}
    >
      {showLabel && <span style={{ fontWeight: 500, color: 'var(--text-mute)', fontSize: Math.max(9, fs - 3) }}>{NEXUS_GRADE_LABEL}</span>}
      {formatNexusGrade(grade)}
    </span>
  );
}

/**
 * Legacy scores, collapsed. Never rendered open; labelled unvalidated. Pass only
 * what the surface has — empty rows are omitted.
 */
export function LegacyScoreDiagnostics({ rows, children }: { rows: Array<[string, ReactNode | null | undefined]>; children?: ReactNode }) {
  const shown = rows.filter(([, v]) => v != null && v !== '');
  if (!shown.length && !children) return null;
  return (
    <details className="legacy-score-diagnostics" style={{ fontSize: 'var(--fs-10, 10px)', color: 'var(--text-mute)', marginTop: 6 }}>
      <summary style={{ cursor: 'pointer' }}>diagnostics (unvalidated)</summary>
      {/* Aligned key / value columns (audit 2026-10-07 #8). */}
      <div style={{ padding: '4px 0 0 10px', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 2 }}>
        {shown.map(([k, v]) => <Fragment key={k}><span>{k}</span><b style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono, ui-monospace, monospace)', textAlign: 'right' }}>{v}</b></Fragment>)}
        {children && <div style={{ gridColumn: '1 / -1' }}>{children}</div>}
        <div style={{ gridColumn: '1 / -1' }}>These inputs are not the grade and were not validated as rankings (docs/SCORE_V2_STUDY.md).</div>
      </div>
    </details>
  );
}
