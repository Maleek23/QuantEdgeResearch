/**
 * GEXConfigBar -- Universal filter/config bar for GEX views.
 *
 * Reusable across Terminal Chart, Matrix, Hub, and any future GEX page.
 * Each section is opt-in via props so callers only render what they need.
 *
 * Sections:
 *   EXPIRY   -- date-range presets + individual expiry toggles
 *   MODE     -- GEX | VEX | DEX | CHARM
 *   INTERVAL -- candle/polling interval
 *   VIEW     -- visualization mode (Chart/Matrix/Flow/Surface)
 *   SCOPE    -- watchlist group filter
 */

import { cn } from '@/lib/utils';

// ---- Types ----------------------------------------------------------------

export type ExpiryPreset = 'all' | 'weekly' | 'monthly' | 'quarterly' | 'leaps' | 'custom';

export interface ExpiryEntry {
  label: string;
  dte: number;
}

export interface ViewOption {
  value: string;
  label: string;
}

export interface GEXConfigBarProps {
  // -- Expiry filter --
  expiries?: ExpiryEntry[];
  expiryFilter?: ExpiryPreset;
  onExpiryFilterChange?: (filter: ExpiryPreset) => void;
  selectedExpiries?: Set<string>;
  onToggleExpiry?: (label: string) => void;

  // -- Mode --
  mode?: string;
  onModeChange?: (mode: string) => void;
  modes?: string[];

  // -- Interval --
  interval?: string;
  onIntervalChange?: (interval: string) => void;
  intervals?: string[];

  // -- View --
  view?: string;
  onViewChange?: (view: string) => void;
  views?: ViewOption[];

  // -- Watchlist scope --
  watchlistScope?: string;
  onWatchlistScopeChange?: (scope: string) => void;
  watchlistScopes?: ViewOption[];

  // -- Layout --
  compact?: boolean;
  className?: string;
}

// ---- Preset helpers --------------------------------------------------------

const EXPIRY_PRESETS: { value: ExpiryPreset; label: string }[] = [
  { value: 'all',       label: 'ALL' },
  { value: 'weekly',    label: 'THIS WEEK' },
  { value: 'monthly',   label: 'MONTHLY' },
  { value: 'quarterly', label: 'QUARTERLY' },
  { value: 'leaps',     label: 'LEAPS' },
];

const DEFAULT_SCOPES: ViewOption[] = [
  { value: 'my-list',     label: 'MY LIST' },
  { value: 's-tier',      label: 'S-TIER' },
  { value: 'a-tier',      label: 'A-TIER' },
  { value: 'full',        label: 'FULL UNIVERSE' },
  { value: 'indices',     label: 'INDICES' },
];

// ---- Expiry DTE matching ---------------------------------------------------

function matchesPreset(exp: ExpiryEntry, preset: ExpiryPreset): boolean {
  switch (preset) {
    case 'all':        return true;
    case 'weekly':     return exp.dte <= 7;
    case 'monthly':    return exp.dte <= 35;
    case 'quarterly':  return exp.dte <= 100;
    case 'leaps':      return exp.dte > 100;
    case 'custom':     return false; // handled via selectedExpiries
  }
}

// ---- Sub-components --------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[8px] font-mono text-muted-foreground/40 uppercase tracking-widest mr-1 select-none shrink-0">
      {children}
    </span>
  );
}

