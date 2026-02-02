import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Activity, BarChart3, Target, AlertCircle } from "lucide-react";
import { formatCurrency, safeToFixed } from "@/lib/utils";

interface CryptoQuantAnalysisProps {
  symbol: string;
}

export function CryptoQuantAnalysis({ symbol }: CryptoQuantAnalysisProps) {
  const { data: analysis, isLoading } = useQuery<any>({
    queryKey: ['/api/quant/analyze', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/quant/analyze/${symbol}`);
      if (!res.ok) throw new Error('Failed to fetch analysis');
      return res.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Analysis not available for {symbol}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { rsi, macd, trend, volume, supportResistance } = analysis.analysis;

  const getRSIColor = (value: number) => {
    if (value < 30) return 'text-bullish';
    if (value > 70) return 'text-bearish';
    return 'text-muted-foreground';
  };

  const getMACDColor = (histogram: number) => {
    return histogram > 0 ? 'text-bullish' : 'text-bearish';
  };

  const getTrendColor = (direction: string) => {
    if (direction.includes('uptrend')) return 'text-bullish';
    if (direction.includes('downtrend')) return 'text-bearish';
    return 'text-muted-foreground';
  };

  const getVolumeColor = (signal: string) => {
    if (signal === 'high' || signal === 'above_average') return 'text-bullish';
    if (signal === 'low') return 'text-bearish';
    return 'text-muted-foreground';
  };

  return (
    <div className="space-y-4" data-testid={`crypto-analysis-${symbol}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* RSI Card */}
        <Card data-testid={`rsi-card-${symbol}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              RSI (14)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold font-mono ${getRSIColor(rsi.value)}`} data-testid={`rsi-value-${symbol}`}>
                  {safeToFixed(rsi.value, 2)}
                </span>
                <Badge variant={rsi.direction === 'long' ? 'default' : rsi.direction === 'short' ? 'destructive' : 'secondary'}>
                  {rsi.signal.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground" data-testid={`rsi-interpretation-${symbol}`}>
                {rsi.interpretation}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* MACD Card */}
        <Card data-testid={`macd-card-${symbol}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              MACD (12,26,9)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold font-mono ${getMACDColor(macd.histogram)}`} data-testid={`macd-value-${symbol}`}>
                  {macd.histogram > 0 ? '+' : ''}{safeToFixed(macd.histogram, 4, '0.0000')}
                </span>
                <Badge variant={macd.direction === 'long' ? 'default' : macd.direction === 'short' ? 'destructive' : 'secondary'}>
                  {macd.analysis.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground" data-testid={`macd-interpretation-${symbol}`}>
                {macd.interpretation}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Trend Card */}
        <Card data-testid={`trend-card-${symbol}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Trend Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                {trend.direction.includes('uptrend') ? (
                  <TrendingUp className={`h-6 w-6 ${getTrendColor(trend.direction)}`} />
                ) : (
                  <TrendingDown className={`h-6 w-6 ${getTrendColor(trend.direction)}`} />
                )}
                <Badge variant={trend.direction.includes('uptrend') ? 'default' : 'destructive'} data-testid={`trend-direction-${symbol}`}>
                  {trend.direction.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Price vs SMA(20): {trend.priceVsSMA20}</p>
                <p>Price vs SMA(50): {trend.priceVsSMA50}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Volume Card */}
        <Card data-testid={`volume-card-${symbol}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Volume Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold font-mono ${getVolumeColor(volume.signal)}`} data-testid={`volume-ratio-${symbol}`}>
                  {volume.ratio}x
                </span>
                <Badge variant={volume.signal === 'high' ? 'default' : volume.signal === 'low' ? 'destructive' : 'secondary'}>
                  {volume.signal.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground" data-testid={`volume-interpretation-${symbol}`}>
                {volume.interpretation}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Support/Resistance Card */}
      <Card data-testid={`sr-card-${symbol}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Support & Resistance (Bollinger Bands)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {supportResistance ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Support</p>
                <p className="text-lg font-bold font-mono text-bullish" data-testid={`support-level-${symbol}`}>
                  {formatCurrency(supportResistance.support)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {supportResistance.distanceToSupport}% away
              </p>
            </div>
            <div className="text-center border-l border-r">
              <p className="text-xs text-muted-foreground mb-1">Current Price</p>
              <p className="text-lg font-bold font-mono" data-testid={`current-price-${symbol}`}>
                {formatCurrency(analysis.currentPrice)}
              </p>
              <p className={`text-xs font-semibold mt-1 ${analysis.changePercent >= 0 ? 'text-bullish' : 'text-bearish'}`}>
                {analysis.changePercent >= 0 ? '+' : ''}{safeToFixed(analysis.changePercent, 2)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Resistance</p>
              <p className="text-lg font-bold font-mono text-bearish" data-testid={`resistance-level-${symbol}`}>
                {formatCurrency(supportResistance.resistance)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {supportResistance.distanceToResistance}% away
              </p>
            </div>
          </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Support/Resistance data unavailable
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
