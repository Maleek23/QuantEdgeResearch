/**
 * OPTION SELECTION ENGINE — Canonical Premium Picker
 * ===================================================
 * Single source of truth for "given a price-action thesis, which option contract
 * gives the best risk-adjusted ROI?" Consolidates the intent scattered across
 * findOptimalStrike / pickBestContract / enrichOptionIdea.
 *
 * Input:  a PriceActionThesis (direction, entry, stop, T1/T2, setup, conviction).
 * Output: up to THREE graded contract picks — conservative / balanced / aggressive —
 *         each with live premium, modeled ROI at T1/T2, R:R, and a
 *         direction-consistent rationale. The caller picks the tier.
 *
 * Honesty contract (matches platform values):
 *   - Entry premium is ALWAYS the live market mid (never fabricated/BS-derived).
 *   - If no live quote / chain is available, returns status:'unavailable' with a
 *     plain reason — it never invents strikes or prices.
 *   - A bearish (put) pick never reads bullish in its rationale.
 *
 * GRADING IS DELEGATED (2026-09-29) — shared/contract-engine.ts is the single
 * source of truth for contract quality. This module keeps its public types and
 * function signatures (idea generators, LEAP tracker, quant-bot, index-scalp,
 * TradingView webhook, contract analyzer and /api/options/select all depend on
 * them) but no longer grades anything itself. What changed and why:
 *
 *   OLD  tiers picked by DELTA ALONE, then the pick was docked −30 when it did
 *        not fit the account, −12 when the strike sat past T1, −8 on a DTE
 *        fallback; R:R only against a −50% premium stop. With a normal small
 *        account every tier landed in F — "F" meant "outside your account",
 *        not "bad contract", and a fitting contract in the same tier was never
 *        considered.
 *   NEW  1. Every contract in the DTE window is graded by rankContracts()
 *           (target odds 30% · R:R to T1 30% · liquidity 20% · decay+IV 20%;
 *           A≥80 B≥65 C≥50 D≥35 F<35).
 *        2. Account limits are CONSTRAINTS, never grade deductions: inside each
 *           tier the best-graded contract that FITS is picked; only when no
 *           contract in that tier fits is the nearest miss shown, with
 *           fitsAccount=false and the exact rule it broke in `limitReasons`.
 *        3. R:R uses the thesis stop (modelled premium at the underlying stop,
 *           capped by the −50% premium stop — whichever exit fires first); with
 *           no IV to model it falls back to the −50% premium stop. `riskBasis`
 *           labels which one was used.
 *        4. Tier labels come from the shared |delta| bands (tierForDelta), with
 *           the starter tier's 0.15 delta floor kept (see TIER_DELTA.starter).
 *   Liquidity GATES (spread ≤15%, OI ≥100, greeks present) still pre-filter the
 *   pool exactly as before — they decide what is tradeable, not its grade.
 */

import { logger } from './logger';
import {
  rankContracts,
  tierForDelta,
  type ChainSourceKind,
  type EngineChainRow,
  type GradeComponent,
  type RankedContract,
} from '../shared/contract-engine';
import {
  getTradierQuote,
  getTradierOptionExpirations,
  getTradierOptionsChain,
} from './tradier-api';
import { dteFitWindow, holdDaysForSetup, readLossRulesConfig } from '../shared/loss-rules';

// ─── Public types ──────────────────────────────────────────────────

