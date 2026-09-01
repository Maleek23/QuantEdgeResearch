/**
 * GEX Hub — workflow-first layout.
 *
 *   ┌─ Toolbar (regime + filters + refresh)
 *   ├─ MarketTape (1 line: net GEX/VEX, regime, futures)
 *   ├─ TopPlays (ranked actionable setups)
 *   ├─ Workflow tabs: ALL / 0DTE / SWING / LEAPS / FLIP / POS γ / NEG γ
 *   │   each tab filters the confluence list to a genuinely different slice
 *   ├─ Sort: Score / +GEX / −GEX / VEX / Flip-distance
 *   ├─ Confluence list
 *   └─ Sectors + GEX Analysis (collapsibles)
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMarketPoll, POLL } from '@/hooks/use-market-poll';
import { useLocation } from 'wouter';
import { ConfluenceRow } from '@/components/gex/confluence-row';
import { GEXHubPanels, SectorsPanel } from '@/components/gex/gex-hub-panels';
import { TickerSelector } from '@/components/shared/ticker-selector';
import { cn } from '@/lib/utils';
import { componentStyles } from '@/lib/design-tokens';
import { ChevronDown, RefreshCw } from 'lucide-react';

import type {
  ConfluenceScanResult,
  ConfluenceRow as ConfluenceRowData,
  GEXHubData,
} from '../../../shared/gex-types';

interface HubResponse {
  hub: GEXHubData;
  /** Server-sent, so the Hub can show the data's age rather than the fetch's. */
  generatedAt?: string | null;
  scan: ConfluenceScanResult;
}

function useGEXHub() {
  const interval = useMarketPoll(POLL.HEAVY.open, POLL.HEAVY.closed);
  return useQuery<HubResponse>({
    queryKey: ['/api/gex-vex/hub'],
    queryFn: async () => {
      const res = await fetch('/api/gex-vex/hub', { credentials: 'include' });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error(
          res.status === 401
            ? 'Not authenticated — sign in to view GEX Hub'
            : `Hub endpoint not available (HTTP ${res.status}).`,
        );
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `Hub fetch failed (${res.status})`);
      }
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: interval,
    retry: 1,
  });
}

// ─── Workflow tabs ───────────────────────────────────────────
type Workflow = 'all' | 'today' | 'swing' | 'leaps' | 'flip' | 'posg' | 'negg';
const WORKFLOWS: { id: Workflow; label: string; hint: string }[] = [
  { id: 'all',   label: 'ALL',     hint: 'every scanned ticker' },
  { id: 'today', label: '0DTE',    hint: 'today-expiry walls + flip' },
  { id: 'swing', label: 'SWING',   hint: '7–30 DTE positioning' },
  { id: 'leaps', label: 'LEAPS',   hint: '90+ DTE institutional walls' },
  { id: 'flip',  label: 'FLIP',    hint: 'spot within 1.5% of gamma flip' },
  { id: 'posg',  label: 'POS γ',   hint: 'positive-gamma regime — pin/fade' },
  { id: 'negg',  label: 'NEG γ',   hint: 'negative-gamma regime — break/trend' },
];

type SortKey = 'score' | 'pgex' | 'ngex' | 'vex' | 'flip';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'score', label: 'Score' },
  { id: 'pgex',  label: '+GEX' },
  { id: 'ngex',  label: '−GEX' },
  { id: 'vex',   label: 'VEX' },
  { id: 'flip',  label: 'Flip' },
];

function rowMatchesWorkflow(row: ConfluenceRowData, wf: Workflow): boolean {
  if (wf === 'all') return true;
  if (wf === 'posg') return row.regime === 'positive_gamma';
  if (wf === 'negg') return row.regime === 'negative_gamma';
  if (wf === 'flip') {
    if (!row.gammaFlip || !row.spotPrice) return false;
    return Math.abs(row.gammaFlip - row.spotPrice) / row.spotPrice < 0.015;
  }
  // DTE-bucket-driven tabs
  const buckets = row.byDte;
  if (!buckets) return false;
  if (wf === 'today') return !!buckets.today && buckets.today.expirationsCount > 0;
  if (wf === 'swing') return !!buckets.month && buckets.month.expirationsCount > 0;
  if (wf === 'leaps') return !!buckets.leaps && buckets.leaps.expirationsCount > 0;
  return true;
}

function sortRows(rows: ConfluenceRowData[], key: SortKey): ConfluenceRowData[] {
  const arr = [...rows];
  switch (key) {
    case 'score': return arr.sort((a, b) => b.score - a.score);
    case 'pgex':  return arr.sort((a, b) => b.totalGEX - a.totalGEX);
    case 'ngex':  return arr.sort((a, b) => a.totalGEX - b.totalGEX);
    case 'vex':   return arr.sort((a, b) => Math.abs(b.totalVEX) - Math.abs(a.totalVEX));
    case 'flip':  return arr.sort((a, b) => {
      const da = a.gammaFlip && a.spotPrice ? Math.abs(a.gammaFlip - a.spotPrice) / a.spotPrice : 999;
      const db = b.gammaFlip && b.spotPrice ? Math.abs(b.gammaFlip - b.spotPrice) / b.spotPrice : 999;
      return da - db;
    });
  }
}

const REGIME_BADGE: Record<string, string> = {
  risk_on:  'text-[var(--trade-bullish)] border-[var(--trade-bullish)]/40',
  risk_off: 'text-[var(--trade-bearish)] border-[var(--trade-bearish)]/40',
  choppy:   'text-muted-foreground border-border',
  trending: 'text-[var(--brand-cyan)] border-[var(--brand-cyan)]/40',
};

