import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, TrendingUp, TrendingDown, AlertTriangle, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { WatchlistItem, MarketData } from "@shared/schema";
import { Link } from "wouter";

interface WatchlistSpotlightProps {
  maxItems?: number;
}

export function WatchlistSpotlight({ maxItems = 5 }: WatchlistSpotlightProps) {
  const { data: watchlistItems = [] } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: marketData = [] } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 60000, // 60s refresh (shares cache with Trade Desk)
    staleTime: 30000,
  });

  const priceMap = marketData.reduce((acc, data) => {
    acc[data.symbol] = data;
    return acc;
  }, {} as Record<string, MarketData>);

  const displayItems = watchlistItems.slice(0, maxItems);

  if (watchlistItems.length === 0) {
    return (
      <Card className="border-dashed" data-testid="card-watchlist-spotlight-empty">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-amber-500" />
            Watch Out For These
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No symbols on your watchlist yet</p>
            <Link href="/market">
              <Button variant="outline" size="sm" className="mt-3 gap-1" data-testid="button-add-to-watchlist">
                <Plus className="h-3 w-3" />
                Add Symbols
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-watchlist-spotlight">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-amber-500" />
            Watch Out For These
          </CardTitle>
          <Link href="/market">
            <Button variant="ghost" size="sm" className="text-xs h-7" data-testid="link-view-all-watchlist">
              View All ({watchlistItems.length})
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {displayItems.map((item) => {
              const market = priceMap[item.symbol];
              const currentPrice = market?.currentPrice;
              const changePercent = market?.changePercent;
              const isUp = changePercent && changePercent > 0;
              const isDown = changePercent && changePercent < 0;
              
              const nearTarget = item.targetPrice && currentPrice && 
                Math.abs((currentPrice - item.targetPrice) / item.targetPrice) < 0.05;
              const nearEntry = item.entryAlertPrice && currentPrice &&
                Math.abs((currentPrice - item.entryAlertPrice) / item.entryAlertPrice) < 0.03;
              const nearStop = item.stopAlertPrice && currentPrice &&
                Math.abs((currentPrice - item.stopAlertPrice) / item.stopAlertPrice) < 0.03;

              return (
                <div 
                  key={item.id}
                  className="flex items-center justify-between p-2 rounded-md border bg-card/50 hover-elevate"
                  data-testid={`watchlist-spotlight-item-${item.symbol}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold font-mono text-sm" data-testid={`text-spotlight-symbol-${item.symbol}`}>
                          {item.symbol}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {item.assetType.toUpperCase()}
                        </Badge>
                        {nearEntry && (
                          <Badge variant="default" className="text-[10px] px-1 py-0 bg-green-600">
                            Near Entry
                          </Badge>
                        )}
                        {nearTarget && (
                          <Badge variant="default" className="text-[10px] px-1 py-0 bg-blue-600">
                            Near Target
                          </Badge>
                        )}
                        {nearStop && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">
                            Near Stop
                          </Badge>
                        )}
                      </div>
                      {item.notes && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                          {item.notes}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-right">
                    {currentPrice ? (
                      <div className="flex flex-col items-end">
                        <span className="font-mono text-sm font-medium">
                          {formatCurrency(currentPrice)}
                        </span>
                        {changePercent !== undefined && (
                          <span className={`text-[10px] flex items-center gap-0.5 ${isUp ? 'text-green-500' : isDown ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {isUp && <TrendingUp className="h-2.5 w-2.5" />}
                            {isDown && <TrendingDown className="h-2.5 w-2.5" />}
                            {changePercent > 0 ? '+' : ''}{changePercent.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        
        {watchlistItems.length > maxItems && (
          <div className="pt-2 text-center">
            <Link href="/market">
              <Button variant="ghost" size="sm" className="text-xs" data-testid="link-see-more-watchlist">
                +{watchlistItems.length - maxItems} more on watchlist
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