export type ThesisDirection = 'bullish' | 'bearish';
export type SetupType = 'scalp' | 'swing' | 'lotto' | 'position';
export type SelectionTier = 'starter' | 'conservative' | 'balanced' | 'aggressive';
export type EngineGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Explicit expiry tiers — the single vocabulary for "how far out is the contract".
 * Each tier owns a hard DTE band that the selector enforces, so a thesis can never
 * be paired with an expiry from a different horizon (the "1–2 week hold → Jan-2027
 * LEAP" bug). User-selectable per idea; otherwise derived from the holding period.
 */
export type ExpiryTier = '0DTE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'LEAP';

export interface PriceActionThesis {
  symbol: string;
  direction: ThesisDirection;
  /** Drives the DTE window when no explicit expiryTier is given. */
  setup: SetupType;
  /**
   * Explicit expiry tier (0DTE/DAILY/WEEKLY/MONTHLY/LEAP). When set, its DTE band
   * overrides the setup-derived window — this is what guarantees the chosen
   * contract's expiry matches the stated holding horizon.
   */
  expiryTier?: ExpiryTier;
  /** Planned entry stock price (reference for the move). */
  entry: number;
  /** Stop / invalidation stock price. */
  stop: number;
  /** First target stock price. */
  t1: number;
  /** Optional second target stock price. */
  t2?: number;
  /** Optional explicit holding horizon in days (overrides setup default). */
  holdingDays?: number;
  /** Optional conviction 0-100; nudges the recommended tier. */
  conviction?: number;
  /** Optional pre-fetched spot; otherwise fetched live. */
  asOfSpot?: number;
  /** Account-aware selection inputs. Omit them for research-only comparisons. */
  accountSize?: number;
  riskBudgetDollars?: number;
  riskPerTradePct?: number;
  maxDebitDollars?: number;
  minRoiAtT1Pct?: number;
  /** Explicit escape hatch for the dedicated index-0DTE engine only. */
  allowZeroDte?: boolean;
  /**
   * Intraday hold (exit same session) that may use a 0–N DTE contract. Only
   * honoured together with allowZeroDte; overrides the tier window with
   * [0, N] (no fallback beyond N) and skips the conviction floor, exactly as
   * the 0DTE tier does. Used by server/premarket-ideas.ts (0–7 DTE).
   */
  intradayMaxDte?: number;
  /**
   * LOSS RULE 4 — DTE fit (shared/loss-rules.ts, flag LOSS_RULE_DTE_FIT).
   * Opt-in per caller: idea generation and the Quant Bot set it; interactive
   * contract pickers keep the user's chosen tier. When set, a multi-day hold
   * (≥3 trading days from holdingDays, else the setup) is bound to 30–60 DTE
   * with no fallback outside it. Never applied to LEAP or the 0DTE engine.
   */
  applyDteFit?: boolean;
}

/**
 * The DTE-fit window for a thesis, or null when rule 4 does not apply to it.
 * Exported for the unit tests and for callers that pre-fetch expiries.
 */
/** The [0, N] window for an intraday hold (see PriceActionThesis.intradayMaxDte), or null. */
export function intradayWindowFor(thesis: Pick<PriceActionThesis, 'allowZeroDte' | 'intradayMaxDte'>):
  { min: number; max: number; ideal: number; fallbackMaxDte: number; label: string } | null {
  const n = thesis.intradayMaxDte;
  if (!thesis.allowZeroDte || n == null || !Number.isFinite(n) || n < 0) return null;
  const max = Math.floor(n);
  return { min: 0, max, ideal: Math.min(2, max), fallbackMaxDte: max, label: `Intraday (0–${max} DTE)` };
}

export function dteFitFor(thesis: Pick<PriceActionThesis, 'applyDteFit' | 'allowZeroDte' | 'setup' | 'holdingDays' | 'expiryTier'>):
  { min: number; max: number; ideal: number; fallbackMaxDte: number; label: string } | null {
  if (!thesis.applyDteFit || thesis.allowZeroDte || thesis.expiryTier === 'LEAP') return null;
  const cfg = readLossRulesConfig(process.env);
  if (!cfg.dteFit) return null;
  return dteFitWindow(holdDaysForSetup(thesis.setup, thesis.holdingDays), cfg);
}

export interface ContractCandidate {
  tier: SelectionTier;
  symbol: string;
  optionSymbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string; // YYYY-MM-DD
  dte: number;

  bid: number;
  ask: number;
  mid: number;
  spreadPct: number;
  openInterest: number;
  volume: number;

  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;

  entryPremium: number; // === mid (live, tradeable)
  breakeven: number;
  projectedAtT1: number;
  projectedAtT2?: number;
  modelPremiumAtStop: number;
  roiAtT1Pct: number;
  roiAtT2Pct?: number;
  /**
   * (premium at T1 − entry) / planned loss per share. Planned loss = the modelled
   * premium lost at the thesis stop, capped by the −50% premium stop; see riskBasis.
   */
  riskRewardRatio: number;
  /** Which loss the R:R and riskPerContract were measured against. */
  riskBasis?: 'underlying_stop' | 'premium_stop_50';
  /** Does T1 clear the +30% first-trim trigger? */
  scaleReachable: boolean;
  /** Whether the underlying T1 reaches/passes the strike in the thesis direction. */
  targetCrossesStrike: boolean;
  /** Planned dollar loss for one contract (see riskBasis). */
  riskPerContract: number;
  /** Maximum contracts allowed by both risk budget and debit ceiling. */
  maxContracts: number | null;
  /**
   * False means this contract breaks an account limit and must not be
   * recommended. It is a CONSTRAINT — it never changes `grade`.
   */
  fitsAccount: boolean;
  /** The exact limit rules this contract breaks ("debit $3,005 > max $300"). Empty when it fits. */
  limitReasons?: string[];

  /** 0-100 contract-quality score from shared/contract-engine.ts. */
  score: number;
  /** Quality letter from shared/contract-engine.ts (A–F; 'S' is no longer emitted). */
  grade: EngineGrade;
  /** The four graded components behind `score` (reach, payoff, liquidity, cost). */
  gradeComponents?: GradeComponent[];
  /** True when a component could not be graded (e.g. no IV) — the grade is partial. */
  partialGrade?: boolean;
  rationale: string;
  flags: string[];
}

export interface ContractSelection {
  symbol: string;
  direction: ThesisDirection;
  setup: SetupType;
  optionType: 'call' | 'put';
  spot: number;
  asOf: string;
  /** The expiry tier actually used to bound the DTE window. */
  expiryTier: ExpiryTier;
  dteWindow: { min: number; max: number };
  picks: ContractCandidate[]; // up to 3, one per tier
  recommendedTier: SelectionTier | null;
  status: 'ok' | 'unavailable' | 'no_candidates';
  note?: string;
  /** Where `grade`/`score` on every pick come from. */
  gradeSource?: 'shared/contract-engine';
  /** Set when low conviction pushed the DTE floor above the tier's window. */
  dteGateNote?: string;
  /** Which chain the picks were graded on (set by selectContracts). */
  chainSource?: string;
}

// ─── Editable config (single source of truth) ─────────────────────
// DTE windows tuned to the user's backtested v15 (0-1DTE scalps) / v15B
// (2-3DTE swings) strategy. Edit here — every caller of the engine inherits it.

/**
 * Explicit expiry-tier DTE bands — the canonical mapping from horizon → expiry.
 * `ideal` biases scoring toward the sweet spot of the band; `label` is for UI.
 * Principle: the contract expires AT or AFTER your planned exit (small theta
 * buffer), never wildly beyond it. Edit here — every caller inherits it.
 */
// `fallbackMaxDte`: when no liquid contract exists inside [min,max], we may snap
// to the nearest liquid expiry — but ONLY up to this ceiling. Beyond it we return
// no contract (honest "no liquid <tier>") rather than mislabel a far-dated LEAP as
// e.g. WEEKLY. This is the guard against "1–2 week thesis → 171-DTE contract".
export const EXPIRY_TIERS: Record<
  ExpiryTier,
  { min: number; max: number; ideal: number; fallbackMaxDte: number; label: string }
> = {
  '0DTE':    { min: 0,   max: 1,   ideal: 0,   fallbackMaxDte: 3,    label: 'Same-day (0DTE)' },
  DAILY:     { min: 1,   max: 3,   ideal: 2,   fallbackMaxDte: 10,   label: 'Day-to-day (1–3 DTE)' },
  WEEKLY:    { min: 8,   max: 14,  ideal: 10,  fallbackMaxDte: 35,   label: 'Weekly (8–14 DTE)' },
  MONTHLY:   { min: 25,  max: 45,  ideal: 30,  fallbackMaxDte: 90,   label: 'Monthly (25–45 DTE)' },
  LEAP:      { min: 180, max: 730, ideal: 365, fallbackMaxDte: 1000, label: 'LEAP (6mo+)' },
};

/** Map a legacy SetupType to its default expiry tier (when none is given). */
/**
 * A swing thesis is a 1–5 DAY hold, and it was mapped to WEEKLY (5–12 DTE) — so the trade
 * and the contract expired at roughly the same time, leaving no room to be early. The desk
 * rule is the opposite: "if we have a signal that says August, you can always get
 * September. You buy a month out." Swing now defaults to MONTHLY.
 */
export const SETUP_TO_TIER: Record<SetupType, ExpiryTier> = {
  scalp: 'WEEKLY',      // was DAILY (1–3 DTE) — even a day trade shouldn't fight theta
  swing: 'MONTHLY',     // was WEEKLY — the change that matters
  lotto: 'WEEKLY',      // explicitly the gamble
  position: 'MONTHLY',
};

/** Resolve the effective DTE band for a thesis: explicit tier wins, else setup. */
export function resolveExpiryTier(thesis: PriceActionThesis): ExpiryTier {
  return thesis.expiryTier ?? SETUP_TO_TIER[thesis.setup];
}

/**
 * DTE windows — matched to how long the thesis actually needs, not to the cheapest premium.
 *
 * These used to put a SWING setup on 2–4 DTE, which contradicts the rule the desk repeats
 * more than any other: "time is your best friend… if we have a signal that says August, you
 * can always get September. You buy a month out." A swing thesis is a 1–5 DAY hold; on a
 * 3-DTE contract theta eats it and you have to be right immediately — that's a lotto with a
 * swing label on it.
 *
 * Each window now gives the thesis room to be right, with the ideal sitting comfortably
 * past the expected hold rather than on top of it.
 */
/**
 * SHORT-DATED GATE — near-expiry contracts are conviction-gated, not freely available.
 *
 * Under roughly a week, theta and gamma dominate: you have to be right about direction AND
 * timing, with no room to be early. That's an acceptable trade on a setup the engine is
 * genuinely confident in, and a bad one on anything marginal — which is most of the board.
 *
 * So the floor moves with conviction rather than being fixed: weak setups are pushed out to
 * expiries that let them be wrong for a few days and still work.
 */
export const SHORT_DTE_THRESHOLD = 8;
export const SHORT_DTE_MIN_CONVICTION = 75;

/**
 * Minimum DTE this thesis has earned. Low conviction buys time whether it wants to or not.
 *
 * FLOOR RAISED TO 8 — from measured outcomes on this book's own contract P&L:
 *
 *   DTE at signal   n(measured)   win rate   avg R
 *     0-7               96          42.7%    -0.021   ← loses money
 *     8-14             175          43.4%    +0.281   ← 13x better
 *
 * Note the win rate is FLAT across the two (42.7 vs 43.4). Extra time did not make
 * the engine righter — it stopped theta taking the trade before the thesis had a
 * chance to resolve. Same calls, different decay.
 *
 * The old floors let an elite read go to 1 DTE, which is the middle of the losing
 * cohort. Conviction does not defeat gamma: an 85-score idea at 2 DTE still needs
 * to be right immediately, and 96 measured trades say that is a negative-expectancy
 * bet. Conviction still buys a SHORTER expiry than a marginal read gets — the ladder
 * is intact — it just no longer buys one below the point where the data turns.
 */
export function minDteForConviction(conviction?: number | null): number {
  const c = conviction ?? 0;
  if (c >= 85) return 8;    // elite — the shortest the data supports, not the shortest possible
  if (c >= 75) return 8;    // high
  if (c >= 60) return 14;   // decent — at least two weeks
  return 21;                // marginal — a marginal read needs room to be wrong
}

export const DTE_WINDOWS: Record<SetupType, { min: number; max: number; ideal: number }> = {
  // intraday, but never same-day expiry — 0DTE is a gamma coin-flip, not a scalp
  scalp: { min: 8, max: 14, ideal: 10 },
  // 1–5 day hold → roughly a month out, so time decay isn't the counterparty
  swing: { min: 14, max: 45, ideal: 30 },
  // explicitly the gamble; short-dated is the point, so it stays short
  lotto: { min: 8, max: 14, ideal: 10 },
  // multi-week thesis needs a quarter
  position: { min: 30, max: 120, ideal: 60 },
};

/** |delta| bands per tier. Conservative = deep ITM (high delta, low theta burn);
 *  balanced = ATM; aggressive = OTM convexity. */
export const TIER_DELTA: Record<SelectionTier, { min: number; ideal: number; max: number }> = {
  /**
   * STARTER — the cheapest contract that still expresses the thesis.
   *
   * Added because the three tiers below are unbuyable on a small account. ORCL
   * priced 2026-08-31 at spot $149: conservative $2,153/contract, balanced
   * $1,115, aggressive $550. On a $1,000 account at 2% risk, even the
   * aggressive tier risks $275 — 13x the budget.
   *
   * The obvious workaround is worse than the problem. ORCL had contracts at
   * $61-$94, but they were $230-$370 strikes on a $149 stock: delta 0.03-0.06
   * with 21-59% spreads. A $240 call cannot reach a $182 target, so it does not
   * express the thesis at all — it is a lottery ticket that loses a third of
   * its value to the spread on entry.
   *
   * So the floor is delta, not price. 0.15 is the lowest delta that still
   * tracks the underlying meaningfully; below that the contract stops being a
   * proxy for the move. This tier finds the cheapest contract at or above that
   * floor, and if none exists it is simply omitted — an unaffordable setup
   * should read as "not for this account", never as a cheap substitute that
   * cannot win.
   */
  starter: { min: 0.15, ideal: 0.20, max: 0.30 },
  conservative: { min: 0.60, ideal: 0.68, max: 0.80 },
  balanced: { min: 0.42, ideal: 0.50, max: 0.58 },
  aggressive: { min: 0.22, ideal: 0.30, max: 0.40 },
};

export const LIQUIDITY = {
  /** (ask - bid) / mid must be <= this. */
  maxSpreadPct: 0.15,
  minOpenInterest: 100,
  minVolume: 0, // OI is the real gate; early-session volume is often 0
};

/** Assumed days-in-trade per setup (for theta decay on the projection). */
export const HOLD_DAYS: Record<SetupType, number> = {
  scalp: 0.5,
  swing: 2,
  lotto: 1,
  position: 7,
};

export const RISK_FREE_RATE = 0.045;
/** Hard premium stop the user manages to (sell at -50% of premium). */
export const PREMIUM_STOP_FRACTION = 0.5;
const MAX_EXPIRIES_TO_FETCH = 4;
const MIN_T_YEARS = 1 / (365 * 6); // ~4h floor so BS stays stable on 0DTE

// ─── Black-Scholes (self-contained) ───────────────────────────────

function normCdf(x: number): number {
  // Hull / Abramowitz-Stegun 7.1.26
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    k * (0.319381530 +
      k * (-0.356563782 +
        k * (1.781477937 +
          k * (-1.821255978 +
            k * 1.330274429))));
  const cnd = 1 - 0.3989422804014327 * Math.exp(-0.5 * x * x) * poly;
  return x < 0 ? 1 - cnd : cnd;
}

function bsPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean,
): number {
  if (T <= 0) return Math.max(0, isCall ? S - K : K - S);
  const sig = sigma > 0 ? sigma : 0.0001;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sig * sig) / 2) * T) / (sig * sqrtT);
  const d2 = d1 - sig * sqrtT;
  if (isCall) {
    return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  }
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

