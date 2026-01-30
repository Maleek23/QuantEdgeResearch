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
import { cn } from "@/lib/utils";

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

// Simulated data - In production this would come from the API
function useIndexLottoScanner() {
  return useQuery({
    queryKey: ['/api/scanner/index-lotto'],
    queryFn: async () => {
      // In production, this would fetch from API
      // For now, generate sample data based on market structure
      const indexData: IndexData[] = [
        {
          symbol: 'SPX',
          name: 'S&P 500 Index',
          price: 6042.12,
          change: 28.45,
          changePercent: 0.47,
          dayRange: { low: 6008.32, high: 6055.89 },
          pivotPoints: { s1: 5980, s2: 5920, pivot: 6020, r1: 6080, r2: 6140 },
          rsi: 58,
          macdSignal: 'bullish',
          volumeProfile: 'above_avg',
        },
        {
          symbol: 'SPY',
          name: 'SPDR S&P 500 ETF',
          price: 603.45,
          change: 2.84,
          changePercent: 0.47,
          dayRange: { low: 600.12, high: 605.21 },
          pivotPoints: { s1: 598, s2: 592, pivot: 602, r1: 608, r2: 614 },
          rsi: 57,
          macdSignal: 'bullish',
          volumeProfile: 'average',
        },
        {
          symbol: 'QQQ',
          name: 'Invesco QQQ Trust',
          price: 521.78,
          change: 4.23,
          changePercent: 0.82,
          dayRange: { low: 516.45, high: 523.12 },
          pivotPoints: { s1: 512, s2: 504, pivot: 518, r1: 526, r2: 534 },
          rsi: 62,
          macdSignal: 'bullish',
          volumeProfile: 'above_avg',
        },
        {
          symbol: 'IWM',
          name: 'iShares Russell 2000 ETF',
          price: 224.56,
          change: -1.23,
          changePercent: -0.54,
          dayRange: { low: 222.34, high: 226.89 },
          pivotPoints: { s1: 220, s2: 216, pivot: 224, r1: 228, r2: 232 },
          rsi: 45,
          macdSignal: 'bearish',
          volumeProfile: 'below_avg',
        },
      ];

      const lottoPlays: LottoPlay[] = [
        {
          symbol: 'SPX 6080C 0DTE',
          underlying: 'SPX',
          underlyingPrice: 6042.12,
          strike: 6080,
          expiry: 'Today',
          type: 'call',
          currentPrice: 0.45,
          estimatedTarget: 2.50,
          potentialReturn: 455,
          setups: [
            { type: 'pin_bar', timeframe: '1h', strength: 78, description: '1H pin bar at 0.5 fib level' },
            { type: 'rsi_divergence', timeframe: '15m', strength: 65, description: 'Bullish RSI divergence on 15m' },
          ],
          overallScore: 72,
          suggestedEntry: 0.40,
          stopLoss: 0.15,
          target1: 1.20,
          target2: 2.50,
          riskReward: '1:5',
          keyLevel: 6020,
          levelType: 'support',
          gammaExposure: 'negative',
          thesis: 'Looking for continuation above R1 with negative gamma flip providing fuel. Entry on any pullback to pivot.',
          confidence: 'medium',
        },
        {
          symbol: 'SPY 608C Weekly',
          underlying: 'SPY',
          underlyingPrice: 603.45,
          strike: 608,
          expiry: 'Fri',
          type: 'call',
          currentPrice: 1.25,
          estimatedTarget: 4.00,
          potentialReturn: 220,
          setups: [
            { type: 'bollinger_squeeze', timeframe: '4h', strength: 82, description: 'Bollinger squeeze on 4H about to expand' },
            { type: 'support_bounce', timeframe: '1h', strength: 70, description: 'Clean bounce off 20 EMA' },
          ],
          overallScore: 76,
          suggestedEntry: 1.10,
          stopLoss: 0.50,
          target1: 2.50,
          target2: 4.00,
          riskReward: '1:4',
          keyLevel: 602,
          levelType: 'pivot',
          gammaExposure: 'positive',
          thesis: 'Volatility compression setup. Expecting expansion move through R1. Weekly expiry gives time for thesis to play out.',
          confidence: 'high',
        },
        {
          symbol: 'QQQ 530C Weekly',
          underlying: 'QQQ',
          underlyingPrice: 521.78,
          strike: 530,
          expiry: 'Fri',
          type: 'call',
          currentPrice: 0.85,
          estimatedTarget: 3.50,
          potentialReturn: 312,
          setups: [
            { type: 'gamma_flip', timeframe: '1h', strength: 75, description: 'Gamma flipping positive at 520' },
            { type: 'rsi_divergence', timeframe: '1h', strength: 68, description: 'Hidden bullish divergence' },
          ],
          overallScore: 71,
          suggestedEntry: 0.75,
          stopLoss: 0.30,
          target1: 1.80,
          target2: 3.50,
          riskReward: '1:4',
          keyLevel: 520,
          levelType: 'support',
          gammaExposure: 'neutral',
          thesis: 'Tech leading today. QQQ showing relative strength. Gamma flip at 520 could accelerate move.',
          confidence: 'medium',
        },
        {
          symbol: 'IWM 220P 0DTE',
          underlying: 'IWM',
          underlyingPrice: 224.56,
          strike: 220,
          expiry: 'Today',
          type: 'put',
          currentPrice: 0.18,
          estimatedTarget: 1.00,
          potentialReturn: 455,
          setups: [
            { type: 'resistance_rejection', timeframe: '15m', strength: 72, description: 'Clean rejection at R1' },
            { type: 'rsi_divergence', timeframe: '15m', strength: 64, description: 'Bearish divergence forming' },
          ],
          overallScore: 68,
          suggestedEntry: 0.15,
          stopLoss: 0.05,
          target1: 0.50,
          target2: 1.00,
          riskReward: '1:6',
          keyLevel: 226,
          levelType: 'resistance',
          gammaExposure: 'negative',
          thesis: 'Small caps lagging. Clear rejection at R1 with bearish MACD. Looking for breakdown to S1.',
          confidence: 'medium',
        },
      ];

      return { indexData, lottoPlays };
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // 1 minute
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
          {isPositive ? '+' : ''}{index.changePercent.toFixed(2)}%
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
              {play.underlying} @ ${play.underlyingPrice.toFixed(2)}
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
            <div className="font-medium text-white">${play.suggestedEntry.toFixed(2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">Stop</div>
            <div className="font-medium text-red-400">${play.stopLoss.toFixed(2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">T1</div>
            <div className="font-medium text-emerald-400">${play.target1.toFixed(2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">T2</div>
            <div className="font-medium text-emerald-400">${play.target2.toFixed(2)}</div>
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
