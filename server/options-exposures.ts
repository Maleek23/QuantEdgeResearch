/**
 * Unified Options Exposures Calculator
 * =====================================
 * Computes GEX + VEX + DEX + CHARM aggregates from any options source.
 * Methodology, sources and assumptions: docs/GEX_VEX_METHODOLOGY.md.
 * The per-contract math lives in shared/gex-math.ts (one implementation for
 * the hub, the CBOE fallback and the cross-ticker rankings).
 *
 *   - Computes vanna/charm locally (no feed returns them)
 *   - Falls back to Black-Scholes when feed greeks are missing (disclosed share)
 *   - Aggregates across expirations UNWEIGHTED (units v2 — see EXPOSURE_UNITS_VERSION)
 *
 * Units (v2):
 *   GEX(strike)  = Σ sign · Γ · OI · 100 · S² · 0.01 / 1e9      $B per 1% move
 *   VEX(strike)  = Σ −sign · vanna · OI · 100 · S · 0.01 / 1e6   $M per 1 IV point
 *   DEX(strike)  = Σ sign · Δ · OI · 100 · S / 1e9               $B dealer delta notional
 *   Charm(strike)= Σ sign · ∂Δ/∂t · OI · 100 · S / 1e9            $B per year of decay
 *
 * Sign convention (naive-OI, an assumption): dealers LONG calls (+GEX) and
 * SHORT puts (−GEX). VEX is liquidity-signed: + = dealers buy as IV rises.
 */

import { logger } from './logger';
import {
  gammaProfile, thinProfile, pickWalls, gexPer1Pct, vannaPerVolPt, MIN_T_YEARS, expiryInstantMs,
  deltaMoveSplit,
  type GammaContract,
} from '../shared/gex-math';
import {
  GAMMA_METRIC_DEFS, flowResignWeight, levelsFor, diffLevels, overlapCount,
  type GammaMetricsBlock,
} from '../shared/gex-adjusted';
import { classifyGammaRegime, type GammaRegimeRead } from '../shared/gex-regime';
import { bucketizeLegs, type BucketLeg, type GexBucketKey, type GexBucketSummary } from '../shared/gex-buckets';
import type { GreekSource } from '../shared/iv-fill';

/**
 * Where one aggregated contract's gamma came from.
 *   provider            — the feed's own gamma
 *   implied-from-price  — IV inverted from the contract's quote/last (shared/iv-fill.ts)
 *   smile-interpolated  — IV interpolated across the expiry's smile (shared/iv-fill.ts)
 *   bs-feed-iv          — Black-Scholes here on the feed's IV (feed had IV, no gamma)
 *   default-iv          — Black-Scholes here on DEFAULT_IV (no IV anywhere)
 */
export type ExposureGreekSource = 'provider' | 'implied-from-price' | 'smile-interpolated' | 'bs-feed-iv' | 'default-iv';


// ─── Types ──────────────────────────────────────────────────

export interface OptionInput {
  strike: number;
  optionType: 'call' | 'put';
  openInterest: number;
  volume: number;
  impliedVolatility: number;        // decimal, e.g. 0.25 for 25%
  /** True when the source had no IV and DEFAULT_IV was substituted (set by optionToInput). */
  ivDefaulted?: boolean;
  /** Set by the chain adapter when it modelled the greeks itself (Alpaca gap-fill). */
  greekSource?: GreekSource;
  daysToExpiry: number;
  greeks?: {
    delta?: number;
    gamma?: number;
    vega?: number;
    theta?: number;
    vanna?: number;
    charm?: number;
  };
}

export interface StrikeExposure {
  strike: number;
  // GEX in $B per 1% move; VEX in $M per 1 IV point (units v2)
  netGEX: number;
  callGEX: number;
  putGEX: number;
  netVEX: number;
  callVEX: number;
  putVEX: number;
  netDEX: number;
  netCharm: number;
  /**
   * Δ-adjusted GEX, $B per 1% (docs/GAMMA_RAW_VS_ADJUSTED.md): the hedge a
   * ±1% move actually requires, delta re-priced at both ends. call/put are
   * signed like callGEX (+) / putGEX (−).
   */
  callGEXAdj: number;
  putGEXAdj: number;
  netGEXAdj: number;
  /** Flow-signed estimate, $B per 1%: raw with today's opened near-dated OTM call OI re-signed dealer-short. */
  netGEXFlow: number;
  // Raw gamma/vanna values (unweighted) for diagnostics
  callGamma: number;
  putGamma: number;
  callVanna: number;
  putVanna: number;
  // Open interest breakdown
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
  // Data quality
  dtes: number[];       // Expirations contributing to this strike
  /** Share of this strike's gross GEX resting on modelled (not feed-supplied) gamma, 0–1. */
  modelledShare: number;
}

export interface ExposureSnapshot {
  symbol: string;
  spotPrice: number;
  calculatedAt: number;
  /** 2 = units documented in the file header (unweighted, VEX per IV point). */
  unitsVersion: 2;

