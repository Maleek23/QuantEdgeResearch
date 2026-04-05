/**
 * Market Projector
 * ================
 * Next session outlook with probability zones, sector pulse,
 * watchlist setups, and directional bias.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Minus, Activity, BarChart3,
  Calendar, Zap, Target, Clock, ArrowUpRight, ArrowDownRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpectedMove {
  symbol: string;
  currentPrice: number;
  expectedMovePct: number;
  upperBound: number;
  lowerBound: number;
  timeframe: string;
}

interface BiasCheck {
  name: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  detail: string;
  weight: number;
}

interface SectorPulse {
  sector: string;
  etf: string;
  price: number;
  changePct: number;
  trend: string;
  strength: number;
  category: string;
}

interface WatchlistSetup {
  symbol: string;
  price: number;
  changePct: number;
  setup: string;
  direction: string;
  probability: number;
  catalyst: string;
  section: string;
}

interface ProjectorData {
  timestamp: string;
  nextSession: string;
  expectedMoves: ExpectedMove[];
  bias: { direction: string; probability: number; factors: BiasCheck[] };
  sectors: SectorPulse[];
  watchlistSetups: WatchlistSetup[];
  keyEvents: string[];
}

function trendIcon(trend: string) {
  if (trend === 'BULLISH') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (trend === 'BEARISH') return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-slate-500" />;
}

function trendColor(trend: string) {
  if (trend === 'BULLISH') return 'text-emerald-400';
  if (trend === 'BEARISH') return 'text-red-400';
  return 'text-slate-400';
}

function setupBadge(setup: string) {
  const colors: Record<string, string> = {
    REVERSAL: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    BREAKOUT: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    BOUNCE: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    BREAKDOWN: 'bg-red-500/15 text-red-400 border-red-500/30',
    HOLD: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };
  return colors[setup] || colors.HOLD;
}

export default function Projector() {
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly'>('daily');

  const { data, isLoading, refetch } = useQuery<ProjectorData>({
    queryKey: ['/api/projector', timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/projector?timeframe=${timeframe}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
              <Target className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Market Projector</h1>
              <p className="text-xs text-slate-500">
                {data?.nextSession || 'Next session outlook'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant={timeframe === 'daily' ? 'default' : 'outline'}
              onClick={() => setTimeframe('daily')}
              className="h-7 text-xs"
            >Daily</Button>
            <Button
              size="sm" variant={timeframe === 'weekly' ? 'default' : 'outline'}
              onClick={() => setTimeframe('weekly')}
              className="h-7 text-xs"
            >Weekly</Button>
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 text-xs text-slate-400">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-slate-600">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />Computing projection...
          </div>
        ) : data ? (
          <>
            {/* Expected Moves — all index ETFs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {(data.expectedMoves || []).map((em) => (
                <Card key={em.symbol} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">{em.symbol}</span>
                      <span className="text-[10px] text-slate-500">{timeframe}</span>
                    </div>
                    <div className="text-lg font-bold font-mono text-white mb-1">${em.currentPrice.toFixed(2)}</div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[10px] text-red-400 font-mono">${em.lowerBound.toFixed(0)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-800 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500/30 via-slate-600 to-emerald-500/30" />
                        <div className="absolute top-0 bottom-0 w-0.5 bg-white left-1/2 -translate-x-1/2" />
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono">${em.upperBound.toFixed(0)}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 text-center">+/-{em.expectedMovePct}%</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Directional Bias */}
            <div className="grid grid-cols-1 gap-4">
              {/* Directional Bias */}
              <Card className={cn(
                "border",
                data.bias.direction === 'BULLISH' ? "bg-emerald-500/5 border-emerald-500/20" :
                data.bias.direction === 'BEARISH' ? "bg-red-500/5 border-red-500/20" :
                "bg-slate-900/50 border-slate-800"
              )}>
                <CardContent className="p-4">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Directional Bias</div>
                  <div className="flex items-center gap-2 mb-3">
                    {trendIcon(data.bias.direction)}
                    <span className={cn("text-xl font-bold", trendColor(data.bias.direction))}>
                      {data.bias.direction}
                    </span>
                    <span className="text-sm text-slate-400 ml-auto">{data.bias.probability}%</span>
                  </div>
                  <div className="space-y-1.5">
                    {data.bias.factors.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          f.signal === 'bullish' ? "bg-emerald-400" : f.signal === 'bearish' ? "bg-red-400" : "bg-slate-500"
                        )} />
                        <span className="text-slate-400 truncate">{f.detail}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sector Pulse — grouped by category */}
            {[
              { key: 'core', label: 'Core (Your Sectors)', icon: '⚡' },
              { key: 'sector', label: 'S&P Sectors', icon: '📊' },
              { key: 'macro', label: 'Macro Indicators', icon: '🌍' },
            ].map((cat) => {
              const catSectors = data.sectors.filter(s => s.category === cat.key);
              if (catSectors.length === 0) return null;
              return (
                <Card key={cat.key} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm">{cat.icon}</span>
                      <span className="text-sm font-semibold text-white">{cat.label}</span>
                      <span className="text-[10px] text-slate-600 ml-auto">{catSectors.length} ETFs</span>
                    </div>
                    <div className="space-y-2">
                      {catSectors.map((s) => (
                        <div key={s.etf} className="flex items-center gap-3">
                          <span className="text-xs text-slate-400 w-28">{s.sector}</span>
                          <span className="text-xs text-slate-500 font-mono w-12">{s.etf}</span>
                          <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden relative">
                            {s.trend === 'BULLISH' ? (
                              <div className="absolute left-1/2 top-0 bottom-0 bg-emerald-500/60 rounded-r-full"
                                style={{ width: `${Math.min(50, s.strength / 2)}%` }} />
                            ) : s.trend === 'BEARISH' ? (
                              <div className="absolute top-0 bottom-0 bg-red-500/60 rounded-l-full"
                                style={{ width: `${Math.min(50, s.strength / 2)}%`, right: '50%' }} />
                            ) : null}
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-600" />
                          </div>
                          <span className={cn(
                            "text-xs font-mono w-14 text-right",
                            s.changePct > 0 ? "text-emerald-400" : s.changePct < 0 ? "text-red-400" : "text-slate-500"
                          )}>
                            {s.changePct > 0 ? '+' : ''}{s.changePct}%
                          </span>
                          <Badge variant="outline" className={cn("text-[9px] w-16 justify-center", trendColor(s.trend))}>
                            {s.trend}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Watchlist Setups — grouped by TV sections */}
            {[
              { key: 'S-TIER', label: 'S-Tier Weekly', icon: '⭐' },
              { key: 'A-TIER', label: 'A-Tier Weekly', icon: '📊' },
              { key: 'ACTIVE', label: 'Active / Top', icon: '🔥' },
              { key: 'INDEX', label: 'Index ETFs', icon: '🎯' },
            ].map((section) => {
              const sectionSetups = data.watchlistSetups.filter(s => s.section === section.key);
              if (sectionSetups.length === 0) return null;
              const actionable = sectionSetups.filter(s => s.direction !== 'NEUTRAL').length;
              return (
                <Card key={section.key} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm">{section.icon}</span>
                      <span className="text-sm font-semibold text-white">{section.label}</span>
                      {actionable > 0 && (
                        <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">
                          {actionable} setup{actionable > 1 ? 's' : ''}
                        </Badge>
                      )}
                      <span className="text-[10px] text-slate-600 ml-auto">{sectionSetups.length} tickers</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-500">
                            <th className="py-1.5 text-left font-medium">Ticker</th>
                            <th className="py-1.5 text-right font-medium">Price</th>
                            <th className="py-1.5 text-right font-medium">Chg%</th>
                            <th className="py-1.5 text-left font-medium pl-3">Setup</th>
                            <th className="py-1.5 text-left font-medium">Dir</th>
                            <th className="py-1.5 text-right font-medium">Prob</th>
                            <th className="py-1.5 text-left font-medium pl-3">Catalyst</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionSetups.map((s) => (
                            <tr key={s.symbol} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                              <td className="py-1.5 font-mono font-bold text-white">{s.symbol}</td>
                              <td className="py-1.5 text-right font-mono text-slate-300">${s.price}</td>
                              <td className={cn("py-1.5 text-right font-mono",
                                s.changePct > 0 ? "text-emerald-400" : s.changePct < 0 ? "text-red-400" : "text-slate-400"
                              )}>
                                {s.changePct > 0 ? '+' : ''}{s.changePct}%
                              </td>
                              <td className="py-1.5 pl-3">
                                <Badge variant="outline" className={cn("text-[9px]", setupBadge(s.setup))}>
                                  {s.setup}
                                </Badge>
                              </td>
                              <td className="py-1.5">
                                {s.direction === 'LONG' ? (
                                  <span className="flex items-center gap-1 text-emerald-400">
                                    <ArrowUpRight className="w-3 h-3" />LONG
                                  </span>
                                ) : s.direction === 'SHORT' ? (
                                  <span className="flex items-center gap-1 text-red-400">
                                    <ArrowDownRight className="w-3 h-3" />SHORT
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className={cn("py-1.5 text-right font-mono",
                                s.probability >= 70 ? "text-emerald-400" : s.probability >= 60 ? "text-cyan-400" : "text-slate-400"
                              )}>
                                {s.probability}%
                              </td>
                              <td className="py-1.5 pl-3 text-slate-500 max-w-[200px] truncate">{s.catalyst}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Key Events */}
            {data.keyEvents.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold text-white">Key Events</span>
                  </div>
                  <div className="space-y-1.5">
                    {data.keyEvents.map((e, i) => (
                      <div key={i} className="text-xs text-slate-400 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        {e}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
