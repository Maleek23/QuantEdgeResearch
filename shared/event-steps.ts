/**
 * EVENT STEPS — known scheduled events → the `events` input of the Path
 * engine (shared/path-projection.ts) and the Envelope cones
 * (shared/envelope-cone.ts). Each priced event adds one N(0, move²) jump at
 * the first simulation step at/after its time.
 *
 *   macro (server/economic-calendar.ts — FRED release dates / curated / Finnhub):
 *     high importance   move = 0.35 × S   (S = options-priced 1σ session move)
 *     medium            move = 0.15 × S
 *     low               ignored
 *   earnings (the symbol's own report):
 *     move = the implied earnings move when known, else 1.0 × S
 *     before-open → that session's open · after-close → the next session's open
 *
 * Pre-market releases (08:30 CPI / NFP) land on the open step; an event on a
 * weekend / NYSE holiday rolls to the next session's open. MODELLED weights,
 * not fitted: S already prices the nearest expiry's event premium, so the
 * multipliers stay below 1 to limit double-counting. Pure.
 */
import type { PathEvent } from './path-projection';
import { etInstant } from './path-projection';
import { isNyseHoliday } from './market-holidays';

export interface MacroEventIn { name: string; date: string; time?: string; importance: 'high' | 'medium' | 'low' }
export interface EarningsIn { date: string; timing?: string | null; impliedMove?: number | null }

export const EVENT_WEIGHT = { high: 0.35, medium: 0.15, earnings: 1 } as const;
const RTH_OPEN = 570; const RTH_CLOSE = 960;

const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
export const isTradingDay = (iso: string) => { const w = new Date(`${iso}T12:00:00Z`).getUTCDay(); return w >= 1 && w <= 5 && !isNyseHoliday(iso); };
export function nextTradingDay(iso: string, inclusive = true): string {
  let d = inclusive ? iso : addDays(iso, 1);
  for (let i = 0; i < 14 && !isTradingDay(d); i++) d = addDays(d, 1);
  return d;
}

/** "8:30 AM ET" / "14:00" / "2:00 PM" → minutes after ET midnight (null when unparseable). */
export function parseEtTime(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) { h %= 12; if (m[3].toUpperCase() === 'PM') h += 12; }
  return h * 60 + min;
}

/** When an event's move reaches price: inside RTH at its time, else the next session's open. */
export function eventInstant(date: string, minEt: number | null): number {
  if (isTradingDay(date) && minEt != null && minEt >= RTH_OPEN && minEt < RTH_CLOSE) return etInstant(date, minEt);
  const day = isTradingDay(date) && (minEt == null || minEt < RTH_OPEN) ? date : nextTradingDay(date, false);
  return etInstant(day, RTH_OPEN);
}

export function buildEventSteps(o: {
  sessionMove: number; nowMs: number; endMs: number;
  macro?: MacroEventIn[]; earnings?: EarningsIn[];
}): PathEvent[] {
  const S = Math.max(0, o.sessionMove);
  if (!(S > 0)) return [];
  const out: PathEvent[] = [];
  for (const e of o.macro ?? []) {
    if (e.importance !== 'high' && e.importance !== 'medium') continue;
    const atMs = eventInstant(e.date, parseEtTime(e.time));
    if (atMs <= o.nowMs || atMs > o.endMs) continue;
    out.push({ atMs, move: S * EVENT_WEIGHT[e.importance], label: e.name });
  }
  for (const e of o.earnings ?? []) {
    const amc = String(e.timing ?? '').toLowerCase() === 'amc';
    const day = amc ? nextTradingDay(e.date, false) : nextTradingDay(e.date, true);
    const atMs = etInstant(day, RTH_OPEN);
    if (atMs <= o.nowMs || atMs > o.endMs) continue;
    const move = e.impliedMove != null && e.impliedMove > 0 ? e.impliedMove : S * EVENT_WEIGHT.earnings;
    out.push({ atMs, move, label: `Earnings${amc ? ' (after close)' : ''}` });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}
