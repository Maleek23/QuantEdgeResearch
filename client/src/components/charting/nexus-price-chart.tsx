/**
 * NexusPriceChart — the CHART tab's engine as a drop-in component.
 *
 * One chart everywhere: CHART, the cockpit, GEX and any panel that needs price
 * render the SAME interactive canvas — real OHLCV, timeframe bar, candles/line
 * toggle, MA20/50, volume, crosshair with OHLCV tooltip, published levels, gap
 * zones, outlier-wick clamping with the on-chart disclosure.
 *
 * Interaction model (the "can't scroll to see other bars" fix):
 *   wheel        zoom in/out, anchored on the bar under the cursor
 *   drag         pan through history
 *   double-click reset to a readable timeframe-sized window
 *   ⤢            expand into a modal over a blurred backdrop
 *
 * Pan/zoom is a windowed VIEW over the real series — never resampled, never
 * interpolated: `span` bars ending `offset` bars before the latest.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVisualMode } from '@/lib/visual-mode';
import {
  drawChart, renderedCandleRange, useCandles, useLiveCandles, TF_CONFIG, TF_BAR_MS,
  type Candle, type Level, type Zone, type DrawOpts,
} from '@/components/charting/chart-engine';
import type { LiveTick } from '@/lib/live-price-bus';
import { barTimeLabel, chartSessionStamp } from '@shared/bar-time';
import '@/styles/nexus.css';

const MIN_SPAN = 15;
const PRICE_AXIS_WIDTH = 70;
const TIME_AXIS_HEIGHT = 50;
const DEFAULT_VISIBLE_BARS: Record<keyof typeof TF_CONFIG, number> = {
  '1m': 390,
  '5m': 390,
  '15m': 260,
  '30m': 220,
  '1h': 240,
  '4h': 180,
  '1D': 180,
  '1W': 156,
};

// Stable defaults: a fresh `[]` per render re-ran the redraw effect, whose
// onHoverCandle → parent setState → render → new `[]` looped until React
// aborted ("Maximum update depth exceeded" on Chart Lab).
const NO_LEVELS: (Level & { dashed?: boolean })[] = [];
const NO_ZONES: Zone[] = [];

const SYNC_BUS = new Map<string, Set<(t: number | null) => void>>();

export function NexusPriceChart({
  symbol,
  initialTf = '1D',
  height = 340,
  levels = NO_LEVELS,
  zones = NO_ZONES,
  fill = false,
  expandable = true,
  onHoverCandle,
  syncGroup,
  tf: controlledTf,
  onTfChange,
  hideControls = false,
  transformBars,
  showMA = true,
  showVolume = true,
  crosshairTip = true,
  underlay,
  overlay,
  axisOverlay,
  resetKey,
  defaultVisibleBars,
  live = true,
  active = true,
  chartType: controlledType,
  minimalInfo = false,
  touchScroll = false,
}: {
  symbol: string;
  initialTf?: keyof typeof TF_CONFIG;
  height?: number;
  levels?: (Level & { dashed?: boolean })[];
  zones?: Zone[];
  /** Fill the parent (flex:1) instead of a fixed height — for page layouts. */
  fill?: boolean;
  /** Show the ⤢ button that opens the blurred-backdrop modal. */
  expandable?: boolean;
  /** Hovered (or latest) candle — for external OHLC readouts. */
  onHoverCandle?: (c: Candle | null) => void;
  /** Charts sharing a group share a crosshair: hovering one marks the same
   *  time on the others. */
  syncGroup?: string;
  /** Controlled timeframe (the caller owns the TF picker). */
  tf?: keyof typeof TF_CONFIG;
  onTfChange?: (tf: keyof typeof TF_CONFIG) => void;
  /** Hide the built-in TF bar and candles/line toggle (caller's toolbar owns them). */
  hideControls?: boolean;
  /** Filter/cut the full series (session range, extended hours, replay). Memoize it. */
  transformBars?: (bars: Candle[]) => Candle[];
  showMA?: boolean;
  showVolume?: boolean;
  /** The floating OHLCV tooltip (off when the caller renders its own readout). */
  crosshairTip?: boolean;
  underlay?: DrawOpts['underlay'];
  overlay?: DrawOpts['overlay'];
  axisOverlay?: DrawOpts['axisOverlay'];
  /** Changing this resets pan/zoom (e.g. a new session range). */
  resetKey?: string;
  /** Initial window width in bars (default: timeframe-sized). */
  defaultVisibleBars?: number;
  /** Form the last candle from live ticks (default on). Off for Replay — the
   *  past must not be edited by the present. */
  live?: boolean;
  /** False while the chart is off-screen: no live subscription, no history
   *  refetch. Cached bars stay drawn. */
  active?: boolean;
  /** Controlled candles/line (the caller's settings own it). */
  chartType?: 'candles' | 'line';
  /** Compact embeds: the info strip shows only the LIVE/DELAYED stamp. */
  minimalInfo?: boolean;
  /** Embedded in a scrolling page (phone): vertical swipes scroll the PAGE
   *  (touch-action: pan-y); only horizontal drags and pinches move the chart. */
  touchScroll?: boolean;
}) {
  const [localTf, setLocalTf] = useState<keyof typeof TF_CONFIG>(
    TF_CONFIG[initialTf] ? initialTf : '1D',
  );
  const tf = controlledTf && TF_CONFIG[controlledTf] ? controlledTf : localTf;
  const setTf = (next: keyof typeof TF_CONFIG) => { setLocalTf(next); onTfChange?.(next); };
  const [localType, setType] = useState<'candles' | 'line'>('candles');
  const type = controlledType ?? localType;
  const [expanded, setExpanded] = useState(false);
  const { data: series, isLoading, isError } = useCandles(symbol, tf, active);
  // History + the forming bar from live prints (WS, or 1 s polling fallback).
  const { bars: liveBars, lastTick } = useLiveCandles(symbol, tf, series?.bars, live && active);
  const all = useMemo(
    () => (liveBars && transformBars ? transformBars(liveBars) : liveBars),
    [liveBars, transformBars],
  );

  /* windowed view over the series: span bars, ending `offset` bars before now */
  const [view, setView] = useState<{ span: number | null; offset: number }>({ span: null, offset: 0 });
  const [priceView, setPriceView] = useState({ scale: 1, shift: 0 });
  useEffect(() => {
    setView({ span: null, offset: 0 });
    setPriceView({ scale: 1, shift: 0 });
  }, [symbol, tf, resetKey]);
  const len = all?.length ?? 0;
  // A new live bar appends to the series. If the reader has panned back into
  // history, keep THEIR window still instead of sliding it one bar per bar.
  const prevLen = useRef({ len, key: `${symbol}|${tf}|${resetKey ?? ''}` });
  useEffect(() => {
    const key = `${symbol}|${tf}|${resetKey ?? ''}`;
    const grew = prevLen.current.key === key ? len - prevLen.current.len : 0;
    prevLen.current = { len, key };
    if (grew > 0 && grew < 5) setView((v) => (v.offset > 0 ? { ...v, offset: v.offset + grew } : v));
  }, [len, symbol, tf, resetKey]);
  const defaultSpan = Math.min(len, defaultVisibleBars ?? DEFAULT_VISIBLE_BARS[tf]);
  const span = view.span == null ? defaultSpan : Math.min(view.span, len);
  const offset = Math.min(view.offset, Math.max(0, len - span));
  const candles = useMemo(
    () => (all ? all.slice(Math.max(0, len - span - offset), len - offset) : undefined),
    [all, len, span, offset],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -1, y: -1 });
  const pan = useRef<{
    mode: 'plot' | 'price-axis' | 'time-axis';
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    startSpan: number;
    startPriceScale: number;
    startPriceShift: number;
    moved: boolean;
  } | null>(null);
  const touch = useRef<{ x: number; y: number; axis: 'x' | 'y' | null; offset: number; dist: number | null; span: number } | null>(null);
  const syncTime = useRef<number | null>(null);
  const publishSync = (t: number | null) => {
    if (!syncGroup) return;
    const set = SYNC_BUS.get(syncGroup);
    if (!set) return;
    set.forEach((fn) => { if (fn !== syncListener.current) fn(t); });
  };
  const syncListener = useRef<(t: number | null) => void>(() => {});
  useEffect(() => {
    if (!syncGroup) return;
    const fn = (t: number | null) => { syncTime.current = t; redraw(); };
    syncListener.current = fn;
    if (!SYNC_BUS.has(syncGroup)) SYNC_BUS.set(syncGroup, new Set());
    SYNC_BUS.get(syncGroup)!.add(fn);
    return () => { SYNC_BUS.get(syncGroup)?.delete(fn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncGroup]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !candles || candles.length < 2) return;
    drawChart(canvas, candles, {
      type, tf, showCrosshair: true, showLevels: true,
      showMA, showVolume, underlay, overlay, axisOverlay,
      levels: levels.filter((l) => Number.isFinite(l.price)),
      priceScale: priceView.scale,
      priceShift: priceView.shift,
      zones,
      mouseX: mouse.current.x,
      mouseY: mouse.current.y,
      syncTime: syncTime.current,
      onHover: (c: Candle | null) => {
        const shown = c ? { ...c, ...renderedCandleRange(c) } : null;
        const latestBar = candles?.length ? candles[candles.length - 1] : null;
        const latest = latestBar ? { ...latestBar, ...renderedCandleRange(latestBar) } : null;
        onHoverCandle?.(shown ?? latest);
        publishSync(c?.time ?? null);
        // The legend reads the bar under the crosshair, else the LAST bar —
        // never a stale first/oldest bar (operator 2026-10-06).
        if (crosshairTip) paintLegend(c ?? latestBar, !c);
      },
    });
  };

  /** OHLCV legend: the hovered bar, or the latest bar when nothing is hovered. */
  const legendRef = useRef<HTMLDivElement>(null);
  const paintLegend = (c: Candle | null, isLatest: boolean) => {
    const el = legendRef.current;
    if (!el) return;
    if (!c) { el.style.visibility = 'hidden'; return; }
    el.style.visibility = 'visible';
    const r = renderedCandleRange(c);
    const set = (k: string, v: string) => { const n = el.querySelector(`[data-lg=${k}]`); if (n) n.textContent = v; };
    set('time', `${barTimeLabel(c.time, tf)}${isLatest ? ' · latest' : ''}`);
    set('o', c.open.toFixed(2));
    set('h', `${r.high.toFixed(2)}${c.clampedHigh ? '*' : ''}`);
    set('l', `${r.low.toFixed(2)}${c.clampedLow ? '*' : ''}`);
    set('c', c.close.toFixed(2));
    set('v', c.volume > 0 ? (c.volume >= 1e6 ? `${(c.volume / 1e6).toFixed(2)}M` : `${Math.round(c.volume / 1e3)}K`) : '—');
    const cEl = el.querySelector('[data-lg=c]') as HTMLElement | null;
    if (cEl) cEl.style.color = c.close >= c.open ? 'var(--trade-bullish, #3b8cff)' : 'var(--trade-bearish, #e0674f)';
  };

  // `mode`: the canvas resolves the active visual mode's tokens (chart-engine
  // chartPalette), so a mode change must repaint.
  const [mode] = useVisualMode();
  useEffect(() => { redraw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [candles, type, tf, levels, zones, priceView, showMA, showVolume, underlay, overlay, axisOverlay, mode]);
  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener('resize', onResize);
    const observer = typeof ResizeObserver !== 'undefined' && wrapRef.current
      ? new ResizeObserver(onResize)
      : null;
    if (observer && wrapRef.current) observer.observe(wrapRef.current);
    return () => { window.removeEventListener('resize', onResize); observer?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, type, tf, levels, zones, priceView, showMA, showVolume, underlay, overlay, axisOverlay]);

  /* wheel zoom — native listener so preventDefault actually stops page scroll */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!all || all.length < MIN_SPAN) return;
      e.preventDefault();
      setView((v) => {
        const curSpan = v.span == null
          ? Math.min(all.length, defaultVisibleBars ?? DEFAULT_VISIBLE_BARS[tf])
          : Math.min(v.span, all.length);
        // Delta-proportional zoom. The old fixed 1.25x step compounded per
        // EVENT, and a trackpad fires dozens of small-delta events per flick —
        // one gesture blew through the whole range. exp(delta·k) makes a small
        // trackpad delta a small zoom and a full wheel notch (~100) about 16%;
        // line-mode wheels (deltaMode 1) are normalised to pixels first.
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        const factor = Math.exp(Math.max(-160, Math.min(160, delta)) * 0.0015);
        const nextSpan = Math.round(Math.max(MIN_SPAN, Math.min(all.length, curSpan * factor)));
        if (nextSpan >= all.length) return { span: all.length, offset: 0 };
        // anchor: keep the bar under the cursor roughly in place
        const rect = el.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const anchor = all.length - v.offset - Math.round((1 - frac) * curSpan);
        const nextOffset = Math.max(0, Math.min(all.length - nextSpan, all.length - anchor - Math.round(frac * nextSpan)));
        return { span: nextSpan, offset: nextOffset };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [all, tf, defaultVisibleBars]);

  const visibleQuarantined = candles?.reduce(
    (count, candle) => count + Number(Boolean(candle.clampedHigh)) + Number(Boolean(candle.clampedLow)),
    0,
  ) ?? 0;

  /* ── accessibility: a text summary for the canvas, keyboard pan/zoom, and a
     visually hidden table of the recent bars + levels ── */
  const a11ySummary = useMemo(() => {
    if (!candles?.length) return `${symbol} price chart, no data`;
    const last = candles[candles.length - 1];
    const hi = Math.max(...candles.map((c) => renderedCandleRange(c).high));
    const lo = Math.min(...candles.map((c) => renderedCandleRange(c).low));
    const lv = levels.filter((l) => Number.isFinite(l.price)).map((l) => `${l.label} ${l.price.toFixed(2)}`).join(', ');
    return `${symbol} ${TF_CONFIG[tf].label} ${type} chart, ${candles.length} bars. Last ${last.close.toFixed(2)}; visible range ${lo.toFixed(2)} to ${hi.toFixed(2)}.${lv ? ` Levels: ${lv}.` : ''} Arrow keys pan, plus and minus zoom, 0 resets.`;
  }, [candles, levels, symbol, tf, type]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!all || all.length < MIN_SPAN) return;
    const step = Math.max(1, Math.round(span * 0.1));
    let handled = true;
    if (e.key === 'ArrowLeft') setView((v) => ({ ...v, offset: Math.min(Math.max(0, len - span), offset + step) }));
    else if (e.key === 'ArrowRight') setView((v) => ({ ...v, offset: Math.max(0, offset - step) }));
    else if (e.key === '+' || e.key === '=') setView({ span: Math.max(MIN_SPAN, Math.round(span * 0.8)), offset });
    else if (e.key === '-' || e.key === '_') { const ns = Math.min(len, Math.round(span * 1.25)); setView({ span: ns, offset: Math.min(offset, Math.max(0, len - ns)) }); }
    else if (e.key === '0' || e.key === 'Home') { setView({ span: null, offset: 0 }); setPriceView({ scale: 1, shift: 0 }); }
    else if (e.key === 'End') setView((v) => ({ ...v, offset: 0 }));
    else handled = false;
    if (handled) e.preventDefault();
  };
  const srTable = candles?.length ? (
    <table className="sr-only">
      <caption>{symbol} · {TF_CONFIG[tf].label} · most recent {Math.min(20, candles.length)} bars</caption>
      <thead><tr><th scope="col">Time</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th><th scope="col">Volume</th></tr></thead>
      <tbody>
        {candles.slice(-20).reverse().map((c) => (
          <tr key={c.time}><td>{barTimeLabel(c.time, tf)}</td><td>{c.open.toFixed(2)}</td><td>{renderedCandleRange(c).high.toFixed(2)}</td><td>{renderedCandleRange(c).low.toFixed(2)}</td><td>{c.close.toFixed(2)}</td><td>{c.volume}</td></tr>
        ))}
        {levels.filter((l) => Number.isFinite(l.price)).map((l) => (
          <tr key={`lv-${l.label}-${l.price}`}><th scope="row">{l.label}</th><td colSpan={5}>{l.price.toFixed(2)}</td></tr>
        ))}
      </tbody>
    </table>
  ) : null;

  const chartBody = (
    <>
      {!active && !series ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          {symbol} · loads when in view
        </div>
      ) : isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          loading {symbol} · {TF_CONFIG[tf].label}…
        </div>
      ) : isError || !candles?.length ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          no price history for {symbol} at {TF_CONFIG[tf].label}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={a11ySummary}
          style={{ cursor: 'crosshair', touchAction: touchScroll ? 'pan-y' : 'none' }}
          onTouchStart={(e) => {
            if (!all) return;
            if (e.touches.length === 2) {
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              touch.current = { x: 0, y: 0, axis: 'x', offset, dist: Math.hypot(dx, dy), span };
            } else if (e.touches.length === 1) {
              touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null, offset, dist: null, span };
            }
          }}
          onTouchMove={(e) => {
            const t0 = touch.current;
            if (!t0 || !all) return;
            // Axis lock on the first real move: a vertical swipe on an embedded
            // chart belongs to the page (touch-action: pan-y already lets the
            // browser scroll); only a horizontal drag pans the chart.
            if (t0.axis == null && e.touches.length === 1) {
              const dx = Math.abs(e.touches[0].clientX - t0.x);
              const dy = Math.abs(e.touches[0].clientY - t0.y);
              if (dx < 6 && dy < 6) return;
              t0.axis = dx >= dy ? 'x' : 'y';
            }
            if (touchScroll && t0.axis === 'y') return;
            if (e.cancelable) e.preventDefault();
            if (e.touches.length === 2 && t0.dist != null) {
              // pinch: scale the visible span around the current window
              const dx = e.touches[0].clientX - e.touches[1].clientX;
              const dy = e.touches[0].clientY - e.touches[1].clientY;
              const scale = t0.dist / Math.max(20, Math.hypot(dx, dy));
              const nextSpan = Math.round(Math.min(all.length, Math.max(20, t0.span * scale)));
              setView((v) => ({ span: nextSpan, offset: Math.min(v.offset, Math.max(0, all.length - nextSpan)) }));
            } else if (e.touches.length === 1 && t0.dist == null) {
              const wrap = wrapRef.current;
              const width = wrap?.clientWidth || 1;
              const perPx = span / width;
              const delta = Math.round((e.touches[0].clientX - t0.x) * perPx);
              setView((v) => ({ ...v, offset: Math.max(0, Math.min(Math.max(0, all.length - span), t0.offset + delta)) }));
            }
          }}
          onTouchEnd={() => { touch.current = null; }}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') return;
            const rect = e.currentTarget.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const mode = localX >= rect.width - PRICE_AXIS_WIDTH
              ? 'price-axis'
              : localY >= rect.height - TIME_AXIS_HEIGHT
                ? 'time-axis'
                : 'plot';
            pan.current = {
              mode,
              pointerId: e.pointerId,
              startX: e.clientX,
              startY: e.clientY,
              startOffset: offset,
              startSpan: span,
              startPriceScale: priceView.scale,
              startPriceShift: priceView.shift,
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.style.cursor = mode === 'price-axis' ? 'ns-resize' : mode === 'time-axis' ? 'ew-resize' : 'grabbing';
          }}
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse') return;
            const rect = e.currentTarget.getBoundingClientRect();
            mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const activePan = pan.current;
            if (activePan && all) {
              const dx = e.clientX - activePan.startX;
              const dy = e.clientY - activePan.startY;
              if (Math.abs(dx) > 3 || Math.abs(dy) > 3) activePan.moved = true;
              if (activePan.mode === 'price-axis') {
                const scale = Math.max(0.2, Math.min(5, activePan.startPriceScale * Math.exp(dy * 0.008)));
                setPriceView((current) => ({ ...current, scale }));
              } else if (activePan.mode === 'time-axis') {
                const nextSpan = Math.round(Math.max(MIN_SPAN, Math.min(len, activePan.startSpan * Math.exp(dx * 0.008))));
                setView({ span: nextSpan, offset: Math.min(activePan.startOffset, Math.max(0, len - nextSpan)) });
              } else {
                const plotWidth = Math.max(1, rect.width - PRICE_AXIS_WIDTH);
                const plotHeight = Math.max(1, rect.height - TIME_AXIS_HEIGHT);
                const barW = plotWidth / Math.max(1, activePan.startSpan);
                const dBars = Math.round(dx / barW);
                setView((v) => ({
                  span: v.span,
                  offset: Math.max(0, Math.min(Math.max(0, len - span), activePan.startOffset + dBars)),
                }));
                setPriceView((current) => ({
                  ...current,
                  shift: activePan.startPriceShift + (dy / plotHeight) * activePan.startPriceScale,
                }));
              }
            } else {
              const localX = e.clientX - rect.left;
              const localY = e.clientY - rect.top;
              e.currentTarget.style.cursor = localX >= rect.width - PRICE_AXIS_WIDTH
                ? 'ns-resize'
                : localY >= rect.height - TIME_AXIS_HEIGHT
                  ? 'ew-resize'
                  : 'crosshair';
            }
            redraw();
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
            pan.current = null;
            e.currentTarget.style.cursor = 'crosshair';
            redraw();
          }}
          onPointerLeave={(e) => {
            if (pan.current) return;
            mouse.current = { x: -1, y: -1 };
            e.currentTarget.style.cursor = 'crosshair';
            redraw();
          }}
          onLostPointerCapture={(e) => {
            pan.current = null;
            e.currentTarget.style.cursor = 'crosshair';
          }}
          onDoubleClick={() => {
            setView({ span: null, offset: 0 });
            setPriceView({ scale: 1, shift: 0 });
          }}
        />
      )}

      {!hideControls && <div className="timeframe-bar" style={{ top: 8, left: 8 }}>
        {(Object.keys(TF_CONFIG) as (keyof typeof TF_CONFIG)[]).map((k) => (
          <button key={k} className={`tf-btn${tf === k ? ' active' : ''}`} style={{ padding: '3px 8px' }} onClick={() => setTf(k)}>{k}</button>
        ))}
      </div>}
      {!hideControls && <div className="chart-type-toggle" style={{ position: 'absolute', top: 8, right: 8, zIndex: 3, display: 'flex', gap: 2 }}>
        {(['candles', 'line'] as const).map((t) => (
          <button key={t} className={`chart-type-btn${type === t ? ' active' : ''}`} onClick={() => setType(t)}>{t}</button>
        ))}
        {expandable && !expanded && (
          <button className="chart-type-btn" title="Expand" onClick={() => setExpanded(true)}>⤢</button>
        )}
      </div>}

      <div className="chart-info-overlay" style={{ bottom: 8, left: 8, padding: '4px 8px' }}>
        {!minimalInfo && <span>TF <b>{TF_CONFIG[tf].label}</b></span>}
        {!minimalInfo && <span>BARS <b>{candles?.length ?? 0}{(candles?.length ?? 0) < len ? ` / ${len}` : ''}</b></span>}
        {!minimalInfo && <span style={{ color: view.span != null || priceView.scale !== 1 || priceView.shift !== 0 ? 'var(--cyan-bright)' : undefined }}>plot ↔↕ · axes scale · dbl-click reset</span>}
        {live && !active && all?.length ? <span style={{ color: 'var(--text-mute)' }}>❚❚ paused off-screen</span> : null}
        {live && active && lastTick && all?.length ? <LiveBadge tick={lastTick} tf={tf} lastBarTime={all[all.length - 1].time} /> : null}
        {live && active && !lastTick && all?.length ? <NoTapeStamp /> : null}
        {!live && all?.length ? <span style={{ color: 'var(--text-mute)' }} title="This chart shows a fixed window of history; live ticks are off.">HISTORY · not live</span> : null}
        {visibleQuarantined > 0 && (
          <span style={{ color: 'var(--amber)' }}>{visibleQuarantined} SOURCE ANOMAL{visibleQuarantined === 1 ? 'Y' : 'IES'} HIDDEN</span>
        )}
      </div>

      {crosshairTip && candles?.length ? (
        <div ref={legendRef} className="nx-ohlc-legend" aria-live="off"
          style={{ position: 'absolute', top: hideControls ? 6 : 36, left: 8, zIndex: 3, pointerEvents: 'none', display: 'flex', flexWrap: 'wrap', gap: '0 8px', maxWidth: 'calc(100% - 90px)', padding: '2px 6px', borderRadius: 4, background: 'color-mix(in srgb, var(--panel-solid, #0b0f17) 78%, transparent)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, lineHeight: 1.5, color: 'var(--text-dim)' }}>
          <span data-lg="time" style={{ color: 'var(--text)' }}>—</span>
          <span>O <b data-lg="o">—</b></span>
          <span>H <b data-lg="h">—</b></span>
          <span>L <b data-lg="l">—</b></span>
          <span>C <b data-lg="c">—</b></span>
          <span>V <b data-lg="v">—</b></span>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <div
        ref={wrapRef}
        className="chart-canvas-wrap focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400"
        tabIndex={0}
        role="region"
        aria-label={`${symbol} chart — arrow keys pan, plus / minus zoom, 0 resets`}
        onKeyDown={onKeyDown}
        style={fill
          ? { flex: 1, minHeight: 0, position: 'relative' }
          : { height: Math.max(height, 380), flex: 'none', borderRadius: 6, border: '1px solid var(--nx-border, rgba(59,140,255,0.08))' }}
      >
        {chartBody}
        {srTable}
      </div>

      {/* mini-expand: same chart, big, over a blurred backdrop. A separate
          instance so the small one keeps its own view when this closes. */}
      {expanded && (
        <div className="chart-modal" onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}>
          <div className="chart-modal-box">
            <div className="chart-modal-head">
              <span className="chart-modal-title">{symbol} · price</span>
              <button className="chart-modal-close" onClick={() => setExpanded(false)}>ESC ✕</button>
            </div>
            <div className="chart-modal-body">
              <NexusPriceChart
                symbol={symbol}
                initialTf={tf}
                levels={levels}
                zones={zones}
                fill
                expandable={false}
              />
            </div>
          </div>
        </div>
      )}
      {expanded && <EscClose onClose={() => setExpanded(false)} />}
    </>
  );
}

/**
 * LIVE · price age · countdown to the next bar. Its own component with its own
 * 1 s clock, so the countdown ticks without redrawing the canvas. Says "delayed"
 * rather than "live" when the newest price came from a polled quote.
 */
function LiveBadge({ tick, tf, lastBarTime }: { tick: LiveTick; tf: string; lastBarTime: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const age = Math.max(0, Math.round((now - tick.ts) / 1000));
  const barMs = TF_BAR_MS[tf] ?? 60_000;
  const intraday = barMs < 86_400_000;
  const left = intraday ? Math.max(0, Math.round((lastBarTime + barMs - now) / 1000)) : null;
  const fresh = tick.live && age < 15;
  const src = tick.source === 'alpaca-iex' ? 'IEX' : tick.source === 'coinbase' ? 'Coinbase' : tick.source;
  return (
    <span
      style={{ color: fresh ? 'var(--green, #6ee7b7)' : 'var(--amber, #facc15)' }}
      title={`Last price ${tick.price} from ${tick.source}, ${age}s old. ${tick.live ? 'Real print — the forming candle updates on every trade.' : 'Polled quote — refreshes the forming candle, never opens a new one.'}`}
    >
      {fresh ? '● LIVE' : '○ DELAYED'} {src} · {age < 60 ? `${age}s` : `${Math.round(age / 60)}m`}
      {left != null && left <= Math.round(barMs / 1000) ? ` · next bar ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''}
    </span>
  );
}

/** No live print yet: "waiting for tape" only in the regular session; otherwise the
 *  session state with the last regular close ("Closed · last 16:00 ET"). */
function NoTapeStamp() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const st = chartSessionStamp(now);
  return (
    <span style={{ color: st.expectTape ? 'var(--amber, #facc15)' : 'var(--text-mute)' }} title={st.title}>
      ○ {st.label}
    </span>
  );
}

function EscClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return null;
}
