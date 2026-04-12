/**
 * TickerSelector — Dynamic searchable ticker picker
 * ===================================================
 * Reusable across GEX Hub, Trade Desk, Command Center.
 *
 * Features:
 *   - Type-ahead search with fuzzy matching
 *   - Tier-aware results (S/A/INDEX/SECONDARY badges)
 *   - Recent picks (localStorage, last 8)
 *   - Quick chips for index ETFs (SPY/QQQ/IWM)
 *   - Skylit visual language (yellow/cyan accents)
 *   - Keyboard navigation: ↑↓ to navigate, Enter to select, Esc to close
 *   - Compact and full variants
 *
 * Usage:
 *   <TickerSelector
 *     value={symbol}
 *     onChange={setSymbol}
 *     placeholder="Search ticker..."
 *     watchlistOnly={false}
 *   />
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Star, Clock, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  S_TIER,
  A_TIER,
  INDEX_TICKERS,
  SECONDARY,
  CRYPTO_TICKERS,
  APPROVED_TICKERS,
  getTier,
} from '../../../../shared/approved-tickers';

// ─── Ticker Universe ────────────────────────────────────────

interface TickerEntry {
  symbol: string;
  tier: 'S' | 'A' | 'INDEX' | 'SECONDARY' | 'CRYPTO' | null;
}

const FULL_UNIVERSE: TickerEntry[] = [
  ...INDEX_TICKERS.map((s) => ({ symbol: s, tier: 'INDEX' as const })),
  ...S_TIER.map((s) => ({ symbol: s, tier: 'S' as const })),
  ...A_TIER.map((s) => ({ symbol: s, tier: 'A' as const })),
  ...SECONDARY.map((s) => ({ symbol: s, tier: 'SECONDARY' as const })),
  ...CRYPTO_TICKERS.map((s) => ({ symbol: s, tier: 'CRYPTO' as const })),
];

const TIER_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  MEGA: { label: 'MEGA', bg: 'bg-violet-500/20', text: 'text-violet-300' },
  S: { label: 'S', bg: 'bg-[var(--gex-positive)]/20', text: 'text-[var(--gex-positive)]' },
  A: { label: 'A', bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  INDEX: { label: 'IDX', bg: 'bg-purple-500/20', text: 'text-purple-300' },
  SECONDARY: { label: '2°', bg: 'bg-muted-foreground/15', text: 'text-muted-foreground' },
  CRYPTO: { label: '₿', bg: 'bg-orange-500/20', text: 'text-orange-400' },
};

// ─── LocalStorage helpers ──────────────────────────────────

const RECENT_KEY = 'qe.tickerSelector.recents';
const MAX_RECENTS = 8;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function saveRecent(symbol: string) {
  try {
    const recents = loadRecents().filter((s) => s !== symbol);
    recents.unshift(symbol);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
  } catch { /* ignore */ }
}

// ─── Search ────────────────────────────────────────────────

function fuzzyScore(query: string, symbol: string): number {
  if (!query) return 1;
  const q = query.toUpperCase();
  const s = symbol.toUpperCase();
  if (s === q) return 1000;
  if (s.startsWith(q)) return 500;
  if (s.includes(q)) return 200;
  // Char-by-char fuzzy
  let qi = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) qi++;
  }
  return qi === q.length ? 50 : 0;
}

// ─── Component ─────────────────────────────────────────────

export interface TickerSelectorProps {
  value: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
  /** If true, restrict to approved watchlist only. Default true. */
  watchlistOnly?: boolean;
  /** Compact button-style trigger vs full inline input */
  variant?: 'inline' | 'button';
  /** Show quick chips for index ETFs above results */
  showQuickChips?: boolean;
  className?: string;
  autoFocus?: boolean;
  'data-testid'?: string;
}

