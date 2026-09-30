/**
 * Sparkline — tiny real-data area line for list rows. Fetches 5d/1d closes.
 * Renders nothing (a thin dash) when there's no data — never a fake curve.
 *
 * Plain SVG (perf 2026-09-30): this used recharts, and because the terminal
 * footer's WatchlistRail renders it, the whole recharts + d3 + lodash stack
 * (~100 KB gzip) sat in the eager /t shell chunk. Same data, same scaling
 * (y domain = [min, max] of the closes, monotone-ish line, top→bottom fade).
 */
import { useId } from 'react';
import { usePriceHistory } from './use-price-history';

/** Monotone cubic (Fritsch–Carlson) path — matches recharts `type="monotone"`. */
function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n < 2) return '';
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    m[i] = dx[i] === 0 ? 0 : (ys[i + 1] - ys[i]) / dx[i];
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  t[n - 1] = m[n - 2];
  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${xs[i] + h},${ys[i] + h * t[i]} ${xs[i + 1] - h},${ys[i + 1] - h * t[i + 1]} ${xs[i + 1]},${ys[i + 1]}`;
  }
  return d;
}

export function Sparkline({
  symbol,
  tone = 'bull',
  width = 96,
  height = 30,
}: {
  symbol: string;
  tone?: 'bull' | 'bear' | 'neutral';
  width?: number | string;
  height?: number;
}) {
  const { points } = usePriceHistory(symbol, '5d', '1d');
  const rid = useId().replace(/:/g, '');
  const color =
    tone === 'bull' ? 'var(--trade-bullish)'
    : tone === 'bear' ? 'var(--trade-bearish)'
    : 'var(--brand-cyan)';

  if (points.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-end"
      >
        <div className="w-full border-t border-dashed border-border/40" />
      </div>
    );
  }

  const gid = `spark-${symbol}-${tone}-${rid}`;
  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  // viewBox units: x 0..100, y 0..height with the same 2px top/bottom margin.
  const H = height, pad = 2;
  const xs = closes.map((_, i) => (i / (closes.length - 1)) * 100);
  const ys = closes.map((c) => pad + (1 - (c - min) / span) * (H - pad * 2));
  const line = monotonePath(xs, ys);
  const area = `${line}L100,${H - pad}L0,${H - pad}Z`;

  return (
    <div style={{ width, height }}>
      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden
        className="block overflow-visible"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} stroke="none" />
        <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