// ─── Raw chain shape (structural subset of TradierOption) ─────────
// Declared locally so the pure core can be fed synthetic data in tests while
// the live TradierOption[] still passes via structural typing.

export interface RawChainOption {
  symbol: string;
  option_type: string; // "call" | "put"
  strike: number;
  expiration_date: string;
  bid: number;
  ask: number;
  volume?: number;
  open_interest?: number;
  greeks?: {
    delta: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    mid_iv?: number;
    smv_vol?: number;
  };
}

// ─── Internal normalized contract ─────────────────────────────────

interface NormOption {
  optionSymbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number;
  openInterest: number;
  volume: number;
  delta: number; // signed (calls +, puts -)
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  ivEstimated: boolean;
}

function dteFrom(expiry: string): number {
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
}

function occSymbol(symbol: string, expiry: string, type: 'call' | 'put', strike: number): string {
  const yymmdd = `${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}`;
  const cp = type === 'call' ? 'C' : 'P';
  const strk = (strike * 1000).toFixed(0).padStart(8, '0');
  return `O:${symbol}${yymmdd}${cp}${strk}`;
}

// ─── Expiry window selection ───────────────────────────────────────

function pickExpiries(
  allExpirations: string[],
  win: { min: number; max: number; ideal: number },
): { expiries: string[]; fallback: boolean } {
  const dated = allExpirations
    .map((e) => ({ e, dte: dteFrom(e) }))
    .filter((x) => x.dte >= 0);

  const inWindow = dated.filter((x) => x.dte >= win.min && x.dte <= win.max);
  if (inWindow.length > 0) {
    inWindow.sort((a, b) => Math.abs(a.dte - win.ideal) - Math.abs(b.dte - win.ideal));
    return { expiries: inWindow.slice(0, MAX_EXPIRIES_TO_FETCH).map((x) => x.e), fallback: false };
  }

  // No expiry inside the window → take the nearest one at/above the window min,
  // else the closest overall. Flagged as a fallback so the caller knows.
  const atOrAboveMin = dated.filter((x) => x.dte >= win.min).sort((a, b) => a.dte - b.dte);
  if (atOrAboveMin.length > 0) return { expiries: [atOrAboveMin[0].e], fallback: true };
  if (dated.length > 0) {
    dated.sort((a, b) => Math.abs(a.dte - win.ideal) - Math.abs(b.dte - win.ideal));
    return { expiries: [dated[0].e], fallback: true };
  }
  return { expiries: [], fallback: true };
}

