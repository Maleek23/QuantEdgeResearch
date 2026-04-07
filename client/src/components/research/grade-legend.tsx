/**
 * Grade Legend Component
 * Explains the grading system clearly
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Info, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface GradeLegendProps {
  className?: string;
}

export function GradeLegend({ className }: GradeLegendProps) {
  const grades = [
    {
      grade: "S",
      range: "90-100",
      label: "Exceptional",
      description: "All signals aligned, very high conviction",
      color: "text-purple-400 border-purple-500/30 bg-purple-500/10",
      examples: "NVDA, MSFT when firing on all cylinders"
    },
    {
      grade: "A",
      range: "80-89",
      label: "Strong Buy",
      description: "Excellent fundamentals + technicals, minor weaknesses",
      color: "text-[var(--trade-bullish)] border-emerald-500/30 bg-emerald-500/10",
      examples: "Quality stocks in uptrends"
    },
    {
      grade: "B",
      range: "70-79",
      label: "Good",
      description: "Solid opportunity with acceptable risk/reward",
      color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
      examples: "Moderate conviction trades"
    },
    {
      grade: "C",
      range: "60-69",
      label: "Neutral",
      description: "Mixed signals - requires additional confirmation",
      color: "text-[var(--trade-neutral)] border-amber-500/30 bg-amber-500/10",
      examples: "Wait for better setup"
    },
    {
      grade: "D",
      range: "50-59",
      label: "Weak",
      description: "Significant concerns, avoid or short candidate",
      color: "text-orange-400 border-orange-500/30 bg-orange-500/10",
      examples: "Deteriorating fundamentals"
    },
    {
      grade: "F",
      range: "0-49",
      label: "Avoid",
      description: "Multiple red flags, high risk of loss",
      color: "text-[var(--trade-bearish)] border-red-500/30 bg-red-500/10",
      examples: "Bearish on all fronts"
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Card className="p-4 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-cyan-500/20">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-cyan-500/20">
            <Info className="h-5 w-5 text-cyan-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground/95 mb-1">
              How Grading Works
            </h3>
            <p className="text-sm text-muted-foreground">
              Overall grade = weighted average of 7 analysis engines. Each component contributes based on its portfolio weight.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {grades.map((item, idx) => (
            <motion.div
              key={item.grade}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05, duration: 0.2 }}
              className="group relative"
            >
              <div className="bg-card/50 border border-border rounded-lg p-3 hover:bg-muted/30 hover:border-cyan-500/30 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className={cn("text-lg font-bold px-3 py-1", item.color)}>
                    {item.grade}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">{item.range}</span>
                </div>

                <p className="text-sm font-semibold text-foreground/90 mb-1">{item.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{item.description}</p>

                <div className="flex items-start gap-1.5 text-xs text-muted-foreground/70 italic">
                  <span className="shrink-0">e.g.</span>
                  <span>{item.examples}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-border flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--trade-bullish)] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground/80">Pro Tip:</span> Focus on A/B grades for high-probability setups.
              C grades need confirmation. D/F grades are either avoid or short candidates depending on your strategy.
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-[var(--trade-neutral)] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Grades update in real-time as market conditions change. A stock rated A today may drop to C tomorrow if technical setup breaks.
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
