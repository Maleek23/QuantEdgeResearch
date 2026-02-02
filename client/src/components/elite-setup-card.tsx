import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  TrendingUp, TrendingDown, Target, Clock, FileText, 
  Calendar, Zap, BarChart3, Activity, AlertTriangle, Minus
} from 'lucide-react';
import { cn, safeToFixed } from '@/lib/utils';
import type { WatchlistItem } from '@shared/schema';

interface EliteSetupCardProps {
  item: WatchlistItem;
  onViewJourney?: (symbol: string) => void;
  onAddNote?: (symbol: string) => void;
  onTrade?: (symbol: string) => void;
  compact?: boolean;
}

const TIER_CONFIG: Record<string, {
  bg: string;
  text: string;
  border: string;
  glow: string;
  label: string;
  icon: typeof Zap;
}> = {
  S: {
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/40",
    glow: "shadow-purple-500/20",
    label: "Elite",
    icon: Zap
  },
  A: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/40",
    glow: "shadow-emerald-500/20",
    label: "Strong",
    icon: TrendingUp
  },
  B: {
    bg: "bg-cyan-500/15",
    text: "text-cyan-400",
    border: "border-cyan-500/40",
    glow: "shadow-cyan-500/20",
    label: "Solid",
    icon: Activity
  },
  C: {
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/40",
    glow: "shadow-amber-500/20",
    label: "Neutral",
    icon: Minus
  },
  D: {
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/40",
    glow: "shadow-orange-500/20",
    label: "Weak",
    icon: TrendingDown
  },
  F: {
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/40",
    glow: "shadow-red-500/20",
    label: "Avoid",
    icon: AlertTriangle
  }
};

