/**
 * SECTOR FLOW MATRIX — the precise "follow the money across time" engine.
 *
 * Where the one-line RotationBrief answers "where did money go today?", this
 * panel answers the deeper question from the morning brief: where is leadership
 * BUILDING or ROLLING OVER across timeframes — hourly, daily, weekly, monthly —
 * and what is the rotation PATTERN (who money is leaving, who it's moving into).
 *
 * Each sector is placed in an RRG-style quadrant (Leading / Improving /
 * Weakening / Lagging) measured RELATIVE to SPY, with a per-timeframe relative
 * grid, a 20-day relative-strength sparkline, and plain-English pattern text.
 *
 * Honest states: loading / error / no-data render minimal placeholders. A
 * timeframe with insufficient history shows "—", never a fabricated number.
 *
 * Data: GET /api/rotation-matrix  (server: sector-rotation.ts → getRotationMatrix)
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Loader2, Waves, TrendingUp, TrendingDown, ArrowRight, Minus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QECard, QEPill, type QEPillVariant } from '@/components/ui/qe';

type RotTF = '1H' | '1D' | '1W' | '1M' | '3M';
type Quadrant = 'leading' | 'improving' | 'weakening' | 'lagging';

interface SectorPredict {
  bestDay: string | null;
  bestDayRel: number | null;
  worstDay: string | null;
  worstDayRel: number | null;
  autocorr: number | null;
  behavior: 'trend-follows' | 'mean-reverts' | 'random' | null;
  streak: number;
  streakDir: 'up' | 'down' | 'flat';
  edgeAfterStreak: number | null;
  note: string;
}

interface SectorRotationRow {
  etf: string;
  name: string;
  abs: Record<RotTF, number | null>;
  rel: Record<RotTF, number | null>;
  rank: Record<RotTF, number | null>;
  quadrant: Quadrant;
  rsRatio: number;
  rsMomentum: number;
  trend: 'accelerating' | 'rolling' | 'steady';
  pattern: string;
  spark: number[];
  predict: SectorPredict | null;
}

interface RotationMatrixData {
  asOf: string;
  sessionLabel: string;
  isStale: boolean;
  spyChange: number;
  timeframes: RotTF[];
  rows: SectorRotationRow[];
  narrative: string[];
  rotations: { from: string; to: string }[];
  predictive: string[];
}

function useRotationMatrix() {
  return useQuery<RotationMatrixData>({
    queryKey: ['/api/rotation-matrix'],
    queryFn: async () => {
      const res = await fetch('/api/rotation-matrix', { credentials: 'include' });
      if (!res.ok) throw new Error('rotation matrix failed');
      return res.json();
    },
    staleTime: 120_000,
    refetchInterval: 300_000,
    retry: 1,
  });
}

const QUAD_META: Record<Quadrant, { label: string; variant: QEPillVariant; dot: string }> = {
  leading:   { label: 'Leading',   variant: 'bull', dot: 'bg-emerald-400' },
  improving: { label: 'Improving', variant: 'cyan', dot: 'bg-cyan-400' },
  weakening: { label: 'Weakening', variant: 'gold', dot: 'bg-amber-400' },
  lagging:   { label: 'Lagging',   variant: 'bear', dot: 'bg-rose-400' },
};

function relTone(v: number | null): string {
  if (v == null) return 'text-zinc-600';
  if (v > 0.1) return 'text-emerald-400';
  if (v < -0.1) return 'text-rose-400';
  return 'text-zinc-400';
}

function fmtRel(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** Inline SVG sparkline of cumulative relative-vs-SPY performance. */
function RelSpark({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) {
    return <div className="h-6 w-20 flex items-center justify-center text-[9px] text-zinc-700">—</div>;
  }
  const w = 80, h = 24, pad = 2;
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 0);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  const stroke = up ? '#34d399' : '#fb7185';
  return (
    <svg width={w} height={h} className="overflow-visible">
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const TF_LABEL: Record<RotTF, string> = { '1H': '1H', '1D': '1D', '1W': '1W', '1M': '1M', '3M': '3M' };

export function SectorFlowMatrix({ className }: { className?: string }) {
  const { data, isLoading, isError } = useRotationMatrix();
  const [sortTf, setSortTf] = useState<RotTF | 'quad'>('quad');

  if (isLoading) {
    return (
      <QECard variant="default" padding="lg" className={cn('flex items-center gap-2', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
        <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">Mapping rotation across timeframes…</span>
      </QECard>
    );
  }

  if (isError || !data || !data.rows.length) {
    return (
      <QECard variant="default" padding="lg" className={cn('flex items-center gap-2', className)}>
        <Waves className="h-4 w-4 text-zinc-600" />
        <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-600">Rotation matrix unavailable</span>
      </QECard>
    );
  }

  const spyUp = data.spyChange >= 0;
  const rows = sortTf === 'quad'
    ? data.rows
    : [...data.rows].sort((a, b) => {
        const av = a.rel[sortTf], bv = b.rel[sortTf];
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      });

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header: title + honest session stamp + SPY */}
      <div className="flex items-center gap-2 flex-wrap">
        <Waves className="h-4 w-4 text-[var(--brand-cyan,#22d3ee)]" />
        <span className="text-[12px] font-mono font-bold uppercase tracking-widest text-zinc-200">Rotation Matrix</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider',
            data.isStale ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25' : 'bg-emerald-500/15 text-emerald-400',
          )}
          title={data.isStale ? 'Latest data is from a prior session — not live flow' : 'Live session data'}
        >
          {data.isStale ? `${data.sessionLabel} · stale` : data.sessionLabel}
        </span>
        <span className={cn('ml-auto text-[11px] font-mono tabular-nums', spyUp ? 'text-emerald-400' : 'text-rose-400')}>
          SPY {spyUp ? '+' : ''}{data.spyChange.toFixed(2)}%
        </span>
      </div>

      {/* Narrative callouts */}
      {data.narrative.length > 0 && (
        <div className="space-y-1">
          {data.narrative.map((n, i) => (
            <div key={i} className="text-[11px] font-mono text-zinc-400 leading-snug">{n}</div>
          ))}
        </div>
      )}

      {/* Rotation arrows */}
      {data.rotations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {data.rotations.slice(0, 4).map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 px-2 py-1 text-[10px] font-mono">
              <span className="text-rose-400">{r.from}</span>
              <ArrowRight className="h-3 w-3 text-zinc-500" />
              <span className="text-emerald-400">{r.to}</span>
            </span>
          ))}
        </div>
      )}

      {/* Predictive patterns — mined seasonality + day-to-day persistence */}
      {data.predictive && data.predictive.length > 0 && (
        <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.06] px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-300" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-violet-300">Predictive Patterns</span>
            <span className="text-[8px] font-mono text-violet-400/50 uppercase tracking-wider">~1y daily history</span>
          </div>
          {data.predictive.map((p, i) => (
            <div key={i} className="text-[11px] font-mono text-violet-100/80 leading-snug">{p}</div>
          ))}
        </div>
      )}

      {/* Matrix table */}
      <QECard variant="default" padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="border-b border-zinc-800 text-[9px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 text-left font-semibold">Sector</th>
                <th className="px-2 py-2 text-left font-semibold">State</th>
                {data.timeframes.map((tf) => (
                  <th key={tf} className="px-2 py-2 text-right font-semibold">
                    <button
                      onClick={() => setSortTf(sortTf === tf ? 'quad' : tf)}
                      className={cn(
                        'cursor-pointer rounded px-1 py-0.5 transition-colors hover:text-zinc-200',
                        sortTf === tf ? 'text-[var(--brand-cyan,#22d3ee)]' : '',
                      )}
                      title={`Sort by ${tf} relative strength`}
                    >
                      {TF_LABEL[tf]}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold">20d vs SPY</th>
                <th className="px-3 py-2 text-left font-semibold">Pattern</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = QUAD_META[r.quadrant];
                const sparkUp = r.spark.length ? r.spark[r.spark.length - 1] >= 0 : true;
                return (
                  <tr key={r.etf} className="border-b border-zinc-900/70 last:border-0 hover:bg-zinc-900/40 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-semibold text-zinc-200">{r.name}</span>
                      <span className="ml-1.5 text-[9px] text-zinc-600">{r.etf}</span>
                    </td>
                    <td className="px-2 py-2">
                      <QEPill variant={meta.variant} className="text-[9px]">
                        <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                        {meta.label}
                      </QEPill>
                    </td>
                    {data.timeframes.map((tf) => (
                      <td key={tf} className={cn('px-2 py-2 text-right tabular-nums', relTone(r.rel[tf]))}>
                        {fmtRel(r.rel[tf])}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {r.trend === 'accelerating' && <TrendingUp className="h-3 w-3 text-emerald-400" />}
                        {r.trend === 'rolling' && <TrendingDown className="h-3 w-3 text-rose-400" />}
                        {r.trend === 'steady' && <Minus className="h-3 w-3 text-zinc-600" />}
                        <RelSpark data={r.spark} up={sparkUp} />
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-zinc-400">{r.pattern}</div>
                      {r.predict && r.predict.note !== 'No strong day-to-day pattern' && (
                        <div className="text-[9px] text-violet-300/70 mt-0.5">{r.predict.note}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </QECard>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-mono text-zinc-500">
        <span>Relative to SPY · click a timeframe to sort</span>
        {(['leading', 'improving', 'weakening', 'lagging'] as Quadrant[]).map((q) => (
          <span key={q} className="inline-flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', QUAD_META[q].dot)} />
            {QUAD_META[q].label}
          </span>
        ))}
      </div>
    </div>
  );
}
