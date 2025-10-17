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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-primary" />
          Signal Intelligence
        </h1>
        <p className="text-muted-foreground">
          Machine learning insights from {intelligence.totalAnalyzedTrades} analyzed trades
        </p>
      </div>

      {/* Smart Insights Panel */}
      {intelligence.insights.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Smart Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {intelligence.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="text-lg">{insight.split(' ')[0]}</div>
                <p className="text-sm">{insight.substring(insight.indexOf(' ') + 1)}</p>
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
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer hover-elevate" onClick={() => handleSort('signal')}>
                        Signal
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right" onClick={() => handleSort('reliabilityScore')}>
                        Reliability
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right" onClick={() => handleSort('winRate')}>
                        Win Rate
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right" onClick={() => handleSort('totalTrades')}>
                        Trades
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right" onClick={() => handleSort('expectancy')}>
                        Expectancy
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right" onClick={() => handleSort('avgRiskReward')}>
                        Avg R:R
                      </TableHead>
                      <TableHead className="cursor-pointer hover-elevate text-right" onClick={() => handleSort('avgHoldingTimeMinutes')}>
                        Avg Time
                      </TableHead>
                      <TableHead className="text-right">Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSignals?.map((signal) => (
                      <TableRow key={signal.signal} data-testid={`row-signal-${signal.signal}`}>
                        <TableCell className="font-medium">{signal.signal}</TableCell>
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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Combination</TableHead>
                        <TableHead className="text-right">Occurrences</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                        <TableHead className="text-right">Avg Gain</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {intelligence.topCombinations.map((combo, i) => (
                        <TableRow key={i} data-testid={`row-combo-${i}`}>
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
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset Type</TableHead>
                      <TableHead className="text-right">Total Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Avg Gain</TableHead>
                      <TableHead className="text-right">Avg Hold Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intelligence.assetComparison.map((asset) => (
                      <TableRow key={asset.assetType} data-testid={`row-asset-${asset.assetType}`}>
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
