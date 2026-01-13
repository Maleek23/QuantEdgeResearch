import { cn } from "@/lib/utils";
import { Brain, TrendingUp, TrendingDown, Minus } from "lucide-react";

type ConsensusType = "bullish" | "bearish" | "mixed";

interface AIProvider {
  name: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  summary: string;
}

interface AIConsensusSummaryProps {
  consensus: ConsensusType;
  overallConfidence: number;
  providers: AIProvider[];
  summary: string;
  className?: string;
}

export function AIConsensusSummary({
  consensus,
  overallConfidence,
  providers,
  summary,
  className,
}: AIConsensusSummaryProps) {
  const consensusConfig = {
    bullish: {
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/30",
      glow: "shadow-[0_0_15px_rgba(74,222,128,0.2)]",
    },
    bearish: {
      icon: TrendingDown,
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      glow: "shadow-[0_0_15px_rgba(248,113,113,0.2)]",
    },
    mixed: {
      icon: Minus,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      glow: "shadow-[0_0_15px_rgba(251,191,36,0.2)]",
    },
  };

  const config = consensusConfig[consensus];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-purple-400" />
        <span className="text-xs uppercase tracking-widest text-slate-400">
          AI Consensus
        </span>
      </div>

      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border mb-4",
          config.bg,
          config.border,
          config.glow
        )}
      >
        <Icon className={cn("w-6 h-6", config.color)} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className={cn("text-lg font-semibold uppercase", config.color)}>
              {consensus}
            </span>
            <span className="text-sm font-mono tabular-nums text-slate-300">
              {overallConfidence}% conf
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed mb-4 line-clamp-2">
        {summary}
      </p>

      <div className="space-y-2">
        {providers.map((provider) => (
          <div
            key={provider.name}
            className="flex items-center justify-between p-2 bg-slate-800/30 rounded"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  provider.sentiment === "bullish"
                    ? "bg-green-400"
                    : provider.sentiment === "bearish"
                      ? "bg-red-400"
                      : "bg-amber-400"
                )}
              />
              <span className="text-xs text-slate-300">{provider.name}</span>
            </div>
            <span
              className={cn(
                "text-xs font-mono tabular-nums",
                provider.sentiment === "bullish"
                  ? "text-green-400"
                  : provider.sentiment === "bearish"
                    ? "text-red-400"
                    : "text-amber-400"
              )}
            >
              {provider.confidence}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
