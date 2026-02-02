import { useState } from "react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Calendar, Activity } from "lucide-react";
import { safeToFixed } from "@/lib/utils";

interface PerformanceDataPoint {
  date: string;
  winRate: number;
  profit: number;
  trades: number;
}

interface InteractivePerformanceChartProps {
  data: PerformanceDataPoint[];
  title?: string;
  timeframe?: "7D" | "30D" | "90D" | "1Y";
}

export function InteractivePerformanceChart({
  data,
  title = "Performance Overview",
  timeframe = "30D"
}: InteractivePerformanceChartProps) {
  const [activeMetric, setActiveMetric] = useState<"winRate" | "profit">("winRate");
  const [hoveredPoint, setHoveredPoint] = useState<PerformanceDataPoint | null>(null);

  const metrics = [
    { key: "winRate", label: "Win Rate", icon: Activity, color: "#06b6d4", unit: "%" },
    { key: "profit", label: "P&L", icon: TrendingUp, color: "#10b981", unit: "$" },
  ];

  const currentValue = hoveredPoint
    ? hoveredPoint[activeMetric]
    : data[data.length - 1]?.[activeMetric] || 0;

  const previousValue = data[data.length - 2]?.[activeMetric] || 0;
  const change = currentValue - previousValue;
  const changePercent = previousValue !== 0 ? safeToFixed((change / previousValue) * 100, 1) : "0.0";
  const isPositive = change >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-6 border border-slate-800"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold mb-1">{title}</h3>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold font-mono tabular-nums">
              {activeMetric === "winRate" ? `${safeToFixed(currentValue, 1)}%` : `$${safeToFixed(currentValue, 0)}`}
            </span>
            <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              <span>{isPositive ? '+' : ''}{changePercent}%</span>
            </div>
          </div>
        </div>

        {/* Metric Toggle */}
        <div className="flex gap-2">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const isActive = activeMetric === metric.key;
            return (
              <button
                key={metric.key}
                onClick={() => setActiveMetric(metric.key as "winRate" | "profit")}
                className={`relative px-3 py-2 rounded-lg transition-all ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'hover:bg-slate-800 text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {isActive && (
                  <motion.div
                    layoutId="activeMetric"
                    className="absolute inset-0 bg-cyan-500/10 rounded-lg"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            onMouseMove={(e) => {
              if (e.activePayload) {
                setHoveredPoint(e.activePayload[0].payload);
              }
            }}
            onMouseLeave={() => setHoveredPoint(null)}
          >
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={activeMetric === "winRate" ? "#06b6d4" : "#10b981"}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={activeMetric === "winRate" ? "#06b6d4" : "#10b981"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const data = payload[0].payload;
                return (
                  <div className="glass-card border border-slate-700 rounded-lg p-3 shadow-xl">
                    <p className="text-xs text-muted-foreground mb-2">{data.date}</p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-muted-foreground">Win Rate</span>
                        <span className="text-sm font-semibold text-cyan-400">{safeToFixed(data.winRate, 1)}%</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-muted-foreground">P&L</span>
                        <span className={`text-sm font-semibold ${data.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${safeToFixed(data.profit, 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs text-muted-foreground">Trades</span>
                        <span className="text-sm font-semibold">{data.trades}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
              cursor={{ stroke: '#06b6d4', strokeWidth: 1, strokeDasharray: '5 5' }}
            />
            <Area
              type="monotone"
              dataKey={activeMetric}
              stroke={activeMetric === "winRate" ? "#06b6d4" : "#10b981"}
              strokeWidth={2}
              fill="url(#colorValue)"
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-slate-800">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
          <p className="text-lg font-bold font-mono tabular-nums">
            {data.reduce((sum, d) => sum + d.trades, 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Avg Win Rate</p>
          <p className="text-lg font-bold font-mono tabular-nums text-cyan-400">
            {safeToFixed(data.reduce((sum, d) => sum + d.winRate, 0) / data.length, 1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
          <p className={`text-lg font-bold font-mono tabular-nums ${
            data.reduce((sum, d) => sum + d.profit, 0) >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            ${safeToFixed(data.reduce((sum, d) => sum + d.profit, 0), 0)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
