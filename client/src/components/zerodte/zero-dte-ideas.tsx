/**
 * 0DTE IDEAS — the actionable list on the NEXUS 0DTE view, and the compact
 * `today-0dte-ideas` block on TODAY that links to it.
 *
 * Each idea: ticker · CALLS/PUTS · exact contract · premium zone (bid / ask /
 * mid, repriced on every desk build and stamped with the quote's own time) ·
 * underlying trigger · stop (underlying + estimated premium) · T1 / T2 ·
 * enter-by / exit-by · why · structure grade · age.
 *
 * Every idea carries ONE actionability state (shared/zero-dte-actionability.ts):
 * LIVE / ARMED stand out; WATCH, PASSED, DONE · REACHED, DONE · FADED, EXPIRED
 * and STALE QUOTE are greyed with the reason printed under the row — never
 * hidden unless the operator turns on "Hide done". Clicking an idea opens its
 * chart (5-min, trigger / stop / targets drawn) and the contract in the Contract lab.
 *
 * Honesty: model ideas from an unvalidated policy family — the header carries
 * the engine's own record as "measuring · n=", never a hit-rate headline.
 */
import { reasonOf } from '@/lib/optimistic';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Crosshair, ExternalLink, FlaskConical } from 'lucide-react';
import type { Level } from '@/components/charting/chart-engine';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useToolReport } from '@/components/dashboard/frame';
import { useZeroDteDesk, type DeskPayload } from './zero-dte-desk';
import './zero-dte-desk.css';
import type { SpxMirror } from '@shared/spx-mirror';
import { SpxMirrorBlock, spxMirrorChipTitle } from '@/components/ideas/spx-mirror-block';
import { ideaActionability, isDoneLike, isIndexSymbol, hhmmToMin, etSecondsOf, type Act, type ActState, type DeskFilter } from '@shared/zero-dte-actionability';
import { useZdNow } from './zd-clock';

const QEChart = lazy(() => import('@/components/charting/qe-chart').then((m) => ({ default: m.QEChart })));
const ContractAnalyzer = lazy(() => import('@/components/contract-analyzer').then((m) => ({ default: m.ContractAnalyzer })));

/* ── wire types (server/zero-dte-desk.ts DeskIdea / IdeasInfo) ── */
export type IdeaStage = 'watch' | 'triggered' | 'in_play' | 'done';
interface Lv { name: string; price: number }
export interface DeskIdea {
  key: string; symbol: string; stage: IdeaStage; doneReason: string | null;
  direction: 'long' | 'short'; side: 'CALLS' | 'PUTS'; kind: string | null; kindLabel: string; policy: 'A' | 'B' | null;
  trigger: Lv | null; triggerText: string; entry: number; stop: number; target: Lv; target2: Lv | null; rr: number | null;
  price: number | null; priceAt: string | null; distPct: number | null; expiryLabel: string;
  contract: {
    occ: string; root: string; optionType: 'call' | 'put'; strike: number; expiry: string; dte: number | null;
    delta: number | null; openInterest: number | null; spreadPct: number | null; qty: number | null; riskDollars: number | null; debitDollars: number | null;
    premiumStop: number | null; premiumT1: number | null; premiumT2: number | null; basis: string | null;
  } | null;
  quote: { bid: number | null; ask: number | null; mid: number | null; at: string | null; source: string } | null;
  loggedPremium: number | null; contractNote: string | null; vehicle: string;
  entryBy: string | null; exitBy: string; why: string; grade: 'A' | 'B' | 'C' | null; gradeWhy: string[];
  at: string; ideaId: string | null; logged: boolean; loggedNote: string | null;
  /** SPXW mirror of an SPY contract (display only; tracked as the SPY idea). */
  spxMirror?: SpxMirror | null;
  /** "stopped · later reached T1 at 11:42" — hindsight after a stop; the outcome stays a stop. */
  afterStop?: string | null;
}
export interface IdeasInfo {
  evaluated: { [sym: string]: { at: string | null; eligibility: string; notes: string[] } };
  noZeroDte: Array<{ symbol: string; label: string }>;
  cadence: string; caps: { [sym: string]: string }; honesty: string;
}

