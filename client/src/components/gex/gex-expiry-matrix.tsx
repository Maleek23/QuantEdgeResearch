/**
 * GEXExpiryMatrix — Skylit-style Strike × Expiration heatmap grid.
 *
 * Default view: ~30 strikes centered on spot price (the zone that matters).
 * Expand toggle reveals the full strike chain for deep analysis.
 * GEX / VEX toggle switches between gamma and vanna exposure per cell.
 * Optional expiry filter + strike range filter controlled by parent.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { StrikeExpiryCell, GEXSnapshot } from '../../../../shared/gex-types';

export interface GEXExpiryMatrixProps {
  matrix: StrikeExpiryCell[];
  snapshot: GEXSnapshot;
  /** Which expiry labels to include (all if undefined/empty) */
  visibleExpiries?: string[];
  /** Override default strikes-around-spot (default 15 = ~30 rows) */
  strikesAround?: number;
  /** Hide the internal GEX/VEX toggle + expand controls (parent provides them) */
  hideControls?: boolean;
  /** Controlled GEX/VEX mode from parent */
  externalMode?: 'gex' | 'vex';
  /** Controlled expanded state from parent */
  externalExpanded?: boolean;
}

type MatrixMode = 'gex' | 'vex';

/** Number of strikes to show above and below spot in collapsed view */
const DEFAULT_STRIKES_AROUND = 15;

