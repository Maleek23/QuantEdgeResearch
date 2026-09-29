/**
 * CONTRACT ENGINE — one ranked list, one set of limits, transparent grades.
 * ==========================================================================
 * Pure core (no I/O). server/contract-engine.ts fetches the chain and calls
 * `rankContracts`; the client imports the types and presets from here.
 *
 * WHY THIS EXISTS (operator, 2026-09-29 — "fix this into one entity"):
 *   The Contract Engine rendered two pickers with two account inputs ($10,000
 *   vs $5,000) and two conflicting caps (max debit $300 vs a ≤$250 chip), four
 *   tiers all graded F with no explanation, tiers whose premiums ($3,005 and
 *   $1,738 per contract) blew straight through the stated max debit, and an
 *   empty state that contradicted the list above it.
 *
 * WHY EVERYTHING WAS "F" (the old grade, server/option-selection-engine.ts):
 *   score = 0.40·R:R + 0.25·reach + 0.20·liquidity + 0.15·delta-fit
 *           − 30 if the contract does not fit the account
 *           − 12 if the strike sits beyond T1, − 8 DTE fallback, …
 *   and F = score < 40. The four tiers were chosen by DELTA ALONE — the account
 *   limits never influenced which contract was picked — and then every pick
 *   was docked 30 points for not fitting those limits. With a $300 max debit
 *   the cheapest tier on the screen was $488/contract, so all four carried the
 *   −30 and landed in F regardless of how good the contract was. The grade was
 *   really "does not fit your account" printed as a quality letter, and because
 *   R:R was measured only against a −50% premium stop (and the OTM tiers took a
 *   further −12 for a strike past T1) nothing could climb back out.
 *
 * THE FIX — limits and quality are separate things:
 *   1. LIMITS are hard rules, applied FIRST. A contract either fits (max debit,
 *      max loss at the stop, account size) or it goes to the separate
 *      "outside your limits" group carrying the exact rule it broke
 *      ("debit $3,005 > max $300"). Limits never touch the grade.
 *   2. GRADE is contract quality only, built from four visible components,
 *      each 0–100 with its own letter and a one-line reason:
 *        reach     30%  half P(underlying TOUCHES T1 before expiry), half
 *                       P(it FINISHES beyond this contract's breakeven) — the
 *                       first is the thesis, the second is what this strike
 *                       needs. Driftless, from the expiry's ATM IV σ:
 *                       EM = spot·σ·√t, P(touch) ≈ 2·(1 − N(|T1 − spot|/EM)),
 *                       P(beyond BE) ≈ 1 − N((BE − spot)/EM) (signed toward the
 *                       trade). score = 50·min(1, Ptouch/0.70) + 50·min(1, Pbe/0.50).
 *        payoff    30%  R:R to T1 = (modelled premium at T1 − mid) / planned
 *                       loss per share. score = min(1, R:R/2.5)·100.
 *        liquidity 20%  spread 60% (≤2% of mid = full, ≥25% = zero) ·
 *                       open interest 25% (log10, 10k = full) ·
 *                       volume 15% (log10, 1k = full). Unknown OI scores the
 *                       neutral middle and says so.
 *        cost      20%  theta burn over the hold as % of premium 75%
 *                       (≤2% = full, ≥20% = zero) · IV vs the same expiry's
 *                       ATM IV 25% (≤1.0× full, ≥1.5× zero). IV RANK is not
 *                       computed — no IV-history feed exists — and the UI says so.
 *      Without a target (no idea attached) reach and payoff are "not graded"
 *      and the grade is liquidity+cost only, labelled PARTIAL.
 *      Letters: A ≥ 80 · B ≥ 65 · C ≥ 50 · D ≥ 35 · F < 35 (same for components).
 *   3. TIERS are labels on the ranked rows by |delta|, not a separate picker:
 *        ≥ 0.60 conservative · 0.40–0.60 balanced · 0.22–0.40 aggressive ·
 *        < 0.22 starter (cheap, low-delta).
 *
 * PLANNED LOSS PER CONTRACT ("max loss at the stop"):
 *   min( modelled premium lost if the underlying reaches the idea's stop ,
 *        the −50% premium stop the desk manages to ) × 100.
 *   Whichever exit triggers first bounds the loss. With no stop on the idea,
 *   the −50% premium stop alone. With no IV to model, the −50% stop alone.
 *
 * Never invents data: every number is the chain's own (mid = (bid+ask)/2 of a
 * two-sided quote) or a disclosed model on the chain's own IV.
 */
