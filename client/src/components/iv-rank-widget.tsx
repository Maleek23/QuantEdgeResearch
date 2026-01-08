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
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{value.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
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
      <div className="p-3 rounded-lg bg-muted/30 space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-3 rounded-lg bg-muted/30 flex items-center gap-2">
        <span className="font-mono font-medium text-sm">{symbol}</span>
        <span className="text-xs text-muted-foreground">No data</span>
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
    <div className="p-3 rounded-lg bg-muted/30 space-y-2" data-testid={`iv-card-${symbol}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono font-bold text-sm">{symbol}</span>
        {getRecommendationBadge()}
      </div>
      
      <IVRankBar value={data.ivRank} label="IV Rank" />
      
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="text-muted-foreground">IV: </span>
          <span className="font-mono">{data.currentIV.toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">RV: </span>
          <span className="font-mono">{data.realizedVol20.toFixed(1)}%</span>
        </div>
        <div className={cn("font-medium", getIVvsRVColor())}>
          {data.ivVsRv === 'expensive' ? '📈 Expensive' : 
           data.ivVsRv === 'cheap' ? '📉 Cheap' : '⚖️ Fair'}
        </div>
      </div>
    </div>
  );
}

export function IVRankWidget() {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="widget-iv-rank">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-400" />
            IV Rank Analysis
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            📊 Volatility
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          IV Rank shows where current implied volatility sits in the 52-week range
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {KEY_SYMBOLS.map(symbol => (
            <SymbolVolCard key={symbol} symbol={symbol} />
          ))}
        </div>
        
        <div className="border-t border-border/50 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            <span>
              <strong>Low IV (&lt;30%)</strong> = Buy premium | 
              <strong> High IV (&gt;70%)</strong> = Sell premium
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default IVRankWidget;
