/**
 * SPX FAST MOVES — pure core (no I/O).
 * =====================================
 * One definition of every "fast index move" cause, shared by
 *   • the 12-month option-price replay   research/spx-fast-moves-replay.ts
 *   • the 2026-09-30 minute-by-minute sim research/spx-fast-moves-today.ts
 *   • the live detector (flagged off)     server/spx-fast-moves.ts
 *   • the tests                           scripts/test-spx-fast-moves.ts
 * so what was measured is what runs.
 *
 * Input: SPY (the SPX proxy) REGULAR-SESSION 1-minute bars, oldest first, each
 * stamped with its ET minute-of-day (`min`, 09:30 = 570). Every detector is
 * CAUSAL: whether bar i triggers depends only on bars 0..i, the prior-day
 * context and the calendar (which is known before the open). The trigger is
 * known at the CLOSE of bar i; the replay fills on bar i+1.
 *
 * Every cause fires at most once per side per session (the first occurrence).
 * Calls (long) and puts (short) are exact mirrors.
 *
 * Historical GEX chains do not exist, so no cause here needs GEX. The live
 * detector stamps the cached GEX regime on each idea as CONTEXT only; the
 * "short-gamma" proxies that CAN be replayed are range expansion (today's
 * range so far ÷ ATR20) and the VIX ETF (VIXY) moving with the trade.
 */
import { MARKET_HOLIDAYS } from '../shared/market-calendar';
import type { MinuteBar } from './zero-dte-sniper-core';

export type { MinuteBar };
export type FmSide = 'long' | 'short';

// ─── calendar (known before the open) ───────────────────────────────────────

/** FOMC statement days (14:00 ET) — Federal Reserve published schedule. */
export const FOMC_DAYS = new Set([
  '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
]);

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => ymd(new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000));
const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

export function isTradingDay(day: string, holidays: Set<string> = MARKET_HOLIDAYS): boolean {
  const w = dow(day);
  return w >= 1 && w <= 5 && !holidays.has(day);
}
export function nextTradingDay(day: string, holidays: Set<string> = MARKET_HOLIDAYS): string {
  let d = addDays(day, 1);
  for (let i = 0; i < 10 && !isTradingDay(d, holidays); i++) d = addDays(d, 1);
  return d;
}
export function prevTradingDay(day: string, holidays: Set<string> = MARKET_HOLIDAYS): string {
  let d = addDays(day, -1);
  for (let i = 0; i < 10 && !isTradingDay(d, holidays); i++) d = addDays(d, -1);
  return d;
}
/** Third Friday of a month (YYYY-MM). */
export function thirdFriday(ym: string): string {
  const first = `${ym}-01`;
  const off = (5 - dow(first) + 7) % 7;
  return addDays(first, off + 14);
}
/** Monthly equity/index OPEX: the third Friday, or the trading day before when it is a holiday. */
export function monthlyOpex(ym: string, holidays: Set<string> = MARKET_HOLIDAYS): string {
  const f = thirdFriday(ym);
  return isTradingDay(f, holidays) ? f : prevTradingDay(f, holidays);
}
/**
 * VIX futures/options settlement: the Wednesday 30 days before the third
 * Friday of the FOLLOWING month (the business day before if that Wednesday is
 * a holiday).
 */
export function vixExpiry(ym: string, holidays: Set<string> = MARKET_HOLIDAYS): string {
  const [y, m] = ym.split('-').map(Number);
  const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const w = addDays(thirdFriday(nextYm), -30);
  return isTradingDay(w, holidays) ? w : prevTradingDay(w, holidays);
}

export interface CalendarFlags {
  monthEnd: boolean;
  quarterEnd: boolean;
  opex: boolean;
  quadWitching: boolean;
  /** S&P / Nasdaq quarterly rebalance (effective at the quad-witching close) or the June Russell reconstitution. */
  indexRebalance: boolean;
  vixExpiry: boolean;
  fomc: boolean;
  /** Any day with a scheduled closing-auction flow (month/quarter-end, OPEX, rebalance). */
  closeFlowDay: boolean;
  labels: string[];
}

