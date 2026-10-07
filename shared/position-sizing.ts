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
 *   options         contracts = floor(risk$ / ((entryPremium − premiumStop) × 100))
 *                   premiumStop = the plan's premium stop when it has one, else
 *                   −40% of premium for 0DTE, −50% for anything longer.
 *
 * A position that cannot be bought inside the budget is NOT forced in at a
 * larger risk: one share / one contract whose risk to the stop exceeds risk$ is
 * reported "too expensive for the risk budget" and left out of the risk-sized
 * book (and counted, so nothing disappears silently). Futures carry an unknown
 * multiplier here and are not risk-sized.
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
export const MIN_RISK_DOLLARS = 50;
export const MAX_RISK_DOLLARS = 100_000;

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
  | { ok: true; qty: number; riskPerUnit: number; riskDollars: number; notional: number; premiumStop: number | null; premiumStopBasis: string | null }
  | { ok: false; reason: string; riskPerUnit: number | null };

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
    const n = Math.floor(riskDollars / perContract + 1e-9);
    if (n < 1) return { ok: false, reason: `too expensive for risk budget — 1 contract risks $${Math.round(perContract)} to its stop (${ps.basis})`, riskPerUnit: perContract };
    return { ok: true, qty: n, riskPerUnit: perContract, riskDollars: n * perContract, notional: n * b.entryPremium! * 100, premiumStop: ps.stop, premiumStopBasis: ps.basis };
  }
  if (!fin(b.entry) || b.entry <= 0) return { ok: false, reason: 'no entry price', riskPerUnit: null };
  if (!fin(b.stop) || b.stop <= 0) return { ok: false, reason: 'no stop — cannot size to risk', riskPerUnit: null };
  const perUnit = Math.abs(b.entry - b.stop);
  if (!(perUnit > 0)) return { ok: false, reason: 'stop equals entry — cannot size to risk', riskPerUnit: null };
  const raw = riskDollars / perUnit;
  const qty = b.assetType === 'crypto' ? Math.floor(raw * 1e6) / 1e6 : Math.floor(raw + 1e-9);
  if (!(qty > 0)) return { ok: false, reason: `too expensive for risk budget — 1 share risks $${perUnit.toFixed(2)} to its stop`, riskPerUnit: perUnit };
  return { ok: true, qty, riskPerUnit: perUnit, riskDollars: qty * perUnit, notional: qty * b.entry, premiumStop: null, premiumStopBasis: null };
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

export function sizingLabel(c: SizingChoice): string {
  return c.mode === 'unit' ? 'Unit' : `Risk $${c.riskDollars.toLocaleString('en-US')}`;
}