function Pill({
  active,
  onClick,
  children,
  size = 'default',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  size?: 'default' | 'small';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'font-mono font-bold uppercase rounded transition-colors whitespace-nowrap',
        size === 'small' ? 'px-1.5 py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[9px]',
        active
          ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
          : 'text-muted-foreground/50 hover:text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-3 bg-border/20 shrink-0" />;
}

// ---- Main component --------------------------------------------------------

export function GEXConfigBar({
  // expiry
  expiries,
  expiryFilter,
  onExpiryFilterChange,
  selectedExpiries,
  onToggleExpiry,
  // mode
  mode,
  onModeChange,
  modes,
  // interval
  interval,
  onIntervalChange,
  intervals,
  // view
  view,
  onViewChange,
  views,
  // scope
  watchlistScope,
  onWatchlistScopeChange,
  watchlistScopes,
  // layout
  compact = false,
  className,
}: GEXConfigBarProps) {
  const hasExpiry = expiries && expiries.length > 0 && onExpiryFilterChange;
  const hasMode = modes && modes.length > 0 && onModeChange;
  const hasInterval = intervals && intervals.length > 0 && onIntervalChange;
  const hasView = views && views.length > 0 && onViewChange;
  const hasScope = onWatchlistScopeChange;

  const scopeOptions = watchlistScopes || DEFAULT_SCOPES;

  // Nothing to render?
  if (!hasExpiry && !hasMode && !hasInterval && !hasView && !hasScope) return null;

  // Count sections to know where dividers go
  const sections: React.ReactNode[] = [];

  // -- VIEW section (usually first for primary navigation) --
  if (hasView) {
    sections.push(
      <div key="view" className="flex items-center gap-1">
        <SectionLabel>VIEW</SectionLabel>
        <div className="flex gap-0.5 p-0.5 rounded bg-[var(--surface-base)] border border-border/30">
          {views!.map(v => (
            <Pill
              key={v.value}
              active={view === v.value}
              onClick={() => onViewChange!(v.value)}
            >
              {v.label}
            </Pill>
          ))}
        </div>
      </div>,
    );
  }

  // -- MODE section --
  if (hasMode) {
    sections.push(
      <div key="mode" className="flex items-center gap-1">
        <SectionLabel>MODE</SectionLabel>
        <div className="flex gap-0.5 p-0.5 rounded bg-[var(--surface-base)] border border-border/30">
          {modes!.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange!(m)}
              className={cn(
                'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                mode === m
                  ? m === 'vex'
                    ? 'bg-violet-400/15 text-violet-400'
                    : 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                  : 'text-muted-foreground/50 hover:text-muted-foreground',
              )}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>,
    );
  }

  // -- INTERVAL section --
  if (hasInterval) {
    sections.push(
      <div key="interval" className="flex items-center gap-1">
        <SectionLabel>INT</SectionLabel>
        <div className="flex gap-0.5 p-0.5 rounded bg-[var(--surface-base)] border border-border/30">
          {intervals!.map(iv => (
            <Pill key={iv} active={interval === iv} onClick={() => onIntervalChange!(iv)}>
              {iv}
            </Pill>
          ))}
        </div>
      </div>,
    );
  }

  // -- EXPIRY section --
  if (hasExpiry) {
    // Only show presets that have matching expiries (or 'all'/'custom')
    const availablePresets = EXPIRY_PRESETS.filter(p =>
      p.value === 'all' || expiries!.some(e => matchesPreset(e, p.value)),
    );

    sections.push(
      <div key="expiry" className="flex items-center gap-1 flex-wrap">
        <SectionLabel>EXP</SectionLabel>
        {availablePresets.map(p => (
          <Pill
            key={p.value}
            active={expiryFilter === p.value}
            onClick={() => {
              onExpiryFilterChange!(p.value);
            }}
          >
            {p.label}
          </Pill>
        ))}
        {/* Individual expiry date toggles */}
        {expiries!.length > 1 && (
          <>
            <Divider />
            <div className="flex items-center gap-0.5 flex-wrap">
              {expiries!.map(exp => {
                const isVisible =
                  expiryFilter === 'all'
                  || (expiryFilter === 'weekly' && exp.dte <= 7)
                  || (expiryFilter === 'monthly' && exp.dte <= 35)
                  || (expiryFilter === 'quarterly' && exp.dte <= 100)
                  || (expiryFilter === 'leaps' && exp.dte > 100)
                  || (expiryFilter === 'custom' && selectedExpiries?.has(exp.label));
                return (
                  <button
                    key={exp.label}
                    type="button"
                    onClick={() => onToggleExpiry?.(exp.label)}
                    className={cn(
                      'px-1.5 py-0.5 text-[8px] font-mono rounded transition-colors',
                      isVisible
                        ? 'bg-[var(--gex-positive)]/10 text-[var(--gex-positive)]'
                        : 'text-muted-foreground/30 hover:text-muted-foreground/50',
                    )}
                  >
                    {exp.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>,
    );
  }

  // -- SCOPE section --
  if (hasScope) {
    sections.push(
      <div key="scope" className="flex items-center gap-1">
        <SectionLabel>SCOPE</SectionLabel>
        {scopeOptions.map(s => (
          <Pill
            key={s.value}
            active={watchlistScope === s.value}
            onClick={() => onWatchlistScopeChange!(s.value)}
            size="small"
          >
            {s.label}
          </Pill>
        ))}
      </div>,
    );
  }

  // Interleave dividers between sections
  const rendered: React.ReactNode[] = [];
  sections.forEach((section, i) => {
    if (i > 0) rendered.push(<Divider key={`div-${i}`} />);
    rendered.push(section);
  });

  return (
    <div
      className={cn(
        'border-b border-border/15 bg-[var(--surface-raised)]/50 px-4',
        compact ? 'py-1' : 'py-1.5',
        className,
      )}
      data-testid="gex-config-bar"
    >
      <div className={cn('flex items-center gap-3 flex-wrap', compact && 'gap-2')}>
        {rendered}
      </div>
    </div>
  );
}
