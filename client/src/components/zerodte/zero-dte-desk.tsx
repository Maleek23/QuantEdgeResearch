/**
 * 0DTE DESK — the NEXUS "0DTE" view and the `nexus-0dte` dashboard tool.
 *
 * Built around ONE question (operator 2026-10-07: "0DTE page is so confusing"):
 * what can I trade right now?
 *   1. HEADER — session, countdown, index-engine health dot.
 *   2. TRADE NOW — live / armed cards across desk ideas, flow ignition and the
 *      sniper, plus entered trades still running (zd-trade-card.tsx): contract,
 *      side, entry, stop / T1 / T2 on premium AND underlying, live contract mark
 *      + live underlying (source + age, "delayed Nm"), progress to T1, time
 *      left, grade, Details → the NEXUS Setup Detail (zd-setup-detail.tsx).
 *   3. TODAY'S RESULTS — done trades greyed, ✓ T1 / ✕ stop / time exit (+ peak hook).
 *   4. Everything else folded and closed by default: forming setups, SPX levels,
 *      names in play (auto list: open / today's 0DTE ideas + flow triggers) and
 *      any-ticker lookup (GET /api/zero-dte/read/:symbol), flow ignition, sniper,
 *      walls, sector ignition, swings, record.
 *
 * Reads GET /api/zero-dte/desk, /api/zero-dte/flow, /api/zero-dte/sniper once a minute.
 * Integrity: every number is either live (stamped) or labelled as a past value.
 */
import { Term } from '@/components/onboarding/term';
import { AnalyzeWithQuantinum } from '@/components/quantinum/analyze-with-quantinum';
import { reasonOf } from '@/lib/optimistic';
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { WatchStar } from '@/components/watch/watch-star';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link } from 'wouter';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { Activity, Clock3, Crosshair, Gauge, History, Timer, Waves, Zap } from 'lucide-react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useToolReport } from '@/components/dashboard/frame';
import { ZeroDteIdeas, ActBadge, ideaAct, ideaInFilter, minsTo, type DeskIdea, type IdeasInfo } from './zero-dte-ideas';
import { TradeCard, ResultRow, type CardModel, type ResultModel } from './zd-trade-card';
import { bigContract, resultChip } from '@shared/zero-dte-trade-card';
import { engineStampLabel, type AutoName } from '@shared/zero-dte-names';
import { useQuotes, type Quote } from '@/components/ticker/ticker-data';
import { TerminalTickerSearch } from '@/components/terminal/terminal-ticker-search';
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
  /** Names with an open / today's short-dated idea or a flow trigger today (shared/zero-dte-names.ts). */
  activeNames?: AutoName[];
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

/* ── slim header: session · countdown · index engine health dot ── */
function ZdHeader({ phase, indexEngine }: { phase: Phase; indexEngine: DeskPayload['indexEngine'] }) {
  const now = useZdNow(1000);
  const b = sessionBanner(now, phase.id);
  const h = indexHealth(indexEngine ?? null, now, phase.id);
  const sub = b.id === 'pre' ? 'Pre-market · entries from 09:31 (open drive) / 09:45'
    : b.id === 'closed' ? 'Session closed — next open 09:30 ET'
    : phase.entriesOpen ? 'Entries open' : b.next === 'entries open 09:45' ? 'Open drive only until 09:45' : 'No new entries — manage open trades';
  return (
    <header className={`zd-head zd-head-${b.id}`} aria-label="Session">
      <div className="zd-head-l">
        <Clock3 size={15} aria-hidden />
        <strong>{b.label}</strong>
        <span className="zd-mono">{etClockS(now)} ET</span>
      </div>
      <div className="zd-head-m" role="timer" aria-live="off">
        {b.next ? <>{b.next} in <strong className="zd-mono">{fmtCountdown(b.secondsLeft)}</strong></> : 'No session'}
      </div>
      <span className={`zd-engine zd-engine-${h.tone}`} title={`Index engine (SPY gamma → SPX ideas): ${h.text}`} aria-label={`Index engine ${h.tone === 'ok' ? 'healthy' : h.tone === 'warn' ? 'lagging' : h.tone === 'blind' ? 'blind' : 'idle'}: ${h.text}`}>
        <i aria-hidden /> <Term k="engine-blind">Index engine</Term> {h.tone === 'ok' ? 'OK' : h.tone === 'warn' ? 'lagging' : h.tone === 'blind' ? 'blind' : 'idle'}
      </span>
      <p className="zd-head-sub">{sub}</p>
    </header>
  );
}

