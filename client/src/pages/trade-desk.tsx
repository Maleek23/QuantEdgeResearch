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
import { getPerformanceGrade } from "@/lib/performance-grade";
import { ClosedTradesTable } from "@/components/closed-trades-table";

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
  
  // Filter state for new filter toolbar
  const [expiryFilter, setExpiryFilter] = useState<string>('all'); // Default to all (was causing confusion)
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // Show all trades by default
  const [sortBy, setSortBy] = useState<string>('priority'); // priority, timestamp, expiry, confidence, rr
  const [symbolSearch, setSymbolSearch] = useState<string>('');
  
  // TASK 2: Pagination state
  const [visibleCount, setVisibleCount] = useState(50);
  
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
  
  // TASK 2: Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [expiryFilter, assetTypeFilter, gradeFilter, statusFilter, sortBy, symbolSearch, dateRange, tradeIdeaSearch, activeDirection, activeSource, activeAssetType, activeGrade, activeMode]);
  
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

  // Helper to normalize outcomeStatus (trim whitespace + lowercase)
  const normalizeStatus = (status: string | null | undefined): string => {
    return (status || '').trim().toLowerCase();
  };

  const isTodayIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const today = new Date();
    return isSameDay(ideaDate, today) && normalizeStatus(idea.outcomeStatus) === 'open';
  };
  
  const isVeryFreshIdea = (idea: TradeIdea) => {
    const ideaDate = parseISO(idea.timestamp);
    const cutoffTime = subHours(new Date(), 2);
    return ideaDate >= cutoffTime && normalizeStatus(idea.outcomeStatus) === 'open';
  };

  // Get current mode metadata for display
  const currentMode = MODES.find(m => m.id === activeMode);

  // Helper: Apply non-expiry filters (asset type, grade, symbol, status)
  const applyNonExpiryFilters = (ideas: TradeIdea[]) => {
    let filtered = [...ideas];

    // 1. Asset type filter
    if (assetTypeFilter !== 'all') {
      filtered = filtered.filter(idea => idea.assetType === assetTypeFilter);
    }

    // 2. Grade filter
    if (gradeFilter !== 'all') {
      filtered = filtered.filter(idea => {
        if (gradeFilter === 'LOTTO') return idea.isLottoPlay;
        
        const grade = getPerformanceGrade(idea.confidenceScore).grade;
        if (gradeFilter === 'A') return grade === 'A+' || grade === 'A';
        if (gradeFilter === 'B') return grade === 'B+' || grade === 'B';
        if (gradeFilter === 'C') return grade === 'C+' || grade === 'C';
        if (gradeFilter === 'D') return grade === 'D';
        return true;
      });
    }

    // 3. Symbol search
    if (symbolSearch) {
      filtered = filtered.filter(idea => idea.symbol.toUpperCase().includes(symbolSearch));
    }

    // 4. TASK 1: Status filter (normalized: trim + lowercase)
    if (statusFilter !== 'all') {
      filtered = filtered.filter(idea => {
        const status = normalizeStatus(idea.outcomeStatus);
        switch (statusFilter) {
          case 'active': return status === 'open';
          case 'won': return status === 'hit_target';
          case 'lost': return status === 'hit_stop';
          case 'expired': return status === 'expired';
          default: return true;
        }
      });
    }

    return filtered;
  };

  // Apply all filters and sorting to trade ideas
  const filterAndSortIdeas = (ideas: TradeIdea[]) => {
    // First apply non-expiry filters
    let filtered = applyNonExpiryFilters(ideas);

    // Then apply expiry filter
    if (expiryFilter !== 'all') {
      const today = startOfDay(new Date());
      filtered = filtered.filter(idea => {
        // Non-option trades (stocks/crypto) don't have expiry dates
        // When filtering by specific expiry bucket, exclude them
        if (!idea.expiryDate && !idea.exitBy) {
          return false; // Hide stocks/crypto when filtering by expiry buckets
        }
        
        const expiry = startOfDay(new Date(idea.expiryDate || idea.exitBy!));
        const daysToExp = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Apply specific expiry filter
        switch (expiryFilter) {
          case 'expired': return daysToExp < 0; // Expired (yesterday or earlier)
          case '7d': return daysToExp >= 0 && daysToExp <= 7; // 0-7 days (includes today)
          case '14d': return daysToExp > 7 && daysToExp <= 14; // 8-14 days (non-overlapping)
          case '30d': return daysToExp > 14 && daysToExp <= 60; // 15-60 days (monthly range)
          case '90d': return daysToExp > 60 && daysToExp <= 270; // 61-270 days (quarterly)
          case 'leaps': return daysToExp > 270; // 270+ days (LEAPS)
          default: return true;
        }
      });
    }

    // Finally sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority': {
          // Priority-based sorting: Fresh → Active → Closed/Expired
          const getPriorityRank = (idea: TradeIdea): number => {
            // Normalize outcomeStatus (trim whitespace + lowercase)
            const status = normalizeStatus(idea.outcomeStatus);
            
            if (isVeryFreshIdea(idea)) return 0; // Fresh trades (last 2h, open)
            if (status === 'open') return 1; // Active trades (open)
            return 2; // Closed/Expired trades
          };
          
          const aRank = getPriorityRank(a);
          const bRank = getPriorityRank(b);
          
          // Sort by rank first
          if (aRank !== bRank) {
            return aRank - bRank;
          }
          
          // Within same rank, sort by timestamp (newest first)
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }
        case 'timestamp':
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        case 'expiry':
          const aExp = new Date(a.expiryDate || a.exitBy || a.timestamp).getTime();
          const bExp = new Date(b.expiryDate || b.exitBy || b.timestamp).getTime();
          return aExp - bExp;
        case 'confidence':
          return b.confidenceScore - a.confidenceScore;
        case 'rr':
          return b.riskRewardRatio - a.riskRewardRatio;
        default:
          return 0;
      }
    });

    return filtered;
  };

  // Apply all filters
  const filteredAndSortedIdeas = filterAndSortIdeas(filteredIdeas);

  // DUAL-SECTION: Split into active and closed trades
  const activeIdeas = filteredAndSortedIdeas.filter(idea => normalizeStatus(idea.outcomeStatus) === 'open');
  const closedIdeas = filteredAndSortedIdeas.filter(idea => {
    const status = normalizeStatus(idea.outcomeStatus);
    return status === 'hit_target' || status === 'hit_stop' || status === 'expired';
  });

  // TASK 2: Paginate ONLY the active ideas
  const paginatedActiveIdeas = activeIdeas.slice(0, visibleCount);

  // Calculate trade counts for each expiry bucket (AFTER non-expiry filters, BEFORE expiry filter)
  const calculateExpiryCounts = () => {
    const today = startOfDay(new Date());
    // Start with ideas after non-expiry filters (asset type, grade, symbol)
    const baseIdeas = applyNonExpiryFilters(filteredIdeas);
    const counts = { '7d': 0, '14d': 0, '30d': 0, '90d': 0, 'leaps': 0, 'expired': 0, 'all': baseIdeas.length };
    
    baseIdeas.forEach(idea => {
      // Non-option trades (stocks/crypto) count towards 'all' but not expiry buckets
      if (!idea.expiryDate && !idea.exitBy) {
        return;
      }
      
      const expiry = startOfDay(new Date(idea.expiryDate || idea.exitBy!));
      // Use calendar days (start of day) to avoid time-of-day issues
      // This keeps same-day expirations in 0-7d bucket until midnight
      const daysToExp = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysToExp < 0) counts['expired']++; // Truly expired (yesterday or earlier)
      else if (daysToExp >= 0 && daysToExp <= 7) counts['7d']++; // 0-7 days (includes today)
      else if (daysToExp > 7 && daysToExp <= 14) counts['14d']++;
      else if (daysToExp > 14 && daysToExp <= 60) counts['30d']++;
      else if (daysToExp > 60 && daysToExp <= 270) counts['90d']++;
      else if (daysToExp > 270) counts['leaps']++;
    });
    
    return counts;
  };

  const expiryCounts = calculateExpiryCounts();

  // Compute derived values from filtered and sorted ideas
  const topPicks = filteredAndSortedIdeas
    .filter(idea => isTodayIdea(idea))
    .slice(0, 5);

  // TASK 2: Use paginated active ideas for grouping (active trades only)
  const groupedIdeas = paginatedActiveIdeas.reduce((acc, idea) => {
    const assetType = idea.assetType;
    if (!acc[assetType]) acc[assetType] = [];
    acc[assetType].push(idea);
    return acc;
  }, {} as Record<string, TradeIdea[]>);

  const newIdeasCount = filteredAndSortedIdeas.filter(isVeryFreshIdea).length;

  // TASK 3: Calculate summary stats for each group (normalized status)
  const calculateGroupStats = (ideas: TradeIdea[]) => {
    const closedTrades = ideas.filter(i => {
      const status = normalizeStatus(i.outcomeStatus);
      return status === 'hit_target' || status === 'hit_stop';
    });
    const wins = ideas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target').length;
    const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
    
    const netPL = ideas.reduce((sum, i) => sum + (i.realizedPnL || 0), 0);
    
    const rrValues = ideas.map(i => i.riskRewardRatio).filter(rr => rr != null && rr > 0);
    const avgRR = rrValues.length > 0 ? rrValues.reduce((sum, rr) => sum + rr, 0) / rrValues.length : 0;
    
    return { winRate, netPL, avgRR, closedTrades: closedTrades.length };
  };

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

      {/* PHASE 1: Signal Pulse Stats Overview - Replaces Tabbed Content */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Signal Pulse</CardTitle>
            <Badge variant="outline" className="ml-auto text-xs">
              {filteredAndSortedIdeas.length} total
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Fresh Ideas Tile */}
            <div 
              className="flex flex-col items-center justify-center p-4 rounded-lg border bg-card/50 hover-elevate cursor-pointer transition-all"
              onClick={() => {
                const freshIdeas = filteredAndSortedIdeas.filter(isVeryFreshIdea);
                if (freshIdeas.length > 0) {
                  handleToggleExpand(freshIdeas[0].id);
                }
              }}
              data-testid="stats-fresh-tile"
            >
              <Sparkles className="h-8 w-8 text-primary mb-2" />
              <div className="text-3xl font-bold text-primary">
                {filteredAndSortedIdeas.filter(isVeryFreshIdea).length}
              </div>
              <div className="text-xs text-muted-foreground font-semibold mt-1">FRESH</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">Last 2 hours</div>
            </div>

            {/* Active Ideas Tile */}
            <div 
              className="flex flex-col items-center justify-center p-4 rounded-lg border bg-card/50 hover-elevate cursor-pointer transition-all"
              onClick={() => {
                const activeIdeas = filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'open');
                if (activeIdeas.length > 0) {
                  handleToggleExpand(activeIdeas[0].id);
                }
              }}
              data-testid="stats-active-tile"
            >
              <Activity className="h-8 w-8 text-blue-500 mb-2" />
              <div className="text-3xl font-bold text-blue-500">
                {filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'open').length}
              </div>
              <div className="text-xs text-muted-foreground font-semibold mt-1">ACTIVE</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">Open positions</div>
            </div>

            {/* Winners Tile */}
            <div 
              className="flex flex-col items-center justify-center p-4 rounded-lg border bg-card/50 hover-elevate cursor-pointer transition-all"
              onClick={() => {
                const winners = filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target');
                if (winners.length > 0) {
                  handleToggleExpand(winners[0].id);
                }
              }}
              data-testid="stats-winners-tile"
            >
              <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
              <div className="text-3xl font-bold text-green-500">
                {filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target').length}
              </div>
              <div className="text-xs text-muted-foreground font-semibold mt-1">WINNERS</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">Hit target</div>
            </div>

            {/* Losers Tile */}
            <div 
              className="flex flex-col items-center justify-center p-4 rounded-lg border bg-card/50 hover-elevate cursor-pointer transition-all"
              onClick={() => {
                const losers = filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_stop');
                if (losers.length > 0) {
                  handleToggleExpand(losers[0].id);
                }
              }}
              data-testid="stats-losers-tile"
            >
              <XCircle className="h-8 w-8 text-red-500 mb-2" />
              <div className="text-3xl font-bold text-red-500">
                {filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_stop').length}
              </div>
              <div className="text-xs text-muted-foreground font-semibold mt-1">LOSERS</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">Hit stop</div>
            </div>

            {/* Expired Tile */}
            <div 
              className="flex flex-col items-center justify-center p-4 rounded-lg border bg-card/50 hover-elevate cursor-pointer transition-all"
              onClick={() => {
                const expired = filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'expired');
                if (expired.length > 0) {
                  handleToggleExpand(expired[0].id);
                }
              }}
              data-testid="stats-expired-tile"
            >
              <Clock className="h-8 w-8 text-amber-500 mb-2" />
              <div className="text-3xl font-bold text-amber-500">
                {filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'expired').length}
              </div>
              <div className="text-xs text-muted-foreground font-semibold mt-1">EXPIRED</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">Time ran out</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PHASE 2 & 4: Enhanced Filter Toolbar with Date Range */}
      <div className="border-b bg-card/30 backdrop-blur-sm">
        <div className="px-6 py-3 space-y-3">
          {/* Row 1: Expiry Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-semibold mr-2">EXPIRY:</span>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { value: 'all', label: 'All' },
                { value: '7d', label: '0-7d' },
                { value: '14d', label: '8-14d' },
                { value: '30d', label: '15-60d' },
                { value: '90d', label: '61-270d' },
                { value: 'leaps', label: '270d+' },
                { value: 'expired', label: 'Expired', variant: 'destructive' as const }
              ].map(chip => {
                const count = expiryCounts[chip.value as keyof typeof expiryCounts] || 0;
                return (
                  <Button
                    key={chip.value}
                    variant={expiryFilter === chip.value ? (chip.variant || 'default') : 'outline'}
                    size="sm"
                    className="h-7 px-3 text-xs font-semibold"
                    onClick={() => setExpiryFilter(chip.value)}
                    data-testid={`filter-expiry-${chip.value}`}
                  >
                    {chip.label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator className="opacity-50" />

          {/* Row 2: Filters, Date Range, and Generation Buttons */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left: Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Asset Type Dropdown */}
              <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
                <SelectTrigger className="h-7 w-[130px] text-xs" data-testid="filter-asset-type">
                  <SelectValue placeholder="Asset Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assets</SelectItem>
                  <SelectItem value="option">Options</SelectItem>
                  <SelectItem value="stock">Stocks</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="penny_stock">Penny Stocks</SelectItem>
                </SelectContent>
              </Select>

              {/* Grade Filter Dropdown */}
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="h-7 w-[120px] text-xs" data-testid="filter-grade">
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grades</SelectItem>
                  <SelectItem value="A">A+ / A</SelectItem>
                  <SelectItem value="B">B+ / B</SelectItem>
                  <SelectItem value="C">C+ / C</SelectItem>
                  <SelectItem value="D">D</SelectItem>
                  <SelectItem value="LOTTO">LOTTO</SelectItem>
                </SelectContent>
              </Select>

              {/* TASK 1: Status Filter Dropdown */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-7 w-[120px] text-xs" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="won">Winners</SelectItem>
                  <SelectItem value="lost">Losers</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort By Dropdown */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-7 w-[140px] text-xs" data-testid="filter-sort">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority">Priority (Smart)</SelectItem>
                  <SelectItem value="timestamp">Newest First</SelectItem>
                  <SelectItem value="expiry">Expiry (Nearest)</SelectItem>
                  <SelectItem value="confidence">Confidence (High)</SelectItem>
                  <SelectItem value="rr">R:R Ratio (Best)</SelectItem>
                </SelectContent>
              </Select>

              {/* Date Range Dropdown - Integrated from old card */}
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="h-7 w-[130px] text-xs" data-testid="select-date-range-ideas">
                  <SelectValue placeholder="Posted" />
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

              {/* Symbol Search */}
              <Input
                type="text"
                placeholder="Search symbol..."
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
                className="h-7 w-[140px] text-xs"
                data-testid="filter-symbol-search"
              />

              {/* Clear Filters Button */}
              {(expiryFilter !== 'all' || assetTypeFilter !== 'all' || gradeFilter !== 'all' || statusFilter !== 'all' || sortBy !== 'priority' || symbolSearch !== '' || dateRange !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setExpiryFilter('all');
                    setAssetTypeFilter('all');
                    setGradeFilter('all');
                    setStatusFilter('all');
                    setSortBy('priority');
                    setSymbolSearch('');
                    setDateRange('all');
                  }}
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Right: PHASE 5 - Enhanced Generation Buttons */}
            <div className="flex items-center gap-1.5 border rounded-md p-1 bg-card/50">
              <Button 
                onClick={() => generateQuantIdeas.mutate()}
                disabled={generateQuantIdeas.isPending}
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-3"
                data-testid="button-generate-quant-permanent"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                {generateQuantIdeas.isPending ? <span className="text-xs">...</span> : <span className="text-xs font-semibold">Quant</span>}
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button 
                onClick={() => generateAIIdeas.mutate()}
                disabled={generateAIIdeas.isPending}
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-3"
                data-testid="button-generate-ai-permanent"
              >
                <Bot className="h-3.5 w-3.5" />
                {generateAIIdeas.isPending ? <span className="text-xs">...</span> : <span className="text-xs font-semibold">AI</span>}
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button 
                onClick={() => generateHybridIdeas.mutate()}
                disabled={generateHybridIdeas.isPending}
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-3"
                data-testid="button-generate-hybrid-permanent"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {generateHybridIdeas.isPending ? <span className="text-xs">...</span> : <span className="text-xs font-semibold">Hybrid</span>}
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button 
                onClick={() => generateNewsIdeas.mutate()}
                disabled={generateNewsIdeas.isPending}
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-3"
                data-testid="button-generate-news-permanent"
              >
                <Newspaper className="h-3.5 w-3.5" />
                {generateNewsIdeas.isPending ? <span className="text-xs">...</span> : <span className="text-xs font-semibold">News</span>}
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button 
                onClick={() => generateFlowIdeas.mutate()}
                disabled={generateFlowIdeas.isPending}
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-3"
                data-testid="button-generate-flow-permanent"
              >
                <Activity className="h-3.5 w-3.5" />
                {generateFlowIdeas.isPending ? <span className="text-xs">...</span> : <span className="text-xs font-semibold">Flow</span>}
              </Button>
            </div>
          </div>

          {/* Active Filter Badge */}
          {(expiryFilter !== 'all' || assetTypeFilter !== 'all' || gradeFilter !== 'all' || statusFilter !== 'active' || symbolSearch !== '' || dateRange !== 'all') && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {[
                  statusFilter !== 'active' && `Status: ${statusFilter}`,
                  expiryFilter !== 'all' && `Expiry: ${expiryFilter}`,
                  assetTypeFilter !== 'all' && `Type: ${assetTypeFilter}`,
                  gradeFilter !== 'all' && `Grade: ${gradeFilter}`,
                  symbolSearch && `Symbol: ${symbolSearch}`,
                  dateRange !== 'all' && `Posted: ${dateRange}`
                ].filter(Boolean).join(' • ')}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* PHASE 3: Lotto Mode Warning Banner - Keep this conditional alert */}
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

      {/* Risk Disclosure */}
      <RiskDisclosure variant="compact" engineVersion="v2.2.0" />

      {/* PHASE 4: Weekend Notice - Merged into content area */}
      {isWeekend() && (
        <Alert className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5" data-testid="weekend-preview-section">
          <CalendarClock className="h-4 w-4 text-primary" />
          <AlertTitle className="text-sm">Markets Closed - Weekend Preview</AlertTitle>
          <AlertDescription className="text-xs">
            Markets open {format(getNextTradingWeekStart(), 'EEEE, MMM d')} at 9:30 AM CT.
            {filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'open').length > 0 
              ? ` ${filteredAndSortedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'open').length} ideas ready for next week.`
              : " Use the generation buttons above to create new trade ideas."}
          </AlertDescription>
        </Alert>
      )}

      {/* Advanced Search and View Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
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

        {/* Legacy Filters Popover - Keep for backward compatibility */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="default" className="gap-2" data-testid="button-filters">
              <SlidersHorizontal className="h-4 w-4" />
              More Filters
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
                <h4 className="font-semibold mb-3">Advanced Filters</h4>
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
                    <SelectItem value="future">Futures (CME)</SelectItem>
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

      {/* PHASE 6: All Trade Ideas - Unified View (Replaces Tabbed Content) */}
      <div className="space-y-8">
        {/* Loading State */}
        {ideasLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" data-testid={`skeleton-idea-${i}`} />
            ))}
          </div>
        ) : filteredAndSortedIdeas.length === 0 ? (
          /* Enhanced Empty State */
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="rounded-full bg-primary/5 p-6 mb-6">
                <BarChart3 className="h-16 w-16 text-primary/50" />
              </div>
              <h3 className="text-2xl font-bold mb-2">No Trade Ideas Found</h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {tradeIdeas.length === 0 
                  ? "Start generating quantitative trade ideas using the buttons in the toolbar above. Each engine uses different strategies to find opportunities."
                  : statusFilter === 'active'
                    ? "No active trade ideas match your filters. Try showing all statuses or adjusting other filters."
                    : "No ideas match your current filters. Try adjusting the filters above or generate new ideas."}
              </p>
              {statusFilter !== 'all' && tradeIdeas.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setStatusFilter('all')}
                  className="mb-4"
                  data-testid="button-show-all-statuses"
                >
                  Show All Statuses
                </Button>
              )}
              <p className="text-sm text-muted-foreground text-center">
                {statusFilter === 'active' && "Tip: By default, only ACTIVE trades are shown to reduce clutter"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* SECTION 1: Active Trades */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Active Trades</h3>
                  <Badge variant="default" className="bg-blue-500/20 text-blue-500 border-blue-500/30">
                    {activeIdeas.length} open
                  </Badge>
                </div>
                {expandedIdeaId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCollapseAll}
                    className="gap-1.5"
                    data-testid="button-collapse-all"
                  >
                    <X className="h-4 w-4" />
                    Collapse All
                  </Button>
                )}
              </div>

              {activeIdeas.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Activity className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground text-sm">No active trades match your filters</p>
                  </CardContent>
                </Card>
              ) : (
                <Accordion type="single" collapsible className="space-y-4" defaultValue={Object.entries(groupedIdeas)[0]?.[0]}>
                  {Object.entries(groupedIdeas)
                    .sort(([a], [b]) => {
                      const order = { 'stock': 0, 'penny_stock': 1, 'option': 2, 'future': 3, 'crypto': 4 };
                      return (order[a as keyof typeof order] || 0) - (order[b as keyof typeof order] || 0);
                    })
                    .map(([assetType, ideas]) => {
                      const assetTypeLabels = {
                        'stock': 'Stock Shares',
                        'penny_stock': 'Penny Stocks',
                        'option': 'Stock Options',
                        'future': 'Futures (CME)',
                        'crypto': 'Crypto'
                      };
                      const label = assetTypeLabels[assetType as keyof typeof assetTypeLabels] || assetType;
                      
                      const stats = calculateGroupStats(ideas);
                      
                      return (
                        <AccordionItem key={assetType} value={assetType} className="border rounded-lg">
                          <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-asset-${assetType}`}>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-semibold">{label}</span>
                              <Badge variant="outline" data-testid={`badge-count-${assetType}`}>
                                {ideas.length} idea{ideas.length !== 1 ? 's' : ''}
                              </Badge>
                              {stats.avgRR > 0 && (
                                <Badge variant="outline" className="text-xs font-mono">
                                  {stats.avgRR.toFixed(1)}x R:R
                                </Badge>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className={`px-4 pb-4 ${viewMode === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}`}>
                            {ideas.map(idea => (
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

              {/* Load More Button for Active Trades */}
              {activeIdeas.length > 0 && visibleCount < activeIdeas.length && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setVisibleCount(prev => prev + 50)}
                    className="gap-2"
                    data-testid="button-load-more"
                  >
                    Load More Active
                    <Badge variant="secondary" className="ml-1">
                      {Math.min(50, activeIdeas.length - visibleCount)} more
                    </Badge>
                  </Button>
                </div>
              )}
            </div>

            {/* SECTION 2: Closed Trades */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Closed Trades</h3>
                  <Badge variant="outline">
                    {closedIdeas.length} total
                  </Badge>
                  {closedIdeas.length > 0 && (
                    <>
                      <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">
                        {closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target').length} wins
                      </Badge>
                      <Badge variant="destructive" className="bg-red-500/20 text-red-500 border-red-500/30 text-xs">
                        {closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_stop').length} losses
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              <ClosedTradesTable rows={closedIdeas} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
