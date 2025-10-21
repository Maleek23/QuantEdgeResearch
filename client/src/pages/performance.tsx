import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Activity, Target, XCircle, Clock, Filter, Calendar, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parseISO, startOfDay, startOfWeek, startOfMonth, startOfYear, subDays, subMonths, subYears, isAfter, isBefore } from 'date-fns';
import { useState, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { formatPercent } from "@/lib/utils";
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
    winRate: number;
    quantAccuracy: number;
    avgPercentGain: number;
    avgHoldingTimeMinutes: number;
    sharpeRatio: number;
    maxDrawdown: number;
    profitFactor: number;
    expectancy: number;
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
  const [dateRange, setDateRange] = useState<string>('all');
  const [periodView, setPeriodView] = useState<string>('daily');
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

  const rangeStart = useMemo(() => {
    const now = new Date();
    switch (dateRange) {
      case '7d': return subDays(now, 7);
      case '30d': return subDays(now, 30);
      case '3m': return subMonths(now, 3);
      case '1y': return subYears(now, 1);
      case 'all': return new Date(0);
      default: return new Date(0);
    }
  }, [dateRange]);

  const closedIdeas = useMemo(() => {
    const ideas = allIdeas?.filter(idea => idea.outcomeStatus !== 'open') || [];
    
    return ideas.filter(idea => {
      const ideaDate = new Date(idea.exitDate || idea.timestamp);
      return !isBefore(ideaDate, rangeStart) || ideaDate.getTime() === rangeStart.getTime();
    });
  }, [allIdeas, rangeStart]);

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
      
      setValidationResults(result.results || []);
      setValidationSummary({
        validated: result.validated,
        updated: result.updated,
      });
      setShowValidationDialog(true);
      
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

  const calculateAdvancedMetrics = () => {
    if (!closedIdeas || closedIdeas.length === 0) return null;

    const sortedByDate = [...closedIdeas].sort((a, b) => 
      new Date(a.exitDate || a.timestamp).getTime() - new Date(b.exitDate || b.timestamp).getTime()
    );

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

    const grossProfit = closedIdeas
      .filter(i => (i.percentGain || 0) > 0)
      .reduce((sum, i) => sum + (i.percentGain || 0), 0);
    
    const grossLoss = Math.abs(closedIdeas
      .filter(i => (i.percentGain || 0) < 0)
      .reduce((sum, i) => sum + (i.percentGain || 0), 0));
    
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    let currentStreak = 0;
    let bestWinStreak = 0;
    let worstLossStreak = 0;
    let isWinStreak = false;

    sortedByDate.forEach((idea, idx) => {
      const isWin = idea.outcomeStatus === 'hit_target';
      const isLoss = idea.outcomeStatus === 'hit_stop';

      if (!isWin && !isLoss) {
        if (currentStreak > 0) {
          if (isWinStreak) {
            bestWinStreak = Math.max(bestWinStreak, currentStreak);
          } else {
            worstLossStreak = Math.max(worstLossStreak, currentStreak);
          }
          currentStreak = 0;
        }
        return;
      }

      if (currentStreak === 0 || idx === 0) {
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

    if (isWinStreak) {
      bestWinStreak = Math.max(bestWinStreak, currentStreak);
    } else {
      worstLossStreak = Math.max(worstLossStreak, currentStreak);
    }

    const sortedByGain = [...closedIdeas]
      .filter(i => i.percentGain !== null && i.percentGain !== undefined)
      .sort((a, b) => (b.percentGain || 0) - (a.percentGain || 0));
    
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3" data-testid="tabs-performance">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
          <TabsTrigger value="deep-dive" data-testid="tab-deep-dive">Deep Dive</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card className="stat-card shadow-lg border-primary/20" data-testid="card-key-metrics">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Key Performance Metrics
              </CardTitle>
              <CardDescription>Overall platform performance at a glance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Total Ideas</div>
                  <div className="text-2xl font-bold font-mono">{stats.overall.totalIdeas}</div>
                  <div className="text-xs text-muted-foreground">{stats.overall.openIdeas} open</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Market Win Rate</div>
                  <div className={`text-2xl font-bold font-mono ${stats.overall.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                    {stats.overall.winRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">{stats.overall.wonIdeas}W • {stats.overall.lostIdeas}L</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Quant Accuracy</div>
                  <div className={`text-2xl font-bold font-mono ${(stats.overall.quantAccuracy ?? 0) >= 50 ? 'text-blue-500' : 'text-orange-500'}`}>
                    {stats.overall.quantAccuracy !== null && stats.overall.quantAccuracy !== undefined ? stats.overall.quantAccuracy.toFixed(1) : '0.0'}%
                  </div>
                  <div className="text-xs text-muted-foreground">Predictions</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Avg Gain</div>
                  <div className={`text-2xl font-bold font-mono ${stats.overall.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {stats.overall.avgPercentGain >= 0 ? '+' : ''}{stats.overall.avgPercentGain.toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">{stats.overall.closedIdeas} closed</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-1">Avg Hold Time</div>
                  <div className="text-2xl font-bold font-mono">{formatTime(stats.overall.avgHoldingTimeMinutes)}</div>
                  <div className="text-xs text-muted-foreground">Duration</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="stat-card shadow-lg border-blue-500/20" data-testid="card-professional-metrics">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Target className="w-5 h-5" />
                Professional Risk Metrics
              </CardTitle>
              <CardDescription>Industry-standard performance indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <TooltipProvider>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-muted-foreground mb-2 flex items-baseline justify-center gap-1.5">
                      <span>Sharpe Ratio</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 cursor-help inline-block" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-semibold mb-1">Sharpe Ratio</p>
                          <p className="text-xs">Risk-adjusted return measuring how much excess return you receive for the volatility you endure. Target: &gt;1.5 for day trading.</p>
                          <p className="text-xs mt-1 italic">Higher is better. Professional traders aim for 1.5+</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className={`text-2xl font-bold font-mono mb-1 ${
                      stats.overall.sharpeRatio >= 1.5 ? 'text-green-500' : 
                      stats.overall.sharpeRatio >= 1.0 ? 'text-amber-500' : 'text-red-500'
                    }`}>
                      {stats.overall.sharpeRatio.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">Target: &gt;1.5</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-muted-foreground mb-2 flex items-baseline justify-center gap-1.5">
                      <span>Max Drawdown</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 cursor-help inline-block" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-semibold mb-1">Max Drawdown</p>
                          <p className="text-xs">Worst peak-to-trough decline in your equity curve. Shows the largest loss from a high point.</p>
                          <p className="text-xs mt-1 italic">Lower is better. Professional traders keep this &lt;20%</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className={`text-2xl font-bold font-mono mb-1 ${
                      stats.overall.maxDrawdown > 0 ? 'text-red-500' : 'text-muted-foreground'
                    }`}>
                      {stats.overall.maxDrawdown > 0 ? '-' : ''}{stats.overall.maxDrawdown.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Peak-to-trough</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-muted-foreground mb-2 flex items-baseline justify-center gap-1.5">
                      <span>Profit Factor</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 cursor-help inline-block" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-semibold mb-1">Profit Factor</p>
                          <p className="text-xs">Gross profits divided by gross losses. Measures how much money you make vs. lose.</p>
                          <p className="text-xs mt-1 italic">Target: &gt;1.3 means you make $1.30 for every $1.00 lost</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className={`text-2xl font-bold font-mono mb-1 ${
                      stats.overall.profitFactor >= 1.5 ? 'text-green-500' : 
                      stats.overall.profitFactor >= 1.0 ? 'text-amber-500' : 'text-red-500'
                    }`}>
                      {stats.overall.profitFactor === Infinity ? '∞' : stats.overall.profitFactor.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">Target: &gt;1.3</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-sm text-muted-foreground mb-2 flex items-baseline justify-center gap-1.5">
                      <span>Expectancy</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-3.5 h-3.5 cursor-help inline-block" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-semibold mb-1">Expectancy</p>
                          <p className="text-xs">Expected value per trade, factoring in win rate and win/loss sizes. Shows average profit per $1 risked.</p>
                          <p className="text-xs mt-1 italic">Positive expectancy = profitable strategy long-term</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className={`text-2xl font-bold font-mono mb-1 ${
                      stats.overall.expectancy >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {stats.overall.expectancy >= 0 ? '+' : ''}${stats.overall.expectancy.toFixed(3)}
                    </div>
                    <div className="text-xs text-muted-foreground">Per $1 risked</div>
                  </div>
                </div>
              </TooltipProvider>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          {stats.overall.closedIdeas >= 5 && (
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
                  {stats.overall.closedIdeas >= 5 && stats.overall.winRate < 50 && (
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

          {tradesByPeriod.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                      <RechartsTooltip 
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

          {stats.overall.closedIdeas >= 10 && trends && trends.dataPoints.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                      <RechartsTooltip 
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
                      <RechartsTooltip 
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

        <TabsContent value="deep-dive" className="space-y-6">
          {advancedMetrics && advancedMetrics.bestTrades.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
            </div>
          )}

          {advancedMetrics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card data-testid="card-streaks">
                <CardHeader>
                  <CardTitle>Winning & Losing Streaks</CardTitle>
                  <CardDescription>
                    Consecutive win/loss patterns
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="w-6 h-6 text-green-500" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Best Win Streak</p>
                          <p className="text-xs text-muted-foreground">Consecutive wins</p>
                        </div>
                      </div>
                      <div className="text-3xl font-bold font-mono text-green-500">
                        {advancedMetrics.bestWinStreak}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                      <div className="flex items-center gap-3">
                        <TrendingDown className="w-6 h-6 text-red-500" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Worst Loss Streak</p>
                          <p className="text-xs text-muted-foreground">Consecutive losses</p>
                        </div>
                      </div>
                      <div className="text-3xl font-bold font-mono text-red-500">
                        {advancedMetrics.worstLossStreak}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-profit-loss-breakdown">
                <CardHeader>
                  <CardTitle>Profit/Loss Breakdown</CardTitle>
                  <CardDescription>
                    Gross wins vs. gross losses
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="w-6 h-6 text-green-500" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Gross Profit</p>
                          <p className="text-xs text-muted-foreground">Total winning %</p>
                        </div>
                      </div>
                      <div className="text-3xl font-bold font-mono text-green-500">
                        {formatPercent(advancedMetrics.grossProfit)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                      <div className="flex items-center gap-3">
                        <TrendingDown className="w-6 h-6 text-red-500" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Gross Loss</p>
                          <p className="text-xs text-muted-foreground">Total losing %</p>
                        </div>
                      </div>
                      <div className="text-3xl font-bold font-mono text-red-500">
                        {formatPercent(-advancedMetrics.grossLoss)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <Card data-testid="card-breakdown-by-source">
            <CardHeader>
              <CardTitle>Breakdown by Source</CardTitle>
              <CardDescription>
                Performance metrics grouped by signal source
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="pro-table">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3">Source</th>
                      <th className="text-right py-2 px-3">Total Ideas</th>
                      <th className="text-right py-2 px-3">Wins</th>
                      <th className="text-right py-2 px-3">Losses</th>
                      <th className="text-right py-2 px-3">Win Rate</th>
                      <th className="text-right py-2 px-3">Avg Gain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.bySource.map((source, idx) => (
                      <tr key={source.source} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                        <td className="py-2 px-3 font-medium capitalize">{source.source}</td>
                        <td className="text-right py-2 px-3">{source.totalIdeas}</td>
                        <td className="text-right py-2 px-3 text-green-500">{source.wonIdeas}</td>
                        <td className="text-right py-2 px-3 text-red-500">{source.lostIdeas}</td>
                        <td className="text-right py-2 px-3">
                          <Badge variant={source.winRate >= 50 ? 'default' : 'destructive'} className="neon-accent">
                            {source.winRate.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className={`text-right py-2 px-3 font-mono ${source.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {source.avgPercentGain >= 0 ? '+' : ''}{source.avgPercentGain.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="card-breakdown-by-asset">
              <CardHeader>
                <CardTitle>Breakdown by Asset Type</CardTitle>
                <CardDescription>
                  Performance across different asset classes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="pro-table">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-3">Asset Type</th>
                        <th className="text-right py-2 px-3">Ideas</th>
                        <th className="text-right py-2 px-3">Win Rate</th>
                        <th className="text-right py-2 px-3">Avg Gain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byAssetType.map((asset, idx) => (
                        <tr key={asset.assetType} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                          <td className="py-2 px-3 font-medium capitalize">{asset.assetType}</td>
                          <td className="text-right py-2 px-3">{asset.totalIdeas}</td>
                          <td className="text-right py-2 px-3">
                            <Badge variant={asset.winRate >= 50 ? 'default' : 'destructive'} className="neon-accent">
                              {asset.winRate.toFixed(1)}%
                            </Badge>
                          </td>
                          <td className={`text-right py-2 px-3 font-mono ${asset.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {asset.avgPercentGain >= 0 ? '+' : ''}{asset.avgPercentGain.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-breakdown-by-signal">
              <CardHeader>
                <CardTitle>Breakdown by Signal Type</CardTitle>
                <CardDescription>
                  Performance by technical signal patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="pro-table">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-3">Signal</th>
                        <th className="text-right py-2 px-3">Ideas</th>
                        <th className="text-right py-2 px-3">Win Rate</th>
                        <th className="text-right py-2 px-3">Avg Gain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.bySignalType.map((signal, idx) => (
                        <tr key={signal.signal} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                          <td className="py-2 px-3 font-medium">{signal.signal}</td>
                          <td className="text-right py-2 px-3">{signal.totalIdeas}</td>
                          <td className="text-right py-2 px-3">
                            <Badge variant={signal.winRate >= 50 ? 'default' : 'destructive'} className="neon-accent">
                              {signal.winRate.toFixed(1)}%
                            </Badge>
                          </td>
                          <td className={`text-right py-2 px-3 font-mono ${signal.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {signal.avgPercentGain >= 0 ? '+' : ''}{signal.avgPercentGain.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="filters" data-testid="accordion-filters">
              <AccordionTrigger className="text-lg font-semibold">
                Advanced Filters
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Filter by Source</label>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger data-testid="select-source-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        {stats.bySource.map(s => (
                          <SelectItem key={s.source} value={s.source} className="capitalize">
                            {s.source} ({s.totalIdeas})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Filter by Outcome</label>
                    <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                      <SelectTrigger data-testid="select-outcome-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Outcomes</SelectItem>
                        <SelectItem value="won">Wins Only</SelectItem>
                        <SelectItem value="lost">Losses Only</SelectItem>
                        <SelectItem value="expired">Expired Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {filteredIdeas.length > 0 && (
            <Card data-testid="card-filtered-trades">
              <CardHeader>
                <CardTitle>Filtered Trade Ideas ({filteredIdeas.length})</CardTitle>
                <CardDescription>
                  Trades matching current filter criteria
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-96">
                  <table className="pro-table">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-3">Symbol</th>
                        <th className="text-left py-2 px-3">Type</th>
                        <th className="text-left py-2 px-3">Direction</th>
                        <th className="text-left py-2 px-3">Source</th>
                        <th className="text-right py-2 px-3">Entry</th>
                        <th className="text-right py-2 px-3">Exit</th>
                        <th className="text-center py-2 px-3">Outcome</th>
                        <th className="text-right py-2 px-3">Gain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIdeas.map((idea, idx) => (
                        <tr key={idea.id} className={idx % 2 === 0 ? 'bg-muted/30' : ''}>
                          <td className="py-2 px-3 font-mono font-bold">{idea.symbol}</td>
                          <td className="py-2 px-3 capitalize text-xs">{idea.assetType}</td>
                          <td className="py-2 px-3">
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
                          <td className="py-2 px-3 capitalize text-xs">{idea.source}</td>
                          <td className="text-right py-2 px-3 font-mono">${idea.entryPrice.toFixed(2)}</td>
                          <td className="text-right py-2 px-3 font-mono">${idea.exitPrice?.toFixed(2) || '—'}</td>
                          <td className="text-center py-2 px-3">{getOutcomeBadge(idea.outcomeStatus)}</td>
                          <td className={`text-right py-2 px-3 font-mono font-bold ${
                            (idea.percentGain || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {idea.percentGain !== null 
                              ? `${idea.percentGain >= 0 ? '+' : ''}${idea.percentGain.toFixed(2)}%` 
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