/**
 * Restrict an already-normalized contract pool to the tier's DTE window.
 *
 * This is the fix for the "1–2 week hold → 2027 LEAP" bug: selectFromChain
 * receives the WHOLE CBOE chain (every expiry), and pickScore only weighted DTE
 * at 20%, so a far-dated LEAP with a nice delta could out-score the correct
 * near-dated contract. We now hard-bound the candidate set to the window first.
 *
 * Fallback (mirrors pickExpiries): if nothing lands inside [min,max], snap to the
 * single nearest expiry at/above min (else the closest expiry overall) and keep
 * only that expiry's contracts — so we degrade to "closest available", never to
 * "anything on the board". `fallback=true` is surfaced as a flag/note.
 */
function filterPoolToWindow(
  pool: NormOption[],
  win: { min: number; max: number; ideal: number; fallbackMaxDte: number },
): { pool: NormOption[]; fallback: boolean } {
  const inWindow = pool.filter((o) => o.dte >= win.min && o.dte <= win.max);
  if (inWindow.length > 0) return { pool: inWindow, fallback: false };

  // Snap to the nearest single expiry, preferring at/above the window min.
  const expiries = Array.from(new Set(pool.map((o) => o.dte))).sort((a, b) => a - b);
  if (expiries.length === 0) return { pool: [], fallback: true };
  const atOrAbove = expiries.filter((d) => d >= win.min);
  const targetDte =
    atOrAbove.length > 0
      ? atOrAbove[0]
      : expiries.reduce((best, d) =>
          Math.abs(d - win.ideal) < Math.abs(best - win.ideal) ? d : best,
        );
  // Honesty guard: if the nearest liquid expiry is beyond the tier's fallback
  // ceiling, do NOT substitute a far-dated contract — return nothing so the
  // caller reports "no liquid <tier> contract" instead of mislabeling a LEAP.
  if (targetDte > win.fallbackMaxDte) return { pool: [], fallback: true };
  return { pool: pool.filter((o) => o.dte === targetDte), fallback: true };
}

// ─── Filtering + normalization ─────────────────────────────────────

function normalizeAndFilter(
  raw: RawChainOption[],
  optionType: 'call' | 'put',
  symbol: string,
): NormOption[] {
  const out: NormOption[] = [];
  for (const o of raw) {
    if (o.option_type !== optionType) continue;
    const bid = o.bid ?? 0;
    const ask = o.ask ?? 0;
    if (bid <= 0 || ask <= 0) continue;
    const mid = (bid + ask) / 2;
    if (mid <= 0) continue;
    const spreadPct = (ask - bid) / mid;
    if (spreadPct > LIQUIDITY.maxSpreadPct) continue;
    const oi = o.open_interest ?? 0;
    if (oi < LIQUIDITY.minOpenInterest) continue;
    const vol = o.volume ?? 0;
    if (vol < LIQUIDITY.minVolume) continue;

    const g = o.greeks;
    if (!g || typeof g.delta !== 'number') continue; // need greeks to select intelligently

    const ivRaw = g.mid_iv ?? g.smv_vol ?? 0;
    const ivEstimated = !(ivRaw > 0);
    // No IV on the row: carried as 0 + ivEstimated, never a guessed 40%. The shared
    // engine then grades the contract PARTIAL (payoff/reach not modelled).
    const iv = ivEstimated ? 0 : ivRaw;

    out.push({
      optionSymbol: o.symbol || occSymbol(symbol, o.expiration_date, optionType, o.strike),
      optionType,
      strike: o.strike,
      expiry: o.expiration_date,
      dte: Math.max(0, dteFrom(o.expiration_date)),
      bid,
      ask,
      mid,
      spreadPct,
      openInterest: oi,
      volume: vol,
      delta: g.delta,
      gamma: g.gamma ?? 0,
      theta: g.theta ?? 0,
      vega: g.vega ?? 0,
      iv,
      ivEstimated,
    });
  }
  return out;
}

// ─── Grading — delegated to shared/contract-engine.ts ─────────────

