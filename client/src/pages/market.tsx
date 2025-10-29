import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PriceCard } from "@/components/price-card";
import { CatalystFeed } from "@/components/catalyst-feed";
import { SymbolSearch } from "@/components/symbol-search";
import { SymbolDetailModal } from "@/components/symbol-detail-modal";
import { MarketSessionBadge } from "@/components/market-session-badge";
import { WatchlistTable } from "@/components/watchlist-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MarketData, Catalyst, WatchlistItem } from "@shared/schema";
import { TrendingUp, DollarSign, Activity, RefreshCw, Clock, ArrowUp, ArrowDown, Star } from "lucide-react";
import { getMarketSession, formatCTTime, formatCurrency, formatPercent } from "@/lib/utils";

export default function MarketPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<MarketData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [nextRefresh, setNextRefresh] = useState<number>(60);
  const { toast } = useToast();
  
  const currentSession = getMarketSession();
  const currentTime = formatCTTime(new Date());

  const { data: marketData = [], isLoading: marketLoading } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
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

  // Auto-refresh countdown
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

  const handleSymbolSelect = (symbol: MarketData) => {
    setSelectedSymbol(symbol);
    setDetailModalOpen(true);
  };

  // Calculate market stats
  const gainers = [...marketData].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
  const losers = [...marketData].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);
  const avgChange = marketData.reduce((sum, d) => sum + d.changePercent, 0) / (marketData.length || 1);
  const totalVolume = marketData.reduce((sum, d) => sum + (d.volume || 0), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Market Overview</h1>
          <div className="flex items-center gap-3 mt-2">
            <MarketSessionBadge session={currentSession} data-testid="badge-market-session" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span data-testid="text-current-time">{currentTime} CT</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SymbolSearch />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshPricesMutation.mutate()}
            disabled={refreshPricesMutation.isPending}
            data-testid="button-refresh-prices"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshPricesMutation.isPending ? 'animate-spin' : ''}`} />
            {refreshPricesMutation.isPending ? 'Updating...' : `Refresh (${nextRefresh}s)`}
          </Button>
        </div>
      </div>

      {/* Market Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Tracked Assets</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-assets">{marketData.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Stocks, Options & Crypto
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Market Sentiment</CardTitle>
            <TrendingUp className={`h-4 w-4 ${avgChange >= 0 ? 'text-green-500' : 'text-red-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${avgChange >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-avg-change">
              {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Average Change
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-volume">
              {totalVolume >= 1e9 ? `${(totalVolume / 1e9).toFixed(1)}B` : `${(totalVolume / 1e6).toFixed(1)}M`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Combined Trading Volume
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Active Catalysts</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-catalyst-count">{catalysts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Market-Moving Events
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Movers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUp className="h-5 w-5 text-green-500" />
              Top Gainers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {marketLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {gainers.map((data, idx) => (
                  <div
                    key={data.symbol}
                    className="flex items-center justify-between p-3 rounded-lg hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => handleSymbolSelect(data)}
                    data-testid={`gainer-${idx}`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">{data.symbol}</Badge>
                      <span className="text-sm font-medium">{formatCurrency(data.currentPrice)}</span>
                    </div>
                    <span className="text-sm font-bold text-green-500">
                      {formatPercent(data.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDown className="h-5 w-5 text-red-500" />
              Top Losers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {marketLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {losers.map((data, idx) => (
                  <div
                    key={data.symbol}
                    className="flex items-center justify-between p-3 rounded-lg hover-elevate active-elevate-2 cursor-pointer"
                    onClick={() => handleSymbolSelect(data)}
                    data-testid={`loser-${idx}`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">{data.symbol}</Badge>
                      <span className="text-sm font-medium">{formatCurrency(data.currentPrice)}</span>
                    </div>
                    <span className="text-sm font-bold text-red-500">
                      {formatPercent(data.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* All Market Data */}
      <Card>
        <CardHeader>
          <CardTitle>Live Market Data</CardTitle>
        </CardHeader>
        <CardContent>
          {marketLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketData.map(data => (
                <PriceCard
                  key={data.symbol}
                  data={data}
                  onClick={() => handleSymbolSelect(data)}
                  data-testid={`price-card-${data.symbol}`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Catalyst Feed */}
      {catalystsLoading ? (
        <Card>
          <CardContent className="py-12">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : (
        <CatalystFeed catalysts={catalysts} />
      )}

      {/* Watchlist Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Watchlist ({watchlist.length} symbols)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {watchlistLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : watchlist.length === 0 ? (
            <div className="text-center py-12">
              <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Symbols Tracked</h3>
              <p className="text-muted-foreground">
                Use Symbol Search above to add symbols to your watchlist
              </p>
            </div>
          ) : (
            <WatchlistTable items={watchlist} />
          )}
        </CardContent>
      </Card>

      {/* Symbol Detail Modal */}
      <SymbolDetailModal
        symbol={selectedSymbol}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />
    </div>
  );
}
