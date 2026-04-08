/**
 * Geopolitical Market Reaction Matrix
 * ====================================
 * Bloomberg-style scenario prediction dashboard.
 * Models 8 geopolitical events with predicted % moves,
 * historical precedents, and trading plans.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Shield, Clock, AlertTriangle,
  ChevronRight, BarChart3, Target, Zap, History,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface AssetReaction {
  asset: string; label: string;
  move1h: number; move24h: number; move72h: number;
  direction: 'bullish' | 'bearish' | 'neutral';
}

interface HistoricalPrecedent {
  date: string; event: string; spyMove: string; vixMove: string; lesson: string;
}

interface Scenario {
  id: string; name: string; icon: string;
  category: string; likelihood: string;
  description: string;
  reactions: AssetReaction[];
  confidence: number;
  precedents: HistoricalPrecedent[];
  watchpoints: string[];
  sectorImpact: { sector: string; direction: string; magnitude: number }[];
  tradingPlan: string;
}

interface ScenarioMatrix {
  scenarios: Scenario[];
  currentConditions: {
    vix: number | null; spyTrend: string;
    geopoliticalRisk: string; activeScenarios: string[];
  };
  lastUpdated: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function moveColor(val: number) {
  if (val > 0) return 'text-emerald-400';
  if (val < 0) return 'text-red-400';
  return 'text-slate-400';
}

function moveBg(val: number) {
  if (val > 0) return 'bg-emerald-500/10';
  if (val < 0) return 'bg-red-500/10';
  return 'bg-slate-800/30';
}

function likelihoodColor(l: string) {
  if (l === 'HIGH') return 'text-red-400 border-red-500/30 bg-red-500/10';
  if (l === 'MEDIUM') return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  return 'text-slate-400 border-slate-600 bg-slate-800/30';
}

function riskColor(r: string) {
  if (r === 'ELEVATED') return 'text-red-400';
  if (r === 'LOW') return 'text-emerald-400';
  return 'text-amber-400';
}

const TIMEFRAMES = ['1h', '24h', '72h'] as const;

// ─── Main Page ───────────────────────────────────────────────

export default function GeopoliticalMatrix() {
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<typeof TIMEFRAMES[number]>('24h');

  const { data, isLoading } = useQuery<ScenarioMatrix>({
    queryKey: ['/api/geopolitical-scenarios'],
    queryFn: async () => {
      const res = await fetch('/api/geopolitical-scenarios', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 300_000,
  });

  const scenarios = data?.scenarios || [];
  const conditions = data?.currentConditions;
  const active = selectedScenario ? scenarios.find(s => s.id === selectedScenario) : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Geopolitical Reaction Matrix</h1>
              <p className="text-xs text-muted-foreground">Scenario-based market prediction • Historical pattern matching</p>
            </div>
          </div>

          {/* Live Conditions */}
          {conditions && (
            <div className="flex items-center gap-3 text-xs">
              {conditions.vix !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">VIX</span>
                  <span className={cn("font-mono font-bold",
                    conditions.vix > 30 ? "text-red-400" : conditions.vix > 20 ? "text-amber-400" : "text-emerald-400"
                  )}>{conditions.vix}</span>
                </div>
              )}
              <Badge variant="outline" className={cn("text-[9px]", likelihoodColor(conditions.geopoliticalRisk))}>
                {conditions.geopoliticalRisk} RISK
              </Badge>
            </div>
          )}
        </div>

        {/* Timeframe Toggle */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map(tf => (
            <Button key={tf} size="sm" variant={timeframe === tf ? 'default' : 'outline'}
              onClick={() => setTimeframe(tf)} className="h-7 text-xs px-3">
              {tf}
            </Button>
          ))}
          <span className="text-[10px] text-muted-foreground ml-2">Predicted reaction window</span>
        </div>

        {/* Scenario Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {scenarios.map(scenario => {
            const isActive = conditions?.activeScenarios.includes(scenario.id);
            const isSelected = selectedScenario === scenario.id;
            const moveKey = timeframe === '1h' ? 'move1h' : timeframe === '24h' ? 'move24h' : 'move72h';
            const spyMove = scenario.reactions.find(r => r.asset === 'SPY');
            const vixMove = scenario.reactions.find(r => r.asset === 'VIX');

            return (
              <Card key={scenario.id}
                className={cn(
                  "cursor-pointer transition-all hover:border-slate-600",
                  isSelected ? "border-cyan-500/50 bg-cyan-500/5" :
                  isActive ? "border-amber-500/30 bg-amber-500/5" :
                  "border-border bg-card"
                )}
                onClick={() => setSelectedScenario(isSelected ? null : scenario.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{scenario.icon}</span>
                      <div>
                        <div className="text-xs font-semibold text-foreground leading-tight">{scenario.name}</div>
                        <Badge variant="outline" className={cn("text-[8px] mt-0.5", likelihoodColor(scenario.likelihood))}>
                          {scenario.likelihood}
                        </Badge>
                      </div>
                    </div>
                    {isActive && (
                      <Badge variant="outline" className="text-[8px] text-amber-400 border-amber-500/30 animate-pulse">WATCH</Badge>
                    )}
                  </div>

                  {/* Quick asset moves */}
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {scenario.reactions.slice(0, 4).map(r => (
                      <div key={r.asset} className={cn("px-1.5 py-1 rounded text-[10px] flex items-center justify-between", moveBg(r[moveKey]))}>
                        <span className="text-muted-foreground font-mono">{r.asset}</span>
                        <span className={cn("font-mono font-bold", moveColor(r[moveKey]))}>
                          {r[moveKey] > 0 ? '+' : ''}{r[moveKey]}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Confidence bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-cyan-500/60" style={{ width: `${scenario.confidence}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{scenario.confidence}%</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Detailed View */}
        {active && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">

            {/* Full Asset Reaction Table */}
            <Card className="border-cyan-500/20 bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{active.icon}</span>
                  <div>
                    <h2 className="text-sm font-bold">{active.name}</h2>
                    <p className="text-[11px] text-muted-foreground">{active.description}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 px-2 text-left font-medium">Asset</th>
                        <th className="py-2 px-2 text-right font-medium">1H</th>
                        <th className="py-2 px-2 text-right font-medium">24H</th>
                        <th className="py-2 px-2 text-right font-medium">72H</th>
                        <th className="py-2 px-2 text-center font-medium">Direction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.reactions.map(r => (
                        <tr key={r.asset} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-foreground">{r.asset}</span>
                              <span className="text-muted-foreground text-[10px]">{r.label}</span>
                            </div>
                          </td>
                          <td className={cn("py-2 px-2 text-right font-mono", moveColor(r.move1h))}>
                            {r.move1h > 0 ? '+' : ''}{r.move1h}%
                          </td>
                          <td className={cn("py-2 px-2 text-right font-mono font-bold", moveColor(r.move24h))}>
                            {r.move24h > 0 ? '+' : ''}{r.move24h}%
                          </td>
                          <td className={cn("py-2 px-2 text-right font-mono", moveColor(r.move72h))}>
                            {r.move72h > 0 ? '+' : ''}{r.move72h}%
                          </td>
                          <td className="py-2 px-2 text-center">
                            {r.direction === 'bullish'
                              ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                              : <TrendingDown className="w-3.5 h-3.5 text-red-400 mx-auto" />
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Sector Impact + Trading Plan */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Sector Impact */}
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold">Sector Impact</span>
                  </div>
                  <div className="space-y-2">
                    {active.sectorImpact.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-28 truncate">{s.sector}</span>
                        <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden relative">
                          <div
                            className={cn("h-full rounded-full",
                              s.direction === 'up' ? 'bg-emerald-500/60' :
                              s.direction === 'down' ? 'bg-red-500/60' : 'bg-slate-600'
                            )}
                            style={{ width: `${Math.min(100, s.magnitude * 10)}%` }}
                          />
                        </div>
                        <span className={cn("text-[10px] font-mono w-12 text-right",
                          s.direction === 'up' ? 'text-emerald-400' :
                          s.direction === 'down' ? 'text-red-400' : 'text-slate-400'
                        )}>
                          {s.direction === 'up' ? '+' : s.direction === 'down' ? '-' : ''}{s.magnitude}%
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Trading Plan */}
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold">Trading Plan</span>
                  </div>
                  <div className="text-[11px] text-foreground/80 leading-relaxed mb-3 p-2 rounded bg-cyan-500/5 border border-cyan-500/10">
                    {active.tradingPlan}
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Watch Points</span>
                  </div>
                  <div className="space-y-1.5">
                    {active.watchpoints.map((w, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                        <ChevronRight className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Historical Precedents */}
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold">Historical Precedents</span>
                </div>
                <div className="space-y-3">
                  {active.precedents.map((p, i) => (
                    <div key={i} className="p-2 rounded bg-muted/30 border border-border/50">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-muted-foreground">{p.date}</span>
                        <span className="text-[11px] font-semibold text-foreground">{p.event}</span>
                      </div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[10px]">
                          <span className="text-muted-foreground">SPY: </span>
                          <span className={cn("font-mono font-bold",
                            p.spyMove.startsWith('+') ? 'text-emerald-400' : 'text-red-400'
                          )}>{p.spyMove}</span>
                        </span>
                        <span className="text-[10px]">
                          <span className="text-muted-foreground">VIX: </span>
                          <span className={cn("font-mono font-bold",
                            p.vixMove.startsWith('+') ? 'text-red-400' : 'text-emerald-400'
                          )}>{p.vixMove}</span>
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground italic">{p.lesson}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <Zap className="w-5 h-5 animate-pulse mr-2" /> Loading scenario matrix...
          </div>
        )}

        {/* Empty state — no scenario selected */}
        {!active && !isLoading && scenarios.length > 0 && (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="p-8 text-center">
              <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">Select a scenario above to see detailed predictions</p>
              <p className="text-[10px] text-muted-foreground mt-1">Each card shows predicted asset moves, historical precedents, and a trading plan</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
