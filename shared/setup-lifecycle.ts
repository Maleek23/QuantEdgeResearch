/**
 * SETUP LIFECYCLE — does a published setup still belong on today's board?
 * =======================================================================
 * Pure (no I/O). The NEXUS board and Today's book both read it, so "fresh",
 * "carried" and "stale" mean the same thing on every surface.
 * docs/SETUP_LIFECYCLE.md is the human statement of these rules.
 *
 * A setup is published once; the market keeps moving. Every open idea on the
 * board gets ONE computed state, re-derived on every read from its own stored
 * fields (publish time, holding period, exit_by, entry_valid_until, option
 * expiry, entry/stop/target) and the latest live price:
 *
 *   RESOLVED  the plan is finished: its lifecycle reached `closed`, or the live
 *             price is already through its stop or its target (the outcome
 *             tracker records the result; this only labels the row).
 *   STALE     no longer actionable as published:
 *               · its holding window has ended (exit_by, or the window its
 *                 holding period / option expiry implies — see windowFor), or
 *               · its entry window (entry_valid_until) closed with no trigger, or
 *               · price moved more than 1 unit past entry in the trade's
 *                 direction without a fill (unit = ATR when the row carries one,
 *                 else the idea's own risk, |entry − stop|), or
 *               · CARRIED option only: the contract expires before the rest of
 *                 the hold (option DTE < remaining hold).
 *   FRESH     published today (ET calendar day of the publish time).
 *   CARRIED   published on an earlier day and still valid.
 *
 * Holding windows (US equity sessions, weekends + NYSE holidays skipped; the
 * publish session is the ET trading day of the publish, or the next one when
 * published after 16:00 / on a non-trading day):
 *   0DTE option          close of the expiry day
 *   day / intraday       close of the publish session
 *   week-ending          close of the last trading day of the publish week
 *   swing                close of the 5th session (publish session = 1) — 2–5 sessions
 *   position / long      close of the 20th session (the path replay's horizon)
 *   unknown              close of the publish session
 *   options              never past the contract's expiry close
 *   crypto (24/7)        calendar clock: day = 24h, swing = 5 days, position = 28 days
 *   exit_by on the row   overrides all of the above (it is the idea's own deadline)
 *
 * This never decides an outcome and never edits a row — it labels and orders.
 */
import { etParts, etWallToMs } from './loss-rules';
import { MARKET_HOLIDAYS } from './market-calendar';

export type SetupLifecycle = 'fresh' | 'carried' | 'stale' | 'resolved';

export const LIFECYCLE_ORDER: Record<SetupLifecycle, number> = { fresh: 0, carried: 0, stale: 1, resolved: 2 };

export interface LifecycleInput {
  direction: 'long' | 'short' | string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  assetType?: string | null;
  holdingPeriod?: string | null;
  tradeType?: string | null;
  source?: string | null;
  expiryDate?: string | null;
  calledAt?: string | null;
  generatedAt?: string | null;
  exitBy?: string | null;
  entryValidUntil?: string | null;
  lifecycleState?: string | null;
  triggeredAt?: string | null;
  /** Live price of the underlying (caller decides which read is freshest). */
  currentPrice?: number | null;
  /** Daily ATR of the underlying when the caller has one; else the risk unit is used. */
  atr?: number | null;
}

export interface LifecycleRead {
  state: SetupLifecycle;
  /** Short chip text: FRESH · CARRIED · STALE · RESOLVED. */
  label: string;
  /** One line of why, in plain words. */
  reason: string;
  /** ET calendar day of the publish time (YYYY-MM-DD). */
  publishedDay: string | null;
  /** Session number today within the hold (publish session = 1); null for crypto / unknown publish. */
  session: number | null;
  /** Sessions the window allows (swing = 5); null when the window is not session-counted. */
  sessions: number | null;
  /** When the holding window ends (epoch ms), null when it cannot be read. */
  windowEndsMs: number | null;
  windowBasis: 'exit_by' | '0dte' | 'day' | 'week-ending' | 'swing' | 'position' | 'unknown' | 'crypto';
  /** Unit used for the "ran past entry" check. */
  moveUnit: 'atr' | 'risk' | null;
}

const RTH_CLOSE = 16 * 60;
const DAY_MS = 86_400_000;

/** ET calendar day (YYYY-MM-DD) of an instant. */
export function etDay(ms: number): string {
  return etParts(ms).dateKey;
}

const dayParts = (day: string) => day.split('-').map(Number) as [number, number, number];
const shiftDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export function isTradingDay(day: string, holidays: Set<string> = MARKET_HOLIDAYS): boolean {
  const wd = weekdayOf(day);
  return wd !== 0 && wd !== 6 && !holidays.has(day);
}

