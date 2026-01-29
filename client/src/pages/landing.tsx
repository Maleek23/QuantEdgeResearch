import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowRight,
  Search,
  Brain,
  BarChart3,
  Activity,
  Eye,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  LineChart,
  ChevronRight,
  Flame,
  Cpu,
  Bot,
  Newspaper,
  Calendar,
  Layers,
  Globe,
  Shield,
  Lock,
  CheckCircle2,
  Users,
  Radar,
  Play,
  Clock,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState as useReactState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { cn } from "@/lib/utils";

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

// Trading Engines
const tradingEngines = [
  { id: 'ML', name: 'Machine Learning', desc: 'Pattern recognition', color: '#10b981', icon: Cpu },
  { id: 'AI', name: 'AI Analysis', desc: 'LLM consensus', color: '#8b5cf6', icon: Brain },
  { id: 'QNT', name: 'Quantitative', desc: 'Statistical signals', color: '#3b82f6', icon: BarChart3 },
  { id: 'FLW', name: 'Order Flow', desc: 'Dark pool activity', color: '#f59e0b', icon: Activity },
  { id: 'SNT', name: 'Sentiment', desc: 'News & social', color: '#ec4899', icon: Eye },
  { id: 'TCH', name: 'Technical', desc: 'Chart patterns', color: '#06b6d4', icon: LineChart },
];

// Symbols for ticker
const TICKER_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM', 'VIX', 'BTC-USD', 'ETH-USD'];

// Types
interface MarketQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

interface MarketDataResponse {
  quotes: Record<string, MarketQuote>;
}

interface NewsItem {
  title: string;
  publishedAt: string;
  source: string;
  url?: string;
}

interface EarningsItem {
  symbol: string;
  companyName: string;
  reportDate: string;
  timing: string;
}

interface MoverItem {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
}

// Feature Comparison (2 tiers: Free vs Beta)
const featureComparison = [
  { feature: 'Stock Quotes & Charts', free: true, beta: true },
  { feature: 'Market News & Headlines', free: true, beta: true },
  { feature: 'Earnings Calendar', free: true, beta: true },
  { feature: 'Market Movers', free: true, beta: true },
  { feature: 'Basic Watchlist', free: '5 stocks', beta: 'Unlimited' },
  { feature: 'AI Stock Summaries', free: '1 trial', beta: true },
  { feature: 'Technical Snapshot', free: '1 trial', beta: true },
  { feature: 'Sentiment Analysis', free: '1 trial', beta: true },
  { feature: '6-Engine Analysis', free: false, beta: true },
  { feature: 'AI Trade Ideas', free: false, beta: true },
  { feature: 'Dark Pool Data', free: false, beta: true },
  { feature: 'Options Flow', free: false, beta: true },
  { feature: 'Smart Money Tracking', free: false, beta: true },
];

