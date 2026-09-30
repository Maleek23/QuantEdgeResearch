/**
 * 0DTE SNIPER — pure core (no I/O). One definition of every classic intraday
 * setup, shared by the replay (research/zero-dte-setups-replay.ts), the live
 * two-stage engine (server/zero-dte-sniper.ts) and the tests
 * (scripts/test-zero-dte-sniper.ts), so what was measured is what runs.
 *
 * Bars are REGULAR-SESSION 1-minute bars in time order, each stamped with its
 * ET minute-of-day (`min`, 09:30 = 570). Every detector is CAUSAL: whether bar
 * i triggers depends only on bars 0..i (plus the prior-day context), so running
 * it on a full historical day gives the same trigger a live pass would have
 * seen at that minute. Each setup fires at most once per side per session (the
 * first occurrence) — except reactive_zone, which fires on EVERY holding
 * touch of a zone after its first clean reaction (touch number stamped).
 *
 * Short setups are the exact mirror of the long ones: prices are negated (high
 * and low swap) and the long detector runs on the mirror, so the two sides can
 * never drift apart.
 */

export interface MinuteBar { t: number; o: number; h: number; l: number; c: number; v: number; vw?: number; min: number }
export type Side = 'long' | 'short';
export type SetupId =
  | 'orb15' | 'orb30' | 'vwap_cross' | 'level_reclaim' | 'pd_break_hold'
  | 'failed_breakout' | 'power_hour' | 'flush_reclaim'
  | 'liquidity_sweep' | 'double_sweep' | 'reactive_zone';

export const SETUP_IDS: SetupId[] = [
  'orb15', 'orb30', 'vwap_cross', 'level_reclaim', 'pd_break_hold', 'failed_breakout', 'power_hour', 'flush_reclaim',
  'liquidity_sweep', 'double_sweep', 'reactive_zone',
];

export const SETUP_LABEL: Record<SetupId, string> = {
  orb15: 'ORB 15-min break',
  orb30: 'ORB 30-min break',
  vwap_cross: 'VWAP reclaim / loss',
  level_reclaim: 'Level hold → VWAP reclaim',
  pd_break_hold: 'Prior-day high/low break & hold',
  failed_breakout: 'Failed breakout fade',
  power_hour: 'Power-hour continuation',
  flush_reclaim: 'Opening flush → reclaim',
  liquidity_sweep: 'Liquidity sweep → reclaim',
  double_sweep: 'Double sweep (second side)',
  reactive_zone: 'Reactive zone, repeat touch',
};

/** Zone source classes for reactive_zone (reported separately). GEX zones exist only live. */
export type ZoneKind = 'prior_day' | 'premarket' | 'round' | 'session_pivot' | 'gex';
export interface ExternalZone { price: number; source: string }

export interface DayContext {
  /** Prior regular-session high / low / close. */
  pdh: number; pdl: number; pdc: number;
  /** Pre-market (04:00–09:29 ET) low / high — needed only by flush_reclaim. */
  preLow?: number | null; preHigh?: number | null;
  /** 20-session average daily range — needed only by flush_reclaim. */
  atr20?: number | null;
}

export interface SetupTrigger {
  setup: SetupId;
  side: Side;
  /** Index into the bars array of the bar whose CLOSE fired the trigger. */
  idx: number;
  min: number;
  /** Bar START time (ms). The trigger is known at the bar's close, t + 60 s. */
  t: number;
  /** Underlying close of the trigger bar. */
  price: number;
  /** The level the setup was about (range edge, VWAP, PDH…), real price. */
  level: number;
  levelName: string;
  note: string;
  /** reactive_zone only: which touch of the zone this is (2 = first tradeable). */
  touch?: number;
  /** reactive_zone only: the zone's source class. */
  zoneKind?: ZoneKind;
}

export interface DetectOptions {
  /** Round-number step for reactive zones (SPY $1, singles $5/$10). Default by price. */
  zoneRoundStep?: number;
  /** Extra live zones (GEX levels from the chart recorder) — real prices. */
  zones?: ExternalZone[];
}

export const SNIPER_CFG = {
  FIRST_MIN: 9 * 60 + 35,      // no trigger on the first 5 bars
  LAST_MIN: 15 * 60 + 30,      // no trigger after 15:30 ET (too little time for the option)
  VWAP_FROM: 10 * 60,          // VWAP / level setups only after the first 30 minutes
  VWAP_LOOKBACK: 15,           // a VWAP cross needs ≥ VWAP_BELOW_MIN of the prior 15 closes on the other side
  VWAP_BELOW_MIN: 10,
  PIVOT_SPAN: 5,               // swing low = lowest low of ±5 bars (confirmed 5 bars later)
  TEST_GAP_BARS: 15,           // two tests of a level at least 15 minutes apart
  LEVEL_TOL_PCT: 0.0015,       // "same level" tolerance: 0.15% of price
  PD_HOLD_BARS: 5,             // break & hold = 5 consecutive closes beyond the level
  FAIL_WITHIN_BARS: 15,        // failed breakout must close back inside within 15 bars
  PH_FROM: 15 * 60, PH_TO: 15 * 60 + 30,
  FLUSH_END: 10 * 60 + 15, FLUSH_TRIGGER_END: 11 * 60 + 30, FLUSH_ATR: 0.5,
  // Liquidity sweep: trade through a liquidity level by ≥ 0.05% but ≤ 0.5 × ATR(5-min), close back inside within 3 bars.
  SWEEP_MIN_PCT: 0.0005, SWEEP_MAX_ATR5: 0.5, SWEEP_RECLAIM_BARS: 3,
  EQUAL_TOL_PCT: 0.001,        // equal highs / lows: two swing points within 0.1%
  EQUAL_SPAN: 3,               // swing point = extreme of ±3 bars
  // Reactive zone: touch = within 0.05%; a clean reaction = a move away ≥ 1 × ATR(5-min);
  // a touch holds on a 1-min close back on the right side within 3 bars; a close through by > 0.05% breaks the zone.
  ZONE_TOL_PCT: 0.0005, ZONE_REACTION_ATR5: 1, ZONE_HOLD_BARS: 3,
} as const;

