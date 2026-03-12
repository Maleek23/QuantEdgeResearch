/**
 * GEX Dashboard
 * =============
 * Unified gamma exposure analysis for any stock or index ETF.
 * Combines heatmap, sniper signals, key levels, and AI analysis.
 */

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Crosshair,
  Grid3x3,
  Star,
  Zap,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Brain,
  Layers,
  Search,
  Shield,
} from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & DATA
// ═══════════════════════════════════════════════════════════════════════════

interface GEXHeatmapData {
  symbol: string;
  spotPrice: number;
  expirations: string[];
  strikes: number[];
  heatmap: Record<string, Record<string, number>>;
  flipPoint: number | null;
  maxGammaStrike: number;
  timestamp: string;
}

interface SniperSignal {
  type: 'CALL_WALL' | 'PUT_WALL' | 'FLIP_ZONE' | 'GAMMA_SQUEEZE' | 'EXTREME_NEG';
  strike: number;
  direction: 'LONG' | 'SHORT';
  conviction: 'S+' | 'A' | 'B';
  gexValue: number;
  distance: number;
  distancePct: number;
  reasoning: string;
  targetStrike: number;
  stopStrike: number;
  expiration: string;
}

interface GEXKeyLevels {
  anchor: number;
  flip: number | null;
  defenseLines: number[];
  gexRating: number;
  bias: 'Long Gamma' | 'Short Gamma' | 'Neutral';
  regime: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

function useGEXHeatmap(symbol: string) {
  const ticker = symbol.toUpperCase() === 'SPX' ? 'SPY' : symbol.toUpperCase();
  return useQuery<GEXHeatmapData>({
    queryKey: ['/api/gex-heatmap', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/gex-heatmap/${ticker}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch GEX heatmap');
      return res.json();
    },
    enabled: !!symbol,
    staleTime: 30_000,
    gcTime: 120_000,
    refetchInterval: 60_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatGexValue(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${(val / 1000).toFixed(1)}K`;
  if (abs === 0) return '';
  return String(Math.round(val));
}

function gexCellColor(val: number, maxAbs: number): string {
  if (val === 0 || maxAbs === 0) return '';
  const intensity = Math.min(1, Math.abs(val) / (maxAbs * 0.6));
  if (val > 0) {
    if (intensity > 0.7) return 'bg-emerald-600/70 text-white';
    if (intensity > 0.4) return 'bg-emerald-500/50 text-emerald-100';
    if (intensity > 0.15) return 'bg-emerald-500/25 text-emerald-200';
    return 'bg-emerald-500/10 text-emerald-300';
  } else {
    if (intensity > 0.7) return 'bg-red-600/70 text-white';
    if (intensity > 0.4) return 'bg-red-500/50 text-red-100';
    if (intensity > 0.15) return 'bg-red-500/25 text-red-200';
    return 'bg-red-500/10 text-red-300';
  }
}

function formatExpDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

function aggregateGex(data: GEXHeatmapData): Map<number, number> {
  const agg = new Map<number, number>();
  for (const strike of data.strikes) {
    const row = data.heatmap[String(strike)] || {};
    let total = 0;
    for (const exp of data.expirations) total += row[exp] || 0;
    agg.set(strike, total);
  }
  return agg;
}

function getMaxAbs(agg: Map<number, number>): number {
  let max = 0;
  for (const v of agg.values()) { if (Math.abs(v) > max) max = Math.abs(v); }
  return max;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY LEVELS COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

function computeKeyLevels(data: GEXHeatmapData): GEXKeyLevels {
  const { spotPrice, strikes, expirations, flipPoint, maxGammaStrike } = data;
  const agg = aggregateGex(data);

  const ranked = [...agg.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .filter(([s]) => s !== maxGammaStrike)
    .slice(0, 3)
    .map(([s]) => s)
    .sort((a, b) => b - a);

  // GEX Rating: concentration near spot
  const nearSpotGex = strikes
    .filter(s => Math.abs(s - spotPrice) / spotPrice < 0.02)
    .reduce((sum, s) => sum + Math.abs(agg.get(s) || 0), 0);
  const totalGex = [...agg.values()].reduce((sum, v) => sum + Math.abs(v), 0);
  const concentration = totalGex > 0 ? nearSpotGex / totalGex : 0;
  const gexRating = Math.min(5, Math.max(1, Math.round(concentration * 10 + 1)));

  const bias: GEXKeyLevels['bias'] = !flipPoint ? 'Neutral'
    : spotPrice > flipPoint ? 'Long Gamma' : 'Short Gamma';
  const regime: GEXKeyLevels['regime'] = !flipPoint ? 'NEUTRAL'
    : spotPrice > flipPoint ? 'POSITIVE' : 'NEGATIVE';

  return { anchor: maxGammaStrike, flip: flipPoint, defenseLines: ranked, gexRating, bias, regime };
}

// ═══════════════════════════════════════════════════════════════════════════
// SNIPER SIGNAL DERIVATION
// ═══════════════════════════════════════════════════════════════════════════

function deriveSniperSignals(data: GEXHeatmapData): SniperSignal[] {
  const { spotPrice, strikes, heatmap, expirations, flipPoint, maxGammaStrike } = data;
  const signals: SniperSignal[] = [];
  const agg = aggregateGex(data);
  const maxAbs = getMaxAbs(agg);
  if (maxAbs === 0) return signals;

  const extremeThreshold = maxAbs * 0.5;
  const wallThreshold = maxAbs * 0.35;
  const ascStrikes = [...strikes].sort((a, b) => a - b);
  const today = new Date().toISOString().slice(0, 10);
  const nearestExp = expirations.find(e => e >= today) || expirations[0] || '';

  for (const strike of ascStrikes) {
    const gex = agg.get(strike) || 0;
    const dist = strike - spotPrice;
    const distPct = (dist / spotPrice) * 100;
    if (Math.abs(distPct) > 4) continue;

    if (gex < -extremeThreshold && strike < spotPrice) {
      const nextWallAbove = ascStrikes.find(s => s > spotPrice && (agg.get(s) || 0) > wallThreshold);
      signals.push({
        type: 'EXTREME_NEG', strike, direction: 'LONG',
        conviction: Math.abs(gex) > maxAbs * 0.7 ? 'S+' : 'A',
        gexValue: gex, distance: Math.abs(dist), distancePct: Math.abs(distPct),
        reasoning: `Massive put gamma wall at $${strike} — dealers short gamma, forced to buy dips. High probability bounce zone.`,
        targetStrike: nextWallAbove || strike + Math.abs(dist) * 2,
        stopStrike: strike - Math.abs(dist) * 0.5, expiration: nearestExp,
      });
    }

    if (gex < -extremeThreshold && strike > spotPrice) {
      const nextWallBelow = [...ascStrikes].reverse().find(s => s < spotPrice && (agg.get(s) || 0) > wallThreshold);
      signals.push({
        type: 'EXTREME_NEG', strike, direction: 'SHORT',
        conviction: Math.abs(gex) > maxAbs * 0.7 ? 'S+' : 'A',
        gexValue: gex, distance: Math.abs(dist), distancePct: Math.abs(distPct),
        reasoning: `Extreme negative GEX at $${strike} above spot — vol expansion zone. Dealers amplify moves here.`,
        targetStrike: nextWallBelow || strike - Math.abs(dist) * 2,
        stopStrike: strike + Math.abs(dist) * 0.5, expiration: nearestExp,
      });
    }

    if (gex > extremeThreshold) {
      const isAbove = strike > spotPrice;
      signals.push({
        type: 'CALL_WALL', strike, direction: isAbove ? 'LONG' : 'SHORT',
        conviction: gex > maxAbs * 0.7 ? 'S+' : 'A',
        gexValue: gex, distance: Math.abs(dist), distancePct: Math.abs(distPct),
        reasoning: `Massive call gamma wall at $${strike} — ${isAbove ? 'magnetic target, price gravitates upward' : 'support magnet below, price pinned'}. Dealers hedge by selling into rallies here.`,
        targetStrike: strike,
        stopStrike: isAbove ? spotPrice - Math.abs(dist) * 0.3 : spotPrice + Math.abs(dist) * 0.3,
        expiration: nearestExp,
      });
    }
  }

  if (flipPoint) {
    const flipDist = Math.abs(flipPoint - spotPrice);
    const flipPct = (flipDist / spotPrice) * 100;
    if (flipPct < 2) {
      signals.push({
        type: 'FLIP_ZONE', strike: flipPoint,
        direction: spotPrice > flipPoint ? 'LONG' : 'SHORT',
        conviction: flipPct < 0.5 ? 'S+' : 'A',
        gexValue: agg.get(flipPoint) || 0,
        distance: flipDist, distancePct: flipPct,
        reasoning: spotPrice > flipPoint
          ? `Spot above gamma flip ($${flipPoint}) — positive gamma regime. Dealers dampen moves = mean reversion bias.`
          : `Spot below gamma flip ($${flipPoint}) — negative gamma regime. Dealers amplify moves = trend/momentum bias.`,
        targetStrike: spotPrice > flipPoint ? maxGammaStrike : flipPoint,
        stopStrike: spotPrice > flipPoint ? flipPoint - flipDist * 0.5 : flipPoint + flipDist * 0.5,
        expiration: nearestExp,
      });
    }
  }

  const maxDist = Math.abs(maxGammaStrike - spotPrice);
  const maxDistPct = (maxDist / spotPrice) * 100;
  if (maxDistPct > 0.5 && maxDistPct < 3) {
    signals.push({
      type: 'GAMMA_SQUEEZE', strike: maxGammaStrike,
      direction: maxGammaStrike > spotPrice ? 'LONG' : 'SHORT',
      conviction: maxDistPct < 1 ? 'A' : 'B',
      gexValue: agg.get(maxGammaStrike) || 0,
      distance: maxDist, distancePct: maxDistPct,
      reasoning: `Max gamma concentration at $${maxGammaStrike} — if price approaches, dealer hedging accelerates the move. Squeeze potential.`,
      targetStrike: maxGammaStrike,
      stopStrike: maxGammaStrike > spotPrice ? spotPrice - maxDist * 0.3 : spotPrice + maxDist * 0.3,
      expiration: nearestExp,
    });
  }

  const convictionRank: Record<string, number> = { 'S+': 0, 'A': 1, 'B': 2 };
  signals.sort((a, b) => {
    const cr = (convictionRank[a.conviction] || 2) - (convictionRank[b.conviction] || 2);
    if (cr !== 0) return cr;
    return a.distancePct - b.distancePct;
  });

  return signals.slice(0, 8);
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const INDEX_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'SPX'] as const;

function HeatmapPanel({ data }: { data: GEXHeatmapData }) {
  const { spotPrice, expirations, strikes, heatmap, flipPoint, maxGammaStrike } = data;

  let maxAbs = 0;
  for (const strike of strikes) {
    const row = heatmap[String(strike)];
    if (!row) continue;
    for (const exp of expirations) {
      const v = Math.abs(row[exp] || 0);
      if (v > maxAbs) maxAbs = v;
    }
  }

  const closestStrike = strikes.reduce((prev, curr) =>
    Math.abs(curr - spotPrice) < Math.abs(prev - spotPrice) ? curr : prev
  , strikes[0]);

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Grid3x3 className="w-4 h-4 text-violet-400" /> Heatmap
          </CardTitle>
          <div className="flex items-center gap-4 text-[10px] text-slate-500">
            <span>Spot: <span className="font-mono font-bold text-white">${safeToFixed(spotPrice, 2)}</span></span>
            {flipPoint && <span>Flip: <span className="font-mono font-bold text-violet-400">${safeToFixed(flipPoint, 0)}</span></span>}
            <span>Max γ: <span className="font-mono font-bold text-amber-400">${safeToFixed(maxGammaStrike, 0)}</span></span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-slate-500 px-4 pb-2">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500/60" /><span>Positive (Call γ)</span></div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-500/60" /><span>Negative (Put γ)</span></div>
          <div className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400" /><span>Spot</span></div>
          <div className="flex items-center gap-1"><Zap className="w-3 h-3 text-violet-400" /><span>Flip</span></div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-900">
                <th className="sticky left-0 z-20 bg-slate-900 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-800/50 w-20">
                  Strike
                </th>
                {expirations.map(exp => (
                  <th key={exp} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 min-w-[90px]">
                    {formatExpDate(exp)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strikes.map(strike => {
                const row = heatmap[String(strike)] || {};
                const isSpot = strike === closestStrike;
                const isFlip = flipPoint !== null && strike === flipPoint;
                const isMaxGamma = strike === maxGammaStrike;

                return (
                  <tr
                    key={strike}
                    className={cn(
                      "border-t border-slate-800/30 transition-colors",
                      isSpot && "ring-1 ring-amber-500/40 bg-amber-500/[0.04]",
                      isFlip && !isSpot && "ring-1 ring-violet-500/30",
                    )}
                  >
                    <td className={cn(
                      "sticky left-0 z-10 px-3 py-1.5 font-mono font-bold text-right border-r border-slate-800/50 whitespace-nowrap",
                      isSpot ? "bg-slate-900 text-amber-400" :
                      isFlip ? "bg-slate-900 text-violet-400" :
                      isMaxGamma ? "bg-slate-900 text-white" :
                      "bg-slate-900 text-slate-300"
                    )}>
                      <div className="flex items-center justify-end gap-1">
                        {isSpot && <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                        {isFlip && !isSpot && <Zap className="w-3 h-3 text-violet-400 flex-shrink-0" />}
                        {isMaxGamma && !isSpot && !isFlip && <Crosshair className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                        ${strike}
                      </div>
                    </td>
                    {expirations.map(exp => {
                      const val = row[exp] || 0;
                      const isExtreme = Math.abs(val) > maxAbs * 0.65;
                      return (
                        <td key={exp} className={cn(
                          "px-2 py-1.5 text-center font-mono tabular-nums whitespace-nowrap",
                          gexCellColor(val, maxAbs)
                        )}>
                          <div className="flex items-center justify-center gap-0.5">
                            {isExtreme && val !== 0 && <Zap className="w-3 h-3 flex-shrink-0 opacity-70" />}
                            {formatGexValue(val)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function KeyLevelsPanel({ data, levels }: { data: GEXHeatmapData; levels: GEXKeyLevels }) {
  const { spotPrice } = data;

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Key Levels
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[9px] text-slate-500 uppercase">Anchor</div>
            <div className="text-2xl font-mono font-black text-emerald-400">${levels.anchor}</div>
          </div>
          <div>
            <div className="text-[9px] text-slate-500 uppercase">Flip</div>
            <div className="text-2xl font-mono font-black text-violet-400">
              {levels.flip ? `$${levels.flip}` : 'N/A'}
            </div>
          </div>
        </div>

        <Separator className="bg-slate-800/50" />

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Price</span>
            <span className="font-mono font-bold text-white">${safeToFixed(spotPrice, 2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">GEX Rating</span>
            <span className="font-mono font-bold text-amber-400">{levels.gexRating}/5</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Bias</span>
            <span className={cn(
              "font-bold",
              levels.bias === 'Long Gamma' ? "text-emerald-400" :
              levels.bias === 'Short Gamma' ? "text-red-400" : "text-yellow-400"
            )}>
              {levels.bias}
            </span>
          </div>
        </div>

        <Separator className="bg-slate-800/50" />

        <div>
          <div className="text-[9px] text-slate-500 uppercase font-bold mb-2">Defense Lines</div>
          <div className="space-y-1.5">
            {levels.defenseLines.map((strike, i) => (
              <div key={strike} className="flex justify-between text-sm">
                <span className="text-slate-400">Level {i + 1}</span>
                <span className="font-mono font-bold text-white">${strike}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AIAnalysisPanel({ data, levels }: { data: GEXHeatmapData; levels: GEXKeyLevels }) {
  const { spotPrice } = data;
  const agg = aggregateGex(data);

  const supportWalls = [...agg.entries()]
    .filter(([s, v]) => v > 0 && s <= spotPrice)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2).map(([s]) => s);

  const resistWalls = [...agg.entries()]
    .filter(([s, v]) => v < 0 && s >= spotPrice)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2).map(([s]) => s);

  const outlook = levels.bias === 'Long Gamma'
    ? `Bullish due to strong call gamma at key support levels, indicating potential upward momentum as the price approaches $${levels.anchor}. Currently trading $${safeToFixed(spotPrice, 2)}, holding above the flip which keeps dealers in supportive positioning.`
    : levels.bias === 'Short Gamma'
    ? `Caution — price below gamma flip at $${levels.flip || 'N/A'}. Dealers in negative gamma amplify moves. Expect increased volatility. Key support at ${supportWalls.length > 0 ? '$' + supportWalls[0] : 'N/A'}.`
    : `Neutral gamma regime. Dealers are balanced. Price action likely range-bound between ${supportWalls.length > 0 ? '$' + supportWalls[0] : 'support'} and ${resistWalls.length > 0 ? '$' + resistWalls[0] : 'resistance'}.`;

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5" /> AI Analysis
          </CardTitle>
          <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">{data.symbol}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        <div>
          <div className="text-xs font-bold text-slate-300 mb-1">Outlook</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">{outlook}</p>
        </div>

        <Separator className="bg-slate-800/50" />

        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-slate-300">Levels</span>
            <Badge variant="outline" className={cn(
              "text-[8px] font-bold",
              levels.regime === 'POSITIVE' ? "border-emerald-500/30 text-emerald-400" :
              levels.regime === 'NEGATIVE' ? "border-red-500/30 text-red-400" :
              "border-yellow-500/30 text-yellow-400"
            )}>
              {levels.regime === 'POSITIVE' ? `Brk ${levels.anchor}` : levels.regime === 'NEGATIVE' ? `Def ${levels.flip || ''}` : 'Range'}
            </Badge>
          </div>
          <div className="text-[11px] text-slate-400 space-y-1">
            <div>Sup: {supportWalls.length > 0 ? supportWalls.join(' / ') : 'N/A'}</div>
            <div>Res: {resistWalls.length > 0 ? resistWalls.join(' / ') : 'N/A'}</div>
          </div>
        </div>

        <Separator className="bg-slate-800/50" />

        <div>
          <div className="text-xs font-bold text-slate-300 mb-1">Strategy</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {levels.bias === 'Long Gamma'
              ? `Dealers long gamma — sell vol, buy dips toward $${supportWalls[0] || levels.anchor}. Target: $${levels.anchor}. Mean reversion plays favored.`
              : levels.bias === 'Short Gamma'
              ? `Dealers short gamma — momentum plays. Ride the trend. Risk defined via defense lines. Key pivot: $${levels.flip || 'N/A'}.`
              : `Neutral regime. Range plays between support and resistance. Sell premium strategies favored.`}
          </p>
        </div>

        <Separator className="bg-slate-800/50" />

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-slate-300">Risk</span>
            <Badge variant="outline" className={cn(
              "text-[8px] font-bold",
              levels.gexRating >= 4 ? "border-emerald-500/30 text-emerald-400" :
              levels.gexRating >= 2 ? "border-yellow-500/30 text-yellow-400" :
              "border-red-500/30 text-red-400"
            )}>
              {levels.gexRating}/5
            </Badge>
          </div>
          <p className="text-[11px] text-slate-400">
            {levels.gexRating >= 4
              ? 'High GEX concentration near spot. Dealer activity provides strong support/resistance. Lower risk for directional plays.'
              : levels.gexRating >= 2
              ? 'Moderate GEX. Some dealer influence but price can break through levels. Use wider stops.'
              : 'Low GEX concentration. Dealers have minimal influence. Higher volatility expected.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function GammaWallsPanel({ data }: { data: GEXHeatmapData }) {
  const agg = aggregateGex(data);
  const maxAbs = getMaxAbs(agg);
  const { maxGammaStrike, flipPoint, spotPrice } = data;

  const walls = [...agg.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);

  return (
    <Card className="bg-slate-900/60 border-slate-800/50">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-violet-400" /> Gamma Walls
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-2">
          {walls.map(([strike, gex]) => {
            const pct = maxAbs > 0 ? Math.abs(gex) / maxAbs : 0;
            const isPositive = gex > 0;
            const isAbove = strike > spotPrice;
            return (
              <div key={strike} className="flex items-center gap-3">
                <div className="w-14 text-right">
                  <span className={cn(
                    "font-mono text-xs font-bold",
                    strike === maxGammaStrike ? "text-amber-400" :
                    flipPoint && strike === flipPoint ? "text-violet-400" : "text-white"
                  )}>
                    ${strike}
                  </span>
                </div>
                <div className="flex-1 h-5 bg-slate-800/50 rounded overflow-hidden relative">
                  <div
                    className={cn(
                      "h-full rounded transition-all duration-500",
                      isPositive ? "bg-emerald-500/60" : "bg-red-500/60"
                    )}
                    style={{ width: `${Math.max(pct * 100, 4)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono text-white/80">
                    {formatGexValue(gex)}
                  </span>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[8px] font-bold w-20 justify-center border-slate-700",
                  isPositive ? "text-emerald-400" : "text-red-400"
                )}>
                  {isPositive ? (isAbove ? 'MAGNET ↑' : 'SUPPORT') : (isAbove ? 'RESIST' : 'BOUNCE')}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SniperSignalsPanel({ data }: { data: GEXHeatmapData }) {
  const signals = deriveSniperSignals(data);
  const { spotPrice } = data;

  if (signals.length === 0) {
    return (
      <Card className="bg-slate-900/60 border-slate-800/50 p-6 text-center">
        <Crosshair className="w-8 h-8 text-slate-700 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No sniper signals detected</p>
        <p className="text-[10px] text-slate-600 mt-1">Signals generate when extreme GEX concentrations appear near spot</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Crosshair className="w-4 h-4 text-red-400" />
        <span className="text-sm font-bold text-white">Sniper Signals</span>
        <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400">{signals.length} detected</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {signals.map((sig, idx) => (
          <Card
            key={`${sig.strike}-${sig.type}-${idx}`}
            className={cn(
              "border overflow-hidden",
              sig.conviction === 'S+'
                ? "bg-gradient-to-br from-red-950/40 to-slate-900/60 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                : sig.conviction === 'A'
                  ? "bg-gradient-to-br from-amber-950/20 to-slate-900/60 border-amber-500/20"
                  : "bg-slate-900/60 border-slate-800/50"
            )}
          >
            <CardContent className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center",
                    sig.direction === 'LONG' ? "bg-emerald-500/15" : "bg-red-500/15"
                  )}>
                    {sig.direction === 'LONG'
                      ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                      : <TrendingDown className="w-4 h-4 text-red-400" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">${sig.strike}</span>
                      <Badge variant="outline" className={cn(
                        "text-[8px] font-bold",
                        sig.direction === 'LONG' ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"
                      )}>
                        {sig.direction}
                      </Badge>
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono">
                      {sig.type.replace(/_/g, ' ')} · {sig.distancePct.toFixed(1)}% from spot
                    </div>
                  </div>
                </div>
                <div className={cn(
                  "text-lg font-black",
                  sig.conviction === 'S+' ? "text-red-400" :
                  sig.conviction === 'A' ? "text-amber-400" : "text-slate-400"
                )}>
                  {sig.conviction}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-800/40 rounded px-2 py-1.5">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Entry Zone</div>
                  <div className="text-xs font-mono font-bold text-white">${safeToFixed(spotPrice, 2)}</div>
                </div>
                <div className="bg-slate-800/40 rounded px-2 py-1.5">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-emerald-500">Target</div>
                  <div className="text-xs font-mono font-bold text-emerald-400">${safeToFixed(sig.targetStrike, 0)}</div>
                </div>
                <div className="bg-slate-800/40 rounded px-2 py-1.5">
                  <div className="text-[8px] font-bold uppercase tracking-wider text-red-500">Stop</div>
                  <div className="text-xs font-mono font-bold text-red-400">${safeToFixed(sig.stopStrike, 0)}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px]">
                <Zap className={cn("w-3 h-3", sig.gexValue > 0 ? "text-emerald-400" : "text-red-400")} />
                <span className="text-slate-400">Net GEX:</span>
                <span className={cn("font-mono font-bold", sig.gexValue > 0 ? "text-emerald-400" : "text-red-400")}>
                  {formatGexValue(sig.gexValue)}
                </span>
                {sig.expiration && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500">Exp: {formatExpDate(sig.expiration)}</span>
                  </>
                )}
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed">{sig.reasoning}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function GEXDashboard() {
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const initialSymbol = params.get('symbol')?.toUpperCase() || 'SPY';

  const [inputSymbol, setInputSymbol] = useState(initialSymbol);
  const [activeSymbol, setActiveSymbol] = useState(initialSymbol);
  const { data, isLoading, isError, refetch, isFetching } = useGEXHeatmap(activeSymbol);

  const isProxy = activeSymbol === 'SPX';
  const levels = data ? computeKeyLevels(data) : null;

  function handleSearch() {
    const sym = inputSymbol.trim().toUpperCase();
    if (sym) {
      setActiveSymbol(sym);
      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.set('symbol', sym);
      window.history.replaceState({}, '', url.toString());
    }
  }

  function handleQuickSelect(sym: string) {
    setInputSymbol(sym);
    setActiveSymbol(sym);
    const url = new URL(window.location.href);
    url.searchParams.set('symbol', sym);
    window.history.replaceState({}, '', url.toString());
  }

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 font-mono">GAMMA // EXPOSURE</div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Crosshair className="w-6 h-6 text-red-400" />
              GEX Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {levels && (
              <Badge variant="outline" className={cn(
                "text-xs font-bold",
                levels.regime === 'POSITIVE' ? "border-emerald-500/30 text-emerald-400" :
                levels.regime === 'NEGATIVE' ? "border-red-500/30 text-red-400" :
                "border-yellow-500/30 text-yellow-400"
              )}>
                {levels.regime === 'POSITIVE' ? 'POSITIVE γ — MEAN REVERT' :
                 levels.regime === 'NEGATIVE' ? 'NEGATIVE γ — MOMENTUM' : 'NEUTRAL γ'}
              </Badge>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Symbol Bar ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Quick-select */}
          <div className="flex gap-1">
            {INDEX_SYMBOLS.map(sym => (
              <button
                key={sym}
                onClick={() => handleQuickSelect(sym)}
                className={cn(
                  "text-xs font-bold px-3 py-1.5 rounded-lg border transition-all duration-200",
                  activeSymbol === sym
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "border-slate-800/50 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                )}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Any symbol... PLTR, NVDA, AAPL"
                value={inputSymbol}
                onChange={e => setInputSymbol(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-3 py-1.5 text-sm bg-slate-900/60 border border-slate-800/50 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/25 transition-colors"
            >
              Go
            </button>
          </div>

          {/* Active symbol display */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{activeSymbol}</span>
            {isProxy && <span className="text-[9px] text-slate-500">(via SPY)</span>}
            {data && <span className="text-sm font-mono text-slate-400">${safeToFixed(data.spotPrice, 2)}</span>}
          </div>
        </div>

        {/* ── Loading / Error ── */}
        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3 h-[500px] bg-slate-900/60 border border-slate-800/50 rounded-lg animate-pulse" />
              <div className="space-y-4">
                <div className="h-64 bg-slate-900/60 border border-slate-800/50 rounded-lg animate-pulse" />
                <div className="h-64 bg-slate-900/60 border border-slate-800/50 rounded-lg animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {isError && !isLoading && (
          <Card className="bg-slate-900/60 border-slate-800/50 p-8 text-center">
            <p className="text-red-400 mb-2">Failed to load GEX data for {activeSymbol}</p>
            <button onClick={() => refetch()} className="text-xs text-cyan-400 hover:text-cyan-300 font-bold">Retry</button>
          </Card>
        )}

        {/* ── Main Content ── */}
        {data && levels && (
          <>
            {/* Heatmap + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3">
                <HeatmapPanel data={data} />
              </div>
              <div className="space-y-4">
                <KeyLevelsPanel data={data} levels={levels} />
                <AIAnalysisPanel data={data} levels={levels} />
              </div>
            </div>

            {/* Gamma Walls */}
            <GammaWallsPanel data={data} />

            {/* Sniper Signals */}
            <SniperSignalsPanel data={data} />

            {/* Explainer */}
            <Card className="bg-slate-900/40 border-slate-800/30">
              <CardContent className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <Brain className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" />
                  <div className="text-[10px] text-slate-600 leading-relaxed space-y-1">
                    <p><span className="font-bold text-slate-500">GEX Dashboard</span> analyzes dealer gamma exposure across strikes and expirations to identify high-probability trading zones.</p>
                    <p><span className="text-emerald-500">Positive γ</span> = dealers hedge by selling rallies/buying dips (mean reversion). <span className="text-red-500">Negative γ</span> = dealers amplify moves (momentum/trend).</p>
                    <p>Extreme GEX concentrations at specific strikes create magnetic targets and reversal zones — the same levels institutional desks watch.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timestamp */}
            <div className="text-[10px] text-slate-600 text-right">
              Updated: {new Date(data.timestamp).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
