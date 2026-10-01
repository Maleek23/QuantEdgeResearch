/**
 * DRAWINGS PRIMITIVE — renders the user's drawings inside lightweight-charts
 * as one series primitive (v5 plugin API), so they pan, zoom and rescale
 * (log / percent) with the chart for free and redraw only when the chart
 * does. React never re-renders to move a line: pointer moves update the
 * primitive's state and call requestUpdate().
 *
 * Geometry and hit-testing live in drawing-geometry.ts (pure, unit-tested);
 * this file only projects data → pixels and paints.
 */
import type {
  IChartApi, ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView, IPrimitivePaneRenderer,
  IPrimitivePaneView, Logical, PrimitiveHoveredItem, SeriesAttachedParameter, SeriesType, Time,
} from 'lightweight-charts';
import {
  channelOffsetLine, channelPriceOffset, fibLevels, fmtDuration, hitTestAll, logicalToX, measure, MOUSE_TOL, rayEnd,
  timeToLogical, type ColorRole, type Drawing, type HitPart, type HitTol, type Projected, type Pt,
} from './drawing-geometry';

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

export interface DrawingsState {
  drawings: Drawing[];
  selectedId: string | null;
  hoverId: string | null;
  /** The drawing being placed (its last anchor follows the pointer). */
  draft: Drawing | null;
  /** Ascending bar times (ms) of the series on screen, and the bar length. */
  times: number[];
  barMs: number;
  /** Hide every drawing (toolbar eye). */
  allHidden: boolean;
}

export interface DrawColors {
  role: (r: ColorRole) => string;
  surface: string;
  text: string;
  gain: string;
  loss: string;
}

const FONT = '600 11px "JetBrains Mono", ui-monospace, monospace';

