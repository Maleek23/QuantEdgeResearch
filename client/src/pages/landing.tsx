import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowRight,
  Search,
  Brain,
  Activity,
  Target,
  Radar,
  BarChart3,
  Eye,
  LineChart,
  Cpu,
  Zap,
} from "lucide-react";
import { useState as useReactState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { BorderBeam } from "@/components/magicui/border-beam";

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

// ─── Helpers ────────────────────────────────────────────────────
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

function SectionDivider() {
  return (
    <div className="max-w-7xl mx-auto px-6">
      <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}

// ─── Market Ticker ──────────────────────────────────────────────
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
    { symbol: "BTC", apiSymbol: "BTC-USD", name: "Bitcoin" },
    { symbol: "ETH", apiSymbol: "ETH-USD", name: "Ethereum" },
  ];

  return (
    <div className="bg-[var(--surface-base)] border-b border-border overflow-hidden">
      <div className="flex items-center h-9">
        <div className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-border bg-[var(--surface-base)]/50">
          <div className={cn("w-2 h-2 rounded-full", isOpen ? "bg-[var(--trade-bullish)]" : "bg-muted-foreground")} />
          <span className={cn("text-xs font-semibold", isOpen ? "text-[var(--trade-bullish)]" : "text-muted-foreground")}>{status}</span>
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
                    <span className="text-xs font-medium text-muted-foreground">{idx.symbol}</span>
                    {isLoading || !hasData ? (
                      <div className="w-12 h-3 bg-muted rounded" />
                    ) : (
                      <span className={cn("text-xs font-mono font-bold", change >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
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

// ─── Product Screenshot with browser chrome ─────────────────────
function ProductShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative rounded-xl border border-border/60 overflow-hidden bg-card shadow-2xl shadow-black/30">
      {/* Browser chrome bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/50" />
        </div>
        <span className="text-[9px] font-mono text-muted-foreground/50 ml-2">quantedgelab.net</span>
      </div>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full h-auto block"
      />
    </div>
  );
}

// ─── Feature Section (alternating layout) ───────────────────────
interface FeatureSectionProps {
  label: string;
  labelColor: string;
  headline: string;
  description: string;
  screenshot: string;
  screenshotAlt: string;
  reverse?: boolean;
  bullets?: string[];
}

function FeatureSection({ label, labelColor, headline, description, screenshot, screenshotAlt, reverse, bullets }: FeatureSectionProps) {
  return (
    <SectionReveal className="px-6 py-16 md:py-24 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Screenshot (shown first on reversed) */}
        {reverse && (
          <div className="hidden lg:block">
            <ProductShot src={screenshot} alt={screenshotAlt} />
          </div>
        )}

        {/* Text */}
        <div>
          <span className={cn("text-[10px] font-mono font-bold uppercase tracking-widest", labelColor)}>
            {label}
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-3 mb-4 leading-tight">
            {headline}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mb-5">
            {description}
          </p>
          {bullets && (
            <ul className="space-y-2">
              {bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-foreground/80">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--trade-bullish)] flex-shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Screenshot (shown second on non-reversed, or mobile fallback for reversed) */}
        {!reverse ? (
          <div>
            <ProductShot src={screenshot} alt={screenshotAlt} />
          </div>
        ) : (
          <div className="lg:hidden">
            <ProductShot src={screenshot} alt={screenshotAlt} />
          </div>
        )}
      </div>
    </SectionReveal>
  );
}

// ─── Engine convergence strip ───────────────────────────────────
const engines = [
  { id: 'TCH', name: 'Technical', icon: LineChart },
  { id: 'FND', name: 'Fundamental', icon: BarChart3 },
  { id: 'SNT', name: 'Sentiment', icon: Eye },
  { id: 'FLW', name: 'Flow', icon: Activity },
  { id: 'CAT', name: 'Catalyst', icon: Brain },
  { id: 'QNT', name: 'Quant', icon: Cpu },
];

function EngineStrip() {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {engines.map((e, i) => (
        <motion.div
          key={e.id}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: i * 0.06 }}
          className="p-3 rounded-lg bg-card border border-border text-center"
        >
          <e.icon className="w-5 h-5 text-[var(--trade-bullish)] mx-auto mb-1.5" />
          <div className="text-xs font-bold text-foreground">{e.id}</div>
          <div className="text-[10px] text-muted-foreground">{e.name}</div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Live stats from API ────────────────────────────────────────
function LiveStats() {
  const { data: perf } = useQuery<{ totalTrades?: number; winRate?: number }>({
    queryKey: ["/api/performance/stats"],
    staleTime: 300000,
    retry: 1,
  });
  const totalTrades = perf?.totalTrades || 0;
  const winRate = perf?.winRate || 0;

  return (
    <div className="grid grid-cols-3 gap-8 max-w-md">
      <div>
        <NumberTicker value={6} className="text-3xl font-mono font-bold text-foreground" />
        <div className="text-xs text-muted-foreground mt-0.5">Layers</div>
      </div>
      <div>
        {totalTrades > 0 ? (
          <NumberTicker value={totalTrades} className="text-3xl font-mono font-bold text-foreground" />
        ) : (
          <span className="text-3xl font-mono font-bold text-foreground">&mdash;</span>
        )}
        <div className="text-xs text-muted-foreground mt-0.5">Trades</div>
      </div>
      <div>
        {winRate > 0 ? (
          <NumberTicker value={Math.round(winRate)} suffix="%" className="text-3xl font-mono font-bold text-foreground" />
        ) : (
          <span className="text-3xl font-mono font-bold text-foreground">&mdash;</span>
        )}
        <div className="text-xs text-muted-foreground mt-0.5">Win Rate</div>
      </div>
    </div>
  );
}

// ─── Main Landing Page ──────────────────────────────────────────
export default function Landing() {
  const [, setLocation] = useLocation();
  const [waitlistOpen, setWaitlistOpen] = useReactState(false);
  const [searchQuery, setSearchQuery] = useReactState('');
  const { isAuthenticated, user } = useAuth();
  const hasBetaAccess = user?.hasBetaAccess || false;

  const handleSearch = () => {
    if (searchQuery) setLocation(`/stock/${searchQuery.toUpperCase()}`);
  };

  return (
    <div className="min-h-screen bg-[var(--surface-base)] text-foreground overflow-x-hidden">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--surface-base)]/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between h-14 px-6 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2.5">
            <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-8 w-8" />
            <span className="font-bold text-lg text-foreground">QuantEdge</span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]/70 rounded">LABS</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Trade Desk', href: '/trade-desk' },
              { label: 'Scanner', href: '/market-scanner' },
              { label: 'GEX', href: '/flow' },
            ].map((item) => (
              <Link key={item.label} href={item.href}>
                <span className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-white hover:bg-white/5 transition-all cursor-pointer">
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-[#5865F2] hover:bg-[#5865F2]/10 transition-colors">
              <SiDiscord className="w-4 h-4" />
            </a>
            <ThemeToggle />
            {isAuthenticated ? (
              hasBetaAccess ? (
                <Link href="/home">
                  <Button size="sm" className="bg-emerald-600 hover:bg-[var(--trade-bullish)] text-white px-5">
                    Open App
                  </Button>
                </Link>
              ) : (
                <Button size="sm" onClick={() => setWaitlistOpen(true)} className="bg-white text-black hover:bg-muted px-5">
                  Request Access
                </Button>
              )
            ) : (
              <>
                <Link href="/login">
                  <span className="text-sm text-muted-foreground hover:text-white transition-colors cursor-pointer px-2 py-1.5">Sign in</span>
                </Link>
                <Button size="sm" onClick={() => setWaitlistOpen(true)} className="bg-emerald-600 hover:bg-[var(--trade-bullish)] text-white px-5">
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Market Ticker ──────────────────────────────────── */}
      <div className="fixed top-14 left-0 right-0 z-40">
        <MarketTicker />
      </div>

      {/* ── Main Content ───────────────────────────────────── */}
      <main className="pt-24">

        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="px-6 py-16 md:py-24 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left — Text */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--trade-bullish)]/30 bg-[var(--trade-bullish)]/5 mb-5"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--trade-bullish)] animate-pulse" />
                <span className="text-[10px] font-mono font-semibold text-[var(--trade-bullish)] uppercase tracking-wider">Quantitative Trading Platform</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold mb-5 leading-[1.08] tracking-tight"
              >
                The platform that finds{' '}
                <span className="text-[var(--trade-bullish)]">your edge</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-base text-muted-foreground max-w-lg mb-8 leading-relaxed"
              >
                14-layer confluence scoring across Technical, Flow, Sentiment, Quant, Convergence, and GEX. When layers align, we signal.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex items-center gap-3 mb-6"
              >
                <ShimmerButton
                  onClick={() => setWaitlistOpen(true)}
                  className="h-11 px-7 text-sm font-semibold"
                  shimmerColor="rgba(20, 184, 166, 0.3)"
                  background="linear-gradient(135deg, #0d9488, #14b8a6)"
                >
                  Start Free
                  <ArrowRight className="w-4 h-4 ml-2" />
                </ShimmerButton>
                <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="h-11 px-5 text-sm border-border text-muted-foreground hover:text-foreground hover:border-[var(--trade-bullish)]/40">
                    <SiDiscord className="w-4 h-4 mr-2" />
                    Discord
                  </Button>
                </a>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-[11px] text-muted-foreground/50 mb-8"
              >
                Free forever. No credit card required.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
              >
                <LiveStats />
              </motion.div>
            </div>

            {/* Right — Product screenshot */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="hidden lg:block"
            >
              <ProductShot src="/screenshots/gex-terminal.png" alt="QuantEdge GEX Terminal" />
            </motion.div>
          </div>

          {/* Search bar */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-12 max-w-xl mx-auto lg:mx-0"
          >
            <div className="relative flex items-center bg-card/80 border border-border rounded-lg overflow-hidden focus-within:border-[var(--trade-bullish)]/50 transition-colors">
              <Search className="w-4 h-4 text-muted-foreground ml-3 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search any stock, ETF, or crypto..."
                className="flex-1 px-3 py-2.5 bg-transparent text-foreground placeholder-muted-foreground outline-none text-sm"
              />
              <Button onClick={handleSearch} size="sm" className="m-1 bg-[var(--trade-bullish)] hover:bg-[var(--trade-bullish)]/90 text-white px-4 text-xs">
                Analyze
              </Button>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <span>Try:</span>
              {['NVDA', 'TSLA', 'AAPL', 'BTC'].map((sym) => (
                <Link key={sym} href={`/stock/${sym}`}>
                  <button className="px-2 py-0.5 rounded-md bg-card border border-border hover:border-[var(--trade-bullish)]/30 text-foreground/70 transition-colors text-xs font-mono">
                    {sym}
                  </button>
                </Link>
              ))}
            </div>
          </motion.div>
        </section>

        <SectionDivider />

        {/* ── Engine convergence ────────────────────────────── */}
        <SectionReveal className="px-6 py-16 max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--brand-cyan)]">CONVERGENCE</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-2 mb-3">14 Layers. One Signal.</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Every stock is scored across 14 independent analysis layers. Only when they converge do we signal.
            </p>
          </div>
          <EngineStrip />
        </SectionReveal>

        <SectionDivider />

        {/* ── Feature 1: Trade Desk ────────────────────────── */}
        <FeatureSection
          label="TRADE DESK"
          labelColor="text-[var(--trade-bullish)]"
          headline="AI-scored trade ideas, not noise."
          description="Every idea is graded by a 14-layer confluence engine. Entry, target, stop, risk/reward, and conviction band — computed and ranked before you see it. Filter by direction, hold period, source, and grade."
          screenshot="/screenshots/trade-desk.png"
          screenshotAlt="Trade Desk showing AI-scored trade ideas"
          bullets={[
            "14-layer conviction scoring (S / A+ / A / B+ / B)",
            "Entry, target, stop, and R:R on every idea",
            "Filter by squeeze, breakout, momentum, GEX, earnings",
            "Card, compact, table, and focus view modes",
          ]}
        />

        <SectionDivider />

        {/* ── Feature 2: GEX Hub ───────────────────────────── */}
        <FeatureSection
          label="GEX HUB"
          labelColor="text-[var(--brand-gold)]"
          headline="Market-wide gamma exposure at a glance."
          description="See the entire market's GEX and VEX positioning in one view. Top positive GEX (call-wall heavy pins), top negative GEX (volatile breakout candidates), and top movers — all ranked and scored."
          screenshot="/screenshots/gex-hub.png"
          screenshotAlt="GEX Hub showing market-wide gamma exposure"
          reverse
          bullets={[
            "Market Net GEX and VEX in real-time",
            "Regime classification (pin, breakout, transition)",
            "Top positive, negative, and mover rankings",
            "Filter by index, sector, score threshold",
          ]}
        />

        <SectionDivider />

        {/* ── Feature 3: GEX Terminal ──────────────────────── */}
        <FeatureSection
          label="GEX TERMINAL"
          labelColor="text-cyan-400"
          headline="Per-ticker gamma profile, decoded."
          description="Deep-dive into any ticker's options-derived positioning. GEX profile shows strike-by-strike gamma exposure, key levels (HVL, call wall, put wall), and dealer hedging flow. Tabs for GEX, VEX, Profile, Matrix, and Levels."
          screenshot="/screenshots/gex-terminal.png"
          screenshotAlt="GEX Terminal showing SPY gamma exposure profile"
          bullets={[
            "Strike-by-strike GEX visualization",
            "Key levels: HVL, call wall, put wall, zero gamma",
            "Multi-ticker tabs (SPY, TSLA, QQQ, NVDA, AAPL)",
            "GEX, VEX, Profile, Matrix, and Levels views",
          ]}
        />

        <SectionDivider />

        {/* ── Feature 4: Watchlist ──────────────────────────── */}
        <FeatureSection
          label="WATCHLIST"
          labelColor="text-purple-400"
          headline="Your tickers, always scored."
          description="Live prices, conviction scores, and thesis notes for every symbol you track. Weekly auto-seeded watchlist surfaces the best setups automatically. Technical, overview, and moving average views built in."
          screenshot="/screenshots/watchlist.png"
          screenshotAlt="Watchlist showing tracked tickers with scores"
          reverse
          bullets={[
            "Live price + change with conviction bands",
            "Auto-seeded weekly picks from scanner",
            "Technical, overview, and moving average tabs",
            "Bulk import, export, and manual add",
          ]}
        />

        <SectionDivider />

        {/* ── Feature 5: Index Mode ────────────────────────── */}
        <FeatureSection
          label="INDEX MODE"
          labelColor="text-[var(--brand-teal)]"
          headline="All major indices, one terminal."
          description="SPY, QQQ, IWM, DIA, SPXW — all five indices' GEX and VEX profiles in a single expandable view. Compare gamma regimes across the market to spot divergences and convergences."
          screenshot="/screenshots/index-mode.png"
          screenshotAlt="Index Mode showing multi-index GEX comparison"
          bullets={[
            "SPY, QQQ, IWM, DIA, SPXW side by side",
            "Expandable per-index detail panels",
            "GEX and VEX toggle views",
            "Cross-index regime comparison",
          ]}
        />

        <SectionDivider />

        {/* ── Pricing ──────────────────────────────────────── */}
        <SectionReveal className="px-6 py-16 max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--brand-gold)]">PRICING</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-2 mb-2">Simple pricing, serious edge.</h2>
            <p className="text-sm text-muted-foreground">Start free. Upgrade when you're ready.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <div className="rounded-xl bg-card border border-border p-6 space-y-5">
              <div>
                <h3 className="text-lg font-bold text-foreground">Free</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold text-foreground font-mono">$0</span>
                  <span className="text-muted-foreground text-sm">/month</span>
                </div>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  "14-layer confluence scoring",
                  "Real-time market data",
                  "5 AI trade ideas per day",
                  "Basic charting tools",
                  "Market scanner access",
                  "Community Discord",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-foreground/80">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--trade-bullish)]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button onClick={() => setWaitlistOpen(true)} className="w-full bg-muted text-foreground hover:bg-muted/80">
                Get Started Free
              </Button>
            </div>

            {/* Pro */}
            <div className="rounded-xl bg-card border-2 border-[var(--brand-teal)]/40 p-6 space-y-5 relative overflow-hidden">
              <BorderBeam colorFrom="#14b8a6" colorTo="#06b6d4" size={120} duration={8} borderWidth={1.5} />
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Pro</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-foreground font-mono">$29</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                </div>
                <Badge className="bg-[var(--brand-teal)]/15 text-[var(--brand-teal)] border border-[var(--brand-teal)]/30 text-[10px] font-semibold">
                  COMING SOON
                </Badge>
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  "Everything in Free",
                  "Unlimited AI trade ideas",
                  "Options flow & dark pool data",
                  "TradingView webhook integration",
                  "GEX Terminal & Index Mode",
                  "Priority Discord channel",
                  "Custom watchlist alerts",
                  "Export & API access",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-foreground/80">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--brand-teal)]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button onClick={() => setWaitlistOpen(true)} className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white border-0">
                Join Waitlist
              </Button>
            </div>
          </div>
        </SectionReveal>

        <SectionDivider />

        {/* ── Final CTA ────────────────────────────────────── */}
        <SectionReveal className="px-6 py-20 max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">Ready to trade smarter?</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Join traders using quantitative signals to find high-conviction setups.
          </p>
          <div className="flex items-center justify-center gap-4">
            <ShimmerButton
              onClick={() => setWaitlistOpen(true)}
              shimmerColor="#10b981"
              background="rgba(16, 185, 129, 0.15)"
              className="px-8 py-3 text-base font-bold text-white"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4 ml-2 inline-block" />
            </ShimmerButton>
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="h-12 px-6 border-border text-foreground/80 hover:bg-card hover:border-[var(--trade-bullish)]/30">
                <SiDiscord className="w-4 h-4 mr-2" /> Join Discord
              </Button>
            </a>
          </div>
        </SectionReveal>

        {/* ── Footer ───────────────────────────────────────── */}
        <footer className="px-6 py-10 border-t border-border">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-5 w-5" />
              <span className="text-muted-foreground text-xs">&copy; 2026 QuantEdge Labs</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
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
