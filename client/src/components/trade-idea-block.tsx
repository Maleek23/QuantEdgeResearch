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
import { ChevronDown, TrendingUp, TrendingDown, Star, Eye, Clock, ArrowUpRight, ArrowDownRight, Maximize2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ExplainabilityPanel } from "@/components/explainability-panel";
import { TradeIdeaDetailModal } from "@/components/trade-idea-detail-modal";
import { TradingAdvice } from "@/components/trading-advice";
import type { TradeIdea } from "@shared/schema";

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
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [outcome, setOutcome] = useState<string>('');
  const [actualExit, setActualExit] = useState<string>('');
  const [priceUpdated, setPriceUpdated] = useState(false);
  const prevPriceRef = useRef<number | undefined>(currentPrice);
  const { toast } = useToast();

  useEffect(() => {
    if (currentPrice !== undefined && prevPriceRef.current !== undefined && currentPrice !== prevPriceRef.current) {
      setPriceUpdated(true);
      prevPriceRef.current = currentPrice;
      const timer = setTimeout(() => setPriceUpdated(false), 300);
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice;
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
        <div className="p-6 border rounded-lg bg-card hover-elevate transition-all">
          {/* Header: Symbol + Direction + Grade */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold" data-testid={`text-symbol-${idea.symbol}`}>
                {idea.symbol}
              </h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {isLong ? (
                  <ArrowUpRight className="h-4 w-4 text-green-500" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                )}
                <span className={isLong ? "text-green-500" : "text-red-500"}>
                  {idea.direction.toUpperCase()}
                </span>
                <span className="mx-1.5">·</span>
                <span>{idea.assetType === 'option' ? 'Option' : idea.assetType === 'stock' ? 'Stock' : 'Crypto'}</span>
                <span className="mx-1.5">·</span>
                <span className="text-xs">{getTimeSincePosted()}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Grade</div>
                <div className="text-lg font-semibold">{getLetterGrade(idea.confidenceScore)}</div>
              </div>
              <ChevronDown 
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </div>
          </div>

          {/* Current Price */}
          {currentPrice && (
            <div className="mb-4">
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  "text-xl font-bold font-mono",
                  priceUpdated && "price-update"
                )} data-testid={`text-current-price-${idea.symbol}`}>
                  {formatCurrency(currentPrice)}
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  priceChangePercent >= 0 ? "text-green-500" : "text-red-500"
                )}>
                  {priceChangePercent >= 0 ? '+' : ''}{formatPercent(priceChangePercent)}
                </span>
              </div>
            </div>
          )}

          {/* Price Levels Grid */}
          <div className="grid grid-cols-3 gap-4 mb-4">
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

          {/* Real-Time Trading Advice */}
          {currentPrice && (
            <div className="pt-3 border-t">
              <TradingAdvice idea={idea} currentPrice={currentPrice} />
            </div>
          )}

          {/* Time Windows */}
          {(idea.entryValidUntil || idea.exitBy) && (
            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              {idea.entryValidUntil && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Enter by</div>
                    <div className="text-xs font-medium" data-testid={`text-entry-valid-${idea.symbol}`}>
                      {idea.entryValidUntil}
                    </div>
                  </div>
                </div>
              )}
              {idea.exitBy && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Exit by</div>
                    <div className="text-xs font-medium" data-testid={`text-exit-by-${idea.symbol}`}>
                      {idea.exitBy}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-x border-b rounded-b-lg p-6 bg-card/50 space-y-6" onClick={(e) => e.stopPropagation()}>
          {/* Catalyst */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Catalyst</h4>
            <p className="text-sm text-muted-foreground">{idea.catalyst}</p>
          </div>

          {/* Analysis */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Analysis</h4>
            <p className="text-sm text-muted-foreground">{idea.analysis}</p>
          </div>

          {/* Explainability Panel */}
          <ExplainabilityPanel idea={idea} />

          {/* Trade Details */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <div className="text-xs text-muted-foreground mb-1">R:R Ratio</div>
              <div className="text-sm font-semibold">{idea.riskRewardRatio.toFixed(1)}:1</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Source</div>
              <div className="text-sm font-semibold">{idea.source === 'ai' ? 'AI' : idea.source === 'quant' ? 'Quantitative' : 'Manual'}</div>
            </div>
            {idea.assetType === 'option' && idea.strikePrice && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Strike</div>
                  <div className="text-sm font-semibold">${idea.strikePrice}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Type</div>
                  <div className="text-sm font-semibold">{idea.optionType?.toUpperCase()}</div>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-4 border-t">
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
            <Dialog open={perfDialogOpen} onOpenChange={setPerfDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-record-outcome-${idea.symbol}`}
                >
                  Record Outcome
                </Button>
              </DialogTrigger>
              <DialogContent onClick={(e) => e.stopPropagation()}>
                <DialogHeader>
                  <DialogTitle>Record Trade Outcome</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="outcome">Outcome</Label>
                    <Select value={outcome} onValueChange={setOutcome}>
                      <SelectTrigger id="outcome">
                        <SelectValue placeholder="Select outcome" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hit_target">Hit Target</SelectItem>
                        <SelectItem value="hit_stop">Hit Stop Loss</SelectItem>
                        <SelectItem value="manual_exit">Manual Exit</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="exit-price">Exit Price (optional)</Label>
                    <Input
                      id="exit-price"
                      type="number"
                      step="0.01"
                      value={actualExit}
                      onChange={(e) => setActualExit(e.target.value)}
                      placeholder={idea.entryPrice.toString()}
                    />
                  </div>
                  <Button
                    onClick={handlePerformanceSubmit}
                    disabled={!outcome || performanceMutation.isPending}
                    className="w-full"
                  >
                    {performanceMutation.isPending ? 'Saving...' : 'Save Outcome'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
