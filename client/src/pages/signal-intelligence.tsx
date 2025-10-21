import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Target, TrendingUp, Clock, BarChart3, Sparkles, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SignalAnalysis {
  signal: string;
  totalTrades: number;
  winRate: number;
  avgPercentGain: number;
  avgHoldingTimeMinutes: number;
  avgRiskReward: number;
  reliabilityScore: number;
  expectancy: number;
  avgWinSize: number;
  avgLossSize: number;
  grade: string;
}

interface SignalCombination {
  combination: string;
  occurrences: number;
  winRate: number;
  avgGain: number;
}

interface AssetComparison {
  assetType: string;
  totalTrades: number;
  winRate: number;
  avgPercentGain: number;
  avgHoldingTimeMinutes: number;
}

interface IntelligenceData {
  signalAnalysis: SignalAnalysis[];
  topCombinations: SignalCombination[];
  assetComparison: AssetComparison[];
  insights: string[];
  totalAnalyzedTrades: number;
  timestamp: string;
  insufficientData?: boolean;
}

export default function SignalIntelligencePage() {
  const [sortBy, setSortBy] = useState<keyof SignalAnalysis>('reliabilityScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data: intelligence, isLoading } = useQuery<IntelligenceData>({
    queryKey: ['/api/ml/signal-intelligence'],
    refetchInterval: 120000, // Refresh every 2 minutes
  });

  const handleSort = (column: keyof SignalAnalysis) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const sortedSignals = intelligence?.signalAnalysis.slice().sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    return (aVal > bVal ? 1 : -1) * multiplier;
  });

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!intelligence || intelligence.totalAnalyzedTrades === 0 || intelligence.insufficientData) {
    const message = intelligence?.insights?.[0] || 
      "Close at least 10 trades to start analyzing signal effectiveness. Generate some ideas and record their outcomes on the Performance page.";
    
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {intelligence?.insufficientData ? 'Insufficient Data for ML Analysis' : 'No Data Available'}
            </CardTitle>
            <CardDescription>
              {message}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Calculate quick stats for summary cards
  const topSignal = intelligence.signalAnalysis.length > 0
    ? intelligence.signalAnalysis.reduce((best, sig) => sig.reliabilityScore > best.reliabilityScore ? sig : best)
    : null;
  
  const avgWinRate = intelligence.signalAnalysis.length > 0
    ? intelligence.signalAnalysis.reduce((sum, sig) => sum + sig.winRate, 0) / intelligence.signalAnalysis.length
    : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative pt-6">
          <h1 className="text-3xl font-bold flex items-center gap-2 text-gradient-premium">
            <Sparkles className="w-8 h-8 text-primary" />
            Signal Intelligence
          </h1>
          <p className="text-muted-foreground">
            Machine learning insights from {intelligence.totalAnalyzedTrades} analyzed trades
          </p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      {/* Summary Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="stat-card shadow-lg border-primary/20" data-testid="card-signals-analyzed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
            <CardTitle className="text-sm font-semibold tracking-wide">Signals Analyzed</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <Target className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold font-mono tracking-tight">
              {intelligence.signalAnalysis.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Across {intelligence.totalAnalyzedTrades} trades
            </p>
          </CardContent>
        </Card>

        <Card className="stat-card shadow-lg border-green-500/20" data-testid="card-top-signal">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
            <CardTitle className="text-sm font-semibold tracking-wide">Top Signal</CardTitle>
            <div className="p-2 rounded-lg bg-green-500/10">
              <TrendingUp className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold font-mono tracking-tight text-green-500">
              {topSignal ? topSignal.signal : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              {topSignal ? `${topSignal.reliabilityScore.toFixed(1)} reliability` : 'No data'}
            </p>
          </CardContent>
        </Card>

        <Card className="stat-card shadow-lg border-blue-500/20" data-testid="card-avg-win-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-1">
            <CardTitle className="text-sm font-semibold tracking-wide">Avg Win Rate</CardTitle>
            <div className="p-2 rounded-lg bg-blue-500/10">
              <BarChart3 className="w-4 h-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold font-mono tracking-tight text-blue-500">
              {avgWinRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Across all signals
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Smart Insights Panel */}
      {intelligence.insights.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Smart Insights
            </CardTitle>
            <CardDescription>ML-driven recommendations based on pattern analysis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {intelligence.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                <Badge variant="outline" className="mt-0.5 shrink-0">{i + 1}</Badge>
                <p className="text-sm leading-relaxed">{insight}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="signals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="signals" data-testid="tab-signals">
            Signal Effectiveness
          </TabsTrigger>
          <TabsTrigger value="combinations" data-testid="tab-combinations">
            Winning Patterns
          </TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets">
            Asset Performance
          </TabsTrigger>
        </TabsList>

        {/* Signal Effectiveness Table */}
        <TabsContent value="signals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Signal Effectiveness Ranking</CardTitle>
              <CardDescription>
                Which technical indicators produce the best results? Click column headers to sort.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="cursor-pointer hover-elevate font-semibold" onClick={() => handleSort('signal')}>
                        Signal
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right font-semibold" onClick={() => handleSort('reliabilityScore')}>
                        Reliability
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right font-semibold" onClick={() => handleSort('winRate')}>
                        Win Rate
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right font-semibold" onClick={() => handleSort('totalTrades')}>
                        Trades
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right font-semibold" onClick={() => handleSort('expectancy')}>
                        Expectancy
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right font-semibold" onClick={() => handleSort('avgRiskReward')}>
                        Avg R:R
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right font-semibold" onClick={() => handleSort('avgHoldingTimeMinutes')}>
                        Avg Time
                      </TableHead>
                      <TableHead className="text-right font-semibold">Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSignals?.map((signal, index) => (
                      <TableRow 
                        key={signal.signal} 
                        data-testid={`row-signal-${signal.signal}`}
                        className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                      >
                        <TableCell className="font-medium py-4">{signal.signal}</TableCell>
                        <TableCell className="text-right">
                          <span className={
                            signal.reliabilityScore >= 60 ? "text-green-500 font-semibold" :
                            signal.reliabilityScore >= 40 ? "text-amber-500" :
                            "text-red-500"
                          }>
                            {signal.reliabilityScore.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={
                            signal.winRate >= 60 ? "text-green-500" :
                            signal.winRate >= 50 ? "text-amber-500" :
                            "text-red-500"
                          }>
                            {signal.winRate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{signal.totalTrades}</TableCell>
                        <TableCell className="text-right">
                          <span className={signal.expectancy > 0 ? "text-green-500" : "text-red-500"}>
                            {signal.expectancy > 0 ? '+' : ''}{signal.expectancy.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{signal.avgRiskReward.toFixed(2)}:1</TableCell>
                        <TableCell className="text-right">{formatTime(signal.avgHoldingTimeMinutes)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={
                            signal.grade === 'A' ? 'default' :
                            signal.grade === 'B' ? 'secondary' :
                            'outline'
                          }>
                            {signal.grade}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 text-sm text-muted-foreground space-y-1">
                <p><strong>Reliability Score:</strong> Win rate weighted by sample size (higher is better)</p>
                <p><strong>Expectancy:</strong> Average expected return per trade (considers win rate + win/loss sizes)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Winning Combinations */}
        <TabsContent value="combinations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Winning Signal Combinations</CardTitle>
              <CardDescription>
                Discover which signals work best together
              </CardDescription>
            </CardHeader>
            <CardContent>
              {intelligence.topCombinations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No signal combinations found yet.</p>
                  <p className="text-sm">Need more trades with multiple signals to detect patterns.</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Combination</TableHead>
                        <TableHead className="text-right font-semibold">Occurrences</TableHead>
                        <TableHead className="text-right font-semibold">Win Rate</TableHead>
                        <TableHead className="text-right font-semibold">Avg Gain</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {intelligence.topCombinations.map((combo, i) => (
                        <TableRow 
                          key={i} 
                          data-testid={`row-combo-${i}`}
                          className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                        >
                          <TableCell className="font-medium">{combo.combination}</TableCell>
                          <TableCell className="text-right">{combo.occurrences}</TableCell>
                          <TableCell className="text-right">
                            <span className={
                              combo.winRate >= 70 ? "text-green-500 font-semibold" :
                              combo.winRate >= 60 ? "text-green-500" :
                              combo.winRate >= 50 ? "text-amber-500" :
                              "text-red-500"
                            }>
                              {combo.winRate.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={combo.avgGain > 0 ? "text-green-500" : "text-red-500"}>
                              {combo.avgGain > 0 ? '+' : ''}{combo.avgGain.toFixed(2)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Asset Performance */}
        <TabsContent value="assets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Asset Type Performance</CardTitle>
              <CardDescription>
                Compare performance across stocks, options, and crypto
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Asset Type</TableHead>
                      <TableHead className="text-right font-semibold">Total Trades</TableHead>
                      <TableHead className="text-right font-semibold">Win Rate</TableHead>
                      <TableHead className="text-right font-semibold">Avg Gain</TableHead>
                      <TableHead className="text-right font-semibold">Avg Hold Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intelligence.assetComparison.map((asset, index) => (
                      <TableRow 
                        key={asset.assetType} 
                        data-testid={`row-asset-${asset.assetType}`}
                        className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                      >
                        <TableCell className="font-medium uppercase">{asset.assetType}</TableCell>
                        <TableCell className="text-right">{asset.totalTrades}</TableCell>
                        <TableCell className="text-right">
                          <span className={
                            asset.winRate >= 60 ? "text-green-500 font-semibold" :
                            asset.winRate >= 50 ? "text-green-500" :
                            asset.winRate >= 40 ? "text-amber-500" :
                            "text-red-500"
                          }>
                            {asset.winRate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={asset.avgPercentGain > 0 ? "text-green-500" : "text-red-500"}>
                            {asset.avgPercentGain > 0 ? '+' : ''}{asset.avgPercentGain.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{formatTime(asset.avgHoldingTimeMinutes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
