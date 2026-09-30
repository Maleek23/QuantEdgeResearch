/**
 * 0DTE IDEAS — the actionable list at the top of the NEXUS 0DTE view, and the
 * compact `today-0dte-ideas` block on TODAY that links to it.
 *
 * Each idea: ticker · CALLS/PUTS · exact contract · premium zone (bid / ask /
 * mid, repriced on every desk build and stamped with the quote's own time) ·
 * underlying trigger · stop (underlying + estimated premium) · T1 / T2 ·
 * enter-by / exit-by · why · structure grade · age. Stage chips:
 * WATCH (forming) → TRIGGERED (enter now) → IN PLAY → DONE. Clicking an idea
 * opens its chart (5-min, trigger / stop / targets drawn) and the contract in
 * the Contract lab.
 *
 * Honesty: model ideas from an unvalidated policy family — the header carries
 * the engine's own record as "measuring · n=", never a hit-rate headline.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Crosshair, ExternalLink, FlaskConical } from 'lucide-react';
import type { Level } from '@/components/charting/chart-engine';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useToolReport } from '@/components/dashboard/frame';
import { useZeroDteDesk, type DeskPayload } from './zero-dte-desk';
import './zero-dte-desk.css';

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
}
export interface IdeasInfo {
  evaluated: { [sym: string]: { at: string | null; eligibility: string; notes: string[] } };
  noZeroDte: Array<{ symbol: string; label: string }>;
  cadence: string; caps: { [sym: string]: string }; honesty: string;
}

/* ── formatting ── */
const px = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const prem = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`);
const ageOf = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return 'age —';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 90 ? `${s}s old` : s < 5400 ? `${Math.round(s / 60)}m old` : `${(s / 3600).toFixed(1)}h old`;
};
const sinceOf = (iso: string, now = Date.now()) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};
const contractLabel = (c: NonNullable<DeskIdea['contract']>) => `${c.root} ${c.expiry.slice(5).replace('-', '/')} ${c.strike}${c.optionType === 'call' ? 'C' : 'P'}`;
const STAGE: Record<IdeaStage, string> = { watch: 'WATCH', triggered: 'TRIGGERED', in_play: 'IN PLAY', done: 'DONE' };

export function recordLine(d: DeskPayload): string {
  const r = d.record; const k = r.byKind['0dte'];
  return `measuring · n=${k.n} decided${r.lowN ? ' (LOW N)' : ''} · ${k.wins}–${k.losses} · ${k.total} logged since ${r.since}`;
}

/* ── one idea ── */
function IdeaCard({ x, open, onToggle }: { x: DeskIdea; open: boolean; onToggle: () => void }) {
  const c = x.contract; const q = x.quote;
  const up = x.direction === 'long';
  return (
    <li className={`zi-card st-${x.stage}`}>
      <button type="button" className="zi-row" onClick={onToggle} aria-expanded={open} title="Open the chart with trigger / stop / targets and the contract in the Contract lab">
        <span className={`zi-stage st-${x.stage}`}>{STAGE[x.stage]}</span>
        <span className="zi-sym">{x.symbol}</span>
        <span className={`zi-side ${up ? 'zd-up' : 'zd-dn'}`}>{x.side}</span>
        <span className="zi-contract">{c ? contractLabel(c) : x.expiryLabel}</span>
        <span className="zi-kind">{x.kindLabel}{x.grade ? <b title={`Structure grade (not a probability): ${x.gradeWhy.join(' · ') || 'no confluence'}`}> · {x.grade}</b> : null}</span>
        <span className="zi-age" title={x.stage === 'watch' ? 'first seen' : 'logged'}>{sinceOf(x.at)}</span>
      </button>
      <div className="zi-body">
        <div className="zi-kv"><span>Premium now</span><strong>
          {q && q.mid != null ? <>{prem(q.mid)} <small>bid {prem(q.bid)} / ask {prem(q.ask)} · {ageOf(q.at)} · {q.source}</small></> : <small>{c ? 'no live quote' : '—'}</small>}
          {x.loggedPremium != null && <small> · logged @ {prem(x.loggedPremium)}</small>}
        </strong></div>
        <div className="zi-kv"><span>Trigger</span><strong>{x.trigger ? px(x.trigger.price) : '—'} <small>{x.triggerText}{x.stage === 'watch' && x.distPct != null ? ` · ${x.distPct.toFixed(2)}% away` : ''}</small></strong></div>
        <div className="zi-kv"><span>Stop</span><strong className="zd-dn">{px(x.stop)}{c?.premiumStop != null && <small> · premium ≈ {prem(c.premiumStop)}</small>}</strong></div>
        <div className="zi-kv"><span>Targets</span><strong className="zd-up">T1 {px(x.target.price)} <small>{x.target.name}{c?.premiumT1 != null ? ` · ≈ ${prem(c.premiumT1)}` : ''}</small>{x.target2 && <> · T2 {px(x.target2.price)} <small>{x.target2.name}{c?.premiumT2 != null ? ` · ≈ ${prem(c.premiumT2)}` : ''}</small></>}{x.rr != null && <small> · {x.rr.toFixed(1)}R</small>}</strong></div>
        <div className="zi-kv"><span>Window</span><strong>{x.entryBy ? `enter by ${x.entryBy}` : 'entry window passed'} · exit by {x.exitBy} ET <small>time stop</small></strong></div>
        <div className="zi-kv"><span>Size</span><strong>{c?.qty ? `${c.qty}× · risk ≈ ${px(c.riskDollars, 0)} · debit ≈ ${px(c.debitDollars, 0)}` : '—'}{c?.delta != null && <small> · Δ {c.delta.toFixed(2)} · OI {c.openInterest?.toLocaleString() ?? '—'} · spread {c.spreadPct != null ? `${Math.round(c.spreadPct * 100)}%` : '—'}</small>}</strong></div>
        <p className="zi-why">{x.why}</p>
        {(x.doneReason || x.contractNote || x.loggedNote) && <p className="zi-note">{[x.doneReason, x.contractNote, x.loggedNote].filter(Boolean).join(' · ')}</p>}
        <p className="zi-note">{x.symbol} {px(x.price)} · {ageOf(x.priceAt)}{c?.basis ? ` · ${c.basis}` : ''}</p>
      </div>
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
          <Link href={`/r/${encodeURIComponent(labSym)}?tab=analyze`} className="zi-ext" title="Open the full Contract lab"><ExternalLink size={12} aria-hidden /></Link>
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

/** The list. `compact` = TODAY block (top 4, no drawer). */
export function ZeroDteIdeas({ d, compact = false }: { d: DeskPayload; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const ideas = (d.ideas ?? []) as DeskIdea[];
  const info = d.ideasInfo as IdeasInfo | undefined;
  const live = ideas.filter((x) => x.stage !== 'done');
  const shown = compact ? live.slice(0, 4) : ideas;
  const counts = { triggered: ideas.filter((x) => x.stage === 'triggered').length, in_play: ideas.filter((x) => x.stage === 'in_play').length, watch: ideas.filter((x) => x.stage === 'watch').length };
  const empty = d.phase.entriesOpen
    ? 'No setup forming on the watched names right now — a measured level has to come within reach of price in a regime with a rule.'
    : d.phase.id === 'pre' ? 'Pre-market — no 0DTE ideas before 09:45 ET.' : 'No new 0DTE entries now (window 09:45–15:45 ET).';
  return (
    <section className={`zi ${compact ? 'zi-compact' : ''}`} aria-label="0DTE ideas">
      <header className="zi-head">
        <h4><Crosshair size={13} aria-hidden /> 0DTE ideas</h4>
        <span className="zd-chip on" title="TRIGGERED — enter now">{counts.triggered} triggered</span>
        <span className="zd-chip">{counts.in_play} in play</span>
        <span className="zd-chip">{counts.watch} watch</span>
        <span className="zi-rec" title={info?.honesty}>{recordLine(d)}</span>
        {compact && <Link href="/t?nx=0dte" className="zi-more">open 0DTE desk →</Link>}
      </header>
      {shown.length === 0 ? <p className="zi-empty">{compact && ideas.length ? 'Nothing live — today\'s ideas are done.' : empty}</p> : (
        <ul className="zi-list">
          {shown.map((x) => compact
            ? <li key={x.key} className={`zi-card st-${x.stage}`}><Link href="/t?nx=0dte" className="zi-row">
                <span className={`zi-stage st-${x.stage}`}>{STAGE[x.stage]}</span><span className="zi-sym">{x.symbol}</span>
                <span className={`zi-side ${x.direction === 'long' ? 'zd-up' : 'zd-dn'}`}>{x.side}</span>
                <span className="zi-contract">{x.contract ? contractLabel(x.contract) : x.expiryLabel}</span>
                <span className="zi-kind">{x.quote?.mid != null ? `~${prem(x.quote.mid)}` : ''} · trig {x.trigger ? px(x.trigger.price) : '—'} · stop {px(x.stop)}</span>
              </Link></li>
            : <IdeaCard key={x.key} x={x} open={open === x.key} onToggle={() => setOpen(open === x.key ? null : x.key)} />)}
        </ul>
      )}
      {info && info.noZeroDte.length > 0 && <p className="zi-note">{info.noZeroDte.map((n) => `${n.symbol}: ${n.label}`).join(' · ')}</p>}
      {!compact && info && <p className="zi-note">{info.honesty} Cadence: {info.cadence}. Caps: {Object.entries(info.caps).map(([k, v]) => `${k} ${v}`).join(' · ')}. Premium stop / targets are delta-only estimates.</p>}
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
  if (q.isError && !q.data) return <QEError title="0DTE ideas didn't load" message={(q.error as Error)?.message} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data) return <QELoading rows={3} label="reading the 0DTE desk…" />;
  if (!q.data.watch.length) return <QEEmpty title="No tracked names" message="ZERO_DTE_WATCH resolved to no names." />;
  return <div className="zd zd-dense zd-tool-body"><ZeroDteIdeas d={q.data} compact /></div>;
}