export function calendarFlags(day: string, holidays: Set<string> = MARKET_HOLIDAYS): CalendarFlags {
  const ym = day.slice(0, 7);
  const m = Number(day.slice(5, 7));
  const monthEnd = isTradingDay(day, holidays) && nextTradingDay(day, holidays).slice(0, 7) !== ym;
  const quarterEnd = monthEnd && m % 3 === 0;
  const opex = monthlyOpex(ym, holidays) === day;
  const quadWitching = opex && m % 3 === 0;
  // Russell reconstitution: the last Friday of June (FTSE Russell; semi-annual from 2026 adds a
  // December date that falls outside the replay window).
  let russell = false;
  if (m === 6 && dow(day) === 5) russell = addDays(day, 7).slice(0, 7) !== ym;
  const indexRebalance = quadWitching || russell;
  const vx = vixExpiry(ym, holidays) === day;
  const fomc = FOMC_DAYS.has(day);
  const closeFlowDay = monthEnd || quarterEnd || opex || indexRebalance;
  const labels = [
    quarterEnd ? 'quarter-end' : monthEnd ? 'month-end' : '',
    quadWitching ? 'quad witching' : opex ? 'monthly OPEX' : '',
    russell ? 'Russell reconstitution' : quadWitching ? 'index rebalance' : '',
    vx ? 'VIX expiry' : '', fomc ? 'FOMC' : '',
  ].filter(Boolean);
  return { monthEnd, quarterEnd, opex, quadWitching, indexRebalance, vixExpiry: vx, fomc, closeFlowDay, labels };
}

// ─── causes ─────────────────────────────────────────────────────────────────

export type CauseId =
  | 'pm_lod_break'      // session low/high break after 14:00, on the VWAP side
  | 'pm_trend_break'    // trend afternoon: ≥ 90% of the last hour on one side of VWAP + lower highs → 30-min low break on volume
  | 'pm_pdl_break'      // prior-day low/high break after 14:00
  | 'rvol_thrust'       // 5-min volume ≥ 3× normal for the time of day, moving with the 30-min trend
  | 'close_flow'        // calendar close-flow day, 15:30+: below VWAP and breaking the 15:00–15:29 low
  | 'close_flow_ctrl'   // the SAME rule on ordinary days (control — does the calendar add anything?)
  | 'imbalance_1550'    // the 15:50 NYSE imbalance bar: a 15:50–15:52 bar ≥ 2× volume breaking the 15:30–15:49 range
  | 'fomc_break'        // FOMC day, after 14:35: break of the 14:00–14:34 statement range
  | 'macro_open_drive'  // 08:30 release day: 1-min close beyond the 09:30–09:34 range, 09:35–10:30, on volume
  | 'open_drive_ctrl'   // the same on days without an 08:30 release (control)
  | 'or_failure'        // opening-range failure: broke one side of the 30-min OR, then closed through the other (10:00–11:30)
  | 'vix_pm_break';     // VIX ETF up ≥ 3% on the day (short-gamma proxy) + 30-min low break below VWAP after 14:00 (mirrored)

export const CAUSE_IDS: CauseId[] = [
  'pm_lod_break', 'pm_trend_break', 'pm_pdl_break', 'rvol_thrust', 'close_flow', 'close_flow_ctrl',
  'imbalance_1550', 'fomc_break', 'macro_open_drive', 'open_drive_ctrl', 'or_failure', 'vix_pm_break',
];
export const CAUSE_LABEL: Record<CauseId, string> = {
  pm_lod_break: 'Session low/high break after 14:00 (VWAP side)',
  pm_trend_break: 'Trend afternoon (VWAP side + lower highs) → 30-min break on volume',
  pm_pdl_break: 'Prior-day low/high break after 14:00',
  rvol_thrust: 'Volume expansion ≥ 3× (5-min) with the trend',
  close_flow: 'Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break',
  close_flow_ctrl: 'Same 15:30+ break on ordinary days (control)',
  imbalance_1550: '15:50 imbalance bar',
  fomc_break: 'FOMC post-statement range break',
  macro_open_drive: '08:30-release open drive',
  open_drive_ctrl: 'Open drive on non-release days (control)',
  or_failure: 'Opening-range failure',
  vix_pm_break: 'VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break',
};
/** Detection windows (ET minute of the TRIGGER bar). */
export const CAUSE_WINDOW: Record<CauseId, [number, number]> = {
  pm_lod_break: [840, 955], pm_trend_break: [870, 955], pm_pdl_break: [840, 955], rvol_thrust: [600, 955],
  close_flow: [930, 955], close_flow_ctrl: [930, 955], imbalance_1550: [950, 952], fomc_break: [875, 955],
  macro_open_drive: [575, 630], open_drive_ctrl: [575, 630], or_failure: [600, 690], vix_pm_break: [840, 955],
};

