/**
 * GEX WALL-TOUCH — pure core (no I/O). Status: MEASURING.
 * ========================================================
 * Operator + Femi, 2026-09-30: "see it approaching a call/put wall". AMD's
 * next-7-day put wall was 600 (call wall 620); the low printed 600.10 at 11:15
 * ET and price bounced to 610.58. SPY rejected one level ~4 times the same day.
 *
 * One definition shared by the live engine (server/wall-touch.ts), the proxy
 * replay (research/wall-touch-proxy-replay.ts) and the tests
 * (scripts/test-wall-touch.ts), so what is measured is what runs.
 *
 * Bars are REGULAR-SESSION 1-minute bars (server/zero-dte-sniper-core.ts
 * MinuteBar). Everything is CAUSAL: an event at bar i depends only on bars
 * 0..i, so a full-day run gives the events a live pass saw minute by minute.
 *
 * Distances are DYNAMIC (ATR of 5-minute bars, atr5Series), never a fixed %:
 *   approach zone   within max(0.15%, 0.5 × ATR5) of the wall (on a 1-min close)
 *   tolerance       max(0.05%, 0.1 × ATR5)
 *   TOUCH           1-min low ≤ put wall + tol   (call wall: high ≥ wall − tol)
 *   REJECTION       within the next 1–5 bars a close back away from the wall by
 *                   ≥ 0.25 × ATR5 (put: close ≥ wall + 0.25·ATR5)
 *   BREAK           a close THROUGH the wall by > tol (put: close < wall − tol)
 *                   — the opposite trade; may happen on the touch bar itself
 *   STALL           neither within 5 bars
 * A wall re-arms (the next touch counts as touch #n+1) only after a close
 * outside the approach zone on the wall's own side. After a break the wall is
 * "beyond" until price closes back on its side (reclaim), then re-arms the same way.
 *
 * The call wall is the exact mirror of the put wall (prices negated), so the
 * two sides can never drift apart.
 */
import { atr5Series, type MinuteBar } from './zero-dte-sniper-core';

export type WallKind = 'put' | 'call';
export type WallEventKind = 'approach' | 'touch' | 'rejection' | 'break' | 'stall';
export type WallState = 'away' | 'approaching' | 'touched' | 'rejected' | 'broken' | 'stalled' | 'beyond';

export const WALL_CFG = {
  APPROACH_MIN_PCT: 0.0015,
  APPROACH_ATR5: 0.5,
  TOL_MIN_PCT: 0.0005,
  TOL_ATR5: 0.1,
  REJECT_ATR5: 0.25,
  REJECT_MAX_BARS: 5,
  /** Until two completed 5-min buckets exist, ATR5 ≈ 0.1% of price (keeps the first minutes usable). */
  ATR_FALLBACK_PCT: 0.001,
  /** Regular session minute window (09:30 → 15:59 bars). */
  FIRST_MIN: 9 * 60 + 30,
  LAST_MIN: 15 * 60 + 59,
} as const;

export interface WallLevel {
  kind: WallKind;
  price: number;
  /** Events with bar START before this are not emitted (the wall was not known yet). Counting still uses the whole session. */
  sinceMs?: number;
  /** approach/touch events with bar start ≥ this are not emitted (wall superseded); pending resolutions still are. */
  untilMs?: number;
}

export interface WallEvent {
  kind: WallEventKind;
  wall: WallKind;
  wallPrice: number;
  /** Index of the bar (in the input array) whose CLOSE made the event known. */
  idx: number;
  /** Bar START (ms) — the minute in which the touch / close printed. */
  t: number;
  /** Bar CLOSE (ms) = t + 60 s — when the event became known. */
  at: number;
  min: number;
  /** Bar close. */
  price: number;
  /** touch: the bar's low (put) / high (call). Others: the close. */
  extreme: number;
  /** Session touch number this event belongs to (approach: the touch it precedes, i.e. touches so far + 1). */
  touch: number;
  /** Close's distance from the wall as a fraction of price, on the wall's side (+ = put: above, call: below). */
  distPct: number;
  atr5: number;
  tol: number;
  /** rejection / break / stall: bars after the touch bar (0 = the touch bar itself broke). */
  barsAfterTouch?: number;
  /** rejection / break / stall: the touch bar's start (ms) — joins resolution to touch. */
  touchT?: number;
}

