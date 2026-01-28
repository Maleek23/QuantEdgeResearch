import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Brain, Clock } from "lucide-react";

/**
 * Trade Idea Card Component - Professional Terminal Style
 * Inspired by Bloomberg/TradingView terminals
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

// Generate mini candlestick data based on direction
const generateCandleData = (isLong: boolean) => {
  const baseY = isLong ? 70 : 30;
  const trend = isLong ? -2.5 : 2.5;
  return Array.from({ length: 12 }, (_, i) => {
    const y = baseY + trend * i + (Math.random() - 0.5) * 8;
    const height = 4 + Math.random() * 6;
    const isUp = Math.random() > (isLong ? 0.35 : 0.65);
    return { x: 8 + i * 14, y: Math.max(10, Math.min(85, y)), height, isUp };
  });
};

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
  const rrRatio = riskReward || Math.abs((targetPrice - entryPrice) / (entryPrice - stopLoss));

  // Memoize candle data so it doesn't regenerate on every render
  const candleData = React.useMemo(() => generateCandleData(isLong), [isLong]);

  const getTimeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Confidence color
  const getConfidenceColor = (score: number) => {
    if (score >= 85) return "text-emerald-400";
    if (score >= 70) return "text-cyan-400";
    if (score >= 55) return "text-amber-400";
    return "text-slate-400";
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl bg-[#0d1117] border border-slate-800/60",
        "hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5",
        "transition-all duration-200 cursor-pointer",
        className
      )}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50">
        <div className="flex items-center gap-3">
          {/* Symbol Badge */}
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm",
            isLong
              ? "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-gradient-to-br from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30"
          )}>
            {symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white">{symbol}</span>
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide",
                isLong
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-red-500/20 text-red-400 border border-red-500/30"
              )}>
                {direction.toUpperCase()}
              </span>
              {isOption && (
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded",
                  optionType === "call" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                )}>
                  {optionType?.toUpperCase()} {strike && `$${strike}`}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-500">
              {companyName || assetType.toUpperCase()}
              {expiry && <span className="ml-2">Exp: {expiry}</span>}
            </div>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] text-emerald-500 font-medium">LIVE</span>
        </div>
      </div>

      {/* Mini Chart */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative h-20 bg-slate-900/50 rounded-lg overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 180 90" preserveAspectRatio="none">
            {/* Subtle grid */}
            <line x1="0" y1="22" x2="180" y2="22" stroke="#1e293b" strokeWidth="0.5" opacity="0.5" />
            <line x1="0" y1="45" x2="180" y2="45" stroke="#1e293b" strokeWidth="0.5" opacity="0.5" />
            <line x1="0" y1="68" x2="180" y2="68" stroke="#1e293b" strokeWidth="0.5" opacity="0.5" />

            {/* Moving average line */}
            <path
              d={`M${candleData.map((c, i) => `${c.x},${c.y + (isLong ? 5 : -5)}`).join(' L')}`}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1"
              opacity="0.4"
            />

            {/* Candlesticks */}
            {candleData.map((candle, i) => (
              <g key={i}>
                {/* Wick */}
                <line
                  x1={candle.x}
                  y1={candle.y - 2}
                  x2={candle.x}
                  y2={candle.y + candle.height + 2}
                  stroke={candle.isUp ? "#10b981" : "#ef4444"}
                  strokeWidth="1"
                />
                {/* Body */}
                <rect
                  x={candle.x - 3}
                  y={candle.y}
                  width="6"
                  height={candle.height}
                  fill={candle.isUp ? "#10b981" : "#ef4444"}
                  rx="0.5"
                />
              </g>
            ))}

            {/* Current price line */}
            <line
              x1="0"
              y1={candleData[candleData.length - 1]?.y || 45}
              x2="180"
              y2={candleData[candleData.length - 1]?.y || 45}
              stroke={isLong ? "#10b981" : "#ef4444"}
              strokeWidth="0.5"
              strokeDasharray="3,3"
            />
          </svg>

          {/* Price Overlay */}
          <div className="absolute top-2 right-2 text-right">
            <div className="text-lg font-bold text-white font-mono">${entryPrice.toFixed(2)}</div>
            <div className={cn("text-xs font-medium", isLong ? "text-emerald-400" : "text-red-400")}>
              {isLong ? "+" : "-"}{((Math.abs(targetPrice - entryPrice) / entryPrice) * 100).toFixed(1)}%
            </div>
          </div>

          {/* Chart label */}
          <div className="absolute top-2 left-2 flex items-center gap-2 text-[8px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-amber-500"></span>
              SMA
            </span>
          </div>
        </div>
      </div>

      {/* AI Confidence Bar */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">AI Confidence</span>
          </div>
          <span className={cn("text-sm font-bold", getConfidenceColor(confidenceScore))}>
            {confidenceScore}%
          </span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              confidenceScore >= 85 ? "bg-gradient-to-r from-emerald-500 to-teal-500" :
              confidenceScore >= 70 ? "bg-gradient-to-r from-cyan-500 to-blue-500" :
              confidenceScore >= 55 ? "bg-gradient-to-r from-amber-500 to-orange-500" :
              "bg-slate-600"
            )}
            style={{ width: `${confidenceScore}%` }}
          />
        </div>
      </div>

      {/* Price Targets */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-slate-800/50 border border-slate-700/30">
            <div className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">Entry</div>
            <div className="text-sm font-mono font-semibold text-white">${entryPrice.toFixed(2)}</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="text-[9px] text-emerald-400 uppercase tracking-wide mb-0.5">Target</div>
            <div className="text-sm font-mono font-semibold text-emerald-400">${targetPrice.toFixed(2)}</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="text-[9px] text-red-400 uppercase tracking-wide mb-0.5">Stop</div>
            <div className="text-sm font-mono font-semibold text-red-400">${stopLoss.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/30 border-t border-slate-800/50">
        <div className="flex items-center gap-3">
          {/* R:R Ratio */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-slate-500">R:R</span>
            <span className="font-bold text-cyan-400">1:{rrRatio.toFixed(1)}</span>
          </div>

          {/* Tier badge */}
          {tier && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {tier}
            </span>
          )}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            <Clock className="w-3 h-3" />
            {getTimeAgo(timestamp)}
          </div>
        )}
      </div>

      {/* Catalyst (if present) */}
      {catalyst && (
        <div className="px-4 py-2 border-t border-slate-800/30">
          <p className="text-[10px] text-slate-400 line-clamp-2">{catalyst}</p>
        </div>
      )}

      {/* Hover glow */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-gradient-to-br from-cyan-500/5 to-transparent" />
    </div>
  );
}

