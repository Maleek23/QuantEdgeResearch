/**
 * TV PANE — the lightweight-charts canvas of the TradingView-style chart:
 * price series (candles / bars / line / area), volume at the foot of the
 * pane, MA 20/50, dealer levels as price lines, the QuantEdge layers and the
 * user's drawings as series primitives, the countdown under the last-price
 * tag, a symbol watermark and the crosshair legend.
 *
 * Render budget: this component re-renders when its bars change (the live
 * bus, ≤ 4×/s via useLiveCandles) and on prop changes. The crosshair legend
 * has its own store (no pane re-render per mouse move); drawing drafts and
 * drags move the primitive directly and commit once on release.
 */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  AreaSeries, BarSeries, CandlestickSeries, CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode,
  TickMarkType, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type Logical, type MouseEventParams,
  type SeriesType, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import {
  calcMA, chartPalette, resolveLevelColor, useLiveCandles, withAlpha,
  type Candle, type Level, type Zone,
} from '@/components/charting/chart-engine';
import type { ChartType, RangeKey, ScaleMode } from '@/components/charting/chart-prefs';
import { etInfo, fmtVol, etClock, fmtUsd, shortDate } from '@/components/charting/chart-layers';
import { useVisualMode } from '@/lib/visual-mode';
import {
  DEFAULT_TOOL_COLOR, TOOL_POINTS, logicalToTime, medianBarMs, moveAnchor, newDrawingId, snapToOhlc,
  timeToLogical, tolFor, type Anchor, type ColorRole, type Drawing, type ToolId,
} from './drawing-geometry';
import { alignToTimes, calcEMA, calcSessionVWAP } from './indicators';
import { DrawingsPrimitive, type DrawColors } from './drawings-primitive';
import { CountdownPrimitive, LayersPrimitive, type LayerColors, type LayersInput } from './layers-primitive';

/* ───────────────────────── time: ET on the axis ───────────────────────── */

const ET_OFF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const offCache = new Map<number, number>();
/** ET offset (ms, negative) at `ms`. Cached per UTC hour. */
function etOffsetMs(ms: number): number {
  const key = Math.floor(ms / 3_600_000);
  const hit = offCache.get(key);
  if (hit != null) return hit;
  const p: Record<string, string> = {};
  const at = key * 3_600_000;
  for (const part of ET_OFF.formatToParts(at)) p[part.type] = part.value;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  const off = asUtc - at;
  if (offCache.size > 50_000) offCache.clear();
  offCache.set(key, off);
  return off;
}
/**
 * The chart library labels time in UTC. Bars are handed over shifted by the
 * New York offset, so every tick mark, day boundary and crosshair label reads
 * in exchange time (09:30 is 09:30). Drawings never see this: they map
 * through bar indices, not these values.
 */
const toChartTime = (ms: number) => Math.floor((ms + etOffsetMs(ms)) / 1000) as UTCTimestamp;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/* ───────────────────────── colours from the visual mode ───────────────────────── */

export interface TvColors {
  bg: string; text: string; mute: string; grid: string; line: string; hi: string;
  up: string; down: string; accent: string; caution: string; marker: string; info: string; dim: string; call: string; put: string; ink: string;
}
function readColors(el: Element | null): TvColors {
  const pal = chartPalette(el);
  const cs = typeof getComputedStyle !== 'undefined' ? getComputedStyle(el ?? document.documentElement) : null;
  const tok = (n: string, fb: string) => cs?.getPropertyValue(n).trim() || fb;
  return {
    bg: tok('--lx-surface', pal.surface),
    text: pal.text,
    mute: tok('--lx-mute', pal.dim),
    grid: tok('--lx-grid', withAlpha(pal.dim, 0.1)),
    line: tok('--lx-line', withAlpha(pal.dim, 0.3)),
    hi: tok('--lx-surface-hi', pal.surface),
    up: pal.gain, down: pal.loss, accent: pal.accent, caution: pal.caution, marker: pal.marker, info: pal.info,
    dim: pal.dim, call: pal.call, put: pal.put, ink: pal.surface,
  };
}

/* ───────────────────────── legend store ───────────────────────── */

interface LegendState { bar: Candle | null; prevClose: number | null; hovering: boolean }
class LegendStore {
  private s: LegendState = { bar: null, prevClose: null, hovering: false };
  private l = new Set<() => void>();
  get = () => this.s;
  sub = (fn: () => void) => { this.l.add(fn); return () => { this.l.delete(fn); }; };
  set(next: LegendState) {
    const a = this.s;
    if (a.bar === next.bar && a.prevClose === next.prevClose && a.hovering === next.hovering) return;
    this.s = next; this.l.forEach((f) => f());
  }
}

