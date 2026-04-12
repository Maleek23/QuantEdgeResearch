/**
 * NEXT DAY / WEEKEND OUTLOOK
 * Public-facing page — answers "what's it looking like for tomorrow?"
 * Inspired by TradeXYZ weekend markets layout.
 */

import React from "react";
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
    gainers: Array<{
      symbol: string; name: string; price: number; previousClose: number;
      changePct: number; dayChange: number; volume: number; avgVolume: number;
      marketCap: number; week52High: number; week52Low: number; sector: string | null;
    }>;
    losers: Array<{
      symbol: string; name: string; price: number; previousClose: number;
      changePct: number; dayChange: number; volume: number; avgVolume: number;
      marketCap: number; week52High: number; week52Low: number; sector: string | null;
    }>;
    sectors: Array<{ sector: string; changePct: number }>;
    sessionStats: { totalIdeas: number; closed: number; wins: number; losses: number; winRate: number | null };
    carryOverIdeas: Array<{
      symbol: string; direction: string; entryPrice: number;
      targetPrice: number; stopLoss: number; source: string;
      confidenceScore: number; catalyst: string;
    }>;
  } | null;
  geopolitical: {
    activeScenarios: Array<{
      id: string; name: string; icon: string; category: string;
      likelihood: string; description: string; confidence: number;
      topReactions: Array<{ asset: string; label: string; move24h: number; direction: string }>;
      sectorImpact: Array<{ sector: string; direction: string; magnitude: number }>;
      tradingPlan: string;
      watchpoints: string[];
    }>;
    riskLevel: string;
    vix: number | null;
  } | null;
  breakingNews: Array<{
    title: string; summary: string; source: string;
    publishedAt: string; sentiment: string; sentimentScore: number;
    tickers: string[]; url: string;
  }>;
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

// ─── Friday Session Recap (Weekend Only) — TradeXYZ-inspired ─────

type MoverSortKey = "symbol" | "changePct" | "price" | "volume" | "marketCap";

