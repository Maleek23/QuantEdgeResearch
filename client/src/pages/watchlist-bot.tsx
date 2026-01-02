import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  Bot, Eye, Plus, Trash2, TrendingUp, DollarSign, Target, 
  AlertTriangle, Activity, Zap, Clock, CheckCircle2, XCircle, 
  RefreshCw, Shield, Calendar, Bell, BellOff, LogIn, Radio, Atom, 
  Radiation, FlaskConical, Bitcoin, Search, BarChart3, Wallet, 
  PiggyBank, ArrowUpRight, ArrowDownRight, LineChart
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { BorderBeam } from "@/components/magicui/border-beam";
import type { WatchlistItem, PaperPosition, TradeIdea } from "@shared/schema";
import { SiDiscord } from "react-icons/si";

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

interface PortfolioStats {
  name: string;
  startingCapital?: number;
  cashBalance?: number;
  totalValue?: number;
  totalPnL?: number;
  openPositions?: number;
  closedPositions?: number;
  wins?: number;
  losses?: number;
  winRate?: string;
  createdAt?: string;
}

interface AutoLottoBotData {
  portfolio: PortfolioStats | null;
  futuresPortfolio?: PortfolioStats | null;
  positions: PaperPosition[];
  futuresPositions?: PaperPosition[];
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
  const [activeTab, setActiveTab] = useState("bot");

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

