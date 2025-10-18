import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Activity, Target, XCircle, Clock, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    closedIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    expiredIdeas: number;
    winRate: number;
    avgPercentGain: number;
    avgHoldingTimeMinutes: number;
  };
  bySource: Array<{
    source: string;
    totalIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    winRate: number;
    avgPercentGain: number;
  }>;
  byAssetType: Array<{
    assetType: string;
    totalIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    winRate: number;
    avgPercentGain: number;
  }>;
  bySignalType: Array<{
    signal: string;
    totalIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    winRate: number;
    avgPercentGain: number;
  }>;
}

interface TrendData {
  dataPoints: Array<{ date: string; winRate: number; tradesInWindow: number }>;
  cumulativePnL: Array<{ date: string; totalPnL: number; cumulativeGain: number }>;
}

interface TradeIdea {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  source: string;
  confidenceScore: number;
  outcomeStatus: string;
  exitPrice: number | null;
  percentGain: number | null;
  timestamp: string;
  exitDate: string | null;
}

export default function PerformancePage() {
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');

  const { data: stats, isLoading } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats'],
  });

  const { data: trends } = useQuery<TrendData>({
    queryKey: ['/api/ml/win-rate-trend'],
    enabled: !!stats && stats.overall.closedIdeas > 0,
  });

  const { data: allIdeas } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
  });

  const handleExport = () => {
    window.location.href = '/api/performance/export';
  };

  const handleValidate = async () => {
    try {
      const response = await fetch('/api/performance/validate', {
        method: 'POST',
      });
      const result = await response.json();
      console.log('Validation result:', result);
      window.location.reload(); // Refresh to show updated stats
    } catch (error) {
      console.error('Validation error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Performance Data</CardTitle>
            <CardDescription>
              Start generating trade ideas to see performance metrics
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  // Calculate advanced performance metrics
  const calculateAdvancedMetrics = () => {
    if (!closedIdeas || closedIdeas.length === 0) return null;

    const sortedByDate = [...closedIdeas].sort((a, b) => 
      new Date(a.exitDate || a.timestamp).getTime() - new Date(b.exitDate || b.timestamp).getTime()
    );

    // Calculate Max Drawdown (largest peak-to-trough decline)
    let peak = 0;
    let maxDrawdown = 0;
    let cumulativeGain = 0;
    
    sortedByDate.forEach(idea => {
      const gain = idea.percentGain || 0;
      cumulativeGain += gain;
      
      if (cumulativeGain > peak) {
        peak = cumulativeGain;
      }
      
      const drawdown = peak - cumulativeGain;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    // Calculate Profit Factor (gross profit / gross loss)
    const grossProfit = closedIdeas
      .filter(i => (i.percentGain || 0) > 0)
      .reduce((sum, i) => sum + (i.percentGain || 0), 0);
    
    const grossLoss = Math.abs(closedIdeas
      .filter(i => (i.percentGain || 0) < 0)
      .reduce((sum, i) => sum + (i.percentGain || 0), 0));
    
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    // Calculate consecutive wins/losses streaks
    let currentStreak = 0;
    let bestWinStreak = 0;
    let worstLossStreak = 0;
    let isWinStreak = false;

    sortedByDate.forEach((idea, idx) => {
      const isWin = idea.outcomeStatus === 'hit_target';
      const isLoss = idea.outcomeStatus === 'hit_stop';

      if (!isWin && !isLoss) return; // Skip expired

      if (idx === 0) {
        currentStreak = 1;
        isWinStreak = isWin;
      } else if ((isWin && isWinStreak) || (isLoss && !isWinStreak)) {
        currentStreak++;
      } else {
        if (isWinStreak) {
          bestWinStreak = Math.max(bestWinStreak, currentStreak);
        } else {
          worstLossStreak = Math.max(worstLossStreak, currentStreak);
        }
        currentStreak = 1;
        isWinStreak = isWin;
      }
    });

    // Final streak check
    if (isWinStreak) {
      bestWinStreak = Math.max(bestWinStreak, currentStreak);
    } else {
      worstLossStreak = Math.max(worstLossStreak, currentStreak);
    }

    // Find best and worst trades
    const sortedByGain = [...closedIdeas]
      .filter(i => i.percentGain !== null && i.percentGain !== undefined)
      .sort((a, b) => (b.percentGain || 0) - (a.percentGain || 0));
    
    const bestTrades = sortedByGain.slice(0, 5);
    const worstTrades = sortedByGain.slice(-5).reverse();

    return {
      maxDrawdown,
      profitFactor,
      bestWinStreak,
      worstLossStreak,
      bestTrades,
      worstTrades,
      grossProfit,
      grossLoss,
    };
  };

  const advancedMetrics = calculateAdvancedMetrics();

  // Filter closed ideas
  const closedIdeas = allIdeas?.filter(idea => 
    idea.outcomeStatus !== 'open'
  ) || [];

  const filteredIdeas = closedIdeas.filter(idea => {
    const sourceMatch = sourceFilter === 'all' || idea.source === sourceFilter;
    const outcomeMatch = outcomeFilter === 'all' || 
      (outcomeFilter === 'won' && idea.outcomeStatus === 'hit_target') ||
      (outcomeFilter === 'lost' && idea.outcomeStatus === 'hit_stop') ||
      (outcomeFilter === 'expired' && (idea.outcomeStatus === 'expired' || idea.outcomeStatus === 'closed'));
    return sourceMatch && outcomeMatch;
  });

  const getOutcomeBadge = (status: string) => {
    if (status === 'hit_target') {
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">WON</Badge>;
    }
    if (status === 'hit_stop') {
      return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">LOST</Badge>;
    }
    return <Badge variant="outline">EXPIRED</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Performance Tracker</h1>
          <p className="text-muted-foreground">
            Validate trade ideas and analyze performance metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleValidate}
            data-testid="button-validate-ideas"
          >
            <Activity className="w-4 h-4 mr-2" />
            Validate Ideas
          </Button>
          <Button 
            variant="default" 
            onClick={handleExport}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="stat-card shadow-lg border-primary/20" data-testid="card-total-ideas">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
            <CardTitle className="text-sm font-semibold tracking-wide">Total Ideas</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold font-mono tracking-tight">
              {stats.overall.totalIdeas}
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                {stats.overall.openIdeas} open
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
                {stats.overall.closedIdeas} closed
              </span>
            </p>
          </CardContent>
        </Card>

        <Card className={`stat-card shadow-lg ${stats.overall.winRate >= 50 ? 'stat-card-bullish border-green-500/20' : 'border-red-500/20'}`} data-testid="card-win-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
            <CardTitle className="text-sm font-semibold tracking-wide">Win Rate</CardTitle>
            <div className={`p-2 rounded-lg ${stats.overall.winRate >= 50 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <Target className={`w-4 h-4 ${stats.overall.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`} />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className={`text-3xl font-bold font-mono tracking-tight ${stats.overall.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.overall.winRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.overall.wonIdeas} wins • {stats.overall.lostIdeas} losses
            </p>
          </CardContent>
        </Card>

        <Card className={`stat-card shadow-lg ${stats.overall.avgPercentGain >= 0 ? 'stat-card-bullish border-green-500/20' : 'stat-card-bearish border-red-500/20'}`} data-testid="card-avg-gain">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
            <CardTitle className="text-sm font-semibold tracking-wide">Avg Gain</CardTitle>
            <div className={`p-2 rounded-lg ${stats.overall.avgPercentGain >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {stats.overall.avgPercentGain >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className={`text-3xl font-bold font-mono tracking-tight ${
              stats.overall.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {stats.overall.avgPercentGain >= 0 ? '+' : ''}
              {stats.overall.avgPercentGain.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Across {stats.overall.closedIdeas} closed ideas
            </p>
          </CardContent>
        </Card>

        <Card className="stat-card shadow-lg border-primary/20" data-testid="card-avg-holding-time">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
            <CardTitle className="text-sm font-semibold tracking-wide">Avg Hold Time</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <Clock className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold font-mono tracking-tight">
              {formatTime(stats.overall.avgHoldingTimeMinutes)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.overall.expiredIdeas} expired ideas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Performance Metrics */}
      {advancedMetrics && closedIdeas.length >= 5 && (
        <Card className="shadow-lg overflow-hidden border-primary/20" data-testid="card-advanced-metrics">
          <CardHeader className="bg-gradient-to-r from-card to-muted/30 border-b border-border/50">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="w-5 h-5 text-primary" />
              </div>
              Advanced Metrics
            </CardTitle>
            <CardDescription>
              Risk management and streak analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Max Drawdown */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingDown className="w-4 h-4" />
                  Max Drawdown
                </div>
                <div className={`text-2xl font-bold font-mono ${
                  advancedMetrics.maxDrawdown > 0 ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                  {advancedMetrics.maxDrawdown > 0 ? '-' : ''}{advancedMetrics.maxDrawdown.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Largest peak-to-trough decline
                </p>
              </div>

              {/* Profit Factor */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="w-4 h-4" />
                  Profit Factor
                </div>
                <div className={`text-2xl font-bold font-mono ${
                  advancedMetrics.profitFactor >= 1.5 ? 'text-green-500' : 
                  advancedMetrics.profitFactor >= 1.0 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {advancedMetrics.profitFactor === Infinity ? '∞' : advancedMetrics.profitFactor.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Gross profit ÷ gross loss
                </p>
              </div>

              {/* Best Win Streak */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Target className="w-4 h-4" />
                  Best Win Streak
                </div>
                <div className="text-2xl font-bold font-mono text-green-500">
                  {advancedMetrics.bestWinStreak}
                </div>
                <p className="text-xs text-muted-foreground">
                  Consecutive wins
                </p>
              </div>

              {/* Worst Loss Streak */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <XCircle className="w-4 h-4" />
                  Worst Loss Streak
                </div>
                <div className="text-2xl font-bold font-mono text-red-500">
                  {advancedMetrics.worstLossStreak}
                </div>
                <p className="text-xs text-muted-foreground">
                  Consecutive losses
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Best & Worst Trades */}
      {advancedMetrics && advancedMetrics.bestTrades.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Best Trades */}
          <Card className="shadow-lg border-green-500/20" data-testid="card-best-trades">
            <CardHeader className="bg-gradient-to-r from-green-500/5 to-green-500/10 border-b border-border/50">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
                Top Winners
              </CardTitle>
              <CardDescription>
                Best performing trades
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {advancedMetrics.bestTrades.map((trade) => (
                  <div 
                    key={trade.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover-elevate"
                    data-testid={`best-trade-${trade.symbol}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-mono font-bold">{trade.symbol}</div>
                      <Badge variant="outline" className="text-xs capitalize">
                        {trade.assetType}
                      </Badge>
                      <Badge 
                        className={`text-xs ${
                          trade.direction === 'long' 
                            ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        }`}
                      >
                        {trade.direction.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-lg font-bold font-mono text-green-500">
                      +{(trade.percentGain || 0).toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Worst Trades */}
          <Card className="shadow-lg border-red-500/20" data-testid="card-worst-trades">
            <CardHeader className="bg-gradient-to-r from-red-500/5 to-red-500/10 border-b border-border/50">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                </div>
                Top Losers
              </CardTitle>
              <CardDescription>
                Worst performing trades
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {advancedMetrics.worstTrades.map((trade) => (
                  <div 
                    key={trade.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover-elevate"
                    data-testid={`worst-trade-${trade.symbol}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-mono font-bold">{trade.symbol}</div>
                      <Badge variant="outline" className="text-xs capitalize">
                        {trade.assetType}
                      </Badge>
                      <Badge 
                        className={`text-xs ${
                          trade.direction === 'long' 
                            ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                        }`}
                      >
                        {trade.direction.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-lg font-bold font-mono text-red-500">
                      {(trade.percentGain || 0).toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Trades List */}
      {closedIdeas.length > 0 && (
        <Card className="shadow-lg overflow-hidden" data-testid="card-trade-history">
          <CardHeader className="bg-gradient-to-r from-card to-muted/30 border-b border-border/50">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  Trade History
                </CardTitle>
                <CardDescription className="mt-1">
                  Detailed view of all closed trade ideas • {filteredIdeas.length} of {closedIdeas.length} shown
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-36 shadow-sm" data-testid="select-source-filter">
                    <Filter className="w-3 h-3 mr-2" />
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="ai">AI</SelectItem>
                    <SelectItem value="quant">Quant</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger className="w-36 shadow-sm" data-testid="select-outcome-filter">
                    <Filter className="w-3 h-3 mr-2" />
                    <SelectValue placeholder="Outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Outcomes</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="pro-table">
                <thead>
                  <tr>
                    <th className="text-left">Symbol</th>
                    <th className="text-left">Source</th>
                    <th className="text-left">Type</th>
                    <th className="text-left">Direction</th>
                    <th className="text-right">Entry</th>
                    <th className="text-right">Exit</th>
                    <th className="text-right">P&L</th>
                    <th className="text-center">Outcome</th>
                    <th className="text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIdeas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">
                        No trades match the selected filters
                      </td>
                    </tr>
                  ) : (
                    filteredIdeas
                      .sort((a, b) => new Date(b.exitDate || b.timestamp).getTime() - new Date(a.exitDate || a.timestamp).getTime())
                      .map((idea) => (
                        <tr 
                          key={idea.id}
                          data-testid={`row-trade-${idea.symbol}`}
                        >
                          <td className="py-3 px-2">
                            <div className="font-mono font-semibold">{idea.symbol}</div>
                          </td>
                          <td className="py-3 px-2">
                            <Badge 
                              variant={
                                idea.source === 'ai' ? 'default' : 
                                idea.source === 'quant' ? 'secondary' : 
                                'outline'
                              }
                              className="text-xs"
                            >
                              {idea.source.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant="outline" className="text-xs capitalize">
                              {idea.assetType}
                            </Badge>
                          </td>
                          <td className="py-3 px-2">
                            <Badge 
                              className={`text-xs ${
                                idea.direction === 'long' 
                                  ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                                  : 'bg-red-500/10 text-red-500 border-red-500/20'
                              }`}
                            >
                              {idea.direction.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 text-right font-mono">
                            ${idea.entryPrice.toFixed(2)}
                          </td>
                          <td className="py-3 px-2 text-right font-mono">
                            {idea.exitPrice ? `$${idea.exitPrice.toFixed(2)}` : 'N/A'}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {idea.percentGain !== null && idea.percentGain !== undefined ? (
                              <span 
                                className={`font-mono font-semibold ${
                                  idea.percentGain >= 0 ? 'text-green-500' : 'text-red-500'
                                }`}
                                data-testid={`text-pnl-${idea.symbol}`}
                              >
                                {idea.percentGain >= 0 ? '+' : ''}{idea.percentGain.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </td>
                          <td className="py-3 px-2 text-center">
                            {getOutcomeBadge(idea.outcomeStatus)}
                          </td>
                          <td className="py-3 px-2 text-right text-muted-foreground text-xs">
                            {format(parseISO(idea.exitDate || idea.timestamp), 'MMM d, HH:mm')}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Trends Charts */}
      {stats.overall.closedIdeas >= 10 && trends && trends.dataPoints.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Win Rate Trend */}
          <Card data-testid="card-win-rate-trend">
            <CardHeader>
              <CardTitle>Win Rate Trend</CardTitle>
              <CardDescription>
                Rolling 10-trade win rate over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trends.dataPoints}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => format(parseISO(date), 'MMM d')}
                    className="text-xs"
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                    className="text-xs"
                  />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Win Rate']}
                    labelFormatter={(date) => format(parseISO(date as string), 'MMM d, yyyy')}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="winRate" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cumulative P&L */}
          <Card data-testid="card-cumulative-pnl">
            <CardHeader>
              <CardTitle>Equity Curve</CardTitle>
              <CardDescription>
                Cumulative percent gain over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trends.cumulativePnL}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(date) => format(parseISO(date), 'MMM d')}
                    className="text-xs"
                  />
                  <YAxis 
                    tickFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
                    className="text-xs"
                  />
                  <Tooltip 
                    formatter={(value: number) => [`${value > 0 ? '+' : ''}${value.toFixed(2)}%`, 'Cumulative Gain']}
                    labelFormatter={(date) => format(parseISO(date as string), 'MMM d, yyyy')}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="cumulativeGain" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary) / 0.2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Smart Insights (if enough data) */}
      {stats.overall.closedIdeas >= 5 && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 shadow-lg overflow-hidden" data-testid="card-insights">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
          <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/20">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              Smart Insights
            </CardTitle>
            <CardDescription>
              Data-driven recommendations based on your performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Win Rate Analysis */}
            {stats.overall.winRate >= 60 ? (
              <p className="text-sm">✅ <strong>Strong performance!</strong> Your win rate is above 60%.</p>
            ) : stats.overall.winRate < 50 ? (
              <p className="text-sm">⚠️ <strong>Win rate below 50%.</strong> Review losing trades to identify patterns.</p>
            ) : (
              <p className="text-sm">📊 <strong>Win rate around 50%.</strong> Focus on improving risk/reward ratio.</p>
            )}
            
            {/* Best Source Strategy */}
            {stats.bySource.length > 0 && (
              (() => {
                const bestSource = stats.bySource.reduce((best, source) => 
                  source.winRate > best.winRate && source.totalIdeas >= 3 ? source : best
                );
                return bestSource.totalIdeas >= 3 ? (
                  <p className="text-sm">
                    🎯 <strong>Your best strategy: {bestSource.source.toUpperCase()}</strong> ideas 
                    ({bestSource.winRate.toFixed(1)}% win rate)
                  </p>
                ) : null;
              })()
            )}
            
            {/* Positive Expectancy */}
            {stats.overall.avgPercentGain > 0 && stats.overall.closedIdeas >= 5 && (
              <p className="text-sm">
                💰 <strong>Positive expectancy:</strong> Average gain of +{stats.overall.avgPercentGain.toFixed(2)}% per trade
              </p>
            )}

            {/* Profit Factor Insights */}
            {advancedMetrics && (
              <>
                {advancedMetrics.profitFactor >= 2.0 ? (
                  <p className="text-sm">
                    🔥 <strong>Excellent profit factor ({advancedMetrics.profitFactor.toFixed(2)}x)!</strong> Your wins significantly outweigh your losses.
                  </p>
                ) : advancedMetrics.profitFactor >= 1.5 ? (
                  <p className="text-sm">
                    👍 <strong>Good profit factor ({advancedMetrics.profitFactor.toFixed(2)}x).</strong> You're making more on winners than losing on losers.
                  </p>
                ) : advancedMetrics.profitFactor >= 1.0 ? (
                  <p className="text-sm">
                    ⚠️ <strong>Profit factor ({advancedMetrics.profitFactor.toFixed(2)}x) needs improvement.</strong> Your wins barely outweigh your losses.
                  </p>
                ) : (
                  <p className="text-sm">
                    🚨 <strong>Profit factor below 1.0 ({advancedMetrics.profitFactor.toFixed(2)}x).</strong> You're losing more on losing trades than winning on winners. Tighten stops or widen targets.
                  </p>
                )}

                {/* Drawdown Insights */}
                {advancedMetrics.maxDrawdown > 20 && (
                  <p className="text-sm">
                    📉 <strong>High drawdown alert:</strong> Max drawdown of {advancedMetrics.maxDrawdown.toFixed(2)}%. Consider reducing position sizes.
                  </p>
                )}

                {/* Streak Insights */}
                {advancedMetrics.worstLossStreak >= 3 && (
                  <p className="text-sm">
                    🎲 <strong>Loss streak of {advancedMetrics.worstLossStreak}.</strong> Consider taking a break after 2-3 consecutive losses.
                  </p>
                )}

                {/* Asset Type Recommendations */}
                {stats.byAssetType.length > 0 && (
                  (() => {
                    const bestAsset = stats.byAssetType.reduce((best, asset) => 
                      asset.winRate > best.winRate && asset.totalIdeas >= 3 ? asset : best
                    );
                    const worstAsset = stats.byAssetType.reduce((worst, asset) => 
                      asset.winRate < worst.winRate && asset.totalIdeas >= 3 ? asset : worst
                    );
                    return bestAsset.totalIdeas >= 3 && worstAsset.totalIdeas >= 3 && bestAsset.assetType !== worstAsset.assetType ? (
                      <p className="text-sm">
                        📊 <strong>Asset focus:</strong> You perform best with {bestAsset.assetType}s ({bestAsset.winRate.toFixed(1)}% win rate) vs {worstAsset.assetType}s ({worstAsset.winRate.toFixed(1)}%)
                      </p>
                    ) : null;
                  })()
                )}
              </>
            )}

            <p className="text-sm text-muted-foreground mt-4 pt-3 border-t border-border/30">
              💡 View the <strong>Signal Intelligence</strong> page for deeper pattern analysis and ML insights
            </p>
          </CardContent>
        </Card>
      )}

      {/* By Source */}
      <Card className="shadow-lg" data-testid="card-performance-by-source">
        <CardHeader className="bg-gradient-to-r from-card to-muted/20 border-b border-border/50">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            Performance by Source
          </CardTitle>
          <CardDescription>
            Compare AI vs Quant vs Manual trade ideas
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-6">
            {stats.bySource.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No closed ideas yet. Performance data will appear here once ideas are resolved.
              </p>
            ) : (
              stats.bySource.map((source) => (
                <div key={source.source} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        source.source === 'ai' ? 'default' : 
                        source.source === 'quant' ? 'secondary' : 
                        'outline'
                      } data-testid={`badge-source-${source.source}`}>
                        {source.source.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {source.totalIdeas} ideas
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`text-sm font-mono ${
                        source.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {source.avgPercentGain >= 0 ? '+' : ''}
                        {source.avgPercentGain.toFixed(2)}%
                      </div>
                      <div className={`text-xl font-bold font-mono ${
                        source.winRate >= 50 ? 'text-green-500' : 'text-red-500'
                      }`} data-testid={`text-winrate-${source.source}`}>
                        {source.winRate.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{source.wonIdeas} wins</span>
                    <span>•</span>
                    <span>{source.lostIdeas} losses</span>
                  </div>
                  {/* Win Rate Progress Bar */}
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        source.winRate >= 60 ? 'bg-green-500' :
                        source.winRate >= 50 ? 'bg-amber-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(source.winRate, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* By Asset Type */}
      <Card className="shadow-lg" data-testid="card-performance-by-asset">
        <CardHeader className="bg-gradient-to-r from-card to-muted/20 border-b border-border/50">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Target className="w-5 h-5 text-primary" />
            </div>
            Performance by Asset Type
          </CardTitle>
          <CardDescription>
            Compare stocks vs options vs crypto
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-6">
            {stats.byAssetType.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No closed ideas yet. Performance data will appear here once ideas are resolved.
              </p>
            ) : (
              stats.byAssetType.map((asset) => (
                <div key={asset.assetType} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" data-testid={`badge-asset-${asset.assetType}`}>
                        {asset.assetType.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {asset.totalIdeas} ideas
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`text-sm font-mono ${
                        asset.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {asset.avgPercentGain >= 0 ? '+' : ''}
                        {asset.avgPercentGain.toFixed(2)}%
                      </div>
                      <div className={`text-xl font-bold font-mono ${
                        asset.winRate >= 50 ? 'text-green-500' : 'text-red-500'
                      }`} data-testid={`text-winrate-${asset.assetType}`}>
                        {asset.winRate.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{asset.wonIdeas} wins</span>
                    <span>•</span>
                    <span>{asset.lostIdeas} losses</span>
                  </div>
                  {/* Win Rate Progress Bar */}
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        asset.winRate >= 60 ? 'bg-green-500' :
                        asset.winRate >= 50 ? 'bg-amber-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(asset.winRate, 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* By Signal Type */}
      {stats.bySignalType.length > 0 && (
        <Card className="shadow-lg" data-testid="card-performance-by-signal">
          <CardHeader className="bg-gradient-to-r from-card to-muted/20 border-b border-border/50">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              Performance by Signal Type
            </CardTitle>
            <CardDescription>
              Which technical signals perform best (top 10)
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              {stats.bySignalType
                .sort((a, b) => b.winRate - a.winRate)
                .slice(0, 10)
                .map((signal) => (
                  <div key={signal.signal} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">
                          {signal.signal.replace(/_/g, ' ')}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {signal.totalIdeas}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className={`text-sm font-mono ${
                          signal.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {signal.avgPercentGain >= 0 ? '+' : ''}
                          {signal.avgPercentGain.toFixed(2)}%
                        </div>
                        <div className={`text-xl font-bold font-mono ${
                          signal.winRate >= 50 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {signal.winRate.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{signal.wonIdeas} wins</span>
                      <span>•</span>
                      <span>{signal.lostIdeas} losses</span>
                    </div>
                    {/* Win Rate Progress Bar */}
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all ${
                          signal.winRate >= 60 ? 'bg-green-500' :
                          signal.winRate >= 50 ? 'bg-amber-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(signal.winRate, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
