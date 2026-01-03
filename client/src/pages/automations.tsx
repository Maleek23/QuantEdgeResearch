import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  LineChart
} from "lucide-react";
import { format } from "date-fns";

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
  const [activeTab, setActiveTab] = useState("overview");

  const { data: status, isLoading } = useQuery<AutomationsStatus>({
    queryKey: ["/api/automations/status"],
    refetchInterval: 5000,
  });

  const { data: weeklyReport } = useQuery({
    queryKey: ["/api/automations/weekly-report/preview"],
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
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">Automations Hub</h1>
          <p className="text-muted-foreground mt-1">Manage trading bots, scanners, and automated reports</p>
        </div>
        <Badge variant="outline" className="text-cyan-400 border-cyan-400/30">
          <Zap className="w-3 h-3 mr-1" />
          4 Automations
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Activity className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="quant-bot" data-testid="tab-quant-bot">
            <Bot className="w-4 h-4 mr-2" />
            Quant Bot
          </TabsTrigger>
          <TabsTrigger value="options-flow" data-testid="tab-options-flow">
            <TrendingUp className="w-4 h-4 mr-2" />
            Options Flow
          </TabsTrigger>
          <TabsTrigger value="social" data-testid="tab-social">
            <MessageSquare className="w-4 h-4 mr-2" />
            Social
          </TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">
            <FileText className="w-4 h-4 mr-2" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="hover-elevate">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Quant Mean-Reversion</CardTitle>
                  <StatusBadge active={quantBot?.isActive || false} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  <Bot className="w-5 h-5 text-cyan-400" />
                  {quantBot?.tradesExecuted || 0} trades
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  RSI(2) strategy with +$4.12 expectancy
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <LastScanTime timestamp={quantBot?.lastScan || null} />
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Options Flow Scanner</CardTitle>
                  <StatusBadge active={optionsFlow?.isActive || false} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                  {optionsFlow?.flowsDetected || 0} flows
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Unusual institutional activity detector
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <LastScanTime timestamp={optionsFlow?.lastScan || null} />
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Social Sentiment</CardTitle>
                  <StatusBadge active={socialSentiment?.isActive || false} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                  {socialSentiment?.mentionsFound || 0} mentions
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Twitter/Reddit sentiment tracking
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <LastScanTime timestamp={socialSentiment?.lastScan || null} />
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Weekly Report</CardTitle>
                  <StatusBadge active={reportSettings?.isEnabled || false} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-2xl font-bold">
                  <FileText className="w-5 h-5 text-amber-400" />
                  Sunday 8PM
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Performance summary to Discord
                </p>
                <div className="mt-3">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => generateReport.mutate()}
                    disabled={generateReport.isPending}
                    data-testid="button-generate-report"
                  >
                    {generateReport.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
                    Send Now
                  </Button>
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
                    <Label>Tickers Watchlist</Label>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {quantBot?.settings.tickers.map(ticker => (
                        <Badge key={ticker} variant="outline">{ticker}</Badge>
                      ))}
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
                <h4 className="font-medium mb-3">Watchlist</h4>
                <div className="flex flex-wrap gap-1">
                  {optionsFlow?.settings.watchlist.map(ticker => (
                    <Badge key={ticker} variant="outline">{ticker}</Badge>
                  ))}
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
      </Tabs>
    </div>
  );
}
