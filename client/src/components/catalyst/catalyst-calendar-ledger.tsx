import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { useStockContext } from '@/contexts/stock-context';

interface EconomicEvent {
  name: string;
  date: string;
  time: string;
  importance: 'high' | 'medium' | 'low';
  description: string;
  tradingImpact?: string;
}

interface EarningsRow {
  symbol: string;
  name: string;
  date: string;
  time: 'BMO' | 'AMC' | 'TBD' | 'unknown';
  epsEstimate: string | null;
  importance: 1 | 2 | 3 | 4 | 5;
  sector: string;
}

interface EarningsDay {
  date: string;
  dayName: string;
  bmo: EarningsRow[];
  amc: EarningsRow[];
  tbd: EarningsRow[];
}

interface EarningsResponse {
  windowStart: string;
  windowEnd: string;
  totalReports: number;
  days: EarningsDay[];
}

const marketDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const dayLabel = (date: string) => new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
}).format(new Date(`${date}T12:00:00Z`)).toUpperCase();

const impactColor: Record<EconomicEvent['importance'], string> = {
  high: 'var(--trade-bearish)',
  medium: 'var(--brand-gold)',
  low: 'var(--brand-cyan)',
};

export function CatalystCalendarLedger({ activeSymbols }: { activeSymbols: Set<string> }) {
  const { setCurrentStock } = useStockContext();
  const macro = useQuery<{ upcoming: EconomicEvent[]; coverage?: { source: string; current: boolean; lastDate: string | null } }>({
    queryKey: ['/api/economic-calendar', 'ledger'],
    queryFn: async () => {
      const r = await fetch('/api/economic-calendar?days=7', { credentials: 'include' });
      if (!r.ok) throw new Error('economic calendar failed');
      return r.json();
    },
    staleTime: 15 * 60_000,
  });
  const earnings = useQuery<EarningsResponse>({
    queryKey: ['/api/earnings/calendar', 'ledger'],
    queryFn: async () => {
      const r = await fetch('/api/earnings/calendar?days=7', { credentials: 'include' });
      if (!r.ok) throw new Error('earnings calendar failed');
      return r.json();
    },
    staleTime: 60 * 60_000,
  });

  const earningsDays = useMemo(() => (earnings.data?.days ?? []).map((day) => ({
    ...day,
    rows: [...day.bmo, ...day.amc, ...day.tbd]
      .sort((a, b) => Number(activeSymbols.has(b.symbol)) - Number(activeSymbols.has(a.symbol)) || b.importance - a.importance)
      .slice(0, 14),
  })).filter((day) => day.rows.length), [earnings.data, activeSymbols]);

  const macroDays = useMemo(() => {
    const grouped = new Map<string, EconomicEvent[]>();
    for (const event of macro.data?.upcoming ?? []) {
      grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    }
    return [...grouped.entries()];
  }, [macro.data]);

  return (
    <section className="overflow-hidden rounded-lg border border-card-border bg-card">
      <div className="h-px bg-gradient-to-r from-[var(--trade-bearish)] via-[var(--brand-gold)] to-[var(--brand-cyan)] opacity-80" />
      <div className="grid min-h-[340px] lg:grid-cols-2">
        <CalendarPane
          title="US economic calendar"
          range={macro.data?.coverage?.current ? `next 7 days · ET · ${macro.data.coverage.source}` : 'verified source unavailable'}
          loading={macro.isLoading}
          unavailable={!macro.isLoading && macroDays.length === 0}
          unavailableText={`No verified US releases are available after ${marketDate}. Macro risk is unknown—not clear.`}
        >
          {macroDays.map(([date, events]) => (
            <LedgerDay key={date} date={date}>
              {events.map((event) => (
                <div key={`${event.date}-${event.time}-${event.name}`} className="grid grid-cols-[72px_12px_minmax(0,1fr)] items-start gap-2 border-b border-border/25 px-3 py-2 last:border-b-0">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{event.time.replace(' ET', '')}</span>
                  <span className="mt-1 h-2 w-2 rounded-[2px]" style={{ background: impactColor[event.importance] }} />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-foreground/90">{event.name}</div>
                    <div className="mt-0.5 truncate text-[9px] text-muted-foreground" title={event.tradingImpact}>{event.tradingImpact || event.description}</div>
                  </div>
                </div>
              ))}
            </LedgerDay>
          ))}
        </CalendarPane>

        <CalendarPane
          title="Earnings · market calendar"
          range={earnings.data ? `${earnings.data.windowStart.slice(5)} — ${earnings.data.windowEnd.slice(5)} · ${earnings.data.totalReports} reports` : 'next 7 days'}
          loading={earnings.isLoading}
          unavailable={!earnings.isLoading && earningsDays.length === 0}
          unavailableText="The earnings source returned no verified reporters for this window."
          className="border-t border-border/50 lg:border-l lg:border-t-0"
        >
          {earningsDays.map((day) => (
            <LedgerDay key={day.date} date={day.date}>
              {day.rows.map((row) => {
                const active = activeSymbols.has(row.symbol);
                return (
                  <button
                    key={`${day.date}-${row.symbol}`}
                    type="button"
                    onClick={() => setCurrentStock({ symbol: row.symbol })}
                    className="grid w-full grid-cols-[70px_54px_minmax(0,1fr)_64px] items-center gap-2 border-b border-border/25 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-foreground/[0.035]"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-foreground">
                      <span className={`h-2 w-2 rounded-full ${active ? 'bg-[var(--brand-cyan)] shadow-[0_0_8px_var(--brand-cyan)]' : 'bg-foreground/15'}`} />
                      {row.symbol}
                    </span>
                    <span className="font-mono text-[9px] font-semibold uppercase text-muted-foreground">{row.time}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{row.sector}</span>
                    <span className="text-right font-mono text-[10px] tabular-nums text-foreground/80">{row.epsEstimate ?? '—'}</span>
                  </button>
                );
              })}
            </LedgerDay>
          ))}
        </CalendarPane>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/65">
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--brand-cyan)]" />signal-linked event</span>
        <span>High <b className="text-[var(--trade-bearish)]">■</b> · medium <b className="text-[var(--brand-gold)]">■</b> · low <b className="text-[var(--brand-cyan)]">■</b></span>
      </div>
    </section>
  );
}

function CalendarPane({ title, range, loading, unavailable, unavailableText, className = '', children }: {
  title: string; range: string; loading: boolean; unavailable: boolean; unavailableText: string;
  className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/60 bg-card/95 px-3 py-2.5 backdrop-blur-xl">
        <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/85"><CalendarDays className="h-3.5 w-3.5 text-[var(--brand-cyan)]" />{title}</span>
        <span className="font-mono text-[9px] text-muted-foreground">{range}</span>
      </div>
      <div className="max-h-[390px] overflow-y-auto">
        {loading ? <PaneState>Reading verified calendar…</PaneState> : unavailable ? <PaneState>{unavailableText}</PaneState> : children}
      </div>
    </div>
  );
}

function LedgerDay({ date, children }: { date: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-[1] border-b border-border/45 bg-muted/70 px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.11em] text-foreground/75 backdrop-blur-lg">
        {dayLabel(date)}{date === marketDate && <span className="ml-2 text-[var(--brand-cyan)]">· today</span>}
      </div>
      {children}
    </div>
  );
}

function PaneState({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[290px] place-items-center px-8 text-center font-mono text-[10px] leading-relaxed text-muted-foreground">{children}</div>;
}
