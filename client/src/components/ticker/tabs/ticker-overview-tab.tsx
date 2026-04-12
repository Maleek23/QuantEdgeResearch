/**
 * TickerOverviewTab — 5-second trader read.
 * Regime, key levels, bias, peers, data quality — all from the
 * page-level GEXTerminalData payload (no extra fetch needed).
 */

import { cn, safeToFixed } from '@/lib/utils';
import { Link } from 'wouter';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Activity,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import type { GEXTerminalData } from '../../../../../shared/gex-types';

interface TickerOverviewTabProps {
  data: GEXTerminalData;
  symbol: string;
}

const REGIME_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  positive_gamma: { label: 'POSITIVE GAMMA', color: 'text-[var(--trade-bullish)]', desc: 'Dealers short gamma — mean-reverting, low vol expected' },
  negative_gamma: { label: 'NEGATIVE GAMMA', color: 'text-[var(--trade-bearish)]', desc: 'Dealers long gamma — trend-following, high vol expected' },
  neutral: { label: 'NEUTRAL', color: 'text-muted-foreground', desc: 'Balanced positioning — no strong directional bias' },
  transitioning: { label: 'TRANSITIONING', color: 'text-amber-400', desc: 'Regime shifting — watch for breakout or reversal' },
};

const VOL_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: 'LOW VOL', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  normal: { label: 'NORMAL', color: 'text-muted-foreground bg-muted/30 border-border' },
  high: { label: 'HIGH VOL', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  extreme: { label: 'EXTREME', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
};

export function TickerOverviewTab({ data, symbol }: TickerOverviewTabProps) {
  const snap = data.snapshot;
  const regime = REGIME_LABELS[snap.regime] || REGIME_LABELS.neutral;
  const vol = VOL_LABELS[snap.volatilityRegime] || VOL_LABELS.normal;
  const projection = snap.zeroGammaProjection;
  const projDist = projection && snap.spotPrice
    ? ((projection - snap.spotPrice) / snap.spotPrice * 100)
    : null;

  const levels = [
    { label: 'Call Wall', value: snap.callWall, icon: TrendingUp, color: 'text-[var(--trade-bullish)]' },
    { label: 'Put Wall', value: snap.putWall, icon: TrendingDown, color: 'text-[var(--trade-bearish)]' },
    { label: 'Gamma Flip', value: snap.gammaFlipPrice, icon: Activity, color: 'text-amber-400' },
    { label: 'Max Gamma', value: snap.maxGammaStrike, icon: Target, color: 'text-[var(--brand-cyan)]' },
  ];

  return (
    <div className="space-y-4">
      {/* Regime + Spot */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">REGIME</div>
          <div className={cn('text-lg font-mono font-bold', regime.color)}>{regime.label}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{regime.desc}</p>
        </div>

        <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">SPOT PRICE</div>
          <div className="text-2xl font-mono font-bold text-foreground tabular-nums">
            ${safeToFixed(snap.spotPrice, 2)}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded border', vol.color)}>
              {vol.label}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              P/C: {safeToFixed(snap.putCallRatio, 2)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">MAGNET TARGET</div>
          {projection ? (
            <>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-mono font-bold text-foreground tabular-nums">
                  ${safeToFixed(projection, 2)}
                </div>
                {projDist !== null && (
                  <span className={cn(
                    'text-xs font-mono font-bold',
                    projDist >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'
                  )}>
                    {projDist >= 0 ? '+' : ''}{safeToFixed(projDist, 2)}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Zero-gamma magnet — price gravitates here</p>
            </>
          ) : (
            <div className="text-sm text-muted-foreground/40">No projection available</div>
          )}
        </div>
      </div>

      {/* Key Structural Levels */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">KEY LEVELS</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {levels.map((l) => {
            const Icon = l.icon;
            const dist = l.value && snap.spotPrice
              ? ((l.value - snap.spotPrice) / snap.spotPrice * 100)
              : null;
            return (
              <div key={l.label} className="rounded-lg border border-border bg-[var(--surface-raised)] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={cn('w-3 h-3', l.color)} />
                  <span className="text-[9px] font-mono uppercase text-muted-foreground">{l.label}</span>
                </div>
                {l.value ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold text-foreground tabular-nums">
                      ${safeToFixed(l.value, 2)}
                    </span>
                    {dist !== null && (
                      <span className={cn(
                        'text-[10px] font-mono',
                        dist >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'
                      )}>
                        {dist >= 0 ? '+' : ''}{safeToFixed(dist, 1)}%
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* GEX Breakdown */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">GAMMA EXPOSURE</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-3 text-center">
            <div className="text-[9px] font-mono uppercase text-muted-foreground">NET GEX</div>
            <div className={cn('text-lg font-mono font-bold tabular-nums', snap.totalGEX >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
              {snap.totalGEX >= 0 ? '+' : ''}{safeToFixed(snap.totalGEX / 1e9, 2)}B
            </div>
          </div>
          <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-3 text-center">
            <div className="text-[9px] font-mono uppercase text-muted-foreground">CALL GEX</div>
            <div className="text-lg font-mono font-bold tabular-nums text-[var(--trade-bullish)]">
              {safeToFixed(snap.callGEX / 1e9, 2)}B
            </div>
          </div>
          <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-3 text-center">
            <div className="text-[9px] font-mono uppercase text-muted-foreground">PUT GEX</div>
            <div className="text-lg font-mono font-bold tabular-nums text-[var(--trade-bearish)]">
              {safeToFixed(snap.putGEX / 1e9, 2)}B
            </div>
          </div>
        </div>
      </div>

      {/* Peers */}
      {data.peers && data.peers.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">PEERS</div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-[var(--surface-raised)] text-[9px] uppercase text-muted-foreground">
                  <th className="px-3 py-1.5 text-left">Symbol</th>
                  <th className="px-3 py-1.5 text-right">Price</th>
                  <th className="px-3 py-1.5 text-right">Change</th>
                  <th className="px-3 py-1.5 text-right">Score</th>
                  <th className="px-3 py-1.5 text-right">Bias</th>
                </tr>
              </thead>
              <tbody>
                {data.peers.slice(0, 8).map((p) => (
                  <tr key={p.symbol} className="border-t border-border/40 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-3 py-1.5">
                      <Link href={`/t/${p.symbol}/overview`}>
                        <span className="text-[var(--brand-teal)] font-semibold hover:text-[var(--brand-cyan)]">{p.symbol}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right text-foreground">${safeToFixed(p.spotPrice, 2)}</td>
                    <td className={cn('px-3 py-1.5 text-right font-semibold',
                      p.changePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'
                    )}>
                      {p.changePct >= 0 ? '+' : ''}{safeToFixed(p.changePct, 2)}%
                    </td>
                    <td className="px-3 py-1.5 text-right text-foreground">{p.score}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded uppercase font-bold',
                        p.bias === 'long' ? 'text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/10' :
                        p.bias === 'short' ? 'text-[var(--trade-bearish)] bg-[var(--trade-bearish)]/10' :
                        'text-muted-foreground bg-muted/30'
                      )}>{p.bias}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Data Quality */}
      {data.dataQuality && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-[var(--surface-raised)]">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[9px] font-mono uppercase text-muted-foreground">DATA QUALITY</span>
          <span className={cn('text-xs font-mono font-bold',
            data.dataQuality.grade === 'A' ? 'text-[var(--trade-bullish)]' :
            data.dataQuality.grade === 'B' ? 'text-[var(--brand-cyan)]' :
            data.dataQuality.grade === 'C' ? 'text-amber-400' : 'text-[var(--trade-bearish)]'
          )}>
            {data.dataQuality.grade} ({data.dataQuality.score}/100)
          </span>
          <span className="text-[9px] font-mono text-muted-foreground ml-auto">
            {data.dataQuality.sourceCount} sources · {data.dataQuality.bestSource}
          </span>
        </div>
      )}
    </div>
  );
}
