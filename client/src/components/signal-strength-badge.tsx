import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Activity, TrendingUp, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { getEngineExpectedValue } from "@shared/constants";

interface SignalStrengthBadgeProps {
  signalCount: number;
  engine: string;
  qualitySignals?: string[] | null;
  className?: string;
  showExpectedValue?: boolean;
  compact?: boolean;
}

function getSignalStrengthColor(count: number) {
  if (count >= 5) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40' };
  if (count >= 4) return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/40' };
  if (count >= 3) return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/40' };
  if (count >= 2) return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40' };
  return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40' };
}

function getSignalLabel(count: number) {
  if (count >= 5) return 'Strong';
  if (count >= 4) return 'Good';
  if (count >= 3) return 'Moderate';
  if (count >= 2) return 'Weak';
  return 'Low';
}

export function SignalStrengthBadge({ 
  signalCount, 
  engine, 
  qualitySignals,
  className,
  showExpectedValue = true,
  compact = false
}: SignalStrengthBadgeProps) {
  const styles = getSignalStrengthColor(signalCount);
  const evData = getEngineExpectedValue(engine);
  const label = getSignalLabel(signalCount);
  
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
            data-testid={`badge-signals-${signalCount}`}
          >
            <Activity className="h-3 w-3 mr-1" />
            {signalCount}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3">
          <SignalStrengthTooltipContent 
            signalCount={signalCount}
            label={label}
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
            data-testid={`badge-signals-${signalCount}`}
          >
            <Activity className="h-3 w-3 mr-1" />
            {signalCount}/5
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
          signalCount={signalCount}
          label={label}
          qualitySignals={qualitySignals}
          evData={evData}
          engine={engine}
        />
      </TooltipContent>
    </Tooltip>
  );
}

interface TooltipContentProps {
  signalCount: number;
  label: string;
  qualitySignals?: string[] | null;
  evData: { ev: number; formatted: string; data: { winRate: number; totalTrades: number } } | null;
  engine: string;
}

function SignalStrengthTooltipContent({ 
  signalCount, 
  label, 
  qualitySignals, 
  evData,
  engine 
}: TooltipContentProps) {
  return (
    <div className="space-y-2.5">
      <div className="font-semibold text-sm border-b border-border pb-1.5 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        Signal Confluence: {signalCount}/5 ({label})
      </div>
      
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          <span className="text-muted-foreground">Indicators Agreeing:</span>
          <span className="font-bold">{signalCount} of 5</span>
        </div>
        
        <div className="flex items-center gap-2 text-xs">
          <Info className="h-3 w-3 text-cyan-400" />
          <span className="text-muted-foreground">Confluence:</span>
          <span className="font-medium">{label}</span>
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
            <strong>Signal Confluence</strong> shows how many technical indicators agree on direction. 
            The <strong>Trade Grade</strong> (A+, B, etc.) is based on overall confidence score.
          </span>
        </div>
      </div>
    </div>
  );
}
