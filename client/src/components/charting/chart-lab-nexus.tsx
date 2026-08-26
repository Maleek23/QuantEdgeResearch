/**
 * CHART LAB — the second reference mock, wired.
 *
 * The mock's DOM and canvas engine are used as authored: the same drawChart —
 * grid, price/time axes, MA20/50, volume bars, candles/line toggle, published
 * levels, live price tag, crosshair with OHLCV tooltip — with refs instead of
 * ids. What is replaced is the only thing that had to be:
 *
 *   generateCandles()        →  /api/historical-prices/:symbol (real OHLCV)
 *   fake pivot R3…S2 levels  →  the PUBLISHED signal's STOP/ENTRY/T1 from
 *                               /api/convictions — the mock's own copy says
 *                               "published QuantEdge levels", and its badge
 *                               already anticipates "no published signal"
 *   the 2s candle jitter     →  does not run; the series refetches on a real
 *                               poll and the "next poll" readouts count to it
 *   fake watchlist + sparks  →  /api/watchlist + real 5d closes
 *
 * The mock's 4h button does not ship: the price feed has no 4h interval, and a
 * missing timeframe is honest where a resampled-looking fake is not. Every
 * other TF maps to a measured range/interval pair (bar counts probed live:
 * 1m=780 · 5m=379 · 15m=127 · 1h=86 · 1D=64 · 1W=55).
 *
 * Chrome (topbar/tape/bottombar) belongs to the terminal shell — this renders
 * the mock's main area only, exactly like NexusBoard.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStockContext } from '@/contexts/stock-context';
import { usePriceHistory } from '@/components/hunt/cockpit/use-price-history';
import type { ConvictionPick, ConvictionsResponse } from '@/lib/convictions';
import '@/styles/nexus.css';

/* ────────────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────────────── */

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
interface HistoryResponse { symbol: string; range: string; data: Candle[] }
interface EHQuote { symbol: string; lastPrice: number; changePct: number }
interface EHPayload { session?: string; gainers?: EHQuote[]; losers?: EHQuote[]; mostActive?: EHQuote[] }

/** TF → the feed's real range/interval pair. No 4h — the feed has no 4h bars. */
const TF_CONFIG: Record<string, { range: string; interval: string; label: string }> = {
  '1m': { range: '1d', interval: '1m', label: '1M' },
  '5m': { range: '1d', interval: '5m', label: '5M' },
  '15m': { range: '1d', interval: '15m', label: '15M' },
  '1h': { range: '5d', interval: '1h', label: '1H' },
  '1D': { range: '3mo', interval: '1d', label: '1D' },
  '1W': { range: '1y', interval: '1wk', label: '1W' },
};
const CANDLES_POLL_MS = 120_000;

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
  '1m': 0.015, '5m': 0.02, '15m': 0.02, '1h': 0.025, '1D': 0.08, '1W': 0.15,
};

interface CandleSeries { bars: Candle[]; clampedWicks: number }

function useCandles(symbol: string, tf: string) {
  const cfg = TF_CONFIG[tf];
  const tol = WICK_TOLERANCE[tf] ?? 0.05;
  return useQuery<CandleSeries>({
    queryKey: ['/api/historical-prices', symbol, cfg.range, cfg.interval, 'chartlab'],
    queryFn: async () => {
      const r = await fetch(`/api/historical-prices/${symbol}?range=${cfg.range}&interval=${cfg.interval}`, { credentials: 'include' });
      if (!r.ok) throw new Error('history failed');
      const body: HistoryResponse & { error?: string } = await r.json();
      let clampedWicks = 0;
      const bars = (body.data ?? []).filter((c) =>
        // Non-positive OHLC is not a price at all.
        [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0),
      ).map((c) => {
        const bodyLo = Math.min(c.open, c.close);
        const bodyHi = Math.max(c.open, c.close);
        let { low, high } = c;
        if (low < bodyLo * (1 - tol)) { low = bodyLo * (1 - tol); clampedWicks++; }
        if (high > bodyHi * (1 + tol)) { high = bodyHi * (1 + tol); clampedWicks++; }
        // The feed's time is epoch SECONDS; the drawing code labels with Date(ms).
        return { ...c, low, high, time: c.time * 1000 };
      });
      if (bars.length < 2) throw new Error(body.error ?? 'history empty');
      return { bars, clampedWicks };
    },
    staleTime: 60_000,
    refetchInterval: CANDLES_POLL_MS,
    retry: 1,
  });
}

