/**
 * ConfluenceRow — single scanner result row with score breakdown visualization.
 * Clickable to navigate to the per-ticker terminal.
 */

import { Link } from 'wouter';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { componentStyles } from '@/lib/design-tokens';
import type { ConfluenceRow as ConfluenceRowData } from '../../../../shared/gex-types';

interface ConfluenceRowProps {
  row: ConfluenceRowData;
  rank: number;
}

export function ConfluenceRow({ row, rank }: ConfluenceRowProps) {
  const scoreStyle =
    row.scoreTier === 'elite' ? componentStyles.gex.scoreElite
    : row.scoreTier === 'strong' ? componentStyles.gex.scoreStrong
    : componentStyles.gex.scoreWeak;

  const biasColor =
    row.bias === 'long' ? 'text-[var(--trade-bullish)]'
    : row.bias === 'short' ? 'text-[var(--trade-bearish)]'
    : 'text-muted-foreground';

  const tierBadge =
    row.tier === 'S' ? 'bg-[var(--grade-s)]/15 border-[var(--grade-s)]/40 text-[var(--grade-s)]'
    : row.tier === 'A' ? 'bg-[var(--grade-a)]/15 border-[var(--grade-a)]/40 text-[var(--grade-a)]'
    : row.tier === 'INDEX' ? 'bg-[var(--brand-gold)]/15 border-[var(--brand-gold)]/40 text-[var(--brand-gold)]'
    : 'bg-muted border-border text-muted-foreground';

  return (
    <Link
      href={`/terminal/${row.symbol}`}
      className="group grid grid-cols-[40px_1fr_120px_1fr_1fr_120px_80px] items-center gap-3 px-4 py-3 rounded-lg bg-[var(--surface-raised)] border border-border hover:border-[var(--gex-positive)]/40 hover:bg-[var(--gex-positive)]/5 transition-all cursor-pointer overflow-hidden"
      data-testid={`confluence-row-${row.symbol}`}
    >
        {/* Rank */}
        <div className="text-[10px] font-mono text-muted-foreground tabular-nums">
          #{rank.toString().padStart(2, '0')}
        </div>

        {/* Ticker + tier + price */}
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn(componentStyles.text.ticker, 'text-base text-foreground group-hover:text-[var(--gex-positive)] shrink-0')}>
            {row.symbol}
          </div>
          {row.tier && (
            <div className={cn('px-1.5 py-0 rounded-sm border text-[9px] font-mono font-bold shrink-0', tierBadge)}>
              {row.tier}
            </div>
          )}
          <div className="flex flex-col shrink-0">
            <div className="text-[11px] font-mono font-semibold tabular-nums text-foreground">
              ${row.spotPrice.toFixed(2)}
            </div>
            <div className={cn('text-[9px] font-mono tabular-nums', row.changePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
              {row.changePct >= 0 ? '+' : ''}{row.changePct.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Score + breakdown bars */}
        <div className="flex items-center gap-2">
          <div className={cn(scoreStyle, 'w-10 justify-center')}>{row.score}</div>
          <div className="flex-1 flex gap-px h-3">
            <Bar value={row.breakdown.flipProximity} max={25} color="var(--gex-positive)" />
            <Bar value={row.breakdown.wallSetup} max={25} color="var(--gex-negative)" />
            <Bar value={row.breakdown.vexAlignment} max={20} color="var(--gex-flip)" />
            <Bar value={row.breakdown.liquidity} max={15} color="var(--brand-cyan)" />
            <Bar value={row.breakdown.regime} max={15} color="var(--brand-teal)" />
          </div>
        </div>

        {/* Key levels */}
        <div className="text-[10px] font-mono space-y-0.5">
          <LevelInline label="FLIP" value={row.gammaFlip} />
          <LevelInline label="MAXγ" value={row.maxGammaStrike} star />
        </div>

        {/* Walls */}
        <div className="text-[10px] font-mono space-y-0.5">
          <LevelInline label="CW" value={row.callWall} color="var(--gex-positive)" />
          <LevelInline label="PW" value={row.putWall} color="var(--gex-negative)" />
        </div>

        {/* Target + RR */}
        <div className="text-[10px] font-mono text-right">
          <div className={cn('font-bold uppercase tracking-wider', biasColor)}>{row.bias}</div>
          <div className="text-foreground tabular-nums">
            {row.target ? `→ $${row.target.toFixed(0)}` : '—'}
          </div>
          {row.riskReward && (
            <div className="text-muted-foreground tabular-nums">RR {row.riskReward.toFixed(1)}</div>
          )}
        </div>

        {/* Cross-link cluster: Trade Desk + arrow */}
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = `/trade-desk?symbol=${row.symbol}`;
            }}
            className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded',
              'border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/60',
              'text-[9px] font-mono font-bold uppercase tracking-wider transition-colors',
            )}
            title={`Open ${row.symbol} in Trade Desk`}
            data-testid={`confluence-row-${row.symbol}-td`}
          >
            <ExternalLink className="w-2.5 h-2.5" />
            TD
          </button>
          <span className="text-muted-foreground group-hover:text-[var(--gex-positive)]">→</span>
        </div>
    </Link>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex-1 bg-black/40 rounded-sm overflow-hidden">
      <div
        className="h-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }}
      />
    </div>
  );
}

function LevelInline({ label, value, color, star }: { label: string; value: number | null; color?: string; star?: boolean }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="text-muted-foreground text-[9px] shrink-0">{label}</span>
      <span className="tabular-nums font-semibold truncate" style={{ color: color || 'var(--foreground)' }}>
        {star && <span className="text-[var(--gex-star)] mr-0.5">★</span>}
        {value ? `$${value.toFixed(0)}` : '—'}
      </span>
    </div>
  );
}
