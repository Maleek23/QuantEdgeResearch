import { cn } from "@/lib/utils";
import { Layers, TrendingUp, ExternalLink } from "lucide-react";

type ConvictionLevel = "high" | "medium" | "speculative";

interface ThematicStock {
  symbol: string;
  sector: string;
  entry: number;
  target: number;
  upside: number;
  conviction: ConvictionLevel;
  thesis: string;
}

interface ThematicInvestingTableProps {
  stocks: ThematicStock[];
  title?: string;
  onSymbolClick?: (symbol: string) => void;
  className?: string;
}

export function ThematicInvestingTable({
  stocks,
  title = "Thematic Investing",
  onSymbolClick,
  className,
}: ThematicInvestingTableProps) {
  const getConvictionBadge = (conviction: ConvictionLevel) => {
    switch (conviction) {
      case "high":
        return { label: "high", color: "text-green-400 bg-green-500/20" };
      case "medium":
        return { label: "medium", color: "text-amber-400 bg-amber-500/20" };
      case "speculative":
        return { label: "speculative", color: "text-purple-400 bg-purple-500/20" };
    }
  };

  const getSectorColor = (sector: string) => {
    const sectorColors: Record<string, string> = {
      "Quantum Computing": "bg-purple-500/20 text-purple-400",
      "Space": "bg-blue-500/20 text-blue-400",
      "Nuclear/Clean Energy": "bg-green-500/20 text-green-400",
      "AI/ML": "bg-cyan-500/20 text-cyan-400",
      "eVTOL/Flying Cars": "bg-amber-500/20 text-amber-400",
      "Crypto/Mining": "bg-orange-500/20 text-orange-400",
      "Healthcare/Telehealth": "bg-pink-500/20 text-pink-400",
      "Biotech/Synbio": "bg-emerald-500/20 text-emerald-400",
      "AI/Automation": "bg-indigo-500/20 text-indigo-400",
    };
    return sectorColors[sector] || "bg-slate-500/20 text-slate-400";
  };

  return (
    <div
      className={cn(
        "bg-slate-900/60 backdrop-blur-2xl border border-slate-700/30 rounded-lg p-4",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">{title}</span>
        </div>
        <span className="text-xs text-slate-400">{stocks.length} stocks</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/30">
              <th className="text-left text-xs text-slate-400 font-medium py-2 px-2">Symbol</th>
              <th className="text-left text-xs text-slate-400 font-medium py-2 px-2">Sector</th>
              <th className="text-right text-xs text-slate-400 font-medium py-2 px-2">Entry</th>
              <th className="text-right text-xs text-slate-400 font-medium py-2 px-2">Target</th>
              <th className="text-right text-xs text-slate-400 font-medium py-2 px-2">Upside</th>
              <th className="text-center text-xs text-slate-400 font-medium py-2 px-2">Conviction</th>
              <th className="text-left text-xs text-slate-400 font-medium py-2 px-2">Thesis</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock) => {
              const badge = getConvictionBadge(stock.conviction);
              return (
                <tr
                  key={stock.symbol}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                  onClick={() => onSymbolClick?.(stock.symbol)}
                >
                  <td className="py-3 px-2">
                    <span className="font-mono text-sm font-semibold text-cyan-400 hover:text-cyan-300">
                      {stock.symbol}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className={cn("text-xs px-2 py-1 rounded", getSectorColor(stock.sector))}>
                      {stock.sector}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <span className="font-mono text-sm tabular-nums text-slate-300">
                      ${stock.entry.toFixed(2)}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <span className="font-mono text-sm tabular-nums text-green-400">
                      ${stock.target.toFixed(0)}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right">
                    <span className="font-mono text-sm tabular-nums text-green-400">
                      +{stock.upside.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center">
                    <span className={cn("text-xs px-2 py-1 rounded", badge.color)}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-xs text-slate-400 line-clamp-1 max-w-[200px]">
                      {stock.thesis}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {stocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-500">
          <Layers className="w-8 h-8 mb-2 opacity-50" />
          <span className="text-sm">No thematic stocks</span>
        </div>
      )}
    </div>
  );
}
