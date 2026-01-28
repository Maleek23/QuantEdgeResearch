import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStockContext } from "@/contexts/stock-context";
import {
  LineChart,
  Activity,
  Briefcase,
  Sparkles,
  Newspaper,
  X,
  TrendingUp,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StockContextBarProps {
  className?: string;
}

export function StockContextBar({ className }: StockContextBarProps) {
  const { currentStock, clearStock } = useStockContext();

  if (!currentStock) return null;

  const changeColor = currentStock.change && currentStock.change >= 0 ? "text-green-400" : "text-red-400";
  const changeSign = currentStock.change && currentStock.change >= 0 ? "+" : "";

  return (
    <div className={cn(
      "sticky top-14 z-40 w-full bg-gradient-to-r from-slate-900/95 to-slate-800/95 backdrop-blur-xl border-b border-cyan-500/20",
      className
    )}>
      <div className="max-w-[1600px] mx-auto px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Stock Info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">{currentStock.symbol}</span>
              {currentStock.name && (
                <span className="text-sm text-slate-400 hidden sm:inline">
                  {currentStock.name}
                </span>
              )}
            </div>

            {currentStock.price && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white font-medium">
                  ${currentStock.price.toFixed(2)}
                </span>
                {currentStock.change && (
                  <span className={cn("font-medium", changeColor)}>
                    {changeSign}{currentStock.change.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Quick Access Buttons */}
          <div className="flex items-center gap-2">
            <Link href={`/chart-analysis?symbol=${currentStock.symbol}`}>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-slate-300 hover:text-cyan-400 hover:bg-cyan-500/10"
              >
                <LineChart className="w-4 h-4" />
                <span className="hidden md:inline">Chart</span>
              </Button>
            </Link>

            <Link href={`/options-analyzer?symbol=${currentStock.symbol}`}>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-slate-300 hover:text-cyan-400 hover:bg-cyan-500/10"
              >
                <Activity className="w-4 h-4" />
                <span className="hidden md:inline">Options</span>
              </Button>
            </Link>

            <Link href={`/smart-money?symbol=${currentStock.symbol}`}>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-slate-300 hover:text-cyan-400 hover:bg-cyan-500/10"
              >
                <Briefcase className="w-4 h-4" />
                <span className="hidden md:inline">Flow</span>
              </Button>
            </Link>

            <Link href={`/trade-desk/best-setups?symbol=${currentStock.symbol}`}>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-slate-300 hover:text-cyan-400 hover:bg-cyan-500/10"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden md:inline">AI Analysis</span>
              </Button>
            </Link>

            <div className="w-px h-6 bg-slate-700 mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={clearStock}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
