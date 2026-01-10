import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, TrendingDown, Target, Calendar, DollarSign, 
  Trophy, AlertTriangle, BarChart3 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface PerformanceStats {
  symbol: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturn: number;
  totalPnL: number;
  lastTradeDate: string | null;
  bestTrade: { pnl: number; date: string } | null;
  worstTrade: { pnl: number; date: string } | null;
  avgHoldTime: string;
  gradeAtEntry: string[];
}

interface WatchlistPerformanceCardProps {
  symbol: string;
  compact?: boolean;
}

function StatRow({ label, value, trend, icon: Icon }: { 
  label: string; 
  value: string | number; 
  trend?: 'positive' | 'negative' | 'neutral';
  icon?: any;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-700/30 last:border-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        <span>{label}</span>
      </div>
      <span className={cn(
        "text-xs font-mono font-medium",
        trend === 'positive' && "text-green-400",
        trend === 'negative' && "text-red-400",
        trend === 'neutral' && "text-muted-foreground"
      )}>
        {value}
      </span>
    </div>
  );
}

export default function WatchlistPerformanceCard({ symbol, compact = false }: WatchlistPerformanceCardProps) {
  const { data: summary, isLoading } = useQuery<{ stats: PerformanceStats | null }>({
    queryKey: ['/api/watchlist/performance-summary', symbol],
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-800/30 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats = summary?.stats;

  if (!stats || stats.totalTrades === 0) {
    return (
      <Card className="bg-slate-800/30 backdrop-blur-sm" data-testid="performance-card-empty">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            Performance Attribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn(
            "flex flex-col items-center justify-center text-muted-foreground",
            compact ? "py-4" : "py-6"
          )}>
            <Target className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No trades for {symbol}</p>
            <p className="text-xs mt-1">Trade history will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const winRateColor = stats.winRate >= 70 ? 'text-green-400' : 
                        stats.winRate >= 50 ? 'text-cyan-400' : 
                        'text-red-400';

  return (
    <Card className="bg-slate-800/30 backdrop-blur-sm" data-testid="performance-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-400" />
            Performance Attribution
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn("text-xs", winRateColor)}
            >
              {stats.winRate.toFixed(1)}% WR
            </Badge>
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                stats.totalPnL >= 0 ? "text-green-400" : "text-red-400"
              )}
            >
              {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(0)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <StatRow 
            label="Total Trades" 
            value={stats.totalTrades}
            icon={Target}
          />
          <StatRow 
            label="Wins / Losses" 
            value={`${stats.wins}W / ${stats.losses}L`}
            trend={stats.wins > stats.losses ? 'positive' : stats.wins < stats.losses ? 'negative' : 'neutral'}
            icon={Trophy}
          />
          <StatRow 
            label="Avg Return" 
            value={`${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn.toFixed(1)}%`}
            trend={stats.avgReturn >= 0 ? 'positive' : 'negative'}
            icon={TrendingUp}
          />
          {stats.bestTrade && (
            <StatRow 
              label="Best Trade" 
              value={`+$${stats.bestTrade.pnl.toFixed(0)}`}
              trend="positive"
              icon={TrendingUp}
            />
          )}
          {stats.worstTrade && (
            <StatRow 
              label="Worst Trade" 
              value={`-$${Math.abs(stats.worstTrade.pnl).toFixed(0)}`}
              trend="negative"
              icon={TrendingDown}
            />
          )}
          <StatRow 
            label="Avg Hold Time" 
            value={stats.avgHoldTime}
            icon={Calendar}
          />
          {stats.lastTradeDate && (
            <StatRow 
              label="Last Trade" 
              value={formatDistanceToNow(new Date(stats.lastTradeDate), { addSuffix: true })}
              icon={Calendar}
            />
          )}
          {stats.gradeAtEntry.length > 0 && (
            <div className="pt-2 border-t border-slate-700/30 mt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Target className="h-3 w-3" />
                <span>Grades at Entry</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {stats.gradeAtEntry.map((grade, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs py-0">
                    {grade}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
