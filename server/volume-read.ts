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
 *
 * 2026-10-06 (AMD showed "Volume — unavailable" after hours): when Yahoo's
 * chart host refuses (429 back-off returns null) the read used to come back
 * 'unknown' with a note the UI never printed. Now: Yahoo chart → the shared
 * historical-candles cache (serves a stale copy up to 30 min) → Alpaca 5-min
 * bars; the note says precisely which sources failed, and after the close the
 * read says it covers the completed session.
 */
import { yahooChart } from './yahoo-client';
import { marketSessionAt } from '@shared/quote-freshness';

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
  /** True when the read's session has ended (after 16:00 ET, or an earlier day). */
  sessionClosed?: boolean;
}

/** One 5-minute bar: start time (epoch seconds) and its volume. */
export interface VolBar { t: number; v: number | null }

const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function etParts(sec: number): { day: string; min: number } {
  const p: Record<string, string> = {};
  for (const x of et.formatToParts(new Date(sec * 1000))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

const cache = new Map<string, { at: number; v: VolumeRead }>();
const r2 = (x: number) => Math.round(x * 100) / 100;

const emptyRead = (sym: string, source: string, note: string): VolumeRead => ({
  symbol: sym, asOf: null, source, sessionDate: null, sessionVolume: null, sessionRvol: null, recentVolume: null, recentRvol: null,
  trigger: null, baselineSessions: 0, label: 'unknown', note,
});

/** Pure: the time-of-day matched read from 5-minute bars. */
export function computeVolumeRead(sym: string, bars: VolBar[], atIso: string | null | undefined, source: string, nowMs = Date.now()): VolumeRead {
  // bucket[day][minuteOfDay] = volume, RTH only (09:30–15:55 bar starts)
  const days = new Map<string, Map<number, number>>();
  for (const b of bars) {
    if (b.v == null || !Number.isFinite(b.v)) continue;
    const { day, min } = etParts(b.t);
    if (min < 570 || min >= 960) continue;
    (days.get(day) ?? days.set(day, new Map()).get(day)!).set(min, b.v);
  }
  const order = [...days.keys()].sort();
  if (!order.length) return emptyRead(sym, source, `${source}: no regular-session bars in the window`);
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
  const nowDay = etParts(Math.floor(nowMs / 1000)).day;
  const sessionClosed = today < nowDay || marketSessionAt(nowMs) !== 'regular';
  // After the close "last 15 min" is the closing window, not "right now": lead with the day.
  const lead = sessionClosed ? (sessionRvol ?? recentRvol) : (recentRvol ?? sessionRvol);
  const label: VolumeRead['label'] = lead == null ? 'unknown' : lead >= 2 ? 'heavy' : lead >= 1.3 ? 'above normal' : lead >= 0.7 ? 'normal' : 'light';
  const lastBar = bars.find((b) => { const p = etParts(b.t); return p.day === today && p.min === lastMin; });
  const notes: string[] = [];
  if (!prior.length) notes.push('no prior sessions in the window — no baseline to compare against');
  else if (prior.length < 10) notes.push(`baseline is only ${prior.length} sessions`);
  return {
    symbol: sym,
    asOf: lastBar ? new Date((lastBar.t + 300) * 1000).toISOString() : null,
    source,
    sessionDate: today,
    sessionVolume, sessionRvol, recentVolume, recentRvol, trigger,
    baselineSessions: prior.length,
    label,
    note: notes.length ? notes.join('; ') : null,
    sessionClosed,
  };
}

async function yahooBars(sym: string): Promise<VolBar[] | null> {
  const j = await yahooChart(sym, { range: '1mo', interval: '5m' });
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const vol: (number | null)[] = res?.indicators?.quote?.[0]?.volume ?? [];
  return ts.length ? ts.map((t, i) => ({ t, v: vol[i] ?? null })) : null;
}

async function cachedCandleBars(sym: string): Promise<VolBar[] | null> {
  const { fetchCandles } = await import('./historical-candles');
  const rows = await fetchCandles(sym, '1mo', '5m');
  return rows.length ? rows.map((r) => ({ t: r.time, v: r.volume })) : null;
}

async function alpacaBars(sym: string): Promise<VolBar[] | null> {
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) return null;
  const { fetchStockBarsBatched } = await import('./zero-dte-sniper');
  const start = new Date(Date.now() - 32 * 86_400_000).toISOString();
  const m = await fetchStockBarsBatched([sym], '5Min', start);
  const rows = m.get(sym) ?? [];
  return rows.length ? rows.map((b: any) => ({ t: Math.floor(Date.parse(b.t) / 1000), v: Number(b.v) })) : null;
}

export async function getVolumeRead(symbol: string, atIso?: string | null): Promise<VolumeRead> {
  const sym = symbol.toUpperCase();
  const key = `${sym}|${atIso ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;

  const sources: Array<[string, (s: string) => Promise<VolBar[] | null>]> = [
    ['yahoo 5m', yahooBars],
    ['yahoo 5m (cached)', cachedCandleBars],
    ['alpaca 5m', alpacaBars],
  ];
  const failed: string[] = [];
  let v: VolumeRead | null = null;
  for (const [name, fn] of sources) {
    let bars: VolBar[] | null = null;
    try { bars = await fn(sym); } catch (e) { failed.push(`${name} error (${(e as Error).message})`); continue; }
    if (!bars) { failed.push(`${name} returned no bars`); continue; }
    const read = computeVolumeRead(sym, bars, atIso, name);
    if (read.label !== 'unknown') { v = failed.length ? { ...read, note: [read.note, `fell back after: ${failed.join('; ')}`].filter(Boolean).join('; ') } : read; break; }
    failed.push(`${name}: ${read.note ?? 'no ratio'}`);
  }
  if (!v) v = emptyRead(sym, 'none', `every intraday source failed — ${failed.join('; ')}`);
  if (cache.size > 300) cache.clear();
  // A failed read is retried sooner (20 s) than a good one (60 s).
  cache.set(key, { at: v.label === 'unknown' ? Date.now() - 40_000 : Date.now(), v });
  return v;
}
