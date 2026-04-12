/**
 * CommandProjectionCard — "Zero-Gamma Projection" summary card that sits
 * below the chart on the command page.
 *
 * Renders the same data as the canvas projection arc (SkylitChart) in
 * text form: target price, % move, confidence. Shown only when the
 * terminal payload includes a projection.
 */

import type { ProjectionArc } from '../../../../shared/gex-types';

interface CommandProjectionCardProps {
  projection: ProjectionArc;
}

export function CommandProjectionCard({ projection }: CommandProjectionCardProps) {
  const movePct =
    ((projection.endPrice - projection.startPrice) / projection.startPrice) * 100;

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--projection-glow)]/30 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--projection-glow)]">
            ZERO-GAMMA PROJECTION
          </div>
          <div className="text-xs font-mono text-muted-foreground mt-0.5">
            Magnet target based on dealer hedging flow
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-mono uppercase text-muted-foreground">TARGET</div>
          <div className="text-2xl font-mono font-bold text-[var(--projection-glow)] tabular-nums">
            ${projection.endPrice.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {movePct.toFixed(2)}% move · conf {(projection.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
    </div>
  );
}
