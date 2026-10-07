/**
 * The P&L calendar — an HTML grid, not a chart.
 *
 * Ported from LuxAlgo Trade Journal (apps/web/src/components/calendar-pnl.tsx),
 * https://github.com/LuxAlgo/trade-journal — MIT License, Copyright (c) 2026
 * LuxAlgo Global, LLC (notice: client/src/lib/journal/LICENSE-luxalgo.txt).
 * Changes: Monday-first weeks, month navigation, days are buttons that select a
 * day (instead of Next.js links to a daily-journal route), our tokens.
 * 2026-09-29: Mon–Fri columns only. Saturday/Sunday closes (crypto) roll into
 * the Friday cell, which then prints a "+wknd" note and says so in its label;
 * the week column still totals all seven days.
 *
 * Each traded day prints its signed P&L and trade count; the background tint
 * scales with magnitude (lightness carries magnitude, which survives colour
 * vision deficiency; the printed number carries sign).
 */
import { useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarMonth, fmtMoney, fridayWithWeekend, type DayStats } from '@/lib/journal/metrics';
import { Pnl } from './parts';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** Cell-sized money: whole dollars under $1K, compact above. The exact value is in the label. */
function cellMoney(v: number): string {
  if (Math.abs(v) >= 1000) return fmtMoney(v, { compact: true });
  const r = Math.round(v);
  return r > 0 ? `+$${r}` : r < 0 ? `−$${-r}` : '$0';
}

export function CalendarPnl({ days, year, month, onMonth, selected, onSelect, showWeeks = true, renderPreview }: {
  days: DayStats[];
  year: number;
  month: number;
  onMonth: (year: number, month: number) => void;
  selected?: string | null;
  onSelect?: (date: string | null) => void;
  showWeeks?: boolean;
  /** Day preview shown while a traded day is hovered or focused (LuxAlgo calendar-day-preview). */
  renderPreview?: (day: DayStats) => ReactNode;
}) {
  const [peek, setPeek] = useState<string | null>(null);
  const cal = calendarMonth(days, year, month);
  // The fifth cell of each row is Friday + that week's weekend (see metrics.fridayWithWeekend).
  const rows = cal.weeks.map((w) => {
    const fw = fridayWithWeekend(w);
    return { week: w, cells: [...w.days.slice(0, 4), fw.cell], weekend: fw.weekend };
  });
  const maxAbs = Math.max(1, ...rows.flatMap((r) => r.cells.map((d) => Math.abs(d?.netPnl ?? 0))));
  const label = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const step = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    onMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
  };

  return (
    <div>
      <div className="jr-cal-nav" style={{ marginBottom: 10 }}>
        <button type="button" className="jr-icon-btn" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <div className="jr-cal-month" aria-live="polite">{label}</div>
        <button type="button" className="jr-icon-btn" onClick={() => step(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className={`jr-cal${showWeeks ? ' with-weeks' : ''}`} role="grid" aria-label={`P&L calendar, ${label}`}>
        {WD.map((w) => <div key={w} className="jr-cal-wd" role="columnheader">{w}</div>)}
        {showWeeks && <div className="jr-cal-weekhead" role="columnheader">Week</div>}
        {rows.map(({ week, cells, weekend }, wi) => (
          <div key={wi} role="row" style={{ display: 'contents' }}>
            {cells.map((day, di) => {
              if (!day) return <div key={di} className="jr-cal-day blank" role="gridcell" />;
              const traded = day.trades > 0 || (day.unverified ?? 0) > 0;
              const dom = Number(day.date.slice(8));
              const wk = di === 4 && weekend.length > 0;
              const wkNote = wk ? `incl. weekend ${weekend.map((w) => `${w.date.slice(5)} ${fmtMoney(w.netPnl)}`).join(', ')}` : '';
              if (!traded) {
                return <div key={day.date} className="jr-cal-day" role="gridcell"><span className="jr-cal-d">{dom}</span></div>;
              }
              const intensity = 0.1 + 0.4 * (Math.abs(day.netPnl) / maxAbs);
              const hue = day.netPnl > 0 ? 'var(--jr-gain)' : day.netPnl < 0 ? 'var(--jr-loss)' : 'var(--text-mute)';
              const isSel = selected === day.date;
              return (
                <div key={day.date} role="gridcell" className={renderPreview ? 'jr-cal-cell' : undefined} style={renderPreview ? undefined : { display: 'contents' }}
                  onMouseEnter={renderPreview ? () => setPeek(day.date) : undefined} onMouseLeave={renderPreview ? () => setPeek(null) : undefined}>
                  <button
                    onFocus={renderPreview ? () => setPeek(day.date) : undefined}
                    onBlur={renderPreview ? () => setPeek(null) : undefined}
                    aria-describedby={renderPreview && peek === day.date ? `jr-peek-${day.date}` : undefined}
                    type="button"
                    className={day.netPnl !== 0 ? 'jr-cal-day jr-cal-tint' : 'jr-cal-day'}
                    aria-pressed={isSel}
                    aria-label={`${day.date}: ${fmtMoney(day.netPnl)}, ${day.trades} trade${day.trades === 1 ? '' : 's'}, ${day.wins} win${day.wins === 1 ? '' : 's'}${day.unverified ? `, ${day.unverified} unverified` : ''}${wk ? ` (${wkNote})` : ''}`}
                    title={wk ? wkNote : undefined}
                    onClick={() => onSelect?.(isSel ? null : day.date)}
                    style={{ background: `color-mix(in srgb, ${hue} ${Math.round(intensity * 100)}%, var(--panel-solid, #0e1117))` }}
                  >
                    <span className="jr-cal-d">{dom}</span>
                    <span className="jr-cal-p">{cellMoney(day.netPnl)}</span>
                    <span className="jr-cal-t">{day.trades} trade{day.trades === 1 ? '' : 's'}</span>
                    {(day.unverified ?? 0) > 0 && <span className="jr-cal-t" style={{ color: 'var(--amber,#facc15)' }} title={`${day.unverified} unverified close${day.unverified === 1 ? '' : 's'} (recorded ${fmtMoney(day.unverifiedPnl ?? 0)}) — listed, not in this day's verified P&L`}>+{day.unverified} unverified</span>}
                    {wk && <span className="jr-cal-wk">+wknd</span>}
                  </button>
                  {renderPreview && peek === day.date && (
                    <div className={`jr-peek${di >= 3 ? ' left' : ''}${wi >= cal.weeks.length - 2 ? ' up' : ''}`} role="tooltip" id={`jr-peek-${day.date}`}>{renderPreview(day)}</div>
                  )}
                </div>
              );
            })}
            {showWeeks && (
              <div className="jr-cal-week" role="gridcell">
                {week.weekTrades > 0 ? (
                  <>
                    <Pnl value={week.weekNetPnl} compact />
                    <span className="jr-mute" style={{ fontSize: 10 }}>{week.weekTrades} trades</span>
                  </>
                ) : <span className="jr-mute">–</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="jr-cal-foot">
        {rows.some((r) => r.weekend.length > 0) && <span>Mon–Fri · weekend closes roll into Friday (+wknd)</span>}
        <span>{cal.tradingDays} trading day{cal.tradingDays === 1 ? '' : 's'} · {cal.winningDays} green · {cal.monthTrades} closed trades</span>
        <span>Month: <Pnl value={cal.monthNetPnl} /></span>
      </div>
    </div>
  );
}
