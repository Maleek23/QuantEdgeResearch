import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { ReactNode } from "react";

interface GlowCardProps {
  children: ReactNode;
  confidence?: number; // 0-100, determines glow intensity
  className?: string;
  onClick?: () => void;
  glow?: boolean;
  glowColor?: "cyan" | "emerald" | "amber" | "red";
}

export function GlowCard({
  children,
  confidence,
  className,
  onClick,
  glow = true,
  glowColor,
}: GlowCardProps) {
  // Determine glow color based on confidence if not explicitly set
  const getGlowColor = () => {
    if (glowColor) return glowColor;
    if (!confidence) return "cyan";

    if (confidence >= 80) return "emerald";
    if (confidence >= 60) return "cyan";
    if (confidence >= 40) return "amber";
    return "red";
  };

  const color = getGlowColor();
  const shouldGlow = glow && (confidence === undefined || confidence >= 60);

  const glowColors = {
    cyan: "shadow-cyan-500/50 border-cyan-500/30 hover:border-cyan-500/50",
    emerald: "shadow-emerald-500/50 border-emerald-500/30 hover:border-emerald-500/50",
    amber: "shadow-amber-500/50 border-amber-500/30 hover:border-amber-500/50",
    red: "shadow-red-500/50 border-red-500/30 hover:border-red-500/50",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        y: -4,
        transition: { duration: 0.2 },
      }}
      className="relative"
    >
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          "bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl",
          shouldGlow && `shadow-lg ${glowColors[color]}`,
          onClick && "cursor-pointer",
          className
        )}
        onClick={onClick}
      >
        {/* Animated gradient overlay for high confidence */}
        {shouldGlow && confidence && confidence >= 80 && (
          <motion.div
            animate={{
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10 pointer-events-none"
          />
        )}

        {/* Hover shimmer effect */}
        <motion.div
          initial={{ x: "-100%" }}
          whileHover={{ x: "200%" }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none"
        />

        {children}
      </Card>

      {/* Outer glow for very high confidence */}
      {shouldGlow && confidence && confidence >= 90 && (
        <motion.div
          animate={{
            opacity: [0.2, 0.5, 0.2],
            scale: [0.95, 1, 0.95],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={cn(
            "absolute inset-0 -z-10 rounded-lg blur-xl",
            color === "emerald" && "bg-emerald-500/30",
            color === "cyan" && "bg-cyan-500/30"
          )}
        />
      )}
    </motion.div>
  );
}
