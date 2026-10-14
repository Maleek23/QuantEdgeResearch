/**
 * CUSTOM INTERVALS — 2m, 3m, 10m, 45m, 2h, 3h … built from real bars.
 *
 * The history feed has fixed intervals (1m 5m 15m 30m 1h 1d 1wk). A custom
 * interval is the largest feed interval that divides it, resampled into
 * buckets (chart-engine aggregateCandles — the same measured resampling the
 * 4h chart already uses: OHLC of the real bars, volume summed, nothing
 * interpolated). Registering adds the key to TF_CONFIG / TF_BAR_MS so every
 * chart path (history query, live forming bar, prefs) treats it like a
 * built-in. The user's list is remembered on the device.
 */
import { TF_BAR_MS, TF_CONFIG } from '@/components/charting/chart-engine';

const BASES: { min: number; key: string; range: string }[] = [
  { min: 60, key: '1h', range: '6mo' },
  { min: 30, key: '30m', range: '1mo' },
  { min: 15, key: '15m', range: '1mo' },
  { min: 5, key: '5m', range: '1mo' },
  { min: 1, key: '1m', range: '5d' },
];
const STORE = 'qe-chart-custom-tf-v1';
export const MAX_CUSTOM_MINUTES = 8 * 60;
/** Offered in the interval menu next to the built-ins. */
export const INTERVAL_PRESETS = ['2m', '3m', '10m', '45m', '2h', '3h'] as const;

export interface IntervalSpec { key: string; minutes: number; label: string; name: string; base: string; range: string; interval: string }

/** "3" "3m" "3 min" "2h" "2H" "90m" → a spec; null when not a whole-minute intraday interval we can build. */
export function parseInterval(raw: string): IntervalSpec | null {
  const m = /^\s*(\d{1,3})\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)?\s*$/i.exec(raw ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'm').toLowerCase().startsWith('h') ? 60 : 1;
  const minutes = n * unit;
  if (!(minutes >= 1) || minutes > MAX_CUSTOM_MINUTES) return null;
  const key = minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
  const base = BASES.find((b) => minutes % b.min === 0)!;
  const range = minutes > 180 ? '2y' : base.range;
  const label = key.toUpperCase();
  const name = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return { key, minutes, label, name, base: base.key, range, interval: base.key };
}

/** Add a parsed interval to the chart engine's tables (idempotent; built-ins untouched). */
export function registerInterval(spec: IntervalSpec): string {
  // A built-in key (5m, 1h …) is already there and stays as it is.
  if (!TF_CONFIG[spec.key]) TF_CONFIG[spec.key] = { range: spec.range, interval: spec.interval, label: spec.label, aggregateMinutes: spec.minutes };
  if (!TF_BAR_MS[spec.key]) TF_BAR_MS[spec.key] = spec.minutes * 60_000;
  return spec.key;
}

export function customIntervals(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 12) : [];
  } catch { return []; }
}

/** Parse, register and remember. Returns the interval key, or null when it cannot be built. */
export function addCustomInterval(raw: string): string | null {
  const spec = parseInterval(raw);
  if (!spec) return null;
  registerInterval(spec);
  if (!['1m', '5m', '15m', '30m', '1h', '4h'].includes(spec.key)) {
    const list = customIntervals().filter((k) => k !== spec.key);
    try { localStorage.setItem(STORE, JSON.stringify([spec.key, ...list].slice(0, 12))); } catch { /* device only */ }
  }
  return spec.key;
}

export function removeCustomInterval(key: string) {
  try { localStorage.setItem(STORE, JSON.stringify(customIntervals().filter((k) => k !== key))); } catch { /* device only */ }
}

/** Presets + remembered intervals into the engine tables (call before reading prefs). */
export function restoreCustomIntervals(): void {
  for (const k of [...INTERVAL_PRESETS, ...(typeof localStorage !== 'undefined' ? customIntervals() : [])]) {
    const s = parseInterval(k);
    if (s) registerInterval(s);
  }
}

/** Human name for any interval key (built-in or custom). */
export function intervalName(key: string): string {
  const BUILT: Record<string, string> = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '30m': '30 minutes', '1h': '1 hour', '4h': '4 hours', '1D': '1 day', '1W': '1 week' };
  return BUILT[key] ?? parseInterval(key)?.name ?? key;
}
