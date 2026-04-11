/**
 * SectorPulse — reusable sector strength heatmap
 * ===============================================
 * Compact horizontal strip of sector ETF cards showing trend + change.
 * Used on /command, /home, /scanner.
 *
 * Data shape mirrors `SectorPulse` from `server/market-projector.ts`.
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectorPulseItem {
  sector: string;
  etf: string;
  price: number;
  changePct: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number; // 0-100
  category?: 'core' | 'sector' | 'macro';
}

export interface SectorPulseProps {
  sectors: SectorPulseItem[];
  layout?: 'strip' | 'grid';
  onSelect?: (etf: string) => void;
  className?: string;
  loading?: boolean;
  'data-testid'?: string;
}

function trendColor(trend: SectorPulseItem['trend']): string {
  if (trend === 'BULLISH') return 'text-[var(--gex-positive)]';
  if (trend === 'BEARISH') return 'text-[var(--gex-negative)]';
  return 'text-muted-foreground';
}

function trendBorder(trend: SectorPulseItem['trend']): string {
  if (trend === 'BULLISH') return 'border-[var(--gex-positive)]/40 hover:border-[var(--gex-positive)]/70';
  if (trend === 'BEARISH') return 'border-[var(--gex-negative)]/40 hover:border-[var(--gex-negative)]/70';
  return 'border-border hover:border-foreground/40';
}

function trendIcon(trend: SectorPulseItem['trend']) {
  if (trend === 'BULLISH') return <TrendingUp className="w-3 h-3" />;
  if (trend === 'BEARISH') return <TrendingDown className="w-3 h-3" />;
  return <Minus className="w-3 h-3" />;
}

export function SectorPulse({
  sectors,
  layout = 'strip',
  onSelect,
  className,
  loading = false,
  'data-testid': testId,
}: SectorPulseProps) {
  if (loading) {
    return (
      <div
        className={cn(
          'flex gap-2 overflow-x-auto pb-1',
          layout === 'grid' && 'flex-wrap',
          className,
        )}
        data-testid={testId}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 w-[120px] h-[68px] rounded-md bg-[var(--surface-raised)] border border-border animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!sectors || sectors.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-4 text-xs text-muted-foreground',
          'rounded-md bg-[var(--surface-raised)] border border-border',
          className,
        )}
        data-testid={testId}
      >
        No sector data available
      </div>
    );
  }

  return (
    <div
      className={cn(
        layout === 'strip'
          ? 'flex gap-2 overflow-x-auto pb-1 -mx-1 px-1'
          : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2',
        className,
      )}
      data-testid={testId}
    >
      {sectors.map((s) => {
        const tone = trendColor(s.trend);
        const borderTone = trendBorder(s.trend);
        const interactive = !!onSelect;

        return (
          <button
            type="button"
            key={s.etf}
            onClick={() => onSelect?.(s.etf)}
            disabled={!interactive}
            className={cn(
              'shrink-0 flex flex-col gap-1 px-3 py-2 rounded-md text-left transition-all',
              'bg-[var(--surface-raised)] border',
              borderTone,
              interactive && 'cursor-pointer hover:scale-[1.02]',
              !interactive && 'cursor-default',
              layout === 'strip' && 'min-w-[120px]',
            )}
            data-testid={`sector-${s.etf}`}
          >
            {/* TOP ROW: ETF + trend icon */}
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-xs text-foreground tracking-tight">
                {s.etf}
              </span>
              <span className={cn('flex items-center', tone)}>{trendIcon(s.trend)}</span>
            </div>

            {/* MIDDLE: change pct */}
            <span className={cn('font-mono font-bold text-sm tabular-nums', tone)}>
              {s.changePct >= 0 ? '+' : ''}
              {s.changePct.toFixed(2)}%
            </span>

            {/* BOTTOM: sector label + strength bar */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground truncate">
                {s.sector}
              </span>
              <div className="h-0.5 w-full bg-border/50 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    s.trend === 'BULLISH' && 'bg-[var(--gex-positive)]',
                    s.trend === 'BEARISH' && 'bg-[var(--gex-negative)]',
                    s.trend === 'NEUTRAL' && 'bg-muted-foreground',
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, s.strength))}%` }}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
