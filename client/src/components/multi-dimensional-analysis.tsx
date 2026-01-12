import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { 
  Brain, BarChart3, Cpu, History, Building2, 
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Target, Clock, Zap, AlertTriangle, CheckCircle2,
  ArrowUpRight, ArrowDownRight
} from "lucide-react";

interface AnalysisDimension {
  name: string;
  icon: React.ReactNode;
  score: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  factors: string[];
  color: string;
}

interface EntryExitTiming {
  optimalEntryWindow: string;
  entryScore: number;
  exitTargetTime: string;
  exitConfidence: number;
  urgency: 'high' | 'medium' | 'low';
}

interface MultiDimensionalAnalysisProps {
  symbol: string;
  assetType: string;
  direction: 'long' | 'short';
  quantScore?: number;
  aiScore?: number;
  mlScore?: number;
  historicalWinRate?: number;
  fundamentalScore?: number;
  rsi?: number;
  macdHistogram?: number;
  trendStrength?: number;
  volumeRatio?: number;
  targetHitProbability?: number;
  compact?: boolean;
  showTiming?: boolean;
}

function getSignalFromScore(score: number): 'bullish' | 'bearish' | 'neutral' {
  if (score >= 60) return 'bullish';
  if (score <= 40) return 'bearish';
  return 'neutral';
}

function getSignalColor(signal: 'bullish' | 'bearish' | 'neutral'): string {
  switch (signal) {
    case 'bullish': return 'text-green-400';
    case 'bearish': return 'text-red-400';
    default: return 'text-amber-400';
  }
}

