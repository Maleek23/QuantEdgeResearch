import { motion } from "framer-motion";
import { useMemo } from "react";

interface GeminiGradientProps {
  className?: string;
  variant?: "hero" | "subtle" | "accent";
}

export function GeminiGradient({ className = "", variant = "hero" }: GeminiGradientProps) {
  const variants = {
    hero: {
      orbs: [
        { color: "from-cyan-500/40 via-cyan-400/20 to-transparent", size: "w-[600px] h-[600px]", position: "top-[-200px] right-[-100px]", delay: 0 },
        { color: "from-purple-500/30 via-purple-400/10 to-transparent", size: "w-[500px] h-[500px]", position: "top-[100px] left-[-150px]", delay: 0.5 },
        { color: "from-pink-500/25 via-pink-400/10 to-transparent", size: "w-[400px] h-[400px]", position: "bottom-[-100px] right-[20%]", delay: 1 },
        { color: "from-blue-500/20 via-blue-400/10 to-transparent", size: "w-[350px] h-[350px]", position: "bottom-[20%] left-[10%]", delay: 1.5 },
      ],
    },
    subtle: {
      orbs: [
        { color: "from-cyan-500/20 via-cyan-400/5 to-transparent", size: "w-[400px] h-[400px]", position: "top-[-100px] right-[-50px]", delay: 0 },
        { color: "from-purple-500/15 via-purple-400/5 to-transparent", size: "w-[300px] h-[300px]", position: "bottom-[-50px] left-[-50px]", delay: 0.5 },
      ],
    },
    accent: {
      orbs: [
        { color: "from-cyan-400/50 via-cyan-500/20 to-transparent", size: "w-[200px] h-[200px]", position: "top-0 right-0", delay: 0 },
      ],
    },
  };

  const config = variants[variant];

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {config.orbs.map((orb, i) => (
        <motion.div
          key={i}
          className={`absolute ${orb.size} ${orb.position} rounded-full bg-gradient-radial ${orb.color} blur-3xl`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ 
            opacity: [0.6, 0.8, 0.6],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 8,
            delay: orb.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function GeminiOrb({ 
  size = "md", 
  color = "cyan",
  className = "",
  pulse = true 
}: { 
  size?: "sm" | "md" | "lg" | "xl";
  color?: "cyan" | "purple" | "pink" | "blue" | "green" | "amber";
  className?: string;
  pulse?: boolean;
}) {
  const sizes = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
    xl: "w-48 h-48",
  };

  const colors = {
    cyan: "from-cyan-400 via-cyan-500 to-cyan-600",
    purple: "from-purple-400 via-purple-500 to-purple-600",
    pink: "from-pink-400 via-pink-500 to-pink-600",
    blue: "from-blue-400 via-blue-500 to-blue-600",
    green: "from-green-400 via-green-500 to-green-600",
    amber: "from-amber-400 via-amber-500 to-amber-600",
  };

  const glowColors = {
    cyan: "shadow-cyan-500/50",
    purple: "shadow-purple-500/50",
    pink: "shadow-pink-500/50",
    blue: "shadow-blue-500/50",
    green: "shadow-green-500/50",
    amber: "shadow-amber-500/50",
  };

  return (
    <motion.div
      className={`${sizes[size]} rounded-full bg-gradient-to-br ${colors[color]} shadow-2xl ${glowColors[color]} ${className}`}
      animate={pulse ? {
        scale: [1, 1.05, 1],
        opacity: [0.9, 1, 0.9],
      } : undefined}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

export function AnimatedMetricCard({ 
  label, 
  value, 
  color = "cyan",
  icon,
  className = "" 
}: { 
  label: string;
  value: string | number;
  color?: "cyan" | "purple" | "pink" | "green" | "amber";
  icon?: React.ReactNode;
  className?: string;
}) {
  const borderColors = {
    cyan: "border-cyan-500/30",
    purple: "border-purple-500/30",
    pink: "border-pink-500/30",
    green: "border-green-500/30",
    amber: "border-amber-500/30",
  };

  const glowColors = {
    cyan: "from-cyan-500/10 via-cyan-500/5",
    purple: "from-purple-500/10 via-purple-500/5",
    pink: "from-pink-500/10 via-pink-500/5",
    green: "from-green-500/10 via-green-500/5",
    amber: "from-amber-500/10 via-amber-500/5",
  };

  const textColors = {
    cyan: "text-cyan-400",
    purple: "text-purple-400",
    pink: "text-pink-400",
    green: "text-green-400",
    amber: "text-amber-400",
  };

  return (
    <motion.div
      className={`relative overflow-hidden rounded-2xl border ${borderColors[color]} bg-slate-900/50 backdrop-blur-sm p-6 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${glowColors[color]} to-transparent`} />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          {icon && <span className={textColors[color]}>{icon}</span>}
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <motion.div 
          className={`text-3xl font-bold font-mono tabular-nums ${textColors[color]}`}
          initial={{ scale: 0.5 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {value}
        </motion.div>
      </div>
    </motion.div>
  );
}

export function FloatingParticles({ count = 20, className = "" }: { count?: number; className?: string }) {
  const particles = useMemo(() => 
    Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: 3 + Math.random() * 2,
      delay: Math.random() * 2,
    })),
    [count]
  );

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute w-1 h-1 rounded-full bg-cyan-400/30"
          style={{
            left: `${particle.left}%`,
            top: `${particle.top}%`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
