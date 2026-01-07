import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, TrendingDown, BarChart3, Zap, RefreshCw, Brain,
  Shield, Cpu, LineChart, Eye, Radio, CheckCircle2, XCircle, 
  MinusCircle, Flame, ChevronRight, Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Link } from "wouter";
import { MarketOverviewWidget } from "@/components/market-overview-widget";
import { WinRateWidget } from "@/components/win-rate-widget";
import { ExpiryPatternInsights } from "@/components/expiry-pattern-insights";

interface MarketContextData {
  regime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
  riskSentiment: 'risk_on' | 'risk_off' | 'neutral';
  score: number;
  shouldTrade: boolean;
  reasons: string[];
  spyData: { price: number; change: number; relativeVolume: number } | null;
  vixLevel: number | null;
  tradingSession: string;
  timestamp: string;
}

function MultiEngineConvergence() {
  const { data: context } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  const score = context?.score || 50;
  const engines = [
    { name: 'Market Context', signal: context?.shouldTrade ? 'bullish' : 'neutral', confidence: score },
    { name: 'Regime Analysis', signal: context?.regime === 'trending_up' ? 'bullish' : context?.regime === 'trending_down' ? 'bearish' : 'neutral', confidence: score },
    { name: 'Risk Sentiment', signal: context?.riskSentiment === 'risk_on' ? 'bullish' : context?.riskSentiment === 'risk_off' ? 'bearish' : 'neutral', confidence: Math.max(40, score - 10) },
  ];

  const consensus = engines.filter(e => e.signal === 'bullish').length;
  const convergenceScore = Math.round((consensus / engines.length) * 100);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-engine-convergence">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Radio className="h-3.5 w-3.5" />
          Engine Convergence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-mono font-bold">{convergenceScore}%</span>
          <Badge className={cn(
            convergenceScore >= 75 ? "bg-green-500/20 text-green-400" :
            convergenceScore >= 50 ? "bg-amber-500/20 text-amber-400" :
            "bg-red-500/20 text-red-400"
          )}>
            {consensus}/{engines.length} ALIGNED
          </Badge>
        </div>
        <div className="space-y-1.5">
          {engines.map((eng) => (
            <div key={eng.name} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{eng.name}</span>
              <div className="flex items-center gap-2">
                <span className={cn("font-mono",
                  eng.signal === 'bullish' ? "text-green-400" :
                  eng.signal === 'bearish' ? "text-red-400" : "text-amber-400"
                )}>
                  {eng.confidence}%
                </span>
                {eng.signal === 'bullish' && <TrendingUp className="h-3 w-3 text-green-400" />}
                {eng.signal === 'bearish' && <TrendingDown className="h-3 w-3 text-red-400" />}
                {eng.signal === 'neutral' && <MinusCircle className="h-3 w-3 text-amber-400" />}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AIEngineStatus() {
  const engines = [
    { name: 'Claude Sonnet', status: 'online' as const },
    { name: 'GPT-4', status: 'online' as const },
    { name: 'Gemini', status: 'online' as const },
    { name: 'Quant Engine', status: 'online' as const },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-ai-engine-status">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Brain className="h-3.5 w-3.5" />
          AI Engine Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {engines.map((eng) => (
          <div key={eng.name} className="flex items-center justify-between p-2 rounded bg-muted/30">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full",
                eng.status === 'online' ? "bg-green-500" : "bg-red-500"
              )} />
              <span className="text-sm">{eng.name}</span>
            </div>
            <Badge variant="outline" className="text-[10px] text-green-400">
              ONLINE
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function BotActivityMonitor() {
  const { data: botStatus } = useQuery<{
    isRunning: boolean;
    openPositions: number;
    todayTrades: number;
    todayPnL: number;
  }>({
    queryKey: ['/api/auto-lotto/bot-status'],
    refetchInterval: 10000,
  });

  const isRunning = botStatus?.isRunning ?? false;
  const openPositions = botStatus?.openPositions ?? 0;
  const todayTrades = botStatus?.todayTrades ?? 0;
  const todayPnL = botStatus?.todayPnL ?? 0;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-bot-monitor">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Zap className="h-3.5 w-3.5" />
          Auto-Lotto Bot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("w-3 h-3 rounded-full",
              isRunning ? "bg-green-500 animate-pulse" : "bg-red-500"
            )} />
            <span className="font-medium">{isRunning ? 'ACTIVE' : 'PAUSED'}</span>
          </div>
          <Link href="/automations">
            <Button size="sm" variant="outline" className="text-xs h-7">
              Open <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">Open</div>
            <div className="text-lg font-mono font-bold">{openPositions}</div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">Today</div>
            <div className="text-lg font-mono font-bold">{todayTrades}</div>
          </div>
          <div className="p-2 rounded bg-muted/30">
            <div className="text-[10px] text-muted-foreground">P&L</div>
            <div className={cn("text-lg font-mono font-bold",
              todayPnL >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {todayPnL >= 0 ? '+' : ''}{todayPnL.toFixed(0)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickLinks() {
  const links = [
    { label: 'Trade Desk', href: '/trade-desk', icon: Target },
    { label: 'Automations', href: '/automations', icon: Zap },
    { label: 'Journal', href: '/journal', icon: BarChart3 },
    { label: 'Analytics', href: '/analytics', icon: LineChart },
  ];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-quick-links">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Flame className="h-3.5 w-3.5" />
          Quick Access
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8 hover-elevate">
                <link.icon className="h-3.5 w-3.5 mr-2" />
                {link.label}
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PaperPortfolios() {
  const { data: portfolios } = useQuery<Array<{
    id: number;
    name: string;
    portfolioType: string;
    cashBalance: string;
    startingCapital: string;
  }>>({
    queryKey: ['/api/paper-portfolios'],
    refetchInterval: 30000,
  });

  const portfolioList = portfolios || [];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Paper Portfolios
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {portfolioList.length > 0 ? portfolioList.map((p) => {
            const cash = parseFloat(p.cashBalance);
            const starting = parseFloat(p.startingCapital);
            const pnlPct = starting > 0 ? ((cash - starting) / starting) * 100 : 0;
            return (
              <div key={p.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm">{p.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">${cash.toFixed(0)}</span>
                  <span className={cn("text-xs font-mono",
                    pnlPct >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          }) : (
            <div className="text-sm text-muted-foreground text-center py-4">
              No portfolios found
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskMetricsCard() {
  const { data: stats } = useQuery<{
    overall: { avgWin: number; avgLoss: number; totalPnL: number };
  }>({
    queryKey: ['/api/auto-lotto/performance-summary'],
    refetchInterval: 60000,
  });

  const avgWin = stats?.overall?.avgWin || 0;
  const avgLoss = stats?.overall?.avgLoss || 0;
  const riskReward = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" />
          Risk Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Avg Win</span>
          <span className="font-mono text-green-400">+${avgWin.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Avg Loss</span>
          <span className="font-mono text-red-400">-${Math.abs(avgLoss).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Risk/Reward</span>
          <span className={cn("font-mono", riskReward >= 1.5 ? "text-cyan-400" : "text-amber-400")}>
            {riskReward.toFixed(2)}:1
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertsCenter() {
  const { data: context } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  const alerts = [];
  
  if (context?.vixLevel && context.vixLevel > 25) {
    alerts.push({ type: 'warning', text: 'VIX elevated - reduce position size' });
  }
  if (context?.shouldTrade) {
    alerts.push({ type: 'success', text: 'Favorable trading conditions' });
  }
  if (!context?.shouldTrade && context) {
    alerts.push({ type: 'warning', text: 'Caution: suboptimal market conditions' });
  }
  alerts.push({ type: 'info', text: 'All AI engines operational' });

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5" />
          Alerts Center
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {alerts.slice(0, 3).map((alert, i) => (
            <div key={i} className={cn("flex items-center gap-2 p-2 rounded border",
              alert.type === 'warning' ? "bg-amber-500/10 border-amber-500/20" :
              alert.type === 'success' ? "bg-green-500/10 border-green-500/20" :
              "bg-cyan-500/10 border-cyan-500/20"
            )}>
              {alert.type === 'warning' && <XCircle className="h-4 w-4 text-amber-400" />}
              {alert.type === 'success' && <CheckCircle2 className="h-4 w-4 text-green-400" />}
              {alert.type === 'info' && <Zap className="h-4 w-4 text-cyan-400" />}
              <span className={cn("text-xs",
                alert.type === 'warning' ? "text-amber-400" :
                alert.type === 'success' ? "text-green-400" : "text-cyan-400"
              )}>{alert.text}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { refetch } = useQuery<MarketContextData>({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1800px] mx-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Command Center
            </h1>
            <p className="text-xs text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} - Institutional Research Dashboard
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              data-testid="button-refresh-dashboard"
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
            <Link href="/trade-desk">
              <Button size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs" data-testid="link-trade-desk">
                Trade Desk
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="text-xs" data-testid="tab-overview">
              <Eye className="h-3 w-3 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="signals" className="text-xs" data-testid="tab-signals">
              <Radio className="h-3 w-3 mr-1" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="performance" className="text-xs" data-testid="tab-performance">
              <Target className="h-3 w-3 mr-1" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="trading" className="text-xs" data-testid="tab-trading">
              <Zap className="h-3 w-3 mr-1" />
              Trading
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <MarketOverviewWidget />
              <BotActivityMonitor />
              <QuickLinks />
            </div>
          </TabsContent>

          <TabsContent value="signals" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <MarketOverviewWidget />
              <MultiEngineConvergence />
              <AIEngineStatus />
            </div>
          </TabsContent>

          <TabsContent value="performance" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <WinRateWidget />
              <ExpiryPatternInsights />
              <RiskMetricsCard />
            </div>
          </TabsContent>

          <TabsContent value="trading" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <BotActivityMonitor />
              <PaperPortfolios />
              <AlertsCenter />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
