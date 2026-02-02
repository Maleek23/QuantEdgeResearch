import * as React from "react";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";
import { Brain, TrendingUp, TrendingDown, Clock, Target, ShieldAlert, DollarSign, Calendar, Zap, BarChart3 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

/**
 * Trade Idea Card Component - Modern Design with Interactive Charts
 * Matches the clean dark aesthetic with Recharts integration
 */

interface EngineSignal {
  name: string;
  signal: "bullish" | "bearish" | "neutral";
}

interface TradeIdeaCardProps {
  symbol: string;
  companyName?: string;
  direction: "long" | "short" | "LONG" | "SHORT";
  assetType?: "stock" | "option" | "crypto" | "future" | "penny_stock";
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
  // New fields for buy/sell zones
  buyZone?: { low: number; high: number };
  sellZone?: { low: number; high: number };
  // Engine signals from 6 AI bots
  engineSignals?: EngineSignal[];
  onClick?: () => void;
  className?: string;
}

// Generate realistic chart data based on direction
const generateChartData = (isLong: boolean, entryPrice: number, targetPrice: number, stopLoss: number) => {
  const dataPoints = 24;
  const data = [];
  const range = Math.abs(targetPrice - entryPrice);

  for (let i = 0; i < dataPoints; i++) {
    const progress = i / (dataPoints - 1);
    // Create a realistic price movement pattern
    const trend = isLong ? progress : 1 - progress;
    const baseValue = entryPrice + (isLong ? 1 : -1) * range * trend * 0.7;
    const noise = (Math.random() - 0.5) * range * 0.15;
    const value = Math.max(stopLoss * 0.98, Math.min(targetPrice * 1.02, baseValue + noise));

    data.push({
      time: i,
      price: Number(safeToFixed(value, 2)),
    });
  }
  return data;
};

// Default engine signals if not provided
const defaultEngineSignals: EngineSignal[] = [
  { name: "ML", signal: "bullish" },
  { name: "NLP", signal: "bullish" },
  { name: "QNT", signal: "bullish" },
  { name: "FLW", signal: "bullish" },
  { name: "SNT", signal: "neutral" },
  { name: "TCH", signal: "bullish" },
];

// Get asset type badge info
const getAssetTypeInfo = (assetType: string, optionType?: string) => {
  switch (assetType) {
    case 'option':
      return {
        label: optionType?.toUpperCase() || 'OPTION',
        color: optionType === 'call'
          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
          : 'text-red-400 bg-red-500/10 border-red-500/20',
      };
    case 'crypto':
      return { label: 'CRYPTO', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    case 'future':
      return { label: 'FUTURES', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
    case 'penny_stock':
      return { label: 'PENNY', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' };
    default:
      return { label: 'STOCK', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
  }
};

// Custom tooltip for chart
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 shadow-xl">
        <p className="text-white font-mono text-sm">${safeToFixed(payload[0]?.value, 2)}</p>
      </div>
    );
  }
  return null;
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
  buyZone,
  sellZone,
  engineSignals = defaultEngineSignals,
  onClick,
  className,
}: TradeIdeaCardProps) {
  const isLong = direction.toLowerCase() === "long";
  const isOption = assetType === "option" || optionType;

  // Safe values to prevent division by zero and null errors
  const safeEntryPrice = safeNumber(entryPrice, 100);
  const safeTargetPrice = safeNumber(targetPrice, safeEntryPrice * 1.05);
  const safeStopLoss = safeNumber(stopLoss, safeEntryPrice * 0.95);
  const entryStopDiff = Math.abs(safeEntryPrice - safeStopLoss) || 1; // Prevent division by zero

  const rrRatio = riskReward || Math.abs((safeTargetPrice - safeEntryPrice) / entryStopDiff);
  const assetInfo = getAssetTypeInfo(assetType, optionType);
  const percentChange = safeEntryPrice > 0 ? ((safeTargetPrice - safeEntryPrice) / safeEntryPrice) * 100 : 0;

  // Memoize chart data with safe values
  const chartData = React.useMemo(
    () => generateChartData(isLong, safeEntryPrice, safeTargetPrice, safeStopLoss),
    [isLong, safeEntryPrice, safeTargetPrice, safeStopLoss]
  );

  // Count bullish signals
  const bullishCount = engineSignals.filter(e => e.signal === "bullish").length;
  const totalEngines = engineSignals.length;

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
        "group relative overflow-hidden rounded-xl bg-[#111] border border-[#222]",
        "hover:border-[#333] hover:shadow-lg hover:shadow-emerald-500/5",
        "transition-all duration-200 cursor-pointer",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-bold text-white tracking-tight">{symbol}</span>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded font-semibold border uppercase",
            isLong
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-red-500/10 text-red-400 border-red-500/20"
          )}>
            {direction.toUpperCase()}
          </span>
          <span className={cn("text-[10px] px-2 py-0.5 rounded font-medium border", assetInfo.color)}>
            {assetInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {tier && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
              {tier}
            </span>
          )}
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-mono">LIVE</span>
          </div>
        </div>
      </div>

      {/* Price and Company */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="text-xs text-slate-500">
          {companyName || (assetType === "penny_stock" ? "Penny Stock" : symbol)}
        </div>
        <div className="text-right">
          <span className="text-xl font-bold text-white font-mono">${safeToFixed(entryPrice, 2)}</span>
          <span className={cn("text-sm font-medium ml-2", isLong ? "text-emerald-400" : "text-red-400")}>
            {isLong ? "+" : ""}{safeToFixed(percentChange, 1)}%
          </span>
        </div>
      </div>

      {/* Interactive Chart */}
      <div className="px-4 pb-3">
        <div className="relative h-32 bg-[#0a0a0a] rounded-lg overflow-hidden border border-[#1a1a1a]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${symbol}-${isLong}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isLong ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={isLong ? "#10b981" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" hide />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={entryPrice} stroke="#525252" strokeDasharray="3 3" />
              <ReferenceLine y={targetPrice} stroke="#10b981" strokeDasharray="3 3" />
              <ReferenceLine y={stopLoss} stroke="#ef4444" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isLong ? "#10b981" : "#ef4444"}
                strokeWidth={2}
                fill={`url(#gradient-${symbol}-${isLong})`}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Chart Labels */}
          <div className="absolute top-2 left-2 flex items-center gap-2">
            <span className="text-[9px] text-slate-600 font-mono uppercase">24H</span>
          </div>
          <div className={cn(
            "absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded",
            isLong ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
          )}>
            {isLong ? '↑ BULLISH' : '↓ BEARISH'}
          </div>
        </div>
      </div>

      {/* Engine Status Indicators */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">AI Engines</span>
          <span className="text-[10px] font-mono">
            <span className="text-emerald-400">{bullishCount}</span>
            <span className="text-slate-600">/{totalEngines}</span>
            <span className="text-slate-500 ml-1">Bullish</span>
          </span>
        </div>
        <div className="flex gap-1">
          {engineSignals.map((engine, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 text-center py-1.5 rounded text-[9px] font-mono font-medium border",
                engine.signal === "bullish" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                engine.signal === "bearish" && "bg-red-500/10 text-red-400 border-red-500/20",
                engine.signal === "neutral" && "bg-slate-500/10 text-slate-400 border-slate-500/20"
              )}
              title={`${engine.name}: ${engine.signal}`}
            >
              {engine.name}
            </div>
          ))}
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Confidence</span>
          </div>
          <span className={cn(
            "text-sm font-bold font-mono",
            confidenceScore >= 85 ? "text-emerald-400" :
            confidenceScore >= 70 ? "text-blue-400" :
            confidenceScore >= 55 ? "text-amber-400" : "text-slate-400"
          )}>
            {confidenceScore}%
          </span>
        </div>
        <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              confidenceScore >= 85 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
              confidenceScore >= 70 ? "bg-gradient-to-r from-blue-500 to-blue-400" :
              confidenceScore >= 55 ? "bg-gradient-to-r from-amber-500 to-amber-400" :
              "bg-slate-600"
            )}
            style={{ width: `${confidenceScore}%` }}
          />
        </div>
      </div>

      {/* Price Targets Grid */}
      <div className="grid grid-cols-4 gap-2 px-4 pb-3">
        <div className="text-center p-2 rounded-lg bg-[#0a0a0a] border border-[#1a1a1a]">
          <div className="text-[9px] text-slate-500 font-mono uppercase mb-1">Entry</div>
          <div className="text-xs font-bold text-white font-mono">${safeToFixed(entryPrice, 2)}</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <div className="text-[9px] text-emerald-400/70 font-mono uppercase mb-1">Target</div>
          <div className="text-xs font-bold text-emerald-400 font-mono">${safeToFixed(targetPrice, 2)}</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-red-500/5 border border-red-500/10">
          <div className="text-[9px] text-red-400/70 font-mono uppercase mb-1">Stop</div>
          <div className="text-xs font-bold text-red-400 font-mono">${safeToFixed(stopLoss, 2)}</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
          <div className="text-[9px] text-blue-400/70 font-mono uppercase mb-1">R:R</div>
          <div className="text-xs font-bold text-blue-400 font-mono">1:{safeToFixed(rrRatio, 1)}</div>
        </div>
      </div>

      {/* Asset-Specific Info */}
      {isOption && (strike || expiry) && (
        <div className="px-4 pb-3">
          <div className="flex gap-2">
            {strike && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0a0a] border border-[#1a1a1a]">
                <DollarSign className="w-3 h-3 text-slate-500" />
                <span className="text-[10px] text-slate-400 font-mono">Strike: ${strike}</span>
              </div>
            )}
            {expiry && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#0a0a0a] border border-[#1a1a1a]">
                <Calendar className="w-3 h-3 text-slate-500" />
                <span className="text-[10px] text-slate-400 font-mono">Exp: {expiry}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buy/Sell Zones for Stocks */}
      {assetType === "stock" && (buyZone || sellZone) && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-2">
            {buyZone && (
              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <div className="text-[9px] text-emerald-400/70 font-mono uppercase mb-1">Buy Zone</div>
                <div className="text-xs text-emerald-400 font-mono">
                  ${safeToFixed(buyZone.low, 2)} - ${safeToFixed(buyZone.high, 2)}
                </div>
              </div>
            )}
            {sellZone && (
              <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                <div className="text-[9px] text-red-400/70 font-mono uppercase mb-1">Sell Zone</div>
                <div className="text-xs text-red-400 font-mono">
                  ${safeToFixed(sellZone.low, 2)} - ${safeToFixed(sellZone.high, 2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a0a0a] border-t border-[#1a1a1a]">
        {catalyst && (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <p className="text-[10px] text-slate-400 truncate">{catalyst}</p>
          </div>
        )}
        {timestamp && (
          <div className="flex items-center gap-1 text-[10px] text-slate-500 ml-2">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{getTimeAgo(timestamp)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact row version for lists - Modern Dark Style
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
  engineSignals = defaultEngineSignals,
  onClick,
  className,
}: Omit<TradeIdeaCardProps, "catalyst" | "companyName" | "tier" | "riskReward" | "strike" | "expiry" | "buyZone" | "sellZone">) {
  const isLong = direction.toLowerCase() === "long";
  const rrRatio = Math.abs((targetPrice - entryPrice) / (entryPrice - stopLoss));
  const assetInfo = getAssetTypeInfo(assetType, optionType);
  const bullishCount = engineSignals.filter(e => e.signal === "bullish").length;

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
        "flex items-center gap-4 p-3 rounded-lg bg-[#111] border border-[#222]",
        "hover:border-[#333] hover:bg-[#151515] transition-all cursor-pointer",
        className
      )}
    >
      {/* Direction + Symbol */}
      <div className="flex items-center gap-2.5 min-w-[110px]">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          isLong
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            : "bg-red-500/10 text-red-400 border border-red-500/20"
        )}>
          {isLong ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-sm">{symbol}</span>
            <span className={cn("text-[8px] px-1.5 py-0.5 rounded border", assetInfo.color)}>
              {assetInfo.label}
            </span>
          </div>
          <span className={cn(
            "text-[9px] font-semibold font-mono",
            isLong ? "text-emerald-400" : "text-red-400"
          )}>
            {direction.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Mini Engine Status */}
      <div className="flex items-center gap-0.5">
        {engineSignals.slice(0, 6).map((engine, i) => (
          <div
            key={i}
            className={cn(
              "w-1.5 h-4 rounded-sm",
              engine.signal === "bullish" && "bg-emerald-500",
              engine.signal === "bearish" && "bg-red-500",
              engine.signal === "neutral" && "bg-slate-500"
            )}
            title={`${engine.name}: ${engine.signal}`}
          />
        ))}
        <span className="text-[9px] text-slate-500 ml-1 font-mono">{bullishCount}/6</span>
      </div>

      {/* Prices */}
      <div className="flex items-center gap-4 flex-1 text-xs font-mono">
        <div>
          <span className="text-slate-500 text-[9px] block">Entry</span>
          <span className="text-white font-medium">${safeToFixed(entryPrice, 2)}</span>
        </div>
        <div>
          <span className="text-emerald-400/60 text-[9px] block">Target</span>
          <span className="text-emerald-400 font-medium">${safeToFixed(targetPrice, 2)}</span>
        </div>
        <div>
          <span className="text-red-400/60 text-[9px] block">Stop</span>
          <span className="text-red-400 font-medium">${safeToFixed(stopLoss, 2)}</span>
        </div>
      </div>

      {/* R/R + Confidence */}
      <div className="flex items-center gap-3">
        <div className="text-xs font-mono">
          <span className="text-slate-500 text-[9px] block">R:R</span>
          <span className="text-blue-400 font-bold">1:{safeToFixed(rrRatio, 1)}</span>
        </div>
        <div className={cn(
          "px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono",
          confidenceScore >= 80 ? "bg-emerald-500/10 text-emerald-400" :
          confidenceScore >= 65 ? "bg-blue-500/10 text-blue-400" :
          "bg-amber-500/10 text-amber-400"
        )}>
          {confidenceScore}%
        </div>
      </div>

      {/* Time */}
      {timestamp && (
        <div className="text-[10px] text-slate-500 min-w-[50px] text-right font-mono">
          {getTimeAgo(timestamp)}
        </div>
      )}
    </div>
  );
}
