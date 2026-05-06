/**
 * QETabs — horizontal sub-navigation pill strip.
 *
 * Sole sub-nav primitive for the platform. Used at top of every workflow
 * (PULSE, HUNT, RESEARCH, POSITIONS, JOURNAL) and nested within RESEARCH
 * for per-symbol drill-ins.
 *
 *   <QETabs
 *     items={[
 *       { id: 'tape', label: 'Tape' },
 *       { id: 'rotation', label: 'Rotation', count: 5, hint: 'Layer cycle stages' },
 *       { id: 'earnings', label: 'Earnings', disabled: true },
 *     ]}
 *     active="tape"
 *     onChange={setActive}
 *   />
 *
 * Variants:
 *   - 'cyan' (default) — primary nav
 *   - 'gold'           — secondary (sort selectors etc.)
 *   - 'subtle'         — for tertiary in-card tabs
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type QETabsVariant = 'cyan' | 'gold' | 'subtle';
export type QETabsSize = 'sm' | 'md';

export interface QETabItem<T extends string = string> {
  id: T;
  label: string;
  /** Number shown after label as `· 12` */
  count?: number;
  /** Tooltip on hover */
  hint?: string;
  /** Renders disabled / strikethrough */
  disabled?: boolean;
  /** Optional leading icon */
  icon?: ReactNode;
}

export interface QETabsProps<T extends string = string> {
  items: readonly QETabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  variant?: QETabsVariant;
  size?: QETabsSize;
  /** Optional left-side label e.g. "VIEW" */
  prefixLabel?: string;
  /** Slot rendered after the tabs (right-aligned) */
  rightSlot?: ReactNode;
  className?: string;
}

const ACTIVE_VARIANT: Record<QETabsVariant, string> = {
  cyan:   'border-[var(--brand-cyan)]/50 text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/10',
  gold:   'border-[var(--brand-gold)]/50 text-[var(--brand-gold)] bg-[var(--brand-gold)]/10',
  subtle: 'border-foreground/30 text-foreground bg-foreground/5',
};

const SIZE_PADDING: Record<QETabsSize, string> = {
  sm: 'px-2 py-0.5 text-[9px]',
  md: 'px-3 py-1 text-[10px]',
};

export function QETabs<T extends string = string>({
  items,
  active,
  onChange,
  variant = 'cyan',
  size = 'md',
  prefixLabel,
  rightSlot,
  className,
}: QETabsProps<T>) {
  return (
    <div className={cn('flex items-center gap-1 flex-wrap pb-1 border-b border-border/30', className)}>
      {prefixLabel && (
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60 mr-1">
          {prefixLabel}
        </span>
      )}
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => !item.disabled && onChange(item.id)}
          title={item.hint}
          className={cn(
            'font-mono font-bold uppercase rounded border transition-colors inline-flex items-center gap-1.5',
            SIZE_PADDING[size],
            item.disabled && 'opacity-40 cursor-not-allowed border-border/20 text-muted-foreground/60',
            !item.disabled && active === item.id
              ? ACTIVE_VARIANT[variant]
              : !item.disabled && 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
          )}
        >
          {item.icon}
          {item.label}
          {typeof item.count === 'number' && !item.disabled && (
            <span className="text-muted-foreground/70 font-normal">·{item.count}</span>
          )}
          {item.disabled && (
            <span className="ml-0.5 text-[7px] font-mono uppercase tracking-widest text-muted-foreground/50 px-1 py-0 rounded border border-border/30">
              soon
            </span>
          )}
        </button>
      ))}
      {rightSlot && <div className="ml-auto">{rightSlot}</div>}
    </div>
  );
}
