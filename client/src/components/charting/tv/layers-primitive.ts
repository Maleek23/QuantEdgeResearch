/**
 * QUANTEDGE LAYERS on the TradingView-style chart — the CHART tab's GEX orbs
 * through time, GEX top-strike lines, dark-pool levels, options-flow prints
 * and shaded zones, painted as one lightweight-charts series primitive.
 *
 * Same rules as the canvas engine's underlay/overlay (qe-chart.tsx compact):
 *   - a GEX sample covers its bars until the next sample, capped at 2.5× the
 *     cadence (hourly archive: 65 min) — a gap stays a gap;
 *   - flow: calls ● above the bar, puts ◆ below — option TYPE, not side;
 *   - dark pool: dotted line weighted by notional rank, price tag on the axis.
 * Per-bar orb values are computed when the data changes, never per frame;
 * the frame only paints the visible bars.
 *
 * Also here: the last-price countdown to bar close (a price-axis label under
 * the series' own last-value tag).
 */
import type {
  IChartApi, ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView, IPrimitivePaneRenderer,
  IPrimitivePaneView, Logical, SeriesAttachedParameter, SeriesType, Time,
} from 'lightweight-charts';
import type { Candle, Zone } from '@/components/charting/chart-engine';
import type { GexMode } from '@/components/charting/chart-prefs';
import { fmtUsd, type DpLevel, type FlowPrint, type OverlayPayload } from '@/components/charting/chart-layers';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

export interface LayerColors {
  pos: string; neg: string; dp: string; call: string; put: string; panel: string; caution: string;
  zone: (c: string | undefined) => string;
}

export interface LayersInput {
  bars: Candle[];
  ov: OverlayPayload | null;
  gex: GexMode;
  dp: boolean;
  flow: boolean;
  cutoff: number | null;
  gexTop: { strike: number; gex: number }[] | null;
  gexTopAsOf: number | null;
  zones: Zone[];
}

export type LayerHit =
  | { kind: 'flow'; p: FlowPrint }
  | { kind: 'dp'; lvl: DpLevel }
  | { kind: 'orb'; strike: number; g: number; t: number; src: string }
  | { kind: 'line'; strike: number; gex: number; t: number };

interface Bubble { strike: number; vals: Float64Array; times: Float64Array; srcs: string[] }

