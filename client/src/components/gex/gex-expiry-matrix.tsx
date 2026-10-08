/**
 * GEXExpiryMatrix — strike × expiration grid for the Research GEX surface.
 *
 * v3 (2026-09-29): the whole strike chain, scrolled — no "expand all". The
 * grid itself is the shared GexStrikeMatrix (gex-strike-grid.tsx): sticky
 * header + strike column, spot centred on load, jump-to-spot, virtualised
 * rows, labelled call/put wall, max-γ and zero-γ rows, perceptual tint in the
 * platform's GEX colours (+ blue / − vermilion; this file used to paint
 * Skylit green/purple and printed $B cells as "$K").
 * This wrapper keeps its DTE presets and single-expiry picker.
 */
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { StrikeExpiryCell, GEXSnapshot } from '@shared/gex-types';
import { GexStrikeMatrix } from './gex-strike-grid';

export interface GEXExpiryMatrixProps {
  matrix: StrikeExpiryCell[];
  snapshot: GEXSnapshot;
  /** Which expiry labels to include (all if undefined/empty) */
  visibleExpiries?: string[];
  /** @deprecated every strike is shown now; the grid scrolls */
  strikesAround?: number;
  /** Hide the internal GEX/VEX toggle (parent provides it) */
  hideControls?: boolean;
  /** Controlled GEX/VEX mode from parent */
  externalMode?: 'gex' | 'vex';
  /** @deprecated there is nothing to expand — the grid scrolls */
  externalExpanded?: boolean;
}

type MatrixMode = 'gex' | 'vex';
type Preset = 'all' | '0-7' | '7-30' | '30-90' | '90+' | 'single';
const PRESETS: Array<{ id: Exclude<Preset, 'single'>; label: string; range: [number, number] }> = [
  { id: 'all', label: 'ALL', range: [0, 99999] },
  { id: '0-7', label: '0–7d', range: [0, 7] },
  { id: '7-30', label: '7–30d', range: [8, 30] },
  { id: '30-90', label: '30–90d', range: [31, 90] },
  { id: '90+', label: '90d+', range: [91, 99999] },
];

export function GEXExpiryMatrix({
  matrix,
  snapshot,
  visibleExpiries,
  hideControls = false,
  externalMode,
}: GEXExpiryMatrixProps) {
  const [internalMode, setInternalMode] = useState<MatrixMode>('gex');
  const [preset, setPreset] = useState<Preset>('all');
  const [singleExpiry, setSingleExpiry] = useState<string | null>(null);
  const mode = externalMode ?? internalMode;

  const expiryInfo = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of matrix ?? []) {
      if (!Number.isFinite(c.dte) || c.dte < 0) continue;
      if (!m.has(c.expiryLabel) || c.dte < m.get(c.expiryLabel)!) m.set(c.expiryLabel, c.dte);
    }
    return [...m.entries()].map(([label, dte]) => ({ label, dte })).sort((a, b) => a.dte - b.dte);
  }, [matrix]);

  const columns = useMemo<Array<[number, string]>>(() => {
    let rows = expiryInfo;
    if (visibleExpiries && visibleExpiries.length) rows = rows.filter((e) => visibleExpiries.includes(e.label));
    else if (preset === 'single' && singleExpiry) rows = rows.filter((e) => e.label === singleExpiry);
    else if (preset !== 'all' && preset !== 'single') {
      const [lo, hi] = PRESETS.find((p) => p.id === preset)!.range;
      rows = rows.filter((e) => e.dte >= lo && e.dte <= hi);
    }
    return rows.map((e) => [e.dte, e.label] as [number, string]);
  }, [expiryInfo, visibleExpiries, preset, singleExpiry]);

  if (!matrix || matrix.length === 0) {
    return <div className="p-6 text-center text-xs font-mono text-muted-foreground">No expiration matrix data</div>;
  }

  const zeroGamma = snapshot.zeroGammaLevel ?? snapshot.gammaFlipPrice ?? null;

  return (
    <div className="flex flex-col h-full min-h-0 gap-1">
      {(!hideControls || !visibleExpiries?.length) && (
        <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0 pb-1 border-b border-border/20">
          {!hideControls && (['gex', 'vex'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setInternalMode(m)}
              aria-pressed={mode === m}
              className={cn(
                'px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-widest rounded border transition-colors',
                mode === m ? 'border-[var(--brand-cyan)]/40 text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/10' : 'border-border/30 text-muted-foreground hover:text-foreground',
              )}
              title={m === 'gex' ? 'GEX — $ dealers trade per 1% spot move' : 'VEX — $ dealers trade per 1 IV point'}
            >
              {m}
            </button>
          ))}
          {(!visibleExpiries || visibleExpiries.length === 0) && (
            <>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground ml-2 mr-1">DTE</span>
              {PRESETS.map((p) => {
                const count = expiryInfo.filter((e) => e.dte >= p.range[0] && e.dte <= p.range[1]).length;
                const empty = count === 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={empty}
                    onClick={() => { setPreset(p.id); setSingleExpiry(null); }}
                    aria-pressed={preset === p.id}
                    title={empty ? 'No expiries in this range' : `${count} ${count === 1 ? 'expiry' : 'expiries'}`}
                    className={cn(
                      'px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded border transition-colors',
                      empty && 'opacity-30 cursor-not-allowed',
                      !empty && preset === p.id
                        ? 'border-[var(--brand-cyan)]/40 text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/10'
                        : !empty && 'border-border/30 text-muted-foreground hover:text-foreground hover:border-border',
                    )}
                  >
                    {p.label}{!empty && p.id !== 'all' ? ` ·${count}` : ''}
                  </button>
                );
              })}
              <select
                value={preset === 'single' ? (singleExpiry ?? '') : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) { setPreset('single'); setSingleExpiry(v); } else { setPreset('all'); setSingleExpiry(null); }
                }}
                aria-label="Pick a single expiry"
                className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded border bg-transparent border-border/30 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <option value="">PICK DATE…</option>
                {expiryInfo.map((e) => (
                  <option key={e.label} value={e.label} className="bg-[var(--surface-raised)] text-foreground">{e.label} ({e.dte}d)</option>
                ))}
              </select>
              <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                {columns.length} of {expiryInfo.length} expiries
                {expiryInfo.length > 0 && ` · max ${expiryInfo[expiryInfo.length - 1].label} (${expiryInfo[expiryInfo.length - 1].dte}d)`}
              </span>
            </>
          )}
        </div>
      )}

      <GexStrikeMatrix
        cells={matrix}
        expiries={columns}
        metric={mode}
        centerKey={`${snapshot.symbol}|${mode}`}
        levels={{
          spot: snapshot.spotPrice,
          callWall: snapshot.callWall,
          putWall: snapshot.putWall,
          maxGamma: snapshot.maxGammaStrike,
          zeroGamma,
        }}
      />
    </div>
  );
}
