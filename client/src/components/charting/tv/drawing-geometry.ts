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

import type { Anchor, ColorRole, DashStyle, Drawing, DrawTool } from '@shared/chart-drawings';
import { DEFAULT_RISK_DOLLARS } from '@shared/position-sizing';
import { positionContractPnl, positionContractStats, type PositionContract, type PositionContractStats } from '@shared/position-contract';

export type { Anchor, ColorRole, DashStyle, Drawing, DrawTool, LineWidth, ToolId, DrawingAlert } from '@shared/chart-drawings';
export { COLOR_ROLES, LINE_WIDTHS, DASH_STYLES, FILL_STEPS, TOOL_POINTS, ALERTABLE } from '@shared/chart-drawings';

export const DEFAULT_TOOL_COLOR: Record<DrawTool, ColorRole> = {
  trend: 'accent', ray: 'accent', extended: 'accent', hline: 'caution', hray: 'caution', vline: 'dim', rect: 'info',
  channel: 'accent', fib: 'marker', fibext: 'marker', text: 'text', arrow: 'caution', measure: 'info', brush: 'marker',
  long: 'gain', short: 'loss', pricelabel: 'info',
};

/** Default fill opacity per area tool (a drawing's own `fill` overrides). */
export const DEFAULT_FILL: Partial<Record<DrawTool, number>> = { rect: 0.12, channel: 0.08, fib: 0.08, fibext: 0.06, measure: 0.14, long: 0.16, short: 0.16 };
export const fillOf = (d: Drawing): number => d.fill ?? DEFAULT_FILL[d.tool] ?? 0;

/** Canvas dash pattern for a style at a line width. */
export function dashPattern(dash: DashStyle | undefined, width: number): number[] {
  if (dash === 'dashed') return [6 + width * 2, 4 + width];
  if (dash === 'dotted') return [Math.max(1, width), 3 + width];
  return [];
}

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

/**
 * Fractional logical index → x pixel. lightweight-charts v5's
 * timeScale().logicalToCoordinate() only maps WHOLE indices (a fractional one
 * returns 0 — the left edge), so a drawing anchored between bars (made on
 * another timeframe, a brush stroke, a time that is not a bar of this series)
 * collapsed onto the left edge. Interpolate between the two whole neighbours.
 */
