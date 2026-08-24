/**
 * GEX+VEX Projection Chart (Recharts)
 * ======================================
 * Line chart with gradient fill, GEX/VEX levels as horizontal reference lines,
 * and a smooth projection curve toward the target price.
 * Full visual control — gradients, glows, custom labels.
 */

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis,
  ReferenceLine, Tooltip, CartesianGrid, Brush, ReferenceArea,
} from 'recharts';
import { safeNumber, safeToFixed } from '@/lib/utils';

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface GEXLevel {
  price: number;
  type: 'CALL_WALL' | 'PUT_WALL' | 'GEX_ANCHOR' | 'GEX_FLIP' | 'VEX_ANCHOR' | 'VEX_FLIP' | 'UPSIDE_TARGET' | 'DOWNSIDE_TARGET';
  label: string;
  strength?: number;
}

interface ProjectionRange {
  magnetPrice: number;
  upperBound: number;
  lowerBound: number;
  confidence: number;
  behavior: 'MEAN_REVERT' | 'MOMENTUM' | 'RANGE_BOUND';
}

interface GEXVEXChartProps {
  symbol: string;
  data: CandleData[];
  levels: GEXLevel[];
  spotPrice: number;
  height?: number;
  regime?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  projectionTarget?: number | null;
  projectionDirection?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  projectionRange?: ProjectionRange | null;
  expectedMove?: { daily: number; impliedDailyRange: { low: number; high: number } } | null;
  /** Multi-horizon targets: projection curves through today→week→month */
  horizonTargets?: { today: number; week: number; month: number } | null;
  zoomRange?: { yMin: number; yMax: number } | null;
  onZoomReset?: () => void;
  /** Callback when user hovers on chart — sends the price at cursor Y position */
  onPriceHover?: (price: number | null) => void;
}

const LEVEL_COLORS: Record<GEXLevel['type'], string> = {
  CALL_WALL: '#ef4444',
  PUT_WALL: '#22c55e',
  GEX_ANCHOR: '#06b6d4',
  GEX_FLIP: '#f59e0b',
  VEX_ANCHOR: '#a855f7',
  VEX_FLIP: '#8b5cf6',
  UPSIDE_TARGET: '#22d3ee',
  DOWNSIDE_TARGET: '#f87171',
};

const LEVEL_DASH: Record<GEXLevel['type'], string> = {
  CALL_WALL: '6 3',
  PUT_WALL: '6 3',
  GEX_ANCHOR: '',
  GEX_FLIP: '8 4',
  VEX_ANCHOR: '3 3',
  VEX_FLIP: '3 3',
  UPSIDE_TARGET: '',
  DOWNSIDE_TARGET: '',
};

const LEVEL_WIDTH: Record<GEXLevel['type'], number> = {
  CALL_WALL: 1,
  PUT_WALL: 1,
  GEX_ANCHOR: 2,
  GEX_FLIP: 1.5,
  VEX_ANCHOR: 1,
  VEX_FLIP: 1,
  UPSIDE_TARGET: 2,
  DOWNSIDE_TARGET: 2,
};

function formatDate(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Custom level label rendered on the right edge
function LevelLabel({ viewBox, label, color, pct }: any) {
  if (!viewBox) return null;
  const { y } = viewBox;
  return (
    <g>
      <rect x="calc(100% - 130)" y={y - 10} width={128} height={20} rx={4} fill={color} fillOpacity={0.15} />
      <text x="calc(100% - 124)" y={y + 3} fontSize={9} fontFamily="monospace" fontWeight={600} fill={color}>
        {label} ({pct})
      </text>
    </g>
  );
}

// Custom tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const price = d.close ?? d.projection ?? 0;
  const isProjected = d.projected || (d.close == null && d.projection != null);
  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] text-muted-foreground font-mono">{formatDate(d.time)}</div>
      <div className={`text-sm font-bold font-mono ${isProjected ? 'text-purple-400' : 'text-foreground'}`}>
        ${safeToFixed(price, 2)}
        {isProjected && <span className="text-[9px] ml-1 opacity-70">projected</span>}
      </div>
      {!isProjected && d.open != null && (
        <div className="flex gap-2 text-[9px] font-mono text-muted-foreground mt-0.5">
          <span>O: {safeToFixed(d.open, 2)}</span>
          <span className="text-emerald-400">H: {safeToFixed(d.high, 2)}</span>
          <span className="text-red-400">L: {safeToFixed(d.low, 2)}</span>
        </div>
      )}
    </div>
  );
}