export interface WallStatus {
  wall: WallKind;
  wallPrice: number;
  state: WallState;
  /** Last close's distance from the wall (fraction of price), + = on the wall's side. */
  distPct: number | null;
  /** Session touches so far (from the first bar, including ones before the wall was known). */
  touches: number;
  lastEvent: WallEvent | null;
  /** True while inside the approach zone (and not touching). */
  inZone: boolean;
  approachPct: number | null;
  tolAbs: number | null;
}

export function thresholds(price: number, atr5: number | null): { atr: number; tol: number; approach: number; reject: number } {
  const p = Math.abs(price);
  const atr = atr5 != null && atr5 > 0 ? atr5 : p * WALL_CFG.ATR_FALLBACK_PCT;
  return {
    atr,
    tol: Math.max(p * WALL_CFG.TOL_MIN_PCT, WALL_CFG.TOL_ATR5 * atr),
    approach: Math.max(p * WALL_CFG.APPROACH_MIN_PCT, WALL_CFG.APPROACH_ATR5 * atr),
    reject: WALL_CFG.REJECT_ATR5 * atr,
  };
}

/** Out of the zone again: the last interaction (rejected / stalled) stays the state until the next approach. */
const keep = (s: WallState): WallState => (s === 'rejected' || s === 'stalled' ? s : 'away');

const mirror = (b: MinuteBar): MinuteBar => ({ t: b.t, min: b.min, o: -b.o, h: -b.l, l: -b.h, c: -b.c, v: b.v });

/**
 * Run the state machine for ONE wall over the session's bars. Pure and causal.
 * `atr` is atr5Series(bars) of the ORIGINAL bars (pass it to avoid recomputing per wall).
 */
export function detectWall(bars: MinuteBar[], wall: WallLevel, atr: Array<number | null> = atr5Series(bars)): { events: WallEvent[]; status: WallStatus } {
  const sgn = wall.kind === 'put' ? 1 : -1;
  const W = sgn * wall.price;
  const xs = wall.kind === 'put' ? bars : bars.map(mirror);
  const events: WallEvent[] = [];
  let touches = 0;
  let armed = true;
  let approached = false;
  let position: 'above' | 'below' | null = null;
  let pending: { idx: number; t: number; n: number } | null = null;
  let state: WallState = 'away';
  let lastEvent: WallEvent | null = null;
  let last: { dist: number; inZone: boolean; approach: number; tol: number } | null = null;
  // An event that had to wait for this resolution (touch emitted) — resolutions are emitted only for emitted touches.
  const emittedTouch = new Set<number>();

  const emit = (kind: WallEventKind, i: number, extreme: number, n: number, th: ReturnType<typeof thresholds>, extra: Partial<WallEvent> = {}) => {
    const b = bars[i];
    const ev: WallEvent = {
      kind, wall: wall.kind, wallPrice: wall.price, idx: i, t: b.t, at: b.t + 60_000, min: b.min,
      price: b.c, extreme: sgn * extreme, touch: n,
      distPct: (xs[i].c - W) / Math.abs(xs[i].c), atr5: th.atr, tol: th.tol, ...extra,
    };
    lastEvent = ev;
    const known = wall.sinceMs == null || b.t >= wall.sinceMs;
    const live = wall.untilMs == null || b.t < wall.untilMs;
    if (kind === 'approach' || kind === 'touch') {
      if (known && live && b.min >= WALL_CFG.FIRST_MIN && b.min <= WALL_CFG.LAST_MIN) {
        events.push(ev);
        if (kind === 'touch') emittedTouch.add(ev.t);
      }
    } else if (ev.touchT != null && emittedTouch.has(ev.touchT)) {
      events.push(ev);
    }
  };

  for (let i = 0; i < xs.length; i++) {
    const b = xs[i];
    const th = thresholds(W, atr[i] ?? null);
    if (position == null) position = b.o < W - th.tol ? 'below' : 'above';
    const dist = b.c - W;
    last = { dist, inZone: false, approach: th.approach, tol: th.tol };

    if (pending) {
      const k = i - pending.idx;
      if (b.c < W - th.tol) {
        touches = Math.max(touches, pending.n);
        emit('break', i, b.c, pending.n, th, { barsAfterTouch: k, touchT: pending.t });
        pending = null; position = 'below'; armed = false; approached = false; state = 'broken';
        continue;
      }
      if (b.c >= W + th.reject) {
        emit('rejection', i, b.c, pending.n, th, { barsAfterTouch: k, touchT: pending.t });
        pending = null; armed = false; approached = false; state = 'rejected';
        if (dist > th.approach) armed = true;
        continue;
      }
      if (k >= WALL_CFG.REJECT_MAX_BARS) {
        emit('stall', i, b.c, pending.n, th, { barsAfterTouch: k, touchT: pending.t });
        pending = null; armed = false; approached = false; state = 'stalled';
      }
      continue;
    }

    if (position === 'below') {
      if (b.c > W + th.tol) { position = 'above'; armed = dist > th.approach; approached = false; state = armed ? 'away' : 'approaching'; }
      else state = state === 'broken' ? 'broken' : 'beyond';
      continue;
    }

    if (!armed) {
      if (dist > th.approach) { armed = true; approached = false; state = keep(state); }
      else last.inZone = dist > th.tol;
      continue;
    }

    if (b.l <= W + th.tol) {
      touches++;
      emit('touch', i, b.l, touches, th);
      state = 'touched';
      if (b.c < W - th.tol) {
        emit('break', i, b.c, touches, th, { barsAfterTouch: 0, touchT: b.t });
        position = 'below'; armed = false; approached = false; state = 'broken';
      } else {
        pending = { idx: i, t: b.t, n: touches };
      }
      continue;
    }

    if (dist <= th.approach) {
      last.inZone = true;
      if (!approached) { approached = true; emit('approach', i, b.c, touches + 1, th); }
      state = 'approaching';
    } else {
      approached = false;
      state = keep(state);
    }
  }

  const lastBar = xs[xs.length - 1];
  return {
    events,
    status: {
      wall: wall.kind, wallPrice: wall.price, state, touches, lastEvent,
      distPct: lastBar ? (lastBar.c - W) / Math.abs(lastBar.c) : null,
      inZone: !!last?.inZone,
      approachPct: last && lastBar ? last.approach / Math.abs(lastBar.c) : null,
      tolAbs: last ? last.tol : null,
    },
  };
}

