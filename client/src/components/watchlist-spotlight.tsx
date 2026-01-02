import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, TrendingUp, TrendingDown, AlertTriangle, Plus, BarChart3, Target, ShieldAlert, Clock, ExternalLink } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { WatchlistItem, MarketData, TradeIdea } from "@shared/schema";
import { Link } from "wouter";

interface WatchlistSpotlightProps {
  maxItems?: number;
}

export function WatchlistSpotlight({ maxItems = 5 }: WatchlistSpotlightProps) {
  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const { data: watchlistItems = [] } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: tradeIdeas = [] } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    staleTime: 30000,
  });

  const handleItemClick = (item: WatchlistItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const getRelatedIdea = (symbol: string): TradeIdea | undefined => {
    return tradeIdeas.find(idea => 
      idea.symbol === symbol && 
      idea.outcomeStatus === 'open'
    );
  };

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
                  role="button"
                  tabIndex={0}
                  className="flex items-center justify-between p-2 rounded-md border bg-card/50 hover-elevate cursor-pointer"
                  onClick={() => handleItemClick(item)}
                  onKeyDown={(e) => e.key === 'Enter' && handleItemClick(item)}
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
                          <Badge variant="default" className="text-[10px] px-1 py-0 bg-cyan-600">
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

      {/* Trade Idea Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono font-bold">{selectedItem?.symbol}</span>
              <Badge variant="outline" className="text-xs">
                {selectedItem?.assetType.toUpperCase()}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          {selectedItem && (() => {
            const market = priceMap[selectedItem.symbol];
            const relatedIdea = getRelatedIdea(selectedItem.symbol);
            const currentPrice = market?.currentPrice;
            const changePercent = market?.changePercent;
            
            return (
              <div className="space-y-4">
                {/* Current Price */}
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <span className="text-sm text-muted-foreground">Current Price</span>
                  <div className="text-right">
                    <span className="font-mono font-bold text-lg">
                      {currentPrice ? formatCurrency(currentPrice) : '--'}
                    </span>
                    {changePercent !== undefined && (
                      <span className={cn(
                        "ml-2 text-sm",
                        changePercent > 0 ? "text-green-500" : changePercent < 0 ? "text-red-500" : "text-muted-foreground"
                      )}>
                        {changePercent > 0 ? '+' : ''}{changePercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Price Alerts */}
                <div className="grid grid-cols-3 gap-2">
                  {selectedItem.entryAlertPrice && (
                    <div className="p-2 rounded border bg-green-500/10 border-green-500/30">
                      <div className="flex items-center gap-1 text-[10px] text-green-500 mb-1">
                        <Target className="h-3 w-3" />
                        Entry
                      </div>
                      <span className="font-mono text-sm font-medium">
                        {formatCurrency(selectedItem.entryAlertPrice)}
                      </span>
                    </div>
                  )}
                  {selectedItem.targetPrice && (
                    <div className="p-2 rounded border bg-cyan-500/10 border-cyan-500/30">
                      <div className="flex items-center gap-1 text-[10px] text-cyan-500 mb-1">
                        <TrendingUp className="h-3 w-3" />
                        Target
                      </div>
                      <span className="font-mono text-sm font-medium">
                        {formatCurrency(selectedItem.targetPrice)}
                      </span>
                    </div>
                  )}
                  {selectedItem.stopAlertPrice && (
                    <div className="p-2 rounded border bg-red-500/10 border-red-500/30">
                      <div className="flex items-center gap-1 text-[10px] text-red-500 mb-1">
                        <ShieldAlert className="h-3 w-3" />
                        Stop
                      </div>
                      <span className="font-mono text-sm font-medium">
                        {formatCurrency(selectedItem.stopAlertPrice)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedItem.notes && (
                  <div className="p-3 rounded-md bg-muted/30 border">
                    <p className="text-sm text-muted-foreground">{selectedItem.notes}</p>
                  </div>
                )}

                {/* Related Trade Idea */}
                {relatedIdea ? (
                  <div className="p-3 rounded-md border bg-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        Active Trade Idea
                      </span>
                      <Badge variant={relatedIdea.direction === 'long' ? 'default' : 'destructive'} className="text-xs">
                        {relatedIdea.direction?.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Entry</div>
                        <div className="font-mono text-sm">{formatCurrency(relatedIdea.entryPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Target</div>
                        <div className="font-mono text-sm text-green-500">{formatCurrency(relatedIdea.targetPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Stop</div>
                        <div className="font-mono text-sm text-red-500">{formatCurrency(relatedIdea.stopLoss)}</div>
                      </div>
                    </div>
                    <Link href={`/trade-ideas/${relatedIdea.id}/audit`}>
                      <Button variant="outline" size="sm" className="w-full gap-2">
                        <ExternalLink className="h-3 w-3" />
                        View Full Audit
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="p-3 rounded-md border border-dashed text-center">
                    <p className="text-sm text-muted-foreground mb-2">No active trade idea for this symbol</p>
                    <Link href={`/chart-analysis?symbol=${selectedItem.symbol}`}>
                      <Button variant="outline" size="sm" className="gap-2" data-testid="button-run-chart-analysis">
                        <BarChart3 className="h-3 w-3" />
                        Run Chart Analysis
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Added Date */}
                {selectedItem.addedAt && (
                  <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Added {new Date(selectedItem.addedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
