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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <Star className="h-7 w-7 text-amber-500" />
            Watchlist
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your favorite symbols and positions
          </p>
        </div>

        <SymbolSearch />
      </div>

      {/* Watchlist Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
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

        <Card>
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Asset Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {Array.from(new Set(watchlist.map(w => w.assetType))).map(type => (
                <Badge key={type} variant="outline">
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

      {/* Watchlist Table */}
      <Card>
        <CardHeader>
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

      {/* Symbol Detail Modal */}
      <SymbolDetailModal
        symbol={selectedSymbol}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />
    </div>
  );
}
