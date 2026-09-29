/**
 * JOURNAL tools — the journal Dashboard as registry tools, so it gets the
 * platform's customisation for free: add / remove / drag / resize, named
 * dashboards ("saved layouts") per user, Restore default.
 *
 * Widget set and default order from LuxAlgo Trade Journal's dashboard
 * (apps/web/src/app/page.tsx: Net P&L, Trade win %, Profit factor, Day win %,
 * Avg win/loss, Edge Score, Cumulative P&L + relative drawdown, Daily P&L,
 * Calendar, Activity, Max drawdown, Streaks, Expectancy, Avg duration,
 * Best/worst day, Trade time performance), https://github.com/LuxAlgo/
 * trade-journal — MIT License, Copyright (c) 2026 LuxAlgo Global, LLC (notice:
 * client/src/lib/journal/LICENSE-luxalgo.txt). Their customiser is NOT ported
 * — our dashboard framework (components/dashboard) replaces it.
 *
 * Inside the journal every tool reads the journal's context (selected book +
 * filters). Placed on any other page it reads your own book ("Mine"),
 * unfiltered, and says so in its source line.
 */
import { useContext, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { JournalContext, type JournalCtx } from '@/components/journal/journal-context';
import { BucketBars, LowSample, N, Pnl, tone } from '@/components/journal/parts';
import { CalendarPnl } from '@/components/journal/calendar-pnl';
import { EquityChart } from '@/components/journal/equity-chart';
import { TradeMiniList } from '@/components/journal/trade-mini-list';
import { EdgeRadar, Gauge, RelativeDrawdownBars, TimeHeatmap, WinLossBar } from '@/components/journal/lux-charts';
import {
  fmtDuration, fmtMoney, fmtPct, fmtRatio, groupBy, toTrade, type JTrade,
} from '@/lib/journal/metrics';
import { edgeScore, relativeDrawdown, timeGrid, EDGE_MIN_CLOSED } from '@/lib/journal/metrics-extra';
import { readJournalPrefs, useJournalData } from '@/lib/journal/use-journal';
import { balanceAnchor, useJournalBalance } from '@/lib/journal/use-journal-extra';
import { useToolReport } from '../../frame';
import '@/styles/journal.css';

// ─── scope: journal context, or a standalone "Mine" reader ──

const noop = () => {};
const journalHref = (params: Record<string, string>) => `/t?${new URLSearchParams({ tab: 'journal', ...params })}`;

function Standalone({ children }: { children: ReactNode }) {
  const data = useJournalData({}, 'mine');
  const ctx = useMemo<JournalCtx>(() => ({
    filters: { state: { range: 'all', filters: {} }, resolved: {}, setRange: noop, setFilter: noop, clear: noop, activeCount: 0 },
    data,
    view: 'dashboard',
    bookLabel: 'Mine',
    canWrite: false,
    openTrade: (id) => window.location.assign(journalHref({ jtrade: id })),
    openTradePage: (id) => window.location.assign(journalHref({ jtrade: id })),
    openEditor: noop,
    openImport: () => window.location.assign(journalHref({ jtab: 'import' })),
    goTo: (v) => window.location.assign(journalHref(v === 'dashboard' ? {} : { jtab: v })),
    openDay: (day) => window.location.assign(journalHref({ jtab: 'daily', jfrom: day, jto: day, jrange: 'custom' })),
    focusDay: null,
    simSymbol: null,
    simulate: noop,
    setJournal: noop,
    sources: undefined,
    prefs: readJournalPrefs(),
    setPrefs: noop,
  }), [data]);
  return <JournalContext.Provider value={ctx}>{children}</JournalContext.Provider>;
}

function useJ(): JournalCtx { return useContext(JournalContext)!; }

/** Frame line + states shared by every journal tool. */
function Body({ children, pad = true }: { children: ReactNode; pad?: boolean }) {
  const { data, bookLabel } = useJ();
  useToolReport({
    asOf: data.meta?.asOf ?? (data.tradesQ.dataUpdatedAt ? new Date(data.tradesQ.dataUpdatedAt).toISOString() : null),
    source: `journal · ${bookLabel} · n=${data.rows.length}${data.rows.length !== data.allRows.length ? ` of ${data.allRows.length}` : ''} trades`,
  });
  if (data.tradesQ.isError) return <QEError className="fd-m" title={`Couldn't load the ${bookLabel} journal`} message="The journal request failed — this is a failure, not an empty book." onRetry={() => data.tradesQ.refetch()} />;
  if (data.tradesQ.isLoading) return <QELoading rows={2} className="fd-pad" label="loading trades…" />;
  if (!data.allRows.length) return <QEEmpty className="fd-m" message={`The ${bookLabel} journal has no trades yet.`} />;
  if (!data.rows.length) return <QEEmpty className="fd-m" message="No trades match the journal filters." />;
  return <div className={`jr jr-tool fd-scroll${pad ? ' fd-pad' : ''}`}>{children}</div>;
}

function scoped(Inner: () => JSX.Element) {
  return function JournalTool() {
    const ctx = useContext(JournalContext);
    return ctx ? <Body><Inner /></Body> : <Standalone><Body><Inner /></Body></Standalone>;
  };
}

function Stat({ value, toneOf, sub, children }: { value: ReactNode; toneOf?: number | null; sub?: ReactNode; children?: ReactNode }) {
  const t = tone(toneOf);
  return (
    <div className="jr-tool-stat">
      <div className={`v${t ? ` jr-${t}` : ''}`}>{value}</div>
      {children}
      {sub != null && <div className="s">{sub}</div>}
    </div>
  );
}

/** Balance behind the selected book → anchor for % drawdown (null + reason when none). */
function useAnchor() {
  const { data } = useJ();
  const b = useJournalBalance(data.key);
  const allTimeNet = useMemo(() => data.allRows.reduce((s, r) => s + (toTrade(r).netPnl || 0), 0), [data.allRows]);
  const anchor = balanceAnchor(b.data, allTimeNet);
  const why = b.isError ? 'The balance request failed — no % shown rather than a guess.' : b.isLoading ? 'Reading the account balance…' : b.data?.reason ?? (b.data?.balance && !anchor ? 'The balance minus the book’s P&L is not positive — cannot anchor %.' : null);
  return { anchor, why, loading: b.isLoading };
}

// ─── KPI tiles ───────────────────────────────────────────────

export const JournalNetPnlTool = scoped(function NetPnl() {
  const { data } = useJ();
  const m = data.metrics;
  // Momentum: last 7 calendar days vs the 7 before (hidden unless both have trading days).
  const delta = useMemo(() => {
    const today = Date.parse(`${journalDayKey(new Date())}T12:00:00Z`);
    let a = 0, b = 0, na = 0, nb = 0;
    for (const d of data.days) {
      const age = (today - Date.parse(`${d.date}T12:00:00Z`)) / 86_400_000;
      if (age < 7) { a += d.netPnl; na++; } else if (age < 14) { b += d.netPnl; nb++; }
    }
    return na && nb ? { v: a - b, na, nb } : null;
  }, [data.days]);
  return (
    <Stat value={fmtMoney(m.netPnl)} toneOf={m.netPnl} sub={<>n={m.closedTrades} closed · fees {fmtMoney(m.fees, { signed: false })}</>}>
      {delta && <div className={`jr-delta ${delta.v >= 0 ? 'up' : 'down'}`}>{delta.v >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(delta.v), { signed: false })} vs prior 7d <span className="jr-n">({delta.na} vs {delta.nb} days)</span></div>}
    </Stat>
  );
});

