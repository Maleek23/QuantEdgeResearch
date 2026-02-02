import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { GlobalSearch } from "@/components/global-search";
import {
  TrendingUp,
  TrendingDown,
  Newspaper,
  Calendar,
  BarChart3,
  Clock,
  Gauge,
  Zap,
  Brain,
  Activity,
  AlertTriangle,
} from "lucide-react";

// Types for insights
interface MarketContext {
  regime: string;
  regimeLabel: string;
  riskLevel: string;
  bias: string;
  topEngine?: string;
  topEngineWinRate?: number;
  performance?: string;
}

// Contextual Insight Bar - appears at top of pages where data is shown
export function InsightBar({ context }: { context?: 'research' | 'trade-desk' | 'movers' }) {
  const { data, isLoading } = useQuery<MarketContext>({
    queryKey: ["/api/insights/summary"],
    staleTime: 300000, // 5 minutes
    refetchInterval: 600000, // 10 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/50 mb-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  if (!data) return null;

  const biasColor = data.bias === 'Long' ? 'text-emerald-400' : data.bias === 'Short' ? 'text-red-400' : 'text-slate-400';
  const riskColor =
    data.riskLevel === 'Low' ? 'text-emerald-400' :
    data.riskLevel === 'Moderate' ? 'text-amber-400' :
    data.riskLevel === 'Elevated' ? 'text-orange-400' :
    data.riskLevel === 'High' ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-900/60 border border-slate-800/50 mb-6 overflow-x-auto">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-cyan-400 shrink-0" />
        <span className="text-xs text-slate-500 uppercase">Insight</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Activity className="h-3 w-3 text-slate-500" />
        <span className="text-xs text-slate-400">{data.regimeLabel || data.regime}</span>
      </div>

      <Badge variant="outline" className={cn("text-xs", biasColor, "border-current/30")}>
        {data.bias === 'Long' ? '↑' : data.bias === 'Short' ? '↓' : '↔'} {data.bias}
      </Badge>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">Risk:</span>
        <span className={cn("text-xs font-medium", riskColor)}>{data.riskLevel}</span>
      </div>

      {data.topEngine && data.topEngineWinRate && data.topEngineWinRate >= 55 && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="text-slate-500">Top:</span>
          <span className="text-cyan-400">{data.topEngine}</span>
          <span className="text-emerald-400">{data.topEngineWinRate}%</span>
        </div>
      )}

      {data.riskLevel === 'High' || data.riskLevel === 'Extreme' ? (
        <div className="flex items-center gap-1 text-amber-400 ml-auto">
          <AlertTriangle className="h-3 w-3" />
          <span className="text-xs">Elevated risk</span>
        </div>
      ) : null}
    </div>
  );
}

// Market sentiment overview
function MarketSentiment() {
  const { data: vixData } = useQuery<{ quotes: Record<string, { regularMarketPrice: number }> }>({
    queryKey: ["/api/market-data/batch/VIX"],
    refetchInterval: 60000,
  });

  const vix = vixData?.quotes?.VIX?.regularMarketPrice || 0;
  const fearLevel = vix < 15 ? "Low" : vix < 20 ? "Moderate" : vix < 30 ? "Elevated" : "Extreme";
  const fearColor = vix < 15 ? "text-emerald-400" : vix < 20 ? "text-amber-400" : vix < 30 ? "text-orange-400" : "text-red-400";

  return (
    <Card className="p-5 bg-slate-900/40 border-slate-800/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Market Sentiment</h3>
        <Gauge className="h-4 w-4 text-slate-500" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-slate-500 mb-1">VIX (Fear Index)</div>
          <div className="text-2xl font-bold text-slate-100">{safeToFixed(vix, 2)}</div>
          <div className={cn("text-sm font-medium", fearColor)}>{fearLevel} Fear</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Market Regime</div>
          <div className={cn(
            "text-lg font-semibold",
            vix < 20 ? "text-emerald-400" : "text-amber-400"
          )}>
            {vix < 20 ? "Risk On" : "Risk Off"}
          </div>
          <div className="text-xs text-slate-500">
            {vix < 20 ? "Favorable conditions" : "Caution advised"}
          </div>
        </div>
      </div>
    </Card>
  );
}

