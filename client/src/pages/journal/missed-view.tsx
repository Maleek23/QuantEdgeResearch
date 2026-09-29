/**
 * Journal · Missed — LuxAlgo's Missed trades (apps/web/src/app/missed): the
 * trades you saw and did not take, so hesitation is measured like execution.
 *
 *   Mine / trader  missed trades logged here (journal_notes, reason = 'missed');
 *                  writable only where the book is.
 *   Bot            the blocked-trade ledger (/api/discipline/ledger — the feed
 *                  the Bot tab reads): shorts the discipline gate refused, each
 *                  replayed on daily bars to show what it did afterwards.
 *   Trade desk     ideas whose entry never triggered — counted on the basis
 *                  line; they are not trades, so they are not scored.
 */
import { useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { Card, Kpi, LowSample, N, fmtDayLabel } from '@/components/journal/parts';
import { fmtPrice } from '@/lib/journal/metrics';
import { fmtStamp, readApiError, useBlockedLedger, useJournalNoteMutations } from '@/lib/journal/use-journal';

export default function MissedView() {
  const { data } = useJournal();
  if (data.key === 'bot') return <BotBlocked />;
  if (data.key === 'desk') return <DeskMissed />;
  return <LoggedMissed />;
}

const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`);

function BotBlocked() {
  const q = useBlockedLedger(true);
  const [limit, setLimit] = useState(40);
  if (q.isError) return <QEError title="The blocked-trade ledger didn't load" message={`/api/discipline/ledger failed (${q.error instanceof Error ? q.error.message : 'no response'}). This is a failure, not an empty ledger.`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (q.isLoading || !q.data) return <QELoading rows={4} label="replaying blocked trades…" />;
  const l = q.data;
  const rows = l.entries ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="jr-note" style={{ margin: 0 }}>
        The bot trades only signals that pass the conviction engine's gates. This is the gate that is recorded: pattern-shorts refused for lacking an
        event catalyst, kept as shadow trades (never published, never in any win rate) and replayed on daily bars from the day they were blocked.
      </p>
      <div className="jr-kpis">
        <Kpi label="Blocked" value={String(l.totalBlocked)} sub="one per symbol per day" />
        <Kpi label="Decided" value={String(l.decided)} sub={<>hit target or stop <LowSample n={l.decided} /></>} />
        <Kpi label="Would have won" value={String(l.blockedWinners)} sub="blocked, then hit target — the gate's cost" />
        <Kpi label="Would have lost" value={String(l.blockedLosers)} sub="blocked, then hit stop — the gate's saving" />
        <Kpi label="Net would-be" value={pct(l.netWouldBePercent)} tone={l.netWouldBePercent > 0 ? 'loss' : l.netWouldBePercent < 0 ? 'gain' : null}
          sub={l.netWouldBePercent > 0 ? 'gate is blocking profitable shorts' : l.netWouldBePercent < 0 ? 'gate is saving money' : 'sum of decided %'} />
      </div>
      <Card num="01" title="Refused ideas, and what they did" meta={<N n={rows.length} unit="blocked" />}>
        {!rows.length ? <QEEmpty message="The gate hasn't blocked anything yet — the ledger is empty, not failing." /> : (
          <>
            <div className="jr-table-wrap">
              <table className="jr-table">
                <thead>
                  <tr>
                    <th scope="col">Blocked</th><th scope="col">Symbol</th><th scope="col">Why</th>
                    <th scope="col" className="num">Entry</th><th scope="col" className="num">Stop</th><th scope="col" className="num">Target</th>
                    <th scope="col">Afterwards</th><th scope="col" className="num">Would-be</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((e) => (
                    <tr key={`${e.symbol}-${e.blockedAt}`} style={{ cursor: 'default' }}>
                      <td>{fmtDayLabel(e.blockedAt.slice(0, 10), { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                      <td><span className="jr-sym">{e.symbol}</span> <span className="jr-chip">▼ SHORT</span></td>
                      <td className="jr-dim" style={{ whiteSpace: 'normal', minWidth: 180 }}>{e.reason}</td>
                      <td className="num">{fmtPrice(e.entryPrice)}</td>
                      <td className="num">{fmtPrice(e.stopLoss)}</td>
                      <td className="num">{fmtPrice(e.targetPrice)}</td>
                      <td>{e.outcome === 'hit_target' ? <span className="jr-chip win">WOULD HAVE WON</span>
                        : e.outcome === 'hit_stop' ? <span className="jr-chip loss">WOULD HAVE LOST</span>
                        : <span className="jr-chip open">{e.replay === 'no bars yet' ? 'NO BARS YET' : 'UNDECIDED'}</span>}</td>
                      <td className="num">{pct(e.wouldBePercent)}{e.lastPrice != null && e.outcome !== 'hit_target' && e.outcome !== 'hit_stop' ? <span className="jr-mute"> @ {fmtPrice(e.lastPrice)}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > limit && <button type="button" className="jr-btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setLimit((x) => x + 40)}>Show more · {rows.length - limit} hidden</button>}
            {l._meta?.note && <p className="jr-note">{l._meta.note}</p>}
          </>
        )}
      </Card>
    </div>
  );
}

function DeskMissed() {
  const { data, goTo } = useJournal();
  const missed = (data.meta?.excluded ?? []).filter((e) => /never triggered|missed entry/i.test(e.reason));
  const n = missed.reduce((s, e) => s + e.count, 0);
  return (
    <Card num="01" title="Ideas the desk never got into" meta={<N n={n} unit="ideas" />}>
      {n ? (
        <p style={{ margin: 0 }}>
          <b>{n}</b> published idea{n === 1 ? '' : 's'} since the clean-era baseline never triggered their entry ({missed.map((e) => e.reason).join('; ')}).
          They are not trades, so the journal does not score them; their outcomes (including "would have won") are on{' '}
          <button type="button" className="jr-cell-btn jr-accent-link" onClick={() => goTo('record')}>Track record</button>.
        </p>
      ) : <QEEmpty message="No published idea in this book missed its entry window." />}
    </Card>
  );
}

function LoggedMissed() {
  const { data, canWrite, bookLabel, prefs } = useJournal();
  const { notesQ } = data;
  const { remove } = useJournalNoteMutations(data.key);
  const [err, setErr] = useState('');
  const missed = useMemo(() => (notesQ.data?.notes ?? []).filter((n) => n.reason === 'missed').sort((a, b) => b.day.localeCompare(a.day) || Date.parse(b.postedAt) - Date.parse(a.postedAt)), [notesQ.data]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {canWrite && <LogMissed />}
      <Card num={canWrite ? '02' : '01'} title="Missed trades" meta={<N n={missed.length} unit="logged" />}>
        {notesQ.isError ? (
          <QEError title="Missed trades didn't load" message="The journal notes request failed — this is a failure, not an empty list." onRetry={() => notesQ.refetch()} retrying={notesQ.isFetching} />
        ) : notesQ.isLoading ? <QELoading rows={2} /> : !missed.length ? (
          <QEEmpty message={canWrite
            ? <>No missed trades logged. When you see a setup and don't take it, log it above — symbol, side, the plan you would have used and why you passed. Over time this shows whether hesitation costs you more than it saves.</>
            : <>{bookLabel} hasn't logged any missed trades. Only an admin or {bookLabel} can add them.</>} />
        ) : (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
            {missed.map((n) => (
              <article key={n.id} className="jr-note-item">
                <div className="h">
                  <b style={{ color: 'var(--text)' }}>{fmtDayLabel(n.day, { month: 'short', day: 'numeric', year: 'numeric' })}</b>
                  {(n.symbols ?? []).map((s) => <span key={s} className="jr-chip">{s}</span>)}
                  <span>logged {fmtStamp(n.postedAt, prefs.timeDisplay)}</span>
                  {canWrite && (
                    <button type="button" className="jr-icon-btn danger" style={{ marginLeft: 'auto', width: 26, height: 26 }} aria-label="Delete this missed trade" disabled={remove.isPending}
                      onClick={async () => { if (!window.confirm('Delete this missed trade?')) return; setErr(''); try { await remove.mutateAsync(n.id); } catch (e) { setErr(await readApiError(e)); } }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="b">{n.body}</div>
              </article>
            ))}
          </div>
        )}
        {err && <div className="jr-err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
        {missed.length > 0 && <p className="jr-note">What a missed trade did afterwards isn't replayed yet — note the result in its text when you review it.</p>}
      </Card>
    </div>
  );
}

function LogMissed() {
  const { data } = useJournal();
  const { save } = useJournalNoteMutations(data.key);
  const [f, setF] = useState({ symbol: '', side: 'long' as 'long' | 'short', day: journalDayKey(new Date()), entry: '', stop: '', target: '', why: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sym = f.symbol.trim().toUpperCase().replace(/^\$/, '');
  const valid = /^[A-Z][A-Z0-9.\-/]{0,11}$/.test(sym) && !!f.day && !!f.why.trim();
  const set = (k: keyof typeof f, v: string) => { setMsg(null); setF((x) => ({ ...x, [k]: v })); };
  const submit = async () => {
    const plan = [f.entry && `entry ${f.entry}`, f.stop && `stop ${f.stop}`, f.target && `target ${f.target}`].filter(Boolean).join(' · ');
    const body = `${f.side.toUpperCase()} ${sym}${plan ? ` — plan: ${plan}` : ''}\nWhy I passed: ${f.why.trim()}`;
    try {
      await save.mutateAsync({ kind: 'missed', day: f.day, body, symbols: [sym] });
      setF((x) => ({ ...x, symbol: '', entry: '', stop: '', target: '', why: '' }));
      setMsg({ ok: true, text: 'Logged.' });
    } catch (e) { setMsg({ ok: false, text: await readApiError(e) }); }
  };
  const field = (k: 'symbol' | 'entry' | 'stop' | 'target', label: string, ph: string) => (
    <div className="jr-field">
      <label htmlFor={`jr-miss-${k}`}>{label}</label>
      <input id={`jr-miss-${k}`} className="jr-input" value={f[k]} placeholder={ph} inputMode={k === 'symbol' ? undefined : 'decimal'} autoComplete="off" onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  return (
    <Card num="01" title="Log a missed trade">
      <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <div className="jr-form-grid four">
          {field('symbol', 'Symbol', 'NVDA')}
          <div className="jr-field">
            <span className="l" id="jr-miss-side-l">Side</span>
            <div className="jr-seg" role="group" aria-labelledby="jr-miss-side-l">
              <button type="button" aria-pressed={f.side === 'long'} onClick={() => set('side', 'long')}>LONG</button>
              <button type="button" aria-pressed={f.side === 'short'} onClick={() => set('side', 'short')}>SHORT</button>
            </div>
          </div>
          <div className="jr-field">
            <label htmlFor="jr-miss-day">Day</label>
            <input id="jr-miss-day" type="date" className="jr-input" value={f.day} onChange={(e) => set('day', e.target.value)} required />
          </div>
          {field('entry', 'Planned entry', 'optional')}
          {field('stop', 'Stop', 'optional')}
          {field('target', 'Target', 'optional')}
        </div>
        <div className="jr-field">
          <label htmlFor="jr-miss-why">Why you passed</label>
          <textarea id="jr-miss-why" className="jr-input" style={{ minHeight: 64 }} value={f.why} maxLength={4000} onChange={(e) => set('why', e.target.value)} placeholder="Hesitated at the open, spread too wide, already at max risk…" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" className="jr-btn jr-btn-primary jr-btn-sm" disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Log missed trade
          </button>
          {msg && <span className={msg.ok ? 'jr-gain' : 'jr-loss'} role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12 }}>{msg.text}</span>}
        </div>
      </form>
    </Card>
  );
}
