/**
 * DRAWING GEOMETRY — the pure maths behind the chart's drawing tools.
 *
 * No DOM, no chart library: everything here takes numbers and returns numbers
 * so it is unit-tested directly (scripts/test-chart-drawings.ts).
 *
 * Coordinates:
 *   - A drawing is stored in DATA space: anchors are { t: epoch ms, p: price }.
 *     Time, not bar index, so a line drawn on 5m still sits on the same moment
 *     on 1h or 1D, and survives new bars arriving.
 *   - On screen the chart maps time → a fractional LOGICAL bar index (bar i at
 *     logical i; between bars interpolated; past the last bar extrapolated at
 *     the bar length) → x. Price → y goes through the series' own scale, so
 *     log and percent scales need nothing special here.
 *   - Hit-testing is done in PIXEL space on the projected points.
 */

export type DrawTool =
  | 'trend' | 'ray' | 'hline' | 'hray' | 'vline' | 'rect' | 'channel'
  | 'fib' | 'text' | 'arrow' | 'measure' | 'brush';
export type ToolId = 'cursor' | DrawTool;

/** Palette ROLES, resolved per visual mode at draw time — never a hex. */
export type ColorRole = 'accent' | 'gain' | 'loss' | 'caution' | 'marker' | 'info' | 'text' | 'dim';
export const COLOR_ROLES: ColorRole[] = ['accent', 'info', 'gain', 'loss', 'caution', 'marker', 'text', 'dim'];
export const LINE_WIDTHS = [1, 2, 3, 4] as const;
export type LineWidth = (typeof LINE_WIDTHS)[number];

export interface Anchor { t: number; p: number }

export interface Drawing {
  id: string;
  tool: DrawTool;
  pts: Anchor[];
  color: ColorRole;
  width: LineWidth;
  /** text tool: the label. */
  text?: string;
  /** arrow tool: which way the marker points. */
  dir?: 'up' | 'down';
  locked?: boolean;
  hidden?: boolean;
}

/** Anchors each tool takes. 0 = freehand (brush: press, drag, release). */
export const TOOL_POINTS: Record<DrawTool, number> = {
  trend: 2, ray: 2, hline: 1, hray: 1, vline: 1, rect: 2, channel: 3,
  fib: 2, text: 1, arrow: 1, measure: 2, brush: 0,
};

export const DEFAULT_TOOL_COLOR: Record<DrawTool, ColorRole> = {
  trend: 'accent', ray: 'accent', hline: 'caution', hray: 'caution', vline: 'dim', rect: 'info',
  channel: 'accent', fib: 'marker', text: 'text', arrow: 'caution', measure: 'info', brush: 'marker',
};

/* ───────────────────────── time ↔ logical index ───────────────────────── */

/**
 * Epoch-ms → fractional logical index over ascending bar times.
 * Before the first bar / after the last one: extrapolated at `barMs`.
 */
export function timeToLogical(times: ArrayLike<number>, t: number, barMs: number): number {
  const n = times.length;
  if (!n) return 0;
  const step = barMs > 0 ? barMs : 60_000;
  if (t <= times[0]) return (t - times[0]) / step;
  const last = times[n - 1];
  if (t >= last) return n - 1 + (t - last) / step;
  let lo = 0; let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const span = times[hi] - times[lo];
  // A gap (overnight, weekend) is one bar wide on screen: interpolate across it,
  // but a point inside a gap sits at most one bar-length past its bar.
  const frac = span > 0 ? Math.min((t - times[lo]) / Math.min(span, step), 1) : 0;
  return lo + Math.min(frac, 0.999);
}

/** Inverse of timeToLogical. */
export function logicalToTime(times: ArrayLike<number>, l: number, barMs: number): number {
  const n = times.length;
  if (!n) return 0;
  const step = barMs > 0 ? barMs : 60_000;
  if (l <= 0) return times[0] + l * step;
  if (l >= n - 1) return times[n - 1] + (l - (n - 1)) * step;
  const i = Math.floor(l);
  const span = times[i + 1] - times[i];
  return times[i] + (l - i) * Math.min(span, step);
}

/** Median spacing between bars (ms) — the bar length used to extrapolate. */
export function medianBarMs(times: ArrayLike<number>, fallback = 60_000): number {
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  if (!gaps.length) return fallback;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || fallback;
}

