/**
 * FLOW CHART — the CHART tab's default view: price with dealer positioning,
 * dark-pool levels and the options tape drawn on the same canvas
 * (Bullflow-style: GEX bubbles through time · DP levels · flow markers).
 *
 * One engine: this is NexusPriceChart (chart-engine drawChart) with three
 * layers passed through its underlay/overlay hooks — no second chart library,
 * no DOM node per bubble. Data: /api/chart/overlays/:symbol, every layer
 * stamped with source + age. The GEX timeline only exists from when the server
 * started recording it; the chart shows that start rather than inventing the
 * missing morning.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStockContext } from '@/contexts/stock-context';
import { NexusPriceChart } from '@/components/charting/nexus-price-chart';
import {
  useCandles, renderedCandleRange, TF_CONFIG,
  type Candle, type ChartGeometry,
} from '@/components/charting/chart-engine';
import { fmtAge } from '@/components/gex/gex-colors';
import { TerminalTickerSearch } from '@/components/terminal/terminal-ticker-search';
import '@/styles/nexus.css';

/* ─────────────────────────────── types ─────────────────────────────── */

interface FlowPrint {
  time: number; optionType: 'call' | 'put'; strike: number; expiry: string;
  contract: string; premium: number; fillPrice: number; contracts: number | null;
  alertNames: string[]; side: null;
}
interface DpLevel { price: number; notional: number; prints: number; date: string | null; firstDate: string | null }
interface OverlayPayload {
  symbol: string; range: string; dates: string[]; generatedAt: string;
  gexNow: null | { net: number; spot: number | null; topStrikes: { strike: number; gex: number }[]; asOf: string; ageSec: number | null; source: string };
  gexTimeline: {
    sampleEveryMin: number; recordingSince: string | null; asOf: string | null; ageSec: number | null;
    sources: string[]; note: string; watched: boolean;
    samples: { t: number; spot: number | null; net: number; source: string }[];
    series: { strike: number; points: [number, number][] }[];
  };
  darkPool: {
    source: string; asOf: string | null; ageSec: number | null; stale: boolean;
    windowFrom: string | null; windowTo: string | null; printsScanned: number; truncated?: boolean;
    levels: DpLevel[]; note: string;
  };
  flow: { source: string; streamState: string; asOf: string | null; ageSec: number | null; prints: FlowPrint[]; note: string };
}

type GexMode = 'bubbles' | 'lines' | 'off';
type RangeKey = '1D' | '5D' | 'ALL';
interface Prefs {
  tf: keyof typeof TF_CONFIG; range: RangeKey; extended: boolean; gex: GexMode;
  dp: boolean; flow: boolean; ma: boolean; volume: boolean;
}
const PREFS_KEY = 'qe-flowchart-v1';
const DEFAULT_PREFS: Prefs = { tf: '1m', range: '1D', extended: true, gex: 'bubbles', dp: true, flow: true, ma: false, volume: true };
const TFS: (keyof typeof TF_CONFIG)[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];
const INTRADAY = new Set(['1m', '5m', '15m', '30m', '1h', '4h']);

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (raw && typeof raw === 'object') return { ...DEFAULT_PREFS, ...raw, tf: TF_CONFIG[raw.tf] ? raw.tf : DEFAULT_PREFS.tf };
  } catch { /* storage unavailable */ }
  return DEFAULT_PREFS;
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function etInfo(ms: number): { date: string; mins: number } {
  const p: Record<string, string> = {};
  for (const part of ET_FMT.formatToParts(ms)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, mins: Number(p.hour) * 60 + Number(p.minute) };
}
const etClock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const shortDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: '2-digit' });
};
function fmtUsd(v: number, signed = false): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}
const ageOf = (iso: string | null, now: number) => (iso ? fmtAge((now - Date.parse(iso)) / 1000) : '—');
const fmtVol = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : `${v}`);

