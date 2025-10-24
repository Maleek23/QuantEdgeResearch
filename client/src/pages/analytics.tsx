import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, Target, Activity, AlertTriangle, LineChart as LineChartIcon, Sparkles, Brain } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from "recharts";

interface BacktestMetrics {
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  expectancy: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingTimeMinutes: number;
  totalReturn: number;
  returnPerDay: number;
}

interface SignalPerformance {
  signalName: string;
  trades: number;
  winRate: number;
  avgReturn: number;
  sharpe: number;
  contribution: number;
}

interface CalibrationPoint {
  bucket: string;
  predicted: number;
  actual: number;
  count: number;
}

export default function AnalyticsPage() {
  const [activeSource, setActiveSource] = useState<'all' | 'quant' | 'ai' | 'hybrid'>('all');

  const { data: backtestData, isLoading: backtestLoading } = useQuery<{
    metrics: BacktestMetrics;
    signalPerformance: SignalPerformance[];
    calibration: CalibrationPoint[];
    source: string;
  }>({
    queryKey: ['/api/analytics/backtest', activeSource],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/backtest?source=${activeSource}`);
      return res.json();
    }
  });

  const { data: rollingData, isLoading: rollingLoading } = useQuery<{
    data: Array<{ date: string; winRate: number; trades: number }>;
    windowSize: number;
    source: string;
  }>({
    queryKey: ['/api/analytics/rolling-winrate', activeSource],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/rolling-winrate?source=${activeSource}`);
      return res.json();
    }
  });

  if (backtestLoading || rollingLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const metrics = backtestData?.metrics;
  const signals = backtestData?.signalPerformance || [];
  const calibration = backtestData?.calibration || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-gradient-premium">Analytics Lab</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Performance metrics by generation source
                </p>
              </div>
            </div>
          </div>

          {/* Source Filter Tabs */}
          <Tabs value={activeSource} onValueChange={(value: any) => setActiveSource(value)} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-4">
              <TabsTrigger value="all" data-testid="tab-source-all">
                All Sources
              </TabsTrigger>
              <TabsTrigger value="quant" data-testid="tab-source-quant" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Quant
              </TabsTrigger>
              <TabsTrigger value="ai" data-testid="tab-source-ai" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                AI
              </TabsTrigger>
              <TabsTrigger value="hybrid" data-testid="tab-source-hybrid" className="gap-1.5">
                <Brain className="h-3.5 w-3.5" />
                Hybrid
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      {/* Source Badge */}
      {metrics && (
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="text-xs">
            Analyzing {activeSource === 'all' ? 'All Sources' : activeSource.toUpperCase()} performance
          </Badge>
          <span className="text-xs text-muted-foreground">
            {metrics.totalTrades} total trades ({metrics.winners}W / {metrics.losers}L)
          </span>
        </div>
      )}

      {/* Key Performance Metrics */}
      {metrics && (
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Core Performance Metrics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="hover-elevate">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{metrics.winRate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics.winners}W • {metrics.losers}L
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Avg Gain</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-emerald-500">
                    +{((metrics.avgWin || 0) * 100).toFixed(2)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Per winning trade
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Avg Loss</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-500">
                    {((metrics.avgLoss || 0) * 100).toFixed(2)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Per losing trade
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Expectancy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${metrics.expectancy >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    ${metrics.expectancy.toFixed(2)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Per trade
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Risk Metrics */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Risk & Drawdown Analysis
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="hover-elevate">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Sharpe Ratio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{metrics.sharpeRatio.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Target: &gt;1.5
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-500">
                    {metrics.maxDrawdownPercent.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Peak-to-trough
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{metrics.profitFactor.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Target: &gt;1.3
                  </p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Sortino Ratio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{metrics.sortinoRatio.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Downside risk
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Tabs for Different Analytics Views */}
      <Tabs defaultValue="rolling" className="space-y-4">
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-4">
          <TabsTrigger value="rolling" data-testid="tab-rolling-winrate">Rolling Win Rate</TabsTrigger>
          <TabsTrigger value="signals" data-testid="tab-signal-performance">Signal Performance</TabsTrigger>
          <TabsTrigger value="calibration" data-testid="tab-calibration">Calibration</TabsTrigger>
          <TabsTrigger value="metrics" data-testid="tab-additional-metrics">Additional Metrics</TabsTrigger>
        </TabsList>

        {/* Rolling Win Rate Chart */}
        <TabsContent value="rolling">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5 text-primary" />
                Rolling {rollingData?.windowSize}-Trade Win Rate
              </CardTitle>
              <CardDescription>
                Track model performance over time - detecting drift and learning curves
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rollingData && rollingData.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={rollingData.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="trades" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      label={{ value: 'Trade Number', position: 'insideBottom', offset: -5 }}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      label={{ value: 'Win Rate (%)', angle: -90, position: 'insideLeft' }}
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <ReferenceLine y={60} stroke="hsl(var(--primary))" strokeDasharray="3 3" label="Target" />
                    <Line 
                      type="monotone" 
                      dataKey="winRate" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                      name="Win Rate"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Need at least {rollingData?.windowSize || 10} closed trades for rolling win rate analysis
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signal Performance Breakdown */}
        <TabsContent value="signals">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Signal Performance Breakdown
              </CardTitle>
              <CardDescription>
                Which technical signals are driving returns? (Contribution to total)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {signals.length > 0 ? (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={signals}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="signalName" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        label={{ value: 'Win Rate (%)', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="winRate" fill="hsl(var(--primary))" name="Win Rate %" />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="space-y-3">
                    {signals.map((signal, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-lg hover-elevate">
                        <div className="flex-1">
                          <p className="font-semibold text-sm">{signal.signalName}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {signal.trades} trades
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {signal.winRate.toFixed(1)}% WR
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              Sharpe: {signal.sharpe.toFixed(2)}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">
                            {signal.contribution > 0 ? '+' : ''}{signal.contribution.toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground">contribution</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  No signal performance data available yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Confidence Score Calibration */}
        <TabsContent value="calibration">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Confidence Score Calibration
              </CardTitle>
              <CardDescription>
                Are our confidence scores well-calibrated? (Predicted vs. Actual Win Rate)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {calibration.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      type="number" 
                      dataKey="predicted" 
                      name="Predicted" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      label={{ value: 'Predicted Win Rate (%)', position: 'insideBottom', offset: -5 }}
                      domain={[60, 100]}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="actual" 
                      name="Actual"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      label={{ value: 'Actual Win Rate (%)', angle: -90, position: 'insideLeft' }}
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'predicted' || name === 'actual') {
                          return `${value.toFixed(1)}%`;
                        }
                        return value;
                      }}
                    />
                    <Legend />
                    {/* Perfect calibration line (diagonal) */}
                    <ReferenceLine 
                      segment={[{ x: 60, y: 60 }, { x: 100, y: 100 }]} 
                      stroke="hsl(var(--muted-foreground))" 
                      strokeDasharray="3 3"
                      label="Perfect Calibration"
                    />
                    <Scatter 
                      name="Confidence Buckets" 
                      data={calibration} 
                      fill="hsl(var(--primary))"
                      shape="circle"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Need more closed trades for calibration analysis
                </div>
              )}
              
              {calibration.length > 0 && (
                <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs font-semibold mb-2">Calibration Guide:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Points on the diagonal = well-calibrated</li>
                    <li>Points above diagonal = overconfident (actual win rate exceeds prediction)</li>
                    <li>Points below diagonal = underconfident (actual win rate below prediction)</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Additional Metrics Table */}
        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>Additional Metrics</CardTitle>
              <CardDescription>
                Extended performance details not shown in overview cards
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Return Details</h3>
                    <MetricRow label="Total Return" value={`${metrics.totalReturn.toFixed(2)}%`} />
                    <MetricRow label="Return Per Day" value={`${metrics.returnPerDay.toFixed(2)}%`} />
                    <MetricRow label="Largest Win" value={`${metrics.largestWin.toFixed(2)}%`} />
                    <MetricRow label="Largest Loss" value={`${metrics.largestLoss.toFixed(2)}%`} />
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm">Trade Streaks & Duration</h3>
                    <MetricRow label="Consecutive Wins" value={metrics.consecutiveWins.toString()} />
                    <MetricRow label="Consecutive Losses" value={metrics.consecutiveLosses.toString()} />
                    <MetricRow label="Avg Holding Time" value={`${Math.round(metrics.avgHoldingTimeMinutes)}min`} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-semibold">{value}</span>
    </div>
  );
}
