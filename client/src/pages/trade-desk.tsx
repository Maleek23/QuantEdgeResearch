/**
 * AI Trade Desk - Redesigned with Sub-Pages
 * Clean architecture with dedicated sections for different trading views
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SiDiscord } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Search,
  BarChart3,
  DollarSign,
  Zap,
  Activity,
  Calendar,
  Star,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  Sparkles,
  Bitcoin,
  Globe,
  Flame,
  ChevronRight,
  LineChart,
  Eye,
  Clock,
  Filter,
  RefreshCw,
  ExternalLink,
  Layers,
  PieChart,
} from "lucide-react";
import type { TradeIdea } from "@shared/schema";
import { getLetterGrade, getGradeStyle } from "@shared/grading";

// ============================================
// MARKET PULSE HEADER
// ============================================
function MarketPulseHeader() {
  const { data: realtimeData } = useQuery({
    queryKey: ['/api/realtime-status'],
    queryFn: async () => {
      const res = await fetch('/api/realtime-status');
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 10000,
  });

  const tickers = [
    { symbol: 'NQ', label: 'Nasdaq', price: realtimeData?.prices?.futures?.NQ?.price },
    { symbol: 'ES', label: 'S&P 500', price: realtimeData?.prices?.futures?.ES?.price },
    { symbol: 'GC', label: 'Gold', price: realtimeData?.prices?.futures?.GC?.price, prefix: '$' },
    { symbol: 'BTC', label: 'Bitcoin', price: realtimeData?.prices?.crypto?.BTC?.price, prefix: '$' },
    { symbol: 'ETH', label: 'Ethereum', price: realtimeData?.prices?.crypto?.ETH?.price, prefix: '$' },
  ];

  return (
    <div className="flex items-center gap-6 px-4 py-2 bg-slate-900/50 border-b border-slate-800/60 overflow-x-auto">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-medium text-emerald-400">LIVE</span>
      </div>
      {tickers.map((t) => (
        <div key={t.symbol} className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">{t.symbol}</span>
          <span className="text-sm font-mono text-white">
            {t.price ? `${t.prefix || ''}${t.price.toLocaleString()}` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================
// STATS OVERVIEW CARDS
// ============================================
function StatsOverview({ ideas }: { ideas: TradeIdea[] }) {
  const stats = useMemo(() => {
    const openIdeas = ideas.filter(i => i.outcomeStatus === 'open' || !i.outcomeStatus);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIdeas = openIdeas.filter(i => {
      const ts = i.timestamp ? new Date(i.timestamp) : null;
      return ts && ts >= today;
    });
    const qualityIdeas = openIdeas.filter(i => {
      const grade = i.probabilityBand || '';
      return ['A+', 'A', 'A-', 'B+', 'B'].includes(grade);
    });
    const avgConf = openIdeas.length > 0
      ? Math.round(openIdeas.reduce((sum, i) => sum + (i.confidenceScore || 0), 0) / openIdeas.length)
      : 0;

    return {
      total: openIdeas.length,
      today: todayIdeas.length,
      quality: qualityIdeas.length,
      avgConf,
    };
  }, [ideas]);

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card className="bg-slate-900/40 border-slate-800/60 p-4">
        <div className="text-xs text-slate-500 mb-1">Total Ideas</div>
        <div className="text-2xl font-bold text-white">{stats.total}</div>
      </Card>
      <Card className="bg-slate-900/40 border-slate-800/60 p-4">
        <div className="text-xs text-slate-500 mb-1">Today's Ideas</div>
        <div className="text-2xl font-bold text-teal-400">{stats.today}</div>
      </Card>
      <Card className="bg-slate-900/40 border-slate-800/60 p-4">
        <div className="text-xs text-slate-500 mb-1">Quality (A/B)</div>
        <div className="text-2xl font-bold text-cyan-400">{stats.quality}</div>
      </Card>
      <Card className="bg-slate-900/40 border-slate-800/60 p-4">
        <div className="text-xs text-slate-500 mb-1">Avg Confidence</div>
        <div className="text-2xl font-bold text-white">{stats.avgConf}%</div>
      </Card>
    </div>
  );
}

// ============================================
// BEST SETUPS CARD (Quick View)
// ============================================
function BestSetupsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/trade-ideas/best-setups', 'daily'],
    queryFn: async () => {
      const res = await fetch('/api/trade-ideas/best-setups?period=daily&limit=5');
      if (!res.ok) return { setups: [] };
      return res.json();
    },
    staleTime: 2 * 60 * 1000, // Data fresh for 2 minutes
    gcTime: 10 * 60 * 1000,   // Keep in cache for 10 minutes
    refetchInterval: 60000,   // Refresh every minute
  });

  const setups = data?.setups || [];

  return (
    <Card className="bg-slate-900/40 border-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Best Setups</span>
        </div>
        <Badge variant="outline" className="text-xs">{setups.length} Active</Badge>
      </div>
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : setups.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-sm">No setups available</div>
        ) : (
          setups.slice(0, 5).map((setup: any) => {
            const grade = setup.probabilityBand || getLetterGrade(setup.confidenceScore || 50);
            const style = getGradeStyle(grade);
            return (
              <Link key={setup.id || setup.symbol} href={`/stock/${setup.symbol}`}>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-white">{setup.symbol}</span>
                    <Badge className={cn("text-xs", style.bgClass, style.textClass)}>{grade}</Badge>
                  </div>
                  <span className="text-sm font-mono text-slate-400">{setup.confidenceScore}%</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </Card>
  );
}

// ============================================
// MARKET MOVERS CARD
// ============================================
function MarketMoversCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/market-movers'],
    queryFn: async () => {
      const res = await fetch('/api/market-movers');
      if (!res.ok) return { topGainers: [], topLosers: [] };
      return res.json();
    },
    staleTime: 30 * 1000,     // Fresh for 30 seconds
    gcTime: 5 * 60 * 1000,    // Keep in cache for 5 minutes
    refetchInterval: 60000,
  });

  const gainers = data?.topGainers?.slice(0, 5) || [];

  return (
    <Card className="bg-slate-900/40 border-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-semibold text-white">Market Movers</span>
        </div>
        <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">Live</Badge>
      </div>
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : gainers.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-sm">No movers</div>
        ) : (
          gainers.map((stock: any) => (
            <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 transition-colors cursor-pointer">
                <span className="font-mono font-bold text-white">{stock.symbol}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-emerald-400">+{stock.changePercent?.toFixed(1)}%</span>
                  <span className="text-xs text-slate-500">${stock.price?.toFixed(2)}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

// ============================================
// SURGE DETECTION CARD
// ============================================
function SurgeDetectionCard() {
  const [tab, setTab] = useState<'surge' | 'early' | 'tomorrow'>('surge');

  // Fetch breakout candidates with longer stale time (uses cached data from server)
  const [forceRefresh, setForceRefresh] = useState(false);
  const { data: breakoutData, isLoading: breakoutLoading, isError: breakoutError, refetch: refetchBreakouts } = useQuery({
    queryKey: ['/api/discovery/breakouts', forceRefresh],
    queryFn: async () => {
      const url = forceRefresh ? '/api/discovery/breakouts?refresh=true' : '/api/discovery/breakouts';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch surge data');
      setForceRefresh(false); // Reset after fetch
      return res.json();
    },
    staleTime: 4 * 60 * 1000, // 4 minutes (server caches for 5)
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    retry: 2,
  });

  // Fetch pre-breakout candidates
  const { data: preBreakoutData, isLoading: preLoading } = useQuery({
    queryKey: ['/api/discovery/pre-breakout'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/pre-breakout');
      if (!res.ok) throw new Error('Failed to fetch pre-breakout data');
      return res.json();
    },
    staleTime: 4 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });

  // Fetch overnight/next-day predictions (PREDICTIVE - finds stocks that might surge tomorrow)
  const { data: overnightData, isLoading: overnightLoading } = useQuery({
    queryKey: ['/api/discovery/overnight-predictions'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/overnight-predictions');
      if (!res.ok) throw new Error('Failed to fetch overnight predictions');
      return res.json();
    },
    staleTime: 8 * 60 * 1000, // 8 minutes (predictions change slowly)
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
    retry: 2,
  });

  // Show SURGE/MOMENTUM first, fallback to SETUP, then ALL candidates
  const allCandidates = breakoutData?.candidates || [];
  const surgeMomentum = allCandidates.filter((c: any) => c.tier === 'SURGE' || c.tier === 'MOMENTUM');
  const setupTier = allCandidates.filter((c: any) => c.tier === 'SETUP' || c.score >= 50);
  // Progressive fallback: SURGE/MOMENTUM -> SETUP -> ALL candidates
  const surges = surgeMomentum.length > 0
    ? surgeMomentum
    : setupTier.length > 0
      ? setupTier
      : allCandidates;
  const earlySetups = preBreakoutData?.candidates || [];
  const tomorrowPlays = overnightData?.predictions?.filter((p: any) =>
    p.prediction?.tier === 'HIGH_CONVICTION' || p.prediction?.tier === 'STRONG_SETUP'
  ) || [];
  const hasSurgeMomentum = surgeMomentum.length > 0;

  const isLoading = tab === 'surge' ? breakoutLoading : tab === 'early' ? preLoading : overnightLoading;

  // Render different content based on tab
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-slate-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      );
    }

    if (breakoutError && tab === 'surge') {
      return (
        <div className="text-center py-4 text-slate-500 text-sm">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p>Temporarily unavailable</p>
        </div>
      );
    }

    // TOMORROW TAB - Predictive overnight plays
    if (tab === 'tomorrow') {
      if (tomorrowPlays.length === 0) {
        return (
          <div className="text-center py-4 text-slate-500 text-sm">
            <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>No high-conviction setups</p>
            <p className="text-[10px] mt-1">Best scanned near market close (3-4 PM ET)</p>
          </div>
        );
      }

      return tomorrowPlays.slice(0, 5).map((pred: any, idx: number) => (
        <Link key={`${pred.symbol}-${idx}`} href={`/stock/${pred.symbol}`}>
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 transition-colors cursor-pointer border-l-2 border-violet-500/50">
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
                pred.prediction?.tier === 'HIGH_CONVICTION' ? "bg-violet-500/30 text-violet-300" :
                "bg-cyan-500/20 text-cyan-400"
              )}>{idx + 1}</span>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-bold text-white text-sm">{pred.symbol}</span>
                  {pred.prediction?.tier === 'HIGH_CONVICTION' && (
                    <Sparkles className="w-3 h-3 text-violet-400" />
                  )}
                </div>
                <p className="text-[10px] text-slate-500 truncate max-w-[100px]">
                  {pred.signals?.[0]?.name || 'Setup detected'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-white">
                ${pred.currentPrice?.toFixed(2) || '—'}
              </span>
              <p className="text-[10px] text-violet-400 font-medium">
                {pred.prediction?.probability?.toFixed(0)}% prob
              </p>
            </div>
          </div>
        </Link>
      ));
    }

    // SURGE and EARLY tabs
    const displayData = tab === 'surge' ? surges : earlySetups;

    if (displayData.length === 0) {
      return (
        <div className="text-center py-4 text-slate-500 text-sm">
          No {tab === 'surge' ? 'surges' : 'setups'} detected
        </div>
      );
    }

    return displayData.slice(0, 5).map((stock: any, idx: number) => (
      <Link key={`${stock.symbol}-${idx}`} href={`/stock/${stock.symbol}`}>
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 transition-colors cursor-pointer">
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
              stock.tier === 'SURGE' ? "bg-rose-500/20 text-rose-400" :
              stock.tier === 'MOMENTUM' ? "bg-amber-500/20 text-amber-400" :
              "bg-blue-500/20 text-blue-400"
            )}>{idx + 1}</span>
            <div>
              <span className="font-mono font-bold text-white text-sm">{stock.symbol}</span>
              <p className="text-[10px] text-slate-500 truncate max-w-[120px]">
                {stock.reason?.split(' | ')[0] || stock.tier}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-white">
              ${stock.price?.toFixed(2) || '—'}
            </span>
            {typeof stock.change === 'number' && (
              <p className={cn(
                "text-xs font-mono font-bold",
                stock.change > 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {stock.change > 0 ? '+' : ''}{stock.change.toFixed(1)}%
              </p>
            )}
          </div>
        </div>
      </Link>
    ));
  };

  return (
    <Card className="bg-slate-900/40 border-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Surge Detection</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-slate-500 hover:text-white"
            onClick={() => {
              setForceRefresh(true);
              refetchBreakouts();
            }}
            disabled={breakoutLoading}
          >
            <RefreshCw className={cn("w-3 h-3", breakoutLoading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={tab === 'surge' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setTab('surge')}
          >
            <Flame className="w-3 h-3 mr-1" />
            Now ({surges.length})
          </Button>
          <Button
            variant={tab === 'early' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setTab('early')}
          >
            <TrendingUp className="w-3 h-3 mr-1" />
            Early ({earlySetups.length})
          </Button>
          <Button
            variant={tab === 'tomorrow' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setTab('tomorrow')}
          >
            <Sparkles className="w-3 h-3 mr-1" />
            Tomorrow ({tomorrowPlays.length})
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">
        {tab === 'tomorrow'
          ? 'Predictive: Stocks that might surge 10-40% next day'
          : tab === 'surge' && !hasSurgeMomentum && surges.length > 0
            ? 'Watchlist movers - no major surges right now'
            : tab === 'surge' && surges.length === 0
              ? 'Scanning market for momentum signals...'
              : 'Real-time momentum & pre-breakout signals'}
      </p>

      <div className="space-y-2">
        {renderContent()}
      </div>

      {(breakoutData?.cached || overnightData?.cached) && (
        <p className="text-[9px] text-slate-600 mt-2 text-center">
          Cached {tab === 'tomorrow' ? overnightData?.cacheAge : breakoutData?.cacheAge}s ago
        </p>
      )}
    </Card>
  );
}

// ============================================
// CONVERGENCE SIGNALS CARD - Multi-source pre-move detection
// ============================================
function ConvergenceSignalsCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['/api/convergence/opportunities'],
    queryFn: async () => {
      const res = await fetch('/api/convergence/opportunities');
      if (!res.ok) throw new Error('Failed to fetch convergence data');
      return res.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 3 * 60 * 1000, // Refresh every 3 minutes
    retry: 2,
  });

  const opportunities = data?.opportunities || [];
  const criticalCount = data?.critical || 0;
  const highCount = data?.high || 0;

  return (
    <Card className="bg-slate-900/40 border-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">Convergence</span>
        </div>
        <div className="flex items-center gap-1">
          {criticalCount > 0 && (
            <Badge className="bg-red-500/20 text-red-400 text-[10px]">
              {criticalCount} Critical
            </Badge>
          )}
          {highCount > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">
              {highCount} High
            </Badge>
          )}
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">Multi-source signal correlation (pre-move detection)</p>

      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-slate-800/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-4 text-slate-500 text-sm">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>Temporarily unavailable</p>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-sm">
            <Activity className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>No convergence signals</p>
            <p className="text-[10px] mt-1">Monitoring news, options, insiders, sectors...</p>
          </div>
        ) : (
          opportunities.slice(0, 5).map((opp: any, idx: number) => (
            <Link key={`${opp.symbol}-${idx}`} href={`/stock/${opp.symbol}`}>
              <div className={cn(
                "flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer",
                opp.urgency === 'critical' ? "bg-red-500/10 hover:bg-red-500/20 border border-red-500/30" :
                opp.urgency === 'high' ? "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30" :
                "bg-slate-800/40 hover:bg-slate-800/60"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
                    opp.urgency === 'critical' ? "bg-red-500/20 text-red-400" :
                    opp.urgency === 'high' ? "bg-amber-500/20 text-amber-400" :
                    "bg-purple-500/20 text-purple-400"
                  )}>{opp.signals?.length || idx + 1}</span>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-bold text-white text-sm">{opp.symbol}</span>
                      <span className={cn(
                        "text-[10px] font-medium",
                        opp.direction === 'bullish' ? "text-emerald-400" : "text-red-400"
                      )}>{opp.direction === 'bullish' ? '↑' : '↓'}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate max-w-[120px]">
                      {opp.signals?.map((s: any) => s.source).slice(0, 3).join(', ') || 'Multi-source'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-sm font-mono font-bold",
                    opp.convergenceScore >= 80 ? "text-emerald-400" :
                    opp.convergenceScore >= 65 ? "text-amber-400" : "text-white"
                  )}>
                    {opp.convergenceScore}%
                  </span>
                  <p className="text-[10px] text-slate-500">
                    {opp.urgency.toUpperCase()}
                  </p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
      {data?.cached && (
        <p className="text-[9px] text-slate-600 mt-2 text-center">
          Cached {data.cacheAge}s ago
        </p>
      )}
    </Card>
  );
}

// ============================================
// HOT SYMBOLS CARD - Symbols with multi-source attention
// ============================================
function HotSymbolsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/convergence/hot-symbols'],
    queryFn: async () => {
      const res = await fetch('/api/convergence/hot-symbols?limit=10');
      if (!res.ok) throw new Error('Failed to fetch hot symbols');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    retry: 2,
  });

  const symbols = data?.symbols || [];

  return (
    <Card className="bg-slate-900/40 border-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-semibold text-white">Hot Attention</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {data?.convergingCount || 0} Converging
        </Badge>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">Symbols flagged by multiple scanners</p>

      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-slate-800/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : symbols.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-sm">No hot symbols</div>
        ) : (
          symbols.slice(0, 6).map((item: any, idx: number) => (
            <Link key={item.symbol} href={`/stock/${item.symbol}`}>
              <div className={cn(
                "flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer",
                item.isConverging ? "bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30" : "bg-slate-800/40 hover:bg-slate-800/60"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
                    item.isConverging ? "bg-orange-500/20 text-orange-400" : "bg-slate-700 text-slate-400"
                  )}>{idx + 1}</span>
                  <div>
                    <span className="font-mono font-bold text-white text-sm">{item.symbol}</span>
                    <p className="text-[10px] text-slate-500">
                      {item.distinctSources} sources • {item.recentTouches1h} hits/hr
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-sm font-mono font-bold",
                    item.heatScore >= 5 ? "text-red-400" :
                    item.heatScore >= 3 ? "text-orange-400" : "text-slate-400"
                  )}>
                    {item.heatScore?.toFixed(1)}
                  </span>
                  <p className="text-[10px] text-slate-500">heat</p>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

// ============================================
// TRADE IDEA CARD COMPONENT (Expandable Grid Card)
// ============================================
function TradeIdeaCard({ idea, expanded, onToggle }: {
  idea: TradeIdea;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { toast } = useToast();
  const grade = idea.probabilityBand || getLetterGrade(idea.confidenceScore || 50);
  const style = getGradeStyle(grade);
  const isLong = idea.direction === 'LONG' || idea.direction === 'long';
  const isOption = idea.assetType === 'option' || idea.optionType;
  const isCall = idea.optionType === 'call';

  // Discord share mutation
  const shareToDiscord = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/trade-ideas/${idea.id}/share-discord`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to share to Discord');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Sent to Discord",
        description: `${idea.symbol} ${isOption ? idea.optionType?.toUpperCase() : ''} idea shared to AI Quant Options channel`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to send",
        description: "Could not share to Discord. Try again.",
        variant: "destructive",
      });
    },
  });

  // Calculate potential gain/loss
  const potentialGain = idea.targetPrice && idea.entryPrice
    ? ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(1)
    : null;
  const potentialLoss = idea.stopLoss && idea.entryPrice
    ? ((idea.entryPrice - idea.stopLoss) / idea.entryPrice * 100).toFixed(1)
    : null;

  return (
    <Card className={cn(
      "bg-slate-900/60 border-slate-700/40 overflow-hidden transition-all duration-300",
      expanded ? "ring-1 ring-teal-500/50" : "hover:border-slate-600/60"
    )}>
      {/* Card Header - Always Visible */}
      <div
        className="p-4 cursor-pointer"
        onClick={onToggle}
      >
        {/* Top Row: Symbol, Grade, Direction */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm",
              isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            )}>
              {isLong ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-white text-lg">{idea.symbol}</span>
                <Badge className={cn("text-xs font-bold", style.bgClass, style.textClass)}>
                  {grade}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className={isLong ? "text-emerald-400" : "text-red-400"}>
                  {isLong ? 'LONG' : 'SHORT'}
                </span>
                {isOption && (
                  <>
                    <span>•</span>
                    <span className={isCall ? "text-emerald-400" : "text-red-400"}>
                      {idea.optionType?.toUpperCase()}
                    </span>
                  </>
                )}
                <span>•</span>
                <span>{idea.holdingPeriod || 'swing'}</span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{idea.confidenceScore || 50}%</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Confidence</div>
          </div>
        </div>

        {/* Options Details Row (if applicable) */}
        {isOption && (idea.strikePrice || idea.expiryDate) && (
          <div className="flex items-center gap-4 mb-3 p-2 bg-slate-800/40 rounded-lg">
            <div className="flex items-center gap-2">
              <Target className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-400">Strike:</span>
              <span className="text-xs font-mono text-white">${idea.strikePrice?.toFixed(2) || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3 text-slate-500" />
              <span className="text-xs text-slate-400">Exp:</span>
              <span className="text-xs font-mono text-white">{idea.expiryDate || '—'}</span>
            </div>
          </div>
        )}

        {/* Price Levels */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-800/40 rounded-lg p-2 text-center">
            <div className="text-[10px] text-slate-500 uppercase">Entry</div>
            <div className="font-mono text-white text-sm">${idea.entryPrice?.toFixed(2) || '—'}</div>
          </div>
          <div className="bg-emerald-500/10 rounded-lg p-2 text-center border border-emerald-500/20">
            <div className="text-[10px] text-emerald-400 uppercase">Target</div>
            <div className="font-mono text-emerald-400 text-sm">${idea.targetPrice?.toFixed(2) || '—'}</div>
            {potentialGain && <div className="text-[9px] text-emerald-400/70">+{potentialGain}%</div>}
          </div>
          <div className="bg-red-500/10 rounded-lg p-2 text-center border border-red-500/20">
            <div className="text-[10px] text-red-400 uppercase">Stop</div>
            <div className="font-mono text-red-400 text-sm">${idea.stopLoss?.toFixed(2) || '—'}</div>
            {potentialLoss && <div className="text-[9px] text-red-400/70">-{potentialLoss}%</div>}
          </div>
        </div>

        {/* Expand Indicator */}
        <div className="flex items-center justify-center mt-3 pt-2 border-t border-slate-800/60">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            {expanded ? 'Click to collapse' : 'Click to expand analysis'}
            <ChevronRight className={cn("w-3 h-3 transition-transform", expanded && "rotate-90")} />
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-slate-800/60 p-4 space-y-4 bg-slate-950/40">
          {/* Analysis Section */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Brain className="w-3 h-3" /> Trade Analysis
            </h4>
            <p className="text-sm text-slate-300 leading-relaxed">
              {idea.analysis || 'No detailed analysis available for this trade idea.'}
            </p>
          </div>

          {/* Catalyst */}
          {idea.catalyst && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Zap className="w-3 h-3" /> Catalyst
              </h4>
              <p className="text-sm text-amber-400/90">{idea.catalyst}</p>
            </div>
          )}

          {/* Quality Signals */}
          {idea.qualitySignals && idea.qualitySignals.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                <Sparkles className="w-3 h-3" /> Quality Signals
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {idea.qualitySignals.map((signal, idx) => (
                  <Badge key={idx} variant="outline" className="text-[10px] bg-slate-800/40">
                    {signal}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* AI Research Report */}
          <ResearchReportSection idea={idea} />

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
            <Link href={`/stock/${idea.symbol}`} className="flex-1">
              <Button size="sm" className="w-full bg-teal-600 hover:bg-teal-500">
                <Eye className="w-3 h-3 mr-2" />
                Full Analysis
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              className="bg-indigo-600/20 border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-400"
              onClick={(e) => {
                e.stopPropagation();
                shareToDiscord.mutate();
              }}
              disabled={shareToDiscord.isPending}
            >
              <SiDiscord className="w-3 h-3 mr-2" />
              {shareToDiscord.isPending ? 'Sending...' : 'Discord'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================
// RESEARCH REPORT SECTION (AI/Quant Generated)
// ============================================
function ResearchReportSection({ idea }: { idea: TradeIdea }) {
  const isLong = idea.direction === 'LONG' || idea.direction === 'long';
  const grade = idea.probabilityBand || getLetterGrade(idea.confidenceScore || 50);

  // Generate research insights based on idea data
  const insights = useMemo(() => {
    const reports = [];

    // Technical Analysis Report
    if (idea.qualitySignals && idea.qualitySignals.length > 0) {
      const technicalSignals = idea.qualitySignals.filter(s =>
        s.includes('RSI') || s.includes('MACD') || s.includes('volume') || s.includes('breakout')
      );
      if (technicalSignals.length > 0) {
        reports.push({
          title: 'Technical Analysis',
          type: 'quant',
          content: `Technical indicators suggest ${isLong ? 'bullish' : 'bearish'} momentum. ${technicalSignals.slice(0, 2).join('. ')}. Risk/Reward ratio: ${idea.riskRewardRatio?.toFixed(1) || '—'}:1.`
        });
      }
    }

    // Sentiment/Momentum Report
    reports.push({
      title: 'Momentum Assessment',
      type: 'ai',
      content: `${idea.symbol} exhibits ${grade.startsWith('A') ? 'strong' : grade.startsWith('B') ? 'moderate' : 'weak'} ${isLong ? 'bullish' : 'bearish'} characteristics with ${idea.confidenceScore || 50}% conviction. ${idea.holdingPeriod === 'day' ? 'Suitable for day trading timeframe.' : 'Consider swing trade positioning.'}`
    });

    // Risk Assessment
    const potentialGain = idea.targetPrice && idea.entryPrice
      ? ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100)
      : 0;
    const potentialLoss = idea.stopLoss && idea.entryPrice
      ? ((idea.entryPrice - idea.stopLoss) / idea.entryPrice * 100)
      : 0;

    reports.push({
      title: 'Risk Profile',
      type: 'quant',
      content: `Maximum upside: +${potentialGain.toFixed(1)}% to target. Defined risk: -${potentialLoss.toFixed(1)}% to stop. ${potentialGain > potentialLoss * 2 ? 'Favorable risk/reward setup.' : 'Standard risk parameters.'}`
    });

    return reports;
  }, [idea, isLong, grade]);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
        <BarChart3 className="w-3 h-3" /> Research Reports
      </h4>
      <div className="space-y-2">
        {insights.map((report, idx) => (
          <div
            key={idx}
            className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold",
                  report.type === 'ai' ? "bg-purple-500/20 text-purple-400" : "bg-cyan-500/20 text-cyan-400"
                )}>
                  {report.type === 'ai' ? 'AI' : 'Q'}
                </div>
                <span className="text-xs font-medium text-white">{report.title}</span>
              </div>
              <Badge variant="outline" className="text-[8px] px-1.5 py-0">
                QuantEdge
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">{report.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Legacy row component for compact views
function TradeIdeaRow({ idea }: { idea: TradeIdea }) {
  const grade = idea.probabilityBand || getLetterGrade(idea.confidenceScore || 50);
  const style = getGradeStyle(grade);
  const isLong = idea.direction === 'LONG' || idea.direction === 'long';
  const isOption = idea.assetType === 'option' || idea.optionType;

  return (
    <Link href={`/stock/${idea.symbol}`}>
      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 border border-slate-700/30 hover:border-slate-600/50 transition-all cursor-pointer group">
        <div className="flex items-center gap-3 min-w-[140px]">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white text-sm">{idea.symbol}</span>
              {isOption && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {idea.optionType?.toUpperCase() || 'OPT'}
                </Badge>
              )}
            </div>
            <div className={cn("flex items-center gap-1 text-xs",
              isLong ? "text-emerald-400" : "text-red-400"
            )}>
              {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{isLong ? 'LONG' : 'SHORT'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge className={cn("text-xs font-bold px-2 py-0.5", style.bgClass, style.textClass)}>
            {grade}
          </Badge>
          <div className="text-right">
            <div className="text-sm font-mono text-white">{idea.confidenceScore || 50}%</div>
            <div className="text-[10px] text-slate-500">Confidence</div>
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div className="text-right">
            <div className="text-slate-400">Entry</div>
            <div className="font-mono text-white">${idea.entryPrice?.toFixed(2) || '—'}</div>
          </div>
          <div className="text-right">
            <div className="text-emerald-400">Target</div>
            <div className="font-mono text-emerald-400">${idea.targetPrice?.toFixed(2) || '—'}</div>
          </div>
          <div className="text-right">
            <div className="text-red-400">Stop</div>
            <div className="font-mono text-red-400">${idea.stopLoss?.toFixed(2) || '—'}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
        </div>
      </div>
    </Link>
  );
}

// ============================================
// TRADE IDEAS LIST (Full Page View with 2-Column Grid)
// ============================================
function TradeIdeasList({ ideas, title }: { ideas: TradeIdea[], title?: string }) {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("quality");
  const [sortBy, setSortBy] = useState<string>("confidence");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredIdeas = useMemo(() => {
    let filtered = ideas.filter(i => i.outcomeStatus === 'open' || !i.outcomeStatus);

    // Search filter
    if (search) {
      filtered = filtered.filter(i =>
        i.symbol.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Direction filter
    if (directionFilter !== 'all') {
      filtered = filtered.filter(i => {
        const dir = (i.direction || 'long').toLowerCase();
        if (directionFilter === 'long') return dir === 'long' || i.optionType === 'call';
        if (directionFilter === 'short') return dir === 'short' || i.optionType === 'put';
        return true;
      });
    }

    // Grade filter
    if (gradeFilter !== 'all') {
      filtered = filtered.filter(i => {
        const grade = i.probabilityBand || '';
        if (gradeFilter === 'quality') return ['A+', 'A', 'A-', 'B+', 'B', 'B-'].includes(grade);
        if (gradeFilter === 'elite') return ['A+', 'A', 'A-'].includes(grade);
        if (gradeFilter === 'strong') return ['B+', 'B', 'B-'].includes(grade);
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'confidence') return (b.confidenceScore || 0) - (a.confidenceScore || 0);
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol);
      if (sortBy === 'recent') {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
      }
      return 0;
    });

    return filtered;
  }, [ideas, search, directionFilter, gradeFilter, sortBy]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <div className="flex items-center gap-1 bg-slate-800/40 rounded-lg p-1">
            <Button
              size="sm"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              className="h-7 px-2"
              onClick={() => setViewMode('grid')}
            >
              <Layers className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              className="h-7 px-2"
              onClick={() => setViewMode('list')}
            >
              <BarChart3 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900/40 rounded-xl border border-slate-800/60">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search symbols..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-800/50 border-slate-700/50"
          />
        </div>

        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[130px] bg-slate-800/50 border-slate-700/50">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Directions</SelectItem>
            <SelectItem value="long">Long / Calls</SelectItem>
            <SelectItem value="short">Short / Puts</SelectItem>
          </SelectContent>
        </Select>

        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-[130px] bg-slate-800/50 border-slate-700/50">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            <SelectItem value="quality">Quality (A-B)</SelectItem>
            <SelectItem value="elite">Elite (A only)</SelectItem>
            <SelectItem value="strong">Strong (B only)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700/50">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="confidence">Confidence</SelectItem>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="symbol">Symbol A-Z</SelectItem>
          </SelectContent>
        </Select>

        <div className="text-xs text-slate-500">
          {filteredIdeas.length} ideas
        </div>
      </div>

      {/* Ideas Display */}
      {filteredIdeas.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No trade ideas match your filters</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* 2-Column Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[700px] overflow-y-auto pr-2">
          {filteredIdeas.slice(0, 30).map((idea) => (
            <TradeIdeaCard
              key={idea.id || `${idea.symbol}-${idea.timestamp}`}
              idea={idea}
              expanded={expandedId === (idea.id || `${idea.symbol}-${idea.timestamp}`)}
              onToggle={() => toggleExpand(idea.id || `${idea.symbol}-${idea.timestamp}`)}
            />
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
          {filteredIdeas.slice(0, 50).map((idea) => (
            <TradeIdeaRow key={idea.id || `${idea.symbol}-${idea.timestamp}`} idea={idea} />
          ))}
        </div>
      )}

      {filteredIdeas.length > (viewMode === 'grid' ? 30 : 50) && (
        <div className="text-center py-4 text-slate-500 text-sm">
          Showing {viewMode === 'grid' ? 30 : 50} of {filteredIdeas.length} ideas
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN TRADE DESK COMPONENT
// ============================================
export default function TradeDeskRedesigned() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [generatingEngine, setGeneratingEngine] = useState<string | null>(null);

  // AI Generation mutation - triggers the 6 engines
  const generateIdeas = useMutation({
    mutationFn: async (engine: 'ai' | 'quant' | 'hybrid' | 'flow' | 'all') => {
      setGeneratingEngine(engine);
      const endpoints: Record<string, string> = {
        ai: '/api/ai/generate-ideas',
        quant: '/api/quant/generate-ideas',
        hybrid: '/api/hybrid/generate-ideas',
        flow: '/api/flow/generate-ideas',
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

  // Fetch all trade ideas with optimized caching
  const { data: tradeIdeas = [], isLoading, error } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas/best-setups', 'all'],
    queryFn: async () => {
      try {
        const authRes = await fetch('/api/trade-ideas');
        if (authRes.ok) {
          const ideas = await authRes.json();
          if (Array.isArray(ideas) && ideas.length > 0) return ideas;
        }
      } catch (e) {
        console.log('[Trade Desk] Using public endpoint');
      }
      const res = await fetch('/api/trade-ideas/best-setups?period=weekly&limit=100');
      if (!res.ok) return [];
      const data = await res.json();
      return data.setups || [];
    },
    staleTime: 60 * 1000,     // Data fresh for 1 minute
    gcTime: 10 * 60 * 1000,   // Keep in cache for 10 minutes
    refetchInterval: 60000,   // Refresh every minute
  });

  // Filter helpers for tabs
  const stockIdeas = useMemo(() =>
    tradeIdeas.filter(i =>
      i.assetType === 'stock' || (!i.assetType && !i.optionType)
    ), [tradeIdeas]);

  const optionIdeas = useMemo(() =>
    tradeIdeas.filter(i => i.assetType === 'option' || i.optionType), [tradeIdeas]);

  const cryptoIdeas = useMemo(() =>
    tradeIdeas.filter(i => i.assetType === 'crypto'), [tradeIdeas]);

  const futuresIdeas = useMemo(() =>
    tradeIdeas.filter(i => i.assetType === 'future'), [tradeIdeas]);

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-red-400">Failed to load trade ideas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-slate-100">
      {/* Market Pulse Header */}
      <MarketPulseHeader />

      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30">
                <Brain className="w-5 h-5 text-teal-400" />
              </div>
              <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                AI Trade Desk
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1 ml-12">Multi-engine trading intelligence</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Generate Ideas Dropdown */}
            <Select
              onValueChange={(value) => generateIdeas.mutate(value as any)}
              disabled={generateIdeas.isPending}
            >
              <SelectTrigger className="w-[180px] bg-gradient-to-r from-teal-600 to-cyan-600 border-teal-500/50 text-white hover:from-teal-500 hover:to-cyan-500">
                {generatingEngine ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Ideas</span>
                  </div>
                )}
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all" className="text-white hover:bg-teal-600/20">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>All 6 Engines</span>
                  </div>
                </SelectItem>
                <SelectItem value="ai" className="text-white hover:bg-teal-600/20">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span>AI Engine</span>
                  </div>
                </SelectItem>
                <SelectItem value="quant" className="text-white hover:bg-teal-600/20">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    <span>Quant Engine</span>
                  </div>
                </SelectItem>
                <SelectItem value="hybrid" className="text-white hover:bg-teal-600/20">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-teal-400" />
                    <span>Hybrid AI+Quant</span>
                  </div>
                </SelectItem>
                <SelectItem value="flow" className="text-white hover:bg-teal-600/20">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>Options Flow</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Connected</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-900/60 border border-slate-800/60 p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              <PieChart className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="ideas" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              <Layers className="w-4 h-4 mr-2" />
              All Ideas
            </TabsTrigger>
            <TabsTrigger value="stocks" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              <BarChart3 className="w-4 h-4 mr-2" />
              Stocks ({stockIdeas.length})
            </TabsTrigger>
            <TabsTrigger value="options" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              <Target className="w-4 h-4 mr-2" />
              Options ({optionIdeas.length})
            </TabsTrigger>
            <TabsTrigger value="crypto" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              <Bitcoin className="w-4 h-4 mr-2" />
              Crypto ({cryptoIdeas.length})
            </TabsTrigger>
            <TabsTrigger value="futures" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              <Globe className="w-4 h-4 mr-2" />
              Futures ({futuresIdeas.length})
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* Stats Cards */}
            <StatsOverview ideas={tradeIdeas} />

            {/* Quick View Cards - Row 1 */}
            <div className="grid grid-cols-3 gap-4">
              <BestSetupsCard />
              <MarketMoversCard />
              <SurgeDetectionCard />
            </div>

            {/* Quick View Cards - Row 2: Convergence & Pre-Move Detection */}
            <div className="grid grid-cols-2 gap-4">
              <ConvergenceSignalsCard />
              <HotSymbolsCard />
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                className="bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60"
                onClick={() => setActiveTab('ideas')}
              >
                <Layers className="w-4 h-4 mr-2" />
                All Trade Ideas
              </Button>
              <Link href="/research">
                <Button variant="outline" className="bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60">
                  <Search className="w-4 h-4 mr-2" />
                  Research Hub
                </Button>
              </Link>
              <Link href="/portfolio">
                <Button variant="outline" className="bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60">
                  <PieChart className="w-4 h-4 mr-2" />
                  Portfolio
                </Button>
              </Link>
              <Link href="/chart-analysis">
                <Button variant="outline" className="bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60">
                  <LineChart className="w-4 h-4 mr-2" />
                  Chart Analysis
                </Button>
              </Link>
            </div>

            {/* Recent Ideas Preview */}
            <Card className="bg-slate-900/40 border-slate-800/60 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Recent Trade Ideas</h3>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('ideas')}>
                  View All <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-14 bg-slate-800/40 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : tradeIdeas.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No trade ideas available</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tradeIdeas.slice(0, 5).map((idea) => (
                    <TradeIdeaRow key={idea.id || `${idea.symbol}-${idea.timestamp}`} idea={idea} />
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* All Trade Ideas Tab */}
          <TabsContent value="ideas" className="mt-6">
            <TradeIdeasList ideas={tradeIdeas} title="All Trade Ideas" />
          </TabsContent>

          {/* Stocks Tab */}
          <TabsContent value="stocks" className="mt-6">
            <TradeIdeasList ideas={stockIdeas} title="Stock Trade Ideas" />
          </TabsContent>

          {/* Options Tab */}
          <TabsContent value="options" className="mt-6">
            <TradeIdeasList ideas={optionIdeas} title="Options Trade Ideas" />
          </TabsContent>

          {/* Crypto Tab */}
          <TabsContent value="crypto" className="mt-6">
            {cryptoIdeas.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Bitcoin className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No crypto trade ideas available</p>
              </div>
            ) : (
              <TradeIdeasList ideas={cryptoIdeas} title="Crypto Trade Ideas" />
            )}
          </TabsContent>

          {/* Futures Tab */}
          <TabsContent value="futures" className="mt-6">
            {futuresIdeas.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Globe className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No futures trade ideas available</p>
              </div>
            ) : (
              <TradeIdeasList ideas={futuresIdeas} title="Futures Trade Ideas" />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
