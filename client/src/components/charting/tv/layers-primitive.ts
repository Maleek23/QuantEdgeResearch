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
import type { GexMetric, GexMode } from '@/components/charting/chart-prefs';
import { fmtUsd, type DpLevel, type FlowPrint, type OverlayPayload } from '@/components/charting/chart-layers';
import { capNodes } from '@shared/gex-horizon';

/** Nodes kept per bar (largest |value| first) — performance and legibility. */
export const NODES_PER_BAR = 8;
/** VEX rings per bar when GEX + VEX are both on. */
export const VEX_RINGS_WITH_GEX = 5;
/** Forward projection: at most this many bar slots past the last candle. */
const PROJECT_MAX_SLOTS = 48;

type DrawTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

export interface LayerColors {
  pos: string; neg: string; dp: string; call: string; put: string; panel: string; caution: string;
  zone: (c: string | undefined) => string;
  /** Node colours — the GEX hub law (gex-colors LEVEL_COLORS / exposure tokens), not gain/loss. */
  gexPos?: string; gexNeg?: string; vexPos?: string; vexNeg?: string; apex?: string; em?: string; text?: string;
}

/** Expected-move layer: fixed priced ranges + a forward cone (all from /api/chart/expected-move). */
export interface EmDraw {
  daily: { upper: number; lower: number; move: number } | null;
  weekly: { upper: number; lower: number; move: number } | null;
  cone: { perSessionMove: number } | null;
  /** ms of trading time in one session (390 min); daily bars count as one session each. */
  sessionMs: number;
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
  /** GEX / VEX / both on the nodes (default GEX). */
  metric?: GexMetric;
  /** Apex-node labels. */
  labels?: boolean;
  /** Carry the latest nodes forward past the last candle, dimmer. */
  project?: boolean;
  em?: EmDraw | null;
}

export type LayerHit =
  | { kind: 'flow'; p: FlowPrint }
  | { kind: 'dp'; lvl: DpLevel }
  | { kind: 'orb'; strike: number; g: number; t: number; src: string; metric?: 'gex' | 'vex'; apex?: boolean; projected?: boolean }
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