const TIER_ORDER: SelectionTier[] = ['conservative', 'balanced', 'aggressive', 'starter'];

/**
 * Tier label for a |delta|: the shared engine's bands (≥0.60 conservative ·
 * 0.40–0.60 balanced · 0.22–0.40 aggressive · <0.22 starter), with the starter
 * tier keeping its documented 0.15 floor — below that a contract stops being a
 * proxy for the move (see TIER_DELTA.starter).
 */
function tierOf(absDelta: number): SelectionTier | null {
  const t = tierForDelta(absDelta);
  if (t === 'starter' && absDelta < TIER_DELTA.starter.min) return null;
  return t;
}

/** Raw chain row → the shared engine's row shape. Missing values stay null (never invented). */
function toEngineRow(o: RawChainOption, symbol: string, optionType: 'call' | 'put'): EngineChainRow {
  const g = o.greeks;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const ivRaw = g?.mid_iv ?? g?.smv_vol ?? 0;
  return {
    occ: o.symbol || occSymbol(symbol, o.expiration_date, optionType, o.strike),
    type: optionType,
    strike: o.strike,
    expiry: String(o.expiration_date).slice(0, 10),
    bid: num(o.bid),
    ask: num(o.ask),
    // CBOE fills missing greeks with 0 — a 0 delta is "unknown", not "zero".
    delta: g && typeof g.delta === 'number' && g.delta !== 0 ? g.delta : null,
    gamma: num(g?.gamma),
    theta: num(g?.theta),
    vega: num(g?.vega),
    iv: ivRaw > 0 ? ivRaw : null,
    openInterest: num(o.open_interest),
    volume: num(o.volume),
  };
}

interface ThesisLimits {
  accountSize: number | null;
  riskBudget: number | null;
  maxDebit: number | null;
}

function limitsOf(thesis: PriceActionThesis): ThesisLimits {
  const pos = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : null);
  const riskBudget = pos(thesis.riskBudgetDollars) ?? (
    thesis.accountSize && thesis.riskPerTradePct
      ? pos(thesis.accountSize * (thesis.riskPerTradePct / 100))
      : null
  );
  return { accountSize: pos(thesis.accountSize), riskBudget, maxDebit: pos(thesis.maxDebitDollars) };
}

/** Same change-from-mid Black-Scholes model the shared engine uses for T1, applied to T2. */
function projectLikeSharedEngine(
  o: NormOption, dte: number, holdDays: number, refSpot: number, targetSpot: number,
): number | null {
  if (o.ivEstimated || !(o.iv > 0)) return null;
  const isCall = o.optionType === 'call';
  const hold = Math.max(0, Math.min(holdDays, Math.max(0, dte - 0.25)));
  const Tnow = Math.max(0.5, dte) / 365;
  const Tlater = Math.max(0.25, dte - hold) / 365;
  return Math.max(0, o.mid + bsPrice(targetSpot, o.strike, Tlater, RISK_FREE_RATE, o.iv, isCall)
    - bsPrice(refSpot, o.strike, Tnow, RISK_FREE_RATE, o.iv, isCall));
}

function buildCandidate(
  o: NormOption,
  g: RankedContract,
  tier: SelectionTier,
  thesis: PriceActionThesis,
  refSpot: number,
  fallbackDte: boolean,
  limitsSet: boolean,
  holdDays: number,
): ContractCandidate {
  const isCall = o.optionType === 'call';
  const entryPremium = o.mid;
  const modelled = g.projectedAtT1 != null && g.rrToT1 != null && g.roiAtT1Pct != null;
  // No IV → no payoff model. Report a flat 0% / 0:1 (never a guessed projection);
  // such a pick cannot clear the recommendation gates.
  const projectedAtT1 = g.projectedAtT1 ?? entryPremium;
  const roiAtT1Pct = g.roiAtT1Pct ?? 0;
  const riskRewardRatio = g.rrToT1 ?? 0;
  const t2Proj = thesis.t2 != null ? projectLikeSharedEngine(o, g.dte, holdDays, refSpot, thesis.t2) : null;
  const projectedAtT2 = t2Proj ?? undefined;
  const roiAtT2Pct = t2Proj != null ? (t2Proj / entryPremium - 1) * 100 : undefined;
  const modelPremiumAtStop = g.lossAtStopPerContract != null
    ? Math.max(0, entryPremium - g.lossAtStopPerContract / 100)
    : entryPremium * (1 - PREMIUM_STOP_FRACTION);
  const scaleReachable = roiAtT1Pct >= 30;
  const breakeven = isCall ? o.strike + entryPremium : o.strike - entryPremium;
  const targetCrossesStrike = isCall ? thesis.t1 >= o.strike : thesis.t1 <= o.strike;

  // Limits are constraints: they decide fitsAccount / maxContracts, never the grade.
  const limitReasons = g.violations.map((v) => v.message);
  const fitsAccount = limitReasons.length === 0;
  const maxContracts = !limitsSet
    ? null
    : fitsAccount
      ? (Number.isFinite(g.contractsAffordable) ? g.contractsAffordable : null)
      : 0;

  const flags: string[] = [];
  if (o.dte === 0) flags.push('0DTE');
  if (!scaleReachable) flags.push('below_30pct_scale');
  if (o.ivEstimated) flags.push('iv_missing');
  if (!modelled) flags.push('payoff_not_modelled');
  if (g.partialGrade) flags.push('partial_grade');
  if (fallbackDte) flags.push('dte_fallback');
  if (o.openInterest < 250) flags.push('thin_oi');
  if (!targetCrossesStrike) flags.push('strike_beyond_t1');
  if (!fitsAccount) flags.push('outside_account_risk');
  if (roiAtT1Pct < (thesis.minRoiAtT1Pct ?? 20)) flags.push('target_return_below_floor');
  flags.push(...g.flags); // the shared engine's plain-English flags

  const verb = isCall ? 'rises' : 'falls';
  const cp = isCall ? 'C' : 'P';
  const comp = g.components.map((c) => `${c.label} ${c.grade ?? '—'}`).join(' · ');
  const riskText = g.riskBasis === 'underlying_stop'
    ? `the modelled loss at the $${thesis.stop.toFixed(2)} stop ($${g.riskPerContract.toFixed(0)}/contract)`
    : `the −50% premium stop ($${g.riskPerContract.toFixed(0)}/contract)`;
  const payoffText = modelled
    ? `~${roiAtT1Pct >= 0 ? '+' : ''}${roiAtT1Pct.toFixed(0)}% on premium ($${entryPremium.toFixed(2)}→$${projectedAtT1.toFixed(2)}), ` +
      `R:R ${riskRewardRatio.toFixed(1)}:1 vs ${riskText}.`
    : `payoff not modelled (no IV on this contract).`;
  const rationale =
    `${tier} ${o.optionType}: $${o.strike}${cp} ${o.expiry} (${o.dte}DTE, Δ${o.delta.toFixed(2)}). ` +
    `Grade ${g.grade} ${g.score}/100${g.partialGrade ? ' (partial)' : ''} — ${comp}. ` +
    `Profits as ${thesis.symbol} ${verb} from $${refSpot.toFixed(2)} toward T1 $${thesis.t1.toFixed(2)} — ${payoffText}` +
    (fitsAccount ? '' : ` Outside your limits: ${limitReasons.join('; ')} — not recommended.`);

  return {
    tier,
    symbol: thesis.symbol,
    optionSymbol: o.optionSymbol,
    optionType: o.optionType,
    strike: o.strike,
    expiry: o.expiry,
    dte: o.dte,
    bid: o.bid,
    ask: o.ask,
    mid: o.mid,
    spreadPct: o.spreadPct,
    openInterest: o.openInterest,
    volume: o.volume,
    delta: o.delta,
    gamma: o.gamma,
    theta: o.theta,
    vega: o.vega,
    iv: o.iv,
    entryPremium,
    breakeven,
    projectedAtT1,
    projectedAtT2,
    modelPremiumAtStop,
    roiAtT1Pct,
    roiAtT2Pct,
    riskRewardRatio,
    riskBasis: g.riskBasis,
    scaleReachable,
    targetCrossesStrike,
    riskPerContract: g.riskPerContract,
    maxContracts,
    fitsAccount,
    limitReasons,
    score: g.score,
    grade: g.grade,
    gradeComponents: g.components,
    partialGrade: g.partialGrade,
    rationale,
    flags,
  };
}

