/**
 * QECard — QE-styled card variant of the ui/ primitive layer.
 *
 * All page content should be composed of QECard. Variants pull from
 * `componentStyles.card.*` (see lib/design-tokens.ts) which in turn
 * pull from CSS variables (single source of truth in index.css).
 *
 * Stop hand-rolling `bg-zinc-900/40 border border-zinc-800 rounded-lg`.
 * Use <QECard variant="glass"> instead.
 *
 * 2026-09-29 lux pass: every surface card wears the hairline top sheen and
 * the 10px radius (.lx-card), and the card has an anatomy — QECardHeader →
 * QECardTitle (11px caps caption) → QECardContent. Portions of the look adapted
 * from the Trade Journal web app (apps/web/src/components/ui/card.tsx, the
 * .card-sheen style), MIT License, Copyright (c) 2026 LuxAlgo Global, LLC —
 * see components/lux/LICENSE-luxalgo.txt.
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { componentStyles } from '@/lib/design-tokens';

export type QECardVariant =
  | 'default'
  | 'glass'
  | 'elevated'
  | 'interactive'
  | 'feature'
  | 'dense'
  | 'inset'
  | 'accent-cyan'
  | 'accent-teal'
  | 'accent-gold'
  | 'accent-bull'
  | 'accent-bear';

const VARIANT_MAP: Record<QECardVariant, string> = {
  'default':       componentStyles.card.default,
  'glass':         componentStyles.card.glass,
  'elevated':      componentStyles.card.elevated,
  'interactive':   componentStyles.card.interactive,
  'feature':       componentStyles.card.feature,
  'dense':         componentStyles.card.dense,
  'inset':         componentStyles.card.inset,
  'accent-cyan':   componentStyles.card.accentCyan,
  'accent-teal':   componentStyles.card.accentTeal,
  'accent-gold':   componentStyles.card.accentGold,
  'accent-bull':   componentStyles.card.accentBullish,
  'accent-bear':   componentStyles.card.accentBearish,
};

export interface QECardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: QECardVariant;
  /** Padding preset — most pages should use 'md' (default). 'none' for nested. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING_MAP = {
  none: '',
  sm: 'p-2',
  md: 'p-3',
  lg: 'p-4',
};

export const QECard = forwardRef<HTMLDivElement, QECardProps>(
  ({ variant = 'default', padding = 'md', className, children, ...rest }, ref) => (
    <div ref={ref} className={cn(VARIANT_MAP[variant], variant !== 'inset' && 'lx-card', PADDING_MAP[padding], className)} {...rest}>
      {children}
    </div>
  ),
);
QECard.displayName = 'QECard';

/** Card header row: title on the left, an optional action (help, menu) on the right. */
export function QECardHeader({ className, action, children, ...rest }: HTMLAttributes<HTMLDivElement> & { action?: ReactNode }) {
  return (
    <div className={cn('lx-card-header', className)} {...rest}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** 11px uppercase caption — what the card measures. */
export function QECardTitle({ className, as: Tag = 'div', ...rest }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'h2' | 'h3' }) {
  return <Tag className={cn('lx-card-title', className)} {...rest} />;
}

export function QECardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('lx-card-content', className)} {...rest} />;
}
