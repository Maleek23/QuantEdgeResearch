import { cn, safeToFixed } from "@/lib/utils";
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
        "bg-card/60 backdrop-blur-2xl border border-border/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-4 h-4 text-[var(--trade-neutral)]" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Symbol Leaderboard
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1 mb-2">
            <TrendingUp className="w-3 h-3 text-[var(--trade-bullish)]" />
            <span className="text-xs text-[var(--trade-bullish)] font-medium">Top Winners</span>
          </div>
          <div className="space-y-1">
            {winners.slice(0, 5).map((item, index) => (
              <div
                key={item.symbol}
                className="flex items-center justify-between p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-3">{index + 1}</span>
                  <span className="font-mono text-xs font-semibold text-foreground/90">
                    {item.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono tabular-nums text-[var(--trade-bullish)]">
                    +{safeToFixed(item.totalReturn, 1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-2">
            <TrendingDown className="w-3 h-3 text-[var(--trade-bearish)]" />
            <span className="text-xs text-[var(--trade-bearish)] font-medium">Top Losers</span>
          </div>
          <div className="space-y-1">
            {losers.slice(0, 5).map((item, index) => (
              <div
                key={item.symbol}
                className="flex items-center justify-between p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-3">{index + 1}</span>
                  <span className="font-mono text-xs font-semibold text-foreground/90">
                    {item.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono tabular-nums text-[var(--trade-bearish)]">
                    {safeToFixed(item.totalReturn, 1)}%
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