function SignalIcon({ signal }: { signal: 'bullish' | 'bearish' | 'neutral' }) {
  switch (signal) {
    case 'bullish': return <TrendingUp className="h-3 w-3 text-green-400" />;
    case 'bearish': return <TrendingDown className="h-3 w-3 text-red-400" />;
    default: return <Minus className="h-3 w-3 text-amber-400" />;
  }
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
      <div 
        className={cn("h-full rounded-full transition-all duration-500", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function DimensionCard({ dimension, compact }: { dimension: AnalysisDimension; compact?: boolean }) {
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/20 border border-border/30 hover-elevate cursor-help transition-all",
            dimension.signal === 'bullish' && "border-green-500/30",
            dimension.signal === 'bearish' && "border-red-500/30",
            dimension.signal === 'neutral' && "border-amber-500/30"
          )}>
            <div className={cn("p-1.5 rounded", dimension.color)}>
              {dimension.icon}
            </div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {dimension.name.split(' ')[0]}
            </div>
            <div className={cn("text-sm font-bold font-mono", getSignalColor(dimension.signal))}>
              {dimension.score}%
            </div>
            <SignalIcon signal={dimension.signal} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <div className="font-semibold">{dimension.name}</div>
            <div className="text-xs text-muted-foreground">
              Confidence: {dimension.confidence}%
            </div>
            <div className="text-xs space-y-1">
              {dimension.factors.map((f, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className={getSignalColor(dimension.signal)}>•</span> {f}
                </div>
              ))}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={cn(
      "p-3 rounded-lg bg-muted/10 border border-border/30 space-y-2",
      dimension.signal === 'bullish' && "border-green-500/20",
      dimension.signal === 'bearish' && "border-red-500/20"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded", dimension.color)}>
            {dimension.icon}
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase">
            {dimension.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-lg font-bold font-mono", getSignalColor(dimension.signal))}>
            {dimension.score}%
          </span>
          <SignalIcon signal={dimension.signal} />
        </div>
      </div>
      <ConfidenceBar 
        value={dimension.score} 
        color={dimension.signal === 'bullish' ? 'bg-green-500' : dimension.signal === 'bearish' ? 'bg-red-500' : 'bg-amber-500'} 
      />
      <div className="text-[10px] text-muted-foreground line-clamp-2">
        {dimension.factors.slice(0, 2).join(' • ')}
      </div>
    </div>
  );
}

function ConvergenceIndicator({ dimensions }: { dimensions: AnalysisDimension[] }) {
  const bullishCount = dimensions.filter(d => d.signal === 'bullish').length;
  const bearishCount = dimensions.filter(d => d.signal === 'bearish').length;
  const total = dimensions.length;
  
  const convergencePercent = Math.max(bullishCount, bearishCount) / total * 100;
  const dominantSignal = bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : 'neutral';
  
  const avgScore = dimensions.reduce((sum, d) => sum + d.score, 0) / total;
  
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border-2",
      dominantSignal === 'bullish' && convergencePercent >= 80 && "bg-green-500/10 border-green-500/50",
      dominantSignal === 'bearish' && convergencePercent >= 80 && "bg-red-500/10 border-red-500/50",
      convergencePercent < 80 && "bg-amber-500/10 border-amber-500/50"
    )}>
      <div className={cn(
        "p-2 rounded-full",
        dominantSignal === 'bullish' && convergencePercent >= 80 && "bg-green-500/20",
        dominantSignal === 'bearish' && convergencePercent >= 80 && "bg-red-500/20",
        convergencePercent < 80 && "bg-amber-500/20"
      )}>
        {convergencePercent >= 80 ? (
          <CheckCircle2 className={cn(
            "h-5 w-5",
            dominantSignal === 'bullish' ? "text-green-400" : "text-red-400"
          )} />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Signal Convergence
          </span>
          <Badge variant="outline" className={cn(
            "text-xs font-bold",
            dominantSignal === 'bullish' && "text-green-400 border-green-500/30",
            dominantSignal === 'bearish' && "text-red-400 border-red-500/30",
            dominantSignal === 'neutral' && "text-amber-400 border-amber-500/30"
          )}>
            {bullishCount}/{total} BULLISH
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Progress 
            value={convergencePercent} 
            className={cn(
              "h-2 flex-1",
              dominantSignal === 'bullish' && "[&>div]:bg-green-500",
              dominantSignal === 'bearish' && "[&>div]:bg-red-500",
              dominantSignal === 'neutral' && "[&>div]:bg-amber-500"
            )}
          />
          <span className={cn(
            "text-sm font-bold font-mono",
            dominantSignal === 'bullish' && "text-green-400",
            dominantSignal === 'bearish' && "text-red-400",
            dominantSignal === 'neutral' && "text-amber-400"
          )}>
            {Math.round(avgScore)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function EntryExitTimingCard({ timing, direction }: { timing: EntryExitTiming; direction: 'long' | 'short' }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className={cn(
        "p-3 rounded-lg border space-y-2",
        timing.urgency === 'high' && "bg-green-500/10 border-green-500/40",
        timing.urgency === 'medium' && "bg-amber-500/10 border-amber-500/40",
        timing.urgency === 'low' && "bg-muted/20 border-border/40"
      )}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase">Entry Window</span>
        </div>
        <div className="text-sm font-bold">{timing.optimalEntryWindow}</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full",
                timing.urgency === 'high' && "bg-green-500",
                timing.urgency === 'medium' && "bg-amber-500",
                timing.urgency === 'low' && "bg-muted-foreground"
              )}
              style={{ width: `${timing.entryScore}%` }}
            />
          </div>
          <span className="text-xs font-mono font-semibold">{timing.entryScore}%</span>
        </div>
        {timing.urgency === 'high' && (
          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
            <Zap className="h-3 w-3 mr-1" />
            OPTIMAL NOW
          </Badge>
        )}
      </div>
      
      <div className="p-3 rounded-lg bg-muted/10 border border-border/40 space-y-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase">Exit Target</span>
        </div>
        <div className="text-sm font-bold">{timing.exitTargetTime}</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full bg-cyan-500"
              style={{ width: `${timing.exitConfidence}%` }}
            />
          </div>
          <span className="text-xs font-mono font-semibold">{timing.exitConfidence}%</span>
        </div>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {direction === 'long' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
          {direction.toUpperCase()} BIAS
        </Badge>
      </div>
    </div>
  );
}

export function MultiDimensionalAnalysis({
  symbol,
  assetType,
  direction,
  quantScore = 50,
  aiScore = 50,
  mlScore = 50,
  historicalWinRate = 50,
  fundamentalScore = 50,
  rsi = 50,
  macdHistogram = 0,
  trendStrength = 50,
  volumeRatio = 1,
  targetHitProbability = 50,
  compact = false,
  showTiming = true
}: MultiDimensionalAnalysisProps) {
  const [expanded, setExpanded] = useState(!compact);

  const dimensions: AnalysisDimension[] = [
    {
      name: 'Quantitative',
      icon: <BarChart3 className="h-4 w-4 text-cyan-400" />,
      score: quantScore,
      signal: getSignalFromScore(quantScore),
      confidence: Math.min(100, quantScore + 10),
      factors: [
        `RSI: ${rsi.toFixed(0)} (${rsi < 30 ? 'Oversold' : rsi > 70 ? 'Overbought' : 'Neutral'})`,
        `MACD: ${macdHistogram >= 0 ? 'Bullish' : 'Bearish'} momentum`,
        `Trend: ${trendStrength}% strength`,
        `Volume: ${volumeRatio.toFixed(1)}x average`
      ],
      color: 'bg-cyan-500/20'
    },
    {
      name: 'AI Analysis',
      icon: <Brain className="h-4 w-4 text-purple-400" />,
      score: aiScore,
      signal: getSignalFromScore(aiScore),
      confidence: Math.min(100, aiScore + 5),
      factors: [
        'Sentiment analysis: Active',
        'News catalyst detection',
        'Pattern recognition'
      ],
      color: 'bg-purple-500/20'
    },
    {
      name: 'ML Prediction',
      icon: <Cpu className="h-4 w-4 text-emerald-400" />,
      score: mlScore,
      signal: getSignalFromScore(mlScore),
      confidence: Math.min(100, targetHitProbability + 10),
      factors: [
        `Target probability: ${targetHitProbability.toFixed(0)}%`,
        `Direction confidence: ${mlScore}%`,
        'XGBoost ensemble model'
      ],
      color: 'bg-emerald-500/20'
    },
    {
      name: 'Historical',
      icon: <History className="h-4 w-4 text-amber-400" />,
      score: historicalWinRate,
      signal: getSignalFromScore(historicalWinRate),
      confidence: 85,
      factors: [
        `Win rate: ${historicalWinRate}%`,
        `Pattern: ${assetType} ${direction}`,
        'Similar setups analyzed'
      ],
      color: 'bg-amber-500/20'
    },
    {
      name: 'Fundamental',
      icon: <Building2 className="h-4 w-4 text-blue-400" />,
      score: fundamentalScore,
      signal: getSignalFromScore(fundamentalScore),
      confidence: 70,
      factors: [
        'Valuation metrics',
        'Growth indicators',
        'Sector strength'
      ],
      color: 'bg-blue-500/20'
    }
  ];

  const timing: EntryExitTiming = {
    optimalEntryWindow: 'Next 30 min',
    entryScore: Math.round((quantScore + mlScore) / 2),
    exitTargetTime: '2-4 hours',
    exitConfidence: Math.round(targetHitProbability),
    urgency: quantScore >= 70 && mlScore >= 60 ? 'high' : quantScore >= 50 ? 'medium' : 'low'
  };

  if (compact && !expanded) {
    return (
      <div className="space-y-2">
        <button 
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between p-2 rounded-lg bg-muted/10 hover-elevate transition-all"
          data-testid={`button-expand-analysis-${symbol}`}
        >
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Brain className="h-3 w-3" />
            Multi-Dimensional Analysis
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="grid grid-cols-5 gap-1.5">
          {dimensions.map((dim) => (
            <DimensionCard key={dim.name} dimension={dim} compact />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid={`analysis-panel-${symbol}`}>
      {compact && (
        <button 
          onClick={() => setExpanded(false)}
          className="w-full flex items-center justify-between p-2 rounded-lg bg-muted/10 hover-elevate transition-all"
        >
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Brain className="h-3 w-3" />
            Multi-Dimensional Analysis
          </span>
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      
      <ConvergenceIndicator dimensions={dimensions} />
      
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {dimensions.map((dim) => (
          <DimensionCard key={dim.name} dimension={dim} />
        ))}
      </div>
      
      {showTiming && (
        <EntryExitTimingCard timing={timing} direction={direction} />
      )}
    </div>
  );
}

export function CompactAnalysisBadges({
  quantScore = 50,
  aiScore = 50,
  mlScore = 50,
  historicalWinRate = 50,
  symbol
}: {
  quantScore?: number;
  aiScore?: number;
  mlScore?: number;
  historicalWinRate?: number;
  symbol: string;
}) {
  const avgScore = (quantScore + aiScore + mlScore + historicalWinRate) / 4;
  const signal = getSignalFromScore(avgScore);
  
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid={`badges-analysis-${symbol}`}>
      <Badge variant="outline" className={cn(
        "text-[10px] font-semibold gap-1",
        quantScore >= 60 ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" : "bg-muted/20 text-muted-foreground"
      )}>
        <BarChart3 className="h-2.5 w-2.5" />
        Q:{quantScore}%
      </Badge>
      <Badge variant="outline" className={cn(
        "text-[10px] font-semibold gap-1",
        aiScore >= 60 ? "bg-purple-500/10 text-purple-400 border-purple-500/30" : "bg-muted/20 text-muted-foreground"
      )}>
        <Brain className="h-2.5 w-2.5" />
        AI:{aiScore}%
      </Badge>
      <Badge variant="outline" className={cn(
        "text-[10px] font-semibold gap-1",
        mlScore >= 60 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted/20 text-muted-foreground"
      )}>
        <Cpu className="h-2.5 w-2.5" />
        ML:{mlScore}%
      </Badge>
      <Badge variant="outline" className={cn(
        "text-[10px] font-semibold gap-1",
        historicalWinRate >= 60 ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-muted/20 text-muted-foreground"
      )}>
        <History className="h-2.5 w-2.5" />
        H:{historicalWinRate}%
      </Badge>
    </div>
  );
}
