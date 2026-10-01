/**
 * HOLY GRAIL (Linda Bradford Raschke, "Street Smarts", 1995) — pure core, no I/O.
 * ==============================================================================
 * Operator, 2026-09-30: "holy grail indicator cooked so much today, you missed it".
 * The same detector + trade simulator serves the replay
 * (research/holy-grail-replay.ts), today's scan (research/holy-grail-today.ts),
 * the live engine (server/holy-grail.ts) and the tests (scripts/test-holy-grail.ts).
 *
 * SETUP (long; short is the exact mirror):
 *   1. Strong trend: ADX(14) > 30 and rising — at the signal bar ADX > 30, +DI > −DI,
 *      and ADX printed a rising value above 30 within the last `risingLookback`
 *      bars (ADX usually turns down DURING the pullback; Raschke's "rising"
 *      describes the trend leg that precedes it).
 *   2. Pullback to the 20-period EMA: the FIRST bar whose low touches or
 *      penetrates EMA20 after a bar that held entirely above it opens the
 *      pullback. Every later bar of the same pullback that still touches the
 *      EMA becomes the new signal bar (the stop order trails down to it).
 *   3. Entry: buy stop one tick above the signal bar's HIGH, valid for the next
 *      `entryBars` bars (N = 1 or 3). Gap through → filled at the open.
 *   4. Initial stop: the pullback's extreme — the lowest low from the first touch
 *      through the bar before the fill (for N = 1 that is the signal bar's low or
 *      lower if the pullback dug deeper first).
 *   5. Exits compared (EXIT_RULES): the prior swing extreme (highest high of the
 *      `swingLookback` bars before the pullback), 2R, break-even after 1R
 *      (then 2R), and a pure time stop. Intraday trades never hold overnight
 *      (time stop = the session's last bar); daily trades time-stop after
 *      `maxHoldBars` bars.
 *   The baseline (`requireAdx: false`) is the SAME entry with no ADX > 30 / rising
 *   requirement (DI direction still picks the side) — it answers "is ADX the
 *   thing that matters?".
 *
 * FILL / EXIT CONSERVATISM: a bar that touches both stop and target is a stop; a
 *   fill bar that also touches the stop is a stop; a target is only credited on
 *   the fill bar if that bar CLOSES beyond it; stop exits pay one tick of slippage.
 *
 * Everything is "measuring" until the walk-forward law is satisfied (positive in
 * BOTH halves, n ≥ 30 per half, robust to removing each half's best trade).
 */
import { emaSeries, wilderDmi } from './trend-indicators';

export type HgSide = 'long' | 'short';
export type HgExitRule = 'swing' | 'r2' | 'be1r' | 'time';
export const HG_EXIT_RULES: readonly HgExitRule[] = ['swing', 'r2', 'be1r', 'time'];
export const HG_EXIT_LABEL: Record<HgExitRule, string> = {
  swing: 'target = prior swing extreme (the move\'s recent high/low)',
  r2: 'target = 2R',
  be1r: 'stop → break-even after +1R, target 2R',
  time: 'time stop only (session close intraday / max hold daily)',
};

export interface HgBar {
  /** Bar start, epoch ms. */
  t: number;
  o: number; h: number; l: number; c: number; v: number;
  /** Session key (ET YYYY-MM-DD). Intraday: setups and trades never cross sessions. */
  session: string;
}

export interface HgParams {
  adxPeriod: number;
  emaPeriod: number;
  adxMin: number;
  /** Bars back (from the signal bar) in which ADX must have printed a rising value above adxMin. */
  risingLookback: number;
  /** Entry stop valid for this many bars after the signal bar (Raschke: next bar → 1; tested 1 and 3). */
  entryBars: number;
  tick: number;
  /** Bars before the first touch scanned for the swing extreme (target). */
  swingLookback: number;
  /** false = baseline (no ADX>30/rising requirement; DI still sets the side). */
  requireAdx: boolean;
  /** Intraday: true → time stop at the session's last bar and nothing crosses sessions. */
  intraday: boolean;
  /** Daily: time stop after this many bars held. */
  maxHoldBars: number;
  /** Skip trades whose risk is below this fraction of price (micro-risk R is noise). */
  minRiskPct: number;
  /**
   * Intrabar ordering on bars that touch both levels (and the fill bar's stop touch).
   * 'conservative' (default, the law's basis): stop first. 'optimistic' (sensitivity
   * only): the fill bar stops out only if it CLOSES through the stop, and a later bar
   * touching both levels counts as the target.
   */
  ambiguity: 'conservative' | 'optimistic';
}

