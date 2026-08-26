/**
 * FLOW BOARD — the FLOW tab. "What is smart money doing?"
 *
 * Built to the desk walkthrough: a market-overview strip (bullish vs bearish premium
 * for the day), the full filter set (score · direction · type · premium size · sweep ·
 * whale), a ticker search that also reaches back over past sessions, and the flow cards
 * themselves. Repeats and per-ticker baselines are computed across the loaded tape so
 * "unusual" means unusual FOR THAT NAME.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CanonModelNote } from '@/components/canon';
import { FlowCard } from './flow-card';
import {
  scoreFlow, baselinesBySymbol, repeatCounts, contractKey, WHALE_PREMIUM, type FlowPrint,
} from '@/lib/flow/flow-score';
import { RepeatBuyers } from './repeat-buyers';
import { ConvergenceCard } from './convergence-card';
import { TerminalPageHeader } from '@/components/templates/terminal-page';
import { FlowLedger } from './flow-ledger';

const CYAN = 'var(--brand-cyan,#22d3ee)';
const BULL = 'var(--trade-bullish,#22c55e)';
const BEAR = 'var(--trade-bearish,#ef4444)';

type Dir = 'all' | 'bullish' | 'bearish';
type Kind = 'all' | 'sweep' | 'block' | 'unusual_volume';
const MIN_SCORES = [0, 55, 70, 80] as const;
const MIN_PREMIUM = [0, 100_000, 500_000, 1_000_000] as const;

interface FlowResponse {
  trades?: any[];
  stats?: {
    totalTrades: number; totalValue: number; callCount: number; putCount: number;
    callPutRatio: number; mostActiveTickers?: any[]; repeatTickers?: any[]; unusualActivity?: any[];
  };
}

/** Normalise whatever the API returns into the shape the scorer expects. */
function toPrint(t: any): FlowPrint | null {
  const symbol = t?.symbol ?? t?.ticker;
  if (!symbol) return null;
  const optionType = (t.optionType ?? t.option_type ?? t.type ?? 'call').toLowerCase() === 'put' ? 'put' : 'call';
  return {
    symbol,
    optionType,
    strikePrice: Number(t.strikePrice ?? t.strike_price ?? t.strike ?? 0),
    expirationDate: String(t.expirationDate ?? t.expiration_date ?? t.expiry ?? t.expiryDate ?? ''),
    volume: Number(t.volume ?? t.size ?? 0),
    openInterest: t.openInterest ?? t.open_interest ?? null,
    volumeOIRatio: t.volumeOIRatio ?? t.volume_oi_ratio ?? null,
    premium: Number(t.premium ?? 0),
    totalPremium: t.totalPremium ?? t.total_premium ?? null,
    impliedVolatility: t.impliedVolatility ?? t.implied_volatility ?? null,
    delta: t.delta ?? null,
    underlyingPrice: t.underlyingPrice ?? t.underlying_price ?? t.spot ?? null,
    // No fallback. This used to default to call->bullish / put->bearish, which made
    // the overview's "bullish vs bearish premium" nothing more than call vs put
    // premium wearing a directional label. Absent a measured bias, say so.
    sentiment: (t.sentiment ?? 'unknown') as FlowPrint['sentiment'],
    flowType: (t.flowType ?? t.flow_type ?? 'normal') as FlowPrint['flowType'],
    unusualScore: t.unusualScore ?? t.unusual_score ?? null,
    isLotto: t.isLotto ?? t.is_lotto ?? null,
    detectedAt: t.detectedAt ?? t.detected_at ?? null,
  };
}

