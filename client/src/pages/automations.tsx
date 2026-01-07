import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
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
  Search
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { format } from "date-fns";
import { HeroProductPanel } from "@/components/hero-product-panel";
import { AutoLottoDashboard } from "@/components/auto-lotto-dashboard";

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
  const { data: exitIntel, isLoading, refetch } = useQuery<ExitIntelligenceResponse>({
    queryKey: ['/api/auto-lotto/exit-intelligence'],
    refetchInterval: 15000,
    staleTime: 10000,
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
        {isLoading ? (
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
                    <div className="font-mono text-foreground">${pos.entryPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">Price</span>
                    <div className="font-mono text-foreground">${pos.currentPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">Profit</span>
                    <div className={cn(
                      "font-mono font-bold",
                      pos.unrealizedPnLPercent >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {pos.unrealizedPnLPercent >= 0 ? '+' : ''}{pos.unrealizedPnLPercent.toFixed(1)}%
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

  const { data: status, isLoading } = useQuery<AutomationsStatus>({
    queryKey: ["/api/automations/status"],
    refetchInterval: 5000,
  });

  const { data: cryptoData } = useQuery<CryptoBotData>({
    queryKey: ["/api/bot/crypto"],
    refetchInterval: 5000,
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

  // Sync local state with fetched preferences
  useEffect(() => {
    if (botPreferences) {
      setOptionsAlloc(botPreferences.optionsAllocation || 40);
      setFuturesAlloc(botPreferences.futuresAllocation || 30);
      setCryptoAlloc(botPreferences.cryptoAllocation || 30);
      setMaxPositionSize(botPreferences.maxPositionSize || 100);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
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

        {/* Tabs Navigation - Cyan accent focused */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex h-11 bg-slate-800/40 border border-slate-700/50 rounded-lg p-1 gap-1">
              <TabsTrigger 
                value="overview" 
                data-testid="tab-overview"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Activity className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="research" 
                data-testid="tab-research" 
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Research Hub
              </TabsTrigger>
              <TabsTrigger 
                value="auto-lotto" 
                data-testid="tab-auto-lotto" 
                className="relative rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Rocket className="w-4 h-4 mr-2" />
                Auto-Lotto
                <Badge variant="default" className="ml-2 h-4 px-1 text-[9px] bg-green-600">LIVE</Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="quant-bot" 
                data-testid="tab-quant-bot"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <Bot className="w-4 h-4 mr-2" />
                Quant Bot
              </TabsTrigger>
              <TabsTrigger 
                value="options-flow" 
                data-testid="tab-options-flow"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Options Flow
              </TabsTrigger>
              <TabsTrigger 
                value="social" 
                data-testid="tab-social"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Social
              </TabsTrigger>
              <TabsTrigger 
                value="reports" 
                data-testid="tab-reports"
                className="rounded-md px-4 py-2 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400"
              >
                <FileText className="w-4 h-4 mr-2" />
                Reports
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
          {/* Research Convergence Preview */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 bg-slate-900/60 border-slate-700/50 overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-cyan-400" />
                      Research Convergence
                    </CardTitle>
                    <CardDescription>Multi-engine intelligence output</CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
                    onClick={() => setLocation("/trade-ideas")}
                  >
                    View All Ideas
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row items-center gap-8 py-4">
                  <div className="w-full md:w-1/2">
                    <HeroProductPanel />
                  </div>
                  <div className="w-full md:w-1/2 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        variant="outline" 
                        className="h-auto py-3 flex-col items-start gap-1 border-slate-700/50 hover:border-cyan-500/30"
                        onClick={() => scanQuantBot.mutate()}
                        disabled={scanQuantBot.isPending}
                      >
                        <Calculator className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-semibold">Quant Scan</span>
                        <span className="text-[10px] text-muted-foreground">Mean-reversion signals</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        className="h-auto py-3 flex-col items-start gap-1 border-slate-700/50 hover:border-cyan-500/30"
                        onClick={() => scanOptionsFlow.mutate()}
                        disabled={scanOptionsFlow.isPending}
                      >
                        <Activity className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-semibold">Flow Scan</span>
                        <span className="text-[10px] text-muted-foreground">Institutional activity</span>
                      </Button>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground uppercase tracking-wider">Engine Status</span>
                        <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">OPTIMIZED</Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm font-mono">
                          <span className="text-muted-foreground">Active Trades</span>
                          <span className="text-foreground">{status?.quantBot?.todayTrades || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm font-mono">
                          <span className="text-muted-foreground">Last Signal</span>
                          <span className="text-cyan-400 font-bold">
                            {status?.quantBot?.lastScan ? format(new Date(status.quantBot.lastScan), "HH:mm:ss") : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-400" />
                  AI Intelligence
                </CardTitle>
                <CardDescription>Custom research generation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Trigger on-demand analysis for specific tickers using our multi-factor engine.
                </p>
                <div className="space-y-2">
                  <Button 
                    variant="secondary" 
                    className="w-full justify-between"
                    onClick={() => setLocation("/trade-ideas?analyze=true")}
                  >
                    Analyze New Ticker
                    <Brain className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-between border-slate-700/50"
                    onClick={() => setLocation("/market-scanner")}
                  >
                    Open Market Scanner
                    <Search className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bot Exit Intelligence - Full width prominent section */}
          <ExitIntelligenceCard botOnly />

          {/* Automation Cards - Consistent cyan palette with subtle differentiation */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Quant Bot Card */}
            <Card className="hover-elevate bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <StatusBadge active={quantBot?.isActive || false} />
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">Quant Mean-Reversion</h3>
                  <p className="text-xs text-muted-foreground">RSI(2) strategy</p>
                </div>
                <div className="pt-2 border-t border-slate-700/50">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-mono text-foreground">{quantBot?.tradesExecuted || 0}</span>
                    <span className="text-xs text-muted-foreground">trades</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <LastScanTime timestamp={quantBot?.lastScan || null} />
                </div>
              </CardContent>
            </Card>

            {/* Options Flow Card */}
            <Card className="hover-elevate bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                </div>
                <StatusBadge active={optionsFlow?.isActive || false} />
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">Options Flow Scanner</h3>
                  <p className="text-xs text-muted-foreground">Institutional activity</p>
                </div>
                <div className="pt-2 border-t border-slate-700/50">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-mono text-foreground">{optionsFlow?.flowsDetected || 0}</span>
                    <span className="text-xs text-muted-foreground">flows</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <LastScanTime timestamp={optionsFlow?.lastScan || null} />
                </div>
              </CardContent>
            </Card>

            {/* Social Sentiment Card */}
            <Card className="hover-elevate bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                </div>
                <StatusBadge active={socialSentiment?.isActive || false} />
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">Social Sentiment</h3>
                  <p className="text-xs text-muted-foreground">Twitter/Reddit tracking</p>
                </div>
                <div className="pt-2 border-t border-slate-700/50">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-mono text-foreground">{socialSentiment?.mentionsFound || 0}</span>
                    <span className="text-xs text-muted-foreground">mentions</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <LastScanTime timestamp={socialSentiment?.lastScan || null} />
                </div>
              </CardContent>
            </Card>

            {/* Crypto Bot Card */}
            <Card className="hover-elevate bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <Bitcoin className="w-4 h-4 text-cyan-400" />
                </div>
                <StatusBadge active={cryptoData?.status === 'active'} />
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">Crypto Bot</h3>
                  <p className="text-xs text-muted-foreground">13 coins (24/7)</p>
                </div>
                <div className="pt-2 border-t border-slate-700/50">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold font-mono text-foreground">{cryptoData?.openPositions || 0}/{cryptoData?.maxPositions || 3}</span>
                    <span className="text-xs text-muted-foreground">positions</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Activity className="w-3 h-3" />
                  <span>Always running</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Auto-Lotto Bot Dashboard */}
        <TabsContent value="auto-lotto" className="space-y-6">
          <AutoLottoDashboard />
        </TabsContent>

        <TabsContent value="quant-bot" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-cyan-400" />
                    Quant Mean-Reversion Bot
                  </CardTitle>
                  <CardDescription>RSI(2) strategy targeting liquid tickers with 0-1 DTE focus</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="quant-toggle">Active</Label>
                    <Switch 
                      id="quant-toggle"
                      checked={quantBot?.isActive || false}
                      onCheckedChange={(checked) => toggleQuantBot.mutate(checked)}
                      data-testid="switch-quant-bot-toggle"
                    />
                  </div>
                  <Button 
                    onClick={() => scanQuantBot.mutate()}
                    disabled={scanQuantBot.isPending || !quantBot?.isActive}
                    data-testid="button-quant-scan"
                  >
                    {scanQuantBot.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Scan Now
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Total Trades</div>
                  <div className="text-2xl font-bold">{quantBot?.tradesExecuted || 0}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                  <div className="text-2xl font-bold">{(quantBot?.winRate || 0).toFixed(1)}%</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Today's Trades</div>
                  <div className="text-2xl font-bold">{quantBot?.todayTrades || 0}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Expected Edge</div>
                  <div className="text-2xl font-bold text-green-400">+$4.12</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Strategy Settings</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label>Scan Universe</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="default" className="bg-cyan-600">500+ Tickers</Badge>
                      <span className="text-xs text-muted-foreground">Full market coverage + dynamic movers</span>
                    </div>
                  </div>
                  <div>
                    <Label>Max DTE</Label>
                    <p className="text-sm text-muted-foreground mt-1">{quantBot?.settings.maxDTE} days</p>
                  </div>
                  <div>
                    <Label>Profit Target / Stop Loss</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      +{((quantBot?.settings.profitTarget || 0) * 100).toFixed(0)}% / -{((quantBot?.settings.stopLoss || 0) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="options-flow" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                    Options Flow Scanner
                  </CardTitle>
                  <CardDescription>Detect unusual institutional options activity</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="flow-toggle">Active</Label>
                    <Switch 
                      id="flow-toggle"
                      checked={optionsFlow?.isActive || false}
                      onCheckedChange={(checked) => toggleOptionsFlow.mutate(checked)}
                      data-testid="switch-options-flow-toggle"
                    />
                  </div>
                  <Button 
                    onClick={() => scanOptionsFlow.mutate()}
                    disabled={scanOptionsFlow.isPending || !optionsFlow?.isActive}
                    data-testid="button-options-flow-scan"
                  >
                    {scanOptionsFlow.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Scan Now
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Flows Detected</div>
                  <div className="text-2xl font-bold">{optionsFlow?.flowsDetected || 0}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Today's Flows</div>
                  <div className="text-2xl font-bold">{optionsFlow?.todayFlows?.length || 0}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Min Premium</div>
                  <div className="text-2xl font-bold">${(optionsFlow?.settings.minPremium || 0) / 1000}k</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Alert Threshold</div>
                  <div className="text-2xl font-bold">{optionsFlow?.settings.alertThreshold || 75}</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Scan Universe</h4>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-purple-600">500+ Tickers</Badge>
                  <span className="text-xs text-muted-foreground">S&P 500 + growth stocks + penny stocks + ETFs</span>
                </div>
              </div>

              {optionsFlow?.todayFlows && optionsFlow.todayFlows.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Recent Unusual Flows</h4>
                  <div className="space-y-2">
                    {optionsFlow.todayFlows.slice(0, 5).map((flow: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant={flow.sentiment === 'bullish' ? 'default' : flow.sentiment === 'bearish' ? 'destructive' : 'secondary'}>
                            {flow.sentiment}
                          </Badge>
                          <span className="font-medium">{flow.symbol}</span>
                          <span className="text-muted-foreground">{flow.optionType?.toUpperCase()} ${flow.strikePrice}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">${(flow.premium / 1000).toFixed(0)}k</div>
                          <div className="text-xs text-muted-foreground">Score: {flow.unusualScore}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="social" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-400" />
                    Social Sentiment Scanner
                  </CardTitle>
                  <CardDescription>Track Twitter/Reddit mentions and sentiment</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="social-toggle">Active</Label>
                    <Switch 
                      id="social-toggle"
                      checked={socialSentiment?.isActive || false}
                      onCheckedChange={(checked) => toggleSocialSentiment.mutate(checked)}
                      data-testid="switch-social-sentiment-toggle"
                    />
                  </div>
                  <Button 
                    onClick={() => scanSocialSentiment.mutate()}
                    disabled={scanSocialSentiment.isPending || !socialSentiment?.isActive}
                    data-testid="button-social-scan"
                  >
                    {scanSocialSentiment.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Scan Now
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Total Mentions</div>
                  <div className="text-2xl font-bold">{socialSentiment?.mentionsFound || 0}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Trending Tickers</div>
                  <div className="text-2xl font-bold">{socialSentiment?.trendingTickers?.length || 0}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Platforms</div>
                  <div className="text-lg font-bold">{socialSentiment?.settings.platforms.join(', ')}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Update Interval</div>
                  <div className="text-2xl font-bold">{socialSentiment?.settings.updateInterval || 15}m</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Watchlist</h4>
                <div className="flex flex-wrap gap-1">
                  {socialSentiment?.settings.watchlist.map(ticker => (
                    <Badge key={ticker} variant="outline">{ticker}</Badge>
                  ))}
                </div>
              </div>

              {socialSentiment?.trendingTickers && socialSentiment.trendingTickers.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Trending Now</h4>
                  <div className="space-y-2">
                    {socialSentiment.trendingTickers.slice(0, 5).map((ticker: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge variant={ticker.sentiment === 'bullish' ? 'default' : ticker.sentiment === 'bearish' ? 'destructive' : 'secondary'}>
                            {ticker.sentiment}
                          </Badge>
                          <span className="font-medium">{ticker.symbol}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{ticker.mentionCount as number} mentions</div>
                          <div className="text-xs text-muted-foreground">Score: {(ticker.sentimentScore as number)?.toFixed(0)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-amber-400" />
                    Weekly Performance Report
                  </CardTitle>
                  <CardDescription>Automated weekly summary sent to Discord every Sunday</CardDescription>
                </div>
                <Button 
                  onClick={() => generateReport.mutate()}
                  disabled={generateReport.isPending}
                  data-testid="button-send-report"
                >
                  {generateReport.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Send Report Now
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Schedule</div>
                  <div className="text-lg font-bold capitalize">{reportSettings?.sendOnDay || 'Sunday'} at {reportSettings?.sendAtHour || 20}:00</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Status</div>
                  <StatusBadge active={reportSettings?.isEnabled || false} />
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">Includes Recommendations</div>
                  <div className="text-lg font-bold">{reportSettings?.includeRecommendations ? 'Yes' : 'No'}</div>
                </div>
              </div>

              {weeklyReport && (
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium">Report Preview</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-muted-foreground">Period</div>
                      <div className="font-medium">{weeklyReport.period?.start || ''} - {weeklyReport.period?.end || ''}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total Trades</div>
                      <div className="font-medium">{weeklyReport.summary?.totalTrades || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Win Rate</div>
                      <div className="font-medium">{(weeklyReport.summary?.winRate || 0).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total P&L</div>
                      <div className={`font-medium ${(weeklyReport.summary?.totalPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(weeklyReport.summary?.totalPnL || 0) >= 0 ? '+' : ''}{(weeklyReport.summary?.totalPnL || 0).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {weeklyReport.insights && weeklyReport.insights.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Insights</h5>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {weeklyReport.insights.map((insight, i) => (
                          <li key={i}>{insight}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {weeklyReport.recommendations && weeklyReport.recommendations.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Recommendations</h5>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {weeklyReport.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab - Clean, Trade Desk inspired design */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Settings className="w-5 h-5 text-cyan-400" />
                    Bot Allocation Settings
                  </CardTitle>
                  <CardDescription>Configure how your capital is distributed across trading strategies</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setOptionsAlloc(40);
                      setFuturesAlloc(30);
                      setCryptoAlloc(30);
                      setMaxPositionSize(100);
                    }}
                    data-testid="button-reset-defaults"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset
                  </Button>
                  <Button 
                    onClick={() => updatePreferences.mutate({
                      optionsAllocation: optionsAlloc,
                      futuresAllocation: futuresAlloc,
                      cryptoAllocation: cryptoAlloc,
                      maxPositionSize: maxPositionSize,
                    })}
                    disabled={updatePreferences.isPending}
                    data-testid="button-save-settings"
                  >
                    {updatePreferences.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Settings
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Allocation Sliders */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <LineChart className="w-4 h-4 text-cyan-400" />
                      Options Allocation
                    </Label>
                    <span className="font-mono text-cyan-400">{optionsAlloc}%</span>
                  </div>
                  <Slider
                    value={[optionsAlloc]}
                    onValueChange={([v]) => setOptionsAlloc(v)}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-options-allocation"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-400" />
                      Futures Allocation
                    </Label>
                    <span className="font-mono text-blue-400">{futuresAlloc}%</span>
                  </div>
                  <Slider
                    value={[futuresAlloc]}
                    onValueChange={([v]) => setFuturesAlloc(v)}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-futures-allocation"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Bitcoin className="w-4 h-4 text-orange-400" />
                      Crypto Allocation
                    </Label>
                    <span className="font-mono text-orange-400">{cryptoAlloc}%</span>
                  </div>
                  <Slider
                    value={[cryptoAlloc]}
                    onValueChange={([v]) => setCryptoAlloc(v)}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-crypto-allocation"
                  />
                </div>
              </div>

              {/* Total indicator */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                <span className="text-sm text-muted-foreground">Total Allocation</span>
                <span className={`font-mono font-bold ${optionsAlloc + futuresAlloc + cryptoAlloc === 100 ? 'text-green-400' : 'text-amber-400'}`}>
                  {optionsAlloc + futuresAlloc + cryptoAlloc}%
                </span>
              </div>

              {/* Position Size */}
              <div className="space-y-3 pt-4 border-t border-border/30">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-400" />
                    Max Position Size
                  </Label>
                  <span className="font-mono text-green-400">${maxPositionSize}</span>
                </div>
                <Slider
                  value={[maxPositionSize]}
                  onValueChange={([v]) => setMaxPositionSize(v)}
                  min={25}
                  max={500}
                  step={25}
                  className="w-full"
                  data-testid="slider-max-position"
                />
                <p className="text-xs text-muted-foreground">Maximum dollar amount per trade position</p>
              </div>

              {/* Bot Enable Toggles */}
              <div className="space-y-3 pt-4 border-t border-border/30">
                <Label className="text-sm">Active Strategies</Label>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                    <span className="text-sm">Options Bot</span>
                    <Badge variant={botPreferences?.enableOptions ? "default" : "secondary"} className={botPreferences?.enableOptions ? "bg-cyan-600" : ""}>
                      {botPreferences?.enableOptions ? "ON" : "OFF"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                    <span className="text-sm">Futures Bot</span>
                    <Badge variant={botPreferences?.enableFutures ? "default" : "secondary"} className={botPreferences?.enableFutures ? "bg-blue-600" : ""}>
                      {botPreferences?.enableFutures ? "ON" : "OFF"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                    <span className="text-sm">Crypto Bot</span>
                    <Badge variant={botPreferences?.enableCrypto ? "default" : "secondary"} className={botPreferences?.enableCrypto ? "bg-orange-600" : ""}>
                      {botPreferences?.enableCrypto ? "ON" : "OFF"}
                    </Badge>
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
