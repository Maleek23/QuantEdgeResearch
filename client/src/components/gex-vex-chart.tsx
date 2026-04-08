/**
 * GEX+VEX Projection Chart — TradingView Lightweight Charts
 * ===========================================================
 * Professional candlestick chart with GEX/VEX levels, projection curve,
 * and trade annotations. Uses TradingView's lightweight-charts for
 * native candlesticks, smooth zoom/pan, and 60fps rendering.
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  createChart, ColorType, LineStyle, CrosshairMode,
  CandlestickSeries, LineSeries, HistogramSeries,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, LineData, Time } from 'lightweight-charts';
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
  onPriceHover?: (price: number | null) => void;
}

// ═══════════════════════════════════════════════════════════
// LEVEL COLORS
// ═══════════════════════════════════════════════════════════

const LEVEL_COLORS: Record<GEXLevel['type'], { color: string; style: LineStyle; width: number }> = {
  CALL_WALL:       { color: '#ef4444', style: LineStyle.Dashed,  width: 1 },
  PUT_WALL:        { color: '#22c55e', style: LineStyle.Dashed,  width: 1 },
  GEX_ANCHOR:      { color: '#06b6d4', style: LineStyle.Solid,   width: 2 },
  GEX_FLIP:        { color: '#f59e0b', style: LineStyle.Dashed,  width: 1 },
  VEX_ANCHOR:      { color: '#a855f7', style: LineStyle.Dotted,  width: 1 },
  VEX_FLIP:        { color: '#8b5cf6', style: LineStyle.Dotted,  width: 1 },
  UPSIDE_TARGET:   { color: '#22d3ee', style: LineStyle.Solid,   width: 2 },
  DOWNSIDE_TARGET: { color: '#f87171', style: LineStyle.Solid,   width: 2 },
};

// ═══════════════════════════════════════════════════════════
// CHART COMPONENT
// ═══════════════════════════════════════════════════════════

export function GEXVEXChart({
  symbol, data, levels, spotPrice, height = 520,
  regime, projectionTarget, projectionDirection, projectionRange,
  expectedMove, horizonTargets, tradeSetups, onPriceHover,
}: GEXVEXChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const projectionSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // Convert data to TradingView format
  const tvCandles = useMemo<CandlestickData[]>(() => {
    if (!data?.length) return [];
    return data
      .filter(d => d && d.time && d.close != null)
      .map(d => ({
        time: d.time as Time,
        open: safeNumber(d.open, d.close),
        high: safeNumber(d.high, d.close),
        low: safeNumber(d.low, d.close),
        close: safeNumber(d.close, 0),
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
  }, [data]);

  // Volume data
  const tvVolume = useMemo(() => {
    if (!data?.length) return [];
    return data
      .filter(d => d && d.time && d.volume)
      .map(d => ({
        time: d.time as Time,
        value: d.volume || 0,
        color: d.close >= d.open ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
  }, [data]);

  // Projection line data
  const tvProjection = useMemo<LineData[]>(() => {
    if (!tvCandles.length) return [];
    const lastCandle = tvCandles[tvCandles.length - 1];
    const lastClose = lastCandle.close;
    const lastTime = lastCandle.time as number;
    const daySeconds = 86400;

    const ease = (p: number) => p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const points: LineData[] = [{ time: lastTime as Time, value: lastClose }];

    if (horizonTargets) {
      const segments = [
        { steps: 2, target: horizonTargets.today },
        { steps: 3, target: horizonTargets.week },
        { steps: 4, target: horizonTargets.month },
      ];
      let currentPrice = lastClose;
      let stepIndex = 0;
      for (const seg of segments) {
        for (let i = 1; i <= seg.steps; i++) {
          stepIndex++;
          const price = currentPrice + (seg.target - currentPrice) * ease(i / seg.steps);
          points.push({ time: (lastTime + stepIndex * daySeconds) as Time, value: price });
        }
        currentPrice = seg.target;
      }
    } else if (projectionTarget) {
      for (let i = 1; i <= 7; i++) {
        const price = lastClose + (projectionTarget - lastClose) * ease(i / 7);
        points.push({ time: (lastTime + i * daySeconds) as Time, value: price });
      }
    }

    return points;
  }, [tvCandles, horizonTargets, projectionTarget]);

  // Deduplicate levels
  const dedupedLevels = useMemo(() => {
    if (!levels.length) return [];
    const sorted = [...levels].sort((a, b) => b.price - a.price);
    const result: GEXLevel[] = [];
    for (const lvl of sorted) {
      const tooClose = result.some(r => Math.abs(r.price - lvl.price) / spotPrice < 0.003);
      if (!tooClose) result.push(lvl);
    }
    return result;
  }, [levels, spotPrice]);

  // Create and manage chart
  useEffect(() => {
    if (!containerRef.current || !tvCandles.length) return;

    // Destroy previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#0a0b0e' },
        textColor: '#64748b',
        fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(100,116,139,0.04)' },
        horzLines: { color: 'rgba(100,116,139,0.06)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(100,116,139,0.3)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: 'rgba(100,116,139,0.3)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(100,116,139,0.1)',
        scaleMargins: { top: 0.05, bottom: 0.15 },
      },
      timeScale: {
        borderColor: 'rgba(100,116,139,0.1)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: projectionTarget || horizonTargets ? 15 : 8,
        barSpacing: 14,
        minBarSpacing: 6,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    chartRef.current = chart;

    // ── Candlestick series ──
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: 'rgba(34, 197, 94, 0.15)',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: 'rgba(34, 197, 94, 0.6)',
      wickDownColor: 'rgba(239, 68, 68, 0.6)',
    });
    candleSeries.setData(tvCandles);
    candleSeriesRef.current = candleSeries;

    // ── Volume histogram ──
    if (tvVolume.length > 0) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volumeSeries.setData(tvVolume);
      volumeSeriesRef.current = volumeSeries;
    }

    // ── Projection line ──
    if (tvProjection.length > 1) {
      const projColor = projectionDirection === 'BULLISH' ? '#22d3ee'
        : projectionDirection === 'BEARISH' ? '#f87171' : '#a78bfa';

      const projSeries = chart.addSeries(LineSeries, {
        color: projColor,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: projColor,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      projSeries.setData(tvProjection);
      projectionSeriesRef.current = projSeries;
    }

    // ── GEX/VEX level price lines ──
    dedupedLevels.forEach(lvl => {
      const cfg = LEVEL_COLORS[lvl.type];
      if (!cfg) return;

      const dist = Math.abs(lvl.price - spotPrice) / spotPrice;
      const proximityAlpha = Math.max(0.2, 1 - dist * 6);
      const gamma = lvl.gammaConcentration ? ` ${lvl.gammaConcentration}%γ` : '';
      const pctDist = ((lvl.price - spotPrice) / spotPrice * 100).toFixed(1);
      const pctLabel = Number(pctDist) > 0 ? `+${pctDist}%` : `${pctDist}%`;

      candleSeries.createPriceLine({
        price: lvl.price,
        color: cfg.color,
        lineWidth: cfg.width as 1 | 2 | 3 | 4,
        lineStyle: cfg.style,
        lineVisible: true,
        axisLabelVisible: true,
        title: `${lvl.label.split(' ')[0]} ${pctLabel}${gamma}`,
      });
    });

    // ── Spot price line ──
    candleSeries.createPriceLine({
      price: spotPrice,
      color: '#64748b',
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      lineVisible: true,
      axisLabelVisible: true,
      title: 'SPOT',
    });

    // ── Trade setup lines ──
    tradeSetups?.forEach(setup => {
      candleSeries.createPriceLine({
        price: setup.entry,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        title: `Entry ${setup.grade}`,
      });
      candleSeries.createPriceLine({
        price: setup.target,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        title: `Target (${setup.riskReward})`,
      });
      candleSeries.createPriceLine({
        price: setup.stop,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        title: 'Stop',
      });
    });

    // ── Expected move range markers ──
    if (expectedMove?.impliedDailyRange) {
      candleSeries.createPriceLine({
        price: expectedMove.impliedDailyRange.high,
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        title: `EM High +$${expectedMove.daily.toFixed(1)}`,
        axisLabelVisible: false,
      });
      candleSeries.createPriceLine({
        price: expectedMove.impliedDailyRange.low,
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        title: `EM Low -$${expectedMove.daily.toFixed(1)}`,
        axisLabelVisible: false,
      });
    }

    // ── Crosshair move handler ──
    chart.subscribeCrosshairMove((param) => {
      if (onPriceHover && param.point) {
        const priceData = param.seriesData.get(candleSeries);
        if (priceData && 'close' in priceData) {
          onPriceHover(priceData.close);
        }
      }
    });

    // ── Resize observer ──
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    ro.observe(containerRef.current);

    // Show last 40 bars at readable size (not zoomed all the way out)
    if (tvCandles.length > 40) {
      const from = tvCandles[tvCandles.length - 40].time;
      const to = tvProjection.length > 0
        ? tvProjection[tvProjection.length - 1].time
        : tvCandles[tvCandles.length - 1].time;
      chart.timeScale().setVisibleRange({ from, to });
    } else {
      chart.timeScale().fitContent();
    }

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [tvCandles, tvVolume, tvProjection, dedupedLevels, spotPrice, height,
      projectionDirection, expectedMove, tradeSetups, onPriceHover, projectionTarget, horizonTargets]);

  // Trend info
  const firstClose = tvCandles.length > 0 ? tvCandles[0].close : 0;
  const lastClose = tvCandles.length > 0 ? tvCandles[tvCandles.length - 1].close : 0;
  const changePct = firstClose > 0 ? ((lastClose - firstClose) / firstClose * 100) : 0;

  return (
    <div className="relative w-full">
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

      {/* Price badge */}
      <div className="absolute top-2 left-2 z-20 px-2 py-0.5 rounded bg-card/90 border border-border text-xs font-mono font-bold tabular-nums text-foreground">
        {symbol} ${safeToFixed(spotPrice, 2)}
        <span className={`ml-1.5 text-[9px] ${changePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}`}>
          {changePct >= 0 ? '▲' : '▼'}{Math.abs(changePct).toFixed(2)}%
        </span>
      </div>

      {/* Chart container */}
      <div ref={containerRef} style={{ height }} className="w-full overflow-hidden bg-[#0a0b0e]" />

      {/* Level legend */}
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 px-1">
        {dedupedLevels.slice(0, 10).map((lvl, i) => {
          const cfg = LEVEL_COLORS[lvl.type];
          return (
            <div key={i} className="flex items-center gap-1 text-[8px] font-mono">
              <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: cfg?.color }} />
              <span className="text-muted-foreground font-semibold tabular-nums">${lvl.price.toFixed(0)}</span>
              <span className="text-muted-foreground/40">{lvl.label.split(' ')[0]}</span>
              {lvl.gammaConcentration && (
                <span className="text-muted-foreground/30">{lvl.gammaConcentration}%</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
