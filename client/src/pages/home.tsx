import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Zap,
  Newspaper,
  Shield,
  Flame,
  Search,
  LineChart,
  PieChart,
  BookOpen,
  Users,
  Sparkles,
  Eye,
  Calculator,
  Layers,
  Globe,
} from "lucide-react";
import { GlobalSearch } from "@/components/global-search";
import { AuroraBackground } from "@/components/aurora-background";
import { ParticleBackground } from "@/components/particle-background";

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

  const isWeekend = day === 0 || day === 6;
  const isMarketHours = timeInMinutes >= 570 && timeInMinutes < 960;
  const isPreMarket = timeInMinutes >= 240 && timeInMinutes < 570;
  const isAfterHours = timeInMinutes >= 960 && timeInMinutes < 1200;

  let status = "Closed";
  let statusColor = "text-slate-500";
  let statusBg = "bg-slate-500/10";
  if (!isWeekend) {
    if (isMarketHours) {
      status = "Open";
      statusColor = "text-emerald-400";
      statusBg = "bg-emerald-500/10";
    } else if (isPreMarket) {
      status = "Pre-Market";
      statusColor = "text-amber-400";
      statusBg = "bg-amber-500/10";
    } else if (isAfterHours) {
      status = "After Hours";
      statusColor = "text-amber-400";
      statusBg = "bg-amber-500/10";
    }
  }

  return { status, statusColor, statusBg, isOpen: isMarketHours && !isWeekend };
}

