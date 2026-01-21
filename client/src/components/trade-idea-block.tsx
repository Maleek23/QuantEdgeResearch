import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, formatCTTime } from "@/lib/utils";
import { formatInUserTZ, formatTimeUntilExpiry, formatDateOnly } from "@/lib/timezone";
import { ChevronDown, TrendingUp, TrendingDown, Star, Eye, Clock, ArrowUpRight, ArrowDownRight, Maximize2, ExternalLink, CalendarClock, CalendarDays, Calendar, Timer, Bot, BarChart3, Activity, Shield, Target as TargetIcon, Sparkles, Newspaper, HelpCircle, Info, Database, TrendingUpIcon, Zap, UserPlus, AlertTriangle, FileSearch, Hourglass, Minus, Octagon, Skull, Coins, Send } from "lucide-react";
import { Link } from "wouter";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExplainabilityPanel } from "@/components/explainability-panel";
import { TradingAdvice } from "@/components/trading-advice";
import { ManualOutcomeRecorder } from "@/components/manual-outcome-recorder";
import { SignalFiltersDisplay } from "@/components/signal-filters-display";
import { MiniSparkline } from "@/components/mini-sparkline";
import { SignalStrengthBars } from "@/components/signal-strength-bars";
import { EnhancedCountdown } from "@/components/enhanced-countdown";
import { TimingDisplay } from "@/components/timing-display";
import { HistoricalPerformanceBadge } from "@/components/historical-performance-badge";
import { SignalStrengthBadge } from "@/components/signal-strength-badge";
import { EngineConsensusBadge } from "@/components/engine-mini-scores";
import { MLTimingIndicator } from "@/components/ml-timing-indicator";
import { getResolutionReasonLabel, getPnlColor, getTradeOutcomeStyle } from "@/lib/signal-grade";
import type { TradeIdea, Catalyst } from "@shared/schema";

interface TradeIdeaBlockProps {
  idea: TradeIdea;
  currentPrice?: number;
  catalysts?: Catalyst[];
  onAddToWatchlist?: (idea: TradeIdea) => void;
  onViewDetails?: (symbol: string) => void;
  onAnalyze?: (symbol: string) => void;
  onSendToDiscord?: (ideaId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: (ideaId: string) => void;
}

export function TradeIdeaBlock({ idea, currentPrice, catalysts = [], onAddToWatchlist, onViewDetails, onAnalyze, onSendToDiscord, isExpanded, onToggleExpand }: TradeIdeaBlockProps) {
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const isOpen = isExpanded !== undefined ? isExpanded : localIsOpen;
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

  // Fetch pattern data when expanded (for stocks/crypto only)
  interface PatternData {
    signalScore?: { score: number; direction: string; confidence: number; signals: string[] };
    indicators?: { rsi?: { value: number }; adx?: { value: number; regime: string }; macd?: { histogram: number } };
    patterns?: { name: string; type: string }[];
    harmonicPatterns?: { name: string; type: string; completionPercent: number; potentialReversalZone?: { low: number; high: number } }[];
    elliottWave?: { currentWave: number | null; wavePhase: string; completionPercent: number };
    confidenceScore?: number;
    error?: string;
  }
  const { data: patternData, isLoading: patternLoading, error: patternError } = useQuery<PatternData>({
    queryKey: ['/api/patterns', idea.symbol],
    queryFn: async () => {
      const response = await fetch(`/api/patterns/${idea.symbol}`);
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to fetch patterns');
      }
      return data;
    },
    enabled: isOpen && idea.assetType !== 'option', // Only fetch when expanded
    staleTime: 300000, // Cache for 5 minutes
    retry: false, // Don't retry failed requests
  });

  // Fetch loss analyzer data for this symbol (only for open ideas)
  interface LossData {
    symbol: string;
    confidenceBoost: number;
    shouldAvoid: boolean;
    lossStreak: number;
  }
  const { data: lossData } = useQuery<LossData>({
    queryKey: ['/api/bot/symbol-adjustment', idea.symbol],
    enabled: idea.outcomeStatus === 'open', // Only check for open ideas
    staleTime: 300000, // Cache for 5 minutes
  });
  
