import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MarketSessionBadge } from "@/components/market-session-badge";
import { PriceCard } from "@/components/price-card";
import { TradeIdeaBlock } from "@/components/trade-idea-block";
import { RiskCalculator } from "@/components/risk-calculator";
import { CatalystFeed } from "@/components/catalyst-feed";
import { ScreenerFilters } from "@/components/screener-filters";
import { WatchlistTable } from "@/components/watchlist-table";
import { ThemeToggle } from "@/components/theme-toggle";
import { SymbolSearch } from "@/components/symbol-search";
import { SymbolDetailModal } from "@/components/symbol-detail-modal";
import { QuantAIBot } from "@/components/quantai-bot";
import { getMarketSession, formatCTTime } from "@/lib/utils";
import type { MarketData, TradeIdea, Catalyst, WatchlistItem, ScreenerFilters as Filters } from "@shared/schema";
import { TrendingUp, DollarSign, Activity, Settings, Search, Clock, Star, ArrowUp, ArrowDown, RefreshCw, ChevronDown, Calendar, Bot, Sparkles, Brain, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const [activeFilters, setActiveFilters] = useState<Filters>({});
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<MarketData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [nextRefresh, setNextRefresh] = useState<number>(60);
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "day_trade" | "all">("all");
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
    refetchInterval: 60000,
  });

  const { data: watchlist = [], isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    refetchOnWindowFocus: true,
  });

  const refreshPricesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/refresh-prices', {});
    },
    onSuccess: () => {
      setLastUpdate(new Date());
      setNextRefresh(60);
      queryClient.invalidateQueries({ queryKey: ['/api/market-data'] });
    },
    onError: () => {
      toast({
        title: "Refresh Failed",
        description: "Could not update prices. Trying again shortly.",
        variant: "destructive",
      });
    },
  });

  // Initial price refresh on mount (only once)
  useEffect(() => {
    let mounted = true;
    if (mounted && !refreshPricesMutation.isPending) {
      refreshPricesMutation.mutate();
    }
    return () => { mounted = false; };
  }, []);

  // Auto-refresh countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setNextRefresh((prev) => {
        if (prev <= 1) {
          refreshPricesMutation.mutate();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    refreshPricesMutation.mutate();
  };

  const generateQuantIdeasMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/quant/generate-ideas', {
        count: 8
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "Quant Ideas Generated!",
        description: `Generated ${data.count} ideas using momentum, volume & catalyst signals`,
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Failed to generate quantitative trade ideas. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateAIIdeasMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/ai/generate-ideas', {
        marketContext: "Current market conditions with focus on stocks, options, and crypto. Find hidden gems and high-potential opportunities."
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({
        title: "AI Ideas Generated!",
        description: `Generated ${data.count} ideas using AI analysis`,
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || '';
      const isBillingError = errorMessage.includes('credit') || errorMessage.includes('billing') || errorMessage.includes('quota') || errorMessage.includes('rate limit');
      
      toast({
        title: isBillingError ? "API Credits Required" : "AI Generation Failed",
        description: isBillingError 
          ? "AI provider credits are low or exhausted. Use 'Quant Ideas' for quantitative analysis, or add API credits to continue using AI features."
          : "Failed to generate AI trade ideas. Please try again or use Quant Ideas instead.",
        variant: "destructive",
      });
    },
  });

  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/watchlist/${id}`);
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/watchlist'] });
      const previousWatchlist = queryClient.getQueryData<WatchlistItem[]>(['/api/watchlist']);
      queryClient.setQueryData<WatchlistItem[]>(
        ['/api/watchlist'],
        (old = []) => old.filter((item) => item.id !== id)
      );
      return { previousWatchlist };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(['/api/watchlist'], context?.previousWatchlist);
      toast({
        title: "Error",
        description: "Failed to remove from watchlist. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Removed from watchlist",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
  });

  const handleRemoveFromWatchlist = (id: string) => {
    removeFromWatchlistMutation.mutate(id);
  };

  const filteredMarketData = marketData.filter((data) => {
    if (activeFilters.assetType && activeFilters.assetType.length > 0) {
      if (!activeFilters.assetType.includes(data.assetType)) return false;
    }
    if (activeFilters.priceRange) {
      if (activeFilters.priceRange.min && data.currentPrice < activeFilters.priceRange.min) return false;
      if (activeFilters.priceRange.max && data.currentPrice > activeFilters.priceRange.max) return false;
    }
    if (activeFilters.volumeThreshold && data.volume < activeFilters.volumeThreshold) return false;
    if (activeFilters.pennyStocksOnly && data.currentPrice >= 5) return false;
    if (activeFilters.unusualVolume && data.avgVolume && data.volume < data.avgVolume * 2) return false;
    return true;
  });

  const filteredTradeIdeas = tradeIdeas.filter((idea) => {
    if (!tradeIdeaSearch) return true;
    return idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase());
  });

  // Helper to determine if an idea is a day trade
  const isDayTrade = (idea: TradeIdea): boolean => {
    const today = new Date().toISOString().split('T')[0];
    
    // Options: only day trade if expiring TODAY
    if (idea.assetType === 'option' && idea.expiryDate) {
      const expiryDate = new Date(idea.expiryDate).toISOString().split('T')[0];
      return expiryDate === today;
    }
    
    // Stocks/Crypto: day trade if during active trading session
    if (idea.assetType === 'stock' || idea.assetType === 'crypto') {
      return idea.sessionContext.includes('Regular Trading') || 
             idea.sessionContext.includes('Pre-Market') || 
             idea.sessionContext.includes('After Hours');
    }
    
    return false;
  };

  const filteredIdeas = filteredTradeIdeas.filter((idea) => {
    if (activeDirection === "all") return true;
    if (activeDirection === "day_trade") return isDayTrade(idea);
    return idea.direction === activeDirection;
  });

  // Helper functions for date grouping
  const getDateLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const groupIdeasByDate = (ideas: TradeIdea[]) => {
    const groups: Record<string, TradeIdea[]> = {};
    ideas.forEach(idea => {
      const label = getDateLabel(idea.timestamp);
      if (!groups[label]) groups[label] = [];
      groups[label].push(idea);
    });
    return groups;
  };

  const groupByAssetType = (ideas: TradeIdea[]) => {
    const groups: Record<string, TradeIdea[]> = {
      'STOCK OPTIONS': [],
      'STOCK SHARES': [],
      'CRYPTO': []
    };
    ideas.forEach(idea => {
      if (idea.assetType === 'option') {
        groups['STOCK OPTIONS'].push(idea);
      } else if (idea.assetType === 'stock') {
        groups['STOCK SHARES'].push(idea);
      } else if (idea.assetType === 'crypto') {
        groups['CRYPTO'].push(idea);
      }
    });
    return groups;
  };

  const dateGroups = groupIdeasByDate(filteredTradeIdeas);

  const addToWatchlistMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const symbolData = marketData.find(m => m.symbol === symbol);
      if (!symbolData) throw new Error("Symbol not found");
      
      return await apiRequest('POST', '/api/watchlist', {
        symbol: symbol,
        assetType: symbolData.assetType,
        targetPrice: symbolData.currentPrice * 1.1,
        notes: "Added from dashboard",
        addedAt: new Date().toISOString(),
      });
    },
    onMutate: async (symbol: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/watchlist'] });
      const previousWatchlist = queryClient.getQueryData<WatchlistItem[]>(['/api/watchlist']);
      const symbolData = marketData.find(m => m.symbol === symbol);
      
      if (symbolData) {
        const newItem: WatchlistItem = {
          id: `temp-${Date.now()}`,
          symbol: symbol,
          assetType: symbolData.assetType,
          targetPrice: symbolData.currentPrice * 1.1,
          notes: "Added from dashboard",
          addedAt: new Date().toISOString(),
        };
        
        queryClient.setQueryData<WatchlistItem[]>(
          ['/api/watchlist'],
          (old = []) => [...old, newItem]
        );
      }
      
      return { previousWatchlist };
    },
    onError: (err, symbol, context) => {
      queryClient.setQueryData(['/api/watchlist'], context?.previousWatchlist);
      toast({
        title: "Error",
        description: "Failed to add to watchlist. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Added to Watchlist",
        description: "Symbol successfully added to your watchlist",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
  });

  const handleViewSymbolDetails = (symbol: MarketData) => {
    setSelectedSymbol(symbol);
    setDetailModalOpen(true);
  };

  const handleAddToWatchlist = (symbol: string) => {
    addToWatchlistMutation.mutate(symbol);
  };

  const topGainer = marketData.length > 0 
    ? marketData.reduce((max, data) => data.changePercent > max.changePercent ? data : max)
    : null;

  const topLoser = marketData.length > 0
    ? marketData.reduce((min, data) => data.changePercent < min.changePercent ? data : min)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold" data-testid="text-app-title">QuantEdge Research</h1>
              </div>
              <MarketSessionBadge session={currentSession} />
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-sm text-muted-foreground font-mono" data-testid="text-current-time">
                {currentTime}
              </span>
              <Button
                variant="default"
                size="sm"
                onClick={() => setChatBotOpen(true)}
                className="gap-2"
                data-testid="button-open-quantai"
              >
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">QuantAI Bot</span>
              </Button>
              <ThemeToggle />
              <Button variant="ghost" size="icon" data-testid="button-settings">
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card data-testid="card-stat-opportunities">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Opportunities</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-stat-opportunities">
                {tradeIdeas.length}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {tradeIdeas.filter(t => t.riskRewardRatio >= 2).length} high R:R (≥2:1)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {marketData.length} symbols tracked
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-top-gainer" className="hover-elevate cursor-pointer" onClick={() => topGainer && handleViewSymbolDetails(topGainer)}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Gainer</CardTitle>
              <ArrowUp className="h-4 w-4 text-bullish" />
            </CardHeader>
            <CardContent>
              {topGainer ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono">{topGainer.symbol}</span>
                    <span className="text-sm text-bullish font-semibold">+{topGainer.changePercent.toFixed(2)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    ${topGainer.currentPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {topGainer.assetType.charAt(0).toUpperCase() + topGainer.assetType.slice(1)}
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-top-loser" className="hover-elevate cursor-pointer" onClick={() => topLoser && handleViewSymbolDetails(topLoser)}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Loser</CardTitle>
              <ArrowDown className="h-4 w-4 text-bearish" />
            </CardHeader>
            <CardContent>
              {topLoser ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono">{topLoser.symbol}</span>
                    <span className="text-sm text-bearish font-semibold">{topLoser.changePercent.toFixed(2)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    ${topLoser.currentPrice.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {topLoser.assetType.charAt(0).toUpperCase() + topLoser.assetType.slice(1)}
                  </p>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No data</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 mb-6">
          <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-data-notice">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-amber-300 mb-1">Market Data Notice</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-amber-400">Free Tier Limitations:</strong> Stock prices refresh every 60 seconds using free API tiers with rate limits. 
                    Crypto prices update via CoinGecko (no API key needed). For true real-time data, consider upgrading to premium data providers. 
                    <span className="text-amber-300 font-medium ml-1">Last refresh: {formatCTTime(lastUpdate)}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-symbol-search">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search & Add Symbols
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Search for any stock or crypto to add it to your dashboard. Crypto works instantly (BTC, ETH, SOL, DOGE, etc.). Stocks require Alpha Vantage API key.
              </p>
            </CardHeader>
            <CardContent>
              <SymbolSearch />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <Tabs defaultValue="new" className="w-full">
              <Card data-testid="card-trade-ideas">
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Trade Ideas
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => generateQuantIdeasMutation.mutate()}
                      disabled={generateQuantIdeasMutation.isPending || generateAIIdeasMutation.isPending}
                      className="gap-2"
                      data-testid="button-generate-quant-ideas"
                    >
                      <Sparkles className={`h-3 w-3 ${generateQuantIdeasMutation.isPending ? 'animate-pulse' : ''}`} />
                      {generateQuantIdeasMutation.isPending ? 'Analyzing...' : 'Quant Ideas'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => generateAIIdeasMutation.mutate()}
                      disabled={generateQuantIdeasMutation.isPending || generateAIIdeasMutation.isPending}
                      className="gap-2"
                      data-testid="button-generate-ai-ideas"
                    >
                      <Brain className={`h-3 w-3 ${generateAIIdeasMutation.isPending ? 'animate-pulse' : ''}`} />
                      {generateAIIdeasMutation.isPending ? 'Generating...' : 'AI Ideas'}
                    </Button>
                    <div className="flex gap-1">
                      <Button 
                        variant={activeDirection === "all" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setActiveDirection("all")}
                        data-testid="filter-all"
                      >
                        All
                      </Button>
                      <Button 
                        variant={activeDirection === "long" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setActiveDirection("long")}
                        data-testid="filter-long"
                      >
                        Long
                      </Button>
                      <Button 
                        variant={activeDirection === "short" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setActiveDirection("short")}
                        data-testid="filter-short"
                      >
                        Short
                      </Button>
                      <Button 
                        variant={activeDirection === "day_trade" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setActiveDirection("day_trade")}
                        data-testid="filter-day-trade"
                      >
                        Day Trade
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground border-l pl-2">
                      <Clock className="h-3 w-3" />
                      <span className="hidden sm:inline">Next: {nextRefresh}s</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleManualRefresh}
                        disabled={refreshPricesMutation.isPending}
                      >
                        <RefreshCw className={`h-3 w-3 ${refreshPricesMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <TabsList className="mx-6 mb-4 grid w-auto grid-cols-4 gap-2">
                  <TabsTrigger value="new" data-testid="tab-new-ideas">NEW IDEAS</TabsTrigger>
                  <TabsTrigger value="options" data-testid="tab-stock-options">Stock Options</TabsTrigger>
                  <TabsTrigger value="shares" data-testid="tab-stock-shares">Stock Shares</TabsTrigger>
                  <TabsTrigger value="crypto" data-testid="tab-crypto">Crypto</TabsTrigger>
                </TabsList>

                {/* NEW IDEAS Tab - with date-based accordion */}
                <TabsContent value="new" className="mt-0">
                  <CardContent>
                    {ideasLoading ? (
                      <Skeleton className="h-[400px] w-full" />
                    ) : Object.keys(dateGroups).length > 0 ? (
                      <Accordion type="multiple" defaultValue={["Today", "Yesterday"]} className="w-full">
                        {Object.entries(dateGroups)
                          .sort(([dateA], [dateB]) => {
                            if (dateA === "Today") return -1;
                            if (dateB === "Today") return 1;
                            if (dateA === "Yesterday") return -1;
                            if (dateB === "Yesterday") return 1;
                            return new Date(dateB).getTime() - new Date(dateA).getTime();
                          })
                          .map(([date, ideas]) => {
                            const filteredByDirection = ideas.filter(idea => 
                              activeDirection === "all" || idea.direction === activeDirection
                            );
                            const assetGroups = groupByAssetType(filteredByDirection);
                            const totalCount = filteredByDirection.length;
                            
                            if (totalCount === 0) return null;
                            
                            return (
                              <AccordionItem key={date} value={date} className="border-b border-border">
                                <AccordionTrigger className="hover:no-underline py-4">
                                  <div className="flex items-center gap-3 w-full">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-semibold">{date}</span>
                                    <Badge variant="secondary" className="ml-auto mr-2">
                                      {totalCount} {totalCount === 1 ? 'idea' : 'ideas'}
                                    </Badge>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="space-y-3 pt-2">
                                  {Object.entries(assetGroups).map(([assetType, assetIdeas]) => {
                                    if (assetIdeas.length === 0) return null;
                                    
                                    return (
                                      <Collapsible key={assetType} defaultOpen={true}>
                                        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors group">
                                          <div className="flex items-center gap-2">
                                            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                            <span className="font-medium text-sm">{assetType}</span>
                                          </div>
                                          <Badge variant="outline" className="text-xs">
                                            {assetIdeas.length}
                                          </Badge>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="space-y-2 mt-3">
                                          {assetIdeas.map((idea) => {
                                            const symbolData = marketData.find(m => m.symbol === idea.symbol);
                                            return (
                                              <TradeIdeaBlock 
                                                key={idea.id} 
                                                idea={idea}
                                                currentPrice={symbolData?.currentPrice}
                                                onAddToWatchlist={() => handleAddToWatchlist(idea.symbol)}
                                                onViewDetails={(symbol) => {
                                                  const data = marketData.find(m => m.symbol === symbol);
                                                  if (data) handleViewSymbolDetails(data);
                                                }}
                                              />
                                            );
                                          })}
                                        </CollapsibleContent>
                                      </Collapsible>
                                    );
                                  })}
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                      </Accordion>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12">
                        <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                        <p className="text-muted-foreground">No trade ideas available</p>
                        <p className="text-sm text-muted-foreground mt-2">Check back later for new opportunities</p>
                      </div>
                    )}
                  </CardContent>
                </TabsContent>

                {/* Stock Options Tab */}
                <TabsContent value="options" className="mt-0">
                  <CardContent>
                    {ideasLoading ? (
                      <Skeleton className="h-[400px] w-full" />
                    ) : (
                      <div className="space-y-2">
                        {filteredIdeas
                          .filter(idea => idea.assetType === "option")
                          .map((idea) => {
                            const symbolData = marketData.find(m => m.symbol === idea.symbol);
                            return (
                              <TradeIdeaBlock 
                                key={idea.id} 
                                idea={idea}
                                currentPrice={symbolData?.currentPrice}
                                onAddToWatchlist={() => handleAddToWatchlist(idea.symbol)}
                                onViewDetails={(symbol) => {
                                  const data = marketData.find(m => m.symbol === symbol);
                                  if (data) handleViewSymbolDetails(data);
                                }}
                              />
                            );
                          })}
                        {filteredIdeas.filter(idea => idea.assetType === "option").length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12">
                            <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                            <p className="text-muted-foreground">No stock options ideas</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </TabsContent>

                {/* Stock Shares Tab */}
                <TabsContent value="shares" className="mt-0">
                  <CardContent>
                    {ideasLoading ? (
                      <Skeleton className="h-[400px] w-full" />
                    ) : (
                      <div className="space-y-2">
                        {filteredIdeas
                          .filter(idea => idea.assetType === "stock")
                          .map((idea) => {
                            const symbolData = marketData.find(m => m.symbol === idea.symbol);
                            return (
                              <TradeIdeaBlock 
                                key={idea.id} 
                                idea={idea}
                                currentPrice={symbolData?.currentPrice}
                                onAddToWatchlist={() => handleAddToWatchlist(idea.symbol)}
                                onViewDetails={(symbol) => {
                                  const data = marketData.find(m => m.symbol === symbol);
                                  if (data) handleViewSymbolDetails(data);
                                }}
                              />
                            );
                          })}
                        {filteredIdeas.filter(idea => idea.assetType === "stock").length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12">
                            <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                            <p className="text-muted-foreground">No stock shares ideas</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </TabsContent>

                {/* Crypto Tab */}
                <TabsContent value="crypto" className="mt-0">
                  <CardContent>
                    {ideasLoading ? (
                      <Skeleton className="h-[400px] w-full" />
                    ) : (
                      <div className="space-y-2">
                        {filteredIdeas
                          .filter(idea => idea.assetType === "crypto")
                          .map((idea) => {
                            const symbolData = marketData.find(m => m.symbol === idea.symbol);
                            return (
                              <TradeIdeaBlock 
                                key={idea.id} 
                                idea={idea}
                                currentPrice={symbolData?.currentPrice}
                                onAddToWatchlist={() => handleAddToWatchlist(idea.symbol)}
                                onViewDetails={(symbol) => {
                                  const data = marketData.find(m => m.symbol === symbol);
                                  if (data) handleViewSymbolDetails(data);
                                }}
                              />
                            );
                          })}
                        {filteredIdeas.filter(idea => idea.assetType === "crypto").length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12">
                            <TrendingUp className="h-12 w-12 text-muted-foreground opacity-20 mb-3" />
                            <p className="text-muted-foreground">No crypto ideas</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </TabsContent>
              </Card>
            </Tabs>
          </div>

          <div className="space-y-6">
            <WatchlistTable 
              items={watchlist} 
              onRemove={handleRemoveFromWatchlist}
              isRemoving={removeFromWatchlistMutation.isPending}
            />
            <CatalystFeed catalysts={catalysts} />
          </div>
        </div>

        <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-muted-border">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Important Disclaimer:</strong> All content provided on QuantEdge Research is for 
            educational and research purposes only. This platform does not provide personalized financial advice or recommendations. 
            Trading involves substantial risk of loss. Always conduct your own research, understand the risks, and consider consulting 
            with a qualified financial advisor before making any investment decisions. Past performance does not guarantee future results.
          </p>
        </div>
      </main>

      <SymbolDetailModal
        symbol={selectedSymbol}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onAddToWatchlist={() => selectedSymbol && handleAddToWatchlist(selectedSymbol.symbol)}
      />

      <QuantAIBot isOpen={chatBotOpen} onClose={() => setChatBotOpen(false)} />
    </div>
  );
}