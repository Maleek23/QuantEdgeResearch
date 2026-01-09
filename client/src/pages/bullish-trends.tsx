import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Target,
  Zap,
  Star,
  Activity,
  Plus,
  Trash2,
  Rocket,
  LineChart,
  Volume2,
  Flame,
  AtomIcon,
  Shield,
  Satellite,
  Cpu,
  Bitcoin,
  Brain,
  Building2,
  Layers,
  Leaf
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HeatMapSymbol {
  symbol: string;
  heatScore: number;
  distinctSources: number;
  sourceBreakdown: Record<string, number>;
  convergenceLevel: number;
  direction: string;
  recentTouches1h: number;
  recentTouches24h: number;
}

interface HeatMapSector {
  name: string;
  symbols: HeatMapSymbol[];
  totalHeat: number;
  avgHeat: number;
  symbolCount: number;
  convergingCount: number;
  maxSources: number;
}

interface HeatMapData {
  sectors: HeatMapSector[];
  totalSymbols: number;
  lastUpdated: string;
}

interface BullishTrend {
  id: string;
  symbol: string;
  name: string | null;
  sector: string | null;
  category: string | null;
  currentPrice: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  weekChangePercent: number | null;
  monthChangePercent: number | null;
  rsi14: number | null;
  rsi2: number | null;
  macdSignal: string | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  priceVsSma20: number | null;
  priceVsSma50: number | null;
  priceVsSma200: number | null;
  currentVolume: number | null;
  avgVolume: number | null;
  volumeRatio: number | null;
  trendStrength: 'weak' | 'moderate' | 'strong' | 'explosive';
  trendPhase: 'accumulation' | 'breakout' | 'momentum' | 'distribution';
  momentumScore: number | null;
  week52High: number | null;
  week52Low: number | null;
  percentFrom52High: number | null;
  percentFrom52Low: number | null;
  isBreakout: boolean;
  isHighVolume: boolean;
  isAboveMAs: boolean;
  isNewHigh: boolean;
  addedManually: boolean;
  notes: string | null;
  lastScannedAt: string | null;
}