/* ── folds: everything that is not "trade now" is one tap away, closed by default ── */
function Fold({ title, hint, count, children, id }: { title: string; hint?: string; count?: number | string | null; children: ReactNode; id?: string }) {
  return (
    <details className="zd-fold" id={id}>
      <summary><span className="zd-fold-t">{title}</span>{count != null && count !== '' && <span className="zd-fold-n">{count}</span>}{hint && <span className="zd-fold-h">{hint}</span>}</summary>
      <div className="zd-fold-body">{children}</div>
    </details>
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

function NameCard({ r, now, phaseId }: { r: Row; now: number; phaseId: string }) {
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
        <span className="zd-foot" title={r.owner}>{engineStampLabel(phaseId, r.engine.evaluatedAgeSec, now)}</span>
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
  /** Peak contract mark so far — filled by the runners tracker when it lands (hook). */
  peakPremium?: number | null;
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

/* ── NOW cards + today's results (shared/zero-dte-trade-card.ts) ── */
const hhmmIn = (s: string | null | undefined) => (s ? /(\d{1,2}:\d{2})/.exec(s)?.[1] ?? null : null);
const etDayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const minsLeft = (m: number | null) => (m == null ? null : m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`);
const prem2 = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && a !== b ? Math.abs(a - b) : null);

function ideaCard(x: DeskIdea, a: ActState, now: number): CardModel | null {
  const running = x.stage === 'in_play' && x.logged;
  if (!a.actionable && !running) return null;
  const c = x.contract; const q = x.quote;
  const markV = q?.mid != null ? { value: q.mid, at: q.at, source: q.source } : null;
  const entryIsLogged = x.loggedPremium != null;
  const entryMid = entryIsLogged ? x.loggedPremium : q?.mid ?? null;
  const day = etDayKey(now);
  const root = c ? (c.root === 'SPXW' ? 'SPX' : c.root) : x.symbol;
  const risk = prem2(entryMid, c?.premiumStop); const reward = prem2(c?.premiumT1, entryMid);
  return {
    key: `i-${x.key}`, lane: 'idea', a, running, symbol: x.symbol, underlying: x.logged ? x.vehicle : x.symbol,
    contract: c ? bigContract(root, { strike: c.strike, optionType: c.optionType, dte: c.dte, expiry: c.expiry }, day) : `${x.symbol} ${x.expiryLabel}`,
    side: x.side, direction: x.direction, trigger: x.trigger,
    entryMid, entryMidNote: entryIsLogged ? `filled ${new Date(x.at).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })}` : 'live mid now',
    // A not-yet-entered card's entry IS the live mid: one number, not two.
    mark: entryIsLogged ? markV : null,
    stopPrem: c?.premiumStop ?? null, stopUnd: x.stop, t1Prem: c?.premiumT1 ?? null, t1Und: x.target.price,
    t2Prem: c?.premiumT2 ?? null, t2Und: x.target2?.price ?? null,
    rr: risk && reward ? reward / risk : x.rr,
    timeLeft: running ? (minsTo(x.exitBy, now) != null ? `${minsLeft(minsTo(x.exitBy, now))} to exit` : null) : a.state === 'live' ? (minsTo(x.entryBy, now) != null ? `${minsLeft(minsTo(x.entryBy, now))} to enter` : null) : x.distPct != null ? `${x.distPct.toFixed(2)}% from trigger` : null,
    grade: x.grade, gradeWhy: x.gradeWhy.length ? `Structure grade (not a win probability): ${x.gradeWhy.join(' · ')}` : null,
    ideaId: x.ideaId, peakPrem: x.peakPremium ?? null,
  };
}

function flowCard(r: FlowRowW, a: ActState, c: FlowCycleW | null, now: number): CardModel | null {
  const running = r.state === 'fired' && r.published && !a.actionable;
  if ((!a.actionable && !running) || !r.plan) return null;
  const p = r.plan;
  const markV = r.lastMid != null ? { value: r.lastMid, at: r.lastMarkAt, source: r.contract?.source ?? null } : null;
  const since = Math.round((now - Date.parse(r.at)) / 60_000);
  return {
    key: `f-${r.id}`, lane: 'flow', a, running, symbol: r.symbol, underlying: r.symbol,
    contract: r.contract ? bigContract(r.symbol, { strike: r.contract.strike, type: r.contract.type, dte: r.contract.dte }) : r.symbol,
    side: r.side === 'long' ? 'CALLS' : 'PUTS', direction: r.side, trigger: null,
    entryMid: p.entryPremium, entryMidNote: `mid at ${r.atEt}`,
    mark: markV ?? (r.contract?.mid != null ? { value: r.contract.mid, at: c ? new Date(Date.parse(c.at) - (r.contract.quoteAgeS ?? 0) * 1000).toISOString() : null, source: r.contract.source } : null),
    stopPrem: p.stopPremium, stopUnd: p.stopUnderlying, t1Prem: p.t1Premium, t1Und: p.t1Underlying, t2Prem: p.t2Premium, t2Und: p.t2Underlying,
    rr: p.entryPremium > p.stopPremium ? (p.t1Premium - p.entryPremium) / (p.entryPremium - p.stopPremium) : null,
    timeLeft: running ? 'out by 15:30' : `${minsLeft(Math.max(0, ACT_CFG.FLOW_FRESH_MIN - since))} to enter`,
    grade: null, gradeWhy: null, ideaId: r.ideaId, peakPrem: r.peakPremium ?? null,
  };
}

function sniperCard(r: SniperRow, a: ActState, now: number): CardModel | null {
  if (!a.actionable) return null;
  const p = r.contracts[0];
  const since = Math.round((now - Date.parse(r.triggerAt)) / 60_000);
  return {
    key: `s-${sniperKey(r)}`, lane: 'sniper', a, running: false, symbol: r.symbol, underlying: r.symbol,
    contract: p ? bigContract(r.symbol, { strike: p.strike, type: p.type, expiry: p.expiry }, etDayKey(now)) : r.symbol,
    side: r.side === 'long' ? 'CALLS' : 'PUTS', direction: r.side, trigger: { name: r.levelName, price: r.level },
    entryMid: p?.ask ?? null, entryMidNote: `ask at ${r.triggerEt}`, mark: null,
    stopPrem: null, stopUnd: r.level, t1Prem: null, t1Und: null, t2Prem: null, t2Und: null, rr: null,
    timeLeft: `${minsLeft(Math.max(0, ACT_CFG.SNIPER_FRESH_MIN - since))} to enter`,
    grade: null, gradeWhy: null, ideaId: r.ideaId,
  };
}

function buildCards(d: DeskPayload, flow: FlowStateW | undefined, sn: SniperState | undefined, now: number): CardModel[] {
  const out: CardModel[] = [];
  for (const x of d.ideas ?? []) { const m = ideaCard(x, ideaAct(x, d, now), now); if (m) out.push(m); }
  const fc = flow?.lastCycle ?? null;
  for (const r of flow?.rows ?? []) { const m = flowCard(r, flowAct(r, fc, d.phase, now), fc, now); if (m) out.push(m); }
  const ctx = { nowMs: now, phaseId: d.phase.id, entriesOpen: d.phase.entriesOpen };
  for (const r of sniperRowsOf(sn).rows) { const m = sniperCard(r, sniperActionability({ status: r.status, triggerAt: r.triggerAt, contracts: r.contracts.length }, ctx), now); if (m) out.push(m); }
  // actionable first (live → armed), then running trades
  return out.sort((x, y) => Number(x.running) - Number(y.running) || x.a.rank - y.a.rank);
}

function buildResults(d: DeskPayload, flow: FlowStateW | undefined, now: number): ResultModel[] {
  const out: ResultModel[] = [];
  const day = etDayKey(now);
  for (const x of d.ideas ?? []) {
    if (x.stage !== 'done' || !x.logged) continue;
    const a = ideaAct(x, d, now);
    const c = x.contract;
    out.push({
      key: `i-${x.key}`, symbol: x.symbol, ideaId: x.ideaId, state: a.state, reason: x.doneReason, at: hhmmIn(x.doneReason),
      contract: c ? bigContract(c.root === 'SPXW' ? 'SPX' : c.root, { strike: c.strike, optionType: c.optionType, dte: c.dte, expiry: c.expiry }, day) : x.symbol,
      side: x.side, entryMid: x.loggedPremium, exitMid: null, peakPrem: x.peakPremium ?? null,
    });
  }
  for (const r of flow?.rows ?? []) {
    if (r.state !== 'reached' && r.state !== 'faded') continue;
    if (!r.published) continue;
    out.push({
      key: `f-${r.id}`, symbol: r.symbol, ideaId: r.ideaId, state: r.state === 'reached' ? 'done_reached' : 'done_faded', reason: r.stateWhy, at: r.lastMarkAt ? new Date(r.lastMarkAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) : null,
      contract: r.contract ? bigContract(r.symbol, { strike: r.contract.strike, type: r.contract.type, dte: r.contract.dte }) : r.symbol,
      side: r.side === 'long' ? 'CALLS' : 'PUTS', entryMid: r.plan?.entryPremium ?? null, exitMid: r.lastMid, peakPrem: r.peakPremium ?? null,
    });
  }
  return out;
}

const ZdSetupDetail = lazy(() => import('./zd-setup-detail'));

function NowSection({ cards, quotes, phase, now, onDetails, forming }: { cards: CardModel[]; quotes: Record<string, Quote> | undefined; phase: Phase; now: number; onDetails: (m: { ideaId: string | null; symbol: string; contract: string }) => void; forming: number }) {
  const b = sessionBanner(now, phase.id);
  return (
    <section className="zd-now2" aria-label="What you can trade now">
      <h2 className="zd-h2"><Zap size={15} aria-hidden /> Trade now <span className="zd-h2-n">{cards.filter((c) => !c.running).length}</span></h2>
      {cards.length === 0
        ? (
          <div className="zd-now-empty2">
            <p><b>Nothing to trade right now.</b> {b.next ? `Next: ${b.next} (in ${fmtCountdown(b.secondsLeft)}).` : 'The session is closed.'}</p>
            {forming > 0 && <p>{forming} setup{forming === 1 ? ' is' : 's are'} forming — open “Forming setups” below to watch {forming === 1 ? 'it' : 'them'}.</p>}
          </div>
        )
        : <div className="zc-grid">{cards.map((m) => <TradeCard key={m.key} m={m} quote={quotes?.[m.underlying.toUpperCase()]} nowMs={now} onDetails={onDetails} />)}</div>}
    </section>
  );
}

function ResultsSection({ rows, onDetails }: { rows: ResultModel[]; onDetails: (r: ResultModel) => void }) {
  if (!rows.length) return null;
  const wins = rows.filter((r) => resultChip(r.state, r.reason).tone === 'win').length;
  const losses = rows.filter((r) => resultChip(r.state, r.reason).tone === 'loss').length;
  return (
    <section className="zd-results" aria-label="Today's results">
      <h2 className="zd-h2"><History size={15} aria-hidden /> Today's results <span className="zd-h2-n">{wins} ✓ · {losses} ✕</span></h2>
      <ul className="zc-results">{rows.map((r) => <ResultRow key={r.key} r={r} onDetails={onDetails} />)}</ul>
    </section>
  );
}

/* ── names: auto list (open / today's 0DTE ideas + flow triggers) and any-ticker lookup ── */
interface DeskRead { asOf: string; phase: Phase; row: Row }
function useDeskRead(sym: string | null) {
  return useQuery<DeskRead>({ queryKey: ['/api/zero-dte/read', sym], queryFn: () => getJson(`/api/zero-dte/read/${encodeURIComponent(sym!)}`), enabled: !!sym, staleTime: 30_000, refetchInterval: 60_000 });
}
function NameRead({ sym, phaseId, now }: { sym: string; phaseId: string; now: number }) {
  const q = useDeskRead(sym);
  if (q.isError && !q.data) return <QEError title={`${sym} read didn't load`} message={reasonOf(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data) return <QELoading rows={4} label={`reading ${sym} — chain, levels, tape…`} />;
  return <NameCard r={q.data.row} now={now} phaseId={phaseId} />;
}
function NamesPanel({ names, phaseId, now }: { names: AutoName[]; phaseId: string; now: number }) {
  const [sym, setSym] = useState<string | null>(null);
  const shown = sym ?? names[0]?.symbol ?? null;
  return (
    <div className="zd-names">
      <div className="zd-names-bar">
        <div className="zd-names-search"><TerminalTickerSearch value={shown ?? undefined} onSelect={(r) => setSym(r.symbol.toUpperCase())} compact /></div>
        {names.length > 0 && (
          <ul className="zd-names-list" aria-label="Names in play today">
            {names.map((n) => (
              <li key={n.symbol}><button type="button" aria-pressed={shown === n.symbol} className={shown === n.symbol ? 'on' : ''} onClick={() => setSym(n.symbol)} title={n.why}>
                <b>{n.symbol}</b><small>{n.why}</small>
              </button></li>
            ))}
          </ul>
        )}
      </div>
      {shown ? <NameRead key={shown} sym={shown} phaseId={phaseId} now={now} /> : <p className="zd-note">No 0DTE ideas or flow triggers yet today. Search any ticker above to read its same-day / nearest-expiry levels.</p>}
    </div>
  );
}

/** The whole desk. `dense` = inside a dashboard tile. */
export function ZeroDteDesk({ dense = false }: { dense?: boolean }) {
  const q = useZeroDteDesk();
  const fq = useFlowIgnition();
  const sq = useSniper();
  const now = useZdNow(15_000);
  const d = q.data;
  const [detail, setDetail] = useState<{ ideaId: string; symbol: string; contract: string } | null>(null);
  const cards = useMemo(() => (d ? buildCards(d, fq.data, sq.data, now) : []), [d, fq.data, sq.data, now]);
  const results = useMemo(() => (d ? buildResults(d, fq.data, now) : []), [d, fq.data, now]);
  const quotes = useQuotes(cards.map((c) => c.underlying));
  if (q.isError && !d) return <QEError title="The 0DTE desk didn't load" message={reasonOf(q.error)} onRetry={() => q.refetch()} retrying={q.isFetching} className="fd-m" />;
  if (!d) return <QELoading rows={6} label="reading chains, levels and the tape…" className="fd-pad" />;
  const forming = (d.ideas ?? []).filter((x) => ideaAct(x, d, now).state === 'watch').length;
  const indexRows = d.rows.filter((r) => isIndexSymbol(r.symbol));
  const openDetails = (m: { ideaId: string | null; symbol: string; contract: string }) => { if (m.ideaId) setDetail({ ideaId: m.ideaId, symbol: m.symbol, contract: m.contract }); };
  const flowN = fq.data?.rows?.length ?? 0;
  const sniperN = sniperRowsOf(sq.data).rows.length;
  return (
    <div className={`zd zd2 ${dense ? 'zd-dense' : ''}`}>
      <ZdHeader phase={d.phase} indexEngine={d.indexEngine} />
      <NowSection cards={cards} quotes={quotes.data} phase={d.phase} now={now} onDetails={openDetails} forming={forming} />
      <ResultsSection rows={results} onDetails={openDetails} />
      <h3 className="zd-divider">More — closed until you need it</h3>
      <Fold title="Forming setups and every 0DTE idea today" hint="not tradable until the trigger prints" count={(d.ideas ?? []).length}>
        <ZeroDteIdeas d={d} nowMs={now} />
      </Fold>
      <Fold title="SPX levels" hint="index card: walls, zero-gamma, expected move, VWAP" count={indexRows.map((r) => r.symbol).join(' · ')}>
        {indexRows.length ? <div className="zd-cards">{indexRows.map((r) => <NameCard key={r.symbol} r={r} now={now} phaseId={d.phase.id} />)}</div> : <p className="zd-note">No index name on the desk watch list.</p>}
      </Fold>
      <Fold title="Names in play and ticker lookup" hint="names with 0DTE ideas or flow today · search any ticker" count={d.activeNames?.length ?? 0}>
        <NamesPanel names={d.activeNames ?? []} phaseId={d.phase.id} now={now} />
      </Fold>
      <Fold title="Flow ignition triggers" hint="big opening option buying + price confirmation" count={flowN}>
        <FlowIgnitionSection q={fq} phase={d.phase} now={now} filter="all" hideDone={false} />
      </Fold>
      <Fold title="Sniper triggers" hint="classic intraday setups across the board" count={sniperN}>
        <SniperSection q={sq} phase={d.phase} now={now} filter="all" hideDone={false} />
      </Fold>
      <Fold title="Option walls" hint="where dealer positioning tends to stall price">
        <WallsStrip />
      </Fold>
      <Fold title="Sector ignition" hint="which groups are moving since the open">
        <SectorIgnitionPanel horizons={['intraday']} dense />
      </Fold>
      <Fold title="2–4 day swings" hint="model plans, unvalidated">
        <SwingTable rows={d.rows} />
      </Fold>
      <Fold title="Track record and how it works" hint="this engine only">
        <RecordBlock rec={d.record} />
        {d.phase.looksFor.length > 0 && <ul className="zd-looks">{d.phase.looksFor.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        <footer className="zd-prov">
          <p><Gauge size={12} aria-hidden /> {d.provenance}</p>
          {d.notes.map((n, i) => <p key={i}>{n}</p>)}
          <p><Timer size={12} aria-hidden /> Desk built {etTime(d.asOf)} ({ageIso(d.asOf, now)}); refreshes every minute.</p>
        </footer>
      </Fold>
      {detail && (
        <Suspense fallback={null}>
          <ZdSetupDetail ideaId={detail.ideaId} symbol={detail.symbol} title={detail.contract} onClose={() => setDetail(null)} />
        </Suspense>
      )}
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