// Compact Market Ticker
function MarketTicker() {
  const { data: marketData } = useQuery<{ quotes: Record<string, MarketQuote> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,DIA,IWM,VIX"],
    refetchInterval: 30000,
  });

  const { status, statusColor, statusBg } = useMarketStatus();

  const vix = marketData?.quotes?.VIX?.regularMarketPrice || 0;
  const vixColor = vix < 15 ? "text-emerald-400" : vix < 20 ? "text-cyan-400" : vix < 30 ? "text-amber-400" : "text-red-400";

  const indices = [
    { symbol: "SPY", name: "S&P" },
    { symbol: "QQQ", name: "Nasdaq" },
    { symbol: "DIA", name: "Dow" },
    { symbol: "IWM", name: "Russell" },
  ];

  return (
    <div className="flex items-center justify-between gap-4">
      <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", statusBg)}>
        <div className={cn("w-1.5 h-1.5 rounded-full", status === "Open" ? "bg-emerald-400 animate-pulse" : "bg-slate-400")} />
        <span className={statusColor}>{status}</span>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar flex-1 justify-center">
        {indices.map((index) => {
          const quote = marketData?.quotes?.[index.symbol];
          const change = quote?.regularMarketChangePercent || 0;
          return (
            <Link key={index.symbol} href={`/stock/${index.symbol}`}>
              <div className="flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer hover:bg-slate-800/30 px-2 py-1 rounded transition-colors">
                <span className="text-slate-500">{index.name}</span>
                <span className={cn("font-semibold tabular-nums", change >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                </span>
              </div>
            </Link>
          );
        })}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/30">
          <span className="text-xs text-slate-500">VIX</span>
          <span className={cn("text-xs font-bold tabular-nums", vixColor)}>{vix.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

// Research Tools Grid - What the platform offers
function ResearchTools() {
  const tools = [
    {
      title: "AI Trade Ideas",
      description: "6-engine signal analysis with confidence scores",
      icon: Brain,
      href: "/trade-desk",
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      badge: "Popular",
    },
    {
      title: "Technical Charts",
      description: "Advanced charting with indicators & patterns",
      icon: LineChart,
      href: "/chart-analysis",
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
    {
      title: "Stock Screener",
      description: "Filter stocks by technicals & fundamentals",
      icon: Target,
      href: "/discover",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      title: "Market News",
      description: "Real-time news with sentiment analysis",
      icon: Newspaper,
      href: "/market",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      title: "Options Flow",
      description: "Track unusual options activity",
      icon: Layers,
      href: "/smart-money",
      color: "text-pink-400",
      bg: "bg-pink-500/10",
    },
    {
      title: "Market Overview",
      description: "Live market data & sector analysis",
      icon: Globe,
      href: "/market",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {tools.map((tool) => (
        <Link key={tool.title} href={tool.href}>
          <Card className="cursor-pointer bg-slate-900/40 border-slate-700/40 hover:border-slate-600 transition-all group h-full">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className={cn("p-2 rounded-lg", tool.bg)}>
                  <tool.icon className={cn("h-4 w-4", tool.color)} />
                </div>
                {tool.badge && (
                  <Badge className="text-[9px] bg-cyan-500/20 text-cyan-400 border-0">{tool.badge}</Badge>
                )}
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">{tool.title}</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">{tool.description}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

// Who it's for section
function TraderTypes() {
  const types = [
    {
      title: "Day Traders",
      description: "Real-time signals, momentum plays, quick analysis",
      icon: Zap,
      color: "text-amber-400",
    },
    {
      title: "Swing Traders",
      description: "Multi-day setups, technical patterns, entry/exit levels",
      icon: TrendingUp,
      color: "text-emerald-400",
    },
    {
      title: "Options Traders",
      description: "Flow analysis, unusual activity, Greeks",
      icon: Layers,
      color: "text-purple-400",
    },
    {
      title: "Investors",
      description: "Fundamental research, long-term analysis",
      icon: PieChart,
      color: "text-blue-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {types.map((type) => (
        <div key={type.title} className="text-center p-4 rounded-lg bg-slate-800/30 border border-slate-700/30">
          <type.icon className={cn("h-5 w-5 mx-auto mb-2", type.color)} />
          <h4 className="text-sm font-semibold text-white mb-1">{type.title}</h4>
          <p className="text-[10px] text-slate-500">{type.description}</p>
        </div>
      ))}
    </div>
  );
}

// Latest AI Ideas - Compact
function LatestIdeas() {
  const { data } = useQuery<{ setups: Array<{
    symbol: string;
    direction: string;
    confidenceScore: number;
    source: string;
  }> }>({
    queryKey: ["/api/trade-ideas/best-setups?limit=5"],
    refetchInterval: 60000,
  });

  const ideas = data?.setups?.slice(0, 4) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Latest AI Ideas</h3>
        </div>
        <Link href="/trade-desk">
          <span className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
            View all <ChevronRight className="h-3 w-3" />
          </span>
        </Link>
      </div>
      <div className="space-y-2">
        {ideas.length > 0 ? ideas.map((idea, i) => {
          const isLong = idea.direction === "bullish" || idea.direction === "LONG" || idea.direction === "long";
          return (
            <Link key={i} href={`/stock/${idea.symbol}`}>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/30 transition-all cursor-pointer">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-7 h-7 rounded flex items-center justify-center font-bold text-[10px]",
                    isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                  )}>
                    {idea.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <span className="font-semibold text-white text-sm">{idea.symbol}</span>
                    <span className={cn(
                      "ml-2 text-[10px] px-1.5 py-0.5 rounded",
                      isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                    )}>
                      {isLong ? '↑' : '↓'}
                    </span>
                  </div>
                </div>
                <span className={cn(
                  "text-sm font-bold",
                  idea.confidenceScore >= 75 ? "text-emerald-400" :
                  idea.confidenceScore >= 60 ? "text-amber-400" : "text-slate-400"
                )}>
                  {idea.confidenceScore}%
                </span>
              </div>
            </Link>
          );
        }) : (
          <div className="text-xs text-slate-500 text-center py-6 bg-slate-800/20 rounded-lg">
            No active ideas right now
          </div>
        )}
      </div>
    </div>
  );
}

// Market Movers - Compact
function TopMovers() {
  const { data } = useQuery<{
    topGainers: Array<{ symbol: string; percentChange: number }>;
    topLosers: Array<{ symbol: string; percentChange: number }>;
  }>({
    queryKey: ["/api/market-movers"],
    refetchInterval: 60000,
  });

  const gainers = data?.topGainers?.slice(0, 3) || [];
  const losers = data?.topLosers?.slice(0, 3) || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Market Movers</h3>
        </div>
        <Badge variant="outline" className="text-[9px] border-slate-700/50 text-slate-400">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
          Live
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <h4 className="text-[10px] text-emerald-400 flex items-center gap-1 px-1">
            <TrendingUp className="h-3 w-3" /> Gainers
          </h4>
          {gainers.length > 0 ? gainers.map((stock) => (
            <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
              <div className="flex items-center justify-between p-2 rounded bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 transition-all cursor-pointer">
                <span className="text-xs font-semibold text-white">{stock.symbol}</span>
                <span className="text-xs font-bold text-emerald-400">+{stock.percentChange?.toFixed(1)}%</span>
              </div>
            </Link>
          )) : (
            <div className="h-20 rounded bg-slate-800/30 animate-pulse" />
          )}
        </div>
        <div className="space-y-1.5">
          <h4 className="text-[10px] text-red-400 flex items-center gap-1 px-1">
            <TrendingDown className="h-3 w-3" /> Losers
          </h4>
          {losers.length > 0 ? losers.map((stock) => (
            <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
              <div className="flex items-center justify-between p-2 rounded bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-all cursor-pointer">
                <span className="text-xs font-semibold text-white">{stock.symbol}</span>
                <span className="text-xs font-bold text-red-400">{stock.percentChange?.toFixed(1)}%</span>
              </div>
            </Link>
          )) : (
            <div className="h-20 rounded bg-slate-800/30 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

// Free tier benefits
function FreeBenefits() {
  const benefits = [
    { icon: Search, text: "Unlimited stock research" },
    { icon: LineChart, text: "Real-time charts & data" },
    { icon: Brain, text: "AI-powered analysis" },
    { icon: Newspaper, text: "Market news & alerts" },
    { icon: Globe, text: "Stocks, ETFs, crypto" },
    { icon: BookOpen, text: "Educational resources" },
  ];

  return (
    <div className="p-4 rounded-xl bg-gradient-to-br from-cyan-500/5 to-purple-500/5 border border-slate-700/40">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-white">Free Research Tools</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {benefits.map((benefit, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
            <benefit.icon className="w-3 h-3 text-slate-500" />
            <span>{benefit.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 relative">
      <AuroraBackground />
      <div className="fixed inset-0 pointer-events-none z-[1]">
        <ParticleBackground />
      </div>
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-900/90 pointer-events-none z-[2]" />

      <div className="relative z-[10] max-w-6xl mx-auto px-4 sm:px-6">
        {/* Market ticker */}
        <div className="py-2.5 border-b border-slate-800/50">
          <MarketTicker />
        </div>

        {/* Hero Section */}
        <div className="py-8 md:py-12 text-center">
          <Badge className="bg-slate-800/50 text-slate-300 border-slate-700/50 mb-4">
            <Globe className="w-3 h-3 mr-1" />
            Free Trading Research Platform
          </Badge>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-3">
            <span className="text-white">Research Any Stock.</span>
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Make Smarter Decisions.</span>
          </h1>

          <p className="text-base text-slate-400 mb-6 max-w-lg mx-auto">
            AI-powered analysis, real-time data, and professional tools — all free for traders of any level.
          </p>

          {/* Search */}
          <div className="max-w-xl mx-auto mb-6">
            <GlobalSearch variant="large" placeholder="Search any stock, ETF, or crypto..." />
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span>Popular:</span>
            {['AAPL', 'NVDA', 'TSLA', 'SPY', 'BTC'].map((symbol) => (
              <Link key={symbol} href={`/stock/${symbol}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-slate-800 border-slate-700 text-slate-400">
                  {symbol}
                </Badge>
              </Link>
            ))}
          </div>
        </div>

        {/* Research Tools */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-400" />
              Research Tools
            </h2>
            <Link href="/features">
              <span className="text-xs text-slate-500 hover:text-slate-400 cursor-pointer">See all features →</span>
            </Link>
          </div>
          <ResearchTools />
        </div>

        {/* Three column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-700/40">
            <LatestIdeas />
          </div>
          <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-700/40">
            <TopMovers />
          </div>
          <div>
            <FreeBenefits />
            {/* CTA */}
            <div className="mt-3 p-4 rounded-xl bg-slate-900/40 border border-slate-700/40 text-center">
              <p className="text-xs text-slate-400 mb-3">Ready to level up your research?</p>
              <Link href="/trade-desk">
                <Button size="sm" className="w-full bg-cyan-600 hover:bg-cyan-500 text-xs">
                  <Brain className="w-3 h-3 mr-1" />
                  Explore AI Trade Ideas
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="grid grid-cols-4 gap-2 pb-8">
          {[
            { value: "6", label: "AI Engines", color: "text-cyan-400" },
            { value: "24/7", label: "Analysis", color: "text-emerald-400" },
            { value: "100%", label: "Free Tools", color: "text-purple-400" },
            { value: "∞", label: "Research", color: "text-amber-400" },
          ].map((stat) => (
            <div key={stat.label} className="text-center p-3 rounded-lg bg-slate-800/20 border border-slate-700/20">
              <div className={cn("text-lg font-bold", stat.color)}>{stat.value}</div>
              <div className="text-[9px] text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center pb-6 border-t border-slate-800/50 pt-6">
          <p className="text-[10px] text-slate-600">
            Educational research platform for self-directed traders. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
