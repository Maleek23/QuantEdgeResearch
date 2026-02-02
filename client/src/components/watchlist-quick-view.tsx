import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, TrendingUp, TrendingDown, Star } from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";
import { Link } from "wouter";

interface WatchlistItem {
  id: number;
  symbol: string;
  addedAt: string;
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  grade?: string;
}

export function WatchlistQuickView() {
  const { data: watchlistData, isLoading } = useQuery<{ items: WatchlistItem[] }>({
    queryKey: ["/api/watchlist"],
    refetchInterval: 60000,
  });

  const items = watchlistData?.items?.slice(0, 6) || [];

  const getGradeColor = (grade?: string) => {
    switch (grade?.toUpperCase()) {
      case "S": return "text-purple-500 bg-purple-500/10";
      case "A": return "text-green-500 bg-green-500/10";
      case "B": return "text-blue-500 bg-blue-500/10";
      case "C": return "text-yellow-500 bg-yellow-500/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  return (
    <Card className="h-full" data-testid="watchlist-quick-view">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          My Watchlist
        </CardTitle>
        <Link href="/watchlist">
          <span className="text-xs text-primary hover:underline cursor-pointer">View All</span>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex justify-between">
                <div className="h-4 bg-muted rounded w-12" />
                <div className="h-4 bg-muted rounded w-16" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-6">
            <Star className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-2">No items in watchlist</p>
            <Link href="/market-scanner">
              <span className="text-xs text-primary hover:underline cursor-pointer">
                Discover stocks to watch
              </span>
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <Link key={item.id} href={`/chart-analysis?symbol=${item.symbol}`}>
                <div 
                  className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  data-testid={`watchlist-${item.symbol}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{item.symbol}</span>
                    {item.grade && (
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", getGradeColor(item.grade))}>
                        {item.grade}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.currentPrice && (
                      <span className="text-sm text-foreground">${safeToFixed(item.currentPrice, 2)}</span>
                    )}
                    {item.priceChangePercent !== undefined && (
                      <div className={cn(
                        "flex items-center gap-0.5 text-xs font-medium",
                        item.priceChangePercent >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {item.priceChangePercent >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span>{item.priceChangePercent >= 0 ? "+" : ""}{safeToFixed(item.priceChangePercent, 2)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
