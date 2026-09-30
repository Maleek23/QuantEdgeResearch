/**
 * Journal · Daily journal — LuxAlgo's Daily journal (apps/web/src/app/journal):
 * one card per trading day, newest first, each opening to that day's trades,
 * its notes and a free-text day note. Day notes live in journal_notes
 * (reason = 'day_note', one per day, upserted) and are writable only on books
 * the caller can write; read-only books show the day and its trades.
 *
 * 2026-09-29 (LuxAlgo app/journal/[date] parity): each open day also shows its
 * stats, a running-P&L sparkline through the day, a recap built only from the
 * day's measured numbers (metrics-extra.ts dayRecap — no generated text), and
 * the day note became Markdown with attachments.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, NotebookPen } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { QEError, QEEmpty } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { Card, Pnl, fmtDayLabel } from '@/components/journal/parts';
import { fmtMoney, fmtPct, type DayStats, type JTrade } from '@/lib/journal/metrics';
import { dayEquity, dayRecap } from '@/lib/journal/metrics-extra';
import { useTradeReviews } from '@/lib/journal/use-journal-extra';
import { Sparkline } from '@/components/journal/lux-charts';
import { Markdown, MarkdownEditor } from '@/components/journal/rich-notes';
import { AttachmentList, AttachmentsField, type NoteAttachment } from '@/components/journal/attachments';
import type { JournalNoteRow } from '@/lib/journal/types';
import { fmtStamp, noteKindLabel, readApiError, useJournalNoteMutations } from '@/lib/journal/use-journal';
import { TradeMiniList } from '@/components/journal/trade-mini-list';
import { useJournalMarks, type LiveMark } from '@/lib/journal/use-journal-marks';

const PAGE = 30;

export default function DailyView() {
  const { data, filters, canWrite, focusDay, bookLabel } = useJournal();
  const { trades, days, notesQ } = data;
  const f = filters.resolved;
  const today = journalDayKey(new Date());
  const [open, setOpen] = useState<string | null>(focusDay);
  const [limit, setLimit] = useState(PAGE);

  const notesByDay = useMemo(() => {
    const m = new Map<string, JournalNoteRow[]>();
    for (const n of notesQ.data?.notes ?? []) {
      if (n.reason === 'playbook' || n.reason === 'trade_review') continue;
      if ((f.from && n.day < f.from) || (f.to && n.day > f.to)) continue;
      const list = m.get(n.day);
      if (list) list.push(n); else m.set(n.day, [n]);
    }
    return m;
  }, [notesQ.data, f.from, f.to]);

  const tradesByDay = useMemo(() => {
    const m = new Map<string, JTrade[]>();
    for (const t of trades) {
      // A day shows what closed on it, plus what was opened on it and is still open.
      const k = t.closedAt ? journalDayKey(t.closedAt) : journalDayKey(t.openedAt);
      const list = m.get(k);
      if (list) list.push(t); else m.set(k, [t]);
    }
    return m;
  }, [trades]);

  const stats = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const list = useMemo(() => {
    const s = new Set<string>([...tradesByDay.keys(), ...notesByDay.keys()]);
    if (focusDay) s.add(focusDay);
    if (canWrite && (!f.to || f.to >= today) && (!f.from || f.from <= today)) s.add(today);
    return [...s].filter(Boolean).sort((a, b) => b.localeCompare(a));
  }, [tradesByDay, notesByDay, focusDay, canWrite, today, f.from, f.to]);

  // Arriving from the Calendar / Dashboard: open that day and bring it into view.
  useEffect(() => {
    if (!focusDay) return;
    setOpen(focusDay);
    const i = list.indexOf(focusDay);
    if (i >= limit) setLimit(i + 1);
    const t = window.setTimeout(() => document.getElementById(`jr-day-${focusDay}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDay]);

  const notesUnavailable = data.key === 'bot' || data.key === 'desk';
  // Live marks for open rows (desk book: the 60 most recent open rows).
  const openTotal = useMemo(() => trades.filter((t) => t.status === 'open').length, [trades]);
  const marks = useJournalMarks(data.key, openTotal);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {notesQ.isError && (
        <QEError title="Journal notes didn't load" message="Days and trades below are unaffected; notes and day notes are missing until this loads." onRetry={() => notesQ.refetch()} retrying={notesQ.isFetching} />
      )}
      {notesUnavailable && (
        <p className="jr-note" style={{ margin: 0 }}>The {bookLabel} book is a ledger — it carries no notes, so days here show trades only.</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="jr-n">{list.length} {list.length === 1 ? 'day' : 'days'} in view</span>
        {canWrite && !list.includes(today) && <span className="jr-n">today is outside the date filter</span>}
      </div>
      {!list.length ? (
        <QEEmpty message={canWrite ? 'No trading days in view — import trades or write a day note for today.' : `No trading days in view for ${bookLabel}.`} />
      ) : (
        list.slice(0, limit).map((day) => (
          <DayCard
            key={day}
            day={day}
            isToday={day === today}
            open={open === day}
            onToggle={() => setOpen(open === day ? null : day)}
            trades={tradesByDay.get(day) ?? []}
            notes={notesByDay.get(day) ?? []}
            stats={stats.get(day) ?? null}
            marks={marks}
          />
        ))
      )}
      {list.length > limit && (
        <button type="button" className="jr-btn" onClick={() => setLimit((l) => l + PAGE)}>Show older days · {list.length - limit} more</button>
      )}
    </div>
  );
}

/** Won / lost / net on the day's closes, and live unrealized on what it opened that is still open. */
function dayMoney(trades: JTrade[], marks: Record<string, LiveMark>) {
  const closed = trades.filter((t) => t.status !== 'open');
  const won = closed.filter((t) => t.netPnl > 0).reduce((a, t) => a + t.netPnl, 0);
  const lost = closed.filter((t) => t.netPnl < 0).reduce((a, t) => a + t.netPnl, 0);
  const open = trades.filter((t) => t.status === 'open');
  let unreal = 0, marked = 0, up = 0, down = 0;
  for (const t of open) {
    const u = marks[t.id]?.unrealizedPnL ?? t.row.mark?.unrealizedPnL;
    if (u == null || !Number.isFinite(u)) continue;
    marked++; unreal += u; if (u > 0) up++; else if (u < 0) down++;
  }
  return { closed, won, lost, net: won + lost, open, unreal, marked, up, down };
}

