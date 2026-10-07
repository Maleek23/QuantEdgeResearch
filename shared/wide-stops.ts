/**
 * WIDE STOPS — stop = max(structural level, k × daily ATR(14)). One pure rule for
 * the Quantinum Bot (phase 1, on by default) and NEXUS publish (phase 2, behind
 * NEXUS_STOP_ATR_MULT, unset = today's 1.25× floor). No I/O.
 *
 * EVIDENCE (prod 2026-10-07, research/losers-later.ts → research/results/LOSERS_LATER_2026-10-05.md)
 *   median NEXUS stop 2.27% = 0.51× daily ATR(14); of 141 analysable losers since
 *   2026-09-29, 9.9% later hit T1 inside the hold window and 46.8% traded back at
 *   entry. Paired replay on the same ideas (MEASURING): plan 53.7% win, 1×ATR 61.2%,
 *   1.5× 65.3%, 2× 69.2%, time-only 72.3% (time-only = no stop → not adopted without
 *   a disaster stop). The multiple is chosen by research/stop-width-walkforward.ts
 *   (both halves, top trades removed); until that has run on prod the default is the
 *   1.5× fallback.
 *
 * "max" means FURTHER from entry: the structural level (the published plan stop —
 * already level-snapped and 1.25×-ATR floored at publish) is kept when it is wider;
 * otherwise the stop moves out to k×ATR. The target is never moved; R:R is restated.
 *
 * SIZING — dollar risk per trade stays the same. A wider stop means fewer shares /
 * contracts, never more dollars at risk:
 *   shares    qty = riskUsd ÷ |entry − wideStop|
 *   options   the premium stop is the contract's modelled value AT the wide underlying
 *             stop (linear delta: premium − |Δ|·|entry − wideStop|), floored at
 *             −maxPremLossPct; qty = riskUsd ÷ ((premium − premiumStop) × 100).
 *
 * OPTIONS — TWO EXITS, ONE RISK (documented choice, operator 2026-10-07):
 *   1. underlying stop  — the wide ATR stop on the UNDERLYING is the invalidation.
 *                         Checked every bot cycle against a live underlying quote;
 *                         exits at the live contract bid ('underlying_stop').
 *   2. premium stop     — the delta-implied premium at that same underlying stop.
 *                         A long option is convex (gamma), so its real mark when the
 *                         underlying reaches the stop is ABOVE the linear estimate:
 *                         the underlying stop normally fires first. The premium stop
 *                         fires first only when theta/IV crush has already cost the
 *                         planned dollars — which is exactly the sized risk.
 *   Whichever fires first exits; both are set from the wide ATR stop, so the
 *   dollar loss is the sized one either way. The DTE-aware soft/hard premium stops
 *   (−25…−75%) do NOT apply to these positions — they would cut a wide-stop trade
 *   inside its own invalidation. With no delta (no greeks) the premium stop falls
 *   back to −fallbackPremStopPct (default 50%, the old swing stop) and the
 *   underlying ATR stop still applies: whichever first.
 *
 * 0DTE sleeve keeps its premium bracket (−40% / +50% breakeven / +100% / 15:45
 * flatten) plus an opening GRACE: in the first N minutes after the fill the −40%
 * stop is not acted on unless the underlying has broken the opening range against
 * the position (or the premium is down past the grace disaster stop, default −70%).
 * Unknown underlying or opening range → no grace (fail safe: the stop applies).
 */

type Env = Record<string, string | undefined>;
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: string | undefined, d: number, lo: number, hi: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** Fallback multiple until research/stop-width-walkforward.ts has chosen one on prod data. */
export const BOT_STOP_ATR_MULT_DEFAULT = 1.5;
export const STOP_ATR_MULT_MIN = 0.5;
export const STOP_ATR_MULT_MAX = 4;

