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
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createChart, CandlestickSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { cn } from '@/lib/utils';

export interface Candle { time: number; open: number; high: number; low: number; close: number }
export interface Anchor { time: number; price: number }
export interface Trendline { id: string; a: Anchor; b: Anchor; color?: string; label?: string }
export interface PriceLevel { price: number; color?: string; label?: string; dashed?: boolean }

// Each timeframe carries both the aggregation bucket (demo/base mode) AND the
// Yahoo (interval, range) pair used to fetch real candles for any ticker (symbol mode).
const TFS = [
  { id: '5m',  label: '5m',  sec: 300,   yInterval: '5m',  yRange: '5d' },
  { id: '15m', label: '15m', sec: 900,   yInterval: '15m', yRange: '5d' },
  { id: '1h',  label: '1h',  sec: 3600,  yInterval: '1h',  yRange: '1mo' },
  { id: '1D',  label: '1D',  sec: 86400, yInterval: '1d',  yRange: '1y' },
] as const;
type TFId = typeof TFS[number]['id'];

/**
 * Is this bar outside the US regular session (09:30–16:00 ET)?
 *
 * Extended-hours bars behave differently — thin liquidity, wider spreads, gaps that fill
 * on the open — so reading them as if they were regular-session prints is misleading.
 * We already request them (includePrePost), we just never distinguished them. Shading is
 * essentially free because the overlay canvas is already drawn every frame.
 *
 * ET offset is derived from the browser's own timezone database, so DST is handled.
 */
export function isExtendedHours(epochSec: number): boolean {
  const d = new Date(epochSec * 1000);
  const et = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => et.find((p) => p.type === t)?.value ?? '';
  const wd = get('weekday');
  if (wd === 'Sat' || wd === 'Sun') return true;
  const mins = Number(get('hour')) * 60 + Number(get('minute'));
  return mins < 9 * 60 + 30 || mins >= 16 * 60;
}

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

