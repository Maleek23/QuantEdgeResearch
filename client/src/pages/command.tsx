/**
 * Command Center
 * ==============
 * Unified market intelligence: chart + TA/FA sidebar + sector pulse + watchlist setups.
 * Merges SPX Command Center + Market Projector into one page.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StockChart } from "@/components/stock-chart";
import {
  TrendingUp, TrendingDown, Minus, Activity, BarChart3,
  Target, RefreshCw, Zap, ArrowUpRight, ArrowDownRight,
  Shield, Brain, Gauge, Calendar, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface ExpectedMove {
  symbol: string; currentPrice: number; expectedMovePct: number;
  upperBound: number; lowerBound: number; timeframe: string;
}
interface BiasCheck { name: string; signal: string; detail: string; weight: number; }
interface SectorPulse { sector: string; etf: string; price: number; changePct: number; trend: string; strength: number; category: string; }
interface WatchlistSetup { symbol: string; price: number; changePct: number; setup: string; direction: string; probability: number; catalyst: string; section: string; }
interface ProjectorData {
  nextSession: string; expectedMoves: ExpectedMove[];
  bias: { direction: string; probability: number; factors: BiasCheck[] };
  sectors: SectorPulse[]; watchlistSetups: WatchlistSetup[]; keyEvents: string[];
}
interface IntelData {
  vixRegime?: { vix: number; regime: { regime: string; percentile: number; tradingImplication: string }; termStructure: string };
  momentum?: { regime: string; rsi: number; emaAlignment: string; confidence: number; tradingAdvice: string };
  unifiedScore?: { score: number; direction: string; confidence: number; thesis: string };
  gex?: { flipPoint: number; maxGammaStrike: number; regime: string } | null;
  pcr?: { volumeRatio: number; interpretation: string } | null;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function trendColor(t: string) { return t === 'BULLISH' ? 'text-emerald-400' : t === 'BEARISH' ? 'text-red-400' : 'text-slate-400'; }
function trendIcon(t: string) {
  if (t === 'BULLISH' || t === 'bullish') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (t === 'BEARISH' || t === 'bearish') return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-slate-500" />;
}

const SYMBOLS = ['SPY', 'QQQ', 'IWM'] as const;

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function Command() {
  const [symbol, setSymbol] = useState<string>('SPY');
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly'>('daily');
  const chartRange = timeframe === 'daily' ? '1mo' : '3mo';
  const chartInterval = timeframe === 'daily' ? '1d' : '1wk';

  // Projector data (expected moves, bias, sectors, setups)
  const { data: projData, isLoading: projLoading, refetch } = useQuery<ProjectorData>({
    queryKey: ['/api/projector', timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/projector?timeframe=${timeframe}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  // Intelligence data (VIX, GEX, PCR, momentum)
  const { data: intelData } = useQuery<IntelData>({
    queryKey: ['/api/spx/intelligence', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/spx/intelligence?symbol=${symbol}`, { credentials: 'include' });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  // Chart data
  const { data: chartData } = useQuery({
    queryKey: ['/api/historical-prices', symbol, chartRange, chartInterval],
    queryFn: async () => {
      const res = await fetch(`/api/historical-prices/${symbol}?range=${chartRange}&interval=${chartInterval}`, { credentials: 'include' });
      if (!res.ok) return [];
      const d = await res.json();
      return (d.prices || d.data || d || []).map((p: any) => ({
        time: p.date || p.time || '',
        open: p.open, high: p.high, low: p.low, close: p.close, value: p.close,
      }));
    },
    staleTime: 60_000,
  });

  const currentEM = projData?.expectedMoves?.find(em => em.symbol === symbol);

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Target className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Command Center</h1>
              <p className="text-xs text-slate-500">{projData?.nextSession || 'Market Intelligence'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {SYMBOLS.map(s => (
              <Button key={s} size="sm" variant={symbol === s ? 'default' : 'outline'}
                onClick={() => setSymbol(s)} className="h-7 text-xs px-3">{s}</Button>
            ))}
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <Button size="sm" variant={timeframe === 'daily' ? 'default' : 'outline'}
              onClick={() => setTimeframe('daily')} className="h-7 text-xs">Daily</Button>
            <Button size="sm" variant={timeframe === 'weekly' ? 'default' : 'outline'}
              onClick={() => setTimeframe('weekly')} className="h-7 text-xs">Weekly</Button>
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 text-xs text-slate-400">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Main: Chart + Intelligence Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Chart — 3 cols */}
          <div className="lg:col-span-3">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-white">{symbol}</span>
                  {currentEM && (
                    <span className="text-[10px] text-slate-500">
                      +/-{currentEM.expectedMovePct}% expected ({timeframe})
                    </span>
                  )}
                </div>
                {chartData && chartData.length > 0 ? (
                  <StockChart symbol={symbol} data={chartData} height={380} chartType="candlestick" />
                ) : (
                  <div className="h-[380px] flex items-center justify-center text-slate-600">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />Loading chart...
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Intelligence Sidebar — 2 cols */}
          <div className="lg:col-span-2 space-y-3">

            {/* Expected Move */}
            {currentEM && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Expected Move ({timeframe})</div>
                  <div className="text-xl font-bold font-mono text-white">${currentEM.currentPrice.toFixed(2)}</div>
                  <div className="flex items-center gap-1.5 mt-2 mb-1">
                    <span className="text-[10px] text-red-400 font-mono">${currentEM.lowerBound.toFixed(0)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-red-500/30 via-slate-600 to-emerald-500/30" />
                      <div className="absolute top-0 bottom-0 w-0.5 bg-white left-1/2 -translate-x-1/2" />
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono">${currentEM.upperBound.toFixed(0)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Directional Bias */}
            {projData?.bias && (
              <Card className={cn("border",
                projData.bias.direction === 'BULLISH' ? "bg-emerald-500/5 border-emerald-500/20" :
                projData.bias.direction === 'BEARISH' ? "bg-red-500/5 border-red-500/20" :
                "bg-slate-900/50 border-slate-800"
              )}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {trendIcon(projData.bias.direction)}
                    <span className={cn("text-sm font-bold", trendColor(projData.bias.direction))}>
                      {projData.bias.direction}
                    </span>
                    <span className="text-xs text-slate-400 ml-auto">{projData.bias.probability}%</span>
                  </div>
                  <div className="space-y-1">
                    {projData.bias.factors.slice(0, 5).map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                          f.signal === 'bullish' ? "bg-emerald-400" : f.signal === 'bearish' ? "bg-red-400" : "bg-slate-500"
                        )} />
                        <span className="text-slate-400 truncate">{f.detail}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Unified Score */}
            {intelData?.unifiedScore && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Intelligence Score</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("text-2xl font-bold font-mono",
                      intelData.unifiedScore.score >= 60 ? "text-emerald-400" :
                      intelData.unifiedScore.score >= 40 ? "text-amber-400" : "text-red-400"
                    )}>{intelData.unifiedScore.score}</span>
                    <div>
                      <div className={cn("text-xs font-semibold", trendColor(intelData.unifiedScore.direction?.toUpperCase()))}>
                        {intelData.unifiedScore.direction?.toUpperCase()}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[180px]">{intelData.unifiedScore.thesis}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* VIX Regime */}
            {intelData?.vixRegime && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Gauge className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">VIX Regime</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("text-xl font-bold font-mono",
                      intelData.vixRegime.vix > 30 ? "text-red-400" : intelData.vixRegime.vix > 20 ? "text-amber-400" : "text-emerald-400"
                    )}>{intelData.vixRegime.vix.toFixed(1)}</span>
                    <div>
                      <Badge variant="outline" className={cn("text-[9px]",
                        intelData.vixRegime.regime.regime === 'fear' ? "text-amber-400 border-amber-500/30" :
                        intelData.vixRegime.regime.regime === 'panic' ? "text-red-400 border-red-500/30" :
                        "text-emerald-400 border-emerald-500/30"
                      )}>{intelData.vixRegime.regime.regime.toUpperCase()}</Badge>
                      <div className="text-[10px] text-slate-500 mt-0.5">{intelData.vixRegime.regime.percentile}th percentile | {intelData.vixRegime.termStructure}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Momentum */}
            {intelData?.momentum && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Momentum</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">RSI </span>
                      <span className={cn("font-mono font-bold",
                        intelData.momentum.rsi > 70 ? "text-red-400" : intelData.momentum.rsi < 30 ? "text-emerald-400" : "text-white"
                      )}>{intelData.momentum.rsi.toFixed(0)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">EMA </span>
                      <span className={cn("font-mono",
                        intelData.momentum.emaAlignment === 'bullish' ? "text-emerald-400" : "text-red-400"
                      )}>{intelData.momentum.emaAlignment}</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] text-slate-400">{intelData.momentum.regime}</Badge>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{intelData.momentum.tradingAdvice}</div>
                </CardContent>
              </Card>
            )}

            {/* GEX */}
            {intelData?.gex && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Gamma Exposure</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div><span className="text-slate-500">Anchor </span><span className="font-mono text-white">${intelData.gex.maxGammaStrike}</span></div>
                    <div><span className="text-slate-500">Flip </span><span className="font-mono text-white">${intelData.gex.flipPoint}</span></div>
                    <Badge variant="outline" className={cn("text-[9px]",
                      intelData.gex.regime === 'positive' ? "text-emerald-400" : "text-red-400"
                    )}>{intelData.gex.regime}</Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PCR */}
            {intelData?.pcr && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Put/Call Ratio</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={cn("text-lg font-bold font-mono",
                      intelData.pcr.volumeRatio < 0.8 ? "text-emerald-400" : intelData.pcr.volumeRatio > 1.2 ? "text-red-400" : "text-white"
                    )}>{intelData.pcr.volumeRatio.toFixed(2)}</span>
                    <span className="text-slate-500">{intelData.pcr.interpretation}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Sector Pulse */}
        {projData?.sectors && projData.sectors.length > 0 && (
          <>
            {[
              { key: 'core', label: 'Core Sectors', icon: '⚡' },
              { key: 'sector', label: 'S&P Sectors', icon: '📊' },
              { key: 'macro', label: 'Macro Indicators', icon: '🌍' },
            ].map((cat) => {
              const catSectors = projData.sectors.filter(s => s.category === cat.key);
              if (catSectors.length === 0) return null;
              return (
                <Card key={cat.key} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{cat.icon}</span>
                      <span className="text-xs font-semibold text-white">{cat.label}</span>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {catSectors.map(s => (
                        <div key={s.etf} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-800/30">
                          <span className="text-slate-400">{s.etf}</span>
                          <span className={cn("font-mono", s.changePct > 0 ? "text-emerald-400" : s.changePct < 0 ? "text-red-400" : "text-slate-500")}>
                            {s.changePct > 0 ? '+' : ''}{s.changePct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}

        {/* Watchlist Setups */}
        {projData?.watchlistSetups && projData.watchlistSetups.length > 0 && (
          <>
            {[
              { key: 'S-TIER', label: 'S-Tier Weekly', icon: '⭐' },
              { key: 'A-TIER', label: 'A-Tier Weekly', icon: '📊' },
              { key: 'ACTIVE', label: 'Active', icon: '🔥' },
              { key: 'INDEX', label: 'Index', icon: '🎯' },
            ].map(section => {
              const setups = projData.watchlistSetups.filter(s => s.section === section.key);
              if (setups.length === 0) return null;
              const actionable = setups.filter(s => s.direction !== 'NEUTRAL').length;
              return (
                <Card key={section.key} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{section.icon}</span>
                      <span className="text-xs font-semibold text-white">{section.label}</span>
                      {actionable > 0 && <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">{actionable} setups</Badge>}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {setups.map(s => (
                        <div key={s.symbol} className={cn("px-2 py-1.5 rounded text-xs",
                          s.direction === 'LONG' ? "bg-emerald-500/5 border border-emerald-500/10" :
                          s.direction === 'SHORT' ? "bg-red-500/5 border border-red-500/10" :
                          "bg-slate-800/30"
                        )}>
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-white">{s.symbol}</span>
                            <span className={cn("font-mono text-[10px]",
                              s.changePct > 0 ? "text-emerald-400" : s.changePct < 0 ? "text-red-400" : "text-slate-500"
                            )}>{s.changePct > 0 ? '+' : ''}{s.changePct}%</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <Badge variant="outline" className={cn("text-[8px] px-1 py-0",
                              s.setup === 'REVERSAL' ? "text-amber-400 border-amber-500/30" :
                              s.setup === 'BREAKOUT' ? "text-emerald-400 border-emerald-500/30" :
                              s.setup === 'BOUNCE' ? "text-cyan-400 border-cyan-500/30" :
                              "text-slate-500 border-slate-600"
                            )}>{s.setup}</Badge>
                            {s.direction !== 'NEUTRAL' && (
                              <span className={cn("text-[10px] flex items-center gap-0.5",
                                s.direction === 'LONG' ? "text-emerald-400" : "text-red-400"
                              )}>
                                {s.direction === 'LONG' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {s.probability}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}

        {/* Key Events */}
        {projData?.keyEvents && projData.keyEvents.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-semibold text-white">Key Events</span>
              </div>
              <div className="space-y-1">
                {projData.keyEvents.map((e, i) => (
                  <div key={i} className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />{e}
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
