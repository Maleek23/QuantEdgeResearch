import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, TrendingUp, Activity, Filter, Calendar, HelpCircle, Info } from "lucide-react";
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
    if (sourceLower === 'ai') return 'bg-purple-500 text-white';
    if (sourceLower === 'quant') return 'bg-cyan-500 text-white';
    if (sourceLower === 'hybrid') return 'bg-indigo-500 text-white';
    if (sourceLower === 'news') return 'bg-amber-500 text-white';
    if (sourceLower === 'flow') return 'bg-emerald-500 text-white';
    return 'bg-gray-500 text-white';
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
              <Badge variant="default">
                <Activity className="w-3 h-3 mr-1.5" />
                Showing filtered data
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

      <div className="space-y-6" data-testid="performance-simplified">
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

        <Card data-testid="card-platform-stats">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Platform Stats
            </CardTitle>
            <CardDescription>Core platform metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Total Ideas</div>
                <div className="text-3xl font-bold font-mono">{stats.overall.totalIdeas}</div>
                <div className="text-xs text-muted-foreground">All time</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Open Positions</div>
                <div className="text-3xl font-bold font-mono">{stats.overall.openIdeas}</div>
                <div className="text-xs text-muted-foreground">Currently active</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <TierGate feature="performance" blur>
          <div className="space-y-6" data-testid="section-advanced-analytics">
            <div>
              <h2 className="text-xl font-semibold mb-4">Current Performance Streak</h2>
              <StreakTracker selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-4">Engine Performance Trends</h2>
              <p className="text-sm text-muted-foreground mb-4">Weekly win rates for all engines over the last 8 weeks</p>
              <EngineTrendsChart />
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-4">Symbol Performance Leaderboard</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedEngine === 'all' ? 'All engines' : `${selectedEngine.toUpperCase()} engine`} - Top/worst performing symbols
              </p>
              <SymbolLeaderboard selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-4">Time-of-Day Performance</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Win rate by hour (9 AM - 4 PM ET) {selectedEngine !== 'all' && `for ${selectedEngine.toUpperCase()} engine`}
              </p>
              <TimeOfDayHeatmap selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
            </div>
            
            <div>
              <h2 className="text-xl font-semibold mb-4">Confidence Score Calibration</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Actual win rates by confidence score band {selectedEngine !== 'all' && `for ${selectedEngine.toUpperCase()} engine`}
              </p>
              <ConfidenceCalibration selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
            </div>
          </div>
        </TierGate>

        {stats.bySource.length > 0 && (
          <Card data-testid="card-performance-by-source">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Performance by Source</CardTitle>
              <CardDescription>
                AI vs. Quant vs. Hybrid vs. News vs. Flow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.bySource.map((source) => (
                  <div key={source.source} className="border-b pb-4 last:border-0" data-testid={`source-${source.source}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={getSourceBadgeColor(source.source)}>
                          {source.source.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {source.totalIdeas} ideas
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm">
                          <span className="text-green-500 font-mono">{source.wonIdeas}W</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-red-500 font-mono">{source.lostIdeas}L</span>
                        </div>
                        <Badge 
                          variant={source.winRate >= 50 ? 'default' : 'destructive'}
                          data-testid={`win-rate-${source.source}`}
                        >
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
