/**
 * ROTATION IDEAS — the sector board's rotation read turned into stated trade
 * plans, with a Send-to-NEXUS action (operator only) and this engine's own
 * live record beside it. Reads GET /api/sectors/rotation-ideas
 * (server/sector-rotation-ideas.ts); fires POST /api/sectors/rotation-ideas/fire.
 *
 *   RotationIdeasPanel  Sectors page (/t?tab=sectors): suggestions (long /
 *                       short) → fired (idea link into NEXUS) → outcome as it
 *                       resolves; record (n, win %, avg R); forward-log stats
 *   RotationIdeasRow    Today: one compact row under the rotation/ignition band
 *
 * Everything is MEASURING: nothing here is validated (the score study saw
 * rotation alignment flip sign between halves; recent semis-rotation longs lost).
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { FreshStamp } from '@/components/ui/qe-phone';
import type { FireLogRow, ForwardStat, Suggestion } from '@shared/sector-rotation-ideas';
import '@/styles/rotation-ideas.css';

interface EngineIdea { id: string; symbol: string; direction: string; timestamp: string; outcome: 'win' | 'loss' | 'unresolved'; outcomeStatus: string | null; r: number | null; exitDate: string | null }
interface EngineRecord { total: number; wins: number; losses: number; decided: number; unresolved: number; winRate: number | null; expectancyR: number | null; rSampleSize: number; coveragePct: number; sampleFloor: number; since: string }
export interface RotationPayload {
  asOf: string | null; boardAsOf: string | null; phase: string | null;
  suggestions: Suggestion[]; notes: string[];
  fired: Array<FireLogRow & { idea: EngineIdea | null }>;
  record: EngineRecord; ideas: EngineIdea[];
  flags: { auto: boolean; cap: number; firedToday: number; autoTimesEt: string[]; autoMinConsensus: number };
  canFire: boolean; honesty: string; stamp?: { stale: boolean };
}

export const ROTATION_IDEAS_KEY = ['/api/sectors/rotation-ideas'] as const;

export function useRotationIdeas() {
  return useQuery<RotationPayload>({
    queryKey: [...ROTATION_IDEAS_KEY],
    queryFn: async () => { const r = await fetch('/api/sectors/rotation-ideas', { credentials: 'include' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); },
    refetchInterval: 60_000, staleTime: 30_000, retry: 1,
  });
}

const $ = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`);
const sgn = (v: number | null | undefined, d = 1, unit = '') => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}${unit}`);
const etTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET' : '—');
const RULE: Record<string, string> = { current: 'NOW', breakout_20d: 'BREAKOUT', vwap_reclaim: 'VWAP', pullback_ema20: 'PULLBACK' };

function fwdText(f: ForwardStat[] | undefined, h = 3) {
  const x = f?.find((r) => r.h === h);
  return x && x.n ? `${h}-session: n=${x.n}, ${sgn(x.meanExcess, 1, 'pp')} vs sector, beat ${x.beatPct}%` : 'no outcomes yet';
}

export function RecordCard({ data }: { data: RotationPayload }) {
  const r = data.record;
  return (
    <div className="rti-record" aria-label="Sector rotation engine record">
      <div className="rti-record-k">sector_rotation · live record <span className="sx-measuring">MEASURING</span></div>
      <div className="rti-record-v">
        <span><b>{r.decided}</b> decided · {r.unresolved} open/unresolved</span>
        <span>win <b>{r.winRate == null ? `— (n < ${r.sampleFloor})` : `${r.winRate}%`}</b></span>
        <span>avg <b>{r.expectancyR == null ? '—' : `${sgn(r.expectancyR, 2)}R`}</b>{r.rSampleSize ? <small> (n={r.rSampleSize})</small> : null}</span>
        <span className="sx-mute">outcome v2 since {r.since} · coverage {r.coveragePct}%</span>
      </div>
      <div className="rti-flags">
        <span className={`sx-chip${data.flags.auto ? ' rti-on' : ''}`}>auto {data.flags.auto ? `ON ${data.flags.autoTimesEt.join(' + ')} ET` : 'OFF'}</span>
        <span className="sx-chip">cap {data.flags.firedToday}/{data.flags.cap} today</span>
        <span className="sx-chip">auto needs consensus ≥ {data.flags.autoMinConsensus}</span>
      </div>
    </div>
  );
}

function Plan({ s, data, onFired }: { s: Suggestion; data: RotationPayload; onFired: (key: string, r: { ok: boolean; ideaId: string | null; reason: string | null }) => void }) {
  const [busy, setBusy] = useState(false);
  const capLeft = data.flags.cap - data.flags.firedToday;
  const firedRow = data.fired.find((f) => f.key === s.key && f.status === 'fired' && f.dateKey === (data.asOf ?? '').slice(0, 10));
  const fire = async () => {
    if (!window.confirm(`Send ${s.symbol} ${s.side.toUpperCase()} to NEXUS?\n\nThe plan is re-read live and must pass the bot's rules and every publish gate. Source sector_rotation — MEASURING, unvalidated.`)) return;
    setBusy(true);
    try {
      const res = await apiRequest('POST', '/api/sectors/rotation-ideas/fire', { key: s.key });
      const j = await res.json().catch(() => ({}));
      onFired(s.key, { ok: !!j.ok, ideaId: j.ideaId ?? null, reason: j.reason ?? (res.ok ? null : `HTTP ${res.status}`) });
    } catch (e) {
      // apiRequest throws "<status>: <body>" on non-2xx; a 409 body carries the refusal reason
      const body = (e as Error).message.replace(/^\d+:\s*/, '');
      let reason = body;
      try { const j = JSON.parse(body); reason = j.reason ?? j.error ?? body; } catch { /* plain text */ }
      onFired(s.key, { ok: false, ideaId: null, reason });
    } finally { setBusy(false); }
  };
  const blocked = s.blocks.length > 0 || capLeft <= 0;
  return (
    <article className="rti-card" data-side={s.side}>
      <header className="rti-card-top">
        <Link href={`/r/${s.symbol}`} className="sx-sym sx-sym-lg">{s.symbol}</Link>
        <span className={s.side === 'long' ? 'sx-up' : 'sx-dn'}>{s.side === 'long' ? '▲ LONG' : '▼ SHORT'}</span>
        <span className="sx-chip" title={s.entry.text}>{RULE[s.entry.rule]}</span>
        <span className="sx-mute">{s.sectorLabel} · {s.regime} · {s.kind === 'leader' ? `leader ${s.score ?? '—'}/100` : 'catch-up laggard'} · consensus {s.consensus.with}/{s.consensus.n}</span>
      </header>
      <p className="rti-entry">{s.entry.text}</p>
      <dl className="rti-levels">
        <div><dt>Entry</dt><dd>{$(s.entry.entry)}</dd></div>
        <div><dt>Stop</dt><dd>{$(s.stop)}</dd></div>
        <div><dt>T1</dt><dd>{$(s.t1)}</dd></div>
        <div><dt>T2</dt><dd>{$(s.t2)}</dd></div>
        <div><dt>R:R</dt><dd>{s.rr.toFixed(2)}</dd></div>
        <div><dt>Last</dt><dd>{$(s.price)} <small>{etTime(s.priceAt)}</small></dd></div>
      </dl>
      <ul className="rti-why">
        <li><b>Stop</b> {s.stopBasis}</li>
        <li><b>T1</b> {s.t1Basis}{s.capped ? ' · capped at the expected move' : ''}{s.t2Basis ? <> · <b>T2</b> {s.t2Basis}</> : null}</li>
        <li><b>Horizon</b> {s.horizonLabel} · <b>Vehicle</b> {s.vehicle.text}</li>
        <li><b>Forward log</b> leaders vs sector here — {fwdText(s.forward.sector)}; all sectors — {fwdText(s.forward.all)}</li>
      </ul>
      <ul className="sx-chips">
        {s.chips.map((c) => (
          <li key={c.key} data-state={c.state} title={`${c.label}: ${c.detail}`}><span aria-hidden>{c.state === 'pass' ? '✓' : c.state === 'fail' ? '✗' : '–'}</span> {c.label}<span className="sr-only"> {c.state}: {c.detail}</span></li>
        ))}
      </ul>
      {s.earnings && <div className="sx-mute">earnings {s.earnings}</div>}
      {s.blocks.length > 0 && <div className="rti-block" role="note">Not fireable: {s.blocks.join('; ')}</div>}
      <footer className="rti-card-foot">
        {firedRow?.ideaId ? (
          <Link href={nexusIdeaHref({ ideaId: firedRow.ideaId, symbol: s.symbol })} className="rti-fired">Fired {etTime(firedRow.at)} → open in NEXUS</Link>
        ) : data.canFire ? (
          <button type="button" className="rti-fire" disabled={busy || blocked} onClick={fire} title={blocked ? (s.blocks[0] ?? 'daily cap reached') : 'Re-reads the plan live, then the bot rules and publish gates decide'}>
            {busy ? 'Sending…' : 'Send to NEXUS'}
          </button>
        ) : <span className="sx-mute">Operator fires</span>}
        <span className="rti-rec-mini" title="This engine's live record (outcome v2)">record {data.record.decided} decided · win {data.record.winRate == null ? '—' : `${data.record.winRate}%`} · avg {data.record.expectancyR == null ? '—' : `${sgn(data.record.expectancyR, 2)}R`}</span>
        {s.autoEligible && <span className="sx-chip">auto-eligible</span>}
      </footer>
    </article>
  );
}

