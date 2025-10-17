import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, TrendingDown, Activity, Target, XCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    closedIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    expiredIdeas: number;
    winRate: number;
    avgPercentGain: number;
    avgHoldingTimeMinutes: number;
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

export default function PerformancePage() {
  const { data: stats, isLoading } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats'],
  });

  const { data: trends } = useQuery<TrendData>({
    queryKey: ['/api/ml/win-rate-trend'],
    enabled: !!stats && stats.overall.closedIdeas > 0,
  });

  const handleExport = () => {
    window.location.href = '/api/performance/export';
  };

  const handleValidate = async () => {
    try {
      const response = await fetch('/api/performance/validate', {
        method: 'POST',
      });
      const result = await response.json();
      console.log('Validation result:', result);
      window.location.reload(); // Refresh to show updated stats
    } catch (error) {
      console.error('Validation error:', error);
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Performance Tracker</h1>
          <p className="text-muted-foreground">
            Validate trade ideas and analyze performance metrics
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleValidate}
            data-testid="button-validate-ideas"
          >
            <Activity className="w-4 h-4 mr-2" />
            Validate Ideas
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

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card data-testid="card-total-ideas">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Total Ideas</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {stats.overall.totalIdeas}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.overall.openIdeas} open • {stats.overall.closedIdeas} closed
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-win-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Target className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {stats.overall.winRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.overall.wonIdeas} wins • {stats.overall.lostIdeas} losses
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-gain">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Avg Gain</CardTitle>
            {stats.overall.avgPercentGain >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${
              stats.overall.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {stats.overall.avgPercentGain >= 0 ? '+' : ''}
              {stats.overall.avgPercentGain.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Across {stats.overall.closedIdeas} closed ideas
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-holding-time">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-1">
            <CardTitle className="text-sm font-medium">Avg Hold Time</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatTime(stats.overall.avgHoldingTimeMinutes)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.overall.expiredIdeas} expired ideas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Trends Charts */}
      {stats.overall.closedIdeas >= 10 && trends && trends.dataPoints.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Win Rate Trend */}
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
                  <Tooltip 
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

          {/* Cumulative P&L */}
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
                  <Tooltip 
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

      {/* Smart Insights (if enough data) */}
      {stats.overall.closedIdeas >= 5 && (
        <Card className="border-primary/20 bg-primary/5" data-testid="card-insights">
          <CardHeader>
            <CardTitle>Smart Insights</CardTitle>
            <CardDescription>
              Data-driven recommendations based on your performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.overall.winRate >= 60 ? (
              <p className="text-sm">✅ Strong performance! Your win rate is above 60%.</p>
            ) : stats.overall.winRate < 50 ? (
              <p className="text-sm">⚠️ Win rate below 50%. Review losing trades to identify patterns.</p>
            ) : (
              <p className="text-sm">📊 Win rate around 50%. Focus on improving risk/reward ratio.</p>
            )}
            
            {stats.bySource.length > 0 && (
              (() => {
                const bestSource = stats.bySource.reduce((best, source) => 
                  source.winRate > best.winRate && source.totalIdeas >= 3 ? source : best
                );
                return bestSource.totalIdeas >= 3 ? (
                  <p className="text-sm">
                    🎯 Your best strategy: <strong>{bestSource.source.toUpperCase()}</strong> ideas 
                    ({bestSource.winRate.toFixed(1)}% win rate)
                  </p>
                ) : null;
              })()
            )}
            
            {stats.overall.avgPercentGain > 0 && stats.overall.closedIdeas >= 5 && (
              <p className="text-sm">
                💰 Positive expectancy: Average gain of +{stats.overall.avgPercentGain.toFixed(2)}% per trade
              </p>
            )}

            <p className="text-sm text-muted-foreground mt-4">
              💡 View the <strong>Signal Intelligence</strong> page for deeper pattern analysis
            </p>
          </CardContent>
        </Card>
      )}

      {/* By Source */}
      <Card data-testid="card-performance-by-source">
        <CardHeader>
          <CardTitle>Performance by Source</CardTitle>
          <CardDescription>
            Compare AI vs Quant vs Manual trade ideas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.bySource.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No closed ideas yet. Performance data will appear here once ideas are resolved.
              </p>
            ) : (
              stats.bySource.map((source) => (
                <div key={source.source} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        source.source === 'ai' ? 'default' : 
                        source.source === 'quant' ? 'secondary' : 
                        'outline'
                      } data-testid={`badge-source-${source.source}`}>
                        {source.source.toUpperCase()}
                      </Badge>
                      <span className="text-sm font-medium">
                        {source.totalIdeas} ideas
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {source.wonIdeas} wins • {source.lostIdeas} losses
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-xl font-bold font-mono" data-testid={`text-winrate-${source.source}`}>
                      {source.winRate.toFixed(1)}%
                    </div>
                    <div className={`text-sm font-mono ${
                      source.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {source.avgPercentGain >= 0 ? '+' : ''}
                      {source.avgPercentGain.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* By Asset Type */}
      <Card data-testid="card-performance-by-asset">
        <CardHeader>
          <CardTitle>Performance by Asset Type</CardTitle>
          <CardDescription>
            Compare stocks vs options vs crypto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.byAssetType.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No closed ideas yet. Performance data will appear here once ideas are resolved.
              </p>
            ) : (
              stats.byAssetType.map((asset) => (
                <div key={asset.assetType} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" data-testid={`badge-asset-${asset.assetType}`}>
                        {asset.assetType.toUpperCase()}
                      </Badge>
                      <span className="text-sm font-medium">
                        {asset.totalIdeas} ideas
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {asset.wonIdeas} wins • {asset.lostIdeas} losses
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-xl font-bold font-mono" data-testid={`text-winrate-${asset.assetType}`}>
                      {asset.winRate.toFixed(1)}%
                    </div>
                    <div className={`text-sm font-mono ${
                      asset.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {asset.avgPercentGain >= 0 ? '+' : ''}
                      {asset.avgPercentGain.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* By Signal Type */}
      {stats.bySignalType.length > 0 && (
        <Card data-testid="card-performance-by-signal">
          <CardHeader>
            <CardTitle>Performance by Signal Type</CardTitle>
            <CardDescription>
              Which technical signals perform best
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.bySignalType
                .sort((a, b) => b.winRate - a.winRate)
                .slice(0, 10)
                .map((signal) => (
                  <div key={signal.signal} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">
                          {signal.signal.replace(/_/g, ' ')}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {signal.totalIdeas}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {signal.wonIdeas} wins • {signal.lostIdeas} losses
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-xl font-bold font-mono">
                        {signal.winRate.toFixed(1)}%
                      </div>
                      <div className={`text-sm font-mono ${
                        signal.avgPercentGain >= 0 ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {signal.avgPercentGain >= 0 ? '+' : ''}
                        {signal.avgPercentGain.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
