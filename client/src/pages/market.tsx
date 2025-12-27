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
import { Skeleton } from "@/components/ui/skeleton";
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

  const gainers = [...marketData].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);
  const losers = [...marketData].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);
  const avgChange = marketData.reduce((sum, d) => sum + d.changePercent, 0) / (marketData.length || 1);
  const totalVolume = marketData.reduce((sum, d) => sum + (d.volume || 0), 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header - Glassmorphism */}
      <div className="relative overflow-hidden rounded-xl glass-card p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-page-title">Market Overview</h1>
            <div className="flex items-center gap-3 mt-2">
              <MarketSessionBadge session={currentSession} data-testid="badge-market-session" />
              <div className="flex items-center gap-2 glass rounded-lg px-3 py-1.5">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium" data-testid="text-current-time">{currentTime} CT</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SymbolSearch />
            <Button
              variant="glass"
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
      </div>

      {/* Market Summary Cards - Glassmorphism */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-5 border-l-2 border-l-cyan-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tracked Assets</p>
              <p className="text-3xl font-bold font-mono tracking-tight text-cyan-400" data-testid="text-total-assets">{marketData.length}</p>
            </div>
            <div className="h-10 w-10 rounded-lg glass flex items-center justify-center">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Stocks, Options & Crypto
          </p>
        </div>

        <div className={`glass-card rounded-xl p-5 ${avgChange >= 0 ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-red-500'}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Market Sentiment</p>
              <p className={`text-3xl font-bold font-mono tracking-tight ${avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="text-avg-change">
                {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
              </p>
            </div>
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${avgChange >= 0 ? 'glass-success' : 'glass-danger'}`}>
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Average Change
          </p>
        </div>

        <div className="glass-card rounded-xl p-5 border-l-2 border-l-amber-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Total Volume</p>
              <p className="text-3xl font-bold font-mono tracking-tight text-amber-400" data-testid="text-total-volume">
                {totalVolume >= 1e9 ? `${(totalVolume / 1e9).toFixed(1)}B` : `${(totalVolume / 1e6).toFixed(1)}M`}
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-amber-400" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Combined Trading Volume
          </p>
        </div>

        <div className="glass-card rounded-xl p-5 border-l-2 border-l-blue-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Active Catalysts</p>
              <p className="text-3xl font-bold font-mono tracking-tight text-blue-400" data-testid="text-catalyst-count">{catalysts.length}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
              <Activity className="h-5 w-5 text-blue-400" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Market-Moving Events
          </p>
        </div>
      </div>

      {/* Top Movers - Glassmorphism */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl border-l-2 border-l-green-500">
          <div className="p-5 pb-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <ArrowUp className="h-5 w-5 text-green-400" />
              Top Gainers
            </h3>
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
                    className="flex items-center justify-between p-3 rounded-lg glass hover:bg-white/5 cursor-pointer transition-all"
                    onClick={() => handleSymbolSelect(data)}
                    data-testid={`gainer-${idx}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs font-mono">{data.symbol}</span>
                      <span className="text-sm font-medium">{formatCurrency(data.currentPrice)}</span>
                    </div>
                    <span className="text-sm font-bold text-green-400">
                      {formatPercent(data.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="glass-card rounded-xl border-l-2 border-l-red-500">
          <div className="p-5 pb-3">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <ArrowDown className="h-5 w-5 text-red-400" />
              Top Losers
            </h3>
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
                    className="flex items-center justify-between p-3 rounded-lg glass hover:bg-white/5 cursor-pointer transition-all"
                    onClick={() => handleSymbolSelect(data)}
                    data-testid={`loser-${idx}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs font-mono">{data.symbol}</span>
                      <span className="text-sm font-medium">{formatCurrency(data.currentPrice)}</span>
                    </div>
                    <span className="text-sm font-bold text-red-400">
                      {formatPercent(data.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* All Market Data - Glassmorphism */}
      <div className="glass-card rounded-xl">
        <div className="p-5 pb-3">
          <h3 className="text-lg font-semibold text-cyan-400">Live Market Data</h3>
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
      </div>

      {/* Catalyst Feed */}
      {catalystsLoading ? (
        <div className="glass-card rounded-xl p-12">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <CatalystFeed catalysts={catalysts} />
      )}

      {/* Watchlist Section - Glassmorphism */}
      <div className="glass-card rounded-xl border-l-2 border-l-amber-500">
        <div className="p-5 pb-3">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Star className="h-5 w-5 text-amber-400" />
            <span>Watchlist</span>
            <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">{watchlist.length} symbols</span>
          </h3>
        </div>
        <div className="px-5 pb-5">
          {watchlistLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : watchlist.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-14 w-14 rounded-xl glass mx-auto mb-4 flex items-center justify-center">
                <Star className="h-7 w-7 text-muted-foreground" />
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
      </div>

      {/* Symbol Detail Modal */}
      <SymbolDetailModal
        symbol={selectedSymbol}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />
    </div>
  );
}
