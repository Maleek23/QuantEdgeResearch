/**
 * QESection — header + body, optionally collapsible.
 *
 * Collapsible stacked-panel block, QE-styled variant of the ui/ primitive layer.
 * 2026-09-29 lux pass: 11px caps caption, the collapse control is a real
 * <button aria-expanded> (was a clickable div — mouse-only).
 *
 *   <QESection title="Top Plays" subtitle="ranked by dealer positioning">
 *     <Body />
 *   </QESection>
 *
 *   <QESection
 *     title="Sectors · 13"
 *     collapsible
 *     defaultOpen={false}
 *     action={<button>Refresh</button>}
 *   >
 *     <Body />
 *   </QESection>
 */
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QECard, type QECardVariant } from './qe-card';

export interface QESectionProps {
  title: string;
  subtitle?: string;
  /** Right-aligned action area (button, count, refresh icon) */
  action?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  variant?: QECardVariant;
  /** Set to false to use no card chrome (for nested sections) */
  bordered?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function QESection({
  title,
  subtitle,
  action,
  collapsible = false,
  defaultOpen = true,
  variant = 'default',
  bordered = true,
  className,
  bodyClassName,
  children,
}: QESectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `qe-sec-${useId().replace(/:/g, '')}`;
  const isOpen = !collapsible || open;

  const titleRow = (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="lx-card-title" style={{ color: 'var(--lx-text)' }}>
          {title}
        </span>
        {subtitle && (
          <span className="truncate text-[11px] text-muted-foreground">
            · {subtitle}
          </span>
        )}
      </div>
    </div>
  );
  const chevron = collapsible && (
    <ChevronDown
      aria-hidden
      className={cn(
        'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
        open && 'rotate-180',
      )}
    />
  );
  // Collapsible: the title is a real button (keyboard + aria-expanded); the
  // action slot stays OUTSIDE it so its own buttons are never nested.
  const Header = (
    <div className="flex items-center justify-between gap-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="lx-focus flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md text-left"
        >
          {titleRow}
          {chevron}
        </button>
      ) : titleRow}
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );

  if (!bordered) {
    return (
      <div className={cn('space-y-2', className)}>
        {Header}
        {isOpen && <div id={bodyId} className={bodyClassName}>{children}</div>}
      </div>
    );
  }

  return (
    <QECard variant={variant} padding="none" className={cn('overflow-hidden', className)}>
      <div className={cn('px-3 py-2 border-b border-border/40', !isOpen && 'border-b-0')}>
        {Header}
      </div>
      {isOpen && <div id={bodyId} className={cn('p-3', bodyClassName)}>{children}</div>}
    </QECard>
  );
}
