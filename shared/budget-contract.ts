/**
 * BUDGET CONTRACT — a real, whole-contract, liquid option the risk budget can
 * actually buy, picked and tracked BESIDE the idea's primary contract.
 *
 * WHY (operator, 2026-10-07): NEXUS picked MU 11/20 1100C at $39.65 ($3,965 per
 * contract) and the $500–1,000 per-trade budget then FRACTIONALIZED it (0.12 of
 * a contract). Nobody can buy 0.12 of a contract. The primary (swing / quality)
 * contract stays as published; the budget contract is what $500–1,000 buys.
 *
 * THE RULE (pure — the server loads the chain)
 *   • whole contracts only: qty = floor(budget / (mid × 100)) ≥ 1
 *   • passes the option liquidity gate (shared/option-liquidity.ts)
 *   • |delta| in [0.15, 0.45]
 *   • expiry: ≥ 1 DTE unless the idea is itself a 0DTE desk idea
 *     (shared/short-dated-option.ts); day ideas may take the nearest weekly;
 *     swing / position ideas need DTE ≥ the time stop (hold days)
 *   • objective: projected payoff at T1 per dollar of debit
 *     ((premium at T1 − mid) / mid), tie → higher |delta|, then cheaper.
 *   Premium T1 / T2 / stop are mapped from the underlying levels: Black-Scholes
 *   re-pricing of the CHANGE from the live mid when the row has an IV (the
 *   Contract Engine's method, shared/contract-engine.ts), else first-order
 *   delta + ½·gamma (stated in `mapping`). Never below intrinsic. The premium
 *   stop is the higher of the mapped underlying stop and the default premium
 *   stop (−50% swing, −40% 0DTE; shared/position-sizing.ts).
 *
 * Stored on the idea at convergenceSignalsJson.budgetContract (no migration).
 * Tracking (peak / T1 / T2 / stop) is written back into the same object by
 * server/option-peak-job.ts.
 */
import { bsPrice } from './iv-fill';
import { checkContractLiquidity, contractLabel, readLiquidityConfig, type ContractLiquiditySnapshot, type LiquidityConfig } from './option-liquidity';
import { DEFAULT_PREMIUM_STOP_PCT, DEFAULT_RISK_DOLLARS, MAX_RISK_DOLLARS, MIN_RISK_DOLLARS } from './position-sizing';

export const BUDGET_CONTRACT_VERSION = 'budget-v1';
export const BUDGET_DELTA_MIN = 0.15;
export const BUDGET_DELTA_MAX = 0.45;

type Env = Record<string, string | undefined>;

/** BUDGET_CONTRACT feature flag — default ON (pure, additive, never changes the primary). off|0|false disables. */
export function budgetContractEnabled(env: Env = typeof process !== 'undefined' ? process.env : {}): boolean {
  return !/^(0|false|off|no)$/i.test(String(env.BUDGET_CONTRACT ?? '').trim());
}

export interface BudgetChainRow {
  type: 'call' | 'put';
  strike: number;
  expiry: string; // YYYY-MM-DD
  bid: number | null;
  ask: number | null;
  delta: number | null;
  gamma?: number | null;
  /** Annualised implied vol (0.55 = 55%). */
  iv?: number | null;
  openInterest: number | null;
  volume: number | null;
  prevVolume?: number | null;
  /** Calendar DTE. */
  dte: number;
  occ?: string | null;
}

export interface BudgetContractInput {
  symbol: string;
  direction: 'long' | 'short';
  spot: number;
  t1: number;
  t2?: number | null;
  stop: number | null;
  /** Dollars the trade may spend (whole-contract debit cap). Clamped to $50–$1,000; default $500. */
  budget?: number | null;
  holding: 'day' | 'swing' | 'position';
  /** Days the idea expects to hold (time stop). Swing/position need DTE ≥ this. */
  holdDays?: number | null;
  /** True only for a same-day (0DTE) desk idea — the only case a 0 DTE contract is allowed. */
  zeroDteIdea?: boolean;
  rows: BudgetChainRow[];
  nowMs: number;
  liqCfg?: LiquidityConfig;
  source?: string;
  asOf?: string;
}

