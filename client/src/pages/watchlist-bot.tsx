import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
  PiggyBank, ArrowUpRight, ArrowDownRight, LineChart, Download, FileText,
  Trophy, ShieldCheck, AlertCircle, Settings, Save, Sliders
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { BorderBeam } from "@/components/magicui/border-beam";
import type { WatchlistItem, PaperPosition, TradeIdea } from "@shared/schema";
import { generateDailyTradeAnalysisPDF } from "@/lib/pdf-export";
import { SiDiscord } from "react-icons/si";

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
  cryptoPortfolio?: PortfolioStats | null;
  positions: PaperPosition[];
  futuresPositions?: PaperPosition[];
  cryptoPositions?: PaperPosition[];
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

interface PropFirmData {
  status: 'active' | 'locked' | 'initializing';
  message?: string;
  portfolio: {
    balance: number;
    startingCapital: number;
    dailyPnL: number;
    totalPnL: number;
    drawdown: number;
    progressToTarget: number;
  } | null;
  rules: {
    dailyLossLimit: number;
    maxDrawdown: number;
    profitTarget: number;
    maxContracts: number;
  };
  stats: {
    daysTraded: number;
    tradesCount: number;
    winRate: string;
    isWithinRules: boolean;
    ruleViolations: string[];
  } | null;
  openPositions: Array<{
    symbol: string;
    direction: string;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    stopLoss: number;
    targetPrice: number;
  }>;
  recentTrades: Array<{
    symbol: string;
    direction: string;
    entryPrice: number;
    exitPrice: number;
    realizedPnL: number;
    exitReason: string;
    timestamp: string;
  }>;
}

interface CryptoBotData {
  status: 'active' | 'inactive';
  portfolio: {
    id: string;
    cashBalance: number;
    totalValue: number;
    startingCapital: number;
  } | null;
  openPositions: number;
  maxPositions: number;
  coinsTracked: number;
  pricesAvailable: number;
  canTrade: boolean;
}

interface AutoLottoPreferences {
  userId: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  maxPositionSize: number;
  maxConcurrentTrades: number;
  dailyLossLimit: number | null;
  optionsAllocation: number;
  futuresAllocation: number;
  cryptoAllocation: number;
  enableOptions: boolean;
  enableFutures: boolean;
  enableCrypto: boolean;
  enablePropFirm: boolean;
  optionsPreferredDte: number;
  optionsMaxDte: number;
  optionsMinDelta: number;
  optionsMaxDelta: number;
  optionsPreferCalls: boolean;
  optionsPreferPuts: boolean;
  optionsPreferredSymbols: string[];
  futuresPreferredContracts: string[];
  futuresMaxContracts: number;
  futuresStopPoints: number;
  futuresTargetPoints: number;
  cryptoPreferredCoins: string[];
  cryptoEnableMemeCoins: boolean;
  cryptoMaxLeverageMultiplier: number;
  minConfidenceScore: number;
  preferredHoldingPeriod: 'day' | 'swing' | 'position';
  minRiskRewardRatio: number;
  useDynamicExits: boolean;
  tradePreMarket: boolean;
  tradeRegularHours: boolean;
  tradeAfterHours: boolean;
  preferredEntryWindows: string[];
  enableDiscordAlerts: boolean;
  enableEmailAlerts: boolean;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  alertOnDailyLimit: boolean;
  automationMode: 'paper_only' | 'live_with_confirmation' | 'fully_automated';
  requireConfirmation: boolean;
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
  const [portfolioTab, setPortfolioTab] = useState<"options" | "futures" | "crypto">("options");

