import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Clock, TrendingUp, Lightbulb, Star } from "lucide-react";
import { ExplainabilityPanel } from "@/components/explainability-panel";
import type { TradeIdea } from "@shared/schema";

interface TradeIdeaDetailModalProps {
  idea: TradeIdea | null;
  currentPrice?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToWatchlist?: () => void;
}

export function TradeIdeaDetailModal({ 
  idea, 
  currentPrice, 
  open, 
  onOpenChange,
  onAddToWatchlist 
}: TradeIdeaDetailModalProps) {
  if (!idea) return null;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                {idea.symbol}
                <Badge variant={isLong ? "default" : "destructive"} className="text-sm">
                  {isLong ? <ArrowUpRight className="h-4 w-4 mr-1" /> : <ArrowDownRight className="h-4 w-4 mr-1" />}
                  {idea.direction.toUpperCase()}
                </Badge>
                {/* Outcome Badge for closed ideas */}
                {idea.outcomeStatus && idea.outcomeStatus !== 'open' && (
                  <Badge 
                    variant={
                      idea.outcomeStatus === 'hit_target' ? 'default' : 
                      idea.outcomeStatus === 'hit_stop' ? 'destructive' : 
                      'secondary'
                    }
                    className="text-sm font-semibold"
                  >
                    {idea.outcomeStatus === 'hit_target' ? 'HIT TARGET' :
                     idea.outcomeStatus === 'hit_stop' ? 'HIT STOP' :
                     idea.outcomeStatus === 'expired' ? 'EXPIRED' :
                     'CLOSED'}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-2 text-sm">
                <span>{idea.assetType === 'option' ? 'Option' : idea.assetType === 'stock' ? 'Stock' : 'Crypto'}</span>
                <span>•</span>
                <span>Grade: {getLetterGrade(idea.confidenceScore)}</span>
                {currentPrice && (
                  <>
                    <span>•</span>
                    <span className={cn(
                      "font-semibold",
                      priceChangePercent >= 0 ? "text-green-500" : "text-red-500"
                    )}>
                      {priceChangePercent >= 0 ? '+' : ''}{formatPercent(priceChangePercent)}
                    </span>
                  </>
                )}
              </DialogDescription>
            </div>
            {onAddToWatchlist && (
              <Button variant="outline" size="sm" onClick={onAddToWatchlist}>
                <Star className="h-4 w-4 mr-2" />
                Add to Watchlist
              </Button>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Current Price */}
            {currentPrice && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Current Price</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono">
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

            {/* Price Levels */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Trade Levels</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-muted/30">
                  <div className="text-xs text-muted-foreground mb-1">Entry</div>
                  <div className="text-lg font-bold font-mono">{formatCurrency(idea.entryPrice)}</div>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10">
                  <div className="text-xs text-muted-foreground mb-1">Target</div>
                  <div className="text-lg font-bold font-mono text-green-500">{formatCurrency(idea.targetPrice)}</div>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10">
                  <div className="text-xs text-muted-foreground mb-1">Stop Loss</div>
                  <div className="text-lg font-bold font-mono text-red-500">{formatCurrency(idea.stopLoss)}</div>
                </div>
              </div>
            </div>

            {/* Time Windows */}
            {(idea.entryValidUntil || idea.exitBy) && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Time Windows
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {idea.entryValidUntil && (
                    <div className="p-3 rounded-lg border">
                      <div className="text-xs text-muted-foreground mb-1">Enter By</div>
                      <div className="text-sm font-semibold">{idea.entryValidUntil}</div>
                    </div>
                  )}
                  {idea.exitBy && (
                    <div className="p-3 rounded-lg border">
                      <div className="text-xs text-muted-foreground mb-1">Exit By</div>
                      <div className="text-sm font-semibold">{idea.exitBy}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Trade Details */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Trade Details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                  <span className="text-sm text-muted-foreground">Risk:Reward</span>
                  <span className="text-sm font-semibold">
                    {isFinite(idea.riskRewardRatio) && !isNaN(idea.riskRewardRatio) 
                      ? `${idea.riskRewardRatio.toFixed(1)}:1` 
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                  <span className="text-sm text-muted-foreground">Source</span>
                  <span className="text-sm font-semibold">{idea.source === 'ai' ? 'AI' : idea.source === 'quant' ? 'Quantitative' : 'Manual'}</span>
                </div>
                {idea.assetType === 'option' && idea.strikePrice && (
                  <>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Strike Price</span>
                      <span className="text-sm font-semibold">${idea.strikePrice}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Option Type</span>
                      <span className="text-sm font-semibold">{idea.optionType?.toUpperCase()}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Explainability Panel */}
            <ExplainabilityPanel idea={idea} />
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Detailed Analysis
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {idea.analysis}
                </p>
              </div>

              {idea.qualitySignals && idea.qualitySignals.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Quality Signals</h3>
                  <div className="flex flex-wrap gap-2">
                    {idea.qualitySignals.map((signal, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {signal}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sentiment" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" />
                  Market Catalyst
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {idea.catalyst}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-muted/30">
                <h3 className="text-sm font-semibold mb-3">Market Sentiment</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-lg bg-green-500/10">
                    <div className="text-2xl font-bold text-green-500">
                      {isLong ? '68%' : '32%'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Bullish</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-yellow-500/10">
                    <div className="text-2xl font-bold text-yellow-500">21%</div>
                    <div className="text-xs text-muted-foreground mt-1">Neutral</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-500/10">
                    <div className="text-2xl font-bold text-red-500">
                      {isLong ? '11%' : '47%'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Bearish</div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Session Context</h3>
                <p className="text-sm text-muted-foreground">
                  {idea.sessionContext}
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
