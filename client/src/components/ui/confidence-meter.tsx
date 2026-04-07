/**
 * ConfidenceMeter — Segmented confidence visualization
 *
 * Clean, professional confidence bar with tick marks and semantic colors.
 * No glow effects, no shimmer — just clear data communication.
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Flame, Zap, TrendingUp, Minus } from "lucide-react";

interface ConfidenceMeterProps {
  confidence: number; // 0-100
  className?: string;
  showLabel?: boolean;
  showTicks?: boolean;
  animated?: boolean;
  size?: "sm" | "default" | "lg";
  variant?: "bar" | "inline";
}

const sizeMap = {
  sm: "h-1",
  default: "h-1.5",
  lg: "h-2",
};

function getConfidenceStyle(value: number) {
  if (value >= 80) return {
    color: "text-[var(--trade-bullish)]",
    bgColor: "bg-[var(--trade-bullish)]",
    icon: Flame,
    label: "HIGH",
  };
  if (value >= 60) return {
    color: "text-[var(--brand-cyan)]",
    bgColor: "bg-[var(--brand-cyan)]",
    icon: Zap,
    label: "GOOD",
  };
  if (value >= 40) return {
    color: "text-[var(--trade-neutral)]",
    bgColor: "bg-[var(--trade-neutral)]",
    icon: TrendingUp,
    label: "MOD",
  };
  return {
    color: "text-muted-foreground",
    bgColor: "bg-muted-foreground",
    icon: Minus,
    label: "LOW",
  };
}

export function ConfidenceMeter({
  confidence,
  className,
  showLabel = true,
  showTicks = false,
  animated = true,
  size = "default",
  variant = "bar",
}: ConfidenceMeterProps) {
  const clamped = Math.max(0, Math.min(100, confidence));
  const style = getConfidenceStyle(clamped);
  const Icon = style.icon;

  // Inline variant — just number + small bar, for tight spaces
  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className={cn("text-xs font-mono font-bold tabular-nums", style.color)}>
          {clamped}%
        </span>
        <div className="w-12 h-1 rounded-full bg-muted/50 overflow-hidden">
          {animated ? (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${clamped}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
              className={cn("h-full rounded-full", style.bgColor)}
            />
          ) : (
            <div
              style={{ width: `${clamped}%` }}
              className={cn("h-full rounded-full", style.bgColor)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Confidence</span>
          <div className="flex items-center gap-1.5">
            <Icon className={cn("w-3 h-3", style.color)} />
            <span className={cn("text-sm font-mono font-bold tabular-nums", style.color)}>
              {clamped}%
            </span>
          </div>
        </div>
      )}

      {/* Segmented progress bar */}
      <div className="relative">
        <div className={cn("bg-muted/40 rounded-full overflow-hidden", sizeMap[size])}>
          {animated ? (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${clamped}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
              className={cn("h-full rounded-full", style.bgColor)}
            />
          ) : (
            <div
              style={{ width: `${clamped}%` }}
              className={cn("h-full rounded-full transition-all duration-300", style.bgColor)}
            />
          )}
        </div>

        {/* Tick marks at 25/50/75 */}
        {showTicks && (
          <div className="absolute inset-0 flex">
            {[25, 50, 75].map((tick) => (
              <div
                key={tick}
                className="absolute top-0 bottom-0 w-px bg-foreground/10"
                style={{ left: `${tick}%` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Label badge */}
      {showLabel && clamped >= 60 && (
        <div className={cn("text-[10px] font-semibold font-mono uppercase tracking-wider", style.color)}>
          {style.label} CONVICTION
        </div>
      )}
    </div>
  );
}
