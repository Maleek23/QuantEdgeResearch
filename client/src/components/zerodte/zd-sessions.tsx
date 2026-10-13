/**
 * 0DTE DESK — results and PAST SESSIONS straight from the DB.
 *
 * Operator 2026-10-13: "0DTE desk isn't tracking or keeping plays, I can't go
 * back and analyze". Every 0DTE play of any ET day comes from its trade_ideas
 * row (GET /api/zero-dte/sessions, shared/journal-integrity.ts toPlay): the
 * same row the journal scores — so "Today's results" can no longer say "stop"
 * while the DB says "missed entry" (AMZN 2026-10-07).
 *
 * Per play: contract (or "contract not recorded"), fired time, entry, T1/T2/stop
 * on premium, peak + time, exit + time, outcome, why it fired, and a replay of
 * the contract's 1-minute premium path (GET /api/zero-dte/replay/:id).
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ResultModel } from './zd-trade-card';
import '@/components/integrity/integrity.css';

export interface ZdPlay {
  id: string; symbol: string; source: string; side: 'CALLS' | 'PUTS' | null; contract: string | null; contractNote: string | null;
  firedAt: string; firedEt: string | null; entryPremium: number | null;
  plan: { t1: number | null; t2: number | null; stop: number | null; basis: string } | null;
  underlying: { entry: number | null; t1: number | null; stop: number | null };
  peak: { premium: number; at: string | null; basis: string } | null;
  exit: { premium: number | null; at: string | null; atEt: string | null; pct: number | null; basis: string } | null;
  outcome: { status: string; label: string; tone: 'win' | 'loss' | 'flat' | 'open'; reason: string | null };
  why: string | null; gaps: string[];
}
interface SessionPayload { date: string; asOf: string; plays: ZdPlay[]; days: string[]; source: string }
interface ReplayPayload {
  id: string; contract: string | null; entryMs?: number; exitMs?: number | null; entryPremium?: number | null; exitPremium?: number | null;
  plan?: { entry: number; t1: number; t2: number | null; stop: number; mapping: string } | null;
  bars: Array<{ t: number; o: number; h: number; l: number; c: number }>; note: string; source?: string; asOf?: string;
}

export const etTodayKey = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const $ = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`);
const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');

const getJson = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function useZdSession(date: string) {
  return useQuery<SessionPayload>({
    queryKey: ['/api/zero-dte/sessions', date],
    queryFn: () => getJson(`/api/zero-dte/sessions?date=${encodeURIComponent(date)}`),
    staleTime: 30_000,
    refetchInterval: date === etTodayKey() ? 60_000 : false,
  });
}

/** Today's results from the DB rows: every resolved or never-entered play. */
export function playsToResults(plays: ZdPlay[]): ResultModel[] {
  return plays.filter((p) => p.outcome.status !== 'open' || p.outcome.label === 'not entered').map((p) => ({
    key: `db-${p.id}`,
    symbol: p.symbol,
    ideaId: p.id,
    state: p.outcome.label === 'not entered' ? 'not_entered' : p.outcome.status,
    // resultChip reads the reason: give it the plain outcome word so "missed entry" never shows as a stop.
    reason: p.outcome.label === 'not entered' ? 'not entered' : p.outcome.status === 'hit_target' ? 'target' : p.outcome.status === 'hit_stop' ? 'stop' : p.outcome.status === 'expired' ? 'time stop' : p.outcome.label,
    at: p.exit?.atEt ?? null,
    contract: p.contract ?? `${p.symbol} — contract not recorded`,
    side: p.side ?? 'CALLS',
    entryMid: p.entryPremium,
    exitMid: p.exit?.premium ?? null,
    peakPrem: p.peak?.premium ?? null,
  }));
}

