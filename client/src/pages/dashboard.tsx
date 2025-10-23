import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TradeIdeaBlock } from "@/components/trade-idea-block";
import { SymbolSearch } from "@/components/symbol-search";
import { SymbolDetailModal } from "@/components/symbol-detail-modal";
import { QuantAIBot } from "@/components/quantai-bot";
import { getMarketSession, formatCTTime, formatPercent } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MarketData, TradeIdea, Catalyst, WatchlistItem } from "@shared/schema";
import { 
  TrendingUp, TrendingDown, Activity, Star, Bot, Sparkles, BarChart3, 
  AlertCircle, ArrowRight, Target, Shield, Zap, Info, HelpCircle 
} from "lucide-react";
import { parseISO, subHours } from "date-fns";

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    closedIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    expiredIdeas: number;
    winRate: number;
    quantAccuracy: number;
    directionalAccuracy: number;
    avgPercentGain: number;
    avgHoldingTimeMinutes: number;
    sharpeRatio: number;
    maxDrawdown: number;
    profitFactor: number;
    expectancy: number;
    evScore: number;
    adjustedWeightedAccuracy: number;
    oppositeDirectionRate: number;
    oppositeDirectionCount: number;
    avgWinSize: number;
    avgLossSize: number;
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

export default function Dashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState<MarketData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [chatBotOpen, setChatBotOpen] = useState(false);
  const currentSession = getMarketSession();
  const currentTime = formatCTTime(new Date());
  const { toast } = useToast();

  const { data: marketData = [], isLoading: marketLoading } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
  });

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 60000,
  });

  const { data: catalysts = [], isLoading: catalystsLoading } = useQuery<Catalyst[]>({
    queryKey: ['/api/catalysts'],
  });

  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
  });

  const { data: performanceStats } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats'],
  });

  // Create price map from trade ideas (already includes live prices from backend)
  const priceMap = tradeIdeas.reduce((acc, idea) => {
    if (idea.currentPrice != null) {
      acc[idea.symbol] = idea.currentPrice;
    }
    return acc;
  }, {} as Record<string, number>);
  
  // Fallback to market data for symbols not in trade ideas
  marketData.forEach(data => {
    if (!priceMap[data.symbol]) {
      priceMap[data.symbol] = data.currentPrice;
    }
  });

  // Generate Quant Ideas mutation
  const generateQuantIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/quant/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "Quant Ideas Generated",
        description: `Generated ${data.count || data.newIdeas || 0} new quantitative trade ideas`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate quant ideas",
        variant: "destructive"
      });
    }
  });

  // Generate AI Ideas mutation (Free Gemini tier)
  const generateAIIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/ai/generate-ideas', {
        marketContext: "Current market conditions with focus on stocks, options, and crypto"
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "Free AI Ideas Generated",
        description: `Generated ${data.count || 0} ideas using Gemini free tier`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate AI ideas",
        variant: "destructive"
      });
    }
  });

  // Generate Hybrid Ideas mutation (Quant signals + AI intelligence)
  const generateHybridIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/hybrid/generate-ideas', {
        marketContext: "Current market conditions"
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "Hybrid Ideas Generated",
        description: `Generated ${data.count || 0} ideas combining quant signals with AI analysis`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate hybrid ideas",
        variant: "destructive"
      });
    }
  });

  // Calculate metrics
  const activeIdeas = tradeIdeas.filter(i => i.outcomeStatus === 'open');
  const archivedIdeas = tradeIdeas.filter(i => i.outcomeStatus !== 'open');
  
  // Fresh ideas = created within last 2 hours (day trading window)
  const freshIdeas = activeIdeas.filter(i => {
    const ideaDate = parseISO(i.timestamp);
    const cutoffTime = subHours(new Date(), 2);
    return ideaDate >= cutoffTime;
  });
  
  const aiIdeas = freshIdeas.filter(i => i.source === 'ai');
  const quantIdeas = freshIdeas.filter(i => i.source === 'quant');
  const hybridIdeas = freshIdeas.filter(i => i.source === 'hybrid');
  const topGainers = marketData.filter(d => d.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3);
  const topLosers = marketData.filter(d => d.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);
  const recentIdeas = freshIdeas.slice(0, 3);
  const highGradeIdeas = freshIdeas.filter(i => i.confidenceScore >= 85); // B+ and above

  const handleViewDetails = (symbol: string) => {
    const symbolData = marketData.find(d => d.symbol === symbol);
    if (symbolData) {
      setSelectedSymbol(symbolData);
      setDetailModalOpen(true);
    }
  };

  const handleAddToWatchlist = (idea: TradeIdea) => {
    // This will be handled by the TradeIdeaBlock component
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="border-b aurora-hero relative overflow-hidden">
        <div className="container mx-auto px-6 py-20">
          <div className="max-w-5xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 badge-shimmer neon-accent animate-fade-up">
              <Activity className="h-3 w-3 mr-1" />
              {currentSession} • {currentTime}
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 text-display animate-fade-up animate-delay-100" data-testid="text-page-title">
              Welcome to <span className="text-gradient-premium">QuantEdge</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-10 leading-relaxed max-w-3xl mx-auto animate-fade-up animate-delay-200">
              Your quantitative trading research platform. Discover opportunities across stocks, options, 
              and crypto with AI-powered insights and rigorous technical analysis.
            </p>
            <div className="flex flex-wrap gap-4 justify-center animate-fade-up animate-delay-300">
              <Button 
                onClick={() => generateQuantIdeas.mutate()}
                disabled={generateQuantIdeas.isPending}
                className="btn-magnetic neon-accent"
                data-testid="button-generate-quant"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                {generateQuantIdeas.isPending ? "Generating..." : "Generate Quant Ideas"}
              </Button>
              <Button 
                onClick={() => generateAIIdeas.mutate()}
                disabled={generateAIIdeas.isPending}
                variant="outline"
                className="btn-magnetic glass-card relative"
                data-testid="button-generate-ai"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {generateAIIdeas.isPending ? "Generating..." : "Free AI Ideas"}
                <Badge variant="secondary" className="ml-2 text-xs px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  FREE
                </Badge>
              </Button>
              <Button 
                onClick={() => generateHybridIdeas.mutate()}
                disabled={generateHybridIdeas.isPending}
                variant="outline"
                className="btn-magnetic glass-card"
                data-testid="button-generate-hybrid"
              >
                <Target className="h-4 w-4 mr-2" />
                {generateHybridIdeas.isPending ? "Generating..." : "Hybrid (AI+Quant)"}
              </Button>
              <Button 
                onClick={() => setChatBotOpen(true)}
                variant="outline"
                className="btn-magnetic glass-card"
                data-testid="button-open-chat"
              >
                <Bot className="h-4 w-4 mr-2" />
                Ask QuantAI
              </Button>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </section>

      <div className="container mx-auto px-6 py-12 space-y-12">

        {/* Early-Stage Learning Phase Banner */}
        {performanceStats && performanceStats.overall.closedIdeas < 20 && (
          <TooltipProvider>
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <Info className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-amber-600 dark:text-amber-400">Platform Learning Phase:</span>
                <span>
                  {performanceStats.overall.wonIdeas} wins, {performanceStats.overall.lostIdeas} losses so far 
                  ({performanceStats.overall.closedIdeas} total closed ideas)
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-amber-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      The platform is in its early learning phase. Metrics with small sample sizes are expected 
                      and accurate. Our ML models improve with more trade outcomes.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </AlertDescription>
            </Alert>
          </TooltipProvider>
        )}

        {/* Symbol Search */}
        <div className="max-w-2xl mx-auto">
          <div className="gradient-border-card spotlight">
            <Card className="glass-card shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-card/80 to-muted/20 border-b border-border/50">
                <CardTitle className="text-lg font-bold">Search & Add Symbols</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <SymbolSearch />
              </CardContent>
            </Card>
          </div>
        </div>

      {/* Performance Metrics - CONSISTENT WITH OTHER PAGES */}
      {performanceStats && (
        <div className="gradient-border-card">
          <Card className="glass-card stat-card shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-card/80 to-muted/20 border-b border-border/50">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                System Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <TooltipProvider>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                          Win Rate
                          {performanceStats.overall.closedIdeas < 10 && (
                            <HelpCircle className="h-3 w-3 opacity-50" />
                          )}
                        </div>
                        <div className={`text-2xl font-bold font-mono ${performanceStats.overall.winRate >= 50 ? 'text-green-500' : 'text-red-500'}`}>
                          {performanceStats.overall.winRate.toFixed(1)}%
                          {performanceStats.overall.closedIdeas < 10 && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">Early Data</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{performanceStats.overall.wonIdeas}W • {performanceStats.overall.lostIdeas}L</div>
                      </div>
                    </TooltipTrigger>
                    {performanceStats.overall.closedIdeas < 10 && (
                      <TooltipContent>
                        <p className="text-xs">Small sample size ({performanceStats.overall.closedIdeas} trades). Values are accurate but will stabilize with more data.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                          Quant Accuracy
                          <HelpCircle className="h-3 w-3 opacity-50" />
                        </div>
                        <div className={`text-2xl font-bold font-mono ${(performanceStats.overall.quantAccuracy ?? 0) >= 50 ? 'text-blue-500' : 'text-orange-500'}`}>
                          {performanceStats.overall.quantAccuracy < 0 ? 'Bounded: ' : ''}
                          {performanceStats.overall.quantAccuracy.toFixed(1)}%
                          {performanceStats.overall.closedIdeas < 10 && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">Early Data</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">Weighted</div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Confidence-weighted accuracy with bounded penalty system. 
                        Negative values indicate over-confident predictions. 
                        {performanceStats.overall.closedIdeas < 10 && ' Early data - will stabilize with more trades.'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                          Directional
                          {performanceStats.overall.closedIdeas < 10 && (
                            <HelpCircle className="h-3 w-3 opacity-50" />
                          )}
                        </div>
                        <div className={`text-2xl font-bold font-mono ${(performanceStats.overall.directionalAccuracy ?? 0) >= 40 ? 'text-cyan-500' : 'text-amber-500'}`}>
                          {performanceStats.overall.directionalAccuracy.toFixed(1)}%
                          {performanceStats.overall.closedIdeas < 10 && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">Early Data</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">Accuracy</div>
                      </div>
                    </TooltipTrigger>
                    {performanceStats.overall.closedIdeas < 10 && (
                      <TooltipContent>
                        <p className="text-xs">Small sample size ({performanceStats.overall.closedIdeas} trades). Values are accurate but will stabilize with more data.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">EV Score</div>
                    <div className={`text-2xl font-bold font-mono ${performanceStats.overall.evScore >= 1.5 ? 'text-green-500' : performanceStats.overall.evScore >= 1.0 ? 'text-cyan-500' : 'text-red-500'}`}>
                      {performanceStats.overall.evScore > 99 ? '∞' : performanceStats.overall.evScore.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">Profitability</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">Opposite Dir</div>
                    <div className={`text-2xl font-bold font-mono ${performanceStats.overall.oppositeDirectionRate > 20 ? 'text-red-500' : performanceStats.overall.oppositeDirectionRate > 15 ? 'text-amber-500' : 'text-green-500'}`}>
                      {performanceStats.overall.oppositeDirectionRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Blind Spot</div>
                  </div>
                </div>
              </TooltipProvider>
              <div className="mt-4 text-center">
                <Link href="/performance">
                  <Button variant="outline" size="sm" className="gap-2" data-testid="button-view-full-performance">
                    View Full Performance <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Metrics Summary */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="gradient-border-card">
          <Card className="glass-card stat-card shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold tracking-wide">Fresh Ideas</CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-3xl font-bold font-mono tracking-tight" data-testid="metric-fresh-ideas">{freshIdeas.length}</div>
              <p className="text-xs text-muted-foreground">Last 2 hours</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="gap-1 text-xs badge-shimmer">
                  <Sparkles className="h-3 w-3" />
                  {aiIdeas.length} AI
                </Badge>
                <Badge variant="outline" className="gap-1 text-xs">
                  <BarChart3 className="h-3 w-3" />
                  {quantIdeas.length} Quant
                </Badge>
                {hybridIdeas.length > 0 && (
                  <Badge variant="outline" className="gap-1 text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                    <Target className="h-3 w-3" />
                    {hybridIdeas.length} Hybrid
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="gradient-border-card">
          <Card className="glass-card stat-card stat-card-bullish shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold tracking-wide">High Grade Ideas</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/10 neon-accent">
                <Target className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-bold font-mono text-green-500 tracking-tight" data-testid="metric-high-grade">{highGradeIdeas.length}</div>
              <p className="text-xs text-muted-foreground">B+ grade and above</p>
            </CardContent>
          </Card>
        </div>

        <div className="gradient-border-card">
          <Card className="glass-card stat-card shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold tracking-wide">Tracked Assets</CardTitle>
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Star className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-bold font-mono tracking-tight" data-testid="metric-watchlist">{watchlist.length}</div>
              <p className="text-xs text-muted-foreground">In watchlist</p>
            </CardContent>
          </Card>
        </div>

        <div className="gradient-border-card">
          <Card className="glass-card stat-card shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold tracking-wide">Market Catalysts</CardTitle>
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-bold font-mono tracking-tight" data-testid="metric-catalysts">{catalysts.length}</div>
              <p className="text-xs text-muted-foreground">Active drivers</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Market Movers */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="gradient-border-card">
          <Card className="glass-card shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2 bg-gradient-to-r from-green-500/5 to-green-500/10 border-b border-border/50">
              <CardTitle className="text-sm font-medium">Top Gainers</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
            {marketLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topGainers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gainers yet</p>
            ) : (
              <div className="space-y-2">
                {topGainers.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between p-2 rounded-lg hover-elevate active-elevate-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{stock.symbol}</span>
                      <Badge variant="outline" className="text-xs">
                        {stock.assetType}
                      </Badge>
                    </div>
                    <span className="font-semibold text-green-500">{formatPercent(stock.changePercent)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          </Card>
        </div>

        <div className="gradient-border-card">
          <Card className="glass-card shadow-lg border-0">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2 bg-gradient-to-r from-red-500/5 to-red-500/10 border-b border-border/50">
              <CardTitle className="text-sm font-medium">Top Losers</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
            {marketLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topLosers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No losers yet</p>
            ) : (
              <div className="space-y-2">
                {topLosers.map((stock) => (
                  <div key={stock.symbol} className="flex items-center justify-between p-2 rounded-lg hover-elevate active-elevate-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{stock.symbol}</span>
                      <Badge variant="outline" className="text-xs">
                        {stock.assetType}
                      </Badge>
                    </div>
                    <span className="font-semibold text-red-500">{formatPercent(stock.changePercent)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Trade Ideas Preview */}
      <div className="gradient-border-card spotlight">
        <Card className="glass-card shadow-lg border-0">
          <CardHeader className="flex flex-row items-center justify-between gap-1 bg-gradient-to-r from-card/80 to-primary/5 border-b border-border/50">
            <CardTitle>Recent Trade Ideas</CardTitle>
            <Link href="/trade-ideas">
              <Button variant="outline" size="sm" className="gap-2 btn-magnetic glass-card" data-testid="button-view-all-ideas">
                View All
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
        <CardContent>
          {ideasLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" data-testid={`skeleton-idea-${i}`} />
              ))}
            </div>
          ) : recentIdeas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No active trade ideas</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Use Quick Actions above to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentIdeas.map((idea) => (
                <TradeIdeaBlock
                  key={idea.id}
                  idea={idea}
                  currentPrice={priceMap[idea.symbol]}
                  onViewDetails={handleViewDetails}
                  onAddToWatchlist={handleAddToWatchlist}
                  data-testid={`preview-idea-${idea.id}`}
                />
              ))}
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/market">
          <div className="gradient-border-card spotlight">
            <Card className="glass-card hover-elevate active-elevate-2 cursor-pointer transition-all border-0">
              <CardContent className="flex items-center gap-3 p-6">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                  <h3 className="font-semibold">Market Overview</h3>
                  <p className="text-sm text-muted-foreground">Live prices & stats</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </Link>

        <Link href="/watchlist">
          <div className="gradient-border-card spotlight">
            <Card className="glass-card hover-elevate active-elevate-2 cursor-pointer transition-all border-0">
              <CardContent className="flex items-center gap-3 p-6">
                <Star className="h-8 w-8 text-primary" />
                <div>
                  <h3 className="font-semibold">Watchlist</h3>
                  <p className="text-sm text-muted-foreground">{watchlist.length} tracked assets</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </Link>

        <Link href="/risk">
          <div className="gradient-border-card spotlight">
            <Card className="glass-card hover-elevate active-elevate-2 cursor-pointer transition-all border-0">
              <CardContent className="flex items-center gap-3 p-6">
                <Shield className="h-8 w-8 text-primary" />
                <div>
                  <h3 className="font-semibold">Risk Calculator</h3>
                  <p className="text-sm text-muted-foreground">Position sizing tool</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </Link>
      </div>

        {/* Modals */}
        <SymbolDetailModal 
          symbol={selectedSymbol}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
        />

        <QuantAIBot 
          isOpen={chatBotOpen} 
          onClose={() => setChatBotOpen(false)} 
        />
      </div>
    </div>
  );
}
