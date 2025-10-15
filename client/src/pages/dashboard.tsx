import { useState } from "react";
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
import { getMarketSession, formatCTTime } from "@/lib/utils";
import type { MarketData, TradeIdea, Catalyst, WatchlistItem, ScreenerFilters as Filters } from "@shared/schema";
import { TrendingUp, DollarSign, Activity, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const [activeFilters, setActiveFilters] = useState<Filters>({});
  const currentSession = getMarketSession();
  const currentTime = formatCTTime(new Date());
  const { toast } = useToast();

  const { data: marketData = [], isLoading: marketLoading } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 30000,
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Opportunities</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-opportunities">
                {tradeIdeas.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Across stocks, options & crypto
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-symbols">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tracked Symbols</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-symbols">
                {marketData.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Real-time market data
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-catalysts">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Market Catalysts</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-stat-catalysts">
                {catalysts.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Events & news tracked
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <Tabs defaultValue="ideas" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="ideas" data-testid="tab-trade-ideas">Trade Ideas</TabsTrigger>
                <TabsTrigger value="screener" data-testid="tab-screener">Screener</TabsTrigger>
                <TabsTrigger value="calculator" data-testid="tab-calculator">Calculator</TabsTrigger>
              </TabsList>

              <TabsContent value="ideas" className="space-y-4 mt-6">
                {ideasLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-[400px] w-full" />
                    <Skeleton className="h-[400px] w-full" />
                  </div>
                ) : tradeIdeas.length > 0 ? (
                  tradeIdeas.map((idea) => (
                    <TradeIdeaCard key={idea.id} idea={idea} />
                  ))
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                      <p className="text-muted-foreground">No trade ideas available</p>
                      <p className="text-sm text-muted-foreground mt-1">Check back for opportunities</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="screener" className="mt-6">
                <div className="space-y-6">
                  <ScreenerFilters onFilterChange={setActiveFilters} />
                  
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Results ({filteredMarketData.length})
                    </h3>
                    {marketLoading ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Skeleton className="h-[200px]" />
                        <Skeleton className="h-[200px]" />
                        <Skeleton className="h-[200px]" />
                        <Skeleton className="h-[200px]" />
                      </div>
                    ) : filteredMarketData.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredMarketData.map((data) => (
                          <PriceCard key={data.id} data={data} />
                        ))}
                      </div>
                    ) : (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <Activity className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                          <p className="text-muted-foreground">No results match your filters</p>
                          <p className="text-sm text-muted-foreground mt-1">Try adjusting your criteria</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="calculator" className="mt-6">
                <RiskCalculator />
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <CatalystFeed catalysts={catalysts} />
            <WatchlistTable 
              items={watchlist} 
              onRemove={handleRemoveFromWatchlist}
              isRemoving={removeFromWatchlistMutation.isPending}
            />
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
    </div>
  );
}