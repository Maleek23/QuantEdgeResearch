import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Bot, Eye, Plus, Trash2, TrendingUp, TrendingDown, 
  DollarSign, Target, AlertTriangle, Activity, Zap,
  Clock, CheckCircle2, XCircle, RefreshCw, Shield
} from "lucide-react";
import type { WatchlistItem, PaperPosition, PaperPortfolio } from "@shared/schema";

interface AutoLottoBotData {
  portfolio: {
    name: string;
    totalValue?: number;
    totalPnL?: number;
    createdAt: string;
  } | null;
  positions: PaperPosition[];
  stats: {
    openPositions: number | null;
    closedPositions: number;
    wins: number | null;
    losses: number | null;
    winRate: string | null;
    winRateNote: string | null;
    totalRealizedPnL: number | null;
    totalUnrealizedPnL: number | null;
    sampleSize: number;
    hasStatisticalValidity: boolean;
  } | null;
  botStatus: string;
  message?: string;
  isAdmin?: boolean;
}

export default function WatchlistBotPage() {
  const { toast } = useToast();
  const [newSymbol, setNewSymbol] = useState("");
  const [newAssetType, setNewAssetType] = useState<string>("stock");
  const [activeTab, setActiveTab] = useState("bot");

  const { data: watchlistItems = [], isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
  });

  const { data: botData, isLoading: botLoading, refetch: refetchBot } = useQuery<AutoLottoBotData>({
    queryKey: ['/api/auto-lotto-bot'],
    refetchInterval: 60000,
  });

  const addWatchlistMutation = useMutation({
    mutationFn: async (data: { symbol: string; assetType: string }) => {
      return apiRequest('POST', '/api/watchlist', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      setNewSymbol("");
      toast({ title: "Added to watchlist" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    },
  });

  const removeWatchlistMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Removed from watchlist" });
    },
  });

  const handleAddToWatchlist = () => {
    if (!newSymbol.trim()) return;
    addWatchlistMutation.mutate({ symbol: newSymbol.toUpperCase(), assetType: newAssetType });
  };

  const stockItems = watchlistItems.filter(i => i.assetType === 'stock');
  const cryptoItems = watchlistItems.filter(i => i.assetType === 'crypto');
  const optionItems = watchlistItems.filter(i => i.assetType === 'option');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            Watchlist & Bot
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your weekly watchlist and monitor the auto-lotto bot
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="bot" className="gap-2" data-testid="tab-bot">
            <Zap className="h-4 w-4" />
            Auto-Lotto Bot
          </TabsTrigger>
          <TabsTrigger value="watchlist" className="gap-2" data-testid="tab-watchlist">
            <Eye className="h-4 w-4" />
            Watchlist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bot" className="space-y-6">
          {botLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading bot data...</p>
              </CardContent>
            </Card>
          ) : !botData?.portfolio ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Bot Not Yet Initialized</h3>
                <p className="text-muted-foreground mt-2">
                  The auto-lotto bot will start trading when market opens and lotto opportunities are found.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Sample size gating banner for non-admin */}
              {!botData.isAdmin && botData.stats?.winRateNote && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                      <div>
                        <p className="font-medium text-amber-500">Building Statistical Evidence</p>
                        <p className="text-sm text-muted-foreground">
                          {botData.stats.winRateNote}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Portfolio Value</CardDescription>
                    {botData.portfolio.totalValue !== undefined ? (
                      <CardTitle className="text-2xl font-mono" data-testid="text-portfolio-value">
                        {formatCurrency(botData.portfolio.totalValue)}
                      </CardTitle>
                    ) : (
                      <CardTitle className="text-lg text-muted-foreground" data-testid="text-portfolio-value">
                        Hidden
                      </CardTitle>
                    )}
                  </CardHeader>
                  <CardContent>
                    {botData.portfolio.totalPnL !== undefined ? (
                      <div className={cn(
                        "text-sm font-semibold",
                        botData.portfolio.totalPnL >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {botData.portfolio.totalPnL >= 0 ? '+' : ''}{formatCurrency(botData.portfolio.totalPnL)} Total P&L
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Pending sample size</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Win Rate</CardDescription>
                    {botData.stats?.winRate !== null ? (
                      <CardTitle className="text-2xl font-mono" data-testid="text-win-rate">
                        {botData.stats?.winRate}%
                      </CardTitle>
                    ) : (
                      <CardTitle className="text-lg text-muted-foreground" data-testid="text-win-rate">
                        Pending
                      </CardTitle>
                    )}
                  </CardHeader>
                  <CardContent>
                    {botData.stats?.hasStatisticalValidity ? (
                      <div className="text-sm text-muted-foreground">
                        {botData.stats?.wins ?? 0}W / {botData.stats?.losses ?? 0}L ({botData.stats?.closedPositions || 0} total)
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {botData.stats?.closedPositions || 0} trades so far
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Realized P&L</CardDescription>
                    {botData.stats?.totalRealizedPnL !== null ? (
                      <CardTitle className={cn(
                        "text-2xl font-mono",
                        (botData.stats?.totalRealizedPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
                      )} data-testid="text-realized-pnl">
                        {(botData.stats?.totalRealizedPnL || 0) >= 0 ? '+' : ''}{formatCurrency(botData.stats?.totalRealizedPnL || 0)}
                      </CardTitle>
                    ) : (
                      <CardTitle className="text-lg text-muted-foreground" data-testid="text-realized-pnl">
                        Hidden
                      </CardTitle>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      From {botData.stats?.closedPositions || 0} closed trades
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Open Positions</CardDescription>
                    {botData.stats?.openPositions !== null ? (
                      <CardTitle className="text-2xl font-mono" data-testid="text-open-positions">
                        {botData.stats?.openPositions || 0}
                      </CardTitle>
                    ) : (
                      <CardTitle className="text-lg text-muted-foreground" data-testid="text-open-positions">
                        Hidden
                      </CardTitle>
                    )}
                  </CardHeader>
                  <CardContent>
                    {botData.stats?.totalUnrealizedPnL !== null ? (
                      <div className={cn(
                        "text-sm font-semibold",
                        (botData.stats?.totalUnrealizedPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {(botData.stats?.totalUnrealizedPnL || 0) >= 0 ? '+' : ''}{formatCurrency(botData.stats?.totalUnrealizedPnL || 0)} unrealized
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Pending sample size</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/50">
                    <Activity className="h-3 w-3 mr-1" />
                    Bot {botData.botStatus}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Checks every 5 min during market hours
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchBot()} data-testid="button-refresh-bot">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Positions</CardTitle>
                  <CardDescription>
                    {botData.isAdmin 
                      ? "Latest lotto trades executed by the bot"
                      : "Position details are only visible to administrators"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!botData.isAdmin ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Individual trade details are restricted.</p>
                      <p className="text-xs mt-2">Aggregated performance stats are shown above.</p>
                    </div>
                  ) : botData.positions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No positions yet. Bot will enter trades when lotto opportunities arise.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {botData.positions.map((position) => (
                        <div
                          key={position.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border",
                            position.status === 'open' 
                              ? "bg-card" 
                              : position.realizedPnL && position.realizedPnL > 0 
                                ? "bg-green-500/5 border-green-500/20"
                                : "bg-red-500/5 border-red-500/20"
                          )}
                          data-testid={`position-${position.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold">{position.symbol}</span>
                                <Badge variant="outline" className="text-xs">
                                  {position.optionType?.toUpperCase() || position.assetType}
                                </Badge>
                                {position.status === 'open' ? (
                                  <Badge variant="outline" className="bg-cyan-500/10 text-cyan-500">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Open
                                  </Badge>
                                ) : position.realizedPnL && position.realizedPnL > 0 ? (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-500">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Won
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-red-500/10 text-red-500">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Lost
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Entry: {formatCurrency(position.entryPrice)} • 
                                Target: {formatCurrency(position.targetPrice || 0)} • 
                                Stop: {formatCurrency(position.stopLoss || 0)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {position.status === 'open' ? (
                              <>
                                <div className="font-mono">
                                  {formatCurrency(position.currentPrice || position.entryPrice)}
                                </div>
                                <div className={cn(
                                  "text-sm font-semibold",
                                  (position.unrealizedPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
                                )}>
                                  {(position.unrealizedPnL || 0) >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnL || 0)}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="font-mono">
                                  {formatCurrency(position.exitPrice || 0)}
                                </div>
                                <div className={cn(
                                  "text-sm font-semibold",
                                  (position.realizedPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
                                )}>
                                  {(position.realizedPnL || 0) >= 0 ? '+' : ''}{formatCurrency(position.realizedPnL || 0)}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="watchlist" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add to Watchlist</CardTitle>
              <CardDescription>Track symbols for your weekly review</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="Symbol (e.g. AAPL)"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  className="max-w-[200px]"
                  data-testid="input-symbol"
                />
                <Select value={newAssetType} onValueChange={setNewAssetType}>
                  <SelectTrigger className="w-[150px]" data-testid="select-asset-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Stock</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="option">Option</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleAddToWatchlist}
                  disabled={!newSymbol.trim() || addWatchlistMutation.isPending}
                  data-testid="button-add-watchlist"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {watchlistLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
              </CardContent>
            </Card>
          ) : watchlistItems.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No items in watchlist</h3>
                <p className="text-muted-foreground mt-2">
                  Add symbols to track for your weekly trading review.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stockItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-cyan-500" />
                      Stocks ({stockItems.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {stockItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30" data-testid={`watchlist-item-${item.id}`}>
                        <span className="font-mono font-bold">{item.symbol}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeWatchlistMutation.mutate(item.id)}
                          data-testid={`button-remove-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {cryptoItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-amber-500" />
                      Crypto ({cryptoItems.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {cryptoItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30" data-testid={`watchlist-item-${item.id}`}>
                        <span className="font-mono font-bold">{item.symbol}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeWatchlistMutation.mutate(item.id)}
                          data-testid={`button-remove-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {optionItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5 text-purple-500" />
                      Options ({optionItems.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {optionItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30" data-testid={`watchlist-item-${item.id}`}>
                        <span className="font-mono font-bold">{item.symbol}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeWatchlistMutation.mutate(item.id)}
                          data-testid={`button-remove-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
