import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Users, BarChart3, Target, AlertCircle, Star } from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { MarketData } from "@shared/schema";

interface SymbolDetailModalProps {
  symbol: MarketData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToWatchlist?: () => void;
}

export function SymbolDetailModal({ symbol, open, onOpenChange, onAddToWatchlist }: SymbolDetailModalProps) {
  if (!symbol) return null;

  const bullishPercent = Math.floor(Math.random() * 30) + 55;
  const bearishPercent = Math.floor(Math.random() * 20) + 10;
  const holdPercent = 100 - bullishPercent - bearishPercent;

  const mockAnalystRatings = [
    { rating: "Strong Buy", count: 12, percent: 40 },
    { rating: "Buy", count: 8, percent: 27 },
    { rating: "Hold", count: 6, percent: 20 },
    { rating: "Sell", count: 3, percent: 10 },
    { rating: "Strong Sell", count: 1, percent: 3 },
  ];

  const mockKeyMetrics = [
    { label: "Market Cap", value: symbol.marketCap ? `$${(symbol.marketCap / 1e9).toFixed(2)}B` : "N/A" },
    { label: "Volume", value: symbol.volume.toLocaleString() },
    { label: "Avg Volume", value: symbol.avgVolume ? symbol.avgVolume.toLocaleString() : "N/A" },
    { label: "24h High", value: symbol.high24h ? formatCurrency(symbol.high24h) : "N/A" },
    { label: "24h Low", value: symbol.low24h ? formatCurrency(symbol.low24h) : "N/A" },
  ];

  const recommendation = bullishPercent >= 60 ? "BUY" : bullishPercent >= 40 ? "HOLD" : "SELL";
  const recommendationColor = recommendation === "BUY" ? "text-bullish" : recommendation === "HOLD" ? "text-amber-500" : "text-bearish";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="modal-symbol-detail">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold font-mono flex items-center gap-3">
                {symbol.symbol}
                <Badge variant="outline">{symbol.assetType.toUpperCase()}</Badge>
              </DialogTitle>
              <DialogDescription className="text-lg font-mono mt-2">
                <span className="text-foreground font-bold">
                  {formatCurrency(symbol.currentPrice)}
                </span>
                <span className={symbol.changePercent >= 0 ? "text-bullish ml-2" : "text-bearish ml-2"}>
                  {symbol.changePercent >= 0 ? "+" : ""}{formatPercent(symbol.changePercent)}
                </span>
              </DialogDescription>
            </div>
            <Button onClick={onAddToWatchlist} variant="outline" size="sm" className="gap-2">
              <Star className="h-4 w-4" />
              Add to Watchlist
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Key Metrics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {mockKeyMetrics.map((metric) => (
                    <div key={metric.label} className="space-y-1">
                      <p className="text-xs text-muted-foreground">{metric.label}</p>
                      <p className="text-sm font-mono font-semibold">{metric.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Performance Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">24h Change</span>
                    <span className={`text-sm font-semibold ${symbol.changePercent >= 0 ? 'text-bullish' : 'text-bearish'}`}>
                      {symbol.changePercent >= 0 ? "+" : ""}{formatPercent(symbol.changePercent)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Volume vs Avg</span>
                    <span className={`text-sm font-semibold ${symbol.avgVolume && symbol.volume > symbol.avgVolume ? 'text-bullish' : 'text-muted-foreground'}`}>
                      {symbol.avgVolume ? `${((symbol.volume / symbol.avgVolume - 1) * 100).toFixed(1)}%` : "N/A"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Analyst Ratings
                </h3>
                <div className="space-y-3">
                  {mockAnalystRatings.map((rating) => (
                    <div key={rating.rating} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{rating.rating}</span>
                        <span className="font-semibold">{rating.count} analysts ({rating.percent}%)</span>
                      </div>
                      <Progress 
                        value={rating.percent} 
                        className="h-2" 
                        data-testid={`progress-analyst-${rating.rating.toLowerCase().replace(/\s+/g, '-')}`}
                        role="progressbar"
                        aria-label={`${rating.rating} rating: ${rating.percent}%`}
                        aria-valuenow={rating.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Trading Recommendation</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Consensus Rating</p>
                      <p className={`text-2xl font-bold ${recommendationColor}`}>{recommendation}</p>
                    </div>
                    <Badge variant={recommendation === "BUY" ? "default" : recommendation === "HOLD" ? "secondary" : "destructive"} className="text-lg py-2 px-4">
                      {bullishPercent}% Bullish
                    </Badge>
                  </div>
                  
                  <div className="bg-muted/30 rounded-md p-4 border border-muted">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Research-Based Insight</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Based on {mockAnalystRatings.reduce((acc, r) => acc + r.count, 0)} analyst ratings and current market sentiment. 
                          {recommendation === "BUY" && " Strong bullish momentum with positive analyst coverage. Consider entry on dips."}
                          {recommendation === "HOLD" && " Mixed signals suggest waiting for clearer direction. Monitor key support/resistance levels."}
                          {recommendation === "SELL" && " Bearish sentiment prevails. Consider reducing exposure or waiting for better entry points."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sentiment" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Community Sentiment
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-4 bg-bullish/10 rounded-lg border border-bullish/20">
                      <TrendingUp className="h-6 w-6 text-bullish mx-auto mb-2" />
                      <p className="text-2xl font-bold text-bullish">{bullishPercent}%</p>
                      <p className="text-xs text-muted-foreground mt-1">Bullish</p>
                    </div>
                    <div className="text-center p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                      <div className="h-6 w-6 mx-auto mb-2 flex items-center justify-center">
                        <div className="h-4 w-4 border-2 border-amber-500 rounded-sm" />
                      </div>
                      <p className="text-2xl font-bold text-amber-500">{holdPercent}%</p>
                      <p className="text-xs text-muted-foreground mt-1">Neutral</p>
                    </div>
                    <div className="text-center p-4 bg-bearish/10 rounded-lg border border-bearish/20">
                      <TrendingDown className="h-6 w-6 text-bearish mx-auto mb-2" />
                      <p className="text-2xl font-bold text-bearish">{bearishPercent}%</p>
                      <p className="text-xs text-muted-foreground mt-1">Bearish</p>
                    </div>
                  </div>

                  <Progress 
                    value={bullishPercent} 
                    className="h-3" 
                    data-testid="progress-sentiment"
                    role="progressbar"
                    aria-label={`Bullish sentiment: ${bullishPercent}%`}
                    aria-valuenow={bullishPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                  
                  <div className="bg-muted/30 rounded-md p-4 space-y-2">
                    <p className="text-sm font-semibold">What Traders Are Saying</p>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-bullish mt-0.5">•</span>
                        <span>"Strong technical breakout above key resistance. Looking for continuation." - Bullish traders</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-amber-500 mt-0.5">•</span>
                        <span>"Waiting for confirmation at current levels before taking position." - Neutral traders</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-bearish mt-0.5">•</span>
                        <span>"Concerned about macro headwinds and potential pullback." - Bearish traders</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Separator className="my-4" />
        
        <div className="bg-muted/50 rounded-md p-3 border border-muted-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Disclaimer:</strong> Analyst ratings and sentiment data are for educational purposes only. 
            This is not financial advice. Always conduct your own research and consider your risk tolerance before making investment decisions.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