/* ── formatting ── */
export const px = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const prem = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`);
export const ageOf = (iso: string | null | undefined, now: number = Date.now()) => {
  if (!iso) return 'age —';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 90 ? `${s}s old` : s < 5400 ? `${Math.round(s / 60)}m old` : `${(s / 3600).toFixed(1)}h old`;
};
const sinceOf = (iso: string, now: number = Date.now()) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};
export const contractLabel = (c: NonNullable<DeskIdea['contract']>) => `${c.root} ${c.expiry.slice(5).replace('-', '/')} ${c.strike}${c.optionType === 'call' ? 'C' : 'P'}`;

export function recordLine(d: DeskPayload): string {
  const r = d.record; const k = r.byKind['0dte'];
  return `measuring · n=${k.n} decided${r.lowN ? ' (LOW N)' : ''} · ${k.wins}–${k.losses} · ${k.total} logged since ${r.since}`;
}

/* ── actionability (shared/zero-dte-actionability.ts) ── */
export function ideaAct(x: DeskIdea, d: DeskPayload, nowMs: number): ActState {
  return ideaActionability({
    stage: x.stage, doneReason: x.doneReason, distPct: x.distPct, hasContract: !!x.contract,
    quote: x.quote ? { mid: x.quote.mid, at: x.quote.at } : null, entryBy: x.entryBy, exitBy: x.exitBy,
  }, { nowMs, phaseId: d.phase.id, entriesOpen: d.phase.entriesOpen });
}
/** Minutes from now (ET) to an HH:MM ET mark, null when past / unknown. */
export function minsTo(hhmm: string | null | undefined, nowMs: number): number | null {
  const t = hhmmToMin(hhmm); if (t == null) return null;
  const left = t * 60 - etSecondsOf(nowMs);
  return left > 0 ? Math.ceil(left / 60) : null;
}
export const leftTxt = (m: number | null) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')} left` : `${m}m left`);

export function ActBadge({ a }: { a: ActState }) {
  return <span className={`zd-act zd-act-${a.state}`} title={a.reason}>{a.label}</span>;
}

