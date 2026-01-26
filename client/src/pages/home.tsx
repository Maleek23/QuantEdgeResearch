import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ChevronRight,
  BarChart2,
  Brain,
  Target,
  Activity,
  Clock,
} from "lucide-react";
import { GlobalSearch } from "@/components/global-search";
import { AuroraBackground } from "@/components/aurora-background";

interface MarketQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

// Check if US market is open
function useMarketStatus() {
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = etTime.getDay();
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // Market hours: 9:30 AM - 4:00 PM ET, Mon-Fri
  const isWeekend = day === 0 || day === 6;
  const isMarketHours = timeInMinutes >= 570 && timeInMinutes < 960; // 9:30 = 570, 16:00 = 960
  const isPreMarket = timeInMinutes >= 240 && timeInMinutes < 570; // 4:00 AM - 9:30 AM
  const isAfterHours = timeInMinutes >= 960 && timeInMinutes < 1200; // 4:00 PM - 8:00 PM

  let status = "Closed";
  let statusColor = "text-slate-500";
  if (!isWeekend) {
    if (isMarketHours) {
      status = "Open";
      statusColor = "text-emerald-400";
    } else if (isPreMarket) {
      status = "Pre-Market";
      statusColor = "text-amber-400";
    } else if (isAfterHours) {
      status = "After Hours";
      statusColor = "text-amber-400";
    }
  }

  return { status, statusColor, isOpen: isMarketHours && !isWeekend };
}

// Compact market ticker
function MarketTicker() {
  const { data: marketData } = useQuery<{ quotes: Record<string, MarketQuote> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,DIA,IWM,VIX"],
    refetchInterval: 30000,
  });

  const { status, statusColor } = useMarketStatus();

  const indices = [
    { symbol: "SPY", name: "S&P 500" },
    { symbol: "QQQ", name: "Nasdaq" },
    { symbol: "DIA", name: "Dow" },
    { symbol: "IWM", name: "Russell" },
  ];

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
        {indices.map((index) => {
          const quote = marketData?.quotes?.[index.symbol];
          const change = quote?.regularMarketChangePercent || 0;

          return (
            <Link key={index.symbol} href={`/chart-analysis?symbol=${index.symbol}`}>
              <div className="flex items-center gap-2 text-sm whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity">
                <span className="text-slate-500">{index.name}</span>
                <span className={cn(
                  "font-semibold",
                  change >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-3 w-3 text-slate-500" />
        <span className={statusColor}>{status}</span>
      </div>
    </div>
  );
}

// Latest AI trade ideas
function LatestIdeas() {
  const { data } = useQuery<{ ideas: Array<{
    symbol: string;
    direction: string;
    confidenceScore: number;
    source: string;
    createdAt: string;
  }> }>({
    queryKey: ["/api/trade-ideas?limit=5&status=active"],
    refetchInterval: 60000,
  });

  const ideas = data?.ideas?.slice(0, 5) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Latest AI Ideas</h3>
        <Link href="/trade-desk">
          <span className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
            View all <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      </div>
      <div className="space-y-2">
        {ideas.length > 0 ? ideas.map((idea, i) => (
          <Link key={i} href={`/chart-analysis?symbol=${idea.symbol}`}>
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 border border-slate-800/50 hover:border-slate-700/50 transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  idea.direction === "bullish" ? "bg-emerald-400" : "bg-red-400"
                )} />
                <span className="font-semibold text-slate-200">{idea.symbol}</span>
                <span className="text-xs text-slate-500 capitalize">{idea.direction}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-medium",
                  idea.confidenceScore >= 70 ? "text-emerald-400" :
                  idea.confidenceScore >= 50 ? "text-amber-400" : "text-slate-500"
                )}>
                  {idea.confidenceScore}%
                </span>
                <ArrowRight className="h-4 w-4 text-slate-600" />
              </div>
            </div>
          </Link>
        )) : (
          <div className="text-sm text-slate-500 text-center py-4">No active ideas</div>
        )}
      </div>
    </div>
  );
}

