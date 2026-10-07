/**
 * 0DTE DESK — the NEXUS "0DTE" view and the `nexus-0dte` dashboard tool.
 *
 * Reads GET /api/zero-dte/desk (server/zero-dte-desk.ts), /api/zero-dte/flow
 * and /api/zero-dte/sniper once a minute. Top to bottom, what to trade NOW first:
 *   • SESSION BANNER — pre / open / power hour / closed, ET clock, countdown to
 *     the next mark (entries open 09:45, power hour, entries close 15:45, close),
 *     policy A/B + entries chips, and the INDEX ENGINE health line (last SPY GEX
 *     snapshot age; red "BLIND" when it has none or it is > 10 min old);
 *   • FILTERS — All / Index / Mega-cap / Flow ignition, and Hide done;
 *   • NOW — every LIVE / ARMED row across ideas, flow ignition and the sniper:
 *     contract, entry mid + quote age, stop, targets, time left;
 *   • 0DTE IDEAS (zero-dte-ideas.tsx), FLOW IGNITION, SNIPER — every row carries
 *     ONE actionability state (shared/zero-dte-actionability.ts). Non-actionable
 *     rows are greyed with their reason, never hidden unless Hide done is on;
 *   • context: walls, sector ignition, per-name cards, 2–4 day swings, record.
 *
 * Integrity: every block stamps its own age; a missing input renders "—",
 * never a placeholder number. Plans are model output, labelled unvalidated.
 * Method paragraphs live in "How it works" disclosures, not above the data.
 */
import { AnalyzeWithQuantinum } from '@/components/quantinum/analyze-with-quantinum';
import { reasonOf } from '@/lib/optimistic';
import { useEffect, useMemo, useState } from 'react';
import { WatchStar } from '@/components/watch/watch-star';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from 'wouter';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { Activity, Clock3, Crosshair, Gauge, History, Timer, Waves, Zap } from 'lucide-react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useToolReport } from '@/components/dashboard/frame';
import { ZeroDteIdeas, ActBadge, ideaAct, ideaInFilter, contractLabel, minsTo, type DeskIdea, type IdeasInfo } from './zero-dte-ideas';
import { SectorIgnitionPanel } from '@/components/sector-ignition/sector-ignition';
import { WallsStrip } from '@/components/walls/walls-strip';
import {
  ACT_CFG, flowActionability, sniperActionability, sessionBanner, fmtCountdown, fmtAge, indexHealth, isDoneLike, isIndexSymbol,
  type ActState, type DeskFilter,
} from '@shared/zero-dte-actionability';
import { useZdNow } from './zd-clock';
import './zero-dte-desk.css';

/* ── wire types (server/zero-dte-desk.ts DeskPayload) ── */
type Side = 'long' | 'short';
interface Phase { id: string; label: string; window: string; etMin: number; minutesToClose: number; entriesOpen: boolean; policies: { A: boolean; B: boolean }; looksFor: string[]; nextAt: string | null }
interface Expiry { expiry: string | null; sameDay: boolean; label: string; calendarDays: number | null; sessionsAfterToday: number | null; upcoming: string[] }
interface EM { source: 'atm_straddle' | 'atm_iv'; expiry: string; strike: number; straddle: number | null; iv: number | null; toExpiry: number; toExpiryPct: number; today: number; todayPct: number; basis: string }
interface Levels { expiry: string; contracts: number; callWall: number | null; putWall: number | null; zeroGamma: number | null; maxGamma: number | null; regime: 'positive' | 'negative' | 'neutral'; regimeTitle: string; nearFlip: boolean; netGex: number; basis: string; modelledGrossShare: number }
interface Intraday { vwap: number | null; vwapSide: 'above' | 'below' | null; vwapDistPct: number | null; or30High: number | null; or30Low: number | null; orbState: string; lastClose: number | null }
interface Flow { expiry: string | null; prints: number; callPremium: number; putPremium: number; lean: Side | 'flat' | null; dayLean: Side | 'flat' | null; dayCallsNet: number | null; dayPutsNet: number | null; asOf: string | null; basis: string }
interface IdeaRef { id: string; direction: Side; outcomeStatus: string | null; timestamp: string; entry: number; stop: number; target: number; exitPrice?: number | null; kind: '0dte' | 'swing'; contract: string | null }
interface Swing { symbol: string; verdict: 'plan' | 'no_plan'; direction: Side | null; entry: number; stop: number | null; target: number | null; structuralTarget: number | null; capped: boolean; rr: number | null; holdDays: number; maxHoldDays: number; sigmaH: number | null; timeStopIso: string | null; exitByIso: string | null; dteWindow: { min: number; max: number; label: string }; basis: string[]; wait: string[] }
interface Row {
  symbol: string; optionRoot: string; owner: string; spot: number | null; chainSource: string | null; chainAgeSec: number | null;
  expiry: Expiry; expectedMove: EM | null; levels: Levels | null; levelsNote: string | null; intraday: Intraday; intradayNote: string | null; barsAgeSec: number | null;
  flow: Flow; engine: { state: string; headline: string; why: string[]; evaluatedAgeSec: number | null };
  todaysIdeas: IdeaRef[]; swing: Swing; swingLevels: { regime: string; zeroGamma: number | null; callWall: number | null; putWall: number | null; maxGamma: number | null; basis: string } | null; errors: string[];
}
interface DeskRec { since: string; n: number; total: number; open: number; unresolvedClosed: number; wins: number; losses: number; winRate: number | null; avgR: number | null; rCount: number; firstAt: string | null; lastAt: string | null; lowN: boolean; byKind: { '0dte': { n: number; wins: number; losses: number; total: number }; swing: { n: number; wins: number; losses: number; total: number } }; perName: { [k: string]: { n: number; wins: number; losses: number; total: number } } }
export interface DeskPayload {
  asOf: string; watch: string[]; phase: Phase; rows: Row[]; ideas: DeskIdea[]; ideasInfo: IdeasInfo; record: DeskRec; provenance: string; notes: string[];
  /** Index engine health inputs (server/zero-dte-desk.ts); absent on an older server. */
  indexEngine?: { scanAt: string | null; gexAt: string | null; wait: string | null };
}

const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function useZeroDteDesk() {
  return useQuery<DeskPayload>({ queryKey: ['/api/zero-dte/desk'], queryFn: () => getJson('/api/zero-dte/desk'), staleTime: 30_000, refetchInterval: 60_000 });
}
function useFlowIgnition() {
  return useQuery<FlowStateW>({ queryKey: ['/api/zero-dte/flow'], queryFn: () => getJson('/api/zero-dte/flow'), staleTime: 30_000, refetchInterval: 60_000 });
}
function useSniper() {
  return useQuery<SniperState>({ queryKey: ['/api/zero-dte/sniper'], queryFn: () => getJson('/api/zero-dte/sniper'), staleTime: 30_000, refetchInterval: 60_000 });
}

