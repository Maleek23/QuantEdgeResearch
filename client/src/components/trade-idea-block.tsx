import { useState, useEffect, useRef } from "react";
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
import { DataQualityBadge } from "@/components/data-quality-badge";
import { ExplainabilityPanel } from "@/components/explainability-panel";
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
  const [priceUpdated, setPriceUpdated] = useState(false);
  const prevPriceRef = useRef<number | undefined>(currentPrice);
  const { toast } = useToast();

  // Trigger animation when price changes
  useEffect(() => {
    if (currentPrice !== undefined && prevPriceRef.current !== undefined && currentPrice !== prevPriceRef.current) {
      setPriceUpdated(true);
      prevPriceRef.current = currentPrice; // Update ref immediately after detecting change
      const timer = setTimeout(() => setPriceUpdated(false), 300); // Match animation duration
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice; // Update ref for initial mount or when price is undefined
  }, [currentPrice]);

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
          {/* Top Row: Symbol with Real-Time Price & Direction */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h3 
                    className="text-2xl font-bold font-mono"
                    data-testid={`text-symbol-${idea.symbol}`}
                  >
                    {idea.symbol}
                  </h3>
                  <Badge 
                    variant={isLong ? "default" : "destructive"} 
                    className="font-semibold"
                    data-testid={`badge-direction-${idea.symbol}`}
                  >
                    {isLong ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                    {idea.direction.toUpperCase()}
                  </Badge>
                </div>
                {/* Real-Time Price Display */}
                {currentPrice && (
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={cn(
                      "text-2xl font-bold font-mono",
                      priceUpdated && "price-update",
                      priceChangePercent >= 0 ? "text-bullish" : "text-bearish"
                    )} data-testid={`text-current-price-${idea.symbol}`}>
                      {formatCurrency(currentPrice)}
                    </span>
                    <span className={cn(
                      "text-sm font-semibold font-mono",
                      priceChangePercent >= 0 ? "text-bullish" : "text-bearish"
                    )}>
                      {priceChangePercent >= 0 ? '+' : ''}{formatPercent(priceChangePercent)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Grade</div>
                <Badge variant="outline" className={cn(
                  "font-bold",
                  getLetterGrade(dynamicScore).startsWith('A') && 'border-bullish text-bullish',
                  getLetterGrade(dynamicScore).startsWith('B') && 'border-amber-500 text-amber-400',
                  getLetterGrade(dynamicScore).startsWith('C') && 'border-muted text-muted-foreground'
                )}>
                  {getLetterGrade(dynamicScore)}
                </Badge>
              </div>
              <ChevronDown 
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform flex-shrink-0",
                  isOpen && "rotate-180"
                )}
              />
            </div>
          </div>

          {/* Compact Info Row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              {idea.assetType === 'option' ? 'OPTIONS' : idea.assetType === 'stock' ? 'SHARES' : 'CRYPTO'}
            </Badge>
            
            <DataQualityBadge 
              assetType={idea.assetType} 
              dataSource={idea.dataSourceUsed || undefined}
            />
            
            <Badge variant="outline" className="text-xs gap-1" data-testid={`badge-source-${idea.symbol}`}>
              {idea.source === 'ai' && <Sparkles className="h-3 w-3" />}
              {idea.source === 'quant' && <BarChart3 className="h-3 w-3" />}
              {idea.source === 'ai' && 'AI'}
              {idea.source === 'quant' && 'QUANT'}
            </Badge>
            
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {getTimeSincePosted()}
            </span>
            
            {idea.assetType === 'option' && idea.strikePrice !== undefined && idea.optionType && (
              <>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    idea.optionType === 'call' ? 'border-bullish text-bullish' : 'border-bearish text-bearish'
                  )}
                  data-testid={`badge-option-type-${idea.symbol}`}
                >
                  {idea.optionType.toUpperCase()} ${idea.strikePrice}
                </Badge>
                {idea.expiryDate && (
                  <Badge variant="outline" className="text-xs text-muted-foreground" data-testid={`badge-expiry-${idea.symbol}`}>
                    {idea.expiryDate}
                  </Badge>
                )}
              </>
            )}
          </div>

          {/* Simplified Price Targets */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="flex justify-between items-center px-3 py-2 rounded-md bg-background/50">
              <span className="text-xs text-muted-foreground">Entry</span>
              <span className="text-sm font-bold font-mono text-blue-400">
                {formatCurrency(idea.entryPrice)}
              </span>
            </div>

            <div className="flex justify-between items-center px-3 py-2 rounded-md bg-background/50">
              <span className="text-xs text-muted-foreground">Target</span>
              <span className="text-sm font-bold font-mono text-bullish" data-testid={`text-target-preview-${idea.symbol}`}>
                {formatCurrency(idea.targetPrice)}
              </span>
            </div>
          </div>

          {/* Time Windows for Day Trading */}
          {(idea.entryValidUntil || idea.exitBy) && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {idea.entryValidUntil && (
                <div className="flex flex-col px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Enter By
                  </span>
                  <span className="text-xs font-bold font-mono text-amber-400" data-testid={`text-entry-valid-${idea.symbol}`}>
                    {idea.entryValidUntil}
                  </span>
                </div>
              )}
              {idea.exitBy && (
                <div className="flex flex-col px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20">
                  <span className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Exit By
                  </span>
                  <span className="text-xs font-bold font-mono text-red-400" data-testid={`text-exit-by-${idea.symbol}`}>
                    {idea.exitBy}
                  </span>
                </div>
              )}
            </div>
          )}

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
                    getGradeColor(idea.confidenceScore)
                  )} data-testid={`text-confidence-${idea.symbol}`}>
                    {idea.probabilityBand || getLetterGrade(idea.confidenceScore)}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {idea.confidenceScore}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-x border-b rounded-b-lg p-4 bg-card/50 space-y-4" onClick={(e) => e.stopPropagation()}>
          {/* Explainability Panel - Show exact technical indicators (if available) */}
          <ExplainabilityPanel idea={idea} />

          {/* Trade Timing & Duration */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-amber-400 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-amber-300">Trade Timeframe</span>
                  {isDayTrade() && (
                    <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">
                      DAY TRADE
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isDayTrade() 
                    ? "Enter at market open or on breakout. Exit by end of day or when target/stop is hit."
                    : "Swing trade: Hold for 2-5 days or until target/stop is reached. Monitor daily for exit signals."}
                </p>
                <p className="text-xs text-amber-400/80">
                  ⏰ Idea valid for 24 hours from posting
                </p>
              </div>
            </div>
          </div>

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
                        <SelectItem value="hit_target" data-testid="option-hit-target">Win (Hit Target)</SelectItem>
                        <SelectItem value="hit_stop" data-testid="option-hit-stop">Loss (Hit Stop)</SelectItem>
                        <SelectItem value="manual_exit" data-testid="option-manual-exit">Manual Exit</SelectItem>
                        <SelectItem value="expired" data-testid="option-expired">Expired</SelectItem>
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
