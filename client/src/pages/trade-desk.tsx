import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TradeIdeaBlock } from "@/components/trade-idea-block";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TradeIdea, IdeaSource, MarketData, Catalyst } from "@shared/schema";
import { Calendar as CalendarIcon, Search, RefreshCw, ChevronDown, TrendingUp, X, Sparkles, TrendingUpIcon, UserPlus, BarChart3, LayoutGrid, List, Filter, SlidersHorizontal, CalendarClock, CheckCircle, XCircle, Clock, Info, Activity, Newspaper, Bot, AlertTriangle } from "lucide-react";
import { format, startOfDay, isSameDay, parseISO, subHours, subDays, subMonths, subYears, isAfter, isBefore } from "date-fns";
import { isWeekend, getNextTradingWeekStart, cn } from "@/lib/utils";
import { RiskDisclosure } from "@/components/risk-disclosure";
import { TradeDeskModeTabs, MODES, type TradeDeskMode } from "@/components/trade-desk-mode-tabs";

export default function TradeDeskPage() {
  const [, params] = useRoute("/trade-desk/:mode");
  const [, setLocation] = useLocation();
  
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "day_trade" | "all">("all");
  const [activeSource, setActiveSource] = useState<IdeaSource | "all">("all");
  const [activeAssetType, setActiveAssetType] = useState<"stock" | "penny_stock" | "option" | "crypto" | "all">("all");
  const [activeGrade, setActiveGrade] = useState<"all" | "A" | "B" | "C">("all");
  const [dateRange, setDateRange] = useState<string>('all');
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  const urlMode = params?.mode as TradeDeskMode | undefined;
  const validMode = urlMode && MODES.find(m => m.id === urlMode) ? urlMode : 'ai-picks';
  const [activeMode, setActiveMode] = useState<TradeDeskMode>(validMode);
  
  useEffect(() => {
    if (urlMode && MODES.find(m => m.id === urlMode)) {
      setActiveMode(urlMode);
    }
  }, [urlMode]);
  
  const handleModeChange = (newMode: TradeDeskMode) => {
    setActiveMode(newMode);
    setLocation(`/trade-desk/${newMode}`);
  };
  
  const { toast } = useToast();

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 30000,
    staleTime: 0,
  });

  const { data: marketData = [] } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 30000,
  });

  const { data: catalysts = [] } = useQuery<Catalyst[]>({
    queryKey: ['/api/catalysts'],
    refetchInterval: 3600000,
  });

  const priceMap = tradeIdeas.reduce((acc, idea) => {
    if (idea.currentPrice != null) {
      acc[idea.symbol] = idea.currentPrice;
    }
    return acc;
  }, {} as Record<string, number>);
  
  marketData.forEach(data => {
    if (!priceMap[data.symbol]) {
      priceMap[data.symbol] = data.currentPrice;
    }
  });

  const generateQuantIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/quant/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
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

  const generateAIIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/ai/generate-ideas', {
        marketContext: "Current market conditions with focus on stocks, options, and crypto"
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "AI Ideas Generated",
        description: `Generated ${data.count || 0} new AI-powered trade ideas`,
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

  const generateHybridIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/hybrid/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "Hybrid Ideas Generated",
        description: `Generated ${data.count || 0} new hybrid (AI+Quant) trade ideas`,
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

  const generateNewsIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/news/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "News Ideas Generated",
        description: `Generated ${data.count || 0} news-driven trade ideas`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate news ideas",
        variant: "destructive"
      });
    }
  });

  const generateFlowIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/flow/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "Flow Scanner Complete",
        description: data.message || `Scanned 20 tickers, generated ${data.count || 0} flow trades`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to scan options flow",
        variant: "destructive"
      });
    }
  });

  const handleToggleExpand = (ideaId: string) => {
    setExpandedIdeaId(expandedIdeaId === ideaId ? null : ideaId);
  };

  const handleCollapseAll = () => {
    setExpandedIdeaId(null);
  };

  const calculatePriorityScore = (idea: TradeIdea): number => {
    const confidenceScore = idea.confidenceScore || 0;
    const rrRatio = idea.riskRewardRatio || 0;
    const hitProbability = idea.targetHitProbability || 0;
    
    return (confidenceScore * 0.4) + (rrRatio * 15) + (hitProbability * 0.3);
  };

  const rangeStart = (() => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return startOfDay(now);
      case '7d':
        return subDays(now, 7);
      case '30d':
        return subDays(now, 30);
      case '3m':
        return subMonths(now, 3);
      case '1y':
        return subYears(now, 1);
      case 'all':
      default:
        return new Date(0);
    }
  })();

  // Get mode-specific filters
  const modeFilters = MODES.find(m => m.id === activeMode)?.filters || {};

  // Filter ideas by search, direction, source, asset type, grade, date range, AND mode
  const filteredIdeas = tradeIdeas.filter(idea => {
    const matchesSearch = !tradeIdeaSearch || 
      idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase()) ||
      idea.catalyst.toLowerCase().includes(tradeIdeaSearch.toLowerCase());
    
    const isDayTrade = idea.holdingPeriod === 'day';
    const matchesDirection = activeDirection === "all" || 
      (activeDirection === "day_trade" && isDayTrade) ||
      (activeDirection !== "day_trade" && idea.direction === activeDirection);
    
    const matchesSource = activeSource === "all" || idea.source === activeSource;
    const matchesAssetType = activeAssetType === "all" || idea.assetType === activeAssetType;
    const matchesGrade = activeGrade === "all" || idea.probabilityBand?.startsWith(activeGrade) || false;
    
    const ideaDate = parseISO(idea.timestamp);
    const matchesDateRange = dateRange === 'all' || (!isBefore(ideaDate, rangeStart) || ideaDate.getTime() === rangeStart.getTime());
    
    // Apply mode-specific filters
    if (modeFilters.source && !modeFilters.source.includes(idea.source)) {
      return false;
    }
    
    if (modeFilters.assetType && !modeFilters.assetType.includes(idea.assetType)) {
      return false;
    }
    
    if (modeFilters.priceRange) {
      const { min, max } = modeFilters.priceRange;
      if (idea.entryPrice < min || idea.entryPrice > max) {
        return false;
      }
    }
    
    if (modeFilters.rrMin && idea.riskRewardRatio < modeFilters.rrMin) {
      return false;
    }
    
    if (modeFilters.grades) {
      const grade = idea.probabilityBand?.charAt(0);
      if (!grade || !modeFilters.grades.includes(grade)) {
        return false;
      }
    }
    
    return matchesSearch && matchesDirection && matchesSource && matchesAssetType && matchesGrade && matchesDateRange;
  });

  const isTodayIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const today = new Date();
    return isSameDay(ideaDate, today) && idea.outcomeStatus === 'open';
  };
  
  const isVeryFreshIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const cutoffTime = subHours(new Date(), 2);
    return ideaDate >= cutoffTime && idea.outcomeStatus === 'open';
  };

  const sortedIdeas = [...filteredIdeas].sort((a, b) => {
    return calculatePriorityScore(b) - calculatePriorityScore(a);
  });

  const topPicks = sortedIdeas
    .filter(idea => isTodayIdea(idea))
    .slice(0, 5);

  const groupedIdeas = sortedIdeas.reduce((acc, idea) => {
    const assetType = idea.assetType;
    if (!acc[assetType]) acc[assetType] = [];
    acc[assetType].push(idea);
    return acc;
  }, {} as Record<string, TradeIdea[]>);

  const newIdeasCount = filteredIdeas.filter(isVeryFreshIdea).length;

  // Get current mode metadata for display
  const currentMode = MODES.find(m => m.id === activeMode);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Aurora Hero */}
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative flex items-center justify-between gap-4 pt-6">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-gradient-premium" data-testid="text-page-title">Trade Desk</h1>
              <span className="text-sm font-medium text-muted-foreground hidden md:inline" data-testid="text-current-date">
                {format(new Date(), 'EEEE, MMM d')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Multi-mode trading strategy platform
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {newIdeasCount > 0 && (
              <Badge variant="default" className="animate-pulse neon-accent badge-shimmer" data-testid="badge-new-ideas">
                {newIdeasCount} NEW
              </Badge>
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      {/* Mode Tabs */}
      <TradeDeskModeTabs mode={activeMode} onModeChange={handleModeChange} />

      {/* Lotto Mode Warning Banner */}
      {activeMode === 'lotto' && (
        <Alert variant="destructive" className="bg-amber-500/10 border-amber-500/50">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-500">High Risk - Lotto Plays</AlertTitle>
          <AlertDescription className="text-amber-500/90">
            These are speculative far-OTM options ($20-70 entry). Most will expire worthless, 
            but successful plays can return 20x. Only risk what you can afford to lose.
            Recommended: 1-2% of account per play.
          </AlertDescription>
        </Alert>
      )}

      {/* Mode Description Card */}
      {currentMode && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-background">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <currentMode.icon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">{currentMode.label} Mode</p>
                <p className="text-xs text-muted-foreground">{currentMode.description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk Disclosure */}
      <RiskDisclosure variant="compact" engineVersion="v2.2.0" />

      {/* ACTIVE DATE FILTER BANNER */}
      <Card className={cn(
        "shadow-lg border-2 transition-all",
        dateRange !== 'all' 
          ? "bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/50" 
          : "bg-card border-border/50"
      )}>
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarIcon className={cn(
                "w-5 h-5",
                dateRange !== 'all' ? "text-primary" : "text-muted-foreground"
              )} />
              <span className="text-sm font-semibold">Posted:</span>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className={cn(
                  "w-40 font-semibold",
                  dateRange !== 'all' && "border-primary/50 bg-primary/5"
                )} data-testid="select-date-range-ideas">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today Only</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="3m">Last 3 Months</SelectItem>
                  <SelectItem value="1y">Last Year</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            {dateRange !== 'all' && (
              <Badge variant="default" className="px-3 py-1.5 bg-primary text-primary-foreground font-semibold">
                <Activity className="w-3 h-3 mr-1.5" />
                Filtered view
              </Badge>
            )}

            <Badge variant="outline" className="badge-shimmer px-3 py-1.5 font-semibold">
              {filteredIdeas.length} trade{filteredIdeas.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {dateRange !== 'all' && (
            <div className="mt-3 pt-3 border-t border-primary/20">
              <div className="flex items-center gap-2 text-sm">
                <Info className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-muted-foreground">
                  Showing trade ideas posted 
                  <span className="font-semibold text-foreground mx-1">
                    {dateRange === 'today' && 'today'}
                    {dateRange === '7d' && 'in the last 7 days'}
                    {dateRange === '30d' && 'in the last 30 days'}
                    {dateRange === '3m' && 'in the last 3 months'}
                    {dateRange === '1y' && 'in the last year'}
                  </span>
                  ({filteredIdeas.filter(i => i.outcomeStatus === 'open').length} active, {filteredIdeas.filter(i => i.outcomeStatus === 'hit_target').length} winners)
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekend Notice Banner */}
      {isWeekend() && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5" data-testid="weekend-preview-section">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Markets open {format(getNextTradingWeekStart(), 'EEEE, MMM d')} at 9:30 AM CT</p>
                <p className="text-xs text-muted-foreground">
                  {tradeIdeas.filter(i => i.outcomeStatus === 'open').length > 0 
                    ? `${tradeIdeas.filter(i => i.outcomeStatus === 'open').length} ideas ready for next week`
                    : "Use the generation buttons above to create new trade ideas"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simplified Filter Bar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search symbols or catalysts..."
            value={tradeIdeaSearch}
            onChange={(e) => setTradeIdeaSearch(e.target.value)}
            className="pl-10 pr-10"
            data-testid="input-search-ideas"
          />
          {tradeIdeaSearch && (
            <button
              type="button"
              onClick={() => setTradeIdeaSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-clear-search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Generate Ideas Buttons */}
        <Button 
          onClick={() => generateQuantIdeas.mutate()}
          disabled={generateQuantIdeas.isPending}
          size="sm"
          className="gap-1.5 bg-cyan-600 hover:bg-cyan-700"
          data-testid="button-generate-quant-permanent"
        >
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline">{generateQuantIdeas.isPending ? "..." : "Quant"}</span>
        </Button>
        <Button 
          onClick={() => generateAIIdeas.mutate()}
          disabled={generateAIIdeas.isPending}
          size="sm"
          className="gap-1.5 bg-purple-600 hover:bg-purple-700"
          data-testid="button-generate-ai-permanent"
        >
          <Bot className="h-4 w-4" />
          <span className="hidden sm:inline">{generateAIIdeas.isPending ? "..." : "AI"}</span>
        </Button>
        <Button 
          onClick={() => generateHybridIdeas.mutate()}
          disabled={generateHybridIdeas.isPending}
          size="sm"
          className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
          data-testid="button-generate-hybrid-permanent"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">{generateHybridIdeas.isPending ? "..." : "Hybrid"}</span>
        </Button>
        <Button 
          onClick={() => generateNewsIdeas.mutate()}
          disabled={generateNewsIdeas.isPending}
          size="sm"
          className="gap-1.5 bg-amber-600 hover:bg-amber-700"
          data-testid="button-generate-news-permanent"
        >
          <Newspaper className="h-4 w-4" />
          <span className="hidden sm:inline">{generateNewsIdeas.isPending ? "..." : "News"}</span>
        </Button>
        <Button 
          onClick={() => generateFlowIdeas.mutate()}
          disabled={generateFlowIdeas.isPending}
          size="sm"
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          data-testid="button-generate-flow-permanent"
        >
          <Activity className="h-4 w-4" />
          <span className="hidden sm:inline">{generateFlowIdeas.isPending ? "..." : "Flow"}</span>
        </Button>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="h-8 px-3"
            data-testid="button-view-list"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
            className="h-8 px-3"
            data-testid="button-view-grid"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="default" className="gap-2" data-testid="button-filters">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {(activeAssetType !== "all" || activeSource !== "all" || activeGrade !== "all" || activeDirection !== "all") && (
                <Badge variant="secondary" className="ml-1">
                  {[activeAssetType !== "all", activeSource !== "all", activeGrade !== "all", activeDirection !== "all"].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96" align="end">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-3">Filter Trade Ideas</h4>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Asset Type</Label>
                <Select value={activeAssetType} onValueChange={(value: any) => setActiveAssetType(value)}>
                  <SelectTrigger data-testid="select-asset-type-popover">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Asset Types</SelectItem>
                    <SelectItem value="stock">Stock Shares</SelectItem>
                    <SelectItem value="penny_stock">Penny Stocks</SelectItem>
                    <SelectItem value="option">Stock Options</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Source</Label>
                <Select value={activeSource} onValueChange={(value: any) => setActiveSource(value)}>
                  <SelectTrigger data-testid="select-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="ai">AI Generated</SelectItem>
                    <SelectItem value="quant">Quantitative</SelectItem>
                    <SelectItem value="manual">Manual Entry</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Quality Grade</Label>
                <Select value={activeGrade} onValueChange={(value: any) => setActiveGrade(value)}>
                  <SelectTrigger data-testid="select-grade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grades</SelectItem>
                    <SelectItem value="A">Grade A (High Confidence)</SelectItem>
                    <SelectItem value="B">Grade B (Medium Confidence)</SelectItem>
                    <SelectItem value="C">Grade C (Lower Confidence)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Direction</Label>
                <div className="flex gap-2">
                  <Button
                    variant={activeDirection === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("all")}
                    className="flex-1"
                    data-testid="filter-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={activeDirection === "long" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("long")}
                    className="flex-1"
                    data-testid="filter-long"
                  >
                    Long
                  </Button>
                  <Button
                    variant={activeDirection === "short" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("short")}
                    className="flex-1"
                    data-testid="filter-short"
                  >
                    Short
                  </Button>
                  <Button
                    variant={activeDirection === "day_trade" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("day_trade")}
                    className="flex-1"
                    data-testid="filter-daytrade"
                  >
                    Day
                  </Button>
                </div>
              </div>

            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Top Picks Today */}
      {topPicks.length > 0 && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5" data-testid="top-picks-section">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUpIcon className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Top Picks Today</CardTitle>
                <Badge variant="default" className="ml-1">
                  {topPicks.length}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Best quality + R:R + probability
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {topPicks.map((idea, index) => (
              <div
                key={idea.id}
                className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-card hover-elevate active-elevate-2 cursor-pointer"
                onClick={() => handleToggleExpand(idea.id)}
                data-testid={`top-pick-${index + 1}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base">{idea.symbol}</span>
                      <Badge variant={idea.direction === "long" ? "default" : "destructive"} className="text-xs">
                        {idea.direction === "long" ? "LONG" : "SHORT"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {idea.holdingPeriod.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{idea.catalyst}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <Badge 
                      variant={idea.probabilityBand?.startsWith('A') ? 'default' : idea.probabilityBand?.startsWith('B') ? 'secondary' : 'outline'}
                      className="font-bold"
                    >
                      {idea.probabilityBand}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      R:R {idea.riskRewardRatio?.toFixed(1)} • Score: {idea.confidenceScore?.toFixed(0)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Trade Ideas Feed */}
      <Tabs defaultValue="fresh" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fresh" data-testid="tab-fresh-ideas" className="gap-1.5">
            <span className="hidden sm:inline">FRESH</span>
            <span className="sm:hidden">NEW</span>
            {filteredIdeas.filter(isVeryFreshIdea).length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
                {filteredIdeas.filter(isVeryFreshIdea).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active-ideas" className="gap-1.5">
            <span className="hidden sm:inline">ACTIVE</span>
            <span className="sm:hidden">ALL</span>
            {filteredIdeas.filter(i => i.outcomeStatus === 'open').length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
                {filteredIdeas.filter(i => i.outcomeStatus === 'open').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="winners" data-testid="tab-winners-ideas" className="gap-1.5">
            <span className="hidden sm:inline">WINNERS</span>
            <span className="sm:hidden">WIN</span>
            {filteredIdeas.filter(i => i.outcomeStatus === 'hit_target').length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 bg-green-500/20 text-green-500 border-green-500/30">
                {filteredIdeas.filter(i => i.outcomeStatus === 'hit_target').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="losers" data-testid="tab-losers-ideas" className="gap-1.5">
            <span className="hidden sm:inline">LOSERS</span>
            <span className="sm:hidden">LOSS</span>
            {filteredIdeas.filter(i => i.outcomeStatus === 'hit_stop').length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 bg-red-500/20 text-red-500 border-red-500/30">
                {filteredIdeas.filter(i => i.outcomeStatus === 'hit_stop').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="expired" data-testid="tab-expired-ideas" className="gap-1.5">
            <span className="hidden sm:inline">EXPIRED</span>
            <span className="sm:hidden">EXP</span>
            {filteredIdeas.filter(i => i.outcomeStatus === 'expired').length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 bg-amber-500/20 text-amber-500 border-amber-500/30">
                {filteredIdeas.filter(i => i.outcomeStatus === 'expired').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fresh" className="space-y-4">
          {ideasLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" data-testid={`skeleton-idea-${i}`} />
              ))}
            </div>
          ) : filteredIdeas.filter(isVeryFreshIdea).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No fresh trade ideas</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {tradeIdeas.length === 0 
                    ? "Use the generation buttons above to create new ideas" 
                    : "Fresh ideas appear here within 2 hours of generation"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="space-y-4" defaultValue={Object.entries(groupedIdeas).filter(([, ideas]) => ideas.some(isVeryFreshIdea))[0]?.[0]}>
              {Object.entries(groupedIdeas)
                .filter(([, ideas]) => ideas.some(isVeryFreshIdea))
                .sort(([a], [b]) => {
                  const order = { 'stock': 0, 'penny_stock': 1, 'option': 2, 'crypto': 3 };
                  return (order[a as keyof typeof order] || 0) - (order[b as keyof typeof order] || 0);
                })
                .map(([assetType, ideas]) => {
                  const assetTypeLabels = {
                    'stock': 'Stock Shares',
                    'penny_stock': 'Penny Stocks',
                    'option': 'Stock Options', 
                    'crypto': 'Crypto'
                  };
                  const label = assetTypeLabels[assetType as keyof typeof assetTypeLabels] || assetType;
                  
                  return (
                    <AccordionItem key={assetType} value={assetType} className="border rounded-lg">
                      <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-asset-${assetType}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{label}</span>
                          <Badge variant="outline" className="animate-pulse badge-shimmer" data-testid={`badge-count-${assetType}`}>
                            {ideas.filter(isVeryFreshIdea).length} fresh
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className={`px-4 pb-4 ${viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}`}>
                        {ideas
                          .filter(isVeryFreshIdea)
                          .map(idea => (
                            <TradeIdeaBlock
                              key={idea.id}
                              idea={idea}
                              currentPrice={idea.assetType === 'option' ? undefined : priceMap[idea.symbol]}
                              catalysts={catalysts}
                              isExpanded={expandedIdeaId === idea.id}
                              onToggleExpand={() => handleToggleExpand(idea.id)}
                              data-testid={`idea-card-${idea.id}`}
                            />
                          ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          {ideasLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" data-testid={`skeleton-idea-${i}`} />
              ))}
            </div>
          ) : filteredIdeas.filter(i => i.outcomeStatus === 'open').length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No active trade ideas</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {tradeIdeas.length === 0 
                    ? "Generate quantitative ideas to get started" 
                    : "Try adjusting your filters"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="single" collapsible className="space-y-4" defaultValue={Object.entries(groupedIdeas).filter(([, ideas]) => ideas.some(i => i.outcomeStatus === 'open'))[0]?.[0]}>
              {Object.entries(groupedIdeas)
                .filter(([, ideas]) => ideas.some(i => i.outcomeStatus === 'open'))
                .sort(([a], [b]) => {
                  const order = { 'stock': 0, 'penny_stock': 1, 'option': 2, 'crypto': 3 };
                  return (order[a as keyof typeof order] || 0) - (order[b as keyof typeof order] || 0);
                })
                .map(([assetType, ideas]) => {
                  const assetTypeLabels = {
                    'stock': 'Stock Shares',
                    'penny_stock': 'Penny Stocks',
                    'option': 'Stock Options', 
                    'crypto': 'Crypto'
                  };
                  const label = assetTypeLabels[assetType as keyof typeof assetTypeLabels] || assetType;
                  
                  return (
                    <AccordionItem key={assetType} value={assetType} className="border rounded-lg">
                      <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-asset-${assetType}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{label}</span>
                          <Badge variant="outline" data-testid={`badge-count-${assetType}`}>
                            {ideas.filter(i => i.outcomeStatus === 'open').length} ideas
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className={`px-4 pb-4 ${viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}`}>
                        {ideas
                          .filter(i => i.outcomeStatus === 'open')
                          .map(idea => (
                            <TradeIdeaBlock
                              key={idea.id}
                              idea={idea}
                              currentPrice={idea.assetType === 'option' ? undefined : priceMap[idea.symbol]}
                              catalysts={catalysts}
                              isExpanded={expandedIdeaId === idea.id}
                              onToggleExpand={() => handleToggleExpand(idea.id)}
                              data-testid={`idea-card-${idea.id}`}
                            />
                          ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
            </Accordion>
          )}
        </TabsContent>

        <TabsContent value="winners" className="space-y-4">
          {filteredIdeas.filter(i => i.outcomeStatus === 'hit_target').length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-green-500/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No winning trades yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Trades that hit target will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}>
              {filteredIdeas
                .filter(i => i.outcomeStatus === 'hit_target')
                .map(idea => (
                  <TradeIdeaBlock
                    key={idea.id}
                    idea={idea}
                    currentPrice={idea.assetType === 'option' ? undefined : priceMap[idea.symbol]}
                    catalysts={catalysts}
                    isExpanded={expandedIdeaId === idea.id}
                    onToggleExpand={() => handleToggleExpand(idea.id)}
                    data-testid={`winner-idea-card-${idea.id}`}
                  />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="losers" className="space-y-4">
          {filteredIdeas.filter(i => i.outcomeStatus === 'hit_stop').length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <XCircle className="h-12 w-12 text-red-500/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No losing trades yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Trades that hit stop loss will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}>
              {filteredIdeas
                .filter(i => i.outcomeStatus === 'hit_stop')
                .map(idea => (
                  <TradeIdeaBlock
                    key={idea.id}
                    idea={idea}
                    currentPrice={idea.assetType === 'option' ? undefined : priceMap[idea.symbol]}
                    catalysts={catalysts}
                    isExpanded={expandedIdeaId === idea.id}
                    onToggleExpand={() => handleToggleExpand(idea.id)}
                    data-testid={`loser-idea-card-${idea.id}`}
                  />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="expired" className="space-y-4">
          {filteredIdeas.filter(i => i.outcomeStatus === 'expired').length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-amber-500/50 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No expired trades</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Trades that expired without resolution will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}>
              {filteredIdeas
                .filter(i => i.outcomeStatus === 'expired')
                .map(idea => (
                  <TradeIdeaBlock
                    key={idea.id}
                    idea={idea}
                    currentPrice={idea.assetType === 'option' ? undefined : priceMap[idea.symbol]}
                    catalysts={catalysts}
                    isExpanded={expandedIdeaId === idea.id}
                    onToggleExpand={() => handleToggleExpand(idea.id)}
                    data-testid={`expired-idea-card-${idea.id}`}
                  />
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
