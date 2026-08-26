/**
 * CANON · FRESHNESS
 *
 * One component for "how old is this". The terminal had three:
 *
 *   components/gex/CacheFreshnessIndicator  LIVE/DELAYED/CACHED/STALE + "Ns ago"
 *   pages/shells/terminal-shell             a dataPartial boolean -> "PARTIAL FEED"
 *   components/oracle/oracle-market-field   per-panel "LIVE · 45s ago" text
 *
 * The logic here is CacheFreshnessIndicator's, which was the best of the three —
 * it already distinguished live from cached from stale and printed a real age
 * rather than an aspirational "Live" badge.
 *
 * What changed is the palette. That component hardcoded bg-emerald-500 /
 * text-amber-400 / text-zinc-500, which the Design System V2 migration explicitly
 * forbids: colour comes from tokens so light mode works and so the same concept
 * is the same colour everywhere. Trading semantics use --trade-bullish /
 * --brand-gold / --trade-bearish; neutral text uses text-muted-foreground.
 *
 * The states are deliberately four, not two. "Live" and "stale" are a boolean and
 * this data is not boolean — a cached-but-recent chain and a thirty-minute-old
 * one are different situations, and a trader should be able to tell at a glance
 * which one they are looking at.
 */
import { cn } from '@/lib/utils';

export type FreshnessLevel = 'live' | 'delayed' | 'cached' | 'stale' | 'unknown';

const TONE: Record<FreshnessLevel, { color: string; label: string }> = {
  live:    { color: 'var(--trade-bullish)', label: 'LIVE' },
  delayed: { color: 'var(--brand-gold)',    label: 'DELAYED' },
  cached:  { color: 'var(--brand-gold)',    label: 'CACHED' },
  stale:   { color: 'var(--trade-bearish)', label: 'STALE' },
  unknown: { color: 'var(--muted-foreground)', label: 'NO DATA' },
};

export function ageLabel(ageMs: number): string {
  const sec = Math.floor(ageMs / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

export function freshnessOf(
  asOf: string | number | Date | null | undefined,
  opts: { cached?: boolean; staleAfterMs?: number } = {},
): { level: FreshnessLevel; ageMs: number } {
  if (asOf === null || asOf === undefined) return { level: 'unknown', ageMs: NaN };
  const ts =
    typeof asOf === 'string' ? Date.parse(asOf) : asOf instanceof Date ? asOf.getTime() : asOf;
  if (!Number.isFinite(ts)) return { level: 'unknown', ageMs: NaN };

  const ageMs = Date.now() - ts;
  const staleAfterMs = opts.staleAfterMs ?? 5 * 60 * 1000;

  if (ageMs > staleAfterMs * 6) return { level: 'stale', ageMs };
  if (opts.cached) return { level: 'cached', ageMs };
  if (ageMs > staleAfterMs) return { level: 'delayed', ageMs };
  if (ageMs < 60_000) return { level: 'live', ageMs };
  return { level: 'delayed', ageMs };
}

export function CanonFreshness({
  asOf,
  cached,
  staleAfterMs,
  showAge = true,
  showLabel = true,
  className,
}: {
  asOf: string | number | Date | null | undefined;
  cached?: boolean;
  staleAfterMs?: number;
  showAge?: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const { level, ageMs } = freshnessOf(asOf, { cached, staleAfterMs });
  const tone = TONE[level];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-label uppercase tracking-wider',
        className,
      )}
      // The age is on the element itself so it is reachable even when the label
      // is collapsed in a dense row.
      title={Number.isFinite(ageMs) ? `${tone.label} · ${ageLabel(ageMs)}` : 'No timestamp'}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', level === 'live' && 'animate-pulse')}
        style={{ background: tone.color }}
      />
      {showLabel && <span style={{ color: tone.color }}>{tone.label}</span>}
      {showAge && Number.isFinite(ageMs) && (
        <span className="text-muted-foreground/60">{ageLabel(ageMs)}</span>
      )}
    </span>
  );
}
