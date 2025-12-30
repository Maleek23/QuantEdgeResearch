import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Activity, TrendingUp, TrendingDown, Award, AlertTriangle, Zap, Brain, BarChart3, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface EngineStats {
  engine: string;
  displayName: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgGain: number;
}

interface EngineActualStatsData {
  engines: EngineStats[];
  summary: {
    totalResolvedTrades: number;
    bestEngine: string;
    bestWinRate: number;
    worstEngine: string;
    worstWinRate: number;
    lastUpdated: string;
  };
}

const getEngineIcon = (engine: string) => {
  switch (engine.toLowerCase()) {
    case 'flow': return <Zap className="h-4 w-4" />;
    case 'ai': return <Brain className="h-4 w-4" />;
    case 'quant': return <BarChart3 className="h-4 w-4" />;
    case 'hybrid': return <Activity className="h-4 w-4" />;
    default: return <Target className="h-4 w-4" />;
  }
};

const getWinRateColor = (winRate: number) => {
  if (winRate >= 70) return "text-green-500";
  if (winRate >= 50) return "text-amber-500";
  return "text-red-500";
};

const getWinRateBg = (winRate: number) => {
  if (winRate >= 70) return "bg-green-500";
  if (winRate >= 50) return "bg-amber-500";
  return "bg-red-500";
};

export default function EngineActualPerformance() {
  const { data, isLoading, error } = useQuery<EngineActualStatsData>({
    queryKey: ['/api/performance/engine-actual-stats'],
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-engine-performance-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="card-engine-performance-error">
        <CardHeader>
          <CardTitle>Engine Performance</CardTitle>
          <CardDescription>Actual win rates by engine</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load engine performance data.</p>
        </CardContent>
      </Card>
    );
  }

  const { engines, summary } = data;

  return (
    <Card data-testid="card-engine-actual-performance">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Actual Engine Performance
            </CardTitle>
            <CardDescription>
              Verified from {summary.totalResolvedTrades} resolved trades
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            Updated: {new Date(summary.lastUpdated).toLocaleDateString()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <TrendingUp className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="text-sm text-emerald-600 dark:text-emerald-400">
            <p className="font-medium">Best Performer: {summary.bestEngine}</p>
            <p className="text-xs mt-1 text-emerald-500/80">
              Win rate: <span className="font-mono font-semibold">{summary.bestWinRate}%</span>
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {engines.map((engine, index) => (
            <div 
              key={engine.engine}
              className={cn(
                "p-4 rounded-lg border transition-colors",
                index === 0 ? "bg-green-500/5 border-green-500/20" : "bg-muted/30"
              )}
              data-testid={`engine-stats-${engine.engine}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "p-1.5 rounded-md",
                    index === 0 ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"
                  )}>
                    {getEngineIcon(engine.engine)}
                  </div>
                  <div>
                    <p className="font-semibold">{engine.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {engine.totalTrades} trades ({engine.wins}W / {engine.losses}L)
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-2xl font-bold font-mono", getWinRateColor(engine.winRate))}>
                    {engine.winRate}%
                  </p>
                  <p className={cn(
                    "text-xs font-mono",
                    engine.avgGain >= 0 ? "text-green-500" : "text-red-500"
                  )}>
                    Avg: {engine.avgGain >= 0 ? '+' : ''}{engine.avgGain}%
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <Progress 
                  value={engine.winRate} 
                  className={cn("h-2", getWinRateBg(engine.winRate))}
                />
              </div>
            </div>
          ))}
        </div>

        {engines.some(e => e.winRate < 40) && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-600 dark:text-amber-400">
              <p className="font-medium">Low Performers Identified</p>
              <p className="text-xs mt-1 text-amber-500/80">
                Engines with &lt;40% win rate have been adjusted with confidence penalties.
              </p>
            </div>
          </div>
        )}

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Data source: All resolved trades with hit_target or hit_stop outcomes. 
            Confidence scores are now adjusted based on these actual performance metrics.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
