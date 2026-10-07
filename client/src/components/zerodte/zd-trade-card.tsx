/**
 * 0DTE trade card (desk NOW section) and today's result row.
 *
 * One card answers "can I trade this, and at what?": the contract big
 * ("TSLA 380P 0DTE"), side, a plain-word state, entry (trigger + mid at entry),
 * stop / T1 / T2 on premium AND underlying, R:R, time left, grade, and a mini
 * ladder (stop · entry · T1 · T2) with the LIVE contract mark and the LIVE
 * underlying, each stamped with source + age ("delayed Nm" when delayed),
 * plus progress to T1. "Details" opens the NEXUS Setup Detail.
 *
 * Three type sizes only: --zc-xl (contract), --zc-md (numbers / body), --zc-sm (labels).
 */
import type { Quote } from '@/components/ticker/ticker-data';
import './zd-trade-card.css';
import { markStamp, progressToT1, resultChip, STATE_WORDS, type Mark } from '@shared/zero-dte-trade-card';
import type { ActState } from '@shared/zero-dte-actionability';

export interface CardModel {
  key: string;
  lane: 'idea' | 'flow' | 'sniper';
  a: ActState;
  /** Entered and still open — manage, do not chase. */
  running: boolean;
  symbol: string;
  /** Underlying ticker the plan's levels are in (an SPX thesis logged on SPY → SPY). */
  underlying: string;
  contract: string;
  side: 'CALLS' | 'PUTS';
  trigger: { name: string; price: number } | null;
  /** Contract mid when the idea fired / was logged — a past value, labelled as such. */
  entryMid: number | null;
  entryMidNote: string;
  /** Live contract mark (repriced each desk read) — null when there is none. */
  mark: Mark | null;
  stopPrem: number | null; stopUnd: number | null;
  t1Prem: number | null; t1Und: number | null;
  t2Prem: number | null; t2Und: number | null;
  rr: number | null;
  timeLeft: string | null;
  grade: string | null;
  gradeWhy: string | null;
  ideaId: string | null;
  /** Peak contract mark so far (runners tracker) — shown when the server supplies it. */
  peakPrem?: number | null;
  direction: 'long' | 'short';
}

const $ = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`);
const und$ = (sym: string, v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${sym} ${lvl(v)}`);
const lvl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v >= 1000 ? v.toFixed(0) : v.toFixed(2));

function Ladder({ m, nowMs }: { m: CardModel; nowMs: number }) {
  // Premium ladder: stop · entry · T1 · T2, with the live mark.
  const pts = [m.stopPrem, m.entryMid, m.t1Prem, m.t2Prem, m.mark?.value].filter((v): v is number => v != null && Number.isFinite(v));
  if (m.entryMid == null || pts.length < 2) return null;
  const lo = Math.min(...pts); const hi = Math.max(...pts);
  const span = hi - lo || 1;
  const pos = (v: number) => `${((v - lo) / span) * 100}%`;
  // A long option's T1 premium is above its entry; anything else is a plan repriced from another fill — no progress read.
  const planOk = m.t1Prem == null || m.t1Prem > m.entryMid;
  const prog = planOk ? progressToT1(m.entryMid, m.t1Prem, m.mark?.value ?? null) : null;
  const st = markStamp(m.mark, nowMs);
  const fillFrom = Math.min(m.entryMid, m.mark?.value ?? m.entryMid);
  const fillTo = Math.max(m.entryMid, m.mark?.value ?? m.entryMid);
  const good = m.mark != null && m.mark.value >= m.entryMid;
  return (
    <div className="zc-ladder" aria-label={`Premium ladder: stop ${$(m.stopPrem)}, entry ${$(m.entryMid)}, T1 ${$(m.t1Prem)}${m.t2Prem != null ? `, T2 ${$(m.t2Prem)}` : ''}${m.mark ? `, now ${$(m.mark.value)}` : ''}`}>
      <div className="zc-track">
        {m.mark && <span className={`zc-fill ${good ? 'up' : 'dn'}`} style={{ left: pos(fillFrom), width: `${((fillTo - fillFrom) / span) * 100}%` }} />}
        {m.stopPrem != null && <i className="zc-tick dn" style={{ left: pos(m.stopPrem) }} title={`Stop ${$(m.stopPrem)}`} />}
        <i className="zc-tick en" style={{ left: pos(m.entryMid) }} title={`Entry ${$(m.entryMid)}`} />
        {m.t1Prem != null && <i className="zc-tick up" style={{ left: pos(m.t1Prem) }} title={`T1 ${$(m.t1Prem)}`} />}
        {m.t2Prem != null && <i className="zc-tick up" style={{ left: pos(m.t2Prem) }} title={`T2 ${$(m.t2Prem)}`} />}
        {m.mark && <b className={`zc-dot ${st.delayed ? 'delayed' : ''}`} style={{ left: pos(m.mark.value) }} title={`Now ${$(m.mark.value)} · ${st.text}`} />}
      </div>
      <div className="zc-ladder-foot">
        <span>{m.mark ? <>Now <b>{$(m.mark.value)}</b> <em className={st.delayed ? 'zc-warn' : ''}>{st.text}</em></> : <em className="zc-warn">no live mark</em>}</span>
        <span>{!planOk ? 'premium plan from another fill — use underlying levels' : prog == null ? 'to T1 —' : prog >= 1 ? 'at / past T1' : prog < 0 ? `${Math.round(-prog * 100)}% against` : `${Math.round(prog * 100)}% to T1`}</span>
      </div>
    </div>
  );
}

