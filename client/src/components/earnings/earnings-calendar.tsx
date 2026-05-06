/**
 * EarningsCalendar — full earnings universe view (every reporter, not just our universe).
 *
 *   • Day groups (Mon → Fri) with BMO/AMC/TBD sub-sessions
 *   • Search box (live filter as you type)
 *   • Filters: tier (1-5 importance), sector, time (BMO/AMC/TBD)
 *   • Top-30 by market cap strip ("the index movers")
 *   • Click any row → opens Research at /r/SYMBOL
 *
 * Powered by GET /api/earnings/calendar (cached 60min server-side).
 */
import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Search, Filter, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QECard, QEStatStrip, QEPill, type QEPillVariant } from '@/components/ui/qe';

type EarningsTime = 'BMO' | 'AMC' | 'TBD' | 'unknown';

interface CalendarRow {
  symbol: string;
  name: string;
  date: string;
  time: EarningsTime;
  epsEstimate: string | null;
  marketCap: number;
  importance: 1 | 2 | 3 | 4 | 5;
  sector: string;
}

interface CalendarDay {
  date: string;
  dayName: string;
  total: number;
  bmo: CalendarRow[];
  amc: CalendarRow[];
  tbd: CalendarRow[];
}

interface CalendarResponse {
  asOf: string;
  windowStart: string;
  windowEnd: string;
  totalReports: number;
  days: CalendarDay[];
  topByMarketCap: CalendarRow[];
}

const IMPORTANCE_VARIANT: Record<number, QEPillVariant> = {
  5: 'gold', 4: 'cyan', 3: 'bull', 2: 'default', 1: 'default',
};

