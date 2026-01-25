import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Flame, Zap, TrendingUp } from "lucide-react";

interface ConfidenceMeterProps {
  confidence: number; // 0-100
  className?: string;
  showLabel?: boolean;
  animated?: boolean;
}

export function ConfidenceMeter({
  confidence,
  className,
  showLabel = true,
  animated = true,
}: ConfidenceMeterProps) {
  const clampedConfidence = Math.max(0, Math.min(100, confidence));

  // Determine color and icon based on confidence level
  const getConfidenceStyle = (value: number) => {
    if (value >= 80) {
      return {
        color: "text-emerald-400",
        bgColor: "bg-emerald-500",
        glowColor: "shadow-emerald-500/50",
        icon: Flame,
        label: "HIGH",
      };
    } else if (value >= 60) {
      return {
        color: "text-cyan-400",
        bgColor: "bg-cyan-500",
        glowColor: "shadow-cyan-500/50",
        icon: Zap,
        label: "GOOD",
      };
    } else if (value >= 40) {
      return {
        color: "text-amber-400",
        bgColor: "bg-amber-500",
        glowColor: "shadow-amber-500/50",
        icon: TrendingUp,
        label: "MODERATE",
      };
    } else {
      return {
        color: "text-slate-400",
        bgColor: "bg-slate-500",
        glowColor: "shadow-slate-500/50",
        icon: TrendingUp,
        label: "LOW",
      };
    }
  };

  const style = getConfidenceStyle(clampedConfidence);
  const Icon = style.icon;

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Confidence</span>
          <div className="flex items-center gap-2">
            <span className={cn("font-semibold", style.color)}>
              {clampedConfidence}%
            </span>
            {clampedConfidence >= 80 && (
              <Icon className={cn("w-4 h-4", style.color)} />
            )}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="relative h-2 bg-slate-800/50 rounded-full overflow-hidden">
        {animated ? (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${clampedConfidence}%` }}
            transition={{
              duration: 1,
              ease: "easeOut",
              delay: 0.2,
            }}
            className={cn(
              "h-full rounded-full",
              style.bgColor,
              clampedConfidence >= 80 && `shadow-lg ${style.glowColor}`
            )}
          />
        ) : (
          <div
            style={{ width: `${clampedConfidence}%` }}
            className={cn(
              "h-full rounded-full transition-all duration-300",
              style.bgColor,
              clampedConfidence >= 80 && `shadow-lg ${style.glowColor}`
            )}
          />
        )}

        {/* Shimmer effect for high confidence */}
        {clampedConfidence >= 80 && (
          <motion.div
            animate={{
              x: ["-100%", "200%"],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear",
            }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          />
        )}
      </div>

      {/* Confidence level label */}
      {showLabel && clampedConfidence >= 60 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-1 text-xs"
        >
          <span className={cn("font-medium", style.color)}>
            {style.label} CONFIDENCE
          </span>
        </motion.div>
      )}
    </div>
  );
}
