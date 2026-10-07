/**
 * EQUAL-RISK POSITION SIZING — the same dollars at risk on every idea.
 *
 * Operator ask (2026-10-07): "the journal should risk only $500–1,000 per
 * trade". The unit book (1 contract / $1,000 notional) lets a $30 contract and a
 * $0.40 contract count the same, and a 0.3%-wide stop risk ~$3 while a 6% stop
 * risks ~$60. Equal risk answers "what would this book have made if every idea
 * risked the same $R to its stop?".
 *
 *   stocks / ETFs   qty = floor(risk$ / |entry − stop|)        (whole shares)
 *   crypto          qty = risk$ / |entry − stop|               (fractional)
 *   options         contracts = floor(budget$ / (entryPremium × 100))   (whole only)
 *                   premiumStop = the plan's premium stop when it has one, else
 *                   −40% of premium for 0DTE, −50% for anything longer.
 *
 * OPTIONS ARE NEVER FRACTIONAL (operator 2026-10-07): when one contract's debit
 * exceeds the budget the idea is "over budget" (ok:false, overBudget) and the
 * budget contract (shared/budget-contract.ts) is what the budget buys. A STOCK
 * whose single share risks more than risk$ is still fractionally sized
 * ("scaled") — its P&L is the 1-unit P&L × that fraction.
 * No trade may lose more than its risk budget: a recorded exit WORSE than the
 * stop (gap, held past the premium stop) is capped at −risk-to-stop and
 * labelled "capped at stop" (it assumes the stop filled at its level); the
 * uncapped figure is kept on the row so the cap is never hidden. Futures carry
 * an unknown multiplier here and are not risk-sized.
 *
 * Operator decision 2026-10-07: Risk $500 is the DEFAULT for the NEXUS ideas
 * book; $1,000 is the most a custom budget may be; "Unit" stays as a secondary
 * view.
 *
 * Pure: no I/O. Used by the journal (client/src/lib/journal/use-journal.ts via
 * shared/desk-view.ts) and research/managed-exit-replay.ts.
 */

export type SizingMode = 'unit' | 'risk';

/** Journal NEXUS-book sizing choice. */
export interface SizingChoice {
  mode: SizingMode;
  /** Dollars at risk to the stop per idea (risk mode). */
  riskDollars: number;
}

export const RISK_PRESETS = [500, 1000] as const;
export const UNIT_SIZING: SizingChoice = { mode: 'unit', riskDollars: 0 };
export const DEFAULT_RISK_DOLLARS = 500;
export const DEFAULT_SIZING: SizingChoice = { mode: 'risk', riskDollars: DEFAULT_RISK_DOLLARS };
export const MIN_RISK_DOLLARS = 50;
/** Operator ceiling: NEXUS never risks more than $1,000 per trade. */
export const MAX_RISK_DOLLARS = 1000;

/** Default premium stops when the plan has none (fraction of premium lost). */
export const DEFAULT_PREMIUM_STOP_PCT = { zeroDte: 0.40, swing: 0.50 } as const;

export interface RiskBasis {
  assetType: 'stock' | 'option' | 'crypto' | 'future';
  /** Underlying plan levels (options: the underlying's). */
  entry: number;
  stop: number | null;
  /** Options only. */
  entryPremium?: number | null;
  /** The plan's own premium stop (absolute premium), when it published one. */
  premiumStop?: number | null;
  /** True when the contract expires on the trigger/publish day (−40% default stop). */
  zeroDte?: boolean;
}

export type SizeResult =
  | {
    ok: true; qty: number; riskPerUnit: number; riskDollars: number; notional: number; premiumStop: number | null; premiumStopBasis: string | null;
    /** Fractional: 1 unit risked more than the budget, so P&L is the 1-unit P&L × qty (< 1). */
    scaled: boolean;
  }
  | { ok: false; reason: string; riskPerUnit: number | null;
    /** Options: one contract's debit exceeds the budget — never fractionalized; the budget contract (shared/budget-contract.ts) carries the trade. */
    overBudget?: boolean; debitPerContract?: number };

/** Skip reason for an option whose single contract costs more than the budget. */
export const OVER_BUDGET_REASON = 'primary contract over budget (1 contract debit > budget; see budget contract)';

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function clampRiskDollars(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < MIN_RISK_DOLLARS || n > MAX_RISK_DOLLARS) return null;
  return Math.round(n);
}

