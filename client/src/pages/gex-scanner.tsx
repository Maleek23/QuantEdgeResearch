/**
 * GEX Hub — market-wide gamma + vanna command center.
 *
 * Two views stacked on the same page:
 *   1. HUB PANELS — top GEX longs/shorts, top VEX movers, sector pulse,
 *      regime distribution. Compact, scannable, clickable.
 *   2. CONFLUENCE LIST — full per-ticker ranked rows (the original scanner).
 *
 * Drives off /api/gex-vex/hub which returns { hub, scan } in one shot.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMarketPoll, POLL } from '@/hooks/use-market-poll';
import { Link, useLocation } from 'wouter';
import { QEPageShell } from '@/components/ui/qe-page-shell';
import { ConfluenceRow } from '@/components/gex/confluence-row';
import { GEXHubPanels } from '@/components/gex/gex-hub-panels';
import { TickerSelector } from '@/components/shared/ticker-selector';
import { componentStyles } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';
import type {
  ConfluenceScanResult,
  ConfluenceRow as ConfluenceRowData,
  GEXHubData,
} from '../../../shared/gex-types';

interface HubResponse {
  hub: GEXHubData;
  scan: ConfluenceScanResult;
}

function useGEXHub() {
  const gexInterval = useMarketPoll(POLL.HEAVY.open, POLL.HEAVY.closed);
  return useQuery<HubResponse>({
    queryKey: ['/api/gex-vex/hub'],
    queryFn: async () => {
      const res = await fetch('/api/gex-vex/hub', { credentials: 'include' });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(
          res.status === 401
            ? 'Not authenticated — sign in to view GEX Hub'
            : `Hub endpoint not available (HTTP ${res.status}). Restart dev server to register new routes.`,
        );
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `Hub fetch failed (${res.status})`);
      }
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: gexInterval,
    retry: 1,
  });
}

type FilterTier = 'all' | 'elite' | 'strong' | 'watch';
type FilterBias = 'all' | 'long' | 'short';

export default function GEXScannerPage() {
  const [, setLocation] = useLocation();
  const { data: hubResponse, isLoading, error, refetch, isFetching } = useGEXHub();
  const [filterTier, setFilterTier] = useState<FilterTier>('all');
  const [filterBias, setFilterBias] = useState<FilterBias>('all');

  const jumpToTerminal = (sym: string) => {
    if (sym) setLocation(`/t/${sym.toUpperCase()}/gex`);
  };

  const data = hubResponse?.scan;
  const hub = hubResponse?.hub;
  const rows = data?.rows || [];
  const filtered = rows.filter((r) => {
    if (filterTier !== 'all' && r.scoreTier !== filterTier) return false;
    if (filterBias !== 'all' && r.bias !== filterBias) return false;
    return true;
  });

  const marketRegimeLabel: Record<string, { label: string; color: string }> = {
    risk_on: { label: 'RISK ON', color: 'text-[var(--trade-bullish)] border-[var(--trade-bullish)]/50' },
    risk_off: { label: 'RISK OFF', color: 'text-[var(--trade-bearish)] border-[var(--trade-bearish)]/50' },
    choppy: { label: 'CHOPPY', color: 'text-muted-foreground border-border' },
    trending: { label: 'TRENDING', color: 'text-[var(--gex-positive)] border-[var(--gex-positive)]/50' },
  };
  const regime = data ? marketRegimeLabel[data.marketRegime] : marketRegimeLabel.choppy;

  return (
    <QEPageShell width="wide" padding="md" grid="subtle">
      {/* HEADER */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-0.5">
              01 // GEX HUB · MARKET-WIDE GAMMA COMMAND
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              <span className="text-[var(--gex-positive)]">GEX</span> Hub
            </h1>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Top dealer gamma · top vanna movers · sector pulse · regime distribution — every 5 min
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* DYNAMIC JUMP-TO-TERMINAL */}
            <TickerSelector
              value=""
              onChange={jumpToTerminal}
              variant="button"
              placeholder="Jump to terminal…"
              data-testid="scanner-jump-selector"
            />
            <div className={cn('px-3 py-1.5 rounded-md border text-[10px] font-mono font-bold uppercase tracking-widest', regime.color)}>
              MKT · {regime.label}
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className={componentStyles.gex.modeButton}
              data-testid="refresh-scan"
            >
              {isFetching ? 'SCANNING…' : 'REFRESH'}
            </button>
          </div>
        </div>

        {/* STATS STRIP */}
        {data && (
          <div className="grid grid-cols-4 gap-3 mt-4">
            <StatCard label="SCANNED" value={data.tickersScanned} />
            <StatCard label="WITH DATA" value={data.tickersWithData} />
            <StatCard label="TOP PICK" value={data.topPick || '—'} highlight />
            <StatCard label="ERRORS" value={data.errors?.length || 0} />
          </div>
        )}
      </div>

      {/* HUB PANELS — top GEX/VEX + sectors + regime */}
      {hub && <GEXHubPanels hub={hub} />}

      {/* CONFLUENCE LIST SECTION HEADER */}
      <div className="flex items-center justify-between mb-3 pt-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            02 // FULL CONFLUENCE LIST
          </div>
          <div className="text-sm font-mono font-bold text-foreground">
            All watchlist tickers ranked by gamma + vanna confluence
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex items-center gap-4 mb-4 px-3 py-2 rounded-lg bg-[var(--surface-raised)] border border-border">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          FILTER:
        </div>
        <FilterGroup
          label="Tier"
          options={[
            { value: 'all', label: 'All' },
            { value: 'elite', label: 'Elite 75+' },
            { value: 'strong', label: 'Strong 60+' },
            { value: 'watch', label: 'Watch 40+' },
          ]}
          value={filterTier}
          onChange={(v) => setFilterTier(v as FilterTier)}
        />
        <FilterGroup
          label="Bias"
          options={[
            { value: 'all', label: 'All' },
            { value: 'long', label: 'Long' },
            { value: 'short', label: 'Short' },
          ]}
          value={filterBias}
          onChange={(v) => setFilterBias(v as FilterBias)}
        />
        <div className="ml-auto text-[10px] font-mono text-muted-foreground">
          {filtered.length} / {rows.length} shown
        </div>
      </div>

      {/* LEGEND */}
      <div className="flex items-center gap-4 mb-4 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
        <span>SCORE =</span>
        <LegendBar color="var(--gex-positive)" label="Flip" />
        <LegendBar color="var(--gex-negative)" label="Walls" />
        <LegendBar color="var(--gex-flip)" label="Vex" />
        <LegendBar color="var(--brand-cyan)" label="Liq" />
        <LegendBar color="var(--brand-teal)" label="Regime" />
      </div>

      {/* LOADING / ERROR / ROWS */}
      {isLoading && (
        <div className="p-12 text-center text-xs font-mono text-muted-foreground">
          SCANNING WATCHLIST…
        </div>
      )}
      {error && (
        <div className="p-6 text-center text-xs font-mono text-[var(--trade-bearish)] border border-[var(--trade-bearish)]/30 rounded-lg">
          SCAN FAILED — {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="p-12 text-center text-xs font-mono text-muted-foreground">
          No tickers match filters
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((row, i) => (
          <ConfluenceRow key={row.symbol} row={row} rank={i + 1} />
        ))}
      </div>

      {/* ERRORS */}
      {data?.errors && data.errors.length > 0 && (
        <details className="mt-6">
          <summary className="text-[10px] font-mono text-muted-foreground cursor-pointer hover:text-foreground">
            {data.errors.length} ERRORS (click to expand)
          </summary>
          <div className="mt-2 p-3 rounded-md bg-[var(--surface-raised)] border border-border text-[10px] font-mono">
            {data.errors.map((e) => (
              <div key={e.symbol} className="text-muted-foreground">
                <span className="text-[var(--trade-bearish)]">{e.symbol}</span>: {e.error}
              </div>
            ))}
          </div>
        </details>
      )}
    </QEPageShell>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-border px-3 py-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-mono font-bold tabular-nums mt-0.5', highlight ? 'text-[var(--gex-positive)]' : 'text-foreground')}>
        {value}
      </div>
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-[9px] font-mono uppercase text-muted-foreground">{label}</div>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition-colors',
              value === o.value
                ? 'bg-[var(--gex-positive)]/15 border-[var(--gex-positive)]/50 text-[var(--gex-positive)]'
                : 'border-border text-muted-foreground hover:border-[var(--gex-positive)]/30 hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LegendBar({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: color, opacity: 0.7 }} />
      <span>{label}</span>
    </div>
  );
}
