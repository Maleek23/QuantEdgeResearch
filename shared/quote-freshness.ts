/**
 * QUOTE FRESHNESS — one definition of "which session is this print from, how
 * old is it, and what may a surface call it". Pure; safe on server and client.
 *
 * Why (2026-10-01): the platform printed "Live" next to prices that were a
 * 15-minute-delayed CBOE level, a 10-minute-delayed ES future, or yesterday's
 * close stamped with the HTTP response time. The rule (memory: Live, Not
 * Carried) is that a value is never presented as current unless it is; every
 * quote carries `session`, `asOf` (the PRINT time, not the fetch time),
 * `source`, `delayedSec` and `proxy`, and the UI derives its label from these
 * fields only (docs/DATA_LATENCY.md).
 *
 * Sessions (US equities, ET):
 *   overnight 20:00–04:00 (Sun 20:00 → Fri 04:00; Blue Ocean / Alpaca "overnight")
 *   pre       04:00–09:30
 *   regular   09:30–16:00
 *   post      16:00–20:00
 *   closed    Fri 20:00 → Sun 20:00
 * Exchange holidays are not modelled here — on a holiday the clock says
 * "regular" but no print will be fresh, so the age stamp still tells the truth.
 */

export type MarketSession = 'pre' | 'regular' | 'post' | 'overnight' | 'closed';

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** ET weekday (0=Sun) and minutes after midnight for an epoch-ms instant. */
export function etClock(ms: number): { dow: number; minutes: number } {
  const parts = ET_FMT.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = Number(get('hour')) % 24;
  return { dow: DOW[get('weekday')] ?? 0, minutes: hour * 60 + Number(get('minute')) };
}

/** Session the US equity market is in at `ms` (clock only — no holiday calendar). */
export function marketSessionAt(ms: number): MarketSession {
  const { dow, minutes } = etClock(ms);
  const PRE = 4 * 60, OPEN = 9 * 60 + 30, CLOSE = 16 * 60, POST_END = 20 * 60;
  if (dow === 6) return 'closed';
  if (dow === 0) return minutes >= POST_END ? 'overnight' : 'closed';
  if (minutes < PRE) return 'overnight'; // Mon–Fri 00:00–04:00 (Mon continues Sunday's night)
  if (minutes < OPEN) return 'pre';
  if (minutes < CLOSE) return 'regular';
  if (minutes < POST_END) return 'post';
  return dow === 5 ? 'closed' : 'overnight';
}

