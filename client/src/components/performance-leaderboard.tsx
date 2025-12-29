import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Target, BarChart3, Zap, Trophy, AlertTriangle } from "lucide-react";

interface EnginePerformance {
  engine: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

interface SymbolPerformance {
  symbol: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

interface ConfidenceCalibration {
  band: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

interface DataIntelligence {
  summary: {
    totalIdeas: number;
    resolvedTrades: number;
    totalWins: number;
    totalLosses: number;
    overallWinRate: number;
  };
  enginePerformance: EnginePerformance[];
  symbolPerformance: SymbolPerformance[];
  confidenceCalibration: ConfidenceCalibration[];
}

function getWinRateColor(winRate: number): string {
  if (winRate >= 80) return "text-green-400";
  if (winRate >= 65) return "text-cyan-400";
  if (winRate >= 50) return "text-amber-400";
  return "text-red-400";
}

function getWinRateBgColor(winRate: number): string {
  if (winRate >= 80) return "bg-green-500/20";
  if (winRate >= 65) return "bg-cyan-500/20";
  if (winRate >= 50) return "bg-amber-500/20";
  return "bg-red-500/20";
}

function getEngineIcon(engine: string) {
  switch (engine) {
    case 'flow': return <Zap className="h-4 w-4 text-purple-400" />;
    case 'ai': return <Target className="h-4 w-4 text-cyan-400" />;
    case 'quant': return <BarChart3 className="h-4 w-4 text-amber-400" />;
    default: return <BarChart3 className="h-4 w-4 text-muted-foreground" />;
  }
}

export function PerformanceLeaderboard() {
  const { data: intelligence, isLoading } = useQuery<DataIntelligence>({
    queryKey: ['/api/data-intelligence'],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!intelligence) return null;

  const topSymbols = intelligence.symbolPerformance
    .filter(s => s.total >= 3)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 5);

  const worstSymbols = intelligence.symbolPerformance
    .filter(s => s.total >= 3)
    .sort((a, b) => a.winRate - b.winRate)
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="performance-leaderboard">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            Engine Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {intelligence.enginePerformance.slice(0, 4).map((engine) => (
            <div key={engine.engine} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {getEngineIcon(engine.engine)}
                  <span className="font-medium capitalize">{engine.engine}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("font-bold", getWinRateColor(engine.winRate))}>
                    {engine.winRate.toFixed(1)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({engine.wins}W/{engine.losses}L)
                  </span>
                </div>
              </div>
              <Progress 
                value={engine.winRate} 
                className="h-1.5"
                data-testid={`progress-engine-${engine.engine}`}
              />
            </div>
          ))}
          <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
            Based on {intelligence.summary.resolvedTrades} resolved trades
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            Top Symbols
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topSymbols.map((symbol, idx) => (
            <div 
              key={symbol.symbol} 
              className="flex items-center justify-between"
              data-testid={`symbol-row-${symbol.symbol}`}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center",
                  idx === 0 ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"
                )}>
                  {idx + 1}
                </span>
                <span className="font-mono font-medium text-sm">{symbol.symbol}</span>
              </div>
              <div className="flex items-center gap-2">
                {symbol.winRate >= 50 ? (
                  <TrendingUp className="h-3 w-3 text-green-400" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-400" />
                )}
                <Badge 
                  variant="outline" 
                  className={cn("text-[10px] h-5", getWinRateBgColor(symbol.winRate), getWinRateColor(symbol.winRate))}
                >
                  {symbol.winRate.toFixed(0)}% ({symbol.total})
                </Badge>
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            Avoid: {worstSymbols.map(s => s.symbol).join(', ')}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-cyan-400" />
            Confidence Calibration
            <Badge variant="destructive" className="text-[9px] h-4 ml-1">NEEDS FIX</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {intelligence.confidenceCalibration.map((band) => {
            const expectedRate = band.band === 'A' ? 90 : 
                                band.band === 'B+' ? 80 : 
                                band.band === 'B' ? 70 : 
                                band.band === 'C+' ? 60 : 
                                band.band === 'C' ? 50 : 40;
            const deviation = band.winRate - expectedRate;
            
            return (
              <div key={band.band} className="flex items-center justify-between text-sm">
                <Badge 
                  variant="outline"
                  className={cn(
                    "font-bold text-xs h-6 w-8 justify-center",
                    band.band.startsWith('A') ? "bg-green-500/20 text-green-400 border-green-500/50" :
                    band.band.startsWith('B') ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50" :
                    band.band.startsWith('C') ? "bg-amber-500/20 text-amber-400 border-amber-500/50" :
                    "bg-muted/30 text-muted-foreground border-muted"
                  )}
                >
                  {band.band}
                </Badge>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Expected {expectedRate}%</span>
                  <span className={cn("font-bold", getWinRateColor(band.winRate))}>
                    {band.winRate.toFixed(0)}%
                  </span>
                  <Badge 
                    variant={deviation >= 0 ? "default" : "destructive"}
                    className="text-[10px] h-4"
                  >
                    {deviation >= 0 ? '+' : ''}{deviation.toFixed(0)}
                  </Badge>
                </div>
              </div>
            );
          })}
          <div className="pt-2 border-t border-border/50 text-xs text-red-400">
            C+ band outperforming A band - recalibration needed
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
