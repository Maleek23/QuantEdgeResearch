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
