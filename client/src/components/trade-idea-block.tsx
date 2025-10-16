import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, formatCTTime } from "@/lib/utils";
import { ChevronDown, TrendingUp, TrendingDown, Star, Brain, Sparkles, AlertTriangle, BarChart3, Eye, Clock } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TradeIdea, MarketData } from "@shared/schema";

interface TradeIdeaBlockProps {
  idea: TradeIdea;
  currentPrice?: number;
  onAddToWatchlist?: (idea: TradeIdea) => void;
  onViewDetails?: (symbol: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: (ideaId: string) => void;
}

export function TradeIdeaBlock({ idea, currentPrice, onAddToWatchlist, onViewDetails, isExpanded, onToggleExpand }: TradeIdeaBlockProps) {
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const isOpen = isExpanded !== undefined ? isExpanded : localIsOpen;
  const [perfDialogOpen, setPerfDialogOpen] = useState(false);
  const [outcome, setOutcome] = useState<string>('');
  const [actualExit, setActualExit] = useState<string>('');
  const { toast } = useToast();

  const performanceMutation = useMutation({
    mutationFn: async (data: { outcomeStatus: string; actualExit?: number; exitDate: string }) => {
      return await apiRequest('PATCH', `/api/trade-ideas/${idea.id}/performance`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      toast({ title: "Performance recorded", description: "Trade outcome has been saved" });
      setPerfDialogOpen(false);
      setOutcome('');
      setActualExit('');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record performance", variant: "destructive" });
    }
  });

  const handlePerformanceSubmit = () => {
    if (!outcome) return;
    performanceMutation.mutate({
      outcomeStatus: outcome,
      actualExit: actualExit ? parseFloat(actualExit) : undefined,
      exitDate: new Date().toISOString()
    });
  };
  
  const isLong = idea.direction === 'long';
  const displayPrice = currentPrice ?? idea.entryPrice;
  
  // Calculate price change vs entry
  const priceChangePercent = currentPrice 
    ? ((currentPrice - idea.entryPrice) / idea.entryPrice) * 100
    : 0;

  // Calculate dynamic grade based on market movement
  const calculateDynamicGrade = (): number => {
    if (!currentPrice) return idea.confidenceScore;
    
    // Adjust grade based on price movement
    let adjustedScore = idea.confidenceScore;
    
    if (isLong) {
      // Long position: grade improves as price moves toward target, degrades toward stop
      const entryToTarget = idea.targetPrice - idea.entryPrice;
      const entryToStop = idea.entryPrice - idea.stopLoss;
      
      if (currentPrice > idea.entryPrice && currentPrice < idea.targetPrice) {
        // Moving toward target - improve grade
        const percentToTarget = entryToTarget !== 0 ? ((currentPrice - idea.entryPrice) / entryToTarget) * 100 : 0;
        adjustedScore = Math.min(95, idea.confidenceScore + (percentToTarget * 0.15));
      } else if (currentPrice >= idea.targetPrice) {
        adjustedScore = 95; // At or above target
      } else if (currentPrice < idea.entryPrice) {
        // Moving toward stop - degrade grade
        const distanceToStop = Math.abs(idea.entryPrice - currentPrice);
        const totalRisk = Math.abs(entryToStop);
        const percentToStop = totalRisk !== 0 ? (distanceToStop / totalRisk) * 100 : 0;
        adjustedScore = Math.max(50, idea.confidenceScore - (percentToStop * 0.2));
      }
    } else {
      // Short position: grade improves as price moves toward (lower) target, degrades toward (higher) stop
      const entryToTarget = idea.entryPrice - idea.targetPrice; // Positive for shorts
      const entryToStop = idea.stopLoss - idea.entryPrice; // Positive for shorts
      
      if (currentPrice < idea.entryPrice && currentPrice > idea.targetPrice) {
        // Moving toward target - improve grade
        const distanceToTarget = Math.abs(idea.entryPrice - currentPrice);
        const totalProfit = Math.abs(entryToTarget);
        const percentToTarget = totalProfit !== 0 ? (distanceToTarget / totalProfit) * 100 : 0;
        adjustedScore = Math.min(95, idea.confidenceScore + (percentToTarget * 0.15));
      } else if (currentPrice <= idea.targetPrice) {
        adjustedScore = 95; // At or below target
      } else if (currentPrice > idea.entryPrice) {
        // Moving toward stop - degrade grade
        const distanceToStop = Math.abs(currentPrice - idea.entryPrice);
        const totalRisk = Math.abs(entryToStop);
        const percentToStop = totalRisk !== 0 ? (distanceToStop / totalRisk) * 100 : 0;
        adjustedScore = Math.max(50, idea.confidenceScore - (percentToStop * 0.2));
      }
    }
    
    return Math.round(adjustedScore);
  };

  const dynamicScore = calculateDynamicGrade();

  // Calculate letter grade with +/- modifiers
  const getLetterGrade = (score: number): string => {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A-';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C+';
    if (score >= 70) return 'C';
    return 'D';
  };

  const getGradeColor = (score: number): string => {
    if (score >= 90) return 'text-green-400';
    if (score >= 80) return 'text-blue-400';
    if (score >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  // Check if this is a true day trade (intraday opportunity)
  const isDayTrade = () => {
    if (idea.assetType === 'option') {
      // Options are only day trades if expiring TODAY
      const today = new Date().toDateString();
      const expiryDate = idea.expiryDate ? new Date(idea.expiryDate).toDateString() : null;
      return expiryDate === today;
    }
    // For stocks/crypto, check if it's during active trading session
    return idea.sessionContext.includes('Regular Trading') || 
           idea.sessionContext.includes('Pre-Market') || 
           idea.sessionContext.includes('After Hours');
  };

  // Calculate time since posted
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

  // Calculate current P&L
  const calculatePL = (): { value: number; percent: number } => {
    if (!currentPrice) return { value: 0, percent: 0 };
    
    if (isLong) {
      const plValue = currentPrice - idea.entryPrice;
      const plPercent = (plValue / idea.entryPrice) * 100;
      return { value: plValue, percent: plPercent };
    } else {
      const plValue = idea.entryPrice - currentPrice;
      const plPercent = (plValue / idea.entryPrice) * 100;
      return { value: plValue, percent: plPercent };
    }
  };

  // Calculate progress to target (0-100)
  const calculateProgress = (): number => {
    if (!currentPrice) return 0;

    if (isLong) {
      const totalDistance = idea.targetPrice - idea.entryPrice;
      const currentDistance = currentPrice - idea.entryPrice;
      const progress = (currentDistance / totalDistance) * 100;
      return Math.max(0, Math.min(100, progress));
    } else {
      const totalDistance = idea.entryPrice - idea.targetPrice;
      const currentDistance = idea.entryPrice - currentPrice;
      const progress = (currentDistance / totalDistance) * 100;
      return Math.max(0, Math.min(100, progress));
    }
  };

  const pl = calculatePL();
  const progress = calculateProgress();

  const handleToggle = (newOpenState: boolean) => {
    if (onToggleExpand) {
      // Only toggle if clicking to expand, or if clicking to collapse when already expanded
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
      className="group hover-elevate active-elevate-2 relative"
    >
      {/* Quick Action Buttons - Positioned Absolutely on Hover */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        {onViewDetails && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background/80 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(idea.symbol);
            }}
            data-testid={`button-quick-view-${idea.symbol}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
        {onAddToWatchlist && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background/80 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddToWatchlist(idea);
            }}
            data-testid={`button-quick-star-${idea.symbol}`}
          >
            <Star className="h-4 w-4" />
          </Button>
        )}
      </div>

      <CollapsibleTrigger className="w-full" data-testid={`block-trade-idea-${idea.symbol}`}>
        <div className="p-4 border rounded-lg bg-card">
          {/* Top Row: Symbol, Direction, Time Posted */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 
                className="text-xl font-bold font-mono"
                data-testid={`text-symbol-${idea.symbol}`}
              >
                {idea.symbol}
              </h3>
              <Badge 
                variant={isLong ? "default" : "destructive"} 
                className="font-semibold text-xs"
                data-testid={`badge-direction-${idea.symbol}`}
              >
                {isLong ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {idea.direction.toUpperCase()}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {getTimeSincePosted()}
              </span>
            </div>
            
            <ChevronDown 
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform flex-shrink-0",
                isOpen && "rotate-180"
              )}
            />
          </div>

          {/* Asset Type & Options Details */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant="secondary" className="text-xs font-semibold">
              {idea.assetType === 'option' ? 'OPTIONS' : idea.assetType === 'stock' ? 'SHARES' : 'CRYPTO'}
            </Badge>
            {idea.assetType === 'option' && idea.strikePrice !== undefined && idea.optionType && (
              <>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs font-semibold",
                    idea.optionType === 'call' ? 'border-bullish text-bullish' : 'border-bearish text-bearish'
                  )}
                  data-testid={`badge-option-type-${idea.symbol}`}
                >
                  {idea.optionType.toUpperCase()}
                </Badge>
                <Badge 
                  variant="secondary" 
                  className="text-xs font-semibold"
                  data-testid={`badge-strike-${idea.symbol}`}
                >
                  Strike: ${idea.strikePrice}
                </Badge>
                {idea.expiryDate && (
                  <Badge 
                    variant="outline" 
                    className="text-xs font-semibold text-muted-foreground"
                    data-testid={`badge-expiry-${idea.symbol}`}
                  >
                    Exp: {idea.expiryDate}
                  </Badge>
                )}
              </>
            )}
          </div>

          {/* Price Grid: Current | Entry | Target */}
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Current</span>
              <span className="text-lg font-bold font-mono block" data-testid={`text-current-price-${idea.symbol}`}>
                {formatCurrency(displayPrice)}
              </span>
              {currentPrice && (
                <span className={cn(
                  "text-xs font-semibold font-mono",
                  priceChangePercent >= 0 ? "text-bullish" : "text-bearish"
                )}>
                  {priceChangePercent >= 0 ? '+' : ''}{formatPercent(priceChangePercent)}
                </span>
              )}
            </div>

            <div>
              <span className="text-xs text-muted-foreground block mb-1">Entry</span>
              <span className="text-lg font-bold font-mono text-blue-400 block">
                {formatCurrency(idea.entryPrice)}
              </span>
            </div>

            <div>
              <span className="text-xs text-muted-foreground block mb-1">Target</span>
              <span className="text-lg font-bold font-mono text-bullish block" data-testid={`text-target-preview-${idea.symbol}`}>
                {formatCurrency(idea.targetPrice)}
              </span>
            </div>
          </div>

          {/* Real-time P&L Display */}
          {currentPrice && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Unrealized P&L</span>
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    "text-sm font-bold font-mono",
                    pl.value >= 0 ? "text-bullish" : "text-bearish"
                  )}>
                    {pl.value >= 0 ? '+' : ''}{formatCurrency(pl.value)}
                  </span>
                  <span className={cn(
                    "text-xs font-semibold font-mono",
                    pl.percent >= 0 ? "text-bullish" : "text-bearish"
                  )}>
                    ({pl.percent >= 0 ? '+' : ''}{formatPercent(pl.percent)})
                  </span>
                </div>
              </div>
              
              {/* Visual Progress Bar */}
              <div className="relative">
                <Progress 
                  value={progress} 
                  className={cn(
                    "h-2",
                    progress >= 100 ? "bg-bullish/20" : progress < 0 ? "bg-bearish/20" : ""
                  )}
                  data-testid={`progress-target-${idea.symbol}`}
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">Entry</span>
                  <span className={cn(
                    "text-xs font-semibold",
                    progress >= 80 ? "text-bullish" : progress >= 50 ? "text-blue-400" : "text-muted-foreground"
                  )}>
                    {progress.toFixed(0)}% to target
                  </span>
                  <span className="text-xs text-bullish">Target</span>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Row: Grade & Source */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <span className="text-xs text-muted-foreground">Grade</span>
                <div className="flex items-baseline gap-1">
                  <span className={cn(
                    "text-2xl font-bold",
                    getGradeColor(dynamicScore)
                  )} data-testid={`text-confidence-${idea.symbol}`}>
                    {getLetterGrade(dynamicScore)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {dynamicScore}%
                  </span>
                </div>
              </div>
            </div>

            {idea.source && (
              <Badge 
                variant={idea.source === 'ai' ? 'secondary' : 'outline'} 
                className={cn(
                  "text-xs font-semibold gap-1",
                  idea.source === 'ai' ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                )}
                data-testid={`badge-source-${idea.symbol}`}
              >
                {idea.source === 'ai' ? (
                  <>
                    <Brain className="h-3 w-3" />
                    AI
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    QUANT
                  </>
                )}
              </Badge>
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-x border-b rounded-b-lg p-4 bg-card/50 space-y-4" onClick={(e) => e.stopPropagation()}>
          {/* Quality Signals */}
          {idea.qualitySignals && idea.qualitySignals.length > 0 && (
            <div data-testid={`quality-signals-${idea.symbol}`}>
              <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Quality Signals</h4>
              <div className="flex flex-wrap gap-2">
                {idea.qualitySignals.map((signal, idx) => (
                  <Badge 
                    key={idx} 
                    variant="outline" 
                    className="text-xs"
                    data-testid={`quality-signal-${idea.symbol}-${idx}`}
                  >
                    {signal}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Price Levels */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Entry</span>
              <span className="text-lg font-bold font-mono text-blue-400" data-testid={`text-entry-${idea.symbol}`}>
                {formatCurrency(idea.entryPrice)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Target</span>
              <span className="text-lg font-bold font-mono text-bullish" data-testid={`text-target-${idea.symbol}`}>
                {formatCurrency(idea.targetPrice)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Stop</span>
              <span className="text-lg font-bold font-mono text-bearish" data-testid={`text-stop-${idea.symbol}`}>
                {formatCurrency(idea.stopLoss)}
              </span>
            </div>
          </div>

          {/* R:R Ratio */}
          <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
            <span className="text-sm font-semibold">Risk/Reward Ratio</span>
            <span className="text-xl font-bold font-mono text-primary" data-testid={`text-rr-${idea.symbol}`}>
              {idea.riskRewardRatio?.toFixed(1) || 'N/A'}:1
            </span>
          </div>

          {/* Analysis - Made more prominent with max-height to prevent overstimulation */}
          <div className="bg-muted/30 p-4 rounded-lg border border-muted" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-bold mb-3 text-foreground">In-Depth Analysis</h4>
            <div className="max-h-32 overflow-y-auto">
              <p className="text-base leading-relaxed" data-testid={`text-analysis-${idea.symbol}`}>
                {idea.analysis}
              </p>
            </div>
          </div>

          {/* Catalyst */}
          <div className="bg-muted/20 p-3 rounded-lg" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Catalyst</h4>
            <p className="text-sm" data-testid={`text-catalyst-${idea.symbol}`}>
              {idea.catalyst}
            </p>
          </div>

          {/* Session & Warnings */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {idea.sessionContext}
            </Badge>
            {isDayTrade() && (
              <Badge 
                variant="outline" 
                className="text-xs font-semibold bg-amber-500/10 text-amber-300 border-amber-500/30"
                data-testid={`badge-day-trade-${idea.symbol}`}
              >
                DAY TRADE
              </Badge>
            )}
            {idea.liquidityWarning && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                Low Liquidity
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {onViewDetails && (
              <Button
                variant="default"
                size="sm"
                className="flex-1 gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewDetails(idea.symbol);
                }}
                data-testid={`button-view-details-${idea.symbol}`}
              >
                View Details
              </Button>
            )}
            <Dialog open={perfDialogOpen} onOpenChange={setPerfDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-track-performance-${idea.symbol}`}
                >
                  <BarChart3 className="h-4 w-4" />
                  Track Performance
                </Button>
              </DialogTrigger>
              <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Track Performance - {idea.symbol}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="outcome">Outcome</Label>
                    <Select value={outcome} onValueChange={setOutcome}>
                      <SelectTrigger id="outcome" data-testid="select-outcome">
                        <SelectValue placeholder="Select outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WIN">Win</SelectItem>
                        <SelectItem value="LOSS">Loss</SelectItem>
                        <SelectItem value="BREAKEVEN">Break Even</SelectItem>
                        <SelectItem value="STOPPED">Stopped Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="exit-price">Exit Price (optional)</Label>
                    <Input
                      id="exit-price"
                      type="number"
                      step="0.01"
                      value={actualExit}
                      onChange={(e) => setActualExit(e.target.value)}
                      placeholder="Enter exit price"
                      data-testid="input-exit-price"
                    />
                  </div>
                  <Button
                    onClick={handlePerformanceSubmit}
                    disabled={!outcome || performanceMutation.isPending}
                    className="w-full"
                    data-testid="button-submit-performance"
                  >
                    {performanceMutation.isPending ? 'Saving...' : 'Save Performance'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            {onAddToWatchlist && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToWatchlist(idea);
                }}
                data-testid={`button-watchlist-${idea.symbol}`}
              >
                <Star className="h-4 w-4" />
                Add to Watchlist
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