export const HG_DEFAULTS: HgParams = {
  adxPeriod: 14, emaPeriod: 20, adxMin: 30, risingLookback: 10, entryBars: 1, tick: 0.01,
  swingLookback: 20, requireAdx: true, intraday: true, maxHoldBars: 10, minRiskPct: 0.0005, ambiguity: 'conservative',
};

export interface HgIndicators { ema: number[]; adx: number[]; plusDI: number[]; minusDI: number[] }

export function hgIndicators(bars: readonly HgBar[], p: Pick<HgParams, 'adxPeriod' | 'emaPeriod'> = HG_DEFAULTS): HgIndicators {
  const ema = emaSeries(bars.map((b) => b.c), p.emaPeriod);
  const d = wilderDmi(bars.map((b) => b.h), bars.map((b) => b.l), bars.map((b) => b.c), p.adxPeriod);
  return { ema, adx: d.adx, plusDI: d.plusDI, minusDI: d.minusDI };
}

/** One filled (or pending) Holy Grail trade. */
export interface HgSignal {
  side: HgSide;
  /** Bar index of the first EMA touch of this pullback. */
  touchIdx: number;
  /** Bar index of the signal bar whose high/low set the entry stop that filled (or the latest pending one). */
  signalIdx: number;
  /** Fill bar index, or null while pending (live). */
  fillIdx: number | null;
  /** Entry stop price (signal-bar high + tick for longs). */
  entryStop: number;
  /** Actual fill (entry stop, or the open on a gap through). */
  fill: number | null;
  /** Initial stop = pullback extreme before the fill. */
  stop: number;
  /** Prior swing extreme (target for the 'swing' exit). */
  swingTarget: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  ema: number;
  /** Last bar index at which the current entry stop is still valid. */
  validThroughIdx: number;
  session: string;
}

const isNum = Number.isFinite;
/** A pullback that has not triggered within this many bars of its first EMA touch is abandoned. */
export const MAX_PULLBACK_BARS = 15;

function armed(i: number, side: HgSide, ind: HgIndicators, p: HgParams): boolean {
  const adx = ind.adx[i], pdi = ind.plusDI[i], mdi = ind.minusDI[i];
  if (!isNum(pdi) || !isNum(mdi)) return false;
  if (side === 'long' ? !(pdi > mdi) : !(mdi > pdi)) return false;
  if (!p.requireAdx) return true;
  if (!(isNum(adx) && adx > p.adxMin)) return false;
  for (let k = i; k >= Math.max(1, i - p.risingLookback); k--) {
    if (isNum(ind.adx[k]) && isNum(ind.adx[k - 1]) && ind.adx[k] > p.adxMin && ind.adx[k] > ind.adx[k - 1]) return true;
  }
  return false;
}

/**
 * Scan `bars` (oldest first) for Holy Grail trades. Returns every filled trade
 * plus — when `includePending` — the setups whose entry stop is still live at
 * the last bar (fillIdx null). Pure and deterministic.
 */
