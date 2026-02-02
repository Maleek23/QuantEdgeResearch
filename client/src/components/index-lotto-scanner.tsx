/**
 * Index Lotto Scanner
 *
 * Identifies high risk/reward options plays on index ETFs (SPX, SPY, IWM, QQQ)
 * Based on technical setups: pin bars, RSI divergence, support/resistance, gamma levels
 *
 * Inspired by successful trades like:
 * - $SPX 6950C: 2.50 → 5.10 (+104%) using 1H pin bar + RSI divergence
 * - $SPX 7040C: 0.10 → 0.30 (+200%) swing on support bounce
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Clock,
  DollarSign,
  Activity,
  BarChart3,
  ArrowRight,
  Flame,
  Shield,
  Brain,
  ChevronRight,
} from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";

// Types
interface TechnicalSetup {
  type: 'pin_bar' | 'rsi_divergence' | 'support_bounce' | 'resistance_rejection' | 'gamma_flip' | 'bollinger_squeeze';
  timeframe: '5m' | '15m' | '1h' | '4h' | 'daily';
  strength: number; // 0-100
  description: string;
}

interface LottoPlay {
  symbol: string;
  underlying: string;
  underlyingPrice: number;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  currentPrice: number;
  estimatedTarget: number;
  potentialReturn: number; // percentage

  // Technical Analysis
  setups: TechnicalSetup[];
  overallScore: number; // 0-100

  // Risk Management
  suggestedEntry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: string;

  // Context
  keyLevel: number;
  levelType: 'support' | 'resistance' | 'pivot';
  gammaExposure: 'positive' | 'negative' | 'neutral';

  // Trade Thesis
  thesis: string;
  confidence: 'low' | 'medium' | 'high';
}

interface IndexData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  dayRange: { low: number; high: number };
  pivotPoints: { s1: number; s2: number; pivot: number; r1: number; r2: number };
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  volumeProfile: 'above_avg' | 'below_avg' | 'average';
}

// Fetch real lotto plays from API
function useIndexLottoScanner() {
  return useQuery<{ indexData: IndexData[]; lottoPlays: LottoPlay[] }>({
    queryKey: ['/api/scanner/index-lotto'],
    queryFn: async () => {
      const res = await fetch('/api/scanner/index-lotto');
      if (!res.ok) {
        throw new Error('Failed to fetch index lotto data');
      }
      return res.json();
    },
    staleTime: 30 * 1000, // 30 seconds - fresh data for live trading
    gcTime: 2 * 60 * 1000, // 2 minutes cache
    refetchInterval: 60 * 1000, // Refresh every minute
    retry: 2,
  });
}

// Sub-components
function IndexOverviewCard({ index }: { index: IndexData }) {
  const isPositive = index.changePercent >= 0;

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-lg font-bold text-white">{index.symbol}</span>
          <span className="text-xs text-slate-400 ml-2">{index.name}</span>
        </div>
        <Badge variant="outline" className={cn(
          "text-xs",
          isPositive
            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
            : "text-red-400 border-red-500/30 bg-red-500/10"
        )}>
          {isPositive ? '+' : ''}{safeToFixed(index.changePercent, 2)}%
        </Badge>
      </div>

      <div className="text-2xl font-bold text-white mb-2">
        ${index.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center p-1.5 bg-slate-700/50 rounded">
          <div className="text-slate-400">RSI</div>
          <div className={cn(
            "font-medium",
            index.rsi > 70 ? "text-red-400" : index.rsi < 30 ? "text-emerald-400" : "text-white"
          )}>{index.rsi}</div>
        </div>
        <div className="text-center p-1.5 bg-slate-700/50 rounded">
          <div className="text-slate-400">MACD</div>
          <div className={cn(
            "font-medium",
            index.macdSignal === 'bullish' ? "text-emerald-400" : index.macdSignal === 'bearish' ? "text-red-400" : "text-slate-300"
          )}>{index.macdSignal}</div>
        </div>
        <div className="text-center p-1.5 bg-slate-700/50 rounded">
          <div className="text-slate-400">Volume</div>
          <div className={cn(
            "font-medium",
            index.volumeProfile === 'above_avg' ? "text-cyan-400" : "text-slate-300"
          )}>{index.volumeProfile === 'above_avg' ? 'High' : index.volumeProfile === 'below_avg' ? 'Low' : 'Avg'}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-700">
        <div className="text-xs text-slate-400 mb-1">Key Levels</div>
        <div className="flex justify-between text-xs">
          <span className="text-red-400">S1: {index.pivotPoints.s1}</span>
          <span className="text-amber-400">P: {index.pivotPoints.pivot}</span>
          <span className="text-emerald-400">R1: {index.pivotPoints.r1}</span>
        </div>
      </div>
    </div>
  );
}

function LottoPlayCard({ play, onSelect }: { play: LottoPlay; onSelect: () => void }) {
  const confidenceColor = {
    high: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    low: 'text-red-400 bg-red-500/10 border-red-500/30',
  }[play.confidence];

  return (
    <Card className="bg-slate-900/50 border-slate-700/50 hover:border-cyan-500/30 transition-all cursor-pointer" onClick={onSelect}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{play.symbol}</span>
              <Badge variant="outline" className={cn("text-xs", confidenceColor)}>
                {play.confidence} confidence
              </Badge>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {play.underlying} @ ${safeToFixed(play.underlyingPrice, 2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Potential</div>
            <div className="text-lg font-bold text-emerald-400">+{play.potentialReturn}%</div>
          </div>
        </div>

        {/* Score Bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Setup Score</span>
            <span className="font-medium text-cyan-400">{play.overallScore}/100</span>
          </div>
          <Progress value={play.overallScore} className="h-1.5" />
        </div>

        {/* Technical Setups */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {play.setups.map((setup, i) => (
            <Badge key={i} variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30 bg-cyan-500/5">
              {setup.type.replace('_', ' ')} ({setup.timeframe})
            </Badge>
          ))}
        </div>

        {/* Trade Levels */}
        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">Entry</div>
            <div className="font-medium text-white">${safeToFixed(play.suggestedEntry, 2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">Stop</div>
            <div className="font-medium text-red-400">${safeToFixed(play.stopLoss, 2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">T1</div>
            <div className="font-medium text-emerald-400">${safeToFixed(play.target1, 2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">T2</div>
            <div className="font-medium text-emerald-400">${safeToFixed(play.target2, 2)}</div>
          </div>
        </div>

        {/* Thesis Preview */}
        <p className="text-xs text-slate-400 line-clamp-2 mb-3">{play.thesis}</p>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "text-[10px]",
              play.type === 'call' ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"
            )}>
              {play.type.toUpperCase()}
            </Badge>
            <span className="text-xs text-slate-400">R:R {play.riskReward}</span>
          </div>
          <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300 h-7 px-2">
            Details <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Main Component
export function IndexLottoScanner({ className }: { className?: string }) {
  const { data, isLoading, error } = useIndexLottoScanner();
  const [selectedIndex, setSelectedIndex] = useState<string>('all');
  const [selectedPlay, setSelectedPlay] = useState<LottoPlay | null>(null);

  if (isLoading) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Index Lotto Scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-24 bg-slate-800/50 rounded-lg animate-pulse" />
            <div className="h-32 bg-slate-800/50 rounded-lg animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className={cn("glass-card", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Index Lotto Scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400 text-center py-4">
            Unable to load scanner data
          </p>
        </CardContent>
      </Card>
    );
  }

  const filteredPlays = selectedIndex === 'all'
    ? data.lottoPlays
    : data.lottoPlays.filter(p => p.underlying === selectedIndex);

  return (
    <Card className={cn("glass-card", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Index Lotto Scanner
            <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30 bg-amber-500/10">
              High R:R
            </Badge>
          </CardTitle>
          <Badge variant="outline" className="text-xs text-slate-400">
            <Clock className="h-3 w-3 mr-1" />
            Live
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          0DTE & weekly plays on SPX, SPY, QQQ, IWM with defined risk
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Index Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {data.indexData.map((index) => (
            <IndexOverviewCard key={index.symbol} index={index} />
          ))}
        </div>

        {/* Filter Tabs */}
        <Tabs value={selectedIndex} onValueChange={setSelectedIndex}>
          <TabsList className="bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="SPX" className="text-xs">SPX</TabsTrigger>
            <TabsTrigger value="SPY" className="text-xs">SPY</TabsTrigger>
            <TabsTrigger value="QQQ" className="text-xs">QQQ</TabsTrigger>
            <TabsTrigger value="IWM" className="text-xs">IWM</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Lotto Plays */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Active Setups ({filteredPlays.length})
            </h3>
            <span className="text-xs text-slate-400">
              Sorted by score
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {filteredPlays
              .sort((a, b) => b.overallScore - a.overallScore)
              .map((play) => (
                <LottoPlayCard
                  key={play.symbol}
                  play={play}
                  onSelect={() => setSelectedPlay(play)}
                />
              ))}
          </div>
        </div>

        {/* Risk Warning */}
        <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-red-200">
            <strong>High Risk Warning:</strong> These are speculative plays with high loss potential.
            Only trade with money you can afford to lose. Always use defined stops.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default IndexLottoScanner;
