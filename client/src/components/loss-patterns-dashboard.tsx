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
  AlertCircle,
  Shield,
  Zap,
  Volume2
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend } from "recharts";

interface LossSummary {
  totalLosses: number;
  totalLossAmount: number;
  avgLoss: number;
  topReasons: { reason: string; count: number; avgLoss: number }[];
  worstSymbols: { symbol: string; count: number; totalLoss: number }[];
  engineBreakdown: { engine: string; count: number; avgLoss: number }[];
}

// Human-readable reason labels with hex colors for charts
const REASON_LABELS: Record<string, { label: string; icon: JSX.Element; color: string; hexColor: string; description: string }> = {
  market_reversal: { label: "Market Reversal", icon: <TrendingDown className="w-4 h-4" />, color: "text-red-500", hexColor: "#ef4444", description: "Market turned against position" },
  sector_weakness: { label: "Sector Weakness", icon: <Activity className="w-4 h-4" />, color: "text-orange-500", hexColor: "#f97316", description: "Sector-wide headwinds" },
  bad_timing: { label: "Bad Timing", icon: <Clock className="w-4 h-4" />, color: "text-yellow-500", hexColor: "#eab308", description: "Poor entry timing" },
  news_catalyst_failed: { label: "News Failed", icon: <AlertCircle className="w-4 h-4" />, color: "text-purple-500", hexColor: "#a855f7", description: "Expected catalyst didn't materialize" },
  stop_too_tight: { label: "Stop Too Tight", icon: <Target className="w-4 h-4" />, color: "text-blue-500", hexColor: "#3b82f6", description: "Normal volatility triggered stop" },
  overconfident_signal: { label: "Overconfident Signal", icon: <Zap className="w-4 h-4" />, color: "text-amber-500", hexColor: "#f59e0b", description: "High confidence but still failed" },
  low_volume_trap: { label: "Low Volume Trap", icon: <Volume2 className="w-4 h-4" />, color: "text-gray-500", hexColor: "#6b7280", description: "Trapped in illiquid name" },
  gap_down_open: { label: "Gap Down Open", icon: <TrendingDown className="w-4 h-4" />, color: "text-red-600", hexColor: "#dc2626", description: "Gapped past stop loss" },
  trend_exhaustion: { label: "Trend Exhaustion", icon: <Activity className="w-4 h-4" />, color: "text-orange-600", hexColor: "#ea580c", description: "Entered at extended move" },
  fundamental_miss: { label: "Fundamental Miss", icon: <Lightbulb className="w-4 h-4" />, color: "text-blue-600", hexColor: "#2563eb", description: "AI missed fundamental red flag" },
  technical_breakdown: { label: "Technical Breakdown", icon: <BarChart3 className="w-4 h-4" />, color: "text-indigo-500", hexColor: "#6366f1", description: "Key level didn't hold" },
  options_decay: { label: "Options Decay", icon: <Clock className="w-4 h-4" />, color: "text-pink-500", hexColor: "#ec4899", description: "Theta ate into position" },
  volatility_crush: { label: "Volatility Crush", icon: <TrendingDown className="w-4 h-4" />, color: "text-rose-500", hexColor: "#f43f5e", description: "IV crush after catalyst" },
  correlation_blindspot: { label: "Correlation Blindspot", icon: <Shield className="w-4 h-4" />, color: "text-violet-500", hexColor: "#8b5cf6", description: "Missed correlation risk" },
  unknown: { label: "Unknown", icon: <AlertCircle className="w-4 h-4" />, color: "text-gray-400", hexColor: "#9ca3af", description: "Requires manual review" },
};

// Engine config for charts
const ENGINE_COLORS: Record<string, string> = {
  ai: "#a855f7",
  quant: "#3b82f6",
  hybrid: "#8b5cf6",
  flow: "#22d3ee",
  lotto: "#f59e0b",
  chart_analysis: "#ec4899",
  news: "#22c55e",
  flow_scanner: "#22d3ee",
  lotto_scanner: "#f59e0b",
};

// Pie chart component for loss reasons
function LossReasonsPieChart({ data }: { data: { reason: string; count: number; avgLoss: number }[] }) {
  const chartData = data.map(item => ({
    name: REASON_LABELS[item.reason]?.label || item.reason,
    value: item.count,
    avgLoss: Math.abs(item.avgLoss),
    color: REASON_LABELS[item.reason]?.hexColor || "#6b7280",
  }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <RechartsTooltip
            contentStyle={{ 
              backgroundColor: 'hsl(var(--card))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px'
            }}
            formatter={(value: number, name: string, props: any) => [
              `${value} trades (${props.payload.avgLoss.toFixed(1)}% avg loss)`,
              name
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Bar chart component for engine breakdown
function EngineBreakdownChart({ data }: { data: { engine: string; count: number; avgLoss: number }[] }) {
  const chartData = data.map(item => ({
    name: formatEngine(item.engine),
    losses: item.count,
    avgLoss: Math.abs(item.avgLoss),
    fill: ENGINE_COLORS[item.engine] || "#6b7280",
  }));

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 70, right: 20 }}>
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="name" 
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
            width={65} 
          />
          <RechartsTooltip
            contentStyle={{ 
              backgroundColor: 'hsl(var(--card))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '12px'
            }}
            formatter={(value: number, name: string, props: any) => [
              `${value} losses (${props.payload.avgLoss.toFixed(1)}% avg)`,
              'Count'
            ]}
          />
          <Bar dataKey="losses" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

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

        {/* Loss Reasons with Pie Chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div data-testid="loss-reasons-section">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              Top Loss Reasons
            </h4>
            
            {summary.topReasons.length > 0 && (
              <LossReasonsPieChart data={summary.topReasons} />
            )}
            
            <TooltipProvider>
              <div className="space-y-3 mt-4">
                {summary.topReasons.map((reason, index) => {
                  const info = getReasonInfo(reason.reason);
                  const percentage = (reason.count / maxReasonCount) * 100;
                  
                  return (
                    <Tooltip key={index}>
                      <TooltipTrigger asChild>
                        <div className="space-y-1 cursor-help" data-testid={`loss-reason-${reason.reason}`}>
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
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        <p className="font-medium">{info.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{info.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>
          
          {/* Engine Breakdown with Bar Chart */}
          <div data-testid="engine-breakdown-section">
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Losses by Engine
            </h4>
            {summary.engineBreakdown.length > 0 ? (
              <>
                <EngineBreakdownChart data={summary.engineBreakdown} />
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {summary.engineBreakdown.map((engine, index) => (
                    <div 
                      key={index} 
                      className="p-3 rounded-lg bg-muted/50 flex justify-between items-center"
                      data-testid={`engine-loss-${engine.engine}`}
                    >
                      <span className="text-sm font-medium">{formatEngine(engine.engine)}</span>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground">{engine.count}</span>
                        <span className="text-xs text-red-500 ml-2">({engine.avgLoss.toFixed(1)}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No engine data available</p>
            )}
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

        {/* Educational Disclaimer */}
        <div className="p-3 rounded-lg bg-muted/30 border border-muted text-xs text-muted-foreground">
          <strong>📚 Educational Note:</strong> Understanding why trades fail is as important as knowing why they succeed. 
          This analysis helps identify patterns in losses to improve future trade selection and risk management.
        </div>
      </CardContent>
    </Card>
  );
}

export default LossPatternsDashboard;
