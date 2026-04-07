import { cn, safeToFixed } from "@/lib/utils";
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
    bullish: { color: "text-[var(--trade-bullish)]", icon: TrendingUp },
    bearish: { color: "text-[var(--trade-bearish)]", icon: TrendingDown },
    neutral: { color: "text-[var(--trade-neutral)]", icon: Minus },
  };

  const config = signalConfig[overallSignal];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-400" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
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

      <div className="bg-muted/40 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Composite Z-Score</span>
          <span
            className={cn(
              "text-xl font-mono tabular-nums font-bold",
              zScore > 1 ? "text-[var(--trade-bullish)]" : zScore < -1 ? "text-[var(--trade-bearish)]" : "text-foreground/80"
            )}
          >
            {zScore >= 0 ? "+" : ""}{safeToFixed(zScore, 2)}σ
          </span>
        </div>
        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300",
              zScore > 0 ? "bg-[var(--trade-bullish)]" : "bg-red-400"
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
              className="flex items-center justify-between p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors"
              title={metric.description}
            >
              <div className="flex items-center gap-2">
                <MetricIcon className={cn("w-3 h-3", metricConfig.color)} />
                <span className="text-xs text-foreground/80">{metric.name}</span>
              </div>
              <span className={cn("text-sm font-mono tabular-nums font-medium", metricConfig.color)}>
                {safeToFixed(metric.value, 2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
