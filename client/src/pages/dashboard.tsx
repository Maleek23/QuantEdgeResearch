import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketSessionBadge } from "@/components/market-session-badge";
import { PriceCard } from "@/components/price-card";
import { TradeIdeaCard } from "@/components/trade-idea-card";
import { RiskCalculator } from "@/components/risk-calculator";
import { CatalystFeed } from "@/components/catalyst-feed";
import { ScreenerFilters } from "@/components/screener-filters";
import { WatchlistTable } from "@/components/watchlist-table";
import { ThemeToggle } from "@/components/theme-toggle";
import { SymbolSearch } from "@/components/symbol-search";
import { SymbolDetailModal } from "@/components/symbol-detail-modal";
import { getMarketSession, formatCTTime } from "@/lib/utils";
import type { MarketData, TradeIdea, Catalyst, WatchlistItem, ScreenerFilters as Filters } from "@shared/schema";
import { TrendingUp, DollarSign, Activity, Settings, Search, Clock, Star, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const [activeFilters, setActiveFilters] = useState<Filters>({});
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<MarketData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [nextRefresh, setNextRefresh] = useState<number>(60);
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "daily" | "all">("all");
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
    refetchInterval: 60000,
  });

  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    refetchOnWindowFocus: true,
  });

  const refreshPricesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/refresh-prices', {});
    },
    onSuccess: () => {
      setLastUpdate(new Date());
      setNextRefresh(60);
      queryClient.invalidateQueries({ queryKey: ['/api/market-data'] });
    },
    onError: () => {
      toast({
        title: "Refresh Failed",
        description: "Could not update prices. Trying again shortly.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setNextRefresh((prev) => {
        if (prev <= 1) {
          refreshPricesMutation.mutate();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    refreshPricesMutation.mutate();
  };

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/watchlist/${id}`);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/watchlist'] });
      const previousWatchlist = queryClient.getQueryData<WatchlistItem[]>(['/api/watchlist']);
      queryClient.setQueryData<WatchlistItem[]>(
        ['/api/watchlist'],
        (old = []) => old.filter((item) => item.id !== id)
      );
      return { previousWatchlist };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(['/api/watchlist'], context?.previousWatchlist);
      toast({
        title: "Error",
        description: "Failed to remove from watchlist. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Removed from watchlist",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
  });

  const handleRemoveFromWatchlist = (id: string) => {
    removeFromWatchlistMutation.mutate(id);
  };

  const filteredMarketData = marketData.filter((data) => {
    if (activeFilters.assetType && activeFilters.assetType.length > 0) {
      if (!activeFilters.assetType.includes(data.assetType)) return false;
    }
    if (activeFilters.priceRange) {
      if (activeFilters.priceRange.min && data.currentPrice < activeFilters.priceRange.min) return false;
      if (activeFilters.priceRange.max && data.currentPrice > activeFilters.priceRange.max) return false;
    }
    if (activeFilters.volumeThreshold && data.volume < activeFilters.volumeThreshold) return false;
    if (activeFilters.pennyStocksOnly && data.currentPrice >= 5) return false;
    if (activeFilters.unusualVolume && data.avgVolume && data.volume < data.avgVolume * 2) return false;
    return true;
  });

  const filteredTradeIdeas = tradeIdeas.filter((idea) => {
    if (!tradeIdeaSearch) return true;
    return idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase());
  });

  const addToWatchlistMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const symbolData = marketData.find(m => m.symbol === symbol);
      if (!symbolData) throw new Error("Symbol not found");
      
      return await apiRequest('POST', '/api/watchlist', {
        symbol: symbol,
        assetType: symbolData.assetType,
        targetPrice: symbolData.currentPrice * 1.1,
        notes: "Added from dashboard",
        addedAt: new Date().toISOString(),
      });
    },
    onMutate: async (symbol: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/watchlist'] });
      const previousWatchlist = queryClient.getQueryData<WatchlistItem[]>(['/api/watchlist']);
      const symbolData = marketData.find(m => m.symbol === symbol);
      
      if (symbolData) {
        const newItem: WatchlistItem = {
          id: `temp-${Date.now()}`,
          symbol: symbol,
          assetType: symbolData.assetType,
          targetPrice: symbolData.currentPrice * 1.1,
          notes: "Added from dashboard",
          addedAt: new Date().toISOString(),
        };
        
        queryClient.setQueryData<WatchlistItem[]>(
          ['/api/watchlist'],
          (old = []) => [...old, newItem]
        );
      }
      
      return { previousWatchlist };
    },
    onError: (err, symbol, context) => {
      queryClient.setQueryData(['/api/watchlist'], context?.previousWatchlist);
      toast({
        title: "Error",
        description: "Failed to add to watchlist. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Added to Watchlist",
        description: "Symbol successfully added to your watchlist",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
  });

  const handleViewSymbolDetails = (symbol: MarketData) => {
    setSelectedSymbol(symbol);
    setDetailModalOpen(true);
  };

  const handleAddToWatchlist = (symbol: string) => {
    addToWatchlistMutation.mutate(symbol);
  };

  const topGainer = marketData.length > 0 
    ? marketData.reduce((max, data) => data.changePercent > max.changePercent ? data : max)
    : null;

  const topLoser = marketData.length > 0
    ? marketData.reduce((min, data) => data.changePercent < min.changePercent ? data : min)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold" data-testid="text-app-title">QuantEdge Research</h1>
              </div>
              <MarketSessionBadge session={currentSession} />
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-muted-foreground font-mono" data-testid="text-current-time">
                {currentTime}
              </span>
              <ThemeToggle />
              <Button variant="ghost" size="icon" data-testid="button-settings">
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card data-testid="card-stat-opportunities">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Opportunities</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-stat-opportunities">
                {tradeIdeas.length}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {tradeIdeas.filter(t => t.riskRewardRatio >= 2).length} high R:R (≥2:1)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {marketData.length} symbols tracked
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-top-gainer" className="hover-elevate cursor-pointer" onClick={() => topGainer && handleViewSymbolDetails(topGainer)}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Gainer</CardTitle>
              <ArrowUp className="h-4 w-4 text-bullish" />
            </CardHeader>
            <CardContent>
              {topGainer ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono">{topGainer.symbol}</span>
                    <span className="text-sm text-bullish font-semibold">+{topGainer.changePercent.toFixed(2)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    ${topGainer.currentPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {topGainer.assetType.charAt(0).toUpperCase() + topGainer.assetType.slice(1)}
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-top-loser" className="hover-elevate cursor-pointer" onClick={() => topLoser && handleViewSymbolDetails(topLoser)}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Loser</CardTitle>
              <ArrowDown className="h-4 w-4 text-bearish" />
            </CardHeader>
            <CardContent>
              {topLoser ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono">{topLoser.symbol}</span>
                    <span className="text-sm text-bearish font-semibold">{topLoser.changePercent.toFixed(2)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    ${topLoser.currentPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {topLoser.assetType.charAt(0).toUpperCase() + topLoser.assetType.slice(1)}
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6" data-testid="card-symbol-search">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & Add Symbols
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Search for any stock or crypto to add it to your dashboard. Crypto works instantly (BTC, ETH, SOL, DOGE, etc.). Stocks require Alpha Vantage API key.
            </p>
          </CardHeader>
          <CardContent>
            <SymbolSearch />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <Tabs defaultValue="stocks" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="options" data-testid="tab-options">Options</TabsTrigger>
                <TabsTrigger value="stocks" data-testid="tab-stocks">Stocks</TabsTrigger>
                <TabsTrigger value="crypto" data-testid="tab-crypto">Crypto</TabsTrigger>
              </TabsList>

              {/* Options Tab */}
              <TabsContent value="options" className="space-y-4 mt-6">
                <div className="flex flex-col sm:flex-row gap-3 mb-4 justify-between">
                  <div className="flex gap-2">
                    <Button 
                      variant={activeDirection === "all" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("all")}
                    >
                      All
                    </Button>
                    <Button 
                      variant={activeDirection === "long" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("long")}
                    >
                      Long
                    </Button>
                    <Button 
                      variant={activeDirection === "short" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("short")}
                    >
                      Short
                    </Button>
                    <Button 
                      variant={activeDirection === "daily" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("daily")}
                    >
                      Daily
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last: {formatCTTime(lastUpdate)} • Next: {nextRefresh}s</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleManualRefresh}
                      disabled={refreshPricesMutation.isPending}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshPricesMutation.isPending ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>

                {ideasLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-[400px] w-full" />
                  </div>
                ) : tradeIdeas.filter(t => t.assetType === "option" && (activeDirection === "all" || t.direction === activeDirection)).length > 0 ? (
                  <div className="space-y-4">
                    {tradeIdeas.filter(t => t.assetType === "option" && (activeDirection === "all" || t.direction === activeDirection)).map((idea) => {
                      const symbolData = marketData.find(m => m.symbol === idea.symbol);
                      return (
                        <TradeIdeaCard 
                          key={idea.id} 
                          idea={idea}
                          currentPrice={symbolData?.currentPrice}
                          changePercent={symbolData?.changePercent}
                          onViewDetails={() => symbolData && handleViewSymbolDetails(symbolData)}
                          onAddToWatchlist={() => handleAddToWatchlist(idea.symbol)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                      <p className="text-muted-foreground">No {activeDirection !== "all" ? activeDirection : ""} options trade ideas available</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Stocks Tab */}
              <TabsContent value="stocks" className="space-y-4 mt-6">
                <div className="flex flex-col sm:flex-row gap-3 mb-4 justify-between">
                  <div className="flex gap-2">
                    <Button 
                      variant={activeDirection === "all" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("all")}
                    >
                      All
                    </Button>
                    <Button 
                      variant={activeDirection === "long" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("long")}
                    >
                      Long
                    </Button>
                    <Button 
                      variant={activeDirection === "short" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("short")}
                    >
                      Short
                    </Button>
                    <Button 
                      variant={activeDirection === "daily" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("daily")}
                    >
                      Daily
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last: {formatCTTime(lastUpdate)} • Next: {nextRefresh}s</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleManualRefresh}
                      disabled={refreshPricesMutation.isPending}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshPricesMutation.isPending ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>

                {ideasLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-[400px] w-full" />
                  </div>
                ) : tradeIdeas.filter(t => t.assetType === "stock" && (activeDirection === "all" || t.direction === activeDirection)).length > 0 ? (
                  <div className="space-y-4">
                    {tradeIdeas.filter(t => t.assetType === "stock" && (activeDirection === "all" || t.direction === activeDirection)).map((idea) => {
                      const symbolData = marketData.find(m => m.symbol === idea.symbol);
                      return (
                        <TradeIdeaCard 
                          key={idea.id} 
                          idea={idea}
                          currentPrice={symbolData?.currentPrice}
                          changePercent={symbolData?.changePercent}
                          onViewDetails={() => symbolData && handleViewSymbolDetails(symbolData)}
                          onAddToWatchlist={() => handleAddToWatchlist(idea.symbol)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                      <p className="text-muted-foreground">No {activeDirection !== "all" ? activeDirection : ""} stock trade ideas available</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Crypto Tab */}
              <TabsContent value="crypto" className="space-y-4 mt-6">
                <div className="flex flex-col sm:flex-row gap-3 mb-4 justify-between">
                  <div className="flex gap-2">
                    <Button 
                      variant={activeDirection === "all" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("all")}
                    >
                      All
                    </Button>
                    <Button 
                      variant={activeDirection === "long" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("long")}
                    >
                      Long
                    </Button>
                    <Button 
                      variant={activeDirection === "short" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("short")}
                    >
                      Short
                    </Button>
                    <Button 
                      variant={activeDirection === "daily" ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setActiveDirection("daily")}
                    >
                      Daily
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last: {formatCTTime(lastUpdate)} • Next: {nextRefresh}s</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleManualRefresh}
                      disabled={refreshPricesMutation.isPending}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshPricesMutation.isPending ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>

                {ideasLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-[400px] w-full" />
                  </div>
                ) : tradeIdeas.filter(t => t.assetType === "crypto" && (activeDirection === "all" || t.direction === activeDirection)).length > 0 ? (
                  <div className="space-y-4">
                    {tradeIdeas.filter(t => t.assetType === "crypto" && (activeDirection === "all" || t.direction === activeDirection)).map((idea) => {
                      const symbolData = marketData.find(m => m.symbol === idea.symbol);
                      return (
                        <TradeIdeaCard 
                          key={idea.id} 
                          idea={idea}
                          currentPrice={symbolData?.currentPrice}
                          changePercent={symbolData?.changePercent}
                          onViewDetails={() => symbolData && handleViewSymbolDetails(symbolData)}
                          onAddToWatchlist={() => handleAddToWatchlist(idea.symbol)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                      <p className="text-muted-foreground">No {activeDirection !== "all" ? activeDirection : ""} crypto trade ideas available</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <WatchlistTable 
              items={watchlist} 
              onRemove={handleRemoveFromWatchlist}
              isRemoving={removeFromWatchlistMutation.isPending}
            />
            <CatalystFeed catalysts={catalysts} />
          </div>
        </div>

        <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-muted-border">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Important Disclaimer:</strong> All content provided on QuantEdge Research is for 
            educational and research purposes only. This platform does not provide personalized financial advice or recommendations. 
            Trading involves substantial risk of loss. Always conduct your own research, understand the risks, and consider consulting 
            with a qualified financial advisor before making any investment decisions. Past performance does not guarantee future results.
          </p>
        </div>
      </main>

      <SymbolDetailModal
        symbol={selectedSymbol}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onAddToWatchlist={() => selectedSymbol && handleAddToWatchlist(selectedSymbol.symbol)}
      />
    </div>
  );
}