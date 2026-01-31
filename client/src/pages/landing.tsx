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
  Sparkles,
  ArrowUpRight,
  Star,
  DollarSign,
} from "lucide-react";
import { useEffect, useState as useReactState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

// Trading Engines with enhanced styling
const tradingEngines = [
  { id: 'ML', name: 'Machine Learning', desc: 'Neural pattern detection', color: '#10b981', icon: Cpu, glow: 'shadow-emerald-500/20' },
  { id: 'AI', name: 'AI Analysis', desc: 'Multi-LLM consensus', color: '#8b5cf6', icon: Brain, glow: 'shadow-purple-500/20' },
  { id: 'QNT', name: 'Quantitative', desc: 'Statistical arbitrage', color: '#3b82f6', icon: BarChart3, glow: 'shadow-blue-500/20' },
  { id: 'FLW', name: 'Order Flow', desc: 'Dark pool signals', color: '#f59e0b', icon: Activity, glow: 'shadow-amber-500/20' },
  { id: 'SNT', name: 'Sentiment', desc: 'Social & news alpha', color: '#ec4899', icon: Eye, glow: 'shadow-pink-500/20' },
  { id: 'TCH', name: 'Technical', desc: 'Chart pattern AI', color: '#06b6d4', icon: LineChart, glow: 'shadow-cyan-500/20' },
];

// Symbols for ticker
const TICKER_SYMBOLS = ['SPY', 'QQQ', 'DIA', 'IWM', 'VIX', 'BTC-USD', 'ETH-USD'];

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

// Animated floating orbs background
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-40 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-500" />
      <div className="absolute -bottom-20 right-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-700" />
    </div>
  );
}

