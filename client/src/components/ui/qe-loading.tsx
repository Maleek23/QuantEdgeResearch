/**
 * THE LOADING SYSTEM — one boot → page → tool sequence (docs/DESIGN_SYSTEM.md
 * "Loading"). Three states, one look, nothing else spins:
 *
 *   BOOT   the branded screen in client/index.html (#app-loader). Boot-phase
 *          fallbacks render <BootHold/>, which keeps it up (lib/boot.ts); it
 *          fades out once, when the first page can paint.
 *   PAGE   <PageSkeleton/> — the shell stays mounted; only the content area
 *          shows skeleton tiles laid out like the page (a dashboard page's own
 *          default grid, so nothing jumps when the real tools land).
 *   TOOL   <ToolSkeleton/> — inside a tool's frame while its code or first
 *          data loads (QELoading renders the same skeleton).
 *
 * <RouteFallback/> picks BOOT or PAGE, so every Suspense / auth / route
 * fallback in the app is this one component. Motion: opacity only, ≤150 ms,
 * none under prefers-reduced-motion; skeletons fill the exact box the content
 * will occupy (no layout shift).
 */
import { useLayoutEffect, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { holdBoot, isBooting } from '@/lib/boot';
import '@/styles/qe-loading.css';

/** [x, y, w, h] on the 12-column dashboard grid. */
export type SkeletonTile = [number, number, number, number];

/** A generic page: hero + rail over a three-up row, 12 × 18. */
export const GENERIC_TILES: SkeletonTile[] = [[0, 0, 8, 11], [8, 0, 4, 11], [0, 11, 4, 7], [4, 11, 4, 7], [8, 11, 4, 7]];

/** Keeps the boot screen up while mounted. Renders an inert marker only. */
export function BootHold() {
  useLayoutEffect(() => holdBoot(), []);
  return <span hidden data-boot-hold aria-hidden />;
}

/** One tool body loading: a title-width line, a block, and rows. */
export function ToolSkeleton({ label, rows = 3, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <div className={cn('qe-tool-skel', className)} role="status" aria-live="polite" aria-busy="true" data-testid="qe-loading">
      {label ? <div className="qe-skel-label">{label}</div> : <span className="sr-only">Loading</span>}
      <div className="qe-skel qe-skel-block" />
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="qe-skel qe-skel-line" style={{ width: `${[92, 78, 64, 86, 70][i % 5]}%` }} />)}
    </div>
  );
}

/** The page template: an optional bar row, then tiles on the 12 × rows grid. */
export function PageSkeleton({
  tiles = GENERIC_TILES, bar = true, fill = false, label, className,
}: {
  tiles?: SkeletonTile[];
  /** draw the page's control-bar row (off when the real bar is already mounted) */
  bar?: boolean;
  /** fill the parent instead of the measured main height */
  fill?: boolean;
  label?: string;
  className?: string;
}) {
  const rows = Math.max(1, tiles.reduce((m, t) => Math.max(m, t[1] + t[3]), 0));
  return (
    <div className={cn('qe-page-skel', fill && 'fill', className)} role="status" aria-live="polite" aria-busy="true" aria-label={label ?? 'Loading page'}>
      {bar && (
        <div className="qe-page-skel-bar" aria-hidden>
          <span className="qe-skel" style={{ width: 64 }} />
          <span className="qe-skel" style={{ width: 132 }} />
          <span className="qe-page-skel-gap" />
          <span className="qe-skel" style={{ width: 96 }} />
          <span className="qe-skel" style={{ width: 110 }} />
        </div>
      )}
      <div className="qe-page-skel-grid" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } as CSSProperties} aria-hidden>
        {tiles.map(([x, y, w, h], i) => (
          <div key={i} className="qe-page-skel-tile" style={{ gridColumn: `${x + 1} / span ${w}`, gridRow: `${y + 1} / span ${h}` }}>
            <div className="qe-page-skel-head"><span className="qe-skel" style={{ width: '38%' }} /></div>
            <div className="qe-page-skel-body">
              <span className="qe-skel qe-skel-line" style={{ width: '88%' }} />
              <span className="qe-skel qe-skel-line" style={{ width: '64%' }} />
            </div>
          </div>
        ))}
      </div>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

/**
 * Every route / auth / page-chunk fallback. During boot it holds the boot
 * screen (no second screen ever flashes); afterwards it is the page skeleton.
 */
export function RouteFallback(props: Parameters<typeof PageSkeleton>[0]) {
  if (isBooting()) return <BootHold />;
  return <PageSkeleton {...props} />;
}
