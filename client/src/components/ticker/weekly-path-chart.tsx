/**
 * WeeklyPathChart — Skylit-inspired probability-weighted weekly path visualization.
 *
 * Layout (dark bg, full width):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  PROBABILITY-WEIGHTED WEEKLY PATH          MON → FRI       │
 *   │                                                             │
 *   │  ─── VOMMA CEIL ──────────────────────── $593.50 ───────── │
 *   │  ─── CALL WALL ─────────────────────────  $590.00 ───────  │
 *   │         ╭─────╮                                             │
 *   │        ╱       ╲     ┌╌╌╌╌╌╌╌╌┐  ← entry zone (dashed)    │
 *   │  ─── SPOT ──╳───╲──╱─ $585.20 ─── projection curve (cyan) │
 *   │              ╲  ╱ ╲╱                                        │
 *   │               ╰╯                                            │
 *   │  ─── PUT WALL ──────────────────────── $575.00 ──────────  │
 *   │  ─── VACUUM TRIGGER ────────────────── $572.13 ──────────  │
 *   │                                                             │
 *   │ ┌──PHASE 1: FLUSH──┐┌──────PHASE 2: SQUEEZE──────────────┐│
 *   │ │ NEG VANNA · VOL↑  ││ POS VANNA · VOL SELL               ││
 *   │ └───────────────────┘└─────────────────────────────────────┘│
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Uses SVG for full control over the path curve, level lines, entry zones,
 * and phase bar. Lightweight-charts is great for candles but SVG gives us
 * the custom overlay density this visualization needs.
 */

import { useEffect, useRef, useState } from 'react';
import { cn, safeToFixed } from '@/lib/utils';
import type { WeeklyPathProjection, WeeklyPathLevel, WeeklyPhase, WeeklyEntryZone } from '../../../../shared/gex-types';

interface WeeklyPathChartProps {
  projection: WeeklyPathProjection;
  height?: number;
}

// ─── Color palette (Skylit-inspired) ──────────────────────────
const COLORS = {
  bg: '#0a0e17',
  gridLine: 'rgba(100, 116, 139, 0.08)',
  gridLineStrong: 'rgba(100, 116, 139, 0.15)',
  projectionCurve: '#22d3ee',        // cyan-400
  projectionFill: 'rgba(34, 211, 238, 0.08)',
  confidenceBand: 'rgba(34, 211, 238, 0.12)',
  spotLine: '#f8fafc',               // white
  bullLevel: '#22c55e',              // green-500
  bearLevel: '#ef4444',              // red-500
  neutralLevel: '#fbbf24',           // amber-400
  pivotLevel: '#a78bfa',             // violet-400
  entryCallBox: 'rgba(34, 197, 94, 0.15)',
  entryCallBorder: 'rgba(34, 197, 94, 0.5)',
  entryPutBox: 'rgba(239, 68, 68, 0.15)',
  entryPutBorder: 'rgba(239, 68, 68, 0.5)',
  phaseFlush: '#ef4444',
  phaseSqueeze: '#22c55e',
  phaseDrift: '#fbbf24',
  phaseBreakout: '#a78bfa',
  text: '#94a3b8',                   // slate-400
  textBright: '#e2e8f0',             // slate-200
};

function levelColor(level: WeeklyPathLevel): string {
  if (level.type === 'pivot') return COLORS.pivotLevel;
  if (level.side === 'bull') return COLORS.bullLevel;
  if (level.side === 'bear') return COLORS.bearLevel;
  return COLORS.neutralLevel;
}

function phaseColor(type: WeeklyPhase['type']): string {
  switch (type) {
    case 'flush': return COLORS.phaseFlush;
    case 'squeeze': return COLORS.phaseSqueeze;
    case 'drift': return COLORS.phaseDrift;
    case 'breakout': return COLORS.phaseBreakout;
  }
}

