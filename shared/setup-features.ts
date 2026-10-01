/**
 * SETUP FEATURES — point-in-time daily-bar features measured by
 * research/score-v2-study.ts (docs/SCORE_V2_STUDY.md). Pure: no I/O.
 *
 * The study found no combination of these (or of the existing evidence layers)
 * that ranks ideas out of sample, so nothing live scores with them yet. They are
 * kept as one tested implementation so a re-run of the study on a larger record
 * measures exactly the same thing, and a future live layer can reuse it.
 *
 * POINT-IN-TIME RULE: a daily bar may be used only once its session has CLOSED
 * before the moment being scored (16:00 ET for stocks/ETFs, 00:00 UTC of the
 * next day for crypto). `completedThrough` enforces it; every feature function
 * takes the already-cut series and the price known at that moment.
 */

export interface DayBar { day: string; o: number; h: number; l: number; c: number; v: number }
export type Dir = 'long' | 'short';
const sgn = (d: Dir) => (d === 'long' ? 1 : -1);

/** ET calendar day + minute-of-day for an epoch ms (DST-correct via Intl). */
export function etDayMinute(ms: number): { day: string; minute: number } {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, minute: Number(g('hour')) * 60 + Number(g('minute')) };
}

/**
 * Number of leading bars (sorted by day) whose session had CLOSED at `atMs`.
 * Stocks: a bar for day D is complete once it is 16:00 ET on D or later (or any later day).
 * Crypto: a UTC day D is complete at 00:00 UTC of D+1.
 */
export function completedThrough(bars: DayBar[], atMs: number, crypto = false): number {
  let n = 0;
  if (crypto) {
    const today = new Date(atMs).toISOString().slice(0, 10);
    while (n < bars.length && bars[n].day < today) n++;
    return n;
  }
  const { day, minute } = etDayMinute(atMs);
  while (n < bars.length && (bars[n].day < day || (bars[n].day === day && minute >= 960))) n++;
  return n;
}

export function atr(bars: DayBar[], n = 14): number | null {
  if (bars.length < n + 1) return null;
  let a = 0;
  const tr = (i: number) => Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
  for (let i = 1; i <= n; i++) a += tr(i);
  a /= n;
  for (let i = n + 1; i < bars.length; i++) a = (a * (n - 1) + tr(i)) / n;
  return a;
}

export function ema(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  let e = closes.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const k = 2 / (n + 1);
  for (let i = n; i < closes.length; i++) e += k * (closes[i] - e);
  return e;
}

/** Wilder ADX(14) with the directional spread (+DI − −DI). */
export function adx(bars: DayBar[], n = 14): { adx: number; diSpread: number } | null {
  if (bars.length < 2 * n + 1) return null;
  let trS = 0, pS = 0, mS = 0; const dx: number[] = [];
  let adxV: number | null = null; let pdi = 0, mdi = 0;
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].h - bars[i - 1].h, dn = bars[i - 1].l - bars[i].l;
    const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
    if (i <= n) { trS += tr; pS += pdm; mS += mdm; if (i < n) continue; }
    else { trS = trS - trS / n + tr; pS = pS - pS / n + pdm; mS = mS - mS / n + mdm; }
    pdi = trS > 0 ? (100 * pS) / trS : 0; mdi = trS > 0 ? (100 * mS) / trS : 0;
    const d = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    dx.push(d);
    if (dx.length === n) adxV = dx.reduce((s, x) => s + x, 0) / n;
    else if (dx.length > n && adxV != null) adxV = (adxV * (n - 1) + d) / n;
  }
  return adxV == null ? null : { adx: adxV, diSpread: pdi - mdi };
}

export interface DailyFeatures {
  atr: number;
  /** Distance to the 20/55-session extreme in the idea's direction, in ATRs (≥0 = through it). */
  brk20: number; brk55: number | null;
  /** Inside days among the last 5 completed sessions; last session is the narrowest of 7. */
  insideDays5: number; nr7: boolean;
  /** Direction-signed (price − EMA20) / ATR; +1/−1 price on the idea's side of EMA50. */
  ema20Dist: number; ema50Side: number | null;
  adx: number | null; diAligned: number | null;
  /** Last completed session's volume / prior 20-session average. */
  rvol: number | null;
}

/**
 * Daily-bar features for a direction, from COMPLETED bars only (`bars` already cut with
 * `completedThrough`) and the last price known at the scoring moment.
 */
export function dailyFeatures(bars: DayBar[], price: number, dir: Dir): DailyFeatures | null {
  if (bars.length < 25 || !(price > 0)) return null;
  const a = atr(bars, 14);
  if (!a || !(a > 0)) return null;
  const s = sgn(dir);
  const last = (n: number) => bars.slice(-n);
  const hi = (xs: DayBar[]) => Math.max(...xs.map((b) => b.h));
  const lo = (xs: DayBar[]) => Math.min(...xs.map((b) => b.l));
  const brk = (n: number) => (bars.length < n ? null : s > 0 ? (price - hi(last(n))) / a : (lo(last(n)) - price) / a);
  let inside = 0;
  for (let i = Math.max(1, bars.length - 5); i < bars.length; i++) if (bars[i].h <= bars[i - 1].h && bars[i].l >= bars[i - 1].l) inside++;
  const r7 = last(7).map((b) => b.h - b.l);
  const nr7 = r7.length === 7 && r7[6] <= Math.min(...r7.slice(0, 6));
  const closes = bars.map((b) => b.c);
  const e20 = ema(closes, 20)!;
  const e50 = ema(closes, 50);
  const ad = adx(bars, 14);
  const vols = bars.map((b) => b.v);
  const prior = vols.slice(-21, -1).filter((v) => v > 0);
  const rvol = prior.length >= 10 && vols[vols.length - 1] > 0 ? vols[vols.length - 1] / (prior.reduce((x, y) => x + y, 0) / prior.length) : null;
  return {
    atr: a,
    brk20: brk(20)!, brk55: brk(55),
    insideDays5: inside, nr7,
    ema20Dist: (s * (price - e20)) / a,
    ema50Side: e50 == null ? null : Math.sign(s * (price - e50)) || 0,
    adx: ad ? ad.adx : null, diAligned: ad ? s * ad.diSpread : null,
    rvol,
  };
}

/** Direction-signed 5-session relative strength vs SPY (%), from completed closes aligned by day. */
export function relStrength5(sym: DayBar[], spy: DayBar[], dir: Dir): number | null {
  const sp = new Map(spy.map((b) => [b.day, b.c]));
  const xs = sym.filter((b) => sp.has(b.day));
  if (xs.length < 6) return null;
  const k = xs.length - 1;
  const r = (xs[k].c / sp.get(xs[k].day)!) / (xs[k - 5].c / sp.get(xs[k - 5].day)!) - 1;
  return sgn(dir) * r * 100;
}

/**
 * Sector-rotation alignment from a swing read of the symbol's peer group
 * (shared/sector-ignition.ts scoreSwing: group ETF/SPY 5-session RS slope + member
 * breadth vs the 10-day MA). aligned = +1 when the group's side matches the idea,
 * −1 when it opposes it, 0 when the group is flat or the symbol is unmapped.
 */
export interface RotationRead { groupLabel: string; etf: string; side: Dir | null; relPct: number | null; breadthPct: number | null; stage: string }
export function rotationAlignment(read: RotationRead | null, dir: Dir): { aligned: -1 | 0 | 1; rs5: number } {
  if (!read || !read.side) return { aligned: 0, rs5: 0 };
  return { aligned: read.side === dir ? 1 : -1, rs5: sgn(dir) * (read.relPct ?? 0) };
}
