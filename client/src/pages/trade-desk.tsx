import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TradeIdeaBlock } from "@/components/trade-idea-block";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { TradeIdea, IdeaSource, MarketData, Catalyst } from "@shared/schema";
import { Calendar as CalendarIcon, Search, RefreshCw, ChevronDown, TrendingUp, X, Sparkles, TrendingUpIcon, UserPlus, BarChart3, LayoutGrid, List, Filter, SlidersHorizontal, CalendarClock, CheckCircle, XCircle, Clock, Info, Activity, Newspaper, Bot, AlertTriangle, FileText, Eye } from "lucide-react";
import { format, startOfDay, isSameDay, parseISO, subHours, subDays, subMonths, subYears, isAfter, isBefore } from "date-fns";
import { isWeekend, getNextTradingWeekStart, cn } from "@/lib/utils";
import { RiskDisclosure } from "@/components/risk-disclosure";
import { WatchlistSpotlight } from "@/components/watchlist-spotlight";
import { getPerformanceGrade } from "@/lib/performance-grade";
import { UsageBadge } from "@/components/tier-gate";
import { useTier } from "@/hooks/useTier";
import { type TimeframeBucket, TIMEFRAME_LABELS, filterByTimeframe, getTimeframeCounts } from "@/lib/timeframes";

