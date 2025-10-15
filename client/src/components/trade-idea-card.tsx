import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatPercent, formatCTTime, cn } from "@/lib/utils";
import type { TradeIdea } from "@shared/schema";
import { AlertTriangle, TrendingUp, TrendingDown, Target, Shield, DollarSign, Info, Star, ExternalLink } from "lucide-react";

interface TradeIdeaCardProps {
  idea: TradeIdea;
  currentPrice?: number;
  changePercent?: number;
  onViewDetails?: () => void;
  onAddToWatchlist?: () => void;
}

export function TradeIdeaCard({ idea, currentPrice, changePercent, onViewDetails, onAddToWatchlist }: TradeIdeaCardProps) {
  const isLong = idea.direction === 'long';
  const stopLossPercent = ((idea.stopLoss - idea.entryPrice) / idea.entryPrice) * 100;
  const targetPercent = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice) * 100;
  
  const riskDollars = Math.abs(idea.stopLoss - idea.entryPrice);
  const rewardDollars = Math.abs(idea.targetPrice - idea.entryPrice);

  // Check if idea is fresh (from today)
  const ideaDate = new Date(idea.timestamp);
  const today = new Date();
  const isToday = ideaDate.toDateString() === today.toDateString();
  const isRecent = (today.getTime() - ideaDate.getTime()) < 24 * 60 * 60 * 1000; // Within 24 hours

  return (
    <Card className="hover-elevate transition-all" data-testid={`card-trade-idea-${idea.symbol}`}>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xl font-bold font-mono" data-testid={`text-trade-symbol-${idea.symbol}`}>
                {idea.symbol}
              </CardTitle>
              {isRecent && (
                <Badge variant="default" className="bg-primary text-primary-foreground font-bold text-xs animate-pulse" data-testid={`badge-fresh-${idea.symbol}`}>
                  FRESH
                </Badge>
              )}
              <Badge variant={isLong ? "default" : "destructive"} className="font-semibold" data-testid={`badge-direction-${idea.symbol}`}>
                {isLong ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {idea.direction.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-xs font-semibold">
                {idea.assetType === 'option' ? 'STOCK OPTIONS' : 
                 idea.assetType === 'stock' ? 'STOCK SHARES' : 
                 'CRYPTO'}
              </Badge>
            </div>
            <CardDescription className="mt-2 text-xs" data-testid={`text-trade-time-${idea.symbol}`}>
              Posted: {formatCTTime(idea.timestamp)} • {idea.sessionContext}
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

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 cursor-help">
                  <Badge 
                    variant={idea.riskRewardRatio >= 2 ? "default" : "secondary"} 
                    className={cn(
                      "text-base font-bold py-1.5 px-3",
                      idea.riskRewardRatio >= 2 && "bg-bullish hover:bg-bullish"
                    )}
                    data-testid={`badge-risk-reward-${idea.symbol}`}
                  >
                    {idea.riskRewardRatio.toFixed(2)}:1 R:R
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
                <div className="text-sm font-mono font-medium">{idea.expiryDate}</div>
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
            Trade ideas are for research and educational purposes. Consider liquidity, volatility, and your own risk tolerance. 
            Never risk more than you can afford to lose.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}