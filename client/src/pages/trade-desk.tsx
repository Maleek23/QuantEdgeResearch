/**
 * AI Trade Desk - Redesigned with Sub-Pages
 * Clean architecture with dedicated sections for different trading views
 */

import { useState, useMemo, useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMarketPoll, POLL } from "@/hooks/use-market-poll";
import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SiDiscord } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { componentStyles } from "@/lib/design-tokens";

// ============================================
// SESSION DETECTION — "FRIDAY SESSION" / "FRESH SCAN" / "WEEKEND"
// ============================================
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
function getIdeaSessionBadge(timestamp: string | undefined): { label: string; cls: string } | null {
  if (!timestamp) return null;
  const ideaDate = new Date(timestamp);
  const ideaET = new Date(ideaDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const ideaDay = ideaET.getDay();
  const nowDay = nowET.getDay();

  // Same calendar day = fresh
  if (ideaET.toDateString() === nowET.toDateString()) return null;

  // If idea is from Friday and we're on weekend/Monday
  if (ideaDay === 5 && (nowDay === 0 || nowDay === 6 || nowDay === 1)) {
    return { label: 'FRIDAY', cls: componentStyles.badge.warning };
  }

  // If idea is from a previous day
  const daysDiff = Math.floor((nowET.getTime() - ideaET.getTime()) / (24 * 60 * 60 * 1000));
  if (daysDiff >= 1) {
    return { label: `${daysDiff}D OLD`, cls: componentStyles.badge.default };
  }

  return null;
}
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";
import { displayedScore, displayedScoreBarPct, isHighConviction, displayedGrade, gradeColorClass } from "@/lib/conviction-display";
import { apiRequest } from "@/lib/queryClient";
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
  Gem,
  Download,
  Radar,
  MessageCircle,
  Lock,
  Microscope,
  Newspaper,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TradeIdea, ConvergenceAnalysis } from "@shared/schema";
import { getGradeStyle } from "@shared/grading";
import BrokerImport from "@/components/broker-import";
import { IndexLottoScanner } from "@/components/index-lotto-scanner";
import { DeepAnalysisPanel } from "@/components/deep-analysis-panel";
import { TradeIdeaDetailV2 } from "@/components/trade-idea-detail-v2";
import { TradePerformanceStats } from "@/components/trade-performance-stats";
import { FlowLevelsPanel } from "@/components/flow-levels-panel";
import { StrategyLab } from "@/components/strategy-lab";
import { TradeIdeasPanel } from "@/components/trade-desk/trade-ideas-panel";
import PreMarketGappersCard from "@/components/trade-desk/PreMarketGappersCard";

// Relative time helper for freshness display
function getRelativeTime(timestamp: string | Date): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isStale(timestamp: string | Date, hoursThreshold = 4): boolean {
  return (Date.now() - new Date(timestamp).getTime()) > hoursThreshold * 60 * 60 * 1000;
}

