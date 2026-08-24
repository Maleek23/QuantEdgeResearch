/**
 * PRICE CHART — the reference site's chart, rebuilt to its actual spec.
 *
 * Not matched by eye. These numbers were read out of funda.ai's own stylesheet
 * and SVG markup, so the geometry and the motion are theirs:
 *
 *   viewBox              0 0 1000 480, preserveAspectRatio="xMidYMid meet"
 *   plot area            x 64 → 968,  y 60 → 424
 *   gridlines            5, evenly spaced 91px apart
 *   y labels             right-aligned at x=52; axis title at (12,38)
 *   area gradient        vertical, accent at 0.28 → 0.04 @60% → 0 @100%
 *   area path            starts on the baseline, traces the line, closes back down
 *
 *   @keyframes line-draw   stroke-dashoffset 6000 → 0
 *   @keyframes area-in     opacity 0 → .55          ← settles at .55, not 1
 *   @keyframes pulse       r 6 → 16, opacity .55 → 0  ← animates the SVG `r`
 *                                                       attribute, not a transform
 *   line   stroke-dasharray:6000; 1.2s cubic-bezier(.22,1,.36,1) both
 *   area   0.9s 0.1s both
 *
 *   .grid        stroke-dasharray: 4 4                 ← DASHED, not solid
 *   .price-line  filter: drop-shadow(0 0 6px accent)   ← the line is lit
 *
 * Those last two were matched by eye on the first pass and both were wrong. A
 * solid grid competes with the series for the same visual weight, and the glow
 * is most of why their chart reads as an instrument rather than a printout.
 *
 * Two deliberate departures:
 *
 *   1. THE ACCENT IS ICE SIGNAL, not their mint #31f6b8. Borrow the geometry and
 *      the timing; the colour is this product's identity.
 *
 *   2. THE DATA IS REAL. Their chart is a decorative shape with invented axis
 *      values (133 / 104 / 76 / 48 / 19). This takes a real series and labels the
 *      axis from it, because a fabricated price chart on a trading platform is the
 *      exact thing this landing page already refuses to do elsewhere. If no series
 *      is supplied it renders nothing rather than a pretty curve of nothing.
 */