/** The next trading day strictly after `day`. */
export function nextTradingDay(day: string): string {
  let d = shiftDay(day, 1);
  for (let i = 0; i < 15 && !isTradingDay(d); i++) d = shiftDay(d, 1);
  return d;
}

/** The trading day strictly before `day`. */
export function prevTradingDay(day: string): string {
  let d = shiftDay(day, -1);
  for (let i = 0; i < 15 && !isTradingDay(d); i++) d = shiftDay(d, -1);
  return d;
}

/** The session an instant belongs to: its ET day if a trading day before 16:00, else the next trading day. */
export function sessionDayOf(ms: number): string {
  const p = etParts(ms);
  return isTradingDay(p.dateKey) && p.minutes < RTH_CLOSE ? p.dateKey : nextTradingDay(p.dateKey);
}

/** 16:00 ET of a day, epoch ms. */
export function closeMs(day: string): number {
  const [y, m, d] = dayParts(day);
  return etWallToMs(y, m, d, RTH_CLOSE);
}

/** Trading sessions from `from` to `to` inclusive (1 when same day, 0 when `to` precedes `from`). */
export function sessionsBetween(from: string, to: string): number {
  if (to < from) return 0;
  let n = 0;
  for (let d = from; d <= to && n < 400; d = shiftDay(d, 1)) if (isTradingDay(d)) n++;
  return n;
}

/** The `n`th session counting `start` as session 1. */
export function nthSession(start: string, n: number): string {
  let d = start;
  for (let i = 1; i < n; i++) d = nextTradingDay(d);
  return d;
}

/** Monday (ET) of the week containing `day`. */
export function weekStartOf(day: string): string {
  const wd = weekdayOf(day);
  return shiftDay(day, wd === 0 ? -6 : 1 - wd);
}

const parseMs = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
};

export function publishMsOf(p: Pick<LifecycleInput, 'calledAt' | 'generatedAt'>): number | null {
  return parseMs(p.calledAt) ?? parseMs(p.generatedAt);
}

