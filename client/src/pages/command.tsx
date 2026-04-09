/**
 * Command Center
 * ==============
 * Chart-first market intelligence. GEX+VEX levels overlaid on candlesticks,
 * signal correlation, trade setups, and geopolitical scenarios — all in one view.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GEXVEXChart } from "@/components/gex-vex-chart";
import {
  TrendingUp, TrendingDown, Minus, Activity,
  Target, RefreshCw, Shield, Brain, Crosshair,
  ChevronRight, Globe, Layers, AlertTriangle, Zap,
  Timer,
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
      behavior: 'MEAN_REVERT' | 'MOMENTUM' | 'RANGE_BOUND';
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

interface GeoScenario {
  id: string;
  name: string;
  icon: string;
  category: string;
  likelihood: string;
  description: string;
  confidence: number;
  reactions: { asset: string; label: string; move1h: number; move24h: number; move72h: number; direction: string }[];
  tradingPlan: string;
}
interface GeoMatrix {
  scenarios: GeoScenario[];
  currentConditions: { vix: number | null; geopoliticalRisk: string; activeScenarios: string[] };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function trendColor(t: string) { return t === 'BULLISH' ? 'text-emerald-400' : t === 'BEARISH' ? 'text-red-400' : 'text-muted-foreground'; }
function trendBg(t: string) { return t === 'BULLISH' ? 'bg-emerald-500/10 border-emerald-500/20' : t === 'BEARISH' ? 'bg-red-500/10 border-red-500/20' : 'bg-muted/30 border-border'; }
function dirIcon(d: string, size = 'w-3.5 h-3.5') {
  if (d === 'BULLISH' || d === 'LONG') return <TrendingUp className={cn(size, 'text-emerald-400')} />;
  if (d === 'BEARISH' || d === 'SHORT') return <TrendingDown className={cn(size, 'text-red-400')} />;
  return <Minus className={cn(size, 'text-muted-foreground')} />;
}
function gradeColor(g: string) {
  if (g === 'A+' || g === 'A') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  if (g === 'B+' || g === 'B') return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  return 'text-red-400 border-red-500/30 bg-red-500/10';
}

const SYMBOLS = ['SPY', 'QQQ', 'IWM'] as const;

// Convert unified prediction levels to chart overlay format
function buildChartLevels(pred: UnifiedPrediction | null | undefined) {
  if (!pred?.gexVex) return [];
  const gv = pred.gexVex;
  const gc = gv.gammaConcentration || [];
  const levels: { price: number; type: any; label: string; strength?: number }[] = [];

  // Helper: get gamma % for a strike
  const gammaAt = (strike: number) => gc.find(g => g.strike === strike)?.percent || 0;

  // Call walls = resistance (with gamma %)
  for (const w of gv.callWalls.slice(0, 3)) {
    const pct = gammaAt(w);
    levels.push({ price: w, type: 'CALL_WALL' as const, label: `Call Wall $${w}${pct ? ` — ${pct}%` : ''}`, strength: 70 + Math.min(20, pct) });
  }
  // Put walls = support (with gamma %)
  for (const w of gv.putWalls.slice(0, 3)) {
    const pct = gammaAt(w);
    levels.push({ price: w, type: 'PUT_WALL' as const, label: `Put Wall $${w}${pct ? ` — ${pct}%` : ''}`, strength: 70 + Math.min(20, pct) });
  }
  // GEX anchor
  if (gv.gexAnchor) {
    const pct = gammaAt(gv.gexAnchor);
    levels.push({ price: gv.gexAnchor, type: 'GEX_ANCHOR' as const, label: `GEX Anchor${pct ? ` — ${pct}%` : ''}`, strength: 90 });
  }
  // GEX flip
  if (gv.gexFlip) levels.push({ price: gv.gexFlip, type: 'GEX_FLIP' as const, label: `Gamma Flip`, strength: 85 });
  // VEX anchor
  if (gv.vexAnchor) levels.push({ price: gv.vexAnchor, type: 'VEX_ANCHOR' as const, label: `VEX Magnet`, strength: 65 });
  // VEX flip
  if (gv.vexFlip) levels.push({ price: gv.vexFlip, type: 'VEX_FLIP' as const, label: `Vanna Flip`, strength: 60 });
  // Composite targets
  if (gv.upsideTarget) levels.push({ price: gv.upsideTarget, type: 'UPSIDE_TARGET' as const, label: `Target UP`, strength: 80 });
  if (gv.downsideTarget) levels.push({ price: gv.downsideTarget, type: 'DOWNSIDE_TARGET' as const, label: `Target DN`, strength: 80 });

  return levels;
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

const TIMEFRAMES = [
  { id: '5m',  label: '5m',   range: '1d',  interval: '5m'  },
  { id: '15m', label: '15m',  range: '5d',  interval: '15m' },
  { id: '1h',  label: '1H',   range: '5d',  interval: '1h'  },
  { id: '4h',  label: '4H',   range: '1mo', interval: '1h'  },
  { id: '1d',  label: '1D',   range: '1mo', interval: '1d'  },
  { id: '1w',  label: '1W',   range: '3mo', interval: '1wk' },
] as const;

const REFRESH_INTERVAL = 60; // seconds

export default function Command() {
  const [symbol, setSymbol] = useState<string>('SPY');
  const [tfId, setTfId] = useState('5m');
  const [showScenarios, setShowScenarios] = useState(false);
  const [enabledScenarios, setEnabledScenarios] = useState<Set<string>>(new Set());
  const [zoomLevel, setZoomLevel] = useState<{ yMin: number; yMax: number } | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [focusPrice, setFocusPrice] = useState<number | null>(null); // from chart hover — gamma concentration reacts to this
  const tf = TIMEFRAMES.find(t => t.id === tfId) || TIMEFRAMES[4];
  const chartRange = tf.range;
  const chartInterval = tf.interval;

  // Unified prediction — re-fetches when timeframe changes for EM-scaled projections
  // keepPreviousData: show old data while new symbol/tf loads (no flash)
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

  // Geopolitical scenarios (for the expandable section)
  const { data: geoMatrix } = useQuery<GeoMatrix>({
    queryKey: ['/api/geopolitical-scenarios'],
    queryFn: async () => {
      const res = await fetch('/api/geopolitical-scenarios', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 300_000,
  });

  // Chart data (OHLC candles)
  const { data: chartData } = useQuery({
    queryKey: ['/api/historical-prices', symbol, chartRange, chartInterval],
    queryFn: async () => {
      const res = await fetch(`/api/historical-prices/${symbol}?range=${chartRange}&interval=${chartInterval}`, { credentials: 'include' });
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

  // ── Auto-refresh countdown ──
  useEffect(() => {
    setCountdown(REFRESH_INTERVAL);
  }, [dataUpdatedAt]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
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

  // Append live price (post/pre-market) to chart so the after-hours move is visible
  const enrichedChartData = useMemo(() => {
    if (!chartData || chartData.length === 0 || !spot) return chartData || [];
    const lastCandle = chartData[chartData.length - 1];
    const lastClose = lastCandle?.close || 0;
    // Only append if live price differs meaningfully from last candle close (>0.1%)
    if (Math.abs(spot - lastClose) / lastClose < 0.001) return chartData;
    // Push the after-hours point to next day so it has visible horizontal space on chart
    const nextDaySec = (lastCandle?.time || 0) + 86400;
    return [
      ...chartData,
      { time: nextDaySec, open: lastClose, high: Math.max(lastClose, spot), low: Math.min(lastClose, spot), close: spot },
    ];
  }, [chartData, spot]);

  // Projection target — use magnet price from regime-aware projectionRange,
  // fallback: POSITIVE gamma → GEX anchor (mean-revert), BULLISH → upside, BEARISH → downside
  const projRange = prediction?.gexVex?.projectionRange;
  const projTarget = (() => {
    if (projRange?.magnetPrice) return projRange.magnetPrice;
    const gv = prediction?.gexVex;
    if (!gv) return null;
    // In POSITIVE gamma, price gravitates to GEX anchor regardless of neutral/bullish direction
    if (gv.regime === 'POSITIVE' && gv.gexAnchor) return gv.gexAnchor;
    if (prediction?.direction === 'BULLISH') return gv.upsideTarget;
    if (prediction?.direction === 'BEARISH') return gv.downsideTarget;
    // NEUTRAL — pick whichever target is closer to spot
    const upDist = gv.upsideTarget ? Math.abs(gv.upsideTarget - spot) : Infinity;
    const dnDist = gv.downsideTarget ? Math.abs(gv.downsideTarget - spot) : Infinity;
    return upDist < dnDist ? gv.upsideTarget : gv.downsideTarget;
  })();

  // Scenario overlay: compute blended impact from enabled geopolitical scenarios
  const scenarioImpact = useMemo(() => {
    if (enabledScenarios.size === 0 || !geoMatrix?.scenarios || !spot) return null;
    let totalMove = 0;
    let totalConf = 0;
    const active: { name: string; icon: string; move: number }[] = [];

    for (const sc of geoMatrix.scenarios) {
      if (!enabledScenarios.has(sc.id)) continue;
      const reaction = sc.reactions?.find((r: any) => r.asset === symbol || r.asset === 'SPY');
      if (!reaction) continue;
      // Use 24h impact, weighted by scenario confidence
      const confWeight = (sc.confidence || 50) / 100;
      const move = reaction.move24h || 0;
      totalMove += move * confWeight;
      totalConf += confWeight;
      active.push({ name: sc.name, icon: sc.icon, move });
    }

    if (active.length === 0) return null;
    const blendedMove = totalConf > 0 ? totalMove / totalConf : 0;
    const adjustedSpot = spot * (1 + blendedMove / 100);
    return { blendedMove, adjustedSpot, active, count: active.length };
  }, [enabledScenarios, geoMatrix, spot, symbol]);

  // Adjust projection target and range if scenario overlay is active
  const effectiveProjTarget = scenarioImpact
    ? (projTarget ? projTarget * (1 + scenarioImpact.blendedMove / 100) : scenarioImpact.adjustedSpot)
    : projTarget;
  const effectiveProjRange = scenarioImpact && projRange ? {
    ...projRange,
    magnetPrice: projRange.magnetPrice * (1 + scenarioImpact.blendedMove / 100),
    upperBound: projRange.upperBound * (1 + scenarioImpact.blendedMove / 100),
    lowerBound: projRange.lowerBound * (1 + scenarioImpact.blendedMove / 100),
  } : projRange;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-3">

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Target className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Command Center</h1>
              <p className="text-xs text-muted-foreground">GEX + VEX Projection</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {SYMBOLS.map(s => (
              <Button key={s} size="sm" variant={symbol === s ? 'default' : 'outline'}
                onClick={() => { setSymbol(s); setZoomLevel(null); }} className="h-7 text-xs px-3">{s}</Button>
            ))}
            <div className="w-px h-5 bg-muted mx-1.5" />
            {TIMEFRAMES.map(t => (
              <Button key={t.id} size="sm" variant={tfId === t.id ? 'default' : 'ghost'}
                onClick={() => { setTfId(t.id); setZoomLevel(null); }}
                className={cn("h-6 text-[10px] px-2 font-mono", tfId === t.id ? '' : 'text-muted-foreground')}
              >{t.label}</Button>
            ))}
            <div className="w-px h-5 bg-muted mx-1" />
            {zoomLevel && (
              <Button size="sm" variant="ghost" onClick={() => setZoomLevel(null)} className="h-6 text-[10px] px-2 text-muted-foreground">
                Reset
              </Button>
            )}
            <button onClick={handleManualRefresh} className="flex items-center gap-1 h-7 px-2 rounded text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors" title={`Auto-refresh in ${countdown}s`}>
              <RefreshCw className={cn("w-3 h-3", (isRefreshing || isPredFetching) && "animate-spin")} />
              <span className={cn(countdown <= 5 ? 'text-cyan-400' : '')}>{countdown}s</span>
            </button>
          </div>
        </div>

        {/* ─── Prediction Headline (compact) ─── */}
        {prediction && (
          <div className={cn("flex items-center gap-3 px-4 py-2.5 rounded-lg border", trendBg(prediction.direction))}>
            {dirIcon(prediction.direction, 'w-5 h-5')}
            <span className={cn("text-sm font-bold", trendColor(prediction.direction))}>{prediction.direction}</span>
            <Badge variant="outline" className={cn("text-[10px] font-mono", trendColor(prediction.direction))}>{prediction.confidence}%</Badge>
            <span className="text-xs text-foreground/70 flex-1">{prediction.predictionText}</span>
            {prediction.dataFreshness && (
              <Badge variant="outline" className={cn("text-[8px] font-mono shrink-0",
                prediction.dataFreshness.priceSource === 'CHART_CANDLE' || prediction.dataFreshness.priceSource === 'QUOTE'
                  ? 'text-emerald-400/70 border-emerald-500/20'
                  : 'text-amber-400/70 border-amber-500/20'
              )}>
                {prediction.dataFreshness.priceSource === 'CHART_CANDLE' ? 'LIVE' : prediction.dataFreshness.priceSource}
                {' · '}{prediction.dataFreshness.priceAge}
              </Badge>
            )}
            <span className="text-sm font-mono font-bold text-foreground">${spot.toFixed(2)}</span>
          </div>
        )}

        {/* ─── Main: Chart with levels + Sidebar ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

          {/* Chart — 8 cols */}
          <div className="lg:col-span-8">
            <Card className="bg-card/50 border-border">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{symbol}</span>
                    {prediction?.gexVex && (
                      <Badge variant="outline" className={cn("text-[9px] font-mono",
                        prediction.gexVex.regime === 'POSITIVE' ? 'text-emerald-400 border-emerald-500/30' :
                        prediction.gexVex.regime === 'NEGATIVE' ? 'text-red-400 border-red-500/30' :
                        'text-muted-foreground'
                      )}>
                        {prediction.gexVex.regime} GAMMA
                      </Badge>
                    )}
                  </div>
                  {prediction?.t1Resist && prediction?.t1Support && (
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="text-emerald-400">S1: ${prediction.t1Support.price.toFixed(0)}</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="text-red-400">R1: ${prediction.t1Resist.price.toFixed(0)}</span>
                    </div>
                  )}
                </div>

                {enrichedChartData && enrichedChartData.length > 0 ? (
                  <GEXVEXChart
                    symbol={symbol}
                    data={enrichedChartData}
                    levels={chartLevels}
                    spotPrice={spot}
                    height={480}
                    regime={prediction?.gexVex?.regime as any}
                    projectionTarget={effectiveProjTarget}
                    projectionDirection={effectiveProjTarget && effectiveProjTarget > spot ? 'BULLISH' : effectiveProjTarget && effectiveProjTarget < spot ? 'BEARISH' : prediction?.direction}
                    projectionRange={effectiveProjRange}
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
                  <div className="h-[480px] flex items-center justify-center text-muted-foreground/70">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />Loading chart...
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right sidebar — 4 cols, scrollable */}
          <div className="lg:col-span-4 space-y-3 max-h-[calc(100vh-180px)] overflow-y-auto pr-1 scrollbar-thin">

            {/* Key Levels Grid */}
            {prediction?.gexVex && (
              <Card className="bg-card/50 border-border">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-semibold">Key Levels</span>
                    <span className="text-[8px] text-muted-foreground ml-auto font-mono">${spot.toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {prediction.gexVex.upsideTarget && (
                      <div className="px-2 py-1.5 rounded bg-emerald-500/5 border border-emerald-500/10 cursor-pointer hover:border-emerald-500/30 transition-colors"
                        onClick={() => {
                          const lvl = prediction.gexVex!.upsideTarget!;
                          const pad = Math.abs(lvl - spot) * 0.3 + 2;
                          setZoomLevel({ yMin: Math.min(spot, lvl) - pad, yMax: Math.max(spot, lvl) + pad });
                        }}>
                        <div className="text-[8px] text-muted-foreground">UP TARGET</div>
                        <div className="font-mono font-bold text-emerald-400 text-sm">${prediction.gexVex.upsideTarget}</div>
                        <div className="text-[8px] font-mono text-emerald-400/50">{((prediction.gexVex.upsideTarget - spot) / spot * 100).toFixed(1)}% away</div>
                      </div>
                    )}
                    {prediction.gexVex.downsideTarget && (
                      <div className="px-2 py-1.5 rounded bg-red-500/5 border border-red-500/10 cursor-pointer hover:border-red-500/30 transition-colors"
                        onClick={() => {
                          const lvl = prediction.gexVex!.downsideTarget!;
                          const pad = Math.abs(lvl - spot) * 0.3 + 2;
                          setZoomLevel({ yMin: Math.min(spot, lvl) - pad, yMax: Math.max(spot, lvl) + pad });
                        }}>
                        <div className="text-[8px] text-muted-foreground">DN TARGET</div>
                        <div className="font-mono font-bold text-red-400 text-sm">${prediction.gexVex.downsideTarget}</div>
                        <div className="text-[8px] font-mono text-red-400/50">{((spot - prediction.gexVex.downsideTarget) / spot * 100).toFixed(1)}% away</div>
                      </div>
                    )}
                    {prediction.gexVex.gexAnchor && (
                      <div className="px-2 py-1.5 rounded bg-cyan-500/5 border border-cyan-500/10 cursor-pointer hover:border-cyan-500/30 transition-colors"
                        onClick={() => {
                          const lvl = prediction.gexVex!.gexAnchor!;
                          const pad = spot * 0.015;
                          setZoomLevel({ yMin: lvl - pad, yMax: lvl + pad });
                        }}>
                        <div className="text-[8px] text-muted-foreground">GEX ANCHOR</div>
                        <div className="font-mono font-bold text-cyan-400 text-sm">${prediction.gexVex.gexAnchor}</div>
                        <div className="text-[8px] font-mono text-cyan-400/50">{(Math.abs(prediction.gexVex.gexAnchor - spot)).toFixed(1)} away</div>
                      </div>
                    )}
                    {prediction.gexVex.gexFlip && (
                      <div className="px-2 py-1.5 rounded bg-amber-500/5 border border-amber-500/10 cursor-pointer hover:border-amber-500/30 transition-colors"
                        onClick={() => {
                          const lvl = prediction.gexVex!.gexFlip!;
                          const pad = spot * 0.015;
                          setZoomLevel({ yMin: lvl - pad, yMax: lvl + pad });
                        }}>
                        <div className="text-[8px] text-muted-foreground">GAMMA FLIP</div>
                        <div className="font-mono font-bold text-amber-400 text-sm">${prediction.gexVex.gexFlip}</div>
                        <div className="text-[8px] font-mono text-amber-400/50">{(Math.abs(prediction.gexVex.gexFlip - spot)).toFixed(1)} away</div>
                      </div>
                    )}
                  </div>
                  {/* Gamma Concentration Breakdown — sorts by proximity to focus price */}
                  {prediction.gexVex.gammaConcentration && prediction.gexVex.gammaConcentration.length > 0 && (() => {
                    const refPrice = focusPrice || spot;
                    // Sort by proximity to the reference price (where user is looking)
                    const sorted = [...prediction.gexVex!.gammaConcentration!]
                      .sort((a, b) => Math.abs(a.strike - refPrice) - Math.abs(b.strike - refPrice))
                      .slice(0, 6);
                    const maxPct = Math.max(...sorted.map(g => g.percent), 1);
                    return (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[8px] text-muted-foreground">Gamma Concentration</span>
                          {focusPrice && (
                            <span className="text-[7px] font-mono text-cyan-400/70 ml-auto">@ ${focusPrice.toFixed(0)}</span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {sorted.map((gc) => {
                            const dist = gc.strike - refPrice;
                            const isAbove = dist > 0;
                            const isNearest = Math.abs(dist) === Math.min(...sorted.map(g => Math.abs(g.strike - refPrice)));
                            return (
                              <div key={gc.strike} className={cn(
                                "flex items-center gap-1.5 px-1 py-0.5 rounded transition-all cursor-pointer",
                                isNearest ? 'bg-cyan-500/10 ring-1 ring-cyan-500/20' : 'hover:bg-muted/20'
                              )}
                                onClick={() => {
                                  const pad = Math.abs(gc.strike - spot) * 0.5 + 3;
                                  setZoomLevel({ yMin: Math.min(spot, gc.strike) - pad, yMax: Math.max(spot, gc.strike) + pad });
                                }}>
                                <span className={cn("text-[9px] font-mono w-10 shrink-0",
                                  isNearest ? 'text-cyan-400 font-bold' : 'text-foreground'
                                )}>${gc.strike}</span>
                                <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                  <div className={cn("h-full rounded-full transition-all",
                                    gc.netGEX > 0 ? 'bg-emerald-500/60' : 'bg-red-500/60',
                                    isNearest && 'brightness-125'
                                  )} style={{ width: `${(gc.percent / maxPct) * 100}%` }} />
                                </div>
                                <span className={cn("text-[9px] font-mono font-bold w-7 text-right",
                                  gc.netGEX > 0 ? 'text-emerald-400' : 'text-red-400'
                                )}>{gc.percent}%</span>
                                <span className={cn("text-[7px] font-mono w-8 text-right",
                                  isAbove ? 'text-emerald-400/40' : 'text-red-400/40'
                                )}>{isAbove ? '+' : ''}{dist.toFixed(0)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Expected Move (VIX-derived) */}
            {prediction?.expectedMove && (
              <Card className="bg-card/50 border-border">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-semibold">Expected Move</span>
                    <Badge variant="outline" className={cn("text-[8px] font-mono ml-auto",
                      prediction.expectedMove.vixRegime === 'EXTREME_FEAR' || prediction.expectedMove.vixRegime === 'FEAR' ? 'text-red-400 border-red-500/30' :
                      prediction.expectedMove.vixRegime === 'ELEVATED' ? 'text-amber-400 border-amber-500/30' :
                      'text-muted-foreground'
                    )}>
                      VIX {prediction.expectedMove.vixLevel.toFixed(1)}
                      {prediction.expectedMove.vixChange !== 0 && (
                        <span className={prediction.expectedMove.vixChange > 0 ? 'text-red-400' : 'text-emerald-400'}>
                          {' '}{prediction.expectedMove.vixChange > 0 ? '↑' : '↓'}{Math.abs(prediction.expectedMove.vixChange).toFixed(1)}
                        </span>
                      )}
                    </Badge>
                  </div>
                  {/* Timeframe-specific EM (prominent) */}
                  {prediction.expectedMove.timeframeEM && prediction.expectedMove.timeframeLabel && tfId !== '1d' && (
                    <div className="px-2 py-1.5 mb-1.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                      <div className="text-[8px] text-cyan-400 uppercase">{prediction.expectedMove.timeframeLabel} EM ±</div>
                      <div className="font-mono font-bold text-cyan-400 text-base">${prediction.expectedMove.timeframeEM.toFixed(2)}</div>
                      <div className="text-[8px] font-mono text-muted-foreground/60">
                        ${prediction.expectedMove.impliedTfRange?.low.toFixed(0)}-${prediction.expectedMove.impliedTfRange?.high.toFixed(0)}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="px-2 py-1.5 rounded bg-amber-500/5 border border-amber-500/10">
                      <div className="text-[8px] text-muted-foreground">DAILY ±</div>
                      <div className="font-mono font-bold text-amber-400 text-sm">${prediction.expectedMove.daily.toFixed(2)}</div>
                      <div className="text-[8px] font-mono text-muted-foreground/60">
                        ${prediction.expectedMove.impliedDailyRange.low.toFixed(0)}-${prediction.expectedMove.impliedDailyRange.high.toFixed(0)}
                      </div>
                    </div>
                    <div className="px-2 py-1.5 rounded bg-amber-500/5 border border-amber-500/10">
                      <div className="text-[8px] text-muted-foreground">WEEKLY ±</div>
                      <div className="font-mono font-bold text-amber-400 text-sm">${prediction.expectedMove.weekly.toFixed(2)}</div>
                      <div className="text-[8px] font-mono text-muted-foreground/60">
                        ${prediction.expectedMove.impliedWeeklyRange.low.toFixed(0)}-${prediction.expectedMove.impliedWeeklyRange.high.toFixed(0)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Signal Correlation */}
            {prediction?.signals && prediction.signals.length > 0 && (
              <Card className="bg-card/50 border-border">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold">Signals</span>
                    <span className="text-[9px] text-muted-foreground ml-auto font-mono">
                      {prediction.signalAlignment > 0 ? '+' : ''}{prediction.signalAlignment}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {prediction.signals.map((sig, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                          sig.direction === 'BULLISH' ? 'bg-emerald-400' :
                          sig.direction === 'BEARISH' ? 'bg-red-400' : 'bg-muted-foreground'
                        )} />
                        <span className="font-medium text-foreground w-20 shrink-0 truncate">{sig.signal}</span>
                        <span className="text-muted-foreground truncate flex-1">{sig.detail}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Multi-Horizon Probability Outlook */}
            {prediction?.horizonOutlook && (
              <Card className="bg-card/50 border-border">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold">Probability Outlook</span>
                    {prediction.flowData && (
                      <Badge variant="outline" className={cn("text-[8px] font-mono ml-auto",
                        prediction.flowData.flowBias === 'CALL_HEAVY' ? 'text-emerald-400 border-emerald-500/30' :
                        prediction.flowData.flowBias === 'PUT_HEAVY' ? 'text-red-400 border-red-500/30' :
                        'text-muted-foreground'
                      )}>
                        PCR {prediction.flowData.putCallRatio.toFixed(2)}
                      </Badge>
                    )}
                  </div>

                  {/* Synthesized Final Prediction */}
                  {prediction.horizonOutlook.synthesized && (() => {
                    const synth = prediction.horizonOutlook.synthesized!;
                    return (
                      <div className={cn("px-2.5 py-2 rounded border mb-2",
                        synth.direction === 'BULLISH' ? 'bg-emerald-500/8 border-emerald-500/25' :
                        synth.direction === 'BEARISH' ? 'bg-red-500/8 border-red-500/25' :
                        'bg-amber-500/8 border-amber-500/25'
                      )}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Brain className="w-3 h-3 text-cyan-400" />
                          <span className="text-[9px] font-semibold text-cyan-400">SYNTHESIZED</span>
                          {dirIcon(synth.direction, 'w-3 h-3')}
                          <span className={cn("text-[10px] font-bold", trendColor(synth.direction))}>{synth.direction}</span>
                          <span className="text-[9px] font-mono font-bold text-foreground ml-auto">${synth.finalTarget.toFixed(0)}</span>
                        </div>
                        {/* Probability bar */}
                        <div className="flex items-center gap-1 mb-1.5">
                          <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden flex">
                            <div className="h-full bg-emerald-500/70 transition-all" style={{ width: `${synth.probabilities.bullish}%` }} />
                            <div className="h-full bg-amber-500/50 transition-all" style={{ width: `${synth.probabilities.neutral}%` }} />
                            <div className="h-full bg-red-500/70 transition-all" style={{ width: `${synth.probabilities.bearish}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[8px] font-mono">
                          <span className="text-emerald-400">{synth.probabilities.bullish}% bull</span>
                          <span className="text-amber-400">{synth.probabilities.neutral}% flat</span>
                          <span className="text-red-400">{synth.probabilities.bearish}% bear</span>
                        </div>
                        {/* Inflection levels */}
                        {synth.inflectionLevels.length > 0 && (
                          <div className="mt-1.5 pt-1.5 border-t border-border/30 space-y-0.5">
                            {synth.inflectionLevels.map((lvl, i) => (
                              <div key={i} className="text-[8px] flex items-start gap-1">
                                <Zap className="w-2 h-2 mt-0.5 shrink-0 text-amber-400" />
                                <span className="text-muted-foreground">{lvl.label}:</span>
                                <span className="text-emerald-400/70">↑{lvl.breakAbove.split('—')[0]}</span>
                                <span className="text-red-400/70">↓{lvl.breakBelow.split('—')[0]}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="space-y-1.5">
                    {[prediction.horizonOutlook.today, prediction.horizonOutlook.thisWeek, prediction.horizonOutlook.thisMonth].map((h) => (
                      <div key={h.horizon} className={cn("px-2 py-1.5 rounded border transition-all",
                        h.direction === 'BULLISH' ? 'bg-emerald-500/5 border-emerald-500/15' :
                        h.direction === 'BEARISH' ? 'bg-red-500/5 border-red-500/15' :
                        'bg-muted/10 border-border'
                      )}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground w-14 shrink-0">{h.label}</span>
                          {dirIcon(h.direction, 'w-3 h-3')}
                          <span className={cn("text-[10px] font-bold", trendColor(h.direction))}>{h.direction}</span>
                          <span className="text-[9px] font-mono font-bold text-foreground ml-auto">${h.target.toFixed(0)}</span>
                        </div>
                        {/* Probability mini-bar */}
                        {h.bullishProbability != null && h.bearishProbability != null && (
                          <div className="flex items-center gap-1 mt-1 ml-[56px]">
                            <div className="flex-1 h-1 bg-muted/20 rounded-full overflow-hidden flex">
                              <div className="h-full bg-emerald-500/60" style={{ width: `${h.bullishProbability}%` }} />
                              <div className="h-full bg-amber-500/40" style={{ width: `${h.neutralProbability || 0}%` }} />
                              <div className="h-full bg-red-500/60" style={{ width: `${h.bearishProbability}%` }} />
                            </div>
                            <span className="text-[7px] font-mono text-muted-foreground/60">
                              {h.bullishProbability}B/{h.bearishProbability}S
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5 ml-[56px]">
                          <span className="text-[8px] text-muted-foreground/60 font-mono">${h.emRange.low.toFixed(0)}-${h.emRange.high.toFixed(0)}</span>
                          <span className="text-[8px] text-muted-foreground truncate">{h.keyDriver}</span>
                        </div>
                        {/* Most likely path */}
                        {h.mostLikelyPath && (
                          <div className="mt-0.5 ml-[56px] text-[7px] text-cyan-400/60 truncate font-mono">
                            {h.mostLikelyPath}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {prediction.flowData && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <div className="flex items-center gap-2 text-[9px]">
                        <span className="text-muted-foreground">Flow:</span>
                        <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500/60 rounded-full" style={{
                            width: `${Math.round(prediction.flowData.totalCallOI / (prediction.flowData.totalCallOI + prediction.flowData.totalPutOI + 1) * 100)}%`
                          }} />
                        </div>
                        <span className="text-emerald-400 font-mono text-[8px]">{((prediction.flowData.totalCallOI / (prediction.flowData.totalCallOI + prediction.flowData.totalPutOI + 1)) * 100).toFixed(0)}% calls</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Trade Setups */}
            {prediction?.setups && prediction.setups.length > 0 && (
              <Card className="bg-card/50 border-border">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-semibold">Trade Setups</span>
                  </div>
                  <div className="space-y-2">
                    {prediction.setups.slice(0, 2).map((setup, i) => (
                      <div key={i} className={cn("px-2.5 py-2 rounded border", trendBg(setup.direction === 'LONG' ? 'BULLISH' : 'BEARISH'))}>
                        <div className="flex items-center gap-2 mb-1">
                          {dirIcon(setup.direction)}
                          <span className={cn("text-xs font-bold", setup.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400')}>
                            {setup.direction}
                          </span>
                          <Badge variant="outline" className="text-[8px]">{setup.timeframe}</Badge>
                          <Badge variant="outline" className={cn("text-[9px] font-mono font-bold ml-auto", gradeColor(setup.grade))}>
                            {setup.grade}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-[9px] mb-1">
                          <div><span className="text-muted-foreground">Entry</span><div className="font-mono font-bold">${setup.entry.toFixed(0)}</div></div>
                          <div><span className="text-muted-foreground">Target</span><div className="font-mono font-bold text-emerald-400">${setup.target.toFixed(0)}</div></div>
                          <div><span className="text-muted-foreground">Stop</span><div className="font-mono font-bold text-red-400">${setup.stop.toFixed(0)}</div></div>
                          <div><span className="text-muted-foreground">R:R</span><div className="font-mono font-bold">{setup.riskReward}</div></div>
                        </div>
                        {setup.rules.slice(0, 2).map((rule, j) => (
                          <div key={j} className="text-[8px] text-muted-foreground flex items-start gap-1">
                            <ChevronRight className="w-2 h-2 mt-0.5 shrink-0 text-muted-foreground/40" /><span>{rule}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Scenario Impact Banner (when scenarios are toggled on) */}
            {scenarioImpact && (
              <Card className={cn("border", scenarioImpact.blendedMove > 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20")}>
                <CardContent className="p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className={cn("w-3.5 h-3.5", scenarioImpact.blendedMove > 0 ? "text-emerald-400" : "text-red-400")} />
                    <span className="text-[10px] font-semibold">Scenario Overlay Active</span>
                    <span className={cn("font-mono font-bold text-xs ml-auto",
                      scenarioImpact.blendedMove > 0 ? "text-emerald-400" : "text-red-400"
                    )}>
                      {scenarioImpact.blendedMove > 0 ? '+' : ''}{scenarioImpact.blendedMove.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[9px] text-muted-foreground">
                    {scenarioImpact.active.map(a => `${a.icon} ${a.name} (${a.move > 0 ? '+' : ''}${a.move}%)`).join(' + ')}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[9px]">
                    <span className="text-muted-foreground">Adjusted target:</span>
                    <span className="font-mono font-bold text-foreground">${scenarioImpact.adjustedSpot.toFixed(0)}</span>
                    <button
                      onClick={() => setEnabledScenarios(new Set())}
                      className="ml-auto text-[8px] text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Geopolitical Scenarios (toggleable) */}
            <Card className="bg-card/50 border-border">
              <CardContent className="p-3">
                <button onClick={() => setShowScenarios(!showScenarios)} className="flex items-center gap-2 w-full text-left">
                  <Globe className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-xs font-semibold">Geopolitical Scenarios</span>
                  {geoMatrix?.currentConditions?.geopoliticalRisk === 'ELEVATED' && (
                    <Badge variant="outline" className="text-[8px] text-orange-400 border-orange-500/30">ELEVATED</Badge>
                  )}
                  {enabledScenarios.size > 0 && (
                    <Badge variant="outline" className="text-[8px] text-cyan-400 border-cyan-500/30">{enabledScenarios.size} applied</Badge>
                  )}
                  <ChevronRight className={cn("w-3 h-3 text-muted-foreground ml-auto transition-transform", showScenarios && "rotate-90")} />
                </button>

                {showScenarios && geoMatrix?.scenarios && (
                  <div className="mt-2 space-y-1.5">
                    <div className="text-[9px] text-muted-foreground mb-1">Toggle scenarios to see their impact on the projection</div>
                    {geoMatrix.scenarios.map((sc) => {
                      const isEnabled = enabledScenarios.has(sc.id);
                      const isActive = geoMatrix.currentConditions?.activeScenarios?.includes(sc.id);
                      const reaction = sc.reactions.find((r: any) => r.asset === symbol || r.asset === 'SPY');
                      return (
                        <button
                          key={sc.id}
                          onClick={() => {
                            const next = new Set(enabledScenarios);
                            if (isEnabled) next.delete(sc.id); else next.add(sc.id);
                            setEnabledScenarios(next);
                          }}
                          className={cn("w-full px-2 py-1.5 rounded text-[10px] border text-left transition-all",
                            isEnabled ? 'bg-cyan-500/10 border-cyan-500/30 ring-1 ring-cyan-500/20' :
                            isActive ? 'bg-orange-500/5 border-orange-500/15' : 'bg-muted/10 border-transparent hover:bg-muted/20'
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <div className={cn("w-3 h-3 rounded-sm border flex items-center justify-center shrink-0",
                              isEnabled ? 'bg-cyan-500 border-cyan-500' : 'border-muted-foreground/30'
                            )}>
                              {isEnabled && <span className="text-[7px] text-white font-bold">✓</span>}
                            </div>
                            <span>{sc.icon}</span>
                            <span className="font-medium text-foreground truncate">{sc.name}</span>
                            {isActive && <Badge variant="outline" className="text-[7px] text-orange-400 border-orange-500/20 shrink-0">ACTIVE</Badge>}
                            <span className="ml-auto text-muted-foreground shrink-0">{sc.likelihood}</span>
                          </div>
                          {reaction && (
                            <div className="flex items-center gap-3 mt-0.5 ml-[18px]">
                              <span className={cn("font-mono",
                                reaction.move24h > 0 ? 'text-emerald-400' : reaction.move24h < 0 ? 'text-red-400' : 'text-muted-foreground'
                              )}>
                                {reaction.move24h > 0 ? '+' : ''}{reaction.move24h}%
                              </span>
                              <span className="text-muted-foreground/50">24h</span>
                              <span className={cn("font-mono text-[9px]",
                                reaction.move1h > 0 ? 'text-emerald-400/60' : reaction.move1h < 0 ? 'text-red-400/60' : 'text-muted-foreground/40'
                              )}>
                                {reaction.move1h > 0 ? '+' : ''}{reaction.move1h}% 1h
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Narrative */}
            {prediction?.narrative && (
              <Card className="bg-card/50 border-border">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-semibold">Analysis</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{prediction.narrative}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
