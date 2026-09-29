/**
 * CHART ENGINE — the reference mock's canvas chart, shared.
 *
 * Extracted from chart-lab-nexus so NexusPriceChart and the Chart Lab page can
 * both use one engine without a circular import. Everything here is the mock's
 * drawing code plus the honesty layer: real OHLCV via useCandles, bad-tick
 * quarantine with counts, zone bands, level lines.
 */
import { useQuery } from '@tanstack/react-query';

/* ────────────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────────────── */

export interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
  /** Set by useCandles when a bad-tick wick was clamped on that side. */
  clampedLow?: boolean; clampedHigh?: boolean;
}
interface HistoryResponse { symbol: string; range: string; data: Candle[] }
export interface EHQuote { symbol: string; lastPrice: number; changePct: number }
export interface EHPayload { session?: string; gainers?: EHQuote[]; losers?: EHQuote[]; mostActive?: EHQuote[] }

/** TF → the feed's real range/interval pair. No 4h — the feed has no 4h bars. */
export const TF_CONFIG: Record<string, { range: string; interval: string; label: string; aggregateMinutes?: number }> = {
  '1m': { range: '5d', interval: '1m', label: '1M' },
  '5m': { range: '1mo', interval: '5m', label: '5M' },
  '15m': { range: '1mo', interval: '15m', label: '15M' },
  '30m': { range: '1mo', interval: '30m', label: '30M' },
  '1h': { range: '6mo', interval: '1h', label: '1H' },
  // Yahoo has no native 4h bar. Aggregate actual 1h OHLCV into exchange-time
  // four-hour buckets; this is measured resampling, not interpolation.
  '4h': { range: '2y', interval: '1h', aggregateMinutes: 240, label: '4H' },
  '1D': { range: '2y', interval: '1d', label: '1D' },
  '1W': { range: '10y', interval: '1wk', label: '1W' },
};
export const CANDLES_POLL_MS = 120_000;

/**
 * How far a wick may run past its own body before it is treated as a bad tick.
 * Measured live on SPY 5d/1h: three bars carried lows of 710/724/732 against a
 * median close of 765.75 with every neighbour at ~765 — provider corruption,
 * not trades. Deleting those bars would hide data; drawing them claims SPY
 * flash-crashed 7% in an hour. So the wick is CLAMPED to the tolerance and the
 * bar is COUNTED — the info overlay names how many, the same clip-and-say-so
 * treatment the gamma surface gives its robust-max ceiling. Tolerances widen
 * with the bar span because a 7% weekly wick can be a real crash week.
 */
const WICK_TOLERANCE: Record<string, number> = {
  '1m': 0.015, '5m': 0.02, '15m': 0.02, '30m': 0.025, '1h': 0.03, '4h': 0.05, '1D': 0.12, '1W': 0.2,
};

export interface CandleSeries { bars: Candle[]; clampedWicks: number }

/**
 * Render bounds for a candle after source-anomaly quarantine.
 *
 * A quarantined print must not set the scale and must never be stretched to a
 * plot boundary. Doing that made a hidden bad tick look like a real, dramatic
 * full-height candle. We retain the raw OHLC on the Candle for audit/tooltips,
 * but collapse only the suspect side to the observed candle body on screen.
 */
export function renderedCandleRange(candle: Candle): { high: number; low: number } {
  return {
    high: candle.clampedHigh ? Math.max(candle.open, candle.close) : candle.high,
    low: candle.clampedLow ? Math.min(candle.open, candle.close) : candle.low,
  };
}

