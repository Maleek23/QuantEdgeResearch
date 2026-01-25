import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Zap,
  Target,
  ArrowRight,
  Wallet,
  BarChart3,
  Brain,
  Bot,
  LineChart,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

import { MarketTickerBar } from "@/components/market-ticker-bar";
import { AssetHeroCards } from "@/components/asset-hero-cards";
import { VixFearGauge } from "@/components/vix-fear-gauge";
import { LiveNewsFeed } from "@/components/live-news-feed";
import { TopMoversPanel } from "@/components/top-movers-panel";
import { EarningsCalendarPanel } from "@/components/earnings-calendar-panel";
import { WatchlistQuickView } from "@/components/watchlist-quick-view";

interface MarketQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

function MarketIndicesRow() {
  const { data: marketData } = useQuery<{ quotes: Record<string, MarketQuote> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,DIA,IWM"],
    refetchInterval: 30000,
  });

  const indices = [
    { symbol: "SPY", name: "S&P 500", data: marketData?.quotes?.SPY },
    { symbol: "QQQ", name: "Nasdaq 100", data: marketData?.quotes?.QQQ },
    { symbol: "DIA", name: "Dow Jones", data: marketData?.quotes?.DIA },
    { symbol: "IWM", name: "Russell 2000", data: marketData?.quotes?.IWM },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {indices.map((index) => (
        <Link key={index.symbol} href={`/chart-analysis?symbol=${index.symbol}`}>
          <Card className="cursor-pointer hover:border-primary/50 transition-all" data-testid={`index-${index.symbol}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{index.name}</span>
                <span className="text-xs font-medium text-foreground">{index.symbol}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-foreground">
                  ${(index.data?.regularMarketPrice || 0).toFixed(2)}
                </span>
                <div className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  (index.data?.regularMarketChange || 0) >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {(index.data?.regularMarketChange || 0) >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>
                    {(index.data?.regularMarketChange || 0) >= 0 ? "+" : ""}
                    {(index.data?.regularMarketChangePercent || 0).toFixed(2)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function QuickAccessTools() {
  const tools = [
    { label: "Market Scanner", href: "/market-scanner", icon: Activity, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Chart Analysis", href: "/chart-analysis", icon: LineChart, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "AI Advisor", href: "/smart-advisor", icon: Sparkles, color: "text-purple-500", bg: "bg-purple-500/10" },
    { label: "Paper Trading", href: "/paper-trading", icon: Bot, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <Card data-testid="quick-tools">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Quick Access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {tools.map((tool) => (
          <Link key={tool.label} href={tool.href}>
            <div 
              className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              data-testid={`tool-${tool.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className={cn("p-1.5 rounded-md", tool.bg)}>
                <tool.icon className={cn("h-4 w-4", tool.color)} />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">{tool.label}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function LiveBotStatus() {
  const { data: botStatus } = useQuery<{ bots: { name: string; status: string; lastRun?: string }[] }>({
    queryKey: ["/api/automations/status"],
    refetchInterval: 60000,
  });

  const bots = botStatus?.bots?.slice(0, 4) || [
    { name: "Options Bot", status: "active" },
    { name: "Crypto Bot", status: "active" },
    { name: "Lotto Scanner", status: "active" },
    { name: "Surge Detector", status: "active" },
  ];

  return (
    <Card data-testid="bot-status">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          Active Bots
        </CardTitle>
        <Link href="/automations">
          <span className="text-xs text-primary hover:underline cursor-pointer">Manage</span>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {bots.map((bot) => (
            <div 
              key={bot.name}
              className="flex items-center justify-between py-1.5"
              data-testid={`bot-${bot.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span className="text-sm text-foreground">{bot.name}</span>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px]",
                  bot.status === "active" 
                    ? "text-green-500 bg-green-500/10 border-green-500/30" 
                    : "text-muted-foreground"
                )}
              >
                {bot.status === "active" ? "Running" : "Idle"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-6">
      <MarketTickerBar />
      
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Market Dashboard</h1>
          <p className="text-muted-foreground mt-1">Live market data, news, and trading intelligence</p>
        </div>

        <AssetHeroCards />

        <MarketIndicesRow />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TopMoversPanel />
              <LiveNewsFeed />
            </div>
          </div>

          <div className="space-y-6">
            <VixFearGauge />
            <EarningsCalendarPanel />
            <QuickAccessTools />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WatchlistQuickView />
          <LiveBotStatus />
        </div>
      </div>
    </div>
  );
}
