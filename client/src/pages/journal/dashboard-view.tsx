/**
 * Journal · Dashboard — a normal page (feat/jnav, 2026-09-29). It used to be
 * the platform's tile grid (the "Bullflow card look": fixed-height tiles with
 * their own scrollbars); the operator had to scroll inside cards. Now every
 * section sits at its natural height and the journal body is the one scroller.
 *
 * Widget set still follows LuxAlgo Trade Journal's dashboard
 * (apps/web/src/app/page.tsx, MIT — client/src/lib/journal/LICENSE-luxalgo.txt):
 * KPIs · cumulative P&L + relative drawdown · edge score · calendar ·
 * activity · trade-time performance — plus our "what to stop doing" teaser,
 * so the Insights page is one click from the landing page.
 *
 * Every number reads the selected book + filters (journal context) and
 * names its n. The registry tools (components/dashboard/defs/journal.ts)
 * remain for other pages that place a journal widget.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { useJournal } from '@/components/journal/journal-context';
import { LowSample, N, Pnl } from '@/components/journal/parts';
import { CalendarPnl } from '@/components/journal/calendar-pnl';
import { EquityChart } from '@/components/journal/equity-chart';
import { TradeMiniList } from '@/components/journal/trade-mini-list';
import { EdgeRadar, RelativeDrawdownBars, TimeHeatmap } from '@/components/journal/lux-charts';
import { fmtDuration, fmtMoney, fmtPct, fmtRatio, toTrade } from '@/lib/journal/metrics';
import { edgeScore, relativeDrawdown, timeGrid, EDGE_MIN_CLOSED } from '@/lib/journal/metrics-extra';
import { balanceAnchor, useJournalBalance } from '@/lib/journal/use-journal-extra';
import { buildInsights, INSIGHT_DIM_LABEL, stopDoing } from '@/lib/journal/insights';

export { TradeMiniList } from '@/components/journal/trade-mini-list';

export default function DashboardView() {
  const { data, openDay, openTrade, goTo } = useJournal();
  const m = data.metrics;

  // Balance behind the book → anchor for % drawdown (null + reason when none).
  const bal = useJournalBalance(data.key);
  const allTimeNet = useMemo(() => data.allRows.reduce((s, r) => s + (toTrade(r).netPnl || 0), 0), [data.allRows]);
  const anchor = balanceAnchor(bal.data, allTimeNet);
  const why = bal.isError ? 'The balance request failed — no % shown rather than a guess.' : bal.isLoading ? 'Reading the account balance…' : bal.data?.reason ?? (bal.data?.balance && !anchor ? 'The balance minus the book’s P&L is not positive — cannot anchor %.' : null);
  const edge = edgeScore(m, data.curve, anchor?.amount ?? null);
  const rel = useMemo(() => relativeDrawdown(data.curve, anchor?.amount ?? null), [data.curve, anchor?.amount]);

  // Last 7 calendar days vs the 7 before (hidden unless both have trading days).
  const delta = useMemo(() => {
    const today = Date.parse(`${journalDayKey(new Date())}T12:00:00Z`);
    let a = 0, b = 0, na = 0, nb = 0;
    for (const d of data.days) {
      const age = (today - Date.parse(`${d.date}T12:00:00Z`)) / 86_400_000;
      if (age < 7) { a += d.netPnl; na++; } else if (age < 14) { b += d.netPnl; nb++; }
    }
    return na && nb ? { v: a - b, na, nb } : null;
  }, [data.days]);

  const [mode, setMode] = useState<'cumulative' | 'daily'>('cumulative');
  const latest = data.days[data.days.length - 1]?.date ?? journalDayKey(new Date());
  const [ym, setYm] = useState({ y: Number(latest.slice(0, 4)), m: Number(latest.slice(5, 7)) });
  const [tab, setTab] = useState<'recent' | 'open'>('recent');
  const [more, setMore] = useState(false);
  const sorted = useMemo(() => [...data.trades].sort((a, b) => Date.parse(b.closedAt ?? b.openedAt) - Date.parse(a.closedAt ?? a.openedAt)), [data.trades]);
  const activity = tab === 'recent' ? sorted.filter((t) => t.status !== 'open') : sorted.filter((t) => t.status === 'open');
  const activityShown = activity.slice(0, more ? 30 : 8);
  const grid = useMemo(() => timeGrid(data.trades), [data.trades]);
  const leaks = useMemo(() => stopDoing(buildInsights(data.trades), 3), [data.trades]);
  const expired = data.rows.filter((r) => r.expiredAssumed);

  return (
    <div className="jr-page">
      <div className="jr-kpis" aria-label="Key numbers">
        <Kpi k="Net P&L" v={<Pnl value={m.netPnl} />} s={<>n={m.closedTrades} closed{m.fees ? ` · fees ${fmtMoney(m.fees, { signed: false })}` : ''}</>}
          x={delta && <span className={`jr-delta ${delta.v >= 0 ? 'up' : 'down'}`}>{delta.v >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(delta.v), { signed: false, compact: true })} vs prior 7d</span>} />
        <Kpi k="Win rate" v={fmtPct(m.winRate)} s={<>{m.wins}W · {m.breakevens}BE · {m.losses}L <LowSample n={m.closedTrades} /></>} />
        <Kpi k="Profit factor" v={fmtRatio(m.profitFactor, m.profitFactorIsInfinite)} s={<>{fmtMoney(m.grossProfit, { compact: true })} ÷ {fmtMoney(m.grossLoss, { compact: true, signed: false })}</>} />
        <Kpi k="Expectancy" v={<Pnl value={m.expectancy} />} s="per closed trade" />
        <Kpi k="Avg win / loss" v={fmtRatio(m.avgWinLossRatio)} s={<><span className="jr-gain">{fmtMoney(m.avgWin, { compact: true })}</span> / <span className="jr-loss">{fmtMoney(m.avgLoss != null ? -m.avgLoss : null, { compact: true })}</span></>} />
        <Kpi k="Max drawdown" v={m.maxDrawdown ? <span className="jr-loss">{fmtMoney(-m.maxDrawdown)}</span> : '$0.00'} s={edge.maxDrawdownPct != null ? `${fmtPct(edge.maxDrawdownPct, 1)} of balance+peak` : `recovery ${fmtRatio(m.recoveryFactor)}×`} />
        <Kpi k="Day win rate" v={fmtPct(m.dayWinRate)} s={`${m.winningDays} of ${m.tradingDays} days green`} />
        <Kpi k="Streak" v={m.currentStreak > 0 ? `${m.currentStreak}W` : m.currentStreak < 0 ? `${-m.currentStreak}L` : '—'} s={`best ${m.maxWinStreak}W · worst ${m.maxLossStreak}L · hold ${fmtDuration(m.avgDurationMs)}`} />
      </div>

      {expired.length > 0 && (
        <p className="jr-flag" role="note">
          <b>{expired.length}</b> option{expired.length === 1 ? '' : 's'} expired with no closing fill in the broker export — counted at $0 (assumed worthless): <Pnl value={expired.reduce((s, r) => s + Number(r.realizedPnL ?? 0), 0)} />.
          {' '}If one finished in the money, edit its exit.
        </p>
      )}

      <div className="jr-cols jr-cols-8-4">
        <Sec title="Cumulative P&L" meta={
          <>
            <N n={mode === 'cumulative' ? data.curve.length : data.days.length} unit={mode === 'cumulative' ? 'closes' : 'days'} />
            <div className="jr-seg" role="group" aria-label="Chart mode">
              <button type="button" aria-pressed={mode === 'cumulative'} onClick={() => setMode('cumulative')}>CUMULATIVE</button>
              <button type="button" aria-pressed={mode === 'daily'} onClick={() => setMode('daily')}>DAILY</button>
            </div>
          </>
        }>
          <EquityChart curve={data.curve} days={data.days} mode={mode} height={200} />
          {mode === 'cumulative' && <RelativeDrawdownBars data={rel} why={why} height={60} />}
        </Sec>
        <Sec title="Edge score" meta={<><N n={edge.closedTrades} /><span className="jr-n">formula v{edge.version}</span></>}>
          <div className="jr-edge">
            <span className="jr-tool-big">{edge.score == null ? '—' : Math.round(edge.score)}<span className="jr-n"> /100</span></span>
            {edge.withheld && <p className="jr-note" style={{ margin: 0 }}>{edge.withheld}{edge.closedTrades >= EDGE_MIN_CLOSED && why ? ` ${why}` : ''}</p>}
          </div>
          {edge.closedTrades > 0 && <EdgeRadar components={edge.components} size={220} />}
        </Sec>
      </div>

      <Sec title="What to stop doing" meta={<button type="button" className="jr-btn jr-btn-sm" onClick={() => goTo('insights')}>All insights <ArrowRight className="h-3.5 w-3.5" /></button>}>
        {leaks.length ? (
          <ol className="jr-leaks">
            {leaks.map((f) => (
              <li key={f.dim + f.key}>
                <span className="jr-n">{INSIGHT_DIM_LABEL[f.dim]}</span> <b>{f.key}</b> — <Pnl value={f.net} /> over n={f.n}, {fmtPct(f.winRate)} win{f.bothHalves ? ', lost in both halves' : ''} <LowSample n={f.n} />
              </li>
            ))}
          </ol>
        ) : <p className="jr-note">No pattern with 5+ closed trades lost money in this view.</p>}
      </Sec>

      <div className="jr-cols jr-cols-7-5">
        <Sec title="P&L calendar" meta={<N n={m.tradingDays} unit="trading days" />}>
          <CalendarPnl days={data.days} year={ym.y} month={ym.m} onMonth={(y, mm) => setYm({ y, m: mm })} onSelect={(d) => d && openDay(d)} showWeeks />
        </Sec>
        <Sec title="Activity" meta={
          <div className="jr-seg" role="group" aria-label="Activity">
            <button type="button" aria-pressed={tab === 'recent'} onClick={() => { setTab('recent'); setMore(false); }}>RECENT</button>
            <button type="button" aria-pressed={tab === 'open'} onClick={() => { setTab('open'); setMore(false); }}>OPEN · {m.openTrades}</button>
          </div>
        }>
          {activityShown.length ? <TradeMiniList trades={activityShown} onOpen={(id) => openTrade(id, activity.map((t) => t.id))} /> : <p className="jr-note">{tab === 'open' ? 'Flat — no open positions in view.' : 'No closed trades in view.'}</p>}
          <div className="jr-row-actions">
            {activity.length > 8 && <button type="button" className="jr-btn jr-btn-sm" onClick={() => setMore((v) => !v)}>{more ? 'Show fewer' : `Show more (${Math.min(30, activity.length)})`}</button>}
            <button type="button" className="jr-btn jr-btn-sm" onClick={() => goTo('trades')}>All {data.trades.length} trades <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </Sec>
      </div>

      <Sec title="Trade time performance" meta={<><N n={grid.n} /><span className="jr-n">entry weekday × hour, New York</span></>}>
        <TimeHeatmap grid={grid} />
      </Sec>
    </div>
  );
}

function Kpi({ k, v, s, x }: { k: string; v: ReactNode; s?: ReactNode; x?: ReactNode }) {
  return (
    <div className="jr-kpi">
      <div className="jr-kpi-l">{k}</div>
      <div className="jr-kpi-v">{v}</div>
      {s != null && <div className="jr-kpi-s">{s}</div>}
      {x}
    </div>
  );
}

function Sec({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="jr-card" aria-label={title}>
      <div className="jr-card-h"><h2 className="jr-card-t">{title}</h2>{meta && <div className="jr-card-meta">{meta}</div>}</div>
      {children}
    </section>
  );
}