export function EpochChart({
  symbol,
  base,
  trendlines = [],
  levels = [],
  height = 420,
  initialTf = '1h',
  expandable = true,
  className,
}: {
  /** When set, fetches real candles for this ticker per timeframe (any ticker). */
  symbol?: string;
  /** Demo/offline mode: a 1-minute base series that coarser TFs aggregate from. */
  base?: Candle[];
  trendlines?: Trendline[];
  /** Horizontal price levels (entry / stop / target etc.). */
  levels?: PriceLevel[];
  height?: number;
  initialTf?: TFId;
  /** Show the expand control. False for the instance already inside the modal. */
  expandable?: boolean;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const dataRef = useRef<Candle[]>([]);
  const [tf, setTf] = useState<TFId>(initialTf);
  const [hover, setHover] = useState<Candle | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Esc closes the expanded view — expected of anything that takes over the screen.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    // don't let the page scroll behind the overlay
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [expanded]);

  const tfCfg = TFS.find((t) => t.id === tf)!;

  // Real data path — fetch OHLC for any ticker at the current timeframe.
  const { data: fetched, isLoading, isError } = useQuery<Candle[]>({
    queryKey: ['/api/historical-prices', symbol, tf],
    queryFn: async () => {
      const r = await fetch(`/api/historical-prices/${symbol}?range=${tfCfg.yRange}&interval=${tfCfg.yInterval}`, { credentials: 'include' });
      if (!r.ok) throw new Error('history failed');
      const b = await r.json();
      return (b?.data ?? []) as Candle[];
    },
    enabled: !!symbol,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const data = useMemo(() => {
    if (symbol) return fetched ?? [];
    if (base) return aggregate(base, tfCfg.sec);
    return [];
  }, [symbol, fetched, base, tfCfg.sec]);

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
    // Project an absolute epoch to an x-coordinate by interpolating between the two
    // bracketing bars' own coordinates. timeToCoordinate is reliable on real bar times
    // (returns null only for a between-bars time), so bracket + lerp gives a correct x
    // on ANY timeframe — unlike logicalToCoordinate, which misprojects fractional
    // logicals near the series edge.
    const xOf = (epoch: number): number | null => {
      const n = bars.length;
      if (!n) return null;
      let i: number;
      if (epoch <= bars[0].time) i = 0;
      else if (epoch >= bars[n - 1].time) i = n - 1;
      else { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].time <= epoch) lo = m + 1; else hi = m; } i = lo - 1; }
      const j = Math.min(i + 1, n - 1);
      const ci = ts.timeToCoordinate(bars[i].time as UTCTimestamp);
      const cj = ts.timeToCoordinate(bars[j].time as UTCTimestamp);
      if (ci == null && cj == null) return null;
      if (ci == null) return cj as number;
      if (cj == null || i === j) return ci as number;
      const span = bars[j].time - bars[i].time || 1;
      const frac = Math.max(0, Math.min(1, (epoch - bars[i].time) / span));
      return (ci as number) + ((cj as number) - (ci as number)) * frac;
    };
    // ── shade extended-hours spans (drawn first, so drawings sit on top) ──
    // Daily bars have no intraday session to speak of, so only mark intraday timeframes.
    if (tf !== '1D' && bars.length > 1) {
      ctx.save();
      ctx.fillStyle = 'rgba(224, 164, 88, 0.055)';
      let runStart: number | null = null;
      for (let k = 0; k < bars.length; k++) {
        const ext = isExtendedHours(bars[k].time);
        if (ext && runStart === null) runStart = bars[k].time;
        if ((!ext || k === bars.length - 1) && runStart !== null) {
          const endTime = ext ? bars[k].time : bars[Math.max(k - 1, 0)].time;
          const xa = xOf(runStart), xb = xOf(endTime);
          if (xa != null && xb != null && xb > xa) ctx.fillRect(xa, 0, xb - xa, h);
          runStart = null;
        }
      }
      ctx.restore();
    }

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

    // horizontal price levels (entry / stop / target)
    for (const lv of levels) {
      const y = series.priceToCoordinate(lv.price);
      if (y == null) continue;
      const color = lv.color ?? '#8b98a8';
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      if (lv.dashed) ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.setLineDash([]);
      if (lv.label) {
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillStyle = color;
        ctx.fillText(lv.label, 6, y - 4);
      }
    }
  }, [trendlines, levels, tf]);

  // keep the latest draw in a ref so the rAF loop never forces a chart rebuild
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

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
    const loop = () => { drawRef.current(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => { chart.applyOptions({ width: wrap.clientWidth, height }); });
    ro.observe(wrap);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [height]);

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
          <span className="text-[12px] font-mono font-bold tracking-widest text-foreground">{symbol ?? 'DEMO'}</span>
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
          {tf !== '1D' && (
            <span className="mr-2 hidden items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 sm:inline-flex">
              <span className="h-2 w-2 rounded-sm" style={{ background: 'rgba(224,164,88,0.25)' }} />
              ext hours
            </span>
          )}
          {expandable && (
            <button
              onClick={() => setExpanded(true)}
              title="Expand chart"
              aria-label="Expand chart"
              className="mr-1 cursor-pointer rounded p-1 text-muted-foreground/70 transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {TFS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTf(t.id)}
              title={`${t.label} · press ${i + 1}`}
              className={cn(
                'px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors',
                tf === t.id ? 'bg-foreground/10 text-[var(--brand-cyan,#22d3ee)]' : 'text-muted-foreground/70 hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* full-screen workspace — the chart gets the whole surface, background blurred */}
      {expandable && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {expanded && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md"
              style={{ background: 'color-mix(in srgb, var(--background,#0a0a0a) 78%, transparent)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setExpanded(false)}
              role="dialog"
              aria-label={`${symbol ?? 'Chart'} expanded`}
            >
              <motion.div
                className="w-full max-w-[1500px] rounded-xl border border-card-border bg-card shadow-2xl"
                initial={{ scale: 0.98, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.98, y: 8 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
                  <span className="text-[12px] font-mono font-bold tracking-widest text-foreground">
                    {symbol ?? 'DEMO'} <span className="text-muted-foreground/70">· chart workspace</span>
                  </span>
                  <button
                    onClick={() => setExpanded(false)}
                    aria-label="Close expanded chart"
                    className="cursor-pointer rounded p-1 text-muted-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-2">
                  <EpochChart
                    symbol={symbol}
                    base={base}
                    trendlines={trendlines}
                    levels={levels}
                    initialTf={tf}
                    height={Math.max(420, Math.round(window.innerHeight * 0.68))}
                    expandable={false}
                    className="border-0"
                  />
                </div>
                <div className="border-t border-border/40 px-4 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                  Esc or click outside to close · keys 1–4 switch timeframe
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* chart + epoch-anchored overlay */}
      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none z-10" />
        {symbol && (isLoading || isError || data.length === 0) && (
          <div className="absolute inset-0 z-20 grid place-items-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
            {isError ? 'no data' : isLoading ? 'loading…' : 'no candles'}
          </div>
        )}
      </div>
    </div>
  );
}
