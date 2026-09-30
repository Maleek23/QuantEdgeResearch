/**
 * CHART PREFS — one settings store for every QEChart on the device.
 *
 * The CHART page, its expanded copies in NEXUS / workup / bot / crypto and the
 * compact embeds all read and write this store, so toggling "Dark Pool" in an
 * expanded setup chart is the same toggle as on the CHART page, and every
 * mounted chart repaints at once (useSyncExternalStore). Same device store
 * pattern as lib/board-prefs.ts.
 *
 * Defaults (operator, 2026-09-29): one clean chart — price plus the dealer
 * walls and zero-gamma line. Orbs, GEX strike lines, dark pool, flow prints,
 * MA, volume and the watchlist panel are opt-in from the chart's Add menu and
 * remembered here. v2 key: the old 'qe-flowchart-v1' layer toggles were the
 * previous everything-on defaults, not choices, so only the timeframe, candle
 * type, range and extended-hours carry over.
 *
 * The timeframe saved here is the CHART page's. Compact embeds keep their own
 * page-appropriate timeframe (a setup card opens on 1D) and hand it to the
 * expanded view; everything else — layers, indicators, candle type, range,
 * extended hours — is shared.
 */
import { useSyncExternalStore } from 'react';
import { TF_CONFIG } from '@/components/charting/chart-engine';

export type GexMode = 'bubbles' | 'lines' | 'off';
export type RangeKey = '1D' | '5D' | 'ALL';
export type ChartType = 'candles' | 'line';
export type TfKey = keyof typeof TF_CONFIG;

export interface ChartPrefs {
  tf: TfKey;
  range: RangeKey;
  extended: boolean;
  gex: GexMode;
  dp: boolean;
  flow: boolean;
  ma: boolean;
  volume: boolean;
  type: ChartType;
  /** Dealer walls (call / put) + zero-gamma drawn as price lines. */
  walls: boolean;
  /** Full chart: the watchlist side panel. */
  watchlist: boolean;
}

/** The overlay/indicator subset a caller may pin for one embed. */
export type ChartOverlayPrefs = Partial<Pick<ChartPrefs, 'gex' | 'dp' | 'flow' | 'ma' | 'volume' | 'type' | 'walls'>>;

export const CHART_PREFS_KEY = 'qe-chart-v2';
const LEGACY_KEY = 'qe-flowchart-v1';
export const DEFAULT_CHART_PREFS: ChartPrefs = {
  tf: '5m', range: '1D', extended: true, gex: 'off', dp: false, flow: false, ma: false, volume: false, type: 'candles',
  walls: true, watchlist: false,
};

function read(): ChartPrefs {
  try {
    let raw = JSON.parse(localStorage.getItem(CHART_PREFS_KEY) ?? 'null');
    if (!raw) {
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null');
      if (old && typeof old === 'object') {
        raw = Object.fromEntries(['tf', 'type', 'range', 'extended'].filter((k) => old[k] != null).map((k) => [k, old[k]]));
      }
    }
    if (raw && typeof raw === 'object') {
      return {
        ...DEFAULT_CHART_PREFS,
        ...raw,
        tf: TF_CONFIG[raw.tf] ? raw.tf : DEFAULT_CHART_PREFS.tf,
        type: raw.type === 'line' ? 'line' : 'candles',
      };
    }
  } catch { /* storage unavailable — defaults */ }
  return DEFAULT_CHART_PREFS;
}

let state: ChartPrefs = typeof window === 'undefined' ? DEFAULT_CHART_PREFS : read();
const listeners = new Set<() => void>();

export function setChartPref<K extends keyof ChartPrefs>(key: K, value: ChartPrefs[K]) {
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  try { localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

export function resetChartPrefs() {
  state = DEFAULT_CHART_PREFS;
  try { localStorage.removeItem(CHART_PREFS_KEY); } catch { /* */ }
  listeners.forEach((l) => l());
}

// Another tab changed the settings: follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== CHART_PREFS_KEY) return;
    state = read();
    listeners.forEach((l) => l());
  });
}

export function useChartPrefs(): ChartPrefs {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => state,
  );
}
