import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface AnimatedStatProps {
  value: number | string;
  label: string;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
  highlight?: boolean;
}

export function AnimatedStat({
  value,
  label,
  suffix = "",
  prefix = "",
  decimals = 0,
  duration = 2,
  highlight = false
}: AnimatedStatProps) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const numericValue = typeof value === "string" ? parseFloat(value) : value;
  const isNumeric = !isNaN(numericValue);

  useEffect(() => {
    if (!isNumeric || hasAnimated) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasAnimated(true);
          const start = 0;
          const end = numericValue;
          const increment = end / (duration * 60);
          let current = start;

          const timer = setInterval(() => {
            current += increment;
            if (current >= end) {
              setCount(end);
              clearInterval(timer);
            } else {
              setCount(current);
            }
          }, 1000 / 60);

          return () => clearInterval(timer);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [numericValue, duration, isNumeric, hasAnimated]);

  return (
    <motion.div
      ref={ref}
      className="stat-glass rounded-lg p-4"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </p>
      <div className={`text-2xl font-bold font-mono tabular-nums ${highlight ? 'text-cyan-400' : 'text-foreground'}`}>
        {prefix}
        {isNumeric
          ? count.toFixed(decimals)
          : value
        }
        {suffix}
      </div>
    </motion.div>
  );
}
