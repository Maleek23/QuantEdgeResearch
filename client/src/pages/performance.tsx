import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, Activity, Filter, Calendar, HelpCircle, Info, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfDay, subDays, subMonths, subYears } from 'date-fns';
import { useState, useMemo } from 'react';
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ValidationResultsDialog } from "@/components/validation-results-dialog";
import SymbolLeaderboard from "@/components/symbol-leaderboard";
import TimeOfDayHeatmap from "@/components/time-of-day-heatmap";
import EngineTrendsChart from "@/components/engine-trends-chart";
import ConfidenceCalibration from "@/components/confidence-calibration";
import StreakTracker from "@/components/streak-tracker";
import { TierGate } from "@/components/tier-gate";

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

export default function PerformancePage() {
  const [dateRange, setDateRange] = useState<string>('all');
  const [selectedEngine, setSelectedEngine] = useState<string>('all');
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
    
    return params.toString() ? `?${params.toString()}` : '';
  }, [dateRange]);

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

  const getSourceBadgeColor = (source: string) => {
    const sourceLower = source.toLowerCase();
    if (sourceLower === 'ai') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    if (sourceLower === 'quant') return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
    if (sourceLower === 'hybrid') return 'bg-cyan-600/20 text-cyan-300 border border-cyan-400/30';
    if (sourceLower === 'news') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
    if (sourceLower === 'flow') return 'bg-green-500/20 text-green-400 border border-green-500/30';
    return 'bg-white/10 text-muted-foreground border border-white/10';
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
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-xl font-bold">No Performance Data</h2>
          <p className="text-muted-foreground mt-2">
            Start generating trade ideas to see performance metrics
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="relative overflow-hidden rounded-xl glass-card p-6">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-cyan-400/10" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-performance-title">Performance Tracker</h1>
            <p className="text-muted-foreground mt-1">
              Validate trade ideas and analyze performance metrics
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="glass-secondary" 
              onClick={handleValidate}
              disabled={isValidating}
              data-testid="button-validate-ideas"
            >
              <Activity className={`w-4 h-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
              {isValidating ? 'Validating...' : 'Validate Ideas'}
            </Button>
            <Button 
              variant="glass" 
              onClick={handleExport}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-4 border-l-2 border-l-blue-500">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm">
            <span className="font-semibold text-cyan-400">Metrics v3.0+</span> - Performance metrics now filter to <span className="font-semibold">v3.0.0+</span> engine only (research-backed RSI2, VWAP, Volume signals). Old v2.x trades (131 total with 39% WR using broken MACD/ML signals) are excluded from calculations.
          </p>
        </div>
      </div>

      <div className="glass rounded-xl p-4 border-l-2 border-l-amber-500">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-amber-400">Confidence Score Update (Dec 2024)</span>
            <p className="text-muted-foreground mt-1">
              Previous confidence percentages were inversely correlated with actual performance. We now show transparent <span className="font-semibold text-cyan-400">"Filters Passed"</span> (e.g., 3/3 signals) instead of misleading percentages. Hover over the badge to see exactly which signals fired, volatility regime, and market context.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
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
            <Filter className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-semibold">Filter by Engine:</span>
            <Select value={selectedEngine} onValueChange={setSelectedEngine}>
              <SelectTrigger className="w-40" data-testid="select-engine-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Engines</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
                <SelectItem value="quant">Quant</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="flow">Flow Scanner</SelectItem>
                <SelectItem value="news">News</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          {dateRange !== 'all' && (
            <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              Showing filtered data
            </span>
          )}
        </div>

        {dateRange !== 'all' && (
          <div className="mt-3 pt-3 border-t border-white/10">
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
      </div>

      {todayStats && todayStats.overall.totalIdeas > 0 && dateRange === 'today' && (
        <div className="glass-card rounded-xl p-6 border-l-2 border-l-cyan-500">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                Today's Performance
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {format(new Date(), 'EEEE, MMMM d, yyyy')} • {todayStats.overall.totalIdeas} trade ideas posted today
              </p>
            </div>
            <Button
              variant="glass-secondary"
              size="sm"
              onClick={() => setDateRange('all')}
              data-testid="button-view-all-time"
            >
              View All Time
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Ideas Posted</div>
              <div className="text-2xl font-bold font-mono text-cyan-400">{todayStats.overall.totalIdeas}</div>
              <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">
                {todayStats.overall.openIdeas} open
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Quant Accuracy</div>
              <div className={`text-2xl font-bold font-mono ${
                todayStats.overall.quantAccuracy >= 70 ? 'text-green-400' : 
                todayStats.overall.quantAccuracy >= 50 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {todayStats.overall.quantAccuracy.toFixed(1)}%
              </div>
              <span className={cn(
                "rounded px-2 py-0.5 text-xs",
                todayStats.overall.quantAccuracy >= 70 ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-muted-foreground'
              )}>
                {todayStats.overall.quantAccuracy >= 70 ? 'Strong' : 'Building'}
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Win Rate</div>
              <div className={`text-2xl font-bold font-mono ${
                todayStats.overall.winRate >= 60 ? 'text-green-400' : 
                todayStats.overall.winRate >= 50 ? 'text-amber-400' : 
                todayStats.overall.winRate > 0 ? 'text-red-400' : 'text-muted-foreground'
              }`}>
                {todayStats.overall.closedIdeas > 0 ? `${todayStats.overall.winRate.toFixed(1)}%` : 'N/A'}
              </div>
              <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">
                {todayStats.overall.wonIdeas}W / {todayStats.overall.lostIdeas}L
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Directional Accuracy</div>
              <div className={`text-2xl font-bold font-mono ${
                todayStats.overall.directionalAccuracy >= 70 ? 'text-green-400' : 
                todayStats.overall.directionalAccuracy >= 50 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {todayStats.overall.directionalAccuracy.toFixed(1)}%
              </div>
              <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">
                25%+ to target
              </span>
            </div>
          </div>
          
          {todayStats.overall.quantAccuracy < 70 && (
            <div className="mt-4 p-3 rounded-lg glass-danger">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-amber-400">
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
        </div>
      )}

      {dateRange === 'all' && (
        <div className="glass-card rounded-xl p-6 border-l-2 border-l-green-500">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-green-400" />
            All Time Performance
          </h2>
          <p className="text-muted-foreground mt-1">
            Complete platform history • {stats.overall.totalIdeas} total ideas ({stats.overall.closedIdeas} closed, {stats.overall.openIdeas} open)
          </p>
        </div>
      )}

      {stats.overall.closedIdeas < 20 && (
        <TooltipProvider>
          <div className="glass-secondary rounded-xl p-4 flex items-center gap-2 flex-wrap">
            <Info className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-semibold">Platform Learning Phase:</span>
            <span className="text-sm">
              {stats.overall.wonIdeas} wins, {stats.overall.lostIdeas} losses so far 
              ({stats.overall.closedIdeas} total closed ideas)
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  The platform is in its early learning phase. Small sample sizes are expected and 
                  metrics are accurate. Performance will stabilize as more trades close.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      )}

      <div className="space-y-6" data-testid="performance-simplified">
        <div className="glass-card rounded-xl p-6 border-l-2 border-l-cyan-500" data-testid="card-market-win-rate">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Market Win Rate</h2>
            <p className="text-sm text-muted-foreground">Overall success rate across all closed positions</p>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-baseline gap-3">
              <div className={cn(
                "text-6xl font-bold font-mono",
                stats.overall.winRate >= 60 ? "text-green-400" : 
                stats.overall.winRate >= 50 ? "text-amber-400" : 
                stats.overall.winRate > 0 ? "text-red-400" : "text-muted-foreground"
              )}>
                {stats.overall.closedIdeas > 0 ? stats.overall.winRate.toFixed(1) : 'N/A'}
              </div>
              {stats.overall.closedIdeas > 0 && (
                <div className="text-3xl font-semibold text-muted-foreground">%</div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
              <div className="text-center glass-success rounded-lg p-3">
                <div className="text-2xl font-bold font-mono text-green-400">{stats.overall.wonIdeas}</div>
                <div className="text-xs text-muted-foreground">Wins</div>
              </div>
              <div className="text-center glass-danger rounded-lg p-3">
                <div className="text-2xl font-bold font-mono text-red-400">{stats.overall.lostIdeas}</div>
                <div className="text-xs text-muted-foreground">Losses</div>
              </div>
              <div className="text-center glass-secondary rounded-lg p-3">
                <div className="text-2xl font-bold font-mono text-muted-foreground">{stats.overall.expiredIdeas}</div>
                <div className="text-xs text-muted-foreground">Expired</div>
              </div>
              <div className="text-center glass rounded-lg p-3">
                <div className="text-2xl font-bold font-mono text-cyan-400">{stats.overall.closedIdeas}</div>
                <div className="text-xs text-muted-foreground">Total Closed</div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6 border-l-2 border-l-blue-500" data-testid="card-platform-stats">
          <div className="mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Platform Stats
            </h2>
            <p className="text-sm text-muted-foreground">Core platform metrics</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="glass rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Total Ideas</div>
              <div className="text-3xl font-bold font-mono text-cyan-400">{stats.overall.totalIdeas}</div>
              <div className="text-xs text-muted-foreground">All time</div>
            </div>
            <div className="glass-secondary rounded-lg p-4">
              <div className="text-sm text-muted-foreground">Open Positions</div>
              <div className="text-3xl font-bold font-mono">{stats.overall.openIdeas}</div>
              <div className="text-xs text-muted-foreground">Currently active</div>
            </div>
          </div>
        </div>

        <TierGate feature="performance" blur>
          <div className="space-y-6" data-testid="section-advanced-analytics">
            <div className="glass-card rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4 text-cyan-400">Current Performance Streak</h2>
              <StreakTracker selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
            </div>
            
            <div className="glass-card rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Engine Performance Trends</h2>
              <p className="text-sm text-muted-foreground mb-4">Weekly win rates for all engines over the last 8 weeks</p>
              <EngineTrendsChart />
            </div>
            
            <div className="glass-card rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Symbol Performance Leaderboard</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedEngine === 'all' ? 'All engines' : `${selectedEngine.toUpperCase()} engine`} - Top/worst performing symbols
              </p>
              <SymbolLeaderboard selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
            </div>
            
            <div className="glass-card rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Time-of-Day Performance</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Win rate by hour (9 AM - 4 PM ET) {selectedEngine !== 'all' && `for ${selectedEngine.toUpperCase()} engine`}
              </p>
              <TimeOfDayHeatmap selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
            </div>
            
            <div className="glass-card rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Confidence Score Calibration</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Actual win rates by confidence score band {selectedEngine !== 'all' && `for ${selectedEngine.toUpperCase()} engine`}
              </p>
              <ConfidenceCalibration selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
            </div>
          </div>
        </TierGate>

        {stats.bySource.length > 0 && (
          <div className="glass-card rounded-xl p-6 border-l-2 border-l-purple-500" data-testid="card-performance-by-source">
            <div className="mb-4">
              <h2 className="text-lg font-bold">Performance by Source</h2>
              <p className="text-sm text-muted-foreground">
                AI vs. Quant vs. Hybrid vs. News vs. Flow
              </p>
            </div>
            <div className="space-y-4">
              {stats.bySource.map((source) => (
                <div key={source.source} className="glass-secondary rounded-lg p-4" data-testid={`source-${source.source}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded px-2 py-0.5 text-xs font-medium", getSourceBadgeColor(source.source))}>
                        {source.source.toUpperCase()}
                      </span>
                      <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">
                        {source.totalIdeas} ideas
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        <span className="text-green-400 font-mono">{source.wonIdeas}W</span>
                        <span className="text-muted-foreground mx-1">/</span>
                        <span className="text-red-400 font-mono">{source.lostIdeas}L</span>
                      </div>
                      <span 
                        className={cn(
                          "rounded px-2 py-0.5 text-xs font-medium",
                          source.winRate >= 50 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        )}
                        data-testid={`win-rate-${source.source}`}
                      >
                        {source.winRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Avg Gain</span>
                    <span className={cn(
                      "font-mono font-bold",
                      source.avgPercentGain >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {source.avgPercentGain >= 0 ? '+' : ''}{source.avgPercentGain.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
