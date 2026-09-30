/**
 * <WatchStar sym="NVDA" /> — the one watchlist toggle, used wherever a ticker
 * is the primary element (ticker page header, NEXUS detail, FLOW top tickers,
 * 0DTE cards, ⌘K results). Knows whether the symbol is watched (shared
 * ['/api/watchlist'] cache), flips instantly, and says what happened in a toast
 * with Undo (hooks/use-watchlist.ts).
 */
import type { MouseEvent, KeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toggleWatch, useWatchlist, watchLabel } from '@/hooks/use-watchlist';
import './watch-star.css';

export function WatchStar({ sym, size = 13, className, label }: {
  sym: string;
  size?: number;
  className?: string;
  /** visible text after the star (e.g. "Watch" on the ticker header) */
  label?: boolean;
}) {
  const wl = useWatchlist();
  const on = wl.isWatched(sym);
  const busy = wl.isBusy(sym);
  const act = (e: MouseEvent | KeyboardEvent) => {
    // stars live inside clickable rows/cards/palette items — never select the row too
    e.preventDefault();
    e.stopPropagation();
    void toggleWatch(sym);
  };
  return (
    <button
      type="button"
      className={cn('qe-star', on && 'on', label && 'with-label', className)}
      aria-pressed={on}
      aria-label={watchLabel(sym, on)}
      title={wl.signedIn ? watchLabel(sym, on) : `Sign in to add ${sym.toUpperCase()} to your watchlist`}
      disabled={busy}
      onClick={act}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') act(e); }}
      data-testid={`watch-star-${sym.toUpperCase()}`}
    >
      <Star size={size} aria-hidden fill={on ? 'currentColor' : 'none'} />
      {label && <span>{on ? 'On watchlist' : 'Add to watchlist'}</span>}
    </button>
  );
}
