import { cn, safeToFixed } from "@/lib/utils";
import { Grid3X3 } from "lucide-react";

interface CorrelationMatrixProps {
  assets: string[];
  correlations: number[][];
  className?: string;
}

export function CorrelationMatrix({ assets, correlations, className }: CorrelationMatrixProps) {
  const getCorrelationColor = (value: number) => {
    if (value >= 0.8) return "bg-[var(--trade-bullish)]/80 text-white";
    if (value >= 0.6) return "bg-[var(--trade-bullish)]/50 text-[var(--trade-bullish)]";
    if (value >= 0.3) return "bg-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]";
    if (value > -0.3) return "bg-muted/40 text-foreground/80";
    if (value > -0.6) return "bg-red-500/30 text-red-200";
    if (value > -0.8) return "bg-red-500/50 text-red-100";
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
        <Grid3X3 className="w-4 h-4 text-purple-400" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Correlation Matrix
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="p-1" />
              {assets.map((asset) => (
                <th
                  key={asset}
                  className="p-1 text-[10px] font-mono text-muted-foreground text-center"
                >
                  {asset}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((rowAsset, rowIndex) => (
              <tr key={rowAsset}>
                <td className="p-1 text-[10px] font-mono text-muted-foreground text-right pr-2">
                  {rowAsset}
                </td>
                {assets.map((colAsset, colIndex) => {
                  const value = correlations[rowIndex]?.[colIndex] ?? 0;
                  const isDiagonal = rowIndex === colIndex;
                  return (
                    <td key={colAsset} className="p-0.5">
                      <div
                        className={cn(
                          "w-full h-7 flex items-center justify-center rounded text-[10px] font-mono tabular-nums",
                          isDiagonal
                            ? "bg-cyan-500/20 text-cyan-400"
                            : getCorrelationColor(value)
                        )}
                        title={`${rowAsset} vs ${colAsset}: ${safeToFixed(value, 2)}`}
                      >
                        {isDiagonal ? "1.00" : safeToFixed(value, 2)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-1 mt-4 pt-3 border-t border-border/20">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500/80" />
          <span className="text-[10px] text-muted-foreground">-1</span>
        </div>
        <div className="flex-1 h-2 rounded bg-gradient-to-r from-red-500/80 via-slate-700/40 to-green-500/80" />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">+1</span>
          <div className="w-3 h-3 rounded bg-[var(--trade-bullish)]/80" />
        </div>
      </div>
    </div>
  );
}
