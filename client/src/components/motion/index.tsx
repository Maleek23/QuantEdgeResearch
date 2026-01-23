import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

// Fade in animation for cards and containers
export const FadeIn = ({ 
  children, 
  delay = 0,
  duration = 0.3,
  className = ""
}: { 
  children: ReactNode; 
  delay?: number;
  duration?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration, delay, ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.div>
);

// Slide in from left
export const SlideInLeft = ({ 
  children, 
  delay = 0,
  className = ""
}: { 
  children: ReactNode; 
  delay?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.3, delay, ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.div>
);

// Slide in from right
export const SlideInRight = ({ 
  children, 
  delay = 0,
  className = ""
}: { 
  children: ReactNode; 
  delay?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 20 }}
    transition={{ duration: 0.3, delay, ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.div>
);

// Scale up animation
export const ScaleUp = ({ 
  children, 
  delay = 0,
  className = ""
}: { 
  children: ReactNode; 
  delay?: number;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.2, delay, ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.div>
);

// Stagger children animation container
export const StaggerContainer = ({ 
  children,
  staggerDelay = 0.05,
  className = ""
}: { 
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
}) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: staggerDelay
        }
      }
    }}
    className={className}
  >
    {children}
  </motion.div>
);

// Stagger child item
export const StaggerItem = ({ 
  children,
  className = ""
}: { 
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 15 },
      visible: { opacity: 1, y: 0 }
    }}
    transition={{ duration: 0.3, ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.div>
);

// Pulse animation for live indicators
export const Pulse = ({ 
  children,
  className = ""
}: { 
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    animate={{ 
      scale: [1, 1.05, 1],
      opacity: [1, 0.8, 1]
    }}
    transition={{ 
      duration: 2, 
      repeat: Infinity,
      ease: "easeInOut"
    }}
    className={className}
  >
    {children}
  </motion.div>
);

// Number counter animation
export const AnimatedNumber = ({ 
  value,
  prefix = "",
  suffix = "",
  decimals = 2,
  className = ""
}: { 
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) => (
  <motion.span
    key={value}
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className={className}
  >
    {prefix}{value.toFixed(decimals)}{suffix}
  </motion.span>
);

// Progress bar animation
export const AnimatedProgress = ({ 
  value,
  max = 100,
  className = "",
  barClassName = ""
}: { 
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
}) => (
  <div className={`h-2 bg-muted rounded-full overflow-hidden ${className}`}>
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${(value / max) * 100}%` }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`h-full bg-primary rounded-full ${barClassName}`}
    />
  </div>
);

// Hover scale effect wrapper
export const HoverScale = ({ 
  children,
  scale = 1.02,
  className = ""
}: { 
  children: ReactNode;
  scale?: number;
  className?: string;
}) => (
  <motion.div
    whileHover={{ scale }}
    whileTap={{ scale: 0.98 }}
    transition={{ duration: 0.15 }}
    className={className}
  >
    {children}
  </motion.div>
);

// Shimmer loading effect
export const Shimmer = ({ 
  className = "h-4 w-full"
}: { 
  className?: string;
}) => (
  <motion.div
    className={`bg-muted rounded ${className}`}
    animate={{
      background: [
        "linear-gradient(90deg, hsl(var(--muted)) 0%, hsl(var(--muted-foreground)/0.1) 50%, hsl(var(--muted)) 100%)",
        "linear-gradient(90deg, hsl(var(--muted)) 100%, hsl(var(--muted-foreground)/0.1) 50%, hsl(var(--muted)) 0%)",
      ]
    }}
    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
  />
);

// Card with hover lift effect
export const LiftCard = ({ 
  children,
  className = ""
}: { 
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    whileHover={{ 
      y: -4,
      boxShadow: "0 10px 40px -10px rgba(0,0,0,0.2)"
    }}
    transition={{ duration: 0.2 }}
    className={className}
  >
    {children}
  </motion.div>
);

// Animated badge/pill
export const AnimatedBadge = ({ 
  children,
  variant = "default",
  className = ""
}: { 
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
}) => {
  const colors = {
    default: "bg-primary/10 text-primary",
    success: "bg-green-500/10 text-green-500",
    warning: "bg-amber-500/10 text-amber-500",
    danger: "bg-red-500/10 text-red-500"
  };
  
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[variant]} ${className}`}
    >
      {children}
    </motion.span>
  );
};

// Animated trend arrow using lucide icons
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export const TrendArrow = ({ 
  direction,
  size = 16
}: { 
  direction: "up" | "down" | "neutral";
  size?: number;
}) => {
  if (direction === "neutral") {
    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-muted-foreground inline-flex"
      >
        <Minus size={size} />
      </motion.span>
    );
  }
  
  const Icon = direction === "up" ? TrendingUp : TrendingDown;
  
  return (
    <motion.span
      initial={{ opacity: 0, y: direction === "up" ? 5 : -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex ${direction === "up" ? "text-green-500" : "text-red-500"}`}
    >
      <Icon size={size} />
    </motion.span>
  );
};

// Page transition wrapper
export const PageTransition = ({ 
  children,
  className = ""
}: { 
  children: ReactNode;
  className?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3, ease: "easeOut" }}
    className={className}
  >
    {children}
  </motion.div>
);

// Export AnimatePresence for use in parent components
export { AnimatePresence, motion };