/* ── one idea ── */
function IdeaCard({ x, a, nowMs, open, onToggle }: { x: DeskIdea; a: ActState; nowMs: number; open: boolean; onToggle: () => void }) {
  const c = x.contract; const q = x.quote;
  const up = x.direction === 'long';
  // Actionable (and stale-but-would-be-live) rows show the whole plan; greyed rows show one line until opened.
  const full = a.actionable || a.state === 'stale' || open;
  const entryLeft = a.state === 'live' ? minsTo(x.entryBy, nowMs) : null;
  const exitLeft = minsTo(x.exitBy, nowMs);
  return (
    <li id={`zi-${x.key}`} className={`zi-card zd-a-${a.state} ${a.actionable ? 'zd-is-act' : 'zd-is-dim'}`}>
      <button type="button" className="zi-row" onClick={onToggle} aria-expanded={open} title="Open the chart with trigger / stop / targets and the contract in the Contract lab">
        <ActBadge a={a} />
        <span className="zi-sym">{x.symbol}</span>
        <span className={`zi-side ${up ? 'zd-up' : 'zd-dn'}`}>{x.side}</span>
        <span className="zi-contract">{c ? contractLabel(c) : x.expiryLabel}{x.spxMirror && <b className="zi-spx" title={spxMirrorChipTitle(x.spxMirror)}> · SPX</b>}</span>
        <span className="zi-kind">{x.kindLabel}{x.grade ? <b title={`Structure grade (not a probability): ${x.gradeWhy.join(' · ') || 'no confluence'}`}> · {x.grade}</b> : null}</span>
        <span className="zi-age" title={x.stage === 'watch' ? 'first seen' : 'logged'}>{sinceOf(x.at, nowMs)}</span>
      </button>
      <p className="zd-reason">{a.reason}{entryLeft != null && <b> · {leftTxt(entryLeft)} to enter</b>}</p>
      {x.afterStop && <p className="zd-reason" title="Measured after the close on the underlying, inside this idea's hold window. The idea is still recorded as a stop-out.">{x.afterStop} · still a loss</p>}
      {full ? (
        <div className="zi-body">
          <div className="zi-kv"><span>Premium now</span><strong>
            {q && q.mid != null ? <>{prem(q.mid)} <small>bid {prem(q.bid)} / ask {prem(q.ask)} · {ageOf(q.at, nowMs)} · {q.source}</small></> : <small>{c ? 'no live quote' : '—'}</small>}
            {x.loggedPremium != null && <small> · logged @ {prem(x.loggedPremium)}</small>}
          </strong></div>
          <div className="zi-kv"><span>Trigger</span><strong>{x.trigger ? px(x.trigger.price) : '—'} <small>{x.triggerText}{x.stage === 'watch' && x.distPct != null ? ` · ${x.distPct.toFixed(2)}% away` : ''}</small></strong></div>
          <div className="zi-kv"><span>Stop</span><strong className="zd-dn">{px(x.stop)}{c?.premiumStop != null && <small> · premium ≈ {prem(c.premiumStop)}</small>}</strong></div>
          <div className="zi-kv"><span>Targets</span><strong className="zd-up">T1 {px(x.target.price)} <small>{x.target.name}{c?.premiumT1 != null ? ` · ≈ ${prem(c.premiumT1)}` : ''}</small>{x.target2 && <> · T2 {px(x.target2.price)} <small>{x.target2.name}{c?.premiumT2 != null ? ` · ≈ ${prem(c.premiumT2)}` : ''}</small></>}{x.rr != null && <small> · {x.rr.toFixed(1)}R</small>}</strong></div>
          <div className="zi-kv"><span>Window</span><strong>{x.entryBy ? `enter by ${x.entryBy}` : 'entry window passed'} · exit by {x.exitBy} ET <small>time stop{exitLeft != null ? ` · ${leftTxt(exitLeft)}` : ''}</small></strong></div>
          <div className="zi-kv"><span>Model size</span><strong>{c?.qty ? `${c.qty}× · risk ≈ ${px(c.riskDollars, 0)} · debit ≈ ${px(c.debitDollars, 0)}` : '—'}{c?.delta != null && <small> · Δ {c.delta.toFixed(2)} · OI {c.openInterest?.toLocaleString() ?? '—'} · spread {c.spreadPct != null ? `${Math.round(c.spreadPct * 100)}%` : '—'}</small>}</strong></div>
          {x.spxMirror && <SpxMirrorBlock mirror={x.spxMirror} className="zi-spx-mirror" nowMs={nowMs} />}
          <p className="zi-why">{x.why}</p>
          {(x.contractNote || x.loggedNote) && <p className="zi-note">{[x.contractNote, x.loggedNote].filter(Boolean).join(' · ')}</p>}
          <p className="zi-note">{x.symbol} {px(x.price)} · {ageOf(x.priceAt, nowMs)}{c?.basis ? ` · ${c.basis}` : ''}</p>
        </div>
      ) : (
        <p className="zi-summary">
          {x.loggedPremium != null ? `logged @ ${prem(x.loggedPremium)}` : q?.mid != null ? `mid ${prem(q.mid)} (${ageOf(q.at, nowMs)})` : 'no quote'}
          {' · '}trigger {x.trigger ? px(x.trigger.price) : '—'} · stop {px(x.stop)} · T1 {px(x.target.price)} · exit {x.exitBy}
          {x.spxMirror?.contract && ` · SPXW ${x.spxMirror.contract.strike}${x.spxMirror.contract.optionType === 'call' ? 'C' : 'P'}`}
        </p>
      )}
      {open && <IdeaDrawer x={x} />}
    </li>
  );
}

