import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  Sparkles,
  Plus,
  Eye,
  AlertTriangle,
  Edit3,
  ArrowLeft,
  Star,
  Bell
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type: 'stock_shares' | 'stock_options' | 'crypto_shares';
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

  // Check if crypto - crypto doesn't have options
  const isCrypto = data.assetType === 'crypto';
  
  if (isCrypto) {
    const direction = changePercent > 2 ? 'long' : changePercent < -2 ? 'short' : 'neutral';
    const hasHighVolume = volumeRatio > 1.5;
    const hasStrongMomentum = Math.abs(changePercent) > 3;
    
    const confidence = (hasStrongMomentum && hasHighVolume) ? 'high' :
                       (hasStrongMomentum || hasHighVolume) ? 'medium' : 'low';
    
    return {
      type: 'crypto_shares',
      reason: hasStrongMomentum 
        ? `Strong ${changePercent > 0 ? 'upward' : 'downward'} momentum in crypto market - ${Math.abs(changePercent).toFixed(1)}% move with ${volumeRatio.toFixed(1)}x volume.`
        : 'Crypto shares recommended - 24/7 market access with defined risk.',
      confidence,
      direction
    };
  }

  // Strong momentum = options preferred
  const hasStrongMomentum = Math.abs(changePercent) > 3;
  const hasHighVolume = volumeRatio > 1.5;
  
  // Price considerations
  const isExpensive = price > 500; // High price stocks better for options
  const isPennyStock = price < 5; // Penny stocks avoid options

  // Direction analysis - for high-priced stocks, bias toward LONG unless significant drop
  let direction: 'long' | 'short' | 'neutral' = 'neutral';
  if (isExpensive) {
    // High-priced stocks: default to LONG unless major selloff
    direction = changePercent < -3 ? 'short' : 'long';
  } else if (changePercent > 2) {
    direction = 'long';
  } else if (changePercent < -2) {
    direction = 'short';
  }

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
  const [selectedType, setSelectedType] = useState<'stock_shares' | 'stock_options' | 'crypto_shares' | null>(null);
  const [isManualMode, setIsManualMode] = useState(false);
  
  // Manual entry form state
  const [manualDirection, setManualDirection] = useState<'long' | 'short'>('long');
  const [manualEntry, setManualEntry] = useState('');
  const [manualTarget, setManualTarget] = useState('');
  const [manualStop, setManualStop] = useState('');
  const [manualAssetType, setManualAssetType] = useState<'stock' | 'option' | 'crypto'>('stock');

  const recommendation = marketData ? getTradeRecommendation(marketData) : null;
  const isCrypto = marketData?.assetType === 'crypto';
  
  // Pre-fill manual entry with current price when dialog opens
  useEffect(() => {
    if (open && marketData && !manualEntry) {
      setManualEntry(marketData.currentPrice.toString());
      setManualAssetType(marketData.assetType as 'stock' | 'crypto');
    }
  }, [open, marketData, manualEntry]);
  
  // Reset form when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setIsManualMode(false);
      setManualDirection('long');
      setManualEntry('');
      setManualTarget('');
      setManualStop('');
      setManualAssetType('stock');
      setSelectedType(null);
    }
    onOpenChange(newOpen);
  };

  const createIdeaMutation = useMutation({
    mutationFn: async (type: 'stock_shares' | 'stock_options' | 'crypto_shares') => {
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
        assetType: type === 'stock_options' ? 'option' : 
                   type === 'crypto_shares' ? 'crypto' : 'stock',
        direction: recommendation.direction === 'neutral' ? 'long' : recommendation.direction,
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        targetPrice: parseFloat(targetPrice.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
        catalyst: `User-initiated idea from symbol search - ${recommendation.reason}`,
        analysis: `Based on current price action: ${marketData.changePercent >= 0 ? '+' : ''}${marketData.changePercent.toFixed(2)}% move with ${(marketData.volume / (marketData.avgVolume || marketData.volume)).toFixed(1)}x average volume. ${recommendation.reason}`,
        liquidityWarning: marketData.currentPrice < 5 && type !== 'crypto_shares',
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
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      
      const typeLabel = data.type === 'stock_options' ? 'Options' : 
                       data.type === 'crypto_shares' ? 'Crypto' : 'Stock Shares';
      
      toast({
        title: "Research Brief Created",
        description: `${marketData.symbol} ${typeLabel} brief added to NEW tab`,
      });
      
      onOpenChange(false);
      setSelectedType(null);
    },
    onError: () => {
      toast({
        title: "Failed to Create Brief",
        description: "There was an error creating the research brief. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateIdea = (type: 'stock_shares' | 'stock_options' | 'crypto_shares') => {
    setSelectedType(type);
    createIdeaMutation.mutate(type);
  };
  
  // Manual trade idea creation mutation
  // Add to Watchlist mutation
  const addToWatchlistMutation = useMutation({
    mutationFn: async () => {
      if (!marketData) return;
      
      const watchlistItem = {
        symbol: marketData.symbol,
        assetType: marketData.assetType,
        targetPrice: marketData.currentPrice * 1.10, // Default 10% above current
        notes: `Added from symbol search - Current: $${marketData.currentPrice.toFixed(2)}`,
        addedAt: new Date().toISOString(),
      };
      
      const response = await apiRequest('POST', '/api/watchlist', watchlistItem);
      return response;
    },
    onSuccess: () => {
      if (!marketData) return;
      
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      
      toast({
        title: "Added to Watchlist",
        description: `${marketData.symbol} is now being monitored. You'll be alerted of price movements.`,
      });
      
      handleOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add to Watchlist",
        description: error?.message || "This symbol may already be in your watchlist.",
        variant: "destructive",
      });
    },
  });
  
  const createManualIdeaMutation = useMutation({
    mutationFn: async () => {
      if (!marketData) return;
      
      const entryPrice = parseFloat(manualEntry);
      const targetPrice = parseFloat(manualTarget);
      const stopLoss = parseFloat(manualStop);
      
      // Validate numeric inputs
      if (isNaN(entryPrice) || isNaN(targetPrice) || isNaN(stopLoss)) {
        throw new Error("Please enter valid numbers for all price fields");
      }
      
      // Validate prices are positive
      if (entryPrice <= 0 || targetPrice <= 0 || stopLoss <= 0) {
        throw new Error("Prices must be greater than zero");
      }
      
      // Validate stop is different from entry (prevent division by zero)
      if (stopLoss === entryPrice) {
        throw new Error("Stop loss cannot equal entry price");
      }
      
      // Validate directional correctness
      if (manualDirection === 'long') {
        if (targetPrice <= entryPrice) {
          throw new Error("For LONG trades, target must be above entry price");
        }
        if (stopLoss >= entryPrice) {
          throw new Error("For LONG trades, stop loss must be below entry price");
        }
      } else {
        if (targetPrice >= entryPrice) {
          throw new Error("For SHORT trades, target must be below entry price");
        }
        if (stopLoss <= entryPrice) {
          throw new Error("For SHORT trades, stop loss must be above entry price");
        }
      }
      
      const riskRewardRatio = Math.abs((targetPrice - entryPrice) / (entryPrice - stopLoss));
      
      const idea: InsertTradeIdea = {
        symbol: marketData.symbol,
        assetType: manualAssetType,
        direction: manualDirection,
        entryPrice,
        targetPrice,
        stopLoss,
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
        catalyst: `Manual research brief - User-defined parameters`,
        analysis: `Manual ${manualDirection.toUpperCase()} pattern on ${marketData.symbol} with ${riskRewardRatio.toFixed(2)}:1 R:R`,
        liquidityWarning: marketData.currentPrice < 5 && manualAssetType !== 'crypto',
        sessionContext: marketData.session === 'rth' ? 'Regular Trading Hours' : 
                       marketData.session === 'pre-market' ? 'Pre-Market' : 'After Hours',
        timestamp: new Date().toISOString(),
        source: 'manual',
        confidenceScore: 60, // Default for manual entries
        probabilityBand: 'C', // Default for manual entries
        isPublic: true, // Manual ideas are public by default
        visibility: 'public', // Manual ideas are public by default
      };
      
      const response = await apiRequest('POST', '/api/trade-ideas', idea);
      return response;
    },
    onSuccess: () => {
      if (!marketData) return;
      
      queryClient.invalidateQueries({ queryKey: ['/api/trade-ideas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/performance/stats'] });
      
      toast({
        title: "Manual Research Brief Created",
        description: `${marketData.symbol} manual brief added to NEW tab`,
      });
      
      handleOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Manual Brief",
        description: error?.message || "Please check your inputs and try again.",
        variant: "destructive",
      });
    },
  });
  
  const handleCreateManualIdea = () => {
    createManualIdeaMutation.mutate();
  };
  
  // Calculate R:R for manual entry
  const calculateRR = () => {
    const entry = parseFloat(manualEntry);
    const target = parseFloat(manualTarget);
    const stop = parseFloat(manualStop);
    
    if (isNaN(entry) || isNaN(target) || isNaN(stop)) return null;
    if (stop === entry) return null; // Prevent division by zero
    if (entry <= 0 || target <= 0 || stop <= 0) return null;
    
    // Validate directional correctness
    if (manualDirection === 'long') {
      if (target <= entry || stop >= entry) return null;
    } else {
      if (target >= entry || stop <= entry) return null;
    }
    
    const rr = Math.abs((target - entry) / (entry - stop));
    return rr.toFixed(2);
  };

  if (!marketData) return null;

  const isPositive = marketData.changePercent >= 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          
          {/* Mode Toggle */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsManualMode(!isManualMode)}
              data-testid="button-toggle-manual-mode"
              className="text-xs"
            >
              {isManualMode ? (
                <>
                  <ArrowLeft className="h-3 w-3 mr-2" />
                  Back to Quick Create
                </>
              ) : (
                <>
                  <Edit3 className="h-3 w-3 mr-2" />
                  Manual Entry
                </>
              )}
            </Button>
          </div>

          {/* Manual Entry Form */}
          {isManualMode ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Manual Trade Parameters</h3>
              </div>
              
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="manual-direction">Direction</Label>
                      <Select value={manualDirection} onValueChange={(val) => setManualDirection(val as 'long' | 'short')}>
                        <SelectTrigger id="manual-direction" data-testid="select-manual-direction">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="long">LONG</SelectItem>
                          <SelectItem value="short">SHORT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="manual-asset-type">Asset Type</Label>
                      <Select value={manualAssetType} onValueChange={(val) => setManualAssetType(val as 'stock' | 'option' | 'crypto')}>
                        <SelectTrigger id="manual-asset-type" data-testid="select-manual-asset-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stock">Stock</SelectItem>
                          <SelectItem value="option">Option</SelectItem>
                          <SelectItem value="crypto">Crypto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="manual-entry">Entry Price</Label>
                    <Input
                      id="manual-entry"
                      type="number"
                      step="0.01"
                      value={manualEntry}
                      onChange={(e) => setManualEntry(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-manual-entry"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="manual-target">Target Price</Label>
                    <Input
                      id="manual-target"
                      type="number"
                      step="0.01"
                      value={manualTarget}
                      onChange={(e) => setManualTarget(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-manual-target"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="manual-stop">Stop Loss</Label>
                    <Input
                      id="manual-stop"
                      type="number"
                      step="0.01"
                      value={manualStop}
                      onChange={(e) => setManualStop(e.target.value)}
                      placeholder="0.00"
                      data-testid="input-manual-stop"
                    />
                  </div>
                  
                  {calculateRR() && (
                    <div className="pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Risk/Reward Ratio:</span>
                        <span className="font-mono font-bold text-primary">{calculateRR()}:1</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Recommendation Section */
            recommendation && (
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
                            {recommendation.type === 'stock_options' ? 'Stock Options' : 
                             recommendation.type === 'crypto_shares' ? 'Crypto Shares' : 'Stock Shares'}
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
            )
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isManualMode ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                data-testid="button-cancel-manual"
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateManualIdea}
                disabled={createManualIdeaMutation.isPending || !manualEntry || !manualTarget || !manualStop}
                data-testid="button-create-manual-idea"
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createManualIdeaMutation.isPending ? 'Creating...' : 'Create Manual Idea'}
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    handleOpenChange(false);
                    setSelectedType(null);
                  }}
                  data-testid="button-cancel-action"
                  className="flex-1 sm:flex-none"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Only
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => addToWatchlistMutation.mutate()}
                  disabled={addToWatchlistMutation.isPending}
                  data-testid="button-add-to-watchlist"
                  className="flex-1 sm:flex-none gap-2"
                >
                  <Star className="h-4 w-4" />
                  {addToWatchlistMutation.isPending ? 'Adding...' : 'Add to Watchlist'}
                </Button>
              </div>
              
              {isCrypto ? (
                <Button
                  onClick={() => handleCreateIdea('crypto_shares')}
                  disabled={createIdeaMutation.isPending}
                  data-testid="button-add-crypto-shares"
                  className="w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {selectedType === 'crypto_shares' && createIdeaMutation.isPending ? 'Adding...' : 'Crypto Shares'}
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    onClick={() => handleCreateIdea('stock_shares')}
                    disabled={createIdeaMutation.isPending}
                    data-testid="button-add-stock-shares"
                    className="flex-1 sm:flex-none"
                  >
                    <DollarSign className="h-4 w-4 mr-2" />
                    {selectedType === 'stock_shares' && createIdeaMutation.isPending ? 'Adding...' : 'Stock Shares'}
                  </Button>
                  
                  <Button
                    onClick={() => handleCreateIdea('stock_options')}
                    disabled={createIdeaMutation.isPending}
                    data-testid="button-add-stock-options"
                    className="flex-1 sm:flex-none"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {selectedType === 'stock_options' && createIdeaMutation.isPending ? 'Adding...' : 'Stock Options'}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
