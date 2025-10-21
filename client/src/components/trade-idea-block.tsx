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
import { ChevronDown, TrendingUp, TrendingDown, Star, Eye, Clock, ArrowUpRight, ArrowDownRight, Maximize2, ExternalLink, CalendarClock, CalendarDays, Calendar, Timer, Bot, BarChart3 } from "lucide-react";
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
  const priceChangePercent = currentPrice 
    ? ((currentPrice - idea.entryPrice) / idea.entryPrice) * 100
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
          {/* Header: Symbol + Direction + Holding Period + Grade */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold" data-testid={`text-symbol-${idea.symbol}`}>
                {idea.symbol}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Source Badge (AI vs Quant) */}
                <Badge 
                  variant="outline"
                  className={cn(
                    "font-semibold border-2",
                    idea.source === 'ai' 
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50" 
                      : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/50"
                  )}
                  data-testid={`badge-source-${idea.symbol}`}
                >
                  {idea.source === 'ai' ? (
                    <><Bot className="h-3 w-3 mr-1" />AI ENGINE</>
                  ) : (
                    <><BarChart3 className="h-3 w-3 mr-1" />QUANT ENGINE</>
                  )}
                </Badge>
                
                {/* Direction Badge */}
                <Badge 
                  variant={isLong ? "default" : "destructive"}
                  className="font-semibold"
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
                    "font-medium",
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

                {/* Earnings Warning Badge */}
                {upcomingEarnings && (
                  <Badge 
                    variant="destructive"
                    className="font-semibold animate-pulse"
                    data-testid={`badge-earnings-${idea.symbol}`}
                  >
                    <Calendar className="h-3 w-3 mr-1" />
                    EARNINGS {new Date(upcomingEarnings.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Badge>
                )}
                
                <span className="text-sm text-muted-foreground">
                  {idea.assetType === 'stock' ? 'Stock Shares' : 
                   idea.assetType === 'penny_stock' ? 'Penny Stock' : 
                   idea.assetType === 'option' ? 'Stock Options' : 
                   'Crypto'}
                </span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                <span className="text-xs font-medium text-muted-foreground" data-testid={`text-date-${idea.symbol}`}>{getFormattedDate()}</span>
                <span className="mx-1.5 text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{getTimeSincePosted()}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Enhanced Countdown Timer (for open ideas) */}
              {idea.outcomeStatus === 'open' && idea.exitBy && (
                <EnhancedCountdown exitBy={idea.exitBy} />
              )}
              
              {/* Outcome Badge for closed ideas */}
              {idea.outcomeStatus && idea.outcomeStatus !== 'open' && (
                <Badge 
                  variant={
                    idea.outcomeStatus === 'hit_target' ? 'default' : 
                    idea.outcomeStatus === 'hit_stop' ? 'destructive' : 
                    'secondary'
                  }
                  className="font-semibold"
                  data-testid={`badge-outcome-${idea.symbol}`}
                >
                  {idea.outcomeStatus === 'hit_target' ? 'HIT TARGET' :
                   idea.outcomeStatus === 'hit_stop' ? 'HIT STOP' :
                   idea.outcomeStatus === 'expired' ? 'EXPIRED' :
                   'CLOSED'}
                </Badge>
              )}
              
              {/* Circular Confidence Indicator */}
              <ConfidenceCircle 
                score={idea.confidenceScore} 
                size="md" 
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

          {/* PROMINENT CURRENT PRICE DISPLAY */}
          <div className="mb-4 p-4 rounded-lg border-2 bg-gradient-to-r from-blue-500/5 to-purple-500/5 border-blue-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Price</span>
              {currentPrice && (
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  priceChangePercent >= 0 ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                )}>
                  {priceChangePercent >= 0 ? '+' : ''}{formatPercent(priceChangePercent)}
                </span>
              )}
            </div>
            {currentPrice ? (
              <div className="flex items-baseline gap-3">
                <span className={cn(
                  "text-3xl font-bold font-mono",
                  priceUpdated && "price-update"
                )} data-testid={`text-current-price-${idea.symbol}`}>
                  {formatCurrency(currentPrice)}
                </span>
                <div className="flex flex-col text-xs text-muted-foreground">
                  <span>Entry: {formatCurrency(idea.entryPrice)}</span>
                  <span>Target: {formatCurrency(idea.targetPrice)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold font-mono text-muted-foreground">
                  Loading...
                </span>
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

          {/* Price Levels Grid - Essential Info Only */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Entry</div>
              <div className="text-base font-mono font-semibold">
                {formatCurrency(idea.entryPrice)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Target</div>
              <div className="text-base font-mono font-semibold text-green-500" data-testid={`text-target-preview-${idea.symbol}`}>
                {formatCurrency(idea.targetPrice)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Stop</div>
              <div className="text-base font-mono font-semibold text-red-500">
                {formatCurrency(idea.stopLoss)}
              </div>
            </div>
          </div>

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
              <div className="text-sm font-semibold">{idea.source === 'ai' ? 'AI' : idea.source === 'quant' ? 'Quant' : 'Manual'}</div>
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
