import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Brain, TrendingUp, TrendingDown, Target, Activity, 
  RefreshCw, Search, BarChart3, Zap, AlertTriangle, 
  CheckCircle, Database, ChevronRight, ArrowUpDown
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/page-header";
import { RiskDisclosure } from "@/components/risk-disclosure";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

interface HistoricalStats {
  overall: {
    totalIdeas: number;
    closedIdeas: number;
    wins: number;
    losses: number;
    breakevens: number;
    winRate: number;
    totalPnL: number;
    avgPnLPercent: number;
    profitFactor: number;
  };
  bySource: Record<string, { ideas: number; wins: number; winRate: number; pnl: number }>;
  byAssetType: Record<string, { ideas: number; wins: number; winRate: number; pnl: number }>;
  byDirection: Record<string, { ideas: number; wins: number; winRate: number; pnl: number }>;
  byCatalyst: Array<{ catalyst: string; ideas: number; wins: number; winRate: number; pnl: number }>;
  bySymbol: Array<{ symbol: string; ideas: number; wins: number; winRate: number; pnl: number; lastTrade: string }>;
  byConfidenceBand: Array<{ band: string; ideas: number; wins: number; expectedWinRate: number; actualWinRate: number; calibrationError: number }>;
  topPerformers: Array<{ symbol: string; winRate: number; trades: number; totalPnL: number }>;
  worstPerformers: Array<{ symbol: string; winRate: number; trades: number; totalPnL: number }>;
}

interface SymbolProfile {
  symbol: string;
  totalIdeas: number;
  closedIdeas: number;
  wins: number;
  losses: number;
  overallWinRate: number | null;
  longWinRate: number | null;
  shortWinRate: number | null;
  totalPnL: number | null;
  profitFactor: number | null;
  bestCatalystType: string | null;
  bestCatalystWinRate: number | null;
  avgConfidenceScore: number | null;
  lastTradeDate: string | null;
}

interface SymbolIntelligence {
  symbol: string;
  profile: SymbolProfile | null;
  recentTrades: any[];
  bestCatalysts: Array<{ catalyst: string; winRate: number; trades: number }>;
  worstCatalysts: Array<{ catalyst: string; winRate: number; trades: number }>;
  recommendations: string[];
}

function getWinRateColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 70) return "text-green-500";
  if (rate >= 50) return "text-amber-500";
  return "text-red-500";
}

function getPnlColor(pnl: number | null): string {
  if (pnl === null || pnl === 0) return "text-muted-foreground";
  return pnl > 0 ? "text-green-500" : "text-red-500";
}