  // Fetch macro context for VIX regime and risk appetite (market-wide, shared across all ideas)
  interface MacroData {
    vixRegime?: { level: string; tradingImplication: string };
    riskAppetite?: 'risk_on' | 'risk_off' | 'mixed';
    tradingRecommendation?: string;
  }
  const { data: macroData } = useQuery<MacroData>({
    queryKey: ['/api/macro/context'],
    staleTime: 300000, // Cache for 5 minutes (market-wide data)
    refetchInterval: 600000, // Refresh every 10 minutes
  });
  
  // Determine if we should show a loss warning
  const hasLossHistory = lossData && (lossData.shouldAvoid || lossData.lossStreak > 0 || lossData.confidenceBoost < 0);

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

  // Helper: Get real-time applicability status showing if trade is still valid to enter
  const getRealTimeApplicability = (): { status: 'valid' | 'caution' | 'expired' | 'closed'; label: string; tooltip: string; color: string } => {
    // Closed trades are no longer applicable
    if (idea.outcomeStatus && idea.outcomeStatus !== 'open') {
      return { status: 'closed', label: 'Closed', tooltip: 'This trade has been resolved', color: 'text-muted-foreground' };
    }

    const now = new Date();
    
    // Check exit deadline
    if (idea.exitBy) {
      const exitDeadline = new Date(idea.exitBy);
      const hoursRemaining = (exitDeadline.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      if (hoursRemaining <= 0) {
        return { status: 'expired', label: 'Expired', tooltip: 'Exit deadline has passed', color: 'text-red-400' };
      }
    }
    
    // Check price proximity to entry (for non-options only)
    if (currentPrice && idea.assetType !== 'option') {
      const entryDeviation = Math.abs((currentPrice - idea.entryPrice) / idea.entryPrice) * 100;
      
      // For LONG: price should be at or below entry, For SHORT: price should be at or above entry
      const priceDirection = isLong 
        ? (currentPrice <= idea.entryPrice * 1.02) // Allow 2% above entry for longs
        : (currentPrice >= idea.entryPrice * 0.98); // Allow 2% below entry for shorts
      
      if (!priceDirection && entryDeviation > 3) {
        // Price moved significantly away from entry in wrong direction
        return { 
          status: 'caution', 
          label: 'Entry Missed', 
          tooltip: `Price ${isLong ? 'above' : 'below'} entry by ${entryDeviation.toFixed(1)}%`, 
          color: 'text-amber-400' 
        };
      }
      
      // Check if near target or stop (guard against division by zero)
      const targetDistance = Math.abs(idea.targetPrice - currentPrice);
      const entryDistance = Math.abs(idea.targetPrice - idea.entryPrice);
      
      if (entryDistance > 0) {
        const progressToTarget = ((entryDistance - targetDistance) / entryDistance) * 100;
        
        if (progressToTarget >= 80) {
          return { status: 'valid', label: 'Near Target', tooltip: `${progressToTarget.toFixed(0)}% to target`, color: 'text-green-400' };
        }
      }
    }
    
    // Default: trade is still valid
    return { status: 'valid', label: 'Active', tooltip: 'Trade is still actionable', color: 'text-green-400' };
  };

  const applicability = getRealTimeApplicability();

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

  // Color theme based on asset type and direction
  const getCardTheme = () => {
    const base = {
      stock: {
        gradient: 'from-blue-500/10 via-cyan-500/5 to-transparent',
        border: isLong ? 'border-l-green-500/50' : 'border-l-red-500/50',
        borderWidth: 'border-l-4',
        glow: isLong ? 'hover:shadow-green-500/20' : 'hover:shadow-red-500/20',
        iconColor: 'text-cyan-400',
        bgAccent: 'bg-blue-500/5'
      },
      option: {
        gradient: 'from-purple-500/15 via-pink-500/5 to-transparent',
        border: isLong ? 'border-l-green-500/60' : 'border-l-red-500/60',
        borderWidth: 'border-l-4',
        glow: isLong ? 'hover:shadow-green-500/25' : 'hover:shadow-red-500/25',
        iconColor: 'text-purple-400',
        bgAccent: 'bg-purple-500/10'
      },
      crypto: {
        gradient: 'from-orange-500/10 via-amber-500/5 to-transparent',
        border: isLong ? 'border-l-green-500/50' : 'border-l-red-500/50',
        borderWidth: 'border-l-4',
        glow: isLong ? 'hover:shadow-green-500/20' : 'hover:shadow-red-500/20',
        iconColor: 'text-orange-400',
        bgAccent: 'bg-orange-500/5'
      },
      penny_stock: {
        gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent',
        border: isLong ? 'border-l-green-500/50' : 'border-l-red-500/50',
        borderWidth: 'border-l-4',
        glow: isLong ? 'hover:shadow-green-500/20' : 'hover:shadow-red-500/20',
        iconColor: 'text-emerald-400',
        bgAccent: 'bg-emerald-500/5'
      }
    };

    return base[idea.assetType as keyof typeof base] || base.stock;
  };

  const theme = getCardTheme();

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleToggle}
      className="group"
    >
      <CollapsibleTrigger className="w-full" data-testid={`block-trade-idea-${idea.symbol}`}>
        {/* ===== COLLAPSED VIEW - Enhanced with Color Themes ===== */}
        <div className={cn(
          "p-4 border-2 rounded-xl transition-all duration-300",
          "bg-gradient-to-r backdrop-blur-sm",
          theme.gradient,
          theme.border,
          theme.borderWidth,
          theme.glow,
          "hover:shadow-lg hover:scale-[1.01]",
          isOpen && "rounded-b-none border-b-0 shadow-lg"
        )}>
          <div className="flex items-center justify-between gap-3">
            {/* Left: Identity - Symbol + Core Badges */}
            <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap overflow-hidden">
              {/* Symbol with Asset Type Icon */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  theme.bgAccent,
                  "border border-border/50"
                )}>
                  {idea.assetType === 'option' ? (
                    <Coins className={cn("h-5 w-5", theme.iconColor)} />
                  ) : idea.assetType === 'crypto' ? (
                    <Zap className={cn("h-5 w-5", theme.iconColor)} />
                  ) : idea.assetType === 'penny_stock' ? (
                    <TrendingUp className={cn("h-5 w-5", theme.iconColor)} />
                  ) : (
                    <BarChart3 className={cn("h-5 w-5", theme.iconColor)} />
                  )}
                </div>
                <h3 className="text-xl font-bold font-mono" data-testid={`text-symbol-${idea.symbol}`}>
                  {idea.symbol}
                </h3>
              </div>

              {/* Direction Badge - More Prominent */}
              <Badge
                className={cn(
                  "font-bold text-xs h-6 px-3 flex-shrink-0 shadow-sm",
                  isLong
                    ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 border-green-500/50 hover:from-green-500/30 hover:to-emerald-500/30"
                    : "bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 border-red-500/50 hover:from-red-500/30 hover:to-rose-500/30"
                )}
                data-testid={`badge-direction-${idea.symbol}`}
              >
                {isLong ? (
                  <><ArrowUpRight className="h-3.5 w-3.5 mr-1" />LONG</>
                ) : (
                  <><ArrowDownRight className="h-3.5 w-3.5 mr-1" />SHORT</>
                )}
              </Badge>

              {/* Source Badge */}
              <Badge
                variant="outline"
                className={cn("font-semibold border text-[10px] h-5 flex-shrink-0", sourceBadge.className)}
                data-testid={`badge-source-${idea.symbol}`}
              >
                <sourceBadge.icon className="h-2.5 w-2.5 mr-1" />
                {sourceBadge.label}
              </Badge>

              {/* Asset Type Label - Show for all types */}
              <Badge variant="outline" className={cn(
                "text-[10px] h-5 font-semibold uppercase flex-shrink-0 whitespace-nowrap",
                idea.assetType === 'option' && "bg-purple-500/20 text-purple-400 border-purple-500/40",
                idea.assetType === 'crypto' && "bg-orange-500/20 text-orange-400 border-orange-500/40",
                idea.assetType === 'penny_stock' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                idea.assetType === 'stock' && "bg-blue-500/20 text-blue-400 border-blue-500/40"
              )}>
                {idea.assetType === 'penny_stock' ? 'PENNY' : idea.assetType.toUpperCase()}
              </Badge>

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
              
              {/* Loss History Warning Badge */}
              {hasLossHistory && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] h-5 font-semibold border cursor-help whitespace-nowrap flex-shrink-0",
                        lossData?.shouldAvoid 
                          ? "bg-red-500/20 text-red-400 border-red-500/50" 
                          : "bg-amber-500/20 text-amber-400 border-amber-500/50"
                      )}
                      data-testid={`badge-loss-warning-${idea.symbol}`}
                    >
                      <Skull className="h-2.5 w-2.5 mr-0.5" />
                      {lossData?.shouldAvoid ? 'BLOCKED' : `${lossData?.lossStreak || 0}L`}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <div className="space-y-1">
                      <p className="font-bold text-red-400">
                        {lossData?.shouldAvoid ? 'Symbol on Loss Cooldown' : 'Loss History Detected'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lossData?.lossStreak || 0} consecutive losses
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Confidence adj: {(lossData?.confidenceBoost || 0) > 0 ? '+' : ''}{lossData?.confidenceBoost || 0} pts
                      </p>
                      {lossData?.shouldAvoid && (
                        <p className="text-xs text-red-400 font-semibold">
                          Bot will NOT trade this symbol
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* News Bias Badge - shows directional news sentiment */}
              {idea.newsBias && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] h-5 font-semibold border cursor-help whitespace-nowrap flex-shrink-0",
                        idea.newsBias === 'bullish' && "bg-green-500/20 text-green-400 border-green-500/50",
                        idea.newsBias === 'bearish' && "bg-red-500/20 text-red-400 border-red-500/50",
                        idea.newsBias === 'neutral' && "bg-slate-500/20 text-slate-400 border-slate-500/50"
                      )}
                      data-testid={`badge-news-bias-${idea.symbol}`}
                    >
                      <Newspaper className="h-2.5 w-2.5 mr-0.5" />
                      {idea.newsBias.toUpperCase()}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">News Sentiment: {idea.newsBias}</p>
                    <p className="text-xs text-muted-foreground">Based on recent headlines</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Earnings Badge - only shows when earnings detected */}
              {idea.earningsBeat !== null && idea.earningsBeat !== undefined && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] h-5 font-bold border cursor-help whitespace-nowrap flex-shrink-0",
                        idea.earningsBeat === true && "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
                        idea.earningsBeat === false && "bg-red-500/20 text-red-400 border-red-500/50"
                      )}
                      data-testid={`badge-earnings-${idea.symbol}`}
                    >
                      {idea.earningsBeat ? 'BEAT' : 'MISS'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">Earnings {idea.earningsBeat ? 'Beat' : 'Miss'} Detected</p>
                    <p className="text-xs text-muted-foreground">
                      {idea.earningsBeat 
                        ? 'Company exceeded expectations' 
                        : 'Company missed expectations - higher risk'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Center: Quick Metrics */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Live P/L Display - Only for open trades with current price */}
              {idea.outcomeStatus === 'open' && currentPrice && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn(
                      "flex flex-col items-center justify-center px-3 py-1 rounded-lg border-2 cursor-help",
                      priceChangePercent >= 5 ? "bg-green-500/20 border-green-500/50" :
                      priceChangePercent >= 0 ? "bg-green-500/10 border-green-500/30" :
                      priceChangePercent <= -5 ? "bg-red-500/20 border-red-500/50" :
                      "bg-red-500/10 border-red-500/30"
                    )}>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider">P/L</span>
                      <span className={cn(
                        "text-base font-bold font-mono",
                        priceChangePercent >= 0 ? "text-green-400" : "text-red-400"
                      )}>
                        {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Current Profit/Loss</p>
                    <p className="text-xs text-muted-foreground">
                      Entry: ${idea.entryPrice.toFixed(2)} → Now: ${currentPrice.toFixed(2)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}

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

              {/* Quality Grade Badge - Shows stored grade from bot generation (A+, A, B, C, etc.) */}
              {idea.probabilityBand && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs h-5 font-bold px-2 cursor-help whitespace-nowrap",
                        idea.probabilityBand === 'A+' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                        idea.probabilityBand === 'A' && "bg-green-500/20 text-green-400 border-green-500/40",
                        idea.probabilityBand === 'A-' && "bg-green-500/15 text-green-300 border-green-500/30",
                        (idea.probabilityBand === 'B+' || idea.probabilityBand === 'B' || idea.probabilityBand === 'B-') && "bg-blue-500/20 text-blue-400 border-blue-500/40",
                        (idea.probabilityBand === 'C+' || idea.probabilityBand === 'C' || idea.probabilityBand === 'C-') && "bg-amber-500/20 text-amber-400 border-amber-500/40",
                        (idea.probabilityBand === 'D' || idea.probabilityBand === 'D-' || idea.probabilityBand === 'F') && "bg-red-500/20 text-red-400 border-red-500/40"
                      )}
                      data-testid={`badge-grade-${idea.symbol}`}
                    >
                      {idea.probabilityBand}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">Quality Grade: {idea.probabilityBand}</p>
                    <p className="text-xs text-muted-foreground">Assigned by scanner at generation time</p>
                    {idea.confidenceScore && (
                      <p className="text-xs">Confidence: {Math.round(idea.confidenceScore)}%</p>
                    )}
                    {idea.qualitySignals && idea.qualitySignals.length > 0 && (
                      <div className="mt-1 text-xs">
                        <p className="text-muted-foreground">Signals: {idea.qualitySignals.length}</p>
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* 6-Engine Consensus - Multi-factor intelligence score */}
              {typeof idea.confidenceScore === 'number' && idea.confidenceScore >= 50 && (
                <EngineConsensusBadge 
                  score={Math.min(100, Math.max(0, Math.round(idea.confidenceScore)))} 
                  alignment={idea.confidenceScore >= 80 ? 5 : idea.confidenceScore >= 70 ? 4 : idea.confidenceScore >= 60 ? 3 : 2}
                  size="sm"
                />
              )}

              {/* Macro Context Badges - VIX Regime & Risk Appetite */}
              {macroData && idea.outcomeStatus === 'open' && (
                <>
                  {macroData.riskAppetite && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px] h-5 font-medium cursor-help whitespace-nowrap",
                            macroData.riskAppetite === 'risk_on' && "bg-green-500/10 text-green-400 border-green-500/30",
                            macroData.riskAppetite === 'risk_off' && "bg-red-500/10 text-red-400 border-red-500/30",
                            macroData.riskAppetite === 'mixed' && "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          )}
                          data-testid={`badge-risk-appetite-${idea.symbol}`}
                        >
                          {macroData.riskAppetite === 'risk_on' && <TrendingUp className="h-2.5 w-2.5 mr-1" />}
                          {macroData.riskAppetite === 'risk_off' && <TrendingDown className="h-2.5 w-2.5 mr-1" />}
                          {macroData.riskAppetite === 'mixed' && <Activity className="h-2.5 w-2.5 mr-1" />}
                          {macroData.riskAppetite === 'risk_on' ? 'Risk On' : macroData.riskAppetite === 'risk_off' ? 'Risk Off' : 'Mixed'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">Market Risk Appetite</p>
                        <p className="text-xs text-muted-foreground">{macroData.tradingRecommendation || 'Monitor market conditions'}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {macroData.vixRegime && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px] h-5 font-medium cursor-help whitespace-nowrap",
                            macroData.vixRegime.level === 'extreme_fear' && "bg-red-500/10 text-red-400 border-red-500/30",
                            macroData.vixRegime.level === 'fear' && "bg-orange-500/10 text-orange-400 border-orange-500/30",
                            macroData.vixRegime.level === 'neutral' && "bg-slate-500/10 text-slate-400 border-slate-500/30",
                            macroData.vixRegime.level === 'complacency' && "bg-blue-500/10 text-blue-400 border-blue-500/30",
                            macroData.vixRegime.level === 'extreme_complacency' && "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                          )}
                          data-testid={`badge-vix-${idea.symbol}`}
                        >
                          VIX: {macroData.vixRegime.level.replace('_', ' ')}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">VIX Regime</p>
                        <p className="text-xs text-muted-foreground">{macroData.vixRegime.tradingImplication}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}

              {/* Real-Time Applicability - Shows if trade is still valid */}
              {idea.outcomeStatus === 'open' && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] h-5 font-semibold border cursor-help whitespace-nowrap",
                        applicability.status === 'valid' && "bg-green-500/10 text-green-400 border-green-500/40",
                        applicability.status === 'caution' && "bg-amber-500/10 text-amber-400 border-amber-500/40",
                        applicability.status === 'expired' && "bg-red-500/10 text-red-400 border-red-500/40"
                      )}
                      data-testid={`badge-applicability-${idea.symbol}`}
                    >
                      {applicability.status === 'valid' && <Activity className="h-2.5 w-2.5 mr-1" />}
                      {applicability.status === 'caution' && <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                      {applicability.status === 'expired' && <Clock className="h-2.5 w-2.5 mr-1" />}
                      {applicability.label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{applicability.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              )}

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

      {/* ===== EXPANDED VIEW - Tabbed Analysis ===== */}
      <CollapsibleContent>
        <div className={cn(
          "border-2 border-t-0 rounded-b-xl transition-all",
          "bg-gradient-to-br",
          theme.gradient,
          theme.border,
          theme.borderWidth
        )}>

          {/* Secondary Badges Row - Sector, Risk, Liquidity */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-4">
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
          </div>

          {/* TRADE AUDIT - Shows resolution reason for expired/closed trades */}
          {idea.outcomeStatus && idea.outcomeStatus !== 'open' && (
            <div className="p-3 rounded-lg bg-muted/30 border border-muted/50 space-y-2">
              <div className="flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trade Audit</span>
              </div>
              
              {(() => {
                const reason = getResolutionReasonLabel(idea.resolutionReason);
                const getReasonIcon = (iconName: string) => {
                  switch (iconName) {
                    case 'clock': return <Clock className="h-4 w-4" />;
                    case 'hourglass': return <Hourglass className="h-4 w-4" />;
                    case 'minus': return <Minus className="h-4 w-4" />;
                    case 'target': return <TargetIcon className="h-4 w-4" />;
                    case 'octagon': return <Octagon className="h-4 w-4" />;
                    case 'skull': return <Skull className="h-4 w-4" />;
                    case 'coins': return <Coins className="h-4 w-4" />;
                    default: return <HelpCircle className="h-4 w-4" />;
                  }
                };
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={reason.color}>{getReasonIcon(reason.iconName)}</span>
                      <span className={cn("font-semibold text-sm", reason.color)}>{reason.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{reason.description}</p>
                    
                    {/* Theoretical outcome for missed entries */}
                    {idea.missedEntryTheoreticalOutcome && (
                      <div className="mt-2 p-2 rounded bg-muted/20 border border-muted/30">
                        <div className="flex items-center gap-2 text-xs">
                          <Info className="h-3 w-3 text-cyan-400" />
                          <span className="text-muted-foreground">What would have happened:</span>
                          <span className={cn(
                            "font-semibold",
                            idea.missedEntryTheoreticalOutcome === 'would_have_won' ? 'text-green-400' :
                            idea.missedEntryTheoreticalOutcome === 'would_have_lost' ? 'text-red-400' :
                            'text-slate-400'
                          )}>
                            {idea.missedEntryTheoreticalOutcome === 'would_have_won' ? 'Would have WON' :
                             idea.missedEntryTheoreticalOutcome === 'would_have_lost' ? 'Would have LOST' :
                             'Inconclusive'}
                          </span>
                          {idea.missedEntryTheoreticalGain !== null && idea.missedEntryTheoreticalGain !== undefined && (
                            <span className={cn(
                              "font-mono",
                              idea.missedEntryTheoreticalGain > 0 ? 'text-green-400' : 'text-red-400'
                            )}>
                              ({idea.missedEntryTheoreticalGain > 0 ? '+' : ''}{idea.missedEntryTheoreticalGain.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Exit details */}
                    {idea.exitPrice && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span>Exit: <span className="font-mono text-foreground">${idea.exitPrice.toFixed(2)}</span></span>
                        {idea.percentGain !== null && idea.percentGain !== undefined && (
                          <span>P/L: <span className={cn(
                            "font-mono",
                            getPnlColor(idea.outcomeStatus, idea.percentGain)
                          )}>{idea.percentGain > 0 ? '+' : ''}{idea.percentGain.toFixed(1)}%</span></span>
                        )}
                        {idea.actualHoldingTimeMinutes && (
                          <span>Held: <span className="text-foreground">
                            {idea.actualHoldingTimeMinutes < 60 
                              ? `${idea.actualHoldingTimeMinutes}m` 
                              : idea.actualHoldingTimeMinutes < 1440 
                                ? `${Math.round(idea.actualHoldingTimeMinutes / 60)}h`
                                : `${Math.round(idea.actualHoldingTimeMinutes / 1440)}d`}
                          </span></span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Secondary Badges Row - Lotto, Signals, etc */}
          <div className="flex flex-wrap items-center gap-1.5">
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

          {/* Technical Analysis Section - Pattern Detection */}
          {idea.assetType !== 'option' && (
            <div className="p-3 rounded-lg border bg-card/50">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Technical Analysis</span>
              </div>
              {patternLoading ? (
                <div className="grid grid-cols-4 gap-2">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
                  ))}
                </div>
              ) : patternError ? (
                <div className="text-xs text-muted-foreground text-center py-2">
                  Unable to load analysis
                </div>
              ) : patternData?.signalScore && patternData?.indicators ? (
                <>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="text-center p-2 rounded bg-muted/30">
                      <div className="text-[9px] text-muted-foreground mb-0.5">SIGNAL</div>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] font-bold",
                          patternData.signalScore.direction === 'bullish' ? "bg-green-500/20 text-green-400 border-green-500/30" :
                          patternData.signalScore.direction === 'bearish' ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          "bg-muted text-muted-foreground"
                        )}
                      >
                        {patternData.signalScore.direction.toUpperCase()}
                      </Badge>
                    </div>
                    {patternData.indicators.rsi?.value !== undefined && (
                      <div className="text-center p-2 rounded bg-muted/30">
                        <div className="text-[9px] text-muted-foreground mb-0.5">RSI(14)</div>
                        <span className={cn(
                          "font-mono font-bold",
                          patternData.indicators.rsi.value < 30 ? "text-green-400" :
                          patternData.indicators.rsi.value > 70 ? "text-red-400" :
                          "text-foreground"
                        )}>
                          {patternData.indicators.rsi.value.toFixed(1)}
                        </span>
                      </div>
                    )}
                    {patternData.indicators.adx?.value !== undefined && (
                      <div className="text-center p-2 rounded bg-muted/30">
                        <div className="text-[9px] text-muted-foreground mb-0.5">ADX</div>
                        <span className="font-mono font-bold">
                          {patternData.indicators.adx.value.toFixed(1)}
                        </span>
                      </div>
                    )}
                    {patternData.indicators.adx?.regime && (
                      <div className="text-center p-2 rounded bg-muted/30">
                        <div className="text-[9px] text-muted-foreground mb-0.5">TREND</div>
                        <span className={cn(
                          "text-[10px] font-semibold uppercase",
                          patternData.indicators.adx.regime === 'trending' ? "text-green-400" :
                          patternData.indicators.adx.regime === 'ranging' ? "text-amber-400" :
                          "text-muted-foreground"
                        )}>
                          {patternData.indicators.adx.regime}
                        </span>
                      </div>
                    )}
                  </div>
                  {patternData.patterns && patternData.patterns.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {patternData.patterns.slice(0, 3).map((p, i) => (
                        <Badge 
                          key={i} 
                          variant="outline" 
                          className={cn(
                            "text-[9px]",
                            p.type === 'bullish' ? "bg-green-500/10 text-green-400 border-green-500/30" :
                            p.type === 'bearish' ? "bg-red-500/10 text-red-400 border-red-500/30" :
                            "bg-muted/30"
                          )}
                        >
                          {p.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* Harmonic Pattern Completion */}
                  {patternData.harmonicPatterns && patternData.harmonicPatterns.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <div className="text-[9px] text-muted-foreground mb-1 uppercase tracking-wider">Harmonic Patterns</div>
                      <div className="flex flex-wrap gap-1.5">
                        {patternData.harmonicPatterns.slice(0, 2).map((h, i) => (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[9px] cursor-help",
                                  h.type === 'bullish' ? "bg-green-500/10 text-green-400 border-green-500/30" :
                                  "bg-red-500/10 text-red-400 border-red-500/30"
                                )}
                              >
                                {h.name} {h.completionPercent.toFixed(0)}%
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">{h.name} Pattern ({h.type})</p>
                              <p className="text-xs text-muted-foreground">{h.completionPercent.toFixed(0)}% complete</p>
                              {h.potentialReversalZone && (
                                <p className="text-xs text-cyan-400">PRZ: ${h.potentialReversalZone.low.toFixed(2)} - ${h.potentialReversalZone.high.toFixed(2)}</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Elliott Wave Completion */}
                  {patternData.elliottWave && patternData.elliottWave.currentWave && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <div className="text-[9px] text-muted-foreground mb-1 uppercase tracking-wider">Elliott Wave</div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[9px]",
                            patternData.elliottWave.wavePhase === 'impulse' ? "bg-purple-500/10 text-purple-400 border-purple-500/30" :
                            "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          )}
                        >
                          Wave {patternData.elliottWave.currentWave} ({patternData.elliottWave.wavePhase})
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {patternData.elliottWave.completionPercent.toFixed(0)}% complete
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-2">
                  Pattern analysis unavailable
                </div>
              )}
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

          {/* ML Entry/Exit Timing Indicator - Only for open trades */}
          {idea.outcomeStatus === 'open' && (
            <div className="p-4 rounded-lg border-2 bg-gradient-to-br from-cyan-500/5 via-card to-purple-500/5">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-bold text-cyan-400 uppercase tracking-wider">ML Entry/Exit Timing</span>
              </div>
              <MLTimingIndicator
                entryPrice={idea.entryPrice}
                currentPrice={currentPrice}
                targetPrice={idea.targetPrice}
                stopLoss={idea.stopLoss}
                direction={idea.direction as 'long' | 'short'}
                expiryDate={idea.expiryDate || undefined}
                assetType={idea.assetType as 'stock' | 'option' | 'crypto'}
                confidence={idea.confidenceScore}
              />
            </div>
          )}

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


          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            {/* Audit button first - contains full analysis, price history, and scoring breakdown */}
            <Link href={`/trade-ideas/${idea.id}/audit`}>
              <Button 
                variant="outline" 
                size="sm"
                className="hover-elevate"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-audit-${idea.id}`}
              >
                <FileSearch className="h-3.5 w-3.5 mr-1.5" />
                Full Analysis
              </Button>
            </Link>
            
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
            
            {onAnalyze && idea.assetType !== 'option' && (
              <Button 
                variant="ghost" 
                size="sm"
                className="hover-elevate text-cyan-400 hover:text-cyan-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAnalyze(idea.symbol);
                }}
                data-testid={`button-analyze-${idea.symbol}`}
              >
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                Deep
              </Button>
            )}
            
            {onSendToDiscord && (
              <Button 
                variant="ghost" 
                size="sm"
                className="hover-elevate text-indigo-400 hover:text-indigo-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onSendToDiscord(idea.id.toString());
                }}
                data-testid={`button-discord-${idea.id}`}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Discord
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