import { normCdf } from './gex-math';

// ─── Presets ────────────────────────────────────────────────────────────

export interface DtePreset { key: string; label: string; min: number; max: number }

export const DTE_PRESETS: DtePreset[] = [
  { key: '0-7', label: '0–7d', min: 0, max: 7 },
  { key: '8-14', label: '8–14d', min: 8, max: 14 },
  { key: '15-30', label: '15–30d', min: 15, max: 30 },
  { key: '25-45', label: '25–45d', min: 25, max: 45 },
  { key: '46-90', label: '46–90d', min: 46, max: 90 },
  { key: '91-180', label: '3–6mo', min: 91, max: 180 },
  { key: '181-730', label: 'LEAPS', min: 181, max: 730 },
];

/** Default DTE window for an idea's holding period (matches the selection engine's tiers). */
export function dteWindowForHold(holdingLabel?: string | null): { min: number; max: number } {
  const l = (holdingLabel ?? '').toLowerCase();
  if (/leap|year/.test(l)) return { min: 181, max: 730 };
  if (/position|month/.test(l)) return { min: 46, max: 90 };
  if (/scalp|day ?trade|overnight|intraday|lotto/.test(l)) return { min: 8, max: 14 };
  return { min: 25, max: 45 }; // swing and unknown: a month out
}

/** Days the idea expects to be in the trade, used for theta and the T1 projection. */
export function holdDaysForLabel(holdingLabel?: string | null): number {
  const l = (holdingLabel ?? '').toLowerCase();
  const m = l.match(/(\d+)\s*(?:-|–|to)?\s*(\d+)?\s*day/);
  if (m) return Math.max(1, Math.round((Number(m[1]) + Number(m[2] ?? m[1])) / 2));
  if (/week/.test(l)) return 7;
  if (/month|position/.test(l)) return 15;
  if (/leap|year/.test(l)) return 60;
  if (/scalp|day ?trade|intraday|overnight/.test(l)) return 1;
  return 3; // swing
}

// ─── Types ──────────────────────────────────────────────────────────────

export type ContractTier = 'conservative' | 'balanced' | 'aggressive' | 'starter';
export type Letter = 'A' | 'B' | 'C' | 'D' | 'F';
export type ChainSourceKind = 'alpaca_indicative' | 'cboe_delayed' | 'yahoo_modelled';

export interface ContractEngineLimits {
  accountSize: number;
  maxLossDollars: number;
  maxDebitDollars: number;
  dteMin: number;
  dteMax: number;
}

export interface ContractEngineThesis {
  direction: 'long' | 'short';
  entry?: number | null;
  stop?: number | null;
  t1?: number | null;
  holdingDays?: number | null;
}

/** One chain row in the engine's own normalized shape. */
export interface EngineChainRow {
  occ: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string; // YYYY-MM-DD
  bid: number | null;
  ask: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  openInterest: number | null; // null = unknown on this feed
  volume: number | null;
  greekSource?: string;
  quoteTime?: string | null;
}

export interface GradeComponent {
  key: 'reach' | 'payoff' | 'liquidity' | 'cost';
  label: string;
  weight: number;
  score: number | null; // null = not graded
  grade: Letter | null;
  value: string;
  why: string;
}

