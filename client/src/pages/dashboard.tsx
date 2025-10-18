import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MarketData, TradeIdea, Catalyst, WatchlistItem } from "@shared/schema";
import { 
  TrendingUp, TrendingDown, Activity, Star, Bot, Sparkles, BarChart3, 
  AlertCircle, ArrowRight, Target, Shield, Zap 
} from "lucide-react";

export default function Dashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState<MarketData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [chatBotOpen, setChatBotOpen] = useState(false);
  const currentSession = getMarketSession();
  const currentTime = formatCTTime(new Date());
  const { toast } = useToast();

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

  // Generate Quant Ideas mutation
  const generateQuantIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/quant/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "Quant Ideas Generated",
        description: `Generated ${data.count || data.newIdeas || 0} new quantitative trade ideas`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate quant ideas",
        variant: "destructive"
      });
    }
  });

  // Generate AI Ideas mutation
  const generateAIIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/ai/generate-ideas', {
        marketContext: "Current market conditions with focus on stocks, options, and crypto"
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "AI Ideas Generated",
        description: `Generated ${data.count || 0} new AI-powered trade ideas`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate AI ideas",
        variant: "destructive"
      });
    }
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text" data-testid="text-page-title">
            Dashboard
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-sm text-muted-foreground font-mono">
              {currentTime}
            </p>
            <span className="text-muted-foreground">•</span>
            <Badge variant="outline" className="text-xs font-medium">
              {currentSession}
            </Badge>
          </div>
        </div>
        <Button onClick={() => setChatBotOpen(true)} className="gap-2 shadow-lg" data-testid="button-open-chat">
          <Bot className="h-4 w-4" />
          Ask QuantAI
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg border-primary/20">
          <CardHeader className="bg-gradient-to-r from-card to-muted/20 border-b border-border/50">
            <CardTitle className="text-lg font-bold">Search & Add Symbols</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <SymbolSearch />
          </CardContent>
        </Card>

        <Card className="shadow-lg border-primary/20 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-chart-2 to-chart-3" />
          <CardHeader className="bg-gradient-to-r from-card to-muted/20 border-b border-border/50">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              Generate New Ideas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            <Button 
              onClick={() => generateQuantIdeas.mutate()}
              disabled={generateQuantIdeas.isPending}
              className="w-full gap-2 shadow-md"
              data-testid="button-generate-quant"
            >
              <BarChart3 className="h-4 w-4" />
              {generateQuantIdeas.isPending ? "Generating..." : "Generate Quant Ideas"}
            </Button>
            <Button 
              onClick={() => generateAIIdeas.mutate()}
              disabled={generateAIIdeas.isPending}
              variant="outline"
              className="w-full gap-2"
              data-testid="button-generate-ai"
            >
              <Sparkles className="h-4 w-4" />
              {generateAIIdeas.isPending ? "Generating..." : "Generate AI Ideas"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Summary */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="stat-card shadow-lg border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide">Active Ideas</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold font-mono tracking-tight" data-testid="metric-active-ideas">{activeIdeas.length}</div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 text-xs">
                <Sparkles className="h-3 w-3" />
                {aiIdeas.length} AI
              </Badge>
              <Badge variant="outline" className="gap-1 text-xs">
                <BarChart3 className="h-3 w-3" />
                {quantIdeas.length} Quant
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card stat-card-bullish shadow-lg border-green-500/20">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide">High Grade Ideas</CardTitle>
            <div className="p-2 rounded-lg bg-green-500/10">
              <Target className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold font-mono text-green-500 tracking-tight" data-testid="metric-high-grade">{highGradeIdeas.length}</div>
            <p className="text-xs text-muted-foreground">Confidence ≥80%</p>
          </CardContent>
        </Card>

        <Card className="stat-card shadow-lg border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide">Tracked Assets</CardTitle>
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Star className="h-4 w-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold font-mono tracking-tight" data-testid="metric-watchlist">{watchlist.length}</div>
            <p className="text-xs text-muted-foreground">In watchlist</p>
          </CardContent>
        </Card>

        <Card className="stat-card shadow-lg border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold tracking-wide">Market Catalysts</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold font-mono tracking-tight" data-testid="metric-catalysts">{catalysts.length}</div>
            <p className="text-xs text-muted-foreground">Active drivers</p>
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
