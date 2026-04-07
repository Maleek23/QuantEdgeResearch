import { cn } from "@/lib/utils";
import { Target } from "lucide-react";

interface SignalConfidenceGaugeProps {
  confidence: number;
  direction: "bullish" | "bearish" | "neutral";
  symbol?: string;
  factors: { name: string; value: number }[];
  className?: string;
}

export function SignalConfidenceGauge({
  confidence,
  direction,
  symbol,
  factors,
  className,
}: SignalConfidenceGaugeProps) {
  const directionConfig = {
    bullish: { color: "text-[var(--trade-bullish)]", bg: "bg-[var(--trade-bullish)]/20" },
    bearish: { color: "text-[var(--trade-bearish)]", bg: "bg-red-500/20" },
    neutral: { color: "text-[var(--trade-neutral)]", bg: "bg-amber-500/20" },
  };

  const config = directionConfig[direction];
  const clampedConfidence = Math.max(0, Math.min(100, confidence));

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (clampedConfidence / 100) * circumference;

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Signal Confidence
          </span>
        </div>
        {symbol && (
          <span className="text-sm font-mono text-foreground/80">{symbol}</span>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="relative">
          <svg className="w-28 h-28 -rotate-90">
            <circle
              cx="56"
              cy="56"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-foreground/80"
            />
            <circle
              cx="56"
              cy="56"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={cn(
                "transition-all duration-500",
                direction === "bullish"
                  ? "text-[var(--trade-bullish)]"
                  : direction === "bearish"
                    ? "text-[var(--trade-bearish)]"
                    : "text-[var(--trade-neutral)]"
              )}
              style={{
                filter: `drop-shadow(0 0 8px ${direction === "bullish" ? "rgb(74, 222, 128)" : direction === "bearish" ? "rgb(248, 113, 113)" : "rgb(251, 191, 36)"})`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold font-mono tabular-nums">
              {clampedConfidence}
            </span>
            <span className={cn("text-xs font-medium uppercase", config.color)}>
              {direction}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {factors.map((factor) => (
            <div key={factor.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{factor.name}</span>
                <span className="text-xs font-mono tabular-nums text-foreground/80">
                  {factor.value}%
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    factor.value >= 70
                      ? "bg-[var(--trade-bullish)]"
                      : factor.value >= 40
                        ? "bg-amber-400"
                        : "bg-red-400"
                  )}
                  style={{ width: `${factor.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
