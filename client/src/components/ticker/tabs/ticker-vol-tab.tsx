/**
 * TickerVolTab — implied volatility analysis.
 * IV rank/percentile, term structure, skew, VRP.
 * Fetches from /api/volatility-analysis/:symbol.
 */

import { useQuery } from '@tanstack/react-query';
import { cn, safeToFixed } from '@/lib/utils';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';

interface VolAnalysis {
  ivRank?: number;
  ivPercentile?: number;
  currentIV?: number;
  '52WeekHighIV'?: number;
  '52WeekLowIV'?: number;
  ivMean?: number;
  termStructure?: Array<{ dte: number; iv: number }>;
  skewProfile?: Array<{ delta: number; iv: number }>;
  vrp?: number;
  vrpZScore?: number;
  marketRegime?: string;
  strategyRecommendation?: { strategy: string; reason: string };
}

interface TickerVolTabProps {
  symbol: string;
}

export function TickerVolTab({ symbol }: TickerVolTabProps) {
  const { data, isLoading, error } = useQuery<VolAnalysis>({
    queryKey: ['/api/volatility-analysis', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/volatility-analysis/${symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch vol data');
      return res.json();
    },
    staleTime: 300_000,
  });

  if (isLoading) return <div className="text-center py-8 text-xs font-mono text-muted-foreground">Loading volatility data...</div>;
  if (error) return <div className="text-center py-8 text-xs font-mono text-[var(--trade-bearish)]">Vol data unavailable</div>;
  if (!data) return null;

  const ivRank = data.ivRank ?? 0;
  const ivPct = data.ivPercentile ?? 0;
  const currentIV = data.currentIV ?? 0;

  const rankColor = ivRank > 70 ? 'text-[var(--trade-bearish)]' : ivRank > 40 ? 'text-amber-400' : 'text-[var(--trade-bullish)]';
  const rankLabel = ivRank > 70 ? 'HIGH' : ivRank > 40 ? 'NORMAL' : 'LOW';

  return (
    <div className="space-y-4">
      {/* IV Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="IV RANK" value={`${safeToFixed(ivRank, 0)}%`} color={rankColor} sub={rankLabel} />
        <MetricCard label="IV PERCENTILE" value={`${safeToFixed(ivPct, 0)}%`} color={rankColor} />
        <MetricCard label="CURRENT IV" value={`${safeToFixed(currentIV * 100, 1)}%`} />
        <MetricCard
          label="52W RANGE"
          value={`${safeToFixed((data['52WeekLowIV'] ?? 0) * 100, 0)}% — ${safeToFixed((data['52WeekHighIV'] ?? 0) * 100, 0)}%`}
          sub={`Mean: ${safeToFixed((data.ivMean ?? 0) * 100, 0)}%`}
        />
      </div>

      {/* IV Rank Visual Bar */}
      <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">IV RANK POSITION</div>
        <div className="relative h-3 rounded-full bg-muted/30 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all',
              ivRank > 70 ? 'bg-red-500' : ivRank > 40 ? 'bg-amber-500' : 'bg-emerald-500'
            )}
            style={{ width: `${Math.min(100, ivRank)}%` }}
          />
          <div
            className="absolute top-0 h-full w-px bg-foreground/50"
            style={{ left: `${Math.min(100, ivRank)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[8px] font-mono text-muted-foreground">
          <span>0%</span>
          <span>52W Low</span>
          <span>Mean</span>
          <span>52W High</span>
          <span>100%</span>
        </div>
      </div>

      {/* Term Structure */}
      {data.termStructure && data.termStructure.length > 0 && (
        <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-3">IV TERM STRUCTURE</div>
          <div className="flex items-end gap-1 h-32">
            {data.termStructure.map((pt, i) => {
              const maxIV = Math.max(...data.termStructure!.map(t => t.iv));
              const minIV = Math.min(...data.termStructure!.map(t => t.iv));
              const range = maxIV - minIV || 1;
              const height = ((pt.iv - minIV) / range) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[8px] font-mono text-foreground">{safeToFixed(pt.iv * 100, 0)}%</span>
                  <div
                    className="w-full rounded-t bg-[var(--brand-cyan)]/60 min-h-[4px]"
                    style={{ height: `${Math.max(5, height)}%` }}
                  />
                  <span className="text-[7px] font-mono text-muted-foreground">{pt.dte}d</span>
                </div>
              );
            })}
          </div>
          <div className="text-[9px] text-muted-foreground mt-2">
            {data.termStructure[0]?.iv < data.termStructure[data.termStructure.length - 1]?.iv
              ? 'Contango — normal term structure, front IV < back IV'
              : 'Backwardation — inverted, front IV > back IV (event premium?)'}
          </div>
        </div>
      )}

      {/* VRP */}
      {data.vrp != null && (
        <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">VOLATILITY RISK PREMIUM</div>
          <div className="flex items-center gap-4">
            <div>
              <span className="text-lg font-mono font-bold text-foreground">{safeToFixed(data.vrp * 100, 1)}%</span>
              <span className="text-[10px] text-muted-foreground ml-2">VRP</span>
            </div>
            {data.vrpZScore != null && (
              <div>
                <span className={cn('text-sm font-mono font-bold',
                  data.vrpZScore > 1 ? 'text-[var(--trade-bullish)]' : data.vrpZScore < -1 ? 'text-[var(--trade-bearish)]' : 'text-muted-foreground'
                )}>
                  z={safeToFixed(data.vrpZScore, 2)}
                </span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {data.vrp > 0
              ? 'Implied > Realized — options are overpriced relative to actual moves'
              : 'Implied < Realized — options are underpriced, actual moves exceed implied'}
          </p>
        </div>
      )}

      {/* Strategy Recommendation */}
      {data.strategyRecommendation && (
        <div className="rounded-lg border border-[var(--brand-teal)]/30 bg-[var(--brand-teal)]/5 p-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--brand-teal)] mb-1">STRATEGY SUGGESTION</div>
          <div className="text-sm font-mono font-bold text-foreground">{data.strategyRecommendation.strategy}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{data.strategyRecommendation.reason}</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-3">
      <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-mono font-bold tabular-nums mt-0.5', color || 'text-foreground')}>{value}</div>
      {sub && <div className="text-[9px] font-mono text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
