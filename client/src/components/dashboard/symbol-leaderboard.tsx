import { cn } from "@/lib/utils";
import { Award, TrendingUp, TrendingDown } from "lucide-react";

interface SymbolPerformance {
  symbol: string;
  totalReturn: number;
  trades: number;
  winRate: number;
  avgHoldTime: string;
}

interface SymbolLeaderboardProps {
  winners: SymbolPerformance[];
  losers: SymbolPerformance[];
  className?: string;
}

export function SymbolLeaderboard({ winners, losers, className }: SymbolLeaderboardProps) {
  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-4 h-4 text-amber-400" />
        <span className="text-xs uppercase tracking-widest text-slate-400">
          Symbol Leaderboard
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1 mb-2">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Top Winners</span>
          </div>
          <div className="space-y-1">
            {winners.slice(0, 5).map((item, index) => (
              <div
                key={item.symbol}
                className="flex items-center justify-between p-2 bg-slate-800/30 rounded hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-3">{index + 1}</span>
                  <span className="font-mono text-xs font-semibold text-slate-200">
                    {item.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono tabular-nums text-green-400">
                    +{item.totalReturn.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-2">
            <TrendingDown className="w-3 h-3 text-red-400" />
            <span className="text-xs text-red-400 font-medium">Top Losers</span>
          </div>
          <div className="space-y-1">
            {losers.slice(0, 5).map((item, index) => (
              <div
                key={item.symbol}
                className="flex items-center justify-between p-2 bg-slate-800/30 rounded hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 w-3">{index + 1}</span>
                  <span className="font-mono text-xs font-semibold text-slate-200">
                    {item.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono tabular-nums text-red-400">
                    {item.totalReturn.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
