/**
 * FLOW dashboard tools that wrap existing components / endpoints, plus the
 * small ones (net-premium series, alert feed). The FLOW depth tools (ladder,
 * heatmap, timeline, sweeps, unusual, builders, top tickers, dark pool,
 * setups, Flow × GEX, flow context) live in flow-depth.tsx.
 * (GEX tools moved to tools/gex/.) Every tool: honest loading / error / empty states (qe-states) and
 * a freshness report to its frame. Colours from flow-colors.ts: calls blue,
 * puts vermilion — the CVD-safe pair the GEX page uses; never green/red.
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
import { useFlowTape, money, etTime, type TapeRow } from './tape';
import { CALL, CALL_FILL, PUT, signColor } from './flow-colors';

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
    asOf: q.isError && !q.data ? null : last?.t ?? (q.data ? null : undefined),
    note: q.isError ? (q.data ? 'refresh failed · showing last read' : 'request failed') : q.data?.throttled ? 'throttled — retry in ~1m' : undefined,
    tone: q.isError || q.data?.throttled ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={3} className="fd-pad" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title={`${symbol} net-premium series didn't load`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
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
        <span><i style={{ background: CALL_FILL }} />Calls net <b style={{ color: CALL }}>{money(last?.calls)}</b></span>
        <span><i className="dash" style={{ borderColor: PUT }} />Puts net <b style={{ color: PUT }}>{money(last?.puts)}</b></span>
        <span>Calls − puts <b style={{ color: signColor(net) }}>{net >= 0 ? '+' : ''}{money(net)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="fd-series-svg" role="img" aria-label={`${symbol} cumulative calls and puts net premium today`}>
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--text-mute)" strokeWidth="0.6" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d={path('calls')} fill="none" stroke={CALL_FILL} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path d={path('puts')} fill="none" stroke={PUT} strokeWidth="1.6" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
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

/* ════════════════════ Flow Alerts — Bullflow rows of the tape ════════════════════ */

export function FlowAlertsTool() {
  const [, setFocus] = useFocusSymbol();
  const q = useFlowTape(1);
  const alerts = useMemo(() => (q.data?.rows ?? []).filter((r) => r.source === 'bullflow').slice(0, 150), [q.data]);
  const bf = q.data?.sources.bullflow;
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? (bf?.newestAt ?? null) : undefined,
    note: q.isError ? (q.data ? 'refresh failed · showing last read' : 'request failed') : bf ? `stream ${bf.streamState}` : undefined,
    tone: q.isError || (bf && bf.streamState !== 'live') ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="Flow tape didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!bf?.enabled) return <QEEmpty className="fd-m" message="Bullflow is not configured on this server, so there is no alert stream." />;
  if (!alerts.length) return <QEEmpty className="fd-m" message={`No Bullflow alerts today yet (stream ${bf.streamState}).`} />;
  return (
    <div className="fd-scroll">
      {alerts.map((r: TapeRow) => (
        <button key={r.id} type="button" className="fd-alert" onClick={() => setFocus(r.symbol)} onDoubleClick={() => openWorkup(r.symbol)}>
          <span className="t">{etTime(r.at)}</span>
          <span className="tk">{r.symbol}</span>
          <span className="c" style={{ color: r.optionType === 'call' ? CALL : PUT }}>${r.strike}{r.optionType === 'call' ? 'C' : 'P'} {r.expiry.slice(5)}</span>
          <span className="n">{r.label}</span>
          <span className="p">{money(r.premium)}</span>
        </button>
      ))}
    </div>
  );
}
