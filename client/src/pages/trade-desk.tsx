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
import BrokerImport from "@/components/broker-import";

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
    refetchInterval: 30000, // Reduced from 10s to prevent price flickering
    staleTime: 25000, // Keep data fresh for 25s
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
// TOP CONVICTION SECTION - A/A+ Plays Only
// ============================================
function TopConvictionSection({ ideas }: { ideas: TradeIdea[] }) {
  // Filter for only A+/A/A- grade plays (elite setups)
  const topConvictionPlays = useMemo(() => {
    const elite = ideas.filter(i => {
      const grade = i.probabilityBand || '';
      return ['A+', 'A', 'A-'].includes(grade) &&
             (i.outcomeStatus === 'open' || !i.outcomeStatus);
    });

    // Sort by confidence descending, take top 4
    return elite
      .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
      .slice(0, 4);
  }, [ideas]);

  if (topConvictionPlays.length === 0) {
    return null; // Don't show section if no elite plays
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/40">
          <Star className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            Top Conviction
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px]">
              A/A+ ONLY
            </Badge>
          </h2>
          <p className="text-xs text-slate-500">Highest grade plays - don't miss these</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {topConvictionPlays.map((idea) => {
          const grade = idea.probabilityBand || getLetterGrade(idea.confidenceScore || 50);
          const style = getGradeStyle(grade);
          const isLong = idea.direction === 'LONG' || idea.direction === 'long';
          const isOption = idea.assetType === 'option' || idea.optionType;
          const confidence = idea.confidenceScore || 50;

          // Calculate potential profit
          const potentialProfit = idea.targetPrice && idea.entryPrice
            ? ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100)
            : 0;

          return (
            <Link key={idea.id || `${idea.symbol}-${idea.timestamp}`} href={`/stock/${idea.symbol}`}>
              <Card className={cn(
                "relative overflow-hidden cursor-pointer transition-all duration-300",
                "bg-gradient-to-br from-amber-500/5 via-slate-900/80 to-slate-900/90",
                "border-amber-500/30 hover:border-amber-400/60",
                "hover:shadow-lg hover:shadow-amber-500/10",
                "hover:-translate-y-1"
              )}>
                {/* Glow effect for elite plays */}
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-50" />

                <div className="relative p-4">
                  {/* Header: Symbol + Grade */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                        isLong
                          ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white"
                          : "bg-gradient-to-br from-red-500 to-rose-600 text-white"
                      )}>
                        {idea.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <span className="font-bold text-white text-lg">{idea.symbol}</span>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {isLong ? 'LONG' : 'SHORT'}
                          </span>
                          {isOption && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                              {idea.optionType?.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge className={cn(
                      "text-base font-bold px-3 py-1 border-2",
                      style.bgClass, style.textClass,
                      "shadow-lg"
                    )}>
                      {grade}
                    </Badge>
                  </div>

                  {/* Confidence + Target */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="text-center p-2 rounded-lg bg-slate-800/60">
                      <div className="text-[10px] text-slate-500 uppercase">Confidence</div>
                      <div className={cn(
                        "text-xl font-bold",
                        confidence >= 80 ? "text-emerald-400" : "text-amber-400"
                      )}>
                        {confidence}%
                      </div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-slate-800/60">
                      <div className="text-[10px] text-slate-500 uppercase">Target</div>
                      <div className="text-xl font-bold text-emerald-400">
                        +{potentialProfit.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* Price Levels */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-center">
                      <div className="text-slate-500">Entry</div>
                      <div className="font-mono text-white">${idea.entryPrice?.toFixed(2) || '—'}</div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    <div className="text-center">
                      <div className="text-emerald-400">Target</div>
                      <div className="font-mono text-emerald-400">${idea.targetPrice?.toFixed(2) || '—'}</div>
                    </div>
                  </div>

                  {/* Catalyst hint if available */}
                  {idea.catalyst && (
                    <div className="mt-3 pt-2 border-t border-slate-700/50">
                      <p className="text-[10px] text-amber-400/80 truncate flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {idea.catalyst.slice(0, 50)}...
                      </p>
                    </div>
                  )}
                </div>

                {/* View Analysis indicator */}
                <div className="absolute bottom-0 right-0 p-2">
                  <ChevronRight className="w-4 h-4 text-amber-400/50" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
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
function BestSetupsCard({ onViewAll }: { onViewAll?: () => void }) {
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
      {onViewAll && setups.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
          onClick={onViewAll}
        >
          View All Setups <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </Card>
  );
}

// ============================================
// MARKET MOVERS CARD
// ============================================
function MarketMoversCard({ onViewAll }: { onViewAll?: () => void }) {
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
      {onViewAll && gainers.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
          onClick={onViewAll}
        >
          View All Movers <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </Card>
  );
}

// ============================================
// TOMORROW'S SURGERS SUB-PAGE (Full Overnight Predictions View)
// ============================================
function TomorrowSurgersSubPage() {
  const [forceRefresh, setForceRefresh] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['/api/discovery/overnight-predictions', forceRefresh],
    queryFn: async () => {
      const url = forceRefresh ? '/api/discovery/overnight-predictions?refresh=true' : '/api/discovery/overnight-predictions';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch overnight predictions');
      setForceRefresh(false);
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
    retry: 2,
  });

  const predictions = data?.predictions || [];

  // Group by tier
  const highConviction = predictions.filter((p: any) => p.prediction?.tier === 'HIGH_CONVICTION');
  const strongSetup = predictions.filter((p: any) => p.prediction?.tier === 'STRONG_SETUP');
  const watchClosely = predictions.filter((p: any) => p.prediction?.tier === 'WATCH_CLOSELY');
  const speculative = predictions.filter((p: any) => p.prediction?.tier === 'SPECULATIVE');

  const getTierStyle = (tier: string) => {
    switch (tier) {
      case 'HIGH_CONVICTION':
        return { bg: 'from-violet-500/20 to-purple-500/20', border: 'border-violet-500/50', text: 'text-violet-400', badge: 'bg-violet-500/30 text-violet-300' };
      case 'STRONG_SETUP':
        return { bg: 'from-cyan-500/20 to-teal-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', badge: 'bg-cyan-500/30 text-cyan-300' };
      case 'WATCH_CLOSELY':
        return { bg: 'from-amber-500/20 to-yellow-500/20', border: 'border-amber-500/50', text: 'text-amber-400', badge: 'bg-amber-500/30 text-amber-300' };
      default:
        return { bg: 'from-slate-500/20 to-gray-500/20', border: 'border-slate-500/50', text: 'text-slate-400', badge: 'bg-slate-500/30 text-slate-300' };
    }
  };

  const renderPredictionCard = (pred: any, idx: number) => {
    const style = getTierStyle(pred.prediction?.tier);
    const signals = pred.signals || [];
    const topSignals = signals.slice(0, 4);

    return (
      <Link key={`${pred.symbol}-${idx}`} href={`/stock/${pred.symbol}`}>
        <Card className={cn(
          "relative overflow-hidden cursor-pointer transition-all duration-300",
          `bg-gradient-to-br ${style.bg}`,
          style.border,
          "hover:shadow-lg hover:-translate-y-1"
        )}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50" />

          <div className="relative p-4">
            {/* Header: Symbol + Tier Badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                  "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
                )}>
                  {pred.symbol.slice(0, 2)}
                </div>
                <div>
                  <span className="font-bold text-white text-lg">{pred.symbol}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500">${pred.currentPrice?.toFixed(2) || '—'}</span>
                    {pred.change && (
                      <span className={cn(
                        "text-xs font-medium",
                        pred.change > 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        {pred.change > 0 ? '+' : ''}{pred.change.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <Badge className={cn("text-xs font-bold px-2 py-1", style.badge)}>
                  {pred.prediction?.tier?.replace('_', ' ') || 'WATCH'}
                </Badge>
                <div className={cn("text-lg font-bold mt-1", style.text)}>
                  {pred.prediction?.probability?.toFixed(0) || 0}%
                </div>
              </div>
            </div>

            {/* Target Range */}
            {pred.prediction?.targetRange && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 text-xs mb-3">
                <div className="text-center">
                  <div className="text-slate-500 text-[10px]">Low Target</div>
                  <div className="font-semibold text-amber-400">${pred.prediction.targetRange.low?.toFixed(2) || '—'}</div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <div className="text-center">
                  <div className="text-slate-500 text-[10px]">High Target</div>
                  <div className="font-semibold text-emerald-400">${pred.prediction.targetRange.high?.toFixed(2) || '—'}</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500 text-[10px]">Potential</div>
                  <div className="font-semibold text-cyan-400">
                    +{pred.prediction?.expectedMove?.toFixed(0) || '—'}%
                  </div>
                </div>
              </div>
            )}

            {/* Signals */}
            {topSignals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {topSignals.map((signal: any, sIdx: number) => (
                  <span key={sIdx} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-slate-800/60 text-slate-300">
                    {signal.icon || '📊'} {signal.name || signal}
                  </span>
                ))}
                {signals.length > 4 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-slate-700/50 text-slate-400">
                    +{signals.length - 4} more
                  </span>
                )}
              </div>
            )}

            {/* Reasoning */}
            {pred.prediction?.reasoning && (
              <p className="text-[10px] text-slate-400 truncate">
                {pred.prediction.reasoning.slice(0, 80)}...
              </p>
            )}

            {/* View indicator */}
            <div className="absolute bottom-2 right-2">
              <ChevronRight className={cn("w-4 h-4", style.text, "opacity-50")} />
            </div>
          </div>
        </Card>
      </Link>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/40">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tomorrow's Potential Surgers</h2>
              <p className="text-xs text-slate-500">Loading predictions...</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 bg-slate-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-400 opacity-50" />
        <p className="text-red-400">Failed to load overnight predictions</p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/40">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Tomorrow's Potential Surgers
              <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40 text-[10px]">
                PREDICTIVE AI
              </Badge>
            </h2>
            <p className="text-xs text-slate-500">
              Stocks showing overnight surge patterns • Best scanned near market close
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 bg-slate-800/40 border-slate-700/50"
            onClick={() => {
              setForceRefresh(true);
              refetch();
            }}
            disabled={isLoading}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Badge variant="outline" className="text-xs">
            {predictions.length} Predictions
          </Badge>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-violet-500/10 border-violet-500/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-violet-400" />
            <span className="text-xs text-violet-400">High Conviction</span>
          </div>
          <div className="text-2xl font-bold text-violet-300">{highConviction.length}</div>
        </Card>
        <Card className="bg-cyan-500/10 border-cyan-500/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-cyan-400">Strong Setup</span>
          </div>
          <div className="text-2xl font-bold text-cyan-300">{strongSetup.length}</div>
        </Card>
        <Card className="bg-amber-500/10 border-amber-500/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400">Watch Closely</span>
          </div>
          <div className="text-2xl font-bold text-amber-300">{watchClosely.length}</div>
        </Card>
        <Card className="bg-slate-500/10 border-slate-500/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400">Speculative</span>
          </div>
          <div className="text-2xl font-bold text-slate-300">{speculative.length}</div>
        </Card>
      </div>

      {predictions.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
          <p className="text-slate-400">No overnight predictions available</p>
          <p className="text-xs text-slate-500 mt-2">
            Best results when scanned near market close (3-4 PM ET)
          </p>
        </div>
      ) : (
        <>
          {/* High Conviction Section */}
          {highConviction.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-white">High Conviction Plays</h3>
                <Badge className="bg-violet-500/20 text-violet-400 text-[10px]">
                  70%+ Probability
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {highConviction.map((pred: any, idx: number) => renderPredictionCard(pred, idx))}
              </div>
            </div>
          )}

          {/* Strong Setup Section */}
          {strongSetup.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Strong Setups</h3>
                <Badge className="bg-cyan-500/20 text-cyan-400 text-[10px]">
                  55-70% Probability
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {strongSetup.map((pred: any, idx: number) => renderPredictionCard(pred, idx))}
              </div>
            </div>
          )}

          {/* Watch Closely Section */}
          {watchClosely.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Watch Closely</h3>
                <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">
                  40-55% Probability
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {watchClosely.map((pred: any, idx: number) => renderPredictionCard(pred, idx))}
              </div>
            </div>
          )}

          {/* Speculative Section */}
          {speculative.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-white">Speculative</h3>
                <Badge className="bg-slate-500/20 text-slate-400 text-[10px]">
                  &lt;40% Probability
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {speculative.map((pred: any, idx: number) => renderPredictionCard(pred, idx))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Info Footer */}
      <Card className="bg-slate-900/40 border-slate-800/60 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <Brain className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-xs text-slate-400">
            <p className="font-medium text-slate-300 mb-1">How Overnight Surge Prediction Works</p>
            <p>Our AI analyzes consolidation patterns, volume accumulation, after-hours activity, and sector momentum to identify stocks with high probability of significant moves the next trading day. Best used for weekly options plays on high-momentum stocks.</p>
          </div>
        </div>
      </Card>

      {data?.cached && (
        <p className="text-[9px] text-slate-600 text-center">
          Data cached {data.cacheAge}s ago • Next refresh in {Math.max(0, 600 - (data.cacheAge || 0))}s
        </p>
      )}
    </div>
  );
}

// ============================================
// BEST SETUPS SUB-PAGE (Full AI Stock Picker View)
// ============================================
function BestSetupsSubPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/trade-ideas/best-setups', 'subpage'],
    queryFn: async () => {
      const res = await fetch('/api/trade-ideas/best-setups?period=daily&limit=50');
      if (!res.ok) return { setups: [] };
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 60000,
  });

  const setups = data?.setups || [];

  // Group by grade
  const eliteSetups = setups.filter((s: any) => ['A+', 'A', 'A-'].includes(s.probabilityBand || getLetterGrade(s.confidenceScore || 50)));
  const strongSetups = setups.filter((s: any) => ['B+', 'B', 'B-'].includes(s.probabilityBand || getLetterGrade(s.confidenceScore || 50)));
  const otherSetups = setups.filter((s: any) => {
    const grade = s.probabilityBand || getLetterGrade(s.confidenceScore || 50);
    return !['A+', 'A', 'A-', 'B+', 'B', 'B-'].includes(grade);
  });

  const renderSetupCard = (setup: any) => {
    const grade = setup.probabilityBand || getLetterGrade(setup.confidenceScore || 50);
    const style = getGradeStyle(grade);
    const isLong = setup.direction === 'LONG' || setup.direction === 'long';
    const isOption = setup.assetType === 'option' || setup.optionType;

    return (
      <Link key={setup.id || `${setup.symbol}-${setup.timestamp}`} href={`/stock/${setup.symbol}`}>
        <Card className={cn(
          "relative overflow-hidden cursor-pointer transition-all duration-300",
          "bg-slate-900/60 border-slate-700/50",
          "hover:border-cyan-500/50 hover:shadow-lg hover:-translate-y-1"
        )}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                  isLong ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white" : "bg-gradient-to-br from-red-500 to-rose-600 text-white"
                )}>
                  {setup.symbol.slice(0, 2)}
                </div>
                <div>
                  <span className="font-bold text-white text-lg">{setup.symbol}</span>
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                    )}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                    {isOption && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        {setup.optionType?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <Badge className={cn("text-base font-bold px-3 py-1 border", style.bgClass, style.textClass)}>
                  {grade}
                </Badge>
                <div className="text-lg font-bold text-white mt-1">{setup.confidenceScore || 50}%</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 text-xs">
              <div className="text-center">
                <div className="text-slate-500 text-[10px]">Entry</div>
                <div className="font-semibold text-white">${setup.entryPrice?.toFixed(2) || '—'}</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              <div className="text-center">
                <div className="text-slate-500 text-[10px]">Target</div>
                <div className="font-semibold text-emerald-400">${setup.targetPrice?.toFixed(2) || '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-slate-500 text-[10px]">Stop</div>
                <div className="font-semibold text-red-400">${setup.stopLoss?.toFixed(2) || '—'}</div>
              </div>
            </div>

            {setup.catalyst && (
              <p className="mt-2 text-[10px] text-amber-400/80 truncate flex items-center gap-1">
                <Zap className="w-3 h-3" /> {setup.catalyst.slice(0, 60)}...
              </p>
            )}
          </div>
        </Card>
      </Link>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/40">
            <Star className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Best Setups</h2>
            <p className="text-xs text-slate-500">Loading AI-picked trades...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-slate-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/40">
            <Star className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Best Setups
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px]">
                AI STOCK PICKER
              </Badge>
            </h2>
            <p className="text-xs text-slate-500">Top conviction trade ideas from 6 AI engines</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Badge variant="outline">{setups.length} Setups</Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-emerald-500/10 border-emerald-500/30 p-4">
          <div className="text-xs text-emerald-400 mb-1">Elite (A Grade)</div>
          <div className="text-2xl font-bold text-emerald-300">{eliteSetups.length}</div>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/30 p-4">
          <div className="text-xs text-blue-400 mb-1">Strong (B Grade)</div>
          <div className="text-2xl font-bold text-blue-300">{strongSetups.length}</div>
        </Card>
        <Card className="bg-slate-500/10 border-slate-500/30 p-4">
          <div className="text-xs text-slate-400 mb-1">Watchlist</div>
          <div className="text-2xl font-bold text-slate-300">{otherSetups.length}</div>
        </Card>
      </div>

      {setups.length === 0 ? (
        <div className="text-center py-16">
          <Star className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
          <p className="text-slate-400">No setups available</p>
        </div>
      ) : (
        <>
          {eliteSetups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-emerald-400" /> Elite Setups (A Grade)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {eliteSetups.map(renderSetupCard)}
              </div>
            </div>
          )}

          {strongSetups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" /> Strong Setups (B Grade)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {strongSetups.map(renderSetupCard)}
              </div>
            </div>
          )}

          {otherSetups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4 text-slate-400" /> Watchlist
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherSetups.map(renderSetupCard)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// MARKET MOVERS SUB-PAGE
// ============================================
function MarketMoversSubPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/market-movers', 'subpage'],
    queryFn: async () => {
      const res = await fetch('/api/market-movers');
      if (!res.ok) return { topGainers: [], topLosers: [] };
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 60000,
  });

  const gainers = data?.topGainers || [];
  const losers = data?.topLosers || [];

  const renderMoverCard = (stock: any, isGainer: boolean) => (
    <Link key={stock.symbol} href={`/stock/${stock.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        isGainer ? "bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400/50" : "bg-red-500/10 border-red-500/30 hover:border-red-400/50"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                isGainer ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              )}>
                {stock.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="font-bold text-white">{stock.symbol}</span>
                <p className="text-[10px] text-slate-500 truncate max-w-[100px]">{stock.name || 'Stock'}</p>
              </div>
            </div>
            <div className="text-right">
              <div className={cn("text-xl font-bold", isGainer ? "text-emerald-400" : "text-red-400")}>
                {isGainer ? '+' : ''}{stock.changePercent?.toFixed(1)}%
              </div>
              <div className="text-sm font-mono text-slate-400">${stock.price?.toFixed(2)}</div>
            </div>
          </div>
          {stock.volume && (
            <div className="mt-2 pt-2 border-t border-slate-700/30">
              <span className="text-[10px] text-slate-500">Vol: {(stock.volume / 1000000).toFixed(1)}M</span>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Market Movers</h2>
            <p className="text-xs text-slate-500">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-28 bg-slate-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Market Movers
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px]">
                LIVE
              </Badge>
            </h2>
            <p className="text-xs text-slate-500">Today's biggest gainers and losers</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Top Gainers */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Top Gainers ({gainers.length})
        </h3>
        {gainers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No gainers data</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {gainers.slice(0, 12).map((stock: any) => renderMoverCard(stock, true))}
          </div>
        )}
      </div>

      {/* Top Losers */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-red-400" /> Top Losers ({losers.length})
        </h3>
        {losers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No losers data</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {losers.slice(0, 12).map((stock: any) => renderMoverCard(stock, false))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// SURGE DETECTION SUB-PAGE (Now, Early, Tomorrow combined)
// ============================================
function SurgeDetectionSubPage() {
  const [activeSubTab, setActiveSubTab] = useState<'now' | 'early' | 'tomorrow'>('now');

  // Fetch breakout candidates
  const { data: breakoutData, isLoading: breakoutLoading, refetch: refetchBreakouts } = useQuery({
    queryKey: ['/api/discovery/breakouts', 'subpage'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/breakouts');
      if (!res.ok) throw new Error('Failed to fetch surge data');
      return res.json();
    },
    staleTime: 4 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Fetch pre-breakout candidates
  const { data: preBreakoutData, isLoading: preLoading } = useQuery({
    queryKey: ['/api/discovery/pre-breakout', 'subpage'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/pre-breakout');
      if (!res.ok) throw new Error('Failed to fetch pre-breakout data');
      return res.json();
    },
    staleTime: 4 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Fetch overnight predictions
  const { data: overnightData, isLoading: overnightLoading } = useQuery({
    queryKey: ['/api/discovery/overnight-predictions', 'subpage'],
    queryFn: async () => {
      const res = await fetch('/api/discovery/overnight-predictions');
      if (!res.ok) throw new Error('Failed to fetch overnight predictions');
      return res.json();
    },
    staleTime: 8 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const allCandidates = breakoutData?.candidates || [];
  const surgeMomentum = allCandidates.filter((c: any) => c.tier === 'SURGE' || c.tier === 'MOMENTUM');
  const setupTier = allCandidates.filter((c: any) => c.tier === 'SETUP' || c.score >= 50);
  const surges = surgeMomentum.length > 0 ? surgeMomentum : setupTier.length > 0 ? setupTier : allCandidates;
  const earlySetups = preBreakoutData?.candidates || [];
  const tomorrowPlays = overnightData?.predictions || [];

  const isLoading = activeSubTab === 'now' ? breakoutLoading : activeSubTab === 'early' ? preLoading : overnightLoading;

  const renderSurgeCard = (stock: any, type: string) => (
    <Link key={`${stock.symbol}-${type}`} href={`/stock/${stock.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        stock.tier === 'SURGE' ? "bg-rose-500/10 border-rose-500/30 hover:border-rose-400/50" :
        stock.tier === 'MOMENTUM' ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-400/50" :
        "bg-blue-500/10 border-blue-500/30 hover:border-blue-400/50"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                stock.tier === 'SURGE' ? "bg-rose-500/20 text-rose-400" :
                stock.tier === 'MOMENTUM' ? "bg-amber-500/20 text-amber-400" :
                "bg-blue-500/20 text-blue-400"
              )}>
                {stock.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="font-bold text-white">{stock.symbol}</span>
                <Badge className={cn(
                  "ml-2 text-[9px]",
                  stock.tier === 'SURGE' ? "bg-rose-500/20 text-rose-400" :
                  stock.tier === 'MOMENTUM' ? "bg-amber-500/20 text-amber-400" :
                  "bg-blue-500/20 text-blue-400"
                )}>
                  {stock.tier}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <div className={cn("text-xl font-bold", stock.change > 0 ? "text-emerald-400" : "text-red-400")}>
                {stock.change > 0 ? '+' : ''}{stock.change?.toFixed(1)}%
              </div>
              <div className="text-sm font-mono text-slate-400">${stock.price?.toFixed(2)}</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 truncate">{stock.reason}</p>
          {stock.score && (
            <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500" style={{ width: `${stock.score}%` }} />
            </div>
          )}
        </div>
      </Card>
    </Link>
  );

  const renderTomorrowCard = (pred: any) => (
    <Link key={pred.symbol} href={`/stock/${pred.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        pred.prediction?.tier === 'HIGH_CONVICTION' ? "bg-violet-500/10 border-violet-500/30 hover:border-violet-400/50" :
        pred.prediction?.tier === 'STRONG_SETUP' ? "bg-cyan-500/10 border-cyan-500/30 hover:border-cyan-400/50" :
        "bg-slate-500/10 border-slate-500/30 hover:border-slate-400/50"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                pred.prediction?.tier === 'HIGH_CONVICTION' ? "bg-violet-500/20 text-violet-400" : "bg-cyan-500/20 text-cyan-400"
              )}>
                {pred.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="font-bold text-white">{pred.symbol}</span>
                {pred.prediction?.tier === 'HIGH_CONVICTION' && <Sparkles className="w-3 h-3 text-violet-400 inline ml-1" />}
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-xl font-bold",
                pred.prediction?.tier === 'HIGH_CONVICTION' ? "text-violet-400" : "text-cyan-400"
              )}>
                {pred.prediction?.probability?.toFixed(0)}%
              </div>
              <div className="text-sm font-mono text-slate-400">${pred.currentPrice?.toFixed(2)}</div>
            </div>
          </div>
          {pred.prediction?.targetRange && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Target: ${pred.prediction.targetRange.low?.toFixed(2)} - ${pred.prediction.targetRange.high?.toFixed(2)}</span>
            </div>
          )}
          {pred.signals && pred.signals.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {pred.signals.slice(0, 3).map((signal: any, idx: number) => (
                <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">
                  {signal.name || signal}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Surge Detection
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px]">
                REAL-TIME
              </Badge>
            </h2>
            <p className="text-xs text-slate-500">Momentum & pre-breakout detection system</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchBreakouts()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-800/40 rounded-lg w-fit">
        <Button
          variant={activeSubTab === 'now' ? 'default' : 'ghost'}
          size="sm"
          className={cn("h-8", activeSubTab === 'now' && "bg-amber-600")}
          onClick={() => setActiveSubTab('now')}
        >
          <Flame className="w-4 h-4 mr-2" /> Surging Now ({surges.length})
        </Button>
        <Button
          variant={activeSubTab === 'early' ? 'default' : 'ghost'}
          size="sm"
          className={cn("h-8", activeSubTab === 'early' && "bg-blue-600")}
          onClick={() => setActiveSubTab('early')}
        >
          <TrendingUp className="w-4 h-4 mr-2" /> Early Signals ({earlySetups.length})
        </Button>
        <Button
          variant={activeSubTab === 'tomorrow' ? 'default' : 'ghost'}
          size="sm"
          className={cn("h-8", activeSubTab === 'tomorrow' && "bg-violet-600")}
          onClick={() => setActiveSubTab('tomorrow')}
        >
          <Sparkles className="w-4 h-4 mr-2" /> Tomorrow ({tomorrowPlays.length})
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-slate-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : activeSubTab === 'now' ? (
        surges.length === 0 ? (
          <div className="text-center py-16">
            <Zap className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
            <p className="text-slate-400">No surges detected right now</p>
            <p className="text-xs text-slate-500 mt-2">Scanning market for momentum signals...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {surges.map((stock: any) => renderSurgeCard(stock, 'now'))}
          </div>
        )
      ) : activeSubTab === 'early' ? (
        earlySetups.length === 0 ? (
          <div className="text-center py-16">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
            <p className="text-slate-400">No early signals detected</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {earlySetups.map((stock: any) => renderSurgeCard(stock, 'early'))}
          </div>
        )
      ) : (
        tomorrowPlays.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
            <p className="text-slate-400">No overnight predictions available</p>
            <p className="text-xs text-slate-500 mt-2">Best scanned near market close (3-4 PM ET)</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tomorrowPlays.map((pred: any) => renderTomorrowCard(pred))}
          </div>
        )
      )}
    </div>
  );
}

// ============================================
// CONVERGENCE SUB-PAGE
// ============================================
function ConvergenceSubPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/convergence/opportunities', 'subpage'],
    queryFn: async () => {
      const res = await fetch('/api/convergence/opportunities');
      if (!res.ok) throw new Error('Failed to fetch convergence data');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  const opportunities = data?.opportunities || [];
  const criticalCount = data?.critical || 0;
  const highCount = data?.high || 0;

  const renderOpportunityCard = (opp: any) => (
    <Link key={opp.symbol} href={`/stock/${opp.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        opp.urgency === 'critical' ? "bg-red-500/10 border-red-500/30 hover:border-red-400/50" :
        opp.urgency === 'high' ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-400/50" :
        "bg-purple-500/10 border-purple-500/30 hover:border-purple-400/50"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                opp.urgency === 'critical' ? "bg-red-500/20 text-red-400" :
                opp.urgency === 'high' ? "bg-amber-500/20 text-amber-400" :
                "bg-purple-500/20 text-purple-400"
              )}>
                {opp.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="font-bold text-white">{opp.symbol}</span>
                <Badge className={cn(
                  "ml-2 text-[9px]",
                  opp.direction === 'bullish' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                )}>
                  {opp.direction?.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-xl font-bold",
                opp.convergenceScore >= 80 ? "text-emerald-400" :
                opp.convergenceScore >= 65 ? "text-amber-400" : "text-white"
              )}>
                {opp.convergenceScore}%
              </div>
              <Badge className={cn(
                "text-[9px]",
                opp.urgency === 'critical' ? "bg-red-500/20 text-red-400" :
                opp.urgency === 'high' ? "bg-amber-500/20 text-amber-400" :
                "bg-slate-500/20 text-slate-400"
              )}>
                {opp.urgency?.toUpperCase()}
              </Badge>
            </div>
          </div>
          {opp.signals && opp.signals.length > 0 && (
            <div className="space-y-1">
              {opp.signals.slice(0, 4).map((signal: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <span>{signal.source}: {signal.description?.slice(0, 40)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/40">
            <Target className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Convergence Signals</h2>
            <p className="text-xs text-slate-500">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-slate-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 border border-purple-500/40">
            <Target className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Convergence Signals
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40 text-[10px]">
                MULTI-SOURCE
              </Badge>
            </h2>
            <p className="text-xs text-slate-500">When multiple data sources agree, something big is brewing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          {criticalCount > 0 && <Badge className="bg-red-500/20 text-red-400">{criticalCount} Critical</Badge>}
          {highCount > 0 && <Badge className="bg-amber-500/20 text-amber-400">{highCount} High</Badge>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-red-500/10 border-red-500/30 p-4">
          <div className="text-xs text-red-400 mb-1">Critical Urgency</div>
          <div className="text-2xl font-bold text-red-300">{criticalCount}</div>
        </Card>
        <Card className="bg-amber-500/10 border-amber-500/30 p-4">
          <div className="text-xs text-amber-400 mb-1">High Urgency</div>
          <div className="text-2xl font-bold text-amber-300">{highCount}</div>
        </Card>
        <Card className="bg-purple-500/10 border-purple-500/30 p-4">
          <div className="text-xs text-purple-400 mb-1">Total Opportunities</div>
          <div className="text-2xl font-bold text-purple-300">{opportunities.length}</div>
        </Card>
      </div>

      {opportunities.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
          <p className="text-slate-400">No convergence signals detected</p>
          <p className="text-xs text-slate-500 mt-2">Monitoring news, options flow, insider activity, and sector momentum...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {opportunities.map(renderOpportunityCard)}
        </div>
      )}

      <Card className="bg-slate-900/40 border-slate-800/60 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xs text-slate-400">
            <p className="font-medium text-slate-300 mb-1">How Convergence Detection Works</p>
            <p>Our system monitors multiple data sources (news sentiment, options flow, insider trades, sector momentum) and alerts when 2+ sources align on the same symbol within a short timeframe. Higher urgency = more sources converging.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================
// HOT ATTENTION SUB-PAGE
// ============================================
function HotAttentionSubPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/convergence/hot-symbols', 'subpage'],
    queryFn: async () => {
      const res = await fetch('/api/convergence/hot-symbols?limit=30');
      if (!res.ok) throw new Error('Failed to fetch hot symbols');
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  const symbols = data?.symbols || [];
  const convergingSymbols = symbols.filter((s: any) => s.isConverging);
  const watchingSymbols = symbols.filter((s: any) => !s.isConverging);

  const renderHotCard = (item: any) => (
    <Link key={item.symbol} href={`/stock/${item.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        item.isConverging ? "bg-orange-500/10 border-orange-500/30 hover:border-orange-400/50" : "bg-slate-500/10 border-slate-500/30 hover:border-slate-400/50"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                item.isConverging ? "bg-orange-500/20 text-orange-400" : "bg-slate-500/20 text-slate-400"
              )}>
                {item.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="font-bold text-white">{item.symbol}</span>
                {item.isConverging && (
                  <Badge className="ml-2 text-[9px] bg-orange-500/20 text-orange-400">CONVERGING</Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-xl font-bold",
                item.heatScore >= 5 ? "text-red-400" :
                item.heatScore >= 3 ? "text-orange-400" : "text-slate-400"
              )}>
                {item.heatScore?.toFixed(1)}
              </div>
              <span className="text-[10px] text-slate-500">heat score</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>{item.distinctSources} sources</span>
            <span>{item.recentTouches1h} hits/hr</span>
            <span>{item.totalSignals} signals</span>
          </div>
          {/* Heat bar */}
          <div className="mt-2 h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full",
                item.heatScore >= 5 ? "bg-gradient-to-r from-orange-500 to-red-500" :
                item.heatScore >= 3 ? "bg-gradient-to-r from-amber-500 to-orange-500" :
                "bg-slate-500"
              )}
              style={{ width: `${Math.min(100, (item.heatScore || 0) * 10)}%` }}
            />
          </div>
        </div>
      </Card>
    </Link>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Hot Attention</h2>
            <p className="text-xs text-slate-500">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-slate-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/40">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Hot Attention
              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/40 text-[10px]">
                HEAT MAP
              </Badge>
            </h2>
            <p className="text-xs text-slate-500">Symbols flagged by multiple scanners - watch for moves</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Badge variant="outline">{data?.convergingCount || 0} Converging</Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-orange-500/10 border-orange-500/30 p-4">
          <div className="text-xs text-orange-400 mb-1">Converging</div>
          <div className="text-2xl font-bold text-orange-300">{convergingSymbols.length}</div>
        </Card>
        <Card className="bg-slate-500/10 border-slate-500/30 p-4">
          <div className="text-xs text-slate-400 mb-1">Watching</div>
          <div className="text-2xl font-bold text-slate-300">{watchingSymbols.length}</div>
        </Card>
        <Card className="bg-red-500/10 border-red-500/30 p-4">
          <div className="text-xs text-red-400 mb-1">Highest Heat</div>
          <div className="text-2xl font-bold text-red-300">{symbols[0]?.heatScore?.toFixed(1) || '0'}</div>
        </Card>
      </div>

      {symbols.length === 0 ? (
        <div className="text-center py-16">
          <Flame className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
          <p className="text-slate-400">No hot symbols detected</p>
        </div>
      ) : (
        <>
          {convergingSymbols.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" /> Converging Signals ({convergingSymbols.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {convergingSymbols.map(renderHotCard)}
              </div>
            </div>
          )}

          {watchingSymbols.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4 text-slate-400" /> On Radar ({watchingSymbols.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {watchingSymbols.map(renderHotCard)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// SURGE DETECTION CARD
// ============================================
function SurgeDetectionCard({ onViewTomorrow }: { onViewTomorrow?: () => void }) {
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

      {/* View All button for Tomorrow tab */}
      {tab === 'tomorrow' && tomorrowPlays.length > 0 && onViewTomorrow && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 h-7 text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
          onClick={onViewTomorrow}
        >
          View All Predictions <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}

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
function ConvergenceSignalsCard({ onViewAll }: { onViewAll?: () => void }) {
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
  const status = data?.status || 'scanning';
  const activeSignalCount = data?.activeSignalCount || 0;
  const hotSymbols = data?.hotSymbols || [];

  return (
    <Card className="bg-slate-900/40 border-slate-800/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">Convergence</span>
          {status === 'active' && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
          {status === 'monitoring' && (
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          )}
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
          {activeSignalCount > 0 && criticalCount === 0 && highCount === 0 && (
            <Badge className="bg-slate-700 text-slate-400 text-[10px]">
              {activeSignalCount} signals
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
            <p>{status === 'monitoring' ? 'Monitoring signals...' : 'No convergence signals'}</p>
            <p className="text-[10px] mt-1">
              {activeSignalCount > 0
                ? `${activeSignalCount} signal${activeSignalCount > 1 ? 's' : ''} tracked (need 2+ sources to converge)`
                : 'Watching news, options, insiders, sectors...'}
            </p>
            {hotSymbols.length > 0 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-[10px] text-slate-600">Hot:</span>
                {hotSymbols.map((s: any) => (
                  <Link key={s.symbol} href={`/stock/${s.symbol}`}>
                    <span className="text-[10px] font-mono text-cyan-400 hover:underline cursor-pointer">
                      {s.symbol}
                    </span>
                  </Link>
                ))}
              </div>
            )}
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
      {onViewAll && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 h-7 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
          onClick={onViewAll}
        >
          View All Convergence <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
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
function HotSymbolsCard({ onViewAll }: { onViewAll?: () => void }) {
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
      {onViewAll && symbols.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={onViewAll}
        >
          View All Hot Symbols <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </Card>
  );
}

// ============================================
// IDEA DRIVER HELPER - Explains what's propelling the trade
// ============================================
interface IdeaDriver {
  type: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}

function getIdeaDrivers(idea: TradeIdea): IdeaDriver[] {
  const drivers: IdeaDriver[] = [];
  const source = (idea.source || '').toLowerCase();
  const catalyst = (idea.catalyst || '').toLowerCase();
  const signals = idea.qualitySignals || [];

  // Primary driver based on source
  const sourceDriverMap: Record<string, IdeaDriver> = {
    'ai_analysis': { type: 'ai', label: 'AI', icon: '🤖', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    'ai': { type: 'ai', label: 'AI', icon: '🤖', color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    'quant_signal': { type: 'quant', label: 'Quant', icon: '📊', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
    'quant': { type: 'quant', label: 'Quant', icon: '📊', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
    'chart_analysis': { type: 'technical', label: 'Chart', icon: '📈', color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    'surge_detection': { type: 'momentum', label: 'Surge', icon: '🔥', color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
    'market_scanner': { type: 'momentum', label: 'Mover', icon: '📡', color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
    'flow': { type: 'flow', label: 'Flow', icon: '💰', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
    'options_flow': { type: 'flow', label: 'Options', icon: '💰', color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
    'social_sentiment': { type: 'sentiment', label: 'Social', icon: '💬', color: 'text-pink-400', bgColor: 'bg-pink-500/20' },
    'convergence': { type: 'multi', label: 'Multi-Signal', icon: '🎯', color: 'text-violet-400', bgColor: 'bg-violet-500/20' },
    'bot_screener': { type: 'screener', label: 'Screener', icon: '🔍', color: 'text-teal-400', bgColor: 'bg-teal-500/20' },
    'watchlist': { type: 'watchlist', label: 'Watchlist', icon: '⭐', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
    'earnings_play': { type: 'catalyst', label: 'Earnings', icon: '📅', color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' },
  };

  // Add primary source driver
  const primaryDriver = sourceDriverMap[source];
  if (primaryDriver) {
    drivers.push(primaryDriver);
  }

  // Check for news catalyst
  if (idea.isNewsCatalyst || catalyst.includes('news') || catalyst.includes('announcement') || catalyst.includes('breaking')) {
    drivers.push({ type: 'news', label: 'News', icon: '📰', color: 'text-rose-400', bgColor: 'bg-rose-500/20' });
  }

  // Check for earnings catalyst
  if (idea.earningsBeat !== null || catalyst.includes('earning') || catalyst.includes('eps') || catalyst.includes('revenue')) {
    const beatMiss = idea.earningsBeat ? 'Beat' : idea.earningsBeat === false ? 'Miss' : 'Earnings';
    drivers.push({ type: 'earnings', label: beatMiss, icon: '📊', color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' });
  }

  // Check signals for technical patterns
  const technicalPatterns = ['rsi', 'macd', 'breakout', 'support', 'resistance', 'volume', 'momentum', 'trend'];
  const hasTechnical = signals.some(s => technicalPatterns.some(p => s.toLowerCase().includes(p)));
  if (hasTechnical && !drivers.find(d => d.type === 'technical')) {
    drivers.push({ type: 'technical', label: 'Technical', icon: '📈', color: 'text-blue-400', bgColor: 'bg-blue-500/20' });
  }

  // Check for insider/pre-market indicators
  if (catalyst.includes('insider') || catalyst.includes('pre-market') || catalyst.includes('premarket')) {
    drivers.push({ type: 'insider', label: 'Insider', icon: '🔐', color: 'text-amber-400', bgColor: 'bg-amber-500/20' });
  }

  // Default if no drivers found
  if (drivers.length === 0) {
    drivers.push({ type: 'analysis', label: 'Analysis', icon: '🔬', color: 'text-slate-400', bgColor: 'bg-slate-500/20' });
  }

  return drivers.slice(0, 3); // Max 3 driver tags
}

// ============================================
// COMPACT TRADE IDEA CARD (Landing Page Style)
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
  const confidence = idea.confidenceScore || 50;

  // Get actual drivers from idea data
  const ideaDrivers = useMemo(() => getIdeaDrivers(idea), [idea]);

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
        description: `${idea.symbol} shared to AI Quant Options channel`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to send",
        description: "Could not share to Discord.",
        variant: "destructive",
      });
    },
  });

  // Get top quality signals for display
  const topSignals = useMemo(() => {
    return (idea.qualitySignals || []).slice(0, 4);
  }, [idea.qualitySignals]);

  // Calculate R:R
  const riskReward = useMemo(() => {
    if (idea.targetPrice && idea.entryPrice && idea.stopLoss) {
      const reward = Math.abs(idea.targetPrice - idea.entryPrice);
      const risk = Math.abs(idea.entryPrice - idea.stopLoss);
      if (risk > 0) return (reward / risk).toFixed(1);
    }
    return idea.riskRewardRatio?.toFixed(1) || '—';
  }, [idea]);

  return (
    <Card className={cn(
      "bg-slate-900/60 border-slate-700/50 overflow-hidden transition-all",
      expanded ? "ring-1 ring-cyan-500/50" : "hover:border-slate-600"
    )}>
      {/* Compact Card Content */}
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        {/* Header Row: Symbol + Direction Badge + Confidence */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs",
              isLong ? "bg-gradient-to-br from-emerald-500 to-green-600" : "bg-gradient-to-br from-red-500 to-rose-600",
              "text-white"
            )}>
              {idea.symbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{idea.symbol}</span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                )}>
                  {isLong ? 'BULLISH' : 'BEARISH'}
                </span>
                {isOption && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                    {idea.optionType?.toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500">{idea.holdingPeriod || 'Swing'} • Grade {grade}</span>
            </div>
          </div>
          <div className="text-right">
            <div className={cn(
              "text-xl font-bold",
              confidence >= 75 ? "text-emerald-400" : confidence >= 60 ? "text-amber-400" : "text-slate-400"
            )}>
              {confidence}%
            </div>
            <span className="text-[9px] text-slate-500">Confidence</span>
          </div>
        </div>

        {/* Driver Tags - What's propelling this idea */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ideaDrivers.map((driver) => (
            <span key={driver.type} className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium",
              driver.bgColor, driver.color
            )}>
              <span>{driver.icon}</span>
              <span>{driver.label}</span>
            </span>
          ))}
          {topSignals.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-slate-700/50 text-slate-300">
              +{topSignals.length} signals
            </span>
          )}
        </div>

        {/* Price Levels - Compact Row */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 text-xs">
          <div className="text-center">
            <div className="text-slate-500 text-[10px]">Entry</div>
            <div className="font-semibold text-white">${idea.entryPrice?.toFixed(2) || '—'}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-500 text-[10px]">Target</div>
            <div className="font-semibold text-emerald-400">${idea.targetPrice?.toFixed(2) || '—'}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-500 text-[10px]">Stop</div>
            <div className="font-semibold text-red-400">${idea.stopLoss?.toFixed(2) || '—'}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-500 text-[10px]">R:R</div>
            <div className="font-semibold text-cyan-400">1:{riskReward}</div>
          </div>
        </div>

        {/* Expand hint */}
        <div className="flex items-center justify-center mt-2 pt-2 border-t border-slate-800/50">
          <ChevronRight className={cn(
            "w-4 h-4 text-slate-500 transition-transform",
            expanded && "rotate-90"
          )} />
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-slate-800/50 p-4 space-y-3 bg-slate-950/40">
          {/* Options Details */}
          {isOption && (idea.strikePrice || idea.expiryDate) && (
            <div className="flex items-center gap-4 p-2 bg-slate-800/30 rounded-lg text-xs">
              <div className="flex items-center gap-1">
                <Target className="w-3 h-3 text-slate-500" />
                <span className="text-slate-400">Strike:</span>
                <span className="font-mono text-white">${idea.strikePrice?.toFixed(2) || '—'}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span className="text-slate-400">Exp:</span>
                <span className="font-mono text-white">{idea.expiryDate || '—'}</span>
              </div>
            </div>
          )}

          {/* Analysis */}
          {idea.analysis && (
            <div>
              <h4 className="text-[10px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1">
                <Brain className="w-3 h-3" /> Analysis
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">{idea.analysis}</p>
            </div>
          )}

          {/* Catalyst */}
          {idea.catalyst && (
            <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <h4 className="text-[10px] font-semibold text-amber-400 uppercase mb-1 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Catalyst
              </h4>
              <p className="text-xs text-amber-300">{idea.catalyst}</p>
            </div>
          )}

          {/* Source Engine */}
          {idea.source && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Generated by:</span>
              <span className="font-medium text-slate-300">{idea.source.replace(/_/g, ' ').toUpperCase()}</span>
              {idea.timestamp && (
                <span className="text-slate-600">• {new Date(idea.timestamp).toLocaleDateString()}</span>
              )}
            </div>
          )}

          {/* Quality Signals */}
          {idea.qualitySignals && idea.qualitySignals.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {idea.qualitySignals.slice(0, 6).map((signal, idx) => (
                <Badge key={idx} variant="outline" className="text-[9px] bg-slate-800/40 px-1.5 py-0.5">
                  {signal}
                </Badge>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Link href={`/stock/${idea.symbol}`} className="flex-1">
              <Button size="sm" className="w-full h-8 bg-cyan-600 hover:bg-cyan-500 text-xs">
                <Eye className="w-3 h-3 mr-1" /> Full Analysis
              </Button>
            </Link>
            <Button
              size="sm"
              variant="outline"
              className="h-8 bg-indigo-600/20 border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-400 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                shareToDiscord.mutate();
              }}
              disabled={shareToDiscord.isPending}
            >
              <SiDiscord className="w-3 h-3" />
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

  // ============================================
  // DEDUPLICATION & EXPIRY FILTER LOGIC
  // Max 2 ideas per symbol/direction/type, filter expired
  // ============================================
  const deduplicateAndLimit = (ideas: TradeIdea[], maxPerGroup: number = 2): TradeIdea[] => {
    const now = new Date();

    // First, filter out expired options
    const nonExpired = ideas.filter(idea => {
      // If it has an expiry date and it's in the past, filter it out
      if (idea.expiryDate) {
        const expiryDate = new Date(idea.expiryDate);
        if (expiryDate < now) return false;
      }
      // Also filter out ideas older than 48 hours for day trades
      if (idea.holdingPeriod === 'day' && idea.timestamp) {
        const ideaTime = new Date(idea.timestamp);
        const hoursSince = (now.getTime() - ideaTime.getTime()) / (1000 * 60 * 60);
        if (hoursSince > 48) return false;
      }
      // Filter out ideas older than 7 days for swing trades
      if ((idea.holdingPeriod === 'swing' || !idea.holdingPeriod) && idea.timestamp) {
        const ideaTime = new Date(idea.timestamp);
        const daysSince = (now.getTime() - ideaTime.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) return false;
      }
      return true;
    });

    // Group by symbol + direction + optionType (for options)
    const groups = new Map<string, TradeIdea[]>();
    for (const idea of nonExpired) {
      const direction = (idea.direction || 'long').toLowerCase();
      const optType = idea.optionType || 'stock';
      const key = `${idea.symbol}-${direction}-${optType}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(idea);
    }

    // For each group, sort by confidence and take top N
    const result: TradeIdea[] = [];
    for (const [_key, groupIdeas] of groups) {
      // Sort by confidence descending
      groupIdeas.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
      // Take only top maxPerGroup
      result.push(...groupIdeas.slice(0, maxPerGroup));
    }

    // Re-sort final result by confidence
    result.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

    return result;
  };

  // Filter helpers for tabs - with deduplication
  const stockIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i =>
      i.assetType === 'stock' || (!i.assetType && !i.optionType)
    );
    return deduplicateAndLimit(filtered, 2);
  }, [tradeIdeas]);

  const optionIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i => i.assetType === 'option' || i.optionType);
    return deduplicateAndLimit(filtered, 2);
  }, [tradeIdeas]);

  const cryptoIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i => i.assetType === 'crypto');
    return deduplicateAndLimit(filtered, 2);
  }, [tradeIdeas]);

  const futuresIdeas = useMemo(() => {
    const filtered = tradeIdeas.filter(i => i.assetType === 'future');
    return deduplicateAndLimit(filtered, 2);
  }, [tradeIdeas]);

  // All ideas - deduplicated (for "All Ideas" tab)
  const allIdeasDeduplicated = useMemo(() => {
    return deduplicateAndLimit(tradeIdeas, 2);
  }, [tradeIdeas]);

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
          <div className="overflow-x-auto pb-2 -mx-4 px-4 scrollbar-thin scrollbar-thumb-slate-700">
            <TabsList className="bg-slate-900/60 border border-slate-800/60 p-1 inline-flex min-w-max">
              <TabsTrigger value="overview" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
                <PieChart className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="ideas" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
                <Layers className="w-4 h-4 mr-2" />
                All Ideas
              </TabsTrigger>
              <TabsTrigger value="setups" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white">
                <Star className="w-4 h-4 mr-2" />
                Best Setups
              </TabsTrigger>
              <TabsTrigger value="surges" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                <Zap className="w-4 h-4 mr-2" />
                Surges
              </TabsTrigger>
              <TabsTrigger value="movers" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                <Flame className="w-4 h-4 mr-2" />
                Movers
              </TabsTrigger>
              <TabsTrigger value="convergence" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                <Target className="w-4 h-4 mr-2" />
                Convergence
              </TabsTrigger>
              <TabsTrigger value="hot" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                <Flame className="w-4 h-4 mr-2" />
                Hot
              </TabsTrigger>
              <TabsTrigger value="tomorrow" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
                <Sparkles className="w-4 h-4 mr-2" />
                Tomorrow
              </TabsTrigger>
              <TabsTrigger value="portfolio" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
                <PieChart className="w-4 h-4 mr-2" />
                Portfolio
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* TOP CONVICTION - A/A+ Plays Only */}
            <TopConvictionSection ideas={allIdeasDeduplicated} />

            {/* Stats Cards */}
            <StatsOverview ideas={tradeIdeas} />

            {/* Quick View Cards - Row 1 */}
            <div className="grid grid-cols-3 gap-4">
              <BestSetupsCard onViewAll={() => setActiveTab('setups')} />
              <MarketMoversCard onViewAll={() => setActiveTab('movers')} />
              <SurgeDetectionCard onViewTomorrow={() => setActiveTab('surges')} />
            </div>

            {/* Quick View Cards - Row 2: Convergence & Pre-Move Detection */}
            <div className="grid grid-cols-2 gap-4">
              <ConvergenceSignalsCard onViewAll={() => setActiveTab('convergence')} />
              <HotSymbolsCard onViewAll={() => setActiveTab('hot')} />
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60"
                onClick={() => setActiveTab('ideas')}
              >
                <Layers className="w-4 h-4 mr-1.5" />
                All Ideas
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-400"
                onClick={() => setActiveTab('setups')}
              >
                <Star className="w-4 h-4 mr-1.5" />
                Setups
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20 text-orange-400"
                onClick={() => setActiveTab('surges')}
              >
                <Zap className="w-4 h-4 mr-1.5" />
                Surges
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400"
                onClick={() => setActiveTab('movers')}
              >
                <Flame className="w-4 h-4 mr-1.5" />
                Movers
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 text-purple-400"
                onClick={() => setActiveTab('convergence')}
              >
                <Target className="w-4 h-4 mr-1.5" />
                Convergence
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-red-500/10 border-red-500/30 hover:bg-red-500/20 text-red-400"
                onClick={() => setActiveTab('hot')}
              >
                <Flame className="w-4 h-4 mr-1.5" />
                Hot
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-violet-500/10 border-violet-500/30 hover:bg-violet-500/20 text-violet-400"
                onClick={() => setActiveTab('tomorrow')}
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                Tomorrow
              </Button>
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
                  {allIdeasDeduplicated.slice(0, 5).map((idea) => (
                    <TradeIdeaRow key={idea.id || `${idea.symbol}-${idea.timestamp}`} idea={idea} />
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* All Trade Ideas Tab */}
          <TabsContent value="ideas" className="mt-6">
            <TradeIdeasList ideas={allIdeasDeduplicated} title="All Trade Ideas" />
          </TabsContent>

          {/* Best Setups Tab - AI Stock Picker */}
          <TabsContent value="setups" className="mt-6">
            <BestSetupsSubPage />
          </TabsContent>

          {/* Surge Detection Tab - Now/Early/Tomorrow */}
          <TabsContent value="surges" className="mt-6">
            <SurgeDetectionSubPage />
          </TabsContent>

          {/* Market Movers Tab */}
          <TabsContent value="movers" className="mt-6">
            <MarketMoversSubPage />
          </TabsContent>

          {/* Convergence Tab */}
          <TabsContent value="convergence" className="mt-6">
            <ConvergenceSubPage />
          </TabsContent>

          {/* Hot Attention Tab */}
          <TabsContent value="hot" className="mt-6">
            <HotAttentionSubPage />
          </TabsContent>

          {/* Tomorrow's Surgers Tab - Overnight Predictions */}
          <TabsContent value="tomorrow" className="mt-6">
            <TomorrowSurgersSubPage />
          </TabsContent>

          {/* Portfolio Tab - Broker Import */}
          <TabsContent value="portfolio" className="mt-6">
            <BrokerImport />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
