/**
 * Table helpers — a scroll container with a sticky header and density, plus a
 * sortable header button that sets aria-sort on its <th>.
 *
 *   <LuxTableWrap maxHeight={420} density="compact">
 *     <table>
 *       <thead><tr>
 *         <LuxSortHead dir={sort.key === 'pnl' ? sort.dir : null} onSort={() => toggle('pnl')}>P&L</LuxSortHead>
 *       </tr></thead>
 *       <tbody>…<td data-num>+$171.00</td>…</tbody>
 *     </table>
 *   </LuxTableWrap>
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/ui/
 * table.tsx: head/cell sizing, overflow wrapper), MIT License, Copyright (c)
 * 2026 LuxAlgo Global, LLC — see ./LICENSE-luxalgo.txt. Sticky header, density
 * and the sort control follow DESIGN_SYSTEM.md §05 "Data table".
 */
import type { CSSProperties, ReactNode, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LuxSortDir = 'asc' | 'desc' | null;

export function LuxTableWrap({
  children,
  maxHeight,
  density = 'default',
  className,
  label,
}: {
  children: ReactNode;
  /** Cap the height so the header sticks while rows scroll. */
  maxHeight?: number | string;
  density?: 'compact' | 'default' | 'comfortable';
  className?: string;
  /** Accessible name for the scroll region (makes it keyboard-scrollable). */
  label?: string;
}) {
  const style = maxHeight != null
    ? ({ '--lx-table-max': typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight } as CSSProperties)
    : undefined;
  return (
    <div
      className={cn('lx-table-wrap', className)}
      data-density={density}
      style={style}
      {...(label ? { role: 'region', 'aria-label': label, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}

export function LuxSortHead({
  dir,
  onSort,
  children,
  className,
  align = 'left',
  ...props
}: Omit<ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> & {
  dir: LuxSortDir;
  onSort: () => void;
  align?: 'left' | 'right';
}) {
  const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      className={cn(align === 'right' && 'text-right', className)}
      {...props}
    >
      <button type="button" className="lx-sort" data-dir={dir ?? undefined} onClick={onSort}>
        {children}
        <Icon aria-hidden />
      </button>
    </th>
  );
}

/** Cycle helper: none → desc → asc → none (numbers read best largest-first). */
export function nextSort(dir: LuxSortDir): LuxSortDir {
  return dir === null ? 'desc' : dir === 'desc' ? 'asc' : null;
}