export function TickerSelector({
  value,
  onChange,
  placeholder = 'Search ticker…',
  watchlistOnly = true,
  variant = 'inline',
  showQuickChips = true,
  className,
  autoFocus = false,
  'data-testid': testId,
}: TickerSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setRecents(loadRecents());
  }, [open]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Auto-focus when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Filter & rank tickers
  const results = useMemo(() => {
    const universe = watchlistOnly
      ? FULL_UNIVERSE
      : FULL_UNIVERSE; // For now identical — could expand to all S&P later
    if (!query.trim()) {
      // No query → show recents first, then S-tier, then index
      const recentEntries = recents
        .map((sym) => universe.find((u) => u.symbol === sym))
        .filter((e): e is TickerEntry => !!e);
      const seen = new Set(recentEntries.map((r) => r.symbol));
      const rest = universe.filter((u) => !seen.has(u.symbol));
      return [...recentEntries, ...rest].slice(0, 60);
    }
    const scored = universe
      .map((entry) => ({ entry, score: fuzzyScore(query, entry.symbol) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((s) => s.entry);
    return scored;
  }, [query, recents, watchlistOnly]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleSelect = useCallback(
    (symbol: string) => {
      const sym = symbol.toUpperCase();
      saveRecent(sym);
      onChange(sym);
      setOpen(false);
      setQuery('');
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) {
        handleSelect(results[activeIdx].symbol);
      } else if (query.trim()) {
        // Allow free entry if no match
        handleSelect(query.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const currentTier = value ? getTier(value) : null;
  const currentTierStyle = currentTier ? TIER_STYLES[currentTier] : null;

  // ─── Trigger ─────────────────────────────────────────────
  const trigger = variant === 'button' ? (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-md',
        'bg-[var(--surface-raised)] border border-[var(--gex-positive)]/20',
        'hover:border-[var(--gex-positive)]/40 transition-colors',
        'text-sm font-mono font-bold uppercase tracking-wider',
        'text-[var(--gex-positive)]',
        className,
      )}
      data-testid={testId}
    >
      <Search className="w-3.5 h-3.5 opacity-60" />
      <span className="tabular-nums">{value || 'SELECT'}</span>
      {currentTierStyle && (
        <span className={cn('px-1 rounded text-[8px] font-bold', currentTierStyle.bg, currentTierStyle.text)}>
          {currentTierStyle.label}
        </span>
      )}
      <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-2 rounded-md',
        'bg-[var(--surface-raised)] border border-border',
        'hover:border-[var(--gex-positive)]/40 focus-within:border-[var(--gex-positive)]/60',
        'transition-colors text-left',
        className,
      )}
      data-testid={testId}
    >
      <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className="flex-1 text-sm font-mono">
        {value ? (
          <span className="text-foreground font-bold tracking-wider">{value}</span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </span>
      {currentTierStyle && (
        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold', currentTierStyle.bg, currentTierStyle.text)}>
          {currentTierStyle.label}
        </span>
      )}
      <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
    </button>
  );

  return (
    <div ref={containerRef} className="relative inline-block">
      {trigger}

      {/* DROPDOWN */}
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-2 w-[340px] rounded-lg overflow-hidden',
            'bg-[var(--surface-base)] border border-[var(--gex-positive)]/30 shadow-2xl shadow-black/40',
            'backdrop-blur-xl',
          )}
          style={{
            // Auto-position right edge if would overflow
            right: variant === 'button' ? 0 : undefined,
            left: variant === 'inline' ? 0 : undefined,
          }}
        >
          {/* SEARCH INPUT */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--gex-positive)]/15">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoFocus={autoFocus}
              className={cn(
                'flex-1 bg-transparent border-none outline-none',
                'text-sm font-mono font-bold tracking-wider uppercase',
                'text-foreground placeholder:text-muted-foreground/60',
              )}
              data-testid="ticker-selector-input"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* QUICK CHIPS — index ETFs */}
          {showQuickChips && !query && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--gex-positive)]/10">
              <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mr-1">
                Indices
              </span>
              {INDEX_TICKERS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => handleSelect(sym)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase',
                    'bg-purple-500/10 text-purple-300 border border-purple-500/30',
                    'hover:bg-purple-500/20 hover:border-purple-500/50 transition-colors',
                  )}
                  data-testid={`quick-chip-${sym}`}
                >
                  {sym}
                </button>
              ))}
            </div>
          )}

          {/* RECENTS LABEL */}
          {!query && recents.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground border-b border-[var(--gex-positive)]/10">
              <Clock className="w-3 h-3" />
              <span>Recent</span>
            </div>
          )}

          {/* RESULTS LIST */}
          <div className="max-h-[320px] overflow-y-auto py-1">
            {results.length === 0 && (
              <div className="px-3 py-6 text-center text-xs font-mono text-muted-foreground">
                {query ? `No matches for "${query}"` : 'No tickers'}
              </div>
            )}
            {results.map((entry, idx) => {
              const isRecent = !query && recents.includes(entry.symbol);
              const isActive = idx === activeIdx;
              const isCurrent = entry.symbol === value;
              const tierStyle = entry.tier ? TIER_STYLES[entry.tier] : null;

              return (
                <button
                  key={entry.symbol}
                  type="button"
                  onClick={() => handleSelect(entry.symbol)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors',
                    isActive
                      ? 'bg-[var(--gex-positive)]/10'
                      : 'hover:bg-[var(--surface-raised)]',
                    isCurrent && 'bg-[var(--gex-positive)]/15',
                  )}
                  data-testid={`ticker-option-${entry.symbol}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isRecent && (
                      <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    )}
                    {isCurrent && !isRecent && (
                      <Star className="w-3 h-3 text-[var(--gex-positive)] flex-shrink-0" fill="currentColor" />
                    )}
                    <span
                      className={cn(
                        'font-mono font-bold tracking-wider text-sm',
                        isActive || isCurrent ? 'text-[var(--gex-positive)]' : 'text-foreground',
                      )}
                    >
                      {entry.symbol}
                    </span>
                  </div>
                  {tierStyle && (
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide',
                        tierStyle.bg,
                        tierStyle.text,
                      )}
                    >
                      {tierStyle.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* FOOTER HINT */}
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--gex-positive)]/10 bg-[var(--surface-base)]/40">
            <span className="text-[9px] font-mono text-muted-foreground">
              ↑↓ navigate · ⏎ select · Esc close
            </span>
            <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
              {results.length} {results.length === 1 ? 'ticker' : 'tickers'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Companion: View Mode Toggle ───────────────────────────

export type ViewMode = 'orbs' | 'heatmap' | 'projection' | 'walls';

export interface ViewModeToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

const VIEW_MODES: Array<{ value: ViewMode; label: string; hint: string }> = [
  { value: 'orbs', label: 'ORBS', hint: 'Strike orbs sized by gamma' },
  { value: 'heatmap', label: 'HEAT', hint: 'Gamma intensity grid' },
  { value: 'projection', label: 'PROJ', hint: 'Zero-gamma magnet arc' },
  { value: 'walls', label: 'WALLS', hint: 'Call/put wall lines' },
];

export function ViewModeToggle({ mode, onChange, className }: ViewModeToggleProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 p-1 rounded-md',
        'bg-[var(--surface-raised)] border border-border',
        className,
      )}
    >
      {VIEW_MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          title={m.hint}
          className={cn(
            'px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider uppercase transition-all',
            mode === m.value
              ? 'bg-[var(--gex-positive)]/20 text-[var(--gex-positive)] shadow-[0_0_8px_var(--gex-positive)]/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface-base)]',
          )}
          data-testid={`viewmode-${m.value}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
