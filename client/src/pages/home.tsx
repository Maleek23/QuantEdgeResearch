/**
 * QuantEdge Dashboard — Command Center
 * =====================================
 * Trimmed, consistent, no-redundancy dashboard.
 *
 * Layout (6 sections, down from 10):
 *   ┌─ Market Ticker Strip ──────────────────────────────────┐
 *   │ SPY +0.42%  QQQ +0.67%  VIX 14.2  BTC $67,421        │
 *   ├────────────────────────────────────────────────────────┤
 *   │ Welcome + Global "Data as of X" timestamp              │
 *   ├──────────────────────┬─────────────────────────────────┤
 *   │ Briefing + Outlook   │ Market Regime + Futures + VIX   │
 *   ├──────────────────────┴─────────────────────────────────┤
 *   │ Top Signals: Convictions + Best Setups (merged)        │
 *   ├──────────────────────┬──────────────┬──────────────────┤
 *   │ News (w/ sentiment)  │ Earnings Cal │ Top Movers       │
 *   ├──────────────────────┴──────────────┴──────────────────┤
 *   │ Platform Health bar                                    │
 *   └────────────────────────────────────────────────────────┘
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useMarketPoll, POLL } from "@/hooks/use-market-poll";
import { cn, safeNumber, safeToFixed, formatRelativeTime } from "@/lib/utils";
import { componentStyles } from "@/lib/design-tokens";
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Brain,
  Activity,
  Newspaper,
  Calendar,
  Clock,
  AlertCircle,
  Sun,
  Search,
  Shield,
  Gauge,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Zap,
  Star,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import PreMarketGappersCard from "@/components/trade-desk/PreMarketGappersCard";
import { MarketPulseWidget } from "@/components/market-pulse-widget";
import { IndexScalpsCard } from "@/components/index-scalps-card";
import { Num, Pct, Price, Ticker } from "@/components/ui/qe";

// ────────────────────────────────────────────────────────────
// Shared Utilities
// ────────────────────────────────────────────────────────────

const getRelativeTime = (ts?: string | null) => formatRelativeTime(ts || null);

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

  return { status, isOpen: isMarketHours && !isWeekend, isWeekend };
}

function useETTimestamp() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) + " ET";
}

/** Consistent section header using design tokens */
function SectionHeader({ label, action, actionHref }: {
  label: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className={componentStyles.sectionHeader.wrapper}>
      <div className={componentStyles.sectionHeader.left}>
        <div className={componentStyles.sectionHeader.accent} />
        <h2 className={componentStyles.text.chromeLabel}>{label}</h2>
      </div>
      {action && actionHref && (
        <Link href={actionHref}>
          <span className="text-[10px] text-[var(--brand-teal)] hover:text-[var(--brand-cyan)] flex items-center gap-0.5 cursor-pointer font-medium transition-colors font-mono">
            {action} <ChevronRight className="h-2.5 w-2.5" />
          </span>
        </Link>
      )}
    </div>
  );
}

function SectionReveal({ children, className, delay = 0 }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/** Reusable error state for any card */
function CardError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--trade-bearish)]/20 bg-[var(--trade-bearish)]/5">
      <span className="text-[10px] font-mono text-[var(--trade-bearish)]">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-[10px] font-mono text-[var(--brand-teal)] hover:underline flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> RETRY
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 1. Market Ticker Strip
// ────────────────────────────────────────────────────────────

interface MarketQuote {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
}

