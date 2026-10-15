/**
 * LABEL LAYOUT — where a canvas label may go without covering price.
 *
 * Pure (tested in scripts/test-charting-pro.ts). The layers primitive uses it
 * for Apex-node labels (they used to sit on top of candles) and the cone /
 * carried-forward captions (clipped at the right edge, colliding with wall
 * price tags).
 */

export interface Rect { x: number; y: number; w: number; h: number }

export const overlaps = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

export const inside = (r: Rect, bounds: Rect): boolean =>
  r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;

/** First candidate inside `bounds` that touches no obstacle, or null. */
export function placeLabel(candidates: Rect[], obstacles: readonly Rect[], bounds: Rect, pad = 2): Rect | null {
  for (const c of candidates) {
    if (!inside(c, bounds)) continue;
    if (obstacles.some((o) => overlaps(c, o, pad))) continue;
    return c;
  }
  return null;
}

/**
 * Candidate boxes around an anchor point (a node at x, y), in preference
 * order: right-above, right-below, left-above, left-below, then further up /
 * down the same side — a label moves off the candles rather than onto them.
 */
export function labelCandidates(x: number, y: number, w: number, h: number, gap = 9): Rect[] {
  const out: Rect[] = [];
  for (const dy of [-(h + 4), 4, -(h + 18), 18, -(h + 32), 32]) {
    out.push({ x: x + gap, y: y + dy, w, h });
    out.push({ x: x - gap - w, y: y + dy, w, h });
  }
  return out;
}

/** Candle bodies + wicks as rectangles (x centre, half width, y of high / low). */
export function candleRects(cols: { x: number; yHigh: number; yLow: number }[], halfW: number): Rect[] {
  return cols.map((c) => ({ x: c.x - halfW, y: Math.min(c.yHigh, c.yLow), w: halfW * 2, h: Math.abs(c.yLow - c.yHigh) || 1 }));
}

/**
 * A one-line caption that must stay inside [x0, maxX]: the full text when it
 * fits, else the short form, else null (skip it — never draw it clipped).
 */
export function fitText(full: string, short: string | null, avail: number, measure: (s: string) => number): string | null {
  if (avail <= 0) return null;
  if (measure(full) <= avail) return full;
  if (short && measure(short) <= avail) return short;
  return null;
}

/**
 * Run `fn` with every globalAlpha it sets scaled by `mult` (a per-layer opacity
 * from the Appearance settings) without touching the layer's own alpha logic:
 * an instance-level accessor shadows the prototype's for the duration only.
 */
export function withLayerAlpha(ctx: CanvasRenderingContext2D, mult: number | undefined, fn: () => void): void {
  if (mult == null || !(mult < 1)) { fn(); return; }
  const m = Math.max(0.05, mult);
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'globalAlpha');
  if (!desc?.get || !desc.set) { fn(); return; }
  const get = desc.get; const set = desc.set;
  Object.defineProperty(ctx, 'globalAlpha', { configurable: true, get: () => (get.call(ctx) as number) / m, set: (v: number) => set.call(ctx, v * m) });
  try { ctx.globalAlpha = 1; fn(); } finally { delete (ctx as unknown as Record<string, unknown>).globalAlpha; set.call(ctx, 1); }
}

/* ── AXIS / LEVEL LABEL COLLISION ──────────────────────────────────────────
 * Every right-edge level tag (walls, flip, gravity, key levels, the Path
 * target) competes for one column of ~16px rows. On a phone a dozen of them
 * land inside 60px and pile up. The layout: highest priority first, each tag
 * goes at its own y or the nearest free slot within `maxNudge` px; past the
 * density cap, or with no free slot, it is dropped and folded into a "+N"
 * chip at the cluster's y (tap lists them). Reserved rows (the series'
 * last-price tag + countdown) are obstacles nobody may cover.
 */

/** 0 = last price (reserved) · 1 = Path target · 2 = walls / flip · 3 = Apex / Gatekeeper / gravity · 4 = the rest. */
export type LabelTier = 0 | 1 | 2 | 3 | 4;