// ─── helpers ────────────────────────────────────────────────────────────────

/** Cumulative session VWAP after each bar. */
export function vwapSeries(bars: MinuteBar[]): number[] {
  const out: number[] = new Array(bars.length);
  let pv = 0, vv = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const p = b.vw != null && b.vw !== 0 ? b.vw : (b.h + b.l + b.c) / 3;
    pv += p * b.v; vv += b.v;
    out[i] = vv > 0 ? pv / vv : b.c;
  }
  return out;
}

export function roundStep(price: number): number {
  const p = Math.abs(price);
  return p < 25 ? 1 : p < 100 ? 5 : p < 250 ? 10 : p < 1000 ? 25 : 50;
}

/** Round-number step for reactive zones: index ETFs $1 (SPY as the SPX proxy), singles $5 under $200, else $10. */
export function zoneRoundStep(symbol: string, price: number): number {
  if (['SPY', 'QQQ', 'IWM', 'DIA'].includes(symbol.toUpperCase())) return 1;
  if (symbol.toUpperCase() === 'SPX') return 25;
  const p = Math.abs(price);
  return p < 50 ? 1 : p < 200 ? 5 : 10;
}

/**
 * ATR of 5-minute bars as of each 1-minute bar: mean high−low of the last (up
 * to) 12 COMPLETED 5-minute buckets of the session; null until 2 exist.
 */
export function atr5Series(bars: MinuteBar[]): Array<number | null> {
  const out: Array<number | null> = new Array(bars.length);
  const done: number[] = [];
  let key = -1, hi = -Infinity, lo = Infinity;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const k = Math.floor((b.min - 570) / 5);
    if (k !== key) {
      if (key >= 0 && Number.isFinite(hi)) done.push(hi - lo);
      key = k; hi = -Infinity; lo = Infinity;
    }
    hi = Math.max(hi, b.h); lo = Math.min(lo, b.l);
    const last = done.slice(-12);
    out[i] = last.length >= 2 ? last.reduce((a, x) => a + x, 0) / last.length : null;
  }
  return out;
}

function mirrorBars(bars: MinuteBar[]): MinuteBar[] {
  return bars.map((b) => ({ t: b.t, min: b.min, o: -b.o, h: -b.l, l: -b.h, c: -b.c, v: b.v, vw: b.vw != null ? -b.vw : undefined }));
}
function mirrorCtx(c: DayContext): DayContext {
  return {
    pdh: -c.pdl, pdl: -c.pdh, pdc: -c.pdc,
    preLow: c.preHigh != null ? -c.preHigh : null, preHigh: c.preLow != null ? -c.preLow : null,
    atr20: c.atr20 ?? null,
  };
}

type Found = { idx: number; level: number; levelName: string; note: string; touch?: number; zoneKind?: ZoneKind };
/** Per-pass extras: 5-min ATR series, reactive-zone round step, and external zones (already mirrored for the short pass). */
interface Aux { atr5: Array<number | null>; zoneStep: number; zones: ExternalZone[] }
/** Side-aware vocabulary so a mirrored (short) pass writes its notes in plain words. */
interface Words { above: string; below: string; high: string; low: string; H: string; L: string; reclaims: string; higherLow: string; flushed: string; pdh: string; pdl: string }
const LONG_W: Words = { above: 'above', below: 'below', high: 'high', low: 'low', H: 'H', L: 'L', reclaims: 'reclaims', higherLow: 'higher low', flushed: 'flushed', pdh: 'prior-day high', pdl: 'prior-day low' };
const SHORT_W: Words = { above: 'below', below: 'above', high: 'low', low: 'high', H: 'L', L: 'H', reclaims: 'loses', higherLow: 'lower high', flushed: 'squeezed', pdh: 'prior-day low', pdl: 'prior-day high' };
type LongDetector = (bars: MinuteBar[], vwap: number[], ctx: DayContext, w: Words, aux: Aux) => Found | Found[] | null;

const inWindow = (b: MinuteBar, from: number = SNIPER_CFG.FIRST_MIN, to: number = SNIPER_CFG.LAST_MIN) => b.min >= from && b.min <= to;

// ─── long-side detectors (short = mirror) ──────────────────────────────────

function orb(minutes: number): LongDetector {
  return (bars, _v, _c, w) => {
    const end = 570 + minutes;
    const range = bars.filter((b) => b.min < end);
    if (range.length < minutes * 0.8) return null;
    const orh = Math.max(...range.map((b) => b.h));
    for (let i = range.length; i < bars.length; i++) {
      const b = bars[i];
      if (b.min < end || !inWindow(b)) continue;
      if (b.c > orh) return { idx: i, level: orh, levelName: `OR${minutes}${w.H}`, note: `close ${px(b.c)} ${w.above} the ${minutes}-min range ${w.high} ${px(orh)}` };
    }
    return null;
  };
}

const vwapCross: LongDetector = (bars, vwap, _c, w) => {
  const K = SNIPER_CFG.VWAP_LOOKBACK;
  for (let i = K; i < bars.length; i++) {
    const b = bars[i];
    if (!inWindow(b, SNIPER_CFG.VWAP_FROM)) continue;
    if (!(b.c > vwap[i] && bars[i - 1].c <= vwap[i - 1])) continue;
    let below = 0;
    for (let k = i - K; k < i; k++) if (bars[k].c < vwap[k]) below++;
    if (below >= SNIPER_CFG.VWAP_BELOW_MIN) return { idx: i, level: vwap[i], levelName: 'VWAP', note: `close ${px(b.c)} ${w.reclaims} VWAP ${px(vwap[i])} after ${below}/${K} closes ${w.below}` };
  }
  return null;
};

