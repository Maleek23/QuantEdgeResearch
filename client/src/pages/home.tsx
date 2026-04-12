/**
 * QuantEdge Dashboard — Command Center
 * =====================================
 * The nerve center. Pulls real-time data from 15+ backend endpoints.
 * Designed for traders who need signal, not noise.
 *
 * Layout:
 *   ┌─ Market Ticker Strip ──────────────────────────────────┐
 *   │ SPY +0.42%  QQQ +0.67%  VIX 14.2  BTC $67,421        │
 *   ├────────────────────────────────────────────────────────┤
 *   │ Welcome + Quick Nav                                    │
 *   ├──────────────────────┬─────────────────────────────────┤
 *   │ Morning Briefing     │ Market Regime + Futures Bias    │
 *   ├──────────────────────┼─────────────────────────────────┤
 *   │ Best Setups (AI)     │ Convergence Hot Symbols         │
 *   ├──────────────────────┼──────────────┬──────────────────┤
 *   │ Breaking News        │ Earnings Cal │ Top Movers       │
 *   ├──────────────────────┴──────────────┴──────────────────┤
 *   │ Engine Health + Performance Stats                      │
 *   └───────────────────────────────────────────────────────-┘
 */

import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useMarketPoll, POLL } from "@/hooks/use-market-poll";
import { cn, safeNumber, safeToFixed, formatRelativeTime } from "@/lib/utils";
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
  Zap,
  BarChart3,
  LineChart,
  Search,
  Shield,
  Gauge,
  Target,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Cpu,
  Radio,
} from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CrossAssetOverview, EconomicCalendarWidget, getAssetClass } from "@/components/market-intelligence";
import { BorderBeam } from "@/components/magicui/border-beam";
import { useAuth } from "@/hooks/useAuth";

// ────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────

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