/** The premium stop the sizing uses, and where it came from. */
export function effectivePremiumStop(b: Pick<RiskBasis, 'entryPremium' | 'premiumStop' | 'zeroDte'>): { stop: number; basis: string } | null {
  const eP = b.entryPremium;
  if (!fin(eP) || eP <= 0) return null;
  if (fin(b.premiumStop) && b.premiumStop >= 0 && b.premiumStop < eP) return { stop: b.premiumStop, basis: 'plan premium stop' };
  const pct = b.zeroDte ? DEFAULT_PREMIUM_STOP_PCT.zeroDte : DEFAULT_PREMIUM_STOP_PCT.swing;
  return { stop: eP * (1 - pct), basis: `−${Math.round(pct * 100)}% premium (${b.zeroDte ? '0DTE' : 'swing'} default)` };
}

/**
 * Parse a published premium stop out of an idea's quality-signal tags:
 *   prem_stop:2.35          absolute premium
 *   prem_stop:basis:2.35    absolute premium (last number wins)
 *   prem_stop:-40           percent change of the entry premium
 * Anything that is not below the entry premium is ignored.
 */
export function parsePremiumStopTag(tags: readonly (string | null | undefined)[] | null | undefined, entryPremium: number | null | undefined): number | null {
  if (!tags || !fin(entryPremium) || entryPremium <= 0) return null;
  for (const t of tags) {
    if (typeof t !== 'string' || !t.startsWith('prem_stop:')) continue;
    const nums = t.slice('prem_stop:'.length).split(':').map(Number).filter((x) => Number.isFinite(x));
    const v = nums[nums.length - 1];
    if (v == null) continue;
    if (v < 0 && v > -100) return entryPremium * (1 + v / 100);
    if (v > 0 && v < entryPremium) return v;
  }
  return null;
}

/** Equal-risk size of one idea. */
export function sizeForRisk(b: RiskBasis, riskDollars: number): SizeResult {
  if (!(riskDollars > 0)) return { ok: false, reason: 'no risk budget', riskPerUnit: null };
  if (b.assetType === 'future') return { ok: false, reason: 'futures are not risk-sized (contract multiplier unknown)', riskPerUnit: null };
  if (b.assetType === 'option') {
    const ps = effectivePremiumStop(b);
    if (!ps) return { ok: false, reason: 'no entry premium to size from', riskPerUnit: null };
    const perContract = (b.entryPremium! - ps.stop) * 100;
    if (!(perContract > 0)) return { ok: false, reason: 'premium stop is not below the entry premium', riskPerUnit: null };
    // Whole contracts only, and the DEBIT must fit the budget (operator 2026-10-07:
    // never a fractional contract). debit ≥ risk-to-stop, so risk ≤ budget too.
    const debitPer = b.entryPremium! * 100;
    const n = Math.floor(riskDollars / debitPer + 1e-9);
    if (n < 1) {
      return { ok: false, reason: OVER_BUDGET_REASON, riskPerUnit: perContract, overBudget: true, debitPerContract: debitPer };
    }
    return { ok: true, qty: n, riskPerUnit: perContract, riskDollars: n * perContract, notional: n * debitPer, premiumStop: ps.stop, premiumStopBasis: ps.basis, scaled: false };
  }
  if (!fin(b.entry) || b.entry <= 0) return { ok: false, reason: 'no entry price', riskPerUnit: null };
  if (!fin(b.stop) || b.stop <= 0) return { ok: false, reason: 'no stop — cannot size to risk', riskPerUnit: null };
  const perUnit = Math.abs(b.entry - b.stop);
  if (!(perUnit > 0)) return { ok: false, reason: 'stop equals entry — cannot size to risk', riskPerUnit: null };
  const raw = riskDollars / perUnit;
  const whole = Math.floor(raw + 1e-9);
  const scaled = b.assetType !== 'crypto' && whole < 1;
  const qty = b.assetType === 'crypto' || scaled ? Math.floor(raw * 1e6) / 1e6 : whole;
  if (!(qty > 0)) return { ok: false, reason: 'risk budget too small for this stop', riskPerUnit: perUnit };
  return { ok: true, qty, riskPerUnit: perUnit, riskDollars: qty * perUnit, notional: qty * b.entry, premiumStop: null, premiumStopBasis: null, scaled };
}

