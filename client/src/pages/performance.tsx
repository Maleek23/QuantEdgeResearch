import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Activity, Target, XCircle, Clock, Filter, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parseISO, startOfDay, startOfWeek, startOfMonth, startOfYear, subDays, subMonths, subYears, isAfter, isBefore } from 'date-fns';
import { useState, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ValidationResultsDialog } from "@/components/validation-results-dialog";

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    closedIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    expiredIdeas: number;
    winRate: number; // Market win rate: hit_target / (hit_target + hit_stop)
    quantAccuracy: number; // Prediction accuracy: correct predictions / total validated
    avgPercentGain: number;
    avgHoldingTimeMinutes: number;
    // PROFESSIONAL RISK METRICS (Phase 1)
    sharpeRatio: number; // Risk-adjusted return (target >1.5 for day trading)
    maxDrawdown: number; // Worst peak-to-trough decline (%)
    profitFactor: number; // Gross wins / Gross losses (target >1.3)
    expectancy: number; // Expected value per trade ($ per $1 risked)
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
  const [dateRange, setDateRange] = useState<string>('all'); // '7d', '30d', '3m', '1y', 'all'
  const [periodView, setPeriodView] = useState<string>('daily'); // 'daily', 'weekly', 'monthly', 'yearly'
  const [activeTab, setActiveTab] = useState("overview");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationSummary, setValidationSummary] = useState({ validated: 0, updated: 0 });
  const { toast } = useToast();

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

  // Calculate date range start based on selected range
  const rangeStart = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case '7d': return subDays(now, 7);
      case '30d': return subDays(now, 30);
      case '3m': return subMonths(now, 3);
      case '1y': return subYears(now, 1);
      case 'all': return new Date(0); // Beginning of time
      default: return new Date(0);
    }
  }, [dateRange]);

  // Filter closed ideas by date range (inclusive of boundary)
  const closedIdeas = useMemo(() => {
    const ideas = allIdeas?.filter(idea => idea.outcomeStatus !== 'open') || [];
    
    return ideas.filter(idea => {
      const ideaDate = new Date(idea.exitDate || idea.timestamp);
      return !isBefore(ideaDate, rangeStart) || ideaDate.getTime() === rangeStart.getTime();
    });
  }, [allIdeas, rangeStart]);

  // Filter by source and outcome
  const filteredIdeas = useMemo(() => {
    return closedIdeas.filter(idea => {
      const sourceMatch = sourceFilter === 'all' || idea.source === sourceFilter;
      const outcomeMatch = outcomeFilter === 'all' || 
        (outcomeFilter === 'won' && idea.outcomeStatus === 'hit_target') ||
        (outcomeFilter === 'lost' && idea.outcomeStatus === 'hit_stop') ||
        (outcomeFilter === 'expired' && (idea.outcomeStatus === 'expired' || idea.outcomeStatus === 'closed'));
      return sourceMatch && outcomeMatch;
    });
  }, [closedIdeas, sourceFilter, outcomeFilter]);

  // Group filtered ideas by asset type
  const ideasByAssetType = useMemo(() => {
    const grouped: Record<string, TradeIdea[]> = {};
    filteredIdeas.forEach(idea => {
      const assetType = idea.assetType;
      if (!grouped[assetType]) {
        grouped[assetType] = [];
      }
      grouped[assetType].push(idea);
    });
    return grouped;
  }, [filteredIdeas]);

  // Group trades by period
  const tradesByPeriod = useMemo(() => {
    if (!closedIdeas || closedIdeas.length === 0) return [];

    const grouped = new Map<string, typeof closedIdeas>();

    closedIdeas.forEach(idea => {
      const ideaDate = parseISO(idea.exitDate || idea.timestamp);
      let periodKey: string;

      switch (periodView) {
        case 'daily':
          periodKey = format(startOfDay(ideaDate), 'yyyy-MM-dd');
          break;
        case 'weekly':
          periodKey = format(startOfWeek(ideaDate), 'yyyy-MM-dd');
          break;
        case 'monthly':
          periodKey = format(startOfMonth(ideaDate), 'yyyy-MM');
          break;
        case 'yearly':
          periodKey = format(startOfYear(ideaDate), 'yyyy');
          break;
        default:
          periodKey = format(startOfDay(ideaDate), 'yyyy-MM-dd');
      }

      if (!grouped.has(periodKey)) {
        grouped.set(periodKey, []);
      }
      grouped.get(periodKey)!.push(idea);
    });

    // Convert to array and calculate stats
    return Array.from(grouped.entries())
      .map(([period, trades]) => {
        const wins = trades.filter(t => t.outcomeStatus === 'hit_target').length;
        const losses = trades.filter(t => t.outcomeStatus === 'hit_stop').length;
        const totalClosed = wins + losses;
        const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;
        const avgGain = trades.reduce((sum, t) => sum + (t.percentGain || 0), 0) / trades.length;

        return {
          period,
          totalTrades: trades.length,
          wins,
          losses,
          winRate,
          avgGain,
          displayLabel: periodView === 'daily' 
            ? format(parseISO(period), 'MMM dd')
            : periodView === 'weekly'
            ? format(parseISO(period), 'MMM dd, yyyy')
            : periodView === 'monthly'
            ? format(parseISO(period + '-01'), 'MMM yyyy')
            : period
        };
      })
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [closedIdeas, periodView]);

  const handleExport = () => {
    window.location.href = '/api/performance/export';
  };

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const response = await fetch('/api/performance/validate', {
        method: 'POST',
      });
      const result = await response.json();
      
      // Store results and show dialog
      setValidationResults(result.results || []);
      setValidationSummary({
        validated: result.validated,
        updated: result.updated,
      });
      setShowValidationDialog(true);
      
      // Show immediate toast feedback
      if (result.updated > 0) {
        toast({
          title: "Validation Complete",
          description: `Validated ${result.validated} ideas, closed ${result.updated} that hit targets/stops`,
        });
      } else {
        toast({
          title: "Validation Complete",
          description: `Checked ${result.validated} open ideas - all still active`,
        });
      }
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ml/win-rate-trend'] });
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: "Validation Failed",
        description: "Failed to validate trade ideas",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
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

      if (!isWin && !isLoss) {
        // Finalize current streak before skipping neutral trades
        if (currentStreak > 0) {
          if (isWinStreak) {
            bestWinStreak = Math.max(bestWinStreak, currentStreak);
          } else {
            worstLossStreak = Math.max(worstLossStreak, currentStreak);
          }
          currentStreak = 0; // Reset the streak
        }
        return; // Skip expired/manual exit trades
      }

      if (currentStreak === 0 || idx === 0) {
        // Start a new streak
        currentStreak = 1;
        isWinStreak = isWin;
      } else if ((isWin && isWinStreak) || (isLoss && !isWinStreak)) {
        // Continue current streak
        currentStreak++;
      } else {
        // Streak type changed, finalize old streak and start new one
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
    
    // Only show positive gains in "Top Winners"
    const bestTrades = sortedByGain.filter(i => (i.percentGain || 0) > 0).slice(0, 5);
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
      {/* Header with Aurora Hero */}
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative flex items-center justify-between pt-6">
          <div>
            <h1 className="text-3xl font-bold text-gradient-premium">Performance Tracker</h1>
            <p className="text-muted-foreground">
              Validate trade ideas and analyze performance metrics
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleValidate}
              disabled={isValidating}
              data-testid="button-validate-ideas"
              className="btn-magnetic glass-card"
            >
              <Activity className={`w-4 h-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
              {isValidating ? 'Validating...' : 'Validate Ideas'}
            </Button>
            <Button 
              variant="default" 
              onClick={handleExport}
              data-testid="button-export-csv"
              className="btn-magnetic neon-accent"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      {/* Date Range & Period Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Time Range:</span>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="3m">Last 3 Months</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Group By:</span>
          <Select value={periodView} onValueChange={setPeriodView}>
            <SelectTrigger className="w-32" data-testid="select-period-view">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {closedIdeas.length > 0 && (
          <Badge variant="outline" className="badge-shimmer ml-auto">
            {closedIdeas.length} closed trade{closedIdeas.length !== 1 ? 's' : ''} in range
          </Badge>
        )}
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3" data-testid="tabs-performance">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
          <TabsTrigger value="deep-dive" data-testid="tab-deep-dive">Deep Dive</TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          {/* Overall Stats - 5 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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

            <Card className={`stat-card shadow-lg ${stats.overall.winRate >= 50 ? 'stat-card-bullish border-green-500/20' : 'border-red-500/20'}`} data-testid="card-market-win-rate">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
                <CardTitle className="text-sm font-semibold tracking-wide">Market Win Rate</CardTitle>
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

            <Card className={`stat-card shadow-lg ${(stats.overall.quantAccuracy ?? 0) >= 50 ? 'stat-card-bullish border-blue-500/20' : 'border-orange-500/20'}`} data-testid="card-quant-accuracy">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
                <CardTitle className="text-sm font-semibold tracking-wide">Quant Accuracy</CardTitle>
                <div className={`p-2 rounded-lg ${(stats.overall.quantAccuracy ?? 0) >= 50 ? 'bg-blue-500/10' : 'bg-orange-500/10'}`}>
                  <Activity className={`w-4 h-4 ${(stats.overall.quantAccuracy ?? 0) >= 50 ? 'text-blue-500' : 'text-orange-500'}`} />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className={`text-3xl font-bold font-mono tracking-tight ${(stats.overall.quantAccuracy ?? 0) >= 50 ? 'text-blue-500' : 'text-orange-500'}`}>
                  {stats.overall.quantAccuracy !== null && stats.overall.quantAccuracy !== undefined ? stats.overall.quantAccuracy.toFixed(1) : '0.0'}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Prediction correctness
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
                  Average duration
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Professional Risk Metrics - 4 Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="shadow-lg border-primary/20" data-testid="card-sharpe-ratio">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
                <CardTitle className="text-sm font-semibold tracking-wide">Sharpe Ratio</CardTitle>
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className={`text-3xl font-bold font-mono tracking-tight ${
                  stats.overall.sharpeRatio >= 1.5 ? 'text-green-500' : 
                  stats.overall.sharpeRatio >= 1.0 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {stats.overall.sharpeRatio.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Risk-adjusted return (target &gt;1.5)
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-primary/20" data-testid="card-max-drawdown">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
                <CardTitle className="text-sm font-semibold tracking-wide">Max Drawdown</CardTitle>
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className={`text-3xl font-bold font-mono tracking-tight ${
                  stats.overall.maxDrawdown > 0 ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                  {stats.overall.maxDrawdown > 0 ? '-' : ''}{stats.overall.maxDrawdown.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Worst peak-to-trough decline
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-primary/20" data-testid="card-profit-factor">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
                <CardTitle className="text-sm font-semibold tracking-wide">Profit Factor</CardTitle>
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className={`text-3xl font-bold font-mono tracking-tight ${
                  stats.overall.profitFactor >= 1.5 ? 'text-green-500' : 
                  stats.overall.profitFactor >= 1.0 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {stats.overall.profitFactor === Infinity ? '∞' : stats.overall.profitFactor.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Gross wins ÷ losses (target &gt;1.3)
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-primary/20" data-testid="card-expectancy">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
                <CardTitle className="text-sm font-semibold tracking-wide">Expectancy</CardTitle>
                <div className="p-2 rounded-lg bg-primary/10">
                  <Activity className="w-4 h-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className={`text-3xl font-bold font-mono tracking-tight ${
                  stats.overall.expectancy >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {stats.overall.expectancy >= 0 ? '+' : ''}${stats.overall.expectancy.toFixed(3)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Expected value per $1 risked
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Smart Insights Card */}
          {closedIdeas.length >= 5 && (
            <Card className="shadow-lg border-primary/20" data-testid="card-smart-insights">
              <CardHeader className="bg-gradient-to-r from-card to-muted/30 border-b border-border/50">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  Smart Insights
                </CardTitle>
                <CardDescription>
                  AI-powered analysis of your trading performance
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {stats.overall.winRate >= 60 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                      <TrendingUp className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-500">Strong Win Rate</p>
                        <p className="text-xs text-muted-foreground">
                          Your {stats.overall.winRate.toFixed(1)}% win rate is above the 60% excellence threshold
                        </p>
                      </div>
                    </div>
                  )}
                  {stats.overall.sharpeRatio >= 1.5 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <Target className="w-5 h-5 text-blue-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-blue-500">Excellent Risk-Adjusted Returns</p>
                        <p className="text-xs text-muted-foreground">
                          Sharpe ratio of {stats.overall.sharpeRatio.toFixed(2)} indicates strong risk-adjusted performance
                        </p>
                      </div>
                    </div>
                  )}
                  {stats.overall.profitFactor >= 1.3 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                      <TrendingUp className="w-5 h-5 text-green-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-500">Profitable System</p>
                        <p className="text-xs text-muted-foreground">
                          Profit factor of {stats.overall.profitFactor.toFixed(2)} shows your wins outweigh your losses
                        </p>
                      </div>
                    </div>
                  )}
                  {closedIdeas.length >= 5 && stats.overall.winRate < 50 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <Activity className="w-5 h-5 text-amber-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-500">Improvement Opportunity</p>
                        <p className="text-xs text-muted-foreground">
                          Consider reviewing your entry criteria and risk management - current win rate is {stats.overall.winRate.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 2: TRENDS */}
        <TabsContent value="trends" className="space-y-6">
          {/* Period-Based Performance Chart with Table */}
          {tradesByPeriod.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Chart */}
              <Card data-testid="card-period-performance">
                <CardHeader>
                  <CardTitle>Performance by Period</CardTitle>
                  <CardDescription>
                    Win rate and average gain per {periodView} period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={tradesByPeriod}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="displayLabel" 
                        className="text-xs"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        yAxisId="left"
                        domain={[0, 100]}
                        tickFormatter={(value) => `${value}%`}
                        className="text-xs"
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        tickFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`}
                        className="text-xs"
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => {
                          if (name === 'Win Rate') return `${value.toFixed(1)}%`;
                          if (name === 'Avg Gain') return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
                          return value;
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="winRate" name="Win Rate" fill="hsl(var(--primary))" />
                      <Bar yAxisId="right" dataKey="avgGain" name="Avg Gain" fill="hsl(var(--chart-2))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Table */}
              <Card data-testid="card-period-table">
                <CardHeader>
                  <CardTitle>Period Details</CardTitle>
                  <CardDescription>
                    Breakdown of trades by {periodView} period
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto max-h-[300px]">
                    <table className="pro-table">
                      <thead>
                        <tr>
                          <th className="text-left py-2 px-3">Period</th>
                          <th className="text-right py-2 px-3">Trades</th>
                          <th className="text-right py-2 px-3">Wins</th>
                          <th className="text-right py-2 px-3">Losses</th>
                          <th className="text-right py-2 px-3">Win Rate</th>
                          <th className="text-right py-2 px-3">Avg Gain</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tradesByPeriod.slice().reverse().map((period, idx) => (
                          <tr key={period.period} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                            <td className="py-2 px-3 font-medium">{period.displayLabel}</td>
                            <td className="text-right py-2 px-3">{period.totalTrades}</td>
                            <td className="text-right py-2 px-3 text-green-500">{period.wins}</td>
                            <td className="text-right py-2 px-3 text-red-500">{period.losses}</td>
                            <td className="text-right py-2 px-3">
                              <Badge variant={period.winRate >= 50 ? 'default' : 'destructive'} className="neon-accent">
                                {period.winRate.toFixed(1)}%
                              </Badge>
                            </td>
                            <td className={`text-right py-2 px-3 font-mono ${period.avgGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {period.avgGain >= 0 ? '+' : ''}{period.avgGain.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Win Rate Trend & Equity Curve */}
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

          {stats.overall.closedIdeas < 10 && (
            <Card>
              <CardHeader>
                <CardTitle>Not Enough Data</CardTitle>
                <CardDescription>
                  Need at least 10 closed trades to show trend charts
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>

        {/* TAB 3: DEEP DIVE */}
        <TabsContent value="deep-dive" className="space-y-6">
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
                        <div className={`text-lg font-bold font-mono ${
                          (trade.percentGain || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {(trade.percentGain || 0) >= 0 ? '+' : ''}{(trade.percentGain || 0).toFixed(2)}%
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

          {/* Detailed Trades List - Grouped by Asset Type */}
          {closedIdeas.length > 0 && (
            <Card className="shadow-lg overflow-hidden" data-testid="card-trade-history">
              <CardHeader className="bg-gradient-to-r from-card to-muted/30 border-b border-border/50">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Activity className="w-5 h-5 text-primary" />
                      </div>
                      Trade Ideas History
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
              <CardContent className="p-6">
                {filteredIdeas.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No trades match the selected filters
                  </div>
                ) : (
                  <Accordion type="multiple" className="space-y-4" defaultValue={Object.keys(ideasByAssetType)}>
                    {Object.entries(ideasByAssetType)
                      .sort(([a], [b]) => {
                        const order: Record<string, number> = { 'stock': 0, 'penny_stock': 1, 'option': 2, 'crypto': 3 };
                        return (order[a] || 99) - (order[b] || 99);
                      })
                      .map(([assetType, ideas]) => {
                        const assetTypeLabels: Record<string, string> = {
                          'stock': 'Stock Shares',
                          'penny_stock': 'Penny Stocks',
                          'option': 'Stock Options',
                          'crypto': 'Crypto'
                        };
                        const label = assetTypeLabels[assetType] || assetType.toUpperCase();
                        
                        // Calculate asset type stats
                        const wonCount = ideas.filter(i => i.outcomeStatus === 'hit_target').length;
                        const lostCount = ideas.filter(i => i.outcomeStatus === 'hit_stop').length;
                        const winRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;
                        
                        return (
                          <AccordionItem key={assetType} value={assetType} className="border rounded-lg">
                            <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-asset-${assetType}`}>
                              <div className="flex items-center gap-3 w-full">
                                <span className="font-semibold">{label}</span>
                                <Badge variant="outline" data-testid={`badge-count-${assetType}`}>
                                  {ideas.length} trade{ideas.length !== 1 ? 's' : ''}
                                </Badge>
                                {wonCount + lostCount > 0 && (
                                  <Badge 
                                    className={`ml-auto mr-4 ${
                                      winRate >= 60 ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                      winRate >= 50 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                      'bg-red-500/10 text-red-500 border-red-500/20'
                                    }`}
                                  >
                                    {winRate.toFixed(1)}% WR
                                  </Badge>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="overflow-x-auto">
                                <table className="pro-table">
                                  <thead>
                                    <tr>
                                      <th className="text-left">Symbol</th>
                                      <th className="text-left">Source</th>
                                      <th className="text-left">Direction</th>
                                      <th className="text-right">Entry</th>
                                      <th className="text-right">Exit</th>
                                      <th className="text-right">P&L</th>
                                      <th className="text-center">Outcome</th>
                                      <th className="text-right">Date</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ideas
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
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          )}

          {/* Detailed Performance Breakdowns - Collapsible */}
          <Accordion type="multiple" className="space-y-4" defaultValue={["breakdowns"]}>
            <AccordionItem value="breakdowns" className="border rounded-lg shadow-lg">
              <AccordionTrigger className="px-6 py-4 hover:no-underline glass-card rounded-t-lg">
                <div className="flex items-center gap-3 text-xl font-bold">
                  <Activity className="w-6 h-6 text-primary" />
                  <span>Detailed Performance Breakdowns</span>
                  <Badge variant="outline" className="ml-2">Source • Asset • Signals</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-2 space-y-6">
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>

      {/* Validation Results Dialog */}
      <ValidationResultsDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        results={validationResults}
        totalValidated={validationSummary.validated}
        totalUpdated={validationSummary.updated}
      />
    </div>
  );
}
