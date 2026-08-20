/**
 * SignalRow — one card in the ALERT STREAM.
 *
 * A signal is not a static score; it's a position moving through time. So the card
 * reads like a live trade: direction, live P&L, how long it's been open, how far it
 * has travelled toward T1, how much of its time budget is gone, and whether the
 * rating has moved since we started watching it.
 *
 * Colour discipline (lib/oracle/trading-colors): green/red mean direction and P&L
 * only. Progress and time are structural, so they use cyan/amber — otherwise a strong
 * BEARISH setup renders green and reads as bullish.
 */
import { cn } from '@/lib/utils';
import { TickerLogo } from './ticker-logo';
import { tierLabel, convictionPercent, type ConvictionPick } from '@/lib/convictions';
import { geometryFor } from '@/components/oracle/signal-detail';
import { trackScore } from '@/lib/oracle/score-tracker';
import { TC, directionColor, pnlColor, statusColor, riskColor, bandColor, confidenceFill } from '@/lib/oracle/trading-colors';

export function SignalRow({
  pick,
  selected,
  isNew = false,
  live,
  closed = false,
  onClick,
}: {
  pick: ConvictionPick;
  selected: boolean;
  isNew?: boolean;
  /** live price for P&L + progress; falls back to the pick's own price */
  live?: number;
  closed?: boolean;
  onClick: () => void;
}) {
  const color = directionColor(pick.direction);
  const dirWord = pick.direction === 'long' ? 'BULL' : 'BEAR';
  const conf = convictionPercent(pick.convictionScore);
  const px = live ?? pick.currentPrice ?? pick.entryPrice;
  const g = geometryFor(pick, px);
  const rating = trackScore(pick.ideaId, conf);

  const arrow = rating.direction === 'up' ? '▲' : rating.direction === 'down' ? '▼' : null;
  const arrowColor = rating.direction === 'up' ? TC.bull : TC.bear;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full cursor-pointer rounded-lg border p-2.5 text-left transition-all',
        closed && 'opacity-60',
        selected
          ? 'border-l-[3px] bg-foreground/[0.05]'
          : isNew
            ? 'border-[var(--brand-cyan)]/40 bg-card hover:border-[var(--brand-cyan)]/60'
            : 'border-card-border bg-card hover:border-foreground/20',
      )}
      style={selected ? { borderColor: 'var(--card-border)', borderLeftColor: color, boxShadow: `inset 6px 0 16px -10px ${color}` } : undefined}
      data-testid={`signal-row-${pick.symbol}`}
    >
      {/* line 1 — who, which way, P&L, age */}
      <div className="flex items-center gap-2">
        <TickerLogo symbol={pick.symbol} size="sm" />
        <span className="text-[13px] font-mono font-bold tracking-wider text-foreground">{pick.symbol}</span>
        <span className="rounded border px-1 py-px text-[10px] font-mono font-bold tracking-wider"
              style={{ color, borderColor: `${color}55`, background: `${color}14` }}>
          {pick.direction === 'long' ? '▲' : '▼'} {dirWord}
        </span>

        <span className="ml-auto text-[11px] font-mono font-bold tabular-nums" style={{ color: pnlColor(g.pnlPct) }}>
          {g.pnlPct >= 0 ? '+' : ''}{g.pnlPct.toFixed(1)}% P&L
        </span>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70">
          {g.daysHeld < 1 ? '<1d' : `${Math.round(g.daysHeld)}d`}
        </span>
      </div>

      {/* line 2 — status + rating with its arrow */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: closed ? TC.muted : statusColor(g.status) }}>
          {closed ? 'CLOSED' : g.statusLabel}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          {pick.holdingPeriod} · R:R {(pick.riskRewardRatio ?? g.rr).toFixed(1)}
        </span>

        <span className="ml-auto flex items-baseline gap-1">
          <span className="text-[15px] font-mono font-bold leading-none tabular-nums" style={{ color: confidenceFill(conf) }}>{conf}</span>
          {arrow && (
            <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: arrowColor }}
                  title={`Rating ${rating.direction === 'up' ? 'up' : 'down'} ${Math.abs(rating.delta)} since first seen ${rating.hoursTracked < 1 ? 'under an hour' : `${Math.round(rating.hoursTracked)}h`} ago`}>
              {arrow}{Math.abs(rating.delta)}
            </span>
          )}
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">{tierLabel(pick)}</span>
      </div>

      {/* line 3 — progress toward T1 (structural: cyan, not green) */}
      <div className="mt-2">
        <div className="mb-0.5 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          <span>T1</span>
          <span>{g.progressPct.toFixed(0)}% to T1</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-foreground/8">
          <div className="h-full rounded-full transition-all" style={{ width: `${g.progressPct}%`, background: confidenceFill(conf) }} />
        </div>
      </div>

      {/* line 4 — time budget + drawdown */}
      <div className="mt-1.5">
        <div className="mb-0.5 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          <span>Hold</span>
          <span>
            {g.daysHeld < 1 ? '<1' : Math.round(g.daysHeld)}/{g.horizonDays}d
            {g.drawdownPct > 0.05 && (
              <span className="ml-1.5" style={{ color: riskColor(g.drawdownPct * 10) }}>{g.drawdownPct.toFixed(1)}% DD</span>
            )}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-foreground/8">
          <div className="h-full rounded-full transition-all"
               style={{ width: `${g.horizonUsedPct}%`, background: g.horizonUsedPct >= 80 ? TC.bear : g.horizonUsedPct >= 50 ? TC.warn : TC.muted }} />
        </div>
      </div>
    </button>
  );
}