export function aggregateCandles(bars: Candle[], minutes: number): Candle[] {
  const bucketMs = minutes * 60_000;
  const groups = new Map<number, Candle[]>();
  for (const bar of bars) {
    const bucket = Math.floor(bar.time / bucketMs) * bucketMs;
    const rows = groups.get(bucket);
    if (rows) rows.push(bar); else groups.set(bucket, [bar]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([time, rows]) => ({
    time,
    open: rows[0].open,
    high: Math.max(...rows.map((r) => r.high)),
    low: Math.min(...rows.map((r) => r.low)),
    close: rows[rows.length - 1].close,
    volume: rows.reduce((sum, r) => sum + r.volume, 0),
  }));
}

export function useCandles(symbol: string, tf: string) {
  const cfg = TF_CONFIG[tf];
  const tol = WICK_TOLERANCE[tf] ?? 0.05;
  return useQuery<CandleSeries>({
    queryKey: ['/api/historical-prices', symbol, cfg.range, cfg.interval, 'chartlab'],
    queryFn: async () => {
      const r = await fetch(`/api/historical-prices/${symbol}?range=${cfg.range}&interval=${cfg.interval}`, { credentials: 'include' });
      if (!r.ok) throw new Error('history failed');
      const body: HistoryResponse & { error?: string } = await r.json();
      let clampedWicks = 0;
      let bars = (body.data ?? []).filter((c) =>
        // Non-positive OHLC is not a price at all.
        [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0),
      ).map((c) => {
        // The feed's time is epoch SECONDS; the drawing code labels with Date(ms).
        return { ...c, time: c.time < 10_000_000_000 ? c.time * 1000 : c.time };
      });
      if (cfg.aggregateMinutes) bars = aggregateCandles(bars, cfg.aggregateMinutes);
      // Quarantine only isolated provider spikes. A large real candle is kept:
      // the body or either neighbour must also move. This avoids the old rule
      // that silently clipped every legitimate wick merely for exceeding a
      // fixed percentage of its own body.
      bars = bars.map((c, i, rows) => {
        if (i === 0 || i === rows.length - 1) return c;
        const prev = rows[i - 1]; const next = rows[i + 1];
        const local = [prev.close, c.open, c.close, next.open].sort((a, b) => a - b);
        const median = (local[1] + local[2]) / 2;
        const neighboursStable = Math.abs(prev.close / median - 1) < tol / 2
          && Math.abs(next.open / median - 1) < tol / 2
          && Math.abs(c.open / median - 1) < tol / 2
          && Math.abs(c.close / median - 1) < tol / 2;
        if (!neighboursStable) return c;
        const clampedLow = c.low < median * (1 - tol);
        const clampedHigh = c.high > median * (1 + tol);
        if (clampedLow) clampedWicks++;
        if (clampedHigh) clampedWicks++;
        return { ...c, clampedLow, clampedHigh };
      });
      if (bars.length < 2) throw new Error(body.error ?? 'history empty');
      return { bars, clampedWicks };
    },
    staleTime: 60_000,
    refetchInterval: CANDLES_POLL_MS,
    retry: 1,
  });
}

export interface Level {
  price: number;
  color: string;
  label: string;
  /** Dealer-positioning levels render as sized nodes, not generic trade lines. */
  kind?: 'execution' | 'gex-anchor' | 'gex-node';
  /** Relative node importance in the 0..1 range. */
  strength?: number;
  /** Optional compact context rendered beside a GEX node. */
  meta?: string;
}
export interface Zone { from: number; to: number; color?: string; label?: string }

/* ────────────────────────────────────────────────────────────────
   THE MOCK'S CHART ENGINE — drawChart/calcMA verbatim, parameterised on the
   things React owns (canvas el, data, options) instead of module globals.
   ──────────────────────────────────────────────────────────────── */

export function calcMA(data: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    result.push(sum / period);
  }
  return result;
}

export interface DrawOpts {
  type: 'candles' | 'line';
  tf: string;
  showCrosshair: boolean;
  showLevels: boolean;
  levels: Level[];
  /** Manual price-axis transform. scale > 1 shows more vertical range. */
  priceScale?: number;
  /** Vertical pan expressed as a fraction of the unscaled visible range. */
  priceShift?: number;
  /** Shaded price bands (e.g. unfilled gaps) drawn under the levels. */
  zones?: Zone[];
  mouseX: number;
  mouseY: number;
  /** A sibling chart's hovered candle time — draws a synced dashed cursor
   *  when the local mouse is outside this plot. */
  syncTime?: number | null;
  /** MA20/MA50 lines (default on). */
  showMA?: boolean;
  /** Volume pane (default on). */
  showVolume?: boolean;
  /** Layer hooks: `underlay` runs before the candles, `overlay` after them
   *  (before the crosshair). Both get the frame's geometry, clipped to the
   *  price plot. Used by the CHART tab's GEX / dark-pool / flow layers. */
  underlay?: (ctx: CanvasRenderingContext2D, geo: ChartGeometry) => void;
  overlay?: (ctx: CanvasRenderingContext2D, geo: ChartGeometry) => void;
  /** Unclipped pass after the live-price tag — price-axis tags. */
  axisOverlay?: (ctx: CanvasRenderingContext2D, geo: ChartGeometry) => void;
  onHover: (c: Candle | null, x: number, y: number) => void;
}

