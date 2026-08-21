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
import { motion } from 'framer-motion';
import { AlertTriangle, CalendarClock, Sparkles, Telescope } from 'lucide-react';
import { EASE, DUR } from '@/lib/motion';
import { TC, directionColor } from '@/lib/oracle/trading-colors';
import { SignalTimingBadge } from '@/components/oracle/signal-timing-badge';
import { useStockContext } from '@/contexts/stock-context';

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

function SectionHead({
  icon: Icon, title, blurb, count, tone,
}: { icon: any; title: string; blurb: string; count: number; tone: string }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-border/40 px-4 py-2.5">
      <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: tone }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-meta font-mono font-bold uppercase tracking-widest" style={{ color: tone }}>{title}</span>
          <span className="text-label font-mono tabular-nums text-muted-foreground">{count}</span>
        </div>
        <div className="text-label font-mono text-muted-foreground mt-0.5">{blurb}</div>
      </div>
    </div>
  );
}

function EventLine({ e }: { e: CatEvent }) {
  const c = polarityColor(e.polarity);
  return (
    <div className="flex items-center gap-2 min-w-0 py-0.5">
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c }} />
      <span className="text-label font-mono uppercase tracking-wider shrink-0" style={{ color: c }}>{e.type}</span>
      <span className="text-label text-muted-foreground truncate flex-1 min-w-0">{e.title}</span>
      <div className="w-24 shrink-0"><HorizonBar daysAway={e.daysAway} /></div>
    </div>
  );
}

function CatalystSignalCard({ row, tone, children }: { row: SignalRow; tone: string; children?: React.ReactNode }) {
  const { setCurrentStock } = useStockContext();
  const dir = directionColor(row.direction);
  return (
    <motion.button
      onClick={() => setCurrentStock({ symbol: row.symbol })}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE }}
      className="w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
      style={{ borderColor: `color-mix(in srgb, ${tone} 26%, transparent)`, background: `color-mix(in srgb, ${tone} 5%, transparent)` }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-body font-mono font-bold tracking-wide text-foreground">{row.symbol}</span>
        <span className="text-label font-mono font-bold px-1.5 py-0.5 rounded"
              style={{ color: dir, background: `color-mix(in srgb, ${dir} 12%, transparent)` }}>
          {row.direction === 'long' ? '▲ LONG' : '▼ SHORT'}
        </span>
        <span className="text-label font-mono text-muted-foreground capitalize">
          {row.holdingPeriod ?? 'swing'} · {row.horizonDays}d horizon
        </span>
        <span className="ml-auto"><SignalTimingBadge generatedAt={row.generatedAt} showCaveat={false} /></span>
      </div>
      <div className="mt-1.5 space-y-0.5">{children}</div>
    </motion.button>
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

  return (
    <div className="space-y-3">
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

      {/* CONFLICT LEADS — the calendar disagreeing with our own call is the single
          most useful thing here, so it sits first regardless of length. */}
      {conflict.length > 0 && (
        <section className="rounded-xl border border-card-border bg-card overflow-hidden">
          <SectionHead
            icon={AlertTriangle} tone={TC.bear} count={conflict.length}
            title="Conflicts"
            blurb="Tracked events point AGAINST the direction we published — re-read the thesis before sizing"
          />
          <div className="p-3 space-y-2">
            {conflict.map((r) => (
              <CatalystSignalCard key={`cf-${r.symbol}`} row={r} tone={TC.bear}>
                {(r.events ?? []).map((e, i) => <EventLine key={i} e={e} />)}
              </CatalystSignalCard>
            ))}
          </div>
        </section>
      )}

      {eventRisk.length > 0 && (
        <section className="rounded-xl border border-card-border bg-card overflow-hidden">
          <SectionHead
            icon={CalendarClock} tone={TC.warn} count={eventRisk.length}
            title="Binary Event Risk"
            blurb="A coin-flip event lands before the trade is meant to be done — not directional, a reason to size down"
          />
          <div className="p-3 space-y-2">
            {eventRisk.map((r) => (
              <CatalystSignalCard key={`er-${r.symbol}`} row={r} tone={TC.warn}>
                {r.event && <EventLine e={r.event} />}
                {r.note && <div className="text-label font-mono text-muted-foreground mt-0.5">{r.note}</div>}
              </CatalystSignalCard>
            ))}
          </div>
        </section>
      )}

      {confluence.length > 0 && (
        <section className="rounded-xl border border-card-border bg-card overflow-hidden">
          <SectionHead
            icon={Sparkles} tone={TC.bull} count={confluence.length}
            title="Confluence"
            blurb="The calendar agrees with the direction we called — reinforces, never replaces, the setup"
          />
          <div className="p-3 space-y-2">
            {confluence.map((r) => (
              <CatalystSignalCard key={`co-${r.symbol}`} row={r} tone={TC.bull}>
                {(r.events ?? []).map((e, i) => <EventLine key={i} e={e} />)}
              </CatalystSignalCard>
            ))}
          </div>
        </section>
      )}

      {unclaimed.length > 0 && (
        <section className="rounded-xl border border-card-border bg-card overflow-hidden">
          <SectionHead
            icon={Telescope} tone={TC.info} count={unclaimed.length}
            title="Unclaimed"
            blurb="Strong catalysts on tickers with no live signal — where to look next"
          />
          <div className="p-3 grid gap-1.5 sm:grid-cols-2">
            {unclaimed.map((e, i) => <UnclaimedRow key={`${e.symbol}-${i}`} e={e} />)}
          </div>
        </section>
      )}

      {data._meta?.note && (
        <p className="px-1 text-label font-mono leading-relaxed text-muted-foreground">{data._meta.note}</p>
      )}
    </div>
  );
}

function UnclaimedRow({ e }: { e: CatEvent & { symbol: string } }) {
  const { setCurrentStock } = useStockContext();
  return (
    <button
      onClick={() => setCurrentStock({ symbol: e.symbol })}
      className="flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.03] cursor-pointer min-w-0"
    >
      <span className="text-meta font-mono font-bold text-foreground shrink-0 w-14">{e.symbol}</span>
      <span className="text-label font-mono uppercase tracking-wider shrink-0" style={{ color: polarityColor(e.polarity) }}>{e.type}</span>
      <div className="flex-1 min-w-0"><HorizonBar daysAway={e.daysAway} /></div>
    </button>
  );
}

export default CatalystBoard;
