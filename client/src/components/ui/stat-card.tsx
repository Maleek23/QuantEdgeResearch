/**
 * StatCard — Compact metric display block
 * =========================================
 * For dashboard KPIs, sidebar metrics, and data-dense grids.
 * Mono numbers, tight padding, semantic color coding.
 *
 * Variants:
 *   default  — label above, value below (vertical stack)
 *   inline   — label left, value right (horizontal row)
 *   mini     — ultra-compact, no border (for inline strips)
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  /** Metric label (e.g., "Win Rate", "VIX", "P/C Ratio") */
  label: string;
  /** Metric value (e.g., "67%", "$18.4", "0.82") */
  value: string | number;
  /** Sub-value or context (e.g., "↑ 3.2%", "52nd pct") */
  subValue?: string;
  /** Color coding */
  sentiment?: "bullish" | "bearish" | "neutral" | "warning" | "default";
  /** Layout variant */
  variant?: "default" | "inline" | "mini";
  /** Optional icon */
  icon?: React.ReactNode;
  /** Click handler */
  onClick?: () => void;
  className?: string;
}

const sentimentColors = {
  bullish: "text-[var(--trade-bullish)]",
  bearish: "text-[var(--trade-bearish)]",
  neutral: "text-foreground",
  warning: "text-amber-400",
  default: "text-foreground",
};

export function StatCard({
  label, value, subValue, sentiment = "default",
  variant = "default", icon, onClick, className,
}: StatCardProps) {
  const valueColor = sentimentColors[sentiment];

  if (variant === "mini") {
    return (
      <div
        className={cn("flex items-baseline gap-1.5", onClick && "cursor-pointer", className)}
        onClick={onClick}
      >
        <span className="text-[8px] text-muted-foreground/60 uppercase font-mono tracking-wider">{label}</span>
        <span className={cn("text-xs font-mono font-bold tabular-nums", valueColor)}>{value}</span>
        {subValue && <span className="text-[8px] text-muted-foreground/60 font-mono">{subValue}</span>}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/20 border border-border/30",
          onClick && "cursor-pointer hover:bg-muted/40 transition-colors",
          className
        )}
        onClick={onClick}
      >
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-muted-foreground/60">{icon}</span>}
          <span className="text-[9px] text-muted-foreground/60 uppercase font-mono tracking-wider">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={cn("text-sm font-mono font-bold tabular-nums", valueColor)}>{value}</span>
          {subValue && <span className="text-[8px] text-muted-foreground/60 font-mono">{subValue}</span>}
        </div>
      </div>
    );
  }

  // Default: vertical stack
  return (
    <div
      className={cn(
        "p-2.5 rounded-md bg-muted/20 border border-border/30",
        onClick && "cursor-pointer hover:bg-muted/40 transition-colors",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1 mb-0.5">
        {icon && <span className="text-muted-foreground/60">{icon}</span>}
        <span className="text-[8px] text-muted-foreground/60 uppercase font-mono tracking-wider leading-none">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-lg font-mono font-bold tabular-nums leading-tight", valueColor)}>{value}</span>
        {subValue && <span className="text-[8px] text-muted-foreground/60 font-mono">{subValue}</span>}
      </div>
    </div>
  );
}

/**
 * StatStrip — horizontal row of mini stats
 * Use inside data-strip or panel headers for compact metric display.
 */
export function StatStrip({
  stats,
  className,
}: {
  stats: Array<{ label: string; value: string | number; sentiment?: StatCardProps["sentiment"] }>;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-2.5 py-1.5 rounded-md bg-muted/15 border border-border/20 overflow-x-auto", className)}>
      {stats.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 && <div className="w-px h-3 bg-border/30 shrink-0" />}
          <StatCard {...s} variant="mini" />
        </React.Fragment>
      ))}
    </div>
  );
}

export default StatCard;
