/**
 * CATALYST — the event calendar CROSSED against the signals we publish.
 *
 * A standalone catalyst feed is just news. The question that actually changes a
 * trade is: does the calendar agree with the direction we called? So this board
 * leads with CONFLICT — signals whose tracked events point the opposite way —
 * because that's the row that saves money. Confluence and event-risk follow, and
 * unclaimed catalysts (no signal yet) sit last as the "where to look next" list.
 *
 * Everything is encoded visually: a timeline bar for days-away, colour for
 * polarity. Numbers sit beside the shape, never instead of it.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TC, directionColor } from '@/lib/oracle/trading-colors';
import { useStockContext } from '@/contexts/stock-context';
import { CatalystCalendarLedger } from './catalyst-calendar-ledger';

interface CatEvent {
  type: string; title: string; date: string; daysAway: number;
  polarity: 'bullish' | 'bearish' | 'neutral'; importance: number; isBinary?: boolean;
}
interface SignalRow {
  symbol: string; direction: 'long' | 'short'; convictionScore: number;
  holdingPeriod: string | null; entryPrice: number; currentPrice: number | null;
  generatedAt: string; horizonDays: number;
  events?: CatEvent[]; score?: number; count?: number;
  event?: CatEvent; note?: string;
}
interface BoardData {
  generatedAt: string; signalsScanned: number; symbolsWithCatalysts: number;
  confluence: SignalRow[]; conflict: SignalRow[]; eventRisk: SignalRow[];
  unclaimed: (CatEvent & { symbol: string })[];
  /** Board cache was cold — this is not 'no catalysts', it's 'no signals yet'. */
  warming?: boolean;
  _meta?: { note?: string };
}

const polarityColor = (p: string) => (p === 'bullish' ? TC.bull : p === 'bearish' ? TC.bear : TC.muted);

/** Days-away as distance, so "3 days" and "26 days" don't read the same. */
function HorizonBar({ daysAway, window = 30 }: { daysAway: number; window?: number }) {
  const pct = Math.max(2, Math.min(100, ((window - daysAway) / window) * 100));
  const color = daysAway <= 3 ? TC.bear : daysAway <= 10 ? TC.warn : TC.muted;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-1.5 flex-1 min-w-[40px] overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-label font-mono tabular-nums shrink-0" style={{ color }}>
        {daysAway === 0 ? 'today' : `${daysAway}d`}
      </span>
    </div>
  );
}

type ImpactKind = 'conflict' | 'risk' | 'confluence' | 'watch';
type ImpactRow = {
  kind: ImpactKind;
  symbol: string;
  direction?: 'long' | 'short';
  convictionScore?: number;
  holdingPeriod?: string | null;
  event: CatEvent;
  note?: string;
};

const IMPACT_META: Record<ImpactKind, { label: string; color: string; action: string }> = {
  conflict: { label: 'CONFLICT', color: TC.bear, action: 'REVIEW' },
  risk: { label: 'EVENT RISK', color: TC.warn, action: 'SIZE DOWN' },
  confluence: { label: 'CONFLUENCE', color: TC.bull, action: 'CONFIRMS' },
  watch: { label: 'NO SIGNAL', color: TC.info, action: 'ANALYSE' },
};

