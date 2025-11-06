import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, formatCTTime } from "@/lib/utils";
import { formatInUserTZ, formatTimeUntilExpiry } from "@/lib/timezone";
import { ChevronDown, TrendingUp, TrendingDown, Star, Eye, Clock, ArrowUpRight, ArrowDownRight, Maximize2, ExternalLink, CalendarClock, CalendarDays, Calendar, Timer, Bot, BarChart3, Activity, Shield, Target as TargetIcon, Sparkles, Newspaper, HelpCircle, Info, Database, TrendingUpIcon } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExplainabilityPanel } from "@/components/explainability-panel";
import { TradeIdeaDetailModal } from "@/components/trade-idea-detail-modal";
import { TradingAdvice } from "@/components/trading-advice";
import { ManualOutcomeRecorder } from "@/components/manual-outcome-recorder";
import { ConfidenceCircle } from "@/components/confidence-circle";
import { MiniSparkline } from "@/components/mini-sparkline";
import { SignalStrengthBars } from "@/components/signal-strength-bars";
import { EnhancedCountdown } from "@/components/enhanced-countdown";
import { TimingDisplay } from "@/components/timing-display";
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
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 300000, // Refresh every 5 minutes
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
  // For LONG: price up = profit (green), price down = loss (red)
  // For SHORT: price down = profit (green), price up = loss (red)
  const priceChangePercent = currentPrice 
    ? isLong
      ? ((currentPrice - idea.entryPrice) / idea.entryPrice) * 100  // Long: normal calculation
      : ((idea.entryPrice - currentPrice) / idea.entryPrice) * 100   // Short: inverted (price down = positive)
    : 0;

  const getTimeSincePosted = (): string => {
    const now = new Date();
    const posted = new Date(idea.timestamp);
    const diffMs = now.getTime() - posted.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  const getFormattedDate = (): string => {
    const posted = new Date(idea.timestamp);
    const month = posted.toLocaleString('en-US', { month: 'short' });
    const day = posted.getDate();
    const year = posted.getFullYear();
    const currentYear = new Date().getFullYear();
    
    if (year === currentYear) {
      return `${month} ${day}`;
    }
    return `${month} ${day}, ${year}`;
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

  // Helper: Calculate time window duration in human-readable format
  const getTimeWindowDuration = (start: string, end: string): string => {
    const startTime = new Date(start);
    const endTime = new Date(end);
    const diffMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d window`;
    if (diffHours > 0) return `${diffHours}h window`;
    return `${diffMinutes}m window`;
  };

  // Helper: Get exit context label based on asset type and exit time
  const getExitContext = (): string => {
    if (!idea.exitBy) return '';
    
    const exitDate = new Date(idea.exitBy);
    const exitHour = parseInt(formatInTimeZone(exitDate, 'America/New_York', 'H'));
    const exitMinute = parseInt(formatInTimeZone(exitDate, 'America/New_York', 'm'));
    const exitMinutesSinceMidnight = exitHour * 60 + exitMinute;
    const marketClose = 16 * 60; // 4:00 PM ET in minutes
    
    if (idea.assetType === 'option' && idea.expiryDate) {
      const expiryDate = new Date(idea.expiryDate);
      const isSameDay = exitDate.toDateString() === expiryDate.toDateString();
      if (isSameDay && exitMinutesSinceMidnight === marketClose) {
        return ' (Option Expiry)';
      }
    }
    
    if ((idea.assetType === 'stock' || idea.assetType === 'penny_stock') && exitMinutesSinceMidnight === marketClose) {
      return ' (Market Close)';
    }
    
    return ''; // Crypto or custom timing
  };

  // Helper: Get timing status (active, closing-soon, expired)
  const getTimingStatus = (): { entryStatus: string; exitStatus: string; entryColor: string; exitColor: string } => {
    const now = new Date();
    
    if (idea.outcomeStatus !== 'open') {
      return { entryStatus: 'closed', exitStatus: 'closed', entryColor: 'text-muted-foreground', exitColor: 'text-muted-foreground' };
    }
    
    // Entry window status
    let entryStatus = 'expired';
    let entryColor = 'text-red-400';
    if (idea.entryValidUntil) {
      const entryDeadline = new Date(idea.entryValidUntil);
      const entryMinsRemaining = Math.floor((entryDeadline.getTime() - now.getTime()) / 60000);
      
      if (entryMinsRemaining > 30) {
        entryStatus = 'active';
        entryColor = 'text-green-400';
      } else if (entryMinsRemaining > 0) {
        entryStatus = 'closing-soon';
        entryColor = 'text-amber-400';
      }
    }
    
    // Exit window status
    let exitStatus = 'expired';
    let exitColor = 'text-red-400';
    if (idea.exitBy) {
      const exitDeadline = new Date(idea.exitBy);
      const exitMinsRemaining = Math.floor((exitDeadline.getTime() - now.getTime()) / 60000);
      
      if (exitMinsRemaining > 60) {
        exitStatus = 'active';
        exitColor = 'text-green-400';
      } else if (exitMinsRemaining > 0) {
        exitStatus = 'closing-soon';
        exitColor = 'text-amber-400';
      }
    }
    
    return { entryStatus, exitStatus, entryColor, exitColor };
  };

  const timingStatus = getTimingStatus();

  const handleToggle = (newOpenState: boolean) => {
    if (onToggleExpand) {
      if (newOpenState || isOpen) {
        onToggleExpand(idea.id);
      }
    } else {
      setLocalIsOpen(newOpenState);
    }
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleToggle}
      className="group"
    >
      <CollapsibleTrigger className="w-full" data-testid={`block-trade-idea-${idea.symbol}`}>
        <div className="p-4 border rounded-lg bg-card hover-elevate transition-all block">
          {/* ===== HEADER SECTION ===== */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              {/* Symbol + Essential Badges Only */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-xl font-bold font-mono" data-testid={`text-symbol-${idea.symbol}`}>
                  {idea.symbol}
                </h3>
                
                {/* Source Badge - Only if Flow Scanner (most distinctive) */}
                {idea.source === 'flow' && (
                  <Badge 
                    variant="outline"
                    className="font-semibold border-2 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50"
                    data-testid={`badge-source-${idea.symbol}`}
                  >
                    <Activity className="h-3 w-3 mr-1" />
                    FLOW SCANNER
                  </Badge>
                )}
                
                {/* Direction Badge */}
                <Badge 
                  variant={isLong ? "default" : "destructive"}
                  className="font-semibold text-xs"
                  data-testid={`badge-direction-${idea.symbol}`}
                >
                  {isLong ? (
                    <><ArrowUpRight className="h-3 w-3 mr-1" />LONG</>
                  ) : (
                    <><ArrowDownRight className="h-3 w-3 mr-1" />SHORT</>
                  )}
                </Badge>

                {/* Asset Type Badge - Only for Options (most critical to distinguish) */}
                {idea.assetType === 'option' && (
                  <Badge variant="outline" className="text-xs font-semibold uppercase bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                    OPTION
                  </Badge>
                )}

                {/* Lotto Play Badge - High-risk far-OTM options with 20x potential */}
                {idea.isLottoPlay && (
                  <Badge variant="outline" className="text-xs font-semibold bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30 animate-pulse">
                    🎰 LOTTO PLAY (20x potential)
                  </Badge>
                )}

                {/* Earnings Warning Badge - Critical info */}
                {upcomingEarnings && (
                  <Badge 
                    variant="destructive"
                    className="font-semibold animate-pulse text-xs"
                    data-testid={`badge-earnings-${idea.symbol}`}
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    EARNINGS {new Date(upcomingEarnings.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Badge>
                )}
              </div>
            </div>

            {/* Right Side: Confidence Grade + Outcome + Expand Button */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Outcome Badge for closed ideas */}
              {idea.outcomeStatus && idea.outcomeStatus !== 'open' && (
                <Badge 
                  variant={
                    idea.outcomeStatus === 'hit_target' ? 'default' : 
                    idea.outcomeStatus === 'hit_stop' ? 'destructive' : 
                    'secondary'
                  }
                  className="font-semibold text-xs"
                  data-testid={`badge-outcome-${idea.symbol}`}
                >
                  {idea.outcomeStatus === 'hit_target' ? 'HIT TARGET' :
                   idea.outcomeStatus === 'hit_stop' ? 'HIT STOP' :
                   idea.outcomeStatus === 'expired' ? 'EXPIRED' :
                   'CLOSED'}
                </Badge>
              )}
              
              <ConfidenceCircle 
                score={idea.confidenceScore} 
                size="lg" 
                showLabel={false}
              />
              
              <ChevronDown 
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </div>
          </div>

          {/* COMPACT TIMING - Single row */}
          {idea.outcomeStatus === 'open' && (
            <div className="mb-2 px-3 py-2 rounded-lg border bg-card/30 text-xs">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-blue-400" />
                  <span className="text-muted-foreground">Generated:</span>
                  <span className="font-semibold">{formatInUserTZ(idea.timestamp, 'h:mm a')}</span>
                </div>
                
                {idea.entryValidUntil && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-400">●</span>
                    <span className="text-muted-foreground">Enter by:</span>
                    <span className="font-semibold">{formatInUserTZ(idea.entryValidUntil, 'h:mm a')}</span>
                  </div>
                )}
                
                {idea.exitBy && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-400">●</span>
                    <span className="text-muted-foreground">Exit by:</span>
                    <span className="font-semibold">{formatInUserTZ(idea.exitBy, 'h:mm a')}</span>
                    <span className="text-xs text-muted-foreground/70">
                      ({idea.assetType === 'option' ? 'Option Expiry' : 'Market Close'})
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== ENTRY/EXIT TIMING ANALYSIS (CLOSED TRADES) ===== */}
          {idea.outcomeStatus !== 'open' && (
            <div className="mb-3 p-3 rounded-lg border bg-gradient-to-br from-blue-500/5 via-card to-purple-500/5" data-testid={`timing-analysis-${idea.symbol}`}>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Timing</h4>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                {/* Entry Time */}
                <div className="p-2 rounded-lg bg-card border border-border/50">
                  <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Entry</div>
                  <div className="text-xs font-bold" data-testid={`text-entry-time-${idea.symbol}`}>
                    {formatInTimeZone(parseISO(idea.timestamp), 'America/Chicago', 'MMM d, h:mm a')}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">CST</div>
                </div>

                {/* Exit Time */}
                {idea.exitDate && (
                  <div className="p-2 rounded-lg bg-card border border-border/50">
                    <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Exit</div>
                    <div className="text-xs font-bold" data-testid={`text-exit-time-${idea.symbol}`}>
                      {formatInTimeZone(parseISO(idea.exitDate), 'America/Chicago', 'MMM d, h:mm a')}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">CST</div>
                  </div>
                )}

                {/* Holding Duration - Enhanced with seconds precision */}
                {idea.exitDate && (
                  <div className="p-2 rounded-lg bg-card border border-border/50">
                    <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">Duration</div>
                    <div className="text-xs font-bold" data-testid={`text-duration-${idea.symbol}`}>
                      {(() => {
                        // Calculate precise duration from timestamps (includes seconds)
                        const entryTime = parseISO(idea.timestamp);
                        const exitTime = parseISO(idea.exitDate);
                        const totalSeconds = Math.floor((exitTime.getTime() - entryTime.getTime()) / 1000);
                        
                        const days = Math.floor(totalSeconds / 86400);
                        const hours = Math.floor((totalSeconds % 86400) / 3600);
                        const minutes = Math.floor((totalSeconds % 3600) / 60);
                        const seconds = totalSeconds % 60;
                        
                        const parts = [];
                        if (days > 0) parts.push(`${days}d`);
                        if (hours > 0) parts.push(`${hours}h`);
                        if (minutes > 0) parts.push(`${minutes}m`);
                        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
                        
                        return parts.join(' ');
                      })()}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {idea.holdingPeriod === 'day' ? 'Day Trade' : 
                       idea.holdingPeriod === 'swing' ? 'Swing Trade' : 
                       'Position Trade'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== PRICE DISPLAY SECTION ===== */}
          <div className="mb-3 p-4 rounded-lg border-2 bg-gradient-to-br from-card via-card to-muted/5 shadow-sm">
            {currentPrice ? (
              <div className="space-y-3">
                {/* Current Price with Change - ENHANCED */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className={cn("h-3 w-3", priceUpdated && "animate-pulse")} />
                        LIVE PRICE
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 mt-0.5">
                        Updates every 30s
                      </span>
                    </div>
                    <span className={cn(
                      "text-sm font-bold px-2.5 py-1 rounded-md shadow-sm",
                      priceChangePercent >= 0 
                        ? "bg-green-500/30 text-green-300 border border-green-500/50" 
                        : "bg-red-500/30 text-red-300 border border-red-500/50"
                    )}>
                      {priceChangePercent >= 0 ? '+' : ''}{formatPercent(priceChangePercent)}
                    </span>
                  </div>
                  <div className={cn(
                    "text-3xl font-bold font-mono text-foreground transition-all duration-300",
                    priceUpdated && "price-update scale-105",
                    priceChangePercent >= 0 ? "text-green-400" : "text-red-400"
                  )} data-testid={`text-current-price-${idea.symbol}`}>
                    {formatCurrency(currentPrice)}
                  </div>
                </div>

                {/* Entry/Target/Stop Grid */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">
                      {idea.assetType === 'option' ? 'Entry Premium' : 'Entry'}
                    </div>
                    <div className="text-sm font-semibold font-mono">{formatCurrency(idea.entryPrice)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-green-400 mb-0.5 uppercase tracking-wider flex items-center gap-0.5">
                      <TargetIcon className="h-2.5 w-2.5" />
                      {idea.assetType === 'option' ? 'Target Premium' : 'Target'}
                    </div>
                    <div className="text-sm font-semibold font-mono text-green-400">{formatCurrency(idea.targetPrice)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-red-400 mb-0.5 uppercase tracking-wider flex items-center gap-0.5">
                      <Shield className="h-2.5 w-2.5" />
                      {idea.assetType === 'option' ? 'Stop Premium' : 'Stop'}
                    </div>
                    <div className="text-sm font-semibold font-mono text-red-400">{formatCurrency(idea.stopLoss)}</div>
                  </div>
                </div>
                
                {/* Lotto Play Potential Gain Display */}
                {idea.isLottoPlay && (
                  <div className="mt-3 pt-3 border-t border-amber-500/30 bg-amber-500/5 rounded-lg p-3">
                    <div className="text-sm text-amber-400 font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        🎰 <span>Lotto Potential:</span>
                      </span>
                      <span className="text-lg">
                        {((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(0)}% 
                        <span className="text-xs ml-1">({(idea.targetPrice / idea.entryPrice).toFixed(0)}x)</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground py-2">
                <Activity className="h-6 w-6 animate-pulse" />
                <div>
                  <div className="text-xl font-bold font-mono">
                    Fetching price...
                  </div>
                  <div className="text-xs">
                    Entry: {formatCurrency(idea.entryPrice)} • Target: {formatCurrency(idea.targetPrice)}
                  </div>
                </div>
              </div>
            )}
            
            {/* Mini Sparkline Chart */}
            {sparklineData && sparklineData.prices.length > 0 && (
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
            )}
          </div>

          {/* Option Details Grid - Prominent display for options */}
          {idea.assetType === 'option' && (
            <div className="mb-3 p-4 rounded-lg border-2 bg-gradient-to-br from-purple-500/5 via-card to-purple-500/5 shadow-sm">
              <div className="space-y-2">
                {/* Header with Info Button */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Option Contract Details
                  </div>
                  
                  {/* INFO BUTTON - Explains pricing and timing */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 hover-elevate"
                        data-testid="button-option-info"
                      >
                        <HelpCircle className="h-4 w-4 text-blue-400" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Info className="h-5 w-5 text-blue-400" />
                          Understanding Option Pricing & Timing
                        </DialogTitle>
                      </DialogHeader>
                      
                      <div className="space-y-4 text-sm">
                        {/* WHERE PRICES COME FROM */}
                        <div className="p-4 rounded-lg bg-accent/20 border border-border">
                          <div className="flex items-center gap-2 mb-3">
                            <Database className="h-4 w-4 text-blue-400" />
                            <h3 className="font-bold text-blue-400">Where Does the Entry Premium Come From?</h3>
                          </div>
                          <div className="space-y-2 text-muted-foreground">
                            <p className="leading-relaxed">
                              The <span className="font-semibold text-foreground">Entry Premium of ${idea.entryPrice.toFixed(2)}</span> comes from <span className="font-semibold text-blue-400">Tradier API's live market data</span> (the <code className="px-1 py-0.5 bg-muted rounded text-xs">lastPrice</code> field).
                            </p>
                            <p className="leading-relaxed">
                              This is the <span className="font-semibold text-foreground">actual market price</span> traders are paying for this option contract at the time the trade was generated.
                            </p>
                            <div className="mt-3 p-3 bg-muted/50 rounded border-l-2 border-amber-500">
                              <p className="text-xs font-mono">
                                <span className="text-amber-400 font-bold">IMPORTANT:</span> Option premium (${idea.entryPrice.toFixed(2)}) ≠ Stock price ({idea.symbol} stock)
                              </p>
                              <p className="text-xs mt-1">
                                The premium is what you pay to BUY the option contract, NOT the stock's current price.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* TIMING SEQUENCE EXPLAINED */}
                        <div className="p-4 rounded-lg bg-accent/20 border border-border">
                          <div className="flex items-center gap-2 mb-3">
                            <Clock className="h-4 w-4 text-purple-400" />
                            <h3 className="font-bold text-purple-400">Understanding the Timing Sequence</h3>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400">
                                1
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">Trade Generated</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatInUserTZ(idea.timestamp, 'MMM d, h:mm:ss a')} CST - When the system created this trade idea
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-400">
                                2
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">Entry Window (Can Enter Until)</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {idea.entryValidUntil ? formatInUserTZ(idea.entryValidUntil, 'MMM d, h:mm:ss a') : 'N/A'} CST - Deadline to ENTER this trade
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  ⏰ You need to buy the option BEFORE this time
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-xs font-bold text-red-400">
                                3
                              </div>
                              <div>
                                <p className="font-semibold text-foreground">Exit Deadline (Must Exit By)</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {idea.exitBy ? formatInUserTZ(idea.exitBy, 'MMM d, h:mm:ss a') : 'N/A'} CST - Deadline to EXIT this trade
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  ⏰ You need to sell the option BEFORE this time (always before/on option expiry)
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 p-3 bg-green-500/10 rounded border-l-2 border-green-500">
                              <p className="text-xs font-semibold text-green-400">✓ This sequence makes sense:</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                System generates trade → You enter the trade → You exit the trade
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Exit deadline is ALWAYS after entry deadline but BEFORE/ON option expiry date.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* DATA SOURCES */}
                        <div className="p-4 rounded-lg bg-accent/20 border border-border">
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingUpIcon className="h-4 w-4 text-green-400" />
                            <h3 className="font-bold text-green-400">Data Sources by Asset Type</h3>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-start gap-2">
                              <span className="font-semibold text-blue-400 min-w-[80px]">Options:</span>
                              <span className="text-muted-foreground">Tradier API (live option chain data with real-time premiums)</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-semibold text-green-400 min-w-[80px]">Stocks:</span>
                              <span className="text-muted-foreground">Yahoo Finance (real-time stock quotes)</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="font-semibold text-amber-400 min-w-[80px]">Crypto:</span>
                              <span className="text-muted-foreground">CoinGecko API (real-time cryptocurrency prices)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Option Details Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[11px] text-blue-400 mb-1 uppercase tracking-wider flex items-center gap-1 font-semibold">
                      <Activity className="h-3.5 w-3.5" />
                      Type
                    </div>
                    <div className={cn(
                      "text-lg font-bold font-mono uppercase",
                      idea.optionType === 'call' ? 'text-green-400' : 'text-red-400'
                    )}>
                      {idea.optionType || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-amber-400 mb-1 uppercase tracking-wider flex items-center gap-1 font-semibold">
                      <TargetIcon className="h-3.5 w-3.5" />
                      Strike
                    </div>
                    <div className="text-lg font-bold font-mono text-amber-400">
                      {idea.strikePrice !== null && idea.strikePrice !== undefined 
                        ? formatCurrency(idea.strikePrice) 
                        : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] mb-1 uppercase tracking-wider flex items-center gap-1 font-semibold text-purple-400">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Expiry
                    </div>
                    <div className={cn(
                      "text-lg font-bold font-mono",
                      idea.expiryDate && new Date(idea.expiryDate).toDateString() === new Date().toDateString()
                        ? 'text-red-400 animate-pulse' // TODAY - show in red with pulse
                        : 'text-purple-400'
                    )}>
                      {idea.expiryDate ? formatInUserTZ(idea.expiryDate, 'MMM dd') : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* One-line catalyst preview */}
          <div className="pt-3 border-t">
            <p className="text-sm text-muted-foreground line-clamp-1">{idea.catalyst}</p>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-x border-b rounded-b-lg p-6 bg-card/50 space-y-5" onClick={(e) => e.stopPropagation()}>
          {/* Signal Strength Indicators - Moved from collapsed view */}
          {idea.qualitySignals && idea.qualitySignals.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Signal Strength
              </h4>
              <SignalStrengthBars signals={idea.qualitySignals} />
            </div>
          )}

          {/* Analysis Summary */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Analysis</h4>
            <p className="text-sm text-muted-foreground">{idea.analysis}</p>
          </div>

          {/* Full Catalyst Details */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Catalyst</h4>
            <p className="text-sm text-muted-foreground">{idea.catalyst}</p>
          </div>

          {/* Real-Time Trading Advice */}
          {currentPrice && (
            <div>
              <TradingAdvice idea={idea} currentPrice={currentPrice} />
            </div>
          )}

          {/* Quick Stats Grid - Enhanced with all metadata */}
          <div className="grid grid-cols-4 gap-4 p-4 rounded-lg bg-background/50 border">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Grade</div>
              <div className="text-lg font-bold">{getPerformanceGrade(idea.confidenceScore).grade}</div>
            </div>
            <div className="text-center border-x">
              <div className="text-xs text-muted-foreground mb-1">R:R Ratio</div>
              <div className="text-lg font-bold">
                {isFinite(idea.riskRewardRatio) && !isNaN(idea.riskRewardRatio) 
                  ? `${idea.riskRewardRatio.toFixed(1)}:1` 
                  : 'N/A'}
              </div>
            </div>
            <div className="text-center border-r">
              <div className="text-xs text-muted-foreground mb-1">Source</div>
              <div className="text-sm font-semibold">
                {idea.source === 'ai' ? 'AI' : 
                 idea.source === 'quant' ? 'Quant' : 
                 idea.source === 'hybrid' ? 'Hybrid' :
                 idea.source === 'flow' ? 'Flow' :
                 idea.source === 'news' ? 'News' :
                 'Manual'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Type</div>
              <div className="text-sm font-semibold">
                {idea.holdingPeriod === 'day' ? 'Day Trade' :
                 idea.holdingPeriod === 'swing' ? 'Swing' :
                 idea.holdingPeriod === 'position' ? 'Position' :
                 'Week-Ending'}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="default"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setDetailModalOpen(true);
              }}
              data-testid={`button-view-analysis-${idea.symbol}`}
            >
              <Maximize2 className="h-3.5 w-3.5 mr-2" />
              View Full Analysis
            </Button>
            {onViewDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(idea.symbol);
                }}
                data-testid={`button-view-details-${idea.symbol}`}
              >
                <Eye className="h-3.5 w-3.5 mr-2" />
                Symbol Details
              </Button>
            )}
            {onAddToWatchlist && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToWatchlist(idea);
                }}
                data-testid={`button-add-watchlist-${idea.symbol}`}
              >
                <Star className="h-3.5 w-3.5 mr-2" />
                Add to Watchlist
              </Button>
            )}
            {idea.outcomeStatus === 'open' && (
              <div onClick={(e) => e.stopPropagation()} className="flex-1">
                <ManualOutcomeRecorder
                  ideaId={idea.id}
                  symbol={idea.symbol}
                  entryPrice={idea.entryPrice}
                  direction={idea.direction}
                />
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>

      {/* Trade Idea Detail Modal */}
      <TradeIdeaDetailModal
        idea={idea}
        currentPrice={currentPrice}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onAddToWatchlist={onAddToWatchlist ? () => {
          onAddToWatchlist(idea);
          setDetailModalOpen(false);
        } : undefined}
      />
    </Collapsible>
  );
}
