import { motion } from "framer-motion";
import { useState } from "react";

interface InteractiveSparklineProps {
  data: number[];
  color?: string;
  height?: number;
  showDots?: boolean;
  animate?: boolean;
  className?: string;
}

export function InteractiveSparkline({
  data,
  color = "#06b6d4",
  height = 40,
  showDots = false,
  animate = true,
  className = ""
}: InteractiveSparklineProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const width = 100;
  const padding = 2;
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - ((value - min) / range) * (height - padding * 2) - padding;
    return { x, y, value };
  });

  // Create SVG path
  const pathData = points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    return `${path} L ${point.x} ${point.y}`;
  }, "");

  // Create area path
  const areaData = `${pathData} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  const isPositiveTrend = data[data.length - 1] >= data[0];

  return (
    <div className={`relative ${className}`}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* Area Fill */}
        <motion.path
          d={areaData}
          fill={`url(#gradient-${color})`}
          initial={animate ? { opacity: 0 } : undefined}
          animate={animate ? { opacity: 1 } : undefined}
          transition={{ duration: 0.5 }}
        />

        {/* Line */}
        <motion.path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animate ? { pathLength: 0 } : undefined}
          animate={animate ? { pathLength: 1 } : undefined}
          transition={{ duration: 1, ease: "easeInOut" }}
        />

        {/* Interactive Dots */}
        {showDots && points.map((point, index) => (
          <motion.circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={hoveredIndex === index ? 3 : 2}
            fill={color}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: index * 0.05 }}
            onMouseEnter={() => setHoveredIndex(index)}
            className="cursor-pointer"
            style={{
              filter: hoveredIndex === index ? `drop-shadow(0 0 4px ${color})` : 'none'
            }}
          />
        ))}

        {/* Hover Line */}
        {hoveredIndex !== null && (
          <motion.line
            x1={points[hoveredIndex].x}
            y1={0}
            x2={points[hoveredIndex].x}
            y2={height}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.5}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
          />
        )}

        {/* Interactive Area */}
        {points.map((point, index) => (
          <rect
            key={`hit-${index}`}
            x={index === 0 ? 0 : points[index - 1].x}
            y={0}
            width={index === 0 ? point.x : point.x - points[index - 1].x}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(index)}
            className="cursor-crosshair"
          />
        ))}
      </svg>

      {/* Hover Tooltip */}
      {hoveredIndex !== null && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 -translate-x-1/2 -top-8 glass-card border border-slate-700 rounded px-2 py-1 shadow-xl pointer-events-none z-10"
        >
          <p className="text-xs font-mono font-bold whitespace-nowrap" style={{ color }}>
            {points[hoveredIndex].value.toFixed(2)}
          </p>
        </motion.div>
      )}
    </div>
  );
}
