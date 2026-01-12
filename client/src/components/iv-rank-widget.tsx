/**
 * 📊 IV Rank Widget
 * 
 * Displays volatility analysis for key symbols:
 * - IV Rank (where current IV sits in 52-week range)
 * - IV vs RV (is premium expensive or cheap?)
 * - Strategy recommendation
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Activity, Minus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VolatilityAnalysis {
  symbol: string;
  currentIV: number;
  realizedVol20: number;
  ivRank: number;
  ivPercentile: number;
  ivVsRv: 'expensive' | 'cheap' | 'fair';
  ivRvRatio: number;
  recommendation: 'buy_premium' | 'sell_premium' | 'neutral';
  signals: string[];
}

const KEY_SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'NVDA'];

function IVRankBar({ value, label }: { value: number; label: string }) {
  const getColor = () => {
    if (value < 30) return 'bg-blue-500';
    if (value < 50) return 'bg-green-500';
    if (value < 70) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-mono font-medium text-slate-300">{value.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all", getColor())}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function SymbolVolCard({ symbol }: { symbol: string }) {
  const { data, isLoading, error } = useQuery<VolatilityAnalysis>({
    queryKey: ['/api/volatility-analysis', symbol],
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/30 space-y-2">
        <Skeleton className="h-4 w-16 bg-slate-700/50" />
        <Skeleton className="h-2 w-full bg-slate-700/50" />
        <Skeleton className="h-3 w-20 bg-slate-700/50" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/30 flex items-center gap-2">
        <span className="font-mono font-medium text-sm text-slate-200">{symbol}</span>
        <span className="text-xs text-slate-500">No data</span>
      </div>
    );
  }

  const getRecommendationBadge = () => {
    switch (data.recommendation) {
      case 'buy_premium':
        return (
          <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/50">
            <TrendingUp className="h-3 w-3 mr-1" />
            BUY
          </Badge>
        );
      case 'sell_premium':
        return (
          <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/50">
            <TrendingDown className="h-3 w-3 mr-1" />
            SELL
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            <Minus className="h-3 w-3 mr-1" />
            NEUTRAL
          </Badge>
        );
    }
  };

  const getIVvsRVColor = () => {
    switch (data.ivVsRv) {
      case 'expensive': return 'text-red-400';
      case 'cheap': return 'text-green-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/30 space-y-2" data-testid={`iv-card-${symbol}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono font-bold text-sm text-slate-200">{symbol}</span>
        {getRecommendationBadge()}
      </div>
      
      <IVRankBar value={data.ivRank} label="IV Rank" />
      
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-slate-500">IV: </span>
          <span className="font-mono text-slate-300">{data.currentIV.toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-slate-500">RV: </span>
          <span className="font-mono text-slate-300">{data.realizedVol20.toFixed(1)}%</span>
        </div>
        <div className={cn("font-medium", getIVvsRVColor())}>
          {data.ivVsRv === 'expensive' ? 'Expensive' : 
           data.ivVsRv === 'cheap' ? 'Cheap' : 'Fair'}
        </div>
      </div>
    </div>
  );
}

export function IVRankWidget() {
  return (
    <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30 shadow-[0_0_30px_-10px_rgba(168,85,247,0.06)] hover:shadow-[0_0_40px_-10px_rgba(168,85,247,0.1)] transition-all duration-300" data-testid="widget-iv-rank">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-slate-200">
            <Activity className="h-4 w-4 text-purple-400" />
            IV Rank Analysis
          </CardTitle>
          <Badge className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30">
            Volatility
          </Badge>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          IV Rank shows where current implied volatility sits in the 52-week range
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {KEY_SYMBOLS.map(symbol => (
            <SymbolVolCard key={symbol} symbol={symbol} />
          ))}
        </div>
        
        <div className="border-t border-slate-700/30 pt-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <AlertTriangle className="h-3 w-3" />
            <span>
              <strong className="text-slate-400">Low IV (&lt;30%)</strong> = Buy premium | 
              <strong className="text-slate-400"> High IV (&gt;70%)</strong> = Sell premium
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default IVRankWidget;
