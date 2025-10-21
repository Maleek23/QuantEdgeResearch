import { cn } from "@/lib/utils";
import { getPerformanceGrade } from "@/lib/performance-grade";

interface ConfidenceCircleProps {
  score: number; // 0-100
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceCircle({ score, size = "md", showLabel = true, className }: ConfidenceCircleProps) {
  // Use performance-based grading instead of simple confidence-based grading
  const perfGrade = getPerformanceGrade(score);
  
  const getGradeColor = (grade: string): string => {
    if (grade === 'A') return 'text-green-500';
    if (grade === 'A+') return 'text-amber-500'; // Over-confident warning
    if (grade === 'B+') return 'text-blue-500';
    if (grade === 'B') return 'text-cyan-500';
    if (grade === 'C+') return 'text-orange-500';
    if (grade === 'C') return 'text-amber-500';
    return 'text-red-500';
  };

  const getStrokeColor = (grade: string): string => {
    if (grade === 'A') return '#22c55e'; // green-500
    if (grade === 'A+') return '#f59e0b'; // amber-500 - warning color for overconfidence
    if (grade === 'B+') return '#3b82f6'; // blue-500
    if (grade === 'B') return '#06b6d4'; // cyan-500
    if (grade === 'C+') return '#f97316'; // orange-500
    if (grade === 'C') return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };

  const sizes = {
    sm: { circle: 40, stroke: 3, font: 'text-xs' },
    md: { circle: 60, stroke: 4, font: 'text-sm' },
    lg: { circle: 80, stroke: 5, font: 'text-base' }
  };

  const config = sizes[size];
  const radius = (config.circle - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: config.circle, height: config.circle }}>
        {/* Multi-ring background showing confidence zones */}
        <svg
          className="transform -rotate-90"
          width={config.circle}
          height={config.circle}
        >
          {/* Background base */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={config.stroke}
            fill="none"
            className="text-muted/10"
          />
          
          {/* Performance-based zone markers */}
          {/* Poor zone (D, <70) - red - first 70% */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            stroke="#ef4444"
            strokeWidth={config.stroke}
            fill="none"
            strokeDasharray={`${circumference * 0.7} ${circumference}`}
            className={perfGrade.grade === 'D' ? 'opacity-30' : 'opacity-10'}
          />
          
          {/* Weak zone (C/C+, 70-79) - orange/amber - 10% band */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            stroke="#f97316"
            strokeWidth={config.stroke}
            fill="none"
            strokeDasharray={`${circumference * 0.1} ${circumference}`}
            strokeDashoffset={-circumference * 0.7}
            className={perfGrade.grade === 'C' || perfGrade.grade === 'C+' ? 'opacity-30' : 'opacity-10'}
          />
          
          {/* Good zone (B/B+/A, 80-94) - cyan/blue/green - 15% band */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            stroke="#22c55e"
            strokeWidth={config.stroke}
            fill="none"
            strokeDasharray={`${circumference * 0.15} ${circumference}`}
            strokeDashoffset={-circumference * 0.8}
            className={perfGrade.grade === 'A' || perfGrade.grade === 'B+' || perfGrade.grade === 'B' ? 'opacity-30' : 'opacity-10'}
          />
          
          {/* Over-confident zone (A+, 95+) - amber warning - final 5% */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            stroke="#f59e0b"
            strokeWidth={config.stroke}
            fill="none"
            strokeDasharray={`${circumference * 0.05} ${circumference}`}
            strokeDashoffset={-circumference * 0.95}
            className={perfGrade.grade === 'A+' ? 'opacity-30' : 'opacity-10'}
          />
          
          {/* Actual progress indicator */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            stroke={getStrokeColor(perfGrade.grade)}
            strokeWidth={config.stroke + 1}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>
        {/* Performance Grade label inside circle */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold", config.font, getGradeColor(perfGrade.grade))}>
            {perfGrade.grade}
          </span>
        </div>
      </div>
      {showLabel && (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs text-muted-foreground font-medium">
            ~{perfGrade.expectedWinRate}% Win Rate
          </span>
          <span className="text-[10px] text-muted-foreground/70">
            {perfGrade.description}
          </span>
        </div>
      )}
    </div>
  );
}
