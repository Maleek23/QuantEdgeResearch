/**
 * QECHART — the one price chart. The CHART page and every embedded price
 * chart (NEXUS setup detail, ticker workup, bot, crypto) render this.
 *
 *   <QEChart symbol="NVDA" />                      compact embed
 *   <QEChart symbol="NVDA" variant="full" fill />  the CHART page's board
 *
 * What every instance gets, identically:
 *   - LIVE candles: history (/api/historical-prices) + the forming bar from the
 *     live price bus (lib/live-price-bus: one /ws/prices socket per tab, ONE
 *     Alpaca/Coinbase subscription per symbol however many charts show it;
 *     1 s /api/last-price fallback only while the socket is down). Stamped
 *     ● LIVE / ○ DELAYED with the print's age, or HISTORY when no tape.
 *   - the CHART page's layers: GEX bubbles ("orbs") through time or GEX lines,
 *     dark-pool levels, options-flow prints — /api/chart/overlays, one React
 *     Query entry per symbol+range shared by every chart on the page.
 *   - the CHART page's settings (components/charting/chart-prefs.ts): one
 *     device store, so a toggle in an expanded embed IS the CHART page toggle.
 *
 * Compact = clean minimal chart + ⤢. Expand opens the full chart (every CHART
 * page control: timeframe, range, extended hours, replay, indicators, candle /
 * line, GEX mode, dark pool, flow) in a modal, with "Chart page ↗" to carry the
 * symbol + timeframe over to the CHART tab.
 *
 * Off-screen charts pause: no live subscription, no history or overlay refetch
 * (IntersectionObserver). Hidden tabs already stop polling in the bus.
 *
 * Two renderers, one data layer (chart-layers.ts): the compact embed is
 * NexusPriceChart (chart-engine drawChart) with the layers passed through its
 * underlay/overlay hooks; the full variant is the TradingView-style chart on
 * lightweight-charts v5 (tv/tv-chart.tsx) with the same layers as series
 * primitives, drawing tools, log/percent scales and keyboard shortcuts. No DOM
 * node per bubble in either. The GEX timeline only exists from when the server
 * started recording it; the chart shows that start rather than inventing the
 * missing morning.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useStockContext } from '@/contexts/stock-context';
import { NexusPriceChart } from '@/components/charting/nexus-price-chart';
import {
  useCandles, renderedCandleRange, chartPalette, TF_CONFIG,
  type Candle, type ChartGeometry, type Level, type Zone,
} from '@/components/charting/chart-engine';
import {
  useChartPrefs, setChartPref,
  type ChartPrefs, type ChartOverlayPrefs, type TfKey,
} from '@/components/charting/chart-prefs';
import {
  overlaysSupported, useInView, useLiveLast, useDealerMap, useChartOverlays,
  etInfo, etClock, shortDate, fmtUsd, ageOf,
  type DpLevel, type FlowPrint,
} from '@/components/charting/chart-layers';
import '@/styles/nexus.css';
import { terminalAsOf } from '@/components/gex/gex-model';

/* The full variant is the TradingView-style chart (tv/tv-chart.tsx) on
   lightweight-charts; loaded on demand so compact embeds never pay for it. */
const LazyTvChart = lazy(() => import('@/components/charting/tv/tv-chart').then((m) => ({ default: m.TvChart })));

const INTRADAY = new Set(['1m', '5m', '15m', '30m', '1h', '4h']);
const MINI_TFS: TfKey[] = ['1m', '5m', '15m', '1h', '1D'];
const NO_LEVELS: (Level & { dashed?: boolean })[] = [];
const NO_ZONES: Zone[] = [];

function EscClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return null;
}

interface Tokens { pos: string; neg: string; dp: string; call: string; put: string; text: string; panel: string; mute: string }
/** Layer colours from the active visual mode's chart palette (chart-engine
 *  chartPalette → --lx-* tokens), so Light / Contrast / Dim all work. Calls
 *  and puts use the palette's call/put roles — green means gain only. */
function readTokens(el: HTMLElement | null): Tokens {
  const pal = chartPalette(el);
  return {
    pos: pal.accent, neg: pal.loss, dp: pal.caution,
    call: pal.call, put: pal.put, text: pal.text,
    panel: pal.surface, mute: pal.dim,
  };
}

/** What the last frame drew — enough to hit-test without redrawing (touch taps). */
interface Frame {
  geo: ChartGeometry;
  bubbles: { strike: number; vals: Float64Array; times: Float64Array; srcs: string[] }[];
  maxAbs: number; rMax: number;
  lines: { y: number; strike: number; gex: number; t: number }[];
  dp: { y: number; lvl: DpLevel }[];
  flow: { x: number; y: number; r: number; p: FlowPrint }[];
}

/* ─────────────────────────────── board ─────────────────────────────── */

export interface QEChartProps {
  symbol: string;
  /** compact (default): minimal chart + ⤢ expand. full: the CHART page board. */
  variant?: 'compact' | 'full';
  /** Compact outer height in px (ignored with `fill`). */
  height?: number;
  /** Fill the parent (flex/height:100%) instead of a fixed height. */
  fill?: boolean;
  /** Starting timeframe for this embed. Without it, a full chart follows the
   *  CHART page's saved timeframe; compact defaults to 1D. */
  initialTf?: TfKey;
  /** Controlled timeframe. */
  tf?: TfKey;
  onTfChange?: (tf: TfKey) => void;
  /** Price lines (entry / stop / target / strike…), drawn over the layers.
   *  Colour: a palette role ('accent' 'gain' 'loss' 'caution' 'call' 'put'…). */
  levels?: (Level & { dashed?: boolean })[];
  /** Shaded price bands (e.g. unfilled gaps). */
  zones?: Zone[];
  /** Compact only: pin layers/indicators for this embed instead of following
   *  the shared settings. The expanded view always shows the shared settings. */
  overlays?: ChartOverlayPrefs;
  /** Form the last candle from live ticks (default on). Off for replays of
   *  the past. */
  live?: boolean;
  /** Compact: show the ⤢ button (default on). */
  expandable?: boolean;
  /** Compact header label (defaults to the symbol). */
  title?: string;
  /** Full: shows the ticker search; called with the picked symbol. */
  onSymbolChange?: (symbol: string, name?: string) => void;
  onOpenLab?: () => void;
  /** Full: shows "Chart page ↗" (the expanded modal uses it). */
  onOpenChartPage?: () => void;
}