export interface BudgetTracking {
  /** Best premium seen after entry (bar high / quote). */
  peak?: { premium: number; atMs: number; basis: 'bar' | 'quote'; source: string } | null;
  t1HitAt?: number | null;
  t2HitAt?: number | null;
  stopHitAt?: number | null;
  /** First barrier reached: which one decided the budget contract's outcome. */
  outcome?: 'hit_t2' | 'hit_t1' | 'hit_stop' | 'open' | 'expired';
  lastMark?: number | null;
  lastMarkAt?: number | null;
  updatedAt?: number | null;
}

export interface BudgetContract {
  v: typeof BUDGET_CONTRACT_VERSION;
  symbol: string;
  label: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  occ: string | null;
  qty: number;
  entryPremium: number;
  debit: number;
  budget: number;
  delta: number;
  premiumT1: number;
  premiumT2: number | null;
  premiumStop: number;
  /** Projected $ gain at T1 for the whole position. */
  payoffAtT1: number;
  /** (premium at T1 − entry) / entry. */
  payoffPerDollar: number;
  /** Debit lost at the premium stop, whole position. */
  riskToStop: number;
  mapping: string;
  rationale: string;
  liquidity: ContractLiquiditySnapshot;
  chosenAt: string;
  source: string;
  tracking?: BudgetTracking;
}

export type BudgetPickResult =
  | { ok: true; pick: BudgetContract; considered: number }
  | { ok: false; reason: string; considered: number };

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;

export function clampBudget(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RISK_DOLLARS;
  return Math.round(Math.min(MAX_RISK_DOLLARS, Math.max(MIN_RISK_DOLLARS, n)));
}

/** Whole contracts a budget buys at a premium. 0 when one contract costs more than the budget. Never fractional. */
export function wholeContracts(budget: number, premium: number): number {
  if (!(budget > 0) || !(premium > 0)) return 0;
  return Math.floor(budget / (premium * 100) + 1e-9);
}

/** Minimum DTE the budget contract needs for this idea. */
export function minDteFor(i: Pick<BudgetContractInput, 'holding' | 'holdDays' | 'zeroDteIdea'>): number {
  if (i.zeroDteIdea) return 0;
  if (i.holding === 'day') return 1;
  const hold = fin(i.holdDays) && i.holdDays > 0 ? Math.ceil(i.holdDays) : 3;
  return Math.max(1, hold);
}

/** Max DTE considered: day → 14 (nearest weeklies), swing → 45, position → 120. */
export function maxDteFor(i: Pick<BudgetContractInput, 'holding' | 'zeroDteIdea'>): number {
  if (i.zeroDteIdea) return 1;
  return i.holding === 'day' ? 14 : i.holding === 'swing' ? 45 : 120;
}

/**
 * Premium of a contract if the underlying moves from `spot` to `level`
 * `elapsedDays` later. BS change-from-mid when the row has an IV, else
 * delta + ½gamma. Never below intrinsic, never below 0.
 */
export function premiumAtLevel(
  row: Pick<BudgetChainRow, 'type' | 'strike' | 'delta' | 'gamma' | 'iv' | 'dte'>,
  mid: number, spot: number, level: number, elapsedDays: number,
): { premium: number; method: 'bs' | 'delta_gamma' | 'delta' } {
  const isCall = row.type === 'call';
  const intrinsic = Math.max(0, isCall ? level - row.strike : row.strike - level);
  if (fin(row.iv) && row.iv > 0) {
    const Tnow = Math.max(0.25, row.dte) / 365;
    const Tlater = Math.max(0.1, row.dte - Math.max(0, elapsedDays)) / 365;
    const now = bsPrice(spot, row.strike, Tnow, row.iv, isCall);
    const later = bsPrice(level, row.strike, Tlater, row.iv, isCall);
    if (fin(now) && fin(later)) return { premium: r2(Math.max(intrinsic, mid + later - now, 0)), method: 'bs' };
  }
  const d = fin(row.delta) ? row.delta : 0;
  const dS = level - spot;
  const g = fin(row.gamma) ? row.gamma : null;
  const p = mid + d * dS + (g != null ? 0.5 * g * dS * dS : 0);
  return { premium: r2(Math.max(intrinsic, p, 0)), method: g != null ? 'delta_gamma' : 'delta' };
}