/** A multiple from an env value; unset/blank/garbage → `fallback` (may be null = "not set"). */
export function readStopAtrMult(v: string | undefined, fallback: number | null): number | null {
  if (v == null || String(v).trim() === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(STOP_ATR_MULT_MAX, Math.max(STOP_ATR_MULT_MIN, n));
}

export type Side = 'long' | 'short';
export const sideOf = (direction: string | null | undefined): Side => (/short|bear|put/i.test(String(direction ?? '')) ? 'short' : 'long');

export interface WidenInput { entry: number; stop: number | null | undefined; side: Side; atr: number | null | undefined; mult: number }
export interface WidenResult {
  stop: number;
  /** true when k×ATR was further than the structural level */
  widened: boolean;
  /** the structural (plan) stop, unchanged */
  structural: number | null;
  /** entry ∓ k×ATR, null without an ATR */
  atrStop: number | null;
  basis: 'structural' | 'atr' | 'atr_only';
}

/** stop = the further of the structural level and k×ATR from entry. No ATR → the structural stop unchanged. */
export function widenStop(i: WidenInput): WidenResult | null {
  if (!(fin(i.entry) && i.entry > 0)) return null;
  const structural = fin(i.stop) && i.stop > 0 ? i.stop : null;
  const atrStop = fin(i.atr) && i.atr > 0 && i.mult > 0 ? r2(i.side === 'long' ? i.entry - i.mult * i.atr : i.entry + i.mult * i.atr) : null;
  const okSide = (s: number) => (i.side === 'long' ? s < i.entry : s > i.entry) && s > 0;
  const st = structural != null && okSide(structural) ? structural : null;
  const at = atrStop != null && okSide(atrStop) ? atrStop : null;
  if (st == null && at == null) return null;
  if (at == null) return { stop: st!, widened: false, structural, atrStop, basis: 'structural' };
  if (st == null) return { stop: at, widened: true, structural, atrStop, basis: 'atr_only' };
  const atrFurther = i.side === 'long' ? at < st : at > st;
  return atrFurther
    ? { stop: at, widened: true, structural, atrStop, basis: 'atr' }
    : { stop: st, widened: false, structural, atrStop, basis: 'structural' };
}

// ── bot config ─────────────────────────────────────────────────────────────

export interface BotStopConfig {
  /** BOT_WIDE_STOPS (default on): swing sleeve uses the wide underlying stop. */
  enabled: boolean;
  /** BOT_STOP_ATR_MULT (default 1.5 until the walk-forward picks one). */
  atrMult: number;
  /** BOT_SWING_PREM_STOP_PCT (default 50): premium stop when the contract has no delta. */
  fallbackPremStopPct: number;
  /** BOT_SWING_MAX_PREM_LOSS_PCT (default 80): the delta-implied premium stop never sits below −this%. */
  maxPremLossPct: number;
  /** BOT_0DTE_STOP_GRACE_MIN (default 5, 0 = off): minutes after the fill with no −40% stop … */
  zeroDteGraceMin: number;
  /** BOT_0DTE_OR_MIN (default 5): … unless the underlying breaks the first N-minute opening range. */
  zeroDteOrMin: number;
  /** BOT_0DTE_GRACE_DISASTER_PCT (default 70): the grace never holds a premium down more than this. */
  zeroDteGraceDisasterPct: number;
}

export function readBotStopConfig(env: Env = {}): BotStopConfig {
  const off = String(env.BOT_WIDE_STOPS ?? '').trim().toLowerCase();
  return {
    enabled: !(off === '0' || off === 'false' || off === 'off'),
    atrMult: readStopAtrMult(env.BOT_STOP_ATR_MULT, BOT_STOP_ATR_MULT_DEFAULT)!,
    fallbackPremStopPct: num(env.BOT_SWING_PREM_STOP_PCT, 50, 5, 95) / 100,
    maxPremLossPct: num(env.BOT_SWING_MAX_PREM_LOSS_PCT, 80, 20, 100) / 100,
    zeroDteGraceMin: Math.round(num(env.BOT_0DTE_STOP_GRACE_MIN, 5, 0, 60)),
    zeroDteOrMin: Math.round(num(env.BOT_0DTE_OR_MIN, 5, 1, 60)),
    zeroDteGraceDisasterPct: num(env.BOT_0DTE_GRACE_DISASTER_PCT, 70, 41, 100) / 100,
  };
}

// ── options: premium stop from the wide underlying stop ────────────────────

export interface PremiumStopInput {
  premium: number;
  /** contract delta (signed or not), null when the chain had no greeks */
  delta: number | null | undefined;
  underlyingEntry: number;
  underlyingStop: number;
}
export interface PremiumStop {
  stop: number;
  basis: 'delta' | 'fallback';
  /** dollars lost per contract at the premium stop — what sizing divides the risk budget by */
  riskPerContract: number;
}

export function optionPremiumStop(i: PremiumStopInput, cfg: Pick<BotStopConfig, 'fallbackPremStopPct' | 'maxPremLossPct'>): PremiumStop | null {
  if (!(fin(i.premium) && i.premium > 0)) return null;
  const d = fin(i.delta) ? Math.abs(i.delta) : NaN;
  const dist = Math.abs(i.underlyingEntry - i.underlyingStop);
  let stop: number, basis: PremiumStop['basis'];
  if (d > 0 && d <= 1 && dist > 0) {
    const floor = i.premium * (1 - cfg.maxPremLossPct);
    stop = Math.max(floor, i.premium - d * dist);
    basis = 'delta';
  } else {
    stop = i.premium * (1 - cfg.fallbackPremStopPct);
    basis = 'fallback';
  }
  stop = Math.max(0.01, Math.min(stop, i.premium - 0.01));
  return { stop: r2(stop), basis, riskPerContract: r2((i.premium - r2(stop)) * 100) };
}

/** Contracts / shares that keep the dollar risk at `riskUsd` (0 = even one is too much). */
export function sizeForRisk(riskUsd: number, riskPerUnit: number, maxUnits = Infinity): number {
  if (!(riskUsd > 0) || !(riskPerUnit > 0)) return 0;
  return Math.max(0, Math.min(maxUnits, Math.floor(riskUsd / riskPerUnit + 1e-9)));
}

// ── the underlying stop on a held contract ──────────────────────────────────

/** Has the live underlying reached the stop against the thesis side? */
export function underlyingStopCrossed(side: Side, live: number | null | undefined, stop: number | null | undefined): boolean {
  if (!(fin(live) && live > 0) || !(fin(stop) && stop > 0)) return false;
  return side === 'long' ? live <= stop : live >= stop;
}

/** Position entry-signal tag carrying the underlying stop: `ustop:long:412.35`. */
export function ustopTag(side: Side, stop: number): string { return `ustop:${side}:${r2(stop)}`; }

export function parseUstopTag(entrySignals: string | string[] | null | undefined): { side: Side; stop: number } | null {
  let arr: unknown = entrySignals;
  if (typeof entrySignals === 'string') { try { arr = JSON.parse(entrySignals); } catch { return null; } }
  if (!Array.isArray(arr)) return null;
  for (const s of arr) {
    const m = /^ustop:(long|short):([0-9]+(?:\.[0-9]+)?)$/.exec(String(s));
    if (m && Number(m[2]) > 0) return { side: m[1] as Side, stop: Number(m[2]) };
  }
  return null;
}

// ── 0DTE opening grace ─────────────────────────────────────────────────────

export interface GraceInput {
  entryMs: number;
  nowMs: number;
  /** thesis side on the underlying (call = long, put = short) */
  side: Side;
  premiumEntry: number;
  premiumMark: number;
  underlying: number | null | undefined;
  orHigh: number | null | undefined;
  orLow: number | null | undefined;
}
export interface GraceVerdict { hold: boolean; reason: string }

/**
 * Should a −40% premium stop be held off? Only inside the grace minutes after the
 * fill, only while the underlying is inside (or on the right side of) the opening
 * range, and never past the grace disaster stop. Anything unknown → no grace.
 */
export function zeroDteGrace(i: GraceInput, cfg: Pick<BotStopConfig, 'zeroDteGraceMin' | 'zeroDteGraceDisasterPct'>): GraceVerdict {
  if (!(cfg.zeroDteGraceMin > 0)) return { hold: false, reason: 'grace off' };
  const mins = (i.nowMs - i.entryMs) / 60_000;
  if (!fin(mins) || mins < 0 || mins >= cfg.zeroDteGraceMin) return { hold: false, reason: 'past the grace window' };
  if (fin(i.premiumMark) && fin(i.premiumEntry) && i.premiumMark <= i.premiumEntry * (1 - cfg.zeroDteGraceDisasterPct)) {
    return { hold: false, reason: `premium past the −${Math.round(cfg.zeroDteGraceDisasterPct * 100)}% grace disaster stop` };
  }
  if (!(fin(i.underlying) && i.underlying > 0) || !(fin(i.orHigh) && fin(i.orLow)) || !(i.orHigh! >= i.orLow!)) {
    return { hold: false, reason: 'no live underlying / opening range — stop applies' };
  }
  const broke = i.side === 'long' ? i.underlying < i.orLow! : i.underlying > i.orHigh!;
  if (broke) return { hold: false, reason: `underlying ${i.underlying} broke the opening range ${i.side === 'long' ? `low ${i.orLow}` : `high ${i.orHigh}`}` };
  return { hold: true, reason: `${mins.toFixed(1)}m after fill (< ${cfg.zeroDteGraceMin}m) and underlying inside the opening range ${i.orLow}–${i.orHigh}` };
}

/** Opening range (high/low) of the first `orMin` minutes from 09:30 ET, from intraday bars (t = bar start, ms). */
export function openingRange(bars: Array<{ t: number; h: number; l: number }>, sessionOpenMs: number, orMin: number): { high: number; low: number } | null {
  const end = sessionOpenMs + orMin * 60_000;
  const inOr = bars.filter((b) => b.t >= sessionOpenMs && b.t < end && fin(b.h) && fin(b.l));
  if (!inOr.length) return null;
  return { high: Math.max(...inOr.map((b) => b.h)), low: Math.min(...inOr.map((b) => b.l)) };
}
