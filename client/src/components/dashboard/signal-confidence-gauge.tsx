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
    bullish: { color: "text-green-400", bg: "bg-green-500/20" },
    bearish: { color: "text-red-400", bg: "bg-red-500/20" },
    neutral: { color: "text-amber-400", bg: "bg-amber-500/20" },
  };

  const config = directionConfig[direction];
  const clampedConfidence = Math.max(0, Math.min(100, confidence));

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (clampedConfidence / 100) * circumference;

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-slate-400">
            Signal Confidence
          </span>
        </div>
        {symbol && (
          <span className="text-sm font-mono text-slate-300">{symbol}</span>
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
              className="text-slate-800"
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
                  ? "text-green-400"
                  : direction === "bearish"
                    ? "text-red-400"
                    : "text-amber-400"
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
                <span className="text-xs text-slate-400">{factor.name}</span>
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  {factor.value}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    factor.value >= 70
                      ? "bg-green-400"
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
