import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatPercent, formatCTTime, cn, calculateDynamicSignal, type TradeSignal } from "@/lib/utils";
import { formatDateOnly } from "@/lib/timezone";
import type { TradeIdea } from "@shared/schema";
import { AlertTriangle, TrendingUp, TrendingDown, Target, Shield, DollarSign, Info, Star, ExternalLink, Bot, BarChart3, Sparkles, Newspaper, Activity, Clock, Zap } from "lucide-react";
import { CompactAnalysisBadges, MultiDimensionalAnalysis } from "./multi-dimensional-analysis";

function getDteCategory(expiryDate: string | null | undefined): { label: string; color: string } | null {
  if (!expiryDate) return null;
  
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return { label: '0DTE', color: 'bg-red-500/20 text-red-300 border-red-500/40' };
  if (diffDays <= 2) return { label: '1-2 DTE', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' };
  if (diffDays <= 7) return { label: '3-7 DTE', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
  if (diffDays <= 30) return { label: 'MONTHLY', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' };
  return { label: 'LEAPS', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
}

interface TradeIdeaCardProps {
  idea: TradeIdea;
  currentPrice?: number;
  changePercent?: number;
  onViewDetails?: () => void;
  onAddToWatchlist?: () => void;
}

export function TradeIdeaCard({ idea, currentPrice, changePercent, onViewDetails, onAddToWatchlist }: TradeIdeaCardProps) {
  const isLong = idea.direction === 'long';
  
  // Calculate percentages respecting trade direction
  // For LONG: target above entry = positive, stop below = negative
  // For SHORT: target below entry = positive (shown as gain), stop above = negative (shown as risk)
  const stopLossPercent = isLong
    ? ((idea.stopLoss - idea.entryPrice) / idea.entryPrice) * 100  // Long: stop below entry = negative
    : ((idea.entryPrice - idea.stopLoss) / idea.entryPrice) * 100; // Short: stop above entry = negative (inverted)
  
  const targetPercent = isLong
    ? ((idea.targetPrice - idea.entryPrice) / idea.entryPrice) * 100  // Long: target above entry = positive
    : ((idea.entryPrice - idea.targetPrice) / idea.entryPrice) * 100; // Short: target below entry = positive (inverted)
  
  const riskDollars = Math.abs(idea.stopLoss - idea.entryPrice);
  const rewardDollars = Math.abs(idea.targetPrice - idea.entryPrice);

  // Check if idea is fresh (from today)
  const ideaDate = new Date(idea.timestamp);
  const today = new Date();
  const isToday = ideaDate.toDateString() === today.toDateString();
  const isRecent = (today.getTime() - ideaDate.getTime()) < 24 * 60 * 60 * 1000; // Within 24 hours

  // Check if this is a draft trade (treat missing status as 'published' for backward compatibility)
  const isDraft = idea.status === 'draft';

  // Calculate dynamic signal if current price is available
  const dynamicSignal: TradeSignal | null = currentPrice
    ? calculateDynamicSignal(currentPrice, idea.entryPrice, idea.targetPrice, idea.stopLoss, idea.direction as 'long' | 'short')
    : null;

  return (
    <Card 
      className={cn(
        "hover-elevate transition-all",
        isDraft && "border-muted/50 bg-muted/20"
      )} 
      data-testid={`card-trade-idea-${idea.symbol}`}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xl font-bold font-mono" data-testid={`text-trade-symbol-${idea.symbol}`}>
                {idea.symbol}
              </CardTitle>
              {isDraft && (
                <Badge variant="secondary" className="bg-muted text-muted-foreground font-semibold text-xs" data-testid={`badge-draft-${idea.symbol}`}>
                  DRAFT
                </Badge>
              )}
              {isRecent && (
                <Badge variant="default" className="bg-primary text-primary-foreground font-bold text-xs animate-pulse" data-testid={`badge-fresh-${idea.symbol}`}>
                  FRESH
                </Badge>
              )}
              {idea.source && (
                <Badge 
                  variant="outline"
                  className={cn(
                    "text-xs font-semibold gap-1 border-2",
                    idea.source === 'ai' 
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50" 
                      : idea.source === 'hybrid'
                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/50"
                      : idea.source === 'news'
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50"
                      : idea.source === 'flow'
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50"
                      : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/50"
                  )}
                  data-testid={`badge-source-${idea.symbol}`}
                >
                  {idea.source === 'ai' ? (
                    <>
                      <Bot className="h-3 w-3" />
                      AI ENGINE
                    </>
                  ) : idea.source === 'hybrid' ? (
                    <>
                      <Sparkles className="h-3 w-3" />
                      HYBRID
                    </>
                  ) : idea.source === 'news' ? (
                    <>
                      <Newspaper className="h-3 w-3" />
                      NEWS
                    </>
                  ) : idea.source === 'flow' ? (
                    <>
                      <Activity className="h-3 w-3" />
                      FLOW SCANNER
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-3 w-3" />
                      QUANT ENGINE
                    </>
                  )}
                </Badge>
              )}
              <Badge variant={isLong ? "default" : "destructive"} className="font-semibold" data-testid={`badge-direction-${idea.symbol}`}>
                {isLong ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {idea.direction.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-xs font-semibold uppercase">
                {idea.assetType === 'option' ? 'Option' : 
                 idea.assetType === 'stock' ? 'Stock' : 
                 idea.assetType === 'penny_stock' ? 'Penny Stock' :
                 idea.assetType === 'future' ? 'Future' :
                 'Crypto'}
              </Badge>
              {idea.assetType === 'option' && idea.strikePrice && idea.optionType && (
                <Badge variant="secondary" className={cn(
                  "text-xs font-semibold gap-1",
                  idea.optionType === 'call' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                )} data-testid={`badge-strike-${idea.symbol}`}>
                  ${idea.strikePrice} {idea.optionType.toUpperCase()}
                  {idea.expiryDate && ` | ${formatDateOnly(idea.expiryDate)}`}
                </Badge>
              )}
              {idea.assetType === 'option' && idea.expiryDate && (() => {
                const dteInfo = getDteCategory(idea.expiryDate);
                return dteInfo ? (
                  <Badge variant="outline" className={cn("text-xs font-bold gap-1", dteInfo.color)} data-testid={`badge-dte-${idea.symbol}`}>
                    <Clock className="h-3 w-3" />
                    {dteInfo.label}
                  </Badge>
                ) : null;
              })()}
              {idea.isLottoPlay && (
                <Badge variant="outline" className="text-xs font-bold gap-1 bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40 animate-pulse" data-testid={`badge-lotto-${idea.symbol}`}>
                  <Zap className="h-3 w-3" />
                  LOTTO
                </Badge>
              )}
              {idea.assetType === 'future' && idea.futuresContractCode && (
                <Badge variant="secondary" className="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/50 text-xs font-semibold gap-1" data-testid={`text-futures-contract-${idea.futuresContractCode}`}>
                  <BarChart3 className="h-3 w-3" />
                  {idea.futuresContractCode}
                </Badge>
              )}
            </div>
            <CardDescription className="mt-2 text-xs flex items-center gap-2 flex-wrap" data-testid={`text-trade-time-${idea.symbol}`}>
              <span>Posted: {formatCTTime(idea.timestamp)} • {idea.sessionContext}</span>
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs font-semibold",
                  idea.holdingPeriod === 'day' && "bg-amber-500/10 text-amber-300 border-amber-500/30",
                  idea.holdingPeriod === 'swing' && "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
                  idea.holdingPeriod === 'position' && "bg-purple-500/10 text-purple-300 border-purple-500/30"
                )}
                data-testid={`badge-holding-period-${idea.symbol}`}
              >
                {idea.holdingPeriod === 'day' ? 'DAY TRADE' : 
                 idea.holdingPeriod === 'swing' ? 'SWING' : 
                 'POSITION'}
              </Badge>
            </CardDescription>
            {idea.liquidityWarning && (
              <Badge variant="destructive" className="gap-1 mt-2">
                <AlertTriangle className="h-3 w-3" />
                Low Liquidity
              </Badge>
            )}
          </div>
          
          {currentPrice !== undefined && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">Current Price</div>
              <div className="text-2xl font-bold font-mono" data-testid={`text-current-price-${idea.symbol}`}>
                {formatCurrency(currentPrice)}
              </div>
              {changePercent !== undefined && (
                <div className={`text-sm font-semibold font-mono ${changePercent >= 0 ? 'text-bullish' : 'text-bearish'}`}>
                  {changePercent >= 0 ? '+' : ''}{formatPercent(changePercent)}
                </div>
              )}
            </div>
          )}
        </div>

        {dynamicSignal && (
          <div 
            className={cn(
              "rounded-lg p-3 border-2 transition-all",
              dynamicSignal.color === 'green' && "bg-green-500/10 border-green-500/50",
              dynamicSignal.color === 'blue' && "bg-cyan-500/10 border-cyan-500/50",
              dynamicSignal.color === 'yellow' && "bg-amber-500/10 border-amber-500/50",
              dynamicSignal.color === 'red' && "bg-red-500/10 border-red-500/50",
              dynamicSignal.color === 'purple' && "bg-purple-500/10 border-purple-500/50",
              dynamicSignal.color === 'gray' && "bg-muted/20 border-muted"
            )}
            data-testid={`signal-${idea.symbol}`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "font-bold text-xs",
                      dynamicSignal.color === 'green' && "bg-green-500/20 text-green-300 border-green-500/30",
                      dynamicSignal.color === 'blue' && "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
                      dynamicSignal.color === 'yellow' && "bg-amber-500/20 text-amber-300 border-amber-500/30",
                      dynamicSignal.color === 'red' && "bg-red-500/20 text-red-300 border-red-500/30",
                      dynamicSignal.color === 'purple' && "bg-purple-500/20 text-purple-300 border-purple-500/30",
                      dynamicSignal.color === 'gray' && "bg-muted/30 text-muted-foreground border-muted"
                    )}
                    data-testid={`badge-signal-status-${idea.symbol}`}
                  >
                    {dynamicSignal.status}
                  </Badge>
                  <Badge 
                    variant="secondary"
                    className="font-semibold text-xs"
                    data-testid={`badge-signal-action-${idea.symbol}`}
                  >
                    {dynamicSignal.action}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground" data-testid={`text-signal-message-${idea.symbol}`}>
                  {dynamicSignal.message}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Catalyst:</span>
          <span className="font-medium flex-1" data-testid={`text-catalyst-${idea.symbol}`}>{idea.catalyst}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-1 text-muted-foreground hover:text-primary"
            onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(idea.symbol + ' ' + idea.catalyst)}`, '_blank')}
            data-testid={`button-catalyst-search-${idea.symbol}`}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="bg-muted/20 rounded-lg p-4 border border-muted">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase font-semibold">
                <DollarSign className="h-3 w-3" />
                <span>Entry Price</span>
              </div>
              <div className="text-xl font-bold font-mono" data-testid={`text-entry-${idea.symbol}`}>
                {formatCurrency(idea.entryPrice)}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase font-semibold">
                <Target className="h-3 w-3" />
                <span>Target</span>
              </div>
              <div className="space-y-0.5">
                <div className="text-xl font-bold font-mono text-bullish" data-testid={`text-target-${idea.symbol}`}>
                  {formatCurrency(idea.targetPrice)}
                </div>
                <div className="text-sm font-mono text-bullish font-semibold">
                  {formatPercent(targetPercent)} gain
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase font-semibold">
                <Shield className="h-3 w-3" />
                <span>Stop Loss</span>
              </div>
              <div className="space-y-0.5">
                <div className="text-xl font-bold font-mono text-bearish" data-testid={`text-stoploss-${idea.symbol}`}>
                  {formatCurrency(idea.stopLoss)}
                </div>
                <div className="text-sm font-mono text-bearish font-semibold">
                  {formatPercent(stopLossPercent)} risk
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-muted">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Risk per share:</span>
                <span className="font-mono font-bold text-bearish">{formatCurrency(riskDollars)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Reward per share:</span>
                <span className="font-mono font-bold text-bullish">{formatCurrency(rewardDollars)}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {idea.assetType === 'future' && (
          <div className="bg-cyan-500/10 rounded-lg p-4 border border-cyan-500/30">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase font-semibold">Contract Specs</div>
                <div className="space-y-1">
                  {idea.futuresMultiplier && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Multiplier:</span>
                      <span className="font-mono font-bold">${idea.futuresMultiplier}/point</span>
                    </div>
                  )}
                  {idea.futuresTickSize && idea.futuresMultiplier && (
                    <div className="flex items-center justify-between text-sm" data-testid={`text-futures-tick-${idea.symbol}`}>
                      <span className="text-muted-foreground">Tick:</span>
                      <span className="font-mono font-bold">{idea.futuresTickSize} = ${(idea.futuresTickSize * idea.futuresMultiplier).toFixed(0)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase font-semibold">Margin</div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm" data-testid={`text-futures-margin-${idea.id}`}>
                    <span className="text-muted-foreground">Initial:</span>
                    <span className="font-mono font-bold">
                      {idea.futuresInitialMargin 
                        ? `$${idea.futuresInitialMargin.toLocaleString()}` 
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 cursor-help">
                  <Badge 
                    variant={(idea.riskRewardRatio ?? 0) >= 2 ? "default" : "secondary"} 
                    className={cn(
                      "text-base font-bold py-1.5 px-3",
                      (idea.riskRewardRatio ?? 0) >= 2 && "bg-bullish hover:bg-bullish"
                    )}
                    data-testid={`badge-risk-reward-${idea.symbol}`}
                  >
                    {idea.riskRewardRatio?.toFixed(2) ?? '0.00'}:1 R:R
                  </Badge>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-semibold mb-1">Risk/Reward Ratio Explained</p>
                <p className="text-xs">For every <strong>${riskDollars.toFixed(2)}</strong> you risk, you could gain <strong>${rewardDollars.toFixed(2)}</strong></p>
                <p className="text-xs mt-1">Higher ratios (2:1 or better) offer better risk-adjusted returns</p>
              </TooltipContent>
            </Tooltip>
            {idea.expiryDate && (
              <div className="space-y-1 text-right">
                <div className="text-xs text-muted-foreground">Expiry</div>
                <div className="text-sm font-mono font-medium">{formatDateOnly(idea.expiryDate)}</div>
              </div>
            )}
          </div>
          
          <div className="bg-muted/30 rounded-md p-3 border border-muted">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-muted-foreground">Potential Gain: </span>
                <span className="text-bullish font-semibold">{formatPercent(targetPercent)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Max Risk: </span>
                <span className="text-bearish font-semibold">{formatPercent(Math.abs(stopLossPercent))}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Analysis</div>
          <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-analysis-${idea.symbol}`}>
            {idea.analysis}
          </p>
        </div>

        <Separator />

        <MultiDimensionalAnalysis
          symbol={idea.symbol}
          assetType={idea.assetType}
          direction={idea.direction as 'long' | 'short'}
          quantScore={Math.round(idea.confidenceScore ?? 50)}
          aiScore={idea.source === 'ai' ? Math.round((idea.confidenceScore ?? 50) + 10) : Math.round((idea.confidenceScore ?? 50) - 5)}
          mlScore={Math.round(idea.targetHitProbability ?? idea.confidenceScore ?? 50)}
          historicalWinRate={Math.round(idea.confidenceScore ?? 50)}
          fundamentalScore={50}
          rsi={idea.rsiValue ?? 50}
          macdHistogram={idea.macdHistogram ?? 0}
          trendStrength={idea.trendStrength ?? 50}
          volumeRatio={idea.volumeRatio ?? 1}
          targetHitProbability={idea.targetHitProbability ?? 50}
          compact={true}
          showTiming={true}
        />

        <div className="flex gap-2">
          <Button 
            onClick={onViewDetails} 
            className="flex-1"
            data-testid={`button-view-details-${idea.symbol}`}
          >
            View Full Analysis
          </Button>
          <Button
            onClick={onAddToWatchlist}
            variant="outline"
            size="icon"
            data-testid={`button-watchlist-${idea.symbol}`}
          >
            <Star className="h-4 w-4" />
          </Button>
        </div>

        <div className="bg-muted/50 rounded-md p-3 border border-muted-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Educational Research Only:</strong> This is not financial advice. 
            Research briefs are for educational purposes only. Consider liquidity, volatility, and your own risk tolerance. 
            Never risk more than you can afford to lose.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}