function recommendTier(thesis: PriceActionThesis): SelectionTier {
  const base: Record<SetupType, SelectionTier> = {
    scalp: 'balanced',
    swing: 'balanced',
    lotto: 'aggressive',
    position: 'conservative',
  };
  let tier = base[thesis.setup];
  const conv = thesis.conviction;
  if (conv != null) {
    if (conv >= 80 && tier === 'conservative') tier = 'balanced';
    else if (conv >= 85 && tier === 'balanced') tier = 'aggressive';
    else if (conv < 50 && tier === 'aggressive') tier = 'balanced';
    else if (conv < 40 && tier === 'balanced') tier = 'conservative';
  }
  return tier;
}

/**
 * Recommendation gates. A pick is recommendable only if it fits every account
 * limit (constraint), is not F quality, and its modelled payoff clears the ROI
 * floor at R:R ≥ 1. The old "strike must reach T1" gate is gone — the payoff
 * model already prices whether T1 pays on this strike (it is still a flag).
 */
function isRecommendable(p: ContractCandidate, thesis: PriceActionThesis): boolean {
  return p.fitsAccount &&
    p.grade !== 'F' &&
    p.roiAtT1Pct >= (thesis.minRoiAtT1Pct ?? 20) &&
    p.riskRewardRatio >= 1;
}

// ─── Pure core (no I/O — testable) ─────────────────────────────────
// Given a thesis, a live spot, and the raw option rows, build the tiered
// selection. Separated from network I/O so it can be exercised directly.