export function logicalToX(toX: (i: number) => number | null, l: number): number | null {
  if (!Number.isFinite(l)) return null;
  const i = Math.floor(l);
  const a = toX(i);
  if (a == null || l === i) return a;
  const b = toX(i + 1);
  return b == null ? null : a + (b - a) * (l - i);
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

/** Pixel tolerances for a pointer: a fingertip covers ~2× what a mouse does. */
export interface HitTol { line: number; handle: number }
export const MOUSE_TOL: HitTol = { line: HIT_TOL, handle: HANDLE_R + 3 };
export const TOUCH_TOL: HitTol = { line: 14, handle: 20 };
export const tolFor = (pointerType: string | undefined): HitTol => (pointerType === 'touch' || pointerType === 'pen' ? TOUCH_TOL : MOUSE_TOL);

export function hitTest(pr: Projected, x: number, y: number, w: number, h: number, tol: number | HitTol = HIT_TOL): HitPart | null {
  const t: HitTol = typeof tol === 'number' ? { line: tol, handle: Math.max(HANDLE_R + 3, tol + 2) } : tol;
  return hitTestWith(pr, x, y, w, h, t);
}

/** Nearest handle within the handle tolerance, or null. */
export function hitHandle(pr: Projected, x: number, y: number, handleTol: number): number | null {
  if (pr.d.tool === 'brush') return null;
  let best = -1; let bestD = handleTol;
  for (let i = 0; i < pr.pts.length; i++) {
    const dd = Math.hypot(pr.pts[i].x - x, pr.pts[i].y - y);
    if (dd <= bestD) { bestD = dd; best = i; }
  }
  return best >= 0 ? best : null;
}

function hitTestWith(pr: Projected, x: number, y: number, w: number, h: number, t: HitTol): HitPart | null {
  const { d, pts } = pr;
  const p = { x, y };
  const tol = t.line;
  // Handles first (selected or not — grabbing an end is how you edit); the nearest wins.
  const hi = hitHandle(pr, x, y, t.handle);
  if (hi != null) return { kind: 'handle', index: hi };
  const body: HitPart = { kind: 'body' };
  const [a, b] = pts;
  switch (d.tool) {
    case 'trend':
    case 'measure':
      if (d.tool === 'measure' && a && b && inBox(p, a, b)) return body;
      return a && b && distToSegment(p, a, b) <= tol ? body : null;
    case 'ray':
      return a && b && distToSegment(p, a, rayEnd(a, b, w, h)) <= tol ? body : null;
    case 'extended': {
      if (!a || !b) return null;
      const [e1, e2] = extendedEnds(a, b, w, h);
      return distToSegment(p, e1, e2) <= tol ? body : null;
    }
    case 'fibext': {
      if (!a || !b) return null;
      const c = pts[2] ?? b;
      const x1 = Math.min(a.x, b.x, c.x) - tol; const x2 = Math.max(a.x, b.x, c.x) + 80;
      if (x < x1 || x > x2) return null;
      const ys = pr.extra?.levelYs ?? [];
      return ys.some((ly) => Math.abs(ly - y) <= tol) || distToSegment(p, a, b) <= tol || distToSegment(p, b, c) <= tol ? body : null;
    }
    case 'long':
    case 'short': {
      if (!a || !b) return null;
      const s = pts[2] ?? b;
      const top = Math.min(b.y, s.y, a.y); const bot = Math.max(b.y, s.y, a.y);
      return x >= Math.min(a.x, b.x) - tol && x <= Math.max(a.x, b.x) + tol && y >= top - tol && y <= bot + tol ? body : null;
    }
    case 'pricelabel': {
      if (!a) return null;
      const tw = pr.extra?.textW ?? 70;
      return x >= a.x - tol && x <= a.x + 14 + tw + tol && y >= a.y - 26 - tol && y <= a.y + tol ? body : null;
    }
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
      return a && Math.hypot(a.x - x, (a.y + (d.dir === 'down' ? -9 : 9)) - y) <= Math.max(12, tol + 4) ? body : null;
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

/**
 * Topmost hit (last drawn wins), skipping hidden drawings. The selected
 * drawing's handles are checked first: with touch tolerances a fingertip on a
 * selected line's end must grab that handle, not a line drawn later nearby.
 */
export function hitTestAll(list: Projected[], x: number, y: number, w: number, h: number, tol: number | HitTol = HIT_TOL, selectedId: string | null = null): { id: string; part: HitPart } | null {
  const t: HitTol = typeof tol === 'number' ? { line: tol, handle: Math.max(HANDLE_R + 3, tol + 2) } : tol;
  if (selectedId) {
    const sel = list.find((p) => p.d.id === selectedId && !p.d.hidden);
    const hi = sel ? hitHandle(sel, x, y, t.handle) : null;
    if (sel && hi != null) return { id: sel.d.id, part: { kind: 'handle', index: hi } };
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].d.hidden) continue;
    const part = hitTestWith(list[i], x, y, w, h, t);
    if (part) return { id: list[i].d.id, part };
  }
  return null;
}

/** Move every anchor by (dt, dp). */
export function translate(d: Drawing, dt: number, dp: number): Drawing {
  return { ...d, pts: d.pts.map((a) => ({ t: a.t + dt, p: a.p + dp })) };
}

/** Replace one anchor. Position tools keep target and stop on one right edge. */
export function moveAnchor(d: Drawing, index: number, to: Anchor): Drawing {
  if ((d.tool === 'long' || d.tool === 'short') && d.pts.length >= 3 && index > 0) {
    return { ...d, pts: d.pts.map((a, i) => (i === index ? to : i === 0 ? a : { t: to.t, p: a.p })) };
  }
  return { ...d, pts: d.pts.map((a, i) => (i === index ? to : a)) };
}

/* ───────────────────────── extended line ───────────────────────── */

/** Both viewport exits of the infinite line through a and b. */
export function extendedEnds(a: Pt, b: Pt, w: number, h: number): [Pt, Pt] {
  if (a.x === b.x && a.y === b.y) return [a, b];
  return [rayEnd(b, a, w, h), rayEnd(a, b, w, h)];
}

/* ───────────────────────── Fibonacci extension ───────────────────────── */

export const FIB_EXT_RATIOS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618] as const;

/**
 * Trend-based Fib extension (TradingView): swing a→b, retrace to c; level r
 * sits at c + (b − a)·r, so 1 projects the full first leg from the pullback.
 */