// Sector performance overview
function SectorPerformance() {
  const { data } = useQuery<{ quotes: Record<string, { regularMarketChangePercent: number }> }>({
    queryKey: ["/api/market-data/batch/XLK,XLF,XLV,XLE,XLI,XLY,XLP,XLU,XLB,XLRE,XLC"],
    refetchInterval: 60000,
  });

  const sectors = [
    { symbol: "XLK", name: "Technology" },
    { symbol: "XLF", name: "Financials" },
    { symbol: "XLV", name: "Healthcare" },
    { symbol: "XLE", name: "Energy" },
    { symbol: "XLI", name: "Industrials" },
    { symbol: "XLY", name: "Cons. Disc" },
    { symbol: "XLP", name: "Cons. Staples" },
    { symbol: "XLU", name: "Utilities" },
    { symbol: "XLB", name: "Materials" },
    { symbol: "XLRE", name: "Real Estate" },
    { symbol: "XLC", name: "Comm. Svcs" },
  ];

  return (
    <Card className="p-5 bg-slate-900/40 border-slate-800/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Sector Performance</h3>
        <BarChart3 className="h-4 w-4 text-slate-500" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sectors.map((sector) => {
          const change = data?.quotes?.[sector.symbol]?.regularMarketChangePercent || 0;
          return (
            <Link key={sector.symbol} href={`/chart-analysis?symbol=${sector.symbol}`}>
              <div className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 transition-colors cursor-pointer">
                <span className="text-xs text-slate-400">{sector.name}</span>
                <span className={cn(
                  "text-xs font-semibold",
                  change >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {change >= 0 ? "+" : ""}{safeToFixed(change, 2)}%
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

// Latest market news
function MarketNews() {
  const { data, isLoading } = useQuery<{ news: Array<{
    title: string;
    source: string;
    publishedAt: string;
    url: string;
    tickers?: string[];
    sentiment?: number;
  }> }>({
    queryKey: ["/api/news/market?limit=8"],
    refetchInterval: 120000,
  });

  const news = data?.news || [];

  return (
    <Card className="p-5 bg-slate-900/40 border-slate-800/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Market News</h3>
        <Newspaper className="h-4 w-4 text-slate-500" />
      </div>
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-xs text-slate-600">Loading news...</div>
        ) : news.length > 0 ? (
          news.slice(0, 6).map((item, i) => (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg hover:bg-slate-800/50 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm text-slate-200 group-hover:text-cyan-400 transition-colors line-clamp-2 mb-1">
                    {item.title}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{item.source}</span>
                    <span>·</span>
                    <Clock className="h-3 w-3" />
                    <span>{formatTimeAgo(item.publishedAt)}</span>
                  </div>
                </div>
                {item.sentiment !== undefined && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs shrink-0",
                      item.sentiment > 0.3 ? "border-emerald-500/30 text-emerald-400" :
                      item.sentiment < -0.3 ? "border-red-500/30 text-red-400" :
                      "border-slate-700 text-slate-500"
                    )}
                  >
                    {item.sentiment > 0.3 ? "Bullish" : item.sentiment < -0.3 ? "Bearish" : "Neutral"}
                  </Badge>
                )}
              </div>
            </a>
          ))
        ) : (
          <div className="text-xs text-slate-600">No news available</div>
        )}
      </div>
    </Card>
  );
}

// Upcoming earnings/events
function UpcomingEvents() {
  const { data } = useQuery<{ earnings: Array<{
    symbol: string;
    companyName: string;
    date: string;
    time: string;
    estimate?: number;
  }> }>({
    queryKey: ["/api/earnings/upcoming?limit=8"],
    refetchInterval: 300000,
  });

  const events = data?.earnings || [];

  return (
    <Card className="p-5 bg-slate-900/40 border-slate-800/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Upcoming Earnings</h3>
        <Calendar className="h-4 w-4 text-slate-500" />
      </div>
      <div className="space-y-2">
        {events.length > 0 ? (
          events.slice(0, 6).map((event, i) => (
            <Link key={i} href={`/chart-analysis?symbol=${event.symbol}`}>
              <div className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm text-cyan-400">{event.symbol}</span>
                  <span className="text-xs text-slate-500 truncate max-w-[120px]">{event.companyName}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {formatDate(event.date)} {event.time === "BMO" ? "Pre" : event.time === "AMC" ? "After" : ""}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-xs text-slate-600">No upcoming earnings</div>
        )}
      </div>
    </Card>
  );
}

// Hot symbols / trending
function TrendingSymbols() {
  const { data: topMovers } = useQuery<{
    gainers: Array<{ symbol: string; change: number }>;
    losers: Array<{ symbol: string; change: number }>;
  }>({
    queryKey: ["/api/market/top-movers"],
    refetchInterval: 60000,
  });

  const gainers = topMovers?.gainers?.slice(0, 4) || [];
  const losers = topMovers?.losers?.slice(0, 4) || [];

  return (
    <Card className="p-5 bg-slate-900/40 border-slate-800/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Trending</h3>
        <Zap className="h-4 w-4 text-slate-500" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-emerald-400 mb-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Gainers
          </div>
          <div className="space-y-1">
            {gainers.map((s) => (
              <Link key={s.symbol} href={`/chart-analysis?symbol=${s.symbol}`}>
                <div className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <span className="text-sm font-medium text-slate-300">{s.symbol}</span>
                  <span className="text-xs text-emerald-400">+{safeToFixed(s.change, 1)}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-red-400 mb-2 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Losers
          </div>
          <div className="space-y-1">
            {losers.map((s) => (
              <Link key={s.symbol} href={`/chart-analysis?symbol=${s.symbol}`}>
                <div className="flex items-center justify-between p-1.5 rounded hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <span className="text-sm font-medium text-slate-300">{s.symbol}</span>
                  <span className="text-xs text-red-400">{safeToFixed(s.change, 1)}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// Research search - uses consolidated GlobalSearch
function ResearchSearch() {
  return <GlobalSearch variant="default" placeholder="Research any symbol..." />;
}

// Utility functions
function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ResearchHub() {
  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100 mb-2">Research Hub</h1>
          <p className="text-sm text-slate-500">Market intelligence and real-time analysis</p>
        </div>

        {/* Contextual Insight Bar */}
        <InsightBar context="research" />

        {/* Search */}
        <div className="mb-8 max-w-xl">
          <ResearchSearch />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - News */}
          <div className="lg:col-span-2 space-y-6">
            <MarketNews />
          </div>

          {/* Right column - Market Data */}
          <div className="space-y-6">
            <MarketSentiment />
            <TrendingSymbols />
            <UpcomingEvents />
          </div>
        </div>

        {/* Sector Performance - Full width */}
        <div className="mt-6">
          <SectorPerformance />
        </div>

        {/* Quick links */}
        <div className="mt-8 pt-6 border-t border-slate-800/50">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Quick Research</h3>
          <div className="flex flex-wrap gap-2">
            {["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL", "AMZN", "META", "AMD", "SPY", "QQQ"].map((symbol) => (
              <Link key={symbol} href={`/chart-analysis?symbol=${symbol}`}>
                <Badge
                  variant="outline"
                  className="cursor-pointer border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300 transition-colors"
                >
                  {symbol}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