interface Level { price: number; color: string; label: string }

/* ────────────────────────────────────────────────────────────────
   THE MOCK'S CHART ENGINE — drawChart/calcMA verbatim, parameterised on the
   things React owns (canvas el, data, options) instead of module globals.
   ──────────────────────────────────────────────────────────────── */

function calcMA(data: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    result.push(sum / period);
  }
  return result;
}

interface DrawOpts {
  type: 'candles' | 'line';
  tf: string;
  showCrosshair: boolean;
  showLevels: boolean;
  levels: Level[];
  mouseX: number;
  mouseY: number;
  onHover: (c: Candle | null, x: number, y: number) => void;
}

function drawChart(chartCanvas: HTMLCanvasElement, candles: Candle[], opts: DrawOpts) {
  const ctx = chartCanvas.getContext('2d');
  if (!ctx) return;
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
    if (c.low < min) min = c.low;
    if (c.high > max) max = c.high;
    if (c.volume > maxVol) maxVol = c.volume;
  });
  const span = max - min;
  min -= span * 0.05;
  max += span * 0.05;
  const priceRange = max - min || 1;

  // Grid + price labels
  ctx.strokeStyle = 'rgba(79, 209, 197, 0.05)';
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

  // Published levels — the real ones, drawn the mock's way
  if (opts.showLevels) {
    opts.levels.forEach((lvl) => {
      if (lvl.price >= min && lvl.price <= max) {
        const y = padding.top + ((max - lvl.price) / priceRange) * priceH;
        ctx.strokeStyle = lvl.color + '40';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = lvl.color;
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(lvl.label, padding.left + 4, y - 3);
      }
    });
  }

  // Moving averages
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
  strokeMA(ma50, 'rgba(167, 139, 250, 0.6)');
  strokeMA(ma20, 'rgba(79, 209, 197, 0.7)');

  // Volume bars
  const volTop = padding.top + priceH + 10;
  const candleW = chartW / candles.length;
  candles.forEach((c, i) => {
    const x = padding.left + i * candleW;
    const barH = maxVol > 0 ? (c.volume / maxVol) * volumeH : 0;
    ctx.fillStyle = c.close >= c.open ? 'rgba(61, 220, 151, 0.25)' : 'rgba(255, 84, 112, 0.25)';
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

  // Candles or line
  if (opts.type === 'candles') {
    candles.forEach((c, i) => {
      const x = padding.left + i * candleW;
      const cx = x + candleW / 2;
      const isUp = c.close >= c.open;
      const color = isUp ? '#3ddc97' : '#ff5470';
      const openY = padding.top + ((max - c.open) / priceRange) * priceH;
      const closeY = padding.top + ((max - c.close) / priceRange) * priceH;
      const highY = padding.top + ((max - c.high) / priceRange) * priceH;
      const lowY = padding.top + ((max - c.low) / priceRange) * priceH;
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
    grad.addColorStop(0, 'rgba(79, 209, 197, 0.25)');
    grad.addColorStop(1, 'rgba(79, 209, 197, 0)');
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
    ctx.strokeStyle = '#4fd1c5';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#4fd1c5';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Current price line + tag
  const lastCandle = candles[candles.length - 1];
  const lastY = padding.top + ((max - lastCandle.close) / priceRange) * priceH;
  ctx.strokeStyle = 'rgba(79, 209, 197, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(padding.left, lastY);
  ctx.lineTo(w - padding.right, lastY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#4fd1c5';
  ctx.fillRect(w - padding.right, lastY - 9, 60, 18);
  ctx.fillStyle = '#031917';
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(lastCandle.close.toFixed(2), w - padding.right + 6, lastY + 3);

  // Crosshair
  if (inPlot) {
    ctx.strokeStyle = 'rgba(79, 209, 197, 0.3)';
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
    ctx.strokeStyle = 'rgba(79, 209, 197, 0.5)';
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
}

/* ────────────────────────────────────────────────────────────────
   Watch spark — the mock's drawSpark shape on real 5d closes.
   ──────────────────────────────────────────────────────────────── */
function WatchSpark({ symbol, up }: { symbol: string; up: boolean }) {
  const { points } = usePriceHistory(symbol, '5d', '1d');
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || points.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = devicePixelRatio;
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const pts = points.map((p) => p.close);
    const min = Math.min(...pts); const max = Math.max(...pts);
    const range = max - min || 1;
    const color = up ? '#3ddc97' : '#ff5470';
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((pt - min) / range) * h * 0.8 - h * 0.1;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((pt - min) / range) * h * 0.8 - h * 0.1;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.stroke();
  }, [points, up]);
  return <canvas ref={ref} className="watch-spark" />;
}

/* ────────────────────────────────────────────────────────────────
   BOARD
   ──────────────────────────────────────────────────────────────── */

const q = (path: string) => async () => {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} failed`);
  return r.json();
};

const DEFAULT_INSTRUMENTS = ['SPY', 'QQQ', 'IWM', 'SMH', 'XBI'];

export function ChartLabBoard() {
  const { currentStock, setCurrentStock } = useStockContext();
  const symbol = currentStock?.symbol?.toUpperCase() || 'SPY';

  const [tf, setTf] = useState<keyof typeof TF_CONFIG>('1h');
  const [type, setType] = useState<'candles' | 'line'>('candles');
  const [showCrosshair, setShowCrosshair] = useState(true);
  const [showLevels, setShowLevels] = useState(true);
  const [instrumentOpen, setInstrumentOpen] = useState(false);

  const { data: series, isLoading, isError, dataUpdatedAt } = useCandles(symbol, tf);
  const candles = series?.bars;

  const { data: convictions } = useQuery<ConvictionsResponse>({
    queryKey: ['/api/convictions', 'chart-lab'],
    queryFn: q('/api/convictions?limit=100&minScore=0'),
    staleTime: 60_000,
    retry: 1,
  });
  const pick = useMemo(
    () => convictions?.picks?.find((c: ConvictionPick) => c.symbol.toUpperCase() === symbol),
    [convictions, symbol],
  );
  // The real published levels — the mock's fake pivot ladder does not ship.
  const levels: Level[] = useMemo(() => (pick ? [
    { price: pick.targetPrice, color: '#3ddc97', label: 'T1' },
    { price: pick.entryPrice, color: '#4fd1c5', label: 'ENTRY' },
    { price: pick.stopLoss, color: '#ff5470', label: 'STOP' },
  ].filter((l) => Number.isFinite(l.price)) : []), [pick]);

  const { data: extended } = useQuery<EHPayload>({
    queryKey: ['/api/extended-hours', 'oracle-tape'],
    queryFn: q('/api/extended-hours'),
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });
  const { data: realtime } = useQuery<{ prices?: { crypto?: Record<string, { price: number }> } }>({
    queryKey: ['/api/realtime-status', 'nexus'],
    queryFn: q('/api/realtime-status'),
    refetchInterval: 5_000, staleTime: 4_000, retry: 1,
  });
  const { data: watchlist } = useQuery<{ symbol: string }[]>({
    queryKey: ['/api/watchlist'], refetchInterval: 120_000, retry: 1,
  });
  const { data: pulse } = useQuery<{ macro?: { vix?: number } }>({
    queryKey: ['market-pulse'],
    queryFn: q('/api/market-pulse'),
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });
  const { data: botStatus } = useQuery<{ bots: { name: string; status: string }[] }>({
    queryKey: ['/api/automations/status'], refetchInterval: 60_000, retry: 1,
  });

  const quoteBySym = useMemo(() => {
    const m = new Map<string, EHQuote>();
    for (const list of [extended?.mostActive, extended?.gainers, extended?.losers]) {
      for (const t of list ?? []) if (!m.has(t.symbol) && Number.isFinite(t.changePct)) m.set(t.symbol, t);
    }
    return m;
  }, [extended]);

  /* clock / uptime / next-poll — all real */
  const [now, setNow] = useState(() => Date.now());
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = new Date(now).toTimeString().slice(0, 8);
  const upSec = Math.floor((now - mountedAt.current) / 1000);
  const uptime = `${pad(Math.floor(upSec / 3600))}:${pad(Math.floor((upSec % 3600) / 60))}:${pad(upSec % 60)}`;
  const nextPoll = dataUpdatedAt ? Math.max(0, Math.ceil((dataUpdatedAt + CANDLES_POLL_MS - now) / 1000)) : null;

  /* canvas + interactions — the mock's, through refs */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -1, y: -1 });
  const [ohlc, setOhlc] = useState<Candle | null>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !candles || candles.length < 2) return;
    drawChart(canvas, candles, {
      type, tf, showCrosshair, showLevels, levels,
      mouseX: mouse.current.x,
      mouseY: mouse.current.y,
      onHover: (c, x, y) => {
        const tip = tipRef.current;
        const wrap = wrapRef.current;
        if (!tip || !wrap) return;
        if (!c) {
          tip.classList.remove('show');
          setOhlc(candles[candles.length - 1]);
          return;
        }
        setOhlc(c);
        const d = new Date(c.time);
        tip.querySelector('[data-tip=time]')!.textContent = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
        tip.querySelector('[data-tip=o]')!.textContent = c.open.toFixed(2);
        tip.querySelector('[data-tip=h]')!.textContent = c.high.toFixed(2);
        tip.querySelector('[data-tip=l]')!.textContent = c.low.toFixed(2);
        const tc = tip.querySelector('[data-tip=c]') as HTMLElement;
        tc.textContent = c.close.toFixed(2);
        tc.className = 'v ' + (c.close >= c.open ? 'up' : 'down');
        tip.querySelector('[data-tip=v]')!.textContent = c.volume > 0 ? (c.volume / 1e6).toFixed(2) + 'M' : '—';
        const rect = wrap.getBoundingClientRect();
        let tx = x + 16; let ty = y - 60;
        if (tx + 180 > rect.width) tx = x - 180;
        if (ty < 10) ty = y + 16;
        tip.style.left = tx + 'px';
        tip.style.top = ty + 'px';
        tip.classList.add('show');
      },
    });
  };

  useEffect(() => {
    redraw();
    if (candles?.length) setOhlc(candles[candles.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, type, tf, showCrosshair, showLevels, levels]);
  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, type, tf, showCrosshair, showLevels, levels]);

  const instruments = useMemo(() => {
    const set = new Set<string>([symbol, ...DEFAULT_INSTRUMENTS, ...(watchlist ?? []).map((w) => w.symbol)]);
    return [...set];
  }, [watchlist, symbol]);

  const spyQ = quoteBySym.get('SPY');
  const btc = realtime?.prices?.crypto?.BTC;
  const vix = pulse?.macro?.vix;
  const runningBots = botStatus?.bots?.filter((b) => b.status === 'running').length;
  const bullish = pick && pick.direction !== 'short';
  const isUp = ohlc ? ohlc.close >= ohlc.open : true;

  /* Sidebar level bars: width = the level's real position inside the span the
     published levels cover. The mock's widths were hardcoded ranks. */
  const levelRows = useMemo(() => {
    if (!levels.length) return [];
    const prices = levels.map((l) => l.price);
    const lo = Math.min(...prices); const hi = Math.max(...prices);
    const span = hi - lo || 1;
    return [...levels].sort((a, b) => b.price - a.price).map((l) => ({
      ...l,
      widthPct: 20 + ((l.price - lo) / span) * 75,
      kind: l.label === 'STOP' ? 'resist' : 'support',
    }));
  }, [levels]);

  const watchSyms = (watchlist ?? []).slice(0, 10);

  return (
    <div className="chartlab">
      <div className="main">
        {/* ══════════ CHART AREA ══════════ */}
        <div className="chart-area">
          <div className="chart-header">
            <div className="chart-eyebrow">Price intelligence</div>
            <div className="chart-title-row">
              <div className="chart-title">Chart Lab · {symbol}</div>
              <div className={`chart-badge${pick ? ' has-signal' : ''}`}>
                <span className="dot" />
                {pick
                  ? `${pick.convictionBand} · ${pick.convictionScore > 0 ? '+' : ''}${pick.convictionScore} evidence`
                  : 'no published signal'}
              </div>
            </div>
            <div className="chart-desc">One chart, every timeframe, with published QuantEdge levels anchored to the same ticker used across Oracle, Flow and GEX.</div>
          </div>

          <div className="instrument-bar">
            <div className="instrument-label">Instrument</div>
            <div className="instrument-selector" onClick={() => setInstrumentOpen((o) => !o)}>
              <span className="instrument-sym">{symbol}</span>
              <svg className="instrument-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: instrumentOpen ? 'rotate(180deg)' : undefined }}><path d="M6 9l6 6 6-6" /></svg>
              {instrumentOpen && (
                <div className="instrument-menu" onClick={(e) => e.stopPropagation()}>
                  {instruments.map((sym) => (
                    <button key={sym} onClick={() => { setCurrentStock({ symbol: sym }); setInstrumentOpen(false); }}>
                      <span>{sym}</span>
                      {quoteBySym.get(sym) && (
                        <span style={{ color: quoteBySym.get(sym)!.changePct >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 10 }}>
                          {quoteBySym.get(sym)!.changePct >= 0 ? '+' : ''}{quoteBySym.get(sym)!.changePct.toFixed(1)}%
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="chart-type-toggle">
              {(['candles', 'line'] as const).map((t) => (
                <button key={t} className={`chart-type-btn${type === t ? ' active' : ''}`} onClick={() => setType(t)}>{t}</button>
              ))}
            </div>
            {extended?.session && extended.session !== 'regular' && (
              <div className="ext-hours">{extended.session === 'closed' ? 'last close' : 'ext hours'}</div>
            )}

            <div className="ohlc">
              <div className="ohlc-item"><span className="ohlc-label">O</span><span className="ohlc-val">{ohlc ? ohlc.open.toFixed(2) : '—'}</span></div>
              <div className="ohlc-item"><span className="ohlc-label">H</span><span className="ohlc-val up">{ohlc ? ohlc.high.toFixed(2) : '—'}</span></div>
              <div className="ohlc-item"><span className="ohlc-label">L</span><span className="ohlc-val down">{ohlc ? ohlc.low.toFixed(2) : '—'}</span></div>
              <div className="ohlc-item"><span className="ohlc-label">C</span><span className={`ohlc-val ${isUp ? 'up' : 'down'}`}>{ohlc ? ohlc.close.toFixed(2) : '—'}</span></div>
            </div>
          </div>

          <div className="chart-canvas-wrap" ref={wrapRef}>
            {isLoading ? (
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
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                  redraw();
                }}
                onMouseLeave={() => { mouse.current = { x: -1, y: -1 }; redraw(); }}
              />
            )}

            <div className="timeframe-bar">
              {(Object.keys(TF_CONFIG) as (keyof typeof TF_CONFIG)[]).map((k) => (
                <button key={k} className={`tf-btn${tf === k ? ' active' : ''}`} onClick={() => setTf(k)}>{k}</button>
              ))}
            </div>

            <div className="chart-controls">
              <button className={`chart-ctrl${showCrosshair ? ' active' : ''}`} title="Crosshair" onClick={() => setShowCrosshair((v) => !v)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20" /></svg>
              </button>
              <button className={`chart-ctrl${showLevels ? ' active' : ''}`} title="Published levels" onClick={() => setShowLevels((v) => !v)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
              </button>
              <button className="chart-ctrl" title="Fullscreen" onClick={() => {
                const el = wrapRef.current;
                if (!el) return;
                if (document.fullscreenElement) document.exitFullscreen();
                else el.requestFullscreen?.();
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
              </button>
            </div>

            <div className="chart-info-overlay">
              <span>CHART <b>engaged</b></span>
              <span>TF <b>{TF_CONFIG[tf].label}</b></span>
              <span>BARS <b>{candles?.length ?? 0}</b></span>
              <span>MA <b>20 · 50</b></span>
              {(series?.clampedWicks ?? 0) > 0 && (
                <span style={{ color: 'var(--amber)' }}>{series!.clampedWicks} OUTLIER WICK{series!.clampedWicks === 1 ? '' : 'S'} <b style={{ color: 'var(--amber)' }}>CLAMPED</b></span>
              )}
            </div>

            <div className="crosshair-tip" ref={tipRef}>
              <div className="row"><span className="k">Time</span><span className="v" data-tip="time">—</span></div>
              <div className="row"><span className="k">Open</span><span className="v" data-tip="o">—</span></div>
              <div className="row"><span className="k">High</span><span className="v" data-tip="h">—</span></div>
              <div className="row"><span className="k">Low</span><span className="v" data-tip="l">—</span></div>
              <div className="row"><span className="k">Close</span><span className="v" data-tip="c">—</span></div>
              <div className="row"><span className="k">Volume</span><span className="v" data-tip="v">—</span></div>
            </div>
          </div>
        </div>

        {/* ══════════ RIGHT SIDEBAR ══════════ */}
        <div className="sidebar">
          <div className="sec-head">
            <div className="sec-num">Chart Lab</div>
            <div className="sec-title">Price intelligence.</div>
            <div className="sec-sub">One chart, every timeframe. QuantEdge levels anchored across Oracle, Flow and GEX.</div>
            <div className="sec-meta">
              <span className="tag cyan">CHART</span>
              <span className="tag live"><span className="dot" />engaged</span>
            </div>
          </div>

          <div className="summary">
            <div className="summary-grid">
              <div className="summary-card">
                <div className="summary-label">Last close · SPY</div>
                {spyQ ? (
                  <>
                    <div className={`summary-val ${spyQ.changePct >= 0 ? 'up' : 'down'}`}>{spyQ.lastPrice.toFixed(2)}</div>
                    <div className="summary-sub" style={{ color: spyQ.changePct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {spyQ.changePct >= 0 ? '+' : ''}{spyQ.changePct.toFixed(2)}%
                    </div>
                  </>
                ) : (
                  <div className="summary-val" style={{ color: 'var(--text-mute)' }}>—</div>
                )}
              </div>
              <div className="summary-card">
                <div className="summary-label">BTC · live</div>
                {btc ? (
                  <>
                    <div className="summary-val">${Math.round(btc.price).toLocaleString()}</div>
                    <div className="summary-sub">realtime stream</div>
                  </>
                ) : (
                  <div className="summary-val" style={{ color: 'var(--text-mute)' }}>—</div>
                )}
              </div>
              <div className="summary-card">
                <div className="summary-label">Next poll</div>
                <div className="summary-val">{nextPoll != null ? `${nextPoll}s` : '—'}</div>
                <div className="summary-sub">candle refetch</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Local time</div>
                <div className="summary-val">{clock}</div>
                <div className="summary-sub">wall clock</div>
              </div>
            </div>
          </div>

          <div className="levels-section">
            <div className="levels-head">
              <div className="levels-title">QuantEdge Levels</div>
              <div style={{ fontSize: 9.5, color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace" }}>{symbol}</div>
            </div>
            {levelRows.length ? levelRows.map((l) => (
              <div className="level-row" key={l.label}>
                <div className="level-name" style={l.label === 'ENTRY' ? { color: 'var(--cyan-bright)' } : undefined}>{l.label}</div>
                <div className="level-bar"><div className={`level-bar-fill ${l.kind}`} style={{ width: `${l.widthPct}%` }} /></div>
                <div className="level-val" style={{ color: l.color }}>{l.price.toFixed(2)}</div>
              </div>
            )) : (
              <div style={{ fontSize: 11, color: 'var(--text-mute)', fontFamily: "'JetBrains Mono',monospace", padding: '4px 0' }}>
                {/* Absence, stated — the mock's pivot ladder was invented numbers. */}
                no published signal for {symbol} — levels appear when the book carries one
              </div>
            )}
            {pick && (
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-dim)', fontFamily: "'JetBrains Mono',monospace" }}>
                {bullish ? '▲ LONG' : '▼ SHORT'} · R:R {pick.riskRewardRatio ? `${pick.riskRewardRatio.toFixed(1)}:1` : '—'}
              </div>
            )}
          </div>

          <div className="watch-section">
            <div className="watch-head">
              <div className="watch-title">Watchlist</div>
              <div className="watch-count">{watchSyms.length ? `${watchSyms.length} names` : ''}</div>
            </div>
            <div>
              {watchSyms.map(({ symbol: sym }) => {
                const wq = quoteBySym.get(sym);
                const up = wq != null && wq.changePct >= 0;
                return (
                  <div
                    className={`watch-item${sym === symbol ? ' active' : ''}`}
                    key={sym}
                    onClick={() => setCurrentStock({ symbol: sym })}
                  >
                    <div className="watch-sym">{sym}</div>
                    <div className="watch-name" />
                    <WatchSpark symbol={sym} up={wq ? up : true} />
                    {wq
                      ? <div className={`watch-chg ${up ? 'up' : 'down'}`}>{up ? '+' : ''}{wq.changePct.toFixed(1)}%</div>
                      : <div className="watch-chg" style={{ color: 'var(--text-mute)' }}>—</div>}
                  </div>
                );
              })}
              {!watchSyms.length && (
                <div style={{ fontSize: 11, color: 'var(--text-mute)', padding: '4px 0' }}>
                  No names on the watchlist yet.
                </div>
              )}
            </div>
          </div>

          <div className="sys-status">
            <div className="sys-row"><span className="k">Uptime</span><span className="v">{uptime}</span></div>
            <div className="sys-row"><span className="k">Bots</span><span className="v">{runningBots ?? '—'}</span></div>
            <div className="sys-row"><span className="k">Watchlist</span><span className="v">{watchlist?.length ?? '—'}</span></div>
            <div className="sys-row"><span className="k">VIX</span><span className={`v${vix != null && vix >= 20 ? ' warn' : ''}`}>{vix != null ? vix.toFixed(1) : '—'}</span></div>
          </div>

          <div className="disclaimer">
            Educational only · not investment advice.<br />
            Past performance does not guarantee future results.
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChartLabBoard;
