/**
 * Journal · Reports (was Analytics until the 2026-09-29 sidebar) — LuxAlgo's Reports (breakdowns by symbol/tag/mistake/
 * playbook, time-of-day/weekday/duration performance, drawdown) on our rows,
 * as one scrolling page with jump links instead of more tabs. It absorbs the
 * old Trade Log → Insights and → Timing tabs and the Overview's ticker/setup
 * tables, drawdown and weekly P&L cards.
 *
 * Client-computed (filtered rows): breakdowns, weekday/hour/hold time, risk,
 * weekly. Server-computed with the same filters: behaviour insights, session
 * timing, trades-per-day optimum, DTE. Each block says its sample size.
 *
 * 2026-09-29 (LuxAlgo Reports parity, components/journal/reports-extra.tsx):
 * Comparison (two filter sets side by side), Trade explorer (virtualised
 * table, column chooser), Performance trends (rolling metrics), Review export
 * (CSV downloads).
 */
import { useMemo, useState } from 'react';
import type { JournalFilters } from '@shared/journal-filters';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { UnderwaterChart } from '@/components/journal/equity-chart';
import { useJournal } from '@/components/journal/journal-context';
import { BucketBars, BucketTable, Card, LowSample, N, Pnl } from '@/components/journal/parts';
import {
  byDuration, byHour, byWeek, byWeekday, crossBuckets, fmtMoney, fmtPct, fmtRatio, missingDim, reportBuckets,
  REPORT_DIM_LABEL, drawdownPeriods, underwater, type ReportDim,
} from '@/lib/journal/metrics';
import type { BehaviorInsight, TimingInsight } from '@/lib/journal/types';
import { ComparisonCard, PerformanceTrendsCard, ReviewExportCard, TradeExplorerCard } from '@/components/journal/reports-extra';

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

const DIMS: ReportDim[] = ['symbol', 'setup', 'mistake', 'emotion', 'weekday', 'hour', 'duration', 'side', 'asset', 'broker', 'rating'];
const dimOptions = DIMS.map((g) => <option key={g} value={g}>{REPORT_DIM_LABEL[g]}</option>);