/** Which named level (if any) a support price sits on. Works on mirrored prices too. */
function namedLevel(L: number, tol: number, ctx: DayContext, sessionLow: number, w: Words): string | null {
  if (Math.abs(L - ctx.pdl) <= tol) return w.pdl;
  if (Math.abs(L - ctx.pdh) <= tol) return w.pdh;
  if (Math.abs(L - ctx.pdc) <= tol) return 'prior close';
  const step = roundStep(L);
  if (Math.abs(L - Math.round(L / step) * step) <= tol) return `round ${Math.abs(Math.round(L / step) * step)}`;
  if (L - sessionLow <= tol) return `session ${w.low}`;
  return null;
}

/**
 * Level hold → VWAP reclaim (the AMD 2026-09-30 pattern): two swing lows ≥ 15
 * min apart within 0.15% of each other, both closing under VWAP, no close
 * through the level between them, the level a named one (prior-day H/L/C,
 * round number or the session low); then the first close back above VWAP while
 * the level holds (a close through the level disarms it).
 */
const levelReclaim: LongDetector = (bars, vwap, ctx, w) => {
  const S = SNIPER_CFG.PIVOT_SPAN;
  const pivots: number[] = [];
  let armed: { L: number; name: string; p1: number; p2: number; belowSeen: boolean } | null = null;
  const lowUpTo: number[] = [];
  let sessionLow = Infinity;
  for (let i = 0; i < bars.length; i++) { sessionLow = Math.min(sessionLow, bars[i].l); lowUpTo[i] = sessionLow; }
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const j = i - S; // pivot j is confirmed at bar i
    if (j >= S) {
      let isPivot = true;
      for (let k = j - S; k <= j + S; k++) if (k !== j && bars[k].l < bars[j].l) { isPivot = false; break; }
      if (isPivot && bars[j].c < vwap[j]) {
        const tol = Math.max(Math.abs(bars[j].l) * SNIPER_CFG.LEVEL_TOL_PCT, 0.02);
        for (let q = pivots.length - 1; q >= 0; q--) {
          const p1 = pivots[q];
          if (j - p1 < SNIPER_CFG.TEST_GAP_BARS) continue;
          if (Math.abs(bars[p1].l - bars[j].l) > tol) continue;
          const L = Math.min(bars[p1].l, bars[j].l);
          let undercut = false;
          for (let k = p1; k <= j; k++) if (bars[k].c < L - tol) { undercut = true; break; }
          if (undercut) continue;
          const name = namedLevel(L, tol, ctx, lowUpTo[j], w);
          if (!name) continue;
          armed = { L, name, p1, p2: j, belowSeen: false };
          break;
        }
        pivots.push(j);
      }
    }
    if (armed) {
      const tol = Math.max(Math.abs(armed.L) * SNIPER_CFG.LEVEL_TOL_PCT, 0.02);
      if (b.c < armed.L - tol) { armed = null; continue; }
      if (b.c <= vwap[i]) armed.belowSeen = true;
      else if (armed.belowSeen && inWindow(b, SNIPER_CFG.VWAP_FROM)) {
        return { idx: i, level: armed.L, levelName: armed.name, note: `held ${armed.name} ${px(armed.L)} twice (${hhmm(bars[armed.p1].min)}, ${hhmm(bars[armed.p2].min)}), close ${px(b.c)} ${w.reclaims} VWAP ${px(vwap[i])}` };
      }
    }
  }
  return null;
};

const pdBreakHold: LongDetector = (bars, _v, ctx, w) => {
  if (!bars.length || !(bars[0].o < ctx.pdh)) return null; // a gap over the level is not a break
  const N = SNIPER_CFG.PD_HOLD_BARS;
  let run = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    run = b.c > ctx.pdh ? run + 1 : 0;
    if (run >= N) {
      if (inWindow(b)) return { idx: i, level: ctx.pdh, levelName: w.pdh, note: `${N} straight closes ${w.above} the ${w.pdh} ${px(ctx.pdh)}` };
      return null; // the first hold happened outside the trigger window
    }
  }
  return null;
};

/** Long side = failed BREAKDOWN of the prior-day low or the 30-min range low, faded back up. */
const failedBreakout: LongDetector = (bars, _v, ctx, w) => {
  const levels: Array<{ L: number; name: string; from: number }> = [];
  if (bars.length && bars[0].o > ctx.pdl) levels.push({ L: ctx.pdl, name: w.pdl, from: SNIPER_CFG.FIRST_MIN });
  const range = bars.filter((b) => b.min < 600);
  if (range.length >= 24) levels.push({ L: Math.min(...range.map((b) => b.l)), name: `OR30${w.L}`, from: 600 });
  let best: Found | null = null;
  for (const lv of levels) {
    // inside → broken (a close through) → trigger on a close back inside within N bars.
    // A break that lasts longer than N bars is real: it must be reclaimed and broken afresh.
    let state: 'inside' | 'broken' | 'lost' = 'inside';
    let brokeAt = -1;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (b.min < lv.from) continue;
      if (state === 'inside') { if (b.c < lv.L) { state = 'broken'; brokeAt = i; } continue; }
      if (state === 'lost') { if (b.c > lv.L) state = 'inside'; continue; }
      if (i - brokeAt > SNIPER_CFG.FAIL_WITHIN_BARS) { state = b.c > lv.L ? 'inside' : 'lost'; continue; }
      if (b.c > lv.L) {
        if (inWindow(b)) {
          if (!best || i < best.idx) best = { idx: i, level: lv.L, levelName: lv.name, note: `broke ${lv.name} ${px(lv.L)} at ${hhmm(bars[brokeAt].min)}, closed back inside at ${px(b.c)}` };
          break;
        }
        state = 'inside';
      }
    }
  }
  return best;
};

