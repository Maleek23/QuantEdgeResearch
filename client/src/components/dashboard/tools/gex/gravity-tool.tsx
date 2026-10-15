/**
 * GRAVITY · Node labels — Apex, Gatekeeper, Rug, Trampoline, delivered vs fresh,
 * node velocity on 5m / 15m / 1h and Halo (≥2 timeframes agree).
 * Data: GET /api/gex/gravity/:symbol?horizon= (server/gravity-route.ts →
 * shared/gravity-nodes.ts). Structural labels, not signals. Colour never the
 * only carrier: every role is a text chip, every velocity prints its sign.
 * Flag GRAVITY_LABELS (default on).
 */
import { useQuery } from '@tanstack/react-query';
import { GEX_HORIZONS, type GexHorizon } from '@shared/gex-horizon';
import { ROLE_LABEL, fmtVelocity, type GravityRead } from '@shared/gravity-nodes';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { fmtGexB } from '@/components/gex/gex-colors';
import { clientFlag } from '@/lib/feature-flags';
import { useFocusSymbol, useToolReport, useToolSetting } from '../../frame';
import './gravity-tool.css';

interface GravityPayload { symbol: string; horizon: GexHorizon; asOf: string | null; read: GravityRead | null; samples: number; note: string }
const HZ: Record<GexHorizon, string> = { today: 'Today', week: 'Week', opex: 'OPEX', all: 'All' };
const ROLE_TONE: Record<string, string> = { apex: 'grv-apex', gatekeeper: 'grv-gk', rug: 'grv-rug', trampoline: 'grv-tramp' };

export function GravityTool() {
  const [symbol] = useFocusSymbol('SPY');
  const [horizon, setHorizon] = useToolSetting<GexHorizon>('gravity.horizon', 'today');
  const on = clientFlag('GRAVITY_LABELS');
  const q = useQuery<GravityPayload>({
    queryKey: ['/api/gex/gravity', symbol, horizon],
    queryFn: async () => {
      const r = await fetch(`/api/gex/gravity/${encodeURIComponent(symbol)}?horizon=${horizon}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: on, staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });
  useToolReport({ asOf: q.data?.asOf ?? null, source: `5-min GEX snapshots · ${HZ[horizon]} book`, note: q.data?.read ? `${q.data.samples} samples` : 'no read', tone: q.isError ? 'warn' : 'ok' });

  if (!on) return <QEEmpty title="Gravity labels are off" message="Switched off by the GRAVITY_LABELS flag." />;
  const r = q.data?.read;
  return (
    <div className="grv">
      <div className="grv-bar" role="group" aria-label="Expiry horizon">
        {GEX_HORIZONS.map((h) => (
          <button key={h} type="button" className="grv-seg" aria-pressed={h === horizon} onClick={() => setHorizon(h)}>{HZ[h]}</button>
        ))}
        <span className="grv-sym">{symbol}{r ? ` · ${r.spot.toFixed(2)}` : ''}</span>
      </div>
      {q.isLoading ? <QELoading rows={6} label="Reading nodes…" /> : q.isError ? <QEError title="Gravity read failed" message="Could not read the intraday snapshots." onRetry={() => q.refetch()} /> : !r ? (
        <QEEmpty title="No nodes yet" message={q.data?.note ?? 'No intraday snapshots.'} />
      ) : (
        <>
          <div className="grv-sum" aria-label="Summary">
            <span>Apex <b>{r.apex ?? '—'}</b></span>
            <span>Gatekeeper <b>{r.gatekeeper ?? '—'}</b></span>
            {r.rug != null && <span>Rug <b>{r.rug}</b> → {r.rugInto ?? '—'}</span>}
            {r.trampoline != null && <span>Trampoline <b>{r.trampoline}</b></span>}
            <span>Halos <b>{r.halos}</b></span>
          </div>
          <div className="grv-scroll">
            <table className="grv-tbl">
              <caption className="lx-sr-only">{symbol} gamma nodes with labels and velocity</caption>
              <thead><tr><th scope="col">Strike</th><th scope="col">GEX</th><th scope="col">Label</th><th scope="col">Today</th><th scope="col">5m</th><th scope="col">15m</th><th scope="col">1h</th><th scope="col">Halo</th></tr></thead>
              <tbody>
                {r.nodes.map((n) => {
                  const spotRow = n.strike < r.spot && !r.nodes.some((m) => m.strike < n.strike && m.strike > r.spot);
                  return (
                    <tr key={n.strike} className={spotRow ? 'grv-below-spot' : undefined}>
                      <th scope="row">{n.strike}</th>
                      <td className={n.gex > 0 ? 'grv-pos' : 'grv-neg'}>{n.gex > 0 ? '+' : '−'}{fmtGexB(Math.abs(n.gex) / 1e9)}</td>
                      <td>{n.roles.map((ro) => <span key={ro} className={`grv-chip ${ROLE_TONE[ro]}`}>{ROLE_LABEL[ro]}</span>)}</td>
                      <td className="grv-dim">{n.delivered == null ? '—' : n.delivered ? 'delivered' : 'fresh'}</td>
                      {(['5m', '15m', '1h'] as const).map((tf) => <td key={tf} className="grv-num">{fmtVelocity(n.velocity?.v[tf] ?? null)}</td>)}
                      <td>{n.velocity?.halo ? <span className="grv-chip grv-halo">Halo {n.velocity.halo === 'building' ? '↑ building' : '↓ bleeding'}</span> : <span className="grv-dim">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="grv-note">{q.data?.note}</p>
        </>
      )}
    </div>
  );
}
