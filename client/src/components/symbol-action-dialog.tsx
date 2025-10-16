import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  Sparkles,
  Plus,
  Eye,
  AlertTriangle
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MarketData, InsertTradeIdea } from "@shared/schema";

interface SymbolActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketData: MarketData | null;
}

interface TradeRecommendation {
  type: 'stock_shares' | 'stock_options';
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  direction: 'long' | 'short' | 'neutral';
}

function getTradeRecommendation(data: MarketData): TradeRecommendation {
  const price = data.currentPrice;
  const changePercent = data.changePercent;
  const volume = data.volume;
  const avgVolume = data.avgVolume || volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

  // Strong momentum = options preferred
  const hasStrongMomentum = Math.abs(changePercent) > 3;
  const hasHighVolume = volumeRatio > 1.5;
  
  // Price considerations
  const isExpensive = price > 500; // High price stocks better for options
  const isPennyStock = price < 5; // Penny stocks avoid options

  // Direction analysis
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  if (changePercent > 2) direction = 'long';
  else if (changePercent < -2) direction = 'short';

  // Recommendation logic
  if (isPennyStock) {
    return {
      type: 'stock_shares',
      reason: 'Low-priced stocks typically lack liquid options markets. Stock shares recommended.',
      confidence: 'high',
      direction
    };
  }

  if (hasStrongMomentum && hasHighVolume && !isPennyStock) {
    return {
      type: 'stock_options',
      reason: 'Strong momentum with high volume - options provide leveraged exposure with defined risk.',
      confidence: 'high',
      direction
    };
  }

  if (isExpensive && hasStrongMomentum) {
    return {
      type: 'stock_options',
      reason: 'High stock price + momentum - options offer better capital efficiency.',
      confidence: 'high',
      direction
    };
  }

  if (Math.abs(changePercent) < 1.5 && volumeRatio < 1.2) {
    return {
      type: 'stock_shares',
      reason: 'Low volatility and volume - stock shares provide better risk/reward in stable conditions.',
      confidence: 'medium',
      direction
    };
  }

  // Default to options for moderate momentum
  return {
    type: 'stock_options',
    reason: 'Moderate momentum detected - options recommended for leveraged upside with controlled downside.',
    confidence: 'medium',
    direction
  };
}