/** Pick the budget contract. Pure. */
export function pickBudgetContract(input: BudgetContractInput): BudgetPickResult {
  const budget = clampBudget(input.budget);
  const cfg = input.liqCfg ?? readLiquidityConfig({});
  const type: 'call' | 'put' = input.direction === 'long' ? 'call' : 'put';
  const sgn = type === 'call' ? 1 : -1;
  if (!(input.spot > 0) || !(input.t1 > 0)) return { ok: false, reason: 'no spot / T1 to map premium from', considered: 0 };
  if (sgn * (input.t1 - input.spot) <= 0) return { ok: false, reason: 'T1 is not beyond spot in the trade direction', considered: 0 };
  const minDte = minDteFor(input);
  const maxDte = Math.max(minDte, maxDteFor(input));
  // Elapsed time to T1: intraday for day/0DTE ideas, else half the hold.
  const toT1Days = input.zeroDteIdea || input.holding === 'day' ? 0.25 : Math.max(0.5, (fin(input.holdDays) ? input.holdDays : 3) / 2);
  const toT2Days = input.zeroDteIdea || input.holding === 'day' ? 0.25 : Math.max(1, fin(input.holdDays) ? input.holdDays : 3);
  const stopPct = input.zeroDteIdea ? DEFAULT_PREMIUM_STOP_PCT.zeroDte : DEFAULT_PREMIUM_STOP_PCT.swing;

  type Cand = { row: BudgetChainRow; mid: number; qty: number; t1: number; t2: number | null; stop: number; ppd: number; method: string; liq: ContractLiquiditySnapshot };
  const cands: Cand[] = [];
  let considered = 0;
  const rejects = { band: 0, dte: 0, budget: 0, liquidity: 0, payoff: 0 };
  for (const row of input.rows) {
    if (row.type !== type) continue;
    considered++;
    if (!(row.dte >= minDte && row.dte <= maxDte)) { rejects.dte++; continue; }
    if (!fin(row.delta) || Math.abs(row.delta) < BUDGET_DELTA_MIN - 1e-9 || Math.abs(row.delta) > BUDGET_DELTA_MAX + 1e-9) { rejects.band++; continue; }
    if (!(fin(row.bid) && fin(row.ask) && row.bid > 0 && row.ask >= row.bid)) { rejects.liquidity++; continue; }
    const mid = r2((row.bid + row.ask) / 2);
    const qty = wholeContracts(budget, mid);
    if (qty < 1) { rejects.budget++; continue; }
    const label = contractLabel(input.symbol, row.expiry, row.strike, row.type);
    const liq = checkContractLiquidity(
      { symbol: input.symbol, openInterest: row.openInterest, volume: row.volume, prevVolume: row.prevVolume, bid: row.bid, ask: row.ask, dte: row.dte },
      { nowMs: input.nowMs, cfg, source: input.source, asOf: input.asOf, contract: label },
    );
    if (cfg.enabled && !liq.ok) { rejects.liquidity++; continue; }
    const t1 = premiumAtLevel(row, mid, input.spot, input.t1, toT1Days);
    const t2 = fin(input.t2) && input.t2 > 0 ? premiumAtLevel(row, mid, input.spot, input.t2, toT2Days).premium : null;
    const mappedStop = fin(input.stop) && input.stop > 0 ? premiumAtLevel(row, mid, input.spot, input.stop, toT1Days).premium : 0;
    const stop = r2(Math.min(mid - 0.01, Math.max(mappedStop, mid * (1 - stopPct))));
    const ppd = (t1.premium - mid) / mid;
    if (!(ppd > 0)) { rejects.payoff++; continue; }
    cands.push({ row, mid, qty, t1: t1.premium, t2, stop, ppd, method: t1.method, liq: { ...liq.snapshot, action: 'kept' } });
  }
  if (!cands.length) {
    const why = Object.entries(rejects).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
    return { ok: false, reason: `no ${type} fits $${budget} whole-contract budget (${why || 'empty chain'})`, considered };
  }
  cands.sort((a, b) => b.ppd - a.ppd || Math.abs(b.row.delta!) - Math.abs(a.row.delta!) || a.mid - b.mid);
  const c = cands[0];
  const debit = r2(c.qty * c.mid * 100);
  const method = c.method === 'bs' ? 'Black-Scholes re-price from mid at the row IV' : c.method === 'delta_gamma' ? 'delta + ½gamma (no IV on row)' : 'first-order delta (no IV/gamma on row; understates convexity)';
  const label = contractLabel(input.symbol, c.row.expiry, c.row.strike, c.row.type);
  const pick: BudgetContract = {
    v: BUDGET_CONTRACT_VERSION,
    symbol: input.symbol.toUpperCase(),
    label,
    optionType: c.row.type,
    strike: c.row.strike,
    expiry: c.row.expiry.slice(0, 10),
    dte: c.row.dte,
    occ: c.row.occ ?? null,
    qty: c.qty,
    entryPremium: c.mid,
    debit,
    budget,
    delta: r2(c.row.delta!),
    premiumT1: c.t1,
    premiumT2: c.t2,
    premiumStop: c.stop,
    payoffAtT1: r2(c.qty * (c.t1 - c.mid) * 100),
    payoffPerDollar: Math.round(c.ppd * 1000) / 1000,
    riskToStop: r2(c.qty * (c.mid - c.stop) * 100),
    mapping: method,
    rationale: `${c.qty}× ${label} @ $${c.mid.toFixed(2)} = $${debit.toFixed(0)} of $${budget} budget · Δ${Math.abs(c.row.delta!).toFixed(2)} · ${c.row.dte} DTE`
      + ` · T1 $${input.t1} → ~$${c.t1.toFixed(2)} (+${Math.round(c.ppd * 100)}%/$) · best of ${cands.length} liquid whole-contract candidates`,
    liquidity: c.liq,
    chosenAt: new Date(input.nowMs).toISOString(),
    source: input.source ?? 'unknown',
  };
  return { ok: true, pick, considered };
}

