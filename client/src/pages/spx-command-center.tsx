/**
 * SPX Command Center
 * ==================
 * Dedicated 0DTE / index options trading page.
 * Aggregates ORB Scanner, Session Scanner, Lotto Plays, and key levels
 * into a single view designed for intraday SPX trading.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
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
  Star,
  RefreshCw,
} from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
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
  direction: 'LONG' | 'SHORT' | 'long' | 'short';
  confidence: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  entry: number;
  stop: number;
  target?: number;
  target1?: number;
  target2?: number;
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
  gammaLevels?: number[];
  gammaStrikes?: number[];
  pivotHigh?: number;
  pivotLow?: number;
  pivotPoint?: number;
}

interface SwingSignalDetail {
  name: string;
  triggered: boolean;
  detail: string;
  direction: 'PUT' | 'CALL' | 'NEUTRAL';
}

interface SwingAlert {
  id: string;
  symbol: string;
  direction: 'PUT' | 'CALL';
  score: number;
  scoreLabel: 'FIRE' | 'STRONG' | 'WATCH';
  level: number;
  levelName: string;
  signals: SwingSignalDetail[];
  suggestedStrike: number;
  suggestedExpiry: string;
  estimatedCost: string;
  targetLevel: number;
  stopLevel: number;
  currentPrice: number;
  timestamp: string;
  expiresAt: string;
}

interface SwingCatcherData {
  isActive: boolean;
  lastScan: string | null;
  alertCount: number;
  alerts: SwingAlert[];
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
  swingCatcher?: SwingCatcherData;
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

type IndexSymbol = 'SPY' | 'QQQ' | 'IWM' | 'SPX';

function useSPXIntelligence(symbol: IndexSymbol = 'SPY') {
  return useQuery<SPXIntelligenceData>({
    queryKey: ['/api/spx/intelligence', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/spx/intelligence?symbol=${symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch intelligence data');
      return res.json();
    },
    staleTime: 30_000,
    gcTime: 120_000,
    refetchInterval: 60_000, // Match backend 60s compute cycle
  });
}



function useSPXDashboard(symbol: IndexSymbol | '' = '') {
  return useQuery<SPXDashboardData>({
    queryKey: ['/api/spx/dashboard', symbol],
    queryFn: async () => {
      const url = symbol ? `/api/spx/dashboard?symbol=${symbol}` : '/api/spx/dashboard';
      const res = await fetch(url, { credentials: 'include' });
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
          ? "bg-[var(--trade-bullish)] shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse"
          : "bg-muted"
      )} />
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="text-center px-3">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</div>
      <div className={cn("text-lg font-bold font-mono", color || "text-foreground")}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── ORB Breakout Card ───────────────────────────────────────────────────

function ORBBreakoutCard({ breakout }: { breakout: ORBBreakout }) {
  const isLong = breakout.direction === 'LONG';
  return (
    <Card className="bg-card/60 border-border/50 hover:border-[var(--trade-bullish)]/20 transition-all">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono text-foreground">{breakout.symbol}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold",
              isLong ? "border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]" : "border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]"
            )}>
              {breakout.direction}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
              {breakout.timeframe}
            </Badge>
          </div>
          <Badge variant="outline" className={cn(
            "text-[10px] font-bold",
            breakout.breakoutType === '0DTE' ? "border-[var(--trade-neutral)]/30 text-[var(--trade-neutral)]" : "border-blue-500/30 text-blue-400"
          )}>
            {breakout.breakoutType}
          </Badge>
        </div>

        {/* Confidence + Scores */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                breakout.confidence >= 75 ? "bg-[var(--trade-bullish)]" : breakout.confidence >= 60 ? "bg-cyan-500" : "bg-[var(--trade-neutral)]"
              )}
              style={{ width: `${breakout.confidence}%` }}
            />
          </div>
          <span className="text-[10px] font-bold font-mono text-foreground/80">{breakout.confidence}%</span>
        </div>

        <div className="grid grid-cols-4 gap-1 text-[10px]">
          <div className="text-center">
            <div className="text-muted-foreground">VOL</div>
            <div className="font-bold text-foreground">{breakout.volumeScore}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">FLOW</div>
            <div className="font-bold text-foreground">{breakout.flowScore}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">PATTERN</div>
            <div className="font-bold text-foreground">{breakout.patternScore}</div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground">ML</div>
            <div className="font-bold text-foreground">{breakout.mlScore}</div>
          </div>
        </div>

        {/* Levels */}
        <div className="grid grid-cols-3 gap-2 text-[10px] pt-1 border-t border-border/50">
          <div>
            <div className="text-muted-foreground">ENTRY</div>
            <div className="font-mono font-bold text-[var(--trade-bullish)]">${safeToFixed(breakout.entry, 2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">STOP</div>
            <div className="font-mono font-bold text-[var(--trade-bearish)]">${safeToFixed(breakout.stop, 2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">TARGET</div>
            <div className="font-mono font-bold text-[var(--trade-bullish)]">${safeToFixed(breakout.target1, 2)}</div>
          </div>
        </div>

        {/* Option suggestion */}
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Crosshair className="w-3 h-3" />
          {breakout.optionType?.toUpperCase()} ${breakout.suggestedStrike} {breakout.suggestedExpiry}
          <span className="ml-auto text-muted-foreground">R:R {breakout.riskReward}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Session Signal Card ─────────────────────────────────────────────────

function SessionSignalCard({ signal }: { signal: SessionSignal }) {
  const isLong = signal.direction?.toUpperCase() === 'LONG';
  const urgencyColors = {
    HIGH: 'border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)] bg-[var(--trade-bearish)]/5',
    MEDIUM: 'border-[var(--trade-neutral)]/30 text-[var(--trade-neutral)] bg-[var(--trade-neutral)]/5',
    LOW: 'border-border text-muted-foreground bg-muted/30',
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
      "bg-card/60 border-border/50 hover:border-[var(--trade-bullish)]/20 transition-all",
      signal.urgency === 'HIGH' && "border-[var(--trade-bearish)]/15"
    )}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono text-foreground">{signal.symbol}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold",
              isLong ? "border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]" : "border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]"
            )}>
              {isLong ? 'LONG' : 'SHORT'}
            </Badge>
          </div>
          <Badge className={cn("text-[10px] font-bold", urgencyColors[signal.urgency])}>
            {signal.urgency}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]">
            {strategyLabels[signal.strategy] || signal.strategy}
          </Badge>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                signal.confidence >= 75 ? "bg-[var(--trade-bullish)]" : signal.confidence >= 60 ? "bg-cyan-500" : "bg-[var(--trade-neutral)]"
              )}
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
          <span className="text-[10px] font-bold font-mono text-foreground/80">{signal.confidence}%</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <div className="text-muted-foreground">ENTRY</div>
            <div className="font-mono font-bold text-[var(--trade-bullish)]">${safeToFixed(signal.entry, 2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">STOP</div>
            <div className="font-mono font-bold text-[var(--trade-bearish)]">${safeToFixed(signal.stop, 2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">TARGET</div>
            <div className="font-mono font-bold text-[var(--trade-bullish)]">${safeToFixed(signal.target1 || signal.target || 0, 2)}</div>
          </div>
        </div>

        {signal.thesis && (
          <p className="text-[10px] text-muted-foreground leading-relaxed">{signal.thesis}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Key Levels Panel ────────────────────────────────────────────────────

function KeyLevelsPanel({ levels, spxPrice }: { levels: SessionLevels | null; spxPrice?: number }) {
  if (!levels) {
    return (
      <Card className="bg-card/60 border-border/50">
        <CardContent className="p-4 text-center text-muted-foreground text-sm">
          Levels load during market hours
        </CardContent>
      </Card>
    );
  }

  const levelItems = [
    { label: 'VWAP', value: levels.vwap, color: 'text-[var(--trade-bullish)]' },
    { label: 'HOD', value: levels.hod, color: 'text-[var(--trade-bullish)]' },
    { label: 'LOD', value: levels.lod, color: 'text-[var(--trade-bearish)]' },
    { label: 'PIVOT', value: levels.pivotHigh || levels.pivotPoint, color: 'text-[var(--trade-neutral)]' },
  ];

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Key Levels
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-1.5">
        {levelItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between py-1 border-b border-border/30 last:border-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{item.label}</span>
            <span className={cn("text-sm font-bold font-mono", item.color)}>
              {item.value ? `$${safeToFixed(item.value, 2)}` : '--'}
            </span>
          </div>
        ))}
        {(levels.gammaLevels || levels.gammaStrikes)?.length ? (
          <div className="pt-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">GAMMA STRIKES</div>
            <div className="flex flex-wrap gap-1">
              {(levels.gammaLevels || levels.gammaStrikes || []).slice(0, 6).map((strike: number) => (
                <span key={strike} className="text-[10px] font-mono font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">
                  {strike}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Lotto Card ──────────────────────────────────────────────────────────

function LottoCard({ play }: { play: LottoPlay }) {
  const isCall = play.type === 'call';
  return (
    <Card className="bg-card/60 border-border/50 hover:border-[var(--trade-bullish)]/20 transition-all">
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold font-mono text-foreground">{play.underlying}</span>
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold",
              isCall ? "border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]" : "border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]"
            )}>
              {play.type.toUpperCase()} ${play.strike}
            </Badge>
          </div>
          <Badge variant="outline" className={cn(
            "text-[10px] font-bold",
            play.confidence === 'high' ? "border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]"
              : play.confidence === 'medium' ? "border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]"
              : "border-border text-muted-foreground"
          )}>
            {play.confidence.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Score: <span className="text-foreground font-bold">{play.overallScore}/100</span></span>
          <span className="text-[var(--trade-bullish)] font-bold">+{safeToFixed(play.potentialReturn, 0)}% potential</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <div className="text-muted-foreground">ENTRY</div>
            <div className="font-mono font-bold text-[var(--trade-bullish)]">${safeToFixed(play.suggestedEntry, 2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">STOP</div>
            <div className="font-mono font-bold text-[var(--trade-bearish)]">${safeToFixed(play.stopLoss, 2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">TARGET</div>
            <div className="font-mono font-bold text-[var(--trade-bullish)]">${safeToFixed(play.target1, 2)}</div>
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
      <div className="text-center py-6 text-muted-foreground text-sm">
        No trade ideas generated today yet. Scanners produce signals during market hours.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {ideas.slice(0, 15).map((idea: any, idx: number) => (
        <div
          key={idea.id || idx}
          className="flex items-center justify-between px-3 py-2 rounded-lg bg-card/40 hover:bg-card/60 transition-colors cursor-pointer"
          onClick={() => idea.symbol && setLocation(`/stock/${idea.symbol}`)}
        >
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "text-[10px] font-bold min-w-[40px] justify-center",
              idea.direction?.toUpperCase() === 'LONG' || idea.direction?.toLowerCase() === 'bullish'
                ? "border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]"
                : "border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]"
            )}>
              {idea.direction?.toUpperCase() === 'LONG' || idea.direction?.toLowerCase() === 'bullish' ? 'LONG' : 'SHORT'}
            </Badge>
            <span className="text-sm font-bold font-mono text-foreground">{idea.symbol}</span>
            {idea.optionType && (
              <span className="text-[10px] text-muted-foreground">
                {idea.optionType.toUpperCase()} ${idea.strikePrice} {idea.expiryDate?.slice(5)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-muted-foreground">
              {idea.timestamp ? (() => {
                const mins = Math.floor((Date.now() - new Date(idea.timestamp).getTime()) / 60000);
                if (mins < 1) return 'now';
                if (mins < 60) return `${mins}m`;
                return `${Math.floor(mins / 60)}h`;
              })() : ''} {idea.source}
            </span>
            <div className="flex items-center gap-1">
              <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    idea.confidenceScore >= 75 ? "bg-[var(--trade-bullish)]" : idea.confidenceScore >= 60 ? "bg-cyan-500" : "bg-[var(--trade-neutral)]"
                  )}
                  style={{ width: `${idea.confidenceScore || 0}%` }}
                />
              </div>
              <span className="text-[10px] font-bold font-mono text-foreground/80">{idea.confidenceScore || 0}%</span>
            </div>
            {idea.outcomeStatus && idea.outcomeStatus !== 'open' && (
              <Badge variant="outline" className={cn(
                "text-[9px]",
                idea.outcomeStatus === 'hit_target' ? "border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]" : "border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]"
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
  if (!score) return <IntelSkeletonCard />;

  const scoreColor = score.direction === 'bullish' ? 'text-[var(--trade-bullish)]' : score.direction === 'bearish' ? 'text-[var(--trade-bearish)]' : 'text-foreground/80';
  const bgGlow = score.direction === 'bullish' ? 'shadow-emerald-500/5' : score.direction === 'bearish' ? 'shadow-red-500/5' : '';
  const DirIcon = score.direction === 'bullish' ? ArrowUpRight : score.direction === 'bearish' ? ArrowDownRight : Activity;

  return (
    <Card className={cn("bg-card/60 border-border/50", bgGlow)}>
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5" /> Unified Score
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn("text-4xl font-bold font-mono", scoreColor)}>{score.score}</div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <DirIcon className={cn("w-4 h-4", scoreColor)} />
              <span className={cn("text-sm font-bold uppercase", scoreColor)}>{score.direction}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    score.confidence >= 70 ? "bg-[var(--trade-bullish)]" : score.confidence >= 50 ? "bg-cyan-500" : "bg-[var(--trade-neutral)]"
                  )}
                  style={{ width: `${score.confidence}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{score.confidence}%</span>
            </div>
          </div>
        </div>
        {score.topSignals && score.topSignals.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {score.topSignals.map((s, i) => (
              <Badge key={i} variant="outline" className="text-[9px] border-[var(--trade-bullish)]/20 text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/5">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IntelSkeletonCard() {
  return (
    <Card className="bg-card/60 border-border/50">
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-16" />
        <div className="flex gap-2">
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-10" />
        </div>
      </CardContent>
    </Card>
  );
}

function VIXCard({ vix }: { vix: IntelVIX | null }) {
  if (!vix) return <IntelSkeletonCard />;

  const vixColor = vix.vix >= 30 ? 'text-[var(--trade-bearish)]' : vix.vix >= 20 ? 'text-[var(--trade-neutral)]' : vix.vix >= 15 ? 'text-foreground/80' : 'text-[var(--trade-bullish)]';
  const termColor = vix.termStructure === 'backwardation' ? 'text-[var(--trade-bearish)]' : vix.termStructure === 'contango' ? 'text-[var(--trade-bullish)]' : 'text-muted-foreground';

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> VIX Regime
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn("text-3xl font-bold font-mono", vixColor)}>{safeToFixed(vix.vix, 1)}</div>
          <div className="space-y-0.5">
            <Badge variant="outline" className={cn("text-[10px] font-bold", vixColor)}>
              {vix.regime?.regime?.replace(/_/g, ' ').toUpperCase() || 'N/A'}
            </Badge>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">20d avg:</span>
              <span className="text-[10px] font-mono text-foreground/80">{safeToFixed(vix.vix20dAvg, 1)}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Term Structure:</span>
          <Badge variant="outline" className={cn("text-[10px] font-bold", termColor)}>
            {vix.termStructure?.toUpperCase()} ({vix.termSpread >= 0 ? '+' : ''}{safeToFixed(vix.termSpread, 1)}%)
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function GEXCard({ gex, symbol }: { gex: IntelGEX | null; symbol?: string }) {
  if (!gex) return <IntelSkeletonCard />;

  const aboveFlip = gex.flipPoint && gex.spotPrice > gex.flipPoint;
  const isProxy = symbol === 'SPX';

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> GEX Flip
          {isProxy && <span className="text-[9px] text-muted-foreground/70 normal-case font-normal">(via SPY)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-muted-foreground">Flip Point</div>
            <div className="text-xl font-bold font-mono text-violet-400">
              {gex.flipPoint ? `$${safeToFixed(gex.flipPoint, 0)}` : 'N/A'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground">Spot</div>
            <div className="text-sm font-mono text-foreground">${safeToFixed(gex.spotPrice, 2)}</div>
            <Badge variant="outline" className={cn(
              "text-[9px] font-bold mt-0.5",
              aboveFlip ? "border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)]" : "border-[var(--trade-bearish)]/30 text-[var(--trade-bearish)]"
            )}>
              {aboveFlip ? 'ABOVE (SUPPORT)' : 'BELOW (RESISTANCE)'}
            </Badge>
          </div>
        </div>
        {gex.topLevels && gex.topLevels.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border/50">
            {gex.topLevels.slice(0, 4).map((level, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-foreground font-bold">${level.strike}</span>
                <Badge variant="outline" className={cn(
                  "text-[9px]",
                  level.type === 'support' ? "border-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]" :
                  level.type === 'resistance' ? "border-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]" :
                  "border-violet-500/20 text-violet-400"
                )}>
                  {level.type.toUpperCase()}
                </Badge>
                <span className="font-mono text-muted-foreground">{safeToFixed(level.netGEX, 1)}B</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PCRCard({ pcr, symbol }: { pcr: IntelPCR | null; symbol?: string }) {
  if (!pcr) return <IntelSkeletonCard />;

  const pcrColor = pcr.interpretation === 'bullish' ? 'text-[var(--trade-bullish)]' : pcr.interpretation === 'bearish' ? 'text-[var(--trade-bearish)]' : 'text-foreground/80';
  const hasVolume = pcr.totalCallVolume > 0 || pcr.totalPutVolume > 0;
  const isProxy = symbol === 'SPX';

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Scale className="w-3.5 h-3.5" /> Put/Call Ratio
          {isProxy && <span className="text-[9px] text-muted-foreground/70 normal-case font-normal">(via SPY)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className={cn("text-3xl font-bold font-mono", pcrColor)}>
            {hasVolume ? safeToFixed(pcr.overallPCR, 2) : safeToFixed(pcr.oiWeightedPCR, 2)}
          </div>
          <div className="space-y-0.5">
            <Badge variant="outline" className={cn("text-[10px] font-bold", pcrColor)}>
              {pcr.interpretation.toUpperCase()}
            </Badge>
            <div className="text-[10px] text-muted-foreground">
              {hasVolume ? (
                <>OI-Weighted: <span className="text-foreground font-mono">{safeToFixed(pcr.oiWeightedPCR, 2)}</span></>
              ) : (
                <>Based on OI <span className="text-muted-foreground/70">(mkt closed)</span></>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
          {hasVolume ? (
            <>
              <div className="bg-[var(--trade-bullish)]/5 border border-[var(--trade-bullish)]/10 rounded px-2 py-1">
                <div className="text-muted-foreground">Call Vol</div>
                <div className="font-mono font-bold text-[var(--trade-bullish)]">{(pcr.totalCallVolume / 1000).toFixed(0)}K</div>
              </div>
              <div className="bg-[var(--trade-bearish)]/5 border border-[var(--trade-bearish)]/10 rounded px-2 py-1">
                <div className="text-muted-foreground">Put Vol</div>
                <div className="font-mono font-bold text-[var(--trade-bearish)]">{(pcr.totalPutVolume / 1000).toFixed(0)}K</div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-[var(--trade-bullish)]/5 border border-[var(--trade-bullish)]/10 rounded px-2 py-1">
                <div className="text-muted-foreground">Call OI</div>
                <div className="font-mono font-bold text-[var(--trade-bullish)]">{(pcr.totalCallOI / 1000).toFixed(0)}K</div>
              </div>
              <div className="bg-[var(--trade-bearish)]/5 border border-[var(--trade-bearish)]/10 rounded px-2 py-1">
                <div className="text-muted-foreground">Put OI</div>
                <div className="font-mono font-bold text-[var(--trade-bearish)]">{(pcr.totalPutOI / 1000).toFixed(0)}K</div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExpectedMoveCard({ expectedMove }: { expectedMove: IntelExpectedMove | null }) {
  if (!expectedMove) return <IntelSkeletonCard />;

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Expected Move
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold font-mono text-[var(--trade-neutral)]">±${safeToFixed(expectedMove.dailyMove, 2)}</div>
          <div className="space-y-0.5">
            <Badge variant="outline" className="text-[10px] font-bold border-[var(--trade-neutral)]/20 text-[var(--trade-neutral)]">
              {safeToFixed(expectedMove.dailyMovePct, 2)}% daily
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
          <div className="bg-[var(--trade-bullish)]/5 border border-[var(--trade-bullish)]/10 rounded px-2 py-1">
            <div className="text-muted-foreground">Upper</div>
            <div className="font-mono font-bold text-[var(--trade-bullish)]">${safeToFixed(expectedMove.upperTarget, 2)}</div>
          </div>
          <div className="bg-[var(--trade-bearish)]/5 border border-[var(--trade-bearish)]/10 rounded px-2 py-1">
            <div className="text-muted-foreground">Lower</div>
            <div className="font-mono font-bold text-[var(--trade-bearish)]">${safeToFixed(expectedMove.lowerTarget, 2)}</div>
          </div>
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          Weekly: <span className="font-mono text-foreground">±${safeToFixed(expectedMove.weeklyMove, 2)}</span> ({safeToFixed(expectedMove.weeklyMovePct, 2)}%)
        </div>
      </CardContent>
    </Card>
  );
}

function MomentumCard({ momentum }: { momentum: IntelMomentum | null }) {
  if (!momentum) return <IntelSkeletonCard />;

  const regimeColors: Record<string, string> = {
    'momentum_bullish': 'text-[var(--trade-bullish)]',
    'momentum_bearish': 'text-[var(--trade-bearish)]',
    'mean_reversion': 'text-[var(--trade-neutral)]',
    'mixed': 'text-foreground/80',
  };
  const regimeLabels: Record<string, string> = {
    'momentum_bullish': 'TREND ↑',
    'momentum_bearish': 'TREND ↓',
    'mean_reversion': 'REVERSION',
    'mixed': 'MIXED',
  };
  const regimeBgColors: Record<string, string> = {
    'momentum_bullish': 'border-[var(--trade-bullish)]/20',
    'momentum_bearish': 'border-[var(--trade-bearish)]/20',
    'mean_reversion': 'border-[var(--trade-neutral)]/20',
    'mixed': 'border-muted-foreground/20',
  };

  const color = regimeColors[momentum.regime] || 'text-foreground/80';
  const label = regimeLabels[momentum.regime] || momentum.regime;
  const bgColor = regimeBgColors[momentum.regime] || 'border-muted-foreground/20';

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-1 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5" /> Momentum
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className={cn("text-sm font-bold px-3 py-1", color, bgColor)}>
            {label}
          </Badge>
          <div className="text-[10px] text-muted-foreground">
            {momentum.confidence}% conf
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
          <div className="bg-muted/50 rounded px-2 py-1">
            <div className="text-muted-foreground">RSI</div>
            <div className={cn("font-mono font-bold", momentum.rsi > 70 ? 'text-[var(--trade-bearish)]' : momentum.rsi < 30 ? 'text-[var(--trade-bullish)]' : 'text-foreground')}>
              {safeToFixed(momentum.rsi, 1)}
            </div>
          </div>
          <div className="bg-muted/50 rounded px-2 py-1">
            <div className="text-muted-foreground">EMA</div>
            <div className={cn("font-mono font-bold", momentum.emaAlignment === 'bullish' ? 'text-[var(--trade-bullish)]' : momentum.emaAlignment === 'bearish' ? 'text-[var(--trade-bearish)]' : 'text-foreground/80')}>
              {momentum.emaAlignment.toUpperCase()}
            </div>
          </div>
          <div className="bg-muted/50 rounded px-2 py-1">
            <div className="text-muted-foreground">Slope</div>
            <div className={cn("font-mono font-bold", momentum.slope5d > 0 ? 'text-[var(--trade-bullish)]' : momentum.slope5d < 0 ? 'text-[var(--trade-bearish)]' : 'text-foreground/80')}>
              {momentum.slope5d > 0 ? '+' : ''}{safeToFixed(momentum.slope5d, 3)}%
            </div>
          </div>
        </div>
        <div className="mt-1.5 text-[10px] text-muted-foreground italic line-clamp-2">
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
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" /> PCR by Strike
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-1">
          <div className="grid grid-cols-[60px_1fr_1fr_50px] gap-1 text-[9px] text-muted-foreground font-bold uppercase tracking-widest pb-1 border-b border-border/50">
            <span>Strike</span>
            <span className="text-right">Calls</span>
            <span>Puts</span>
            <span className="text-right">PCR</span>
          </div>
          {sorted.map((s) => {
            const callPct = maxVol > 0 ? (s.callVolume / maxVol) * 100 : 0;
            const putPct = maxVol > 0 ? (s.putVolume / maxVol) * 100 : 0;
            const pcrVal = s.pcr;
            const pcrColor = pcrVal > 1.5 ? 'text-[var(--trade-bearish)]' : pcrVal > 0.7 ? 'text-foreground/80' : 'text-[var(--trade-bullish)]';

            return (
              <div key={s.strike} className="grid grid-cols-[60px_1fr_1fr_50px] gap-1 items-center text-[10px]">
                <span className="font-mono font-bold text-foreground">${s.strike}</span>
                <div className="flex justify-end">
                  <div className="h-3 rounded-sm bg-[var(--trade-bullish)]/30" style={{ width: `${callPct}%`, minWidth: callPct > 0 ? '2px' : '0' }} />
                </div>
                <div className="flex justify-start">
                  <div className="h-3 rounded-sm bg-[var(--trade-bearish)]/30" style={{ width: `${putPct}%`, minWidth: putPct > 0 ? '2px' : '0' }} />
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

  const skewColor = ivSkew.skew > 5 ? 'text-[var(--trade-bearish)]' : ivSkew.skew > 2 ? 'text-[var(--trade-neutral)]' : 'text-[var(--trade-bullish)]';

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <LineChart className="w-3.5 h-3.5" /> IV Skew
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="bg-[var(--trade-bearish)]/5 border border-[var(--trade-bearish)]/10 rounded px-2 py-1.5 text-center">
            <div className="text-muted-foreground mb-0.5">25Δ Put IV</div>
            <div className="font-mono font-bold text-[var(--trade-bearish)]">{safeToFixed(ivSkew.put25dIV, 1)}%</div>
          </div>
          <div className="bg-muted/50 border border-border/50 rounded px-2 py-1.5 text-center">
            <div className="text-muted-foreground mb-0.5">ATM IV</div>
            <div className="font-mono font-bold text-foreground">{safeToFixed(ivSkew.atmIV, 1)}%</div>
          </div>
          <div className="bg-[var(--trade-bullish)]/5 border border-[var(--trade-bullish)]/10 rounded px-2 py-1.5 text-center">
            <div className="text-muted-foreground mb-0.5">25Δ Call IV</div>
            <div className="font-mono font-bold text-[var(--trade-bullish)]">{safeToFixed(ivSkew.call25dIV, 1)}%</div>
          </div>
        </div>

        {/* Visual skew bar */}
        <div className="relative h-6 bg-muted rounded-full overflow-hidden">
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

        <p className="text-[10px] text-muted-foreground leading-relaxed">{ivSkew.interpretation}</p>
      </CardContent>
    </Card>
  );
}

function VWAPPanel({ vwap }: { vwap: IntelVWAP | null }) {
  if (!vwap) return null;

  const posColor = vwap.position.includes('above') ? 'text-[var(--trade-bullish)]' : vwap.position.includes('below') ? 'text-[var(--trade-bearish)]' : 'text-[var(--trade-bullish)]';

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BarChart2 className="w-3.5 h-3.5" /> VWAP Bands
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {/* VWAP levels display */}
        <div className="space-y-1 text-[10px]">
          {[
            { label: '+2σ', value: vwap.upper2, color: 'text-[var(--trade-bearish)]/60' },
            { label: '+1σ', value: vwap.upper1, color: 'text-[var(--trade-neutral)]/60' },
            { label: 'VWAP', value: vwap.vwap, color: 'text-[var(--trade-bullish)]' },
            { label: '-1σ', value: vwap.lower1, color: 'text-[var(--trade-neutral)]/60' },
            { label: '-2σ', value: vwap.lower2, color: 'text-[var(--trade-bearish)]/60' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-0.5">
              <span className="text-muted-foreground font-bold">{item.label}</span>
              <div className="flex-1 mx-2 border-b border-dashed border-border" />
              <span className={cn("font-mono font-bold", item.color)}>${safeToFixed(item.value, 2)}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <div className="text-[10px]">
            <span className="text-muted-foreground">Price: </span>
            <span className="font-mono font-bold text-foreground">${safeToFixed(vwap.currentPrice, 2)}</span>
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

  const regimeColor = macro.regime === 'risk_on' ? 'text-[var(--trade-bullish)]' : macro.regime === 'risk_off' ? 'text-[var(--trade-bearish)]' : 'text-[var(--trade-neutral)]';
  const assets = [
    { label: 'SPY', ...macro.spy },
    { label: 'TLT', ...macro.tlt },
    { label: 'UUP', ...macro.uup },
    { label: 'GLD', ...macro.gld },
  ];

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> Macro Context
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className={cn("text-[10px] font-bold", regimeColor)}>
            {macro.regime.replace(/_/g, ' ').toUpperCase()}
          </Badge>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground">Bond:</span>
            <span className={cn("font-bold",
              macro.bondEquityRelation === 'flight_to_safety' ? 'text-[var(--trade-bearish)]' :
              macro.bondEquityRelation === 'risk_on' ? 'text-[var(--trade-bullish)]' : 'text-muted-foreground'
            )}>
              {macro.bondEquityRelation.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {assets.map((a) => {
            const isPositive = a.changePct >= 0;
            return (
              <div key={a.label} className="bg-muted/30 rounded px-2 py-1.5 text-center">
                <div className="text-[9px] text-muted-foreground font-bold">{a.label}</div>
                <div className={cn(
                  "text-[11px] font-bold font-mono",
                  isPositive ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                )}>
                  {isPositive ? '+' : ''}{safeToFixed(a.changePct, 2)}%
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/50">
          <span className="text-muted-foreground">Dollar Pressure:</span>
          <Badge variant="outline" className={cn("text-[9px] font-bold",
            macro.dollarPressure === 'headwind' ? 'border-[var(--trade-bearish)]/20 text-[var(--trade-bearish)]' :
            macro.dollarPressure === 'tailwind' ? 'border-[var(--trade-bullish)]/20 text-[var(--trade-bullish)]' :
            'border-border text-muted-foreground'
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

  const dirColor = volumeDelta.deltaDirection === 'buying' ? 'text-[var(--trade-bullish)]' : volumeDelta.deltaDirection === 'selling' ? 'text-[var(--trade-bearish)]' : 'text-muted-foreground';

  return (
    <Card className="bg-card/60 border-border/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Volume Delta
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        <div className="flex items-center gap-3">
          <div className={cn("text-2xl font-bold font-mono", dirColor)}>
            {volumeDelta.cumulativeDelta >= 0 ? '+' : ''}{(volumeDelta.cumulativeDelta / 1_000_000).toFixed(1)}M
          </div>
          <div className="space-y-0.5">
            <Badge variant="outline" className={cn("text-[10px] font-bold", dirColor)}>
              {volumeDelta.deltaDirection.toUpperCase()}
            </Badge>
            {volumeDelta.divergence && (
              <Badge variant="outline" className="text-[9px] font-bold border-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] bg-[var(--trade-neutral)]/5">
                DIVERGENCE
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/50">
          <span className="text-muted-foreground">Bars analyzed: {volumeDelta.barsAnalyzed}</span>
          <span className="text-muted-foreground/70 italic">{volumeDelta.note}</span>
        </div>
      </CardContent>
    </Card>
  );
}


function IntelligenceTab({ symbol }: { symbol: IndexSymbol }) {
  const { data: intel, isLoading } = useSPXIntelligence(symbol);

  if (isLoading || !intel) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <IntelSkeletonCard />
          <IntelSkeletonCard />
          <IntelSkeletonCard />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <IntelSkeletonCard />
          <IntelSkeletonCard />
          <IntelSkeletonCard />
          <IntelSkeletonCard />
        </div>
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
        <GEXCard gex={intel.gex} symbol={symbol} />
        <PCRCard pcr={intel.pcr} symbol={symbol} />
        {intel.ivSkew && (
          <Card className="bg-card/60 border-border/50">
            <CardHeader className="pb-1 px-4 pt-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <LineChart className="w-3.5 h-3.5" /> IV Skew
                {symbol === 'SPX' && <span className="text-[9px] text-muted-foreground/70 normal-case font-normal">(via SPY)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex items-center gap-3">
                <div className={cn("text-2xl font-bold font-mono", intel.ivSkew.skew > 5 ? 'text-[var(--trade-bearish)]' : intel.ivSkew.skew < -2 ? 'text-[var(--trade-neutral)]' : 'text-foreground/90')}>
                  {safeToFixed(intel.ivSkew.skew, 1)}
                </div>
                <div className="text-[10px] text-muted-foreground">skew pts</div>
              </div>
              <div className="grid grid-cols-3 gap-1 mt-2 text-[10px]">
                <div className="bg-muted/50 rounded px-2 py-1">
                  <div className="text-muted-foreground">ATM</div>
                  <div className="font-mono font-bold text-foreground">{safeToFixed(intel.ivSkew.atmIV, 1)}%</div>
                </div>
                <div className="bg-[var(--trade-bearish)]/5 border border-[var(--trade-bearish)]/10 rounded px-2 py-1">
                  <div className="text-muted-foreground">Put 25δ</div>
                  <div className="font-mono font-bold text-[var(--trade-bearish)]">{safeToFixed(intel.ivSkew.put25dIV, 1)}%</div>
                </div>
                <div className="bg-[var(--trade-bullish)]/5 border border-[var(--trade-bullish)]/10 rounded px-2 py-1">
                  <div className="text-muted-foreground">Call 25δ</div>
                  <div className="font-mono font-bold text-[var(--trade-bullish)]">{safeToFixed(intel.ivSkew.call25dIV, 1)}%</div>
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
        <Card className="bg-card/40 border-border/50">
          <CardContent className="px-4 py-3">
            <div className="flex items-start gap-2">
              <Brain className="w-4 h-4 text-[var(--trade-bullish)] mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Institutional Thesis</div>
                <p className="text-sm text-foreground/80 leading-relaxed">{intel.unifiedScore.thesis}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data freshness indicator */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 px-1">
        <span>Last computed: {new Date(intel.timestamp).toLocaleTimeString()}</span>
        <span className="flex items-center gap-1">Market: {intel.marketOpen ? <><span className="w-2 h-2 rounded-full bg-[var(--trade-bullish)] inline-block" /> OPEN</> : <><span className="w-2 h-2 rounded-full bg-[var(--trade-bearish)] inline-block" /> CLOSED</>}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════

const SYMBOL_COLORS: Record<IndexSymbol, { active: string; ring: string; bg: string }> = {
  SPY: { active: 'bg-cyan-500/15 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/30', ring: 'ring-cyan-500/30', bg: 'bg-cyan-500' },
  QQQ: { active: 'bg-violet-500/15 text-violet-400 border-violet-500/30', ring: 'ring-violet-500/30', bg: 'bg-violet-500' },
  IWM: { active: 'bg-[var(--trade-neutral)]/15 text-[var(--trade-neutral)] border-[var(--trade-neutral)]/30', ring: 'ring-amber-500/30', bg: 'bg-[var(--trade-neutral)]' },
  SPX: { active: 'bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/30', ring: 'ring-emerald-500/30', bg: 'bg-[var(--trade-bullish)]' },
};

export default function SPXCommandCenter() {
  const [activeSymbol, setActiveSymbol] = useState<IndexSymbol>('SPY');
  const { data, isLoading, error } = useSPXDashboard(activeSymbol);
  const { data: intelData } = useSPXIntelligence(activeSymbol);
  const [orbTimeframe, setOrbTimeframe] = useState<string>('all');
  // lottoFilter removed — top-level symbol selector filters dashboard data

  // Default to Intelligence tab when market is closed (scanners have no data)
  const marketOpen = intelData?.marketOpen ?? false;
  const [activeTab, setActiveTab] = useState<string>('intelligence');
  const hasAutoSwitched = useRef(false);

  // Auto-switch to scanners tab once we confirm market is open
  useEffect(() => {
    if (marketOpen && !hasAutoSwitched.current) {
      hasAutoSwitched.current = true;
      setActiveTab('scanners');
    }
  }, [marketOpen]);

  // Find matching index data for header display
  const symbolData = data?.indexData?.find((d: IndexData) => d.symbol === activeSymbol);
  const spyFallback = data?.indexData?.find((d: IndexData) => d.symbol === 'SPY');
  const primaryIndex = symbolData || spyFallback;
  // Use real VIX from intelligence data, fall back to breakout data, then default
  const vix = intelData?.vixRegime?.vix ?? data?.orbScanner?.breakouts?.[0]?.vix ?? 0;
  // Spot price from intelligence GEX, or from index data
  const spotPrice = intelData?.gex?.spotPrice ?? primaryIndex?.price;
  const gammaFlip = intelData?.gex?.flipPoint ?? primaryIndex?.pivotPoints?.pivot;

  // Filter ORB breakouts by timeframe
  const filteredBreakouts = data?.orbScanner?.breakouts?.filter(
    (b: ORBBreakout) => orbTimeframe === 'all' || b.timeframe === orbTimeframe
  ) || [];

  // Lotto plays — already filtered by symbol from API
  const filteredLottos = data?.lottoPlays || [];

  // Group session signals by strategy
  const sessionSignals = data?.sessionScanner?.signals || [];
  const sortedSignals = [...sessionSignals].sort((a: SessionSignal, b: SessionSignal) => {
    const urgencyOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (urgencyOrder[a.urgency] || 2) - (urgencyOrder[b.urgency] || 2);
  });

  // Swing Catcher alerts
  const swingCatcher = data?.swingCatcher;
  const swingAlerts = swingCatcher?.alerts || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground font-mono">0DTE // LIVE</div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Index Command Center</h1>
            <div className="text-[10px] text-muted-foreground mt-0.5">SPY &middot; QQQ &middot; IWM &middot; SPX</div>
          </div>
          <div className="flex items-center gap-4">
            <ScannerStatusDot active={data?.orbScanner?.isActive || false} label="ORB" />
            <ScannerStatusDot active={(sessionSignals.length > 0)} label="Session" />
            <div className="h-4 w-px bg-muted" />
            <StatBox label="VIX" value={vix > 0 ? safeToFixed(vix, 1) : '--'} color={vix >= 25 ? "text-[var(--trade-bearish)]" : vix >= 18 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bullish)]"} />
            <StatBox label={activeSymbol} value={spotPrice ? `$${safeToFixed(spotPrice, 2)}` : (primaryIndex ? `$${safeToFixed(primaryIndex.price, 2)}` : '--')} sub={primaryIndex ? `${primaryIndex.changePercent >= 0 ? '+' : ''}${safeToFixed(primaryIndex.changePercent, 2)}%` : undefined} />
            <StatBox label="Signals" value={String(data?.todayIdeasCount || 0)} color="text-[var(--trade-bullish)]" />
          </div>
        </div>

        {/* ── Session Timer ──────────────────────────────────────── */}
        <SPXSessionTimer
          vix={vix}
          spxPrice={spotPrice ?? primaryIndex?.price}
          gammaFlip={gammaFlip}
        />

        {/* ── Symbol Selector ────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">INDEX</span>
          <div className="flex gap-1">
            {(['SPY', 'QQQ', 'IWM', 'SPX'] as IndexSymbol[]).map((sym) => {
              const isActive = activeSymbol === sym;
              const colors = SYMBOL_COLORS[sym];
              return (
                <button
                  key={sym}
                  onClick={() => setActiveSymbol(sym)}
                  className={cn(
                    "text-xs font-bold px-3 py-1.5 rounded-lg border transition-all duration-200",
                    isActive
                      ? colors.active
                      : "border-border/50 text-muted-foreground hover:text-white/80 hover:border-border"
                  )}
                >
                  {sym}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tab Navigation ─────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-card/60 border border-border/50 p-0.5">
            <TabsTrigger
              value="scanners"
              className="data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground text-xs font-bold gap-1.5"
            >
              <Radio className="w-3.5 h-3.5" /> Scanners
            </TabsTrigger>
            <TabsTrigger
              value="intelligence"
              className="data-[state=active]:bg-[var(--trade-bullish)]/10 data-[state=active]:text-[var(--trade-bullish)] text-muted-foreground text-xs font-bold gap-1.5"
            >
              <Brain className="w-3.5 h-3.5" /> Intelligence
            </TabsTrigger>
          </TabsList>

          {/* ── Scanners Tab ───────────────────────────────────────── */}
          <TabsContent value="scanners" className="mt-4">

        {/* Market closed banner */}
        {!marketOpen && !isLoading && (
          <div className="mb-4 rounded-lg border border-border/50 bg-card/40 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--trade-neutral)]" />
              <span className="text-sm text-foreground/80">Market is closed — scanners activate at <span className="font-mono font-bold text-foreground">9:25 AM ET</span> on trading days</span>
            </div>
            <button
              onClick={() => setActiveTab('intelligence')}
              className="text-xs font-bold text-[var(--trade-bullish)] hover:text-[var(--trade-bullish)] transition-colors flex items-center gap-1"
            >
              View Intelligence <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* ── Swing Catcher Panel ────────────────────────────────── */}
        {swingAlerts.length > 0 ? (
          swingAlerts.map((alert: SwingAlert) => (
            <div
              key={alert.id}
              className={cn(
                "mb-4 rounded-lg border p-4",
                alert.scoreLabel === 'FIRE'
                  ? "border-[var(--trade-bearish)]/60 bg-red-950/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                  : alert.scoreLabel === 'STRONG'
                    ? "border-cyan-500/60 bg-cyan-950/20 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
                    : "border-[var(--trade-neutral)]/40 bg-amber-950/10"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {alert.scoreLabel === 'FIRE' && <Flame className="w-5 h-5 text-[var(--trade-bearish)] animate-pulse" />}
                  {alert.scoreLabel === 'STRONG' && <Target className="w-5 h-5 text-[var(--trade-bullish)]" />}
                  {alert.scoreLabel === 'WATCH' && <Eye className="w-5 h-5 text-[var(--trade-neutral)]" />}
                  <span className="text-sm font-bold">SPX SWING {alert.scoreLabel}</span>
                  <Badge className={cn(
                    "text-[10px] font-bold",
                    alert.direction === 'PUT'
                      ? "bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)] border-[var(--trade-bearish)]/20"
                      : "bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/20"
                  )}>
                    {alert.direction}
                  </Badge>
                  <span className={cn(
                    "text-lg font-mono font-bold",
                    alert.score >= 6 ? "text-[var(--trade-bearish)]" : alert.score >= 5 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-neutral)]"
                  )}>
                    {alert.score}/6
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {new Date(alert.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET
                </div>
              </div>

              {/* Signal checklist */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 mb-3">
                {alert.signals.map((sig: SwingSignalDetail, i: number) => (
                  <div key={i} className={cn(
                    "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded",
                    sig.triggered ? "bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)]" : "bg-muted/40 text-muted-foreground"
                  )}>
                    <span>{sig.triggered ? '✓' : '✕'}</span>
                    <span className="font-bold">{sig.name.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>

              {/* Trade setup */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Strike</span>
                  <div className="font-mono font-bold text-foreground">${alert.suggestedStrike} {alert.direction === 'PUT' ? 'P' : 'C'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Cost</span>
                  <div className="font-mono font-bold text-foreground">{alert.estimatedCost}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Target</span>
                  <div className="font-mono font-bold text-[var(--trade-bullish)]">{alert.targetLevel}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Stop</span>
                  <div className="font-mono font-bold text-[var(--trade-bearish)]">{alert.stopLevel}</div>
                </div>
              </div>

              {/* Signal details (collapsible) */}
              <div className="mt-2 pt-2 border-t border-border/30 space-y-0.5">
                {alert.signals.filter((s: SwingSignalDetail) => s.triggered).map((sig: SwingSignalDetail, i: number) => (
                  <div key={i} className="text-[10px] text-muted-foreground">
                    <span className="text-[var(--trade-bullish)] font-bold">{sig.name.replace('_', ' ')}:</span> {sig.detail}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="mb-4 rounded-lg border border-border/30 bg-card/20 px-4 py-2.5 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Swing Catcher monitoring... <span className="font-mono">0/6</span> signals aligned
            </span>
            {swingCatcher?.lastScan && (
              <span className="text-[10px] text-muted-foreground/70 ml-auto font-mono">
                Last scan: {new Date(swingCatcher.lastScan).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York' })}
              </span>
            )}
          </div>
        )}

        {/* ── Main 3-Column Content ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* LEFT: ORB Breakouts (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <Card className="bg-card/40 border-border/50">
              <CardHeader className="pb-2 px-4 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[var(--trade-neutral)]" /> ORB Breakouts
                    {filteredBreakouts.length > 0 && (
                      <Badge className="text-[10px] bg-[var(--trade-neutral)]/10 text-[var(--trade-neutral)] border border-[var(--trade-neutral)]/20">
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
                            ? "bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)] border border-[var(--trade-bullish)]/20"
                            : "text-muted-foreground hover:text-white"
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
                  <div className="space-y-2">
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : filteredBreakouts.length === 0 ? (
                  <div className="text-center py-8">
                    <Crosshair className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                    <div className="text-sm text-muted-foreground">No active breakouts</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-1">Opening ranges form 9:30-10:30 AM ET</div>
                  </div>
                ) : (
                  filteredBreakouts.map((b: ORBBreakout) => <ORBBreakoutCard key={b.id} breakout={b} />)
                )}

                {/* Pending Setups */}
                {data?.orbScanner?.ranges && data.orbScanner.ranges.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                      Opening Ranges Forming
                    </div>
                    {data.orbScanner.ranges.filter((r: OpeningRange) => r.isValid).map((range: OpeningRange) => (
                      <div key={`${range.symbol}-${range.timeframe}`} className="flex items-center justify-between py-1 text-[10px]">
                        <span className="font-mono font-bold text-foreground">{range.symbol}</span>
                        <span className="text-muted-foreground">{range.timeframe}</span>
                        <span className="font-mono text-[var(--trade-bullish)]">${safeToFixed(range.high, 2)}</span>
                        <span className="font-mono text-[var(--trade-bearish)]">${safeToFixed(range.low, 2)}</span>
                        <span className="text-muted-foreground">{safeToFixed(range.rangeWidthPct, 2)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* CENTER: Session Signals (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <Card className="bg-card/40 border-border/50">
              <CardHeader className="pb-2 px-4 pt-3">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[var(--trade-bullish)]" /> Session Signals
                  {sortedSignals.length > 0 && (
                    <Badge className="text-[10px] bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)] border border-[var(--trade-bullish)]/20">
                      {sortedSignals.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {isLoading ? (
                  <div className="space-y-2">
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : sortedSignals.length === 0 ? (
                  <div className="text-center py-8">
                    <Radio className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                    <div className="text-sm text-muted-foreground">No active session signals</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-1">VWAP, Gamma, Power Hour detected live</div>
                  </div>
                ) : (
                  sortedSignals.map((s: SessionSignal) => <SessionSignalCard key={s.id} signal={s} />)
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Levels + Lotto (3 cols) */}
          <div className="lg:col-span-3 space-y-3">
            <KeyLevelsPanel levels={Array.isArray(data?.sessionScanner?.levels) ? data?.sessionScanner?.levels?.[0] ?? null : data?.sessionScanner?.levels || null} spxPrice={spotPrice ?? primaryIndex?.price} />

            <Card className="bg-card/40 border-border/50">
              <CardHeader className="pb-2 px-4 pt-3">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-orange-400" /> Lotto Plays
                  <Badge variant="outline" className={cn("text-[10px] font-bold", SYMBOL_COLORS[activeSymbol].active)}>
                    {activeSymbol}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                {filteredLottos.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-[10px]">No lotto plays detected</div>
                ) : (
                  filteredLottos.slice(0, 5).map((p: LottoPlay, i: number) => <LottoCard key={i} play={p} />)
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Bottom: Today's SPX Ideas ──────────────────────────── */}
        <Card className="bg-card/40 border-border/50">
          <CardHeader className="pb-2 px-4 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-violet-400" /> Today's Ideas
                <Badge className="text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  {data?.todayIdeasCount || 0}
                </Badge>
              </CardTitle>
              <a href="/trade-desk" className="text-[10px] text-[var(--trade-bullish)] hover:text-white transition-colors flex items-center gap-0.5">
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
            <IntelligenceTab symbol={activeSymbol} />
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
