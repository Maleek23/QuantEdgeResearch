/**
 * EPOCH CHART — the core of QuantEdge's charting system (POC).
 *
 * Render core: TradingView lightweight-charts v5 (GPU canvas, native UNIX-epoch
 * time axis). On top of it we add the thing off-the-shelf charts get wrong:
 *
 *   EPOCH-ANCHORED DRAWINGS. A trendline is stored as two absolute anchors
 *   { time: unix-seconds, price } — NOT bar indices. On every frame we re-project
 *   each anchor to pixels via timeScale().timeToCoordinate(time) and
 *   series.priceToCoordinate(price), then stroke a canvas overlay. Because the
 *   anchors are real-world time+price, the line stays pinned to the SAME point when
 *   you switch 1m → 1h, pan, or zoom. That's the "survives timeframe switches" spec.
 *
 * "Flash UI": keyboard TF switching (1–5), a live crosshair OHLC readout, minimal
 * chrome, terminal palette. Data is a per-TF candle map (swap the demo generator for
 * a real /api candle endpoint later — the epoch-anchoring is identical).
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type UTCTimestamp, type Logical } from 'lightweight-charts';
import { cn } from '@/lib/utils';

export interface Candle { time: number; open: number; high: number; low: number; close: number }
export interface Anchor { time: number; price: number }
export interface Trendline { id: string; a: Anchor; b: Anchor; color?: string; label?: string }

const TFS = [
  { id: '1m', label: '1m', sec: 60 },
  { id: '5m', label: '5m', sec: 300 },
  { id: '15m', label: '15m', sec: 900 },
  { id: '30m', label: '30m', sec: 1800 },
  { id: '1h', label: '1h', sec: 3600 },
] as const;
type TFId = typeof TFS[number]['id'];

/** Aggregate 1-minute candles into a coarser timeframe by epoch bucket. */
export function aggregate(base: Candle[], bucketSec: number): Candle[] {
  if (bucketSec <= 60) return base;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let bucketStart = -1;
  for (const c of base) {
    const b = Math.floor(c.time / bucketSec) * bucketSec;
    if (b !== bucketStart) {
      if (cur) out.push(cur);
      bucketStart = b;
      cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close };
    } else if (cur) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Convert an absolute epoch to a *fractional* logical index over the current bars,
 * interpolating between the two bracketing bars (and extrapolating past the edges by
 * the local bar spacing). This is what makes an epoch anchor resolve on ANY timeframe
 * — even when it falls between bars — where timeScale().timeToCoordinate(time) would
 * return null for a non-bar time. Feed the result to timeScale().logicalToCoordinate().
 */
function epochToLogical(bars: Candle[], epoch: number): number | null {
  const n = bars.length;
  if (n === 0) return null;
  if (n === 1) return 0;
  if (epoch <= bars[0].time) {
    const step = bars[1].time - bars[0].time || 1;
    return (epoch - bars[0].time) / step;
  }
  if (epoch >= bars[n - 1].time) {
    const step = bars[n - 1].time - bars[n - 2].time || 1;
    return n - 1 + (epoch - bars[n - 1].time) / step;
  }
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= epoch) lo = mid + 1; else hi = mid;
  }
  const i = lo - 1; // bars[i].time <= epoch < bars[i+1].time
  const span = bars[i + 1].time - bars[i].time || 1;
  return i + (epoch - bars[i].time) / span;
}

export function EpochChart({
  symbol = 'DEMO',
  base,
  trendlines = [],
  height = 420,
  className,
}: {
  symbol?: string;
  base: Candle[];              // 1-minute base series; other TFs aggregate from it
  trendlines?: Trendline[];
  height?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const dataRef = useRef<Candle[]>([]);
  const [tf, setTf] = useState<TFId>('5m');
  const [hover, setHover] = useState<Candle | null>(null);

  const data = useMemo(() => {
    const sec = TFS.find((t) => t.id === tf)!.sec;
    return aggregate(base, sec);
  }, [base, tf]);

  // ── draw the epoch-anchored overlay (runs every animation frame) ──
  const draw = useCallback(() => {
    const chart = chartRef.current, series = seriesRef.current;
    const cvs = overlayRef.current, wrap = wrapRef.current;
    if (!chart || !series || !cvs || !wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (cvs.width !== w * dpr || cvs.height !== h * dpr) {
      cvs.width = w * dpr; cvs.height = h * dpr;
      cvs.style.width = w + 'px'; cvs.style.height = h + 'px';
    }
    const ctx = cvs.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ts = chart.timeScale();
    const bars = dataRef.current;
    const xOf = (epoch: number) => {
      const lg = epochToLogical(bars, epoch);
      return lg == null ? null : ts.logicalToCoordinate(lg as Logical);
    };
    for (const ln of trendlines) {
      const x1 = xOf(ln.a.time);
      const y1 = series.priceToCoordinate(ln.a.price);
      const x2 = xOf(ln.b.time);
      const y2 = series.priceToCoordinate(ln.b.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      const color = ln.color ?? '#22d3ee';
      // line
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      // anchor dots
      for (const [x, y] of [[x1, y1], [x2, y2]] as const) {
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (ln.label) {
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = color;
        ctx.fillText(ln.label, x2 + 6, y2 - 6);
      }
    }
  }, [trendlines]);

  // ── init chart once ──
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const chart = createChart(wrap, {
      height,
      layout: { background: { color: 'transparent' }, textColor: 'rgba(230,237,243,.55)', fontFamily: 'ui-monospace, monospace' },
      grid: { vertLines: { color: 'rgba(255,255,255,.04)' }, horzLines: { color: 'rgba(255,255,255,.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,.08)', timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    chartRef.current = chart; seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) { setHover(null); return; }
      const d = param.seriesData.get(series) as any;
      if (d) setHover({ time: Number(param.time), open: d.open, high: d.high, low: d.low, close: d.close });
    });

    // keep overlay in sync every frame
    let raf = 0;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => { chart.applyOptions({ width: wrap.clientWidth, height }); });
    ro.observe(wrap);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [height, draw]);

  // ── push data on TF / data change; keep the visible range feel ──
  useEffect(() => {
    const series = seriesRef.current, chart = chartRef.current;
    if (!series || !chart) return;
    dataRef.current = data;
    series.setData(data.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })));
    chart.timeScale().fitContent();
  }, [data]);

  // keyboard TF switch (flash UI)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (i >= 0 && TFS[i]) setTf(TFS[i].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const last = data[data.length - 1];
  const readout = hover ?? last;

  return (
    <div className={cn('rounded-xl border border-card-border bg-card overflow-hidden', className)}>
      {/* flash-UI header: symbol + OHLC readout (left) · TF switcher (right) */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[12px] font-mono font-bold tracking-widest text-foreground">{symbol}</span>
          {readout && (
            <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70 truncate">
              O <b className="text-foreground/80">{readout.open?.toFixed(2)}</b>{'  '}
              H <b className="text-foreground/80">{readout.high?.toFixed(2)}</b>{'  '}
              L <b className="text-foreground/80">{readout.low?.toFixed(2)}</b>{'  '}
              C <b style={{ color: readout.close >= readout.open ? '#22c55e' : '#ef4444' }}>{readout.close?.toFixed(2)}</b>
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {TFS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTf(t.id)}
              title={`${t.label} · press ${i + 1}`}
              className={cn(
                'px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors',
                tf === t.id ? 'bg-foreground/10 text-[var(--brand-cyan,#22d3ee)]' : 'text-muted-foreground/55 hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* chart + epoch-anchored overlay */}
      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none z-10" />
      </div>
    </div>
  );
}