/** Tier from a level's title — the label text is the only thing every caller sets. */
export function levelTier(label: string): LabelTier {
  const t = label.toUpperCase();
  if (/^PATH\b/.test(t)) return 1;
  if (/CALL WALL|PUT WALL|ZERO-?Γ|ZERO GAMMA|\bFLIP\b|\bCW\b|\bPW\b/.test(t)) return 2;
  if (/APEX|GATEKEEPER|\bRUG\b|TRAMPOLINE|\bSTOP\b/.test(t)) return 3;
  return 4;
}

export type Density = 'low' | 'normal' | 'high';
/** How many level tags may render at once (the Path target counts; reserved rows do not). */
export function maxLevelLabels(density: Density, phone: boolean): number {
  if (phone) return density === 'low' ? 2 : density === 'high' ? 7 : 4;
  return density === 'low' ? 4 : density === 'high' ? 40 : 9;
}
/** Apex-node captions on the pane, same density knob. */
export function maxApexLabels(density: Density, phone: boolean): number {
  if (density === 'low') return 1;
  if (density === 'high') return phone ? 3 : 6;
  return phone ? 2 : 4;
}

export interface AxisLabelItem { id: string; y: number; tier: number }
export interface AxisLabelLayout {
  /** Tags that render, with the y they render at (dy = y - anchor y). */
  shown: { id: string; y: number; dy: number }[];
  /** Folded tags: one chip per cluster, at the cluster's y. */
  groups: { y: number; ids: string[] }[];
}
export interface AxisLayoutOpts {
  top: number; bottom: number;
  /** Row height incl. gap. */
  h: number;
  maxNudge: number;
  max: number;
  /** Rows nobody may cover (centre y). */
  reserved?: number[];
}

export function layoutAxisLabels(items: readonly AxisLabelItem[], o: AxisLayoutOpts): AxisLabelLayout {
  const half = o.h / 2;
  const taken: number[] = [...(o.reserved ?? [])];
  const free = (y: number) => y - half >= o.top && y + half <= o.bottom && taken.every((t) => Math.abs(t - y) >= o.h - 0.01);
  const order = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => Number.isFinite(it.y) && it.y >= o.top - half && it.y <= o.bottom + half)
    .sort((a, b) => a.it.tier - b.it.tier || a.i - b.i);
  const shown: AxisLabelLayout['shown'] = [];
  const dropped: AxisLabelItem[] = [];
  for (const { it } of order) {
    if (shown.length >= o.max) { dropped.push(it); continue; }
    // candidates: own y, then flush above / below each taken row, then the bounds — nearest first
    const cands = [it.y, o.top + half, o.bottom - half];
    for (const t of taken) cands.push(t - o.h, t + o.h);
    let best: number | null = null;
    for (const c of cands) {
      if (Math.abs(c - it.y) > o.maxNudge + 0.01 || !free(c)) continue;
      if (best == null || Math.abs(c - it.y) < Math.abs(best - it.y)) best = c;
    }
    if (best == null) { dropped.push(it); continue; }
    taken.push(best);
    shown.push({ id: it.id, y: best, dy: best - it.y });
  }
  // fold the dropped into chips: consecutive (by y) within 1.5 rows share one
  dropped.sort((a, b) => a.y - b.y);
  const groups: AxisLabelLayout['groups'] = [];
  let cur: AxisLabelItem[] = [];
  const flush = () => {
    if (!cur.length) return;
    const y = cur.reduce((s, x) => s + x.y, 0) / cur.length;
    groups.push({ y: Math.max(o.top + half, Math.min(o.bottom - half, y)), ids: cur.map((x) => x.id) });
    cur = [];
  };
  for (const d of dropped) {
    if (cur.length && d.y - cur[cur.length - 1].y > o.h * 1.5) flush();
    cur.push(d);
  }
  flush();
  return { shown, groups };
}
