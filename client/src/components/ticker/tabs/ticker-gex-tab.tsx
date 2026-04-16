/**
 * TickerGexTab — full GEX/VEX exposure breakdown.
 *
 * This is the "Glitch heatmap" home: a complete per-strike gamma view
 * with the heatmap grid as the hero, key levels listed alongside, and
 * the snapshot's regime/walls/flip surfaced for context.
 *
 * Day 1 of this tab uses the same heatmap+levels pieces the chart
 * workspace uses, but at full width (no chart competing for space) so
 * each cell is large and the standout strikes are obvious. Future
 * iterations will add the per-expiry strike × DTE matrix that the
 * Glitch reference shows.
 */

import { useState } from 'react';
import { GEXHeatmapGrid } from '@/components/gex/gex-heatmap-grid';
import { GEXExpiryMatrix } from '@/components/gex/gex-expiry-matrix';
import { GEXLevelBadge } from '@/components/gex/gex-level-badge';
import { GexHistoryBrowser } from '@/components/gex/gex-history-browser';
import { formatGEX, formatGammaPct } from '../../../../../shared/gex-types';
import type { GEXTerminalData, GEXLevel } from '../../../../../shared/gex-types';
import { cn } from '@/lib/utils';

interface TickerGexTabProps {
  data: GEXTerminalData;
}

