import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, formatCTTime } from "@/lib/utils";
import { formatInUserTZ, formatTimeUntilExpiry, formatDateOnly } from "@/lib/timezone";
import { ChevronDown, TrendingUp, TrendingDown, Star, Eye, Clock, ArrowUpRight, ArrowDownRight, Maximize2, ExternalLink, CalendarClock, CalendarDays, Calendar, Timer, Bot, BarChart3, Activity, Shield, Target as TargetIcon, Sparkles, Newspaper, HelpCircle, Info, Database, TrendingUpIcon, Zap, UserPlus, AlertTriangle, FileSearch } from "lucide-react";
import { Link } from "wouter";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExplainabilityPanel } from "@/components/explainability-panel";
import { TradeIdeaDetailModal } from "@/components/trade-idea-detail-modal";
import { TradingAdvice } from "@/components/trading-advice";
import { ManualOutcomeRecorder } from "@/components/manual-outcome-recorder";
import { SignalFiltersDisplay } from "@/components/signal-filters-display";
import { MiniSparkline } from "@/components/mini-sparkline";
import { SignalStrengthBars } from "@/components/signal-strength-bars";
import { EnhancedCountdown } from "@/components/enhanced-countdown";
import { TimingDisplay } from "@/components/timing-display";
import { HistoricalPerformanceBadge } from "@/components/historical-performance-badge";
import { SignalStrengthBadge } from "@/components/signal-strength-badge";
import { getPerformanceGrade } from "@/lib/performance-grade";
import type { TradeIdea, Catalyst } from "@shared/schema";

