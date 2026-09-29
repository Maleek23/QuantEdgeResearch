/**
 * HORIZON FILTER — 0DTE / Day / Weekly / Swing / Monthly / Position / LEAPS chips with counts.
 *
 * Self-contained so any board can mount it with two lines: the rule lives in
 * shared/idea-horizon.ts (the API stamps `pick.horizon`; older payloads without
 * it are classified here with the same function), counts are computed from the
 * picks handed in, and the choice is remembered per surface in localStorage
 * (a convenience only — the page renders the same without it).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  classifyIdeaHorizon, HORIZON_META, HORIZON_ORDER,
  type HorizonInput, type HorizonRead, type IdeaHorizon,
} from '@shared/idea-horizon';
import { cn } from '@/lib/utils';

export type HorizonFilterValue = IdeaHorizon | 'all';

type Horizoned = HorizonInput & { horizon?: HorizonRead };

export function horizonOf(pick: Horizoned, now = Date.now()): HorizonRead {
  return pick.horizon ?? classifyIdeaHorizon(pick, now);
}

export function countHorizons(picks: Horizoned[]): Record<IdeaHorizon, number> {
  const out = Object.fromEntries(HORIZON_ORDER.map((h) => [h, 0])) as Record<IdeaHorizon, number>;
  const now = Date.now();
  for (const p of picks) out[horizonOf(p, now).horizon]++;
  return out;
}

/** Filter state + filtered list, remembered under `storageKey` when given. */
export function useHorizonFilter<T extends Horizoned>(picks: T[], storageKey?: string) {
  const [value, setValue] = useState<HorizonFilterValue>(() => {
    if (!storageKey) return 'all';
    try {
      const v = window.localStorage.getItem(storageKey);
      return v && (v === 'all' || (HORIZON_ORDER as string[]).includes(v)) ? (v as HorizonFilterValue) : 'all';
    } catch { return 'all'; }
  });
  useEffect(() => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, value); } catch { /* storage blocked — filter still works */ }
  }, [storageKey, value]);
  const counts = useMemo(() => countHorizons(picks), [picks]);
  const filtered = useMemo(() => {
    if (value === 'all') return picks;
    const now = Date.now();
    return picks.filter((p) => horizonOf(p, now).horizon === value);
  }, [picks, value]);
  return { value, setValue, counts, filtered };
}

export function HorizonFilter({
  value,
  onChange,
  counts,
  total,
  className,
}: {
  value: HorizonFilterValue;
  onChange: (v: HorizonFilterValue) => void;
  counts: Record<IdeaHorizon, number>;
  total: number;
  className?: string;
}) {
  const chip = (key: HorizonFilterValue, label: string, n: number, title: string) => {
    const active = value === key;
    const empty = n === 0 && key !== 'all';
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={active}
        title={title}
        disabled={empty && !active}
        onClick={() => onChange(active && key !== 'all' ? 'all' : key)}
        className={cn(
          'inline-flex min-h-[32px] items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors',
          active
            ? 'border-[var(--brand-cyan)] bg-[color-mix(in_srgb,var(--brand-cyan)_14%,transparent)] text-foreground'
            : 'border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
          empty && !active && 'cursor-not-allowed opacity-40',
        )}
      >
        <span>{label}</span>
        <span className={cn('tabular-nums', active ? 'text-foreground' : 'text-muted-foreground/80')}>{n}</span>
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label="Filter by horizon" className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chip('all', 'All', total, 'Every horizon')}
      {HORIZON_ORDER.map((h) => chip(h, HORIZON_META[h].label, counts[h], HORIZON_META[h].rule))}
    </div>
  );
}