export function GEXVEXChart({
  symbol, data, levels, spotPrice, height = 480,
  regime, projectionTarget, projectionDirection, projectionRange, expectedMove,
  horizonTargets, zoomRange, onZoomReset, onPriceHover,
}: GEXVEXChartProps) {

  // Build chart data: price line + projection extension
  const { chartData, yMin, yMax } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], yMin: 0, yMax: 0 };

    const valid = data.filter(d => d && d.close != null && d.time != null);
    if (valid.length === 0) return { chartData: [], yMin: 0, yMax: 0 };

    // Collect all prices to compute Y domain
    const allPrices = valid.flatMap(d => [d.high || d.close, d.low || d.close]);
    levels.forEach(l => allPrices.push(l.price));
    if (projectionTarget) allPrices.push(projectionTarget);
    if (horizonTargets) allPrices.push(horizonTargets.today, horizonTargets.week, horizonTargets.month);
    if (expectedMove?.impliedDailyRange) {
      allPrices.push(expectedMove.impliedDailyRange.low, expectedMove.impliedDailyRange.high);
    }

    let lo = Math.min(...allPrices);
    let hi = Math.max(...allPrices);
    const pad = (hi - lo) * 0.06;
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);

    // Base price data
    const points: any[] = valid.map(d => ({
      time: d.time,
      close: safeNumber(d.close, 0),
      open: safeNumber(d.open, 0),
      high: safeNumber(d.high, 0),
      low: safeNumber(d.low, 0),
      projection: null,
      projected: false,
    }));

    // Projection curve: multi-horizon (today→week→month) or single target
    if ((projectionTarget || horizonTargets) && valid.length > 0) {
      const lastClose = safeNumber(valid[valid.length - 1].close, spotPrice);
      const lastTime = valid[valid.length - 1].time;
      const daySeconds = 86400;

      // Bridge point — connect price line to projection
      points[points.length - 1].projection = lastClose;

      if (horizonTargets) {
        // Multi-horizon: 2 steps to today target, 3 steps to week target, 4 steps to month target
        const segments = [
          { steps: 2, target: horizonTargets.today },   // Today (1-2 days)
          { steps: 3, target: horizonTargets.week },     // This week (3-5 days)
          { steps: 4, target: horizonTargets.month },    // This month (6-9 days)
        ];
        let currentPrice = lastClose;
        let stepIndex = 0;
        for (const seg of segments) {
          for (let i = 1; i <= seg.steps; i++) {
            stepIndex++;
            const progress = i / seg.steps;
            const eased = progress < 0.5
              ? 2 * progress * progress
              : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            const price = currentPrice + (seg.target - currentPrice) * eased;
            points.push({
              time: lastTime + stepIndex * daySeconds,
              close: null, open: null, high: null, low: null,
              projection: safeNumber(price, currentPrice),
              projected: true,
            });
          }
          currentPrice = seg.target;
        }
      } else if (projectionTarget) {
        // Single target fallback (7 steps)
        for (let i = 1; i <= 7; i++) {
          const progress = i / 7;
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          const price = lastClose + (projectionTarget - lastClose) * eased;
          points.push({
            time: lastTime + i * daySeconds,
            close: null, open: null, high: null, low: null,
            projection: safeNumber(price, lastClose),
            projected: true,
          });
        }
      }
    }

    return { chartData: points, yMin: lo, yMax: hi };
  }, [data, levels, spotPrice, projectionTarget, horizonTargets]);

  // Deduplicate levels that are too close together (within 0.3% of each other)
  const dedupedLevels = useMemo(() => {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => b.price - a.price);
    const result: GEXLevel[] = [];
    for (const lvl of sorted) {
      const tooClose = result.some(r => Math.abs(r.price - lvl.price) / spotPrice < 0.003);
      if (!tooClose) result.push(lvl);
    }
    return result;
  }, [levels, spotPrice]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground/60 font-mono text-sm" style={{ height }}>
        No chart data
      </div>
    );
  }

  const projColor = projectionDirection === 'BULLISH' ? '#22d3ee'
    : projectionDirection === 'BEARISH' ? '#f87171' : '#a78bfa';

  // Determine gradient based on price trend
  const firstClose = chartData.find(d => d.close != null)?.close || 0;
  const lastClose = [...chartData].reverse().find(d => d.close != null)?.close || 0;
  const isBullish = lastClose >= firstClose;
  const trendColor = isBullish ? '#22c55e' : '#ef4444';

  return (
    <div className="relative w-full">
      {/* Regime badge */}
      {regime && (
        <div className={`absolute top-2 right-2 z-10 px-2.5 py-1 rounded-md text-[9px] font-mono font-bold border ${
          regime === 'POSITIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
          regime === 'NEGATIVE' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
          'bg-muted/30 text-muted-foreground border-border'
        }`}>
          {regime} GAMMA
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 16, right: 140, bottom: 8, left: 8 }}
          onMouseMove={(e: any) => {
            if (onPriceHover && e?.activePayload?.[0]?.value != null) {
              onPriceHover(e.activePayload[0].value);
            }
          }}
          onMouseLeave={() => onPriceHover?.(null)}
        >
          <defs>
            {/* Price line gradient fill */}
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity={0.25} />
              <stop offset="60%" stopColor={trendColor} stopOpacity={0.06} />
              <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
            </linearGradient>
            {/* Projection gradient */}
            <linearGradient id="projGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={projColor} stopOpacity={0.2} />
              <stop offset="100%" stopColor={projColor} stopOpacity={0} />
            </linearGradient>
            {/* Glow filter for projection line */}
            <filter id="projGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Glow for price line */}
            <filter id="priceGlow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(100, 116, 139, 0.06)"
            vertical={false}
          />

          <XAxis
            dataKey="time"
            tickFormatter={formatDate}
            stroke="#475569"
            tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#64748b' }}
            axisLine={{ stroke: 'rgba(100, 116, 139, 0.15)' }}
            tickLine={false}
            minTickGap={40}
          />

          <YAxis
            domain={zoomRange ? [Math.floor(zoomRange.yMin), Math.ceil(zoomRange.yMax)] : [yMin, yMax]}
            stroke="#475569"
            tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${Math.round(v)}`}
            width={55}
            allowDataOverflow={!!zoomRange}
          />

          <Tooltip content={<ChartTooltip />} />

          {/* Brush for X-axis range selection */}
          <Brush
            dataKey="time"
            height={22}
            stroke="rgba(100, 116, 139, 0.3)"
            fill="rgba(15, 23, 42, 0.8)"
            tickFormatter={formatDate}
            travellerWidth={8}
          />

          {/* ── GEX/VEX level lines ── */}
          {dedupedLevels.map((lvl, i) => {
            const color = LEVEL_COLORS[lvl.type] || '#64748b';
            const dash = LEVEL_DASH[lvl.type] || '4 4';
            const width = LEVEL_WIDTH[lvl.type] || 1;
            const distPct = ((lvl.price - spotPrice) / spotPrice * 100).toFixed(1);
            const pctLabel = lvl.price > spotPrice ? `+${distPct}%` : `${distPct}%`;
            // Compact label: "$640 Put Wall (-2.9%)"
            const shortLabel = `$${lvl.price.toFixed(0)} ${lvl.label.replace(/Call Wall \$\d+/, 'CW').replace(/Put Wall \$\d+/, 'PW')} (${pctLabel})`;

            return (
              <ReferenceLine
                key={i}
                y={lvl.price}
                stroke={color}
                strokeDasharray={dash}
                strokeWidth={width}
                strokeOpacity={0.6}
                label={{
                  value: shortLabel,
                  position: 'right',
                  fill: color,
                  fontSize: 8,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}
              />
            );
          })}

          {/* Expected Move envelope — VIX-implied daily range */}
          {expectedMove && expectedMove.impliedDailyRange && (
            <ReferenceArea
              y1={expectedMove.impliedDailyRange.low}
              y2={expectedMove.impliedDailyRange.high}
              fill="#f59e0b"
              fillOpacity={0.04}
              stroke="#f59e0b"
              strokeOpacity={0.12}
              strokeDasharray="6 4"
            />
          )}

          {/* Projection range — shaded area between upper/lower bounds */}
          {projectionRange && (
            <ReferenceArea
              y1={projectionRange.lowerBound}
              y2={projectionRange.upperBound}
              fill={projColor}
              fillOpacity={0.06}
              stroke={projColor}
              strokeOpacity={0.15}
              strokeDasharray="4 4"
            />
          )}

          {/* Spot price reference */}
          <ReferenceLine
            y={spotPrice}
            stroke="#64748b"
            strokeDasharray="2 2"
            strokeWidth={0.5}
            strokeOpacity={0.4}
          />

          {/* ── Price area with gradient fill ── */}
          <Area
            type="monotone"
            dataKey="close"
            stroke={trendColor}
            strokeWidth={2}
            fill="url(#priceGradient)"
            dot={false}
            activeDot={{ r: 4, fill: trendColor, stroke: '#0f172a', strokeWidth: 2 }}
            connectNulls={false}
            filter="url(#priceGlow)"
          />

          {/* ── Projection curve with gradient + glow ── */}
          <Area
            type="monotone"
            dataKey="projection"
            stroke={projColor}
            strokeWidth={2.5}
            strokeDasharray="8 4"
            fill="url(#projGradient)"
            dot={false}
            activeDot={{ r: 4, fill: projColor, stroke: '#0f172a', strokeWidth: 2 }}
            connectNulls={false}
            filter="url(#projGlow)"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Level legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 px-2">
        {dedupedLevels.slice(0, 10).map((lvl, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[9px]">
            <div
              className="w-4 h-[2px] rounded-full"
              style={{
                backgroundColor: LEVEL_COLORS[lvl.type],
                opacity: 0.8,
              }}
            />
            <span className="text-muted-foreground font-mono font-medium">${lvl.price.toFixed(0)}</span>
            <span className="text-muted-foreground/60">{lvl.label}</span>
          </div>
        ))}
        {projectionTarget && (
          <div className="flex items-center gap-1.5 text-[9px]">
            <div className="w-4 h-[2px] rounded-full" style={{ backgroundColor: projColor }} />
            <span className="font-mono font-medium" style={{ color: projColor }}>
              ${projectionTarget.toFixed(0)} magnet
            </span>
          </div>
        )}
        {projectionRange && (
          <div className="flex items-center gap-1.5 text-[9px]">
            <div className="w-4 h-[3px] rounded-full opacity-30" style={{ backgroundColor: projColor }} />
            <span className="text-muted-foreground/60 font-mono">
              ${projectionRange.lowerBound.toFixed(0)}-${projectionRange.upperBound.toFixed(0)} range
            </span>
            <span className="text-muted-foreground/60">
              ({projectionRange.behavior.replace('_', '-').toLowerCase()})
            </span>
          </div>
        )}
        {expectedMove && expectedMove.impliedDailyRange && (
          <div className="flex items-center gap-1.5 text-[9px]">
            <div className="w-4 h-[3px] rounded-full opacity-30 bg-amber-400" />
            <span className="text-amber-400/70 font-mono">
              ${expectedMove.impliedDailyRange.low.toFixed(0)}-${expectedMove.impliedDailyRange.high.toFixed(0)} EM
            </span>
            <span className="text-muted-foreground/60">
              (±${expectedMove.daily.toFixed(1)} VIX-implied)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