function DayCard({ day, isToday, open, onToggle, trades, notes, stats, marks }: {
  marks: Record<string, LiveMark>;
  day: string;
  isToday: boolean;
  open: boolean;
  onToggle: () => void;
  trades: JTrade[];
  notes: JournalNoteRow[];
  stats: DayStats | null;
}) {
  const { openTrade, canWrite, prefs, data } = useJournal();
  const { reviews } = useTradeReviews(data.notesQ.data?.notes);
  const dayNote = notes.find((n) => n.reason === 'day_note') ?? null;
  const others = notes.filter((n) => n.reason !== 'day_note');
  const openCount = trades.filter((t) => t.status === 'open').length;
  const money = dayMoney(trades, marks);
  const unrealOf = (t: JTrade) => marks[t.id]?.unrealizedPnL ?? t.row.mark?.unrealizedPnL ?? null;
  const winners = money.closed.filter((t) => t.netPnl > 0).sort((a, b) => b.netPnl - a.netPnl);
  const losers = money.closed.filter((t) => t.netPnl < 0).sort((a, b) => a.netPnl - b.netPnl);
  const flat = money.closed.filter((t) => t.netPnl === 0);
  const opens = [...money.open].sort((a, b) => (unrealOf(b) ?? -Infinity) - (unrealOf(a) ?? -Infinity));
  const openTrades = (ts: JTrade[]) => (id: string) => openTrade(id, ts.map((t) => t.id));
  const panelId = `jr-day-panel-${day}`;
  return (
    <section className="jr-card jr-day jr-anchor" id={`jr-day-${day}`} aria-label={fmtDayLabel(day)}>
      <button type="button" className="jr-day-h" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <ChevronRight className="chev h-4 w-4" aria-hidden style={{ transform: open ? 'rotate(90deg)' : undefined }} />
        <span className="jr-day-date">
          <b>{fmtDayLabel(day, { month: 'short', day: 'numeric', year: 'numeric' })}</b>
          <span className="jr-mute">{fmtDayLabel(day, { weekday: 'long' })}{isToday ? ' · today' : ''}</span>
        </span>
        <span className="jr-day-stats">
          {money.closed.length > 0 ? (
            <>
              <Pnl value={money.net} />
              <span className="jr-n">won <span className="jr-gain">{fmtMoney(money.won)}</span> · lost <span className="jr-loss">{fmtMoney(money.lost)}</span> · {money.closed.length} closed{stats ? ` · ${stats.wins}W/${stats.losses}L` : ''}</span>
            </>
          ) : <span className="jr-mute">no closed trades</span>}
          {openCount > 0 && (
            <span className="jr-n">· {openCount} open{money.marked ? <> · live <Pnl value={money.unreal} compact /></> : ''}</span>
          )}
        </span>
        {dayNote && <span className="jr-tag" title="Has a day note"><NotebookPen className="h-3 w-3" aria-hidden /> note</span>}
        {others.length > 0 && <span className="jr-n">{others.length} note{others.length === 1 ? '' : 's'}</span>}
      </button>
      {open && (
        <div id={panelId} className="jr-day-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="jr-stats" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))' }} aria-label="Day scoreboard">
              <div><span>Closed net</span><b><Pnl value={money.closed.length ? money.net : null} /></b><small>{money.closed.length} closed · realized</small></div>
              <div><span>Won</span><b><Pnl value={money.won || null} /></b><small>{winners.length} winners</small></div>
              <div><span>Lost</span><b><Pnl value={money.lost || null} /></b><small>{losers.length} losers{flat.length ? ` · ${flat.length} flat` : ''}</small></div>
              <div><span>Open, live</span><b><Pnl value={money.marked ? money.unreal : null} /></b><small>{openCount ? `${money.marked} of ${openCount} marked · ${money.up}▲ ${money.down}▼ · unrealized` : 'nothing open'}</small></div>
              <div><span>Day if closed now</span><b><Pnl value={money.closed.length || money.marked ? money.net + money.unreal : null} /></b><small>realized + marked open</small></div>
            </div>
            {winners.length > 0 && <div><div className="jr-kpi-l" style={{ marginBottom: 6 }}>Winners <span className="jr-n">{winners.length} · <Pnl value={money.won} compact /></span></div><TradeMiniList trades={winners} onOpen={openTrades(winners)} /></div>}
            {losers.length > 0 && <div><div className="jr-kpi-l" style={{ marginBottom: 6 }}>Losers <span className="jr-n">{losers.length} · <Pnl value={money.lost} compact /></span></div><TradeMiniList trades={losers} onOpen={openTrades(losers)} /></div>}
            {flat.length > 0 && <div><div className="jr-kpi-l" style={{ marginBottom: 6 }}>Breakeven <span className="jr-n">{flat.length}</span></div><TradeMiniList trades={flat} onOpen={openTrades(flat)} /></div>}
            {opens.length > 0 && <div><div className="jr-kpi-l" style={{ marginBottom: 6 }}>Still open <span className="jr-n">{opens.length} · best live first{money.marked < opens.length ? ` · ${opens.length - money.marked} not marked yet` : ''}</span></div><TradeMiniList trades={opens} marks={marks} onOpen={openTrades(opens)} /></div>}
            {!trades.length && <p className="jr-note" style={{ margin: 0 }}>No trades this day.</p>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats && stats.trades > 0 && <DayStatsBlock day={day} trades={trades} stats={stats} />}
            <DayRecap day={day} trades={trades} reviews={reviews} />
            <div className="jr-kpi-l">Day note</div>
            {canWrite ? <DayNoteEditor day={day} note={dayNote} /> : dayNote ? (
              <>
                <Markdown source={dayNote.body} />
                <AttachmentList items={(dayNote.attachments ?? []) as NoteAttachment[]} />
              </>
            ) : <p className="jr-note" style={{ margin: 0 }}>No day note.</p>}
            {others.length > 0 && (
              <>
                <div className="jr-kpi-l" style={{ marginTop: 6 }}>Notes this day</div>
                {others.map((n) => (
                  <article key={n.id} className="jr-note-item">
                    <div className="h">
                      <span className="jr-tag">{noteKindLabel(n.reason, n.source)}</span>
                      <time dateTime={n.postedAt}>{fmtStamp(n.postedAt, prefs.timeDisplay, { hour: 'numeric', minute: '2-digit' })}</time>
                      {(n.symbols ?? []).slice(0, 5).map((s) => <span key={s} className="jr-chip">{s}</span>)}
                    </div>
                    <div className="b">{n.body}</div>
                  </article>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function DayNoteEditor({ day, note }: { day: string; note: JournalNoteRow | null }) {
  const { data } = useJournal();
  const { save } = useJournalNoteMutations(data.key);
  const savedAtt = (note?.attachments ?? []) as NoteAttachment[];
  const [text, setText] = useState(note?.body ?? '');
  const [att, setAtt] = useState<NoteAttachment[]>(savedAtt);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const attKey = JSON.stringify(savedAtt);
  useEffect(() => { setText(note?.body ?? ''); setAtt(savedAtt); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [note?.body, attKey]);
  const dirty = text.trim() !== (note?.body ?? '').trim() || JSON.stringify(att) !== attKey;
  const submit = async () => {
    setMsg(null);
    try {
      const r = await save.mutateAsync({ kind: 'day_note', day, body: text, attachments: att.length ? att : undefined });
      setMsg({ ok: true, text: r.note ? 'Saved.' : 'Day note cleared.' });
    } catch (e) {
      setMsg({ ok: false, text: await readApiError(e) });
    }
  };
  const empty = !text.trim() && !att.length;
  return (
    <div className="jr-field">
      <MarkdownEditor id={`jr-daynote-${day}`} label={`Day note for ${day}`} value={text} onChange={setText} rows={7}
        placeholder="Plan, what happened, what you'd repeat or never do again…" />
      <AttachmentsField idPrefix={`jr-daynote-${day}`} value={att} onChange={setAtt} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="jr-btn jr-btn-sm jr-btn-primary" disabled={!dirty || save.isPending} onClick={submit}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {!empty ? 'Save day note' : note ? 'Clear day note' : 'Save day note'}
        </button>
        {note && <span className="jr-n">saved {new Date(note.postedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
        {msg && <span className={msg.ok ? 'jr-gain' : 'jr-loss'} role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12 }}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** The day's own numbers + its running P&L through the session. */
function DayStatsBlock({ day, trades, stats }: { day: string; trades: JTrade[]; stats: DayStats }) {
  const curve = dayEquity(trades, day);
  const closed = trades.filter((t) => t.status !== 'open');
  const best = closed.reduce((m, t) => Math.max(m, t.netPnl), -Infinity);
  const worst = closed.reduce((m, t) => Math.min(m, t.netPnl), Infinity);
  const high = Math.max(0, ...curve.map((p) => p.cum));
  const low = Math.min(0, ...curve.map((p) => p.cum));
  return (
    <div>
      <div className="jr-kpi-l" style={{ marginBottom: 6 }}>Day stats <span className="jr-n">n={stats.trades} closed</span></div>
      <div className="jr-stats" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <div><span>Net P&amp;L</span><b><Pnl value={stats.netPnl} /></b><small>fees {fmtMoney(stats.fees, { signed: false })}</small></div>
        <div><span>Win rate</span><b>{fmtPct(stats.trades ? stats.wins / stats.trades : null)}</b><small>{stats.wins}W/{stats.losses}L{stats.breakevens ? `/${stats.breakevens}BE` : ''}</small></div>
        <div><span>Best / worst</span><b style={{ fontSize: 12 }}><Pnl value={Number.isFinite(best) ? best : null} compact /> / <Pnl value={Number.isFinite(worst) ? worst : null} compact /></b><small>single trades</small></div>
        <div><span>Intraday high</span><b><Pnl value={high || null} compact /></b><small>running P&amp;L peak</small></div>
        <div><span>Intraday low</span><b><Pnl value={low || null} compact /></b><small>running P&amp;L trough</small></div>
        <div><span>Closes</span><b>{curve.length}</b><small>points below</small></div>
      </div>
      {curve.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Sparkline values={curve.map((p) => p.cum)} height={46} label={`Running P&L through ${day}: ends at ${fmtMoney(curve[curve.length - 1].cum)} after ${curve.length} closes`} />
          <div className="jr-n" style={{ display: 'flex', justifyContent: 'space-between' }}><span>first close</span><span>running net P&amp;L by close, New York day</span><span>last close</span></div>
        </div>
      )}
    </div>
  );
}

/** Recap from measured stats only. */
function DayRecap({ day, trades, reviews }: { day: string; trades: JTrade[]; reviews: Map<string, import('@/lib/journal/metrics-extra').TradeReview> }) {
  const { data } = useJournal();
  const lines = dayRecap(day, trades, data.days, reviews);
  if (!lines.length) return null;
  return (
    <div className="jr-recap">
      <div className="jr-kpi-l">Recap <span className="jr-n">from the day's numbers</span></div>
      <ul>{lines.map((l) => <li key={l.k} className={l.tone ? `jr-${l.tone}-mark` : undefined}>{l.text}</li>)}</ul>
    </div>
  );
}