export function TickerGexTab({ data }: TickerGexTabProps) {
  const { snapshot, heatmap } = data;
  const hasMatrix = data.strikeExpiryMatrix && data.strikeExpiryMatrix.length > 0;
  const [heatmapView, setHeatmapView] = useState<'bars' | 'table' | 'matrix'>(hasMatrix ? 'matrix' : 'bars');
  const [showHistory, setShowHistory] = useState(false);

  // Top 16 levels by absolute gamma — enough to see the wall structure
  // without drowning the panel in long-tail noise.
  const topLevels = [...snapshot.levels]
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
    .slice(0, 16);

  return (
    <div className="space-y-4 min-w-0">
      {/* HERO: heatmap grid full width */}
      <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--gex-positive)]/15 bg-[var(--surface-base)]/50">
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
              GAMMA HEATMAP
            </div>
            <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
              Strike-level dealer gamma exposure · {heatmap.length} cells
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              <span>SPOT ${snapshot.spotPrice.toFixed(2)}</span>
              <span className="text-[var(--gex-positive)]">CALL ${snapshot.callWall ?? '—'}</span>
              <span className="text-[var(--gex-negative)]">PUT ${snapshot.putWall ?? '—'}</span>
            </div>
            <div className="flex rounded-md border border-border overflow-hidden ml-2">
              <button
                type="button"
                onClick={() => setHeatmapView('bars')}
                className={cn(
                  'px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest transition-colors',
                  heatmapView === 'bars'
                    ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                BARS
              </button>
              <button
                type="button"
                onClick={() => setHeatmapView('table')}
                className={cn(
                  'px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest transition-colors border-l border-border',
                  heatmapView === 'table'
                    ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                TABLE
              </button>
              {hasMatrix && (
                <button
                  type="button"
                  onClick={() => setHeatmapView('matrix')}
                  className={cn(
                    'px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest transition-colors border-l border-border',
                    heatmapView === 'matrix'
                      ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  MATRIX
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="p-4">
          {heatmapView === 'matrix' && hasMatrix ? (
            <GEXExpiryMatrix matrix={data.strikeExpiryMatrix!} snapshot={snapshot} />
          ) : heatmapView === 'bars' ? (
            <GEXHeatmapGrid cells={heatmap} spotPrice={snapshot.spotPrice} />
          ) : (
            <GEXStrikeTable levels={snapshot.levels} spotPrice={snapshot.spotPrice} />
          )}
        </div>
      </div>

      {/* TOP STRIKES + EXPOSURE BREAKDOWN side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--gex-positive)]/15 bg-[var(--surface-base)]/50">
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
              TOP STRIKES BY GAMMA
            </div>
            <div className="text-[9px] font-mono text-muted-foreground">
              {topLevels.length} of {snapshot.levels.length}
            </div>
          </div>
          <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {topLevels.map((lvl) => (
              <div key={lvl.strike} className="flex items-center justify-between gap-2">
                <GEXLevelBadge level={lvl} compact />
                <div className="text-[10px] font-mono text-right">
                  <div className="tabular-nums text-foreground">{formatGEX(lvl.gex)}</div>
                  <div className="text-[9px] text-muted-foreground tabular-nums">
                    {formatGammaPct(lvl.gammaPct)} · OI {lvl.openInterest.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: aggregate exposure + regime */}
        <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 p-3 space-y-3">
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
              EXPOSURE BREAKDOWN
            </div>
            <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
              Net dealer gamma + by side
            </div>
          </div>
          <ExposureRow label="NET GEX" value={formatGEX(snapshot.totalGEX)} tone={snapshot.totalGEX >= 0 ? 'pos' : 'neg'} bold />
          <ExposureRow label="CALL GEX" value={formatGEX(snapshot.callGEX)} tone="pos" />
          <ExposureRow label="PUT GEX" value={formatGEX(snapshot.putGEX)} tone="neg" />
          <ExposureRow label="P/C RATIO" value={snapshot.putCallRatio.toFixed(2)} />
          <div className="border-t border-border/40 pt-2 mt-2">
            <ExposureRow label="MAX γ" value={`$${snapshot.maxGammaStrike.toFixed(0)}`} tone="pos" star />
            <ExposureRow label="CALL WALL" value={snapshot.callWall ? `$${snapshot.callWall.toFixed(0)}` : '—'} tone="pos" />
            <ExposureRow label="PUT WALL" value={snapshot.putWall ? `$${snapshot.putWall.toFixed(0)}` : '—'} tone="neg" />
            <ExposureRow
              label="FLIP"
              value={snapshot.gammaFlipPrice ? `$${snapshot.gammaFlipPrice.toFixed(0)}` : '—'}
            />
          </div>
        </div>
      </div>

      {/* GEX History Toggle + Browser */}
      <div className="rounded-lg bg-[var(--surface-raised)] border border-cyan-500/15 overflow-hidden">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
              GEX TIME MACHINE
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">
              Browse historical gamma profiles by date
            </span>
          </div>
          <span className={cn(
            'text-[9px] font-mono text-cyan-400 transition-transform',
            showHistory && 'rotate-180'
          )}>
            ▼
          </span>
        </button>
        {showHistory && (
          <div className="border-t border-cyan-500/15 p-4">
            <GexHistoryBrowser symbol={data.symbol} />
          </div>
        )}
      </div>
    </div>
  );
}

function GEXStrikeTable({ levels, spotPrice }: { levels: GEXLevel[]; spotPrice: number }) {
  const sorted = [...levels].sort((a, b) => b.strike - a.strike);
  const maxGex = Math.max(...levels.map(l => Math.abs(l.gex)), 0.001);

  const roleBadge = (role: GEXLevel['role']) => {
    const map: Record<string, { label: string; cls: string }> = {
      call_wall: { label: 'CW', cls: 'text-[var(--gex-positive)] bg-[var(--gex-positive)]/10' },
      put_wall: { label: 'PW', cls: 'text-[var(--gex-negative)] bg-[var(--gex-negative)]/10' },
      max_gamma: { label: 'MX', cls: 'text-[var(--gex-star)] bg-[var(--gex-star)]/10' },
      flip: { label: 'FL', cls: 'text-amber-400 bg-amber-400/10' },
      support: { label: 'SP', cls: 'text-[var(--gex-positive)]/60 bg-[var(--gex-positive)]/5' },
      resistance: { label: 'RS', cls: 'text-[var(--gex-negative)]/60 bg-[var(--gex-negative)]/5' },
      neutral: { label: '—', cls: 'text-muted-foreground bg-muted/10' },
    };
    const c = map[role] || map.neutral;
    return (
      <span className={cn('px-1 py-0.5 rounded text-[8px] font-bold', c.cls)}>
        {c.label}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="text-[9px] uppercase tracking-widest text-muted-foreground border-b border-border/40">
            <th className="text-left py-1.5 px-1 font-medium">STRIKE</th>
            <th className="text-center py-1.5 px-1 font-medium">ROLE</th>
            <th className="text-right py-1.5 px-1 font-medium">CALL GEX</th>
            <th className="text-right py-1.5 px-1 font-medium">PUT GEX</th>
            <th className="text-right py-1.5 px-1 font-medium">NET GEX</th>
            <th className="text-right py-1.5 px-1 font-medium">OI</th>
            <th className="text-right py-1.5 px-1 font-medium">γ %</th>
            <th className="text-right py-1.5 px-1 font-medium">DIST</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((lvl) => {
            const isNear = Math.abs(lvl.strike - spotPrice) / spotPrice < 0.003;
            const netPct = Math.abs(lvl.gex) / maxGex * 100;
            return (
              <tr
                key={lvl.strike}
                className={cn(
                  'border-b border-border/20 hover:bg-muted/10 transition-colors',
                  isNear && 'bg-[var(--projection-glow)]/5 ring-1 ring-inset ring-[var(--projection-glow)]/20'
                )}
              >
                <td className="py-1.5 px-1 font-bold tabular-nums">
                  ${lvl.strike.toFixed(0)}
                </td>
                <td className="py-1.5 px-1 text-center">
                  {roleBadge(lvl.role)}
                </td>
                <td className="py-1.5 px-1 text-right tabular-nums text-[var(--gex-positive)]">
                  {lvl.callGex > 0 ? `+${lvl.callGex.toFixed(2)}B` : '—'}
                </td>
                <td className="py-1.5 px-1 text-right tabular-nums text-[var(--gex-negative)]">
                  {lvl.putGex < 0 ? `${lvl.putGex.toFixed(2)}B` : '—'}
                </td>
                <td className={cn(
                  'py-1.5 px-1 text-right tabular-nums font-bold',
                  lvl.gex >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]'
                )}>
                  <div className="flex items-center justify-end gap-1">
                    <div className="w-12 h-2 bg-muted/20 rounded-sm overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-sm',
                          lvl.gex >= 0 ? 'bg-[var(--gex-positive)]' : 'bg-[var(--gex-negative)]'
                        )}
                        style={{ width: `${netPct}%`, opacity: 0.5 }}
                      />
                    </div>
                    {formatGEX(lvl.gex)}
                  </div>
                </td>
                <td className="py-1.5 px-1 text-right tabular-nums text-muted-foreground">
                  {lvl.openInterest.toLocaleString()}
                </td>
                <td className="py-1.5 px-1 text-right tabular-nums text-muted-foreground">
                  {(lvl.gammaPct * 100).toFixed(1)}%
                </td>
                <td className={cn(
                  'py-1.5 px-1 text-right tabular-nums',
                  lvl.distancePct > 0 ? 'text-[var(--gex-positive)]' : lvl.distancePct < 0 ? 'text-[var(--gex-negative)]' : 'text-muted-foreground'
                )}>
                  {lvl.distancePct > 0 ? '+' : ''}{lvl.distancePct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExposureRow({
  label,
  value,
  tone,
  bold,
  star,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  bold?: boolean;
  star?: boolean;
}) {
  const color =
    tone === 'pos'
      ? 'text-[var(--gex-positive)]'
      : tone === 'neg'
        ? 'text-[var(--gex-negative)]'
        : 'text-foreground';
  return (
    <div className="flex items-center justify-between text-[10px] font-mono">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>
        {star && <span className="text-[var(--gex-star)] mr-0.5">★</span>}
        {value}
      </span>
    </div>
  );
}
