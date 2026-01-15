/**
 * Live Portfolio Summary - Real-time portfolio performance overview
 *
 * Displays:
 * - Active trade count
 * - Current aggregate P/L
 * - Win rate percentage
 * - Top performing trade
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Activity, Target, Award, BarChart3 } from "lucide-react";
import type { TradeIdea } from "@shared/schema";
import { Link } from "wouter";

export function LivePortfolioSummary() {
  // Fetch active trades
  const { data: trades, isLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    staleTime: 30000,
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch live prices
  const { data: pricesData } = useQuery<Record<string, number>>({
    queryKey: ['/api/prices/batch'],
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const priceMap = pricesData || {};

  // Filter active trades
  const activeTrades = trades?.filter(t => t.outcomeStatus === 'open') || [];

  // Calculate metrics
  const tradesWithPrices = activeTrades
    .filter(t => t.assetType !== 'option' && priceMap[t.symbol])
    .map(trade => {
      const currentPrice = priceMap[trade.symbol];
      const isLong = trade.direction === 'long';
      const plPercent = isLong
        ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      return { ...trade, currentPrice, plPercent };
    });

  const totalPL = tradesWithPrices.length > 0
    ? tradesWithPrices.reduce((sum, t) => sum + t.plPercent, 0) / tradesWithPrices.length
    : 0;

  const winners = tradesWithPrices.filter(t => t.plPercent > 0).length;
  const losers = tradesWithPrices.filter(t => t.plPercent < 0).length;
  const winRate = tradesWithPrices.length > 0
    ? (winners / tradesWithPrices.length) * 100
    : 0;

  const topPerformer = tradesWithPrices.length > 0
    ? tradesWithPrices.reduce((best, current) =>
        current.plPercent > best.plPercent ? current : best
      )
    : null;

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-800/40 border-slate-700/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            Live Portfolio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-800/40 border-slate-700/50 hover:border-cyan-500/30 transition-all duration-300">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5 text-cyan-400" />
            Live Portfolio
          </CardTitle>
          <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
            LIVE
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* Active Trades */}
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-400">Active</span>
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {activeTrades.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {tradesWithPrices.length} with prices
            </div>
          </div>

          {/* Total P/L */}
          <div className={cn(
            "p-3 rounded-lg border",
            totalPL >= 0
              ? "bg-green-500/10 border-green-500/30"
              : "bg-red-500/10 border-red-500/30"
          )}>
            <div className="flex items-center gap-2 mb-1">
              {totalPL >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span className="text-xs text-slate-400">Avg P/L</span>
            </div>
            <div className={cn(
              "text-2xl font-bold font-mono",
              totalPL >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {totalPL >= 0 ? '+' : ''}{totalPL.toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {tradesWithPrices.length > 0 ? 'portfolio avg' : 'no data'}
            </div>
          </div>

          {/* Win Rate */}
          <div className={cn(
            "p-3 rounded-lg border",
            winRate >= 60
              ? "bg-emerald-500/10 border-emerald-500/30"
              : winRate >= 40
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-red-500/10 border-red-500/30"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-400">Win Rate</span>
            </div>
            <div className={cn(
              "text-2xl font-bold font-mono",
              winRate >= 60 ? "text-emerald-400" :
              winRate >= 40 ? "text-amber-400" :
              "text-red-400"
            )}>
              {winRate.toFixed(0)}%
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {winners}W / {losers}L
            </div>
          </div>

          {/* Top Performer */}
          <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/30">
            <div className="flex items-center gap-2 mb-1">
              <Award className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-slate-400">Top Trade</span>
            </div>
            {topPerformer ? (
              <>
                <div className="text-lg font-bold font-mono text-white">
                  {topPerformer.symbol}
                </div>
                <div className="text-xs font-mono text-green-400">
                  +{topPerformer.plPercent.toFixed(1)}%
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">No data</div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
          <div className="text-xs text-slate-500">
            Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <Link href="/trade-desk">
            <Badge variant="outline" className="text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10 cursor-pointer transition-colors">
              View All Trades →
            </Badge>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
