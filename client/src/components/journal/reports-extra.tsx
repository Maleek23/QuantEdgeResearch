/**
 * Reports, second half — Comparison, Trade explorer, Performance trends and
 * Review export.
 *
 * From LuxAlgo Trade Journal's Reports page (apps/web/src/app/reports +
 * components/{performance-trends,trade-explorer,review-export}.tsx and
 * lib/{performance-trends,export-review}.ts), https://github.com/LuxAlgo/
 * trade-journal — MIT License, Copyright (c) 2026 LuxAlgo Global, LLC (notice:
 * client/src/lib/journal/LICENSE-luxalgo.txt). Rewritten on our rows:
 *   · Comparison: two independent filter sets over the whole book, side by side.
 *   · Trade explorer: a virtualised table (fixed row height, only visible rows
 *     mount) with a column chooser remembered on this device — theirs is a
 *     scatter plot.
 *   · Trends: rolling win rate / expectancy / profit factor / avg win÷loss.
 *   · Export: CSV files (summary + breakdowns, or every trade) — no print dialog.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Columns3, Download } from 'lucide-react';
import { matchesJournalFilters, journalDayKey, type JournalFilters } from '@shared/journal-filters';
import { QEEmpty } from '@/components/ui/qe-states';
import { useJournal } from './journal-context';
import { Card, N, Pnl } from './parts';
import {
  computeMetrics, dailyStats, equityCurve, fmtDuration, fmtMoney, fmtPct, fmtRatio, reportBuckets, toTrade,
  REPORT_DIM_LABEL, type JTrade, type ReportDim, type TradeMetrics,
} from '@/lib/journal/metrics';
import { downloadCsv, performanceTrends, toCsv, type TrendPoint } from '@/lib/journal/metrics-extra';
import { useTradeReviews } from '@/lib/journal/use-journal-extra';

// ─── Comparison ──────────────────────────────────────────────

function metricsOf(rows: ReturnType<typeof useJournal>['data']['allRows'], f: JournalFilters) {
  const trades = rows.filter((r) => matchesJournalFilters(r, f)).map(toTrade);
  const days = dailyStats(trades);
  return computeMetrics(trades, days, equityCurve(trades));
}

const COMPARE_ROWS: { label: string; get: (m: TradeMetrics) => number | null; fmt: (v: number | null, m: TradeMetrics) => React.ReactNode; money?: boolean }[] = [
  { label: 'Closed trades (n)', get: (m) => m.closedTrades, fmt: (v) => v ?? '—' },
  { label: 'Net P&L', get: (m) => m.netPnl, fmt: (v) => <Pnl value={v} />, money: true },
  { label: 'Win rate', get: (m) => m.winRate, fmt: (v) => fmtPct(v, 1) },
  { label: 'Profit factor', get: (m) => m.profitFactor, fmt: (v, m) => fmtRatio(v, m.profitFactorIsInfinite) },
  { label: 'Expectancy / trade', get: (m) => m.expectancy, fmt: (v) => <Pnl value={v} />, money: true },
  { label: 'Avg win', get: (m) => m.avgWin, fmt: (v) => <Pnl value={v} />, money: true },
  { label: 'Avg loss', get: (m) => (m.avgLoss == null ? null : -m.avgLoss), fmt: (v) => <Pnl value={v} />, money: true },
  { label: 'Avg win / loss', get: (m) => m.avgWinLossRatio, fmt: (v) => fmtRatio(v) },
  { label: 'Max drawdown', get: (m) => -m.maxDrawdown, fmt: (v) => <Pnl value={v || null} />, money: true },
  { label: 'Day win rate', get: (m) => m.dayWinRate, fmt: (v) => fmtPct(v) },
  { label: 'Trading days', get: (m) => m.tradingDays, fmt: (v) => v ?? '—' },
  { label: 'Avg hold', get: (m) => m.avgDurationMs, fmt: (v) => fmtDuration(v) },
  { label: 'Largest win', get: (m) => m.largestWin || null, fmt: (v) => <Pnl value={v} />, money: true },
  { label: 'Largest loss', get: (m) => m.largestLoss || null, fmt: (v) => <Pnl value={v} />, money: true },
];

function FilterSetEditor({ label, value, onChange }: { label: string; value: JournalFilters; onChange: (f: JournalFilters) => void }) {
  const { data } = useJournal();
  const o = data.options;
  const set = <K extends keyof JournalFilters>(k: K, v: JournalFilters[K] | '') => {
    const next = { ...value };
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete next[k]; else next[k] = v as JournalFilters[K];
    onChange(next);
  };
  const sel = (k: keyof JournalFilters, name: string, opts: readonly string[]) => (
    <select className="jr-select" aria-label={`${label}: ${name}`} value={(value[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)}>
      <option value="">Any {name.toLowerCase()}</option>
      {opts.map((x) => <option key={x} value={x}>{x}</option>)}
    </select>
  );
  return (
    <div className="jr-cmp-set">
      <div className="jr-kpi-l">{label}</div>
      <div className="jr-cmp-fields">
        <input type="date" className="jr-input" aria-label={`${label}: from`} value={value.from ?? ''} onChange={(e) => set('from', e.target.value)} />
        <input type="date" className="jr-input" aria-label={`${label}: to`} value={value.to ?? ''} onChange={(e) => set('to', e.target.value)} />
        <input className="jr-input" aria-label={`${label}: symbols`} placeholder="Symbols (comma)" defaultValue={(value.symbols ?? []).join(', ')}
          onBlur={(e) => set('symbols', e.target.value.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))} />
        {sel('setup', 'Setup', o.setups)}
        {sel('side', 'Side', ['long', 'short'])}
        {sel('outcome', 'Outcome', ['win', 'loss', 'breakeven', 'open'])}
        {sel('asset', 'Asset', o.assets)}
        {sel('mistake', 'Mistake', o.mistakes)}
        {sel('emotion', 'Emotion', o.emotions)}
        {sel('broker', 'Source', o.brokers)}
      </div>
    </div>
  );
}

export function ComparisonCard({ num }: { num: string }) {
  const { data, filters } = useJournal();
  const today = journalDayKey(new Date());
  const [a, setA] = useState<JournalFilters>(() => ({ ...filters.resolved }));
  const [b, setB] = useState<JournalFilters>(() => {
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 29);
    return { from: d.toISOString().slice(0, 10), to: today };
  });
  const ma = useMemo(() => metricsOf(data.allRows, a), [data.allRows, a]);
  const mb = useMemo(() => metricsOf(data.allRows, b), [data.allRows, b]);
  return (
    <Card id="jr-compare" className="jr-anchor" num={num} title="Comparison" meta={<><N n={ma.closedTrades} unit="A" /><N n={mb.closedTrades} unit="B" /></>}>
      <div className="jr-grid" style={{ gap: 10 }}>
        <div className="jr-span-6"><FilterSetEditor label="Set A" value={a} onChange={setA} /></div>
        <div className="jr-span-6"><FilterSetEditor label="Set B" value={b} onChange={setB} /></div>
      </div>
      <div className="jr-table-wrap" style={{ marginTop: 12 }}>
        <table className="jr-table">
          <thead><tr><th scope="col">Metric</th><th scope="col" className="num">Set A</th><th scope="col" className="num">Set B</th><th scope="col" className="num">B − A</th></tr></thead>
          <tbody>
            {COMPARE_ROWS.map((r) => {
              const va = r.get(ma), vb = r.get(mb);
              const diff = va != null && vb != null && Number.isFinite(va) && Number.isFinite(vb) ? vb - va : null;
              return (
                <tr key={r.label} style={{ cursor: 'default' }}>
                  <td>{r.label}</td>
                  <td className="num">{r.fmt(va, ma)}</td>
                  <td className="num">{r.fmt(vb, mb)}</td>
                  <td className="num">{diff == null ? '—' : r.money ? <Pnl value={diff} /> : r.label.includes('rate') ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff * 100).toFixed(1)} pts` : r.label === 'Avg hold' ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${fmtDuration(Math.abs(diff))}` : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(r.label.includes('(n)') || r.label === 'Trading days' ? 0 : 2)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="jr-note">Both sets are drawn from the whole {data.meta?.label ?? ''} book (the filter bar above does not apply here). Set A starts as the current filters; B as the last 30 days. Differences on small n are noise.</p>
    </Card>
  );
}

// ─── Trade explorer ──────────────────────────────────────────

interface Col { id: string; label: string; num?: boolean; get: (t: JTrade, extra: { reviewed: boolean; rules: string }) => string | number | null; render?: (t: JTrade) => React.ReactNode }

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '');

const COLS: Col[] = [
  { id: 'opened', label: 'Opened (ET)', get: (t) => t.openedAt, render: (t) => when(t.openedAt) },
  { id: 'closed', label: 'Closed (ET)', get: (t) => t.closedAt ?? null, render: (t) => (t.closedAt ? when(t.closedAt) : 'open') },
  { id: 'symbol', label: 'Symbol', get: (t) => t.symbol },
  { id: 'side', label: 'Side', get: (t) => t.direction },
  { id: 'asset', label: 'Asset', get: (t) => t.assetType },
  { id: 'qty', label: 'Qty', num: true, get: (t) => t.quantity },
  { id: 'entry', label: 'Entry', num: true, get: (t) => t.row.entryPrice },
  { id: 'exit', label: 'Exit', num: true, get: (t) => t.row.exitPrice ?? null },
  { id: 'net', label: 'Net P&L', num: true, get: (t) => (t.status === 'open' ? null : t.netPnl), render: (t) => (t.status === 'open' ? <span className="jr-dim">open</span> : <Pnl value={t.netPnl} />) },
  { id: 'pct', label: '% on cost', num: true, get: (t) => t.row.realizedPnLPercent ?? null, render: (t) => (t.row.realizedPnLPercent == null ? '—' : `${t.row.realizedPnLPercent.toFixed(1)}%`) },
  { id: 'fees', label: 'Fees', num: true, get: (t) => t.fees },
  { id: 'hold', label: 'Hold', num: true, get: (t) => t.durationMs ?? null, render: (t) => fmtDuration(t.durationMs) },
  { id: 'status', label: 'Outcome', get: (t) => t.status },
  { id: 'setup', label: 'Setup', get: (t) => t.row.setupType ?? null },
  { id: 'mistake', label: 'Mistake', get: (t) => t.row.mistakeTag ?? null },
  { id: 'emotion', label: 'Emotion', get: (t) => t.row.emotion ?? null },
  { id: 'rating', label: 'Rating', num: true, get: (t) => t.row.rating ?? null },
  { id: 'source', label: 'Source', get: (t) => (t.row.origin === 'quantedge_idea' ? 'QuantEdge idea' : t.row.broker || 'manual') },
  { id: 'origin', label: 'Origin', get: (t) => (t.row.origin === 'quantedge_idea' ? 'QuantEdge idea' : 'Own idea') },
  { id: 'reviewed', label: 'Reviewed', get: (_t, x) => (x.reviewed ? 'yes' : '') },
  { id: 'rules', label: 'Rules followed', get: (_t, x) => x.rules || null },
];
const DEFAULT_COLS = ['closed', 'symbol', 'side', 'qty', 'entry', 'exit', 'net', 'hold', 'status', 'setup', 'rating'];
const COLS_KEY = 'qe-journal-explorer-cols-v1';
const ROW_H = 34;
/** Rows shown before "show more" — the journal body is the only scroller (feat/jnav). */
const PAGE = 50;

