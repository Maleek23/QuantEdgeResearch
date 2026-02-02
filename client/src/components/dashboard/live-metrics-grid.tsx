/**
 * LIVE METRICS GRID
 *
 * Real-time animated metrics cards with glassmorphism design
 * Inspired by intellectia.ai's stunning dashboard
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { safeToFixed } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  DollarSign,
  Percent,
  BarChart3,
  Zap,
  Brain,
  Shield,
} from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
  isLive?: boolean;
  sparklineData?: number[];
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="w-full h-8 mt-2" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polygon
        points={`0,100 ${points} 100,100`}
        fill={`url(#gradient-${color.replace('#', '')})`}
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  color,
  trend = 'neutral',
  isLive = false,
  sparklineData,
}: MetricCardProps) {
  const [displayValue, setDisplayValue] = useState(value);

  // Animate value changes
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${color}10, ${color}05)`,
        border: `1px solid ${color}30`,
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{
        scale: 1.02,
        boxShadow: `0 20px 40px ${color}20`,
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Glow effect */}
      <div
        className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-30"
        style={{ background: color }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div
          className="p-2 rounded-xl"
          style={{ background: `${color}20` }}
        >
          <div style={{ color }}>{icon}</div>
        </div>

        {isLive && (
          <div className="flex items-center gap-1.5">
            <motion.div
              className="w-2 h-2 rounded-full bg-green-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-xs text-green-500 font-medium">LIVE</span>
          </div>
        )}
      </div>

      {/* Title */}
      <p className="text-sm text-gray-400 mb-1">{title}</p>

      {/* Value */}
      <motion.div
        className="text-2xl font-bold text-white"
        key={String(displayValue)}
        initial={{ opacity: 0.5, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {displayValue}
      </motion.div>

      {/* Change indicator */}
      {change !== undefined && (
        <div className="flex items-center gap-2 mt-2">
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              trend === 'up'
                ? 'bg-green-500/20 text-green-400'
                : trend === 'down'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {trend === 'up' ? (
              <TrendingUp className="w-3 h-3" />
            ) : trend === 'down' ? (
              <TrendingDown className="w-3 h-3" />
            ) : null}
            {change > 0 ? '+' : ''}
            {safeToFixed(change, 1)}%
          </div>
          {changeLabel && (
            <span className="text-xs text-gray-500">{changeLabel}</span>
          )}
        </div>
      )}

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <MiniSparkline data={sparklineData} color={color} />
      )}
    </motion.div>
  );
}

export function LiveMetricsGrid() {
  const [metrics, setMetrics] = useState({
    winRate: 58.4,
    totalPnL: 12847,
    activePositions: 7,
    avgRR: 2.3,
    todayTrades: 12,
    aiConfidence: 82,
  });

  const [sparklines, setSparklines] = useState<Record<string, number[]>>({
    winRate: [52, 54, 56, 55, 58, 57, 58.4],
    pnl: [10000, 10500, 11200, 11800, 12100, 12500, 12847],
    trades: [8, 10, 9, 11, 10, 12, 12],
  });

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        winRate: prev.winRate + (Math.random() - 0.5) * 0.5,
        totalPnL: prev.totalPnL + Math.floor((Math.random() - 0.3) * 100),
        aiConfidence: Math.min(100, Math.max(60, prev.aiConfidence + (Math.random() - 0.5) * 2)),
      }));

      // Update sparklines
      setSparklines(prev => ({
        winRate: [...prev.winRate.slice(-6), metrics.winRate],
        pnl: [...prev.pnl.slice(-6), metrics.totalPnL],
        trades: prev.trades,
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, [metrics]);

  const cards: MetricCardProps[] = [
    {
      title: 'Win Rate',
      value: `${safeToFixed(metrics.winRate, 1)}%`,
      change: 3.2,
      changeLabel: 'vs last week',
      icon: <Target className="w-5 h-5" />,
      color: '#10B981',
      trend: 'up',
      isLive: true,
      sparklineData: sparklines.winRate,
    },
    {
      title: 'Total P&L',
      value: `$${metrics.totalPnL.toLocaleString()}`,
      change: 8.7,
      changeLabel: 'this month',
      icon: <DollarSign className="w-5 h-5" />,
      color: '#3B82F6',
      trend: 'up',
      isLive: true,
      sparklineData: sparklines.pnl,
    },
    {
      title: 'Active Positions',
      value: metrics.activePositions,
      icon: <Activity className="w-5 h-5" />,
      color: '#8B5CF6',
      isLive: true,
    },
    {
      title: 'Avg Risk/Reward',
      value: `${safeToFixed(metrics.avgRR, 1)}:1`,
      change: 0.3,
      changeLabel: 'improvement',
      icon: <BarChart3 className="w-5 h-5" />,
      color: '#F59E0B',
      trend: 'up',
    },
    {
      title: "Today's Trades",
      value: metrics.todayTrades,
      icon: <Zap className="w-5 h-5" />,
      color: '#EC4899',
      sparklineData: sparklines.trades,
    },
    {
      title: 'AI Confidence',
      value: `${safeToFixed(metrics.aiConfidence, 0)}%`,
      change: 5,
      changeLabel: 'learning rate',
      icon: <Brain className="w-5 h-5" />,
      color: '#6366F1',
      trend: 'up',
      isLive: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <MetricCard {...card} />
        </motion.div>
      ))}
    </div>
  );
}

export default LiveMetricsGrid;
