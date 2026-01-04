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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatCTTime } from "@/lib/utils";
import { CryptoQuantAnalysis } from "./crypto-quant-analysis";
import type { WatchlistItem } from "@shared/schema";
import { Star, Trash2, Eye, BarChart2, ChevronDown, Bell, RefreshCw, TrendingUp } from "lucide-react";

// Tier badge styling with institutional color scheme
const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  S: { bg: "bg-purple-500/20 dark:bg-purple-500/30", text: "text-purple-600 dark:text-purple-400", label: "Elite" },
  A: { bg: "bg-emerald-500/20 dark:bg-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", label: "Strong" },
  B: { bg: "bg-cyan-500/20 dark:bg-cyan-500/30", text: "text-cyan-600 dark:text-cyan-400", label: "Solid" },
  C: { bg: "bg-amber-500/20 dark:bg-amber-500/30", text: "text-amber-600 dark:text-amber-400", label: "Neutral" },
  D: { bg: "bg-orange-500/20 dark:bg-orange-500/30", text: "text-orange-600 dark:text-orange-400", label: "Weak" },
  F: { bg: "bg-red-500/20 dark:bg-red-500/30", text: "text-red-600 dark:text-red-400", label: "Avoid" },
};

// Grade badge component with tooltip
function GradeBadge({ item }: { item: WatchlistItem }) {
  const tier = item.tier || 'C';
  const style = TIER_STYLES[tier] || TIER_STYLES.C;
  const score = item.gradeScore ?? 50;
  const gradeLetter = item.gradeLetter || 'C';
  const gradeInputs = item.gradeInputs as Record<string, number | string[]> | null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <Badge 
            className={`font-mono font-bold text-xs ${style.bg} ${style.text} border-0`}
            data-testid={`badge-grade-${item.symbol}`}
          >
            {tier}
          </Badge>
          <span className={`text-xs font-medium ${style.text}`}>
            {gradeLetter} ({score})
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        <div className="space-y-1 text-xs">
          <div className="font-semibold">Quantitative Grade: {gradeLetter} ({score}/100)</div>
          <div className="text-muted-foreground">Tier {tier}: {style.label}</div>
          {gradeInputs && (
            <div className="pt-1 border-t border-border/50 space-y-0.5">
              {typeof gradeInputs.rsi14 === 'number' && (
                <div>RSI(14): {gradeInputs.rsi14.toFixed(1)}</div>
              )}
              {typeof gradeInputs.rsi2 === 'number' && (
                <div>RSI(2): {gradeInputs.rsi2.toFixed(1)}</div>
              )}
              {typeof gradeInputs.momentum5d === 'number' && (
                <div>5D Momentum: {gradeInputs.momentum5d >= 0 ? '+' : ''}{gradeInputs.momentum5d.toFixed(2)}%</div>
              )}
              {typeof gradeInputs.adx === 'number' && (
                <div>ADX: {gradeInputs.adx.toFixed(1)}</div>
              )}
              {typeof gradeInputs.volumeRatio === 'number' && (
                <div>Vol Ratio: {gradeInputs.volumeRatio.toFixed(2)}x</div>
              )}
              {Array.isArray(gradeInputs.signals) && gradeInputs.signals.length > 0 && (
                <div className="pt-1 text-[10px] text-muted-foreground">
                  {gradeInputs.signals.slice(0, 3).join(', ')}
                </div>
              )}
            </div>
          )}
          {item.lastEvaluatedAt && (
            <div className="text-[10px] text-muted-foreground pt-1">
              Graded: {formatCTTime(item.lastEvaluatedAt)}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// Re-grade button component
function ReGradeButton({ itemId, symbol }: { itemId: string; symbol: string }) {
  const { toast } = useToast();
  
  const reGradeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/watchlist/${itemId}/grade`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({
        title: "Grade Updated",
        description: `${symbol} has been re-graded`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Grading Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => reGradeMutation.mutate()}
      disabled={reGradeMutation.isPending}
      data-testid={`button-regrade-${symbol}`}
    >
      <RefreshCw className={`h-3 w-3 ${reGradeMutation.isPending ? 'animate-spin' : ''}`} />
    </Button>
  );
}

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

// Sort items by tier priority (S > A > B > C > D > F) then by score
function sortByGrade(items: WatchlistItem[]): WatchlistItem[] {
  const tierOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
  return [...items].sort((a, b) => {
    const tierA = tierOrder[a.tier || 'C'] ?? 3;
    const tierB = tierOrder[b.tier || 'C'] ?? 3;
    if (tierA !== tierB) return tierA - tierB;
    // Within same tier, sort by score descending
    return (b.gradeScore ?? 50) - (a.gradeScore ?? 50);
  });
}

export function WatchlistTable({ items, onRemove, onView, isRemoving }: WatchlistTableProps) {
  const [expandedAnalysis, setExpandedAnalysis] = useState<string | null>(null);
  const [sortByGrades, setSortByGrades] = useState(true);

  const toggleAnalysis = (itemId: string) => {
    setExpandedAnalysis(expandedAnalysis === itemId ? null : itemId);
  };

  // Sort items by grade if enabled
  const displayItems = sortByGrades ? sortByGrade(items) : items;

  // Calculate tier summary
  const tierSummary = items.reduce((acc, item) => {
    const tier = item.tier || 'C';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card data-testid="card-watchlist">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            <CardTitle>Watchlist</CardTitle>
          </div>
          {items.length > 0 && (
            <Button
              variant={sortByGrades ? "default" : "outline"}
              size="sm"
              onClick={() => setSortByGrades(!sortByGrades)}
              className="gap-1"
              data-testid="button-toggle-sort"
            >
              <TrendingUp className="h-3 w-3" />
              <span className="hidden sm:inline">Sort by Grade</span>
            </Button>
          )}
        </div>
        <CardDescription>
          Track your selected symbols and price targets
        </CardDescription>
        {/* Tier summary badges */}
        {items.length > 0 && Object.keys(tierSummary).length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            {(['S', 'A', 'B', 'C', 'D', 'F'] as const).map(tier => {
              const count = tierSummary[tier];
              if (!count) return null;
              const style = TIER_STYLES[tier];
              return (
                <Badge 
                  key={tier} 
                  className={`text-xs ${style.bg} ${style.text} border-0`}
                  data-testid={`badge-tier-summary-${tier}`}
                >
                  {tier}: {count}
                </Badge>
              );
            })}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {displayItems.length > 0 ? (
            <div className="space-y-3">
              {displayItems.map((item) => (
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold font-mono" data-testid={`text-watchlist-symbol-${item.symbol}`}>
                            {item.symbol}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {item.assetType.toUpperCase()}
                          </Badge>
                          {/* Grade Badge with tooltip */}
                          <GradeBadge item={item} />
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
                        {/* Re-grade button */}
                        <ReGradeButton itemId={item.id} symbol={item.symbol} />
                        
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