const isCrypto = (p: LifecycleInput) => String(p.assetType ?? '').toLowerCase() === 'crypto' || p.source === 'crypto_engine';
const expiryDay = (p: LifecycleInput) => {
  const e = String(p.expiryDate ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(e) && (p.assetType == null || /option/i.test(String(p.assetType))) ? e : null;
};

function holdKind(p: LifecycleInput): 'day' | 'week-ending' | 'swing' | 'position' | 'unknown' {
  const hp = `${p.holdingPeriod ?? ''}`.toLowerCase() || `${p.tradeType ?? ''}`.toLowerCase();
  if (/week/.test(hp)) return 'week-ending';
  if (/position|leap|long/.test(hp)) return 'position';
  if (/swing/.test(hp)) return 'swing';
  if (/day|intraday|scalp|0dte/.test(hp)) return 'day';
  return 'unknown';
}

export const HOLD_SESSIONS = { day: 1, swing: 5, position: 20, unknown: 1 } as const;

/**
 * The holding window implied by the idea's own fields (before the expiry clamp),
 * plus the expiry close for options. Exported for the doc/tests.
 */
export function windowFor(p: LifecycleInput, publishMs: number): {
  ruleEndMs: number; endMs: number; basis: LifecycleRead['windowBasis']; startSession: string | null; sessions: number | null; expiryCloseMs: number | null;
} {
  const exitBy = parseMs(p.exitBy);
  const exp = expiryDay(p);
  const expiryCloseMs = exp ? closeMs(exp) : null;
  if (isCrypto(p)) {
    const kind = holdKind(p);
    const days = kind === 'position' ? 28 : kind === 'swing' ? 5 : kind === 'week-ending' ? 7 : 1;
    const end = exitBy ?? publishMs + days * DAY_MS;
    return { ruleEndMs: end, endMs: end, basis: exitBy ? 'exit_by' : 'crypto', startSession: null, sessions: null, expiryCloseMs: null };
  }
  const start = sessionDayOf(publishMs);
  const clamp = (end: number) => (expiryCloseMs != null ? Math.min(end, expiryCloseMs) : end);
  if (exitBy != null) return { ruleEndMs: exitBy, endMs: clamp(exitBy), basis: 'exit_by', startSession: start, sessions: null, expiryCloseMs };
  // 0DTE: the contract expires in its publish session.
  if (exp && exp <= start) return { ruleEndMs: closeMs(start), endMs: closeMs(start), basis: '0dte', startSession: start, sessions: 1, expiryCloseMs };
  const kind = holdKind(p);
  if (kind === 'week-ending') {
    let last = shiftDay(weekStartOf(start), 4);
    while (!isTradingDay(last) && last > start) last = shiftDay(last, -1);
    const end = closeMs(last < start ? start : last);
    return { ruleEndMs: end, endMs: clamp(end), basis: 'week-ending', startSession: start, sessions: sessionsBetween(start, last < start ? start : last), expiryCloseMs };
  }
  const n = HOLD_SESSIONS[kind];
  const end = closeMs(nthSession(start, n));
  return { ruleEndMs: end, endMs: clamp(end), basis: kind, startSession: start, sessions: n, expiryCloseMs };
}

const fmtWhen = (ms: number) => {
  const d = new Date(ms);
  const day = d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
  const t = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return `${day} ${t} ET`;
};

const isTriggered = (p: LifecycleInput) => !!p.triggeredAt || p.lifecycleState === 'triggered' || p.lifecycleState === 'executed';

export function setupLifecycle(p: LifecycleInput, nowMs: number = Date.now()): LifecycleRead {
  const publishMs = publishMsOf(p);
  const publishedDay = publishMs != null ? etDay(publishMs) : null;
  const base = { publishedDay, session: null as number | null, sessions: null as number | null, windowEndsMs: null as number | null, windowBasis: 'unknown' as LifecycleRead['windowBasis'], moveUnit: null as LifecycleRead['moveUnit'] };
  const out = (state: SetupLifecycle, reason: string, extra: Partial<LifecycleRead> = {}): LifecycleRead =>
    ({ ...base, ...extra, state, label: state.toUpperCase(), reason });

  const long = String(p.direction).toLowerCase() !== 'short';
  const entry = Number(p.entryPrice), stop = Number(p.stopLoss), target = Number(p.targetPrice);
  const px = p.currentPrice != null && Number.isFinite(Number(p.currentPrice)) && Number(p.currentPrice) > 0 ? Number(p.currentPrice) : null;

  // ── RESOLVED ──
  if (p.lifecycleState === 'closed' || p.lifecycleState === 'invalidated') return out('resolved', p.lifecycleState === 'invalidated' ? 'invalidated before trigger' : 'plan closed');
  if (px != null && Number.isFinite(stop) && stop > 0 && (long ? px <= stop : px >= stop)) {
    return out('resolved', `live ${px.toFixed(2)} is through the ${stop.toFixed(2)} stop — the outcome tracker records the result`);
  }
  if (px != null && Number.isFinite(target) && target > 0 && (long ? px >= target : px <= target)) {
    return out('resolved', `live ${px.toFixed(2)} reached the ${target.toFixed(2)} target — the outcome tracker records the result`);
  }

  if (publishMs == null) return out('carried', 'no publish time on the row — kept, unverified');

  const w = windowFor(p, publishMs);
  base.windowEndsMs = w.endMs;
  base.windowBasis = w.basis;
  if (w.startSession && w.sessions != null) {
    base.sessions = w.sessions;
    base.session = Math.max(1, sessionsBetween(w.startSession, sessionDayOf(Math.max(nowMs, publishMs))));
  }
  const fresh = publishedDay === etDay(nowMs);

  // ── STALE ──
  if (nowMs >= w.endMs) {
    const why = w.expiryCloseMs != null && w.endMs === w.expiryCloseMs && w.endMs < w.ruleEndMs ? 'contract expired' : `${w.basis === 'exit_by' ? 'exit-by deadline' : `${w.basis} window`} ended`;
    return out('stale', `${why} ${fmtWhen(w.endMs)}`);
  }
  const triggered = isTriggered(p);
  const entryUntil = parseMs(p.entryValidUntil);
  if (!triggered && entryUntil != null && nowMs >= entryUntil) {
    return out('stale', `entry window closed ${fmtWhen(entryUntil)} without a trigger`);
  }
  const atr = p.atr != null && Number.isFinite(Number(p.atr)) && Number(p.atr) > 0 ? Number(p.atr) : null;
  const risk = Number.isFinite(entry) && Number.isFinite(stop) ? Math.abs(entry - stop) : 0;
  const unit = atr ?? (risk > 0 ? risk : null);
  if (unit != null) base.moveUnit = atr != null ? 'atr' : 'risk';
  if (!triggered && px != null && unit != null && Number.isFinite(entry) && entry > 0) {
    const ran = long ? px - entry : entry - px;
    if (ran > unit) {
      return out('stale', `price ran ${(ran / unit).toFixed(1)}${atr != null ? '×ATR' : 'R'} past the ${entry.toFixed(2)} entry without a fill`);
    }
  }
  if (!fresh && w.expiryCloseMs != null && w.basis !== '0dte' && w.basis !== 'exit_by' && w.expiryCloseMs < w.ruleEndMs) {
    const dteSessions = sessionsBetween(sessionDayOf(nowMs), etDay(w.expiryCloseMs));
    const holdLeft = sessionsBetween(sessionDayOf(nowMs), etDay(w.ruleEndMs));
    return out('stale', `contract has ${dteSessions} session${dteSessions === 1 ? '' : 's'} left, the ${w.basis} hold needs ${holdLeft}`);
  }

  // ── FRESH / CARRIED ──
  const until = `valid until ${fmtWhen(w.endMs)}`;
  if (fresh) return out('fresh', `published today · ${until}`);
  const sess = base.session != null && base.sessions != null ? `session ${base.session} of ${base.sessions} · ` : '';
  return out('carried', `${sess}${until}`);
}

// ── Day buckets (publish time, ET) ─────────────────────────────────────────

export type DayFilter = 'today' | 'yesterday' | 'week' | 'all' | string;

/** Does a publish day match a filter? `yesterday` = the previous trading session. */
export function matchesDay(publishedDay: string | null, filter: DayFilter, nowMs: number = Date.now()): boolean {
  if (filter === 'all') return true;
  if (!publishedDay) return false;
  const today = etDay(nowMs);
  if (filter === 'today') return publishedDay === today;
  if (filter === 'yesterday') return publishedDay === prevTradingDay(today);
  if (filter === 'week') return publishedDay >= weekStartOf(today) && publishedDay <= today;
  return /^\d{4}-\d{2}-\d{2}$/.test(filter) ? publishedDay === filter : true;
}

/** Heading for a day group: "Today", "Yesterday" (previous session), else "Wed Sep 30". */
export function dayHeading(day: string | null, nowMs: number = Date.now()): string {
  if (!day) return 'Undated';
  const today = etDay(nowMs);
  if (day === today) return 'Today';
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  return day === prevTradingDay(today) ? `Yesterday · ${label}` : label;
}

/**
 * Board order with lifecycle: fresh/carried first, then stale, then resolved;
 * inside a tier the caller's order (server boardRank / score) is kept.
 */
export function sinkByLifecycle<T>(rows: T[], stateOf: (r: T) => SetupLifecycle): T[] {
  return rows.map((r, i) => ({ r, i, t: LIFECYCLE_ORDER[stateOf(r)] })).sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.r);
}

