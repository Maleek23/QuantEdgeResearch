/**
 * CommandBottomPanels — bottom-row 2-column panel pair sitting under the
 * chart on the command page:
 *
 *   ┌──────────────┐ ┌──────────────┐
 *   │  KEY LEVELS  │ │ GAMMA HEATMAP│
 *   └──────────────┘ └──────────────┘
 *
 * Extracted from `pages/gex-command.tsx` so the page shell reads as a
 * clean orchestrator. Both panels are tightly coupled to the GEX terminal
 * snapshot shape so they live together rather than splitting into two
 * files for one-call-site components.
 */

import { useState } from 'react';
import { GEXHeatmapGrid } from '@/components/gex/gex-heatmap-grid';
import { GEXExpiryMatrix } from '@/components/gex/gex-expiry-matrix';
import { GEXLevelBadge } from '@/components/gex/gex-level-badge';
import { formatGEX, formatGammaPct } from '../../../../shared/gex-types';
import type { GEXSnapshot, HeatmapCell, StrikeExpiryCell } from '../../../../shared/gex-types';
import { cn } from '@/lib/utils';

interface CommandBottomPanelsProps {
  snapshot: GEXSnapshot;
  heatmap: HeatmapCell[];
  strikeExpiryMatrix?: StrikeExpiryCell[];
  /** Pass-through: which expiry labels to show (all if undefined) */
  visibleExpiries?: string[];
}

export function CommandBottomPanels({ snapshot, heatmap, strikeExpiryMatrix, visibleExpiries }: CommandBottomPanelsProps) {
  const [heatmapMode, setHeatmapMode] = useState<'time' | 'expiry'>(
    strikeExpiryMatrix && strikeExpiryMatrix.length > 0 ? 'expiry' : 'time',
  );
  const hasMatrix = strikeExpiryMatrix && strikeExpiryMatrix.length > 0;
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* KEY LEVELS */}
      <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--gex-positive)]/15 bg-[var(--surface-base)]/50">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
            KEY LEVELS
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">
            {snapshot.levels.length} strikes
          </div>
        </div>
        <div className="p-3 space-y-1.5 max-h-[340px] overflow-y-auto">
          {snapshot.levels.slice(0, 12).map((lvl) => (
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

      {/* HEATMAP / EXPIRY MATRIX */}
      <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--gex-positive)]/15 bg-[var(--surface-base)]/50">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
            {heatmapMode === 'expiry' ? 'STRIKE × EXPIRY' : 'GAMMA HEATMAP'}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[9px] font-mono text-muted-foreground">
              {heatmapMode === 'expiry' ? `${strikeExpiryMatrix?.length ?? 0} cells` : `${heatmap.length} cells`}
            </div>
            {hasMatrix && (
              <div className="flex rounded-md border border-border overflow-hidden ml-1">
                <button
                  type="button"
                  onClick={() => setHeatmapMode('expiry')}
                  className={cn(
                    'px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest transition-colors',
                    heatmapMode === 'expiry'
                      ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  EXPIRY
                </button>
                <button
                  type="button"
                  onClick={() => setHeatmapMode('time')}
                  className={cn(
                    'px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest transition-colors border-l border-border',
                    heatmapMode === 'time'
                      ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  TIME
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="p-3 max-h-[340px] overflow-y-auto">
          {heatmapMode === 'expiry' && hasMatrix ? (
            <GEXExpiryMatrix matrix={strikeExpiryMatrix!} snapshot={snapshot} visibleExpiries={visibleExpiries} />
          ) : (
            <GEXHeatmapGrid cells={heatmap} spotPrice={snapshot.spotPrice} />
          )}
        </div>
      </div>
    </div>
  );
}
