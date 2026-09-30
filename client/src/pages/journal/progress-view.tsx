/**
 * Journal · Progress — LuxAlgo's Progress (apps/web/src/app/progress) tracks a
 * routine checklist and a 13-week completion grid. Ours tracks the outcomes the
 * book actually records:
 *   · streaks (trades and days), current and longest
 *   · goals vs actual for this week and month — goals are per book, saved on
 *     this device, and editable only on books the caller can write
 *   · rolling win rate / expectancy over the last N closed trades, with N shown
 *   · the last 13 weeks of trading days
 * Computed on the filtered trades of the selected book.
 */
import { useMemo, useState } from 'react';
import { journalDayKey } from '@shared/journal-filters';
import { QEEmpty } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { Card, Kpi, LowSample, N, Pnl, fmtDayLabel, tone } from '@/components/journal/parts';
import {
  computeMetrics, dailyStats, dayStreaks, fmtMoney, fmtPct, LOW_SAMPLE, periodStart, rollingStats,
} from '@/lib/journal/metrics';

interface Goals { weeklyNet: number | null; minWinRate: number | null; maxDailyLoss: number | null; maxTradesPerDay: number | null }
const NO_GOALS: Goals = { weeklyNet: null, minWinRate: null, maxDailyLoss: null, maxTradesPerDay: null };
const goalsKey = (book: string) => `qe-journal-goals-v1:${book}`;

function readGoals(book: string): Goals {
  try {
    const raw = window.localStorage.getItem(goalsKey(book));
    if (!raw) return NO_GOALS;
    const g = JSON.parse(raw) as Partial<Goals>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return { weeklyNet: num(g.weeklyNet), minWinRate: num(g.minWinRate), maxDailyLoss: num(g.maxDailyLoss), maxTradesPerDay: num(g.maxTradesPerDay) };
  } catch { return NO_GOALS; }
}