// ── tracking (pure) ─────────────────────────────────────────────────────────

export interface TrackBar { t: number; o: number; h: number; l: number; c: number }

/**
 * Follow the budget contract on its own bars from entry: peak (max high), and
 * the first touch of premium T1 / T2 / stop. Barriers are on the CONTRACT's
 * premium (the budget contract's own plan). Earlier tracking is merged: a peak
 * only rises; a hit time once set is kept.
 */
export function trackBudgetContract(bc: BudgetContract, bars: TrackBar[], fromMs: number, toMs: number, source: string, nowMs: number): BudgetTracking {
  const prev = bc.tracking ?? {};
  const out: BudgetTracking = { ...prev };
  const sorted = bars.filter((b) => fin(b.t) && b.t >= fromMs && b.t < toMs).sort((a, b) => a.t - b.t);
  for (const b of sorted) {
    if (fin(b.h) && b.h > 0 && (!out.peak || b.h > out.peak.premium + 1e-9)) out.peak = { premium: r2(b.h), atMs: b.t, basis: 'bar', source };
    const stopped = out.stopHitAt != null && (out.t1HitAt == null || out.stopHitAt < out.t1HitAt);
    if (!stopped) {
      if (out.t1HitAt == null && fin(b.h) && b.h >= bc.premiumT1 - 1e-9) out.t1HitAt = b.t;
      if (out.t2HitAt == null && bc.premiumT2 != null && fin(b.h) && b.h >= bc.premiumT2 - 1e-9) out.t2HitAt = b.t;
    }
    if (out.stopHitAt == null && out.t1HitAt == null && fin(b.l) && b.l <= bc.premiumStop + 1e-9) out.stopHitAt = b.t;
    out.lastMark = b.c; out.lastMarkAt = b.t;
  }
  out.outcome = out.t2HitAt != null ? 'hit_t2'
    : out.t1HitAt != null ? 'hit_t1'
      : out.stopHitAt != null ? 'hit_stop'
        : Date.parse(`${bc.expiry}T20:00:00Z`) < nowMs ? 'expired' : 'open';
  out.updatedAt = nowMs;
  return out;
}

