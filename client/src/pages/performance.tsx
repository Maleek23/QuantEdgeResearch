import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, TrendingUp, Activity, Filter, Calendar, HelpCircle, Info, AlertTriangle, Zap, Brain, BarChart3, Bell, AlertCircle, CheckCircle, Bot, Target, Clock, TrendingDown, Trophy, XCircle, DollarSign, Percent, Database, FileSpreadsheet, Search, RefreshCw, ChevronDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { format, startOfDay, subDays, subMonths, subYears } from 'date-fns';
import { toZonedTime } from "date-fns-tz";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ValidationResultsDialog } from "@/components/validation-results-dialog";
import { TierGate } from "@/components/tier-gate";
import { useAuth } from "@/hooks/useAuth";
import type { EngineHealthAlert } from "@shared/schema";
import { ENGINE_LABELS, ENGINE_COLORS, SIGNAL_STRENGTH_BAND_LABELS } from "@shared/constants";
import { RiskDisclosure } from "@/components/risk-disclosure";
import { PageHeader } from "@/components/page-header";

const EngineTrendsChart = lazy(() => import("@/components/engine-trends-chart"));
const ConfidenceCalibration = lazy(() => import("@/components/confidence-calibration"));
const CalibrationCurve = lazy(() => import("@/components/calibration-curve"));
const EngineActualPerformance = lazy(() => import("@/components/engine-actual-performance"));
const StreakTracker = lazy(() => import("@/components/streak-tracker"));
const LossPatternsDashboard = lazy(() => import("@/components/loss-patterns-dashboard"));
const SignalAttributionDashboard = lazy(() => import("@/components/signal-attribution-dashboard"));
const SymbolLeaderboard = lazy(() => import("@/components/symbol-leaderboard"));
const TimeOfDayHeatmap = lazy(() => import("@/components/time-of-day-heatmap"));
import { SignalWeightsPanel } from "@/components/signal-weights-panel";

function ChartSkeleton() {
  return (
    <div className="h-48 w-full animate-pulse bg-muted/30 rounded-lg flex items-center justify-center">
      <span className="text-muted-foreground text-sm">Loading...</span>
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
  highConfidence?: { bands: string; trades: number; wins: number; losses: number; winRate: number; };
  mediumPlusConfidence?: { bands: string; trades: number; wins: number; losses: number; winRate: number; };
  allConfidence?: { bands: string; trades: number; wins: number; losses: number; winRate: number; };
}

interface FilterBreakdown {
  rawTotal: number;
  filterStages: Array<{ stage: string; count: number; excluded: number; reason: string; }>;
  filteredTotal: number;
  breakdown: { open: number; expired: number; breakeven: number; decidedWins: number; decidedLosses: number; decidedTotal: number; };
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
    byConfidence: Array<{ band: string; trades: number; wins: number; losses: number; winRate: number; }>;
  }>;
  confidenceBands: string[];
  summary: { totalEngines: number; totalResolvedTrades: number; };
}

interface SegmentWinRate {
  winRate: number;
  wins: number;
  losses: number;
  decided: number;
}

interface PerformanceStats {
  overall: {
    totalIdeas: number; openIdeas: number; closedIdeas: number; wonIdeas: number; lostIdeas: number;
    expiredIdeas: number; winRate: number; quantAccuracy: number; directionalAccuracy: number;
    avgPercentGain: number; avgHoldingTimeMinutes: number; sharpeRatio: number; maxDrawdown: number;
    profitFactor: number; expectancy: number; evScore: number; adjustedWeightedAccuracy: number;
    oppositeDirectionRate: number; oppositeDirectionCount: number; avgWinSize: number; avgLossSize: number;
  };
  segmentedWinRates: {
    equities: SegmentWinRate;
    options: SegmentWinRate;
    overall: SegmentWinRate;
  };
  bySource: Array<{ source: string; totalIdeas: number; wonIdeas: number; lostIdeas: number; winRate: number; avgPercentGain: number; }>;
  byAssetType: Array<{ assetType: string; totalIdeas: number; wonIdeas: number; lostIdeas: number; winRate: number; avgPercentGain: number; }>;
  bySignalType: Array<{ signal: string; totalIdeas: number; wonIdeas: number; lostIdeas: number; winRate: number; avgPercentGain: number; }>;
}

interface EngineMetrics {
  ideasGenerated: number; ideasPublished: number; tradesResolved: number; tradesWon: number;
  tradesLost: number; tradesExpired: number; winRate: number | null; avgGainPercent: number | null;
  avgLossPercent: number | null; expectancy: number | null; avgHoldingTimeMinutes: number | null;
  avgConfidenceScore: number | null;
}

