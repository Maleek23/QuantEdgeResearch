import { useEffect, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn, safeToFixed } from "@/lib/utils";

interface AnimatedStatProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function AnimatedStat({
  value,
  duration = 1000,
  className,
  prefix = "",
  suffix = "",
  decimals = 0,
}: AnimatedStatProps) {
  const [displayValue, setDisplayValue] = useState(0);

  // Use framer-motion spring for smooth animation
  const spring = useSpring(0, {
    damping: 30,
    stiffness: 100,
  });

  const display = useTransform(spring, (current) =>
    safeToFixed(current, decimals)
  );

  useEffect(() => {
    spring.set(value);

    // Also update state for accessibility
    const timer = setTimeout(() => {
      setDisplayValue(value);
    }, duration);

    return () => clearTimeout(timer);
  }, [value, spring, duration]);

  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("font-bold tabular-nums", className)}
    >
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </motion.span>
  );
}

// Simpler version without spring (less CPU intensive)
export function SimpleAnimatedStat({
  value,
  duration = 1000,
  className,
  prefix = "",
  suffix = "",
  decimals = 0,
}: AnimatedStatProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    const increment = end / (duration / 16); // 60fps

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value, duration]);

  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("font-bold tabular-nums", className)}
    >
      {prefix}
      {safeToFixed(count, decimals)}
      {suffix}
    </motion.span>
  );
}