export function WeeklyPathChart({ projection, height = 420 }: WeeklyPathChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number; y: number; dayOffset: number; price: number; confidence: number } | null>(null);

  // Responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    obs.observe(containerRef.current);
    setWidth(containerRef.current.clientWidth);
    return () => obs.disconnect();
  }, []);

  const { path, levels, phases, entryZones, spotPrice } = projection;

  // ─── Layout constants ───────────────────────────────────────
  const margin = { top: 20, right: 90, bottom: 60, left: 16 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  // Price range: include all levels + path extremes
  const allPrices = [
    ...path.map(p => p.price),
    ...levels.map(l => l.price),
    spotPrice,
  ];
  const priceMin = Math.min(...allPrices) * 0.999;
  const priceMax = Math.max(...allPrices) * 1.001;
  const priceRange = priceMax - priceMin || 1;

  // Time range: 0 to 5 (Mon open → Fri close)
  const dayMin = 0;
  const dayMax = 5;

  const xScale = (day: number) => margin.left + ((day - dayMin) / (dayMax - dayMin)) * chartW;
  const yScale = (price: number) => margin.top + (1 - (price - priceMin) / priceRange) * chartH;

  // ─── Path curve ─────────────────────────────────────────────
  const pathPoints = path.map(p => ({ x: xScale(p.dayOffset), y: yScale(p.price), ...p }));
  const pathD = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  // Confidence band (upper/lower based on confidence width)
  const bandPoints = path.map(p => {
    const spread = (priceMax - priceMin) * (1 - p.confidence) * 0.3;
    return {
      x: xScale(p.dayOffset),
      yUp: yScale(p.price + spread),
      yDown: yScale(p.price - spread),
    };
  });
  const bandUpper = bandPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.yUp}`).join(' ');
  const bandLower = bandPoints.slice().reverse().map((p, i) => `${i === 0 ? 'L' : 'L'}${p.x},${p.yDown}`).join(' ');
  const bandD = bandUpper + ' ' + bandLower + ' Z';

  // Fill area under curve
  const fillD = pathD + ` L${pathPoints[pathPoints.length - 1].x},${yScale(priceMin)} L${pathPoints[0].x},${yScale(priceMin)} Z`;

  // ─── Day labels ─────────────────────────────────────────────
  const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

  // ─── Hover handler ──────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dayOffset = dayMin + ((mx - margin.left) / chartW) * (dayMax - dayMin);

    if (dayOffset < dayMin || dayOffset > dayMax || my < margin.top || my > margin.top + chartH) {
      setHover(null);
      return;
    }

    // Find nearest path point
    let closest = pathPoints[0];
    let closestDist = Math.abs(pathPoints[0].x - mx);
    for (const pp of pathPoints) {
      const d = Math.abs(pp.x - mx);
      if (d < closestDist) {
        closest = pp;
        closestDist = d;
      }
    }

    setHover({ x: closest.x, y: closest.y, dayOffset: closest.dayOffset, price: closest.price, confidence: closest.confidence });
  };

  return (
    <div ref={containerRef} className="w-full rounded-lg border border-border overflow-hidden" style={{ background: COLORS.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
            PROBABILITY-WEIGHTED WEEKLY PATH
          </span>
          <span className="text-[9px] font-mono text-slate-500">
            {projection.symbol}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-slate-500">
            {projection.weekStart} → {projection.weekEnd}
          </span>
          <span className={cn(
            'text-[9px] font-mono px-1.5 py-0.5 rounded',
            projection.confidence >= 0.6
              ? 'bg-green-500/10 text-green-400'
              : projection.confidence >= 0.4
                ? 'bg-amber-500/10 text-amber-400'
                : 'bg-red-500/10 text-red-400'
          )}>
            {Math.round(projection.confidence * 100)}% CONF
          </span>
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        width={width}
        height={height}
        className="cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid lines */}
        {Array.from({ length: 6 }, (_, i) => {
          const price = priceMin + (i / 5) * priceRange;
          const y = yScale(price);
          return (
            <line key={`hgrid-${i}`} x1={margin.left} y1={y} x2={width - margin.right} y2={y}
              stroke={COLORS.gridLine} strokeWidth={1} />
          );
        })}
        {dayLabels.map((_, i) => {
          const x = xScale(i + 0.5);
          return (
            <line key={`vgrid-${i}`} x1={x} y1={margin.top} x2={x} y2={margin.top + chartH}
              stroke={COLORS.gridLine} strokeWidth={1} />
          );
        })}

        {/* Confidence band */}
        <path d={bandD} fill={COLORS.confidenceBand} />

        {/* Area fill under curve */}
        <path d={fillD} fill={COLORS.projectionFill} />

        {/* Entry zones (dashed boxes) */}
        {entryZones.map((zone, i) => {
          const x1 = xScale(zone.dayStart);
          const x2 = xScale(zone.dayEnd);
          const y1 = yScale(zone.priceMax);
          const y2 = yScale(zone.priceMin);
          const isCall = zone.type === 'long_call';
          return (
            <g key={`zone-${i}`}>
              <rect
                x={x1} y={y1}
                width={x2 - x1} height={y2 - y1}
                fill={isCall ? COLORS.entryCallBox : COLORS.entryPutBox}
                stroke={isCall ? COLORS.entryCallBorder : COLORS.entryPutBorder}
                strokeWidth={1}
                strokeDasharray="4 3"
                rx={3}
              />
              <text
                x={x1 + 4} y={y1 + 12}
                fill={isCall ? COLORS.bullLevel : COLORS.bearLevel}
                fontSize={8} fontFamily="monospace" fontWeight="bold"
              >
                {zone.label}
              </text>
            </g>
          );
        })}

        {/* Structural levels */}
        {levels.map((level, i) => {
          const y = yScale(level.price);
          if (y < margin.top || y > margin.top + chartH) return null;
          const color = levelColor(level);
          return (
            <g key={`level-${i}`}>
              <line
                x1={margin.left} y1={y} x2={width - margin.right} y2={y}
                stroke={color} strokeWidth={1} strokeDasharray="6 4" opacity={0.5}
              />
              <text
                x={width - margin.right + 6} y={y + 3}
                fill={color} fontSize={8} fontFamily="monospace" fontWeight="bold"
              >
                {level.label}
              </text>
              <text
                x={width - margin.right + 6} y={y + 13}
                fill={COLORS.text} fontSize={8} fontFamily="monospace"
              >
                ${safeToFixed(level.price, 2)}
              </text>
            </g>
          );
        })}

        {/* Spot price line */}
        <line
          x1={margin.left} y1={yScale(spotPrice)} x2={width - margin.right} y2={yScale(spotPrice)}
          stroke={COLORS.spotLine} strokeWidth={1.5} opacity={0.4}
        />
        <circle cx={margin.left + 2} cy={yScale(spotPrice)} r={3} fill={COLORS.spotLine} />

        {/* Projection curve */}
        <path
          d={pathD}
          fill="none"
          stroke={COLORS.projectionCurve}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Start and end dots */}
        <circle cx={pathPoints[0].x} cy={pathPoints[0].y} r={4} fill={COLORS.projectionCurve} stroke={COLORS.bg} strokeWidth={2} />
        <circle cx={pathPoints[pathPoints.length - 1].x} cy={pathPoints[pathPoints.length - 1].y} r={4} fill={COLORS.projectionCurve} stroke={COLORS.bg} strokeWidth={2} />

        {/* Day labels */}
        {dayLabels.map((label, i) => (
          <text
            key={`day-${i}`}
            x={xScale(i + 0.5)}
            y={margin.top + chartH + 16}
            fill={COLORS.text}
            fontSize={9}
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}

        {/* Hover crosshair */}
        {hover && (
          <g>
            <line x1={hover.x} y1={margin.top} x2={hover.x} y2={margin.top + chartH}
              stroke={COLORS.projectionCurve} strokeWidth={1} opacity={0.4} strokeDasharray="2 2" />
            <line x1={margin.left} y1={hover.y} x2={width - margin.right} y2={hover.y}
              stroke={COLORS.projectionCurve} strokeWidth={1} opacity={0.4} strokeDasharray="2 2" />
            <circle cx={hover.x} cy={hover.y} r={5} fill={COLORS.projectionCurve} stroke={COLORS.bg} strokeWidth={2} />
          </g>
        )}
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded bg-slate-800/95 border border-slate-700 text-[10px] font-mono"
          style={{
            left: Math.min(hover.x + 12, width - 160),
            top: margin.top + hover.y - 20,
          }}
        >
          <div className="text-cyan-400 font-bold">${safeToFixed(hover.price, 2)}</div>
          <div className="text-slate-400">
            Day {safeToFixed(hover.dayOffset, 1)} · {Math.round(hover.confidence * 100)}% conf
          </div>
        </div>
      )}

      {/* Phase bar */}
      <div className="flex mx-4 mb-3 mt-1 gap-1">
        {phases.map((phase, i) => {
          const widthPct = ((phase.endDay - phase.startDay) / dayMax) * 100;
          const color = phaseColor(phase.type);
          return (
            <div
              key={i}
              className="rounded px-2 py-1.5 overflow-hidden"
              style={{
                width: `${widthPct}%`,
                background: `${color}10`,
                borderLeft: `2px solid ${color}`,
              }}
            >
              <div className="text-[8px] font-mono font-bold uppercase tracking-wider truncate" style={{ color }}>
                {phase.label}
              </div>
              <div className="text-[7px] font-mono text-slate-500 uppercase tracking-wider truncate">
                {phase.description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