function HeroStats({ stats }: { stats: HistoricalStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="hero-stats">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            <Database className="h-8 w-8 text-cyan-400 mb-2" />
            <p className="text-3xl font-bold">{stats.overall.totalIdeas.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Ideas</p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            <CheckCircle className="h-8 w-8 text-green-400 mb-2" />
            <p className={cn("text-3xl font-bold", getWinRateColor(stats.overall.winRate))}>
              {stats.overall.winRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            <Target className="h-8 w-8 text-amber-400 mb-2" />
            <p className="text-3xl font-bold">{stats.overall.wins}</p>
            <p className="text-xs text-muted-foreground">Wins</p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mb-2" />
            <p className="text-3xl font-bold">{stats.overall.losses}</p>
            <p className="text-xs text-muted-foreground">Losses</p>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            <Zap className="h-8 w-8 text-purple-400 mb-2" />
            <p className={cn("text-3xl font-bold", stats.overall.profitFactor >= 1.5 ? "text-green-500" : stats.overall.profitFactor >= 1 ? "text-amber-500" : "text-red-500")}>
              {stats.overall.profitFactor.toFixed(2)}x
            </p>
            <p className="text-xs text-muted-foreground">Profit Factor</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SourceBreakdown({ stats }: { stats: HistoricalStats }) {
  const sources = Object.entries(stats.bySource).sort((a, b) => b[1].ideas - a[1].ideas);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-400" />
          Performance by Engine
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sources.map(([source, data]) => (
            <div key={source} className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">{source}</Badge>
                  <span className="text-xs text-muted-foreground">{data.ideas} ideas</span>
                </div>
                <span className={cn("font-medium", getWinRateColor(data.winRate))}>
                  {data.winRate.toFixed(1)}%
                </span>
              </div>
              <Progress value={data.winRate} className="h-2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CatalystPerformance({ stats }: { stats: HistoricalStats }) {
  const topCatalysts = stats.byCatalyst.slice(0, 5);
  const worstCatalysts = [...stats.byCatalyst].sort((a, b) => a.winRate - b.winRate).slice(0, 5);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-amber-400" />
          Catalyst Performance
        </CardTitle>
        <CardDescription>Win rates by catalyst type</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-green-400 mb-3 flex items-center gap-1">
              <TrendingUp className="h-4 w-4" /> Best Catalysts
            </h4>
            <div className="space-y-2">
              {topCatalysts.map((cat) => (
                <div key={cat.catalyst} className="flex justify-between items-center text-sm">
                  <span className="capitalize truncate">{cat.catalyst.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{cat.ideas}</span>
                    <span className={cn("font-medium", getWinRateColor(cat.winRate))}>
                      {cat.winRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-1">
              <TrendingDown className="h-4 w-4" /> Worst Catalysts
            </h4>
            <div className="space-y-2">
              {worstCatalysts.map((cat) => (
                <div key={cat.catalyst} className="flex justify-between items-center text-sm">
                  <span className="capitalize truncate">{cat.catalyst.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{cat.ideas}</span>
                    <span className={cn("font-medium", getWinRateColor(cat.winRate))}>
                      {cat.winRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceCalibration({ stats }: { stats: HistoricalStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-400" />
          Confidence Calibration
        </CardTitle>
        <CardDescription>
          Are our confidence scores accurate? Negative = overconfident
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Confidence Band</TableHead>
              <TableHead className="text-right">Ideas</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Calibration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.byConfidenceBand.map((band) => (
              <TableRow key={band.band}>
                <TableCell className="font-medium">{band.band}</TableCell>
                <TableCell className="text-right">{band.ideas}</TableCell>
                <TableCell className="text-right">{band.expectedWinRate.toFixed(0)}%</TableCell>
                <TableCell className={cn("text-right font-medium", getWinRateColor(band.actualWinRate))}>
                  {band.actualWinRate.toFixed(1)}%
                </TableCell>
                <TableCell className={cn("text-right font-medium", 
                  band.calibrationError >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {band.calibrationError >= 0 ? '+' : ''}{band.calibrationError.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SymbolLeaderboard({ stats }: { stats: HistoricalStats }) {
  const [sortBy, setSortBy] = useState<'winRate' | 'ideas' | 'pnl'>('winRate');
  
  const sorted = [...stats.bySymbol]
    .filter(s => s.ideas >= 3) // Min 3 trades for meaningful data
    .sort((a, b) => {
      if (sortBy === 'winRate') return b.winRate - a.winRate;
      if (sortBy === 'ideas') return b.ideas - a.ideas;
      return b.pnl - a.pnl;
    })
    .slice(0, 20);
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-cyan-400" />
              Symbol Leaderboard
            </CardTitle>
            <CardDescription>Symbols with 3+ trades</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={sortBy === 'winRate' ? 'default' : 'outline'}
              onClick={() => setSortBy('winRate')}
              data-testid="sort-winrate"
            >
              Win Rate
            </Button>
            <Button
              size="sm"
              variant={sortBy === 'ideas' ? 'default' : 'outline'}
              onClick={() => setSortBy('ideas')}
              data-testid="sort-ideas"
            >
              Volume
            </Button>
            <Button
              size="sm"
              variant={sortBy === 'pnl' ? 'default' : 'outline'}
              onClick={() => setSortBy('pnl')}
              data-testid="sort-pnl"
            >
              P&L
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Wins</TableHead>
              <TableHead className="text-right">Win Rate</TableHead>
              <TableHead className="text-right">P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((symbol) => (
              <TableRow key={symbol.symbol}>
                <TableCell className="font-medium">{symbol.symbol}</TableCell>
                <TableCell className="text-right">{symbol.ideas}</TableCell>
                <TableCell className="text-right">{symbol.wins}</TableCell>
                <TableCell className={cn("text-right font-medium", getWinRateColor(symbol.winRate))}>
                  {symbol.winRate.toFixed(1)}%
                </TableCell>
                <TableCell className={cn("text-right font-medium", getPnlColor(symbol.pnl))}>
                  ${symbol.pnl.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SymbolLookup() {
  const [searchSymbol, setSearchSymbol] = useState('');
  const [lookupSymbol, setLookupSymbol] = useState<string | null>(null);
  const { toast } = useToast();
  
  const { data: intelligence, isLoading } = useQuery<SymbolIntelligence>({
    queryKey: ['/api/historical-intelligence/symbol', lookupSymbol],
    enabled: !!lookupSymbol,
  });
  
  const handleSearch = () => {
    if (searchSymbol.trim()) {
      setLookupSymbol(searchSymbol.trim().toUpperCase());
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="h-5 w-5 text-blue-400" />
          Symbol Intelligence Lookup
        </CardTitle>
        <CardDescription>
          Search for a symbol to see its historical behavior and recommendations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Enter symbol (e.g., AAPL)"
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-xs"
            data-testid="input-symbol-search"
          />
          <Button onClick={handleSearch} data-testid="button-search-symbol">
            <Search className="h-4 w-4 mr-2" />
            Analyze
          </Button>
        </div>
        
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}
        
        {intelligence && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <h3 className="text-2xl font-bold">{intelligence.symbol}</h3>
              {intelligence.profile && (
                <Badge 
                  variant={intelligence.profile.overallWinRate && intelligence.profile.overallWinRate >= 60 ? 'default' : 'secondary'}
                  className={cn(
                    intelligence.profile.overallWinRate && intelligence.profile.overallWinRate >= 70 ? "bg-green-500/20 text-green-400" :
                    intelligence.profile.overallWinRate && intelligence.profile.overallWinRate >= 50 ? "bg-amber-500/20 text-amber-400" :
                    "bg-red-500/20 text-red-400"
                  )}
                >
                  {intelligence.profile.overallWinRate?.toFixed(0)}% Win Rate
                </Badge>
              )}
            </div>
            
            {intelligence.profile ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-muted/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Total Trades</p>
                  <p className="text-xl font-bold">{intelligence.profile.closedIdeas}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Win/Loss</p>
                  <p className="text-xl font-bold">{intelligence.profile.wins}W / {intelligence.profile.losses}L</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Best Catalyst</p>
                  <p className="text-lg font-medium capitalize truncate">
                    {intelligence.profile.bestCatalystType?.replace(/_/g, ' ') || 'N/A'}
                  </p>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Profit Factor</p>
                  <p className={cn("text-xl font-bold", 
                    intelligence.profile.profitFactor && intelligence.profile.profitFactor >= 1.5 ? "text-green-500" : 
                    intelligence.profile.profitFactor && intelligence.profile.profitFactor >= 1 ? "text-amber-500" : "text-red-500"
                  )}>
                    {intelligence.profile.profitFactor?.toFixed(2) || 'N/A'}x
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No historical data found for {intelligence.symbol}</p>
            )}
            
            {intelligence.recommendations.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Brain className="h-4 w-4" /> AI Recommendations
                </h4>
                <div className="space-y-1">
                  {intelligence.recommendations.map((rec, i) => (
                    <p key={i} className="text-sm text-muted-foreground">{rec}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function HistoricalIntelligencePage() {
  const { toast } = useToast();
  
  const { data: stats, isLoading, error } = useQuery<HistoricalStats>({
    queryKey: ['/api/historical-intelligence/stats'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/historical-intelligence/refresh');
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Intelligence Refreshed",
        description: `Updated ${data.profilesUpdated} symbol profiles`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/historical-intelligence'] });
    },
    onError: () => {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh historical intelligence",
        variant: "destructive",
      });
    },
  });
  
  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  
  if (error || !stats) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Historical Intelligence</h2>
            <p className="text-muted-foreground mb-4">There was an error loading the analytics data.</p>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4 space-y-6" data-testid="historical-intelligence-page">
      <PageHeader
        title="Historical Trade Intelligence"
        subtitle={`Learning from ${stats.overall.totalIdeas.toLocaleString()} trade ideas to improve predictions`}
        icon={Brain}
        actions={
          <Button 
            variant="outline" 
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            data-testid="button-refresh-intelligence"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshMutation.isPending && "animate-spin")} />
            {refreshMutation.isPending ? "Refreshing..." : "Refresh Data"}
          </Button>
        }
      />
      
      <RiskDisclosure />
      
      <HeroStats stats={stats} />
      
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="symbols" data-testid="tab-symbols">Symbols</TabsTrigger>
          <TabsTrigger value="catalysts" data-testid="tab-catalysts">Catalysts</TabsTrigger>
          <TabsTrigger value="calibration" data-testid="tab-calibration">Calibration</TabsTrigger>
          <TabsTrigger value="lookup" data-testid="tab-lookup">Symbol Lookup</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SourceBreakdown stats={stats} />
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ArrowUpDown className="h-5 w-5 text-blue-400" />
                  Direction Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(stats.byDirection).map(([direction, data]) => (
                    <div key={direction} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {direction === 'long' ? (
                            <TrendingUp className="h-4 w-4 text-green-400" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-400" />
                          )}
                          <span className="capitalize font-medium">{direction}</span>
                          <span className="text-xs text-muted-foreground">{data.ideas} ideas</span>
                        </div>
                        <span className={cn("font-medium", getWinRateColor(data.winRate))}>
                          {data.winRate.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={data.winRate} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-green-400">
                  <TrendingUp className="h-5 w-5" />
                  Top 10 Performers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.topPerformers.slice(0, 10).map((p, i) => (
                    <div key={p.symbol} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-4">{i + 1}.</span>
                        <span className="font-medium">{p.symbol}</span>
                        <span className="text-xs text-muted-foreground">({p.trades} trades)</span>
                      </div>
                      <span className="text-green-400 font-medium">{p.winRate.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-red-400">
                  <TrendingDown className="h-5 w-5" />
                  Bottom 10 Performers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stats.worstPerformers.slice(0, 10).map((p, i) => (
                    <div key={p.symbol} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-4">{i + 1}.</span>
                        <span className="font-medium">{p.symbol}</span>
                        <span className="text-xs text-muted-foreground">({p.trades} trades)</span>
                      </div>
                      <span className="text-red-400 font-medium">{p.winRate.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="symbols">
          <SymbolLeaderboard stats={stats} />
        </TabsContent>
        
        <TabsContent value="catalysts">
          <CatalystPerformance stats={stats} />
        </TabsContent>
        
        <TabsContent value="calibration">
          <ConfidenceCalibration stats={stats} />
        </TabsContent>
        
        <TabsContent value="lookup">
          <SymbolLookup />
        </TabsContent>
      </Tabs>
    </div>
  );
}
