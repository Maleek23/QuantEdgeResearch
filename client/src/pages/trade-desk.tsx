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
import { Calendar as CalendarIcon, Search, RefreshCw, ChevronDown, TrendingUp, X, Sparkles, TrendingUpIcon, UserPlus, BarChart3, LayoutGrid, List, Filter, SlidersHorizontal, CalendarClock, CheckCircle, XCircle, Clock, Info, Activity, Newspaper, Bot, AlertTriangle, FileText, Eye, ArrowUpDown } from "lucide-react";
import { format, startOfDay, isSameDay, parseISO, subHours, subDays, subMonths, subYears, isAfter, isBefore } from "date-fns";
import { isWeekend, getNextTradingWeekStart, cn } from "@/lib/utils";
import { RiskDisclosure } from "@/components/risk-disclosure";
import { WatchlistSpotlight } from "@/components/watchlist-spotlight";
import { getPerformanceGrade } from "@/lib/performance-grade";
import { AIResearchPanel } from "@/components/ai-research-panel";
import { UsageBadge } from "@/components/tier-gate";
import { useTier } from "@/hooks/useTier";
import { type TimeframeBucket, TIMEFRAME_LABELS, filterByTimeframe, getTimeframeCounts } from "@/lib/timeframes";
import { isRealLoss } from "@shared/constants";

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
  
  // Trade Type filter (Day vs Swing) - defaults to 'all' to show all trades
  // Users can manually select 'swing' if they want PDT-friendly filtering
  const [tradeTypeFilter, setTradeTypeFilter] = useState<'all' | 'day' | 'swing'>('all');
  
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
  }, [expiryFilter, assetTypeFilter, gradeFilter, statusFilter, sortBy, symbolSearch, dateRange, tradeIdeaSearch, activeDirection, activeSource, activeAssetType, activeGrade, sourceTab, statusView, activeTimeframe, tradeTypeFilter]);
  
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

  // Generate ideas for a specific timeframe/holding period
  const generateTimeframeIdeas = useMutation({
    mutationFn: async (targetTimeframe: TimeframeBucket) => {
      // Map timeframe bucket to holding period
      const holdingPeriodMap: Record<TimeframeBucket, string | undefined> = {
        'all': undefined,
        'today_tomorrow': 'day',
        'few_days': 'swing',
        'next_week': 'swing',
        'next_month': 'position',
      };
      const holdingPeriod = holdingPeriodMap[targetTimeframe];
      return await apiRequest('POST', '/api/quant/generate-ideas', { 
        targetHoldingPeriod: holdingPeriod 
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = TIMEFRAME_LABELS[activeTimeframe] || 'selected timeframe';
      toast({
        title: `${label} Research Generated`,
        description: `Generated ${data.count || data.newIdeas || 0} research briefs for ${label.toLowerCase()}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate ideas",
        variant: "destructive"
      });
    }
  });

  const generateQuantIdeas = useMutation({
    mutationFn: async (timeframe?: TimeframeBucket) => {
      return await apiRequest('POST', '/api/quant/generate-ideas', { 
        timeframe: timeframe || 'all',
        holdingPeriod: timeframe === 'today_tomorrow' ? 'day' : 
                       timeframe === 'few_days' ? 'swing' : 
                       timeframe === 'next_week' ? 'week-ending' : 
                       timeframe === 'next_month' ? 'position' : undefined
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : '';
      toast({
        title: "Quant Research Generated",
        description: `Generated ${data.count || data.newIdeas || 0} new quantitative research briefs${label ? ` for ${label}` : ''}`,
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
    mutationFn: async (timeframe?: TimeframeBucket) => {
      return await apiRequest('POST', '/api/ai/generate-ideas', {
        marketContext: "Current market conditions with focus on stocks, options, and crypto",
        timeframe: timeframe || 'all',
        holdingPeriod: timeframe === 'today_tomorrow' ? 'day' : 
                       timeframe === 'few_days' ? 'swing' : 
                       timeframe === 'next_week' ? 'week-ending' : 
                       timeframe === 'next_month' ? 'position' : undefined
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : '';
      toast({
        title: "AI Research Generated",
        description: `Generated ${data.count || 0} new AI-powered research briefs${label ? ` for ${label}` : ''}`,
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
    mutationFn: async (timeframe?: TimeframeBucket) => {
      return await apiRequest('POST', '/api/hybrid/generate-ideas', { 
        timeframe: timeframe || 'all',
        holdingPeriod: timeframe === 'today_tomorrow' ? 'day' : 
                       timeframe === 'few_days' ? 'swing' : 
                       timeframe === 'next_week' ? 'week-ending' : 
                       timeframe === 'next_month' ? 'position' : undefined
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : '';
      toast({
        title: "Hybrid Research Generated",
        description: `Generated ${data.count || 0} new hybrid (AI+Quant) research briefs${label ? ` for ${label}` : ''}`,
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
    mutationFn: async (timeframe?: TimeframeBucket) => {
      return await apiRequest('POST', '/api/news/generate-ideas', { 
        timeframe: timeframe || 'all',
        holdingPeriod: timeframe === 'today_tomorrow' ? 'day' : 
                       timeframe === 'few_days' ? 'swing' : 
                       timeframe === 'next_week' ? 'week-ending' : 
                       timeframe === 'next_month' ? 'position' : undefined
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const label = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : '';
      toast({
        title: "News Research Generated",
        description: `Generated ${data.count || 0} news-driven research briefs${label ? ` for ${label}` : ''}`,
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
    mutationFn: async (targetTimeframe?: TimeframeBucket) => {
      // Map timeframe bucket to holding period for flow scanner
      const holdingPeriodMap: Record<TimeframeBucket, string | undefined> = {
        'all': undefined,
        'today_tomorrow': 'day',
        'few_days': 'swing',
        'next_week': 'swing',
        'next_month': 'position',
      };
      const holdingPeriod = holdingPeriodMap[targetTimeframe || 'all'];
      return await apiRequest('POST', '/api/flow/generate-ideas', { holdingPeriod });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      const timeframeLabel = activeTimeframe !== 'all' ? TIMEFRAME_LABELS[activeTimeframe] : 'All';
      toast({
        title: "Flow Scanner Complete",
        description: data.message || `Scanned ${timeframeLabel} options, found ${data.count || 0} flow patterns`,
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

  // Filter ideas by search, direction, source, asset type, grade, date range, sourceTab, statusView, and trade type
  const filteredIdeas = tradeIdeas.filter(idea => {
    const matchesSearch = !tradeIdeaSearch || 
      idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase()) ||
      (idea.catalyst || '').toLowerCase().includes(tradeIdeaSearch.toLowerCase());
    
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
    
    // Trade Type filter: day trades vs swing trades (PDT-friendly)
    // 'day' = holdingPeriod 'day', 'swing' = 'swing', 'position', or 'week-ending'
    const matchesTradeType = tradeTypeFilter === 'all' || 
      (tradeTypeFilter === 'day' && idea.holdingPeriod === 'day') ||
      (tradeTypeFilter === 'swing' && ['swing', 'position', 'week-ending'].includes(idea.holdingPeriod));
    
    return matchesSearch && matchesDirection && matchesSource && matchesAssetType && matchesGrade && matchesDateRange && matchesSourceTab && matchesStatusView && matchesTradeType;
  });

  // Trade type counts - computed from ALL ideas (before trade type filter is applied)
  // This allows the toggle to show accurate counts even when filtered
  const tradeTypeCounts = useMemo(() => {
    // Count from ideas BEFORE trade type filter
    const baseFiltered = tradeIdeas.filter(idea => {
      const matchesSearch = !tradeIdeaSearch || 
        idea.symbol.toLowerCase().includes(tradeIdeaSearch.toLowerCase()) ||
        (idea.catalyst || '').toLowerCase().includes(tradeIdeaSearch.toLowerCase());
      const matchesSourceTab = sourceTab === "all" || idea.source === sourceTab;
      const ideaStatus = idea.status || 'published';
      const matchesStatusView = statusView === 'all' || ideaStatus === statusView;
      const status = (idea.outcomeStatus || '').trim().toLowerCase();
      const isActive = status === 'open' || status === '';
      return matchesSearch && matchesSourceTab && matchesStatusView && isActive;
    });
    
    return {
      all: baseFiltered.length,
      day: baseFiltered.filter(i => i.holdingPeriod === 'day').length,
      swing: baseFiltered.filter(i => ['swing', 'position', 'week-ending'].includes(i.holdingPeriod)).length,
    };
  }, [tradeIdeas, tradeIdeaSearch, sourceTab, statusView]);

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
        case 'price_asc':
          // Cheap to expensive (by entry price / premium)
          return (a.entryPrice || 0) - (b.entryPrice || 0);
        case 'price_desc':
          // Expensive to cheap (by entry price / premium)
          return (b.entryPrice || 0) - (a.entryPrice || 0);
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
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium tracking-wide uppercase mb-1">
            {format(new Date(), 'EEEE, MMM d')}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Research Desk</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Activity className="h-4 w-4" />
              <span className="font-medium text-foreground">{activeIdeas.length}</span> active
            </span>
            {newIdeasCount > 0 && (
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-cyan-500" />
                <span className="font-medium text-foreground">{newIdeasCount}</span> fresh
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] })}
            title="Refresh"
            data-testid="button-refresh-ideas"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <UsageBadge className="mr-1" data-testid="badge-usage-remaining" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                className="bg-cyan-500 text-slate-950 gap-2"
                size="default"
                disabled={!canGenerateTradeIdea()}
                data-testid="button-generate-ideas"
              >
                <Sparkles className="h-4 w-4" />
                Generate
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {/* Show selected timeframe at top if not 'all' */}
            {activeTimeframe !== 'all' && (
              <div className="px-2 py-1.5 text-xs text-cyan-400 border-b border-border/50 mb-1">
                Generating for: {TIMEFRAME_LABELS[activeTimeframe]}
              </div>
            )}
            
            {/* Recommended - Best for most users */}
            <DropdownMenuItem
              onClick={() => generateHybridIdeas.mutate(activeTimeframe)}
              disabled={generateHybridIdeas.isPending}
              data-testid="menu-generate-hybrid"
              className="font-medium"
            >
              <Sparkles className="h-4 w-4 mr-2 text-cyan-400" />
              Smart Picks
              <span className="ml-auto bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">Best</span>
            </DropdownMenuItem>
            
            <DropdownMenuSeparator />
            
            {/* Individual Engines */}
            <div className="px-2 py-1.5 text-xs text-muted-foreground">By Strategy</div>
            <DropdownMenuItem
              onClick={() => generateQuantIdeas.mutate(activeTimeframe)}
              disabled={generateQuantIdeas.isPending}
              data-testid="menu-generate-quant"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Quant Signals
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => generateAIIdeas.mutate(activeTimeframe)}
              disabled={generateAIIdeas.isPending}
              data-testid="menu-generate-ai"
            >
              <Bot className="h-4 w-4 mr-2" />
              AI Analysis
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => generateNewsIdeas.mutate(activeTimeframe)}
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
              onClick={() => generateFlowIdeas.mutate(activeTimeframe)}
              disabled={generateFlowIdeas.isPending}
              data-testid="menu-generate-flow"
            >
              <Activity className="h-4 w-4 mr-2" />
              Flow Scanner {activeTimeframe !== 'all' && `(${TIMEFRAME_LABELS[activeTimeframe]})`}
              <span className="ml-auto text-[10px] text-muted-foreground">+ Lotto</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* AI Research Assistant - Claude-powered Q&A */}
      <AIResearchPanel />

      {/* Engine/Source Tabs with Gradient Icons */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Engine</p>
        <div className="flex flex-wrap items-center gap-2">
          {([
            { value: 'all', label: 'All', icon: Activity, gradient: 'from-slate-500 to-slate-600' },
            { value: 'ai', label: 'AI', icon: Bot, gradient: 'from-purple-500 to-purple-600' },
            { value: 'quant', label: 'Quant', icon: BarChart3, gradient: 'from-blue-500 to-blue-600' },
            { value: 'flow', label: 'Flow', icon: Activity, gradient: 'from-cyan-500 to-cyan-600' },
            { value: 'chart_analysis', label: 'Chart', icon: Eye, gradient: 'from-amber-500 to-amber-600' },
            { value: 'hybrid', label: 'Hybrid', icon: Sparkles, gradient: 'from-orange-500 to-orange-600' },
            { value: 'news', label: 'News', icon: Newspaper, gradient: 'from-yellow-500 to-yellow-600' },
            { value: 'manual', label: 'Manual', icon: FileText, gradient: 'from-gray-500 to-gray-600' },
          ] as const).map(({ value, label, icon: Icon, gradient }) => (
            <Button
              key={value}
              variant={sourceTab === value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSourceTab(value as IdeaSource | "all")}
              className={cn(
                "gap-2 hover-elevate",
                sourceTab === value 
                  ? "bg-background border border-border shadow-sm"
                  : "text-muted-foreground"
              )}
              data-testid={`tab-source-${value}`}
            >
              <div className={cn(
                "h-5 w-5 rounded flex items-center justify-center bg-gradient-to-br",
                gradient
              )}>
                <Icon className="h-3 w-3 text-white" />
              </div>
              {label}
              <span className="ml-0.5 text-[10px] font-mono opacity-70">
                {sourceCounts[value] || 0}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Trade Type + Timeframe Filter Bar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Trade Type Toggle - Day vs Swing (PDT-friendly default) */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Trade Type</span>
          <div className="flex items-center gap-1 border border-border/50 rounded-lg p-1">
            {([
              { value: 'swing', label: 'Swing', tooltip: '1-5 day holds (PDT-friendly)' },
              { value: 'day', label: 'Day', tooltip: 'Same-day trades' },
              { value: 'all', label: 'All', tooltip: 'Show all trades' },
            ] as const).map(({ value, label, tooltip }) => (
              <Button
                key={value}
                variant={tradeTypeFilter === value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTradeTypeFilter(value)}
                className={cn(
                  "gap-1.5 whitespace-nowrap hover-elevate",
                  tradeTypeFilter === value 
                    ? value === 'swing' 
                      ? "bg-cyan-500/10 text-cyan-500"
                      : "bg-amber-500/10 text-amber-500"
                    : "text-muted-foreground"
                )}
                title={tooltip}
                data-testid={`tab-tradetype-${value}`}
              >
                {label}
                <span className="ml-0.5 text-[10px] font-mono opacity-70">
                  {tradeTypeCounts[value]}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {/* Timeframe Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Horizon</span>
        <div className="flex items-center gap-1 border border-border/50 rounded-lg p-1">
          {(['all', 'today_tomorrow', 'few_days', 'next_week', 'next_month'] as TimeframeBucket[]).map((timeframe) => (
            <Button
              key={timeframe}
              variant={activeTimeframe === timeframe ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTimeframe(timeframe)}
              className={cn(
                "gap-1.5 whitespace-nowrap hover-elevate",
                activeTimeframe === timeframe 
                  ? "bg-cyan-500/10 text-cyan-500" 
                  : "text-muted-foreground"
              )}
              data-testid={`tab-timeframe-${timeframe}`}
            >
              {TIMEFRAME_LABELS[timeframe]}
              <span className="ml-0.5 text-[10px] font-mono opacity-70">
                {timeframeCounts[timeframe]}
              </span>
            </Button>
          ))}
        </div>
        
        {activeTimeframe !== 'all' && canGenerateTradeIdea() && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateTimeframeIdeas.mutate(activeTimeframe)}
            disabled={generateTimeframeIdeas.isPending}
            className="gap-1.5 whitespace-nowrap"
            data-testid="button-generate-timeframe"
          >
            {generateTimeframeIdeas.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Generate
          </Button>
        )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filters</p>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
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
            <SelectTrigger className="w-[120px] hover-elevate" data-testid="filter-status">
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
              className="hover-elevate"
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Weekend Notice */}
      {isWeekend() && (
        <div className="glass-card flex items-center gap-3 p-4 rounded-lg border-l-2 border-l-amber-500" data-testid="weekend-preview-section">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
            <Clock className="h-4 w-4 text-white" />
          </div>
          <p className="text-sm text-muted-foreground">
            Markets open <span className="text-foreground font-medium">{format(getNextTradingWeekStart(), 'EEEE, MMM d')}</span> at 9:30 AM CT
          </p>
        </div>
      )}

      {/* Watchlist Spotlight - "Watch Out For These" */}
      <WatchlistSpotlight maxItems={5} />

      {/* All Research Briefs */}
      <div className="space-y-8">
        {/* Loading State */}
        {ideasLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" data-testid={`skeleton-idea-${i}`} />
            ))}
          </div>
        ) : filteredAndSortedIdeas.length === 0 ? (
          /* Enhanced Empty State - Glassmorphism */
          <div className="glass-card rounded-xl border-dashed border-2 border-white/10">
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center mb-6">
                <BarChart3 className="h-10 w-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-2">No Research Briefs Found</h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {tradeIdeas.length === 0 
                  ? "Start generating research briefs using the buttons in the toolbar above. Each engine uses different strategies to identify patterns."
                  : statusFilter === 'active'
                    ? "No active research briefs match your filters. Try showing all statuses or adjusting other filters."
                    : "No briefs match your current filters. Try adjusting the filters above or generate new analysis."}
              </p>
              {statusFilter !== 'all' && tradeIdeas.length > 0 && (
                <Button
                  variant="glass"
                  onClick={() => setStatusFilter('all')}
                  className="mb-4"
                  data-testid="button-show-all-statuses"
                >
                  Show All Statuses
                </Button>
              )}
              <p className="text-sm text-muted-foreground text-center">
                {statusFilter === 'active' && "Tip: By default, only ACTIVE briefs are shown to reduce clutter"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* SECTION 1: Active Research - Glassmorphism */}
            <div className="space-y-4">
              <div className="glass-card rounded-xl p-4 flex items-center justify-between gap-4 border-l-2 border-l-cyan-500">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active Research</p>
                    <span className="text-lg font-semibold">{activeIdeas.length} open patterns</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Sort By Dropdown */}
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-[140px] h-8 glass-secondary border-white/10 hover-elevate" data-testid="select-sort-by">
                      <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="price_asc">Cheapest First</SelectItem>
                      <SelectItem value="price_desc">Expensive First</SelectItem>
                      <SelectItem value="confidence">Confidence</SelectItem>
                      <SelectItem value="rr">Risk/Reward</SelectItem>
                      <SelectItem value="expiry">Expiry Date</SelectItem>
                      <SelectItem value="timestamp">Newest</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* View Mode Toggle */}
                  <div className="flex items-center glass-secondary rounded-md p-0.5">
                    <Button
                      variant={viewMode === "list" ? "glass" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className="h-7 px-2 hover-elevate"
                      data-testid="button-view-list"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "grid" ? "glass" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className="h-7 px-2 hover-elevate"
                      data-testid="button-view-grid"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                  </div>
                  {expandedIdeaId && (
                    <Button
                      variant="glass-secondary"
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
                <div className="glass-card rounded-xl border-dashed border-2 border-white/10">
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="h-14 w-14 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center mb-3">
                      <Activity className="h-7 w-7 text-white" />
                    </div>
                    <p className="text-muted-foreground text-sm">No active research briefs match your filters</p>
                  </div>
                </div>
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
                        <AccordionItem key={assetType} value={assetType} className="glass-card rounded-xl border-white/10">
                          <AccordionTrigger className="px-4 hover:no-underline" data-testid={`accordion-asset-${assetType}`}>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-semibold">{label}</span>
                              <span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs" data-testid={`badge-count-${assetType}`}>
                                {ideas.length} idea{ideas.length !== 1 ? 's' : ''}
                              </span>
                              {stats.avgRR > 0 && (
                                <span className="bg-white/10 text-cyan-400 rounded px-2 py-0.5 text-xs font-mono">
                                  {stats.avgRR.toFixed(1)}x R:R
                                </span>
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

              {/* Load More Button for Active Briefs */}
              {activeIdeas.length > 0 && visibleCount < activeIdeas.length && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="glass-secondary"
                    size="lg"
                    onClick={() => setVisibleCount(prev => prev + 50)}
                    className="gap-2"
                    data-testid="button-load-more"
                  >
                    Load More Active
                    <span className="ml-1 bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">
                      {Math.min(50, activeIdeas.length - visibleCount)} more
                    </span>
                  </Button>
                </div>
              )}
            </div>

            {/* SECTION 2: Closed Patterns Summary - Glassmorphism */}
            {closedIdeas.length > 0 && (
              <div className="glass-card rounded-xl p-4 mt-4 border-l-2 border-l-blue-500">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent Performance</p>
                    </div>
                    <span className="bg-green-500/20 text-green-400 rounded px-2 py-0.5 text-xs border border-green-500/30">
                      {closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target').length} wins
                    </span>
                    <span className="bg-red-500/20 text-red-400 rounded px-2 py-0.5 text-xs border border-red-500/30">
                      {closedIdeas.filter(i => isRealLoss(i)).length} losses
                    </span>
                    <span className="text-xs text-muted-foreground">({closedIdeas.filter(i => normalizeStatus(i.outcomeStatus) === 'hit_target' || isRealLoss(i)).length} decided)</span>
                  </div>
                  <Button variant="glass" size="sm" asChild className="gap-1.5 hover-elevate" data-testid="link-view-performance">
                    <a href="/performance">
                      <BarChart3 className="h-4 w-4" />
                      View Performance
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