export function selectFromChain(
  thesis: PriceActionThesis,
  spot: number,
  rawOptions: RawChainOption[],
  meta?: { fallbackDte?: boolean; expiriesNote?: string; sourceKind?: ChainSourceKind },
): ContractSelection {
  const optionType: 'call' | 'put' = thesis.direction === 'bullish' ? 'call' : 'put';
  const expiryTier = resolveExpiryTier(thesis);
  const intradayWin = intradayWindowFor(thesis);
  const tierWin = intradayWin ?? EXPIRY_TIERS[expiryTier];

  // Short-dated is conviction-gated. Under ~a week you must be right on direction AND
  // timing with no room to be early — fine on a setup the engine is genuinely confident
  // in, bad on a marginal one, and most of the board is marginal. So the floor rises as
  // conviction falls: a weak read is pushed out to an expiry that lets it be wrong for a
  // few days and still work.
  const dteFloor = thesis.allowZeroDte && (expiryTier === '0DTE' || intradayWin)
    ? 0
    : minDteForConviction(thesis.conviction);
  const gated = dteFloor > tierWin.min;
  const gatedWin = gated
    ? {
        ...tierWin,
        min: dteFloor,
        max: Math.max(tierWin.max, dteFloor + 14),
        ideal: Math.max(tierWin.ideal, dteFloor + 5),
      }
    : tierWin;
  // Loss rule 4: a multi-day hold is bound to 30–60 DTE (the conviction floor
  // is always below 30, so the fit window supersedes it).
  const fit = dteFitFor(thesis);
  const win = fit ?? gatedWin;
  const base = {
    symbol: thesis.symbol,
    direction: thesis.direction,
    setup: thesis.setup,
    optionType,
    spot,
    asOf: new Date().toISOString(),
    expiryTier,
    dteWindow: { min: win.min, max: win.max },
    gradeSource: 'shared/contract-engine' as const,
    dteGateNote: fit
      ? `DTE fit (loss rule 4): multi-day hold → ${fit.min}–${fit.max} DTE only`
      : gated
      ? `Conviction ${Math.round(thesis.conviction ?? 0)} — short-dated withheld, minimum ${dteFloor} DTE`
      : undefined,
  };

  const fullPool = normalizeAndFilter(rawOptions, optionType, thesis.symbol);
  if (fullPool.length === 0) {
    return {
      ...base,
      picks: [],
      recommendedTier: null,
      status: 'no_candidates',
      note: `No liquid ${optionType}s for ${thesis.symbol} (spread/OI gates).`,
    };
  }

  // Hard-bound the candidate set to the tier's DTE window BEFORE ranking, so the
  // chosen expiry always matches the horizon (no LEAP for a weekly thesis).
  const { pool, fallback: windowFallback } = filterPoolToWindow(fullPool, win);
  const fallbackDte = (meta?.fallbackDte ?? false) || windowFallback;
  if (pool.length === 0) {
    return {
      ...base,
      picks: [],
      recommendedTier: null,
      status: 'no_candidates',
      note: `No liquid ${optionType}s for ${thesis.symbol} in the ${win.label} window (${win.min}-${win.max}DTE).`,
    };
  }

  // ── Grade with the shared engine ──
  // Feed it every row (not just the liquid pool) on the pool's expiries so its
  // per-expiry ATM IV is taken from the true at-the-money strike.
  const poolExpiries = new Set(pool.map((o) => o.expiry));
  const rows = rawOptions
    .filter((o) => o.option_type === optionType && poolExpiries.has(o.expiration_date))
    .map((o) => toEngineRow(o, thesis.symbol, optionType));
  const lim = limitsOf(thesis);
  const limitsSet = lim.accountSize != null || lim.riskBudget != null || lim.maxDebit != null;
  const holdDays = thesis.holdingDays ?? HOLD_DAYS[thesis.setup];
  const graded = rankContracts({
    symbol: thesis.symbol,
    spot,
    rows,
    thesis: {
      direction: thesis.direction === 'bullish' ? 'long' : 'short',
      entry: thesis.entry,
      stop: thesis.stop,
      t1: thesis.t1,
      holdingDays: holdDays,
    },
    limits: {
      accountSize: lim.accountSize ?? Number.POSITIVE_INFINITY,
      maxLossDollars: lim.riskBudget ?? Number.POSITIVE_INFINITY,
      maxDebitDollars: lim.maxDebit ?? Number.POSITIVE_INFINITY,
      dteMin: 0,
      dteMax: 100_000, // the pool is already bounded to the thesis window above
    },
    source: {
      kind: meta?.sourceKind ?? 'cboe_delayed',
      label: 'option chain',
      fetchedAt: base.asOf,
      quotesAsOf: null,
      openInterestDate: null,
      note: '',
    },
    sourcesTried: [],
    withinCap: Number.POSITIVE_INFINITY,
    outsideCap: Number.POSITIVE_INFINITY,
  });
  const byOcc = new Map<string, RankedContract>();
  for (const r of [...graded.within, ...graded.outside]) byOcc.set(r.occ, r);

  type Pair = { o: NormOption; g: RankedContract };
  const byTier = new Map<SelectionTier, Pair[]>();
  for (const o of pool) {
    const g = byOcc.get(o.optionSymbol);
    if (!g) continue; // the shared engine found it untradeable (delta/quote)
    const t = tierOf(Math.abs(o.delta));
    if (!t) continue;
    const list = byTier.get(t) ?? [];
    list.push({ o, g });
    byTier.set(t, list);
  }

  // Inside each tier: the best-graded contract that FITS the limits (ties →
  // closer to the window's ideal DTE → cheaper). Only when nothing in the tier
  // fits is the nearest miss shown, marked fitsAccount=false with its reason.
  const inf = Number.POSITIVE_INFINITY;
  const overshoot = (g: RankedContract) => Math.max(
    g.debitPerContract / (lim.maxDebit ?? inf),
    g.riskPerContract / (lim.riskBudget ?? inf),
    g.debitPerContract / (lim.accountSize ?? inf),
  );
  const byQuality = (a: Pair, b: Pair) =>
    b.g.score - a.g.score ||
    Math.abs(a.o.dte - win.ideal) - Math.abs(b.o.dte - win.ideal) ||
    a.g.debitPerContract - b.g.debitPerContract;
  const picks: ContractCandidate[] = [];
  for (const tier of TIER_ORDER) {
    const members = byTier.get(tier);
    if (!members || members.length === 0) continue; // no contract in this delta band → omit the tier
    const fits = members.filter((m) => m.g.violations.length === 0).sort(byQuality);
    const chosen = fits[0] ?? [...members].sort((a, b) => overshoot(a.g) - overshoot(b.g) || byQuality(a, b))[0];
    picks.push(buildCandidate(chosen.o, chosen.g, tier, thesis, spot, fallbackDte, limitsSet, holdDays));
  }

  if (picks.length === 0) {
    return {
      ...base,
      picks: [],
      recommendedTier: null,
      status: 'no_candidates',
      note: `No ${optionType} in the ${win.min}-${win.max}DTE window for ${thesis.symbol} has a usable delta (≥${TIER_DELTA.starter.min}) and two-sided quote.`,
    };
  }

  const fallbackNote = windowFallback
    ? `No expiry inside the ${win.label} window (${win.min}-${win.max}DTE) for ${thesis.symbol} — used nearest available (${picks[0]?.dte ?? '?'}DTE).`
    : undefined;

  // Recommended tier must actually be present in the emitted picks and pass
  // the gates; otherwise the best-graded pick that does.
  const eligible = picks.filter((p) => isRecommendable(p, thesis));
  const preferredTier = recommendTier(thesis);
  const recommendedTier = eligible.some((p) => p.tier === preferredTier)
    ? preferredTier
    : (eligible.length > 0
        ? [...eligible].sort((a, b) => b.score - a.score)[0].tier
        : null);

  let note = meta?.expiriesNote ?? fallbackNote;
  if (recommendedTier == null) {
    const why: string[] = [];
    const outside = picks.filter((p) => !p.fitsAccount);
    if (outside.length) why.push(`${outside.length} outside your limits (${outside[0].limitReasons?.[0] ?? 'limit'})`);
    const fGrade = picks.filter((p) => p.fitsAccount && p.grade === 'F').length;
    if (fGrade) why.push(`${fGrade} graded F on quality`);
    const lowRet = picks.filter((p) => p.fitsAccount && p.grade !== 'F' && (p.roiAtT1Pct < (thesis.minRoiAtT1Pct ?? 20) || p.riskRewardRatio < 1)).length;
    if (lowRet) why.push(`${lowRet} below the ${thesis.minRoiAtT1Pct ?? 20}% ROI@T1 / 1:1 R:R floor`);
    note = `No contract clears the account limits, quality (not F), ROI and R:R gates${why.length ? `: ${why.join('; ')}` : ''}.`;
  }

  return {
    ...base,
    picks,
    recommendedTier,
    status: 'ok',
    note,
  };
}

// ─── Main entry point (I/O) ────────────────────────────────────────