export function TradeCard({ m, quote, nowMs, onDetails }: { m: CardModel; quote?: Quote; nowMs: number; onDetails: (m: CardModel) => void }) {
  const und = quote?.price != null && quote.price > 0 ? { value: quote.price, at: quote.asOf, source: quote.source } : null;
  const ust = markStamp(und ? { at: und.at, source: `${und.source ?? ''}${quote?.delayed ? ' delayed' : ''}` } : null, nowMs);
  const stateWord = m.running ? 'Running — manage' : STATE_WORDS[m.a.state] ?? m.a.label;
  return (
    <article className={`zc-card zc-${m.running ? 'running' : m.a.state}`} aria-label={`${m.contract} ${m.side} — ${stateWord}`}>
      <header className="zc-head">
        <span className={`zc-state zc-s-${m.running ? 'running' : m.a.state}`} title={m.a.reason}>{stateWord}</span>
        {m.grade && <span className="zc-grade" title={m.gradeWhy ?? 'Structure grade — how many measured levels line up; not a win probability'}>Grade {m.grade}</span>}
        <span className="zc-left">{m.timeLeft ?? ''}</span>
      </header>
      <h3 className="zc-contract"><span>{m.contract}</span><em className={m.side === 'CALLS' ? 'zc-up' : 'zc-dn'}>{m.side === 'CALLS' ? 'Calls' : 'Puts'}</em></h3>
      <dl className="zc-plan">
        <div><dt>Entry</dt><dd>{$(m.entryMid)}<small title={m.entryMidNote}>{m.entryMidNote}</small></dd></div>
        <div><dt>Stop</dt><dd className="zc-dn">{$(m.stopPrem)}<small>{und$(m.underlying, m.stopUnd)}</small></dd></div>
        <div><dt>T1</dt><dd className="zc-up">{$(m.t1Prem)}<small>{und$(m.underlying, m.t1Und)}</small></dd></div>
        <div><dt>T2</dt><dd className="zc-up">{$(m.t2Prem)}<small>{und$(m.underlying, m.t2Und)}</small></dd></div>
      </dl>
      <Ladder m={m} nowMs={nowMs} />
      <footer className="zc-foot">
        <span title="Live underlying quote">{m.underlying} {und ? <b>{lvl(und.value)}</b> : <b>—</b>} <em className={ust.delayed ? 'zc-warn' : ''}>{und ? ust.text : 'quote unavailable'}</em></span>
        {m.trigger && <span title="The underlying level that fires the entry">trigger {m.trigger.name} {lvl(m.trigger.price)}</span>}
        {m.rr != null && <span title="Reward ÷ risk on the plan">R:R {m.rr.toFixed(1)}</span>}
        <button type="button" className="zc-btn" onClick={() => onDetails(m)} disabled={!m.ideaId}
          title={m.ideaId ? 'Open the full setup: chart, ladder, timeline' : 'Not logged yet — details open once it triggers'}>Details</button>
      </footer>
    </article>
  );
}

export interface ResultModel {
  key: string; contract: string; side: 'CALLS' | 'PUTS'; state: string; reason: string | null; at: string | null;
  entryMid: number | null; exitMid: number | null; peakPrem?: number | null; ideaId: string | null; symbol: string;
}

export function ResultRow({ r, onDetails }: { r: ResultModel; onDetails: (r: ResultModel) => void }) {
  const c = resultChip(r.state, r.reason);
  const pct = r.entryMid && r.exitMid != null ? ((r.exitMid - r.entryMid) / r.entryMid) * 100 : null;
  return (
    <li className="zc-result">
      <span className={`zc-chip ${c.tone}`}>{c.label}{r.at ? ` ${r.at}` : ''}</span>
      <span className="zc-result-c">{r.contract} <em className={r.side === 'CALLS' ? 'zc-up' : 'zc-dn'}>{r.side === 'CALLS' ? 'Calls' : 'Puts'}</em></span>
      <span className="zc-result-n">
        {r.entryMid != null ? (r.exitMid != null ? `${$(r.entryMid)} → ${$(r.exitMid)}` : `filled ${$(r.entryMid)}`) : '—'}{pct != null && <b className={pct >= 0 ? 'zc-up' : 'zc-dn'}> {pct >= 0 ? '+' : ''}{pct.toFixed(0)}%</b>}
        {r.peakPrem != null && <small> · peak {$(r.peakPrem)}</small>}
      </span>
      {r.ideaId ? <button type="button" className="zc-btn zc-btn-sm" onClick={() => onDetails(r)}>Details</button> : <span />}
    </li>
  );
}
