/**
 * KeyLevels — MOMO "KEY LEVELS": price levels with a colored left tick and the
 * % distance from spot. Built from the pick's real entry / target / stop (+ live
 * spot when available). Only renders levels that exist — no invented walls.
 */
import { cn } from '@/lib/utils';

interface Level {
  label: string;
  price: number;
  color: string;
  note?: string;
}

export function KeyLevels({
  spot,
  entry,
  target,
  stop,
  className,
}: {
  spot?: number;
  entry?: number;
  target?: number;
  stop?: number;
  className?: string;
}) {
  const levels: Level[] = [];
  if (typeof target === 'number') levels.push({ label: 'TARGET · T1', price: target, color: 'var(--trade-bullish)' });
  if (typeof entry === 'number')  levels.push({ label: 'ENTRY / RECLAIM', price: entry, color: 'var(--brand-cyan)' });
  if (typeof spot === 'number')   levels.push({ label: 'SPOT', price: spot, color: 'var(--foreground)', note: 'live' });
  if (typeof stop === 'number')   levels.push({ label: 'HARD STOP', price: stop, color: 'var(--trade-bearish)' });

  // Sort high → low so it reads like a ladder.
  levels.sort((a, b) => b.price - a.price);

  if (levels.length === 0) {
    return <div className="text-[10px] font-mono text-muted-foreground/60 py-2">No levels available.</div>;
  }

  return (
    <div className={cn('space-y-0', className)}>
      {levels.map((lvl, i) => {
        const distPct = typeof spot === 'number' && spot > 0 ? ((lvl.price - spot) / spot) * 100 : null;
        return (
          <div
            key={`${lvl.label}-${i}`}
            className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-0.5 h-4 rounded-full shrink-0" style={{ background: lvl.color }} />
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80 truncate">
                {lvl.label}
              </span>
            </div>
            <div className="flex items-baseline gap-2 shrink-0">
              <span className="text-xs font-mono font-bold tabular-nums" style={{ color: lvl.color }}>
                ${lvl.price.toFixed(2)}
              </span>
              {distPct !== null && lvl.label !== 'SPOT' && (
                <span
                  className="text-[9px] font-mono tabular-nums"
                  style={{ color: distPct >= 0 ? 'var(--trade-bullish)' : 'var(--trade-bearish)' }}
                >
                  {distPct >= 0 ? '+' : ''}{distPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
