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
        return <TrendingUp className="w-4 h-4 text-green-400" />;
      case "bearish":
        return <TrendingDown className="w-4 h-4 text-red-400" />;
      default:
        return <Minus className="w-4 h-4 text-amber-400" />;
    }
  };

  const getTrendColor = (trend: TrendDirection) => {
    switch (trend) {
      case "bullish":
        return "text-green-400";
      case "bearish":
        return "text-red-400";
      default:
        return "text-amber-400";
    }
  };

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <LineChart className="w-4 h-4 text-blue-400" />
        <span className="text-xs uppercase tracking-widest text-slate-400">
          Futures Bias
        </span>
      </div>

      <div className="space-y-3">
        {futures.map((future) => (
          <div
            key={future.symbol}
            className="bg-slate-800/40 rounded-lg p-3 hover:bg-slate-800/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-slate-200">
                  {future.symbol}
                </span>
                <span className="text-xs text-slate-400">{future.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {getTrendIcon(future.trend)}
                <span className={cn("text-xs font-medium uppercase", getTrendColor(future.trend))}>
                  {future.trend}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xl font-mono tabular-nums font-bold text-slate-100">
                {future.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  future.changePercent >= 0 ? "text-green-400" : "text-red-400"
                )}
              >
                {future.changePercent >= 0 ? "+" : ""}{safeToFixed(future.changePercent, 2)}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-700/20">
              <div className="text-center">
                <span className="text-[10px] text-slate-400 block">Pivot H</span>
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  {future.pivotHigh.toLocaleString()}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-slate-400 block">Pivot L</span>
                <span className="text-xs font-mono tabular-nums text-slate-300">
                  {future.pivotLow.toLocaleString()}
                </span>
              </div>
              <div className="text-center">
                <span className="text-[10px] text-slate-400 block">Tick Bias</span>
                <span
                  className={cn(
                    "text-xs font-mono tabular-nums",
                    future.tickBias > 0 ? "text-green-400" : future.tickBias < 0 ? "text-red-400" : "text-slate-300"
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