export function SymbolActionDialog({ open, onOpenChange, marketData }: SymbolActionDialogProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<'stock_shares' | 'stock_options' | null>(null);

  const recommendation = marketData ? getTradeRecommendation(marketData) : null;

  const createIdeaMutation = useMutation({
    mutationFn: async (type: 'stock_shares' | 'stock_options') => {
      if (!marketData || !recommendation) return;

      const entryPrice = marketData.currentPrice;
      const isLong = recommendation.direction === 'long';
      const targetMultiplier = isLong ? 1.05 : 0.95; // 5% move
      const stopMultiplier = isLong ? 0.98 : 1.02; // 2% stop

      const targetPrice = entryPrice * targetMultiplier;
      const stopLoss = entryPrice * stopMultiplier;
      const riskRewardRatio = Math.abs((targetPrice - entryPrice) / (entryPrice - stopLoss));

      const idea: InsertTradeIdea = {
        symbol: marketData.symbol,
        assetType: type === 'stock_options' ? 'option' : 'stock',
        direction: recommendation.direction === 'neutral' ? 'long' : recommendation.direction,
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        targetPrice: parseFloat(targetPrice.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
        catalyst: `User-initiated idea from symbol search - ${recommendation.reason}`,
        analysis: `Based on current price action: ${marketData.changePercent >= 0 ? '+' : ''}${marketData.changePercent.toFixed(2)}% move with ${(marketData.volume / (marketData.avgVolume || marketData.volume)).toFixed(1)}x average volume. ${recommendation.reason}`,
        liquidityWarning: marketData.currentPrice < 5,
        sessionContext: marketData.session === 'rth' ? 'Regular Trading Hours' : 
                       marketData.session === 'pre-market' ? 'Pre-Market' : 'After Hours',
        timestamp: new Date().toISOString(),
        source: 'quant',
        confidenceScore: recommendation.confidence === 'high' ? 75 : 
                        recommendation.confidence === 'medium' ? 65 : 55,
        probabilityBand: recommendation.confidence === 'high' ? 'B' : 'C',
      };

      // Add options-specific fields
      if (type === 'stock_options') {
        const strikePrice = isLong ? entryPrice * 1.02 : entryPrice * 0.98;
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 14); // 2 weeks out

        idea.expiryDate = expiryDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
        idea.strikePrice = parseFloat(strikePrice.toFixed(2));
        idea.optionType = isLong ? 'call' : 'put';
      }

      const response = await apiRequest('POST', '/api/trade-ideas', idea);

      return { response, type };
    },
    onSuccess: (data) => {
      if (!data || !marketData) return;
      
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      
      const typeLabel = data.type === 'stock_options' ? 'Options' : 'Stock Shares';
      
      toast({
        title: "Trade Idea Created",
        description: `${marketData.symbol} ${typeLabel} idea added to NEW IDEAS tab`,
      });
      
      onOpenChange(false);
      setSelectedType(null);
    },
    onError: () => {
      toast({
        title: "Failed to Create Idea",
        description: "There was an error creating the trade idea. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateIdea = (type: 'stock_shares' | 'stock_options') => {
    setSelectedType(type);
    createIdeaMutation.mutate(type);
  };

  if (!marketData) return null;

  const isPositive = marketData.changePercent >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-symbol-action">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {marketData.symbol} - Quick Actions
          </DialogTitle>
          <DialogDescription>
            Review recommendations and add to your trading ideas
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Symbol Info Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-xl" data-testid="text-dialog-symbol">
                        {marketData.symbol}
                      </span>
                      <Badge variant="outline" data-testid="badge-dialog-asset-type">
                        {marketData.assetType}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Added to dashboard
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl font-bold" data-testid="text-dialog-price">
                    ${marketData.currentPrice.toLocaleString(undefined, { 
                      minimumFractionDigits: 2,
                      maximumFractionDigits: marketData.currentPrice >= 100 ? 2 : 4
                    })}
                  </div>
                  <div className={`text-sm font-medium flex items-center gap-1 justify-end ${isPositive ? 'text-green-500' : 'text-red-500'}`} data-testid="text-dialog-change">
                    {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {isPositive ? '+' : ''}{marketData.changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Recommendation Section */}
          {recommendation && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Recommended Trade Type</h3>
              </div>
              
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={recommendation.type === 'stock_options' ? 'default' : 'secondary'}
                            data-testid="badge-recommendation-type"
                          >
                            {recommendation.type === 'stock_options' ? 'Stock Options' : 'Stock Shares'}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={
                              recommendation.confidence === 'high' ? 'border-green-500 text-green-500' :
                              recommendation.confidence === 'medium' ? 'border-amber-500 text-amber-500' :
                              'border-red-500 text-red-500'
                            }
                            data-testid="badge-recommendation-confidence"
                          >
                            {recommendation.confidence} confidence
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid="text-recommendation-reason">
                          {recommendation.reason}
                        </p>
                      </div>
                    </div>

                    {recommendation.direction !== 'neutral' && (
                      <div className="flex items-center gap-2 text-xs" data-testid="text-recommendation-direction">
                        {recommendation.direction === 'long' ? (
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                        <span className="text-muted-foreground">
                          Suggested Direction: <span className="font-medium">{recommendation.direction.toUpperCase()}</span>
                        </span>
                      </div>
                    )}

                    {marketData.currentPrice < 5 && (
                      <div className="flex items-start gap-2 text-xs text-amber-500" data-testid="text-liquidity-warning">
                        <AlertTriangle className="h-3 w-3 mt-0.5" />
                        <span>Low liquidity warning: Penny stocks may have limited options markets</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setSelectedType(null);
            }}
            data-testid="button-cancel-action"
          >
            <Eye className="h-4 w-4 mr-2" />
            View Only
          </Button>
          
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => handleCreateIdea('stock_shares')}
              disabled={createIdeaMutation.isPending}
              data-testid="button-add-stock-shares"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              {selectedType === 'stock_shares' && createIdeaMutation.isPending ? 'Adding...' : 'Stock Shares'}
            </Button>
            
            <Button
              onClick={() => handleCreateIdea('stock_options')}
              disabled={createIdeaMutation.isPending}
              data-testid="button-add-stock-options"
            >
              <Plus className="h-4 w-4 mr-2" />
              {selectedType === 'stock_options' && createIdeaMutation.isPending ? 'Adding...' : 'Stock Options'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
