/**
 * QETabs — horizontal sub-navigation segmented tab strip.
 *
 * 2026-09-29 lux pass: drawn as a recessed track with a raised active tab,
 * short sentence-case labels, horizontal scroll instead of wrapping on phones
 * (.lx-tabs / .lx-tab in components/lux/lux.css). Portions of the look adapted
 * from the Trade Journal web app (apps/web/src/components/ui/tabs.tsx), MIT
 * License, Copyright (c) 2026 LuxAlgo Global, LLC — see
 * components/lux/LICENSE-luxalgo.txt. API unchanged. Used at top of every workflow
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
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { HoverHint } from '@/components/lux/lux-tooltip';

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
  /**
   * Optional cluster label. When ANY item has a group, tabs render as labeled
   * clusters (tiny group caption + subtle divider between clusters) instead of a
   * flat strip — calms a long tab bar without nesting navigation. Consecutive
   * items sharing a group string are drawn together, in declaration order.
   */
  group?: string;
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
  /** Prefix used to link tabs to their tabpanel elements. */
  panelIdPrefix?: string;
  /** Accessible name for the tablist (what these tabs switch between). */
  ariaLabel?: string;
  /** Wrap onto several rows instead of scrolling horizontally. */
  wrap?: boolean;
}

export function QETabs<T extends string = string>({
  items,
  active,
  onChange,
  variant = 'cyan',
  size = 'md',
  prefixLabel,
  rightSlot,
  className,
  panelIdPrefix,
  ariaLabel,
  wrap = false,
}: QETabsProps<T>) {
  const generatedId = useId().replace(/:/g, '');
  const idPrefix = panelIdPrefix ?? `qe-tabs-${generatedId}`;
  const enabledItems = items.filter((item) => !item.disabled);
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, item: QETabItem<T>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = enabledItems.findIndex((candidate) => candidate.id === item.id);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? enabledItems.length - 1
      : event.key === 'ArrowRight' ? (current + 1) % enabledItems.length
      : (current - 1 + enabledItems.length) % enabledItems.length;
    const next = enabledItems[nextIndex];
    if (!next) return;
    onChange(next.id);
    const el = document.getElementById(`${idPrefix}-tab-${next.id}`);
    el?.focus();
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const renderTab = (item: QETabItem<T>) => {
    const selected = active === item.id;
    const tab = (
      <button
        key={item.id}
        id={`${idPrefix}-tab-${item.id}`}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-controls={panelIdPrefix ? `${idPrefix}-panel-${item.id}` : undefined}
        tabIndex={selected ? 0 : -1}
        disabled={item.disabled}
        onClick={() => !item.disabled && onChange(item.id)}
        onKeyDown={(event) => moveFocus(event, item)}
        className="lx-tab"
      >
        {item.icon}
        {item.label}
        {typeof item.count === 'number' && !item.disabled && (
          <span className="lx-tab-count">{item.count}</span>
        )}
        {item.disabled && <span className="lx-tab-soon">soon</span>}
      </button>
    );
    return item.hint ? <HoverHint key={item.id} content={item.hint} side="bottom" delay={500}>{tab}</HoverHint> : tab;
  };

  // Grouped layout: when any item declares a group, draw labeled clusters with a
  // faint divider between them. Calms a long tab bar without nesting navigation.
  const grouped = items.some((i) => i.group);
  const clusters: { group: string; items: QETabItem<T>[] }[] = [];
  if (grouped) {
    for (const item of items) {
      const g = item.group ?? '';
      const last = clusters[clusters.length - 1];
      if (last && last.group === g) last.items.push(item);
      else clusters.push({ group: g, items: [item] });
    }
  }

  const strip = (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('lx-tabs', !rightSlot && className)}
      data-variant={variant}
      data-size={size === 'sm' ? 'sm' : undefined}
      data-wrap={wrap ? 'true' : undefined}
    >
      {prefixLabel && <span className="lx-tabs-prefix" aria-hidden>{prefixLabel}</span>}
      {grouped
        ? clusters.map((cluster, ci) => (
            <div key={cluster.group || ci} role="presentation" className="flex shrink-0 items-center gap-0.5">
              {ci > 0 && <span className="lx-tabs-divider" aria-hidden />}
              {cluster.group && <span className="lx-tabs-group" aria-hidden>{cluster.group}</span>}
              {cluster.items.map(renderTab)}
            </div>
          ))
        : items.map(renderTab)}
    </div>
  );

  if (!rightSlot) return strip;
  return (
    <div className={cn('flex min-w-0 max-w-full items-center gap-2', className)}>
      <div className="min-w-0">{strip}</div>
      <div className="ml-auto shrink-0">{rightSlot}</div>
    </div>
  );
}