export const JournalWinRateTool = scoped(function WinRate() {
  const m = useJ().data.metrics;
  return (
    <div className="jr-tool-gauge">
      <Gauge value={m.winRate} label="Trade win rate" />
      <div className="jr-n" style={{ display: 'grid', gap: 2 }}>
        <span>{m.wins} W</span><span>{m.breakevens} BE</span><span>{m.losses} L</span>
        <span>n={m.closedTrades} <LowSample n={m.closedTrades} /></span>
      </div>
    </div>
  );
});

export const JournalProfitFactorTool = scoped(function Pf() {
  const m = useJ().data.metrics;
  return <Stat value={fmtRatio(m.profitFactor, m.profitFactorIsInfinite)} sub={m.closedTrades ? <>{fmtMoney(m.grossProfit, { compact: true })} won ÷ {fmtMoney(m.grossLoss, { compact: true, signed: false })} lost · n={m.closedTrades}</> : 'no closed trades'} />;
});

export const JournalDayWinTool = scoped(function DayWin() {
  const m = useJ().data.metrics;
  return (
    <div className="jr-tool-gauge">
      <Gauge value={m.dayWinRate} label="Day win rate" />
      <div className="jr-n" style={{ display: 'grid', gap: 2 }}><span>{m.winningDays} green</span><span>n={m.tradingDays} days</span></div>
    </div>
  );
});

