import { cn, safeToFixed } from "@/lib/utils";
import { LineChart, TrendingUp, TrendingDown, Minus } from "lucide-react";

type TrendDirection = "bullish" | "bearish" | "neutral";

interface FuturesData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  trend: TrendDirection;
  pivotHigh: number;
  pivotLow: number;
  tickBias: number;
}

interface FuturesBiasPanelProps {
  futures: FuturesData[];
  className?: string;
}

export function FuturesBiasPanel({ futures, className }: FuturesBiasPanelProps) {
  const getTrendIcon = (trend: TrendDirection) => {
    switch (trend) {
      case "bullish":
        return <TrendingUp className="w-4 h-4 text-[var(--trade-bullish)]" />;
      case "bearish":
        return <TrendingDown className="w-4 h-4 text-[var(--trade-bearish)]" />;
      default:
        return <Minus className="w-4 h-4 text-[var(--trade-neutral)]" />;
    }
  };

  const getTrendColor = (trend: TrendDirection) => {
    switch (trend) {
      case "bullish":
        return "text-[var(--trade-bullish)]";
      case "bearish":
        return "text-[var(--trade-bearish)]";
      default:
        return "text-[var(--trade-neutral)]";
    }
  };

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <LineChart className="w-4 h-4 text-blue-400" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Futures Bias
        </span>
      </div>

      <div className="space-y-3">
        {futures.map((future) => (
          <div
            key={future.symbol}
            className="bg-muted/40 rounded-lg p-3 hover:bg-muted/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-foreground/90">
                  {future.symbol}
                </span>
                <span className="text-xs text-muted-foreground">{future.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {getTrendIcon(future.trend)}
                <span className={cn("text-xs font-medium uppercase", getTrendColor(future.trend))}>
                  {future.trend}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xl font-mono tabular-nums font-bold text-foreground/95">
                {future.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  future.changePercent >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                )}
              >
                {future.changePercent >= 0 ? "+" : ""}{safeToFixed(future.changePercent, 2)}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/20">
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground block">Pivot H</span>
                <span className="text-xs font-mono tabular-nums text-foreground/80">
                  {future.pivotHigh.toLocaleString()}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground block">Pivot L</span>
                <span className="text-xs font-mono tabular-nums text-foreground/80">
                  {future.pivotLow.toLocaleString()}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground block">Tick Bias</span>
                <span
                  className={cn(
                    "text-xs font-mono tabular-nums",
                    future.tickBias > 0 ? "text-[var(--trade-bullish)]" : future.tickBias < 0 ? "text-[var(--trade-bearish)]" : "text-foreground/80"
                  )}
                >
                  {future.tickBias > 0 ? "+" : ""}{future.tickBias}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
