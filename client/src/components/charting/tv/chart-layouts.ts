/**
 * CHART LAYOUTS — named snapshots of the chart's settings (timeframe, chart
 * type, price scale, session, range, layers and indicators) the user can save
 * and re-apply in one tap. Device store (localStorage, versioned key), same
 * pattern as chart-prefs.ts; drawings are not part of a layout — they already
 * persist per symbol (drawing-store.ts).
 *
 * Pure list operations are exported for tests (scripts/test-chart-tools.ts).
 */
import { useSyncExternalStore } from 'react';
import type { ChartPrefs } from '@/components/charting/chart-prefs';

export const LAYOUTS_KEY = 'qe-chart-layouts-v1';
export const MAX_LAYOUTS = 12;

/** The settings a layout carries (not the watchlist panel, not bookkeeping). */
export const LAYOUT_KEYS = ['tf', 'range', 'extended', 'gex', 'dp', 'flow', 'ma', 'ema', 'vwap', 'type', 'walls', 'scale', 'magnet', 'fullVolume', 'keyLevels'] as const;
export type LayoutKey = (typeof LAYOUT_KEYS)[number];
export type LayoutPrefs = Partial<Pick<ChartPrefs, LayoutKey>>;

export interface ChartLayout { name: string; savedAt: number; prefs: LayoutPrefs }

export function pickLayoutPrefs(prefs: Partial<ChartPrefs>): LayoutPrefs {
  const out: Record<string, unknown> = {};
  for (const k of LAYOUT_KEYS) if (prefs[k] !== undefined) out[k] = prefs[k];
  return out as LayoutPrefs;
}

export function cleanLayoutName(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  return s.length ? s : null;
}

/** Save (or overwrite, matched case-insensitively) a layout; newest first, capped. */
export function upsertLayout(list: readonly ChartLayout[], name: string, prefs: Partial<ChartPrefs>, now: number): ChartLayout[] {
  const n = cleanLayoutName(name);
  if (!n) return [...list];
  const rest = list.filter((l) => l.name.toLowerCase() !== n.toLowerCase());
  return [{ name: n, savedAt: now, prefs: pickLayoutPrefs(prefs) }, ...rest].slice(0, MAX_LAYOUTS);
}

export function removeLayout(list: readonly ChartLayout[], name: string): ChartLayout[] {
  return list.filter((l) => l.name.toLowerCase() !== name.toLowerCase());
}

/** Defensive parse: drop anything malformed; unknown pref keys are dropped. */
export function sanitizeLayouts(raw: unknown): ChartLayout[] {
  if (!Array.isArray(raw)) return [];
  const out: ChartLayout[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === 'string' ? cleanLayoutName(o.name) : null;
    if (!name || !o.prefs || typeof o.prefs !== 'object') continue;
    out.push({ name, savedAt: Number.isFinite(o.savedAt) ? (o.savedAt as number) : 0, prefs: pickLayoutPrefs(o.prefs as Partial<ChartPrefs>) });
    if (out.length >= MAX_LAYOUTS) break;
  }
  return out;
}

/* ── device store ── */
let state: ChartLayout[] = typeof window === 'undefined' ? [] : read();
const listeners = new Set<() => void>();
function read(): ChartLayout[] {
  try { return sanitizeLayouts(JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? '[]')); } catch { return []; }
}
function write(next: ChartLayout[]) {
  state = next;
  try { localStorage.setItem(LAYOUTS_KEY, JSON.stringify(next)); } catch { /* private mode: this session only */ }
  listeners.forEach((l) => l());
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === LAYOUTS_KEY) { state = read(); listeners.forEach((l) => l()); } });
}
export function saveLayout(name: string, prefs: Partial<ChartPrefs>) { write(upsertLayout(state, name, prefs, Date.now())); }
export function deleteLayout(name: string) { write(removeLayout(state, name)); }
export function useChartLayouts(): ChartLayout[] {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state, () => state);
}
