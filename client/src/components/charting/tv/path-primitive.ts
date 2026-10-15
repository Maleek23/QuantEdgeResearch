/**
 * PATH FAN on the TradingView-style chart — the Monte-Carlo modelled scenario
 * (shared/path-projection.ts via /api/chart/path) painted past the last candle:
 *
 *   80% fan (p10–p90) and 50% fan (p25–p75) as filled bands whose alpha fades
 *   toward the horizon (the further out, the less it should be read), the
 *   median as a line, a right-edge terminal density (horizontal histogram),
 *   Gatekeeper / Rug / Trampoline ticks at their prices, and a hover readout
 *   (time → 50% / 80% range + median) when the crosshair is in the future.
 *   Frozen snapshots (09:40 / close) draw as dashed outlines from where they
 *   were computed, over the realized candles, so a past day reads
 *   "as computed then" against what price did.
 *
 * Future x: one bar slot per `barMs` of RTH trading time after the last bar
 * (tradingMsBetween), so overnight gaps do not stretch the fan.
 * Canvas 2D, media coordinates, one gradient per band per frame.
 */
import type { IChartApi, ISeriesApi, ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView, Logical, MouseEventParams, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';
import { pathAt, tradingMsBetween, PATH_DISCLAIMER, type PathResult } from '@shared/path-projection';
import type { Candle } from '@/components/charting/chart-engine';
import { firstBarAtOrAfter } from './layers-primitive';
import { withLayerAlpha } from './label-layout';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];
export interface PathColors { fan: string; median: string; text: string; panel: string; frozen: string; gate: string; rug: string; tramp: string }
export interface PathDraw {
  live: PathResult | null;
  frozen: { label: string; result: PathResult }[];
  bands: 'both' | '50' | '80';
  density: boolean;
  opacity: number;
  lineWidth: number;
}