  // Totals: GEX/DEX/charm $B, VEX $M per IV point
  totalGEX: number;
  /** Σ|contract GEX|, $B per 1% — the denominator of gammaConcentration. */
  grossGEX: number;
  /**
   * Net GEX by expiry scope, $B per 1%. `all` is the headline (every listed
   * expiry — SqueezeMetrics/Perfiliev); `frontExpiry` is the nearest listed
   * expiry (= 0DTE in session — what Bullflow's chart shows); `le7d` ≤ 7 days.
   */
  gexByScope: { all: number; frontExpiry: number; frontExpiryDays: number | null; le7d: number };
  totalVEX: number;
  totalDEX: number;
  totalCharm: number;
  callGEX: number;
  putGEX: number;
  putCallGEXRatio: number;

  // Regime
  regime: 'positive_gamma' | 'negative_gamma' | 'neutral' | 'transitioning';
  /** The shared regime read (shared/gex-regime.ts) — words, sign, zero-gamma distance. */
  regimeRead: GammaRegimeRead;
  /**
   * Net GEX as a share of the symbol's OWN gross gamma, in [-1, 1].
   *
   * The absolute regime thresholds (±$0.5B) are index-scale. Measured on live
   * CBOE chains: AAPL — a multi-trillion-dollar company — produces net GEX of
   * +0.26B, and DIA +0.44B, so both land in "transitioning" and the conviction
   * engine's GEX layer skips them. Every single name fails the same way, which
   * is why that layer scored 0 of 92 published ideas.
   *
   * net/gross is dimensionless and self-scaling: +1 means every strike's gamma
   * points the same way, 0 means dealers are balanced. It compares SPY and a
   * small cap on the same footing without needing market cap or history.
   */
  gammaConcentration: number;
  vexRegime: 'vol_tailwind' | 'vol_headwind' | 'vol_neutral';

  // Key structural levels
  /** = zeroGammaLevel (kept under the old name for consumers). */
  gammaFlipPrice: number | null;
  /** Spot-grid re-priced zero-gamma level nearest spot (null = no crossing within ±20%). */
  zeroGammaLevel: number | null;
  zeroGammaCrossings: number[];
  /** Net GEX ($B per 1%) re-priced across spot 0.8–1.2×, 41 points. */
  gammaProfile: Array<{ spot: number; netGEX: number }>;
  vannaFlipPrice: number | null;
  maxGammaStrike: number;
  maxVannaStrike: number;
  /** Strike above spot with the largest call GEX (all expiries) — SpotGamma definition. */
  callWall: number | null;
  /** Strike below spot with the largest put GEX (all expiries). */
  putWall: number | null;
  /** Same walls ranked by open interest instead of gamma. */
  callWallOI: number | null;
  putWallOI: number | null;
  zeroGammaProjection: number | null;

  // Strike detail (top-N by |GEX|)
  strikes: StrikeExposure[];

  // Strike × Expiration matrix (for Skylit-style heatmap)
  strikeExpiryMatrix: StrikeExpiryCell[];

  /**
   * Per-horizon levels (shared/gex-buckets.ts) — same wall/flip definitions as
   * the headline, computed from the same contracts. /api/gex/buckets reads this.
   */
  byDte?: Partial<Record<GexBucketKey, GexBucketSummary>>;

  // Diagnostics
  expirationsUsed: string[];
  strikesScanned: number;
  strikesWithOI: number;
  vannaComputed: number;    // How many vanna values were computed vs provided

  // Black-Scholes fallback disclosure (SR 11-7 F3.5 / P1-3). Flip, walls and
  // regime all rest on gamma; when a contract's gamma/delta was not supplied by
  // the feed, it was computed here under the assumptions below, and if the feed
  // had no IV either, under DEFAULT_IV. These fields say how much of the book
  // that describes. No sensitivity of levels to these assumptions has been
  // measured yet — this is disclosure, not validation.
  /** Contracts that passed the OI/strike filters and entered the aggregation. */
  contractsUsed: number;
  /** Of those, how many had gamma or delta computed by Black-Scholes here. */
  bsComputedCount: number;
  /** Of those, how many had Black-Scholes run on DEFAULT_IV because the feed had no IV. */
  ivFallbackCount: number;
  /** ivFallbackCount / contractsUsed (0 when nothing was used). */
  ivFallbackShare: number;
  /** Share of gross GEX on contracts left out of the zero-gamma sweep (no feed IV). */
  profileExcludedGrossShare: number;
  /** The fixed assumptions behind every computed greek. */
  bsAssumptions: { riskFreeRate: number; dividendYield: number; defaultIV: number };
  /** Contracts used, by where their gamma came from (see ExposureGreekSource). */
  greekSources: Record<ExposureGreekSource, number>;
  /** Share of contracts used whose gamma was modelled rather than feed-supplied, 0–1. */
  modelledShare: number;
  /** Share of gross GEX resting on modelled gamma, 0–1 — the number the UI should state. */
  modelledGrossShare: number;
  /** Raw vs Δ-adjusted vs flow-signed GEX with levels under each (shared/gex-adjusted.ts). */
  gammaMetrics?: GammaMetricsBlock;
}

