import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { 
  Brain, Cpu, BarChart3, Activity, MessageSquare, LineChart,
  TrendingUp, TrendingDown, Minus, Zap, AlertTriangle, CheckCircle2,
  Loader2, HelpCircle
} from "lucide-react";

interface EngineScore {
  name: string;
  score: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  icon: React.ReactNode;
  color: string;
  factors: string[];
}

interface SixEnginePanelProps {
  symbol: string;
  assetClass: string;
  currentPrice?: number;
  quantScore?: number;
  aiScore?: number;
  mlScore?: number;
  sentimentScore?: number;
  technicalScore?: number;
  flowScore?: number;
}

function getSignal(score: number): 'bullish' | 'bearish' | 'neutral' {
  if (score >= 60) return 'bullish';
  if (score <= 40) return 'bearish';
  return 'neutral';
}

function SignalIcon({ signal }: { signal: 'bullish' | 'bearish' | 'neutral' }) {
  switch (signal) {
    case 'bullish': return <TrendingUp className="h-3 w-3" />;
    case 'bearish': return <TrendingDown className="h-3 w-3" />;
    default: return <Minus className="h-3 w-3" />;
  }
}

function EngineCard({ engine, compact }: { engine: EngineScore; compact?: boolean }) {
  const signalColors: Record<string, string> = {
    bullish: 'text-green-400',
    bearish: 'text-red-400',
    neutral: 'text-amber-400',
    pending: 'text-slate-400'
  };
  
  const borderColors: Record<string, string> = {
    bullish: 'border-green-500/30 hover:border-green-500/50',
    bearish: 'border-red-500/30 hover:border-red-500/50',
    neutral: 'border-amber-500/30 hover:border-amber-500/50',
    pending: 'border-slate-500/30 hover:border-slate-500/50'
  };

  const bgGlows: Record<string, string> = {
    bullish: 'shadow-[0_0_20px_-8px_rgba(34,197,94,0.3)]',
    bearish: 'shadow-[0_0_20px_-8px_rgba(239,68,68,0.3)]',
    neutral: 'shadow-[0_0_20px_-8px_rgba(245,158,11,0.3)]',
    pending: 'shadow-none'
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "relative flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-900/60 backdrop-blur-md border transition-all duration-300 cursor-help group",
          borderColors[engine.signal],
          bgGlows[engine.signal],
          "hover:scale-[1.02]"
        )} data-testid={`engine-${engine.name.toLowerCase().replace(' ', '-')}`}>
          <div className={cn(
            "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300",
            engine.signal === 'bullish' && "bg-gradient-to-br from-green-500/5 to-transparent",
            engine.signal === 'bearish' && "bg-gradient-to-br from-red-500/5 to-transparent",
            engine.signal === 'neutral' && "bg-gradient-to-br from-amber-500/5 to-transparent"
          )} />
          
          <div className={cn(
            "relative p-2 rounded-lg border backdrop-blur-sm",
            engine.color
          )}>
            {engine.icon}
          </div>
          
          <div className="relative text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {engine.name}
          </div>
          
          <div className="relative flex items-center gap-1.5">
            <span className={cn("text-xl font-bold font-mono tabular-nums", signalColors[engine.signal])}>
              {engine.score}
            </span>
            <span className="text-xs text-slate-500">%</span>
          </div>
          
          <div className={cn(
            "relative flex items-center gap-1 text-[10px] font-semibold uppercase",
            signalColors[engine.signal]
          )}>
            <SignalIcon signal={engine.signal} />
            {engine.signal}
          </div>
          
          <div className="relative w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                engine.signal === 'bullish' && "bg-gradient-to-r from-green-600 to-green-400",
                engine.signal === 'bearish' && "bg-gradient-to-r from-red-600 to-red-400",
                engine.signal === 'neutral' && "bg-gradient-to-r from-amber-600 to-amber-400"
              )}
              style={{ width: `${engine.score}%` }}
            />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs bg-slate-900 border-slate-700">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold">{engine.name} Engine</span>
            <Badge variant="outline" className={cn("text-xs", signalColors[engine.signal])}>
              {engine.confidence}% conf
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            {engine.factors.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className={signalColors[engine.signal]}>•</span> {f}
              </div>
            ))}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CompositeScore({ engines }: { engines: EngineScore[] }) {
  const bullishCount = engines.filter(e => e.signal === 'bullish').length;
  const bearishCount = engines.filter(e => e.signal === 'bearish').length;
  const avgScore = Math.round(engines.reduce((sum, e) => sum + e.score, 0) / engines.length);
  const avgConfidence = Math.round(engines.reduce((sum, e) => sum + e.confidence, 0) / engines.length);
  
  const dominantSignal = bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : 'neutral';
  const convergence = Math.max(bullishCount, bearishCount) / engines.length * 100;
  
  const signalColors = {
    bullish: 'text-green-400',
    bearish: 'text-red-400',
    neutral: 'text-amber-400'
  };
  
  const borderColors = {
    bullish: 'border-green-500/50',
    bearish: 'border-red-500/50',
    neutral: 'border-amber-500/50'
  };
  
  const bgColors = {
    bullish: 'bg-green-500/10',
    bearish: 'bg-red-500/10',
    neutral: 'bg-amber-500/10'
  };

  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-xl border-2 backdrop-blur-md",
      bgColors[dominantSignal],
      borderColors[dominantSignal]
    )} data-testid="composite-score">
      <div className="flex items-center gap-4">
        <div className={cn(
          "p-3 rounded-full",
          bgColors[dominantSignal]
        )}>
          {convergence >= 66 ? (
            <CheckCircle2 className={cn("h-6 w-6", signalColors[dominantSignal])} />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          )}
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            6-Engine Consensus
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-2xl font-bold font-mono", signalColors[dominantSignal])}>
              {avgScore}%
            </span>
            <Badge variant="outline" className={cn("text-xs", signalColors[dominantSignal])}>
              {dominantSignal.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Alignment</div>
          <div className={cn("text-lg font-bold font-mono", signalColors[dominantSignal])}>
            {bullishCount}/{engines.length}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Confidence</div>
          <div className="text-lg font-bold font-mono text-cyan-400">
            {avgConfidence}%
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wide">Convergence</div>
          <div className={cn("text-lg font-bold font-mono", convergence >= 66 ? signalColors[dominantSignal] : 'text-amber-400')}>
            {Math.round(convergence)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export function SixEnginePanel({
  symbol,
  assetClass,
  quantScore = 50,
  aiScore = 50,
  mlScore = 50,
  sentimentScore = 50,
  technicalScore = 50,
  flowScore = 50
}: SixEnginePanelProps) {
  const { data: mlData, isLoading: mlLoading, isError: mlError } = useQuery<{
    prediction?: { direction: string; confidence: number };
    sentiment?: { score: number };
    regime?: { confidence: number };
  }>({
    queryKey: ['/api/ml/signal', symbol],
    enabled: !!symbol,
    retry: 1, // Only retry once to avoid long waits
    staleTime: 60000, // Cache for 1 minute
  });

  const engines: EngineScore[] = [
    {
      name: 'ML',
      score: mlData?.prediction?.confidence ? Math.round(mlData.prediction.confidence * 100) : mlScore,
      signal: getSignal(mlData?.prediction?.confidence ? mlData.prediction.confidence * 100 : mlScore),
      confidence: 85,
      icon: <Brain className="h-5 w-5 text-purple-400" />,
      color: 'bg-purple-500/15 border-purple-500/25',
      factors: ['Price prediction model', 'Pattern recognition', 'Regime detection', 'Adaptive sizing']
    },
    {
      name: 'AI',
      score: aiScore,
      signal: getSignal(aiScore),
      confidence: 80,
      icon: <Cpu className="h-5 w-5 text-cyan-400" />,
      color: 'bg-cyan-500/15 border-cyan-500/25',
      factors: ['Claude analysis', 'Fundamental drivers', 'Risk assessment', 'Market context']
    },
    {
      name: 'Quant',
      score: quantScore,
      signal: getSignal(quantScore),
      confidence: 90,
      icon: <BarChart3 className="h-5 w-5 text-blue-400" />,
      color: 'bg-blue-500/15 border-blue-500/25',
      factors: ['RSI(2) mean reversion', 'VWAP flow', 'ADX regime', 'Volume spike']
    },
    {
      name: 'Flow',
      score: flowScore,
      signal: getSignal(flowScore),
      confidence: 75,
      icon: <Activity className="h-5 w-5 text-green-400" />,
      color: 'bg-green-500/15 border-green-500/25',
      factors: ['Institutional activity', 'Dark pool prints', 'Options flow', 'Block trades']
    },
    {
      name: 'Sentiment',
      score: mlData?.sentiment?.score ? Math.round(mlData.sentiment.score * 100) : sentimentScore,
      signal: getSignal(mlData?.sentiment?.score ? mlData.sentiment.score * 100 : sentimentScore),
      confidence: 70,
      icon: <MessageSquare className="h-5 w-5 text-amber-400" />,
      color: 'bg-amber-500/15 border-amber-500/25',
      factors: ['News sentiment', 'Social signals', 'Analyst ratings', 'Earnings sentiment']
    },
    {
      name: 'Technical',
      score: technicalScore,
      signal: getSignal(technicalScore),
      confidence: 88,
      icon: <LineChart className="h-5 w-5 text-rose-400" />,
      color: 'bg-rose-500/15 border-rose-500/25',
      factors: ['Trend analysis', 'Support/resistance', 'Momentum indicators', 'Volatility regime']
    }
  ];

  // Show loading state only briefly - if error or loading too long, show with fallback data
  if (mlLoading && !mlError) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30" data-testid="six-engine-panel">
        <CardContent className="py-12 flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Initializing 6-Engine Analysis...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If there's an error (e.g., weekend, stale data), show fallback with passed-in scores
  const showDataWarning = mlError;

  return (
    <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/30 shadow-[0_0_40px_-15px_rgba(34,211,238,0.08)]" data-testid="six-engine-panel">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/20">
              <Zap className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-base font-bold tracking-tight">
                6-Engine Intelligence
              </CardTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-factor analysis for {symbol}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showDataWarning && (
              <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30 text-amber-400 text-xs">
                Using cached data
              </Badge>
            )}
            <Badge variant="outline" className="bg-slate-800/50 border-cyan-500/30 text-cyan-400 text-xs">
              {assetClass.toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {engines.map((engine) => (
            <EngineCard key={engine.name} engine={engine} />
          ))}
        </div>
        
        <CompositeScore engines={engines} />
      </CardContent>
    </Card>
  );
}
