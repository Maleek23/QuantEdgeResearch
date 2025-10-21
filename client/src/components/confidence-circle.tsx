import { cn } from "@/lib/utils";

interface ConfidenceCircleProps {
  score: number; // 0-100
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceCircle({ score, size = "md", showLabel = true, className }: ConfidenceCircleProps) {
  const getLetterGrade = (score: number): string => {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C+';
    if (score >= 70) return 'C';
    return 'D';
  };

  const getGradeColor = (score: number): string => {
    if (score >= 85) return 'text-green-500';
    if (score >= 75) return 'text-cyan-500';
    if (score >= 70) return 'text-amber-500';
    return 'text-red-500';
  };

  const getStrokeColor = (score: number): string => {
    if (score >= 85) return '#22c55e'; // green-500
    if (score >= 75) return '#06b6d4'; // cyan-500
    if (score >= 70) return '#f59e0b'; // amber-500
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
        {/* Background circle */}
        <svg
          className="transform -rotate-90"
          width={config.circle}
          height={config.circle}
        >
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={config.stroke}
            fill="none"
            className="text-muted/20"
          />
          {/* Progress circle */}
          <circle
            cx={config.circle / 2}
            cy={config.circle / 2}
            r={radius}
            stroke={getStrokeColor(score)}
            strokeWidth={config.stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>
        {/* Grade label inside circle */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("font-bold", config.font, getGradeColor(score))}>
            {getLetterGrade(score)}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground font-medium">
          {score}% Confidence
        </span>
      )}
    </div>
  );
}
