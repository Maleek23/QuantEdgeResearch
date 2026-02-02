import { useState } from "react";
import { motion } from "framer-motion";
import { cn, safeToFixed } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AuroraBackground } from "@/components/aurora-background";
import {
  TrendingUp,
  Star,
  Crown,
  BarChart3,
  Lightbulb,
  Coins,
  Bitcoin,
  Newspaper,
  ArrowRight,
  Sparkles,
  Clock,
  Eye,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  tickers?: string[];
  sentiment?: number;
  summary?: string;
}

const categories = [
  { id: "all", label: "All News", icon: Newspaper },
  { id: "featured", label: "Featured", icon: Star },
  { id: "tech", label: "Technology", icon: BarChart3 },
  { id: "earnings", label: "Earnings", icon: Lightbulb },
  { id: "etfs", label: "ETFs", icon: Coins },
  { id: "crypto", label: "Crypto", icon: Bitcoin },
  { id: "trending", label: "Trending", icon: TrendingUp },
];

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

export default function Discover() {
  const [activeCategory, setActiveCategory] = useState("all");

  // Fetch real news data
  const { data: newsData, isLoading: newsLoading, refetch } = useQuery<{ news: NewsItem[] }>({
    queryKey: ["/api/news/market?limit=20"],
    refetchInterval: 120000,
  });

  // Fetch top movers for trending section
  const { data: moversData, isLoading: moversLoading } = useQuery<{
    gainers: Array<{ symbol: string; change: number; price: number }>;
    losers: Array<{ symbol: string; change: number; price: number }>;
  }>({
    queryKey: ["/api/market/top-movers"],
    refetchInterval: 60000,
  });

  // Fetch upcoming earnings
  const { data: earningsData, isLoading: earningsLoading } = useQuery<{
    earnings: Array<{ symbol: string; companyName: string; date: string; time: string }>;
  }>({
    queryKey: ["/api/earnings/upcoming?limit=6"],
    refetchInterval: 300000,
  });

  const news = newsData?.news || [];
  const featuredNews = news.slice(0, 1);
  const latestNews = news.slice(1, 8);
  const breakingNews = news.slice(0, 4);
  const gainers = moversData?.gainers?.slice(0, 5) || [];
  const earnings = earningsData?.earnings?.slice(0, 5) || [];

  return (
    <>
      <AuroraBackground />
      <div className="min-h-screen relative z-10 pb-20">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-slate-100">Discover</h1>
              <p className="text-sm text-slate-500">Market insights and financial news</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-slate-700 text-slate-400 hover:text-cyan-400"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", newsLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-12 gap-8">
            {/* Left Sidebar - Categories */}
            <div className="col-span-2">
              <Card className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20">
                <div className="mb-4 pb-3 border-b border-cyan-500/20">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    Categories
                  </h3>
                </div>
                <nav className="space-y-1">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left",
                        activeCategory === cat.id
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                          : "text-slate-400 hover:text-slate-200 hover:bg-cyan-500/10 border border-transparent"
                      )}
                    >
                      <cat.icon className="w-4 h-4" />
                      {cat.label}
                    </button>
                  ))}
                </nav>

                {/* Trending Stocks */}
                <div className="mt-6 pt-4 border-t border-slate-700/50">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    Top Gainers
                  </h4>
                  {moversLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-8 bg-slate-800" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {gainers.map((stock) => (
                        <Link key={stock.symbol} href={`/chart-analysis?symbol=${stock.symbol}`}>
                          <div className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 cursor-pointer">
                            <span className="text-sm font-medium text-cyan-400">{stock.symbol}</span>
                            <span className="text-xs text-emerald-400">
                              +{safeToFixed(stock.change, 1)}%
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Main Content */}
            <div className="col-span-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-100">Featured Stories</h2>
              </div>

              {/* Featured Article Card */}
              {newsLoading ? (
                <Skeleton className="h-80 bg-slate-800" />
              ) : featuredNews.length > 0 ? (
                featuredNews.map((article, i) => (
                  <a
                    key={i}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Card className="overflow-hidden bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20 hover:border-cyan-500/40 transition-all cursor-pointer group shadow-xl">
                      <div className="aspect-[16/9] bg-gradient-to-br from-cyan-900/20 via-slate-800 to-slate-900 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.1),transparent_50%)]" />
                        <div className="text-center relative z-10 p-6">
                          <Newspaper className="w-16 h-16 text-cyan-500/30 mx-auto mb-4" />
                          {article.tickers && article.tickers.length > 0 && (
                            <div className="flex gap-2 justify-center">
                              {article.tickers.slice(0, 3).map((ticker) => (
                                <Badge key={ticker} className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                                  {ticker}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                        <Badge className="absolute top-4 right-4 bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                          <Star className="w-3 h-3 mr-1" />
                          Featured
                        </Badge>
                      </div>
                      <div className="p-6">
                        <h3 className="text-lg font-semibold text-slate-100 mb-3 group-hover:text-cyan-400 transition-colors leading-tight line-clamp-2">
                          {article.title}
                        </h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-sm text-slate-400">
                            <span>{article.source}</span>
                            <span>·</span>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimeAgo(article.publishedAt)}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Read <ExternalLink className="w-3 h-3 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </a>
                ))
              ) : (
                <Card className="p-12 text-center bg-slate-900/60 border-slate-800">
                  <Newspaper className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500">No news available</p>
                </Card>
              )}

              {/* Breaking News Section */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-100">Breaking News</h2>
                </div>
                {newsLoading ? (
                  <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-24 bg-slate-800" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {breakingNews.map((article, i) => (
                      <a
                        key={i}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <Card className="p-4 bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20 hover:border-cyan-500/40 transition-all cursor-pointer group h-full">
                          <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
                            <Newspaper className="w-3 h-3 text-cyan-500/70" />
                            <span>{article.source}</span>
                            <span>·</span>
                            <span>{formatTimeAgo(article.publishedAt)}</span>
                          </div>
                          <p className="text-sm text-slate-200 line-clamp-2 group-hover:text-cyan-400 transition-colors">
                            {article.title}
                          </p>
                          {article.tickers && article.tickers.length > 0 && (
                            <div className="mt-2 flex gap-1">
                              {article.tickers.slice(0, 2).map((ticker) => (
                                <Badge key={ticker} variant="outline" className="text-xs border-slate-700 text-slate-400">
                                  {ticker}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </Card>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar - More Articles + Earnings */}
            <div className="col-span-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-slate-400">Latest News</span>
              </div>

              {newsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-20 bg-slate-800" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {latestNews.map((article, i) => (
                    <a
                      key={i}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Card className="flex gap-3 cursor-pointer group p-3 bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border-cyan-500/20 hover:border-cyan-500/40 transition-all">
                        <div className="w-20 h-14 rounded-lg bg-gradient-to-br from-cyan-900/20 via-slate-800 to-slate-900 flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.15),transparent)]" />
                          <Newspaper className="w-6 h-6 text-slate-600 relative z-10" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 line-clamp-2 group-hover:text-cyan-400 transition-colors mb-1">
                            {article.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{article.source}</span>
                            <span>·</span>
                            <Clock className="w-3 h-3" />
                            <span>{formatTimeAgo(article.publishedAt)}</span>
                          </div>
                        </div>
                      </Card>
                    </a>
                  ))}
                </div>
              )}

              {/* Upcoming Earnings */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  Upcoming Earnings
                </h3>
                <Card className="p-4 bg-slate-900/60 border-slate-800">
                  {earningsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-10 bg-slate-800" />
                      ))}
                    </div>
                  ) : earnings.length > 0 ? (
                    <div className="space-y-3">
                      {earnings.map((earning, i) => (
                        <Link key={i} href={`/chart-analysis?symbol=${earning.symbol}`}>
                          <div className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 cursor-pointer">
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-cyan-400">{earning.symbol}</span>
                              <span className="text-xs text-slate-500 truncate max-w-[100px]">
                                {earning.companyName}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400">
                              {new Date(earning.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {earning.time === "BMO" ? " Pre" : earning.time === "AMC" ? " After" : ""}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No upcoming earnings</p>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
