/**
 * NEXT DAY / WEEKEND OUTLOOK
 * Public-facing page — answers "what's it looking like for tomorrow?"
 * Inspired by TradeXYZ weekend markets layout.
 */

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sun,
  Moon,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Calendar,
  Clock,
  Activity,
  BarChart3,
  Wifi,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Shield,
  Globe,
  Zap,
  Star,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────

interface OutlookData {
  timeframe: "weekend" | "next_day";
  phase: string;
  isWeekend: boolean;
  summary: string;
  marketContext: {
    regime: string;
    riskSentiment: string;
    preferredDirection: string;
    score: number;
    vixLevel: number | null;
    reasons: string[];
  } | null;
  futuresBias: "bullish" | "bearish" | "neutral";
  futures: Record<string, number | null>;
  indices: Record<string, { price: number; changePct: number } | null>;
  preMarketGaps: Record<string, {
    price: number;
    previousClose: number;
    gapPct: number;
    gapDirection: string;
    preMarketGapPct: number | null;
  }>;
  crypto: Array<{ symbol: string; price: number; changePct: number }>;
  vixContext: string | null;
  upcomingEvents: Array<{
    name: string;
    date: string;
    time: string;
    importance: string;
    description: string;
  }>;
  todayEvents: Array<{
    name: string;
    time: string;
    importance: string;
  }>;
  highImpactAlert: { name: string; importance: string; date: string; time: string } | null;
  earnings: Array<{ symbol: string; reportDate: string }>;
  swingSetups: Array<{
    symbol: string;
    score: number;
    pattern: string;
    direction: string;
    currentPrice: number;
    targetPrice: number;
    stopLoss: number;
    riskReward: number;
    reason: string;
  }>;
  topConvictions: Array<{
    symbol: string;
    direction: string;
    convictionScore: number;
    convictionBand: string;
    thesis: string;
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    layerCount: number;
  }>;
  weeklyFocus: string[];
  fridayRecap: {
    gainers: Array<{ symbol: string; name: string; price: number; changePct: number; volume: number }>;
    losers: Array<{ symbol: string; name: string; price: number; changePct: number; volume: number }>;
    sectors: Array<{ sector: string; changePct: number }>;
    sessionStats: { totalIdeas: number; closed: number; wins: number; losses: number; winRate: number | null };
    carryOverIdeas: Array<{
      symbol: string; direction: string; entryPrice: number;
      targetPrice: number; stopLoss: number; source: string;
      confidenceScore: number; catalyst: string;
    }>;
  } | null;
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  if (n > 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ChangeBadge({ pct }: { pct: number }) {
  const isPos = pct >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 font-mono text-xs",
      isPos ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
    )}>
      {isPos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {isPos ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

// ─── Futures Grid ─────────────────────────────────────────────────

const FUTURES_META: Record<string, { label: string; category: string }> = {
  ES: { label: "S&P 500", category: "Index" },
  NQ: { label: "Nasdaq 100", category: "Index" },
  YM: { label: "Dow Jones", category: "Index" },
  RTY: { label: "Russell 2000", category: "Index" },
  CL: { label: "Crude Oil", category: "Commodity" },
  GC: { label: "Gold", category: "Commodity" },
  SI: { label: "Silver", category: "Commodity" },
  ZN: { label: "10Y T-Note", category: "Bond" },
};

function FuturesGrid({ futures }: { futures: Record<string, number | null> }) {
  const entries = Object.entries(futures).filter(([, v]) => v != null);
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-center">
        <div>
          <Moon className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/60">Market closed — futures resume Sunday 6 PM ET</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {entries.map(([code, price]) => {
        const meta = FUTURES_META[code];
        return (
          <div
            key={code}
            className="rounded-lg border border-border bg-card/40 px-3 py-2.5 hover:bg-card/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {code}
              </span>
              <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 font-mono border-border text-muted-foreground/60">
                {meta?.category || "–"}
              </Badge>
            </div>
            <div className="text-sm font-semibold text-foreground/90 font-mono">
              {formatPrice(price)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {meta?.label || code}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Index Cards ──────────────────────────────────────────────────

function IndexCards({ indices }: { indices: Record<string, { price: number; changePct: number } | null> }) {
  const entries = Object.entries(indices).filter(([, v]) => v != null) as [string, { price: number; changePct: number }][];
  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {entries.map(([sym, data]) => {
        const isVIX = sym === "VIX";
        const isPos = data.changePct >= 0;
        return (
          <div
            key={sym}
            className={cn(
              "rounded-lg border px-3 py-2.5 transition-colors",
              isVIX
                ? data.price > 20
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border bg-card/40"
                : "border-border bg-card/40 hover:bg-card/60"
            )}
          >
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
              {sym}
            </div>
            <div className="text-sm font-semibold text-foreground/90 font-mono">
              ${formatPrice(data.price)}
            </div>
            <ChangeBadge pct={data.changePct} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Crypto Strip ─────────────────────────────────────────────────

function CryptoStrip({ crypto }: { crypto: OutlookData["crypto"] }) {
  if (crypto.length === 0) return null;
  return (
    <div className="flex items-center gap-3">
      {crypto.map((c) => (
        <div key={c.symbol} className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
          <span className="text-xs font-mono font-semibold text-foreground/80">{c.symbol}</span>
          <span className="text-xs font-mono text-foreground/60">${formatPrice(c.price)}</span>
          <ChangeBadge pct={c.changePct} />
        </div>
      ))}
    </div>
  );
}

// ─── Pre-Market Gaps ──────────────────────────────────────────────

function PreMarketGaps({ gaps }: { gaps: OutlookData["preMarketGaps"] }) {
  const entries = Object.entries(gaps);
  if (entries.length === 0) return null;

  // Sort by gap magnitude
  entries.sort(([, a], [, b]) => Math.abs(b.gapPct) - Math.abs(a.gapPct));

  return (
    <div className="space-y-1">
      {entries.map(([sym, data]) => {
        const isUp = data.gapDirection === "up";
        const isDown = data.gapDirection === "down";
        return (
          <div
            key={sym}
            className="flex items-center justify-between px-3 py-1.5 rounded border border-border/50 bg-card/30 hover:bg-card/50 transition-colors"
          >
            <span className="text-xs font-semibold text-foreground/80 font-mono w-16">{sym}</span>
            <span className="text-xs font-mono text-muted-foreground">${formatPrice(data.price)}</span>
            <span className="text-xs font-mono text-muted-foreground">prev ${formatPrice(data.previousClose)}</span>
            <span className={cn(
              "text-xs font-mono font-semibold px-1.5 py-0.5 rounded",
              isUp ? "text-[var(--trade-bullish)] bg-emerald-500/10" :
              isDown ? "text-[var(--trade-bearish)] bg-red-500/10" :
              "text-muted-foreground bg-muted/30"
            )}>
              {data.gapPct >= 0 ? "+" : ""}{data.gapPct.toFixed(2)}%
              {isUp ? " GAP UP" : isDown ? " GAP DOWN" : " FLAT"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Swing Setups ─────────────────────────────────────────────────

const BAND_COLORS: Record<string, string> = {
  S: "text-purple-400 bg-purple-500/15",
  A: "text-[var(--trade-bullish)] bg-emerald-500/15",
  B: "text-[var(--trade-bullish)] bg-emerald-500/10",
  C: "text-amber-400 bg-amber-500/10",
};

function SwingSetups({ setups }: { setups: OutlookData["swingSetups"] }) {
  if (setups.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {setups.map((s, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded border border-border/50 bg-card/30 hover:bg-card/50 transition-colors">
          <span className="text-xs font-semibold text-[var(--brand-teal)] font-mono w-14">{s.symbol}</span>
          <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 font-mono",
            s.direction === "bearish" ? "text-[var(--trade-bearish)] border-red-500/30" : "text-[var(--trade-bullish)] border-emerald-500/30"
          )}>
            {s.direction === "bearish" ? "SHORT" : "LONG"}
          </Badge>
          <span className="text-[10px] text-muted-foreground truncate flex-1">{s.pattern || s.reason}</span>
          <span className="text-[10px] font-mono text-muted-foreground">${formatPrice(s.currentPrice)}</span>
          <span className="text-[10px] font-mono text-[var(--trade-bullish)]">→ ${formatPrice(s.targetPrice)}</span>
          <span className="text-[10px] font-mono font-semibold text-foreground/70">{s.score}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Top Convictions ──────────────────────────────────────────────

function TopConvictions({ picks }: { picks: OutlookData["topConvictions"] }) {
  if (picks.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {picks.map((p, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded border border-border/50 bg-card/30 hover:bg-card/50 transition-colors">
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded font-mono", BAND_COLORS[p.convictionBand] || "text-muted-foreground bg-muted/30")}>
            {p.convictionBand}
          </span>
          <span className="text-xs font-semibold text-[var(--brand-teal)] font-mono w-14">{p.symbol}</span>
          <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 font-mono",
            p.direction === "short" ? "text-[var(--trade-bearish)] border-red-500/30" : "text-[var(--trade-bullish)] border-emerald-500/30"
          )}>
            {p.direction === "short" ? "SHORT" : "LONG"}
          </Badge>
          <span className="text-[10px] text-muted-foreground truncate flex-1">{p.thesis}</span>
          <span className="text-[10px] font-mono text-foreground/60">{p.convictionScore}pt</span>
          <span className="text-[10px] font-mono text-muted-foreground/50">{p.layerCount}L</span>
        </div>
      ))}
    </div>
  );
}

// ─── Weekly Focus Strip ───────────────────────────────────────────

function WeeklyFocusStrip({ symbols }: { symbols: string[] }) {
  if (symbols.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {symbols.map((sym) => (
        <Badge key={sym} variant="outline" className="text-[10px] font-mono text-[var(--brand-teal)] border-[var(--brand-teal)]/30 bg-[var(--brand-teal)]/5">
          {sym}
        </Badge>
      ))}
    </div>
  );
}

// ─── Friday Session Recap (Weekend Only) ─────────────────────────

function FridayMovers({ gainers, losers }: { gainers: any[]; losers: any[] }) {
  if (gainers.length === 0 && losers.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Gainers */}
      <div>
        <div className="text-[9px] font-mono text-[var(--trade-bullish)] uppercase tracking-wider mb-1.5">Top Gainers</div>
        <div className="space-y-1">
          {gainers.slice(0, 6).map((g, i) => (
            <div key={i} className="flex items-center justify-between px-2 py-1 rounded border border-emerald-500/10 bg-emerald-500/5">
              <span className="text-xs font-mono font-semibold text-foreground/80">{g.symbol}</span>
              <span className="text-[10px] font-mono text-[var(--trade-bullish)]">+{Math.abs(g.changePct).toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
      {/* Losers */}
      <div>
        <div className="text-[9px] font-mono text-[var(--trade-bearish)] uppercase tracking-wider mb-1.5">Top Losers</div>
        <div className="space-y-1">
          {losers.slice(0, 6).map((l, i) => (
            <div key={i} className="flex items-center justify-between px-2 py-1 rounded border border-red-500/10 bg-red-500/5">
              <span className="text-xs font-mono font-semibold text-foreground/80">{l.symbol}</span>
              <span className="text-[10px] font-mono text-[var(--trade-bearish)]">{l.changePct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectorHeatmap({ sectors }: { sectors: Array<{ sector: string; changePct: number }> }) {
  if (sectors.length === 0) return null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
      {sectors.map((s, i) => {
        const isPos = s.changePct >= 0;
        return (
          <div
            key={i}
            className={cn(
              "rounded px-2 py-1.5 text-center border transition-colors",
              isPos ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
            )}
          >
            <div className="text-[9px] font-mono text-muted-foreground truncate">{s.sector}</div>
            <div className={cn("text-xs font-mono font-semibold", isPos ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
              {isPos ? "+" : ""}{s.changePct.toFixed(2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CarryOverIdeas({ ideas }: { ideas: any[] }) {
  if (ideas.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {ideas.map((idea, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded border border-border/50 bg-card/30 hover:bg-card/50 transition-colors">
          <span className="text-xs font-semibold text-[var(--brand-teal)] font-mono w-14">{idea.symbol}</span>
          <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 font-mono",
            idea.direction === "short" ? "text-[var(--trade-bearish)] border-red-500/30" : "text-[var(--trade-bullish)] border-emerald-500/30"
          )}>
            {idea.direction === "short" ? "SHORT" : "LONG"}
          </Badge>
          <span className="text-[10px] text-muted-foreground truncate flex-1">{idea.catalyst || idea.source}</span>
          <span className="text-[10px] font-mono text-muted-foreground">${formatPrice(idea.entryPrice)}</span>
          <span className="text-[10px] font-mono text-[var(--trade-bullish)]">→ ${formatPrice(idea.targetPrice)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Events Calendar ──────────────────────────────────────────────

function EventsList({ events, title }: { events: OutlookData["upcomingEvents"]; title: string }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">{title}</h4>
      {events.map((evt, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded border border-border/50 bg-card/30">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            evt.importance === "high" ? "bg-red-400" : evt.importance === "medium" ? "bg-amber-400" : "bg-muted-foreground/40"
          )} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-foreground/80 truncate">{evt.name}</div>
            {evt.description && (
              <div className="text-[10px] text-muted-foreground truncate">{evt.description}</div>
            )}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground shrink-0">
            {evt.date} {evt.time}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[8px] px-1 py-0 h-3 shrink-0",
              evt.importance === "high" ? "border-red-500/40 text-red-400" :
              evt.importance === "medium" ? "border-amber-500/40 text-amber-400" :
              "border-border text-muted-foreground/60"
            )}
          >
            {evt.importance.toUpperCase()}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function MarketOutlook() {
  const { data, isLoading, error } = useQuery<OutlookData>({
    queryKey: ["/api/market-outlook"],
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-pulse text-[var(--brand-teal)] mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading market outlook...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Failed to load outlook</p>
        </div>
      </div>
    );
  }

  const biasIcon = data.futuresBias === "bullish" ? TrendingUp : data.futuresBias === "bearish" ? TrendingDown : Minus;
  const BiasIcon = biasIcon;
  const biasColor = data.futuresBias === "bullish" ? "text-[var(--trade-bullish)]" : data.futuresBias === "bearish" ? "text-[var(--trade-bearish)]" : "text-muted-foreground";

  return (
    <div className="min-h-screen p-3 sm:p-4">
      <div className="max-w-[1400px] mx-auto space-y-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              data.isWeekend ? "bg-indigo-500/15" : "bg-[var(--brand-teal)]/15"
            )}>
              {data.isWeekend ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-[var(--brand-teal)]" />}
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground/90">
                {data.isWeekend ? "Weekend Outlook" : "Next Day Outlook"}
              </h1>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                {data.phase === "pre_market" ? "Pre-Market" : data.phase === "regular" ? "Market Open" : data.phase === "post_market" ? "After Hours" : "Closed"}
                {" · "}
                {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>

          {/* Live badge */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Wifi className="w-3 h-3 text-[var(--trade-bullish)]" />
              <span className="text-[10px] font-mono text-[var(--trade-bullish)]">LIVE</span>
            </div>
            {data.futuresBias !== "neutral" && (
              <Badge className={cn(
                "text-[10px] font-mono",
                data.futuresBias === "bullish" ? "bg-emerald-500/20 text-[var(--trade-bullish)] border-emerald-500/30" : "bg-red-500/20 text-[var(--trade-bearish)] border-red-500/30"
              )}>
                <BiasIcon className="w-3 h-3 mr-1" />
                {data.futuresBias.toUpperCase()} BIAS
              </Badge>
            )}
          </div>
        </motion.div>

        {/* Summary Banner */}
        {data.summary && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Card className="bg-card/40 border-border px-4 py-3">
              <p className="text-sm text-foreground/80">{data.summary}</p>
            </Card>
          </motion.div>
        )}

        {/* High Impact Alert */}
        {data.highImpactAlert && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}>
            <Card className="border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-amber-400">{data.highImpactAlert.name}</span>
                <span className="text-[10px] text-muted-foreground ml-2">
                  {data.highImpactAlert.date} {data.highImpactAlert.time}
                </span>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column — Futures + Indices */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 space-y-4"
          >
            {/* Index ETFs */}
            <Card className="bg-card/40 border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-[var(--brand-teal)]" />
                <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Index ETFs</h3>
              </div>
              <IndexCards indices={data.indices} />
            </Card>

            {/* Futures */}
            <Card className="bg-card/40 border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-[var(--brand-teal)]" />
                <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Futures</h3>
                <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">
                  {data.isWeekend ? "Weekend session" : "Live"}
                </span>
              </div>
              <FuturesGrid futures={data.futures} />
            </Card>

            {/* Pre-Market Gaps */}
            {Object.keys(data.preMarketGaps).length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Pre-Market Gaps</h3>
                </div>
                <PreMarketGaps gaps={data.preMarketGaps} />
              </Card>
            )}

            {/* Crypto — 24/7 */}
            {data.crypto.length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Crypto (24/7)</h3>
                </div>
                <CryptoStrip crypto={data.crypto} />
              </Card>
            )}

            {/* Swing Setups — Tomorrow's Top Setups */}
            {data.swingSetups?.length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-[var(--brand-teal)]" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Top Swing Setups</h3>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 font-mono text-[var(--brand-teal)] border-[var(--brand-teal)]/30 ml-auto">
                    {data.swingSetups.length}
                  </Badge>
                </div>
                <SwingSetups setups={data.swingSetups} />
              </Card>
            )}

            {/* Top Convictions */}
            {data.topConvictions?.length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Top Convictions</h3>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 font-mono text-amber-400 border-amber-500/30 ml-auto">
                    {data.topConvictions.length}
                  </Badge>
                </div>
                <TopConvictions picks={data.topConvictions} />
              </Card>
            )}

            {/* ── Weekend Only: Friday Session Recap ── */}
            {data.isWeekend && data.fridayRecap && (
              <>
                {/* Friday Movers */}
                {(data.fridayRecap.gainers.length > 0 || data.fridayRecap.losers.length > 0) && (
                  <Card className="bg-card/40 border-border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-[var(--brand-teal)]" />
                      <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Friday's Movers</h3>
                      {data.fridayRecap.sessionStats.winRate != null && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 font-mono text-muted-foreground border-border ml-auto">
                          Ideas: {data.fridayRecap.sessionStats.wins}W / {data.fridayRecap.sessionStats.losses}L
                        </Badge>
                      )}
                    </div>
                    <FridayMovers gainers={data.fridayRecap.gainers} losers={data.fridayRecap.losers} />
                  </Card>
                )}

                {/* Sector Performance */}
                {data.fridayRecap.sectors.length > 0 && (
                  <Card className="bg-card/40 border-border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Sector Performance</h3>
                    </div>
                    <SectorHeatmap sectors={data.fridayRecap.sectors} />
                  </Card>
                )}

                {/* Carry-Over Ideas for Monday */}
                {data.fridayRecap.carryOverIdeas.length > 0 && (
                  <Card className="bg-card/40 border-border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Open Ideas → Monday</h3>
                      <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 font-mono text-amber-400 border-amber-500/30 ml-auto">
                        {data.fridayRecap.carryOverIdeas.length}
                      </Badge>
                    </div>
                    <CarryOverIdeas ideas={data.fridayRecap.carryOverIdeas} />
                  </Card>
                )}
              </>
            )}
          </motion.div>

          {/* Right Column — Context + Calendar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-4"
          >
            {/* Weekly Focus */}
            {data.weeklyFocus?.length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-[var(--brand-teal)]" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Weekly Focus</h3>
                </div>
                <WeeklyFocusStrip symbols={data.weeklyFocus} />
              </Card>
            )}

            {/* Market Context */}
            {data.marketContext && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-[var(--brand-teal)]" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Market Context</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Regime</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{data.marketContext.regime}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Sentiment</span>
                    <Badge variant="outline" className={cn(
                      "text-[10px] font-mono",
                      data.marketContext.riskSentiment === "risk_on" ? "text-[var(--trade-bullish)] border-emerald-500/30" :
                      data.marketContext.riskSentiment === "risk_off" ? "text-[var(--trade-bearish)] border-red-500/30" :
                      ""
                    )}>
                      {data.marketContext.riskSentiment.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Direction</span>
                    <span className={cn("text-[10px] font-mono font-semibold", biasColor)}>
                      {data.marketContext.preferredDirection}
                    </span>
                  </div>
                  {data.marketContext.vixLevel != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">VIX</span>
                      <span className={cn(
                        "text-[10px] font-mono font-semibold",
                        data.marketContext.vixLevel > 25 ? "text-red-400" : data.marketContext.vixLevel > 18 ? "text-amber-400" : "text-[var(--trade-bullish)]"
                      )}>
                        {data.marketContext.vixLevel.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {data.vixContext && (
                    <p className="text-[10px] text-muted-foreground italic mt-1 border-t border-border/50 pt-1.5">
                      {data.vixContext}
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* Today's Events */}
            {data.todayEvents.length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Today</h3>
                </div>
                <div className="space-y-1">
                  {data.todayEvents.map((evt, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        evt.importance === "high" ? "bg-red-400" : "bg-amber-400"
                      )} />
                      <span className="text-foreground/80 truncate flex-1">{evt.name}</span>
                      <span className="font-mono text-muted-foreground text-[10px]">{evt.time}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Upcoming Calendar */}
            <Card className="bg-card/40 border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-[var(--brand-teal)]" />
                <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Upcoming Events</h3>
              </div>
              {data.upcomingEvents.length > 0 ? (
                <EventsList events={data.upcomingEvents} title="" />
              ) : (
                <p className="text-xs text-muted-foreground">No major events in next 3 days</p>
              )}
            </Card>

            {/* Earnings */}
            {data.earnings.length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Earnings Soon</h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.earnings.map((e, i) => (
                    <Badge key={i} variant="outline" className="text-[10px] font-mono">
                      {e.symbol}
                      <span className="text-muted-foreground/50 ml-1">{e.reportDate}</span>
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
          </motion.div>
        </div>

        {/* Footer */}
        <div className="text-center py-2">
          <p className="text-[10px] text-muted-foreground/40 font-mono">
            Auto-refreshes every 30s · Data from futures, pre-market, economic calendar
          </p>
        </div>
      </div>
    </div>
  );
}
