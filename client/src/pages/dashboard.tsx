import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TradeIdeaBlock } from "@/components/trade-idea-block";
import { SymbolSearch } from "@/components/symbol-search";
import { SymbolDetailModal } from "@/components/symbol-detail-modal";
import { QuantAIBot } from "@/components/quantai-bot";
import { getMarketSession, formatCTTime } from "@/lib/utils";
import type { MarketData, TradeIdea, Catalyst, WatchlistItem } from "@shared/schema";
import { 
  TrendingUp, TrendingDown, Activity, Star, Bot, Sparkles, BarChart3, 
  AlertCircle, ArrowRight, Target, Shield 
} from "lucide-react";

export default function Dashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState<MarketData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [chatBotOpen, setChatBotOpen] = useState(false);
  const currentSession = getMarketSession();
  const currentTime = formatCTTime(new Date());

  const { data: marketData = [], isLoading: marketLoading } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
  });

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 60000,
  });

  const { data: catalysts = [], isLoading: catalystsLoading } = useQuery<Catalyst[]>({
    queryKey: ['/api/catalysts'],
  });

  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
  });

  // Calculate metrics
  const activeIdeas = tradeIdeas.filter(i => i.outcomeStatus === 'open');
  const archivedIdeas = tradeIdeas.filter(i => i.outcomeStatus !== 'open');
  const aiIdeas = activeIdeas.filter(i => i.source === 'ai');
  const quantIdeas = activeIdeas.filter(i => i.source === 'quant');
  const topGainers = marketData.filter(d => d.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
  const topLosers = marketData.filter(d => d.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);
  const recentIdeas = activeIdeas.slice(0, 3);
  const highGradeIdeas = activeIdeas.filter(i => i.confidenceScore >= 80);

  const handleViewDetails = (symbol: string) => {
    const symbolData = marketData.find(d => d.symbol === symbol);
    if (symbolData) {
      setSelectedSymbol(symbolData);
      setDetailModalOpen(true);
    }
  };

  const handleAddToWatchlist = (idea: TradeIdea) => {
    // This will be handled by the TradeIdeaBlock component
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Dashboard</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              {currentTime} • {currentSession}
            </p>
          </div>
        </div>
        <Button onClick={() => setChatBotOpen(true)} className="gap-2" data-testid="button-open-chat">
          <Bot className="h-4 w-4" />
          Ask QuantAI
        </Button>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search & Add Symbols</CardTitle>
        </CardHeader>
        <CardContent>
          <SymbolSearch />
        </CardContent>
      </Card>

      {/* Metrics Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Ideas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-active-ideas">{activeIdeas.length}</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="gap-1">
                <Sparkles className="h-3 w-3" />
                {aiIdeas.length} AI
              </Badge>
              <Badge variant="outline" className="gap-1">
                <BarChart3 className="h-3 w-3" />
                {quantIdeas.length} Quant
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Grade Ideas</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500" data-testid="metric-high-grade">{highGradeIdeas.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Confidence ≥80%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tracked Assets</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-watchlist">{watchlist.length}</div>
            <p className="text-xs text-muted-foreground mt-1">In watchlist</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Catalysts</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="metric-catalysts">{catalysts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Active drivers</p>
          </CardContent>
        </Card>
      </div>

      {/* Market Movers */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Gainers</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {marketLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topGainers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gainers yet</p>
            ) : (
              <div className="space-y-2">
                {topGainers.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between p-2 rounded-lg hover-elevate active-elevate-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{stock.symbol}</span>
                      <Badge variant="outline" className="text-xs">
                        {stock.assetType}
                      </Badge>
                    </div>
                    <span className="font-semibold text-green-500">+{stock.changePercent.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Losers</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {marketLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topLosers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No losers yet</p>
            ) : (
              <div className="space-y-2">
                {topLosers.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between p-2 rounded-lg hover-elevate active-elevate-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{stock.symbol}</span>
                      <Badge variant="outline" className="text-xs">
                        {stock.assetType}
                      </Badge>
                    </div>
                    <span className="font-semibold text-red-500">{stock.changePercent.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Trade Ideas Preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1">
          <CardTitle>Recent Trade Ideas</CardTitle>
          <Link href="/trade-ideas">
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-view-all-ideas">
              View All
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {ideasLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" data-testid={`skeleton-idea-${i}`} />
              ))}
            </div>
          ) : recentIdeas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No active trade ideas</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Use Quick Actions above to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentIdeas.map((idea) => (
                <TradeIdeaBlock
                  key={idea.id}
                  idea={idea}
                  currentPrice={marketData.find(d => d.symbol === idea.symbol)?.currentPrice}
                  onViewDetails={handleViewDetails}
                  onAddToWatchlist={handleAddToWatchlist}
                  data-testid={`preview-idea-${idea.id}`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/market">
          <Card className="hover-elevate active-elevate-2 cursor-pointer transition-all">
            <CardContent className="flex items-center gap-3 p-6">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-semibold">Market Overview</h3>
                <p className="text-sm text-muted-foreground">Live prices & stats</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/watchlist">
          <Card className="hover-elevate active-elevate-2 cursor-pointer transition-all">
            <CardContent className="flex items-center gap-3 p-6">
              <Star className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-semibold">Watchlist</h3>
                <p className="text-sm text-muted-foreground">{watchlist.length} tracked assets</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/risk">
          <Card className="hover-elevate active-elevate-2 cursor-pointer transition-all">
            <CardContent className="flex items-center gap-3 p-6">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <h3 className="font-semibold">Risk Calculator</h3>
                <p className="text-sm text-muted-foreground">Position sizing tool</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Modals */}
      <SymbolDetailModal 
        symbol={selectedSymbol}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />

      <QuantAIBot 
        isOpen={chatBotOpen} 
        onClose={() => setChatBotOpen(false)} 
      />
    </div>
  );
}
