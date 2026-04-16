/**
 * Index Mode — Row-by-row dealer exposure across major indices.
 *
 * Uses the unified HeatseekerToolbar (but with limited controls since
 * this page shows multiple indices at once).
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { formatGEX } from '../../../shared/gex-types';
import type { GEXTerminalData } from '../../../shared/gex-types';
import { GEXExpiryMatrix } from '@/components/gex/gex-expiry-matrix';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { ExposureMode } from '@/components/heatseeker/heatseeker-toolbar';

const INDEX_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'SPXW'] as const;

function IndexRow({ symbol, mode }: { symbol: string; mode: ExposureMode }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isFetching, isError, refetch } = useQuery<GEXTerminalData>({
    queryKey: ['/api/gex-vex/terminal', symbol, '15m'],
    queryFn: async () => {
      const res = await fetch(`/api/gex-vex/terminal/${symbol}?interval=15m&lookback=5`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.reason || `Terminal fetch failed: ${res.status}`);
      }
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const { snapshot } = data ?? {};
  const regime = snapshot?.regime?.replace('_', ' ') ?? '';

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-border/20 overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-4 px-4 py-3 text-left transition-colors',
          'hover:bg-[var(--surface-base)]/50',
          expanded && 'border-b border-border/20 bg-[var(--surface-base)]/30',
        )}
      >
        <div className="text-muted-foreground/50">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
        <div className="w-16">
          <span className="text-sm font-mono font-bold text-foreground">{symbol}</span>
        </div>
        {snapshot ? (
          <div className="flex items-center gap-5 flex-1 text-[9px] font-mono uppercase tracking-widest">
            <span className="text-foreground font-bold tabular-nums">${snapshot.spotPrice.toFixed(2)}</span>
            <span className="text-muted-foreground">
              NET <span className={snapshot.totalGEX >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]'}>{formatGEX(snapshot.totalGEX)}</span>
            </span>
            <span className="text-muted-foreground">
              FLIP <span className="text-violet-400">${snapshot.gammaFlipPrice?.toFixed(0) ?? '—'}</span>
            </span>
            <span className="text-muted-foreground">
              MAX <span className="text-[var(--gex-star)]">${snapshot.maxGammaStrike.toFixed(0)}</span>
            </span>
          </div>
        ) : isError ? (
          <div className="flex items-center gap-3 flex-1 text-[9px] font-mono uppercase tracking-widest">
            <span className="text-[var(--gex-negative)]">DATA UNAVAILABLE</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); refetch(); }} className="text-muted-foreground hover:text-foreground transition-colors">RETRY</button>
          </div>
        ) : (
          <div className="flex-1 text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest animate-pulse">Loading...</div>
        )}
        {regime && (
          <div className={cn(
            'text-[8px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded',
            regime.includes('positive') && 'text-[var(--gex-positive)] bg-[var(--gex-positive)]/10',
            regime.includes('negative') && 'text-[var(--gex-negative)] bg-[var(--gex-negative)]/10',
            !regime.includes('positive') && !regime.includes('negative') && 'text-muted-foreground bg-muted/20',
          )}>
            {regime}
          </div>
        )}
        {isFetching && <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />}
      </button>

      {expanded && data?.strikeExpiryMatrix && data.strikeExpiryMatrix.length > 0 && (
        <div className="p-4 bg-[var(--surface-base)]/20">
          <GEXExpiryMatrix matrix={data.strikeExpiryMatrix} snapshot={data.snapshot} externalMode={mode} />
        </div>
      )}
      {expanded && data && (!data.strikeExpiryMatrix || data.strikeExpiryMatrix.length === 0) && (
        <div className="flex items-center justify-center py-8 text-[10px] font-mono text-muted-foreground">No matrix data for {symbol}</div>
      )}
      {expanded && !data && (
        <div className="flex items-center justify-center py-8 text-[10px] font-mono text-[var(--gex-positive)] animate-pulse uppercase tracking-widest">Loading {symbol}...</div>
      )}
    </div>
  );
}

export default function TerminalTrinityPage() {
  const [mode, setMode] = useState<ExposureMode>('gex');

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[var(--surface-base)] flex flex-col">
      {/* Toolbar — simplified for multi-index (no single ticker selector) */}
      <div className="border-b border-border/30 bg-[var(--surface-raised)] px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
              INDEX MODE
            </span>
            <div className="w-px h-4 bg-border/30" />
            <div className="flex gap-0.5 p-0.5 rounded bg-[var(--surface-base)] border border-border/30">
              <button
                type="button"
                onClick={() => setMode('gex')}
                className={cn(
                  'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                  mode === 'gex' ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                GEX
              </button>
              <button
                type="button"
                onClick={() => setMode('vex')}
                className={cn(
                  'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                  mode === 'vex' ? 'bg-violet-400/15 text-violet-400' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                VEX
              </button>
            </div>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground">
            {INDEX_SYMBOLS.length} indices · Click to expand
          </span>
        </div>
      </div>

      {/* Index rows */}
      <div className="flex-1 p-4 space-y-2 overflow-auto">
        {INDEX_SYMBOLS.map(sym => (
          <IndexRow key={sym} symbol={sym} mode={mode} />
        ))}
      </div>
    </div>
  );
}
