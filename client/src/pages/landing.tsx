import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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
  ScanLine,
  Shield,
  Lock,
  CheckCircle2,
  Users,
} from "lucide-react";
import { useEffect, useState as useReactState } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";

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
}

interface EarningsItem {
  symbol: string;
  companyName: string;
  reportDate: string;
  timing: string;
  epsEstimate: number | null;
}

interface MoverItem {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
}

// Fallback data
const fallbackMarketIndices = [
  { symbol: 'SPY', price: 480.50, change: 0.45 },
  { symbol: 'QQQ', price: 425.30, change: 0.62 },
  { symbol: 'DIA', price: 382.20, change: 0.28 },
  { symbol: 'IWM', price: 198.40, change: -0.15 },
  { symbol: 'VIX', price: 14.80, change: -2.30 },
  { symbol: 'BTC-USD', price: 42500, change: 1.2 },
];

const fallbackTrendingTickers = [
  { symbol: 'NVDA', name: 'NVIDIA', price: 875.50, change: 3.2, data: [40, 45, 48, 52, 55, 58, 62, 68] },
  { symbol: 'TSLA', name: 'Tesla', price: 245.80, change: 1.8, data: [42, 44, 46, 48, 50, 52, 54, 56] },
  { symbol: 'AAPL', name: 'Apple', price: 185.20, change: 0.9, data: [45, 46, 47, 48, 49, 50, 51, 52] },
  { symbol: 'AMD', name: 'AMD', price: 165.40, change: 2.1, data: [38, 42, 45, 48, 52, 55, 58, 60] },
  { symbol: 'META', name: 'Meta', price: 485.60, change: 1.5, data: [40, 42, 44, 46, 48, 50, 52, 54] },
  { symbol: 'PLTR', name: 'Palantir', price: 24.80, change: 4.2, data: [35, 40, 45, 50, 55, 60, 65, 70] },
];

const fallbackNews = [
  { title: 'Markets Rally on Fed Commentary', time: '2h ago', source: 'Bloomberg' },
  { title: 'Tech Stocks Lead Morning Gains', time: '4h ago', source: 'Reuters' },
  { title: 'Earnings Season Kicks Off Strong', time: '6h ago', source: 'CNBC' },
  { title: 'Oil Prices Surge on Supply Concerns', time: '8h ago', source: 'WSJ' },
];

const fallbackEarnings = [
  { symbol: 'AAPL', name: 'Apple', date: 'Jan 30', time: 'AMC' },
  { symbol: 'MSFT', name: 'Microsoft', date: 'Jan 30', time: 'AMC' },
  { symbol: 'AMZN', name: 'Amazon', date: 'Feb 1', time: 'AMC' },
  { symbol: 'GOOGL', name: 'Alphabet', date: 'Feb 4', time: 'AMC' },
];

// Trust Badges
const trustBadges = [
  { icon: Lock, label: '256-bit SSL', desc: 'Bank-grade encryption' },
  { icon: Shield, label: 'Read-Only', desc: 'No trading access needed' },
  { icon: Users, label: 'Privacy First', desc: 'Your data stays yours' },
  { icon: CheckCircle2, label: 'SOC 2', desc: 'Enterprise compliant' },
];

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