export default function ReportsView() {
  const { data, filters } = useJournal();
  const { trades, curve, days, metrics: m, analyticsQ } = data;
  const [by, setBy] = useState<ReportDim>('symbol');
  const [crossA, setCrossA] = useState<ReportDim>('setup');
  const [crossB, setCrossB] = useState<ReportDim>('weekday');

  const buckets = useMemo(() => reportBuckets(trades, by), [trades, by]);
  const missing = useMemo(() => missingDim(trades, by), [trades, by]);
  const cross = useMemo(() => (crossA === crossB ? [] : crossBuckets(trades, crossA, crossB)), [trades, crossA, crossB]);
  const weekday = useMemo(() => byWeekday(trades), [trades]);
  const hour = useMemo(() => byHour(trades).map((b) => ({ ...b, key: `${b.key}:00 ET` })), [trades]);
  const hold = useMemo(() => byDuration(trades), [trades]);
  const weeks = useMemo(() => byWeek(days).slice(-12).reverse(), [days]);
  const uw = useMemo(() => underwater(curve), [curve]);
  const periods = useMemo(() => drawdownPeriods(curve).slice(0, 5), [curve]);

  /** Click a bucket → filter the whole journal to it (LuxAlgo: breakdowns drill into filters). */
  const FILTER_OF: Partial<Record<ReportDim, keyof JournalFilters>> = { setup: 'setup', mistake: 'mistake', emotion: 'emotion', side: 'side', asset: 'asset', broker: 'broker' };
  const pickable = by === 'symbol' || !!FILTER_OF[by];
  const pick = (key: string) => {
    if (by === 'symbol') filters.setFilter('symbols', [key]);
    else if (FILTER_OF[by]) filters.setFilter(FILTER_OF[by]!, key as never);
  };

  const a = analyticsQ.data;
  const serverBlock = (render: () => React.ReactNode) => (analyticsQ.isError
    ? <QEError title="Journal analytics request failed" message="Server-computed sections are unavailable; everything computed from your rows on this page is unaffected." onRetry={() => analyticsQ.refetch()} retrying={analyticsQ.isFetching} />
    : analyticsQ.isLoading ? <QELoading rows={2} /> : render());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <nav className="jr-jumps" aria-label="Report sections">
        <a href="#jr-breakdowns">Breakdowns</a>
        <a href="#jr-cross">Cross-analysis</a>
        <a href="#jr-time">Time</a>
        <a href="#jr-risk">Risk</a>
        <a href="#jr-insights">Insights</a>
        <a href="#jr-compare">Comparison</a>
        <a href="#jr-explorer">Trade explorer</a>
        <a href="#jr-trends">Trends</a>
        <a href="#jr-export">Export</a>
      </nav>

      <Card id="jr-breakdowns" className="jr-anchor" num="01" title={`Performance by ${REPORT_DIM_LABEL[by].toLowerCase()}`}
        meta={
          <>
            <N n={m.closedTrades} />
            <select className="jr-select" aria-label="Report by" value={by} onChange={(e) => setBy(e.target.value as ReportDim)}>{dimOptions}</select>
          </>
        }>
        {buckets.length ? (
          <>
            <BucketTable buckets={buckets} keyLabel={REPORT_DIM_LABEL[by]} onPick={pickable ? pick : undefined} showHold />
            <p className="jr-note">
              Rates use closed trades only (n). {pickable && 'Select a row to filter the whole journal to it. '}
              {missing > 0 && `${missing} trade${missing === 1 ? '' : 's'} in view ha${missing === 1 ? 's' : 've'} no ${REPORT_DIM_LABEL[by].toLowerCase()} and ${missing === 1 ? 'is' : 'are'} not counted here.`}
              {(by === 'weekday' || by === 'hour') && ' Bucketed by entry time, New York.'}
            </p>
          </>
        ) : (
          <QEEmpty message={`No trades in view carry a ${REPORT_DIM_LABEL[by].toLowerCase()}${data.meta?.canWrite ? " yet. Add one from a trade's Edit form." : '.'}`} />
        )}
      </Card>

      <Card id="jr-cross" className="jr-anchor" num="02" title="Cross-analysis"
        meta={
          <>
            <select className="jr-select" aria-label="Rows" value={crossA} onChange={(e) => setCrossA(e.target.value as ReportDim)}>{dimOptions}</select>
            <span className="jr-n">×</span>
            <select className="jr-select" aria-label="Then by" value={crossB} onChange={(e) => setCrossB(e.target.value as ReportDim)}>{dimOptions}</select>
          </>
        }>
        {crossA === crossB ? (
          <QEEmpty message="Pick two different dimensions to cross." />
        ) : cross.length ? (
          <>
            <BucketTable buckets={cross.slice(0, 60)} keyLabel={`${REPORT_DIM_LABEL[crossA]} × ${REPORT_DIM_LABEL[crossB]}`} showHold />
            <p className="jr-note">{cross.length > 60 ? `Top 60 of ${cross.length} pairs by net P&L. ` : ''}Pairs split the sample thin — read the n and the LOW N flags before the win rate.</p>
          </>
        ) : (
          <QEEmpty message={`No trades in view carry both a ${REPORT_DIM_LABEL[crossA].toLowerCase()} and a ${REPORT_DIM_LABEL[crossB].toLowerCase()}.`} />
        )}
      </Card>

      <div className="jr-grid jr-anchor" id="jr-time">
        <Card className="jr-span-4" num="03" title="By weekday" meta={<span className="jr-n">entry day, ET</span>}>
          <BucketBars buckets={weekday} empty="No trades in view." />
        </Card>
        <Card className="jr-span-4" num="04" title="By entry hour" meta={<span className="jr-n">New York time</span>}>
          <BucketBars buckets={hour} empty="No trades in view." />
        </Card>
        <Card className="jr-span-4" num="05" title="By holding time">
          <BucketBars buckets={hold} empty="No closed trades with an exit time in view." />
        </Card>
        <Card className="jr-span-6" num="06" title="By session" meta={<span className="jr-n">server engine</span>}>
          {serverBlock(() => <TimingList data={a?.timingBySession ?? []} empty="No session data in view." />)}
        </Card>
        <Card className="jr-span-6" num="07" title="Trades per day" meta={<span className="jr-n">server engine</span>}>
          {serverBlock(() => (a?.tradeCountOptimum ?? []).length ? (
            <div className="jr-stats" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
              {a!.tradeCountOptimum.map((b) => (
                <div key={b.label}>
                  <span>{b.label} / day</span>
                  <b><Pnl value={b.avgPnL} /></b>
                  <small>avg per day · n={b.days} day{b.days === 1 ? '' : 's'} · {b.winRate.toFixed(0)}% win</small>
                </div>
              ))}
            </div>
          ) : <QEEmpty message="Not enough trading days in view to compare daily trade counts." />)}
        </Card>
        <Card className="jr-span-12" num="08" title="Options by days to expiry" meta={<span className="jr-n">server engine · option trades with an expiry</span>}>
          {serverBlock(() => (a?.dteBreakdown ?? []).length ? (
            <div className="jr-stats" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
              {a!.dteBreakdown.map((d) => (
                <div key={d.label}>
                  <span>{d.label}</span>
                  <b><Pnl value={d.totalPnL} /></b>
                  <small>n={d.trades} · {d.winRate.toFixed(0)}% win · avg {fmtMoney(d.avgPnL)}</small>
                </div>
              ))}
            </div>
          ) : <QEEmpty message="No option trades with expiry dates in view." />)}
        </Card>
      </div>

      <div className="jr-grid jr-anchor" id="jr-risk">
        <Card className="jr-span-7" num="09" title="Drawdown" meta={<N n={curve.length} unit="closes" />}>
          <UnderwaterChart points={uw} height={140} />
          <div className="jr-stats" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            <div><span>Max drawdown</span><b className={m.maxDrawdown ? 'jr-loss' : ''}>{fmtMoney(m.maxDrawdown ? -m.maxDrawdown : 0)}</b><small>peak → trough</small></div>
            <div><span>Current</span><b>{m.currentDrawdown ? fmtMoney(-m.currentDrawdown) : 'at peak'}</b><small>{m.tradesSincePeak} trade{m.tradesSincePeak === 1 ? '' : 's'} since peak</small></div>
            <div><span>Peak equity</span><b>{fmtMoney(m.peakEquity)}</b><small>cumulative net</small></div>
            <div><span>Recovery factor</span><b>{fmtRatio(m.recoveryFactor)}</b><small>net ÷ max DD</small></div>
          </div>
          {periods.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="jr-kpi-l" style={{ marginBottom: 6 }}>Deepest drawdown periods</div>
              <div className="jr-bars">
                {periods.map((p) => (
                  <div key={p.start + p.trough} className="jr-bar-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <span className="jr-bar-k" style={{ fontFamily: 'inherit' }}>
                      {shortDay(p.start)} → {shortDay(p.trough)} · {p.recovered ? `recovered ${shortDay(p.recovered)}` : 'not yet recovered'}
                    </span>
                    <span className="jr-bar-v"><span className="jr-loss">{fmtMoney(-p.depth)}</span> <span className="jr-n">{p.trades} closes under water</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="jr-note">Measured on cumulative net P&amp;L from $0 — the journal doesn't know your account balance, so no drawdown % is shown.</p>
        </Card>
        <Card className="jr-span-5" num="10" title="Weekly P&L" meta={<N n={weeks.length} unit="weeks" />}>
          <BucketBars
            buckets={weeks.map((w) => ({ key: `wk ${w.week.slice(5)}`, trades: w.trades, closed: w.trades, wins: w.wins, netPnl: w.netPnl, winRate: w.trades ? w.wins / w.trades : null, profitFactor: null, profitFactorIsInfinite: false, expectancy: null }))}
            empty="No closed trades in view."
          />
          <p className="jr-note">Last 12 weeks with closes, newest first; weeks start Monday.</p>
        </Card>
        <Card className="jr-span-12" num="11" title="Streaks & extremes" meta={<><N n={m.closedTrades} /><LowSample n={m.closedTrades} /></>}>
          <div className="jr-stats" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <div><span>Longest win streak</span><b>{m.maxWinStreak}</b><small>consecutive closed wins</small></div>
            <div><span>Longest loss streak</span><b>{m.maxLossStreak}</b><small>consecutive closed losses</small></div>
            <div><span>Largest win</span><b><Pnl value={m.largestWin || null} /></b><small>single trade</small></div>
            <div><span>Largest loss</span><b><Pnl value={m.largestLoss || null} /></b><small>single trade</small></div>
            <div><span>Day win rate</span><b>{fmtPct(m.dayWinRate)}</b><small>n={m.tradingDays} days</small></div>
            <div><span>Profit concentration</span><b>{fmtPct(m.profitConcentration)}</b><small>best day's share of green-day profit</small></div>
          </div>
        </Card>
      </div>

      <Card id="jr-insights" className="jr-anchor" num="12" title="Behaviour insights" meta={<span className="jr-n">server engine · same filters</span>}>
        {serverBlock(() => <InsightGroups insights={a?.insights ?? []} />)}
      </Card>

      <ComparisonCard num="13" />
      <TradeExplorerCard num="14" />
      <PerformanceTrendsCard num="15" />
      <ReviewExportCard num="16" />
    </div>
  );
}

function TimingList({ data, empty }: { data: TimingInsight[]; empty: string }) {
  if (!data.length) return <QEEmpty message={empty} />;
  return (
    <div className="jr-bars">
      {data.map((t) => (
        <div className="jr-bar-row" key={t.label} style={{ gridTemplateColumns: 'minmax(90px,140px) minmax(0,1fr) auto' }}>
          <span className="jr-bar-k">{t.label}</span>
          <span className="jr-bar-track" aria-hidden style={{ background: 'rgba(127,178,255,0.05)' }}>
            <span className="jr-bar-fill pos" style={{ left: 0, width: `${Math.min(100, t.winRate)}%`, background: 'color-mix(in srgb, var(--jr-accent) 45%, transparent)' }} />
          </span>
          <span className="jr-bar-v">{t.winRate.toFixed(0)}% win · <Pnl value={t.avgPnL} /> avg <span className="jr-n">n={t.trades}</span></span>
        </div>
      ))}
    </div>
  );
}

function InsightGroups({ insights }: { insights: BehaviorInsight[] }) {
  if (!insights.length) return <QEEmpty message="No behavioural patterns detected in this view. The engine needs roughly 5+ closed trades to say anything." />;
  const groups: [string, BehaviorInsight[]][] = [
    ['Strengths', insights.filter((i) => i.severity === 'positive')],
    ['Areas to improve', insights.filter((i) => i.severity === 'warning' || i.severity === 'critical')],
    ['Coaching', insights.filter((i) => i.category === 'coaching' && i.severity === 'neutral')],
    ['Other notes', insights.filter((i) => i.severity === 'neutral' && i.category !== 'coaching')],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.filter(([, xs]) => xs.length).map(([title, xs]) => (
        <div key={title}>
          <h4 className="jr-section-h" style={{ fontSize: 13 }}>{title} <span className="jr-n">{xs.length}</span></h4>
          <div className="jr-grid" style={{ gap: 8 }}>
            {xs.map((i) => (
              <div key={i.id} className={`jr-insight ${i.severity} jr-span-6`}>
                <span className="sev">{i.category}</span>
                <h4>{i.title}{i.metric && <span className="jr-n"> · {i.metric}</span>}</h4>
                <p>{i.description}</p>
                {i.suggestion && <p style={{ color: 'var(--text)' }}><b>Try:</b> {i.suggestion}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
