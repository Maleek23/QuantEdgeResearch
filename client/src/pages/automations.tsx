import { useState, useEffect } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, safeToFixed } from "@/lib/utils";
import { 
  Bot, 
  TrendingUp, 
  BarChart3, 
  MessageSquare, 
  Play, 
  Pause,
  RefreshCw,
  Activity,
  Clock,
  Target,
  Zap,
  FileText,
  Send,
  Settings,
  AlertCircle,
  CheckCircle,
  Loader2,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Bitcoin,
  LineChart,
  Rocket,
  ExternalLink,
  Save,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Brain,
  Calculator,
  Search,
  Shield,
  AlertTriangle,
  TrendingDown,
  Timer,
  Crosshair,
  Layers,
  ToggleLeft
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { format } from "date-fns";
import { HeroProductPanel } from "@/components/hero-product-panel";
import { AutoLottoDashboard } from "@/components/auto-lotto-dashboard";
import { ExpiryPatternInsights } from "@/components/expiry-pattern-insights";
import { MarketOverviewWidget } from "@/components/market-overview-widget";
import { WinRateWidget } from "@/components/win-rate-widget";

interface ExitAdvisory {
  positionId: string;
  symbol: string;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  portfolioId: string;
  portfolioName: string;
  assetType: 'option' | 'crypto' | 'futures' | 'stock';
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  quantity: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  exitWindow: 'immediate' | 'soon' | 'hold' | 'watch';
  exitProbability: number;
  exitReason: string;
  exitTimeEstimate: string;
  momentum: string;
  momentumScore: number;
  dteRemaining: number | null;
  thetaUrgency: 'critical' | 'high' | 'moderate' | 'low';
  riskRewardCurrent: number;
  distanceToTarget: number;
  distanceToStop: number;
  signals: string[];
  lastUpdated: string;
}

interface ExitIntelligenceResponse {
  portfolios: any[];
  positions: ExitAdvisory[];
  lastRefresh: string;
  marketStatus: 'open' | 'closed' | 'pre_market' | 'after_hours';
  message?: string;
}

function ExitIntelligenceCard({ botOnly = false }: { botOnly?: boolean }) {
  const { data: exitIntel, isPending, refetch } = useQuery<ExitIntelligenceResponse>({
    queryKey: ['/api/auto-lotto/exit-intelligence'],
    refetchInterval: 30000, // Reduced from 15s to 30s to prevent flickering
    staleTime: 0,
    placeholderData: keepPreviousData, // Prevents flickering during refetch
  });

  const getExitWindowBadge = (window: ExitAdvisory['exitWindow']) => {
    const styles: Record<string, string> = {
      immediate: 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse',
      soon: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      watch: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
      hold: 'bg-green-500/20 text-green-400 border-green-500/40',
    };
    const labels: Record<string, string> = {
      immediate: 'EXIT NOW',
      soon: 'EXIT SOON',
      watch: 'WATCH',
      hold: 'HOLD',
    };
    return (
      <Badge variant="outline" className={cn("text-xs font-bold", styles[window])}>
        {labels[window]}
      </Badge>
    );
  };

  const getThetaBadge = (urgency: ExitAdvisory['thetaUrgency']) => {
    const styles: Record<string, string> = {
      critical: 'text-red-400',
      high: 'text-amber-400',
      moderate: 'text-cyan-400',
      low: 'text-green-400',
    };
    return <span className={cn("text-xs font-mono", styles[urgency])}>θ{urgency}</span>;
  };

  const getMomentumIcon = (momentum: string) => {
    if (momentum.includes('bullish')) return <TrendingUp className="h-3 w-3 text-green-400" />;
    if (momentum.includes('bearish')) return <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />;
    return <Activity className="h-3 w-3 text-muted-foreground" />;
  };

  const positions = botOnly 
    ? (exitIntel?.positions || []).filter((p: ExitAdvisory) => p.portfolioName.toLowerCase().includes('bot') || p.portfolioName.toLowerCase().includes('lotto'))
    : (exitIntel?.positions || []);

  const immediateCount = positions.filter((p: ExitAdvisory) => p.exitWindow === 'immediate').length || 0;
  const totalPositions = positions.length || 0;

  return (
    <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent" data-testid="card-exit-intelligence">
      <CardHeader className="py-3 px-4 border-b border-cyan-500/20">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-cyan-400">
            <Activity className="h-4 w-4" />
            Bot Exit Intelligence
            {totalPositions > 0 && (
              <Badge variant="secondary" className="text-xs font-mono">
                {totalPositions}
              </Badge>
            )}
            {immediateCount > 0 && (
              <Badge variant="destructive" className="text-xs animate-pulse">
                {immediateCount} urgent
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => refetch()}
              data-testid="button-refresh-exit-intel"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Smart exit monitoring for bot-entered positions only
        </p>
      </CardHeader>
      <CardContent className="p-3">
        {isPending && positions.length === 0 ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : positions.length > 0 ? (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {positions.map((pos: ExitAdvisory) => (
              <div 
                key={pos.positionId}
                className={cn(
                  "p-3 rounded-lg border transition-all duration-200",
                  pos.exitWindow === 'immediate' ? "bg-red-500/10 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.1)]" :
                  pos.exitWindow === 'soon' ? "bg-amber-500/5 border-amber-500/30" :
                  "bg-slate-800/40 border-slate-700/50"
                )}
                data-testid={`exit-intel-${pos.symbol}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-foreground">{pos.symbol}</span>
                    <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 uppercase">
                      {pos.optionType} ${pos.strikePrice}
                    </Badge>
                    {pos.dteRemaining !== null && (
                      <span className={cn(
                        "text-[10px] font-mono",
                        pos.dteRemaining <= 2 ? "text-red-400 font-bold" : "text-muted-foreground"
                      )}>
                        {pos.dteRemaining}DTE
                      </span>
                    )}
                  </div>
                  {getExitWindowBadge(pos.exitWindow)}
                </div>
                
                <div className="grid grid-cols-4 gap-2 text-[11px] mb-2">
                  <div>
                    <span className="text-muted-foreground block mb-0.5">Entry</span>
                    <div className="font-mono text-foreground">${safeToFixed(pos.entryPrice, 2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">Price</span>
                    <div className="font-mono text-foreground">${safeToFixed(pos.currentPrice, 2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">Profit</span>
                    <div className={cn(
                      "font-mono font-bold",
                      pos.unrealizedPnLPercent >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {pos.unrealizedPnLPercent >= 0 ? '+' : ''}{safeToFixed(pos.unrealizedPnLPercent, 1)}%
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    {getMomentumIcon(pos.momentum)}
                    {pos.dteRemaining !== null && getThetaBadge(pos.thetaUrgency)}
                  </div>
                </div>

                <div className="space-y-1.5 p-2 rounded bg-slate-900/40 border border-slate-700/30">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Exit Confidence</span>
                    <span className="font-mono font-bold text-cyan-400">{pos.exitProbability}%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        pos.exitProbability > 80 ? "bg-red-500" : pos.exitProbability > 60 ? "bg-amber-500" : "bg-cyan-500"
                      )} 
                      style={{ width: `${pos.exitProbability}%` }} 
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                    <span className="text-cyan-400 font-semibold mr-1">ANALYSIS:</span>
                    {pos.exitReason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground bg-slate-900/40 rounded-lg border border-dashed border-slate-700/50">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No active bot positions monitored</p>
            <p className="text-[11px] mt-1 opacity-60">Bot must enter a play for monitoring to begin</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CryptoBotData {
  status: 'active' | 'inactive';
  isActive?: boolean;
  openPositions: number;
  maxPositions: number;
  coinsTracked?: number;
  tradesExecuted?: number;
  winRate?: number;
  todayTrades?: number;
  lastScan?: string | null;
  currentPositions?: Array<{
    symbol: string;
    entryPrice: number;
    currentPrice: number;
    quantity: number;
    side: string;
    pnl: number;
    pnlPercent: number;
  }>;
  portfolio: {
    totalValue: number;
    cashBalance?: number;
    startingCapital: number;
    dailyPnL?: number;
    dailyPnLPercent?: number;
  };
}

interface QuantBotStatus {
  isActive: boolean;
  lastScan: string | null;
  tradesExecuted: number;
  winRate: number;
  totalPnL: number;
  todayTrades: number;
  settings: {
    tickers: string[];
    maxDTE: number;
    profitTarget: number;
    stopLoss: number;
    positionSize: number;
  };
}

interface OptionsFlowStatus {
  isActive: boolean;
  lastScan: string | null;
  flowsDetected: number;
  todayFlows: any[];
  settings: {
    minPremium: number;
    minVolumeOIRatio: number;
    watchlist: string[];
    alertThreshold: number;
  };
}

interface SocialSentimentStatus {
  isActive: boolean;
  lastScan: string | null;
  mentionsFound: number;
  trendingTickers: any[];
  recentMentions: any[];
  settings: {
    watchlist: string[];
    platforms: string[];
    minEngagement: number;
    updateInterval: number;
  };
}

interface WeeklyReportSettings {
  isEnabled: boolean;
  discordWebhook: string | null;
  emailRecipients: string[];
  sendOnDay: string;
  sendAtHour: number;
  includeRecommendations: boolean;
}

interface BotPreferences {
  userId?: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  maxPositionSize: number;
  maxConcurrentTrades: number;
  dailyLossLimit: number;
  optionsAllocation: number;
  futuresAllocation: number;
  cryptoAllocation: number;
  enableOptions: boolean;
  enableFutures: boolean;
  enableCrypto: boolean;
  enablePropFirm: boolean;
  optionsPreferredDte?: number;
  optionsMaxDte?: number;
  optionsMinDelta?: number;
  optionsMaxDelta?: number;
  optionsPreferCalls?: boolean;
  optionsPreferPuts?: boolean;
  optionsPreferredSymbols?: string[];
  futuresPreferredContracts?: string[];
  cryptoPreferredCoins?: string[];
  stopLossPercent?: number;
  takeProfitPercent?: number;
  trailingStopPercent?: number;
  maxDrawdownPercent?: number;
  kellyFraction?: 'full' | 'half' | 'quarter';
  circuitBreakerEnabled?: boolean;
  circuitBreakerLosses?: number;
  cooldownMinutes?: number;
  requireConfluence?: boolean;
  minConfluenceScore?: number;
}

interface BotPosition {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  stopLoss: number;
  status: string;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  realizedPnL: number;
  realizedPnLPercent: number;
  exitReason: string;
  optionType: string;
  strikePrice: number;
  expiryDate: string;
  entryTime: string;
  exitTime: string;
  createdAt: string;
  portfolioName: string;
  botType: string;
}

interface BotPortfolio {
  id: string;
  name: string;
  cashBalance: number;
  totalValue: number;
  startingCapital: number;
  openPositions: number;
  closedPositions: number;
  winRate: number;
  realizedPnL: number;
  unrealizedPnL: number;
  botType: string;
}

interface BotTradesResponse {
  positions: BotPosition[];
  portfolios: BotPortfolio[];
  summary: {
    totalPositions: number;
    openPositions: number;
    closedPositions: number;
    byAssetType: {
      options: number;
      crypto: number;
      futures: number;
      stock: number;
    };
  };
  lastUpdated: string;
}

interface AutomationsStatus {
  quantBot: QuantBotStatus;
  optionsFlow: OptionsFlowStatus;
  socialSentiment: SocialSentimentStatus;
  weeklyReport: WeeklyReportSettings;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "default" : "secondary"} className={active ? "bg-green-600" : ""}>
      {active ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertCircle className="w-3 h-3 mr-1" />}
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

function LastScanTime({ timestamp }: { timestamp: string | null }) {
  if (!timestamp) return <span className="text-muted-foreground text-sm">Never scanned</span>;
  
  try {
    const date = new Date(timestamp);
    return <span className="text-muted-foreground text-sm">{format(date, "MMM dd, HH:mm:ss")}</span>;
  } catch {
    return <span className="text-muted-foreground text-sm">Unknown</span>;
  }
}

export default function AutomationsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: status, isPending } = useQuery<AutomationsStatus>({
    queryKey: ["/api/automations/status"],
    refetchInterval: 30000, // Reduced from 5s to 30s to prevent flickering
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const { data: cryptoData } = useQuery<CryptoBotData>({
    queryKey: ["/api/bot/crypto"],
    refetchInterval: 30000, // Reduced from 5s to 30s to prevent flickering
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  // Main portfolio bots data
  const { data: botData } = useQuery<{
    portfolio: { name: string; startingCapital: number; cashBalance: number; totalValue: number; totalPnL: number } | null;
    futuresPortfolio: { name: string; startingCapital: number; cashBalance: number; totalValue: number; totalPnL: number; openPositions: number; winRate: string } | null;
    cryptoPortfolio: { name: string; startingCapital: number; cashBalance: number; totalValue: number; totalPnL: number; openPositions: number; winRate: string } | null;
    smallAccountPortfolio: { name: string; startingCapital: number; cashBalance: number; totalValue: number; totalPnL: number; openPositions: number; winRate: string } | null;
    stats: { openPositions: number; winRate: string; totalRealizedPnL: number } | null;
    botStatus: string;
  }>({
    queryKey: ["/api/auto-lotto-bot"],
    refetchInterval: 30000, // Reduced from 5s to 30s to prevent flickering
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const { data: weeklyReport } = useQuery<{
    period?: { start: string; end: string };
    summary?: { totalTrades: number; winRate: number; totalPnL: number };
    insights?: string[];
    recommendations?: string[];
  }>({
    queryKey: ["/api/automations/weekly-report/preview"],
  });

  // Bot preferences for settings
  const { data: botPreferences, isLoading: prefsLoading } = useQuery<BotPreferences>({
    queryKey: ["/api/auto-lotto-bot/preferences"],
  });

  // Local state for editing allocations
  const [optionsAlloc, setOptionsAlloc] = useState(40);
  const [futuresAlloc, setFuturesAlloc] = useState(30);
  const [cryptoAlloc, setCryptoAlloc] = useState(30);
  const [maxPositionSize, setMaxPositionSize] = useState(100);
  
  // Per-trade risk controls
  const [stopLossPercent, setStopLossPercent] = useState(25);
  const [takeProfitPercent, setTakeProfitPercent] = useState(50);
  const [trailingStopPercent, setTrailingStopPercent] = useState(0);
  
  // Account-level risk controls
  const [dailyLossLimit, setDailyLossLimit] = useState(100);
  const [maxConcurrentTrades, setMaxConcurrentTrades] = useState(3);
  const [maxDrawdownPercent, setMaxDrawdownPercent] = useState(20);
  const [riskTolerance, setRiskTolerance] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  
  // Advanced controls
  const [kellyFraction, setKellyFraction] = useState<'full' | 'half' | 'quarter'>('half');
  const [circuitBreakerEnabled, setCircuitBreakerEnabled] = useState(true);
  const [circuitBreakerLosses, setCircuitBreakerLosses] = useState(3);
  const [cooldownMinutes, setCooldownMinutes] = useState(30);
  const [requireConfluence, setRequireConfluence] = useState(true);
  const [minConfluenceScore, setMinConfluenceScore] = useState(70);
  
  // Options-specific settings
  const [optionsPreferredDte, setOptionsPreferredDte] = useState(7);
  const [optionsMaxDte, setOptionsMaxDte] = useState(30);
  const [optionsMinDelta, setOptionsMinDelta] = useState(0.20);
  const [optionsMaxDelta, setOptionsMaxDelta] = useState(0.40);
  const [enableOptions, setEnableOptions] = useState(true);
  const [enableFutures, setEnableFutures] = useState(true);
  const [enableCrypto, setEnableCrypto] = useState(true);

  // Sync local state with fetched preferences
  useEffect(() => {
    if (botPreferences) {
      setOptionsAlloc(botPreferences.optionsAllocation || 40);
      setFuturesAlloc(botPreferences.futuresAllocation || 30);
      setCryptoAlloc(botPreferences.cryptoAllocation || 30);
      setMaxPositionSize(botPreferences.maxPositionSize || 100);
      setStopLossPercent(botPreferences.stopLossPercent ?? 25);
      setTakeProfitPercent(botPreferences.takeProfitPercent ?? 50);
      setTrailingStopPercent(botPreferences.trailingStopPercent ?? 0);
      setDailyLossLimit(botPreferences.dailyLossLimit || 100);
      setMaxConcurrentTrades(botPreferences.maxConcurrentTrades || 3);
      setMaxDrawdownPercent(botPreferences.maxDrawdownPercent ?? 20);
      setRiskTolerance(botPreferences.riskTolerance || 'moderate');
      setKellyFraction(botPreferences.kellyFraction || 'half');
      setCircuitBreakerEnabled(botPreferences.circuitBreakerEnabled ?? true);
      setCircuitBreakerLosses(botPreferences.circuitBreakerLosses ?? 3);
      setCooldownMinutes(botPreferences.cooldownMinutes ?? 30);
      setRequireConfluence(botPreferences.requireConfluence ?? true);
      setMinConfluenceScore(botPreferences.minConfluenceScore ?? 70);
      setOptionsPreferredDte(botPreferences.optionsPreferredDte ?? 7);
      setOptionsMaxDte(botPreferences.optionsMaxDte ?? 30);
      setOptionsMinDelta(botPreferences.optionsMinDelta ?? 0.20);
      setOptionsMaxDelta(botPreferences.optionsMaxDelta ?? 0.40);
      setEnableOptions(botPreferences.enableOptions ?? true);
      setEnableFutures(botPreferences.enableFutures ?? true);
      setEnableCrypto(botPreferences.enableCrypto ?? true);
    }
  }, [botPreferences]);

  const updatePreferences = useMutation({
    mutationFn: async (updates: Partial<BotPreferences>) => {
      // Merge with existing preferences to ensure all required fields are included
      const merged = {
        ...botPreferences,
        ...updates,
      };
      const response = await apiRequest("PUT", "/api/auto-lotto-bot/preferences", merged);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auto-lotto-bot/preferences"] });
      toast({ title: "Settings Saved", description: "Bot preferences updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to save settings", variant: "destructive" });
    },
  });

  const toggleQuantBot = useMutation({
    mutationFn: async (active: boolean) => {
      return apiRequest("POST", "/api/automations/quant-bot/toggle", { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations/status"] });
      toast({ title: "Quant Bot Updated" });
    },
  });

  const scanQuantBot = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/automations/quant-bot/scan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations/status"] });
      toast({ title: "Quant Bot Scan Complete" });
    },
  });

  const toggleOptionsFlow = useMutation({
    mutationFn: async (active: boolean) => {
      return apiRequest("POST", "/api/automations/options-flow/toggle", { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations/status"] });
      toast({ title: "Options Flow Scanner Updated" });
    },
  });

  const scanOptionsFlow = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/automations/options-flow/scan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations/status"] });
      toast({ title: "Options Flow Scan Complete" });
    },
  });

  const toggleSocialSentiment = useMutation({
    mutationFn: async (active: boolean) => {
      return apiRequest("POST", "/api/automations/social-sentiment/toggle", { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations/status"] });
      toast({ title: "Social Sentiment Scanner Updated" });
    },
  });

  const scanSocialSentiment = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/automations/social-sentiment/scan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automations/status"] });
      toast({ title: "Social Sentiment Scan Complete" });
    },
  });

  const generateReport = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/automations/weekly-report/generate");
    },
    onSuccess: () => {
      toast({ title: "Weekly Report Sent", description: "Report has been sent to Discord" });
    },
  });

  // Show loading spinner during initial load OR when no data is available
  // This prevents blank screen scenarios when API returns cached/empty response
  if (isPending || (!status && !botData && !cryptoData)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-slate-900/20">
        <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
          {/* Loading Header Skeleton */}
          <div className="rounded-xl bg-slate-900/60 backdrop-blur-md border border-slate-700/50 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-4 w-96" />
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          {/* Loading Tabs Skeleton */}
          <Skeleton className="h-12 w-full max-w-md" />
          {/* Loading Content Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}
          </div>
          <div className="flex items-center justify-center pt-8">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        </div>
      </div>
    );
  }

  const { quantBot, optionsFlow, socialSentiment, weeklyReport: reportSettings } = status || {};

  if (activeTab === "research") {
    setLocation("/trade-ideas");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-slate-900/20">
      <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
        {/* Refined Header - Cyan focused, minimal glass */}
        <div className="rounded-xl bg-slate-900/60 backdrop-blur-md border border-slate-700/50 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <Zap className="w-5 h-5 text-cyan-400" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-foreground" data-testid="text-page-title">
                  Automations Hub
                </h1>
              </div>
              <p className="text-muted-foreground text-sm">
                AI-powered trading bots, market scanners, and automated intelligence reports
              </p>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active</span>
                <div className="text-lg font-bold font-mono text-cyan-400">
                  {[quantBot?.isActive, optionsFlow?.isActive, socialSentiment?.isActive, cryptoData?.status === 'active'].filter(Boolean).length} / 4
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-500/10 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">LIVE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Simplified Tabs Navigation - Focus on trading bots */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex h-11 bg-slate-800/40 border border-slate-700/50 rounded-lg p-1 gap-1">
              <TabsTrigger 
                value="overview" 
                data-testid="tab-overview"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Activity className="w-4 h-4 mr-2" />
                Trading Bots
                <Badge variant="default" className="ml-2 h-4 px-1 text-[9px] bg-green-600 animate-pulse">LIVE</Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="scanner" 
                data-testid="tab-scanner"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Search className="w-4 h-4 mr-2" />
                Market Scanner
              </TabsTrigger>
              <TabsTrigger 
                value="auto-lotto" 
                data-testid="tab-auto-lotto" 
                className="relative rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Rocket className="w-4 h-4 mr-2" />
                Positions
              </TabsTrigger>
              <TabsTrigger 
                value="scanners" 
                data-testid="tab-scanners"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Bot className="w-4 h-4 mr-2" />
                Signal Scanners
              </TabsTrigger>
              <TabsTrigger 
                value="settings" 
                data-testid="tab-settings"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

        <TabsContent value="overview" className="space-y-6">
          {/* Market Intelligence Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <MarketOverviewWidget />
            <ExpiryPatternInsights />
            <WinRateWidget />
          </div>

          {/* 4 Main Portfolio Bots - Primary Display */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Options Bot - $300 */}
            <Card className="bg-gradient-to-br from-cyan-500/10 to-slate-900/60 border-cyan-500/30" data-testid="card-options-bot">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
                      <TrendingUp className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Options Bot</h3>
                      <p className="text-[10px] text-muted-foreground">US Market Hours</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 border border-green-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-green-400">LIVE</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-[10px] text-muted-foreground">Capital</p>
                    <p className="text-lg font-bold font-mono text-cyan-400">${botData?.portfolio?.startingCapital || 300}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-[10px] text-muted-foreground">P&L</p>
                    <p className={cn("text-lg font-bold font-mono", (botData?.portfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                      {(botData?.portfolio?.totalPnL || 0) >= 0 ? "+" : ""}{safeToFixed(botData?.portfolio?.totalPnL, 2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Open: {botData?.stats?.openPositions || 0}</span>
                  <span className="text-muted-foreground">Win: {botData?.stats?.winRate || '0'}%</span>
                </div>
              </CardContent>
            </Card>

            {/* Futures Bot - $300 */}
            <Card className="bg-gradient-to-br from-purple-500/10 to-slate-900/60 border-purple-500/30" data-testid="card-futures-bot">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
                      <LineChart className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Futures Bot</h3>
                      <p className="text-[10px] text-muted-foreground">CME Hours (NQ/GC)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 border border-green-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-green-400">LIVE</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-[10px] text-muted-foreground">Capital</p>
                    <p className="text-lg font-bold font-mono text-purple-400">${botData?.futuresPortfolio?.startingCapital || 300}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-[10px] text-muted-foreground">P&L</p>
                    <p className={cn("text-lg font-bold font-mono", (botData?.futuresPortfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                      {(botData?.futuresPortfolio?.totalPnL || 0) >= 0 ? "+" : ""}{safeToFixed(botData?.futuresPortfolio?.totalPnL, 2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Open: {botData?.futuresPortfolio?.openPositions || 0}</span>
                  <span className="text-muted-foreground">Win: {botData?.futuresPortfolio?.winRate || '0'}%</span>
                </div>
              </CardContent>
            </Card>

            {/* Crypto Bot - $300 */}
            <Card className="bg-gradient-to-br from-amber-500/10 to-slate-900/60 border-amber-500/30" data-testid="card-crypto-bot">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                      <Bitcoin className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Crypto Bot</h3>
                      <p className="text-[10px] text-muted-foreground">24/7 (13 coins)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 border border-green-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-green-400">LIVE</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-[10px] text-muted-foreground">Capital</p>
                    <p className="text-lg font-bold font-mono text-amber-400">${botData?.cryptoPortfolio?.startingCapital || 300}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-[10px] text-muted-foreground">P&L</p>
                    <p className={cn("text-lg font-bold font-mono", (botData?.cryptoPortfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                      {(botData?.cryptoPortfolio?.totalPnL || 0) >= 0 ? "+" : ""}{safeToFixed(botData?.cryptoPortfolio?.totalPnL, 2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Open: {botData?.cryptoPortfolio?.openPositions || 0}</span>
                  <span className="text-muted-foreground">Win: {botData?.cryptoPortfolio?.winRate || '0'}%</span>
                </div>
              </CardContent>
            </Card>

            {/* Small Account Lotto - $150 */}
            <Card className="bg-gradient-to-br from-green-500/10 to-slate-900/60 border-green-500/30" data-testid="card-small-account-bot">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-green-500/20 border border-green-500/30">
                      <Rocket className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground">Small Account</h3>
                      <p className="text-[10px] text-muted-foreground">A+ Lottos Only</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 border border-green-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-green-400">LIVE</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-[10px] text-muted-foreground">Capital</p>
                    <p className="text-lg font-bold font-mono text-green-400">${botData?.smallAccountPortfolio?.startingCapital || 150}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-[10px] text-muted-foreground">P&L</p>
                    <p className={cn("text-lg font-bold font-mono", (botData?.smallAccountPortfolio?.totalPnL || 0) >= 0 ? "text-green-400" : "text-red-400")}>
                      {(botData?.smallAccountPortfolio?.totalPnL || 0) >= 0 ? "+" : ""}{safeToFixed(botData?.smallAccountPortfolio?.totalPnL, 2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Open: {botData?.smallAccountPortfolio?.openPositions || 0}</span>
                  <span className="text-muted-foreground">Win: {botData?.smallAccountPortfolio?.winRate || '0'}%</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Exit Intelligence - Critical Position Monitoring */}
          <ExitIntelligenceCard botOnly />

          {/* Quick Actions Row */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h4 className="font-semibold text-sm">Market Scanner</h4>
                    <p className="text-xs text-muted-foreground">Find new opportunities</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("scanner")} className="border-cyan-500/30 text-cyan-400">
                  Open
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-purple-400" />
                  <div>
                    <h4 className="font-semibold text-sm">View Positions</h4>
                    <p className="text-xs text-muted-foreground">All open trades</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("auto-lotto")} className="border-purple-500/30 text-purple-400">
                  Open
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Brain className="w-5 h-5 text-amber-400" />
                  <div>
                    <h4 className="font-semibold text-sm">Trade Ideas</h4>
                    <p className="text-xs text-muted-foreground">AI-generated research</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setLocation("/trade-desk")} className="border-amber-500/30 text-amber-400">
                  Open
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Market Scanner Tab */}
        <TabsContent value="scanner" className="space-y-6">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="w-5 h-5 text-cyan-400" />
                    Market Scanner
                  </CardTitle>
                  <CardDescription>Find trading opportunities in real-time</CardDescription>
                </div>
                <Button onClick={() => setLocation("/market-scanner")} className="bg-cyan-600 hover:bg-cyan-700">
                  Open Full Scanner
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <Button 
                  variant="outline" 
                  className="h-auto py-6 flex-col gap-2 border-slate-700/50 hover:border-cyan-500/30"
                  onClick={() => setLocation("/market-scanner?tab=movers")}
                >
                  <TrendingUp className="w-8 h-8 text-cyan-400" />
                  <span className="font-semibold">Top Movers</span>
                  <span className="text-xs text-muted-foreground">Daily gainers & losers</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-auto py-6 flex-col gap-2 border-slate-700/50 hover:border-cyan-500/30"
                  onClick={() => setLocation("/market-scanner?tab=daytrade")}
                >
                  <Zap className="w-8 h-8 text-amber-400" />
                  <span className="font-semibold">Day Trade</span>
                  <span className="text-xs text-muted-foreground">Intraday setups</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="h-auto py-6 flex-col gap-2 border-slate-700/50 hover:border-cyan-500/30"
                  onClick={() => setLocation("/market-scanner?tab=swing")}
                >
                  <Target className="w-8 h-8 text-purple-400" />
                  <span className="font-semibold">Swing Trade</span>
                  <span className="text-xs text-muted-foreground">Multi-day holds</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signal Scanners Tab (consolidated Quant, Flow, Social) */}
        <TabsContent value="scanners" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Quant Scanner */}
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-blue-400" />
                    <CardTitle className="text-base">Quant Scanner</CardTitle>
                  </div>
                  <StatusBadge active={quantBot?.isActive || false} />
                </div>
                <CardDescription>RSI(2) mean-reversion signals</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Trades Today</span>
                  <span className="font-mono font-bold">{quantBot?.todayTrades || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Scan</span>
                  <LastScanTime timestamp={quantBot?.lastScan || null} />
                </div>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => scanQuantBot.mutate()}
                  disabled={scanQuantBot.isPending}
                >
                  {scanQuantBot.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Run Scan
                </Button>
              </CardContent>
            </Card>

            {/* Options Flow Scanner */}
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-400" />
                    <CardTitle className="text-base">Options Flow</CardTitle>
                  </div>
                  <StatusBadge active={optionsFlow?.isActive || false} />
                </div>
                <CardDescription>Institutional options activity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Flows Detected</span>
                  <span className="font-mono font-bold">{optionsFlow?.flowsDetected || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Scan</span>
                  <LastScanTime timestamp={optionsFlow?.lastScan || null} />
                </div>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => scanOptionsFlow.mutate()}
                  disabled={scanOptionsFlow.isPending}
                >
                  {scanOptionsFlow.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Run Scan
                </Button>
              </CardContent>
            </Card>

            {/* Social Sentiment Scanner */}
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-purple-400" />
                    <CardTitle className="text-base">Social Sentiment</CardTitle>
                  </div>
                  <StatusBadge active={socialSentiment?.isActive || false} />
                </div>
                <CardDescription>Twitter/Reddit tracking</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Mentions Found</span>
                  <span className="font-mono font-bold">{socialSentiment?.mentionsFound || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Scan</span>
                  <LastScanTime timestamp={socialSentiment?.lastScan || null} />
                </div>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => scanSocialSentiment.mutate()}
                  disabled={scanSocialSentiment.isPending}
                >
                  {scanSocialSentiment.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Run Scan
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Auto-Lotto Bot Dashboard */}
        <TabsContent value="auto-lotto" className="space-y-6">
          <AutoLottoDashboard />
          <ExpiryPatternInsights />
        </TabsContent>

        {/* Settings Tab - Professional Risk Controls */}
        <TabsContent value="settings" className="space-y-4">
          {/* Save Button Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-cyan-400" />
                Professional Risk Controls
              </h2>
              <p className="text-sm text-muted-foreground">Configure comprehensive risk management for all trading strategies</p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setOptionsAlloc(40); setFuturesAlloc(30); setCryptoAlloc(30);
                  setMaxPositionSize(100); setStopLossPercent(25); setTakeProfitPercent(50);
                  setTrailingStopPercent(0); setDailyLossLimit(100); setMaxConcurrentTrades(3);
                  setMaxDrawdownPercent(20); setRiskTolerance('moderate'); setKellyFraction('half');
                  setCircuitBreakerEnabled(true); setCircuitBreakerLosses(3); setCooldownMinutes(30);
                  setOptionsPreferredDte(7); setOptionsMaxDte(30); setOptionsMinDelta(0.20); setOptionsMaxDelta(0.40);
                }}
                data-testid="button-reset-defaults"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset All
              </Button>
              <Button 
                onClick={() => updatePreferences.mutate({
                  optionsAllocation: optionsAlloc, futuresAllocation: futuresAlloc, cryptoAllocation: cryptoAlloc,
                  maxPositionSize, stopLossPercent, takeProfitPercent, trailingStopPercent,
                  dailyLossLimit, maxConcurrentTrades, maxDrawdownPercent, riskTolerance, kellyFraction,
                  circuitBreakerEnabled, circuitBreakerLosses, cooldownMinutes, requireConfluence, minConfluenceScore,
                  optionsPreferredDte, optionsMaxDte, optionsMinDelta, optionsMaxDelta,
                  enableOptions, enableFutures, enableCrypto,
                })}
                disabled={updatePreferences.isPending}
                data-testid="button-save-settings"
              >
                {updatePreferences.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save All Settings
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Per-Trade Risk Controls */}
            <Card className="border-red-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-red-400">
                  <Target className="w-4 h-4" />
                  Per-Trade Risk Controls
                </CardTitle>
                <CardDescription className="text-xs">Define exit rules for every position</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                      Stop Loss
                    </Label>
                    <span className="font-mono text-red-400 text-sm">-{stopLossPercent}%</span>
                  </div>
                  <Slider value={[stopLossPercent]} onValueChange={([v]) => setStopLossPercent(v)} min={5} max={50} step={5} data-testid="slider-stop-loss" />
                  <p className="text-[10px] text-muted-foreground">Auto-exit when position loses this percentage</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                      Take Profit
                    </Label>
                    <span className="font-mono text-green-400 text-sm">+{takeProfitPercent}%</span>
                  </div>
                  <Slider value={[takeProfitPercent]} onValueChange={([v]) => setTakeProfitPercent(v)} min={10} max={200} step={10} data-testid="slider-take-profit" />
                  <p className="text-[10px] text-muted-foreground">Auto-exit when position gains this percentage</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                      Trailing Stop
                    </Label>
                    <span className="font-mono text-amber-400 text-sm">{trailingStopPercent === 0 ? 'OFF' : `-${trailingStopPercent}%`}</span>
                  </div>
                  <Slider value={[trailingStopPercent]} onValueChange={([v]) => setTrailingStopPercent(v)} min={0} max={30} step={5} data-testid="slider-trailing-stop" />
                  <p className="text-[10px] text-muted-foreground">Lock in profits with dynamic stop (0 = disabled)</p>
                </div>

                <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 mt-4">
                  <div className="flex items-center gap-2 text-xs">
                    <Shield className="w-3.5 h-3.5 text-red-400" />
                    <span className="font-medium text-red-400">Risk/Reward Ratio</span>
                    <span className="font-mono ml-auto">{safeToFixed(takeProfitPercent / stopLossPercent, 2)}:1</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account-Level Risk Limits */}
            <Card className="border-amber-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  Account-Level Limits
                </CardTitle>
                <CardDescription className="text-xs">Protect your account from excessive losses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-green-400" />
                      Max Position Size
                    </Label>
                    <span className="font-mono text-green-400 text-sm">${maxPositionSize}</span>
                  </div>
                  <Slider value={[maxPositionSize]} onValueChange={([v]) => setMaxPositionSize(v)} min={25} max={500} step={25} data-testid="slider-max-position" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                      Daily Loss Limit
                    </Label>
                    <span className="font-mono text-red-400 text-sm">${dailyLossLimit}</span>
                  </div>
                  <Slider value={[dailyLossLimit]} onValueChange={([v]) => setDailyLossLimit(v)} min={25} max={500} step={25} data-testid="slider-daily-loss" />
                  <p className="text-[10px] text-muted-foreground">Stop all trading when daily losses hit this limit</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      Max Concurrent Trades
                    </Label>
                    <span className="font-mono text-cyan-400 text-sm">{maxConcurrentTrades}</span>
                  </div>
                  <Slider value={[maxConcurrentTrades]} onValueChange={([v]) => setMaxConcurrentTrades(v)} min={1} max={10} step={1} data-testid="slider-max-trades" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      Max Drawdown
                    </Label>
                    <span className="font-mono text-amber-400 text-sm">{maxDrawdownPercent}%</span>
                  </div>
                  <Slider value={[maxDrawdownPercent]} onValueChange={([v]) => setMaxDrawdownPercent(v)} min={5} max={50} step={5} data-testid="slider-max-drawdown" />
                  <p className="text-[10px] text-muted-foreground">Halt trading if portfolio drops by this amount</p>
                </div>
              </CardContent>
            </Card>

            {/* Capital Allocation */}
            <Card className="border-cyan-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-cyan-400">
                  <Wallet className="w-4 h-4" />
                  Capital Allocation
                </CardTitle>
                <CardDescription className="text-xs">Distribute capital across strategies</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <LineChart className="w-3.5 h-3.5 text-cyan-400" />
                      Options
                    </Label>
                    <span className="font-mono text-cyan-400 text-sm">{optionsAlloc}%</span>
                  </div>
                  <Slider value={[optionsAlloc]} onValueChange={([v]) => setOptionsAlloc(v)} max={100} step={5} data-testid="slider-options-allocation" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                      Futures
                    </Label>
                    <span className="font-mono text-blue-400 text-sm">{futuresAlloc}%</span>
                  </div>
                  <Slider value={[futuresAlloc]} onValueChange={([v]) => setFuturesAlloc(v)} max={100} step={5} data-testid="slider-futures-allocation" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm flex items-center gap-2">
                      <Bitcoin className="w-3.5 h-3.5 text-orange-400" />
                      Crypto
                    </Label>
                    <span className="font-mono text-orange-400 text-sm">{cryptoAlloc}%</span>
                  </div>
                  <Slider value={[cryptoAlloc]} onValueChange={([v]) => setCryptoAlloc(v)} max={100} step={5} data-testid="slider-crypto-allocation" />
                </div>

                <div className={cn("p-3 rounded-lg border mt-2", 
                  optionsAlloc + futuresAlloc + cryptoAlloc === 100 
                    ? "bg-green-500/5 border-green-500/20" 
                    : "bg-amber-500/5 border-amber-500/20"
                )}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total Allocation</span>
                    <span className={cn("font-mono font-bold", 
                      optionsAlloc + futuresAlloc + cryptoAlloc === 100 ? "text-green-400" : "text-amber-400"
                    )}>
                      {optionsAlloc + futuresAlloc + cryptoAlloc}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Advanced Controls */}
            <Card className="border-purple-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-purple-400">
                  <Brain className="w-4 h-4" />
                  Advanced Controls
                </CardTitle>
                <CardDescription className="text-xs">Circuit breakers and position sizing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <Calculator className="w-3.5 h-3.5 text-purple-400" />
                    Kelly Position Sizing
                  </Label>
                  <Select value={kellyFraction} onValueChange={(v) => setKellyFraction(v as any)}>
                    <SelectTrigger data-testid="select-kelly-fraction">
                      <SelectValue placeholder="Select fraction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Kelly (Aggressive)</SelectItem>
                      <SelectItem value="half">Half Kelly (Recommended)</SelectItem>
                      <SelectItem value="quarter">Quarter Kelly (Conservative)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Optimal position sizing based on edge and win rate</p>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    Risk Profile
                  </Label>
                  <Select value={riskTolerance} onValueChange={(v) => setRiskTolerance(v as any)}>
                    <SelectTrigger data-testid="select-risk-tolerance">
                      <SelectValue placeholder="Select profile" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative (Lower risk)</SelectItem>
                      <SelectItem value="moderate">Moderate (Balanced)</SelectItem>
                      <SelectItem value="aggressive">Aggressive (Higher risk)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm">Circuit Breaker</span>
                  </div>
                  <Switch checked={circuitBreakerEnabled} onCheckedChange={setCircuitBreakerEnabled} data-testid="switch-circuit-breaker" />
                </div>
                
                {circuitBreakerEnabled && (
                  <div className="space-y-2 pl-4 border-l-2 border-red-500/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Consecutive losses to trigger</Label>
                      <span className="font-mono text-red-400 text-sm">{circuitBreakerLosses}</span>
                    </div>
                    <Slider value={[circuitBreakerLosses]} onValueChange={([v]) => setCircuitBreakerLosses(v)} min={2} max={10} step={1} data-testid="slider-circuit-losses" />
                    
                    <div className="flex items-center justify-between mt-2">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        Cooldown period
                      </Label>
                      <span className="font-mono text-amber-400 text-sm">{cooldownMinutes}min</span>
                    </div>
                    <Slider value={[cooldownMinutes]} onValueChange={([v]) => setCooldownMinutes(v)} min={15} max={120} step={15} data-testid="slider-cooldown" />
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30 mt-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm">Require Confluence</span>
                  </div>
                  <Switch checked={requireConfluence} onCheckedChange={setRequireConfluence} data-testid="switch-confluence" />
                </div>
                
                {requireConfluence && (
                  <div className="space-y-2 pl-4 border-l-2 border-cyan-500/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Minimum confluence score</Label>
                      <span className="font-mono text-cyan-400 text-sm">{minConfluenceScore}%</span>
                    </div>
                    <Slider value={[minConfluenceScore]} onValueChange={([v]) => setMinConfluenceScore(v)} min={50} max={95} step={5} data-testid="slider-confluence-score" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Options Strategy Settings */}
          <Card className="border-cyan-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-cyan-400">
                <LineChart className="w-4 h-4" />
                Options Strategy Configuration
              </CardTitle>
              <CardDescription className="text-xs">Fine-tune options selection criteria</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Preferred DTE</Label>
                    <span className="font-mono text-cyan-400 text-sm">{optionsPreferredDte}d</span>
                  </div>
                  <Slider value={[optionsPreferredDte]} onValueChange={([v]) => setOptionsPreferredDte(v)} min={1} max={45} step={1} data-testid="slider-preferred-dte" />
                  <p className="text-[10px] text-muted-foreground">Target days to expiration</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Max DTE</Label>
                    <span className="font-mono text-amber-400 text-sm">{optionsMaxDte}d</span>
                  </div>
                  <Slider value={[optionsMaxDte]} onValueChange={([v]) => setOptionsMaxDte(v)} min={7} max={90} step={7} data-testid="slider-max-dte" />
                  <p className="text-[10px] text-muted-foreground">Maximum days to expiration</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Min Delta</Label>
                    <span className="font-mono text-green-400 text-sm">{safeToFixed(optionsMinDelta, 2)}</span>
                  </div>
                  <Slider value={[optionsMinDelta * 100]} onValueChange={([v]) => setOptionsMinDelta(v / 100)} min={5} max={50} step={5} data-testid="slider-min-delta" />
                  <p className="text-[10px] text-muted-foreground">Minimum delta for entries</p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Max Delta</Label>
                    <span className="font-mono text-purple-400 text-sm">{safeToFixed(optionsMaxDelta, 2)}</span>
                  </div>
                  <Slider value={[optionsMaxDelta * 100]} onValueChange={([v]) => setOptionsMaxDelta(v / 100)} min={20} max={80} step={5} data-testid="slider-max-delta" />
                  <p className="text-[10px] text-muted-foreground">Maximum delta for entries</p>
                </div>
              </div>

              {/* Bot Enable Toggles */}
              <div className="mt-6 pt-4 border-t border-border/30">
                <Label className="text-sm mb-3 block">Active Trading Bots</Label>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="flex items-center gap-2">
                      <LineChart className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm">Options Bot</span>
                    </div>
                    <Switch checked={enableOptions} onCheckedChange={setEnableOptions} data-testid="switch-options-bot" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-400" />
                      <span className="text-sm">Futures Bot</span>
                    </div>
                    <Switch checked={enableFutures} onCheckedChange={setEnableFutures} data-testid="switch-futures-bot" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="flex items-center gap-2">
                      <Bitcoin className="w-4 h-4 text-orange-400" />
                      <span className="text-sm">Crypto Bot</span>
                    </div>
                    <Switch checked={enableCrypto} onCheckedChange={setEnableCrypto} data-testid="switch-crypto-bot" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
