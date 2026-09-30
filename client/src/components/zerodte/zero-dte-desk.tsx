/**
 * 0DTE DESK — the NEXUS "0DTE" view and the `nexus-0dte` dashboard tool.
 *
 * One read (GET /api/zero-dte/desk, server/zero-dte-desk.ts) per minute:
 *   • the session clock — open drive / midday / power hour — and what the
 *     engine looks for in the phase it is in;
 *   • 0DTE IDEAS first (zero-dte-ideas.tsx): WATCH → TRIGGERED → IN PLAY → DONE,
 *     each with its exact contract, live premium, trigger, stop, targets, deadline;
 *   • per tracked name (ZERO_DTE_WATCH, default SPX · MSTR · META · BE · TSLA):
 *     spot, today's expected move (ATM straddle of the nearest expiry, IV
 *     fallback), same-day-expiry GEX levels, VWAP / opening-range state, the
 *     flow tide on that expiry, and the engine's state in plain words;
 *   • short swings (2–4 days): the model plan per name, T1 ≤ 1σ, time stop;
 *   • this engine's honest record since 2026-08-26 with n, flagged LOW N.
 *
 * Integrity: every block stamps its own age; a missing input renders "—",
 * never a placeholder number. Plans are model output, labelled unvalidated.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { Clock3, Crosshair, Gauge, History, Timer, Waves } from 'lucide-react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useToolReport } from '@/components/dashboard/frame';
import { ZeroDteIdeas, type DeskIdea, type IdeasInfo } from './zero-dte-ideas';
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
export interface DeskPayload { asOf: string; watch: string[]; phase: Phase; rows: Row[]; ideas: DeskIdea[]; ideasInfo: IdeasInfo; record: DeskRec; provenance: string; notes: string[] }

export function useZeroDteDesk() {
  return useQuery<DeskPayload>({
    queryKey: ['/api/zero-dte/desk'],
    queryFn: async () => {
      const r = await fetch('/api/zero-dte/desk', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
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
const ageIso = (iso: string | null | undefined) => (iso ? age(Math.round((Date.now() - Date.parse(iso)) / 1000)) : 'age —');
const etTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ET' : '—');
const etClock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} ET`;
const sideCls = (s: string | null | undefined) => (s === 'long' ? 'zd-up' : s === 'short' ? 'zd-dn' : 'zd-flat');

const STATE_LABEL: { [k: string]: string } = { no_setup: 'No setup', armed: 'Setup armed', triggered: 'Triggered', in_trade: 'In trade', exited: 'Exited', closed: 'Closed' };

/* ── pieces ── */
function SessionClock({ phase }: { phase: Phase }) {
  const steps = [
    { id: 'open_drive', label: 'Open drive', w: '09:30–10:00' },
    { id: 'midday', label: 'Midday', w: '10:00–15:00' },
    { id: 'power_hour', label: 'Power hour', w: '15:00–16:00' },
  ];
  return (
    <section className="zd-clock" aria-label="Session clock">
      <div className="zd-clock-head">
        <Clock3 size={14} aria-hidden />
        <strong>{phase.label}</strong>
        <span className="zd-mono">{etClock(phase.etMin)}{phase.minutesToClose > 0 ? ` · ${phase.minutesToClose}m to close` : ''}{phase.nextAt ? ` · next ${phase.nextAt}` : ''}</span>
        <span className={`zd-chip ${phase.policies.A ? 'on' : ''}`} title="Policy A — negative-gamma continuation">A {phase.policies.A ? 'open' : 'off'}</span>
        <span className={`zd-chip ${phase.policies.B ? 'on' : ''}`} title="Policy B — positive-gamma wall fade / power-hour pin">B {phase.policies.B ? 'open' : 'off'}</span>
        <span className={`zd-chip ${phase.entriesOpen ? 'on' : ''}`}>{phase.entriesOpen ? 'entries open' : 'no new entries'}</span>
      </div>
      <ol className="zd-phases">
        {steps.map((s) => <li key={s.id} className={phase.id === s.id ? 'now' : ''}><b>{s.label}</b><span>{s.w}</span></li>)}
      </ol>
      <ul className="zd-looks">{phase.looksFor.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </section>
  );
}

function Kv({ k, v, cls, title, href }: { k: string; v: string; cls?: string; title?: string; href?: string }) {
  // A level with a value is a handle: it opens the GEX workspace focused on this name.
  if (href && v !== '—') return <Link href={href} className="zd-kv zd-kv-link" title={title ?? `${k} — open GEX focused on this name`}><span>{k}</span><strong className={cls}>{v}</strong></Link>;
  return <div className="zd-kv" title={title}><span>{k}</span><strong className={cls}>{v}</strong></div>;
}

const tickerHref = (sym: string) => `/r/${encodeURIComponent(sym)}`;
const gexHref = (sym: string) => `/r/${encodeURIComponent(sym)}?tab=gex`;

function NameCard({ r }: { r: Row }) {
  const L = r.levels; const em = r.expectedMove; const f = r.flow; const i = r.intraday;
  return (
    <article className="zd-card" aria-label={`${r.symbol} 0DTE`}>
      <header className="zd-card-head">
        <div>
          <h3><Link href={tickerHref(r.symbol)} className="zd-sym-link" title={`Open the ${r.symbol} ticker page`}>{r.symbol}</Link>{r.optionRoot !== r.symbol && <small> · {r.optionRoot}</small>}</h3>
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
        <Kv k="Max-γ" v={px(L?.maxGamma)} href={gexHref(r.symbol)} />
        <Kv k="Regime" v={L ? `${L.regimeTitle}${L.nearFlip ? ' · near flip' : ''}` : '—'} cls={L?.regime === 'negative' ? 'zd-dn' : L?.regime === 'positive' ? 'zd-up' : undefined} title={L?.basis} href={gexHref(r.symbol)} />
        <Kv k="VWAP" v={i.vwap != null ? `${px(i.vwap)} · ${i.vwapSide ?? '—'}` : '—'} title={r.intradayNote ?? undefined} />
        <Kv k="Opening range" v={i.orbState === 'n/a' ? '—' : `${i.orbState}${i.or30High != null ? ` · ${px(i.or30Low)}–${px(i.or30High)}` : ''}`} />
        <Kv k="Flow tide (exp.)" v={f.prints ? `${f.lean ?? '—'} · C ${usdK(f.callPremium)} / P ${usdK(f.putPremium)}` : 'no prints'} cls={sideCls(f.lean)} title={f.basis} />
        <Kv k="Day net premium" v={f.dayLean ? `${f.dayLean} · ${usdK((f.dayCallsNet ?? 0) - (f.dayPutsNet ?? 0))}` : '—'} cls={sideCls(f.dayLean)} />
      </div>
      <p className="zd-note">
        {L ? `Levels: ${L.expiry} expiry only (${L.contracts} contracts, ${Math.round(L.modelledGrossShare * 100)}% of gross γ modelled)` : 'No single-expiry GEX read'}{r.levelsNote && L ? ` · ${r.levelsNote}` : ''} · bars {age(r.barsAgeSec)} · flow {ageIso(f.asOf)}
      </p>
      {r.todaysIdeas.length > 0 && (
        <ul className="zd-ideas">
          {r.todaysIdeas.map((x) => (
            <li key={x.id}><Link href={nexusIdeaHref({ ideaId: x.id, symbol: r.symbol })} className="zd-idea-link" title="Open this idea on NEXUS"><span className={sideCls(x.direction)}>{x.direction}</span> {x.kind === 'swing' ? 'swing' : '0DTE'} {x.contract ?? ''} · {px(x.entry)} → {px(x.target)} / stop {px(x.stop)} · <b>{x.outcomeStatus ?? 'open'}</b> · {etTime(x.timestamp)}</Link></li>
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
      <h4><Waves size={13} aria-hidden /> Short swings (2–4d)</h4>
      <p className="zd-note">Weekly-path model drift rule + all-book GEX regime + flow. T1 capped at 1σ of the horizon (loss rule 3); time stop at half the horizon unless ≥ 0.5R; contracts {rows[0]?.swing.dteWindow.label ?? '30–60 DTE'}. Unvalidated model plans — published at 10:30 / 14:30 ET when a plan exists.</p>
      <div className="zd-table-wrap">
        <table className="zd-table">
          <thead><tr><th>Name</th><th>Plan</th><th>Entry</th><th>Stop</th><th>T1 (≤1σ)</th><th>R:R</th><th>1σ · {rows[0]?.swing.holdDays ?? 3}d</th><th>Time stop</th><th>Why</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const s = r.swing;
              return (
                <tr key={r.symbol}>
                  <td><Link href={tickerHref(r.symbol)} className="zd-sym-link"><b>{r.symbol}</b></Link><small>{r.swingLevels ? ` ${r.swingLevels.regime} γ` : ''}</small></td>
                  <td className={s.verdict === 'plan' ? sideCls(s.direction) : 'zd-flat'}>{s.verdict === 'plan' ? s.direction : 'no plan'}</td>
                  <td>{px(s.entry)}</td>
                  <td>{px(s.stop)}</td>
                  <td>{px(s.target)}{s.capped && <small title={`structural ${px(s.structuralTarget)} kept as the T2 stretch`}> capped</small>}</td>
                  <td>{s.rr != null ? s.rr.toFixed(2) : '—'}</td>
                  <td>{s.sigmaH != null ? `±${px(s.sigmaH)}` : '—'}</td>
                  <td>{s.timeStopIso ? etTime(s.timeStopIso) : '—'}{s.exitByIso && <small> · out by {etTime(s.exitByIso)}</small>}</td>
                  <td className="zd-why">{(s.verdict === 'plan' ? s.basis.slice(1, 3) : s.wait.slice(0, 2)).join(' · ')}</td>
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

/** The whole desk. `dense` = inside a dashboard tile. */
export function ZeroDteDesk({ dense = false }: { dense?: boolean }) {
  const q = useZeroDteDesk();
  if (q.isError && !q.data) return <QEError title="The 0DTE desk didn't load" message={(q.error as Error)?.message} onRetry={() => q.refetch()} retrying={q.isFetching} className="fd-m" />;
  // Pending (incl. a paused / not-yet-started fetch), never `q.data!` on undefined.
  if (!q.data) return <QELoading rows={6} label="reading chains, levels and the tape…" className="fd-pad" />;
  const d = q.data;
  return (
    <div className={`zd ${dense ? 'zd-dense' : ''}`}>
      <ZeroDteIdeas d={d} />
      <SessionClock phase={d.phase} />
      {d.rows.length === 0
        ? <QEEmpty title="No tracked names" message="ZERO_DTE_WATCH resolved to no names." />
        : <div className="zd-cards">{d.rows.map((r) => <NameCard key={r.symbol} r={r} />)}</div>}
      <SwingTable rows={d.rows} />
      <RecordBlock rec={d.record} />
      <footer className="zd-prov">
        <p><Gauge size={12} aria-hidden /> {d.provenance}</p>
        {d.notes.map((n, i) => <p key={i}>{n}</p>)}
        <p><Timer size={12} aria-hidden /> Desk built {etTime(d.asOf)} ({ageIso(d.asOf)}); refreshes every minute.</p>
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
      <div className="zd-view-head"><Crosshair size={14} aria-hidden /> <strong>0DTE desk</strong><span>0DTE ideas · SPX · single names · 2–4 day swings · honest record</span></div>
      <ZeroDteDesk />
    </div>
  );
}
