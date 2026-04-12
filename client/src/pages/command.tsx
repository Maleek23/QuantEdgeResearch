/**
 * Command Center V2
 * =================
 * Full-screen trading terminal. Everything visible without scrolling.
 * Layout: Index Strip → Chart + Outlook → Signals | Catalysts | Trade Setup
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GEXVEXChart } from "@/components/gex-vex-chart";
import {
  TrendingUp, TrendingDown, Minus, Activity,
  Target, RefreshCw, Brain, Crosshair,
  ChevronRight, Globe, Layers, Zap,
  Timer, Calendar, BarChart3, Eye,
  ArrowUpRight, ArrowDownRight, Clock,
  AlertTriangle, CheckCircle2, XCircle,
  Flame, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface PsychLevel {
  price: number;
  type: 'RESISTANCE' | 'SUPPORT' | 'PIVOT' | 'PSYCH_ROUND';
  source: string;
  strength: number;
  label: string;
}

interface SignalCorrelation {
  signal: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  weight: number;
  detail: string;
}

interface TradeSetup {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  timeframe: 'SCALP' | 'DAY' | 'SWING';
  entry: number;
  target: number;
  stop: number;
  riskReward: string;
  grade: string;
  rules: string[];
}

interface LevelProbability {
  price: number;
  label: string;
  probability: number;
  gammaPercent: number;
  type: string;
  direction: 'UPSIDE' | 'DOWNSIDE';
}

interface SynthesizedPrediction {
  finalTarget: number;
  finalProbability: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  probabilities: { bullish: number; bearish: number; neutral: number };
  path: string;
  inflectionLevels: { price: number; label: string; breakAbove: string; breakBelow: string }[];
}

interface HorizonProjection {
  horizon: string;
  label: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  target: number;
  emRange: { low: number; high: number };
  keyDriver: string;
  signals: string[];
  levelProbabilities?: LevelProbability[];
  bullishProbability?: number;
  bearishProbability?: number;
  neutralProbability?: number;
  mostLikelyPath?: string;
}

interface UnifiedPrediction {
  symbol: string;
  spotPrice: number;
  timestamp: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  predictionText: string;
  psychLevels: PsychLevel[];
  t1Resist: PsychLevel | null;
  t1Support: PsychLevel | null;
  signals: SignalCorrelation[];
  signalAlignment: number;
  setups: TradeSetup[];
  gexVex: {
    regime: string;
    gexAnchor: number | null;
    gexFlip: number | null;
    vexAnchor: number | null;
    vexFlip: number | null;
    callWalls: number[];
    putWalls: number[];
    upsideTarget: number | null;
    downsideTarget: number | null;
    projectionRange: {
      magnetPrice: number;
      upperBound: number;
      lowerBound: number;
      confidence: number;
      behavior: string;
    } | null;
    regimeStrength: number;
    gammaConcentration?: { strike: number; percent: number; netGEX: number }[];
  } | null;
  activeScenarios: { id: string; name: string; icon: string; likelihood: string; impact: string }[];
  expectedMove: {
    daily: number;
    weekly: number;
    timeframeEM?: number;
    timeframeLabel?: string;
    vixLevel: number;
    vixChange: number;
    vixRegime: string;
    impliedDailyRange: { low: number; high: number };
    impliedWeeklyRange: { low: number; high: number };
    impliedTfRange?: { low: number; high: number };
  } | null;
  narrative: string;
  dataFreshness?: {
    priceSource: string;
    priceAge: string;
    gexSource: string;
    vixLive: boolean;
    lastUpdate: string;
    nextUpdate: string;
  };
  horizonOutlook?: {
    today: HorizonProjection;
    thisWeek: HorizonProjection;
    thisMonth: HorizonProjection;
    synthesized?: SynthesizedPrediction;
  };
  flowData?: {
    putCallRatio: number;
    volumePCR: number;
    flowBias: 'CALL_HEAVY' | 'PUT_HEAVY' | 'BALANCED';
    totalCallOI: number;
    totalPutOI: number;
  };
}

interface EconomicEvent {
  date: string;
  time: string;
  event: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
  forecast?: string;
  previous?: string;
}

interface IndexQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const DIR_CONFIG = {
  BULLISH: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: TrendingUp, label: 'BULLISH' },
  BEARISH: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: TrendingDown, label: 'BEARISH' },
  NEUTRAL: { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', icon: Minus, label: 'NEUTRAL' },
} as const;

function dirCfg(d: string) { return DIR_CONFIG[d as keyof typeof DIR_CONFIG] || DIR_CONFIG.NEUTRAL; }

const SYMBOLS = ['SPY', 'QQQ', 'IWM'] as const;
const TIMEFRAMES = [
  { id: '5m', label: '5m', range: '1d', interval: '5m' },
  { id: '15m', label: '15m', range: '5d', interval: '15m' },
  { id: '1h', label: '1H', range: '5d', interval: '1h' },
  { id: '4h', label: '4H', range: '1mo', interval: '1h' },
  { id: '1d', label: '1D', range: '1mo', interval: '1d' },
  { id: '1w', label: '1W', range: '3mo', interval: '1wk' },
] as const;

const REFRESH_INTERVAL = 60;

function buildChartLevels(pred: UnifiedPrediction | null | undefined) {
  if (!pred?.gexVex) return [];
  const gv = pred.gexVex;
  const gc = gv.gammaConcentration || [];
  const levels: { price: number; type: any; label: string; strength?: number }[] = [];
  const gammaAt = (strike: number) => gc.find(g => g.strike === strike)?.percent || 0;

  for (const w of gv.callWalls.slice(0, 3)) {
    const pct = gammaAt(w);
    levels.push({ price: w, type: 'CALL_WALL', label: `Call Wall $${w}${pct ? ` — ${pct}%` : ''}`, strength: 70 + Math.min(20, pct) });
  }
  for (const w of gv.putWalls.slice(0, 3)) {
    const pct = gammaAt(w);
    levels.push({ price: w, type: 'PUT_WALL', label: `Put Wall $${w}${pct ? ` — ${pct}%` : ''}`, strength: 70 + Math.min(20, pct) });
  }
  if (gv.gexAnchor) levels.push({ price: gv.gexAnchor, type: 'GEX_ANCHOR', label: `GEX Anchor`, strength: 90 });
  if (gv.gexFlip) levels.push({ price: gv.gexFlip, type: 'GEX_FLIP', label: `Gamma Flip`, strength: 85 });
  if (gv.vexAnchor) levels.push({ price: gv.vexAnchor, type: 'VEX_ANCHOR', label: `VEX Magnet`, strength: 65 });
  if (gv.vexFlip) levels.push({ price: gv.vexFlip, type: 'VEX_FLIP', label: `Vanna Flip`, strength: 60 });
  if (gv.upsideTarget) levels.push({ price: gv.upsideTarget, type: 'UPSIDE_TARGET', label: `Target UP`, strength: 80 });
  if (gv.downsideTarget) levels.push({ price: gv.downsideTarget, type: 'DOWNSIDE_TARGET', label: `Target DN`, strength: 80 });
  return levels;
}

function timeUntil(dateStr: string, timeStr: string): string {
  try {
    // Parse time like "8:30 AM ET" or "14:00" into 24h format
    let hours24 = 8, mins24 = 30;
    if (timeStr) {
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        hours24 = parseInt(match[1]);
        mins24 = parseInt(match[2]);
        if (match[3]?.toUpperCase() === 'PM' && hours24 < 12) hours24 += 12;
        if (match[3]?.toUpperCase() === 'AM' && hours24 === 12) hours24 = 0;
      }
    }
    const h = String(hours24).padStart(2, '0');
    const m = String(mins24).padStart(2, '0');
    const eventDate = new Date(`${dateStr}T${h}:${m}:00`);
    if (isNaN(eventDate.getTime())) return '—';
    const now = new Date();
    const diffMs = eventDate.getTime() - now.getTime();
    if (diffMs < 0) return 'NOW';
    const daysDiff = Math.floor(diffMs / 86400000);
    if (daysDiff > 0) return `${daysDiff}d`;
    const hoursDiff = Math.floor(diffMs / 3600000);
    if (hoursDiff > 0) return `${hoursDiff}h`;
    const minsDiff = Math.floor(diffMs / 60000);
    return `${minsDiff}m`;
  } catch {
    return '—';
  }
}

// ═══════════════════════════════════════════════════════════════
// INDEX STRIP — SPY/QQQ/IWM/VIX at a glance
// ═══════════════════════════════════════════════════════════════

function IndexStrip({ activeSymbol, onSymbolChange, prediction }: {
  activeSymbol: string;
  onSymbolChange: (s: string) => void;
  prediction: UnifiedPrediction | null | undefined;
}) {
  const vix = prediction?.expectedMove;
  const pcr = prediction?.flowData?.putCallRatio;

  // Fetch quotes for all indexes
  const { data: quotes } = useQuery<Record<string, IndexQuote>>({
    queryKey: ['/api/index-quotes'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/quotes/batch/SPY,QQQ,IWM', { credentials: 'include' });
        if (!res.ok) return {};
        const data = await res.json();
        const result: Record<string, IndexQuote> = {};
        for (const q of (data.quotes || data || [])) {
          if (q?.symbol) {
            result[q.symbol] = {
              symbol: q.symbol,
              price: q.last || q.price || q.close || 0,
              change: q.change || 0,
              changePercent: q.change_percentage || q.changePercent || 0,
            };
          }
        }
        return result;
      } catch { return {}; }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Upcoming economic event
  const { data: calendarData } = useQuery({
    queryKey: ['/api/economic-calendar'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/economic-calendar?days=14', { credentials: 'include' });
        if (!res.ok) return null;
        return res.json();
      } catch { return null; }
    },
    staleTime: 300_000,
  });

  const nextEvent = useMemo(() => {
    const events = calendarData?.upcoming || [];
    const high = events.filter((e: any) => e.importance === 'HIGH');
    return high[0] || events[0] || null;
  }, [calendarData]);

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-slate-900/80 border-b border-slate-700/50">
      {/* Index buttons with live prices */}
      {SYMBOLS.map(s => {
        const q = quotes?.[s];
        const isActive = activeSymbol === s;
        const isUp = (q?.change || 0) >= 0;
        return (
          <button
            key={s}
            onClick={() => onSymbolChange(s)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm",
              isActive
                ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-400"
                : "hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-transparent"
            )}
          >
            <span className="font-bold">{s}</span>
            {q && q.price > 0 && (
              <>
                <span className="font-mono text-slate-200">${q.price.toFixed(2)}</span>
                <span className={cn("font-mono text-xs", isUp ? 'text-emerald-400' : 'text-red-400')}>
                  {isUp ? '+' : ''}{q.changePercent.toFixed(1)}%
                </span>
              </>
            )}
          </button>
        );
      })}

      {/* Divider */}
      <div className="w-px h-6 bg-slate-700 mx-2" />

      {/* VIX */}
      {vix && (
        <div className="flex items-center gap-1.5 px-2">
          <span className="text-xs text-slate-500">VIX</span>
          <span className={cn("font-mono text-sm font-bold",
            vix.vixLevel >= 30 ? 'text-red-400' :
            vix.vixLevel >= 25 ? 'text-orange-400' :
            vix.vixLevel >= 20 ? 'text-amber-400' : 'text-emerald-400'
          )}>
            {vix.vixLevel.toFixed(1)}
          </span>
          {vix.vixChange !== 0 && (
            <span className={cn("text-xs font-mono", vix.vixChange > 0 ? 'text-red-400' : 'text-emerald-400')}>
              {vix.vixChange > 0 ? '▲' : '▼'}{Math.abs(vix.vixChange).toFixed(1)}
            </span>
          )}
        </div>
      )}

      {/* PCR */}
      {pcr != null && (
        <div className="flex items-center gap-1.5 px-2">
          <span className="text-xs text-slate-500">PCR</span>
          <span className={cn("font-mono text-sm font-bold",
            pcr > 1.5 ? 'text-red-400' : pcr > 1.1 ? 'text-amber-400' : pcr < 0.7 ? 'text-emerald-400' : 'text-slate-300'
          )}>
            {pcr.toFixed(2)}
          </span>
        </div>
      )}

      {/* Gamma Regime */}
      {prediction?.gexVex?.regime && (
        <Badge variant="outline" className={cn("text-[10px] font-mono",
          prediction.gexVex.regime === 'POSITIVE' ? 'text-emerald-400 border-emerald-500/30' :
          prediction.gexVex.regime === 'NEGATIVE' ? 'text-red-400 border-red-500/30' :
          'text-slate-400'
        )}>
          {prediction.gexVex.regime} γ
        </Badge>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Next Catalyst */}
      {nextEvent && (
        <div className="flex items-center gap-2 px-3 py-1 rounded bg-slate-800/60 border border-slate-700/50">
          <Calendar className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-slate-400">Next:</span>
          <span className="text-xs font-medium text-slate-200">{nextEvent.event}</span>
          <span className={cn("text-xs font-mono font-bold",
            nextEvent.importance === 'HIGH' ? 'text-red-400' : 'text-amber-400'
          )}>
            {timeUntil(nextEvent.date, nextEvent.time)}
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DIRECTION + OUTLOOK PANEL (right of chart)
// ═══════════════════════════════════════════════════════════════

function OutlookPanel({ prediction, spot }: { prediction: UnifiedPrediction | null | undefined; spot: number }) {
  if (!prediction) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Loading prediction...</p>
        </div>
      </div>
    );
  }

  const dir = dirCfg(prediction.direction);
  const DirIcon = dir.icon;
  const synth = prediction.horizonOutlook?.synthesized;
  const horizons = prediction.horizonOutlook
    ? [prediction.horizonOutlook.today, prediction.horizonOutlook.thisWeek, prediction.horizonOutlook.thisMonth]
    : [];

  return (
    <div className="h-full flex flex-col gap-3 p-4">
      {/* Direction Hero */}
      <div className={cn("rounded-xl p-4 border-2", dir.bg, dir.border)}>
        <div className="flex items-center gap-3 mb-2">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", dir.bg, "border", dir.border)}>
            <DirIcon className={cn("w-6 h-6", dir.color)} />
          </div>
          <div>
            <div className={cn("text-xl font-black tracking-tight", dir.color)}>{prediction.direction}</div>
            <div className="text-xs text-slate-400 font-mono">{prediction.confidence}% confidence</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-black font-mono text-slate-100">${spot.toFixed(2)}</div>
          </div>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">{prediction.predictionText}</p>
      </div>

      {/* Synthesized Probability Bar */}
      {synth && (
        <div className="px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/40">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">Probability</span>
            <span className="ml-auto font-mono text-sm font-bold text-slate-200">→ ${synth.finalTarget.toFixed(0)}</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-slate-900/60 mb-1.5">
            <div className="h-full bg-emerald-500/80 transition-all duration-500" style={{ width: `${synth.probabilities.bullish}%` }} />
            <div className="h-full bg-amber-500/60 transition-all duration-500" style={{ width: `${synth.probabilities.neutral}%` }} />
            <div className="h-full bg-red-500/80 transition-all duration-500" style={{ width: `${synth.probabilities.bearish}%` }} />
          </div>
          <div className="flex justify-between text-[11px] font-mono">
            <span className="text-emerald-400">{synth.probabilities.bullish}% bull</span>
            <span className="text-amber-400">{synth.probabilities.neutral}% flat</span>
            <span className="text-red-400">{synth.probabilities.bearish}% bear</span>
          </div>
        </div>
      )}

      {/* Multi-Horizon Outlook */}
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Horizons</span>
        </div>
        {horizons.map((h) => {
          const hDir = dirCfg(h.direction);
          const HIcon = hDir.icon;
          const pctMove = spot > 0 ? ((h.target - spot) / spot * 100) : 0;
          return (
            <div key={h.horizon} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
              hDir.bg, hDir.border
            )}>
              <span className="text-[11px] text-slate-400 w-14 shrink-0 font-medium">{h.label}</span>
              <HIcon className={cn("w-4 h-4 shrink-0", hDir.color)} />
              <div className="flex-1 min-w-0">
                {h.bullishProbability != null && h.bearishProbability != null && (
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-900/40">
                    <div className="h-full bg-emerald-500/60" style={{ width: `${h.bullishProbability}%` }} />
                    <div className="h-full bg-amber-500/40" style={{ width: `${h.neutralProbability || 0}%` }} />
                    <div className="h-full bg-red-500/60" style={{ width: `${h.bearishProbability}%` }} />
                  </div>
                )}
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{h.keyDriver}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-sm text-slate-200">${h.target.toFixed(0)}</div>
                <div className={cn("font-mono text-[10px]", pctMove >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {pctMove >= 0 ? '+' : ''}{pctMove.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Key Levels (compact) */}
      {prediction.gexVex && (
        <div className="grid grid-cols-2 gap-1.5">
          {prediction.gexVex.upsideTarget && (
            <div className="px-2.5 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
              <div className="text-[10px] text-slate-500 uppercase">Target Up</div>
              <div className="font-mono font-bold text-emerald-400">${prediction.gexVex.upsideTarget}</div>
            </div>
          )}
          {prediction.gexVex.downsideTarget && (
            <div className="px-2.5 py-2 rounded-lg bg-red-500/5 border border-red-500/15">
              <div className="text-[10px] text-slate-500 uppercase">Target Dn</div>
              <div className="font-mono font-bold text-red-400">${prediction.gexVex.downsideTarget}</div>
            </div>
          )}
          {prediction.gexVex.gexAnchor && (
            <div className="px-2.5 py-2 rounded-lg bg-cyan-500/5 border border-cyan-500/15">
              <div className="text-[10px] text-slate-500 uppercase">GEX Anchor</div>
              <div className="font-mono font-bold text-cyan-400">${prediction.gexVex.gexAnchor}</div>
            </div>
          )}
          {prediction.gexVex.gexFlip && (
            <div className="px-2.5 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
              <div className="text-[10px] text-slate-500 uppercase">γ Flip</div>
              <div className="font-mono font-bold text-amber-400">${prediction.gexVex.gexFlip}</div>
            </div>
          )}
        </div>
      )}

      {/* Expected Move */}
      {prediction.expectedMove && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="flex-1 flex items-center gap-3">
            <div>
              <div className="text-[9px] text-slate-500 uppercase">Daily EM</div>
              <div className="font-mono text-sm font-bold text-amber-400">±${prediction.expectedMove.daily.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 uppercase">Weekly EM</div>
              <div className="font-mono text-sm font-bold text-amber-400">±${prediction.expectedMove.weekly.toFixed(2)}</div>
            </div>
            <div className="text-[10px] text-slate-500 font-mono ml-auto">
              ${prediction.expectedMove.impliedDailyRange.low.toFixed(0)}-${prediction.expectedMove.impliedDailyRange.high.toFixed(0)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SIGNALS PANEL (bottom left)
// ═══════════════════════════════════════════════════════════════

function SignalsPanel({ prediction }: { prediction: UnifiedPrediction | null | undefined }) {
  const signals = prediction?.signals || [];
  const alignment = prediction?.signalAlignment || 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
        <Activity className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold text-slate-200">Signal Correlation</span>
        <span className={cn("ml-auto font-mono text-sm font-bold",
          alignment > 15 ? 'text-emerald-400' : alignment < -15 ? 'text-red-400' : 'text-slate-400'
        )}>
          {alignment > 0 ? '+' : ''}{alignment}
        </span>
      </div>
      <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
        {signals.length === 0 && (
          <div className="text-sm text-slate-500 py-4 text-center">No signals available</div>
        )}
        {signals.map((sig, i) => {
          const sDir = dirCfg(sig.direction);
          return (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <div className={cn("w-2 h-2 rounded-full shrink-0",
                sig.direction === 'BULLISH' ? 'bg-emerald-400' :
                sig.direction === 'BEARISH' ? 'bg-red-400' : 'bg-slate-500'
              )} />
              <span className="text-sm font-medium text-slate-200 w-28 shrink-0">{sig.signal}</span>
              <span className={cn("text-xs font-bold w-16 shrink-0", sDir.color)}>{sig.direction}</span>
              <span className="text-xs text-slate-500 truncate flex-1">{sig.detail}</span>
              <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
                <div className={cn("h-full rounded-full",
                  sig.direction === 'BULLISH' ? 'bg-emerald-500/60' :
                  sig.direction === 'BEARISH' ? 'bg-red-500/60' : 'bg-slate-600'
                )} style={{ width: `${sig.weight}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {/* Flow bar */}
      {prediction?.flowData && (
        <div className="px-4 py-2.5 border-t border-slate-700/40">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Flow</span>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500/50 rounded-full" style={{
                width: `${Math.round(prediction.flowData.totalCallOI / (prediction.flowData.totalCallOI + prediction.flowData.totalPutOI + 1) * 100)}%`
              }} />
            </div>
            <Badge variant="outline" className={cn("text-[10px] font-mono",
              prediction.flowData.flowBias === 'PUT_HEAVY' ? 'text-red-400 border-red-500/30' :
              prediction.flowData.flowBias === 'CALL_HEAVY' ? 'text-emerald-400 border-emerald-500/30' :
              'text-slate-400'
            )}>
              {prediction.flowData.flowBias}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CATALYST TIMELINE (bottom center)
// ═══════════════════════════════════════════════════════════════

function CatalystTimeline() {
  const { data: calendarData } = useQuery({
    queryKey: ['/api/economic-calendar-full'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/economic-calendar?days=30', { credentials: 'include' });
        if (!res.ok) return null;
        return res.json();
      } catch { return null; }
    },
    staleTime: 300_000,
  });

  const events = useMemo(() => {
    const raw = calendarData?.upcoming || [];
    return raw.slice(0, 8);
  }, [calendarData]);

  const impColor = (imp: string) => {
    if (imp === 'HIGH') return 'text-red-400 bg-red-500/10 border-red-500/20';
    if (imp === 'MEDIUM') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  };

  const impDot = (imp: string) => {
    if (imp === 'HIGH') return 'bg-red-400';
    if (imp === 'MEDIUM') return 'bg-amber-400';
    return 'bg-slate-500';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
        <Calendar className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-slate-200">Catalyst Timeline</span>
        <span className="ml-auto text-[10px] text-slate-500 font-mono">Next 30d</span>
      </div>
      <div className="flex-1 px-4 py-2 space-y-0.5 overflow-y-auto">
        {events.length === 0 && (
          <div className="text-sm text-slate-500 py-4 text-center">Loading catalysts...</div>
        )}
        {events.map((ev: any, i: number) => {
          const tu = timeUntil(ev.date, ev.time);
          const isPast = tu === 'NOW';
          return (
            <div key={i} className={cn(
              "flex items-center gap-2.5 py-1.5 px-2 rounded transition-all",
              isPast ? 'bg-slate-800/40' : 'hover:bg-slate-800/20'
            )}>
              {/* Timeline dot */}
              <div className="flex flex-col items-center w-3 shrink-0">
                <div className={cn("w-2 h-2 rounded-full", impDot(ev.importance))} />
                {i < events.length - 1 && <div className="w-px h-4 bg-slate-700/50 mt-0.5" />}
              </div>
              {/* Event info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 font-medium truncate">{ev.event}</div>
                <div className="text-[10px] text-slate-500 font-mono">{ev.date} {ev.time || ''}</div>
              </div>
              {/* Countdown */}
              <Badge variant="outline" className={cn("text-[10px] font-mono shrink-0", impColor(ev.importance))}>
                {tu}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TRADE SETUP PANEL (bottom right)
// ═══════════════════════════════════════════════════════════════

function TradeSetupPanel({ prediction }: { prediction: UnifiedPrediction | null | undefined }) {
  const setups = prediction?.setups || [];
  const topSetup = setups[0];

  const gradeStyle = (g: string) => {
    if (g === 'A+' || g === 'A') return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
    if (g === 'B+' || g === 'B') return 'text-amber-400 bg-amber-500/15 border-amber-500/30';
    return 'text-red-400 bg-red-500/15 border-red-500/30';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
        <Crosshair className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-slate-200">Trade Setups</span>
      </div>
      <div className="flex-1 px-4 py-3 space-y-3 overflow-y-auto">
        {setups.length === 0 && (
          <div className="text-sm text-slate-500 py-4 text-center">No setups available</div>
        )}
        {setups.slice(0, 2).map((setup, i) => {
          const sDir = dirCfg(setup.direction === 'LONG' ? 'BULLISH' : setup.direction === 'SHORT' ? 'BEARISH' : 'NEUTRAL');
          const SIcon = sDir.icon;
          return (
            <div key={i} className={cn("rounded-lg border p-3", sDir.bg, sDir.border)}>
              <div className="flex items-center gap-2 mb-2.5">
                <SIcon className={cn("w-4 h-4", sDir.color)} />
                <span className={cn("text-sm font-bold", sDir.color)}>{setup.direction}</span>
                <Badge variant="outline" className="text-[10px]">{setup.timeframe}</Badge>
                <Badge variant="outline" className={cn("text-xs font-mono font-bold ml-auto", gradeStyle(setup.grade))}>
                  {setup.grade}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Entry</div>
                  <div className="font-mono font-bold text-sm text-slate-200">${setup.entry.toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Target</div>
                  <div className="font-mono font-bold text-sm text-emerald-400">${setup.target.toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Stop</div>
                  <div className="font-mono font-bold text-sm text-red-400">${setup.stop.toFixed(0)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">R:R</div>
                  <div className="font-mono font-bold text-sm text-slate-200">{setup.riskReward}</div>
                </div>
              </div>
              {setup.rules.slice(0, 2).map((rule, j) => (
                <div key={j} className="flex items-start gap-1.5 text-xs text-slate-400">
                  <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          );
        })}

        {/* Narrative */}
        {prediction?.narrative && setups.length <= 1 && (
          <div className="rounded-lg bg-slate-800/30 border border-slate-700/30 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] text-slate-500 uppercase">Analysis</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{prediction.narrative}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ACCURACY BAR (footer)
// ═══════════════════════════════════════════════════════════════

function AccuracyBar() {
  const { data: accuracy } = useQuery({
    queryKey: ['/api/projection-accuracy'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/projection-accuracy', { credentials: 'include' });
        if (!res.ok) return null;
        return res.json();
      } catch { return null; }
    },
    staleTime: 600_000,
  });

  if (!accuracy) return null;

  const hitRate = accuracy?.rolling30Day?.hitRate || accuracy?.hitRateByTarget?.composite || 0;
  const totalProjections = accuracy?.rolling30Day?.total || accuracy?.totalProjections || 0;
  const regimeAcc = accuracy?.hitRateByRegime;

  return (
    <div className="flex items-center gap-4 px-4 py-1.5 bg-slate-900/60 border-t border-slate-700/30 text-[11px]">
      <div className="flex items-center gap-1.5">
        <BarChart3 className="w-3 h-3 text-cyan-400" />
        <span className="text-slate-500">Projection Accuracy</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-slate-400">30d hit rate:</span>
        <span className={cn("font-mono font-bold",
          hitRate >= 60 ? 'text-emerald-400' : hitRate >= 45 ? 'text-amber-400' : 'text-red-400'
        )}>
          {hitRate.toFixed(0)}%
        </span>
      </div>
      <span className="text-slate-600">|</span>
      <span className="text-slate-500">{totalProjections} projections tracked</span>
      {regimeAcc && (
        <>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">+γ: {(regimeAcc.POSITIVE || 0).toFixed(0)}%</span>
          <span className="text-slate-500">-γ: {(regimeAcc.NEGATIVE || 0).toFixed(0)}%</span>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function Command() {
  const [symbol, setSymbol] = useState<string>('SPY');
  const [tfId, setTfId] = useState('5m');
  const [zoomLevel, setZoomLevel] = useState<{ yMin: number; yMax: number } | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [focusPrice, setFocusPrice] = useState<number | null>(null);
  const tf = TIMEFRAMES.find(t => t.id === tfId) || TIMEFRAMES[0];

  // Unified prediction
  const { data: prediction, refetch: refetchPred, dataUpdatedAt, isFetching: isPredFetching } = useQuery<UnifiedPrediction>({
    queryKey: ['/api/unified-prediction', symbol, tfId],
    queryFn: async () => {
      const res = await fetch(`/api/unified-prediction/${symbol}?timeframe=${tfId}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: REFRESH_INTERVAL * 1000,
    placeholderData: (prev: any) => prev,
  });

  // Chart data
  const { data: chartData } = useQuery({
    queryKey: ['/api/historical-prices', symbol, tf.range, tf.interval],
    queryFn: async () => {
      const res = await fetch(`/api/historical-prices/${symbol}?range=${tf.range}&interval=${tf.interval}`, { credentials: 'include' });
      if (!res.ok) return [];
      const d = await res.json();
      return (d.prices || d.data || d || []).map((p: any) => ({
        time: p.date || p.time || 0,
        open: p.open, high: p.high, low: p.low, close: p.close,
      }));
    },
    staleTime: 30_000,
    refetchInterval: REFRESH_INTERVAL * 1000,
    placeholderData: (prev: any) => prev,
  });

  // Auto-refresh countdown
  useEffect(() => { setCountdown(REFRESH_INTERVAL); }, [dataUpdatedAt]);
  useEffect(() => {
    const timer = setInterval(() => setCountdown(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetchPred();
    setIsRefreshing(false);
    setCountdown(REFRESH_INTERVAL);
  }, [refetchPred]);

  const spot = prediction?.spotPrice || 0;
  const chartLevels = buildChartLevels(prediction);

  // Append live price to chart
  const enrichedChartData = useMemo(() => {
    if (!chartData || chartData.length === 0 || !spot) return chartData || [];
    const lastCandle = chartData[chartData.length - 1];
    const lastClose = lastCandle?.close || 0;
    if (Math.abs(spot - lastClose) / lastClose < 0.001) return chartData;
    const nextDaySec = (lastCandle?.time || 0) + 86400;
    return [
      ...chartData,
      { time: nextDaySec, open: lastClose, high: Math.max(lastClose, spot), low: Math.min(lastClose, spot), close: spot },
    ];
  }, [chartData, spot]);

  // Projection target
  const projRange = prediction?.gexVex?.projectionRange;
  const projTarget = (() => {
    if (projRange?.magnetPrice) return projRange.magnetPrice;
    const gv = prediction?.gexVex;
    if (!gv) return null;
    if (gv.regime === 'POSITIVE' && gv.gexAnchor) return gv.gexAnchor;
    if (prediction?.direction === 'BULLISH') return gv.upsideTarget;
    if (prediction?.direction === 'BEARISH') return gv.downsideTarget;
    const upDist = gv.upsideTarget ? Math.abs(gv.upsideTarget - spot) : Infinity;
    const dnDist = gv.downsideTarget ? Math.abs(gv.downsideTarget - spot) : Infinity;
    return upDist < dnDist ? gv.upsideTarget : gv.downsideTarget;
  })();

  return (
    <div className="flex flex-col bg-slate-950 text-slate-100 overflow-hidden" style={{ height: 'calc(100vh - 77px)' }}>

      {/* ─── INDEX STRIP ─── */}
      <IndexStrip
        activeSymbol={symbol}
        onSymbolChange={(s) => { setSymbol(s); setZoomLevel(null); }}
        prediction={prediction}
      />

      {/* ─── TIMEFRAME BAR ─── */}
      <div className="flex items-center gap-1 px-4 py-1.5 bg-slate-900/40 border-b border-slate-800/50">
        <span className="text-xs text-slate-500 mr-2">Timeframe</span>
        {TIMEFRAMES.map(t => (
          <button
            key={t.id}
            onClick={() => { setTfId(t.id); setZoomLevel(null); }}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-mono transition-all",
              tfId === t.id
                ? "bg-cyan-500/15 text-cyan-400 font-bold"
                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {zoomLevel && (
          <button onClick={() => setZoomLevel(null)} className="text-[10px] text-slate-500 hover:text-slate-300 px-2">
            Reset zoom
          </button>
        )}
        {prediction?.dataFreshness && (
          <Badge variant="outline" className={cn("text-[10px] font-mono",
            prediction.dataFreshness.priceSource === 'CHART_CANDLE' || prediction.dataFreshness.priceSource === 'QUOTE'
              ? 'text-emerald-400/70 border-emerald-500/20'
              : 'text-amber-400/70 border-amber-500/20'
          )}>
            {prediction.dataFreshness.priceSource === 'CHART_CANDLE' ? 'LIVE' : prediction.dataFreshness.priceSource}
          </Badge>
        )}
        <button
          onClick={handleManualRefresh}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors"
        >
          <RefreshCw className={cn("w-3 h-3", (isRefreshing || isPredFetching) && "animate-spin")} />
          <span className={cn(countdown <= 5 ? 'text-cyan-400' : '')}>{countdown}s</span>
        </button>
      </div>

      {/* ─── MAIN: Chart + Outlook ─── */}
      <div className="flex-1 grid grid-cols-12 gap-0 min-h-0">
        {/* Chart — 8 cols */}
        <div className="col-span-12 lg:col-span-8 border-r border-slate-800/50 flex flex-col">
          <div className="flex-1 p-3 min-h-0">
            {enrichedChartData && enrichedChartData.length > 0 ? (
              <GEXVEXChart
                symbol={symbol}
                data={enrichedChartData}
                levels={chartLevels}
                spotPrice={spot}
                height={undefined}
                regime={prediction?.gexVex?.regime as any}
                projectionTarget={projTarget}
                projectionDirection={projTarget && projTarget > spot ? 'BULLISH' : projTarget && projTarget < spot ? 'BEARISH' : prediction?.direction}
                projectionRange={projRange}
                expectedMove={prediction?.expectedMove ? {
                  daily: prediction.expectedMove.timeframeEM || prediction.expectedMove.daily,
                  impliedDailyRange: prediction.expectedMove.impliedTfRange || prediction.expectedMove.impliedDailyRange,
                } : null}
                horizonTargets={prediction?.horizonOutlook ? {
                  today: prediction.horizonOutlook.today.target,
                  week: prediction.horizonOutlook.thisWeek.target,
                  month: prediction.horizonOutlook.thisMonth.target,
                } : null}
                zoomRange={zoomLevel}
                onZoomReset={() => setZoomLevel(null)}
                onPriceHover={setFocusPrice}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading chart...</span>
              </div>
            )}
          </div>
        </div>

        {/* Outlook Panel — 4 cols */}
        <div className="hidden lg:block col-span-4 overflow-y-auto bg-slate-900/30">
          <OutlookPanel prediction={prediction} spot={spot} />
        </div>
      </div>

      {/* ─── BOTTOM ROW: Signals | Catalysts | Trade Setups ─── */}
      <div className="grid grid-cols-12 gap-0 h-[240px] border-t border-slate-700/50 shrink-0">
        {/* Signals — 4 cols */}
        <div className="col-span-12 lg:col-span-4 border-r border-slate-800/50 bg-slate-900/20">
          <SignalsPanel prediction={prediction} />
        </div>
        {/* Catalyst Timeline — 4 cols */}
        <div className="hidden lg:block col-span-4 border-r border-slate-800/50 bg-slate-900/20">
          <CatalystTimeline />
        </div>
        {/* Trade Setups — 4 cols */}
        <div className="hidden lg:block col-span-4 bg-slate-900/20">
          <TradeSetupPanel prediction={prediction} />
        </div>
      </div>

      {/* ─── ACCURACY FOOTER ─── */}
      <AccuracyBar />
    </div>
  );
}