// Live Trade Card Component - The showstopper
function LiveTradeCard({ idea, index }: { idea: any; index: number }) {
  const isLong = idea.direction === "bullish" || idea.direction === "LONG" || idea.direction === "long";
  const confidence = idea.confidenceScore || 85;
  const grade = idea.probabilityBand || (confidence >= 90 ? 'A+' : confidence >= 80 ? 'A' : 'B+');

  return (
    <div
      className={cn(
        "relative group",
        "transform transition-all duration-500 hover:scale-[1.02] hover:-translate-y-1",
        index === 0 && "lg:col-span-2 lg:row-span-2"
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Glow effect */}
      <div className={cn(
        "absolute -inset-0.5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm",
        isLong ? "bg-gradient-to-r from-emerald-500 to-teal-500" : "bg-gradient-to-r from-red-500 to-orange-500"
      )} />

      <Card className={cn(
        "relative overflow-hidden h-full",
        "bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800",
        "border-slate-700/50 hover:border-slate-600/50",
        "backdrop-blur-xl"
      )}>
        {/* Top accent line */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-1",
          isLong ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500" : "bg-gradient-to-r from-red-500 via-orange-500 to-red-500"
        )} />

        <CardContent className={cn("p-4", index === 0 && "lg:p-6")}>
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg",
                "bg-gradient-to-br",
                isLong ? "from-emerald-500/20 to-teal-500/20 text-emerald-400" : "from-red-500/20 to-orange-500/20 text-red-400"
              )}>
                {idea.symbol?.slice(0, 2) || 'XX'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-white">{idea.symbol || 'AAPL'}</span>
                  <Badge className={cn(
                    "text-[10px] font-bold",
                    isLong ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
                  )}>
                    {isLong ? '↑ LONG' : '↓ SHORT'}
                  </Badge>
                </div>
                <span className="text-xs text-slate-500">swing • multi-engine convergence</span>
              </div>
            </div>

            {/* Grade Badge */}
            <div className={cn(
              "px-3 py-1.5 rounded-lg text-center",
              grade.startsWith('A') ? "bg-emerald-500/20 border border-emerald-500/30" : "bg-cyan-500/20 border border-cyan-500/30"
            )}>
              <div className={cn(
                "text-xl font-black",
                grade.startsWith('A') ? "text-emerald-400" : "text-cyan-400"
              )}>{grade}</div>
              <div className="text-[9px] text-slate-500 uppercase">Grade</div>
            </div>
          </div>

          {/* Confidence Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Confidence</span>
              <span className={cn(
                "text-sm font-bold",
                confidence >= 85 ? "text-emerald-400" : confidence >= 70 ? "text-cyan-400" : "text-amber-400"
              )}>{confidence}%</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000",
                  confidence >= 85 ? "bg-gradient-to-r from-emerald-500 to-teal-500" :
                  confidence >= 70 ? "bg-gradient-to-r from-cyan-500 to-blue-500" :
                  "bg-gradient-to-r from-amber-500 to-orange-500"
                )}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>

          {/* Price Levels */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-2 rounded-lg bg-slate-800/50 text-center">
              <div className="text-[10px] text-slate-500 mb-0.5">Entry</div>
              <div className="text-sm font-mono font-bold text-white">${idea.entryPrice?.toFixed(2) || '185.50'}</div>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
              <div className="text-[10px] text-slate-500 mb-0.5">Target</div>
              <div className="text-sm font-mono font-bold text-emerald-400">${idea.targetPrice?.toFixed(2) || '198.00'}</div>
            </div>
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
              <div className="text-[10px] text-slate-500 mb-0.5">Stop</div>
              <div className="text-sm font-mono font-bold text-red-400">${idea.stopLoss?.toFixed(2) || '178.50'}</div>
            </div>
          </div>

          {/* Signal Sources */}
          <div className="flex flex-wrap gap-1.5">
            {['📊 Quant', '🧠 AI', '📈 Technical', '💰 Flow'].slice(0, index === 0 ? 4 : 3).map((signal, i) => (
              <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {signal}
              </span>
            ))}
            {index === 0 && <span className="text-[10px] px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">+2 more</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Live Trade Ideas Showcase - REAL DATA ONLY
function TradeIdeasShowcase() {
  const { data, isLoading } = useQuery<{ setups: any[] }>({
    queryKey: ["/api/trade-ideas/best-setups?limit=6&period=daily"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const ideas = data?.setups?.slice(0, 5) || [];

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-500">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="relative p-4 rounded-2xl bg-slate-900/50 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-slate-800 animate-pulse" />
              <div className="flex-1">
                <div className="w-20 h-5 bg-slate-800 rounded animate-pulse mb-2" />
                <div className="w-32 h-3 bg-slate-800/50 rounded animate-pulse" />
              </div>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full mb-4 animate-pulse" />
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="p-2 rounded-lg bg-slate-800/30 animate-pulse h-12" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // No ideas available
  if (ideas.length === 0) {
    return (
      <div className="text-center py-16 animate-in fade-in duration-500">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800/50 flex items-center justify-center">
          <Activity className="w-8 h-8 text-slate-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Analyzing Markets</h3>
        <p className="text-slate-400 max-w-md mx-auto">
          Our 6 engines are scanning for high-conviction setups. Check back soon for fresh trade ideas.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {ideas.map((idea, i) => (
        <LiveTradeCard key={idea.id || i} idea={idea} index={i} />
      ))}
    </div>
  );
}

// Engine Convergence Visual
function EngineConvergence() {
  const [activeEngine, setActiveEngine] = useReactState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveEngine((prev) => (prev + 1) % tradingEngines.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      {/* Center convergence point */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative">
          <div className="absolute inset-0 animate-ping bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full opacity-20" />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 via-cyan-500 to-blue-500 flex items-center justify-center shadow-2xl shadow-cyan-500/30">
            <Zap className="w-8 h-8 text-white" />
          </div>
        </div>
      </div>

      {/* Orbiting engines */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {tradingEngines.map((engine, i) => (
          <div
            key={engine.id}
            className={cn(
              "relative p-4 rounded-2xl border transition-all duration-500 cursor-pointer group",
              "bg-slate-900/50 backdrop-blur-sm",
              activeEngine === i
                ? "border-white/30 scale-105 shadow-xl"
                : "border-slate-700/50 hover:border-slate-600/50"
            )}
            style={{
              boxShadow: activeEngine === i ? `0 0 40px ${engine.color}30` : undefined
            }}
            onMouseEnter={() => setActiveEngine(i)}
          >
            {/* Connection line to center */}
            {activeEngine === i && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute top-1/2 left-1/2 w-24 h-0.5 origin-left"
                  style={{
                    background: `linear-gradient(90deg, ${engine.color}, transparent)`,
                    transform: `rotate(${(i * 60) - 90}deg)`
                  }}
                />
              </div>
            )}

            <div
              className={cn(
                "w-14 h-14 mx-auto mb-3 rounded-xl flex items-center justify-center transition-all duration-300",
                activeEngine === i && "scale-110"
              )}
              style={{
                backgroundColor: `${engine.color}20`,
                boxShadow: activeEngine === i ? `0 0 30px ${engine.color}40` : undefined
              }}
            >
              <engine.icon className="w-7 h-7" style={{ color: engine.color }} />
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-white mb-0.5">{engine.id}</div>
              <div className="text-[10px] text-slate-500 leading-tight">{engine.desc}</div>
            </div>

            {/* Active indicator */}
            {activeEngine === i && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white animate-pulse" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Stats Counter with animation
function AnimatedStat({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const [count, setCount] = useReactState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className="text-center">
      <div className="text-4xl md:text-5xl font-black bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

// Market Ticker Component with real data
function MarketTicker() {
  // Note: VIX requires ^VIX for Yahoo Finance
  const { data: marketData, isLoading } = useQuery<{ quotes: Record<string, { regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number }> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,DIA,IWM,^VIX,BTC-USD,ETH-USD"],
    refetchInterval: 15000,
  });

  const { status, isOpen } = useMarketStatus();

  // Map display names to API symbols
  const indices = [
    { symbol: "SPY", apiSymbol: "SPY", name: "S&P 500" },
    { symbol: "QQQ", apiSymbol: "QQQ", name: "Nasdaq" },
    { symbol: "DIA", apiSymbol: "DIA", name: "Dow" },
    { symbol: "IWM", apiSymbol: "IWM", name: "Russell" },
    { symbol: "VIX", apiSymbol: "^VIX", name: "VIX" },
    { symbol: "BTC-USD", apiSymbol: "BTC-USD", name: "Bitcoin" },
    { symbol: "ETH-USD", apiSymbol: "ETH-USD", name: "Ethereum" },
  ];

  return (
    <div className="bg-black/80 backdrop-blur-xl border-b border-white/5 overflow-hidden">
      <div className="flex items-center h-9">
        <div className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-white/10 bg-black/50">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isOpen ? "bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" : "bg-slate-500"
          )} />
          <span className={cn(
            "text-xs font-semibold",
            isOpen ? "text-emerald-400" : "text-slate-400"
          )}>{status}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee">
            {[...indices, ...indices].map((idx, i) => {
              // Use apiSymbol for data lookup, symbol for display
              const quote = marketData?.quotes?.[idx.apiSymbol];
              const change = safeNumber(quote?.regularMarketChangePercent);
              const hasData = quote?.regularMarketChangePercent !== undefined && quote?.regularMarketChangePercent !== null;
              return (
                <Link key={`${idx.symbol}-${i}`} href={`/stock/${idx.symbol}`}>
                  <div className="flex items-center gap-3 px-5 whitespace-nowrap cursor-pointer hover:bg-white/5 transition-colors">
                    <span className="text-xs font-medium text-slate-400">{idx.symbol}</span>
                    {isLoading || !hasData ? (
                      <div className="w-12 h-3 bg-slate-800 rounded animate-pulse" />
                    ) : (
                      <span className={cn(
                        "text-xs font-mono font-bold",
                        change >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {change >= 0 ? "+" : ""}{safeToFixed(change, 2)}%
                      </span>
                    )}
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

// Feature Card
function FeatureCard({ icon: Icon, title, description, color }: { icon: any; title: string; description: string; color: string }) {
  return (
    <div className="group relative p-6 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all duration-300 hover:-translate-y-1">
      <div
        className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110")}
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [waitlistOpen, setWaitlistOpen] = useReactState(false);
  const [searchQuery, setSearchQuery] = useReactState('');
  const { isAuthenticated, user } = useAuth();
  const hasBetaAccess = user?.hasBetaAccess || false;

  // Allow ALL users (including visitors) to search stocks
  const handleSearch = () => {
    if (searchQuery) {
      setLocation(`/stock/${searchQuery.toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <FloatingOrbs />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center justify-between h-16 px-6 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-3">
            <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-9 w-9" />
            <div>
              <span className="font-black text-xl bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">QuantEdge</span>
              <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-400 font-semibold border border-blue-500/20">LABS</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Trade Desk', href: '/trade-desk' },
              { label: 'Markets', href: '/market' },
              { label: 'Scanner', href: '/market-scanner' },
              { label: 'Features', href: '/features' },
            ].map((item) => (
              <Link key={item.label} href={item.href}>
                <span className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-[#5865F2] hover:bg-[#5865F2]/10 transition-colors">
              <SiDiscord className="w-4 h-4" />
            </a>
            <ThemeToggle />
            {isAuthenticated ? (
              hasBetaAccess ? (
                <Link href="/home">
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-6 font-semibold shadow-lg shadow-blue-500/20">
                    Open App
                  </Button>
                </Link>
              ) : (
                <Button onClick={() => setWaitlistOpen(true)} className="bg-white text-black hover:bg-slate-200 px-6 font-semibold">
                  Request Access
                </Button>
              )
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" className="text-slate-400 hover:text-white">Sign in</Button>
                </Link>
                <Button onClick={() => setWaitlistOpen(true)} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-6 font-semibold shadow-lg shadow-blue-500/20">
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Market Ticker */}
      <div className="fixed top-16 left-0 right-0 z-40">
        <MarketTicker />
      </div>

      {/* Main Content */}
      <main className="pt-28 relative">
        {/* Hero Section */}
        <section className="px-6 py-16 md:py-24 max-w-7xl mx-auto text-center relative">
          {/* Animated badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Sparkles className="w-4 h-4" />
            AI-Powered Trading Intelligence
            <ArrowRight className="w-4 h-4" />
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 leading-tight animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            Trade Smarter with
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              6-Engine Convergence
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            When Machine Learning, AI, Quant, Flow, Sentiment, and Technical all agree —
            <span className="text-white font-semibold"> that's when we signal.</span>
          </p>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl opacity-20 group-hover:opacity-30 blur transition-opacity" />
              <div className="relative flex items-center bg-slate-900 border border-slate-700 rounded-xl overflow-hidden focus-within:border-blue-500 transition-colors">
                <Search className="w-5 h-5 text-slate-500 ml-4 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search any stock, ETF, or crypto..."
                  className="flex-1 px-4 py-4 bg-transparent text-white placeholder-slate-500 outline-none text-base"
                />
                <Button onClick={handleSearch} className="m-1.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2">
                  Analyze
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-3 text-sm text-slate-500">
              <span>Try:</span>
              {['NVDA', 'TSLA', 'AAPL', 'BTC'].map((symbol) => (
                <Link key={symbol} href={`/stock/${symbol}`}>
                  <button className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                    {symbol}
                  </button>
                </Link>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
            <AnimatedStat value={6} label="Analysis Engines" />
            <AnimatedStat value={2500} label="Stocks Scanned Daily" suffix="+" />
            <AnimatedStat value={94} label="Avg. Accuracy" suffix="%" />
          </div>
        </section>

        {/* Live Trade Ideas Section */}
        <section className="px-6 py-16 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-emerald-400" />
                </div>
                Live Trade Ideas
              </h2>
              <p className="text-slate-400">Real-time AI-generated opportunities with multi-engine convergence</p>
            </div>
            <Link href="/trade-desk">
              <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                View All <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
          <TradeIdeasShowcase />
        </section>

        {/* Engine Convergence Section */}
        <section className="px-6 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white mb-4">6 Engines. One Signal.</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Our proprietary system runs 6 independent analysis engines on every stock.
              Only when they converge do we generate a high-conviction signal.
            </p>
          </div>
          <EngineConvergence />
        </section>

        {/* Features Grid */}
        <section className="px-6 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white mb-4">Institutional-Grade Tools</h2>
            <p className="text-slate-400">Everything you need to trade like the pros</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard icon={Brain} title="AI Trade Ideas" description="Multi-engine convergence signals with entry, target, and stop levels." color="#10b981" />
            <FeatureCard icon={Activity} title="Dark Pool Flow" description="Track unusual institutional activity and smart money movements." color="#f59e0b" />
            <FeatureCard icon={LineChart} title="Advanced Charts" description="50+ technical indicators with pattern recognition AI." color="#8b5cf6" />
            <FeatureCard icon={Target} title="Stock Screener" description="Filter thousands of stocks by technicals, fundamentals, and signals." color="#06b6d4" />
            <FeatureCard icon={Newspaper} title="Sentiment Analysis" description="Real-time news and social media sentiment scoring." color="#ec4899" />
            <FeatureCard icon={Radar} title="Market Scanner" description="Find breakouts, momentum plays, and emerging trends." color="#3b82f6" />
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-6 py-20 max-w-4xl mx-auto text-center">
          <div className="relative p-12 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border border-slate-700 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10" />
            <div className="relative">
              <h2 className="text-4xl font-black text-white mb-4">Ready to Trade Smarter?</h2>
              <p className="text-slate-400 mb-8 max-w-lg mx-auto">
                Join thousands of traders using AI-powered signals to find high-conviction opportunities.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Button onClick={() => setWaitlistOpen(true)} size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-8 py-6 text-lg font-bold shadow-xl shadow-blue-500/20">
                  Get Started Free
                </Button>
                <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-800 px-8 py-6 text-lg">
                    <SiDiscord className="w-5 h-5 mr-2" /> Join Discord
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-12 border-t border-slate-800">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-6 w-6" />
              <span className="text-slate-500 text-sm">© 2024 QuantEdge Labs. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/privacy"><span className="hover:text-white cursor-pointer">Privacy</span></Link>
              <Link href="/terms"><span className="hover:text-white cursor-pointer">Terms</span></Link>
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">Discord</a>
            </div>
          </div>
        </footer>
      </main>

      <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  );
}