const powerHour: LongDetector = (bars, vwap, _c, w) => {
  for (let i = 45; i < bars.length; i++) {
    const b = bars[i];
    if (b.min < SNIPER_CFG.PH_FROM || b.min > SNIPER_CFG.PH_TO) continue;
    if (!(b.c > vwap[i])) continue;
    let hi10 = -Infinity; for (let k = i - 10; k < i; k++) hi10 = Math.max(hi10, bars[k].h);
    if (!(b.c > hi10)) continue;
    let lowRecent = Infinity, lowPrior = Infinity;
    for (let k = i - 14; k <= i; k++) lowRecent = Math.min(lowRecent, bars[k].l);
    for (let k = i - 44; k < i - 14; k++) lowPrior = Math.min(lowPrior, bars[k].l);
    if (lowRecent > lowPrior) return { idx: i, level: vwap[i], levelName: 'VWAP', note: `power hour: close ${px(b.c)} ${w.above} the 10-bar ${w.high} ${px(hi10)} and VWAP ${px(vwap[i])}, ${w.higherLow} ${px(lowRecent)} vs ${px(lowPrior)}` };
  }
  return null;
};

/** Opening flush below pre-market low AND prior close by ≥ 0.5×ATR20, then a close back above the prior close. */
const flushReclaim: LongDetector = (bars, _v, ctx, w) => {
  if (ctx.preLow == null || !ctx.atr20) return null;
  const level = Math.min(ctx.preLow, ctx.pdc);
  let fi = -1, hiBefore = -Infinity, runHi = -Infinity;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (b.min > SNIPER_CFG.FLUSH_TRIGGER_END) break;
    if (b.min < SNIPER_CFG.FLUSH_END) {
      runHi = Math.max(runHi, b.h);
      if (fi < 0 || b.l < bars[fi].l) { fi = i; hiBefore = runHi; }
    }
    if (fi < 0 || i <= fi) continue;
    const flushLow = bars[fi].l;
    if (!(flushLow < level) || hiBefore - flushLow < SNIPER_CFG.FLUSH_ATR * ctx.atr20) continue;
    if (b.c > ctx.pdc && inWindow(b)) return { idx: i, level: ctx.pdc, levelName: 'prior close', note: `${w.flushed} to ${px(flushLow)} at ${hhmm(bars[fi].min)} (through the pre-market ${w.low} and prior close), close ${px(b.c)} ${w.reclaims} the prior close ${px(ctx.pdc)}` };
  }
  return null;
};

/** Confirmed swing lows (±span) as of each bar: returns, for bar i, the pivot index confirmed AT i (or -1). */
function pivotLowConfirmedAt(bars: MinuteBar[], span: number): number[] {
  const out = new Array(bars.length).fill(-1);
  for (let i = 0; i < bars.length; i++) {
    const j = i - span;
    if (j < span) continue;
    let ok = true;
    for (let k = j - span; k <= j + span; k++) if (k !== j && bars[k].l < bars[j].l) { ok = false; break; }
    if (ok) out[i] = j;
  }
  return out;
}

/**
 * Liquidity sweep of a LOW (long; the high sweep is the mirror): price trades
 * through a liquidity level — prior-day low, pre-market low, the 15-min
 * opening-range low, or an equal-lows cluster (two swing lows within 0.1%) —
 * by ≥ 0.05% but no more than 0.5 × ATR(5-min), then a 1-minute CLOSE back
 * above the level within 3 bars (the sweep bar counts as bar 1). Distinct from
 * failed_breakout: a sweep is a quick stop-run (≤ 3 bars, capped depth), not a
 * breakdown that fails later. The earliest sweep of the session per side.
 */
const liquiditySweep: LongDetector = (bars, _v, ctx, w, aux) => {
  const C = SNIPER_CFG;
  type Lv = { L: number; name: string; sweep: { start: number; low: number } | null; consumed: boolean };
  const levels: Lv[] = [];
  const add = (L: number | null | undefined, name: string) => {
    if (L == null || !Number.isFinite(L)) return;
    if (levels.some((x) => Math.abs(x.L - L) <= Math.abs(L) * C.SWEEP_MIN_PCT)) return;
    levels.push({ L, name, sweep: null, consumed: false });
  };
  add(ctx.pdl, w.pdl);
  add(ctx.preLow, `pre-market ${w.low}`);
  const piv = pivotLowConfirmedAt(bars, C.EQUAL_SPAN);
  const swings: number[] = [];
  let orDone = false;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    if (!orDone && b.min >= 585) {
      orDone = true;
      const r = bars.filter((x) => x.min < 585);
      if (r.length >= 12) add(Math.min(...r.map((x) => x.l)), `OR15${w.L}`);
    }
    const j = piv[i];
    if (j >= 0) {
      for (const p of swings) {
        if (j - p >= 5 && Math.abs(bars[p].l - bars[j].l) <= Math.abs(bars[j].l) * C.EQUAL_TOL_PCT) { add(Math.min(bars[p].l, bars[j].l), `equal ${w.low}s`); break; }
      }
      swings.push(j);
    }
    const atr = aux.atr5[i];
    for (const lv of levels) {
      if (lv.consumed) continue;
      const tol = Math.abs(lv.L) * C.SWEEP_MIN_PCT;
      if (!lv.sweep) {
        if (bars[i - 1].c > lv.L && b.l < lv.L - tol) lv.sweep = { start: i, low: b.l };
        else continue;
      } else lv.sweep.low = Math.min(lv.sweep.low, b.l);
      const depth = lv.L - lv.sweep.low;
      if (atr == null || depth > C.SWEEP_MAX_ATR5 * atr) { lv.consumed = true; continue; }
      if (b.c > lv.L) {
        if (inWindow(b)) return { idx: i, level: lv.L, levelName: lv.name, note: `swept the ${lv.name} ${px(lv.L)} by ${px(depth)} (≤ ${C.SWEEP_MAX_ATR5}×ATR5 ${px(atr)}), closed back ${w.above} at ${px(b.c)}` };
        lv.consumed = true; continue;
      }
      if (i - lv.sweep.start >= C.SWEEP_RECLAIM_BARS - 1) lv.consumed = true;
    }
  }
  return null;
};

