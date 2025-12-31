import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  Bot, Eye, Plus, Trash2, TrendingUp, DollarSign, Target, 
  AlertTriangle, Activity, Zap, Clock, CheckCircle2, XCircle, 
  RefreshCw, Shield, Calendar, Bell, BellOff, LogIn, Radio, Atom, 
  Radiation, FlaskConical, Bitcoin, Search, BarChart3
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WatchlistItem, PaperPosition } from "@shared/schema";

interface SectorData {
  name: string;
  description: string;
  symbols: string[];
  status: 'scanning' | 'idle';
}

interface CoverageData {
  sectors: Record<string, SectorData>;
  totalSymbols: number;
  scanStatus: {
    isMarketOpen: boolean;
    lastScanTime: string | null;
    nextScanTime: string | null;
    scanInterval: string;
    status: 'active' | 'paused';
  };
  recentActivity: Array<{
    timestamp: string;
    type: 'scan' | 'check' | 'analysis';
    message: string;
    symbols: number;
  }>;
  recentOpportunities: Array<{
    symbol: string;
    type: string;
    score: number;
  }>;
}

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

function getWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${formatDate(monday)} - ${formatDate(friday)}`;
}

export default function WatchlistBotPage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [newSymbol, setNewSymbol] = useState("");
  const [newAssetType, setNewAssetType] = useState<string>("stock");
  const [activeTab, setActiveTab] = useState("watchlist");

  const { data: watchlistItems = [], isLoading: watchlistLoading, refetch: refetchWatchlist } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
  });

  const { data: botData, isLoading: botLoading, refetch: refetchBot, error: botError } = useQuery<AutoLottoBotData>({
    queryKey: ['/api/auto-lotto-bot'],
    enabled: !!user,
    refetchInterval: 60000,
    retry: false,
  });

  const { data: coverageData, isLoading: coverageLoading, refetch: refetchCoverage } = useQuery<CoverageData>({
    queryKey: ['/api/auto-lotto-bot/coverage'],
    refetchInterval: 30000,
  });

  const addWatchlistMutation = useMutation({
    mutationFn: async (data: { symbol: string; assetType: string }) => {
      return apiRequest('POST', '/api/watchlist', {
        ...data,
        addedAt: new Date().toISOString(),
      });
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

  const weekRange = useMemo(() => getWeekRange(), []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Calendar className="h-8 w-8 text-primary" />
            Weekly Watchlist
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Trading Week: {weekRange}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetchWatchlist()} data-testid="button-refresh-watchlist">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="watchlist" className="gap-2" data-testid="tab-watchlist">
            <Eye className="h-4 w-4" />
            My Watchlist
          </TabsTrigger>
          <TabsTrigger value="bot" className="gap-2" data-testid="tab-bot">
            <Bot className="h-4 w-4" />
            Auto-Lotto Bot
          </TabsTrigger>
          <TabsTrigger value="coverage" className="gap-2" data-testid="tab-coverage">
            <Radio className="h-4 w-4" />
            Activity & Coverage
          </TabsTrigger>
        </TabsList>

        {/* Weekly Watchlist Tab */}
        <TabsContent value="watchlist" className="space-y-6">
          {/* Quick Add */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add to Weekly Watchlist
              </CardTitle>
              <CardDescription>Track symbols you're watching this week for potential trades</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Input
                  placeholder="Symbol (e.g. AAPL, BTC, SPY)"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddToWatchlist()}
                  className="max-w-[200px]"
                  data-testid="input-symbol"
                />
                <Select value={newAssetType} onValueChange={setNewAssetType}>
                  <SelectTrigger className="w-[130px]" data-testid="select-asset-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock">Stock</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="option">Option Play</SelectItem>
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

          {/* Watchlist Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-cyan-500/10">
                  <TrendingUp className="h-6 w-6 text-cyan-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stockItems.length}</p>
                  <p className="text-sm text-muted-foreground">Stocks</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-amber-500/10">
                  <DollarSign className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{cryptoItems.length}</p>
                  <p className="text-sm text-muted-foreground">Crypto</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-purple-500/10">
                  <Target className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{optionItems.length}</p>
                  <p className="text-sm text-muted-foreground">Options</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {watchlistLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading watchlist...</p>
              </CardContent>
            </Card>
          ) : watchlistItems.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Start Your Weekly Watchlist</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Add symbols you want to track this week. Monitor price levels, set alerts, and plan your trades.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Stocks Section */}
              {stockItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-cyan-500" />
                      Stocks ({stockItems.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {stockItems.map((item) => (
                        <div 
                          key={item.id} 
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                          data-testid={`watchlist-item-${item.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded bg-cyan-500/10">
                              <TrendingUp className="h-4 w-4 text-cyan-500" />
                            </div>
                            <div>
                              <span className="font-mono font-bold">{item.symbol}</span>
                              {item.targetPrice && (
                                <p className="text-xs text-muted-foreground">
                                  Target: ${item.targetPrice}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.alertsEnabled ? (
                              <Bell className="h-4 w-4 text-green-500" />
                            ) : (
                              <BellOff className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeWatchlistMutation.mutate(item.id)}
                              data-testid={`button-remove-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Crypto Section */}
              {cryptoItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-amber-500" />
                      Crypto ({cryptoItems.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {cryptoItems.map((item) => (
                        <div 
                          key={item.id} 
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                          data-testid={`watchlist-item-${item.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded bg-amber-500/10">
                              <DollarSign className="h-4 w-4 text-amber-500" />
                            </div>
                            <div>
                              <span className="font-mono font-bold">{item.symbol}</span>
                              {item.targetPrice && (
                                <p className="text-xs text-muted-foreground">
                                  Target: ${item.targetPrice}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.alertsEnabled ? (
                              <Bell className="h-4 w-4 text-green-500" />
                            ) : (
                              <BellOff className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeWatchlistMutation.mutate(item.id)}
                              data-testid={`button-remove-${item.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Options Section */}
              {optionItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5 text-purple-500" />
                      Option Plays ({optionItems.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {optionItems.map((item) => (
                        <div 
                          key={item.id} 
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                          data-testid={`watchlist-item-${item.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded bg-purple-500/10">
                              <Target className="h-4 w-4 text-purple-500" />
                            </div>
                            <div>
                              <span className="font-mono font-bold">{item.symbol}</span>
                              {item.notes && (
                                <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          </div>
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
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Auto-Lotto Bot Tab */}
        <TabsContent value="bot" className="space-y-6">
          {authLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Checking authentication...</p>
              </CardContent>
            </Card>
          ) : !user ? (
            <Card className="border-amber-500/30">
              <CardContent className="p-8 text-center">
                <LogIn className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                <h3 className="text-lg font-semibold">Login Required</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  You need to be logged in to view the Auto-Lotto Bot dashboard.
                </p>
                <Button className="mt-4" onClick={() => window.location.href = '/login'} data-testid="button-login">
                  <LogIn className="h-4 w-4 mr-2" />
                  Login to View Bot
                </Button>
              </CardContent>
            </Card>
          ) : botLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading bot data...</p>
              </CardContent>
            </Card>
          ) : botError ? (
            <Card className="border-red-500/30">
              <CardContent className="p-8 text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-red-500 mb-4" />
                <h3 className="text-lg font-semibold">Failed to Load Bot Data</h3>
                <p className="text-muted-foreground mt-2">
                  Please try refreshing the page or logging in again.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => refetchBot()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
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
          ) : (() => {
            // Gating: Only show metrics if admin OR statistical validity reached
            const showMetrics = botData.isAdmin || botData.stats?.hasStatisticalValidity;
            const closedCount = botData.stats?.closedPositions || 0;
            const sampleSize = botData.stats?.sampleSize || 20;
            
            return (
            <>
              {/* Sample size gating banner for non-admin */}
              {!showMetrics && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                      <div>
                        <p className="font-medium text-amber-500">Building Statistical Evidence</p>
                        <p className="text-sm text-muted-foreground">
                          {botData.stats?.winRateNote || `Performance data available after ${sampleSize} trades (${closedCount}/${sampleSize})`}
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
                    {showMetrics && botData.portfolio.totalValue !== undefined ? (
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
                    {showMetrics && botData.portfolio.totalPnL !== undefined ? (
                      <div className={cn(
                        "text-sm font-semibold",
                        botData.portfolio.totalPnL >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {botData.portfolio.totalPnL >= 0 ? '+' : ''}{formatCurrency(botData.portfolio.totalPnL)} Total P&L
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">{closedCount}/{sampleSize} trades complete</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Win Rate</CardDescription>
                    {showMetrics && botData.stats?.winRate !== null ? (
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
                    {showMetrics ? (
                      <div className="text-sm text-muted-foreground">
                        {botData.stats?.wins ?? 0}W / {botData.stats?.losses ?? 0}L ({closedCount} total)
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {closedCount}/{sampleSize} trades
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Realized P&L</CardDescription>
                    {showMetrics && botData.stats?.totalRealizedPnL !== null ? (
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
                      From {closedCount} closed trades
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Open Positions</CardDescription>
                    {showMetrics && botData.stats?.openPositions !== null ? (
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
                    {showMetrics && botData.stats?.totalUnrealizedPnL !== null ? (
                      <div className={cn(
                        "text-sm font-semibold",
                        (botData.stats?.totalUnrealizedPnL || 0) >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {(botData.stats?.totalUnrealizedPnL || 0) >= 0 ? '+' : ''}{formatCurrency(botData.stats?.totalUnrealizedPnL || 0)} unrealized
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">{closedCount}/{sampleSize} trades</div>
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
          );
          })()}
        </TabsContent>

        {/* Activity & Coverage Tab */}
        <TabsContent value="coverage" className="space-y-6">
          {coverageLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading coverage data...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Scan Status Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="glass-card">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={cn(
                      "p-3 rounded-lg",
                      coverageData?.scanStatus.isMarketOpen ? "bg-green-500/10" : "bg-amber-500/10"
                    )}>
                      {coverageData?.scanStatus.isMarketOpen ? (
                        <Radio className="h-6 w-6 text-green-500 animate-pulse" />
                      ) : (
                        <Clock className="h-6 w-6 text-amber-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="font-semibold" data-testid="text-scan-status">
                        {coverageData?.scanStatus.isMarketOpen ? 'Scanning' : 'Market Closed'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-cyan-500/10">
                      <Search className="h-6 w-6 text-cyan-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Symbols</p>
                      <p className="font-semibold font-mono" data-testid="text-total-symbols">{coverageData?.totalSymbols || 0}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-purple-500/10">
                      <Clock className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Scan</p>
                      <p className="font-semibold text-sm" data-testid="text-last-scan">
                        {coverageData?.scanStatus.lastScanTime 
                          ? new Date(coverageData.scanStatus.lastScanTime).toLocaleTimeString() 
                          : 'N/A'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/10">
                      <RefreshCw className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Scan Interval</p>
                      <p className="font-semibold" data-testid="text-scan-interval">{coverageData?.scanStatus.scanInterval || '5 min'}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Activity Feed */}
                <Card className="glass-card lg:col-span-1">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="h-5 w-5 text-cyan-500" />
                      Activity Feed
                    </CardTitle>
                    <CardDescription>Real-time bot activity log</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-3">
                        {coverageData?.recentActivity.map((activity, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-start gap-3 p-2 rounded-lg border bg-card/50"
                            data-testid={`activity-item-${idx}`}
                          >
                            <div className={cn(
                              "p-1.5 rounded-md mt-0.5",
                              activity.type === 'scan' ? "bg-green-500/10" :
                              activity.type === 'check' ? "bg-cyan-500/10" : "bg-purple-500/10"
                            )}>
                              {activity.type === 'scan' ? (
                                <Radio className="h-3 w-3 text-green-500" />
                              ) : activity.type === 'check' ? (
                                <Search className="h-3 w-3 text-cyan-500" />
                              ) : (
                                <BarChart3 className="h-3 w-3 text-purple-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">{activity.message}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(activity.timestamp).toLocaleTimeString()}
                                {activity.symbols > 0 && ` • ${activity.symbols} symbols`}
                              </p>
                            </div>
                          </div>
                        ))}
                        {(!coverageData?.recentActivity || coverageData.recentActivity.length === 0) && (
                          <div className="text-center py-4 text-muted-foreground">
                            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No recent activity</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Market Coverage */}
                <Card className="glass-card lg:col-span-2">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="h-5 w-5 text-purple-500" />
                        Market Coverage
                      </CardTitle>
                      <CardDescription>All symbols scanned by the bot grouped by sector</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetchCoverage()} data-testid="button-refresh-coverage">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {coverageData?.sectors && Object.entries(coverageData.sectors).map(([key, sector]) => {
                        const sectorIcons: Record<string, JSX.Element> = {
                          coreHighVolatility: <TrendingUp className="h-4 w-4" />,
                          quantumComputing: <Atom className="h-4 w-4" />,
                          nuclearUranium: <Radiation className="h-4 w-4" />,
                          biotech: <FlaskConical className="h-4 w-4" />,
                          cryptoMeme: <Bitcoin className="h-4 w-4" />
                        };
                        const sectorColors: Record<string, string> = {
                          coreHighVolatility: 'cyan',
                          quantumComputing: 'purple',
                          nuclearUranium: 'amber',
                          biotech: 'green',
                          cryptoMeme: 'orange'
                        };
                        const color = sectorColors[key] || 'slate';
                        
                        return (
                          <div 
                            key={key} 
                            className="p-3 rounded-lg border bg-card/50"
                            data-testid={`sector-${key}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-md bg-${color}-500/10 text-${color}-500`}>
                                  {sectorIcons[key] || <Target className="h-4 w-4" />}
                                </div>
                                <div>
                                  <span className="font-medium">{sector.name}</span>
                                  <p className="text-xs text-muted-foreground">{sector.description}</p>
                                </div>
                              </div>
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-xs",
                                  sector.status === 'scanning' 
                                    ? "bg-green-500/10 text-green-500 border-green-500/30" 
                                    : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                                )}
                                data-testid={`badge-status-${key}`}
                              >
                                {sector.status === 'scanning' ? (
                                  <>
                                    <Radio className="h-2.5 w-2.5 mr-1 animate-pulse" />
                                    Scanning
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-2.5 w-2.5 mr-1" />
                                    Idle
                                  </>
                                )}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {sector.symbols.map(symbol => (
                                <Badge 
                                  key={symbol} 
                                  variant="secondary" 
                                  className="font-mono text-xs"
                                  data-testid={`symbol-${symbol}`}
                                >
                                  {symbol}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Opportunities */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    Recent Opportunities
                  </CardTitle>
                  <CardDescription>Lotto opportunities detected by the scanner</CardDescription>
                </CardHeader>
                <CardContent>
                  {coverageData?.recentOpportunities && coverageData.recentOpportunities.length > 0 ? (
                    <div className="space-y-2">
                      {coverageData.recentOpportunities.map((opp, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                          data-testid={`opportunity-${idx}`}
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono">{opp.symbol}</Badge>
                            <span className="text-sm text-muted-foreground">{opp.type}</span>
                          </div>
                          <Badge className={cn(
                            opp.score >= 80 ? "bg-green-500/20 text-green-500" :
                            opp.score >= 70 ? "bg-amber-500/20 text-amber-500" :
                            "bg-slate-500/20 text-slate-400"
                          )}>
                            Score: {opp.score}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No opportunities detected yet</p>
                      <p className="text-xs mt-1">The bot scans for lotto plays during market hours</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
