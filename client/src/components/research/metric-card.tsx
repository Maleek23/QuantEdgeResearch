/**
 * Reusable Research Metric Card Component
 * Professional, institutional-grade metric display with expandable research data
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import {
  ChevronDown,
  Activity,
  BarChart3,
  Target,
  FileText,
} from "lucide-react";

interface MetricCardProps {
  metric: any;
  index: number;
  colorScheme?: "cyan" | "blue" | "purple" | "amber" | "emerald";
}

export function MetricCard({ metric, index, colorScheme = "cyan" }: MetricCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasResearchData = metric.statisticalSignificance || metric.historicalContext ||
                          metric.backtestPerformance || metric.methodology;

  const colorClasses = {
    cyan: {
      badge: "border-cyan-500/30 text-cyan-400",
      value: "text-cyan-400",
      high: "text-emerald-400",
      medium: "text-cyan-400",
      low: "text-slate-400"
    },
    blue: {
      badge: "border-blue-500/30 text-blue-400",
      value: "text-blue-400",
      high: "text-emerald-400",
      medium: "text-blue-400",
      low: "text-slate-400"
    },
    purple: {
      badge: "border-purple-500/30 text-purple-400",
      value: "text-purple-400",
      high: "text-emerald-400",
      medium: "text-purple-400",
      low: "text-slate-400"
    },
    amber: {
      badge: "border-amber-500/30 text-amber-400",
      value: "text-amber-400",
      high: "text-emerald-400",
      medium: "text-amber-400",
      low: "text-slate-400"
    },
    emerald: {
      badge: "border-emerald-500/30 text-emerald-400",
      value: "text-emerald-400",
      high: "text-emerald-400",
      medium: "text-emerald-400",
      low: "text-slate-400"
    }
  };

  const colors = colorClasses[colorScheme];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden hover:border-slate-700 transition-colors"
    >
      {/* Metric Header */}
      <div
        className={cn(
          "p-4",
          hasResearchData && "cursor-pointer hover:bg-slate-800/30 transition-colors"
        )}
        onClick={() => hasResearchData && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="text-sm font-semibold text-slate-200">{metric.category}</h4>
              {metric.statisticalSignificance && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    metric.statisticalSignificance.confidence === 'HIGH' ? colors.high :
                    metric.statisticalSignificance.confidence === 'MEDIUM' ? colors.medium :
                    colors.low
                  )}
                >
                  {metric.statisticalSignificance.confidence}
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-3 mb-1">
              <span className={cn("text-base font-bold font-mono", colors.value)}>
                {metric.value}
              </span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">{metric.interpretation}</p>

            {/* Quick Stats */}
            {hasResearchData && (
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
                {metric.statisticalSignificance && (
                  <span>p={safeToFixed(metric.statisticalSignificance.pValue, 3)}</span>
                )}
                {metric.historicalContext && (
                  <span>P{metric.historicalContext.percentile}</span>
                )}
                {metric.backtestPerformance && (
                  <span>WR:{safeToFixed(safeNumber(metric.backtestPerformance.winRate) * 100, 0)}%</span>
                )}
              </div>
            )}
          </div>

          {hasResearchData && (
            <ChevronDown
              className={cn(
                "h-5 w-5 text-slate-500 transition-transform shrink-0",
                isExpanded && "rotate-180"
              )}
            />
          )}
        </div>
      </div>

      {/* Expanded Research Details */}
      {isExpanded && hasResearchData && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-slate-800 bg-slate-900/70"
        >
          <div className="p-4 space-y-4">
            {/* Statistical Significance */}
            {metric.statisticalSignificance && (
              <div>
                <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
                  <Activity className="h-3 w-3" />
                  Statistical Significance
                </h5>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">p-value</p>
                    <p className="text-sm font-mono font-semibold text-cyan-400">
                      {safeToFixed(metric.statisticalSignificance.pValue, 4)}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">z-score</p>
                    <p className="text-sm font-mono font-semibold text-cyan-400">
                      {safeToFixed(metric.statisticalSignificance.zScore, 2)}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">Confidence</p>
                    <p className="text-sm font-semibold text-cyan-400">
                      {metric.statisticalSignificance.confidence}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Historical Context */}
            {metric.historicalContext && (
              <div>
                <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
                  <BarChart3 className="h-3 w-3" />
                  Historical Context (1Y)
                </h5>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">Percentile</p>
                    <p className="text-sm font-mono font-semibold text-purple-400">
                      {metric.historicalContext.percentile}%
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">Mean</p>
                    <p className="text-sm font-mono font-semibold text-slate-300">
                      {safeToFixed(metric.historicalContext.mean, 1)}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">Std Dev</p>
                    <p className="text-sm font-mono font-semibold text-slate-300">
                      {safeToFixed(metric.historicalContext.stdDev, 1)}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">n</p>
                    <p className="text-sm font-mono font-semibold text-slate-300">
                      {metric.historicalContext.sampleSize}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Backtest Performance */}
            {metric.backtestPerformance && (
              <div>
                <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
                  <Target className="h-3 w-3" />
                  Backtest Performance
                </h5>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">Win Rate</p>
                    <p className={cn(
                      "text-sm font-mono font-semibold",
                      safeNumber(metric.backtestPerformance.winRate) >= 0.6 ? "text-emerald-400" :
                      safeNumber(metric.backtestPerformance.winRate) >= 0.5 ? "text-cyan-400" :
                      "text-red-400"
                    )}>
                      {safeToFixed(safeNumber(metric.backtestPerformance.winRate) * 100, 1)}%
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">Avg Return</p>
                    <p className={cn(
                      "text-sm font-mono font-semibold",
                      safeNumber(metric.backtestPerformance.avgReturn) >= 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {safeNumber(metric.backtestPerformance.avgReturn) >= 0 ? '+' : ''}
                      {safeToFixed(metric.backtestPerformance.avgReturn, 2)}%
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">Sharpe</p>
                    <p className={cn(
                      "text-sm font-mono font-semibold",
                      safeNumber(metric.backtestPerformance.sharpeRatio) >= 1 ? "text-emerald-400" :
                      safeNumber(metric.backtestPerformance.sharpeRatio) >= 0 ? "text-cyan-400" :
                      "text-red-400"
                    )}>
                      {safeToFixed(metric.backtestPerformance.sharpeRatio, 2)}
                    </p>
                  </div>
                  <div className="bg-slate-800/50 rounded p-2">
                    <p className="text-xs text-slate-500 mb-1">Signals</p>
                    <p className="text-sm font-mono font-semibold text-slate-300">
                      {metric.backtestPerformance.sampleSize}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Methodology */}
            {metric.methodology && (
              <div>
                <h5 className="text-xs font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  Methodology
                </h5>
                <div className="space-y-2">
                  {metric.methodology.formula && (
                    <div className="bg-slate-800/30 rounded p-2 border border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1">Formula</p>
                      <code className="text-xs font-mono text-cyan-300">
                        {metric.methodology.formula}
                      </code>
                    </div>
                  )}
                  {metric.methodology.period && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="text-slate-500">Period:</span>
                      <span className="font-mono text-cyan-400">{metric.methodology.period} days</span>
                    </div>
                  )}
                  {metric.methodology.citations && metric.methodology.citations.length > 0 && (
                    <div className="border-t border-slate-700/50 pt-2">
                      <p className="text-xs text-slate-500 mb-1">Citations:</p>
                      <ul className="text-xs text-slate-400 space-y-1">
                        {metric.methodology.citations.slice(0, 2).map((citation: string, i: number) => (
                          <li key={i} className="italic text-slate-500">• {citation}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
