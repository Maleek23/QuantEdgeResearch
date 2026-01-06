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
  RotateCcw
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { format } from "date-fns";

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

  const { data: weeklyReport } = useQuery({
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
        <Tabs value={activeTab} onValueChange={(val) => {
          if (val === "auto-lotto") {
            setLocation("/watchlist-bot");
          } else {
            setActiveTab(val);
          }
        }} className="space-y-6">
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
                      <div className="font-medium">{String((weeklyReport as any)?.period?.start || '')} - {String((weeklyReport as any)?.period?.end || '')}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total Trades</div>
                      <div className="font-medium">{String((weeklyReport as any)?.summary?.totalTrades || 0)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Win Rate</div>
                      <div className="font-medium">{((weeklyReport as any)?.summary?.winRate as number || 0).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total P&L</div>
                      <div className={`font-medium ${((weeklyReport as any)?.summary?.totalPnL as number || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {((weeklyReport as any)?.summary?.totalPnL as number || 0) >= 0 ? '+' : ''}{((weeklyReport as any)?.summary?.totalPnL as number || 0).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {(weeklyReport as any)?.insights && (weeklyReport as any).insights.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Insights</h5>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {(weeklyReport as any).insights.map((insight: any, i: number) => (
                          <li key={i}>{String(insight)}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(weeklyReport as any)?.recommendations && (weeklyReport as any).recommendations.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium mb-2">Recommendations</h5>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {(weeklyReport as any).recommendations.map((rec: any, i: number) => (
                          <li key={i}>{String(rec)}</li>
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
  );
}