function FridayMoversTable({ gainers, losers }: { gainers: any[]; losers: any[] }) {
  const [view, setView] = React.useState<"gainers" | "losers">("gainers");
  const [sortKey, setSortKey] = React.useState<MoverSortKey>("changePct");
  const [sortAsc, setSortAsc] = React.useState(false);

  if (gainers.length === 0 && losers.length === 0) return null;

  const items = view === "gainers" ? gainers : losers;
  const sorted = [...items].sort((a, b) => {
    const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
    if (typeof av === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });

  const handleSort = (key: MoverSortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortHeader = ({ k, label, align }: { k: MoverSortKey; label: string; align?: string }) => (
    <th
      onClick={() => handleSort(k)}
      className={cn(
        "px-2 py-1.5 text-[9px] font-mono uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none",
        sortKey === k ? "text-[var(--brand-teal)]" : "text-muted-foreground/60",
        align === "right" && "text-right"
      )}
    >
      {label} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
    </th>
  );

  const fmtVol = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return v.toString();
  };

  const fmtMcap = (v: number) => {
    if (!v) return "–";
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(1) + "T";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(0) + "M";
    return "$" + v.toLocaleString();
  };

  return (
    <div>
      {/* Toggle */}
      <div className="flex gap-1 mb-3">
        {(["gainers", "losers"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "px-3 py-1 rounded text-[10px] font-mono font-semibold uppercase tracking-wider transition-all",
              view === v
                ? v === "gainers"
                  ? "bg-emerald-500/15 text-[var(--trade-bullish)] border border-emerald-500/30"
                  : "bg-red-500/15 text-[var(--trade-bearish)] border border-red-500/30"
                : "text-muted-foreground/50 hover:text-muted-foreground border border-transparent"
            )}
          >
            {v === "gainers" ? `▲ Gainers (${gainers.length})` : `▼ Losers (${losers.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border/30">
              <SortHeader k="symbol" label="Symbol" />
              <SortHeader k="price" label="Close" align="right" />
              <th className="px-2 py-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 text-right">Prev</th>
              <SortHeader k="changePct" label="Move" align="right" />
              <SortHeader k="volume" label="Vol" align="right" />
              <SortHeader k="marketCap" label="Mkt Cap" align="right" />
              <th className="px-2 py-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 text-right">52W Range</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => {
              const isPos = m.changePct >= 0;
              const pctOf52 = m.week52High > m.week52Low
                ? ((m.price - m.week52Low) / (m.week52High - m.week52Low)) * 100
                : 50;
              const volRatio = m.avgVolume > 0 ? m.volume / m.avgVolume : 1;
              return (
                <tr key={i} className="border-b border-border/10 hover:bg-card/50 transition-colors">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-semibold text-foreground">{m.symbol}</span>
                      {m.sector && <span className="text-[8px] text-muted-foreground/40 hidden sm:inline">{m.sector}</span>}
                    </div>
                    <div className="text-[9px] text-muted-foreground/50 truncate max-w-[120px]">{m.name}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="text-xs font-mono text-foreground/80">${formatPrice(m.price)}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="text-[10px] font-mono text-muted-foreground/50">${formatPrice(m.previousClose)}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <div className={cn("text-xs font-mono font-semibold", isPos ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
                      {isPos ? "+" : ""}{(m.changePct ?? 0).toFixed(2)}%
                    </div>
                    <div className={cn("text-[9px] font-mono", isPos ? "text-emerald-500/60" : "text-red-500/60")}>
                      {isPos ? "+" : ""}${(m.dayChange ?? 0).toFixed(2)}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="text-[10px] font-mono text-muted-foreground">{fmtVol(m.volume)}</span>
                    {volRatio > 1.5 && (
                      <div className="text-[8px] font-mono text-amber-400">{volRatio.toFixed(1)}x avg</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="text-[10px] font-mono text-muted-foreground">{fmtMcap(m.marketCap)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 justify-end">
                      <div className="w-16 h-1.5 rounded-full bg-muted/30 relative overflow-hidden">
                        <div
                          className={cn("absolute top-0 left-0 h-full rounded-full", isPos ? "bg-emerald-500/40" : "bg-red-500/40")}
                          style={{ width: `${Math.min(100, Math.max(0, pctOf52))}%` }}
                        />
                        <div
                          className="absolute top-0 w-0.5 h-full bg-foreground/60 rounded"
                          style={{ left: `${Math.min(100, Math.max(0, pctOf52))}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sector Treemap (area-proportional) ─────────────────────────

function SectorTreemap({ sectors }: { sectors: Array<{ sector: string; changePct: number }> }) {
  if (sectors.length === 0) return null;

  // Calculate area proportional to absolute change
  const total = sectors.reduce((s, x) => s + Math.max(Math.abs(x.changePct), 0.1), 0);
  const maxAbs = Math.max(...sectors.map(s => Math.abs(s.changePct)), 0.01);

  return (
    <div className="space-y-2">
      {/* Treemap grid — areas proportional to move magnitude */}
      <div className="grid gap-1" style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(80px, 1fr))`,
      }}>
        {sectors.map((s, i) => {
          const isPos = s.changePct >= 0;
          const intensity = Math.min(1, Math.abs(s.changePct) / maxAbs);
          const weight = Math.max(Math.abs(s.changePct), 0.1) / total;
          // Taller cells for bigger movers
          const minH = 48;
          const maxH = 96;
          const h = Math.round(minH + (maxH - minH) * intensity);

          return (
            <div
              key={i}
              className={cn(
                "rounded-md flex flex-col items-center justify-center p-2 transition-all cursor-default",
                "border relative overflow-hidden",
              )}
              style={{
                height: `${h}px`,
                backgroundColor: isPos
                  ? `rgba(34, 197, 94, ${0.05 + intensity * 0.15})`
                  : `rgba(239, 68, 68, ${0.05 + intensity * 0.15})`,
                borderColor: isPos
                  ? `rgba(34, 197, 94, ${0.1 + intensity * 0.3})`
                  : `rgba(239, 68, 68, ${0.1 + intensity * 0.3})`,
                gridColumn: weight > 0.2 ? "span 2" : "span 1",
              }}
            >
              <div className="text-[9px] font-mono text-muted-foreground/80 truncate max-w-full">{s.sector}</div>
              <div className={cn(
                "text-sm font-mono font-bold",
                isPos ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
              )}>
                {isPos ? "+" : ""}{s.changePct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-2 justify-center">
        {(() => {
          const up = sectors.filter(s => s.changePct > 0).length;
          const down = sectors.filter(s => s.changePct < 0).length;
          const flat = sectors.length - up - down;
          return (
            <span className="text-[9px] font-mono text-muted-foreground/50">
              {up > 0 && <span className="text-[var(--trade-bullish)]">{up} up</span>}
              {up > 0 && (down > 0 || flat > 0) && " · "}
              {down > 0 && <span className="text-[var(--trade-bearish)]">{down} down</span>}
              {down > 0 && flat > 0 && " · "}
              {flat > 0 && <span>{flat} flat</span>}
            </span>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Carry-Over Ideas with R:R ──────────────────────────────────

function CarryOverIdeas({ ideas }: { ideas: any[] }) {
  if (ideas.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {ideas.map((idea, i) => {
        const isLong = idea.direction !== "short";
        const rr = idea.stopLoss && idea.entryPrice && idea.targetPrice
          ? Math.abs(idea.targetPrice - idea.entryPrice) / Math.abs(idea.entryPrice - idea.stopLoss)
          : null;
        return (
          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded border border-border/50 bg-card/30 hover:bg-card/50 transition-colors">
            <span className="text-xs font-semibold text-[var(--brand-teal)] font-mono w-14">{idea.symbol}</span>
            <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 font-mono shrink-0",
              !isLong ? "text-[var(--trade-bearish)] border-red-500/30" : "text-[var(--trade-bullish)] border-emerald-500/30"
            )}>
              {isLong ? "LONG" : "SHORT"}
            </Badge>
            <span className="text-[10px] text-muted-foreground truncate flex-1">{idea.catalyst || idea.source}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[9px] font-mono text-red-400/60">${formatPrice(idea.stopLoss)}</span>
              <span className="text-[10px] font-mono text-muted-foreground">→</span>
              <span className="text-[10px] font-mono text-foreground/70">${formatPrice(idea.entryPrice)}</span>
              <span className="text-[10px] font-mono text-muted-foreground">→</span>
              <span className="text-[10px] font-mono text-[var(--trade-bullish)]">${formatPrice(idea.targetPrice)}</span>
            </div>
            {rr != null && rr > 0 && (
              <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 font-mono shrink-0",
                rr >= 2 ? "text-[var(--trade-bullish)] border-emerald-500/30" : "text-muted-foreground border-border"
              )}>
                {rr.toFixed(1)}R
              </Badge>
            )}
            {idea.confidenceScore > 0 && (
              <span className="text-[8px] font-mono text-muted-foreground/50">{idea.confidenceScore}pt</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Weekend Methodology Footer ─────────────────────────────────

function WeekendMethodology() {
  return (
    <Card className="bg-card/20 border-border/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-3.5 h-3.5 text-muted-foreground/40" />
        <h4 className="text-[10px] font-mono font-semibold text-muted-foreground/60 uppercase tracking-wider">Weekend Data Methodology</h4>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[10px] text-muted-foreground/50">
        <div>
          <div className="font-semibold text-muted-foreground/70 mb-0.5">Stock Data</div>
          <p>Friday's closing prices via Yahoo Finance. Volume and market cap reflect last regular session.</p>
        </div>
        <div>
          <div className="font-semibold text-muted-foreground/70 mb-0.5">Crypto</div>
          <p>Live 24/7 prices. Change % measured from Friday 4 PM ET close.</p>
        </div>
        <div>
          <div className="font-semibold text-muted-foreground/70 mb-0.5">Analysis</div>
          <p>Convictions use extended 96h lookback. Swing setups carry from Friday with live entry/target levels.</p>
        </div>
      </div>
    </Card>
  );
}

// ─── Geopolitical Scenarios ──────────────────────────────────────

function GeopoliticalPanel({ geo }: { geo: NonNullable<OutlookData["geopolitical"]> }) {
  const scenarios = geo.activeScenarios;
  if (scenarios.length === 0) return null;

  const riskColor = geo.riskLevel === "ELEVATED" ? "text-red-400" : geo.riskLevel === "LOW" ? "text-[var(--trade-bullish)]" : "text-amber-400";

  return (
    <div className="space-y-3">
      {/* Risk Level Header */}
      <div className="flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full animate-pulse", geo.riskLevel === "ELEVATED" ? "bg-red-400" : "bg-amber-400")} />
        <span className={cn("text-[10px] font-mono font-semibold uppercase", riskColor)}>
          {geo.riskLevel} RISK
        </span>
        {geo.vix != null && (
          <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">VIX: {geo.vix.toFixed(1)}</span>
        )}
      </div>

      {/* Scenario Cards */}
      {scenarios.map((s) => (
        <div key={s.id} className="rounded-lg border border-border/50 bg-card/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">{s.icon}</span>
            <span className="text-xs font-semibold text-foreground/90">{s.name}</span>
            <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3.5 font-mono ml-auto",
              s.likelihood === "HIGH" ? "text-red-400 border-red-500/30" :
              s.likelihood === "MEDIUM" ? "text-amber-400 border-amber-500/30" :
              "text-muted-foreground border-border"
            )}>
              {s.likelihood}
            </Badge>
            <span className="text-[8px] font-mono text-muted-foreground/40">{s.confidence}%</span>
          </div>

          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{s.description}</p>

          {/* Asset reactions */}
          {s.topReactions?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {s.topReactions.map((r, i) => {
                const isPos = r.move24h >= 0;
                return (
                  <div key={i} className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-mono border",
                    isPos ? "border-emerald-500/20 bg-emerald-500/5 text-[var(--trade-bullish)]" : "border-red-500/20 bg-red-500/5 text-[var(--trade-bearish)]"
                  )}>
                    {r.asset} {isPos ? "+" : ""}{r.move24h.toFixed(1)}%
                  </div>
                );
              })}
            </div>
          )}

          {/* Sector Impact */}
          {s.sectorImpact?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {s.sectorImpact.map((si, i) => (
                <span key={i} className={cn("text-[8px] font-mono",
                  si.direction === "up" ? "text-emerald-500/60" : si.direction === "down" ? "text-red-500/60" : "text-muted-foreground/40"
                )}>
                  {si.direction === "up" ? "▲" : si.direction === "down" ? "▼" : "—"} {si.sector}
                </span>
              ))}
            </div>
          )}

          {/* Trading Plan */}
          {s.tradingPlan && (
            <p className="text-[9px] text-muted-foreground/50 italic border-t border-border/20 pt-1.5">
              {s.tradingPlan}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Breaking News ──────────────────────────────────────────────

function BreakingNewsFeed({ news }: { news: OutlookData["breakingNews"] }) {
  if (!news || news.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {news.map((n, i) => {
        const sentLabel = n.sentiment?.toLowerCase() || "";
        const isBullish = sentLabel.includes("bullish") || sentLabel.includes("positive");
        const isBearish = sentLabel.includes("bearish") || sentLabel.includes("negative");
        return (
          <div key={i} className="flex items-start gap-2 px-3 py-2 rounded border border-border/30 bg-card/20 hover:bg-card/40 transition-colors">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
              isBullish ? "bg-emerald-400" : isBearish ? "bg-red-400" : "bg-amber-400"
            )} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-foreground/80 leading-snug line-clamp-2">{n.title}</div>
              {n.summary && (
                <p className="text-[9px] text-muted-foreground/50 mt-0.5 line-clamp-1">{n.summary}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[8px] text-muted-foreground/40">{n.source}</span>
                {n.tickers?.length > 0 && (
                  <span className="text-[8px] font-mono text-[var(--brand-teal)]/60">{n.tickers.join(", ")}</span>
                )}
                {n.sentimentScore != null && Math.abs(n.sentimentScore) > 0.2 && (
                  <Badge variant="outline" className={cn("text-[7px] px-1 py-0 h-3 font-mono",
                    n.sentimentScore > 0 ? "text-[var(--trade-bullish)] border-emerald-500/20" : "text-[var(--trade-bearish)] border-red-500/20"
                  )}>
                    {n.sentimentScore > 0 ? "+" : ""}{(n.sentimentScore * 100).toFixed(0)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        );
      })}
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
                    <FridayMoversTable gainers={data.fridayRecap.gainers} losers={data.fridayRecap.losers} />
                  </Card>
                )}

                {/* Sector Performance */}
                {data.fridayRecap.sectors.length > 0 && (
                  <Card className="bg-card/40 border-border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Sector Performance</h3>
                    </div>
                    <SectorTreemap sectors={data.fridayRecap.sectors} />
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

            {/* Geopolitical Scenarios */}
            {data.geopolitical && data.geopolitical.activeScenarios?.length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-red-400" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Geopolitical Risk</h3>
                  <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3 font-mono ml-auto",
                    data.geopolitical.riskLevel === "ELEVATED" ? "text-red-400 border-red-500/30" : "text-amber-400 border-amber-500/30"
                  )}>
                    {data.geopolitical.riskLevel}
                  </Badge>
                </div>
                <GeopoliticalPanel geo={data.geopolitical} />
              </Card>
            )}

            {/* Breaking News */}
            {data.breakingNews?.length > 0 && (
              <Card className="bg-card/40 border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Breaking News</h3>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3 font-mono text-amber-400 border-amber-500/30 ml-auto">
                    {data.breakingNews.length}
                  </Badge>
                </div>
                <BreakingNewsFeed news={data.breakingNews} />
              </Card>
            )}
          </motion.div>
        </div>

        {/* Weekend Methodology */}
        {data.isWeekend && <WeekendMethodology />}

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