function formatCellValue(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}M`;
  if (abs >= 1) return `${sign}$${abs.toFixed(1)}K`;
  if (abs >= 0.1) return `${sign}$${(abs * 1000).toFixed(0)}`;
  if (abs >= 0.001) return `${sign}$${(abs * 1000).toFixed(1)}`;
  return '—';
}

// Convert raw values to display value in thousands ($K)
// GEX is in billions ($B), VEX is in millions ($M)
function toDisplayK(v: number, mode: MatrixMode = 'gex'): number {
  return mode === 'gex' ? v * 1e6 : v * 1e3; // B→K or M→K
}

export function GEXExpiryMatrix({
  matrix,
  snapshot,
  visibleExpiries,
  strikesAround,
  hideControls = false,
  externalMode,
  externalExpanded,
}: GEXExpiryMatrixProps) {
  const [internalMode, setInternalMode] = useState<MatrixMode>('gex');
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [internalExpiryFilter, setInternalExpiryFilter] = useState<'all' | 'weekly' | 'monthly' | 'quarterly' | 'custom'>('all');
  const [selectedExpiries, setSelectedExpiries] = useState<Set<string>>(new Set());
  const spotRowRef = useRef<HTMLTableRowElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const mode = externalMode ?? internalMode;
  const expanded = externalExpanded ?? internalExpanded;
  // When externally controlled, local setter is a no-op (parent handles state)
  const setExpanded = externalExpanded !== undefined
    ? (_v: boolean) => {} // parent controls expansion via externalExpanded prop
    : (v: boolean) => setInternalExpanded(v);
  const STRIKES_AROUND = strikesAround ?? DEFAULT_STRIKES_AROUND;

  // Auto-scroll to spot row on mount & when collapsed view resets
  useEffect(() => {
    if (spotRowRef.current) {
      spotRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [expanded, matrix.length]);

  // Build the grid: unique strikes (rows) × unique expiry labels (columns)
  const { allStrikes, expiries, lookup } = useMemo(() => {
    const strikeSet = new Set<number>();
    const expiryMap = new Map<string, number>(); // label → dte
    const lk = new Map<string, StrikeExpiryCell>();

    for (const cell of matrix) {
      strikeSet.add(cell.strike);
      if (!expiryMap.has(cell.expiryLabel) || cell.dte < expiryMap.get(cell.expiryLabel)!) {
        expiryMap.set(cell.expiryLabel, cell.dte);
      }
      lk.set(`${cell.strike}|${cell.expiryLabel}`, cell);
    }

    const strikes = Array.from(strikeSet).sort((a, b) => b - a);
    const exps = Array.from(expiryMap.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label);

    return { allStrikes: strikes, expiries: exps, lookup: lk };
  }, [matrix]);

  if (!matrix || matrix.length === 0) {
    return (
      <div className="p-6 text-center text-xs font-mono text-muted-foreground">
        No expiration matrix data
      </div>
    );
  }

  // Build expiry info with DTE for filtering
  const expiryInfo = useMemo(() => {
    const info: { label: string; dte: number }[] = [];
    const dteMap = new Map<string, number>();
    for (const cell of matrix) {
      if (!dteMap.has(cell.expiryLabel) || cell.dte < dteMap.get(cell.expiryLabel)!) {
        dteMap.set(cell.expiryLabel, cell.dte);
      }
    }
    for (const [label, dte] of dteMap.entries()) {
      info.push({ label, dte });
    }
    return info.sort((a, b) => a.dte - b.dte);
  }, [matrix]);

  // Filter expiries — parent-controlled or internal
  const filteredExpiries = useMemo(() => {
    if (visibleExpiries && visibleExpiries.length > 0) {
      return expiries.filter(e => visibleExpiries.includes(e));
    }
    // Internal filtering
    if (internalExpiryFilter === 'all') return expiries;
    if (internalExpiryFilter === 'weekly') return expiryInfo.filter(e => e.dte <= 7).map(e => e.label);
    if (internalExpiryFilter === 'monthly') return expiryInfo.filter(e => e.dte <= 35).map(e => e.label);
    if (internalExpiryFilter === 'quarterly') return expiryInfo.filter(e => e.dte <= 100).map(e => e.label);
    return Array.from(selectedExpiries);
  }, [visibleExpiries, expiries, internalExpiryFilter, expiryInfo, selectedExpiries]);

  const hasInternalFilter = !visibleExpiries || visibleExpiries.length === 0;
  const toggleExpiry = (label: string) => {
    setInternalExpiryFilter('custom');
    setSelectedExpiries(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Find the index of the strike closest to spot
  const { spotPrice, gammaFlipPrice, maxGammaStrike } = snapshot;
  const spotIdx = allStrikes.reduce((best, s, i) =>
    Math.abs(s - spotPrice) < Math.abs(allStrikes[best] - spotPrice) ? i : best, 0);

  // Collapsed view: show STRIKES_AROUND above and below spot
  const startIdx = Math.max(0, spotIdx - STRIKES_AROUND);
  const endIdx = Math.min(allStrikes.length, spotIdx + STRIKES_AROUND + 1);
  const strikes = expanded ? allStrikes : allStrikes.slice(startIdx, endIdx);
  const hiddenAbove = expanded ? 0 : startIdx;
  const hiddenBelow = expanded ? 0 : allStrikes.length - endIdx;
  const totalHidden = hiddenAbove + hiddenBelow;

  // Get the active value for a cell based on mode
  const getCellValue = (cell: StrikeExpiryCell): number => {
    return mode === 'gex' ? cell.netGEX : (cell.netVEX ?? 0);
  };

  // Find max for intensity scaling (across ALL strikes, not just visible)
  let maxVal = 0.001;
  let maxCellKey = '';
  let maxCellMag = 0;
  lookup.forEach((cell, key) => {
    const mag = Math.abs(getCellValue(cell));
    if (mag > maxVal) maxVal = mag;
    if (mag > maxCellMag) {
      maxCellMag = mag;
      maxCellKey = key;
    }
  });

  return (
    <div className="space-y-2">
      {/* Controls row: GEX/VEX toggle + expand/collapse — only if not hidden */}
      {!hideControls && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setInternalMode('gex')}
              className={cn(
                'px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-widest rounded transition-colors',
                mode === 'gex'
                  ? 'bg-[var(--gex-positive)]/20 text-[var(--gex-positive)] ring-1 ring-[var(--gex-positive)]/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
              )}
            >
              GEX
            </button>
            <button
              type="button"
              onClick={() => setInternalMode('vex')}
              className={cn(
                'px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-widest rounded transition-colors',
                mode === 'vex'
                  ? 'bg-violet-400/20 text-violet-400 ring-1 ring-violet-400/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
              )}
            >
              VEX
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-muted-foreground">
              {strikes.length} of {allStrikes.length} strikes
            </span>
            {totalHidden > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
              >
                {expanded ? 'COLLAPSE' : `EXPAND ALL (${allStrikes.length})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expiry date filter — shown when not parent-controlled */}
      {hasInternalFilter && expiryInfo.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          {(['all', 'weekly', 'monthly', 'quarterly'] as const).map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => { setInternalExpiryFilter(preset); setSelectedExpiries(new Set()); }}
              className={cn(
                'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                internalExpiryFilter === preset
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              )}
            >
              {preset}
            </button>
          ))}
          <div className="w-px h-3 bg-border/30 mx-0.5" />
          {expiryInfo.map(exp => {
            const isActive = internalExpiryFilter === 'all'
              || (internalExpiryFilter === 'weekly' && exp.dte <= 7)
              || (internalExpiryFilter === 'monthly' && exp.dte <= 35)
              || (internalExpiryFilter === 'quarterly' && exp.dte <= 100)
              || (internalExpiryFilter === 'custom' && selectedExpiries.has(exp.label));
            return (
              <button
                key={exp.label}
                type="button"
                onClick={() => toggleExpiry(exp.label)}
                className={cn(
                  'px-1.5 py-0.5 text-[8px] font-mono rounded whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-[var(--gex-positive)]/10 text-[var(--gex-positive)]'
                    : 'text-muted-foreground/30 hover:text-muted-foreground/50'
                )}
              >
                {exp.label}
                <span className="text-muted-foreground/30 ml-0.5">{exp.dte}d</span>
              </button>
            );
          })}
        </div>
      )}

      <div ref={scrollContainerRef} className={cn('overflow-auto', !hideControls && 'max-h-[calc(100vh-220px)]')}>
        <table className="text-[10px] font-mono border-collapse min-w-max">
          <thead className="sticky top-0 z-20 bg-[var(--surface-raised)]">
            <tr className="border-b border-border/40">
              <th className="text-left py-2 px-2 text-[9px] uppercase tracking-widest text-muted-foreground font-medium sticky left-0 bg-[var(--surface-raised)] z-30">
                STRIKE
              </th>
              {filteredExpiries.map(exp => (
                <th key={exp} className="text-center py-2 px-2 text-[9px] uppercase tracking-widest text-muted-foreground font-medium whitespace-nowrap min-w-[72px]">
                  {exp}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Truncation indicator — above */}
            {!expanded && hiddenAbove > 0 && (
              <tr className="border-b border-border/10">
                <td
                  colSpan={filteredExpiries.length + 1}
                  className="py-1.5 px-2 text-center text-[9px] font-mono text-muted-foreground/50 cursor-pointer hover:text-muted-foreground hover:bg-muted/10 transition-colors"
                  onClick={() => setExpanded(true)}
                >
                  ▲ {hiddenAbove} strikes above · click to expand
                </td>
              </tr>
            )}

            {strikes.map(strike => {
              const isSpot = Math.abs(strike - spotPrice) / spotPrice < 0.003;
              const isFlip = strike === gammaFlipPrice;
              const isMax = strike === maxGammaStrike;

              return (
                <tr
                  key={strike}
                  ref={isSpot ? spotRowRef : undefined}
                  className={cn(
                    'border-b border-border/10 transition-colors',
                    isSpot && 'bg-amber-400/8 ring-1 ring-inset ring-amber-400/20',
                    isFlip && 'bg-violet-400/5',
                  )}
                >
                  <td className={cn(
                    'py-1.5 px-2 font-bold tabular-nums whitespace-nowrap sticky left-0 bg-[var(--surface-raised)] z-10',
                    isSpot && 'text-amber-400',
                    isFlip && 'text-violet-400',
                    isMax && 'text-[var(--gex-star)]',
                    !isSpot && !isFlip && !isMax && 'text-foreground',
                  )}>
                    {isMax && <span className="text-[var(--gex-star)] mr-0.5">&#x2299;</span>}
                    {isSpot && !isMax && <span className="text-amber-400 mr-0.5">&#x2606;</span>}
                    {isFlip && !isMax && !isSpot && <span className="text-violet-400 mr-0.5">&#x26A1;</span>}
                    ${strike.toFixed(0)}
                  </td>
                  {filteredExpiries.map(exp => {
                    const cell = lookup.get(`${strike}|${exp}`);
                    const val = cell ? getCellValue(cell) : undefined;
                    if (val === undefined || Math.abs(val) < 0.0001) {
                      return (
                        <td key={exp} className="py-1.5 px-2 text-center text-muted-foreground/30">
                          —
                        </td>
                      );
                    }
                    const intensity = Math.abs(val) / maxVal;
                    const isPositive = val > 0;
                    const displayVal = toDisplayK(val, mode);
                    const cellKey = `${strike}|${exp}`;
                    const isMaxCell = cellKey === maxCellKey;

                    // Skylit-style colors: green for positive, teal-purple for negative
                    const bgColor = isPositive
                      ? `rgba(34, 197, 94, ${Math.min(0.35, intensity * 0.4)})`
                      : `rgba(168, 85, 247, ${Math.min(0.35, intensity * 0.4)})`;

                    return (
                      <td
                        key={exp}
                        className={cn(
                          'py-1.5 px-2 text-center tabular-nums font-medium whitespace-nowrap',
                          isPositive ? 'text-[var(--gex-positive)]' : 'text-purple-400',
                          isMaxCell && 'ring-1 ring-inset ring-amber-400/60',
                        )}
                        style={{ backgroundColor: bgColor }}
                      >
                        {formatCellValue(displayVal)}
                        {isMaxCell && <span className="text-amber-400 ml-0.5">★</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Truncation indicator — below */}
            {!expanded && hiddenBelow > 0 && (
              <tr>
                <td
                  colSpan={filteredExpiries.length + 1}
                  className="py-1.5 px-2 text-center text-[9px] font-mono text-muted-foreground/50 cursor-pointer hover:text-muted-foreground hover:bg-muted/10 transition-colors"
                  onClick={() => setExpanded(true)}
                >
                  ▼ {hiddenBelow} strikes below · click to expand
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
