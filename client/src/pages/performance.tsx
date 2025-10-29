import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, TrendingUp, TrendingDown, Activity, Target, XCircle, Clock, Filter, Calendar, HelpCircle, Info } from "lucide-react";
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
import { formatPercent, cn } from "@/lib/utils";
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
import { CrossValidationPanel } from "@/components/cross-validation-panel";

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
    directionalAccuracy: number;
    avgPercentGain: number;
    avgHoldingTimeMinutes: number;
    sharpeRatio: number;
    maxDrawdown: number;
    profitFactor: number;
    expectancy: number;
    evScore: number;
    adjustedWeightedAccuracy: number;
    oppositeDirectionRate: number;
    oppositeDirectionCount: number;
    avgWinSize: number;
    avgLossSize: number;
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

  const apiFilters = useMemo(() => {
    const now = new Date();
    let startDate: string | undefined;
    let endDate: string | undefined;
    
    switch (dateRange) {
      case 'today':
        startDate = format(startOfDay(now), 'yyyy-MM-dd');
        endDate = format(now, 'yyyy-MM-dd');
        break;
      case '7d':
        startDate = format(subDays(now, 7), 'yyyy-MM-dd');
        break;
      case '30d':
        startDate = format(subDays(now, 30), 'yyyy-MM-dd');
        break;
      case '3m':
        startDate = format(subMonths(now, 3), 'yyyy-MM-dd');
        break;
      case '1y':
        startDate = format(subYears(now, 1), 'yyyy-MM-dd');
        break;
      case 'all':
      default:
        break;
    }
    
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (sourceFilter !== 'all') params.append('source', sourceFilter);
    
    return params.toString() ? `?${params.toString()}` : '';
  }, [dateRange, sourceFilter]);

  const { data: stats, isLoading } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats', apiFilters],
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  
  const todayParams = useMemo(() => {
    const now = new Date();
    const params = new URLSearchParams();
    params.append('startDate', format(startOfDay(now), 'yyyy-MM-dd'));
    params.append('endDate', format(now, 'yyyy-MM-dd'));
    return `?${params.toString()}`;
  }, []);
  
  const { data: todayStats } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats', todayParams],
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
      case 'today': return startOfDay(now);
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
      return <Badge variant="default" className="bg-green-500 text-white">WON</Badge>;
    }
    if (status === 'hit_stop') {
      return <Badge variant="destructive">LOST</Badge>;
    }
    return <Badge variant="outline">EXPIRED</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="border-b pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Performance Tracker</h1>
            <p className="text-muted-foreground mt-1">
              Validate trade ideas and analyze performance metrics
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleValidate}
              disabled={isValidating}
              data-testid="button-validate-ideas"
            >
              <Activity className={`w-4 h-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
              {isValidating ? 'Validating...' : 'Validate Ideas'}
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
      </div>

      <Alert className="bg-blue-500/10 border-blue-500/20">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-sm">
          <strong>Metrics v3.0+</strong> - Performance metrics now filter to <strong>v3.0.0+</strong> engine only (research-backed RSI2, VWAP, Volume signals). Old v2.x trades (131 total with 39% WR using broken MACD/ML signals) are excluded from calculations.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm font-semibold">Time Range:</span>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-40" data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today Only</SelectItem>
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

            <div className="flex-1" />

            {dateRange !== 'all' && (
              <Badge variant="default">
                <Activity className="w-3 h-3 mr-1.5" />
                Showing filtered data
              </Badge>
            )}

            {closedIdeas.length > 0 && (
              <Badge variant="outline">
                {closedIdeas.length} closed trade{closedIdeas.length !== 1 ? 's' : ''} in range
              </Badge>
            )}
          </div>

          {dateRange !== 'all' && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Info className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">
                  All metrics below reflect 
                  <span className="font-semibold text-foreground mx-1">
                    {dateRange === 'today' && 'today\'s performance only'}
                    {dateRange === '7d' && 'the last 7 days'}
                    {dateRange === '30d' && 'the last 30 days'}
                    {dateRange === '3m' && 'the last 3 months'}
                    {dateRange === '1y' && 'the last year'}
                  </span>
                  ({stats.overall.totalIdeas} ideas, {stats.overall.closedIdeas} closed)
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {todayStats && todayStats.overall.totalIdeas > 0 && dateRange === 'today' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Today's Performance
                </CardTitle>
                <CardDescription className="mt-1">
                  {format(new Date(), 'EEEE, MMMM d, yyyy')} • {todayStats.overall.totalIdeas} trade ideas posted today
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateRange('all')}
                data-testid="button-view-all-time"
              >
                View All Time
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Ideas Posted</div>
                <div className="text-2xl font-bold font-mono">{todayStats.overall.totalIdeas}</div>
                <Badge variant="secondary" className="text-xs">
                  {todayStats.overall.openIdeas} open
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Quant Accuracy</div>
                <div className={`text-2xl font-bold font-mono ${
                  todayStats.overall.quantAccuracy >= 70 ? 'text-green-500' : 
                  todayStats.overall.quantAccuracy >= 50 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {todayStats.overall.quantAccuracy.toFixed(1)}%
                </div>
                <Badge variant={todayStats.overall.quantAccuracy >= 70 ? 'default' : 'secondary'} className="text-xs">
                  {todayStats.overall.quantAccuracy >= 70 ? 'Strong' : 'Building'}
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Win Rate</div>
                <div className={`text-2xl font-bold font-mono ${
                  todayStats.overall.winRate >= 60 ? 'text-green-500' : 
                  todayStats.overall.winRate >= 50 ? 'text-amber-500' : 
                  todayStats.overall.winRate > 0 ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                  {todayStats.overall.closedIdeas > 0 ? `${todayStats.overall.winRate.toFixed(1)}%` : 'N/A'}
                </div>
                <Badge variant="outline" className="text-xs">
                  {todayStats.overall.wonIdeas}W / {todayStats.overall.lostIdeas}L
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Directional Accuracy</div>
                <div className={`text-2xl font-bold font-mono ${
                  todayStats.overall.directionalAccuracy >= 70 ? 'text-green-500' : 
                  todayStats.overall.directionalAccuracy >= 50 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {todayStats.overall.directionalAccuracy.toFixed(1)}%
                </div>
                <Badge variant="secondary" className="text-xs">
                  25%+ to target
                </Badge>
              </div>
            </div>
            
            {todayStats.overall.quantAccuracy < 70 && (
              <div className="mt-4 p-3 rounded-lg border bg-amber-500/10 border-amber-500/20">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1 text-sm">
                    <div className="font-semibold text-amber-600 dark:text-amber-400">
                      Improvement Opportunities for Today
                    </div>
                    <ul className="space-y-1 text-muted-foreground">
                      {todayStats.overall.quantAccuracy < 50 && (
                        <li>• Consider reviewing entry timing on today's signals</li>
                      )}
                      {todayStats.overall.directionalAccuracy < 50 && (
                        <li>• Multiple signals moving against prediction - check market conditions</li>
                      )}
                      {todayStats.bySource.find(s => s.source === 'quant')?.totalIdeas === 0 && (
                        <li>• No quant signals posted today - run generator for fresh ideas</li>
                      )}
                      {todayStats.overall.openIdeas > 10 && (
                        <li>• {todayStats.overall.openIdeas} open positions - monitor risk exposure</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {dateRange === 'all' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              All Time Performance
            </CardTitle>
            <CardDescription className="text-base">
              Complete platform history • {stats.overall.totalIdeas} total ideas ({stats.overall.closedIdeas} closed, {stats.overall.openIdeas} open)
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {stats.overall.closedIdeas < 20 && (
        <TooltipProvider>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm flex items-center gap-2 flex-wrap">
              <span className="font-semibold">Platform Learning Phase:</span>
              <span>
                {stats.overall.wonIdeas} wins, {stats.overall.lostIdeas} losses so far 
                ({stats.overall.closedIdeas} total closed ideas)
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    The platform is in its early learning phase. Small sample sizes are expected and 
                    metrics are accurate. Performance will stabilize as more trades close.
                  </p>
                </TooltipContent>
              </Tooltip>
            </AlertDescription>
          </Alert>
        </TooltipProvider>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-7 gap-1" data-testid="tabs-performance">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">Trends</TabsTrigger>
          <TabsTrigger value="deep-dive" data-testid="tab-deep-dive">Deep Dive</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights">Insights</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
          <TabsTrigger value="signals" data-testid="tab-signals">Signals</TabsTrigger>
          <TabsTrigger value="validation" data-testid="tab-validation">Validation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <Card data-testid="card-market-win-rate">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Market Win Rate</CardTitle>
              <CardDescription>Overall success rate across all closed positions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-baseline gap-3">
                  <div className={cn(
                    "text-6xl font-bold font-mono",
                    stats.overall.winRate >= 60 ? "text-green-500" : 
                    stats.overall.winRate >= 50 ? "text-amber-500" : 
                    stats.overall.winRate > 0 ? "text-red-500" : "text-muted-foreground"
                  )}>
                    {stats.overall.closedIdeas > 0 ? stats.overall.winRate.toFixed(1) : 'N/A'}
                  </div>
                  {stats.overall.closedIdeas > 0 && (
                    <div className="text-3xl font-semibold text-muted-foreground">%</div>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-green-500">{stats.overall.wonIdeas}</div>
                    <div className="text-xs text-muted-foreground">Wins</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-red-500">{stats.overall.lostIdeas}</div>
                    <div className="text-xs text-muted-foreground">Losses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-muted-foreground">{stats.overall.expiredIdeas}</div>
                    <div className="text-xs text-muted-foreground">Expired</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono">{stats.overall.closedIdeas}</div>
                    <div className="text-xs text-muted-foreground">Total Closed</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card data-testid="card-core-metrics">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Core Performance Metrics
                </CardTitle>
                <CardDescription>Primary accuracy and performance indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Total Ideas</span>
                    <span className="font-mono font-bold">{stats.overall.totalIdeas}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Open Positions</span>
                    <span className="font-mono font-bold">{stats.overall.openIdeas}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-sm text-muted-foreground">Avg Holding Time</span>
                    <span className="font-mono font-bold">{formatTime(stats.overall.avgHoldingTimeMinutes)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-muted-foreground">Avg Percent Gain</span>
                    <span className={cn(
                      "font-mono font-bold",
                      stats.overall.avgPercentGain >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                      {stats.overall.avgPercentGain >= 0 ? '+' : ''}{stats.overall.avgPercentGain.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-quant-defensible-metrics">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Advanced Accuracy Metrics
                </CardTitle>
                <CardDescription>Quant-defensible performance measures</CardDescription>
              </CardHeader>
              <CardContent>
                <TooltipProvider>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground mb-2 flex items-baseline justify-center gap-1.5">
                        <span>Quant Accuracy</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 cursor-help inline-block" data-testid="tooltip-quant-accuracy" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold mb-1">Quant Accuracy</p>
                            <p className="text-xs mb-2">Percentage of trades that hit target before stop loss. The primary measure of model success.</p>
                            <p className="text-xs">This is the classic win rate that professionals use.</p>
                            <p className="text-xs mt-1 italic">Target: &gt;70% for high-confidence signals</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className={`text-2xl font-bold font-mono mb-1 ${
                        stats.overall.quantAccuracy >= 70 ? 'text-green-500' : 
                        stats.overall.quantAccuracy >= 50 ? 'text-amber-500' : 'text-red-500'
                      }`}>
                        {stats.overall.quantAccuracy.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stats.overall.wonIdeas}W / {stats.overall.lostIdeas}L
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="text-sm text-muted-foreground mb-2 flex items-baseline justify-center gap-1.5">
                        <span>Directional</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 cursor-help inline-block" data-testid="tooltip-directional-accuracy" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold mb-1">Directional Accuracy</p>
                            <p className="text-xs mb-2">Percentage of trades that moved at least 25% toward target before hitting stop.</p>
                            <p className="text-xs">Shows if we got the direction right, even if position sizing or stops were off.</p>
                            <p className="text-xs mt-1 italic">Target: &gt;70% means model has edge</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className={`text-2xl font-bold font-mono mb-1 ${
                        stats.overall.directionalAccuracy >= 70 ? 'text-green-500' : 
                        stats.overall.directionalAccuracy >= 50 ? 'text-amber-500' : 'text-red-500'
                      }`}>
                        {stats.overall.directionalAccuracy.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">25%+ to target</div>
                    </div>

                    <div className="text-center">
                      <div className="text-sm text-muted-foreground mb-2 flex items-baseline justify-center gap-1.5">
                        <span>EV Score</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 cursor-help inline-block" data-testid="tooltip-ev-score" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold mb-1">Expected Value Score</p>
                            <p className="text-xs mb-2">Combines win rate with average win/loss sizes to calculate theoretical edge.</p>
                            <p className="text-xs">Formula: (Win% × AvgWin) - (Loss% × AvgLoss)</p>
                            <p className="text-xs mt-1 italic">Positive = profitable, Negative = losing edge</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className={`text-2xl font-bold font-mono mb-1 ${
                        stats.overall.evScore >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {stats.overall.evScore >= 0 ? '+' : ''}{stats.overall.evScore.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Per trade</div>
                    </div>

                    <div className="text-center">
                      <div className="text-sm text-muted-foreground mb-2 flex items-baseline justify-center gap-1.5">
                        <span>Opposite Direction</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-3.5 h-3.5 cursor-help inline-block" data-testid="tooltip-opposite-direction" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-semibold mb-1">Opposite Direction Rate</p>
                            <p className="text-xs mb-2">Percentage of trades that moved AGAINST our prediction by at least 10% of expected move.</p>
                            <p className="text-xs">Critical blind spot detector - catches model failures where price swung significantly in the wrong direction.</p>
                            <p className="text-xs mt-1 italic">Lower is better. Target: &lt;15%</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className={`text-2xl font-bold font-mono mb-1 ${
                        stats.overall.oppositeDirectionRate > 20 ? 'text-red-500' : 
                        stats.overall.oppositeDirectionRate > 15 ? 'text-amber-500' : 'text-green-500'
                      }`}>
                        {stats.overall.oppositeDirectionRate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stats.overall.oppositeDirectionCount} wrong way
                      </div>
                    </div>
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-professional-metrics">
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
                  <div className="text-center">
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

                  <div className="text-center">
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

                  <div className="text-center">
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

                  <div className="text-center">
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
            <Card data-testid="card-smart-insights">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Smart Insights
                </CardTitle>
                <CardDescription>
                  AI-powered analysis of your trading performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.overall.winRate >= 60 && (
                    <div className="flex items-start gap-3 p-3 rounded-lg border">
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
                    <div className="flex items-start gap-3 p-3 rounded-lg border">
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
                    <div className="flex items-start gap-3 p-3 rounded-lg border">
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
                    <div className="flex items-start gap-3 p-3 rounded-lg border">
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
                              <Badge variant={period.winRate >= 50 ? 'default' : 'destructive'}>
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
              <Card data-testid="card-best-trades">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    Top Winners
                  </CardTitle>
                  <CardDescription>
                    Best performing trades
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {advancedMetrics.bestTrades.map((trade) => (
                      <div 
                        key={trade.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                        data-testid={`best-trade-${trade.symbol}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="font-mono font-bold">{trade.symbol}</div>
                          <Badge variant="outline" className="text-xs capitalize">
                            {trade.assetType}
                          </Badge>
                          <Badge variant={trade.direction === 'long' ? 'default' : 'destructive'} className="text-xs">
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

              <Card data-testid="card-worst-trades">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    Top Losers
                  </CardTitle>
                  <CardDescription>
                    Worst performing trades
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {advancedMetrics.worstTrades.map((trade) => (
                      <div 
                        key={trade.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                        data-testid={`worst-trade-${trade.symbol}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="font-mono font-bold">{trade.symbol}</div>
                          <Badge variant="outline" className="text-xs capitalize">
                            {trade.assetType}
                          </Badge>
                          <Badge variant={trade.direction === 'long' ? 'default' : 'destructive'} className="text-xs">
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

          {stats.byAssetType.length > 0 && (
            <Card data-testid="card-asset-breakdown">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Performance by Asset Type</CardTitle>
                <CardDescription>
                  Win rates and average gains across different asset classes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.byAssetType.map((asset) => (
                    <div key={asset.assetType} className="border-b pb-4 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold capitalize">{asset.assetType}</span>
                          <Badge variant="outline" className="text-xs">
                            {asset.totalIdeas} trades
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-sm">
                            <span className="text-green-500 font-mono">{asset.wonIdeas}W</span>
                            <span className="text-muted-foreground mx-1">/</span>
                            <span className="text-red-500 font-mono">{asset.lostIdeas}L</span>
                          </div>
                          <Badge variant={asset.winRate >= 50 ? 'default' : 'destructive'}>
                            {asset.winRate.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Avg Gain</span>
                        <span className={cn(
                          "font-mono font-bold",
                          asset.avgPercentGain >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {asset.avgPercentGain >= 0 ? '+' : ''}{asset.avgPercentGain.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {stats.bySource.length > 0 && (
            <Card data-testid="card-source-breakdown">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Performance by Source</CardTitle>
                <CardDescription>
                  Comparing AI vs. Quant signal performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.bySource.map((source) => (
                    <div key={source.source} className="border-b pb-4 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold capitalize">{source.source}</span>
                          <Badge variant="outline" className="text-xs">
                            {source.totalIdeas} trades
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-sm">
                            <span className="text-green-500 font-mono">{source.wonIdeas}W</span>
                            <span className="text-muted-foreground mx-1">/</span>
                            <span className="text-red-500 font-mono">{source.lostIdeas}L</span>
                          </div>
                          <Badge variant={source.winRate >= 50 ? 'default' : 'destructive'}>
                            {source.winRate.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Avg Gain</span>
                        <span className={cn(
                          "font-mono font-bold",
                          source.avgPercentGain >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {source.avgPercentGain >= 0 ? '+' : ''}{source.avgPercentGain.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {advancedMetrics && (
            <Card data-testid="card-advanced-stats">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Advanced Statistics</CardTitle>
                <CardDescription>
                  Detailed performance metrics and streaks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">Best Win Streak</div>
                    <div className="text-2xl font-bold font-mono text-green-500">
                      {advancedMetrics.bestWinStreak}
                    </div>
                    <div className="text-xs text-muted-foreground">consecutive wins</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">Worst Loss Streak</div>
                    <div className="text-2xl font-bold font-mono text-red-500">
                      {advancedMetrics.worstLossStreak}
                    </div>
                    <div className="text-xs text-muted-foreground">consecutive losses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">Gross Profit</div>
                    <div className="text-2xl font-bold font-mono text-green-500">
                      +{advancedMetrics.grossProfit.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">total gains</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">Gross Loss</div>
                    <div className="text-2xl font-bold font-mono text-red-500">
                      -{advancedMetrics.grossLoss.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">total losses</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Market Insights
              </CardTitle>
              <CardDescription>
                Deep analysis and tracking for your watchlist symbols
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Market insights for watchlist symbols are available on the <strong>Market</strong> page.
                  Navigate to Market → Select a symbol to view detailed insights, price action analysis, and technical indicators.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Advanced Analytics
              </CardTitle>
              <CardDescription>
                Quant metrics, backtesting, and model calibration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Core analytics tools:</strong> Backtesting metrics, rolling win rates, signal breakdowns, and model calibration charts are coming soon to this tab.
                    For now, use the <strong>Overview</strong>, <strong>Trends</strong>, and <strong>Deep Dive</strong> tabs for comprehensive performance analysis.
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Backtest Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Sharpe Ratio: {stats.overall.sharpeRatio.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Max Drawdown: {stats.overall.maxDrawdown.toFixed(2)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Profit Factor: {stats.overall.profitFactor.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Risk Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Avg Win: {stats.overall.avgWinSize.toFixed(2)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Avg Loss: {stats.overall.avgLossSize.toFixed(2)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expectancy: {stats.overall.expectancy.toFixed(2)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Model Quality</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        Quant Accuracy: {stats.overall.quantAccuracy.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Direction Accuracy: {stats.overall.directionalAccuracy.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        EV Score: {stats.overall.evScore.toFixed(2)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Signal Intelligence
              </CardTitle>
              <CardDescription>
                Machine learning insights and signal performance analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Signal Performance Analysis:</strong> Individual signal breakdowns, correlation matrices, and ML network visualizations are available in the <strong>Deep Dive</strong> tab.
                  View signal-specific win rates and performance metrics by source under the <strong>Overview</strong> tab.
                </AlertDescription>
              </Alert>
              {stats.bySignalType && stats.bySignalType.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-4">Signal Performance Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stats.bySignalType.slice(0, 6).map((signal) => (
                      <Card key={signal.signal} className="border-primary/20">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">{signal.signal}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Win Rate:</span>
                              <span className={cn(
                                "font-mono font-semibold",
                                signal.winRate >= 60 ? "text-green-500" : signal.winRate >= 50 ? "text-amber-500" : "text-red-500"
                              )}>
                                {signal.winRate.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Trades:</span>
                              <span className="font-mono">{signal.totalIdeas}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Avg Gain:</span>
                              <span className={cn(
                                "font-mono",
                                signal.avgPercentGain >= 0 ? "text-green-500" : "text-red-500"
                              )}>
                                {signal.avgPercentGain >= 0 ? '+' : ''}{signal.avgPercentGain.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="space-y-6">
          <CrossValidationPanel />
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
