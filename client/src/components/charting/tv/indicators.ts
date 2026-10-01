/**
 * QUICK INDICATORS for the TradingView-style chart — pure maths, no DOM, no
 * chart library (unit-tested in scripts/test-chart-tools.ts).
 *
 *   EMA      exponential moving average, seeded with the SMA of the first
 *            `period` closes (the convention TradingView and most platforms use).
 *   VWAP     session-anchored volume-weighted average price of the typical
 *            price (H+L+C)/3, reset at each new session key (the ET date for
 *            intraday bars). Bars with no volume carry the running value; a
 *            session with no volume yet has no VWAP (null), never a made-up one.
 *   compare  a second symbol's bars aligned to the main series' bar times, so
 *            the overlay never adds time points (drawings and layers map
 *            through the main series' bar indices).
 */

export interface Bar { time: number; open: number; high: number; low: number; close: number; volume?: number }

export function calcEMA(bars: readonly Bar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (period < 1 || bars.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += bars[i].close;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < bars.length; i++) {
    prev = bars[i].close * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function calcSessionVWAP(bars: readonly Bar[], sessionOf: (t: number) => string): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let key: string | null = null;
  let pv = 0; let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const k = sessionOf(b.time);
    if (k !== key) { key = k; pv = 0; vol = 0; }
    const v = Number.isFinite(b.volume) && (b.volume as number) > 0 ? (b.volume as number) : 0;
    if (v > 0) { pv += ((b.high + b.low + b.close) / 3) * v; vol += v; }
    out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

/** Keep only compare bars whose time is one of the main series' bar times. */
export function alignToTimes<T extends { time: number }>(compare: readonly T[], mainTimes: readonly number[]): T[] {
  if (!compare.length || !mainTimes.length) return [];
  const want = new Set(mainTimes);
  return compare.filter((b) => want.has(b.time));
}

/** A ticker a user may type into "Compare with": letters, digits, . - ^ = /, 1–15 chars. */
export function cleanCompareSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  return /^[A-Z0-9.^=/-]{1,15}$/.test(s) ? s : null;
}
