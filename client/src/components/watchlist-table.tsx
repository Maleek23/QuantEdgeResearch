import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency, formatCTTime } from "@/lib/utils";
import type { WatchlistItem } from "@shared/schema";
import { Star, Trash2, Eye } from "lucide-react";

interface WatchlistTableProps {
  items: WatchlistItem[];
  onRemove?: (id: string) => void;
  onView?: (symbol: string) => void;
  isRemoving?: boolean;
}

export function WatchlistTable({ items, onRemove, onView, isRemoving }: WatchlistTableProps) {
  return (
    <Card data-testid="card-watchlist">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5" />
          <CardTitle>Watchlist</CardTitle>
        </div>
        <CardDescription>
          Track your selected symbols and price targets
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {items.length > 0 ? (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover-elevate transition-all group"
                  data-testid={`watchlist-item-${item.symbol}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono" data-testid={`text-watchlist-symbol-${item.symbol}`}>
                        {item.symbol}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {item.assetType.toUpperCase()}
                      </Badge>
                    </div>
                    {item.targetPrice && (
                      <div className="text-sm text-muted-foreground">
                        Target: <span className="font-mono font-medium">{formatCurrency(item.targetPrice)}</span>
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-xs text-muted-foreground truncate">
                        {item.notes}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground font-mono">
                      Added {formatCTTime(item.addedAt)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onView && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onView(item.symbol)}
                        data-testid={`button-view-${item.symbol}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {onRemove && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemove(item.id)}
                        disabled={isRemoving}
                        data-testid={`button-remove-${item.symbol}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No symbols in watchlist</p>
              <p className="text-sm mt-1">Add symbols to track them here</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}