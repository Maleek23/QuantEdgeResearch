/**
 * PANEL FRAME — one chrome, one collapsed height, per-panel expansion.
 *
 * The three panels at the top of ORACLE have very different natural heights, and
 * in a grid row the tallest one sets the row and pushes the signal board below the
 * fold. So they share a collapsed height and each expands on its own.
 *
 * The first version clipped content at a hard edge and bolted a full-width
 * "Expand" button underneath. Two things were wrong with that: a hard cut makes a
 * half-drawn row look like a rendering bug rather than a deliberate truncation,
 * and a generic footer button says nothing about what it would reveal. Now the
 * clip fades out, so it reads as "continues below", and the control lives in the
 * header where the panel's identity already is — labelled with what's hidden,
 * because "Expand" is not information and "+4 sectors" is.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shared so the row stays flush; change here and all three move together. */
export const PANEL_COLLAPSED_H = 248;

export function PanelFrame({
  title,
  right,
  children,
  collapsedHeight = PANEL_COLLAPSED_H,
  /** What expanding reveals, e.g. "4 more sectors". Falls back to "more". */
  moreLabel,
  className,
  bodyClassName,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  collapsedHeight?: number;
  moreLabel?: string;
  className?: string;
  bodyClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Measure rather than guess: content height changes with live data, so a static
  // flag would show a control on a panel with nothing hidden and hide it on one
  // that's clipping.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > collapsedHeight + 4);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsedHeight, children]);

  const canToggle = overflows || expanded;

  return (
    <div className={cn('flex flex-col rounded-xl border border-card-border bg-card overflow-hidden', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5">
        <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">{title}</span>
        <div className="flex items-center gap-2.5 min-w-0">
          {right}
          {canToggle && (
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-label font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              {expanded ? 'Less' : moreLabel ?? 'More'}
              <ChevronDown
                className={cn('h-3 w-3 transition-transform duration-200', expanded && 'rotate-180')}
              />
            </button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={bodyRef}
          className={cn(expanded ? 'overflow-visible' : 'overflow-hidden', bodyClassName)}
          style={expanded ? undefined : { maxHeight: collapsedHeight }}
        >
          {children}
        </div>

        {/* Fade the cut instead of slicing a row in half. The mask sits over the
            bottom of the clipped area, so content dissolves into the card colour
            and the truncation reads as intentional. */}
        {!expanded && overflows && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--card))' }}
          />
        )}
      </div>
    </div>
  );
}