export const JournalAvgWinLossTool = scoped(function AvgWL() {
  const m = useJ().data.metrics;
  return (
    <Stat value={fmtRatio(m.avgWinLossRatio)} sub={<><span className="jr-gain">{fmtMoney(m.avgWin)}</span> avg win · <span className="jr-loss">{fmtMoney(m.avgLoss != null ? -m.avgLoss : null)}</span> avg loss · {m.wins}W/{m.losses}L</>}>
      <WinLossBar avgWin={m.avgWin} avgLoss={m.avgLoss} />
    </Stat>
  );
});

export const JournalMaxDrawdownTool = scoped(function MaxDd() {
  const { data } = useJ();
  const m = data.metrics;
  const { anchor, why } = useAnchor();
  const e = edgeScore(m, data.curve, anchor?.amount ?? null);
  return (
    <Stat value={m.maxDrawdown ? fmtMoney(-m.maxDrawdown) : '$0.00'} toneOf={m.maxDrawdown ? -1 : 0}
      sub={<>{e.maxDrawdownPct != null ? `${fmtPct(e.maxDrawdownPct, 1)} of balance+peak` : (why ?? 'no balance for %')}{m.recoveryFactor != null && ` · recovery ${fmtRatio(m.recoveryFactor)}×`} · n={data.curve.length} closes</>} />
  );
});

export const JournalStreaksTool = scoped(function Streaks() {
  const m = useJ().data.metrics;
  return <Stat value={m.currentStreak > 0 ? `${m.currentStreak}W` : m.currentStreak < 0 ? `${-m.currentStreak}L` : '—'} sub={<>best {m.maxWinStreak}W · worst {m.maxLossStreak}L · n={m.closedTrades}</>} />;
});

export const JournalExpectancyTool = scoped(function Exp() {
  const m = useJ().data.metrics;
  return <Stat value={fmtMoney(m.expectancy)} toneOf={m.expectancy} sub={<>per closed trade · n={m.closedTrades} <LowSample n={m.closedTrades} /></>} />;
});

export const JournalDurationTool = scoped(function Dur() {
  const m = useJ().data.metrics;
  return <Stat value={fmtDuration(m.avgDurationMs)} sub={<>avg hold, entry → exit · {m.openTrades} open</>} />;
});

export const JournalBestWorstDayTool = scoped(function BW() {
  const m = useJ().data.metrics;
  return (
    <div className="jr-tool-stat">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><Pnl value={m.bestDay?.netPnl} className="v2" /><span className="jr-n">{m.bestDay?.date ?? '—'}</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><Pnl value={m.worstDay?.netPnl} className="v2" /><span className="jr-n">{m.worstDay?.date ?? '—'}</span></div>
      <div className="s">n={m.tradingDays} trading days</div>
    </div>
  );
});

// ─── Visual tools ────────────────────────────────────────────

export const JournalEdgeTool = scoped(function Edge() {
  const { data } = useJ();
  const { anchor, why } = useAnchor();
  const e = edgeScore(data.metrics, data.curve, anchor?.amount ?? null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span className="jr-tool-big">{e.score == null ? '—' : Math.round(e.score)}<span className="jr-n"> /100</span></span>
        <N n={e.closedTrades} /><LowSample n={e.closedTrades} />
        <span className="jr-n">formula v{e.version}</span>
      </div>
      {e.withheld && <p className="jr-note" style={{ margin: 0 }}>{e.withheld}{e.closedTrades >= EDGE_MIN_CLOSED && why ? ` ${why}` : ''}</p>}
      {anchor && <p className="jr-n" style={{ whiteSpace: 'normal' }}>Balance: {anchor.note}</p>}
      {e.closedTrades > 0 && <EdgeRadar components={e.components} />}
    </div>
  );
});

