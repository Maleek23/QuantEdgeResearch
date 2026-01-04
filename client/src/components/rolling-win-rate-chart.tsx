import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, ComposedChart } from "recharts";
import { TrendingUp, TrendingDown, Minus, Activity, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Tooltip as TooltipUI, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RollingDataPoint {
  tradeIndex: number;
  date: string;
  winRate: number;
  cumulativeWinRate: number;
  avgPnL: number;
  wins: number;
  losses: number;
}

interface RollingWinRateData {
  rollingData: RollingDataPoint[];
  summary: {
    totalTrades: number;
    windowSize: number;
    trend?: string;
    currentWinRate?: number;
    maxWinRate?: number;
    minWinRate?: number;
    volatility?: number;
    insufficientData?: boolean;
    message?: string;
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
            <span className="text-muted-foreground">Rolling Win Rate:</span>
            <span className={cn(
              "font-mono font-semibold",
              data.winRate >= 60 ? "text-green-500" : data.winRate >= 50 ? "text-amber-500" : "text-red-500"
            )}>
              {data.winRate}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Cumulative:</span>
            <span className="font-mono text-cyan-500">{data.cumulativeWinRate}%</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Window W/L:</span>
            <span className="font-mono">{data.wins}W / {data.losses}L</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Avg P&L:</span>
            <span className={cn("font-mono", data.avgPnL >= 0 ? "text-green-500" : "text-red-500")}>
              {data.avgPnL >= 0 ? '+' : ''}{data.avgPnL}%
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function getTrendIcon(trend: string | undefined) {
  switch (trend) {
    case 'improving':
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    case 'declining':
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    default:
      return <Minus className="w-4 h-4 text-muted-foreground" />;
  }
}

function getTrendBadge(trend: string | undefined) {
  switch (trend) {
    case 'improving':
      return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">Improving</Badge>;
    case 'declining':
      return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">Declining</Badge>;
    default:
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Stable</Badge>;
  }
}

export default function RollingWinRateChart() {
  const [windowSize, setWindowSize] = useState("20");
  
  const { data, isLoading, error } = useQuery<RollingWinRateData>({
    queryKey: ['/api/performance/rolling-win-rate', windowSize],
    queryFn: async () => {
      const response = await fetch(`/api/performance/rolling-win-rate?window=${windowSize}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch rolling win rate');
      return response.json();
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-rolling-win-rate-loading">
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
      <Card data-testid="card-rolling-win-rate-error">
        <CardHeader>
          <CardTitle>Rolling Win Rate</CardTitle>
          <CardDescription>Performance trends over time</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load rolling win rate data.</p>
        </CardContent>
      </Card>
    );
  }

  const { rollingData, summary } = data;

  if (summary.insufficientData) {
    return (
      <Card data-testid="card-rolling-win-rate-insufficient">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Rolling Win Rate
          </CardTitle>
          <CardDescription>Performance trends over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-600 dark:text-amber-400">
              <p className="font-medium">Insufficient Data</p>
              <p className="text-xs mt-1">{summary.message}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-rolling-win-rate">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Rolling Win Rate
              <TooltipProvider>
                <TooltipUI>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Shows win rate calculated over a rolling window of trades. 
                    Helps identify performance trends and regime changes.</p>
                  </TooltipContent>
                </TooltipUI>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              {summary.totalTrades} trades analyzed with {summary.windowSize}-trade window
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {getTrendBadge(summary.trend)}
            <Select value={windowSize} onValueChange={setWindowSize}>
              <SelectTrigger className="w-24" data-testid="select-window-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 trades</SelectItem>
                <SelectItem value="20">20 trades</SelectItem>
                <SelectItem value="30">30 trades</SelectItem>
                <SelectItem value="50">50 trades</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground">Current</p>
            <p className={cn(
              "font-semibold font-mono text-lg",
              (summary.currentWinRate || 0) >= 60 ? "text-green-500" : 
              (summary.currentWinRate || 0) >= 50 ? "text-amber-500" : "text-red-500"
            )}>
              {summary.currentWinRate}%
            </p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-xs text-muted-foreground">Peak</p>
            <p className="font-semibold font-mono text-lg text-green-500">{summary.maxWinRate}%</p>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-muted-foreground">Trough</p>
            <p className="font-semibold font-mono text-lg text-red-500">{summary.minWinRate}%</p>
          </div>
          <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <p className="text-xs text-muted-foreground">Volatility</p>
            <p className="font-semibold font-mono text-lg text-cyan-500">{summary.volatility}%</p>
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rollingData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="winRateGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142, 76%, 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142, 76%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis 
                dataKey="tradeIndex" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                label={{ value: 'Trade #', position: 'insideBottomRight', offset: -5, fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <YAxis 
                domain={[0, 100]}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              />
              <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" label={{ value: '50%', position: 'left', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="winRate" 
                stroke="none"
                fill="url(#winRateGradient)" 
              />
              <Line 
                type="monotone" 
                dataKey="winRate" 
                stroke="hsl(142, 76%, 45%)" 
                strokeWidth={2}
                dot={false}
                name="Rolling Win Rate"
              />
              <Line 
                type="monotone" 
                dataKey="cumulativeWinRate" 
                stroke="hsl(190, 95%, 50%)" 
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                name="Cumulative"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center gap-4 justify-center text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-green-500 rounded" />
            <span className="text-muted-foreground">Rolling ({summary.windowSize}-trade)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-cyan-500 rounded border-dashed" style={{ borderBottom: '2px dashed hsl(190, 95%, 50%)' }} />
            <span className="text-muted-foreground">Cumulative</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-muted-foreground/50 rounded" style={{ borderBottom: '1px dashed' }} />
            <span className="text-muted-foreground">50% breakeven</span>
          </div>
        </div>

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Interpretation:</span> The rolling line shows localized performance trends.
            Large deviations from cumulative indicate regime changes. Volatility above 30% suggests inconsistent execution.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
