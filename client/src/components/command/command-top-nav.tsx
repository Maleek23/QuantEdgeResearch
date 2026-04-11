/**
 * CommandTopNav — horizontal toolbar that sits above the chart.
 *
 * Responsible for:
 *   • scanner breadcrumb + page tag
 *   • ticker selector (drives /command/:symbol routing)
 *   • cross-link to Trade Desk for the same symbol
 *   • interval segmented picker (5m / 15m / 1h / 1d)
 *   • view mode toggle (orbs / heat / proj / walls)
 *   • refresh button (forces react-query refetch)
 *
 * This used to live inline inside `pages/gex-command.tsx`. Extraction makes
 * the page shell read as a pure orchestrator and lets us unit the toolbar
 * independently (future command variants like mobile can compose it differently).
 */

import { Link } from 'wouter';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { componentStyles } from '@/lib/design-tokens';
import { TickerSelector, ViewModeToggle } from '@/components/shared/ticker-selector';
import type { GEXViewMode } from '../../../../shared/gex-types';

export const COMMAND_INTERVALS = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '1d', label: '1d' },
] as const;

export type CommandInterval = (typeof COMMAND_INTERVALS)[number]['value'];

interface CommandTopNavProps {
  symbol: string;
  onSymbolChange: (next: string) => void;
  interval: string;
  onIntervalChange: (next: CommandInterval) => void;
  mode: GEXViewMode;
  onModeChange: (next: GEXViewMode) => void;
  onRefresh: () => void;
  isFetching: boolean;
}

export function CommandTopNav({
  symbol,
  onSymbolChange,
  interval,
  onIntervalChange,
  mode,
  onModeChange,
  onRefresh,
  isFetching,
}: CommandTopNavProps) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
      {/* LEFT: breadcrumb + ticker picker + cross-link */}
      <div className="flex items-center gap-3">
        <Link
          href="/gex"
          className="text-[10px] font-mono text-muted-foreground hover:text-[var(--gex-positive)] uppercase tracking-widest"
        >
          ← SCANNER
        </Link>
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          02 // COMMAND · {symbol}
        </div>
        <TickerSelector
          value={symbol}
          onChange={onSymbolChange}
          variant="button"
          placeholder="Search ticker…"
          data-testid="gex-command-ticker-selector"
        />
        <Link
          href={`/trade-desk?symbol=${symbol}`}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-widest',
            'border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/60 transition-colors',
          )}
          data-testid="link-trade-desk"
          title="Open this symbol in Trade Desk"
        >
          <ExternalLink className="w-3 h-3" />
          TRADE DESK
        </Link>
      </div>

      {/* RIGHT: interval + mode + refresh */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-md bg-[var(--surface-raised)] border border-border">
          {COMMAND_INTERVALS.map((iv) => (
            <button
              key={iv.value}
              type="button"
              onClick={() => onIntervalChange(iv.value)}
              className={cn(
                'px-2 py-0.5 text-[10px] font-mono font-semibold uppercase rounded-sm',
                interval === iv.value
                  ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`interval-${iv.value}`}
            >
              {iv.label}
            </button>
          ))}
        </div>
        <ViewModeToggle mode={mode} onChange={onModeChange} />
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className={componentStyles.gex.modeButton}
          data-testid="refresh-terminal"
        >
          {isFetching ? '…' : 'REFRESH'}
        </button>
      </div>
    </div>
  );
}
