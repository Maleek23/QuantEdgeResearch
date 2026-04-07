import { cn, safeToFixed } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

type Regime = "risk-on" | "risk-off" | "neutral";

interface MarketRegimeDetectorProps {
  regime: Regime;
  confidence: number;
  vixLevel: number;
  breadthAdvancing: number;
  className?: string;
}

export function MarketRegimeDetector({
  regime,
  confidence,
  vixLevel,
  breadthAdvancing,
  className,
}: MarketRegimeDetectorProps) {
  const regimeConfig = {
    "risk-on": {
      label: "RISK-ON",
      color: "text-[var(--trade-bullish)]",
      bg: "bg-[var(--trade-bullish)]/10",
      border: "border-green-500/30",
      glow: "shadow-[0_0_20px_rgba(74,222,128,0.2)]",
      icon: TrendingUp,
    },
    "risk-off": {
      label: "RISK-OFF",
      color: "text-[var(--trade-bearish)]",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      glow: "shadow-[0_0_20px_rgba(248,113,113,0.2)]",
      icon: TrendingDown,
    },
    neutral: {
      label: "NEUTRAL",
      color: "text-[var(--trade-neutral)]",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      glow: "shadow-[0_0_20px_rgba(251,191,36,0.2)]",
      icon: Minus,
    },
  };

  const config = regimeConfig[regime];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-cyan-400" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Market Regime
        </span>
      </div>

      <div
        className={cn(
          "flex items-center justify-center gap-3 p-4 rounded-lg border",
          config.bg,
          config.border,
          config.glow
        )}
      >
        <Icon className={cn("w-8 h-8", config.color)} />
        <div className="flex flex-col">
          <span className={cn("text-2xl font-bold font-mono", config.color)}>
            {config.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {confidence}% confidence
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-muted/40 rounded-lg p-3">
          <span className="text-xs text-muted-foreground block mb-1">VIX Level</span>
          <span
            className={cn(
              "text-xl font-mono tabular-nums font-semibold",
              vixLevel > 25 ? "text-[var(--trade-bearish)]" : vixLevel > 18 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bullish)]"
            )}
          >
            {safeToFixed(vixLevel, 2)}
          </span>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <span className="text-xs text-muted-foreground block mb-1">Breadth A/D</span>
          <span
            className={cn(
              "text-xl font-mono tabular-nums font-semibold",
              breadthAdvancing > 60 ? "text-[var(--trade-bullish)]" : breadthAdvancing < 40 ? "text-[var(--trade-bearish)]" : "text-foreground/80"
            )}
          >
            {breadthAdvancing}%
          </span>
        </div>
      </div>
    </div>
  );
}
