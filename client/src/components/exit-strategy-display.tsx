import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, Shield, Zap, ChevronRight } from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";

interface ExitStage {
  targetPercent: number;
  exitPercent: number;
  trailAfter: boolean;
}

interface ExitStrategyDisplayProps {
  stages: ExitStage[];
  trailingStop: number;
  type: 'fixed' | 'trailing' | 'staged';
  currentGainPercent?: number;
  recommendation?: 'high_conviction' | 'standard' | 'cautious' | 'skip';
  compact?: boolean;
}

export function ExitStrategyDisplay({ 
  stages, 
  trailingStop, 
  type, 
  currentGainPercent = 0,
  recommendation,
  compact = false
}: ExitStrategyDisplayProps) {
  
  const getRecommendationStyles = () => {
    switch (recommendation) {
      case 'high_conviction':
        return { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', label: 'High Conviction' };
      case 'standard':
        return { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400', label: 'Standard' };
      case 'cautious':
        return { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400', label: 'Cautious' };
      case 'skip':
        return { bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400', label: 'Low Edge' };
      default:
        return { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground', label: '' };
    }
  };

  const recStyles = getRecommendationStyles();
  
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-help",
            recStyles.bg, recStyles.border, "border"
          )}>
            <Target className="h-3 w-3" />
            <span className={recStyles.text}>{stages.length} Stage Exit</span>
            {trailingStop > 0 && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                -{trailingStop}% trail
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-cyan-400" />
              {type.charAt(0).toUpperCase() + type.slice(1)} Exit Strategy
            </div>
            <div className="text-xs space-y-1">
              {stages.map((stage, i) => (
                <div key={i} className="flex items-center gap-2">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <span>+{safeToFixed(stage.targetPercent, 0)}%: Exit {stage.exitPercent}%</span>
                  {stage.trailAfter && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-400">
                      Trail
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            {trailingStop > 0 && (
              <div className="text-xs text-amber-400 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Trailing stop: -{trailingStop}% from high
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn(
      "rounded-lg p-3 space-y-3",
      recStyles.bg, recStyles.border, "border"
    )} data-testid="exit-strategy-display">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium">
            {type.charAt(0).toUpperCase() + type.slice(1)} Exit Strategy
          </span>
        </div>
        {recommendation && (
          <Badge className={cn("text-xs", recStyles.bg, recStyles.text, recStyles.border)}>
            {recStyles.label}
          </Badge>
        )}
      </div>

      <div className="space-y-2">
        {stages.map((stage, i) => {
          const isReached = currentGainPercent >= stage.targetPercent;
          const progress = Math.min(100, (currentGainPercent / stage.targetPercent) * 100);
          
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-mono font-medium",
                    isReached ? "text-green-400" : "text-muted-foreground"
                  )}>
                    Stage {i + 1}: +{safeToFixed(stage.targetPercent, 0)}%
                  </span>
                  {stage.trailAfter && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-cyan-400 border-cyan-500/30">
                      <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                      Trail after
                    </Badge>
                  )}
                </div>
                <span className={cn(
                  "font-medium",
                  isReached ? "text-green-400" : "text-muted-foreground"
                )}>
                  Exit {stage.exitPercent}%
                </span>
              </div>
              <Progress 
                value={isReached ? 100 : Math.max(0, progress)} 
                className="h-1.5" 
              />
            </div>
          );
        })}
      </div>

      {trailingStop > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <Shield className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs text-amber-400">
            Trailing stop: -{trailingStop}% from highest gain
          </span>
        </div>
      )}
    </div>
  );
}

interface CalibratedConfidenceDisplayProps {
  rawScore: number;
  calibratedScore: number;
  factors: {
    historicalWinRate: number;
    riskRewardQuality: number;
    signalDensity: number;
    sampleSizeConfidence: number;
  };
  recommendation: 'high_conviction' | 'standard' | 'cautious' | 'skip';
  reason: string;
  compact?: boolean;
}

export function CalibratedConfidenceDisplay({
  rawScore,
  calibratedScore,
  factors,
  recommendation,
  reason,
  compact = false
}: CalibratedConfidenceDisplayProps) {
  
  const getConfidenceColor = () => {
    if (calibratedScore >= 75) return 'text-green-400';
    if (calibratedScore >= 55) return 'text-cyan-400';
    if (calibratedScore >= 40) return 'text-amber-400';
    return 'text-red-400';
  };

  const getRecommendationIcon = () => {
    switch (recommendation) {
      case 'high_conviction': return <Zap className="h-3.5 w-3.5 text-green-400" />;
      case 'standard': return <Target className="h-3.5 w-3.5 text-cyan-400" />;
      case 'cautious': return <Shield className="h-3.5 w-3.5 text-amber-400" />;
      default: return null;
    }
  };

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-help">
            {getRecommendationIcon()}
            <span className={cn("font-mono font-bold", getConfidenceColor())}>
              {calibratedScore}
            </span>
            {calibratedScore !== rawScore && (
              <span className="text-[10px] text-muted-foreground">
                ({rawScore > calibratedScore ? '↓' : '↑'}{Math.abs(calibratedScore - rawScore)})
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-medium">Calibrated Confidence</div>
            <div className="text-xs text-muted-foreground">{reason}</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Win Rate: {factors.historicalWinRate}%</div>
              <div>R:R Quality: {factors.riskRewardQuality}%</div>
              <div>Signals: {factors.signalDensity}%</div>
              <div>Data Conf: {factors.sampleSizeConfidence}%</div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="rounded-lg bg-muted/30 p-3 space-y-3" data-testid="calibrated-confidence-display">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium">Calibrated Confidence</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("font-mono text-lg font-bold", getConfidenceColor())}>
            {calibratedScore}
          </span>
          {calibratedScore !== rawScore && (
            <span className="text-xs text-muted-foreground">
              (was {rawScore})
            </span>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">{reason}</div>

      <div className="grid grid-cols-2 gap-2">
        <FactorBar label="Historical Win Rate" value={factors.historicalWinRate} />
        <FactorBar label="R:R Quality" value={factors.riskRewardQuality} />
        <FactorBar label="Signal Density" value={factors.signalDensity} />
        <FactorBar label="Data Confidence" value={factors.sampleSizeConfidence} />
      </div>
    </div>
  );
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const getColor = () => {
    if (value >= 70) return 'bg-green-500';
    if (value >= 50) return 'bg-cyan-500';
    if (value >= 30) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{value}%</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", getColor())} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
