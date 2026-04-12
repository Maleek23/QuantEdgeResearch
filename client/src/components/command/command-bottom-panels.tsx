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

import { GEXHeatmapGrid } from '@/components/gex/gex-heatmap-grid';
import { GEXLevelBadge } from '@/components/gex/gex-level-badge';
import { formatGEX, formatGammaPct } from '../../../../shared/gex-types';
import type { GEXSnapshot, HeatmapCell } from '../../../../shared/gex-types';

interface CommandBottomPanelsProps {
  snapshot: GEXSnapshot;
  heatmap: HeatmapCell[];
}

export function CommandBottomPanels({ snapshot, heatmap }: CommandBottomPanelsProps) {
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

      {/* HEATMAP */}
      <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--gex-positive)]/15 bg-[var(--surface-base)]/50">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
            GAMMA HEATMAP
          </div>
          <div className="text-[9px] font-mono text-muted-foreground">
            {heatmap.length} cells
          </div>
        </div>
        <div className="p-3 max-h-[340px] overflow-y-auto">
          <GEXHeatmapGrid cells={heatmap} spotPrice={snapshot.spotPrice} />
        </div>
      </div>
    </div>
  );
}
