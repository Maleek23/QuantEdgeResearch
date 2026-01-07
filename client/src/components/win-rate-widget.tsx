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
import { cn } from "@/lib/utils";

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
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-16 w-full" />
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
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="widget-win-rate">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            Performance
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {totalTrades} trades
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn(
          "flex items-center justify-center gap-3 p-3 rounded-lg border",
          getWinRateBg(winRate)
        )}>
          <Award className={cn("h-8 w-8", getWinRateColor(winRate))} />
          <div className="text-center">
            <div className={cn("text-3xl font-bold tabular-nums", getWinRateColor(winRate))}>
              {winRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">All-Time Win Rate</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 rounded-md bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">7-Day</div>
            <div className={cn("text-lg font-bold tabular-nums", getWinRateColor(weeklyWinRate))}>
              {weeklyWinRate.toFixed(0)}%
            </div>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">30-Day</div>
            <div className={cn("text-lg font-bold tabular-nums", getWinRateColor(monthlyWinRate))}>
              {monthlyWinRate.toFixed(0)}%
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            {totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-400" />
            )}
            <span className="text-xs text-muted-foreground">Total P&L:</span>
          </div>
          <span className={cn(
            "font-bold tabular-nums",
            totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
          )}>
            {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
          </span>
        </div>

        {stats?.topSymbols && stats.topSymbols.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> Top Performers
            </div>
            {stats.topSymbols.slice(0, 3).map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-medium">{s.symbol}</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    s.winRate >= 50 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {s.winRate.toFixed(0)}%
                  </span>
                  <span className={cn(
                    "tabular-nums",
                    s.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(0)}
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