/** Every wall of one symbol over the session's bars. */
export function detectWalls(bars: MinuteBar[], walls: WallLevel[]): { events: WallEvent[]; statuses: WallStatus[] } {
  if (!bars.length || !walls.length) return { events: [], statuses: [] };
  const atr = atr5Series(bars);
  const events: WallEvent[] = []; const statuses: WallStatus[] = [];
  for (const w of walls) {
    if (!(w.price > 0)) continue;
    const r = detectWall(bars, w, atr);
    events.push(...r.events); statuses.push(r.status);
  }
  events.sort((a, b) => a.t - b.t || rank(a.kind) - rank(b.kind));
  return { events, statuses };
}
const rank = (k: WallEventKind) => (k === 'approach' ? 0 : k === 'touch' ? 1 : 2);

// ─── trade side + contract type ──────────────────────────────────────────

/** Rejection trades away from the wall, a break trades through it. */
export function tradeSideFor(wall: WallKind, resolution: 'rejection' | 'break'): 'long' | 'short' {
  if (resolution === 'rejection') return wall === 'put' ? 'long' : 'short';
  return wall === 'put' ? 'short' : 'long';
}
export const optionTypeFor = (side: 'long' | 'short'): 'call' | 'put' => (side === 'long' ? 'call' : 'put');

// ─── outcomes ────────────────────────────────────────────────────────────

export const OUTCOME_HORIZONS = [15, 30, 60] as const;

export interface HorizonMark { at: number; price: number; tradePct: number; fromWallPct: number }
export interface UnderlyingOutcome {
  entry: number;
  entryAt: number;
  side: 'long' | 'short';
  h15: HorizonMark | null; h30: HorizonMark | null; h60: HorizonMark | null; close: HorizonMark | null;
  /** Max favourable / adverse excursion from the entry (%, trade side) over the bars available to the close. */
  mfePct: number | null; maePct: number | null;
  /** True when the session's 15:59 bar is in the data (the close mark is final). */
  complete: boolean;
}

const pct = (a: number, b: number) => ((a - b) / b) * 100;

/**
 * Underlying outcome measured from `entry` (the close of the bar ending at
 * `entryAt`) on the session's bars. `wall`/`kind` give the "from the wall"
 * reading: + = on the wall's own side (put: above, call: below).
 */