function indexAt(bars: Candle[], t: number, barMs: number): number {
  const n = bars.length;
  if (!n || t < bars[0].time || t >= bars[n - 1].time + barMs) return -1;
  let lo = 0; let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].time <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export class LayersPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private input: LayersInput = { bars: [], ov: null, gex: 'off', dp: false, flow: false, cutoff: null, gexTop: null, gexTopAsOf: null, zones: [] };
  private bubbles: Bubble[] = [];
  private maxAbs = 1;
  private barMs = 60_000;
  private frame: { dp: { y: number; lvl: DpLevel }[]; flow: { x: number; y: number; r: number; p: FlowPrint }[]; lines: { y: number; strike: number; gex: number }[]; rMax: number; spacing: number } =
    { dp: [], flow: [], lines: [], rMax: 3, spacing: 6 };
  private readonly views: IPrimitivePaneView[];
  private axis: ISeriesPrimitiveAxisView[] = [];

  constructor(private colors: () => LayerColors) {
    const bottom: IPrimitivePaneRenderer = { draw: () => {}, drawBackground: (t) => this.drawBack(t) };
    const top: IPrimitivePaneRenderer = { draw: (t) => this.drawFront(t) };
    this.views = [
      { renderer: () => bottom, zOrder: () => 'bottom' },
      { renderer: () => top, zOrder: () => 'normal' },
    ];
  }

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<SeriesType>;
    this.request = p.requestUpdate;
  }
  detached() { this.chart = null; this.series = null; this.request = null; }
  paneViews() { return this.views; }
  priceAxisViews() { return this.axis; }
  updateAllViews() { this.rebuildAxis(); }

  setInput(next: LayersInput) {
    const prev = this.input;
    this.input = next;
    if (prev.bars !== next.bars) {
      const gaps: number[] = [];
      for (let i = 1; i < next.bars.length; i++) gaps.push(next.bars[i].time - next.bars[i - 1].time);
      gaps.sort((a, b) => a - b);
      this.barMs = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 60_000;
    }
    if (prev.bars !== next.bars || prev.ov !== next.ov || prev.gex !== next.gex || prev.cutoff !== next.cutoff) this.computeBubbles();
    this.rebuildAxis();
    this.request?.();
  }

  /* orb values per bar, once per data change */
  private computeBubbles() {
    const { bars, ov, gex, cutoff } = this.input;
    this.bubbles = []; this.maxAbs = 1;
    if (gex !== 'bubbles' || !ov || bars.length < 2) return;
    const n = bars.length;
    const limit = cutoff ?? Infinity;
    const srcAt = new Map(ov.gexTimeline.samples.map((s) => [s.t, s.source]));
    const cadence = ov.gexTimeline.sampleEveryMin * 60_000;
    let maxAbs = 0;
    for (const s of ov.gexTimeline.series) {
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
        let i = indexAt(bars, t, this.barMs);
        if (i < 0) {
          if (t < bars[0].time && end > bars[0].time) i = 0; else continue;
        }
        for (; i < n && bars[i].time < end; i++) {
          vals[i] = g; times[i] = t; srcs[i] = src;
          if (Math.abs(g) > maxAbs) maxAbs = Math.abs(g);
        }
      }
      this.bubbles.push({ strike: s.strike, vals, times, srcs });
    }
    this.maxAbs = maxAbs || 1;
  }

  private dpLevels(): DpLevel[] {
    const { ov, dp, cutoff } = this.input;
    if (!dp || !ov) return [];
    return ov.darkPool.levels.filter((l) => {
      const first = l.firstDate ? Date.parse(l.firstDate) : null;
      return cutoff == null || first == null || first <= cutoff;
    });
  }

  private rebuildAxis() {
    const views: ISeriesPrimitiveAxisView[] = [];
    if (this.series) {
      const c = this.colors();
      const fmt = this.series.priceFormatter();
      for (const l of [...this.dpLevels()].sort((a, b) => b.notional - a.notional).slice(0, 6)) {
        const y = this.series.priceToCoordinate(l.price);
        if (y == null) continue;
        const txt = fmt.format(l.price);
        views.push({ coordinate: () => y, text: () => txt, textColor: () => c.panel, backColor: () => c.dp, visible: () => true, tickVisible: () => false });
      }
    }
    this.axis = views;
  }

  private visibleRange(n: number): [number, number] {
    const r = this.chart?.timeScale().getVisibleLogicalRange();
    if (!r) return [0, n - 1];
    return [Math.max(0, Math.floor(r.from) - 1), Math.min(n - 1, Math.ceil(r.to) + 1)];
  }

  private xOf(i: number): number | null {
    const c = this.chart?.timeScale().logicalToCoordinate(i as Logical);
    return c == null ? null : c;
  }

  /* zones + orbs + GEX lines + dark-pool lines: behind the candles */
  private drawBack(target: DrawTarget) {
    const { bars, gex, zones } = this.input;
    const series = this.series;
    if (!series || !this.chart) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const c = this.colors();
      const w = mediaSize.width; const h = mediaSize.height;
      this.frame = { dp: [], flow: this.frame.flow, lines: [], rMax: 3, spacing: 6 };
      ctx.save();

      for (const z of zones) {
        const y1 = series.priceToCoordinate(Math.max(z.from, z.to));
        const y2 = series.priceToCoordinate(Math.min(z.from, z.to));
        if (y1 == null || y2 == null) continue;
        ctx.globalAlpha = 0.08; ctx.fillStyle = c.zone(z.color);
        ctx.fillRect(0, y1, w, Math.max(1, y2 - y1));
        if (z.label) {
          ctx.globalAlpha = 0.7; ctx.font = '700 9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
          ctx.fillText(z.label, w - 6, y1 + 10);
        }
      }
      ctx.globalAlpha = 1;

      const n = bars.length;
      const x0 = this.xOf(0); const x1 = this.xOf(1);
      const spacing = x0 != null && x1 != null ? Math.abs(x1 - x0) : 6;
      this.frame.spacing = spacing;

      if (gex === 'bubbles' && this.bubbles.length && n > 1) {
        const [from, to] = this.visibleRange(n);
        const rMax = Math.max(1.6, Math.min(4.5, spacing * 0.6));
        this.frame.rMax = rMax;
        for (const b of this.bubbles) {
          const y = series.priceToCoordinate(b.strike);
          if (y == null || y < -10 || y > h + 10) continue;
          for (let i = from; i <= to; i++) {
            const g = b.vals[i];
            if (!Number.isFinite(g)) continue;
            const m = Math.sqrt(Math.abs(g) / this.maxAbs);
            if (m < 0.04) continue;
            const x = this.xOf(i); if (x == null) continue;
            const r = 0.8 + (rMax - 0.8) * m;
            ctx.globalAlpha = 0.22 + 0.7 * m;
            ctx.fillStyle = g >= 0 ? c.pos : c.neg;
            if (r < 1.4) ctx.fillRect(x - r, y - r, r * 2, r * 2);
            else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
          }
        }
        ctx.globalAlpha = 1;
      }

      const top = this.input.gexTop;
      if (gex === 'lines' && top?.length) {
        const maxAbs = Math.max(...top.map((x) => Math.abs(x.gex)), 1);
        for (const s of top) {
          const y = series.priceToCoordinate(s.strike);
          if (y == null) continue;
          const m = Math.sqrt(Math.abs(s.gex) / maxAbs);
          ctx.strokeStyle = s.gex >= 0 ? c.pos : c.neg;
          ctx.globalAlpha = 0.35 + 0.6 * m;
          ctx.lineWidth = 1 + 2.5 * m;
          ctx.setLineDash([6, 4]);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.95; ctx.fillStyle = ctx.strokeStyle;
          ctx.font = '700 9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
          ctx.fillText(`${s.strike.toFixed(2)} ${fmtUsd(s.gex, true)}`, 6, y - 4);
          this.frame.lines.push({ y, strike: s.strike, gex: s.gex });
        }
        ctx.globalAlpha = 1;
      }

      const lvls = this.dpLevels();
      if (lvls.length) {
        const topN = Math.max(...lvls.map((l) => l.notional), 1);
        for (const l of lvls) {
          const yy = series.priceToCoordinate(l.price);
          if (yy == null) continue;
          const y = Math.round(yy) + 0.5;
          const m = Math.sqrt(l.notional / topN);
          ctx.strokeStyle = c.dp; ctx.globalAlpha = 0.35 + 0.55 * m; ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          ctx.setLineDash([]);
          this.frame.dp.push({ y, lvl: l });
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    });
  }

  /* flow prints: over the candles */
  private drawFront(target: DrawTarget) {
    const { bars, ov, flow, cutoff } = this.input;
    const series = this.series;
    this.frame.flow = [];
    if (!series || !flow || !ov || !bars.length) return;
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const c = this.colors();
      const prints = ov.flow.prints.filter((p) => cutoff == null || p.time <= cutoff);
      const maxPrem = Math.max(...prints.map((p) => p.premium), 1);
      ctx.save();
      for (const p of prints) {
        const i = indexAt(bars, p.time, this.barMs);
        if (i < 0) continue;
        const x = this.xOf(i); if (x == null) continue;
        const bar = bars[i];
        const hi = bar.clampedHigh ? Math.max(bar.open, bar.close) : bar.high;
        const lo = bar.clampedLow ? Math.min(bar.open, bar.close) : bar.low;
        const r = Math.max(2.5, Math.min(8, 2 + 6 * Math.sqrt(p.premium / maxPrem)));
        const yb = series.priceToCoordinate(p.optionType === 'call' ? hi : lo);
        if (yb == null) continue;
        const y = p.optionType === 'call' ? yb - r - 3 : yb + r + 3;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.optionType === 'call' ? c.call : c.put;
        ctx.strokeStyle = c.panel; ctx.lineWidth = 1;
        ctx.beginPath();
        if (p.optionType === 'call') ctx.arc(x, y, r, 0, Math.PI * 2);
        else { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
        ctx.fill(); ctx.stroke();
        this.frame.flow.push({ x, y, r, p });
      }
      ctx.restore();
    });
  }

  /** What is under (x, y) in pane pixels — flow marker › dark-pool line › orb › GEX line. */
  hit(x: number, y: number): LayerHit | null {
    const f = this.frame;
    let best: { d: number; p: FlowPrint } | null = null;
    for (const h of f.flow) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= h.r + 4 && (!best || d < best.d)) best = { d, p: h.p };
    }
    if (best) return { kind: 'flow', p: best.p };
    const dp = f.dp.find((r) => Math.abs(r.y - y) <= 4);
    if (dp) return { kind: 'dp', lvl: dp.lvl };
    if (this.input.gex === 'bubbles' && this.series && this.chart) {
      const l = this.chart.timeScale().coordinateToLogical(x);
      const idx = l == null ? -1 : Math.round(l);
      if (idx >= 0 && idx < this.input.bars.length) {
        let hit: LayerHit | null = null; let hd = Infinity;
        for (const b of this.bubbles) {
          const g = b.vals[idx];
          if (!Number.isFinite(g)) continue;
          const by = this.series.priceToCoordinate(b.strike);
          if (by == null) continue;
          const d = Math.abs(by - y);
          const r = 0.8 + (f.rMax - 0.8) * Math.sqrt(Math.abs(g) / this.maxAbs);
          if (d <= Math.max(r, 5) && d < hd) { hd = d; hit = { kind: 'orb', strike: b.strike, g, t: b.times[idx], src: b.srcs[idx] }; }
        }
        if (hit) return hit;
      }
    }
    const ln = f.lines.find((r) => Math.abs(r.y - y) <= 4);
    if (ln) return { kind: 'line', strike: ln.strike, gex: ln.gex, t: this.input.gexTopAsOf ?? Date.now() };
    return null;
  }
}