function MarketTicker() {
  const priceInterval = useMarketPoll(POLL.PRICES.open, POLL.PRICES.closed);
  const { data: marketData } = useQuery<{ quotes: Record<string, MarketQuote> }>({
    queryKey: ["/api/market-data/batch/SPY,QQQ,DIA,IWM,VIX,BTC-USD,ETH-USD"],
    refetchInterval: priceInterval,
  });

  const { status, isOpen } = useMarketStatus();

  const indices = [
    { symbol: "SPY", name: "S&P 500" },
    { symbol: "QQQ", name: "Nasdaq" },
    { symbol: "DIA", name: "Dow" },
    { symbol: "IWM", name: "Russell" },
    { symbol: "VIX", name: "VIX" },
    { symbol: "BTC-USD", name: "BTC" },
    { symbol: "ETH-USD", name: "ETH" },
  ];

  return (
    <div className="bg-card/80 border-b border-border overflow-hidden backdrop-blur-sm">
      <div className="flex items-center h-8">
        <div className="flex-shrink-0 flex items-center gap-1.5 px-4 border-r border-border z-10">
          <div className={cn("w-1.5 h-1.5 rounded-full", isOpen ? componentStyles.status.online : "bg-muted-foreground")} />
          <span className={cn("text-[11px] font-medium font-mono", isOpen ? "text-[var(--trade-bullish)]" : "text-muted-foreground")}>{status}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee">
            {[...indices, ...indices].map((idx, i) => {
              const quote = marketData?.quotes?.[idx.symbol];
              const price = safeNumber(quote?.regularMarketPrice);
              const change = safeNumber(quote?.regularMarketChangePercent);
              return (
                <Link key={`${idx.symbol}-${i}`} href={`/terminal/${idx.symbol}`}>
                  <div className="flex items-center gap-2 px-4 whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors">
                    <span className={cn(componentStyles.text.chromeLabel, "text-[11px]")}>{idx.symbol}</span>
                    {price > 0 && (
                      <span className={cn(componentStyles.text.dataValue, "text-[11px] text-foreground/70")}>
                        {idx.symbol === "VIX" ? safeToFixed(price, 1) : idx.symbol.includes("-USD") ? `$${safeToFixed(price, 0)}` : `$${safeToFixed(price, 2)}`}
                      </span>
                    )}
                    <span className={cn(componentStyles.text.change, "text-[11px]", change >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
                      {change >= 0 ? "+" : ""}{safeToFixed(change, 2)}%
                    </span>
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

// ────────────────────────────────────────────────────────────
// 2. Welcome Header + Global Timestamp
// ────────────────────────────────────────────────────────────

function WelcomeHeader() {
  const { user } = useAuth();
  const { status, isOpen } = useMarketStatus();
  const etTime = useETTimestamp();

  const getGreeting = () => {
    const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = et.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const userData = user as { firstName?: string; email?: string } | null;
  const firstName = userData?.firstName || "Trader";

  const quickLinks = [
    { label: "Trade Desk", href: "/trade-desk", icon: Brain, accent: true },
    { label: "Scanner", href: "/market-scanner", icon: Search },
    { label: "Terminal", href: "/terminal/SPY", icon: Activity },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-4"
    >
      <div className="flex items-end justify-between mb-2.5">
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            <span className="text-border">·</span>
            <span className={cn("inline-flex items-center gap-1", isOpen ? "text-[var(--trade-bullish)]" : "text-muted-foreground")}>
              <span className={cn("w-1 h-1 rounded-full", isOpen ? "bg-[var(--trade-bullish)] animate-pulse" : "bg-muted-foreground/50")} />
              {status}
            </span>
          </p>
        </div>
        {/* Global data timestamp */}
        <div className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
          Data as of {etTime}
        </div>
      </div>

      <div className="flex gap-1.5">
        {quickLinks.map((link, i) => (
          <motion.div key={link.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.03 }}>
            <Link href={link.href}>
              <button className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-all cursor-pointer",
                link.accent
                  ? "bg-[var(--brand-teal)]/10 border-[var(--brand-teal)]/30 text-[var(--brand-teal)] hover:bg-[var(--brand-teal)]/20"
                  : "bg-card border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              )}>
                <link.icon className="w-3 h-3" />
                {link.label}
              </button>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────
// 2.5. Session Action — What you need RIGHT NOW based on time of day
// ────────────────────────────────────────────────────────────

type SessionPhase = "pre-market" | "market-open" | "after-hours" | "weekend" | "closed";

function getSessionPhase(): SessionPhase {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  if (day === 0 || day === 6) return "weekend";
  if (mins >= 240 && mins < 570) return "pre-market";
  if (mins >= 570 && mins < 960) return "market-open";
  if (mins >= 960 && mins < 1200) return "after-hours";
  return "closed";
}

const SESSION_CONFIG: Record<SessionPhase, { label: string; icon: typeof Zap; hint: string; color: string }> = {
  "pre-market": { label: "PRE-MARKET PREP", icon: Zap, hint: "Overnight gaps, futures bias, and what to watch at the open", color: "text-[var(--trade-neutral)]" },
  "market-open": { label: "MARKET OPEN", icon: Activity, hint: "Intraday movers, regime shifts, and active signals", color: "text-[var(--trade-bullish)]" },
  "after-hours": { label: "AFTER HOURS", icon: Clock, hint: "Post-close movers, earnings reactions, and overnight setups", color: "text-[var(--brand-cyan)]" },
  weekend: { label: "WEEKEND REVIEW", icon: Calendar, hint: "Friday's movers, weekly recap, and next week's watchlist", color: "text-muted-foreground" },
  closed: { label: "OVERNIGHT", icon: Star, hint: "Markets closed — reviewing last session", color: "text-muted-foreground" },
};

function SessionAction() {
  const phase = getSessionPhase();
  const config = SESSION_CONFIG[phase];
  const Icon = config.icon;

  const priceInterval = useMarketPoll(POLL.PRICES.open, POLL.PRICES.closed);

  // Futures data for pre-market/overnight context
  const { data: futures } = useQuery<{
    symbols?: Array<{ symbol: string; name?: string; price?: number; changePercent?: number }>;
  }>({
    queryKey: ["/api/futures", "session-action"],
    refetchInterval: priceInterval,
  });

  // Outlook for high-impact events
  const { data: outlook } = useQuery<{
    highImpactAlert: { name: string; date: string; time: string } | null;
    futuresBias: string;
    summary: string;
  }>({
    queryKey: ["/api/market-outlook", "session-action"],
    staleTime: 60_000,
  });

  const topFutures = (futures?.symbols || []).slice(0, 4);
  const bias = outlook?.futuresBias;

  return (
    <div className="mb-4">
      {/* Session badge + futures strip */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("w-3.5 h-3.5", config.color)} />
          <span className={cn("text-[10px] font-mono font-bold uppercase tracking-wider", config.color)}>
            {config.label}
          </span>
          <span className="text-[10px] text-muted-foreground/50">{config.hint}</span>
        </div>
        {bias && (
          <span className={cn(
            "text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border",
            bias === "bullish" ? "text-[var(--trade-bullish)] border-[var(--trade-bullish)]/30 bg-[var(--trade-bullish)]/10" :
            bias === "bearish" ? "text-[var(--trade-bearish)] border-[var(--trade-bearish)]/30 bg-[var(--trade-bearish)]/10" :
            "text-muted-foreground border-border bg-muted/30"
          )}>
            Futures {bias}
          </span>
        )}
      </div>

      {/* Futures mini-strip (always visible — gives overnight context) */}
      {topFutures.length > 0 && (
        <div className="flex items-center gap-4 mb-2 px-3 py-2 rounded-lg bg-card border border-border/50">
          {topFutures.map((f) => {
            const pct = f.changePercent ?? 0;
            return (
              <div key={f.symbol} className="flex items-center gap-1.5">
                <Ticker symbol={f.symbol} className="text-[10px] text-muted-foreground/70 font-normal" />
                <Price value={f.price} className="text-xs" />
                <Pct value={pct} className="text-[10px] font-bold" />
              </div>
            );
          })}

          {/* High-impact event inline */}
          {outlook?.highImpactAlert && (
            <div className="ml-auto flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 text-[var(--trade-neutral)]" />
              <span className="text-[10px] font-mono text-[var(--trade-neutral)]">
                {outlook.highImpactAlert.name} · {outlook.highImpactAlert.time}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pre-market gappers card — expanded during pre-market, collapsed otherwise */}
      <PreMarketGappersCard defaultExpanded={phase === "pre-market" || phase === "after-hours"} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 3. Market Intelligence — merged Briefing + Regime + Outlook
// ────────────────────────────────────────────────────────────

function MarketIntelligence() {
  const metricsInterval = useMarketPoll(POLL.METRICS.open, POLL.METRICS.closed);

  // Briefing
  const { data: briefing, isLoading: briefingLoading, isError: briefingError, refetch: refetchBriefing } = useQuery<{
    marketOutlook?: string;
    keyLevels?: { spy?: number; qqq?: number; vix?: number };
    topWatchlist?: Array<{ symbol: string; reason?: string }>;
    catalysts?: string[];
    tradingPlan?: string;
    timestamp?: string;
  }>({
    queryKey: ["/api/morning-briefing"],
    refetchInterval: 300000,
    retry: 1,
  });

  // Regime
  const { data: regime, isError: regimeError, refetch: refetchRegime } = useQuery<{
    regime?: string;
    confidence?: number;
    description?: string;
  }>({
    queryKey: ["/api/market-regime"],
    refetchInterval: metricsInterval,
  });

  // Outlook (swing setups + high impact alerts)
  const { data: outlook } = useQuery<{
    futuresBias: "bullish" | "bearish" | "neutral";
    isWeekend: boolean;
    summary: string;
    highImpactAlert: { name: string; date: string; time: string } | null;
    swingSetups: Array<{ symbol: string; direction: string; score: number; pattern: string }>;
    weeklyFocus: string[];
  }>({
    queryKey: ["/api/market-outlook"],
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const outlookBadge = (text?: string) => {
    if (!text) return { color: componentStyles.badge.default, label: "Neutral" };
    const lower = text.toLowerCase();
    if (lower.includes("bullish") || lower.includes("positive"))
      return { color: componentStyles.badge.success, label: "Bullish" };
    if (lower.includes("bearish") || lower.includes("negative"))
      return { color: componentStyles.badge.error, label: "Bearish" };
    return { color: componentStyles.badge.warning, label: "Cautious" };
  };

  const badge = outlookBadge(briefing?.marketOutlook);
  const regimeLabel = regime?.regime || null;
  const regimeColor = regimeLabel?.toLowerCase().includes("bull") ? "text-[var(--trade-bullish)]"
    : regimeLabel?.toLowerCase().includes("bear") ? "text-[var(--trade-bearish)]"
    : "text-[var(--trade-neutral)]";
  const topSwings = outlook?.swingSetups?.slice(0, 3) ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-[var(--card-gap)]">
      {/* LEFT — Briefing + Outlook merged */}
      <div className="lg:col-span-3">
        <Card className={componentStyles.card.default}>
          <CardContent className="p-4 space-y-3">
            {/* Briefing header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                <h3 className="font-semibold text-foreground text-sm">
                  {outlook?.isWeekend ? "Weekend Briefing" : "Morning Briefing"}
                </h3>
                {briefing?.timestamp && (
                  <span className={cn(componentStyles.text.chromeLabel, "text-muted-foreground/60")}>
                    {getRelativeTime(briefing.timestamp)}
                  </span>
                )}
              </div>
              <span className={badge.color}>{badge.label}</span>
            </div>

            {briefingError ? (
              <CardError message="Briefing unavailable" onRetry={() => refetchBriefing()} />
            ) : briefingLoading ? (
              <p className="text-[10px] text-muted-foreground/40">Loading briefing...</p>
            ) : (
              <>
                {/* Trading plan */}
                {briefing?.tradingPlan && (
                  <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">{briefing.tradingPlan}</p>
                )}

                {/* Catalysts (previously unused) */}
                {briefing?.catalysts && briefing.catalysts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className={componentStyles.text.chromeLabel}>CATALYSTS:</span>
                    {briefing.catalysts.slice(0, 3).map((cat, i) => (
                      <span key={i} className={componentStyles.badge.warning}>{cat}</span>
                    ))}
                  </div>
                )}

                {/* High impact alert from outlook */}
                {outlook?.highImpactAlert && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--trade-neutral)]/30 bg-[var(--trade-neutral)]/5">
                    <AlertCircle className="w-3.5 h-3.5 text-[var(--trade-neutral)] shrink-0" />
                    <span className="text-[10px] font-semibold text-[var(--trade-neutral)]">{outlook.highImpactAlert.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">{outlook.highImpactAlert.date} {outlook.highImpactAlert.time}</span>
                  </div>
                )}

                {/* Swing setups (from outlook, previously in separate panel) */}
                {topSwings.length > 0 && (
                  <div>
                    <div className={cn(componentStyles.text.chromeLabel, "mb-1.5")}>TOP SWING SETUPS</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      {topSwings.map((s, i) => (
                        <Link key={i} href={`/terminal/${s.symbol}`}>
                          <div className={cn(componentStyles.card.inset, "flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-foreground/[0.04] transition-colors")}>
                            <span className={cn(componentStyles.text.ticker, "text-xs text-[var(--brand-teal)]")}>{s.symbol}</span>
                            {s.direction === "bearish"
                              ? <ArrowDownRight className="w-3 h-3 text-[var(--trade-bearish)]" />
                              : <ArrowUpRight className="w-3 h-3 text-[var(--trade-bullish)]" />}
                            <span className="text-[10px] text-muted-foreground truncate flex-1">{s.pattern}</span>
                            <span className={cn(componentStyles.text.dataValue, "text-[10px] text-foreground/60")}>{s.score}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Watchlist + Weekly focus merged */}
                {(briefing?.topWatchlist?.length || outlook?.weeklyFocus?.length) ? (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className={componentStyles.text.chromeLabel}>WATCH:</span>
                    {briefing?.topWatchlist?.slice(0, 5).map((item) => (
                      <Link key={item.symbol} href={`/terminal/${item.symbol}`}>
                        <Badge variant="outline" className="cursor-pointer text-[10px] font-mono hover:bg-[var(--brand-teal)]/10 hover:border-[var(--brand-teal)]/30 hover:text-[var(--brand-teal)] border-border text-muted-foreground transition-colors">
                          {item.symbol}
                        </Badge>
                      </Link>
                    ))}
                    {outlook?.weeklyFocus?.filter(sym => !briefing?.topWatchlist?.some(w => w.symbol === sym)).slice(0, 3).map((sym) => (
                      <Link key={sym} href={`/terminal/${sym}`}>
                        <Badge variant="outline" className="text-[10px] font-mono text-[var(--brand-teal)]/60 border-[var(--brand-teal)]/20 bg-[var(--brand-teal)]/5 cursor-pointer hover:bg-[var(--brand-teal)]/10">
                          {sym}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* RIGHT — Regime + Metrics + Futures */}
      <div className="lg:col-span-2">
        <Card className={cn(componentStyles.card.default, "h-full")}>
          <CardContent className="p-4 space-y-3">
            {regimeError ? (
              <CardError message="Regime unavailable" onRetry={() => refetchRegime()} />
            ) : (
              <>
                {/* Regime */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="w-4 h-4 text-[var(--brand-cyan)]" />
                    <span className={componentStyles.text.statLabel}>Market Regime</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {regimeLabel ? (
                      <span className={cn("text-lg font-bold", regimeColor)}>{regimeLabel}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground/40 font-mono">—</span>
                    )}
                    {regime?.confidence && (
                      <span className={cn(componentStyles.text.dataValue, "text-xs text-muted-foreground")}>{regime.confidence}%</span>
                    )}
                  </div>
                  {regime?.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{regime.description}</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 4. Top Signals — merged Convictions + Best Setups
// ────────────────────────────────────────────────────────────

interface ConvictionPick {
  ideaId: string;
  symbol: string;
  direction: "long" | "short";
  convictionScore: number;
  convictionBand: "S" | "A" | "B" | "C";
  layerCount: number;
  riskRewardRatio: number;
  thesis: string;
}

function TopSignals() {
  const convictionInterval = useMarketPoll(POLL.SCANNER.open, POLL.SCANNER.closed);

  const { data: convData, isLoading: convLoading, isError: convError, refetch: refetchConv } = useQuery<{ picks: ConvictionPick[] }>({
    queryKey: ["/api/convictions", { minScore: 15, limit: 6, lookbackHours: 72 }],
    queryFn: async () => {
      const res = await fetch("/api/convictions?minScore=15&limit=6&lookbackHours=72", { credentials: "include" });
      if (!res.ok) throw new Error("convictions fetch failed");
      return res.json();
    },
    staleTime: 20_000,
    refetchInterval: convictionInterval,
  });

  const { data: setupData, isError: setupError, refetch: refetchSetups } = useQuery<{
    setups: Array<{
      symbol: string; direction: string; confidenceScore: number; source: string;
      timestamp?: string; entryPrice?: number; targetPrice?: number; stopLoss?: number;
    }>;
  }>({
    queryKey: ["/api/trade-ideas/best-setups?limit=6&watchlistOnly=true"],
    refetchInterval: 60000,
  });

  const { data: convergenceData } = useQuery<{
    symbols?: Array<{ symbol: string; convergenceScore?: number; direction?: string; enginesAgreed?: number; totalEngines?: number }>;
  }>({
    queryKey: ["/api/convergence/hot-symbols"],
    refetchInterval: 120000,
  });

  const picks = convData?.picks ?? [];
  const setups = setupData?.setups?.slice(0, 5) ?? [];
  const hotSymbols = convergenceData?.symbols?.slice(0, 3) ?? [];

  const bandColor = (band: "S" | "A" | "B" | "C") =>
    band === "S" ? componentStyles.grade.S
    : band === "A" ? componentStyles.grade.A
    : band === "B" ? componentStyles.grade.B
    : componentStyles.grade.C;

  return (
    <div className="space-y-3">
      {/* Convictions Grid */}
      {convError ? (
        <CardError message="Convictions unavailable" onRetry={() => refetchConv()} />
      ) : convLoading ? (
        <p className="text-[10px] text-muted-foreground/40 text-center py-4">Loading convictions...</p>
      ) : picks.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {picks.map((p) => (
            <Link key={p.ideaId} href={`/terminal/${p.symbol}`}>
              <div className={cn(componentStyles.card.interactive, "p-2.5")}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn(componentStyles.text.ticker, "text-sm")}>{p.symbol}</span>
                    {p.direction === "long"
                      ? <ArrowUpRight className="w-3 h-3 text-[var(--trade-bullish)]" />
                      : <ArrowDownRight className="w-3 h-3 text-[var(--trade-bearish)]" />}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn("px-1.5 py-0 rounded text-[9px] font-mono font-bold", bandColor(p.convictionBand))}>
                      {p.convictionBand}
                    </span>
                    <span className={cn(componentStyles.text.dataValue, "text-sm font-bold")}>{p.convictionScore}</span>
                  </div>
                </div>
                <div className={cn(componentStyles.text.chromeLabel, "flex items-center gap-2 mb-1")}>
                  <span>{p.layerCount} layers</span>
                  <span>·</span>
                  <span>R:R {p.riskRewardRatio.toFixed(1)}×</span>
                </div>
                {p.thesis && (
                  <div className="text-[10px] text-muted-foreground/80 leading-tight line-clamp-2">{p.thesis}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-muted-foreground">
          No high-conviction picks in the last 72h.
        </div>
      )}

      {/* Best Setups list (compact) + Convergence badges */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--card-gap)]">
        {/* Setups */}
        <div className="lg:col-span-2">
          <Card className={componentStyles.card.default}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground text-xs">Best Setups</h3>
                </div>
                <Link href="/trade-desk">
                  <Button variant="ghost" size="sm" className="text-xs text-[var(--brand-teal)] hover:text-[var(--brand-cyan)] h-7 px-2">
                    View all <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </Link>
              </div>
              {setupError ? (
                <CardError message="Setups unavailable" onRetry={() => refetchSetups()} />
              ) : setups.length > 0 ? (
                <div className="space-y-1">
                  {setups.map((idea, i) => {
                    const isLong = idea.direction === "bullish" || idea.direction === "LONG" || idea.direction === "long";
                    const confColor = idea.confidenceScore >= 75 ? "text-[var(--trade-bullish)]"
                      : idea.confidenceScore >= 60 ? "text-[var(--trade-neutral)]" : "text-muted-foreground";
                    return (
                      <Link key={i} href={`/terminal/${idea.symbol}`}>
                        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer">
                          <div className="flex items-center gap-2.5">
                            <div className={cn("w-7 h-7 rounded-md flex items-center justify-center",
                              isLong ? "bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)]"
                            )}>
                              {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={cn(componentStyles.text.ticker, "text-sm")}>{idea.symbol}</span>
                                <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase",
                                  isLong ? componentStyles.badge.bullish : componentStyles.badge.bearish
                                )}>{isLong ? "LONG" : "SHORT"}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground">{idea.source}</span>
                                {idea.timestamp && <span className="text-[10px] text-muted-foreground/60">{getRelativeTime(idea.timestamp)}</span>}
                                {/* Show entry/target when available */}
                                {idea.entryPrice && idea.targetPrice && (
                                  <span className="text-[10px] font-mono text-muted-foreground/50">
                                    ${safeToFixed(idea.entryPrice, 2)} → ${safeToFixed(idea.targetPrice, 2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn(componentStyles.text.dataValue, "text-sm font-bold", confColor)}>{idea.confidenceScore}pts</div>
                            <div className="w-12 h-1 rounded-full bg-muted mt-1 overflow-hidden">
                              <div className={cn("h-full rounded-full", confColor.replace("text-", "bg-"))} style={{ width: `${idea.confidenceScore}%` }} />
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/40 text-center py-4">No scored setups right now.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Convergence (compact sidebar) */}
        <div>
          <Card className={cn(componentStyles.card.default, "h-full")}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-3.5 h-3.5 text-[var(--trade-neutral)]" />
                <h3 className="font-semibold text-foreground text-xs">Convergence</h3>
              </div>
              {hotSymbols.length > 0 ? (
                <div className="space-y-1.5">
                  {hotSymbols.map((sym, i) => {
                    const isBullish = sym.direction?.toLowerCase().includes("bull") || sym.direction?.toLowerCase().includes("long");
                    return (
                      <Link key={i} href={`/terminal/${sym.symbol}`}>
                        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer">
                          <div className="flex items-center gap-2">
                            <span className={cn(componentStyles.text.ticker, "text-sm")}>{sym.symbol}</span>
                            {sym.direction && (
                              <span className={cn(isBullish ? componentStyles.badge.bullish : componentStyles.badge.bearish)}>
                                {isBullish ? "BULL" : "BEAR"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {sym.enginesAgreed && sym.totalEngines && (
                              <span className="text-[10px] text-muted-foreground font-mono">{sym.enginesAgreed}/{sym.totalEngines}</span>
                            )}
                            {sym.convergenceScore && (
                              <span className={cn(componentStyles.text.dataValue, "text-xs font-bold",
                                sym.convergenceScore >= 80 ? "text-[var(--trade-bullish)]" : sym.convergenceScore >= 60 ? "text-[var(--trade-neutral)]" : "text-muted-foreground"
                              )}>
                                {sym.convergenceScore}%
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/40 text-center py-4">No convergence signals</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 5. Market Pulse — News (with sentiment) + Earnings + Movers
// ────────────────────────────────────────────────────────────

function NewsFeed() {
  const { data, isLoading, isError, refetch } = useQuery<{
    news: Array<{
      title: string;
      summary?: string;
      url: string;
      source: string;
      publishedAt: string;
      tickers?: string[];
      sentiment?: string;
    }>;
  }>({
    queryKey: ["/api/news?limit=5"],
    refetchInterval: 120000,
  });

  const news = data?.news?.slice(0, 5) || [];

  const sentimentBadge = (sentiment?: string) => {
    if (!sentiment) return null;
    const lower = sentiment.toLowerCase();
    if (lower.includes("bullish") || lower.includes("positive"))
      return { cls: componentStyles.badge.bullish, label: "Bullish" };
    if (lower.includes("bearish") || lower.includes("negative"))
      return { cls: componentStyles.badge.bearish, label: "Bearish" };
    if (lower.includes("neutral"))
      return { cls: componentStyles.badge.default, label: "Neutral" };
    return null;
  };

  return (
    <Card className={componentStyles.card.default}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Newspaper className="w-3.5 h-3.5 text-muted-foreground" />
            <h3 className="font-semibold text-foreground text-xs">News Feed</h3>
          </div>
          <span className={componentStyles.badge.cyan}>NEWS</span>
        </div>
        {isError ? (
          <CardError message="News feed unavailable" onRetry={() => refetch()} />
        ) : isLoading ? (
          <p className="text-[10px] text-muted-foreground/40 text-center py-3">Loading news...</p>
        ) : news.length > 0 ? (
          <div className="space-y-1.5">
            {news.map((article, i) => {
              const sb = sentimentBadge(article.sentiment);
              return (
                <a key={i} href={article.url} target="_blank" rel="noopener noreferrer"
                  className="block p-2.5 rounded-lg hover:bg-muted/50 transition-colors group/item">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-2 group-hover/item:text-[var(--brand-teal)] transition-colors leading-snug">
                        {article.title}
                      </p>
                      {/* Summary — previously unused */}
                      {article.summary && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-1 leading-snug">{article.summary}</p>
                      )}
                    </div>
                    {sb && <span className={cn(sb.cls, "shrink-0 mt-0.5")}>{sb.label}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-muted-foreground">{article.source}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {getRelativeTime(article.publishedAt)}
                    </span>
                    {article.tickers && article.tickers.length > 0 && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <div className="flex gap-1">
                          {article.tickers.slice(0, 3).map((ticker) => (
                            <span key={ticker} className={componentStyles.badge.cyan}>${ticker}</span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground/40 text-center py-4">No breaking news right now</p>
        )}
      </CardContent>
    </Card>
  );
}

function EarningsCalendar() {
  const { data, isLoading, isError, refetch } = useQuery<{
    earnings: Array<{
      symbol: string; company?: string; reportDate: string;
      fiscalQuarter?: string; estimatedEps?: number; time?: string;
    }>;
  }>({
    queryKey: ["/api/earnings/upcoming?days=14"],
    refetchInterval: 300000,
  });

  const earnings = data?.earnings?.slice(0, 5) || [];

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const getTimeLabel = (time?: string) => {
    if (time === "bmo" || time === "BMO") return { label: "Pre", cls: componentStyles.badge.warning };
    if (time === "amc" || time === "AMC") return { label: "Post", cls: componentStyles.badge.default };
    return { label: "TBD", cls: componentStyles.badge.default };
  };

  return (
    <Card className={componentStyles.card.default}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-xs">Earnings</h3>
        </div>
        {isError ? (
          <CardError message="Earnings unavailable" onRetry={() => refetch()} />
        ) : isLoading ? (
          <p className="text-[10px] text-muted-foreground/40 text-center py-3">Loading earnings...</p>
        ) : earnings.length > 0 ? (
          <div className="space-y-1.5">
            {earnings.map((earning, i) => {
              const timeInfo = getTimeLabel(earning.time);
              return (
                <Link key={i} href={`/terminal/${earning.symbol}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <span className={cn(componentStyles.text.ticker, "text-sm w-12")}>{earning.symbol}</span>
                      <span className={timeInfo.cls}>{timeInfo.label}</span>
                      {/* Company name — previously unused */}
                      {earning.company && (
                        <span className="text-[10px] text-muted-foreground/50 truncate max-w-[100px]">{earning.company}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-foreground">{formatDate(earning.reportDate)}</div>
                      {earning.estimatedEps != null && (
                        <div className={cn(componentStyles.text.dataValue, "text-[10px] text-muted-foreground")}>
                          Est ${safeToFixed(earning.estimatedEps, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground/40 text-center py-4">No notable earnings this week</p>
        )}
      </CardContent>
    </Card>
  );
}

function TopMovers() {
  const { data, isError, refetch } = useQuery<{
    topGainers: Array<{ symbol: string; changePercent: number; percentChange?: number; price?: number }>;
    topLosers: Array<{ symbol: string; changePercent: number; percentChange?: number; price?: number }>;
  }>({
    queryKey: ["/api/market-movers"],
    refetchInterval: 60000,
  });

  const gainers = data?.topGainers?.slice(0, 4) || [];
  const losers = data?.topLosers?.slice(0, 4) || [];
  const isEmpty = gainers.length === 0 && losers.length === 0;

  return (
    <Card className={componentStyles.card.default}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-xs">Movers</h3>
        </div>
        {isError ? (
          <CardError message="Movers unavailable" onRetry={() => refetch()} />
        ) : isEmpty ? (
          <p className="text-[10px] text-muted-foreground/40 text-center py-3">Market closed — movers update at open</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp className="h-3 w-3 text-[var(--trade-bullish)]" />
                <span className={cn(componentStyles.text.chromeLabel, "text-[var(--trade-bullish)]")}>Gainers</span>
              </div>
              <div className="space-y-0.5">
                {gainers.map((s) => (
                  <Link key={s.symbol} href={`/terminal/${s.symbol}`}>
                    <div className="flex items-center justify-between p-1.5 rounded hover:bg-[var(--trade-bullish)]/5 transition-colors cursor-pointer">
                      <span className={cn(componentStyles.text.ticker, "text-xs")}>{s.symbol}</span>
                      <div className="flex items-center gap-2">
                        {/* Price — previously unused */}
                        {s.price && <span className={cn(componentStyles.text.dataValue, "text-[10px] text-muted-foreground")}>${safeToFixed(s.price, 2)}</span>}
                        <span className={cn(componentStyles.text.change, "font-bold text-[var(--trade-bullish)]")}>
                          +{safeToFixed(s.changePercent ?? s.percentChange, 1)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingDown className="h-3 w-3 text-[var(--trade-bearish)]" />
                <span className={cn(componentStyles.text.chromeLabel, "text-[var(--trade-bearish)]")}>Losers</span>
              </div>
              <div className="space-y-0.5">
                {losers.map((s) => (
                  <Link key={s.symbol} href={`/terminal/${s.symbol}`}>
                    <div className="flex items-center justify-between p-1.5 rounded hover:bg-[var(--trade-bearish)]/5 transition-colors cursor-pointer">
                      <span className={cn(componentStyles.text.ticker, "text-xs")}>{s.symbol}</span>
                      <div className="flex items-center gap-2">
                        {s.price && <span className={cn(componentStyles.text.dataValue, "text-[10px] text-muted-foreground")}>${safeToFixed(s.price, 2)}</span>}
                        <span className={cn(componentStyles.text.change, "font-bold text-[var(--trade-bearish)]")}>
                          {safeToFixed(s.changePercent ?? s.percentChange, 1)}%
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// 6. Platform Health (bottom bar)
// ────────────────────────────────────────────────────────────

function EngineHealthBar() {
  const { data: health } = useQuery<{ overall?: string; score?: number }>({
    queryKey: ["/api/engine-health"],
    refetchInterval: 300000,
  });

  const { data: perf } = useQuery<{
    totalTrades?: number; winRate?: number; avgReturn?: number;
    profitFactor?: number; sharpeRatio?: number;
  }>({
    queryKey: ["/api/performance/stats"],
    refetchInterval: 300000,
  });

  const stats = [
    { label: "Hit Rate", value: perf?.winRate ? `${safeToFixed(perf.winRate, 1)}%` : "—", color: perf?.winRate && perf.winRate >= 50 ? "text-[var(--trade-bullish)]" : undefined },
    { label: "Trades", value: perf?.totalTrades?.toLocaleString() || "—" },
    { label: "Profit Factor", value: perf?.profitFactor ? safeToFixed(perf.profitFactor, 2) : "—", color: perf?.profitFactor && perf.profitFactor >= 1.5 ? "text-[var(--trade-bullish)]" : undefined },
    { label: "Avg Return", value: perf?.avgReturn ? `${safeToFixed(perf.avgReturn, 1)}%` : "—", color: perf?.avgReturn && perf.avgReturn > 0 ? "text-[var(--trade-bullish)]" : perf?.avgReturn && perf.avgReturn < 0 ? "text-[var(--trade-bearish)]" : undefined },
    { label: "Sharpe", value: perf?.sharpeRatio ? safeToFixed(perf.sharpeRatio, 2) : "—", color: perf?.sharpeRatio && perf.sharpeRatio >= 1 ? "text-[var(--trade-bullish)]" : undefined },
    { label: "Engine", value: health?.score ? `${health.score}%` : health?.overall || "—", color: "text-[var(--brand-cyan)]" },
  ];

  if (stats.every(s => s.value === "—")) {
    return (
      <div className={cn(componentStyles.card.inset, "p-2 text-center")}>
        <p className="text-[10px] text-muted-foreground/40">Performance stats available during market hours</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {stats.map((stat) => (
        <div key={stat.label} className={cn(componentStyles.card.inset, "p-2 text-center")}>
          <div className={componentStyles.text.chromeLabel}>{stat.label}</div>
          <div className={cn(componentStyles.text.dataValue, "text-base font-bold", stat.color || "text-foreground")}>{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Dashboard
// ────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background page-atmosphere">
      {/* 1. Market Ticker */}
      <MarketTicker />

      <main className="max-w-7xl mx-auto px-3 sm:px-5 py-4 relative z-10">
        {/* 2. Welcome + Global Timestamp */}
        <WelcomeHeader />

        {/* 2.4 — Market Context: color + money flow + macro + GEX */}
        <SectionReveal className="mb-[var(--section-gap-sm)]">
          <SectionHeader label="Market Context" action="Full Pulse" actionHref="/pulse" />
          <MarketPulseWidget />
        </SectionReveal>

        {/* 2.45 — Live 0DTE index scalps (SPX/SPY/QQQ/IWM) from the GEX engine */}
        <SectionReveal className="mb-[var(--section-gap-sm)]">
          <SectionHeader label="Index Scalps" action="GEX Hub" actionHref="/gex" />
          <IndexScalpsCard />
        </SectionReveal>

        {/* 2.5. Session Action — Pre-market gappers + overnight movers (hero placement) */}
        <SessionAction />

        {/* 3. Market Intelligence — briefing + regime + outlook merged */}
        <SectionReveal className="mb-[var(--section-gap-sm)]">
          <SectionHeader label="Market Intelligence" action="Full Outlook" actionHref="/outlook" />
          <MarketIntelligence />
        </SectionReveal>

        {/* 4. Top Signals — convictions + setups + convergence merged */}
        <SectionReveal className="mb-[var(--section-gap-sm)]" delay={0.02}>
          <SectionHeader label="Top Signals" action="Trade Desk" actionHref="/trade-desk" />
          <TopSignals />
        </SectionReveal>

        {/* 5. News & Events — news + earnings + movers */}
        <SectionReveal className="mb-[var(--section-gap-sm)]" delay={0.03}>
          <SectionHeader label="News & Events" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--card-gap)]">
            <NewsFeed />
            <EarningsCalendar />
            <TopMovers />
          </div>
        </SectionReveal>

        {/* 6. Platform Health */}
        <SectionReveal className="mb-[var(--section-gap-sm)]" delay={0.03}>
          <SectionHeader label="Platform Health" action="Performance" actionHref="/performance" />
          <EngineHealthBar />
        </SectionReveal>

        <footer className="text-center py-4 mt-1 border-t border-border">
          <p className="text-[10px] text-muted-foreground/60">
            Educational research platform. Not financial advice.
          </p>
        </footer>
      </main>
    </div>
  );
}