/**
 * Compact row version for lists
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
        "flex items-center gap-4 p-3 rounded-lg bg-[#0d1117] border border-slate-800/50",
        "hover:border-cyan-500/30 hover:bg-slate-900/80 transition-all cursor-pointer",
        className
      )}
    >
      {/* Direction + Symbol */}
      <div className="flex items-center gap-3 min-w-[100px]">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
          isLong
            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            : "bg-red-500/20 text-red-400 border border-red-500/30"
        )}>
          {isLong ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        </div>
        <div>
          <span className="font-bold text-white text-sm">{symbol}</span>
          <div className="flex items-center gap-1">
            <span className={cn(
              "text-[9px] font-semibold",
              isLong ? "text-emerald-400" : "text-red-400"
            )}>
              {direction.toUpperCase()}
            </span>
            {optionType && (
              <span className={cn(
                "text-[9px]",
                optionType === "call" ? "text-emerald-400" : "text-red-400"
              )}>
                {optionType.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mini sparkline */}
      <div className="flex-shrink-0 w-16 h-8">
        <svg className="w-full h-full" viewBox="0 0 60 30">
          <path
            d={isLong
              ? "M0 25 Q 10 22, 20 18 T 40 12 T 60 5"
              : "M0 5 Q 10 8, 20 12 T 40 18 T 60 25"
            }
            fill="none"
            stroke={isLong ? "#10b981" : "#ef4444"}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Prices */}
      <div className="flex items-center gap-3 flex-1 text-xs">
        <div>
          <span className="text-slate-500 text-[10px] block">Entry</span>
          <span className="font-mono text-white font-medium">${entryPrice.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-emerald-400/60 text-[10px] block">Target</span>
          <span className="font-mono text-emerald-400 font-medium">${targetPrice.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-red-400/60 text-[10px] block">Stop</span>
          <span className="font-mono text-red-400 font-medium">${stopLoss.toFixed(2)}</span>
        </div>
      </div>

      {/* R/R + Confidence */}
      <div className="flex items-center gap-3">
        <div className="text-xs">
          <span className="text-slate-500 text-[10px] block">R:R</span>
          <span className="text-cyan-400 font-bold">1:{rrRatio.toFixed(1)}</span>
        </div>
        <div className={cn(
          "px-2 py-1 rounded text-xs font-bold",
          confidenceScore >= 80 ? "bg-emerald-500/20 text-emerald-400" :
          confidenceScore >= 65 ? "bg-cyan-500/20 text-cyan-400" :
          "bg-amber-500/20 text-amber-400"
        )}>
          {confidenceScore}%
        </div>
      </div>

      {/* Time */}
      {timestamp && (
        <div className="text-[10px] text-slate-500 min-w-[50px] text-right">
          {getTimeAgo(timestamp)}
        </div>
      )}
    </div>
  );
}
