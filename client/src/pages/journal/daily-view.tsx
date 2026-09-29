/**
 * Journal · Daily journal — LuxAlgo's Daily journal (apps/web/src/app/journal):
 * one card per trading day, newest first, each opening to that day's trades,
 * its notes and a free-text day note. Day notes live in journal_notes
 * (reason = 'day_note', one per day, upserted) and are writable only on books
 * the caller can write; read-only books show the day and its trades.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2, NotebookPen } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { QEError, QEEmpty } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { Card, N, Pnl, fmtDayLabel } from '@/components/journal/parts';
import { fmtPct, type JTrade } from '@/lib/journal/metrics';
import type { JournalNoteRow } from '@/lib/journal/types';
import { fmtStamp, noteKindLabel, readApiError, useJournalNoteMutations } from '@/lib/journal/use-journal';
import { TradeMiniList } from './dashboard-view';

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
      if (n.reason === 'playbook') continue;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {notesQ.isError && (
        <QEError title="Journal notes didn't load" message="Days and trades below are unaffected; notes and day notes are missing until this loads." onRetry={() => notesQ.refetch()} retrying={notesQ.isFetching} />
      )}
      {notesUnavailable && (
        <p className="jr-note" style={{ margin: 0 }}>The {bookLabel} book is a ledger — it carries no notes, so days here show trades only.</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <N n={list.length} unit="days" />
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
          />
        ))
      )}
      {list.length > limit && (
        <button type="button" className="jr-btn" onClick={() => setLimit((l) => l + PAGE)}>Show older days · {list.length - limit} more</button>
      )}
    </div>
  );
}

function DayCard({ day, isToday, open, onToggle, trades, notes, stats }: {
  day: string;
  isToday: boolean;
  open: boolean;
  onToggle: () => void;
  trades: JTrade[];
  notes: JournalNoteRow[];
  stats: { netPnl: number; trades: number; wins: number; losses: number } | null;
}) {
  const { openTrade, canWrite, prefs } = useJournal();
  const dayNote = notes.find((n) => n.reason === 'day_note') ?? null;
  const others = notes.filter((n) => n.reason !== 'day_note');
  const sorted = [...trades].sort((a, b) => Date.parse(a.closedAt ?? a.openedAt) - Date.parse(b.closedAt ?? b.openedAt));
  const openCount = trades.filter((t) => t.status === 'open').length;
  const panelId = `jr-day-panel-${day}`;
  return (
    <section className="jr-card jr-day jr-anchor" id={`jr-day-${day}`} aria-label={fmtDayLabel(day)}>
      <button type="button" className="jr-day-h" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <ChevronRight className="chev h-4 w-4" aria-hidden style={{ transform: open ? 'rotate(90deg)' : undefined }} />
        <span className="jr-day-date">
          <b>{fmtDayLabel(day, { month: 'short', day: 'numeric', year: 'numeric' })}</b>
          <span className="jr-mute">{fmtDayLabel(day, { weekday: 'long' })}{isToday ? ' · today' : ''}</span>
        </span>
        {stats && stats.trades > 0 ? (
          <span className="jr-day-stats">
            <Pnl value={stats.netPnl} />
            <span className="jr-n">{stats.trades} closed · {fmtPct(stats.trades ? stats.wins / stats.trades : null)} win · {stats.wins}W/{stats.losses}L</span>
          </span>
        ) : <span className="jr-day-stats jr-mute">{openCount ? `${openCount} opened, still open` : 'no closed trades'}</span>}
        {dayNote && <span className="jr-tag" title="Has a day note"><NotebookPen className="h-3 w-3" aria-hidden /> note</span>}
        {others.length > 0 && <span className="jr-n">{others.length} note{others.length === 1 ? '' : 's'}</span>}
      </button>
      {open && (
        <div id={panelId} className="jr-day-body">
          <div>
            <div className="jr-kpi-l" style={{ marginBottom: 6 }}>Trades</div>
            <TradeMiniList trades={sorted} onOpen={(id) => openTrade(id, sorted.map((t) => t.id))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="jr-kpi-l">Day note</div>
            {canWrite ? <DayNoteEditor day={day} note={dayNote} /> : dayNote ? <div className="jr-notes">{dayNote.body}</div> : <p className="jr-note" style={{ margin: 0 }}>No day note.</p>}
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
  const [text, setText] = useState(note?.body ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setText(note?.body ?? ''); }, [note?.body]);
  const dirty = text.trim() !== (note?.body ?? '').trim();
  const submit = async () => {
    setMsg(null);
    try {
      const r = await save.mutateAsync({ kind: 'day_note', day, body: text });
      setMsg({ ok: true, text: r.note ? 'Saved.' : 'Day note cleared.' });
    } catch (e) {
      setMsg({ ok: false, text: await readApiError(e) });
    }
  };
  return (
    <div className="jr-field">
      <label htmlFor={`jr-daynote-${day}`} className="sr-only">Day note for {day}</label>
      <textarea id={`jr-daynote-${day}`} className="jr-input" value={text} maxLength={20_000}
        placeholder="Plan, what happened, what you'd repeat or never do again…" onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="jr-btn jr-btn-sm jr-btn-primary" disabled={!dirty || save.isPending} onClick={submit}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {text.trim() ? 'Save day note' : note ? 'Clear day note' : 'Save day note'}
        </button>
        {note && <span className="jr-n">saved {new Date(note.postedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
        {msg && <span className={msg.ok ? 'jr-gain' : 'jr-loss'} role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12 }}>{msg.text}</span>}
      </div>
    </div>
  );
}
