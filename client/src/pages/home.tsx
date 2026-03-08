import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Brain,
  Activity,
  Newspaper,
  Calendar,
  Clock,
  ExternalLink,
  AlertCircle,
  Sun,
} from "lucide-react";
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
    refetchInterval: 300000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="bg-[#111] border-[#222]">
        <CardContent className="p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-48 bg-slate-800 rounded" />
            <div className="h-4 w-full bg-slate-800 rounded" />
            <div className="h-4 w-3/4 bg-slate-800 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.tradingPlan) return null;

  const outlookBadge = (outlook?: string) => {
    if (!outlook) return { dotColor: 'bg-zinc-500', color: 'bg-slate-800 text-slate-400', label: 'Neutral' };
    const lower = outlook.toLowerCase();
    if (lower.includes('bullish') || lower.includes('positive')) return { dotColor: 'bg-emerald-500', color: 'bg-emerald-500/10 text-emerald-400', label: 'Bullish' };
    if (lower.includes('bearish') || lower.includes('negative')) return { dotColor: 'bg-red-500', color: 'bg-red-500/10 text-red-400', label: 'Bearish' };
    return { dotColor: 'bg-amber-500', color: 'bg-amber-500/10 text-amber-400', label: 'Cautious' };
  };

  const badge = outlookBadge(data.marketOutlook);

  return (
    <Card className="bg-[#111] border-[#222]">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Sun className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-white">Morning Briefing</h3>
          </div>
          <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium border inline-flex items-center gap-1.5", badge.color)}>
            <span className={cn("w-2 h-2 rounded-full inline-block", badge.dotColor)} />
            {badge.label}
          </span>
        </div>

        {data.keyLevels && (data.keyLevels.spy || data.keyLevels.qqq || data.keyLevels.vix) && (
          <div className="flex gap-4 mb-3">
            {data.keyLevels.spy ? (
              <div className="text-xs">
                <span className="text-slate-500">SPY</span>{' '}
                <span className="font-mono font-medium text-white">${safeToFixed(data.keyLevels.spy, 0)}</span>
              </div>
            ) : null}
            {data.keyLevels.qqq ? (
              <div className="text-xs">
                <span className="text-slate-500">QQQ</span>{' '}
                <span className="font-mono font-medium text-white">${safeToFixed(data.keyLevels.qqq, 0)}</span>
              </div>
            ) : null}
            {data.keyLevels.vix ? (
              <div className="text-xs">
                <span className="text-slate-500">VIX</span>{' '}
                <span className="font-mono font-medium text-white">{safeToFixed(data.keyLevels.vix, 1)}</span>
              </div>
            ) : null}
          </div>
        )}

        <p className="text-sm text-slate-400 line-clamp-3 mb-3">
          {data.tradingPlan}
        </p>

        {data.topWatchlist && data.topWatchlist.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-slate-500 self-center">Watch:</span>
            {data.topWatchlist.slice(0, 5).map((item) => (
              <Link key={item.symbol} href={`/stock/${item.symbol}`}>
                <Badge variant="outline" className="cursor-pointer text-[10px] hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-500 border-slate-600 text-slate-400 transition-colors">
                  {item.symbol}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MarketQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

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
    <div className="bg-[#0a0a0a] border-b border-[#1a1a1a] overflow-hidden">
      <div className="flex items-center h-8">
        <div className="flex-shrink-0 flex items-center gap-1.5 px-4 border-r border-[#222] bg-[#0a0a0a] z-10">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            isOpen ? "bg-emerald-500" : "bg-slate-400"
          )} />
          <span className={cn(
            "text-[11px] font-medium",
            isOpen ? "text-emerald-400" : "text-slate-500"
          )}>{status}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee">
            {[...indices, ...indices].map((idx, i) => {
              const quote = marketData?.quotes?.[idx.symbol];
              const change = safeNumber(quote?.regularMarketChangePercent);
              return (
                <Link key={`${idx.symbol}-${i}`} href={`/stock/${idx.symbol}`}>
                  <div className="flex items-center gap-3 px-4 whitespace-nowrap cursor-pointer hover:bg-[#111] transition-colors">
                    <span className="text-[11px] font-medium text-slate-400">{idx.symbol}</span>
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

// Latest AI Ideas
function LatestIdeas() {
  const { data } = useQuery<{ setups: Array<{
    symbol: string;
    direction: string;
    confidenceScore: number;
    source: string;
    timestamp?: string;
  }> }>({
    queryKey: ["/api/trade-ideas/best-setups?limit=6"],
    refetchInterval: 60000,
  });

  const ideas = data?.setups?.slice(0, 6) || [];

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
    <Card className="bg-[#111] border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-white">Today's Ideas</h3>
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
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#0a0a0a] hover:bg-[#151515] border border-[#1a1a1a] transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                      isLong ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {idea.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white text-sm">{idea.symbol}</span>
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
                        <span className="text-[10px] text-slate-600">{getRelativeTime(idea.timestamp)}</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn(
                    "font-mono",
                    idea.confidenceScore >= 75 ? "border-emerald-500/30 text-emerald-500" :
                    idea.confidenceScore >= 60 ? "border-amber-500/30 text-amber-500" : "border-slate-600 text-slate-400"
                  )}>
                    {idea.confidenceScore}%
                  </Badge>
                </div>
              </Link>
            );
          }) : (
            <div className="text-sm text-slate-500 text-center py-8 bg-[#0a0a0a] rounded-lg">
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
    queryKey: ["/api/news?limit=5"],
    refetchInterval: 120000,
  });

  const news = data?.news?.slice(0, 5) || [];

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
    <Card className="bg-[#111] border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-orange-500" />
            </div>
            <h3 className="font-semibold text-white">Breaking News</h3>
          </div>
          <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-500">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />
            Live
          </Badge>
        </div>
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
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
                className="block p-3 rounded-lg bg-[#0a0a0a] hover:bg-[#151515] border border-[#1a1a1a] transition-colors group"
              >
                <p className="text-sm font-medium text-white line-clamp-2 group-hover:text-emerald-400 transition-colors">
                  {article.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-slate-500">{article.source}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(article.publishedAt)}
                  </span>
                  {article.tickers && article.tickers.length > 0 && (
                    <>
                      <span className="text-slate-600">·</span>
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
              </a>
            ))
          ) : (
            <div className="text-sm text-slate-500 text-center py-8 bg-[#0a0a0a] rounded-lg">
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

  const earnings = data?.earnings?.slice(0, 6) || [];

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
    return { label: 'TBD', color: 'text-slate-500 bg-[#1a1a1a]' };
  };

  return (
    <Card className="bg-[#111] border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <h3 className="font-semibold text-white">Earnings Calendar</h3>
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
              {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : earnings.length > 0 ? (
            earnings.map((earning, i) => {
              const timeInfo = getTimeLabel(earning.time);
              return (
                <Link key={i} href={`/stock/${earning.symbol}`}>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0a0a0a] hover:bg-[#151515] border border-[#1a1a1a] transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-xs font-bold text-blue-500">
                        {earning.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-white">{earning.symbol}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", timeInfo.color)}>
                            {timeInfo.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {earning.company?.slice(0, 25)}{earning.company && earning.company.length > 25 ? '...' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-white">{formatDate(earning.reportDate)}</div>
                      {earning.estimatedEps && (
                        <div className="text-[10px] text-slate-500">
                          Est: ${safeToFixed(earning.estimatedEps, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="text-sm text-slate-500 text-center py-8 bg-[#0a0a0a] rounded-lg flex flex-col items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              No upcoming earnings
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Market Movers (compact)
function TopMovers() {
  const { data } = useQuery<{
    topGainers: Array<{ symbol: string; name?: string; changePercent: number; percentChange?: number; price?: number }>;
    topLosers: Array<{ symbol: string; name?: string; changePercent: number; percentChange?: number; price?: number }>;
  }>({
    queryKey: ["/api/market-movers"],
    refetchInterval: 60000,
  });

  const gainers = data?.topGainers?.slice(0, 5) || [];
  const losers = data?.topLosers?.slice(0, 5) || [];

  return (
    <Card className="bg-[#111] border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Activity className="w-4 h-4 text-purple-500" />
            </div>
            <h3 className="font-semibold text-white">Market Movers</h3>
          </div>
          <Link href="/market">
            <span className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer">
              View all <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-emerald-500">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Gainers</span>
            </div>
            <div className="space-y-1.5">
              {gainers.map((stock) => (
                <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 transition-colors cursor-pointer">
                    <span className="text-xs font-semibold text-white">{stock.symbol}</span>
                    <span className="text-xs font-bold text-emerald-500">+{safeToFixed(stock.changePercent ?? stock.percentChange, 1)}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-red-500">
              <TrendingDown className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Losers</span>
            </div>
            <div className="space-y-1.5">
              {losers.map((stock) => (
                <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 transition-colors cursor-pointer">
                    <span className="text-xs font-semibold text-white">{stock.symbol}</span>
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

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] transition-colors">
      {/* Market Ticker */}
      <MarketTicker />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Morning Briefing */}
        <section className="mb-6">
          <MorningBriefing />
        </section>

        {/* Cross-Asset Overview */}
        <section className="mb-6">
          <CrossAssetOverview />
        </section>

        {/* Two-column: Ideas + News */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <LatestIdeas />
          <BreakingNews />
        </section>

        {/* Three-column: Earnings + Economic Calendar + Movers */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <EarningsCalendar />
          <EconomicCalendarWidget />
          <TopMovers />
        </section>

        {/* Minimal footer */}
        <footer className="text-center py-6 mt-4 border-t border-[#1a1a1a]">
          <p className="text-xs text-slate-600">
            Educational research platform for self-directed traders. Not financial advice.
          </p>
        </footer>
      </main>
    </div>
  );
}
