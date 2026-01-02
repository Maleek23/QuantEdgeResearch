import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, TrendingUp, Activity, Filter, Calendar, HelpCircle, Info, AlertTriangle, Zap, Brain, BarChart3, Bell, AlertCircle, CheckCircle, Bot, Target, Clock, TrendingDown, Trophy, XCircle, DollarSign, Percent } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfDay, subDays, subMonths, subYears } from 'date-fns';
import { useState, useMemo, lazy, Suspense } from 'react';
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ValidationResultsDialog } from "@/components/validation-results-dialog";
import { TierGate } from "@/components/tier-gate";
import { useAuth } from "@/hooks/useAuth";
import type { EngineHealthAlert } from "@shared/schema";
import { ENGINE_LABELS, ENGINE_COLORS, SIGNAL_STRENGTH_BAND_LABELS } from "@shared/constants";
import { RiskDisclosure } from "@/components/risk-disclosure";

// Lazy load heavy visualization components for better initial load performance
const SymbolLeaderboard = lazy(() => import("@/components/symbol-leaderboard"));
const TimeOfDayHeatmap = lazy(() => import("@/components/time-of-day-heatmap"));
const EngineTrendsChart = lazy(() => import("@/components/engine-trends-chart"));
const ConfidenceCalibration = lazy(() => import("@/components/confidence-calibration"));
const CalibrationCurve = lazy(() => import("@/components/calibration-curve"));
const EngineActualPerformance = lazy(() => import("@/components/engine-actual-performance"));
const StreakTracker = lazy(() => import("@/components/streak-tracker"));
const LossPatternsDashboard = lazy(() => import("@/components/loss-patterns-dashboard"));
import { PerformanceLeaderboard } from "@/components/performance-leaderboard";

// Loading fallback for lazy components
function ChartSkeleton() {
  return (
    <div className="h-64 w-full animate-pulse bg-muted/30 rounded-lg flex items-center justify-center">
      <span className="text-muted-foreground text-sm">Loading chart...</span>
    </div>
  );
}

interface CalibratedStats {
  calibratedWinRate: number;
  calibratedTrades: number;
  calibratedWins: number;
  overallWinRate: number;
  overallTrades: number;
  overallWins: number;
  excludedLowConfidence: number;
  confidenceBreakdown: Array<{
    level: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
  }>;
  highConfidence?: {
    bands: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  mediumPlusConfidence?: {
    bands: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
  };
  allConfidence?: {
    bands: string;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
  };
}

interface FilterBreakdown {
  rawTotal: number;
  filterStages: Array<{
    stage: string;
    count: number;
    excluded: number;
    reason: string;
  }>;
  filteredTotal: number;
  breakdown: {
    open: number;
    expired: number;
    breakeven: number;
    decidedWins: number;
    decidedLosses: number;
    decidedTotal: number;
  };
  winRate: number;
  explanation: string;
}

interface EngineConfidenceCorrelation {
  correlationMatrix: Array<{
    engine: string;
    displayName: string;
    totalTrades: number;
    totalWins: number;
    overallWinRate: number;
    byConfidence: Array<{
      band: string;
      trades: number;
      wins: number;
      losses: number;
      winRate: number;
    }>;
  }>;
  confidenceBands: string[];
  summary: {
    totalEngines: number;
    totalResolvedTrades: number;
  };
}

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

interface EngineMetrics {
  ideasGenerated: number;
  ideasPublished: number;
  tradesResolved: number;
  tradesWon: number;
  tradesLost: number;
  tradesExpired: number;
  winRate: number | null;
  avgGainPercent: number | null;
  avgLossPercent: number | null;
  expectancy: number | null;
  avgHoldingTimeMinutes: number | null;
  avgConfidenceScore: number | null;
}

interface EngineHealthData {
  todayMetrics: Record<string, EngineMetrics>;
  weekMetrics: Record<string, EngineMetrics>;
  historicalMetrics: Array<{
    date: string;
    engine: string;
    winRate: number | null;
  }>;
  activeAlerts: EngineHealthAlert[];
}

interface AutoLottoBotPerformance {
  overall: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    avgPnL: number;
    openPositions: number;
  };
  options: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    portfolio: any;
  };
  futures: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    portfolio: any;
  };
  byExitReason: Array<{
    reason: string;
    count: number;
    wins: number;
    winRate: number;
  }>;
  bestTrade: {
    symbol: string;
    optionType: string;
    strikePrice?: number;
    pnl: number;
    pnlPercent?: number;
  } | null;
  worstTrade: {
    symbol: string;
    optionType: string;
    strikePrice?: number;
    pnl: number;
    pnlPercent?: number;
  } | null;
  recentTrades: Array<{
    symbol: string;
    optionType: string;
    strikePrice?: number;
    realizedPnL: number;
    realizedPnLPercent?: number;
    exitReason: string;
    closedAt: string;
  }>;
  unrealizedPnL: number;
}

const ENGINE_CONFIG = {
  flow: { 
    label: "Flow Scanner", 
    icon: Activity, 
    bgClass: "bg-cyan-500/10",
    textClass: "text-cyan-400",
    borderClass: "border-cyan-500/30"
  },
  quant: { 
    label: "Quant Engine", 
    icon: BarChart3, 
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-400",
    borderClass: "border-blue-500/30"
  },
  ai: { 
    label: "AI Engine", 
    icon: Brain, 
    bgClass: "bg-purple-500/10",
    textClass: "text-purple-400",
    borderClass: "border-purple-500/30"
  },
  lotto: { 
    label: "Lotto Detector", 
    icon: Zap, 
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-400",
    borderClass: "border-amber-500/30"
  },
} as const;

type EngineKey = keyof typeof ENGINE_CONFIG;

function getWinRateColor(winRate: number | null): string {
  if (winRate === null) return "text-muted-foreground";
  if (winRate >= 60) return "text-green-400";
  if (winRate >= 50) return "text-amber-400";
  return "text-red-400";
}

function getSeverityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <AlertCircle className="h-4 w-4 text-red-400" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-400" />;
    default:
      return <Info className="h-4 w-4 text-blue-400" />;
  }
}

function getSeverityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-400/20 text-red-400 border-red-400/30";
    case "warning":
      return "bg-amber-400/20 text-amber-400 border-amber-400/30";
    default:
      return "bg-blue-400/20 text-blue-400 border-blue-400/30";
  }
}

function EngineSummaryCard({
  engineKey,
  todayMetrics,
  weekMetrics,
  alertCount,
}: {
  engineKey: EngineKey;
  todayMetrics: EngineMetrics | undefined;
  weekMetrics: EngineMetrics | undefined;
  alertCount: number;
}) {
  const config = ENGINE_CONFIG[engineKey];
  const Icon = config.icon;

  const todayIdeas = todayMetrics?.ideasGenerated ?? 0;
  const weekIdeas = weekMetrics?.ideasGenerated ?? 0;
  const winRate = weekMetrics?.winRate ?? null;
  const expectancy = weekMetrics?.expectancy ?? null;

  return (
    <Card className="glass-card hover-elevate" data-testid={`card-engine-${engineKey}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <div className={cn("p-2 rounded-lg", config.bgClass)}>
            <Icon className={cn("h-4 w-4", config.textClass)} />
          </div>
          <CardTitle className="text-base font-semibold">{config.label}</CardTitle>
        </div>
        {alertCount > 0 && (
          <Badge
            variant="destructive"
            className="text-xs"
            data-testid={`badge-alert-count-${engineKey}`}
          >
            <Bell className="h-3 w-3 mr-1" />
            {alertCount}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-glass rounded-lg p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Today</p>
            <p className="text-lg font-mono font-bold tabular-nums" data-testid={`text-today-ideas-${engineKey}`}>
              {todayIdeas}
            </p>
          </div>
          <div className="stat-glass rounded-lg p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">7 Days</p>
            <p className="text-lg font-mono font-bold tabular-nums" data-testid={`text-week-ideas-${engineKey}`}>
              {weekIdeas}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/50">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Win Rate</p>
            <p
              className={cn("text-lg font-mono font-bold tabular-nums", getWinRateColor(winRate))}
              data-testid={`text-win-rate-${engineKey}`}
            >
              {winRate !== null ? `${winRate.toFixed(1)}%` : "N/A"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Expectancy</p>
            <p
              className={cn(
                "text-lg font-mono font-bold tabular-nums",
                expectancy !== null && expectancy > 0 ? "text-green-400" : expectancy !== null && expectancy < 0 ? "text-red-400" : "text-muted-foreground"
              )}
              data-testid={`text-expectancy-${engineKey}`}
            >
              {expectancy !== null ? `${expectancy > 0 ? "+" : ""}${expectancy.toFixed(2)}%` : "N/A"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthAlertsSection({
  alerts,
  isAdmin,
}: {
  alerts: EngineHealthAlert[];
  isAdmin: boolean;
}) {
  const { toast } = useToast();

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      return await apiRequest("POST", `/api/engine-health/alerts/${alertId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/engine-health"] });
      toast({
        title: "Alert Acknowledged",
        description: "The alert has been acknowledged successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Acknowledge",
        description: error.message || "Could not acknowledge the alert.",
        variant: "destructive",
      });
    },
  });

  if (alerts.length === 0) {
    return (
      <div className="glass-card rounded-lg p-4" data-testid="card-alerts-empty">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle className="h-5 w-5 text-green-400" />
          <p>No active alerts. All engines are operating normally.</p>
        </div>
      </div>
    );
  }

  return (
    <Card className="glass-card" data-testid="card-health-alerts">
      <CardHeader className="pb-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">System Status</p>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-cyan-400" />
          <CardTitle className="text-lg">Active Health Alerts</CardTitle>
          <Badge variant="destructive" className="ml-2">
            {alerts.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.slice(0, 3).map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border",
                alert.severity === "critical"
                  ? "border-red-400/30 bg-red-400/10"
                  : alert.severity === "warning"
                  ? "border-amber-400/30 bg-amber-400/10"
                  : "border-blue-400/30 bg-blue-400/10"
              )}
              data-testid={`alert-item-${alert.id}`}
            >
              <div className="pt-0.5">{getSeverityIcon(alert.severity)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={cn("text-xs border", getSeverityBadgeClass(alert.severity))}>
                    {alert.severity.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {alert.engine.toUpperCase()}
                  </Badge>
                </div>
                <p className="mt-1 text-sm" data-testid={`alert-message-${alert.id}`}>
                  {alert.message}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {alert.createdAt ? format(new Date(alert.createdAt), "MMM d, yyyy h:mm a") : "Unknown time"}
                </p>
              </div>
              {isAdmin && !alert.acknowledged && (
                <Button
                  variant="glass-secondary"
                  size="sm"
                  onClick={() => acknowledgeMutation.mutate(alert.id)}
                  disabled={acknowledgeMutation.isPending}
                  data-testid={`button-acknowledge-${alert.id}`}
                >
                  {acknowledgeMutation.isPending ? "..." : "Acknowledge"}
                </Button>
              )}
              {alert.acknowledged && (
                <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Acknowledged
                </Badge>
              )}
            </div>
          ))}
          {alerts.length > 3 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              +{alerts.length - 3} more alerts
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PerformancePage() {
  const [dateRange, setDateRange] = useState<string>('all');
  const [selectedEngine, setSelectedEngine] = useState<string>('all');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationSummary, setValidationSummary] = useState({ validated: 0, updated: 0 });
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = !!(user as any)?.isAdmin || (user as any)?.role === "admin";

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

  const { data: engineHealthData, isLoading: isEngineHealthLoading } = useQuery<EngineHealthData>({
    queryKey: ["/api/engine-health"],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const { data: calibratedStats } = useQuery<CalibratedStats>({
    queryKey: ["/api/performance/calibrated-stats"],
    staleTime: 60000,
  });

  const { data: filterBreakdown } = useQuery<FilterBreakdown>({
    queryKey: ["/api/performance/filter-breakdown"],
    staleTime: 60000,
  });

  const { data: correlationData } = useQuery<EngineConfidenceCorrelation>({
    queryKey: ["/api/performance/engine-confidence-correlation"],
    staleTime: 60000,
  });

  const { data: autoLottoBotData, isLoading: isAutoLottoBotLoading } = useQuery<AutoLottoBotPerformance>({
    queryKey: ["/api/performance/auto-lotto-bot"],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const getAlertCountForEngine = (engineKey: EngineKey): number => {
    return engineHealthData?.activeAlerts?.filter((a) => a.engine === engineKey && !a.acknowledged).length ?? 0;
  };

  const engines: EngineKey[] = ["flow", "lotto", "quant", "ai"];

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
        description: "Failed to validate research briefs",
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
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
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
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <Card className="glass-card p-6">
          <h2 className="text-xl font-bold">No Performance Data</h2>
          <p className="text-muted-foreground mt-2">
            Start generating research briefs to see performance metrics
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-performance-title">Performance Analytics</h1>
          <p className="text-sm text-muted-foreground">Separate tracking for Bot trades vs Research ideas</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleValidate}
            disabled={isValidating}
            data-testid="button-validate-ideas"
          >
            <Activity className={`w-4 h-4 mr-1 ${isValidating ? 'animate-spin' : ''}`} />
            {isValidating ? 'Validating...' : 'Validate Ideas'}
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleExport}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Quick Engine Status - Compact */}
      <Card className="glass-card p-4" data-testid="section-engine-pulse">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h3 className="font-semibold text-sm">Engine Status (7d)</h3>
        </div>
          {isEngineHealthLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {engines.map((engineKey) => {
                const config = ENGINE_CONFIG[engineKey];
                const Icon = config.icon;
                const weekData = engineHealthData?.weekMetrics?.[engineKey];
                const winRate = weekData?.winRate ?? null;
                const expectancy = weekData?.expectancy ?? null;
                const alertCount = getAlertCountForEngine(engineKey);
                
                return (
                  <div 
                    key={engineKey} 
                    className="flex items-center justify-between p-2 rounded-lg bg-background/50 hover-elevate"
                    data-testid={`pulse-engine-${engineKey}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded" style={{ backgroundColor: `${config.color}20` }}>
                        <Icon className="h-3 w-3" style={{ color: config.color }} />
                      </div>
                      <span className="text-xs font-medium">{config.label}</span>
                      {alertCount > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1 h-4">{alertCount}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className={cn(
                          "text-xs font-mono font-bold",
                          getWinRateColor(winRate)
                        )}>
                          {winRate !== null ? `${winRate.toFixed(0)}%` : '—'}
                        </span>
                      </div>
                      <div className="text-right w-14">
                        <span className={cn(
                          "text-xs font-mono",
                          expectancy !== null && expectancy > 0 ? "text-green-400" : 
                          expectancy !== null && expectancy < 0 ? "text-red-400" : "text-muted-foreground"
                        )}>
                          {expectancy !== null ? `${expectancy > 0 ? '+' : ''}${expectancy.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </Card>

      {/* Health Alerts (if any) */}
      {engineHealthData?.activeAlerts && engineHealthData.activeAlerts.length > 0 && (
        <HealthAlertsSection 
          alerts={engineHealthData.activeAlerts} 
          isAdmin={isAdmin} 
        />
      )}

      {/* Auto-Lotto Bot Performance Section */}
      <div className="space-y-4" data-testid="section-auto-lotto-bot">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
            <Bot className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Auto-Lotto Bot Performance</h2>
            <p className="text-xs text-muted-foreground">Paper trading results from autonomous lotto plays</p>
          </div>
        </div>

        {isAutoLottoBotLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-48 lg:col-span-3" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : autoLottoBotData ? (
          <>
            {/* Hero Stats Card */}
            <Card className="glass-card relative overflow-hidden" data-testid="card-auto-lotto-hero">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-cyan-500/5" />
              <CardContent className="relative p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  <div className="col-span-2 md:col-span-1 stat-glass rounded-lg p-4 border-l-2 border-l-amber-500">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Trades</p>
                    <p className="text-3xl font-bold font-mono tabular-nums text-amber-400" data-testid="text-bot-total-trades">
                      {autoLottoBotData.overall.totalTrades}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4 border-l-2 border-l-green-500">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Wins</p>
                    <p className="text-3xl font-bold font-mono tabular-nums text-green-400" data-testid="text-bot-wins">
                      {autoLottoBotData.overall.wins}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4 border-l-2 border-l-red-500">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Losses</p>
                    <p className="text-3xl font-bold font-mono tabular-nums text-red-400" data-testid="text-bot-losses">
                      {autoLottoBotData.overall.losses}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4 border-l-2 border-l-cyan-500">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Win Rate</p>
                    <p className={cn(
                      "text-3xl font-bold font-mono tabular-nums",
                      autoLottoBotData.overall.winRate >= 50 ? "text-green-400" : 
                      autoLottoBotData.overall.winRate >= 30 ? "text-amber-400" : "text-red-400"
                    )} data-testid="text-bot-winrate">
                      {autoLottoBotData.overall.winRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4 border-l-2 border-l-emerald-500">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total P&L</p>
                    <p className={cn(
                      "text-3xl font-bold font-mono tabular-nums",
                      autoLottoBotData.overall.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                    )} data-testid="text-bot-total-pnl">
                      {autoLottoBotData.overall.totalPnL >= 0 ? '+' : ''}{autoLottoBotData.overall.totalPnL.toFixed(2)}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4 border-l-2 border-l-purple-500">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Avg P&L</p>
                    <p className={cn(
                      "text-3xl font-bold font-mono tabular-nums",
                      autoLottoBotData.overall.avgPnL >= 0 ? "text-green-400" : "text-red-400"
                    )} data-testid="text-bot-avg-pnl">
                      {autoLottoBotData.overall.avgPnL >= 0 ? '+' : ''}{autoLottoBotData.overall.avgPnL.toFixed(2)}
                    </p>
                  </div>
                  <div className="stat-glass rounded-lg p-4 border-l-2 border-l-blue-500">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Open</p>
                    <p className="text-3xl font-bold font-mono tabular-nums text-blue-400" data-testid="text-bot-open-positions">
                      {autoLottoBotData.overall.openPositions}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Portfolio Cards + Exit Reasons */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Options Portfolio */}
              <Card className="glass-card hover-elevate" data-testid="card-options-portfolio">
                <CardHeader className="flex flex-row items-center gap-3 pb-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Zap className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Options Portfolio</CardTitle>
                    <p className="text-xs text-muted-foreground">Lotto options plays</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="stat-glass rounded-lg p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Trades</p>
                      <p className="text-xl font-bold font-mono tabular-nums" data-testid="text-options-trades">
                        {autoLottoBotData.options.totalTrades}
                      </p>
                    </div>
                    <div className="stat-glass rounded-lg p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Win Rate</p>
                      <p className={cn(
                        "text-xl font-bold font-mono tabular-nums",
                        autoLottoBotData.options.winRate >= 50 ? "text-green-400" : 
                        autoLottoBotData.options.winRate >= 30 ? "text-amber-400" : "text-red-400"
                      )} data-testid="text-options-winrate">
                        {autoLottoBotData.options.winRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">P&L</span>
                    <span className={cn(
                      "text-lg font-bold font-mono tabular-nums",
                      autoLottoBotData.options.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                    )} data-testid="text-options-pnl">
                      {autoLottoBotData.options.totalPnL >= 0 ? '+' : ''}${autoLottoBotData.options.totalPnL.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {autoLottoBotData.options.wins}W / {autoLottoBotData.options.losses}L
                  </div>
                </CardContent>
              </Card>

              {/* Futures Portfolio */}
              <Card className="glass-card hover-elevate" data-testid="card-futures-portfolio">
                <CardHeader className="flex flex-row items-center gap-3 pb-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <BarChart3 className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Futures Portfolio</CardTitle>
                    <p className="text-xs text-muted-foreground">Index futures plays</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="stat-glass rounded-lg p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Trades</p>
                      <p className="text-xl font-bold font-mono tabular-nums" data-testid="text-futures-trades">
                        {autoLottoBotData.futures.totalTrades}
                      </p>
                    </div>
                    <div className="stat-glass rounded-lg p-3 text-center">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Win Rate</p>
                      <p className={cn(
                        "text-xl font-bold font-mono tabular-nums",
                        autoLottoBotData.futures.totalTrades === 0 ? "text-muted-foreground" :
                        autoLottoBotData.futures.winRate >= 50 ? "text-green-400" : 
                        autoLottoBotData.futures.winRate >= 30 ? "text-amber-400" : "text-red-400"
                      )} data-testid="text-futures-winrate">
                        {autoLottoBotData.futures.totalTrades === 0 ? 'N/A' : `${autoLottoBotData.futures.winRate.toFixed(1)}%`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">P&L</span>
                    <span className={cn(
                      "text-lg font-bold font-mono tabular-nums",
                      autoLottoBotData.futures.totalTrades === 0 ? "text-muted-foreground" :
                      autoLottoBotData.futures.totalPnL >= 0 ? "text-green-400" : "text-red-400"
                    )} data-testid="text-futures-pnl">
                      {autoLottoBotData.futures.totalTrades === 0 ? 'N/A' : 
                        `${autoLottoBotData.futures.totalPnL >= 0 ? '+' : ''}$${autoLottoBotData.futures.totalPnL.toFixed(2)}`}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {autoLottoBotData.futures.wins}W / {autoLottoBotData.futures.losses}L
                  </div>
                </CardContent>
              </Card>

              {/* Exit Reason Breakdown */}
              <Card className="glass-card hover-elevate" data-testid="card-exit-reasons">
                <CardHeader className="flex flex-row items-center gap-3 pb-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10">
                    <Target className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Exit Strategy Analysis</CardTitle>
                    <p className="text-xs text-muted-foreground">Which exits perform best</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {autoLottoBotData.byExitReason.length > 0 ? (
                      autoLottoBotData.byExitReason.map((exit) => (
                        <div 
                          key={exit.reason}
                          className="flex items-center justify-between p-2 rounded-lg bg-background/50"
                          data-testid={`exit-reason-${exit.reason}`}
                        >
                          <div className="flex items-center gap-2">
                            {exit.reason === 'target_hit' && <Trophy className="h-3.5 w-3.5 text-green-400" />}
                            {exit.reason === 'stop_hit' && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                            {exit.reason === 'time_decay' && <Clock className="h-3.5 w-3.5 text-amber-400" />}
                            {exit.reason === 'expired' && <AlertCircle className="h-3.5 w-3.5 text-gray-400" />}
                            {!['target_hit', 'stop_hit', 'time_decay', 'expired'].includes(exit.reason) && 
                              <Info className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className="text-xs font-medium capitalize">
                              {exit.reason.replace(/_/g, ' ')}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1 h-4">
                              {exit.count}
                            </Badge>
                          </div>
                          <div className={cn(
                            "text-sm font-bold font-mono tabular-nums",
                            exit.winRate >= 70 ? "text-green-400" :
                            exit.winRate >= 50 ? "text-amber-400" : "text-red-400"
                          )}>
                            {exit.winRate.toFixed(0)}%
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-4">No exit data yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Best/Worst Trades + Recent Trades */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Best Trade */}
              <Card className="glass-card border-l-2 border-l-green-500" data-testid="card-best-trade">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-green-400" />
                    <CardTitle className="text-sm">Best Trade</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {autoLottoBotData.bestTrade ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg" data-testid="text-best-trade-symbol">
                          {autoLottoBotData.bestTrade.symbol}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {autoLottoBotData.bestTrade.optionType}
                        </Badge>
                      </div>
                      <p className="text-2xl font-bold font-mono tabular-nums text-green-400" data-testid="text-best-trade-pnl">
                        +${autoLottoBotData.bestTrade.pnl.toFixed(2)}
                      </p>
                      {autoLottoBotData.bestTrade.pnlPercent && (
                        <p className="text-xs text-green-400/80">
                          +{autoLottoBotData.bestTrade.pnlPercent.toFixed(1)}%
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No trades yet</p>
                  )}
                </CardContent>
              </Card>

              {/* Worst Trade */}
              <Card className="glass-card border-l-2 border-l-red-500" data-testid="card-worst-trade">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <CardTitle className="text-sm">Worst Trade</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {autoLottoBotData.worstTrade ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg" data-testid="text-worst-trade-symbol">
                          {autoLottoBotData.worstTrade.symbol}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {autoLottoBotData.worstTrade.optionType}
                        </Badge>
                      </div>
                      <p className="text-2xl font-bold font-mono tabular-nums text-red-400" data-testid="text-worst-trade-pnl">
                        ${autoLottoBotData.worstTrade.pnl.toFixed(2)}
                      </p>
                      {autoLottoBotData.worstTrade.pnlPercent && (
                        <p className="text-xs text-red-400/80">
                          {autoLottoBotData.worstTrade.pnlPercent.toFixed(1)}%
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No trades yet</p>
                  )}
                </CardContent>
              </Card>

              {/* Unrealized P&L */}
              <Card className="glass-card border-l-2 border-l-cyan-500" data-testid="card-unrealized-pnl">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-cyan-400" />
                    <CardTitle className="text-sm">Open Positions</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Unrealized P&L</p>
                    <p className={cn(
                      "text-2xl font-bold font-mono tabular-nums",
                      autoLottoBotData.unrealizedPnL >= 0 ? "text-green-400" : "text-red-400"
                    )} data-testid="text-unrealized-pnl">
                      {autoLottoBotData.unrealizedPnL >= 0 ? '+' : ''}${autoLottoBotData.unrealizedPnL.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {autoLottoBotData.overall.openPositions} position{autoLottoBotData.overall.openPositions !== 1 ? 's' : ''} open
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Trades List */}
            {autoLottoBotData.recentTrades.length > 0 && (
              <Card className="glass-card" data-testid="card-recent-trades">
                <CardHeader className="flex flex-row items-center gap-3 pb-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Activity className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Recent Trades</CardTitle>
                    <p className="text-xs text-muted-foreground">Last {autoLottoBotData.recentTrades.length} closed positions</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {autoLottoBotData.recentTrades.slice(0, 8).map((trade, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg bg-background/50 hover-elevate"
                        data-testid={`recent-trade-${idx}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            trade.realizedPnL >= 0 ? "bg-green-400" : "bg-red-400"
                          )} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{trade.symbol}</span>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {trade.optionType}
                              </Badge>
                              {trade.strikePrice && (
                                <span className="text-xs text-muted-foreground">${trade.strikePrice}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span className="capitalize">{trade.exitReason?.replace(/_/g, ' ') || 'closed'}</span>
                              <span>•</span>
                              <span>{trade.closedAt ? format(new Date(trade.closedAt), 'MMM d, h:mm a') : 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn(
                            "font-bold font-mono tabular-nums",
                            trade.realizedPnL >= 0 ? "text-green-400" : "text-red-400"
                          )}>
                            {trade.realizedPnL >= 0 ? '+' : ''}${trade.realizedPnL.toFixed(2)}
                          </p>
                          {trade.realizedPnLPercent && (
                            <p className={cn(
                              "text-xs font-mono",
                              trade.realizedPnLPercent >= 0 ? "text-green-400/70" : "text-red-400/70"
                            )}>
                              {trade.realizedPnLPercent >= 0 ? '+' : ''}{trade.realizedPnLPercent.toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card className="glass-card p-6">
            <div className="flex items-center gap-3">
              <Bot className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-semibold">Auto-Lotto Bot Not Active</p>
                <p className="text-sm text-muted-foreground">The autonomous trading bot has not generated any trades yet.</p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* === RESEARCH IDEAS SECTION === */}
      <div className="space-y-4 pt-4 border-t border-border/50" data-testid="section-research-ideas">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/30">
            <Brain className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Research Ideas Performance</h2>
            <p className="text-xs text-muted-foreground">AI & Quant engine generated trade ideas (not auto-executed)</p>
          </div>
        </div>

        {/* Research Summary Stats */}
        <Card className="glass-card">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="stat-glass rounded-lg p-4 border-l-2 border-l-purple-500 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Ideas</p>
                <p className="text-2xl font-bold font-mono tabular-nums">{stats.overall.totalIdeas}</p>
              </div>
              <div className="stat-glass rounded-lg p-4 border-l-2 border-l-green-500 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Won</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-green-400">{stats.overall.wonIdeas}</p>
              </div>
              <div className="stat-glass rounded-lg p-4 border-l-2 border-l-red-500 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Lost</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-red-400">{stats.overall.lostIdeas}</p>
              </div>
              <div className="stat-glass rounded-lg p-4 border-l-2 border-l-cyan-500 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Win Rate</p>
                <p className={cn(
                  "text-2xl font-bold font-mono tabular-nums",
                  stats.overall.winRate >= 60 ? "text-green-400" : 
                  stats.overall.winRate >= 50 ? "text-amber-400" : "text-red-400"
                )} data-testid="text-research-winrate">
                  {stats.overall.closedIdeas > 0 ? `${stats.overall.winRate.toFixed(1)}%` : 'N/A'}
                </p>
              </div>
              <div className="stat-glass rounded-lg p-4 border-l-2 border-l-blue-500 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Open</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-blue-400">{stats.overall.openIdeas}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Intelligence Leaderboard */}
        <PerformanceLeaderboard />
      </div>

      {/* Data Pipeline Transparency & Signal Strength Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Filter Breakdown - Explains where the numbers come from */}
        {filterBreakdown && (
          <Card className="glass-card" data-testid="section-filter-breakdown">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-purple-400" />
                <CardTitle className="text-lg">Data Pipeline</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {filterBreakdown.explanation}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {filterBreakdown.filterStages.map((stage, idx) => (
                  <div 
                    key={stage.stage}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg text-sm",
                      idx === filterBreakdown.filterStages.length - 1 
                        ? "bg-cyan-500/10 border border-cyan-500/30" 
                        : "bg-background/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground w-6">{idx + 1}.</span>
                      <span>{stage.stage}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {stage.excluded > 0 && (
                        <span className="text-xs text-red-400">-{stage.excluded}</span>
                      )}
                      <span className="font-mono font-bold">{stage.count}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-border/50">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <div className="font-mono text-cyan-400">{filterBreakdown.breakdown.open}</div>
                    <div className="text-muted-foreground">Open</div>
                  </div>
                  <div>
                    <div className="font-mono text-amber-400">{filterBreakdown.breakdown.expired}</div>
                    <div className="text-muted-foreground">Expired</div>
                  </div>
                  <div>
                    <div className="font-mono text-green-400">{filterBreakdown.breakdown.decidedTotal}</div>
                    <div className="text-muted-foreground">Decided</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Signal Strength Comparison - High vs All Bands */}
        {calibratedStats?.highConfidence && calibratedStats?.allConfidence && (
          <Card className="glass-card" data-testid="section-confidence-comparison">
            <CardHeader className="pb-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Confidence Analysis</p>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-cyan-400" />
                <CardTitle className="text-lg">Signal Strength Comparison</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Compare win rates: High signal strength vs All bands (based on indicator consensus count)
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* High Signal Strength */}
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/50">
                        HIGH
                      </Badge>
                      <span className="text-sm font-medium">{calibratedStats.highConfidence.bands}</span>
                    </div>
                    <span className={cn(
                      "text-2xl font-bold font-mono",
                      calibratedStats.highConfidence.winRate >= 60 ? "text-green-400" : 
                      calibratedStats.highConfidence.winRate >= 50 ? "text-amber-400" : "text-red-400"
                    )}>
                      {calibratedStats.highConfidence.winRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {calibratedStats.highConfidence.wins}W / {calibratedStats.highConfidence.losses}L from {calibratedStats.highConfidence.trades} trades
                  </div>
                </div>

                {/* All Bands */}
                <div className="p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-cyan-500/20 text-cyan-400 border-cyan-500/50">
                        ALL
                      </Badge>
                      <span className="text-sm font-medium">{calibratedStats.allConfidence.bands}</span>
                    </div>
                    <span className={cn(
                      "text-2xl font-bold font-mono",
                      calibratedStats.allConfidence.winRate >= 60 ? "text-green-400" : 
                      calibratedStats.allConfidence.winRate >= 50 ? "text-amber-400" : "text-red-400"
                    )}>
                      {calibratedStats.allConfidence.winRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {calibratedStats.allConfidence.wins}W / {calibratedStats.allConfidence.losses}L from {calibratedStats.allConfidence.trades} trades
                  </div>
                </div>

                {/* Insight */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                  <Info className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    {calibratedStats.allConfidence.winRate > calibratedStats.highConfidence.winRate 
                      ? "Lower signal bands outperform because B band (3 signals) captures Flow engine's 81.9% win rate."
                      : "High signal strength trades outperform - more indicator agreement correlates with better performance."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Signal Strength Breakdown - Transparency */}
      {calibratedStats && (
        <Card className="glass-card" data-testid="section-confidence-breakdown">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Signal Bands</p>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-amber-400" />
              <CardTitle className="text-lg">Signal Strength Performance (Honest Data)</CardTitle>
              {(() => {
                // Check if B band (3 signals / Flow) is best performer
                const bBand = calibratedStats.confidenceBreakdown.find(b => b.level.includes('B (3'));
                const aBand = calibratedStats.confidenceBreakdown.find(b => b.level.includes('A (5'));
                const bIsBest = bBand && aBand && bBand.winRate > aBand.winRate;
                return bIsBest ? (
                  <Badge variant="outline" className="border-cyan-500/50 text-cyan-400">
                    B Band (3 signals) = Best
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-green-500/50 text-green-400">
                    High Signal = Best
                  </Badge>
                );
              })()}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Actual win rates by signal count. Higher signal count does NOT mean better performance - B band (3 signals) dominates due to Flow engine.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {calibratedStats.confidenceBreakdown.map((band) => {
                const bandLetter = band.level.charAt(0);
                return (
                  <div 
                    key={band.level}
                    className={cn(
                      "p-3 rounded-lg border text-center",
                      band.winRate >= 70 
                        ? "bg-green-500/10 border-green-500/30"
                        : band.winRate >= 55
                          ? "bg-cyan-500/10 border-cyan-500/30"
                          : band.winRate >= 40
                            ? "bg-amber-500/10 border-amber-500/30"
                            : "bg-red-500/10 border-red-500/30"
                    )}
                    data-testid={`confidence-band-${band.level}`}
                  >
                    <Badge 
                      variant="outline"
                      className={cn(
                        "font-bold text-xs mb-2",
                        bandLetter === 'A' ? "bg-green-500/20 text-green-400 border-green-500/50" :
                        bandLetter === 'B' ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50" :
                        bandLetter === 'C' ? "bg-amber-500/20 text-amber-400 border-amber-500/50" :
                        "bg-muted/30 text-muted-foreground border-muted"
                      )}
                    >
                      {band.level.replace(' Band', '')}
                    </Badge>
                    <div className={cn(
                      "text-2xl font-bold font-mono",
                      band.winRate >= 70 ? "text-green-400" 
                        : band.winRate >= 55 ? "text-cyan-400" 
                        : band.winRate >= 40 ? "text-amber-400" 
                        : "text-red-400"
                    )}>
                      {band.winRate.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {band.wins}W/{band.losses}L
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      ({band.trades} trades)
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <span className="font-semibold text-cyan-400">Why B Band Dominates</span>
                  <span className="text-muted-foreground ml-1">
                    The Flow engine (81.9% win rate) generates trades with exactly 3 quality signals (B band). 
                    A band (5+ signals) has only 48.8% win rate - more signals does NOT equal better performance.
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Engine vs Signal Strength Correlation Matrix */}
      {correlationData && correlationData.correlationMatrix.length > 0 && (
        <Card className="glass-card" data-testid="section-engine-confidence-correlation">
          <CardHeader className="pb-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Correlation Matrix</p>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              <CardTitle className="text-lg">Engine × Signal Strength</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Win rate by engine and signal count. Based on actual qualitySignals array length.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {correlationData.correlationMatrix.map((engine) => {
                const highConf = engine.byConfidence.find(c => c.band.includes('High'));
                const lowConf = engine.byConfidence.find(c => c.band.includes('Low'));
                const isInverted = highConf && lowConf && highConf.trades > 0 && lowConf.trades > 0 && lowConf.winRate > highConf.winRate;
                const isCalibrated = highConf && lowConf && highConf.trades > 0 && lowConf.trades > 0 && highConf.winRate >= lowConf.winRate;
                const noLowData = !lowConf || lowConf.trades === 0;
                
                return (
                  <div 
                    key={engine.engine} 
                    className={cn(
                      "p-4 rounded-lg border",
                      isCalibrated ? "bg-green-500/5 border-green-500/20" :
                      isInverted ? "bg-red-500/5 border-red-500/20" :
                      "bg-background/50 border-border/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs font-semibold",
                            ENGINE_COLORS[engine.engine]?.border,
                            ENGINE_COLORS[engine.engine]?.text
                          )}
                        >
                          {ENGINE_LABELS[engine.engine] || engine.displayName}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {engine.totalTrades} decided trades
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-lg font-mono font-bold",
                          engine.overallWinRate >= 60 ? "text-green-400" :
                          engine.overallWinRate >= 45 ? "text-amber-400" :
                          "text-red-400"
                        )}>
                          {engine.overallWinRate.toFixed(1)}%
                        </span>
                        {isInverted && (
                          <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-400">
                            Inverted
                          </Badge>
                        )}
                        {isCalibrated && (
                          <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-400">
                            Calibrated
                          </Badge>
                        )}
                        {noLowData && !isCalibrated && !isInverted && (
                          <Badge variant="outline" className="text-[10px] border-muted-foreground/50 text-muted-foreground">
                            Limited Data
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      {engine.byConfidence.map((conf) => (
                        <div 
                          key={conf.band} 
                          className={cn(
                            "p-2 rounded text-center",
                            conf.trades > 0 ? (
                              conf.winRate >= 60 ? "bg-green-500/10" :
                              conf.winRate >= 40 ? "bg-amber-500/10" :
                              "bg-red-500/10"
                            ) : "bg-muted/20"
                          )}
                        >
                          <div className="text-[10px] text-muted-foreground mb-1">
                            {conf.band.replace(' (70+)', '').replace(' (50-69)', '').replace(' (<50)', '')}
                          </div>
                          {conf.trades > 0 ? (
                            <>
                              <div className={cn(
                                "text-xl font-mono font-bold",
                                conf.winRate >= 60 ? "text-green-400" :
                                conf.winRate >= 40 ? "text-amber-400" :
                                "text-red-400"
                              )}>
                                {conf.winRate.toFixed(0)}%
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {conf.wins}W / {conf.losses}L
                              </div>
                            </>
                          ) : (
                            <div className="text-lg text-muted-foreground/30">—</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded bg-green-500/10">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-muted-foreground">Expected: High signals &gt; Low signals</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-red-500/10">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-muted-foreground">Inverted: Low signals beats High signals</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded bg-muted/20">
                <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />
                <span className="text-muted-foreground">Limited Data: Not enough trades</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Engine Cards - Expandable */}
      <details className="glass-card rounded-lg" data-testid="section-engine-health">
        <summary className="p-4 cursor-pointer hover-elevate rounded-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-cyan-400" />
          <span className="font-semibold">Detailed Engine Metrics</span>
          <span className="text-xs text-muted-foreground ml-2">(click to expand)</span>
        </summary>
        <div className="p-4 pt-0">
          {isEngineHealthLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {engines.map((engineKey) => (
                <EngineSummaryCard
                  key={engineKey}
                  engineKey={engineKey}
                  todayMetrics={engineHealthData?.todayMetrics?.[engineKey]}
                  weekMetrics={engineHealthData?.weekMetrics?.[engineKey]}
                  alertCount={getAlertCountForEngine(engineKey)}
                />
              ))}
            </div>
          )}
        </div>
      </details>

      <div className="glass-card rounded-lg p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">Filters</p>
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
        <div className="glass-card rounded-lg p-6 border-l-2 border-l-cyan-500">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                Today's Performance
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {format(new Date(), 'EEEE, MMMM d, yyyy')} • {todayStats.overall.totalIdeas} research briefs posted today
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
                (todayStats.overall.quantAccuracy ?? 0) >= 70 ? 'text-green-400' : 
                (todayStats.overall.quantAccuracy ?? 0) >= 50 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {todayStats.overall.quantAccuracy?.toFixed(1) ?? '0.0'}%
              </div>
              <span className={cn(
                "rounded px-2 py-0.5 text-xs",
                (todayStats.overall.quantAccuracy ?? 0) >= 70 ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-muted-foreground'
              )}>
                {(todayStats.overall.quantAccuracy ?? 0) >= 70 ? 'Strong' : 'Building'}
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
                (todayStats.overall.directionalAccuracy ?? 0) >= 70 ? 'text-green-400' : 
                (todayStats.overall.directionalAccuracy ?? 0) >= 50 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {todayStats.overall.directionalAccuracy?.toFixed(1) ?? '0.0'}%
              </div>
              <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">
                25%+ to target
              </span>
            </div>
          </div>
          
          {(todayStats.overall.quantAccuracy ?? 0) < 70 && (
            <div className="mt-4 p-3 rounded-lg glass-danger">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="space-y-1 text-sm">
                  <div className="font-semibold text-amber-400">
                    Improvement Opportunities for Today
                  </div>
                  <ul className="space-y-1 text-muted-foreground">
                    {(todayStats.overall.quantAccuracy ?? 0) < 50 && (
                      <li>• Consider reviewing entry timing on today's signals</li>
                    )}
                    {(todayStats.overall.directionalAccuracy ?? 0) < 50 && (
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
        <div className="glass-card rounded-lg p-6 border-l-2 border-l-green-500">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Performance Summary</p>
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

      {/* Engine Performance Trends - Moved Up for Visibility */}
      <div className="glass-card rounded-lg p-6" data-testid="card-engine-trends-section">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">Historical Trends</p>
        <Suspense fallback={<ChartSkeleton />}>
          <EngineTrendsChart />
        </Suspense>
      </div>

      {/* Trade Outcomes Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="section-trade-outcomes">
        <div className="stat-glass rounded-lg p-4 text-center border-l-2 border-l-green-500">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Wins</p>
          <div className="text-3xl font-bold font-mono tabular-nums text-green-400">{stats.overall.wonIdeas}</div>
        </div>
        <div className="stat-glass rounded-lg p-4 text-center border-l-2 border-l-red-500">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Losses</p>
          <div className="text-3xl font-bold font-mono tabular-nums text-red-400">{stats.overall.lostIdeas}</div>
        </div>
        <div className="stat-glass rounded-lg p-4 text-center border-l-2 border-l-gray-500">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Expired</p>
          <div className="text-3xl font-bold font-mono tabular-nums text-muted-foreground">{stats.overall.expiredIdeas}</div>
        </div>
        <div className="stat-glass rounded-lg p-4 text-center border-l-2 border-l-cyan-500">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Briefs</p>
          <div className="text-3xl font-bold font-mono tabular-nums text-cyan-400">{stats.overall.totalIdeas}</div>
        </div>
      </div>

      <div className="space-y-6" data-testid="performance-simplified">
        <TierGate feature="performance" blur>
          <div className="space-y-6" data-testid="section-advanced-analytics">
            <div className="glass-card rounded-lg p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Engine Verification</p>
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Actual Engine Performance</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Verified win rates from resolved trades - this is the PROOF
              </p>
              <Suspense fallback={<ChartSkeleton />}>
                <EngineActualPerformance />
              </Suspense>
            </div>
            
            <div className="glass-card rounded-lg p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Momentum</p>
              <h2 className="text-xl font-semibold mb-4 text-cyan-400">Current Performance Streak</h2>
              <Suspense fallback={<ChartSkeleton />}>
                <StreakTracker selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
              </Suspense>
            </div>
            
            <div className="glass-card rounded-lg p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Symbol Rankings</p>
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Symbol Performance Leaderboard</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedEngine === 'all' ? 'All engines' : `${selectedEngine.toUpperCase()} engine`} - Top/worst performing symbols
              </p>
              <Suspense fallback={<ChartSkeleton />}>
                <SymbolLeaderboard selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
              </Suspense>
            </div>
            
            <div className="glass-card rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Time-of-Day Performance</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Win rate by hour (9 AM - 4 PM ET) {selectedEngine !== 'all' && `for ${selectedEngine.toUpperCase()} engine`}
              </p>
              <Suspense fallback={<ChartSkeleton />}>
                <TimeOfDayHeatmap selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
              </Suspense>
            </div>
            
            <div className="glass-card rounded-lg p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Signal Analysis</p>
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Signal Strength Calibration</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Actual win rates by signal count band {selectedEngine !== 'all' && `for ${selectedEngine.toUpperCase()} engine`}
              </p>
              <Suspense fallback={<ChartSkeleton />}>
                <ConfidenceCalibration selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} />
              </Suspense>
            </div>
            
            <div className="glass-card rounded-lg p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Calibration</p>
              <h2 className="text-xl font-semibold mb-2 text-cyan-400">Accuracy Curve</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Signal count vs actual win rate - how does indicator consensus correlate with outcomes?
              </p>
              <Suspense fallback={<ChartSkeleton />}>
                <CalibrationCurve />
              </Suspense>
            </div>
            
            <div className="glass-card rounded-lg p-6 border-l-2 border-l-amber-500">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Post-Mortem Analysis</p>
              <h2 className="text-xl font-semibold mb-2 text-amber-400">Loss Patterns Dashboard</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Understanding why trades fail - automatic post-mortem analysis of all losing trades
              </p>
              <Suspense fallback={<ChartSkeleton />}>
                <LossPatternsDashboard />
              </Suspense>
            </div>
          </div>
        </TierGate>

        {stats.bySource.length > 0 && (
          <div className="glass-card rounded-lg p-6 border-l-2 border-l-purple-500" data-testid="card-performance-by-source">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Engine Comparison</p>
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

      {/* Educational Disclaimer */}
      <RiskDisclosure 
        variant="compact" 
        engineVersion="v3.x" 
        className="mt-6"
      />

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
