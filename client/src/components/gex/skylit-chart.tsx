/**
 * SkylitChart — Lightweight Charts candle pane wrapped in a Skylit OLED shell
 * with an absolute-positioned GEXOrbCanvas overlay for walls / orbs / trinity
 * line / projection arc.
 *
 * The lightweight-charts pane owns ONLY:
 *   - the candlestick series
 *   - the crosshair + axes
 *   - a single cyan right-axis SPOT pill (native axis label)
 *
 * Everything else — glowing wall bands, per-candle orb stream, dashed trinity
 * spot line, and cyan projection arc — is painted on top by GEXOrbCanvas,
 * which reads coordinates off the same chart instance so it stays pixel-
 * perfect under pan/zoom.
 *
 * Hardened for React StrictMode + lightweight-charts v5:
 *   - `disposed` flag prevents post-teardown paints
 *   - every chart.* call is wrapped in try/catch
 *   - deferred-disposal pattern reuses the chart across StrictMode fake
 *     remount so the internal RAF paint loop never touches a dead canvas
 *   - chart is recreated only when `height` actually changes
 */

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  CandlestickData,
  CrosshairMode,
  LineStyle,
  Time,
} from 'lightweight-charts';
import type { GEXCandle, GEXOrb, ProjectionArc, GEXSnapshot } from '../../../../shared/gex-types';
import { GEXOrbCanvas } from './gex-orb-canvas';

interface SkylitChartProps {
  candles: GEXCandle[];
  orbs: GEXOrb[];
  projection: ProjectionArc | null;
  snapshot: GEXSnapshot;
  mode: 'orbs' | 'heatmap' | 'projection' | 'walls';
  height?: number;
}

// --- helpers ------------------------------------------------------

function safeCall<T>(fn: () => T, fallback?: T): T | undefined {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Install a process-wide "Object is disposed" error suppressor.
 *
 * Lightweight-charts v5 has an internal `DevicePixelContentBoxBinding`
 * ResizeObserver + RAF paint loop that can fire AFTER `chart.remove()` has
 * synchronously disposed the canvas target. These errors escape React's
 * error boundary (they happen in a browser-scheduled callback, not in a
 * React commit phase) and can't be caught by try/catch around our own calls.
 *
 * In React StrictMode this happens on every mount (double-invoke), producing
 * 200+ "Object is disposed" errors per page load. The errors are purely
 * cosmetic — the new chart instance is already live and rendering — but
 * they spam the console and drown out real issues.
 *
 * This suppressor installs ONCE per page load, filters for the exact error
 * signature (message + lightweight-charts stack frame), and swallows only
 * those. Every other error still surfaces normally.
 */
let disposedSuppressorInstalled = false;
function installDisposedErrorSuppressor() {
  if (disposedSuppressorInstalled || typeof window === 'undefined') return;
  disposedSuppressorInstalled = true;

  const isDisposedChartError = (msg: string, stack?: string) =>
    msg?.includes('Object is disposed') &&
    (stack?.includes('lightweight-charts') ||
      stack?.includes('DevicePixelContentBoxBinding') ||
      stack?.includes('ChartWidget'));

  window.addEventListener(
    'error',
    (ev) => {
      const msg = ev.message || ev.error?.message || '';
      const stack = ev.error?.stack || '';
      if (isDisposedChartError(msg, stack)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    },
    true, // capture phase so we run before any console logger
  );

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const msg = reason?.message || String(reason || '');
    const stack = reason?.stack || '';
    if (isDisposedChartError(msg, stack)) {
      ev.preventDefault();
    }
  });

  // Lightweight-charts catches its own internal paint errors and logs them
  // via console.error directly, bypassing window 'error'. Patch console.error
  // to filter the exact "Object is disposed" signature.
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      for (const a of args) {
        if (a instanceof Error && isDisposedChartError(a.message, a.stack)) {
          return;
        }
        if (
          typeof a === 'string' &&
          a.includes('Object is disposed') &&
          args.some(
            (x) =>
              (x instanceof Error && (x.stack || '').includes('lightweight-charts')) ||
              (typeof x === 'string' && x.includes('lightweight-charts')),
          )
        ) {
          return;
        }
      }
    } catch {
      /* fall through to real console.error */
    }
    origError(...args);
  };
}

// ------------------------------------------------------------------

