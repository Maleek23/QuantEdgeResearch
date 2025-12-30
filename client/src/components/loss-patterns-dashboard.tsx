import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertTriangle, 
  TrendingDown, 
  BarChart3, 
  Target, 
  Clock,
  Lightbulb,
  Activity,
  AlertCircle
} from "lucide-react";

interface LossSummary {
  totalLosses: number;
  totalLossAmount: number;
  avgLoss: number;
  topReasons: { reason: string; count: number; avgLoss: number }[];
  worstSymbols: { symbol: string; count: number; totalLoss: number }[];
  engineBreakdown: { engine: string; count: number; avgLoss: number }[];
}

// Human-readable reason labels
const REASON_LABELS: Record<string, { label: string; icon: JSX.Element; color: string }> = {
  market_reversal: { label: "Market Reversal", icon: <TrendingDown className="w-4 h-4" />, color: "text-red-500" },
  sector_weakness: { label: "Sector Weakness", icon: <Activity className="w-4 h-4" />, color: "text-orange-500" },
  bad_timing: { label: "Bad Timing", icon: <Clock className="w-4 h-4" />, color: "text-yellow-500" },
  news_catalyst_failed: { label: "News Failed", icon: <AlertCircle className="w-4 h-4" />, color: "text-purple-500" },
  stop_too_tight: { label: "Stop Too Tight", icon: <Target className="w-4 h-4" />, color: "text-blue-500" },
  overconfident_signal: { label: "Overconfident Signal", icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-500" },
  low_volume_trap: { label: "Low Volume Trap", icon: <BarChart3 className="w-4 h-4" />, color: "text-gray-500" },
  gap_down_open: { label: "Gap Down Open", icon: <TrendingDown className="w-4 h-4" />, color: "text-red-600" },
  trend_exhaustion: { label: "Trend Exhaustion", icon: <Activity className="w-4 h-4" />, color: "text-orange-600" },
  fundamental_miss: { label: "Fundamental Miss", icon: <Lightbulb className="w-4 h-4" />, color: "text-blue-600" },
  technical_breakdown: { label: "Technical Breakdown", icon: <BarChart3 className="w-4 h-4" />, color: "text-indigo-500" },
  options_decay: { label: "Options Decay", icon: <Clock className="w-4 h-4" />, color: "text-pink-500" },
  volatility_crush: { label: "Volatility Crush", icon: <TrendingDown className="w-4 h-4" />, color: "text-rose-500" },
  correlation_blindspot: { label: "Correlation Blindspot", icon: <Activity className="w-4 h-4" />, color: "text-violet-500" },
  unknown: { label: "Unknown", icon: <AlertCircle className="w-4 h-4" />, color: "text-gray-400" },
};

function getReasonInfo(reason: string) {
  return REASON_LABELS[reason] || REASON_LABELS.unknown;
}

function formatEngine(engine: string): string {
  const labels: Record<string, string> = {
    ai: "AI Engine",
    quant: "Quant Engine",
    hybrid: "Hybrid Engine",
    flow_scanner: "Flow Scanner",
    chart_analysis: "Chart Analysis",
    lotto_scanner: "Lotto Scanner",
  };
  return labels[engine] || engine;
}

export function LossPatternsDashboard() {
  const { data: summary, isLoading, error } = useQuery<LossSummary>({
    queryKey: ["/api/loss-analysis/summary"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Loss Patterns Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !summary) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Loss Patterns Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No loss analysis data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  if (summary.totalLosses === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Loss Patterns Dashboard
          </CardTitle>
          <CardDescription>Post-mortem analysis of failed trades</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No losses have been analyzed yet. Losses are automatically analyzed when trades hit their stop loss.</p>
        </CardContent>
      </Card>
    );
  }

  const maxReasonCount = Math.max(...summary.topReasons.map(r => r.count), 1);

  return (
    <Card className="w-full" data-testid="loss-patterns-dashboard">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Loss Patterns Dashboard
        </CardTitle>
        <CardDescription>Post-mortem analysis of {summary.totalLosses} failed trades</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4" data-testid="loss-summary-stats">
          <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-2xl font-bold text-red-500">{summary.totalLosses}</p>
            <p className="text-sm text-muted-foreground">Total Losses</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-2xl font-bold text-amber-500">{summary.avgLoss.toFixed(2)}%</p>
            <p className="text-sm text-muted-foreground">Avg Loss</p>
          </div>
          <div className="text-center p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-2xl font-bold text-orange-500">{summary.totalLossAmount.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground">Total Lost</p>
          </div>
        </div>

        {/* Top Loss Reasons */}
        <div data-testid="loss-reasons-section">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            Top Loss Reasons
          </h4>
          <div className="space-y-3">
            {summary.topReasons.map((reason, index) => {
              const info = getReasonInfo(reason.reason);
              const percentage = (reason.count / maxReasonCount) * 100;
              
              return (
                <div key={index} className="space-y-1" data-testid={`loss-reason-${reason.reason}`}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={info.color}>{info.icon}</span>
                      <span>{info.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {reason.count} trades
                      </Badge>
                      <span className="text-red-500 text-xs font-mono">
                        {reason.avgLoss.toFixed(2)}% avg
                      </span>
                    </div>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Worst Symbols */}
        {summary.worstSymbols.length > 0 && (
          <div data-testid="worst-symbols-section">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              Worst Performing Symbols
            </h4>
            <div className="flex flex-wrap gap-2">
              {summary.worstSymbols.slice(0, 8).map((symbol, index) => (
                <Badge 
                  key={index} 
                  variant="outline" 
                  className="bg-red-500/10 border-red-500/20"
                  data-testid={`worst-symbol-${symbol.symbol}`}
                >
                  <span className="font-mono font-bold">{symbol.symbol}</span>
                  <span className="ml-2 text-red-500">
                    {symbol.totalLoss.toFixed(1)}%
                  </span>
                  <span className="ml-1 text-muted-foreground">
                    ({symbol.count}x)
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Engine Breakdown */}
        {summary.engineBreakdown.length > 0 && (
          <div data-testid="engine-breakdown-section">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Loss by Engine
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {summary.engineBreakdown.map((engine, index) => (
                <div 
                  key={index} 
                  className="p-3 rounded-lg bg-muted/50 flex justify-between items-center"
                  data-testid={`engine-loss-${engine.engine}`}
                >
                  <span className="text-sm font-medium">{formatEngine(engine.engine)}</span>
                  <div className="text-right">
                    <span className="text-sm text-muted-foreground">{engine.count} losses</span>
                    <span className="text-xs text-red-500 ml-2">({engine.avgLoss.toFixed(1)}% avg)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Educational Disclaimer */}
        <div className="p-3 rounded-lg bg-muted/30 border border-muted text-xs text-muted-foreground">
          <strong>📚 Educational Note:</strong> Understanding why trades fail is as important as knowing why they succeed. 
          This analysis helps identify patterns in losses to improve future trade selection and risk management.
        </div>
      </CardContent>
    </Card>
  );
}