export function EarningsCalendar() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [minImportance, setMinImportance] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [sector, setSector] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<EarningsTime | 'all'>('all');

  const { data, isLoading, isFetching, error, refetch } = useQuery<CalendarResponse>({
    queryKey: ['/api/earnings/calendar'],
    queryFn: async () => {
      const r = await fetch('/api/earnings/calendar', { credentials: 'include' });
      if (!r.ok) throw new Error(`fetch failed (${r.status})`);
      return r.json();
    },
    staleTime: 60 * 60_000,
    refetchInterval: false,
  });

  // All sectors present
  const allSectors = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const day of data.days) {
      for (const list of [day.bmo, day.amc, day.tbd]) {
        for (const r of list) set.add(r.sector);
      }
    }
    return Array.from(set).sort();
  }, [data]);

  // Apply filters per day
  const filteredDays = useMemo(() => {
    if (!data) return [] as CalendarDay[];
    const q = search.trim().toUpperCase();
    const filterRow = (r: CalendarRow) => {
      if (r.importance < minImportance) return false;
      if (sector && r.sector !== sector) return false;
      if (timeFilter !== 'all' && r.time !== timeFilter) return false;
      if (q && !r.symbol.includes(q) && !r.name.toUpperCase().includes(q)) return false;
      return true;
    };
    return data.days.map(d => ({
      ...d,
      bmo: d.bmo.filter(filterRow),
      amc: d.amc.filter(filterRow),
      tbd: d.tbd.filter(filterRow),
    })).map(d => ({ ...d, total: d.bmo.length + d.amc.length + d.tbd.length }));
  }, [data, search, minImportance, sector, timeFilter]);

  const totalShown = filteredDays.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-mono font-bold uppercase tracking-widest text-foreground">
            <Calendar className="w-4 h-4 inline text-[var(--brand-cyan)] mr-1" />
            Earnings Calendar
          </h2>
          <p className="text-[10px] font-mono text-muted-foreground/70">
            Every reporter — full universe, grouped by day · BMO / AMC / TBD
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border hover:border-[var(--brand-cyan)]/50 transition-colors"
        >
          <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin text-[var(--brand-cyan)]')} />
          <span className="text-[10px] font-mono uppercase tracking-widest">{isFetching ? 'Loading…' : 'Refresh'}</span>
        </button>
      </header>

      {/* Stats */}
      <QECard variant="default" padding="md">
        <QEStatStrip stats={[
          { label: 'TOTAL REPORTS', value: data?.totalReports ?? '—' },
          { label: 'SHOWING',       value: totalShown, tone: 'cyan' },
          { label: 'WINDOW',        value: data ? `${data.windowStart.slice(5)} → ${data.windowEnd.slice(5)}` : '—' },
          { label: 'SECTORS',       value: allSectors.length },
        ]} />
      </QECard>

      {/* Top by market cap strip */}
      {data?.topByMarketCap && data.topByMarketCap.length > 0 && (
        <QECard variant="accent-cyan" padding="md">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--brand-cyan)] mb-2">
            Top 30 by Market Cap (the index movers)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.topByMarketCap.slice(0, 30).map(r => (
              <button
                key={r.symbol}
                type="button"
                onClick={() => setLocation(`/r/${r.symbol}`)}
                title={`${r.name} · ${r.date} ${r.time} · ${formatMcap(r.marketCap)} · ${r.sector}`}
                className="px-2 py-1 text-[10px] font-mono font-bold uppercase rounded border border-border bg-muted/30 hover:border-[var(--brand-cyan)]/50 hover:text-[var(--brand-cyan)] transition-colors"
              >
                {r.symbol}
                <span className="ml-1 text-muted-foreground/60 font-normal">{r.date.slice(5)}</span>
              </button>
            ))}
          </div>
        </QECard>
      )}

      {/* Filters */}
      <QECard variant="default" padding="sm">
        <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono">
          {/* Search */}
          <div className="flex items-center gap-1.5">
            <Search className="w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ticker or name…"
              className="w-44 px-2 py-0.5 bg-card border border-border rounded text-foreground placeholder:text-muted-foreground/50 focus:border-[var(--brand-cyan)]/50 outline-none"
            />
          </div>

          {/* Importance */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Min Imp.</span>
            {([1, 2, 3, 4, 5] as const).map(i => (
              <button
                key={i}
                type="button"
                onClick={() => setMinImportance(i)}
                className={cn(
                  'px-1.5 py-0.5 rounded border text-[9px] font-bold',
                  minImportance === i
                    ? 'border-[var(--brand-cyan)]/50 text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/10'
                    : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                {i}{i === 5 && '+'}
              </button>
            ))}
          </div>

          {/* Time */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Time</span>
            {(['all', 'BMO', 'AMC', 'TBD'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeFilter(t)}
                className={cn(
                  'px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase',
                  timeFilter === t
                    ? 'border-[var(--brand-gold)]/50 text-[var(--brand-gold)] bg-[var(--brand-gold)]/10'
                    : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Sector */}
          {allSectors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Sector</span>
              <select
                value={sector ?? ''}
                onChange={e => setSector(e.target.value || null)}
                className="px-2 py-0.5 bg-card border border-border rounded text-foreground cursor-pointer focus:border-[var(--brand-cyan)]/50 outline-none"
              >
                <option value="">All</option>
                {allSectors.map(s => <option key={s} value={s} className="bg-card text-foreground">{s}</option>)}
              </select>
            </div>
          )}

          {(search || sector || minImportance > 1 || timeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSector(null); setMinImportance(1); setTimeFilter('all'); }}
              className="ml-auto text-[var(--brand-cyan)] hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </QECard>

      {/* Loading / error */}
      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
          <span className="ml-2 text-xs font-mono text-muted-foreground">Loading calendar…</span>
        </div>
      )}
      {error && (
        <QECard variant="accent-bear" padding="md" className="text-center text-[10px] font-mono text-[var(--trade-bearish)]">
          CALENDAR FAILED — {(error as Error).message}
        </QECard>
      )}

      {/* Days */}
      {!isLoading && filteredDays.map(day => (
        day.total === 0 ? null : (
          <div key={day.date}>
            <div className="flex items-baseline gap-2 mb-1.5 px-1">
              <h3 className="text-[12px] font-mono font-bold uppercase tracking-widest text-foreground">
                {day.dayName} <span className="text-muted-foreground/60 font-normal">· {day.date.slice(5)}</span>
              </h3>
              <span className="text-[9px] font-mono text-muted-foreground/60">{day.total} reports</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {day.bmo.length > 0 && <SessionGroup label="Before Market Open" rows={day.bmo} accent="bull" onJump={(s) => setLocation(`/r/${s}`)} />}
              {day.amc.length > 0 && <SessionGroup label="After Market Close" rows={day.amc} accent="cyan" onJump={(s) => setLocation(`/r/${s}`)} />}
              {day.tbd.length > 0 && <SessionGroup label="Time TBD" rows={day.tbd} accent="muted" onJump={(s) => setLocation(`/r/${s}`)} />}
            </div>
          </div>
        )
      ))}

      {totalShown === 0 && !isLoading && data && (
        <QECard variant="default" padding="lg" className="text-center text-[10px] font-mono text-muted-foreground">
          No reporters match your filters.
        </QECard>
      )}
    </div>
  );
}

// ─── Session group (one column for BMO / AMC / TBD) ──────────────────

function SessionGroup({
  label, rows, accent, onJump,
}: {
  label: string; rows: CalendarRow[]; accent: 'bull' | 'cyan' | 'muted';
  onJump: (sym: string) => void;
}) {
  const accentCls =
    accent === 'bull' ? 'text-[var(--trade-bullish)]' :
    accent === 'cyan' ? 'text-[var(--brand-cyan)]' :
    'text-muted-foreground';

  return (
    <QECard variant="default" padding="none" className="overflow-hidden">
      <div className={cn('px-3 py-1.5 border-b border-border/40 bg-muted/20')}>
        <div className={cn('text-[9px] font-mono font-bold uppercase tracking-widest', accentCls)}>
          {label} · {rows.length}
        </div>
      </div>
      <div className="max-h-[400px] overflow-auto">
        <table className="w-full text-[10px] font-mono">
          <tbody>
            {rows.map(r => (
              <tr
                key={r.symbol + r.date}
                onClick={() => onJump(r.symbol)}
                className="border-b border-border/15 hover:bg-muted/20 cursor-pointer"
              >
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-foreground">{r.symbol}</span>
                    <QEPill variant={IMPORTANCE_VARIANT[r.importance]}>{r.importance}</QEPill>
                  </div>
                  <div className="text-[9px] text-muted-foreground/70 truncate max-w-[180px]">{r.name}</div>
                </td>
                <td className="text-right px-2 py-1.5 align-top">
                  <div className="text-[9px] text-muted-foreground uppercase">{r.sector}</div>
                  <div className="text-[10px] tabular-nums text-foreground/80">
                    {r.epsEstimate ?? '—'}
                  </div>
                  {r.marketCap > 0 && (
                    <div className="text-[8px] text-muted-foreground/60">{formatMcap(r.marketCap)}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </QECard>
  );
}

function formatMcap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}