export default function BullishTrends() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("heatmap");
  const [newSymbol, setNewSymbol] = useState("");

  const { data: trends, isLoading, refetch } = useQuery<BullishTrend[]>({
    queryKey: ["/api/bullish-trends"],
    refetchInterval: 60000,
  });

  const { data: breakouts } = useQuery<BullishTrend[]>({
    queryKey: ["/api/bullish-trends/breakouts"],
  });

  const { data: topMomentum } = useQuery<BullishTrend[]>({
    queryKey: ["/api/bullish-trends/top"],
  });

  const { data: heatMapData, isLoading: heatMapLoading } = useQuery<HeatMapData>({
    queryKey: ["/api/bullish-trends/heat-map"],
    refetchInterval: 60000,
  });

  const addStock = useMutation({
    mutationFn: async (symbol: string) => {
      const res = await apiRequest("POST", "/api/bullish-trends/add", { symbol });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stock Added", description: `${newSymbol.toUpperCase()} added to tracker` });
      setNewSymbol("");
      queryClient.invalidateQueries({ queryKey: ["/api/bullish-trends"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add stock", variant: "destructive" });
    },
  });

  const removeStock = useMutation({
    mutationFn: async (symbol: string) => {
      const res = await apiRequest("DELETE", `/api/bullish-trends/${symbol}`);
      return res.json();
    },
    onSuccess: (_, symbol) => {
      toast({ title: "Removed", description: `${symbol} removed from tracker` });
      queryClient.invalidateQueries({ queryKey: ["/api/bullish-trends"] });
    },
  });

  const handleAddStock = () => {
    if (newSymbol.trim()) {
      addStock.mutate(newSymbol.trim().toUpperCase());
    }
  };

  const getTrendStrengthColor = (strength: string) => {
    switch (strength) {
      case 'explosive': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'strong': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'moderate': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getTrendPhaseColor = (phase: string) => {
    switch (phase) {
      case 'breakout': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'momentum': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'accumulation': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-red-500/20 text-red-400 border-red-500/30';
    }
  };

  const getMomentumColor = (score: number | null) => {
    if (!score) return 'text-slate-400';
    if (score >= 80) return 'text-emerald-400';
    if (score >= 65) return 'text-green-400';
    if (score >= 45) return 'text-amber-400';
    return 'text-red-400';
  };

  const getSectorInfo = (sector: string) => {
    const sectorMap: Record<string, { icon: any; color: string; label: string }> = {
      'NUCLEAR': { icon: AtomIcon, color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30', label: 'Nuclear/Energy' },
      'DEFENSE': { icon: Shield, color: 'text-blue-400 bg-blue-500/20 border-blue-500/30', label: 'Defense/Aerospace' },
      'SPACE': { icon: Satellite, color: 'text-purple-400 bg-purple-500/20 border-purple-500/30', label: 'Space/Satellites' },
      'CRYPTO': { icon: Bitcoin, color: 'text-orange-400 bg-orange-500/20 border-orange-500/30', label: 'Crypto/Mining' },
      'SEMIS': { icon: Cpu, color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30', label: 'Semiconductors' },
      'AI_QUANTUM': { icon: Brain, color: 'text-pink-400 bg-pink-500/20 border-pink-500/30', label: 'AI/Quantum' },
      'MEGA_TECH': { icon: Building2, color: 'text-indigo-400 bg-indigo-500/20 border-indigo-500/30', label: 'Mega Tech' },
      'ETF_INDEX': { icon: Layers, color: 'text-slate-400 bg-slate-500/20 border-slate-500/30', label: 'ETF/Index' },
      'GROWTH': { icon: TrendingUp, color: 'text-teal-400 bg-teal-500/20 border-teal-500/30', label: 'Growth' },
      'CLEAN_ENERGY': { icon: Leaf, color: 'text-green-400 bg-green-500/20 border-green-500/30', label: 'Clean Energy' },
      'OTHER': { icon: BarChart3, color: 'text-gray-400 bg-gray-500/20 border-gray-500/30', label: 'Other' },
    };
    return sectorMap[sector] || sectorMap['OTHER'];
  };

  const getHeatColor = (score: number) => {
    if (score >= 15) return 'text-red-400';
    if (score >= 12) return 'text-orange-400';
    if (score >= 10) return 'text-amber-400';
    if (score >= 8) return 'text-yellow-400';
    return 'text-slate-400';
  };

  const getSourceBadgeColor = (count: number) => {
    if (count >= 3) return 'bg-red-500/30 text-red-300 border-red-500/40';
    if (count >= 2) return 'bg-amber-500/30 text-amber-300 border-amber-500/40';
    return 'bg-slate-500/30 text-slate-300 border-slate-500/40';
  };

  const getDisplayTrends = () => {
    if (activeTab === 'breakouts') return breakouts || [];
    if (activeTab === 'top') return topMomentum || [];
    return trends || [];
  };

  const displayTrends = getDisplayTrends();
  const explosiveCount = trends?.filter(t => t.trendStrength === 'explosive').length || 0;
  const breakoutCount = breakouts?.length || 0;
  const highVolumeCount = trends?.filter(t => t.isHighVolume).length || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-slate-900/20">
        <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-slate-900/20">
      <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
        
        <div className="rounded-xl bg-gradient-to-r from-cyan-500/10 via-slate-900/80 to-purple-500/10 border border-cyan-500/20 p-6" data-testid="header-panel">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-500/20 border-2 border-cyan-500/40">
                <TrendingUp className="h-8 w-8 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Bullish Trend Tracker</h1>
                <p className="text-sm text-muted-foreground">
                  Track momentum stocks with technical analysis • {trends?.length || 0} stocks monitored
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add symbol..."
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStock()}
                  className="w-32 bg-slate-900/50 border-slate-700"
                  data-testid="input-add-symbol"
                />
                <Button
                  size="sm"
                  onClick={handleAddStock}
                  disabled={addStock.isPending || !newSymbol.trim()}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black"
                  data-testid="button-add-stock"
                >
                  {addStock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400"
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-emerald-500/20 bg-slate-900/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Explosive Momentum</p>
                  <p className="text-3xl font-bold font-mono text-emerald-400" data-testid="text-explosive-count">{explosiveCount}</p>
                </div>
                <Rocket className="h-8 w-8 text-emerald-400/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-cyan-500/20 bg-slate-900/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Breakouts</p>
                  <p className="text-3xl font-bold font-mono text-cyan-400" data-testid="text-breakout-count">{breakoutCount}</p>
                </div>
                <Zap className="h-8 w-8 text-cyan-400/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-500/20 bg-slate-900/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">High Volume</p>
                  <p className="text-3xl font-bold font-mono text-purple-400" data-testid="text-high-volume-count">{highVolumeCount}</p>
                </div>
                <Volume2 className="h-8 w-8 text-purple-400/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-900/60 border border-slate-700">
            <TabsTrigger value="heatmap" data-testid="tab-heatmap">
              <Flame className="h-4 w-4 mr-1" />
              Sector Heat Map
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All Stocks ({trends?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="breakouts" data-testid="tab-breakouts">
              <Zap className="h-4 w-4 mr-1" />
              Breakouts ({breakoutCount})
            </TabsTrigger>
            <TabsTrigger value="top" data-testid="tab-top">
              <Star className="h-4 w-4 mr-1" />
              Top Momentum
            </TabsTrigger>
          </TabsList>

          <TabsContent value="heatmap" className="mt-4">
            <Card className="border-slate-700/50 bg-slate-900/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Flame className="h-5 w-5 text-orange-400" />
                      Real-Time Sector Heat Map
                    </CardTitle>
                    <CardDescription>
                      Multi-source convergence tracking across all sectors • Updated every minute
                    </CardDescription>
                  </div>
                  {heatMapData?.lastUpdated && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {heatMapData.totalSymbols} symbols tracked
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {heatMapLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
                  </div>
                ) : !heatMapData?.sectors?.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Flame className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No heat data available yet. Signals will appear as market activity increases.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {heatMapData.sectors.map((sector) => {
                      const sectorInfo = getSectorInfo(sector.name);
                      const SectorIcon = sectorInfo.icon;
                      return (
                        <div key={sector.name} className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
                          <div className={`p-4 flex items-center justify-between border-b border-slate-700/30 ${sectorInfo.color.split(' ')[1]}`}>
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${sectorInfo.color}`}>
                                <SectorIcon className="h-5 w-5" />
                              </div>
                              <div>
                                <h3 className="font-semibold text-foreground">{sectorInfo.label}</h3>
                                <p className="text-xs text-muted-foreground">
                                  {sector.symbolCount} symbols • Avg Heat: {sector.avgHeat.toFixed(1)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              {sector.convergingCount > 0 && (
                                <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                  <Zap className="h-3 w-3 mr-1" />
                                  {sector.convergingCount} Converging
                                </Badge>
                              )}
                              <div className="text-right">
                                <div className={`text-xl font-bold font-mono ${getHeatColor(sector.avgHeat)}`}>
                                  {sector.totalHeat.toFixed(0)}
                                </div>
                                <div className="text-xs text-muted-foreground">Total Heat</div>
                              </div>
                            </div>
                          </div>
                          <div className="p-4">
                            <div className="flex flex-wrap gap-2">
                              {sector.symbols.slice(0, 12).map((sym) => (
                                <Tooltip key={sym.symbol}>
                                  <TooltipTrigger asChild>
                                    <div 
                                      className={`px-3 py-2 rounded-lg border transition-colors cursor-default ${
                                        sym.distinctSources >= 2 
                                          ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-400' 
                                          : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                                      }`}
                                      data-testid={`heatmap-symbol-${sym.symbol}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono font-semibold text-sm">{sym.symbol}</span>
                                        <Badge variant="outline" className={`text-xs ${getSourceBadgeColor(sym.distinctSources)}`}>
                                          {sym.distinctSources}
                                        </Badge>
                                      </div>
                                      <div className={`text-lg font-bold font-mono ${getHeatColor(sym.heatScore)}`}>
                                        {sym.heatScore.toFixed(1)}
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <div className="space-y-2">
                                      <div className="font-semibold">{sym.symbol} - Heat Score: {sym.heatScore.toFixed(2)}</div>
                                      <div className="text-xs">
                                        <div className="font-medium mb-1">Sources ({sym.distinctSources}):</div>
                                        <div className="flex flex-wrap gap-1">
                                          {Object.entries(sym.sourceBreakdown).map(([source, count]) => (
                                            <Badge key={source} variant="outline" className="text-xs">
                                              {source.replace(/_/g, ' ')}: {count}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        Last 1h: {sym.recentTouches1h} | Last 24h: {sym.recentTouches24h}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                              {sector.symbols.length > 12 && (
                                <div className="px-3 py-2 text-muted-foreground text-sm flex items-center">
                                  +{sector.symbols.length - 12} more
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value={activeTab} className="mt-4">
            <Card className="border-slate-700/50 bg-slate-900/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-400" />
                  {activeTab === 'all' ? 'All Bullish Stocks' : activeTab === 'breakouts' ? 'Breakout Alerts' : 'Top Momentum Plays'}
                </CardTitle>
                <CardDescription>
                  Sorted by momentum score • Real-time technical analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                {displayTrends.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No stocks found. Add symbols to start tracking.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayTrends.map((trend) => (
                      <div
                        key={trend.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-cyan-500/30 transition-colors"
                        data-testid={`trend-row-${trend.symbol}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="min-w-[80px]">
                            <div className="font-bold text-lg font-mono" data-testid={`text-symbol-${trend.symbol}`}>{trend.symbol}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[120px]">{trend.name}</div>
                          </div>
                          
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={getTrendStrengthColor(trend.trendStrength)}>
                              {trend.trendStrength}
                            </Badge>
                            <Badge variant="outline" className={getTrendPhaseColor(trend.trendPhase)}>
                              {trend.trendPhase}
                            </Badge>
                            {trend.isBreakout && (
                              <Badge variant="outline" className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                                <Zap className="h-3 w-3 mr-1" />
                                Breakout
                              </Badge>
                            )}
                            {trend.isHighVolume && (
                              <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                                <Volume2 className="h-3 w-3 mr-1" />
                                High Vol
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="font-mono font-semibold" data-testid={`text-price-${trend.symbol}`}>
                              {trend.currentPrice != null ? `$${trend.currentPrice.toFixed(2)}` : 'N/A'}
                            </div>
                            <div className={`text-sm font-mono flex items-center justify-end gap-1 ${(trend.dayChangePercent ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {(trend.dayChangePercent ?? 0) >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {trend.dayChangePercent != null ? `${Math.abs(trend.dayChangePercent).toFixed(2)}%` : 'N/A'}
                            </div>
                          </div>

                          <div className="text-right">
                            <Tooltip>
                              <TooltipTrigger>
                                <div className={`text-2xl font-bold font-mono ${getMomentumColor(trend.momentumScore)}`} data-testid={`text-score-${trend.symbol}`}>
                                  {trend.momentumScore != null ? trend.momentumScore : 'N/A'}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Momentum Score (0-100)</TooltipContent>
                            </Tooltip>
                            <div className="text-xs text-muted-foreground">Score</div>
                          </div>

                          <div className="text-right hidden lg:block">
                            <div className="font-mono text-sm">RSI: {trend.rsi14 != null ? trend.rsi14.toFixed(0) : 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">Vol: {trend.volumeRatio != null ? `${trend.volumeRatio.toFixed(1)}x` : 'N/A'}</div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeStock.mutate(trend.symbol)}
                            disabled={removeStock.isPending}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            data-testid={`button-remove-${trend.symbol}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Target className="h-5 w-5 text-amber-400" />
            <p className="text-sm text-muted-foreground">
              <span className="text-amber-400 font-medium">Educational Only:</span> This scanner is for research purposes. Always do your own due diligence before trading.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