export function RotationIdeasPanel({ forward }: { forward?: { rows: number; summary: ForwardStat[]; since: string | null } }) {
  const q = useRotationIdeas();
  const qc = useQueryClient();
  const [results, setResults] = useState<Record<string, { ok: boolean; ideaId: string | null; reason: string | null }>>({});
  if (q.isError && !q.data) return <div className="sx-empty">Rotation ideas didn&rsquo;t load. <button type="button" className="sx-link-btn" onClick={() => q.refetch()}>Retry</button></div>;
  if (!q.data) return <div className="sx-empty" role="status">Reading rotation ideas…</div>;
  const d = q.data;
  const onFired = (key: string, r: { ok: boolean; ideaId: string | null; reason: string | null }) => { setResults((x) => ({ ...x, [key]: r })); void qc.invalidateQueries({ queryKey: [...ROTATION_IDEAS_KEY] }); };
  const longs = d.suggestions.filter((s) => s.side === 'long');
  const shorts = d.suggestions.filter((s) => s.side === 'short');
  return (
    <div className="rti">
      <div className="rti-head">
        <p className="rti-honesty">{d.honesty}</p>
        <div className="sx-hero-meta"><FreshStamp asOf={d.asOf} label="planned" warn={d.stamp?.stale} /> <span className="sx-mute">board {etTime(d.boardAsOf)} · plans are re-read live when fired</span></div>
      </div>
      <RecordCard data={d} />
      {forward && (
        <div className="rti-forward">
          <b>Forward log — leaders vs their sector</b> {forward.rows ? `since ${forward.since ?? '—'}` : 'starts at the next 16:15 ET close'}
          {forward.summary.map((x) => <span key={x.h}> · {x.h}-session {x.n ? `n=${x.n}, ${sgn(x.meanExcess, 1, 'pp')}, beat ${x.beatPct}%` : 'n=0'}</span>)}
        </div>
      )}
      {d.suggestions.length === 0 ? <div className="sx-empty">{d.notes[0] ?? 'No suggestions right now.'}</div> : (
        <div className="rti-cols">
          {([['Long — Leading / Improving sectors', longs], ['Short — Weakening / Lagging sectors', shorts]] as const).map(([title, list]) => (
            <div key={title}>
              <h3 className="sx-h3">{title}</h3>
              {list.length === 0 ? <div className="sx-mute">None qualified.</div> : list.map((s) => (
                <div key={s.key}>
                  <Plan s={s} data={d} onFired={onFired} />
                  {results[s.key] && (
                    <div className={`rti-result${results[s.key].ok ? ' ok' : ''}`} role="status">
                      {results[s.key].ok
                        ? <>Fired → <Link href={nexusIdeaHref({ ideaId: results[s.key].ideaId, symbol: s.symbol })}>open in NEXUS</Link>{results[s.key].reason ? ` (${results[s.key].reason})` : ''}</>
                        : <>Withheld — {results[s.key].reason ?? 'refused'}</>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <h3 className="sx-h3">Suggestions → fired → outcome</h3>
      {d.fired.length === 0 ? <div className="sx-mute">Nothing fired yet{d.flags.auto ? '' : ' — auto-mode is off (SECTOR_ROTATION_IDEAS)'}.</div> : (
        <div className="sx-table-wrap">
          <table className="sx-table rti-table">
            <thead><tr><th>When</th><th>Symbol</th><th>Sector</th><th>Mode</th><th>Plan</th><th>Status</th><th>Outcome</th></tr></thead>
            <tbody>
              {d.fired.slice(0, 30).map((f) => (
                <tr key={`${f.at}|${f.key}`}>
                  <td data-num>{etTime(f.at)}</td>
                  <td><Link href={`/r/${f.symbol}`} className="sx-sym">{f.symbol}</Link> <span className={f.side === 'long' ? 'sx-up' : 'sx-dn'}>{f.side === 'long' ? '▲' : '▼'}</span></td>
                  <td>{f.sectorLabel}</td>
                  <td>{f.mode}</td>
                  <td data-num>{RULE[f.plan.rule]} {$(f.plan.entry)} / {$(f.plan.stop)} / {$(f.plan.t1)} · {f.plan.rr.toFixed(2)}R · {f.plan.vehicle}</td>
                  <td>{f.status === 'fired' && f.ideaId ? <Link href={nexusIdeaHref({ ideaId: f.ideaId, symbol: f.symbol })}>fired → NEXUS</Link> : <span className="sx-mute" title={f.reason ?? ''}>withheld{f.reason ? ` — ${f.reason.slice(0, 80)}` : ''}</span>}</td>
                  <td>{f.idea ? <span className={f.idea.outcome === 'win' ? 'sx-up' : f.idea.outcome === 'loss' ? 'sx-dn' : 'sx-mute'}>{f.idea.outcome === 'unresolved' ? (f.idea.outcomeStatus === 'open' ? 'open' : 'unresolved') : f.idea.outcome}{f.idea.r != null ? ` ${sgn(f.idea.r, 2)}R` : ''}</span> : <span className="sx-mute">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.notes.length > 0 && <ul className="sx-notes">{d.notes.slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul>}
    </div>
  );
}

/** Today: one compact row — top long and short plans, the record, a link to the full panel. */
export function RotationIdeasRow() {
  const q = useRotationIdeas();
  const d = q.data;
  if (!d || d.suggestions.length === 0) return null; // nothing to suggest takes no row
  const pick = (side: 'long' | 'short') => d.suggestions.filter((s) => s.side === side).slice(0, 2);
  const fmt = (s: Suggestion) => `${s.symbol} ${RULE[s.entry.rule].toLowerCase()} ${$(s.entry.entry)} → ${$(s.t1)} (${s.rr.toFixed(1)}R)`;
  const longs = pick('long'); const shorts = pick('short');
  return (
    <section className="rti-row-sec" aria-label="Rotation ideas">
      <div className="container">
        <div className="rti-row">
          <span className="rti-row-k">Rotation ideas <span className="sx-measuring">MEASURING</span></span>
          {longs.length > 0 && <span><b className="sx-up">Long</b> {longs.map(fmt).join(' · ')}</span>}
          {shorts.length > 0 && <span><b className="sx-dn">Short</b> {shorts.map(fmt).join(' · ')}</span>}
          <span className="sx-mute">record {d.record.decided} decided · avg {d.record.expectancyR == null ? '—' : `${sgn(d.record.expectancyR, 2)}R`}</span>
          <Link href="/t?tab=sectors" className="rti-row-open">All plans →</Link>
        </div>
      </div>
    </section>
  );
}