/* ── formatting ── */
const px = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const pct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}%`);
const usdK = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v); const s = v < 0 ? '−' : '';
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${Math.round(a / 1e3)}K` : `${s}$${Math.round(a)}`;
};
const age = (sec: number | null | undefined) => (sec == null ? 'age —' : sec < 90 ? `${Math.max(0, sec)}s old` : sec < 5400 ? `${Math.round(sec / 60)}m old` : `${(sec / 3600).toFixed(1)}h old`);
const ageIso = (iso: string | null | undefined, now: number) => (iso ? age(Math.round((now - Date.parse(iso)) / 1000)) : 'age —');
const etTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET' : '—');
const etClockS = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const sideCls = (s: string | null | undefined) => (s === 'long' ? 'zd-up' : s === 'short' ? 'zd-dn' : 'zd-flat');

const STATE_LABEL: { [k: string]: string } = { no_setup: 'No setup', armed: 'Setup armed', triggered: 'Triggered', in_trade: 'In trade', exited: 'Exited', closed: 'Closed' };

/* ── session banner ── */
const TRACK = [
  { id: 'pre', label: 'Pre', w: '–09:30' },
  { id: 'open_drive', label: 'Open drive', w: '09:30–10:00' },
  { id: 'midday', label: 'Midday', w: '10:00–15:00' },
  { id: 'power_hour', label: 'Power hour', w: '15:00–16:00' },
];

