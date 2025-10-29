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
import { ChevronDown, TrendingUp, TrendingDown, Star, Eye, Clock, ArrowUpRight, ArrowDownRight, Maximize2, ExternalLink, CalendarClock, CalendarDays, Calendar, Timer, Bot, BarChart3, Activity, Shield, Target as TargetIcon, Sparkles, Newspaper } from "lucide-react";
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

  const getLetterGrade = (score: number): string => {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C+';
    if (score >= 70) return 'C';
    return 'D';
  };

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
        <div className="p-6 border rounded-lg bg-card hover-elevate transition-all block">
          {/* ===== HEADER SECTION ===== */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 min-w-0">
              {/* Symbol + Primary Badges */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h3 className="text-2xl font-bold font-mono" data-testid={`text-symbol-${idea.symbol}`}>
                  {idea.symbol}
                </h3>
                
                {/* Source Badge */}
                <Badge 
                  variant="outline"
                  className={cn(
                    "font-semibold border-2 text-xs",
                    idea.source === 'ai' 
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50" 
                      : idea.source === 'hybrid'
                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/50"
                      : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/50"
                  )}
                  data-testid={`badge-source-${idea.symbol}`}
                >
                  {idea.source === 'ai' ? (
                    <><Bot className="h-3 w-3 mr-1" />AI ENGINE</>
                  ) : idea.source === 'hybrid' ? (
                    <><Sparkles className="h-3 w-3 mr-1" />HYBRID (AI+QUANT)</>
                  ) : (
                    <><BarChart3 className="h-3 w-3 mr-1" />QUANT ENGINE</>
                  )}
                </Badge>
                
                {/* News Catalyst Badge - Shows when trade uses relaxed R:R validation */}
                {idea.isNewsCatalyst && (
                  <Badge 
                    variant="outline"
                    className="font-semibold border-2 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50"
                    data-testid={`badge-news-catalyst-${idea.symbol}`}
                  >
                    <Newspaper className="h-3 w-3 mr-1" />
                    NEWS CATALYST
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

                {/* Holding Period Badge */}
                <Badge 
                  variant="outline"
                  className={cn(
                    "font-medium text-xs",
                    idea.holdingPeriod === 'day' && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                    idea.holdingPeriod === 'swing' && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
                    idea.holdingPeriod === 'position' && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
                    idea.holdingPeriod === 'week-ending' && "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                  )}
                  data-testid={`badge-holding-${idea.symbol}`}
                >
                  {idea.holdingPeriod === 'day' && <><CalendarClock className="h-3 w-3 mr-1" />DAY TRADE</>}
                  {idea.holdingPeriod === 'swing' && <><CalendarDays className="h-3 w-3 mr-1" />SWING</>}
                  {idea.holdingPeriod === 'position' && <><Calendar className="h-3 w-3 mr-1" />POSITION</>}
                  {idea.holdingPeriod === 'week-ending' && <><Clock className="h-3 w-3 mr-1" />WEEK-ENDING</>}
                </Badge>

                {/* Asset Type Badge */}
                <Badge variant="outline" className="text-xs font-medium uppercase">
                  {idea.assetType === 'stock' ? 'Stock' : 
                   idea.assetType === 'penny_stock' ? 'Penny Stock' : 
                   idea.assetType === 'option' ? 'Option' : 
                   'Crypto'}
                </Badge>

                {/* Earnings Warning Badge */}
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

              {/* Metadata Row */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span className="font-medium" data-testid={`text-date-${idea.symbol}`}>
                  {getFormattedDate()}
                </span>
                <span>·</span>
                <span>{getTimeSincePosted()}</span>
              </div>
            </div>

            {/* Right Side: Confidence Grade + Expand Button */}
            <div className="flex items-center gap-4 flex-shrink-0">
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

          {/* ===== ENTRY TIME DISPLAY (OPEN TRADES) ===== */}
          {idea.outcomeStatus === 'open' && (
            <div className="mb-5 p-4 rounded-lg border bg-gradient-to-br from-blue-500/5 via-card to-purple-500/5" data-testid={`entry-info-${idea.symbol}`}>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-blue-400" />
                <h4 className="text-sm font-semibold text-blue-400">Trade Entry Information</h4>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {/* Posted Time */}
                <div className="p-3 rounded-lg bg-card border border-border/50">
                  <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Posted Time</div>
                  <div className="text-sm font-semibold" data-testid={`text-posted-time-${idea.symbol}`}>
                    {(() => {
                      const postedDate = new Date(idea.timestamp);
                      if (!isNaN(postedDate.getTime())) {
                        return formatInTimeZone(postedDate, 'America/Chicago', 'MMM d, h:mm a');
                      }
                      return idea.timestamp;
                    })()}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">CST</div>
                </div>

                {/* Enter When */}
                {idea.entryValidUntil && (
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Enter When</div>
                    <div className="text-sm font-semibold" data-testid={`text-entry-valid-${idea.symbol}`}>
                      {(() => {
                        const entryDate = new Date(idea.entryValidUntil);
                        if (!isNaN(entryDate.getTime())) {
                          return formatInTimeZone(entryDate, 'America/Chicago', 'MMM d, h:mm a');
                        }
                        return idea.entryValidUntil;
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">CST</div>
                  </div>
                )}
                
                {/* Exit By */}
                {idea.exitBy && (
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Exit By</div>
                    <div className="text-sm font-semibold" data-testid={`text-exit-by-${idea.symbol}`}>
                      {(() => {
                        const exitDate = new Date(idea.exitBy);
                        if (!isNaN(exitDate.getTime())) {
                          return formatInTimeZone(exitDate, 'America/Chicago', 'MMM d, h:mm a');
                        }
                        return idea.exitBy;
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">CST</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== ENTRY/EXIT TIMING ANALYSIS (CLOSED TRADES) ===== */}
          {idea.outcomeStatus !== 'open' && (
            <div className="mb-5 p-4 rounded-lg border bg-gradient-to-br from-blue-500/5 via-card to-purple-500/5" data-testid={`timing-analysis-${idea.symbol}`}>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-blue-400" />
                <h4 className="text-sm font-semibold text-blue-400">Trade Timing Analysis</h4>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {/* Entry Time */}
                <div className="p-3 rounded-lg bg-card border border-border/50">
                  <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Entry Time</div>
                  <div className="text-sm font-semibold" data-testid={`text-entry-time-${idea.symbol}`}>
                    {formatInTimeZone(parseISO(idea.timestamp), 'America/Chicago', 'MMM d, h:mm a')}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">CST</div>
                </div>

                {/* Exit Time */}
                {idea.exitDate && (
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Exit Time</div>
                    <div className="text-sm font-semibold" data-testid={`text-exit-time-${idea.symbol}`}>
                      {formatInTimeZone(parseISO(idea.exitDate), 'America/Chicago', 'MMM d, h:mm a')}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">CST</div>
                  </div>
                )}

                {/* Holding Duration */}
                {idea.actualHoldingTimeMinutes !== null && idea.actualHoldingTimeMinutes !== undefined && (
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Duration</div>
                    <div className="text-sm font-semibold" data-testid={`text-duration-${idea.symbol}`}>
                      {(() => {
                        if (idea.actualHoldingTimeMinutes < 60) {
                          return `${idea.actualHoldingTimeMinutes} min`;
                        } else if (idea.actualHoldingTimeMinutes < 1440) {
                          const hours = Math.floor(idea.actualHoldingTimeMinutes / 60);
                          const minutes = idea.actualHoldingTimeMinutes % 60;
                          return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
                        } else {
                          const days = Math.floor(idea.actualHoldingTimeMinutes / 1440);
                          const remainingMinutes = idea.actualHoldingTimeMinutes % 1440;
                          const hours = Math.floor(remainingMinutes / 60);
                          const minutes = remainingMinutes % 60;
                          if (minutes > 0) {
                            return `${days}d ${hours}h ${minutes}m`;
                          } else if (hours > 0) {
                            return `${days}d ${hours}h`;
                          } else {
                            return `${days}d`;
                          }
                        }
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {idea.holdingPeriod === 'day' ? 'Day Trade' : 
                       idea.holdingPeriod === 'swing' ? 'Swing Trade' : 
                       'Position'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== PRICE DISPLAY SECTION ===== */}
          <div className="mb-5 p-5 rounded-lg border bg-gradient-to-br from-card via-card to-muted/5">
            {currentPrice ? (
              <div className="space-y-4">
                {/* Current Price with Change */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      CURRENT PRICE
                    </span>
                    <span className={cn(
                      "text-sm font-bold px-2.5 py-1 rounded-md",
                      priceChangePercent >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    )}>
                      {formatPercent(priceChangePercent)}
                    </span>
                  </div>
                  <div className={cn(
                    "text-4xl font-bold font-mono",
                    priceUpdated && "price-update"
                  )} data-testid={`text-current-price-${idea.symbol}`}>
                    {formatCurrency(currentPrice)}
                  </div>
                </div>

                {/* Entry/Target/Stop Grid */}
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/50">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Entry</div>
                    <div className="text-lg font-semibold font-mono">{formatCurrency(idea.entryPrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-green-400 mb-1 uppercase tracking-wide flex items-center gap-1">
                      <TargetIcon className="h-3 w-3" />
                      Target
                    </div>
                    <div className="text-lg font-semibold font-mono text-green-400">{formatCurrency(idea.targetPrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-red-400 mb-1 uppercase tracking-wide flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Stop
                    </div>
                    <div className="text-lg font-semibold font-mono text-red-400">{formatCurrency(idea.stopLoss)}</div>
                  </div>
                </div>

                {/* Option Details Grid - Only for Options */}
                {idea.assetType === 'option' && idea.strikePrice !== null && idea.strikePrice !== undefined && idea.expiryDate && idea.optionType && (
                  <div className="grid grid-cols-3 gap-3 pt-3 mt-3 border-t border-border/50">
                    <div>
                      <div className="text-xs text-blue-400 mb-1 uppercase tracking-wide flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Type
                      </div>
                      <div className={cn(
                        "text-lg font-semibold font-mono uppercase",
                        idea.optionType === 'call' ? 'text-green-400' : 'text-red-400'
                      )}>
                        {idea.optionType}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-amber-400 mb-1 uppercase tracking-wide flex items-center gap-1">
                        <TargetIcon className="h-3 w-3" />
                        Strike
                      </div>
                      <div className="text-lg font-semibold font-mono text-amber-400">
                        {formatCurrency(idea.strikePrice)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-purple-400 mb-1 uppercase tracking-wide flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        Expiry
                      </div>
                      <div className="text-lg font-semibold font-mono text-purple-400">
                        {formatInUserTZ(idea.expiryDate, 'MMM dd')}
                      </div>
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

          {/* Signal Strength Indicators */}
          {idea.qualitySignals && idea.qualitySignals.length > 0 && (
            <div className="mb-4">
              <SignalStrengthBars signals={idea.qualitySignals} />
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
          {/* Analysis Summary */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Analysis</h4>
            <p className="text-sm text-muted-foreground line-clamp-2">{idea.analysis}</p>
          </div>

          {/* Real-Time Trading Advice */}
          {currentPrice && (
            <div>
              <TradingAdvice idea={idea} currentPrice={currentPrice} />
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-background/50 border">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Grade</div>
              <div className="text-lg font-bold">{getLetterGrade(idea.confidenceScore)}</div>
            </div>
            <div className="text-center border-x">
              <div className="text-xs text-muted-foreground mb-1">R:R Ratio</div>
              <div className="text-lg font-bold">
                {isFinite(idea.riskRewardRatio) && !isNaN(idea.riskRewardRatio) 
                  ? `${idea.riskRewardRatio.toFixed(1)}:1` 
                  : 'N/A'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Source</div>
              <div className="text-sm font-semibold">
                {idea.source === 'ai' ? 'AI' : 
                 idea.source === 'quant' ? 'Quant' : 
                 idea.source === 'hybrid' ? 'Hybrid' : 
                 'Manual'}
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
