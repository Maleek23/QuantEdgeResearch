/**
 * Performance Strip
 * =================
 * Win rate, profit factor, and recent closed trades.
 * Always visible below the signal list.
 */

import { cn } from "@/lib/utils";
import type { TradeIdea } from "@shared/schema";
import type { PerformanceData } from "./useTradeDeskData";

interface Props {
  performance: PerformanceData;
  closedTrades: TradeIdea[];
}

export default function PerformanceStrip({ performance, closedTrades }: Props) {
  const { winRate, profitFactor, totalTrades, wins, losses, avgWinPct, avgLossPct } = performance;

  if (totalTrades === 0) {
    return (
      <div className="px-3 py-4 border-t border-border/40">
        <span className="text-xs text-muted-foreground/70">No resolved trades yet — performance will show here</span>
      </div>
    );
  }

  return (
    <div className="border-t border-border/40">
      {/* Stats row — data-strip style */}
      <div className="data-strip mx-2 my-2">
        <div className="data-strip-item">
          <span className="data-strip-label">WR</span>
          <span className={cn(
            "data-strip-value",
            winRate >= 55 ? "text-[var(--trade-bullish)]" : winRate >= 45 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bearish)]"
          )}>
            {winRate}%
          </span>
        </div>
        <div className="data-strip-item">
          <span className="data-strip-label">PF</span>
          <span className={cn(
            "data-strip-value",
            profitFactor >= 1.5 ? "text-[var(--trade-bullish)]" : profitFactor >= 1 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bearish)]"
          )}>
            {profitFactor}
          </span>
        </div>
        <div className="data-strip-item">
          <span className="text-[var(--trade-bullish)] font-mono font-semibold text-data-xs">{wins}W</span>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-[var(--trade-bearish)] font-mono font-semibold text-data-xs">{losses}L</span>
        </div>
        <div className="data-strip-item">
          <span className="data-strip-label">Avg</span>
          <span className="text-[var(--trade-bullish)] font-mono font-semibold text-data-xs">+{avgWinPct}%</span>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-[var(--trade-bearish)] font-mono font-semibold text-data-xs">{avgLossPct}%</span>
        </div>
      </div>

      {/* Recent closed — compact chips */}
      {closedTrades.length > 0 && (
        <div className="px-2 pb-2">
          <span className="text-[8px] text-muted-foreground/60 uppercase tracking-[0.1em] font-mono">Recent</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {closedTrades.slice(0, 8).map((trade) => {
              const isWin = (trade as any).outcomeStatus === 'hit_target';
              const pct = (trade as any).percentGain;
              return (
                <span
                  key={trade.id}
                  className={cn(
                    "text-[10px] font-mono tabular-nums px-1 py-0 rounded",
                    isWin ? "bg-emerald-500/10 text-[var(--trade-bullish)]" : "bg-red-500/10 text-[var(--trade-bearish)]"
                  )}
                >
                  {pct ? `${pct > 0 ? '+' : ''}${Number(pct).toFixed(0)}%` : ''} {trade.symbol}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