export const FM_CFG = {
  TREND_SHARE: 0.9,        // share of the last 60 closes on the trade side of VWAP
  TREND_RVOL1: 1.5,        // trigger-bar time-of-day RVOL for pm_trend_break
  THRUST_RVOL5: 3,         // 5-min window RVOL for rvol_thrust
  THRUST_MOVE_PCT: 0.0015, // 5-min move ≥ 0.15% in the trade direction
  IMB_RVOL1: 2,            // 15:50 bar volume ≥ 2× normal for that minute
  DRIVE_RVOL1: 1.5,
  VIX_DAY_PCT: 0.03,       // VIXY ≥ +3% (bear) / ≤ −3% (bull) from its 09:30 open
  VIX_CONFIRM_PCT: 0.015,  // split flag: VIXY moving ≥ 1.5% with the trade
  RANGE_EXP_ATR: 0.8,      // split flag: today's range so far ≥ 0.8 × ATR20
  BREAK_TOL_PCT: 0.0001,   // a close must clear a level by 0.01%
} as const;

export interface FmDayContext {
  day: string;
  pdh: number | null; pdl: number | null; pdc: number | null;
  /** Mean daily high−low over the prior 20 sessions. */
  atr20: number | null;
  /** Average volume by RTH minute index (min − 570, 0..389) over the prior 20 sessions; NaN/undefined where missing. */
  volBase: ArrayLike<number> | null;
  cal: CalendarFlags;
  /** An 08:30 ET release printed today (known before the open). */
  macro0830: boolean;
  /** VIX ETF (VIXY) regular-session 1-min bars, optional. */
  vix?: MinuteBar[] | null;
}

export interface FmTrigger {
  cause: CauseId;
  side: FmSide;
  idx: number;
  t: number;          // bar START (ms); known at t + 60 s
  min: number;
  price: number;      // trigger-bar close
  level: number;
  levelName: string;
  rvol1: number | null;
  rvol5: number | null;
  vwap: number;
  note: string;
  flags: { closeFlowDay: boolean; vixConfirm: boolean | null; rangeExp: boolean | null; rvol3: boolean; late: boolean; fomc: boolean; macro: boolean };
}

const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export { hm as fmHhmm };

/**
 * Run every cause over `bars` (today's RTH 1-min bars up to now). Returns the
 * FIRST trigger per cause × side. Causal: trigger i depends on bars[0..i] only.
 */