export function SkylitChart({
  candles,
  orbs,
  projection,
  snapshot,
  mode,
  height = 520,
}: SkylitChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  /** True once the cleanup fn has fired — blocks queued paints. */
  const disposedRef = useRef(false);
  /** Pending disposal timer so StrictMode double-mount can cancel it. */
  const disposalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Active disposal runner for the current chart (refreshed on each create). */
  const disposalRunnerRef = useRef<(() => void) | null>(null);
  /**
   * Flips true once chart + series + container are all mounted, gating the
   * GEXOrbCanvas overlay. Flips false only on REAL disposal (not StrictMode
   * fake cleanup), thanks to the deferred-disposal pattern below.
   */
  const [chartReady, setChartReady] = useState(false);

  // ══════════════════════════════════════════════════════════════
  // CHART LIFECYCLE (create once per `height`)
  //
  // Deferred-disposal pattern for React StrictMode:
  //   On "unmount" (which StrictMode fires fake in dev), we schedule a
  //   real teardown on a 50ms timer. If the effect re-runs within that
  //   window (StrictMode remount), we cancel the timer and reuse the
  //   existing chart instance — no create/destroy churn, no late RAF
  //   paints against a disposed canvas.
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!containerRef.current) return;

    installDisposedErrorSuppressor();

    // If a disposal is pending from a previous (StrictMode fake) cleanup,
    // cancel it and reuse the live chart.
    if (disposalTimerRef.current !== null && chartRef.current) {
      clearTimeout(disposalTimerRef.current);
      disposalTimerRef.current = null;
      disposedRef.current = false;
      const existingRunner = disposalRunnerRef.current;
      return () => {
        if (existingRunner) {
          disposalTimerRef.current = setTimeout(existingRunner, 50);
        }
      };
    }

    disposedRef.current = false;
    const container = containerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#a3a3a3',
        fontFamily: "'JetBrains Mono', 'Space Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(250, 204, 21, 0.04)' },
        horzLines: { color: 'rgba(250, 204, 21, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#facc15',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#facc15',
        },
        horzLine: {
          color: '#facc15',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#facc15',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(250, 204, 21, 0.15)',
        // Larger bottom margin keeps candles well above the time axis
        scaleMargins: { top: 0.12, bottom: 0.12 },
        autoScale: true,
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: 'rgba(250, 204, 21, 0.15)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 6,
      },
      width: container.clientWidth,
      height,
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      // Hide the built-in last-close axis label — our SPOT price line owns
      // that slot on the right axis, and two overlapping cyan pills look broken.
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // ResizeObserver with disposal guard
    const ro = new ResizeObserver(() => {
      if (disposedRef.current) return;
      safeCall(() => {
        if (chartRef.current && containerRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
    });
    ro.observe(container);

    // The real disposal — closed over the chart/RO for this mount.
    const runDisposal = () => {
      disposedRef.current = true;
      setChartReady(false);
      safeCall(() => ro.disconnect());
      priceLinesRef.current = [];
      const toRemove = chartRef.current;
      chartRef.current = null;
      candleSeriesRef.current = null;
      disposalTimerRef.current = null;
      // Give pending paint RAFs one more frame to land before teardown.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          safeCall(() => toRemove?.remove());
        });
      });
    };
    disposalRunnerRef.current = runDisposal;

    // Flip ready flag AFTER refs are populated so the overlay child can read
    // live instances on its first render.
    setChartReady(true);

    return () => {
      // Schedule — don't execute yet. StrictMode may re-mount before it fires.
      disposalTimerRef.current = setTimeout(runDisposal, 50);
    };
  }, [height]);

  // ══════════════════════════════════════════════════════════════
  // CANDLE DATA
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (disposedRef.current) return;
    const series = candleSeriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || candles.length === 0) return;

    const data: CandlestickData[] = candles
      .filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close))
      .map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

    safeCall(() => series.setData(data));
    // Force a clean fit so autoScale uses candle range + orb lines sensibly
    safeCall(() => chart.timeScale().fitContent());
  }, [candles]);

  // ══════════════════════════════════════════════════════════════
  // RIGHT-AXIS SPOT PILL
  //
  // The canvas overlay (GEXOrbCanvas) now owns all wall / orb / projection
  // rendering. All we keep on the lightweight-charts side is a single
  // dotted cyan SPOT price line — its only job is to produce the cyan
  // "628.31" pill on the right axis, which is a native feature we can't
  // replicate on the canvas layer.
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (disposedRef.current) return;
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear previous lines
    const prev = priceLinesRef.current;
    prev.forEach((ln) => safeCall(() => series.removePriceLine(ln)));
    priceLinesRef.current = [];

    const spot = snapshot.spotPrice;
    if (!Number.isFinite(spot) || spot <= 0) return;

    const spotLine = safeCall(() =>
      series.createPriceLine({
        price: spot,
        color: '#67e8f9',
        lineWidth: 1,
        // Canvas trinity line already draws the dashed horizontal. Hide the
        // lightweight-charts version by using a solid-0-width-ish line and
        // relying on the axis pill only.
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        axisLabelColor: '#67e8f9',
        axisLabelTextColor: '#0a0a0a',
        title: '',
      }),
    );
    if (spotLine) priceLinesRef.current.push(spotLine);
  }, [snapshot.spotPrice]);

  const chartInstance = chartRef.current;
  const seriesInstance = candleSeriesRef.current;
  const containerEl = containerRef.current;

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg overflow-hidden border border-[var(--gex-positive)]/15"
      style={{
        height,
        // OLED ambient backdrop — radial glow from the chart center plus a
        // subtle vignette. Gives the "self-lit pane" feel Skylit uses.
        background:
          'radial-gradient(ellipse at center, rgba(250,204,21,0.04) 0%, rgba(0,0,0,0.0) 45%), #060608',
        boxShadow:
          'inset 0 0 120px 0 rgba(0,0,0,0.75), inset 0 0 40px 0 rgba(250,204,21,0.05)',
      }}
      data-testid="skylit-chart"
    >
      {chartReady && chartInstance && seriesInstance && containerEl && (
        <GEXOrbCanvas
          chart={chartInstance}
          series={seriesInstance}
          containerEl={containerEl}
          candles={candles}
          orbs={orbs}
          projection={projection}
          snapshot={snapshot}
          // Always-on overlay — walls, orbs, trinity line, and projection
          // arc are painted in every mode. The `mode` prop now only drives
          // secondary UI (sub-tabs, density, etc.) not whether the overlay
          // exists.
          enabled
        />
      )}
    </div>
  );
}
