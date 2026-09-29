/**
 * LuxTopBar — the page top bar: a calm 48px row with the page title on the
 * left and actions on the right; translucent, blurred, one hairline below.
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/
 * filter-bar.tsx: the sticky title + actions row; shell.tsx: the mobile
 * header), MIT License, Copyright (c) 2026 LuxAlgo Global, LLC — see
 * ./LICENSE-luxalgo.txt.
 *
 * The title is NOT a heading: pages own their <h1>. It is a visual locator.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface LuxTopBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Page name, e.g. "Slate". */
  title?: ReactNode;
  /** Muted prefix before the title, e.g. the section ("Terminal"). */
  crumb?: ReactNode;
  /** Hide the title below the lg breakpoint (the brand shows there instead). */
  titleDesktopOnly?: boolean;
  /** Rendered before the title (e.g. the phone brand link). */
  leading?: ReactNode;
  children?: ReactNode;
}

export function LuxTopBar({ title, crumb, titleDesktopOnly, leading, className, children, ...rest }: LuxTopBarProps) {
  return (
    <div className={cn('lx-topbar', className)} {...rest}>
      {leading}
      {title && (
        <div className={cn('lx-topbar-title', titleDesktopOnly && 'hidden lg:block')}>
          {crumb && <span className="lx-topbar-crumb">{crumb}</span>}
          {title}
        </div>
      )}
      <div className="lx-topbar-spacer" />
      {children}
    </div>
  );
}