export function fibExtLevels(a: number, b: number, c: number, ratios: readonly number[] = FIB_EXT_RATIOS): { ratio: number; price: number }[] {
  return ratios.map((ratio) => ({ ratio, price: c + (b - a) * ratio }));
}

/* ───────────────────────── position (long / short) ───────────────────────── */

export interface PositionStats {
  side: 'long' | 'short';
  entry: number; target: number; stop: number;
  /** Underlying reward ÷ risk; null when risk is zero or the stop is on the wrong side. */
  rr: number | null;
  riskPer: number; rewardPer: number;
  stopPct: number; targetPct: number;
  /** Whole OPTION CONTRACTS at the risk budget (shared/position-contract.ts) — never shares. null until a contract is picked. */
  qty: number | null;
  /** $ lost at the stop / gained at the target on the contracts (premium mapped by delta / BS, as the budget contract). */
  riskDollars: number | null; rewardDollars: number | null;
  /** Contract debit (whole position). */
  debit: number | null;
  budget: number;
  /** The option sizing, or null when no contract is picked yet. */
  opt: PositionContractStats | null;
  /** stop above entry on a long (or below on a short), or target the wrong way, or the contract cannot be sized. */
  invalid: string | null;
}

export function positionStats(d: Pick<Drawing, 'tool' | 'pts' | 'risk' | 'contract'>, budget = d.risk ?? DEFAULT_RISK_DOLLARS, symbol = ''): PositionStats | null {
  if ((d.tool !== 'long' && d.tool !== 'short') || d.pts.length < 3) return null;
  const side = d.tool;
  const entry = d.pts[0].p; const target = d.pts[1].p; const stop = d.pts[2].p;
  const dir = side === 'long' ? 1 : -1;
  const riskPer = (entry - stop) * dir;
  const rewardPer = (target - entry) * dir;
  const geomInvalid = riskPer <= 0 ? `stop is ${side === 'long' ? 'above' : 'below'} the entry` : rewardPer <= 0 ? `target is ${side === 'long' ? 'below' : 'above'} the entry` : null;
  const opt = !geomInvalid && d.contract ? positionContractStats({ symbol, side, entry, stop, target, contract: d.contract, risk: budget }) : null;
  const sized = opt && !opt.invalid ? opt : null;
  return {
    side, entry, target, stop,
    rr: riskPer > 0 ? rewardPer / riskPer : null,
    riskPer, rewardPer,
    stopPct: entry ? ((stop - entry) / entry) * 100 : 0,
    targetPct: entry ? ((target - entry) / entry) * 100 : 0,
    qty: sized ? sized.qty : null,
    riskDollars: sized ? sized.riskDollars : null,
    rewardDollars: sized ? sized.rewardT1 : null,
    debit: sized ? sized.debit : null,
    budget,
    opt,
    invalid: geomInvalid ?? opt?.invalid ?? null,
  };
}

/**
 * A new position drawn at `entry`: stop one `riskDist` away (the caller passes
 * ~1.5× the recent average bar range), target at 2R, right edge `spanMs` later.
 */
export function newPositionAnchors(side: 'long' | 'short', entry: Anchor, riskDist: number, spanMs: number): Anchor[] {
  const dir = side === 'long' ? 1 : -1;
  const r = riskDist > 0 ? riskDist : Math.abs(entry.p) * 0.01 || 1;
  return [
    { t: entry.t, p: entry.p },
    { t: entry.t + spanMs, p: entry.p + dir * 2 * r },
    { t: entry.t + spanMs, p: entry.p - dir * r },
  ];
}

/** Live P&L of a position at `price`: underlying move per unit, option $ on the contracts, R. */
export function positionPnl(s: PositionStats, price: number, contract?: PositionContract | null): { per: number; dollars: number | null; r: number | null } {
  const per = (price - s.entry) * (s.side === 'long' ? 1 : -1);
  const dollars = contract && s.opt && !s.opt.invalid ? positionContractPnl(s.opt, contract, s.entry, price) : null;
  return { per, dollars, r: s.riskPer > 0 ? per / s.riskPer : null };
}

/* ───────────────────────── snapping to levels ───────────────────────── */

export interface SnapLevel { price: number; label: string }

/**
 * Snap a price to the nearest level (GEX walls, zero-γ, Apex node, key levels)
 * when it sits within `maxPx` pixels on screen. Returns the level used, if any.
 */
