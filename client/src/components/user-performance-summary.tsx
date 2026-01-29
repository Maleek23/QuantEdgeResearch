import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, TrendingUp, Zap, Award, Bot, Activity, BarChart3, Brain, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface EngineMetrics {
  tradesWon: number;
  tradesLost: number;
  winRate: number | null;
  avgGainPercent: number | null;
}

interface EngineHealthData {
  weekMetrics: Record<string, EngineMetrics>;
}

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    winRate: number;
    avgPercentGain: number;
  };
  segmentedWinRates: {
    overall: {
      winRate: number;
      wins: number;
      losses: number;
      decided: number;
    };
  };
}

interface AutoLottoBotPerformance {
  overall: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
  };
}

// Convert win rate to letter grade
function getGrade(winRate: number | null): { grade: string; color: string; bgColor: string } {
  if (winRate === null) return { grade: "?", color: "text-muted-foreground", bgColor: "bg-muted/20" };
  if (winRate >= 80) return { grade: "A+", color: "text-green-400", bgColor: "bg-green-500/10" };
  if (winRate >= 70) return { grade: "A", color: "text-green-400", bgColor: "bg-green-500/10" };
  if (winRate >= 60) return { grade: "B", color: "text-cyan-400", bgColor: "bg-cyan-500/10" };
  if (winRate >= 50) return { grade: "C", color: "text-amber-400", bgColor: "bg-amber-500/10" };
  if (winRate >= 40) return { grade: "D", color: "text-orange-400", bgColor: "bg-orange-500/10" };
  return { grade: "F", color: "text-red-400", bgColor: "bg-red-500/10" };
}

function getWinRateColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 70) return "text-green-400";
  if (rate >= 50) return "text-amber-400";
  return "text-red-400";
}

const ENGINE_CONFIG = {
  flow: { label: "Flow", icon: Activity, description: "Options flow signals" },
  quant: { label: "Quant", icon: BarChart3, description: "Statistical analysis" },
  ai: { label: "AI", icon: Brain, description: "AI pattern recognition" },
  lotto: { label: "Lotto", icon: Target, description: "High-risk plays" },
} as const;

type EngineKey = keyof typeof ENGINE_CONFIG;

export function UserPerformanceSummary() {
  const { data: stats, isLoading: isStatsLoading } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats'],
    staleTime: 60000,
  });

  const { data: engineHealthData, isLoading: isEngineLoading } = useQuery<EngineHealthData>({
    queryKey: ["/api/engine-health"],
    staleTime: 30000,
  });

  const { data: botData, isLoading: isBotLoading } = useQuery<AutoLottoBotPerformance>({
    queryKey: ["/api/performance/auto-lotto-bot"],
    staleTime: 30000,
  });

  const isLoading = isStatsLoading || isEngineLoading || isBotLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  const overallWinRate = stats?.segmentedWinRates?.overall?.winRate ?? 0;
  const totalDecided = stats?.segmentedWinRates?.overall?.decided ?? 0;
  const wins = stats?.segmentedWinRates?.overall?.wins ?? 0;
  const losses = stats?.segmentedWinRates?.overall?.losses ?? 0;
  const overallGrade = getGrade(overallWinRate);

  const engines: EngineKey[] = ["flow", "quant", "ai", "lotto"];

  return (
    <div className="space-y-6">
      {/* Trust Score Hero */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5" />
        <CardContent className="relative p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Main Trust Score */}
            <div className="flex items-center gap-6">
              <div className={cn(
                "h-20 w-20 rounded-2xl flex items-center justify-center text-3xl font-bold",
                overallGrade.bgColor, overallGrade.color
              )}>
                {overallGrade.grade}
              </div>
              <div>
                <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Platform Reliability</p>
                <p className={cn("text-4xl font-bold font-mono", getWinRateColor(overallWinRate))}>
                  {overallWinRate.toFixed(0)}%
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {wins} wins, {losses} losses ({totalDecided} resolved)
                </p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase">Total Ideas</p>
                <p className="text-2xl font-bold font-mono text-cyan-400">{stats?.overall?.totalIdeas ?? 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase">Avg Gain</p>
                <p className={cn(
                  "text-2xl font-bold font-mono",
                  (stats?.overall?.avgPercentGain ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {(stats?.overall?.avgPercentGain ?? 0) >= 0 ? '+' : ''}{(stats?.overall?.avgPercentGain ?? 0).toFixed(1)}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase">Bot P&L</p>
                <p className={cn(
                  "text-2xl font-bold font-mono",
                  (botData?.overall?.totalPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {(botData?.overall?.totalPnL ?? 0) >= 0 ? '+' : ''}${(botData?.overall?.totalPnL ?? 0).toFixed(0)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Engine Reliability Grades */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Engine Performance
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {engines.map((key) => {
            const config = ENGINE_CONFIG[key];
            const Icon = config.icon;
            const metrics = engineHealthData?.weekMetrics?.[key];
            const winRate = metrics?.winRate ?? null;
            const grade = getGrade(winRate);

            return (
              <Card key={key} className="hover-elevate">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{config.label}</span>
                    </div>
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold",
                      grade.bgColor, grade.color
                    )}>
                      {grade.grade}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={cn("text-xl font-bold font-mono", getWinRateColor(winRate))}>
                      {winRate !== null ? `${winRate.toFixed(0)}%` : '—'}
                    </span>
                    <span className="text-xs text-muted-foreground">win rate</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-400" />
                      {metrics?.tradesWon ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-red-400" />
                      {metrics?.tradesLost ?? 0}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Auto-Lotto Bot Summary */}
      {botData && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-amber-400" />
                <CardTitle className="text-base">Auto-Lotto Bot</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">
                Live Trading
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Trades</p>
                <p className="text-xl font-bold font-mono">{botData.overall.totalTrades}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
                <p className={cn("text-xl font-bold font-mono", getWinRateColor(botData.overall.winRate))}>
                  {botData.overall.winRate.toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">W/L</p>
                <p className="font-mono text-lg">
                  <span className="text-green-400">{botData.overall.wins}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-red-400">{botData.overall.losses}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Total P&L</p>
                <p className={cn(
                  "text-xl font-bold font-mono",
                  botData.overall.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {botData.overall.totalPnL >= 0 ? '+' : ''}${botData.overall.totalPnL.toFixed(0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* What This Means Section */}
      <Card className="bg-muted/20 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Zap className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium mb-1">What do these numbers mean?</p>
              <p className="text-muted-foreground">
                Our trading engines analyze market data to generate trade ideas. The win rate shows
                how often ideas that hit their target vs stop loss. A <span className="text-green-400 font-medium">70%+ win rate</span> indicates
                strong reliability. Engine grades (A-F) help you quickly compare performance across different strategies.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default UserPerformanceSummary;
