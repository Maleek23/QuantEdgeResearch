/**
 * Analysis Section Component
 * Standardized container for different analysis categories
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, safeToFixed } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface AnalysisSectionProps {
  title: string;
  icon: LucideIcon;
  grade?: string;
  score?: number;
  weight?: number;
  colorScheme?: "cyan" | "blue" | "purple" | "amber" | "emerald";
  children: React.ReactNode;
  metricCount?: number;
}

export function AnalysisSection({
  title,
  icon: Icon,
  grade,
  score,
  weight,
  colorScheme = "cyan",
  children,
  metricCount,
}: AnalysisSectionProps) {
  const colorClasses = {
    cyan: {
      border: "border-cyan-500/20",
      gradient: "from-cyan-900/10",
      icon: "text-cyan-400",
      badge: "text-cyan-400 border-cyan-500/30",
      score: "text-cyan-400"
    },
    blue: {
      border: "border-blue-500/20",
      gradient: "from-blue-900/10",
      icon: "text-blue-400",
      badge: "text-blue-400 border-blue-500/30",
      score: "text-blue-400"
    },
    purple: {
      border: "border-purple-500/20",
      gradient: "from-purple-900/10",
      icon: "text-purple-400",
      badge: "text-purple-400 border-purple-500/30",
      score: "text-purple-400"
    },
    amber: {
      border: "border-amber-500/20",
      gradient: "from-amber-900/10",
      icon: "text-amber-400",
      badge: "text-amber-400 border-amber-500/30",
      score: "text-amber-400"
    },
    emerald: {
      border: "border-emerald-500/20",
      gradient: "from-emerald-900/10",
      icon: "text-emerald-400",
      badge: "text-emerald-400 border-emerald-500/30",
      score: "text-emerald-400"
    }
  };

  const colors = colorClasses[colorScheme];

  // Get grade badge color
  const getGradeBadgeColor = (g: string) => {
    if (g.startsWith('S')) return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
    if (g.startsWith('A')) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (g.startsWith('B')) return 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10';
    if (g.startsWith('C')) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    if (g.startsWith('D')) return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
    return 'text-red-400 border-red-500/30 bg-red-500/10';
  };

  return (
    <Card className={cn(
      "p-6 bg-gradient-to-br from-slate-900/90 to-slate-800/50",
      colors.border
    )}>
      {/* Section Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-slate-800/50")}>
            <Icon className={cn("h-5 w-5", colors.icon)} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-100">{title}</h3>
            {metricCount !== undefined && (
              <p className="text-xs text-slate-500 mt-1">
                {metricCount} metrics
                {weight !== undefined && ` • ${safeToFixed(weight * 100, 0)}% portfolio weight`}
              </p>
            )}
          </div>
        </div>

        {/* Score Display */}
        {(grade || score !== undefined) && (
          <div className="text-right">
            {grade && (
              <Badge variant="outline" className={cn("font-bold text-lg px-3 py-1 mb-1", getGradeBadgeColor(grade))}>
                {grade}
              </Badge>
            )}
            {score !== undefined && (
              <p className="text-xs text-slate-500 mt-1">
                <span className={cn("font-mono font-semibold", colors.score)}>{score}</span>
                <span className="text-slate-600">/100</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Section Content */}
      {children}
    </Card>
  );
}