/** "07:42" in ET. */
export function etHHMM(ms: number): string {
  const { minutes } = etClock(ms);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export interface QuoteCandidate {
  price: number;
  /** Print time, epoch ms. */
  at: number;
  source: string;
  /** Seconds the venue/feed is known to lag (0 = realtime, 900 = 15-minute delayed). */
  delayedSec?: number | null;
}

/** The candidate whose print is most recent. Ties keep the earlier (preferred) entry. */
export function pickFreshest<T extends QuoteCandidate>(cands: Array<T | null | undefined>): T | null {
  let best: T | null = null;
  for (const c of cands) {
    if (!c || !(c.price > 0) || !Number.isFinite(c.at)) continue;
    if (!best || c.at > best.at) best = c;
  }
  return best;
}

/**
 * Index level implied by a tradeable proxy: proxyNow × (indexRef / proxyRef),
 * where the two refs are observed at the SAME instant (e.g. SPX and SPY at the
 * time of CBOE's delayed print, or both regular closes). Null when unusable.
 */
export function ratioProxy(proxyNow: number, indexRef: number, proxyRef: number): number | null {
  if (!(proxyNow > 0) || !(indexRef > 0) || !(proxyRef > 0)) return null;
  return proxyNow * (indexRef / proxyRef);
}

/** Close of the latest 1-minute bar at or before `atSec` (bars ascending). */
export function barCloseAt(ts: Array<number | null | undefined>, closes: Array<number | null | undefined>, atSec: number, maxGapSec = 180): number | null {
  for (let i = Math.min(ts.length, closes.length) - 1; i >= 0; i--) {
    const t = Number(ts[i]);
    const c = Number(closes[i]);
    if (!Number.isFinite(t) || !(c > 0) || closes[i] == null) continue;
    if (t <= atSec) return atSec - t <= maxGapSec ? c : null;
  }
  return null;
}

/** A quote's freshness fields as the API returns them. */
export interface FreshnessFields {
  session?: string | null;
  asOf?: string | number | null;
  source?: string | null;
  delayed?: boolean | null;
  delayedSec?: number | null;
  proxy?: boolean | null;
  stale?: boolean | null;
}

export type FreshTone = 'live' | 'ext' | 'delayed' | 'stale';

export interface FreshnessChip {
  /** "Live", "Delayed 15m", "Pre-mkt 07:42", "After-hrs 17:10", "Overnight (proxy)". */
  label: string;
  tone: FreshTone;
  /** Seconds since the print, or null when unknown. */
  ageSec: number | null;
  /** Long form for a tooltip / screen reader. */
  title: string;
}

/** A regular-session print older than this is not "Live". */
export const LIVE_MAX_AGE_SEC = 120;

const SESSION_WORD: Record<string, string> = {
  pre: 'Pre-mkt', post: 'After-hrs', overnight: 'Overnight', closed: 'Close', regular: 'Live',
};

/**
 * The one label rule. Order matters: proxy and delayed are disclosed before a
 * session time, and a regular-session print only earns "Live" when it is
 * realtime AND recent.
 */
export function freshnessChip(q: FreshnessFields, now = Date.now()): FreshnessChip {
  const at = q.asOf == null || q.asOf === '' ? NaN : typeof q.asOf === 'number' ? q.asOf : Date.parse(q.asOf);
  const ageSec = Number.isFinite(at) ? Math.max(0, Math.round((now - at) / 1000)) : null;
  const session = (q.session ?? (Number.isFinite(at) ? marketSessionAt(at) : 'closed')) as string;
  const delaySec = Number.isFinite(Number(q.delayedSec)) && Number(q.delayedSec) > 0 ? Number(q.delayedSec) : q.delayed ? 900 : 0;
  const src = q.source ? ` · ${q.source}` : '';
  const timeAt = Number.isFinite(at) ? etHHMM(at) : null;

  if (q.proxy) {
    const word = session === 'regular' ? 'Live' : (SESSION_WORD[session] ?? 'Last');
    return { label: `${word} (proxy)`, tone: session === 'regular' && delaySec === 0 ? 'ext' : 'delayed', ageSec, title: `Estimated from a tradeable proxy, not the index itself${src}${timeAt ? ` · print ${timeAt} ET` : ''}` };
  }
  if (q.stale) {
    return { label: timeAt ? `Stale ${timeAt}` : 'Stale', tone: 'stale', ageSec, title: `Last refresh failed; carried price${src}` };
  }
  if (delaySec >= 60) {
    return { label: `Delayed ${Math.round(delaySec / 60)}m`, tone: 'delayed', ageSec, title: `Feed is ${Math.round(delaySec / 60)} minutes delayed${src}${timeAt ? ` · print ${timeAt} ET` : ''}` };
  }
  if (session === 'pre' || session === 'post' || session === 'overnight') {
    return { label: `${SESSION_WORD[session]}${timeAt ? ` ${timeAt}` : ''}`, tone: 'ext', ageSec, title: `${session === 'pre' ? 'Pre-market' : session === 'post' ? 'After-hours' : 'Overnight'} print${src}` };
  }
  if (session === 'regular') {
    if (ageSec != null && ageSec <= LIVE_MAX_AGE_SEC) return { label: 'Live', tone: 'live', ageSec, title: `Realtime print${src}` };
    return { label: timeAt ? `Last ${timeAt}` : 'Last', tone: ageSec != null && ageSec > 30 * 60 ? 'stale' : 'delayed', ageSec, title: `No new print for ${ageSec ?? '?'}s${src}` };
  }
  return { label: timeAt ? `Close ${timeAt}` : 'Closed', tone: 'ext', ageSec, title: `Market closed; last print${src}` };
}

/**
 * CBOE's delayed-quote `last_trade_time` is an ET wall-clock string with no
 * offset ("2026-09-30T16:14:59"). Epoch ms, or null when unparseable.
 */
export function parseEtWallTime(s: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s ?? ''));
  if (!m) return null;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, se);
  // New York is UTC−4 or UTC−5: keep the offset whose ET wall clock round-trips.
  for (const off of [4, 5]) {
    const t = guess + off * 3_600_000;
    const { minutes } = etClock(t);
    if (minutes === h * 60 + mi) return t;
  }
  return guess + 5 * 3_600_000;
}