function getDaysWatched(addedAt: string): number {
  const added = new Date(addedAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - added.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getScoreChange(initial: number | null, current: number | null): number {
  if (!initial || !current) return 0;
  return Math.round(current - initial);
}

function formatPnl(pnl: number | null): string {
  if (!pnl) return '$0';
  const prefix = pnl >= 0 ? '+' : '';
  return `${prefix}$${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function EliteSetupCard({ 
  item, 
  onViewJourney, 
  onAddNote,
  onTrade,
  compact = false 
}: EliteSetupCardProps) {
  const tier = item.tier || 'C';
  const config = TIER_CONFIG[tier] || TIER_CONFIG.C;
  const TierIcon = config.icon;
  
  const daysWatched = getDaysWatched(item.addedAt);
  const scoreChange = getScoreChange(item.initialScore, item.gradeScore);
  const winRate = item.timesTraded && item.timesTraded > 0
    ? safeToFixed((item.timesWon || 0) / item.timesTraded * 100, 0)
    : null;

  if (compact) {
    return (
      <Card 
        className={cn(
          "hover-elevate cursor-pointer transition-all",
          config.border,
          config.bg
        )}
        onClick={() => onViewJourney?.(item.symbol)}
        data-testid={`elite-card-${item.symbol}-compact`}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center font-bold font-mono text-lg",
                config.bg, config.text, config.border, "border"
              )}>
                {tier}
              </div>
              <div>
                <span className="font-mono font-bold text-base">{item.symbol}</span>
                <span className="text-xs text-muted-foreground ml-2">{item.sector || item.assetType}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono text-sm font-medium">{safeToFixed(item.gradeScore, 0, '50')}/100</span>
              {scoreChange !== 0 && (
                <Badge variant="outline" className={cn(
                  "ml-1 text-xs",
                  scoreChange > 0 ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"
                )}>
                  {scoreChange > 0 ? '+' : ''}{scoreChange}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(
        "hover-elevate transition-all overflow-visible",
        config.border,
        "bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-sm"
      )}
      data-testid={`elite-card-${item.symbol}`}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center font-bold font-mono text-2xl border",
              config.bg, config.text, config.border
            )} data-testid={`tier-badge-${item.symbol}`}>
              {tier}
            </div>
            <div>
              <h3 className="text-lg font-semibold font-mono" data-testid={`symbol-${item.symbol}`}>
                {item.symbol}
              </h3>
              <p className="text-sm font-medium text-slate-400">
                {item.assetType?.toUpperCase()} {item.sector && `• ${item.sector}`}
              </p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="flex items-center gap-1">
              <span className="text-xl font-bold font-mono tabular-nums" data-testid={`score-${item.symbol}`}>
                {safeToFixed(item.gradeScore, 0, '50')}/100
              </span>
              {item.personalEdgeBoost && item.personalEdgeBoost > 0 && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs border-cyan-500/40 text-cyan-400">
                      +{safeToFixed(item.personalEdgeBoost, 0)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Personal edge boost from your win rate</TooltipContent>
                </Tooltip>
              )}
            </div>
            {scoreChange !== 0 && (
              <p className={cn(
                "text-sm font-mono",
                scoreChange > 0 ? "text-green-400" : "text-red-400"
              )}>
                ({scoreChange > 0 ? '↑' : '↓'} {scoreChange > 0 ? '+' : ''}{scoreChange} from {safeToFixed(item.initialScore, 0, '?')})
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          <span>{daysWatched} days watched</span>
        </div>

        {item.priceSinceAdded !== null && item.priceSinceAdded !== undefined && (
          <div className="grid grid-cols-2 gap-2 text-sm font-mono">
            <div>
              <span className="text-xs text-slate-500 block">Price Since Added</span>
              <span className={cn(
                "font-semibold",
                item.priceSinceAdded >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {item.priceSinceAdded >= 0 ? '+' : ''}{safeToFixed(item.priceSinceAdded, 1)}%
              </span>
            </div>
            {item.ytdPerformance !== null && item.ytdPerformance !== undefined && (
              <div>
                <span className="text-xs text-slate-500 block">YTD</span>
                <span className={cn(
                  "font-semibold",
                  item.ytdPerformance >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {item.ytdPerformance >= 0 ? '+' : ''}{safeToFixed(item.ytdPerformance, 1)}%
                </span>
              </div>
            )}
          </div>
        )}

        {(item.timesTraded && item.timesTraded > 0) && (
          <div className="p-2 rounded-md bg-slate-700/30 border border-slate-600/30">
            <p className="text-xs font-medium text-slate-400 mb-1">Your {item.symbol} Stats</p>
            <div className="grid grid-cols-3 gap-2 text-sm font-mono">
              <div>
                <span className="text-xs text-slate-500">Traded</span>
                <p className="font-semibold">{item.timesTraded}x</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Win Rate</span>
                <p className={cn(
                  "font-semibold",
                  winRate && parseInt(winRate) >= 50 ? "text-green-400" : "text-red-400"
                )}>
                  {winRate || 0}%
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-500">P&L</span>
                <p className={cn(
                  "font-semibold",
                  (item.totalPnl || 0) >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {formatPnl(item.totalPnl)}
                </p>
              </div>
            </div>
          </div>
        )}

        {item.addedReason && (
          <p className="text-sm text-slate-400 italic" data-testid={`reason-${item.symbol}`}>
            "{item.addedReason}"
          </p>
        )}

        {item.nextCatalyst && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
            <Calendar className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-amber-400">{item.nextCatalyst}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex-1 h-8 text-xs"
            onClick={() => onViewJourney?.(item.symbol)}
            data-testid={`btn-journey-${item.symbol}`}
          >
            <BarChart3 className="h-3.5 w-3.5 mr-1" />
            Journey
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex-1 h-8 text-xs"
            onClick={() => onAddNote?.(item.symbol)}
            data-testid={`btn-note-${item.symbol}`}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            Notes {item.notesCount && item.notesCount > 0 && `(${item.notesCount})`}
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            className="flex-1 h-8 text-xs bg-cyan-600 hover:bg-cyan-500"
            onClick={() => onTrade?.(item.symbol)}
            data-testid={`btn-trade-${item.symbol}`}
          >
            <Target className="h-3.5 w-3.5 mr-1" />
            Trade
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
