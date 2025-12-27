import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock } from "lucide-react";
import type { TradeIdea } from "@shared/schema";

interface TradingAdviceProps {
  idea: TradeIdea;
  currentPrice?: number;
}

export function TradingAdvice({ idea, currentPrice }: TradingAdviceProps) {
  if (!currentPrice) return null;

  const isLong = idea.direction === 'long';
  const entryPrice = idea.entryPrice;
  const targetPrice = idea.targetPrice;
  const stopLoss = idea.stopLoss;
  
  // Guard against invalid price levels
  if (entryPrice <= 0 || targetPrice <= 0 || stopLoss <= 0) {
    return null;
  }
  
  // Calculate percentage differences
  const priceDiff = currentPrice - entryPrice;
  const priceDiffPercent = entryPrice !== 0 ? (priceDiff / entryPrice) * 100 : 0;
  
  // Calculate progress to target
  const totalDistance = isLong 
    ? targetPrice - entryPrice 
    : entryPrice - targetPrice;
  const currentDistance = isLong 
    ? currentPrice - entryPrice 
    : entryPrice - currentPrice;
  // Guard against zero distance (invalid trade setup)
  const progressPercent = totalDistance !== 0 ? (currentDistance / totalDistance) * 100 : 0;
  
  // Risk/Reward analysis with guards
  const riskAmount = Math.abs(entryPrice - stopLoss);
  const rewardAmount = Math.abs(targetPrice - entryPrice);
  const currentRisk = Math.abs(currentPrice - stopLoss);
  const currentReward = Math.abs(targetPrice - currentPrice);
  // Guard against division by zero - if at stop loss, R:R is undefined
  const currentRR = currentRisk > 0.01 ? Math.min(currentReward / currentRisk, 99.9) : 0;

  // Generate smart advice
  const getAdvice = () => {
    // Already hit target
    if (progressPercent >= 100) {
      return {
        type: 'success',
        icon: CheckCircle,
        message: 'Target reached! Consider taking profit',
        action: 'EXIT NOW',
        color: 'text-green-500'
      };
    }
    
    // Near target (80%+)
    if (progressPercent >= 80) {
      return {
        type: 'success',
        icon: TrendingUp,
        message: 'Near target - Consider partial profit',
        action: 'TAKE PROFIT',
        color: 'text-green-500'
      };
    }
    
    // Stop loss hit
    if ((isLong && currentPrice <= stopLoss) || (!isLong && currentPrice >= stopLoss)) {
      return {
        type: 'danger',
        icon: AlertCircle,
        message: 'Stop loss triggered!',
        action: 'EXIT',
        color: 'text-red-500'
      };
    }
    
    // Near stop loss (within 10%)
    const stopDistance = Math.abs((currentPrice - stopLoss) / stopLoss * 100);
    if (stopDistance < 10) {
      return {
        type: 'warning',
        icon: AlertCircle,
        message: 'Near stop loss - High risk',
        action: 'WATCH CLOSELY',
        color: 'text-amber-500'
      };
    }
    
    // Good entry zone (within 2% of entry)
    if (Math.abs(priceDiffPercent) < 2) {
      const rrText = currentRR > 0 ? ' - R:R ' + currentRR.toFixed(1) + ':1' : '';
      return {
        type: 'info',
        icon: CheckCircle,
        message: 'Good entry price' + rrText,
        action: 'ENTER',
        color: 'text-blue-500'
      };
    }
    
    // Price above entry (long) or below entry (short) - good momentum
    if ((isLong && priceDiff > 0) || (!isLong && priceDiff < 0)) {
      if (progressPercent > 50) {
        return {
          type: 'success',
          icon: TrendingUp,
          message: 'In profit - Trailing stop recommended',
          action: 'HOLD',
          color: 'text-green-500'
        };
      }
      return {
        type: 'success',
        icon: TrendingUp,
        message: 'Trade moving in your favor',
        action: 'HOLD',
        color: 'text-green-500'
      };
    }
    
    // Price moved against position - re-evaluate
    if (Math.abs(priceDiffPercent) > 5) {
      return {
        type: 'warning',
        icon: AlertCircle,
        message: 'Price moved away - Wait for better entry',
        action: 'WAIT',
        color: 'text-amber-500'
      };
    }
    
    // Default - monitor position
    const rrText = currentRR > 0 ? ' - R:R ' + currentRR.toFixed(1) + ':1' : '';
    return {
      type: 'neutral',
      icon: Clock,
      message: 'Monitor position' + rrText,
      action: 'MONITOR',
      color: 'text-muted-foreground'
    };
  };

  const advice = getAdvice();
  const Icon = advice.icon;

  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border",
      advice.type === 'success' && "bg-green-500/10 border-green-500/30",
      advice.type === 'danger' && "bg-red-500/10 border-red-500/30",
      advice.type === 'warning' && "bg-amber-500/10 border-amber-500/30",
      advice.type === 'info' && "bg-cyan-500/10 border-cyan-500/30",
      advice.type === 'neutral' && "bg-muted/30"
    )}>
      <div className="flex items-center gap-3 flex-1">
        <Icon className={cn("h-5 w-5", advice.color)} />
        <div className="flex-1">
          <p className={cn("text-sm font-semibold", advice.color)}>
            {advice.message}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Current: ${currentPrice.toFixed(2)} • Entry: ${entryPrice.toFixed(2)} ({priceDiffPercent >= 0 ? '+' : ''}{priceDiffPercent.toFixed(2)}%)
          </p>
        </div>
      </div>
      <Badge 
        variant={
          advice.type === 'success' ? 'default' : 
          advice.type === 'danger' ? 'destructive' : 
          'outline'
        }
        className={cn(
          "font-bold",
          advice.type === 'warning' && "bg-amber-500/20 text-amber-400 border-amber-500/30",
          advice.type === 'info' && "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
        )}
      >
        {advice.action}
      </Badge>
    </div>
  );
}