function SectionHeader({ label, action, actionHref }: {
  label: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="flex items-center gap-2">
        <div className="w-0.5 h-3.5 rounded-full bg-gradient-to-b from-[var(--brand-teal)] to-[var(--brand-cyan)]" />
        <h2 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] font-mono">{label}</h2>
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

// Use shared formatRelativeTime from lib/utils
const getRelativeTime = (ts?: string) => formatRelativeTime(ts || null);

// ────────────────────────────────────────────────────────────
// Market Ticker Strip
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
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            isOpen ? "bg-[var(--trade-bullish)] animate-pulse" : "bg-muted-foreground"
          )} />
          <span className={cn(
            "text-[11px] font-medium font-mono",
            isOpen ? "text-[var(--trade-bullish)]" : "text-muted-foreground"
          )}>{status}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="flex animate-marquee">
            {[...indices, ...indices].map((idx, i) => {
              const quote = marketData?.quotes?.[idx.symbol];
              const price = safeNumber(quote?.regularMarketPrice);
              const change = safeNumber(quote?.regularMarketChangePercent);
              return (
                <Link key={`${idx.symbol}-${i}`} href={`/stock/${idx.symbol}`}>
                  <div className="flex items-center gap-2 px-4 whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors">
                    <span className="text-[11px] font-medium text-muted-foreground">{idx.symbol}</span>
                    {price > 0 && (
                      <span className="text-[11px] font-mono text-foreground/70">
                        {idx.symbol === "VIX" ? safeToFixed(price, 1) : idx.symbol.includes("-USD") ? `$${safeToFixed(price, 0)}` : `$${safeToFixed(price, 2)}`}
                      </span>
                    )}
                    <span className={cn(
                      "text-[11px] font-mono font-medium",
                      change >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                    )}>
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
// Welcome Header
// ────────────────────────────────────────────────────────────

function WelcomeHeader() {
  const { user } = useAuth();
  const { status, isOpen } = useMarketStatus();

  const getGreeting = () => {
    const etTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = etTime.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const userData = user as { firstName?: string; email?: string } | null;
  const firstName = userData?.firstName || "Trader";

  const quickLinks = [
    { label: "Trade Desk", href: "/trade-desk", icon: Brain, accent: true },
    { label: "Markets", href: "/market", icon: BarChart3 },
    { label: "Charts", href: "/chart-analysis", icon: LineChart },
    { label: "Scanner", href: "/market-scanner", icon: Search },
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
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            <span className="text-border">·</span>
            <span className={cn(
              "inline-flex items-center gap-1",
              isOpen ? "text-[var(--trade-bullish)]" : "text-muted-foreground"
            )}>
              <span className={cn(
                "w-1 h-1 rounded-full",
                isOpen ? "bg-[var(--trade-bullish)] animate-pulse" : "bg-muted-foreground/50"
              )} />
              {status}
            </span>
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {quickLinks.map((link, i) => (
          <motion.div
            key={link.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.03 }}
          >
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
// Morning Briefing (AI-generated market outlook)
// ────────────────────────────────────────────────────────────

function MorningBriefing() {
  const { data, isLoading } = useQuery<{
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

  if (isLoading) {
    return (
      <Card className="bg-card border-border relative overflow-hidden">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-5 w-48 bg-muted rounded" />
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-3/4 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.tradingPlan) {
    return (
      <Card className="bg-card border-border border-l-2 border-l-[var(--brand-teal)]/30 relative overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-[var(--brand-teal)]/10 border border-[var(--brand-teal)]/20 flex items-center justify-center">
              <Sun className="w-3.5 h-3.5 text-[var(--brand-teal)]/50" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-xs">Morning Briefing</h3>
              <span className="text-[9px] text-muted-foreground font-mono">Generating...</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted/40 rounded animate-pulse" />
            <div className="h-3 w-4/5 bg-muted/30 rounded animate-pulse" />
            <div className="h-3 w-3/5 bg-muted/20 rounded animate-pulse" />
          </div>
          <p className="text-[9px] text-muted-foreground/40 mt-3 font-mono">Next briefing at 8:30 AM ET</p>
        </CardContent>
      </Card>
    );
  }

  const outlookBadge = (outlook?: string) => {
    if (!outlook) return { dotColor: 'bg-muted-foreground', color: 'bg-muted text-muted-foreground', label: 'Neutral' };
    const lower = outlook.toLowerCase();
    if (lower.includes('bullish') || lower.includes('positive'))
      return { dotColor: 'bg-[var(--trade-bullish)]', color: 'bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)] border border-[var(--trade-bullish)]/20', label: 'Bullish' };
    if (lower.includes('bearish') || lower.includes('negative'))
      return { dotColor: 'bg-[var(--trade-bearish)]', color: 'bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)] border border-[var(--trade-bearish)]/20', label: 'Bearish' };
    return { dotColor: 'bg-[var(--trade-neutral)]', color: 'bg-[var(--trade-neutral)]/10 text-[var(--trade-neutral)] border border-[var(--trade-neutral)]/20', label: 'Cautious' };
  };

  const badge = outlookBadge(data.marketOutlook);

  return (
    <Card className="bg-card border-border border-l-2 border-l-[var(--brand-teal)] relative overflow-hidden group hover:border-[var(--brand-teal)]/30 transition-all">
      <BorderBeam colorFrom="#14b8a6" colorTo="#06b6d4" size={150} duration={12} borderWidth={1.5} />
      <CardContent className="p-3 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[var(--brand-teal)]/15 to-[var(--brand-cyan)]/15 border border-[var(--brand-teal)]/20 flex items-center justify-center">
              <Sun className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-xs">Morning Briefing</h3>
              {data.timestamp && (
                <span className="text-[9px] text-muted-foreground font-mono">{getRelativeTime(data.timestamp)}</span>
              )}
            </div>
          </div>
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1", badge.color)}>
            <span className={cn("w-1 h-1 rounded-full inline-block", badge.dotColor)} />
            {badge.label}
          </span>
        </div>

        {data.keyLevels && (data.keyLevels.spy || data.keyLevels.qqq || data.keyLevels.vix) && (
          <div className="data-strip mb-2">
            {data.keyLevels.spy ? (
              <div className="data-strip-item">
                <span className="data-strip-label">SPY</span>
                <span className="data-strip-value">${safeToFixed(data.keyLevels.spy, 0)}</span>
              </div>
            ) : null}
            {data.keyLevels.qqq ? (
              <div className="data-strip-item">
                <span className="data-strip-label">QQQ</span>
                <span className="data-strip-value">${safeToFixed(data.keyLevels.qqq, 0)}</span>
              </div>
            ) : null}
            {data.keyLevels.vix ? (
              <div className="data-strip-item">
                <span className="data-strip-label">VIX</span>
                <span className="data-strip-value">{safeToFixed(data.keyLevels.vix, 1)}</span>
              </div>
            ) : null}
          </div>
        )}

        <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3 mb-2">
          {data.tradingPlan}
        </p>

        {data.topWatchlist && data.topWatchlist.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-muted-foreground font-medium">WATCH:</span>
            {data.topWatchlist.slice(0, 5).map((item) => (
              <Link key={item.symbol} href={`/stock/${item.symbol}`}>
                <Badge variant="outline" className="cursor-pointer text-[10px] font-mono hover:bg-[var(--brand-teal)]/10 hover:border-[var(--brand-teal)]/30 hover:text-[var(--brand-teal)] border-border text-muted-foreground transition-colors">
                  {item.symbol}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Market Regime + Futures Bias (right column top)
// ────────────────────────────────────────────────────────────

function MarketRegimeCard() {
  const metricsInterval = useMarketPoll(POLL.METRICS.open, POLL.METRICS.closed);
  const priceInterval = useMarketPoll(POLL.PRICES.open, POLL.PRICES.closed);

  const { data: regime } = useQuery<{
    regime?: string;
    confidence?: number;
    description?: string;
    indicators?: Record<string, any>;
  }>({
    queryKey: ["/api/market-regime"],
    refetchInterval: metricsInterval,
  });

  const { data: futures } = useQuery<{
    symbols?: Array<{
      symbol: string;
      name?: string;
      price?: number;
      change?: number;
      changePercent?: number;
    }>;
  }>({
    queryKey: ["/api/futures"],
    refetchInterval: priceInterval,
  });

  const { data: context } = useQuery<{
    vix?: number;
    putCallRatio?: number;
    advanceDecline?: number;
    marketBreadth?: string;
  }>({
    queryKey: ["/api/market-context"],
    refetchInterval: metricsInterval,
  });

  const regimeLabel = regime?.regime || null;
  const regimeColor = regimeLabel?.toLowerCase().includes("bull") ? "var(--trade-bullish)"
    : regimeLabel?.toLowerCase().includes("bear") ? "var(--trade-bearish)"
    : "var(--trade-neutral)";

  const topFutures = (futures?.symbols || []).slice(0, 4);

  return (
    <Card className="bg-card border-border h-full">
      <CardContent className="p-4 space-y-4">
        {/* Market Regime */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-[var(--brand-cyan)]" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Market Regime</span>
          </div>
          <div className="flex items-center gap-3">
            {regimeLabel ? (
              <span className="text-lg font-bold" style={{ color: regimeColor || undefined }}>
                {regimeLabel}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground/50 font-mono animate-pulse">Analyzing...</span>
            )}
            {regime?.confidence && (
              <span className="text-xs text-muted-foreground font-mono tabular-nums">{regime.confidence}%</span>
            )}
          </div>
          {regime?.description ? (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{regime.description}</p>
          ) : !regimeLabel && (
            <p className="text-[10px] text-muted-foreground/40 mt-1 font-mono">Regime detection runs every 2 min</p>
          )}
        </div>

        {/* Key Metrics */}
        {context && (
          <div className="grid grid-cols-3 gap-2">
            {context.vix != null && (
              <div className="p-2 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-[10px] text-muted-foreground font-medium">VIX</div>
                <div className={cn("text-sm font-mono font-bold", context.vix > 25 ? "text-[var(--trade-bearish)]" : context.vix > 18 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bullish)]")}>
                  {safeToFixed(context.vix, 1)}
                </div>
              </div>
            )}
            {context.putCallRatio != null && (
              <div className="p-2 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-[10px] text-muted-foreground font-medium">P/C Ratio</div>
                <div className="text-sm font-mono font-bold text-foreground">{safeToFixed(context.putCallRatio, 2)}</div>
              </div>
            )}
            {context.advanceDecline != null && (
              <div className="p-2 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-[10px] text-muted-foreground font-medium">A/D</div>
                <div className={cn("text-sm font-mono font-bold", context.advanceDecline >= 1 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
                  {safeToFixed(context.advanceDecline, 2)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Futures */}
        {topFutures.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Futures Bias</div>
            <div className="space-y-1.5">
              {topFutures.map(f => (
                <div key={f.symbol} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">{f.name || f.symbol}</span>
                  <div className="flex items-center gap-2">
                    {f.price && <span className="font-mono text-foreground">{safeToFixed(f.price, 2)}</span>}
                    <span className={cn(
                      "font-mono font-medium",
                      safeNumber(f.changePercent) >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                    )}>
                      {safeNumber(f.changePercent) >= 0 ? "+" : ""}{safeToFixed(f.changePercent, 2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Best Setups — AI trade ideas with confidence scores
// ────────────────────────────────────────────────────────────

function BestSetups() {
  const { data } = useQuery<{ setups: Array<{
    symbol: string;
    direction: string;
    confidenceScore: number;
    source: string;
    timestamp?: string;
    entryPrice?: number;
    targetPrice?: number;
    stopLoss?: number;
  }> }>({
    queryKey: ["/api/trade-ideas/best-setups?limit=6"],
    refetchInterval: 60000,
  });

  const ideas = data?.setups?.slice(0, 6) || [];

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-teal)]/10 border border-[var(--brand-teal)]/20 flex items-center justify-center">
              <Brain className="w-4 h-4 text-[var(--brand-teal)]" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">Best Setups</h3>
              <span className="text-[10px] text-muted-foreground">AI-scored trade ideas</span>
            </div>
          </div>
          <Link href="/trade-desk">
            <Button variant="ghost" size="sm" className="text-xs text-[var(--brand-teal)] hover:text-[var(--brand-cyan)] h-7 px-2">
              View all <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </Link>
        </div>

        <div className="space-y-1.5">
          {ideas.length > 0 ? ideas.map((idea, i) => {
            const isLong = idea.direction === "bullish" || idea.direction === "LONG" || idea.direction === "long";
            const asset = getAssetClass(idea.symbol);
            const confColor = idea.confidenceScore >= 75 ? "text-[var(--trade-bullish)]"
              : idea.confidenceScore >= 60 ? "text-[var(--trade-neutral)]"
              : "text-muted-foreground";
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link href={`/stock/${idea.symbol}`}>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/60 border border-transparent hover:border-border/50 transition-all cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs font-mono",
                        isLong ? "bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)]"
                      )}>
                        {isLong ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground text-sm font-mono">{idea.symbol}</span>
                          <span className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase",
                            isLong ? "bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)]"
                          )}>
                            {isLong ? "LONG" : "SHORT"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{idea.source}</span>
                          {idea.timestamp && (
                            <span className="text-[10px] text-muted-foreground/60">{getRelativeTime(idea.timestamp)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("text-sm font-mono font-bold", confColor)}>
                        {idea.confidenceScore}%
                      </div>
                      <div className="w-12 h-1 rounded-full bg-muted mt-1 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", confColor.replace("text-", "bg-"))}
                          style={{ width: `${idea.confidenceScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          }) : (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-md bg-muted/20 border border-border/30">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-muted/40 animate-pulse" />
                    <div className="space-y-1">
                      <div className="h-3 w-12 bg-muted/40 rounded animate-pulse" />
                      <div className="h-2 w-16 bg-muted/20 rounded animate-pulse" />
                    </div>
                  </div>
                  <div className="h-4 w-8 bg-muted/30 rounded animate-pulse" />
                </div>
              ))}
              <p className="text-[9px] text-muted-foreground/30 text-center font-mono mt-2">Engines scanning 500+ stocks</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Hot Convergence Symbols — multi-engine agreement
// ────────────────────────────────────────────────────────────

function ConvergenceHotList() {
  const { data } = useQuery<{
    symbols?: Array<{
      symbol: string;
      convergenceScore?: number;
      direction?: string;
      enginesAgreed?: number;
      totalEngines?: number;
    }>;
  }>({
    queryKey: ["/api/convergence/hot-symbols"],
    refetchInterval: 120000,
  });

  const hotSymbols = (data?.symbols || []).slice(0, 5);

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[var(--brand-cyan)]/10 border border-[var(--brand-cyan)]/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-[var(--brand-cyan)]" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Convergence</h3>
            <span className="text-[10px] text-muted-foreground">Multi-engine agreement</span>
          </div>
        </div>

        {hotSymbols.length > 0 ? (
          <div className="space-y-2">
            {hotSymbols.map((sym, i) => {
              const isBullish = sym.direction?.toLowerCase().includes("bull") || sym.direction?.toLowerCase().includes("long");
              return (
                <Link key={i} href={`/stock/${sym.symbol}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-semibold text-sm text-foreground">{sym.symbol}</span>
                      {sym.direction && (
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase",
                          isBullish ? "bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)]"
                        )}>
                          {isBullish ? "BULL" : "BEAR"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {sym.enginesAgreed && sym.totalEngines && (
                        <span className="text-[10px] text-muted-foreground font-mono">{sym.enginesAgreed}/{sym.totalEngines}</span>
                      )}
                      {sym.convergenceScore && (
                        <span className={cn(
                          "text-xs font-mono font-bold",
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
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/15 border border-border/20">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-10 bg-muted/30 rounded animate-pulse" />
                  <div className="h-3 w-8 bg-muted/20 rounded animate-pulse" />
                </div>
                <div className="h-3 w-6 bg-muted/25 rounded animate-pulse" />
              </div>
            ))}
            <p className="text-[9px] text-muted-foreground/30 text-center font-mono mt-2">Convergence scan every 2 min</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Breaking News
// ────────────────────────────────────────────────────────────

function BreakingNews() {
  const { data, isLoading } = useQuery<{
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

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Newspaper className="w-4 h-4 text-orange-500" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">News Feed</h3>
          </div>
          <Badge variant="outline" className="text-[10px] border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]">
            <Radio className="w-2.5 h-2.5 mr-1 animate-pulse" />
            Live
          </Badge>
        </div>
        <div className="space-y-1.5">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : news.length > 0 ? (
            news.map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-2.5 rounded-lg hover:bg-muted/50 transition-colors group/item"
              >
                <p className="text-sm font-medium text-foreground line-clamp-2 group-hover/item:text-[var(--brand-teal)] transition-colors leading-snug">
                  {article.title}
                </p>
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
                        {article.tickers.slice(0, 2).map((ticker) => (
                          <span key={ticker} className="text-[10px] font-mono font-medium text-[var(--brand-teal)] bg-[var(--brand-teal)]/10 px-1.5 py-0.5 rounded">
                            ${ticker}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </a>
            ))
          ) : (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-2 rounded-md bg-muted/15">
                  <div className="h-3 w-full bg-muted/30 rounded animate-pulse mb-1" />
                  <div className="h-2 w-2/3 bg-muted/20 rounded animate-pulse" />
                </div>
              ))}
              <p className="text-[9px] text-muted-foreground/30 text-center font-mono mt-2">Scanning 50+ news sources</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Earnings Calendar
// ────────────────────────────────────────────────────────────

function EarningsCalendar() {
  const { data, isLoading } = useQuery<{
    earnings: Array<{
      symbol: string;
      company?: string;
      reportDate: string;
      fiscalQuarter?: string;
      estimatedEps?: number;
      time?: string;
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
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getTimeLabel = (time?: string) => {
    if (time === 'bmo' || time === 'BMO') return { label: 'Pre', color: 'text-[var(--trade-neutral)] bg-[var(--trade-neutral)]/10' };
    if (time === 'amc' || time === 'AMC') return { label: 'Post', color: 'text-purple-400 bg-purple-500/10' };
    return { label: 'TBD', color: 'text-muted-foreground bg-muted' };
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-blue-500" />
            </div>
            <h3 className="font-semibold text-foreground text-sm">Earnings</h3>
          </div>
          <Link href="/market">
            <Button variant="ghost" size="sm" className="text-xs text-[var(--brand-teal)] h-7 px-2">
              Full calendar <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </Link>
        </div>
        <div className="space-y-1.5">
          {isLoading ? (
            [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
          ) : earnings.length > 0 ? (
            earnings.map((earning, i) => {
              const timeInfo = getTimeLabel(earning.time);
              return (
                <Link key={i} href={`/stock/${earning.symbol}`}>
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-semibold text-sm text-foreground w-12">{earning.symbol}</span>
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-medium", timeInfo.color)}>
                        {timeInfo.label}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-foreground">{formatDate(earning.reportDate)}</div>
                      {earning.estimatedEps && (
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Est ${safeToFixed(earning.estimatedEps, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/15">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-10 bg-muted/30 rounded animate-pulse" />
                    <div className="h-3 w-8 bg-muted/20 rounded animate-pulse" />
                  </div>
                  <div className="h-3 w-14 bg-muted/25 rounded animate-pulse" />
                </div>
              ))}
              <p className="text-[9px] text-muted-foreground/30 text-center font-mono mt-2">No notable earnings this week</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Top Movers
// ────────────────────────────────────────────────────────────

function TopMovers() {
  const { data } = useQuery<{
    topGainers: Array<{ symbol: string; changePercent: number; percentChange?: number; price?: number }>;
    topLosers: Array<{ symbol: string; changePercent: number; percentChange?: number; price?: number }>;
  }>({
    queryKey: ["/api/market-movers"],
    refetchInterval: 60000,
  });

  const gainers = data?.topGainers?.slice(0, 4) || [];
  const losers = data?.topLosers?.slice(0, 4) || [];

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-purple-500" />
          </div>
          <h3 className="font-semibold text-foreground text-sm">Market Movers</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3 w-3 text-[var(--trade-bullish)]" />
              <span className="text-[10px] font-semibold text-[var(--trade-bullish)] uppercase">Gainers</span>
            </div>
            <div className="space-y-1">
              {gainers.map((s) => (
                <Link key={s.symbol} href={`/stock/${s.symbol}`}>
                  <div className="flex items-center justify-between p-1.5 rounded hover:bg-[var(--trade-bullish)]/5 transition-colors cursor-pointer">
                    <span className="text-xs font-mono font-semibold text-foreground">{s.symbol}</span>
                    <span className="text-xs font-mono font-bold text-[var(--trade-bullish)]">+{safeToFixed(s.changePercent ?? s.percentChange, 1)}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingDown className="h-3 w-3 text-[var(--trade-bearish)]" />
              <span className="text-[10px] font-semibold text-[var(--trade-bearish)] uppercase">Losers</span>
            </div>
            <div className="space-y-1">
              {losers.map((s) => (
                <Link key={s.symbol} href={`/stock/${s.symbol}`}>
                  <div className="flex items-center justify-between p-1.5 rounded hover:bg-[var(--trade-bearish)]/5 transition-colors cursor-pointer">
                    <span className="text-xs font-mono font-semibold text-foreground">{s.symbol}</span>
                    <span className="text-xs font-mono font-bold text-[var(--trade-bearish)]">{safeToFixed(s.changePercent ?? s.percentChange, 1)}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Engine Health + Performance Stats (bottom bar)
// ────────────────────────────────────────────────────────────

function EngineHealthBar() {
  const { data: health } = useQuery<{
    overall?: string;
    score?: number;
    engines?: Array<{ name: string; status: string; accuracy?: number }>;
  }>({
    queryKey: ["/api/engine-health"],
    refetchInterval: 300000,
  });

  const { data: perf } = useQuery<{
    totalTrades?: number;
    winRate?: number;
    avgReturn?: number;
    profitFactor?: number;
    sharpeRatio?: number;
  }>({
    queryKey: ["/api/performance/stats"],
    refetchInterval: 300000,
  });

  const stats = [
    { label: "Hit Rate", value: perf?.winRate ? `${safeToFixed(perf.winRate, 1)}%` : "—", color: perf?.winRate && perf.winRate >= 50 ? "text-[var(--trade-bullish)]" : "text-foreground" },
    { label: "Trades", value: perf?.totalTrades?.toLocaleString() || "—" },
    { label: "Profit Factor", value: perf?.profitFactor ? safeToFixed(perf.profitFactor, 2) : "—", color: perf?.profitFactor && perf.profitFactor >= 1.5 ? "text-[var(--trade-bullish)]" : "text-foreground" },
    { label: "Avg Return", value: perf?.avgReturn ? `${safeToFixed(perf.avgReturn, 1)}%` : "—", color: perf?.avgReturn && perf.avgReturn > 0 ? "text-[var(--trade-bullish)]" : perf?.avgReturn && perf.avgReturn < 0 ? "text-[var(--trade-bearish)]" : "text-foreground" },
    { label: "Engine Health", value: health?.score ? `${health.score}%` : health?.overall || "—", color: "text-[var(--brand-cyan)]" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="p-3 rounded-lg bg-card border border-border text-center relative overflow-hidden group hover:border-border/80 transition-colors">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</div>
          <div className={cn("text-lg font-mono font-bold tabular-nums", stat.color || "text-foreground")}>{stat.value}</div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Top Convictions widget — surfaces the highest-confluence picks
// from /api/convictions so the user sees them on first load.
// ────────────────────────────────────────────────────────────

interface MiniConvictionPick {
  ideaId: string;
  symbol: string;
  direction: "long" | "short";
  convictionScore: number;
  convictionBand: "S" | "A" | "B" | "C";
  layerCount: number;
  riskRewardRatio: number;
  thesis: string;
  layers: Array<{ label: string; points: number }>;
}

function TopConvictions() {
  const convictionInterval = useMarketPoll(POLL.SCANNER.open, POLL.SCANNER.closed);
  const { data, isLoading } = useQuery<{ picks: MiniConvictionPick[]; totalCandidatesScanned: number }>({
    queryKey: ["/api/convictions", { minScore: 15, limit: 6, lookbackHours: 72 }],
    queryFn: async () => {
      const res = await fetch("/api/convictions?minScore=15&limit=6&lookbackHours=72", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("convictions fetch failed");
      return res.json();
    },
    staleTime: 20_000,
    refetchInterval: convictionInterval,
  });

  const picks = data?.picks ?? [];
  const bandColor = (band: "S" | "A" | "B" | "C") =>
    band === "S"
      ? "text-amber-300 border-amber-400/40 bg-amber-500/10"
      : band === "A"
      ? "text-emerald-300 border-emerald-400/30 bg-emerald-500/10"
      : band === "B"
      ? "text-cyan-300 border-cyan-400/20 bg-cyan-500/10"
      : "text-muted-foreground border-foreground/10 bg-foreground/[0.03]";

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-bold text-foreground">Top Convictions</span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
              layered confluence
            </span>
          </div>
          <Link href="/trade-desk?preset=todays-best">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1">
              View all
              <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : picks.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No high-conviction picks in the last 72h. Check back after the next scanner pass.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {picks.map((p) => (
              <Link key={p.ideaId} href={`/t/${p.symbol}/chart`}>
                <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] hover:border-foreground/20 hover:bg-foreground/[0.04] p-2.5 cursor-pointer transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-bold text-sm text-foreground">
                        {p.symbol}
                      </span>
                      {p.direction === "long" ? (
                        <ArrowUpRight className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 text-red-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className={cn(
                          "px-1.5 py-0 rounded border text-[9px] font-mono font-bold",
                          bandColor(p.convictionBand),
                        )}
                      >
                        {p.convictionBand}
                      </span>
                      <span className={cn("text-sm font-mono font-bold", bandColor(p.convictionBand).split(" ")[0])}>
                        {p.convictionScore}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground mb-1">
                    <span>{p.layerCount} layers</span>
                    <span>·</span>
                    <span>R:R {p.riskRewardRatio.toFixed(1)}×</span>
                  </div>
                  {p.thesis && (
                    <div className="text-[10px] text-muted-foreground/80 leading-tight line-clamp-2">
                      {p.thesis}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Main Dashboard Page
// ────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background page-atmosphere">

      {/* Market Ticker */}
      <MarketTicker />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-5 py-4 relative z-10">
        {/* Welcome Header */}
        <WelcomeHeader />

        {/* Row 0: Top Convictions — highest-confluence picks first */}
        <SectionReveal className="mb-[var(--section-gap-sm)]">
          <SectionHeader label="Today's Convictions" action="View All" actionHref="/trade-desk?preset=todays-best" />
          <TopConvictions />
        </SectionReveal>

        {/* Row 1: Morning Briefing + Market Regime */}
        <SectionReveal className="mb-[var(--section-gap-sm)]">
          <SectionHeader label="Market Intelligence" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-[var(--card-gap)]">
            <div className="lg:col-span-3">
              <MorningBriefing />
            </div>
            <div className="lg:col-span-2">
              <MarketRegimeCard />
            </div>
          </div>
        </SectionReveal>

        {/* Row 2: Cross-Asset Overview */}
        <SectionReveal className="mb-[var(--section-gap-sm)]" delay={0.03}>
          <CrossAssetOverview />
        </SectionReveal>

        {/* Row 3: Best Setups + Convergence */}
        <SectionReveal className="mb-[var(--section-gap-sm)]" delay={0.03}>
          <SectionHeader label="Trade Signals" action="Trade Desk" actionHref="/trade-desk" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--card-gap)]">
            <BestSetups />
            <ConvergenceHotList />
          </div>
        </SectionReveal>

        {/* Row 4: News + Earnings + Movers */}
        <SectionReveal className="mb-[var(--section-gap-sm)]" delay={0.03}>
          <SectionHeader label="Calendar & News" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--card-gap)]">
            <BreakingNews />
            <EarningsCalendar />
            <TopMovers />
          </div>
        </SectionReveal>

        {/* Row 5: Engine Health + Performance */}
        <SectionReveal className="mb-[var(--section-gap-sm)]" delay={0.03}>
          <SectionHeader label="Platform Health" action="Performance" actionHref="/performance" />
          <EngineHealthBar />
        </SectionReveal>

        {/* Footer */}
        <footer className="text-center py-4 mt-1 border-t border-border">
          <p className="text-[10px] text-muted-foreground/60">
            Educational research platform. Not financial advice.
          </p>
        </footer>
      </main>
    </div>
  );
}