export class PathPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private bars: Candle[] = [];
  private barMs = 300_000;
  private draw: PathDraw | null = null;
  private hoverX: number | null = null;
  /** Future-time compression so the whole horizon fits the space right of the last candle (≤ 1). */
  private squeeze = 1;
  private paneW = 0;
  private readonly views: IPrimitivePaneView[];
  private onMove = (p: MouseEventParams<Time>) => {
    const x = p.point?.x ?? null;
    if (x !== this.hoverX) { this.hoverX = x; this.request?.(); }
  };

  constructor(private colors: () => PathColors) {
    const r: IPrimitivePaneRenderer = { draw: (t) => this.paint(t) };
    this.views = [{ renderer: () => r, zOrder: () => 'normal' }];
  }
  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi; this.series = p.series as ISeriesApi<SeriesType>; this.request = p.requestUpdate;
    this.chart.subscribeCrosshairMove(this.onMove);
  }
  detached() { this.chart?.unsubscribeCrosshairMove(this.onMove); this.chart = null; this.series = null; this.request = null; }
  paneViews() { return this.views; }
  /** Keep the 80% fan in view: the price scale autoscales over it (live fan only). */
  autoscaleInfo() {
    const r = this.draw?.live;
    if (!r || !r.points.length) return null;
    let lo = Infinity; let hi = -Infinity;
    for (const p of r.points) { if (p.p10 < lo) lo = p.p10; if (p.p90 > hi) hi = p.p90; }
    return Number.isFinite(lo) && Number.isFinite(hi) ? { priceRange: { minValue: lo, maxValue: hi } } : null;
  }
  setInput(bars: Candle[], barMs: number, draw: PathDraw | null) { this.bars = bars; this.barMs = barMs || 300_000; this.draw = draw; this.request?.(); }

  /** x for a time: inside the bars by bar index, past them by trading time. */
  private xAt(t: number): number | null {
    const ts = this.chart?.timeScale(); const bars = this.bars; const n = bars.length;
    if (!ts || !n) return null;
    const last = bars[n - 1].time;
    if (t <= last) {
      const i = Math.min(n - 1, firstBarAtOrAfter(bars, t));
      return ts.logicalToCoordinate(i as Logical);
    }
    // Past the data, extrapolate from the last bar's x and the bar spacing (logicalToCoordinate
    // is not reliable beyond the series).
    const xL = ts.logicalToCoordinate((n - 1) as Logical);
    if (xL == null) return null;
    return xL + this.slotsBetween(last, t) * this.squeeze * this.spacing();
  }
  private spacing(): number {
    const ts = this.chart?.timeScale(); const n = this.bars.length;
    if (!ts || n < 2) return 6;
    const a = ts.logicalToCoordinate((n - 2) as Logical); const b = ts.logicalToCoordinate((n - 1) as Logical);
    return a != null && b != null && b > a ? b - a : ts.options().barSpacing;
  }
  private slotsBetween(a: number, b: number) {
    return this.barMs >= 20 * 3_600_000 ? tradingMsBetween(a, b) / 23_400_000 : tradingMsBetween(a, b) / this.barMs;
  }
  /** Fit the live horizon into the free space past the last candle (leaving room for the density + axis tags). */
  private fitSqueeze(r: PathResult | null) {
    this.squeeze = 1;
    const ts = this.chart?.timeScale(); const n = this.bars.length;
    if (!r || !ts || !n || !this.paneW) return;
    const xL = ts.logicalToCoordinate((n - 1) as Logical);
    if (xL == null) return;
    const spacing = Math.max(0.5, this.spacing());
    const free = (this.paneW - 52 - xL) / spacing;
    const need = this.slotsBetween(this.bars[n - 1].time, r.endMs);
    if (need > 0 && free > 4 && free < need) this.squeeze = free / need;
  }
  private timeAtX(x: number, r: PathResult): number | null {
    // invert by scanning the output points (≤ 160) — cheap and exact enough
    let best: number | null = null; let bd = Infinity;
    for (const p of r.points) { const px = this.xAt(p.t); if (px == null) continue; const d = Math.abs(px - x); if (d < bd) { bd = d; best = p.t; } }
    return best;
  }

  private paint(target: DrawTarget) {
    const d = this.draw; const series = this.series;
    if (!d || !series || !this.bars.length) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const c = this.colors();
      this.paneW = mediaSize.width;
      this.fitSqueeze(d.live);
      withLayerAlpha(ctx, d.opacity, () => {
        ctx.save();
        for (const f of d.frozen) this.paintFrozen(ctx, f.result, f.label, c);
        if (d.live) this.paintLive(ctx, d.live, d, c, mediaSize.width, mediaSize.height);
        ctx.restore();
      });
    });
  }

  private band(r: PathResult, lo: 'p10' | 'p25', hi: 'p90' | 'p75') {
    const up: [number, number][] = []; const dn: [number, number][] = [];
    for (const p of r.points) {
      const x = this.xAt(p.t); const yU = this.series!.priceToCoordinate(p[hi]); const yD = this.series!.priceToCoordinate(p[lo]);
      if (x == null || yU == null || yD == null) continue;
      up.push([x, yU]); dn.push([x, yD]);
    }
    return { up, dn };
  }

  private paintLive(ctx: CanvasRenderingContext2D, r: PathResult, d: PathDraw, c: PathColors, w: number, h: number) {
    const x0 = this.xAt(r.points[0]?.t ?? 0);
    const xEnd = this.xAt(r.endMs);
    if (x0 == null || xEnd == null || xEnd <= x0) return;
    const fade = (a0: number, a1: number) => {
      const g = ctx.createLinearGradient(x0, 0, xEnd, 0);
      g.addColorStop(0, withA(c.fan, a0)); g.addColorStop(1, withA(c.fan, a1));
      return g;
    };
    const fill = (b: { up: [number, number][]; dn: [number, number][] }, style: CanvasGradient) => {
      if (b.up.length < 2) return;
      ctx.beginPath(); ctx.moveTo(b.up[0][0], b.up[0][1]);
      for (const [x, y] of b.up) ctx.lineTo(x, y);
      for (let k = b.dn.length - 1; k >= 0; k--) ctx.lineTo(b.dn[k][0], b.dn[k][1]);
      ctx.closePath(); ctx.fillStyle = style; ctx.fill();
    };
    const b80 = this.band(r, 'p10', 'p90'); const b50 = this.band(r, 'p25', 'p75');
    if (d.bands !== '50') fill(b80, fade(0.16, 0.05));
    if (d.bands !== '80') fill(b50, fade(0.26, 0.09));
    // 80% edges: hairline so the band reads at a glance on light backgrounds
    if (d.bands !== '50') {
      ctx.strokeStyle = withA(c.fan, 0.45); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      for (const pts of [b80.up, b80.dn]) { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // median
    ctx.strokeStyle = c.median; ctx.lineWidth = 1 + d.lineWidth * 0.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    r.points.forEach((p, k) => { const x = this.xAt(p.t); const y = this.series!.priceToCoordinate(p.p50); if (x == null || y == null) return; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();

    // terminal density — horizontal histogram hugging the fan's end
    if (d.density && r.terminal.bins.length && w - x0 > 140) {
      const maxB = Math.max(...r.terminal.bins, 1);
      const nb = r.terminal.bins.length; const step = (r.terminal.hi - r.terminal.lo) / nb;
      const xd = Math.min(w - 40, xEnd + 4); const dw = 30;
      r.terminal.bins.forEach((v, i) => {
        ctx.fillStyle = withA(c.fan, 0.12 + 0.6 * (v / maxB));
        const yA = this.series!.priceToCoordinate(r.terminal.lo + (i + 1) * step); const yB = this.series!.priceToCoordinate(r.terminal.lo + i * step);
        if (yA == null || yB == null) return;
        ctx.fillRect(xd, Math.min(yA, yB), Math.max(1, (v / maxB) * dw), Math.max(1, Math.abs(yB - yA) - 0.5));
      });
    }

    // badges at their prices, on the fan's far edge
    ctx.font = '700 9px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (const b of r.badges) {
      const y = this.series!.priceToCoordinate(b.price); if (y == null) continue;
      const col = b.kind === 'gatekeeper' ? c.gate : b.kind === 'rug' ? c.rug : c.tramp;
      const txt = b.kind === 'gatekeeper' ? 'GATE' : b.kind === 'rug' ? 'RUG' : 'TRAMP';
      const tw = ctx.measureText(txt).width + 8; const bx = Math.max(x0 + tw + 2, xEnd - 2);
      ctx.fillStyle = withA(col, 0.18); ctx.fillRect(bx - tw, y - 6, tw, 12);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(bx - tw + 0.5, y - 5.5, tw - 1, 11);
      ctx.fillStyle = col; ctx.fillText(txt, bx - 4, y + 0.5);
    }

    // caption — the honesty line, always on
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '600 9px "JetBrains Mono", monospace';
    const capY = b80.dn.length ? Math.min(h - 12, (b80.dn[Math.min(b80.dn.length - 1, 3)]?.[1] ?? h - 12) + 4) : h - 12;
    ctx.fillStyle = withA(c.text, 0.7);
    ctx.fillText(`Path · ${PATH_DISCLAIMER}${this.squeeze < 0.98 ? ' · future time compressed to fit' : ''}`, x0 + 6, capY);

    // hover readout
    if (this.hoverX != null && this.hoverX > x0 + 2 && this.hoverX <= xEnd + 2) {
      const t = this.timeAtX(this.hoverX, r); const v = t != null ? pathAt(r, t) : null;
      if (v && t != null) {
        const x = this.xAt(t)!;
        ctx.strokeStyle = withA(c.median, 0.5); ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.setLineDash([]);
        const f = (n: number) => n.toFixed(n >= 100 ? 1 : 2);
        const lines = [fmtTime(t), `median ${f(v.p50)}`, `50%  ${f(v.p25)} – ${f(v.p75)}`, `80%  ${f(v.p10)} – ${f(v.p90)}`];
        ctx.font = '600 10px "JetBrains Mono", monospace';
        const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14; const bh = lines.length * 14 + 8;
        const bx = x + 8 + bw > w - 60 ? x - 8 - bw : x + 8; const by = 8;
        ctx.fillStyle = withA(c.panel, 0.94); ctx.strokeStyle = withA(c.median, 0.35);
        ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = c.text; ctx.textBaseline = 'top';
        lines.forEach((l, i) => { ctx.globalAlpha = i ? 1 : 0.7; ctx.fillText(l, bx + 7, by + 5 + i * 14); });
        ctx.globalAlpha = 1;
      }
    }
    ctx.textBaseline = 'alphabetic';
  }

  private paintFrozen(ctx: CanvasRenderingContext2D, r: PathResult, label: string, c: PathColors) {
    const b = this.band(r, 'p10', 'p90');
    if (b.up.length < 2) return;
    ctx.strokeStyle = withA(c.frozen, 0.7); ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    for (const pts of [b.up, b.dn]) { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.setLineDash([1, 3]); ctx.beginPath();
    r.points.forEach((p, k) => { const x = this.xAt(p.t); const y = this.series!.priceToCoordinate(p.p50); if (x == null || y == null) return; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = withA(c.frozen, 0.9); ctx.font = '700 9px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(label, b.up[0][0] + 3, b.up[0][1] - 2);
    ctx.textBaseline = 'alphabetic';
  }
}

function fmtTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)) + ' ET';
}
/** Any CSS colour → same colour at alpha a (hex, rgb(), or falls back to globalAlpha-free string). */
export function withA(col: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(col.trim());
  if (m) { const n = parseInt(m[1], 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  const r = /^rgba?\(([^)]+)\)$/i.exec(col.trim());
  if (r) { const [R, G, B] = r[1].split(',').map((s) => s.trim()); return `rgba(${R},${G},${B},${a})`; }
  return col;
}
