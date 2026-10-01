/**
 * Option pricing helpers for the Holy Grail research — real Alpaca option
 * 1-min bars only (no model prices). Conventions (same as the 0DTE replays):
 *   ENTRY = the HIGH of the option's 1-min bar in the minute AFTER the stock
 *           crossed the entry stop (if it did not trade then, the first bar in
 *           the next 3 minutes; else no fill).
 *   EXIT  = the option's last 1-min CLOSE at or before the minute the stock
 *           exit happened (stop / target / time), and separately the 15:59 close.
 * SPX: Alpaca has no index bars. Signals run on SPY; the SPXW strike is the
 * nearest OTM 5-point strike to SPY × (^GSPC / SPY) at the trigger; SPXW 1-min
 * bars are requested by OCC symbol directly.
 */
import fs from 'fs';
import path from 'path';
import type { ORow, CRow } from './fast-moves-data';
import { et, etWall } from './fast-moves-data';

export function occ(root: string, day: string, type: 'C' | 'P', strike: number): string {
  return `${root}${day.slice(2).replace(/-/g, '')}${type}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}

/** Nearest strictly-OTM strike from a strike list. */
export function nearestOtm(strikes: number[], px: number, type: 'C' | 'P'): number | null {
  const s = [...new Set(strikes)].sort((a, b) => a - b);
  if (type === 'C') return s.find((k) => k > px) ?? null;
  for (let i = s.length - 1; i >= 0; i--) if (s[i] < px) return s[i];
  return null;
}

/** OTM strike ladder on a fixed grid (SPXW 5-pt, SPY $1): the nearest OTM and the next `n−1` further out. */
export function gridOtm(px: number, type: 'C' | 'P', step: number, n = 3): number[] {
  const out: number[] = [];
  let k = type === 'C' ? Math.floor(px / step) * step + step : Math.ceil(px / step) * step - step;
  for (let i = 0; i < n; i++) { out.push(+k.toFixed(2)); k = type === 'C' ? k + step : k - step; }
  return out;
}

/** The nearest expiry on/after `day` within `maxDays` calendar days. */
export function nearExpiry(contracts: CRow[], day: string, maxDays = 7): string | null {
  const lim = new Date(Date.parse(`${day}T12:00:00Z`) + maxDays * 86400_000).toISOString().slice(0, 10);
  const ex = [...new Set(contracts.map((c) => c[1]))].filter((e) => e >= day && e <= lim).sort();
  return ex[0] ?? null;
}

export interface OptPath {
  occ: string;
  entry: number; entryEt: string;
  high: number; highEt: string; maxMult: number;
  close: number; closeMult: number;
  /** Value at the stock exit minute (null when not asked). */
  atExit: number | null; exitMult: number | null;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Path of one contract from the minute after `crossMs` (the stock 1-min bar in
 * which the entry stop was crossed) to the 15:59 close.
 */
export function optionPath(bars: ORow[] | undefined, code: string, day: string, crossMs: number, exitMs: number | null = null, windowMin = 3): OptPath | null {
  if (!bars?.length) return null;
  const rows = [...bars].sort((a, b) => a[0] - b[0]);
  const after = crossMs + 60_000; // bar start of the next minute
  const i0 = rows.findIndex((r) => r[0] * 1000 >= after && r[0] * 1000 <= after + windowMin * 60_000);
  if (i0 < 0) return null;
  const entry = rows[i0][2];
  if (!(entry > 0)) return null;
  const close16 = etWall(day, 16 * 60);
  let high = entry, highT = rows[i0][0] * 1000, close = rows[i0][4];
  for (let i = i0; i < rows.length && rows[i][0] * 1000 < close16; i++) {
    if (i > i0 && rows[i][2] > high) { high = rows[i][2]; highT = rows[i][0] * 1000; }
    close = rows[i][4];
  }
  let atExit: number | null = null;
  if (exitMs != null) { for (let i = i0; i < rows.length && rows[i][0] * 1000 <= exitMs; i++) atExit = rows[i][4]; }
  return {
    occ: code, entry, entryEt: hhmm(et(rows[i0][0] * 1000).min), high, highEt: hhmm(et(highT).min), maxMult: +(high / entry).toFixed(3),
    close, closeMult: +(close / entry).toFixed(3), atExit, exitMult: atExit != null ? +(atExit / entry).toFixed(3) : null,
  };
}

/** ^GSPC 1-min closes for `day` keyed by ET minute (Yahoo; recent days only). Cached. */
export async function gspcMinutes(day: string): Promise<Map<number, number>> {
  const file = path.resolve(process.cwd(), `.cache/holy-grail/gspc-1m-${day}.json`);
  if (fs.existsSync(file)) return new Map(JSON.parse(fs.readFileSync(file, 'utf8')));
  const m = new Map<number, number>();
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1m&range=5d&includePrePost=false', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j: any = await r.json();
    const res = j?.chart?.result?.[0]; const ts: number[] = res?.timestamp ?? []; const c = res?.indicators?.quote?.[0]?.close ?? [];
    for (let i = 0; i < ts.length; i++) { const e = et(ts[i] * 1000); if (e.day === day && typeof c[i] === 'number') m.set(e.min, c[i]); }
  } catch { /* caller falls back to the daily ratio */ }
  if (m.size) fs.writeFileSync(file, JSON.stringify([...m]));
  return m;
}

/** ^GSPC daily OHLC (Yahoo, 2y), cached per end date: day → [open, close]. */
export async function gspcDailyOC(end: string): Promise<Map<string, [number, number]>> {
  const file = path.resolve(process.cwd(), `.cache/holy-grail/gspc-daily-oc-${end}.json`);
  if (fs.existsSync(file)) return new Map(JSON.parse(fs.readFileSync(file, 'utf8')));
  const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=2y', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const j: any = await r.json();
  const res = j?.chart?.result?.[0]; const ts: number[] = res?.timestamp ?? []; const q = res?.indicators?.quote?.[0] ?? {};
  const out: Array<[string, [number, number]]> = [];
  for (let i = 0; i < ts.length; i++) if (typeof q.open?.[i] === 'number' && typeof q.close?.[i] === 'number') out.push([et(ts[i] * 1000).day, [q.open[i], q.close[i]]]);
  fs.writeFileSync(file, JSON.stringify(out));
  return new Map(out);
}
