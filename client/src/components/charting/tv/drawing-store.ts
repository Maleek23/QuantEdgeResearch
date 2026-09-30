/**
 * DRAWING STORE — where a user's chart drawings live, per symbol.
 *
 * The chart only talks to the `DrawingStore` interface. Today that is the
 * device store (localStorage, the chart-prefs pattern: one key per user ×
 * symbol, versioned, other tabs followed via the 'storage' event). A server
 * store (e.g. GET/PUT /api/chart/drawings/:symbol) can replace it by
 * implementing the same four methods and being passed to `setDrawingStore` —
 * `load` may return cached data synchronously and call the listener when the
 * server copy lands.
 *
 * Drawings are stored in data space (time ms + price, colour ROLES), so they
 * are timeframe-independent and follow the visual mode.
 */
import type { Drawing, DrawTool, ColorRole, LineWidth } from './drawing-geometry';
import { COLOR_ROLES, LINE_WIDTHS, TOOL_POINTS } from './drawing-geometry';

export interface DrawingScope { userId: string; symbol: string }

export interface DrawingStore {
  load(scope: DrawingScope): Drawing[];
  save(scope: DrawingScope, drawings: Drawing[]): void;
  /** Notified when the stored list for `scope` changes elsewhere (another tab, the server). */
  subscribe(scope: DrawingScope, fn: () => void): () => void;
}

const VERSION = 1;
export const drawingKey = (s: DrawingScope) => `qe-drawings-v${VERSION}:${s.userId || 'anon'}:${s.symbol.toUpperCase()}`;

const TOOLS = new Set(Object.keys(TOOL_POINTS));
/** Defensive parse: drop anything malformed rather than crash the chart. */
export function sanitizeDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  const out: Drawing[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const d = r as Record<string, unknown>;
    if (typeof d.id !== 'string' || !TOOLS.has(d.tool as string) || !Array.isArray(d.pts)) continue;
    const pts = (d.pts as unknown[]).filter((a): a is { t: number; p: number } =>
      !!a && typeof a === 'object' && Number.isFinite((a as { t: number }).t) && Number.isFinite((a as { p: number }).p));
    if (!pts.length) continue;
    const clean: Drawing = {
      id: d.id,
      tool: d.tool as DrawTool,
      pts: pts.map((a) => ({ t: a.t, p: a.p })),
      color: COLOR_ROLES.includes(d.color as ColorRole) ? (d.color as ColorRole) : 'accent',
      width: LINE_WIDTHS.includes(d.width as LineWidth) ? (d.width as LineWidth) : 2,
    };
    if (typeof d.text === 'string') clean.text = d.text.slice(0, 200);
    if (d.dir === 'up' || d.dir === 'down') clean.dir = d.dir;
    if (d.locked === true) clean.locked = true;
    if (d.hidden === true) clean.hidden = true;
    out.push(clean);
  }
  return out;
}

export const deviceDrawingStore: DrawingStore = {
  load(scope) {
    try { return sanitizeDrawings(JSON.parse(localStorage.getItem(drawingKey(scope)) ?? '[]')); } catch { return []; }
  },
  save(scope, drawings) {
    try {
      if (drawings.length) localStorage.setItem(drawingKey(scope), JSON.stringify(drawings));
      else localStorage.removeItem(drawingKey(scope));
    } catch { /* private mode / quota: this session only */ }
  },
  subscribe(scope, fn) {
    if (typeof window === 'undefined') return () => {};
    const key = drawingKey(scope);
    const onStorage = (e: StorageEvent) => { if (e.key === key) fn(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};

let active: DrawingStore = deviceDrawingStore;
/** Swap the backing store (e.g. a server store once /api/chart/drawings exists). */
export function setDrawingStore(store: DrawingStore) { active = store; }
export function getDrawingStore(): DrawingStore { return active; }
