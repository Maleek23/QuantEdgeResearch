import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, formatCTTime } from "@/lib/utils";
import { ChevronDown, TrendingUp, TrendingDown, Star, Brain, Sparkles, AlertTriangle } from "lucide-react";
import type { TradeIdea, MarketData } from "@shared/schema";

interface TradeIdeaBlockProps {
  idea: TradeIdea;
  currentPrice?: number;
  onAddToWatchlist?: (idea: TradeIdea) => void;
}

export function TradeIdeaBlock({ idea, currentPrice, onAddToWatchlist }: TradeIdeaBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const isLong = idea.direction === 'long';
  const displayPrice = currentPrice ?? idea.entryPrice;
  
  // Calculate price change vs entry
  const priceChangePercent = currentPrice 
    ? ((currentPrice - idea.entryPrice) / idea.entryPrice) * 100
    : 0;

  // Determine probability color
  const probabilityColor = idea.probabilityBand === 'A' 
    ? 'text-green-400' 
    : idea.probabilityBand === 'B' 
      ? 'text-blue-400' 
      : 'text-muted-foreground';

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="group hover-elevate active-elevate-2"
    >
      <CollapsibleTrigger className="w-full" data-testid={`block-trade-idea-${idea.symbol}`}>
        <div className="flex items-center justify-between gap-4 p-4 border rounded-lg bg-card">
          {/* Left: Symbol, Price, Entry */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold font-mono" data-testid={`text-symbol-${idea.symbol}`}>
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
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {idea.assetType === 'option' ? 'OPTIONS' : idea.assetType === 'stock' ? 'SHARES' : 'CRYPTO'}
                </span>
                {idea.assetType === 'option' && idea.strikePrice && idea.optionType && (
                  <>
                    <Badge 
                      variant="secondary" 
                      className="text-xs font-semibold"
                      data-testid={`badge-strike-${idea.symbol}`}
                    >
                      ${idea.strikePrice}
                    </Badge>
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
            </div>

            {/* Price Info */}
            <div className="flex flex-col items-start min-w-0">
              <span className="text-xs text-muted-foreground">Current</span>
              <span className="text-xl font-bold font-mono" data-testid={`text-current-price-${idea.symbol}`}>
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

            <div className="flex flex-col items-start min-w-0">
              <span className="text-xs text-muted-foreground">Entry</span>
              <span className="text-lg font-semibold font-mono">
                {formatCurrency(idea.entryPrice)}
              </span>
            </div>
          </div>

          {/* Right: Badges & Expand Arrow */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Confidence Score */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-muted-foreground">Grade</span>
              <span className={cn(
                "text-2xl font-bold font-mono",
                idea.confidenceScore >= 80 ? "text-green-400" : idea.confidenceScore >= 70 ? "text-blue-400" : "text-amber-400"
              )} data-testid={`text-confidence-${idea.symbol}`}>
                {idea.confidenceScore}%
              </span>
            </div>

            {/* Source Badge */}
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

            {/* Expand Arrow */}
            <ChevronDown 
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-x border-b rounded-b-lg p-4 bg-card/50 space-y-4">
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

          {/* Catalyst */}
          <div>
            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Catalyst</h4>
            <p className="text-sm" data-testid={`text-catalyst-${idea.symbol}`}>
              {idea.catalyst}
            </p>
          </div>

          {/* Analysis */}
          <div>
            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Analysis</h4>
            <p className="text-sm text-muted-foreground" data-testid={`text-analysis-${idea.symbol}`}>
              {idea.analysis}
            </p>
          </div>

          {/* Session & Warnings */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {idea.sessionContext}
            </Badge>
            {(idea.sessionContext.includes('Regular Trading') || idea.sessionContext.includes('Pre-Market') || idea.sessionContext.includes('After Hours')) && (
              <Badge variant="outline" className="text-xs font-semibold bg-amber-500/10 text-amber-300 border-amber-500/30">
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

          {/* Action Button */}
          {onAddToWatchlist && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
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
      </CollapsibleContent>
    </Collapsible>
  );
}
