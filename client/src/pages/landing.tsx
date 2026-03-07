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
import { useEffect, useState as useReactState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { CrossAssetOverview, EconomicCalendarWidget, LatestNewsPreview, LatestIdeasPreview } from "@/components/market-intelligence";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

// Trading Engines — all emerald accent
const tradingEngines = [
  { id: 'ML', name: 'Machine Learning', desc: 'Neural pattern detection', color: '#10b981', icon: Cpu },
  { id: 'AI', name: 'AI Analysis', desc: 'Multi-LLM consensus', color: '#10b981', icon: Brain },
  { id: 'QNT', name: 'Quantitative', desc: 'Statistical arbitrage', color: '#10b981', icon: BarChart3 },
  { id: 'FLW', name: 'Order Flow', desc: 'Dark pool signals', color: '#10b981', icon: Activity },
  { id: 'SNT', name: 'Sentiment', desc: 'Social & news alpha', color: '#10b981', icon: Eye },
  { id: 'TCH', name: 'Technical', desc: 'Chart pattern AI', color: '#10b981', icon: LineChart },
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
        <div className="relative w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center">
          <Zap className="w-8 h-8 text-white" />
        </div>
      </div>

      {/* Engine cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {tradingEngines.map((engine, i) => (
          <div
            key={engine.id}
            className={cn(
              "relative p-4 rounded-lg border transition-all duration-300 cursor-pointer group",
              "bg-[#111]",
              activeEngine === i
                ? "border-emerald-500/30"
                : "border-[#222] hover:border-emerald-500/30"
            )}
            onMouseEnter={() => setActiveEngine(i)}
          >
            <div
              className="w-14 h-14 mx-auto mb-3 rounded-lg flex items-center justify-center bg-emerald-500/10"
            >
              <engine.icon className="w-7 h-7 text-emerald-500" />
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-white mb-0.5">{engine.id}</div>
              <div className="text-[10px] text-slate-500 leading-tight">{engine.desc}</div>
            </div>
          </div>
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

// Feature Card
function FeatureCard({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="group relative p-6 rounded-lg bg-[#111] border border-[#222] hover:border-emerald-500/30 transition-all duration-300">
      <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 bg-emerald-500/10">
        <Icon className="w-6 h-6 text-emerald-500" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

// Terminal Mockup — hardcoded example trades
function TerminalMockup() {
  return (
    <section className="px-6 py-16 max-w-5xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">See it in action</h2>
        <p className="text-sm text-slate-500">Real-time convergence signals from 6 independent engines</p>
      </div>
      <div className="rounded-lg border border-[#222] overflow-hidden bg-[#0a0a0a]">
        {/* Terminal header bar with traffic light dots */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#111] border-b border-[#222]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]/60" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]/60" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]/60" />
          </div>
          <span className="text-[11px] font-mono text-slate-600 ml-2">quantedge — trade-desk</span>
        </div>
        {/* Mock content */}
        <div className="p-4 font-mono text-xs space-y-2">
          <div className="text-emerald-500/60 mb-3">// HIGH-CONVICTION SIGNALS</div>
          {[
            { symbol: 'NVDA', dir: 'LONG', engines: '6/6', entry: '$875.20', target: '$920.00', stop: '$855.00', grade: 'A+', bullish: true },
            { symbol: 'AAPL', dir: 'LONG', engines: '5/6', entry: '$188.50', target: '$198.00', stop: '$182.00', grade: 'A', bullish: true },
            { symbol: 'COIN', dir: 'SHORT', engines: '4/6', entry: '$245.00', target: '$220.00', stop: '$258.00', grade: 'B+', bullish: false },
          ].map((t) => (
            <div key={t.symbol} className="flex items-center justify-between p-3 rounded border border-[#222] bg-[#111]/50">
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
                <span className={`font-bold ${t.bullish ? 'text-emerald-400' : 'text-cyan-400'}`}>{t.grade}</span>
              </div>
            </div>
          ))}
          <div className="text-slate-700 mt-3">// updated {new Date().toISOString().split('T')[0]} | 6-engine convergence analysis</div>
        </div>
      </div>
    </section>
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
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a] border-b border-[#222]">
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
          {/* Simple badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-500/70 text-xs font-mono mb-6">
            AI-Powered Trading Intelligence
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            Trade Smarter with
            <br />
            <span className="text-emerald-500">6-Engine Convergence</span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-8">
            When Machine Learning, AI, Quant, Flow, Sentiment, and Technical all agree —
            <span className="text-white font-medium"> that's when we signal.</span>
          </p>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto mb-12">
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
          </div>

          {/* Stats — static, mono numbers */}
          <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto mb-16">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-mono font-bold text-white">6</div>
              <div className="text-sm text-slate-500 mt-1">Analysis Engines</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-mono font-bold text-white">2,500+</div>
              <div className="text-sm text-slate-500 mt-1">Stocks Scanned Daily</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-mono font-bold text-white">94%</div>
              <div className="text-sm text-slate-500 mt-1">Avg. Accuracy</div>
            </div>
          </div>
        </section>

        {/* Terminal Mockup — replaces Live Trade Ideas */}
        <TerminalMockup />

        {/* Engine Convergence Section */}
        <section className="px-6 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">6 Engines. One Signal.</h2>
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
            <h2 className="text-3xl font-bold text-white mb-4">Institutional-Grade Tools</h2>
            <p className="text-slate-400">Everything you need to trade like the pros</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard icon={Brain} title="AI Trade Ideas" description="Multi-engine convergence signals with entry, target, and stop levels." />
            <FeatureCard icon={Activity} title="Dark Pool Flow" description="Track unusual institutional activity and smart money movements." />
            <FeatureCard icon={LineChart} title="Advanced Charts" description="50+ technical indicators with pattern recognition AI." />
            <FeatureCard icon={Target} title="Stock Screener" description="Filter thousands of stocks by technicals, fundamentals, and signals." />
            <FeatureCard icon={Newspaper} title="Sentiment Analysis" description="Real-time news and social media sentiment scoring." />
            <FeatureCard icon={Radar} title="Market Scanner" description="Find breakouts, momentum plays, and emerging trends." />
          </div>
        </section>

        {/* Live Market Intelligence */}
        <section className="px-6 py-20 max-w-7xl mx-auto">
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
        </section>

        {/* CTA Section */}
        <section className="px-6 py-20 max-w-4xl mx-auto text-center">
          <div className="relative p-12 rounded-lg bg-[#111] border border-[#222] overflow-hidden">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Trade Smarter?</h2>
            <p className="text-slate-400 mb-8 max-w-lg mx-auto">
              Join thousands of traders using AI-powered signals to find high-conviction opportunities.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button onClick={() => setWaitlistOpen(true)} size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-6 text-lg font-bold">
                Get Started Free
              </Button>
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-[#222] text-slate-300 hover:bg-[#111] hover:border-emerald-500/30 px-8 py-6 text-lg">
                  <SiDiscord className="w-5 h-5 mr-2" /> Join Discord
                </Button>
              </a>
            </div>
          </div>
        </section>

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