const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function ProgressView() {
  const { data, canWrite, bookLabel } = useJournal();
  const { trades, days, metrics: m } = data;
  const today = journalDayKey(new Date());
  const [goals, setGoalsState] = useState<Goals>(() => readGoals(data.key));
  const [bookSeen, setBookSeen] = useState(data.key);
  if (bookSeen !== data.key) { setBookSeen(data.key); setGoalsState(readGoals(data.key)); }
  const saveGoals = (g: Goals) => {
    setGoalsState(g);
    try { window.localStorage.setItem(goalsKey(data.key), JSON.stringify(g)); } catch { /* storage off: kept for this visit */ }
  };

  const ds = useMemo(() => dayStreaks(days), [days]);
  const [win, setWin] = useState<20 | 50>(20);
  const rolling = useMemo(() => rollingStats(trades, win), [trades, win]);
  const last = rolling[rolling.length - 1] ?? null;

  const period = (p: 'week' | 'month') => {
    const from = periodStart(today, p);
    const inP = trades.filter((t) => t.closedAt && journalDayKey(t.closedAt) >= from);
    const pd = dailyStats(inP);
    // Trades per day counts entries, so open positions opened today count too.
    const entries = new Map<string, number>();
    for (const t of trades) { const k = journalDayKey(t.openedAt); if (k >= from) entries.set(k, (entries.get(k) ?? 0) + 1); }
    return { from, pm: computeMetrics(inP, pd), pd, entries };
  };
  const wk = useMemo(() => period('week'), [trades, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const mo = useMemo(() => period('month'), [trades, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // 13 weeks of days, Monday-first columns.
  const grid = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const start = addDays(periodStart(today, 'week'), -7 * 12);
    const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.netPnl)));
    return { cells: Array.from({ length: 91 }, (_, i) => { const date = addDays(start, i); return { date, d: byDate.get(date) ?? null, future: date > today }; }), maxAbs };
  }, [days, today]);

  const streakTxt = (n: number, up: [string, string], down: [string, string]) => (n > 0 ? `${n} ${up[n === 1 ? 0 : 1]}` : n < 0 ? `${-n} ${down[n === -1 ? 0 : 1]}` : '—');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="jr-kpis">
        <Kpi label="Current trade streak" value={streakTxt(m.currentStreak, ['win', 'wins'], ['loss', 'losses'])} tone={m.currentStreak > 0 ? 'gain' : m.currentStreak < 0 ? 'loss' : null} sub={<>closed trades · n={m.closedTrades}</>} />
        <Kpi label="Longest win / loss run" value={`${m.maxWinStreak}W / ${m.maxLossStreak}L`} sub="consecutive closed trades" />
        <Kpi label="Current day streak" value={streakTxt(ds.current, ['green day', 'green'], ['red day', 'red'])} tone={ds.current > 0 ? 'gain' : ds.current < 0 ? 'loss' : null} sub={<>green/red days · n={m.tradingDays}</>} />
        <Kpi label="Longest green / red days" value={`${ds.maxGreen} / ${ds.maxRed}`} sub="consecutive trading days" />
        <Kpi label={`Rolling win rate (${win})`} value={last ? fmtPct(last.winRate, 0) : '—'} sub={last ? <>last {win} closed · all-time {fmtPct(m.winRate)}</> : `needs ${win} closed trades`} />
        <Kpi label={`Rolling expectancy (${win})`} value={last ? fmtMoney(last.expectancy) : '—'} tone={last ? tone(last.expectancy) : null} sub={last ? <>per trade · all-time {fmtMoney(m.expectancy)}</> : `needs ${win} closed trades`} />
      </div>

      <div className="jr-grid">
        <Card className="jr-span-7" num="01" title="Rolling Win Rate & Expectancy"
          meta={
            <>
              <N n={m.closedTrades} />
              <div className="jr-seg" role="group" aria-label="Rolling window">
                <button type="button" aria-pressed={win === 20} onClick={() => setWin(20)}>LAST 20</button>
                <button type="button" aria-pressed={win === 50} onClick={() => setWin(50)}>LAST 50</button>
              </div>
            </>
          }>
          {rolling.length < 2 ? (
            <QEEmpty message={`A rolling window of ${win} needs at least ${win + 1} closed trades; this view has ${m.closedTrades}.`} />
          ) : (
            <>
              <RollingChart points={rolling.map((p) => p.winRate)} label={`Rolling ${win}-trade win rate`} fmt={(v) => fmtPct(v, 0)} ref50 />
              <RollingChart points={rolling.map((p) => p.expectancy)} label={`Rolling ${win}-trade expectancy`} fmt={(v) => fmtMoney(v, { compact: true })} zero />
              <p className="jr-note">Each point is the last {win} closed trades (n={win} each) — {rolling.length} windows from trade {rolling[0].index} to {last!.index}. {win < LOW_SAMPLE ? 'Windows this short swing on luck.' : ''}</p>
            </>
          )}
        </Card>

        <Card className="jr-span-5" num="02" title="Goals vs Actual" meta={<span className="jr-n">{canWrite ? 'saved on this device' : 'read-only book'}</span>}>
          <GoalsTable goals={goals} week={wk} month={mo} />
          {canWrite ? <GoalsForm goals={goals} onSave={saveGoals} /> : (
            <p className="jr-note">Goals belong to the book's owner; {bookLabel} is read-only here, so none can be set. The actuals above are still measured.</p>
          )}
        </Card>
      </div>

      <Card num="03" title="Last 13 Weeks" meta={<N n={grid.cells.filter((c) => c.d?.trades).length} unit="trading days" />}>
        <div className="jr-heat" role="group" aria-label="Trading days, last 13 weeks">
          {Array.from({ length: 13 }, (_, w) => (
            <div key={w} className="jr-heat-col">
              {grid.cells.slice(w * 7, w * 7 + 7).map((c) => {
                const d = c.d;
                const traded = !!d?.trades;
                const hue = !traded ? null : d!.netPnl > 0 ? 'var(--jr-gain)' : d!.netPnl < 0 ? 'var(--jr-loss)' : 'var(--text-mute)';
                const pct = traded ? Math.round((0.18 + 0.6 * Math.abs(d!.netPnl) / grid.maxAbs) * 100) : 0;
                return (
                  <div key={c.date} role="img" className="jr-heat-cell" data-future={c.future}
                    title={`${fmtDayLabel(c.date)}${traded ? `: ${fmtMoney(d!.netPnl)} · ${d!.trades} closed` : ''}`}
                    aria-label={`${fmtDayLabel(c.date)}: ${traded ? `${fmtMoney(d!.netPnl)}, ${d!.trades} closed` : 'no closed trades'}`}
                    style={hue ? { background: `color-mix(in srgb, ${hue} ${pct}%, var(--panel-solid, #0e1117))` } : undefined}>
                    {traded ? (d!.netPnl > 0 ? '+' : d!.netPnl < 0 ? '−' : '0') : ''}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="jr-note">Columns are weeks (Mon→Sun, oldest left). The glyph carries the sign (+ green day, − red day); brightness carries the size.</p>
      </Card>
    </div>
  );
}

type Period = { from: string; pm: ReturnType<typeof computeMetrics>; pd: ReturnType<typeof dailyStats>; entries: Map<string, number> };

function GoalsTable({ goals: g, week, month }: { goals: Goals; week: Period; month: Period }) {
  const rows: { goal: string; target: string; actual: (p: Period) => React.ReactNode; set: boolean }[] = [
    { goal: 'Net P&L', target: g.weeklyNet != null ? `${fmtMoney(g.weeklyNet, { signed: false })} / week` : 'not set', set: g.weeklyNet != null,
      actual: (p) => <><Pnl value={p.pm.netPnl} compact />{g.weeklyNet != null && p === week ? <span className="jr-n"> · {p.pm.netPnl >= g.weeklyNet ? 'met' : `${fmtMoney(g.weeklyNet - p.pm.netPnl, { signed: false, compact: true })} to go`}</span> : null}</> },
    { goal: 'Win rate', target: g.minWinRate != null ? `≥ ${g.minWinRate}%` : 'not set', set: g.minWinRate != null,
      actual: (p) => <>{fmtPct(p.pm.winRate)} <span className="jr-n">n={p.pm.closedTrades}</span>{g.minWinRate != null && p.pm.winRate != null ? <span className="jr-n"> · {p.pm.winRate * 100 >= g.minWinRate ? 'met' : 'below'}</span> : null} <LowSample n={p.pm.closedTrades} /></> },
    { goal: 'Max daily loss', target: g.maxDailyLoss != null ? fmtMoney(-g.maxDailyLoss) : 'not set', set: g.maxDailyLoss != null,
      actual: (p) => { const worst = p.pd.reduce((mn, d) => Math.min(mn, d.netPnl), 0); const breaches = g.maxDailyLoss != null ? p.pd.filter((d) => d.netPnl < -g.maxDailyLoss!).length : null; return <>worst <Pnl value={worst || null} compact />{breaches != null && <span className="jr-n"> · {breaches} day{breaches === 1 ? '' : 's'} over</span>}</>; } },
    { goal: 'Trades per day', target: g.maxTradesPerDay != null ? `≤ ${g.maxTradesPerDay}` : 'not set', set: g.maxTradesPerDay != null,
      actual: (p) => { const counts = [...p.entries.values()]; const max = counts.length ? Math.max(...counts) : 0; const over = g.maxTradesPerDay != null ? counts.filter((c) => c > g.maxTradesPerDay!).length : null; return <>max {max}{over != null && <span className="jr-n"> · {over} day{over === 1 ? '' : 's'} over</span>}</>; } },
  ];
  return (
    <div className="jr-table-wrap">
      <table className="jr-table">
        <thead><tr><th scope="col">Goal</th><th scope="col">Target</th><th scope="col">This week</th><th scope="col">This month</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.goal} style={{ cursor: 'default' }}>
              <td><b>{r.goal}</b></td>
              <td className={r.set ? undefined : 'jr-mute'}>{r.target}</td>
              <td>{r.actual(week)}</td>
              <td>{r.actual(month)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="jr-note">Week from {fmtDayLabel(week.from, { month: 'short', day: 'numeric' })}, month from {fmtDayLabel(month.from, { month: 'short', day: 'numeric' })} (New York days), on the trades in view.</p>
    </div>
  );
}

function GoalsForm({ goals, onSave }: { goals: Goals; onSave: (g: Goals) => void }) {
  const [draft, setDraft] = useState({
    weeklyNet: goals.weeklyNet?.toString() ?? '', minWinRate: goals.minWinRate?.toString() ?? '',
    maxDailyLoss: goals.maxDailyLoss?.toString() ?? '', maxTradesPerDay: goals.maxTradesPerDay?.toString() ?? '',
  });
  const [saved, setSaved] = useState(false);
  const num = (s: string, min = 0) => { const v = Number(s); return s.trim() !== '' && Number.isFinite(v) && v >= min ? v : null; };
  const field = (k: keyof typeof draft, label: string, placeholder: string) => (
    <div className="jr-field">
      <label htmlFor={`jr-goal-${k}`}>{label}</label>
      <input id={`jr-goal-${k}`} className="jr-input" inputMode="decimal" value={draft[k]} placeholder={placeholder}
        onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, [k]: e.target.value })); }} />
    </div>
  );
  return (
    <details className="jr-details" style={{ marginTop: 10 }}>
      <summary className="jr-dim" style={{ fontSize: 12 }}>Set goals</summary>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }} onSubmit={(e) => {
        e.preventDefault();
        onSave({ weeklyNet: num(draft.weeklyNet), minWinRate: num(draft.minWinRate), maxDailyLoss: num(draft.maxDailyLoss), maxTradesPerDay: num(draft.maxTradesPerDay, 1) });
        setSaved(true);
      }}>
        <div className="jr-form-grid">
          {field('weeklyNet', 'Weekly net $', '500')}
          {field('minWinRate', 'Min win rate %', '50')}
          {field('maxDailyLoss', 'Max daily loss $', '300')}
          {field('maxTradesPerDay', 'Max trades / day', '4')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="submit" className="jr-btn jr-btn-sm jr-btn-primary">Save goals</button>
          <span className="jr-n">blank = no goal</span>
          {saved && <span className="jr-gain" role="status" style={{ fontSize: 12 }}>Saved on this device.</span>}
        </div>
      </form>
    </details>
  );
}

/** Minimal inline line chart (no chart dependency): value at each rolling window. */
function RollingChart({ points, label, fmt, zero, ref50 }: { points: number[]; label: string; fmt: (v: number) => string; zero?: boolean; ref50?: boolean }) {
  const W = 600, H = 110, P = 6;
  const lo = Math.min(...points, zero ? 0 : Infinity, ref50 ? 0 : Infinity);
  const hi = Math.max(...points, zero ? 0 : -Infinity, ref50 ? 1 : -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => P + (i / Math.max(1, points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const refV = zero ? 0 : ref50 ? 0.5 : null;
  return (
    <figure className="jr-chart" style={{ margin: '0 0 8px' }}>
      <figcaption className="jr-kpi-l" style={{ marginBottom: 4 }}>{label} · now {fmt(points[points.length - 1])} · range {fmt(Math.min(...points))} to {fmt(Math.max(...points))}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} role="img" aria-label={`${label}: latest ${fmt(points[points.length - 1])}`}>
        {refV != null && <line className="zero" x1={P} x2={W - P} y1={y(refV)} y2={y(refV)} />}
        <path d={d} fill="none" stroke="var(--jr-accent-hi)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
}
