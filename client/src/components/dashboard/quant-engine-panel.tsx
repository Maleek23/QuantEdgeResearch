import { cn } from "@/lib/utils";
import { BarChart2, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface QuantMetric {
  name: string;
  value: number;
  signal: "bullish" | "bearish" | "neutral";
  description?: string;
}

interface QuantEnginePanelProps {
  metrics: QuantMetric[];
  overallSignal: "bullish" | "bearish" | "neutral";
  zScore: number;
  className?: string;
}

export function QuantEnginePanel({
  metrics,
  overallSignal,
  zScore,
  className,
}: QuantEnginePanelProps) {
  const signalConfig = {
    bullish: { color: "text-green-400", icon: TrendingUp },
    bearish: { color: "text-red-400", icon: TrendingDown },
    neutral: { color: "text-amber-400", icon: Minus },
  };

  const config = signalConfig[overallSignal];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-400" />
          <span className="text-xs uppercase tracking-widest text-slate-400">
            Quant Engine
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4", config.color)} />
          <span className={cn("text-xs font-medium uppercase", config.color)}>
            {overallSignal}
          </span>
        </div>
      </div>

      <div className="bg-slate-800/40 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Composite Z-Score</span>
          <span
            className={cn(
              "text-xl font-mono tabular-nums font-bold",
              zScore > 1 ? "text-green-400" : zScore < -1 ? "text-red-400" : "text-slate-300"
            )}
          >
            {zScore >= 0 ? "+" : ""}{zScore.toFixed(2)}σ
          </span>
        </div>
        <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300",
              zScore > 0 ? "bg-green-400" : "bg-red-400"
            )}
            style={{
              width: `${Math.min(Math.abs(zScore) * 20, 100)}%`,
              marginLeft: zScore < 0 ? "auto" : 0,
              marginRight: zScore > 0 ? "auto" : 0,
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {metrics.map((metric) => {
          const metricConfig = signalConfig[metric.signal];
          const MetricIcon = metricConfig.icon;
          return (
            <div
              key={metric.name}
              className="flex items-center justify-between p-2 bg-slate-800/30 rounded hover:bg-slate-800/50 transition-colors"
              title={metric.description}
            >
              <div className="flex items-center gap-2">
                <MetricIcon className={cn("w-3 h-3", metricConfig.color)} />
                <span className="text-xs text-slate-300">{metric.name}</span>
              </div>
              <span className={cn("text-sm font-mono tabular-nums font-medium", metricConfig.color)}>
                {metric.value.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