// ── display ─────────────────────────────────────────────────────────────────

const mmdd = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
const cp = (t: string) => (t === 'put' ? 'P' : 'C');

/** "11/20 1100C" */
export function shortContract(expiry: string | null | undefined, strike: number | null | undefined, type: string | null | undefined): string {
  return `${expiry ? mmdd(String(expiry).slice(0, 10)) : '?'} ${strike ?? '?'}${cp(String(type ?? '').toLowerCase().startsWith('p') ? 'put' : 'call')}`;
}

/** "Primary: 11/20 1100C $39.65 (over budget)" */
export function primaryLine(p: { expiry?: string | null; strike?: number | null; optionType?: string | null; entryPremium?: number | null }, budget: number): string | null {
  if (p.strike == null || !p.expiry) return null;
  const prem = fin(p.entryPremium) ? p.entryPremium : null;
  const over = prem != null && wholeContracts(budget, prem) < 1;
  return `Primary: ${shortContract(p.expiry, p.strike, p.optionType)}${prem != null ? ` $${prem.toFixed(2)}` : ''}${over ? ' (over budget)' : ''}`;
}

/** "Budget: 10/09 1090C ×2 @ $1.93 · $386 debit · peak $17.30 · T1 hit" */
export function budgetLine(bc: BudgetContract | null | undefined): string | null {
  if (!bc || bc.v !== BUDGET_CONTRACT_VERSION) return null;
  const tr = bc.tracking;
  const status = !tr ? '' : tr.outcome === 'hit_t2' ? ' · T2 hit' : tr.outcome === 'hit_t1' ? ' · T1 hit' : tr.outcome === 'hit_stop' ? ' · stopped' : tr.outcome === 'expired' ? ' · expired' : ' · open';
  const peak = tr?.peak ? ` · peak $${tr.peak.premium.toFixed(2)} (${tr.peak.premium >= bc.entryPremium ? '+' : ''}${Math.round((tr.peak.premium / bc.entryPremium - 1) * 100)}%)` : '';
  return `Budget: ${shortContract(bc.expiry, bc.strike, bc.optionType)} ×${bc.qty} @ $${bc.entryPremium.toFixed(2)} · $${bc.debit.toFixed(0)} debit · T1 $${bc.premiumT1.toFixed(2)} · stop $${bc.premiumStop.toFixed(2)}${peak}${status}`;
}

/** Read a stored budget contract off an idea's convergence JSON (object or string). */
export function readBudgetContract(convergenceSignalsJson: unknown): BudgetContract | null {
  let cs: any = convergenceSignalsJson;
  if (typeof cs === 'string') { try { cs = JSON.parse(cs); } catch { return null; } }
  const bc = cs?.budgetContract;
  return bc && bc.v === BUDGET_CONTRACT_VERSION && fin(bc.strike) && fin(bc.entryPremium) && fin(bc.qty) && bc.qty >= 1 ? bc as BudgetContract : null;
}
