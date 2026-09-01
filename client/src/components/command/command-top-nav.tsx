/**
 * CommandTopNav — Skylit-style horizontal toolbar above the chart.
 *
 * Full configurability: ticker, intervals, exposure type, view mode,
 * expiration scope, overlay toggles, projection toggle, refresh.
 */

import { Link } from 'wouter';
import { ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TickerSelector } from '@/components/shared/ticker-selector';
import type { GEXViewMode } from '../../../../shared/gex-types';

export const COMMAND_INTERVALS = [
  { value: '1m', label: '1m' },
  { value: '3m', label: '3m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
] as const;

export type CommandInterval = (typeof COMMAND_INTERVALS)[number]['value'];

export type ExposureType = 'gex' | 'vex' | 'gex+vex';
export type ExpirationScope = 'current' | 'next3' | 'all';

interface CommandTopNavProps {
  symbol: string;
  onSymbolChange: (next: string) => void;
  interval: string;
  onIntervalChange: (next: CommandInterval) => void;
  mode: GEXViewMode;
  onModeChange: (next: GEXViewMode) => void;
  onRefresh: () => void;
  isFetching: boolean;
  // New configurable props
  exposureType?: ExposureType;
  onExposureTypeChange?: (next: ExposureType) => void;
  expirationScope?: ExpirationScope;
  onExpirationScopeChange?: (next: ExpirationScope) => void;
  showOverlay?: boolean;
  onOverlayChange?: (next: boolean) => void;
  showProjection?: boolean;
  onProjectionChange?: (next: boolean) => void;
}

const EXPOSURE_TYPES: { value: ExposureType; label: string; color: string }[] = [
  { value: 'gex', label: 'GEX', color: 'var(--gex-positive)' },
  { value: 'vex', label: 'VEX', color: '#a78bfa' },
  { value: 'gex+vex', label: 'GEX+VEX', color: 'var(--brand-cyan)' },
];

const EXPIRATION_SCOPES: { value: ExpirationScope; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'next3', label: 'Current + Next 3' },
  { value: 'all', label: 'All' },
];

const VIEW_MODES: { value: GEXViewMode; label: string }[] = [
  { value: 'orbs', label: 'Orbs' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'projection', label: 'Projection' },
  { value: 'walls', label: 'Walls' },
];

// Common pill button style
function PillGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-0.5 p-0.5 rounded-md bg-[var(--surface-raised)] border border-border/40", className)}>
      {children}
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest rounded-sm transition-colors whitespace-nowrap',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      style={active ? {
        backgroundColor: `color-mix(in srgb, ${activeColor || 'var(--gex-positive)'} 15%, transparent)`,
        color: activeColor || 'var(--gex-positive)',
      } : undefined}
    >
      {children}
    </button>
  );
}

function ToggleSwitch({
  label,
  active,
  onClick,
  color = 'var(--brand-teal)',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 group"
    >
      <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className={cn(
        'w-6 h-3.5 rounded-full transition-colors relative',
        active ? 'bg-opacity-30' : 'bg-muted/30',
      )} style={active ? { backgroundColor: `color-mix(in srgb, ${color} 30%, transparent)` } : undefined}>
        <div
          className={cn(
            'absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all',
            active ? 'left-3' : 'left-0.5',
          )}
          style={{ backgroundColor: active ? color : 'var(--muted-foreground)' }}
        />
      </div>
    </button>
  );
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
  exposureType = 'gex',
  onExposureTypeChange,
  expirationScope = 'all',
  onExpirationScopeChange,
  showOverlay = true,
  onOverlayChange,
  showProjection = true,
  onProjectionChange,
}: CommandTopNavProps) {
  return (
    <div className="space-y-2">
      {/* Row 1: Ticker + exposure type + intervals */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* LEFT: ticker nav + exposure type */}
        <div className="flex items-center gap-2">
          <TickerSelector
            value={symbol}
            onChange={onSymbolChange}
            variant="button"
            placeholder="Search ticker..."
            data-testid="gex-command-ticker-selector"
          />

          <div className="w-px h-5 bg-border/30" />

          {/* Exposure type: GEX / VEX / GEX+VEX */}
          {onExposureTypeChange && (
            <PillGroup>
              {EXPOSURE_TYPES.map(et => (
                <PillButton
                  key={et.value}
                  active={exposureType === et.value}
                  onClick={() => onExposureTypeChange(et.value)}
                  activeColor={et.color}
                >
                  {et.label}
                </PillButton>
              ))}
            </PillGroup>
          )}
        </div>

        {/* RIGHT: intervals + cross-link */}
        <div className="flex items-center gap-2">
          <PillGroup>
            {COMMAND_INTERVALS.map((iv) => (
              <PillButton
                key={iv.value}
                active={interval === iv.value}
                onClick={() => onIntervalChange(iv.value)}
              >
                {iv.label}
              </PillButton>
            ))}
          </PillGroup>

          <Link
            href={`/trade-desk?symbol=${symbol}`}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase tracking-widest',
              'border border-border/40 text-muted-foreground hover:text-[var(--brand-teal)] hover:border-[var(--brand-teal)]/30 transition-colors',
            )}
            title="Open in Trade Desk"
          >
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Row 2: Expirations + Mode + Overlays + Projection + Refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Expiration scope */}
          {onExpirationScopeChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">EXP</span>
              <PillGroup>
                {EXPIRATION_SCOPES.map(es => (
                  <PillButton
                    key={es.value}
                    active={expirationScope === es.value}
                    onClick={() => onExpirationScopeChange(es.value)}
                    activeColor="var(--brand-cyan)"
                  >
                    {es.label}
                  </PillButton>
                ))}
              </PillGroup>
            </div>
          )}

          <div className="w-px h-5 bg-border/30" />

          {/* View mode */}
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60">MODE</span>
            <PillGroup>
              {VIEW_MODES.map(vm => (
                <PillButton
                  key={vm.value}
                  active={mode === vm.value}
                  onClick={() => onModeChange(vm.value)}
                >
                  {vm.label}
                </PillButton>
              ))}
            </PillGroup>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Overlay toggle */}
          {onOverlayChange && (
            <ToggleSwitch
              label="OVERLAY"
              active={showOverlay}
              onClick={() => onOverlayChange(!showOverlay)}
            />
          )}

          {/* Projection toggle */}
          {onProjectionChange && (
            <ToggleSwitch
              label="PROJECTION"
              active={showProjection}
              onClick={() => onProjectionChange(!showProjection)}
              color="var(--projection-glow)"
            />
          )}

          <div className="w-px h-5 bg-border/30" />

          {/* Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isFetching}
            className={cn(
              'px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-widest rounded-md transition-colors',
              'border border-border/40',
              isFetching
                ? 'text-amber-400 animate-pulse'
                : 'text-muted-foreground hover:text-foreground hover:border-foreground/20',
            )}
          >
            {isFetching ? 'LOADING...' : 'REFRESH'}
          </button>
        </div>
      </div>
    </div>
  );
}