export function underlyingOutcome(bars: readonly MinuteBar[], entryAt: number, entry: number, wallPrice: number, kind: WallKind, side: 'long' | 'short'): UnderlyingOutcome {
  const s = side === 'long' ? 1 : -1;
  const ws = kind === 'put' ? 1 : -1;
  const after = bars.filter((b) => b.t >= entryAt);
  const mark = (b: MinuteBar | undefined): HorizonMark | null => (b ? { at: b.t + 60_000, price: b.c, tradePct: +(s * pct(b.c, entry)).toFixed(4), fromWallPct: +(ws * pct(b.c, wallPrice)).toFixed(4) } : null);
  const atH = (mins: number) => {
    const target = entryAt + mins * 60_000;
    let hit: MinuteBar | undefined;
    for (const b of after) { if (b.t + 60_000 <= target) hit = b; else break; }
    return hit && hit.t + 60_000 >= target - 60_000 ? hit : undefined;
  };
  let mfe: number | null = null; let mae: number | null = null;
  for (const b of after) {
    const fav = s > 0 ? pct(b.h, entry) : -pct(b.l, entry);
    const adv = s > 0 ? pct(b.l, entry) : -pct(b.h, entry);
    mfe = mfe == null ? fav : Math.max(mfe, fav);
    mae = mae == null ? adv : Math.min(mae, adv);
  }
  const lastBar = bars[bars.length - 1];
  const complete = !!lastBar && lastBar.min >= WALL_CFG.LAST_MIN;
  return {
    entry, entryAt, side,
    h15: mark(atH(15)), h30: mark(atH(30)), h60: mark(atH(60)),
    close: complete ? mark(lastBar) : null,
    mfePct: mfe != null ? +mfe.toFixed(4) : null, maePct: mae != null ? +mae.toFixed(4) : null,
    complete,
  };
}

export interface OptMinute { t: number; o: number; h: number; l: number; c: number; v: number }
export interface OptionPathOutcome {
  /** Fill used: the live ask when logged (live), else the next minute bar's high (replay convention). */
  entry: number;
  entryBasis: string;
  h15: number | null; h30: number | null; h60: number | null; close: number | null;
  /** Multiples of the entry (price ÷ entry). */
  mult15: number | null; mult30: number | null; mult60: number | null; multClose: number | null;
  maxMult: number | null;
  minsTo2x: number | null;
  bars: number;
}

/** The option's price path after `entryAt` from its 1-minute bars. */
export function optionPathOutcome(entry: number, entryBasis: string, optBars: readonly OptMinute[], entryAt: number, closeAt: number | null): OptionPathOutcome {
  const after = optBars.filter((b) => b.t >= entryAt - 60_000 && (closeAt == null || b.t < closeAt)).sort((a, b) => a.t - b.t);
  const at = (mins: number) => {
    const target = entryAt + mins * 60_000;
    let hit: OptMinute | undefined;
    for (const b of after) { if (b.t + 60_000 <= target) hit = b; else break; }
    return hit ? hit.c : null;
  };
  let maxH: number | null = null; let to2x: number | null = null;
  for (const b of after) {
    if (b.t + 60_000 <= entryAt) continue;
    maxH = maxH == null ? b.h : Math.max(maxH, b.h);
    if (to2x == null && entry > 0 && b.h >= 2 * entry) to2x = Math.max(0, Math.round((b.t + 60_000 - entryAt) / 60_000));
  }
  const m = (x: number | null) => (x != null && entry > 0 ? +(x / entry).toFixed(3) : null);
  const h15 = at(15), h30 = at(30), h60 = at(60);
  const lastC = closeAt != null && after.length ? after[after.length - 1].c : null;
  return {
    entry, entryBasis, h15, h30, h60, close: lastC,
    mult15: m(h15), mult30: m(h30), mult60: m(h60), multClose: m(lastC),
    maxMult: m(maxH), minsTo2x: to2x, bars: after.length,
  };
}

// ─── forward-log summary ─────────────────────────────────────────────────

export interface WallRecord {
  id: string;
  dateKey: string;
  symbol: string;
  wall: WallKind;
  wallPrice: number;
  wallBasis: string;
  touch: number;
  touchAt: string;
  resolution: 'rejection' | 'break' | 'stall' | 'open';
  rvol: number | null;
  underlying: UnderlyingOutcome | null;
  option: (OptionPathOutcome & { occ: string; label: string }) | null;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r3 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(3));

export interface WallSummaryCell {
  n: number;
  resolved: number;
  rejections: number; breaks: number; stalls: number;
  /** rejections ÷ (rejections + breaks + stalls). */
  rejectionRate: number | null;
  breakRate: number | null;
  /** Trade-side means (%), measured from the resolution bar's close. */
  avgMfePct: number | null; avgMaePct: number | null;
  avgTrade30Pct: number | null; avgTradeClosePct: number | null;
  /** % of resolved touches whose +30-min mark is in the trade's favour. */
  win30Pct: number | null;
  options: number;
  avgOptMaxMult: number | null;
  avgOptMultClose: number | null;
  optHit2xPct: number | null;
}

