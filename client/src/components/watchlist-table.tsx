import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatCTTime } from "@/lib/utils";
import { CryptoQuantAnalysis } from "./crypto-quant-analysis";
import type { WatchlistItem } from "@shared/schema";
import { Star, Trash2, Eye, BarChart2, ChevronDown, Bell } from "lucide-react";

interface WatchlistTableProps {
  items: WatchlistItem[];
  onRemove?: (id: string) => void;
  onView?: (symbol: string) => void;
  isRemoving?: boolean;
}

// Alert edit dialog component
function EditAlertsDialog({ item }: { item: WatchlistItem }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [entryAlert, setEntryAlert] = useState(item.entryAlertPrice?.toString() || '');
  const [stopAlert, setStopAlert] = useState(item.stopAlertPrice?.toString() || '');
  const [targetAlert, setTargetAlert] = useState(item.targetAlertPrice?.toString() || '');
  const [alertsEnabled, setAlertsEnabled] = useState(item.alertsEnabled ?? false);
  const [discordEnabled, setDiscordEnabled] = useState(item.discordAlertsEnabled ?? true);

  const updateAlertsMutation = useMutation({
    mutationFn: async (data: Partial<WatchlistItem>) => {
      const response = await fetch(`/api/watchlist/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({
        title: "Alerts Updated",
        description: `Price alerts updated for ${item.symbol}`,
      });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateAlertsMutation.mutate({
      entryAlertPrice: entryAlert ? parseFloat(entryAlert) : null,
      stopAlertPrice: stopAlert ? parseFloat(stopAlert) : null,
      targetAlertPrice: targetAlert ? parseFloat(targetAlert) : null,
      alertsEnabled,
      discordAlertsEnabled: discordEnabled,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={item.alertsEnabled ? "default" : "outline"}
          size="sm"
          className="gap-1"
          data-testid={`button-edit-alerts-${item.symbol}`}
        >
          <Bell className="h-3 w-3" />
          <span className="hidden sm:inline">Alerts</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Price Alerts: {item.symbol}</DialogTitle>
          <DialogDescription>
            Set price targets to receive Discord notifications when price levels are reached
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Master toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="alerts-enabled" className="text-sm font-medium">
              Enable Alerts
            </Label>
            <Switch
              id="alerts-enabled"
              checked={alertsEnabled}
              onCheckedChange={setAlertsEnabled}
              data-testid="switch-alerts-enabled"
            />
          </div>

          {/* Discord toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="discord-enabled" className="text-sm font-medium">
              Discord Notifications
            </Label>
            <Switch
              id="discord-enabled"
              checked={discordEnabled}
              onCheckedChange={setDiscordEnabled}
              data-testid="switch-discord-enabled"
            />
          </div>

          {/* Entry Alert */}
          <div className="space-y-2">
            <Label htmlFor="entry-alert">Entry Alert Price (Buy Zone)</Label>
            <Input
              id="entry-alert"
              type="number"
              step="0.01"
              placeholder="e.g., 0.50"
              value={entryAlert}
              onChange={(e) => setEntryAlert(e.target.value)}
              data-testid="input-entry-alert"
            />
            <p className="text-xs text-muted-foreground">
              Get notified when price drops to this buying opportunity
            </p>
          </div>

          {/* Target Alert */}
          <div className="space-y-2">
            <Label htmlFor="target-alert">Target Alert Price (Profit Target)</Label>
            <Input
              id="target-alert"
              type="number"
              step="0.01"
              placeholder="e.g., 1.00"
              value={targetAlert}
              onChange={(e) => setTargetAlert(e.target.value)}
              data-testid="input-target-alert"
            />
            <p className="text-xs text-muted-foreground">
              Get notified when price reaches your profit target
            </p>
          </div>

          {/* Stop Alert */}
          <div className="space-y-2">
            <Label htmlFor="stop-alert">Stop Loss Alert Price</Label>
            <Input
              id="stop-alert"
              type="number"
              step="0.01"
              placeholder="e.g., 0.40"
              value={stopAlert}
              onChange={(e) => setStopAlert(e.target.value)}
              data-testid="input-stop-alert"
            />
            <p className="text-xs text-muted-foreground">
              Get notified when price hits your stop loss level
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateAlertsMutation.isPending}
              data-testid="button-save-alerts"
            >
              {updateAlertsMutation.isPending ? "Saving..." : "Save Alerts"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WatchlistTable({ items, onRemove, onView, isRemoving }: WatchlistTableProps) {
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);

  const toggleAnalysis = (itemId: string) => {
    setExpandedAnalysis(expandedAnalysis === itemId ? null : itemId);
  };
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
                <Collapsible 
                  key={item.id} 
                  open={expandedAnalysis === item.id}
                  onOpenChange={() => toggleAnalysis(item.id)}
                >
                  <div
                    className="rounded-lg border border-border overflow-visible hover-elevate transition-all"
                    data-testid={`watchlist-item-${item.symbol}`}
                  >
                    <div className="flex items-center justify-between p-3 group">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono" data-testid={`text-watchlist-symbol-${item.symbol}`}>
                            {item.symbol}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {item.assetType.toUpperCase()}
                          </Badge>
                          {item.assetType === 'crypto' && (
                            <Badge variant="secondary" className="text-xs">
                              Quant Analysis Available
                            </Badge>
                          )}
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

                      <div className="flex items-center gap-1">
                        {/* Edit Alerts Button - Always visible */}
                        <EditAlertsDialog item={item} />
                        
                        {item.assetType === 'crypto' && (
                          <CollapsibleTrigger asChild>
                            <Button
                              variant={expandedAnalysis === item.id ? "default" : "outline"}
                              size="sm"
                              className="gap-1"
                              data-testid={`button-analyze-${item.symbol}`}
                            >
                              <BarChart2 className="h-3 w-3" />
                              <span className="hidden sm:inline">Analyze</span>
                              <ChevronDown className={`h-3 w-3 transition-transform ${expandedAnalysis === item.id ? 'rotate-180' : ''}`} />
                            </Button>
                          </CollapsibleTrigger>
                        )}
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
                    </div>

                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-1 border-t border-border/50">
                        <CryptoQuantAnalysis symbol={item.symbol} />
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
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