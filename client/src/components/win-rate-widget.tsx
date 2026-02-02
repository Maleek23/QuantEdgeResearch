import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Trophy, 
  TrendingUp,
  TrendingDown,
  Target,
  Award
} from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";

interface PerformanceStats {
  overall: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    avgWin: number;
    avgLoss: number;
  };
  weekly: {
    trades: number;
    winRate: number;
    pnl: number;
  };
  monthly: {
    trades: number;
    winRate: number;
    pnl: number;
  };
  topSymbols: Array<{
    symbol: string;
    trades: number;
    winRate: number;
    pnl: number;
  }>;
}

export function WinRateWidget() {
  const { data: stats, isLoading } = useQuery<PerformanceStats>({
    queryKey: ['/api/auto-lotto/performance-summary'],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30 shadow-[0_0_30px_-10px_rgba(34,211,238,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-200">
            <Trophy className="h-4 w-4 text-amber-400" />
            Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full bg-slate-800/50" />
          <Skeleton className="h-16 w-full bg-slate-800/50" />
        </CardContent>
      </Card>
    );
  }

  const winRate = stats?.overall?.winRate || 0;
  const totalTrades = stats?.overall?.totalTrades || 0;
  const totalPnL = stats?.overall?.totalPnL || 0;
  const weeklyWinRate = stats?.weekly?.winRate || 0;
  const monthlyWinRate = stats?.monthly?.winRate || 0;

  const getWinRateColor = (rate: number) => {
    if (rate >= 60) return 'text-green-400';
    if (rate >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getWinRateBg = (rate: number) => {
    if (rate >= 60) return 'bg-green-500/20 border-green-500/40';
    if (rate >= 50) return 'bg-amber-500/20 border-amber-500/40';
    return 'bg-red-500/20 border-red-500/40';
  };

  return (
    <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30 shadow-[0_0_30px_-10px_rgba(34,211,238,0.06)] hover:shadow-[0_0_40px_-10px_rgba(34,211,238,0.1)] transition-all duration-300" data-testid="widget-win-rate">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-200">
            <Trophy className="h-4 w-4 text-amber-400" />
            Performance
          </CardTitle>
          <Badge className="text-xs bg-slate-800/60 text-slate-300 border border-slate-700/50">
            {totalTrades} trades
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn(
          "flex items-center justify-center gap-3 p-4 rounded-lg border",
          getWinRateBg(winRate)
        )}>
          <Award className={cn("h-8 w-8", getWinRateColor(winRate))} />
          <div className="text-center">
            <div className={cn("text-3xl font-bold font-mono tabular-nums", getWinRateColor(winRate))}>
              {safeToFixed(winRate, 1)}%
            </div>
            <div className="text-xs text-muted-foreground">All-Time Win Rate</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
            <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">7-Day</div>
            <div className={cn("text-lg font-bold font-mono tabular-nums", getWinRateColor(weeklyWinRate))}>
              {safeToFixed(weeklyWinRate, 0)}%
            </div>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
            <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">30-Day</div>
            <div className={cn("text-lg font-bold font-mono tabular-nums", getWinRateColor(monthlyWinRate))}>
              {safeToFixed(monthlyWinRate, 0)}%
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-700/30">
          <div className="flex items-center gap-2">
            {totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-400" />
            )}
            <span className="text-xs text-slate-500">Total P&L:</span>
          </div>
          <span className={cn(
            "font-bold font-mono tabular-nums",
            totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
          )}>
            {totalPnL >= 0 ? '+' : ''}${safeToFixed(totalPnL, 2)}
          </span>
        </div>

        {stats?.topSymbols && stats.topSymbols.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Target className="h-3 w-3" /> Top Performers
            </div>
            {stats.topSymbols.slice(0, 3).map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-medium font-mono text-slate-200">{s.symbol}</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-mono",
                    s.winRate >= 50 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {safeToFixed(s.winRate, 0)}%
                  </span>
                  <span className={cn(
                    "font-mono tabular-nums",
                    s.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {s.pnl >= 0 ? '+' : ''}${safeToFixed(s.pnl, 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
