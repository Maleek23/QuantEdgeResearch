import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Database, Sparkles, DollarSign } from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";
import { useDataIntelligence } from "@/hooks/useDataIntelligence";
import { getEngineExpectedValue } from "@shared/constants";

interface HistoricalPerformanceBadgeProps {
  symbol: string;
  engine: string;
  confidenceScore?: number;
  className?: string;
  compact?: boolean;
}

export function HistoricalPerformanceBadge({ 
  symbol, 
  engine, 
  confidenceScore,
  className,
  compact = false
}: HistoricalPerformanceBadgeProps) {
  const { data: intelligence, isLoading } = useDataIntelligence();
  
  if (isLoading || !intelligence) {
    return null;
  }
  
  const { lookup } = intelligence;
  
  const engineWinRate = lookup.engine[engine];
  const symbolData = lookup.symbol[symbol];
  const evData = getEngineExpectedValue(engine);
  
  const hasData = engineWinRate !== undefined || symbolData !== undefined || evData !== null;
  
  if (!hasData) {
    return null;
  }
  
  const getWinRateColor = (rate: number) => {
    if (rate >= 70) return 'text-green-400 bg-green-500/10 border-green-500/30';
    if (rate >= 50) return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    if (rate >= 35) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-red-400 bg-red-500/10 border-red-500/30';
  };
  
  if (compact) {
    const primaryRate = symbolData?.winRate ?? engineWinRate ?? 0;
    const primaryColor = getWinRateColor(primaryRate);
    
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              "text-[10px] h-5 font-bold cursor-help",
              primaryColor,
              className
            )}
            data-testid={`badge-historical-${symbol}`}
          >
            <Database className="h-2.5 w-2.5 mr-0.5" />
            {safeToFixed(primaryRate, 0)}%
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3">
          <div className="space-y-2">
            <div className="font-semibold text-sm border-b border-border pb-1 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Historical Performance
            </div>
            <div className="text-xs space-y-1.5">
              {engineWinRate !== undefined && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground capitalize">{engine} Engine:</span>
                  <span className={cn("font-bold", getWinRateColor(engineWinRate).split(' ')[0])}>
                    {safeToFixed(engineWinRate, 1)}% win rate
                  </span>
                </div>
              )}
              {symbolData && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{symbol}:</span>
                  <span className={cn("font-bold", getWinRateColor(symbolData.winRate).split(' ')[0])}>
                    {safeToFixed(symbolData.winRate, 1)}% ({symbolData.trades} trades)
                  </span>
                </div>
              )}
              {evData && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Expected Value:</span>
                  <span className={cn(
                    "font-bold font-mono",
                    evData.ev >= 0.02 ? "text-green-400" : evData.ev >= 0 ? "text-cyan-400" : "text-red-400"
                  )}>
                    {evData.formatted}
                  </span>
                </div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
              Based on {intelligence.summary.resolvedTrades} resolved trades
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {engineWinRate !== undefined && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] h-5 font-semibold cursor-help",
                getWinRateColor(engineWinRate)
              )}
              data-testid={`badge-engine-winrate-${engine}`}
            >
              {engineWinRate >= 50 ? (
                <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
              ) : (
                <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
              )}
              {engine.toUpperCase()}: {safeToFixed(engineWinRate, 0)}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {engine} engine historical win rate based on {intelligence.enginePerformance.find(e => e.engine === engine)?.total || 0} resolved trades
            </p>
          </TooltipContent>
        </Tooltip>
      )}
      
      {symbolData && symbolData.trades >= 3 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] h-5 font-semibold cursor-help",
                getWinRateColor(symbolData.winRate)
              )}
              data-testid={`badge-symbol-winrate-${symbol}`}
            >
              {symbolData.winRate >= 50 ? (
                <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
              ) : (
                <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
              )}
              {symbol}: {safeToFixed(symbolData.winRate, 0)}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {symbol} historical: {symbolData.trades} trades at {safeToFixed(symbolData.winRate, 1)}% win rate
            </p>
          </TooltipContent>
        </Tooltip>
      )}
      
      {evData && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] h-5 font-semibold cursor-help font-mono",
                evData.ev >= 0.02 ? "text-green-400 bg-green-500/10 border-green-500/30" :
                evData.ev >= 0 ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" :
                "text-red-400 bg-red-500/10 border-red-500/30"
              )}
              data-testid={`badge-expected-value-${engine}`}
            >
              <DollarSign className="h-2.5 w-2.5 mr-0.5" />
              {evData.formatted}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              Expected return per $1 risked based on {evData.data.totalTrades} {engine} engine trades
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
