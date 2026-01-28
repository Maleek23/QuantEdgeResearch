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
      <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm border", statusBg, status === "Open" ? "border-emerald-500/20" : "border-slate-700/50")}>
        <div className={cn("w-2 h-2 rounded-full", status === "Open" ? "bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/50" : "bg-slate-400")} />
        <span className={statusColor}>{status}</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 justify-center">
        {indices.map((index) => {
          const quote = marketData?.quotes?.[index.symbol];
          const change = quote?.regularMarketChangePercent || 0;
          return (
            <Link key={index.symbol} href={`/stock/${index.symbol}`}>
              <div className={cn(
                "flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer px-3 py-1.5 rounded-lg transition-all duration-200",
                "hover:bg-slate-800/50 hover:scale-105",
                change >= 0 ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-red-500/5 border border-red-500/10"
              )}>
                <span className="text-slate-400 font-medium">{index.name}</span>
                <span className={cn("font-bold tabular-nums", change >= 0 ? "text-emerald-400" : "text-red-400")}>
                  {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                </span>
              </div>
            </Link>
          );
        })}
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border",
          vix < 20 ? "bg-slate-800/50 border-slate-700/50" : "bg-amber-500/10 border-amber-500/20"
        )}>
          <span className="text-xs text-slate-400 font-medium">VIX</span>
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
          <Card className="cursor-pointer bg-slate-900/60 backdrop-blur-sm border-slate-800/50 hover:border-slate-600 hover:bg-slate-900/80 transition-all duration-300 group h-full overflow-hidden relative">
            {/* Hover glow effect */}
            <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br to-transparent", tool.bg.replace('bg-', 'from-'))} />
            <CardContent className="p-4 relative">
              <div className="flex items-start justify-between mb-2">
                <div className={cn("p-2.5 rounded-xl", tool.bg, "group-hover:scale-110 transition-transform duration-300")}>
                  <tool.icon className={cn("h-4 w-4", tool.color)} />
                </div>
                {tool.badge && (
                  <Badge className="text-[9px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">{tool.badge}</Badge>
                )}
              </div>
              <h3 className="text-sm font-semibold text-white mb-1 group-hover:text-cyan-50 transition-colors">{tool.title}</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed">{tool.description}</p>
              <ArrowRight className="w-4 h-4 text-slate-600 absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
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

