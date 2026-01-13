import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";

interface EngineSignal {
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  color: string;
}

interface EngineConvergenceGaugeProps {
  engines: EngineSignal[];
  overallConvergence: number;
  className?: string;
}

export function EngineConvergenceGauge({
  engines,
  overallConvergence,
  className,
}: EngineConvergenceGaugeProps) {
  const bullishCount = engines.filter((e) => e.direction === "bullish").length;
  const bearishCount = engines.filter((e) => e.direction === "bearish").length;
  const convergenceLevel =
    overallConvergence >= 80
      ? "Strong"
      : overallConvergence >= 60
        ? "Moderate"
        : overallConvergence >= 40
          ? "Mixed"
          : "Divergent";

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-purple-400" />
        <span className="text-xs uppercase tracking-widest text-slate-400">
          Engine Convergence
        </span>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-16 h-16">
          {engines.map((engine, index) => {
            const angle = (index / engines.length) * 360;
            const radius = 24;
            const x = 32 + radius * Math.cos((angle - 90) * (Math.PI / 180));
            const y = 32 + radius * Math.sin((angle - 90) * (Math.PI / 180));
            return (
              <div
                key={engine.name}
                className={cn(
                  "absolute w-4 h-4 rounded-full border-2 transition-all duration-300",
                  engine.direction === "bullish"
                    ? "bg-green-400/30 border-green-400"
                    : engine.direction === "bearish"
                      ? "bg-red-400/30 border-red-400"
                      : "bg-amber-400/30 border-amber-400"
                )}
                style={{
                  left: x - 8,
                  top: y - 8,
                  boxShadow: `0 0 10px ${engine.direction === "bullish" ? "rgba(74, 222, 128, 0.4)" : engine.direction === "bearish" ? "rgba(248, 113, 113, 0.4)" : "rgba(251, 191, 36, 0.4)"}`,
                }}
                title={`${engine.name}: ${engine.direction} (${engine.confidence}%)`}
              />
            );
          })}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold font-mono tabular-nums">
              {overallConvergence}%
            </span>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={cn(
                "text-sm font-medium",
                overallConvergence >= 70
                  ? "text-green-400"
                  : overallConvergence >= 50
                    ? "text-amber-400"
                    : "text-red-400"
              )}
            >
              {convergenceLevel} Convergence
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-green-400">
              {bullishCount} Bullish
            </span>
            <span className="text-red-400">
              {bearishCount} Bearish
            </span>
            <span className="text-amber-400">
              {engines.length - bullishCount - bearishCount} Neutral
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {engines.map((engine) => (
          <div
            key={engine.name}
            className={cn(
              "p-2 rounded-lg border text-center",
              engine.direction === "bullish"
                ? "bg-green-500/10 border-green-500/30"
                : engine.direction === "bearish"
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-amber-500/10 border-amber-500/30"
            )}
          >
            <span className="text-[10px] text-slate-400 block">{engine.name}</span>
            <span
              className={cn(
                "text-xs font-mono font-medium",
                engine.direction === "bullish"
                  ? "text-green-400"
                  : engine.direction === "bearish"
                    ? "text-red-400"
                    : "text-amber-400"
              )}
            >
              {engine.confidence}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
