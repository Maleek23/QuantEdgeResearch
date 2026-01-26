/**
 * Similar Stocks Panel
 * Shows comparable stocks with quick comparison
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, ArrowRight, Plus } from "lucide-react";
import { motion } from "framer-motion";

interface SimilarStock {
  symbol: string;
  name: string;
  grade: string;
  score: number;
  price: number;
  change: number;
  changePercent: number;
  sector: string;
  marketCap: string;
}

interface SimilarStocksPanelProps {
  stocks: SimilarStock[];
  className?: string;
  onCompare?: (symbols: string[]) => void;
}

export function SimilarStocksPanel({ stocks, className, onCompare }: SimilarStocksPanelProps) {
  const getGradeColor = (grade: string) => {
    if (grade.startsWith('S')) return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
    if (grade.startsWith('A')) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (grade.startsWith('B')) return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10';
    if (grade.startsWith('C')) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    if (grade.startsWith('D')) return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
    return 'text-red-400 border-red-500/30 bg-red-500/10';
  };

  return (
    <Card className={cn("p-6 bg-slate-900/90 border-slate-800", className)}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Similar Stocks</h3>
          <p className="text-xs text-slate-500 mt-1">Based on sector, market cap, and metrics</p>
        </div>
        {onCompare && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCompare(stocks.map(s => s.symbol))}
            className="gap-2"
          >
            <ArrowRight className="h-4 w-4" />
            Compare All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stocks.map((stock, idx) => {
          const isPositive = stock.changePercent >= 0;

          return (
            <motion.div
              key={stock.symbol}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 border-slate-700 hover:border-cyan-500/30 transition-all cursor-pointer group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-lg font-bold text-slate-100 group-hover:text-cyan-400 transition-colors">
                        {stock.symbol}
                      </h4>
                      <Badge
                        variant="outline"
                        className={cn("text-xs font-bold", getGradeColor(stock.grade))}
                      >
                        {stock.grade}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{stock.name}</p>
                  </div>
                  <button
                    className="shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500/20 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompare && onCompare([stock.symbol]);
                    }}
                  >
                    <Plus className="h-4 w-4 text-slate-400 hover:text-cyan-400" />
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Price */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold font-mono text-slate-100">
                      ${stock.price.toFixed(2)}
                    </span>
                    <div className={cn(
                      "flex items-center gap-1 text-sm font-semibold",
                      isPositive ? "text-emerald-400" : "text-red-400"
                    )}>
                      {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      <span>{isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%</span>
                    </div>
                  </div>

                  {/* Score Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Score</span>
                      <span className="font-mono text-cyan-400">{stock.score}/100</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${stock.score}%` }}
                        transition={{ duration: 1, delay: idx * 0.1 }}
                        className={cn(
                          "h-1.5 rounded-full",
                          stock.score >= 80 ? "bg-emerald-500" :
                          stock.score >= 70 ? "bg-cyan-500" :
                          stock.score >= 60 ? "bg-amber-500" : "bg-red-500"
                        )}
                      />
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-800">
                    <span>{stock.sector}</span>
                    <span>{stock.marketCap}</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {stocks.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400 mb-2">No similar stocks found</p>
          <p className="text-xs text-slate-600">Try a different symbol or sector</p>
        </div>
      )}
    </Card>
  );
}