function QEChartCompact({
  symbol: rawSymbol,
  height = 340,
  fill = false,
  initialTf,
  tf: controlledTf,
  onTfChange,
  levels = NO_LEVELS,
  zones = NO_ZONES,
  overlays,
  live = true,
  expandable = true,
  title,
  onSymbolChange,
  onOpenLab,
  onOpenChartPage,
}: QEChartProps) {
  const symbol = rawSymbol.toUpperCase();
  // The full variant is TvChart (see QEChart below); this is the compact embed.
  const compact = true;
  const shared = useChartPrefs();
  // Compact embeds may pin layers; the full board always shows the shared set.
  const prefs: ChartPrefs = useMemo(
    () => (compact && overlays ? { ...shared, ...overlays } : shared),
    [compact, overlays, shared],
  );
  const set = setChartPref;

  /* timeframe ownership: controlled prop › this embed › the CHART page's */
  const ownsTf = compact || initialTf != null;
  const [localTf, setLocalTf] = useState<TfKey>(() => (initialTf && TF_CONFIG[initialTf] ? initialTf : compact ? '1D' : shared.tf));
  const tf: TfKey = controlledTf && TF_CONFIG[controlledTf] ? controlledTf : ownsTf ? localTf : shared.tf;
  const setTf = useCallback((next: TfKey) => {
    if (controlledTf == null && ownsTf) setLocalTf(next);
    if (controlledTf == null && !ownsTf) setChartPref('tf', next);
    onTfChange?.(next);
  }, [controlledTf, ownsTf, onTfChange]);

  const { range, extended } = prefs;
  const intraday = INTRADAY.has(tf);
  const [expanded, setExpanded] = useState(false);
  const [rootRef, inView] = useInView<HTMLDivElement>();
  const [, navigate] = useLocation();
  const { setCurrentStock } = useStockContext();

  const { data: series } = useCandles(symbol, tf, inView);

  /* ── dealer walls + zero-γ: the GEX page's query (same key → one request
     per symbol for the GEX tools, the CHART page and every embed) ── */
  const dealerQ = useDealerMap(symbol, prefs.walls, inView);
  const snap = dealerQ.data?.snapshot;
  const zeroGamma = snap ? (snap.zeroGammaLevel ?? snap.gammaFlipPrice ?? null) : null;
  // The chain's own time (audit #12), not the response time.
  const dealerAsOf = dealerQ.data ? terminalAsOf(dealerQ.data) ?? null : null;
  const dealerSource = snap?.source ?? dealerQ.data?.optionsSource ?? 'chain';
  // The expanded modal has no card beside it: labels come back on the canvas there.
  const expandedLevels = useMemo(() => (levels.some((l) => l.hideLabel) ? levels.map((l) => ({ ...l, hideLabel: false })) : levels), [levels]);
  const allLevels = useMemo(() => {
    if (!prefs.walls || !snap) return levels;
    const rows: (Level & { dashed?: boolean })[] = [];
    if (snap.callWall != null) rows.push({ price: snap.callWall, color: 'call', label: 'CALL WALL', kind: 'gex-anchor', strength: 0.8, meta: 'Γ wall' });
    if (snap.putWall != null) rows.push({ price: snap.putWall, color: 'put', label: 'PUT WALL', kind: 'gex-anchor', strength: 0.8, meta: 'Γ wall' });
    if (zeroGamma != null) rows.push({ price: zeroGamma, color: 'caution', label: 'ZERO-γ', kind: 'gex-anchor', strength: 0.7, meta: 'zero-γ' });
    return rows.length ? [...levels, ...rows] : levels;
  }, [prefs.walls, snap, zeroGamma, levels]);

  /* ── session range + extended-hours filter (pre-replay) ── */
  const applyRange = useCallback((bars: Candle[]) => {
    if (!intraday) return bars;
    let out = bars;
    if (!extended) out = out.filter((b) => { const m = etInfo(b.time).mins; return m >= 570 && m < 960; });
    if (range !== 'ALL') {
      const keep = range === '1D' ? 1 : 5;
      const dates: string[] = [];
      for (let i = out.length - 1; i >= 0 && dates.length <= keep; i--) {
        const d = etInfo(out[i].time).date;
        if (dates[dates.length - 1] !== d) dates.push(d);
      }
      if (dates.length > keep) {
        const cutDate = dates[keep - 1];
        const firstIdx = out.findIndex((b) => etInfo(b.time).date >= cutDate);
        out = firstIdx > 0 ? out.slice(firstIdx) : out;
      }
    }
    return out;
  }, [intraday, extended, range]);
  const ranged = useMemo(() => applyRange(series?.bars ?? []), [series, applyRange]);

  /* ── replay ── */
  const [replay, setReplay] = useState<{ on: boolean; idx: number; playing: boolean; speed: number }>({ on: false, idx: 0, playing: false, speed: 1 });
  useEffect(() => { setReplay((r) => ({ ...r, on: false, playing: false })); }, [symbol, tf, range, extended]);
  useEffect(() => {
    if (!replay.on || !replay.playing) return;
    const id = setInterval(() => {
      setReplay((r) => {
        const next = Math.min(ranged.length - 1, r.idx + r.speed);
        return { ...r, idx: next, playing: next < ranged.length - 1 };
      });
    }, 300);
    return () => clearInterval(id);
  }, [replay.on, replay.playing, ranged.length]);
  const cutoff = replay.on && ranged.length ? ranged[Math.min(replay.idx, ranged.length - 1)].time : null;

  // The chart hands over its series — history plus the live forming bar when
  // not replaying — and gets back the session range, cut at the replay cursor.
  // (It used to ignore its input and return the board's own copy, which is
  // why no live tick could ever reach the Flow chart.)
  const transformBars = useCallback(
    (bars: Candle[]) => {
      const r = applyRange(bars);
      return cutoff == null ? r : r.filter((b) => b.time <= cutoff);
    },
    [applyRange, cutoff],
  );

  /* ── overlays ── */
  const lastClose = ranged.length ? ranged[ranged.length - 1].close : null;
  const lastCloseRef = useRef(lastClose);
  lastCloseRef.current = lastClose;
  const ovRange = range === '1D' && intraday ? '1D' : '5D';
  const wantLayers = overlaysSupported(symbol) && (prefs.gex !== 'off' || prefs.dp || prefs.flow);
  const { data: ov, isError: ovError, isLoading: ovLoading } = useChartOverlays(symbol, ovRange, wantLayers, inView, lastCloseRef);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [inView]);
  const liveTick = useLiveLast(symbol, live && inView && !replay.on);

  /* GEX readout at the cursor time (replay) or the latest sample. */
  const gexRead = useMemo(() => {
    if (!ov) return null;
    if (cutoff == null) {
      if (!ov.gexNow) return null;
      return { net: ov.gexNow.net, top: ov.gexNow.topStrikes, asOf: ov.gexNow.asOf, source: ov.gexNow.source };
    }
    const sample = [...ov.gexTimeline.samples].reverse().find((s) => s.t <= cutoff);
    if (!sample) return null;
    const top = ov.gexTimeline.series
      .map((s) => ({ strike: s.strike, gex: s.points.find((p) => p[0] === sample.t)?.[1] }))
      .filter((x): x is { strike: number; gex: number } => x.gex != null)
      .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 5);
    return { net: sample.net, top, asOf: new Date(sample.t).toISOString(), source: sample.source };
  }, [ov, cutoff]);

  /* ── canvas layers ── */
  const hostRef = useRef<HTMLDivElement>(null);
  // Watermark lockup (ticker over the gamma mark) only where it has room.
  const [hostH, setHostH] = useState(0);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setHostH(Math.round(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tipRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -1, y: -1 });
  const frame = useRef<Frame | null>(null);

  const showTip = useCallback((lines: { text: string; color?: string; bold?: boolean }[], x: number, y: number) => {
    const tip = tipRef.current; const host = hostRef.current;
    if (!tip || !host) return;
    tip.replaceChildren(...lines.map((l) => {
      const div = document.createElement('div');
      div.textContent = l.text;
      if (l.color) div.style.color = l.color;
      if (l.bold) div.style.fontWeight = '700';
      return div;
    }));
    const canvas = host.querySelector('canvas');
    const off = canvas ? canvas.getBoundingClientRect() : host.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const ox = off.left - hostRect.left; const oy = off.top - hostRect.top;
    tip.style.display = 'block';
    const tw = tip.offsetWidth; const th = tip.offsetHeight;
    let tx = ox + x + 14; let ty = oy + y + 14;
    if (tx + tw > hostRect.width - 4) tx = ox + x - tw - 14;
    if (ty + th > hostRect.height - 4) ty = oy + y - th - 14;
    tip.style.left = `${Math.max(4, tx)}px`;
    tip.style.top = `${Math.max(4, ty)}px`;
  }, []);
  const hideTip = useCallback(() => { if (tipRef.current) tipRef.current.style.display = 'none'; }, []);

  const resolveHover = useCallback((mx: number, my: number) => {
    const f = frame.current;
    if (!f || mx < f.geo.left || mx > f.geo.right || my < f.geo.top || my > f.geo.top + f.geo.priceH) { hideTip(); return; }
    const tk = readTokens(hostRef.current);
    // 1 · flow marker
    let best: { d: number; hit: Frame['flow'][number] } | null = null;
    for (const h of f.flow) {
      const d = Math.hypot(h.x - mx, h.y - my);
      if (d <= h.r + 4 && (!best || d < best.d)) best = { d, hit: h };
    }
    if (best) {
      const p = best.hit.p;
      showTip([
        { text: `${p.contract}`, bold: true, color: p.optionType === 'call' ? tk.call : tk.put },
        { text: `Premium ${fmtUsd(p.premium)}${p.contracts ? ` · ${p.contracts.toLocaleString()} cts` : ''} @ $${p.fillPrice}` },
        { text: `${p.alertNames.join(' · ')}` },
        { text: `${etClock(p.time)} ET · side not reported by feed`, color: tk.mute },
      ], mx, my);
      return;
    }
    // 2 · dark-pool line
    const dp = f.dp.find((r) => Math.abs(r.y - my) <= 4);
    if (dp) {
      showTip([
        { text: `Dark pool ${dp.lvl.price.toFixed(2)}`, bold: true, color: tk.dp },
        { text: `Notional ${fmtUsd(dp.lvl.notional)} · ${dp.lvl.prints} print${dp.lvl.prints === 1 ? '' : 's'}` },
        { text: `Last ${shortDate(dp.lvl.date)}${dp.lvl.firstDate && dp.lvl.firstDate !== dp.lvl.date ? ` · first ${shortDate(dp.lvl.firstDate)}` : ''}` },
        { text: 'Level, not direction', color: tk.mute },
      ], mx, my);
      return;
    }
    // 3 · GEX bubble under the cursor bar
    const idx = Math.floor((mx - f.geo.left) / f.geo.candleW);
    if (idx >= 0 && idx < f.geo.candles.length) {
      let hit: { d: number; strike: number; g: number; t: number; src: string } | null = null;
      for (const b of f.bubbles) {
        const g = b.vals[idx];
        if (!Number.isFinite(g)) continue;
        const d = Math.abs(f.geo.priceToY(b.strike) - my);
        const r = 1 + (f.rMax - 1) * Math.sqrt(Math.abs(g) / f.maxAbs);
        if (d <= Math.max(r, 5) && (!hit || d < hit.d)) hit = { d, strike: b.strike, g, t: b.times[idx], src: b.srcs[idx] };
      }
      if (hit) {
        showTip([
          { text: `GEX ${hit.strike.toFixed(2)}`, bold: true, color: hit.g >= 0 ? tk.pos : tk.neg },
          { text: `${fmtUsd(hit.g, true)} net gamma` },
          { text: `Sampled ${etClock(hit.t)} ET · ${hit.src}`, color: tk.mute },
        ], mx, my);
        return;
      }
    }
    // 4 · GEX line (lines mode)
    const ln = f.lines.find((l) => Math.abs(l.y - my) <= 4);
    if (ln) {
      showTip([
        { text: `GEX ${ln.strike.toFixed(2)}`, bold: true, color: ln.gex >= 0 ? tk.pos : tk.neg },
        { text: `${fmtUsd(ln.gex, true)} net gamma` },
        { text: `Snapshot ${etClock(ln.t)} ET`, color: tk.mute },
      ], mx, my);
      return;
    }
    hideTip();
  }, [hideTip, showTip]);

  const underlay = useCallback((ctx: CanvasRenderingContext2D, geo: ChartGeometry) => {
    const tk = readTokens(hostRef.current);
    const f: Frame = { geo, bubbles: [], maxAbs: 1, rMax: 3, lines: [], dp: [], flow: [] };
    frame.current = f;
    if (!ov) return;
    const n = geo.candles.length;
    const limit = cutoff ?? Infinity;

    /* GEX bubbles: each sample covers its bars until the next sample, capped
       at 2.5× the cadence (hourly archive: 65 min) — a gap stays a gap. */
    if (prefs.gex === 'bubbles' && n > 1) {
      const srcAt = new Map(ov.gexTimeline.samples.map((s) => [s.t, s.source]));
      const cadence = ov.gexTimeline.sampleEveryMin * 60_000;
      let maxAbs = 0;
      for (const s of ov.gexTimeline.series) {
        if (s.strike < geo.min || s.strike > geo.max) continue;
        const vals = new Float64Array(n).fill(NaN);
        const times = new Float64Array(n).fill(NaN);
        const srcs: string[] = new Array(n);
        const pts = s.points;
        for (let k = 0; k < pts.length; k++) {
          const [t, g] = pts[k];
          if (t > limit) break;
          const src = srcAt.get(t) ?? 'recorded';
          const span = src === 'archive-hourly' ? 65 * 60_000 : cadence * 2.5;
          const nextT = k + 1 < pts.length ? pts[k + 1][0] : Infinity;
          const end = Math.min(nextT, t + span, limit === Infinity ? Date.now() : limit + 1);
          let i = geo.indexAt(t);
          if (i < 0) {
            if (t < geo.candles[0].time && end > geo.candles[0].time) i = 0;
            else if (t >= geo.candles[n - 1].time && t - geo.candles[n - 1].time <= cadence * 2.5) i = n - 1;
            else continue;
          }
          for (; i < n && geo.candles[i].time < end; i++) {
            vals[i] = g; times[i] = t; srcs[i] = src;
            if (Math.abs(g) > maxAbs) maxAbs = Math.abs(g);
          }
        }
        f.bubbles.push({ strike: s.strike, vals, times, srcs });
      }
      f.maxAbs = maxAbs || 1;
      f.rMax = Math.max(2.2, Math.min(5, geo.candleW * 0.65));
      for (const b of f.bubbles) {
        const y = geo.priceToY(b.strike);
        for (let i = 0; i < n; i++) {
          const g = b.vals[i];
          if (!Number.isFinite(g)) continue;
          const m = Math.sqrt(Math.abs(g) / f.maxAbs);
          if (m < 0.04) continue;
          const r = 1 + (f.rMax - 1) * m;
          ctx.globalAlpha = 0.3 + 0.65 * m;
          ctx.fillStyle = g >= 0 ? tk.pos : tk.neg;
          const x = geo.left + i * geo.candleW + geo.candleW / 2;
          if (r < 1.4) ctx.fillRect(x - r, y - r, r * 2, r * 2);
          else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      ctx.globalAlpha = 1;
    }

    /* GEX lines: the current (or replay-cursor) snapshot's top strikes. */
    if (prefs.gex === 'lines' && gexRead) {
      const top = gexRead.top;
      const maxAbs = Math.max(...top.map((x) => Math.abs(x.gex)), 1);
      for (const s of top) {
        if (s.strike < geo.min || s.strike > geo.max) continue;
        const y = geo.priceToY(s.strike);
        const m = Math.sqrt(Math.abs(s.gex) / maxAbs);
        ctx.strokeStyle = s.gex >= 0 ? tk.pos : tk.neg;
        ctx.globalAlpha = 0.35 + 0.6 * m;
        ctx.lineWidth = 1 + 2.5 * m;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(geo.left, y); ctx.lineTo(geo.right, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${s.strike.toFixed(2)} ${fmtUsd(s.gex, true)}`, geo.left + 6, y - 4);
        f.lines.push({ y, strike: s.strike, gex: s.gex, t: Date.parse(gexRead.asOf) });
      }
      ctx.globalAlpha = 1;
    }

    /* Dark-pool levels: dotted line; weight by notional rank. */
    if (prefs.dp) {
      const lvls = ov.darkPool.levels.filter((l) => {
        const first = l.firstDate ? Date.parse(l.firstDate) : null;
        return l.price >= geo.min && l.price <= geo.max && (cutoff == null || first == null || first <= cutoff);
      });
      const top = Math.max(...lvls.map((l) => l.notional), 1);
      for (const l of lvls) {
        const y = Math.round(geo.priceToY(l.price)) + 0.5;
        const m = Math.sqrt(l.notional / top);
        ctx.strokeStyle = tk.dp;
        ctx.globalAlpha = 0.35 + 0.55 * m;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(geo.left, y); ctx.lineTo(geo.right, y); ctx.stroke();
        ctx.setLineDash([]);
        f.dp.push({ y, lvl: l });
      }
      ctx.globalAlpha = 1;
    }
  }, [ov, prefs.gex, prefs.dp, cutoff, gexRead]);

  const overlay = useCallback((ctx: CanvasRenderingContext2D, geo: ChartGeometry) => {
    const f = frame.current;
    if (!f || !ov) { resolveHover(mouse.current.x, mouse.current.y); return; }
    const tk = readTokens(hostRef.current);

    /* Flow markers: calls ● above the bar, puts ◆ below — type, not side. */
    if (prefs.flow) {
      const prints = ov.flow.prints.filter((p) => cutoff == null || p.time <= cutoff);
      const maxPrem = Math.max(...prints.map((p) => p.premium), 1);
      for (const p of prints) {
        const i = geo.indexAt(p.time);
        if (i < 0) continue;
        const c = renderedCandleRange(geo.candles[i]);
        const x = geo.left + i * geo.candleW + geo.candleW / 2;
        const r = Math.max(2.5, Math.min(8, 2 + 6 * Math.sqrt(p.premium / maxPrem)));
        const y = p.optionType === 'call' ? geo.priceToY(c.high) - r - 3 : geo.priceToY(c.low) + r + 3;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.optionType === 'call' ? tk.call : tk.put;
        ctx.strokeStyle = tk.panel;
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (p.optionType === 'call') ctx.arc(x, y, r, 0, Math.PI * 2);
        else { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
        ctx.fill(); ctx.stroke();
        f.flow.push({ x, y, r, p });
      }
      ctx.globalAlpha = 1;
    }

    /* DP tags at the right edge, de-collided. */
    if (prefs.dp && f.dp.length) {
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      const lastY = geo.priceToY(geo.candles[geo.candles.length - 1].close);
      const placed: number[] = [];
      for (const { y, lvl } of [...f.dp].sort((a, b) => b.lvl.notional - a.lvl.notional)) {
        if (placed.some((py) => Math.abs(py - y) < 13) || Math.abs(y - lastY) < 9) continue;
        placed.push(y);
        const label = `DP ${fmtUsd(lvl.notional)} · ${shortDate(lvl.date)}`;
        const tw = ctx.measureText(label).width + 10;
        const x1 = geo.right - 2;
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = tk.panel;
        ctx.fillRect(x1 - tw, y - 7, tw, 14);
        ctx.strokeStyle = tk.dp;
        ctx.lineWidth = 1;
        ctx.strokeRect(x1 - tw + 0.5, y - 6.5, tw - 1, 13);
        ctx.fillStyle = tk.dp;
        ctx.fillText(label, x1 - 5, y + 3);
      }
      ctx.globalAlpha = 1;
    }
    resolveHover(mouse.current.x, mouse.current.y);
  }, [ov, prefs.flow, prefs.dp, cutoff, resolveHover]);

  const axisOverlay = useCallback((ctx: CanvasRenderingContext2D, geo: ChartGeometry) => {
    const f = frame.current;
    if (!f || !prefs.dp || !f.dp.length) return;
    const tk = readTokens(hostRef.current);
    const lastY = geo.priceToY(geo.candles[geo.candles.length - 1].close);
    const placed: number[] = [];
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    for (const { y, lvl } of [...f.dp].sort((a, b) => b.lvl.notional - a.lvl.notional)) {
      if (placed.some((py) => Math.abs(py - y) < 14) || Math.abs(y - lastY) < 14) continue;
      placed.push(y);
      ctx.fillStyle = tk.dp;
      ctx.fillRect(geo.right, y - 7, 60, 14);
      ctx.fillStyle = tk.panel;
      ctx.fillText(lvl.price.toFixed(2), geo.right + 6, y + 3);
    }
  }, [prefs.dp]);

  /* ── readout values ── */
  const prevClose = useMemo(() => {
    if (!ranged.length) return null;
    const lastDate = etInfo(ranged[ranged.length - 1].time).date;
    const bars = series?.bars ?? [];
    for (let i = bars.length - 1; i >= 0; i--) if (etInfo(bars[i].time).date < lastDate) return bars[i].close;
    return null;
  }, [ranged, series]);
  const lastPx = liveTick?.price ?? (ranged.length ? ranged[ranged.length - 1].close : null);
  const chg = lastPx != null && prevClose ? (lastPx / prevClose - 1) * 100 : null;
  const tk0 = readTokens(hostRef.current);

  const chartHandlers = {
    onPointerMoveCapture: (e: React.PointerEvent) => {
      const canvas = hostRef.current?.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    onPointerUp: (e: React.PointerEvent) => {
      // Touch has no hover: a tap resolves against the last frame.
      if (e.pointerType === 'mouse') return;
      const canvas = hostRef.current?.querySelector('canvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      resolveHover(e.clientX - rect.left, e.clientY - rect.top);
    },
    onPointerLeave: () => { mouse.current = { x: -1, y: -1 }; hideTip(); },
  };

  const priceChart = (
    <NexusPriceChart
      key={symbol}
      symbol={symbol}
      tf={tf}
      onTfChange={setTf}
      hideControls
      fill
      expandable={false}
      crosshairTip={compact}
      minimalInfo={compact}
      touchScroll={compact}
      zones={zones}
      chartType={prefs.type === 'line' || prefs.type === 'area' ? 'line' : 'candles'}
      levels={allLevels}
      showMA={prefs.ma}
      showVolume={prefs.volume}
      transformBars={transformBars}
      live={live && !replay.on}
      active={inView}
      defaultVisibleBars={intraday && range !== 'ALL' ? Math.max(15, ranged.length) : undefined}
      resetKey={`${range}:${extended}:${replay.on}`}
      underlay={underlay}
      overlay={overlay}
      axisOverlay={axisOverlay}
    />
  );

  const closeExpanded = useCallback(() => setExpanded(false), []);
  const openChartPage = useCallback(() => {
    setChartPref('tf', tf);
    setCurrentStock({ symbol });
    setExpanded(false);
    // The terminal shell only re-reads ?tab= when the PATH changes, so from
    // inside /t (NEXUS, bot, crypto) a bare '/t?tab=chart' updates the URL but
    // not the tab. The legacy '/chart-analysis' route redirects to the same
    // place in one hop and remounts the shell on the CHART tab.
    navigate(typeof window !== 'undefined' && window.location.pathname === '/t' ? '/chart-analysis' : '/t?tab=chart');
  }, [tf, symbol, setCurrentStock, navigate]);

  const modal = expanded && typeof document !== 'undefined' ? createPortal(
    <div
      className="nexus-vars qe-chart-portal"
      // Portal events still bubble through the React tree: keep clicks in the
      // modal from selecting the card the compact chart sits in.
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="chart-modal" role="dialog" aria-modal="true" aria-label={`${symbol} chart`} onClick={(e) => { if (e.target === e.currentTarget) closeExpanded(); }}>
        <div className="chart-modal-box">
          <div className="chart-modal-head">
            <span className="chart-modal-title">{title ?? symbol} · chart</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-mute)' }}>settings are shared with the CHART page</span>
            <button className="chart-modal-close" onClick={closeExpanded}>ESC ✕</button>
          </div>
          <div className="chart-modal-body">
            <QEChart
              symbol={symbol}
              variant="full"
              fill
              tf={tf}
              onTfChange={setTf}
              levels={expandedLevels}
              zones={zones}
              live={live}
              onOpenChartPage={openChartPage}
            />
          </div>
        </div>
      </div>
      <EscClose onClose={closeExpanded} />
    </div>,
    document.body,
  ) : null;

    const layerDot = (on: boolean, color: string, label: string, tip: string) => (
      <span className={`fc-chip${on ? '' : ' off'}`} title={tip}><i style={{ background: color }} />{label}</span>
    );
    const layersOk = overlaysSupported(symbol);
    return (
      <div
        ref={rootRef}
        className="fc-root fc-compact"
        style={fill ? { flex: '1 1 0', minHeight: 200 } : { height: Math.max(height, 260), flex: 'none' }}
      >
        <style>{FC_CSS}</style>
        <div className="fc-mini-head">
          <b>{title ?? symbol}</b>
          <span className="fc-mini-px">{lastPx != null ? `$${lastPx.toFixed(lastPx < 10 ? 4 : 2)}` : '—'}</span>
          {chg != null && <span style={{ color: chg >= 0 ? 'var(--green)' : 'var(--red)' }}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span>}
          {layersOk && (
            <span className="fc-mini-layers">
              {prefs.walls && layerDot(!!snap, tk0.call, 'WALLS', snap ? `Call wall ${snap.callWall ?? '—'} · put wall ${snap.putWall ?? '—'} · zero-γ ${zeroGamma != null ? zeroGamma.toFixed(2) : '—'} · ${dealerSource} · ${ageOf(dealerAsOf, now)} old` : dealerQ.isError ? 'Dealer map unavailable' : 'Reading the chain…')}
              {prefs.gex !== 'off' && (ov && prefs.gex === 'bubbles' && !ov.gexTimeline.samples.length
                ? <span className="fc-chip" title={`GEX orbs: recording since ${etClock(Date.parse(ov.gexTimeline.recorderLastRun ?? ov.generatedAt))} ET — first orbs in ~${ov.gexTimeline.sampleEveryMin || 5}m (09:00–16:30 ET weekdays)`}><i style={{ background: tk0.pos }} />GEX rec · orbs ~{ov.gexTimeline.sampleEveryMin || 5}m</span>
                : layerDot(!!gexRead, tk0.pos, 'GEX', gexRead ? `GEX ${prefs.gex} · ${ageOf(gexRead.asOf, now)} old · ${gexRead.source}` : ovLoading ? 'GEX loading' : 'No GEX snapshot for this symbol yet'))}
              {prefs.dp && layerDot(!!ov?.darkPool.levels.length, tk0.dp, 'DP', ov ? `Dark pool: ${ov.darkPool.levels.length} levels near price${ov.darkPool.asOf ? ` · ${ageOf(ov.darkPool.asOf, now)} old` : ''}` : 'Dark pool loading')}
              {prefs.flow && layerDot(!!ov?.flow.prints.length, tk0.call, 'FLOW', ov ? `Flow: ${ov.flow.prints.length} prints · stream ${ov.flow.streamState}` : 'Flow loading')}
              {ovError && <span className="fc-chip warn" title="Overlay feed unavailable — price only">layers ✕</span>}
            </span>
          )}
          <span className="fc-mini-tf" role="group" aria-label="Timeframe">
            {(MINI_TFS.includes(tf) ? MINI_TFS : [...MINI_TFS, tf]).map((k) => (
              <button key={k} className={tf === k ? 'on' : ''} onClick={(e) => { e.stopPropagation(); setTf(k); }} aria-pressed={tf === k}>{k}</button>
            ))}
          </span>
          {expandable && (
            <button className="fc-btn fc-expand" onClick={(e) => { e.stopPropagation(); setExpanded(true); }} title="Expand — every CHART-page setting" aria-label={`Expand ${symbol} chart`}>⤢</button>
          )}
        </div>
        <div className="fc-chart" ref={hostRef} {...chartHandlers}>
          {hostH >= 240 && (
            <div className="fc-wm" aria-hidden="true">
              <span className="fc-wm-sym">{symbol}</span>
              <img src="/gamma-mark.svg" alt="" draggable={false} />
            </div>
          )}
          {priceChart}
          <div className="fc-tip" ref={tipRef} role="tooltip" />
        </div>
        {modal}
      </div>
    );
}

/**
 * The one price chart. `variant="full"` (the CHART tab, the expanded modal) is
 * the TradingView-style chart on lightweight-charts — tv/tv-chart.tsx;
 * everything else is the compact embed above.
 */
export function QEChart(props: QEChartProps & { variant?: 'compact' | 'full' }) {
  if (props.variant === 'full') {
    return (
      <Suspense fallback={<div className="fc-root fc-fill" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-mute)', fontSize: 11 }}>loading chart…</div>}>
        <LazyTvChart {...props} />
      </Suspense>
    );
  }
  return <QEChartCompact {...props} />;
}

const FC_CSS = `
.fc-root{display:flex;flex-direction:column;height:var(--qe-main-h, calc(100dvh - 98px));min-height:460px;background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace}
.fc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--nx-border)}
.fc-sym{width:170px;min-width:120px}
.fc-px{display:flex;gap:6px;align-items:baseline;font-size:11px;padding:0 4px}
.fc-px b{color:var(--cyan-bright)}
.fc-btn,.fc-sel select{height:26px;padding:0 8px;border:1px solid var(--nx-border);border-radius:4px;background:var(--panel-2);color:var(--text-dim);font:600 11px 'JetBrains Mono',monospace;cursor:pointer;white-space:nowrap}
.fc-btn:hover:not(:disabled),.fc-sel select:hover:not(:disabled){border-color:var(--nx-border-hi);color:var(--text)}
.fc-btn.on{color:var(--cyan-bright);border-color:var(--nx-border-hi)}
.fc-btn:disabled,.fc-sel select:disabled{opacity:.45;cursor:not-allowed}
.fc-btn:focus-visible,.fc-sel select:focus-visible{outline:2px solid var(--cyan-bright);outline-offset:1px}
.fc-sel{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--text-mute)}
.fc-lab{margin-left:auto}
.fc-slim{flex-wrap:nowrap;gap:8px;min-height:38px}
.fc-symlabel{color:var(--cyan-bright);font-size:12px;padding:0 4px}
.fc-last{font-size:12.5px;font-weight:700;color:var(--text)}
.fc-stamp{font-size:11px;color:var(--text-mute);white-space:nowrap}
.fc-keys{display:flex;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none;flex:0 1 auto}
.fc-keys::-webkit-scrollbar{display:none}
.fc-key{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 7px;border:1px solid var(--nx-border);border-radius:4px;background:var(--panel-2);font-size:11px;color:var(--text-mute);white-space:nowrap}
.fc-key i{width:6px;height:6px;border-radius:50%}
.fc-key b{color:var(--text);font-weight:600}
.fc-add{margin-left:auto}
.fc-phone{display:none}
.fc-menu-scrim{position:fixed;inset:0;z-index:19}
.fc-menu.fc-add-menu{left:auto;right:0;width:290px;max-height:min(72dvh,560px);overflow-y:auto;gap:2px;padding:8px}
.fc-mhead{margin:6px 2px 2px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-mute)}
.fc-mhead:first-child{margin-top:0}
.fc-mtf,.fc-mtf-head{display:none;flex-wrap:wrap;gap:3px}
.fc-mtf button,.fc-mrange button{height:24px;padding:0 8px;border:1px solid var(--nx-border);border-radius:3px;background:var(--panel-2);color:var(--text-dim);font:600 11px 'JetBrains Mono',monospace;cursor:pointer}
.fc-mtf button.on,.fc-mrange button.on{color:var(--cyan-bright);border-color:var(--nx-border-hi)}
.fc-mrange{display:flex;gap:3px;padding:2px 2px 4px 24px}
.fc-mrange button:disabled{opacity:.4;cursor:not-allowed}
.fc-menu label.fc-mrow{display:flex;align-items:flex-start;gap:8px;padding:5px 4px;border-radius:4px;cursor:pointer}
.fc-mrow:hover{background:var(--panel-2)}
.fc-mrow input{margin-top:2px;accent-color:var(--cyan)}
.fc-mlabel{display:flex;flex-direction:column;gap:1px;font-size:11px;color:var(--text);min-width:0}
.fc-mlabel i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}
.fc-mlabel small{font-size:11px;color:var(--text-mute);line-height:1.35}
.fc-mactions{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--nx-border)}
.fc-body{position:relative;display:flex;flex:1;min-height:0}
.fc-body>.fc-chart{flex:1;min-width:0}
.fc-side{width:clamp(240px,22vw,320px);flex:none;display:flex;flex-direction:column;border-left:1px solid var(--nx-border);background:var(--panel-solid);min-height:0}
.fc-side-head{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-bottom:1px solid var(--nx-border);font-size:11px;color:var(--text-dim)}
.fc-side-head .fc-btn{height:22px;padding:0 6px}
.fc-side-body{flex:1;min-height:0;overflow:auto}
.fc-side-empty{padding:12px;font-size:11px;color:var(--text-mute)}
.fc-pop{position:relative}
.fc-menu{position:absolute;top:30px;left:0;z-index:20;display:grid;gap:6px;padding:8px 10px;min-width:150px;background:var(--panel-solid);border:1px solid var(--nx-border-hi);border-radius:6px;font-size:11px}
.fc-menu label{display:flex;gap:6px;align-items:center;cursor:pointer}
.fc-replay{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--nx-border);font-size:11px}
.fc-replay input[type=range]{flex:1;min-width:140px;accent-color:var(--cyan)}
.fc-mono{color:var(--text-dim)}
.fc-chart{position:relative;flex:1;min-height:320px;display:flex;flex-direction:column}
.fc-readout{position:absolute;top:6px;left:10px;right:80px;z-index:4;pointer-events:none;font-size:11px;line-height:1.55;color:var(--text);text-shadow:0 1px 2px rgba(0,0,0,.8)}
.fc-readout .dim{color:var(--text-mute)}
.fc-tip{position:absolute;display:none;z-index:6;pointer-events:none;max-width:260px;padding:6px 8px;border:1px solid var(--nx-border-hi);border-radius:5px;background:var(--panel-solid);font-size:11px;line-height:1.5;color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.45)}
.fc-status{display:flex;flex-wrap:wrap;gap:4px 14px;padding:5px 10px;border-top:1px solid var(--nx-border);font-size:11px;color:var(--text-mute)}
.fc-legend{display:inline-flex;align-items:center;gap:4px;color:var(--text-dim)}
.fc-legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:4px}
.fc-legend i.dash{width:12px;height:0;border-radius:0;border-top:1.5px dotted}
.fc-legend i.dia{border-radius:0;transform:rotate(45deg);width:6px;height:6px}
.fc-root.fc-fill{flex:1 1 0;height:auto;min-height:0}
.fc-compact{min-height:0;background:transparent;border:1px solid var(--nx-border);border-radius:6px;overflow:hidden}
.fc-compact .fc-chart{min-height:0}
.fc-wm{position:absolute;left:50%;top:50%;width:min(40%,300px);transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;opacity:.07;pointer-events:none;user-select:none;z-index:1;color:var(--text)}
.fc-wm-sym{font:800 clamp(28px,5vw,64px)/.95 'JetBrains Mono',ui-monospace,monospace;letter-spacing:-.02em;white-space:nowrap}
.fc-wm img{display:block;width:100%;height:auto}
html[data-mode=light] .fc-wm{opacity:.09}
@media (max-width:767px){.fc-wm{width:56%}.fc-wm-sym{font-size:clamp(24px,9vw,44px)}}
.fc-mini-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:4px 6px 4px 8px;border-bottom:1px solid var(--nx-border);font-size:11px;min-height:30px}
.fc-mini-head b{color:var(--cyan-bright)}
.fc-mini-px{color:var(--text)}
.fc-mini-layers{display:inline-flex;gap:4px;flex-wrap:wrap}
.fc-chip{display:inline-flex;align-items:center;gap:3px;padding:1px 5px;border:1px solid var(--nx-border);border-radius:3px;font-size:11px;color:var(--text-dim);letter-spacing:.04em}
.fc-chip i{width:6px;height:6px;border-radius:50%;display:inline-block}
.fc-chip.off{opacity:.45}
.fc-chip.warn{color:var(--amber)}
.fc-mini-tf{display:inline-flex;gap:1px;margin-left:auto}
.fc-mini-tf button{height:22px;padding:0 6px;border:1px solid transparent;border-radius:3px;background:transparent;color:var(--text-mute);font:600 11px 'JetBrains Mono',monospace;cursor:pointer}
.fc-mini-tf button:hover{color:var(--text)}
.fc-mini-tf button.on{color:var(--cyan-bright);border-color:var(--nx-border-hi);background:var(--panel-2)}
.fc-mini-tf button:focus-visible,.fc-expand:focus-visible{outline:2px solid var(--cyan-bright);outline-offset:1px}
.fc-expand{height:22px;padding:0 7px;font-size:12px}
/* CHART tab on a phone: the one chart fills the screen above the dock. */
@media (max-width:767px){
  .flowdash.dash-chart{display:flex;flex-direction:column;height:var(--qe-main-h,calc(100dvh - 140px));min-height:0}
  .flowdash.dash-chart .fd-simple{flex:1;min-height:0}
  .flowdash.dash-chart .fd-simple-main{height:auto;min-height:0}
}
@media (max-width:640px){
  .fc-root{height:auto;min-height:calc(100dvh - 140px)}
  .fc-chart{min-height:62dvh}
  .fc-slim{flex-wrap:wrap;gap:6px}
  .fc-slim .fc-sym{width:auto;flex:1 1 120px;order:0}
  .fc-slim .fc-keys{order:3;flex:1 1 100%}
  .fc-desk{display:none}
  .fc-phone{display:inline}
  .fc-mtf{display:flex}
  .fc-mtf-head{display:block}
  .fc-menu.fc-add-menu{position:fixed;left:8px;right:8px;top:auto;bottom:calc(8px + env(safe-area-inset-bottom));width:auto;max-height:72dvh;z-index:1001}
  .fc-menu-scrim{background:rgba(0,0,0,.45);z-index:1000}
  .fc-side{position:absolute;inset:0 0 0 auto;width:min(86vw,320px);z-index:8;box-shadow:-12px 0 30px rgba(0,0,0,.5)}
  .fc-lab{margin-left:0}
  .fc-readout{right:64px;font-size:11px}
  .fc-readout>div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fc-readout>div+div{display:none}
  .fc-root:not(.fc-compact) .fc-chart .chart-info-overlay{display:none}
  .fc-root.fc-fill{flex:1 1 0;height:auto;min-height:0}
  .fc-root.fc-fill .fc-chart{min-height:0}
  .fc-mini-layers{display:none}
}
`;

export default QEChart;
