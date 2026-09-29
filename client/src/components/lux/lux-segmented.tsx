/**
 * LuxSegmented — a compact single-choice control (range pickers, view modes,
 * density). A radiogroup: ←/→ move and select, Home/End jump; only the
 * checked option is in the tab order.
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/
 * filter-bar.tsx: the 7D/30D/90D/YTD/All range strip), MIT License,
 * Copyright (c) 2026 LuxAlgo Global, LLC — see ./LICENSE-luxalgo.txt.
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface LuxSegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is an icon / abbreviation. */
  ariaLabel?: string;
  hint?: string;
  disabled?: boolean;
}

export function LuxSegmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: {
  options: readonly LuxSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group, e.g. "Date range". */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = options.filter((o) => !o.disabled);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: T) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = enabled.findIndex((o) => o.value === current);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1
      : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % enabled.length
      : (i - 1 + enabled.length) % enabled.length;
    const next = enabled[n];
    if (!next) return;
    onChange(next.value);
    ref.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={cn('lx-seg', className)} data-size={size}>
      {options.map((o, idx) => {
        const checked = o.value === value;
        const tabStop = checked || (idx === 0 && !options.some((x) => x.value === value));
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.ariaLabel}
            title={o.hint}
            data-value={o.value}
            tabIndex={tabStop ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
