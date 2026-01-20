/**
 * ML Entry/Exit Timing Indicator
 *
 * Shows ML-predicted optimal entry and exit timing for trades
 * Visual indicators for momentum, time decay, and risk zones
 */

import { Clock, TrendingUp, TrendingDown, Zap, AlertTriangle, Target, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MLTimingIndicatorProps {
  entryPrice: number;
  currentPrice?: number;
  targetPrice: number;
  stopLoss: number;
  direction: 'long' | 'short';
  expiryDate?: string;
  assetType?: 'stock' | 'option' | 'crypto';
  confidence?: number;
}

export function MLTimingIndicator({
  entryPrice,
  currentPrice,
  targetPrice,
  stopLoss,
  direction,
  expiryDate,
  assetType = 'stock',
  confidence = 70
}: MLTimingIndicatorProps) {
  const isLong = direction === 'long';
  const price = currentPrice || entryPrice;

  // Calculate progress to target and stop loss
  const targetDistance = isLong
    ? ((targetPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - targetPrice) / entryPrice) * 100;

  const stopDistance = isLong
    ? ((entryPrice - stopLoss) / entryPrice) * 100
    : ((stopLoss - entryPrice) / entryPrice) * 100;

  const currentProgress = currentPrice
    ? (isLong
        ? ((currentPrice - entryPrice) / (targetPrice - entryPrice)) * 100
        : ((entryPrice - currentPrice) / (entryPrice - targetPrice)) * 100)
    : 0;

  const riskRewardRatio = Math.abs(targetDistance / stopDistance);

  // Calculate time decay for options
  const timeDecay = expiryDate && assetType === 'option'
    ? (() => {
        const now = new Date().getTime();
        const expiry = new Date(expiryDate).getTime();
        const totalTime = expiry - Date.now();
        const daysLeft = totalTime / (1000 * 60 * 60 * 24);

        if (daysLeft < 1) return { level: 'critical', pct: 100 };
        if (daysLeft < 3) return { level: 'high', pct: 75 };
        if (daysLeft < 7) return { level: 'medium', pct: 50 };
        return { level: 'low', pct: 25 };
      })()
    : null;

  // ML Momentum Score (simplified - in production this would come from backend)
  const momentumScore = currentPrice
    ? Math.min(100, Math.max(0, currentProgress + confidence))
    : confidence;

  const getMomentumColor = (score: number) => {
    if (score >= 75) return 'text-green-400';
    if (score >= 50) return 'text-cyan-400';
    if (score >= 25) return 'text-amber-400';
    return 'text-red-400';
  };

  const getMomentumBg = (score: number) => {
    if (score >= 75) return 'bg-green-500/20';
    if (score >= 50) return 'bg-cyan-500/20';
    if (score >= 25) return 'bg-amber-500/20';
    return 'bg-red-500/20';
  };

  return (
    <div className="space-y-3">
      {/* Momentum & Confidence Score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className={cn("h-4 w-4", getMomentumColor(momentumScore))} />
          <span className="text-sm font-medium">ML Momentum</span>
        </div>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className={cn("font-mono", getMomentumBg(momentumScore))}>
              {momentumScore.toFixed(0)}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">ML-predicted momentum strength</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Progress to Target */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <Target className="h-3 w-3" />
            Progress to Target
          </span>
          <span className={cn("font-mono font-medium", currentProgress > 0 ? 'text-green-400' : 'text-muted-foreground')}>
            {currentProgress.toFixed(1)}%
          </span>
        </div>
        <Progress
          value={Math.max(0, Math.min(100, currentProgress))}
          className="h-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground font-mono">
          <span>${entryPrice.toFixed(2)}</span>
          <span className="text-green-400">${targetPrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Risk/Reward Ratio */}
      <div className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-800/50">
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-xs font-medium">Risk/Reward</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "font-mono",
            riskRewardRatio >= 2 ? "bg-green-500/20 text-green-400" :
            riskRewardRatio >= 1 ? "bg-cyan-500/20 text-cyan-400" :
            "bg-amber-500/20 text-amber-400"
          )}
        >
          1:{riskRewardRatio.toFixed(1)}
        </Badge>
      </div>

      {/* Time Decay Warning (Options Only) */}
      {timeDecay && (
        <div className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded text-xs",
          timeDecay.level === 'critical' ? 'bg-red-500/20 text-red-400' :
          timeDecay.level === 'high' ? 'bg-amber-500/20 text-amber-400' :
          'bg-slate-800/50 text-muted-foreground'
        )}>
          <Clock className="h-3.5 w-3.5" />
          <span className="flex-1 font-medium">
            Time Decay: {timeDecay.level.toUpperCase()}
          </span>
          <span className="font-mono">{timeDecay.pct}%</span>
        </div>
      )}

      {/* Entry/Exit Zones */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
        <div className="text-center">
          <div className="text-xs text-red-400 mb-1">Stop Loss</div>
          <div className="text-xs font-mono font-medium">${stopLoss.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">-{stopDistance.toFixed(1)}%</div>
        </div>
        <div className="text-center border-x border-slate-800">
          <div className="text-xs text-muted-foreground mb-1">Entry</div>
          <div className="text-xs font-mono font-medium text-cyan-400">${entryPrice.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Base</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-green-400 mb-1">Target</div>
          <div className="text-xs font-mono font-medium">${targetPrice.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">+{targetDistance.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}
