/**
 * SQUEEZE RADAR tool — GEX and FLOW workspaces (docs/GAMMA_SQUEEZE.md).
 *
 * Compact ranked list (stage · score · coverage · squeeze strike · age) and a
 * detail pane for the selected name: every component with its points, weight
 * and the input behind it, the key strikes, and what is missing. Reads one
 * endpoint (GET /api/gex-vex/squeeze-radar), scored server-side at the end of
 * each GEX rankings cycle — this tool makes no provider calls.
 *
 * Honesty rules: the radar is UNVALIDATED (stated in the frame and footer);
 * components without data print "n/a", never a number; every row carries the
 * age of its chain read and stale rows are marked.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SqueezeRadarPayload, SqueezeRadarRow, SqueezeStage } from '@shared/squeeze-radar';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useFocusSymbol, useToolReport } from '../../frame';
import { ageLabel } from '../flow/tape';

const mono = "'JetBrains Mono',monospace";
// CVD-safe: blue / amber / vermilion, always with the word.
const STAGE_COLOR: Record<SqueezeStage, string> = {
  igniting: '#ff6b3d', primed: '#f5b041', building: '#3b8cff', exhausted: '#9aa3b2', quiet: '#6b7280', illiquid: '#6b7280',
};
const fmtK = (v: number | null | undefined) => (v == null ? '—' : v >= 100 ? v.toFixed(0) : v.toFixed(v % 1 ? 1 : 0));
const fmtPct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`);

export function SqueezeRadarTool() {
  const [focus, setFocus] = useFocusSymbol();
  const [picked, setPicked] = useState<string | null>(null);
  const q = useQuery<SqueezeRadarPayload>({
    queryKey: ['/api/gex-vex/squeeze-radar'],
    queryFn: async () => {
      const r = await fetch('/api/gex-vex/squeeze-radar?limit=60', { credentials: 'include' });
      if (!r.ok) throw new Error('squeeze radar failed');
      return r.json();
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });
  const rows = q.data?.rows ?? [];
  const staleCount = rows.filter((r) => r.stale).length;
  useToolReport({
    asOf: q.isError && !q.data ? null : q.data ? q.data.lastRunAt : undefined,
    note: q.isError ? 'refresh failed' : 'unvalidated — measuring',
    tone: q.isError || (rows.length > 0 && staleCount === rows.length) ? 'warn' : 'ok',
  });
  const sel = useMemo(() => rows.find((r) => r.symbol === (picked ?? focus)) ?? null, [rows, picked, focus]);

  if (q.isLoading) return <QELoading rows={6} className="fd-pad" label="squeeze radar loading…" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="Squeeze radar didn't load" onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (!q.data?.lastRunAt) return <QEEmpty className="fd-m" message="The radar has not run yet — it scores at the end of each GEX rankings cycle (every 10 min in cash hours)." />;
  if (!rows.length) return <QEEmpty className="fd-m" message="No names scored: the rankings job has no chain reads with squeeze data yet." />;

  return (
    <div className="gx-tool gx-col" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div className="gx-controls">
        <span className="gx-note" title={q.data.note}>
          {q.data.universe} scored · {q.data.logged.sessions} logged session{q.data.logged.sessions === 1 ? '' : 's'}{staleCount ? ` · ${staleCount} stale` : ''}
        </span>
      </div>
      <div className="fd-scroll" style={{ flex: '1 1 55%', minHeight: 80 }}>
        <table className="fd-mini">
          <thead><tr><th>Ticker</th><th>Stage</th><th className="r" title="0–100, sum of available components">Score</th><th className="r" title="Share of the 100 weight points whose inputs exist">Cov</th><th className="r" title="Largest near-dated OTM call gamma strike">Strike</th><th className="r">Age</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className={sel?.symbol === r.symbol ? 'sel' : ''} onClick={() => { setPicked(r.symbol); setFocus(r.symbol); }} title={`${r.symbol} — ${r.stageNote}`}>
                <td className="tk">{r.symbol}</td>
                <td style={{ color: STAGE_COLOR[r.stage] }}>{r.stage}</td>
                <td className="r" style={{ fontFamily: mono }}>{r.score}</td>
                <td className="r dim" style={{ fontFamily: mono }}>{r.coverage}</td>
                <td className="r" style={{ fontFamily: mono }}>{fmtK(r.keyStrikes.squeezeStrike)}</td>
                <td className={`r ${r.stale ? '' : 'dim'}`} style={r.stale ? { color: '#f5b041' } : undefined}>{ageLabel(r.chainAsOf)}{r.stale ? ' · stale' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel ? <SqueezeDetail row={sel} /> : <div className="fd-foot">Click a row for components and key strikes.</div>}
      <div className="fd-foot">
        Unvalidated — measuring. Score orders names by squeeze structure; it is not a probability and the weights are judgment, not fitted. Every session is logged for forward scoring (docs/GAMMA_SQUEEZE.md).
      </div>
    </div>
  );
}

function SqueezeDetail({ row }: { row: SqueezeRadarRow }) {
  const k = row.keyStrikes;
  return (
    <div className="fd-scroll" style={{ flex: '1 1 45%', minHeight: 80, borderTop: '1px solid var(--qe-border, rgba(255,255,255,.08))', padding: '6px 8px' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 12 }}>
        <strong>{row.symbol}</strong>
        <span style={{ color: STAGE_COLOR[row.stage] }}>{row.stage}</span>
        <span className="dim">{row.stageNote}</span>
      </div>
      <div className="dim" style={{ fontSize: 11, margin: '4px 0', fontFamily: mono }}>
        spot {row.spot != null ? `$${row.spot.toFixed(2)}` : '—'} · day {fmtPct(row.changePct)} · 5d {fmtPct(row.ret5Pct)} · chain {row.chainSource ?? '—'} {ageLabel(row.chainAsOf)}{row.openInterestDate ? ` · OI ${row.openInterestDate}` : ''}
      </div>
      <div style={{ fontSize: 11, fontFamily: mono, margin: '4px 0' }}>
        squeeze strike {fmtK(k.squeezeStrike)} · call wall {fmtK(k.callWall)} · zero-γ naive {fmtK(k.zeroGammaNaive)} / adjusted {fmtK(k.zeroGammaAdjusted)}
      </div>
      <table className="fd-mini">
        <thead><tr><th>Component</th><th className="r">Pts</th><th>Input</th></tr></thead>
        <tbody>
          {row.components.map((c) => (
            <tr key={c.key} title={c.detail}>
              <td>{c.label}</td>
              <td className="r" style={{ fontFamily: mono, whiteSpace: 'nowrap' }}>{c.available ? `${c.points.toFixed(1)}/${c.weight}` : <span className="dim">n/a /{c.weight}</span>}</td>
              <td className="dim" style={{ fontSize: 11 }}>{c.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {k.topOtmCalls.length > 0 && (
        <table className="fd-mini" style={{ marginTop: 6 }}>
          <thead><tr><th>OTM call</th><th>Exp</th><th className="r">Vol</th><th className="r">OI</th><th className="r">Vol/OI</th><th className="r">IV</th></tr></thead>
          <tbody>
            {k.topOtmCalls.map((s) => (
              <tr key={s.strike}>
                <td style={{ fontFamily: mono }}>{fmtK(s.strike)}C <span className="dim">{fmtPct(s.distPct)}</span></td>
                <td className="dim">{s.exp}</td>
                <td className="r" style={{ fontFamily: mono }}>{s.volume.toLocaleString()}</td>
                <td className="r" style={{ fontFamily: mono }}>{s.openInterest.toLocaleString()}</td>
                <td className="r" style={{ fontFamily: mono }}>{s.volOI != null ? `${s.volOI.toFixed(1)}×` : '—'}</td>
                <td className="r" style={{ fontFamily: mono }}>{s.iv != null ? `${(s.iv * 100).toFixed(0)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