interface EngineHealthData {
  todayMetrics: Record<string, EngineMetrics>;
  weekMetrics: Record<string, EngineMetrics>;
  historicalMetrics: Array<{ date: string; engine: string; winRate: number | null; }>;
  activeAlerts: EngineHealthAlert[];
}

interface AutoLottoBotPerformance {
  overall: { totalTrades: number; wins: number; losses: number; winRate: number; totalPnL: number; avgPnL: number; openPositions: number; unrealizedPnL: number; };
  options: { totalTrades: number; wins: number; losses: number; winRate: number; totalPnL: number; portfolio: any; };
  futures: { totalTrades: number; wins: number; losses: number; winRate: number; totalPnL: number; portfolio: any; };
  byExitReason: Array<{ reason: string; count: number; wins: number; winRate: number; }>;
  bestTrade: { symbol: string; optionType: string; strikePrice?: number; pnl: number; pnlPercent?: number; } | null;
  worstTrade: { symbol: string; optionType: string; strikePrice?: number; pnl: number; pnlPercent?: number; } | null;
  recentTrades: Array<{ symbol: string; optionType: string; strikePrice?: number; realizedPnL: number; realizedPnLPercent?: number; exitReason: string; closedAt: string; }>;
  unrealizedPnL: number;
}

const AUDIT_TIMEZONE = "America/Chicago";

interface BotAuditData {
  summary: { totalTrades: number; closedTrades: number; openTrades: number; wins: number; losses: number; winRate: number; totalPnL: number; };
  trades: BotTrade[];
}

interface BotTrade {
  tradeNumber: number; id: string; symbol: string; optionType: string | null; strikePrice: number | null;
  direction: string; entryTime: string; entryTimeFormatted: string; entryDayOfWeek: string;
  entrySession: string; entryPrice: number; entryCost: number; quantity: number; dteAtEntry: number | null;
  status: string; exitTime: string | null; exitTimeFormatted: string | null; exitDayOfWeek: string | null;
  exitSession: string | null; exitPrice: number | null; exitReason: string | null; realizedPnL: number | null;
  realizedPnLPercent: number | null; targetPrice: number; stopLoss: number; holdTimeFormatted: string | null;
  tradeIdeaId: string | null;
}

interface IdeasAuditData {
  summary: { totalIdeas: number; closedIdeas: number; openIdeas: number; wins: number; losses: number; expired: number; winRateVsLosses: number; winRateVsAll: number; };
  ideas: IdeaAudit[];
}

interface IdeaAudit {
  ideaNumber: number; id: string; symbol: string; assetType: string; direction: string;
  optionType: string | null; strikePrice: number | null; dteAtIdea: number | null;
  ideaTimeFormatted: string; ideaDayOfWeek: string; ideaSession: string; entryPrice: number;
  targetPrice: number; stopLoss: number; outcomeStatus: string; exitDateFormatted: string | null;
  exitDayOfWeek: string | null; exitSession: string | null; exitPrice: number | null;
  percentGain: number | null; source: string; confidenceScore: number | null; holdingPeriod: string | null;
}

interface DataIssue {
  type: 'warning' | 'error' | 'info';
  category: string;
  description: string;
  affectedCount: number;
  details?: string[];
}

const ENGINE_CONFIG = {
  flow: { label: "Flow Scanner", icon: Activity, bgClass: "bg-cyan-500/10", textClass: "text-cyan-400", borderClass: "border-cyan-500/30" },
  quant: { label: "Quant Engine", icon: BarChart3, bgClass: "bg-blue-500/10", textClass: "text-blue-400", borderClass: "border-blue-500/30" },
  ai: { label: "AI Engine", icon: Brain, bgClass: "bg-purple-500/10", textClass: "text-purple-400", borderClass: "border-purple-500/30" },
  lotto: { label: "Lotto Detector", icon: Zap, bgClass: "bg-amber-500/10", textClass: "text-amber-400", borderClass: "border-amber-500/30" },
  hybrid: { label: "Hybrid", icon: Target, bgClass: "bg-green-500/10", textClass: "text-green-400", borderClass: "border-green-500/30" },
} as const;

type EngineKey = keyof typeof ENGINE_CONFIG;

function getWinRateColor(winRate: number | null): string {
  if (winRate === null) return "text-muted-foreground";
  if (winRate >= 60) return "text-green-400";
  if (winRate >= 50) return "text-amber-400";
  return "text-red-400";
}