interface TradeIdeaBlockProps {
  idea: TradeIdea;
  currentPrice?: number;
  catalysts?: Catalyst[];
  onAddToWatchlist?: (idea: TradeIdea) => void;
  onViewDetails?: (symbol: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: (ideaId: string) => void;
}

export function TradeIdeaBlock({ idea, currentPrice, catalysts = [], onAddToWatchlist, onViewDetails, isExpanded, onToggleExpand }: TradeIdeaBlockProps) {
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const isOpen = isExpanded !== undefined ? isExpanded : localIsOpen;
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [priceUpdated, setPriceUpdated] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const prevPriceRef = useRef<number | undefined>(currentPrice);
  const { toast } = useToast();

  // Fetch sparkline data for mini chart (only for open ideas)
  const { data: sparklineData } = useQuery<{ symbol: string; prices: number[]; currentPrice: number }>({
    queryKey: ['/api/sparkline', idea.symbol],
    queryFn: async () => {
      const response = await fetch(`/api/sparkline/${idea.symbol}`);
      if (!response.ok) throw new Error('Failed to fetch sparkline data');
      return response.json();
    },
    enabled: idea.outcomeStatus === 'open' && idea.assetType !== 'option', // Skip options
    staleTime: 300000, // Cache for 5 minutes
    refetchInterval: 600000, // Refresh every 10 minutes (sparklines don't need frequent updates)
  });

  useEffect(() => {
    if (currentPrice !== undefined && prevPriceRef.current !== undefined && currentPrice !== prevPriceRef.current) {
      setPriceUpdated(true);
      setLastUpdateTime(new Date());
      prevPriceRef.current = currentPrice;
      const timer = setTimeout(() => setPriceUpdated(false), 300);
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  const isLong = idea.direction === 'long';
  // Price change calculation that respects trade direction
  const priceChangePercent = currentPrice 
    ? isLong
      ? ((currentPrice - idea.entryPrice) / idea.entryPrice) * 100
      : ((idea.entryPrice - currentPrice) / idea.entryPrice) * 100
    : 0;

  // Helper: Get quick timing status for collapsed view
  const getQuickTimingStatus = (): { text: string; color: string; urgent: boolean } => {
    const now = new Date();
    
    if (idea.outcomeStatus !== 'open') {
      return { text: 'Closed', color: 'text-muted-foreground', urgent: false };
    }
    
    if (idea.entryValidUntil) {
      const entryDeadline = new Date(idea.entryValidUntil);
      const minsRemaining = Math.floor((entryDeadline.getTime() - now.getTime()) / 60000);
      
      if (minsRemaining <= 0) {
        return { text: 'Entry expired', color: 'text-red-400', urgent: false };
      } else if (minsRemaining <= 15) {
        return { text: `${minsRemaining}m left`, color: 'text-amber-400', urgent: true };
      } else if (minsRemaining <= 60) {
        return { text: `${minsRemaining}m left`, color: 'text-amber-400', urgent: false };
      } else {
        const hrs = Math.floor(minsRemaining / 60);
        return { text: `${hrs}h ${minsRemaining % 60}m`, color: 'text-green-400', urgent: false };
      }
    }
    
    return { text: 'Active', color: 'text-green-400', urgent: false };
  };

  const quickTiming = getQuickTimingStatus();

  // Helper: Map IdeaSource to badge configuration
  const getSourceBadgeConfig = (source: string, isLotto: boolean) => {
    if (isLotto) {
      return {
        label: 'LOTTO',
        icon: Zap,
        className: 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/50'
      };
    }
    
    switch (source) {
      case 'ai':
        return {
          label: 'AI',
          icon: Bot,
          className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/50'
        };
      case 'quant':
        return {
          label: 'QUANT',
          icon: BarChart3,
          className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50'
        };
      case 'hybrid':
        return {
          label: 'HYBRID',
          icon: Sparkles,
          className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/50'
        };
      case 'flow':
        return {
          label: 'FLOW',
          icon: Activity,
          className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50'
        };
      case 'news':
        return {
          label: 'NEWS',
          icon: Newspaper,
          className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/50'
        };
      case 'manual':
        return {
          label: 'MANUAL',
          icon: UserPlus,
          className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/50'
        };
      default:
        return {
          label: source.toUpperCase(),
          icon: Database,
          className: 'bg-muted/50 text-muted-foreground border-border'
        };
    }
  };

  const sourceBadge = getSourceBadgeConfig(idea.source, idea.isLottoPlay || false);

  const handleToggle = (newOpenState: boolean) => {
    if (onToggleExpand) {
      if (newOpenState || isOpen) {
        onToggleExpand(idea.id);
      }
    } else {
      setLocalIsOpen(newOpenState);
    }
  };

  // Check for upcoming earnings within 3 days
  const getUpcomingEarnings = (): Catalyst | null => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000));
    
    const earningsCatalyst = catalysts.find(c => 
      c.symbol === idea.symbol && 
      c.eventType === 'earnings' &&
      new Date(c.timestamp) >= now &&
      new Date(c.timestamp) <= threeDaysFromNow
    );
    
    return earningsCatalyst || null;
  };

  const upcomingEarnings = getUpcomingEarnings();

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleToggle}
      className="group"
    >
      <CollapsibleTrigger className="w-full" data-testid={`block-trade-idea-${idea.symbol}`}>
        {/* ===== COLLAPSED VIEW - Minimal, Clean ===== */}
        <div className={cn(
          "p-3 border rounded-lg bg-card hover-elevate transition-all",
          isOpen && "rounded-b-none border-b-0"
        )}>
          <div className="flex items-center justify-between gap-3">
            {/* Left: Identity - Symbol + Core Badges */}
            <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap overflow-hidden">
              {/* Symbol */}
              <h3 className="text-lg font-bold font-mono flex-shrink-0" data-testid={`text-symbol-${idea.symbol}`}>
                {idea.symbol}
              </h3>
              
              {/* Source Badge */}
              <Badge 
                variant="outline"
                className={cn("font-semibold border text-[10px] h-5 flex-shrink-0", sourceBadge.className)}
                data-testid={`badge-source-${idea.symbol}`}
              >
                <sourceBadge.icon className="h-2.5 w-2.5 mr-1" />
                {sourceBadge.label}
              </Badge>
              
              {/* Direction Badge */}
              <Badge 
                variant={isLong ? "default" : "destructive"}
                className="font-semibold text-[10px] h-5 flex-shrink-0"
                data-testid={`badge-direction-${idea.symbol}`}
              >
                {isLong ? (
                  <><ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />LONG</>
                ) : (
                  <><ArrowDownRight className="h-2.5 w-2.5 mr-0.5" />SHORT</>
                )}
              </Badge>