/** One frame's coordinate system — what overlays draw and hit-test with. */
export interface ChartGeometry {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  priceH: number;
  volTop: number;
  volumeH: number;
  candleW: number;
  min: number;
  max: number;
  candles: Candle[];
  /** Median spacing between bars, ms. */
  barMs: number;
  priceToY: (p: number) => number;
  yToPrice: (y: number) => number;
  /** Index of the bar containing time t (last bar with time <= t), or -1
   *  when t is outside the visible window. */
  indexAt: (t: number) => number;
  /** x of the bar containing t, or null outside the window. */
  timeToX: (t: number) => number | null;
}

function buildGeometry(
  w: number, h: number,
  padding: { top: number; right: number; left: number },
  priceH: number, volTop: number, volumeH: number,
  candleW: number, min: number, max: number, candles: Candle[],
): ChartGeometry {
  const range = max - min || 1;
  const gaps: number[] = [];
  for (let i = 1; i < candles.length; i++) gaps.push(candles[i].time - candles[i - 1].time);
  gaps.sort((a, b) => a - b);
  const barMs = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 60_000;
  const indexAt = (t: number) => {
    if (!candles.length || t < candles[0].time || t >= candles[candles.length - 1].time + barMs) return -1;
    let lo = 0; let hi = candles.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (candles[mid].time <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  };
  return {
    width: w, height: h, left: padding.left, top: padding.top, right: w - padding.right,
    priceH, volTop, volumeH, candleW, min, max, candles, barMs,
    priceToY: (p) => padding.top + ((max - p) / range) * priceH,
    yToPrice: (y) => max - ((y - padding.top) / priceH) * range,
    indexAt,
    timeToX: (t) => {
      const i = indexAt(t);
      return i < 0 ? null : padding.left + i * candleW + candleW / 2;
    },
  };
}

export function drawChart(chartCanvas: HTMLCanvasElement, candles: Candle[], opts: DrawOpts): ChartGeometry | null {
  const ctx = chartCanvas.getContext('2d');
  if (!ctx) return null;
  const rect = chartCanvas.getBoundingClientRect();
  const w = rect.width; const h = rect.height;
  chartCanvas.width = w * devicePixelRatio;
  chartCanvas.height = h * devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const padding = { top: 20, right: 70, bottom: 50, left: 14 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const volumeH = chartH * 0.18;
  const priceH = chartH - volumeH - 10;

  let min = Infinity; let max = -Infinity; let maxVol = 0;
  candles.forEach((c) => {
    // A quarantined side is a bad tick: it may not set the scale or appear as
    // a synthetic boundary-to-boundary wick.
    const { low: lo, high: hi } = renderedCandleRange(c);
    if (lo < min) min = lo;
    if (hi > max) max = hi;
    if (c.volume > maxVol) maxVol = c.volume;
  });
  const span = max - min || 1;
  min -= span * 0.05;
  max += span * 0.05;
  const naturalRange = max - min || 1;
  const priceScale = Math.max(0.2, Math.min(5, opts.priceScale ?? 1));
  const center = (min + max) / 2 + (opts.priceShift ?? 0) * naturalRange;
  min = center - naturalRange * priceScale / 2;
  max = center + naturalRange * priceScale / 2;
  const priceRange = max - min || 1;

  // Grid + price labels
  ctx.strokeStyle = 'rgba(59,140,255, 0.05)';
  ctx.lineWidth = 1;
  const gridLines = 6;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (priceH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    const price = max - (priceRange / gridLines) * i;
    ctx.fillStyle = 'rgba(139, 147, 163, 0.6)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(price.toFixed(2), w - padding.right + 8, y + 3);
  }

  // Time labels
  ctx.fillStyle = 'rgba(139, 147, 163, 0.5)';
  ctx.font = '9.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  const timeStep = Math.max(1, Math.floor(candles.length / 6));
  for (let i = 0; i < candles.length; i += timeStep) {
    const x = padding.left + (i / (candles.length - 1)) * chartW;
    const d = new Date(candles[i].time);
    const label = opts.tf === '1D' || opts.tf === '1W'
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    ctx.fillText(label, x, h - padding.bottom + 16);
  }

  // Shaded zones (gap bands etc.) under everything else
  for (const z of opts.zones ?? []) {
    const top = Math.max(z.from, z.to); const bot = Math.min(z.from, z.to);
    if (bot > max || top < min) continue;
    const y1 = padding.top + ((max - Math.min(top, max)) / priceRange) * priceH;
    const y2 = padding.top + ((max - Math.max(bot, min)) / priceRange) * priceH;
    ctx.fillStyle = (z.color ?? '#facc15') + '14';
    ctx.fillRect(padding.left, y1, chartW, Math.max(1, y2 - y1));
    if (z.label) {
      ctx.fillStyle = (z.color ?? '#facc15') + '99';
      ctx.font = '700 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(z.label, w - padding.right - 4, y1 + 9);
    }
  }

  // Published levels — the real ones, drawn the mock's way
  if (opts.showLevels) {
    opts.levels.forEach((lvl) => {
      if (lvl.price >= min && lvl.price <= max) {
        const y = padding.top + ((max - lvl.price) / priceRange) * priceH;
        const isNode = lvl.kind === 'gex-node' || lvl.kind === 'gex-anchor';
        const strength = Math.max(0, Math.min(1, lvl.strength ?? 0.45));
        ctx.strokeStyle = lvl.color + (isNode ? '55' : '40');
        ctx.lineWidth = isNode ? 0.8 + strength * 1.2 : 1;
        ctx.setLineDash(isNode ? [2, 5] : [4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = lvl.color;
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(lvl.label, padding.left + 4, y - 3);
        if (isNode) {
          const nodeX = w - padding.right - 10;
          const radius = 3 + strength * 4;
          ctx.save();
          ctx.shadowColor = lvl.color;
          ctx.shadowBlur = 5 + strength * 8;
          ctx.globalAlpha = 0.82;
          ctx.beginPath();
          ctx.arc(nodeX, y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (lvl.meta) {
            ctx.fillStyle = lvl.color + 'cc';
            ctx.font = '700 8px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(lvl.meta, nodeX - radius - 5, y + 3);
          }
        }
      }
    });
  }

  // Moving averages
  const showMA = opts.showMA !== false;
  const ma20 = calcMA(candles, 20);
  const ma50 = calcMA(candles, 50);
  const strokeMA = (ma: (number | null)[], style: string) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    ma.forEach((v, i) => {
      if (v === null) return;
      const x = padding.left + (i / (candles.length - 1)) * chartW;
      const y = padding.top + ((max - v) / priceRange) * priceH;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  if (showMA) {
    strokeMA(ma50, 'rgba(167, 139, 250, 0.6)');
    strokeMA(ma20, 'rgba(59,140,255, 0.7)');
  }

  // Volume bars
  const volTop = padding.top + priceH + 10;
  const candleW = chartW / candles.length;
  const geo = buildGeometry(w, h, padding, priceH, volTop, volumeH, candleW, min, max, candles);
  const clipped = (fn: (ctx: CanvasRenderingContext2D, geo: ChartGeometry) => void) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, padding.top, chartW, priceH);
    ctx.clip();
    try { fn(ctx, geo); } finally { ctx.restore(); }
  };
  if (opts.showVolume !== false) candles.forEach((c, i) => {
    const x = padding.left + i * candleW;
    const barH = maxVol > 0 ? (c.volume / maxVol) * volumeH : 0;
    ctx.fillStyle = c.close >= c.open ? 'rgba(110,231,183, 0.25)' : 'rgba(255,107,61, 0.25)';
    ctx.fillRect(x + candleW * 0.15, volTop + volumeH - barH, candleW * 0.7, barH);
  });

  // Hovered candle detection
  let hoveredIdx = -1;
  const inPlot = opts.showCrosshair
    && opts.mouseX > padding.left && opts.mouseX < w - padding.right
    && opts.mouseY > padding.top && opts.mouseY < padding.top + priceH;
  if (inPlot) {
    const idx = Math.floor((opts.mouseX - padding.left) / candleW);
    if (idx >= 0 && idx < candles.length) hoveredIdx = idx;
  }

  // Synced cursor from a sibling chart (cockpit crosshair sync): when the
  // local mouse is elsewhere, mark the sibling's hovered TIME on this chart's
  // own axis — nearest candle, dashed, unobtrusive.
  if (!inPlot && opts.syncTime != null && candles.length > 1) {
    let best = -1; let bestD = Infinity;
    for (let i = 0; i < candles.length; i++) {
      const d = Math.abs(candles[i].time - opts.syncTime);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      const sx = padding.left + best * candleW + candleW / 2;
      ctx.strokeStyle = 'rgba(110,231,219,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(sx, padding.top); ctx.lineTo(sx, padding.top + priceH); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (opts.underlay) clipped(opts.underlay);

  // Candles or line
  if (opts.type === 'candles') {
    candles.forEach((c, i) => {
      const x = padding.left + i * candleW;
      const cx = x + candleW / 2;
      const isUp = c.close >= c.open;
      const color = isUp ? '#6ee7b7' : '#ff6b3d';
      const openY = padding.top + ((max - c.open) / priceRange) * priceH;
      const closeY = padding.top + ((max - c.close) / priceRange) * priceH;
      const rendered = renderedCandleRange(c);
      const highY = padding.top + ((max - rendered.high) / priceRange) * priceH;
      const lowY = padding.top + ((max - rendered.low) / priceRange) * priceH;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, highY);
      ctx.lineTo(cx, lowY);
      ctx.stroke();
      const bodyTop = Math.min(openY, closeY);
      const bodyH = Math.max(Math.abs(closeY - openY), 1);
      const bodyW = candleW * 0.7;
      ctx.fillStyle = color;
      ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);
      if (i === hoveredIdx) {
        ctx.fillStyle = color + '30';
        ctx.fillRect(x, padding.top, candleW, priceH + volumeH + 10);
      }
    });
  } else {
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + priceH);
    grad.addColorStop(0, 'rgba(59,140,255, 0.25)');
    grad.addColorStop(1, 'rgba(59,140,255, 0)');
    ctx.beginPath();
    candles.forEach((c, i) => {
      const x = padding.left + (i / (candles.length - 1)) * chartW;
      const y = padding.top + ((max - c.close) / priceRange) * priceH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + chartW, padding.top + priceH);
    ctx.lineTo(padding.left, padding.top + priceH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    candles.forEach((c, i) => {
      const x = padding.left + (i / (candles.length - 1)) * chartW;
      const y = padding.top + ((max - c.close) / priceRange) * priceH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#3b8cff';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#3b8cff';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (opts.overlay) clipped(opts.overlay);

  // Current price line + tag
  const lastCandle = candles[candles.length - 1];
  const lastY = padding.top + ((max - lastCandle.close) / priceRange) * priceH;
  ctx.strokeStyle = 'rgba(59,140,255, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(padding.left, lastY);
  ctx.lineTo(w - padding.right, lastY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#3b8cff';
  ctx.fillRect(w - padding.right, lastY - 9, 60, 18);
  ctx.fillStyle = '#031917';
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(lastCandle.close.toFixed(2), w - padding.right + 6, lastY + 3);
  if (opts.axisOverlay) { ctx.save(); try { opts.axisOverlay(ctx, geo); } finally { ctx.restore(); } }

  // Crosshair
  if (inPlot) {
    ctx.strokeStyle = 'rgba(59,140,255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(opts.mouseX, padding.top);
    ctx.lineTo(opts.mouseX, padding.top + priceH + volumeH + 10);
    ctx.moveTo(padding.left, opts.mouseY);
    ctx.lineTo(w - padding.right, opts.mouseY);
    ctx.stroke();
    ctx.setLineDash([]);
    const cursorPrice = max - ((opts.mouseY - padding.top) / priceH) * priceRange;
    ctx.fillStyle = 'rgba(14,17,23,0.9)';
    ctx.fillRect(w - padding.right, opts.mouseY - 9, 60, 18);
    ctx.strokeStyle = 'rgba(59,140,255, 0.5)';
    ctx.strokeRect(w - padding.right, opts.mouseY - 9, 60, 18);
    ctx.fillStyle = '#e8ecf3';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(cursorPrice.toFixed(2), w - padding.right + 6, opts.mouseY + 3);
    if (hoveredIdx >= 0) opts.onHover(candles[hoveredIdx], opts.mouseX, opts.mouseY);
    else opts.onHover(null, 0, 0);
  } else {
    opts.onHover(null, 0, 0);
  }
  return geo;
}
