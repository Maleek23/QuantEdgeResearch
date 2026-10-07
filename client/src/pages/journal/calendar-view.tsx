/**
 * Journal · Calendar — LuxAlgo's Calendar page (apps/web/src/app/calendar) as a
 * full page: the month grid (the same CalendarPnl the Dashboard uses, larger),
 * a week view, a year strip of monthly totals, and a day drill-down with that
 * day's closed trades and notes. Computed from the filtered rows of the
 * selected book; days are New York trading days.
 *
 * 2026-09-29 (LuxAlgo calendar-day-preview / calendar-insights parity):
 * hovering or focusing a day previews its running P&L and trades, and an
 * insights card reads the filtered days — green-day %, average green/red day,
 * best / worst weekday (with n days each) and day streaks.
 *
 * 2026-09-29: Mon–Fri only. Weekend (crypto) closes roll into the Friday cell
 * — month grid, week view, the day drill-down and its preview all read
 * Friday + the following Saturday/Sunday of the same month as one cell.
 */
import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { positionBiasText } from '@shared/position-bias';
import { CalendarPnl } from '@/components/journal/calendar-pnl';
import { useJournal } from '@/components/journal/journal-context';
import { Card, N, Pnl, fmtDayLabel } from '@/components/journal/parts';
import { fmtMoney, fmtPct, mergeDays, unverifiedSummary, weekKey, withUnverifiedDays, type DayStats, type JTrade } from '@/lib/journal/metrics';
import { calendarInsights, dayEquity } from '@/lib/journal/metrics-extra';
import { Sparkline } from '@/components/journal/lux-charts';
import { fmtStamp, noteKindLabel } from '@/lib/journal/use-journal';
import { TradeMiniList } from '@/components/journal/trade-mini-list';

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const EMPTY_DAY = (date: string): DayStats => ({ date, netPnl: 0, fees: 0, trades: 0, wins: 0, losses: 0, breakevens: 0 });
const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
/**
 * The dates one calendar cell stands for: a Friday carries the Saturday and
 * Sunday after it (same month only — the next month's grid shows its own);
 * a weekend-only cell (its Friday is in the previous month) carries the rest
 * of that weekend. Any other day is itself.
 */
function cellDates(day: string): string[] {
  const w = dow(day);
  const ext = w === 5 ? [1, 2] : w === 6 ? [1] : [];
  return [day, ...ext.map((n) => addDays(day, n)).filter((d) => d.slice(0, 7) === day.slice(0, 7))];
}