export function detectHolyGrail(bars: readonly HgBar[], params: Partial<HgParams> = {}, opts: { includePending?: boolean; ind?: HgIndicators } = {}): HgSignal[] {
  const p: HgParams = { ...HG_DEFAULTS, ...params };
  const ind = opts.ind ?? hgIndicators(bars, p);
  const out: HgSignal[] = [];
  for (const side of ['long', 'short'] as const) {
    const L = side === 'long';
    const touches = (i: number) => (L ? bars[i].l <= ind.ema[i] : bars[i].h >= ind.ema[i]);
    const clear = (i: number) => (L ? bars[i].l > ind.ema[i] : bars[i].h < ind.ema[i]);
    let i = 1;
    while (i < bars.length) {
      // a fresh pullback: this bar touches, the previous bar (same session intraday) was clear of the EMA
      const sameSess = !p.intraday || bars[i - 1].session === bars[i].session;
      if (!(isNum(ind.ema[i]) && isNum(ind.ema[i - 1]) && sameSess && clear(i - 1) && touches(i))) { i++; continue; }
      // The pullback opened at bar i. It lives while its bars keep touching the EMA (or an entry
      // order is still valid), at most `maxPullbackBars`. Only touching bars that satisfy the
      // trend rule (armed) become signal bars; a DI wobble mid-pullback does not end it.
      const touchIdx = i;
      const s0 = Math.max(0, touchIdx - p.swingLookback);
      let swing = L ? -Infinity : Infinity;
      for (let k = s0; k < touchIdx; k++) swing = L ? Math.max(swing, bars[k].h) : Math.min(swing, bars[k].l);
      let signalIdx = -1;
      let extreme = L ? bars[touchIdx].l : bars[touchIdx].h;
      let entryStop = NaN;
      let validThrough = -1;
      if (armed(touchIdx, side, ind, p)) { signalIdx = touchIdx; entryStop = L ? bars[touchIdx].h + p.tick : bars[touchIdx].l - p.tick; validThrough = touchIdx + p.entryBars; }
      let filled: HgSignal | null = null;
      let j = touchIdx + 1;
      for (; j < bars.length && j <= touchIdx + MAX_PULLBACK_BARS; j++) {
        if (p.intraday && bars[j].session !== bars[touchIdx].session) break;
        const b = bars[j];
        const live = signalIdx >= 0 && j <= validThrough;
        if (!live && !touches(j)) break; // pullback over without a live order
        const hit = live && (L ? b.h >= entryStop : b.l <= entryStop);
        if (hit) {
          const fill = L ? Math.max(entryStop, b.o) : Math.min(entryStop, b.o);
          filled = {
            side, touchIdx, signalIdx, fillIdx: j, entryStop: r4(entryStop), fill: r4(fill), stop: r4(extreme), swingTarget: r4(swing),
            adx: ind.adx[signalIdx], plusDI: ind.plusDI[signalIdx], minusDI: ind.minusDI[signalIdx], ema: ind.ema[signalIdx],
            validThroughIdx: validThrough, session: bars[touchIdx].session,
          };
          break;
        }
        extreme = L ? Math.min(extreme, b.l) : Math.max(extreme, b.h);
        // a later bar of the same pullback that still touches the EMA (and still qualifies) becomes the new signal bar
        if (touches(j) && armed(j, side, ind, p)) {
          signalIdx = j;
          entryStop = L ? b.h + p.tick : b.l - p.tick;
          validThrough = j + p.entryBars;
        }
      }
      if (filled) {
        const risk = Math.abs((filled.fill as number) - filled.stop);
        const wrongSide = L ? filled.stop >= (filled.fill as number) : filled.stop <= (filled.fill as number);
        if (!wrongSide && risk >= p.minRiskPct * (filled.fill as number)) out.push(filled);
        i = (filled.fillIdx as number) + 1;
        continue;
      }
      // still live: we ran out of bars while the current entry stop is valid beyond the last bar
      if (opts.includePending && signalIdx >= 0 && j >= bars.length && validThrough > bars.length - 1) {
        out.push({
          side, touchIdx, signalIdx, fillIdx: null, entryStop: r4(entryStop), fill: null, stop: r4(extreme), swingTarget: r4(swing),
          adx: ind.adx[signalIdx], plusDI: ind.plusDI[signalIdx], minusDI: ind.minusDI[signalIdx], ema: ind.ema[signalIdx],
          validThroughIdx: validThrough, session: bars[touchIdx].session,
        });
      }
      i = Math.max(j, touchIdx + 1);
    }
  }
  return out.sort((a, b) => (a.fillIdx ?? a.signalIdx) - (b.fillIdx ?? b.signalIdx));
}

/**
 * Every bar that touched the EMA while the trend rule held (a signal bar in the
 * making), filled or not — the "armed but never triggered" list for reports and
 * the live WATCH rows. Pullback continuation bars count too.
 */
export function armedBars(bars: readonly HgBar[], params: Partial<HgParams> = {}, ind?: HgIndicators): Array<{ idx: number; side: HgSide; adx: number; ema: number; entryStop: number }> {
  const p: HgParams = { ...HG_DEFAULTS, ...params };
  const I = ind ?? hgIndicators(bars, p);
  const out: Array<{ idx: number; side: HgSide; adx: number; ema: number; entryStop: number }> = [];
  for (let i = 1; i < bars.length; i++) {
    if (!isNum(I.ema[i])) continue;
    for (const side of ['long', 'short'] as const) {
      const touch = side === 'long' ? bars[i].l <= I.ema[i] : bars[i].h >= I.ema[i];
      if (touch && armed(i, side, I, p)) out.push({ idx: i, side, adx: I.adx[i], ema: I.ema[i], entryStop: r4(side === 'long' ? bars[i].h + p.tick : bars[i].l - p.tick) });
    }
  }
  return out;
}