const Legend = memo(function Legend({ store, symbol, tfLabel, showVolume, extras, fmt }: {
  store: LegendStore; symbol: string; tfLabel: string; showVolume: boolean; extras: ReactNode; fmt: (n: number) => string;
}) {
  const { bar, prevClose } = useSyncExternalStore(store.sub, store.get, store.get);
  const chg = bar && prevClose ? bar.close - prevClose : null;
  const up = bar ? (chg != null ? chg >= 0 : bar.close >= bar.open) : true;
  const col = up ? 'var(--tv-up)' : 'var(--tv-down)';
  return (
    <div className="tv-legend" aria-live="off">
      <div className="tv-leg-row tv-leg-main">
        <b className="tv-leg-sym">{symbol}</b><span className="tv-leg-dot">·</span><span className="tv-leg-tf">{tfLabel}</span>
        {bar && (
          <span className="tv-leg-ohlc" style={{ color: col }}>
            <span><i>O</i>{fmt(bar.open)}</span>
            <span><i>H</i>{fmt(bar.high)}</span>
            <span><i>L</i>{fmt(bar.low)}</span>
            <span><i>C</i>{fmt(bar.close)}</span>
            {chg != null && prevClose ? <span>{chg >= 0 ? '+' : '−'}{fmt(Math.abs(chg))} ({chg >= 0 ? '+' : '−'}{Math.abs((chg / prevClose) * 100).toFixed(2)}%)</span> : null}
          </span>
        )}
      </div>
      {showVolume && bar && (
        <div className="tv-leg-row"><span className="tv-leg-name">Volume</span><span style={{ color: col }}>{fmtVol(bar.volume)}</span></div>
      )}
      {extras}
    </div>
  );
});

/* ───────────────────────── component ───────────────────────── */

export interface TvPaneHandle {
  zoom(dir: 1 | -1): void;
  pan(dir: 1 | -1): void;
  reset(): void;
  autoScale(): void;
  screenshot(): HTMLCanvasElement | null;
  /** Data point under the pointer (for Alt+H at the cursor), when over the pane. */
  pointerAnchor(): Anchor | null;
  cancelDraft(): boolean;
  /** Scroll/zoom the time axis to cover [fromMs, toMs] (e.g. the last GEX recording). */
  showTime(fromMs: number, toMs: number): void;
}

export interface TvPaneProps {
  symbol: string;
  tf: string;
  tfLabel: string;
  intraday: boolean;
  history: Candle[] | undefined;
  /** RTH filter (intraday) — applied to history + live bars. */
  extended: boolean;
  cutoff: number | null;
  liveOn: boolean;
  range: RangeKey;
  /** Changing this re-fits the visible range (symbol, timeframe, range, session, replay). */
  fitKey: string;
  chartType: ChartType;
  scale: ScaleMode;
  magnet: boolean;
  showVolume: boolean;
  showMA: boolean;
  /** EMA 9 / 21. */
  showEMA: boolean;
  /** Session VWAP (intraday only). */
  showVWAP: boolean;
  /** A second symbol drawn as a line (the price scale is in percent while it shows). */
  compare: { symbol: string; bars: Candle[] } | null;
  levels: (Level & { dashed?: boolean })[];
  zones: Zone[];
  layers: Omit<LayersInput, 'bars' | 'zones' | 'cutoff'>;
  drawings: Drawing[];
  selectedId: string | null;
  allHidden: boolean;
  allLocked: boolean;
  tool: ToolId;
  onSelect: (id: string | null) => void;
  /** A finished edit. `select` selects the new/edited drawing. */
  onCommit: (next: Drawing[], select?: string | null) => void;
  /** A drawing was placed with a tool (the toolbar returns to the cursor). */
  onToolDone: (placed: Drawing) => void;
  legendExtras: ReactNode;
  /** Hover tooltip for a layer item (flow print, dark-pool line, orb). */
  describeLayer?: (hit: ReturnType<LayersPrimitive['hit']>) => { text: string; color?: string; bold?: boolean }[] | null;
}

const RTH = (b: Candle) => { const m = etInfo(b.time).mins; return m >= 570 && m < 960; };
const DEFAULT_BARS: Record<string, number> = { '1m': 240, '5m': 160, '15m': 140, '30m': 130, '1h': 150, '4h': 150, '1D': 180, '1W': 156 };