function IdeaDrawer({ x }: { x: DeskIdea }) {
  const c = x.contract;
  const levels: Level[] = useMemo(() => [
    ...(x.trigger ? [{ price: x.trigger.price, color: '#3b8cff', label: `TRIGGER ${x.trigger.name}`, kind: 'execution' as const }] : []),
    { price: x.stop, color: '#ff6b3d', label: 'STOP', kind: 'execution' as const },
    { price: x.target.price, color: '#6ee7b7', label: 'T1', kind: 'execution' as const },
    ...(x.target2 ? [{ price: x.target2.price, color: '#6ee7b7', label: 'T2', kind: 'execution' as const }] : []),
  ].filter((l) => Number.isFinite(l.price)), [x]);
  const labSym = c ? (c.root === 'SPXW' ? 'SPX' : c.root) : x.symbol;
  const labInput = c ? `${labSym} ${c.strike}${c.optionType === 'call' ? 'C' : 'P'} ${c.expiry}` : '';
  // Logged ideas carry their vehicle's units (an SPX thesis logged on SPY); WATCH ideas are in the name's own units.
  const chartSym = x.logged ? x.vehicle : x.symbol;
  return (
    <div className="zi-drawer">
      <div className="zi-chart">
        <Suspense fallback={<QELoading rows={4} label="loading chart…" />}>
          <QEChart key={`zi-${x.key}`} symbol={chartSym} initialTf="5m" height={320} levels={levels} />
        </Suspense>
        <p className="zd-note">5-min {chartSym}: trigger, stop and targets as the engine set them. Levels are measured, not guaranteed support or resistance.</p>
      </div>
      <div className="zi-lab">
        <div className="zi-lab-head"><FlaskConical size={13} aria-hidden /> Contract lab {c ? <span className="zd-mono">{labInput}</span> : null}
          <Link href={`/r/${encodeURIComponent(labSym)}?tab=analyze`} className="zi-ext" title="Open the full Contract lab" aria-label="Open the full Contract lab"><ExternalLink size={12} aria-hidden /></Link>
        </div>
        {c ? (
          <Suspense fallback={<QELoading rows={4} label="analyzing the contract…" />}>
            <ContractAnalyzer key={labInput} initialInput={labInput} symbol={labSym} compact />
          </Suspense>
        ) : <p className="zd-note">No contract inside the caps — nothing to analyse.</p>}
      </div>
    </div>
  );
}

/** Does an idea pass the desk filter? (flow = the flow-ignition lane only — ideas never match it.) */
export const ideaInFilter = (symbol: string, f: DeskFilter) => f === 'all' || (f === 'index' ? isIndexSymbol(symbol) : f === 'mega' ? !isIndexSymbol(symbol) : false);

