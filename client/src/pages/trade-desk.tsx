import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMarketPoll, POLL } from "@/hooks/use-market-poll";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { componentStyles } from "@/lib/design-tokens";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { displayedScore, displayedScoreBarPct, isHighConviction, displayedGrade, gradeColorClass } from "@/lib/conviction-display";
import { BarChart3, DollarSign, Zap, Activity, Star, AlertTriangle, Brain, Sparkles, Bitcoin, Flame, RefreshCw, Gem, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { TradeIdea } from "@shared/schema";
import { TradeIdeaDetailV2 } from "@/components/trade-idea-detail-v2";
import { TradeIdeasPanel } from "@/components/trade-desk/trade-ideas-panel";
import { FlowImport } from "@/components/trade-desk/flow-import";
import PreMarketGappersCard from "@/components/trade-desk/PreMarketGappersCard";
import { DiscoveryPicksPanel } from "@/components/trade-desk/DiscoveryPicksPanel";
import { GexBigGainers } from "@/components/gex-big-gainers";

type TradingSession = 'pre-market' | 'market-hours' | 'after-hours' | 'weekend' | 'closed';

function detectSession(): { session: TradingSession; label: string; color: string } {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();

  if (day === 0 || day === 6) return { session: 'weekend', label: 'WEEKEND', color: componentStyles.badge.default };
  if (mins >= 240 && mins < 570) return { session: 'pre-market', label: 'PRE-MARKET', color: componentStyles.badge.warning };
  if (mins >= 570 && mins < 960) return { session: 'market-hours', label: 'MARKET OPEN', color: componentStyles.badge.success };
  if (mins >= 960 && mins < 1200) return { session: 'after-hours', label: 'AFTER HOURS', color: componentStyles.badge.warning };
  return { session: 'closed', label: 'CLOSED', color: componentStyles.badge.default };
}

/** Get a session badge for a trade idea's timestamp */
function MarketPulseHeader() {
  const priceInterval = useMarketPoll(POLL.PRICES.open, POLL.PRICES.closed);
  const { data: realtimeData } = useQuery({
    queryKey: ['/api/realtime-status'],
    queryFn: async () => {
      const res = await fetch('/api/realtime-status');
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: priceInterval,
    staleTime: 8_000,
  });

  const tickers = [
    { symbol: 'NQ', label: 'Nasdaq', price: realtimeData?.prices?.futures?.NQ?.price },
    { symbol: 'ES', label: 'S&P 500', price: realtimeData?.prices?.futures?.ES?.price },
    { symbol: 'GC', label: 'Gold', price: realtimeData?.prices?.futures?.GC?.price, prefix: '$' },
    { symbol: 'BTC', label: 'Bitcoin', price: realtimeData?.prices?.crypto?.BTC?.price, prefix: '$' },
    { symbol: 'ETH', label: 'Ethereum', price: realtimeData?.prices?.crypto?.ETH?.price, prefix: '$' },
  ];

  return (
    <div className="flex items-center gap-6 px-4 py-2.5 bg-[var(--surface-base)] border-b border-border/50 overflow-x-auto no-scrollbar">
      {(() => {
        const { label, session } = detectSession();
        const isOpen = session === 'market-hours';
        const color = isOpen ? 'text-[var(--trade-bullish)]' : 'text-muted-foreground';
        const dotColor = isOpen ? 'bg-[var(--trade-bullish)]' : 'bg-muted-foreground';
        return (
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            <span className={`text-[10px] font-medium ${color}`}>{label}</span>
          </div>
        );
      })()}
      {tickers.map((t) => (
        <div key={t.symbol} className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground/70 font-mono">{t.symbol}</span>
          <span className="text-xs font-mono text-foreground">
            {t.price ? `${t.prefix || ''}${t.price.toLocaleString()}` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================
// TOP CONVICTION SECTION - A/A+ Plays Only
// ============================================
function HotSymbolsCompact() {
  const { data } = useQuery({
    queryKey: ['/api/convergence/hot-symbols'],
    queryFn: async () => {
      const res = await fetch('/api/convergence/hot-symbols?limit=6');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    retry: 1,
  });

  const symbols = (data?.symbols || []).slice(0, 6);

  if (!symbols.length) {
    return <p className="text-[11px] text-muted-foreground text-center py-2">Scanning for unusual activity...</p>;
  }

  return (
    <div className="space-y-1">
      {symbols.map((sym: any, i: number) => (
        <Link key={i} href={`/terminal/${sym.symbol}`}>
          <div className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50 cursor-pointer transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-muted-foreground/60 font-mono w-3">{i + 1}</span>
              <span className="font-mono font-semibold text-xs text-foreground truncate">{sym.symbol}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground font-mono">{sym.sources || sym.scannerCount || 1}src</span>
              <span className="text-[10px] font-mono font-bold text-orange-400">{sym.heat?.toFixed(1) || sym.score?.toFixed(1) || '—'}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function TradeDeskRedesigned() {
  const { toast } = useToast();
  const [location] = useLocation();

  const [generatingEngine, setGeneratingEngine] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<'all' | 'stock' | 'option' | 'crypto' | 'future' | 'penny_stock' | 'watchlist' | 'tv'>('all');
  // Trade idea detail modal state
  const [selectedTradeIdea, setSelectedTradeIdea] = useState<TradeIdea | null>(null);
  const [tradeIdeaModalOpen, setTradeIdeaModalOpen] = useState(false);
  // Side panel state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Note: Filters (statusFilter, dateFilter, gradeFilter, directionFilter) are handled inside TradeIdeasList component

  // Idea generation mutation - triggers the scoring engine
  const generateIdeas = useMutation({
    mutationFn: async (engine: 'ai' | 'quant' | 'hybrid' | 'flow' | 'gex' | 'all') => {
      setGeneratingEngine(engine);
      const endpoints: Record<string, string> = {
        ai: '/api/ai/generate-ideas',
        quant: '/api/quant/generate-ideas',
        hybrid: '/api/hybrid/generate-ideas',
        flow: '/api/flow/generate-ideas',
        gex: '/api/gex-scanner/run',
        all: '/api/ideas/generate-now',
      };
      const res = await fetch(endpoints[engine], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ count: 5 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Generation failed');
      }
      return res.json();
    },
    onSuccess: (data, engine) => {
      setGeneratingEngine(null);
      const count = data.ideas?.length || data.savedCount || data.ideasGenerated || 0;
      toast({
        title: `${engine.toUpperCase()} Engine Complete`,
        description: `Generated ${count} new trade ideas`,
      });
      // Invalidate cache to show new ideas
      setTimeout(() => window.location.reload(), 1500);
    },
    onError: (error: Error) => {
      setGeneratingEngine(null);
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // DATE FILTER STATE: Controls which ideas are fetched/displayed
  // On weekends/holidays, default to "week" so Friday's ideas are visible
  // On weekdays, default to "today" for fresh daily ideas
  const isWeekend = (() => {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    const hour = et.getHours();
    // Sat, Sun, or Monday before 4am ET (no new ideas until pre-market)
    return day === 0 || day === 6 || (day === 1 && hour < 4);
  })();
  const [serverDateFilter, setServerDateFilter] = useState<'today' | 'week' | 'all'>(isWeekend ? 'week' : 'today');

  // Cache buster: Use today's date in ET timezone as cache key to force fresh data each day
  // Using ET timezone ensures cache key matches server-side date filtering
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayDateKey = `${nowET.getFullYear()}-${String(nowET.getMonth() + 1).padStart(2, '0')}-${String(nowET.getDate()).padStart(2, '0')}`;

  // Fetch trade ideas with server-side date filtering for performance
  // Only fetch the date range we need instead of loading everything
  const { data: tradeIdeas = [], isLoading, error, refetch: refetchIdeas } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas/best-setups', serverDateFilter, todayDateKey],
    queryFn: async () => {
      // Fetch with date filter applied server-side.
      // status=all gets both open and closed for historical analysis.
      // No cache-busting param — best-setups now lives behind a 60s
      // server-side convictions cache, so the previous &_t=Date.now() was
      // forcing the server to recompute on every poll. The query key already
      // segments by date filter, so React Query handles client-side caching.
      const dateParam = serverDateFilter !== 'all' ? `&date=${serverDateFilter}` : '';
      const res = await fetch(`/api/trade-ideas/best-setups?period=daily&limit=500&status=all&watchlistOnly=true${dateParam}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.setups || [];
    },
    // The server convictions cache TTL is 60s. Match it client-side so we
    // don't pay request cost between cache refreshes; one full refresh per
    // minute keeps the desk feeling live without hammering the API.
    staleTime: 30_000,        // Reuse cached data within 30s
    gcTime: 5 * 60 * 1000,    // Keep in memory for 5 minutes after unmount
    refetchInterval: 60_000,  // Refetch once per minute (matches server cache TTL)
  });

  // Fetch user's watchlist for "Watchlist" filter
  const { data: watchlistData } = useQuery<any[]>({
    queryKey: ['/api/watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
  const watchlistSymbols = useMemo(() => {
    if (!watchlistData) return new Set<string>();
    return new Set(watchlistData.map((w: any) => (w.symbol || '').toUpperCase()));
  }, [watchlistData]);

  // EMPTY STATE HANDLER: If "today" shows 0 ideas, offer to expand range
  const hasTodayIdeas = tradeIdeas.length > 0;
  const showEmptyTodayMessage = serverDateFilter === 'today' && !isLoading && !hasTodayIdeas;

  // ============================================
  // DEDUPLICATION ONLY - No filtering here!
  // TradeIdeasList handles ALL filtering (status, date, grade, direction)
  // Groups by symbol+assetType+optionType to show BOTH calls AND puts per symbol
  // ============================================
  const deduplicateOnly = (ideas: TradeIdea[]): TradeIdea[] => {
    // STRICT TODAY FILTER: If server filter is 'today', enforce it client-side too
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayStrET = `${nowET.getFullYear()}-${String(nowET.getMonth() + 1).padStart(2, '0')}-${String(nowET.getDate()).padStart(2, '0')}`;

    const nonExpired = ideas.filter(idea => {
      if (!idea.timestamp) return false;
      // If viewing 'today', strictly filter to today's date only
      if (serverDateFilter === 'today') {
        const ideaDateET = new Date(idea.timestamp).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return ideaDateET === todayStrET;
      }
      return true;
    });

    // Group by symbol+assetType+optionType - allows both CALLs and PUTs per symbol
    const groups = new Map<string, TradeIdea[]>();
    for (const idea of nonExpired) {
      const assetType = idea.assetType || 'stock';
      const optionType = idea.optionType || '';
      const key = `${idea.symbol}:${assetType}:${optionType}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(idea);
    }

    // For each group, take best idea (highest confidence, most recent)
    const result: TradeIdea[] = [];
    Array.from(groups.values()).forEach((groupIdeas) => {
      groupIdeas.sort((a: TradeIdea, b: TradeIdea) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        if (Math.abs(timeB - timeA) > 6 * 60 * 60 * 1000) {
          return timeB - timeA;
        }
        return (b.confidenceScore || 0) - (a.confidenceScore || 0);
      });
      result.push(groupIdeas[0]);
    });

    result.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

    return result;
  };

  // Filter helpers for tabs - with deduplication only (no filtering here)
  // TradeIdeasList handles all user-facing filters
  const stockIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i =>
      i.assetType === 'stock' || (!i.assetType && !i.optionType)
    );
    return deduplicateOnly(filtered);
  }, [tradeIdeas]);

  const optionIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i => i.assetType === 'option' || i.optionType);
    return deduplicateOnly(filtered);
  }, [tradeIdeas]);

  const cryptoIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i => i.assetType === 'crypto');
    return deduplicateOnly(filtered);
  }, [tradeIdeas]);

  const futuresIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i => i.assetType === 'future');
    return deduplicateOnly(filtered);
  }, [tradeIdeas]);

  const pennyIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i => i.assetType === 'penny_stock');
    return deduplicateOnly(filtered);
  }, [tradeIdeas]);

  // Watchlist-only ideas - only show ideas for tickers in user's watchlist
  const watchlistIdeas = useMemo(() => {
    if (watchlistSymbols.size === 0) return [];
    const filtered = tradeIdeas.filter(i => watchlistSymbols.has((i.symbol || '').toUpperCase()));
    return deduplicateOnly(filtered);
  }, [tradeIdeas, watchlistSymbols]);

  // TradingView signal ideas only
  const tvIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i => (i as any).source === 'tradingview');
    return deduplicateOnly(filtered);
  }, [tradeIdeas]);

  // All ideas - deduplicated (for "All Ideas" tab)
  const allIdeasDeduplicated = useMemo(() => {
    return deduplicateOnly(tradeIdeas);
  }, [tradeIdeas]);

  // Filtered ideas based on asset type selector
  const filteredIdeas = useMemo(() => {
    switch (assetFilter) {
      case 'stock': return stockIdeas;
      case 'option': return optionIdeas;
      case 'crypto': return cryptoIdeas;
      case 'future': return futuresIdeas;
      case 'penny_stock': return pennyIdeas;
      case 'watchlist': return watchlistIdeas;
      case 'tv': return tvIdeas;
      default: return allIdeasDeduplicated;
    }
  }, [assetFilter, stockIdeas, optionIdeas, cryptoIdeas, futuresIdeas, pennyIdeas, watchlistIdeas, tvIdeas, allIdeasDeduplicated]);

  // ============================================
  // INITIAL LOADING ANIMATION (minimum 0.5s)
  // ============================================
  const [showInitialLoader, setShowInitialLoader] = useState(true);

  // Brief branded entry animation — but NEVER block the page on slow data.
  // After this short window the desk renders and each panel shows its own
  // loading state (best-setups can take 14–33s; we don't make the page wait).
  useEffect(() => {
    const t = setTimeout(() => setShowInitialLoader(false), 600);
    return () => clearTimeout(t);
  }, []);

  // Full-page skeleton only on the very first paint while data is still cold.
  // On revisits the data is cached (isLoading false) → instant render.
  if (showInitialLoader && isLoading) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)]">
        <div className="flex items-center gap-6 px-4 py-2.5 bg-[var(--surface-base)] border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--trade-bullish)] animate-pulse" />
            <span className="text-[10px] font-medium text-[var(--trade-bullish)]">LOADING</span>
          </div>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 w-8 bg-muted rounded animate-pulse" />
              <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-5 w-24 bg-muted rounded animate-pulse" />
              <div className="h-3 w-20 bg-muted/50 rounded animate-pulse" />
            </div>
            <div className="h-8 w-[140px] bg-muted rounded animate-pulse" />
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-7 w-16 bg-muted/50 rounded-md animate-pulse" />
            ))}
          </div>
          <div className="h-10 bg-muted/30 rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-40 bg-card border border-border/50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-[var(--trade-bearish)] mx-auto" />
          <p className="text-[var(--trade-bearish)]">Failed to load trade ideas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background page-atmosphere">
      {/* Market Pulse Header */}
      <MarketPulseHeader />

      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 py-3 space-y-3">
        {/* Page Header — Bloomberg compact + session badge + global timestamp */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground tracking-tight">Trade Desk</h1>
            {/* Session badge */}
            {(() => {
              const { label, color } = detectSession();
              return <span className={color}>{label}</span>;
            })()}
            {/* Date filter indicator */}
            <span className={cn(componentStyles.text.chromeLabel, "text-muted-foreground/60")}>
              {serverDateFilter === 'today' ? 'TODAY' : serverDateFilter === 'week' ? 'PAST WEEK' : 'ALL TIME'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Global data timestamp */}
            <span className={cn(componentStyles.text.chromeLabel, "text-muted-foreground/60 tabular-nums")}>
              {new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true })} ET
            </span>
            {/* Generate Ideas Dropdown */}
            <Select
              onValueChange={(value) => generateIdeas.mutate(value as any)}
              disabled={generateIdeas.isPending}
            >
              <SelectTrigger className="w-[120px] bg-transparent text-muted-foreground border-border hover:border-[var(--trade-bullish)]/40 hover:text-foreground text-[10px] font-mono font-medium h-7">
                {generatingEngine ? (
                  <div className="flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Generating...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    <span>Generate</span>
                  </div>
                )}
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="hover:bg-emerald-600/20">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-[var(--trade-neutral)]" />
                    <span>All Engines</span>
                  </div>
                </SelectItem>
                <SelectItem value="ai" className="hover:bg-emerald-600/20">
                  <div className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                    <span>Confluence Engine</span>
                  </div>
                </SelectItem>
                <SelectItem value="quant" className="hover:bg-emerald-600/20">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5 text-[var(--trade-bullish)]" />
                    <span>Quant Engine</span>
                  </div>
                </SelectItem>
                <SelectItem value="hybrid" className="hover:bg-emerald-600/20">
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-[var(--trade-bullish)]" />
                    <span>Hybrid AI+Quant</span>
                  </div>
                </SelectItem>
                <SelectItem value="flow" className="hover:bg-emerald-600/20">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-[var(--trade-bullish)]" />
                    <span>Options Flow</span>
                  </div>
                </SelectItem>
                <SelectItem value="gex" className="hover:bg-cyan-600/20">
                  <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <span>GEX Scanner</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Asset Type Filter — compact with mobile touch targets */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { value: 'all', label: 'All' },
            { value: 'watchlist', label: 'Watchlist' },
            { value: 'option', label: 'Options' },
            { value: 'tv', label: 'TV' },
          ].map(({ value, label }) => {
            const count = value === 'option' ? optionIdeas.length :
                          value === 'watchlist' ? watchlistIdeas.length :
                          value === 'tv' ? tvIdeas.length : 0;
            return (
              <button
                key={value}
                onClick={() => setAssetFilter(value as typeof assetFilter)}
                className={cn(
                  "px-3 py-1.5 sm:px-2 sm:py-0.5 rounded-md text-[11px] sm:text-[10px] font-mono font-medium transition-all whitespace-nowrap",
                  assetFilter === value
                    ? "bg-[var(--brand-teal)]/15 text-[var(--brand-teal)] ring-1 ring-[var(--brand-teal)]/30"
                    : "text-muted-foreground hover:text-foreground/80 hover:bg-muted/40"
                )}
              >
                {label}
                {value !== 'all' && count > 0 && (
                  <span className="ml-0.5 opacity-40 tabular-nums">{count}</span>
                )}
              </button>
            );
          })}
          <span className="ml-auto text-[9px] text-muted-foreground/60 font-mono tabular-nums">{filteredIdeas.length} ideas</span>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden lg:flex"
            title={sidebarOpen ? "Hide insights panel" : "Show insights panel"}
          >
            {sidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>

        {/* Main Content + Side Panel */}
        <div className="flex gap-3">
          {/* Left: Tabs + Ideas */}
          <div className={cn("flex-1 min-w-0", sidebarOpen && "lg:pr-0")}>

        {/* Plays content — no tabs needed, Flow & Strategy live in Quant Seeker */}
        <div className="space-y-3 mt-3">
            {/* PRE-MARKET GAPPERS — overnight movers from weekly + approved universe */}
            <PreMarketGappersCard />

            {/* FLOW IMPORT — paste Bullflow alerts (consumer tier has no API) → engine grades → B- and up */}
            <FlowImport />

            {/* 🎯 DISCOVERY PICKS — auto-pushed from convergence engine (the bridge) */}
            <DiscoveryPicksPanel size="standard" maxItems={8} />

            {/* GEX BIG GAINERS — premium scanner plays running hot + hall-of-fame winners */}
            <GexBigGainers compact />

            {/* TRADE IDEAS — Convictions-style panel with filters, presets, view modes, drawer */}
            <TradeIdeasPanel />

            {/* Empty state with generate button */}
            {showEmptyTodayMessage && (
              <div className="bg-muted/30 border border-border/30 rounded-xl p-6 text-center">
                <p className="text-muted-foreground text-sm mb-3">
                  {isWeekend ? 'Market closed — showing last week' : 'Next scan window coming up — engines running'}
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setServerDateFilter('week')}
                    className="px-4 py-2 bg-muted hover:bg-muted rounded-lg text-sm text-foreground transition-colors"
                  >
                    Show Past Week
                  </button>
                </div>
              </div>
            )}
        </div>
          </div>{/* End left column */}

          {/* Right: Insights Side Panel (collapsible) */}
          {sidebarOpen && (
            <aside className="hidden lg:block w-72 flex-shrink-0 space-y-3">
              {/* Top Conviction */}
              <div className="rounded-lg bg-card border border-border p-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-cyan)]/30 to-transparent" />
                <div className="flex items-center gap-2 mb-2.5">
                  <Gem className="w-3.5 h-3.5 text-[var(--brand-cyan)]" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Top Conviction</span>
                </div>
                <div className="space-y-1">
                  {(() => {
                    // H9: use canonical helpers for filter/sort/render so this
                    // sidebar shows the same number as the cards and the alert
                    // popup. `isHighConviction` checks engine band first then
                    // falls back to legacy A+/A/A-.
                    const topConviction = filteredIdeas
                      .filter(i => isHighConviction(i as any))
                      .sort((a, b) => displayedScore(b as any) - displayedScore(a as any))
                      .slice(0, 5);
                    return topConviction.map((idea, idx) => {
                      const isLong = idea.direction === 'LONG' || idea.direction === 'long';
                      const cBand = (idea as any).convictionBand;
                      const score = displayedScore(idea as any);
                      const grade = displayedGrade(idea as any);
                      const barPct = displayedScoreBarPct(idea as any);
                      const isStrong = (cBand === 'S' || cBand === 'A') || score >= 75;
                      const isMid = (cBand === 'B') || score >= 60;
                      return (
                        <div
                          key={idx}
                          onClick={() => { setSelectedTradeIdea(idea); setTradeIdeaModalOpen(true); }}
                          className="flex items-center justify-between p-1.5 rounded hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn(
                              "w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold",
                              isLong ? "bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/15 text-[var(--trade-bearish)]"
                            )}>
                              {isLong ? '↑' : '↓'}
                            </span>
                            <span className="font-mono font-semibold text-xs text-foreground truncate">{idea.symbol}</span>
                            {cBand && (
                              <span className={cn(
                                "text-[8px] font-mono font-bold px-1 rounded border",
                                cBand === 'S' ? "text-amber-300 border-amber-500/40 bg-amber-500/10" :
                                cBand === 'A' ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" :
                                cBand === 'B' ? "text-cyan-300 border-cyan-500/40 bg-cyan-500/10" :
                                "text-muted-foreground border-border bg-muted/30"
                              )}>{cBand}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="w-8 h-1 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full rounded-full", isStrong ? "bg-[var(--trade-bullish)]" : isMid ? "bg-[var(--brand-cyan)]" : "bg-[var(--trade-neutral)]")} style={{ width: `${barPct}%` }} />
                            </div>
                            <span
                              className={cn(
                                "text-[10px] font-mono font-bold leading-none px-1 py-0.5 rounded border tabular-nums",
                                gradeColorClass(grade),
                              )}
                              title={`Conviction score ${score} (${grade})`}
                            >
                              {grade}
                            </span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {filteredIdeas.filter(i => isHighConviction(i as any)).length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center py-3">Scanning for A+ grade setups...</p>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="rounded-lg bg-card border border-border p-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <BarChart3 className="w-3.5 h-3.5 text-[var(--brand-teal)]" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Session Stats</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-muted/30 text-center">
                    <div className="text-[9px] text-muted-foreground font-medium uppercase">Open</div>
                    <div className="text-sm font-mono font-bold text-foreground">{filteredIdeas.filter(i => (i as any).outcomeStatus === 'open' || !(i as any).outcomeStatus).length}</div>
                  </div>
                  <div className="p-2 rounded bg-muted/30 text-center">
                    <div className="text-[9px] text-muted-foreground font-medium uppercase">Quality</div>
                    <div className="text-sm font-mono font-bold text-[var(--trade-bullish)]">{filteredIdeas.filter(i => { const g = (i as any).probabilityBand || ''; return g.startsWith('A') || g === 'S'; }).length}</div>
                  </div>
                  <div className="p-2 rounded bg-muted/30 text-center">
                    <div className="text-[9px] text-muted-foreground font-medium uppercase">Long</div>
                    <div className="text-sm font-mono font-bold text-foreground">{filteredIdeas.filter(i => i.direction === 'LONG' || i.direction === 'long').length}</div>
                  </div>
                  <div className="p-2 rounded bg-muted/30 text-center">
                    <div className="text-[9px] text-muted-foreground font-medium uppercase">Short</div>
                    <div className="text-sm font-mono font-bold text-foreground">{filteredIdeas.filter(i => i.direction === 'SHORT' || i.direction === 'short').length}</div>
                  </div>
                </div>
              </div>

              {/* Hot Symbols — compact version */}
              <div className="rounded-lg bg-card border border-border p-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
                <div className="flex items-center gap-2 mb-2.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hot Symbols</span>
                </div>
                <HotSymbolsCompact />
              </div>

              {/* Watchlist Quick Access */}
              <div className="rounded-lg bg-card border border-border p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-[var(--trade-neutral)]" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Watchlist</span>
                  </div>
                  <Link href="/watchlist">
                    <span className="text-[10px] text-[var(--brand-teal)] hover:text-[var(--brand-cyan)] cursor-pointer">View all</span>
                  </Link>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(watchlistSymbols).slice(0, 12).map(sym => (
                    <Link key={sym} href={`/terminal/${sym}`}>
                      <span className="inline-block text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors">
                        {sym}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </aside>
          )}
        </div>{/* End flex container */}
      </div>

      {/* Trade Idea Detail Modal */}
      <TradeIdeaDetailV2
        idea={selectedTradeIdea}
        open={tradeIdeaModalOpen}
        onOpenChange={setTradeIdeaModalOpen}
      />
    </div>
  );
}