export interface StrikeExpiryCell {
  strike: number;
  expiryLabel: string;  // e.g. "APR 14"
  dte: number;
  netGEX: number;       // $B per 1% move (units v2)
  netVEX: number;       // $M per 1 IV point (units v2)
  /** Δ-adjusted GEX, $B per 1% (finite ±1% move, delta re-priced) */
  netGEXAdj?: number;
  /** Flow-signed GEX estimate, $B per 1% */
  netGEXFlow?: number;
}

// ─── Black-Scholes helpers ──────────────────────────────────

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

const RISK_FREE = 0.045; // 4.5% — approx 3-month T-bill, adjust later if needed
// IV substituted when the feed supplies none. Judgmental, not measured: a flat
// 30% ignores skew and term structure, so gamma on those contracts is an
// assumption. Surfaced per snapshot as ivFallbackCount / ivFallbackShare.
export const DEFAULT_IV = 0.30;
const DIVIDEND_YIELD = 0; // computeAllGreeks has no dividend term

interface ComputedGreeks {
  delta: number;
  gamma: number;
  vega: number;
  vanna: number;
  charm: number;
}

function computeAllGreeks(
  spot: number,
  strike: number,
  tte: number,    // years
  iv: number,
  isCall: boolean,
): ComputedGreeks {
  if (tte <= 0 || iv <= 0 || spot <= 0 || strike <= 0) {
    return {
      delta: isCall ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0),
      gamma: 0, vega: 0, vanna: 0, charm: 0,
    };
  }

  const sqrtT = Math.sqrt(tte);
  const d1 = (Math.log(spot / strike) + (RISK_FREE + 0.5 * iv * iv) * tte) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const nd1 = normalPDF(d1);

  const delta = isCall ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = nd1 / (spot * iv * sqrtT);
  const vega = spot * nd1 * sqrtT / 100; // per 1% IV

  // Vanna = d(delta)/d(sigma) = -d2/sigma · phi(d1)
  //       = phi(d1) · (1 - d1/sigma·sqrtT)
  // Most common form: vanna = -exp(-q*T) · phi(d1) · d2 / sigma
  const vanna = -nd1 * d2 / iv;

  // Charm (delta decay) = d(delta)/d(t)
  // For call: -phi(d1) · [2rT - d2·sigma·sqrtT] / (2·T·sigma·sqrtT)
  // Simplified (no dividend):
  const charm = -nd1 * (2 * RISK_FREE * tte - d2 * iv * sqrtT) / (2 * tte * iv * sqrtT);

  return {
    delta,
    gamma,
    vega,
    vanna,
    charm: isCall ? charm : -charm,
  };
}

// ─── Main Aggregator ────────────────────────────────────────

/**
 * Units version of this snapshot's numbers. v2 (2026-09-29, docs/GEX_VEX_METHODOLOGY.md):
 *   - GEX totals / strikes / matrix: $B per 1% move, UNWEIGHTED (v1 multiplied each expiry
 *     by a 1.0/0.7/0.45/0.2 DTE weight, so "$/1%" was not true of the number)
 *   - VEX: $M per 1 IV point (v1 was $M per 1.00 of vol = 100 points, and DTE-weighted)
 *   - DEX / charm: dealer sign consistent with GEX (dealers long calls / short puts)
 *   - flip = spot-grid zero-gamma (v1: first sign change of a cumulative strike sum)
 */
export const EXPOSURE_UNITS_VERSION = 2 as const;

