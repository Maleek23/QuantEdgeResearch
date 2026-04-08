/**
 * Command Center — Bloomberg Terminal Layout
 * ============================================
 * Full-width chart with GEX/VEX levels + compact intelligence sidebar.
 * The chart is the star — everything else supports it.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GEXVEXChart } from "@/components/gex-vex-chart";
import type { CandleData, GEXLevel } from "@/components/gex-vex-chart";
import {
  TrendingUp, TrendingDown, Activity, BarChart3,
  Target, RefreshCw, Zap, ArrowUpRight, ArrowDownRight,
  Shield, Brain, Gauge,
} from "lucide-react";
import { cn, safeToFixed, safeNumber } from "@/lib/utils";

const SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA'];
const TIMEFRAMES = [
  { id: '1d', label: '1D', range: '1mo', interval: '1d' },
  { id: '1h', label: '1H', range: '5d', interval: '1h' },
  { id: '15m', label: '15m', range: '5d', interval: '15m' },
  { id: '1w', label: '1W', range: '3mo', interval: '1wk' },
];

function trendColor(t: string) {
  return t === 'BULLISH' ? 'text-[var(--trade-bullish)]' : t === 'BEARISH' ? 'text-[var(--trade-bearish)]' : 'text-muted-foreground';
}

export default function Command() {
  const [symbol, setSymbol] = useState('SPY');
  const [tfIdx, setTfIdx] = useState(0);
  const [focusPrice, setFocusPrice] = useState<number | null>(null);
  const tf = TIMEFRAMES[tfIdx];

  // ── Data queries ──
  const { data: projData, isLoading: projLoading, refetch } = useQuery<any>({
    queryKey: ['/api/projector', tf.id],
    queryFn: async () => {
      const res = await fetch(`/api/projector?timeframe=${tf.id === '1w' ? 'weekly' : 'daily'}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: intelData } = useQuery<any>({
    queryKey: ['/api/spx/intelligence', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/spx/intelligence?symbol=${symbol}`, { credentials: 'include' });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 120_000,
  });

  const { data: chartData } = useQuery<CandleData[]>({
    queryKey: ['/api/historical-prices', symbol, tf.range, tf.interval],
    queryFn: async () => {
      const res = await fetch(`/api/historical-prices/${symbol}?range=${tf.range}&interval=${tf.interval}`, { credentials: 'include' });
      if (!res.ok) return [];
      const d = await res.json();
      return (d.prices || d.data || d || []).map((p: any) => ({
        time: typeof p.time === 'number' ? p.time : Math.floor(new Date(p.date || p.time).getTime() / 1000),
        open: safeNumber(p.open), high: safeNumber(p.high),
        low: safeNumber(p.low), close: safeNumber(p.close),
        volume: p.volume,
      }));
    },
    staleTime: 60_000,
  });

  // ── Build chart levels from intel data ──
  const levels = useMemo<GEXLevel[]>(() => {
    const result: GEXLevel[] = [];
    const gex = intelData?.gex;
    if (!gex) return result;

    if (gex.maxGammaStrike) result.push({ price: gex.maxGammaStrike, type: 'GEX_ANCHOR', label: 'GEX Anchor' });
    if (gex.flipPoint) result.push({ price: gex.flipPoint, type: 'GEX_FLIP', label: 'Gamma Flip' });

    return result;
  }, [intelData]);

  const currentEM = projData?.expectedMoves?.find((em: any) => em.symbol === symbol);
  const spotPrice = safeNumber(currentEM?.currentPrice || chartData?.[chartData.length - 1]?.close);

  return (
    <div className="min-h-screen bg-background page-atmosphere text-foreground">
      <div className="max-w-[1800px] mx-auto px-2 sm:px-3 py-2 space-y-2">

        {/* ── Header Bar ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-400" />
            <h1 className="text-sm font-bold tracking-tight">Command Center</h1>
            <span className="text-[9px] text-muted-foreground font-mono">{projData?.nextSession || ''}</span>
          </div>
          <div className="flex items-center gap-1">
            {SYMBOLS.map(s => (
              <Button key={s} size="sm" variant={symbol === s ? 'default' : 'ghost'}
                onClick={() => setSymbol(s)}
                className={cn("h-6 text-[10px] font-mono px-2", symbol === s && "bg-[var(--brand-teal)] text-black")}
              >{s}</Button>
            ))}
            <div className="w-px h-4 bg-border mx-0.5" />
            {TIMEFRAMES.map((t, i) => (
              <Button key={t.id} size="sm" variant={tfIdx === i ? 'secondary' : 'ghost'}
                onClick={() => setTfIdx(i)}
                className="h-6 text-[10px] font-mono px-2"
              >{t.label}</Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-6 w-6 p-0 text-muted-foreground">
              <RefreshCw className={cn("w-3 h-3", projLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* ── Main Layout: Chart (wide) + Intelligence (narrow) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">

          {/* Chart — 9 cols */}
          <div className="lg:col-span-9">
            <Card className="bg-card/30 border-border overflow-hidden">
              <CardContent className="p-0">
                {chartData && chartData.length > 0 ? (
                  <GEXVEXChart
                    symbol={symbol}
                    data={chartData}
                    levels={levels}
                    spotPrice={spotPrice}
                    height={560}
                    regime={intelData?.gex?.regime?.toUpperCase() as any}
                    expectedMove={currentEM ? {
                      daily: safeNumber(currentEM.expectedMovePct),
                      impliedDailyRange: { low: safeNumber(currentEM.lowerBound), high: safeNumber(currentEM.upperBound) },
                    } : undefined}
                    onPriceHover={setFocusPrice}
                  />
                ) : (
                  <div className="h-[560px] flex items-center justify-center text-muted-foreground/50 font-mono text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />Loading {symbol}...
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Intelligence Sidebar — 3 cols */}
          <div className="lg:col-span-3 space-y-2 overflow-y-auto max-h-[600px]">

            {/* Expected Move */}
            {currentEM && (
              <div className="p-2.5 rounded-md bg-card/50 border border-border">
                <div className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-mono mb-1">Expected Move</div>
                <div className="text-lg font-bold font-mono tabular-nums text-foreground">${safeToFixed(currentEM.currentPrice, 2)}</div>
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-[9px] text-[var(--trade-bearish)] font-mono tabular-nums">${safeToFixed(currentEM.lowerBound, 0)}</span>
                  <div className="flex-1 h-1 rounded-full bg-muted relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-[var(--trade-bearish)]/30 via-muted-foreground/20 to-[var(--trade-bullish)]/30" />
                  </div>
                  <span className="text-[9px] text-[var(--trade-bullish)] font-mono tabular-nums">${safeToFixed(currentEM.upperBound, 0)}</span>
                </div>
                <div className="text-[8px] text-muted-foreground/50 font-mono text-center mt-1">±{currentEM.expectedMovePct}%</div>
              </div>
            )}

            {/* Directional Bias */}
            {projData?.bias && (
              <div className={cn("p-2.5 rounded-md border",
                projData.bias.direction === 'BULLISH' ? "bg-emerald-500/5 border-emerald-500/15" :
                projData.bias.direction === 'BEARISH' ? "bg-red-500/5 border-red-500/15" :
                "bg-card/50 border-border"
              )}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  {projData.bias.direction === 'BULLISH' ? <TrendingUp className="w-3 h-3 text-[var(--trade-bullish)]" /> :
                   projData.bias.direction === 'BEARISH' ? <TrendingDown className="w-3 h-3 text-[var(--trade-bearish)]" /> :
                   <Activity className="w-3 h-3 text-muted-foreground" />}
                  <span className={cn("text-xs font-bold", trendColor(projData.bias.direction))}>{projData.bias.direction}</span>
                  <span className="text-[9px] text-muted-foreground ml-auto font-mono tabular-nums">{projData.bias.probability}%</span>
                </div>
                <div className="space-y-0.5">
                  {projData.bias.factors?.slice(0, 4).map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 text-[9px]">
                      <span className={cn("w-1 h-1 rounded-full shrink-0",
                        f.signal === 'bullish' ? "bg-[var(--trade-bullish)]" : f.signal === 'bearish' ? "bg-[var(--trade-bearish)]" : "bg-muted-foreground"
                      )} />
                      <span className="text-muted-foreground/70 truncate">{f.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Intelligence Score */}
            {intelData?.unifiedScore && (
              <div className="p-2.5 rounded-md bg-card/50 border border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <Brain className="w-3 h-3 text-purple-400" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-mono">Score</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xl font-bold font-mono tabular-nums",
                    intelData.unifiedScore.score >= 60 ? "text-[var(--trade-bullish)]" :
                    intelData.unifiedScore.score >= 40 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bearish)]"
                  )}>{intelData.unifiedScore.score}</span>
                  <div className="min-w-0">
                    <div className={cn("text-[10px] font-semibold", trendColor(intelData.unifiedScore.direction?.toUpperCase()))}>
                      {intelData.unifiedScore.direction?.toUpperCase()}
                    </div>
                    <div className="text-[8px] text-muted-foreground/50 truncate">{intelData.unifiedScore.thesis}</div>
                  </div>
                </div>
              </div>
            )}

            {/* VIX */}
            {intelData?.vixRegime && (
              <div className="p-2.5 rounded-md bg-card/50 border border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-3 h-3 text-[var(--trade-neutral)]" />
                    <span className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-mono">VIX</span>
                  </div>
                  <Badge variant="outline" className={cn("text-[7px] px-1 py-0 font-mono",
                    intelData.vixRegime.regime?.regime === 'fear' ? "text-[var(--trade-neutral)]" :
                    intelData.vixRegime.regime?.regime === 'panic' ? "text-[var(--trade-bearish)]" :
                    "text-[var(--trade-bullish)]"
                  )}>{intelData.vixRegime.regime?.regime?.toUpperCase()}</Badge>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className={cn("text-lg font-bold font-mono tabular-nums",
                    intelData.vixRegime.vix > 30 ? "text-[var(--trade-bearish)]" : intelData.vixRegime.vix > 20 ? "text-[var(--trade-neutral)]" : "text-[var(--trade-bullish)]"
                  )}>{safeToFixed(intelData.vixRegime.vix, 1)}</span>
                  <span className="text-[8px] text-muted-foreground/40 font-mono">{intelData.vixRegime.regime?.percentile}th pct</span>
                </div>
              </div>
            )}

            {/* GEX */}
            {intelData?.gex && (
              <div className="p-2.5 rounded-md bg-card/50 border border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="w-3 h-3 text-cyan-400" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-mono">Gamma</span>
                  <Badge variant="outline" className={cn("text-[7px] px-1 py-0 ml-auto font-mono",
                    intelData.gex.regime === 'positive' ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                  )}>{intelData.gex.regime}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px]">
                  <div>
                    <span className="text-muted-foreground/50">Anchor</span>
                    <div className="font-mono font-bold text-foreground tabular-nums">${intelData.gex.maxGammaStrike}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50">Flip</span>
                    <div className="font-mono font-bold text-foreground tabular-nums">${intelData.gex.flipPoint}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Momentum */}
            {intelData?.momentum && (
              <div className="p-2.5 rounded-md bg-card/50 border border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <Activity className="w-3 h-3 text-cyan-400" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-mono">Momentum</span>
                </div>
                <div className="flex items-center gap-3 text-[9px]">
                  <div>
                    <span className="text-muted-foreground/50">RSI </span>
                    <span className={cn("font-mono font-bold tabular-nums",
                      intelData.momentum.rsi > 70 ? "text-[var(--trade-bearish)]" : intelData.momentum.rsi < 30 ? "text-[var(--trade-bullish)]" : "text-foreground"
                    )}>{safeToFixed(intelData.momentum.rsi, 0)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50">EMA </span>
                    <span className={cn("font-mono",
                      intelData.momentum.emaAlignment === 'bullish' ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                    )}>{intelData.momentum.emaAlignment}</span>
                  </div>
                </div>
              </div>
            )}

            {/* PCR */}
            {intelData?.pcr && (
              <div className="p-2.5 rounded-md bg-card/50 border border-border">
                <div className="flex items-center gap-1.5 mb-1">
                  <BarChart3 className="w-3 h-3 text-blue-400" />
                  <span className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-mono">P/C Ratio</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-base font-bold font-mono tabular-nums",
                    intelData.pcr.volumeRatio < 0.8 ? "text-[var(--trade-bullish)]" : intelData.pcr.volumeRatio > 1.2 ? "text-[var(--trade-bearish)]" : "text-foreground"
                  )}>{safeToFixed(intelData.pcr.volumeRatio, 2)}</span>
                  <span className="text-[8px] text-muted-foreground/50">{intelData.pcr.interpretation}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Sector Pulse (bottom strip) ── */}
        {projData?.sectors?.length > 0 && (
          <Card className="bg-card/30 border-border">
            <CardContent className="p-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[8px] text-muted-foreground uppercase tracking-[0.1em] font-mono">Sectors</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {projData.sectors.slice(0, 16).map((s: any) => (
                  <div key={s.etf} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-muted/20 text-[9px] font-mono">
                    <span className="text-muted-foreground/60">{s.etf}</span>
                    <span className={cn("font-semibold tabular-nums",
                      s.changePct > 0 ? "text-[var(--trade-bullish)]" : s.changePct < 0 ? "text-[var(--trade-bearish)]" : "text-muted-foreground"
                    )}>{s.changePct > 0 ? '+' : ''}{s.changePct}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