export interface HgOutcome {
  rule: HgExitRule;
  exitIdx: number;
  exitPrice: number;
  reason: 'stop' | 'target' | 'breakeven' | 'time';
  r: number;
  /** Max favourable / adverse excursion (R) from the fill through the exit bar. */
  mfeR: number;
  maeR: number;
}

/** Target price for a rule (null = none). */
export function hgTarget(s: HgSignal, rule: HgExitRule): number | null {
  const fill = s.fill as number; const risk = Math.abs(fill - s.stop); const L = s.side === 'long';
  if (rule === 'time') return null;
  if (rule === 'swing') {
    const ok = L ? s.swingTarget > fill : s.swingTarget < fill;
    return ok ? s.swingTarget : (L ? fill + risk : fill - risk); // swing already behind the fill → 1R fallback
  }
  return L ? fill + 2 * risk : fill - 2 * risk;
}

/** Walk a filled signal forward under one exit rule. */
export function simulateHolyGrail(bars: readonly HgBar[], s: HgSignal, rule: HgExitRule, params: Partial<HgParams> = {}): HgOutcome {
  const p: HgParams = { ...HG_DEFAULTS, ...params };
  if (s.fillIdx == null || s.fill == null) throw new Error('simulateHolyGrail needs a filled signal');
  const L = s.side === 'long'; const sg = L ? 1 : -1;
  const fill = s.fill; const risk = Math.abs(fill - s.stop);
  const target = hgTarget(s, rule);
  let stop = s.stop; let beArmed = false;
  let mfe = 0, mae = 0;
  const R = (px: number) => (sg * (px - fill)) / risk;
  const lastIdx = (() => {
    if (p.intraday) { let k = s.fillIdx; while (k + 1 < bars.length && bars[k + 1].session === bars[s.fillIdx].session) k++; return k; }
    return Math.min(bars.length - 1, s.fillIdx + p.maxHoldBars);
  })();
  const done = (exitIdx: number, px: number, reason: HgOutcome['reason']): HgOutcome => ({ rule, exitIdx, exitPrice: r4(px), reason, r: r4(R(px)), mfeR: r4(mfe), maeR: r4(mae) });
  for (let k = s.fillIdx; k <= lastIdx; k++) {
    const b = bars[k];
    const fav = L ? b.h : b.l, adv = L ? b.l : b.h;
    mfe = Math.max(mfe, R(fav)); mae = Math.min(mae, R(adv));
    const first = k === s.fillIdx;
    // gaps (not on the fill bar — the fill already used the open)
    if (!first) {
      if (L ? b.o <= stop : b.o >= stop) return done(k, b.o, beArmed && stop === fill ? 'breakeven' : 'stop');
      if (target != null && (L ? b.o >= target : b.o <= target)) return done(k, b.o, 'target');
    }
    const opt = p.ambiguity === 'optimistic';
    const reached = target != null && (first ? (L ? b.c >= target : b.c <= target) : (L ? fav >= target : fav <= target));
    if (opt && reached) return done(k, target as number, 'target');
    const stopped = opt && first ? (L ? b.c <= stop : b.c >= stop) : (L ? adv <= stop : adv >= stop);
    if (stopped) {
      const px = beArmed && stop === fill ? fill : stop - sg * p.tick;
      return done(k, px, beArmed && stop === fill ? 'breakeven' : 'stop');
    }
    if (reached) return done(k, target as number, 'target');
    if (rule === 'be1r' && !beArmed && R(fav) >= 1) { beArmed = true; stop = fill; }
  }
  return done(lastIdx, bars[lastIdx].c, 'time');
}

// ─── stats + the walk-forward law ─────────────────────────────────────────

export interface HgStats { n: number; winPct: number; avgR: number; avgWinR: number; avgLossR: number; expectancyR: number; pf: number | null; sumR: number }

