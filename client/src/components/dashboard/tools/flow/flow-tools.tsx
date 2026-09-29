/**
 * FLOW dashboard tools that wrap existing components / endpoints, plus the
 * small new ones (net-premium series, per-strike sums, alert feed, dark pool).
 * (GEX tools moved to tools/gex/.) Every tool: honest loading / error / empty states (qe-states) and
 * a freshness report to its frame. Colours: calls = --green (mint), puts =
 * --red (vermilion) — the CVD-safe pair; GEX colours from gex-colors.ts.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { openWorkup } from '@/lib/workup-bus';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { FlowBoard, IndexZeroDtePulsePanel } from '@/components/flow/flow-board';
import { RepeatBuyers } from '@/components/flow/repeat-buyers';
import { ConvergenceCard } from '@/components/flow/convergence-card';
import { FlowChartBoard } from '@/components/charting/flow-chart-nexus';
import { WatchlistRail } from '@/components/oracle/oracle-rails';
import { useFocusSymbol, useToolReport } from '../../frame';
import { useFlowTape, money, etTime, ageLabel, type TapeRow } from './tape';

const getJson = (url: string) => async () => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
};

/* ════════════════════ wrapped legacy components ════════════════════ */

export function HistoricalFlowTool() {
  const [, setFocus] = useFocusSymbol();
  return <div className="fd-fill fd-legacy"><FlowBoard onSelectSymbol={setFocus} /></div>;
}
export function RepeatBuyersTool() { return <div className="fd-scroll"><RepeatBuyers /></div>; }
export function ConvergenceTool() { return <div className="fd-scroll"><ConvergenceCard /></div>; }
export function IndexPulseTool() {
  // Same key the panel uses → shared fetch; read only for the age stamp.
  const intel = useQuery<{ timestamp?: string }>({
    queryKey: ['/api/spx/intelligence', 'SPX', 'flow-pulse'], queryFn: getJson('/api/spx/intelligence?symbol=SPX'),
    staleTime: 15_000, refetchInterval: 30_000, retry: 0,
  });
  useToolReport({
    asOf: intel.isError ? null : intel.data ? (intel.data.timestamp ?? null) : undefined,
    note: intel.isError ? 'SPX intelligence failed' : undefined, tone: intel.isError ? 'warn' : 'ok',
  });
  return <div className="fd-scroll fd-pad"><IndexZeroDtePulsePanel /></div>;
}
export function StockChartTool() { return <div className="fd-fill fd-chart"><FlowChartBoard /></div>; }

export function WatchlistTool() {
  const [, setFocus] = useFocusSymbol();
  // Same key WatchlistRail uses → shared fetch; read only for the age stamp.
  const eh = useQuery<{ asOf?: string; generatedAt?: string; isStale?: boolean }>({
    queryKey: ['/api/extended-hours', 'oracle-tape'], queryFn: getJson('/api/extended-hours'),
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });
  useToolReport({
    asOf: eh.isError ? null : (eh.data?.asOf ?? eh.data?.generatedAt ?? (eh.isLoading ? undefined : null)),
    note: eh.isError ? 'price scan failed' : eh.data?.isStale ? 'scan stale' : undefined,
    tone: eh.isError || eh.data?.isStale ? 'warn' : 'ok',
  });
  return <div className="fd-scroll"><WatchlistRail onSelectSymbol={setFocus} className="border-t-0" /></div>;
}

/* ════════════════════ Top Tickers — /api/bullflow/leaders ════════════════════ */

interface Leader { ticker: string; totalNetPremium?: number; totalPremium?: number; callPremium?: number; putPremium?: number }

