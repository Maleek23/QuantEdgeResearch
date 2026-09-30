/**
 * CHART PREFS — one settings store for every QEChart on the device.
 *
 * The CHART page, its expanded copies in NEXUS / workup / bot / crypto and the
 * compact embeds all read and write this store, so toggling "Dark Pool" in an
 * expanded setup chart is the same toggle as on the CHART page, and every
 * mounted chart repaints at once (useSyncExternalStore). Same device store
 * pattern as lib/board-prefs.ts.
 *
 * Defaults (operator, 2026-09-29; orbs on 2026-09-30): price plus the dealer
 * walls, the zero-gamma line and the GEX orbs through time. GEX strike lines,
 * dark pool, flow prints, MA, volume and the watchlist panel are opt-in from
 * the chart's Add menu and remembered here.
 *
 * `setKeys` records which prefs the user actually chose. The store used to
 * persist the whole object on any change, so a stored `gex:'off'` was usually
 * the old default, not a choice: a stored object without `setKeys` (pre
 * 2026-09-30) keeps every value except `gex:'off'`, which moves to the new
 * default. From then on only keys in `setKeys` override the defaults.
 *
 * v2 key: the old 'qe-flowchart-v1' layer toggles were the
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
export type ChartType = 'candles' | 'bars' | 'line' | 'area';
/** Right price scale: linear, logarithmic, or percent from the first visible bar. */
export type ScaleMode = 'normal' | 'log' | 'pct';
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
  /** Full chart (TradingView-style): price scale mode. */
  scale: ScaleMode;
  /** Full chart: magnet — crosshair and drawing anchors snap to O/H/L/C. */
  magnet: boolean;
  /** Full chart: volume histogram at the foot of the price pane (TV default on;
   *  independent of the compact embeds' `volume` pane). */
  fullVolume: boolean;
  /** Keys the user explicitly set (the rest follow DEFAULT_CHART_PREFS). */
  setKeys?: (keyof ChartPrefs)[];
}

/** The overlay/indicator subset a caller may pin for one embed. */
export type ChartOverlayPrefs = Partial<Pick<ChartPrefs, 'gex' | 'dp' | 'flow' | 'ma' | 'volume' | 'type' | 'walls'>>;

export const CHART_PREFS_KEY = 'qe-chart-v2';
const LEGACY_KEY = 'qe-flowchart-v1';
export const DEFAULT_CHART_PREFS: ChartPrefs = {
  tf: '5m', range: '1D', extended: true, gex: 'bubbles', dp: false, flow: false, ma: false, volume: false, type: 'candles',
  walls: true, watchlist: false, scale: 'normal', magnet: false, fullVolume: true,
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
      let setKeys: (keyof ChartPrefs)[];
      if (Array.isArray(raw.setKeys)) {
        setKeys = raw.setKeys.filter((k: unknown): k is keyof ChartPrefs => typeof k === 'string' && k in DEFAULT_CHART_PREFS);
        raw = Object.fromEntries(setKeys.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
      } else {
        // Legacy object: every value was persisted, chosen or not. `gex:'off'`
        // was the old default → follow the new one; anything else was a choice.
        if (raw.gex !== 'bubbles' && raw.gex !== 'lines') delete raw.gex;
        setKeys = Object.keys(raw).filter((k): k is keyof ChartPrefs => k in DEFAULT_CHART_PREFS && k !== 'setKeys');
      }
      return {
        ...DEFAULT_CHART_PREFS,
        ...raw,
        setKeys,
        gex: raw.gex === 'bubbles' || raw.gex === 'lines' || raw.gex === 'off' ? raw.gex : DEFAULT_CHART_PREFS.gex,
        tf: TF_CONFIG[raw.tf] ? raw.tf : DEFAULT_CHART_PREFS.tf,
        type: (['candles', 'bars', 'line', 'area'] as const).includes(raw.type) ? raw.type : 'candles',
        scale: raw.scale === 'log' || raw.scale === 'pct' ? raw.scale : 'normal',
      };
    }
  } catch { /* storage unavailable — defaults */ }
  return DEFAULT_CHART_PREFS;
}

let state: ChartPrefs = typeof window === 'undefined' ? DEFAULT_CHART_PREFS : read();
const listeners = new Set<() => void>();

export function setChartPref<K extends keyof ChartPrefs>(key: K, value: ChartPrefs[K]) {
  if (state[key] === value) return;
  const setKeys = state.setKeys?.includes(key) ? state.setKeys : [...(state.setKeys ?? []), key];
  state = { ...state, [key]: value, setKeys };
  try { localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(state)); } catch { /* private mode */ }
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
