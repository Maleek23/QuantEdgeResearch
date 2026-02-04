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
import { SPXSessionTimer } from "./spx-session-timer";

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

// ORB (Opening Range Breakout) Types
interface OpeningRange {
  symbol: string;
  date: string;
  timeframe: '15min' | '30min' | '60min';
  high: number;
  low: number;
  rangeWidth: number;
  rangeWidthPct: number;
  isValid: boolean;
}

interface ORBBreakout {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  breakoutType: '0DTE' | 'SWING';
  timeframe: '15min' | '30min' | '60min';
  breakoutPrice: number;
  currentPrice: number;
  rangeHigh: number;
  rangeLow: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskReward: string;
  suggestedStrike: number;
  suggestedExpiry: string;
  optionType: 'call' | 'put';
  confidence: number;
  volumeScore: number;
  flowScore: number;
  patternScore: number;
  mlScore: number;
  vix: number;
  sessionPhase: string;
  gammaZone: 'positive' | 'negative' | 'neutral';
  signals: string[];
  thesis: string;
  timestamp: string;
}

interface ORBScanResult {
  timestamp: string;
  sessionPhase: string;
  vix: number;
  ranges: OpeningRange[];
  breakouts: ORBBreakout[];
  pendingSetups: {
    symbol: string;
    timeframe: string;
    rangeHigh: number;
    rangeLow: number;
    distanceToHigh: number;
    distanceToLow: number;
    bias: 'bullish' | 'bearish' | 'neutral';
  }[];
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

// Fetch ORB scanner data
function useORBScanner() {
  return useQuery<ORBScanResult>({
    queryKey: ['/api/scanner/orb'],
    queryFn: async () => {
      const res = await fetch('/api/scanner/orb');
      if (!res.ok) {
        throw new Error('Failed to fetch ORB data');
      }
      return res.json();
    },
    staleTime: 15 * 1000, // 15 seconds - needs to be fresh for breakouts
    gcTime: 60 * 1000,
    refetchInterval: 30 * 1000, // Refresh every 30 seconds
    retry: 1,
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

// ORB Breakout Card Component
function ORBBreakoutCard({ breakout }: { breakout: ORBBreakout }) {
  const isLong = breakout.direction === 'LONG';
  const confidenceColor = breakout.confidence >= 70
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    : breakout.confidence >= 55
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-red-400 bg-red-500/10 border-red-500/30';

  return (
    <Card className="bg-gradient-to-br from-slate-900/80 to-slate-800/50 border-amber-500/30 hover:border-amber-400/50 transition-all">
      <CardContent className="p-4">
        {/* Header with ORB Badge */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">
                ORB {breakout.timeframe}
              </Badge>
              <span className="text-lg font-bold text-white">{breakout.symbol}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={cn(
                "text-[10px]",
                isLong ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"
              )}>
                {isLong ? '📈 CALL' : '📉 PUT'}
              </Badge>
              <span className="text-xs text-slate-400">{breakout.breakoutType}</span>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline" className={cn("text-xs", confidenceColor)}>
              {breakout.confidence}%
            </Badge>
          </div>
        </div>

        {/* Range Visualization */}
        <div className="mb-3 p-2 bg-slate-800/50 rounded-lg">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-red-400">Low: ${safeToFixed(breakout.rangeLow, 2)}</span>
            <span className="text-amber-400">Range</span>
            <span className="text-emerald-400">High: ${safeToFixed(breakout.rangeHigh, 2)}</span>
          </div>
          <div className="relative h-2 bg-slate-700 rounded overflow-hidden">
            <div
              className={cn(
                "absolute h-full",
                isLong ? "bg-emerald-500 right-0" : "bg-red-500 left-0"
              )}
              style={{ width: '30%' }}
            />
          </div>
          <div className="text-center text-xs text-slate-400 mt-1">
            Current: ${safeToFixed(breakout.currentPrice, 2)}
          </div>
        </div>

        {/* Intelligence Scores */}
        <div className="grid grid-cols-4 gap-1 mb-3 text-[10px]">
          <div className="text-center p-1 bg-slate-800/30 rounded">
            <div className="text-slate-500">VOL</div>
            <div className={cn("font-medium", breakout.volumeScore >= 70 ? "text-emerald-400" : "text-slate-300")}>
              {breakout.volumeScore}
            </div>
          </div>
          <div className="text-center p-1 bg-slate-800/30 rounded">
            <div className="text-slate-500">FLOW</div>
            <div className={cn("font-medium", breakout.flowScore >= 70 ? "text-emerald-400" : "text-slate-300")}>
              {breakout.flowScore}
            </div>
          </div>
          <div className="text-center p-1 bg-slate-800/30 rounded">
            <div className="text-slate-500">PTRN</div>
            <div className={cn("font-medium", breakout.patternScore >= 70 ? "text-emerald-400" : "text-slate-300")}>
              {breakout.patternScore}
            </div>
          </div>
          <div className="text-center p-1 bg-slate-800/30 rounded">
            <div className="text-slate-500">ML</div>
            <div className={cn("font-medium", breakout.mlScore >= 70 ? "text-emerald-400" : "text-slate-300")}>
              {breakout.mlScore}
            </div>
          </div>
        </div>

        {/* Trade Setup */}
        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">Entry</div>
            <div className="font-medium text-white">${safeToFixed(breakout.entry, 2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">Stop</div>
            <div className="font-medium text-red-400">${safeToFixed(breakout.stop, 2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">T1</div>
            <div className="font-medium text-emerald-400">${safeToFixed(breakout.target1, 2)}</div>
          </div>
          <div className="text-center p-1.5 bg-slate-800/50 rounded">
            <div className="text-slate-500">T2</div>
            <div className="font-medium text-emerald-400">${safeToFixed(breakout.target2, 2)}</div>
          </div>
        </div>

        {/* Option Suggestion */}
        <div className="flex items-center justify-between p-2 bg-cyan-500/10 border border-cyan-500/20 rounded mb-2">
          <span className="text-xs text-cyan-300">Suggested:</span>
          <span className="text-xs font-medium text-white">
            ${breakout.suggestedStrike} {breakout.optionType.toUpperCase()} {breakout.suggestedExpiry}
          </span>
        </div>

        {/* Thesis */}
        <p className="text-xs text-slate-400 line-clamp-2 mb-2">{breakout.thesis}</p>

        {/* Signals */}
        <div className="flex flex-wrap gap-1">
          {breakout.signals.slice(0, 3).map((signal, i) => (
            <Badge key={i} variant="outline" className="text-[9px] text-cyan-400 border-cyan-500/30">
              {signal}
            </Badge>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-700">
          <span className="text-xs text-slate-400">R:R {breakout.riskReward}</span>
          <span className="text-xs text-slate-500">VIX: {safeToFixed(breakout.vix, 1)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ORB Range Display Component
function ORBRangeDisplay({ ranges, pendingSetups }: { ranges: OpeningRange[]; pendingSetups: ORBScanResult['pendingSetups'] }) {
  if (ranges.length === 0 && pendingSetups.length === 0) {
    return (
      <div className="text-center py-4 text-slate-400 text-sm">
        Waiting for opening range to form (9:45 AM ET)...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {pendingSetups.map((setup, i) => (
        <div key={i} className="p-3 bg-slate-800/30 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-white">{setup.symbol}</span>
            <Badge variant="outline" className={cn(
              "text-[10px]",
              setup.bias === 'bullish' ? "text-emerald-400 border-emerald-500/30" :
              setup.bias === 'bearish' ? "text-red-400 border-red-500/30" :
              "text-slate-400 border-slate-500/30"
            )}>
              {setup.bias}
            </Badge>
          </div>
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-emerald-400">↑ High:</span>
              <span className="text-white">${safeToFixed(setup.rangeHigh, 2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-400">↓ Low:</span>
              <span className="text-white">${safeToFixed(setup.rangeLow, 2)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>To break ↑:</span>
              <span>{safeToFixed(setup.distanceToHigh, 2)}%</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>To break ↓:</span>
              <span>{safeToFixed(setup.distanceToLow, 2)}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Main Component
export function IndexLottoScanner({ className }: { className?: string }) {
  const { data, isLoading, error } = useIndexLottoScanner();
  const { data: orbData, isLoading: orbLoading } = useORBScanner();
  const [selectedIndex, setSelectedIndex] = useState<string>('all');
  const [selectedPlay, setSelectedPlay] = useState<LottoPlay | null>(null);
  const [activeTab, setActiveTab] = useState<'orb' | 'lotto'>('orb');

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
        {/* SPX Session Timer - Critical for 0DTE trading */}
        <SPXSessionTimer
          vix={orbData?.vix || 18}
          spxPrice={data.indexData.find(i => i.symbol === 'SPX')?.price}
          gammaFlip={data.indexData.find(i => i.symbol === 'SPX')?.pivotPoints?.pivot}
          className="mb-2"
        />

        {/* Strategy Selector: ORB vs Lotto */}
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'orb' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('orb')}
            className={cn(
              "flex-1",
              activeTab === 'orb'
                ? "bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30"
                : "text-slate-400 border-slate-600"
            )}
          >
            <Target className="h-4 w-4 mr-2" />
            ORB Breakouts
            {orbData?.breakouts?.length ? (
              <Badge className="ml-2 bg-amber-500/30 text-amber-300 text-[10px]">
                {orbData.breakouts.length}
              </Badge>
            ) : null}
          </Button>
          <Button
            variant={activeTab === 'lotto' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('lotto')}
            className={cn(
              "flex-1",
              activeTab === 'lotto'
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/30"
                : "text-slate-400 border-slate-600"
            )}
          >
            <Flame className="h-4 w-4 mr-2" />
            Lotto Plays
            <Badge className="ml-2 bg-cyan-500/30 text-cyan-300 text-[10px]">
              {filteredPlays.length}
            </Badge>
          </Button>
        </div>

        {/* Index Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {data.indexData.map((index) => (
            <IndexOverviewCard key={index.symbol} index={index} />
          ))}
        </div>

        {/* ORB Content */}
        {activeTab === 'orb' && (
          <div className="space-y-4">
            {/* ORB Status */}
            {orbData && (
              <div className="flex items-center justify-between p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-amber-400" />
                  <span className="text-xs text-amber-300">
                    Session: {orbData.sessionPhase?.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  VIX: {safeToFixed(orbData.vix, 1)}
                </span>
              </div>
            )}

            {/* Pending Setups (ranges waiting for breakout) */}
            {orbData?.pendingSetups && orbData.pendingSetups.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-400" />
                  Pending Breakouts ({orbData.pendingSetups.length})
                </h3>
                <ORBRangeDisplay
                  ranges={orbData.ranges || []}
                  pendingSetups={orbData.pendingSetups}
                />
              </div>
            )}

            {/* Active Breakouts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  ORB Breakouts ({orbData?.breakouts?.length || 0})
                </h3>
                <span className="text-xs text-slate-400">
                  Volume + Flow + Pattern + ML
                </span>
              </div>

              {orbLoading ? (
                <div className="h-32 bg-slate-800/50 rounded-lg animate-pulse" />
              ) : orbData?.breakouts && orbData.breakouts.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {orbData.breakouts
                    .sort((a, b) => b.confidence - a.confidence)
                    .map((breakout) => (
                      <ORBBreakoutCard key={breakout.id} breakout={breakout} />
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active ORB breakouts</p>
                  <p className="text-xs mt-1">Waiting for clean breaks above/below opening range</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lotto Content */}
        {activeTab === 'lotto' && (
          <div className="space-y-4">
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

              {filteredPlays.length > 0 ? (
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
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Flame className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No lotto plays for {selectedIndex}</p>
                </div>
              )}
            </div>
          </div>
        )}

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