// Trade Desk Card - Real-time trade ideas with animated engine signals
function TradeDeskCard() {
  const [activeEngines, setActiveEngines] = useReactState<number[]>([]);
  const [showResult, setShowResult] = useReactState(false);
  const [currentIdeaIndex, setCurrentIdeaIndex] = useReactState(0);

  // Fetch real trade ideas from API
  const { data: tradeIdeasData } = useQuery({
    queryKey: ['/api/trade-ideas/best-setups'],
    queryFn: async () => {
      const res = await fetch('/api/trade-ideas/best-setups?limit=5');
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const ideas = tradeIdeasData?.ideas || [];
  const currentIdea = ideas[currentIdeaIndex] || null;

  // Fallback data if no ideas
  const displayIdea = currentIdea || {
    symbol: 'NVDA',
    companyName: 'NVIDIA Corp',
    direction: 'LONG',
    currentPrice: 875.42,
    entryPrice: 872,
    targetPrice: 920,
    stopLoss: 845,
    confidenceScore: 87,
    bullishEngines: 5,
    totalEngines: 6,
  };

  const isLong = displayIdea.direction === 'LONG' || displayIdea.direction === 'long';
  const bullishCount = displayIdea.bullishEngines || 5;

  // Animate engines lighting up - simulates real-time signal detection
  useEffect(() => {
    setActiveEngines([]);
    setShowResult(false);

    // Determine which engines are "bullish" based on bullishCount
    const engineCount = Math.min(bullishCount, 6);
    const engineSequence = [0, 5, 4, 2, 3, 1].slice(0, engineCount); // ML, TCH, SNT, QNT, FLW, AI
    const delays = [600, 1100, 1600, 2000, 2400, 2800];

    const timers: NodeJS.Timeout[] = [];

    engineSequence.forEach((engineIdx, i) => {
      const timer = setTimeout(() => {
        setActiveEngines(prev => [...prev, engineIdx]);
      }, delays[i]);
      timers.push(timer);
    });

    // Show final result
    const resultTimer = setTimeout(() => {
      setShowResult(true);
    }, delays[engineCount - 1] + 500);
    timers.push(resultTimer);

    return () => timers.forEach(t => clearTimeout(t));
  }, [currentIdeaIndex, bullishCount]);

  // Cycle through ideas
  useEffect(() => {
    if (ideas.length <= 1) return;

    const cycleInterval = setInterval(() => {
      setCurrentIdeaIndex(prev => (prev + 1) % ideas.length);
    }, 8000);

    return () => clearInterval(cycleInterval);
  }, [ideas.length]);

  return (
    <Link href="/trade-desk">
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4 text-white hover:border-cyan-500/50 transition-all cursor-pointer group">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-500" />
            <span className="text-sm font-semibold text-cyan-400">Trade Desk</span>
            <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 transition-colors" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400">Live</span>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{displayIdea.symbol}</span>
              {showResult && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium animate-in fade-in duration-300 ${
                  isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {isLong ? 'LONG' : 'SHORT'}
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500">{displayIdea.companyName}</span>
          </div>
          <div className="text-right">
            <div className="text-xl font-mono font-bold">
              ${typeof displayIdea.currentPrice === 'number' ? displayIdea.currentPrice.toFixed(2) : displayIdea.currentPrice}
            </div>
            {showResult && (
              <span className={`text-xs font-mono ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>
                {bullishCount}/6 engines
              </span>
            )}
          </div>
        </div>

        {/* Real-time Engine Signals */}
        <div className="mb-3 p-3 bg-[#111] rounded-lg border border-[#1a1a1a]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">6-Engine Analysis</span>
            <span className="text-xs font-mono text-cyan-400">
              {showResult ? `${displayIdea.confidenceScore || 87}%` : 'Scanning...'}
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {tradingEngines.map((engine, idx) => {
              const isActive = activeEngines.includes(idx);
              return (
                <div
                  key={engine.id}
                  className={`relative p-2 rounded-lg text-center transition-all duration-500 ${
                    isActive
                      ? 'bg-emerald-500/20 border border-emerald-500/50 scale-105'
                      : 'bg-[#0d0d0d] border border-[#222]'
                  }`}
                >
                  <engine.icon className={`w-3.5 h-3.5 mx-auto mb-1 transition-colors duration-300 ${
                    isActive ? 'text-emerald-400' : 'text-slate-600'
                  }`} />
                  <span className={`text-[9px] font-bold block transition-colors duration-300 ${
                    isActive ? 'text-emerald-400' : 'text-slate-600'
                  }`}>
                    {engine.id}
                  </span>
                  {isActive && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Trade Levels - Show when analysis complete */}
        {showResult && (
          <div className="animate-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-4 gap-1.5 mb-3 text-center">
              <div className="p-1.5 bg-[#111] rounded">
                <div className="text-[9px] text-slate-500">Entry</div>
                <div className="text-xs font-mono">${displayIdea.entryPrice}</div>
              </div>
              <div className="p-1.5 bg-emerald-500/10 rounded">
                <div className="text-[9px] text-emerald-400">Target</div>
                <div className="text-xs font-mono text-emerald-400">${displayIdea.targetPrice}</div>
              </div>
              <div className="p-1.5 bg-red-500/10 rounded">
                <div className="text-[9px] text-red-400">Stop</div>
                <div className="text-xs font-mono text-red-400">${displayIdea.stopLoss}</div>
              </div>
              <div className="p-1.5 bg-cyan-500/10 rounded">
                <div className="text-[9px] text-cyan-400">Score</div>
                <div className="text-xs font-mono text-cyan-400">{displayIdea.confidenceScore || 87}%</div>
              </div>
            </div>
          </div>
        )}

        {/* Engine Status Bar */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {tradingEngines.map((e, i) => (
              <span
                key={e.id}
                className={`px-1 py-0.5 rounded text-[9px] font-medium transition-all duration-300 ${
                  activeEngines.includes(i)
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-[#222] text-slate-600'
                }`}
              >
                {e.id}
              </span>
            ))}
          </div>
          <span className="text-[10px] text-emerald-400">
            {activeEngines.length}/6 {isLong ? 'Bullish' : 'Bearish'}
          </span>
        </div>

        {/* Ideas count indicator */}
        {ideas.length > 1 && (
          <div className="flex items-center justify-center gap-1 mt-3">
            {ideas.slice(0, 5).map((_: unknown, i: number) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === currentIdeaIndex ? 'bg-cyan-400' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
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

export default function Landing() {
  const [, setLocation] = useLocation();
  const [waitlistOpen, setWaitlistOpen] = useReactState(false);
  const [searchQuery, setSearchQuery] = useReactState('');
  const { isAuthenticated, user } = useAuth();
  const hasBetaAccess = user?.hasBetaAccess || false;

  // Fetch market data
  const { data: marketDataRaw } = useQuery<MarketDataResponse>({
    queryKey: ['/api/market-data/batch', TICKER_SYMBOLS.join(',')],
    queryFn: async () => {
      const res = await fetch(`/api/market-data/batch/${TICKER_SYMBOLS.join(',')}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const marketIndices = marketDataRaw?.quotes && Object.keys(marketDataRaw.quotes).length > 0
    ? Object.entries(marketDataRaw.quotes).map(([symbol, quote]) => ({
        symbol,
        price: quote.regularMarketPrice,
        change: quote.regularMarketChangePercent,
      }))
    : fallbackMarketIndices;

  // Fetch movers
  const { data: moversData } = useQuery<{ topGainers: MoverItem[] }>({
    queryKey: ['/api/market-movers'],
    queryFn: async () => {
      const res = await fetch('/api/market-movers');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const trendingTickers = moversData?.topGainers?.slice(0, 6).map((mover, idx) => ({
    symbol: mover.symbol,
    name: mover.name?.split(' ')[0] || mover.symbol,
    price: mover.price,
    change: mover.changePercent,
    data: mover.changePercent >= 0
      ? [40 + idx * 2, 42 + idx * 2, 45 + idx * 2, 48 + idx * 2, 50 + idx * 2, 52 + idx * 2, 55 + idx * 2, 58 + idx * 2]
      : [58 - idx * 2, 55 - idx * 2, 52 - idx * 2, 50 - idx * 2, 48 - idx * 2, 45 - idx * 2, 42 - idx * 2, 40 - idx * 2],
  })) || fallbackTrendingTickers;

  // Fetch news
  const { data: newsData } = useQuery<{ news: NewsItem[] }>({
    queryKey: ['/api/news'],
    queryFn: async () => {
      const res = await fetch('/api/news?limit=4');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 300000,
    refetchInterval: 300000,
  });

  const breakingNews = newsData?.news?.slice(0, 4).map(item => ({
    title: item.title,
    time: formatTimeAgo(item.publishedAt),
    source: item.source,
  })) || fallbackNews;

  // Fetch earnings
  const { data: earningsData } = useQuery<{ earnings: EarningsItem[] }>({
    queryKey: ['/api/earnings/upcoming'],
    queryFn: async () => {
      const res = await fetch('/api/earnings/upcoming?days=7');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 600000,
    refetchInterval: 600000,
  });

  const upcomingEarnings = earningsData?.earnings?.slice(0, 4).map(item => ({
    symbol: item.symbol,
    name: item.companyName?.split(' ')[0] || item.symbol,
    date: formatEarningsDate(item.reportDate),
    time: item.timing === 'bmo' ? 'BMO' : item.timing === 'amc' ? 'AMC' : 'TBD',
  })) || fallbackEarnings;

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
              <span className="font-bold text-lg bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">QuantEdge</span>
              <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">Labs</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link href="/market"><span className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">Markets</span></Link>
            <Link href="/market-scanner"><span className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">Scanner</span></Link>
            <Link href="/features"><span className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer">Features</span></Link>
          </nav>

          <div className="flex items-center gap-2">
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:text-[#5865F2] hover:bg-[#5865F2]/10 transition-colors">
              <SiDiscord className="w-4 h-4" />
            </a>
            <ThemeToggle />
            {isAuthenticated ? (
              hasBetaAccess ? (
                <Link href="/home">
                  <Button size="sm" className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white h-8 px-4 text-xs font-medium">
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
                <Button size="sm" onClick={() => setWaitlistOpen(true)} className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white h-8 px-4 text-xs font-medium">
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Market Ticker */}
      <div className="fixed top-14 left-0 right-0 z-40 bg-gray-50 dark:bg-[#0d0d0d] border-b border-gray-200 dark:border-[#1a1a1a]">
        <div className="flex items-center h-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-1.5 px-3 border-r border-gray-200 dark:border-[#222]">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">LIVE</span>
          </div>
          <div className="flex-1 flex items-center gap-6 px-4 overflow-x-auto scrollbar-hide">
            {marketIndices.map((idx) => (
              <div key={idx.symbol} className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-[11px] font-medium text-gray-500 dark:text-slate-500">{idx.symbol}</span>
                <span className={`text-[11px] font-mono font-medium ${idx.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="pt-[88px]">
        {/* Hero Section - Clean & Focused */}
        <section className="px-4 py-12 lg:py-16">
          <div className="max-w-6xl mx-auto">
            {/* Tagline */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium mb-6">
                <Zap className="w-3 h-3" />
                Institutional-grade research for retail traders
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 leading-tight">
                Your AI<br />
                <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">Research Hub</span>
              </h1>

              <p className="text-lg text-gray-600 dark:text-slate-400 max-w-xl mx-auto mb-8">
                6 trading engines analyze every stock. When they converge, you get a signal.
              </p>

              {/* Search Bar */}
              <div className="max-w-lg mx-auto mb-6">
                <div className="relative">
                  <div className="flex items-center bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-xl overflow-hidden focus-within:border-emerald-500 dark:focus-within:border-emerald-500 transition-colors">
                    <Search className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Search any stock, ETF, or crypto..."
                      className="flex-1 px-3 py-3.5 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none text-sm"
                    />
                    <Button onClick={handleSearch} className="m-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white h-9 px-5 text-sm">
                      Search
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-500">
                  <span>Try:</span>
                  {['NVDA', 'TSLA', 'AAPL', 'SPY'].map((symbol) => (
                    <button
                      key={symbol}
                      onClick={() => { setSearchQuery(symbol); if (isAuthenticated) setLocation(`/stock/${symbol}`); else setWaitlistOpen(true); }}
                      className="px-2 py-0.5 rounded bg-gray-100 dark:bg-[#1a1a1a] hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3-Column Layout: Trending | AI Pick | News/Earnings */}
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Trending Tickers */}
              <div className="bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#1a1a1a] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-semibold">Trending</span>
                  </div>
                  <Link href="/market" className="text-xs text-gray-500 hover:text-emerald-500 flex items-center gap-0.5">
                    More <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-2">
                  {trendingTickers.slice(0, 5).map((ticker) => (
                    <Link key={ticker.symbol} href={`/stock/${ticker.symbol}`}>
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1a1a1a] transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-[#222] flex items-center justify-center text-xs font-bold">
                            {ticker.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{ticker.symbol}</div>
                            <div className="text-[10px] text-gray-500">{ticker.name}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono">${ticker.price.toFixed(2)}</div>
                          <div className={`text-[10px] font-mono ${ticker.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {ticker.change >= 0 ? '+' : ''}{ticker.change.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Trade Desk - Real-time Signals */}
              <TradeDeskCard />

              {/* News & Earnings */}
              <div className="space-y-4">
                {/* News */}
                <div className="bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#1a1a1a] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Newspaper className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold">News</span>
                  </div>
                  <div className="space-y-2">
                    {breakingNews.slice(0, 3).map((news, i) => (
                      <div key={i} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1a1a1a] transition-colors cursor-pointer">
                        <p className="text-xs text-gray-900 dark:text-white line-clamp-1">{news.title}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                          <span>{news.source}</span>
                          <span>·</span>
                          <span>{news.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Earnings */}
                <div className="bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#1a1a1a] rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-semibold">Earnings</span>
                  </div>
                  <div className="space-y-2">
                    {upcomingEarnings.map((earning) => (
                      <Link key={earning.symbol} href={`/stock/${earning.symbol}`}>
                        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1a1a1a] transition-colors cursor-pointer">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{earning.symbol}</span>
                            <span className="text-[10px] text-gray-500">{earning.name}</span>
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {earning.date} · {earning.time}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Engines Section - Compact */}
        <section className="px-4 py-12 bg-gray-50 dark:bg-[#0d0d0d] border-y border-gray-200 dark:border-[#1a1a1a]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">6 Engines. 1 Signal.</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">When they converge, you trade.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {tradingEngines.map((engine) => (
                <div key={engine.id} className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#1a1a1a] rounded-xl p-4 text-center hover:border-emerald-500/50 transition-colors">
                  <div className="w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: `${engine.color}15` }}>
                    <engine.icon className="w-5 h-5" style={{ color: engine.color }} />
                  </div>
                  <div className="text-xs font-mono font-bold mb-1" style={{ color: engine.color }}>{engine.id}</div>
                  <div className="text-xs font-medium text-gray-900 dark:text-white">{engine.name}</div>
                  <div className="text-[10px] text-gray-500 dark:text-slate-500">{engine.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="px-4 py-12 bg-gray-50 dark:bg-[#0d0d0d] border-y border-gray-200 dark:border-[#1a1a1a]">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <span className="text-xs font-medium uppercase tracking-wider text-purple-500 mb-2 block">Access Levels</span>
              <h2 className="text-2xl font-bold mb-2">Free to Try, Powerful When Unlocked</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">Start exploring instantly. Apply for beta to unlock everything.</p>
            </div>

            <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#1a1a1a] rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-3 gap-2 p-4 border-b border-gray-200 dark:border-[#1a1a1a] bg-gray-50 dark:bg-[#0d0d0d]">
                <div className="text-sm font-semibold">Feature</div>
                <div className="text-center text-sm font-semibold text-gray-500">Free</div>
                <div className="text-center text-sm font-semibold text-emerald-500">Beta Member</div>
              </div>

              {/* Table Rows */}
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
                      <span className="text-xs text-emerald-500 font-medium">{row.beta}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-xs text-gray-500 mt-4">
              Beta spots are limited. Apply now to get early access.
            </p>
          </div>
        </section>

        {/* Trust & Security Section */}
        <section className="px-4 py-12">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <span className="text-xs font-medium uppercase tracking-wider text-green-500 mb-2 block">Trust & Security</span>
              <h2 className="text-2xl font-bold mb-2">Your Data is Safe</h2>
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
          </div>
        </section>

        {/* Simple CTA */}
        <section className="px-4 py-16 bg-gradient-to-br from-emerald-500 to-cyan-500">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Start researching smarter</h2>
            <p className="text-emerald-100 mb-6">Free during beta. No credit card required.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button onClick={() => setWaitlistOpen(true)} size="lg" className="bg-white text-emerald-600 hover:bg-gray-100 h-12 px-8 font-medium">
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

        {/* Footer */}
        <footer className="px-4 py-8 border-t border-gray-200 dark:border-[#1a1a1a]">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-6 w-6" />
                <span className="font-semibold bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">QuantEdge Labs</span>
              </div>
              <div className="flex items-center gap-6 text-xs text-gray-500">
                <Link href="/features" className="hover:text-emerald-500">Features</Link>
                <Link href="/terms" className="hover:text-emerald-500">Terms</Link>
                <Link href="/privacy" className="hover:text-emerald-500">Privacy</Link>
                <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-500">Discord</a>
              </div>
              <p className="text-[10px] text-gray-400">Not financial advice. Research platform only.</p>
            </div>
          </div>
        </footer>
      </main>

      <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  );
}