export function detectFastMoves(bars: MinuteBar[], ctx: FmDayContext, only?: CauseId[]): FmTrigger[] {
  const want = new Set(only ?? CAUSE_IDS);
  const out: FmTrigger[] = [];
  const fired = new Set<string>();
  const n = bars.length;
  if (!n) return out;
  const vw: number[] = new Array(n);
  let pv = 0, vv = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const p = b.vw ? b.vw : (b.h + b.l + b.c) / 3;
    pv += p * b.v; vv += b.v;
    vw[i] = vv > 0 ? pv / vv : b.c;
  }
  const base = (min: number): number | null => {
    const k = min - 570;
    const x = ctx.volBase ? Number(ctx.volBase[k]) : NaN;
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  const rvol1At = (i: number) => { const b = base(bars[i].min); return b ? bars[i].v / b : null; };
  const rvol5At = (i: number) => {
    if (i < 4) return null;
    let s = 0, sb = 0;
    for (let j = i - 4; j <= i; j++) { const b = base(bars[j].min); if (b == null) return null; s += bars[j].v; sb += b; }
    return sb > 0 ? s / sb : null;
  };
  // VIXY: its 09:30 open and last close at or before a minute (causal).
  const vix = ctx.vix && ctx.vix.length ? ctx.vix : null;
  const vixOpen = vix ? vix[0].o : null;
  let vixPtr = -1;
  const vixChgAt = (min: number): number | null => {
    if (!vix || !vixOpen) return null;
    while (vixPtr + 1 < vix.length && vix[vixPtr + 1].min <= min) vixPtr++;
    return vixPtr >= 0 ? vix[vixPtr].c / vixOpen - 1 : null;
  };

  let dayHi = -Infinity, dayLo = Infinity;   // through bar i−1
  let orHi = -Infinity, orLo = Infinity;      // 09:30–09:59
  let or5Hi = -Infinity, or5Lo = Infinity;    // 09:30–09:34
  let brokeOrUp = false, brokeOrDn = false;
  let fomcHi = -Infinity, fomcLo = Infinity;  // 14:00–14:34
  let cf30Hi = -Infinity, cf30Lo = Infinity;  // 15:00–15:29
  let r3049Hi = -Infinity, r3049Lo = Infinity;// 15:30–15:49
  const tol = FM_CFG.BREAK_TOL_PCT;

  const emit = (i: number, cause: CauseId, side: FmSide, level: number, levelName: string, note: string, r1: number | null, r5: number | null) => {
    const key = `${cause}:${side}`;
    if (fired.has(key) || !want.has(cause)) return;
    const [lo, hi] = CAUSE_WINDOW[cause];
    const b = bars[i];
    if (b.min < lo || b.min > hi) return;
    fired.add(key);
    const vc = vixChgAt(b.min);
    const rangeSoFar = Math.max(dayHi, b.h) - Math.min(dayLo, b.l);
    out.push({
      cause, side, idx: i, t: b.t, min: b.min, price: b.c, level, levelName, rvol1: r1, rvol5: r5, vwap: vw[i], note,
      flags: {
        closeFlowDay: ctx.cal.closeFlowDay,
        vixConfirm: vc == null ? null : side === 'short' ? vc >= FM_CFG.VIX_CONFIRM_PCT : vc <= -FM_CFG.VIX_CONFIRM_PCT,
        rangeExp: ctx.atr20 ? rangeSoFar / ctx.atr20 >= FM_CFG.RANGE_EXP_ATR : null,
        rvol3: (r1 ?? 0) >= 3,
        late: b.min >= 930,
        fomc: ctx.cal.fomc,
        macro: ctx.macro0830,
      },
    });
  };

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const c = b.c;
    const v = vw[i];
    const r1 = rvol1At(i);
    const r5 = rvol5At(i);
    const prev = i > 0 ? bars[i - 1] : null;

    // Window levels (updated AFTER use where the level must pre-exist the bar).
    const dnBreak = (lvl: number) => Number.isFinite(lvl) && c < lvl * (1 - tol);
    const upBreak = (lvl: number) => Number.isFinite(lvl) && c > lvl * (1 + tol);

    // 1. session low/high break after 14:00 on the VWAP side
    if (i > 0) {
      if (dnBreak(dayLo) && c < v) emit(i, 'pm_lod_break', 'short', dayLo, 'session low', `closed ${c.toFixed(2)} below the session low ${dayLo.toFixed(2)}, below VWAP ${v.toFixed(2)}`, r1, r5);
      if (upBreak(dayHi) && c > v) emit(i, 'pm_lod_break', 'long', dayHi, 'session high', `closed ${c.toFixed(2)} above the session high ${dayHi.toFixed(2)}, above VWAP ${v.toFixed(2)}`, r1, r5);
    }

    // 2. trend afternoon → 30-min break on volume
    if (i >= 60) {
      let below = 0, above = 0;
      for (let j = i - 59; j <= i; j++) { if (bars[j].c < vw[j]) below++; else if (bars[j].c > vw[j]) above++; }
      let hiA = -Infinity, loA = Infinity, hiB = -Infinity, loB = Infinity, lo30 = Infinity, hi30 = -Infinity;
      for (let j = i - 59; j <= i - 30; j++) { hiB = Math.max(hiB, bars[j].h); loB = Math.min(loB, bars[j].l); }
      for (let j = i - 29; j <= i; j++) { hiA = Math.max(hiA, bars[j].h); loA = Math.min(loA, bars[j].l); }
      for (let j = i - 30; j < i; j++) { lo30 = Math.min(lo30, bars[j].l); hi30 = Math.max(hi30, bars[j].h); }
      const volOk = (r1 ?? 0) >= FM_CFG.TREND_RVOL1;
      if (below / 60 >= FM_CFG.TREND_SHARE && hiA < hiB && dnBreak(lo30) && volOk) emit(i, 'pm_trend_break', 'short', lo30, '30-min low', `${below}/60 closes below VWAP, lower highs (${hiA.toFixed(2)} < ${hiB.toFixed(2)}), closed below the 30-min low ${lo30.toFixed(2)} on ${r1!.toFixed(1)}× volume`, r1, r5);
      if (above / 60 >= FM_CFG.TREND_SHARE && loA > loB && upBreak(hi30) && volOk) emit(i, 'pm_trend_break', 'long', hi30, '30-min high', `${above}/60 closes above VWAP, higher lows (${loA.toFixed(2)} > ${loB.toFixed(2)}), closed above the 30-min high ${hi30.toFixed(2)} on ${r1!.toFixed(1)}× volume`, r1, r5);
      // 12. VIX ETF short-gamma proxy + 30-min break after 14:00
      const vc = vixChgAt(b.min);
      if (vc != null) {
        if (vc >= FM_CFG.VIX_DAY_PCT && c < v && dnBreak(lo30)) emit(i, 'vix_pm_break', 'short', lo30, '30-min low', `VIXY +${(vc * 100).toFixed(1)}% on the day; closed below the 30-min low ${lo30.toFixed(2)} under VWAP`, r1, r5);
        if (vc <= -FM_CFG.VIX_DAY_PCT && c > v && upBreak(hi30)) emit(i, 'vix_pm_break', 'long', hi30, '30-min high', `VIXY ${(vc * 100).toFixed(1)}% on the day; closed above the 30-min high ${hi30.toFixed(2)} over VWAP`, r1, r5);
      }
    }

    // 3. prior-day low/high break after 14:00 (fresh: the previous close was on the other side)
    if (prev && ctx.pdl != null && dnBreak(ctx.pdl) && prev.c >= ctx.pdl && c < v) emit(i, 'pm_pdl_break', 'short', ctx.pdl, 'prior-day low', `closed ${c.toFixed(2)} below the prior-day low ${ctx.pdl.toFixed(2)}`, r1, r5);
    if (prev && ctx.pdh != null && upBreak(ctx.pdh) && prev.c <= ctx.pdh && c > v) emit(i, 'pm_pdl_break', 'long', ctx.pdh, 'prior-day high', `closed ${c.toFixed(2)} above the prior-day high ${ctx.pdh.toFixed(2)}`, r1, r5);

    // 4. 5-min volume expansion with the 30-min trend
    if (i >= 30 && r5 != null && r5 >= FM_CFG.THRUST_RVOL5 && (r1 ?? 0) >= FM_CFG.THRUST_RVOL5) {
      const m5 = c / bars[i - 5].c - 1;
      const m30 = c / bars[i - 30].c - 1;
      if (m5 <= -FM_CFG.THRUST_MOVE_PCT && m30 < 0 && c < v) emit(i, 'rvol_thrust', 'short', bars[i - 5].c, '5-min-ago close', `5-min volume ${r5.toFixed(1)}× normal, −${(-m5 * 100).toFixed(2)}% in 5 min, below VWAP, 30-min trend down`, r1, r5);
      if (m5 >= FM_CFG.THRUST_MOVE_PCT && m30 > 0 && c > v) emit(i, 'rvol_thrust', 'long', bars[i - 5].c, '5-min-ago close', `5-min volume ${r5.toFixed(1)}× normal, +${(m5 * 100).toFixed(2)}% in 5 min, above VWAP, 30-min trend up`, r1, r5);
    }

    // 5/6. close-flow (calendar) and its control: 15:30+, VWAP side, break of the 15:00–15:29 range
    if (b.min >= 930 && Number.isFinite(cf30Lo)) {
      const cause: CauseId = ctx.cal.closeFlowDay ? 'close_flow' : 'close_flow_ctrl';
      const tag = ctx.cal.closeFlowDay ? `${ctx.cal.labels.join(' + ')} close flow` : 'ordinary day';
      if (dnBreak(cf30Lo) && c < v) emit(i, cause, 'short', cf30Lo, '15:00–15:29 low', `${tag}: closed ${c.toFixed(2)} below the 15:00–15:29 low ${cf30Lo.toFixed(2)}, below VWAP ${v.toFixed(2)}`, r1, r5);
      if (upBreak(cf30Hi) && c > v) emit(i, cause, 'long', cf30Hi, '15:00–15:29 high', `${tag}: closed ${c.toFixed(2)} above the 15:00–15:29 high ${cf30Hi.toFixed(2)}, above VWAP ${v.toFixed(2)}`, r1, r5);
    }

    // 7. 15:50 imbalance bar
    if (b.min >= 950 && b.min <= 952 && Number.isFinite(r3049Lo) && (r1 ?? 0) >= FM_CFG.IMB_RVOL1) {
      if (dnBreak(r3049Lo) && c < b.o) emit(i, 'imbalance_1550', 'short', r3049Lo, '15:30–15:49 low', `${hm(b.min)} bar ${r1!.toFixed(1)}× volume closed below the 15:30–15:49 low ${r3049Lo.toFixed(2)}`, r1, r5);
      if (upBreak(r3049Hi) && c > b.o) emit(i, 'imbalance_1550', 'long', r3049Hi, '15:30–15:49 high', `${hm(b.min)} bar ${r1!.toFixed(1)}× volume closed above the 15:30–15:49 high ${r3049Hi.toFixed(2)}`, r1, r5);
    }

    // 8. FOMC post-statement range break
    if (ctx.cal.fomc && b.min >= 875 && Number.isFinite(fomcLo)) {
      if (dnBreak(fomcLo)) emit(i, 'fomc_break', 'short', fomcLo, '14:00–14:34 low', `FOMC: closed below the statement-range low ${fomcLo.toFixed(2)}`, r1, r5);
      if (upBreak(fomcHi)) emit(i, 'fomc_break', 'long', fomcHi, '14:00–14:34 high', `FOMC: closed above the statement-range high ${fomcHi.toFixed(2)}`, r1, r5);
    }

    // 9/10. open drive (08:30 release days) and its control
    if (b.min >= 575 && Number.isFinite(or5Lo) && (r1 ?? 0) >= FM_CFG.DRIVE_RVOL1) {
      const cause: CauseId = ctx.macro0830 ? 'macro_open_drive' : 'open_drive_ctrl';
      if (dnBreak(or5Lo)) emit(i, cause, 'short', or5Lo, 'OR5 low', `${ctx.macro0830 ? '08:30 release day' : 'no 08:30 release'}: closed below the 09:30–09:34 low ${or5Lo.toFixed(2)} on ${r1!.toFixed(1)}× volume`, r1, r5);
      if (upBreak(or5Hi)) emit(i, cause, 'long', or5Hi, 'OR5 high', `${ctx.macro0830 ? '08:30 release day' : 'no 08:30 release'}: closed above the 09:30–09:34 high ${or5Hi.toFixed(2)} on ${r1!.toFixed(1)}× volume`, r1, r5);
    }

    // 11. opening-range failure
    if (b.min >= 600 && Number.isFinite(orLo)) {
      if (brokeOrUp && dnBreak(orLo)) emit(i, 'or_failure', 'short', orLo, 'OR30 low', `broke above the 30-min opening range ${orHi.toFixed(2)} then closed below its low ${orLo.toFixed(2)}`, r1, r5);
      if (brokeOrDn && upBreak(orHi)) emit(i, 'or_failure', 'long', orHi, 'OR30 high', `broke below the 30-min opening range ${orLo.toFixed(2)} then closed above its high ${orHi.toFixed(2)}`, r1, r5);
    }

    // ── update running levels with bar i ──
    dayHi = Math.max(dayHi, b.h); dayLo = Math.min(dayLo, b.l);
    if (b.min < 600) { orHi = Math.max(orHi, b.h); orLo = Math.min(orLo, b.l); }
    if (b.min >= 600 && Number.isFinite(orHi)) { if (b.h > orHi) brokeOrUp = true; if (b.l < orLo) brokeOrDn = true; }
    if (b.min < 575) { or5Hi = Math.max(or5Hi, b.h); or5Lo = Math.min(or5Lo, b.l); }
    if (b.min >= 840 && b.min < 875) { fomcHi = Math.max(fomcHi, b.h); fomcLo = Math.min(fomcLo, b.l); }
    if (b.min >= 900 && b.min < 930) { cf30Hi = Math.max(cf30Hi, b.h); cf30Lo = Math.min(cf30Lo, b.l); }
    if (b.min >= 930 && b.min < 950) { r3049Hi = Math.max(r3049Hi, b.h); r3049Lo = Math.min(r3049Lo, b.l); }
  }
  return out.sort((a, b) => a.idx - b.idx);
}

