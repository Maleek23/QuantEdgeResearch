import { useQuery } from "@tanstack/react-query";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Flame,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";

function MoverCard({ stock, isGainer }: { stock: any; isGainer: boolean }) {
  return (
    <Link href={`/stock/${stock.symbol}`}>
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 hover:-translate-y-0.5",
          isGainer
            ? "bg-[var(--trade-bullish)]/8 border-[var(--trade-bullish)]/25 hover:border-[var(--trade-bullish)]/50"
            : "bg-[var(--trade-bearish)]/8 border-[var(--trade-bearish)]/25 hover:border-[var(--trade-bearish)]/50",
          stock.hasCatalyst && "ring-1 ring-purple-500/40"
        )}
      >
        <CardContent className="p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono relative",
                  isGainer
                    ? "bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)]"
                    : "bg-[var(--trade-bearish)]/15 text-[var(--trade-bearish)]"
                )}
              >
                {stock.symbol.slice(0, 2)}
                {stock.hasCatalyst && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-purple-500 flex items-center justify-center text-[7px]">
                    {stock.catalyst?.icon || "!"}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-foreground">
                    {stock.symbol}
                  </span>
                  {stock.hasCatalyst && stock.catalyst && (
                    <Badge className="text-[8px] px-1 py-0 bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {stock.catalyst.icon}
                    </Badge>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground truncate max-w-[90px]">
                  {stock.hasCatalyst && stock.catalyst?.title
                    ? stock.catalyst.title
                    : stock.name || "Stock"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "text-sm font-bold font-mono tabular-nums",
                  isGainer
                    ? "text-[var(--trade-bullish)]"
                    : "text-[var(--trade-bearish)]"
                )}
              >
                {isGainer ? "+" : ""}
                {safeToFixed(stock.changePercent, 1)}%
              </div>
              <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
                ${safeToFixed(stock.price, 2)}
              </div>
            </div>
          </div>
          {stock.volume && (
            <div className="mt-1.5 pt-1.5 border-t border-border/20">
              <span className="text-[9px] text-muted-foreground font-mono tabular-nums">
                Vol: {safeToFixed(safeNumber(stock.volume) / 1000000, 1)}M
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function MoversView() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/market-movers", "subpage"],
    queryFn: async () => {
      const res = await fetch("/api/market-movers");
      if (!res.ok) return { topGainers: [], topLosers: [] };
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 60000,
  });

  const gainers = data?.topGainers || [];
  const losers = data?.topLosers || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40">
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Market Movers</h2>
            <p className="text-[9px] text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40">
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              Market Movers
              <Badge className="bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/40 text-[9px] px-1.5 py-0">
                LIVE
              </Badge>
            </h2>
            <p className="text-[9px] text-muted-foreground">
              Today's biggest gainers and losers
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
          <RefreshCw className="w-3 h-3 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Gainers */}
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[var(--trade-bullish)]" />
          Top Gainers ({gainers.length})
        </h3>
        {gainers.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            Loading market data...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {gainers.slice(0, 12).map((stock: any) => (
              <MoverCard key={stock.symbol} stock={stock} isGainer={true} />
            ))}
          </div>
        )}
      </div>

      {/* Losers */}
      <div>
        <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5 text-[var(--trade-bearish)]" />
          Top Losers ({losers.length})
        </h3>
        {losers.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            Loading market data...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {losers.slice(0, 12).map((stock: any) => (
              <MoverCard key={stock.symbol} stock={stock} isGainer={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
