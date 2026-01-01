"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

interface Sparkle {
  id: string;
  x: string;
  y: string;
  color: string;
  delay: number;
  scale: number;
  lifespan: number;
}

interface SparklesTextProps {
  text: string;
  className?: string;
  sparklesCount?: number;
  colors?: {
    first: string;
    second: string;
  };
}

const SparkleIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
  </svg>
);

export function SparklesText({
  text,
  className,
  sparklesCount = 10,
  colors = { first: "#A855F7", second: "#22D3EE" },
}: SparklesTextProps) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);

  const generateSparkle = useCallback((): Sparkle => {
    return {
      id: Math.random().toString(36).substring(2, 9),
      x: `${Math.random() * 100}%`,
      y: `${Math.random() * 100}%`,
      color: Math.random() > 0.5 ? colors.first : colors.second,
      delay: Math.random() * 2,
      scale: Math.random() * 0.5 + 0.5,
      lifespan: Math.random() * 10 + 10,
    };
  }, [colors.first, colors.second]);

  useEffect(() => {
    const initialSparkles = Array.from({ length: sparklesCount }, generateSparkle);
    setSparkles(initialSparkles);

    const interval = setInterval(() => {
      setSparkles((current) => {
        const now = Date.now();
        const filtered = current.filter(() => Math.random() > 0.1);
        const newSparkle = generateSparkle();
        return [...filtered, newSparkle].slice(-sparklesCount * 2);
      });
    }, 500);

    return () => clearInterval(interval);
  }, [sparklesCount, generateSparkle]);

  return (
    <span className={cn("relative inline-block", className)}>
      <span className="relative z-10">{text}</span>
      <AnimatePresence>
        {sparkles.map((sparkle) => (
          <motion.span
            key={sparkle.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: sparkle.scale }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{
              duration: 0.5,
              delay: sparkle.delay * 0.1,
              ease: "easeInOut",
            }}
            className="absolute pointer-events-none"
            style={{
              left: sparkle.x,
              top: sparkle.y,
              color: sparkle.color,
            }}
          >
            <SparkleIcon className="w-3 h-3" />
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

export default SparklesText;