// Trust Badges
const trustBadges = [
  { icon: Lock, label: '256-bit SSL', desc: 'Bank-grade encryption' },
  { icon: Shield, label: 'Read-Only', desc: 'No trading access needed' },
  { icon: Users, label: 'Privacy First', desc: 'Your data stays yours' },
  { icon: CheckCircle2, label: 'SOC 2', desc: 'Enterprise compliant' },
];

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

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function formatEarningsDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Market Ticker Component
function MarketTicker() {
  const { data: marketData } = useQuery<MarketDataResponse>({
    queryKey: [`/api/market-data/batch/${TICKER_SYMBOLS.join(',')}`],
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
              const change = quote?.regularMarketChangePercent || 0;
              return (
                <div key={`${idx.symbol}-${i}`} className="flex items-center gap-3 px-4 whitespace-nowrap">
                  <span className="text-[11px] font-medium text-gray-600 dark:text-slate-400">{idx.symbol}</span>
                  <span className={cn(
                    "text-[11px] font-mono",
                    change >= 0 ? "text-emerald-500" : "text-red-500"
                  )}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Research Tools Grid (same as home page)
function ResearchTools() {
  const tools = [
    { title: "AI Trade Ideas", description: "Multi-engine convergence signals", icon: Brain, href: "/trade-desk", color: "emerald" },
    { title: "Technical Charts", description: "Advanced charting with 50+ indicators", icon: LineChart, href: "/chart-analysis", color: "purple" },
    { title: "Stock Screener", description: "Filter by technicals & fundamentals", icon: Target, href: "/discover", color: "cyan" },
    { title: "Market News", description: "Real-time news with sentiment", icon: Newspaper, href: "/market", color: "amber" },
    { title: "Options Flow", description: "Track unusual options activity", icon: Layers, href: "/smart-money", color: "pink" },
    { title: "Market Overview", description: "Sector heatmaps & breadth", icon: Globe, href: "/market", color: "blue" },
  ];

  const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "hover:border-emerald-500/30" },
    purple: { bg: "bg-purple-500/10", text: "text-purple-500", border: "hover:border-purple-500/30" },
    cyan: { bg: "bg-cyan-500/10", text: "text-cyan-500", border: "hover:border-cyan-500/30" },
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

// Latest AI Ideas
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

  const ideas = data?.setups?.slice(0, 5) || [];

  return (
    <Card className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-emerald-500" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">AI Trade Ideas</h3>
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
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">{idea.symbol}</span>
                      <span className={cn(
                        "ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium",
                        isLong ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {isLong ? "LONG" : "SHORT"}
                      </span>
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
              Scanning for opportunities...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Breaking News Feed
function BreakingNews() {
  const { data, isLoading } = useQuery<{ news: NewsItem[] }>({
    queryKey: ["/api/news?limit=6"],
    refetchInterval: 120000,
  });

  const news = data?.news?.slice(0, 4) || [];

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
                <div key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-[#0a0a0a] animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-[#222] rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-[#1a1a1a] rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : news.length > 0 ? (
            news.map((article, i) => (
              <div
                key={i}
                className="block p-3 rounded-lg bg-gray-50 dark:bg-[#0a0a0a] hover:bg-gray-100 dark:hover:bg-[#151515] border border-gray-100 dark:border-[#1a1a1a] transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                  {article.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-gray-500 dark:text-slate-500">{article.source}</span>
                  <span className="text-gray-300 dark:text-slate-600">·</span>
                  <span className="text-[10px] text-gray-500 dark:text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(article.publishedAt)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 dark:text-slate-500 text-center py-8 bg-gray-50 dark:bg-[#0a0a0a] rounded-lg">
              Loading news...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Earnings Calendar
function EarningsCalendar() {
  const { data, isLoading } = useQuery<{ earnings: EarningsItem[] }>({
    queryKey: ["/api/earnings/upcoming?days=7"],
    refetchInterval: 300000,
  });

  const earnings = data?.earnings?.slice(0, 6) || [];

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
            <span className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 cursor-pointer">
              Full calendar <ChevronRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
        <div className="space-y-2">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="p-3 rounded-lg bg-gray-50 dark:bg-[#0a0a0a] animate-pulse">
                  <div className="h-4 bg-gray-200 dark:bg-[#222] rounded w-1/2 mb-2" />
                  <div className="h-3 bg-gray-100 dark:bg-[#1a1a1a] rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : earnings.length > 0 ? (
            earnings.map((earning, i) => {
              const timeInfo = getTimeLabel(earning.timing);
              return (
                <Link key={i} href={`/stock/${earning.symbol}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-[#0a0a0a] hover:bg-gray-100 dark:hover:bg-[#151515] border border-gray-100 dark:border-[#1a1a1a] transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center font-bold text-xs text-blue-500">
                        {earning.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">{earning.symbol}</span>
                        <span className="ml-2 text-[10px] text-gray-500">{earning.companyName?.split(' ')[0]}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-gray-900 dark:text-white">{formatEarningsDate(earning.reportDate)}</div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded", timeInfo.color)}>
                        {timeInfo.label}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="text-sm text-gray-500 dark:text-slate-500 text-center py-8 bg-gray-50 dark:bg-[#0a0a0a] rounded-lg">
              No earnings this week
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Market Movers
function TrendingTickers() {
  const { data } = useQuery<{ topGainers: MoverItem[] }>({
    queryKey: ['/api/market-movers'],
    refetchInterval: 60000,
  });

  const movers = data?.topGainers?.slice(0, 6) || [];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {movers.length > 0 ? movers.map((ticker) => (
        <Link key={ticker.symbol} href={`/stock/${ticker.symbol}`}>
          <Card className="cursor-pointer bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] hover:border-emerald-500/30 transition-all hover:-translate-y-0.5">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900 dark:text-white">{ticker.symbol}</span>
                  <p className="text-[10px] text-gray-500 truncate">{ticker.name?.split(' ')[0]}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono text-gray-900 dark:text-white">${ticker.price?.toFixed(2)}</div>
                  <div className={cn(
                    "text-xs font-mono",
                    ticker.changePercent >= 0 ? "text-emerald-500" : "text-red-500"
                  )}>
                    {ticker.changePercent >= 0 ? "+" : ""}{ticker.changePercent?.toFixed(2)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )) : (
        [...Array(6)].map((_, i) => (
          <Card key={i} className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222]">
            <CardContent className="p-3 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-[#222] rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 dark:bg-[#1a1a1a] rounded w-1/3" />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [waitlistOpen, setWaitlistOpen] = useReactState(false);
  const [searchQuery, setSearchQuery] = useReactState('');
  const { isAuthenticated, user } = useAuth();
  const hasBetaAccess = user?.hasBetaAccess || false;

  const handleSearch = () => {
    if (searchQuery) {
      if (isAuthenticated) {
        setLocation(`/stock/${searchQuery.toUpperCase()}`);
      } else {
        setWaitlistOpen(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-gray-200 dark:border-[#1a1a1a]">
        <div className="flex items-center justify-between h-14 px-4 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-8 w-8" />
            <div className="hidden sm:block">
              <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">QuantEdge</span>
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">Labs</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link href="/trade-desk"><span className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">Trade Desk</span></Link>
            <Link href="/market"><span className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">Markets</span></Link>
            <Link href="/market-scanner"><span className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">Scanner</span></Link>
            <Link href="/features"><span className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer">Features</span></Link>
          </nav>

          <div className="flex items-center gap-2">
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-[#5865F2] hover:bg-[#5865F2]/10 transition-colors">
              <SiDiscord className="w-4 h-4" />
            </a>
            <ThemeToggle />
            {isAuthenticated ? (
              hasBetaAccess ? (
                <Link href="/home">
                  <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white h-8 px-4 text-xs font-medium">
                    Open App
                  </Button>
                </Link>
              ) : (
                <Button size="sm" onClick={() => setWaitlistOpen(true)} className="bg-gray-900 dark:bg-white text-white dark:text-black h-8 px-4 text-xs font-medium">
                  Request Access
                </Button>
              )
            ) : (
              <>
                <Link href="/login">
                  <Button size="sm" variant="ghost" className="text-gray-600 dark:text-slate-400 h-8 px-3 text-xs">Sign in</Button>
                </Link>
                <Button size="sm" onClick={() => setWaitlistOpen(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white h-8 px-4 text-xs font-medium">
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Market Ticker */}
      <div className="fixed top-14 left-0 right-0 z-40">
        <MarketTicker />
      </div>

      {/* Main Content */}
      <main className="pt-[88px] max-w-7xl mx-auto px-4">
        {/* Hero Section - Compact */}
        <section className="py-8 lg:py-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium mb-4">
            <Zap className="w-3 h-3" />
            Institutional-grade research for retail traders
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 leading-tight">
            Your AI <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent">Research Hub</span>
          </h1>

          <p className="text-gray-600 dark:text-slate-400 max-w-lg mx-auto mb-6">
            6 trading engines analyze every stock. When they converge, you get a signal.
          </p>

          {/* Search Bar */}
          <div className="max-w-md mx-auto mb-8">
            <div className="relative">
              <div className="flex items-center bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-xl overflow-hidden focus-within:border-blue-500 transition-colors">
                <Search className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search any stock, ETF, or crypto..."
                  className="flex-1 px-3 py-3 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none text-sm"
                />
                <Button onClick={handleSearch} className="m-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white h-8 px-4 text-sm">
                  Search
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-2 text-xs text-gray-500">
              <span>Try:</span>
              {['NVDA', 'TSLA', 'AAPL', 'SPY'].map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => { setSearchQuery(symbol); if (isAuthenticated) setLocation(`/stock/${symbol}`); else setWaitlistOpen(true); }}
                  className="px-2 py-0.5 rounded bg-gray-100 dark:bg-[#1a1a1a] hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Multi-Engine Visualization */}
        <section className="mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">6-Engine Convergence</h2>
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

        {/* Two Column Layout: Ideas + News/Earnings */}
        <section className="grid lg:grid-cols-2 gap-4 mb-8">
          <LatestIdeas />
          <div className="space-y-4">
            <BreakingNews />
          </div>
        </section>

        {/* Trending Tickers */}
        <section className="mb-8">
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
        </section>

        {/* Research Tools */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
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
              <Radar className="w-5 h-5 text-cyan-500" />
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

        {/* Earnings Calendar */}
        <section className="mb-8">
          <EarningsCalendar />
        </section>

        {/* Feature Comparison Table */}
        <section className="py-8 mb-8 bg-gray-50 dark:bg-[#0d0d0d] -mx-4 px-4 border-y border-gray-200 dark:border-[#1a1a1a]">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <span className="text-xs font-medium uppercase tracking-wider text-purple-500 mb-2 block">Access Levels</span>
              <h2 className="text-xl font-bold mb-2">Free to Try, Powerful When Unlocked</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">Start exploring instantly. Apply for beta to unlock everything.</p>
            </div>

            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#1a1a1a] rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 gap-2 p-4 border-b border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0d0d0d]">
                <div className="text-sm font-semibold">Feature</div>
                <div className="text-center text-sm font-semibold text-gray-500">Free</div>
                <div className="text-center text-sm font-semibold text-blue-500">Beta Member</div>
              </div>

              {featureComparison.map((row, i) => (
                <div
                  key={row.feature}
                  className={`grid grid-cols-3 gap-2 p-3 ${i !== featureComparison.length - 1 ? 'border-b border-gray-100 dark:border-[#1a1a1a]' : ''}`}
                >
                  <div className="text-sm text-gray-700 dark:text-slate-300">{row.feature}</div>
                  <div className="text-center">
                    {row.free === true ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : row.free === false ? (
                      <span className="text-gray-300 dark:text-slate-700">—</span>
                    ) : (
                      <span className="text-xs text-amber-500 font-medium">{row.free}</span>
                    )}
                  </div>
                  <div className="text-center">
                    {row.beta === true ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : row.beta === false ? (
                      <span className="text-gray-300 dark:text-slate-700">—</span>
                    ) : (
                      <span className="text-xs text-blue-500 font-medium">{row.beta}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust & Security */}
        <section className="mb-8">
          <div className="text-center mb-6">
            <span className="text-xs font-medium uppercase tracking-wider text-green-500 mb-2 block">Trust & Security</span>
            <h2 className="text-xl font-bold mb-2">Your Data is Safe</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400">We never access your brokerage or execute trades on your behalf</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {trustBadges.map((badge) => (
              <div key={badge.label} className="bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#1a1a1a] rounded-xl p-4 text-center">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <badge.icon className="w-5 h-5 text-green-500" />
                </div>
                <div className="text-sm font-semibold mb-1">{badge.label}</div>
                <div className="text-[10px] text-gray-500">{badge.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 -mx-4 px-4 bg-gradient-to-br from-blue-600 to-indigo-600 mb-0">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold text-white mb-3">Start researching smarter</h2>
            <p className="text-blue-100 mb-6">Free during beta. No credit card required.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button onClick={() => setWaitlistOpen(true)} size="lg" className="bg-white text-blue-600 hover:bg-gray-100 h-12 px-8 font-medium">
                Join Beta Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 h-12 px-6 rounded-lg border border-white/30 text-white hover:bg-white/10 transition-colors font-medium">
                <SiDiscord className="w-5 h-5" />
                Join Discord
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-4 py-8 border-t border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#0a0a0a]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-6 w-6" />
              <span className="font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">QuantEdge Labs</span>
            </div>
            <div className="flex items-center gap-6 text-xs text-gray-500">
              <Link href="/features" className="hover:text-blue-400">Features</Link>
              <Link href="/terms" className="hover:text-blue-400">Terms</Link>
              <Link href="/privacy" className="hover:text-blue-400">Privacy</Link>
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">Discord</a>
            </div>
            <p className="text-[10px] text-gray-400">Not financial advice. Research platform only.</p>
          </div>
        </div>
      </footer>

      <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  );
}
