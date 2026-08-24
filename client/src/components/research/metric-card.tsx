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
      high: "text-[var(--trade-bullish)]",
      medium: "text-cyan-400",
      low: "text-muted-foreground"
    },
    blue: {
      badge: "border-blue-500/30 text-blue-400",
      value: "text-blue-400",
      high: "text-[var(--trade-bullish)]",
      medium: "text-blue-400",
      low: "text-muted-foreground"
    },
    purple: {
      badge: "border-purple-500/30 text-purple-400",
      value: "text-purple-400",
      high: "text-[var(--trade-bullish)]",
      medium: "text-purple-400",
      low: "text-muted-foreground"
    },
    amber: {
      badge: "border-amber-500/30 text-[var(--trade-neutral)]",
      value: "text-[var(--trade-neutral)]",
      high: "text-[var(--trade-bullish)]",
      medium: "text-[var(--trade-neutral)]",
      low: "text-muted-foreground"
    },
    emerald: {
      badge: "border-emerald-500/30 text-[var(--trade-bullish)]",
      value: "text-[var(--trade-bullish)]",
      high: "text-[var(--trade-bullish)]",
      medium: "text-[var(--trade-bullish)]",
      low: "text-muted-foreground"
    }
  };

  const colors = colorClasses[colorScheme];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="bg-card/50 border border-border rounded-lg overflow-hidden hover:border-border transition-colors"
    >
      {/* Metric Header — Bloomberg compact */}
      <div
        className={cn(
          "p-3",
          hasResearchData && "cursor-pointer hover:bg-muted/20 transition-colors"
        )}
        onClick={() => hasResearchData && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <h4 className="text-xs font-semibold text-foreground/90">{metric.category}</h4>
              {metric.statisticalSignificance && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] px-1 py-0 font-mono",
                    metric.statisticalSignificance.confidence === 'HIGH' ? colors.high :
                    metric.statisticalSignificance.confidence === 'MEDIUM' ? colors.medium :
                    colors.low
                  )}
                >
                  {metric.statisticalSignificance.confidence}
                </Badge>
              )}
            </div>

            <div className="flex items-baseline gap-2 mb-0.5">
              <span className={cn("text-sm font-bold font-mono tabular-nums", colors.value)}>
                {metric.value}
              </span>
            </div>

            <p className="text-[10px] text-muted-foreground leading-snug">{metric.interpretation}</p>

            {/* Quick Stats — data-strip inline */}
            {hasResearchData && (
              <div className="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground/60 font-mono tabular-nums">
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
                "h-4 w-4 text-muted-foreground/60 transition-transform shrink-0",
                isExpanded && "rotate-180"
              )}
            />
          )}
        </div>
      </div>

      {/* Expanded Research Details — metric-block density */}
      {isExpanded && hasResearchData && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-border bg-card/70"
        >
          <div className="p-3 space-y-3">
            {/* Statistical Significance */}
            {metric.statisticalSignificance && (
              <div>
                <h5 className="section-chrome">
                  <span className="section-label flex items-center gap-1">
                    <Activity className="h-2.5 w-2.5" />
                    Statistical Significance
                  </span>
                </h5>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="metric-block">
                    <span className="metric-label">p-value</span>
                    <span className="metric-value text-cyan-400">
                      {safeToFixed(metric.statisticalSignificance.pValue, 4)}
                    </span>
                  </div>
                  <div className="metric-block">
                    <span className="metric-label">z-score</span>
                    <span className="metric-value text-cyan-400">
                      {safeToFixed(metric.statisticalSignificance.zScore, 2)}
                    </span>
                  </div>
                  <div className="metric-block">
                    <span className="metric-label">Confidence</span>
                    <span className="metric-value text-cyan-400">
                      {metric.statisticalSignificance.confidence}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Historical Context */}
            {metric.historicalContext && (
              <div>
                <h5 className="section-chrome">
                  <span className="section-label flex items-center gap-1">
                    <BarChart3 className="h-2.5 w-2.5" />
                    Historical Context (1Y)
                  </span>
                </h5>
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="metric-block">
                    <span className="metric-label">Percentile</span>
                    <span className="metric-value text-purple-400">
                      {metric.historicalContext.percentile}%
                    </span>
                  </div>
                  <div className="metric-block">
                    <span className="metric-label">Mean</span>
                    <span className="metric-value">
                      {safeToFixed(metric.historicalContext.mean, 1)}
                    </span>
                  </div>
                  <div className="metric-block">
                    <span className="metric-label">Std Dev</span>
                    <span className="metric-value">
                      {safeToFixed(metric.historicalContext.stdDev, 1)}
                    </span>
                  </div>
                  <div className="metric-block">
                    <span className="metric-label">n</span>
                    <span className="metric-value">
                      {metric.historicalContext.sampleSize}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Backtest Performance */}
            {metric.backtestPerformance && (
              <div>
                <h5 className="section-chrome">
                  <span className="section-label flex items-center gap-1">
                    <Target className="h-2.5 w-2.5" />
                    Backtest Performance
                  </span>
                </h5>
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="metric-block">
                    <span className="metric-label">Win Rate</span>
                    <span className={cn(
                      "metric-value",
                      safeNumber(metric.backtestPerformance.winRate) >= 0.6 ? "text-[var(--trade-bullish)]" :
                      safeNumber(metric.backtestPerformance.winRate) >= 0.5 ? "text-cyan-400" :
                      "text-[var(--trade-bearish)]"
                    )}>
                      {safeToFixed(safeNumber(metric.backtestPerformance.winRate) * 100, 1)}%
                    </span>
                  </div>
                  <div className="metric-block">
                    <span className="metric-label">Avg Return</span>
                    <span className={cn(
                      "metric-value",
                      safeNumber(metric.backtestPerformance.avgReturn) >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                    )}>
                      {safeNumber(metric.backtestPerformance.avgReturn) >= 0 ? '+' : ''}
                      {safeToFixed(metric.backtestPerformance.avgReturn, 2)}%
                    </span>
                  </div>
                  <div className="metric-block">
                    <span className="metric-label">Sharpe</span>
                    <span className={cn(
                      "metric-value",
                      safeNumber(metric.backtestPerformance.sharpeRatio) >= 1 ? "text-[var(--trade-bullish)]" :
                      safeNumber(metric.backtestPerformance.sharpeRatio) >= 0 ? "text-cyan-400" :
                      "text-[var(--trade-bearish)]"
                    )}>
                      {safeToFixed(metric.backtestPerformance.sharpeRatio, 2)}
                    </span>
                  </div>
                  <div className="metric-block">
                    <span className="metric-label">Signals</span>
                    <span className="metric-value">
                      {metric.backtestPerformance.sampleSize}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Methodology */}
            {metric.methodology && (
              <div>
                <h5 className="section-chrome">
                  <span className="section-label flex items-center gap-1">
                    <FileText className="h-2.5 w-2.5" />
                    Methodology
                  </span>
                </h5>
                <div className="space-y-1.5">
                  {metric.methodology.formula && (
                    <div className="inset-panel">
                      <p className="text-[8px] text-muted-foreground font-mono uppercase tracking-wider mb-0.5">Formula</p>
                      <code className="text-[10px] font-mono text-cyan-300">
                        {metric.methodology.formula}
                      </code>
                    </div>
                  )}
                  {metric.methodology.period && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>Period:</span>
                      <span className="font-mono tabular-nums text-cyan-400">{metric.methodology.period}d</span>
                    </div>
                  )}
                  {metric.methodology.citations && metric.methodology.citations.length > 0 && (
                    <div className="border-t border-border/30 pt-1.5">
                      <ul className="text-[9px] text-muted-foreground/70 space-y-0.5">
                        {metric.methodology.citations.slice(0, 2).map((citation: string, i: number) => (
                          <li key={i} className="italic">• {citation}</li>
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