interface Tokens { pos: string; neg: string; dp: string; call: string; put: string; text: string; panel: string; mute: string }
function readTokens(el: HTMLElement | null): Tokens {
  const cs = el ? getComputedStyle(el) : null;
  const v = (name: string, fb: string) => (cs?.getPropertyValue(name).trim() || fb);
  return {
    pos: v('--cyan', '#3b8cff'), neg: v('--red', '#ff6b3d'), dp: v('--amber', '#facc15'),
    call: v('--green', '#6ee7b7'), put: v('--purple', '#a78bfa'), text: v('--text', '#e8ecf3'),
    panel: v('--panel-solid', '#0b0e14'), mute: v('--text-mute', '#8b93a3'),
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

export function FlowChartBoard({ onOpenLab }: { onOpenLab?: () => void }) {
  const { currentStock, setCurrentStock } = useStockContext();
  const symbol = currentStock?.symbol?.toUpperCase() || 'SPY';
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const set = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* non-critical */ }
      return next;
    });
  }, []);
  const { tf, range, extended } = prefs;
  const intraday = INTRADAY.has(tf);
  const [indOpen, setIndOpen] = useState(false);

  const { data: series } = useCandles(symbol, tf);

  /* ── session range + extended-hours filter (pre-replay) ── */
  const ranged = useMemo(() => {
    const bars = series?.bars ?? [];
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
  }, [series, intraday, extended, range]);

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

  // The chart hands over its raw series; the board has already applied the
  // session range (same query, same bars) — hand back that, cut at the
  // replay cursor.
  const transformBars = useCallback(
    (_bars: Candle[]) => (cutoff == null ? ranged : ranged.filter((b) => b.time <= cutoff)),
    [ranged, cutoff],
  );

  /* ── overlays ── */
  const lastClose = ranged.length ? ranged[ranged.length - 1].close : null;
  const lastCloseRef = useRef(lastClose);
  lastCloseRef.current = lastClose;
  const ovRange = range === '1D' && intraday ? '1D' : '5D';
  const { data: ov, isError: ovError, isLoading: ovLoading } = useQuery<OverlayPayload>({
    queryKey: ['/api/chart/overlays', symbol, ovRange],
    queryFn: async () => {
      const spot = lastCloseRef.current;
      const r = await fetch(`/api/chart/overlays/${encodeURIComponent(symbol)}?range=${ovRange}${spot ? `&spot=${spot}` : ''}`, { credentials: 'include' });
      if (!r.ok) throw new Error('overlays failed');
      return r.json();
    },
    staleTime: 45_000, refetchInterval: 60_000, retry: 1,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);

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

  /* ── OHLCV readout (deduped — the engine reports on every frame) ── */
  const [ohlc, setOhlc] = useState<Candle | null>(null);
  const ohlcKey = useRef('');
  const onHoverCandle = useCallback((c: Candle | null) => {
    const key = c ? `${c.time}:${c.close}:${c.volume}` : '';
    if (key === ohlcKey.current) return;
    ohlcKey.current = key;
    setOhlc(c);
  }, []);

  /* ── canvas layers ── */
  const hostRef = useRef<HTMLDivElement>(null);
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
        const r = 0.8 + (f.rMax - 0.8) * Math.sqrt(Math.abs(g) / f.maxAbs);
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
            if (t < geo.candles[0].time && end > geo.candles[0].time) i = 0; else continue;
          }
          for (; i < n && geo.candles[i].time < end; i++) {
            vals[i] = g; times[i] = t; srcs[i] = src;
            if (Math.abs(g) > maxAbs) maxAbs = Math.abs(g);
          }
        }
        f.bubbles.push({ strike: s.strike, vals, times, srcs });
      }
      f.maxAbs = maxAbs || 1;
      f.rMax = Math.max(1.6, Math.min(4.5, geo.candleW * 0.6));
      for (const b of f.bubbles) {
        const y = geo.priceToY(b.strike);
        for (let i = 0; i < n; i++) {
          const g = b.vals[i];
          if (!Number.isFinite(g)) continue;
          const m = Math.sqrt(Math.abs(g) / f.maxAbs);
          if (m < 0.04) continue;
          const r = 0.8 + (f.rMax - 0.8) * m;
          ctx.globalAlpha = 0.22 + 0.7 * m;
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
        ctx.strokeStyle = 'rgba(6,7,10,0.85)';
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
      ctx.fillStyle = '#06070a';
      ctx.fillText(lvl.price.toFixed(2), geo.right + 6, y + 3);
    }
  }, [prefs.dp]);

  /* ── readout values ── */
  const shown = ohlc ?? (ranged.length ? ranged[ranged.length - 1] : null);
  const prevClose = useMemo(() => {
    if (!ranged.length) return null;
    const lastDate = etInfo(ranged[ranged.length - 1].time).date;
    const bars = series?.bars ?? [];
    for (let i = bars.length - 1; i >= 0; i--) if (etInfo(bars[i].time).date < lastDate) return bars[i].close;
    return null;
  }, [ranged, series]);
  const lastPx = ranged.length ? ranged[ranged.length - 1].close : null;
  const chg = lastPx != null && prevClose ? (lastPx / prevClose - 1) * 100 : null;
  const tk0 = readTokens(hostRef.current);
  const gexSamples = ov?.gexTimeline.samples.length ?? 0;

  return (
    <div className="fc-root">
      <style>{FC_CSS}</style>
      {/* ── toolbar — wraps at phone width ── */}
      <div className="fc-toolbar" role="toolbar" aria-label="Chart controls">
        <div className="fc-sym">
          <TerminalTickerSearch compact value={symbol} onSelect={(r) => setCurrentStock({ symbol: r.symbol, name: r.name })} />
        </div>
        <div className="fc-px">
          <b>{symbol}</b>
          <span>{lastPx != null ? `$${lastPx.toFixed(2)}` : '—'}</span>
          {chg != null && <span style={{ color: chg >= 0 ? 'var(--green)' : 'var(--red)' }}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span>}
        </div>
        <label className="fc-sel" title="Timeframe">
          <select value={tf} onChange={(e) => set('tf', e.target.value as keyof typeof TF_CONFIG)} aria-label="Timeframe">
            {TFS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="fc-sel" title={intraday ? 'Session range' : 'Range applies to intraday timeframes'}>
          <select value={range} onChange={(e) => set('range', e.target.value as RangeKey)} aria-label="Range" disabled={!intraday}>
            <option value="1D">1D</option>
            <option value="5D">5D</option>
            <option value="ALL">All</option>
          </select>
        </label>
        <button className={`fc-btn${extended ? ' on' : ''}`} disabled={!intraday} onClick={() => set('extended', !extended)} aria-pressed={extended}>
          Extended: {extended ? 'On' : 'Off'}
        </button>
        <button
          className={`fc-btn${replay.on ? ' on' : ''}`}
          onClick={() => setReplay((r) => r.on ? { ...r, on: false, playing: false } : { on: true, idx: Math.min(ranged.length - 1, Math.max(1, Math.floor(ranged.length * 0.25))), playing: false, speed: r.speed })}
          aria-pressed={replay.on}
          disabled={ranged.length < 3}
        >⟲ Replay</button>
        <div className="fc-pop">
          <button className={`fc-btn${indOpen ? ' on' : ''}`} onClick={() => setIndOpen((o) => !o)} aria-expanded={indOpen}>Indicators ▾</button>
          {indOpen && (
            <div className="fc-menu" onMouseLeave={() => setIndOpen(false)}>
              <label><input type="checkbox" checked={prefs.ma} onChange={(e) => set('ma', e.target.checked)} /> MA 20 / 50</label>
              <label><input type="checkbox" checked={prefs.volume} onChange={(e) => set('volume', e.target.checked)} /> Volume</label>
            </div>
          )}
        </div>
        <label className="fc-sel fc-gex" title="GEX layer">
          <span>GEX:</span>
          <select value={prefs.gex} onChange={(e) => set('gex', e.target.value as GexMode)} aria-label="GEX layer">
            <option value="bubbles">Bubbles</option>
            <option value="lines">Lines</option>
            <option value="off">Off</option>
          </select>
        </label>
        <button className={`fc-btn${prefs.dp ? ' on' : ''}`} onClick={() => set('dp', !prefs.dp)} aria-pressed={prefs.dp}>Dark Pool: {prefs.dp ? 'On' : 'Off'}</button>
        <button className={`fc-btn${prefs.flow ? ' on' : ''}`} onClick={() => set('flow', !prefs.flow)} aria-pressed={prefs.flow}>Flow: {prefs.flow ? 'On' : 'Off'}</button>
        {onOpenLab && <button className="fc-btn fc-lab" onClick={onOpenLab} title="Chart Lab: published levels, watchlist, ES translation">Chart Lab ↗</button>}
      </div>

      {replay.on && ranged.length > 2 && (
        <div className="fc-replay">
          <button className="fc-btn" onClick={() => setReplay((r) => ({ ...r, idx: Math.max(0, r.idx - 1), playing: false }))} aria-label="Step back">◀</button>
          <button className="fc-btn on" onClick={() => setReplay((r) => ({ ...r, playing: !r.playing, idx: r.idx >= ranged.length - 1 ? 1 : r.idx }))}>{replay.playing ? '❚❚ Pause' : '▶ Play'}</button>
          <button className="fc-btn" onClick={() => setReplay((r) => ({ ...r, idx: Math.min(ranged.length - 1, r.idx + 1), playing: false }))} aria-label="Step forward">▶|</button>
          <label className="fc-sel"><select value={replay.speed} onChange={(e) => setReplay((r) => ({ ...r, speed: Number(e.target.value) }))} aria-label="Replay speed">
            {[1, 2, 5, 10].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select></label>
          <input type="range" min={1} max={ranged.length - 1} value={Math.min(replay.idx, ranged.length - 1)} onChange={(e) => setReplay((r) => ({ ...r, idx: Number(e.target.value), playing: false }))} aria-label="Replay position" />
          <span className="fc-mono">{cutoff != null ? `${new Date(cutoff).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET` : ''}</span>
        </div>
      )}

      {/* ── chart ── */}
      <div
        className="fc-chart"
        ref={hostRef}
        onPointerMoveCapture={(e) => {
          const canvas = hostRef.current?.querySelector('canvas');
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }}
        onPointerUp={(e) => {
          // Touch has no hover: a tap resolves against the last frame.
          if (e.pointerType === 'mouse') return;
          const canvas = hostRef.current?.querySelector('canvas');
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          resolveHover(e.clientX - rect.left, e.clientY - rect.top);
        }}
        onPointerLeave={() => { mouse.current = { x: -1, y: -1 }; hideTip(); }}
      >
        <NexusPriceChart
          key={symbol}
          symbol={symbol}
          tf={tf}
          onTfChange={(t) => set('tf', t)}
          hideControls
          fill
          expandable={false}
          crosshairTip={false}
          showMA={prefs.ma}
          showVolume={prefs.volume}
          transformBars={transformBars}
          defaultVisibleBars={intraday && range !== 'ALL' ? Math.max(15, ranged.length) : undefined}
          resetKey={`${range}:${extended}:${replay.on}`}
          underlay={underlay}
          overlay={overlay}
          axisOverlay={axisOverlay}
          onHoverCandle={onHoverCandle}
        />
        <div className="fc-readout" aria-live="off">
          <div>
            <b>{symbol}</b>{' '}
            <span className="dim">{shown ? new Date(shown.time).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</span>{' '}
            {shown && (
              <>
                <span className="dim">O</span> {shown.open.toFixed(2)}{' '}
                <span className="dim">H</span> {shown.high.toFixed(2)}{' '}
                <span className="dim">L</span> {shown.low.toFixed(2)}{' '}
                <span className="dim">C</span> <span style={{ color: shown.close >= shown.open ? 'var(--green)' : 'var(--red)' }}>{shown.close.toFixed(2)}</span>{' '}
                <span className="dim">V</span> {fmtVol(shown.volume)}
              </>
            )}
          </div>
          {prefs.gex !== 'off' && (
            <div>
              <span className="dim">GEX</span>{' '}
              {gexRead ? (
                <>
                  <span className="dim">Net</span> <span style={{ color: gexRead.net >= 0 ? tk0.pos : tk0.neg }}>{fmtUsd(gexRead.net, true)}</span>
                  {gexRead.top.slice(0, 3).map((s) => (
                    <span key={s.strike}> · {s.strike.toFixed(2)} <span style={{ color: s.gex >= 0 ? tk0.pos : tk0.neg }}>{fmtUsd(s.gex, true)}</span></span>
                  ))}
                  <span className="dim"> · {cutoff != null ? 'at cursor' : `${ageOf(gexRead.asOf, now)} ago`} · {gexRead.source}</span>
                </>
              ) : (
                <span className="dim">{ovLoading ? 'loading…' : ovError ? 'overlay feed unavailable' : 'no GEX snapshot for this symbol yet'}</span>
              )}
            </div>
          )}
        </div>
        <div className="fc-tip" ref={tipRef} role="tooltip" />
      </div>

      {/* ── status + disclosures: what each layer really has ── */}
      <div className="fc-status">
        <span className="fc-legend">
          <i style={{ background: tk0.pos }} />+GEX <i style={{ background: tk0.neg }} />−GEX
          <i className="dash" style={{ borderColor: tk0.dp }} />DP
          <i style={{ background: tk0.call }} />Call <i className="dia" style={{ background: tk0.put }} />Put
        </span>
        {ov && (
          <>
            <span title={ov.gexTimeline.note}>
              GEX timeline: {gexSamples
                ? `${gexSamples} samples since ${etClock(Date.parse(ov.gexTimeline.recordingSince!))} ET · every ${ov.gexTimeline.sampleEveryMin}m · ${ov.gexTimeline.sources.join('+')} · last ${ageOf(ov.gexTimeline.asOf, now)} ago`
                : 'not recorded yet for this symbol — starts now it is charted'}
            </span>
            <span title={ov.darkPool.note}>
              DP: {ov.darkPool.levels.length ? `${ov.darkPool.levels.length} levels near price` : 'none'}
              {ov.darkPool.windowFrom ? ` · ${ov.darkPool.windowFrom}→${ov.darkPool.windowTo}` : ''}
              {ov.darkPool.truncated ? ` · newest ${ov.darkPool.printsScanned} prints only` : ''}
              {ov.darkPool.asOf ? ` · ${ageOf(ov.darkPool.asOf, now)} old${ov.darkPool.stale ? ' (stale)' : ''}` : ` · ${ov.darkPool.note}`}
            </span>
            <span title={ov.flow.note}>
              Flow: {ov.flow.prints.length} prints · stream {ov.flow.streamState}{ov.flow.asOf ? ` · last ${ageOf(ov.flow.asOf, now)} ago` : ''} · side not reported
            </span>
          </>
        )}
        {ovError && <span style={{ color: 'var(--amber)' }}>Overlay feed unavailable — price only</span>}
      </div>
    </div>
  );
}

const FC_CSS = `
.fc-root{display:flex;flex-direction:column;height:calc(100dvh - 98px);min-height:460px;background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace}
.fc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--nx-border)}
.fc-sym{width:170px;min-width:120px}
.fc-px{display:flex;gap:6px;align-items:baseline;font-size:11px;padding:0 4px}
.fc-px b{color:var(--cyan-bright)}
.fc-btn,.fc-sel select{height:26px;padding:0 8px;border:1px solid var(--nx-border);border-radius:4px;background:var(--panel-2);color:var(--text-dim);font:600 10px 'JetBrains Mono',monospace;cursor:pointer;white-space:nowrap}
.fc-btn:hover:not(:disabled),.fc-sel select:hover:not(:disabled){border-color:var(--nx-border-hi);color:var(--text)}
.fc-btn.on{color:var(--cyan-bright);border-color:var(--nx-border-hi)}
.fc-btn:disabled,.fc-sel select:disabled{opacity:.45;cursor:not-allowed}
.fc-btn:focus-visible,.fc-sel select:focus-visible{outline:2px solid var(--cyan-bright);outline-offset:1px}
.fc-sel{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--text-mute)}
.fc-lab{margin-left:auto}
.fc-pop{position:relative}
.fc-menu{position:absolute;top:30px;left:0;z-index:20;display:grid;gap:6px;padding:8px 10px;min-width:150px;background:var(--panel-solid);border:1px solid var(--nx-border-hi);border-radius:6px;font-size:10.5px}
.fc-menu label{display:flex;gap:6px;align-items:center;cursor:pointer}
.fc-replay{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--nx-border);font-size:10px}
.fc-replay input[type=range]{flex:1;min-width:140px;accent-color:var(--cyan)}
.fc-mono{color:var(--text-dim)}
.fc-chart{position:relative;flex:1;min-height:320px;display:flex;flex-direction:column}
.fc-readout{position:absolute;top:6px;left:10px;right:80px;z-index:4;pointer-events:none;font-size:10px;line-height:1.55;color:var(--text);text-shadow:0 1px 2px rgba(0,0,0,.8)}
.fc-readout .dim{color:var(--text-mute)}
.fc-tip{position:absolute;display:none;z-index:6;pointer-events:none;max-width:260px;padding:6px 8px;border:1px solid var(--nx-border-hi);border-radius:5px;background:var(--panel-solid);font-size:10.5px;line-height:1.5;color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.45)}
.fc-status{display:flex;flex-wrap:wrap;gap:4px 14px;padding:5px 10px;border-top:1px solid var(--nx-border);font-size:9.5px;color:var(--text-mute)}
.fc-legend{display:inline-flex;align-items:center;gap:4px;color:var(--text-dim)}
.fc-legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:4px}
.fc-legend i.dash{width:12px;height:0;border-radius:0;border-top:1.5px dotted}
.fc-legend i.dia{border-radius:0;transform:rotate(45deg);width:6px;height:6px}
@media (max-width:640px){
  .fc-root{height:auto;min-height:calc(100dvh - 140px)}
  .fc-chart{min-height:62dvh}
  .fc-sym{width:100%;order:-2}
  .fc-lab{margin-left:0}
  .fc-readout{right:64px;font-size:9px}
  .fc-chart .chart-info-overlay{display:none}
}
`;

export default FlowChartBoard;
