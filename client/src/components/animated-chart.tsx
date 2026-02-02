/**
 * Animated Chart Component
 *
 * Realistic-looking animated SVG charts for the landing page.
 * Supports multiple styles: candlestick, line, area, and volume.
 */

import { useEffect, useState, useMemo } from "react";
import { cn, safeToFixed } from "@/lib/utils";

interface AnimatedChartProps {
  className?: string;
  variant?: "candlestick" | "line" | "area";
  color?: "green" | "red" | "cyan" | "mixed";
  height?: number;
  width?: number;
  animated?: boolean;
  showVolume?: boolean;
  showGrid?: boolean;
}

// Generate realistic-looking price data
function generatePriceData(points: number, trend: "up" | "down" | "mixed" = "mixed") {
  const data: { open: number; high: number; low: number; close: number; volume: number }[] = [];
  let price = 150 + Math.random() * 50;

  for (let i = 0; i < points; i++) {
    const volatility = 2 + Math.random() * 3;
    const trendBias = trend === "up" ? 0.6 : trend === "down" ? 0.4 : 0.5;
    const change = (Math.random() - trendBias) * volatility;

    const open = price;
    price = price + change;
    const close = price;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = 50 + Math.random() * 100;

    data.push({ open, high, low, close, volume });
  }

  return data;
}

