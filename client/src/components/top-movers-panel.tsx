import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Zap } from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";
import { Link } from "wouter";

interface Mover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
}

interface MoversData {
  gainers: Mover[];
  losers: Mover[];
  active: Mover[];
}

export function TopMoversPanel() {
  const { data: moversData, isLoading } = useQuery<MoversData>({
    queryKey: ["/api/market-movers"],
    refetchInterval: 60000,
  });

  const gainers = moversData?.gainers?.slice(0, 5) || [];
  const losers = moversData?.losers?.slice(0, 5) || [];

  const renderMover = (mover: Mover, type: "gainer" | "loser") => (
    <Link key={mover.symbol} href={`/chart-analysis?symbol=${mover.symbol}`}>
      <div 
        className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
        data-testid={`mover-${mover.symbol}`}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
            type === "gainer" ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          )}>
            {mover.symbol.slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{mover.symbol}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[100px]">{mover.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-foreground">${safeToFixed(mover.price, 2)}</p>
          <div className={cn(
            "flex items-center gap-0.5 text-xs font-medium justify-end",
            type === "gainer" ? "text-green-500" : "text-red-500"
          )}>
            {type === "gainer" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span>{type === "gainer" ? "+" : ""}{safeToFixed(mover.changePercent, 2)}%</span>
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <Card className="h-full" data-testid="top-movers-panel">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Top Movers
        </CardTitle>
        <Link href="/market?tab=scanner">
          <span className="text-xs text-primary hover:underline cursor-pointer">View All</span>
        </Link>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="gainers" className="w-full">
          <TabsList className="w-full grid grid-cols-2 h-8 mb-3">
            <TabsTrigger value="gainers" className="text-xs gap-1" data-testid="tab-gainers">
              <TrendingUp className="h-3 w-3" />
              Gainers
            </TabsTrigger>
            <TabsTrigger value="losers" className="text-xs gap-1" data-testid="tab-losers">
              <TrendingDown className="h-3 w-3" />
              Losers
            </TabsTrigger>
          </TabsList>
          <TabsContent value="gainers" className="mt-0">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex justify-between">
                    <div className="h-8 w-8 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded w-16" />
                  </div>
                ))}
              </div>
            ) : gainers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No gainers data</p>
            ) : (
              <div className="space-y-1">
                {gainers.map((mover) => renderMover(mover, "gainer"))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="losers" className="mt-0">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex justify-between">
                    <div className="h-8 w-8 bg-muted rounded" />
                    <div className="h-4 bg-muted rounded w-16" />
                  </div>
                ))}
              </div>
            ) : losers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No losers data</p>
            ) : (
              <div className="space-y-1">
                {losers.map((mover) => renderMover(mover, "loser"))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
