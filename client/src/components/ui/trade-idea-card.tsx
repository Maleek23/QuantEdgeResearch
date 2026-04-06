import * as React from "react";
import { cn, safeNumber, safeToFixed } from "@/lib/utils";
import { Brain, TrendingUp, TrendingDown, Clock, Target, ShieldAlert, DollarSign, Calendar, Zap, BarChart3 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useQuery } from "@tanstack/react-query";

/**
 * Trade Idea Card Component
 * Uses REAL sparkline data from /api/sparkline/:symbol — no fake charts
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

// Hook to fetch real sparkline data for a symbol
function useSparkline(symbol: string) {
  return useQuery<{ prices: number[] }>({
    queryKey: [`/api/sparkline/${symbol}`],
    staleTime: 60000,
    retry: 1,
    enabled: !!symbol,
  });
}

// Convert sparkline prices to chart data format
function sparklineToChartData(prices: number[]): { time: number; price: number }[] {
  return prices.map((price, i) => ({ time: i, price }));
}

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
          ? 'text-[var(--trade-bullish)] bg-emerald-500/10 border-emerald-500/20'
          : 'text-[var(--trade-bearish)] bg-red-500/10 border-red-500/20',
      };
    case 'crypto':
      return { label: 'CRYPTO', color: 'text-[var(--trade-neutral)] bg-amber-500/10 border-amber-500/20' };
    case 'future':
      return { label: 'FUTURES', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' };
    case 'penny_stock':
      return { label: 'PENNY', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20' };
    default:
      return { label: 'STOCK', color: 'text-muted-foreground bg-muted-foreground/10 border-muted-foreground/20' };
  }
};

// Custom tooltip for chart
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-muted border border-border rounded-lg px-3 py-2 shadow-xl">
        <p className="text-foreground font-mono text-sm">${safeToFixed(payload[0]?.value, 2)}</p>
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

  // Real sparkline data from API — no fake charts
  const { data: sparklineData } = useSparkline(symbol);
  const chartData = React.useMemo(() => {
    if (sparklineData?.prices?.length) {
      return sparklineToChartData(sparklineData.prices);
    }
    return null; // No data = no chart, never fake it
  }, [sparklineData]);

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
        "group relative overflow-hidden rounded-lg bg-card border border-border",
        isLong ? "border-l-2 border-l-[var(--trade-bullish)]" : "border-l-2 border-l-[var(--trade-bearish)]",
        "hover:border-border hover:shadow-md hover:shadow-[var(--glow-teal)]",
        "transition-all duration-150 cursor-pointer",
        className
      )}
    >
      {/* Header — Bloomberg compact */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground tracking-wider font-mono">{symbol}</span>
          <span className={cn(
            "text-[9px] px-1.5 py-0 rounded font-mono font-semibold border uppercase",
            isLong
              ? "bg-emerald-500/10 text-[var(--trade-bullish)] border-emerald-500/20"
              : "bg-red-500/10 text-[var(--trade-bearish)] border-red-500/20"
          )}>
            {direction.toUpperCase()}
          </span>
          <span className={cn("text-[9px] px-1.5 py-0 rounded font-mono font-medium border", assetInfo.color)}>
            {assetInfo.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {tier && (
            <span className="text-[9px] px-1.5 py-0 rounded bg-amber-500/10 text-[var(--trade-neutral)] border border-amber-500/20 font-mono font-semibold">
              {tier}
            </span>
          )}
          <div className="flex items-center gap-0.5">
            <div className="w-1 h-1 rounded-full bg-[var(--trade-bullish)] animate-pulse" />
            <span className="text-[8px] text-[var(--trade-bullish)] font-mono font-semibold tracking-wider">LIVE</span>
          </div>
        </div>
      </div>

      {/* Price and Company — price-display style */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="text-[11px] text-muted-foreground truncate">
          {companyName || (assetType === "penny_stock" ? "Penny Stock" : symbol)}
        </div>
        <div className="text-right flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-foreground font-mono tabular-nums tracking-tight">${safeToFixed(entryPrice, 2)}</span>
          <span className={cn(
            "text-xs font-mono tabular-nums font-medium px-1 py-0 rounded",
            isLong
              ? "text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/10"
              : "text-[var(--trade-bearish)] bg-[var(--trade-bearish)]/10"
          )}>
            {isLong ? "+" : ""}{safeToFixed(percentChange, 1)}%
          </span>
        </div>
      </div>

      {/* Price Chart — real sparkline data only, no fake charts */}
      {chartData && chartData.length > 2 && (
        <div className="px-3 pb-2">
          <div className="relative h-20 bg-muted/15 rounded-md overflow-hidden border border-border/20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-${symbol}-${isLong}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isLong ? "#10b981" : "#ef4444"} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={isLong ? "#10b981" : "#ef4444"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={isLong ? "#10b981" : "#ef4444"}
                  strokeWidth={1.5}
                  fill={`url(#gradient-${symbol}-${isLong})`}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className={cn(
              "absolute top-1 right-1.5 text-[8px] font-bold font-mono px-1 py-0 rounded",
              isLong ? "text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/10" : "text-[var(--trade-bearish)] bg-[var(--trade-bearish)]/10"
            )}>
              {isLong ? 'BULL' : 'BEAR'}
            </div>
          </div>
        </div>
      )}

      {/* Engine Status Indicators — compact */}
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] text-muted-foreground font-mono uppercase tracking-[0.1em]">Engines</span>
          <span className="text-[9px] font-mono tabular-nums">
            <span className="text-[var(--trade-bullish)] font-semibold">{bullishCount}</span>
            <span className="text-muted-foreground/50">/{totalEngines}</span>
          </span>
        </div>
        <div className="flex gap-0.5">
          {engineSignals.map((engine, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 text-center py-1 rounded-sm text-[8px] font-mono font-semibold border",
                engine.signal === "bullish" && "bg-emerald-500/10 text-[var(--trade-bullish)] border-emerald-500/15",
                engine.signal === "bearish" && "bg-red-500/10 text-[var(--trade-bearish)] border-red-500/15",
                engine.signal === "neutral" && "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/15"
              )}
              title={`${engine.name}: ${engine.signal}`}
            >
              {engine.name}
            </div>
          ))}
        </div>
      </div>

      {/* Confidence Bar — tighter */}
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <Brain className="w-3 h-3 text-[var(--trade-bullish)]" />
            <span className="text-[8px] text-muted-foreground font-mono uppercase tracking-[0.1em]">Confidence</span>
          </div>
          <span className={cn(
            "text-xs font-bold font-mono tabular-nums",
            confidenceScore >= 85 ? "text-[var(--trade-bullish)]" :
            confidenceScore >= 70 ? "text-blue-400" :
            confidenceScore >= 55 ? "text-[var(--trade-neutral)]" : "text-muted-foreground"
          )}>
            {confidenceScore}%
          </span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              confidenceScore >= 85 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
              confidenceScore >= 70 ? "bg-gradient-to-r from-blue-500 to-blue-400" :
              confidenceScore >= 55 ? "bg-gradient-to-r from-amber-500 to-amber-400" :
              "bg-muted"
            )}
            style={{ width: `${confidenceScore}%` }}
          />
        </div>
      </div>

      {/* Price Targets Grid — Bloomberg density */}
      <div className="grid grid-cols-4 gap-1 px-3 pb-2">
        <div className="text-center p-1.5 rounded-md bg-[var(--surface-base)] border border-border/40">
          <div className="text-[7px] text-muted-foreground font-mono uppercase tracking-wider">Entry</div>
          <div className="text-data-sm font-bold text-foreground font-mono tabular-nums">${safeToFixed(entryPrice, 2)}</div>
        </div>
        <div className="text-center p-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/10">
          <div className="text-[7px] text-[var(--trade-bullish)]/60 font-mono uppercase tracking-wider">Target</div>
          <div className="text-data-sm font-bold text-[var(--trade-bullish)] font-mono tabular-nums">${safeToFixed(targetPrice, 2)}</div>
        </div>
        <div className="text-center p-1.5 rounded-md bg-red-500/5 border border-red-500/10">
          <div className="text-[7px] text-[var(--trade-bearish)]/60 font-mono uppercase tracking-wider">Stop</div>
          <div className="text-data-sm font-bold text-[var(--trade-bearish)] font-mono tabular-nums">${safeToFixed(stopLoss, 2)}</div>
        </div>
        <div className="text-center p-1.5 rounded-md bg-blue-500/5 border border-blue-500/10">
          <div className="text-[7px] text-blue-400/60 font-mono uppercase tracking-wider">R:R</div>
          <div className="text-data-sm font-bold text-blue-400 font-mono tabular-nums">1:{safeToFixed(rrRatio, 1)}</div>
        </div>
      </div>

      {/* Asset-Specific Info — compact inline */}
      {isOption && (strike || expiry) && (
        <div className="px-3 pb-2">
          <div className="flex gap-1.5">
            {strike && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[var(--surface-base)] border border-border/40">
                <DollarSign className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground font-mono tabular-nums">${strike}</span>
              </div>
            )}
            {expiry && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[var(--surface-base)] border border-border/40">
                <Calendar className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground font-mono">{expiry}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buy/Sell Zones for Stocks — compact */}
      {assetType === "stock" && (buyZone || sellZone) && (
        <div className="px-3 pb-2">
          <div className="grid grid-cols-2 gap-1.5">
            {buyZone && (
              <div className="p-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/10">
                <div className="text-[7px] text-[var(--trade-bullish)]/60 font-mono uppercase tracking-wider">Buy Zone</div>
                <div className="text-data-xs text-[var(--trade-bullish)] font-mono tabular-nums">
                  ${safeToFixed(buyZone.low, 2)}-${safeToFixed(buyZone.high, 2)}
                </div>
              </div>
            )}
            {sellZone && (
              <div className="p-1.5 rounded-md bg-red-500/5 border border-red-500/10">
                <div className="text-[7px] text-[var(--trade-bearish)]/60 font-mono uppercase tracking-wider">Sell Zone</div>
                <div className="text-data-xs text-[var(--trade-bearish)] font-mono tabular-nums">
                  ${safeToFixed(sellZone.low, 2)}-${safeToFixed(sellZone.high, 2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer — minimal chrome */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/15 border-t border-border/30">
        {catalyst && (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Zap className="w-2.5 h-2.5 text-[var(--trade-neutral)]/60 flex-shrink-0" />
            <p className="text-[9px] text-muted-foreground truncate">{catalyst}</p>
          </div>
        )}
        {timestamp && (
          <div className="flex items-center gap-0.5 text-[8px] text-muted-foreground/60 ml-2 font-mono">
            <Clock className="w-2.5 h-2.5" />
            <span>{getTimeAgo(timestamp)}</span>
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
  // Safe values to prevent division by zero
  const safeEntry = safeNumber(entryPrice, 100);
  const safeTarget = safeNumber(targetPrice, safeEntry * 1.05);
  const safeStop = safeNumber(stopLoss, safeEntry * 0.95);
  const entryStopDiff = Math.abs(safeEntry - safeStop) || 1;
  const rrRatio = Math.abs((safeTarget - safeEntry) / entryStopDiff);
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
        "flex items-center gap-3 px-2.5 py-2 rounded-md bg-card border border-border",
        isLong ? "border-l-2 border-l-[var(--trade-bullish)]" : "border-l-2 border-l-[var(--trade-bearish)]",
        "hover:bg-[var(--surface-raised)] transition-all duration-100 cursor-pointer",
        className
      )}
    >
      {/* Direction + Symbol */}
      <div className="flex items-center gap-2 min-w-[100px]">
        <div className={cn(
          "w-6 h-6 rounded-md flex items-center justify-center",
          isLong
            ? "bg-emerald-500/10 text-[var(--trade-bullish)] border border-emerald-500/20"
            : "bg-red-500/10 text-[var(--trade-bearish)] border border-red-500/20"
        )}>
          {isLong ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        </div>
        <div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-foreground text-xs font-mono tracking-wider">{symbol}</span>
            <span className={cn("text-[7px] px-1 py-0 rounded border font-mono", assetInfo.color)}>
              {assetInfo.label}
            </span>
          </div>
          <span className={cn(
            "text-[8px] font-semibold font-mono",
            isLong ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
          )}>
            {direction.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Mini Engine Status */}
      <div className="flex items-center gap-px">
        {engineSignals.slice(0, 6).map((engine, i) => (
          <div
            key={i}
            className={cn(
              "w-1 h-3 rounded-sm",
              engine.signal === "bullish" && "bg-emerald-500",
              engine.signal === "bearish" && "bg-red-500",
              engine.signal === "neutral" && "bg-muted-foreground/40"
            )}
            title={`${engine.name}: ${engine.signal}`}
          />
        ))}
        <span className="text-[8px] text-muted-foreground ml-1 font-mono tabular-nums">{bullishCount}/6</span>
      </div>

      {/* Prices */}
      <div className="flex items-center gap-3 flex-1 text-data-xs font-mono tabular-nums">
        <div>
          <span className="text-muted-foreground text-[7px] block uppercase">Entry</span>
          <span className="text-foreground font-medium">${safeToFixed(entryPrice, 2)}</span>
        </div>
        <div>
          <span className="text-[var(--trade-bullish)]/50 text-[7px] block uppercase">Target</span>
          <span className="text-[var(--trade-bullish)] font-medium">${safeToFixed(targetPrice, 2)}</span>
        </div>
        <div>
          <span className="text-[var(--trade-bearish)]/50 text-[7px] block uppercase">Stop</span>
          <span className="text-[var(--trade-bearish)] font-medium">${safeToFixed(stopLoss, 2)}</span>
        </div>
      </div>

      {/* R/R + Confidence */}
      <div className="flex items-center gap-2">
        <div className="text-data-xs font-mono tabular-nums">
          <span className="text-muted-foreground text-[7px] block uppercase">R:R</span>
          <span className="text-blue-400 font-bold">1:{safeToFixed(rrRatio, 1)}</span>
        </div>
        <div className={cn(
          "px-1.5 py-1 rounded-md text-data-xs font-bold font-mono tabular-nums",
          confidenceScore >= 80 ? "bg-emerald-500/10 text-[var(--trade-bullish)]" :
          confidenceScore >= 65 ? "bg-blue-500/10 text-blue-400" :
          "bg-amber-500/10 text-[var(--trade-neutral)]"
        )}>
          {confidenceScore}%
        </div>
      </div>

      {/* Time */}
      {timestamp && (
        <div className="text-[8px] text-muted-foreground/50 min-w-[40px] text-right font-mono">
          {getTimeAgo(timestamp)}
        </div>
      )}
    </div>
  );
}