// ─── contracts ──────────────────────────────────────────────────────────────

/**
 * otm1  — the first strike out of the money (any distance). Added after the
 *         first replay pass: after 15:30 a 0.2%+ OTM SPY 0DTE is almost always
 *         under $0.05 (not fillable), so the late causes need the first OTM strike.
 * near  — 0.2–0.4% OTM (~0.20–0.35 delta mid-day)
 * cheap — 0.5–0.8% OTM
 */
export type FmVariant = 'otm1' | 'near' | 'cheap';
export const FM_VARIANTS: FmVariant[] = ['otm1', 'near', 'cheap'];
/** OTM distance band as a fraction of spot; `mid` breaks ties. */
export const FM_VARIANT_BAND: Record<FmVariant, { lo: number; hi: number; mid: number; label: string }> = {
  otm1: { lo: 1e-6, hi: 0.02, mid: 0, label: 'first OTM strike' },
  near: { lo: 0.002, hi: 0.004, mid: 0.003, label: '0.2–0.4% OTM (~0.20–0.35Δ)' },
  cheap: { lo: 0.005, hi: 0.008, mid: 0.0065, label: '0.5–0.8% OTM' },
};

/** The strike in the variant's OTM band nearest its midpoint; null when the chain has none in band. */
export function pickFastStrike(strikes: number[], spot: number, side: FmSide, variant: FmVariant): number | null {
  const band = FM_VARIANT_BAND[variant];
  let best: number | null = null, bestD = Infinity;
  for (const k of strikes) {
    const otm = side === 'short' ? (spot - k) / spot : (k - spot) / spot;
    if (otm < band.lo - 1e-9 || otm > band.hi + 1e-9) continue;
    const d = Math.abs(otm - band.mid);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

/** SPXW strike equivalent of a SPY strike: SPY × ratio, rounded to the 5-point SPXW grid. */
export function spxwEquivalent(spyStrike: number, ratio = 10): number {
  return Math.round((spyStrike * ratio) / 5) * 5;
}

// ─── exits (replay) ─────────────────────────────────────────────────────────

export type FmExit = 'hold' | 'take2x' | 'take2x_close' | 'take3x' | 'half2x_trail' | 'stop50';
export const FM_EXITS: FmExit[] = ['hold', 'take2x', 'take2x_close', 'take3x', 'half2x_trail', 'stop50'];
export const FM_EXIT_LABEL: Record<FmExit, string> = {
  hold: 'hold to the close (expiry value = intrinsic at the 15:59 close)',
  take2x: 'sell all at 2× (a 1-min bar high touches 2×)',
  take2x_close: 'sell all at 2× only on a 1-min CLOSE ≥ 2× (filled at that close)',
  take3x: 'sell all at 3× (bar high), else hold',
  half2x_trail: 'sell half at 2×, trail the rest: out on a 1-min close ≤ 60% of its peak, else expiry',
  stop50: 'stop at −50% (bar low; gap fills at the open), else hold',
};
export const TRAIL_KEEP = 0.6;

export interface OptBarLite { t: number; o: number; h: number; l: number; c: number; v: number }
export interface FastOutcome {
  entry: number; maxMult: number; expiryValue: number; worthless: boolean;
  minsTo2x: number | null; minsTo3x: number | null; minsTo5x: number | null;
  pnl: Record<FmExit, number>;
  /** When/at what each exit sold (ms, price) — for the timeline. */
  fills: Partial<Record<FmExit, { t: number | null; px: number }>>;
}

/**
 * Buy at `entry` (bar entryT); `after` = the contract's 1-min bars after the
 * entry bar up to the close. Same-bar ambiguity resolves against the trade.
 */
export function evaluateFastExit(entry: number, after: OptBarLite[], expiryValue: number, entryT: number): FastOutcome {
  const ev = Math.max(0, expiryValue);
  let maxH = 0;
  let m2: number | null = null, m3: number | null = null, m5: number | null = null;
  let t2: { t: number; px: number } | null = null, t2c: { t: number; px: number } | null = null, t3: { t: number; px: number } | null = null;
  let s50: { t: number; px: number } | null = null;
  let halfDone: number | null = null; let peak = 0; let trailOut: { t: number; px: number } | null = null;
  for (const b of after) {
    maxH = Math.max(maxH, b.h);
    const m = Math.round((b.t - entryT) / 60_000);
    if (m2 == null && b.h >= 2 * entry) m2 = m;
    if (m3 == null && b.h >= 3 * entry) m3 = m;
    if (m5 == null && b.h >= 5 * entry) m5 = m;
    if (!t2 && b.h >= 2 * entry) t2 = { t: b.t, px: 2 * entry };
    if (!t2c && b.c >= 2 * entry) t2c = { t: b.t, px: b.c };
    if (!t3 && b.h >= 3 * entry) t3 = { t: b.t, px: 3 * entry };
    if (!s50 && b.l <= 0.5 * entry) s50 = { t: b.t, px: Math.min(0.5 * entry, b.o) };
    // half at 2× + trail
    if (halfDone == null) {
      if (b.h >= 2 * entry) { halfDone = b.t; peak = Math.max(2 * entry, b.h); }
    } else if (!trailOut) {
      if (b.c <= TRAIL_KEEP * peak) trailOut = { t: b.t, px: b.c };
      peak = Math.max(peak, b.h);
    }
  }
  const r = (v: number) => v / entry - 1;
  const trailPx = trailOut ? trailOut.px : ev;
  const half = halfDone != null ? 0.5 * r(2 * entry) + 0.5 * r(trailPx) : r(ev);
  return {
    entry, maxMult: entry > 0 ? Math.max(maxH, ev) / entry : 0, expiryValue: ev, worthless: ev <= 0.005,
    minsTo2x: m2, minsTo3x: m3, minsTo5x: m5,
    pnl: {
      hold: r(ev), take2x: r(t2?.px ?? ev), take2x_close: r(t2c?.px ?? ev), take3x: r(t3?.px ?? ev), half2x_trail: half, stop50: r(s50?.px ?? ev),
    },
    fills: {
      hold: { t: null, px: ev }, take2x: t2 ?? { t: null, px: ev }, take2x_close: t2c ?? { t: null, px: ev }, take3x: t3 ?? { t: null, px: ev },
      half2x_trail: halfDone != null ? { t: trailOut?.t ?? null, px: 0.5 * 2 * entry + 0.5 * trailPx } : { t: null, px: ev }, stop50: s50 ?? { t: null, px: ev },
    },
  };
}

// ─── publish policy (filled from docs/SPX_FAST_MOVES_2026-09-30.md) ─────────

export interface FastMovePolicy {
  /** true only for a cell that survived BOTH walk-forward halves on SPXW (≥ 20 per half, ex-best > 0). */
  publish: boolean;
  /**
   * A replay CANDIDATE: positive in both halves (ex-best too) on real SPXW bars, but under the
   * 20-trades-per-half bar and not corroborated by the SPY/ETF replays. Published only when
   * SPX_FAST_MOVES_CANDIDATES=true, labelled "unvalidated candidate", to be measured live.
   */
  candidate: boolean;
  variant: FmVariant;
  exit: FmExit;
  evidence: string;
}
export type FmPolicyKey = `${CauseId}:${FmSide}`;
/**
 * Filled from research/spx-fast-moves-replay.ts (2025-10-01 → 2026-09-30,
 * halves split 2026-04-01) — docs/SPX_FAST_MOVES_2026-09-30.md.
 * NO cause survived the pre-registered bar on SPXW, so nothing is `publish: true`.
 * The two afternoon-put candidates below are the only cells positive in both
 * halves with each half's best trade removed on real SPXW bars.
 */
export const FAST_MOVE_POLICIES: Partial<Record<FmPolicyKey, FastMovePolicy>> = {
  'pm_lod_break:short': {
    publish: false, candidate: true, variant: 'otm1', exit: 'take2x',
    evidence: 'SPXW first-OTM put, sell at 2×: n 41 (H1 24 / H2 17) · +0.06 / +0.33 per $1 (best trade removed +0.02 / +0.29); ' +
      'hold-to-close −0.09 / +0.57. Below the 20-per-half bar; SPY 0DTE (−0.19 hold) and the SPY/QQQ/IWM pool (−0.31 hold) LOSE on the same trigger.',
  },
  'pm_trend_break:short': {
    publish: false, candidate: true, variant: 'otm1', exit: 'take2x',
    evidence: 'SPXW first-OTM put, sell at 2×: n 34 (H1 21 / H2 13) · +0.16 / +0.18 per $1 (best trade removed +0.12 / +0.11); ' +
      'hold-to-close +0.01 / +0.04. Below the 20-per-half bar; SPY 0DTE (−0.25 hold) and the ETF pool (−0.50 hold) LOSE on the same trigger.',
  },
};

export function fastMovePolicy(cause: CauseId, side: FmSide): FastMovePolicy | null {
  return FAST_MOVE_POLICIES[`${cause}:${side}`] ?? null;
}

/** Close-flow risk context line (month/quarter-end, OPEX, rebalance days, from 15:30 ET). */
export function closeFlowRiskLine(cal: CalendarFlags, etMin: number): string | null {
  if (!cal.closeFlowDay || etMin < 930 || etMin > 960) return null;
  return `Close-flow risk: ${cal.labels.filter((l) => l !== 'FOMC' && l !== 'VIX expiry').join(' + ')} — closing-auction imbalance publishes 15:50 ET; ` +
    'expect volume expansion into 16:00. Context only; a direction is published only when a measured cause triggers.';
}
