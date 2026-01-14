/**
 * MARKET PULSE WIDGET
 *
 * Real-time market sentiment and key metrics visualization
 * with animated gauges and live updates
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Gauge,
  AlertTriangle,
  Flame,
  Snowflake,
  Waves,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MarketMetric {
  label: string;
  value: number;
  change: number;
  icon: React.ReactNode;
}

interface SentimentGaugeProps {
  value: number; // 0-100, 50 = neutral
  label: string;
}

function SentimentGauge({ value, label }: SentimentGaugeProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const angle = (normalizedValue / 100) * 180 - 90;

  const getSentimentColor = (val: number) => {
    if (val >= 70) return '#10B981'; // Bullish green
    if (val >= 55) return '#84CC16'; // Slightly bullish
    if (val >= 45) return '#6B7280'; // Neutral gray
    if (val >= 30) return '#F59E0B'; // Slightly bearish
    return '#EF4444'; // Bearish red
  };

  const getSentimentLabel = (val: number) => {
    if (val >= 70) return 'Bullish';
    if (val >= 55) return 'Slightly Bullish';
    if (val >= 45) return 'Neutral';
    if (val >= 30) return 'Slightly Bearish';
    return 'Bearish';
  };

  const color = getSentimentColor(normalizedValue);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-16 overflow-hidden">
        {/* Background arc */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="25%" stopColor="#F59E0B" />
              <stop offset="50%" stopColor="#6B7280" />
              <stop offset="75%" stopColor="#84CC16" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
          </defs>

          {/* Background arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#374151"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Colored arc */}
          <motion.path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: normalizedValue / 100 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>

        {/* Needle */}
        <motion.div
          className="absolute bottom-0 left-1/2 origin-bottom"
          style={{ width: '2px', height: '32px' }}
          initial={{ rotate: -90 }}
          animate={{ rotate: angle }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          <div
            className="w-full h-full rounded-full"
            style={{ background: `linear-gradient(to top, ${color}, ${color}80)` }}
          />
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
        </motion.div>
      </div>

      {/* Label */}
      <div className="mt-2 text-center">
        <p className="text-xs text-gray-500">{label}</p>
        <motion.p
          className="text-lg font-bold"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          key={normalizedValue}
        >
          {getSentimentLabel(normalizedValue)}
        </motion.p>
        <p className="text-sm text-gray-400">{normalizedValue.toFixed(0)}%</p>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  change,
  icon,
}: MarketMetric) {
  const isPositive = change >= 0;

  return (
    <motion.div
      className="p-3 bg-gray-800/30 rounded-xl hover:bg-gray-800/50 transition-colors"
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="text-gray-400">{icon}</div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold text-white">{value.toLocaleString()}</span>
        <span
          className={`text-xs font-medium flex items-center gap-1 ${
            isPositive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isPositive ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
    </motion.div>
  );
}

function HeatBar({
  label,
  bullish,
  bearish,
}: {
  label: string;
  bullish: number;
  bearish: number;
}) {
  const total = bullish + bearish;
  const bullishPercent = (bullish / total) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <div className="flex items-center gap-4">
          <span className="text-emerald-400">{bullish} Bull</span>
          <span className="text-red-400">{bearish} Bear</span>
        </div>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden flex">
        <motion.div
          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400"
          initial={{ width: 0 }}
          animate={{ width: `${bullishPercent}%` }}
          transition={{ duration: 1 }}
        />
        <motion.div
          className="h-full bg-gradient-to-r from-red-400 to-red-600"
          initial={{ width: 0 }}
          animate={{ width: `${100 - bullishPercent}%` }}
          transition={{ duration: 1 }}
        />
      </div>
    </div>
  );
}

export function MarketPulseWidget() {
  const [sentiment, setSentiment] = useState(55);
  const [vix, setVix] = useState({ value: 18.5, change: -2.3 });
  const [putCall, setPutCall] = useState({ value: 0.85, change: 0.05 });
  const [advDecline, setAdvDecline] = useState({ advancing: 285, declining: 215 });
  const [volumeRatio, setVolumeRatio] = useState(1.2);

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setSentiment(prev => Math.min(100, Math.max(0, prev + (Math.random() - 0.5) * 5)));
      setVix(prev => ({
        value: Math.max(10, Math.min(40, prev.value + (Math.random() - 0.5) * 2)),
        change: (Math.random() - 0.5) * 5,
      }));
      setPutCall(prev => ({
        value: Math.max(0.5, Math.min(1.5, prev.value + (Math.random() - 0.5) * 0.1)),
        change: (Math.random() - 0.5) * 0.2,
      }));
      setAdvDecline({
        advancing: 200 + Math.floor(Math.random() * 150),
        declining: 200 + Math.floor(Math.random() * 150),
      });
      setVolumeRatio(0.8 + Math.random() * 0.8);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const getVixStatus = (value: number) => {
    if (value < 15) return { label: 'Calm', color: 'text-emerald-400', icon: <Snowflake className="w-4 h-4" /> };
    if (value < 20) return { label: 'Normal', color: 'text-blue-400', icon: <Waves className="w-4 h-4" /> };
    if (value < 30) return { label: 'Elevated', color: 'text-yellow-400', icon: <AlertTriangle className="w-4 h-4" /> };
    return { label: 'Fear', color: 'text-red-400', icon: <Flame className="w-4 h-4" /> };
  };

  const vixStatus = getVixStatus(vix.value);

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Activity className="w-5 h-5 text-cyan-400" />
          Market Pulse
          <motion.div
            className="w-2 h-2 rounded-full bg-cyan-500 ml-2"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <Badge className="ml-auto bg-gray-800/50 text-gray-400">
            Live
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Main Sentiment Gauge */}
        <div className="flex justify-center">
          <SentimentGauge value={sentiment} label="Overall Market Sentiment" />
        </div>

        {/* VIX Status */}
        <div className="p-4 bg-gray-800/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Gauge className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">VIX (Fear Index)</p>
                <p className="text-xl font-bold text-white">{vix.value.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className={`flex items-center gap-1 ${vixStatus.color}`}>
                {vixStatus.icon}
                <span className="font-medium">{vixStatus.label}</span>
              </div>
              <span
                className={`text-xs ${
                  vix.change >= 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {vix.change >= 0 ? '+' : ''}{vix.change.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Mini Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <MiniMetric
            label="Put/Call Ratio"
            value={parseFloat(putCall.value.toFixed(2))}
            change={putCall.change}
            icon={<BarChart3 className="w-4 h-4" />}
          />
          <MiniMetric
            label="Volume Ratio"
            value={parseFloat(volumeRatio.toFixed(2))}
            change={(volumeRatio - 1) * 100}
            icon={<Activity className="w-4 h-4" />}
          />
        </div>

        {/* Advance/Decline Bars */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-400">Market Breadth</h4>
          <HeatBar
            label="S&P 500"
            bullish={advDecline.advancing}
            bearish={advDecline.declining}
          />
          <HeatBar
            label="NASDAQ"
            bullish={Math.floor(advDecline.advancing * 0.9)}
            bearish={Math.floor(advDecline.declining * 1.1)}
          />
          <HeatBar
            label="Russell 2000"
            bullish={Math.floor(advDecline.advancing * 1.1)}
            bearish={Math.floor(advDecline.declining * 0.9)}
          />
        </div>

        {/* Sector Heat */}
        <div className="grid grid-cols-4 gap-2 pt-2">
          {[
            { label: 'Tech', value: 2.3, color: 'emerald' },
            { label: 'Finance', value: -0.8, color: 'red' },
            { label: 'Energy', value: 1.5, color: 'emerald' },
            { label: 'Health', value: 0.2, color: 'emerald' },
          ].map(sector => (
            <motion.div
              key={sector.label}
              className={`p-2 rounded-lg text-center ${
                sector.value >= 0
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}
              whileHover={{ scale: 1.05 }}
            >
              <p className="text-[10px] text-gray-400">{sector.label}</p>
              <p
                className={`text-sm font-bold ${
                  sector.value >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {sector.value >= 0 ? '+' : ''}{sector.value}%
              </p>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default MarketPulseWidget;
