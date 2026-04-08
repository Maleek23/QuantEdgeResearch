/**
 * GEX+VEX Projection Chart — Bloomberg-Grade
 * =============================================
 * True OHLC candlesticks via custom SVG, interactive level lines with
 * proximity-based opacity, multi-segment projection curve with inflection
 * markers, crosshair cursor, trade setup annotations, and zoom/brush.
 *
 * Built on Recharts ComposedChart with custom rendering.
 */

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis,
  ReferenceLine, Tooltip, CartesianGrid, Brush, ReferenceArea,
  Customized,
} from 'recharts';
import { safeNumber, safeToFixed } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface GEXLevel {
  price: number;
  type: 'CALL_WALL' | 'PUT_WALL' | 'GEX_ANCHOR' | 'GEX_FLIP' | 'VEX_ANCHOR' | 'VEX_FLIP' | 'UPSIDE_TARGET' | 'DOWNSIDE_TARGET';
  label: string;
  strength?: number;
  gammaConcentration?: number;
}

export interface ProjectionRange {
  magnetPrice: number;
  upperBound: number;
  lowerBound: number;
  confidence: number;
  behavior: 'MEAN_REVERT' | 'MOMENTUM' | 'RANGE_BOUND';
}

export interface TradeSetup {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  entry: number;
  target: number;
  stop: number;
  riskReward: string;
  grade: string;
}

