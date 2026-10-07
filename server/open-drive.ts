/**
 * OPEN DRIVE — inputs + daily caps for server/open-drive-core.ts.
 * One Yahoo 1-minute chart call per symbol (today, pre/post included), cached 20 s.
 * Missing data is null — the policy then waits, it never interpolates.
 */
import { logger } from './logger';
import type { Bar } from './zero-dte-structure';
import { etClock } from './zero-dte-sniper-core';
import { OPEN_DRIVE_CAPS } from './open-drive-core';

export interface OneMinuteSession { rth: Bar[]; pre: Bar[] }

/** Pure — split raw 1-minute bars into today's pre-market (04:00–09:29) and regular session (09:30–15:59). */
export function splitOneMinuteSession(all: Bar[], dateKey: string): OneMinuteSession {
  const rth: Bar[] = []; const pre: Bar[] = [];
  for (const b of all) {
    const c = etClock(b.t);
    if (c.dateKey !== dateKey) continue;
    if (c.min >= 570 && c.min < 960) rth.push(b);
    else if (c.min >= 240 && c.min < 570) pre.push(b);
  }
  return { rth: rth.sort((a, b) => a.t - b.t), pre: pre.sort((a, b) => a.t - b.t) };
}

export function parseYahooBars(j: any): Bar[] {
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i]; const h = q.high?.[i]; const l = q.low?.[i]; const c = q.close?.[i];
    if ([o, h, l, c].every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) {
      bars.push({ t: ts[i] * 1000, o, h, l, c, v: Number(q.volume?.[i] ?? 0) || 0 });
    }
  }
  return bars;
}

const cache = new Map<string, { at: number; s: OneMinuteSession | null }>();
const TTL_MS = 20_000;

export async function getOneMinuteSession(symbol: string, nowMs = Date.now()): Promise<OneMinuteSession | null> {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && nowMs - hit.at < TTL_MS) return hit.s;
  let s: OneMinuteSession | null = null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8_000);
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d&includePrePost=true`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: ctl.signal,
    }).finally(() => clearTimeout(timer));
    if (r.ok) {
      const bars = parseYahooBars(await r.json());
      if (bars.length) s = splitOneMinuteSession(bars, etClock(nowMs).dateKey);
    } else {
      logger.warn(`[OPEN-DRIVE] ${sym}: Yahoo 1m chart HTTP ${r.status}`);
    }
  } catch (e: any) {
    logger.warn(`[OPEN-DRIVE] ${sym}: ${e?.message ?? e}`);
  }
  cache.set(sym, { at: nowMs, s });
  return s;
}

// ─── Daily caps (1/symbol, 2 total) ──────────────────────────────────────
// In-process; a restart inside the 14-minute window could re-arm a symbol, but the
// trade-idea spine's own dedup window (createTradeIdea) still blocks the same contract.
let capDay = '';
const fired = new Map<string, number>();

function roll(nowMs: number): void {
  const d = etClock(nowMs).dateKey;
  if (d !== capDay) { capDay = d; fired.clear(); }
}
export function openDriveFiredToday(nowMs = Date.now()): { bySymbol: Record<string, number>; total: number } {
  roll(nowMs);
  const bySymbol = Object.fromEntries(fired);
  return { bySymbol, total: [...fired.values()].reduce((a, b) => a + b, 0) };
}
export function noteOpenDriveFired(symbol: string, nowMs = Date.now()): void {
  roll(nowMs);
  fired.set(symbol, (fired.get(symbol) ?? 0) + 1);
}
export function __resetOpenDriveCapsForTest(): void { capDay = ''; fired.clear(); }
export { OPEN_DRIVE_CAPS };
