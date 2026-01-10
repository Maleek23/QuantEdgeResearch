import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  Ban,
  Clock,
  AlertTriangle,
  Sparkles,
  History,
  Target,
  BarChart3
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface SymbolHistory {
  timesWatched: number;
  timesTraded: number;
  yourWinRate: number;
  lessonLearned: string | null;
  lastOutcome: string | null;
}

interface ResearchSignalCardProps {
  id: string;
  symbol: string;
  engine: 'AI' | 'QUANT' | 'HYBRID';
  direction: 'long' | 'short' | 'LONG' | 'SHORT';
  rawConfidence: number;
  grade: string;
  riskReward: number;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  technicals?: {
    rsi?: number;
    adx?: number;
    atr?: number;
    volume?: number;
  };
  shouldAvoid?: boolean;
  cooldownUntil?: string;
  compact?: boolean;
}

function getGradeColor(grade: string): string {
  if (!grade) return 'text-slate-400';
  const letter = grade.charAt(0).toUpperCase();
  switch (letter) {
    case 'S': return 'text-amber-400';
    case 'A': return 'text-green-400';
    case 'B': return 'text-cyan-400';
    case 'C': return 'text-slate-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-red-400';
    default: return 'text-slate-400';
  }
}

function PersonalizedConfidence({ raw, personal, symbol }: { raw: number; personal: number; symbol: string }) {
  const diff = personal - raw;
  const isPositive = diff >= 0;
  
  return (
    <div className="flex items-center gap-2" data-testid={`confidence-${symbol}`}>
      <span className="font-mono text-lg">{raw}%</span>
      {Math.abs(diff) > 3 && (
        <span className={cn(
          "font-mono text-sm",
          isPositive ? "text-green-400" : "text-amber-400"
        )}>
          → {personal}%
        </span>
      )}
      {Math.abs(diff) > 3 && (
        <Tooltip>
          <TooltipTrigger>
            <Sparkles className="h-3 w-3 text-purple-400" />
          </TooltipTrigger>
          <TooltipContent>
            <p>Personalized based on your {symbol} history</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export default function ResearchSignalCard({
  id,
  symbol,
  engine,
  direction,
  rawConfidence,
  grade,
  riskReward,
  entryPrice,
  targetPrice,
  stopLoss,
  technicals,
  shouldAvoid = false,
  cooldownUntil,
  compact = false,
}: ResearchSignalCardProps) {
  const { toast } = useToast();
  const [showHistory, setShowHistory] = useState(false);
  
  const { data: symbolHistory } = useQuery<SymbolHistory>({
    queryKey: ['/api/research-history/symbol', symbol],
    enabled: !!symbol,
    staleTime: 60 * 1000,
  });

  const logAction = useMutation({
    mutationFn: async (actionTaken: 'traded' | 'watched' | 'ignored') => {
      const response = await apiRequest('POST', '/api/research-history', {
        symbol,
        signalId: id,
        actionTaken,
        signalGrade: grade,
        signalConfidence: rawConfidence,
        signalDirection: direction,
        signalEngine: engine,
        signalPrice: entryPrice,
        technicalSnapshot: technicals,
      });
      return response.json();
    },
    onSuccess: (_, action) => {
      queryClient.invalidateQueries({ queryKey: ['/api/research-history/symbol', symbol] });
      toast({ 
        title: action === 'traded' ? 'Trade Logged' : action === 'watched' ? 'Added to Watch' : 'Ignored',
        description: `${symbol} marked as ${action}`
      });
    },
  });

  const personalConfidence = symbolHistory?.yourWinRate
    ? Math.round(rawConfidence * (0.7 + (symbolHistory.yourWinRate / 100) * 0.6))
    : rawConfidence;

  const isLong = direction.toLowerCase() === 'long';
  const isCoolingDown = shouldAvoid && cooldownUntil && new Date(cooldownUntil) > new Date();

  if (compact) {
    return (
      <Card className="p-3 bg-slate-800/50 backdrop-blur-sm border-slate-700/50 hover-elevate" data-testid={`signal-card-${symbol}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg">{symbol}</span>
            <Badge variant="outline" className={cn(
              "text-xs",
              engine === 'AI' ? 'border-purple-500/50 text-purple-400' :
              engine === 'QUANT' ? 'border-cyan-500/50 text-cyan-400' :
              'border-amber-500/50 text-amber-400'
            )}>
              {engine}
            </Badge>
            <Badge variant="outline" className={cn(
              "text-xs",
              isLong ? 'border-green-500/50 text-green-400' : 'border-red-500/50 text-red-400'
            )}>
              {isLong ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {direction.toUpperCase()}
            </Badge>
          </div>
          
          <div className="flex items-center gap-3">
            <PersonalizedConfidence raw={rawConfidence} personal={personalConfidence} symbol={symbol} />
            <span className={cn("font-bold text-lg", getGradeColor(grade))}>{grade}</span>
            <span className="font-mono text-slate-400">R:R {riskReward.toFixed(1)}</span>
          </div>
        </div>
        
        {symbolHistory && symbolHistory.timesTraded > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center gap-4 text-xs text-slate-400">
            <span>Traded: {symbolHistory.timesTraded}x</span>
            <span className={symbolHistory.yourWinRate >= 50 ? 'text-green-400' : 'text-red-400'}>
              Your Win Rate: {symbolHistory.yourWinRate.toFixed(0)}%
            </span>
            {symbolHistory.lastOutcome && (
              <span className={symbolHistory.lastOutcome === 'hit_target' ? 'text-green-400' : 'text-red-400'}>
                Last: {symbolHistory.lastOutcome === 'hit_target' ? 'Win' : 'Loss'}
              </span>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className={cn(
      "p-4 bg-slate-800/70 backdrop-blur-xl border-slate-700/60",
      isCoolingDown && "border-amber-500/40",
      shouldAvoid && "border-red-500/40"
    )} data-testid={`signal-card-${symbol}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono font-bold text-2xl">{symbol}</span>
            <Badge variant="outline" className={cn(
              engine === 'AI' ? 'border-purple-500/50 text-purple-400' :
              engine === 'QUANT' ? 'border-cyan-500/50 text-cyan-400' :
              'border-amber-500/50 text-amber-400'
            )}>
              {engine}
            </Badge>
            <Badge variant="outline" className={cn(
              isLong ? 'border-green-500/50 text-green-400' : 'border-red-500/50 text-red-400'
            )}>
              {isLong ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {direction.toUpperCase()}
            </Badge>
            <span className="font-mono text-slate-400">R:R {riskReward.toFixed(1)}</span>
          </div>
          
          <div className="flex items-center gap-4 mb-3">
            <div>
              <span className="text-xs text-slate-500 block">Confidence</span>
              <PersonalizedConfidence raw={rawConfidence} personal={personalConfidence} symbol={symbol} />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">Grade</span>
              <span className={cn("font-bold text-2xl", getGradeColor(grade))}>{grade}</span>
            </div>
            {entryPrice && (
              <div>
                <span className="text-xs text-slate-500 block">Entry</span>
                <span className="font-mono text-lg">${entryPrice.toFixed(2)}</span>
              </div>
            )}
          </div>
          
          {technicals && (
            <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
              {technicals.rsi && <span>RSI: {technicals.rsi.toFixed(1)}</span>}
              {technicals.adx && <span>ADX: {technicals.adx.toFixed(1)}</span>}
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-2">
          {isCoolingDown ? (
            <div className="bg-amber-500/15 text-amber-400 border border-amber-500/40 rounded-md px-3 py-2 text-center">
              <Clock className="h-4 w-4 mx-auto mb-1" />
              <span className="text-xs block">Cooling down</span>
            </div>
          ) : shouldAvoid ? (
            <div className="bg-red-500/15 text-red-400 border border-red-500/40 rounded-md px-3 py-2 text-center">
              <AlertTriangle className="h-4 w-4 mx-auto mb-1" />
              <span className="text-xs block">Avoid</span>
            </div>
          ) : (
            <>
              <Button 
                size="sm" 
                onClick={() => logAction.mutate('traded')}
                disabled={logAction.isPending}
                data-testid={`btn-trade-${symbol}`}
              >
                <Target className="h-3 w-3 mr-1" />
                Trade
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => logAction.mutate('watched')}
                disabled={logAction.isPending}
                data-testid={`btn-watch-${symbol}`}
              >
                <Eye className="h-3 w-3 mr-1" />
                Watch
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => logAction.mutate('ignored')}
                disabled={logAction.isPending}
                data-testid={`btn-ignore-${symbol}`}
              >
                <Ban className="h-3 w-3 mr-1" />
                Ignore
              </Button>
            </>
          )}
        </div>
      </div>
      
      {symbolHistory && (symbolHistory.timesWatched > 0 || symbolHistory.timesTraded > 0) && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            data-testid={`btn-history-${symbol}`}
          >
            <History className="h-4 w-4" />
            Your {symbol} History
            <BarChart3 className="h-4 w-4 ml-auto" />
          </button>
          
          {showHistory && (
            <div className="mt-3 grid grid-cols-2 gap-4 bg-slate-800/30 backdrop-blur-sm rounded-md p-3 border border-slate-700/30">
              <div className="flex flex-col">
                <span className="text-xs text-slate-500">Watched</span>
                <span className="font-mono text-lg">{symbolHistory.timesWatched} times</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500">Traded</span>
                <span className="font-mono text-lg">{symbolHistory.timesTraded} times</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500">Your Win Rate</span>
                <span className={cn(
                  "font-mono text-lg",
                  symbolHistory.yourWinRate >= 50 ? 'text-green-400' : 'text-red-400'
                )}>
                  {symbolHistory.yourWinRate.toFixed(0)}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500">Last Outcome</span>
                <span className={cn(
                  "font-mono text-lg capitalize",
                  symbolHistory.lastOutcome === 'hit_target' ? 'text-green-400' : 
                  symbolHistory.lastOutcome === 'hit_stop' ? 'text-red-400' : 'text-slate-400'
                )}>
                  {symbolHistory.lastOutcome?.replace('_', ' ') || 'None'}
                </span>
              </div>
              {symbolHistory.lessonLearned && (
                <div className="col-span-2 mt-2 pt-2 border-t border-slate-700/30">
                  <span className="text-xs text-slate-500 block mb-1">Lesson Learned</span>
                  <p className="text-sm text-amber-400 italic">{symbolHistory.lessonLearned}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
