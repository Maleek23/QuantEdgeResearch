import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EqBars, Eyebrow, LiveDot, type Tone } from '@/components/templates/kit';

/**
 * Shared hierarchy for every terminal module. It deliberately owns only page
 * rhythm and status—not domain UI—so Flow can remain a tape, GEX a surface,
 * LEAPS a timeline, and Oracle a cockpit without inventing new chrome each time.
 */
export function TerminalPageHeader({
  eyebrow,
  title,
  description,
  status,
  live = false,
  tone = 'structural',
  actions,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status?: string;
  live?: boolean;
  tone?: Tone;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('qe-page-head', className)}>
      <div className="min-w-0">
        <Eyebrow tone={tone} className="qe-section-eyebrow">{eyebrow}</Eyebrow>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h1 className="qe-page-title">{title}</h1>
          <p className="qe-page-copy">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {(live || status) && (
          <div className="qe-section-state">
            {live && <><LiveDot tone={tone} /><EqBars tone={tone} /></>}
            <span>{status ?? 'streaming'}</span>
          </div>
        )}
        {actions}
      </div>
    </header>
  );
}

export function TerminalSectionHeader({
  eyebrow,
  title,
  description,
  live = false,
  meta,
  tone = 'structural',
}: {
  eyebrow: string;
  title: string;
  description: string;
  live?: boolean;
  meta?: string;
  tone?: Tone;
}) {
  return (
    <div className="qe-section-head">
      <div className="min-w-0">
        <Eyebrow tone={tone} className="qe-section-eyebrow">{eyebrow}</Eyebrow>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="qe-section-title">{title}</h2>
          <p className="qe-section-copy">{description}</p>
        </div>
      </div>
      {(live || meta) && (
        <div className="qe-section-state">
          {live && <><LiveDot tone={tone} /><EqBars tone={tone} /></>}
          <span>{meta ?? 'streaming'}</span>
        </div>
      )}
    </div>
  );
}
