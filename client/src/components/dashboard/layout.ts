/**
 * Grid maths for every dashboard — a 12-column grid in whole cells.
 * Pure functions, no DOM: collision, vertical compaction, auto-arrange.
 * (Was components/flowdash/layout.ts; unchanged apart from the tool id type.)
 */

export const COLS = 12;
export const ROW_H = 40;   // px per grid row on phones, and the fallback before the grid is measured
export const GAP = 8;      // px between cells
/**
 * Desktop rows SCALE: the grid's visible height is always VIEW_ROWS rows, so
 * a layout VIEW_ROWS tall fills the viewport exactly at any resolution
 * (1440×900 ≈ 36px rows, 1920×1080 ≈ 46px, 2513×1260 ≈ 56px). Every shipped
 * default is authored to exactly COLS × VIEW_ROWS; taller layouts scroll.
 */
export const VIEW_ROWS = 18;
export const MIN_ROW_H = 24;
export const MAX_ROW_H = 80;
/** Row height (px) that makes VIEW_ROWS rows fill a grid viewport of `px` height. */
export function fitRowHeight(px: number): number {
  if (!(px > 0)) return ROW_H;
  return Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, (px - GAP * (VIEW_ROWS - 1)) / VIEW_ROWS));
}

export interface PlacedTool {
  i: string;            // instance id
  type: string;         // tool id in the global registry
  x: number; y: number; w: number; h: number;
  /**
   * COLLAPSED: the tile shows only its header (h = COLLAPSED_H) and this is
   * the height it returns to on expand. Absent = expanded.
   */
  c?: number;
}

/** Rows a collapsed tile keeps (its header). */
export const COLLAPSED_H = 1;

export interface Dashboard {
  id: string;
  name: string;
  tools: PlacedTool[];
}

const overlaps = (a: PlacedTool, b: PlacedTool) =>
  a.i !== b.i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function clampTool(t: PlacedTool, minW = 2, minH = 3): PlacedTool {
  const w = Math.max(Math.min(minW, COLS), Math.min(COLS, Math.round(t.w)));
  const h = Math.max(minH, Math.round(t.h));
  const x = Math.max(0, Math.min(COLS - w, Math.round(t.x)));
  const y = Math.max(0, Math.round(t.y));
  return { ...t, x, y, w, h };
}

/**
 * Vertical compaction. `pinned` (the tool just moved/resized) is placed first
 * at its requested spot; everything else floats up as far as it can and is
 * pushed below anything it would overlap.
 */
export function compact(tools: PlacedTool[], pinned?: string): PlacedTool[] {
  const order = [...tools].sort((a, b) =>
    (a.i === pinned ? -1 : b.i === pinned ? 1 : 0) || a.y - b.y || a.x - b.x);
  const placed: PlacedTool[] = [];
  for (const t of order) {
    const it = { ...t };
    if (it.i !== pinned) {
      while (it.y > 0 && !placed.some((p) => overlaps({ ...it, y: it.y - 1 }, p))) it.y--;
    }
    while (placed.some((p) => overlaps(it, p))) it.y++;
    placed.push(it);
  }
  // Second pass: with collisions resolved around the pinned tool, let every
  // tool (the pinned one included) float up into any gap left behind.
  return pinned ? compact(placed) : placed;
}

/**
 * Auto-arrange — the same packing every shipped default uses:
 *   ROW-MAJOR   tools keep reading order and fill rows left → right;
 *   GAP-FREE    each row's widths are stretched (largest remainder) to span
 *               all COLS, so nothing leaves a hole;
 *   EQUAL ROWS  every tool in a row takes the row's height;
 *   FITS        when the rows' minimum heights allow it, row heights are
 *               scaled so the whole dashboard is exactly VIEW_ROWS tall — it
 *               fills the viewport with no scroll. Otherwise rows keep their
 *               natural height and the grid scrolls.
 * `minH(type)` / `minW(type)` are the registry minimums.
 */
