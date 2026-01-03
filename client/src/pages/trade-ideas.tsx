import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TradeIdea, IdeaSource, MarketData, Catalyst } from "@shared/schema";
import { Calendar as CalendarIcon, Search, RefreshCw, ChevronDown, TrendingUp, X, Sparkles, TrendingUpIcon, UserPlus, BarChart3, LayoutGrid, List, Filter, SlidersHorizontal, CalendarClock, CheckCircle, XCircle, Clock, Info, Activity, Newspaper, Bot, Brain, Calculator, Rocket } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfDay, isSameDay, parseISO, subHours, subDays, subMonths, subYears, isAfter, isBefore } from "date-fns";
import { isWeekend, getNextTradingWeekStart, cn } from "@/lib/utils";
import { RiskDisclosure } from "@/components/risk-disclosure";

export default function TradeIdeasPage() {
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "day_trade" | "all">("all");
  const [activeSource, setActiveSource] = useState<IdeaSource | "all">("all");
  const [activeAssetType, setActiveAssetType] = useState<"stock" | "penny_stock" | "option" | "crypto" | "all">("all");
  const [activeGrade, setActiveGrade] = useState<"all" | "A" | "B" | "C">("all");
  const [dateRange, setDateRange] = useState<string>('all');
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [analyzeFormOpen, setAnalyzeFormOpen] = useState(false);
  const [analyzeSymbol, setAnalyzeSymbol] = useState("");
  const [analyzeAssetType, setAnalyzeAssetType] = useState<"stock" | "option" | "crypto">("stock");
  const [analyzeOptionType, setAnalyzeOptionType] = useState<"call" | "put">("call");
  const [analyzeStrike, setAnalyzeStrike] = useState("");
  const [analyzeExpiration, setAnalyzeExpiration] = useState("");
  const [symbolSearchResults, setSymbolSearchResults] = useState<{symbol: string; description: string; type: string}[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Symbol autocomplete search
  useEffect(() => {
    const searchSymbols = async () => {
      if (analyzeSymbol.length < 1) {
        setSymbolSearchResults([]);
        return;
      }
      
      setIsSearching(true);
      try {
        const response = await fetch(`/api/symbol-autocomplete?q=${encodeURIComponent(analyzeSymbol)}`);
        const data = await response.json();
        setSymbolSearchResults(data.results || []);
        setShowSearchResults(true);
      } catch (error) {
        console.error('Symbol search error:', error);
        setSymbolSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchSymbols, 300);
    return () => clearTimeout(debounce);
  }, [analyzeSymbol]);

  // Close search results on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchResultsRef.current && !searchResultsRef.current.contains(event.target as Node) &&
          searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSymbol = (symbol: string, type: string) => {
    setAnalyzeSymbol(symbol);
    if (type === 'crypto') {
      setAnalyzeAssetType('crypto');
    } else {
      setAnalyzeAssetType('stock');
    }
    setShowSearchResults(false);
  };

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 10000, // 10s for real-time price updates
    staleTime: 5000, // Fresh for 5s - enables live price movement
  });

  // Fetch market data for real-time prices
  const { data: marketData = [] } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 10000, // 10s for real-time market data
    staleTime: 5000,
  });

  // Fetch catalysts for earnings warnings
  const { data: catalysts = [] } = useQuery<Catalyst[]>({
    queryKey: ['/api/catalysts'],
    refetchInterval: 3600000,
    staleTime: 3600000, // 1 hour for catalysts (slow-changing)
  });

  // Create a map of symbol to current price from trade ideas (already includes live prices from backend)
  const priceMap = tradeIdeas.reduce((acc, idea) => {
    if (idea.currentPrice != null) { // Use != null to handle $0 edge case
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
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "Quant Ideas Generated",
        description: `Generated ${data.count || data.newIdeas || 0} new quantitative research briefs`,
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

  // Generate AI Ideas mutation
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
        description: `Generated ${data.count || 0} new AI-powered research briefs`,
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

  // Generate Hybrid Ideas mutation (AI + Quant)
  const generateHybridIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/hybrid/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "Hybrid Ideas Generated",
        description: `Generated ${data.count || 0} new hybrid (AI+Quant) research briefs`,
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

  // Generate News-based Ideas mutation
  const generateNewsIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/news/generate-ideas', {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "News Ideas Generated",
        description: `Generated ${data.count || 0} news-driven research briefs`,
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

  // Generate Flow Scanner Ideas mutation
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

  // Generate Penny Stock Ideas (Tomorrow's Playbook) mutation
  const generatePennyIdeas = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/ideas/generate-now', { focusPennyStocks: true });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "Penny Stock Ideas Generated",
        description: data.message || `Generated ${data.ideasGenerated || 0} penny stock lotto plays`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate penny stock ideas (rate limited to 1 per 5 min)",
        variant: "destructive"
      });
    }
  });

  // Custom Analysis Request mutation
  const analyzePlay = useMutation({
    mutationFn: async (params: {
      symbol: string;
      assetType: "stock" | "option" | "crypto";
      optionType?: "call" | "put";
      strike?: number;
      expiration?: string;
      direction?: "long" | "short";
    }) => {
      return await apiRequest('POST', '/api/analyze-play', params);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      toast({
        title: "Analysis Complete",
        description: `Created research brief for ${data.symbol}`,
      });
      setAnalyzeSymbol("");
      setAnalyzeStrike("");
      setAnalyzeExpiration("");
      setAnalyzeFormOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze play",
        variant: "destructive"
      });
    }
  });

  const handleAnalyzeSubmit = () => {
    if (!analyzeSymbol.trim()) {
      toast({
        title: "Symbol Required",
        description: "Please enter a ticker symbol",
        variant: "destructive"
      });
      return;
    }
    
    analyzePlay.mutate({
      symbol: analyzeSymbol.trim().toUpperCase(),
      assetType: analyzeAssetType,
      optionType: analyzeAssetType === 'option' ? analyzeOptionType : undefined,
      strike: analyzeAssetType === 'option' && analyzeStrike ? parseFloat(analyzeStrike) : undefined,
      expiration: analyzeAssetType === 'option' && analyzeExpiration ? analyzeExpiration : undefined,
      direction: 'long'
    });
  };

  const handleToggleExpand = (ideaId: string) => {
    setExpandedIdeaId(expandedIdeaId === ideaId ? null : ideaId);
  };

  const handleCollapseAll = () => {
    setExpandedIdeaId(null);
  };

  // Calculate priority score for ranking opportunities
  // Higher score = better opportunity (combines grade, R:R, probability)
  const calculatePriorityScore = (idea: TradeIdea): number => {
    const confidenceScore = idea.confidenceScore || 0;
    const rrRatio = idea.riskRewardRatio || 0;
    const hitProbability = idea.targetHitProbability || 0;
    
    // Weighted scoring: Confidence 40%, R:R 30%, Probability 30%
    return (confidenceScore * 0.4) + (rrRatio * 15) + (hitProbability * 0.3);
  };

  // Calculate date range for filtering
  const rangeStart = (() => {
    const now = new Date();
    switch (dateRange) {
      case 'today':
        return startOfDay(now);
      case 'yesterday':
        return startOfDay(subDays(now, 1));
      case '3d':
        return subDays(now, 3);
      case '7d':
        return subDays(now, 7);
      case '30d':
        return subDays(now, 30);
      case '3m':
        return subMonths(now, 3);
      case '1y':
        return subYears(now, 1);
      case 'custom':
        return customDate ? startOfDay(customDate) : new Date(0);
      case 'all':
      default:
        return new Date(0);
    }
  })();
  
  // For custom date, also calculate range end (end of that day)
  const rangeEnd = dateRange === 'custom' && customDate 
    ? new Date(startOfDay(customDate).getTime() + 24 * 60 * 60 * 1000 - 1) 
    : null;
  
  // For yesterday, also limit to that single day
  const yesterdayEnd = dateRange === 'yesterday'
    ? new Date(startOfDay(new Date()).getTime() - 1)
    : null;

  // Filter ideas by search, direction, source, asset type, grade, and date range
  const filteredIdeas = tradeIdeas.filter(idea => {
    const matchesSearch = !tradeIdeaSearch || 
      idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase()) ||
      idea.catalyst.toLowerCase().includes(tradeIdeaSearch.toLowerCase());
    
    // Check if it's a day trade based on holdingPeriod field
    const isDayTrade = idea.holdingPeriod === 'day';
    const matchesDirection = activeDirection === "all" || 
      (activeDirection === "day_trade" && isDayTrade) ||
      (activeDirection !== "day_trade" && idea.direction === activeDirection);
    
    const matchesSource = activeSource === "all" || idea.source === activeSource;
    
    const matchesAssetType = activeAssetType === "all" || idea.assetType === activeAssetType;
    
    const matchesGrade = activeGrade === "all" || idea.probabilityBand?.startsWith(activeGrade) || false;
    
    // Date range filtering - filters by when trade was created/posted
    const ideaDate = parseISO(idea.timestamp);
    let matchesDateRange = dateRange === 'all';
    
    if (!matchesDateRange) {
      const afterStart = !isBefore(ideaDate, rangeStart) || ideaDate.getTime() === rangeStart.getTime();
      
      // For specific date filters (yesterday, custom), also check end boundary
      if (dateRange === 'yesterday' && yesterdayEnd) {
        matchesDateRange = afterStart && ideaDate <= yesterdayEnd;
      } else if (dateRange === 'custom' && rangeEnd) {
        matchesDateRange = afterStart && ideaDate <= rangeEnd;
      } else {
        matchesDateRange = afterStart;
      }
    }
    
    return matchesSearch && matchesDirection && matchesSource && matchesAssetType && matchesGrade && matchesDateRange;
  });

  // Helper function to check if an idea is from today (created same trading day)
  // Top Picks remain stable throughout the trading day
  const isTodayIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const today = new Date();
    return isSameDay(ideaDate, today) && idea.outcomeStatus === 'open';
  };
  
  // Helper function for NEW badge (created within last 2 hours)
  const isVeryFreshIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const cutoffTime = subHours(new Date(), 2);
    return ideaDate >= cutoffTime && idea.outcomeStatus === 'open';
  };

  // Sort filtered ideas by priority score (best first)
  const sortedIdeas = [...filteredIdeas].sort((a, b) => {
    return calculatePriorityScore(b) - calculatePriorityScore(a);
  });

  // Get Top Picks: Best 5 opportunities from today (stable throughout trading day)
  const topPicks = sortedIdeas
    .filter(idea => isTodayIdea(idea))
    .slice(0, 5);

  // Group by asset type (using sorted ideas for consistent ordering)
  const groupedIdeas = sortedIdeas.reduce((acc, idea) => {
    const assetType = idea.assetType;
    if (!acc[assetType]) acc[assetType] = [];
    acc[assetType].push(idea);
    return acc;
  }, {} as Record<string, TradeIdea[]>);

  // Count very fresh ideas (last 2h) - for NEW badge
  const newIdeasCount = filteredIdeas.filter(isVeryFreshIdea).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header - Tech Minimalist */}
      <div className="relative mb-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Research
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-semibold" data-testid="text-page-title">Research Briefs</h1>
              <span className="text-sm font-mono text-muted-foreground hidden md:inline" data-testid="text-current-date">
                {format(new Date(), 'EEEE, MMM d')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Stocks, options, crypto opportunities
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {newIdeasCount > 0 && (
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse" data-testid="badge-new-ideas">
                {newIdeasCount} NEW
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* 🔐 Risk Disclosure - Auto-attached to all trade outputs */}
      <RiskDisclosure variant="compact" engineVersion="v2.2.0" />

      {/* ACTIVE DATE FILTER BANNER */}
      <div className={cn(
        "glass-card rounded-lg p-6 transition-all",
        dateRange !== 'all' && "border-l-2 border-cyan-500/50"
      )}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center",
              dateRange !== 'all' ? "bg-cyan-500/10" : "bg-muted"
            )}>
              <CalendarIcon className={cn(
                "w-4 h-4",
                dateRange !== 'all' ? "text-cyan-400" : "text-muted-foreground"
              )} />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Posted:</span>
            <Select value={dateRange} onValueChange={(val) => {
              setDateRange(val);
              if (val !== 'custom') setCustomDate(undefined);
            }}>
              <SelectTrigger className={cn(
                "w-40 font-mono text-sm",
                dateRange !== 'all' && "border-cyan-500/30"
              )} data-testid="select-date-range-ideas">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="3d">Last 3 Days</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="3m">Last 3 Months</SelectItem>
                <SelectItem value="1y">Last Year</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Pick Date...</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Custom Date Picker */}
            {dateRange === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 font-mono" data-testid="button-custom-date-picker">
                    <CalendarIcon className="h-4 w-4" />
                    {customDate ? format(customDate, 'MMM d, yyyy') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customDate}
                    onSelect={(date) => setCustomDate(date)}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="flex-1" />

          {/* Data Range Indicator */}
          {dateRange !== 'all' && (
            <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
              <Activity className="w-3 h-3 mr-1.5" />
              Filtered
            </Badge>
          )}

          <Badge variant="outline" className="font-mono">
            {filteredIdeas.length} trade{filteredIdeas.length !== 1 ? 's' : ''}
          </Badge>
        </div>

        {/* Active Filter Description */}
        {dateRange !== 'all' && (
          <div className="mt-3 pt-3 border-t border-slate-700/30">
            <div className="flex items-center gap-2 text-sm">
              <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span className="text-muted-foreground">
                Showing research briefs posted 
                <span className="font-semibold text-foreground mx-1">
                  {dateRange === 'today' && 'today'}
                  {dateRange === 'yesterday' && 'yesterday'}
                  {dateRange === '3d' && 'in the last 3 days'}
                  {dateRange === '7d' && 'in the last 7 days'}
                  {dateRange === '30d' && 'in the last 30 days'}
                  {dateRange === '3m' && 'in the last 3 months'}
                  {dateRange === '1y' && 'in the last year'}
                  {dateRange === 'custom' && customDate && `on ${format(customDate, 'MMM d, yyyy')}`}
                </span>
                <span className="font-mono">({filteredIdeas.filter(i => i.outcomeStatus === 'open').length} active, {filteredIdeas.filter(i => i.outcomeStatus === 'hit_target').length} winners)</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Weekend Notice Banner */}
      {isWeekend() && (
        <div className="glass-card rounded-lg p-4 border-l-2 border-amber-500/50" data-testid="weekend-preview-section">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <CalendarClock className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Markets open {format(getNextTradingWeekStart(), 'EEEE, MMM d')} at 9:30 AM CT</p>
              <p className="text-xs text-muted-foreground">
                {tradeIdeas.filter(i => i.outcomeStatus === 'open').length > 0 
                  ? <span className="font-mono">{tradeIdeas.filter(i => i.outcomeStatus === 'open').length} ideas ready for next week</span>
                  : "Use the generation buttons above to create new research briefs"}
              </p>
            </div>
          </div>
        </div>
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

        {/* Generate Ideas Buttons - All 5 Sources with Gradient Icons */}
        <Button 
          onClick={() => generateQuantIdeas.mutate()}
          disabled={generateQuantIdeas.isPending}
          size="sm"
          variant="outline"
          className="gap-1.5 border-blue-500/30 hover:border-blue-500/50"
          data-testid="button-generate-quant-permanent"
        >
          <div className="h-5 w-5 rounded bg-blue-500/10 flex items-center justify-center">
            <Calculator className="h-3 w-3 text-blue-400" />
          </div>
          <span className="hidden sm:inline">{generateQuantIdeas.isPending ? "..." : "Quant"}</span>
        </Button>
        <Button 
          onClick={() => generateAIIdeas.mutate()}
          disabled={generateAIIdeas.isPending}
          size="sm"
          variant="outline"
          className="gap-1.5 border-purple-500/30 hover:border-purple-500/50"
          data-testid="button-generate-ai-permanent"
        >
          <div className="h-5 w-5 rounded bg-purple-500/10 flex items-center justify-center">
            <Brain className="h-3 w-3 text-purple-400" />
          </div>
          <span className="hidden sm:inline">{generateAIIdeas.isPending ? "..." : "AI"}</span>
        </Button>
        <Button 
          onClick={() => generateHybridIdeas.mutate()}
          disabled={generateHybridIdeas.isPending}
          size="sm"
          variant="outline"
          className="gap-1.5 border-violet-500/30 hover:border-violet-500/50"
          data-testid="button-generate-hybrid-permanent"
        >
          <div className="h-5 w-5 rounded bg-violet-500/10 flex items-center justify-center">
            <Sparkles className="h-3 w-3 text-violet-400" />
          </div>
          <span className="hidden sm:inline">{generateHybridIdeas.isPending ? "..." : "Hybrid"}</span>
        </Button>
        <Button 
          onClick={() => generateNewsIdeas.mutate()}
          disabled={generateNewsIdeas.isPending}
          size="sm"
          variant="outline"
          className="gap-1.5 border-amber-500/30 hover:border-amber-500/50"
          data-testid="button-generate-news-permanent"
        >
          <div className="h-5 w-5 rounded bg-amber-500/10 flex items-center justify-center">
            <Newspaper className="h-3 w-3 text-amber-400" />
          </div>
          <span className="hidden sm:inline">{generateNewsIdeas.isPending ? "..." : "News"}</span>
        </Button>
        <Button 
          onClick={() => generateFlowIdeas.mutate()}
          disabled={generateFlowIdeas.isPending}
          size="sm"
          variant="outline"
          className="gap-1.5 border-cyan-500/30 hover:border-cyan-500/50"
          data-testid="button-generate-flow-permanent"
        >
          <div className="h-5 w-5 rounded bg-cyan-500/10 flex items-center justify-center">
            <Activity className="h-3 w-3 text-cyan-400" />
          </div>
          <span className="hidden sm:inline">{generateFlowIdeas.isPending ? "..." : "Flow"}</span>
        </Button>
        <Button 
          onClick={() => generatePennyIdeas.mutate()}
          disabled={generatePennyIdeas.isPending}
          size="sm"
          variant="outline"
          className="gap-1.5 border-green-500/30 hover:border-green-500/50 bg-green-500/5"
          data-testid="button-generate-penny-permanent"
        >
          <div className="h-5 w-5 rounded bg-green-500/10 flex items-center justify-center">
            <Rocket className="h-3 w-3 text-green-400" />
          </div>
          <span className="hidden sm:inline">{generatePennyIdeas.isPending ? "..." : "Penny"}</span>
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Button 
          onClick={() => setAnalyzeFormOpen(!analyzeFormOpen)}
          size="sm"
          variant={analyzeFormOpen ? "default" : "outline"}
          className="gap-1.5"
          data-testid="button-custom-analysis"
        >
          <Search className="h-3 w-3" />
          <span className="hidden sm:inline">Analyze</span>
        </Button>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button
            variant={viewMode === "list" ? "glass" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="h-8 px-3"
            data-testid="button-view-list"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "glass" : "ghost"}
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
                <h4 className="font-semibold mb-3">Filter Research Briefs</h4>
              </div>

              {/* Asset Type */}
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

              {/* Source */}
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

              {/* Grade */}
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

              {/* Direction */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Direction</Label>
                <div className="flex gap-2">
                  <Button
                    variant={activeDirection === "all" ? "glass" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("all")}
                    className="flex-1"
                    data-testid="filter-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={activeDirection === "long" ? "glass" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("long")}
                    className="flex-1"
                    data-testid="filter-long"
                  >
                    Long
                  </Button>
                  <Button
                    variant={activeDirection === "short" ? "glass" : "outline"}
                    size="sm"
                    onClick={() => setActiveDirection("short")}
                    className="flex-1"
                    data-testid="filter-short"
                  >
                    Short
                  </Button>
                  <Button
                    variant={activeDirection === "day_trade" ? "glass" : "outline"}
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

      {/* Custom Analysis Form */}
      <Collapsible open={analyzeFormOpen} onOpenChange={setAnalyzeFormOpen}>
        <CollapsibleContent>
          <Card className="glass-card border-l-2 border-cyan-500/50" data-testid="custom-analysis-form">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Search className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Custom Analysis Request</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Analyze a specific ticker or option</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px] relative">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Search Symbol</Label>
                  <div className="relative">
                    <Input
                      ref={searchInputRef}
                      placeholder="Search RKLB, TSLA, BTC..."
                      value={analyzeSymbol}
                      onChange={(e) => setAnalyzeSymbol(e.target.value.toUpperCase())}
                      onFocus={() => symbolSearchResults.length > 0 && setShowSearchResults(true)}
                      className="font-mono uppercase pr-8"
                      data-testid="input-analyze-symbol"
                    />
                    {isSearching && (
                      <RefreshCw className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {showSearchResults && symbolSearchResults.length > 0 && (
                    <div 
                      ref={searchResultsRef}
                      className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto"
                    >
                      {symbolSearchResults.map((result, idx) => (
                        <button
                          key={`${result.symbol}-${idx}`}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between gap-2 border-b last:border-b-0"
                          onClick={() => handleSelectSymbol(result.symbol, result.type)}
                          data-testid={`search-result-${result.symbol}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold">{result.symbol}</span>
                            <span className="text-xs text-muted-foreground truncate">{result.description}</span>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {result.type === 'crypto' ? 'Crypto' : result.type?.toUpperCase() || 'Stock'}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="min-w-[120px]">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Play Type</Label>
                  <Select value={analyzeAssetType} onValueChange={(v: "stock" | "option" | "crypto") => setAnalyzeAssetType(v)}>
                    <SelectTrigger data-testid="select-analyze-asset-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stock">Shares</SelectItem>
                      <SelectItem value="option">Options</SelectItem>
                      <SelectItem value="crypto">Crypto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {analyzeAssetType === 'option' && (
                  <>
                    <div className="min-w-[100px]">
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Call/Put</Label>
                      <Select value={analyzeOptionType} onValueChange={(v: "call" | "put") => setAnalyzeOptionType(v)}>
                        <SelectTrigger data-testid="select-analyze-option-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="put">Put</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="min-w-[100px]">
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Strike (optional)</Label>
                      <Input
                        type="number"
                        placeholder="150"
                        value={analyzeStrike}
                        onChange={(e) => setAnalyzeStrike(e.target.value)}
                        className="font-mono"
                        data-testid="input-analyze-strike"
                      />
                    </div>

                    <div className="min-w-[140px]">
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Expiration (optional)</Label>
                      <Input
                        type="date"
                        value={analyzeExpiration}
                        onChange={(e) => setAnalyzeExpiration(e.target.value)}
                        className="font-mono"
                        data-testid="input-analyze-expiration"
                      />
                    </div>
                  </>
                )}

                <Button
                  onClick={handleAnalyzeSubmit}
                  disabled={analyzePlay.isPending || !analyzeSymbol.trim()}
                  className="gap-2"
                  data-testid="button-submit-analyze"
                >
                  {analyzePlay.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-4 w-4" />
                      Analyze
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAnalyzeFormOpen(false)}
                  data-testid="button-close-analyze-form"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Top Picks Today - Best Opportunities */}
      {topPicks.length > 0 && (
        <div className="glass-card rounded-lg p-6 border-l-2 border-cyan-500/50" data-testid="top-picks-section">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <TrendingUpIcon className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Today's Best</p>
                <h3 className="font-semibold">Top Picks</h3>
              </div>
              <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 ml-1">
                {topPicks.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Best quality + R:R + probability
            </p>
          </div>
          <div className="space-y-3">
            {topPicks.map((idea, index) => (
              <div
                key={idea.id}
                className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-background/50 hover-elevate cursor-pointer transition-all"
                onClick={() => handleToggleExpand(idea.id)}
                data-testid={`top-pick-${index + 1}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-full bg-cyan-500/10 text-cyan-400 font-bold font-mono text-sm">
                    {index + 1}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold font-mono text-base">{idea.symbol}</span>
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
                      className="font-bold font-mono"
                    >
                      {idea.probabilityBand}
                    </Badge>
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      R:R {idea.riskRewardRatio?.toFixed(1)} • {idea.confidenceScore?.toFixed(0)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
            <div className="glass-card rounded-lg p-12 flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-lg bg-violet-500/10 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-violet-400" />
              </div>
              <p className="text-lg font-medium text-muted-foreground">No fresh research briefs</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {tradeIdeas.length === 0 
                  ? "Use the generation buttons above to create new ideas" 
                  : "Fresh ideas appear here within 2 hours of generation"}
              </p>
            </div>
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
                    <AccordionItem key={assetType} value={assetType} className="glass-card rounded-lg overflow-hidden">
                      <AccordionTrigger className="px-4 hover:no-underline hover-elevate" data-testid={`accordion-asset-${assetType}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{label}</span>
                          <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse" data-testid={`badge-count-${assetType}`}>
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
            <div className="glass-card rounded-lg p-12 flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4">
                <TrendingUp className="h-8 w-8 text-blue-400" />
              </div>
              <p className="text-lg font-medium text-muted-foreground">No active research briefs</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {tradeIdeas.length === 0 
                  ? "Generate quantitative ideas to get started" 
                  : "Try adjusting your filters"}
              </p>
            </div>
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
                    <AccordionItem key={assetType} value={assetType} className="glass-card rounded-lg overflow-hidden">
                      <AccordionTrigger className="px-4 hover:no-underline hover-elevate" data-testid={`accordion-asset-${assetType}`}>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{label}</span>
                          <Badge variant="outline" className="font-mono" data-testid={`badge-count-${assetType}`}>
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
            <div className="glass-card rounded-lg p-12 flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-lg bg-green-500/10 flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <p className="text-lg font-medium text-muted-foreground">No winning trades yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Trades that hit target will appear here
              </p>
            </div>
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
            <div className="glass-card rounded-lg p-12 flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-lg bg-red-500/10 flex items-center justify-center mb-4">
                <XCircle className="h-8 w-8 text-red-400" />
              </div>
              <p className="text-lg font-medium text-muted-foreground">No losing trades yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Trades that hit stop loss will appear here
              </p>
            </div>
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
            <div className="glass-card rounded-lg p-12 flex flex-col items-center justify-center">
              <div className="h-16 w-16 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
                <Clock className="h-8 w-8 text-amber-400" />
              </div>
              <p className="text-lg font-medium text-muted-foreground">No expired trades</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Trades that expired without resolution will appear here
              </p>
            </div>
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