export function summarizeCell(rs: WallRecord[]): WallSummaryCell {
  const rej = rs.filter((r) => r.resolution === 'rejection');
  const brk = rs.filter((r) => r.resolution === 'break');
  const stl = rs.filter((r) => r.resolution === 'stall');
  const resolved = rej.length + brk.length + stl.length;
  const traded = [...rej, ...brk].filter((r) => r.underlying);
  const u = (f: (o: UnderlyingOutcome) => number | null | undefined) => traded.map((r) => f(r.underlying!)).filter((x): x is number => x != null && Number.isFinite(x));
  const opts = rs.filter((r) => r.option && r.option.maxMult != null);
  const w30 = u((o) => o.h30?.tradePct);
  return {
    n: rs.length, resolved,
    rejections: rej.length, breaks: brk.length, stalls: stl.length,
    rejectionRate: resolved ? r3(rej.length / resolved) : null,
    breakRate: resolved ? r3(brk.length / resolved) : null,
    avgMfePct: r3(mean(u((o) => o.mfePct))), avgMaePct: r3(mean(u((o) => o.maePct))),
    avgTrade30Pct: r3(mean(w30)), avgTradeClosePct: r3(mean(u((o) => o.close?.tradePct))),
    win30Pct: w30.length ? r3((w30.filter((x) => x > 0).length / w30.length) * 100) : null,
    options: opts.length,
    avgOptMaxMult: r3(mean(opts.map((r) => r.option!.maxMult!))),
    avgOptMultClose: r3(mean(opts.map((r) => r.option!.multClose).filter((x): x is number => x != null))),
    optHit2xPct: opts.length ? r3((opts.filter((r) => (r.option!.maxMult ?? 0) >= 2).length / opts.length) * 100) : null,
  };
}

export const touchBucket = (n: number) => (n >= 4 ? '4+' : String(n));

export function summarizeWallLog(rs: WallRecord[]) {
  const by = <K extends string>(f: (r: WallRecord) => K) => {
    const m = new Map<K, WallRecord[]>();
    for (const r of rs) { const k = f(r); const a = m.get(k) ?? []; a.push(r); m.set(k, a); }
    return Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, summarizeCell(v)]));
  };
  const sessions = new Set(rs.map((r) => r.dateKey));
  return {
    label: 'measuring' as const,
    sessions: sessions.size,
    first: [...sessions].sort()[0] ?? null,
    last: [...sessions].sort().slice(-1)[0] ?? null,
    all: summarizeCell(rs),
    byWall: by((r) => r.wall),
    byTouch: by((r) => touchBucket(r.touch)),
    byWallTouch: by((r) => `${r.wall} wall · touch ${touchBucket(r.touch)}`),
    byResolution: by((r) => r.resolution),
    byRvol: by((r) => (r.rvol == null ? 'rvol unknown' : r.rvol >= 1.5 ? 'rvol ≥ 1.5' : 'rvol < 1.5')),
    byBasis: by((r) => (/next7|≤7d/.test(r.wallBasis) ? 'next-7-day book' : 'all-expiry fallback')),
  };
}

// ─── text ────────────────────────────────────────────────────────────────

export const fmtLevel = (x: number) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(2));
export const fmtPctAbs = (f: number) => `${(Math.abs(f) * 100).toFixed(Math.abs(f) < 0.001 ? 2 : 1)}%`;

/** "AMD approaching put wall 600 (0.3% away)" etc. — plain line for a wall's current status. */
export function statusLine(symbol: string, s: WallStatus): string {
  const w = `${s.wall} wall ${fmtLevel(s.wallPrice)}`;
  const tch = s.touches ? ` · touched ${s.touches}×` : '';
  if (s.distPct == null) return `${symbol} ${w} — no bars yet`;
  const away = fmtPctAbs(s.distPct);
  const rel = s.wall === 'put' ? (s.distPct >= 0 ? 'above' : 'below') : (s.distPct >= 0 ? 'below' : 'above');
  switch (s.state) {
    case 'approaching': return `${symbol} approaching ${w} (${away} away)${tch}`;
    case 'touched': return `${symbol} touching ${w} — waiting for rejection or break${tch}`;
    case 'broken': case 'beyond': return `${symbol} ${away} ${rel} ${w} — broken${tch}`;
    default: return `${symbol} price ${away} ${rel} ${w}${tch}`;
  }
}