export function TradeExplorerCard({ num }: { num: string }) {
  const { data, openTrade, openTradePage } = useJournal();
  const { reviews } = useTradeReviews(data.notesQ.data?.notes);
  const [cols, setCols] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null'); if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.filter((x) => COLS.some((c) => c.id === x)); } catch { /* default */ }
    return DEFAULT_COLS;
  });
  useEffect(() => { try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)); } catch { /* this session only */ } }, [cols]);
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 }>({ id: 'closed', dir: -1 });
  const [chooser, setChooser] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const extra = (t: JTrade) => {
    const c = reviews.get(t.id)?.checklist ?? {};
    const v = Object.values(c);
    const f = v.filter((x) => x === 'followed').length;
    return { reviewed: reviews.has(t.id), rules: v.length ? `${f}/${v.length}` : '' };
  };
  const shown = COLS.filter((c) => cols.includes(c.id));
  const rows = useMemo(() => {
    const col = COLS.find((c) => c.id === sort.id) ?? COLS[0];
    return [...data.trades].sort((a, b) => {
      const va = col.get(a, extra(a)), vb = col.get(b, extra(b));
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.trades, sort, reviews]);
  const first = 0;
  const last = Math.min(rows.length, limit);
  const order = rows.map((t) => t.id);
  const grid = `repeat(${shown.length}, minmax(96px, 1fr))`;

  return (
    <Card id="jr-explorer" className="jr-anchor" num={num} title="Trade Explorer"
      meta={
        <>
          <N n={rows.length} unit="trades" />
          <div style={{ position: 'relative' }}>
            <button type="button" className="jr-btn jr-btn-sm" aria-expanded={chooser} onClick={() => setChooser((v) => !v)}><Columns3 className="h-3.5 w-3.5" /> Columns · {shown.length}</button>
            {chooser && (
              <div className="jr-menu" role="group" aria-label="Choose columns">
                {COLS.map((c) => (
                  <label key={c.id}><input type="checkbox" checked={cols.includes(c.id)} disabled={cols.length === 1 && cols.includes(c.id)}
                    onChange={(e) => setCols((cs) => (e.target.checked ? COLS.filter((x) => cs.includes(x.id) || x.id === c.id).map((x) => x.id) : cs.filter((x) => x !== c.id)))} /> {c.label}</label>
                ))}
                <button type="button" className="jr-btn jr-btn-sm" onClick={() => setCols(DEFAULT_COLS)}>Reset columns</button>
              </div>
            )}
          </div>
        </>
      }>
      {!rows.length ? <QEEmpty message="No trades in view. Clear a filter or widen the dates." /> : (
        <div className="jr-explorer" role="table" aria-label="Trade explorer" aria-rowcount={rows.length + 1}>
          <div className="jr-explorer-scroll">
            <div className="jr-explorer-head" role="row" style={{ gridTemplateColumns: grid }}>
              {shown.map((c) => (
                <button key={c.id} type="button" role="columnheader" className={c.num ? 'num' : undefined}
                  aria-sort={sort.id === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  onClick={() => setSort((s) => ({ id: c.id, dir: s.id === c.id ? (s.dir === 1 ? -1 : 1) : c.num ? -1 : 1 }))}>
                  {c.label}{sort.id === c.id && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button>
              ))}
            </div>
            <div>
              {rows.slice(first, last).map((t, i) => {
                const x = extra(t);
                return (
                  <div key={t.id} role="row" aria-rowindex={first + i + 2} className="jr-explorer-row" tabIndex={0}
                    style={{ position: 'relative', height: ROW_H, gridTemplateColumns: grid }}
                    onClick={() => openTrade(t.id, order)}
                    onKeyDown={(e) => { if (e.key === 'Enter') openTradePage(t.id, order); if (e.key === ' ') { e.preventDefault(); openTrade(t.id, order); } }}>
                    {shown.map((c) => {
                      const v = c.get(t, x);
                      return <span key={c.id} role="cell" className={c.num ? 'num' : undefined}>{c.render ? c.render(t) : v == null || v === '' ? <span className="jr-mute">—</span> : typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : +v.toFixed(4)) : v}</span>;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {rows.length > limit && (
        <button type="button" className="jr-btn jr-btn-sm jr-more-rows" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more · {limit} of {rows.length}</button>
      )}
      <p className="jr-note">Filtered by the filter bar; sorted by the column you pick. Click a row for the quick view; Enter opens the full trade page. Columns are remembered on this device.</p>
    </Card>
  );
}

// ─── Performance trends ──────────────────────────────────────

const TREND_METRICS: { id: keyof Pick<TrendPoint, 'winRate' | 'expectancy' | 'profitFactor' | 'avgWinLoss'>; label: string; fmt: (v: number) => string }[] = [
  { id: 'winRate', label: 'Win rate', fmt: (v) => fmtPct(v, 0) },
  { id: 'expectancy', label: 'Expectancy', fmt: (v) => fmtMoney(v, { compact: true }) },
  { id: 'profitFactor', label: 'Profit factor', fmt: (v) => v.toFixed(2) },
  { id: 'avgWinLoss', label: 'Avg win / loss', fmt: (v) => v.toFixed(2) },
];

export function PerformanceTrendsCard({ num }: { num: string }) {
  const { data } = useJournal();
  const [win, setWin] = useState(20);
  const [metric, setMetric] = useState<(typeof TREND_METRICS)[number]['id']>('winRate');
  const pts = useMemo(() => performanceTrends(data.trades, win), [data.trades, win]);
  const m = data.metrics;
  const def = TREND_METRICS.find((x) => x.id === metric)!;
  const overall = metric === 'winRate' ? m.winRate : metric === 'expectancy' ? m.expectancy : metric === 'profitFactor' ? m.profitFactor : m.avgWinLossRatio;
  const vals = pts.map((p) => p[metric]);
  const known = vals.filter((v): v is number => v != null && Number.isFinite(v));
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 200;
  const lo = Math.min(...known, overall ?? Infinity, metric === 'expectancy' ? 0 : Infinity);
  const hi = Math.max(...known, overall ?? -Infinity, metric === 'expectancy' ? 0 : -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (pts.length > 1 ? (i / (pts.length - 1)) * W : W / 2);
  const y = (v: number) => H - 8 - ((v - lo) / span) * (H - 16);
  let d = '';
  vals.forEach((v, i) => { if (v == null) { return; } d += `${d && vals[i - 1] != null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; });
  const gaps = vals.length - known.length;
  return (
    <Card id="jr-trends" className="jr-anchor" num={num} title="Performance Trends"
      meta={
        <>
          <N n={m.closedTrades} />
          <select className="jr-select" aria-label="Metric" value={metric} onChange={(e) => setMetric(e.target.value as never)}>{TREND_METRICS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          <select className="jr-select" aria-label="Rolling window" value={win} onChange={(e) => setWin(Number(e.target.value))}>{[10, 20, 50, 100].map((w) => <option key={w} value={w}>last {w} trades</option>)}</select>
        </>
      }>
      {pts.length < 2 ? (
        <QEEmpty message={`Needs at least ${win + 1} closed trades for a rolling ${win}-trade line (n=${m.closedTrades}).`} />
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img"
            aria-label={`Rolling ${win}-trade ${def.label} over ${pts.length} points; overall ${overall == null ? 'n/a' : def.fmt(overall)}`}
            onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))); }}
            onMouseLeave={() => setHover(null)}>
            {metric === 'expectancy' && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--jr-line-hi)" vectorEffect="non-scaling-stroke" />}
            {overall != null && Number.isFinite(overall) && <line x1={0} x2={W} y1={y(overall)} y2={y(overall)} stroke="var(--text-mute)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
            <path d={d} fill="none" stroke="var(--jr-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--jr-line-hi)" vectorEffect="non-scaling-stroke" />}
          </svg>
          {hover != null && pts[hover] && (
            <div className="jr-tip" style={{ left: `${(hover / Math.max(1, pts.length - 1)) * 100}%` }}>
              trade #{pts[hover].index} · {new Date(pts[hover].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'America/New_York' })} · {pts[hover][metric] == null ? 'n/a (no losses in window)' : def.fmt(pts[hover][metric] as number)}
            </div>
          )}
          <div className="jr-n" style={{ display: 'flex', justifyContent: 'space-between' }}><span>trade #{pts[0].index}</span><span>dashed = all {m.closedTrades} closed: {overall == null ? '—' : def.fmt(overall)}</span><span>trade #{pts[pts.length - 1].index}</span></div>
        </div>
      )}
      <p className="jr-note">Each point is the last {win} closed trades (n={win} per point). {gaps > 0 && `${gaps} point${gaps === 1 ? '' : 's'} have no value (a window without losses has no finite profit factor) and are left as gaps. `}A rising line on a thin window is a streak, not an edge.</p>
    </Card>
  );
}

// ─── Review export ───────────────────────────────────────────

export function ReviewExportCard({ num }: { num: string }) {
  const { data, filters, bookLabel } = useJournal();
  const { reviews } = useTradeReviews(data.notesQ.data?.notes);
  const m = data.metrics;
  const f = filters.resolved;
  const stamp = journalDayKey(new Date());
  const slug = bookLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filterText = Object.entries(f).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v}`).join('; ') || 'none';

  const summary = () => {
    const rows: (string | number | null)[][] = [
      ['Journal review', bookLabel],
      ['Generated', new Date().toISOString()],
      ['Filters', filterText],
      ['Trades in view', data.rows.length],
      [],
      ['Metric', 'Value'],
      ['Closed trades (n)', m.closedTrades], ['Open trades', m.openTrades], ['Net P&L', m.netPnl], ['Fees', m.fees],
      ['Win rate', m.winRate], ['Profit factor', m.profitFactorIsInfinite ? 'infinite' : m.profitFactor], ['Expectancy', m.expectancy],
      ['Avg win', m.avgWin], ['Avg loss', m.avgLoss == null ? null : -m.avgLoss], ['Avg win/loss', m.avgWinLossRatio],
      ['Max drawdown', -m.maxDrawdown], ['Recovery factor', m.recoveryFactor], ['Trading days', m.tradingDays], ['Day win rate', m.dayWinRate],
      ['Best day', m.bestDay ? `${m.bestDay.date} ${m.bestDay.netPnl.toFixed(2)}` : null], ['Worst day', m.worstDay ? `${m.worstDay.date} ${m.worstDay.netPnl.toFixed(2)}` : null],
      ['Max win streak', m.maxWinStreak], ['Max loss streak', m.maxLossStreak], ['Avg hold (minutes)', m.avgDurationMs == null ? null : m.avgDurationMs / 60_000],
    ];
    for (const dim of ['setup', 'symbol', 'weekday', 'hour', 'mistake'] as ReportDim[]) {
      const bs = reportBuckets(data.trades, dim);
      if (!bs.length) continue;
      rows.push([], [`By ${REPORT_DIM_LABEL[dim]}`, 'Closed n', 'Win rate', 'Profit factor', 'Expectancy', 'Net P&L']);
      for (const b of bs) rows.push([b.key, b.closed, b.winRate, b.profitFactorIsInfinite ? 'infinite' : b.profitFactor, b.expectancy, b.netPnl]);
    }
    rows.push([], ['Rates are over closed trades only; n is given per row.']);
    return toCsv(rows);
  };
  const tradesCsv = () => toCsv([
    ['id', 'symbol', 'side', 'asset', 'option_type', 'strike', 'expiry', 'quantity', 'entry_price', 'exit_price', 'fees', 'entry_time', 'exit_time', 'hold_minutes', 'net_pnl', 'pnl_pct', 'outcome', 'setup', 'mistake', 'emotion', 'rating', 'source', 'rules_followed', 'rules_broken', 'notes'],
    ...data.trades.map((t) => {
      const c = Object.values(reviews.get(t.id)?.checklist ?? {});
      return [t.id, t.symbol, t.direction, t.assetType, t.row.optionType ?? null, t.row.strikePrice ?? null, t.row.expiryDate ?? null, t.quantity, t.row.entryPrice, t.row.exitPrice ?? null, t.fees,
        t.row.entryTime, t.row.exitTime ?? null, t.durationMs == null ? null : t.durationMs / 60_000, t.status === 'open' ? null : t.netPnl, t.row.realizedPnLPercent ?? null, t.status,
        t.row.setupType ?? null, t.row.mistakeTag ?? null, t.row.emotion ?? null, t.row.rating ?? null, t.row.broker || 'manual',
        c.filter((v) => v === 'followed').length || null, c.filter((v) => v === 'broken').length || null, t.row.notes ?? null];
    }),
  ]);

  return (
    <Card id="jr-export" className="jr-anchor" num={num} title="Review Export" meta={<N n={data.rows.length} unit="trades in view" />}>
      <p className="jr-note" style={{ marginTop: 0 }}>Download what this page shows, with the filters written into the file: <b>{filterText}</b>.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="jr-btn jr-btn-sm jr-btn-primary" onClick={() => downloadCsv(`journal-review-${slug}-${stamp}.csv`, summary())}><Download className="h-3.5 w-3.5" /> Summary + breakdowns (CSV)</button>
        <button type="button" className="jr-btn jr-btn-sm" onClick={() => downloadCsv(`journal-trades-${slug}-${stamp}.csv`, tradesCsv())}><Download className="h-3.5 w-3.5" /> Every trade in view (CSV)</button>
      </div>
      <p className="jr-note">Opens in any spreadsheet. Text cells that start with = + − @ are prefixed with ' so a spreadsheet never runs them as formulas.</p>
    </Card>
  );
}