  const { data: watchlistItems = [], isLoading: watchlistLoading, refetch: refetchWatchlist } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
  });

  const { data: botData, isLoading: botLoading, refetch: refetchBot, error: botError } = useQuery<AutoLottoBotData>({
    queryKey: ['/api/auto-lotto-bot'],
    enabled: !!user,
    refetchInterval: 15000, // Real-time updates every 15 seconds
    retry: false,
  });

  const { data: tradeIdeas = [] } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    enabled: !!user,
  });

  const { data: propFirmData, isLoading: propFirmLoading } = useQuery<PropFirmData>({
    queryKey: ['/api/prop-firm-mode'],
    enabled: !!user && activeTab === 'prop-firm',
    refetchInterval: 30000,
  });

  const { data: cryptoData } = useQuery<CryptoBotData>({
    queryKey: ['/api/crypto-bot/status'],
    enabled: !!user && activeTab === 'bot',
    refetchInterval: 15000,
  });

  // Real-time P&L updates - polls every 3 seconds for live price updates
  interface RealtimePnLData {
    positions: Array<{
      id: number;
      symbol: string;
      assetType: string;
      direction: string;
      quantity: number;
      entryPrice: number;
      currentPrice: number;
      unrealizedPnL: number;
      portfolioType: string;
    }>;
    totalUnrealizedPnL: number;
    timestamp: string;
  }
  
  const { data: realtimePnL } = useQuery<RealtimePnLData>({
    queryKey: ['/api/auto-lotto-bot/realtime-pnl'],
    enabled: !!user && activeTab === 'bot',
    refetchInterval: 3000, // Poll every 3 seconds for live P&L
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

  // Preferences query and state
  const { data: preferences, isLoading: preferencesLoading } = useQuery<AutoLottoPreferences>({
    queryKey: ['/api/auto-lotto-bot/preferences'],
    enabled: !!user && activeTab === 'preferences',
  });

  const [localPrefs, setLocalPrefs] = useState<Partial<AutoLottoPreferences>>({});
  
  // Sync local prefs when loaded from server
  useEffect(() => {
    if (preferences) {
      setLocalPrefs(preferences);
    }
  }, [preferences]);

  const updatePreferencesMutation = useMutation({
    mutationFn: async (prefs: Partial<AutoLottoPreferences>) => {
      return apiRequest('PUT', '/api/auto-lotto-bot/preferences', prefs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auto-lotto-bot/preferences'] });
      toast({ title: "Preferences saved", description: "Your trading preferences have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save preferences", description: error.message, variant: "destructive" });
    },
  });

  const handleSavePreferences = () => {
    updatePreferencesMutation.mutate(localPrefs);
  };

  const updateLocalPref = <K extends keyof AutoLottoPreferences>(key: K, value: AutoLottoPreferences[K]) => {
    // Guard against NaN for numeric values
    if (typeof value === 'number' && isNaN(value)) {
      return; // Don't update if NaN
    }
    setLocalPrefs(prev => ({ ...prev, [key]: value }));
  };
  
  const parseNumericInput = (value: string, fallback: number): number => {
    const parsed = Number(value);
    return isNaN(parsed) ? fallback : parsed;
  };

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
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="watchlist" className="gap-2" data-testid="tab-watchlist">
            <Eye className="h-4 w-4" />
            Watchlist
          </TabsTrigger>
          <TabsTrigger value="bot" className="gap-2" data-testid="tab-bot">
            <Bot className="h-4 w-4 text-pink-400" />
            Auto-Lotto
          </TabsTrigger>
          <TabsTrigger value="prop-firm" className="gap-2" data-testid="tab-prop-firm">
            <Trophy className="h-4 w-4 text-amber-400" />
            Prop Firm
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2" data-testid="tab-preferences">
            <Sliders className="h-4 w-4 text-cyan-400" />
            Strategy
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
            
            const allPositions = [
              ...botData.positions,
              ...(botData.futuresPositions || []),
              ...(botData.cryptoPositions || [])
            ];
            const openPositions = allPositions.filter(p => p.status === 'open');
            const closedPositions = allPositions.filter(p => p.status === 'closed');
            
            const totalRealizedPnL = botData.stats?.totalRealizedPnL || 0;
            // Use real-time P&L if available, otherwise fallback to bot data
            const totalUnrealizedPnL = realtimePnL?.totalUnrealizedPnL ?? botData.stats?.totalUnrealizedPnL ?? 0;
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
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
                    <Bitcoin className="h-3 w-3 mr-1" />
                    Crypto
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

              {/* Portfolio Tabs - Options, Futures, Crypto */}
              <Card className="glass-card">
                <Tabs value={portfolioTab} onValueChange={(v) => setPortfolioTab(v as "options" | "futures" | "crypto")} className="w-full">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <CardTitle className="flex items-center gap-2">
                          <Wallet className="h-5 w-5 text-cyan-400" />
                          Portfolio Dashboard
                        </CardTitle>
                        <TabsList className="bg-slate-800/50">
                          <TabsTrigger 
                            value="options" 
                            className="data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400"
                            data-testid="tab-options"
                          >
                            <Target className="h-4 w-4 mr-1.5" />
                            Options
                          </TabsTrigger>
                          <TabsTrigger 
                            value="futures"
                            className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
                            data-testid="tab-futures"
                          >
                            <BarChart3 className="h-4 w-4 mr-1.5" />
                            Futures
                          </TabsTrigger>
                          <TabsTrigger 
                            value="crypto"
                            className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400"
                            data-testid="tab-crypto"
                          >
                            <Bitcoin className="h-4 w-4 mr-1.5" />
                            Crypto
                          </TabsTrigger>
                        </TabsList>
                      </div>
                      <Badge variant="outline" className="text-xs bg-slate-500/10 text-slate-400 border-slate-500/30">
                        Paper Trading
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Options Tab */}
                    <TabsContent value="options" className="mt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-gradient-to-br from-pink-500/5 to-purple-500/5 border border-pink-500/20">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Account Value</p>
                          {showMetrics ? (
                            <div className="text-xl font-bold font-mono tabular-nums text-pink-400" data-testid="text-options-balance">
                              <NumberTicker value={accountBalance} prefix="$" decimalPlaces={2} className="text-pink-400" />
                            </div>
                          ) : (
                            <p className="text-lg text-muted-foreground">Hidden</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Starting Capital</p>
                          <p className="text-lg font-mono">{formatCurrency(botData.portfolio?.startingCapital || 300)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Realized P&L</p>
                          {showMetrics ? (
                            <p className={cn("text-lg font-bold font-mono", totalRealizedPnL >= 0 ? "text-green-400" : "text-red-400")}>
                              {totalRealizedPnL >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalRealizedPnL))}
                            </p>
                          ) : (
                            <p className="text-lg text-muted-foreground">Hidden</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Positions</p>
                          <p className="text-lg font-mono">
                            <span className="text-green-400">{openPositions.filter(p => p.assetType === 'option').length}</span>
                            <span className="text-muted-foreground"> open / </span>
                            <span>{closedPositions.filter(p => p.assetType === 'option').length}</span>
                            <span className="text-muted-foreground"> closed</span>
                          </p>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Futures Tab */}
                    <TabsContent value="futures" className="mt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border border-cyan-500/20">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Account Value</p>
                          {showMetrics ? (
                            <div className="text-xl font-bold font-mono tabular-nums text-cyan-400" data-testid="text-futures-balance">
                              <NumberTicker value={(botData.futuresPortfolio?.startingCapital || 300) + (botData.futuresPortfolio?.totalPnL || 0)} prefix="$" decimalPlaces={2} className="text-cyan-400" />
                            </div>
                          ) : (
                            <p className="text-lg text-muted-foreground">Hidden</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Starting Capital</p>
                          <p className="text-lg font-mono">{formatCurrency(botData.futuresPortfolio?.startingCapital || 300)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Realized P&L</p>
                          {showMetrics ? (
                            <p className={cn("text-lg font-bold font-mono", (botData.futuresPortfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                              {(botData.futuresPortfolio?.totalPnL || 0) >= 0 ? '+' : '-'}{formatCurrency(Math.abs(botData.futuresPortfolio?.totalPnL || 0))}
                            </p>
                          ) : (
                            <p className="text-lg text-muted-foreground">Hidden</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Positions</p>
                          <p className="text-lg font-mono">
                            <span className="text-green-400">{botData.futuresPortfolio?.openPositions || 0}</span>
                            <span className="text-muted-foreground"> open / </span>
                            <span>{botData.futuresPortfolio?.closedPositions || 0}</span>
                            <span className="text-muted-foreground"> closed</span>
                          </p>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Crypto Tab */}
                    <TabsContent value="crypto" className="mt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Account Value</p>
                          {showMetrics && cryptoData?.portfolio ? (
                            <div className="text-xl font-bold font-mono tabular-nums text-amber-400" data-testid="text-crypto-balance">
                              <NumberTicker value={cryptoData.portfolio.totalValue} prefix="$" decimalPlaces={2} className="text-amber-400" />
                            </div>
                          ) : (
                            <p className="text-lg text-muted-foreground">{cryptoData?.portfolio ? formatCurrency(cryptoData.portfolio.totalValue) : 'Loading...'}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Starting Capital</p>
                          <p className="text-lg font-mono">{formatCurrency(cryptoData?.portfolio?.startingCapital || 300)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Realized P&L</p>
                          {showMetrics && cryptoData?.portfolio ? (
                            <p className={cn("text-lg font-bold font-mono", (cryptoData.portfolio.totalValue - cryptoData.portfolio.startingCapital) >= 0 ? "text-green-400" : "text-red-400")}>
                              {(cryptoData.portfolio.totalValue - cryptoData.portfolio.startingCapital) >= 0 ? '+' : '-'}{formatCurrency(Math.abs(cryptoData.portfolio.totalValue - cryptoData.portfolio.startingCapital))}
                            </p>
                          ) : (
                            <p className="text-lg text-muted-foreground">--</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Positions</p>
                          <p className="text-lg font-mono">
                            <span className="text-green-400">{cryptoData?.openPositions || 0}</span>
                            <span className="text-muted-foreground"> open / </span>
                            <span>{cryptoData?.maxPositions || 3}</span>
                            <span className="text-muted-foreground"> max</span>
                          </p>
                        </div>
                      </div>
                    </TabsContent>
                  </CardContent>
                </Tabs>
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                      {/* Crypto Performance */}
                      <div className="p-4 rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                            <Bitcoin className="h-4 w-4 text-amber-400" />
                          </div>
                          <span className="font-semibold">Crypto Trading</span>
                          <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                            24/7
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Status</span>
                            <span className={cn(
                              "font-mono font-bold",
                              cryptoData?.status === 'active' ? "text-green-400" : "text-amber-400"
                            )}>
                              {cryptoData?.status === 'active' ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Positions</span>
                            <span className="font-mono">
                              <span className="text-amber-400">{cryptoData?.openPositions || 0}</span>
                              <span className="text-muted-foreground"> / </span>
                              <span className="text-muted-foreground">{cryptoData?.maxPositions || 3} max</span>
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Total P&L</span>
                            <span className={cn(
                              "font-mono font-bold",
                              ((cryptoData?.portfolio?.totalValue || 0) - (cryptoData?.portfolio?.startingCapital || 300)) >= 0 ? "text-green-400" : "text-red-400"
                            )}>
                              {((cryptoData?.portfolio?.totalValue || 0) - (cryptoData?.portfolio?.startingCapital || 300)) >= 0 ? '+' : ''}{formatCurrency((cryptoData?.portfolio?.totalValue || 0) - (cryptoData?.portfolio?.startingCapital || 300))}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Coins Tracked</span>
                            <span className="font-mono">
                              {cryptoData?.coinsTracked || 0}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-amber-500/20">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Active 24/7 (CoinGecko)
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Open Positions Table - Filtered by Portfolio Tab */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {portfolioTab === 'options' && <Target className="h-5 w-5 text-pink-400" />}
                        {portfolioTab === 'futures' && <BarChart3 className="h-5 w-5 text-cyan-400" />}
                        {portfolioTab === 'crypto' && <Bitcoin className="h-5 w-5 text-amber-400" />}
                        {portfolioTab === 'options' ? 'Options' : portfolioTab === 'futures' ? 'Futures' : 'Crypto'} Open Positions
                        {openPositions.filter(p => 
                          portfolioTab === 'options' ? p.assetType === 'option' : 
                          portfolioTab === 'futures' ? p.assetType === 'future' : 
                          p.assetType === 'crypto'
                        ).length > 0 && (
                          <Badge variant="outline" className={cn(
                            "ml-2 font-mono text-xs",
                            portfolioTab === 'options' ? "bg-pink-500/10 text-pink-400 border-pink-500/30" :
                            portfolioTab === 'futures' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" :
                            "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          )}>
                            {openPositions.filter(p => 
                              portfolioTab === 'options' ? p.assetType === 'option' : 
                              portfolioTab === 'futures' ? p.assetType === 'future' : 
                              p.assetType === 'crypto'
                            ).length}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {botData.isAdmin 
                          ? `Active ${portfolioTab} trades currently held by the bot`
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
                  ) : openPositions.filter(p => 
                      portfolioTab === 'options' ? p.assetType === 'option' : 
                      portfolioTab === 'futures' ? p.assetType === 'future' : 
                      p.assetType === 'crypto'
                    ).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className={cn(
                        "h-12 w-12 rounded-lg flex items-center justify-center mx-auto mb-2",
                        portfolioTab === 'options' ? "bg-gradient-to-br from-pink-500/20 to-purple-500/20" :
                        portfolioTab === 'futures' ? "bg-gradient-to-br from-cyan-500/20 to-blue-500/20" :
                        "bg-gradient-to-br from-amber-500/20 to-orange-500/20"
                      )}>
                        {portfolioTab === 'options' && <Target className="h-6 w-6 text-pink-400" />}
                        {portfolioTab === 'futures' && <BarChart3 className="h-6 w-6 text-cyan-400" />}
                        {portfolioTab === 'crypto' && <Bitcoin className="h-6 w-6 text-amber-400" />}
                      </div>
                      <p>No open {portfolioTab} positions. Bot will enter trades when opportunities arise.</p>
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
                          {openPositions
                            .filter(p => 
                              portfolioTab === 'options' ? p.assetType === 'option' : 
                              portfolioTab === 'futures' ? p.assetType === 'future' : 
                              p.assetType === 'crypto'
                            )
                            .map((position) => {
                            // Use real-time price if available
                            const realtimePos = realtimePnL?.positions?.find(rp => rp.id === Number(position.id));
                            const livePrice = realtimePos?.currentPrice ?? position.currentPrice ?? position.entryPrice;
                            const livePnL = realtimePos?.unrealizedPnL;
                            
                            const multiplier = position.assetType === 'option' ? 100 : (position.assetType === 'future' ? 50 : 1);
                            const marketValue = livePrice * position.quantity * (position.assetType === 'crypto' ? 1 : multiplier);
                            const costBasis = position.entryPrice * position.quantity * (position.assetType === 'crypto' ? 1 : multiplier);
                            const pnl = livePnL ?? position.unrealizedPnL ?? (marketValue - costBasis);
                            const returnPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
                            
                            const formatCryptoQty = (qty: number) => {
                              if (qty >= 1000000) return `${(qty / 1000000).toFixed(1)}M`;
                              if (qty >= 1000) return `${(qty / 1000).toFixed(1)}K`;
                              if (qty >= 1) return qty.toFixed(1);
                              return qty.toFixed(4);
                            };
                            
                            const formatCryptoPrice = (price: number) => {
                              if (price < 0.0001) return `$${price.toFixed(8)}`;
                              if (price < 0.01) return `$${price.toFixed(6)}`;
                              if (price < 1) return `$${price.toFixed(4)}`;
                              return formatCurrency(price);
                            };
                            
                            const displayQty = position.assetType === 'crypto' 
                              ? formatCryptoQty(position.quantity)
                              : position.quantity;
                            
                            const displayEntryPrice = position.assetType === 'crypto' 
                              ? formatCryptoPrice(position.entryPrice)
                              : formatCurrency(position.entryPrice);
                              
                            const displayCurrentPrice = position.assetType === 'crypto'
                              ? formatCryptoPrice(livePrice)
                              : formatCurrency(livePrice);
                            
                            return (
                              <TableRow key={position.id} className="border-slate-700/50 hover-elevate" data-testid={`open-position-${position.id}`}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-base">{position.symbol}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn(
                                    "text-xs font-medium",
                                    position.assetType === 'future' 
                                      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                                      : position.assetType === 'crypto'
                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                        : position.optionType === 'call'
                                          ? "bg-green-500/10 text-green-400 border-green-500/30"
                                          : "bg-red-500/10 text-red-400 border-red-500/30"
                                  )}>
                                    {position.assetType === 'future' ? 'FUTURES' : position.assetType === 'crypto' ? 'SPOT' : position.optionType?.toUpperCase() || 'OPTION'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="font-mono tabular-nums text-sm">{displayQty}</span>
                                  {position.assetType === 'crypto' && (
                                    <span className="text-xs text-muted-foreground ml-1">coins</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-sm">{displayEntryPrice}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-sm">{displayCurrentPrice}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-sm font-medium">{formatCurrency(marketValue)}</TableCell>
                                <TableCell className={cn(
                                  "text-right font-mono tabular-nums text-sm font-semibold",
                                  pnl >= 0 ? "text-green-400" : "text-red-400"
                                )}>
                                  <div className="flex items-center justify-end gap-1">
                                    {pnl >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                    {pnl >= 0 ? '+' : '-'}{formatCurrency(Math.abs(pnl))}
                                  </div>
                                </TableCell>
                                <TableCell className={cn(
                                  "text-right font-mono tabular-nums text-sm font-semibold",
                                  returnPct >= 0 ? "text-green-400" : "text-red-400"
                                )}>
                                  {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
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

              {/* Trading History - Filtered by Portfolio Tab */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {portfolioTab === 'options' && <Target className="h-5 w-5 text-pink-400" />}
                        {portfolioTab === 'futures' && <BarChart3 className="h-5 w-5 text-cyan-400" />}
                        {portfolioTab === 'crypto' && <Bitcoin className="h-5 w-5 text-amber-400" />}
                        {portfolioTab === 'options' ? 'Options' : portfolioTab === 'futures' ? 'Futures' : 'Crypto'} Trade History
                        {closedPositions.filter(p => 
                          portfolioTab === 'options' ? p.assetType === 'option' : 
                          portfolioTab === 'futures' ? p.assetType === 'future' : 
                          p.assetType === 'crypto'
                        ).length > 0 && (
                          <Badge variant="outline" className={cn(
                            "ml-2 font-mono text-xs",
                            portfolioTab === 'options' ? "bg-pink-500/10 text-pink-400 border-pink-500/30" :
                            portfolioTab === 'futures' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" :
                            "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          )}>
                            {closedPositions.filter(p => 
                              portfolioTab === 'options' ? p.assetType === 'option' : 
                              portfolioTab === 'futures' ? p.assetType === 'future' : 
                              p.assetType === 'crypto'
                            ).length}
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>Closed {portfolioTab} trades with realized P&L</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!botData.isAdmin ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                      <p>Trade history is restricted to administrators.</p>
                    </div>
                  ) : closedPositions.filter(p => 
                      portfolioTab === 'options' ? p.assetType === 'option' : 
                      portfolioTab === 'futures' ? p.assetType === 'future' : 
                      p.assetType === 'crypto'
                    ).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No closed {portfolioTab} trades yet.</p>
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
                          {closedPositions
                            .filter(p => 
                              portfolioTab === 'options' ? p.assetType === 'option' : 
                              portfolioTab === 'futures' ? p.assetType === 'future' : 
                              p.assetType === 'crypto'
                            )
                            .slice(0, 10)
                            .map((position) => (
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

        {/* Prop Firm Mode Tab */}
        <TabsContent value="prop-firm" className="space-y-6">
          <Card className="glass-card border-amber-500/30">
            <CardHeader>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-amber-500/10">
                    <Trophy className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Prop Firm Mode
                      {propFirmData?.status === 'active' && (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                      {propFirmData?.status === 'locked' && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Locked
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Conservative NQ futures trading for funded account evaluation (Topstep-style)
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {propFirmLoading ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-amber-400" />
                <p className="mt-2 text-muted-foreground">Loading Prop Firm data...</p>
              </CardContent>
            </Card>
          ) : !propFirmData || propFirmData.status === 'initializing' ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <Trophy className="h-12 w-12 mx-auto text-amber-400/50 mb-4" />
                <h3 className="text-lg font-semibold">Prop Firm Mode Starting</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  The prop firm trading bot is initializing. It runs every 10 minutes during CME market hours with conservative risk parameters.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Account Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Account Balance</p>
                        <p className="text-2xl font-bold font-mono tabular-nums">
                          {formatCurrency(propFirmData.portfolio?.balance || 50000)}
                        </p>
                      </div>
                      <Wallet className="h-8 w-8 text-amber-400/50" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Daily P&L</p>
                        <p className={cn(
                          "text-2xl font-bold font-mono tabular-nums",
                          (propFirmData.portfolio?.dailyPnL || 0) >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                          {(propFirmData.portfolio?.dailyPnL || 0) >= 0 ? '+' : ''}{formatCurrency(propFirmData.portfolio?.dailyPnL || 0)}
                        </p>
                      </div>
                      <Activity className="h-8 w-8 text-cyan-400/50" />
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Daily Loss Limit</span>
                        <span className="text-red-400">-{formatCurrency(propFirmData.rules?.dailyLossLimit || 1000)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all",
                            (propFirmData.portfolio?.dailyPnL || 0) >= 0 ? "bg-green-500" : "bg-red-500"
                          )}
                          style={{ 
                            width: `${Math.min(100, Math.abs((propFirmData.portfolio?.dailyPnL || 0) / (propFirmData.rules?.dailyLossLimit || 1000)) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total P&L</p>
                        <p className={cn(
                          "text-2xl font-bold font-mono tabular-nums",
                          (propFirmData.portfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                          {(propFirmData.portfolio?.totalPnL || 0) >= 0 ? '+' : ''}{formatCurrency(propFirmData.portfolio?.totalPnL || 0)}
                        </p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-green-400/50" />
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Progress to Target</span>
                        <span className="text-green-400">{formatCurrency(propFirmData.rules?.profitTarget || 3000)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${Math.min(100, propFirmData.portfolio?.progressToTarget || 0)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass hover-elevate">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Max Drawdown</p>
                        <p className={cn(
                          "text-2xl font-bold font-mono tabular-nums",
                          (propFirmData.portfolio?.drawdown || 0) > 1500 ? "text-red-400" : "text-amber-400"
                        )}>
                          -{formatCurrency(propFirmData.portfolio?.drawdown || 0)}
                        </p>
                      </div>
                      <Shield className="h-8 w-8 text-amber-400/50" />
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Limit</span>
                        <span className="text-red-400">-{formatCurrency(propFirmData.rules?.maxDrawdown || 2500)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all",
                            (propFirmData.portfolio?.drawdown || 0) > 1500 ? "bg-red-500" : "bg-amber-500"
                          )}
                          style={{ 
                            width: `${Math.min(100, ((propFirmData.portfolio?.drawdown || 0) / (propFirmData.rules?.maxDrawdown || 2500)) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Trading Rules */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-amber-400" />
                    Evaluation Rules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Starting Capital</p>
                      <p className="font-mono font-bold">{formatCurrency(50000)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Daily Loss Limit</p>
                      <p className="font-mono font-bold text-red-400">-{formatCurrency(propFirmData.rules?.dailyLossLimit || 1000)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Max Drawdown</p>
                      <p className="font-mono font-bold text-red-400">-{formatCurrency(propFirmData.rules?.maxDrawdown || 2500)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Profit Target</p>
                      <p className="font-mono font-bold text-green-400">+{formatCurrency(propFirmData.rules?.profitTarget || 3000)}</p>
                    </div>
                  </div>

                  {propFirmData.stats?.ruleViolations && propFirmData.stats.ruleViolations.length > 0 && (
                    <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                      <p className="text-sm font-medium text-red-400 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Rule Violations
                      </p>
                      <ul className="mt-2 text-sm text-red-300/80 space-y-1">
                        {propFirmData.stats.ruleViolations.map((violation, i) => (
                          <li key={i}>• {violation}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Performance Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="stat-glass">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-amber-500/10">
                      <Calendar className="h-6 w-6 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Days Traded</p>
                      <p className="text-2xl font-bold font-mono tabular-nums">{propFirmData.stats?.daysTraded || 0}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-cyan-500/10">
                      <BarChart3 className="h-6 w-6 text-cyan-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Trades</p>
                      <p className="text-2xl font-bold font-mono tabular-nums">{propFirmData.stats?.tradesCount || 0}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-glass">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-green-500/10">
                      <Target className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Win Rate</p>
                      <p className="text-2xl font-bold font-mono tabular-nums">{propFirmData.stats?.winRate || '0.0'}%</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Open Positions */}
              {propFirmData.openPositions && propFirmData.openPositions.length > 0 && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="h-5 w-5 text-green-400" />
                      Open Positions ({propFirmData.openPositions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {propFirmData.openPositions.map((position, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          data-testid={`prop-firm-position-${idx}`}
                        >
                          <div className="flex items-center gap-3">
                            <Badge className={cn(
                              "text-xs",
                              position.direction === 'long' 
                                ? "bg-green-500/10 text-green-400 border-green-500/30"
                                : "bg-red-500/10 text-red-400 border-red-500/30"
                            )}>
                              {position.direction.toUpperCase()}
                            </Badge>
                            <span className="font-mono font-bold">{position.symbol}</span>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Entry</p>
                              <p className="font-mono">{formatCurrency(position.entryPrice)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Current</p>
                              <p className="font-mono">{formatCurrency(position.currentPrice)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">P&L</p>
                              <p className={cn(
                                "font-mono font-bold",
                                position.unrealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                              )}>
                                {position.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnL)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Trades */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5 text-cyan-400" />
                    Recent Trades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {propFirmData.recentTrades && propFirmData.recentTrades.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-slate-700">
                            <TableHead className="text-xs font-medium uppercase tracking-wider">Symbol</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider">Direction</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Entry</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">Exit</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider text-right">P&L</TableHead>
                            <TableHead className="text-xs font-medium uppercase tracking-wider">Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {propFirmData.recentTrades.map((trade, idx) => (
                            <TableRow 
                              key={idx}
                              className={cn(
                                "border-slate-700/50",
                                trade.realizedPnL >= 0 ? "bg-green-500/5" : "bg-red-500/5"
                              )}
                            >
                              <TableCell className="font-mono font-bold">{trade.symbol}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn(
                                  "text-xs",
                                  trade.direction === 'long'
                                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                                    : "bg-red-500/10 text-red-400 border-red-500/30"
                                )}>
                                  {trade.direction.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{formatCurrency(trade.entryPrice)}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{formatCurrency(trade.exitPrice)}</TableCell>
                              <TableCell className={cn(
                                "text-right font-mono tabular-nums font-semibold",
                                trade.realizedPnL >= 0 ? "text-green-400" : "text-red-400"
                              )}>
                                {trade.realizedPnL >= 0 ? '+' : ''}{formatCurrency(trade.realizedPnL)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {trade.exitReason || 'Manual'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No trades yet. The bot will take positions during CME hours when high-probability setups appear.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Educational Disclaimer */}
              <Card className="glass-card border-amber-500/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-amber-400 mb-1">Paper Trading Simulation</p>
                      <p>
                        This is a simulated prop firm evaluation using paper trading. Results are for educational and research purposes only. 
                        Real prop firm evaluations have additional rules and requirements. Past simulated performance does not guarantee future results.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Strategy Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          {!user ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <LogIn className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Login Required</h3>
                <p className="text-muted-foreground mb-4">Sign in to customize your trading strategy preferences.</p>
              </CardContent>
            </Card>
          ) : preferencesLoading ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-cyan-400" />
                <p className="text-muted-foreground">Loading your preferences...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Save Button Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-cyan-400" />
                    Trading Strategy Preferences
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Customize how the Auto Lotto Bot generates and executes trades
                  </p>
                </div>
                <Button 
                  onClick={handleSavePreferences}
                  disabled={updatePreferencesMutation.isPending}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                  data-testid="button-save-preferences"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updatePreferencesMutation.isPending ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>

              {/* Risk Profile Section */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-5 w-5 text-amber-400" />
                    Risk Profile
                  </CardTitle>
                  <CardDescription>Define your overall risk tolerance and position limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="risk-tolerance">Risk Tolerance</Label>
                      <Select 
                        value={localPrefs.riskTolerance || 'moderate'} 
                        onValueChange={(v) => updateLocalPref('riskTolerance', v as AutoLottoPreferences['riskTolerance'])}
                      >
                        <SelectTrigger id="risk-tolerance" data-testid="select-risk-tolerance">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conservative">Conservative - Lower risk, smaller positions</SelectItem>
                          <SelectItem value="moderate">Moderate - Balanced approach</SelectItem>
                          <SelectItem value="aggressive">Aggressive - Higher risk for higher returns</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-position">Max Position Size ($)</Label>
                      <Input 
                        id="max-position"
                        type="number" 
                        value={localPrefs.maxPositionSize ?? 100}
                        onChange={(e) => updateLocalPref('maxPositionSize', parseNumericInput(e.target.value, 100))}
                        data-testid="input-max-position"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max-trades">Max Concurrent Trades</Label>
                      <Input 
                        id="max-trades"
                        type="number" 
                        value={localPrefs.maxConcurrentTrades ?? 5}
                        onChange={(e) => updateLocalPref('maxConcurrentTrades', parseNumericInput(e.target.value, 5))}
                        data-testid="input-max-trades"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="daily-loss">Daily Loss Limit ($)</Label>
                      <Input 
                        id="daily-loss"
                        type="number" 
                        value={localPrefs.dailyLossLimit ?? 200}
                        onChange={(e) => updateLocalPref('dailyLossLimit', parseNumericInput(e.target.value, 200))}
                        data-testid="input-daily-loss"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Minimum Confidence Score: {localPrefs.minConfidenceScore || 70}%</Label>
                    <Slider 
                      value={[localPrefs.minConfidenceScore || 70]}
                      onValueChange={([v]) => updateLocalPref('minConfidenceScore', v)}
                      min={50}
                      max={95}
                      step={5}
                      className="w-full"
                      data-testid="slider-confidence"
                    />
                    <p className="text-xs text-muted-foreground">Only take trades with confidence score above this threshold</p>
                  </div>
                </CardContent>
              </Card>

              {/* Asset Allocation Section */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <PiggyBank className="h-5 w-5 text-green-400" />
                    Asset Allocation
                  </CardTitle>
                  <CardDescription>Choose which markets to trade and allocation percentages</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg border border-slate-700 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-purple-500/10">
                            <Target className="h-4 w-4 text-purple-400" />
                          </div>
                          <span className="font-medium">Options</span>
                        </div>
                        <Switch 
                          checked={localPrefs.enableOptions ?? true}
                          onCheckedChange={(v) => updateLocalPref('enableOptions', v)}
                          data-testid="switch-enable-options"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Allocation: {localPrefs.optionsAllocation || 40}%</Label>
                        <Slider 
                          value={[localPrefs.optionsAllocation || 40]}
                          onValueChange={([v]) => updateLocalPref('optionsAllocation', v)}
                          min={0}
                          max={100}
                          step={5}
                          disabled={!localPrefs.enableOptions}
                          data-testid="slider-options-allocation"
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-700 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-cyan-500/10">
                            <LineChart className="h-4 w-4 text-cyan-400" />
                          </div>
                          <span className="font-medium">Futures</span>
                        </div>
                        <Switch 
                          checked={localPrefs.enableFutures ?? true}
                          onCheckedChange={(v) => updateLocalPref('enableFutures', v)}
                          data-testid="switch-enable-futures"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Allocation: {localPrefs.futuresAllocation || 30}%</Label>
                        <Slider 
                          value={[localPrefs.futuresAllocation || 30]}
                          onValueChange={([v]) => updateLocalPref('futuresAllocation', v)}
                          min={0}
                          max={100}
                          step={5}
                          disabled={!localPrefs.enableFutures}
                          data-testid="slider-futures-allocation"
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-700 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-amber-500/10">
                            <Bitcoin className="h-4 w-4 text-amber-400" />
                          </div>
                          <span className="font-medium">Crypto</span>
                        </div>
                        <Switch 
                          checked={localPrefs.enableCrypto ?? true}
                          onCheckedChange={(v) => updateLocalPref('enableCrypto', v)}
                          data-testid="switch-enable-crypto"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Allocation: {localPrefs.cryptoAllocation || 30}%</Label>
                        <Slider 
                          value={[localPrefs.cryptoAllocation || 30]}
                          onValueChange={([v]) => updateLocalPref('cryptoAllocation', v)}
                          min={0}
                          max={100}
                          step={5}
                          disabled={!localPrefs.enableCrypto}
                          data-testid="slider-crypto-allocation"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trading Hours Section */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock className="h-5 w-5 text-blue-400" />
                    Trading Hours
                  </CardTitle>
                  <CardDescription>Define when the bot is allowed to trade</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700">
                      <Label htmlFor="pre-market" className="cursor-pointer">Pre-Market (4:00 - 9:30 AM ET)</Label>
                      <Switch 
                        id="pre-market"
                        checked={localPrefs.tradePreMarket ?? false}
                        onCheckedChange={(v) => updateLocalPref('tradePreMarket', v)}
                        data-testid="switch-pre-market"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700">
                      <Label htmlFor="regular-hours" className="cursor-pointer">Regular Hours (9:30 AM - 4:00 PM ET)</Label>
                      <Switch 
                        id="regular-hours"
                        checked={localPrefs.tradeRegularHours ?? true}
                        onCheckedChange={(v) => updateLocalPref('tradeRegularHours', v)}
                        data-testid="switch-regular-hours"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700">
                      <Label htmlFor="after-hours" className="cursor-pointer">After-Hours (4:00 - 8:00 PM ET)</Label>
                      <Switch 
                        id="after-hours"
                        checked={localPrefs.tradeAfterHours ?? false}
                        onCheckedChange={(v) => updateLocalPref('tradeAfterHours', v)}
                        data-testid="switch-after-hours"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Preferred Holding Period</Label>
                    <Select 
                      value={localPrefs.preferredHoldingPeriod || 'day'} 
                      onValueChange={(v) => updateLocalPref('preferredHoldingPeriod', v as AutoLottoPreferences['preferredHoldingPeriod'])}
                    >
                      <SelectTrigger data-testid="select-holding-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day Trade - Exit by market close</SelectItem>
                        <SelectItem value="swing">Swing Trade - Hold 2-5 days</SelectItem>
                        <SelectItem value="position">Position Trade - Hold 1-2 weeks</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Alerts Section */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="h-5 w-5 text-rose-400" />
                    Notifications
                  </CardTitle>
                  <CardDescription>Configure how you receive trade alerts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700">
                      <div className="flex items-center gap-2">
                        <SiDiscord className="h-4 w-4 text-indigo-400" />
                        <Label htmlFor="discord-alerts" className="cursor-pointer">Discord Alerts</Label>
                      </div>
                      <Switch 
                        id="discord-alerts"
                        checked={localPrefs.enableDiscordAlerts ?? true}
                        onCheckedChange={(v) => updateLocalPref('enableDiscordAlerts', v)}
                        data-testid="switch-discord-alerts"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700">
                      <Label htmlFor="alert-entry" className="cursor-pointer">Alert on Trade Entry</Label>
                      <Switch 
                        id="alert-entry"
                        checked={localPrefs.alertOnEntry ?? true}
                        onCheckedChange={(v) => updateLocalPref('alertOnEntry', v)}
                        data-testid="switch-alert-entry"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700">
                      <Label htmlFor="alert-exit" className="cursor-pointer">Alert on Trade Exit</Label>
                      <Switch 
                        id="alert-exit"
                        checked={localPrefs.alertOnExit ?? true}
                        onCheckedChange={(v) => updateLocalPref('alertOnExit', v)}
                        data-testid="switch-alert-exit"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700">
                      <Label htmlFor="alert-daily-limit" className="cursor-pointer">Alert on Daily Limit Hit</Label>
                      <Switch 
                        id="alert-daily-limit"
                        checked={localPrefs.alertOnDailyLimit ?? true}
                        onCheckedChange={(v) => updateLocalPref('alertOnDailyLimit', v)}
                        data-testid="switch-alert-daily-limit"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Educational Disclaimer */}
              <Card className="glass-card border-amber-500/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-amber-400 mb-1">Personalized Strategy Settings</p>
                      <p>
                        These preferences customize your paper trading experience. Changes take effect on the next trading cycle.
                        All trades are simulated for research and educational purposes only.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
