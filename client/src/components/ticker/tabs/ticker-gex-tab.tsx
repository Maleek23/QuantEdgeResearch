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

import { GEXHeatmapGrid } from '@/components/gex/gex-heatmap-grid';
import { GEXLevelBadge } from '@/components/gex/gex-level-badge';
import { formatGEX, formatGammaPct } from '../../../../../shared/gex-types';
import type { GEXTerminalData } from '../../../../../shared/gex-types';

interface TickerGexTabProps {
  data: GEXTerminalData;
}

export function TickerGexTab({ data }: TickerGexTabProps) {
  const { snapshot, heatmap } = data;

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
          <div className="flex items-center gap-3 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>SPOT ${snapshot.spotPrice.toFixed(2)}</span>
            <span className="text-[var(--gex-positive)]">CALL ${snapshot.callWall ?? '—'}</span>
            <span className="text-[var(--gex-negative)]">PUT ${snapshot.putWall ?? '—'}</span>
          </div>
        </div>
        <div className="p-4">
          <GEXHeatmapGrid cells={heatmap} spotPrice={snapshot.spotPrice} />
        </div>
      </div>

      {/* TOP STRIKES + EXPOSURE BREAKDOWN side-by-side */}
      <div className="grid grid-cols-[1fr_320px] gap-4">
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
