import { cn, safeToFixed } from "@/lib/utils";
import { Zap, TrendingUp, TrendingDown } from "lucide-react";

interface VolatilitySnapshotProps {
  vix: number;
  vixChange: number;
  vvix: number;
  realizedVol: number;
  impliedVol: number;
  className?: string;
}

export function VolatilitySnapshot({
  vix,
  vixChange,
  vvix,
  realizedVol,
  impliedVol,
  className,
}: VolatilitySnapshotProps) {
  const volSpread = impliedVol - realizedVol;
  const isVolExpensive = volSpread > 3;

  return (
    <div
      className={cn(
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4 text-purple-400" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Volatility Snapshot
        </span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <span className="text-4xl font-bold font-mono tabular-nums">
            {safeToFixed(vix, 2)}
          </span>
          <span className="text-xs text-muted-foreground">VIX Index</span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded",
            vixChange >= 0 ? "bg-red-500/10 text-[var(--trade-bearish)]" : "bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)]"
          )}
        >
          {vixChange >= 0 ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          <span className="font-mono text-sm tabular-nums">
            {vixChange >= 0 ? "+" : ""}{safeToFixed(vixChange, 2)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/40 rounded-lg p-3">
          <span className="text-xs text-muted-foreground block mb-1">VVIX</span>
          <span className="text-lg font-mono tabular-nums font-semibold text-foreground/90">
            {safeToFixed(vvix, 1, '0.0')}
          </span>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <span className="text-xs text-muted-foreground block mb-1">Realized</span>
          <span className="text-lg font-mono tabular-nums font-semibold text-blue-400">
            {safeToFixed(realizedVol, 1, '0.0')}%
          </span>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <span className="text-xs text-muted-foreground block mb-1">Implied</span>
          <span className="text-lg font-mono tabular-nums font-semibold text-purple-400">
            {safeToFixed(impliedVol, 1, '0.0')}%
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border/30">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">IV/RV Spread</span>
          <span
            className={cn(
              "font-mono text-sm tabular-nums font-medium",
              isVolExpensive ? "text-[var(--trade-neutral)]" : "text-foreground/80"
            )}
          >
            {volSpread >= 0 ? "+" : ""}{safeToFixed(volSpread, 1, '0.0')}%
            {isVolExpensive && " (expensive)"}
          </span>
        </div>
      </div>
    </div>
  );
}
