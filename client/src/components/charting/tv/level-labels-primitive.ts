/**
 * LEVEL LABELS — the right-edge tags for dealer / key levels and the Path
 * target, laid out by label-layout.ts `layoutAxisLabels` every frame.
 *
 * The price lines themselves stay lightweight-charts price lines (title and
 * axis label off); this primitive owns the words: a pane tag (title) and an
 * axis tag (price) at the nudged y, a hairline leader when a tag moved off
 * its line, and the "+N" chips for the folded ones (reported through
 * `onGroups` so the pane can render tappable HTML chips).
 */
import type {
  IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView,
  SeriesAttachedParameter, SeriesType, Time,
} from 'lightweight-charts';
import { layoutAxisLabels, maxLevelLabels, type AxisLabelLayout, type Density } from './label-layout';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

export interface LevelTag { id: string; price: number; label: string; color: string; tier: number; alpha?: number }
export interface LevelLabelsInput {
  tags: LevelTag[];
  /** Series last value (its own axis tag) — reserved row. */
  lastPrice: number | null;
  /** The countdown sits one row under the last price. */
  countdown: boolean;
  density: Density;
  ink: string; panel: string;
  fmt: (n: number) => string;
}
export interface LevelGroup { y: number; tags: { label: string; price: number; color: string }[] }

const ROW = 16;
export const isPhoneWidth = (w: number) => w > 0 && w <= 480;

export class LevelLabelsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private input: LevelLabelsInput | null = null;
  private layout: AxisLabelLayout = { shown: [], groups: [] };
  private anchors = new Map<string, number>();
  private axis: ISeriesPrimitiveAxisView[] = [];
  private groupKey = '';
  private readonly views: IPrimitivePaneView[];

  constructor(private onGroups: (g: LevelGroup[]) => void) {
    const r: IPrimitivePaneRenderer = { draw: (t) => this.paint(t) };
    this.views = [{ renderer: () => r, zOrder: () => 'top' }];
  }
  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart as IChartApi; this.series = p.series as ISeriesApi<SeriesType>; this.request = p.requestUpdate; }
  detached() { this.chart = null; this.series = null; this.request = null; }
  paneViews() { return this.views; }
  priceAxisViews() { return this.axis; }
  setInput(i: LevelLabelsInput) { this.input = i; this.request?.(); }

  /** Pixel width of the chart pane (no price axis). */
  private paneW(): number { try { return this.chart?.paneSize(0).width ?? 0; } catch { return 0; } }

  updateAllViews() {
    const i = this.input; const s = this.series; const ch = this.chart;
    this.axis = [];
    if (!i || !s || !ch) { this.emit([]); return; }
    let size = { width: 0, height: 0 };
    try { size = ch.paneSize(0); } catch { /* not laid out */ }
    const phone = isPhoneWidth(size.width + (ch.priceScale('right').width() || 0));
    this.anchors.clear();
    const items: { id: string; y: number; tier: number }[] = [];
    for (const t of i.tags) {
      const y = s.priceToCoordinate(t.price);
      if (y == null) continue;
      this.anchors.set(t.id, y);
      items.push({ id: t.id, y, tier: t.tier });
    }
    const reserved: number[] = [];
    const yl = i.lastPrice != null ? s.priceToCoordinate(i.lastPrice) : null;
    if (yl != null) { reserved.push(yl); if (i.countdown) reserved.push(yl + 17); }
    this.layout = layoutAxisLabels(items, {
      top: 0, bottom: size.height || 1e6, h: ROW, maxNudge: phone ? ROW * 1.5 : ROW * 2.5,
      max: maxLevelLabels(i.density, phone), reserved,
    });
    const byId = new Map(i.tags.map((t) => [t.id, t]));
    for (const sh of this.layout.shown) {
      const t = byId.get(sh.id); if (!t) continue;
      const text = i.fmt(t.price);
      const a = t.alpha ?? 1;
      this.axis.push({
        coordinate: () => sh.y, fixedCoordinate: () => sh.y, text: () => text,
        textColor: () => i.ink, backColor: () => (a < 1 ? fade(t.color, Math.max(0.35, a)) : t.color), tickVisible: () => sh.dy === 0,
      } as ISeriesPrimitiveAxisView);
    }
    this.emit(this.layout.groups.map((g) => ({
      y: g.y,
      tags: g.ids.map((id) => byId.get(id)).filter((t): t is LevelTag => !!t).map((t) => ({ label: t.label, price: t.price, color: t.color })),
    })));
  }

  private emit(g: LevelGroup[]) {
    const key = g.map((x) => `${Math.round(x.y)}:${x.tags.map((t) => t.label).join('|')}`).join(';');
    if (key === this.groupKey) return;
    this.groupKey = key;
    // Out of the render pass: the pane sets React state from this.
    queueMicrotask(() => this.onGroups(g));
  }

  private paint(target: DrawTarget) {
    const i = this.input; if (!i || !this.layout.shown.length) return;
    const byId = new Map(i.tags.map((t) => [t.id, t]));
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width;
      ctx.save();
      ctx.font = '600 9px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      const maxW = Math.max(40, Math.min(150, w * 0.42));
      for (const sh of this.layout.shown) {
        const t = byId.get(sh.id); if (!t || !t.label) continue;
        const a = t.alpha ?? 1;
        let txt = t.label;
        while (txt.length > 3 && ctx.measureText(txt).width > maxW - 8) txt = txt.slice(0, -2);
        if (txt !== t.label) txt = `${txt.trimEnd()}…`;
        const tw = ctx.measureText(txt).width + 8;
        const x1 = w - 2; const y = Math.round(sh.y) + 0.5;
        if (sh.dy !== 0) {
          // leader from the tag back to its true line at the axis edge
          const y0 = Math.round(this.anchors.get(sh.id) ?? sh.y) + 0.5;
          ctx.globalAlpha = 0.7 * a; ctx.strokeStyle = t.color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x1 - tw, y); ctx.lineTo(x1 - tw - 6, y0); ctx.lineTo(w, y0); ctx.stroke();
        }
        ctx.globalAlpha = 0.9; ctx.fillStyle = i.panel; ctx.fillRect(x1 - tw, y - 7, tw, 14);
        ctx.globalAlpha = Math.max(0.45, a); ctx.strokeStyle = t.color; ctx.lineWidth = 1; ctx.strokeRect(x1 - tw + 0.5, y - 6.5, tw - 1, 13);
        ctx.fillStyle = t.color; ctx.fillText(txt, x1 - 4, y + 0.5);
      }
      ctx.restore();
    });
  }
}

/** Colour at alpha, for hex / rgb(a) inputs; anything else passes through. */
export function fade(color: string, a: number): string {
  const c = color.trim();
  if (a >= 1) return c;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    let h = hex[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length >= 3) {
      const base = p.length >= 4 ? Number(p[3]) : 1;
      return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${(Number.isFinite(base) ? base : 1) * a})`;
    }
  }
  return c;
}
