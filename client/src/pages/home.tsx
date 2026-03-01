import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ChevronRight,
  Brain,
  Target,
  Activity,
  Zap,
  Newspaper,
  LineChart,
  Layers,
  Globe,
  Search,
  Star,
  Sparkles,
  Eye,
  BarChart3,
  Cpu,
  Calendar,
  Clock,
  ExternalLink,
  AlertCircle,
  Bot,
  Radar,
  Users,
  Play,
  Flame,
  DollarSign,
  Sun,
} from "lucide-react";
import { GlobalSearch } from "@/components/global-search";
import { WSBTrendingCard } from "@/components/wsb-trending-card";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CrossAssetOverview, EconomicCalendarWidget, getAssetClass } from "@/components/market-intelligence";

// ── Morning Briefing Component ──
function MorningBriefing() {
  const { data, isLoading } = useQuery<{
    marketOutlook?: string;
    keyLevels?: { spy?: number; qqq?: number; vix?: number };
    topWatchlist?: Array<{ symbol: string; reason?: string }>;
    catalysts?: string[];
    tradingPlan?: string;
    timestamp?: string;
  }>({
    queryKey: ["/api/morning-briefing"],
    refetchInterval: 300000, // 5 min
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222]">
        <CardContent className="p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-48 bg-gray-200 dark:bg-slate-800 rounded" />
            <div className="h-4 w-full bg-gray-200 dark:bg-slate-800 rounded" />
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-slate-800 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.tradingPlan) return null;

  const outlookBadge = (outlook?: string) => {
    if (!outlook) return { icon: '⚪', color: 'bg-gray-100 dark:bg-slate-800 text-gray-500', label: 'Neutral' };
    const lower = outlook.toLowerCase();
    if (lower.includes('bullish') || lower.includes('positive')) return { icon: '🟢', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', label: 'Bullish' };
    if (lower.includes('bearish') || lower.includes('negative')) return { icon: '🔴', color: 'bg-red-500/10 text-red-600 dark:text-red-400', label: 'Bearish' };
    return { icon: '🟡', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', label: 'Cautious' };
  };

  const badge = outlookBadge(data.marketOutlook);

  return (
    <Card className="bg-gradient-to-r from-white via-white to-emerald-50/50 dark:from-[#111] dark:via-[#111] dark:to-emerald-950/20 border-gray-200 dark:border-[#222]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
              <Sun className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Morning Briefing</h3>
          </div>
          <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium border", badge.color)}>
            {badge.icon} {badge.label}
          </span>
        </div>

        {/* Key Levels */}
        {data.keyLevels && (data.keyLevels.spy || data.keyLevels.qqq || data.keyLevels.vix) && (
          <div className="flex gap-4 mb-3">
            {data.keyLevels.spy ? (
              <div className="text-xs">
                <span className="text-gray-500 dark:text-slate-500">SPY</span>{' '}
                <span className="font-mono font-medium text-gray-900 dark:text-white">${safeToFixed(data.keyLevels.spy, 0)}</span>
              </div>
            ) : null}
            {data.keyLevels.qqq ? (
              <div className="text-xs">
                <span className="text-gray-500 dark:text-slate-500">QQQ</span>{' '}
                <span className="font-mono font-medium text-gray-900 dark:text-white">${safeToFixed(data.keyLevels.qqq, 0)}</span>
              </div>
            ) : null}
            {data.keyLevels.vix ? (
              <div className="text-xs">
                <span className="text-gray-500 dark:text-slate-500">VIX</span>{' '}
                <span className="font-mono font-medium text-gray-900 dark:text-white">{safeToFixed(data.keyLevels.vix, 1)}</span>
              </div>
            ) : null}
          </div>
        )}

        {/* Trading Plan Summary */}
        <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-3 mb-3">
          {data.tradingPlan}
        </p>

        {/* Watchlist */}
        {data.topWatchlist && data.topWatchlist.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-gray-500 dark:text-slate-500 self-center">Watch:</span>
            {data.topWatchlist.slice(0, 5).map((item) => (
              <Link key={item.symbol} href={`/stock/${item.symbol}`}>
                <Badge variant="outline" className="cursor-pointer text-[10px] hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-500 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 transition-colors">
                  {item.symbol}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {/* Catalysts */}
        {data.catalysts && data.catalysts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.catalysts.slice(0, 3).map((catalyst, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {catalyst.length > 50 ? catalyst.slice(0, 50) + '...' : catalyst}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// CrossAssetOverview and EconomicCalendarWidget are imported from @/components/market-intelligence

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
  if (!isWeekend) {
    if (isMarketHours) status = "Open";
    else if (isPreMarket) status = "Pre-Market";
    else if (isAfterHours) status = "After Hours";
  }

  return { status, isOpen: isMarketHours && !isWeekend };
}

// Market Ticker Bar (same style as landing)
function MarketTicker() {
  const { data: marketData } = useQuery<{ quotes: Record<string, MarketQuote> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,DIA,IWM,VIX,BTC-USD,ETH-USD"],
    refetchInterval: 30000,
  });

  const { status, isOpen } = useMarketStatus();

  const indices = [
    { symbol: "SPY", name: "S&P 500" },
    { symbol: "QQQ", name: "Nasdaq" },
    { symbol: "DIA", name: "Dow" },
    { symbol: "IWM", name: "Russell" },
    { symbol: "VIX", name: "VIX" },
    { symbol: "BTC-USD", name: "Bitcoin" },
    { symbol: "ETH-USD", name: "Ethereum" },
  ];

  return (
    <div className="bg-gray-50 dark:bg-[#0a0a0a] border-b border-gray-200 dark:border-[#1a1a1a] overflow-hidden">
      <div className="flex items-center h-8">
        <div className="flex-shrink-0 flex items-center gap-1.5 px-4 border-r border-gray-200 dark:border-[#222] bg-gray-50 dark:bg-[#0a0a0a] z-10">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            isOpen ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
          )} />
          <span className={cn(
            "text-[11px] font-medium",
            isOpen ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"
          )}>{status}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee">
            {[...indices, ...indices].map((idx, i) => {
              const quote = marketData?.quotes?.[idx.symbol];
              const change = safeNumber(quote?.regularMarketChangePercent);
              return (
                <Link key={`${idx.symbol}-${i}`} href={`/stock/${idx.symbol}`}>
                  <div className="flex items-center gap-3 px-4 whitespace-nowrap cursor-pointer hover:bg-gray-100 dark:hover:bg-[#111] transition-colors">
                    <span className="text-[11px] font-medium text-gray-600 dark:text-slate-400">{idx.symbol}</span>
                    <span className={cn(
                      "text-[11px] font-mono",
                      change >= 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {change >= 0 ? "+" : ""}{safeToFixed(change, 2)}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Multi-Engine Visualization (matching landing page)
const tradingEngines = [
  { id: "ML", name: "Machine Learning", desc: "Pattern recognition", color: "#10b981", icon: Cpu },
  { id: "AI", name: "AI Analysis", desc: "Multi-layer AI", color: "#8b5cf6", icon: Brain },
  { id: "QNT", name: "Quantitative", desc: "Statistical signals", color: "#3b82f6", icon: BarChart3 },
  { id: "FLW", name: "Order Flow", desc: "Dark pools & institutions", color: "#f59e0b", icon: Activity },
  { id: "SNT", name: "Sentiment", desc: "News & social", color: "#ec4899", icon: Eye },
  { id: "TCH", name: "Technical", desc: "Chart patterns", color: "#06b6d4", icon: LineChart },
];

// Research Tools Grid
function ResearchTools() {
  const tools = [
    {
      title: "AI Trade Ideas",
      description: "Multi-engine convergence signals with confidence scores",
      icon: Brain,
      href: "/trade-desk",
      color: "emerald",
    },
    {
      title: "Technical Charts",
      description: "Advanced charting with 50+ indicators",
      icon: LineChart,
      href: "/chart-analysis",
      color: "purple",
    },
    {
      title: "Stock Screener",
      description: "Filter stocks by technicals & fundamentals",
      icon: Target,
      href: "/discover",
      color: "emerald",
    },
    {
      title: "Market News",
      description: "Real-time news with sentiment analysis",
      icon: Newspaper,
      href: "/market",
      color: "amber",
    },
    {
      title: "Options Flow",
      description: "Track unusual options activity & smart money",
      icon: Layers,
      href: "/smart-money",
      color: "pink",
    },
    {
      title: "Market Overview",
      description: "Sector heatmaps & market breadth",
      icon: Globe,
      href: "/market",
      color: "blue",
    },
  ];

  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "hover:border-emerald-500/30" },
    purple: { bg: "bg-purple-500/10", text: "text-purple-500", border: "hover:border-purple-500/30" },
    teal: { bg: "bg-teal-500/10", text: "text-teal-500", border: "hover:border-teal-500/30" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-500", border: "hover:border-amber-500/30" },
    pink: { bg: "bg-pink-500/10", text: "text-pink-500", border: "hover:border-pink-500/30" },
    blue: { bg: "bg-blue-500/10", text: "text-blue-500", border: "hover:border-blue-500/30" },
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {tools.map((tool) => {
        const colors = colorClasses[tool.color];
        return (
          <Link key={tool.title} href={tool.href}>
            <Card className={cn(
              "cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] transition-all duration-200",
              colors.border,
              "hover:shadow-lg hover:-translate-y-0.5"
            )}>
              <CardContent className="p-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", colors.bg)}>
                  <tool.icon className={cn("h-5 w-5", colors.text)} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{tool.title}</h3>
                <p className="text-xs text-gray-500 dark:text-slate-500">{tool.description}</p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

// Latest AI Ideas with asset class badges
function LatestIdeas() {
  const { data } = useQuery<{ setups: Array<{
    symbol: string;
    direction: string;
    confidenceScore: number;
    source: string;
    timestamp?: string;
  }> }>({
    queryKey: ["/api/trade-ideas/best-setups?limit=8"],
    refetchInterval: 60000,
  });

  const ideas = data?.setups?.slice(0, 8) || [];

  const getRelativeTime = (ts?: string) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Card className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Today's Ideas</h3>
          </div>
          <Link href="/trade-desk">
            <span className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer">
              View all <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
        <div className="space-y-2">
          {ideas.length > 0 ? ideas.map((idea, i) => {
            const isLong = idea.direction === "bullish" || idea.direction === "LONG" || idea.direction === "long";
            const asset = getAssetClass(idea.symbol);
            return (
              <Link key={i} href={`/stock/${idea.symbol}`}>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-[#0a0a0a] hover:bg-gray-100 dark:hover:bg-[#151515] border border-gray-100 dark:border-[#1a1a1a] transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                      isLong ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {idea.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">{idea.symbol}</span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          isLong ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {isLong ? "LONG" : "SHORT"}
                        </span>
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", asset.color)}>
                          {asset.label}
                        </span>
                      </div>
                      {idea.timestamp && (
                        <span className="text-[10px] text-gray-400 dark:text-slate-600">{getRelativeTime(idea.timestamp)}</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn(
                    "font-mono",
                    idea.confidenceScore >= 75 ? "border-emerald-500/30 text-emerald-500" :
                    idea.confidenceScore >= 60 ? "border-amber-500/30 text-amber-500" : "border-gray-300 dark:border-slate-600 text-gray-500 dark:text-slate-400"
                  )}>
                    {idea.confidenceScore}%
                  </Badge>
                </div>
              </Link>
            );
          }) : (
            <div className="text-sm text-gray-500 dark:text-slate-500 text-center py-8 bg-gray-50 dark:bg-[#0a0a0a] rounded-lg">
              No active ideas right now
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Breaking News Feed
function BreakingNews() {
  const { data, isLoading } = useQuery<{
    news: Array<{
      title: string;
      summary?: string;
      url: string;
      source: string;
      publishedAt: string;
      tickers?: string[];
      sentiment?: string;
    }>;
  }>({
    queryKey: ["/api/news?limit=6"],
    refetchInterval: 120000,
  });

  const news = data?.news?.slice(0, 6) || [];

  const getSentimentColor = (sentiment?: string) => {
    if (sentiment === 'bullish' || sentiment === 'positive') return 'text-emerald-500 bg-emerald-500/10';
    if (sentiment === 'bearish' || sentiment === 'negative') return 'text-red-500 bg-red-500/10';
    return 'text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-[#1a1a1a]';
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const published = new Date(date);
    const diffMs = now.getTime() - published.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <Card className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-orange-500" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Breaking News</h3>
          </div>
          <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-500">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1.5" />
            Live
          </Badge>
        </div>
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : news.length > 0 ? (
            news.map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 rounded-lg bg-gray-50 dark:bg-[#0a0a0a] hover:bg-gray-100 dark:hover:bg-[#151515] border border-gray-100 dark:border-[#1a1a1a] transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {article.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-500 dark:text-slate-500">{article.source}</span>
                      <span className="text-gray-300 dark:text-slate-600">·</span>
                      <span className="text-[10px] text-gray-500 dark:text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(article.publishedAt)}
                      </span>
                      {article.tickers && article.tickers.length > 0 && (
                        <>
                          <span className="text-gray-300 dark:text-slate-600">·</span>
                          <div className="flex gap-1">
                            {article.tickers.slice(0, 2).map((ticker) => (
                              <span key={ticker} className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                ${ticker}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-400 dark:text-slate-600 flex-shrink-0 group-hover:text-emerald-500 transition-colors" />
                </div>
              </a>
            ))
          ) : (
            <div className="text-sm text-gray-500 dark:text-slate-500 text-center py-8 bg-gray-50 dark:bg-[#0a0a0a] rounded-lg">
              No breaking news right now
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Upcoming Earnings Calendar
function EarningsCalendar() {
  const { data, isLoading } = useQuery<{
    earnings: Array<{
      symbol: string;
      company?: string;
      reportDate: string;
      fiscalQuarter?: string;
      estimatedEps?: number;
      time?: string;
    }>;
  }>({
    queryKey: ["/api/earnings/upcoming?days=7"],
    refetchInterval: 300000,
  });

  const earnings = data?.earnings?.slice(0, 8) || [];

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getTimeLabel = (time?: string) => {
    if (time === 'bmo' || time === 'BMO') return { label: 'Before Open', color: 'text-amber-500 bg-amber-500/10' };
    if (time === 'amc' || time === 'AMC') return { label: 'After Close', color: 'text-purple-500 bg-purple-500/10' };
    return { label: 'TBD', color: 'text-gray-500 bg-gray-100 dark:bg-[#1a1a1a]' };
  };

  return (
    <Card className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Earnings Calendar</h3>
          </div>
          <Link href="/market">
            <span className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer">
              Full calendar <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
        <div className="space-y-1.5">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : earnings.length > 0 ? (
            earnings.map((earning, i) => {
              const timeInfo = getTimeLabel(earning.time);
              return (
                <Link key={i} href={`/stock/${earning.symbol}`}>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-[#0a0a0a] hover:bg-gray-100 dark:hover:bg-[#151515] border border-gray-100 dark:border-[#1a1a1a] transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 flex items-center justify-center text-xs font-bold text-blue-500">
                        {earning.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white">{earning.symbol}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", timeInfo.color)}>
                            {timeInfo.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-slate-500">
                          {earning.company?.slice(0, 25)}{earning.company && earning.company.length > 25 ? '...' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-gray-900 dark:text-white">{formatDate(earning.reportDate)}</div>
                      {earning.estimatedEps && (
                        <div className="text-[10px] text-gray-500 dark:text-slate-500">
                          Est: ${safeToFixed(earning.estimatedEps, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="text-sm text-gray-500 dark:text-slate-500 text-center py-8 bg-gray-50 dark:bg-[#0a0a0a] rounded-lg flex flex-col items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              No upcoming earnings
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Market Movers
function TopMovers() {
  const { data } = useQuery<{
    topGainers: Array<{ symbol: string; name?: string; changePercent: number; percentChange?: number; price?: number }>;
    topLosers: Array<{ symbol: string; name?: string; changePercent: number; percentChange?: number; price?: number }>;
  }>({
    queryKey: ["/api/market-movers"],
    refetchInterval: 60000,
  });

  const gainers = data?.topGainers?.slice(0, 4) || [];
  const losers = data?.topLosers?.slice(0, 4) || [];

  return (
    <Card className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-purple-500" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Market Movers</h3>
          </div>
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5" />
            Live
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-emerald-500">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Top Gainers</span>
            </div>
            <div className="space-y-1.5">
              {gainers.map((stock) => (
                <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 transition-colors cursor-pointer">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">{stock.symbol}</span>
                    <span className="text-xs font-bold text-emerald-500">+{safeToFixed(stock.changePercent ?? stock.percentChange, 1)}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-red-500">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Top Losers</span>
            </div>
            <div className="space-y-1.5">
              {losers.map((stock) => (
                <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-colors cursor-pointer">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">{stock.symbol}</span>
                    <span className="text-xs font-bold text-red-500">{safeToFixed(stock.changePercent ?? stock.percentChange, 1)}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Trending Tickers with mini charts
function TrendingTickers() {
  const { data } = useQuery<{ topGainers: Array<{ symbol: string; name: string; price: number; changePercent: number }> }>({
    queryKey: ["/api/market-movers"],
    refetchInterval: 60000,
  });

  const tickers = data?.topGainers?.slice(0, 6) || [];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {tickers.map((ticker, idx) => {
        const isUp = ticker.changePercent >= 0;
        const chartData = Array.from({ length: 8 }, (_, i) => ({
          value: isUp ? 40 + i * 3 + Math.random() * 5 : 60 - i * 3 - Math.random() * 5,
        }));

        return (
          <Link key={ticker.symbol} href={`/stock/${ticker.symbol}`}>
            <Card className="cursor-pointer bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-gray-300 dark:hover:border-[#333] transition-all hover:shadow-md">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm text-gray-900 dark:text-white">{ticker.symbol}</span>
                  <span className={cn(
                    "text-xs font-mono font-medium",
                    isUp ? "text-emerald-500" : "text-red-500"
                  )}>
                    {isUp ? "+" : ""}{safeToFixed(ticker.changePercent, 2)}%
                  </span>
                </div>
                <div className="h-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id={`gradient-${ticker.symbol}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={isUp ? "#10b981" : "#ef4444"}
                        strokeWidth={1.5}
                        fill={`url(#gradient-${ticker.symbol})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-slate-500 truncate mt-1">{ticker.name}</p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] transition-colors">
      {/* Market Ticker */}
      <MarketTicker />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Morning Briefing — Top priority daily intelligence */}
        <section className="mb-6">
          <MorningBriefing />
        </section>

        {/* Cross-Asset Overview — Indices, Commodities, Bonds, Fear */}
        <section className="mb-8">
          <CrossAssetOverview />
        </section>

        {/* Hero Section */}
        <section className="text-center mb-12">
          {/* Social Proof - Clean stats only */}
          <div className="flex flex-wrap items-center justify-center gap-6 mb-6 text-sm">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Activity className="w-4 h-4 text-emerald-500" />
              <span className="text-gray-600 dark:text-slate-400">
                <strong className="text-emerald-600 dark:text-emerald-400">2,500+</strong> traders
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              ))}
              <span className="text-gray-600 dark:text-slate-400 ml-1">
                <strong className="text-amber-600 dark:text-amber-400">4.9</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              <Target className="w-4 h-4 text-cyan-500" />
              <span className="text-gray-600 dark:text-slate-400">
                <strong className="text-cyan-600 dark:text-cyan-400">89%</strong> accuracy
              </span>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Your AI Trading<br />
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">Research Hub</span>
          </h1>
          <p className="text-gray-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
            Multi-engine convergence analysis for every stock. Get institutional-grade research in seconds.
          </p>

          {/* Search */}
          <div className="max-w-2xl mx-auto mb-6">
            <GlobalSearch variant="large" placeholder="Search any stock, ETF, or crypto..." />
          </div>

          {/* Trending */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-slate-500">Trending:</span>
            {["NVDA", "AAPL", "TSLA", "SPY", "BTC", "META"].map((symbol) => (
              <Link key={symbol} href={`/stock/${symbol}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-500 border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 transition-colors">
                  {symbol}
                </Badge>
              </Link>
            ))}
          </div>
        </section>

        {/* Multi-Engine Section */}
        <section className="mb-12">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Multi-Engine Convergence</h2>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {tradingEngines.map((engine) => (
              <div key={engine.id} className="text-center p-4 rounded-xl bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222] hover:border-gray-300 dark:hover:border-[#333] transition-colors">
                <div
                  className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${engine.color}15` }}
                >
                  <engine.icon className="w-5 h-5" style={{ color: engine.color }} />
                </div>
                <div className="text-xs font-bold text-gray-900 dark:text-white">{engine.id}</div>
                <div className="text-[10px] text-gray-500 dark:text-slate-500 mt-0.5">{engine.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Trending Tickers + WSB Trending */}
        <section className="mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Trending Tickers - Takes 2 columns */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  Trending Now
                </h2>
                <Link href="/market">
                  <span className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer">
                    View all <ChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
              <TrendingTickers />
            </div>

            {/* WSB Trending - Takes 1 column */}
            <div>
              <WSBTrendingCard limit={5} className="h-full" />
            </div>
          </div>
        </section>

        {/* Research Tools */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Research Tools
            </h2>
            <Link href="/features">
              <span className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer">
                See all <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <ResearchTools />
        </section>

        {/* Market Scanners */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Radar className="w-5 h-5 text-purple-500" />
              Market Scanners
            </h2>
            <Link href="/market-scanner">
              <span className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer">
                Open Scanner <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/market-scanner">
              <Card className="cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-purple-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3">
                    <Search className="h-5 w-5 text-purple-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Market Scanner</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Sectors, surges & movers</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/bullish-trends">
              <Card className="cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-orange-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center mb-3">
                    <Flame className="h-5 w-5 text-orange-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Bullish Trends</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Momentum & breakouts</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/discover">
              <Card className="cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-cyan-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-3">
                    <Eye className="h-5 w-5 text-cyan-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Discover</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">News & trending stocks</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/smart-money">
              <Card className="cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-amber-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
                    <Users className="h-5 w-5 text-amber-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Smart Money</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Insiders & institutions</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* Automation & Bots */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-cyan-500" />
              Automation & Bots
            </h2>
            <Link href="/automations">
              <span className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer">
                View all <ChevronRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { name: "Auto-Lotto", desc: "High R:R options", href: "/automations", color: "cyan" },
              { name: "Futures Bot", desc: "ES, NQ, GC", href: "/automations", color: "green" },
              { name: "Crypto Bot", desc: "BTC, ETH, Alts", href: "/automations", color: "amber" },
              { name: "Swing Bot", desc: "Multi-day holds", href: "/automations", color: "purple" },
              { name: "Day Trade", desc: "Intraday signals", href: "/automations", color: "pink" },
            ].map((bot) => (
              <Link key={bot.name} href={bot.href}>
                <Card className={`cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-${bot.color}-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5`}>
                  <CardContent className="p-3 text-center">
                    <div className={`w-8 h-8 mx-auto rounded-lg bg-${bot.color}-500/10 flex items-center justify-center mb-2`}>
                      <Bot className={`h-4 w-4 text-${bot.color}-500`} />
                    </div>
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-white">{bot.name}</h3>
                    <p className="text-[10px] text-gray-500 dark:text-slate-500 mt-0.5">{bot.desc}</p>
                    <Badge variant="outline" className="mt-1.5 text-[8px] border-cyan-500/30 text-cyan-500">
                      Paper
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Performance & Learning */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" />
              Performance & Learning
            </h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/performance">
              <Card className="cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-emerald-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-3">
                    <BarChart3 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Performance</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Win rates & analytics</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/paper-trading">
              <Card className="cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-cyan-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-3">
                    <Play className="h-5 w-5 text-cyan-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Paper Trading</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Simulate & validate</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/learning">
              <Card className="cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-pink-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center mb-3">
                    <Sparkles className="h-5 w-5 text-pink-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">AI Learning</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Watch engines learn</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/historical-intelligence">
              <Card className="cursor-pointer h-full bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-blue-500/30 transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3">
                    <DollarSign className="h-5 w-5 text-blue-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Historical Intel</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Past trade patterns</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* Live Data Grid - News, Ideas, Earnings, Economic Cal, Movers */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Live Data Feed</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <BreakingNews />
            <LatestIdeas />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <EarningsCalendar />
            <EconomicCalendarWidget />
            <TopMovers />
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-12 px-6 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-500/20">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Ready to trade smarter?
          </h2>
          <p className="text-gray-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Get AI-powered trade ideas with entry, target, and stop levels.
          </p>
          <Link href="/trade-desk">
            <Button className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white px-8">
              <Brain className="w-4 h-4 mr-2" />
              View Trade Ideas
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </section>

        {/* Footer */}
        <footer className="text-center py-8 mt-8 border-t border-gray-200 dark:border-[#1a1a1a]">
          <p className="text-xs text-gray-500 dark:text-slate-500">
            Educational research platform for self-directed traders. Not financial advice.
          </p>
        </footer>
      </main>
    </div>
  );
}
