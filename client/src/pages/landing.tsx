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

import { CONVICTION_LAYERS, CONVICTION_LAYER_COUNT, CONVICTION_LAYER_NOTE } from '@shared/conviction-layers';
import { InstrumentPanel } from '@/components/landing/instrument-panel';
import { RotationMap } from '@/components/rotation-map';
import { EarlyRotationPanel } from '@/components/oracle/early-rotation-panel';
import { SessionBrief } from '@/components/oracle/session-brief';
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
/**
 * A product shot, or the product itself.
 *
 * Every PNG under /screenshots was captured from the old amber sidebar build. That
 * app does not exist any more: the palette is different, the navigation is
 * different, and several of the surfaces pictured were removed. Showing them made
 * the page advertise a product nobody can sign up for.
 *
 * Where a component's data endpoint is public, the real component renders instead
 * — same code as the Terminal, live data, nothing to keep in sync. Where it is
 * not, this shows an honest placeholder rather than a picture of something else.
 * A gap is better than a misrepresentation.
 */
function ProductShot({ live, alt }: { live?: React.ReactNode; alt: string }) {
  return (
    <div className="relative rounded-xl border border-border/60 overflow-hidden bg-card shadow-2xl shadow-black/30">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/50" />
        </div>
        <span className="ui-data text-[9px] text-muted-foreground ml-2">quantedgelab.net</span>
      </div>
      {live ? (
        <div className="[&_.rounded-xl]:rounded-none [&_.rounded-xl]:border-0">{live}</div>
      ) : (
        <div className="grid h-[220px] place-items-center px-6 text-center">
          <p className="ui-prose text-[12px] leading-relaxed text-muted-foreground">
            {alt} — shown inside the app. Sign in to see it with live data.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Feature Section (alternating layout) ───────────────────────
interface FeatureSectionProps {
  label: string;
  labelColor: string;
  headline: string;
  description: string;
  screenshot?: string;
  live?: React.ReactNode;
  screenshotAlt: string;
  reverse?: boolean;
  bullets?: string[];
}

function FeatureSection({ label, labelColor, headline, description, live, screenshotAlt, reverse, bullets }: FeatureSectionProps) {
  return (
    <SectionReveal className="px-6 py-16 md:py-24 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Screenshot (shown first on reversed) */}
        {reverse && (
          <div className="hidden lg:block">
            <ProductShot live={live} alt={screenshotAlt} />
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
            <ProductShot live={live} alt={screenshotAlt} />
          </div>
        ) : (
          <div className="lg:hidden">
            <ProductShot live={live} alt={screenshotAlt} />
          </div>
        )}
      </div>
    </SectionReveal>
  );
}

// ─── Engine convergence strip ───────────────────────────────────
// Was a hand-written array of six from an older taxonomy — Sentiment and Quant
// are not layers the engine has — sitting under a heading that claimed fourteen,
// on a page whose hero claimed fifteen. All three now come from one list.
const engines = CONVICTION_LAYERS.map((l) => ({ id: l.short, name: l.label, blurb: l.blurb }));

function EngineStrip() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {engines.map((e, i) => (
        <motion.div
          key={e.id}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: i * 0.06 }}
          className="p-3 rounded-lg bg-card border border-border text-center"
        >
          {/* No icon. Sixteen icons is sixteen pieces of decoration competing with
              sixteen labels — the code is the identifier and the name does the work. */}
          <div className="ui-data text-xs font-bold text-[var(--brand-cyan)]">{e.id}</div>
          <div className="text-[11px] text-foreground mt-0.5">{e.name}</div>
          <div className="ui-prose text-[10px] leading-snug text-muted-foreground mt-1">{e.blurb}</div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Live stats from API ────────────────────────────────────────
function LiveStats() {
  // CANONICAL endpoint, not /api/performance/stats. That one calls an older
  // storage calculation and reports a 76.3% win rate; WinRateService, which
  // applies P&L thresholds and counts trades resolving neither way as neutral,
  // reports 38.8%. Both numbers come from the same platform and the flattering
  // one was the one feeding the homepage. On a product whose entire pitch is
  // that it reports honestly, advertising the wrong one is disqualifying.
  const { data: perf } = useQuery<{ overall?: { decided?: number; winRate?: number; expectancy?: number } }>({
    queryKey: ["/api/performance/unified-win-rate"],
    staleTime: 300000,
    retry: 1,
  });
  const decided = perf?.overall?.decided ?? 0;
  const winRate = perf?.overall?.winRate ?? 0;

  // Expectancy is deliberately NOT shown here. Measured twice a few hours apart it
  // read −0.36% and then +4.45%, because the underlying set of resolved trades grew
  // between calls; flipping one filter moves it again to +6.07%. A figure that
  // unstable cannot be a headline, and putting it here would be the same species of
  // overclaim as the 76.3% win rate this page used to print. It belongs inside the
  // app, next to the filters that determine it.

  return (
    <div className="max-w-md">
      {/* ONE number, not a row of three. A three-tile stat strip is the default
          hero furniture and it flattens everything to equal weight — the layer
          count is a fact about the machine, the win rate is a claim about results,
          and they were being presented as peers. The claim gets the size. */}
      <div className="flex items-baseline gap-3">
        {winRate > 0 ? (
          <NumberTicker
            value={Math.round(winRate * 10) / 10}
            suffix="%"
            className="ui-data text-[44px] leading-none font-bold text-foreground"
          />
        ) : (
          <span className="ui-data text-[44px] leading-none font-bold text-foreground">&mdash;</span>
        )}
        <span className="ui-eyebrow text-[11px] text-muted-foreground">win rate</span>
      </div>

      {/* The qualifier sits directly under the number rather than beside it, so the
          rate cannot be read without the count that produced it. */}
      <p className="ui-prose mt-2 text-[13px] leading-snug text-muted-foreground">
        {decided > 0
          ? `Across ${decided} decided trades. Trades that resolved neither way are counted as neutral and excluded, not quietly dropped to raise the number.`
          : 'No decided trades yet. A rate before trades close would be invented.'}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <span className="ui-data text-[13px] font-bold text-[var(--brand-cyan)]">{CONVICTION_LAYER_COUNT}</span>
        <span className="ui-prose text-[13px] text-muted-foreground">independent layers score every setup</span>
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
                One terminal for{' '}
                <span className="text-[var(--brand-cyan)]">options research</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-base text-muted-foreground max-w-lg mb-8 leading-relaxed"
              >
                {`Signals scored across ${CONVICTION_LAYER_COUNT} independent layers,`} with the levels, the contract, and the reason
                it fired on the same screen. Every number is computed from live data — and when a number
                is delayed or missing, it says so instead of guessing.
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
                  shimmerColor="rgba(120, 198, 232, 0.3)"
                  background="linear-gradient(135deg, #3E7FA6, #78C6E8)"
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
              {/* The REAL component, live. Not a screenshot and not a diagram: the previous
                  hero was an invented "instrument panel" I drew, and the section images
                  below it are captures of the old amber sidebar app that no longer exists.
                  Neither was the product. /api/sector-rotation is public, so this renders
                  the same RotationMap the Terminal renders, against the same live data. */}
              <RotationMap className="w-full" collapsedHeight={520} />
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
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-2 mb-3">{CONVICTION_LAYER_COUNT} layers. One signal.</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              {`Every setup is scored across ${CONVICTION_LAYER_COUNT} independent layers. ${CONVICTION_LAYER_NOTE}`}
            </p>
          </div>
          <EngineStrip />
        </SectionReveal>

        <SectionDivider />

        {/* ── Feature 1: Trade Desk ────────────────────────── */}
        <FeatureSection
          label="ORACLE"
          labelColor="text-[var(--trade-bullish)]"
          headline="A signal, and the reason it fired."
          description={`${CONVICTION_LAYER_COUNT} independent layers score every setup — technicals, compression, sector rotation, catalysts, regime, gamma and more. Levels come from actual market structure: the stop sits under a real swing low padded by ATR, and the target is prior structure, not a round percentage. Each signal shows which layers agreed and which argued against it.`}
          live={<EarlyRotationPanel />}
          screenshotAlt="Oracle board showing scored signals with levels and conviction"
          bullets={[
            `${CONVICTION_LAYER_COUNT}-layer conviction score, banded S / A / B / C`,
            "Stops from swing structure + ATR, targets at prior structure",
            "Minimum 1.5R or the target is moved out — and it tells you it did",
            "Every signal timestamped by market session, so a call fired after the close reads as stale",
          ]}
        />

        <SectionDivider />

        {/* ── Feature 2: GEX Hub ───────────────────────────── */}
        <FeatureSection
          label="FLOW"
          labelColor="text-[var(--brand-gold)]"
          headline="Who keeps buying, and does gamma back them?"
          description="Options flow scored on unusual size, sweeps, volume against open interest, and repetition. The repeat-buyer tracker ranks on open-interest growth rather than premium — because premium can't tell accumulation from churn, but contracts still open at the close can. Each candidate is then checked against the gamma regime: flow says someone is positioned, gamma says whether dealers amplify or absorb the move."
          
          screenshotAlt="Flow board with repeat buyers and flow-gamma convergence"
          reverse
          bullets={[
            "Repeat buyers ranked by open-interest growth, not premium",
            "Flow × gamma: does dealer positioning back the trade?",
            "Sweep, block and unusual-volume classes — labelled as inferred, because they are",
            "Filter by score, direction, premium, and type",
          ]}
        />

        <SectionDivider />

        {/* ── Feature 3: GEX Terminal ──────────────────────── */}
        <FeatureSection
          label="GEX + PRISM"
          labelColor="text-cyan-400"
          headline="Where dealers have to hedge."
          description="Strike-by-strike gamma exposure for any ticker, plus the full strike × expiry surface in PRISM. Below the gamma flip dealers amplify moves; above it they dampen them — which is why the flip, the call wall and the put wall behave as levels. Computed from the CBOE chain, which needs no brokerage account."
          
          screenshotAlt="Per-ticker gamma exposure with flip, call wall and put wall"
          bullets={[
            "Gamma flip, call wall, put wall as tradeable levels",
            "Strike × expiry gamma surface (PRISM)",
            "Per-DTE buckets — today, this week, this month",
            "Any ticker with a listed chain, not a fixed list",
          ]}
        />

        <SectionDivider />

        {/* ── Feature 4: Watchlist ──────────────────────────── */}
        <FeatureSection
          label="CATALYST"
          labelColor="text-purple-400"
          headline="When the calendar disagrees with the call."
          description="Tracked events joined to the signals we publish, and it leads with CONFLICTS — signals whose upcoming events point against the direction we called. Binary events landing inside a trade's horizon are flagged as risk, never as direction, because earnings are a coin flip that argues for sizing down rather than for a side."
          live={<SessionBrief />}
          screenshotAlt="Catalyst board showing conflicts between events and signals"
          reverse
          bullets={[
            "Conflicts first — the row that saves money",
            "Binary event risk inside the holding window",
            "Unfilled gap zones drawn on the chart, with the ticker's own fill rate",
            "Empty sections say \"no tracked event\", never \"nothing to worry about\"",
          ]}
        />

        <SectionDivider />

        {/* ── Feature 5: Index Mode ────────────────────────── */}
        <FeatureSection
          label="QUANT BOT"
          labelColor="text-[var(--brand-teal)]"
          headline="The board, paper-traded in options."
          description="The bot trades the same signals the board publishes, in contracts rather than shares, using the strikes the contract engine picks. Fills and marks are real quotes pulled at that moment — nothing is simulated or back-filled, and win rate stays blank until trades actually close, because a number before then would be invented."
          
          screenshotAlt="Quant Bot paper-trading published signals in options"
          bullets={[
            "Trades options, not shares — the same strikes the board publishes",
            "Every fill and mark is a real quote at that moment",
            "Marks are ~15-min delayed CBOE — a fair mark, not an execution price",
            "No win rate until trades close. No back-filled history.",
          ]}
        />

        <SectionDivider />

        {/* ── What this is not ─────────────────────────────────
            A landing page that only lists capabilities teaches people to expect
            things the product does not do. Stating the limits here is not modesty;
            it is the same standard the app itself holds to, where a delayed mark
            is labelled delayed and an empty section says why it is empty. */}
        <SectionReveal className="px-6 py-16 max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              STRAIGHT ANSWERS
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-2 mb-2">What this is, and what it isn't.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                t: 'Research, not advice',
                d: 'It computes levels, scores and base rates and shows the method behind each one. It does not tell you what to buy, and nobody here is a licensed advisor.',
              },
              {
                t: 'Options marks are delayed',
                d: 'Contract prices come from the free CBOE chain, roughly 15 minutes behind. That is fair for marking and research, and not good enough for an execution price. The app says which is which.',
              },
              {
                t: 'A score is a ranking, not a verdict',
                d: '{`${CONVICTION_LAYER_COUNT} layers agreeing means the setup is worth your attention.`} It does not mean the trade works. Every signal shows the layers that argued against it too.',
              },
              {
                t: 'No invented track record',
                d: 'The paper-trading bot starts with no history and reports no win rate until real trades close. Nothing is back-filled to look good.',
              },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-card-border bg-card px-4 py-3.5">
                <div className="text-sm font-semibold text-foreground">{x.t}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{x.d}</p>
              </div>
            ))}
          </div>
        </SectionReveal>

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
                  `${CONVICTION_LAYER_COUNT}-layer conviction scoring`,
                  "Live market data (options marks ~15-min delayed)",
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
              <BorderBeam colorFrom="#78C6E8" colorTo="#6E9E7A" size={120} duration={8} borderWidth={1.5} />
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
              shimmerColor="#6E9E7A"
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