// Top movers
function TopMovers() {
  const { data } = useQuery<{
    gainers: Array<{ symbol: string; change: number; price: number }>;
    losers: Array<{ symbol: string; change: number; price: number }>;
  }>({
    queryKey: ["/api/market/top-movers"],
    refetchInterval: 60000,
  });

  const gainers = data?.gainers?.slice(0, 4) || [];
  const losers = data?.losers?.slice(0, 4) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Market Movers</h3>
        <Badge variant="outline" className="text-xs border-slate-700 text-slate-500">
          <Activity className="w-3 h-3 mr-1" />
          Live
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs text-emerald-400 mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" /> Gainers
          </h4>
          <div className="space-y-2">
            {gainers.length > 0 ? gainers.map((stock) => (
              <Link key={stock.symbol} href={`/chart-analysis?symbol=${stock.symbol}`}>
                <div className="flex items-center justify-between p-2 rounded bg-slate-900/30 hover:bg-slate-900/50 transition-colors cursor-pointer">
                  <span className="text-sm font-medium text-slate-300">{stock.symbol}</span>
                  <span className="text-sm font-semibold text-emerald-400">+{stock.change?.toFixed(1)}%</span>
                </div>
              </Link>
            )) : (
              <div className="text-xs text-slate-600">Loading...</div>
            )}
          </div>
        </div>
        <div>
          <h4 className="text-xs text-red-400 mb-3 flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3" /> Losers
          </h4>
          <div className="space-y-2">
            {losers.length > 0 ? losers.map((stock) => (
              <Link key={stock.symbol} href={`/chart-analysis?symbol=${stock.symbol}`}>
                <div className="flex items-center justify-between p-2 rounded bg-slate-900/30 hover:bg-slate-900/50 transition-colors cursor-pointer">
                  <span className="text-sm font-medium text-slate-300">{stock.symbol}</span>
                  <span className="text-sm font-semibold text-red-400">{stock.change?.toFixed(1)}%</span>
                </div>
              </Link>
            )) : (
              <div className="text-xs text-slate-600">Loading...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Navigation cards
function NavCards() {
  const cards = [
    {
      title: "Trade Ideas",
      description: "AI-powered signals",
      icon: Brain,
      href: "/trade-desk",
      accent: "text-cyan-400",
    },
    {
      title: "Charts",
      description: "Technical analysis",
      icon: BarChart2,
      href: "/chart-analysis",
      accent: "text-purple-400",
    },
    {
      title: "Discover",
      description: "Stock screener",
      icon: Target,
      href: "/discover",
      accent: "text-emerald-400",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <Link key={card.title} href={card.href}>
          <Card className="cursor-pointer bg-slate-900/40 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/60 transition-all group h-full">
            <CardContent className="p-4">
              <card.icon className={cn("h-5 w-5 mb-2", card.accent)} />
              <h3 className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                {card.title}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{card.description}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <AuroraBackground />
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/80 pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto px-6">
        {/* Market ticker */}
        <div className="py-4 border-b border-slate-800/50">
          <MarketTicker />
        </div>

        {/* Hero */}
        <div className="py-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight">
            QuantEdge
          </h1>
          <p className="text-lg text-slate-400 mb-8">
            AI-Powered Trading Intelligence
          </p>

          {/* Single consolidated search */}
          <div className="max-w-xl mx-auto">
            <GlobalSearch variant="large" placeholder="Search any stock, crypto, or ETF..." />
          </div>
        </div>

        {/* Nav cards */}
        <div className="mb-10">
          <NavCards />
        </div>

        {/* Two column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
          <div className="bg-slate-900/30 rounded-xl p-5 border border-slate-800/50">
            <LatestIdeas />
          </div>
          <div className="bg-slate-900/30 rounded-xl p-5 border border-slate-800/50">
            <TopMovers />
          </div>
        </div>
      </div>
    </div>
  );
}