// Free tier benefits - Premium Styling
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
    <div className="relative p-4 rounded-2xl bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-cyan-500/10">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <h3 className="text-sm font-semibold text-white">Free Research Tools</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {benefits.map((benefit, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors">
              <benefit.icon className="w-3 h-3 text-cyan-500/60" />
              <span>{benefit.text}</span>
            </div>
          ))}
        </div>
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

        {/* Hero Section - Search-Centric with Premium Styling */}
        <div className="py-10 md:py-16 text-center relative">
          {/* Ambient glow effects */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-20 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 mb-6 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-cyan-400 font-medium">AI-Powered Trading Intelligence</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4">
              <span className="text-white">Research.</span>{" "}
              <span className="bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 bg-clip-text text-transparent animate-gradient">Analyze.</span>{" "}
              <span className="text-white">Trade.</span>
            </h1>

            <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto">
              6 AI engines analyze stocks, options & crypto 24/7. Get research briefs with confidence scores, technical patterns, and smart money signals.
            </p>

            {/* Search - Premium Glassmorphism Style */}
            <div className="max-w-2xl mx-auto mb-8 relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 via-teal-500/10 to-purple-500/20 rounded-2xl blur-lg opacity-60" />
              <div className="relative">
                <GlobalSearch variant="large" placeholder="Search any stock, ETF, or crypto..." />
              </div>
            </div>
          </div>

          {/* Quick Action Cards - Premium Glassmorphism */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto mb-6">
            <Link href="/trade-desk">
              <div className="group relative p-4 rounded-xl backdrop-blur-md bg-slate-900/50 border border-cyan-500/30 hover:border-cyan-400/60 transition-all cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-cyan-500/10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Brain className="w-5 h-5 text-cyan-400" />
                  </div>
                  <span className="text-sm font-semibold text-white block">AI Trade Ideas</span>
                  <p className="text-[10px] text-slate-500 mt-1">6 engines, live signals</p>
                </div>
              </div>
            </Link>
            <Link href="/chart-analysis">
              <div className="group relative p-4 rounded-xl backdrop-blur-md bg-slate-900/50 border border-purple-500/30 hover:border-purple-400/60 transition-all cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-500/10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <LineChart className="w-5 h-5 text-purple-400" />
                  </div>
                  <span className="text-sm font-semibold text-white block">Charts</span>
                  <p className="text-[10px] text-slate-500 mt-1">Advanced technicals</p>
                </div>
              </div>
            </Link>
            <Link href="/discover">
              <div className="group relative p-4 rounded-xl backdrop-blur-md bg-slate-900/50 border border-emerald-500/30 hover:border-emerald-400/60 transition-all cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Target className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-sm font-semibold text-white block">Screener</span>
                  <p className="text-[10px] text-slate-500 mt-1">Filter & discover</p>
                </div>
              </div>
            </Link>
            <Link href="/smart-money">
              <div className="group relative p-4 rounded-xl backdrop-blur-md bg-slate-900/50 border border-amber-500/30 hover:border-amber-400/60 transition-all cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-500/10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Layers className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-sm font-semibold text-white block">Options Flow</span>
                  <p className="text-[10px] text-slate-500 mt-1">Smart money tracking</p>
                </div>
              </div>
            </Link>
          </div>

          {/* Popular Searches */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span>Trending:</span>
            {['NVDA', 'AAPL', 'TSLA', 'SPY', 'BTC', 'META'].map((symbol) => (
              <Link key={symbol} href={`/stock/${symbol}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-cyan-500/10 hover:border-cyan-500/50 hover:text-cyan-400 border-slate-700 text-slate-400 transition-colors">
                  {symbol}
                </Badge>
              </Link>
            ))}
          </div>
        </div>

        {/* Research Tools */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              All Tools
            </h2>
            <Link href="/features">
              <span className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
                See all <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <ResearchTools />
        </div>

        {/* Three column grid - Premium Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-800/50 hover:border-slate-700/50 transition-all duration-300">
            <LatestIdeas />
          </div>
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-800/50 hover:border-slate-700/50 transition-all duration-300">
            <TopMovers />
          </div>
          <div className="space-y-3">
            <FreeBenefits />
            {/* CTA with glow effect */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-teal-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-4 rounded-2xl bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 text-center">
                <p className="text-xs text-slate-400 mb-3">Ready to level up your research?</p>
                <Link href="/trade-desk">
                  <Button size="sm" className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-xs shadow-lg shadow-cyan-500/20">
                    <Brain className="w-3 h-3 mr-1" />
                    Explore AI Trade Ideas
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom stats - Platform Highlights with Premium Styling */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-8">
          {[
            { value: "6", label: "AI Engines", sublabel: "Analyzing 24/7", color: "from-cyan-400 to-teal-400", bgColor: "cyan", icon: Brain },
            { value: "5+", label: "FREE LLMs", sublabel: "Cross-validating", color: "from-purple-400 to-violet-400", bgColor: "purple", icon: Sparkles },
            { value: "100%", label: "Free Tools", sublabel: "No credit card", color: "from-emerald-400 to-green-400", bgColor: "emerald", icon: Zap },
            { value: "Live", label: "Real-time", sublabel: "Market data", color: "from-amber-400 to-orange-400", bgColor: "amber", icon: Activity },
          ].map((stat) => (
            <div key={stat.label} className="relative overflow-hidden text-center p-5 rounded-2xl bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 hover:border-slate-700 transition-all duration-300 group">
              {/* Top accent line */}
              <div className={cn("absolute top-0 left-0 right-0 h-1 bg-gradient-to-r", stat.color)} />
              {/* Hover glow */}
              <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300", `bg-${stat.bgColor}-500/5`)} />

              <div className="relative">
                <div className={cn("w-10 h-10 mx-auto mb-3 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300", `bg-${stat.bgColor}-500/10`)}>
                  <stat.icon className={cn("w-5 h-5", `text-${stat.bgColor}-400`)} />
                </div>
                <div className={cn("text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent", stat.color)}>{stat.value}</div>
                <div className="text-xs font-semibold text-white mt-1">{stat.label}</div>
                <div className="text-[10px] text-slate-500">{stat.sublabel}</div>
              </div>
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
