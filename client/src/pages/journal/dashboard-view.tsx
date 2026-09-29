/**
 * Journal · Dashboard — LuxAlgo's dashboard composition on our rows: KPI row,
 * cumulative / daily P&L, the P&L calendar, recent activity, and the
 * performance facts underneath. Everything here is computed from the filtered
 * rows (lib/journal/metrics.ts); only "Insights" comes from the server engine,
 * and it receives the same filters.
 */
import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { CalendarPnl } from '@/components/journal/calendar-pnl';
import { EquityChart } from '@/components/journal/equity-chart';
import { useJournal } from '@/components/journal/journal-context';
import {
  BucketBars, Card, Kpi, LowSample, N, OutcomeChip, Pnl, SideChip, tone,
} from '@/components/journal/parts';
import {
  fmtDuration, fmtMoney, fmtPct, fmtRatio, groupBy, type JTrade,
} from '@/lib/journal/metrics';

const sortKey = (t: JTrade) => Date.parse(t.closedAt ?? t.openedAt);

export default function DashboardView() {
  const { data, openTrade, goTo, filters } = useJournal();
  const { trades, days, curve, metrics: m, analyticsQ } = data;
  const [mode, setMode] = useState<'cumulative' | 'daily'>('cumulative');

  const latest = days[days.length - 1]?.date ?? journalDayKey(new Date());
  const [ym, setYm] = useState<{ y: number; m: number } | null>(null);
  const year = ym?.y ?? Number(latest.slice(0, 4));
  const month = ym?.m ?? Number(latest.slice(5, 7));
  const [day, setDay] = useState<string | null>(null);

  const recent = useMemo(() => [...trades].sort((a, b) => sortKey(b) - sortKey(a)), [trades]);
  const dayTrades = useMemo(
    () => (day ? recent.filter((t) => t.closedAt && journalDayKey(t.closedAt) === day) : []),
    [day, recent],
  );
  const setups = useMemo(() => groupBy(trades, 'setup').slice(0, 6), [trades]);
  const recentIds = recent.map((t) => t.id);

  const pfSub = m.closedTrades ? `${fmtMoney(m.grossProfit, { compact: true })} won / ${fmtMoney(-m.grossLoss, { compact: true })} lost` : 'no closed trades';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="jr-kpis">
        <Kpi label="Net P&L" value={fmtMoney(m.netPnl)} tone={tone(m.netPnl)}
          sub={<>n={m.closedTrades} closed · fees {fmtMoney(m.fees, { signed: false })}</>}
          hint="Sum of net (after-fee) P&L across closed trades in view." />
        <Kpi label="Win rate" value={fmtPct(m.winRate, 1)}
          sub={<>{m.wins}W / {m.losses}L{m.breakevens ? ` / ${m.breakevens}BE` : ''} · n={m.closedTrades} <LowSample n={m.closedTrades} /></>}
          hint="Winning closed trades ÷ all closed trades." />
        <Kpi label="Profit factor" value={fmtRatio(m.profitFactor, m.profitFactorIsInfinite)} sub={pfSub}
          hint="Gross profit ÷ gross loss over closed trades. Above 1 = net profitable." />
        <Kpi label="Expectancy" value={fmtMoney(m.expectancy)} tone={tone(m.expectancy)}
          sub={<>per closed trade · n={m.closedTrades}</>}
          hint="Net P&L ÷ closed trades: what an average trade has been worth." />
        <Kpi label="Avg win / loss" value={fmtRatio(m.avgWinLossRatio)}
          sub={<>{fmtMoney(m.avgWin, { compact: true })} / {fmtMoney(m.avgLoss != null ? -m.avgLoss : null, { compact: true })}</>}
          hint="Average winning trade ÷ average losing trade (absolute)." />
        <Kpi label="Max drawdown" value={m.maxDrawdown ? fmtMoney(-m.maxDrawdown) : '$0.00'} tone={m.maxDrawdown ? 'loss' : null}
          sub={m.currentDrawdown ? <>now {fmtMoney(-m.currentDrawdown, { compact: true })} below peak</> : m.closedTrades ? 'at equity peak' : '—'}
          hint="Deepest peak-to-trough fall of cumulative net P&L (from a $0 start; no account balance is assumed)." />
      </div>

      <div className="jr-grid">
        <Card className="jr-span-7" num="01" title={mode === 'cumulative' ? 'Cumulative net P&L' : 'Net P&L by day'}
          meta={
            <>
              <N n={mode === 'cumulative' ? curve.length : days.length} unit={mode === 'cumulative' ? 'trades' : 'days'} />
              <div className="jr-seg" role="group" aria-label="Chart mode">
                <button type="button" aria-pressed={mode === 'cumulative'} onClick={() => setMode('cumulative')}>CUMULATIVE</button>
                <button type="button" aria-pressed={mode === 'daily'} onClick={() => setMode('daily')}>DAILY</button>
              </div>
            </>
          }>
          <EquityChart curve={curve} days={days} mode={mode} height={250} />
        </Card>

        <Card className="jr-span-5" num="02" title="P&L calendar" meta={<N n={m.tradingDays} unit="days" />}>
          <CalendarPnl days={days} year={year} month={month} onMonth={(y, mo) => { setYm({ y, m: mo }); setDay(null); }}
            selected={day} onSelect={setDay} showWeeks />
          {day && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--jr-line)', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 13 }}>{new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</b>
                <span className="jr-n">{dayTrades.length} closed</span>
                <button type="button" className="jr-btn jr-btn-sm" style={{ marginLeft: 'auto' }}
                  onClick={() => { filters.setRange('custom'); filters.setFilter('from', day); filters.setFilter('to', day); goTo('trades'); }}>
                  Open in Trades <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <TradeMiniList trades={dayTrades} onOpen={(id) => openTrade(id, dayTrades.map((t) => t.id))} />
            </div>
          )}
        </Card>

        <Card className="jr-span-7" num="03" title="Recent trades"
          meta={<button type="button" className="jr-btn jr-btn-sm" onClick={() => goTo('trades')}>All {trades.length} <ArrowRight className="h-3.5 w-3.5" /></button>}>
          <TradeMiniList trades={recent.slice(0, 8)} onOpen={(id) => openTrade(id, recentIds)} />
        </Card>

        <Card className="jr-span-5" num="04" title="Performance facts" meta={<N n={m.closedTrades} />}>
          <div className="jr-stats">
            <div><span>Day win rate</span><b>{fmtPct(m.dayWinRate)}</b><small>{m.winningDays} of {m.tradingDays} days green</small></div>
            <div><span>Best / worst day</span><b style={{ fontSize: 13 }}><Pnl value={m.bestDay?.netPnl} compact /> / <Pnl value={m.worstDay?.netPnl} compact /></b><small>{m.bestDay?.date ?? '—'} · {m.worstDay?.date ?? '—'}</small></div>
            <div><span>Largest win / loss</span><b style={{ fontSize: 13 }}><Pnl value={m.largestWin || null} compact /> / <Pnl value={m.largestLoss || null} compact /></b><small>single trades</small></div>
            <div><span>Streaks</span><b>{m.maxWinStreak}W / {m.maxLossStreak}L</b><small>now {m.currentStreak > 0 ? `${m.currentStreak} win${m.currentStreak === 1 ? '' : 's'}` : m.currentStreak < 0 ? `${-m.currentStreak} loss${m.currentStreak === -1 ? '' : 'es'}` : '—'}</small></div>
            <div><span>Avg hold</span><b>{fmtDuration(m.avgDurationMs)}</b><small>{m.openTrades} open position{m.openTrades === 1 ? '' : 's'}</small></div>
            <div><span>Recovery factor</span><b>{fmtRatio(m.recoveryFactor)}</b><small>net P&amp;L ÷ max drawdown</small></div>
            <div><span>Profit concentration</span><b>{fmtPct(m.profitConcentration)}</b><small>best day's share of green-day profit</small></div>
            <div><span>Fees paid</span><b>{fmtMoney(m.fees, { signed: false })}</b><small>closed trades</small></div>
          </div>
        </Card>

        <Card className="jr-span-6" num="05" title="By setup"
          meta={<button type="button" className="jr-btn jr-btn-sm" onClick={() => goTo('analytics', 'jr-breakdowns')}>All breakdowns <ArrowRight className="h-3.5 w-3.5" /></button>}>
          <BucketBars buckets={setups} empty="Tag trades with a setup (Edit trade → Setup) to see which setups pay." />
        </Card>

        <Card className="jr-span-6" num="06" title="Insights"
          meta={<button type="button" className="jr-btn jr-btn-sm" onClick={() => goTo('analytics', 'jr-insights')}>All insights <ArrowRight className="h-3.5 w-3.5" /></button>}>
          {analyticsQ.isError ? (
            <QEError title="Journal insights didn't load" message="The insight engine request failed — the numbers above are unaffected (they're computed from your rows)." onRetry={() => analyticsQ.refetch()} retrying={analyticsQ.isFetching} />
          ) : analyticsQ.isLoading ? (
            <QELoading rows={2} />
          ) : (analyticsQ.data?.insights ?? []).length === 0 ? (
            <QEEmpty message="No behavioural patterns detected in this view yet — the engine needs about 5+ closed trades." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {analyticsQ.data!.insights.slice(0, 3).map((i) => (
                <div key={i.id} className={`jr-insight ${i.severity}`}>
                  <span className="sev">{i.severity === 'positive' ? 'strength' : i.severity === 'neutral' ? 'note' : i.severity === 'warning' ? 'watch' : 'fix'} · {i.category}</span>
                  <h4>{i.title}{i.metric && <span className="jr-n"> · {i.metric}</span>}</h4>
                  <p>{i.description}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function TradeMiniList({ trades, onOpen }: { trades: JTrade[]; onOpen: (id: string) => void }) {
  if (!trades.length) return <p className="jr-note">No trades here.</p>;
  return (
    <div className="jr-list">
      {trades.map((t) => (
        <button key={t.id} type="button" className="jr-row-card" onClick={() => onOpen(t.id)}
          aria-label={`${t.symbol} ${t.direction}, ${t.status === 'open' ? 'open' : fmtMoney(t.netPnl)}`}>
          <span><span className="jr-sym">{t.symbol}</span> <SideChip direction={t.direction} /></span>
          <span className="r">{t.status === 'open' ? <span className="jr-dim">open</span> : <Pnl value={t.netPnl} />}</span>
          <span className="meta">
            <OutcomeChip status={t.status} />
            {new Date(t.closedAt ?? t.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
            {t.row.setupType && <span className="jr-tag">{t.row.setupType}</span>}
            {t.row.notes && <span title="Has notes">✎ notes</span>}
            {t.row.screenshot && <span title="Has a screenshot">▣ chart</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
