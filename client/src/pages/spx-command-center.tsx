/**
 * SPX Command Center
 * ==================
 * Dedicated 0DTE / index options trading page.
 * Aggregates ORB Scanner, Session Scanner, Lotto Plays, and key levels
 * into a single view designed for intraday SPX trading.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  Clock,
  Activity,
  BarChart3,
  Flame,
  Shield,
  Brain,
  ChevronRight,
  Eye,
  Crosshair,
  Layers,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  Gauge,
  LineChart,
  BarChart2,
  Globe,
  Scale,
} from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";
import { SPXSessionTimer } from "@/components/spx-session-timer";
import { useLocation } from "wouter";

// ── Types (reused from index-lotto-scanner) ─────────────────────────────

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

interface LottoPlay {
  symbol: string;
  underlying: string;
  underlyingPrice: number;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  currentPrice: number;
  estimatedTarget: number;
  potentialReturn: number;
  setups: { type: string; timeframe: string; strength: number; description: string }[];
  overallScore: number;
  suggestedEntry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskReward: string;
  keyLevel: number;
  levelType: string;
  gammaExposure: 'positive' | 'negative' | 'neutral';
  thesis: string;
  confidence: 'low' | 'medium' | 'high';
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

interface SessionSignal {
  id: string;
  symbol: string;
  strategy: string;
  direction: 'long' | 'short';
  confidence: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  entry: number;
  stop: number;
  target: number;
  optionType: 'call' | 'put';
  suggestedStrike: number;
  suggestedExpiry: string;
  thesis: string;
  timestamp: string;
}

interface SessionLevels {
  vwap: number;
  hod: number;
  lod: number;
  gammaStrikes: number[];
  pivotPoint: number;
}

interface SPXDashboardData {
  timestamp: string;
  orbScanner: {
    isActive: boolean;
    lastScanTime: string;
    breakouts: ORBBreakout[];
    ranges: OpeningRange[];
  };
  sessionScanner: {
    signals: SessionSignal[];
    levels: SessionLevels | null;
  };
  indexData: IndexData[];
  lottoPlays: LottoPlay[];
  todayIdeas: any[];
  todayIdeasCount: number;
}

// ── Intelligence Types ────────────────────────────────────────────────

interface IntelPCRByStrike {
  strike: number;
  callVolume: number;
  putVolume: number;
  callOI: number;
  putOI: number;
  pcr: number;
}

interface IntelPCR {
  byStrike: IntelPCRByStrike[];
  overallPCR: number;
  oiWeightedPCR: number;
  totalCallVolume: number;
  totalPutVolume: number;
  totalCallOI: number;
  totalPutOI: number;
  interpretation: 'bullish' | 'bearish' | 'neutral';
}

interface IntelGEX {
  flipPoint: number | null;
  maxGammaStrike: number;
  spotPrice: number;
  totalNetGEX: number;
  topLevels: Array<{ strike: number; netGEX: number; type: 'support' | 'resistance' | 'magnet' }>;
}

interface IntelIVSkew {
  atmIV: number;
  atmStrike: number;
  put25dIV: number;
  call25dIV: number;
  skew: number;
  skewRatio: number;
  interpretation: string;
}

interface IntelVIXRegime {
  level: number;
  regime: string;
  percentile: number;
  tradingImplication: string;
  optionsStrategy: string;
}

interface IntelVIX {
  vix: number;
  vix20dAvg: number;
  regime: IntelVIXRegime;
  termStructure: 'contango' | 'flat' | 'backwardation';
  termSpread: number;
  tradingImplication: string;
}

interface IntelMacro {
  spy: { price: number; change: number; changePct: number };
  tlt: { price: number; change: number; changePct: number };
  uup: { price: number; change: number; changePct: number };
  gld: { price: number; change: number; changePct: number };
  bondEquityRelation: 'flight_to_safety' | 'risk_on' | 'mixed';
  dollarPressure: 'headwind' | 'tailwind' | 'neutral';
  regime: 'risk_on' | 'risk_off' | 'mixed';
}

interface IntelVWAP {
  vwap: number;
  upper1: number;
  lower1: number;
  upper2: number;
  lower2: number;
  currentPrice: number;
  distancePct: number;
  position: string;
}

interface IntelVolumeDelta {
  cumulativeDelta: number;
  deltaDirection: 'buying' | 'selling' | 'neutral';
  divergence: boolean;
  barsAnalyzed: number;
  note: string;
}

interface IntelUnifiedScore {
  score: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  topSignals: string[];
  thesis: string;
}

interface IntelExpectedMove {
  dailyMove: number;
  dailyMovePct: number;
  weeklyMove: number;
  weeklyMovePct: number;
  upperTarget: number;
  lowerTarget: number;
  spotPrice: number;
}

interface IntelMomentum {
  regime: 'momentum_bullish' | 'momentum_bearish' | 'mean_reversion' | 'mixed';
  rsi: number;
  emaAlignment: 'bullish' | 'bearish' | 'neutral';
  slope5d: number;
  confidence: number;
  tradingAdvice: string;
}

interface SPXIntelligenceData {
  timestamp: string;
  marketOpen: boolean;
  pcr: IntelPCR | null;
  gex: IntelGEX | null;
  ivSkew: IntelIVSkew | null;
  vixRegime: IntelVIX | null;
  macro: IntelMacro | null;
  vwap: IntelVWAP | null;
  volumeDelta: IntelVolumeDelta | null;
  expectedMove: IntelExpectedMove | null;
  momentum: IntelMomentum | null;
  unifiedScore: IntelUnifiedScore | null;
}

// ── Data Hooks ──────────────────────────────────────────────────────────

function useSPXIntelligence() {
  return useQuery<SPXIntelligenceData>({
    queryKey: ['/api/spx/intelligence'],
    queryFn: async () => {
      const res = await fetch('/api/spx/intelligence', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch intelligence data');
      return res.json();
    },
    staleTime: 30_000,
    gcTime: 120_000,
    refetchInterval: 60_000, // Match backend 60s compute cycle
  });
}

function useSPXDashboard() {
  return useQuery<SPXDashboardData>({
    queryKey: ['/api/spx/dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/spx/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch SPX dashboard');
      return res.json();
    },
    staleTime: 15_000,
    gcTime: 60_000,
    refetchInterval: 20_000,
  });
}

// ── Sub Components ──────────────────────────────────────────────────────

function ScannerStatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn(
        "w-2 h-2 rounded-full",
        active
          ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse"
          : "bg-slate-600"
      )} />
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="text-center px-3">
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
      <div className={cn("text-lg font-bold font-mono", color || "text-white")}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

// ── ORB Breakout Card ───────────────────────────────────────────────────

function ORBBreakoutCard({ breakout }: { breakout: ORBBreakout }) {
  const isLong = breakout.direction === 'LONG';
  return (
    <Card className="bg-slate-900/60 border-slate-800/50 hover:border-cyan-500/20 transition-all">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono text-white">{breakout.symbol}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold",
              isLong ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"
            )}>
              {breakout.direction}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
              {breakout.timeframe}
            </Badge>
          </div>
          <Badge variant="outline" className={cn(
            "text-[10px] font-bold",
            breakout.breakoutType === '0DTE' ? "border-amber-500/30 text-amber-400" : "border-blue-500/30 text-blue-400"
          )}>
            {breakout.breakoutType}
          </Badge>
        </div>

        {/* Confidence + Scores */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                breakout.confidence >= 75 ? "bg-emerald-500" : breakout.confidence >= 60 ? "bg-cyan-500" : "bg-amber-500"
              )}
              style={{ width: `${breakout.confidence}%` }}
            />
          </div>
          <span className="text-[10px] font-bold font-mono text-slate-300">{breakout.confidence}%</span>
        </div>

        <div className="grid grid-cols-4 gap-1 text-[10px]">
          <div className="text-center">
            <div className="text-slate-500">VOL</div>
            <div className="font-bold text-white">{breakout.volumeScore}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-500">FLOW</div>
            <div className="font-bold text-white">{breakout.flowScore}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-500">PATTERN</div>
            <div className="font-bold text-white">{breakout.patternScore}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-500">ML</div>
            <div className="font-bold text-white">{breakout.mlScore}</div>
          </div>
        </div>

        {/* Levels */}
        <div className="grid grid-cols-3 gap-2 text-[10px] pt-1 border-t border-slate-800/50">
          <div>
            <div className="text-slate-500">ENTRY</div>
            <div className="font-mono font-bold text-cyan-400">${safeToFixed(breakout.entry, 2)}</div>
          </div>
          <div>
            <div className="text-slate-500">STOP</div>
            <div className="font-mono font-bold text-red-400">${safeToFixed(breakout.stop, 2)}</div>
          </div>
          <div>
            <div className="text-slate-500">TARGET</div>
            <div className="font-mono font-bold text-emerald-400">${safeToFixed(breakout.target1, 2)}</div>
          </div>
        </div>

        {/* Option suggestion */}
        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          <Crosshair className="w-3 h-3" />
          {breakout.optionType?.toUpperCase()} ${breakout.suggestedStrike} {breakout.suggestedExpiry}
          <span className="ml-auto text-slate-500">R:R {breakout.riskReward}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Session Signal Card ─────────────────────────────────────────────────