export default function TradeDeskPage() {
  const { canGenerateTradeIdea } = useTier();
  const [tradeIdeaSearch, setTradeIdeaSearch] = useState("");
  const [activeDirection, setActiveDirection] = useState<"long" | "short" | "day_trade" | "all">("all");
  const [activeSource, setActiveSource] = useState<IdeaSource | "all">("all");
  const [activeAssetType, setActiveAssetType] = useState<"stock" | "penny_stock" | "option" | "crypto" | "all">("all");
  const [activeGrade, setActiveGrade] = useState<"all" | "A" | "B" | "C">("all");
  const [dateRange, setDateRange] = useState<string>('all');
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  // NEW: Source tabs and status view state
  const [sourceTab, setSourceTab] = useState<IdeaSource | "all">("all");
  const [statusView, setStatusView] = useState<'all' | 'published' | 'draft'>('published');
  
  // Timeframe tabs for temporal filtering
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeBucket>('all');
  
  // Filter state for new filter toolbar
  const [expiryFilter, setExpiryFilter] = useState<string>('all');
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('priority');
  const [symbolSearch, setSymbolSearch] = useState<string>('');
  
  // Pagination state
  const [visibleCount, setVisibleCount] = useState(50);
  
  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [expiryFilter, assetTypeFilter, gradeFilter, statusFilter, sortBy, symbolSearch, dateRange, tradeIdeaSearch, activeDirection, activeSource, activeAssetType, activeGrade, sourceTab, statusView, activeTimeframe]);
  
  const { toast } = useToast();

  const { data: tradeIdeas = [], isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
    refetchInterval: 60000, // 60s for trading data (prices included in response)
    staleTime: 30000, // Fresh for 30s - reduces duplicate fetches
  });

  const { data: marketData = [] } = useQuery<MarketData[]>({
    queryKey: ['/api/market-data'],
    refetchInterval: 60000, // 60s for market data
    staleTime: 30000,
  });

  const { data: catalysts = [] } = useQuery<Catalyst[]>({
    queryKey: ['/api/catalysts'],
    refetchInterval: 3600000,
    staleTime: 3600000, // 1 hour stale time for catalysts (slow-changing data)
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

  // Memoized count helpers for source tabs and status
  const sourceCounts = useMemo(() => {
    // First filter by statusView
    const statusFiltered = tradeIdeas.filter(idea => {
      const ideaStatus = idea.status || 'published';
      if (statusView === 'all') return true;
      return ideaStatus === statusView;
    });
    
    const counts: Record<string, number> = {
      all: statusFiltered.length,
      ai: 0,
      quant: 0,
      hybrid: 0,
      chart_analysis: 0,
      flow: 0,
      news: 0,
      manual: 0,
    };
    
    statusFiltered.forEach(idea => {
      const source = idea.source || 'quant';
      if (counts[source] !== undefined) {
        counts[source]++;
      }
    });
    
    return counts;
  }, [tradeIdeas, statusView]);

  const statusCounts = useMemo(() => {
    const counts = {
      all: tradeIdeas.length,
      published: 0,
      draft: 0,
    };
    
    tradeIdeas.forEach(idea => {
      // Treat missing status field as 'published' for backward compatibility
      const status = idea.status || 'published';
      if (status === 'published') {
        counts.published++;
      } else if (status === 'draft') {
        counts.draft++;
      }
    });
    
    return counts;
  }, [tradeIdeas]);

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

  // Filter ideas by search, direction, source, asset type, grade, date range, sourceTab, and statusView
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
    
    // NEW: Filter by source tab
    const matchesSourceTab = sourceTab === "all" || idea.source === sourceTab;
    
    // NEW: Filter by status view (treat missing status as 'published' for backward compatibility)
    const ideaStatus = idea.status || 'published';
    const matchesStatusView = statusView === 'all' || ideaStatus === statusView;
    
    return matchesSearch && matchesDirection && matchesSource && matchesAssetType && matchesGrade && matchesDateRange && matchesSourceTab && matchesStatusView;
  });

  // Timeframe counts - computed from ACTIVE ideas only (outcomeStatus === 'open')
  // This ensures tabs show actionable plays, not old historical data
  const timeframeCounts = useMemo(() => {
    const activeOnly = filteredIdeas.filter(idea => {
      const status = (idea.outcomeStatus || '').trim().toLowerCase();
      return status === 'open' || status === '';
    });
    return getTimeframeCounts(activeOnly);
  }, [filteredIdeas]);

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

  // Apply timeframe filtering - only to active trades when a specific timeframe is selected
  const timeframeFilteredIdeas = useMemo(() => {
    if (activeTimeframe === 'all') {
      return filteredIdeas;
    }
    // When filtering by timeframe, only include active (open) trades
    const activeOnly = filteredIdeas.filter(idea => {
      const status = normalizeStatus(idea.outcomeStatus);
      return status === 'open' || status === '';
    });
    return filterByTimeframe(activeOnly, activeTimeframe);
  }, [filteredIdeas, activeTimeframe]);
  
  const filteredAndSortedIdeas = filterAndSortIdeas(timeframeFilteredIdeas);

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
    <div className="container mx-auto p-6 space-y-4">
      {/* Clean Minimal Header */}
      <div className="flex items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Trade Desk</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), 'EEEE, MMM d')} · {activeIdeas.length} active ideas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] })}
            title="Refresh trade ideas"
            data-testid="button-refresh-ideas"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <UsageBadge className="mr-1" data-testid="badge-usage-remaining" />
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="default"
              size="default"
              className="gap-2"
              disabled={!canGenerateTradeIdea()}
              data-testid="button-generate-ideas"
            >
              <Sparkles className="h-4 w-4" />
              Generate
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {/* Recommended - Best for most users */}
            <DropdownMenuItem
              onClick={() => generateHybridIdeas.mutate()}
              disabled={generateHybridIdeas.isPending}
              data-testid="menu-generate-hybrid"
              className="font-medium"
            >
              <Sparkles className="h-4 w-4 mr-2 text-primary" />
              Smart Picks
              <Badge variant="secondary" className="ml-auto text-[10px] px-1.5">Best</Badge>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            {/* Individual Engines */}
            <div className="px-2 py-1.5 text-xs text-muted-foreground">By Strategy</div>
            <DropdownMenuItem
              onClick={() => generateQuantIdeas.mutate()}
              disabled={generateQuantIdeas.isPending}
              data-testid="menu-generate-quant"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Quant Signals
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => generateAIIdeas.mutate()}
              disabled={generateAIIdeas.isPending}
              data-testid="menu-generate-ai"
            >
              <Bot className="h-4 w-4 mr-2" />
              AI Analysis
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => generateNewsIdeas.mutate()}
              disabled={generateNewsIdeas.isPending}
              data-testid="menu-generate-news"
            >
              <Newspaper className="h-4 w-4 mr-2" />
              Breaking News
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            {/* Options Focused */}
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Options</div>
            <DropdownMenuItem
              onClick={() => generateFlowIdeas.mutate()}
              disabled={generateFlowIdeas.isPending}
              data-testid="menu-generate-flow"
            >
              <Activity className="h-4 w-4 mr-2" />
              Flow Scanner
              <span className="ml-auto text-[10px] text-muted-foreground">+ Lotto</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {/* Timeframe Tabs - Organize plays by trading horizon */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {(['all', 'today_tomorrow', 'few_days', 'next_week', 'next_month'] as TimeframeBucket[]).map((timeframe) => (
          <Button
            key={timeframe}
            variant={activeTimeframe === timeframe ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTimeframe(timeframe)}
            className={cn(
              "gap-1.5 whitespace-nowrap",
              activeTimeframe === timeframe && "shadow-sm"
            )}
            data-testid={`tab-timeframe-${timeframe}`}
          >
            {timeframe === 'today_tomorrow' && <CalendarClock className="h-3.5 w-3.5" />}
            {TIMEFRAME_LABELS[timeframe]}
            <Badge 
              variant={activeTimeframe === timeframe ? "secondary" : "outline"} 
              className="ml-0.5 px-1.5 py-0 text-[10px] font-medium"
            >
              {timeframeCounts[timeframe]}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Simple Search + Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search symbols..."
            value={symbolSearch}
            onChange={(e) => setSymbolSearch(e.target.value.toUpperCase())}
            className="pl-10"
            data-testid="filter-symbol-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]" data-testid="filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="won">Winners</SelectItem>
            <SelectItem value="lost">Losers</SelectItem>
          </SelectContent>
        </Select>
        {(symbolSearch || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSymbolSearch('');
              setStatusFilter('all');
            }}
            data-testid="button-clear-filters"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Weekend Notice - Only when relevant */}
      {isWeekend() && (
        <Alert className="border-muted" data-testid="weekend-preview-section">
          <Clock className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Markets open {format(getNextTradingWeekStart(), 'EEEE, MMM d')} at 9:30 AM CT
          </AlertDescription>
        </Alert>
      )}

      {/* Watchlist Spotlight - "Watch Out For These" */}
      <WatchlistSpotlight maxItems={5} />

      {/* All Trade Ideas */}
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
                <div className="flex items-center gap-2">
                  {/* View Mode Toggle */}
                  <div className="flex items-center border rounded-md p-0.5">
                    <Button
                      variant={viewMode === "list" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className="h-7 px-2"
                      data-testid="button-view-list"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "grid" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className="h-7 px-2"
                      data-testid="button-view-grid"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
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
                      Collapse
                    </Button>
                  )}
                </div>
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
                          <AccordionContent className={`px-4 pb-4 ${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-3'}`}>
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

            {/* SECTION 2: Closed Trades Summary (simplified - full analysis on Performance page) */}
            {closedIdeas.length > 0 && (
              <Card className="mt-4">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Recent Performance:</span>
                      <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30">
                        {closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target').length} wins
                      </Badge>
                      <Badge variant="destructive" className="bg-red-500/20 text-red-500 border-red-500/30">
                        {closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_stop').length} losses
                      </Badge>
                      <span className="text-xs text-muted-foreground">({closedIdeas.length} closed)</span>
                    </div>
                    <Button variant="outline" size="sm" asChild className="gap-1.5" data-testid="link-view-performance">
                      <a href="/performance">
                        <BarChart3 className="h-4 w-4" />
                        View Performance
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