export const DAY_CHIP_KEYS = ['today', 'yesterday', 'week', 'all'] as const;
export type DayChip = typeof DAY_CHIP_KEYS[number];

/**
 * The NEXUS day filter: rows published on the chosen ET day(s), stale/resolved
 * hidden under TODAY unless asked for, a count per chip (same hiding rule), and
 * the shown rows grouped by publish day (newest day first, board order inside).
 */
export function filterBoardByDay<T>(rows: T[], o: {
  dayOf: (r: T) => string | null;
  stateOf: (r: T) => SetupLifecycle | undefined;
  day: DayFilter;
  showStale: boolean;
  nowMs: number;
}): { rows: T[]; staleHidden: number; counts: Record<DayChip, number>; groups: Array<[string | null, T[]]> } {
  const sunk = (r: T) => { const s = o.stateOf(r); return s === 'stale' || s === 'resolved'; };
  const visible = (r: T, f: DayFilter) => matchesDay(o.dayOf(r), f, o.nowMs) && !(f === 'today' && !o.showStale && sunk(r));
  const shown = rows.filter((r) => visible(r, o.day));
  const staleHidden = o.day === 'today' && !o.showStale ? rows.filter((r) => matchesDay(o.dayOf(r), 'today', o.nowMs) && sunk(r)).length : 0;
  const counts = Object.fromEntries(DAY_CHIP_KEYS.map((k) => [k, rows.filter((r) => visible(r, k)).length])) as Record<DayChip, number>;
  const by = new Map<string | null, T[]>();
  for (const r of shown) { const d = o.dayOf(r); const g = by.get(d); if (g) g.push(r); else by.set(d, [r]); }
  const key = (d: string | null) => d ?? '';
  const groups = Array.from(by.entries()).sort((a, b) => (key(a[0]) < key(b[0]) ? 1 : key(a[0]) > key(b[0]) ? -1 : 0));
  return { rows: shown, staleHidden, counts, groups };
}