/**
 * Reactive zone, repeat touch (support below price → calls; the resistance
 * case is the mirror → puts). Zones: prior-day H/L/C, pre-market H/L, round
 * numbers (zoneStep), swing lows made today (session low / multi-touch), and
 * external zones (live GEX levels only). A TOUCH is a low within 0.05% of the
 * zone after price was away; the zone is REACTIVE once a touch was followed by
 * a move away ≥ 1 × ATR(5-min). Every later touch (2nd, 3rd, …) that HOLDS — a
 * 1-min close back above the zone within 3 bars, no close through it by >
 * 0.05% — fires, stamped with its touch number. A close through by > 0.05%
 * breaks the zone (its count restarts if price later returns above it).
 */
const reactiveZone: LongDetector = (bars, _v, ctx, w, aux) => {
  const C = SNIPER_CFG;
  // minTouch: the first touch number that trades. Named levels (and the session low) are zones from their
  // first reaction → touch 2 trades; a plain intraday swing low is only a level once touched twice → touch 3.
  type Z = { Z: number; name: string; kind: ZoneKind; touches: number; away: boolean; pending: { start: number; k: number } | null; minTouch: number };
  const zones: Z[] = [];
  const add = (Zp: number | null | undefined, name: string, kind: ZoneKind, touches = 0, away = false, minTouch = 2) => {
    if (Zp == null || !Number.isFinite(Zp)) return;
    if (zones.some((z) => Math.abs(z.Z - Zp) <= Math.abs(Zp) * C.ZONE_TOL_PCT)) return;
    zones.push({ Z: Zp, name, kind, touches, away, pending: null, minTouch });
  };
  add(ctx.pdh, w.pdh, 'prior_day'); add(ctx.pdl, w.pdl, 'prior_day'); add(ctx.pdc, 'prior close', 'prior_day');
  add(ctx.preHigh, `pre-market ${w.high}`, 'premarket'); add(ctx.preLow, `pre-market ${w.low}`, 'premarket');
  for (const z of aux.zones) add(z.price, z.source, 'gex');
  const step = aux.zoneStep;
  const piv = pivotLowConfirmedAt(bars, C.EQUAL_SPAN);
  const out: Found[] = [];
  let sessionLow = Infinity;
  const lowUpTo: number[] = [];
  for (let i = 0; i < bars.length; i++) { sessionLow = Math.min(sessionLow, bars[i].l); lowUpTo[i] = sessionLow; }
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const atr = aux.atr5[i];
    // round numbers around this bar
    if (step > 0) for (let k = Math.floor(b.l / step) - 1; k <= Math.ceil(b.h / step) + 1; k++) add(k * step, `round ${Math.abs(k * step)}`, 'round');
    // a swing low made today is a zone whose first touch is the swing itself
    const j = piv[i];
    if (j >= 0) {
      const Zp = bars[j].l;
      const exists = zones.some((z) => Math.abs(z.Z - Zp) <= Math.abs(Zp) * C.ZONE_TOL_PCT);
      if (!exists) {
        let hi = -Infinity; for (let k = j + 1; k <= i; k++) hi = Math.max(hi, bars[k].h);
        const reacted = atr != null && hi >= Zp + C.ZONE_REACTION_ATR5 * atr;
        const isSessionLow = Zp <= lowUpTo[j] + Math.abs(Zp) * C.ZONE_TOL_PCT;
        add(Zp, isSessionLow ? `session ${w.low}` : `intraday swing ${w.low}`, 'session_pivot', 1, reacted, isSessionLow ? 2 : 3);
      }
    }
    for (const z of zones) {
      const tol = Math.abs(z.Z) * C.ZONE_TOL_PCT;
      const reset = () => { z.touches = 0; z.away = false; z.pending = null; };
      if (z.pending) {
        if (b.c < z.Z - tol) { reset(); continue; }
        if (b.c > z.Z) { out.push(zoneFound(i, z, b, w)); z.pending = null; continue; }
        if (i - z.pending.start >= C.ZONE_HOLD_BARS - 1) z.pending = null;
        continue;
      }
      if (z.touches >= 1 && b.c < z.Z - tol) { reset(); continue; }
      if (z.away && b.l <= z.Z + tol) {
        z.touches++; z.away = false;
        if (z.touches >= z.minTouch && inWindow(b)) {
          if (b.c < z.Z - tol) { reset(); continue; }
          if (b.c > z.Z) out.push(zoneFound(i, z, b, w));
          else z.pending = { start: i, k: z.touches };
        }
        continue;
      }
      if (!z.away) {
        if (z.touches === 0) z.away = b.c > z.Z + tol;
        else z.away = atr != null && b.h >= z.Z + C.ZONE_REACTION_ATR5 * atr;
      }
    }
  }
  // One trade per bar: when several zones hold on the same bar, keep the most-tested one (then the nearest to the close).
  const perBar = new Map<number, Found>();
  for (const f of out) {
    const cur = perBar.get(f.idx);
    if (!cur || (f.touch ?? 0) > (cur.touch ?? 0) || ((f.touch ?? 0) === (cur.touch ?? 0) && Math.abs(bars[f.idx].c - f.level) < Math.abs(bars[f.idx].c - cur.level))) perBar.set(f.idx, f);
  }
  return [...perBar.values()].sort((a, b) => a.idx - b.idx);
};
function zoneFound(i: number, z: { Z: number; name: string; kind: ZoneKind; touches: number }, b: MinuteBar, w: Words): Found {
  return { idx: i, level: z.Z, levelName: z.name, touch: z.touches, zoneKind: z.kind, note: `touch #${z.touches} of the reactive ${z.name} zone ${px(z.Z)} held — close ${px(b.c)} back ${w.above}` };
}

