/**
 * Filter bar pieces — sticky title/filters row, "Filters · n" button, and
 * removable filter chips. Only the pattern is here: the page supplies state.
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/
 * filter-bar.tsx: sticky bar layout, range strip + "Filters · n" button,
 * header actions wrapping), MIT License, Copyright (c) 2026 LuxAlgo Global,
 * LLC — see ./LICENSE-luxalgo.txt. Chips are ours.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LuxFilterBar({
  title,
  actions,
  chips,
  className,
  children,
}: {
  /** Rendered as the page's heading (an <h1>) — omit if the page has one. */
  title?: ReactNode;
  /** Right side: segmented range, filter button, page actions. */
  actions?: ReactNode;
  /** Active filter chips, drawn on their own row. */
  chips?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('lx-filterbar', className)}>
      {title ? <h1 className="lx-filterbar-title">{title}</h1> : <div className="lx-topbar-spacer" />}
      {children}
      {actions && <div className="lx-topbar-actions">{actions}</div>}
      {chips && <div className="lx-filterbar-chips" role="list" aria-label="Active filters">{chips}</div>}
    </div>
  );
}

export function LuxButton({
  variant = 'outline',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline' | 'primary' | 'ghost' }) {
  return <button type={type} className={cn('lx-btn', className)} data-variant={variant} {...props} />;
}

/** "Filters · 3" — opens the page's filter dialog/sheet. */
export function LuxFilterButton({ count = 0, className, children = 'Filters', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { count?: number }) {
  return (
    <LuxButton className={className} aria-haspopup="dialog" {...props}>
      <SlidersHorizontal aria-hidden />
      {children}
      {count > 0 && <span className="lx-btn-count" aria-label={`${count} active`}>{count}</span>}
    </LuxButton>
  );
}

export function LuxChip({
  label,
  value,
  onRemove,
  className,
}: {
  /** Field name, e.g. "Symbol". */
  label?: ReactNode;
  value: ReactNode;
  /** Present → an × button that removes this filter. */
  onRemove?: () => void;
  className?: string;
}) {
  const name = [typeof label === 'string' ? label : '', typeof value === 'string' ? value : ''].filter(Boolean).join(' ');
  return (
    <span role="listitem" className={cn('lx-chip', className)} data-removable={onRemove ? 'true' : 'false'}>
      {label && <span className="lx-chip-k">{label}</span>}
      <span className="lx-chip-v">{value}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove filter${name ? ` ${name}` : ''}`}>
          <X aria-hidden />
        </button>
      )}
    </span>
  );
}
