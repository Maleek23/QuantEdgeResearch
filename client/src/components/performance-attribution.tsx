import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  BarChart3, Target, TrendingUp, TrendingDown, 
  Eye, AlertCircle, Sparkles, Activity
} from 'lucide-react';
import { cn, safeToFixed } from '@/lib/utils';
import { tierBadgeStyle } from '@/components/canon';

interface TierPerformance {
  watched: number;
  traded: number;
  conversionRate: number;
  winRate: number;
  avgReturn: number;
  totalPnl: number;
}

interface PerformanceByTier {
  S: TierPerformance;
  A: TierPerformance;
  B: TierPerformance;
  C: TierPerformance;
  D: TierPerformance;
  F: TierPerformance;
}

interface MissedOpportunity {
  symbol: string;
  tier: string;
  gradeScore: number;
  priceSinceAdded: number;
  addedAt: string;
}

interface PerformanceAttributionProps {
  year?: number;
  compact?: boolean;
}

// Tier colour now comes from canon/tierBadgeStyle, which is backed by the
// --grade-* tokens. The map that was here hardcoded purple/cyan/orange beside
// entries that already used tokens, and duplicated two other copies verbatim.

function formatPnl(pnl: number): string {
  const prefix = pnl >= 0 ? '+' : '';
  return `${prefix}$${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function TierRow({ tier, data }: { tier: string; data: TierPerformance }) {
  const tierStyle = tierBadgeStyle(tier);
  
  if (data.watched === 0) return null;
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/30" data-testid={`tier-row-${tier}`}>
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold font-mono text-lg border"
        style={tierStyle}
      >
        {tier}
      </div>
      
      <div className="flex-1 grid grid-cols-5 gap-2 text-sm">
        <div>
          <span className="text-xs text-muted-foreground block">Watched</span>
          <span className="font-mono">{data.watched}</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Traded</span>
          <span className="font-mono">{data.traded} ({safeToFixed(data.conversionRate, 0, '0')}%)</span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Win Rate</span>
          <span className={cn(
            "font-mono font-semibold",
            data.winRate >= 60 ? "text-[var(--trade-bullish)]" :
            data.winRate >= 40 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bearish)]"
          )}>
            {safeToFixed(data.winRate, 0, '0')}%
          </span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Avg Return</span>
          <span className={cn(
            "font-mono font-semibold",
            data.avgReturn >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
          )}>
            {data.avgReturn >= 0 ? '+' : ''}{safeToFixed(data.avgReturn, 1, '0.0')}%
          </span>
        </div>
        <div>
          <span className="text-xs text-muted-foreground block">Total P&L</span>
          <span className={cn(
            "font-mono font-semibold",
            data.totalPnl >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
          )}>
            {formatPnl(data.totalPnl)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PerformanceAttribution({ 
  year = new Date().getFullYear(),
  compact = false 
}: PerformanceAttributionProps) {
  const { data: performance, isLoading: perfLoading } = useQuery<PerformanceByTier>({
    queryKey: ['/api/personal-edge/performance', { year }],
    staleTime: 5 * 60 * 1000,
  });

  const { data: missedOps, isLoading: missedLoading } = useQuery<MissedOpportunity[]>({
    queryKey: ['/api/personal-edge/missed-opportunities'],
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = perfLoading || missedLoading;

  if (isLoading) {
    return (
      <Card className="border-cyan-500/20" data-testid="performance-attribution-loading">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            {year} Elite Setup ROI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const eliteTiers = performance ? ['S', 'A'].filter(t => performance[t as keyof PerformanceByTier].watched > 0) : [];
  const eliteStats = eliteTiers.length > 0 && performance ? {
    watched: eliteTiers.reduce((sum, t) => sum + performance[t as keyof PerformanceByTier].watched, 0),
    traded: eliteTiers.reduce((sum, t) => sum + performance[t as keyof PerformanceByTier].traded, 0),
    totalPnl: eliteTiers.reduce((sum, t) => sum + performance[t as keyof PerformanceByTier].totalPnl, 0),
    avgWinRate: eliteTiers.reduce((sum, t) => sum + performance[t as keyof PerformanceByTier].winRate, 0) / eliteTiers.length,
  } : null;

  if (compact) {
    return (
      <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent" data-testid="performance-attribution-compact">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              {year} Elite ROI
            </span>
            {eliteStats && (
              <Badge variant="outline" className={cn(
                "text-xs",
                eliteStats.avgWinRate >= 60 ? "border-green-500/40 text-[var(--trade-bullish)]" : "border-amber-500/40 text-[var(--trade-neutral)]"
              )}>
                {safeToFixed(eliteStats.avgWinRate, 0, '0')}% WR
              </Badge>
            )}
          </div>
          
          {eliteStats ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">S+A Watched</p>
                <p className="font-mono font-semibold">{eliteStats.watched}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Traded</p>
                <p className="font-mono font-semibold">{eliteStats.traded}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">P&L</p>
                <p className={cn(
                  "font-mono font-semibold",
                  eliteStats.totalPnl >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                )}>
                  {formatPnl(eliteStats.totalPnl)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center">No elite setup activity yet</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent" data-testid="performance-attribution">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-cyan-400" />
          {year} Elite Setup Performance
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Track your ROI by watchlist tier to discover where your edge lies
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {eliteStats && (
          <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-semibold">Elite Tier Summary (S + A)</span>
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Symbols Watched</p>
                <p className="text-xl font-bold font-mono tabular-nums">{eliteStats.watched}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Symbols Traded</p>
                <p className="text-xl font-bold font-mono tabular-nums">{eliteStats.traded}</p>
                <p className="text-xs text-muted-foreground">
                  {safeToFixed((eliteStats.traded / eliteStats.watched) * 100, 0, '0')}% conversion
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className={cn(
                  "text-xl font-bold font-mono",
                  eliteStats.avgWinRate >= 60 ? "text-[var(--trade-bullish)]" :
                  eliteStats.avgWinRate >= 40 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bearish)]"
                )}>
                  {safeToFixed(eliteStats.avgWinRate, 0, '0')}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total P&L</p>
                <p className={cn(
                  "text-xl font-bold font-mono",
                  eliteStats.totalPnl >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                )}>
                  {formatPnl(eliteStats.totalPnl)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Performance by Tier
          </h4>
          {performance ? (
            <div className="space-y-2">
              {(['S', 'A', 'B', 'C', 'D', 'F'] as const).map(tier => (
                <TierRow key={tier} tier={tier} data={performance[tier]} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No tier data available</p>
          )}
        </div>

        {missedOps && missedOps.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-[var(--trade-neutral)] flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4" />
              Missed Opportunities
            </h4>
            <div className="space-y-2">
              {missedOps.slice(0, 3).map((op) => (
                <div 
                  key={op.symbol} 
                  className="flex items-center justify-between p-2 rounded-md bg-amber-500/10 border border-amber-500/20"
                  data-testid={`missed-op-${op.symbol}`}
                >
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs border" style={tierBadgeStyle(op.tier)}>
                      {op.tier}
                    </Badge>
                    <span className="font-mono font-semibold">{op.symbol}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[var(--trade-bullish)] font-mono font-semibold">
                      +{safeToFixed(op.priceSinceAdded, 1, '0.0')}%
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">since added</span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-center mt-2">
                Lesson: Trade more of your S/A-tier ideas
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
