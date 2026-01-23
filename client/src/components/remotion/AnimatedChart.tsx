import { motion } from "framer-motion";
import { useMemo } from "react";

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface AnimatedChartProps {
  data: DataPoint[];
  type?: "bar" | "line" | "area";
  height?: number;
  showLabels?: boolean;
  animated?: boolean;
  className?: string;
}

// Animated Bar Chart
export const AnimatedBarChart = ({
  data,
  height = 200,
  showLabels = true,
  animated = true,
  className = ""
}: Omit<AnimatedChartProps, "type">) => {
  // Guard against empty data
  if (!data || data.length === 0) {
    return <div className={`flex items-center justify-center text-muted-foreground ${className}`} style={{ height }}>No data</div>;
  }
  
  const maxValue = Math.max(...data.map(d => Math.abs(d.value))) || 1; // Prevent division by zero
  
  return (
    <div className={`flex items-end gap-2 justify-between ${className}`} style={{ height }}>
      {data.map((item, index) => {
        const barHeight = (Math.abs(item.value) / maxValue) * height * 0.8;
        const isPositive = item.value >= 0;
        const defaultColor = isPositive ? "bg-green-500" : "bg-red-500";
        
        return (
          <div key={item.label} className="flex flex-col items-center flex-1">
            <motion.div
              initial={animated ? { height: 0, opacity: 0 } : false}
              animate={{ height: barHeight, opacity: 1 }}
              transition={{ 
                duration: 0.5, 
                delay: index * 0.1,
                ease: "easeOut"
              }}
              className={`w-full max-w-12 rounded-t-md ${item.color || defaultColor}`}
            />
            {showLabels && (
              <motion.span
                initial={animated ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.1 + 0.3 }}
                className="text-xs text-muted-foreground mt-2 truncate max-w-full"
              >
                {item.label}
              </motion.span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Animated Line/Area Chart
export const AnimatedLineChart = ({
  data,
  height = 200,
  type = "line",
  animated = true,
  className = ""
}: Omit<AnimatedChartProps, "showLabels">) => {
  // Guard against empty or single-point data
  if (!data || data.length < 2) {
    return <div className={`flex items-center justify-center text-muted-foreground ${className}`} style={{ height }}>Need 2+ points</div>;
  }
  
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1; // Prevent division by zero
  
  const width = 100;
  const padding = 10;
  
  const points = useMemo(() => {
    return data.map((item, index) => {
      const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((item.value - minValue) / range) * (height - 2 * padding);
      return { x, y, ...item };
    });
  }, [data, height, minValue, range]);
  
  const linePath = points.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ');
  
  const areaPath = type === "area" 
    ? `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
    : "";
  
  return (
    <div className={className}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Area fill */}
        {type === "area" && (
          <motion.path
            d={areaPath}
            fill="url(#areaGradient)"
            initial={animated ? { opacity: 0 } : false}
            animate={{ opacity: 0.3 }}
            transition={{ duration: 0.8 }}
          />
        )}
        
        {/* Line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        
        {/* Points */}
        {points.map((point, index) => (
          <motion.circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={3}
            fill="hsl(var(--primary))"
            initial={animated ? { scale: 0, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 + index * 0.05, duration: 0.2 }}
          />
        ))}
        
        {/* Gradient definition */}
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

// Animated Donut/Pie Chart
export const AnimatedDonutChart = ({
  data,
  size = 150,
  strokeWidth = 20,
  animated = true,
  className = ""
}: {
  data: DataPoint[];
  size?: number;
  strokeWidth?: number;
  animated?: boolean;
  className?: string;
}) => {
  // Guard against empty data
  if (!data || data.length === 0) {
    return <div className={`flex items-center justify-center text-muted-foreground ${className}`} style={{ width: size, height: size }}>No data</div>;
  }
  
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1; // Prevent division by zero
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  let currentAngle = 0;
  
  const defaultColors = [
    "hsl(var(--primary))",
    "hsl(142 71% 45%)", // green
    "hsl(0 84% 60%)",   // red
    "hsl(38 92% 50%)",  // amber
    "hsl(217 91% 60%)", // blue
    "hsl(280 67% 60%)", // purple
  ];
  
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
        />
        
        {data.map((item, index) => {
          const percentage = item.value / total;
          const dashLength = circumference * percentage;
          const dashOffset = circumference * (1 - currentAngle / 360);
          
          const segment = (
            <motion.circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color || defaultColors[index % defaultColors.length]}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              initial={animated ? { opacity: 0, strokeDasharray: `0 ${circumference}` } : false}
              animate={{ opacity: 1, strokeDasharray: `${dashLength} ${circumference}` }}
              transition={{ duration: 0.8, delay: index * 0.15, ease: "easeOut" }}
            />
          );
          
          currentAngle += percentage * 360;
          return segment;
        })}
      </svg>
      
      {/* Center text */}
      <motion.div
        initial={animated ? { opacity: 0, scale: 0.8 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div className="text-center">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
      </motion.div>
    </div>
  );
};

// Animated Sparkline (mini chart)
export const AnimatedSparkline = ({
  data,
  width = 100,
  height = 30,
  color = "hsl(var(--primary))",
  autoColor = false,
  animated = true,
  className = ""
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  autoColor?: boolean;
  animated?: boolean;
  className?: string;
}) => {
  // Guard against empty or single-point data
  if (!data || data.length < 2) {
    return <svg width={width} height={height} className={className} />;
  }
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1; // Prevent division by zero
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  const isPositive = data[data.length - 1] >= data[0];
  const lineColor = autoColor 
    ? (isPositive ? "hsl(142 71% 45%)" : "hsl(0 84% 60%)")
    : color;
  
  return (
    <svg width={width} height={height} className={className}>
      <motion.polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </svg>
  );
};

// Animated Gauge Chart
export const AnimatedGauge = ({
  value,
  max = 100,
  size = 120,
  strokeWidth = 12,
  label = "",
  animated = true,
  className = ""
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  animated?: boolean;
  className?: string;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // Semi-circle
  const percentage = Math.min(value / max, 1);
  const strokeDashoffset = circumference * (1 - percentage);
  
  // Color based on value
  const getColor = () => {
    if (percentage >= 0.7) return "hsl(142 71% 45%)"; // green
    if (percentage >= 0.4) return "hsl(38 92% 50%)";  // amber
    return "hsl(0 84% 60%)"; // red
  };
  
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size / 2 + 20 }}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* Value arc */}
        <motion.path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={animated ? { strokeDashoffset: circumference } : false}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      
      {/* Value display */}
      <motion.div
        initial={animated ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-0 left-0 right-0 text-center"
      >
        <div className="text-xl font-bold">{value.toFixed(0)}</div>
        {label && <div className="text-xs text-muted-foreground">{label}</div>}
      </motion.div>
    </div>
  );
};

export default {
  AnimatedBarChart,
  AnimatedLineChart,
  AnimatedDonutChart,
  AnimatedSparkline,
  AnimatedGauge
};