function SessionBanner({ phase, indexEngine }: { phase: Phase; indexEngine: DeskPayload['indexEngine'] }) {
  const now = useZdNow(1000);
  const b = sessionBanner(now, phase.id);
  const h = indexHealth(indexEngine ?? null, now, phase.id);
  return (
    <section className={`zd-banner zd-banner-${b.id}`} aria-label="Session">
      <div className="zd-banner-main">
        <div className="zd-banner-phase">
          <Clock3 size={15} aria-hidden />
          <strong>{b.label}</strong>
          <span className="zd-mono zd-banner-clock">{etClockS(now)} ET</span>
        </div>
        <div className="zd-banner-count" role="timer" aria-live="off">
          {b.next
            ? <><span>{b.next} in</span><strong className="zd-mono">{fmtCountdown(b.secondsLeft)}</strong></>
            : <span>No session — next open is the next weekday 09:30 ET</span>}
          {b.toCloseSec != null && b.next !== 'close 16:00' && <small className="zd-mono">close in {fmtCountdown(b.toCloseSec)}</small>}
        </div>
        <div className="zd-banner-chips">
          <span className={`zd-chip ${phase.entriesOpen ? 'on' : ''}`}>{phase.entriesOpen ? 'entries open' : 'no new entries'}</span>
          <span className={`zd-chip ${phase.policies.A ? 'on' : ''}`} title="Policy A — negative-gamma continuation">A {phase.policies.A ? 'open' : 'off'}</span>
          <span className={`zd-chip ${phase.policies.B ? 'on' : ''}`} title="Policy B — positive-gamma wall fade / power-hour pin">B {phase.policies.B ? 'open' : 'off'}</span>
        </div>
      </div>
      <p className={`zd-health zd-health-${h.tone}`}>
        <Activity size={13} aria-hidden />
        <b>Index engine</b>
        <span>{h.tone === 'blind' ? '' : h.tone === 'warn' ? 'LAGGING · ' : h.tone === 'ok' ? 'OK · ' : ''}{h.text}</span>
      </p>
      <ol className="zd-track" aria-label="Session phases">
        {TRACK.map((s) => <li key={s.id} className={phase.id === s.id ? 'now' : ''} aria-current={phase.id === s.id ? 'step' : undefined}><b>{s.label}</b><span>{s.w}</span></li>)}
      </ol>
      {phase.looksFor.length > 0 && (
        <details className="zd-how"><summary>What the engine looks for now</summary>
          <ul className="zd-looks">{phase.looksFor.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

/* ── filters ── */
const FILTERS: Array<{ id: DeskFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'index', label: 'Index' }, { id: 'mega', label: 'Mega-cap' }, { id: 'flow', label: 'Flow ignition' },
];
const FKEY = 'qe-zd-filter-v1';
function readPrefs(): { filter: DeskFilter; hideDone: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(FKEY) ?? 'null');
    if (v && FILTERS.some((f) => f.id === v.filter)) return { filter: v.filter, hideDone: !!v.hideDone };
  } catch { /* storage blocked */ }
  return { filter: 'all', hideDone: false };
}
function usePrefs() {
  const [p, setP] = useState(readPrefs);
  useEffect(() => { try { localStorage.setItem(FKEY, JSON.stringify(p)); } catch { /* storage blocked */ } }, [p]);
  return [p, setP] as const;
}

function FilterBar({ filter, hideDone, onFilter, onHideDone, doneCount }: { filter: DeskFilter; hideDone: boolean; onFilter: (f: DeskFilter) => void; onHideDone: (v: boolean) => void; doneCount: number }) {
  return (
    <div className="zd-filters" role="toolbar" aria-label="Filter the desk">
      <div className="zd-seg" role="group" aria-label="Lane">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="zd-fchip" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      <button type="button" className="zd-fchip zd-fchip-toggle" aria-pressed={hideDone} onClick={() => onHideDone(!hideDone)}>
        Hide done{doneCount ? ` (${doneCount})` : ''}
      </button>
    </div>
  );
}

/* ── NOW: every LIVE / ARMED row ── */
const shortLeft = (m: number | null) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`);
interface NowItem {
  key: string; lane: 'idea' | 'flow' | 'sniper'; a: ActState; symbol: string; side: 'CALLS' | 'PUTS';
  contract: string; mid: string; midAge: string; stop: string; targets: string; left: string; target: string | null;
  /** Units of stop / targets: the underlying symbol, or "premium". */
  unit: string;
}

function NowStrip({ items, phase, now }: { items: NowItem[]; phase: Phase; now: number }) {
  const b = sessionBanner(now, phase.id);
  const go = (id: string | null) => { if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <section className="zd-now" aria-label="Actionable now">
      <h4><Zap size={14} aria-hidden /> Now <span className="zd-now-sub">live and armed rows across ideas, flow ignition and the sniper</span></h4>
      {items.length === 0
        ? <p className="zd-now-empty">Nothing actionable right now.{b.next ? ` Next: ${b.next} (in ${fmtCountdown(b.secondsLeft)}).` : ' The session is closed.'} Every other row below is greyed with its reason.</p>
        : (
          <ul className="zd-now-list">
            {items.map((it) => (
              <li key={it.key} className={`zd-now-card zd-a-${it.a.state}`}>
                <button type="button" className="zd-now-btn" onClick={() => go(it.target)} aria-label={`${it.a.label} ${it.symbol} ${it.side} ${it.contract} — jump to the full row`}>
                  <span className="zd-now-top"><ActBadge a={it.a} /><b className="zd-now-sym">{it.symbol}</b><span className={it.side === 'CALLS' ? 'zd-up' : 'zd-dn'}>{it.side}</span><span className="zd-now-lane">{it.lane === 'idea' ? '0DTE idea' : it.lane === 'flow' ? 'flow ignition' : 'sniper'}</span></span>
                  <span className="zd-now-contract zd-mono">{it.contract}</span>
                  <span className="zd-now-grid">
                    <span><small>Entry mid</small><b className="zd-mono">{it.mid}</b><small>{it.midAge}</small></span>
                    <span><small>Stop · {it.unit}</small><b className="zd-mono zd-dn">{it.stop}</b></span>
                    <span><small>Targets · {it.unit}</small><b className="zd-mono zd-up">{it.targets}</b></span>
                    <span><small>Time left</small><b className="zd-mono">{it.left || '—'}</b></span>
                  </span>
                  <span className="zd-reason">{it.a.reason}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/* ── per-name cards (context) ── */
function Kv({ k, v, cls, title, href }: { k: string; v: string; cls?: string; title?: string; href?: string }) {
  // A level with a value is a handle: it opens the GEX workspace focused on this name.
  if (href && v !== '—') return <Link href={href} className="zd-kv zd-kv-link" title={title ?? `${k} — open GEX focused on this name`}><span>{k}</span><strong className={cls}>{v}</strong></Link>;
  return <div className="zd-kv" title={title}><span>{k}</span><strong className={cls}>{v}</strong></div>;
}

const tickerHref = (sym: string) => `/r/${encodeURIComponent(sym)}`;
const gexHref = (sym: string) => `/r/${encodeURIComponent(sym)}?tab=gex`;

function NameCard({ r, now }: { r: Row; now: number }) {
  const L = r.levels; const em = r.expectedMove; const f = r.flow; const i = r.intraday;
  return (
    <article className="zd-card" aria-label={`${r.symbol} 0DTE`}>
      <header className="zd-card-head">
        <div>
          <h3><Link href={tickerHref(r.symbol)} className="zd-sym-link" title={`Open the ${r.symbol} ticker page`}>{r.symbol}</Link>{r.optionRoot !== r.symbol && <small> · {r.optionRoot}</small>}<WatchStar sym={r.symbol} size={13} /> <AnalyzeWithQuantinum compact target={{ kind: 'zerodte', symbol: r.symbol, label: `${r.symbol} 0DTE card`, row: { spot: r.spot ?? null, status: String(r.engine.state).slice(0, 24) } }} /></h3>
          <span className="zd-sub">{px(r.spot)} · {r.chainSource ?? 'no chain'} · {age(r.chainAgeSec)}</span>
        </div>
        <span className={`zd-exp ${r.expiry.sameDay ? 'same' : ''}`} title={r.expiry.upcoming.length ? `listed: ${r.expiry.upcoming.join(', ')}` : undefined}>{r.expiry.label}</span>
      </header>

      <div className={`zd-state s-${r.engine.state}`}>
        <span className="zd-state-badge">{STATE_LABEL[r.engine.state] ?? r.engine.state}</span>
        <p>{r.engine.headline}</p>
        {r.engine.why.length > 0 && <ul>{r.engine.why.slice(0, 3).map((w, k) => <li key={k}>{w}</li>)}</ul>}
        <span className="zd-foot">{r.owner} · evaluated {age(r.engine.evaluatedAgeSec)}</span>
      </div>

      <div className="zd-grid">
        <Kv k="Exp. move today" v={em ? `±${px(em.today)} (${pct(em.todayPct)})` : '—'} title={em?.basis} />
        <Kv k={`To ${em?.expiry ?? 'expiry'}`} v={em ? `±${px(em.toExpiry)} · ${em.source === 'atm_straddle' ? 'straddle' : 'IV'}` : '—'} title={em?.basis} />
        <Kv k="Call wall" v={px(L?.callWall)} cls="zd-dn" href={gexHref(r.symbol)} />
        <Kv k="Put wall" v={px(L?.putWall)} cls="zd-up" href={gexHref(r.symbol)} />
        <Kv k="Zero-γ" v={px(L?.zeroGamma)} href={gexHref(r.symbol)} />
        <Kv k="King node" v={px(L?.maxGamma)} href={gexHref(r.symbol)} />
        <Kv k="Regime" v={L ? `${L.regimeTitle}${L.nearFlip ? ' · near flip' : ''}` : '—'} cls={L?.regime === 'negative' ? 'zd-dn' : L?.regime === 'positive' ? 'zd-up' : undefined} title={L?.basis} href={gexHref(r.symbol)} />
        <Kv k="VWAP" v={i.vwap != null ? `${px(i.vwap)} · ${i.vwapSide ?? '—'}` : '—'} title={r.intradayNote ?? undefined} />
        <Kv k="Opening range" v={i.orbState === 'n/a' ? '—' : `${i.orbState}${i.or30High != null ? ` · ${px(i.or30Low)}–${px(i.or30High)}` : ''}`} />
        <Kv k="Flow tide (exp.)" v={f.prints ? `${f.lean ?? '—'} · C ${usdK(f.callPremium)} / P ${usdK(f.putPremium)}` : 'no prints'} cls={sideCls(f.lean)} title={f.basis} />
        <Kv k="Day net premium" v={f.dayLean ? `${f.dayLean} · ${usdK((f.dayCallsNet ?? 0) - (f.dayPutsNet ?? 0))}` : '—'} cls={sideCls(f.dayLean)} />
      </div>
      <p className="zd-note">
        {L ? `Levels: ${L.expiry} expiry only (${L.contracts} contracts, ${Math.round(L.modelledGrossShare * 100)}% of gross γ modelled)` : 'No single-expiry GEX read'}{r.levelsNote && L ? ` · ${r.levelsNote}` : ''} · bars {age(r.barsAgeSec)} · flow {ageIso(f.asOf, now)}
      </p>
      {/* 0DTE ideas are listed once, above; only today's swing ideas link from here. */}
      {r.todaysIdeas.some((x) => x.kind === 'swing') && (
        <ul className="zd-ideas">
          {r.todaysIdeas.filter((x) => x.kind === 'swing').map((x) => (
            <li key={x.id}><Link href={nexusIdeaHref({ ideaId: x.id, symbol: r.symbol })} className="zd-idea-link" title="Open this idea on NEXUS"><span className={sideCls(x.direction)}>{x.direction}</span> swing {x.contract ?? ''} · {px(x.entry)} → {px(x.target)} / stop {px(x.stop)} · <b>{x.outcomeStatus ?? 'open'}</b> · {etTime(x.timestamp)}</Link></li>
          ))}
        </ul>
      )}
      {r.errors.length > 0 && <p className="zd-err">{r.errors.join(' · ')}</p>}
    </article>
  );
}

function SwingTable({ rows }: { rows: Row[] }) {
  return (
    <section className="zd-section" aria-label="Short swings, 2 to 4 days">
      <h4><Waves size={13} aria-hidden /> Short swings (2–4d) <span className="zd-lown">UNVALIDATED</span></h4>
      <details className="zd-how"><summary>How swings are planned</summary>
        <p className="zd-note">Weekly-path model drift rule + all-book GEX regime + flow. T1 capped at 1σ of the horizon (loss rule 3); time stop at half the horizon unless ≥ 0.5R; contracts {rows[0]?.swing.dteWindow.label ?? '30–60 DTE'}. Unvalidated model plans — published at 10:30 / 14:30 ET when a plan exists.</p>
      </details>
      <div className="zd-table-wrap">
        <table className="zd-table zd-stack">
          <thead><tr><th>Name</th><th>Plan</th><th>Entry</th><th>Stop</th><th>T1 (≤1σ)</th><th>R:R</th><th>1σ · {rows[0]?.swing.holdDays ?? 3}d</th><th>Time stop</th><th>Why</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const s = r.swing;
              return (
                <tr key={r.symbol} className={s.verdict === 'plan' ? '' : 'zd-is-dim'}>
                  <td data-label="Name"><Link href={tickerHref(r.symbol)} className="zd-sym-link"><b>{r.symbol}</b></Link><small>{r.swingLevels ? ` ${r.swingLevels.regime} γ` : ''}</small></td>
                  <td data-label="Plan" className={s.verdict === 'plan' ? sideCls(s.direction) : 'zd-flat'}>{s.verdict === 'plan' ? s.direction : 'no plan'}</td>
                  <td data-label="Entry">{px(s.entry)}</td>
                  <td data-label="Stop">{px(s.stop)}</td>
                  <td data-label="T1 (≤1σ)">{px(s.target)}{s.capped && <small title={`structural ${px(s.structuralTarget)} kept as the T2 stretch`}> capped</small>}</td>
                  <td data-label="R:R">{s.rr != null ? s.rr.toFixed(2) : '—'}</td>
                  <td data-label="1σ">{s.sigmaH != null ? `±${px(s.sigmaH)}` : '—'}</td>
                  <td data-label="Time stop">{s.timeStopIso ? etTime(s.timeStopIso) : '—'}{s.exitByIso && <small> · out by {etTime(s.exitByIso)}</small>}</td>
                  <td data-label="Why" className="zd-why">{(s.verdict === 'plan' ? s.basis.slice(1, 3) : s.wait.slice(0, 2)).join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecordBlock({ rec }: { rec: DeskRec }) {
  const range = rec.firstAt ? `${rec.firstAt.slice(0, 10)} → ${rec.lastAt?.slice(0, 10)}` : 'no ideas logged yet';
  return (
    <section className="zd-section" aria-label="This engine's record">
      <h4><History size={13} aria-hidden /> Record — this engine only {rec.lowN && <span className="zd-lown" title={`fewer than 20 decided outcomes: no rate here is evidence of an edge`}>LOW N</span>}</h4>
      <div className="zd-rec">
        <Kv k="Decided (n)" v={`${rec.n}`} />
        <Kv k="W – L" v={`${rec.wins} – ${rec.losses}`} />
        <Kv k="Win rate" v={rec.winRate != null ? `${Math.round(rec.winRate * 100)}%` : '—'} />
        <Kv k="Avg R (closed)" v={rec.avgR != null ? `${rec.avgR >= 0 ? '+' : ''}${rec.avgR.toFixed(2)}R · n ${rec.rCount}` : '—'} />
        <Kv k="Open" v={`${rec.open}`} />
        <Kv k="Time-stopped / expired" v={`${rec.unresolvedClosed}`} />
        <Kv k="0DTE · swing logged" v={`${rec.byKind['0dte'].total} · ${rec.byKind.swing.total}`} />
        <Kv k="Range" v={range} />
      </div>
      <p className="zd-note">Only outcomes since {rec.since} (earlier platform rates are invalid). Includes the index engine's policy A/B ideas and this desk's single-name and swing ideas. {Object.entries(rec.perName).map(([k, v]) => `${k} ${v.wins}–${v.losses} of ${v.total}`).join(' · ')}</p>
    </section>
  );
}

/* ── Sniper (GET /api/zero-dte/sniper, server/zero-dte-sniper.ts) ── */
interface SniperPick { variant: 'otm1' | 'lotto' | 'lotto_near'; occ: string; strike: number; type: 'call' | 'put'; expiry: string; bid: number | null; ask: number | null; volume: number }
interface SniperRow {
  symbol: string; setup: string; setupLabel: string; side: Side; triggerAt: string; triggerEt: string; triggerPrice: number; level: number; levelName: string; note: string;
  touch: number | null; zoneKind: string | null; volume: { triggerRvol: number | null; label: string; source: string; asOf: string | null } | null;
  status: 'published' | 'watch'; reason: string | null; contracts: SniperPick[]; chainSource: string | null; ideaId: string | null;
}
const ZONE_KIND: { [k: string]: string } = { prior_day: 'prior day', premarket: 'pre-market', round: 'round number', session_pivot: 'today\'s swing', gex: 'GEX (live, unmeasured)' };
interface SniperCycle { at: string; skipped: string | null; universeSize: number; universeCut: string[]; feed: string | null; triggersFresh: number; triggersStale: number; chainFetches: { used: number; cap: number; deferred: string[] }; cycleMs: number; memory: { rssBeforeMb: number; rssAfterMb: number }; published: unknown[]; errors: string[] }
interface SniperState { enabled: boolean; lastCycle: SniperCycle | null; today: SniperRow[]; publishable: Array<{ key: string; exit: string }> }
const VARIANT_SHORT: { [k: string]: string } = { otm1: 'OTM', lotto: 'lotto', lotto_near: 'near lotto' };
const sniperKey = (r: SniperRow) => `${r.symbol}|${r.setup}|${r.side}|${r.triggerAt}`;
const domId = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

function sniperRowsOf(s: SniperState | undefined) {
  // Reactive-zone touches fire many times a day; a zone touch with no chain read (stage-2 cap) is counted, not listed.
  const all = [...(s?.today ?? [])].reverse();
  const rows = all.filter((r) => r.status === 'published' || r.contracts.length > 0 || r.setup !== 'reactive_zone');
  return { rows, hiddenZone: all.length - rows.length };
}

function SniperSection({ q, phase, now, filter, hideDone }: { q: UseQueryResult<SniperState>; phase: Phase; now: number; filter: DeskFilter; hideDone: boolean }) {
  const s = q.data; const c = s?.lastCycle ?? null;
  const { rows: base, hiddenZone } = sniperRowsOf(s);
  const ctx = { nowMs: now, phaseId: phase.id, entriesOpen: phase.entriesOpen };
  const rated = base.map((r) => ({ r, a: sniperActionability({ status: r.status, triggerAt: r.triggerAt, contracts: r.contracts.length }, ctx) })).sort((x, y) => x.a.rank - y.a.rank);
  const inF = filter === 'flow' ? [] : rated.filter(({ r }) => ideaInFilter(r.symbol, filter));
  const rows = hideDone ? inF.filter(({ a }) => !isDoneLike(a.state) && a.state !== 'passed') : inF;
  return (
    <section className="zd-section" aria-label="0DTE sniper, board-wide classic setups">
      <h4><Crosshair size={13} aria-hidden /> Sniper — board-wide classic setups <span className="zd-lown" title="Replay-selected where anything survived both walk-forward halves; unproven live">MEASURING</span>
        {c && <span className="zd-cycle">cycle {ageIso(c.at, now)}{c.skipped ? ` · skipped` : ''}</span>}</h4>
      {s && !s.enabled && <p className="zd-err">Engine is OFF (ZERO_DTE_SNIPER not set) — rows appear only when it runs.</p>}
      {q.isError && !s && <p className="zd-err">Sniper state unavailable: {reasonOf(q.error)}</p>}
      <details className="zd-how"><summary>How the sniper works</summary>
        <p className="zd-note">
          Every name on the board (ETFs, the 0DTE watch list, NEXUS ideas) is checked every 2 min 09:45–15:50 ET on 1-minute price bars for ORB, VWAP reclaim/loss, level hold → VWAP reclaim, prior-day break &amp; hold, failed breakout, power-hour continuation and opening flush → reclaim. An option chain is read only for names that fired (a few per cycle). Only setups that held in both halves of the replay publish; the rest are watch rows. A published trigger is LIVE for {ACT_CFG.SNIPER_FRESH_MIN} min, then PASSED.
          {s && ` Publishable combinations: ${s.publishable.length ? s.publishable.map((p) => p.key).join(', ') : 'none'}.`}
        </p>
        {c && (
          <p className="zd-note zd-mono">
            Last cycle {etTime(c.at)}{c.skipped ? ` · skipped: ${c.skipped}` : ` · ${c.universeSize} names${c.universeCut.length ? ` (${c.universeCut.length} cut)` : ''} · ${c.triggersFresh} fresh / ${c.triggersStale} stale · chains ${c.chainFetches.used}/${c.chainFetches.cap}${c.chainFetches.deferred.length ? ` (deferred ${c.chainFetches.deferred.join(', ')})` : ''} · ${c.published.length} published · ${c.cycleMs} ms · RSS ${c.memory.rssBeforeMb}→${c.memory.rssAfterMb} MB${c.feed ? ` · ${c.feed} bars` : ''}`}
            {c.errors.length > 0 && ` · ${c.errors.join(' · ')}`}
          </p>
        )}
      </details>
      {hiddenZone > 0 && <p className="zd-note">{hiddenZone} more reactive-zone touch{hiddenZone === 1 ? '' : 'es'} today without a chain read (stage-2 cap) — counted, not listed.</p>}
      {filter === 'flow'
        ? <p className="zd-note">Not part of the Flow ignition filter — {rated.length} sniper row{rated.length === 1 ? '' : 's'} today (choose All).</p>
        : rows.length === 0
          ? <p className="zd-note">{!s ? 'Loading sniper state…' : inF.length ? `All ${inF.length} rows in this view are done — “Hide done” is on.` : 'No sniper triggers today.'}</p>
          : (
            <div className="zd-table-wrap">
              <table className="zd-table zd-stack">
                <thead><tr><th>State</th><th>Trigger (ET)</th><th>Name</th><th>Setup</th><th>Side</th><th>Price · level / zone</th><th>Volume</th><th>Contract · ask</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map(({ r, a }) => (
                    <tr key={sniperKey(r)} id={`zs-${domId(sniperKey(r))}`} className={`zd-a-${a.state} ${a.actionable ? 'zd-is-act' : 'zd-is-dim'}`}>
                      <td data-label="State"><ActBadge a={a} /><div><small>{a.reason}</small></div></td>
                      <td data-label="Trigger" className="zd-mono" title={r.triggerAt}>{r.triggerEt}</td>
                      <td data-label="Name"><Link href={tickerHref(r.symbol)} className="zd-sym-link"><b>{r.symbol}</b></Link> <AnalyzeWithQuantinum compact target={{ kind: 'zerodte', symbol: r.symbol, label: `${r.symbol} 0DTE ${r.side === 'long' ? 'calls' : 'puts'} trigger`, row: { direction: r.side, price: r.triggerPrice ?? null, level: r.level ?? null, levelType: r.levelName ?? null, kind: r.setupLabel ?? null } }} /></td>
                      <td data-label="Setup" title={r.note}>{r.setupLabel}</td>
                      <td data-label="Side" className={sideCls(r.side)}>{r.side === 'long' ? 'calls' : 'puts'}</td>
                      <td data-label="Price · level">
                        {px(r.triggerPrice)} <small>· {r.levelName} {px(r.level)}</small>
                        {r.touch != null && <div><small>zone: {ZONE_KIND[r.zoneKind ?? ''] ?? r.zoneKind} · touch #{r.touch}</small></div>}
                      </td>
                      <td data-label="Volume" title={r.volume ? `${r.volume.source}${r.volume.asOf ? ` · bars to ${etTime(r.volume.asOf)}` : ''}` : 'read only for names that got a chain'}>
                        {r.volume?.triggerRvol != null ? `trigger bar ${r.volume.triggerRvol.toFixed(1)}× normal` : '—'}
                      </td>
                      <td data-label="Contract" className="zd-mono">
                        {r.contracts.length === 0 ? '—' : r.contracts.map((p) => (
                          <div key={p.variant} title={`${p.occ} · bid ${px(p.bid)} · vol ${p.volume} · ${r.chainSource ?? ''}`}>{VARIANT_SHORT[p.variant] ?? p.variant}: {p.strike}{p.type === 'call' ? 'C' : 'P'} @ {px(p.ask)}</div>
                        ))}
                      </td>
                      <td data-label="Status">
                        {r.status === 'published' && r.ideaId
                          ? <Link href={nexusIdeaHref({ ideaId: r.ideaId, symbol: r.symbol })} className="zd-idea-link"><b>published</b></Link>
                          : <b>watch</b>}
                        <small> · measuring{r.reason ? ` · ${r.reason}` : ''}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </section>
  );
}

/* ── Flow ignition (GET /api/zero-dte/flow, server/zero-dte-flow.ts) ── */
type FlowStateId = 'watch' | 'fired' | 'reached' | 'faded';
interface FlowRowW {
  id: string; kind: 'ignition' | 'unwind'; symbol: string; side: Side; state: FlowStateId; at: string; atEt: string; spot: number | null; score: number | null;
  flow: { occ: string; strike: number; type: 'call' | 'put'; dte: number; aggressive: number; relSize: number; dayVolume: number; openInterest: number | null; sweeps: number } | null;
  structure: { ok: boolean; reason: string | null; vwap: number | null; orHigh: number | null; orLow: number | null; heldBars: number } | null;
  wall: string | null; unwind: string | null;
  contract: { occ: string; strike: number; type: 'call' | 'put'; dte: number; bid: number | null; ask: number | null; mid: number | null; quoteAgeS: number | null; spreadPct: number | null; source: string } | null;
  plan: { entryPremium: number; t1Premium: number; t2Premium: number; stopPremium: number; t1Underlying: number | null; t2Underlying: number | null; stopUnderlying: number; stopBasis: string } | null;
  published: boolean; ideaId: string | null; reason: string | null; stateWhy: string | null; lastMid: number | null; lastMarkAt: string | null; text: string;
}
interface FlowCycleW { at: string; skipped: string | null; inWindow: boolean; symbols: number; chains: { read: number; dropped: string[]; failed: string[] }; cycleMs: number; errors: string[] }
interface FlowStateW { enabled: boolean; lastCycle: FlowCycleW | null; rows: FlowRowW[]; rules: { [k: string]: string }; honesty: string }

/** Contract quote age as of NOW: the quote's age at the cycle + time since the cycle. */
const flowQuoteAge = (r: FlowRowW, c: FlowCycleW | null, now: number) =>
  r.contract?.quoteAgeS == null ? null : r.contract.quoteAgeS + (c ? Math.max(0, Math.round((now - Date.parse(c.at)) / 1000)) : 0);
function flowAct(r: FlowRowW, c: FlowCycleW | null, phase: Phase, now: number): ActState {
  return flowActionability({ state: r.state, at: r.at, quoteAgeSec: flowQuoteAge(r, c, now), hasPlan: !!r.plan, stateWhy: r.stateWhy, reason: r.reason },
    { nowMs: now, phaseId: phase.id, entriesOpen: phase.entriesOpen });
}
const flowContract = (r: FlowRowW) => (r.contract ? `${r.symbol} ${r.contract.strike}${r.contract.type === 'call' ? 'C' : 'P'} ${r.contract.dte === 0 ? '0DTE' : `${r.contract.dte}DTE`}` : '—');

function FlowIgnitionSection({ q, phase, now, filter, hideDone }: { q: UseQueryResult<FlowStateW>; phase: Phase; now: number; filter: DeskFilter; hideDone: boolean }) {
  const s = q.data; const c = s?.lastCycle ?? null;
  const rated = (s?.rows ?? []).map((r) => ({ r, a: flowAct(r, c, phase, now) })).sort((x, y) => x.a.rank - y.a.rank);
  const inF = rated.filter(({ r }) => filter === 'all' || filter === 'flow' || ideaInFilter(r.symbol, filter));
  const rows = hideDone ? inF.filter(({ a }) => !isDoneLike(a.state)) : inF;
  return (
    <section className="zd-section" aria-label="0DTE flow ignition">
      <h4><Waves size={13} aria-hidden /> Flow ignition — opening 0DTE flow + structure <span className="zd-lown" title="No edge claimed; every trigger is forward-logged with its outcome">MEASURING</span>
        {c && <span className="zd-cycle">cycle {ageIso(c.at, now)}{c.skipped ? ' · skipped' : ''}</span>}</h4>
      {s && !s.enabled && <p className="zd-err">Watch-only — ZERO_DTE_FLOW is not set, so nothing publishes.</p>}
      {q.isError && !s && <p className="zd-err">Flow ignition unavailable: {reasonOf(q.error)}</p>}
      <details className="zd-how"><summary>How flow ignition works</summary>
        <p className="zd-note">
          09:35–11:30 ET, every 2 min: at-ask opening flow on a 0–2 DTE strike near the money (≥ $250K index / $100K single name in 10 min, volume &gt; OI) with price through the opening range and VWAP for 2 bars and no opposing wall within 0.5%. SPY also watches its dominant 0DTE strike for an unwind (fade). A fired row is LIVE for {ACT_CFG.FLOW_FRESH_MIN} min while its quote is ≤ 2 min old, then PASSED (manage only).
          {s && ` ${s.honesty}`}
        </p>
        {c && (
          <p className="zd-note zd-mono">
            Last cycle {etTime(c.at)}{c.skipped ? ` · skipped: ${c.skipped}` : ` · ${c.symbols} names · chains ${c.chains.read}${c.chains.dropped.length ? ` (gate dropped ${c.chains.dropped.join(', ')})` : ''} · ${c.cycleMs} ms`}
            {c.errors.length > 0 && ` · ${c.errors.join(' · ')}`}
          </p>
        )}
      </details>
      {rows.length === 0
        ? <p className="zd-note">{!s ? 'Loading flow ignition…' : inF.length ? `All ${inF.length} rows in this view are done — “Hide done” is on.` : rated.length ? `No flow ignition in this lane (${rated.length} in other lanes).` : 'No flow ignition today.'}</p>
        : (
          <ul className="zf-list">
            {rows.map(({ r, a }) => {
              const qa = flowQuoteAge(r, c, now);
              return (
                <li key={r.id} id={`zf-${domId(r.id)}`} className={`zf-card zd-a-${a.state} ${a.actionable ? 'zd-is-act' : 'zd-is-dim'}`}>
                  <div className="zf-head">
                    <ActBadge a={a} />
                    <Link href={tickerHref(r.symbol)} className="zd-sym-link zi-sym">{r.symbol}</Link>
                    <span className={`zi-side ${sideCls(r.side)}`}>{r.side === 'long' ? 'CALLS' : 'PUTS'}</span>
                    <AnalyzeWithQuantinum compact target={{ kind: 'zerodte', symbol: r.symbol, label: `${r.symbol} 0DTE flow ignition`, row: { direction: r.side, strike: r.flow?.strike ?? null, optionType: r.flow?.type ?? null, premium: r.flow?.aggressive ?? null, kind: r.kind } }} />
                    <span className="zi-contract">{flowContract(r)}</span>
                    {r.kind === 'unwind' && <span className="zi-kind">unwind fade</span>}
                    <span className="zi-age" title={r.at}>{r.atEt} ET{r.score != null ? ` · score ${r.score}` : ''}</span>
                  </div>
                  <p className="zd-reason">{a.reason}</p>
                  <div className="zf-body">
                    <div className="zi-kv"><span>Trigger</span><strong title={r.text}>
                      {r.kind === 'unwind'
                        ? <small>unwind: {r.unwind}</small>
                        : r.flow ? <>{usdK(r.flow.aggressive)} at ask · {r.flow.strike}{r.flow.type === 'call' ? 'C' : 'P'} <small>({r.flow.relSize}× floor · vol {r.flow.dayVolume} / OI {r.flow.openInterest ?? '—'}{r.flow.sweeps ? ` · ${r.flow.sweeps} Bullflow` : ''})</small></> : '—'}
                    </strong></div>
                    <div className="zi-kv"><span>Entry mid</span><strong>
                      {r.contract ? <>{px(r.plan?.entryPremium ?? r.contract.mid)} <small>bid {px(r.contract.bid)} / ask {px(r.contract.ask)} · quote {qa != null ? `${fmtAge(qa)} old` : '—'} · spread {r.contract.spreadPct != null ? `${(r.contract.spreadPct * 100).toFixed(1)}%` : '—'}</small></> : '—'}
                    </strong></div>
                    <div className="zi-kv"><span>Plan</span><strong>
                      {r.plan ? <><span className="zd-up">T1 {px(r.plan.t1Premium)}{r.plan.t1Underlying != null && <small> ({r.plan.t1Underlying})</small>} · T2 {px(r.plan.t2Premium)}</span> · <span className="zd-dn">stop {px(r.plan.stopPremium)}</span> <small>/ {r.plan.stopBasis} {r.plan.stopUnderlying} · out 15:30</small></> : <small>{r.reason ?? '—'}</small>}
                    </strong></div>
                    <div className="zi-kv"><span>Now</span><strong>
                      {r.lastMid != null ? <>{px(r.lastMid)} <small>({ageIso(r.lastMarkAt, now)})</small></> : '—'}
                      {r.published && r.ideaId && <> · <Link href={nexusIdeaHref({ ideaId: r.ideaId, symbol: r.symbol })} className="zd-idea-link zd-inline">published</Link></>}
                    </strong></div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

/* ── NOW items ── */
function buildNow(d: DeskPayload, flow: FlowStateW | undefined, sn: SniperState | undefined, now: number, filter: DeskFilter): NowItem[] {
  const out: NowItem[] = [];
  const ctx = { nowMs: now, phaseId: d.phase.id, entriesOpen: d.phase.entriesOpen };
  if (filter !== 'flow') {
    for (const x of d.ideas ?? []) {
      if (!ideaInFilter(x.symbol, filter)) continue;
      const a = ideaAct(x, d, now); if (!a.actionable) continue;
      const c = x.contract;
      const entryLeft = minsTo(x.entryBy, now);
      out.push({
        key: `i-${x.key}`, lane: 'idea', a, symbol: x.symbol, side: x.side, unit: x.symbol,
        // An SPX thesis is logged on SPY: name the SPXW mirror too, so the SPX-unit stop / targets read right.
        contract: `${c ? contractLabel(c) : x.expiryLabel}${x.spxMirror?.contract ? ` · SPXW ${x.spxMirror.contract.strike}${x.spxMirror.contract.optionType === 'call' ? 'C' : 'P'}${x.spxMirror.premium?.mid != null ? ` est ${px(x.spxMirror.premium.mid)} (15m delayed)` : ''}` : ''}`,
        mid: x.quote?.mid != null ? px(x.quote.mid) : '—', midAge: x.quote?.at ? ageIso(x.quote.at, now) : 'no quote',
        stop: `${px(x.stop)}${c?.premiumStop != null ? ` (≈${px(c.premiumStop)})` : ''}`,
        targets: `${px(x.target.price)}${x.target2 ? ` / ${px(x.target2.price)}` : ''}`,
        left: a.state === 'live' ? (entryLeft != null ? `${shortLeft(entryLeft)} to enter` : '') : `trigger ${x.trigger ? px(x.trigger.price) : '—'}`,
        target: `zi-${x.key}`,
      });
    }
  }
  const fc = flow?.lastCycle ?? null;
  for (const r of flow?.rows ?? []) {
    if (!(filter === 'all' || filter === 'flow' || ideaInFilter(r.symbol, filter))) continue;
    const a = flowAct(r, fc, d.phase, now); if (!a.actionable) continue;
    const since = Math.round((now - Date.parse(r.at)) / 60_000);
    const qa = flowQuoteAge(r, fc, now);
    out.push({
      key: `f-${r.id}`, lane: 'flow', a, symbol: r.symbol, unit: 'premium', side: r.side === 'long' ? 'CALLS' : 'PUTS', contract: flowContract(r),
      mid: px(r.plan?.entryPremium ?? r.contract?.mid), midAge: qa != null ? `quote ${fmtAge(qa)} old` : 'no quote',
      stop: px(r.plan?.stopPremium), targets: r.plan ? `${px(r.plan.t1Premium)} / ${px(r.plan.t2Premium)}` : '—',
      left: `${shortLeft(Math.max(0, ACT_CFG.FLOW_FRESH_MIN - since))} to enter`, target: `zf-${domId(r.id)}`,
    });
  }
  if (filter !== 'flow') {
    for (const r of sniperRowsOf(sn).rows) {
      if (!ideaInFilter(r.symbol, filter)) continue;
      const a = sniperActionability({ status: r.status, triggerAt: r.triggerAt, contracts: r.contracts.length }, ctx); if (!a.actionable) continue;
      const p = r.contracts[0];
      const since = Math.round((now - Date.parse(r.triggerAt)) / 60_000);
      out.push({
        key: `s-${sniperKey(r)}`, lane: 'sniper', a, symbol: r.symbol, unit: r.symbol, side: r.side === 'long' ? 'CALLS' : 'PUTS',
        contract: p ? `${r.symbol} ${p.strike}${p.type === 'call' ? 'C' : 'P'} ${p.expiry.slice(5)}` : '—',
        mid: p ? `ask ${px(p.ask)}` : '—', midAge: `read at trigger ${r.triggerEt}`,
        stop: `${r.levelName} ${px(r.level)}`, targets: 'see setup', left: `${shortLeft(Math.max(0, ACT_CFG.SNIPER_FRESH_MIN - since))} to enter`,
        target: `zs-${domId(sniperKey(r))}`,
      });
    }
  }
  return out.sort((x, y) => x.a.rank - y.a.rank);
}

/** The whole desk. `dense` = inside a dashboard tile. */
export function ZeroDteDesk({ dense = false }: { dense?: boolean }) {
  const q = useZeroDteDesk();
  const fq = useFlowIgnition();
  const sq = useSniper();
  const now = useZdNow(15_000);
  const [prefs, setPrefs] = usePrefs();
  const d = q.data;
  const nowItems = useMemo(() => (d ? buildNow(d, fq.data, sq.data, now, prefs.filter) : []), [d, fq.data, sq.data, now, prefs.filter]);
  const doneCount = useMemo(() => {
    if (!d) return 0;
    const ctx = { nowMs: now, phaseId: d.phase.id, entriesOpen: d.phase.entriesOpen };
    const fc = fq.data?.lastCycle ?? null;
    return (d.ideas ?? []).filter((x) => isDoneLike(ideaAct(x, d, now).state)).length
      + (fq.data?.rows ?? []).filter((r) => isDoneLike(flowAct(r, fc, d.phase, now).state)).length
      + sniperRowsOf(sq.data).rows.filter((r) => { const st = sniperActionability({ status: r.status, triggerAt: r.triggerAt, contracts: r.contracts.length }, ctx).state; return isDoneLike(st) || st === 'passed'; }).length;
  }, [d, fq.data, sq.data, now]);
  if (q.isError && !d) return <QEError title="The 0DTE desk didn't load" message={reasonOf(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} className="fd-m" />;
  // Pending (incl. a paused / not-yet-started fetch), never `q.data!` on undefined.
  if (!d) return <QELoading rows={6} label="reading chains, levels and the tape…" className="fd-pad" />;
  const rows = d.rows.filter((r) => prefs.filter === 'all' || prefs.filter === 'flow' || (prefs.filter === 'index' ? isIndexSymbol(r.symbol) : !isIndexSymbol(r.symbol)));
  return (
    <div className={`zd ${dense ? 'zd-dense' : ''}`}>
      <SessionBanner phase={d.phase} indexEngine={d.indexEngine} />
      <FilterBar filter={prefs.filter} hideDone={prefs.hideDone} doneCount={doneCount}
        onFilter={(f) => setPrefs((p) => ({ ...p, filter: f }))} onHideDone={(v) => setPrefs((p) => ({ ...p, hideDone: v }))} />
      <NowStrip items={nowItems} phase={d.phase} now={now} />
      <ZeroDteIdeas d={d} nowMs={now} filter={prefs.filter} hideDone={prefs.hideDone} />
      <FlowIgnitionSection q={fq} phase={d.phase} now={now} filter={prefs.filter} hideDone={prefs.hideDone} />
      <SniperSection q={sq} phase={d.phase} now={now} filter={prefs.filter} hideDone={prefs.hideDone} />
      <h3 className="zd-divider">Context — levels, walls, sectors, swings, record</h3>
      <WallsStrip />
      <section className="zd-section zd-si-host" aria-label="Sector ignition, intraday">
        <h4><Waves size={13} aria-hidden /> Sector ignition — intraday</h4>
        <details className="zd-how"><summary>How sector ignition feeds the desk</summary>
          <p className="zd-note">Groups igniting since the open (VWAP breadth, ETF vs SPY, ORB breadth, 30-min flow cluster, pre-market gap). Igniting groups feed the ideas list above as WATCH (ETF or best laggard, same contract picker); logged only when the trigger prints. Measuring.</p>
        </details>
        <SectorIgnitionPanel horizons={['intraday']} dense />
      </section>
      {d.rows.length === 0
        ? <QEEmpty title="No tracked names" message="The 0DTE watchlist is empty, so there are no index names to read." />
        : rows.length === 0
          ? <p className="zd-note">No tracked name in this lane ({d.rows.map((r) => r.symbol).join(', ')}).</p>
          : <div className="zd-cards">{rows.map((r) => <NameCard key={r.symbol} r={r} now={now} />)}</div>}
      <SwingTable rows={d.rows} />
      <RecordBlock rec={d.record} />
      <footer className="zd-prov">
        <p><Gauge size={12} aria-hidden /> {d.provenance}</p>
        {d.notes.map((n, i) => <p key={i}>{n}</p>)}
        <p><Timer size={12} aria-hidden /> Desk built {etTime(d.asOf)} ({ageIso(d.asOf, now)}); refreshes every minute.</p>
      </footer>
    </div>
  );
}

/** Dashboard tool `nexus-0dte`. */
export function ZeroDteTool() {
  const q = useZeroDteDesk();
  useToolReport({
    asOf: q.data ? q.data.asOf : q.isError ? null : undefined,
    source: '0DTE desk · /api/zero-dte/desk',
    note: q.isError ? (q.data ? 'refresh failed' : 'unavailable') : q.data ? `${q.data.phase.label} · ${q.data.rows.length} names` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  return <div className="zd-tool-body"><ZeroDteDesk dense /></div>;
}

/** NEXUS view wrapper (full width, scrolls with the page). */
export default function ZeroDteView() {
  return (
    <div className="zd-view">
      <h2 className="zd-view-head"><Crosshair size={14} aria-hidden /> 0DTE desk</h2>
      <ZeroDteDesk />
    </div>
  );
}
