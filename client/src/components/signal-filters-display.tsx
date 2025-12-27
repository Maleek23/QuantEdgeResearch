import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, TrendingUp, Gauge, Clock, Activity } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SignalFiltersDisplayProps {
  qualitySignals?: string[] | null;
  volatilityRegime?: string | null;
  sessionPhase?: string | null;
  rsiValue?: number | null;
  volumeRatio?: number | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const KNOWN_FILTERS = [
  'RSI2_OVERSOLD',
  'RSI2_OVERBOUGHT', 
  'VWAP_ABOVE',
  'VWAP_BELOW',
  'VOLUME_SPIKE',
  'ADX_TRENDING',
  'ADX_RANGING',
  'ABOVE_200MA',
  'BELOW_200MA',
  'TIME_OPTIMAL',
  'RSI2_MEAN_REVERSION',
  'RSI2_SHORT_REVERSION',
  'VWAP_CROSS',
];

export function SignalFiltersDisplay({ 
  qualitySignals, 
  volatilityRegime,
  sessionPhase,
  rsiValue,
  volumeRatio,
  size = "md", 
  showLabel = true, 
  className 
}: SignalFiltersDisplayProps) {
  const signalCount = qualitySignals?.length || 0;
  
  const getRegimeColor = (regime: string | null | undefined): string => {
    if (!regime) return 'text-muted-foreground';
    switch (regime) {
      case 'low': return 'text-green-400';
      case 'normal': return 'text-cyan-400';
      case 'high': return 'text-amber-400';
      case 'extreme': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const getRegimeLabel = (regime: string | null | undefined): string => {
    if (!regime) return 'Unknown';
    switch (regime) {
      case 'low': return 'Low Vol';
      case 'normal': return 'Normal';
      case 'high': return 'High Vol';
      case 'extreme': return 'Extreme';
      default: return regime;
    }
  };

  const getSignalBadgeColor = (count: number): string => {
    if (count >= 3) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (count >= 2) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    if (count >= 1) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  const sizes = {
    sm: { badge: 'text-[10px] px-1.5 py-0.5', icon: 'h-2.5 w-2.5' },
    md: { badge: 'text-xs px-2 py-1', icon: 'h-3 w-3' },
    lg: { badge: 'text-sm px-2.5 py-1.5', icon: 'h-3.5 w-3.5' }
  };

  const config = sizes[size];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex flex-col items-center gap-0.5 cursor-help", className)}>
          <div 
            className={cn(
              "flex items-center gap-1 rounded-md border font-semibold",
              getSignalBadgeColor(signalCount),
              config.badge
            )}
            data-testid="signal-filters-badge"
          >
            {signalCount >= 2 ? (
              <CheckCircle2 className={config.icon} />
            ) : (
              <AlertCircle className={config.icon} />
            )}
            <span>{signalCount} {signalCount === 1 ? 'signal' : 'signals'}</span>
          </div>
          {showLabel && (
            <span className="text-[10px] text-muted-foreground">
              Active
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs p-3">
        <div className="space-y-2">
          <div className="font-semibold text-sm border-b border-border pb-1">
            Signal Transparency
          </div>
          
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Activity className="h-3 w-3 text-cyan-400" />
              <span className="text-muted-foreground">Signals Fired:</span>
              <span className="font-mono font-semibold">{signalCount}</span>
            </div>
            
            {volatilityRegime && (
              <div className="flex items-center gap-2 text-xs">
                <Gauge className="h-3 w-3 text-cyan-400" />
                <span className="text-muted-foreground">Volatility:</span>
                <span className={cn("font-semibold", getRegimeColor(volatilityRegime))}>
                  {getRegimeLabel(volatilityRegime)}
                </span>
              </div>
            )}
            
            {sessionPhase && (
              <div className="flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3 text-cyan-400" />
                <span className="text-muted-foreground">Session:</span>
                <span className="font-semibold capitalize">{sessionPhase}</span>
              </div>
            )}
            
            {rsiValue !== null && rsiValue !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                <TrendingUp className="h-3 w-3 text-cyan-400" />
                <span className="text-muted-foreground">RSI(2):</span>
                <span className={cn(
                  "font-mono font-semibold",
                  rsiValue < 10 ? 'text-green-400' : 
                  rsiValue > 90 ? 'text-red-400' : 
                  'text-foreground'
                )}>
                  {rsiValue.toFixed(1)}
                </span>
              </div>
            )}
          </div>
          
          {qualitySignals && qualitySignals.length > 0 && (
            <div className="pt-1.5 border-t border-border">
              <div className="text-[10px] text-muted-foreground mb-1">Active Signals:</div>
              <div className="flex flex-wrap gap-1">
                {qualitySignals.map((signal, idx) => (
                  <span 
                    key={idx}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  >
                    {signal.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          <div className="pt-1.5 border-t border-border text-[10px] text-muted-foreground">
            Shows raw signal data instead of misleading confidence scores.
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