export const JournalEquityTool = scoped(function Equity() {
  const { data } = useJ();
  const [mode, setMode] = useState<'cumulative' | 'daily'>('cumulative');
  const { anchor, why } = useAnchor();
  const rel = useMemo(() => relativeDrawdown(data.curve, anchor?.amount ?? null), [data.curve, anchor?.amount]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <N n={mode === 'cumulative' ? data.curve.length : data.days.length} unit={mode === 'cumulative' ? 'closes' : 'days'} />
        <div className="jr-seg" role="group" aria-label="Chart mode" style={{ marginLeft: 'auto' }}>
          <button type="button" aria-pressed={mode === 'cumulative'} onClick={() => setMode('cumulative')}>CUMULATIVE</button>
          <button type="button" aria-pressed={mode === 'daily'} onClick={() => setMode('daily')}>DAILY</button>
        </div>
      </div>
      <EquityChart curve={data.curve} days={data.days} mode={mode} height={220} />
      {mode === 'cumulative' && <RelativeDrawdownBars data={rel} why={why} />}
      {anchor && mode === 'cumulative' && <p className="jr-n" style={{ whiteSpace: 'normal', margin: 0 }}>% of {anchor.note}</p>}
    </div>
  );
});

export const JournalTimeHeatmapTool = scoped(function Heat() {
  const { data } = useJ();
  const grid = useMemo(() => timeGrid(data.trades), [data.trades]);
  return (
    <>
      <TimeHeatmap grid={grid} />
      <p className="jr-note">Closed trades by entry weekday × entry hour (New York). n={grid.n} closed. Each cell prints its n — a thin cell is an anecdote.</p>
    </>
  );
});

export const JournalCalendarTool = scoped(function Cal() {
  const { data, openDay } = useJ();
  const latest = data.days[data.days.length - 1]?.date ?? journalDayKey(new Date());
  const [ym, setYm] = useState({ y: Number(latest.slice(0, 4)), m: Number(latest.slice(5, 7)) });
  return (
    <>
      <CalendarPnl days={data.days} year={ym.y} month={ym.m} onMonth={(y, m) => setYm({ y, m })} onSelect={(d) => d && openDay(d)} showWeeks />
      <p className="jr-note">Select a day to open it in the Daily journal. n={data.metrics.tradingDays} trading days in view.</p>
    </>
  );
});

export const JournalActivityTool = scoped(function Activity() {
  const { data, openTrade, goTo } = useJ();
  const [tab, setTab] = useState<'recent' | 'open'>('recent');
  const sorted = useMemo(() => [...data.trades].sort((a, b) => Date.parse(b.closedAt ?? b.openedAt) - Date.parse(a.closedAt ?? a.openedAt)), [data.trades]);
  const list: JTrade[] = tab === 'recent' ? sorted.filter((t) => t.status !== 'open').slice(0, 12) : sorted.filter((t) => t.status === 'open');
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div className="jr-seg" role="group" aria-label="Activity">
          <button type="button" aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>RECENT</button>
          <button type="button" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>OPEN · {data.metrics.openTrades}</button>
        </div>
        <button type="button" className="jr-btn jr-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => goTo('trades')}>All {data.trades.length} <ArrowRight className="h-3.5 w-3.5" /></button>
      </div>
      {list.length ? <TradeMiniList trades={list} onOpen={(id) => openTrade(id, list.map((t) => t.id))} /> : <p className="jr-note">{tab === 'open' ? 'Flat — no open positions in view.' : 'No closed trades in view.'}</p>}
    </>
  );
});

