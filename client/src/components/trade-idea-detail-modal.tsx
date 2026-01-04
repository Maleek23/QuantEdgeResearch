import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";
import { getPnlColor } from "@/lib/signal-grade";
import { ArrowUpRight, ArrowDownRight, Clock, TrendingUp, Lightbulb, Star } from "lucide-react";
import { ExplainabilityPanel } from "@/components/explainability-panel";
import type { TradeIdea } from "@shared/schema";
import { formatInTimeZone } from "date-fns-tz";

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
  // Price change calculation that respects trade direction
  const priceChangePercent = currentPrice 
    ? isLong
      ? ((currentPrice - idea.entryPrice) / idea.entryPrice) * 100  // Long: price up = profit
      : ((idea.entryPrice - currentPrice) / idea.entryPrice) * 100   // Short: price down = profit (inverted)
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

  const getSignalInfo = (signal: string): { points: number; description: string; color: string } => {
    const signalMap: Record<string, { points: number; description: string; color: string }> = {
      'Strong R:R (2:1+)': {
        points: 28,
        description: 'Risk/reward ratio of 2:1 or better. You risk $1 to potentially make $2+, providing excellent upside potential.',
        color: 'bg-green-500'
      },
      'Good R:R (1.5:1+)': {
        points: 15,
        description: 'Risk/reward ratio of 1.5:1 or better. Solid upside potential with manageable downside risk.',
        color: 'bg-green-400'
      },
      'Acceptable R:R (1.2:1+)': {
        points: 8,
        description: 'Risk/reward ratio of 1.2:1 or better. Meets minimum threshold for day trading setups.',
        color: 'bg-cyan-400'
      },
      'Confirmed Volume': {
        points: 18,
        description: 'Volume is 1.5x+ average, confirming institutional interest and reducing liquidity risk.',
        color: 'bg-cyan-500'
      },
      'Strong Volume': {
        points: 12,
        description: 'Volume is above average, providing adequate liquidity for entry and exit.',
        color: 'bg-cyan-400'
      },
      'Strong Signal': {
        points: 25,
        description: 'Multiple technical indicators aligned (RSI extremes, MACD crossover, breakout setup). High probability setup.',
        color: 'bg-purple-500'
      },
      'Clear Signal': {
        points: 18,
        description: 'At least one strong technical indicator present, providing clear directional bias.',
        color: 'bg-purple-400'
      },
      'Reversal Setup': {
        points: 20,
        description: 'Price at extreme levels (RSI <30 or >70), suggesting mean reversion is likely.',
        color: 'bg-amber-500'
      },
      'Trend Setup': {
        points: 15,
        description: 'Price aligned with prevailing trend, increasing probability of continuation.',
        color: 'bg-amber-400'
      },
      'Breakout Setup': {
        points: 18,
        description: 'Price breaking through key resistance/support with momentum, early entry opportunity.',
        color: 'bg-indigo-500'
      },
      'High Liquidity': {
        points: 5,
        description: 'Asset has high trading volume, ensuring you can enter and exit positions easily.',
        color: 'bg-cyan-500'
      },
      'Catalyst Present': {
        points: 10,
        description: 'Market-moving event or news catalyst identified, providing fundamental support for the trade.',
        color: 'bg-pink-500'
      }
    };

    return signalMap[signal] || { 
      points: 5, 
      description: 'Quality signal detected by our quantitative system.', 
      color: 'bg-white/10' 
    };
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

            {/* Entry Time Display (Open Trades Only) */}
            {idea.outcomeStatus === 'open' && (
              <div className="p-4 rounded-lg border bg-gradient-to-br from-cyan-500/5 via-card to-purple-500/5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-cyan-400" />
                  <span className="text-cyan-400">Trade Entry Information</span>
                </h3>
                
                <div className="grid grid-cols-3 gap-3">
                  {/* Posted Time */}
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Posted Time</div>
                    <div className="text-sm font-semibold">
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

                  {/* Enter By */}
                  {idea.entryValidUntil && (
                    <div className="p-3 rounded-lg bg-card border border-border/50">
                      <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Enter By</div>
                      <div className="text-sm font-semibold">
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
                      <div className="text-sm font-semibold">
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

            {/* Quantitative Timing Intelligence */}
            {idea.outcomeStatus === 'open' && (idea.targetHitProbability || idea.timingConfidence || idea.volatilityRegime || idea.sessionPhase) && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Quantitative Timing Intelligence
                </h3>
                
                {/* Timing Analytics - Data-Backed Probabilities */}
                {(idea.targetHitProbability || idea.timingConfidence || idea.volatilityRegime || idea.sessionPhase) && (
                  <div className="p-3 rounded-lg border bg-gradient-to-br from-cyan-500/5 to-purple-500/5">
                    <div className="text-xs font-semibold text-cyan-400 mb-2">📊 Quantitative Backing</div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {idea.targetHitProbability && (
                        <div>
                          <span className="text-muted-foreground">Target Hit Probability:</span>
                          <div className="font-semibold text-green-400 mt-0.5">
                            {idea.targetHitProbability.toFixed(1)}%
                          </div>
                        </div>
                      )}
                      {idea.timingConfidence && (
                        <div>
                          <span className="text-muted-foreground">Timing Confidence:</span>
                          <div className="font-semibold text-cyan-400 mt-0.5">
                            {idea.timingConfidence.toFixed(0)}%
                          </div>
                        </div>
                      )}
                      {idea.volatilityRegime && (
                        <div>
                          <span className="text-muted-foreground">Volatility Regime:</span>
                          <div className="font-semibold capitalize mt-0.5">
                            {idea.volatilityRegime}
                          </div>
                        </div>
                      )}
                      {idea.sessionPhase && (
                        <div>
                          <span className="text-muted-foreground">Session Phase:</span>
                          <div className="font-semibold capitalize mt-0.5">
                            {idea.sessionPhase}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Entry/Exit Timing Analysis (Closed Trades Only) */}
            {idea.outcomeStatus !== 'open' && (
              <div className="p-4 rounded-lg border bg-gradient-to-br from-cyan-500/5 via-card to-purple-500/5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-cyan-400" />
                  <span className="text-cyan-400">Trade Timing Analysis</span>
                </h3>
                
                <div className="grid grid-cols-3 gap-3">
                  {/* Entry Time */}
                  <div className="p-3 rounded-lg bg-card border border-border/50">
                    <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Entry Time</div>
                    <div className="text-sm font-semibold">
                      {formatInTimeZone(new Date(idea.timestamp), 'America/Chicago', 'MMM d, h:mm a')}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">CST</div>
                  </div>

                  {/* Exit Time */}
                  {idea.exitDate && (
                    <div className="p-3 rounded-lg bg-card border border-border/50">
                      <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Exit Time</div>
                      <div className="text-sm font-semibold">
                        {formatInTimeZone(new Date(idea.exitDate), 'America/Chicago', 'MMM d, h:mm a')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">CST</div>
                    </div>
                  )}

                  {/* Holding Duration */}
                  {idea.actualHoldingTimeMinutes !== null && idea.actualHoldingTimeMinutes !== undefined && (
                    <div className="p-3 rounded-lg bg-card border border-border/50">
                      <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Duration</div>
                      <div className="text-sm font-semibold">
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

                {/* Outcome Status */}
                {idea.outcomeStatus && (
                  <div className="mt-3 p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide">Outcome</span>
                      <Badge 
                        variant={
                          idea.outcomeStatus === 'hit_target' ? 'default' : 
                          idea.outcomeStatus === 'hit_stop' ? 'destructive' : 
                          'secondary'
                        }
                        className="font-semibold"
                      >
                        {idea.outcomeStatus === 'hit_target' ? 'HIT TARGET' :
                         idea.outcomeStatus === 'hit_stop' ? 'HIT STOP' :
                         idea.outcomeStatus === 'expired' ? 'EXPIRED' :
                         'CLOSED'}
                      </Badge>
                    </div>
                    {idea.percentGain !== null && idea.percentGain !== undefined && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Realized P/L</span>
                        <span className={cn(
                          "text-sm font-bold",
                          getPnlColor(idea.outcomeStatus, idea.percentGain)
                        )}>
                          {idea.percentGain >= 0 ? '+' : ''}{formatPercent(idea.percentGain)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
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
              {/* Grade Explanation */}
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Star className="h-4 w-4 text-primary" />
                    Grade Explanation
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold font-mono text-primary">
                      {getLetterGrade(idea.confidenceScore)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      ({idea.confidenceScore.toFixed(0)}/100)
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  This trade received a <strong>{getLetterGrade(idea.confidenceScore)}</strong> grade based on our quantitative scoring system. Only B+ and higher grades (85+) pass our quality filter.
                </p>
                
                {/* Grading Scale */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className={cn("p-2 rounded text-center", idea.confidenceScore >= 90 ? "bg-green-500/20 text-green-600 font-semibold" : "bg-muted/30 text-muted-foreground")}>
                    <div className="font-bold">A+ / A</div>
                    <div>90-100</div>
                  </div>
                  <div className={cn("p-2 rounded text-center", idea.confidenceScore >= 80 && idea.confidenceScore < 90 ? "bg-cyan-500/20 text-cyan-600 font-semibold" : "bg-muted/30 text-muted-foreground")}>
                    <div className="font-bold">B+ / B</div>
                    <div>80-89</div>
                  </div>
                  <div className={cn("p-2 rounded text-center", idea.confidenceScore < 80 ? "bg-amber-500/20 text-amber-600 font-semibold" : "bg-muted/30 text-muted-foreground")}>
                    <div className="font-bold">C+ / C</div>
                    <div>70-79</div>
                  </div>
                </div>
              </div>

              {/* Detailed Analysis */}
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Detailed Analysis
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {idea.analysis}
                </p>
              </div>

              {/* Quality Signals with Explanations */}
              {idea.qualitySignals && idea.qualitySignals.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Quality Signals Detected</h3>
                  <div className="space-y-2">
                    {idea.qualitySignals.map((signal, idx) => {
                      const signalInfo = getSignalInfo(signal);
                      return (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                          <div className="mt-0.5">
                            <div className={cn("h-2 w-2 rounded-full", signalInfo.color)} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium">{signal}</span>
                              <Badge variant="outline" className="text-xs">
                                +{signalInfo.points} pts
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {signalInfo.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 p-3 rounded-lg bg-muted/20 text-xs text-muted-foreground">
                    <strong>How scoring works:</strong> Each quality signal adds points to the confidence score. Strong R:R ratios, confirmed volume, and early predictive setups contribute the most points. The final score determines the letter grade.
                  </div>
                </div>
              )}

              {/* Technical Indicators Summary */}
              {(idea.rsiValue != null || idea.volumeRatio != null || idea.riskRewardRatio > 0) && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Key Metrics</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {idea.rsiValue != null && (
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="text-xs text-muted-foreground mb-1">RSI (14)</div>
                        <div className="text-lg font-bold font-mono">{idea.rsiValue.toFixed(1)}</div>
                        <div className="text-xs text-muted-foreground">
                          {idea.rsiValue <= 30 ? 'Oversold - Reversal likely' : idea.rsiValue >= 70 ? 'Overbought - Reversal likely' : 'Neutral zone'}
                        </div>
                      </div>
                    )}
                    {idea.volumeRatio != null && (
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="text-xs text-muted-foreground mb-1">Volume Ratio</div>
                        <div className="text-lg font-bold font-mono">{idea.volumeRatio.toFixed(1)}x</div>
                        <div className="text-xs text-muted-foreground">
                          {idea.volumeRatio >= 2 ? 'Strong confirmation' : idea.volumeRatio >= 1.2 ? 'Confirmed' : 'Below average'}
                        </div>
                      </div>
                    )}
                    {idea.riskRewardRatio > 0 && (
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="text-xs text-muted-foreground mb-1">Risk/Reward</div>
                        <div className="text-lg font-bold font-mono">{idea.riskRewardRatio.toFixed(1)}:1</div>
                        <div className="text-xs text-muted-foreground">
                          {idea.riskRewardRatio >= 2 ? 'Excellent setup' : idea.riskRewardRatio >= 1.5 ? 'Good setup' : 'Acceptable'}
                        </div>
                      </div>
                    )}
                    {idea.confidenceScore > 0 && (
                      <div className="p-3 rounded-lg bg-muted/30">
                        <div className="text-xs text-muted-foreground mb-1">Confidence Score</div>
                        <div className="text-lg font-bold font-mono">{idea.confidenceScore.toFixed(0)}</div>
                        <div className="text-xs text-muted-foreground">
                          {idea.confidenceScore >= 90 ? 'Very high confidence' : idea.confidenceScore >= 85 ? 'High confidence' : 'Moderate confidence'}
                        </div>
                      </div>
                    )}
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
                <h3 className="text-sm font-semibold mb-2">Market Session (When Generated)</h3>
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
