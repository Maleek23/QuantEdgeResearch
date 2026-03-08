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
  Zap,
  Target,
  LineChart,
  Cpu,
  Newspaper,
  Radar,
} from "lucide-react";
import { useState as useReactState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { CrossAssetOverview, EconomicCalendarWidget, LatestNewsPreview, LatestIdeasPreview } from "@/components/market-intelligence";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { BorderBeam } from "@/components/magicui/border-beam";
import { ShimmerButton } from "@/components/magicui/shimmer-button";

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

// Reusable scroll reveal wrapper
function SectionReveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// Section divider with gradient line
function SectionDivider() {
  return (
    <div className="max-w-7xl mx-auto px-6">
      <div className="h-px bg-gradient-to-r from-transparent via-[#222] to-transparent" />
    </div>
  );
}

// Trading Engines — all emerald accent
const tradingEngines = [
  { id: 'ML', name: 'Machine Learning', desc: 'Neural pattern detection', icon: Cpu },
  { id: 'AI', name: 'AI Analysis', desc: 'Multi-LLM consensus', icon: Brain },
  { id: 'QNT', name: 'Quantitative', desc: 'Statistical arbitrage', icon: BarChart3 },
  { id: 'FLW', name: 'Order Flow', desc: 'Dark pool signals', icon: Activity },
  { id: 'SNT', name: 'Sentiment', desc: 'Social & news alpha', icon: Eye },
  { id: 'TCH', name: 'Technical', desc: 'Chart pattern AI', icon: LineChart },
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

// Engine Convergence Visual
function EngineConvergence() {
  const [activeEngine, setActiveEngine] = useReactState(0);

  return (
    <div className="relative">
      {/* Center convergence point */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
        <div className="relative w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center">
          <div className="absolute inset-[-8px] rounded-full border border-emerald-500/30" style={{ animation: 'pulse-ring 3s ease-in-out infinite' }} />
          <Zap className="w-8 h-8 text-white relative z-10" />
        </div>
      </div>

      {/* Engine cards with staggered entrance */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {tradingEngines.map((engine, i) => (
          <motion.div
            key={engine.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className={cn(
              "relative p-4 rounded-lg border transition-all duration-300 cursor-pointer group overflow-hidden",
              "bg-[#111]",
              activeEngine === i
                ? "border-emerald-500/30"
                : "border-[#222] hover:border-emerald-500/30"
            )}
            onMouseEnter={() => setActiveEngine(i)}
          >
            {/* Hover gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div
              className="w-14 h-14 mx-auto mb-3 rounded-lg flex items-center justify-center bg-emerald-500/10 relative z-10"
            >
              <engine.icon className="w-7 h-7 text-emerald-500" />
            </div>
            <div className="text-center relative z-10">
              <div className="text-sm font-bold text-white mb-0.5">{engine.id}</div>
              <div className="text-[10px] text-slate-500 leading-tight">{engine.desc}</div>
              <div className="text-[10px] font-mono text-emerald-500/50 mt-1">
                {(0.82 + (i * 0.03)).toFixed(2)} conf
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// Market Ticker Component with real data
function MarketTicker() {
  const { data: marketData, isLoading } = useQuery<{ quotes: Record<string, { regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number }> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,DIA,IWM,^VIX,BTC-USD,ETH-USD"],
    refetchInterval: 15000,
  });

  const { status, isOpen } = useMarketStatus();

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
    <div className="bg-[#0a0a0a] border-b border-[#222] overflow-hidden">
      <div className="flex items-center h-9">
        <div className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-[#222] bg-black/50">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isOpen ? "bg-emerald-500" : "bg-slate-500"
          )} />
          <span className={cn(
            "text-xs font-semibold",
            isOpen ? "text-emerald-400" : "text-slate-400"
          )}>{status}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee">
            {[...indices, ...indices].map((idx, i) => {
              const quote = marketData?.quotes?.[idx.apiSymbol];
              const change = safeNumber(quote?.regularMarketChangePercent);
              const hasData = quote?.regularMarketChangePercent !== undefined && quote?.regularMarketChangePercent !== null;
              return (
                <Link key={`${idx.symbol}-${i}`} href={`/stock/${idx.symbol}`}>
                  <div className="flex items-center gap-3 px-5 whitespace-nowrap cursor-pointer hover:bg-white/5 transition-colors">
                    <span className="text-xs font-medium text-slate-400">{idx.symbol}</span>
                    {isLoading || !hasData ? (
                      <div className="w-12 h-3 bg-slate-800 rounded" />
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

// Feature Card with stagger support
function FeatureCard({ icon: Icon, title, description, index = 0 }: { icon: any; title: string; description: string; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="group relative p-6 rounded-lg bg-[#111] border border-[#222] hover:border-emerald-500/20 transition-all duration-300 overflow-hidden"
    >
      {/* Hover shimmer sweep */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 bg-emerald-500/10 relative z-10">
        <Icon className="w-6 h-6 text-emerald-500" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2 relative z-10">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed relative z-10">{description}</p>
    </motion.div>
  );
}

// Terminal Mockup — framer-motion scroll reveal
function TerminalMockup() {
  const trades = [
    { symbol: 'NVDA', dir: 'LONG', engines: '6/6', entry: '$875.20', target: '$920.00', stop: '$855.00', grade: 'A+', bullish: true },
    { symbol: 'AAPL', dir: 'LONG', engines: '5/6', entry: '$188.50', target: '$198.00', stop: '$182.00', grade: 'A', bullish: true },
    { symbol: 'COIN', dir: 'SHORT', engines: '4/6', entry: '$245.00', target: '$220.00', stop: '$258.00', grade: 'B+', bullish: false },
  ];

  return (
    <SectionReveal className="px-6 py-16 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">See it in action</h2>
        <p className="text-sm text-slate-500">Real-time convergence signals from 6 independent engines</p>
      </div>
      <div className="relative rounded-lg border border-[#222] overflow-hidden bg-[#0a0a0a]">
        <BorderBeam colorFrom="#10b981" colorTo="#059669" duration={12} size={150} />
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111] border-b border-[#222]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]/60" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]/60" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]/60" />
          </div>
          <span className="text-[11px] font-mono text-slate-600 ml-2">quantedge — trade-desk</span>
        </div>
        <div className="p-4 font-mono text-xs space-y-2">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-emerald-500/60 mb-3"
          >
            // HIGH-CONVICTION SIGNALS
          </motion.div>
          {trades.map((t, i) => (
            <motion.div
              key={t.symbol}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: (i + 1) * 0.15 }}
              className="flex items-center justify-between p-3 rounded border border-[#222] bg-[#111]/50"
            >
              <div className="flex items-center gap-3">
                <span className="text-white font-bold">{t.symbol}</span>
                <span className={`text-[10px] px-1.5 py-0.5 border rounded ${t.bullish ? 'text-emerald-500 border-emerald-500/30' : 'text-red-500 border-red-500/30'}`}>{t.dir}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-500">{t.engines} engines</span>
              </div>
              <div className="flex items-center gap-4 text-slate-500">
                <span>entry {t.entry}</span>
                <span className="text-emerald-500">target {t.target}</span>
                <span className="text-red-500">stop {t.stop}</span>
                <span className={`font-bold ${t.bullish ? 'text-emerald-400' : 'text-red-400'}`}>{t.grade}</span>
              </div>
            </motion.div>
          ))}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="text-slate-700 mt-3 flex items-center gap-1"
          >
            // updated {new Date().toISOString().split('T')[0]} | 6-engine convergence analysis
            <span className="inline-block w-2 h-4 bg-emerald-500/50 cursor-blink ml-1" />
          </motion.div>
        </div>
      </div>
    </SectionReveal>
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

  const features = [
    { icon: Brain, title: "AI Trade Ideas", description: "Multi-engine convergence signals with entry, target, and stop levels." },
    { icon: Activity, title: "Dark Pool Flow", description: "Track unusual institutional activity and smart money movements." },
    { icon: LineChart, title: "Advanced Charts", description: "50+ technical indicators with pattern recognition AI." },
    { icon: Target, title: "Stock Screener", description: "Filter thousands of stocks by technicals, fundamentals, and signals." },
    { icon: Newspaper, title: "Sentiment Analysis", description: "Real-time news and social media sentiment scoring." },
    { icon: Radar, title: "Market Scanner", description: "Find breakouts, momentum plays, and emerging trends." },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">
      {/* Dot grid background */}
      <div className="fixed inset-0 dot-grid opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#222]">
        <div className="flex items-center justify-between h-16 px-6 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-3">
            <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-9 w-9" />
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl text-white">QuantEdge</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 border border-emerald-500/30 text-emerald-500/70 rounded">LABS</span>
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
                  <Button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 font-medium">
                    Open App
                  </Button>
                </Link>
              ) : (
                <Button onClick={() => setWaitlistOpen(true)} className="bg-white text-black hover:bg-slate-200 px-6 font-medium">
                  Request Access
                </Button>
              )
            ) : (
              <>
                <Link href="/login">
                  <span className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer px-3 py-2">Sign in</span>
                </Link>
                <Button onClick={() => setWaitlistOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 font-medium">
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
          {/* Emerald grid pattern */}
          <div className="absolute inset-0 emerald-grid opacity-30 pointer-events-none" />
          {/* Breathing radial gradient glow */}
          <motion.div
            animate={{ opacity: [0.03, 0.07, 0.03] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.08) 0%, transparent 60%)'
            }}
          />

          {/* Simple badge */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 inline-flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-500/70 text-xs font-mono mb-6"
          >
            AI-Powered Trading Intelligence
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="relative z-10 text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight"
          >
            Trade Smarter with
            <br />
            <span className="text-emerald-500">6-Engine Convergence</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative z-10 text-xl text-slate-400 max-w-2xl mx-auto mb-8"
          >
            When Machine Learning, AI, Quant, Flow, Sentiment, and Technical all agree —
            <span className="text-white font-medium"> that's when we signal.</span>
          </motion.p>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative z-10 max-w-xl mx-auto mb-12"
          >
            <div className="relative flex items-center bg-[#111] border border-[#222] rounded-lg overflow-hidden focus-within:border-emerald-500/50 transition-colors">
              <Search className="w-5 h-5 text-slate-500 ml-4 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search any stock, ETF, or crypto..."
                className="flex-1 px-4 py-4 bg-transparent text-white placeholder-slate-500 outline-none text-base"
              />
              <Button onClick={handleSearch} className="m-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2">
                Analyze
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 mt-3 text-sm text-slate-500">
              <span>Try:</span>
              {['NVDA', 'TSLA', 'AAPL', 'BTC'].map((symbol) => (
                <Link key={symbol} href={`/stock/${symbol}`}>
                  <button className="px-3 py-1 rounded-lg bg-[#111] border border-[#222] hover:border-emerald-500/30 text-slate-300 transition-colors">
                    {symbol}
                  </button>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Stats — NumberTicker */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="relative z-10 grid grid-cols-3 gap-8 max-w-3xl mx-auto mb-16"
          >
            <div className="text-center">
              <NumberTicker value={6} className="text-4xl md:text-5xl font-mono font-bold text-white" />
              <div className="text-sm text-slate-500 mt-1">Analysis Engines</div>
            </div>
            <div className="text-center">
              <NumberTicker value={2500} suffix="+" className="text-4xl md:text-5xl font-mono font-bold text-white" />
              <div className="text-sm text-slate-500 mt-1">Stocks Scanned Daily</div>
            </div>
            <div className="text-center">
              <NumberTicker value={94} suffix="%" className="text-4xl md:text-5xl font-mono font-bold text-white" />
              <div className="text-sm text-slate-500 mt-1">Avg. Accuracy</div>
            </div>
          </motion.div>
        </section>

        {/* Divider */}
        <SectionDivider />

        {/* Terminal Mockup */}
        <TerminalMockup />

        {/* Divider */}
        <SectionDivider />

        {/* Engine Convergence Section */}
        <SectionReveal className="px-6 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">6 Engines. One Signal.</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Our proprietary system runs 6 independent analysis engines on every stock.
              Only when they converge do we generate a high-conviction signal.
            </p>
          </div>
          <EngineConvergence />
        </SectionReveal>

        {/* Divider */}
        <SectionDivider />

        {/* Features Grid */}
        <SectionReveal className="px-6 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Institutional-Grade Tools</h2>
            <p className="text-slate-400">Everything you need to trade like the pros</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <FeatureCard key={feature.title} icon={feature.icon} title={feature.title} description={feature.description} index={i} />
            ))}
          </div>
        </SectionReveal>

        {/* Divider */}
        <SectionDivider />

        {/* Live Market Intelligence */}
        <SectionReveal className="px-6 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-500/30 bg-transparent mb-6">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-emerald-400">Live Data</span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Real-Time Market Intelligence</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Live cross-asset data, economic calendar, breaking news, and AI-generated trade ideas — powering our engines right now.
            </p>
          </div>

          {/* Cross-Asset Overview */}
          <div className="mb-6">
            <CrossAssetOverview variant="landing" />
          </div>

          {/* Economic Calendar + Breaking News side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <EconomicCalendarWidget variant="landing" />
            <LatestNewsPreview variant="landing" />
          </div>

          {/* AI Trade Ideas */}
          <LatestIdeasPreview variant="landing" limit={4} />
        </SectionReveal>

        {/* Divider */}
        <SectionDivider />

        {/* CTA Section */}
        <SectionReveal className="px-6 py-20 max-w-4xl mx-auto text-center">
          <div className="relative p-12 rounded-lg bg-[#111] border border-[#222] overflow-hidden">
            <BorderBeam colorFrom="#10b981" colorTo="#059669" duration={10} size={180} />
            <h2 className="text-4xl font-bold text-white mb-4 relative z-10">Ready to Trade Smarter?</h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto relative z-10">
              Join thousands of traders using AI-powered signals to find high-conviction opportunities.
            </p>
            <div className="flex items-center justify-center gap-4 relative z-10">
              <ShimmerButton
                onClick={() => setWaitlistOpen(true)}
                shimmerColor="#10b981"
                background="rgba(16, 185, 129, 0.15)"
                className="px-8 py-4 text-lg font-bold text-white"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2 inline-block" />
              </ShimmerButton>
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-[#222] text-slate-300 hover:bg-[#111] hover:border-emerald-500/30 px-8 py-6 text-lg">
                  <SiDiscord className="w-5 h-5 mr-2" /> Join Discord
                </Button>
              </a>
            </div>
          </div>
        </SectionReveal>

        {/* Footer */}
        <footer className="px-6 py-12 border-t border-[#222]">
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