              {/* Asset Type - Only show for options (important distinction) */}
              {idea.assetType === 'option' && (
                <Badge variant="outline" className="text-[10px] h-5 font-semibold uppercase bg-purple-500/20 text-purple-400 border-purple-500/40 flex-shrink-0 whitespace-nowrap">
                  OPT
                </Badge>
              )}

              {/* Urgent earnings warning - only show if catalysts array actually contains earnings */}
              {upcomingEarnings && catalysts.length > 0 && (
                <Badge variant="destructive" className="font-semibold text-[10px] h-5 flex-shrink-0">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                  EARNINGS
                </Badge>
              )}
              
              {/* Historical Performance Badge - Data-backed insights */}
              <HistoricalPerformanceBadge
                symbol={idea.symbol}
                engine={idea.source || 'unknown'}
                confidenceScore={idea.confidenceScore || undefined}
                compact={true}
              />
            </div>

            {/* Center: Quick Metrics */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* R:R Ratio - Clear badge format */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[10px] h-5 font-mono px-2 bg-background/80 border-muted-foreground/20 cursor-help whitespace-nowrap">
                    <span className="text-muted-foreground mr-1">R:R</span>
                    <span className={cn(
                      "font-bold",
                      idea.riskRewardRatio >= 2 ? "text-green-400" : 
                      idea.riskRewardRatio >= 1.5 ? "text-cyan-400" : 
                      "text-amber-400"
                    )}>
                      {idea.riskRewardRatio?.toFixed(1) || '—'}
                    </span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Risk:Reward Ratio</p>
                  <p className="text-xs text-muted-foreground">Potential gain vs. potential loss</p>
                </TooltipContent>
              </Tooltip>

              {/* Signal Strength Badge - Shows consensus, not probability */}
              <SignalStrengthBadge
                signalCount={idea.qualitySignals?.length || 0}
                engine={idea.source || 'unknown'}
                qualitySignals={idea.qualitySignals}
                compact={true}
              />

              {/* Timing Status - Compact */}
              <div className={cn(
                "text-xs font-medium",
                quickTiming.color,
                quickTiming.urgent && "animate-pulse"
              )}>
                {quickTiming.text}
              </div>

              {/* Outcome Badge for closed ideas */}
              {idea.outcomeStatus && idea.outcomeStatus !== 'open' && (
                <Badge 
                  variant={
                    idea.outcomeStatus === 'hit_target' ? 'default' : 
                    idea.outcomeStatus === 'hit_stop' ? 'destructive' : 
                    'secondary'
                  }
                  className="font-semibold text-[10px] h-5"
                  data-testid={`badge-outcome-${idea.symbol}`}
                >
                  {idea.outcomeStatus === 'hit_target' ? 'WON' :
                   idea.outcomeStatus === 'hit_stop' ? 'LOST' :
                   idea.outcomeStatus === 'expired' ? 'EXPIRED' :
                   'CLOSED'}
                </Badge>
              )}
            </div>

            {/* Right: Expand Indicator */}
            <ChevronDown 
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
                isOpen && "rotate-180"
              )}
            />
          </div>
        </div>
      </CollapsibleTrigger>

      {/* ===== EXPANDED VIEW - Full Details ===== */}
      <CollapsibleContent>
        <div className="p-4 border border-t-0 rounded-b-lg bg-card space-y-4">
          
          {/* Secondary Badges Row - Sector, Risk, Liquidity */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Sector Focus Badge */}
            {idea.sectorFocus && idea.sectorFocus !== 'other' && (
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] h-5 font-semibold",
                  idea.sectorFocus === 'quantum_computing' ? "bg-violet-500/10 text-violet-400 border-violet-500/30" :
                  idea.sectorFocus === 'nuclear_fusion' ? "bg-orange-500/10 text-orange-400 border-orange-500/30" :
                  idea.sectorFocus === 'healthcare' ? "bg-rose-500/10 text-rose-400 border-rose-500/30" :
                  idea.sectorFocus === 'ai_ml' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" :
                  idea.sectorFocus === 'space' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30" :
                  idea.sectorFocus === 'clean_energy' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                  idea.sectorFocus === 'crypto' ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" :
                  idea.sectorFocus === 'fintech' ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                  "bg-muted/30 text-muted-foreground border-muted"
                )}
              >
                {idea.sectorFocus === 'quantum_computing' ? 'QUANTUM' :
                 idea.sectorFocus === 'nuclear_fusion' ? 'NUCLEAR' :
                 idea.sectorFocus === 'healthcare' ? 'HEALTH' :
                 idea.sectorFocus === 'ai_ml' ? 'AI/ML' :
                 idea.sectorFocus === 'space' ? 'SPACE' :
                 idea.sectorFocus === 'clean_energy' ? 'ENERGY' :
                 idea.sectorFocus === 'crypto' ? 'CRYPTO' :
                 'FINTECH'}
              </Badge>
            )}

            {/* Risk Profile Badge */}
            {idea.riskProfile && idea.riskProfile !== 'moderate' && (
              <Badge 
                variant="outline" 
                className={cn(
                  "text-[10px] h-5 font-semibold",
                  idea.riskProfile === 'speculative' ? "bg-red-500/10 text-red-400 border-red-500/30" :
                  idea.riskProfile === 'aggressive' ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                  "bg-green-500/10 text-green-400 border-green-500/30"
                )}
              >
                {idea.riskProfile?.toUpperCase()}
              </Badge>
            )}

            {/* Liquidity Warning */}
            {idea.liquidityWarning && (
              <Badge variant="outline" className="text-[10px] h-5 font-semibold bg-rose-500/10 text-rose-400 border-rose-500/30">
                LOW LIQ
              </Badge>
            )}

            {/* Lotto Play Badge */}
            {idea.isLottoPlay && (
              <Badge variant="outline" className="flex items-center gap-1 text-[10px] h-5 font-semibold bg-amber-500/10 text-amber-500 border-amber-500/30">
                <Zap className="h-2.5 w-2.5" />
                LOTTO
              </Badge>
            )}

            {/* Signal Count */}
            <SignalFiltersDisplay 
              qualitySignals={idea.qualitySignals}
              volatilityRegime={idea.volatilityRegime}
              sessionPhase={idea.sessionPhase}
              rsiValue={idea.rsiValue}
              volumeRatio={idea.volumeRatio}
              size="md" 
              showLabel={false}
            />

            {/* Signal Strength Bars - Conviction Visual */}
            {idea.qualitySignals && idea.qualitySignals.length > 0 && (
              <SignalStrengthBars 
                signals={idea.qualitySignals}
              />
            )}
          </div>

          {/* Timing Details with Countdown */}
          {idea.outcomeStatus === 'open' && (
            <div className="p-3 rounded-lg border bg-card/50">
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Timing</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground mb-0.5">Posted</div>
                  <div className="font-semibold">{formatInUserTZ(idea.timestamp, 'h:mm a')}</div>
                </div>
                {idea.entryValidUntil && (
                  <div>
                    <div className="text-muted-foreground mb-0.5">Entry Window</div>
                    <div className="font-semibold text-green-400">{formatInUserTZ(idea.entryValidUntil, 'h:mm a')}</div>
                    <EnhancedCountdown 
                      exitBy={idea.entryValidUntil} 
                      className="mt-1"
                    />
                  </div>
                )}
                {idea.exitBy && (
                  <div>
                    <div className="text-muted-foreground mb-0.5">Expires</div>
                    <div className="font-semibold text-amber-400">{formatInUserTZ(idea.exitBy, 'h:mm a')}</div>
                    <EnhancedCountdown 
                      exitBy={idea.exitBy}
                      assetType={idea.assetType}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Closed Trade Timing */}
          {idea.outcomeStatus !== 'open' && idea.exitDate && (
            <div className="p-3 rounded-lg border bg-card/50">
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Trade Duration</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground mb-0.5">Entry</div>
                  <div className="font-semibold">{formatInTimeZone(parseISO(idea.timestamp), 'America/Chicago', 'MMM d, h:mm a')}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Exit</div>
                  <div className="font-semibold">{formatInTimeZone(parseISO(idea.exitDate), 'America/Chicago', 'MMM d, h:mm a')}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Duration</div>
                  <div className="font-semibold">
                    {(() => {
                      const entryTime = parseISO(idea.timestamp);
                      const exitTime = parseISO(idea.exitDate);
                      const totalMins = Math.floor((exitTime.getTime() - entryTime.getTime()) / 60000);
                      const days = Math.floor(totalMins / 1440);
                      const hours = Math.floor((totalMins % 1440) / 60);
                      const mins = totalMins % 60;
                      if (days > 0) return `${days}d ${hours}h`;
                      if (hours > 0) return `${hours}h ${mins}m`;
                      return `${mins}m`;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Price Levels */}
          <div className="p-3 rounded-lg border bg-card/50">
            {/* Options: Premium indicator */}
            {idea.assetType === 'option' && (
              <div className="flex items-center gap-2 pb-2 mb-3 border-b border-purple-500/30">
                <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px]">
                  PREMIUM
                </Badge>
                <span className="text-[10px] text-muted-foreground">Option prices shown as contract premium</span>
              </div>
            )}

            {/* Live Price for Stocks */}
            {idea.assetType !== 'option' && currentPrice && (
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Activity className={cn("h-3 w-3 text-cyan-400", priceUpdated && "animate-pulse")} />
                  <span className={cn(
                    "text-lg font-bold font-mono transition-all",
                    priceUpdated && "scale-105",
                    priceChangePercent >= 0 ? "text-green-400" : "text-red-400"
                  )} data-testid={`text-current-price-${idea.symbol}`}>
                    {formatCurrency(currentPrice)}
                  </span>
                </div>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded",
                  priceChangePercent >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                )}>
                  {priceChangePercent >= 0 ? '+' : ''}{formatPercent(priceChangePercent)}
                </span>
              </div>
            )}

            {/* Entry/Target/Stop Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded bg-muted/30">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Entry</div>
                <div className="text-sm font-bold font-mono" data-testid={`text-entry-${idea.symbol}`}>
                  {formatCurrency(idea.entryPrice)}
                </div>
              </div>
              <div className="text-center p-2 rounded bg-green-500/10">
                <div className="text-[10px] text-green-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-0.5">
                  <TargetIcon className="h-2 w-2" />
                  Target
                </div>
                <div className="text-sm font-bold font-mono text-green-400">{formatCurrency(idea.targetPrice)}</div>
              </div>
              <div className="text-center p-2 rounded bg-red-500/10">
                <div className="text-[10px] text-red-400 uppercase tracking-wider mb-1 flex items-center justify-center gap-0.5">
                  <Shield className="h-2 w-2" />
                  Stop
                </div>
                <div className="text-sm font-bold font-mono text-red-400">{formatCurrency(idea.stopLoss)}</div>
              </div>
            </div>
            
            {/* Lotto Play Potential */}
            {idea.isLottoPlay && (
              <div className="mt-3 pt-3 border-t border-amber-500/30 bg-amber-500/5 rounded-lg p-3">
                <div className="text-sm text-amber-400 font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4" />
                    <span>Lotto Potential:</span>
                  </span>
                  <span className="text-lg">
                    {((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(0)}% 
                    <span className="text-xs ml-1">({(idea.targetPrice / idea.entryPrice).toFixed(0)}x)</span>
                  </span>
                </div>
              </div>
            )}

            {/* Mini Sparkline */}
            {idea.assetType !== 'option' && (
              sparklineData && sparklineData.prices.length > 0 ? (
                <div className="mt-3 rounded-lg border bg-background/50 p-2">
                  <MiniSparkline
                    data={sparklineData.prices}
                    targetPrice={idea.targetPrice}
                    stopLoss={idea.stopLoss}
                    entryPrice={idea.entryPrice}
                    direction={idea.direction as 'long' | 'short'}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-lg border bg-muted/30 p-2 text-center">
                  <span className="text-xs text-muted-foreground">Price chart unavailable</span>
                </div>
              )
            )}
          </div>

          {/* Option Contract Details */}
          {idea.assetType === 'option' && (
            <div className="p-3 rounded-lg border-2 bg-gradient-to-br from-purple-500/5 via-card to-purple-500/5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" />
                  Option Contract
                </div>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover-elevate" data-testid="button-option-info">
                      <HelpCircle className="h-4 w-4 text-cyan-400" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-cyan-400" />
                        Understanding Option Pricing
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                      <div className="p-4 rounded-lg bg-accent/20 border border-border">
                        <h3 className="font-bold text-cyan-400 mb-2">Where Does the Entry Premium Come From?</h3>
                        <p className="text-muted-foreground text-sm">
                          The Entry Premium of ${idea.entryPrice.toFixed(2)} comes from live market data
                          {idea.dataSourceUsed && <span className="text-cyan-400"> ({idea.dataSourceUsed})</span>}.
                          This is the actual market price traders pay for this option contract.
                        </p>
                        <div className="mt-3 p-3 bg-muted/50 rounded border-l-2 border-amber-500">
                          <p className="text-xs">
                            <span className="text-amber-400 font-bold">NOTE:</span> Option premium ≠ Stock price.
                            The premium is what you pay to BUY the option contract.
                          </p>
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-accent/20 border border-border">
                        <h3 className="font-bold text-purple-400 mb-2">Understanding Key Levels</h3>
                        <div className="space-y-2 text-muted-foreground text-sm">
                          <p><span className="font-semibold text-foreground">Entry:</span> The premium price when this pattern was identified</p>
                          <p><span className="font-semibold text-green-400">Target:</span> Potential profit level based on pattern analysis</p>
                          <p><span className="font-semibold text-red-400">Stop:</span> Risk management level to limit potential losses</p>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] text-cyan-400 mb-1 uppercase tracking-wider font-semibold">Type</div>
                  <div className={cn(
                    "text-lg font-bold font-mono uppercase",
                    idea.optionType === 'call' ? 'text-green-400' : 'text-red-400'
                  )}>
                    {idea.optionType || 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-400 mb-1 uppercase tracking-wider font-semibold">Strike</div>
                  <div className="text-lg font-bold font-mono text-amber-400">
                    {idea.strikePrice != null ? formatCurrency(idea.strikePrice) : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-purple-400 mb-1 uppercase tracking-wider font-semibold">Expiry</div>
                  <div className="text-lg font-bold font-mono text-purple-400">
                    {idea.expiryDate ? formatDateOnly(idea.expiryDate) : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Catalyst Text */}
          {idea.catalyst && (
            <div className="p-3 rounded-lg border bg-card/50">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Catalyst</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {idea.catalyst}
              </p>
            </div>
          )}

          {/* Confidence Score Detail */}
          {idea.confidenceScore && idea.confidenceScore > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Signal Confidence:</span>
              <Badge 
                variant="outline"
                className={cn(
                  "font-bold text-[10px]",
                  idea.confidenceScore >= 75 ? "bg-green-500/20 text-green-400 border-green-500/50" :
                  idea.confidenceScore >= 60 ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50" :
                  idea.confidenceScore >= 50 ? "bg-amber-500/20 text-amber-400 border-amber-500/50" :
                  "bg-muted/30 text-muted-foreground border-muted"
                )}
              >
                {Math.round(idea.confidenceScore)}%
              </Badge>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 hover-elevate"
              onClick={(e) => {
                e.stopPropagation();
                setDetailModalOpen(true);
              }}
              data-testid={`button-details-${idea.symbol}`}
            >
              <Maximize2 className="h-3.5 w-3.5 mr-1.5" />
              Full Analysis
            </Button>
            
            {onAddToWatchlist && idea.outcomeStatus === 'open' && (
              <Button 
                variant="outline" 
                size="sm"
                className="hover-elevate"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToWatchlist(idea);
                }}
                data-testid={`button-watchlist-${idea.symbol}`}
              >
                <Star className="h-3.5 w-3.5 mr-1.5" />
                Watch
              </Button>
            )}

            {onViewDetails && (
              <Button 
                variant="ghost" 
                size="sm"
                className="hover-elevate"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(idea.symbol);
                }}
                data-testid={`button-chart-${idea.symbol}`}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Chart
              </Button>
            )}
            
            <Link href={`/trade-ideas/${idea.id}/audit`}>
              <Button 
                variant="ghost" 
                size="sm"
                className="hover-elevate"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-audit-${idea.id}`}
              >
                <FileSearch className="h-3.5 w-3.5 mr-1.5" />
                Audit
              </Button>
            </Link>
          </div>
        </div>
      </CollapsibleContent>

      {/* Detail Modal */}
      <TradeIdeaDetailModal
        idea={idea}
        currentPrice={currentPrice}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />
    </Collapsible>
  );
}