export function computeExposures(
  symbol: string,
  spotPrice: number,
  options: OptionInput[],
  expirationsUsed: string[] = [],
): ExposureSnapshot {
  if (spotPrice <= 0) {
    throw new Error(`Invalid spot price for ${symbol}: ${spotPrice}`);
  }

  const strikeMap = new Map<number, StrikeExposure>();
  const expiryMap = new Map<string, StrikeExpiryCell>(); // key: "strike|dte"
  const profileContracts: GammaContract[] = [];
  let vannaComputedCount = 0;
  let contractsUsed = 0;
  let bsComputedCount = 0;
  let ivFallbackCount = 0;
  let grossGEXDollars = 0;
  let grossExcludedFromProfile = 0;
  const greekSources: Record<ExposureGreekSource, number> = {
    'provider': 0, 'implied-from-price': 0, 'smile-interpolated': 0, 'bs-feed-iv': 0, 'default-iv': 0,
  };
  let modelledGrossDollars = 0;
  const strikeModelledGross = new Map<number, number>();
  const strikeGross = new Map<number, number>();
  // Book totals over EVERY strike. The per-strike table/matrix below keeps only
  // ±40% of spot (display), but truncating the totals there dropped the OTM
  // wings of high-IV names: measured 2026-09-29 on BE (IV ~90%) it cut net GEX
  // by 13% and net VEX by 50% vs the full-ladder reference.
  let bookGEX = 0; let bookVEX = 0; let bookDEX = 0; let bookCharm = 0;
  let bookCallGEX = 0; let bookPutGEX = 0;
  // Net GEX per expiry (key = days to expiry, 2dp) — for the scope breakdown that
  // makes our headline comparable to vendors that chart 0DTE only (Bullflow).
  const byExpiry = new Map<number, number>();
  const bucketLegs: BucketLeg[] = [];
  const S = spotPrice;
  // Δ-adjusted and flow-signed books (docs/GAMMA_RAW_VS_ADJUSTED.md). Same
  // contracts, same loop — no extra provider call.
  let adjNet = 0; let adjGross = 0; let adjUp = 0; let adjDown = 0;
  let flowNet = 0; let flowResigned = 0;
  const flowProfileContracts: GammaContract[] = [];

  for (const opt of options) {
    const oi = opt.openInterest || 0;
    const vol = opt.volume || 0;
    // GEX is an open-interest measure: a contract with no OI has no dealer
    // inventory to hedge yet. (v1 substituted volume for OI here; that counted
    // intraday round-trips as inventory. Volume is still carried for vol/OI reads.)
    if (oi <= 0 && vol <= 0) continue;

    const inBand = opt.strike >= S * 0.6 && opt.strike <= S * 1.4;

    const isCall = opt.optionType === 'call';
    const sign = isCall ? 1 : -1;
    const ivDefaulted = opt.ivDefaulted === true || !(opt.impliedVolatility > 0);
    const iv = opt.impliedVolatility > 0 ? opt.impliedVolatility : DEFAULT_IV;
    contractsUsed++;
    const tte = Math.max(MIN_T_YEARS, opt.daysToExpiry / 365.25);

    // Use provided greeks if valid, else compute
    let gamma = opt.greeks?.gamma;
    let vanna = opt.greeks?.vanna;
    let delta = opt.greeks?.delta;
    let charm = opt.greeks?.charm;
    let coreComputedHere = false;

    const needsCompute = !Number.isFinite(gamma) || gamma === 0 ||
                         !Number.isFinite(vanna) ||
                         !Number.isFinite(delta) || delta === 0 ||
                         !Number.isFinite(charm);

    if (needsCompute) {
      const bs = computeAllGreeks(S, opt.strike, tte, iv, isCall);
      const coreGreekComputed =
        !Number.isFinite(gamma!) || gamma === 0 || !Number.isFinite(delta!) || delta === 0;
      if (coreGreekComputed) {
        coreComputedHere = true;
        bsComputedCount++;
        if (ivDefaulted) ivFallbackCount++;
      }
      if (!Number.isFinite(gamma!) || gamma === 0) gamma = bs.gamma;
      if (!Number.isFinite(vanna!)) { vanna = bs.vanna; vannaComputedCount++; }
      if (!Number.isFinite(delta!) || delta === 0) delta = bs.delta;
      if (!Number.isFinite(charm!)) charm = bs.charm;
    }

    // GEX $ per 1% move: Γ·OI·100·S²·0.01 (the 100 multiplier and 0.01 cancel), in $B.
    const gexAbs = gexPer1Pct(gamma!, oi, S);
    grossGEXDollars += gexAbs;
    const src: ExposureGreekSource =
      opt.greekSource === 'implied-from-price' || opt.greekSource === 'smile-interpolated' ? opt.greekSource
      : coreComputedHere ? (ivDefaulted ? 'default-iv' : 'bs-feed-iv')
      : 'provider';
    greekSources[src]++;
    const modelled = src !== 'provider';
    if (modelled) modelledGrossDollars += gexAbs;
    const callGexContribution = isCall ? gexAbs / 1e9 : 0;
    const putGexContribution = !isCall ? -gexAbs / 1e9 : 0;

    // VEX $ per 1 IV point, liquidity sign: −(dealer vanna). Dealers long calls /
    // short puts ⇒ dealer vanna = sign·vanna, so VEX = −sign·vanna·OI·100·S·0.01.
    // + = dealers BUY underlying as IV rises. In $M.
    const vexContribution = (-sign * vannaPerVolPt(vanna!, oi, S)) / 1e6;

    // DEX: dealer delta notional ($B) — dealers long calls (+Δ), short puts (−Δ_put ⇒ +).
    const dexContribution = (sign * oi * delta! * 100 * S) / 1e9;

    // Charm: dealer delta decay per year, notional ($B). Same dealer sign as DEX.
    const charmContribution = (sign * oi * charm! * 100 * S) / 1e9;

    // Δ-adjusted: shares traded for a ±1% move with delta re-priced at both ends
    // (BS on the contract's IV — feed deltas exist only at today's spot).
    const mv = oi > 0 ? deltaMoveSplit(S, opt.strike, tte, iv, oi, RISK_FREE) : { up: 0, down: 0 };
    const adjAbs = (mv.up + mv.down) / 2;
    const adjContribution = (sign * adjAbs) / 1e9;
    adjNet += adjContribution; adjGross += adjAbs / 1e9;
    adjUp += (sign * mv.up) / 1e9; adjDown += (sign * mv.down) / 1e9;
    // Flow-signed: w of this line's OI assumed customer-long (dealer-short).
    const w = flowResignWeight(isCall, opt.strike, S, opt.daysToExpiry, vol, oi);
    const flowContribution = (sign * gexAbs - 2 * w * gexAbs) / 1e9;
    flowNet += flowContribution; flowResigned += (w * gexAbs) / 1e9;

    // Zero-gamma sweep input. Contracts whose IV was defaulted are excluded (a flat
    // 30% would move the crossing by assumption, not by data); their gross share is disclosed.
    if (oi > 0) {
      if (!ivDefaulted) {
        profileContracts.push({ strike: opt.strike, T: tte, iv, oi, isCall });
        // isCall:false on the re-signed share only flips the sign (BS gamma is call/put-symmetric).
        if (w > 0) {
          flowProfileContracts.push({ strike: opt.strike, T: tte, iv, oi: oi * w, isCall: false });
          if (w < 1) flowProfileContracts.push({ strike: opt.strike, T: tte, iv, oi: oi * (1 - w), isCall });
        } else flowProfileContracts.push({ strike: opt.strike, T: tte, iv, oi, isCall });
      } else grossExcludedFromProfile += gexAbs;
      bucketLegs.push({
        strike: opt.strike, dte: opt.daysToExpiry, isCall, oi, gexDollars: gexAbs,
        T: ivDefaulted ? undefined : tte, iv: ivDefaulted ? undefined : iv,
      });
    }

    bookGEX += callGexContribution + putGexContribution;
    {
      const k = Math.round(opt.daysToExpiry * 100) / 100;
      byExpiry.set(k, (byExpiry.get(k) ?? 0) + callGexContribution + putGexContribution);
    }
    bookVEX += vexContribution;
    bookDEX += dexContribution;
    bookCharm += charmContribution;
    if (isCall) bookCallGEX += callGexContribution; else bookPutGEX += -putGexContribution;

    // Per-strike rows and the matrix: ±40% of spot only — beyond that the rows
    // are display noise (their exposure is already in the book totals above).
    if (!inBand) continue;

    if (!strikeMap.has(opt.strike)) {
      strikeMap.set(opt.strike, {
        strike: opt.strike,
        netGEX: 0, callGEX: 0, putGEX: 0,
        netVEX: 0, callVEX: 0, putVEX: 0,
        netDEX: 0, netCharm: 0,
        callGEXAdj: 0, putGEXAdj: 0, netGEXAdj: 0, netGEXFlow: 0,
        callGamma: 0, putGamma: 0, callVanna: 0, putVanna: 0,
        callOI: 0, putOI: 0, callVolume: 0, putVolume: 0,
        dtes: [], modelledShare: 0,
      });
    }
    const entry = strikeMap.get(opt.strike)!;
    strikeGross.set(opt.strike, (strikeGross.get(opt.strike) ?? 0) + gexAbs);
    if (modelled) strikeModelledGross.set(opt.strike, (strikeModelledGross.get(opt.strike) ?? 0) + gexAbs);

    if (isCall) {
      entry.callGEX += callGexContribution;
      entry.callVEX += vexContribution;
      entry.callGamma = Math.max(entry.callGamma, gamma!);
      entry.callVanna = Math.max(Math.abs(entry.callVanna), Math.abs(vanna!));
      entry.callOI += oi;
      entry.callVolume += vol;
    } else {
      entry.putGEX += putGexContribution;
      entry.putVEX += vexContribution;
      entry.putGamma = Math.max(entry.putGamma, gamma!);
      entry.putVanna = Math.max(Math.abs(entry.putVanna), Math.abs(vanna!));
      entry.putOI += oi;
      entry.putVolume += vol;
    }

    entry.netDEX += dexContribution;
    entry.netCharm += charmContribution;
    if (isCall) entry.callGEXAdj += adjContribution; else entry.putGEXAdj += adjContribution;
    entry.netGEXFlow += flowContribution;
    if (!entry.dtes.includes(opt.daysToExpiry)) {
      entry.dtes.push(opt.daysToExpiry);
    }

    // Per-expiry matrix accumulation — same units as the strike rows ($B GEX, $M VEX per IV pt).
    const dteBucket = Math.round(opt.daysToExpiry);
    const expiryKey = `${opt.strike}|${dteBucket}`;
    const gexContrib = callGexContribution + putGexContribution;
    if (!expiryMap.has(expiryKey)) {
      const expiryDate = new Date(Date.now() + dteBucket * 86400000);
      const expiryLabel = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      expiryMap.set(expiryKey, { strike: opt.strike, expiryLabel, dte: dteBucket, netGEX: 0, netVEX: 0, netGEXAdj: 0, netGEXFlow: 0 });
    }
    const expiryCell = expiryMap.get(expiryKey)!;
    expiryCell.netGEX += gexContrib;
    expiryCell.netVEX += vexContribution;
    expiryCell.netGEXAdj! += adjContribution;
    expiryCell.netGEXFlow! += flowContribution;
  }

  // Compute net exposures
  for (const entry of Array.from(strikeMap.values())) {
    entry.netGEX = entry.callGEX + entry.putGEX;
    entry.netVEX = entry.callVEX + entry.putVEX;
    entry.netGEXAdj = entry.callGEXAdj + entry.putGEXAdj;
    const g = strikeGross.get(entry.strike) ?? 0;
    entry.modelledShare = g > 0 ? (strikeModelledGross.get(entry.strike) ?? 0) / g : 0;
  }
  const modelledCount = contractsUsed - greekSources.provider;
  const modelledShare = contractsUsed > 0 ? modelledCount / contractsUsed : 0;
  const modelledGrossShare = grossGEXDollars > 0 ? modelledGrossDollars / grossGEXDollars : 0;

  const strikes = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);
  const bsAssumptions = { riskFreeRate: RISK_FREE, dividendYield: DIVIDEND_YIELD, defaultIV: DEFAULT_IV };

  if (strikes.length === 0) {
    const read = classifyGammaRegime({ netGEX: 0, grossGEX: 0, spot: S, zeroGamma: null });
    return {
      symbol, spotPrice, calculatedAt: Date.now(), unitsVersion: EXPOSURE_UNITS_VERSION,
      totalGEX: 0, grossGEX: 0, gexByScope: { all: 0, frontExpiry: 0, frontExpiryDays: null, le7d: 0 }, totalVEX: 0, totalDEX: 0, totalCharm: 0, gammaConcentration: 0,
      callGEX: 0, putGEX: 0, putCallGEXRatio: 0,
      regime: 'neutral', regimeRead: read, vexRegime: 'vol_neutral',
      gammaFlipPrice: null, zeroGammaLevel: null, zeroGammaCrossings: [], gammaProfile: [],
      vannaFlipPrice: null,
      maxGammaStrike: spotPrice, maxVannaStrike: spotPrice,
      callWall: null, putWall: null, callWallOI: null, putWallOI: null, zeroGammaProjection: null,
      strikes: [],
      strikeExpiryMatrix: [],
      expirationsUsed, strikesScanned: 0, strikesWithOI: 0, vannaComputed: 0,
      contractsUsed, bsComputedCount, ivFallbackCount,
      ivFallbackShare: contractsUsed > 0 ? ivFallbackCount / contractsUsed : 0,
      profileExcludedGrossShare: 0,
      bsAssumptions,
      greekSources, modelledShare, modelledGrossShare,
    };
  }

  // Aggregate totals — the whole book, every strike (see bookGEX above).
  const totalGEX = bookGEX;
  const totalVEX = bookVEX;
  const totalDEX = bookDEX;
  const totalCharm = bookCharm;
  const callGEX = bookCallGEX;
  const putGEX = bookPutGEX;
  const grossGEX = grossGEXDollars / 1e9;

  /**
   * Zero-gamma level — spot-grid re-pricing (Perfiliev / SpotGamma method).
   *
   * Every contract's Black-Scholes gamma is re-priced at each hypothetical spot
   * in [0.8·S, 1.2·S] with its own IV and tenor held fixed; the net GEX curve's
   * crossing nearest spot is bisected. The v1 "flip" was the first sign change of
   * a cumulative per-strike sum evaluated at TODAY's spot — measured 2026-09-29 it
   * returned no level at all for SPY (reference 767.78, spot 763.76) and 270 for BE
   * (reference 257.60).
   */
  const profile = gammaProfile(profileContracts, S, { lo: 0.8, hi: 1.2, steps: 120, r: RISK_FREE });
  const gammaFlipPrice = profile.zeroGamma;

  // Vanna flip — still the cumulative-strike estimate (no re-pricing); disclosed as such.
  let vannaFlipPrice: number | null = null;
  let cumVex = 0;
  let prevVexSign = 0;
  for (const s of strikes) {
    cumVex += s.netVEX;
    const sign = Math.sign(cumVex);
    if (prevVexSign !== 0 && sign !== prevVexSign) {
      vannaFlipPrice = s.strike;
      break;
    }
    prevVexSign = sign;
  }

  // Max gamma/vanna strike
  let maxGammaStrike = strikes[0].strike;
  let maxGamma = 0;
  let maxVannaStrike = strikes[0].strike;
  let maxVanna = 0;
  for (const s of strikes) {
    if (Math.abs(s.netGEX) > maxGamma) {
      maxGamma = Math.abs(s.netGEX);
      maxGammaStrike = s.strike;
    }
    if (Math.abs(s.netVEX) > maxVanna) {
      maxVanna = Math.abs(s.netVEX);
      maxVannaStrike = s.strike;
    }
  }

  /**
   * Walls — shared/gex-math pickWalls(): SpotGamma's definition, ranked by the
   * leg's gamma $ summed over ALL expiries (unweighted), call wall above spot,
   * put wall below. v1 ranked by OI; with v1's DTE weighting, gamma ranking had
   * collapsed onto the ATM 0DTE strike. Unweighted, SPY 2026-09-29 gives call
   * wall 785 (+2.8%) by gamma vs 800 by OI, put wall 760 by gamma vs 500 by OI
   * (a collar strike 35% below spot). Both variants ship; the OI pair is labelled.
   */
  const walls = pickWalls(
    strikes.map((s) => ({ strike: s.strike, callOI: s.callOI, putOI: s.putOI, callGEX: s.callGEX, putGEX: Math.abs(s.putGEX) })),
    S,
  );

  // Kept for wire compatibility. Positive book → max-gamma strike (pin magnet);
  // otherwise the zero-gamma level. The hub labels which one it is.
  const zeroGammaProjection = totalGEX > 0 ? maxGammaStrike : gammaFlipPrice;

  const gammaConcentration = grossGEX > 0 ? totalGEX / grossGEX : 0;
  const expKeys = [...byExpiry.keys()].sort((a, b) => a - b);
  const gexByScope = {
    all: totalGEX,
    frontExpiry: expKeys.length ? byExpiry.get(expKeys[0])! : 0,
    frontExpiryDays: expKeys.length ? expKeys[0] : null,
    le7d: expKeys.filter((k) => k <= 7).reduce((a, k) => a + byExpiry.get(k)!, 0),
  };
  const regimeRead = classifyGammaRegime({ netGEX: totalGEX * 1e9, grossGEX: grossGEX * 1e9, spot: S, zeroGamma: gammaFlipPrice });
  const regime: ExposureSnapshot['regime'] = regimeRead.legacy;

  // VEX regime: + = dealers buy as IV rises. $M per IV point; ±1.5 = v1's ±150 ($M per 100 pts).
  const vexRegime: ExposureSnapshot['vexRegime'] =
    totalVEX > 1.5 ? 'vol_tailwind'
    : totalVEX < -1.5 ? 'vol_headwind'
    : 'vol_neutral';

  const strikesWithOI = strikes.filter((s) => s.callOI + s.putOI > 0).length;
  const strikeExpiryMatrix = Array.from(expiryMap.values())
    .sort((a, b) => b.strike - a.strike || a.dte - b.dte);

  // ── Raw vs Δ-adjusted vs flow-signed (docs/GAMMA_RAW_VS_ADJUSTED.md) ──
  // Levels use the same ±40% strike rows and the same wall/zero-γ definitions
  // as the headline, so "raw" here reproduces callWall/putWall/maxGammaStrike.
  const gammaMetrics: GammaMetricsBlock = (() => {
    const bal = (n: number, g: number) => (g > 0 ? n / g : null);
    const rawLv = levelsFor(
      strikes.map((s) => ({ strike: s.strike, call: s.callGEX, put: s.putGEX, net: s.netGEX, callOI: s.callOI, putOI: s.putOI })),
      strikeExpiryMatrix.map((c) => ({ strike: c.strike, dte: c.dte, value: c.netGEX })), S, gammaFlipPrice,
    );
    // Coarser grid than the headline (60 vs 120 steps): bisection makes the crossing exact either way.
    const adjZ = profileContracts.length ? gammaProfile(profileContracts, S, { lo: 0.8, hi: 1.2, steps: 60, r: RISK_FREE, kernel: 'delta1pct' }).zeroGamma : null;
    const adjLv = levelsFor(
      strikes.map((s) => ({ strike: s.strike, call: s.callGEXAdj, put: s.putGEXAdj, net: s.netGEXAdj, callOI: s.callOI, putOI: s.putOI })),
      strikeExpiryMatrix.map((c) => ({ strike: c.strike, dte: c.dte, value: c.netGEXAdj ?? 0 })), S, adjZ,
    );
    const flowZ = flowResigned > 0 && flowProfileContracts.length
      ? gammaProfile(flowProfileContracts, S, { lo: 0.8, hi: 1.2, steps: 60, r: RISK_FREE }).zeroGamma
      : gammaFlipPrice;
    const flowLv = levelsFor(
      strikes.map((s) => ({ strike: s.strike, call: s.callGEX, put: s.putGEX, net: s.netGEXFlow, callOI: s.callOI, putOI: s.putOI })),
      strikeExpiryMatrix.map((c) => ({ strike: c.strike, dte: c.dte, value: c.netGEXFlow ?? 0 })), S, flowZ,
    );
    const notes = [
      'All three are $ of underlying per 1% move under the naive-OI dealer sign (calls +, puts −) unless stated.',
      'Δ-adjusted re-prices Black-Scholes delta at spot ±1% on each contract\'s own IV (r = 4.5%); raw uses feed gamma where supplied.',
      'Flow-signed re-signs only near-dated (0.75–21 d) OTM (+2–25%) calls, in proportion to today\'s volume ÷ OI — an assumption, not observed trade sides.',
    ];
    if (grossGEXDollars > 0 && grossExcludedFromProfile / grossGEXDollars > 0.02) notes.push('Contracts without feed IV are left out of every zero-γ sweep (share disclosed as profileExcludedGrossShare).');
    return {
      version: 1, unit: '$B per 1% move', defs: GAMMA_METRIC_DEFS,
      raw: { net: totalGEX, gross: grossGEX, balance: bal(totalGEX, grossGEX), levels: rawLv },
      deltaAdjusted: { net: adjNet, gross: adjGross, balance: bal(adjNet, adjGross), levels: adjLv, moveUp: adjUp, moveDown: adjDown },
      flowSigned: { net: flowNet, gross: grossGEX, balance: bal(flowNet, grossGEX), levels: flowLv, resignedGross: flowResigned, resignedShare: grossGEX > 0 ? flowResigned / grossGEX : null },
      differs: { deltaAdjusted: diffLevels(rawLv, adjLv, S), flowSigned: diffLevels(rawLv, flowLv, S) },
      keyStrikeOverlap: overlapCount(rawLv.keyStrikes, adjLv.keyStrikes),
      notes,
    };
  })();

  logger.info(
    `[EXPOSURES] ${symbol}: ${strikes.length} strikes, ` +
    `GEX=${totalGEX.toFixed(3)}B/1% VEX=${totalVEX.toFixed(2)}M/IVpt DEX=${totalDEX.toFixed(2)}B ` +
    `zeroγ=$${gammaFlipPrice?.toFixed(2) ?? '—'} vflip≈$${vannaFlipPrice || '—'} ` +
    `maxγ=$${maxGammaStrike} walls ${walls.putWall ?? '—'}/${walls.callWall ?? '—'} ` +
    `bal=${gammaConcentration.toFixed(3)} regime=${regime}/${vexRegime} ` +
    `modelled=${(modelledGrossShare * 100).toFixed(1)}%gross`,
  );

  return {
    symbol, spotPrice, calculatedAt: Date.now(), unitsVersion: EXPOSURE_UNITS_VERSION,
    totalGEX, grossGEX, gexByScope, totalVEX, totalDEX, totalCharm, gammaConcentration,
    callGEX, putGEX,
    putCallGEXRatio: callGEX > 0 ? putGEX / callGEX : 0,
    regime, regimeRead, vexRegime,
    gammaFlipPrice,
    zeroGammaLevel: gammaFlipPrice,
    zeroGammaCrossings: profile.crossings,
    gammaProfile: thinProfile(profile.points, 41).map((p) => ({ spot: p.spot, netGEX: p.netGEX / 1e9 })),
    vannaFlipPrice,
    maxGammaStrike, maxVannaStrike,
    callWall: walls.callWall, putWall: walls.putWall,
    callWallOI: walls.callWallOI, putWallOI: walls.putWallOI,
    zeroGammaProjection,
    strikes,
    strikeExpiryMatrix,
    gammaMetrics,
    byDte: bucketizeLegs(bucketLegs, S),
    expirationsUsed,
    strikesScanned: strikes.length,
    strikesWithOI,
    vannaComputed: vannaComputedCount,
    contractsUsed,
    bsComputedCount,
    ivFallbackCount,
    ivFallbackShare: contractsUsed > 0 ? ivFallbackCount / contractsUsed : 0,
    profileExcludedGrossShare: grossGEXDollars > 0 ? grossExcludedFromProfile / grossGEXDollars : 0,
    bsAssumptions,
    greekSources, modelledShare, modelledGrossShare,
  };
}