export default function GEXScannerPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading, error, refetch, isFetching } = useGEXHub();
  const [workflow, setWorkflow] = useState<Workflow>('all');
  const [sort, setSort] = useState<SortKey>('score');
  const [sectorsOpen, setSectorsOpen] = useState(false);

  const scan = data?.scan;
  const hub = data?.hub;
  const rows = scan?.rows ?? [];

  const visibleRows = useMemo(() => {
    const matched = rows.filter(r => rowMatchesWorkflow(r, workflow));
    return sortRows(matched, sort);
  }, [rows, workflow, sort]);

  const jumpToTerminal = (sym: string) => {
    if (sym) setLocation(`/terminal/${sym.toUpperCase()}`);
  };

  const regime = scan ? scan.marketRegime : 'choppy';

  return (
    <div className="space-y-3 px-4 py-3">
      {/* ─── TOOLBAR ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn(
          'px-2 py-0.5 rounded border text-[9px] font-mono font-bold uppercase tracking-widest',
          REGIME_BADGE[regime] ?? REGIME_BADGE.choppy,
        )}>
          {regime.replace('_', ' ')}
        </span>
        {scan && (
          <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
            {scan.tickersWithData}/{scan.tickersScanned} tickers
            {scan.topPick && (
              <> · top <span className="text-[var(--brand-gold)] font-bold">{scan.topPick}</span></>
            )}
          </span>
        )}
        <div className="flex-1" />
        <TickerSelector
          value=""
          onChange={jumpToTerminal}
          variant="button"
          placeholder="Terminal..."
          data-testid="scanner-jump-selector"
        />
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1 text-muted-foreground/60 hover:text-foreground transition-colors"
          title="Refresh scan"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin text-[var(--brand-cyan)]')} />
        </button>
      </div>

      {/* ─── HUB CHROME (tape + top plays only) ─── */}
      {hub && <GEXHubPanels hub={hub} generatedAt={data?.generatedAt ?? null} />}

      {/* ─── WORKFLOW TABS — distinct data slices ─── */}
      <div className="flex items-center gap-1 flex-wrap pb-1 border-b border-border/30">
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60 mr-1">
          VIEW
        </span>
        {WORKFLOWS.map(w => {
          const matchCount = rows.filter(r => rowMatchesWorkflow(r, w.id)).length;
          const empty = matchCount === 0;
          return (
            <button
              key={w.id}
              type="button"
              disabled={empty && w.id !== 'all'}
              onClick={() => setWorkflow(w.id)}
              title={`${w.hint} · ${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`}
              className={cn(
                'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded border transition-colors',
                empty && w.id !== 'all' && 'opacity-30 cursor-not-allowed',
                workflow === w.id
                  ? 'border-[var(--brand-cyan)]/50 text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/10'
                  : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {w.label}{w.id !== 'all' && !empty ? ` ·${matchCount}` : ''}
            </button>
          );
        })}
        <span className="text-[8px] font-mono text-muted-foreground/60 mx-1">|</span>
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60 mr-1">
          SORT
        </span>
        {SORTS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={cn(
              'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded border transition-colors',
              sort === s.id
                ? 'border-[var(--brand-gold)]/50 text-[var(--brand-gold)] bg-[var(--brand-gold)]/10'
                : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {s.label}
          </button>
        ))}
        <span className="text-[8px] font-mono text-muted-foreground/60 ml-auto tabular-nums">
          {visibleRows.length} rows
        </span>
      </div>

      {/* ─── ACTIVE WORKFLOW HINT ─── */}
      <div className="text-[9px] font-mono text-muted-foreground/60 -mt-1">
        {WORKFLOWS.find(w => w.id === workflow)?.hint}
      </div>

      {/* ─── CONFLUENCE LIST ─── */}
      {isLoading && (
        <div className="py-12 text-center text-[10px] font-mono text-muted-foreground animate-pulse">
          SCANNING WATCHLIST...
        </div>
      )}
      {error && (
        <div className={cn(componentStyles.card.accentBearish, 'p-4 text-center text-[10px] font-mono text-[var(--trade-bearish)]')}>
          SCAN FAILED — {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && visibleRows.length === 0 && (
        <div className={cn(componentStyles.card.default, 'py-8 text-center text-[10px] font-mono text-muted-foreground')}>
          No tickers in this view{workflow !== 'all' && <> — try a different workflow</>}.
        </div>
      )}

      <div className="space-y-1.5">
        {visibleRows.map((row, i) => (
          <ConfluenceRow key={row.symbol} row={row} rank={i + 1} workflow={workflow} />
        ))}
      </div>

      {/* ─── SECTORS (collapsible) ─── */}
      {hub && hub.sectors?.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setSectorsOpen(!sectorsOpen)}
            className={cn(componentStyles.card.default, 'w-full flex items-center justify-between px-3 py-2 hover:border-border')}
          >
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
              Sectors · {hub.sectors.length}
            </span>
            <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', sectorsOpen && 'rotate-180')} />
          </button>
          {sectorsOpen && (
            <div className="mt-2">
              <SectorsPanel hub={hub} />
            </div>
          )}
        </div>
      )}

      {/* ─── ERRORS (collapsed) ─── */}
      {scan?.errors && scan.errors.length > 0 && (
        <details>
          <summary className="text-[9px] font-mono text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
            {scan.errors.length} scan errors
          </summary>
          <div className={cn(componentStyles.card.inset, 'mt-1 p-2 text-[9px] font-mono space-y-0.5')}>
            {scan.errors.map(e => (
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