// ============================================
// MARKET PULSE HEADER
// ============================================
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
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--trade-bullish)]" />
        <span className="text-[10px] font-medium text-[var(--trade-bullish)]">LIVE</span>
      </div>
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
        <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-[var(--trade-neutral)]/40">
          <Star className="w-5 h-5 text-[var(--trade-neutral)]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            Top Conviction
            <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] border-[var(--trade-neutral)]/40 text-[10px]">
              A/A+ ONLY
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground">Highest grade plays - don't miss these</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {topConvictionPlays.map((idea) => {
          // U2: canonical letter grade — engine band first, conviction score next, then legacy.
          const grade = displayedGrade(idea as any);
          const numericScore = displayedScore(idea as any);
          const style = getGradeStyle(grade);
          const isLong = idea.direction === 'LONG' || idea.direction === 'long';
          const isOption = idea.assetType === 'option' || idea.optionType;

          // Calculate potential profit with null safety
          const safeEntry = safeNumber(idea.entryPrice, 1);
          const potentialProfit = idea.targetPrice && idea.entryPrice
            ? ((safeNumber(idea.targetPrice) - safeEntry) / safeEntry * 100)
            : 0;

          return (
            <Link key={idea.id || `${idea.symbol}-${idea.timestamp}`} href={`/terminal/${idea.symbol}`}>
              <Card className={cn(
                "relative overflow-hidden cursor-pointer transition-all duration-300",
                "bg-gradient-to-br from-amber-500/5 via-card/80 to-card/90",
                "border-[var(--trade-neutral)]/30 hover:border-amber-400/60",
                "hover:shadow-lg hover:shadow-amber-500/10",
                "hover:-translate-y-1",
                idea.timestamp && isStale(idea.timestamp) && "opacity-70"
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
                          ? "bg-gradient-to-br from-emerald-500 to-green-600 text-foreground"
                          : "bg-gradient-to-br from-red-500 to-rose-600 text-foreground"
                      )}>
                        {idea.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <span className="font-bold text-foreground text-lg">{idea.symbol}</span>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            isLong ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
                          )}>
                            {isLong ? 'LONG' : 'SHORT'}
                          </span>
                          {isOption && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                              {idea.optionType?.toUpperCase()}
                            </span>
                          )}
                          {(idea as any).hasDirectionConflict && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400" title="Conflicting signals: both LONG and SHORT ideas exist for this ticker">
                              ⚡ CONFLICT
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

                  {/* Grade + Target — U2: grade is the headline, numeric score in tooltip */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div
                      className="text-center p-2 rounded-lg bg-muted"
                      title={`Conviction score ${numericScore} (${grade})`}
                    >
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Grade</div>
                      <div className={cn(
                        "text-xl font-bold",
                        grade.startsWith('A') ? "text-[var(--trade-bullish)]" : "text-[var(--trade-neutral)]"
                      )}>
                        {grade}
                      </div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Target</div>
                      <div className="text-xl font-bold text-[var(--trade-bullish)]">
                        +{safeToFixed(potentialProfit, 0)}%
                      </div>
                    </div>
                  </div>

                  {/* Price Levels */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="text-center">
                      <div className="text-muted-foreground">Entry</div>
                      <div className="font-mono text-foreground">${safeToFixed(idea.entryPrice, 2, '—')}</div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-[var(--trade-bullish)]" />
                    <div className="text-center">
                      <div className="text-[var(--trade-bullish)]">Target</div>
                      <div className="font-mono text-[var(--trade-bullish)]">${safeToFixed(idea.targetPrice, 2, '—')}</div>
                    </div>
                  </div>

                  {/* Catalyst hint if available */}
                  {idea.catalyst && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-[10px] text-[var(--trade-neutral)]/80 truncate flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {idea.catalyst.slice(0, 50)}...
                      </p>
                    </div>
                  )}
                  
                  {/* Generated timestamp with session badge */}
                  <div className={cn(
                    "mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-[9px] text-muted-foreground",
                    idea.timestamp && isStale(idea.timestamp) && "opacity-60"
                  )}>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      <span>{idea.timestamp ? getRelativeTime(idea.timestamp) : '—'}</span>
                      {/* Session badge — shows FRIDAY / 2D OLD if not today's scan */}
                      {(() => {
                        const sb = getIdeaSessionBadge(idea.timestamp);
                        return sb ? <span className={sb.cls}>{sb.label}</span> : null;
                      })()}
                    </div>
                    <span className="text-[var(--trade-bullish)]/70 font-medium">
                      {(idea as any).source === 'tradingview' ? 'TV Signal' : (idea.dataSourceUsed || idea.source || 'scanner').replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* View Analysis indicator */}
                <div className="absolute bottom-0 right-0 p-2">
                  <ChevronRight className="w-4 h-4 text-[var(--trade-neutral)]/50" />
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
// FLOW SIGNALS - GEX + Flow Convergence
// ============================================
function FlowSignalsSection() {
  const { data, isLoading } = useQuery<{ signals: any[]; timestamp: string }>({
    queryKey: ['/api/flow-gex-convergence/top'],
    queryFn: async () => {
      const res = await fetch('/api/flow-gex-convergence/top?limit=3', { credentials: 'include' });
      if (!res.ok) return { signals: [], timestamp: '' };
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const signals = data?.signals || [];
  if (isLoading || signals.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/40">
          <Zap className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            Flow Signals
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/40 text-[10px]">
              GEX + FLOW
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            Institutional flow aligned with gamma exposure
            {data?.timestamp && (
              <span className={cn(componentStyles.text.chromeLabel, "text-muted-foreground/50")}>
                · {getRelativeTime(data.timestamp)}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {signals.map((s: any) => {
          const isBullish = s.flowBias === 'BULLISH';
          const premiumStr = s.totalPremium >= 1_000_000
            ? `$${(s.totalPremium / 1_000_000).toFixed(1)}M`
            : `$${(s.totalPremium / 1000).toFixed(0)}K`;

          return (
            <Link key={s.symbol} href={`/flow?symbol=${s.symbol}`}>
              <Card className={cn(
                "cursor-pointer transition-all duration-300 hover:-translate-y-1",
                "bg-gradient-to-br from-card/80 to-card/90",
                s.conviction === 'HIGH'
                  ? "border-[var(--trade-neutral)]/40 hover:border-amber-400/60 hover:shadow-amber-500/10"
                  : "border-cyan-500/30 hover:border-cyan-400/50 hover:shadow-cyan-500/10",
                "hover:shadow-lg"
              )}>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-foreground text-lg">{s.symbol}</span>
                    <Badge className={cn(
                      "text-[10px] border",
                      s.conviction === 'HIGH'
                        ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] border-[var(--trade-neutral)]/40"
                        : s.conviction === 'MEDIUM'
                        ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                        : "bg-muted-foreground/20 text-muted-foreground border-muted-foreground/40"
                    )}>
                      {s.conviction === 'HIGH' && <Flame className="w-3 h-3 mr-1" />}
                      {s.conviction}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs mb-2">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded",
                      s.gexRegime === 'NEGATIVE' ? "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]" :
                      s.gexRegime === 'POSITIVE' ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" :
                      "bg-muted-foreground/20 text-muted-foreground"
                    )}>
                      {s.gexBias}
                    </span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded",
                      isBullish ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
                    )}>
                      {s.flowBias}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{s.flowCount} trades • {premiumStr}</span>
                    <span className="text-[var(--trade-neutral)] font-mono">{s.gexRating}/5</span>
                  </div>
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
interface StatsOverviewProps {
  ideas: TradeIdea[];
  dateFilter?: 'today' | 'week' | 'all';
}

function StatsOverview({ ideas, dateFilter = 'today' }: StatsOverviewProps) {
  const stats = useMemo(() => {
    const openIdeas = ideas.filter(i => i.outcomeStatus === 'open' || !i.outcomeStatus);

    // Use ET timezone for "today" calculation (matches server filter)
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayStrET = `${nowET.getFullYear()}-${String(nowET.getMonth() + 1).padStart(2, '0')}-${String(nowET.getDate()).padStart(2, '0')}`;

    // Count ideas with today's date (ET timezone)
    const todayIdeas = openIdeas.filter(i => {
      if (!i.timestamp) return false;
      // Timestamp format: "2026-02-04T10:30:00.000Z" - check if starts with today's date
      return i.timestamp.startsWith(todayStrET);
    });

    const qualityIdeas = openIdeas.filter(i => {
      const grade = displayedGrade(i as any);
      return ['A+', 'A', 'A-', 'B+', 'B'].includes(grade);
    });
    // U2: average the canonical displayed score, not the raw legacy confidence.
    const avgConf = openIdeas.length > 0
      ? Math.round(openIdeas.reduce((sum, i) => sum + displayedScore(i as any), 0) / openIdeas.length)
      : 0;

    return {
      total: openIdeas.length,
      today: todayIdeas.length,
      quality: qualityIdeas.length,
      avgConf,
    };
  }, [ideas]);

  const totalLabel = dateFilter === 'today' ? "Today" : dateFilter === 'week' ? "Week" : "Total";

  return (
    <div className="flex items-center gap-5 px-4 py-2.5 rounded-lg bg-[var(--surface-base)] border border-border/50">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">{totalLabel}</span>
        <span className="text-base font-bold font-mono text-foreground">{stats.total}</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">Today</span>
        <span className="text-base font-bold font-mono text-[var(--trade-bullish)]">{stats.today}</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">Quality</span>
        <span className="text-base font-bold font-mono text-[var(--trade-bullish)]">{stats.quality}</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-2" title="Average canonical conviction score across open ideas">
        <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">Avg Score</span>
        <span className="text-base font-bold font-mono text-foreground tabular-nums">{stats.avgConf}</span>
      </div>
    </div>
  );
}

// ============================================
// BEST SETUPS CARD (Quick View)
// ============================================
function BestSetupsCard({ onViewAll }: { onViewAll?: () => void }) {
  // On weekends show last week's ideas (Friday's), on weekdays show today only
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const isWknd = etNow.getDay() === 0 || etNow.getDay() === 6 || (etNow.getDay() === 1 && etNow.getHours() < 4);
  const dateParam = isWknd ? 'week' : 'today';
  const todayKey = new Date().toISOString().split('T')[0];
  const { data, isLoading } = useQuery({
    queryKey: ['/api/trade-ideas/best-setups', 'daily', dateParam, todayKey],
    queryFn: async () => {
      const res = await fetch(`/api/trade-ideas/best-setups?period=daily&limit=5&date=${dateParam}&watchlistOnly=true&_t=${Date.now()}`);
      if (!res.ok) return { setups: [] };
      return res.json();
    },
    staleTime: 0,             // Always fetch fresh
    gcTime: 60 * 1000,        // 1 minute cache
    refetchInterval: 60000,   // Refresh every minute
  });

  const setups = data?.setups || [];

  return (
    <Card
      className="bg-card border-border p-4 cursor-pointer hover:border-[var(--trade-neutral)]/50 transition-all group"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) onViewAll?.();
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-[var(--trade-neutral)]" />
          <span className="text-sm font-semibold text-foreground">Best Setups</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-[var(--trade-neutral)] transition-colors" />
        </div>
        <Badge variant="outline" className="text-xs">{setups.length} Active</Badge>
      </div>
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : setups.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Scanning engines for setups...</div>
        ) : (
          setups.slice(0, 5).map((setup: any) => {
            // U2: render the canonical letter grade. Keep numeric score in tooltip.
            const grade = displayedGrade(setup);
            const numeric = displayedScore(setup);
            const style = getGradeStyle(grade);
            return (
              <Link key={setup.id || setup.symbol} href={`/terminal/${setup.symbol}`}>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted hover:bg-border transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-foreground">{setup.symbol}</span>
                    <Badge
                      className={cn("text-xs", style.bgClass, style.textClass)}
                      title={`Conviction score ${numeric} (${grade})`}
                    >
                      {grade}
                    </Badge>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
      {onViewAll && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 h-7 text-xs text-[var(--trade-neutral)] hover:text-amber-300 hover:bg-[var(--trade-neutral)]/10"
          onClick={onViewAll}
        >
          {setups.length > 0 ? 'View All Setups' : 'Open Setups'} <ChevronRight className="w-3 h-3 ml-1" />
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
    <Card
      className="bg-card border-border p-4 cursor-pointer hover:border-[var(--trade-bullish)]/50 transition-all group"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) onViewAll?.();
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-semibold text-foreground">Market Movers</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-[var(--trade-bullish)] transition-colors" />
        </div>
        <Badge variant="outline" className="text-xs text-[var(--trade-bullish)] border-emerald-400/30">Live</Badge>
      </div>
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : gainers.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">No movers</div>
        ) : (
          gainers.map((stock: any) => (
            <Link key={stock.symbol} href={`/terminal/${stock.symbol}`}>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted hover:bg-border transition-colors cursor-pointer">
                <span className="font-mono font-bold text-foreground">{stock.symbol}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-[var(--trade-bullish)]">+{safeToFixed(stock.changePercent, 1)}%</span>
                  <span className="text-xs text-muted-foreground">${safeToFixed(stock.price, 2)}</span>
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
          className="w-full mt-3 h-7 text-xs text-[var(--trade-bullish)] hover:text-[var(--trade-bullish)] hover:bg-[var(--trade-bullish)]/10"
          onClick={onViewAll}
        >
          {gainers.length > 0 ? 'View All Movers' : 'Open Movers'} <ChevronRight className="w-3 h-3 ml-1" />
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
        return { bg: 'from-emerald-500/20 to-emerald-500/20', border: 'border-[var(--trade-bullish)]/50', text: 'text-[var(--trade-bullish)]', badge: 'bg-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]' };
      case 'WATCH_CLOSELY':
        return { bg: 'from-amber-500/20 to-yellow-500/20', border: 'border-[var(--trade-neutral)]/50', text: 'text-[var(--trade-neutral)]', badge: 'bg-[var(--trade-neutral)]/30 text-amber-300' };
      default:
        return { bg: 'from-slate-500/20 to-gray-500/20', border: 'border-muted-foreground/50', text: 'text-muted-foreground', badge: 'bg-muted-foreground/30 text-foreground/80' };
    }
  };

  const renderPredictionCard = (pred: any, idx: number) => {
    const style = getTierStyle(pred.prediction?.tier);
    const signals = pred.signals || [];
    const topSignals = signals.slice(0, 4);

    return (
      <Link key={`${pred.symbol}-${idx}`} href={`/terminal/${pred.symbol}`}>
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
                  "bg-gradient-to-br from-violet-500 to-purple-600 text-foreground"
                )}>
                  {pred.symbol.slice(0, 2)}
                </div>
                <div>
                  <span className="font-bold text-foreground text-lg">{pred.symbol}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">${safeToFixed(pred.currentPrice, 2, '—')}</span>
                    {pred.change && (
                      <span className={cn(
                        "text-xs font-medium",
                        safeNumber(pred.change) > 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                      )}>
                        {safeNumber(pred.change) > 0 ? '+' : ''}{safeToFixed(pred.change, 1)}%
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
                  {safeToFixed(pred.prediction?.probability, 0, '0')}%
                </div>
              </div>
            </div>

            {/* Target Range */}
            {pred.prediction?.targetRange && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-[var(--surface-raised)] text-xs mb-3">
                <div className="text-center">
                  <div className="text-muted-foreground text-[10px]">Low Target</div>
                  <div className="font-semibold text-[var(--trade-neutral)]">${safeToFixed(pred.prediction.targetRange.low, 2, '—')}</div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-[var(--trade-bullish)]" />
                <div className="text-center">
                  <div className="text-muted-foreground text-[10px]">High Target</div>
                  <div className="font-semibold text-[var(--trade-bullish)]">${safeToFixed(pred.prediction.targetRange.high, 2, '—')}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground text-[10px]">Potential</div>
                  <div className="font-semibold text-[var(--trade-bullish)]">
                    +{safeToFixed(pred.prediction?.expectedMove, 0, '—')}%
                  </div>
                </div>
              </div>
            )}

            {/* Signals */}
            {topSignals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {topSignals.map((signal: any, sIdx: number) => (
                  <span key={sIdx} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-muted text-muted-foreground dark:text-foreground/80">
                    <BarChart3 className="w-3 h-3" /> {signal.name || signal}
                  </span>
                ))}
                {signals.length > 4 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-muted/50 text-muted-foreground">
                    +{signals.length - 4} more
                  </span>
                )}
              </div>
            )}

            {/* Reasoning */}
            {pred.prediction?.reasoning && (
              <p className="text-[10px] text-muted-foreground truncate">
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
              <h2 className="text-lg font-bold text-foreground">Tomorrow's Potential Surgers</h2>
              <p className="text-xs text-muted-foreground">Loading predictions...</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-[var(--trade-bearish)] opacity-50" />
        <p className="text-[var(--trade-bearish)]">Failed to load overnight predictions</p>
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
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Tomorrow's Potential Surgers
              <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/40 text-[10px]">
                PREDICTIVE AI
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">
              Stocks showing overnight surge patterns • Best scanned near market close
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 bg-muted border-border/50"
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
        <Card className="bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-[var(--trade-bullish)]" />
            <span className="text-xs text-[var(--trade-bullish)]">Strong Setup</span>
          </div>
          <div className="text-2xl font-bold text-[var(--trade-bullish)]">{strongSetup.length}</div>
        </Card>
        <Card className="bg-[var(--trade-neutral)]/10 border-[var(--trade-neutral)]/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-[var(--trade-neutral)]" />
            <span className="text-xs text-[var(--trade-neutral)]">Watch Closely</span>
          </div>
          <div className="text-2xl font-bold text-amber-300">{watchClosely.length}</div>
        </Card>
        <Card className="bg-muted-foreground/10 border-muted-foreground/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Speculative</span>
          </div>
          <div className="text-2xl font-bold text-foreground/80">{speculative.length}</div>
        </Card>
      </div>

      {predictions.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Generating overnight predictions...</p>
          <p className="text-xs text-muted-foreground mt-2">
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
                <h3 className="text-sm font-semibold text-foreground">High Conviction Plays</h3>
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
                <TrendingUp className="w-4 h-4 text-[var(--trade-bullish)]" />
                <h3 className="text-sm font-semibold text-foreground">Strong Setups</h3>
                <Badge className="bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)] text-[10px]">
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
                <Eye className="w-4 h-4 text-[var(--trade-neutral)]" />
                <h3 className="text-sm font-semibold text-foreground">Watch Closely</h3>
                <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] text-[10px]">
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
                <Activity className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Speculative</h3>
                <Badge className="bg-muted-foreground/20 text-muted-foreground text-[10px]">
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
      <Card className="bg-card border-border p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <Brain className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground/80 mb-1">How Overnight Surge Prediction Works</p>
            <p>Our AI analyzes consolidation patterns, volume accumulation, after-hours activity, and sector momentum to identify stocks with high probability of significant moves the next trading day. Best used for weekly options plays on high-momentum stocks.</p>
          </div>
        </div>
      </Card>

      {data?.cached && (
        <p className="text-[9px] text-muted-foreground/70 text-center">
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
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const isWknd = etNow.getDay() === 0 || etNow.getDay() === 6 || (etNow.getDay() === 1 && etNow.getHours() < 4);
  const dateParam = isWknd ? 'week' : 'today';
  const todayKey = new Date().toISOString().split('T')[0];
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['/api/trade-ideas/best-setups', 'subpage', dateParam, todayKey],
    queryFn: async () => {
      const res = await fetch(`/api/trade-ideas/best-setups?period=daily&limit=50&date=${dateParam}&watchlistOnly=true&_t=${Date.now()}`);
      if (!res.ok) return { setups: [] };
      return res.json();
    },
    staleTime: 0,             // Always fetch fresh
    gcTime: 60 * 1000,        // 1 minute cache
    refetchInterval: 60000,
  });

  const setups = data?.setups || [];

  // Group by grade — U2: route through canonical displayedGrade so the
  // engine score takes priority over legacy probabilityBand fallbacks.
  const eliteSetups = setups.filter((s: any) => ['A+', 'A', 'A-'].includes(displayedGrade(s)));
  const strongSetups = setups.filter((s: any) => ['B+', 'B', 'B-'].includes(displayedGrade(s)));
  const otherSetups = setups.filter((s: any) => {
    const grade = displayedGrade(s);
    return !['A+', 'A', 'A-', 'B+', 'B', 'B-'].includes(grade);
  });

  const renderSetupCard = (setup: any) => {
    const grade = displayedGrade(setup);
    const numeric = displayedScore(setup);
    const style = getGradeStyle(grade);
    const isLong = setup.direction === 'LONG' || setup.direction === 'long';
    const isOption = setup.assetType === 'option' || setup.optionType;

    return (
      <Link key={setup.id || `${setup.symbol}-${setup.timestamp}`} href={`/terminal/${setup.symbol}`}>
        <Card className={cn(
          "relative overflow-hidden cursor-pointer transition-all duration-300",
          "bg-card/60 border-border/50",
          "hover:border-[var(--trade-bullish)]/50 hover:shadow-lg hover:-translate-y-1"
        )}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                  isLong ? "bg-gradient-to-br from-emerald-500 to-green-600 text-foreground" : "bg-gradient-to-br from-red-500 to-rose-600 text-foreground"
                )}>
                  {setup.symbol.slice(0, 2)}
                </div>
                <div>
                  <span className="font-bold text-foreground text-lg">{setup.symbol}</span>
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      isLong ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
                    )}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                    {isOption && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                        {setup.optionType?.toUpperCase()}
                      </span>
                    )}
                    {setup.hasDirectionConflict && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400" title="Conflicting signals: both LONG and SHORT ideas exist for this ticker">
                        ⚡ CONFLICT
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div
                className="text-right"
                title={`Conviction score ${numeric} (${grade})`}
              >
                <Badge className={cn("text-2xl font-bold px-3 py-1 border", style.bgClass, style.textClass)}>
                  {grade}
                </Badge>
                <div className="text-[9px] uppercase font-mono text-muted-foreground mt-1">
                  grade · {numeric}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-[var(--surface-raised)] text-xs">
              <div className="text-center">
                <div className="text-muted-foreground text-[10px]">Entry</div>
                <div className="font-semibold text-foreground">${safeToFixed(setup.entryPrice, 2, '—')}</div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-[var(--trade-bullish)]" />
              <div className="text-center">
                <div className="text-muted-foreground text-[10px]">Target</div>
                <div className="font-semibold text-[var(--trade-bullish)]">${safeToFixed(setup.targetPrice, 2, '—')}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground text-[10px]">Stop</div>
                <div className="font-semibold text-[var(--trade-bearish)]">${safeToFixed(setup.stopLoss, 2, '—')}</div>
              </div>
            </div>

            {setup.catalyst && (
              <p className="mt-2 text-[10px] text-[var(--trade-neutral)]/80 truncate flex items-center gap-1">
                <Zap className="w-3 h-3" /> {setup.catalyst.slice(0, 60)}...
              </p>
            )}
            
            {/* Generated timestamp with relative time */}
            <div className={cn(
              "mt-2 pt-2 border-t border-border flex items-center justify-between text-[9px] text-muted-foreground",
              setup.timestamp && isStale(setup.timestamp) && "opacity-60"
            )}>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {setup.timestamp ? getRelativeTime(setup.timestamp) : '—'}
              </span>
              <span className="text-[var(--trade-bullish)]/70 font-medium">
                {(setup as any).source === 'tradingview' ? '📺 TV Signal' : (setup.dataSourceUsed?.replace(/_/g, ' ') || setup.source?.replace(/_/g, ' ') || 'scanner')}
              </span>
            </div>
          </div>
        </Card>
      </Link>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-[var(--trade-neutral)]/40">
            <Star className="w-5 h-5 text-[var(--trade-neutral)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Best Setups</h2>
            <p className="text-xs text-muted-foreground">Loading AI-picked trades...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-[var(--trade-neutral)]/40">
            <Star className="w-5 h-5 text-[var(--trade-neutral)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Best Setups
              <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] dark:text-[var(--trade-neutral)] border-[var(--trade-neutral)]/40 text-[10px]">
                CONVERGENCE
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">Top conviction trade ideas from multi-engine convergence</p>
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
        <Card className="bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 p-4">
          <div className="text-xs text-[var(--trade-bullish)] mb-1">Elite (A Grade)</div>
          <div className="text-2xl font-bold text-[var(--trade-bullish)]">{eliteSetups.length}</div>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/30 p-4">
          <div className="text-xs text-blue-400 mb-1">Strong (B Grade)</div>
          <div className="text-2xl font-bold text-blue-300">{strongSetups.length}</div>
        </Card>
        <Card className="bg-muted-foreground/10 border-muted-foreground/30 p-4">
          <div className="text-xs text-muted-foreground mb-1">Watchlist</div>
          <div className="text-2xl font-bold text-foreground/80">{otherSetups.length}</div>
        </Card>
      </div>

      {setups.length === 0 ? (
        <div className="text-center py-16">
          <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Scanning engines for setups...</p>
        </div>
      ) : (
        <>
          {eliteSetups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-[var(--trade-bullish)]" /> Elite Setups (A Grade)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {eliteSetups.map(renderSetupCard)}
              </div>
            </div>
          )}

          {strongSetups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" /> Strong Setups (B Grade)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {strongSetups.map(renderSetupCard)}
              </div>
            </div>
          )}

          {otherSetups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" /> Watchlist
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
    <Link key={stock.symbol} href={`/terminal/${stock.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        isGainer ? "bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 hover:border-emerald-400/50" : "bg-[var(--trade-bearish)]/10 border-[var(--trade-bearish)]/30 hover:border-red-400/50",
        // Highlight stocks with catalysts
        stock.hasCatalyst && "ring-1 ring-purple-500/40"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm relative",
                isGainer ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
              )}>
                {stock.symbol.slice(0, 2)}
                {/* Catalyst indicator dot */}
                {stock.hasCatalyst && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-purple-500 flex items-center justify-center text-[8px]">
                    {stock.catalyst?.icon || '!'}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground">{stock.symbol}</span>
                  {/* Catalyst badge */}
                  {stock.hasCatalyst && stock.catalyst && (
                    <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {stock.catalyst.icon}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                  {stock.hasCatalyst && stock.catalyst?.title ? stock.catalyst.title : (stock.name || 'Stock')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className={cn("text-xl font-bold", isGainer ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
                {isGainer ? '+' : ''}{safeToFixed(stock.changePercent, 1)}%
              </div>
              <div className="text-sm font-mono text-muted-foreground">${safeToFixed(stock.price, 2)}</div>
            </div>
          </div>
          {stock.volume && (
            <div className="mt-2 pt-2 border-t border-border/30">
              <span className="text-[10px] text-muted-foreground">Vol: {safeToFixed(safeNumber(stock.volume) / 1000000, 1)}M</span>
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
            <h2 className="text-lg font-bold text-foreground">Market Movers</h2>
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
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
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Market Movers
              <Badge className="bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/40 text-[10px]">
                LIVE
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">Today's biggest gainers and losers</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Top Gainers */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--trade-bullish)]" /> Top Gainers ({gainers.length})
        </h3>
        {gainers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Loading market data...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {gainers.slice(0, 12).map((stock: any) => renderMoverCard(stock, true))}
          </div>
        )}
      </div>

      {/* Top Losers */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-[var(--trade-bearish)]" /> Top Losers ({losers.length})
        </h3>
        {losers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Loading market data...</div>
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
    <Link key={`${stock.symbol}-${type}`} href={`/terminal/${stock.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        stock.tier === 'SURGE' ? "bg-rose-500/10 border-rose-500/30 hover:border-rose-400/50" :
        stock.tier === 'MOMENTUM' ? "bg-[var(--trade-neutral)]/10 border-[var(--trade-neutral)]/30 hover:border-amber-400/50" :
        "bg-blue-500/10 border-blue-500/30 hover:border-blue-400/50",
        // Highlight stocks with catalysts
        stock.hasCatalyst && "ring-1 ring-purple-500/40"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm relative",
                stock.tier === 'SURGE' ? "bg-rose-500/20 text-rose-400" :
                stock.tier === 'MOMENTUM' ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]" :
                "bg-blue-500/20 text-blue-400"
              )}>
                {stock.symbol.slice(0, 2)}
                {/* Catalyst indicator dot */}
                {stock.hasCatalyst && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-purple-500 flex items-center justify-center text-[8px]">
                    {stock.catalyst?.icon || '!'}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground">{stock.symbol}</span>
                  <Badge className={cn(
                    "text-[9px]",
                    stock.tier === 'SURGE' ? "bg-rose-500/20 text-rose-400" :
                    stock.tier === 'MOMENTUM' ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]" :
                    "bg-blue-500/20 text-blue-400"
                  )}>
                    {stock.tier}
                  </Badge>
                  {/* Catalyst badge */}
                  {stock.hasCatalyst && stock.catalyst && (
                    <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {stock.catalyst.icon} Catalyst
                    </Badge>
                  )}
                </div>
                {/* Show catalyst title if available */}
                {stock.hasCatalyst && stock.catalyst?.title && (
                  <p className="text-[10px] text-purple-300/80 mt-0.5 truncate max-w-[180px]">
                    {stock.catalyst.title}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={cn("text-xl font-bold", safeNumber(stock.change) > 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]")}>
                {safeNumber(stock.change) > 0 ? '+' : ''}{safeToFixed(stock.change, 1)}%
              </div>
              <div className="text-sm font-mono text-muted-foreground">${safeToFixed(stock.price, 2)}</div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{stock.reason}</p>
          {stock.score && (
            <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-500" style={{ width: `${stock.score}%` }} />
            </div>
          )}
        </div>
      </Card>
    </Link>
  );

  const renderTomorrowCard = (pred: any) => (
    <Link key={pred.symbol} href={`/terminal/${pred.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        pred.prediction?.tier === 'HIGH_CONVICTION' ? "bg-violet-500/10 border-violet-500/30 hover:border-violet-400/50" :
        pred.prediction?.tier === 'STRONG_SETUP' ? "bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 hover:border-cyan-400/50" :
        "bg-muted-foreground/10 border-muted-foreground/30 hover:border-muted-foreground/50",
        // Highlight stocks with catalysts
        pred.hasCatalyst && "ring-1 ring-purple-500/40"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm relative",
                pred.prediction?.tier === 'HIGH_CONVICTION' ? "bg-violet-500/20 text-violet-400" : "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]"
              )}>
                {pred.symbol.slice(0, 2)}
                {/* Catalyst indicator dot */}
                {pred.hasCatalyst && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-purple-500 flex items-center justify-center text-[8px]">
                    {pred.catalyst?.icon || '!'}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-foreground">{pred.symbol}</span>
                  {pred.prediction?.tier === 'HIGH_CONVICTION' && <Sparkles className="w-3 h-3 text-violet-400" />}
                  {/* Catalyst badge */}
                  {pred.hasCatalyst && pred.catalyst && (
                    <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">
                      {pred.catalyst.icon} Catalyst
                    </Badge>
                  )}
                </div>
                {/* Show catalyst title if available */}
                {pred.hasCatalyst && pred.catalyst?.title && (
                  <p className="text-[10px] text-purple-300/80 mt-0.5 truncate max-w-[180px]">
                    {pred.catalyst.title}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-xl font-bold",
                pred.prediction?.tier === 'HIGH_CONVICTION' ? "text-violet-400" : "text-[var(--trade-bullish)]"
              )}>
                {safeToFixed(pred.prediction?.probability, 0)}%
              </div>
              <div className="text-sm font-mono text-muted-foreground">${safeToFixed(pred.currentPrice, 2)}</div>
            </div>
          </div>
          {pred.prediction?.targetRange && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Target: ${safeToFixed(pred.prediction.targetRange.low, 2)} - ${safeToFixed(pred.prediction.targetRange.high, 2)}</span>
            </div>
          )}
          {pred.signals && pred.signals.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {pred.signals.slice(0, 3).map((signal: any, idx: number) => (
                <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-foreground/80">
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
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-[var(--trade-neutral)]/40">
            <Zap className="w-5 h-5 text-[var(--trade-neutral)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Surge Detection
              <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] border-[var(--trade-neutral)]/40 text-[10px]">
                REAL-TIME
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">Momentum & pre-breakout detection system</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchBreakouts()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit">
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
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : activeSubTab === 'now' ? (
        surges.length === 0 ? (
          <div className="text-center py-16">
            <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Market calm — monitoring momentum right now</p>
            <p className="text-xs text-muted-foreground mt-2">Scanning market for momentum signals...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {surges.map((stock: any) => renderSurgeCard(stock, 'now'))}
          </div>
        )
      ) : activeSubTab === 'early' ? (
        earlySetups.length === 0 ? (
          <div className="text-center py-16">
            <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Scanning for early-stage signals...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {earlySetups.map((stock: any) => renderSurgeCard(stock, 'early'))}
          </div>
        )
      ) : (
        tomorrowPlays.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Generating overnight predictions...</p>
            <p className="text-xs text-muted-foreground mt-2">Best scanned near market close (3-4 PM ET)</p>
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
    <Link key={opp.symbol} href={`/terminal/${opp.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        opp.urgency === 'critical' ? "bg-[var(--trade-bearish)]/10 border-[var(--trade-bearish)]/30 hover:border-red-400/50" :
        opp.urgency === 'high' ? "bg-[var(--trade-neutral)]/10 border-[var(--trade-neutral)]/30 hover:border-amber-400/50" :
        "bg-purple-500/10 border-purple-500/30 hover:border-purple-400/50"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                opp.urgency === 'critical' ? "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]" :
                opp.urgency === 'high' ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]" :
                "bg-purple-500/20 text-purple-400"
              )}>
                {opp.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="font-bold text-foreground">{opp.symbol}</span>
                <Badge className={cn(
                  "ml-2 text-[9px]",
                  opp.direction === 'bullish' ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
                )}>
                  {opp.direction?.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-xl font-bold",
                opp.convergenceScore >= 80 ? "text-[var(--trade-bullish)]" :
                opp.convergenceScore >= 65 ? "text-[var(--trade-neutral)]" : "text-foreground"
              )}>
                {opp.convergenceScore}%
              </div>
              <Badge className={cn(
                "text-[9px]",
                opp.urgency === 'critical' ? "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]" :
                opp.urgency === 'high' ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]" :
                "bg-muted-foreground/20 text-muted-foreground"
              )}>
                {opp.urgency?.toUpperCase()}
              </Badge>
            </div>
          </div>
          {opp.signals && opp.signals.length > 0 && (
            <div className="space-y-1">
              {opp.signals.slice(0, 4).map((signal: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground">
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
            <h2 className="text-lg font-bold text-foreground">Convergence Signals</h2>
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
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
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Convergence Signals
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40 text-[10px]">
                MULTI-SOURCE
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">When multiple data sources agree, something big is brewing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          {criticalCount > 0 && <Badge className="bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]">{criticalCount} Critical</Badge>}
          {highCount > 0 && <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]">{highCount} High</Badge>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[var(--trade-bearish)]/10 border-[var(--trade-bearish)]/30 p-4">
          <div className="text-xs text-[var(--trade-bearish)] mb-1">Critical Urgency</div>
          <div className="text-2xl font-bold text-red-300">{criticalCount}</div>
        </Card>
        <Card className="bg-[var(--trade-neutral)]/10 border-[var(--trade-neutral)]/30 p-4">
          <div className="text-xs text-[var(--trade-neutral)] mb-1">High Urgency</div>
          <div className="text-2xl font-bold text-amber-300">{highCount}</div>
        </Card>
        <Card className="bg-purple-500/10 border-purple-500/30 p-4">
          <div className="text-xs text-purple-400 mb-1">Total Opportunities</div>
          <div className="text-2xl font-bold text-purple-300">{opportunities.length}</div>
        </Card>
      </div>

      {opportunities.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Monitoring for convergence... detected</p>
          <p className="text-xs text-muted-foreground mt-2">Monitoring news, options flow, insider activity, and sector momentum...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {opportunities.map(renderOpportunityCard)}
        </div>
      )}

      <Card className="bg-card border-border p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground/80 mb-1">How Convergence Detection Works</p>
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
    <Link key={item.symbol} href={`/terminal/${item.symbol}`}>
      <Card className={cn(
        "cursor-pointer transition-all duration-300 hover:-translate-y-1",
        item.isConverging ? "bg-orange-500/10 border-orange-500/30 hover:border-orange-400/50" : "bg-muted-foreground/10 border-muted-foreground/30 hover:border-muted-foreground/50"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                item.isConverging ? "bg-orange-500/20 text-orange-400" : "bg-muted-foreground/20 text-muted-foreground"
              )}>
                {item.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="font-bold text-foreground">{item.symbol}</span>
                {item.isConverging && (
                  <Badge className="ml-2 text-[9px] bg-orange-500/20 text-orange-400">CONVERGING</Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-xl font-bold",
                safeNumber(item.heatScore) >= 5 ? "text-[var(--trade-bearish)]" :
                safeNumber(item.heatScore) >= 3 ? "text-orange-400" : "text-muted-foreground"
              )}>
                {safeToFixed(item.heatScore, 1)}
              </div>
              <span className="text-[10px] text-muted-foreground">heat score</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{item.distinctSources} sources</span>
            <span>{item.recentTouches1h} hits/hr</span>
            <span>{item.totalSignals} signals</span>
          </div>
          {/* Heat bar */}
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full",
                item.heatScore >= 5 ? "bg-gradient-to-r from-orange-500 to-red-500" :
                item.heatScore >= 3 ? "bg-gradient-to-r from-amber-500 to-orange-500" :
                "bg-muted-foreground"
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
            <h2 className="text-lg font-bold text-foreground">Hot Attention</h2>
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
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
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              Hot Attention
              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/40 text-[10px]">
                HEAT MAP
              </Badge>
            </h2>
            <p className="text-xs text-muted-foreground">Symbols flagged by multiple scanners - watch for moves</p>
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
        <Card className="bg-muted-foreground/10 border-muted-foreground/30 p-4">
          <div className="text-xs text-muted-foreground mb-1">Watching</div>
          <div className="text-2xl font-bold text-foreground/80">{watchingSymbols.length}</div>
        </Card>
        <Card className="bg-[var(--trade-bearish)]/10 border-[var(--trade-bearish)]/30 p-4">
          <div className="text-xs text-[var(--trade-bearish)] mb-1">Highest Heat</div>
          <div className="text-2xl font-bold text-red-300">{safeToFixed(symbols[0]?.heatScore, 1, '0')}</div>
        </Card>
      </div>

      {symbols.length === 0 ? (
        <div className="text-center py-16">
          <Flame className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Scanning for unusual activity... detected</p>
        </div>
      ) : (
        <>
          {convergingSymbols.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" /> Converging Signals ({convergingSymbols.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {convergingSymbols.map(renderHotCard)}
              </div>
            </div>
          )}

          {watchingSymbols.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" /> On Radar ({watchingSymbols.length})
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
            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      );
    }

    if (breakoutError && tab === 'surge') {
      return (
        <div className="text-center py-4 text-muted-foreground text-sm">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
          <p>Temporarily unavailable</p>
        </div>
      );
    }

    // TOMORROW TAB - Predictive overnight plays
    if (tab === 'tomorrow') {
      if (tomorrowPlays.length === 0) {
        return (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>No high-conviction setups</p>
            <p className="text-[10px] mt-1">Best scanned near market close (3-4 PM ET)</p>
          </div>
        );
      }

      return tomorrowPlays.slice(0, 5).map((pred: any, idx: number) => (
        <Link key={`${pred.symbol}-${idx}`} href={`/terminal/${pred.symbol}`}>
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted hover:bg-border transition-colors cursor-pointer border-l-2 border-violet-500/50">
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
                pred.prediction?.tier === 'HIGH_CONVICTION' ? "bg-violet-500/30 text-violet-300" :
                "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]"
              )}>{idx + 1}</span>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-bold text-foreground text-sm">{pred.symbol}</span>
                  {pred.prediction?.tier === 'HIGH_CONVICTION' && (
                    <Sparkles className="w-3 h-3 text-violet-400" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                  {pred.signals?.[0]?.name || 'Setup detected'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-foreground">
                ${safeToFixed(pred.currentPrice, 2, '—')}
              </span>
              <p className="text-[10px] text-violet-400 font-medium">
                {safeToFixed(pred.prediction?.probability, 0)}% prob
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
        <div className="text-center py-4 text-muted-foreground text-sm">
          No {tab === 'surge' ? 'surges' : 'setups'} detected
        </div>
      );
    }

    return displayData.slice(0, 5).map((stock: any, idx: number) => (
      <Link key={`${stock.symbol}-${idx}`} href={`/terminal/${stock.symbol}`}>
        <div className={cn(
          "flex items-center justify-between p-2 rounded-lg bg-muted hover:bg-border transition-colors cursor-pointer",
          stock.hasCatalyst && "ring-1 ring-purple-500/30 bg-purple-500/5"
        )}>
          <div className="flex items-center gap-2">
            <span className={cn(
              "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
              stock.tier === 'SURGE' ? "bg-rose-500/20 text-rose-400" :
              stock.tier === 'MOMENTUM' ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]" :
              "bg-blue-500/20 text-blue-400"
            )}>{idx + 1}</span>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-mono font-bold text-foreground text-sm">{stock.symbol}</span>
                {stock.hasCatalyst && stock.catalyst && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                    {stock.catalyst.icon}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                {stock.catalyst?.title || stock.reason?.split(' | ')[0] || stock.tier}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-foreground">
              ${safeToFixed(stock.price, 2, '—')}
            </span>
            {typeof stock.change === 'number' && (
              <p className={cn(
                "text-xs font-mono font-bold",
                safeNumber(stock.change) > 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
              )}>
                {safeNumber(stock.change) > 0 ? '+' : ''}{safeToFixed(stock.change, 1)}%
              </p>
            )}
          </div>
        </div>
      </Link>
    ));
  };

  return (
    <Card
      className="bg-card border-border p-4 cursor-pointer hover:border-orange-500/50 transition-all group"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('a') && !target.closest('button')) onViewTomorrow?.();
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[var(--trade-neutral)]" />
          <span className="text-sm font-semibold text-foreground">Surge Detection</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-orange-400 transition-colors" />
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
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
      <p className="text-[10px] text-muted-foreground mb-3">
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

      {/* View All button - always show to navigate to full sub-page */}
      {onViewTomorrow && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-3 h-7 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
          onClick={onViewTomorrow}
        >
          View Full Surge Detection <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}

      {(breakoutData?.cached || overnightData?.cached) && (
        <p className="text-[9px] text-muted-foreground/70 mt-2 text-center">
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
    <Card
      className="bg-card border-border p-4 cursor-pointer hover:border-purple-500/50 transition-all group"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('a') && !target.closest('button')) onViewAll?.();
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-foreground">Convergence</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-purple-400 transition-colors" />
          {status === 'active' && (
            <span className="w-2 h-2 rounded-full bg-[var(--trade-bullish)] animate-pulse" />
          )}
          {status === 'monitoring' && (
            <span className="w-2 h-2 rounded-full bg-amber-400" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {criticalCount > 0 && (
            <Badge className="bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)] text-[10px]">
              {criticalCount} Critical
            </Badge>
          )}
          {highCount > 0 && (
            <Badge className="bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] text-[10px]">
              {highCount} High
            </Badge>
          )}
          {activeSignalCount > 0 && criticalCount === 0 && highCount === 0 && (
            <Badge className="bg-muted text-muted-foreground text-[10px]">
              {activeSignalCount} signals
            </Badge>
          )}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">Multi-source signal correlation (pre-move detection)</p>

      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>Temporarily unavailable</p>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <Activity className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>{status === 'monitoring' ? 'Monitoring signals...' : 'Monitoring for convergence...'}</p>
            <p className="text-[10px] mt-1">
              {activeSignalCount > 0
                ? `${activeSignalCount} signal${activeSignalCount > 1 ? 's' : ''} tracked (need 2+ sources to converge)`
                : 'Watching news, options, insiders, sectors...'}
            </p>
            {hotSymbols.length > 0 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-[10px] text-muted-foreground/70">Hot:</span>
                {hotSymbols.map((s: any) => (
                  <Link key={s.symbol} href={`/terminal/${s.symbol}`}>
                    <span className="text-[10px] font-mono text-[var(--trade-bullish)] hover:underline cursor-pointer">
                      {s.symbol}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          opportunities.slice(0, 5).map((opp: any, idx: number) => (
            <Link key={`${opp.symbol}-${idx}`} href={`/terminal/${opp.symbol}`}>
              <div className={cn(
                "flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer",
                opp.urgency === 'critical' ? "bg-[var(--trade-bearish)]/10 hover:bg-[var(--trade-bearish)]/20 border border-[var(--trade-bearish)]/30" :
                opp.urgency === 'high' ? "bg-[var(--trade-neutral)]/10 hover:bg-[var(--trade-neutral)]/20 border border-[var(--trade-neutral)]/30" :
                "bg-muted hover:bg-border"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
                    opp.urgency === 'critical' ? "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]" :
                    opp.urgency === 'high' ? "bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]" :
                    "bg-purple-500/20 text-purple-400"
                  )}>{opp.signals?.length || idx + 1}</span>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-bold text-foreground text-sm">{opp.symbol}</span>
                      <span className={cn(
                        "text-[10px] font-medium",
                        opp.direction === 'bullish' ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                      )}>{opp.direction === 'bullish' ? '↑' : '↓'}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                      {opp.signals?.map((s: any) => s.source).slice(0, 3).join(', ') || 'Multi-source'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-sm font-mono font-bold",
                    opp.convergenceScore >= 80 ? "text-[var(--trade-bullish)]" :
                    opp.convergenceScore >= 65 ? "text-[var(--trade-neutral)]" : "text-foreground"
                  )}>
                    {opp.convergenceScore}%
                  </span>
                  <p className="text-[10px] text-muted-foreground">
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
        <p className="text-[9px] text-muted-foreground/70 mt-2 text-center">
          Cached {data.cacheAge}s ago
        </p>
      )}
    </Card>
  );
}

// ============================================
// HOT SYMBOLS CARD - Symbols with multi-source attention
// ============================================
// Compact version for sidebar
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
    <Card
      className="bg-card border-border p-4 cursor-pointer hover:border-[var(--trade-bearish)]/50 transition-all group"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('a') && !target.closest('button')) onViewAll?.();
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" />
          <span className="text-sm font-semibold text-foreground">Hot Attention</span>
          <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-[var(--trade-bearish)] transition-colors" />
        </div>
        <Badge variant="outline" className="text-xs">
          {data?.convergingCount || 0} Converging
        </Badge>
      </div>
      <p className="text-[10px] text-muted-foreground mb-3">Symbols flagged by multiple scanners</p>

      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : symbols.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Scanning for unusual activity...</div>
        ) : (
          symbols.slice(0, 6).map((item: any, idx: number) => (
            <Link key={item.symbol} href={`/terminal/${item.symbol}`}>
              <div className={cn(
                "flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer",
                item.isConverging ? "bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30" : "bg-muted hover:bg-border"
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
                    item.isConverging ? "bg-orange-500/20 text-orange-400" : "bg-muted text-muted-foreground"
                  )}>{idx + 1}</span>
                  <div>
                    <span className="font-mono font-bold text-foreground text-sm">{item.symbol}</span>
                    <p className="text-[10px] text-muted-foreground">
                      {item.distinctSources} sources • {item.recentTouches1h} hits/hr
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-sm font-mono font-bold",
                    safeNumber(item.heatScore) >= 5 ? "text-[var(--trade-bearish)]" :
                    safeNumber(item.heatScore) >= 3 ? "text-orange-400" : "text-muted-foreground"
                  )}>
                    {safeToFixed(item.heatScore, 1)}
                  </span>
                  <p className="text-[10px] text-muted-foreground">heat</p>
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
          className="w-full mt-3 h-7 text-xs text-[var(--trade-bearish)] hover:text-red-300 hover:bg-[var(--trade-bearish)]/10"
          onClick={onViewAll}
        >
          {symbols.length > 0 ? 'View All Hot Symbols' : 'Open Hot Symbols'} <ChevronRight className="w-3 h-3 ml-1" />
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
  icon: LucideIcon;
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
    'ai_analysis': { type: 'ai', label: 'AI', icon: Brain, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    'ai': { type: 'ai', label: 'AI', icon: Brain, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
    'quant_signal': { type: 'quant', label: 'Quant', icon: BarChart3, color: 'text-[var(--trade-bullish)]', bgColor: 'bg-[var(--trade-bullish)]/20' },
    'quant': { type: 'quant', label: 'Quant', icon: BarChart3, color: 'text-[var(--trade-bullish)]', bgColor: 'bg-[var(--trade-bullish)]/20' },
    'chart_analysis': { type: 'technical', label: 'Chart', icon: LineChart, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
    'surge_detection': { type: 'momentum', label: 'Surge', icon: Zap, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
    'market_scanner': { type: 'momentum', label: 'Mover', icon: Radar, color: 'text-[var(--trade-neutral)]', bgColor: 'bg-[var(--trade-neutral)]/20' },
    'flow': { type: 'flow', label: 'Flow', icon: Activity, color: 'text-[var(--trade-bullish)]', bgColor: 'bg-[var(--trade-bullish)]/20' },
    'options_flow': { type: 'flow', label: 'Options', icon: Activity, color: 'text-[var(--trade-bullish)]', bgColor: 'bg-[var(--trade-bullish)]/20' },
    'social_sentiment': { type: 'sentiment', label: 'Social', icon: MessageCircle, color: 'text-pink-400', bgColor: 'bg-pink-500/20' },
    'convergence': { type: 'multi', label: 'Multi-Signal', icon: Target, color: 'text-violet-400', bgColor: 'bg-violet-500/20' },
    'bot_screener': { type: 'screener', label: 'Screener', icon: Search, color: 'text-[var(--trade-bullish)]', bgColor: 'bg-[var(--trade-bullish)]/20' },
    'watchlist': { type: 'watchlist', label: 'Watchlist', icon: Star, color: 'text-yellow-400', bgColor: 'bg-yellow-500/20' },
    'earnings_play': { type: 'catalyst', label: 'Earnings', icon: Calendar, color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' },
  };

  // Add primary source driver
  const primaryDriver = sourceDriverMap[source];
  if (primaryDriver) {
    drivers.push(primaryDriver);
  }

  // Check for news catalyst
  if (idea.isNewsCatalyst || catalyst.includes('news') || catalyst.includes('announcement') || catalyst.includes('breaking')) {
    drivers.push({ type: 'news', label: 'News', icon: Newspaper, color: 'text-rose-400', bgColor: 'bg-rose-500/20' });
  }

  // Check for earnings catalyst
  if (idea.earningsBeat !== null || catalyst.includes('earning') || catalyst.includes('eps') || catalyst.includes('revenue')) {
    const beatMiss = idea.earningsBeat ? 'Beat' : idea.earningsBeat === false ? 'Miss' : 'Earnings';
    drivers.push({ type: 'earnings', label: beatMiss, icon: BarChart3, color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' });
  }

  // Check signals for technical patterns
  const technicalPatterns = ['rsi', 'macd', 'breakout', 'support', 'resistance', 'volume', 'momentum', 'trend'];
  const hasTechnical = signals.some(s => technicalPatterns.some(p => s.toLowerCase().includes(p)));
  if (hasTechnical && !drivers.find(d => d.type === 'technical')) {
    drivers.push({ type: 'technical', label: 'Technical', icon: LineChart, color: 'text-blue-400', bgColor: 'bg-blue-500/20' });
  }

  // Check for insider/pre-market indicators
  if (catalyst.includes('insider') || catalyst.includes('pre-market') || catalyst.includes('premarket')) {
    drivers.push({ type: 'insider', label: 'Insider', icon: Lock, color: 'text-[var(--trade-neutral)]', bgColor: 'bg-[var(--trade-neutral)]/20' });
  }

  // Default if no drivers found
  if (drivers.length === 0) {
    drivers.push({ type: 'analysis', label: 'Analysis', icon: Microscope, color: 'text-muted-foreground', bgColor: 'bg-muted-foreground/20' });
  }

  return drivers.slice(0, 3); // Max 3 driver tags
}

// ============================================
// FRESHNESS PILL — surfaces Phase 1 server-side revalidation diagnostics
// (`ageHours`, `driftPct`, `freshnessFlags` from /api/trade-ideas/best-setups)
// so the user can see at a glance whether an idea is still actionable or
// has already drifted off the entry. Returns null if no diagnostics present.
// ============================================
function FreshnessPillInline({ idea }: { idea: TradeIdea }) {
  const i = idea as any;
  const age: number | null = typeof i.ageHours === "number" ? i.ageHours : null;
  const drift: number | null = typeof i.driftPct === "number" ? i.driftPct : null;
  const flags: string[] = Array.isArray(i.freshnessFlags) ? i.freshnessFlags : [];
  if (age == null && drift == null && flags.length === 0) return null;

  const isLong = idea.direction === "long" || idea.direction === "LONG";
  const driftAgainst = drift != null ? (isLong ? -drift : drift) : null;

  let toneClass = "bg-muted/30 text-muted-foreground border-border/40";
  if (driftAgainst != null && driftAgainst >= 1) {
    toneClass = "bg-red-500/10 text-red-300 border-red-500/40";
  } else if (flags.includes("stale") || (age != null && age > 6)) {
    toneClass = "bg-amber-500/10 text-amber-300 border-amber-500/40";
  } else if (driftAgainst != null && driftAgainst < 0) {
    toneClass = "bg-emerald-500/10 text-emerald-300 border-emerald-500/40";
  }

  const ageLabel = age != null ? `${age < 1 ? "<1" : age.toFixed(0)}h` : null;
  const driftLabel = drift != null ? `${drift > 0 ? "+" : ""}${drift.toFixed(1)}%` : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold border",
        toneClass,
      )}
      title={flags.length ? `Freshness: ${flags.join(", ")}` : "Server-side freshness check"}
    >
      {ageLabel && <span>{ageLabel}</span>}
      {ageLabel && driftLabel && <span className="opacity-50">·</span>}
      {driftLabel && <span>{driftLabel}</span>}
    </span>
  );
}

// ============================================
// COMPACT TRADE IDEA CARD (Landing Page Style)
// ============================================
function TradeIdeaCard({ idea, expanded, onToggle, onViewDetails }: {
  idea: TradeIdea;
  expanded: boolean;
  onToggle: () => void;
  onViewDetails?: (idea: TradeIdea) => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  // U2: canonical letter grade — engine band first, conviction score next, then legacy.
  const grade = displayedGrade(idea as any);
  const numericScore = displayedScore(idea as any);
  const style = getGradeStyle(grade);
  const isLong = idea.direction === 'LONG' || idea.direction === 'long';
  const isOption = idea.assetType === 'option' || idea.optionType;
  const isCall = idea.optionType === 'call';

  // Format expiry date
  const expiryFormatted = useMemo(() => {
    if (!idea.expiryDate) return null;
    const date = new Date(idea.expiryDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, [idea.expiryDate]);

  // Navigate to full analysis page
  const handleNavigate = () => {
    setLocation(`/terminal/${idea.symbol}`);
  };

  // Download card as image
  const downloadCard = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
      });
      const link = document.createElement('a');
      const optionSuffix = isOption ? `_${idea.optionType?.toUpperCase()}_${idea.strikePrice}` : '';
      link.download = `${idea.symbol}${optionSuffix}_${idea.direction}_trade.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast({ title: "Downloaded!", description: `Trade card saved as image` });
    } catch (e) {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  // Get actual drivers from idea data
  const ideaDrivers = useMemo(() => getIdeaDrivers(idea), [idea]);

  // Discord share mutation - uses apiRequest for CSRF token
  const shareToDiscord = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/trade-ideas/${idea.id}/share-discord`);
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
      const reward = Math.abs(safeNumber(idea.targetPrice) - safeNumber(idea.entryPrice));
      const risk = Math.abs(safeNumber(idea.entryPrice) - safeNumber(idea.stopLoss));
      if (risk > 0) return safeToFixed(reward / risk, 1);
    }
    return safeToFixed(idea.riskRewardRatio, 1, '—');
  }, [idea]);

  return (
    <Card 
      ref={cardRef} 
      className={cn(
        "bg-card/60 border-border/50 overflow-hidden transition-all cursor-pointer",
        expanded ? "ring-1 ring-cyan-500/50" : "hover:border-border hover:-translate-y-0.5"
      )}
      onClick={() => onViewDetails ? onViewDetails(idea) : handleNavigate()}
      data-testid={`trade-card-${idea.symbol}`}
    >
      {/* Compact Card Content - Click opens detail modal */}
      <div className="p-4">
        {/* Header Row: Symbol + Direction Badge + Option Details + Confidence */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs",
              isLong ? "bg-gradient-to-br from-emerald-500 to-green-600" : "bg-gradient-to-br from-red-500 to-rose-600",
              "text-foreground"
            )}>
              {idea.symbol.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-foreground">{idea.symbol}</span>
                {isOption && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-semibold",
                    isCall ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
                  )}>
                    {idea.optionType?.toUpperCase()} ${safeToFixed(idea.strikePrice, 0)}
                  </span>
                )}
                {isOption && expiryFormatted && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                    {expiryFormatted}
                  </span>
                )}
                {!isOption && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                    isLong ? "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" : "bg-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]"
                  )}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </span>
                )}
                <FreshnessPillInline idea={idea} />
              </div>
              <span className="text-[10px] text-muted-foreground">{idea.holdingPeriod || 'Swing'} • Grade {grade}</span>
            </div>
          </div>
          <div
            className="text-right"
            title={`Conviction score ${numericScore} (${grade})`}
          >
            <div className={cn(
              "text-2xl font-bold tabular-nums",
              grade.startsWith('A') ? "text-[var(--trade-bullish)]" : grade.startsWith('B') ? "text-[var(--trade-neutral)]" : "text-muted-foreground"
            )}>
              {grade}
            </div>
            <span className="text-[9px] text-muted-foreground">grade · {numericScore}</span>
          </div>
        </div>

        {/* Driver Tags - What's propelling this idea */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ideaDrivers.map((driver) => (
            <span key={driver.type} className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium",
              driver.bgColor, driver.color
            )}>
              <driver.icon className="w-3 h-3" />
              <span>{driver.label}</span>
            </span>
          ))}
          {topSignals.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-muted/50 text-foreground/80">
              +{topSignals.length} signals
            </span>
          )}
        </div>

        {/* Price Levels - Compact Row */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-[var(--surface-raised)] text-xs">
          <div className="text-center">
            <div className="text-muted-foreground text-[10px]">Entry</div>
            <div className="font-semibold text-foreground">${safeToFixed(idea.entryPrice, 2, '—')}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground text-[10px]">Target</div>
            <div className="font-semibold text-[var(--trade-bullish)]">${safeToFixed(idea.targetPrice, 2, '—')}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground text-[10px]">Stop</div>
            <div className="font-semibold text-[var(--trade-bearish)]">${safeToFixed(idea.stopLoss, 2, '—')}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground text-[10px]">R:R</div>
            <div className="font-semibold text-[var(--trade-bullish)]">1:{riskReward}</div>
          </div>
        </div>

        {/* Quick preview toggle + View full analysis hint */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground/80 transition-colors"
          >
            <ChevronRight className={cn(
              "w-4 h-4 transition-transform",
              expanded && "rotate-90"
            )} />
            <span>{expanded ? 'Hide preview' : 'Quick preview'}</span>
          </button>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Eye className="w-3 h-3" /> Click for full analysis
          </span>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-border/50 p-4 space-y-3 bg-gray-50 dark:bg-card/40">
          {/* Options Details */}
          {isOption && (idea.strikePrice || idea.expiryDate) && (
            <div className="flex items-center gap-4 p-2 bg-gray-100 dark:bg-muted/30 rounded-lg text-xs">
              <div className="flex items-center gap-1">
                <Target className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Strike:</span>
                <span className="font-mono text-foreground">${safeToFixed(idea.strikePrice, 2, '—')}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Exp:</span>
                <span className="font-mono text-foreground">{idea.expiryDate || '—'}</span>
              </div>
            </div>
          )}

          {/* Deep Analysis - Full Signal Breakdown */}
          {idea.convergenceSignalsJson && (
            <DeepAnalysisPanel
              analysis={idea.convergenceSignalsJson}
              symbol={idea.symbol}
              direction={(idea.direction?.toLowerCase() || 'long') as 'long' | 'short'}
              defaultExpanded={false}
            />
          )}

          {/* Analysis */}
          {idea.analysis && (
            <div>
              <h4 className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 flex items-center gap-1">
                <Brain className="w-3 h-3" /> Analysis
              </h4>
              <p className="text-xs text-foreground/80 leading-relaxed">{idea.analysis}</p>
            </div>
          )}

          {/* Catalyst */}
          {idea.catalyst && (
            <div className="p-2 bg-[var(--trade-neutral)]/10 rounded-lg border border-[var(--trade-neutral)]/20">
              <h4 className="text-[10px] font-semibold text-[var(--trade-neutral)] uppercase mb-1 flex items-center gap-1">
                <Zap className="w-3 h-3" /> Catalyst
              </h4>
              <p className="text-xs text-amber-300">{idea.catalyst}</p>
            </div>
          )}

          {/* Source Engine + Timestamp - use firstGeneratedAt for when signal first appeared */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>First signal:</span>
            <span className="font-medium text-[var(--trade-bullish)]">
              {(idea as any).source === 'tradingview' ? '📺 TV Signal' : (idea.dataSourceUsed || idea.source || 'scanner').replace(/_/g, ' ')}
            </span>
            {idea.timestamp && (
              <span className="text-muted-foreground">
                {getRelativeTime(idea.timestamp)}
              </span>
            )}
          </div>

          {/* Quality Signals */}
          {idea.qualitySignals && idea.qualitySignals.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {idea.qualitySignals.slice(0, 6).map((signal, idx) => (
                <Badge key={idx} variant="outline" className="text-[9px] bg-muted px-1.5 py-0.5">
                  {signal}
                </Badge>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            {onViewDetails && (
              <Button
                size="sm"
                className="flex-1 h-8 bg-emerald-600 hover:bg-[var(--trade-bullish)] text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(idea);
                }}
              >
                <Sparkles className="w-3 h-3 mr-1" /> Quick View
              </Button>
            )}
            <Link href={`/terminal/${idea.symbol}`} className="flex-1">
              <Button size="sm" variant="outline" className="w-full h-8 border-cyan-500/40 text-[var(--trade-bullish)] hover:bg-[var(--trade-bullish)]/10 text-xs">
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
              data-testid="button-share-discord"
            >
              <SiDiscord className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 bg-muted/20 border-muted-foreground/40 hover:bg-muted/30 text-muted-foreground text-xs"
              onClick={(e) => {
                e.stopPropagation();
                downloadCard();
              }}
              data-testid="button-download-card"
            >
              <Download className="w-3 h-3" />
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
  // U2: canonical grade
  const grade = displayedGrade(idea as any);
  const numericScore = displayedScore(idea as any);

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
          content: `Technical indicators suggest ${isLong ? 'bullish' : 'bearish'} momentum. ${technicalSignals.slice(0, 2).join('. ')}. Risk/Reward ratio: ${safeToFixed(idea.riskRewardRatio, 1, '—')}:1.`
        });
      }
    }

    // Sentiment/Momentum Report
    reports.push({
      title: 'Momentum Assessment',
      type: 'ai',
      content: `${idea.symbol} exhibits ${grade.startsWith('A') ? 'strong' : grade.startsWith('B') ? 'moderate' : 'weak'} ${isLong ? 'bullish' : 'bearish'} characteristics — conviction grade ${grade} (score ${numericScore}). ${idea.holdingPeriod === 'day' ? 'Suitable for day trading timeframe.' : 'Consider swing trade positioning.'}`
    });

    // Risk Assessment
    const potentialGain = idea.targetPrice && idea.entryPrice
      ? ((safeNumber(idea.targetPrice) - safeNumber(idea.entryPrice)) / safeNumber(idea.entryPrice) * 100)
      : 0;
    const potentialLoss = idea.stopLoss && idea.entryPrice
      ? ((safeNumber(idea.entryPrice) - safeNumber(idea.stopLoss)) / safeNumber(idea.entryPrice) * 100)
      : 0;

    reports.push({
      title: 'Risk Profile',
      type: 'quant',
      content: `Maximum upside: +${safeToFixed(potentialGain, 1)}% to target. Defined risk: -${safeToFixed(potentialLoss, 1)}% to stop. ${potentialGain > potentialLoss * 2 ? 'Favorable risk/reward setup.' : 'Standard risk parameters.'}`
    });

    return reports;
  }, [idea, isLong, grade]);

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <BarChart3 className="w-3 h-3" /> Research Reports
      </h4>
      <div className="space-y-2">
        {insights.map((report, idx) => (
          <div
            key={idx}
            className="bg-gray-100 dark:bg-muted/30 rounded-lg p-3 border border-border/30"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold",
                  report.type === 'ai' ? "bg-purple-500/20 text-purple-400" : "bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]"
                )}>
                  {report.type === 'ai' ? 'AI' : 'Q'}
                </div>
                <span className="text-xs font-medium text-foreground">{report.title}</span>
              </div>
              <Badge variant="outline" className="text-[8px] px-1.5 py-0">
                QuantEdge
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{report.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Legacy row component for compact views
function TradeIdeaRow({ idea }: { idea: TradeIdea }) {
  // U2: canonical grade
  const grade = displayedGrade(idea as any);
  const numericScore = displayedScore(idea as any);
  const style = getGradeStyle(grade);
  const isLong = idea.direction === 'LONG' || idea.direction === 'long';
  const isOption = idea.assetType === 'option' || idea.optionType;

  return (
    <Link href={`/terminal/${idea.symbol}`}>
      <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-muted/30 hover:bg-gray-50 dark:bg-[var(--surface-raised)] border border-border/30 hover:border-border/50 transition-all cursor-pointer group">
        <div className="flex items-center gap-3 min-w-[140px]">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-foreground text-sm">{idea.symbol}</span>
              {isOption && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  {idea.optionType?.toUpperCase() || 'OPT'}
                </Badge>
              )}
            </div>
            <div className={cn("flex items-center gap-1 text-xs",
              isLong ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
            )}>
              {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{isLong ? 'LONG' : 'SHORT'}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Badge
            className={cn("text-xs font-bold px-2 py-0.5", style.bgClass, style.textClass)}
            title={`Conviction score ${numericScore} (${grade})`}
          >
            {grade}
          </Badge>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div className="text-right">
            <div className="text-muted-foreground">Entry</div>
            <div className="font-mono text-foreground">${safeToFixed(idea.entryPrice, 2, '—')}</div>
          </div>
          <div className="text-right">
            <div className="text-[var(--trade-bullish)]">Target</div>
            <div className="font-mono text-[var(--trade-bullish)]">${safeToFixed(idea.targetPrice, 2, '—')}</div>
          </div>
          <div className="text-right">
            <div className="text-[var(--trade-bearish)]">Stop</div>
            <div className="font-mono text-[var(--trade-bearish)]">${safeToFixed(idea.stopLoss, 2, '—')}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </div>
      </div>
    </Link>
  );
}

// ============================================
// TRADE IDEAS LIST (Full Page View with 2-Column Grid)
// ============================================
interface TradeIdeasListProps {
  ideas: TradeIdea[];
  title?: string;
  onViewDetails?: (idea: TradeIdea) => void;
  // Server-side date filter control (for syncing with parent state)
  serverDateFilter?: 'today' | 'week' | 'all';
  onServerDateFilterChange?: (filter: 'today' | 'week' | 'all') => void;
}

function TradeIdeasList({ ideas, title, onViewDetails, serverDateFilter = 'today', onServerDateFilterChange }: TradeIdeasListProps) {
  // Pre-fill search from ?symbol= query param (cross-link from GEX Hub)
  const initialSearchFromQuery = (() => {
    if (typeof window === 'undefined') return '';
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get('symbol') || '').toUpperCase();
    } catch {
      return '';
    }
  })();
  const [search, setSearch] = useState(initialSearchFromQuery);
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all"); // Show all grades by default
  const [statusFilter, setStatusFilter] = useState<string>("all"); // Show all statuses by default
  // NOTE: Date filter now controlled by serverDateFilter (server-side filtering)
  // Local dateFilter for additional client-side granularity (yesterday, specific days)
  // DEFAULT TO 'today' as extra safeguard against showing old trades
  const [dateFilter, setDateFilter] = useState<string>("today");
  const [tradeTypeFilter, setTradeTypeFilter] = useState<string>("all"); // Day Trade, Swings, LEAPs
  const [sortBy, setSortBy] = useState<string>("confidence");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Generate date options with week/month ranges plus individual days
  const dateOptions = useMemo(() => {
    const options = [
      { value: 'all', label: 'All Dates' },
      { value: 'today', label: 'Today' },
      { value: 'yesterday', label: 'Yesterday' },
      { value: 'week', label: 'Past Week' },
      { value: 'month', label: 'Past Month' },
    ];
    const today = new Date();
    for (let i = 2; i <= 6; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      options.push({ value: dateStr, label });
    }
    return options;
  }, []);

  const filteredIdeas = useMemo(() => {
    let filtered = [...ideas];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(i => {
        if (statusFilter === 'open') return i.outcomeStatus === 'open' || !i.outcomeStatus;
        if (statusFilter === 'closed') return i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'hit_stop' || i.outcomeStatus === 'expired';
        return i.outcomeStatus === statusFilter;
      });
    }

    // Date filter - use ET timezone to match server filtering
    if (dateFilter !== 'all') {
      // Get today's date in ET timezone (matches server)
      const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const todayStrET = `${nowET.getFullYear()}-${String(nowET.getMonth() + 1).padStart(2, '0')}-${String(nowET.getDate()).padStart(2, '0')}`;

      // Calculate date strings for comparison
      const yesterdayET = new Date(nowET);
      yesterdayET.setDate(yesterdayET.getDate() - 1);
      const yesterdayStrET = `${yesterdayET.getFullYear()}-${String(yesterdayET.getMonth() + 1).padStart(2, '0')}-${String(yesterdayET.getDate()).padStart(2, '0')}`;

      filtered = filtered.filter(i => {
        if (!i.timestamp) return false;

        // Convert idea timestamp to ET date string for comparison
        const ideaDateUTC = new Date(i.timestamp);
        const ideaDateStrET = ideaDateUTC.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format

        if (dateFilter === 'today') {
          return ideaDateStrET === todayStrET;
        } else if (dateFilter === 'yesterday') {
          return ideaDateStrET === yesterdayStrET;
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(nowET);
          weekAgo.setDate(weekAgo.getDate() - 7);
          const weekAgoStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;
          return ideaDateStrET >= weekAgoStr && ideaDateStrET <= todayStrET;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(nowET);
          monthAgo.setDate(monthAgo.getDate() - 30);
          const monthAgoStr = `${monthAgo.getFullYear()}-${String(monthAgo.getMonth() + 1).padStart(2, '0')}-${String(monthAgo.getDate()).padStart(2, '0')}`;
          return ideaDateStrET >= monthAgoStr && ideaDateStrET <= todayStrET;
        } else {
          // Specific date (YYYY-MM-DD format)
          return ideaDateStrET === dateFilter;
        }
      });
    }

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

    // Trade type filter (Day Trade, Swings, LEAPs) - based on DTE
    if (tradeTypeFilter !== 'all') {
      filtered = filtered.filter(i => {
        // Calculate DTE from expiry date
        const expiry = i.expiryDate || (i as any).expiration;
        if (!expiry) {
          // No expiry = stock/crypto, treat as swing
          return tradeTypeFilter === 'swing';
        }
        const expiryDate = new Date(expiry);
        const now = new Date();
        const dte = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (tradeTypeFilter === 'daytrade') {
          // Day trade: 0-3 DTE (same day to 3 days out)
          return dte >= 0 && dte <= 3;
        }
        if (tradeTypeFilter === 'swing') {
          // Swing: 4-45 DTE (up to ~6 weeks)
          return dte > 3 && dte <= 45;
        }
        if (tradeTypeFilter === 'leaps') {
          // LEAPs: 46+ DTE (long-term options)
          return dte > 45;
        }
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
  }, [ideas, search, directionFilter, gradeFilter, statusFilter, dateFilter, tradeTypeFilter, sortBy]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
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
      <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-100/60 dark:bg-card/40 rounded-xl border border-border/60">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search symbols..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-gray-50 dark:bg-[var(--surface-raised)] border-border/50"
          />
        </div>

        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[130px] bg-gray-50 dark:bg-[var(--surface-raised)] border-border/50">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Directions</SelectItem>
            <SelectItem value="long">Long / Calls</SelectItem>
            <SelectItem value="short">Short / Puts</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] bg-gray-50 dark:bg-[var(--surface-raised)] border-border/50">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="hit_target">Hit Target</SelectItem>
            <SelectItem value="hit_stop">Stopped Out</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="closed">All Closed</SelectItem>
          </SelectContent>
        </Select>

        {/* Server-side Date Filter (controls API call) */}
        {onServerDateFilterChange ? (
          <Select
            value={serverDateFilter || 'today'}
            onValueChange={(v) => onServerDateFilterChange(v as 'today' | 'week' | 'all')}
          >
            <SelectTrigger className="w-[140px] bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today Only</SelectItem>
              <SelectItem value="week">Past Week</SelectItem>
              <SelectItem value="all">All Ideas</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[140px] bg-gray-50 dark:bg-[var(--surface-raised)] border-border/50">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              {dateOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-[130px] bg-gray-50 dark:bg-[var(--surface-raised)] border-border/50">
            <SelectValue placeholder="Grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            <SelectItem value="quality">Quality (A-B)</SelectItem>
            <SelectItem value="elite">Elite (A only)</SelectItem>
            <SelectItem value="strong">Strong (B only)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tradeTypeFilter} onValueChange={setTradeTypeFilter}>
          <SelectTrigger className="w-[130px] bg-gray-50 dark:bg-[var(--surface-raised)] border-border/50">
            <SelectValue placeholder="Trade Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="daytrade">Day Trade (0-3 DTE)</SelectItem>
            <SelectItem value="swing">Swing (4-45 DTE)</SelectItem>
            <SelectItem value="leaps">LEAPs (45+ DTE)</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[140px] bg-gray-50 dark:bg-[var(--surface-raised)] border-border/50">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="confidence">Confidence</SelectItem>
            <SelectItem value="recent">Most Recent</SelectItem>
            <SelectItem value="symbol">Symbol A-Z</SelectItem>
          </SelectContent>
        </Select>

        <div className="text-xs text-muted-foreground">
          {filteredIdeas.length} ideas
        </div>
      </div>

      {/* Ideas Display */}
      {filteredIdeas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No ideas match current filters — try broadening</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* 2-Column Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[700px] overflow-y-auto pr-2">
          {filteredIdeas.slice(0, 100).map((idea) => (
            <TradeIdeaCard
              key={idea.id || `${idea.symbol}-${idea.timestamp}`}
              idea={idea}
              expanded={expandedId === (idea.id || `${idea.symbol}-${idea.timestamp}`)}
              onToggle={() => toggleExpand(idea.id || `${idea.symbol}-${idea.timestamp}`)}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
          {filteredIdeas.slice(0, 100).map((idea) => (
            <TradeIdeaRow key={idea.id || `${idea.symbol}-${idea.timestamp}`} idea={idea} />
          ))}
        </div>
      )}

      {filteredIdeas.length > 100 && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Showing 100 of {filteredIdeas.length} ideas
        </div>
      )}
    </div>
  );
}

// ============================================
// WEEKLY SWING LOOKOUTS
// ============================================
interface SwingLookout {
  symbol: string;
  direction: string;
  convictionScore: number;
  convictionBand: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  thesis: string;
  holdingPeriod: string;
  source: string;
  layers: string[];
  ageHours: number;
}

function WeeklySwingLookouts() {
  const scannerInterval = useMarketPoll(POLL.HEAVY.open, POLL.HEAVY.closed);
  const { data, isLoading } = useQuery<{ lookouts: SwingLookout[]; totalCandidates: number; generatedAt: string }>({
    queryKey: ['/api/discovery/weekly-swing-lookouts'],
    refetchInterval: scannerInterval,
    staleTime: 5 * 60_000,
  });

  const lookouts = data?.lookouts || [];

  return (
    <Card className="border-border/30 bg-card/50">
      <div className="p-4 border-b border-border/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--brand-teal)]" />
            <h3 className="text-sm font-semibold">Next Week Swing Lookouts</h3>
            <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 font-mono bg-[var(--brand-teal)]/10 text-[var(--brand-teal)] border-[var(--brand-teal)]/30">
              {lookouts.length} setups
            </Badge>
          </div>
          {data?.generatedAt && (
            <div className="flex items-center gap-1.5">
              {(() => {
                const sb = getIdeaSessionBadge(data.generatedAt);
                return sb ? <span className={sb.cls}>{sb.label}</span> : null;
              })()}
              <span className={cn(componentStyles.text.chromeLabel, "text-muted-foreground/60")}>
                {getRelativeTime(data.generatedAt)}
              </span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Swing candidates building conviction — 7-day lookback, sorted by confluence score
        </p>
      </div>
      <div className="divide-y divide-border/10">
        {isLoading && (
          <div className="p-6 text-center text-xs text-muted-foreground">Scanning for swing setups...</div>
        )}
        {!isLoading && lookouts.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">No swing lookouts found — check back during market hours</div>
        )}
        {lookouts.map((l) => {
          const isLong = l.direction?.toLowerCase() === 'long';
          const rr = l.stopLoss && l.entryPrice && l.targetPrice
            ? Math.abs(l.targetPrice - l.entryPrice) / Math.abs(l.entryPrice - l.stopLoss)
            : 0;
          return (
            <Link key={l.symbol} href={`/terminal/${l.symbol}`}>
              <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 cursor-pointer transition-colors">
                <div className="w-14">
                  <span className="text-xs font-bold">{l.symbol}</span>
                  <div className={`text-[9px] font-mono ${isLong ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
                    {isLong ? '▲ LONG' : '▼ SHORT'}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[8px] px-1 py-0 h-4 font-mono ${
                  l.convictionBand === 'S' || l.convictionBand?.startsWith('A') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                  l.convictionBand?.startsWith('B') ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
                  'bg-muted/20 text-muted-foreground border-border/30'
                }`}>
                  {l.convictionBand || '—'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate">{l.thesis || l.layers?.join(' · ') || '—'}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-[10px] font-mono">${l.entryPrice?.toFixed(2)}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">
                    T: ${l.targetPrice?.toFixed(2)} · S: ${l.stopLoss?.toFixed(2)}
                    {rr > 0 && ` · ${rr.toFixed(1)}R`}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================
// MAIN TRADE DESK COMPONENT
// ============================================
export default function TradeDeskRedesigned() {
  const { toast } = useToast();
  const [location] = useLocation();

  // Detect sub-page from path
  const getInitialTab = () => {
    if (location.includes("/flow") || location.includes("/levels") || location.includes("/gex")) return "flow";
    if (location.includes("/strategy") || location.includes("/options")) return "strategy";
    if (location.includes("/best-setups") || location.includes("/movers") || location.includes("/breakouts")) return "ideas";
    return "ideas"; // Default to Today's Plays tab
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
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

  useEffect(() => {
    // Minimum 500ms loading animation for smooth entry
    const minLoadTime = setTimeout(() => {
      if (!isLoading) {
        setShowInitialLoader(false);
      }
    }, 500);

    return () => clearTimeout(minLoadTime);
  }, []);

  // When data finishes loading after min time, hide loader
  useEffect(() => {
    if (!isLoading && showInitialLoader) {
      const timer = setTimeout(() => setShowInitialLoader(false), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, showInitialLoader]);

  // Show loading skeleton during initial load
  if (showInitialLoader || isLoading) {
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
            <span className={cn(componentStyles.text.chromeLabel, "text-muted-foreground/50")}>
              {serverDateFilter === 'today' ? 'TODAY' : serverDateFilter === 'week' ? 'PAST WEEK' : 'ALL TIME'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Global data timestamp */}
            <span className={cn(componentStyles.text.chromeLabel, "text-muted-foreground/50 tabular-nums")}>
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
          <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono tabular-nums">{filteredIdeas.length} ideas</span>
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

        {/* Navigation Tabs — Bloomberg density */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-transparent border-b border-border/40 w-full justify-start gap-0 h-auto p-0 rounded-none">
            <TabsTrigger value="ideas" className={componentStyles.tab.underline}>
              <Layers className="w-3 h-3 mr-1 opacity-60" />
              Plays
            </TabsTrigger>
            <TabsTrigger value="flow" className={componentStyles.tab.underline}>
              <Activity className="w-3 h-3 mr-1 opacity-60" />
              Flow
            </TabsTrigger>
            <TabsTrigger value="strategy" className={componentStyles.tab.underline}>
              <Target className="w-3 h-3 mr-1 opacity-60" />
              Strategy
            </TabsTrigger>
          </TabsList>

          {/* TODAY'S PLAYS TAB */}
          <TabsContent value="ideas" className="space-y-3 mt-3">
            {/* PRE-MARKET GAPPERS — overnight movers from weekly + approved universe */}
            <PreMarketGappersCard />

            {/* TRADE IDEAS — new Convictions-style panel with filters, presets, view modes, drawer */}
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
          </TabsContent>

          {/* FLOW & LEVELS TAB - GEX, Dark Pool, Whale Flow */}
          <TabsContent value="flow" className="space-y-4 mt-4">
            <FlowLevelsPanel />
          </TabsContent>

          {/* STRATEGY TAB - Weekly Lookouts + Options Builder */}
          <TabsContent value="strategy" className="space-y-4 mt-4">
            <WeeklySwingLookouts />
            <StrategyLab />
            <div className="flex justify-end">
              <Link href="/strategy-playbooks">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground gap-1">
                  Browse Strategy Playbooks <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </TabsContent>
        </Tabs>
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