function getOutcomeBadge(status: string | null) {
  switch (status) {
    case "hit_target": return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Win</Badge>;
    case "hit_stop": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Loss</Badge>;
    case "expired": return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Expired</Badge>;
    case "closed": return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Closed</Badge>;
    default: return <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">Open</Badge>;
  }
}

function getAuditSourceBadge(source: string) {
  switch (source) {
    case "ai": return <Badge variant="outline" className="border-purple-500/50 text-purple-400">AI</Badge>;
    case "quant": return <Badge variant="outline" className="border-blue-500/50 text-blue-400">Quant</Badge>;
    case "lotto": return <Badge variant="outline" className="border-pink-500/50 text-pink-400">Lotto</Badge>;
    case "flow": return <Badge variant="outline" className="border-cyan-500/50 text-cyan-400">Flow</Badge>;
    case "chart": return <Badge variant="outline" className="border-amber-500/50 text-amber-400">Chart</Badge>;
    default: return <Badge variant="outline">{source}</Badge>;
  }
}

function KPIStrip({ stats, botData, engineHealthData }: { 
  stats: PerformanceStats; 
  botData?: AutoLottoBotPerformance;
  engineHealthData?: EngineHealthData;
}) {
  const bestEngine = useMemo(() => {
    if (!engineHealthData?.weekMetrics) return null;
    let best: { key: string; winRate: number } | null = null;
    Object.entries(engineHealthData.weekMetrics).forEach(([key, metrics]) => {
      if (metrics.winRate !== null && (!best || metrics.winRate > best.winRate)) {
        best = { key, winRate: metrics.winRate };
      }
    });
    return best;
  }, [engineHealthData]);

  return (
    <div className="flex flex-wrap gap-3" data-testid="kpi-strip">
      <div className="stat-glass rounded-lg p-3 text-center min-w-[90px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">Ideas</p>
        <p className="text-xl font-bold font-mono tabular-nums text-cyan-400" data-testid="kpi-total-ideas">
          {stats.overall.totalIdeas}
        </p>
      </div>
      <div className="stat-glass rounded-lg p-3 text-center min-w-[180px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">Win Rates</p>
        <div className="flex items-center justify-center gap-2 text-sm font-mono tabular-nums" data-testid="kpi-win-rate-segmented">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span className={cn("font-bold", getWinRateColor(stats.segmentedWinRates?.equities?.winRate ?? 0))}>
                  {stats.segmentedWinRates?.equities?.decided > 0 
                    ? `${stats.segmentedWinRates.equities.winRate.toFixed(0)}%` 
                    : '—'}
                </span>
                <span className="text-[10px] text-muted-foreground ml-0.5">EQ</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Equities: {stats.segmentedWinRates?.equities?.wins ?? 0}W / {stats.segmentedWinRates?.equities?.losses ?? 0}L</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-muted-foreground">|</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span className={cn("font-bold", getWinRateColor(stats.segmentedWinRates?.options?.winRate ?? 0))}>
                  {stats.segmentedWinRates?.options?.decided > 0 
                    ? `${stats.segmentedWinRates.options.winRate.toFixed(0)}%` 
                    : '—'}
                </span>
                <span className="text-[10px] text-muted-foreground ml-0.5">OPT</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Options: {stats.segmentedWinRates?.options?.wins ?? 0}W / {stats.segmentedWinRates?.options?.losses ?? 0}L</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-muted-foreground">|</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span className={cn("font-bold", getWinRateColor(stats.segmentedWinRates?.overall?.winRate ?? 0))}>
                  {stats.segmentedWinRates?.overall?.decided > 0 
                    ? `${stats.segmentedWinRates.overall.winRate.toFixed(0)}%` 
                    : '—'}
                </span>
                <span className="text-[10px] text-muted-foreground ml-0.5">ALL</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Overall: {stats.segmentedWinRates?.overall?.wins ?? 0}W / {stats.segmentedWinRates?.overall?.losses ?? 0}L</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <div className="stat-glass rounded-lg p-3 text-center min-w-[90px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">Bot P&L</p>
        <p className={cn("text-xl font-bold font-mono tabular-nums", (botData?.overall.totalPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400")} data-testid="kpi-total-pnl">
          {botData ? `${botData.overall.totalPnL >= 0 ? '+' : ''}$${botData.overall.totalPnL.toFixed(0)}` : 'N/A'}
        </p>
      </div>
      <div className="stat-glass rounded-lg p-3 text-center min-w-[90px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">Open</p>
        <p className="text-xl font-bold font-mono tabular-nums text-blue-400" data-testid="kpi-open-positions">
          {stats.overall.openIdeas + (botData?.overall.openPositions ?? 0)}
        </p>
      </div>
      <div className="stat-glass rounded-lg p-3 text-center min-w-[90px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">W / L</p>
        <p className="text-xl font-bold font-mono tabular-nums" data-testid="kpi-wl">
          <span className="text-green-400">{stats.overall.wonIdeas}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-red-400">{stats.overall.lostIdeas}</span>
        </p>
      </div>
      <div className="stat-glass rounded-lg p-3 text-center min-w-[90px] flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">Best Engine</p>
        {bestEngine ? (
          <div className="flex items-center justify-center gap-1 mt-1">
            <Badge className={cn("text-xs", ENGINE_CONFIG[bestEngine.key as EngineKey]?.bgClass, ENGINE_CONFIG[bestEngine.key as EngineKey]?.textClass)}>
              {bestEngine.key.toUpperCase()}
            </Badge>
            <span className="text-sm font-mono text-green-400">{bestEngine.winRate.toFixed(0)}%</span>
          </div>
        ) : (
          <p className="text-lg font-mono text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}

function EnginePerformanceAccordion({ engineHealthData, isLoading }: { engineHealthData?: EngineHealthData; isLoading: boolean }) {
  const engines: EngineKey[] = ["flow", "ai", "quant", "lotto"];
  
  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <Accordion type="single" collapsible className="space-y-2" data-testid="engine-accordion">
      {engines.map((engineKey) => {
        const config = ENGINE_CONFIG[engineKey];
        const Icon = config.icon;
        const weekData = engineHealthData?.weekMetrics?.[engineKey];
        const todayData = engineHealthData?.todayMetrics?.[engineKey];
        
        return (
          <AccordionItem key={engineKey} value={engineKey} className="border rounded-lg bg-background/50">
            <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid={`accordion-trigger-${engineKey}`}>
              <div className="flex items-center justify-between w-full pr-4">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", config.bgClass)}>
                    <Icon className={cn("h-4 w-4", config.textClass)} />
                  </div>
                  <span className="font-medium">{config.label}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className={cn("font-mono font-bold", getWinRateColor(weekData?.winRate ?? null))}>
                    {weekData?.winRate !== null ? `${weekData.winRate.toFixed(0)}%` : '—'}
                  </span>
                  <span className="text-muted-foreground font-mono">
                    {weekData?.tradesWon ?? 0}W/{weekData?.tradesLost ?? 0}L
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {weekData?.ideasGenerated ?? 0} ideas
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Today</p>
                  <p className="font-mono font-bold">{todayData?.ideasGenerated ?? 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">7 Days</p>
                  <p className="font-mono font-bold">{weekData?.ideasGenerated ?? 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Expectancy</p>
                  <p className={cn("font-mono font-bold", (weekData?.expectancy ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                    {weekData?.expectancy !== null ? `${weekData.expectancy > 0 ? '+' : ''}${weekData.expectancy.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Avg Hold</p>
                  <p className="font-mono text-sm">
                    {weekData?.avgHoldingTimeMinutes ? `${Math.round(weekData.avgHoldingTimeMinutes)}m` : '—'}
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

function AutoLottoBotSummary({ data, isLoading }: { data?: AutoLottoBotPerformance; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-24" />;
  if (!data) return null;

  return (
    <Card className="glass-card" data-testid="card-auto-lotto-summary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-amber-400" />
            <CardTitle className="text-base">Auto-Lotto Bot</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
              Opts: {data.options.totalTrades}
            </Badge>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
              Futs: {data.futures.totalTrades}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <div className="text-center min-w-[70px] flex-1">
            <p className="text-xs text-muted-foreground truncate">Trades</p>
            <p className="text-xl font-bold font-mono tabular-nums" data-testid="bot-trades">{data.overall.totalTrades}</p>
          </div>
          <div className="text-center min-w-[70px] flex-1">
            <p className="text-xs text-muted-foreground truncate">Wins</p>
            <p className="text-xl font-bold font-mono tabular-nums text-green-400" data-testid="bot-wins">{data.overall.wins}</p>
          </div>
          <div className="text-center min-w-[70px] flex-1">
            <p className="text-xs text-muted-foreground truncate">Losses</p>
            <p className="text-xl font-bold font-mono tabular-nums text-red-400" data-testid="bot-losses">{data.overall.losses}</p>
          </div>
          <div className="text-center min-w-[80px] flex-1">
            <p className="text-xs text-muted-foreground truncate">Win Rate</p>
            <p className={cn("text-xl font-bold font-mono tabular-nums", getWinRateColor(data.overall.winRate))} data-testid="bot-winrate">
              {data.overall.winRate.toFixed(1)}%
            </p>
          </div>
          <div className="text-center min-w-[90px] flex-1">
            <p className="text-xs text-muted-foreground truncate">Total P&L</p>
            <p className={cn("text-xl font-bold font-mono tabular-nums", data.overall.totalPnL >= 0 ? "text-green-400" : "text-red-400")} data-testid="bot-pnl">
              {data.overall.totalPnL >= 0 ? '+' : ''}${data.overall.totalPnL.toFixed(2)}
            </p>
          </div>
          <div className="text-center min-w-[70px] flex-1">
            <p className="text-xs text-muted-foreground truncate">Open</p>
            <p className="text-xl font-bold font-mono tabular-nums text-blue-400" data-testid="bot-open">{data.overall.openPositions}</p>
          </div>
        </div>
        
        <Accordion type="single" collapsible className="mt-4">
          <AccordionItem value="details" className="border-0">
            <AccordionTrigger className="text-xs text-muted-foreground py-2 hover:no-underline">
              Best/Worst Trades & Exit Analysis
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {data.bestTrade && (
                  <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
                    <p className="text-xs text-muted-foreground mb-1">Best Trade</p>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{data.bestTrade.symbol}</span>
                      <span className="font-mono text-green-400">+${data.bestTrade.pnl.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                {data.worstTrade && (
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
                    <p className="text-xs text-muted-foreground mb-1">Worst Trade</p>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{data.worstTrade.symbol}</span>
                      <span className="font-mono text-red-400">${data.worstTrade.pnl.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="p-3 rounded-lg border border-border/50 bg-background/50">
                  <p className="text-xs text-muted-foreground mb-1">Exit Reasons</p>
                  <div className="flex flex-wrap gap-1">
                    {data.byExitReason.slice(0, 3).map(e => (
                      <Badge key={e.reason} variant="outline" className="text-[10px]">
                        {e.reason.replace(/_/g, ' ')}: {e.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

function SignalStrengthSummary({ calibratedStats }: { calibratedStats?: CalibratedStats }) {
  if (!calibratedStats?.confidenceBreakdown) return null;

  return (
    <Card className="glass-card" data-testid="card-signal-strength">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-cyan-400" />
          <CardTitle className="text-base">Signal Strength by Band</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
          {calibratedStats.confidenceBreakdown.map((band) => {
            const bandLetter = band.level.charAt(0);
            return (
              <div key={band.level} className={cn(
                "p-2 rounded-lg text-center border",
                band.winRate >= 60 ? "bg-green-500/10 border-green-500/30" :
                band.winRate >= 50 ? "bg-cyan-500/10 border-cyan-500/30" :
                band.winRate >= 40 ? "bg-amber-500/10 border-amber-500/30" :
                "bg-red-500/10 border-red-500/30"
              )} data-testid={`signal-band-${bandLetter}`}>
                <Badge variant="outline" className={cn(
                  "text-[10px] mb-1",
                  bandLetter === 'A' ? "text-green-400 border-green-500/50" :
                  bandLetter === 'B' ? "text-cyan-400 border-cyan-500/50" :
                  bandLetter === 'C' ? "text-amber-400 border-amber-500/50" :
                  "text-muted-foreground"
                )}>
                  {bandLetter}
                </Badge>
                <p className={cn("text-lg font-bold font-mono", getWinRateColor(band.winRate))}>
                  {band.winRate.toFixed(0)}%
                </p>
                <p className="text-[10px] text-muted-foreground">{band.trades}t</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DataAuditTab() {
  const [activeAuditTab, setActiveAuditTab] = useState("bot");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("7d");

  const { data: botData, isLoading: botLoading, refetch: refetchBot } = useQuery<BotAuditData>({ queryKey: ['/api/audit/auto-lotto-bot'] });
  const { data: ideasData, isLoading: ideasLoading, refetch: refetchIdeas } = useQuery<IdeasAuditData>({ queryKey: ['/api/audit/trade-ideas'] });

  const filterByDateRange = <T extends { entryTime?: string; ideaTime?: string }>(items: T[]): T[] => {
    if (dateRangeFilter === 'all') return items;
    const now = new Date();
    let cutoff: Date;
    switch (dateRangeFilter) {
      case '1d': cutoff = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); break;
      case '7d': cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      default: return items;
    }
    return items.filter(item => {
      const timeStr = item.entryTime || item.ideaTime;
      if (!timeStr) return true;
      return new Date(timeStr) >= cutoff;
    });
  };

  const dataIssues = useMemo<DataIssue[]>(() => {
    const issues: DataIssue[] = [];
    if (botData?.trades) {
      const buggyShortPuts = botData.trades.filter(t => 
        t.direction === 'short' && t.optionType === 'put' && t.status === 'closed' && t.realizedPnL !== null &&
        ((t.exitReason?.includes('target') && t.realizedPnL < 0) || (t.exitReason?.includes('stop') && t.realizedPnL > 0))
      );
      if (buggyShortPuts.length > 0) {
        issues.push({ type: 'error', category: 'P&L Bug', description: 'Inverted P&L on PUT trades', affectedCount: buggyShortPuts.length });
      }
    }
    if (ideasData?.ideas) {
      const extremeGains = ideasData.ideas.filter(i => i.percentGain !== null && (i.percentGain > 1000 || i.percentGain < -100));
      if (extremeGains.length > 0) {
        issues.push({ type: 'error', category: 'Data Bug', description: 'Impossible percent gains', affectedCount: extremeGains.length });
      }
    }
    return issues;
  }, [botData, ideasData]);

  const errorCount = dataIssues.filter(i => i.type === 'error').length;
  const warningCount = dataIssues.filter(i => i.type === 'warning').length;

  const filteredBotTrades = useMemo(() => {
    if (!botData?.trades) return [];
    let filtered = filterByDateRange(botData.trades);
    if (symbolFilter) filtered = filtered.filter(t => t.symbol.toLowerCase().includes(symbolFilter.toLowerCase()));
    if (statusFilter !== 'all') {
      if (statusFilter === 'win') filtered = filtered.filter(t => t.realizedPnL !== null && t.realizedPnL > 0);
      else if (statusFilter === 'loss') filtered = filtered.filter(t => t.realizedPnL !== null && t.realizedPnL <= 0);
      else if (statusFilter === 'open') filtered = filtered.filter(t => t.status === 'open');
    }
    return filtered;
  }, [botData, symbolFilter, statusFilter, dateRangeFilter]);

  const filteredIdeas = useMemo(() => {
    if (!ideasData?.ideas) return [];
    let filtered = filterByDateRange(ideasData.ideas);
    if (symbolFilter) filtered = filtered.filter(i => i.symbol.toLowerCase().includes(symbolFilter.toLowerCase()));
    if (statusFilter !== 'all') {
      if (statusFilter === 'win') filtered = filtered.filter(i => i.outcomeStatus === 'hit_target');
      else if (statusFilter === 'loss') filtered = filtered.filter(i => i.outcomeStatus === 'hit_stop');
      else if (statusFilter === 'expired') filtered = filtered.filter(i => i.outcomeStatus === 'expired');
      else if (statusFilter === 'open') filtered = filtered.filter(i => i.outcomeStatus === 'open');
    }
    if (sourceFilter !== 'all') filtered = filtered.filter(i => i.source === sourceFilter);
    return filtered.slice(0, 100);
  }, [ideasData, symbolFilter, statusFilter, sourceFilter, dateRangeFilter]);

  const handleExport = (type: 'bot' | 'ideas') => {
    const url = type === 'bot' ? '/api/audit/auto-lotto-bot?format=csv' : '/api/audit/trade-ideas?format=csv';
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {errorCount > 0 && <Badge className="bg-red-500/20 text-red-400">{errorCount} Errors</Badge>}
          {warningCount > 0 && <Badge className="bg-amber-500/20 text-amber-400">{warningCount} Warnings</Badge>}
          {errorCount === 0 && warningCount === 0 && <Badge className="bg-green-500/20 text-green-400">No Issues</Badge>}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Symbol..." value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())} className="w-28 pl-8 h-9" data-testid="input-audit-symbol" />
        </div>
        <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
          <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Today</SelectItem>
            <SelectItem value="7d">7 Days</SelectItem>
            <SelectItem value="30d">30 Days</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="win">Wins</SelectItem>
            <SelectItem value="loss">Losses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => { refetchBot(); refetchIdeas(); }} data-testid="button-refresh-audit">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport(activeAuditTab === 'bot' ? 'bot' : 'ideas')} data-testid="button-export-csv">
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeAuditTab} onValueChange={setActiveAuditTab}>
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="bot" data-testid="tab-audit-bot">Bot ({botData?.summary?.totalTrades || 0})</TabsTrigger>
          <TabsTrigger value="ideas" data-testid="tab-audit-ideas">Ideas ({ideasData?.summary?.totalIdeas || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="bot" className="mt-4">
          <Card className="glass-card">
            <CardContent className="p-0">
              {botLoading ? <Skeleton className="h-48 m-4" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Symbol</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Entry</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">P&L</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Exit</th>
                    </tr></thead>
                    <tbody>
                      {filteredBotTrades.slice(0, 50).map((trade) => (
                        <tr key={trade.id} className="border-b border-border/30" data-testid={`row-bot-${trade.tradeNumber}`}>
                          <td className="py-2 px-3 font-mono text-muted-foreground text-xs">{trade.tradeNumber}</td>
                          <td className="py-2 px-3">
                            <span className="font-semibold">{trade.symbol}</span>
                            {trade.optionType && <Badge variant="outline" className={cn("ml-1 text-[10px]", trade.optionType === 'call' ? "text-green-400" : "text-red-400")}>{trade.optionType[0].toUpperCase()}</Badge>}
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">{trade.entryTimeFormatted}</td>
                          <td className={cn("py-2 px-3 text-right font-mono font-semibold", (trade.realizedPnL ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                            {trade.realizedPnL !== null ? `${trade.realizedPnL >= 0 ? '+' : ''}$${trade.realizedPnL.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground truncate max-w-[120px]">{trade.exitReason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ideas" className="mt-4">
          <div className="mb-3">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-28 h-9"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ai">AI</SelectItem>
                <SelectItem value="quant">Quant</SelectItem>
                <SelectItem value="flow">Flow</SelectItem>
                <SelectItem value="lotto">Lotto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card className="glass-card">
            <CardContent className="p-0">
              {ideasLoading ? <Skeleton className="h-48 m-4" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Symbol</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Source</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Gain</th>
                    </tr></thead>
                    <tbody>
                      {filteredIdeas.slice(0, 50).map((idea) => (
                        <tr key={idea.id} className="border-b border-border/30" data-testid={`row-idea-${idea.ideaNumber}`}>
                          <td className="py-2 px-3 font-semibold">{idea.symbol}</td>
                          <td className="py-2 px-3">{getAuditSourceBadge(idea.source)}</td>
                          <td className="py-2 px-3">{getOutcomeBadge(idea.outcomeStatus)}</td>
                          <td className={cn("py-2 px-3 text-right font-mono", (idea.percentGain ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                            {idea.percentGain !== null ? `${idea.percentGain >= 0 ? '+' : ''}${idea.percentGain.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PerformancePage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState("analytics");
  const [dateRange, setDateRange] = useState("all");
  const [selectedEngine, setSelectedEngine] = useState("all");
  const [isValidating, setIsValidating] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const [validationSummary, setValidationSummary] = useState({ validated: 0, updated: 0 });

  const apiFilters = useMemo(() => {
    let startDate: string | null = null;
    let endDate: string | null = null;
    const now = new Date();
    switch (dateRange) {
      case 'today': startDate = format(startOfDay(now), 'yyyy-MM-dd'); endDate = format(now, 'yyyy-MM-dd'); break;
      case '7d': startDate = format(subDays(now, 7), 'yyyy-MM-dd'); break;
      case '30d': startDate = format(subDays(now, 30), 'yyyy-MM-dd'); break;
      case '3m': startDate = format(subMonths(now, 3), 'yyyy-MM-dd'); break;
      case '1y': startDate = format(subYears(now, 1), 'yyyy-MM-dd'); break;
    }
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return params.toString() ? `?${params.toString()}` : '';
  }, [dateRange]);

  const { data: stats, isLoading } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats', apiFilters],
    staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });

  const { data: engineHealthData, isLoading: isEngineHealthLoading } = useQuery<EngineHealthData>({
    queryKey: ["/api/engine-health"],
    staleTime: 30000, refetchInterval: 60000,
  });

  const { data: calibratedStats } = useQuery<CalibratedStats>({
    queryKey: ["/api/performance/calibrated-stats"],
    staleTime: 60000,
  });

  const { data: autoLottoBotData, isLoading: isAutoLottoBotLoading } = useQuery<AutoLottoBotPerformance>({
    queryKey: ["/api/performance/auto-lotto-bot"],
    staleTime: 30000, refetchInterval: 60000,
  });

  const handleExport = () => { window.location.href = '/api/performance/export'; };

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const response = await apiRequest('POST', '/api/performance/validate');
      const result = await response.json();
      setValidationResults(result.results || []);
      setValidationSummary({ validated: result.validated, updated: result.updated });
      setShowValidationDialog(true);
      toast({ title: "Validation Complete", description: `Validated ${result.validated} ideas, updated ${result.updated}` });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
    } catch (error) {
      toast({ title: "Validation Failed", variant: "destructive" });
    } finally {
      setIsValidating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <Card className="glass-card p-6">
          <h2 className="text-xl font-bold">No Performance Data</h2>
          <p className="text-muted-foreground mt-2">Start generating research briefs to see performance metrics</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <PageHeader 
        label="Analytics"
        title="Performance"
        description="Track trading performance metrics"
        icon={Target}
        iconColor="text-green-400"
        iconGradient="from-green-500/20 to-emerald-500/20"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleValidate} disabled={isValidating} data-testid="button-validate">
              <Activity className={cn("w-4 h-4 mr-1", isValidating && 'animate-spin')} />
              {isValidating ? 'Validating...' : 'Validate'}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleExport} data-testid="button-export">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <KPIStrip stats={stats} botData={autoLottoBotData} engineHealthData={engineHealthData} />

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="analytics" className="gap-2" data-testid="tab-analytics">
            <Target className="h-4 w-4" />Analytics
          </TabsTrigger>
          <TabsTrigger value="data-audit" className="gap-2" data-testid="tab-data-audit">
            <Database className="h-4 w-4" />Data Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4">
          <EnginePerformanceAccordion engineHealthData={engineHealthData} isLoading={isEngineHealthLoading} />
          <AutoLottoBotSummary data={autoLottoBotData} isLoading={isAutoLottoBotLoading} />
          <SignalStrengthSummary calibratedStats={calibratedStats} />
          
          <Card className="glass-card p-4" data-testid="section-trends">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
              <h3 className="font-semibold">Weekly Trends</h3>
            </div>
            <Suspense fallback={<ChartSkeleton />}>
              <EngineTrendsChart />
            </Suspense>
          </Card>

          <Accordion type="single" collapsible className="space-y-2" data-testid="advanced-analytics-accordion">
            <AccordionItem value="advanced" className="border rounded-lg">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Advanced Analytics</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <TierGate feature="performance" blur>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-cyan-400">Actual Engine Performance</h4>
                      <Suspense fallback={<ChartSkeleton />}><EngineActualPerformance /></Suspense>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-cyan-400">Performance Streak</h4>
                      <Suspense fallback={<ChartSkeleton />}><StreakTracker selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} /></Suspense>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-cyan-400">Symbol Leaderboard</h4>
                      <Suspense fallback={<ChartSkeleton />}><SymbolLeaderboard selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} /></Suspense>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-cyan-400">Time-of-Day Performance</h4>
                      <Suspense fallback={<ChartSkeleton />}><TimeOfDayHeatmap selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} /></Suspense>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-cyan-400">Signal Calibration</h4>
                      <Suspense fallback={<ChartSkeleton />}><ConfidenceCalibration selectedEngine={selectedEngine === 'all' ? undefined : selectedEngine} /></Suspense>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-cyan-400">Calibration Curve</h4>
                      <Suspense fallback={<ChartSkeleton />}><CalibrationCurve /></Suspense>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-amber-400">Loss Patterns</h4>
                      <Suspense fallback={<ChartSkeleton />}><LossPatternsDashboard /></Suspense>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-cyan-400">Signal Attribution</h4>
                      <Suspense fallback={<ChartSkeleton />}><SignalAttributionDashboard /></Suspense>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-3 text-purple-400">Dynamic Signal Weights</h4>
                      <SignalWeightsPanel />
                    </div>
                  </div>
                </TierGate>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex items-center gap-3 flex-wrap p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-32 h-9" data-testid="select-date-range"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="7d">7 Days</SelectItem>
                  <SelectItem value="30d">30 Days</SelectItem>
                  <SelectItem value="3m">3 Months</SelectItem>
                  <SelectItem value="1y">1 Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedEngine} onValueChange={setSelectedEngine}>
                <SelectTrigger className="w-32 h-9" data-testid="select-engine"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Engines</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="quant">Quant</SelectItem>
                  <SelectItem value="flow">Flow</SelectItem>
                  <SelectItem value="lotto">Lotto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="data-audit">
          <DataAuditTab />
        </TabsContent>
      </Tabs>

      <RiskDisclosure />
      
      <ValidationResultsDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        results={validationResults}
        summary={validationSummary}
      />
    </div>
  );
}