export function snapToLevels(price: number, y: number, levels: readonly SnapLevel[], priceToY: (p: number) => number | null, maxPx: number): { price: number; level: SnapLevel | null } {
  let best: SnapLevel | null = null; let bestD = maxPx;
  for (const l of levels) {
    const ly = priceToY(l.price);
    if (ly == null) continue;
    const d = Math.abs(ly - y);
    if (d <= bestD) { bestD = d; best = l; }
  }
  return best ? { price: best.price, level: best } : { price, level: null };
}

/** The level nearest a price (by distance in price), e.g. "alert on nearest node". */
export function nearestLevel(price: number, levels: readonly SnapLevel[]): SnapLevel | null {
  let best: SnapLevel | null = null; let bestD = Infinity;
  for (const l of levels) {
    const d = Math.abs(l.price - price);
    if (Number.isFinite(d) && d < bestD) { bestD = d; best = l; }
  }
  return best;
}

/* ───────────────────────── set operations ───────────────────────── */

/**
 * Copies of the given drawings, nudged so they do not sit on the originals:
 * `dt` later and `dp` up (the caller passes ~3 bars and ~2% of the visible
 * price range). Alerts are not copied — a copy is a new, un-armed drawing.
 */
export function duplicateDrawings(list: readonly Drawing[], ids: readonly string[], dt: number, dp: number, mkId: () => string = newDrawingId): { next: Drawing[]; added: string[] } {
  const want = new Set(ids);
  const added: string[] = [];
  const copies: Drawing[] = [];
  for (const d of list) {
    if (!want.has(d.id)) continue;
    const id = mkId();
    const { alert: _a, locked: _l, ...rest } = d;
    copies.push({ ...translate(rest as Drawing, dt, dp), id });
    added.push(id);
  }
  return { next: [...list, ...copies], added };
}

/** Patch every drawing in `ids` (style, lock, hide). Same array when nothing changes. */
export function patchDrawings(list: readonly Drawing[], ids: readonly string[], patch: Partial<Drawing>): Drawing[] {
  const want = new Set(ids);
  let changed = false;
  const next = list.map((d) => {
    if (!want.has(d.id)) return d;
    const n = { ...d, ...patch } as Drawing;
    for (const k of Object.keys(patch) as (keyof Drawing)[]) if (patch[k] === undefined) delete n[k];
    changed = true;
    return n;
  });
  return changed ? next : (list as Drawing[]);
}

/** Remove `ids`, skipping locked drawings. */
export function removeDrawings(list: readonly Drawing[], ids: readonly string[]): Drawing[] {
  const want = new Set(ids);
  const next = list.filter((d) => !want.has(d.id) || d.locked);
  return next.length === list.length ? (list as Drawing[]) : next;
}

/** Shift-click: toggle one id in a selection, keeping order (last = primary). */
export function toggleSelection(sel: readonly string[], id: string): string[] {
  return sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id];
}

/** Human name of a drawing for lists and the mini-toolbar. */
export const TOOL_LABEL: Record<DrawTool, string> = {
  trend: 'Trend line', ray: 'Ray', extended: 'Extended line', hline: 'Horizontal line', hray: 'Horizontal ray', vline: 'Vertical line',
  rect: 'Rectangle', channel: 'Parallel channel', fib: 'Fib retracement', fibext: 'Fib extension', text: 'Note', arrow: 'Arrow',
  measure: 'Price range', brush: 'Brush', long: 'Long position', short: 'Short position', pricelabel: 'Price label',
};

export function describeDrawing(d: Drawing, fmt: (n: number) => string = (n) => n.toFixed(2)): string {
  const [a, b] = d.pts;
  switch (d.tool) {
    case 'hline': case 'hray': case 'pricelabel': return `${TOOL_LABEL[d.tool]} ${fmt(a.p)}`;
    case 'text': return `Note “${(d.text ?? '').slice(0, 24)}”`;
    case 'long': case 'short': {
      const s = positionStats(d);
      return s ? `${TOOL_LABEL[d.tool]} ${fmt(s.entry)} · ${s.rr != null ? `${s.rr.toFixed(2)}R` : '—'}` : TOOL_LABEL[d.tool];
    }
    case 'vline': return TOOL_LABEL[d.tool];
    default: return b ? `${TOOL_LABEL[d.tool]} ${fmt(a.p)} → ${fmt(b.p)}` : TOOL_LABEL[d.tool];
  }
}

let seq = 0;
export function newDrawingId(): string {
  seq = (seq + 1) % 1e6;
  return `d${Date.now().toString(36)}${seq.toString(36)}`;
}
