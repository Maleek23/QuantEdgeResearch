/**
 * GEX Terminal — Per-ticker gamma exposure analysis.
 *
 * Skylit-inspired layout:
 *   Row 1: Ticker tabs (SPY, TSLA, QQQ... + custom input)
 *   Row 2: GEX/VEX | symbol+price | view pills | expiry filters | interval
 *   Body:  PROFILE | MATRIX | LEVELS (switchable via view pills)
 *
 * All QUANT SEEKER ticker clicks route here: /terminal/:symbol
 */

import { useState, useMemo } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { GEXExpiryMatrix } from '@/components/gex/gex-expiry-matrix';
import { GEXHeatmapGrid } from '@/components/gex/gex-heatmap-grid';
import { GEXLevelBadge } from '@/components/gex/gex-level-badge';
import { cn } from '@/lib/utils';
import { formatGEX, formatGammaPct } from '../../../shared/gex-types';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { GEXTerminalData, StrikeExpiryCell } from '../../../shared/gex-types';


// ─── Helpers ────────────────────────────────────────────────
/** Smart exposure formatter: GEX is in $B, VEX is in $M — scale accordingly */
function formatExposure(val: number, mode: 'gex' | 'vex'): string {
  const sign = val >= 0 ? '+' : '−';
  const abs = Math.abs(val);
  if (mode === 'gex') {
    // totalGEX is in billions
    return `${sign}$${abs.toFixed(2)}B`;
  }
  // totalVEX is in millions
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}B`;
  return `${sign}$${abs.toFixed(1)}M`;
}

// ─── Constants ──────────────────────────────────────────────
type TerminalView = 'profile' | 'matrix' | 'levels';
type ExposureMode = 'gex' | 'vex';

const DEFAULT_TICKERS = ['SPY', 'TSLA', 'QQQ', 'SPXW', 'NVDA', 'AAPL'];

const VIEW_OPTIONS: { value: TerminalView; label: string }[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'levels', label: 'Levels' },
];

/** Parse "APR 14"-style label into a Date (assumes current year) */
function parseExpiryLabel(label: string): Date | null {
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const month = months[parts[0].toUpperCase()];
  const day = parseInt(parts[1], 10);
  if (month === undefined || isNaN(day)) return null;
  return new Date(new Date().getFullYear(), month, day);
}

/** Group expiry dates into Mon-Fri trading weeks */
function groupByWeek(expiries: { label: string; dte: number }[]): { key: string; weekLabel: string; expLabels: string[] }[] {
  if (expiries.length === 0) return [];

  const groups = new Map<string, string[]>();
  const keyToMonday = new Map<string, Date>();

  for (const exp of expiries) {
    const d = parseExpiryLabel(exp.label);
    if (!d) continue;
    const day = d.getDay(); // 0=Sun..6=Sat
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset);
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    if (!groups.has(key)) { groups.set(key, []); keyToMonday.set(key, monday); }
    groups.get(key)!.push(exp.label);
  }

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, labels]) => {
      const mon = keyToMonday.get(key)!;
      const fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4);
      return { key, weekLabel: `${fmt(mon)} – ${fmt(fri)}`, expLabels: labels };
    });
}

function getExpiries(matrix: StrikeExpiryCell[]): { label: string; dte: number }[] {
  const map = new Map<string, number>();
  for (const cell of matrix) {
    if (!map.has(cell.expiryLabel) || cell.dte < map.get(cell.expiryLabel)!) {
      map.set(cell.expiryLabel, cell.dte);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([label, dte]) => ({ label, dte }));
}

// ─── Main Component ──────────────────────────────────────────

export default function TerminalPage() {
  const [, params] = useRoute('/terminal/:symbol');
  const [, navigate] = useLocation();
  const symbol = (params?.symbol || 'SPY').toUpperCase();

  const [view, setView] = useState<TerminalView>('profile');
  const [exposureMode, setExposureMode] = useState<ExposureMode>('gex');
  const [matrixExpanded, setMatrixExpanded] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [customInput, setCustomInput] = useState('');

  // ─── Watchlist query — populate ticker tabs ───────────────
  const { data: watchlistData } = useQuery<{ symbol: string }[]>({
    queryKey: ['/api/watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/watchlist', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120_000,
  });

  const tickers = useMemo(() => {
    if (!watchlistData || watchlistData.length === 0) return DEFAULT_TICKERS;
    const wlSymbols = watchlistData
      .map(w => (w.symbol || '').toUpperCase())
      .filter(s => s.length > 0 && s.length <= 5);
    // Deduplicate, keep defaults at front for options-heavy tickers
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of [...DEFAULT_TICKERS, ...wlSymbols]) {
      if (!seen.has(s)) { seen.add(s); result.push(s); }
    }
    return result;
  }, [watchlistData]);

  // ─── Data query ───────────────────────────────────────────
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
    enabled: !!symbol,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  // ─── Derived state ────────────────────────────────────────
  const expiries = useMemo(() => {
    if (!data?.strikeExpiryMatrix) return [];
    return getExpiries(data.strikeExpiryMatrix);
  }, [data?.strikeExpiryMatrix]);

  const weekGroups = useMemo(() => groupByWeek(expiries), [expiries]);

  const visibleExpiries = useMemo(() => {
    if (selectedWeek === 'all') return undefined;
    const week = weekGroups.find(w => w.key === selectedWeek);
    return week?.expLabels ?? undefined;
  }, [selectedWeek, weekGroups]);

  // ─── Handlers ─────────────────────────────────────────────
  const handleSymbolChange = (next: string) => {
    navigate(`/terminal/${next.toUpperCase()}`);
    setSelectedWeek('all');
    setMatrixExpanded(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInput.trim()) {
      handleSymbolChange(customInput.trim().toUpperCase());
      setCustomInput('');
    }
  };

  // Ticker nav
  const currentIdx = tickers.indexOf(symbol);
  const handlePrev = () => {
    if (currentIdx > 0) handleSymbolChange(tickers[currentIdx - 1]);
  };
  const handleNext = () => {
    if (currentIdx >= 0 && currentIdx < tickers.length - 1) handleSymbolChange(tickers[currentIdx + 1]);
  };

  // Projection & exposure mode
  const proj = data?.projection;
  const projMovePct = proj ? ((proj.endPrice - proj.startPrice) / proj.startPrice) * 100 : 0;
  const netExposure = exposureMode === 'gex' ? data?.snapshot.totalGEX : data?.snapshot.totalVEX;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-56px)] bg-[var(--surface-base)] flex flex-col overflow-hidden">

      {/* ═══ SKYLIT-STYLE DASHBOARD TOOLBAR ═══ */}
      <div className="flex-shrink-0 border-b border-border/30 bg-[var(--surface-raised)]">

        {/* Row 1: Ticker tabs */}
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/15 overflow-x-auto">
          {tickers.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => handleSymbolChange(t)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-colors whitespace-nowrap',
                t === symbol
                  ? 'bg-foreground/10 text-foreground ring-1 ring-foreground/20'
                  : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/10'
              )}
            >
              {t}
            </button>
          ))}
          <form onSubmit={handleCustomSubmit} className="ml-1">
            <input
              type="text"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              placeholder="+"
              className="w-10 px-1.5 py-1 text-[10px] font-mono font-bold uppercase text-center bg-transparent border border-border/30 rounded text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-[var(--gex-positive)]/50 focus:w-16 transition-all"
            />
          </form>
        </div>

        {/* Row 2: All controls in one line */}
        <div className="flex items-center gap-2 px-4 py-1.5 overflow-x-auto">

          {/* GEX / VEX toggle */}
          <div className="flex gap-0.5 p-0.5 rounded bg-[var(--surface-base)] border border-border/30">
            <button
              type="button"
              onClick={() => setExposureMode('gex')}
              className={cn(
                'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                exposureMode === 'gex'
                  ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              GEX
            </button>
            <button
              type="button"
              onClick={() => setExposureMode('vex')}
              className={cn(
                'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                exposureMode === 'vex'
                  ? 'bg-violet-400/15 text-violet-400'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              VEX
            </button>
          </div>

          {/* Nav + symbol info */}
          <button type="button" onClick={handlePrev} className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="font-bold text-foreground">{symbol}</span>
            {data?.snapshot.spotPrice !== undefined && (
              <>
                <span className="text-muted-foreground/40">•</span>
                <span className="text-foreground tabular-nums">${data.snapshot.spotPrice.toFixed(2)}</span>
              </>
            )}
          </div>
          <button type="button" onClick={handleNext} className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-border/20" />

          {/* View pills: Profile | Matrix | Levels */}
          <div className="flex gap-0.5 p-0.5 rounded bg-[var(--surface-base)] border border-border/30">
            {VIEW_OPTIONS.map(v => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                className={cn(
                  'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded transition-colors',
                  view === v.value
                    ? 'bg-[var(--gex-positive)]/15 text-[var(--gex-positive)]'
                    : 'text-muted-foreground/50 hover:text-muted-foreground'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-border/20" />

          {/* Week-based expiry filter */}
          {expiries.length > 1 && (
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="bg-[var(--surface-base)] border border-border/30 rounded px-2 py-0.5 text-[9px] font-mono font-bold uppercase text-foreground outline-none cursor-pointer"
            >
              <option value="all">All Dates ({expiries.length})</option>
              {weekGroups.map((wk, i) => (
                <option key={wk.key} value={wk.key}>
                  {i === 0 ? 'This Week' : i === 1 ? 'Next Week' : 'Wk of'} · {wk.weekLabel} ({wk.expLabels.length})
                </option>
              ))}
            </select>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Matrix expand button */}
          {view === 'matrix' && (
            <button
              type="button"
              onClick={() => setMatrixExpanded(!matrixExpanded)}
              className={cn(
                'px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest rounded border transition-colors',
                matrixExpanded
                  ? 'border-amber-400/30 text-amber-400 bg-amber-400/10'
                  : 'border-border/30 text-muted-foreground hover:text-foreground'
              )}
            >
              {matrixExpanded ? 'COLLAPSE' : 'ALL STRIKES'}
            </button>
          )}

          {/* Refresh */}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin text-amber-400')} />
          </button>
        </div>
      </div>

      {/* ═══ SNAPSHOT STRIP ═══ */}
      {data && (
        <div className="flex-shrink-0 border-b border-border/15 bg-[var(--surface-base)] px-4 py-1.5">
          <div className="flex items-center gap-4 text-[10px] font-mono overflow-x-auto">
            {/* Regime badge */}
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border whitespace-nowrap',
              data.snapshot.regime === 'positive_gamma'
                ? 'bg-[var(--gex-positive)]/10 border-[var(--gex-positive)]/40 text-[var(--gex-positive)]'
                : data.snapshot.regime === 'negative_gamma'
                  ? 'bg-[var(--gex-negative)]/10 border-[var(--gex-negative)]/40 text-[var(--gex-negative)]'
                  : 'bg-muted border-border text-muted-foreground'
            )}>
              {data.snapshot.regime === 'positive_gamma' ? 'POSITIVE Γ' : data.snapshot.regime === 'negative_gamma' ? 'NEGATIVE Γ' : 'NEUTRAL'}
            </span>

            <span className="text-muted-foreground/40 whitespace-nowrap">NET {exposureMode.toUpperCase()}</span>
            <span className="font-bold text-foreground tabular-nums whitespace-nowrap">
              {typeof netExposure === 'number' && !isNaN(netExposure) ? formatExposure(netExposure, exposureMode) : '—'}
            </span>

            <div className="w-px h-3 bg-border/20 flex-shrink-0" />

            <span className="text-muted-foreground/40 whitespace-nowrap">FLIP</span>
            <span className="font-bold tabular-nums whitespace-nowrap">{data.snapshot.gammaFlipPrice != null ? `$${data.snapshot.gammaFlipPrice.toFixed(0)}` : '—'}</span>

            <span className="text-muted-foreground/40 whitespace-nowrap">CALL WALL</span>
            <span className="font-bold text-[var(--gex-positive)] tabular-nums whitespace-nowrap">{data.snapshot.callWall != null ? `$${data.snapshot.callWall.toFixed(0)}` : '—'}</span>

            <span className="text-muted-foreground/40 whitespace-nowrap">PUT WALL</span>
            <span className="font-bold text-[var(--gex-negative)] tabular-nums whitespace-nowrap">{data.snapshot.putWall != null ? `$${data.snapshot.putWall.toFixed(0)}` : '—'}</span>

            <span className="text-muted-foreground/40 whitespace-nowrap">MAX Γ</span>
            <span className="font-bold text-amber-400 tabular-nums whitespace-nowrap">★ {data.snapshot.maxGammaStrike != null ? `$${data.snapshot.maxGammaStrike.toFixed(0)}` : '—'}</span>
          </div>
        </div>
      )}

      {/* ═══ ZERO-Γ TARGET — projection magnet ═══ */}
      {data && data.snapshot.zeroGammaProjection != null && (
        <div className="flex-shrink-0 border-b border-border/15 bg-[var(--surface-base)] px-4 py-1.5">
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="text-[var(--gex-star)] font-bold uppercase whitespace-nowrap">ZERO-Γ TARGET</span>
            <span className="text-lg font-bold text-[var(--gex-positive)] tabular-nums">
              ${data.snapshot.zeroGammaProjection.toFixed(2)}
            </span>
            {data.snapshot.spotPrice > 0 && (
              <span className={cn(
                'font-bold tabular-nums',
                data.snapshot.zeroGammaProjection >= data.snapshot.spotPrice
                  ? 'text-[var(--trade-bullish)]'
                  : 'text-[var(--trade-bearish)]'
              )}>
                {data.snapshot.zeroGammaProjection >= data.snapshot.spotPrice ? '+' : ''}
                {(((data.snapshot.zeroGammaProjection - data.snapshot.spotPrice) / data.snapshot.spotPrice) * 100).toFixed(2)}%
              </span>
            )}
            <span className="text-muted-foreground/40">conf {proj ? `${(proj.confidence * 100).toFixed(0)}%` : '100%'}</span>
            <div className="w-px h-3 bg-border/20 flex-shrink-0" />
            <span className="text-muted-foreground/30">Magnet target based on dealer hedging flow</span>
          </div>
        </div>
      )}

      {/* ═══ LOADING STATE ═══ */}
      {!data && (
        <div className="flex items-center justify-center flex-1">
          {isError ? (
            <div className="text-center space-y-3">
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-negative)]">
                FAILED TO LOAD {symbol}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground">
                Options data unavailable — market may be closed or data source is down
              </div>
              <button type="button" onClick={() => refetch()} className="px-3 py-1.5 text-[9px] font-mono font-bold uppercase rounded border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
                RETRY
              </button>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)] animate-pulse">
                LOADING {symbol} TERMINAL...
              </div>
              <div className="text-[9px] font-mono text-muted-foreground">
                Fetching options chain & computing exposures
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ PROFILE VIEW — GEX bars + sidebar levels ═══ */}
      {data && view === 'profile' && (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-0 h-full">
            {/* GEX profile bars */}
            <div className="overflow-auto border-r border-border/15">
              <div className="px-4 py-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
                    {exposureMode.toUpperCase()} PROFILE BY STRIKE
                  </span>
                  <span className="text-[8px] font-mono text-muted-foreground">
                    {data.heatmap.length} strikes · spot ${data.snapshot.spotPrice.toFixed(2)}
                  </span>
                </div>
                <GEXHeatmapGrid cells={data.heatmap} spotPrice={data.snapshot.spotPrice} />
              </div>
            </div>

            {/* Key levels sidebar */}
            <div className="overflow-auto bg-[var(--surface-raised)]/30">
              <div className="px-3 py-2 border-b border-border/15 sticky top-0 bg-[var(--surface-raised)]/80 backdrop-blur-sm z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
                    KEY LEVELS
                  </span>
                  <span className="text-[8px] font-mono text-muted-foreground">
                    {data.snapshot.levels.length} strikes
                  </span>
                </div>
              </div>
              <div className="p-2 space-y-0.5">
                {data.snapshot.levels.map((lvl, i) => (
                  <div key={`${lvl.strike}-${lvl.role}-${i}`} className="flex items-center justify-between gap-2 px-1 py-1 rounded hover:bg-[var(--surface-base)]/50 transition-colors">
                    <GEXLevelBadge level={lvl} compact />
                    <div className="text-right">
                      <div className="text-[10px] font-mono tabular-nums text-foreground">{formatGEX(lvl.gex)}</div>
                      <div className="text-[8px] font-mono text-muted-foreground tabular-nums">
                        {formatGammaPct(lvl.gammaPct)} · OI {lvl.openInterest.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MATRIX VIEW — Strike × Expiry heatmap ═══ */}
      {data && view === 'matrix' && (
        <div className="flex-1 overflow-auto px-4 py-3">
          {data.strikeExpiryMatrix && data.strikeExpiryMatrix.length > 0 ? (
            <GEXExpiryMatrix
              matrix={data.strikeExpiryMatrix}
              snapshot={data.snapshot}
              visibleExpiries={visibleExpiries}
              hideControls
              externalMode={exposureMode}
              externalExpanded={matrixExpanded}
            />
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-[10px] font-mono text-muted-foreground">No matrix data for {symbol}</div>
            </div>
          )}
        </div>
      )}

      {/* ═══ LEVELS VIEW — Full key levels with bars ═══ */}
      {data && view === 'levels' && (
        <div className="flex-1 overflow-auto">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="rounded-lg bg-[var(--surface-raised)] border border-border/15 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/15 bg-[var(--surface-base)]/50">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--gex-positive)]">
                  ALL KEY LEVELS — {symbol}
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">
                  {data.snapshot.levels.length} strikes · spot ${data.snapshot.spotPrice.toFixed(2)} · net {formatGEX(data.snapshot.totalGEX)}
                </span>
              </div>
              <div className="divide-y divide-border/10">
                {data.snapshot.levels.map((lvl, i) => {
                  const distPct = ((lvl.strike - data.snapshot.spotPrice) / data.snapshot.spotPrice * 100);
                  const isNear = Math.abs(distPct) < 0.5;
                  return (
                    <div
                      key={`${lvl.strike}-${lvl.role}-${i}`}
                      className={cn(
                        'flex items-center gap-4 px-4 py-2 transition-colors hover:bg-[var(--surface-base)]/40',
                        isNear && 'bg-[var(--projection-glow)]/5'
                      )}
                    >
                      <span className="text-[10px] font-mono text-muted-foreground/40 w-5 text-right tabular-nums">{i + 1}</span>
                      <div className="w-40"><GEXLevelBadge level={lvl} /></div>
                      <div className="flex-1">
                        <div className="h-3 bg-black/30 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', lvl.gex >= 0 ? 'bg-[var(--gex-positive)]' : 'bg-[var(--gex-negative)]')}
                            style={{ width: `${Math.min(lvl.gammaPct * 3, 100)}%`, opacity: 0.6 }}
                          />
                        </div>
                      </div>
                      <div className="text-right w-20">
                        <div className="text-[11px] font-mono font-bold tabular-nums">{formatGEX(lvl.gex)}</div>
                      </div>
                      <div className="text-right w-14">
                        <div className="text-[10px] font-mono tabular-nums text-muted-foreground">{formatGammaPct(lvl.gammaPct)}</div>
                      </div>
                      <div className="text-right w-20">
                        <div className="text-[10px] font-mono tabular-nums text-muted-foreground">
                          OI {lvl.openInterest >= 1000 ? `${(lvl.openInterest / 1000).toFixed(1)}K` : lvl.openInterest.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right w-14">
                        <div className={cn(
                          'text-[10px] font-mono font-bold tabular-nums',
                          distPct > 0 ? 'text-[var(--gex-positive)]' : distPct < 0 ? 'text-[var(--gex-negative)]' : 'text-muted-foreground'
                        )}>
                          {distPct >= 0 ? '+' : ''}{distPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
