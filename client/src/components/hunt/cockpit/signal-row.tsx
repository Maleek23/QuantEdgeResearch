/**
 * SignalRow — a single card in the left "ACTIVE SIGNALS" rail.
 * Logo + ticker + direction pill · R:R · big conviction number + tier + sparkline.
 * Selected row gets a colored left border (the MOMO selection treatment).
 */
import { cn } from '@/lib/utils';
import { TickerLogo } from './ticker-logo';
import { tierLabel, directionTone, convictionPercent, type ConvictionPick } from '@/lib/convictions';

export function SignalRow({
  pick,
  selected,
  isNew = false,
  onClick,
}: {
  pick: ConvictionPick;
  selected: boolean;
  isNew?: boolean;
  onClick: () => void;
}) {
  const tone = directionTone(pick.direction);
  const color = tone === 'bull' ? 'var(--trade-bullish)' : 'var(--trade-bearish)';
  const dirWord = pick.direction === 'long' ? 'BULL' : 'BEAR';
  const conf = convictionPercent(pick.convictionScore);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-all cursor-pointer',
        selected
          ? 'bg-foreground/[0.05] border-l-[3px]'
          : isNew
            ? 'bg-card border-[var(--brand-cyan)]/40 hover:border-[var(--brand-cyan)]/60'
            : 'bg-card border-card-border hover:border-foreground/20',
      )}
      style={
        selected
          ? { borderColor: 'var(--card-border)', borderLeftColor: color, boxShadow: `inset 6px 0 16px -10px ${color}` }
          : undefined
      }
      data-testid={`signal-row-${pick.symbol}`}
    >
      {/* top row: identity (left) + conviction number (right) fill the width */}
      <div className="flex items-center gap-2.5">
        <TickerLogo symbol={pick.symbol} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-mono font-bold tracking-wide text-foreground">{pick.symbol}</span>
            <span
              className="text-[9px] font-mono font-bold px-1 py-px rounded"
              style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
            >
              {pick.direction === 'long' ? '▲' : '▼'} {dirWord}
            </span>
            {isNew && (
              <span className="inline-flex items-center gap-0.5 text-[8px] font-mono font-bold uppercase tracking-wider px-1 py-px rounded text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/12 border border-[var(--brand-cyan)]/30">
                <span className="h-1 w-1 rounded-full bg-[var(--brand-cyan)]" />
                NEW
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/60 truncate capitalize">
            {pick.holdingPeriod} · R:R {pick.riskRewardRatio?.toFixed(1) ?? '—'}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-[26px] font-mono font-bold tabular-nums leading-none"
            style={{ color, textShadow: selected ? `0 0 14px ${color}66` : undefined }}
          >
            {conf}
          </div>
          <div className="text-[8px] font-mono font-bold uppercase tracking-widest mt-1" style={{ color }}>
            {tierLabel(pick)}
          </div>
        </div>
      </div>

      {/* conviction strength bar — instant (no network), fills the card and
          gives every row the same footer instead of 40 slow chart fetches */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full bg-foreground/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${conf}%`, background: color }}
          />
        </div>
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/50 shrink-0">conf</span>
      </div>
    </button>
  );
}