function SessionSignalCard({ signal }: { signal: SessionSignal }) {
  const isLong = signal.direction === 'long';
  const urgencyColors = {
    HIGH: 'border-red-500/30 text-red-400 bg-red-500/5',
    MEDIUM: 'border-amber-500/30 text-amber-400 bg-amber-500/5',
    LOW: 'border-slate-600 text-slate-400 bg-slate-800/30',
  };
  const strategyLabels: Record<string, string> = {
    VWAP_BOUNCE: 'VWAP Bounce',
    VWAP_REJECTION: 'VWAP Reject',
    LUNCH_REVERSAL: 'Lunch Reversal',
    GAMMA_PIN: 'Gamma Pin',
    THETA_DECAY: 'Theta Decay',
    POWER_HOUR: 'Power Hour',
    HOD_RETEST: 'HOD Retest',
    LOD_RETEST: 'LOD Retest',
  };

  return (
    <Card className={cn(
      "bg-slate-900/60 border-slate-800/50 hover:border-cyan-500/20 transition-all",
      signal.urgency === 'HIGH' && "border-red-500/15"
    )}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono text-white">{signal.symbol}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold",
              isLong ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"
            )}>
              {isLong ? 'LONG' : 'SHORT'}
            </Badge>
          </div>
          <Badge className={cn("text-[10px] font-bold", urgencyColors[signal.urgency])}>
            {signal.urgency}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-cyan-500/20 text-cyan-400">
            {strategyLabels[signal.strategy] || signal.strategy}
          </Badge>
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                signal.confidence >= 75 ? "bg-emerald-500" : signal.confidence >= 60 ? "bg-cyan-500" : "bg-amber-500"
              )}
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
          <span className="text-[10px] font-bold font-mono text-slate-300">{signal.confidence}%</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <div className="text-slate-500">ENTRY</div>
            <div className="font-mono font-bold text-cyan-400">${safeToFixed(signal.entry, 2)}</div>
          </div>
          <div>
            <div className="text-slate-500">STOP</div>
            <div className="font-mono font-bold text-red-400">${safeToFixed(signal.stop, 2)}</div>
          </div>
          <div>
            <div className="text-slate-500">TARGET</div>
            <div className="font-mono font-bold text-emerald-400">${safeToFixed(signal.target, 2)}</div>
          </div>
        </div>

        {signal.thesis && (
          <p className="text-[10px] text-slate-400 leading-relaxed">{signal.thesis}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Key Levels Panel ────────────────────────────────────────────────────

function KeyLevelsPanel({ levels, spxPrice }: { levels: SessionLevels | null; spxPrice?: number }) {
  if (!levels) {
    return (
      <Card className="bg-slate-900/60 border-slate-800/50">
        <CardContent className="p-4 text-center text-slate-500 text-sm">
          Levels load during market hours
        </CardContent>
      </Card>
    );
  }

  const levelItems = [
    { label: 'VWAP', value: levels.vwap, color: 'text-cyan-400' },
    { label: 'HOD', value: levels.hod, color: 'text-emerald-400' },
    { label: 'LOD', value: levels.lod, color: 'text-red-400' },
    { label: 'PIVOT', value: levels.pivotPoint, color: 'text-amber-400' },
  ];

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Key Levels
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-1.5">
        {levelItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-1 border-b border-slate-800/30 last:border-0">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{item.label}</span>
            <span className={cn("text-sm font-bold font-mono", item.color)}>
              {item.value ? `$${safeToFixed(item.value, 2)}` : '--'}
            </span>
          </div>
        ))}
        {levels.gammaStrikes?.length > 0 && (
          <div className="pt-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">GAMMA STRIKES</div>
            <div className="flex flex-wrap gap-1">
              {levels.gammaStrikes.slice(0, 6).map((strike: number) => (
                <span key={strike} className="text-[10px] font-mono font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
                  {strike}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Lotto Card ──────────────────────────────────────────────────────────

function LottoCard({ play }: { play: LottoPlay }) {
  const isCall = play.type === 'call';
  return (
    <Card className="bg-slate-900/60 border-slate-800/50 hover:border-cyan-500/20 transition-all">
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold font-mono text-white">{play.underlying}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold",
              isCall ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"
            )}>
              {play.type.toUpperCase()} ${play.strike}
            </Badge>
          </div>
          <Badge variant="outline" className={cn(
            "text-[10px] font-bold",
            play.confidence === 'high' ? "border-emerald-500/30 text-emerald-400"
              : play.confidence === 'medium' ? "border-cyan-500/30 text-cyan-400"
              : "border-slate-600 text-slate-400"
          )}>
            {play.confidence.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500">Score: <span className="text-white font-bold">{play.overallScore}/100</span></span>
          <span className="text-emerald-400 font-bold">+{safeToFixed(play.potentialReturn, 0)}% potential</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <div className="text-slate-500">ENTRY</div>
            <div className="font-mono font-bold text-cyan-400">${safeToFixed(play.suggestedEntry, 2)}</div>
          </div>
          <div>
            <div className="text-slate-500">STOP</div>
            <div className="font-mono font-bold text-red-400">${safeToFixed(play.stopLoss, 2)}</div>
          </div>
          <div>
            <div className="text-slate-500">TARGET</div>
            <div className="font-mono font-bold text-emerald-400">${safeToFixed(play.target1, 2)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Today's SPX Ideas Table ─────────────────────────────────────────────

function TodayIdeasSection({ ideas }: { ideas: any[] }) {
  const [, setLocation] = useLocation();
  if (!ideas || ideas.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        No SPX ideas generated today yet. Scanners produce signals during market hours.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {ideas.slice(0, 15).map((idea: any, idx: number) => (
        <div
          key={idea.id || idx}
          className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
          onClick={() => idea.symbol && setLocation(`/stock/${idea.symbol}`)}
        >
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold min-w-[40px] justify-center",
              idea.direction === 'long' || idea.direction === 'bullish'
                ? "border-emerald-500/30 text-emerald-400"
                : "border-red-500/30 text-red-400"
            )}>
              {idea.direction === 'long' || idea.direction === 'bullish' ? 'LONG' : 'SHORT'}
            </Badge>
            <span className="text-sm font-bold font-mono text-white">{idea.symbol}</span>
            {idea.optionType && (
              <span className="text-[10px] text-slate-400">
                {idea.optionType.toUpperCase()} ${idea.strikePrice} {idea.expiryDate?.slice(5)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-slate-500">{idea.source}</span>
            <div className="flex items-center gap-1">
              <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    idea.confidenceScore >= 75 ? "bg-emerald-500" : idea.confidenceScore >= 60 ? "bg-cyan-500" : "bg-amber-500"
                  )}
                  style={{ width: `${idea.confidenceScore || 0}%` }}
                />
              </div>
              <span className="text-[10px] font-bold font-mono text-slate-300">{idea.confidenceScore || 0}%</span>
            </div>
            {idea.outcomeStatus && idea.outcomeStatus !== 'open' && (
              <Badge variant="outline" className={cn(
                "text-[9px]",
                idea.outcomeStatus === 'hit_target' ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"
              )}>
                {idea.outcomeStatus.replace('_', ' ')}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// INTELLIGENCE TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function UnifiedScoreCard({ score }: { score: IntelUnifiedScore | null }) {
  if (!score) return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardContent className="p-4 text-center text-slate-500 text-sm">Computing score...</CardContent>
    </Card>
  );

  const scoreColor = score.direction === 'bullish' ? 'text-emerald-400' : score.direction === 'bearish' ? 'text-red-400' : 'text-slate-300';
  const bgGlow = score.direction === 'bullish' ? 'shadow-emerald-500/5' : score.direction === 'bearish' ? 'shadow-red-500/5' : '';
  const DirIcon = score.direction === 'bullish' ? ArrowUpRight : score.direction === 'bearish' ? ArrowDownRight : Activity;

  return (
    <Card className={cn("bg-slate-900/60 border-slate-800/50", bgGlow)}>
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5" /> Unified Score
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn("text-4xl font-black font-mono", scoreColor)}>{score.score}</div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <DirIcon className={cn("w-4 h-4", scoreColor)} />
              <span className={cn("text-sm font-bold uppercase", scoreColor)}>{score.direction}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    score.confidence >= 70 ? "bg-emerald-500" : score.confidence >= 50 ? "bg-cyan-500" : "bg-amber-500"
                  )}
                  style={{ width: `${score.confidence}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-slate-400">{score.confidence}%</span>
            </div>
          </div>
        </div>
        {score.topSignals && score.topSignals.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {score.topSignals.map((s, i) => (
              <Badge key={i} variant="outline" className="text-[9px] border-cyan-500/20 text-cyan-400 bg-cyan-500/5">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VIXCard({ vix }: { vix: IntelVIX | null }) {
  if (!vix) return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardContent className="p-4 text-center text-slate-500 text-sm">Loading VIX...</CardContent>
    </Card>
  );

  const vixColor = vix.vix >= 30 ? 'text-red-400' : vix.vix >= 20 ? 'text-amber-400' : vix.vix >= 15 ? 'text-slate-300' : 'text-emerald-400';
  const termColor = vix.termStructure === 'backwardation' ? 'text-red-400' : vix.termStructure === 'contango' ? 'text-emerald-400' : 'text-slate-400';

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> VIX Regime
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn("text-3xl font-black font-mono", vixColor)}>{safeToFixed(vix.vix, 1)}</div>
          <div className="space-y-0.5">
            <Badge variant="outline" className={cn("text-[10px] font-bold", vixColor)}>
              {vix.regime?.regime?.replace(/_/g, ' ').toUpperCase() || 'N/A'}
            </Badge>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500">20d avg:</span>
              <span className="text-[10px] font-mono text-slate-300">{safeToFixed(vix.vix20dAvg, 1)}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className="text-slate-500">Term Structure:</span>
          <Badge variant="outline" className={cn("text-[10px] font-bold", termColor)}>
            {vix.termStructure?.toUpperCase()} ({vix.termSpread >= 0 ? '+' : ''}{safeToFixed(vix.termSpread, 1)}%)
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function GEXCard({ gex }: { gex: IntelGEX | null }) {
  if (!gex) return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardContent className="p-4 text-center text-slate-500 text-sm">Loading GEX...</CardContent>
    </Card>
  );

  const aboveFlip = gex.flipPoint && gex.spotPrice > gex.flipPoint;

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> GEX Flip
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-500">Flip Point</div>
            <div className="text-xl font-black font-mono text-violet-400">
              {gex.flipPoint ? `$${safeToFixed(gex.flipPoint, 0)}` : 'N/A'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-500">Spot</div>
            <div className="text-sm font-mono text-white">${safeToFixed(gex.spotPrice, 2)}</div>
            <Badge variant="outline" className={cn(
              "text-[9px] font-bold mt-0.5",
              aboveFlip ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"
            )}>
              {aboveFlip ? 'ABOVE (SUPPORT)' : 'BELOW (RESISTANCE)'}
            </Badge>
          </div>
        </div>
        {gex.topLevels && gex.topLevels.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-slate-800/50">
            {gex.topLevels.slice(0, 4).map((level, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-white font-bold">${level.strike}</span>
                <Badge variant="outline" className={cn(
                  "text-[9px]",
                  level.type === 'support' ? "border-emerald-500/20 text-emerald-400" :
                  level.type === 'resistance' ? "border-red-500/20 text-red-400" :
                  "border-violet-500/20 text-violet-400"
                )}>
                  {level.type.toUpperCase()}
                </Badge>
                <span className="font-mono text-slate-400">{safeToFixed(level.netGEX, 1)}B</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PCRCard({ pcr }: { pcr: IntelPCR | null }) {
  if (!pcr) return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardContent className="p-4 text-center text-slate-500 text-sm">Loading PCR...</CardContent>
    </Card>
  );

  const pcrColor = pcr.interpretation === 'bullish' ? 'text-emerald-400' : pcr.interpretation === 'bearish' ? 'text-red-400' : 'text-slate-300';

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5" /> Put/Call Ratio
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn("text-3xl font-black font-mono", pcrColor)}>{safeToFixed(pcr.overallPCR, 2)}</div>
          <div className="space-y-0.5">
            <Badge variant="outline" className={cn("text-[10px] font-bold", pcrColor)}>
              {pcr.interpretation.toUpperCase()}
            </Badge>
            <div className="text-[10px] text-slate-500">
              OI-Weighted: <span className="text-white font-mono">{safeToFixed(pcr.oiWeightedPCR, 2)}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded px-2 py-1">
            <div className="text-slate-500">Call Vol</div>
            <div className="font-mono font-bold text-emerald-400">{(pcr.totalCallVolume / 1000).toFixed(0)}K</div>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded px-2 py-1">
            <div className="text-slate-500">Put Vol</div>
            <div className="font-mono font-bold text-red-400">{(pcr.totalPutVolume / 1000).toFixed(0)}K</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpectedMoveCard({ expectedMove }: { expectedMove: IntelExpectedMove | null }) {
  if (!expectedMove) return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardContent className="p-4 text-center text-slate-500 text-sm">Loading Expected Move...</CardContent>
    </Card>
  );

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Expected Move
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-black font-mono text-amber-400">±${safeToFixed(expectedMove.dailyMove, 2)}</div>
          <div className="space-y-0.5">
            <Badge variant="outline" className="text-[10px] font-bold border-amber-500/20 text-amber-300">
              {safeToFixed(expectedMove.dailyMovePct, 2)}% daily
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded px-2 py-1">
            <div className="text-slate-500">Upper</div>
            <div className="font-mono font-bold text-emerald-400">${safeToFixed(expectedMove.upperTarget, 2)}</div>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded px-2 py-1">
            <div className="text-slate-500">Lower</div>
            <div className="font-mono font-bold text-red-400">${safeToFixed(expectedMove.lowerTarget, 2)}</div>
          </div>
        </div>
        <div className="mt-1.5 text-[10px] text-slate-500">
          Weekly: <span className="font-mono text-white">±${safeToFixed(expectedMove.weeklyMove, 2)}</span> ({safeToFixed(expectedMove.weeklyMovePct, 2)}%)
        </div>
      </CardContent>
    </Card>
  );
}

function MomentumCard({ momentum }: { momentum: IntelMomentum | null }) {
  if (!momentum) return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardContent className="p-4 text-center text-slate-500 text-sm">Loading Momentum...</CardContent>
    </Card>
  );

  const regimeColors: Record<string, string> = {
    'momentum_bullish': 'text-emerald-400',
    'momentum_bearish': 'text-red-400',
    'mean_reversion': 'text-amber-400',
    'mixed': 'text-slate-300',
  };
  const regimeLabels: Record<string, string> = {
    'momentum_bullish': 'TREND ↑',
    'momentum_bearish': 'TREND ↓',
    'mean_reversion': 'REVERSION',
    'mixed': 'MIXED',
  };
  const regimeBgColors: Record<string, string> = {
    'momentum_bullish': 'border-emerald-500/20',
    'momentum_bearish': 'border-red-500/20',
    'mean_reversion': 'border-amber-500/20',
    'mixed': 'border-slate-500/20',
  };

  const color = regimeColors[momentum.regime] || 'text-slate-300';
  const label = regimeLabels[momentum.regime] || momentum.regime;
  const bgColor = regimeBgColors[momentum.regime] || 'border-slate-500/20';

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5" /> Momentum
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={cn("text-sm font-black px-3 py-1", color, bgColor)}>
            {label}
          </Badge>
          <div className="text-[10px] text-slate-400">
            {momentum.confidence}% conf
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
          <div className="bg-slate-800/50 rounded px-2 py-1">
            <div className="text-slate-500">RSI</div>
            <div className={cn("font-mono font-bold", momentum.rsi > 70 ? 'text-red-400' : momentum.rsi < 30 ? 'text-emerald-400' : 'text-white')}>
              {safeToFixed(momentum.rsi, 1)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded px-2 py-1">
            <div className="text-slate-500">EMA</div>
            <div className={cn("font-mono font-bold", momentum.emaAlignment === 'bullish' ? 'text-emerald-400' : momentum.emaAlignment === 'bearish' ? 'text-red-400' : 'text-slate-300')}>
              {momentum.emaAlignment.toUpperCase()}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded px-2 py-1">
            <div className="text-slate-500">Slope</div>
            <div className={cn("font-mono font-bold", momentum.slope5d > 0 ? 'text-emerald-400' : momentum.slope5d < 0 ? 'text-red-400' : 'text-slate-300')}>
              {momentum.slope5d > 0 ? '+' : ''}{safeToFixed(momentum.slope5d, 3)}%
            </div>
          </div>
        </div>
        <div className="mt-1.5 text-[10px] text-slate-400 italic line-clamp-2">
          {momentum.tradingAdvice}
        </div>
      </CardContent>
    </Card>
  );
}

function PCRHeatmap({ pcr }: { pcr: IntelPCR | null }) {
  if (!pcr || !pcr.byStrike || pcr.byStrike.length === 0) return null;

  // Show top 15 strikes by total volume
  const sorted = [...pcr.byStrike]
    .sort((a, b) => (b.callVolume + b.putVolume) - (a.callVolume + a.putVolume))
    .slice(0, 15)
    .sort((a, b) => a.strike - b.strike);

  const maxVol = Math.max(...sorted.map(s => Math.max(s.callVolume, s.putVolume)));

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" /> PCR by Strike
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-1">
          <div className="grid grid-cols-[60px_1fr_1fr_50px] gap-1 text-[9px] text-slate-500 font-bold uppercase tracking-widest pb-1 border-b border-slate-800/50">
            <span>Strike</span>
            <span className="text-right">Calls</span>
            <span>Puts</span>
            <span className="text-right">PCR</span>
          </div>
          {sorted.map((s) => {
            const callPct = maxVol > 0 ? (s.callVolume / maxVol) * 100 : 0;
            const putPct = maxVol > 0 ? (s.putVolume / maxVol) * 100 : 0;
            const pcrVal = s.pcr;
            const pcrColor = pcrVal > 1.5 ? 'text-red-400' : pcrVal > 0.7 ? 'text-slate-300' : 'text-emerald-400';

            return (
              <div key={s.strike} className="grid grid-cols-[60px_1fr_1fr_50px] gap-1 items-center text-[10px]">
                <span className="font-mono font-bold text-white">${s.strike}</span>
                <div className="flex justify-end">
                  <div className="h-3 rounded-sm bg-emerald-500/30" style={{ width: `${callPct}%`, minWidth: callPct > 0 ? '2px' : '0' }} />
                </div>
                <div className="flex justify-start">
                  <div className="h-3 rounded-sm bg-red-500/30" style={{ width: `${putPct}%`, minWidth: putPct > 0 ? '2px' : '0' }} />
                </div>
                <span className={cn("font-mono text-right", pcrColor)}>{safeToFixed(pcrVal, 2)}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function IVSkewPanel({ ivSkew }: { ivSkew: IntelIVSkew | null }) {
  if (!ivSkew) return null;

  const skewColor = ivSkew.skew > 5 ? 'text-red-400' : ivSkew.skew > 2 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <LineChart className="w-3.5 h-3.5" /> IV Skew
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="bg-red-500/5 border border-red-500/10 rounded px-2 py-1.5 text-center">
            <div className="text-slate-500 mb-0.5">25Δ Put IV</div>
            <div className="font-mono font-bold text-red-400">{safeToFixed(ivSkew.put25dIV, 1)}%</div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1.5 text-center">
            <div className="text-slate-500 mb-0.5">ATM IV</div>
            <div className="font-mono font-bold text-white">{safeToFixed(ivSkew.atmIV, 1)}%</div>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded px-2 py-1.5 text-center">
            <div className="text-slate-500 mb-0.5">25Δ Call IV</div>
            <div className="font-mono font-bold text-emerald-400">{safeToFixed(ivSkew.call25dIV, 1)}%</div>
          </div>
        </div>

        {/* Visual skew bar */}
        <div className="relative h-6 bg-slate-800 rounded-full overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn("text-[10px] font-bold font-mono z-10", skewColor)}>
              Skew: {ivSkew.skew >= 0 ? '+' : ''}{safeToFixed(ivSkew.skew, 1)}
            </span>
          </div>
          <div
            className="h-full bg-gradient-to-r from-red-500/20 to-transparent"
            style={{ width: `${Math.min(100, 50 + ivSkew.skew * 3)}%` }}
          />
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">{ivSkew.interpretation}</p>
      </CardContent>
    </Card>
  );
}

function VWAPPanel({ vwap }: { vwap: IntelVWAP | null }) {
  if (!vwap) return null;

  const posColor = vwap.position.includes('above') ? 'text-emerald-400' : vwap.position.includes('below') ? 'text-red-400' : 'text-cyan-400';

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5" /> VWAP Bands
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {/* VWAP levels display */}
        <div className="space-y-1 text-[10px]">
          {[
            { label: '+2σ', value: vwap.upper2, color: 'text-red-400/60' },
            { label: '+1σ', value: vwap.upper1, color: 'text-amber-400/60' },
            { label: 'VWAP', value: vwap.vwap, color: 'text-cyan-400' },
            { label: '-1σ', value: vwap.lower1, color: 'text-amber-400/60' },
            { label: '-2σ', value: vwap.lower2, color: 'text-red-400/60' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-0.5">
              <span className="text-slate-500 font-bold">{item.label}</span>
              <div className="flex-1 mx-2 border-b border-dashed border-slate-800" />
              <span className={cn("font-mono font-bold", item.color)}>${safeToFixed(item.value, 2)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-800/50">
          <div className="text-[10px]">
            <span className="text-slate-500">Price: </span>
            <span className="font-mono font-bold text-white">${safeToFixed(vwap.currentPrice, 2)}</span>
          </div>
          <Badge variant="outline" className={cn("text-[9px] font-bold", posColor)}>
            {vwap.position.replace(/_/g, ' ').toUpperCase()} ({vwap.distancePct >= 0 ? '+' : ''}{safeToFixed(vwap.distancePct, 2)}%)
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function MacroPanel({ macro }: { macro: IntelMacro | null }) {
  if (!macro) return null;

  const regimeColor = macro.regime === 'risk_on' ? 'text-emerald-400' : macro.regime === 'risk_off' ? 'text-red-400' : 'text-amber-400';
  const assets = [
    { label: 'SPY', ...macro.spy },
    { label: 'TLT', ...macro.tlt },
    { label: 'UUP', ...macro.uup },
    { label: 'GLD', ...macro.gld },
  ];

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> Macro Context
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={cn("text-[10px] font-bold", regimeColor)}>
            {macro.regime.replace(/_/g, ' ').toUpperCase()}
          </Badge>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-slate-500">Bond:</span>
            <span className={cn("font-bold",
              macro.bondEquityRelation === 'flight_to_safety' ? 'text-red-400' :
              macro.bondEquityRelation === 'risk_on' ? 'text-emerald-400' : 'text-slate-400'
            )}>
              {macro.bondEquityRelation.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {assets.map((a) => {
            const isPositive = a.changePct >= 0;
            return (
              <div key={a.label} className="bg-slate-800/30 rounded px-2 py-1.5 text-center">
                <div className="text-[9px] text-slate-500 font-bold">{a.label}</div>
                <div className={cn(
                  "text-[11px] font-bold font-mono",
                  isPositive ? "text-emerald-400" : "text-red-400"
                )}>
                  {isPositive ? '+' : ''}{safeToFixed(a.changePct, 2)}%
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/50">
          <span className="text-slate-500">Dollar Pressure:</span>
          <Badge variant="outline" className={cn("text-[9px] font-bold",
            macro.dollarPressure === 'headwind' ? 'border-red-500/20 text-red-400' :
            macro.dollarPressure === 'tailwind' ? 'border-emerald-500/20 text-emerald-400' :
            'border-slate-600 text-slate-400'
          )}>
            {macro.dollarPressure.toUpperCase()}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function VolumeDeltaPanel({ volumeDelta }: { volumeDelta: IntelVolumeDelta | null }) {
  if (!volumeDelta) return null;

  const dirColor = volumeDelta.deltaDirection === 'buying' ? 'text-emerald-400' : volumeDelta.deltaDirection === 'selling' ? 'text-red-400' : 'text-slate-400';

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Volume Delta
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className={cn("text-2xl font-black font-mono", dirColor)}>
            {volumeDelta.cumulativeDelta >= 0 ? '+' : ''}{(volumeDelta.cumulativeDelta / 1_000_000).toFixed(1)}M
          </div>
          <div className="space-y-0.5">
            <Badge variant="outline" className={cn("text-[10px] font-bold", dirColor)}>
              {volumeDelta.deltaDirection.toUpperCase()}
            </Badge>
            {volumeDelta.divergence && (
              <Badge variant="outline" className="text-[9px] font-bold border-amber-500/20 text-amber-400 bg-amber-500/5">
                DIVERGENCE
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/50">
          <span className="text-slate-500">Bars analyzed: {volumeDelta.barsAnalyzed}</span>
          <span className="text-slate-600 italic">{volumeDelta.note}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function IntelligenceTab() {
  const { data: intel, isLoading } = useSPXIntelligence();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Brain className="w-10 h-10 text-cyan-500/50 mx-auto animate-pulse" />
          <div className="text-sm text-slate-400">Computing institutional signals...</div>
        </div>
      </div>
    );
  }

  if (!intel) {
    return (
      <div className="text-center py-16 space-y-2">
        <Brain className="w-10 h-10 text-slate-700 mx-auto" />
        <div className="text-sm text-slate-500">Intelligence service warming up</div>
        <div className="text-[10px] text-slate-600">Signals computed every 60 seconds during market hours</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Signal Cards (3 across top) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <UnifiedScoreCard score={intel.unifiedScore} />
        <ExpectedMoveCard expectedMove={intel.expectedMove} />
        <MomentumCard momentum={intel.momentum} />
      </div>

      {/* Row 2: Secondary Signal Cards (4 across) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <VIXCard vix={intel.vixRegime} />
        <GEXCard gex={intel.gex} />
        <PCRCard pcr={intel.pcr} />
        {intel.ivSkew && (
          <Card className="bg-slate-900/60 border-slate-800/50">
            <CardHeader className="pb-1 px-4 pt-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <LineChart className="w-3.5 h-3.5" /> IV Skew
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex items-center gap-3">
                <div className={cn("text-2xl font-black font-mono", intel.ivSkew.skew > 5 ? 'text-red-400' : intel.ivSkew.skew < -2 ? 'text-amber-400' : 'text-slate-200')}>
                  {safeToFixed(intel.ivSkew.skew, 1)}
                </div>
                <div className="text-[10px] text-slate-400">skew pts</div>
              </div>
              <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
                <div className="bg-slate-800/50 rounded px-2 py-1">
                  <div className="text-slate-500">ATM</div>
                  <div className="font-mono font-bold text-white">{safeToFixed(intel.ivSkew.atmIV, 1)}%</div>
                </div>
                <div className="bg-red-500/5 border border-red-500/10 rounded px-2 py-1">
                  <div className="text-slate-500">Put 25δ</div>
                  <div className="font-mono font-bold text-red-400">{safeToFixed(intel.ivSkew.put25dIV, 1)}%</div>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded px-2 py-1">
                  <div className="text-slate-500">Call 25δ</div>
                  <div className="font-mono font-bold text-emerald-400">{safeToFixed(intel.ivSkew.call25dIV, 1)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Row 2: Detailed Panels (2 columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: PCR Heatmap + IV Skew */}
        <div className="space-y-3">
          <PCRHeatmap pcr={intel.pcr} />
          <IVSkewPanel ivSkew={intel.ivSkew} />
        </div>

        {/* Right: VWAP + Macro + Volume Delta */}
        <div className="space-y-3">
          <VWAPPanel vwap={intel.vwap} />
          <MacroPanel macro={intel.macro} />
          <VolumeDeltaPanel volumeDelta={intel.volumeDelta} />
        </div>
      </div>

      {/* Bottom: Unified thesis */}
      {intel.unifiedScore?.thesis && (
        <Card className="bg-slate-900/40 border-slate-800/50">
          <CardContent className="px-4 py-3">
            <div className="flex items-start gap-2">
              <Brain className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Institutional Thesis</div>
                <p className="text-sm text-slate-300 leading-relaxed">{intel.unifiedScore.thesis}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data freshness indicator */}
      <div className="flex items-center justify-between text-[10px] text-slate-600 px-1">
        <span>Last computed: {new Date(intel.timestamp).toLocaleTimeString()}</span>
        <span>Market: {intel.marketOpen ? '🟢 OPEN' : '🔴 CLOSED'}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════

export default function SPXCommandCenter() {
  const { data, isLoading, error } = useSPXDashboard();
  const [orbTimeframe, setOrbTimeframe] = useState<string>('all');
  const [lottoFilter, setLottoFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('scanners');

  const spxData = data?.indexData?.find((d: IndexData) => d.symbol === 'SPX');
  const vix = data?.orbScanner?.breakouts?.[0]?.vix || 18;
  const gammaFlip = spxData?.pivotPoints?.pivot;

  // Filter ORB breakouts by timeframe
  const filteredBreakouts = data?.orbScanner?.breakouts?.filter(
    (b: ORBBreakout) => orbTimeframe === 'all' || b.timeframe === orbTimeframe
  ) || [];

  // Filter lotto plays
  const filteredLottos = data?.lottoPlays?.filter(
    (p: LottoPlay) => lottoFilter === 'all' || p.underlying === lottoFilter
  ) || [];

  // Group session signals by strategy
  const sessionSignals = data?.sessionScanner?.signals || [];
  const sortedSignals = [...sessionSignals].sort((a: SessionSignal, b: SessionSignal) => {
    const urgencyOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
  });

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 font-mono">0DTE // LIVE</div>
            <h1 className="text-2xl font-bold text-white tracking-tight">SPX Command Center</h1>
          </div>
          <div className="flex items-center gap-4">
            <ScannerStatusDot active={data?.orbScanner?.isActive || false} label="ORB" />
            <ScannerStatusDot active={(sessionSignals.length > 0)} label="Session" />
            <div className="h-4 w-px bg-slate-800" />
            <StatBox label="VIX" value={safeToFixed(vix, 1)} color={vix >= 25 ? "text-red-400" : vix >= 18 ? "text-amber-400" : "text-emerald-400"} />
            <StatBox label="SPX" value={spxData ? `$${safeToFixed(spxData.price, 2)}` : '--'} sub={spxData ? `${spxData.changePercent >= 0 ? '+' : ''}${safeToFixed(spxData.changePercent, 2)}%` : undefined} />
            <StatBox label="Signals" value={String(data?.todayIdeasCount || 0)} color="text-cyan-400" />
          </div>
        </div>

        {/* ── Session Timer ──────────────────────────────────────── */}
        <SPXSessionTimer
          vix={vix}
          spxPrice={spxData?.price}
          gammaFlip={gammaFlip}
        />

        {/* ── Tab Navigation ─────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-900/60 border border-slate-800/50 p-0.5">
            <TabsTrigger
              value="scanners"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400 text-xs font-bold gap-1.5"
            >
              <Radio className="w-3.5 h-3.5" /> Scanners
            </TabsTrigger>
            <TabsTrigger
              value="intelligence"
              className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400 text-slate-400 text-xs font-bold gap-1.5"
            >
              <Brain className="w-3.5 h-3.5" /> Intelligence
            </TabsTrigger>
          </TabsList>

          {/* ── Scanners Tab ───────────────────────────────────────── */}
          <TabsContent value="scanners" className="mt-4">

        {/* ── Main 3-Column Content ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* LEFT: ORB Breakouts (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <Card className="bg-slate-900/40 border-slate-800/50">
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" /> ORB Breakouts
                    {filteredBreakouts.length > 0 && (
                      <Badge className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {filteredBreakouts.length}
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex gap-1">
                    {['all', '15min', '30min', '60min'].map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setOrbTimeframe(tf)}
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded transition-colors",
                          orbTimeframe === tf
                            ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                            : "text-slate-500 hover:text-white"
                        )}
                      >
                        {tf === 'all' ? 'ALL' : tf.replace('min', 'M')}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {isLoading ? (
                  <div className="text-center py-8 text-slate-500 text-sm animate-pulse">Loading ORB data...</div>
                ) : filteredBreakouts.length === 0 ? (
                  <div className="text-center py-8">
                    <Crosshair className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <div className="text-sm text-slate-500">No active breakouts</div>
                    <div className="text-[10px] text-slate-600 mt-1">Opening ranges form 9:30-10:30 AM ET</div>
                  </div>
                ) : (
                  filteredBreakouts.map((b: ORBBreakout) => <ORBBreakoutCard key={b.id} breakout={b} />)
                )}

                {/* Pending Setups */}
                {data?.orbScanner?.ranges && data.orbScanner.ranges.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/50">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Opening Ranges Forming
                    </div>
                    {data.orbScanner.ranges.filter((r: OpeningRange) => r.isValid).map((range: OpeningRange) => (
                      <div key={`${range.symbol}-${range.timeframe}`} className="flex items-center justify-between py-1 text-[10px]">
                        <span className="font-mono font-bold text-white">{range.symbol}</span>
                        <span className="text-slate-400">{range.timeframe}</span>
                        <span className="font-mono text-emerald-400">${safeToFixed(range.high, 2)}</span>
                        <span className="font-mono text-red-400">${safeToFixed(range.low, 2)}</span>
                        <span className="text-slate-500">{safeToFixed(range.rangeWidthPct, 2)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* CENTER: Session Signals (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <Card className="bg-slate-900/40 border-slate-800/50">
              <CardHeader className="pb-2 px-4 pt-3">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-cyan-400" /> Session Signals
                  {sortedSignals.length > 0 && (
                    <Badge className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {sortedSignals.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {isLoading ? (
                  <div className="text-center py-8 text-slate-500 text-sm animate-pulse">Loading signals...</div>
                ) : sortedSignals.length === 0 ? (
                  <div className="text-center py-8">
                    <Radio className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <div className="text-sm text-slate-500">No active session signals</div>
                    <div className="text-[10px] text-slate-600 mt-1">VWAP, Gamma, Power Hour detected live</div>
                  </div>
                ) : (
                  sortedSignals.map((s: SessionSignal) => <SessionSignalCard key={s.id} signal={s} />)
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Levels + Lotto (3 cols) */}
          <div className="lg:col-span-3 space-y-3">
            <KeyLevelsPanel levels={data?.sessionScanner?.levels || null} spxPrice={spxData?.price} />

            <Card className="bg-slate-900/40 border-slate-800/50">
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-orange-400" /> Lotto Plays
                  </CardTitle>
                  <div className="flex gap-1">
                    {['all', 'SPX', 'SPY', 'QQQ', 'IWM'].map((sym) => (
                      <button
                        key={sym}
                        onClick={() => setLottoFilter(sym)}
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors",
                          lottoFilter === sym
                            ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                            : "text-slate-500 hover:text-white"
                        )}
                      >
                        {sym === 'all' ? 'ALL' : sym}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {filteredLottos.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 text-[10px]">No lotto plays detected</div>
                ) : (
                  filteredLottos.slice(0, 5).map((p: LottoPlay, i: number) => <LottoCard key={i} play={p} />)
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Bottom: Today's SPX Ideas ──────────────────────────── */}
        <Card className="bg-slate-900/40 border-slate-800/50">
          <CardHeader className="pb-2 px-4 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-violet-400" /> Today's SPX Ideas
                <Badge className="text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  {data?.todayIdeasCount || 0}
                </Badge>
              </CardTitle>
              <a href="/trade-desk" className="text-[10px] text-cyan-400 hover:text-white transition-colors flex items-center gap-0.5">
                Trade Desk <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <TodayIdeasSection ideas={data?.todayIdeas || []} />
          </CardContent>
        </Card>

          </TabsContent>

          {/* ── Intelligence Tab ────────────────────────────────────── */}
          <TabsContent value="intelligence" className="mt-4">
            <IntelligenceTab />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
