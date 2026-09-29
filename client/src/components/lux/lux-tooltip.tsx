/**
 * HoverHint / HelpHint — one hover-AND-focus help surface, no native title bubble.
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/ui/
 * tooltip.tsx: HoverHint, HelpHint), MIT License, Copyright (c) 2026 LuxAlgo
 * Global, LLC — see ./LICENSE-luxalgo.txt. Re-themed to QuantEdge tokens
 * (.lx-hint in ./lux.css).
 *
 * Carries its own Radix Provider so it works in any tree (the app mounts a
 * TooltipProvider only around some routes); nested providers are harmless.
 */
import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

type Side = 'top' | 'right' | 'bottom' | 'left';

export function HoverHint({
  children,
  content,
  heading,
  side = 'top',
  compact = false,
  delay = 350,
  className,
}: {
  /** Exactly one focusable element (it becomes the trigger via asChild). */
  children: React.ReactElement;
  /** Falsy → no tooltip, the child renders untouched. */
  content: React.ReactNode;
  heading?: string;
  side?: Side;
  /** One-line label style (collapsed sidebar items). */
  compact?: boolean;
  delay?: number;
  className?: string;
}) {
  if (!content && !heading) return children;
  return (
    <TooltipPrimitive.Provider delayDuration={delay} skipDelayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            collisionPadding={12}
            data-compact={compact ? 'true' : undefined}
            className={cn('lx-hint', className)}
          >
            {heading && <div className="lx-hint-heading">{heading}</div>}
            {content && <div>{content}</div>}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/** A small "?" button that explains a metric on hover or keyboard focus. */
export function HelpHint({ heading, children, side }: { heading: string; children: React.ReactNode; side?: Side }) {
  return (
    <HoverHint heading={heading} content={children} side={side}>
      <button type="button" aria-label={`About ${heading}`} className="lx-help lx-focus">
        <CircleHelp aria-hidden />
      </button>
    </HoverHint>
  );
}
