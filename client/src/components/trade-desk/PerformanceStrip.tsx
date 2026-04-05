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
      <div className="px-3 py-4 border-t border-slate-800/40">
        <span className="text-xs text-slate-600">No resolved trades yet — performance will show here</span>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800/40">
      {/* Stats row */}
      <div className="px-3 py-3 flex items-center gap-4 text-xs">
        <div>
          <span className="text-slate-500">Win Rate </span>
          <span className={cn(
            "font-bold font-mono",
            winRate >= 55 ? "text-emerald-400" : winRate >= 45 ? "text-amber-400" : "text-red-400"
          )}>
            {winRate}%
          </span>
        </div>
        <span className="text-slate-800">|</span>
        <div>
          <span className="text-slate-500">PF </span>
          <span className={cn(
            "font-bold font-mono",
            profitFactor >= 1.5 ? "text-emerald-400" : profitFactor >= 1 ? "text-amber-400" : "text-red-400"
          )}>
            {profitFactor}
          </span>
        </div>
        <span className="text-slate-800">|</span>
        <div className="text-slate-500">
          <span className="text-emerald-400 font-mono">{wins}W</span>
          {' / '}
          <span className="text-red-400 font-mono">{losses}L</span>
          <span className="text-slate-600"> ({totalTrades})</span>
        </div>
        <span className="text-slate-800">|</span>
        <div className="text-slate-500">
          Avg <span className="text-emerald-400 font-mono">+{avgWinPct}%</span>
          {' / '}
          <span className="text-red-400 font-mono">{avgLossPct}%</span>
        </div>
      </div>

      {/* Recent closed */}
      {closedTrades.length > 0 && (
        <div className="px-3 pb-3">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">Recent Closed</span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {closedTrades.slice(0, 8).map((trade) => {
              const isWin = (trade as any).outcomeStatus === 'hit_target';
              const pct = (trade as any).percentGain;
              return (
                <span
                  key={trade.id}
                  className={cn(
                    "text-[11px] font-mono px-1.5 py-0.5 rounded",
                    isWin ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}
                >
                  {isWin ? '+' : ''}{pct ? `${pct > 0 ? '+' : ''}${Number(pct).toFixed(0)}%` : ''} {trade.symbol}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
