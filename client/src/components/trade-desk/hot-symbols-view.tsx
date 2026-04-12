import { useQuery } from "@tanstack/react-query";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Eye, RefreshCw } from "lucide-react";

function HotCard({ item }: { item: any }) {
  return (
    <Link href={`/stock/${item.symbol}`}>
      <Card
        className={cn(
          "cursor-pointer transition-all duration-200 hover:-translate-y-0.5",
          item.isConverging
            ? "bg-orange-500/8 border-orange-500/25 hover:border-orange-400/50"
            : "bg-muted-foreground/8 border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
      >
        <CardContent className="p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono",
                  item.isConverging
                    ? "bg-orange-500/15 text-orange-400"
                    : "bg-muted-foreground/15 text-muted-foreground"
                )}
              >
                {item.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="text-xs font-bold text-foreground">
                  {item.symbol}
                </span>
                {item.isConverging && (
                  <Badge className="ml-1.5 text-[8px] px-1 py-0 bg-orange-500/20 text-orange-400">
                    CONVERGING
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <div
                className={cn(
                  "text-sm font-bold font-mono tabular-nums",
                  safeNumber(item.heatScore) >= 5
                    ? "text-[var(--trade-bearish)]"
                    : safeNumber(item.heatScore) >= 3
                      ? "text-orange-400"
                      : "text-muted-foreground"
                )}
              >
                {safeToFixed(item.heatScore, 1)}
              </div>
              <span className="text-[8px] text-muted-foreground">
                heat score
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-muted-foreground font-mono tabular-nums">
            <span>{item.distinctSources} sources</span>
            <span>{item.recentTouches1h} hits/hr</span>
            <span>{item.totalSignals} signals</span>
          </div>
          {/* Heat bar */}
          <div className="mt-1.5 h-0.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full",
                item.heatScore >= 5
                  ? "bg-gradient-to-r from-orange-500 to-red-500"
                  : item.heatScore >= 3
                    ? "bg-gradient-to-r from-amber-500 to-orange-500"
                    : "bg-muted-foreground"
              )}
              style={{
                width: `${Math.min(100, (item.heatScore || 0) * 10)}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function HotSymbolsView() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/convergence/hot-symbols", "subpage"],
    queryFn: async () => {
      const res = await fetch("/api/convergence/hot-symbols?limit=30");
      if (!res.ok) throw new Error("Failed to fetch hot symbols");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  const symbols = data?.symbols || [];
  const convergingSymbols = symbols.filter((s: any) => s.isConverging);
  const watchingSymbols = symbols.filter((s: any) => !s.isConverging);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40">
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Hot Attention</h2>
            <p className="text-[9px] text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
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
              Hot Attention
              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/40 text-[9px] px-1.5 py-0">
                HEAT MAP
              </Badge>
            </h2>
            <p className="text-[9px] text-muted-foreground">
              Symbols flagged by multiple scanners - watch for moves
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3 mr-1.5" /> Refresh
          </Button>
          <Badge variant="outline" className="text-[9px]">
            {data?.convergingCount || 0} Converging
          </Badge>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="bg-orange-500/8 border-orange-500/25 p-2.5">
          <div className="text-[9px] text-orange-400 mb-0.5">Converging</div>
          <div className="text-lg font-bold font-mono tabular-nums text-orange-300">
            {convergingSymbols.length}
          </div>
        </Card>
        <Card className="bg-muted-foreground/8 border-muted-foreground/25 p-2.5">
          <div className="text-[9px] text-muted-foreground mb-0.5">
            Watching
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-foreground/80">
            {watchingSymbols.length}
          </div>
        </Card>
        <Card className="bg-[var(--trade-bearish)]/8 border-[var(--trade-bearish)]/25 p-2.5">
          <div className="text-[9px] text-[var(--trade-bearish)] mb-0.5">
            Highest Heat
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-red-300">
            {safeToFixed(symbols[0]?.heatScore, 1, "0")}
          </div>
        </Card>
      </div>

      {/* Symbol cards */}
      {symbols.length === 0 ? (
        <div className="text-center py-12">
          <Flame className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-xs text-muted-foreground">
            Scanning for unusual activity... detected
          </p>
        </div>
      ) : (
        <>
          {convergingSymbols.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                Converging Signals ({convergingSymbols.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {convergingSymbols.map((item: any) => (
                  <HotCard key={item.symbol} item={item} />
                ))}
              </div>
            </div>
          )}

          {watchingSymbols.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                On Radar ({watchingSymbols.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {watchingSymbols.map((item: any) => (
                  <HotCard key={item.symbol} item={item} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
