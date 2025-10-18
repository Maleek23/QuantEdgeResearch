import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WatchlistTable } from "@/components/watchlist-table";
import { SymbolSearch } from "@/components/symbol-search";
import { SymbolDetailModal } from "@/components/symbol-detail-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { WatchlistItem, MarketData } from "@shared/schema";
import { Star, TrendingUp } from "lucide-react";

export default function WatchlistPage() {
  const [selectedSymbol, setSelectedSymbol] = useState<MarketData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    refetchOnWindowFocus: true,
  });

  const handleSymbolSelect = (symbol: MarketData) => {
    setSelectedSymbol(symbol);
    setDetailModalOpen(true);
  };

  // Watchlist only tracks symbols and targets - no P&L calculations
  const totalTargets = watchlist.reduce((sum, item) => {
    return sum + (item.targetPrice || 0);
  }, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Aurora Hero */}
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-gradient-premium" data-testid="text-page-title">
              <Star className="h-7 w-7 text-amber-500 neon-accent" />
              Watchlist
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your favorite symbols and positions
            </p>
          </div>

          <SymbolSearch />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      {/* Watchlist Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="gradient-border-card">
          <Card className="glass-card shadow-lg border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Symbols</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-symbols">
                {watchlist.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Tracked positions
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="gradient-border-card">
          <Card className="glass-card shadow-lg border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Combined Targets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-combined-targets">
                ${totalTargets.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total price targets
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="gradient-border-card">
          <Card className="glass-card shadow-lg border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Asset Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {Array.from(new Set(watchlist.map(w => w.assetType))).map(type => (
                  <Badge key={type} variant="outline" className="badge-shimmer">
                    {type.toUpperCase()}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {watchlist.filter(w => w.assetType === 'crypto').length} crypto, {watchlist.filter(w => w.assetType === 'stock').length} stocks
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Watchlist Table */}
      <div className="gradient-border-card spotlight">
        <Card className="glass-card shadow-lg border-0">
          <CardHeader className="bg-gradient-to-r from-card/80 to-primary/5 border-b border-border/50">
            <CardTitle>Tracked Positions</CardTitle>
          </CardHeader>
        <CardContent>
          {watchlistLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : watchlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Star className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No positions in watchlist</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Search for symbols and add them to your watchlist
              </p>
            </div>
          ) : (
            <WatchlistTable items={watchlist} />
          )}
        </CardContent>
        </Card>
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