/**
 * P&L of a unit-sized result re-expressed at the risk size: the unit book holds
 * `unitQty` (1 contract, or $1,000 / entry shares); the risk book holds
 * `sized.qty` of the same instrument, so P&L scales by their ratio.
 */
export function scaleUnitPnl(unitPnl: number | null, unitQty: number, sized: SizeResult): number | null {
  if (unitPnl == null || !sized.ok || !(unitQty > 0)) return null;
  return Math.round(unitPnl * (sized.qty / unitQty) * 100) / 100;
}

/**
 * Risk-sized P&L with the loss cap: never below −(risk to stop). Returns the
 * capped value, the uncapped value, and whether the cap bit.
 */
export function riskSizedPnl(unitPnl: number | null, unitQty: number, sized: SizeResult): { pnl: number | null; uncapped: number | null; capped: boolean } {
  const raw = scaleUnitPnl(unitPnl, unitQty, sized);
  if (raw == null || !sized.ok) return { pnl: raw, uncapped: raw, capped: false };
  const floor = -Math.round(sized.riskDollars * 100) / 100;
  return raw < floor - 0.01 ? { pnl: floor, uncapped: raw, capped: true } : { pnl: raw, uncapped: raw, capped: false };
}

/**
 * Risk-sized $ P&L of an idea from its % result (Discord exit posts / recap):
 * options from the contract % (unit = 1 contract), stocks from the underlying %
 * (unit = $1,000 notional). Null when it cannot be sized or priced.
 */
export function riskSizedFromPct(a: {
  isOption: boolean; entry: number | null; stop: number | null; premium: number | null; zeroDte: boolean;
  underlyingPct: number | null; optionPct: number | null;
}, riskDollars: number): { pnl: number; scaled: boolean; capped: boolean; qty: number } | null {
  if (a.isOption) {
    if (a.optionPct == null || !(a.premium != null && a.premium > 0)) return null;
    const sz = sizeForRisk({ assetType: 'option', entry: a.entry ?? 0, stop: a.stop, entryPremium: a.premium, zeroDte: a.zeroDte }, riskDollars);
    if (!sz.ok) return null;
    const r = riskSizedPnl(a.premium * 100 * (a.optionPct / 100), 1, sz);
    return r.pnl == null ? null : { pnl: r.pnl, scaled: sz.scaled, capped: r.capped, qty: sz.qty };
  }
  if (a.underlyingPct == null || !(a.entry != null && a.entry > 0)) return null;
  const sz = sizeForRisk({ assetType: 'stock', entry: a.entry, stop: a.stop }, riskDollars);
  if (!sz.ok) return null;
  const r = riskSizedPnl(1000 * (a.underlyingPct / 100), 1000 / a.entry, sz);
  return r.pnl == null ? null : { pnl: r.pnl, scaled: sz.scaled, capped: r.capped, qty: sz.qty };
}

/** NEXUS_RISK_DOLLARS (server): the per-trade risk the Discord $ figures use; default $500, max $1,000. */
export function readNexusRiskDollars(env: Record<string, string | undefined> = {}): number {
  return clampRiskDollars(env.NEXUS_RISK_DOLLARS) ?? DEFAULT_RISK_DOLLARS;
}

/** URL / query form: "unit" | "risk:500". */
export function sizingParam(c: SizingChoice): string {
  return c.mode === 'unit' ? 'unit' : `risk:${c.riskDollars}`;
}

/** Parse "unit" | "risk:<$>" — anything else (or a budget outside $50–$1,000) → the $500 default. */
export function parseSizingParam(raw: string | null | undefined): SizingChoice {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'unit') return UNIT_SIZING;
  const m = v.match(/^risk:(\d+(?:\.\d+)?)$/);
  const d = m ? clampRiskDollars(m[1]) : null;
  return d != null ? { mode: 'risk', riskDollars: d } : DEFAULT_SIZING;
}

export function sizingLabel(c: SizingChoice): string {
  return c.mode === 'unit' ? 'Unit' : `Risk $${c.riskDollars.toLocaleString('en-US')}`;
}