import { useId, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';

const VB = { w: 1000, h: 480 };
const PLOT = { x0: 64, x1: 968, y0: 60, y1: 424 };
const GRID_LINES = 5;

export interface PriceChartProps {
  /** Real closes, oldest → newest. Fewer than 2 points renders nothing. */
  series: number[];
  /** Optional horizontal markers — a gap edge, a gamma wall, a target. */
  levels?: { price: number; label: string; tone?: 'bull' | 'bear' | 'structural' }[];
  axisTitle?: string;
  className?: string;
}

const TONE: Record<string, string> = {
  bull: 'var(--trade-bullish)',
  bear: 'var(--trade-bearish)',
  structural: 'var(--brand-cyan)',
};

export function PriceChart({ series, levels = [], axisTitle = 'Price (USD)', className }: PriceChartProps) {
  const uid = useId().replace(/:/g, '');
  const reduce = useReducedMotion();

  const model = useMemo(() => {
    const pts = (series ?? []).filter((n) => Number.isFinite(n));
    if (pts.length < 2) return null;

    // Pad the range so the line never rides the frame, and so level markers that
    // sit just outside the series still land on the canvas.
    const all = [...pts, ...levels.map((l) => l.price)].filter(Number.isFinite);
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || 1;
    const min = lo - pad;
    const max = hi + pad;

    const xAt = (i: number) => PLOT.x0 + (i / (pts.length - 1)) * (PLOT.x1 - PLOT.x0);
    const yAt = (v: number) => PLOT.y1 - ((v - min) / (max - min)) * (PLOT.y1 - PLOT.y0);

    const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(' ');
    // Area opens on the baseline and closes back to it — their exact construction.
    const area = `M ${PLOT.x0} ${PLOT.y1} ${line.replace(/^M/, 'L')} L ${PLOT.x1} ${PLOT.y1} Z`;

    const gridY = Array.from({ length: GRID_LINES }, (_, i) => PLOT.y0 + (i * (PLOT.y1 - PLOT.y0)) / (GRID_LINES - 1));
    const gridLabel = (y: number) => max - ((y - PLOT.y0) / (PLOT.y1 - PLOT.y0)) * (max - min);

    return {
      line,
      area,
      gridY,
      gridLabel,
      lastX: xAt(pts.length - 1),
      lastY: yAt(pts[pts.length - 1]),
      levelsOnPlot: levels
        .filter((l) => l.price >= min && l.price <= max)
        .map((l) => ({ ...l, y: yAt(l.price) })),
    };
  }, [series, levels]);

  // No series, no chart. A decorative curve here would be an invented price.
  if (!model) return null;

  return (
    <div className={className}>
      <style>{`
        @keyframes pc-${uid}-draw { from { stroke-dashoffset: 6000px } to { stroke-dashoffset: 0 } }
        @keyframes pc-${uid}-area { from { opacity: 0 } to { opacity: .55 } }
        @keyframes pc-${uid}-pulse { from { r: 6; opacity: .55 } to { r: 16; opacity: 0 } }
        .pc-${uid}-line { stroke-dasharray: 6000; animation: 1.2s cubic-bezier(.22,1,.36,1) both pc-${uid}-draw; }
        .pc-${uid}-area { animation: .9s .1s both pc-${uid}-area; }
        .pc-${uid}-pulse { animation: 2.4s ease-out infinite pc-${uid}-pulse; }
        @media (prefers-reduced-motion: reduce) {
          .pc-${uid}-line { animation: none; stroke-dashoffset: 0; }
          .pc-${uid}-area { animation: none; opacity: .55; }
          .pc-${uid}-pulse { animation: none; opacity: 0; }
        }
      `}</style>

      <svg viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden className="w-full">
        <defs>
          <linearGradient id={`pc-${uid}-grad`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-cyan)" stopOpacity="0.28" />
            <stop offset="60%" stopColor="var(--brand-cyan)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="var(--brand-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <text x="12" y="38" className="fill-[var(--muted-foreground)] text-[13px] font-mono">
          {axisTitle}
        </text>

        {model.gridY.map((y, i) => (
          <g key={i}>
            <line x1={PLOT.x0} x2={PLOT.x1} y1={y} y2={y} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />
            <text
              x={52}
              y={y + 4}
              textAnchor="end"
              className="fill-[var(--muted-foreground)] text-[12px] font-mono tabular-nums"
            >
              {model.gridLabel(y).toFixed(model.gridLabel(y) >= 100 ? 0 : 2)}
            </text>
          </g>
        ))}

        {/* Real levels, drawn dashed so they read as structure rather than as the series. */}
        {model.levelsOnPlot.map((l, i) => (
          <g key={i}>
            <line
              x1={PLOT.x0}
              x2={PLOT.x1}
              y1={l.y}
              y2={l.y}
              stroke={TONE[l.tone ?? 'structural']}
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.7}
            />
            <text
              x={PLOT.x1}
              y={l.y - 6}
              textAnchor="end"
              className="text-[11px] font-mono"
              fill={TONE[l.tone ?? 'structural']}
            >
              {l.label}
            </text>
          </g>
        ))}

        <path d={model.area} fill={`url(#pc-${uid}-grad)`} className={`pc-${uid}-area`} />
        <path
          d={model.line}
          fill="none"
          stroke="var(--brand-cyan)"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`pc-${uid}-line`}
          style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--brand-cyan) 45%, transparent))' }}
        />

        {/* Endpoint: a solid dot with an expanding ring — their `r` 6→16 pulse. */}
        <circle cx={model.lastX} cy={model.lastY} r={4} fill="var(--brand-cyan)" />
        {!reduce && (
          <circle
            cx={model.lastX}
            cy={model.lastY}
            r={6}
            fill="none"
            stroke="var(--brand-cyan)"
            strokeWidth={1.5}
            className={`pc-${uid}-pulse`}
          />
        )}
      </svg>
    </div>
  );
}
