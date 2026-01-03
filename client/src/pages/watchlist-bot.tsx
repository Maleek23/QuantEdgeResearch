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
  PiggyBank, ArrowUpRight, ArrowDownRight, LineChart, Download, FileText
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { BorderBeam } from "@/components/magicui/border-beam";
import type { WatchlistItem, PaperPosition, TradeIdea } from "@shared/schema";
import { generateDailyTradeAnalysisPDF } from "@/lib/pdf-export";
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

interface BotTradesData {
  positions: Array<{
    id: string;
    symbol: string;
    assetType: string;
    direction: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    status: string;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
    realizedPnL: number;
    realizedPnLPercent: number;
    exitReason?: string;
    optionType?: string;
    strikePrice?: number;
    expiryDate?: string;
    portfolioName: string;
    botType: string;
  }>;
  portfolios: Array<{
    id: string;
    name: string;
    cashBalance: number;
    openPositions: number;
    closedPositions: number;
    winRate: number;
    realizedPnL: number;
    botType: string;
  }>;
  summary: {
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    byAssetType: { options: number; crypto: number; futures: number; stock: number };
  };
}

export default function WatchlistBotPage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [newSymbol, setNewSymbol] = useState("");
  const [newAssetType, setNewAssetType] = useState<string>("stock");
  const [activeTab, setActiveTab] = useState("bot");
  const [tradesAssetFilter, setTradesAssetFilter] = useState("all");
  const [tradesStatusFilter, setTradesStatusFilter] = useState("all");

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

  const botTradesUrl = `/api/bot-trades?assetType=${tradesAssetFilter}&status=${tradesStatusFilter}`;
  const { data: botTradesData, isLoading: botTradesLoading, refetch: refetchBotTrades } = useQuery<BotTradesData>({
    queryKey: ['/api/bot-trades', tradesAssetFilter, tradesStatusFilter],
    queryFn: async () => {
      const response = await fetch(botTradesUrl);
      if (!response.ok) throw new Error("Failed to fetch bot trades");
      return response.json();
    },
    refetchInterval: 10000,
  });

  const { data: tradeIdeas = [] } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    enabled: !!user,
  });

  const dailyIdeas = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return tradeIdeas.filter(idea => 
      idea.createdAt && idea.createdAt.startsWith(today)
    ).sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
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
        <TabsList className="grid w-full max-w-3xl grid-cols-4">
          <TabsTrigger value="watchlist" className="gap-2" data-testid="tab-watchlist">
            <Eye className="h-4 w-4" />
            My Watchlist
          </TabsTrigger>
          <TabsTrigger value="bot" className="gap-2" data-testid="tab-bot">
            <Bot className="h-4 w-4 text-pink-400" />
            Auto-Lotto Bot
          </TabsTrigger>
          <TabsTrigger value="trades" className="gap-2" data-testid="tab-trades">
            <Wallet className="h-4 w-4 text-cyan-400" />
            Bot Trades
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

              {/* Daily Recommended Plays */}
              {dailyIdeas.length > 0 && (
                <Card className="glass-card border-cyan-500/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Zap className="h-5 w-5 text-cyan-400" />
                          Session Recommended Plays
                        </CardTitle>
                        <CardDescription>High-confidence ideas from the AI & Quant engines for the current session</CardDescription>
                      </div>
                      <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                        {dailyIdeas.length} Ideas
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {dailyIdeas.slice(0, 6).map((idea) => (
                        <div key={idea.id} className="p-4 rounded-lg border border-slate-700 bg-slate-900/50 hover-elevate">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex flex-col">
                              <span className="font-mono font-bold text-lg">{idea.symbol}</span>
                              {idea.optionType && (
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">
                                  {idea.optionType} ${idea.strikePrice}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col items-end">
                              <Badge className={cn(
                                idea.confidenceScore && idea.confidenceScore >= 80 ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                              )}>
                                {idea.confidenceScore}% Conf.
                              </Badge>
                              {idea.isLottoPlay && (
                                <span className="text-[10px] font-bold text-amber-500 mt-1 flex items-center gap-1 bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/20">
                                  <AlertTriangle className="h-2 w-2" />
                                  SPECULATIVE LOTTO
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                            <div className="text-muted-foreground">Entry: <span className="text-foreground font-mono">${idea.entryPrice}</span></div>
                            <div className="text-muted-foreground">Target: <span className="text-foreground font-mono">${idea.targetPrice}</span></div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 italic italic-mono">
                            {idea.catalyst}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

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
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-slate-700" 
                        onClick={() => {
                          if (dailyIdeas.length === 0) {
                            toast({ 
                              title: "No ideas found for today", 
                              description: "The analysis PDF requires active trade ideas from the current session.",
                              variant: "destructive"
                            });
                            return;
                          }
                          generateDailyTradeAnalysisPDF(dailyIdeas);
                          toast({ title: "Generating PDF analysis..." });
                        }}
                        data-testid="button-download-pdf"
                      >
                        <FileText className="h-4 w-4 mr-2 text-cyan-400" />
                        Daily Analysis PDF
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="border-slate-700" 
                        onClick={() => {
                          window.open('/api/audit/auto-lotto-bot?format=csv', '_blank');
                          toast({ title: "Downloading trade audit data..." });
                        }}
                        data-testid="button-download-trades"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export All
                      </Button>
                      <Button variant="outline" size="sm" className="border-slate-700" onClick={() => refetchBot()} data-testid="button-refresh-bot">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

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

        {/* Bot Trades Tab - All positions across all bots */}
        <TabsContent value="trades" className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-cyan-400" />
                    All Bot Trading Positions
                  </CardTitle>
                  <CardDescription>Live positions from Options, Crypto, and Futures bots</CardDescription>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={tradesAssetFilter} onValueChange={setTradesAssetFilter}>
                    <SelectTrigger className="w-32" data-testid="select-trades-asset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="options">Options</SelectItem>
                      <SelectItem value="crypto">Crypto</SelectItem>
                      <SelectItem value="futures">Futures</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={tradesStatusFilter} onValueChange={setTradesStatusFilter}>
                    <SelectTrigger className="w-28" data-testid="select-trades-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-slate-700"
                    onClick={() => refetchBotTrades()}
                    data-testid="button-refresh-bot-trades"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {botTradesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
                </div>
              ) : (
                <>
                  {/* Portfolio Summary Cards */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {botTradesData?.portfolios?.map((portfolio) => (
                      <Card key={portfolio.id} className={cn(
                        "hover-elevate border-l-4",
                        portfolio.botType === 'options' ? 'border-l-purple-500 bg-gradient-to-br from-purple-500/5 to-pink-500/5' :
                        portfolio.botType === 'crypto' ? 'border-l-amber-500 bg-gradient-to-br from-amber-500/5 to-orange-500/5' :
                        portfolio.botType === 'futures' ? 'border-l-cyan-500 bg-gradient-to-br from-cyan-500/5 to-blue-500/5' : ''
                      )}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-semibold">{portfolio.name}</span>
                            {portfolio.botType === 'options' && <Target className="h-4 w-4 text-purple-400" />}
                            {portfolio.botType === 'crypto' && <Bitcoin className="h-4 w-4 text-amber-400" />}
                            {portfolio.botType === 'futures' && <BarChart3 className="h-4 w-4 text-cyan-400" />}
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Cash:</span>
                              <span className="font-mono">${portfolio.cashBalance?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Open:</span>
                              <span className="font-mono">{portfolio.openPositions} positions</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Win Rate:</span>
                              <span className={cn("font-mono font-medium", portfolio.winRate >= 50 ? 'text-green-400' : 'text-red-400')}>
                                {portfolio.winRate}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Realized P&L:</span>
                              <span className={cn("font-mono font-medium", portfolio.realizedPnL >= 0 ? 'text-green-400' : 'text-red-400')}>
                                {portfolio.realizedPnL >= 0 ? '+' : ''}${portfolio.realizedPnL?.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Summary Bar */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground border-b border-slate-700/50 pb-3">
                    <span>Total: <strong className="text-foreground">{botTradesData?.summary?.totalPositions || 0}</strong></span>
                    <span>Open: <strong className="text-green-400">{botTradesData?.summary?.openPositions || 0}</strong></span>
                    <span>Closed: <strong className="text-foreground">{botTradesData?.summary?.closedPositions || 0}</strong></span>
                    <span className="ml-auto">
                      Options: {botTradesData?.summary?.byAssetType?.options || 0} |
                      Crypto: {botTradesData?.summary?.byAssetType?.crypto || 0} |
                      Futures: {botTradesData?.summary?.byAssetType?.futures || 0}
                    </span>
                  </div>

                  {/* Positions List */}
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {botTradesData?.positions?.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No positions found for the selected filters
                        </div>
                      ) : (
                        botTradesData?.positions?.map((position) => (
                          <div 
                            key={position.id} 
                            className={cn(
                              "flex items-center justify-between p-3 rounded-lg border",
                              position.status === 'open' ? 'bg-muted/30' : 'bg-muted/10'
                            )}
                            data-testid={`bot-position-${position.id}`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={cn("text-xs",
                                    position.assetType === 'option' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                                    position.assetType === 'crypto' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                    position.assetType === 'futures' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : ''
                                  )}>
                                    {position.assetType}
                                  </Badge>
                                  <span className="font-bold font-mono">{position.symbol}</span>
                                  {position.optionType && (
                                    <span className="text-xs text-muted-foreground">
                                      {position.strikePrice} {position.optionType?.toUpperCase()} {position.expiryDate}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <span className={position.direction === 'long' ? 'text-green-400' : 'text-red-400'}>
                                    {position.direction?.toUpperCase()}
                                  </span>
                                  <span>Qty: {position.quantity?.toFixed(2)}</span>
                                  <span>Entry: ${position.entryPrice?.toFixed(4)}</span>
                                  {position.currentPrice && <span>Current: ${position.currentPrice?.toFixed(4)}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                {position.status === 'open' ? (
                                  <div className={cn("flex items-center gap-1",
                                    (position.unrealizedPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                                  )}>
                                    {(position.unrealizedPnL || 0) >= 0 ? 
                                      <ArrowUpRight className="h-4 w-4" /> : 
                                      <ArrowDownRight className="h-4 w-4" />
                                    }
                                    <span className="font-medium font-mono">
                                      ${Math.abs(position.unrealizedPnL || 0).toFixed(2)}
                                    </span>
                                    <span className="text-xs">
                                      ({(position.unrealizedPnLPercent || 0).toFixed(1)}%)
                                    </span>
                                  </div>
                                ) : (
                                  <div className={cn("flex items-center gap-1",
                                    (position.realizedPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                                  )}>
                                    <DollarSign className="h-4 w-4" />
                                    <span className="font-medium font-mono">
                                      ${Math.abs(position.realizedPnL || 0).toFixed(2)}
                                    </span>
                                    <span className="text-xs">
                                      ({(position.realizedPnLPercent || 0).toFixed(1)}%)
                                    </span>
                                  </div>
                                )}
                                {position.exitReason && (
                                  <span className="text-xs text-muted-foreground">{position.exitReason}</span>
                                )}
                              </div>
                              <Badge variant={position.status === 'open' ? 'default' : 'secondary'}>
                                {position.status}
                              </Badge>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>
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