/* ───────────────────────── pixel geometry ───────────────────────── */

export interface Pt { x: number; y: number }

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}

/** Where the ray a→b leaves the w×h viewport (b itself when it is degenerate). */
export function rayEnd(a: Pt, b: Pt, w: number, h: number): Pt {
  const dx = b.x - a.x; const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return b;
  let tMax = Infinity;
  if (dx > 0) tMax = Math.min(tMax, (w - a.x) / dx);
  if (dx < 0) tMax = Math.min(tMax, (0 - a.x) / dx);
  if (dy > 0) tMax = Math.min(tMax, (h - a.y) / dy);
  if (dy < 0) tMax = Math.min(tMax, (0 - a.y) / dy);
  if (!Number.isFinite(tMax) || tMax < 1) tMax = Math.max(1, Number.isFinite(tMax) ? tMax : 1);
  return { x: a.x + dx * tMax, y: a.y + dy * tMax };
}

/** Channel: the line a→b and its parallel through c. Returns the second line. */
export function channelOffsetLine(a: Pt, b: Pt, c: Pt): [Pt, Pt] {
  // Vertical offset of c from the a→b line, measured at c.x.
  const dx = b.x - a.x;
  const yOnLine = dx === 0 ? a.y : a.y + ((c.x - a.x) * (b.y - a.y)) / dx;
  const off = c.y - yOnLine;
  return [{ x: a.x, y: a.y + off }, { x: b.x, y: b.y + off }];
}

/** Channel in DATA space: price offset of c from the a→b line at c's time. */
export function channelPriceOffset(a: Anchor, b: Anchor, c: Anchor): number {
  const dt = b.t - a.t;
  const onLine = dt === 0 ? a.p : a.p + ((c.t - a.t) * (b.p - a.p)) / dt;
  return c.p - onLine;
}

/* ───────────────────────── Fibonacci ───────────────────────── */

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/**
 * Retracement levels drawn from anchor 1 to anchor 2 (TradingView's
 * convention): level 0 sits at the END point, level 1 at the START point, and
 * r in between = end − (end − start)·r.
 */
export function fibLevels(start: number, end: number, ratios: readonly number[] = FIB_RATIOS): { ratio: number; price: number }[] {
  return ratios.map((ratio) => ({ ratio, price: end - (end - start) * ratio }));
}

/* ───────────────────────── measure ───────────────────────── */

export interface Measure {
  /** price change, end − start */
  dPrice: number;
  /** percent change vs the start price */
  pct: number;
  /** whole bars between the two anchors (signed) */
  bars: number;
  /** elapsed time, ms (signed) */
  ms: number;
}

export function measure(a: Anchor, b: Anchor, aLogical: number, bLogical: number): Measure {
  return {
    dPrice: b.p - a.p,
    pct: a.p !== 0 ? (b.p / a.p - 1) * 100 : 0,
    bars: Math.round(bLogical - aLogical),
    ms: b.t - a.t,
  };
}