export async function selectContracts(
  thesis: PriceActionThesis,
  apiKey?: string,
): Promise<ContractSelection> {
  const optionType: 'call' | 'put' = thesis.direction === 'bullish' ? 'call' : 'put';
  const expiryTier = resolveExpiryTier(thesis);
  // Fetch windows follow loss rule 4 when it applies (selectFromChain re-derives it).
  const win = dteFitFor(thesis) ?? intradayWindowFor(thesis) ?? EXPIRY_TIERS[expiryTier];
  const unavailable = (note: string, spot = 0): ContractSelection => ({
    symbol: thesis.symbol,
    direction: thesis.direction,
    setup: thesis.setup,
    optionType,
    spot,
    asOf: new Date().toISOString(),
    expiryTier,
    dteWindow: { min: win.min, max: win.max },
    picks: [],
    recommendedTier: null,
    status: 'unavailable',
    note,
  });

  // 0. PRIMARY SOURCE — Alpaca indicative chain, the same first choice as the
  //    Contract Engine (server/contract-engine.ts). Tradier's platform token is
  //    dead, so without this the bot and every other caller ran on the CBOE CDN
  //    alone. Requests go through alpaca-options' process-wide budget in the
  //    BACKGROUND lane (callers that a user is waiting on may wrap this call in
  //    withAlpacaPriority). Uses the default 180-day / ±40% chain so it shares
  //    the cache with GEX and the Contract Engine; LEAP windows (beyond that
  //    horizon) skip straight to CBOE. A chain that yields no candidates (e.g.
  //    OI not yet published) falls through rather than returning empty.
  if (win.max <= 160) {
    try {
      const { getAlpacaOptionsChain, isAlpacaOptionsConfigured, alpacaToTradierShape } = await import('./alpaca-options');
      if (isAlpacaOptionsConfigured()) {
        const chain = await getAlpacaOptionsChain(thesis.symbol);
        const spot = thesis.asOfSpot ?? chain?.spot ?? 0;
        if (chain && chain.contracts.length > 0 && spot > 0) {
          const sel = selectFromChain(thesis, spot, alpacaToTradierShape(chain) as RawChainOption[], { sourceKind: 'alpaca_indicative' });
          if (sel.status === 'ok' && sel.picks.length > 0) {
            sel.asOf = new Date(chain.fetchedAt).toISOString();
            sel.chainSource = 'alpaca_indicative';
            return sel;
          }
        }
      }
    } catch (e) {
      logger.warn(`[OPTION-ENGINE] Alpaca primary failed for ${thesis.symbol}, falling back to CBOE: ${(e as Error).message}`);
    }
  }

  // 1. CBOE delayed chain (free, no key, no Tradier dependency).
  //    One fetch returns the spot + the WHOLE chain (greeks + IV), which the
  //    pure core bounds to the thesis DTE window.
  try {
    const { fetchCboeChain } = await import("./contract-analyzer/cboe-chain");
    const cboe = await fetchCboeChain(thesis.symbol);
    if (cboe && cboe.rawChain.length > 0) {
      const spot = thesis.asOfSpot ?? cboe.spot;
      if (spot > 0) {
        const sel = selectFromChain(thesis, spot, cboe.rawChain, {
          expiriesNote: undefined,
          sourceKind: 'cboe_delayed',
        });
        // Stamp the chain's real fetch time, not "now" — a cached chain must
        // not read as fresh (audit 2026-09-24).
        if (cboe.fetchedAt) sel.asOf = new Date(cboe.fetchedAt).toISOString();
        sel.chainSource = 'cboe_delayed';
        return sel;
      }
    }
  } catch (e) {
    logger.warn(`[OPTION-ENGINE] CBOE primary failed for ${thesis.symbol}, falling back to Yahoo: ${(e as Error).message}`);
  }

  // 1.5 SECONDARY SOURCE — Yahoo options chain (free, crumb-auth). Reached when
  //     CBOE is rate-limited (429) or returns nothing. Greeks are Black-Scholes
  //     approximations (good enough for selection); keeps the engine alive when
  //     both CBOE and Tradier are unavailable.
  try {
    const { getYahooExpirations, getYahooEngineChain } = await import("./yahoo-options-fallback");
    const yExps = await getYahooExpirations(thesis.symbol);
    if (yExps.length > 0) {
      const { expiries: yPicked, fallback: yFallbackDte } = pickExpiries(yExps, win);
      if (yPicked.length > 0) {
        const { spot: ySpot, chain: yChain } = await getYahooEngineChain(thesis.symbol, yPicked);
        const spot = thesis.asOfSpot ?? ySpot;
        if (spot > 0 && yChain.length > 0) {
          logger.info(`[OPTION-ENGINE] Using Yahoo options fallback for ${thesis.symbol} (${yChain.length} contracts)`);
          const ySel = selectFromChain(thesis, spot, yChain, {
            fallbackDte: yFallbackDte,
            sourceKind: 'yahoo_modelled',
            expiriesNote: yFallbackDte
              ? `No expiry inside the ${win.min}-${win.max}DTE window — used nearest available (${yPicked[0]}).`
              : undefined,
          });
          ySel.chainSource = 'yahoo_modelled';
          return ySel;
        }
      }
    }
  } catch (e) {
    logger.warn(`[OPTION-ENGINE] Yahoo options fallback failed for ${thesis.symbol}, falling back to Tradier: ${(e as Error).message}`);
  }

  // 2. FALLBACK — Tradier (only reached if CBOE and Yahoo returned nothing).
  // 2a. Spot — never fabricate. If unavailable, say so.
  let spot = thesis.asOfSpot;
  if (spot == null) {
    const quote = await getTradierQuote(thesis.symbol, apiKey);
    spot = quote?.last ?? quote?.close ?? undefined;
  }
  if (spot == null || !(spot > 0)) {
    return unavailable(
      `Live quote unavailable for ${thesis.symbol} — no contract selected (no fabricated prices).`,
    );
  }

  // 2b. Expiries inside the thesis DTE window.
  const allExpirations = await getTradierOptionExpirations(thesis.symbol, apiKey);
  if (allExpirations.length === 0) {
    return unavailable(`No option expirations returned for ${thesis.symbol} (chain unavailable).`, spot);
  }
  const { expiries, fallback: fallbackDte } = pickExpiries(allExpirations, win);
  if (expiries.length === 0) {
    return unavailable(`No expirations near the ${win.min}-${win.max}DTE window for ${thesis.symbol}.`, spot);
  }

  // 2c. Fetch + merge in-window chains (staggered to respect rate limits).
  const chainArrays = await Promise.all(
    expiries.map(async (exp, i) => {
      await new Promise((res) => setTimeout(res, i * 100));
      return getTradierOptionsChain(thesis.symbol, exp, apiKey);
    }),
  );

  // 2d. Delegate to the pure core.
  const tSel = selectFromChain(thesis, spot, chainArrays.flat(), {
    fallbackDte,
    expiriesNote: fallbackDte
      ? `No expiry inside the ${win.min}-${win.max}DTE window — used nearest available (${expiries[0]}).`
      : undefined,
  });
  tSel.chainSource = 'tradier';
  return tSel;
}
