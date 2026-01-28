import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, AlertTriangle, Clock, Zap } from "lucide-react";

/**
 * Trade Idea Card Component
 * Unified card design for displaying trade ideas across the platform
 */

interface TradeIdeaCardProps {
  symbol: string;
  companyName?: string;
  direction: "long" | "short" | "LONG" | "SHORT";
  assetType?: "stock" | "option" | "crypto" | "future";
  optionType?: "call" | "put";
  strike?: number;
  expiry?: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidenceScore: number;
  riskReward?: number;
  catalyst?: string;
  timestamp?: string;
  tier?: string;
  onClick?: () => void;
  className?: string;
}

export function TradeIdeaCard({
  symbol,
  companyName,
  direction,
  assetType = "stock",
  optionType,
  strike,
  expiry,
  entryPrice,
  targetPrice,
  stopLoss,
  confidenceScore,
  riskReward,
  catalyst,
  timestamp,
  tier,
  onClick,
  className,
}: TradeIdeaCardProps) {
  const isLong = direction.toLowerCase() === "long";
  const isOption = assetType === "option" || optionType;

  // Calculate risk/reward if not provided
  const rrRatio = riskReward || Math.abs((targetPrice - entryPrice) / (entryPrice - stopLoss));

  // Confidence tier color
  const getConfidenceColor = (score: number) => {
    if (score >= 85) return "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
    if (score >= 70) return "text-teal-400 bg-teal-500/20 border-teal-500/30";
    if (score >= 55) return "text-amber-400 bg-amber-500/20 border-amber-500/30";
    return "text-slate-400 bg-slate-500/20 border-slate-500/30";
  };

  // Format time ago
  const getTimeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative p-4 rounded-2xl bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm",
        "hover:border-teal-500/30 hover:shadow-[0_0_30px_rgba(20,184,166,0.08)]",
        "transition-all duration-200 cursor-pointer",
        className
      )}
    >
      {/* Top Row: Symbol + Direction + Confidence */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Direction indicator */}
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            isLong ? "bg-emerald-500/20" : "bg-red-500/20"
          )}>
            {isLong ? (
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
          </div>

          {/* Symbol info */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{symbol}</span>
              {isOption && (
                <Badge className={cn(
                  "text-[10px] uppercase",
                  optionType === "call" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
                )}>
                  {optionType} {strike && `$${strike}`}
                </Badge>
              )}
              {tier && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                  {tier}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {companyName && <span className="truncate max-w-[150px]">{companyName}</span>}
              {expiry && <span>Exp: {expiry}</span>}
            </div>
          </div>
        </div>

        {/* Confidence score */}
        <div className={cn(
          "px-3 py-1.5 rounded-lg border text-sm font-bold",
          getConfidenceColor(confidenceScore)
        )}>
          {confidenceScore}%
        </div>
      </div>

      {/* Price levels */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="p-2 rounded-lg bg-slate-800/50">
          <div className="text-[10px] text-slate-500 uppercase mb-0.5">Entry</div>
          <div className="text-sm font-mono font-medium text-white">${entryPrice.toFixed(2)}</div>
        </div>
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="text-[10px] text-emerald-400 uppercase mb-0.5 flex items-center gap-1">
            <Target className="w-3 h-3" /> Target
          </div>
          <div className="text-sm font-mono font-medium text-emerald-400">${targetPrice.toFixed(2)}</div>
        </div>
        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="text-[10px] text-red-400 uppercase mb-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Stop
          </div>
          <div className="text-sm font-mono font-medium text-red-400">${stopLoss.toFixed(2)}</div>
        </div>
      </div>

      {/* Bottom Row: R/R + Catalyst + Time */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
        <div className="flex items-center gap-3">
          {/* Risk/Reward */}
          <div className="flex items-center gap-1.5 text-xs">
            <Zap className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-slate-400">R/R</span>
            <span className="font-bold text-teal-400">1:{rrRatio.toFixed(1)}</span>
          </div>

          {/* Asset type badge */}
          <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">
            {assetType}
          </Badge>
        </div>

        {/* Timestamp */}
        {timestamp && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            {getTimeAgo(timestamp)}
          </div>
        )}
      </div>

      {/* Catalyst preview (if present) */}
      {catalyst && (
        <div className="mt-3 pt-3 border-t border-slate-800/30">
          <p className="text-xs text-slate-400 line-clamp-2">{catalyst}</p>
        </div>
      )}

      {/* Hover glow effect */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-br from-teal-500/5 to-transparent" />
    </div>
  );
}

/**
 * Compact version for lists
 */

export function TradeIdeaRow({
  symbol,
  direction,
  assetType = "stock",
  optionType,
  entryPrice,
  targetPrice,
  stopLoss,
  confidenceScore,
  timestamp,
  onClick,
  className,
}: Omit<TradeIdeaCardProps, "catalyst" | "companyName" | "tier" | "riskReward" | "strike" | "expiry">) {
  const isLong = direction.toLowerCase() === "long";
  const rrRatio = Math.abs((targetPrice - entryPrice) / (entryPrice - stopLoss));

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800/30",
        "hover:border-teal-500/30 hover:bg-slate-900/80 transition-all cursor-pointer",
        className
      )}
    >
      {/* Direction + Symbol */}
      <div className="flex items-center gap-3 min-w-[120px]">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          isLong ? "bg-emerald-500/20" : "bg-red-500/20"
        )}>
          {isLong ? (
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-400" />
          )}
        </div>
        <div>
          <span className="font-bold text-white">{symbol}</span>
          {optionType && (
            <span className={cn(
              "ml-1.5 text-[10px] uppercase",
              optionType === "call" ? "text-emerald-400" : "text-red-400"
            )}>
              {optionType}
            </span>
          )}
        </div>
      </div>

      {/* Prices */}
      <div className="flex items-center gap-4 flex-1">
        <div className="text-sm">
          <span className="text-slate-500 text-xs mr-1">Entry</span>
          <span className="font-mono text-white">${entryPrice.toFixed(2)}</span>
        </div>
        <div className="text-sm">
          <span className="text-emerald-400/60 text-xs mr-1">Target</span>
          <span className="font-mono text-emerald-400">${targetPrice.toFixed(2)}</span>
        </div>
        <div className="text-sm">
          <span className="text-red-400/60 text-xs mr-1">Stop</span>
          <span className="font-mono text-red-400">${stopLoss.toFixed(2)}</span>
        </div>
      </div>

      {/* R/R + Confidence */}
      <div className="flex items-center gap-4">
        <div className="text-xs text-slate-400">
          R/R <span className="text-teal-400 font-bold">1:{rrRatio.toFixed(1)}</span>
        </div>
        <Badge className={cn(
          "text-xs font-bold",
          confidenceScore >= 80 ? "bg-emerald-500/20 text-emerald-400" :
          confidenceScore >= 65 ? "bg-teal-500/20 text-teal-400" :
          "bg-amber-500/20 text-amber-400"
        )}>
          {confidenceScore}%
        </Badge>
      </div>
    </div>
  );
}
