/**
 * Equity curve + daily P&L bars. Idea from LuxAlgo Trade Journal's dashboard
 * ("Daily net cumulative P&L" / "Net daily P&L", components/charts/equity-area.tsx
 * and daily-bars.tsx, MIT); re-implemented as a dependency-free SVG in the
 * landing sparkline's style (accent line + glow + fading area, crosshair tooltip).
 * Bars grow from a zero baseline so direction is geometry, not colour.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtMoney, type DayStats, type EquityPoint } from '@/lib/journal/metrics';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const shortDate = (s: string) => {
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: s.length === 10 ? 'UTC' : 'America/New_York' });
};

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

export function EquityChart({ curve, days, mode, height = 220 }: {
  curve: EquityPoint[];
  days: DayStats[];
  mode: 'cumulative' | 'daily';
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 56, padR = 10, padT = 10, padB = 22;
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;

  const series = useMemo(() => (mode === 'cumulative'
    ? curve.map((p) => ({ t: p.t, v: p.cumNetPnl, sub: `${p.symbol ?? ''} ${fmtMoney(p.pnl)}` }))
    : days.map((d) => ({ t: d.date, v: d.netPnl, sub: `${d.trades} trade${d.trades === 1 ? '' : 's'}` }))), [mode, curve, days]);

  const lo = Math.min(0, ...series.map((s) => s.v));
  const hi = Math.max(0, ...series.map((s) => s.v));
  const ticks = niceTicks(lo, hi);
  const yMin = Math.min(lo, ticks[0] ?? lo);
  const yMax = Math.max(hi, ticks[ticks.length - 1] ?? hi);
  const Y = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const n = series.length;
  const X = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);

  const last = series[n - 1]?.v ?? 0;
  const lineColor = last >= 0 ? 'var(--jr-gain)' : 'var(--jr-loss)';
  const zeroY = Y(0);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    const idx = mode === 'daily'
      ? Math.floor((x / innerW) * n)
      : Math.round((x / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  const summary = n
    ? `${mode === 'cumulative' ? 'Cumulative net P&L' : 'Daily net P&L'} over ${n} ${mode === 'cumulative' ? 'closed trades' : 'trading days'}, ending ${fmtMoney(last)}`
    : 'No closed trades in view';

  const barW = n ? Math.max(1, Math.min(18, innerW / n - 2)) : 0;
  const hp = hover != null ? series[hover] : null;

  return (
    <div ref={ref} className="jr-chart" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="jr-eq-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={padL} x2={padL + innerW} y1={Y(t)} y2={Y(t)} opacity={0.5} />
              <text className="axis" x={padL - 6} y={Y(t) + 3} textAnchor="end">{fmtMoney(t, { compact: true })}</text>
            </g>
          ))}
          <line className="zero" x1={padL} x2={padL + innerW} y1={zeroY} y2={zeroY} />
          {mode === 'cumulative' && n > 0 && (
            <>
              <path
                d={`M${X(0)},${zeroY} ${series.map((s, i) => `L${X(i)},${Y(s.v)}`).join(' ')} L${X(n - 1)},${zeroY} Z`}
                fill="url(#jr-eq-fill)"
              />
              <path
                d={series.map((s, i) => `${i ? 'L' : 'M'}${X(i)},${Y(s.v)}`).join(' ')}
                fill="none" stroke={lineColor} strokeWidth={1.6} strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 4px ${last >= 0 ? 'rgba(110,231,183,0.45)' : 'rgba(255,107,61,0.45)'})` }}
              />
              {n === 1 && <circle cx={X(0)} cy={Y(series[0].v)} r={3} fill={lineColor} />}
            </>
          )}
          {mode === 'daily' && series.map((s, i) => {
            const cx = padL + ((i + 0.5) / n) * innerW;
            const y = Math.min(Y(s.v), zeroY);
            return (
              <rect key={s.t} x={cx - barW / 2} y={y} width={barW} height={Math.max(1, Math.abs(Y(s.v) - zeroY))} rx={1.5}
                fill={s.v >= 0 ? 'var(--jr-gain)' : 'var(--jr-loss)'} opacity={hover === i ? 1 : 0.75} />
            );
          })}
          {n > 1 && [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
            <text key={i} className="axis" y={height - 6}
              x={mode === 'daily' ? padL + ((i + 0.5) / n) * innerW : X(i)}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{shortDate(series[i].t)}</text>
          ))}
          {hp && hover != null && (
            <line x1={mode === 'daily' ? padL + ((hover + 0.5) / n) * innerW : X(hover)} x2={mode === 'daily' ? padL + ((hover + 0.5) / n) * innerW : X(hover)}
              y1={padT} y2={padT + innerH} stroke="var(--text-mute)" strokeDasharray="3 3" />
          )}
        </svg>
      )}
      {hp && hover != null && (
        <div className="jr-chart-tip" style={{
          left: Math.min(Math.max(80, mode === 'daily' ? padL + ((hover + 0.5) / n) * innerW : X(hover)), width - 80),
          top: Math.max(40, Y(hp.v) - 6),
        }}>
          {shortDate(hp.t)} · <b>{fmtMoney(hp.v)}</b><br /><span className="jr-mute">{hp.sub}</span>
        </div>
      )}
      {!n && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }} className="jr-note">No closed trades in view — the curve starts at your first exit.</div>}
    </div>
  );
}

/** Underwater curve: how far below the running peak each close sat. */
export function UnderwaterChart({ points, height = 120 }: { points: { t: string; dd: number }[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const padL = 56, padR = 10, padT = 6, padB = 18;
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;
  const min = Math.min(-1, ...points.map((p) => p.dd));
  const n = points.length;
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const Y = (v: number) => padT + (v / min) * innerH;
  return (
    <div ref={ref} className="jr-chart" style={{ height }}>
      {width > 0 && n > 1 && (
        <svg width={width} height={height} role="img" aria-label={`Drawdown from running peak; deepest ${fmtMoney(min)}`}>
          <line className="zero" x1={padL} x2={padL + innerW} y1={padT} y2={padT} />
          <text className="axis" x={padL - 6} y={padT + 3} textAnchor="end">$0</text>
          <text className="axis" x={padL - 6} y={padT + innerH} textAnchor="end">{fmtMoney(min, { compact: true })}</text>
          <path d={`M${X(0)},${padT} ${points.map((p, i) => `L${X(i)},${Y(p.dd)}`).join(' ')} L${X(n - 1)},${padT} Z`}
            fill="var(--jr-loss)" opacity={0.22} />
          <path d={points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.dd)}`).join(' ')} fill="none" stroke="var(--jr-loss)" strokeWidth={1.2} />
          <text className="axis" x={padL} y={height - 4}>{shortDate(points[0].t)}</text>
          <text className="axis" x={padL + innerW} y={height - 4} textAnchor="end">{shortDate(points[n - 1].t)}</text>
        </svg>
      )}
      {n <= 1 && <p className="jr-note">Needs at least two closed trades.</p>}
    </div>
  );
}
