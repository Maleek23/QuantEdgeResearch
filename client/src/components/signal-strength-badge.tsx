import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Activity, TrendingUp, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { 
  getSignalStrengthBand, 
  getSignalStrengthStyles, 
  getEngineExpectedValue,
  SIGNAL_STRENGTH_BANDS,
  type SignalStrengthBand 
} from "@shared/constants";

interface SignalStrengthBadgeProps {
  signalCount: number;
  engine: string;
  qualitySignals?: string[] | null;
  className?: string;
  showExpectedValue?: boolean;
  compact?: boolean;
}

export function SignalStrengthBadge({ 
  signalCount, 
  engine, 
  qualitySignals,
  className,
  showExpectedValue = true,
  compact = false
}: SignalStrengthBadgeProps) {
  const band = getSignalStrengthBand(signalCount);
  const styles = getSignalStrengthStyles(band);
  const bandInfo = SIGNAL_STRENGTH_BANDS[band];
  const evData = getEngineExpectedValue(engine);
  
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline"
            className={cn(
              "font-bold text-xs h-6 px-2 cursor-help",
              styles.bg,
              styles.text,
              styles.border,
              className
            )}
            data-testid={`badge-signal-strength-${band}`}
          >
            {band}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3">
          <SignalStrengthTooltipContent 
            band={band}
            bandInfo={bandInfo}
            signalCount={signalCount}
            qualitySignals={qualitySignals}
            evData={evData}
            engine={engine}
          />
        </TooltipContent>
      </Tooltip>
    );
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex flex-col items-center gap-0.5 cursor-help", className)}>
          <Badge 
            variant="outline"
            className={cn(
              "font-bold text-xs h-6 px-2.5",
              styles.bg,
              styles.text,
              styles.border
            )}
            data-testid={`badge-signal-strength-${band}`}
          >
            <Activity className="h-3 w-3 mr-1" />
            {band}
          </Badge>
          {showExpectedValue && evData && (
            <span className={cn(
              "text-[10px] font-mono",
              evData.ev >= 0.02 ? "text-green-400" :
              evData.ev >= 0 ? "text-cyan-400" :
              "text-red-400"
            )}>
              {evData.formatted}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm p-3">
        <SignalStrengthTooltipContent 
          band={band}
          bandInfo={bandInfo}
          signalCount={signalCount}
          qualitySignals={qualitySignals}
          evData={evData}
          engine={engine}
        />
      </TooltipContent>
    </Tooltip>
  );
}

interface TooltipContentProps {
  band: SignalStrengthBand;
  bandInfo: { description: string };
  signalCount: number;
  qualitySignals?: string[] | null;
  evData: { ev: number; formatted: string; data: { winRate: number; totalTrades: number } } | null;
  engine: string;
}

function SignalStrengthTooltipContent({ 
  band, 
  bandInfo, 
  signalCount, 
  qualitySignals, 
  evData,
  engine 
}: TooltipContentProps) {
  return (
    <div className="space-y-2.5">
      <div className="font-semibold text-sm border-b border-border pb-1.5 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        Signal Strength: {band}
      </div>
      
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          <span className="text-muted-foreground">Signals Agreeing:</span>
          <span className="font-bold">{signalCount}</span>
        </div>
        
        <div className="flex items-center gap-2 text-xs">
          <Info className="h-3 w-3 text-cyan-400" />
          <span className="text-muted-foreground">Meaning:</span>
          <span className="font-medium">{bandInfo.description}</span>
        </div>
      </div>
      
      {evData && (
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <TrendingUp className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground">Expected Value:</span>
            <span className={cn(
              "font-bold font-mono",
              evData.ev >= 0.02 ? "text-green-400" :
              evData.ev >= 0 ? "text-cyan-400" :
              "text-red-400"
            )}>
              {evData.formatted}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Based on {engine.toUpperCase()} engine: {evData.data.winRate.toFixed(1)}% win rate across {evData.data.totalTrades} trades
          </div>
        </div>
      )}
      
      {qualitySignals && qualitySignals.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <div className="text-[10px] text-muted-foreground mb-1">Active Signals:</div>
          <div className="flex flex-wrap gap-1">
            {qualitySignals.map((signal, idx) => (
              <span 
                key={idx}
                className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
              >
                {signal.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}
      
      <div className="pt-2 border-t border-border/50">
        <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Signal Strength</strong> shows how many indicators agree, not probability. 
            <strong> Expected Value</strong> is based on historical {engine} engine performance.
          </span>
        </div>
      </div>
    </div>
  );
}
