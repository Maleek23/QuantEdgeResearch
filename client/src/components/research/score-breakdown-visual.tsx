/**
 * Visual Score Breakdown
 * Progress bars with hover details instead of text-heavy displays
 */

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  DollarSign,
  Brain,
  Newspaper,
  TrendingUp,
  Users,
  Calendar
} from "lucide-react";

interface ScoreBreakdownItem {
  name: string;
  score: number;
  grade: string;
  weight: number;
  icon: React.ElementType;
  description?: string;
  colorScheme: 'cyan' | 'blue' | 'purple' | 'emerald' | 'amber' | 'orange';
}

interface ScoreBreakdownVisualProps {
  items: ScoreBreakdownItem[];
  className?: string;
}

export function ScoreBreakdownVisual({ items, className }: ScoreBreakdownVisualProps) {
  const getBarColor = (score: number) => {
    if (score >= 90) return 'bg-purple-500';
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 70) return 'bg-cyan-500';
    if (score >= 60) return 'bg-amber-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('S')) return 'text-purple-400';
    if (grade.startsWith('A')) return 'text-emerald-400';
    if (grade.startsWith('B')) return 'text-cyan-400';
    if (grade.startsWith('C')) return 'text-amber-400';
    if (grade.startsWith('D')) return 'text-orange-400';
    return 'text-red-400';
  };

  const getIconColor = (colorScheme: string) => {
    const colors = {
      cyan: 'text-cyan-400',
      blue: 'text-blue-400',
      purple: 'text-purple-400',
      emerald: 'text-emerald-400',
      amber: 'text-amber-400',
      orange: 'text-orange-400'
    };
    return colors[colorScheme as keyof typeof colors] || 'text-slate-400';
  };

  return (
    <Card className={cn("p-6 bg-slate-900/90 border-slate-800", className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-100">Analysis Component Breakdown</h3>
        <p className="text-xs text-slate-500">Hover for details</p>
      </div>

      <div className="space-y-4">
        {items.map((item, idx) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="group relative"
          >
            <div className="flex items-center gap-3 mb-2">
              {/* Icon */}
              <div className={cn("shrink-0 p-1.5 rounded-lg bg-slate-800/50", `group-hover:bg-${item.colorScheme}-500/10`)}>
                <item.icon className={cn("h-4 w-4", getIconColor(item.colorScheme))} />
              </div>

              {/* Name */}
              <div className="flex-1 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300 group-hover:text-slate-100 transition-colors">
                  {item.name}
                </span>
                <div className="flex items-center gap-3">
                  <span className={cn("text-sm font-bold font-mono", getGradeColor(item.grade))}>
                    {item.grade}
                  </span>
                  <span className="text-xs text-slate-500 font-mono w-12 text-right">
                    {item.score}/100
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${item.score}%` }}
                transition={{ duration: 1, delay: idx * 0.1, ease: "easeOut" }}
                className={cn(
                  "h-2.5 rounded-full relative",
                  getBarColor(item.score)
                )}
              >
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              </motion.div>

              {/* Weight indicator */}
              <div
                className="absolute top-0 bottom-0 border-r-2 border-dashed border-slate-600"
                style={{ left: `${item.weight * 100}%` }}
              />
            </div>

            {/* Hover tooltip */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute left-0 right-0 top-full mt-2 z-10 pointer-events-none">
              <div className="bg-slate-950 border border-slate-700 rounded-lg p-3 shadow-xl">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-300 mb-1">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-slate-500">{item.description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={cn("text-lg font-bold", getGradeColor(item.grade))}>{item.grade}</p>
                    <p className="text-xs text-slate-500">{item.score}/100</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-400">
                    Weight: <span className="text-cyan-400 font-mono">{(item.weight * 100).toFixed(0)}%</span>
                  </span>
                  <span className="text-slate-400">
                    Contribution: <span className="text-purple-400 font-mono">{(item.score * item.weight).toFixed(1)}</span>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Bar length = Score (0-100)</span>
          <span>Dashed line = Portfolio weight</span>
        </div>
      </div>
    </Card>
  );
}

// Default icon mapping
export const COMPONENT_ICONS = {
  technical: BarChart3,
  fundamental: DollarSign,
  quantitative: TrendingUp,
  ml: Brain,
  sentiment: Newspaper,
  orderFlow: Users,
  catalysts: Calendar,
};
