/**
 * Journal dashboard charts — Gauge, EdgeRadar, RelativeDrawdownBars,
 * TimeHeatmap, Sparkline.
 *
 * Ported from LuxAlgo Trade Journal (apps/web/src/components/charts/
 * {gauge,edge-radar,relative-drawdown-bars,time-heatmap}.tsx),
 * https://github.com/LuxAlgo/trade-journal — MIT License, Copyright (c) 2026
 * LuxAlgo Global, LLC (notice: client/src/lib/journal/LICENSE-luxalgo.txt).
 *
 * Changes: dependency-free SVG/HTML instead of recharts/ECharts; our tokens;
 * the radar draws a null axis (no account balance → no drawdown %) as a gap
 * with a label instead of a neutral 50; the heatmap is weekday × entry hour
 * (New York) rather than hour only; every chart states its n.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { fmtMoney, fmtPct } from '@/lib/journal/metrics';
import { EDGE_FULL_MARKS, EDGE_LABELS, type EdgeComponents, type RelDrawdownPoint, type TimeGrid } from '@/lib/journal/metrics-extra';

/** Semicircle gauge for a 0–1 ratio. The value is printed in ink; the arc only reinforces it. */
export function Gauge({ value, label, size = 104 }: { value: number | null; label: string; size?: number }) {
  const r = size / 2 - 7;
  const c = Math.PI * r;
  const ratio = value == null ? 0 : Math.min(Math.max(value, 0), 1);
  const d = `M 7 ${size / 2 + 2} A ${r} ${r} 0 0 1 ${size - 7} ${size / 2 + 2}`;
  return (
    <div className="jr-gauge" role="img" aria-label={`${label}: ${value == null ? 'no data' : fmtPct(ratio, 1)}`}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`} aria-hidden>
        <path d={d} fill="none" stroke="var(--jr-line-hi)" strokeWidth={8} strokeLinecap="round" />
        {value != null && <path d={d} fill="none" stroke="var(--jr-accent)" strokeWidth={8} strokeLinecap="round" strokeDasharray={`${c * ratio} ${c}`} />}
      </svg>
      <div className="jr-gauge-v">{value == null ? '—' : fmtPct(ratio, 1)}</div>
    </div>
  );
}

/** Two-segment bar: average win vs average loss, to scale. */
export function WinLossBar({ avgWin, avgLoss }: { avgWin: number | null; avgLoss: number | null }) {
  if (avgWin == null || avgLoss == null || avgWin + avgLoss <= 0) return null;
  const w = (avgWin / (avgWin + avgLoss)) * 100;
  return (
    <div className="jr-wlbar" role="img" aria-label={`Average win ${fmtMoney(avgWin)} vs average loss ${fmtMoney(-avgLoss)}, to scale`}>
      <span className="w" style={{ width: `${w.toFixed(1)}%` }} />
      <span className="l" />
    </div>
  );
}

/** The edge score's six 0–100 axes. A null axis is drawn as a gap and labelled "no balance". */
export function EdgeRadar({ components, size = 260 }: { components: EdgeComponents; size?: number }) {
  const keys = Object.keys(EDGE_LABELS) as (keyof EdgeComponents)[];
  const cx = size / 2, cy = size / 2, R = size / 2 - 58;
  const [hover, setHover] = useState<keyof EdgeComponents | null>(null);
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i / keys.length) * Math.PI * 2;
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)] as const;
  };
  const known = keys.map((k, i) => ({ k, i, v: components[k] }));
  const poly = known.filter((x) => x.v != null).map((x) => pt(x.i, x.v as number).join(',')).join(' ');
  return (
    <div className="jr-radar">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, maxHeight: size }} role="img"
        aria-label={`Edge score components: ${known.map((x) => `${EDGE_LABELS[x.k]} ${x.v == null ? 'not scored' : Math.round(x.v)}`).join(', ')}`}>
        {[25, 50, 75, 100].map((ring) => (
          <polygon key={ring} points={keys.map((_, i) => pt(i, ring).join(',')).join(' ')} fill="none" stroke="var(--jr-line-hi)" strokeWidth={1} />
        ))}
        {keys.map((k, i) => {
          const [x, y] = pt(i, 100);
          const [lx, ly] = pt(i, 128);
          const v = components[k];
          return (
            <g key={k} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--jr-line-hi)" strokeDasharray={v == null ? '3 3' : undefined} />
              <text x={lx} y={ly} textAnchor={Math.abs(lx - cx) < 4 ? 'middle' : lx > cx ? 'start' : 'end'} dominantBaseline="middle"
                fontSize={10.5} fill={v == null ? 'var(--text-mute)' : 'var(--text-dim)'}>
                {EDGE_LABELS[k]}
                <tspan x={lx} dy={12} fontSize={10} fill="var(--text-mute)">{v == null ? 'no balance' : Math.round(v)}</tspan>
              </text>
            </g>
          );
        })}
        {poly && <polygon points={poly} fill="color-mix(in srgb, var(--jr-accent) 28%, transparent)" stroke="var(--jr-accent)" strokeWidth={2} />}
        {known.filter((x) => x.v != null).map((x) => { const [px, py] = pt(x.i, x.v as number); return <circle key={x.k} cx={px} cy={py} r={2.5} fill="var(--jr-accent-hi)" />; })}
      </svg>
      <p className="jr-n" style={{ whiteSpace: 'normal', minHeight: 14 }}>
        {hover ? `${EDGE_LABELS[hover]}: full marks at ${EDGE_FULL_MARKS[hover]}` : 'Hover an axis for its full-marks threshold.'}
      </p>
    </div>
  );
}

/** Relative drawdown bars under the equity curve (needs a balance; empty → says why). */
export function RelativeDrawdownBars({ data, why, height = 90 }: { data: RelDrawdownPoint[]; why?: string | null; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.pct));
  return (
    <div className="jr-reldd">
      <div className="jr-reldd-h">
        <span>Relative drawdown</span>
        <span className="jr-loss">{data.length ? `max −${fmtPct(max, 1)}` : 'balance required'}</span>
      </div>
      {!data.length ? (
        <p className="jr-note" style={{ margin: 0 }}>{why ?? 'This book has no account balance, so drawdown as a % of the account cannot be charted.'}</p>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${data.length} 100`} preserveAspectRatio="none" width="100%" height={height} role="img"
            aria-label={`Relative drawdown over ${data.length} closes, deepest ${fmtPct(max, 1)}`}
            onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <rect key={i} x={i + 0.08} y={0} width={0.84} height={max > 0 ? (d.pct / Math.max(max, 0.0001)) * 100 : 0}
                fill="var(--jr-loss)" fillOpacity={hover === i ? 1 : 0.75} onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
          {hover != null && data[hover] && (
            <div className="jr-tip" style={{ left: `${(hover / data.length) * 100}%` }}>
              {new Date(data[hover].t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })} · −{fmtPct(data[hover].pct, 2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Weekday × entry-hour grid of net P&L. Lightness carries magnitude; the printed number carries sign. */
export function TimeHeatmap({ grid, onPick }: { grid: TimeGrid; onPick?: (weekday: string, hour: number) => void }) {
  if (!grid.n) return <p className="jr-note">No closed trades with an entry time in view.</p>;
  const max = Math.max(1, grid.maxAbs);
  return (
    <div className="jr-table-wrap">
      <div className="jr-heat" style={{ gridTemplateColumns: `44px repeat(${grid.hours.length}, minmax(46px, 1fr))` }} role="grid" aria-label="Net P&L by entry weekday and hour, New York time">
        <div role="columnheader" />
        {grid.hours.map((h) => <div key={h} className="jr-heat-h" role="columnheader">{String(h).padStart(2, '0')}:00</div>)}
        {grid.weekdays.map((w) => (
          <div key={w} role="row" style={{ display: 'contents' }}>
            <div className="jr-heat-h" role="rowheader">{w}</div>
            {grid.hours.map((h) => {
              const c = grid.cells.get(`${w}|${h}`);
              if (!c) return <div key={h} className="jr-heat-c empty" role="gridcell" aria-label={`${w} ${h}:00, no trades`} />;
              const hue = c.netPnl > 0 ? 'var(--jr-gain)' : c.netPnl < 0 ? 'var(--jr-loss)' : 'var(--text-mute)';
              const pct = Math.round((0.12 + 0.5 * (Math.abs(c.netPnl) / max)) * 100);
              const label = `${w} ${String(h).padStart(2, '0')}:00 ET: ${fmtMoney(c.netPnl)}, ${c.closed} closed, ${c.wins} won`;
              const Tag = onPick ? 'button' : 'div';
              return (
                <Tag key={h} {...(onPick ? { type: 'button' as const, onClick: () => onPick(w, h) } : {})} role="gridcell" title={label} aria-label={label}
                  className={cn('jr-heat-c')} style={{ background: `color-mix(in srgb, ${hue} ${pct}%, transparent)` }}>
                  <span className="p">{fmtMoney(c.netPnl, { compact: true })}</span>
                  <span className="n">n={c.closed}</span>
                </Tag>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tiny line of a running value (day equity). */
export function Sparkline({ values, height = 40, label }: { values: number[]; height?: number; label: string }) {
  if (values.length < 1) return null;
  const pts = [0, ...values];
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts);
  const span = hi - lo || 1;
  const w = Math.max(1, pts.length - 1);
  const y = (v: number) => 100 - ((v - lo) / span) * 100;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${i},${y(v).toFixed(2)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={label}>
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--jr-line-hi)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={last >= 0 ? 'var(--jr-gain)' : 'var(--jr-loss)'} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