function ImpactLedger({ rows }: { rows: ImpactRow[] }) {
  const { setCurrentStock } = useStockContext();
  const [filter, setFilter] = useState<ImpactKind | 'all'>('all');
  const visible = filter === 'all' ? rows : rows.filter((row) => row.kind === filter);
  const counts = (['conflict', 'risk', 'confluence', 'watch'] as ImpactKind[])
    .reduce((acc, kind) => ({ ...acc, [kind]: rows.filter((row) => row.kind === kind).length }), {} as Record<ImpactKind, number>);

  return (
    <section className="overflow-hidden rounded-lg border border-card-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-foreground/85">Signal impact</div>
          <div className="mt-0.5 text-[9px] text-muted-foreground">How the verified calendar changes the active book.</div>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/20 p-0.5">
          {(['all', 'conflict', 'risk', 'confluence', 'watch'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setFilter(kind)}
              className={`rounded px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide transition-colors ${filter === kind ? 'bg-foreground/[0.09] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {kind === 'all' ? `All ${rows.length}` : `${IMPACT_META[kind].label} ${counts[kind]}`}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse font-mono tabular-nums">
          <thead className="bg-muted/35 text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
            <tr className="border-b border-border/50">
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-left">Impact</th>
              <th className="px-3 py-2 text-left">Oracle side</th>
              <th className="px-3 py-2 text-left">Verified event</th>
              <th className="px-3 py-2 text-left">Distance</th>
              <th className="px-3 py-2 text-right">Response</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const meta = IMPACT_META[row.kind];
              const dir = row.direction ? directionColor(row.direction) : TC.muted;
              return (
                <tr
                  key={`${row.kind}-${row.symbol}-${row.event.date}-${index}`}
                  onClick={() => setCurrentStock({ symbol: row.symbol })}
                  className="cursor-pointer border-b border-border/30 text-[10px] transition-colors last:border-b-0 odd:bg-foreground/[0.008] hover:bg-foreground/[0.04]"
                >
                  <td className="px-3 py-2.5"><span className="text-[12px] font-bold text-foreground">{row.symbol}</span>{row.convictionScore != null && <span className="ml-2 text-muted-foreground">{row.convictionScore}</span>}</td>
                  <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: meta.color }}><span className="h-1.5 w-1.5 rounded-full bg-current" />{meta.label}</span></td>
                  <td className="px-3 py-2.5" style={{ color: dir }}>{row.direction ? `${row.direction === 'long' ? '▲' : '▼'} ${row.direction.toUpperCase()} · ${row.holdingPeriod ?? 'swing'}` : '—'}</td>
                  <td className="max-w-[360px] px-3 py-2.5"><div className="truncate font-semibold text-foreground/85">{row.event.title}</div><div className="mt-0.5 truncate text-[9px] text-muted-foreground">{row.note || `${row.event.type} · ${row.event.polarity}`}</div></td>
                  <td className="w-32 px-3 py-2.5"><HorizonBar daysAway={row.event.daysAway} /></td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: meta.color }}>{meta.action} ↗</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!visible.length && <div className="px-4 py-10 text-center font-mono text-[10px] text-muted-foreground">No rows in this view.</div>}
    </section>
  );
}

export function CatalystBoard() {
  const { data, isLoading, isError } = useQuery<BoardData>({
    queryKey: ['/api/catalysts/board'],
    queryFn: async () => {
      const r = await fetch('/api/catalysts/board', { credentials: 'include' });
      if (!r.ok) throw new Error('catalyst board failed');
      return r.json();
    },
    staleTime: 120_000, refetchInterval: 300_000, retry: 1,
  });

  if (isLoading) {
    return <div className="grid place-items-center py-16 text-meta font-mono uppercase tracking-widest text-muted-foreground">reading the calendar…</div>;
  }
  if (isError || !data) {
    return <div className="grid place-items-center py-16 text-meta font-mono uppercase tracking-widest text-muted-foreground">catalyst board unavailable</div>;
  }

  // The declared type says these arrays exist; the network does not read TypeScript.
  // A stale server (or a route-shadowing change) can return a 200 with a completely
  // different shape, and `conflict.length` then throws and takes the whole tab
  // down — which is what happened when this endpoint was shadowed by
  // /api/catalysts/:symbol. Narrow at the boundary instead of trusting the type.
  const conflict = Array.isArray(data.conflict) ? data.conflict : [];
  const confluence = Array.isArray(data.confluence) ? data.confluence : [];
  const eventRisk = Array.isArray(data.eventRisk) ? data.eventRisk : [];
  const unclaimed = Array.isArray(data.unclaimed) ? data.unclaimed : [];
  const malformed = !Array.isArray(data.conflict);

  const nothing = !conflict.length && !confluence.length && !eventRisk.length && !unclaimed.length;
  const activeSymbols = new Set([
    ...conflict.map((row) => row.symbol),
    ...confluence.map((row) => row.symbol),
    ...eventRisk.map((row) => row.symbol),
  ]);
  const impactRows = ([
    ...conflict.flatMap((row) => (row.events ?? []).map((event) => ({ kind: 'conflict' as const, symbol: row.symbol, direction: row.direction, convictionScore: row.convictionScore, holdingPeriod: row.holdingPeriod, event }))),
    ...eventRisk.flatMap((row) => row.event ? [{ kind: 'risk' as const, symbol: row.symbol, direction: row.direction, convictionScore: row.convictionScore, holdingPeriod: row.holdingPeriod, event: row.event, note: row.note }] : []),
    ...confluence.flatMap((row) => (row.events ?? []).map((event) => ({ kind: 'confluence' as const, symbol: row.symbol, direction: row.direction, convictionScore: row.convictionScore, holdingPeriod: row.holdingPeriod, event }))),
    ...unclaimed.map((event) => ({ kind: 'watch' as const, symbol: event.symbol, event })),
  ] as ImpactRow[]).sort((a, b) => a.event.daysAway - b.event.daysAway || (b.convictionScore ?? 0) - (a.convictionScore ?? 0));

  return (
    <div className="space-y-3">
      <CatalystCalendarLedger activeSymbols={activeSymbols} />
      {/* Coverage stated plainly, so an empty section reads as "no tracked event",
          not "nothing to worry about". */}
      <div className="flex items-center justify-between rounded-xl border border-card-border bg-card px-4 py-2.5 flex-wrap gap-2">
        <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">Catalyst Coverage</span>
        <span className="text-label font-mono text-muted-foreground">
          {data.symbolsWithCatalysts ?? 0} of {data.signalsScanned ?? 0} live signals have a tracked event
        </span>
      </div>

      {nothing && (
        <div className="rounded-xl border border-card-border bg-card px-4 py-10 text-center">
          <div className="text-meta font-mono uppercase tracking-widest text-muted-foreground">
            {malformed
              ? 'Catalyst feed returned an unexpected shape'
              : data.warming
                ? 'Signals still warming up'
                : "No tracked catalysts inside any signal's horizon"}
          </div>
          <div className="text-label font-mono text-muted-foreground mt-1.5">
            {malformed
              ? 'The API answered, but not with a catalyst board — the server may be running older code than this page.'
              : data.warming
                ? 'This page reads the board\'s cache and never rebuilds it. Open ORACLE once to populate the signals, then come back.'
                : 'Nothing in our event table lands soon — that is not the same as no catalyst existing.'}
          </div>
        </div>
      )}

      {!nothing && <ImpactLedger rows={impactRows} />}

      {data._meta?.note && (
        <p className="px-1 ui-prose text-label leading-relaxed text-muted-foreground">{data._meta.note}</p>
      )}
    </div>
  );
}

export default CatalystBoard;
