/**
 * WatchlistSidebar — reusable approved-watchlist rail
 * ====================================================
 * Compact vertical list of the user's approved tickers grouped by tier (S/A/INDEX/SECONDARY).
 * Used on /trade-desk, /command, /scanner.
 *
 * Each row is keyboard + click selectable; supports live price + change %.
 * Pulls tier metadata from `shared/approved-tickers.ts`.
 */

import { useMemo, useState } from 'react';
import { Search, Star, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  S_TIER,
  A_TIER,
  INDEX_TICKERS,
  SECONDARY,
  CRYPTO_TICKERS,
} from '../../../../shared/approved-tickers';

export interface WatchlistQuote {
  symbol: string;
  price?: number | null;
  changePct?: number | null;
}

export interface WatchlistSidebarProps {
  /** Currently selected ticker (highlighted) */
  selected?: string;
  /** Selection callback */
  onSelect: (symbol: string) => void;
  /** Optional live quotes keyed by symbol */
  quotes?: Record<string, WatchlistQuote>;
  /** Show search filter at top */
  searchable?: boolean;
  /** Restrict tiers shown */
  tiers?: Array<'S' | 'A' | 'INDEX' | 'CRYPTO' | 'SECONDARY'>;
  className?: string;
  /** Compact mode hides change % */
  compact?: boolean;
  'data-testid'?: string;
}

interface TierGroup {
  key: 'S' | 'A' | 'INDEX' | 'CRYPTO' | 'SECONDARY';
  label: string;
  symbols: readonly string[];
  accent: string;
}

const TIER_GROUPS: TierGroup[] = [
  {
    key: 'S',
    label: 'S-Tier',
    symbols: S_TIER,
    accent: 'text-[var(--gex-positive)] border-[var(--gex-positive)]/40',
  },
  {
    key: 'A',
    label: 'A-Tier',
    symbols: A_TIER,
    accent: 'text-cyan-300 border-cyan-500/40',
  },
  {
    key: 'INDEX',
    label: 'Index',
    symbols: INDEX_TICKERS,
    accent: 'text-purple-300 border-purple-500/40',
  },
  {
    key: 'CRYPTO',
    label: 'Crypto',
    symbols: CRYPTO_TICKERS,
    accent: 'text-orange-300 border-orange-500/40',
  },
  {
    key: 'SECONDARY',
    label: 'Secondary',
    symbols: SECONDARY,
    accent: 'text-zinc-300 border-zinc-500/40',
  },
];

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1000) return n.toFixed(0);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

function trendIcon(change?: number | null) {
  if (change == null || !Number.isFinite(change)) return <Minus className="w-2.5 h-2.5" />;
  if (change > 0.1) return <TrendingUp className="w-2.5 h-2.5" />;
  if (change < -0.1) return <TrendingDown className="w-2.5 h-2.5" />;
  return <Minus className="w-2.5 h-2.5" />;
}

function changeColor(change?: number | null): string {
  if (change == null || !Number.isFinite(change)) return 'text-muted-foreground';
  if (change > 0) return 'text-[var(--gex-positive)]';
  if (change < 0) return 'text-[var(--gex-negative)]';
  return 'text-muted-foreground';
}

export function WatchlistSidebar({
  selected,
  onSelect,
  quotes = {},
  searchable = true,
  tiers,
  className,
  compact = false,
  'data-testid': testId,
}: WatchlistSidebarProps) {
  const [search, setSearch] = useState('');
  const upperSelected = selected?.toUpperCase();

  const visibleGroups = useMemo(() => {
    const filterTiers = tiers ? new Set(tiers) : null;
    return TIER_GROUPS.filter((g) => !filterTiers || filterTiers.has(g.key))
      .map((g) => ({
        ...g,
        symbols: g.symbols.filter((s) =>
          search ? s.toUpperCase().includes(search.toUpperCase()) : true,
        ),
      }))
      .filter((g) => g.symbols.length > 0);
  }, [search, tiers]);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-md border border-border bg-[var(--surface-raised)]',
        compact ? 'p-2' : 'p-3',
        className,
      )}
      data-testid={testId ?? 'watchlist-sidebar'}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-[var(--gex-positive)]" />
          <span className="text-[11px] uppercase tracking-wider text-foreground font-bold">
            Watchlist
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {visibleGroups.reduce((acc, g) => acc + g.symbols.length, 0)}
        </span>
      </div>

      {/* SEARCH */}
      {searchable && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'w-full pl-7 pr-2 py-1 rounded text-[11px] font-mono',
              'bg-[var(--surface-base)] border border-border',
              'text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:border-cyan-500/50',
            )}
            data-testid="input-watchlist-filter"
          />
        </div>
      )}

      {/* GROUPS */}
      <div className="flex flex-col gap-3 overflow-y-auto max-h-[60vh] -mx-1 px-1">
        {visibleGroups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <span
                className={cn(
                  'text-[9px] uppercase tracking-wider font-bold',
                  group.accent.split(' ')[0],
                )}
              >
                {group.label}
              </span>
              <span className="text-[9px] text-muted-foreground tabular-nums">
                {group.symbols.length}
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              {group.symbols.map((sym) => {
                const quote = quotes[sym];
                const isSelected = upperSelected === sym;
                return (
                  <button
                    type="button"
                    key={sym}
                    onClick={() => onSelect(sym)}
                    className={cn(
                      'flex items-center justify-between gap-2 px-2 py-1 rounded text-left transition-colors',
                      isSelected
                        ? 'bg-[var(--gex-positive)]/15 border border-[var(--gex-positive)]/40'
                        : 'border border-transparent hover:bg-[var(--surface-base)] hover:border-border',
                    )}
                    data-testid={`watchlist-${sym}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          'font-mono font-bold text-[11px] tracking-tight',
                          isSelected ? 'text-[var(--gex-positive)]' : 'text-foreground',
                        )}
                      >
                        {sym}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {quote?.price != null && (
                        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          {fmtPrice(quote.price)}
                        </span>
                      )}
                      {!compact && quote?.changePct != null && (
                        <span
                          className={cn(
                            'flex items-center gap-0.5 font-mono text-[10px] tabular-nums',
                            changeColor(quote.changePct),
                          )}
                        >
                          {trendIcon(quote.changePct)}
                          {quote.changePct >= 0 ? '+' : ''}
                          {quote.changePct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {visibleGroups.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-4">No matches</div>
        )}
      </div>
    </div>
  );
}