export type LimitRule = 'max_debit' | 'max_loss' | 'account';
export interface LimitViolation { rule: LimitRule; message: string }

export interface RankedContract {
  occ: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number;
  openInterest: number | null;
  volume: number | null;
  delta: number;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv: number | null;
  greekSource: string | null;
  tier: ContractTier;
  /** $ for ONE contract = mid × 100. */
  debitPerContract: number;
  /** Planned loss for one contract (see header). */
  riskPerContract: number;
  riskBasis: 'underlying_stop' | 'premium_stop_50';
  /** Modelled $ lost on one contract if the underlying reaches the stop (null = no stop / no IV). */
  lossAtStopPerContract: number | null;
  /** Contracts allowed by BOTH max debit and max loss (0 when outside limits). */
  contractsAffordable: number;
  breakeven: number;
  projectedAtT1: number | null;
  roiAtT1Pct: number | null;
  rrToT1: number | null;
  probTouchT1: number | null;
  expectedMove: number | null;
  score: number;
  grade: Letter;
  partialGrade: boolean;
  components: GradeComponent[];
  violations: LimitViolation[];
  flags: string[];
}

export interface RelaxAction {
  kind: 'max_debit' | 'max_loss' | 'both' | 'dte';
  label: string;
  maxDebitDollars?: number;
  maxLossDollars?: number;
  dteMin?: number;
  dteMax?: number;
  /** Contracts that would fit after this change. */
  unlocks: number;
}

export interface ChainSourceInfo {
  kind: ChainSourceKind;
  label: string;
  /** When this process fetched the chain (ISO). */
  fetchedAt: string;
  /** Newest quote timestamp on the rows used, when the feed provides one. */
  quotesAsOf: string | null;
  openInterestDate: string | null;
  note: string;
}