/** The list. `compact` = TODAY block (top 4 actionable-first, no drawer). Filtering / hide-done come from the desk. */
export function ZeroDteIdeas({ d, compact = false, nowMs, filter = 'all', hideDone = false }: { d: DeskPayload; compact?: boolean; nowMs?: number; filter?: DeskFilter; hideDone?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const tick = useZdNow(15_000);
  const now = nowMs ?? tick;
  const ideas = (d.ideas ?? []) as DeskIdea[];
  const info = d.ideasInfo as IdeasInfo | undefined;
  const rated = useMemo(() => ideas.map((x) => ({ x, a: ideaAct(x, d, now) })).sort((p, q) => p.a.rank - q.a.rank), [ideas, d, now]);
  const inFilter = rated.filter(({ x }) => ideaInFilter(x.symbol, filter));
  const visible = hideDone ? inFilter.filter(({ a }) => !isDoneLike(a.state)) : inFilter;
  const shown = compact ? rated.filter(({ a }) => !isDoneLike(a.state)).slice(0, 4) : visible;
  const n = (st: Act[]) => rated.filter(({ a }) => st.includes(a.state)).length;
  const hiddenDone = inFilter.length - visible.length;
  const empty = filter === 'flow' ? 'Flow ignition filter — 0DTE ideas are a separate lane (choose All to see them).'
    : inFilter.length === 0 && ideas.length ? `No ${filter === 'index' ? 'index' : 'mega-cap'} ideas today (${ideas.length} in other lanes).`
    : d.phase.entriesOpen ? 'No setup forming on the watched names right now — a measured level has to come within reach of price in a regime with a rule.'
    : d.phase.id === 'pre' ? 'Pre-market — no 0DTE ideas before 09:45 ET.' : 'No new 0DTE entries now (window 09:45–15:45 ET).';
  return (
    <section className={`zi ${compact ? 'zi-compact' : ''}`} aria-label="0DTE ideas">
      <header className="zi-head">
        <h4><Crosshair size={13} aria-hidden /> 0DTE ideas</h4>
        <span className="zd-count zd-count-live">{n(['live'])} live</span>
        <span className="zd-count">{n(['armed'])} armed</span>
        <span className="zd-count">{n(['watch', 'stale'])} watch</span>
        <span className="zd-count">{n(['passed', 'done_reached', 'done_faded', 'expired'])} done / passed</span>
        <span className="zi-rec" title={info?.honesty}>{recordLine(d)}</span>
        {compact && <Link href="/t?nx=0dte" className="zi-more">open 0DTE desk →</Link>}
      </header>
      {shown.length === 0
        ? <p className="zi-empty">{compact && ideas.length ? 'Nothing live — today\'s ideas are done.' : inFilter.length && hideDone ? `All ${inFilter.length} ideas in this view are done — “Hide done” is on.` : empty}</p>
        : (
          <ul className="zi-list">
            {shown.map(({ x, a }) => compact
              ? <li key={x.key} className={`zi-card zd-a-${a.state} ${a.actionable ? 'zd-is-act' : 'zd-is-dim'}`}><Link href="/t?nx=0dte" className="zi-row">
                  <ActBadge a={a} /><span className="zi-sym">{x.symbol}</span>
                  <span className={`zi-side ${x.direction === 'long' ? 'zd-up' : 'zd-dn'}`}>{x.side}</span>
                  <span className="zi-contract">{x.contract ? contractLabel(x.contract) : x.expiryLabel}</span>
                  <span className="zi-kind">{x.quote?.mid != null ? `~${prem(x.quote.mid)}` : ''} · trig {x.trigger ? px(x.trigger.price) : '—'} · stop {px(x.stop)}</span>
                </Link></li>
              : <IdeaCard key={x.key} x={x} a={a} nowMs={now} open={open === x.key} onToggle={() => setOpen(open === x.key ? null : x.key)} />)}
          </ul>
        )}
      {!compact && hiddenDone > 0 && <p className="zi-note">{hiddenDone} done / expired idea{hiddenDone === 1 ? '' : 's'} hidden by “Hide done”.</p>}
      {info && info.noZeroDte.length > 0 && <p className="zi-note">{info.noZeroDte.map((m) => `${m.symbol}: ${m.label}`).join(' · ')}</p>}
      {!compact && info && (
        <details className="zd-how"><summary>How these ideas are built</summary>
          <p className="zi-note">{info.honesty} Cadence: {info.cadence}. Caps: {Object.entries(info.caps).map(([k, v]) => `${k} ${v}`).join(' · ')}. Premium stop / targets are delta-only estimates. Model size uses the desk's fixed caps, not your account. LIVE = triggered, inside its entry window, quote ≤ 2 min old; ARMED = trigger within 0.25% of price; every other row is greyed with its reason.</p>
        </details>
      )}
    </section>
  );
}

/** TODAY tool `today-0dte-ideas`. */
export function ZeroDteIdeasTool() {
  const q = useZeroDteDesk();
  useToolReport({
    asOf: q.data ? q.data.asOf : q.isError ? null : undefined,
    source: '0DTE desk · /api/zero-dte/desk',
    note: q.isError ? (q.data ? 'refresh failed' : 'unavailable') : q.data ? `${(q.data.ideas ?? []).filter((x: DeskIdea) => x.stage !== 'done').length} live` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isError && !q.data) return <QEError title="0DTE ideas didn't load" message={reasonOf(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data) return <QELoading rows={3} label="reading the 0DTE desk…" />;
  if (!q.data.watch.length) return <QEEmpty title="No tracked names" message="The 0DTE watchlist is empty, so there are no index names to read." />;
  return <div className="zd zd-dense zd-tool-body"><ZeroDteIdeas d={q.data} compact /></div>;
}
