import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Flame, ChevronRight, RefreshCw, ArrowUpRight, Target, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface BullishTrend {
  symbol: string;
  name?: string;
  sector?: string;
  currentPrice: number;
  changePercent: number;
  strength: 'strong' | 'moderate' | 'weak' | 'emerging';
  phase: string;
  signals?: string[];
  momentumScore?: number;
  relativeVolume?: number;
}

interface BreakoutStock {
  symbol: string;
  name?: string;
  breakoutType: string;
  currentPrice: number;
  breakoutLevel: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  changePercent: number;
  confirmedAt?: string;
}

function getStrengthColor(strength: string) {
  switch (strength) {
    case 'strong': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'moderate': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'emerging': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function BullishPatternWidget() {
  const { data: trends, isLoading: loadingTrends } = useQuery<BullishTrend[]>({
    queryKey: ['/api/bullish-trends/top'],
    queryFn: async () => {
      const res = await fetch('/api/bullish-trends/top?limit=5');
      if (!res.ok) throw new Error('Failed to fetch trends');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: breakouts, isLoading: loadingBreakouts } = useQuery<BreakoutStock[]>({
    queryKey: ['/api/bullish-trends/breakouts'],
    queryFn: async () => {
      const res = await fetch('/api/bullish-trends/breakouts');
      if (!res.ok) throw new Error('Failed to fetch breakouts');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const isLoading = loadingTrends || loadingBreakouts;
  const topTrends = trends?.slice(0, 4) || [];
  const topBreakouts = breakouts?.slice(0, 3) || [];

  return (
    <Card className="bg-gradient-to-br from-slate-900/60 to-green-950/30 border-green-500/20" data-testid="card-bullish-patterns">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-green-500/20 border border-green-500/30">
              <TrendingUp className="h-4 w-4 text-green-400" />
            </div>
            <CardTitle className="text-sm font-bold">Bullish Patterns</CardTitle>
          </div>
          <Link href="/trends">
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" data-testid="button-view-all-patterns">
              View All <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {topTrends.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <Flame className="h-3 w-3 text-orange-400" />
                  Top Momentum
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {topTrends.map((trend) => (
                    <div 
                      key={trend.symbol}
                      className="p-2 rounded-md bg-slate-800/50 border border-slate-700/50 hover-elevate cursor-pointer"
                      data-testid={`trend-${trend.symbol}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-bold">{trend.symbol}</span>
                        <span className={cn(
                          "text-[10px] font-mono",
                          trend.changePercent >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                          {trend.changePercent >= 0 ? "+" : ""}{trend.changePercent?.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant="outline" className={cn("text-[8px] px-1 py-0", getStrengthColor(trend.strength))}>
                          {trend.strength}
                        </Badge>
                        {trend.momentumScore && trend.momentumScore > 70 && (
                          <Zap className="h-2.5 w-2.5 text-amber-400" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topBreakouts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <ArrowUpRight className="h-3 w-3 text-cyan-400" />
                  Active Breakouts
                </div>
                <div className="space-y-1.5">
                  {topBreakouts.map((breakout) => (
                    <div 
                      key={breakout.symbol}
                      className="flex items-center justify-between p-2 rounded-md bg-cyan-500/5 border border-cyan-500/20"
                      data-testid={`breakout-${breakout.symbol}`}
                    >
                      <div className="flex items-center gap-2">
                        <Target className="h-3 w-3 text-cyan-400" />
                        <span className="font-mono text-xs font-bold">{breakout.symbol}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ${breakout.currentPrice?.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {breakout.volumeRatio && breakout.volumeRatio > 1.5 && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 bg-purple-500/20 text-purple-400 border-purple-500/30">
                            {breakout.volumeRatio.toFixed(1)}x Vol
                          </Badge>
                        )}
                        <span className={cn(
                          "text-[10px] font-mono",
                          breakout.changePercent >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                          {breakout.changePercent >= 0 ? "+" : ""}{breakout.changePercent?.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topTrends.length === 0 && topBreakouts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <AlertTriangle className="h-6 w-6 text-amber-400 mb-2" />
                <p className="text-xs text-muted-foreground">
                  No active bullish patterns detected
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface SectorData {
  name: string;
  symbols: {
    symbol: string;
    heatScore: number;
    distinctSources: number;
    convergenceLevel: number;
    direction: string;
  }[];
}

export function SectorHeatWidget() {
  const { data, isLoading } = useQuery<{ sectors: SectorData[] }>({
    queryKey: ['/api/bullish-trends/heat-map'],
    queryFn: async () => {
      const res = await fetch('/api/bullish-trends/heat-map');
      if (!res.ok) throw new Error('Failed to fetch heat map');
      return res.json();
    },
    refetchInterval: 120000,
  });

  const sectorHeat = (data?.sectors || [])
    .map(sector => {
      const avgHeat = sector.symbols.length > 0
        ? sector.symbols.reduce((sum, s) => sum + s.heatScore, 0) / sector.symbols.length
        : 0;
      return {
        name: sector.name,
        avgHeat,
        count: sector.symbols.length,
        symbols: sector.symbols.slice(0, 3).map(s => s.symbol)
      };
    })
    .filter(s => s.count > 0)
    .sort((a, b) => b.avgHeat - a.avgHeat)
    .slice(0, 5);

  return (
    <Card className="bg-gradient-to-br from-slate-900/60 to-purple-950/30 border-purple-500/20" data-testid="card-sector-heat">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-purple-500/20 border border-purple-500/30">
            <Flame className="h-4 w-4 text-purple-400" />
          </div>
          <CardTitle className="text-sm font-bold">Sector Heat</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : sectorHeat.length > 0 ? (
          <div className="space-y-2">
            {sectorHeat.map(sector => {
              const heatLevel = sector.avgHeat >= 70 ? 'hot' : sector.avgHeat >= 40 ? 'warm' : 'cool';
              const heatColors = {
                hot: 'bg-red-500/20 border-red-500/30',
                warm: 'bg-amber-500/20 border-amber-500/30',
                cool: 'bg-blue-500/20 border-blue-500/30',
              };
              return (
                <div 
                  key={sector.name}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-md border",
                    heatColors[heatLevel]
                  )}
                  data-testid={`sector-${sector.name.toLowerCase().replace(' ', '-')}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{sector.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {sector.symbols.join(', ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {sector.count} stocks
                    </Badge>
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold",
                      heatLevel === 'hot' ? 'bg-red-500 text-red-950' :
                      heatLevel === 'warm' ? 'bg-amber-500 text-amber-950' :
                      'bg-blue-500 text-blue-950'
                    )}>
                      {Math.round(sector.avgHeat)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-muted-foreground">
            No sector data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
