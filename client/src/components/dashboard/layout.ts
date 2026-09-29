/**
 * Grid maths for every dashboard — a 12-column grid in whole cells.
 * Pure functions, no DOM: collision, vertical compaction, auto-arrange.
 * (Was components/flowdash/layout.ts; unchanged apart from the tool id type.)
 */

export const COLS = 12;
export const ROW_H = 40;   // px per grid row
export const GAP = 8;      // px between cells

export interface PlacedTool {
  i: string;            // instance id
  type: string;         // tool id in the global registry
  x: number; y: number; w: number; h: number;
}

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

/** First-fit packing in reading order — the "Auto-arrange" button. */
export function autoArrange(tools: PlacedTool[]): PlacedTool[] {
  const order = [...tools].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: PlacedTool[] = [];
  for (const t of order) {
    let done = false;
    for (let y = 0; !done && y < 1000; y++) {
      for (let x = 0; x + t.w <= COLS; x++) {
        const cand = { ...t, x, y };
        if (!placed.some((p) => overlaps(cand, p))) { placed.push(cand); done = true; break; }
      }
    }
  }
  return placed;
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
