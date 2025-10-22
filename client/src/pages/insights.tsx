import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { WatchlistItem, MarketData } from "@shared/schema";
import { 
  Lightbulb, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  AlertTriangle,
  Target,
  DollarSign,
  Calendar,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

export default function InsightsPage() {
  const [, setLocation] = useLocation();
  
  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    refetchInterval: 60000, // Refresh every minute
    refetchOnWindowFocus: true,
  });

  // Fetch market data for each watchlist symbol
  const watchlistSymbols = watchlist.map(w => w.symbol);
  const symbolsParam = watchlistSymbols.join(',');
  const { data: marketDataList = [] } = useQuery<MarketData[]>({
    queryKey: [`/api/market-data/batch/${symbolsParam}`],
    enabled: watchlistSymbols.length > 0,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getMarketData = (symbol: string): MarketData | undefined => {
    return marketDataList.find(m => m.symbol === symbol);
  };

  const getInsightForSymbol = (symbol: string, marketData?: MarketData): {
    type: 'bullish' | 'bearish' | 'neutral' | 'warning';
    title: string;
    description: string;
  } => {
    if (!marketData) {
      return {
        type: 'neutral',
        title: 'Awaiting Data',
        description: 'Market data is currently being loaded for analysis.',
      };
    }

    const changePercent = marketData.changePercent;
    const price = marketData.currentPrice;
    const volume = marketData.volume;
    const avgVolume = marketData.avgVolume || volume;
    const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

    // Penny stock warning
    if (price < 5 && price > 0) {
      return {
        type: 'warning',
        title: 'Penny Stock - High Risk',
        description: `Trading at $${price.toFixed(4)} - Extreme volatility and liquidity concerns. Options markets may be limited. Research fundamental catalysts before entry.`,
      };
    }

    // Strong momentum analysis
    if (changePercent > 5 && volumeRatio > 1.5) {
      return {
        type: 'bullish',
        title: 'Strong Bullish Momentum',
        description: `${changePercent.toFixed(1)}% gain with ${volumeRatio.toFixed(1)}x average volume. Potential breakout in progress - watch for continuation or exhaustion signals.`,
      };
    }

    if (changePercent < -5 && volumeRatio > 1.5) {
      return {
        type: 'bearish',
        title: 'Heavy Selling Pressure',
        description: `${Math.abs(changePercent).toFixed(1)}% decline with elevated volume. Consider oversold bounce potential or wait for support confirmation.`,
      };
    }

    // Moderate moves
    if (changePercent > 2) {
      return {
        type: 'bullish',
        title: 'Positive Price Action',
        description: `${changePercent.toFixed(1)}% gain today. Monitor for continued strength or profit-taking resistance.`,
      };
    }

    if (changePercent < -2) {
      return {
        type: 'bearish',
        title: 'Weakness Developing',
        description: `${Math.abs(changePercent).toFixed(1)}% decline. Watch key support levels for potential reversal or breakdown.`,
      };
    }

    // Low volatility
    if (Math.abs(changePercent) < 1 && volumeRatio < 0.8) {
      return {
        type: 'neutral',
        title: 'Consolidation Phase',
        description: 'Low volatility and below-average volume suggest accumulation or distribution. Wait for directional catalyst.',
      };
    }

    return {
      type: 'neutral',
      title: 'Steady State',
      description: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% - Trading within normal range. Monitor for emerging patterns.`,
    };
  };

  if (watchlistLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
          <div className="relative pt-6">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-gradient-premium" data-testid="text-page-title">
              <Lightbulb className="h-7 w-7 text-amber-500 neon-accent" />
              Insights
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Deep analysis and tracking for your favorite symbols
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Lightbulb className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Symbols Tracked</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Add symbols to your Watchlist to receive personalized insights and tracking.
              Navigate to Watchlist or use Symbol Search to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-gradient-premium" data-testid="text-page-title">
              <Lightbulb className="h-7 w-7 text-amber-500 neon-accent" />
              Insights
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Deep analysis and tracking for your {watchlist.length} favorite symbol{watchlist.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {watchlist.map((item) => {
          const marketData = getMarketData(item.symbol);
          const insight = getInsightForSymbol(item.symbol, marketData);
          const isPositive = marketData ? marketData.changePercent >= 0 : false;

          return (
            <div key={item.id} className="gradient-border-card spotlight">
              <Card className="glass-card shadow-lg border-0">
                <CardHeader className="bg-gradient-to-r from-card/80 to-primary/5 border-b border-border/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CardTitle className="text-2xl font-mono" data-testid={`text-symbol-${item.symbol}`}>
                          {item.symbol}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs" data-testid={`badge-asset-${item.symbol}`}>
                          {item.assetType.toUpperCase()}
                        </Badge>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground" data-testid={`text-notes-${item.symbol}`}>
                          {item.notes}
                        </p>
                      )}
                    </div>
                    {marketData && (
                      <div className="text-right">
                        <div className="text-2xl font-bold font-mono" data-testid={`text-price-${item.symbol}`}>
                          ${marketData.currentPrice.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: marketData.currentPrice >= 100 ? 2 : 4
                          })}
                        </div>
                        <div className={cn(
                          "text-sm font-medium flex items-center gap-1 justify-end",
                          isPositive ? "text-green-500" : "text-red-500"
                        )} data-testid={`text-change-${item.symbol}`}>
                          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {isPositive ? '+' : ''}{marketData.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-4">
                  {/* Insight Card */}
                  <div className={cn(
                    "rounded-lg p-4 border-l-4",
                    insight.type === 'bullish' && "bg-green-500/10 border-green-500",
                    insight.type === 'bearish' && "bg-red-500/10 border-red-500",
                    insight.type === 'warning' && "bg-amber-500/10 border-amber-500",
                    insight.type === 'neutral' && "bg-primary/10 border-primary"
                  )}>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        insight.type === 'bullish' && "bg-green-500/20",
                        insight.type === 'bearish' && "bg-red-500/20",
                        insight.type === 'warning' && "bg-amber-500/20",
                        insight.type === 'neutral' && "bg-primary/20"
                      )}>
                        {insight.type === 'bullish' && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {insight.type === 'bearish' && <TrendingDown className="h-4 w-4 text-red-500" />}
                        {insight.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        {insight.type === 'neutral' && <Activity className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm mb-1" data-testid={`text-insight-title-${item.symbol}`}>
                          {insight.title}
                        </h4>
                        <p className="text-xs text-muted-foreground" data-testid={`text-insight-desc-${item.symbol}`}>
                          {insight.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Key Metrics */}
                  {marketData && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <BarChart3 className="h-3 w-3" />
                            Volume
                          </div>
                          <div className="font-mono text-sm font-medium" data-testid={`text-volume-${item.symbol}`}>
                            {marketData.volume?.toLocaleString() || 'N/A'}
                          </div>
                          {marketData.avgVolume && (
                            <div className="text-xs text-muted-foreground">
                              {((marketData.volume / marketData.avgVolume) * 100).toFixed(0)}% of avg
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Target className="h-3 w-3" />
                            Target Price
                          </div>
                          <div className="font-mono text-sm font-medium" data-testid={`text-target-${item.symbol}`}>
                            {item.targetPrice ? `$${item.targetPrice.toFixed(2)}` : 'Not set'}
                          </div>
                          {item.targetPrice && (
                            <div className={cn(
                              "text-xs font-medium",
                              marketData.currentPrice < item.targetPrice ? "text-green-500" : "text-muted-foreground"
                            )}>
                              {marketData.currentPrice < item.targetPrice 
                                ? `+${(((item.targetPrice - marketData.currentPrice) / marketData.currentPrice) * 100).toFixed(1)}% upside`
                                : 'Target reached'}
                            </div>
                          )}
                        </div>

                        {marketData.session && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Activity className="h-3 w-3" />
                              Session
                            </div>
                            <div className="text-sm font-medium" data-testid={`text-session-${item.symbol}`}>
                              {marketData.session === 'rth' ? 'Regular Hours' : 
                               marketData.session === 'pre-market' ? 'Pre-Market' : 'After Hours'}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Added
                          </div>
                          <div className="text-sm font-medium" data-testid={`text-added-${item.symbol}`}>
                            {new Date(item.addedAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Action Buttons */}
                  <Separator />
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setLocation(`/market?symbol=${item.symbol}`)}
                      data-testid={`button-view-details-${item.symbol.toLowerCase()}`}
                    >
                      <DollarSign className="h-3 w-3 mr-2" />
                      View Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setLocation(`/trade-ideas?create=${item.symbol}`)}
                      data-testid={`button-generate-idea-${item.symbol.toLowerCase()}`}
                    >
                      <Target className="h-3 w-3 mr-2" />
                      Generate Idea
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Educational Disclaimer */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-amber-500 mb-1">Educational Research Only</h4>
              <p className="text-xs text-muted-foreground">
                These insights are for educational and research purposes only. Not financial advice. 
                All trading involves substantial risk. Always conduct your own due diligence and consult 
                with licensed financial professionals before making investment decisions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
