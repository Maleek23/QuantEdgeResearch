/**
 * POSITIONS tools — the Position Heat Map page (pages/positions-heatmap.tsx)
 * split into dashboard tools.
 *
 * Every tool reads the page's one feed through usePositionsLive() (same
 * react-query key 'positions-live'), so the whole POSITIONS dashboard costs one
 * /api/positions/live request per minute. Tiles, best/worst cards, legend and
 * table rows are the page's own exported components; the heat map and the
 * detail table share one sort (per-page dash state), exactly as on the page.
 */
import { fmtUsd } from '@/lib/format';
import type { ReactNode } from 'react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import PositionsHeatmapPage, {
  BestWorstCard, DetailTable, HeatLegend, HeatTile, sortPositions, usePositionsLive,
  type PositionSort, type PositionsResponse,
} from '@/pages/positions-heatmap';
import { useDashState, useFocusSymbol, useToolReport, useToolSetting } from '../../frame';
import './positions-tools.css';

const SORTS: { id: PositionSort; label: string }[] = [
  { id: 'pnl', label: 'P&L' }, { id: 'days', label: 'Days' }, { id: 'expiry', label: 'DTE' },
];
const signed = (v: number, suffix = '') => `${v >= 0 ? '+' : ''}${v}${suffix}`;

/** shared feed + frame report + loading / error / empty gate */
function usePositions(): { data?: PositionsResponse; gate: ReactNode | null } {
  const q = usePositionsLive();
  const d = q.data;
  useToolReport({
    asOf: q.isError && !d ? null : d ? (d.asOf ?? null) : undefined,
    note: q.isError ? 'refresh failed' : d ? `${d.summary.total} open` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isLoading) return { gate: <QELoading rows={4} className="fd-pad" label="reading open positions…" /> };
  // A failed feed is NOT an empty book — say it's a data issue.
  if (q.isError || !d) {
    return { gate: <QEError className="fd-m" title="Positions didn't load" message="The positions feed failed — your positions are unchanged; only this view is missing. Retry in a minute." onRetry={() => q.refetch()} retrying={q.isFetching} /> };
  }
  if (d.summary.total === 0) return { data: d, gate: <QEEmpty className="fd-m" message="No open positions. Track an idea from NEXUS to open one." /> };
  return { data: d, gate: null };
}

function SortSeg() {
  const [sortBy, setSortBy] = useDashState<PositionSort>('positions:sort', 'pnl');
  return (
    <div className="of-seg" role="group" aria-label="Sort positions">
      {SORTS.map((s) => (
        <button key={s.id} type="button" className={sortBy === s.id ? 'on' : ''} onClick={() => setSortBy(s.id)}>{s.label}</button>
      ))}
    </div>
  );
}

/* ════════════ Net open P&L + KPI strip ════════════ */
export function PositionsPnlTool() {
  const { data, gate } = usePositions();
  if (gate) return gate;
  const s = data!.summary;
  const up = s.totalPnLPct >= 0;
  const wr = s.total ? Math.round((s.winners / s.total) * 100) : 0;
  return (
    <div className="fd-scroll ph-kpis">
      <div className="ph-hero">
        <span className="ph-lbl">Net open P&L</span>
        <b className={up ? 'up' : 'down'}>{signed(s.totalPnLPct, '%')}</b>
        <span className="ph-sub">{fmtUsd(s.totalPnLAbs, { signed: true })} absolute</span>
      </div>
      <div className="ph-kpi"><span className="ph-lbl">Positions</span><b>{s.total}</b></div>
      <div className="ph-kpi" title="Share of open positions currently in profit — open marks, not decided outcomes.">
        <span className="ph-lbl">In profit</span>
        <b className={wr >= 50 ? 'up' : 'warn'}>{s.total ? `${wr}%` : '—'}</b>
        <span className="ph-sub">{s.winners}W · {s.losers}L open</span>
      </div>
      <div className="ph-kpi"><span className="ph-lbl">Hot</span><b className="up">{s.hotCount}</b></div>
      <div className="ph-kpi"><span className="ph-lbl">Cold</span><b className="down">{s.coldCount}</b></div>
    </div>
  );
}

/* ════════════ Heat map tiles ════════════ */
export function PositionsHeatTool() {
  const { data, gate } = usePositions();
  const [sortBy] = useDashState<PositionSort>('positions:sort', 'pnl');
  const [shown, setShown] = useToolSetting<number>('shown', 24);
  if (gate) return gate;
  const positions = sortPositions(data!.positions, sortBy);
  return (
    <div className="fd-fill">
      <div className="ph-controls">
        <SortSeg />
        <span className="ph-note">tile colour = heat rank · click → ticker</span>
      </div>
      <div className="fd-scroll fd-pad">
        <HeatLegend />
        <div className="ph-heat-grid">
          {positions.slice(0, shown).map((p) => <HeatTile key={p.id} position={p} />)}
        </div>
        {positions.length > 24 && (
          <button type="button" className="ph-more" onClick={() => setShown(shown >= positions.length ? 24 : positions.length)}>
            {shown >= positions.length ? 'Show less ↑' : `Show ${positions.length - shown} more ↓`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ════════════ Best vs worst ════════════ */
export function PositionsBestWorstTool() {
  const { data, gate } = usePositions();
  if (gate) return gate;
  const { bestPosition: best, worstPosition: worst } = data!.summary;
  if (!best || !worst) return <QEEmpty className="fd-m" message="No best or worst position yet — needs at least one open position." />;
  return (
    <div className="fd-scroll fd-pad ph-bw">
      <BestWorstCard position={best} type="best" />
      <BestWorstCard position={worst} type="worst" />
    </div>
  );
}

/* ════════════ Book mix — by source / asset type ════════════ */
function MixTable({ title, counts, total }: { title: string; counts: Record<string, number>; total: number }) {
  const rows = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <table className="fd-mini ph-mix">
      <thead><tr><th>{title}</th><th className="r">n</th><th className="r">share</th></tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={3} className="dim">none reported</td></tr>}
        {rows.map(([k, n]) => (
          <tr key={k}>
            <td className="tk">{k}</td>
            <td className="r">{n}</td>
            <td className="r" style={{ position: 'relative' }}>
              <span className="fd-nbar" style={{ width: `${total ? (n / total) * 100 : 0}%`, background: 'var(--cyan)' }} />
              {total ? `${Math.round((n / total) * 100)}%` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function PositionsMixTool() {
  const { data, gate } = usePositions();
  if (gate) return gate;
  const s = data!.summary;
  return (
    <div className="fd-scroll">
      <MixTable title="Source" counts={s.bySource} total={s.total} />
      <MixTable title="Asset type" counts={s.byAssetType} total={s.total} />
    </div>
  );
}

/* ════════════ Detail table ════════════ */
export function PositionsTableTool() {
  const { data, gate } = usePositions();
  const [sortBy, setSortBy] = useDashState<PositionSort>('positions:sort', 'pnl');
  const [, setFocus] = useFocusSymbol();
  if (gate) return gate;
  const positions = sortPositions(data!.positions, sortBy);
  return (
    <div className="fd-scroll fd-pad ph-table">
      <DetailTable positions={positions} sortBy={sortBy} setSortBy={setSortBy} onSelect={setFocus} />
    </div>
  );
}

/* ════════════ The whole page in one tile ════════════ */
export function PositionsClassicTool() {
  return <div className="fd-fill fd-legacy ph-classic"><PositionsHeatmapPage /></div>;
}
