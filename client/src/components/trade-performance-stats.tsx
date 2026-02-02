/**
 * Trade Performance Stats Component
 * Compact display of win/loss audit data for Trade Desk
 */

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, safeToFixed } from "@/lib/utils";
import { CACHE_TIMES } from "@/lib/queryClient";
import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Trophy,
  AlertTriangle,
} from "lucide-react";

interface TradeAuditData {
  success: boolean;
  summary: {
    totalTrades: number;
    wins: number;
    losses: number;
    neutral: number;
    decided: number;
    winRate: number;
    avgWinPercent: number;
    avgLossPercent: number;
    expectancy: number;
    profitFactor: number;
  };
  topWinners: Array<{
    symbol: string;
    percentGain: number;
    source: string;
    timestamp: string;
  }>;
  topLosers: Array<{
    symbol: string;
    percentGain: number;
    source: string;
    timestamp: string;
  }>;
}

export function TradePerformanceStats() {
  const { data: auditData, isLoading } = useQuery<TradeAuditData>({
    queryKey: ['/api/performance/trade-audit'],
    queryFn: async () => {
      const res = await fetch('/api/performance/trade-audit?limit=100');
      if (!res.ok) throw new Error('Failed to fetch audit data');
      return res.json();
    },
    staleTime: CACHE_TIMES.SLOW, // 5 minutes
    gcTime: CACHE_TIMES.STABLE, // 15 minutes
  });

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 bg-gray-200 dark:bg-[#1a1a1a] rounded" />
          <div className="flex gap-4">
            <div className="h-16 w-20 bg-gray-200 dark:bg-[#1a1a1a] rounded" />
            <div className="h-16 w-20 bg-gray-200 dark:bg-[#1a1a1a] rounded" />
            <div className="h-16 w-20 bg-gray-200 dark:bg-[#1a1a1a] rounded" />
          </div>
        </div>
      </Card>
    );
  }

  if (!auditData?.success) {
    return null;
  }

  const { summary, topWinners, topLosers } = auditData;
  const isPositiveExpectancy = summary.expectancy > 0;

  return (
    <Card className="bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Performance Audit</span>
        </div>
        <Badge className={cn(
          "text-xs",
          isPositiveExpectancy
            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
            : "bg-red-500/20 text-red-400 border-red-500/40"
        )}>
          {isPositiveExpectancy ? '+' : ''}{safeToFixed(summary.expectancy, 2)}% EV
        </Badge>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Win Rate</div>
          <div className={cn(
            "text-lg font-bold",
            summary.winRate >= 50 ? "text-emerald-400" : "text-amber-400"
          )}>
            {safeToFixed(summary.winRate, 1)}%
          </div>
        </div>
        <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Wins</div>
          <div className="text-lg font-bold text-emerald-400">{summary.wins}</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Losses</div>
          <div className="text-lg font-bold text-red-400">{summary.losses}</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Total</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">{summary.decided}</div>
        </div>
      </div>

      {/* Detailed Stats Row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-[10px] text-slate-500">Avg Win</div>
            <div className="text-sm font-bold text-emerald-400">+{safeToFixed(summary.avgWinPercent, 1)}%</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <TrendingDown className="w-4 h-4 text-red-400" />
          <div>
            <div className="text-[10px] text-slate-500">Avg Loss</div>
            <div className="text-sm font-bold text-red-400">-{safeToFixed(summary.avgLossPercent, 1)}%</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
          <Target className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-[10px] text-slate-500">Profit Factor</div>
            <div className="text-sm font-bold text-cyan-400">{safeToFixed(summary.profitFactor, 2)}x</div>
          </div>
        </div>
      </div>

      {/* Top Winners & Losers */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top Winners */}
        <div>
          <div className="flex items-center gap-1 mb-2">
            <Trophy className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Top Winners</span>
          </div>
          <div className="space-y-1">
            {topWinners.slice(0, 3).map((trade, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded bg-emerald-500/5 border border-emerald-500/10">
                <span className="font-mono font-bold text-gray-900 dark:text-white">{trade.symbol}</span>
                <span className="text-emerald-400 font-bold">+{safeToFixed(trade.percentGain, 1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div>
          <div className="flex items-center gap-1 mb-2">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Top Losers</span>
          </div>
          <div className="space-y-1">
            {topLosers.slice(0, 3).map((trade, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded bg-red-500/5 border border-red-500/10">
                <span className="font-mono font-bold text-gray-900 dark:text-white">{trade.symbol}</span>
                <span className="text-red-400 font-bold">{safeToFixed(trade.percentGain, 1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default TradePerformanceStats;
