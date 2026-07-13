/**
 * ComponentBars — MOMO "SIGNAL COMPONENTS": one labeled progress bar per
 * conviction layer (technical, flow, regime, freshness, ...). Bound to the
 * real `layers[]` on a ConvictionPick. Bar fill = layer points; tone follows
 * sign (positive points support the trade direction → green, negative → red).
 */
import { cn } from '@/lib/utils';
import { LAYER_TAG, layerBarPct, type ConvictionLayer } from '@/lib/convictions';

export function ComponentBars({
  layers,
  className,
  max = 6,
}: {
  layers: ConvictionLayer[];
  className?: string;
  max?: number;
}) {
  const sorted = [...layers].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, max);

  if (sorted.length === 0) {
    return (
      <div className="text-[10px] font-mono text-muted-foreground/60 py-2">
        No component breakdown available.
      </div>
    );
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      {sorted.map((layer, i) => {
        const positive = layer.points >= 0;
        const color = positive ? 'var(--trade-bullish)' : 'var(--trade-bearish)';
        const pct = layerBarPct(layer.points);
        return (
          <div key={`${layer.kind}-${i}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/80">
                {layer.label || LAYER_TAG[layer.kind]}
              </span>
              <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color }}>
                {positive ? '+' : ''}{layer.points}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            {layer.why && (
              <div className="text-[9px] font-mono text-muted-foreground/50 mt-1 truncate">{layer.why}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