  // Fetch trade ideas to show recent wins (these are what Discord alerts show)
  const { data: tradeIdeas = [] } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    staleTime: 60000,
  });

  // Get recent winning trade ideas (last 7 days, hit_target)
  const recentWins = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    return tradeIdeas
      .filter(idea => 
        idea.outcomeStatus === 'hit_target' && 
        idea.exitDate && 
        new Date(idea.exitDate) >= sevenDaysAgo &&
        // Filter out invalid trades with broken percentGain (negative wins, extreme values)
        (idea.percentGain === null || idea.percentGain === undefined || 
          (idea.percentGain >= 0 && idea.percentGain <= 500))
      )
      .sort((a, b) => new Date(b.exitDate!).getTime() - new Date(a.exitDate!).getTime())
      .slice(0, 10);
  }, [tradeIdeas]);

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Trading Week: {weekRange}
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-cyan-400" />
            </div>
            Weekly Watchlist
          </h1>
        </div>
        <Button variant="outline" className="border-slate-700" onClick={() => refetchWatchlist()} data-testid="button-refresh-watchlist">
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
            <Bot className="h-4 w-4 text-pink-400" />
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
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-cyan-400" />
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
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950"
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
            <Card className="stat-glass hover-elevate">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-cyan-500/10">
                  <TrendingUp className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Stocks</p>
                  <p className="text-2xl font-bold font-mono tabular-nums">{stockItems.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-glass hover-elevate">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-amber-500/10">
                  <DollarSign className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Crypto</p>
                  <p className="text-2xl font-bold font-mono tabular-nums">{cryptoItems.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-glass hover-elevate">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-purple-500/10">
                  <Target className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Options</p>
                  <p className="text-2xl font-bold font-mono tabular-nums">{optionItems.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {watchlistLoading ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading watchlist...</p>
              </CardContent>
            </Card>
          ) : watchlistItems.length === 0 ? (
            <Card className="glass-card">
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
                <Card className="glass-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-cyan-400" />
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
                <Card className="glass-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-amber-400" />
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
                <Card className="glass-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5 text-purple-400" />
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

        {/* Auto-Lotto Bot Tab - Professional Broker Interface */}
        <TabsContent value="bot" className="space-y-6">
          {authLoading ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Checking authentication...</p>
              </CardContent>
            </Card>
          ) : !user ? (
            <Card className="glass-card border-amber-500/30">
              <CardContent className="p-8 text-center">
                <LogIn className="h-12 w-12 mx-auto text-amber-400 mb-4" />
                <h3 className="text-lg font-semibold">Login Required</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  You need to be logged in to view the Auto-Lotto Bot dashboard.
                </p>
                <Button className="mt-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950" onClick={() => window.location.href = '/login'} data-testid="button-login">
                  <LogIn className="h-4 w-4 mr-2" />
                  Login to View Bot
                </Button>
              </CardContent>
            </Card>
          ) : botLoading ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading bot data...</p>
              </CardContent>
            </Card>
          ) : botError ? (
            <Card className="glass-card border-red-500/30">
              <CardContent className="p-8 text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-red-400 mb-4" />
                <h3 className="text-lg font-semibold">Failed to Load Bot Data</h3>
                <p className="text-muted-foreground mt-2">
                  Please try refreshing the page or logging in again.
                </p>
                <Button variant="outline" className="mt-4 border-slate-700" onClick={() => refetchBot()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : !botData?.portfolio ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <Bot className="h-6 w-6 text-pink-400" />
                </div>
                <h3 className="text-lg font-semibold">Bot Not Yet Initialized</h3>
                <p className="text-muted-foreground mt-2">
                  The auto-lotto bot will start trading when market opens and lotto opportunities are found.
                </p>
              </CardContent>
            </Card>
          ) : (() => {
            const showMetrics = botData.isAdmin || botData.stats?.hasStatisticalValidity;
            const closedCount = botData.stats?.closedPositions || 0;
            const sampleSize = botData.stats?.sampleSize || 20;
            
            const openPositions = botData.positions.filter(p => p.status === 'open');
            const closedPositions = botData.positions.filter(p => p.status === 'closed');
            
            const totalRealizedPnL = botData.stats?.totalRealizedPnL || 0;
            const totalUnrealizedPnL = botData.stats?.totalUnrealizedPnL || 0;
            const startingCapital = botData.portfolio?.startingCapital || 300;
            const accountBalance = startingCapital + totalRealizedPnL;
            
            const openPositionsValue = openPositions.reduce((sum, p) => {
              const multiplier = p.assetType === 'option' ? 100 : (p.assetType === 'future' ? 1 : 1);
              return sum + (p.currentPrice || p.entryPrice) * p.quantity * multiplier;
            }, 0);
            const buyingPower = accountBalance - openPositionsValue;
            const totalEquity = accountBalance + totalUnrealizedPnL;
            
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todaysPnL = closedPositions
              .filter(p => p.exitTime && new Date(p.exitTime) >= todayStart)
              .reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
            
            return (
            <>
              {!showMetrics && (
                <Card className="glass-card border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                      <div>
                        <p className="font-medium text-amber-400">Building Statistical Evidence</p>
                        <p className="text-sm text-muted-foreground">
                          {botData.stats?.winRateNote || `Performance data available after ${sampleSize} trades (${closedCount}/${sampleSize})`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Wins from Trade Ideas (Discord Alerts Source) */}
              {recentWins.length > 0 && (
                <Card className="glass-card border-green-500/20 bg-green-500/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        </div>
                        Recent Wins
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                          Last 7 Days
                        </Badge>
                      </CardTitle>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <SiDiscord className="h-3 w-3" />
                        <span>From Trade Ideas</span>
                      </div>
                    </div>
                    <CardDescription>
                      These are the winning research ideas that triggered Discord alerts
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-2">
                        {recentWins.map((idea) => (
                          <div 
                            key={idea.id} 
                            className="flex items-center justify-between p-3 rounded-lg border bg-card/50 hover-elevate"
                            data-testid={`recent-win-${idea.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "p-2 rounded",
                                idea.assetType === 'option' ? "bg-purple-500/10" : 
                                idea.assetType === 'crypto' ? "bg-amber-500/10" : "bg-cyan-500/10"
                              )}>
                                {idea.assetType === 'option' ? (
                                  <Target className="h-4 w-4 text-purple-400" />
                                ) : idea.assetType === 'crypto' ? (
                                  <Bitcoin className="h-4 w-4 text-amber-400" />
                                ) : (
                                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold">{idea.symbol}</span>
                                  {idea.optionType && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                      {idea.optionType.toUpperCase()} ${idea.strikePrice}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {idea.source === 'ai' ? '🧠 AI' : idea.source === 'chart_analysis' ? '📈 Chart' : '📊 Quant'} • {idea.direction?.toUpperCase()}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-green-400">
                                +{(idea.percentGain || 25).toFixed(1)}%
                              </span>
                              <p className="text-[10px] text-muted-foreground">
                                {idea.exitDate && new Date(idea.exitDate).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Dual Portfolio Header - Options & Futures */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Options Portfolio */}
                <Card className="glass-card bg-gradient-to-br from-pink-500/5 to-purple-500/5 border-pink-500/20 relative overflow-hidden">
                  <BorderBeam size={250} duration={12} colorFrom="#ec4899" colorTo="#a855f7" />
                  <CardContent className="p-5 relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center border border-pink-500/30">
                        <Target className="h-5 w-5 text-pink-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Options Lotto</p>
                        <Badge variant="outline" className="text-xs bg-pink-500/10 text-pink-400 border-pink-500/30">
                          Paper
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Account Value</p>
                        {showMetrics ? (
                          <div className="text-2xl font-bold font-mono tabular-nums" data-testid="text-options-balance">
                            <NumberTicker 
                              value={accountBalance} 
                              prefix="$"
                              decimalPlaces={2}
                              className="text-foreground"
                            />
                          </div>
                        ) : (
                          <p className="text-xl text-muted-foreground">Hidden</p>
                        )}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Starting</span>
                        <span className="font-mono">{formatCurrency(botData.portfolio?.startingCapital || 300)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Realized P&L</span>
                        {showMetrics ? (
                          <span className={cn("font-mono font-medium", totalRealizedPnL >= 0 ? "text-green-400" : "text-red-400")}>
                            {totalRealizedPnL >= 0 ? '+' : ''}<NumberTicker value={Math.abs(totalRealizedPnL)} prefix="$" decimalPlaces={2} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Hidden</span>
                        )}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Positions</span>
                        <span className="font-mono">{openPositions.length} open / {closedPositions.length} closed</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Futures Portfolio */}
                <Card className="glass-card bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border-cyan-500/20 relative overflow-hidden">
                  <BorderBeam size={250} duration={12} delay={6} colorFrom="#22d3ee" colorTo="#3b82f6" />
                  <CardContent className="p-5 relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center border border-cyan-500/30">
                        <BarChart3 className="h-5 w-5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Futures Trading</p>
                        <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                          Paper
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Account Value</p>
                        {showMetrics ? (
                          <div className="text-2xl font-bold font-mono tabular-nums" data-testid="text-futures-balance">
                            <NumberTicker 
                              value={(botData.futuresPortfolio?.startingCapital || 300) + (botData.futuresPortfolio?.totalPnL || 0)} 
                              prefix="$"
                              decimalPlaces={2}
                              className="text-foreground"
                            />
                          </div>
                        ) : (
                          <p className="text-xl text-muted-foreground">Hidden</p>
                        )}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Starting</span>
                        <span className="font-mono">{formatCurrency(botData.futuresPortfolio?.startingCapital || 300)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Realized P&L</span>
                        {showMetrics ? (
                          <span className={cn("font-mono font-medium", (botData.futuresPortfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                            {(botData.futuresPortfolio?.totalPnL || 0) >= 0 ? '+' : ''}<NumberTicker value={Math.abs(botData.futuresPortfolio?.totalPnL || 0)} prefix="$" decimalPlaces={2} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Hidden</span>
                        )}
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Positions</span>
                        <span className="font-mono">{botData.futuresPortfolio?.openPositions || 0} open / {botData.futuresPortfolio?.closedPositions || 0} closed</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Combined Stats Bar */}
              <Card className="glass-card relative overflow-hidden">
                <BorderBeam size={300} duration={20} colorFrom="#22d3ee" colorTo="#a855f7" borderWidth={1} />
                <CardContent className="p-4 relative z-10">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Combined Value</p>
                        {showMetrics ? (
                          <div className="text-xl font-bold font-mono tabular-nums text-cyan-400" data-testid="text-combined-balance">
                            <NumberTicker 
                              value={accountBalance + ((botData.futuresPortfolio?.startingCapital || 300) + (botData.futuresPortfolio?.totalPnL || 0))} 
                              prefix="$"
                              decimalPlaces={2}
                              className="text-cyan-400"
                            />
                          </div>
                        ) : (
                          <p className="text-lg text-muted-foreground">Hidden</p>
                        )}
                      </div>
                      <div className="h-8 w-px bg-slate-700" />
                      <div className="text-center">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Day's P&L</p>
                        {showMetrics ? (
                          <div className={cn("text-xl font-bold font-mono tabular-nums", todaysPnL >= 0 ? "text-green-400" : "text-red-400")} data-testid="text-days-pnl">
                            {todaysPnL >= 0 ? '+' : ''}<NumberTicker value={Math.abs(todaysPnL)} prefix="$" decimalPlaces={2} />
                          </div>
                        ) : (
                          <p className="text-lg text-muted-foreground">Hidden</p>
                        )}
                      </div>
                      <div className="h-8 w-px bg-slate-700" />
                      <div className="text-center">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Trades</p>
                        <div className="text-xl font-bold font-mono tabular-nums">
                          <NumberTicker value={closedCount + (botData.futuresPortfolio?.closedPositions || 0)} />
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="border-slate-700" onClick={() => refetchBot()} data-testid="button-refresh-bot">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Account Summary Bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <LineChart className="h-5 w-5 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Equity</p>
                        {showMetrics ? (
                          <p className="text-lg font-bold font-mono tabular-nums" data-testid="text-total-equity">
                            {formatCurrency(totalEquity)}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">Hidden</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-500/10">
                        <Wallet className="h-5 w-5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cash Available</p>
                        {showMetrics ? (
                          <p className="text-lg font-bold font-mono tabular-nums" data-testid="text-cash-available">
                            {formatCurrency(buyingPower)}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">Hidden</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/10">
                        <Activity className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Open P&L</p>
                        {showMetrics ? (
                          <p className={cn(
                            "text-lg font-bold font-mono tabular-nums",
                            totalUnrealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                          )} data-testid="text-open-pnl">
                            {totalUnrealizedPnL >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnL)}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">Hidden</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <PiggyBank className="h-5 w-5 text-green-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Closed P&L</p>
                        {showMetrics ? (
                          <p className={cn(
                            "text-lg font-bold font-mono tabular-nums",
                            totalRealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                          )} data-testid="text-closed-pnl">
                            {totalRealizedPnL >= 0 ? '+' : ''}{formatCurrency(totalRealizedPnL)}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">Hidden</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Analysis by Asset Type */}
              {showMetrics && (
                <Card className="glass-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-4 w-4 text-cyan-400" />
                      Performance by Asset Type
                    </CardTitle>
                    <CardDescription>
                      Separate win rates and metrics for each trading strategy
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Options Performance */}
                      <div className="p-4 rounded-lg border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-pink-500/5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <Target className="h-4 w-4 text-purple-400" />
                          </div>
                          <span className="font-semibold">Options Lotto</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Win Rate</span>
                            <span className={cn(
                              "font-mono font-bold",
                              parseFloat(botData.stats?.winRate || '0') >= 50 ? "text-green-400" : "text-amber-400"
                            )}>
                              {botData.stats?.winRate || '0'}%
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Record</span>
                            <span className="font-mono">
                              <span className="text-green-400">{botData.stats?.wins || 0}W</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className="text-red-400">{botData.stats?.losses || 0}L</span>
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Total P&L</span>
                            <span className={cn(
                              "font-mono font-bold",
                              totalRealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                            )}>
                              {totalRealizedPnL >= 0 ? '+' : ''}{formatCurrency(totalRealizedPnL)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Avg Trade</span>
                            <span className="font-mono">
                              {closedCount > 0 
                                ? `${(totalRealizedPnL / closedCount) >= 0 ? '+' : ''}${formatCurrency(totalRealizedPnL / closedCount)}`
                                : '--'
                              }
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-purple-500/20">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Active 9:30 AM - 4:00 PM ET
                          </div>
                        </div>
                      </div>

                      {/* Futures Performance */}
                      <div className="p-4 rounded-lg border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-blue-500/5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-8 w-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                            <BarChart3 className="h-4 w-4 text-cyan-400" />
                          </div>
                          <span className="font-semibold">Futures Trading</span>
                          <Badge variant="outline" className="text-[9px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                            NQ / GC
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Win Rate</span>
                            <span className={cn(
                              "font-mono font-bold",
                              parseFloat(botData.futuresPortfolio?.winRate || '0') >= 50 ? "text-green-400" : "text-amber-400"
                            )}>
                              {botData.futuresPortfolio?.winRate || '0'}%
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Record</span>
                            <span className="font-mono">
                              <span className="text-green-400">{botData.futuresPortfolio?.wins || 0}W</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className="text-red-400">{botData.futuresPortfolio?.losses || 0}L</span>
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Total P&L</span>
                            <span className={cn(
                              "font-mono font-bold",
                              (botData.futuresPortfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400"
                            )}>
                              {(botData.futuresPortfolio?.totalPnL || 0) >= 0 ? '+' : ''}{formatCurrency(botData.futuresPortfolio?.totalPnL || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Avg Trade</span>
                            <span className="font-mono">
                              {(botData.futuresPortfolio?.closedPositions || 0) > 0 
                                ? `${((botData.futuresPortfolio?.totalPnL || 0) / (botData.futuresPortfolio?.closedPositions || 1)) >= 0 ? '+' : ''}${formatCurrency((botData.futuresPortfolio?.totalPnL || 0) / (botData.futuresPortfolio?.closedPositions || 1))}`
                                : '--'
                              }
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-cyan-500/20">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Active 24/7 (CME hours)
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bot Status Bar with Futures Indicator */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-pink-400" />
                  </div>
                  <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                    <Activity className="h-3 w-3 mr-1" />
                    Bot {botData.botStatus}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Checks every 5 min during market hours
                  </span>
                  <div className="h-4 w-px bg-slate-700" />
                  <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                    <Target className="h-3 w-3 mr-1" />
                    Options
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                    <BarChart3 className="h-3 w-3 mr-1" />
                    Futures
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">
                    {showMetrics ? `${botData.stats?.wins ?? 0}W / ${botData.stats?.losses ?? 0}L` : `${closedCount}/${sampleSize}`}
                  </span>
                  {showMetrics && botData.stats?.winRate !== null && (
                    <Badge className={cn(
                      "font-mono text-xs",
                      parseFloat(botData.stats?.winRate || '0') >= 50 
                        ? "bg-green-500/20 text-green-400" 
                        : "bg-red-500/20 text-red-400"
                    )}>
                      {botData.stats?.winRate}% Win
                    </Badge>
                  )}
                </div>
              </div>

              {/* Open Positions Table */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-pink-400" />
                        Open Positions
                        {openPositions.length > 0 && (
                          <Badge variant="outline" className="ml-2 font-mono text-xs">
                            {openPositions.length}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {botData.isAdmin 
                          ? "Active lotto trades currently held by the bot"
                          : "Position details are only visible to administrators"
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!botData.isAdmin ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                      <p>Individual trade details are restricted.</p>
                      <p className="text-xs mt-2">Aggregated performance stats are shown above.</p>
                    </div>
                  ) : openPositions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-2">
                        <Zap className="h-6 w-6 text-pink-400" />
                      </div>
                      <p>No open positions. Bot will enter trades when lotto opportunities arise.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-700">
                            <TableHead className="text-xs font-medium uppercase tracking-wider">Symbol</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider">Type</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Qty</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Avg Cost</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Current</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Market Value</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">P&L</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Return %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {openPositions.map((position) => {
                            const multiplier = position.assetType === 'option' ? 100 : (position.assetType === 'future' ? 50 : 1);
                            const marketValue = (position.currentPrice || position.entryPrice) * position.quantity * multiplier;
                            const costBasis = position.entryPrice * position.quantity * multiplier;
                            const pnl = position.unrealizedPnL || (marketValue - costBasis);
                            const returnPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                            
                            return (
                              <TableRow key={position.id} className="border-slate-700/50 hover-elevate" data-testid={`open-position-${position.id}`}>
                                <TableCell className="font-mono font-bold">{position.symbol}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn(
                                    "text-xs",
                                    position.assetType === 'future' 
                                      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                                      : position.optionType === 'call'
                                        ? "bg-green-500/10 text-green-400 border-green-500/30"
                                        : "bg-red-500/10 text-red-400 border-red-500/30"
                                  )}>
                                    {position.assetType === 'future' ? 'FUTURES' : position.optionType?.toUpperCase() || 'OPTION'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{position.quantity}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{formatCurrency(position.entryPrice)}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{formatCurrency(position.currentPrice || position.entryPrice)}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{formatCurrency(marketValue)}</TableCell>
                                <TableCell className={cn(
                                  "text-right font-mono tabular-nums font-semibold",
                                  pnl >= 0 ? "text-green-400" : "text-red-400"
                                )}>
                                  <div className="flex items-center justify-end gap-1">
                                    {pnl >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                    {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                                  </div>
                                </TableCell>
                                <TableCell className={cn(
                                  "text-right font-mono tabular-nums font-semibold",
                                  returnPct >= 0 ? "text-green-400" : "text-red-400"
                                )}>
                                  {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Trading History */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-purple-400" />
                        Trading History
                        {closedPositions.length > 0 && (
                          <Badge variant="outline" className="ml-2 font-mono text-xs">
                            {closedPositions.length}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>Closed trades with realized P&L</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!botData.isAdmin ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                      <p>Trade history is restricted to administrators.</p>
                    </div>
                  ) : closedPositions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No closed trades yet.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-700">
                            <TableHead className="text-xs font-medium uppercase tracking-wider">Symbol</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider">Type</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Entry</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Exit</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">P&L</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider">Date Closed</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-center">Result</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {closedPositions.slice(0, 10).map((position) => (
                            <TableRow 
                              key={position.id} 
                              className={cn(
                                "border-slate-700/50",
                                (position.realizedPnL || 0) >= 0 
                                  ? "bg-green-500/5" 
                                  : "bg-red-500/5"
                              )}
                              data-testid={`closed-position-${position.id}`}
                            >
                              <TableCell className="font-mono font-bold">{position.symbol}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn(
                                  "text-xs",
                                  position.assetType === 'future' 
                                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                                    : position.optionType === 'call'
                                      ? "bg-green-500/10 text-green-400 border-green-500/30"
                                      : "bg-red-500/10 text-red-400 border-red-500/30"
                                )}>
                                  {position.assetType === 'future' ? 'FUTURES' : position.optionType?.toUpperCase() || 'OPTION'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{formatCurrency(position.entryPrice)}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{formatCurrency(position.exitPrice || 0)}</TableCell>
                              <TableCell className={cn(
                                "text-right font-mono tabular-nums font-semibold",
                                (position.realizedPnL || 0) >= 0 ? "text-green-400" : "text-red-400"
                              )}>
                                {(position.realizedPnL || 0) >= 0 ? '+' : ''}{formatCurrency(position.realizedPnL || 0)}
                              </TableCell>
                              <TableCell className="font-mono text-sm text-muted-foreground">
                                {position.exitTime 
                                  ? new Date(position.exitTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : 'N/A'}
                              </TableCell>
                              <TableCell className="text-center">
                                {(position.realizedPnL || 0) >= 0 ? (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Won
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Lost
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {closedPositions.length > 10 && (
                        <div className="text-center py-3 text-sm text-muted-foreground border-t border-slate-700/50">
                          Showing 10 of {closedPositions.length} closed trades
                        </div>
                      )}
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
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Loading coverage data...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Scan Status Header */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={cn(
                      "p-3 rounded-lg",
                      coverageData?.scanStatus.isMarketOpen ? "bg-green-500/10" : "bg-amber-500/10"
                    )}>
                      {coverageData?.scanStatus.isMarketOpen ? (
                        <Radio className="h-6 w-6 text-green-400 animate-pulse" />
                      ) : (
                        <Clock className="h-6 w-6 text-amber-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                      <p className="font-semibold" data-testid="text-scan-status">
                        {coverageData?.scanStatus.isMarketOpen ? 'Scanning' : 'Market Closed'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-cyan-500/10">
                      <Search className="h-6 w-6 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Symbols</p>
                      <p className="text-2xl font-bold font-mono tabular-nums" data-testid="text-total-symbols">{coverageData?.totalSymbols || 0}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-purple-500/10">
                      <Clock className="h-6 w-6 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Last Scan</p>
                      <p className="font-semibold font-mono text-sm" data-testid="text-last-scan">
                        {coverageData?.scanStatus.lastScanTime 
                          ? new Date(coverageData.scanStatus.lastScanTime).toLocaleTimeString() 
                          : 'N/A'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/10">
                      <RefreshCw className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Scan Interval</p>
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
                      <Activity className="h-5 w-5 text-cyan-400" />
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
                            className="flex items-start gap-3 p-2 rounded-lg border bg-card/50 hover-elevate"
                            data-testid={`activity-item-${idx}`}
                          >
                            <div className={cn(
                              "p-1.5 rounded-md mt-0.5",
                              activity.type === 'scan' ? "bg-green-500/10" :
                              activity.type === 'check' ? "bg-cyan-500/10" : "bg-purple-500/10"
                            )}>
                              {activity.type === 'scan' ? (
                                <Radio className="h-3 w-3 text-green-400" />
                              ) : activity.type === 'check' ? (
                                <Search className="h-3 w-3 text-cyan-400" />
                              ) : (
                                <BarChart3 className="h-3 w-3 text-purple-400" />
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
                        <Target className="h-5 w-5 text-purple-400" />
                        Market Coverage
                      </CardTitle>
                      <CardDescription>All symbols scanned by the bot grouped by sector</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" className="border-slate-700" onClick={() => refetchCoverage()} data-testid="button-refresh-coverage">
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
                    <Zap className="h-5 w-5 text-amber-400" />
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
