/**
 * freshness.ts — Data freshness badge logic
 *
 * Replaces misleading "LIVE" badges with honest freshness indicators.
 * Uses market-hours.ts to determine whether the market is open.
 */

import { getMarketStatus } from '@/lib/market-hours';

export interface FreshnessBadge {
  /** Display text — e.g. "2m ago", "DELAYED", "CLOSED" */
  text: string;
  /** Tailwind-compatible color token */
  color: 'green' | 'amber' | 'red' | 'muted';
  /** CSS classes for the badge text */
  textClass: string;
  /** CSS classes for a dot indicator */
  dotClass: string;
  /** CSS classes for a full badge (border + bg + text) */
  badgeClass: string;
  /** Whether data should be considered stale */
  isStale: boolean;
}

/** Threshold in ms — data older than this during market hours is "DELAYED" */
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Compute the appropriate badge state for a data timestamp.
 *
 * @param updatedAt  ISO string, Date, or null if no timestamp available
 * @param label      Optional override label when data is fresh (default: relative time)
 * @returns          Badge descriptor with text, color, and CSS classes
 */
export function freshnessBadge(
  updatedAt: string | Date | null,
  label?: string,
): FreshnessBadge {
  // No timestamp at all — badge is a lie, return nothing meaningful
  if (!updatedAt) {
    return {
      text: '',
      color: 'muted',
      textClass: 'text-muted-foreground',
      dotClass: 'bg-muted-foreground',
      badgeClass: 'bg-muted/10 border-border text-muted-foreground',
      isStale: true,
    };
  }

  const ts = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
  const ageMs = Date.now() - ts.getTime();
  const market = getMarketStatus();

  // Market closed (weekend, after-hours, overnight)
  if (!market.isOpen) {
    const relText = formatAge(ageMs);
    return {
      text: 'CLOSED',
      color: 'muted',
      textClass: 'text-muted-foreground',
      dotClass: 'bg-muted-foreground',
      badgeClass: 'bg-muted/10 border-border text-muted-foreground',
      isStale: false, // not "stale" per se — market is just closed
    };
  }

  // Market is open — check staleness
  if (ageMs > STALE_THRESHOLD_MS) {
    const relText = formatAge(ageMs);
    return {
      text: `DELAYED ${relText}`,
      color: 'amber',
      textClass: 'text-amber-400',
      dotClass: 'bg-amber-400',
      badgeClass: 'bg-amber-500/10 border-amber-500/25 text-amber-400',
      isStale: true,
    };
  }

  // Fresh data during market hours
  const relText = label || formatAge(ageMs);
  return {
    text: relText,
    color: 'green',
    textClass: 'text-[var(--trade-bullish)]',
    dotClass: 'bg-[var(--trade-bullish)]',
    badgeClass: 'bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/25 text-[var(--trade-bullish)]',
    isStale: false,
  };
}

/**
 * Format millisecond age into compact relative string.
 * "now", "2m ago", "1h ago", "3d ago"
 */
function formatAge(ms: number): string {
  if (ms < 0) return 'now';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
