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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MarketData, Catalyst, WatchlistItem } from "@shared/schema";
import { TrendingUp, DollarSign, Activity, RefreshCw, Clock, ArrowUp, ArrowDown, Star, BarChart3 } from "lucide-react";
import { getMarketSession, formatCTTime, formatCurrency, formatPercent } from "@/lib/utils";

export default function MarketPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<MarketData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [nextRefresh, setNextRefresh] = useState<number>(10);
  const { toast } = useToast();
  
  const currentSession = getMarketSession();
  const currentTime = formatCTTime(new Date());

  const { data: marketData = [], isLoading: marketLoading } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 10000, // 10s for real-time price updates
    staleTime: 5000,
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
      setNextRefresh(10);
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
          return 10;
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

  const gainers = [...marketData].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
  const losers = [...marketData].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);
  const avgChange = marketData.reduce((sum, d) => sum + d.changePercent, 0) / (marketData.length || 1);
  const totalVolume = marketData.reduce((sum, d) => sum + (d.volume || 0), 0);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Market Data</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" data-testid="text-page-title">Market Overview</h1>
          <div className="flex items-center gap-3 mt-3">
            <MarketSessionBadge session={currentSession} data-testid="badge-market-session" />
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-medium font-mono" data-testid="text-current-time">{currentTime} CT</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SymbolSearch />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshPricesMutation.mutate()}
            disabled={refreshPricesMutation.isPending}
            className="border-slate-700"
            data-testid="button-refresh-prices"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshPricesMutation.isPending ? 'animate-spin' : ''}`} />
            {refreshPricesMutation.isPending ? 'Updating...' : `Refresh (${nextRefresh}s)`}
          </Button>
        </div>
      </div>

      {/* Market Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tracked Assets</p>
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-cyan-400" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums" data-testid="text-total-assets">{marketData.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Stocks, Options & Crypto</p>
        </Card>

        <Card className="glass-card p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Market Sentiment</p>
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-cyan-400" />
            </div>
          </div>
          <p className={`text-2xl font-bold font-mono tabular-nums ${avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="text-avg-change">
            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
          </p>
          <p className="text-sm text-muted-foreground mt-1">Average Change</p>
        </Card>

        <Card className="glass-card p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Volume</p>
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums" data-testid="text-total-volume">
            {totalVolume >= 1e9 ? `${(totalVolume / 1e9).toFixed(1)}B` : `${(totalVolume / 1e6).toFixed(1)}M`}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Combined Trading Volume</p>
        </Card>

        <Card className="glass-card p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active Catalysts</p>
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-cyan-400" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums" data-testid="text-catalyst-count">{catalysts.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Market-Moving Events</p>
        </Card>
      </div>

      {/* Top Movers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card overflow-visible">
          <div className="p-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <ArrowUp className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Movers</p>
                <h3 className="text-lg font-semibold">Top Gainers</h3>
              </div>
            </div>
          </div>
          <div className="px-5 pb-5">
            {marketLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {gainers.map((data, idx) => (
                  <div
                    key={data.symbol}
                    className="flex items-center justify-between p-3 rounded-lg hover-elevate cursor-pointer transition-colors"
                    onClick={() => handleSymbolSelect(data)}
                    data-testid={`gainer-${idx}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-mono">{data.symbol}</span>
                      <span className="text-sm font-medium font-mono">{formatCurrency(data.currentPrice)}</span>
                    </div>
                    <span className="text-sm font-bold font-mono text-green-400">
                      {formatPercent(data.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="glass-card overflow-visible">
          <div className="p-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <ArrowDown className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Movers</p>
                <h3 className="text-lg font-semibold">Top Losers</h3>
              </div>
            </div>
          </div>
          <div className="px-5 pb-5">
            {marketLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {losers.map((data, idx) => (
                  <div
                    key={data.symbol}
                    className="flex items-center justify-between p-3 rounded-lg hover-elevate cursor-pointer transition-colors"
                    onClick={() => handleSymbolSelect(data)}
                    data-testid={`loser-${idx}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-mono">{data.symbol}</span>
                      <span className="text-sm font-medium font-mono">{formatCurrency(data.currentPrice)}</span>
                    </div>
                    <span className="text-sm font-bold font-mono text-red-400">
                      {formatPercent(data.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* All Market Data */}
      <Card className="glass-card">
        <div className="p-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Real-Time</p>
              <h3 className="text-lg font-semibold">Live Market Data</h3>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5">
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
        </div>
      </Card>

      {/* Catalyst Feed */}
      {catalystsLoading ? (
        <Card className="glass-card p-12">
          <Skeleton className="h-64 w-full" />
        </Card>
      ) : (
        <CatalystFeed catalysts={catalysts} />
      )}

      {/* Watchlist Section */}
      <Card className="glass-card overflow-visible">
        <div className="p-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Star className="h-4 w-4 text-amber-400" />
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Personal</p>
                <h3 className="text-lg font-semibold">Watchlist</h3>
              </div>
              <span className="text-muted-foreground text-sm font-mono">{watchlist.length} symbols</span>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5">
          {watchlistLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : watchlist.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-14 w-14 rounded-xl bg-amber-500/10 mx-auto mb-4 flex items-center justify-center">
                <Star className="h-7 w-7 text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Symbols Tracked</h3>
              <p className="text-muted-foreground text-sm">
                Use Symbol Search above to add symbols to your watchlist
              </p>
            </div>
          ) : (
            <WatchlistTable items={watchlist} />
          )}
        </div>
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
