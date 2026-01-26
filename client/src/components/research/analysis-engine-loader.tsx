/**
 * Analysis Engine Loader
 * Shows real-time progress of all analysis engines running
 */

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  CheckCircle,
  Clock,
  Loader2,
  BarChart3,
  DollarSign,
  Brain,
  Newspaper,
  TrendingUp,
  Users,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EngineStatus {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'error';
  icon: React.ElementType;
  progress?: number;
}

interface AnalysisEngineLoaderProps {
  symbol: string;
  engines: EngineStatus[];
  overallProgress: number;
}

export function AnalysisEngineLoader({ symbol, engines, overallProgress }: AnalysisEngineLoaderProps) {
  const completedCount = engines.filter(e => e.status === 'done').length;
  const totalCount = engines.length;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl p-8 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 border-cyan-500/20">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
            }}
          >
            <h2 className="text-3xl font-bold text-slate-100 mb-2">
              Analyzing {symbol}
            </h2>
            <p className="text-sm text-slate-400">
              Running institutional-grade analysis engines
            </p>
          </motion.div>
        </div>

        {/* Engine Status List */}
        <div className="space-y-3 mb-8">
          {engines.map((engine, idx) => (
            <motion.div
              key={engine.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "flex items-center gap-4 p-4 rounded-lg border transition-all",
                engine.status === 'done' && "bg-emerald-950/20 border-emerald-500/30",
                engine.status === 'running' && "bg-cyan-950/20 border-cyan-500/30",
                engine.status === 'pending' && "bg-slate-900/50 border-slate-700/30",
                engine.status === 'error' && "bg-red-950/20 border-red-500/30"
              )}
            >
              {/* Icon */}
              <div className={cn(
                "shrink-0 p-2 rounded-lg",
                engine.status === 'done' && "bg-emerald-500/20",
                engine.status === 'running' && "bg-cyan-500/20",
                engine.status === 'pending' && "bg-slate-800",
                engine.status === 'error' && "bg-red-500/20"
              )}>
                <engine.icon className={cn(
                  "h-5 w-5",
                  engine.status === 'done' && "text-emerald-400",
                  engine.status === 'running' && "text-cyan-400",
                  engine.status === 'pending' && "text-slate-500",
                  engine.status === 'error' && "text-red-400"
                )} />
              </div>

              {/* Name and Description */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-semibold",
                  engine.status === 'done' && "text-emerald-300",
                  engine.status === 'running' && "text-cyan-300",
                  engine.status === 'pending' && "text-slate-400",
                  engine.status === 'error' && "text-red-300"
                )}>
                  {engine.name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {engine.description}
                </p>

                {/* Progress bar for running engines */}
                {engine.status === 'running' && engine.progress !== undefined && (
                  <div className="w-full bg-slate-800 rounded-full h-1 mt-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${engine.progress}%` }}
                      transition={{ duration: 0.3 }}
                      className="bg-cyan-500 h-1 rounded-full"
                    />
                  </div>
                )}
              </div>

              {/* Status Indicator */}
              <div className="shrink-0">
                {engine.status === 'done' && (
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                )}
                {engine.status === 'running' && (
                  <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
                )}
                {engine.status === 'pending' && (
                  <Clock className="h-5 w-5 text-slate-500" />
                )}
                {engine.status === 'error' && (
                  <span className="text-xs font-semibold text-red-400">Failed</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Overall Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">
              Overall Progress: {completedCount}/{totalCount} engines
            </span>
            <span className="font-mono font-semibold text-cyan-400">
              {Math.round(overallProgress)}%
            </span>
          </div>

          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.5 }}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full relative overflow-hidden"
            >
              {/* Animated shimmer effect */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          </div>

          {overallProgress < 100 && (
            <p className="text-xs text-center text-slate-500">
              Estimated time remaining: {Math.max(1, Math.ceil((100 - overallProgress) / 12))}s
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

// Example usage with default engines
export const DEFAULT_ENGINES: Omit<EngineStatus, 'status'>[] = [
  {
    name: 'Market Data',
    description: 'Fetching real-time quotes and historical prices',
    icon: TrendingUp,
  },
  {
    name: 'Technical Analysis',
    description: 'Calculating 6 indicators (RSI, MACD, MA, Volume, BB, Stoch)',
    icon: BarChart3,
  },
  {
    name: 'Fundamental Metrics',
    description: 'Analyzing financials, valuation, and growth metrics',
    icon: DollarSign,
  },
  {
    name: 'ML Price Predictions',
    description: 'Running 3 machine learning models (LSTM, Random Forest, XGBoost)',
    icon: Brain,
  },
  {
    name: 'Sentiment Analysis',
    description: 'Scanning news, social media, and analyst ratings',
    icon: Newspaper,
  },
  {
    name: 'Order Flow & Smart Money',
    description: 'Tracking insider trades, institutional positions, options flow',
    icon: Users,
  },
  {
    name: 'Similar Stocks',
    description: 'Finding comparable stocks by sector, cap, and metrics',
    icon: Zap,
  },
  {
    name: 'AI Insights Generation',
    description: 'Synthesizing data into actionable recommendations',
    icon: Brain,
  },
];
