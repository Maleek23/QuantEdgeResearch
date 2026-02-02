/**
 * Interactive Price Chart Component
 * Professional chart with technical indicators and event markers
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  Volume2,
  Zap,
  Calendar,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState, useMemo } from "react";

interface PriceDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalIndicator {
  name: string;
  value: number;
  signal: "bullish" | "bearish" | "neutral";
  description: string;
}

interface EventMarker {
  date: string;
  type: "earnings" | "dividend" | "split" | "news";
  label: string;
  impact: "positive" | "negative" | "neutral";
}

interface InteractivePriceChartProps {
  symbol: string;
  data: PriceDataPoint[];
  indicators?: TechnicalIndicator[];
  events?: EventMarker[];
  className?: string;
}

export function InteractivePriceChart({
  symbol,
  data,
  indicators = [],
  events = [],
  className,
}: InteractivePriceChartProps) {
  const [timeframe, setTimeframe] = useState<"1D" | "1W" | "1M" | "3M" | "1Y" | "ALL">("1M");
  const [showVolume, setShowVolume] = useState(true);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(["RSI", "MACD"]);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data?: any } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Get latest price and change
  const latestData = data[data.length - 1];
  const previousData = data[data.length - 2];
  const priceChange = latestData ? latestData.close - previousData?.close : 0;
  const priceChangePercent = previousData
    ? ((priceChange / previousData.close) * 100)
    : 0;
  const isPositive = priceChange >= 0;

  const timeframes = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;

  const availableIndicators = [
    { id: "RSI", name: "RSI (14)", color: "text-purple-400" },
    { id: "MACD", name: "MACD", color: "text-cyan-400" },
    { id: "MA50", name: "MA 50", color: "text-amber-400" },
    { id: "MA200", name: "MA 200", color: "text-emerald-400" },
    { id: "BB", name: "Bollinger Bands", color: "text-blue-400" },
  ];

  const toggleIndicator = (id: string) => {
    setSelectedIndicators((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <Card className={cn("p-6 bg-slate-900/90 border-slate-800", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-800/50">
            <BarChart3 className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-100">Price Chart</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-slate-100">
                ${safeToFixed(latestData?.close, 2)}
              </span>
              <div
                className={cn(
                  "flex items-center gap-1 text-sm font-semibold",
                  isPositive ? "text-emerald-400" : "text-red-400"
                )}
              >
                {isPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>
                  {isPositive ? "+" : ""}
                  {safeToFixed(priceChange, 2)} ({isPositive ? "+" : ""}
                  {safeToFixed(priceChangePercent, 2)}%)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "px-3 py-1 rounded text-xs font-semibold transition-colors",
                timeframe === tf
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "text-slate-500 hover:text-slate-300"
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Drawing Tools */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
          <button
            onClick={() => setIsDrawing(false)}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-semibold transition-all",
              !isDrawing ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-300"
            )}
          >
            👆 Select
          </button>
          <button
            onClick={() => setIsDrawing(true)}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-semibold transition-all",
              isDrawing ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-300"
            )}
          >
            ✏️ Draw
          </button>
        </div>
        <div className="flex-1" />
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all">
          📏 Measure
        </button>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all">
          🔍 Zoom
        </button>
        <button className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all">
          🔄 Reset
        </button>
      </div>

      {/* Chart Placeholder (Would integrate with recharts/tradingview) */}
      <div
        className="relative h-96 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg border border-slate-700 mb-4 overflow-hidden cursor-crosshair group"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          setHoveredPoint({ x, y, data: latestData });
        }}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-10">
          <div className="w-full h-full grid grid-cols-8 grid-rows-5">
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="border border-slate-600" />
            ))}
          </div>
        </div>

        {/* Crosshair */}
        {hoveredPoint && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute w-full h-px bg-cyan-500/30"
              style={{ top: hoveredPoint.y }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute h-full w-px bg-cyan-500/30"
              style={{ left: hoveredPoint.x }}
            />

            {/* Hover tooltip */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute bg-slate-900 border border-cyan-500/30 rounded-lg p-3 shadow-xl pointer-events-none z-20"
              style={{
                left: Math.min(hoveredPoint.x + 10, window.innerWidth - 200),
                top: Math.max(hoveredPoint.y - 80, 10),
              }}
            >
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Price:</span>
                  <span className="font-mono font-bold text-cyan-400">${safeToFixed(latestData?.close, 2)}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Change:</span>
                  <span className={cn("font-mono font-semibold", isPositive ? "text-emerald-400" : "text-red-400")}>
                    {isPositive ? "+" : ""}{safeToFixed(priceChange, 2)} ({isPositive ? "+" : ""}{safeToFixed(priceChangePercent, 2)}%)
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Volume:</span>
                  <span className="font-mono text-slate-300">{safeToFixed(safeNumber(latestData?.volume) / 1000000, 2)}M</span>
                </div>
              </div>
            </motion.div>
          </>
        )}

        {/* Chart visualization placeholder */}
        <div className="absolute inset-0 flex items-center justify-center opacity-50 group-hover:opacity-30 transition-opacity">
          <div className="text-center space-y-2">
            <Activity className="h-12 w-12 text-slate-700 mx-auto animate-pulse" />
            <p className="text-sm text-slate-600 font-semibold">
              Interactive Chart Ready
            </p>
            <p className="text-xs text-slate-700">
              Hover to see crosshair • Click to analyze
            </p>
          </div>
        </div>

        {/* Event markers (sample positions) */}
        {events.slice(0, 3).map((event, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
            className="absolute"
            style={{
              left: `${20 + idx * 30}%`,
              top: `${30 + idx * 10}%`,
            }}
          >
            <div className="relative group">
              <div
                className={cn(
                  "w-3 h-3 rounded-full border-2",
                  event.impact === "positive"
                    ? "bg-emerald-500 border-emerald-400"
                    : event.impact === "negative"
                    ? "bg-red-500 border-red-400"
                    : "bg-amber-500 border-amber-400"
                )}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-2 whitespace-nowrap shadow-xl">
                  <p className="text-xs font-semibold text-slate-100">
                    {event.label}
                  </p>
                  <p className="text-xs text-slate-500">{event.date}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Indicator Selector */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-400">
            Technical Indicators
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {availableIndicators.map((indicator) => (
            <button
              key={indicator.id}
              onClick={() => toggleIndicator(indicator.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                selectedIndicators.includes(indicator.id)
                  ? "bg-slate-800 border-cyan-500/30 text-cyan-400"
                  : "bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600"
              )}
            >
              {indicator.name}
            </button>
          ))}
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
              showVolume
                ? "bg-slate-800 border-blue-500/30 text-blue-400"
                : "bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600"
            )}
          >
            <Volume2 className="h-3 w-3 inline mr-1" />
            Volume
          </button>
        </div>
      </div>

      {/* Indicator Values */}
      {indicators.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {indicators.map((indicator, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-lg p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">{indicator.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    indicator.signal === "bullish"
                      ? "text-emerald-400 border-emerald-500/30"
                      : indicator.signal === "bearish"
                      ? "text-red-400 border-red-500/30"
                      : "text-amber-400 border-amber-500/30"
                  )}
                >
                  {indicator.signal === "bullish" ? "↑" : indicator.signal === "bearish" ? "↓" : "→"}
                </Badge>
              </div>
              <div className="text-lg font-bold font-mono text-slate-100">
                {safeToFixed(indicator.value, 2)}
              </div>
              <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                {indicator.description}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Events Timeline */}
      {events.length > 0 && (
        <div className="mt-6 pt-6 border-t border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-400">
              Recent Events
            </span>
          </div>
          <div className="space-y-2">
            {events.slice(0, 4).map((event, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-lg p-2"
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    event.impact === "positive"
                      ? "bg-emerald-500"
                      : event.impact === "negative"
                      ? "bg-red-500"
                      : "bg-amber-500"
                  )}
                />
                <Badge
                  variant="outline"
                  className="text-xs text-slate-500 border-slate-700 shrink-0"
                >
                  {event.type}
                </Badge>
                <span className="text-sm text-slate-300 flex-1 truncate">
                  {event.label}
                </span>
                <span className="text-xs text-slate-600 shrink-0">
                  {event.date}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
