/**
 * Journal · Calendar — LuxAlgo's Calendar page (apps/web/src/app/calendar) as a
 * full page: the month grid (the same CalendarPnl the Dashboard uses, larger),
 * a week view, a year strip of monthly totals, and a day drill-down with that
 * day's closed trades and notes. Computed from the filtered rows of the
 * selected book; days are New York trading days.
 */
import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { CalendarPnl } from '@/components/journal/calendar-pnl';
import { useJournal } from '@/components/journal/journal-context';
import { Card, N, Pnl, fmtDayLabel } from '@/components/journal/parts';
import { fmtMoney, fmtPct, weekKey, type DayStats } from '@/lib/journal/metrics';
import { fmtStamp, noteKindLabel } from '@/lib/journal/use-journal';
import { TradeMiniList } from './dashboard-view';

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const EMPTY_DAY = (date: string): DayStats => ({ date, netPnl: 0, fees: 0, trades: 0, wins: 0, losses: 0, breakevens: 0 });

export default function CalendarView() {
  const { data, openTrade, goTo, filters, openDay, prefs } = useJournal();
  const { trades, days, notesQ } = data;
  const latest = days[days.length - 1]?.date ?? journalDayKey(new Date());
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [ym, setYm] = useState<{ y: number; m: number }>({ y: Number(latest.slice(0, 4)), m: Number(latest.slice(5, 7)) });
  const [day, setDay] = useState<string | null>(null);
  const [weekOf, setWeekOf] = useState<string>(weekKey(latest));

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const closedOn = useMemo(() => {
    const m = new Map<string, typeof trades>();
    for (const t of trades) {
      if (!t.closedAt) continue;
      const k = journalDayKey(t.closedAt);
      const list = m.get(k);
      if (list) list.push(t); else m.set(k, [t]);
    }
    return m;
  }, [trades]);

  // Year strip: net P&L per month of the year on screen.
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const prefix = `${ym.y}-${String(i + 1).padStart(2, '0')}`;
    const ds = days.filter((d) => d.date.startsWith(prefix));
    return { m: i + 1, net: ds.reduce((s, d) => s + d.netPnl, 0), trades: ds.reduce((s, d) => s + d.trades, 0), days: ds.length };
  }), [days, ym.y]);

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => byDate.get(addDays(weekOf, i)) ?? EMPTY_DAY(addDays(weekOf, i))), [byDate, weekOf]);
  const weekNet = week.reduce((s, d) => s + d.netPnl, 0);
  const weekTrades = week.reduce((s, d) => s + d.trades, 0);

  const selectDay = (d: string | null) => { setDay(d); if (d) setWeekOf(weekKey(d)); };
  const dayTrades = day ? (closedOn.get(day) ?? []).slice().sort((a, b) => Date.parse(a.closedAt!) - Date.parse(b.closedAt!)) : [];
  const dayStats = day ? byDate.get(day) ?? null : null;
  const dayNotes = day ? (notesQ.data?.notes ?? []).filter((n) => n.day === day && n.reason !== 'playbook') : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="jr-grid">
        <Card className="jr-span-8" num="01" title={mode === 'month' ? 'Month' : `Week of ${fmtDayLabel(weekOf, { month: 'short', day: 'numeric', year: 'numeric' })}`}
          meta={
            <>
              <N n={days.length} unit="trading days" />
              <div className="jr-seg" role="group" aria-label="Calendar view">
                <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>MONTH</button>
                <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>WEEK</button>
              </div>
            </>
          }>
          {mode === 'month' ? (
            <div className="jr-cal-lg">
              <CalendarPnl days={days} year={ym.y} month={ym.m} onMonth={(y, m) => { setYm({ y, m }); selectDay(null); }} selected={day} onSelect={selectDay} showWeeks />
            </div>
          ) : (
            <div>
              <div className="jr-cal-nav" style={{ marginBottom: 10 }}>
                <button type="button" className="jr-icon-btn" onClick={() => setWeekOf(addDays(weekOf, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
                <div className="jr-cal-month" aria-live="polite">{fmtDayLabel(weekOf, { month: 'short', day: 'numeric' })} – {fmtDayLabel(addDays(weekOf, 6), { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <button type="button" className="jr-icon-btn" onClick={() => setWeekOf(addDays(weekOf, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="jr-week">
                {week.map((d) => (
                  <button key={d.date} type="button" className="jr-week-day" aria-pressed={day === d.date} disabled={d.trades === 0}
                    onClick={() => selectDay(day === d.date ? null : d.date)}
                    aria-label={`${fmtDayLabel(d.date)}: ${d.trades ? `${fmtMoney(d.netPnl)}, ${d.trades} closed` : 'no closed trades'}`}>
                    <span className="wd">{fmtDayLabel(d.date, { weekday: 'short', day: 'numeric' })}</span>
                    {d.trades ? (
                      <>
                        <Pnl value={d.netPnl} compact />
                        <span className="jr-n">{d.trades} closed · {d.wins}W/{d.losses}L</span>
                      </>
                    ) : <span className="jr-mute">–</span>}
                  </button>
                ))}
              </div>
              <div className="jr-cal-foot">
                <span>{week.filter((d) => d.trades).length} trading days · {weekTrades} closed trades</span>
                <span>Week: <Pnl value={weekNet} /></span>
              </div>
            </div>
          )}
        </Card>

        <Card className="jr-span-4" num="02" title={day ? fmtDayLabel(day) : 'Day'} id="jr-cal-day"
          meta={day ? <N n={dayTrades.length} unit="closed" /> : undefined}>
          {!day ? (
            <p className="jr-note" style={{ marginTop: 0 }}>Select a traded day to see its trades and notes.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dayStats && dayStats.trades > 0 && (
                <div className="jr-stats">
                  <div><span>Net P&amp;L</span><b><Pnl value={dayStats.netPnl} /></b><small>fees {fmtMoney(dayStats.fees, { signed: false })}</small></div>
                  <div><span>Win rate</span><b>{fmtPct(dayStats.trades ? dayStats.wins / dayStats.trades : null)}</b><small>{dayStats.wins}W / {dayStats.losses}L{dayStats.breakevens ? ` / ${dayStats.breakevens}BE` : ''}</small></div>
                </div>
              )}
              <TradeMiniList trades={dayTrades} onOpen={(id) => openTrade(id, dayTrades.map((t) => t.id))} />
              {dayNotes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="jr-kpi-l">Notes</div>
                  {dayNotes.map((n) => (
                    <article key={n.id} className="jr-note-item">
                      <div className="h"><span className="jr-tag">{noteKindLabel(n.reason, n.source)}</span><time dateTime={n.postedAt}>{fmtStamp(n.postedAt, prefs.timeDisplay, { hour: 'numeric', minute: '2-digit' })}</time></div>
                      <div className="b">{n.body.length > 400 ? `${n.body.slice(0, 400)}…` : n.body}</div>
                    </article>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="jr-btn jr-btn-sm jr-btn-primary" onClick={() => openDay(day)}>Daily journal <ArrowRight className="h-3.5 w-3.5" /></button>
                <button type="button" className="jr-btn jr-btn-sm"
                  onClick={() => { filters.setRange('custom'); filters.setFilter('from', day); filters.setFilter('to', day); goTo('trades'); }}>
                  Open in Trades <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card num="03" title={`${ym.y} by month`} meta={
        <div className="jr-cal-nav">
          <button type="button" className="jr-icon-btn" onClick={() => setYm((v) => ({ ...v, y: v.y - 1 }))} aria-label="Previous year"><ChevronLeft className="h-4 w-4" /></button>
          <span className="jr-n">{ym.y}</span>
          <button type="button" className="jr-icon-btn" onClick={() => setYm((v) => ({ ...v, y: v.y + 1 }))} aria-label="Next year"><ChevronRight className="h-4 w-4" /></button>
        </div>
      }>
        <div className="jr-months">
          {months.map((x) => (
            <button key={x.m} type="button" className="jr-month" aria-pressed={mode === 'month' && ym.m === x.m}
              onClick={() => { setMode('month'); setYm({ y: ym.y, m: x.m }); selectDay(null); }}
              aria-label={`${fmtDayLabel(`${ym.y}-${String(x.m).padStart(2, '0')}-15`, { month: 'long', year: 'numeric' })}: ${x.trades ? `${fmtMoney(x.net)}, ${x.trades} closed trades on ${x.days} days` : 'no closed trades'}`}>
              <span className="wd">{fmtDayLabel(`${ym.y}-${String(x.m).padStart(2, '0')}-15`, { month: 'short' })}</span>
              {x.trades ? <><Pnl value={x.net} compact /><span className="jr-n">{x.trades} · {x.days}d</span></> : <span className="jr-mute">–</span>}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
