/**
 * CANON · SCORE
 *
 * The terminal rendered "how good is this" five different ways: a raw number, an
 * S/A/B/C tier from lib/flow/flow-score, a letter probabilityBand, a 0–99
 * conviction percentage, and STRONG/MODERATE word bands added to Flow. A reader
 * moving between tabs had no way to know whether an 84 and a B meant the same
 * thing.
 *
 * This does NOT invent a sixth scale. lib/conviction-display already owns grade
 * resolution — displayedGrade resolves convictionScore first so the letter stays
 * monotonic with the rank the UI sorts on — and that logic is wrapped here, not
 * duplicated. What this adds is one rendering, and the palette fix: gradeColorClass
 * hardcodes emerald/blue/amber/red while --grade-s/a/b/c/d/f already exist as
 * tokens, which is exactly what the Design System V2 migration was for.
 *
 * The word band is kept because a bare number is unreadable without knowing where
 * the bar sits — 84 means nothing until you know 80 is the top band. It is a
 * label ON the number, never a replacement for it.
 */
import { cn } from '@/lib/utils';
import { displayedGrade, type LetterGrade, type ScoredIdea } from '@/lib/conviction-display';

export type ScoreBand = 'STRONG' | 'MODERATE' | 'LIGHT' | 'WEAK';

/** Word band for a 0–100 scale. One definition, used by Flow and the ledger. */
export function scoreBand(n: number): ScoreBand {
  if (n >= 80) return 'STRONG';
  if (n >= 65) return 'MODERATE';
  if (n >= 50) return 'LIGHT';
  return 'WEAK';
}

/** Token-backed colour for a letter grade. Replaces the hardcoded Tailwind palette. */
export function gradeColor(grade: LetterGrade): string {
  if (grade === 'A+') return 'var(--grade-s)';
  if (grade.startsWith('A')) return 'var(--grade-a)';
  if (grade.startsWith('B')) return 'var(--grade-b)';
  if (grade.startsWith('C')) return 'var(--grade-c)';
  if (grade.startsWith('D')) return 'var(--grade-d)';
  return 'var(--grade-f)';
}

/** Colour for a 0–100 score, mapped through the same band vocabulary. */
export function bandColor(band: ScoreBand): string {
  switch (band) {
    case 'STRONG': return 'var(--grade-s)';
    case 'MODERATE': return 'var(--grade-b)';
    case 'LIGHT': return 'var(--grade-c)';
    default: return 'var(--muted-foreground)';
  }
}

/**
 * A score with its band. `title` carries the raw number so power users keep it
 * even when the band is what is shown.
 */
export function CanonScore({
  score,
  showBand = true,
  className,
}: {
  score: number;
  showBand?: boolean;
  className?: string;
}) {
  const band = scoreBand(score);
  const color = bandColor(band);
  return (
    <span
      className={cn('inline-flex items-baseline gap-1.5 font-mono tabular-nums', className)}
      title={`Score ${score} of 100 — ${band}`}
    >
      <b className="text-[13px] leading-none" style={{ color }}>{score}</b>
      {showBand && (
        <span className="text-label uppercase tracking-wider text-muted-foreground/65">{band}</span>
      )}
    </span>
  );
}

/** A letter grade badge, resolved through the canonical helper. */
export function CanonGrade({ idea, className }: { idea: ScoredIdea; className?: string }) {
  const grade = displayedGrade(idea);
  const color = gradeColor(grade);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-label font-bold tracking-wider',
        className,
      )}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
      title={typeof idea.convictionScore === 'number' ? `Conviction ${idea.convictionScore}` : undefined}
    >
      {grade}
    </span>
  );
}

/**
 * A rate that refuses to render below a usable sample.
 *
 * Below the floor it prints the sample size instead of a percentage. This exists
 * because the performance surface showed a 73.3% win rate beside its own counts
 * of 0 wins and 1 loss, and showed a source at 100% off 18 trades that turned out
 * to be a unit bug. A blank cell reads as a fresh start and 0% reads as a verdict;
 * neither is true when there is simply not enough data.
 */
export function CanonRate({
  wins,
  decided,
  minSample = 30,
  label,
  className,
}: {
  wins: number;
  decided: number;
  minSample?: number;
  label?: string;
  className?: string;
}) {
  if (decided < minSample) {
    return (
      <span
        className={cn('font-mono text-label italic text-muted-foreground/55', className)}
        title={`${decided} decided — below the ${minSample} needed to report a rate`}
      >
        not yet measurable (n={decided})
      </span>
    );
  }
  const pct = (wins / decided) * 100;
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      <b>{pct.toFixed(1)}%</b>
      <span className="ml-1.5 text-label text-muted-foreground/65">
        {label ? `${label} · ` : ''}n={decided}
      </span>
    </span>
  );
}