export function hgStats(rs: readonly number[]): HgStats {
  const n = rs.length;
  if (!n) return { n: 0, winPct: 0, avgR: 0, avgWinR: 0, avgLossR: 0, expectancyR: 0, pf: null, sumR: 0 };
  const w = rs.filter((r) => r > 0), l = rs.filter((r) => r <= 0);
  const sum = rs.reduce((a, b) => a + b, 0);
  const gw = w.reduce((a, b) => a + b, 0), gl = -l.reduce((a, b) => a + b, 0);
  const winPct = w.length / n;
  const avgWinR = w.length ? gw / w.length : 0, avgLossR = l.length ? -gl / l.length : 0;
  return {
    n, winPct: r4(winPct * 100), avgR: r4(sum / n), avgWinR: r4(avgWinR), avgLossR: r4(avgLossR),
    expectancyR: r4(winPct * avgWinR + (1 - winPct) * avgLossR), pf: gl > 0 ? r4(gw / gl) : null, sumR: r4(sum),
  };
}

/** Mean with the single best value removed. */
export function meanWithoutBest(rs: readonly number[]): number {
  if (rs.length < 2) return 0;
  const sorted = [...rs].sort((a, b) => b - a);
  return r4(sorted.slice(1).reduce((a, b) => a + b, 0) / (rs.length - 1));
}

export const HG_LAW = { minHalfN: 30 } as const;

export interface HgVerdict { pass: boolean; h1: HgStats; h2: HgStats; h1NoBest: number; h2NoBest: number; why: string }

/** Walk-forward law: positive mean in BOTH halves, n ≥ 30 each, still positive with each half's best trade removed. */
export function hgVerdict(h1: readonly number[], h2: readonly number[], minHalfN: number = HG_LAW.minHalfN): HgVerdict {
  const s1 = hgStats(h1), s2 = hgStats(h2);
  const b1 = meanWithoutBest(h1), b2 = meanWithoutBest(h2);
  const fails: string[] = [];
  if (s1.n < minHalfN || s2.n < minHalfN) fails.push(`n per half < ${minHalfN} (${s1.n}/${s2.n})`);
  if (!(s1.avgR > 0)) fails.push(`H1 mean ${s1.avgR.toFixed(3)}R ≤ 0`);
  if (!(s2.avgR > 0)) fails.push(`H2 mean ${s2.avgR.toFixed(3)}R ≤ 0`);
  if (s1.n >= 2 && !(b1 > 0)) fails.push(`H1 without best ${b1.toFixed(3)}R ≤ 0`);
  if (s2.n >= 2 && !(b2 > 0)) fails.push(`H2 without best ${b2.toFixed(3)}R ≤ 0`);
  return { pass: fails.length === 0, h1: s1, h2: s2, h1NoBest: b1, h2NoBest: b2, why: fails.length ? fails.join('; ') : 'positive in both halves, n ≥ 30 each, robust to dropping each half\'s best trade' };
}

export function adxBucket(adx: number): '<20' | '20–30' | '30–40' | '40–50' | '>50' {
  if (adx < 20) return '<20';
  if (adx < 30) return '20–30';
  if (adx < 40) return '30–40';
  if (adx < 50) return '40–50';
  return '>50';
}

/** Intraday time-of-day bucket from ET minute-of-day. */
export function todBucket(min: number): '09:30–10:30' | '10:30–12:00' | '12:00–14:00' | '14:00–16:00' {
  if (min < 10 * 60 + 30) return '09:30–10:30';
  if (min < 12 * 60) return '10:30–12:00';
  if (min < 14 * 60) return '12:00–14:00';
  return '14:00–16:00';
}

/** Aggregate consecutive bars into `per`-bar groups inside each session, aligned to the session's first bar. */
export function aggregateBars(bars: readonly HgBar[], minutes: number, barMinutes = 1): HgBar[] {
  const per = Math.max(1, Math.round(minutes / barMinutes));
  const out: HgBar[] = [];
  let cur: HgBar | null = null; let curKey = '';
  let sessStart = 0; let sess = '';
  for (const b of bars) {
    if (b.session !== sess) { sess = b.session; sessStart = b.t; }
    const bucket = Math.floor((b.t - sessStart) / (per * barMinutes * 60_000));
    const key = `${b.session}|${bucket}`;
    if (key !== curKey) {
      if (cur) out.push(cur);
      cur = { t: sessStart + bucket * per * barMinutes * 60_000, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, session: b.session };
      curKey = key;
    } else if (cur) {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function r4(x: number): number { return Math.round(x * 1e4) / 1e4; }