const DETECTORS: Record<Exclude<SetupId, 'double_sweep'>, LongDetector> = {
  orb15: orb(15), orb30: orb(30), vwap_cross: vwapCross, level_reclaim: levelReclaim,
  pd_break_hold: pdBreakHold, failed_breakout: failedBreakout, power_hour: powerHour, flush_reclaim: flushReclaim,
  liquidity_sweep: liquiditySweep, reactive_zone: reactiveZone,
};

/**
 * Every setup × side that has fired by the last bar (first occurrence each;
 * every holding touch for reactive_zone). double_sweep = both sides of the
 * session swept (liquidity_sweep long AND short): the SECOND sweep's reversal.
 */
export function detectSetups(bars: MinuteBar[], ctx: DayContext, only?: SetupId[], opts: DetectOptions = {}): SetupTrigger[] {
  if (bars.length < 6) return [];
  const out: SetupTrigger[] = [];
  const ids = only ?? SETUP_IDS;
  const vL = vwapSeries(bars);
  const mb = mirrorBars(bars);
  const mc = mirrorCtx(ctx);
  const vS = vL.map((x) => -x);
  const atr5 = atr5Series(bars);
  const step = opts.zoneRoundStep ?? zoneRoundStep('', bars[0].c);
  const auxL: Aux = { atr5, zoneStep: step, zones: opts.zones ?? [] };
  const auxS: Aux = { atr5, zoneStep: step, zones: (opts.zones ?? []).map((z) => ({ price: -z.price, source: z.source })) };
  const run = new Set<Exclude<SetupId, 'double_sweep'>>(ids.filter((x): x is Exclude<SetupId, 'double_sweep'> => x !== 'double_sweep'));
  if (ids.includes('double_sweep')) run.add('liquidity_sweep');
  const list = (f: Found | Found[] | null): Found[] => (f == null ? [] : Array.isArray(f) ? f : [f]);
  const mk = (id: SetupId, side: Side, f: Found, sign: 1 | -1): SetupTrigger => ({
    setup: id, side, idx: f.idx, min: bars[f.idx].min, t: bars[f.idx].t, price: bars[f.idx].c, level: sign * f.level, levelName: f.levelName, note: f.note,
    ...(f.touch != null ? { touch: f.touch } : {}), ...(f.zoneKind ? { zoneKind: f.zoneKind } : {}),
  });
  const sweeps: SetupTrigger[] = [];
  for (const id of run) {
    const det = DETECTORS[id];
    for (const f of list(det(bars, vL, ctx, LONG_W, auxL))) { const t = mk(id, 'long', f, 1); if (id === 'liquidity_sweep') sweeps.push(t); if (ids.includes(id)) out.push(t); }
    for (const f of list(det(mb, vS, mc, SHORT_W, auxS))) { const t = mk(id, 'short', f, -1); if (id === 'liquidity_sweep') sweeps.push(t); if (ids.includes(id)) out.push(t); }
  }
  if (ids.includes('double_sweep') && sweeps.length === 2) {
    const second = sweeps[0].idx >= sweeps[1].idx ? sweeps[0] : sweeps[1];
    const first = second === sweeps[0] ? sweeps[1] : sweeps[0];
    if (second.idx > first.idx) out.push({ ...second, setup: 'double_sweep', note: `both sides swept today (${first.side === 'long' ? 'low' : 'high'} at ${hhmm(first.min)}); ${second.note}` });
  }
  return out.sort((a, b) => a.idx - b.idx || a.setup.localeCompare(b.setup));
}

/**
 * ET clock for per-bar work. One shared formatter; the UTC→ET offset is
 * memoised per UTC calendar day (bars run 04:00–20:00 ET, far from the 02:00
 * DST switch). Constructing an Intl.DateTimeFormat per bar costs native memory
 * and time: 150 symbols × 390 bars did 30 s and ~230 MB of RSS that way.
 */