export function fmtDuration(ms: number): string {
  const a = Math.abs(ms);
  const m = Math.round(a / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
  const d = Math.round(a / 86_400_000);
  return `${d}d`;
}

/* ───────────────────────── magnet ───────────────────────── */

export interface Ohlc { open: number; high: number; low: number; close: number }

/**
 * Snap a price to the nearest O/H/L/C of a bar when that value is within
 * `maxPx` pixels (strong magnet: pass Infinity).
 */
export function snapToOhlc(price: number, bar: Ohlc | null | undefined, priceToY: (p: number) => number | null, y: number, maxPx: number): number {
  if (!bar) return price;
  let best = price; let bestD = maxPx;
  for (const v of [bar.open, bar.high, bar.low, bar.close]) {
    const vy = priceToY(v);
    if (vy == null) continue;
    const d = Math.abs(vy - y);
    if (d <= bestD) { bestD = d; best = v; }
  }
  return best;
}

/* ───────────────────────── hit testing ───────────────────────── */

export type HitPart = { kind: 'handle'; index: number } | { kind: 'body' };

/** Projected drawing — the renderer produces these; hit-testing reads them. */
export interface Projected {
  d: Drawing;
  pts: Pt[];
  /** channel: the parallel line; fib: level ys; measure/rect: box. */
  extra?: { line2?: [Pt, Pt]; levelYs?: number[]; textW?: number };
}

export const HIT_TOL = 6;
export const HANDLE_R = 5;

export function hitTest(pr: Projected, x: number, y: number, w: number, h: number, tol = HIT_TOL): HitPart | null {
  const { d, pts } = pr;
  const p = { x, y };
  // Handles first (selected or not — grabbing an end is how you edit).
  if (d.tool !== 'brush') {
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(pts[i].x - x, pts[i].y - y) <= HANDLE_R + 3) return { kind: 'handle', index: i };
    }
  }
  const body: HitPart = { kind: 'body' };
  const [a, b] = pts;
  switch (d.tool) {
    case 'trend':
    case 'measure':
      if (d.tool === 'measure' && a && b && inBox(p, a, b)) return body;
      return a && b && distToSegment(p, a, b) <= tol ? body : null;
    case 'ray':
      return a && b && distToSegment(p, a, rayEnd(a, b, w, h)) <= tol ? body : null;
    case 'hline':
      return a && Math.abs(y - a.y) <= tol ? body : null;
    case 'hray':
      return a && x >= a.x - tol && Math.abs(y - a.y) <= tol ? body : null;
    case 'vline':
      return a && Math.abs(x - a.x) <= tol ? body : null;
    case 'rect':
      if (!a || !b) return null;
      return inBox(p, a, b, tol) ? body : null;
    case 'channel': {
      if (!a || !b) return null;
      if (distToSegment(p, a, b) <= tol) return body;
      const l2 = pr.extra?.line2;
      if (l2 && distToSegment(p, l2[0], l2[1]) <= tol) return body;
      if (l2 && insideQuad(p, [a, b, l2[1], l2[0]])) return body;
      return null;
    }
    case 'fib': {
      if (!a || !b) return null;
      const x1 = Math.min(a.x, b.x) - tol; const x2 = Math.max(a.x, b.x) + tol;
      if (x < x1 || x > x2) return null;
      const ys = pr.extra?.levelYs ?? [];
      return ys.some((ly) => Math.abs(ly - y) <= tol) || distToSegment(p, a, b) <= tol ? body : null;
    }
    case 'text': {
      if (!a) return null;
      const tw = pr.extra?.textW ?? 60;
      return x >= a.x - tol && x <= a.x + tw + tol && y >= a.y - 16 - tol && y <= a.y + 4 + tol ? body : null;
    }
    case 'arrow':
      return a && Math.hypot(a.x - x, (a.y + (d.dir === 'down' ? -9 : 9)) - y) <= 12 ? body : null;
    case 'brush':
      for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= tol) return body;
      return null;
    default:
      return null;
  }
}

function inBox(p: Pt, a: Pt, b: Pt, pad = 0): boolean {
  return p.x >= Math.min(a.x, b.x) - pad && p.x <= Math.max(a.x, b.x) + pad
    && p.y >= Math.min(a.y, b.y) - pad && p.y <= Math.max(a.y, b.y) + pad;
}

function insideQuad(p: Pt, q: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const xi = q[i].x; const yi = q[i].y; const xj = q[j].x; const yj = q[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Topmost hit (last drawn wins), skipping hidden drawings. */
export function hitTestAll(list: Projected[], x: number, y: number, w: number, h: number): { id: string; part: HitPart } | null {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].d.hidden) continue;
    const part = hitTest(list[i], x, y, w, h);
    if (part) return { id: list[i].d.id, part };
  }
  return null;
}

/** Move every anchor by (dt, dp). */
export function translate(d: Drawing, dt: number, dp: number): Drawing {
  return { ...d, pts: d.pts.map((a) => ({ t: a.t + dt, p: a.p + dp })) };
}

/** Replace one anchor. */
export function moveAnchor(d: Drawing, index: number, to: Anchor): Drawing {
  return { ...d, pts: d.pts.map((a, i) => (i === index ? to : a)) };
}

let seq = 0;
export function newDrawingId(): string {
  seq = (seq + 1) % 1e6;
  return `d${Date.now().toString(36)}${seq.toString(36)}`;
}