export function AnimatedChart({
  className,
  variant = "candlestick",
  color = "mixed",
  height = 200,
  width = 400,
  animated = true,
  showVolume = true,
  showGrid = true,
}: AnimatedChartProps) {
  const [data, setData] = useState(() =>
    generatePriceData(30, color === "green" ? "up" : color === "red" ? "down" : "mixed")
  );
  const [animationProgress, setAnimationProgress] = useState(0);

  // Animate on mount
  useEffect(() => {
    if (!animated) {
      setAnimationProgress(1);
      return;
    }

    const duration = 1500;
    const start = Date.now();

    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      setAnimationProgress(easeOutCubic(progress));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [animated]);

  // Calculate chart dimensions
  const padding = { top: 10, right: 10, bottom: showVolume ? 40 : 10, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = (showVolume ? height * 0.7 : height) - padding.top - padding.bottom;
  const volumeHeight = showVolume ? height * 0.25 : 0;

  // Calculate scales
  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    const prices = data.flatMap((d) => [d.high, d.low]);
    const volumes = data.map((d) => d.volume);
    return {
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      maxVolume: Math.max(...volumes),
    };
  }, [data]);

  const priceRange = maxPrice - minPrice;
  const candleWidth = (chartWidth / data.length) * 0.7;
  const candleGap = (chartWidth / data.length) * 0.3;

  // Helper functions
  const priceToY = (price: number) =>
    padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;

  const volumeToY = (volume: number) =>
    height - padding.bottom + 5 - (volume / maxVolume) * volumeHeight;

  const getColor = (open: number, close: number) => {
    if (color === "green") return "#10b981";
    if (color === "red") return "#ef4444";
    if (color === "cyan") return "#22d3ee";
    return close >= open ? "#10b981" : "#ef4444";
  };

  // Render based on variant
  const renderChart = () => {
    const visibleData = data.slice(0, Math.ceil(data.length * animationProgress));

    if (variant === "line" || variant === "area") {
      const points = visibleData.map((d, i) => {
        const x = padding.left + i * (chartWidth / data.length) + candleWidth / 2;
        const y = priceToY(d.close);
        return `${x},${y}`;
      });

      const lineColor = color === "red" ? "#ef4444" : color === "cyan" ? "#22d3ee" : "#10b981";

      if (variant === "area") {
        const firstX = padding.left + candleWidth / 2;
        const lastX = padding.left + (visibleData.length - 1) * (chartWidth / data.length) + candleWidth / 2;
        const areaPath = `M${firstX},${chartHeight + padding.top} L${points.join(" L")} L${lastX},${chartHeight + padding.top} Z`;

        return (
          <>
            <defs>
              <linearGradient id={`areaGradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#areaGradient-${color})`} />
            <polyline
              points={points.join(" ")}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        );
      }

      return (
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    // Candlestick
    return visibleData.map((d, i) => {
      const x = padding.left + i * (chartWidth / data.length);
      const candleColor = getColor(d.open, d.close);
      const bodyTop = priceToY(Math.max(d.open, d.close));
      const bodyBottom = priceToY(Math.min(d.open, d.close));
      const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

      return (
        <g key={i}>
          {/* Wick */}
          <line
            x1={x + candleWidth / 2}
            y1={priceToY(d.high)}
            x2={x + candleWidth / 2}
            y2={priceToY(d.low)}
            stroke={candleColor}
            strokeWidth="1"
          />
          {/* Body */}
          <rect
            x={x}
            y={bodyTop}
            width={candleWidth}
            height={bodyHeight}
            fill={d.close >= d.open ? candleColor : candleColor}
            rx="1"
          />
        </g>
      );
    });
  };

  const renderVolume = () => {
    if (!showVolume) return null;

    const visibleData = data.slice(0, Math.ceil(data.length * animationProgress));

    return visibleData.map((d, i) => {
      const x = padding.left + i * (chartWidth / data.length);
      const barHeight = (d.volume / maxVolume) * volumeHeight;
      const candleColor = getColor(d.open, d.close);

      return (
        <rect
          key={`vol-${i}`}
          x={x}
          y={height - padding.bottom + 5 - barHeight}
          width={candleWidth}
          height={barHeight}
          fill={candleColor}
          opacity="0.3"
          rx="1"
        />
      );
    });
  };

  const renderGrid = () => {
    if (!showGrid) return null;

    const gridLines = 4;
    const lines = [];

    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      lines.push(
        <line
          key={`grid-${i}`}
          x1={padding.left}
          y1={y}
          x2={width - padding.right}
          y2={y}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="4,4"
          opacity="0.3"
        />
      );
    }

    return lines;
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full h-auto", className)}
      style={{ maxWidth: width }}
    >
      {/* Background */}
      <rect x="0" y="0" width={width} height={height} fill="transparent" />

      {/* Grid */}
      {renderGrid()}

      {/* Main chart */}
      {renderChart()}

      {/* Volume */}
      {renderVolume()}
    </svg>
  );
}

// Easing function
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Mini sparkline version
export function SparklineChart({
  data,
  className,
  color = "green",
  width = 100,
  height = 30,
}: {
  data?: number[];
  className?: string;
  color?: "green" | "red" | "cyan";
  width?: number;
  height?: number;
}) {
  const chartData = useMemo(() => {
    if (data && data.length > 0) return data;
    // Generate random data if none provided
    const generated = [];
    let value = 50;
    for (let i = 0; i < 20; i++) {
      value += (Math.random() - 0.5) * 10;
      generated.push(Math.max(0, value));
    }
    return generated;
  }, [data]);

  const min = Math.min(...chartData);
  const max = Math.max(...chartData);
  const range = max - min || 1;

  const points = chartData.map((value, i) => {
    const x = (i / (chartData.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });

  const lineColor = color === "red" ? "#ef4444" : color === "cyan" ? "#22d3ee" : "#10b981";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full h-auto", className)}
      style={{ maxWidth: width }}
    >
      <defs>
        <linearGradient id={`sparkGradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M0,${height} L${points.join(" L")} L${width},${height} Z`}
        fill={`url(#sparkGradient-${color})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Live-updating chart for hero section
export function LiveChart({
  className,
  symbol = "AAPL",
}: {
  className?: string;
  symbol?: string;
}) {
  const [data, setData] = useState<number[]>([]);

  useEffect(() => {
    // Initialize with some data
    const initial = [];
    let value = 150 + Math.random() * 20;
    for (let i = 0; i < 50; i++) {
      value += (Math.random() - 0.48) * 2;
      initial.push(value);
    }
    setData(initial);

    // Update periodically
    const interval = setInterval(() => {
      setData((prev) => {
        const newValue = prev[prev.length - 1] + (Math.random() - 0.48) * 1.5;
        return [...prev.slice(1), newValue];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const isUp = data.length > 1 && data[data.length - 1] > data[0];
  const change = data.length > 1 ? ((data[data.length - 1] - data[0]) / data[0]) * 100 : 0;

  return (
    <div className={cn("relative", className)}>
      {/* Symbol label */}
      <div className="absolute top-2 left-3 z-10">
        <span className="text-sm font-mono font-bold text-white">{symbol}</span>
        <span
          className={cn(
            "ml-2 text-xs font-mono",
            isUp ? "text-emerald-400" : "text-red-400"
          )}
        >
          {isUp ? "+" : ""}
          {safeToFixed(change, 2)}%
        </span>
      </div>

      {/* Chart */}
      <AnimatedChart
        variant="area"
        color={isUp ? "green" : "red"}
        height={150}
        width={300}
        animated={false}
        showVolume={false}
        showGrid={false}
      />
    </div>
  );
}
