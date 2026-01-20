/**
 * Trade Heatmap - Dense visual grid of all trades color-coded by performance
 *
 * Provides at-a-glance view of portfolio performance with:
 * - Color intensity based on P/L magnitude
 * - Symbol, direction, and P/L% in compact format
 * - Click to expand full trade details
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { TradeIdea } from "@shared/schema";

interface TradeHeatmapProps {
  trades: TradeIdea[];
  priceMap: Record<string, number>;
  onTradeClick?: (tradeId: string) => void;
}

export function TradeHeatmap({ trades, priceMap, onTradeClick }: TradeHeatmapProps) {
  const [selectedTrade, setSelectedTrade] = useState<TradeIdea | null>(null);

  // Calculate P/L for each trade
  const tradesWithPL = trades
    .filter(t => t.outcomeStatus === 'open')
    .map(trade => {
      const currentPrice = trade.assetType === 'option' ? undefined : priceMap[trade.symbol];
      const isLong = trade.direction === 'long';

      const priceChangePercent = currentPrice
        ? isLong
          ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
          : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100
        : 0;

      return {
        ...trade,
        currentPrice,
        plPercent: priceChangePercent
      };
    })
    .sort((a, b) => Math.abs(b.plPercent) - Math.abs(a.plPercent)); // Sort by magnitude

  // Get color based on P/L
  const getPLColor = (plPercent: number) => {
    if (plPercent >= 10) return 'bg-green-600/80 border-green-500 text-white';
    if (plPercent >= 5) return 'bg-green-500/60 border-green-400 text-white';
    if (plPercent >= 2) return 'bg-green-500/40 border-green-400/60 text-green-50';
    if (plPercent >= 0) return 'bg-green-500/20 border-green-400/40 text-green-100';
    if (plPercent >= -2) return 'bg-red-500/20 border-red-400/40 text-red-100';
    if (plPercent >= -5) return 'bg-red-500/40 border-red-400/60 text-red-50';
    if (plPercent >= -10) return 'bg-red-500/60 border-red-400 text-white';
    return 'bg-red-600/80 border-red-500 text-white';
  };

  // Get trend icon
  const getTrendIcon = (plPercent: number) => {
    if (plPercent >= 2) return TrendingUp;
    if (plPercent <= -2) return TrendingDown;
    return Minus;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Performance Heatmap</h3>
          <Badge variant="outline" className="text-xs">
            {tradesWithPL.length} Active
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500/60 border border-green-400" />
            Winning
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500/60 border border-red-400" />
            Losing
          </span>
        </div>
      </div>

      {/* Heatmap Grid */}
      {tradesWithPL.length === 0 ? (
        <div className="p-8 text-center border rounded-lg bg-muted/20">
          <p className="text-sm text-muted-foreground">No active trades with live prices</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {tradesWithPL.map(trade => {
            const TrendIcon = getTrendIcon(trade.plPercent);
            const hasPrice = trade.currentPrice !== undefined;

            return (
              <Tooltip key={trade.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setSelectedTrade(trade);
                      if (onTradeClick) onTradeClick(trade.id);
                    }}
                    className={cn(
                      "relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:scale-105 hover:shadow-lg cursor-pointer",
                      hasPrice ? getPLColor(trade.plPercent) : "bg-muted/30 border-muted text-muted-foreground"
                    )}
                    data-testid={`heatmap-${trade.symbol}`}
                  >
                    {/* Direction indicator */}
                    <div className="absolute top-1 right-1">
                      {trade.direction === 'long' ? (
                        <ArrowUpRight className="h-3 w-3 opacity-60" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 opacity-60" />
                      )}
                    </div>

                    {/* Symbol */}
                    <div className="font-mono font-bold text-sm mb-1">
                      {trade.symbol}
                    </div>

                    {/* P/L */}
                    {hasPrice ? (
                      <div className="flex items-center gap-0.5">
                        <TrendIcon className="h-3 w-3" />
                        <span className="font-mono font-bold text-xs">
                          {trade.plPercent >= 0 ? '+' : ''}{trade.plPercent.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs opacity-60">
                        No price
                      </div>
                    )}

                    {/* Asset type badge */}
                    {trade.assetType === 'option' && (
                      <Badge variant="outline" className="absolute bottom-1 left-1 text-[8px] h-4 px-1">
                        OPT
                      </Badge>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-1 text-xs">
                    <p className="font-bold">{trade.symbol} - {trade.direction.toUpperCase()}</p>
                    {hasPrice && (
                      <>
                        <p>Entry: ${trade.entryPrice.toFixed(2)}</p>
                        <p>Current: ${trade.currentPrice?.toFixed(2)}</p>
                        <p className={cn(
                          "font-bold",
                          trade.plPercent >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                          P/L: {trade.plPercent >= 0 ? '+' : ''}{trade.plPercent.toFixed(2)}%
                        </p>
                      </>
                    )}
                    <p className="text-muted-foreground">Click for details</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* Performance Summary */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/50">
        {(() => {
          const withPrices = tradesWithPL.filter(t => t.currentPrice !== undefined);
          const winners = withPrices.filter(t => t.plPercent > 0);
          const losers = withPrices.filter(t => t.plPercent < 0);
          const avgPL = withPrices.length > 0
            ? withPrices.reduce((sum, t) => sum + t.plPercent, 0) / withPrices.length
            : 0;

          return (
            <>
              <div className="text-center p-2 rounded-lg bg-green-500/10">
                <div className="text-xs text-muted-foreground mb-0.5">Winners</div>
                <div className="text-lg font-bold text-green-400">{winners.length}</div>
                <div className="text-[10px] text-muted-foreground">
                  {withPrices.length > 0 ? ((winners.length / withPrices.length) * 100).toFixed(0) : 0}%
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-red-500/10">
                <div className="text-xs text-muted-foreground mb-0.5">Losers</div>
                <div className="text-lg font-bold text-red-400">{losers.length}</div>
                <div className="text-[10px] text-muted-foreground">
                  {withPrices.length > 0 ? ((losers.length / withPrices.length) * 100).toFixed(0) : 0}%
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <div className="text-xs text-muted-foreground mb-0.5">Avg P/L</div>
                <div className={cn(
                  "text-lg font-bold font-mono",
                  avgPL >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {avgPL >= 0 ? '+' : ''}{avgPL.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {withPrices.length} priced
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* Detail Dialog (optional) */}
      <Dialog open={selectedTrade !== null} onOpenChange={(open) => !open && setSelectedTrade(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedTrade?.symbol} - {selectedTrade?.direction?.toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          {selectedTrade && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Entry Price</div>
                  <div className="font-mono font-bold">${selectedTrade.entryPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Current Price</div>
                  <div className="font-mono font-bold">
                    {selectedTrade.currentPrice ? `$${selectedTrade.currentPrice.toFixed(2)}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Target</div>
                  <div className="font-mono font-bold text-green-400">${selectedTrade.targetPrice.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Stop Loss</div>
                  <div className="font-mono font-bold text-red-400">${selectedTrade.stopLoss.toFixed(2)}</div>
                </div>
              </div>
              {selectedTrade.catalyst && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Catalyst</div>
                  <p className="text-sm">{selectedTrade.catalyst}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
