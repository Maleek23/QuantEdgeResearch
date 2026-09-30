/**
 * VOLUME READ — how heavy the tape is right now, against the same time of day.
 *
 * Operator 2026-09-30: "real-time volume needs to be measured and mentioned
 * in setup details." Raw share counts mean nothing without a baseline, and
 * whole-day averages flatter the open and punish lunch, so every ratio here
 * is time-of-day matched:
 *
 *   sessionRvol   today's cumulative RTH volume up to the latest 5-min bar,
 *                 ÷ the average cumulative volume by that same minute over the
 *                 prior (up to 20) sessions.
 *   recentRvol    the last 15 minutes' volume ÷ the average volume of that same
 *                 15-minute window over the prior sessions.
 *   triggerRvol   volume of the 5-min bar containing `at` (the trigger time)
 *                 ÷ that bar's same-window average — did the trigger come on volume?
 *
 * Source: Yahoo chart, 5-minute bars, 1 month, regular session only. Yahoo's
 * US equity bars are near real time but not an exchange feed; every read
 * carries its bar time so the UI stamps its age. Cached 60 s per symbol.
 */
import { yahooChart } from './yahoo-client';

export interface VolumeRead {
  symbol: string;
  asOf: string | null;          // close time of the latest bar used
  source: string;
  sessionDate: string | null;   // ET date of "today" in the read
  sessionVolume: number | null;
  sessionRvol: number | null;
  recentVolume: number | null;
  recentRvol: number | null;
  trigger: { at: string; barVolume: number; rvol: number | null } | null;
  baselineSessions: number;
  label: 'heavy' | 'above normal' | 'normal' | 'light' | 'unknown';
  note: string | null;
}

const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function etParts(sec: number): { day: string; min: number } {
  const p: Record<string, string> = {};
  for (const x of et.formatToParts(new Date(sec * 1000))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

const cache = new Map<string, { at: number; v: VolumeRead }>();
const r2 = (x: number) => Math.round(x * 100) / 100;

export async function getVolumeRead(symbol: string, atIso?: string | null): Promise<VolumeRead> {
  const sym = symbol.toUpperCase();
  const key = `${sym}|${atIso ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;

  const empty: VolumeRead = { symbol: sym, asOf: null, source: 'yahoo 5m', sessionDate: null, sessionVolume: null, sessionRvol: null, recentVolume: null, recentRvol: null, trigger: null, baselineSessions: 0, label: 'unknown', note: null };
  const j = await yahooChart(sym, { range: '1mo', interval: '5m' });
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const vol: (number | null)[] = res?.indicators?.quote?.[0]?.volume ?? [];
  if (!ts.length) { const v = { ...empty, note: 'no intraday bars (provider unavailable)' }; cache.set(key, { at: Date.now(), v }); return v; }

  // bucket[day][minuteOfDay] = volume, RTH only (09:30–15:55 bar starts)
  const days = new Map<string, Map<number, number>>();
  for (let i = 0; i < ts.length; i++) {
    const v = vol[i];
    if (v == null) continue;
    const { day, min } = etParts(ts[i]);
    if (min < 570 || min >= 960) continue;
    (days.get(day) ?? days.set(day, new Map()).get(day)!).set(min, v);
  }
  const order = [...days.keys()].sort();
  if (!order.length) { const v = { ...empty, note: 'no regular-session bars' }; cache.set(key, { at: Date.now(), v }); return v; }
  const today = order[order.length - 1];
  const prior = order.slice(0, -1).slice(-20);
  const tMap = days.get(today)!;
  const lastMin = Math.max(...tMap.keys());
  const sumTo = (m: Map<number, number>, from: number, to: number) => { let s = 0; for (const [k, v] of m) if (k >= from && k <= to) s += v; return s; };
  const avgOver = (from: number, to: number) => {
    if (!prior.length) return null;
    const xs = prior.map((d) => sumTo(days.get(d)!, from, to));
    const a = xs.reduce((x, y) => x + y, 0) / xs.length;
    return a > 0 ? a : null;
  };

  const sessionVolume = sumTo(tMap, 570, lastMin);
  const sessBase = avgOver(570, lastMin);
  const recentFrom = Math.max(570, lastMin - 10); // three 5-min bars = last 15 min
  const recentVolume = sumTo(tMap, recentFrom, lastMin);
  const recentBase = avgOver(recentFrom, lastMin);

  let trigger: VolumeRead['trigger'] = null;
  if (atIso && Number.isFinite(Date.parse(atIso))) {
    const { day, min } = etParts(Math.floor(Date.parse(atIso) / 1000));
    const barMin = min - (min % 5);
    const m = days.get(day);
    const idx = order.indexOf(day);
    if (m && m.has(barMin)) {
      const base = order.slice(Math.max(0, idx - 20), idx).map((d) => days.get(d)!.get(barMin) ?? 0);
      const b = base.length ? base.reduce((x, y) => x + y, 0) / base.length : 0;
      trigger = { at: atIso, barVolume: m.get(barMin)!, rvol: b > 0 ? r2(m.get(barMin)! / b) : null };
    }
  }

  const sessionRvol = sessBase ? r2(sessionVolume / sessBase) : null;
  const recentRvol = recentBase ? r2(recentVolume / recentBase) : null;
  const lead = recentRvol ?? sessionRvol;
  const label: VolumeRead['label'] = lead == null ? 'unknown' : lead >= 2 ? 'heavy' : lead >= 1.3 ? 'above normal' : lead >= 0.7 ? 'normal' : 'light';
  const lastTs = ts.filter((t) => { const p = etParts(t); return p.day === today && p.min === lastMin; })[0];
  const v: VolumeRead = {
    symbol: sym,
    asOf: lastTs ? new Date((lastTs + 300) * 1000).toISOString() : null,
    source: 'yahoo 5m',
    sessionDate: today,
    sessionVolume, sessionRvol, recentVolume, recentRvol, trigger,
    baselineSessions: prior.length,
    label,
    note: prior.length < 10 ? `baseline is only ${prior.length} sessions` : null,
  };
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), v });
  return v;
}