/** The contract's premium path with the plan drawn on it. */
export function PremiumReplay({ id }: { id: string }) {
  const q = useQuery<ReplayPayload>({ queryKey: ['/api/zero-dte/replay', id], queryFn: () => getJson(`/api/zero-dte/replay/${encodeURIComponent(id)}`), staleTime: 5 * 60_000 });
  if (q.isError) return <div className="ix-replay ix-gap">Replay failed: {(q.error as Error).message}</div>;
  if (!q.data) return <div className="ix-replay ix-src">Loading the contract's 1-minute premium path…</div>;
  const d = q.data;
  if (!d.bars.length) return <div className="ix-replay ix-src">{d.note}</div>;
  const W = 640, H = 180, P = 28;
  const bars = d.bars;
  const levels = [d.plan?.t1, d.plan?.t2, d.plan?.stop, d.entryPremium, d.exitPremium].filter((x): x is number => x != null && Number.isFinite(x));
  const lo = Math.min(...bars.map((b) => b.l), ...levels), hi = Math.max(...bars.map((b) => b.h), ...levels);
  const t0 = bars[0].t, t1 = bars[bars.length - 1].t;
  const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 2 * P);
  const path = bars.map((b, i) => `${i ? 'L' : 'M'}${x(b.t).toFixed(1)},${y(b.c).toFixed(1)}`).join(' ');
  const line = (v: number | null | undefined, label: string, cls: string) => v == null ? null : (
    <g key={label}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} className={cls} strokeDasharray="4 3" stroke="currentColor" strokeWidth={1} /><text x={W - P + 2} y={y(v) + 3} fontSize={9} fill="currentColor" className={cls}>{label} {v.toFixed(2)}</text></g>
  );
  const peak = bars.reduce((m, b) => (b.h > m.h ? b : m), bars[0]);
  return (
    <div className="ix-replay">
      <svg viewBox={`0 0 ${W + 40} ${H}`} role="img" aria-label={`${d.contract} premium path`}>
        <path d={path} fill="none" stroke="var(--cyan,#3b8cff)" strokeWidth={1.4} />
        {line(d.plan?.t2, 'T2', 'ix-win')}{line(d.plan?.t1, 'T1', 'ix-win')}{line(d.entryPremium, 'entry', 'ix-flat')}{line(d.plan?.stop, 'stop', 'ix-loss')}
        {d.entryMs != null && d.entryMs >= t0 && <line x1={x(d.entryMs)} x2={x(d.entryMs)} y1={P} y2={H - P} stroke="currentColor" className="ix-flat" strokeWidth={1} />}
        {d.exitMs != null && d.exitMs >= t0 && d.exitMs <= t1 && <line x1={x(d.exitMs)} x2={x(d.exitMs)} y1={P} y2={H - P} stroke="currentColor" className="ix-loss" strokeWidth={1} />}
        <circle cx={x(peak.t)} cy={y(peak.h)} r={3} fill="var(--green,#6ee7b7)" />
        <text x={x(peak.t) + 4} y={y(peak.h) - 4} fontSize={9} fill="var(--green,#6ee7b7)">peak {peak.h.toFixed(2)} {hm(new Date(peak.t).toISOString())}</text>
      </svg>
      <span className="ix-src">{d.contract} · {d.note}{d.plan ? ` · plan: ${d.plan.mapping}` : ''} · read {hm(d.asOf ?? null)} ET</span>
    </div>
  );
}

function PlayRow({ p }: { p: ZdPlay }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <td>{p.firedEt ?? '—'}</td>
        <td>{p.contract ?? <span className="ix-gap">{p.symbol} — contract not recorded</span>}<br /><small className="ix-src">{p.source}</small></td>
        <td className="num">{$(p.entryPremium)}</td>
        <td className="num" title={p.plan?.basis}>{p.plan ? `${$(p.plan.t1)}${p.plan.t2 != null ? ` / ${$(p.plan.t2)}` : ''}` : '—'}</td>
        <td className="num" title={p.plan?.basis}>{$(p.plan?.stop)}</td>
        <td className="num" title={p.peak?.basis}>{p.peak ? `${$(p.peak.premium)} ${hm(p.peak.at)}` : '—'}</td>
        <td className="num" title={p.exit?.basis}>{p.exit ? `${$(p.exit.premium)} ${p.exit.atEt ?? ''}` : '—'}{p.exit?.pct != null && <small className={p.exit.pct >= 0 ? ' ix-win' : ' ix-loss'}> {p.exit.pct >= 0 ? '+' : ''}{p.exit.pct.toFixed(0)}%</small>}</td>
        <td className={`ix-${p.outcome.tone}`} title={p.outcome.reason ?? undefined}>{p.outcome.label}</td>
        <td className="ix-why">{p.why ?? '—'}{p.gaps.map((g) => <div key={g} className="ix-gap">{g}</div>)}</td>
        <td>{p.contract ? <button type="button" className="zc-btn zc-btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Replay'}</button> : null}</td>
      </tr>
      {open && <tr><td colSpan={10}><PremiumReplay id={p.id} /></td></tr>}
    </>
  );
}

/** "Past sessions": every 0DTE play for any date, from the DB. */
export function PastSessions() {
  const [date, setDate] = useState(etTodayKey());
  const q = useZdSession(date);
  const days = q.data?.days ?? [];
  return (
    <div className="ix-hist">
      <div className="ix-bar">
        <label>Session (ET) <input type="date" value={date} max={etTodayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        {days.slice(0, 10).map((d) => <button key={d} type="button" aria-pressed={d === date} onClick={() => setDate(d)}>{d.slice(5)}</button>)}
      </div>
      {q.isError && <p className="ix-gap">Sessions didn't load: {(q.error as Error).message}</p>}
      {!q.data && !q.isError && <p className="ix-src">Reading {date} from the DB…</p>}
      {q.data && (q.data.plays.length === 0
        ? <p className="ix-src">No 0DTE plays were published on {date}.</p>
        : (
          <div className="ix-table-wrap">
            <table className="ix-table">
              <thead><tr><th>Fired</th><th>Contract</th><th>Entry</th><th>T1 / T2</th><th>Stop</th><th>Peak</th><th>Exit</th><th>Outcome</th><th>Why fired</th><th /></tr></thead>
              <tbody>{q.data.plays.map((p) => <PlayRow key={p.id} p={p} />)}</tbody>
            </table>
          </div>
        ))}
      {q.data && <span className="ix-src">{q.data.plays.length} plays · {q.data.source} · read {hm(q.data.asOf)} ET · premium levels: stored plan at publish, else mapped from the publish levels (hover)</span>}
    </div>
  );
}