export const JournalFactsTool = scoped(function Facts() {
  const m = useJ().data.metrics;
  return (
    <div className="jr-stats">
      <div><span>Day win rate</span><b>{fmtPct(m.dayWinRate)}</b><small>{m.winningDays} of {m.tradingDays} days green</small></div>
      <div><span>Largest win / loss</span><b style={{ fontSize: 13 }}><Pnl value={m.largestWin || null} compact /> / <Pnl value={m.largestLoss || null} compact /></b><small>single trades</small></div>
      <div><span>Recovery factor</span><b>{fmtRatio(m.recoveryFactor)}</b><small>net P&amp;L ÷ max drawdown</small></div>
      <div><span>Profit concentration</span><b>{fmtPct(m.profitConcentration)}</b><small>best day's share of green-day profit</small></div>
      <div><span>Trades since peak</span><b>{m.tradesSincePeak}</b><small>{m.currentDrawdown ? `${fmtMoney(-m.currentDrawdown, { compact: true })} below peak` : 'at equity peak'}</small></div>
      <div><span>Fees paid</span><b>{fmtMoney(m.fees, { signed: false })}</b><small>n={m.closedTrades} closed</small></div>
    </div>
  );
});

export const JournalBySetupTool = scoped(function BySetup() {
  const { data, goTo } = useJ();
  const setups = useMemo(() => groupBy(data.trades, 'setup').slice(0, 8), [data.trades]);
  return (
    <>
      <BucketBars buckets={setups} empty="No setup tags on the trades in view." />
      <button type="button" className="jr-btn jr-btn-sm" style={{ marginTop: 8 }} onClick={() => goTo('reports', 'jr-breakdowns')}>All breakdowns <ArrowRight className="h-3.5 w-3.5" /></button>
    </>
  );
});

export const JournalInsightsTool = scoped(function Insights() {
  const { data } = useJ();
  const q = data.analyticsQ;
  if (q.isError) return <QEError title="Journal insights didn't load" message="The insight engine request failed — the other tools are unaffected (computed from your rows)." onRetry={() => q.refetch()} />;
  if (q.isLoading) return <QELoading rows={2} />;
  const ins = q.data?.insights ?? [];
  if (!ins.length) return <QEEmpty message="No behavioural patterns detected in this view yet — the engine needs about 5+ closed trades." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ins.slice(0, 4).map((i) => (
        <div key={i.id} className={`jr-insight ${i.severity}`}>
          <span className="sev">{i.severity === 'positive' ? 'strength' : i.severity === 'neutral' ? 'note' : i.severity === 'warning' ? 'watch' : 'fix'} · {i.category}</span>
          <h4>{i.title}{i.metric && <span className="jr-n"> · {i.metric}</span>}</h4>
          <p>{i.description}</p>
        </div>
      ))}
    </div>
  );
});

export const JournalNotesTool = scoped(function Notes() {
  const { data, filters, goTo } = useJ();
  const f = filters.resolved;
  const shown = useMemo(() => (data.notesQ.data?.notes ?? [])
    .filter((n) => n.reason !== 'playbook' && n.reason !== 'trade_review')
    .filter((n) => (!f.from || n.day >= f.from) && (!f.to || n.day <= f.to))
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt)), [data.notesQ.data, f.from, f.to]);
  if (data.key === 'bot' || data.key === 'desk') return <p className="jr-note">This book is a ledger — it carries no notes.</p>;
  if (data.notesQ.isError) return <QEError title="Journal notes didn't load" message="Trades and metrics are unaffected." onRetry={() => data.notesQ.refetch()} />;
  if (data.notesQ.isLoading) return <QELoading rows={2} />;
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}><N n={shown.length} unit="notes" /><button type="button" className="jr-btn jr-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => goTo('notebook')}>Notebook <ArrowRight className="h-3.5 w-3.5" /></button></div>
      {!shown.length ? <p className="jr-note">No notes in this date range.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shown.slice(0, 8).map((n) => (
            <article key={n.id} className="jr-note-item">
              <div className="h"><time dateTime={n.postedAt}>{n.day}</time>{(n.symbols ?? []).slice(0, 4).map((s) => <span key={s} className="jr-chip">{s}</span>)}</div>
              <div className="b">{n.body.length > 400 ? `${n.body.slice(0, 400)}…` : n.body}</div>
            </article>
          ))}
        </div>
      )}
    </>
  );
});
