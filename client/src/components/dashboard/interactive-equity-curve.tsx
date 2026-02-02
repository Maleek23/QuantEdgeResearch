/**
 * INTERACTIVE EQUITY CURVE
 *
 * Stunning animated equity curve chart with glassmorphism design
 * Inspired by intellectia.ai's interactive charts
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Percent, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { safeToFixed } from '@/lib/utils';

interface EquityDataPoint {
  date: string;
  equity: number;
  drawdown: number;
  trades: number;
}

type TimeRange = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

// Generate sample data
function generateEquityData(days: number): EquityDataPoint[] {
  const data: EquityDataPoint[] = [];
  let equity = 10000;
  let peak = equity;

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    // Simulate realistic equity curve with occasional drawdowns
    const dailyReturn = (Math.random() - 0.45) * 0.03; // Slight upward bias
    equity = Math.max(5000, equity * (1 + dailyReturn));
    peak = Math.max(peak, equity);
    const drawdown = ((peak - equity) / peak) * 100;

    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      equity: Math.round(equity),
      drawdown: parseFloat(safeToFixed(drawdown, 2)),
      trades: Math.floor(Math.random() * 5),
    });
  }

  return data;
}

const TIME_RANGES: { label: TimeRange; days: number }[] = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: 'ALL', days: 730 },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/95 backdrop-blur-xl border border-gray-700/50 rounded-xl p-4 shadow-2xl"
    >
      <p className="text-gray-400 text-xs mb-2">{label}</p>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <span className="text-white font-semibold">
            ${data.equity.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-red-400" />
          <span className="text-gray-300 text-sm">
            Drawdown: {data.drawdown}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <span className="text-gray-300 text-sm">
            Trades: {data.trades}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export function InteractiveEquityCurve() {
  const [timeRange, setTimeRange] = useState<TimeRange>('3M');
  const [isHovered, setIsHovered] = useState(false);

  const selectedRange = TIME_RANGES.find(r => r.label === timeRange)!;
  const data = useMemo(() => generateEquityData(selectedRange.days), [selectedRange.days]);

  // Calculate metrics
  const startEquity = data[0]?.equity || 10000;
  const endEquity = data[data.length - 1]?.equity || 10000;
  const totalReturn = ((endEquity - startEquity) / startEquity) * 100;
  const maxDrawdown = Math.max(...data.map(d => d.drawdown));
  const totalTrades = data.reduce((sum, d) => sum + d.trades, 0);

  const isPositive = totalReturn >= 0;
  const gradientId = 'equityGradient';

  return (
    <Card className="bg-gray-900/50 border-gray-800 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Equity Curve
            <Badge className={`ml-2 ${isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {isPositive ? '+' : ''}{safeToFixed(totalReturn, 1)}%
            </Badge>
          </CardTitle>

          {/* Time Range Selector */}
          <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1">
            {TIME_RANGES.map(({ label }) => (
              <Button
                key={label}
                variant="ghost"
                size="sm"
                onClick={() => setTimeRange(label)}
                className={`h-7 px-3 text-xs font-medium transition-all ${
                  timeRange === label
                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="text-center p-3 bg-gray-800/30 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">Current Value</p>
            <p className="text-lg font-bold text-white">${endEquity.toLocaleString()}</p>
          </div>
          <div className="text-center p-3 bg-gray-800/30 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">Total Return</p>
            <p className={`text-lg font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{safeToFixed(totalReturn, 1)}%
            </p>
          </div>
          <div className="text-center p-3 bg-gray-800/30 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">Max Drawdown</p>
            <p className="text-lg font-bold text-red-400">-{safeToFixed(maxDrawdown, 1)}%</p>
          </div>
          <div className="text-center p-3 bg-gray-800/30 rounded-xl">
            <p className="text-xs text-gray-500 mb-1">Total Trades</p>
            <p className="text-lg font-bold text-blue-400">{totalTrades}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div
          className="h-[300px] relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Glow effect on hover */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent pointer-events-none rounded-xl"
              />
            )}
          </AnimatePresence>

          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity={0.4} />
                  <stop offset="50%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={isPositive ? '#10B981' : '#EF4444'} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />

              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                interval="preserveStartEnd"
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 11 }}
                tickFormatter={(value) => `$${safeToFixed(value / 1000, 0)}k`}
                domain={['dataMin - 500', 'dataMax + 500']}
              />

              <Tooltip content={<CustomTooltip />} />

              <ReferenceLine
                y={startEquity}
                stroke="#6B7280"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />

              <Area
                type="monotone"
                dataKey="equity"
                stroke={isPositive ? '#10B981' : '#EF4444'}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                animationDuration={1500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default InteractiveEquityCurve;
