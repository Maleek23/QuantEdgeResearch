import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Brain, Cpu, BarChart3, Activity, MessageSquare, LineChart } from "lucide-react";

interface EngineMiniScoresProps {
  mlScore?: number;
  aiScore?: number;
  quantScore?: number;
  flowScore?: number;
  sentimentScore?: number;
  technicalScore?: number;
  compact?: boolean;
}

interface EngineData {
  name: string;
  abbrev: string;
  score: number;
  icon: React.ReactNode;
  color: string;
}

function getSignalColor(score: number): string {
  if (score >= 60) return 'text-green-400';
  if (score <= 40) return 'text-red-400';
  return 'text-amber-400';
}

function getBgColor(score: number): string {
  if (score >= 60) return 'bg-green-500/10 border-green-500/20';
  if (score <= 40) return 'bg-red-500/10 border-red-500/20';
  return 'bg-amber-500/10 border-amber-500/20';
}

function EngineDot({ engine, compact }: { engine: EngineData; compact?: boolean }) {
  const color = getSignalColor(engine.score);
  const bgColor = getBgColor(engine.score);
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-help transition-colors",
          bgColor
        )} data-testid={`engine-mini-${engine.abbrev.toLowerCase()}`}>
          <div className={cn("w-4 h-4 flex items-center justify-center", color)}>
            {engine.icon}
          </div>
          {!compact && (
            <span className={cn("text-[10px] font-bold font-mono tabular-nums", color)}>
              {engine.score}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-slate-900 border-slate-700">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs">{engine.name}</span>
          <span className={cn("font-bold font-mono", color)}>{engine.score}%</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {engine.score >= 60 ? 'Bullish signal' : engine.score <= 40 ? 'Bearish signal' : 'Neutral signal'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function EngineMiniScores({
  mlScore = 50,
  aiScore = 50,
  quantScore = 50,
  flowScore = 50,
  sentimentScore = 50,
  technicalScore = 50,
  compact = false
}: EngineMiniScoresProps) {
  const engines: EngineData[] = [
    { name: 'ML Engine', abbrev: 'ML', score: mlScore, icon: <Brain className="h-3 w-3" />, color: 'purple' },
    { name: 'AI Engine', abbrev: 'AI', score: aiScore, icon: <Cpu className="h-3 w-3" />, color: 'cyan' },
    { name: 'Quant Engine', abbrev: 'QT', score: quantScore, icon: <BarChart3 className="h-3 w-3" />, color: 'blue' },
    { name: 'Flow Engine', abbrev: 'FL', score: flowScore, icon: <Activity className="h-3 w-3" />, color: 'green' },
    { name: 'Sentiment', abbrev: 'SN', score: sentimentScore, icon: <MessageSquare className="h-3 w-3" />, color: 'amber' },
    { name: 'Technical', abbrev: 'TC', score: technicalScore, icon: <LineChart className="h-3 w-3" />, color: 'rose' },
  ];
  
  const avgScore = Math.round(engines.reduce((sum, e) => sum + e.score, 0) / engines.length);
  const bullishCount = engines.filter(e => e.score >= 60).length;
  
  return (
    <div className="flex items-center gap-1.5" data-testid="engine-mini-scores">
      {engines.map((engine) => (
        <EngineDot key={engine.abbrev} engine={engine} compact={compact} />
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full border font-mono text-xs font-bold cursor-help",
            avgScore >= 60 ? 'bg-green-500/15 border-green-500/30 text-green-400' :
            avgScore <= 40 ? 'bg-red-500/15 border-red-500/30 text-red-400' :
            'bg-amber-500/15 border-amber-500/30 text-amber-400'
          )} data-testid="engine-consensus-badge">
            {avgScore}%
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-slate-900 border-slate-700">
          <div className="text-xs">
            <div className="font-bold">6-Engine Consensus</div>
            <div className="text-muted-foreground mt-1">
              {bullishCount}/6 engines bullish
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function EngineConsensusBadge({ 
  score, 
  alignment,
  size = 'default' 
}: { 
  score: number; 
  alignment: number;
  size?: 'sm' | 'default' 
}) {
  const isSmall = size === 'sm';
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "flex items-center gap-1.5 rounded-full border font-mono font-bold cursor-help",
          isSmall ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
          score >= 60 ? 'bg-green-500/15 border-green-500/30 text-green-400' :
          score <= 40 ? 'bg-red-500/15 border-red-500/30 text-red-400' :
          'bg-amber-500/15 border-amber-500/30 text-amber-400'
        )} data-testid="engine-consensus-badge">
          <Brain className={cn(isSmall ? "h-3 w-3" : "h-4 w-4")} />
          <span>{score}%</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-slate-900 border-slate-700">
        <div className="text-xs">
          <div className="font-bold">6-Engine Intelligence Score</div>
          <div className="text-muted-foreground mt-1">
            ML + AI + Quant + Flow + Sentiment + Technical
          </div>
          <div className="mt-2">
            <span className={cn(
              "font-bold",
              alignment >= 4 ? 'text-green-400' : alignment <= 2 ? 'text-red-400' : 'text-amber-400'
            )}>
              {alignment}/6
            </span>
            <span className="text-muted-foreground"> engines aligned</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
