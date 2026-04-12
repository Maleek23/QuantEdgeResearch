/**
 * TickerProjectionTab — price projections and scenario analysis.
 * Uses page-level GEXTerminalData (zero-gamma magnet, walls, projection arc).
 */

import { cn, safeToFixed } from '@/lib/utils';
import { Target, TrendingUp, TrendingDown, AlertCircle, ArrowRight } from 'lucide-react';
import type { GEXTerminalData } from '../../../../../shared/gex-types';

interface TickerProjectionTabProps {
  data: GEXTerminalData;
  symbol: string;
}

export function TickerProjectionTab({ data, symbol }: TickerProjectionTabProps) {
  const snap = data.snapshot;
  const spot = snap.spotPrice;
  const projection = snap.zeroGammaProjection;
  const callWall = snap.callWall;
  const putWall = snap.putWall;
  const flip = snap.gammaFlipPrice;

  // Scenario paths
  const scenarios = [
    {
      label: 'BULLISH',
      desc: 'Break above call wall → trend acceleration',
      target: callWall ? callWall * 1.01 : spot * 1.03,
      pct: callWall ? ((callWall * 1.01 - spot) / spot * 100) : 3,
      color: 'text-[var(--trade-bullish)]',
      bgColor: 'bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30',
      condition: 'Price > Call Wall + gamma squeeze trigger',
      probability: snap.regime === 'negative_gamma' ? 'Higher in neg gamma' : 'Lower in pos gamma',
    },
    {
      label: 'NEUTRAL / MAGNET',
      desc: 'Price gravitates toward zero-gamma level',
      target: projection || spot,
      pct: projection ? ((projection - spot) / spot * 100) : 0,
      color: 'text-[var(--brand-cyan)]',
      bgColor: 'bg-[var(--brand-cyan)]/10 border-[var(--brand-cyan)]/30',
      condition: 'Positive gamma regime — dealers absorb moves',
      probability: snap.regime === 'positive_gamma' ? 'Most likely path' : 'Base case',
    },
    {
      label: 'BEARISH',
      desc: 'Break below put wall → vol expansion',
      target: putWall ? putWall * 0.99 : spot * 0.97,
      pct: putWall ? ((putWall * 0.99 - spot) / spot * 100) : -3,
      color: 'text-[var(--trade-bearish)]',
      bgColor: 'bg-[var(--trade-bearish)]/10 border-[var(--trade-bearish)]/30',
      condition: 'Price < Put Wall + negative gamma acceleration',
      probability: snap.regime === 'negative_gamma' ? 'Higher in neg gamma' : 'Lower in pos gamma',
    },
  ];

  // Level map for visual
  const allLevels = [
    callWall && { label: 'CALL WALL', price: callWall, color: 'var(--trade-bullish)' },
    projection && { label: 'MAGNET', price: projection, color: 'var(--brand-cyan)' },
    { label: 'SPOT', price: spot, color: 'var(--foreground)' },
    flip && { label: 'FLIP', price: flip, color: 'rgb(251, 191, 36)' },
    putWall && { label: 'PUT WALL', price: putWall, color: 'var(--trade-bearish)' },
  ].filter(Boolean) as Array<{ label: string; price: number; color: string }>;

  allLevels.sort((a, b) => b.price - a.price);

  const maxPrice = Math.max(...allLevels.map(l => l.price));
  const minPrice = Math.min(...allLevels.map(l => l.price));
  const range = maxPrice - minPrice || 1;

  return (
    <div className="space-y-4">
      {/* Price Map */}
      <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-3">PRICE LEVEL MAP</div>
        <div className="relative space-y-0">
          {allLevels.map((level, i) => {
            const pctFromSpot = ((level.price - spot) / spot * 100);
            const barWidth = ((level.price - minPrice) / range) * 100;
            return (
              <div key={level.label} className="flex items-center gap-3 py-1.5">
                <span className="text-[9px] font-mono uppercase w-16 text-right" style={{ color: level.color }}>
                  {level.label}
                </span>
                <div className="flex-1 relative h-4">
                  <div className="absolute inset-0 bg-muted/10 rounded" />
                  <div
                    className="absolute left-0 top-0 h-full rounded opacity-40"
                    style={{ width: `${barWidth}%`, backgroundColor: level.color }}
                  />
                </div>
                <span className="text-xs font-mono font-bold text-foreground w-20 text-right tabular-nums">
                  ${safeToFixed(level.price, 2)}
                </span>
                <span className={cn(
                  'text-[10px] font-mono w-14 text-right',
                  pctFromSpot > 0 ? 'text-[var(--trade-bullish)]' : pctFromSpot < 0 ? 'text-[var(--trade-bearish)]' : 'text-muted-foreground'
                )}>
                  {level.label === 'SPOT' ? '—' : `${pctFromSpot >= 0 ? '+' : ''}${safeToFixed(pctFromSpot, 1)}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scenario Fan */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">SCENARIO ANALYSIS</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {scenarios.map((s) => (
            <div key={s.label} className={cn('rounded-lg border p-4', s.bgColor)}>
              <div className={cn('text-[10px] font-mono font-bold uppercase mb-1', s.color)}>{s.label}</div>
              <p className="text-[10px] text-muted-foreground mb-2">{s.desc}</p>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] font-mono text-muted-foreground">SPOT</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm font-mono font-bold text-foreground">${safeToFixed(s.target, 2)}</span>
                <span className={cn('text-[10px] font-mono font-bold', s.color)}>
                  ({s.pct >= 0 ? '+' : ''}{safeToFixed(s.pct, 1)}%)
                </span>
              </div>

              <div className="text-[9px] text-muted-foreground space-y-0.5">
                <div><span className="text-muted-foreground/60">IF:</span> {s.condition}</div>
                <div><span className="text-muted-foreground/60">PROB:</span> {s.probability}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Regime Context */}
      <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">REGIME CONTEXT</div>
        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <span className="text-muted-foreground">Gamma Regime: </span>
            <span className={cn('font-bold',
              snap.regime === 'positive_gamma' ? 'text-[var(--trade-bullish)]' :
              snap.regime === 'negative_gamma' ? 'text-[var(--trade-bearish)]' : 'text-amber-400'
            )}>
              {snap.regime.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Vol Regime: </span>
            <span className="font-bold text-foreground">{snap.volatilityRegime.toUpperCase()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Net GEX: </span>
            <span className={cn('font-bold', snap.totalGEX >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
              {snap.totalGEX >= 0 ? '+' : ''}{safeToFixed(snap.totalGEX / 1e9, 2)}B
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Net VEX: </span>
            <span className={cn('font-bold', snap.totalVEX >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
              {snap.totalVEX >= 0 ? '+' : ''}{safeToFixed(snap.totalVEX / 1e9, 2)}B
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          {snap.regime === 'positive_gamma'
            ? 'Positive gamma: dealers sell dips and buy rips. Expect mean-reversion toward the magnet target. Ranges tighten.'
            : snap.regime === 'negative_gamma'
            ? 'Negative gamma: dealers amplify moves. Breakouts trend further. Expect wider ranges and potential gap-fills.'
            : 'Transitional regime: positioning is shifting. Watch for a clear break above call wall or below put wall to establish direction.'}
        </p>
      </div>
    </div>
  );
}
