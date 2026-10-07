/**
 * BAR TIME — how a chart bar's timestamp and the session around it are said.
 *
 * Operator 2026-10-06 (AMD detail, after hours): the legend read "May 13, 19:54"
 * (the oldest bar, in the browser's local clock) while the table showed October,
 * and every DAILY bar was stamped "07:54 PM". A daily bar is a session, not an
 * instant: it is labelled with its session date and no time. Intraday bars are
 * labelled in ET. And a chart with no live print after the close is "Closed",
 * not "waiting for tape".
 *
 * Pure — no React, no fetch — so the chart, the legend and the tests share it.
 */
import { MARKET_HOLIDAYS } from './market-calendar';
import { marketSessionAt, type MarketSession } from './quote-freshness';

const ET_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function etParts(ms: number): { y: number; m: number; d: number; hh: number; mm: number; wd: string } {
  const p: Record<string, string> = {};
  for (const x of ET_PARTS.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: Number(p.hour) % 24, mm: Number(p.minute), wd: p.weekday };
}

export const isDailyTf = (tf: string) => tf === '1D' || tf === '1W' || tf === '1d' || tf === '1wk' || tf === '1mo';

/**
 * The trading session a DAILY bar belongs to, as YYYY-MM-DD. Feeds stamp daily
 * bars either at the session open in ET (Yahoo: 09:30 ET) or at 00:00 UTC
 * (Alpaca, many vendors). Reading a 00:00 UTC stamp in ET would give the PRIOR
 * day (20:00 ET), so a midnight-UTC stamp is read as a UTC date.
 */
export function barSessionDate(ms: number): string {
  const d = new Date(ms);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const p = etParts(ms);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** "Oct 6" (optionally "Oct 6, 2026") from YYYY-MM-DD. */
export function shortSessionDate(ymd: string, withYear = false): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}

/**
 * The label for a bar: daily/weekly → session date only ("Oct 6"); intraday →
 * "Oct 6 15:55 ET". `compact` drops the date on intraday (axis ticks).
 */
export function barTimeLabel(ms: number, tf: string, opts: { compact?: boolean; withYear?: boolean } = {}): string {
  if (!Number.isFinite(ms)) return '—';
  if (isDailyTf(tf)) return shortSessionDate(barSessionDate(ms), opts.withYear);
  const p = etParts(ms);
  const hhmm = `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
  return opts.compact ? hhmm : `${MONTHS[p.m - 1]} ${p.d} ${hhmm} ET`;
}

function ymdOf(ms: number): string {
  const p = etParts(ms);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** True when `ymd` (ET date) is a weekday that is not an NYSE holiday. */
export function isTradingDay(ymd: string): boolean {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !MARKET_HOLIDAYS.has(ymd);
}

/** The most recent regular-session close (16:00 ET) at or before `nowMs`, as its ET date. */
export function lastRegularCloseDate(nowMs: number): string {
  const p = etParts(nowMs);
  let ymd = ymdOf(nowMs);
  const closedToday = isTradingDay(ymd) && p.hh >= 16;
  if (!closedToday) {
    // walk back to the prior trading day
    let t = Date.parse(`${ymd}T12:00:00Z`);
    do { t -= 86_400_000; ymd = new Date(t).toISOString().slice(0, 10); } while (!isTradingDay(ymd));
  }
  return ymd;
}

export interface SessionStamp {
  session: MarketSession | 'holiday';
  /** Short chip text, e.g. "Closed · last 16:00 ET". */
  label: string;
  /** Longer tooltip. */
  title: string;
  /** True only in the regular session — when a missing print is worth waiting for. */
  expectTape: boolean;
}

/**
 * What a chart with NO live print should say. In the regular session a missing
 * print is worth flagging ("waiting for tape"); outside it the chart is simply
 * closed (or in extended hours) and the last bar is the last regular close.
 */
export function chartSessionStamp(nowMs: number): SessionStamp {
  const ymd = ymdOf(nowMs);
  const s = marketSessionAt(nowMs);
  const holiday = MARKET_HOLIDAYS.has(ymd) && (s === 'pre' || s === 'regular' || s === 'post');
  const closeYmd = lastRegularCloseDate(nowMs);
  const closeTxt = closeYmd === ymd ? 'last 16:00 ET' : `last ${shortSessionDate(closeYmd)} 16:00 ET`;
  if (holiday) return { session: 'holiday', label: `Closed (holiday) · ${closeTxt}`, title: `Market holiday — the last bar is the ${shortSessionDate(closeYmd)} regular close.`, expectTape: false };
  if (s === 'regular') return { session: s, label: 'Waiting for tape', title: 'Regular session — no live print or quote has arrived yet; the last bar is the history feed\'s.', expectTape: true };
  if (s === 'pre') return { session: s, label: `Pre-market · ${closeTxt}`, title: 'Pre-market (04:00–09:30 ET). Candles are regular-session history; no extended-hours print has reached this chart.', expectTape: false };
  if (s === 'post') return { session: s, label: `After-hours · ${closeTxt}`, title: 'After-hours (16:00–20:00 ET). The last candle is the regular-session close; no extended-hours print has reached this chart.', expectTape: false };
  return { session: s, label: `Closed · ${closeTxt}`, title: `Market closed. The last candle is the ${shortSessionDate(closeYmd)} regular close.`, expectTape: false };
}

/** True when an idea published at `ms` was called outside the regular session (or on a non-trading day). */
export function calledOutsideRegularSession(ms: number): boolean {
  if (!Number.isFinite(ms)) return false;
  return marketSessionAt(ms) !== 'regular' || !isTradingDay(ymdOf(ms));
}

/**
 * "Oct 6 16:42 ET" for the level map: the map's own asOf, else the newest member
 * level's asOf; null (omitted) when neither parses — never "Invalid Date".
 */
export function levelsAsOfLabel(m: { asOf?: string | null; clusters?: Array<{ members?: Array<{ asOf?: string | null }> }> }): string | null {
  let ms = m.asOf ? Date.parse(m.asOf) : NaN;
  if (!Number.isFinite(ms)) {
    const all = (m.clusters ?? []).flatMap((c) => (c.members ?? []).map((l) => (l.asOf ? Date.parse(l.asOf) : NaN))).filter(Number.isFinite);
    ms = all.length ? Math.max(...all) : NaN;
  }
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
}
