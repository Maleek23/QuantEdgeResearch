import { cn, safeToFixed } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

interface IndexData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

interface IndexHeatmapProps {
  indices: IndexData[];
  className?: string;
}

export function IndexHeatmap({ indices, className }: IndexHeatmapProps) {
  const getHeatColor = (change: number) => {
    if (change >= 2) return "bg-[var(--trade-bullish)]/80 text-white";
    if (change >= 1) return "bg-[var(--trade-bullish)]/60 text-white";
    if (change >= 0.5) return "bg-[var(--trade-bullish)]/40 text-white";
    if (change >= 0) return "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]";
    if (change >= -0.5) return "bg-red-500/20 text-[var(--trade-bearish)]";
    if (change >= -1) return "bg-red-500/40 text-white";
    if (change >= -2) return "bg-red-500/60 text-white";
    return "bg-red-500/80 text-white";
  };

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-cyan-400" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Index Heatmap
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {indices.map((index) => (
          <div
            key={index.symbol}
            className={cn(
              "rounded-lg p-3 transition-all duration-300 hover:scale-[1.02]",
              getHeatColor(index.changePercent)
            )}
          >
            <div className="flex flex-col">
              <span className="text-xs font-medium opacity-80">{index.symbol}</span>
              <span className="text-lg font-mono tabular-nums font-bold">
                {index.price >= 1000 ? index.price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : safeToFixed(index.price, 2)}
              </span>
              <span className="text-xs font-mono tabular-nums">
                {index.changePercent >= 0 ? "+" : ""}{safeToFixed(index.changePercent, 2)}%
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-1 mt-4 pt-3 border-t border-border/20">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500/80" />
          <span className="text-[10px] text-muted-foreground">-2%</span>
        </div>
        <div className="flex-1 h-2 rounded bg-gradient-to-r from-red-500/80 via-slate-700/40 to-green-500/80" />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">+2%</span>
          <div className="w-3 h-3 rounded bg-[var(--trade-bullish)]/80" />
        </div>
      </div>
    </div>
  );
}
