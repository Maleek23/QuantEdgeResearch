import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, Zap, RefreshCw, Target, LineChart, ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Link } from "wouter";
import { MarketOverviewWidget } from "@/components/market-overview-widget";
import { WinRateWidget } from "@/components/win-rate-widget";
import { ExpiryPatternInsights } from "@/components/expiry-pattern-insights";
import { IVRankWidget } from "@/components/iv-rank-widget";

function BotActivityMonitor() {
  const { data: botStatus } = useQuery<{
    isRunning: boolean;
    openPositions: number;
    todayTrades: number;
    todayPnL: number;
    marketStatus: string;
  }>({
    queryKey: ['/api/auto-lotto/bot-status'],
    refetchInterval: 10000,
  });

  const isMarketOpen = botStatus?.isRunning ?? false;
  const openPositions = botStatus?.openPositions ?? 0;
  const todayTrades = botStatus?.todayTrades ?? 0;
  const todayPnL = botStatus?.todayPnL ?? 0;
  const marketStatus = botStatus?.marketStatus ?? 'unknown';
  
  const getStatusDisplay = () => {
    if (isMarketOpen) {
      return { label: 'SCANNING', color: 'bg-green-500 animate-pulse', textColor: 'text-green-400' };
    }
    return { label: 'MARKET CLOSED', color: 'bg-amber-500', textColor: 'text-amber-400' };
  };
  
  const status = getStatusDisplay();

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
            <div className={cn("w-3 h-3 rounded-full", status.color)} />
            <span className={cn("font-medium text-sm", status.textColor)}>{status.label}</span>
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
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
    id: string;
    name: string;
    cashBalance: number;
    startingCapital: number;
    totalValue: number;
    totalPnL: number;
    totalPnLPercent: number;
  }>>({
    queryKey: ['/api/paper-portfolios'],
    refetchInterval: 30000,
  });

  const portfolioList = portfolios || [];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-paper-portfolios">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Paper Portfolios
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {portfolioList.length > 0 ? portfolioList.map((p) => {
            const totalValue = typeof p.totalValue === 'number' ? p.totalValue : parseFloat(String(p.totalValue)) || 0;
            const starting = typeof p.startingCapital === 'number' ? p.startingCapital : parseFloat(String(p.startingCapital)) || 0;
            const pnlPct = typeof p.totalPnLPercent === 'number' ? p.totalPnLPercent : (starting > 0 ? ((totalValue - starting) / starting) * 100 : 0);
            return (
              <div key={p.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <span className="text-sm">{p.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono">${totalValue.toFixed(0)}</span>
                  <Badge variant="outline" className={cn("text-xs",
                    pnlPct >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                  </Badge>
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

export default function Dashboard() {
  const { refetch } = useQuery({
    queryKey: ['/api/market-context'],
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MarketOverviewWidget />
          <WinRateWidget />
          <BotActivityMonitor />
          <PaperPortfolios />
          <IVRankWidget />
          <QuickLinks />
        </div>
      </div>
    </div>
  );
}