// ─── Adapter from Tradier/Yahoo option shape ───────────────

export function optionToInput(opt: any, expDateStr?: string): OptionInput | null {
  if (!opt || !opt.strike) return null;
  const optionType = (opt.option_type || opt.type || '').toLowerCase() as 'call' | 'put';
  if (optionType !== 'call' && optionType !== 'put') return null;

  const exp = expDateStr || opt.expiration_date || opt.expiration || '';
  let dte = 0;
  if (exp) {
    // Expiry instant = 16:00 America/New_York (was 16:00 in the SERVER's zone —
    // noon ET on a UTC droplet). Contracts already past expiry carry no forward
    // exposure and are dropped rather than floored to T≈0 (which gave an expired
    // ATM 0DTE contract near-infinite gamma after the close).
    const expTime = /^\d{4}-\d{2}-\d{2}$/.test(exp) ? expiryInstantMs(exp) : new Date(exp).getTime();
    if (Number.isFinite(expTime) && expTime <= Date.now()) return null;
    dte = Math.max(0, (expTime - Date.now()) / 86400000);
  }

  // Prefer mid_iv, then smv_vol, then ask_iv, then bid_iv
  const g = opt.greeks || {};
  const feedIV = g.mid_iv || g.smv_vol || g.ask_iv || g.bid_iv || opt.impliedVolatility;
  const ivDefaulted = !(feedIV > 0);
  const iv = ivDefaulted ? DEFAULT_IV : feedIV;

  return {
    strike: opt.strike,
    optionType,
    openInterest: opt.open_interest || 0,
    volume: opt.volume || 0,
    impliedVolatility: iv,
    ivDefaulted,
    greekSource: opt.greek_source === 'implied-from-price' || opt.greek_source === 'smile-interpolated' || opt.greek_source === 'provider'
      ? opt.greek_source : undefined,
    daysToExpiry: dte,
    greeks: {
      delta: g.delta,
      gamma: g.gamma,
      vega: g.vega,
      theta: g.theta,
      vanna: g.vanna, // Tradier doesn't return this, will trigger compute
      charm: g.charm, // Tradier doesn't return this, will trigger compute
    },
  };
}
