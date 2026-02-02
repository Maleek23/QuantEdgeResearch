/**
 * TRADING SIGNALS FEED
 *
 * Real-time animated feed showing AI-generated trading signals
 * with confidence scores and engine attribution
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { safeToFixed } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Brain,
  Activity,
  Shield,
  Target,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TradingSignal {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  engine: string;
  engineColor: string;
  price: number;
  target: number;
  stopLoss: number;
  timestamp: Date;
  reason: string;
}

const ENGINE_COLORS: Record<string, string> = {
  'Trading Engine': '#8B5CF6',
  'Quantitative': '#3B82F6',
  'Risk Engine': '#10B981',
  'Mean Reversion': '#F59E0B',
  'Confluence': '#EC4899',
  'Lotto Scanner': '#EF4444',
};

const SAMPLE_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ'];
const ENGINE_NAMES = Object.keys(ENGINE_COLORS);

function generateSignal(): TradingSignal {
  const symbol = SAMPLE_SYMBOLS[Math.floor(Math.random() * SAMPLE_SYMBOLS.length)];
  const engine = ENGINE_NAMES[Math.floor(Math.random() * ENGINE_NAMES.length)];
  const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
  const basePrice = 100 + Math.random() * 400;
  const confidence = 55 + Math.floor(Math.random() * 40);

  return {
    id: Math.random().toString(36).substring(7),
    symbol,
    direction,
    confidence,
    engine,
    engineColor: ENGINE_COLORS[engine],
    price: parseFloat(safeToFixed(basePrice, 2)),
    target: parseFloat(safeToFixed(basePrice * (direction === 'LONG' ? 1.05 : 0.95), 2)),
    stopLoss: parseFloat(safeToFixed(basePrice * (direction === 'LONG' ? 0.97 : 1.03), 2)),
    timestamp: new Date(),
    reason: getRandomReason(direction),
  };
}

function getRandomReason(direction: string): string {
  const bullishReasons = [
    'RSI oversold + MACD crossover',
    'Breakout above resistance with volume',
    'Bullish engulfing on daily',
    'Golden cross forming',
    'Support level bounce confirmed',
  ];
  const bearishReasons = [
    'RSI overbought + divergence',
    'Breakdown below support',
    'Bearish engulfing pattern',
    'Death cross forming',
    'Resistance rejection + volume spike',
  ];
  const reasons = direction === 'LONG' ? bullishReasons : bearishReasons;
  return reasons[Math.floor(Math.random() * reasons.length)];
}

function SignalCard({ signal, isNew }: { signal: TradingSignal; isNew: boolean }) {
  const isLong = signal.direction === 'LONG';
  const riskReward = Math.abs(signal.target - signal.price) / Math.abs(signal.price - signal.stopLoss);

  return (
    <motion.div
      initial={{ opacity: 0, x: -50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={`relative p-4 rounded-xl border transition-all ${
        isNew
          ? 'bg-gradient-to-r from-purple-500/10 to-transparent border-purple-500/30'
          : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600/50'
      }`}
    >
      {/* New indicator */}
      {isNew && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1"
        >
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
          </span>
        </motion.div>
      )}

      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Symbol & Direction */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl font-bold text-white">{signal.symbol}</span>
            <Badge
              className={`${
                isLong
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/20 text-red-400 border-red-500/30'
              }`}
            >
              {isLong ? (
                <TrendingUp className="w-3 h-3 mr-1" />
              ) : (
                <TrendingDown className="w-3 h-3 mr-1" />
              )}
              {signal.direction}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs"
              style={{ borderColor: signal.engineColor, color: signal.engineColor }}
            >
              {signal.engine}
            </Badge>
          </div>

          {/* Reason */}
          <p className="text-sm text-gray-400 mb-3">{signal.reason}</p>

          {/* Price Targets */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Entry</p>
              <p className="text-white font-medium">${signal.price}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Target</p>
              <p className="text-emerald-400 font-medium">${signal.target}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Stop</p>
              <p className="text-red-400 font-medium">${signal.stopLoss}</p>
            </div>
          </div>
        </div>

        {/* Confidence Ring */}
        <div className="ml-4 flex flex-col items-center">
          <div className="relative w-16 h-16">
            <svg className="w-full h-full -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke="#374151"
                strokeWidth="4"
              />
              <motion.circle
                cx="32"
                cy="32"
                r="26"
                fill="none"
                stroke={signal.confidence >= 75 ? '#10B981' : signal.confidence >= 60 ? '#F59E0B' : '#EF4444'}
                strokeWidth="4"
                strokeLinecap="round"
                initial={{ strokeDasharray: '0 163.4' }}
                animate={{ strokeDasharray: `${(signal.confidence / 100) * 163.4} 163.4` }}
                transition={{ duration: 1 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-white">{signal.confidence}</span>
              <span className="text-[10px] text-gray-500">CONF</span>
            </div>
          </div>

          <div className="mt-2 text-center">
            <p className="text-xs text-gray-500">R:R</p>
            <p className="text-sm font-medium text-blue-400">{safeToFixed(riskReward, 1)}:1</p>
          </div>
        </div>
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-1 mt-3 text-xs text-gray-500">
        <Clock className="w-3 h-3" />
        {signal.timestamp.toLocaleTimeString()}
      </div>
    </motion.div>
  );
}

export function TradingSignalsFeed() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [newSignalId, setNewSignalId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize with some signals
  useEffect(() => {
    const initialSignals = Array.from({ length: 3 }, () => generateSignal());
    setSignals(initialSignals);
  }, []);

  // Add new signals periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const newSignal = generateSignal();
      setNewSignalId(newSignal.id);
      setSignals(prev => [newSignal, ...prev.slice(0, 9)]);

      // Clear new indicator after 3 seconds
      setTimeout(() => setNewSignalId(null), 3000);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const highConfidenceCount = signals.filter(s => s.confidence >= 75).length;
  const longCount = signals.filter(s => s.direction === 'LONG').length;

  return (
    <Card className="bg-gray-900/50 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Zap className="w-5 h-5 text-yellow-400" />
            Live Trading Signals
            <motion.div
              className="w-2 h-2 rounded-full bg-green-500 ml-2"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </CardTitle>

          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="bg-gray-800/50">
              {signals.length} Active
            </Badge>
            <Badge className="bg-emerald-500/20 text-emerald-400">
              {highConfidenceCount} High Conf
            </Badge>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-400">{longCount} Long</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-gray-400">{signals.length - longCount} Short</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div
          ref={containerRef}
          className="space-y-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
        >
          <AnimatePresence mode="popLayout">
            {signals.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal}
                isNew={signal.id === newSignalId}
              />
            ))}
          </AnimatePresence>
        </div>

        {signals.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Waiting for signals...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TradingSignalsFeed;