export function TopTickersTool() {
  const [focus, setFocus] = useFocusSymbol();
  const q = useQuery<{ enabled: boolean; generatedAt?: string | null; rows: Leader[] }>({
    queryKey: ['/api/bullflow/leaders'], queryFn: getJson('/api/bullflow/leaders'),
    staleTime: 5 * 60_000, refetchInterval: 6 * 60_000, retry: 1,
  });
  useToolReport({
    asOf: q.isError ? null : q.data?.generatedAt ?? (q.data ? null : undefined),
    note: q.isError ? 'request failed' : q.data && !q.data.generatedAt ? 'provider sent no timestamp · refreshed ≤6m' : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={5} className="fd-pad" />;
  if (q.isError) return <QEError className="fd-m" title="Top tickers didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data?.enabled) return <QEEmpty className="fd-m" message="Bullflow is not configured on this server, so market-wide net-premium leaders are not available." />;
  const rows = q.data.rows ?? [];
  if (!rows.length) return <QEEmpty className="fd-m" message="Provider returned no leaders for today yet." />;
  const max = Math.max(...rows.map((r) => Math.abs(r.totalNetPremium ?? 0)), 1);
  return (
    <div className="fd-scroll">
      <table className="fd-mini">
        <thead><tr><th>Ticker</th><th className="r">Net premium</th><th className="r">Call $</th><th className="r">Put $</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const net = r.totalNetPremium ?? null;
            const pos = (net ?? 0) >= 0;
            return (
              <tr key={r.ticker} className={r.ticker === focus ? 'sel' : ''} onClick={() => setFocus(r.ticker)} title="Click to focus · double-click for workup" onDoubleClick={() => openWorkup(r.ticker)}>
                <td className="tk">{r.ticker}</td>
                <td className="r" style={{ position: 'relative' }}>
                  <span className="fd-nbar" style={{ width: `${(Math.abs(net ?? 0) / max) * 100}%`, background: pos ? 'var(--green)' : 'var(--red)' }} />
                  <span style={{ position: 'relative', color: net == null ? 'var(--text-mute)' : pos ? 'var(--green)' : 'var(--red)' }}>{net == null ? '—' : `${pos ? '+' : ''}${money(net)}`}</span>
                </td>
                <td className="r">{money(r.callPremium)}</td>
                <td className="r">{money(r.putPremium)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ════════════════════ Net premium series — Net Premium & Market Tide ════════════════════ */

interface SeriesBody { enabled: boolean; symbol: string; series: { points: { t: string; calls: number; puts: number }[] } | null; throttled?: boolean; generatedAt?: string }

function NetPremiumSeries({ symbol }: { symbol: string }) {
  const q = useQuery<SeriesBody>({
    queryKey: ['/api/bullflow/net-premium-series', symbol], queryFn: getJson(`/api/bullflow/net-premium-series/${encodeURIComponent(symbol)}`),
    staleTime: 2 * 60_000, refetchInterval: 3 * 60_000, retry: 1,
  });
  const pts = q.data?.series?.points ?? [];
  const last = pts.at(-1);
  useToolReport({
    asOf: q.isError ? null : last?.t ?? (q.data ? null : undefined),
    note: q.isError ? 'request failed' : q.data?.throttled ? 'throttled — retry in ~1m' : undefined,
    tone: q.isError || q.data?.throttled ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={3} className="fd-pad" />;
  if (q.isError) return <QEError className="fd-m" title={`${symbol} net-premium series didn't load`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data?.enabled) return <QEEmpty className="fd-m" message="Bullflow is not configured on this server — no aggressor-inferred net premium." />;
  if (q.data.throttled && !pts.length) return <QEEmpty className="fd-m" message={`${symbol}: dashboard share of the Bullflow rate budget is spent for this minute (scanners get priority). It will fill on the next refresh.`} />;
  if (pts.length < 2) return <QEEmpty className="fd-m" message={`No net-premium points for ${symbol} today yet — the provider series starts after the open.`} />;

  const W = 400, H = 150, P = 4;
  const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[pts.length - 1].t) || t0 + 1;
  const vals = pts.flatMap((p) => [p.calls, p.puts, 0]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (t: string) => P + ((Date.parse(t) - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
  const path = (k: 'calls' | 'puts') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const net = (last?.calls ?? 0) - (last?.puts ?? 0);
  return (
    <div className="fd-series">
      <div className="fd-series-stats">
        <span><i style={{ background: 'var(--green)' }} />Calls net <b style={{ color: 'var(--green)' }}>{money(last?.calls)}</b></span>
        <span><i className="dash" style={{ borderColor: 'var(--red)' }} />Puts net <b style={{ color: 'var(--red)' }}>{money(last?.puts)}</b></span>
        <span>Calls − puts <b style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{net >= 0 ? '+' : ''}{money(net)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="fd-series-svg" role="img" aria-label={`${symbol} cumulative calls and puts net premium today`}>
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--text-mute)" strokeWidth="0.6" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={path('calls')} fill="none" stroke="var(--green)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path d={path('puts')} fill="none" stroke="var(--red)" strokeWidth="1.6" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="fd-foot">{etTime(pts[0].t)} → {etTime(pts[pts.length - 1].t)} ET · {pts.length} points · net = ask-side minus bid-side premium, inferred by the provider · dashed line = puts, dotted = zero</div>
    </div>
  );
}

export function NetPremiumTool() {
  const [focus] = useFocusSymbol();
  return <NetPremiumSeries symbol={focus} />;
}
export function MarketTideTool() { return <NetPremiumSeries symbol="SPY" />; }

/* ════════════════════ Net Flow by Strike — from the tape ════════════════════ */

export function NetFlowByStrikeTool() {
  const [focus] = useFocusSymbol();
  const q = useFlowTape(1);
  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) => r.symbol === focus), [q.data, focus]);
  const newest = rows.reduce<string | null>((m, r) => (r.at && (!m || r.at > m) ? r.at : m), null);
  useToolReport({ asOf: q.isError ? null : q.data ? newest : undefined, note: q.isError ? 'request failed' : q.data ? `${rows.length} prints · ${focus}` : undefined, tone: q.isError ? 'warn' : 'ok' });
  const byStrike = useMemo(() => {
    const m = new Map<number, { call: number; put: number }>();
    for (const r of rows) {
      const e = m.get(r.strike) ?? { call: 0, put: 0 };
      e[r.optionType] += r.premium;
      m.set(r.strike, e);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows]);
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" />;
  if (q.isError) return <QEError className="fd-m" title="Flow tape didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!byStrike.length) return <QEEmpty className="fd-m" message={`No ${focus} prints in today's tape. Click a row in Options Flow or Top Tickers to focus another ticker.`} />;
  const max = Math.max(...byStrike.map(([, v]) => Math.max(v.call, v.put)), 1);
  return (
    <div className="fd-scroll">
      <div className="fd-strike-head"><span>Put $</span><span>Strike</span><span>Call $</span></div>
      {byStrike.map(([k, v]) => (
        <div key={k} className="fd-strike-row" title={`$${k}: calls ${money(v.call)} · puts ${money(v.put)} (premium, not direction)`}>
          <div className="l"><span className="fd-hbar" style={{ width: `${(v.put / max) * 100}%`, background: 'var(--red)' }} /><em>{v.put ? money(v.put) : ''}</em></div>
          <div className="k">{k}</div>
          <div className="rr"><span className="fd-hbar" style={{ width: `${(v.call / max) * 100}%`, background: 'var(--green)' }} /><em>{v.call ? money(v.call) : ''}</em></div>
        </div>
      ))}
      <div className="fd-foot">Premium traded, split by call/put. Side (bought vs sold) is not measured on these feeds, so this is activity, not net direction.</div>
    </div>
  );
}

/* ════════════════════ Flow Alerts — Bullflow rows of the tape ════════════════════ */

export function FlowAlertsTool() {
  const [, setFocus] = useFocusSymbol();
  const q = useFlowTape(1);
  const alerts = useMemo(() => (q.data?.rows ?? []).filter((r) => r.source === 'bullflow').slice(0, 150), [q.data]);
  const bf = q.data?.sources.bullflow;
  useToolReport({
    asOf: q.isError ? null : q.data ? (bf?.newestAt ?? null) : undefined,
    note: q.isError ? 'request failed' : bf ? `stream ${bf.streamState}` : undefined,
    tone: q.isError || (bf && bf.streamState !== 'live') ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" />;
  if (q.isError) return <QEError className="fd-m" title="Flow tape didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!bf?.enabled) return <QEEmpty className="fd-m" message="Bullflow is not configured on this server, so there is no alert stream." />;
  if (!alerts.length) return <QEEmpty className="fd-m" message={`No Bullflow alerts today yet (stream ${bf.streamState}).`} />;
  return (
    <div className="fd-scroll">
      {alerts.map((r: TapeRow) => (
        <button key={r.id} type="button" className="fd-alert" onClick={() => setFocus(r.symbol)} onDoubleClick={() => openWorkup(r.symbol)}>
          <span className="t">{etTime(r.at)}</span>
          <span className="tk">{r.symbol}</span>
          <span className="c" style={{ color: r.optionType === 'call' ? 'var(--green)' : 'var(--red)' }}>${r.strike}{r.optionType === 'call' ? 'C' : 'P'} {r.expiry.slice(5)}</span>
          <span className="n">{r.label}</span>
          <span className="p">{money(r.premium)}</span>
        </button>
      ))}
    </div>
  );
}

/* ════════════════════ Dark Pool Flow — /api/bullflow/context/:ticker ════════════════════ */

interface DpLevel { price: number; notional: number; size: number; pctDayVolume: number; percent30DayVolume: number; at: number | string | null }

export function DarkPoolTool() {
  const [focus] = useFocusSymbol();
  const q = useQuery<{ enabled: boolean; darkPoolLevels?: DpLevel[]; disclosure?: string }>({
    queryKey: ['/api/bullflow/context', focus], queryFn: getJson(`/api/bullflow/context/${encodeURIComponent(focus)}`),
    staleTime: 5 * 60_000, refetchInterval: 6 * 60_000, retry: 1,
  });
  const levels = q.data?.darkPoolLevels ?? [];
  const toIso = (a: DpLevel['at']) => (a == null ? null : typeof a === 'number' ? new Date(a).toISOString() : a);
  const newest = levels.reduce<string | null>((m, l) => { const t = toIso(l.at); return t && (!m || t > m) ? t : m; }, null);
  useToolReport({ asOf: q.isError ? null : q.data ? newest : undefined, note: q.isError ? 'request failed' : q.data ? focus : undefined, tone: q.isError ? 'warn' : 'ok' });
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" />;
  if (q.isError) return <QEError className="fd-m" title={`${focus} dark-pool read didn't load`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data?.enabled) return <QEEmpty className="fd-m" message="Bullflow is not configured on this server — no dark-pool prints." />;
  if (!levels.length) return <QEEmpty className="fd-m" message={`No ${focus} dark-pool prints ≥ $1M notional today.`} />;
  return (
    <div className="fd-scroll">
      <table className="fd-mini">
        <thead><tr><th>Time ET</th><th className="r">Price</th><th className="r">Notional</th><th className="r">Shares</th><th className="r" title="Share of today's volume">% day vol</th></tr></thead>
        <tbody>
          {levels.map((l, i) => (
            <tr key={i}>
              <td>{etTime(toIso(l.at))}</td>
              <td className="r">${l.price.toFixed(2)}</td>
              <td className="r" style={{ color: 'var(--purple)' }}>{money(l.notional)}</td>
              <td className="r">{Number.isFinite(l.size) ? l.size.toLocaleString() : '—'}</td>
              <td className="r">{Number.isFinite(l.pctDayVolume) ? `${l.pctDayVolume.toFixed(2)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fd-foot">{q.data.disclosure ?? 'Dark-pool prints mark price levels; they are not directional.'} Top 5 by notional. Newest print {ageLabel(newest)}.</div>
    </div>
  );
}