export interface GEXVEXChartProps {
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
  horizonTargets?: { today: number; week: number; month: number } | null;
  tradeSetups?: TradeSetup[];
  zoomRange?: { yMin: number; yMax: number } | null;
  onZoomReset?: () => void;
  onPriceHover?: (price: number | null) => void;
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const LEVEL_CONFIG: Record<GEXLevel['type'], { color: string; dash: string; width: number; baseOpacity: number }> = {
  CALL_WALL:       { color: '#ef4444', dash: '6 3',  width: 1,   baseOpacity: 0.5 },
  PUT_WALL:        { color: '#22c55e', dash: '6 3',  width: 1,   baseOpacity: 0.5 },
  GEX_ANCHOR:      { color: '#06b6d4', dash: '',     width: 2,   baseOpacity: 0.7 },
  GEX_FLIP:        { color: '#f59e0b', dash: '8 4',  width: 1.5, baseOpacity: 0.6 },
  VEX_ANCHOR:      { color: '#a855f7', dash: '3 3',  width: 1,   baseOpacity: 0.4 },
  VEX_FLIP:        { color: '#8b5cf6', dash: '3 3',  width: 1,   baseOpacity: 0.4 },
  UPSIDE_TARGET:   { color: '#22d3ee', dash: '',     width: 2.5, baseOpacity: 0.8 },
  DOWNSIDE_TARGET: { color: '#f87171', dash: '',     width: 2.5, baseOpacity: 0.8 },
};

const BULL = '#22c55e';
const BEAR = '#ef4444';

function formatDate(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ═══════════════════════════════════════════════════════════
// CANDLESTICK RENDERER — draws directly on the SVG canvas
// ═══════════════════════════════════════════════════════════

function CandlestickRenderer({ formattedGraphicalItems, xAxisMap, yAxisMap }: any) {
  const xAxis = xAxisMap && Object.values(xAxisMap)[0] as any;
  const yAxis = yAxisMap && Object.values(yAxisMap)[0] as any;
  if (!xAxis?.scale || !yAxis?.scale) return null;

  const xScale = xAxis.scale;
  const yScale = yAxis.scale;
  const items = formattedGraphicalItems?.[0]?.props?.data;
  if (!items?.length) return null;

  // Calculate candle width from data spacing
  const bandWidth = items.length > 1
    ? Math.abs(xScale(items[1].time) - xScale(items[0].time)) * 0.6
    : 8;
  const candleW = Math.max(Math.min(bandWidth, 12), 2);

  return (
    <g className="candlesticks">
      {items.map((d: any, i: number) => {
        if (d.open == null || d.close == null || d.projected) return null;

        const x = xScale(d.time);
        const oY = yScale(d.open);
        const cY = yScale(d.close);
        const hY = yScale(d.high || Math.max(d.open, d.close));
        const lY = yScale(d.low || Math.min(d.open, d.close));

        if (isNaN(x) || isNaN(oY) || isNaN(cY)) return null;

        const isBull = d.close >= d.open;
        const color = isBull ? BULL : BEAR;
        const bodyTop = Math.min(oY, cY);
        const bodyH = Math.max(Math.abs(oY - cY), 1);

        return (
          <g key={i}>
            {/* Wick */}
            <line x1={x} y1={hY} x2={x} y2={lY} stroke={color} strokeWidth={1} strokeOpacity={0.6} />
            {/* Body */}
            <rect
              x={x - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={bodyH}
              fill={isBull ? 'transparent' : color}
              stroke={color}
              strokeWidth={1}
              rx={0.5}
            />
          </g>
        );
      })}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════
// TOOLTIP
// ═══════════════════════════════════════════════════════════

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isProjected = d.projected;
  const price = isProjected ? d.projection : d.close;

  return (
    <div className="bg-card/95 backdrop-blur-sm border border-border rounded-md px-3 py-2 shadow-xl pointer-events-none">
      <div className="text-[9px] text-muted-foreground font-mono mb-0.5">{formatDate(d.time)}</div>
      {isProjected ? (
        <div className="text-sm font-bold font-mono tabular-nums text-purple-400">
          ${safeToFixed(price, 2)}
          <span className="text-[8px] ml-1 opacity-60">{d.horizonLabel || 'projected'}</span>
        </div>
      ) : (
        <>
          <div className={`text-sm font-bold font-mono tabular-nums ${d.close >= d.open ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
            ${safeToFixed(d.close, 2)}
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-[8px] font-mono tabular-nums text-muted-foreground mt-0.5">
            <span>O:{safeToFixed(d.open, 2)}</span>
            <span className="text-[var(--trade-bullish)]">H:{safeToFixed(d.high, 2)}</span>
            <span className="text-[var(--trade-bearish)]">L:{safeToFixed(d.low, 2)}</span>
            {d.volume != null && d.volume > 0 && <span>V:{(d.volume / 1e6).toFixed(1)}M</span>}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export function GEXVEXChart({
  symbol, data, levels, spotPrice, height = 520,
  regime, projectionTarget, projectionDirection, projectionRange, expectedMove,
  horizonTargets, tradeSetups, zoomRange, onZoomReset, onPriceHover,
}: GEXVEXChartProps) {

  const [hoveredLevel, setHoveredLevel] = useState<number | null>(null);
  const [pinnedLevel, setPinnedLevel] = useState<number | null>(null);

  // ── Build chart data ──
  const { chartData, yMin, yMax } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], yMin: 0, yMax: 0 };
    const valid = data.filter(d => d && d.close != null && d.time != null);
    if (valid.length === 0) return { chartData: [], yMin: 0, yMax: 0 };

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

    const points: any[] = valid.map(d => ({
      time: d.time,
      close: safeNumber(d.close, 0),
      open: safeNumber(d.open, 0),
      high: safeNumber(d.high, 0),
      low: safeNumber(d.low, 0),
      volume: d.volume || 0,
      projection: null,
      projected: false,
    }));

    // ── Projection curve ──
    if ((projectionTarget || horizonTargets) && valid.length > 0) {
      const lastClose = safeNumber(valid[valid.length - 1].close, spotPrice);
      const lastTime = valid[valid.length - 1].time;
      const daySeconds = 86400;
      points[points.length - 1].projection = lastClose;

      const ease = (p: number) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;

      if (horizonTargets) {
        const segments = [
          { steps: 2, target: horizonTargets.today, label: 'TODAY', color: '#22d3ee' },
          { steps: 3, target: horizonTargets.week, label: 'WEEK', color: '#f59e0b' },
          { steps: 4, target: horizonTargets.month, label: 'MONTH', color: '#f87171' },
        ];
        let currentPrice = lastClose;
        let stepIndex = 0;
        for (const seg of segments) {
          for (let i = 1; i <= seg.steps; i++) {
            stepIndex++;
            const price = currentPrice + (seg.target - currentPrice) * ease(i / seg.steps);
            const isInflection = i === seg.steps;
            points.push({
              time: lastTime + stepIndex * daySeconds,
              close: null, open: null, high: null, low: null, volume: null,
              projection: safeNumber(price, currentPrice),
              projected: true,
              horizonLabel: isInflection ? `${seg.label} $${seg.target.toFixed(0)}` : seg.label,
              inflection: isInflection,
              segColor: seg.color,
            });
          }
          currentPrice = seg.target;
        }
      } else if (projectionTarget) {
        for (let i = 1; i <= 7; i++) {
          const price = lastClose + (projectionTarget - lastClose) * ease(i / 7);
          points.push({
            time: lastTime + i * daySeconds,
            close: null, open: null, high: null, low: null, volume: null,
            projection: safeNumber(price, lastClose),
            projected: true,
          });
        }
      }
    }

    return { chartData: points, yMin: lo, yMax: hi };
  }, [data, levels, spotPrice, projectionTarget, horizonTargets, expectedMove]);

  // ── Deduplicate levels ──
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

  const projColor = projectionDirection === 'BULLISH' ? '#22d3ee'
    : projectionDirection === 'BEARISH' ? '#f87171' : '#a78bfa';

  const firstClose = chartData.find(d => d.close != null)?.close || 0;
  const lastClose = [...chartData].reverse().find(d => d.close != null)?.close || 0;

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground/50 font-mono text-sm" style={{ height }}>
        Loading chart data...
      </div>
    );
  }

  return (
    <div className="relative w-full select-none">
      {/* Regime badge */}
      {regime && (
        <div className={`absolute top-2 right-2 z-20 px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
          regime === 'POSITIVE' ? 'bg-emerald-500/10 text-[var(--trade-bullish)] border-emerald-500/20' :
          regime === 'NEGATIVE' ? 'bg-red-500/10 text-[var(--trade-bearish)] border-red-500/20' :
          'bg-muted/30 text-muted-foreground border-border'
        }`}>
          {regime} γ
        </div>
      )}

      {/* Current price badge */}
      <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded bg-card/90 border border-border text-xs font-mono font-bold tabular-nums text-foreground">
        ${safeToFixed(spotPrice, 2)}
        <span className={`ml-1 text-[9px] ${lastClose >= firstClose ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
          {lastClose >= firstClose ? '▲' : '▼'}{safeToFixed(Math.abs(((lastClose - firstClose) / firstClose) * 100), 2)}%
        </span>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 130, bottom: 8, left: 8 }}
          onMouseMove={(e: any) => {
            if (onPriceHover && e?.activePayload?.[0]) {
              const val = e.activePayload[0].payload?.close || e.activePayload[0].payload?.projection;
              onPriceHover(val || null);
            }
          }}
          onMouseLeave={() => onPriceHover?.(null)}
        >
          <defs>
            <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={projColor} stopOpacity={0.12} />
              <stop offset="100%" stopColor={projColor} stopOpacity={0} />
            </linearGradient>
            <filter id="projGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.05)" vertical={false} />

          <XAxis
            dataKey="time"
            tickFormatter={formatDate}
            stroke="#475569"
            tick={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: '#64748b' }}
            axisLine={{ stroke: 'rgba(100,116,139,0.1)' }}
            tickLine={false}
            minTickGap={50}
          />

          <YAxis
            yAxisId="price"
            domain={zoomRange ? [Math.floor(zoomRange.yMin), Math.ceil(zoomRange.yMax)] : [yMin, yMax]}
            stroke="#475569"
            tick={{ fontSize: 9, fontFamily: "'JetBrains Mono', monospace", fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${Math.round(v)}`}
            width={50}
            allowDataOverflow={!!zoomRange}
          />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'rgba(100,116,139,0.15)', strokeWidth: 1, strokeDasharray: '3 3' }}
          />

          <Brush
            dataKey="time"
            height={18}
            stroke="rgba(100,116,139,0.2)"
            fill="rgba(15,23,42,0.6)"
            tickFormatter={formatDate}
            travellerWidth={6}
          />

          {/* Expected Move envelope */}
          {expectedMove?.impliedDailyRange && (
            <ReferenceArea
              yAxisId="price"
              y1={expectedMove.impliedDailyRange.low}
              y2={expectedMove.impliedDailyRange.high}
              fill="#f59e0b" fillOpacity={0.03}
              stroke="#f59e0b" strokeOpacity={0.1} strokeDasharray="6 4"
            />
          )}

          {/* Projection range band */}
          {projectionRange && (
            <ReferenceArea
              yAxisId="price"
              y1={projectionRange.lowerBound}
              y2={projectionRange.upperBound}
              fill={projColor} fillOpacity={0.04}
              stroke={projColor} strokeOpacity={0.12} strokeDasharray="4 4"
            />
          )}

          {/* GEX/VEX level lines */}
          {dedupedLevels.map((lvl, i) => {
            const cfg = LEVEL_CONFIG[lvl.type] || { color: '#64748b', dash: '4 4', width: 1, baseOpacity: 0.4 };
            const isHi = hoveredLevel === i || pinnedLevel === i;
            const distPct = ((lvl.price - spotPrice) / spotPrice * 100).toFixed(1);
            const pctLabel = Number(distPct) > 0 ? `+${distPct}%` : `${distPct}%`;
            const gamma = lvl.gammaConcentration ? ` ${lvl.gammaConcentration}%γ` : '';
            const dist = Math.abs(lvl.price - spotPrice) / spotPrice;
            const proxOpacity = Math.max(0.2, 1 - dist * 8);

            return (
              <ReferenceLine
                key={i}
                yAxisId="price"
                y={lvl.price}
                stroke={cfg.color}
                strokeDasharray={cfg.dash}
                strokeWidth={isHi ? cfg.width + 1 : cfg.width}
                strokeOpacity={isHi ? 0.9 : cfg.baseOpacity * proxOpacity}
                label={{
                  value: `$${lvl.price.toFixed(0)} ${pctLabel}${gamma}`,
                  position: 'right',
                  fill: cfg.color,
                  fontSize: isHi ? 9 : 8,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: isHi ? 700 : 500,
                }}
              />
            );
          })}

          {/* Spot price line */}
          <ReferenceLine yAxisId="price" y={spotPrice} stroke="#64748b" strokeDasharray="2 2" strokeWidth={0.5} strokeOpacity={0.3} />

          {/* Trade setup annotations */}
          {tradeSetups?.map((setup, i) => (
            <g key={`s${i}`}>
              <ReferenceLine yAxisId="price" y={setup.entry} stroke={BULL} strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.5} />
              <ReferenceLine yAxisId="price" y={setup.target} stroke={BULL} strokeWidth={1} strokeDasharray="8 4" strokeOpacity={0.3} />
              <ReferenceLine yAxisId="price" y={setup.stop} stroke={BEAR} strokeWidth={1} strokeDasharray="8 4" strokeOpacity={0.3} />
            </g>
          ))}

          {/* Invisible area to define the Y domain — data anchor */}
          <Area yAxisId="price" type="monotone" dataKey="close" stroke="transparent" fill="transparent" dot={false} />

          {/* Candlestick rendering via Customized */}
          <Customized component={CandlestickRenderer} />

          {/* Projection curve */}
          <Area
            yAxisId="price"
            type="monotone"
            dataKey="projection"
            stroke={projColor}
            strokeWidth={2.5}
            strokeDasharray="8 4"
            fill="url(#projGrad)"
            dot={(props: any) => {
              const { cx, cy, payload } = props;
              if (!payload?.inflection) return <g key={props.key} />;
              return (
                <g key={props.key}>
                  <circle cx={cx} cy={cy} r={4} fill={payload.segColor || projColor} stroke="#0f172a" strokeWidth={2} />
                  <text x={cx} y={cy - 10} textAnchor="middle" fontSize={8} fontFamily="monospace" fontWeight={700} fill={payload.segColor || projColor}>
                    {payload.horizonLabel}
                  </text>
                </g>
              );
            }}
            activeDot={{ r: 4, fill: projColor, stroke: '#0f172a', strokeWidth: 2 }}
            connectNulls={false}
            filter="url(#projGlow)"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Level legend */}
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1 px-2">
        {dedupedLevels.slice(0, 8).map((lvl, i) => (
          <button
            key={i}
            className={`flex items-center gap-1 text-[8px] font-mono cursor-pointer transition-all rounded px-1 py-0.5 ${
              pinnedLevel === i ? 'bg-muted/50 ring-1 ring-border' : 'hover:bg-muted/30'
            }`}
            onClick={() => setPinnedLevel(pinnedLevel === i ? null : i)}
            onMouseEnter={() => setHoveredLevel(i)}
            onMouseLeave={() => setHoveredLevel(null)}
          >
            <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: LEVEL_CONFIG[lvl.type]?.color }} />
            <span className="text-muted-foreground font-semibold tabular-nums">${lvl.price.toFixed(0)}</span>
            <span className="text-muted-foreground/40">{lvl.label.split(' ')[0]}</span>
          </button>
        ))}
        {projectionTarget && (
          <div className="flex items-center gap-1 text-[8px] font-mono">
            <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: projColor }} />
            <span className="font-semibold tabular-nums" style={{ color: projColor }}>${projectionTarget.toFixed(0)}</span>
            <span className="text-muted-foreground/40">magnet</span>
          </div>
        )}
      </div>
    </div>
  );
}
