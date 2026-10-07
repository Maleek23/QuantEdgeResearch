/**
 * Chart series sanitising (audit 2026-10-01 P0 #17).
 *
 * Journal › Backtest drew `safeNumber(c.open, 100)`: any missing OHLC or
 * Bollinger value became a $100 candle / band point drawn as data. A bar or
 * point with a missing value is dropped instead — a gap, never a made-up price.
 */
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toNum = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface RawCandle { time?: unknown; open?: unknown; high?: unknown; low?: unknown; close?: unknown }

/** Only bars with a time and all four finite prices. */
export function completeCandles<T extends RawCandle>(rows: (T | null | undefined)[]): { time: T['time']; open: number; high: number; low: number; close: number }[] {
  const out: { time: T['time']; open: number; high: number; low: number; close: number }[] = [];
  for (const c of rows) {
    if (!c || c.time == null) continue;
    const o = toNum(c.open), h = toNum(c.high), l = toNum(c.low), cl = toNum(c.close);
    if (!fin(o) || !fin(h) || !fin(l) || !fin(cl)) continue;
    out.push({ time: c.time, open: o, high: h, low: l, close: cl });
  }
  return out;
}

/** Only points with a time and a finite value for `key`. */
export function finitePoints<T extends { time?: unknown }>(rows: (T | null | undefined)[], key: keyof T): { time: T['time']; value: number }[] {
  const out: { time: T['time']; value: number }[] = [];
  for (const r of rows) {
    if (!r || r.time == null) continue;
    const v = toNum(r[key]);
    if (v == null) continue;
    out.push({ time: r.time, value: v });
  }
  return out;
}