/* ───────────────────────── countdown to bar close ───────────────────────── */

const ET_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
/** ms until the next 16:00 ET on a weekday (the daily bar's close). */
export function msToDailyClose(now: number): number {
  const p: Record<string, string> = {};
  for (const part of ET_PARTS.formatToParts(now)) p[part.type] = part.value;
  const secs = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
  const close = 16 * 3600;
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return -1;
  return secs < close ? (close - secs) * 1000 : -1;
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return h ? `${pad(h)}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

export class CountdownPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private last: { time: number; close: number; up: boolean } | null = null;
  private tf = '5m';
  private barMs = 300_000;
  private enabled = true;
  private views: ISeriesPrimitiveAxisView[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private colors: () => { up: string; down: string; ink: string }) {}

  attached(p: SeriesAttachedParameter<Time>) {
    this.series = p.series as ISeriesApi<SeriesType>;
    this.request = p.requestUpdate;
    this.timer = setInterval(() => { if (this.enabled && this.last) this.request?.(); }, 1000);
  }
  detached() { if (this.timer) clearInterval(this.timer); this.timer = null; this.series = null; this.request = null; }

  set(last: { time: number; close: number; up: boolean } | null, tf: string, barMs: number, enabled: boolean) {
    this.last = last; this.tf = tf; this.barMs = barMs; this.enabled = enabled;
    this.request?.();
  }

  remaining(now = Date.now()): number {
    if (!this.last) return -1;
    if (this.tf === '1D') return msToDailyClose(now);
    if (this.tf === '1W') return -1;
    const left = this.last.time + this.barMs - now;
    return left > 0 && left <= this.barMs ? left : -1;
  }

  updateAllViews() {
    const last = this.last; const s = this.series;
    if (!this.enabled || !last || !s) { this.views = []; return; }
    const left = this.remaining();
    const y = s.priceToCoordinate(last.close);
    if (left < 0 || y == null) { this.views = []; return; }
    const c = this.colors();
    const text = fmtCountdown(left);
    const bg = last.up ? c.up : c.down;
    // Sits under the series' own last-price tag (the axis de-collides labels).
    this.views = [{ coordinate: () => y + 17, text: () => text, textColor: () => c.ink, backColor: () => bg, tickVisible: () => false }];
  }
  priceAxisViews() { return this.views; }
}
