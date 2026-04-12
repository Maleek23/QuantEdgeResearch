/**
 * TradeCard — The One Card
 * ========================
 * Replaces SignalCard, trade-idea-card (×3), and shared variants.
 * Three density modes: full | compact | row.
 *
 * Design DNA: Bloomberg terminal density × Apple surface quality.
 * Every number in JetBrains Mono. Every price tabular-nums aligned.
 * Direction encoded as a 2px left-edge accent — no ambiguity.
 */

import * as React from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Clock,
} from "lucide-react";
import { cn, safeToFixed, formatRelativeTime, safeNumber } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface TradeCardData {
  id?: string | number;
  symbol: string;
  direction: "long" | "short" | "LONG" | "SHORT" | "bullish" | "bearish";
  /** Asset type — determines option-specific fields visibility */
  assetType?: "stock" | "option" | "crypto" | "future" | "penny_stock";
  optionType?: "call" | "put";
  strikePrice?: number;
  expiryDate?: string;
  /** Prices */
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  /** Scores */
  confidenceScore?: number;
  riskRewardRatio?: number;
  grade?: string;
  /** Meta */
  source?: string;
  catalyst?: string;
  timestamp?: string;
  /** Tier badge */
  tier?: string;
}

export interface TradeCardProps {
  data: TradeCardData;
  /** full = detailed card, compact = grid card, row = table row */
  variant?: "full" | "compact" | "row";
  /** Custom click handler — overrides default Link navigation */
  onClick?: () => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function isLong(dir: string): boolean {
  const d = dir.toLowerCase();
  return d === "long" || d === "bullish";
}

function dirColor(dir: string): string {
  return isLong(dir) ? "var(--trade-bullish)" : "var(--trade-bearish)";
}

function gradeColor(grade?: string): { bg: string; text: string; border: string } {
  // Professional: neutral backgrounds, only text carries the accent color
  if (!grade) return { bg: "bg-foreground/[0.02]", text: "text-muted-foreground", border: "border-foreground/[0.06]" };
  const g = grade.toUpperCase();
  if (g === "S" || g === "A+" || g === "A")
    return { bg: "bg-foreground/[0.05]", text: "text-amber-400", border: "border-foreground/[0.12]" };
  if (g === "A-" || g === "B+")
    return { bg: "bg-foreground/[0.04]", text: "text-[var(--trade-bullish)]", border: "border-foreground/[0.10]" };
  if (g === "B" || g === "B-")
    return { bg: "bg-foreground/[0.03]", text: "text-cyan-400", border: "border-foreground/[0.08]" };
  if (g.startsWith("C"))
    return { bg: "bg-foreground/[0.02]", text: "text-muted-foreground", border: "border-foreground/[0.06]" };
  return { bg: "bg-foreground/[0.02]", text: "text-[var(--trade-bearish)]", border: "border-foreground/[0.06]" };
}

function confColor(conf?: number): string {
  if (!conf) return "text-muted-foreground";
  if (conf >= 80) return "text-[var(--trade-bullish)]";
  if (conf >= 65) return "text-cyan-400";
  return "text-amber-400";
}

function sourceLabel(src?: string): { label: string; color: string } {
  const s = (src || "").toLowerCase();
  // Desaturated: neutral bg, only text carries color
  if (s === "tradingview" || s === "tv") return { label: "TV", color: "text-purple-400 bg-foreground/[0.03] border-foreground/[0.08]" };
  if (s === "ai") return { label: "AI", color: "text-violet-400 bg-foreground/[0.03] border-foreground/[0.08]" };
  if (s === "quant") return { label: "QNT", color: "text-cyan-400 bg-foreground/[0.03] border-foreground/[0.08]" };
  if (s === "flow") return { label: "FLW", color: "text-[var(--trade-bullish)] bg-foreground/[0.03] border-foreground/[0.08]" };
  if (s === "hybrid") return { label: "HYB", color: "text-blue-400 bg-foreground/[0.03] border-foreground/[0.08]" };
  return { label: (src || "SCAN").toUpperCase().slice(0, 4), color: "text-muted-foreground bg-foreground/[0.02] border-foreground/[0.06]" };
}

function computeRR(entry?: number, target?: number, stop?: number): string {
  if (!entry || !target || !stop || entry === stop) return "--";
  const reward = Math.abs(target - entry);
  const risk = Math.abs(entry - stop);
  if (risk === 0) return "--";
  return `${(reward / risk).toFixed(1)}`;
}

// ═══════════════════════════════════════════════════════════
// CARD SHELL — wraps content with direction accent + hover
// ═══════════════════════════════════════════════════════════

function CardShell({
  symbol,
  direction,
  onClick,
  className,
  children,
}: {
  symbol: string;
  direction: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <div
      className={cn(
        // Base
        "relative rounded-lg bg-card border border-card-border overflow-hidden",
        // Left accent — the signature directional indicator
        "border-l-[3px]",
        isLong(direction) ? "border-l-[var(--trade-bullish)]" : "border-l-[var(--trade-bearish)]",
        // Interaction
        "cursor-pointer transition-all duration-150",
        "hover:-translate-y-[1px] hover:shadow-md",
        "hover:border-[var(--brand-teal)]/25",
        "dark:hover:shadow-[0_4px_20px_rgba(20,184,166,0.06)]",
        "active:translate-y-0 active:shadow-sm",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );

  if (onClick) return inner;
  return <Link href={`/t/${symbol}`}>{inner}</Link>;
}

// ═══════════════════════════════════════════════════════════
// FULL VARIANT — detailed card with all data
// ═══════════════════════════════════════════════════════════

function FullCard({ data, onClick, className }: Omit<TradeCardProps, "variant">) {
  const { symbol, direction, assetType, optionType, strikePrice, expiryDate,
    entryPrice, targetPrice, stopLoss, confidenceScore, grade, source,
    catalyst, timestamp, tier, riskRewardRatio } = data;

  const long = isLong(direction);
  const gc = gradeColor(grade);
  const src = sourceLabel(source);
  const rr = riskRewardRatio || computeRR(entryPrice, targetPrice, stopLoss);
  const isOption = assetType === "option" || !!optionType;
  const contractCost = isOption && entryPrice ? entryPrice * 100 : null;
  const potentialPct = entryPrice && targetPrice
    ? ((targetPrice - entryPrice) / entryPrice * 100) : 0;

  const expiryFormatted = expiryDate
    ? new Date(expiryDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <CardShell symbol={symbol} direction={direction} onClick={onClick} className={className}>
      <div className="p-3">
        {/* ── Row 1: Symbol + Direction + Grade ── */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {/* Direction icon */}
            <div className={cn(
              "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
              long ? "bg-foreground/[0.04] text-[var(--trade-bullish)]" : "bg-foreground/[0.04] text-[var(--trade-bearish)]"
            )}>
              {long ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-sm text-foreground tracking-wider">{symbol}</span>
                {tier && (
                  <span className="text-[7px] px-1 py-0 rounded font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">{tier}</span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={cn(
                  "text-[8px] px-1 py-0 rounded font-mono font-semibold",
                  long ? "bg-foreground/[0.03] text-[var(--trade-bullish)]" : "bg-foreground/[0.03] text-[var(--trade-bearish)]"
                )}>
                  {long ? "LONG" : "SHORT"}
                </span>
                {isOption && optionType && (
                  <span className="text-[8px] px-1 py-0 rounded font-mono bg-purple-500/10 text-purple-400">
                    {optionType.toUpperCase()} {strikePrice ? `$${strikePrice}` : ""}
                  </span>
                )}
                {expiryFormatted && (
                  <span className="text-[8px] text-muted-foreground/60 font-mono">{expiryFormatted}</span>
                )}
              </div>
            </div>
          </div>

          {/* Grade + Source */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn("text-[8px] px-1.5 py-0 rounded font-mono font-semibold border", src.color)}>
              {src.label}
            </span>
            {grade && (
              <span className={cn("text-xs font-mono font-bold px-1.5 py-0.5 rounded border", gc.bg, gc.text, gc.border)}>
                {grade}
              </span>
            )}
          </div>
        </div>

        {/* ── Row 2: Confidence + Target gain ── */}
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          <div className="text-center py-1.5 rounded-md bg-muted/30 border border-border/30">
            <div className="text-[7px] text-muted-foreground/60 uppercase font-mono tracking-wider">Conf</div>
            <div className={cn("text-base font-bold font-mono tabular-nums", confColor(confidenceScore))}>
              {confidenceScore ? `${Math.round(confidenceScore)}%` : "--"}
            </div>
          </div>
          <div className="text-center py-1.5 rounded-md bg-muted/30 border border-border/30">
            <div className="text-[7px] text-muted-foreground/60 uppercase font-mono tracking-wider">Target</div>
            <div className="text-base font-bold font-mono tabular-nums text-[var(--trade-bullish)]">
              {potentialPct !== 0 ? `+${potentialPct.toFixed(0)}%` : "--"}
            </div>
          </div>
        </div>

        {/* ── Row 3: Entry / Target / Stop / R:R ── */}
        <div className="flex items-center justify-between text-[11px] mb-2">
          {[
            { label: "Entry", value: entryPrice, color: "text-foreground" },
            { label: "Target", value: targetPrice, color: "text-[var(--trade-bullish)]" },
            { label: "Stop", value: stopLoss, color: "text-[var(--trade-bearish)]" },
            { label: "R:R", value: null, color: "text-cyan-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <div className="text-[7px] text-muted-foreground/50 uppercase font-mono tracking-wider">{label}</div>
              <div className={cn("font-mono tabular-nums font-medium", color)}>
                {label === "R:R" ? `${rr}:1` : value ? `$${safeToFixed(value, 2)}` : "--"}
              </div>
              {label === "Entry" && contractCost && (
                <div className="text-[7px] text-muted-foreground/40 font-mono tabular-nums">${contractCost.toFixed(0)}/ct</div>
              )}
            </div>
          ))}
        </div>

        {/* ── Row 4: Catalyst ── */}
        {catalyst && (
          <div className="pt-1.5 border-t border-border/30">
            <p className="text-[9px] text-muted-foreground/60 truncate flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-amber-500/40 shrink-0" />
              {catalyst.slice(0, 90)}
            </p>
          </div>
        )}

        {/* ── Row 5: Timestamp + Source ── */}
        <div className="flex items-center justify-between mt-1.5 text-[7px] text-muted-foreground/40 font-mono">
          <span className="flex items-center gap-0.5">
            <Clock className="w-2 h-2" />
            {formatRelativeTime(timestamp)}
          </span>
          <span className="uppercase tracking-widest">{source || "scan"}</span>
        </div>
      </div>
    </CardShell>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPACT VARIANT — condensed for grid layouts
// ═══════════════════════════════════════════════════════════

function CompactCard({ data, onClick, className }: Omit<TradeCardProps, "variant">) {
  const { symbol, direction, confidenceScore, grade, source, entryPrice,
    targetPrice, timestamp, tier } = data;

  const long = isLong(direction);
  const gc = gradeColor(grade);
  const potentialPct = entryPrice && targetPrice
    ? ((targetPrice - entryPrice) / entryPrice * 100) : 0;

  return (
    <CardShell symbol={symbol} direction={direction} onClick={onClick} className={className}>
      <div className="p-2.5">
        {/* Header: symbol + grade */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-sm text-foreground tracking-wider">{symbol}</span>
            <span className={cn(
              "text-[8px] px-1 py-0 rounded font-mono font-semibold",
              long ? "bg-foreground/[0.03] text-[var(--trade-bullish)]" : "bg-foreground/[0.03] text-[var(--trade-bearish)]"
            )}>
              {long ? "LONG" : "SHORT"}
            </span>
            {tier && <span className="text-[7px] px-0.5 font-mono text-amber-400/70">{tier}</span>}
          </div>
          {grade && (
            <span className={cn("text-[10px] font-mono font-bold px-1 py-0 rounded border", gc.bg, gc.text, gc.border)}>
              {grade}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] font-mono tabular-nums">
            <span className={confColor(confidenceScore)}>{confidenceScore ? `${Math.round(confidenceScore)}%` : "--"}</span>
            {potentialPct !== 0 && (
              <span className="text-[var(--trade-bullish)]">+{potentialPct.toFixed(0)}%</span>
            )}
            {entryPrice && (
              <span className="text-muted-foreground">${safeToFixed(entryPrice, 2)}</span>
            )}
          </div>
          <span className="text-[8px] text-muted-foreground/40 font-mono">{formatRelativeTime(timestamp)}</span>
        </div>
      </div>
    </CardShell>
  );
}

// ═══════════════════════════════════════════════════════════
// ROW VARIANT — single-line for table/list views
// ═══════════════════════════════════════════════════════════

function RowCard({ data, onClick, className }: Omit<TradeCardProps, "variant">) {
  const { symbol, direction, confidenceScore, grade, source, entryPrice,
    targetPrice, stopLoss, timestamp, riskRewardRatio } = data;

  const long = isLong(direction);
  const gc = gradeColor(grade);
  const src = sourceLabel(source);
  const rr = riskRewardRatio || computeRR(entryPrice, targetPrice, stopLoss);

  return (
    <CardShell symbol={symbol} direction={direction} onClick={onClick} className={cn("rounded-md", className)}>
      <div className="flex items-center gap-3 px-2.5 py-2">
        {/* Direction + Symbol */}
        <div className="flex items-center gap-2 min-w-[90px]">
          <div className={cn(
            "w-5 h-5 rounded flex items-center justify-center shrink-0",
            long ? "bg-foreground/[0.04] text-[var(--trade-bullish)]" : "bg-foreground/[0.04] text-[var(--trade-bearish)]"
          )}>
            {long ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          </div>
          <span className="font-mono font-bold text-xs text-foreground tracking-wider">{symbol}</span>
        </div>

        {/* Source */}
        <span className={cn("text-[7px] px-1 py-0 rounded font-mono font-semibold border shrink-0", src.color)}>
          {src.label}
        </span>

        {/* Prices */}
        <div className="flex items-center gap-3 flex-1 text-[10px] font-mono tabular-nums">
          <div>
            <span className="text-[7px] text-muted-foreground/40 uppercase block">Entry</span>
            <span className="text-foreground font-medium">{entryPrice ? `$${safeToFixed(entryPrice, 2)}` : "--"}</span>
          </div>
          <div>
            <span className="text-[7px] text-[var(--trade-bullish)]/40 uppercase block">Target</span>
            <span className="text-[var(--trade-bullish)] font-medium">{targetPrice ? `$${safeToFixed(targetPrice, 2)}` : "--"}</span>
          </div>
          <div>
            <span className="text-[7px] text-[var(--trade-bearish)]/40 uppercase block">Stop</span>
            <span className="text-[var(--trade-bearish)] font-medium">{stopLoss ? `$${safeToFixed(stopLoss, 2)}` : "--"}</span>
          </div>
        </div>

        {/* R:R */}
        <div className="text-[10px] font-mono tabular-nums text-cyan-400 font-bold min-w-[35px] text-right">
          {rr}:1
        </div>

        {/* Confidence + Grade */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("text-[10px] font-mono font-bold tabular-nums", confColor(confidenceScore))}>
            {confidenceScore ? `${Math.round(confidenceScore)}%` : "--"}
          </span>
          {grade && (
            <span className={cn("text-[9px] font-mono font-bold px-1 py-0 rounded border", gc.bg, gc.text, gc.border)}>
              {grade}
            </span>
          )}
        </div>

        {/* Time */}
        <span className="text-[8px] text-muted-foreground/30 font-mono min-w-[25px] text-right">
          {formatRelativeTime(timestamp)}
        </span>
      </div>
    </CardShell>
  );
}

// ═══════════════════════════════════════════════════════════
// EXPORT — single entry point
// ═══════════════════════════════════════════════════════════

export function TradeCard({ data, variant = "full", onClick, className }: TradeCardProps) {
  switch (variant) {
    case "compact":
      return <CompactCard data={data} onClick={onClick} className={className} />;
    case "row":
      return <RowCard data={data} onClick={onClick} className={className} />;
    default:
      return <FullCard data={data} onClick={onClick} className={className} />;
  }
}

export default TradeCard;