export interface ContractEngineResult {
  status: 'ok' | 'empty' | 'no_chain';
  symbol: string;
  direction: 'long' | 'short';
  optionType: 'call' | 'put';
  spot: number | null;
  source: ChainSourceInfo | null;
  limits: ContractEngineLimits;
  thesis: { stop: number | null; t1: number | null; holdingDays: number };
  counts: { typeRows: number; inWindow: number; tradeable: number; withinLimits: number; outsideLimits: number };
  within: RankedContract[];
  outside: RankedContract[];
  /** One sentence naming exactly what excluded everything (status 'empty' / 'no_chain'). */
  emptyReason: string | null;
  relax: RelaxAction[];
  sourcesTried: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

const RISK_FREE = 0.045;
const PREMIUM_STOP = 0.5;
const MAX_SPREAD_TRADEABLE = 0.35;
const MIN_ABS_DELTA = 0.08;
const MAX_ABS_DELTA = 0.97;

export const WEIGHTS = { reach: 0.3, payoff: 0.3, liquidity: 0.2, cost: 0.2 } as const;

export function letterFor(score: number): Letter {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function dteOf(expiry: string, now = Date.now()): number {
  // Options stop trading 4pm ET ≈ 20:00–21:00 UTC; 21:00Z keeps same-day expiries at 0.
  return Math.max(0, Math.round((Date.parse(`${expiry}T21:00:00Z`) - now) / 86_400_000));
}

function bs(S: number, K: number, T: number, sigma: number, isCall: boolean): number {
  if (T <= 0) return Math.max(0, isCall ? S - K : K - S);
  const sig = Math.max(sigma, 1e-4);
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (RISK_FREE + (sig * sig) / 2) * T) / (sig * sq);
  const d2 = d1 - sig * sq;
  return isCall
    ? S * normCdf(d1) - K * Math.exp(-RISK_FREE * T) * normCdf(d2)
    : K * Math.exp(-RISK_FREE * T) * normCdf(-d2) - S * normCdf(-d1);
}

export function tierForDelta(absDelta: number): ContractTier {
  if (absDelta >= 0.6) return 'conservative';
  if (absDelta >= 0.4) return 'balanced';
  if (absDelta >= 0.22) return 'aggressive';
  return 'starter';
}

// ─── Core ───────────────────────────────────────────────────────────────

interface Evaluated extends RankedContract { inWindow: boolean }

function evaluate(
  r: EngineChainRow,
  spot: number,
  thesis: ContractEngineThesis,
  limits: ContractEngineLimits,
  atmIvByExpiry: Map<string, number>,
  now: number,
): Evaluated | { reject: 'untradeable' } {
  const isCall = r.type === 'call';
  const bid = r.bid ?? 0;
  const ask = r.ask ?? 0;
  if (!(bid > 0 && ask > 0 && ask >= bid)) return { reject: 'untradeable' };
  const mid = (bid + ask) / 2;
  const spreadPct = (ask - bid) / mid;
  if (spreadPct > MAX_SPREAD_TRADEABLE) return { reject: 'untradeable' };
  if (r.delta == null || !Number.isFinite(r.delta) || r.delta === 0) return { reject: 'untradeable' };
  const absDelta = Math.abs(r.delta);
  if (absDelta < MIN_ABS_DELTA || absDelta > MAX_ABS_DELTA) return { reject: 'untradeable' };

  const dte = dteOf(r.expiry, now);
  const inWindow = dte >= limits.dteMin && dte <= limits.dteMax;
  const iv = r.iv != null && r.iv > 0 ? r.iv : null;
  const atmIv = atmIvByExpiry.get(r.expiry) ?? iv;
  const hold = Math.max(0, Math.min(thesis.holdingDays ?? 3, Math.max(0, dte - 0.25)));
  const Tnow = Math.max(0.5, dte) / 365;
  const Tlater = Math.max(0.25, dte - hold) / 365;
  const flags: string[] = [];

  // Model the CHANGE from the live mid (never re-price the entry itself).
  const proj = iv != null
    ? (s: number) => Math.max(0, mid + bs(s, r.strike, Tlater, iv, isCall) - bs(spot, r.strike, Tnow, iv, isCall))
    : null;

  const t1 = thesis.t1 != null && thesis.t1 > 0 ? thesis.t1 : null;
  const stop = thesis.stop != null && thesis.stop > 0 ? thesis.stop : null;

  const breakeven = isCall ? r.strike + mid : r.strike - mid;
  const debit = mid * 100;
  const premiumStopLoss = debit * PREMIUM_STOP;
  const lossAtStop = proj && stop != null ? Math.max(0, (mid - proj(stop)) * 100) : null;
  const risk = lossAtStop != null ? Math.min(lossAtStop, premiumStopLoss) : premiumStopLoss;
  const riskBasis: RankedContract['riskBasis'] = lossAtStop != null && lossAtStop < premiumStopLoss ? 'underlying_stop' : 'premium_stop_50';

  const projectedAtT1 = proj && t1 != null ? proj(t1) : null;
  const roiAtT1Pct = projectedAtT1 != null ? (projectedAtT1 / mid - 1) * 100 : null;
  const rr = projectedAtT1 != null && risk > 0 ? ((projectedAtT1 - mid) * 100) / risk : null;

  const sgn = isCall ? 1 : -1;
  const expectedMove = atmIv != null ? spot * atmIv * Math.sqrt(Tnow) : null;
  let probTouch: number | null = null;
  let probBeyondBe: number | null = null;
  if (expectedMove != null && expectedMove > 0) {
    probBeyondBe = 1 - normCdf((sgn * (breakeven - spot)) / expectedMove);
    if (t1 != null) {
      const need = sgn * (t1 - spot);
      probTouch = need <= 0 ? 1 : Math.min(1, 2 * (1 - normCdf(need / expectedMove)));
      if (need <= 0) flags.push('spot is already beyond T1');
    }
  }

  // ── Components ──
  const components: GradeComponent[] = [];
  const hasTarget = t1 != null;

  // reach
  if (hasTarget && probTouch != null && probBeyondBe != null) {
    const s = Math.round(clamp01(probTouch / 0.7) * 50 + clamp01(probBeyondBe / 0.5) * 50);
    components.push({
      key: 'reach', label: 'Target odds', weight: WEIGHTS.reach, score: s, grade: letterFor(s),
      value: `${Math.round(probTouch * 100)}% T1 · ${Math.round(probBeyondBe * 100)}% BE`,
      why: `${Math.round(probTouch * 100)}% odds of touching T1 $${t1!.toFixed(2)} in ${dte}d and ${Math.round(probBeyondBe * 100)}% of finishing past the $${breakeven.toFixed(2)} breakeven — ±$${expectedMove!.toFixed(2)} priced by expiry at ${Math.round((atmIv ?? 0) * 100)}% ATM IV; Δ${absDelta.toFixed(2)} ≈ odds of finishing ITM`,
    });
  } else {
    components.push({
      key: 'reach', label: 'Target odds', weight: WEIGHTS.reach, score: null, grade: null, value: '—',
      why: hasTarget ? 'no IV on this expiry — odds not modelled' : 'no idea target attached — not graded',
    });
  }

  // payoff
  if (rr != null && roiAtT1Pct != null) {
    const s = Math.round(clamp01(rr / 2.5) * 100);
    components.push({
      key: 'payoff', label: 'R:R to T1', weight: WEIGHTS.payoff, score: s, grade: letterFor(s),
      value: `${rr.toFixed(1)}:1`,
      why: `$${mid.toFixed(2)} → ~$${projectedAtT1!.toFixed(2)} at T1 after ${hold.toFixed(0)}d (${roiAtT1Pct >= 0 ? '+' : ''}${roiAtT1Pct.toFixed(0)}%) vs ${usd(risk)} planned loss${riskBasis === 'underlying_stop' ? ' at the stop' : ' (−50% premium stop)'}`,
    });
    if (t1 != null && sgn * (t1 - breakeven) < 0) flags.push('T1 does not clear the expiry breakeven — needs T1 early');
  } else {
    components.push({
      key: 'payoff', label: 'R:R to T1', weight: WEIGHTS.payoff, score: null, grade: null, value: '—',
      why: hasTarget ? 'no IV on this contract — payoff not modelled' : 'no idea target attached — not graded',
    });
  }

  // liquidity
  {
    const spreadS = 1 - clamp01((spreadPct - 0.02) / 0.23);
    const oi = r.openInterest;
    const oiS = oi == null ? 0.5 : clamp01(Math.log10(Math.max(1, oi)) / 4);
    const vol = r.volume;
    const volS = vol == null ? 0.5 : clamp01(Math.log10(1 + vol) / 3);
    const s = Math.round((spreadS * 0.6 + oiS * 0.25 + volS * 0.15) * 100);
    components.push({
      key: 'liquidity', label: 'Liquidity', weight: WEIGHTS.liquidity, score: s, grade: letterFor(s),
      value: `${(spreadPct * 100).toFixed(1)}% spread`,
      why: `spread $${(ask - bid).toFixed(2)} (${(spreadPct * 100).toFixed(1)}% of mid, paid in and out) · OI ${oi == null ? 'unknown on this feed' : oi.toLocaleString('en-US')} · vol ${vol == null ? 'unknown' : vol.toLocaleString('en-US')}`,
    });
    if (oi != null && oi < 100) flags.push(`thin open interest (${oi})`);
  }

  // cost
  {
    const theta = r.theta != null ? Math.abs(r.theta) : null;
    const burn = theta != null ? (theta * Math.max(1, hold)) / mid : null;
    const thetaS = burn != null ? 1 - clamp01((burn - 0.02) / 0.18) : 0.5;
    const rich = iv != null && atmIv != null && atmIv > 0 ? iv / atmIv : null;
    const ivS = rich != null ? 1 - clamp01((rich - 1) / 0.5) : 0.5;
    const s = Math.round((thetaS * 0.75 + ivS * 0.25) * 100);
    components.push({
      key: 'cost', label: 'Decay & IV', weight: WEIGHTS.cost, score: s, grade: letterFor(s),
      value: burn != null ? `${(burn * 100).toFixed(1)}% θ/hold` : 'θ unknown',
      why: `${burn != null ? `theta $${theta!.toFixed(2)}/day burns ${(burn * 100).toFixed(1)}% of premium over a ${Math.max(1, hold).toFixed(0)}d hold` : 'no theta on this row'}`
        + ` · IV ${iv != null ? `${Math.round(iv * 100)}%` : '—'}${rich != null ? ` = ${rich.toFixed(2)}× the expiry's ATM IV` : ''} · IV rank not computed (no IV history feed)`,
    });
    if (burn != null && burn > 0.15) flags.push(`theta eats ${(burn * 100).toFixed(0)}% of premium over the hold`);
  }

  const graded = components.filter((c) => c.score != null);
  const wsum = graded.reduce((a, c) => a + c.weight, 0);
  const score = wsum > 0 ? Math.round(graded.reduce((a, c) => a + (c.score as number) * c.weight, 0) / wsum) : 0;
  const partialGrade = graded.length < components.length;

  // ── Limits (hard rules, never part of the grade) ──
  const violations: LimitViolation[] = [];
  if (debit > limits.maxDebitDollars) violations.push({ rule: 'max_debit', message: `debit ${usd(debit)} > max ${usd(limits.maxDebitDollars)}` });
  if (risk > limits.maxLossDollars) violations.push({ rule: 'max_loss', message: `loss at stop ${usd(risk)} > max ${usd(limits.maxLossDollars)}` });
  if (debit > limits.accountSize) violations.push({ rule: 'account', message: `debit ${usd(debit)} > account ${usd(limits.accountSize)}` });
  const contractsAffordable = violations.length
    ? 0
    : Math.max(0, Math.min(Math.floor(limits.maxDebitDollars / debit), Math.floor(limits.maxLossDollars / Math.max(0.01, risk)), Math.floor(limits.accountSize / debit)));

  if (dte < 8) flags.push(`${dte} DTE — theta and gamma decide fast (book measured −0.02R under 8 DTE)`);
  if (r.greekSource && r.greekSource !== 'provider') flags.push(`greeks ${r.greekSource.replace(/-/g, ' ')}`);

  return {
    occ: r.occ, optionType: r.type, strike: r.strike, expiry: r.expiry, dte,
    bid, ask, mid, spreadPct,
    openInterest: r.openInterest, volume: r.volume,
    delta: r.delta, gamma: r.gamma, theta: r.theta, vega: r.vega, iv,
    greekSource: r.greekSource ?? null,
    tier: tierForDelta(absDelta),
    debitPerContract: debit,
    riskPerContract: risk,
    riskBasis,
    lossAtStopPerContract: lossAtStop,
    contractsAffordable,
    breakeven,
    projectedAtT1, roiAtT1Pct, rrToT1: rr, probTouchT1: probTouch, expectedMove,
    score, grade: letterFor(score), partialGrade,
    components, violations, flags,
    inWindow,
  };
}

const byQuality = (a: RankedContract, b: RankedContract) => b.score - a.score || a.debitPerContract - b.debitPerContract;

/**
 * Rank a chain against one set of limits. `rows` should be the WHOLE chain for
 * the right option type (all expiries) — rows outside the DTE window are used
 * only to offer a "switch DTE" relax action, never listed.
 */
export function rankContracts(input: {
  symbol: string;
  spot: number;
  rows: EngineChainRow[];
  thesis: ContractEngineThesis;
  limits: ContractEngineLimits;
  source: ChainSourceInfo;
  sourcesTried: string[];
  now?: number;
  withinCap?: number;
  outsideCap?: number;
}): ContractEngineResult {
  const { symbol, spot, thesis, limits, source } = input;
  const now = input.now ?? Date.now();
  const optionType: 'call' | 'put' = thesis.direction === 'short' ? 'put' : 'call';
  const typeRows = input.rows.filter((r) => r.type === optionType);

  // ATM IV per expiry — the strike nearest spot that carries an IV.
  const atmIvByExpiry = new Map<string, number>();
  const bestDist = new Map<string, number>();
  for (const r of typeRows) {
    if (!(r.iv != null && r.iv > 0)) continue;
    const d = Math.abs(r.strike - spot);
    if (d < (bestDist.get(r.expiry) ?? Infinity)) { bestDist.set(r.expiry, d); atmIvByExpiry.set(r.expiry, r.iv); }
  }

  const thesisN: ContractEngineThesis = { ...thesis, holdingDays: thesis.holdingDays ?? 3 };
  let inWindowRows = 0;
  const all: Evaluated[] = [];
  for (const r of typeRows) {
    const dte = dteOf(r.expiry, now);
    if (dte > 800) continue;
    if (dte >= limits.dteMin && dte <= limits.dteMax) inWindowRows++;
    const e = evaluate(r, spot, thesisN, limits, atmIvByExpiry, now);
    if ('reject' in e) continue;
    all.push(e);
  }
  const tradeable = all.filter((e) => e.inWindow);
  const within = tradeable.filter((e) => e.violations.length === 0).sort(byQuality);
  // Outside-limits rows are ordered by how close they come to fitting (the
  // near-misses are the useful ones), then by quality.
  const overshoot = (e: RankedContract) => Math.max(
    e.debitPerContract / limits.maxDebitDollars,
    e.riskPerContract / limits.maxLossDollars,
    e.debitPerContract / limits.accountSize,
  );
  const outside = tradeable.filter((e) => e.violations.length > 0).sort((a, b) => overshoot(a) - overshoot(b) || byQuality(a, b));
  const strip = ({ inWindow, ...rest }: Evaluated): RankedContract => rest;

  const relax: RelaxAction[] = [];
  let emptyReason: string | null = null;
  const windowLabel = `${limits.dteMin}–${limits.dteMax} DTE`;
  const kind = optionType === 'call' ? 'calls' : 'puts';

  if (within.length === 0) {
    // DTE alternatives: presets (other than the current window) with in-limit contracts.
    const presetFits = DTE_PRESETS
      .filter((p) => !(p.min === limits.dteMin && p.max === limits.dteMax))
      .map((p) => ({ p, n: all.filter((e) => e.dte >= p.min && e.dte <= p.max && e.violations.length === 0).length }))
      .filter((x) => x.n > 0);
    const center = (limits.dteMin + limits.dteMax) / 2;
    presetFits.sort((a, b) => Math.abs((a.p.min + a.p.max) / 2 - center) - Math.abs((b.p.min + b.p.max) / 2 - center));

    if (typeRows.length === 0) {
      emptyReason = `The ${source.label} chain returned no ${kind} for ${symbol}.`;
    } else if (inWindowRows === 0) {
      emptyReason = `No ${symbol} expiry falls inside ${windowLabel}.`;
    } else if (tradeable.length === 0) {
      emptyReason = `${inWindowRows} ${kind} are listed inside ${windowLabel}, but none has a two-sided quote with a spread under ${Math.round(MAX_SPREAD_TRADEABLE * 100)}% and a usable delta (${MIN_ABS_DELTA}–${MAX_ABS_DELTA}).`;
    } else {
      const debitOnly = outside.filter((e) => e.violations.every((v) => v.rule === 'max_debit'));
      const lossOnly = outside.filter((e) => e.violations.every((v) => v.rule === 'max_loss'));
      const nDebit = outside.filter((e) => e.violations.some((v) => v.rule === 'max_debit')).length;
      const nLoss = outside.filter((e) => e.violations.some((v) => v.rule === 'max_loss')).length;
      const minDebit = Math.min(...tradeable.map((e) => e.debitPerContract));
      const minRisk = Math.min(...tradeable.map((e) => e.riskPerContract));
      const parts: string[] = [];
      if (nDebit) parts.push(`${nDebit} cost more than your ${usd(limits.maxDebitDollars)} max debit (cheapest is ${usd(minDebit)})`);
      if (nLoss) parts.push(`${nLoss} would lose more than your ${usd(limits.maxLossDollars)} max loss at the stop (smallest is ${usd(minRisk)})`);
      emptyReason = `All ${tradeable.length} tradeable ${kind} in ${windowLabel} break a limit: ${parts.join('; ')}.`;

      const ceil = (n: number, step: number) => Math.ceil(n / step) * step;
      if (debitOnly.length) {
        const v = ceil(Math.min(...debitOnly.map((e) => e.debitPerContract)), 25);
        relax.push({ kind: 'max_debit', label: `Raise max debit to ${usd(v)}`, maxDebitDollars: v, unlocks: debitOnly.filter((e) => e.debitPerContract <= v).length });
      }
      if (lossOnly.length) {
        const v = ceil(Math.min(...lossOnly.map((e) => e.riskPerContract)), 25);
        relax.push({ kind: 'max_loss', label: `Raise max loss to ${usd(v)}`, maxLossDollars: v, unlocks: lossOnly.filter((e) => e.riskPerContract <= v).length });
      }
      if (!debitOnly.length || !lossOnly.length) {
        // Both limits bind on every contract — relax both to the best-graded cheap one.
        const cheapest = [...outside].sort((a, b) => a.debitPerContract - b.debitPerContract)[0];
        if (cheapest) {
          const d = ceil(Math.max(limits.maxDebitDollars, cheapest.debitPerContract), 25);
          const l = ceil(Math.max(limits.maxLossDollars, cheapest.riskPerContract), 25);
          if (d > limits.accountSize) {
            // Cannot fit this account at all — say so rather than suggest a debit above it.
          } else {
            relax.push({
              kind: 'both', label: `Max debit ${usd(d)} + max loss ${usd(l)}`, maxDebitDollars: d, maxLossDollars: l,
              unlocks: outside.filter((e) => e.debitPerContract <= d && e.riskPerContract <= l && e.debitPerContract <= limits.accountSize).length,
            });
          }
        }
      }
    }
    for (const { p, n } of presetFits.slice(0, 2)) {
      relax.push({ kind: 'dte', label: `Switch to ${p.label} (${n} fit)`, dteMin: p.min, dteMax: p.max, unlocks: n });
    }
  }

  const withinCap = input.withinCap ?? 12;
  const outsideCap = input.outsideCap ?? 6;
  const usedRows = [...within.slice(0, withinCap), ...outside.slice(0, outsideCap)];
  const qt = usedRows.map((e) => input.rows.find((r) => r.occ === e.occ)?.quoteTime).filter((t): t is string => !!t).sort();

  return {
    status: typeRows.length === 0 ? 'no_chain' : within.length ? 'ok' : 'empty',
    symbol,
    direction: thesis.direction,
    optionType,
    spot,
    source: { ...source, quotesAsOf: qt.length ? qt[qt.length - 1] : source.quotesAsOf },
    limits,
    thesis: { stop: thesis.stop ?? null, t1: thesis.t1 ?? null, holdingDays: thesisN.holdingDays! },
    counts: { typeRows: typeRows.length, inWindow: inWindowRows, tradeable: tradeable.length, withinLimits: within.length, outsideLimits: outside.length },
    within: within.slice(0, withinCap).map(strip),
    outside: outside.slice(0, outsideCap).map(strip),
    emptyReason,
    relax,
    sourcesTried: input.sourcesTried,
  };
}
