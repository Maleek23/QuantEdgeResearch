/**
 * FreshnessBadge — honest data-freshness indicator.
 *
 * Drop-in replacement for hardcoded "LIVE" badges.
 * Shows relative age during market hours, "DELAYED" when stale,
 * "CLOSED" outside market hours, or nothing when no timestamp exists.
 */

import { freshnessBadge, type FreshnessBadge as FreshnessInfo } from '@/lib/freshness';
import { cn } from '@/lib/utils';

interface FreshnessBadgeProps {
  /** Data timestamp — ISO string, Date, or null */
  updatedAt: string | Date | null;
  /** Optional override label when data is fresh */
  label?: string;
  /** Show animated pulse dot (default: true when fresh) */
  showDot?: boolean;
  /** Additional class names */
  className?: string;
  /** Render style: "inline" (just text+dot), "badge" (bordered pill) */
  variant?: 'inline' | 'badge';
}

export function FreshnessBadge({
  updatedAt,
  label,
  showDot = true,
  className,
  variant = 'inline',
}: FreshnessBadgeProps) {
  const info = freshnessBadge(updatedAt, label);

  // No timestamp = no badge at all (the lie stops here)
  if (!updatedAt) return null;

  if (variant === 'badge') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border',
          info.badgeClass,
          className,
        )}
      >
        {showDot && (
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              info.dotClass,
              !info.isStale && info.color === 'green' && 'animate-pulse',
            )}
          />
        )}
        {info.text}
      </span>
    );
  }

  // inline variant
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {showDot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            info.dotClass,
            !info.isStale && info.color === 'green' && 'animate-pulse',
          )}
        />
      )}
      <span className={cn('text-[10px] font-mono', info.textClass)}>
        {info.text}
      </span>
    </span>
  );
}
