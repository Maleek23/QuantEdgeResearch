import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart } from "recharts";
import { TrendingDown, TrendingUp, Activity, Info, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EquityCurvePoint {
  tradeIndex: number;
  date: string;
  cumulative: number;
  peak: number;
  drawdown: number;
  drawdownPercent: number;
}

interface DrawdownPeriod {
  start: number;
  end: number;
  depth: number;
  recoveryTrades: number;
}

interface DrawdownAnalysisData {
  equityCurve: EquityCurvePoint[];
  drawdownPeriods: DrawdownPeriod[];
  summary: {
    totalTrades: number;
    totalReturn: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    currentDrawdown: number;
    currentDrawdownPercent: number;
    isInDrawdown: boolean;
    totalDrawdownPeriods: number;
    avgRecoveryTrades: number;
    calmarRatio: number;
  };
}

function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="font-semibold text-sm">Trade #{data.tradeIndex}</p>
        <p className="text-xs text-muted-foreground mb-2">{data.date}</p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Cumulative P&L:</span>
            <span className={cn(
              "font-mono font-semibold",
              data.cumulative >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {data.cumulative >= 0 ? '+' : ''}{data.cumulative}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Peak:</span>
            <span className="font-mono text-cyan-500">{data.peak}%</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Drawdown:</span>
            <span className={cn(
              "font-mono",
              data.drawdown > 0 ? "text-red-500" : "text-green-500"
            )}>
              -{data.drawdown}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export default function DrawdownAnalysisChart() {
  const { data, isLoading, error } = useQuery<DrawdownAnalysisData>({
    queryKey: ['/api/performance/drawdown-analysis'],
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-drawdown-analysis-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card data-testid="card-drawdown-analysis-error">
        <CardHeader>
          <CardTitle>Drawdown Analysis</CardTitle>
          <CardDescription>Peak-to-trough performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load drawdown analysis.</p>
        </CardContent>
      </Card>
    );
  }

  const { equityCurve, summary } = data;

  return (
    <Card data-testid="card-drawdown-analysis">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              Drawdown Analysis
              <TooltipProvider>
                <TooltipUI>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Measures the decline from peak cumulative returns. 
                    Essential for understanding risk exposure and recovery patterns.</p>
                  </TooltipContent>
                </TooltipUI>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Equity curve and drawdown metrics from {summary.totalTrades} trades
            </CardDescription>
          </div>
          {summary.isInDrawdown ? (
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              In Drawdown
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              At Peak
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-xs text-muted-foreground">Total Return</p>
            <p className={cn(
              "font-semibold font-mono text-lg",
              summary.totalReturn >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {summary.totalReturn >= 0 ? '+' : ''}{summary.totalReturn}%
            </p>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-muted-foreground">Max Drawdown</p>
            <p className="font-semibold font-mono text-lg text-red-500">-{summary.maxDrawdown}%</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-muted-foreground">Current DD</p>
            <p className={cn(
              "font-semibold font-mono text-lg",
              summary.currentDrawdown > 0 ? "text-amber-500" : "text-green-500"
            )}>
              {summary.currentDrawdown > 0 ? `-${summary.currentDrawdown}%` : 'None'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <p className="text-xs text-muted-foreground">Calmar Ratio</p>
            <TooltipProvider>
              <TooltipUI>
                <TooltipTrigger>
                  <p className={cn(
                    "font-semibold font-mono text-lg",
                    summary.calmarRatio >= 1 ? "text-green-500" : 
                    summary.calmarRatio >= 0.5 ? "text-cyan-500" : "text-amber-500"
                  )}>
                    {summary.calmarRatio}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Return / Max Drawdown</p>
                  <p className="text-xs text-muted-foreground">&gt;1 = Good risk-adjusted returns</p>
                </TooltipContent>
              </TooltipUI>
            </TooltipProvider>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground">Avg Recovery</p>
            <p className="font-semibold font-mono text-lg">{summary.avgRecoveryTrades} trades</p>
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={equityCurve} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 45%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(0, 72%, 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis 
                dataKey="tradeIndex" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                label={{ value: 'Cumulative %', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="cumulative" 
                stroke="hsl(142, 76%, 45%)"
                fill="url(#equityGradient)" 
                strokeWidth={2}
                name="Equity Curve"
              />
              <Line 
                type="monotone" 
                dataKey="peak" 
                stroke="hsl(190, 95%, 50%)" 
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="Peak"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center gap-4 justify-center text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 bg-green-500/40 rounded border border-green-500" />
            <span className="text-muted-foreground">Equity Curve</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-cyan-500 rounded" style={{ borderBottom: '2px dashed hsl(190, 95%, 50%)' }} />
            <span className="text-muted-foreground">High Water Mark</span>
          </div>
        </div>

        {summary.totalDrawdownPeriods > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2 font-medium">
              {summary.totalDrawdownPeriods} drawdown periods recorded
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Risk Assessment:</span>{' '}
              {summary.maxDrawdownPercent > 30 
                ? 'High risk profile - consider tighter position sizing'
                : summary.maxDrawdownPercent > 15 
                ? 'Moderate risk - acceptable for active trading'
                : 'Low drawdown - conservative risk profile'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
