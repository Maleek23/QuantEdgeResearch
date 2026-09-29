/**
 * CHART tools — Chart Lab (components/charting/chart-lab-nexus.tsx) split into
 * dashboard tools. Each tool renders one of the board's exported sections;
 * the sections read the board's own hooks (identical react-query keys), so a
 * Chart dashboard with every piece on screen costs one request per endpoint.
 * The Stock Chart (FlowChartBoard) is the Flow page's 'stock-chart' tool and
 * is reused here, not re-registered.
 *
 * Ages: each tool reports the newest datum it shows — the latest candle, the
 * convictions / dealer snapshot times, the ES context stamp, the
 * extended-hours sweep — never the fetch time.
 */
import { useCandles } from '@/components/charting/chart-engine';
import {
  ChartLabBoard, ChartLabChartPane, ChartLabEsRisk, ChartLabLevels, ChartLabSummary, ChartLabSysStatus, ChartLabWatchlist,
  CHART_LAB_TF, DEFAULT_FUTURES_RISK, useChartLabEsContext, useChartLabLevels, useChartLabSymbol, useChartLabTape,
  type FuturesRiskInputs,
} from '@/components/charting/chart-lab-nexus';
import { QEError, QELoading } from '@/components/ui/qe-states';
import { useToolReport, useToolSetting } from '../../frame';
import './chart-tools.css';

const toMs = (t: number) => (t < 2e10 ? t * 1000 : t);
const newest = (...isos: Array<string | null | undefined>): string | null => {
  const ms = isos.map((s) => (s ? Date.parse(s) : NaN)).filter((n) => Number.isFinite(n));
  return ms.length ? new Date(Math.max(...ms)).toISOString() : null;
};

/** Newest candle of the board's 1h series for the focused ticker. */
function useCandleReport(extraNote?: string) {
  const { symbol } = useChartLabSymbol();
  const q = useCandles(symbol, CHART_LAB_TF);
  const last = q.data?.bars?.[q.data.bars.length - 1];
  const clamped = q.data?.clampedWicks ?? 0;
  useToolReport({
    asOf: q.isLoading ? undefined : last ? new Date(toMs(last.time)).toISOString() : null,
    note: q.isError ? 'candles failed' : [extraNote, clamped ? `${clamped} bad wick${clamped === 1 ? '' : 's'} clamped` : ''].filter(Boolean).join(' · ') || undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  return q;
}

/* ════════════ Chart Lab (all-in-one, classic) ════════════ */
export function ChartLabTool() {
  useCandleReport('newest 1h bar');
  return <div className="fd-fill fd-legacy"><ChartLabBoard /></div>;
}

/* ════════════ Chart Lab chart — levels overlay ════════════ */
export function ChartLabChartTool() {
  useCandleReport('newest 1h bar');
  return <div className="cl-tool cl-chart"><ChartLabChartPane /></div>;
}

/* ════════════ QuantEdge levels ════════════ */
export function ChartLevelsTool() {
  const { symbol } = useChartLabSymbol();
  const { convictionsQ, dealerQ } = useChartLabLevels(symbol);
  const loading = convictionsQ.isLoading && dealerQ.isLoading;
  const failed = convictionsQ.isError && dealerQ.isError && !convictionsQ.data && !dealerQ.data;
  const dealer = dealerQ.data;
  useToolReport({
    asOf: loading ? undefined : newest(convictionsQ.data?.generatedAt, dealer ? (dealer.cached ? dealer.cachedAt : dealer.generatedAt) : null),
    source: 'convictions + GEX engine',
    note: convictionsQ.isError ? 'convictions failed' : dealerQ.isError ? 'dealer map failed' : dealer?.cached ? 'dealer cached' : undefined,
    tone: convictionsQ.isError || dealerQ.isError || dealer?.cached ? 'warn' : 'ok',
  });
  if (loading) return <QELoading rows={5} className="fd-pad" label={`reading ${symbol} levels…`} />;
  if (failed) {
    return (
      <QEError
        className="fd-m"
        title={`${symbol} levels didn't load`}
        message="Neither the convictions book nor the dealer map answered — no level is implied."
        onRetry={() => { convictionsQ.refetch(); dealerQ.refetch(); }}
        retrying={convictionsQ.isFetching || dealerQ.isFetching}
      />
    );
  }
  return <div className="cl-tool fd-scroll"><ChartLabLevels /></div>;
}

/* ════════════ ES translation · futures risk sizer ════════════ */
export function ChartEsRiskTool() {
  const [risk, setRisk] = useToolSetting<FuturesRiskInputs>('futures-risk', DEFAULT_FUTURES_RISK);
  const q = useChartLabEsContext(risk);
  useToolReport({
    asOf: q.isLoading ? undefined : q.data?.asOf ?? null,
    note: q.isError ? 'refresh failed' : q.data?.session,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isError && !q.data) {
    return <QEError className="fd-m" title="ES context didn't load" message="No ES/SPX quotes, basis or contract sizing is implied." onRetry={() => q.refetch()} retrying={q.isFetching} />;
  }
  return <div className="cl-tool fd-scroll"><ChartLabEsRisk always risk={risk} onRisk={setRisk} /></div>;
}

/* ════════════ Watchlists · mine + traders ════════════ */
export function ChartWatchlistsTool() {
  const { extended, extendedQ } = useChartLabTape();
  useToolReport({
    asOf: extendedQ.isLoading ? undefined : extended?.asOf ?? null,
    source: 'watchlists + extended-hours sweep',
    note: extendedQ.isError ? 'quotes failed — moves show —' : 'move % from the sweep',
    tone: extendedQ.isError ? 'warn' : 'ok',
  });
  return <div className="cl-tool fd-scroll"><ChartLabWatchlist /></div>;
}

/* ════════════ Market readouts ════════════ */
export function ChartReadoutsTool() {
  const { extended, extendedQ } = useChartLabTape();
  useToolReport({
    asOf: extendedQ.isLoading ? undefined : extended?.asOf ?? null,
    source: 'extended-hours sweep · realtime stream · market pulse',
    note: 'age = SPY quote; BTC is the live stream',
    tone: extendedQ.isError ? 'warn' : 'ok',
  });
  return (
    <div className="cl-tool fd-scroll">
      <ChartLabSummary />
      <ChartLabSysStatus />
    </div>
  );
}