/** Index of the first bar whose open time is ≥ t (bars.length when none). */
export function firstBarAtOrAfter(bars: Candle[], t: number): number {
  let lo = 0; let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

interface ProjNode { y: number; strike: number; g: number; metric: 'gex' | 'vex'; apex: boolean }

export class LayersPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private input: LayersInput = { bars: [], ov: null, gex: 'off', dp: false, flow: false, cutoff: null, gexTop: null, gexTopAsOf: null, zones: [] };
  private bubbles: Bubble[] = [];
  private vbubbles: Bubble[] = [];
  /** Apex-node strike per bar (NaN = none). */
  private apexStrike = new Float64Array(0);
  private maxAbs = 1;
  private vMaxAbs = 1;
  private barMs = 60_000;
  private frame: {
    dp: { y: number; lvl: DpLevel }[]; flow: { x: number; y: number; r: number; p: FlowPrint }[]; lines: { y: number; strike: number; gex: number }[];
    rMax: number; spacing: number; norm?: number; vnorm?: number;
    proj: { x0: number; x1: number; nodes: ProjNode[] } | null;
  } = { dp: [], flow: [], lines: [], rMax: 3, spacing: 6, proj: null };
  /** Orbs painted in the last frame (0 = none on screen). */
  orbsDrawn = 0;
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
    if (prev.bars !== next.bars || prev.ov !== next.ov || prev.gex !== next.gex || prev.cutoff !== next.cutoff || prev.metric !== next.metric) this.computeBubbles();
    this.rebuildAxis();
    this.request?.();
  }

  /* node values per bar, once per data change.
     Rule: a bar shows the nearest snapshot taken at or before the bar's open
     time (bars of 4h and longer: before the bar's close — one snapshot per
     day bar would otherwise never land), as long as it is no older than 2.5×
     the cadence (hourly archive: 65 min) — a gap stays a gap. The forming
     last bar shows the newest snapshot (that IS "now"); in replay nothing
     after the cursor. Then each bar keeps its NODES_PER_BAR largest nodes. */
  private fill(series: { strike: number; points: [number, number][] }[], srcAt: Map<number, string>, cadence: number, limit: number): { out: Bubble[]; maxAbs: number } {
    const { bars } = this.input;
    const n = bars.length;
    const long = this.barMs >= 4 * 3_600_000;
    const now = Date.now();
    const out: Bubble[] = [];
    let maxAbs = 0;
    for (const s of series) {
      const vals = new Float64Array(n).fill(NaN);
      const times = new Float64Array(n).fill(NaN);
      const srcs: string[] = new Array(n);
      const pts = s.points;
      let k = -1;
      for (let i = 0; i < n; i++) {
        const bt = bars[i].time;
        let ref = long ? bt + this.barMs - 1 : bt;
        if (i === n - 1) ref = Math.max(ref, now);
        ref = Math.min(ref, limit);
        while (k + 1 < pts.length && pts[k + 1][0] <= ref) k++;
        if (k < 0) continue;
        const [t, g] = pts[k];
        const src = srcAt.get(t) ?? 'recorded';
        const span = src === 'archive-hourly' ? 65 * 60_000 : cadence * 2.5;
        if (t < bt - span) continue;
        vals[i] = g; times[i] = t; srcs[i] = src;
        if (Math.abs(g) > maxAbs) maxAbs = Math.abs(g);
      }
      out.push({ strike: s.strike, vals, times, srcs });
    }
    return { out, maxAbs };
  }

  private cap(list: Bubble[], cap: number) {
    const n = this.input.bars.length;
    if (!list.length) return;
    const col = new Float64Array(list.length);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < list.length; j++) col[j] = list[j].vals[i];
      const { keep } = capNodes(col, cap);
      if (keep.length === list.length) continue;
      const keepSet = new Set(keep);
      for (let j = 0; j < list.length; j++) if (!keepSet.has(j)) list[j].vals[i] = NaN;
    }
  }

  private computeBubbles() {
    const { bars, ov, gex, cutoff } = this.input;
    const metric = this.input.metric ?? 'gex';
    this.bubbles = []; this.vbubbles = []; this.maxAbs = 1; this.vMaxAbs = 1;
    this.apexStrike = new Float64Array(bars.length).fill(NaN);
    if (gex !== 'bubbles' || !ov || bars.length < 2) return;
    const limit = cutoff ?? Infinity;
    const srcAt = new Map(ov.gexTimeline.samples.map((s) => [s.t, s.source]));
    const cadence = (ov.gexTimeline.sampleEveryMin || 5) * 60_000;
    if (metric !== 'vex') {
      const g = this.fill(ov.gexTimeline.series, srcAt, cadence, limit);
      this.bubbles = g.out; this.maxAbs = g.maxAbs || 1;
      this.cap(this.bubbles, NODES_PER_BAR);
    }
    if (metric !== 'gex' && ov.gexTimeline.vexSeries?.length) {
      const v = this.fill(ov.gexTimeline.vexSeries, srcAt, cadence, limit);
      this.vbubbles = v.out; this.vMaxAbs = v.maxAbs || 1;
      this.cap(this.vbubbles, metric === 'both' ? VEX_RINGS_WITH_GEX : NODES_PER_BAR);
    }
    // Apex node per bar: the largest GEX node (VEX when only VEX is shown).
    const lead = metric === 'vex' ? this.vbubbles : this.bubbles;
    for (let i = 0; i < bars.length; i++) {
      let best = -1; let bestAbs = 0;
      for (let j = 0; j < lead.length; j++) {
        const a = Math.abs(lead[j].vals[i]);
        if (Number.isFinite(a) && a > bestAbs) { bestAbs = a; best = j; }
      }
      if (best >= 0) this.apexStrike[i] = lead[best].strike;
    }
  }

  /** Nodes painted (for tests / status): GEX discs + VEX rings on the last bar. */
  lastBarNodes(): { strike: number; g: number; metric: 'gex' | 'vex'; apex: boolean }[] {
    const L = this.input.bars.length - 1;
    if (L < 0) return [];
    const metric = this.input.metric ?? 'gex';
    const out: { strike: number; g: number; metric: 'gex' | 'vex'; apex: boolean }[] = [];
    for (const [list, kind] of [[this.bubbles, 'gex'], [this.vbubbles, 'vex']] as const) {
      for (const b of list) if (Number.isFinite(b.vals[L])) out.push({ strike: b.strike, g: b.vals[L], metric: kind, apex: (kind === 'vex') === (metric === 'vex') && this.apexStrike[L] === b.strike });
    }
    return out;
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
      this.frame = { dp: [], flow: this.frame.flow, lines: [], rMax: 3, spacing: 6, proj: null };
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

      this.frame.proj = null;
      if (gex === 'bubbles' && (this.bubbles.length || this.vbubbles.length) && n > 1) {
        this.drawNodes(ctx, w, h, spacing);
      } else this.orbsDrawn = 0;

      if (this.input.em) this.drawEm(ctx, w, spacing);

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

  /** GEX discs, VEX rings, the Apex node + labels, and the forward projection. */
  private drawNodes(ctx: CanvasRenderingContext2D, w: number, h: number, spacing: number) {
    const series = this.series!;
    const { bars } = this.input;
    const n = bars.length;
    const c = this.colors();
    const gexPos = c.gexPos ?? c.pos; const gexNeg = c.gexNeg ?? c.neg;
    const vexPos = c.vexPos ?? c.pos; const vexNeg = c.vexNeg ?? c.neg;
    const apexC = c.apex ?? c.caution;
    const metric = this.input.metric ?? 'gex';
    const [from, to] = this.visibleRange(n);
    const rMax = Math.max(2.4, Math.min(6, spacing * 0.7));
    this.frame.rMax = rMax;
    const onScreen = (list: Bubble[]) => {
      const rows: { b: Bubble; y: number }[] = []; let visMax = 0;
      for (const b of list) {
        const y = series.priceToCoordinate(b.strike);
        if (y == null || y < -10 || y > h + 10) continue;
        rows.push({ b, y });
        for (let i = from; i <= to; i++) { const a = Math.abs(b.vals[i]); if (a > visMax) visMax = a; }
      }
      return { rows, visMax };
    };
    // Scale to what is on screen: a huge wall off the price scale must not shrink every visible node.
    const G = onScreen(this.bubbles); const V = onScreen(this.vbubbles);
    const norm = G.visMax || this.maxAbs; const vnorm = V.visMax || this.vMaxAbs;
    this.frame.norm = norm; this.frame.vnorm = vnorm;
    let drawn = 0;
    const apexAt: { i: number; x: number; y: number; strike: number; g: number }[] = [];

    for (const { b, y } of G.rows) {
      for (let i = from; i <= to; i++) {
        const g = b.vals[i];
        if (!Number.isFinite(g)) continue;
        const m = Math.sqrt(Math.abs(g) / norm);
        const apex = metric !== 'vex' && this.apexStrike[i] === b.strike;
        if (m < 0.04 && !apex) continue;
        const x = this.xOf(i); if (x == null) continue;
        const r = 1 + (rMax - 1) * Math.min(1, m);
        ctx.fillStyle = g >= 0 ? gexPos : gexNeg;
        if (apex) {
          ctx.globalAlpha = 1; ctx.shadowColor = apexC; ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(x, y, r + 0.5, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = apexC; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.stroke();
          apexAt.push({ i, x, y, strike: b.strike, g });
        } else {
          ctx.globalAlpha = 0.28 + 0.6 * m;
          if (r < 1.4) ctx.fillRect(x - r, y - r, r * 2, r * 2);
          else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
        }
        drawn++;
      }
    }
    for (const { b, y } of V.rows) {
      for (let i = from; i <= to; i++) {
        const v = b.vals[i];
        if (!Number.isFinite(v)) continue;
        const m = Math.sqrt(Math.abs(v) / vnorm);
        const apex = metric === 'vex' && this.apexStrike[i] === b.strike;
        if (m < 0.06 && !apex) continue;
        const x = this.xOf(i); if (x == null) continue;
        const r = 1.5 + (rMax + (metric === 'both' ? 1.5 : 0) - 1.5) * Math.min(1, m);
        ctx.strokeStyle = v >= 0 ? vexPos : vexNeg;
        ctx.globalAlpha = apex ? 1 : 0.3 + 0.6 * m;
        ctx.lineWidth = apex ? 2 : 1.2;
        if (apex) { ctx.shadowColor = apexC; ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        if (apex) {
          ctx.strokeStyle = apexC; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.stroke();
          apexAt.push({ i, x, y, strike: b.strike, g: v });
        }
        drawn++;
      }
    }
    ctx.globalAlpha = 1;

    // ── forward projection: the last bar's nodes carried past the last candle (dimmer)
    const L = n - 1;
    const xL = this.xOf(L);
    let projApex: { x: number; y: number; strike: number; g: number } | null = null;
    if (this.input.project && xL != null && xL < w - spacing) {
      const slots = Math.min(PROJECT_MAX_SLOTS, Math.floor((w - xL) / Math.max(spacing, 1)));
      const nodes: ProjNode[] = [];
      const lists: Array<[Bubble[], number, 'gex' | 'vex']> = [[this.bubbles, norm, 'gex'], [this.vbubbles, vnorm, 'vex']];
      for (const [list, nn, kind] of lists) {
        for (const b of list) {
          const g = b.vals[L];
          if (!Number.isFinite(g)) continue;
          const y = series.priceToCoordinate(b.strike);
          if (y == null || y < -10 || y > h + 10) continue;
          const apex = (kind === 'vex') === (metric === 'vex') && this.apexStrike[L] === b.strike;
          nodes.push({ y, strike: b.strike, g, metric: kind, apex });
          const m = Math.sqrt(Math.abs(g) / nn);
          const r = (kind === 'vex' ? 1.5 : 1) + (rMax - 1) * Math.min(1, m);
          for (let k = 1; k <= slots; k++) {
            const x = xL + k * spacing;
            const fade = 1 - (k / (slots + 1)) * 0.6;
            ctx.globalAlpha = (apex ? 0.55 : 0.2 + 0.4 * m) * 0.5 * fade;
            if (kind === 'vex') { ctx.strokeStyle = g >= 0 ? vexPos : vexNeg; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
            else { ctx.fillStyle = g >= 0 ? gexPos : gexNeg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
          }
          if (apex) {
            projApex = { x: xL + slots * spacing, y, strike: b.strike, g };
            ctx.globalAlpha = 0.6; ctx.strokeStyle = apexC; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(xL, y); ctx.lineTo(xL + slots * spacing, y); ctx.stroke(); ctx.setLineDash([]);
          }
        }
      }
      this.frame.proj = { x0: xL, x1: xL + slots * spacing, nodes };
      ctx.globalAlpha = 0.35; ctx.strokeStyle = c.text ?? apexC; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(xL + spacing / 2, 0); ctx.lineTo(xL + spacing / 2, h); ctx.stroke(); ctx.setLineDash([]);
      if (this.input.labels !== false && slots >= 8) {
        ctx.globalAlpha = 0.75; ctx.fillStyle = c.text ?? apexC; ctx.font = '600 9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
        ctx.fillText('current nodes carried forward · not a forecast', xL + spacing, 12);
      }
      ctx.globalAlpha = 1;
    }

    // ── Apex labels: where the Apex node changes strike, the last bar, and the projection end
    if (this.input.labels !== false) {
      const picks: { x: number; y: number; strike: number; g: number; tag?: string }[] = [];
      let prevStrike = NaN;
      for (const a of apexAt.sort((p, q) => p.i - q.i)) {
        if (a.strike !== prevStrike || a.i === L) picks.push(a);
        prevStrike = a.strike;
      }
      const chosen: typeof picks = [];
      for (const p of picks.reverse()) { // newest first, kept apart so labels never stack
        if (chosen.some((q) => Math.abs(q.x - p.x) < 110 && Math.abs(q.y - p.y) < 16)) continue;
        chosen.push(p);
        if (chosen.length >= 6) break;
      }
      if (projApex) {
        const pa: { x: number; y: number; strike: number; g: number } = projApex;
        if (!chosen.some((q) => Math.abs(q.x - pa.x) < 110 && Math.abs(q.y - pa.y) < 16)) chosen.push({ ...pa, tag: 'now' });
      }
      const kindLabel = metric === 'vex' ? 'VEX' : 'GEX';
      for (const p of chosen) this.apexLabel(ctx, p.x, p.y, `Apex ${fmtStrike(p.strike)} · ${kindLabel} ${fmtUsd(p.g, true)}${p.tag ? ` · ${p.tag}` : ''}`, apexC, c.panel, w);
    }
    this.orbsDrawn = drawn;
  }

  private apexLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, panel: string, w: number) {
    ctx.font = '700 10px "JetBrains Mono", monospace';
    const tw = ctx.measureText(text).width + 10;
    let lx = x + 9; if (lx + tw > w - 4) lx = x - 9 - tw;
    const ly = Math.max(9, y - 10);
    ctx.globalAlpha = 0.92; ctx.fillStyle = panel;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(lx, ly - 7, tw, 15, 3); else ctx.rect(lx, ly - 7, tw, 15);
    ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, lx + 5, ly + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  /** Expected move: today / this-week priced ranges (fixed lines) + the forward cone. */
  private drawEm(ctx: CanvasRenderingContext2D, w: number, spacing: number) {
    const em = this.input.em; const series = this.series;
    if (!em || !series) return;
    const c = this.colors();
    const col = c.em ?? c.caution;
    const line = (price: number, dash: number[], label: string, alpha: number) => {
      const yy = series.priceToCoordinate(price); if (yy == null) return;
      const y = Math.round(yy) + 0.5;
      ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = Math.min(1, alpha + 0.3); ctx.fillStyle = col; ctx.font = '600 9px "JetBrains Mono", monospace'; ctx.textAlign = 'left';
      ctx.fillText(label, 6, y - 3);
    };
    if (em.daily) {
      line(em.daily.upper, [5, 4], `EM day +${em.daily.move.toFixed(2)} · priced range (options)`, 0.55);
      line(em.daily.lower, [5, 4], `EM day −${em.daily.move.toFixed(2)}`, 0.55);
    }
    if (em.weekly) {
      line(em.weekly.upper, [10, 5], `EM week +${em.weekly.move.toFixed(2)} · priced range (options)`, 0.45);
      line(em.weekly.lower, [10, 5], `EM week −${em.weekly.move.toFixed(2)}`, 0.45);
    }
    const { bars } = this.input;
    const n = bars.length;
    const xL = n ? this.xOf(n - 1) : null;
    if (em.cone && xL != null && xL < w - spacing && n) {
      const center = bars[n - 1].close;
      const slots = Math.min(240, Math.floor((w - xL) / Math.max(spacing, 1)));
      // one bar = barMs of trading time; a daily (or longer) bar = one session
      const perBar = this.barMs >= 20 * 3_600_000 ? Math.round(this.barMs / 86_400_000) || 1 : this.barMs / em.sessionMs;
      const up: [number, number][] = []; const dn: [number, number][] = [];
      for (let k = 0; k <= slots; k++) {
        const half = em.cone.perSessionMove * Math.sqrt(k * perBar);
        const yU = series.priceToCoordinate(center + half); const yD = series.priceToCoordinate(center - half);
        if (yU == null || yD == null) continue;
        up.push([xL + k * spacing, yU]); dn.push([xL + k * spacing, yD]);
      }
      if (up.length > 1) {
        ctx.globalAlpha = 0.07; ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(up[0][0], up[0][1]);
        for (const [x, y] of up) ctx.lineTo(x, y);
        for (let k = dn.length - 1; k >= 0; k--) ctx.lineTo(dn[k][0], dn[k][1]);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.5; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        for (const pts of [up, dn]) { ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
        ctx.setLineDash([]);
        const [ex, ey] = dn[dn.length - 1];
        ctx.globalAlpha = 0.85; ctx.fillStyle = col; ctx.font = '600 9px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
        ctx.fillText('priced range (options) · √t cone, modelled', Math.min(ex, w - 4), ey + 12);
      }
    }
    ctx.globalAlpha = 1;
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

  /** What is under (x, y) in pane pixels — flow marker › dark-pool line › orb › GEX line.
   *  `tol` widens every target (a fingertip: ~12px; the mouse: 4). */
  hit(x: number, y: number, tol = 4): LayerHit | null {
    const f = this.frame;
    let best: { d: number; p: FlowPrint } | null = null;
    for (const h of f.flow) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= h.r + tol && (!best || d < best.d)) best = { d, p: h.p };
    }
    if (best) return { kind: 'flow', p: best.p };
    const dp = f.dp.reduce<{ y: number; lvl: DpLevel } | null>((b, r) => (Math.abs(r.y - y) <= tol && (!b || Math.abs(r.y - y) < Math.abs(b.y - y)) ? r : b), null);
    if (dp) return { kind: 'dp', lvl: dp.lvl };
    if (this.input.gex === 'bubbles' && this.series && this.chart) {
      const pj = f.proj;
      if (pj && x > pj.x0 + f.spacing / 2 && x <= pj.x1 + f.spacing) {
        let near: ProjNode | null = null; let nd = Infinity;
        for (const p of pj.nodes) {
          const d = Math.abs(p.y - y);
          if (d <= Math.max(f.rMax, tol + 1) && d < nd) { nd = d; near = p; }
        }
        if (near) {
          const L = this.input.bars.length - 1;
          const src = (near.metric === 'vex' ? this.vbubbles : this.bubbles).find((b) => b.strike === near!.strike);
          return { kind: 'orb', strike: near.strike, g: near.g, t: src ? src.times[L] : NaN, src: 'carried forward (current nodes, not a forecast)', metric: near.metric, apex: near.apex, projected: true };
        }
      }
      const l = this.chart.timeScale().coordinateToLogical(x);
      const idx = l == null ? -1 : Math.round(l);
      if (idx >= 0 && idx < this.input.bars.length) {
        let hit: LayerHit | null = null; let hd = Infinity;
        const lists: Array<[Bubble[], number, 'gex' | 'vex']> = [[this.bubbles, f.norm ?? this.maxAbs, 'gex'], [this.vbubbles, f.vnorm ?? this.vMaxAbs, 'vex']];
        const metric = this.input.metric ?? 'gex';
        for (const [list, nn, kind] of lists) {
          for (const b of list) {
            const g = b.vals[idx];
            if (!Number.isFinite(g)) continue;
            const by = this.series.priceToCoordinate(b.strike);
            if (by == null) continue;
            const d = Math.abs(by - y);
            const r = 1 + (f.rMax - 1) * Math.sqrt(Math.min(1, Math.abs(g) / nn));
            if (d <= Math.max(r, tol + 1) && d < hd) {
              hd = d;
              const apex = (kind === 'vex') === (metric === 'vex') && this.apexStrike[idx] === b.strike;
              hit = { kind: 'orb', strike: b.strike, g, t: b.times[idx], src: b.srcs[idx], metric: kind, apex };
            }
          }
        }
        if (hit) return hit;
      }
    }
    const ln = f.lines.find((r) => Math.abs(r.y - y) <= tol);
    if (ln) return { kind: 'line', strike: ln.strike, gex: ln.gex, t: this.input.gexTopAsOf ?? Date.now() };
    return null;
  }
}

const fmtStrike = (k: number) => (Number.isInteger(k) ? String(k) : k.toFixed(2));

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
    if (this.timer) clearInterval(this.timer); // re-attach without a detach must not stack timers
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