export const TvPane = forwardRef<TvPaneHandle, TvPaneProps>(function TvPane(props, ref) {
  const {
    symbol, tf, tfLabel, intraday, history, extended, cutoff, liveOn, range, fitKey, chartType, scale, magnet,
    showVolume, showMA, showEMA, showVWAP, compare, levels, zones, layers, drawings, selectedId, allHidden, allLocked, tool,
    onSelect, onCommit, onToolDone, legendExtras, describeLayer,
  } = props;
  const [mode] = useVisualMode();
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma20Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ma50Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema9Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21Ref = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);
  const cmpRef = useRef<ISeriesApi<'Line'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const colorsRef = useRef<TvColors | null>(null);
  const legend = useMemo(() => new LegendStore(), []);

  const colors = useCallback((): TvColors => colorsRef.current ?? (colorsRef.current = readColors(hostRef.current)), []);
  const drawColors = useCallback((): DrawColors => {
    const c = colors();
    const map: Record<ColorRole, string> = { accent: c.accent, gain: c.up, loss: c.down, caution: c.caution, marker: c.marker, info: c.info, text: c.text, dim: c.dim };
    return { role: (r) => map[r] ?? c.accent, surface: c.bg, text: c.text, gain: c.up, loss: c.down };
  }, [colors]);
  const layerColors = useCallback((): LayerColors => {
    const c = colors();
    const pal = chartPalette(hostRef.current);
    return { pos: c.accent, neg: c.down, dp: c.caution, call: c.call, put: c.put, panel: c.bg, caution: c.caution, zone: (z) => (z ? resolveLevelColor(z, pal, hostRef.current) : c.caution) };
  }, [colors]);

  const drawPrim = useMemo(() => new DrawingsPrimitive(drawColors), [drawColors]);
  const layerPrim = useMemo(() => new LayersPrimitive(layerColors), [layerColors]);
  const countPrim = useMemo(() => new CountdownPrimitive(() => { const c = colors(); return { up: c.up, down: c.down, ink: c.bg }; }), [colors]);

  /* ── bars: history + live forming bar → session filter → replay cut ── */
  const { bars: liveBars } = useLiveCandles(symbol, tf, history, liveOn);
  const bars = useMemo(() => {
    let b = liveBars ?? [];
    if (intraday && !extended) b = b.filter(RTH);
    if (cutoff != null) b = b.filter((x) => x.time <= cutoff);
    return b;
  }, [liveBars, intraday, extended, cutoff]);
  const times = useMemo(() => bars.map((b) => b.time), [bars]);
  const barMs = useMemo(() => medianBarMs(times), [times]);
  const barsRef = useRef(bars); barsRef.current = bars;
  const timesRef = useRef(times); timesRef.current = times;
  const barMsRef = useRef(barMs); barMsRef.current = barMs;
  const precision = useMemo(() => {
    const p = bars.length ? bars[bars.length - 1].close : 100;
    return p < 1 ? 5 : p < 10 ? 4 : 2;
  }, [bars]);
  const fmt = useCallback((n: number) => n.toFixed(precision), [precision]);

  /* ── chart lifecycle ── */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    colorsRef.current = readColors(host);
    const c = colorsRef.current;
    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { color: c.bg }, textColor: c.mute, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, attributionLogo: false, panes: { separatorColor: c.line } },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 }, entireTextOnly: true },
      timeScale: { borderVisible: false, rightOffset: 8, barSpacing: 7, minBarSpacing: 0.5, timeVisible: true, secondsVisible: false, shiftVisibleRangeOnNewBar: true, tickMarkFormatter: tickFmt },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { style: LineStyle.LargeDashed, width: 1, color: withAlpha(c.dim, 0.55), labelBackgroundColor: c.hi },
        horzLine: { style: LineStyle.LargeDashed, width: 1, color: withAlpha(c.dim, 0.55), labelBackgroundColor: c.hi },
      },
      localization: { timeFormatter: crossFmt },
      kineticScroll: { touch: true, mouse: false },
      handleScale: { axisPressedMouseMove: { time: true, price: true }, mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    volRef.current = vol;
    ma20Ref.current = chart.addSeries(LineSeries, { color: c.accent, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false });
    ma50Ref.current = chart.addSeries(LineSeries, { color: c.caution, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false });
    const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false } as const;
    ema9Ref.current = chart.addSeries(LineSeries, { ...quiet, color: c.info, lineWidth: 1 });
    ema21Ref.current = chart.addSeries(LineSeries, { ...quiet, color: c.marker, lineWidth: 1 });
    vwapRef.current = chart.addSeries(LineSeries, { ...quiet, color: c.text, lineWidth: 2, lineStyle: LineStyle.Dotted });
    cmpRef.current = chart.addSeries(LineSeries, { ...quiet, color: c.dim, lineWidth: 2, lastValueVisible: true, title: '' });

    const onMove = (p: MouseEventParams<Time>) => {
      const bs = barsRef.current;
      const l = p.logical;
      if (l == null || p.point == null || l < 0 || l > bs.length - 1) {
        const last = bs[bs.length - 1] ?? null;
        legend.set({ bar: last, prevClose: bs.length > 1 ? bs[bs.length - 2].close : null, hovering: false });
        return;
      }
      const i = Math.round(l);
      legend.set({ bar: bs[i], prevClose: i > 0 ? bs[i - 1].close : null, hovering: true });
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null; mainRef.current = null; volRef.current = null; ma20Ref.current = null; ma50Ref.current = null;
      ema9Ref.current = null; ema21Ref.current = null; vwapRef.current = null; cmpRef.current = null;
      linesRef.current = [];
      dataRef.current = { first: null, len: 0 };
    };
  }, [legend]);

  /* ── main series: (re)created when the chart type changes ── */
  // bumped to push data (and price lines) into a freshly created series
  const [dataTick, setDataTick] = useState(0);
  const dataRef = useRef<{ first: number | null; len: number }>({ first: null, len: 0 });
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = colors();
    const s: ISeriesApi<SeriesType> =
      chartType === 'bars' ? chart.addSeries(BarSeries, { upColor: c.up, downColor: c.down, thinBars: false })
        : chartType === 'line' ? chart.addSeries(LineSeries, { color: c.accent, lineWidth: 2 })
          : chartType === 'area' ? chart.addSeries(AreaSeries, { lineColor: c.accent, topColor: withAlpha(c.accent, 0.28), bottomColor: withAlpha(c.accent, 0.02), lineWidth: 2 })
            : chart.addSeries(CandlestickSeries, { upColor: c.up, downColor: c.down, borderVisible: false, wickUpColor: c.up, wickDownColor: c.down });
    s.attachPrimitive(layerPrim);
    s.attachPrimitive(drawPrim);
    s.attachPrimitive(countPrim);
    mainRef.current = s;
    dataRef.current = { first: null, len: 0 };
    linesRef.current = [];
    setDataTick((n) => n + 1);
    return () => {
      s.detachPrimitive(layerPrim); s.detachPrimitive(drawPrim); s.detachPrimitive(countPrim);
      if (chartRef.current) chart.removeSeries(s);
      if (mainRef.current === s) mainRef.current = null;
    };
  }, [chartType, colors, layerPrim, drawPrim, countPrim]);

  /* ── colours follow the visual mode ── */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    colorsRef.current = readColors(hostRef.current);
    const c = colorsRef.current;
    chart.applyOptions({
      layout: { background: { color: c.bg }, textColor: c.mute, panes: { separatorColor: c.line } },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { vertLine: { color: withAlpha(c.dim, 0.55), labelBackgroundColor: c.hi }, horzLine: { color: withAlpha(c.dim, 0.55), labelBackgroundColor: c.hi } },
    });
    const s = mainRef.current;
    if (s) {
      if (chartType === 'bars') s.applyOptions({ upColor: c.up, downColor: c.down } as never);
      else if (chartType === 'line') s.applyOptions({ color: c.accent } as never);
      else if (chartType === 'area') s.applyOptions({ lineColor: c.accent, topColor: withAlpha(c.accent, 0.28), bottomColor: withAlpha(c.accent, 0.02) } as never);
      else s.applyOptions({ upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down } as never);
    }
    ma20Ref.current?.applyOptions({ color: c.accent });
    ma50Ref.current?.applyOptions({ color: c.caution });
    ema9Ref.current?.applyOptions({ color: c.info });
    ema21Ref.current?.applyOptions({ color: c.marker });
    vwapRef.current?.applyOptions({ color: c.text });
    cmpRef.current?.applyOptions({ color: c.dim });
    setDataTick((n) => n + 1); // volume colours are per bar
  }, [mode, chartType, setDataTick]);

  /* ── data ── */
  const needFit = useRef(true);
  useEffect(() => { needFit.current = true; }, [fitKey]);
  useEffect(() => {
    const s = mainRef.current; const vol = volRef.current; const chart = chartRef.current;
    if (!s || !vol || !chart) return;
    const c = colors();
    const ohlc = chartType === 'candles' || chartType === 'bars';
    const toPoint = (b: Candle) => {
      const time = toChartTime(b.time);
      if (!ohlc) return { time, value: b.close };
      // Quarantined bad-tick sides render at the body (chart-engine's rule).
      const high = b.clampedHigh ? Math.max(b.open, b.close) : b.high;
      const low = b.clampedLow ? Math.min(b.open, b.close) : b.low;
      return { time, open: b.open, high, low, close: b.close };
    };
    // A feed without volume (some indices, the harness) leaves whitespace, not NaN bars.
    const volPoint = (b: Candle) => (Number.isFinite(b.volume)
      ? { time: toChartTime(b.time), value: b.volume, color: withAlpha(b.close >= b.open ? c.up : c.down, 0.32) }
      : { time: toChartTime(b.time) });
    const prev = dataRef.current;
    const n = bars.length;
    const first = n ? bars[0].time : null;
    s.applyOptions({ priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision } } as never);
    if (n && prev.first === first && (n === prev.len || n === prev.len + 1)) {
      // live tick: update the forming bar (or open the next one) in place
      s.update(toPoint(bars[n - 1]) as never);
      if (showVolume) vol.update(volPoint(bars[n - 1]));
    } else {
      s.setData(bars.map(toPoint) as never);
      vol.setData(showVolume ? bars.map(volPoint) : []);
    }
    dataRef.current = { first, len: n };
    const line = (vals: (number | null)[]) => bars.map((b, i) => (vals[i] == null ? { time: toChartTime(b.time) } : { time: toChartTime(b.time), value: vals[i]! }));
    if (showMA && n) {
      ma20Ref.current?.setData(line(calcMA(bars, 20)));
      ma50Ref.current?.setData(line(calcMA(bars, 50)));
    }
    if (showEMA && n) {
      ema9Ref.current?.setData(line(calcEMA(bars, 9)));
      ema21Ref.current?.setData(line(calcEMA(bars, 21)));
    }
    vwapRef.current?.setData(showVWAP && intraday && n ? line(calcSessionVWAP(bars, (t) => etInfo(t).date)) : []);
    // primitives
    drawPrim.set({ times, barMs });
    const last = bars[n - 1];
    countPrim.set(last ? { time: last.time, close: last.close, up: n > 1 ? last.close >= bars[n - 2].close : last.close >= last.open } : null, tf, barMs, liveOn && cutoff == null);
    if (!legend.get().hovering) legend.set({ bar: last ?? null, prevClose: n > 1 ? bars[n - 2].close : null, hovering: false });
    // first data for this symbol / timeframe / range: frame it like TV does
    if (needFit.current && n > 1) {
      needFit.current = false;
      applyDefaultRange(chart, bars, tf, intraday, range);
    }
  }, [bars, times, barMs, chartType, showVolume, showMA, showEMA, showVWAP, precision, colors, drawPrim, countPrim, legend, tf, intraday, range, liveOn, cutoff, dataTick]);

  /* compare symbol: only at the main series' bar times (never adds time points) */
  const cmpBars = compare?.bars;
  const cmpSym = compare?.symbol ?? '';
  useEffect(() => {
    const s = cmpRef.current;
    if (!s) return;
    const pts = cmpBars ? alignToTimes(cmpBars, times) : [];
    s.applyOptions({ visible: pts.length > 1, title: cmpSym });
    s.setData(pts.map((b) => ({ time: toChartTime(b.time), value: b.close })));
  }, [cmpBars, cmpSym, times]);

  /* volume / MA visibility + price-scale margins */
  useEffect(() => {
    volRef.current?.applyOptions({ visible: showVolume });
    ma20Ref.current?.applyOptions({ visible: showMA });
    ma50Ref.current?.applyOptions({ visible: showMA });
    ema9Ref.current?.applyOptions({ visible: showEMA });
    ema21Ref.current?.applyOptions({ visible: showEMA });
    vwapRef.current?.applyOptions({ visible: showVWAP && intraday });
    chartRef.current?.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: showVolume ? 0.2 : 0.08 } });
  }, [showVolume, showMA, showEMA, showVWAP, intraday]);

  /* scale mode */
  useEffect(() => {
    chartRef.current?.priceScale('right').applyOptions({
      mode: scale === 'log' ? PriceScaleMode.Logarithmic : scale === 'pct' ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
      autoScale: true,
    });
  }, [scale]);

  /* daily / weekly bars: dates only on the axis and the crosshair label */
  useEffect(() => {
    chartRef.current?.applyOptions({
      localization: { timeFormatter: intraday ? crossFmt : crossFmtDay },
      timeScale: { timeVisible: intraday },
    });
  }, [intraday]);

  /* magnet: crosshair snaps to O/H/L/C */
  useEffect(() => {
    chartRef.current?.applyOptions({ crosshair: { mode: magnet ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal } });
  }, [magnet]);

  /* dealer levels → price lines with axis tags */
  useEffect(() => {
    const s = mainRef.current;
    if (!s) return;
    for (const l of linesRef.current) { try { s.removePriceLine(l); } catch { /* series replaced */ } }
    const pal = chartPalette(hostRef.current);
    linesRef.current = levels.map((l) => s.createPriceLine({
      price: l.price,
      color: resolveLevelColor(l.color, pal, hostRef.current),
      lineWidth: 1,
      lineStyle: l.dashed || l.kind === 'gex-anchor' ? LineStyle.Dashed : LineStyle.Solid,
      axisLabelVisible: true,
      title: l.label,
    }));
  }, [levels, mode, chartType, dataTick]);

  /* layers + drawings state into the primitives */
  useEffect(() => { layerPrim.setInput({ ...layers, bars, zones, cutoff }); }, [layerPrim, layers, bars, zones, cutoff, mode]);

  /* ── pointer: place, select, drag ── */
  const toolRef = useRef(tool); toolRef.current = tool;
  const interact = useRef<{
    draft: Drawing | null;
    drag: { id: string; part: 'body' | number; x0: number; y0: number; orig: Drawing; moved: boolean; preview: Drawing | null } | null;
    down: { x: number; y: number; placedOnDown: boolean } | null;
    pointer: { x: number; y: number } | null;
  }>({ draft: null, drag: null, down: null, pointer: null });

  useEffect(() => {
    // A drag in flight keeps its preview when a re-render lands mid-gesture.
    const dg = interact.current.drag;
    const list = dg?.preview ? drawings.map((d) => (d.id === dg.id ? dg.preview! : d)) : drawings;
    drawPrim.set({ drawings: list, selectedId, allHidden });
  }, [drawPrim, drawings, selectedId, allHidden, mode]);

  useEffect(() => { drawPrim.locked = allLocked; }, [drawPrim, allLocked]);

  const armed = tool !== 'cursor';
  useEffect(() => {
    drawPrim.drawingMode = armed;
    // Placing points must not pan the chart; wheel / pinch zoom stay on.
    chartRef.current?.applyOptions({ handleScroll: armed ? false : { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false } });
    if (!armed && interact.current.draft) { interact.current.draft = null; drawPrim.set({ draft: null }); }
  }, [armed, drawPrim]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inPane = (x: number, y: number) => {
    const chart = chartRef.current;
    if (!chart) return false;
    const w = chart.timeScale().width(); const h = chart.paneSize(0).height;
    return x >= 0 && y >= 0 && x <= w && y <= h;
  };
  /** Pixel → data anchor. Time snaps to a bar (TV behaviour); magnet snaps price to O/H/L/C. */
  const toAnchor = useCallback((x: number, y: number, snapTime = true): Anchor | null => {
    const chart = chartRef.current; const s = mainRef.current;
    if (!chart || !s) return null;
    const l = chart.timeScale().coordinateToLogical(x);
    const p = s.coordinateToPrice(y);
    if (l == null || p == null) return null;
    const li = snapTime ? Math.round(l) : l;
    const t = logicalToTime(timesRef.current, li, barMsRef.current);
    let price: number = p;
    if (magnet) {
      const bar = barsRef.current[Math.round(l)];
      price = snapToOhlc(p, bar, (v) => s.priceToCoordinate(v), y, 28);
    }
    return { t, p: price };
  }, [magnet]);

  const disableScroll = (off: boolean) => {
    if (toolRef.current !== 'cursor') return; // already off while a tool is armed
    chartRef.current?.applyOptions({ handleScroll: off ? false : { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false } });
  };

  const hideTip = () => { if (tipRef.current) tipRef.current.style.display = 'none'; };
  const showTip = (x: number, y: number, touch = false) => {
    const tip = tipRef.current; const host = hostRef.current;
    if (!tip || !host || !describeLayer) return;
    const lines = describeLayer(layerPrim.hit(x, y, touch ? 12 : 4));
    if (!lines) { hideTip(); return; }
    tip.replaceChildren(...lines.map((l) => {
      const div = document.createElement('div');
      div.textContent = l.text;
      if (l.color) div.style.color = l.color;
      if (l.bold) div.style.fontWeight = '700';
      return div;
    }));
    tip.style.display = 'block';
    const W = host.clientWidth; const H = host.clientHeight;
    const tw = tip.offsetWidth; const th = tip.offsetHeight;
    let tx = x + 14; let ty = y + 14;
    if (tx + tw > W - 70) tx = x - tw - 14;
    if (ty + th > H - 30) ty = y - th - 14;
    tip.style.left = `${Math.max(4, tx)}px`; tip.style.top = `${Math.max(4, ty)}px`;
  };

  const commitDraft = (d: Drawing) => {
    interact.current.draft = null;
    drawPrim.set({ draft: null });
    onCommit([...drawings, d], d.id);
    onToolDone(d);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const { x, y } = local(e);
    if (!inPane(x, y)) return;
    const it = interact.current;
    it.pointer = { x, y };
    const touchUi = e.pointerType !== 'mouse';
    if (drawPrim.touchUi !== touchUi) { drawPrim.touchUi = touchUi; drawPrim.set({}); }
    const t = toolRef.current;
    if (t !== 'cursor') {
      e.preventDefault();
      hostRef.current?.setPointerCapture?.(e.pointerId);
      if (t === 'brush') {
        const a = toAnchor(x, y, false);
        if (!a) return;
        it.draft = { id: newDrawingId(), tool: 'brush', pts: [a], color: DEFAULT_TOOL_COLOR.brush, width: 2 };
        it.down = { x, y, placedOnDown: true };
        drawPrim.set({ draft: it.draft });
        return;
      }
      const a = toAnchor(x, y);
      if (!a) return;
      const need = TOOL_POINTS[t];
      if (!it.draft) {
        const d: Drawing = { id: newDrawingId(), tool: t, pts: [a], color: DEFAULT_TOOL_COLOR[t], width: t === 'hline' || t === 'hray' || t === 'vline' ? 1 : 2 };
        if (t === 'text') d.text = 'Text';
        if (t === 'arrow') {
          const bar = barsRef.current[Math.round(timeToLogical(timesRef.current, a.t, barMsRef.current))];
          d.dir = bar && a.p < (bar.high + bar.low) / 2 ? 'up' : 'down';
        }
        if (need === 1) { commitDraft(d); it.down = null; return; }
        d.pts = [a, a];
        it.draft = d;
      } else {
        const pts = [...it.draft.pts.slice(0, -1), a];
        if (pts.length >= need) { commitDraft({ ...it.draft, pts }); it.down = null; return; }
        it.draft = { ...it.draft, pts: [...pts, a] };
      }
      it.down = { x, y, placedOnDown: true };
      drawPrim.set({ draft: it.draft });
      return;
    }
    // cursor: grab a drawing?
    const w = chartRef.current!.timeScale().width(); const h = chartRef.current!.paneSize(0).height;
    const hit = allLocked ? null : drawPrim.hit(x, y, w, h, tolFor(e.pointerType));
    it.down = { x, y, placedOnDown: false };
    if (hit) {
      const d = drawings.find((v) => v.id === hit.id);
      if (!d) return;
      onSelect(d.id);
      if (d.locked) return;
      disableScroll(true);
      hostRef.current?.setPointerCapture?.(e.pointerId);
      it.drag = { id: d.id, part: hit.part.kind === 'handle' ? hit.part.index : 'body', x0: x, y0: y, orig: d, moved: false, preview: null };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = local(e);
    const it = interact.current;
    it.pointer = { x, y };
    if (it.draft) {
      if (it.draft.tool === 'brush') {
        if (!it.down) return;
        const a = toAnchor(x, y, false);
        if (!a) return;
        it.draft = { ...it.draft, pts: [...it.draft.pts, a] };
      } else {
        const a = toAnchor(x, y);
        if (!a) return;
        it.draft = { ...it.draft, pts: [...it.draft.pts.slice(0, -1), a] };
      }
      drawPrim.set({ draft: it.draft });
      return;
    }
    if (it.drag) {
      const dg = it.drag;
      if (!dg.moved && Math.hypot(x - dg.x0, y - dg.y0) < 3) return;
      dg.moved = true;
      const s = mainRef.current; const chart = chartRef.current;
      if (!s || !chart) return;
      let next: Drawing;
      if (dg.part === 'body') {
        const l0 = chart.timeScale().coordinateToLogical(dg.x0); const l1 = chart.timeScale().coordinateToLogical(x);
        const dl = l0 != null && l1 != null ? (dg.orig.tool === 'brush' ? l1 - l0 : Math.round(l1 - l0)) : 0;
        const dy = y - dg.y0;
        next = {
          ...dg.orig,
          pts: dg.orig.pts.map((a) => {
            const ay = s.priceToCoordinate(a.p);
            const np = ay == null ? a.p : s.coordinateToPrice(ay + dy);
            const nl = timeToLogical(timesRef.current, a.t, barMsRef.current) + dl;
            return { t: logicalToTime(timesRef.current, nl, barMsRef.current), p: np ?? a.p };
          }),
        };
      } else {
        const a = toAnchor(x, y);
        if (!a) return;
        next = moveAnchor(dg.orig, dg.part, a);
      }
      dg.preview = next;
      drawPrim.set({ drawings: drawings.map((d) => (d.id === dg.id ? next : d)) });
      return;
    }
    if (e.pointerType === 'mouse' && toolRef.current === 'cursor') {
      if (inPane(x, y)) showTip(x, y); else hideTip();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const { x, y } = local(e);
    const it = interact.current;
    const down = it.down;
    it.down = null;
    hostRef.current?.releasePointerCapture?.(e.pointerId);
    if (it.draft) {
      if (it.draft.tool === 'brush') {
        const d = it.draft;
        if (d.pts.length > 1) commitDraft(d); else { it.draft = null; drawPrim.set({ draft: null }); }
        return;
      }
      // press-drag-release places the next point too (touch friendly)
      if (down?.placedOnDown && Math.hypot(x - down.x, y - down.y) > 10) {
        const a = toAnchor(x, y);
        if (!a) return;
        const need = TOOL_POINTS[it.draft.tool];
        const pts = [...it.draft.pts.slice(0, -1), a];
        if (pts.length >= need) commitDraft({ ...it.draft, pts });
        else { it.draft = { ...it.draft, pts: [...pts, a] }; drawPrim.set({ draft: it.draft }); }
      }
      return;
    }
    if (it.drag) {
      const dg = it.drag; it.drag = null;
      disableScroll(false);
      if (dg.moved && dg.preview) {
        const cur = dg.preview;
        onCommit(drawings.map((d) => (d.id === dg.id ? cur : d)), dg.id);
      }
      return;
    }
    // a click / tap on empty chart clears the selection; a tap shows the layer tooltip
    if (down && Math.hypot(x - down.x, y - down.y) < 5 && toolRef.current === 'cursor') {
      if (selectedId) onSelect(null);
      if (e.pointerType !== 'mouse') showTip(x, y, true);
    }
  };

  // A finger lifting fires pointerleave right after pointerup: only the mouse
  // leaving hides the tooltip (a tap's tooltip stays until the next tap).
  const onPointerLeave = (e: React.PointerEvent) => { interact.current.pointer = null; if (e.pointerType === 'mouse') hideTip(); };

  /* ── imperative handle ── */
  useImperativeHandle(ref, () => ({
    zoom(dir) {
      const ts = chartRef.current?.timeScale();
      const r = ts?.getVisibleLogicalRange();
      if (!ts || !r) return;
      const span = r.to - r.from;
      const next = Math.max(10, span * (dir > 0 ? 0.8 : 1.25));
      ts.setVisibleLogicalRange({ from: (r.to - next) as Logical, to: r.to });
    },
    pan(dir) {
      const ts = chartRef.current?.timeScale();
      const r = ts?.getVisibleLogicalRange();
      if (!ts || !r) return;
      const step = Math.max(1, Math.round((r.to - r.from) * 0.1)) * dir;
      ts.setVisibleLogicalRange({ from: (r.from + step) as Logical, to: (r.to + step) as Logical });
    },
    reset() {
      const chart = chartRef.current;
      if (!chart) return;
      chart.priceScale('right').applyOptions({ autoScale: true });
      applyDefaultRange(chart, barsRef.current, tf, intraday, range);
    },
    autoScale() { chartRef.current?.priceScale('right').applyOptions({ autoScale: true }); },
    screenshot() { return chartRef.current?.takeScreenshot() ?? null; },
    pointerAnchor() {
      const p = interact.current.pointer;
      if (!p || !inPane(p.x, p.y)) return null;
      return toAnchor(p.x, p.y);
    },
    showTime(fromMs, toMs) {
      const ts = chartRef.current?.timeScale();
      const bs = barsRef.current;
      if (!ts || bs.length < 2) return;
      const idx = (t: number) => { let i = 0; while (i < bs.length - 1 && bs[i + 1].time <= t) i++; return i; };
      const a = idx(fromMs); const b = idx(toMs);
      const pad = Math.max(4, Math.round((b - a) * 0.06));
      ts.setVisibleLogicalRange({ from: (a - pad) as Logical, to: (b + pad) as Logical });
    },
    cancelDraft() {
      if (!interact.current.draft) return false;
      interact.current.draft = null; drawPrim.set({ draft: null });
      return true;
    },
  }), [tf, intraday, range, toAnchor, drawPrim]);

  return (
    <div className="tv-pane">
      <div
        ref={hostRef}
        className={`tv-canvas${armed ? ' tv-armed' : ''}`}
        onPointerDownCapture={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        role="img"
        aria-label={`${symbol} ${tfLabel} price chart${drawings.length ? `, ${drawings.length} drawing${drawings.length === 1 ? '' : 's'}` : ''}`}
      />
      {/* the watermark lockup — ticker over the gamma mark (QuantEdge's second
          logo), one faint mark behind the price action */}
      <div className="tv-wm" aria-hidden="true">
        <span className="tv-wm-sym">{symbol}</span>
        <span className="tv-wm-tf">{tfLabel}</span>
        <img className="tv-gamma-wm" src="/gamma-mark.svg" alt="" draggable={false} />
      </div>
      <Legend store={legend} symbol={symbol} tfLabel={tfLabel} showVolume={showVolume} extras={legendExtras} fmt={fmt} />
      <div className="tv-tip" ref={tipRef} role="tooltip" />
    </div>
  );
});

/* ───────────────────────── helpers ───────────────────────── */

/** TV-like opening frame: the last session(s) intraday, ~a year of dailies. */
function applyDefaultRange(chart: IChartApi, bars: Candle[], tf: string, intraday: boolean, range: RangeKey) {
  const n = bars.length;
  if (n < 2) return;
  const ts = chart.timeScale();
  if (intraday && range === 'ALL') { ts.fitContent(); return; }
  let from = Math.max(0, n - (DEFAULT_BARS[tf] ?? 150));
  if (intraday) {
    const keep = range === '1D' ? 1 : 5;
    const dates: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = etInfo(bars[i].time).date;
      if (dates[dates.length - 1] !== d) {
        if (dates.length === keep) { from = i + 1; break; }
        dates.push(d);
      }
      if (i === 0) from = 0;
    }
    // a thin session (early morning) still shows a readable window
    from = Math.min(from, Math.max(0, n - 40));
  }
  ts.setVisibleLogicalRange({ from: (from - 0.5) as Logical, to: (n - 1 + 8) as Logical });
}

function tickFmt(time: Time, type: TickMarkType): string {
  const d = new Date((time as number) * 1000);
  switch (type) {
    case TickMarkType.Year: return String(d.getUTCFullYear());
    case TickMarkType.Month: return MON[d.getUTCMonth()];
    case TickMarkType.DayOfMonth: return String(d.getUTCDate());
    case TickMarkType.Time: return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
    default: return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
}

function crossFmtDay(time: Time): string {
  const d = new Date((time as number) * 1000);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
}

function crossFmt(time: Time): string {
  const d = new Date((time as number) * 1000);
  const day = `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
  const hh = d.getUTCHours(); const mm = d.getUTCMinutes();
  return hh === 0 && mm === 0 ? day : `${day}  ${pad2(hh)}:${pad2(mm)}`;
}

/** Layer hover copy — shared by desktop hover and touch taps. */
export function describeLayerHit(hit: ReturnType<LayersPrimitive['hit']>, tk: { call: string; put: string; dp: string; pos: string; neg: string; mute: string }) {
  if (!hit) return null;
  if (hit.kind === 'flow') {
    const p = hit.p;
    return [
      { text: `${p.contract}`, bold: true, color: p.optionType === 'call' ? tk.call : tk.put },
      { text: `Premium ${fmtUsd(p.premium)}${p.contracts ? ` · ${p.contracts.toLocaleString()} cts` : ''} @ $${p.fillPrice}` },
      { text: `${p.alertNames.join(' · ')}` },
      { text: `${etClock(p.time)} ET · side not reported by feed`, color: tk.mute },
    ];
  }
  if (hit.kind === 'dp') {
    const l = hit.lvl;
    return [
      { text: `Dark pool ${l.price.toFixed(2)}`, bold: true, color: tk.dp },
      { text: `Notional ${fmtUsd(l.notional)} · ${l.prints} print${l.prints === 1 ? '' : 's'}` },
      { text: `Last ${shortDate(l.date)}${l.firstDate && l.firstDate !== l.date ? ` · first ${shortDate(l.firstDate)}` : ''}` },
      { text: 'Level, not direction', color: tk.mute },
    ];
  }
  if (hit.kind === 'orb') {
    return [
      { text: `GEX ${hit.strike.toFixed(2)}`, bold: true, color: hit.g >= 0 ? tk.pos : tk.neg },
      { text: `${fmtUsd(hit.g, true)} net gamma` },
      { text: `Sampled ${etClock(hit.t)} ET · ${hit.src}`, color: tk.mute },
    ];
  }
  return [
    { text: `GEX ${hit.strike.toFixed(2)}`, bold: true, color: hit.gex >= 0 ? tk.pos : tk.neg },
    { text: `${fmtUsd(hit.gex, true)} net gamma` },
    { text: `Snapshot ${etClock(hit.t)} ET`, color: tk.mute },
  ];
}