const ET_DTF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
const etOffsets = new Map<string, number>();
export function etClock(ms: number): { dateKey: string; min: number } {
  const utcDay = new Date(ms).toISOString().slice(0, 10);
  let off = etOffsets.get(utcDay);
  if (off == null) {
    const noon = Date.parse(`${utcDay}T16:00:00Z`);
    const p: Record<string, string> = {};
    for (const x of ET_DTF.formatToParts(new Date(noon))) p[x.type] = x.value;
    off = (Number(p.hour) % 24) * 60 + Number(p.minute) - 16 * 60; // −240 (EDT) or −300 (EST)
    if (etOffsets.size > 400) etOffsets.clear();
    etOffsets.set(utcDay, off);
  }
  const local = new Date(ms + off * 60_000);
  return { dateKey: local.toISOString().slice(0, 10), min: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** Prices print as magnitudes (the short pass runs on negated prices). */
function px(x: number): string { return Math.abs(x).toFixed(2); }
export function hhmm(min: number): string { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`; }

// ─── contract pickers ──────────────────────────────────────────────────────

export interface ContractCandidate {
  occ: string; strike: number; type: 'call' | 'put';
  /** Price used for selection: live = ask; replay = trigger-minute bar close. */
  price: number | null;
  /** Live = day volume; replay = trigger-minute bar volume. */
  volume: number;
}
/**
 * otm1       — first strike out of the money.
 * lotto      — the CHEAPEST OTM contract priced $0.05–$0.50 (the spec's lotto; mostly nickel strikes).
 * lotto_near — the NEAREST-the-money OTM contract priced $0.05–$0.50 (e.g. AMD 615C @ $0.25 on 2026-09-30).
 */
export type ContractVariant = 'otm1' | 'lotto' | 'lotto_near';
export const CONTRACT_VARIANTS: ContractVariant[] = ['otm1', 'lotto', 'lotto_near'];
export const VARIANT_LABEL: Record<ContractVariant, string> = { otm1: 'nearest OTM', lotto: 'cheapest lotto ($0.05–$0.50)', lotto_near: 'near lotto ($0.05–$0.50, nearest the money)' };
export const LOTTO_BAND = { min: 0.05, max: 0.5 } as const;

const isOtm = (c: ContractCandidate, spot: number) => (c.type === 'call' ? c.strike > spot : c.strike < spot);

/** Variant (a): the first strike out of the money on the trade's side. */
export function pickNearestOtm(cands: ContractCandidate[], spot: number, type: 'call' | 'put'): ContractCandidate | null {
  const otm = cands.filter((c) => c.type === type && isOtm(c, spot));
  if (!otm.length) return null;
  return otm.reduce((a, b) => (Math.abs(b.strike - spot) < Math.abs(a.strike - spot) ? b : a));
}

/** Variant (b): the cheapest OTM contract priced $0.05–$0.50 with volume; ties → nearer the money. */
export function pickLotto(cands: ContractCandidate[], spot: number, type: 'call' | 'put', band: { min: number; max: number } = LOTTO_BAND): ContractCandidate | null {
  const ok = cands.filter((c) => c.type === type && isOtm(c, spot) && c.volume > 0 && c.price != null && c.price >= band.min && c.price <= band.max);
  if (!ok.length) return null;
  return ok.reduce((a, b) => {
    if (b.price! < a.price!) return b;
    if (b.price! === a.price! && Math.abs(b.strike - spot) < Math.abs(a.strike - spot)) return b;
    return a;
  });
}

/** Variant (c): the OTM contract nearest the money that still prices inside the lotto band, with volume. */
export function pickLottoNear(cands: ContractCandidate[], spot: number, type: 'call' | 'put', band: { min: number; max: number } = LOTTO_BAND): ContractCandidate | null {
  const ok = cands.filter((c) => c.type === type && isOtm(c, spot) && c.volume > 0 && c.price != null && c.price >= band.min && c.price <= band.max);
  if (!ok.length) return null;
  return ok.reduce((a, b) => (Math.abs(b.strike - spot) < Math.abs(a.strike - spot) ? b : a));
}

export function pickContract(variant: ContractVariant, cands: ContractCandidate[], spot: number, type: 'call' | 'put'): ContractCandidate | null {
  return variant === 'otm1' ? pickNearestOtm(cands, spot, type) : variant === 'lotto' ? pickLotto(cands, spot, type) : pickLottoNear(cands, spot, type);
}

// ─── option path outcomes (replay)─────────────────────────────────────────

export type ExitRule = 'hold' | 'take2x' | 'take2x_close' | 'half3x' | 'stop50' | 'stop50_take2x' | 'level_stop' | 'level_stop_take2x';
export const EXIT_RULES: ExitRule[] = ['hold', 'take2x', 'take2x_close', 'half3x', 'stop50', 'stop50_take2x', 'level_stop', 'level_stop_take2x'];
export const EXIT_LABEL: Record<ExitRule, string> = {
  hold: 'hold to the close (expiry value)',
  take2x: 'sell all at 2× (a 1-min bar high touches 2×)',
  take2x_close: 'sell all at 2× only on a 1-min CLOSE ≥ 2× (filled at that close)',
  half3x: 'sell half at 3×, hold the rest to the close',
  stop50: 'stop at −50%, else hold to the close',
  stop50_take2x: 'stop at −50% / sell all at 2×, whichever first',
  level_stop: 'out when the underlying closes back through the trigger level by > 0.05% (sold at the next option print), else hold',
  level_stop_take2x: 'level stop / sell all at 2×, whichever first',
};
/** Tolerance of the level stop: a 1-min close through the trigger level by more than this fraction. */
export const LEVEL_STOP_PCT = 0.0005;

/**
 * When the underlying's level stop fired: the CLOSE time (bar start + 60 s) of
 * the first bar after `fromIdx` that closes through `level` by > 0.05%
 * against the trade, or null.
 */
export function levelStopTime(bars: MinuteBar[], fromIdx: number, level: number, side: Side): number | null {
  const tol = Math.abs(level) * LEVEL_STOP_PCT;
  for (let i = fromIdx + 1; i < bars.length; i++) {
    const c = bars[i].c;
    if (side === 'long' ? c < level - tol : c > level + tol) return bars[i].t + 60_000;
  }
  return null;
}

export interface OptBar { t: number; o: number; h: number; l: number; c: number; v: number }
export interface OptionOutcome {
  entry: number;
  maxMult: number;
  /** Minutes from the entry bar to the first bar high ≥ k× entry. */
  minsTo: { x2: number | null; x3: number | null; x5: number | null };
  expiryValue: number;
  worthless: boolean;
  /** P&L per $1 of premium paid, by exit rule. */
  pnl: Record<ExitRule, number>;
}

/**
 * Outcome of buying at `entry` given the contract's bars AFTER the entry bar
 * and its expiry value. Same-bar ambiguity resolves against the trade (a bar
 * that touches both −50% and 2× is a stop); a gap through the stop fills at
 * the bar's open. `levelExitT` (from levelStopTime) sells at the OPEN of the
 * first option bar at or after that time (else the last print before it).
 */
export function evaluateOptionPath(entry: number, after: OptBar[], expiryValue: number, entryT: number, levelExitT: number | null = null): OptionOutcome {
  let maxH = 0;
  const minsTo = { x2: null as number | null, x3: null as number | null, x5: null as number | null };
  let take2x: number | null = null, take2xClose: number | null = null, hit3 = false, stop50: number | null = null, st2: number | null = null;
  let lvl: number | null = null, lvl2: number | null = null, lastC: number = entry;
  for (const b of after) {
    if (levelExitT != null && lvl == null && b.t >= levelExitT) lvl = b.o;
    if (lvl2 == null) {
      if (levelExitT != null && b.t >= levelExitT) lvl2 = b.o;
      else if (b.h >= 2 * entry) lvl2 = 2 * entry;
    }
    if (levelExitT == null || b.t < levelExitT) lastC = b.c;
    maxH = Math.max(maxH, b.h);
    const m = Math.round((b.t - entryT) / 60_000);
    if (minsTo.x2 == null && b.h >= 2 * entry) minsTo.x2 = m;
    if (minsTo.x3 == null && b.h >= 3 * entry) minsTo.x3 = m;
    if (minsTo.x5 == null && b.h >= 5 * entry) minsTo.x5 = m;
    if (take2x == null && b.h >= 2 * entry) take2x = 2 * entry;
    if (take2xClose == null && b.c >= 2 * entry) take2xClose = b.c;
    if (b.h >= 3 * entry) hit3 = true;
    if (stop50 == null && b.l <= 0.5 * entry) stop50 = Math.min(0.5 * entry, b.o);
    if (st2 == null) {
      if (b.l <= 0.5 * entry) st2 = Math.min(0.5 * entry, b.o);
      else if (b.h >= 2 * entry) st2 = 2 * entry;
    }
  }
  const ev = Math.max(0, expiryValue);
  // Level stop fired but the contract never printed again: the last print before it is the best estimate.
  if (levelExitT != null && lvl == null) lvl = lastC;
  if (levelExitT != null && lvl2 == null) lvl2 = lastC;
  const r = (v: number) => v / entry - 1;
  return {
    entry,
    maxMult: entry > 0 ? Math.max(maxH, ev) / entry : 0,
    minsTo,
    expiryValue: ev,
    worthless: ev <= 0.005,
    pnl: {
      hold: r(ev),
      take2x: r(take2x ?? ev),
      take2x_close: r(take2xClose ?? ev),
      half3x: hit3 ? 0.5 * 2 + 0.5 * r(ev) : r(ev),
      stop50: r(stop50 ?? ev),
      stop50_take2x: r(st2 ?? ev),
      level_stop: r(lvl ?? ev),
      level_stop_take2x: r(lvl2 ?? ev),
    },
  };
}

// ─── publish policy (filled from docs/ZERO_DTE_SETUPS_REPLAY.md) ───────────

export interface SniperPolicy {
  publish: boolean;
  /** The exit rule that replayed best in BOTH halves (the published plan). */
  exit: ExitRule;
  /** Replay evidence stamped onto published ideas. */
  evidence: string;
}
export type PolicyKey = `${SetupId}:${Side}:${ContractVariant}`;
export const policyKey = (s: SetupId, side: Side, v: ContractVariant): PolicyKey => `${s}:${side}:${v}`;

/**
 * Only combinations that held in BOTH walk-forward halves of the replay are
 * listed with publish:true. Everything else is a "watch" row. Generated from
 * research/zero-dte-setups-results.json — see docs/ZERO_DTE_SETUPS_REPLAY.md.
 */
export const SNIPER_POLICIES: Partial<Record<PolicyKey, SniperPolicy>> = {
  // Replay 2025-10-01 → 2026-09-30 (halves split 2026-04-01): the ONLY whole cell that held in both halves.
  // Marginal — with its best trade removed H1 is +0.003/$1; the median trade expires worthless. Measuring.
  'flush_reclaim:short:otm1': {
    publish: true,
    exit: 'hold',
    evidence: 'opening squeeze fails back below prior close, nearest-OTM put held to the close: n 160, H1 +0.23 / H2 +0.20 per $1 of premium (ex-best H1 +0.00 / H2 +0.10), median trade −100%, replay 2025-10-01→2026-09-30 — marginal',
  },
};

export function policyFor(s: SetupId, side: Side, v: ContractVariant): SniperPolicy | null {
  return SNIPER_POLICIES[policyKey(s, side, v)] ?? null;
}

/** Loss rules every sniper idea carries. */
export const SNIPER_LOSS_RULES = [
  'Premium is the whole risk — size so a total loss is acceptable (0DTE: most of these expire worthless).',
  'Out if the underlying closes back through the trigger level on a 1-minute close.',
  'Flat by 15:55 ET — no 0DTE position into the final minutes.',
] as const;

// ─── stage-2 cap (live) ────────────────────────────────────────────────────

/**
 * Choose which fresh triggers get an option-chain fetch this cycle: publishable
 * policies first, then lower `rank` (the engine ranks the frequent
 * reactive-zone touches after the once-a-day setups), then the earliest
 * trigger; at most `cap` symbols (both sides and every setup on a name share
 * one chain).
 */
export function selectForStage2<T extends { symbol: string; publish: boolean; t: number; rank?: number }>(triggers: T[], cap: number): { chosen: string[]; deferred: string[] } {
  const order = [...triggers].sort((a, b) => (a.publish !== b.publish ? (a.publish ? -1 : 1) : (a.rank ?? 0) - (b.rank ?? 0) || a.t - b.t));
  const chosen: string[] = []; const deferred: string[] = [];
  for (const t of order) {
    if (chosen.includes(t.symbol) || deferred.includes(t.symbol)) continue;
    if (chosen.length < Math.max(0, cap)) chosen.push(t.symbol); else deferred.push(t.symbol);
  }
  return { chosen, deferred };
}
