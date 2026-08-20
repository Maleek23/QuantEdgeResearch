/**
 * SignalComponents — MOMO "SIGNAL COMPONENTS": one labeled progress bar per
 * conviction layer (technical, flow, regime, freshness, ...). Bound to the
 * real `layers[]` on a ConvictionPick. Bar fill = layer points; tone follows
 * sign (positive points support the trade direction → green, negative → red).
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LAYER_TAG, layerBarPct, type ConvictionLayer } from '@/lib/convictions';

export function SignalComponents({
  layers,
  className,
  max = 6,
}: {
  layers: ConvictionLayer[];
  className?: string;
  max?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const ranked = [...layers].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const sorted = expanded ? ranked : ranked.slice(0, max);
  const hiddenCount = ranked.length - sorted.length;

  // The arithmetic behind the number. A 34 built on +41/−7 is a different trade from a 34
  // built on +34 with nothing against it, and the old view hid that entirely — it showed
  // the top 6 bars with no totals and no reasons.
  const plus = ranked.filter((l) => l.points > 0).reduce((s, l) => s + l.points, 0);
  const minus = ranked.filter((l) => l.points < 0).reduce((s, l) => s + l.points, 0);
  const against = ranked.filter((l) => l.points < 0);

  if (ranked.length === 0) {
    return (
      <div className="text-label font-mono text-muted-foreground/60 py-2">
        No component breakdown available.
      </div>
    );
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      {/* the maths, stated */}
      <div className="flex items-baseline justify-between rounded-lg border border-border/40 bg-foreground/[0.03] px-2.5 py-1.5">
        <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/80">
          {ranked.length} layers
        </span>
        <span className="flex items-baseline gap-1.5 font-mono tabular-nums">
          <span className="text-meta" style={{ color: 'var(--trade-bullish)' }}>+{plus}</span>
          {minus < 0 && <span className="text-meta" style={{ color: 'var(--trade-bearish)' }}>{minus}</span>}
          <span className="text-label text-muted-foreground/80">= {plus + minus}</span>
        </span>
      </div>

      {sorted.map((layer, i) => {
        const positive = layer.points >= 0;
        const color = positive ? 'var(--trade-bullish)' : 'var(--trade-bearish)';
        const pct = layerBarPct(layer.points);
        return (
          <div key={`${layer.kind}-${i}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/80">
                {layer.label || LAYER_TAG[layer.kind]}
              </span>
              <span className="text-label font-mono font-bold tabular-nums" style={{ color }}>
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
              <div className="mt-1 text-label font-mono leading-snug text-muted-foreground/70">{layer.why}</div>
            )}
          </div>
        );
      })}

      {(hiddenCount > 0 || expanded) && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full cursor-pointer rounded py-1 text-label font-mono uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          {expanded ? 'Show top only' : `Show all ${ranked.length} layers (+${hiddenCount} hidden)`}
        </button>
      )}

      <p className="text-label leading-relaxed text-muted-foreground/70">
        {against.length === 0
          ? 'Nothing is currently arguing against this setup.'
          : `${against.length} layer${against.length > 1 ? 's are' : ' is'} arguing against it — ${against.map((l) => l.label || LAYER_TAG[l.kind]).join(', ')}. Read those before sizing up.`}
      </p>
    </div>
  );
}
