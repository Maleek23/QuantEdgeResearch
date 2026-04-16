/**
 * GEX Hub — market-wide gamma + vanna overview.
 * Data-first layout: toolbar → hub panels → confluence list.
 */

import { useState, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMarketPoll, POLL } from '@/hooks/use-market-poll';
import { useLocation } from 'wouter';
import { ConfluenceRow } from '@/components/gex/confluence-row';
import { GEXHubPanels } from '@/components/gex/gex-hub-panels';
import { TickerSelector } from '@/components/shared/ticker-selector';
import { cn } from '@/lib/utils';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';

const GEXDashboard = lazy(() => import('@/pages/gex-dashboard'));
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
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const jumpToTerminal = (sym: string) => {
    if (sym) setLocation(`/terminal/${sym.toUpperCase()}`);
  };

  const data = hubResponse?.scan;
  const hub = hubResponse?.hub;
  const rows = data?.rows || [];
  const filtered = rows.filter((r) => {
    if (filterTier !== 'all' && r.scoreTier !== filterTier) return false;
    if (filterBias !== 'all' && r.bias !== filterBias) return false;
    return true;
  });

  const regimeMap: Record<string, { label: string; color: string }> = {
    risk_on: { label: 'RISK ON', color: 'text-[var(--trade-bullish)] border-[var(--trade-bullish)]/50' },
    risk_off: { label: 'RISK OFF', color: 'text-[var(--trade-bearish)] border-[var(--trade-bearish)]/50' },
    choppy: { label: 'CHOPPY', color: 'text-muted-foreground border-border' },
    trending: { label: 'TRENDING', color: 'text-[var(--gex-positive)] border-[var(--gex-positive)]/50' },
  };
  const regime = data ? regimeMap[data.marketRegime] : regimeMap.choppy;

  return (
    <div className="space-y-3 px-4 py-3">

      {/* ─── TOOLBAR ─── compact control row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Regime + stats */}
        <div className={cn('px-2 py-0.5 rounded border text-[9px] font-mono font-bold uppercase tracking-widest', regime.color)}>
          {regime.label}
        </div>

        {data && (
          <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
            {data.tickersWithData}/{data.tickersScanned} tickers
            {data.topPick && <> · top <span className="text-[var(--gex-positive)] font-bold">{data.topPick}</span></>}
          </span>
        )}

        <div className="w-px h-4 bg-border/20" />

        {/* Tier filter */}
        <div className="flex items-center gap-1">
          {(['all', 'elite', 'strong', 'watch'] as FilterTier[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterTier(t)}
              className={cn(
                'px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                filterTier === t
                  ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                  : 'text-muted-foreground/50 hover:text-muted-foreground',
              )}
            >
              {t === 'all' ? 'All' : t === 'elite' ? '75+' : t === 'strong' ? '60+' : '40+'}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-border/20" />

        {/* Bias filter */}
        <div className="flex items-center gap-1">
          {(['all', 'long', 'short'] as FilterBias[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setFilterBias(b)}
              className={cn(
                'px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                filterBias === b
                  ? b === 'long' ? 'bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)]'
                    : b === 'short' ? 'bg-[var(--trade-bearish)]/15 text-[var(--trade-bearish)]'
                    : 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground/50 hover:text-muted-foreground',
              )}
            >
              {b}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Count */}
        <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
          {filtered.length} / {rows.length}
        </span>

        {/* Jump to terminal */}
        <TickerSelector
          value=""
          onChange={jumpToTerminal}
          variant="button"
          placeholder="Terminal..."
          data-testid="scanner-jump-selector"
        />

        {/* Refresh */}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin text-[var(--gex-positive)]')} />
        </button>
      </div>

      {/* ─── HUB PANELS ─── top GEX/VEX + sectors + regime */}
      {hub && <GEXHubPanels hub={hub} />}

      {/* ─── SCORE LEGEND ─── inline, compact */}
      <div className="flex items-center gap-3 text-[8px] font-mono uppercase tracking-widest text-muted-foreground/50 pt-1">
        <span>SCORE =</span>
        <LegendDot color="var(--gex-positive)" label="Flip" />
        <LegendDot color="var(--gex-negative)" label="Walls" />
        <LegendDot color="var(--gex-flip)" label="Vex" />
        <LegendDot color="var(--brand-cyan)" label="Liq" />
        <LegendDot color="var(--brand-teal)" label="Regime" />
      </div>

      {/* ─── CONFLUENCE LIST ─── */}
      {isLoading && (
        <div className="py-12 text-center text-[10px] font-mono text-muted-foreground animate-pulse">
          SCANNING WATCHLIST...
        </div>
      )}
      {error && (
        <div className="p-4 text-center text-[10px] font-mono text-[var(--trade-bearish)] border border-[var(--trade-bearish)]/30 rounded-lg">
          SCAN FAILED — {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="py-12 text-center text-[10px] font-mono text-muted-foreground">
          No tickers match filters
        </div>
      )}

      <div className="space-y-1.5">
        {filtered.map((row, i) => (
          <ConfluenceRow key={row.symbol} row={row} rank={i + 1} />
        ))}
      </div>

      {/* ─── GEX ANALYSIS (collapsible) ─── */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setDashboardOpen(!dashboardOpen)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--surface-raised)] border border-border/30 hover:border-border/60 transition-colors"
        >
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            GEX ANALYSIS · Heatmap · Key Levels
          </span>
          <ChevronDown className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
            dashboardOpen && "rotate-180"
          )} />
        </button>
        {dashboardOpen && (
          <div className="mt-2 rounded-lg border border-border/30 overflow-hidden">
            <Suspense fallback={
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--gex-positive)]" />
              </div>
            }>
              <GEXDashboard />
            </Suspense>
          </div>
        )}
      </div>

      {/* ─── ERRORS (collapsed) ─── */}
      {data?.errors && data.errors.length > 0 && (
        <details className="pt-2">
          <summary className="text-[9px] font-mono text-muted-foreground/50 cursor-pointer hover:text-muted-foreground">
            {data.errors.length} errors
          </summary>
          <div className="mt-1 p-2 rounded bg-[var(--surface-raised)] border border-border/30 text-[9px] font-mono space-y-0.5">
            {data.errors.map((e) => (
              <div key={e.symbol} className="text-muted-foreground">
                <span className="text-[var(--trade-bearish)]">{e.symbol}</span>: {e.error}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-0.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, opacity: 0.7 }} />
      <span>{label}</span>
    </div>
  );
}
