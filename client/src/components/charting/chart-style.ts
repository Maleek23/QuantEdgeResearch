/**
 * CHART STYLE + TEMPLATES store — per-layer opacity / colour, line weight,
 * label density and the user's saved templates. Device copy in localStorage,
 * synced per user to /api/chart/settings (server/chart-templates-store.ts);
 * signed out or offline, the device copy is the store. Same external-store
 * pattern as chart-prefs.ts so every mounted chart repaints at once.
 */
import { useSyncExternalStore } from 'react';
import {
  BUILTIN_TEMPLATES, DEFAULT_CHART_STYLE, applyTemplate, sanitizeChartStyle, sanitizeTemplates, templateFromPrefs,
  type ChartStyle, type ChartTemplate,
} from '@shared/chart-templates';
import { setChartPrefs, type ChartPrefs } from './chart-prefs';

export interface ChartStyleState { style: ChartStyle; templates: ChartTemplate[]; activeTemplate: string | null; updatedAt: number }
const KEY = 'qe-chart-style-v1';

function read(): ChartStyleState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      return { style: sanitizeChartStyle(raw.style), templates: sanitizeTemplates(raw.templates), activeTemplate: typeof raw.activeTemplate === 'string' ? raw.activeTemplate : null, updatedAt: Number(raw.updatedAt) || 0 };
    }
  } catch { /* defaults */ }
  return { style: DEFAULT_CHART_STYLE, templates: [], activeTemplate: null, updatedAt: 0 };
}

let state: ChartStyleState = typeof window === 'undefined' ? { style: DEFAULT_CHART_STYLE, templates: [], activeTemplate: null, updatedAt: 0 } : read();
const listeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pulled = false;

function commit(next: Partial<ChartStyleState>, push = true) {
  state = { ...state, ...next, updatedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
  if (!push) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch('/api/chart/settings', {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style: state.style, templates: state.templates, activeTemplate: state.activeTemplate }),
    }).catch(() => { /* device copy stands */ });
  }, 800);
}

/** First mount: take the account copy when it is newer than the device's. */
function pull() {
  if (pulled || typeof window === 'undefined') return;
  pulled = true;
  fetch('/api/chart/settings', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((rec) => {
      if (!rec || !(rec.updatedAt > state.updatedAt)) return;
      commit({ style: sanitizeChartStyle(rec.style), templates: sanitizeTemplates(rec.templates), activeTemplate: rec.activeTemplate ?? null }, false);
    })
    .catch(() => { /* offline / signed out */ });
}

export function useChartStyle(): ChartStyleState {
  return useSyncExternalStore(
    (cb) => { pull(); listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => state,
  );
}

export function setLayerOpacity(layer: keyof ChartStyle['opacity'], v: number) {
  commit({ style: sanitizeChartStyle({ ...state.style, opacity: { ...state.style.opacity, [layer]: v } }), activeTemplate: state.activeTemplate });
}
export function setLayerColor(layer: keyof ChartStyle['opacity'], c: string | null) {
  const color = { ...state.style.color };
  if (c) color[layer] = c; else delete color[layer];
  commit({ style: sanitizeChartStyle({ ...state.style, color }) });
}
export function setStyle(patch: Partial<Pick<ChartStyle, 'lineWidth' | 'labelDensity'>>) {
  commit({ style: sanitizeChartStyle({ ...state.style, ...patch }) });
}
export function resetStyle() { commit({ style: DEFAULT_CHART_STYLE }); }

export function allTemplates(s: ChartStyleState = state): ChartTemplate[] { return [...BUILTIN_TEMPLATES, ...s.templates]; }

export function applyChartTemplate(id: string) {
  const t = allTemplates().find((x) => x.id === id);
  if (!t) return;
  setChartPrefs(applyTemplate({}, t) as Partial<ChartPrefs>);
  commit({ activeTemplate: id });
}
export function saveTemplateAs(name: string, prefs: ChartPrefs): ChartTemplate {
  const t = templateFromPrefs(name, prefs as unknown as Record<string, unknown>);
  commit({ templates: [...state.templates.filter((x) => x.name !== t.name), t].slice(-20), activeTemplate: t.id });
  return t;
}
export function deleteTemplate(id: string) {
  commit({ templates: state.templates.filter((x) => x.id !== id), activeTemplate: state.activeTemplate === id ? null : state.activeTemplate });
}
/** Any manual change after a template switch: the chart no longer matches it. */
export function clearActiveTemplate() { if (state.activeTemplate) commit({ activeTemplate: null }); }
