/**
 * FLOW CARD — one options print, read the way the desk reads it.
 *
 * Every field called out in the walkthrough: ticker · strike · expiration · premium
 * spent · % out-of-the-money · per-contract price · direction · score — plus the
 * SWEEP / WHALE / REPEAT badges and a one-click watchlist add.
 *
 * The score is expandable: hovering or opening shows WHY it scored, because the score
 * ranks but never triggers — the chart decides.
 */
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Star, ChevronDown, Zap, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE, DUR } from '@/lib/motion';
import type { FlowPrint, FlowScore } from '@/lib/flow/flow-score';

const BULL = 'var(--trade-bullish,#22c55e)';
const BEAR = 'var(--trade-bearish,#ef4444)';
const CYAN = 'var(--brand-cyan,#22d3ee)';

const TIER_COLOR: Record<FlowScore['tier'], string> = { S: '#e0a458', A: BULL, B: CYAN, C: 'var(--muted,#8b98a8)' };

const money = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K`
  : `$${n.toFixed(0)}`;

function expLabel(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function FlowCard({
  print, score, onWatch, watched, onSelect, className,
}: {
  print: FlowPrint;
  score: FlowScore;
  onWatch?: (symbol: string) => void;
  watched?: boolean;
  onSelect?: (symbol: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const bullish = print.sentiment === 'bullish';
  const tone = print.sentiment === 'neutral' ? CYAN : bullish ? BULL : BEAR;

  return (
    <motion.div
      layout={!reduce}
      className={cn('overflow-hidden rounded-xl border border-card-border bg-card transition-colors hover:border-border', className)}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE }}
      data-testid={`flow-card-${print.symbol}`}
    >
      {/* header: ticker · contract · score */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button
          onClick={() => onSelect?.(print.symbol)}
          className="cursor-pointer text-left"
          aria-label={`Open ${print.symbol}`}
        >
          <div className="text-lead font-mono font-bold tracking-wider text-foreground hover:text-[var(--brand-cyan,#22d3ee)]">
            {print.symbol}
          </div>
          <div className="mt-0.5 text-label font-mono tabular-nums" style={{ color: tone }}>
            ${print.strikePrice}{print.optionType === 'call' ? 'C' : 'P'} · {expLabel(print.expirationDate)}
            {score.dte != null && <span className="text-muted-foreground/70"> · {score.dte}DTE</span>}
          </div>
        </button>

        <div className="ml-auto flex items-start gap-2">
          {/* badges */}
          <div className="flex flex-wrap justify-end gap-1">
            {score.isWhale && (
              <span className="rounded border px-1.5 py-0.5 text-label font-mono font-bold tracking-wider"
                    style={{ color: '#e0a458', borderColor: '#e0a45840', background: '#e0a4581a' }}>
                WHALE
              </span>
            )}
            {score.isSweep && (
              <span className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-label font-mono font-bold tracking-wider"
                    style={{ color: CYAN, borderColor: `${'#22d3ee'}40`, background: '#22d3ee1a' }}>
                <Zap className="h-2.5 w-2.5" /> SWEEP
              </span>
            )}
            {score.isRepeat && (
              <span className="inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-label font-mono font-bold tracking-wider"
                    style={{ color: BULL, borderColor: '#22c55e40', background: '#22c55e1a' }}>
                <Repeat className="h-2.5 w-2.5" /> REPEAT
              </span>
            )}
          </div>

          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Why this score"
            className="flex cursor-pointer flex-col items-center rounded px-1.5 py-0.5 transition-colors hover:bg-foreground/5"
          >
            <span className="text-lead font-mono font-bold leading-none tabular-nums" style={{ color: TIER_COLOR[score.tier] }}>
              {score.score}
            </span>
            <span className="mt-0.5 flex items-center gap-0.5 text-label font-mono uppercase tracking-wider text-muted-foreground/60">
              {score.tier}-tier <ChevronDown className={cn('h-2.5 w-2.5 transition-transform', open && 'rotate-180')} />
            </span>
          </button>
        </div>
      </div>

      {/* the numbers he actually reads */}
      <div className="grid grid-cols-4 gap-px border-t border-border/30 bg-border/20">
        <Cell label="Premium" value={money(score.totalPremium)} strong />
        <Cell label="Per contract" value={`$${score.perContract.toFixed(0)}`} />
        <Cell
          label={score.pctOtm != null && score.pctOtm < 0 ? 'In the money' : 'Out the money'}
          value={score.pctOtm != null ? `${score.pctOtm >= 0 ? '' : ''}${score.pctOtm.toFixed(1)}%` : '—'}
        />
        <Cell label="Direction" value={print.sentiment.toUpperCase()} color={tone} />
      </div>

      {/* score breakdown — why it ranked here */}
      {open && (
        <motion.div
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: DUR.base, ease: EASE }}
          className="border-t border-border/30 px-3 py-2"
        >
          <div className="mb-1.5 text-label font-mono uppercase tracking-widest text-muted-foreground/60">Why this score</div>
          <div className="space-y-1">
            {score.components.map((c) => (
              <div key={c.label} className="flex items-baseline gap-2 text-label font-mono">
                <span className="w-24 shrink-0 uppercase tracking-wider text-muted-foreground/70">{c.label}</span>
                <span className="w-8 shrink-0 tabular-nums font-bold" style={{ color: c.points >= 0 ? BULL : BEAR }}>
                  {c.points >= 0 ? '+' : ''}{c.points}
                </span>
                <span className="text-muted-foreground/60">{c.why}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-label leading-relaxed text-muted-foreground/70">
            Score ranks — it is not a trigger. Confirm the chart has room before acting.
          </p>
        </motion.div>
      )}

      {/* footer actions */}
      <div className="flex items-center gap-2 border-t border-border/30 px-3 py-1.5">
        <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/70">
          {print.volume.toLocaleString()} vol
          {print.openInterest ? ` · ${print.openInterest.toLocaleString()} OI` : ''}
          {print.impliedVolatility ? ` · IV ${(print.impliedVolatility * (print.impliedVolatility > 3 ? 1 : 100)).toFixed(0)}%` : ''}
        </span>
        <button
          onClick={() => onWatch?.(print.symbol)}
          aria-label={watched ? `Remove ${print.symbol} from watchlist` : `Add ${print.symbol} to watchlist`}
          className={cn(
            'ml-auto inline-flex cursor-pointer items-center gap-1 text-label font-mono uppercase tracking-wider transition-colors',
            watched ? 'text-[#e0a458]' : 'text-muted-foreground/70 hover:text-foreground',
          )}
        >
          <Star className={cn('h-3 w-3', watched && 'fill-current')} /> {watched ? 'Watching' : 'Watch'}
        </button>
      </div>
    </motion.div>
  );
}

function Cell({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="bg-card px-2.5 py-1.5">
      <div className="text-label font-mono uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className={cn('mt-0.5 font-mono tabular-nums', strong ? 'text-body font-bold' : 'text-meta')}
           style={{ color: color ?? 'var(--foreground)' }}>
        {value}
      </div>
    </div>
  );
}