export default function CalendarView() {
  const { data, openTrade, goTo, filters, openDay, prefs } = useJournal();
  // Day lists show every close (unverified ones labelled); day P&L stays verified.
  const { listTrades: trades, days, notesQ } = data;
  const calDays = useMemo(() => withUnverifiedDays(days, trades), [days, trades]);
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

  const statsOf = (d: string): DayStats => byDate.get(d) ?? EMPTY_DAY(d);
  /** Mon–Fri of the week; Friday also carries Sat + Sun (weekKey is Monday-first). */
  const weekAll = useMemo(() => Array.from({ length: 7 }, (_, i) => statsOf(addDays(weekOf, i))), [byDate, weekOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const week = useMemo(() => [...weekAll.slice(0, 4), mergeDays(weekAll[4].date, weekAll.slice(4))], [weekAll]);
  const weekendTrades = weekAll[5].trades + weekAll[6].trades;
  const weekNet = weekAll.reduce((s, d) => s + d.netPnl, 0);
  const weekTrades = weekAll.reduce((s, d) => s + d.trades, 0);
  /** One cell's trades / stats: the day plus, for a Friday, its weekend. */
  const cellTrades = (d: string) => cellDates(d).flatMap((x) => closedOn.get(x) ?? []);
  const cellStats = (d: string) => { const ds = cellDates(d).map(statsOf); return ds.length > 1 ? mergeDays(d, ds) : ds[0]; };

  const selectDay = (d: string | null) => { setDay(d); if (d) setWeekOf(weekKey(d)); };
  const daySpan = day ? cellDates(day) : [];
  const dayTrades = day ? cellTrades(day).slice().sort((a, b) => Date.parse(a.closedAt!) - Date.parse(b.closedAt!)) : [];
  const dayStats = day ? cellStats(day) : null;
  const dayHasWeekend = daySpan.slice(1).some((d) => (byDate.get(d)?.trades ?? 0) > 0);
  const dayNotes = day ? (notesQ.data?.notes ?? []).filter((n) => daySpan.includes(n.day) && n.reason !== 'playbook' && n.reason !== 'trade_review') : [];

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
              <CalendarPnl days={calDays} year={ym.y} month={ym.m} onMonth={(y, m) => { setYm({ y, m }); selectDay(null); }} selected={day} onSelect={selectDay} showWeeks
                renderPreview={(d) => <DayPreview day={d} trades={cellTrades(d.date)} notes={(notesQ.data?.notes ?? []).filter((n) => cellDates(d.date).includes(n.day) && n.reason !== 'playbook' && n.reason !== 'trade_review').length} />} />
            </div>
          ) : (
            <div>
              <div className="jr-cal-nav" style={{ marginBottom: 10 }}>
                <button type="button" className="jr-icon-btn" onClick={() => setWeekOf(addDays(weekOf, -7))} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
                <div className="jr-cal-month" aria-live="polite">{fmtDayLabel(weekOf, { month: 'short', day: 'numeric' })} – {fmtDayLabel(addDays(weekOf, 4), { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <button type="button" className="jr-icon-btn" onClick={() => setWeekOf(addDays(weekOf, 7))} aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="jr-week">
                {week.map((d, i) => (
                  <button key={d.date} type="button" className="jr-week-day" aria-pressed={day === d.date} disabled={d.trades === 0}
                    onClick={() => selectDay(day === d.date ? null : d.date)}
                    aria-label={`${fmtDayLabel(d.date)}${i === 4 && weekendTrades ? ' incl. weekend' : ''}: ${d.trades ? `${fmtMoney(d.netPnl)}, ${d.trades} closed` : 'no closed trades'}`}>
                    <span className="wd">{fmtDayLabel(d.date, { weekday: 'short', day: 'numeric' })}{i === 4 && weekendTrades > 0 && <span className="jr-cal-wk"> +wknd</span>}</span>
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
                <span>{weekAll.filter((d) => d.trades).length} trading days · {weekTrades} closed trades</span>
                <span>Week: <Pnl value={weekNet} /></span>
              </div>
            </div>
          )}
        </Card>

        <Card className="jr-span-4" num="02" title={day ? fmtDayLabel(day) : 'Day'} id="jr-cal-day"
          meta={day ? <N n={dayTrades.length} unit={dayHasWeekend ? 'closed incl. weekend' : 'closed'} /> : undefined}>
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
              {(() => {
                const u = unverifiedSummary(dayTrades);
                return u.count > 0 ? <p className="jr-note" style={{ margin: 0, color: 'var(--amber,#facc15)' }}>incl. unverified: {fmtMoney((dayStats?.netPnl ?? 0) + u.netPnl)} — {u.count} unverified close{u.count === 1 ? '' : 's'} ({fmtMoney(u.netPnl)}) listed below, not in the verified day P&amp;L.</p> : null;
              })()}
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
                  onClick={() => { filters.setRange('custom'); filters.setFilter('from', day); filters.setFilter('to', dayHasWeekend ? daySpan[daySpan.length - 1] : day); goTo('trades'); }}>
                  Open in Trades <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <CalendarInsightsCard days={days} />

      <Card num="04" title={`${ym.y} by month`} meta={
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

/** Hover / focus preview of one day (LuxAlgo calendar-day-preview): running P&L step line + its trades. */
function DayPreview({ day, trades, notes }: { day: DayStats; trades: JTrade[]; notes: number }) {
  const curve = dayEquity(trades, day.date);
  const sorted = [...trades].sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl));
  return (
    <div style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <b>{fmtDayLabel(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</b>
        <Pnl value={day.netPnl} />
      </div>
      {curve.length > 0 && <Sparkline values={curve.map((p) => p.cum)} height={42} label={`Running net P&L across ${curve.length} closes`} />}
      <span className="jr-n">{day.trades} closed · {day.wins}W/{day.losses}L{day.breakevens ? `/${day.breakevens}BE` : ''} · fees {fmtMoney(day.fees, { signed: false })}{notes ? ` · ${notes} note${notes === 1 ? '' : 's'}` : ''}</span>
      {sorted.slice(0, 4).map((t) => (
        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
          <span className="jr-sym">{t.symbol} <span className="jr-n">{positionBiasText({ direction: t.direction, assetType: t.assetType, optionType: t.row.optionType })}</span></span><Pnl value={t.netPnl} compact />
        </div>
      ))}
      {sorted.length > 4 && <span className="jr-n">+{sorted.length - 4} more · click the day</span>}
    </div>
  );
}

/** calendar-insights on the filtered days. */
function CalendarInsightsCard({ days }: { days: DayStats[] }) {
  const ci = calendarInsights(days);
  if (!ci.tradingDays) return null;
  const maxAbs = Math.max(1, ...ci.weekdays.map((w) => Math.abs(w.avg ?? 0)));
  return (
    <Card num="03" title="Calendar Insights" meta={<N n={ci.tradingDays} unit="trading days" />}>
      <div className="jr-grid" style={{ gap: 12 }}>
        <div className="jr-span-6">
          <div className="jr-stats">
            <div><span>Green days</span><b>{fmtPct(ci.greenPct)}</b><small>{ci.greenDays} green · {ci.redDays} red{ci.flatDays ? ` · ${ci.flatDays} flat` : ''}</small></div>
            <div><span>Average day</span><b><Pnl value={ci.avgDay} /></b><small>n={ci.tradingDays} days</small></div>
            <div><span>Avg green / red day</span><b style={{ fontSize: 13 }}><Pnl value={ci.avgGreenDay} compact /> / <Pnl value={ci.avgRedDay} compact /></b><small>{ci.greenDays} / {ci.redDays} days</small></div>
            <div><span>Day streaks</span><b>{ci.maxGreenStreak}G / {ci.maxRedStreak}R</b><small>now {ci.currentStreak > 0 ? `${ci.currentStreak} green` : ci.currentStreak < 0 ? `${-ci.currentStreak} red` : '—'}</small></div>
            <div><span>Best weekday</span><b>{ci.bestWeekday?.weekday ?? '—'}</b><small>{ci.bestWeekday ? <>avg <Pnl value={ci.bestWeekday.avg} compact /> · n={ci.bestWeekday.days} days</> : '—'}</small></div>
            <div><span>Worst weekday</span><b>{ci.worstWeekday?.weekday ?? '—'}</b><small>{ci.worstWeekday ? <>avg <Pnl value={ci.worstWeekday.avg} compact /> · n={ci.worstWeekday.days} days</> : 'needs 2+ weekdays'}</small></div>
          </div>
        </div>
        <div className="jr-span-6">
          <div className="jr-kpi-l" style={{ marginBottom: 6 }}>Average day by weekday <span className="jr-n">closing day, ET</span></div>
          <div className="jr-bars">
            {[...ci.weekdays, ...(ci.weekend ? [{ ...ci.weekend, weekday: 'Wknd' }] : [])].map((w) => (
              <div className="jr-bar-row" key={w.weekday}>
                <span className="jr-bar-k">{w.weekday}</span>
                <span className="jr-bar-track" aria-hidden><span className={`jr-bar-fill ${(w.avg ?? 0) >= 0 ? 'pos' : 'neg'}`} style={{ width: `${(Math.abs(w.avg ?? 0) / maxAbs) * 50}%` }} /></span>
                <span className="jr-bar-v"><Pnl value={w.avg} compact /> <span className="jr-n">· {w.green}/{w.days} green · n={w.days}d</span></span>
              </div>
            ))}
          </div>
          <p className="jr-note">A weekday with few days is an anecdote — read its n before its average.{ci.weekend ? ' Wknd = Saturday/Sunday closes (crypto); best/worst weekday read Mon–Fri only.' : ''}</p>
        </div>
      </div>
    </Card>
  );
}