export function autoArrange(
  tools: PlacedTool[],
  minH: (type: string) => number = () => 3,
  minW: (type: string) => number = () => 2,
): PlacedTool[] {
  const order = readingOrder(tools);
  const rows: PlacedTool[][] = [];
  let cur: PlacedTool[] = []; let used = 0;
  for (const t of order) {
    const w = Math.max(Math.min(COLS, minW(t.type)), Math.min(COLS, t.w));
    if (cur.length && used + w > COLS) { rows.push(cur); cur = []; used = 0; }
    cur.push({ ...t, w }); used += w;
  }
  if (cur.length) rows.push(cur);

  // widths: stretch each row to COLS by largest remainder
  for (const row of rows) {
    const sum = row.reduce((s, t) => s + t.w, 0);
    if (sum >= COLS) continue;
    const exact = row.map((t) => (t.w / sum) * COLS);
    const base = exact.map(Math.floor);
    let left = COLS - base.reduce((s, v) => s + v, 0);
    const byFrac = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (const [, i] of byFrac) { if (!left) break; base[i]++; left--; }
    row.forEach((t, i) => { t.w = base[i]; });
  }

  // heights: natural = tallest in row; floor = the row's largest minimum
  const natural = rows.map((r) => Math.max(...r.map((t) => t.h)));
  const floor = rows.map((r) => Math.max(...r.map((t) => minH(t.type))));
  let heights = natural.map((h, i) => Math.max(h, floor[i]));
  const floorSum = floor.reduce((s, v) => s + v, 0);
  if (floorSum <= VIEW_ROWS) {
    const natSum = heights.reduce((s, v) => s + v, 0);
    const exact = heights.map((h) => (h / natSum) * VIEW_ROWS);
    const hs = exact.map((v, i) => Math.max(floor[i], Math.floor(v)));
    let diff = VIEW_ROWS - hs.reduce((s, v) => s + v, 0);
    // give / take whole rows, largest fractional part first, never below a floor
    const order2 = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
    for (let guard = 0; diff !== 0 && guard < 400; guard++) {
      const i = order2[guard % order2.length];
      if (diff > 0) { hs[i]++; diff--; } else if (hs[i] > floor[i]) { hs[i]--; diff++; }
    }
    heights = hs;
  }

  const out: PlacedTool[] = [];
  let y = 0;
  rows.forEach((row, r) => {
    let x = 0;
    for (const t of row) { out.push({ ...t, x, y, h: heights[r] }); x += t.w; }
    y += heights[r];
  });
  return out;
}

/**
 * Tiling check for shipped defaults: overlaps, holes inside the covered
 * area, and whether the layout is exactly COLS × VIEW_ROWS. Pure; used by a
 * DEV-only assertion in pages.ts and by the layout audit.
 */
export function tilingIssues(tools: Array<{ x: number; y: number; w: number; h: number; type?: string }>, opts: { tall?: boolean } = {}): string[] {
  const out: string[] = [];
  const bottom = tools.reduce((m, t) => Math.max(m, t.y + t.h), 0);
  const grid: string[][] = Array.from({ length: bottom }, () => Array(COLS).fill(''));
  for (const t of tools) {
    if (t.x < 0 || t.x + t.w > COLS) out.push(`${t.type ?? '?'} spills past column ${COLS}`);
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < Math.min(COLS, t.x + t.w); x++) {
      if (grid[y][x]) out.push(`${t.type ?? '?'} overlaps ${grid[y][x]} at ${x},${y}`);
      grid[y][x] = t.type ?? '#';
    }
  }
  let holes = 0;
  for (const row of grid) for (const c of row) if (!c) holes++;
  if (holes) out.push(`${holes} empty cells`);
  // `tall` (NEXUS): the first screen is VIEW_ROWS rows and more tools follow below the fold
  if (opts.tall ? bottom < VIEW_ROWS : bottom !== VIEW_ROWS) out.push(`height ${bottom} rows, ${opts.tall ? 'less than' : 'not'} ${VIEW_ROWS}`);
  return out;
}

/** Where a new tool of size w×h lands: first gap that fits, else the bottom. */
export function slotFor(tools: PlacedTool[], w: number, h: number): { x: number; y: number } {
  const probe: PlacedTool = { i: '__probe', type: '__probe', x: 0, y: 0, w: Math.min(w, COLS), h };
  const bottom = tools.reduce((m, t) => Math.max(m, t.y + t.h), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + probe.w <= COLS; x++) {
      if (!tools.some((p) => overlaps({ ...probe, x, y }, p))) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

/** Reading-order sort (top-to-bottom, left-to-right) — the phone stack order. */
export const readingOrder = (tools: PlacedTool[]) => [...tools].sort((a, b) => a.y - b.y || a.x - b.x);

export const uid = () => Math.random().toString(36).slice(2, 10);
