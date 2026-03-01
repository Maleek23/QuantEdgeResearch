import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";
import {
  Globe,
  BarChart3,
  Fuel,
  Landmark,
  Activity,
  Calendar,
  Clock,
  Newspaper,
  ExternalLink,
  Brain,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";

// ── Asset class classification ──
const SECTOR_ETFS = new Set(['XLE', 'XLF', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLC']);
const COMMODITY_SYMBOLS = new Set(['USO', 'GLD', 'SLV', 'UNG', 'OIH', 'WEAT', 'DBA']);
const BOND_SYMBOLS = new Set(['TLT', 'TBT', 'BND', 'IEF', 'HYG', 'LQD', 'SHY', 'AGG']);
const INDEX_SYMBOLS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'SPX', 'VIX']);
const DEFENSE_SYMBOLS = new Set(['LMT', 'RTX', 'NOC', 'GD', 'BA']);

export function getAssetClass(symbol: string): { label: string; color: string } {
  const s = symbol.toUpperCase();
  if (INDEX_SYMBOLS.has(s)) return { label: 'INDEX', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
  if (SECTOR_ETFS.has(s)) return { label: 'SECTOR', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' };
  if (COMMODITY_SYMBOLS.has(s)) return { label: 'COMMODITY', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
  if (BOND_SYMBOLS.has(s)) return { label: 'BOND', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' };
  if (DEFENSE_SYMBOLS.has(s)) return { label: 'DEFENSE', color: 'bg-red-500/10 text-red-500 border-red-500/20' };
  return { label: 'STOCK', color: 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700' };
}

interface MarketQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

// ── Cross-Asset Overview ──
export function CrossAssetOverview({ variant = "default" }: { variant?: "default" | "landing" }) {
  const { data: marketData } = useQuery<{ quotes: Record<string, MarketQuote> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,IWM,USO,GLD,UNG,TLT,HYG,BTC-USD,VIX"],
    refetchInterval: 30000,
  });

  const assetGroups = [
    {
      label: 'Indices',
      icon: BarChart3,
      color: 'text-blue-500',
      assets: [
        { symbol: 'SPY', name: 'S&P 500' },
        { symbol: 'QQQ', name: 'Nasdaq' },
        { symbol: 'IWM', name: 'Russell' },
      ],
    },
    {
      label: 'Commodities',
      icon: Fuel,
      color: 'text-amber-500',
      assets: [
        { symbol: 'USO', name: 'Oil' },
        { symbol: 'GLD', name: 'Gold' },
        { symbol: 'UNG', name: 'Nat Gas' },
      ],
    },
    {
      label: 'Bonds',
      icon: Landmark,
      color: 'text-cyan-500',
      assets: [
        { symbol: 'TLT', name: '20Y Treasury' },
        { symbol: 'HYG', name: 'High Yield' },
      ],
    },
    {
      label: 'Fear',
      icon: Activity,
      color: 'text-red-500',
      assets: [
        { symbol: 'VIX', name: 'Volatility' },
        { symbol: 'BTC-USD', name: 'Bitcoin' },
      ],
    },
  ];

  const isLanding = variant === "landing";

  return (
    <Card className={cn(
      "border-gray-200 dark:border-[#222]",
      isLanding ? "bg-slate-900/50 border-slate-700/50 backdrop-blur-sm" : "bg-white dark:bg-[#111]"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <Globe className="w-4 h-4 text-blue-500" />
          </div>
          <h3 className={cn("font-semibold", isLanding ? "text-white" : "text-gray-900 dark:text-white")}>Cross-Asset Overview</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {assetGroups.map((group) => (
            <div key={group.label} className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <group.icon className={cn("w-3.5 h-3.5", group.color)} />
                <span className={cn("text-[11px] font-semibold uppercase tracking-wider", isLanding ? "text-slate-400" : "text-gray-500 dark:text-slate-400")}>{group.label}</span>
              </div>
              {group.assets.map((asset) => {
                const quote = marketData?.quotes?.[asset.symbol];
                const change = safeNumber(quote?.regularMarketChangePercent);
                const price = safeNumber(quote?.regularMarketPrice);
                return (
                  <Link key={asset.symbol} href={`/stock/${asset.symbol}`}>
                    <div className={cn(
                      "flex items-center justify-between p-2 rounded-lg border transition-colors cursor-pointer",
                      isLanding
                        ? "bg-slate-800/50 hover:bg-slate-700/50 border-slate-700/50"
                        : "bg-gray-50 dark:bg-[#0a0a0a] hover:bg-gray-100 dark:hover:bg-[#151515] border-gray-100 dark:border-[#1a1a1a]"
                    )}>
                      <div>
                        <span className={cn("text-xs font-semibold", isLanding ? "text-white" : "text-gray-900 dark:text-white")}>{asset.symbol}</span>
                        <div className={cn("text-[10px]", isLanding ? "text-slate-500" : "text-gray-500 dark:text-slate-500")}>{asset.name}</div>
                      </div>
                      <div className="text-right">
                        {price > 0 && (
                          <div className={cn("text-[10px] font-mono", isLanding ? "text-slate-400" : "text-gray-500 dark:text-slate-400")}>
                            ${price < 100 ? safeToFixed(price, 2) : safeToFixed(price, 0)}
                          </div>
                        )}
                        <span className={cn(
                          "text-xs font-mono font-bold",
                          change >= 0 ? "text-emerald-500" : "text-red-500"
                        )}>
                          {change >= 0 ? "+" : ""}{safeToFixed(change, 2)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Economic Calendar Widget ──
export function EconomicCalendarWidget({ variant = "default" }: { variant?: "default" | "landing" }) {
  const { data, isLoading } = useQuery<{
    upcoming: Array<{
      name: string;
      date: string;
      time: string;
      importance: 'high' | 'medium' | 'low';
      description: string;
      tradingImpact?: string;
    }>;
    today: Array<{
      name: string;
      date: string;
      time: string;
      importance: 'high' | 'medium' | 'low';
      description: string;
    }>;
  }>({
    queryKey: ["/api/economic-calendar?days=7"],
    refetchInterval: 600000,
  });

  const events = data?.upcoming?.slice(0, 6) || [];
  const isLanding = variant === "landing";

  const importanceColor = (imp: string) => {
    if (imp === 'high') return 'bg-red-500/10 text-red-500 border-red-500/20';
    if (imp === 'medium') return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    return 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700';
  };

  const formatEventDate = (date: string) => {
    const d = new Date(date + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <Card className={cn(
      "border-gray-200 dark:border-[#222]",
      isLanding ? "bg-slate-900/50 border-slate-700/50 backdrop-blur-sm" : "bg-white dark:bg-[#111]"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-red-500" />
            </div>
            <h3 className={cn("font-semibold", isLanding ? "text-white" : "text-gray-900 dark:text-white")}>Economic Calendar</h3>
          </div>
          <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-500">
            {data?.today && data.today.length > 0 ? `${data.today.length} today` : 'Macro'}
          </Badge>
        </div>
        <div className="space-y-1.5">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : events.length > 0 ? (
            events.map((event, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-lg border",
                  isLanding
                    ? "bg-slate-800/50 border-slate-700/50"
                    : "bg-gray-50 dark:bg-[#0a0a0a] border-gray-100 dark:border-[#1a1a1a]"
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    event.importance === 'high' ? 'bg-red-500' :
                    event.importance === 'medium' ? 'bg-amber-500' : 'bg-gray-400'
                  )} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium text-sm truncate", isLanding ? "text-white" : "text-gray-900 dark:text-white")}>{event.name}</span>
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0", importanceColor(event.importance))}>
                        {event.importance.toUpperCase()}
                      </span>
                    </div>
                    <span className={cn("text-[10px] truncate block", isLanding ? "text-slate-500" : "text-gray-500 dark:text-slate-500")}>
                      {event.description.slice(0, 60)}{event.description.length > 60 ? '...' : ''}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className={cn("text-xs font-medium", isLanding ? "text-white" : "text-gray-900 dark:text-white")}>{formatEventDate(event.date)}</div>
                  <div className={cn("text-[10px]", isLanding ? "text-slate-500" : "text-gray-500 dark:text-slate-500")}>{event.time}</div>
                </div>
              </div>
            ))
          ) : (
            <div className={cn(
              "text-sm text-center py-8 rounded-lg flex flex-col items-center gap-2",
              isLanding ? "text-slate-500 bg-slate-800/50" : "text-gray-500 dark:text-slate-500 bg-gray-50 dark:bg-[#0a0a0a]"
            )}>
              <Calendar className="w-5 h-5" />
              No upcoming economic events
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Latest News Preview (compact for landing) ──
export function LatestNewsPreview({ variant = "default" }: { variant?: "default" | "landing" }) {
  const { data, isLoading } = useQuery<{
    news: Array<{
      title: string;
      url: string;
      source: string;
      publishedAt: string;
      tickers?: string[];
      sentiment?: string;
    }>;
  }>({
    queryKey: ["/api/news?limit=4"],
    refetchInterval: 120000,
  });

  const news = data?.news?.slice(0, 4) || [];
  const isLanding = variant === "landing";

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
    <Card className={cn(
      "border-gray-200 dark:border-[#222]",
      isLanding ? "bg-slate-900/50 border-slate-700/50 backdrop-blur-sm" : "bg-white dark:bg-[#111]"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-orange-500" />
            </div>
            <h3 className={cn("font-semibold", isLanding ? "text-white" : "text-gray-900 dark:text-white")}>Breaking News</h3>
          </div>
          <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-500">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1.5" />
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
                className={cn(
                  "block p-3 rounded-lg border transition-colors group",
                  isLanding
                    ? "bg-slate-800/50 hover:bg-slate-700/50 border-slate-700/50"
                    : "bg-gray-50 dark:bg-[#0a0a0a] hover:bg-gray-100 dark:hover:bg-[#151515] border-gray-100 dark:border-[#1a1a1a]"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium line-clamp-2 transition-colors",
                      isLanding
                        ? "text-white group-hover:text-emerald-400"
                        : "text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                    )}>
                      {article.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={cn("text-[10px]", isLanding ? "text-slate-500" : "text-gray-500 dark:text-slate-500")}>{article.source}</span>
                      <span className={cn(isLanding ? "text-slate-600" : "text-gray-300 dark:text-slate-600")}>·</span>
                      <span className={cn("text-[10px] flex items-center gap-1", isLanding ? "text-slate-500" : "text-gray-500 dark:text-slate-500")}>
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(article.publishedAt)}
                      </span>
                      {article.tickers && article.tickers.length > 0 && (
                        <>
                          <span className={cn(isLanding ? "text-slate-600" : "text-gray-300 dark:text-slate-600")}>·</span>
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
                  <ExternalLink className={cn("w-3.5 h-3.5 flex-shrink-0 group-hover:text-emerald-500 transition-colors", isLanding ? "text-slate-600" : "text-gray-400 dark:text-slate-600")} />
                </div>
              </a>
            ))
          ) : (
            <div className={cn(
              "text-sm text-center py-8 rounded-lg",
              isLanding ? "text-slate-500 bg-slate-800/50" : "text-gray-500 dark:text-slate-500 bg-gray-50 dark:bg-[#0a0a0a]"
            )}>
              No breaking news right now
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Latest Ideas Preview (compact for landing) ──
export function LatestIdeasPreview({ variant = "default", limit = 4 }: { variant?: "default" | "landing"; limit?: number }) {
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

  const ideas = data?.setups?.slice(0, limit) || [];
  const isLanding = variant === "landing";

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
    <Card className={cn(
      "border-gray-200 dark:border-[#222]",
      isLanding ? "bg-slate-900/50 border-slate-700/50 backdrop-blur-sm" : "bg-white dark:bg-[#111]"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className={cn("font-semibold", isLanding ? "text-white" : "text-gray-900 dark:text-white")}>AI Trade Ideas</h3>
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
                <div className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer",
                  isLanding
                    ? "bg-slate-800/50 hover:bg-slate-700/50 border-slate-700/50"
                    : "bg-gray-50 dark:bg-[#0a0a0a] hover:bg-gray-100 dark:hover:bg-[#151515] border-gray-100 dark:border-[#1a1a1a]"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                      isLong ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                    )}>
                      {idea.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("font-semibold text-sm", isLanding ? "text-white" : "text-gray-900 dark:text-white")}>{idea.symbol}</span>
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
                        <span className={cn("text-[10px]", isLanding ? "text-slate-600" : "text-gray-400 dark:text-slate-600")}>{getRelativeTime(idea.timestamp)}</span>
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
            <div className={cn(
              "text-sm text-center py-8 rounded-lg",
              isLanding ? "text-slate-500 bg-slate-800/50" : "text-gray-500 dark:text-slate-500 bg-gray-50 dark:bg-[#0a0a0a]"
            )}>
              No active ideas right now
            </div>
          )}
        </div>

        {isLanding && ideas.length > 0 && (
          <div className="mt-4 text-center">
            <Link href="/join-beta">
              <Button variant="outline" size="sm" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                Sign up for full access <ArrowRight className="w-3 h-3 ml-1.5" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