export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private state: DrawingsState = { drawings: [], selectedId: null, hoverId: null, draft: null, times: [], barMs: 60_000, allHidden: false };
  private textW = new Map<string, number>();
  private size = { w: 0, h: 0 };
  /** True while a drawing tool is armed: the pane shows a crosshair cursor. */
  drawingMode = false;
  private readonly views: IPrimitivePaneView[];
  private axisViews: ISeriesPrimitiveAxisView[] = [];

  constructor(private colors: () => DrawColors) {
    const renderer: IPrimitivePaneRenderer = { draw: (t) => this.draw(t) };
    this.views = [{ renderer: () => renderer, zOrder: () => 'top' }];
  }

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<SeriesType>;
    this.request = p.requestUpdate;
  }
  detached() { this.chart = null; this.series = null; this.request = null; }

  paneViews() { return this.views; }
  priceAxisViews() { return this.axisViews; }
  updateAllViews() { this.rebuildAxisViews(); }

  set(patch: Partial<DrawingsState>) {
    this.state = { ...this.state, ...patch };
    this.rebuildAxisViews();
    this.request?.();
  }
  get(): DrawingsState { return this.state; }

  /* ── projection ── */

  logicalOf(t: number): number { return timeToLogical(this.state.times, t, this.state.barMs); }

  private x(t: number): number | null {
    const ts = this.chart?.timeScale();
    if (!ts) return null;
    return logicalToX((i) => ts.logicalToCoordinate(i as Logical), this.logicalOf(t));
  }
  private y(p: number): number | null {
    const c = this.series?.priceToCoordinate(p);
    return c == null ? null : c;
  }

  project(d: Drawing): Projected | null {
    const pts: Pt[] = [];
    for (const a of d.pts) {
      const x = this.x(a.t); const y = this.y(a.p);
      if (x == null || y == null) return null;
      pts.push({ x, y });
    }
    const pr: Projected = { d, pts, extra: {} };
    if (d.tool === 'channel' && d.pts.length >= 3) {
      const off = channelPriceOffset(d.pts[0], d.pts[1], d.pts[2]);
      const y0 = this.y(d.pts[0].p + off); const y1 = this.y(d.pts[1].p + off);
      pr.extra!.line2 = y0 != null && y1 != null ? [{ x: pts[0].x, y: y0 }, { x: pts[1].x, y: y1 }] : channelOffsetLine(pts[0], pts[1], pts[2]);
    }
    if (d.tool === 'fib' && d.pts.length >= 2) {
      pr.extra!.levelYs = fibLevels(d.pts[0].p, d.pts[1].p).map((l) => this.y(l.price)).filter((v): v is number => v != null);
    }
    if (d.tool === 'text') pr.extra!.textW = this.textW.get(d.id) ?? Math.max(24, (d.text ?? '').length * 7);
    return pr;
  }

  /** lightweight-charts asks this on every pointer move: drives the cursor. */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (this.drawingMode) return { externalId: 'draw', zOrder: 'top', cursorStyle: 'crosshair' };
    if (this.locked) return null;
    const h = this.hit(x, y, this.size.w, this.size.h);
    if (!h) return null;
    const d = this.state.drawings.find((v) => v.id === h.id);
    return { externalId: h.id, zOrder: 'top', cursorStyle: d?.locked ? 'default' : h.part.kind === 'handle' ? 'move' : 'pointer' };
  }

  /** Topmost drawing under (x, y) in pane pixels (the selected one's handles first). */
  hit(x: number, y: number, w: number, h: number, tol: HitTol = MOUSE_TOL): { id: string; part: HitPart } | null {
    if (this.state.allHidden) return null;
    const list: Projected[] = [];
    for (const d of this.state.drawings) { const p = this.project(d); if (p) list.push(p); }
    return hitTestAll(list, x, y, w, h, tol, this.state.selectedId);
  }
  /** "Lock all": nothing is grabbable, the cursor stays the chart's. */
  locked = false;
  /** The last pointer was a finger: draw bigger handles. */
  touchUi = false;

  /* ── axis labels for horizontal lines (and the selected drawing's anchors) ── */

  private rebuildAxisViews() {
    const { drawings, selectedId, allHidden } = this.state;
    const c = this.colors();
    const views: ISeriesPrimitiveAxisView[] = [];
    if (!allHidden && this.series) {
      for (const d of drawings) {
        if (d.hidden) continue;
        const anchors = d.tool === 'hline' || d.tool === 'hray' ? d.pts.slice(0, 1) : d.id === selectedId ? d.pts : [];
        for (const a of anchors) {
          const y = this.y(a.p);
          if (y == null) continue;
          const text = this.series.priceFormatter().format(a.p);
          const bg = c.role(d.color);
          views.push({ coordinate: () => y, text: () => text, textColor: () => c.surface, backColor: () => bg, visible: () => true, tickVisible: () => true });
        }
      }
    }
    this.axisViews = views;
  }

  /* ── paint ── */

  private draw(target: DrawTarget) {
    const { drawings, selectedId, hoverId, draft, allHidden } = this.state;
    if (!this.chart || !this.series) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width; const h = mediaSize.height;
      this.size = { w, h };
      const c = this.colors();
      ctx.save();
      ctx.font = FONT;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (!allHidden) {
        for (const d of drawings) {
          if (d.hidden) continue;
          const pr = this.project(d);
          if (pr) this.paint(ctx, pr, w, h, c, d.id === selectedId, d.id === hoverId);
        }
      }
      if (draft) {
        const pr = this.project(draft);
        if (pr) this.paint(ctx, pr, w, h, c, true, false);
      }
      ctx.restore();
    });
  }

  private paint(ctx: CanvasRenderingContext2D, pr: Projected, w: number, h: number, c: DrawColors, selected: boolean, hovered: boolean) {
    const { d, pts } = pr;
    const col = c.role(d.color);
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = d.width;
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const [a, b] = pts;
    const line = (p: Pt, q: Pt) => { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };

    switch (d.tool) {
      case 'trend':
        if (a && b) line(a, b);
        else if (a) this.dot(ctx, a, col);
        break;
      case 'ray':
        if (a && b) line(a, rayEnd(a, b, w, h));
        break;
      case 'hline':
        if (a) { line({ x: 0, y: a.y }, { x: w, y: a.y }); }
        break;
      case 'hray':
        if (a) line(a, { x: w, y: a.y });
        break;
      case 'vline':
        if (a) line({ x: a.x, y: 0 }, { x: a.x, y: h });
        break;
      case 'rect':
        if (a && b) {
          ctx.globalAlpha = 0.12;
          ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.globalAlpha = 1;
          ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        }
        break;
      case 'channel':
        if (a && b) {
          line(a, b);
          const l2 = pr.extra?.line2;
          if (l2 && pts[2]) {
            line(l2[0], l2[1]);
            ctx.globalAlpha = 0.08;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(l2[1].x, l2[1].y); ctx.lineTo(l2[0].x, l2[0].y); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 0.6;
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            line({ x: a.x, y: (a.y + l2[0].y) / 2 }, { x: b.x, y: (b.y + l2[1].y) / 2 });
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }
        }
        break;
      case 'fib':
        if (a && b) this.paintFib(ctx, pr, c, col);
        break;
      case 'text':
        if (a) {
          const label = d.text || 'Text';
          ctx.font = `600 ${11 + d.width}px "JetBrains Mono", ui-monospace, monospace`;
          const tw = ctx.measureText(label).width;
          this.textW.set(d.id, tw);
          ctx.fillStyle = col;
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(label, a.x, a.y);
          ctx.font = FONT;
          if (selected || hovered) {
            ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.strokeRect(a.x - 3, a.y - 14 - d.width, tw + 6, 18 + d.width);
            ctx.setLineDash([]); ctx.globalAlpha = 1;
          }
        }
        break;
      case 'arrow':
        if (a) {
          const up = d.dir !== 'down';
          const s = 7 + d.width * 1.5;
          const tip = up ? a.y + 2 : a.y - 2;
          const base = up ? tip + s * 1.4 : tip - s * 1.4;
          ctx.beginPath(); ctx.moveTo(a.x, tip); ctx.lineTo(a.x + s, base); ctx.lineTo(a.x - s, base); ctx.closePath(); ctx.fill();
        }
        break;
      case 'measure':
        if (a && b) this.paintMeasure(ctx, pr, c);
        break;
      case 'brush':
        if (pts.length > 1) {
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        break;
    }

    if ((selected || hovered) && d.tool !== 'brush') {
      // Locked drawings show square (non-grabbable) markers instead of handles.
      for (const p of pts) {
        if (d.locked) { ctx.fillStyle = col; ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
        else this.handle(ctx, p, col, c.surface, selected);
      }
    }
  }

  private paintFib(ctx: CanvasRenderingContext2D, pr: Projected, c: DrawColors, col: string) {
    const { d, pts } = pr;
    const [a, b] = pts;
    const x1 = Math.min(a.x, b.x); const x2 = Math.max(a.x, b.x);
    const levels = fibLevels(d.pts[0].p, d.pts[1].p);
    const ys = levels.map((l) => this.y(l.price));
    const fmt = this.series!.priceFormatter();
    for (let i = 0; i < levels.length; i++) {
      const y = ys[i]; if (y == null) continue;
      const yNext = ys[i + 1];
      if (yNext != null) {
        ctx.globalAlpha = i % 2 ? 0.05 : 0.09;
        ctx.fillStyle = col;
        ctx.fillRect(x1, Math.min(y, yNext), x2 - x1, Math.abs(yNext - y));
      }
      ctx.globalAlpha = levels[i].ratio === 0.5 || levels[i].ratio === 0.618 ? 1 : 0.75;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, d.width - (levels[i].ratio === 0 || levels[i].ratio === 1 ? 0 : 1));
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${levels[i].ratio} (${fmt.format(levels[i].price)})`, x1 - 4, y + 5);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    void c;
  }

  private paintMeasure(ctx: CanvasRenderingContext2D, pr: Projected, c: DrawColors) {
    const { d, pts } = pr;
    const [a, b] = pts;
    const m = measure(d.pts[0], d.pts[1], this.logicalOf(d.pts[0].t), this.logicalOf(d.pts[1].t));
    const col = m.dPrice >= 0 ? c.gain : c.loss;
    const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
    const bw = Math.abs(b.x - a.x); const bh = Math.abs(b.y - a.y);
    ctx.globalAlpha = 0.14; ctx.fillStyle = col; ctx.fillRect(x, y, bw, bh);
    ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1;
    // arrows across the box, TV-style
    const midX = (a.x + b.x) / 2; const midY = (a.y + b.y) / 2;
    ctx.beginPath(); ctx.moveTo(midX, a.y); ctx.lineTo(midX, b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, midY); ctx.lineTo(b.x, midY); ctx.stroke();
    const head = (tx: number, ty: number, dx: number, dy: number) => {
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - dx * 6 - dy * 4, ty - dy * 6 + dx * 4); ctx.lineTo(tx - dx * 6 + dy * 4, ty - dy * 6 - dx * 4); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    };
    if (bh > 8) head(midX, b.y, 0, b.y > a.y ? 1 : -1);
    if (bw > 8) head(b.x, midY, b.x > a.x ? 1 : -1, 0);
    const fmt = this.series!.priceFormatter();
    const sign = m.dPrice > 0 ? '+' : m.dPrice < 0 ? '−' : '';
    const l1 = `${sign}${fmt.format(Math.abs(m.dPrice))} (${sign}${Math.abs(m.pct).toFixed(2)}%)`;
    const l2 = `${Math.abs(m.bars)} bar${Math.abs(m.bars) === 1 ? '' : 's'}, ${fmtDuration(m.ms)}`;
    ctx.font = FONT;
    const tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 14;
    const up = b.y <= a.y;
    const bx = midX - tw / 2; const by = up ? y - 40 : y + bh + 6;
    ctx.globalAlpha = 0.95; ctx.fillStyle = col;
    roundRect(ctx, bx, by, tw, 34, 4); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = c.surface; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(l1, midX, by + 10); ctx.fillText(l2, midX, by + 24);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  private dot(ctx: CanvasRenderingContext2D, p: Pt, col: string) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
  }

  private handle(ctx: CanvasRenderingContext2D, p: Pt, col: string, surface: string, selected: boolean) {
    ctx.globalAlpha = 1;
    // Touch: a finger-sized handle on the selected drawing (the hit area is 20px).
    ctx.beginPath(); ctx.arc(p.x, p.y, selected ? (this.touchUi ? 8 : 5) : 4, 0, Math.PI * 2);
    ctx.fillStyle = surface; ctx.fill();
    ctx.lineWidth = selected ? 2 : 1.5; ctx.strokeStyle = col; ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