export function FlowBoard({ onSelectSymbol }: { onSelectSymbol?: (s: string) => void }) {
  const [dir, setDir] = useState<Dir>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [minScore, setMinScore] = useState<number>(0);
  const [minPrem, setMinPrem] = useState<number>(0);
  const [whaleOnly, setWhaleOnly] = useState(false);
  const [q, setQ] = useState('');
  const [days, setDays] = useState(7);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'tape' | 'cards'>('tape');

  const { data, isLoading, isError } = useQuery<FlowResponse>({
    queryKey: ['/api/options-flow', 'board', days],
    queryFn: async () => {
      const r = await fetch(`/api/options-flow?limit=200&days=${days}`, { credentials: 'include' });
      if (!r.ok) throw new Error('flow failed');
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const prints = useMemo(
    () => (data?.trades ?? []).map(toPrint).filter(Boolean) as FlowPrint[],
    [data],
  );

  const scored = useMemo(() => {
    const base = baselinesBySymbol(prints);
    const reps = repeatCounts(prints);
    return prints
      .map((p) => ({ print: p, score: scoreFlow(p, { baseline: base[p.symbol], repeatCount: reps[contractKey(p)] }) }))
      .sort((a, b) => b.score.score - a.score.score);
  }, [prints]);

  const shown = useMemo(() => scored.filter(({ print: p, score: s }) => {
    if (dir !== 'all' && p.sentiment !== dir) return false;
    if (kind !== 'all' && p.flowType !== kind) return false;
    if (s.score < minScore) return false;
    if (s.totalPremium < minPrem) return false;
    if (whaleOnly && !s.isWhale) return false;
    if (q.trim() && !p.symbol.toUpperCase().includes(q.trim().toUpperCase())) return false;
    return true;
  }), [scored, dir, kind, minScore, minPrem, whaleOnly, q]);

  // Session premium split.
  //
  // `bull`/`bear` only accumulate premium whose direction was actually MEASURED
  // (sentiment set from the tape). Snapshot-sourced prints land in `unclassified`
  // instead of being silently counted as conviction — a $1M call print that was
  // SOLD is bearish, and nothing in a chain snapshot can tell us which it was.
  // callPrem/putPrem are reported separately and honestly as what they are.
  const overview = useMemo(() => {
    let bull = 0, bear = 0, unclassified = 0, callPrem = 0, putPrem = 0, whales = 0, sweeps = 0;
    for (const { print: p, score: s } of scored) {
      if (p.sentiment === 'bullish') bull += s.totalPremium;
      else if (p.sentiment === 'bearish') bear += s.totalPremium;
      else if (p.sentiment === 'unknown') unclassified += s.totalPremium;
      if (p.optionType === 'call') callPrem += s.totalPremium; else putPrem += s.totalPremium;
      if (s.isWhale) whales++;
      if (s.isSweep) sweeps++;
    }
    const net = bull - bear;
    const measuredPct = (bull + bear + unclassified) > 0
      ? (bull + bear) / (bull + bear + unclassified) * 100
      : 0;

    // Rate of change, not just level. $374M of premium means nothing without
    // knowing whether that is building or fading — the prints carry detectedAt,
    // so compare the last hour against the hour before it. Only computed when
    // BOTH windows have prints; a comparison against an empty prior hour is a
    // meaningless percentage, so it stays null and the UI omits it.
    const now = Date.now();
    let lastHour = 0, priorHour = 0, lastHourN = 0, priorHourN = 0;
    for (const { print: p, score: sc } of scored) {
      const t = p.detectedAt ? new Date(p.detectedAt).getTime() : NaN;
      if (Number.isNaN(t)) continue;
      const ageMin = (now - t) / 60_000;
      if (ageMin <= 60) { lastHour += sc.totalPremium; lastHourN++; }
      else if (ageMin <= 120) { priorHour += sc.totalPremium; priorHourN++; }
    }
    const hourDeltaPct = (lastHourN > 0 && priorHourN > 0 && priorHour > 0)
      ? ((lastHour - priorHour) / priorHour) * 100
      : null;

    return { bull, bear, net, unclassified, callPrem, putPrem, measuredPct, whales, sweeps, hourDeltaPct, total: scored.length };
  }, [scored]);

  // Honest freshness: say when the newest print actually landed, never imply "live".
  const freshness = useMemo(() => {
    const times = prints.map((p) => (p.detectedAt ? Date.parse(String(p.detectedAt)) : NaN)).filter((n) => !Number.isNaN(n));
    if (!times.length) return null;
    const newest = new Date(Math.max(...times));
    const ageH = (Date.now() - newest.getTime()) / 3_600_000;
    return {
      label: newest.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      stale: ageH > 24,
      ageDays: Math.floor(ageH / 24),
    };
  }, [prints]);

  const toggleWatch = (sym: string) =>
    setWatched((w) => { const n = new Set(w); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  const money = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;

  return (
    <div>
      {/* The reference section header — same copy, his .sec-head grammar. */}
      <div className="sec-head">
        <div className="sec-num">OPTIONS ACTIVITY</div>
        <div className="sec-title">Flow</div>
        <div className="sec-sub">Follow unusual options-chain activity from aggregate premium to contract-level evidence. Bias and pattern labels are inferred.</div>
        <div className="sec-meta">
          <span className={cn('tag', freshness?.stale ? 'warn' : 'live')}>
            <span className="dot" />
            {freshness?.stale ? 'historical snapshot' : 'live'}
          </span>
          <span className="tag mute">{shown.length} contract observations</span>
        </div>
      </div>

      {/* 1. Market first: a trader needs to know where premium is leaning before
          deciding which individual print is worth opening. */}
      <div className="intel-block">
        <div className="intel-head">
          <div className="intel-label">Chain activity</div>
          <div className="flex items-center gap-2">
            {freshness && (
              <span className="intel-value" style={freshness.stale ? { color: 'var(--amber)' } : undefined}>
                {freshness.stale ? `last print ${freshness.label} · ${freshness.ageDays}d stale` : `last print ${freshness.label}`}
              </span>
            )}
            <Seg label="Window" value={String(days)} onChange={(v) => setDays(Number(v))}
                 options={[['1', '1D'], ['7', '1W'], ['30', '1M'], ['200', 'ALL']]} />
          </div>
        </div>
        <div className="stats-bar" style={{ padding: 0, border: 0, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
          {/* Labelled as what they measure. These were "Bullish premium" / "Bearish
              premium", but with no execution side the split is call vs put and
              nothing more — the disclaimer below already said so. */}
          <Stat
            label="Last hour vs prior"
            value={overview.hourDeltaPct == null
              ? 'n/a'
              : `${overview.hourDeltaPct >= 0 ? '▲' : '▼'}${Math.abs(overview.hourDeltaPct).toFixed(1)}%`}
            color={overview.hourDeltaPct == null ? 'var(--muted-foreground)' : overview.hourDeltaPct >= 0 ? BULL : BEAR}
          />
          <Stat label="Call premium" value={money(overview.callPrem)} color={BULL} />
          <Stat label="Put premium" value={money(overview.putPrem)} color={BEAR} />
          <Stat
            label="Direction measured"
            value={`${overview.measuredPct.toFixed(0)}%`}
            color={overview.measuredPct > 0 ? CYAN : 'var(--muted-foreground)'}
          />
          <Stat label="≥$1M premium" value={String(overview.whales)} color="#e0a458" />
          <Stat label="Sweep-like" value={String(overview.sweeps)} color={CYAN} />
        </div>
        {overview.total > 0 && (
          <div className="pt-2">
            <p className="text-meta leading-relaxed text-foreground/75">
              {overview.callPrem >= overview.putPrem ? 'Call premium leads' : 'Put premium leads'} by{' '}
              <b style={{ color: overview.callPrem >= overview.putPrem ? BULL : BEAR }}>{money(Math.abs(overview.callPrem - overview.putPrem))}</b>
              {' '}across {overview.total} contract observations.{' '}
              {overview.measuredPct === 0
                ? 'Call-vs-put premium is activity, not conviction.'
                : 'Only prints whose execution side was observed on the tape count toward a directional read.'}
            </p>
            {overview.measuredPct === 0 && (
              <CanonModelNote tone="gap" className="mt-2">
                Direction is not measured on this feed. A chain snapshot cannot tell a
                buyer from a seller, and selling calls is bearish while selling puts is
                bullish — so the side of this premium is unknown, not neutral.
              </CanonModelNote>
            )}
          </div>
        )}
      </div>

      {/* ── filters — the reference .filters bar ── */}
      <div className="filters" style={{ position: 'static' }}>
        {/* With no measured execution side there is nothing to filter BULL/BEAR on —
            offering the chips anyway just returns an empty tape and reads as broken.
            They come back automatically once a tape source sets a real bias. */}
        <Seg label="Dir" value={dir} onChange={setDir}
             options={overview.measuredPct > 0
               ? [['all', 'ALL'], ['bullish', 'BULL'], ['bearish', 'BEAR']]
               : [['all', 'ALL']]} />
        <div className="filter-sep" />
        <Seg label="Pattern" value={kind} onChange={setKind}
             options={[['all', 'ALL'], ['sweep', 'SWEEP-LIKE'], ['block', 'BLOCK-LIKE'], ['unusual_volume', 'UNUSUAL']]} />
        <div className="filter-sep" />
        <Seg label="Score" value={String(minScore)} onChange={(v) => setMinScore(Number(v))}
             options={MIN_SCORES.map((s) => [String(s), s === 0 ? 'ANY' : `${s}+`] as [string, string])} />
        <div className="filter-sep" />
        <Seg label="Premium" value={String(minPrem)} onChange={(v) => setMinPrem(Number(v))}
             options={MIN_PREMIUM.map((p) => [String(p), p === 0 ? 'ANY' : p >= 1e6 ? '$1M+' : `$${p / 1000}K+`] as [string, string])} />
        <button
          onClick={() => setWhaleOnly((w) => !w)}
          className={cn('filter-btn', whaleOnly && 'active')}
          style={whaleOnly ? { color: 'var(--amber)', borderColor: 'rgba(245,182,66,0.35)', background: 'rgba(245,182,66,0.1)', boxShadow: '0 0 8px rgba(245,182,66,0.15)' } : undefined}
        >
          Premium ≥$1M
        </button>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2" style={{ color: 'var(--text-mute)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ticker"
            aria-label="Filter flow by ticker"
            className="filter-btn w-28 pl-7 uppercase outline-none"
            style={{ cursor: 'text' }}
          />
        </div>
        <div className="view-toggle">
          {(['tape', 'cards'] as const).map((next) => (
            <button key={next} type="button" onClick={() => setView(next)} className={cn('view-btn', view === next && 'active')} style={{ background: view === next ? undefined : 'transparent', border: 'none' }}>{next}</button>
          ))}
        </div>
      </div>

      {/* ── the tape ── */}
      <div className="space-y-4 px-4 py-4 md:px-5">
      {isLoading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-label font-mono uppercase tracking-widest text-muted-foreground/70">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading the tape…
        </div>
      ) : isError ? (
        <Empty title="Flow unavailable" body="The flow feed did not respond. It will retry automatically." />
      ) : shown.length === 0 ? (
        <Empty
          title={prints.length === 0 ? 'No chain activity yet' : 'Nothing matches those filters'}
          body={prints.length === 0
            ? 'No premium-qualified contract observations are available for this window. Activity usually builds through the first 15–30 minutes after the open.'
            : 'Loosen the score, premium, or type filters to see more of the tape.'}
        />
      ) : view === 'tape' ? (
        <FlowLedger rows={shown} watched={watched} onWatch={toggleWatch} onSelect={onSelectSymbol} />
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ print, score }, i) => (
            <FlowCard
              key={`${contractKey(print)}-${i}`}
              print={print}
              score={score}
              watched={watched.has(print.symbol)}
              onWatch={toggleWatch}
              onSelect={onSelectSymbol}
            />
          ))}
        </div>
      )}

      {/* 4. Follow-through is evidence about the tape, not the tape's starting
          point. Repeats answer "is this accumulating?" and convergence answers
          "does dealer positioning agree?" — both matter only after a print is in view. */}
      <section className="border-t border-border/60 pt-3">
        <div className="mb-2 flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">Follow-through</span>
          <span className="h-px flex-1 bg-border/60" />
          <span className="font-mono text-[10px] text-muted-foreground/65">accumulation × dealer context</span>
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <RepeatBuyers />
          <ConvergenceCard />
        </div>
      </section>
      </div>
    </div>
  );
}

/* The reference stats-bar tile — same measured values, his .stat-box shell. */
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{label}</div>
      <div className="stat-val" style={{ color }}>{value}</div>
    </div>
  );
}

/* The reference filter group — .filter-label + .filter-btn(.active). */
function Seg<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [string, string][];
}) {
  return (
    <div className="filter-group">
      <span className="filter-label">{label}</span>
      <div className="flex items-center gap-1">
        {options.map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v as T)}
            className={cn('filter-btn', value === v && 'active')}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card px-6 py-10 text-center">
      <div className="text-meta font-mono uppercase tracking-widest text-foreground/70">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-meta leading-relaxed text-muted-foreground/60">{body}</p>
    </div>
  );
}
