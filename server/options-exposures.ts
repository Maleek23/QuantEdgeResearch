/**
 * Unified Options Exposures Calculator
 * =====================================
 * Computes GEX + VEX + DEX + CHARM aggregates from any options source.
 *
 * Handles the "no gaps" problem:
 *   - Computes vanna locally (Tradier doesn't return it)
 *   - Computes charm locally (neither source returns it)
 *   - Falls back to Black-Scholes when greeks missing
 *   - Handles missing IV via ATM proxy
 *   - Aggregates across multiple expirations
 *   - Weights near-term expirations higher (they dominate dealer hedging)
 *
 * Formulas:
 *   GEX(strike) = OI × Gamma × 100 × S² × sign_convention / 1e9
 *   VEX(strike) = OI × Vanna × 100 × S  / 1e6      (per 1% vol move, in $M)
 *   DEX(strike) = OI × Delta × 100 × S              / 1e9
 *   Charm(strike) = OI × dDelta/dt  × 100 × S       / 1e9
 *
 * Sign convention: dealers are assumed short calls (positive GEX), long puts (negative GEX).
 */

import { logger } from './logger';

// ─── Types ──────────────────────────────────────────────────

export interface OptionInput {
  strike: number;
  optionType: 'call' | 'put';
  openInterest: number;
  volume: number;
  impliedVolatility: number;        // decimal, e.g. 0.25 for 25%
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
  // Aggregates (all in $ billions, normalized)
  netGEX: number;
  callGEX: number;
  putGEX: number;
  netVEX: number;
  callVEX: number;
  putVEX: number;
  netDEX: number;
  netCharm: number;
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
}

export interface ExposureSnapshot {
  symbol: string;
  spotPrice: number;
  calculatedAt: number;

  // Totals (billions)
  totalGEX: number;
  totalVEX: number;
  totalDEX: number;
  totalCharm: number;
  callGEX: number;
  putGEX: number;
  putCallGEXRatio: number;

  // Regime
  regime: 'positive_gamma' | 'negative_gamma' | 'neutral' | 'transitioning';
  vexRegime: 'vol_tailwind' | 'vol_headwind' | 'vol_neutral';

  // Key structural levels
  gammaFlipPrice: number | null;
  vannaFlipPrice: number | null;
  maxGammaStrike: number;
  maxVannaStrike: number;
  callWall: number | null;
  putWall: number | null;
  zeroGammaProjection: number | null;

  // Strike detail (top-N by |GEX|)
  strikes: StrikeExposure[];

  // Strike × Expiration matrix (for Skylit-style heatmap)
  strikeExpiryMatrix: StrikeExpiryCell[];

  // Diagnostics
  expirationsUsed: string[];
  strikesScanned: number;
  strikesWithOI: number;
  vannaComputed: number;    // How many vanna values were computed vs provided
}

export interface StrikeExpiryCell {
  strike: number;
  expiryLabel: string;  // e.g. "APR 14"
  dte: number;
  netGEX: number;       // in billions
  netVEX: number;       // in millions
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
  let vannaComputedCount = 0;
  const S2 = spotPrice * spotPrice;
  const MULT = 100;

  // Near-term weighting: 0-7 DTE = 1.0, 7-21 = 0.7, 21-45 = 0.45, 45+ = 0.2
  function dteWeight(dte: number): number {
    if (dte <= 7) return 1.0;
    if (dte <= 21) return 0.7;
    if (dte <= 45) return 0.45;
    return 0.2;
  }

  for (const opt of options) {
    const oi = opt.openInterest || 0;
    const vol = opt.volume || 0;
    if (oi === 0 && vol === 0) continue;

    // Filter to meaningful strikes (within 25% of spot)
    if (opt.strike < spotPrice * 0.75 || opt.strike > spotPrice * 1.25) continue;

    const isCall = opt.optionType === 'call';
    const iv = opt.impliedVolatility > 0 ? opt.impliedVolatility : 0.30; // fallback IV
    const tte = Math.max(0.001, opt.daysToExpiry / 365.25);

    // Use provided greeks if valid, else compute
    let gamma = opt.greeks?.gamma;
    let vanna = opt.greeks?.vanna;
    let delta = opt.greeks?.delta;
    let charm = opt.greeks?.charm;

    const needsCompute = !Number.isFinite(gamma) || gamma === 0 ||
                         !Number.isFinite(vanna) ||
                         !Number.isFinite(delta) || delta === 0 ||
                         !Number.isFinite(charm);

    if (needsCompute) {
      const bs = computeAllGreeks(spotPrice, opt.strike, tte, iv, isCall);
      if (!Number.isFinite(gamma!) || gamma === 0) gamma = bs.gamma;
      if (!Number.isFinite(vanna!)) { vanna = bs.vanna; vannaComputedCount++; }
      if (!Number.isFinite(delta!) || delta === 0) delta = bs.delta;
      if (!Number.isFinite(charm!)) charm = bs.charm;
    }

    // OI-weighted effective quantity (use volume as proxy when OI is 0 — common after hours)
    const effectiveOI = oi > 0 ? oi : Math.max(0, vol);
    const weight = dteWeight(opt.daysToExpiry);

    // GEX: call = +, put = − (dealer convention)
    // Formula: OI × Gamma × 100 × 0.01 × S² / 1e9  (per 1% move, in $B)
    // The 100 (contract multiplier) × 0.01 (1% factor) cancel to 1.
    const callGexContribution = isCall
      ? effectiveOI * gamma! * S2 * weight / 1e9
      : 0;
    const putGexContribution = !isCall
      ? -effectiveOI * gamma! * S2 * weight / 1e9
      : 0;

    // VEX: vanna · OI · contract × spot (normalized to millions)
    // Sign convention: positive vanna → price up when IV up
    // For calls: dealer short → dealer's vanna negative contribution
    // For puts: dealer long → dealer's vanna positive contribution
    // Note: VEX uses /1e6 (not /1e9 like GEX) because vanna×S produces values
    // ~250x smaller than gamma×S² — using /1e9 makes most VEX values sub-threshold.
    const vexContribution = (isCall ? -1 : 1) * effectiveOI * vanna! * MULT * spotPrice * weight / 1e6;

    // DEX (delta exposure)
    const dexContribution = (isCall ? -1 : 1) * effectiveOI * delta! * MULT * spotPrice * weight / 1e9;

    // Charm (per day delta decay)
    const charmContribution = (isCall ? -1 : 1) * effectiveOI * charm! * MULT * spotPrice * weight / 1e9;

    if (!strikeMap.has(opt.strike)) {
      strikeMap.set(opt.strike, {
        strike: opt.strike,
        netGEX: 0, callGEX: 0, putGEX: 0,
        netVEX: 0, callVEX: 0, putVEX: 0,
        netDEX: 0, netCharm: 0,
        callGamma: 0, putGamma: 0, callVanna: 0, putVanna: 0,
        callOI: 0, putOI: 0, callVolume: 0, putVolume: 0,
        dtes: [],
      });
    }
    const entry = strikeMap.get(opt.strike)!;

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
    if (!entry.dtes.includes(opt.daysToExpiry)) {
      entry.dtes.push(opt.daysToExpiry);
    }

    // Per-expiry matrix accumulation
    const dteBucket = Math.round(opt.daysToExpiry);
    const expiryKey = `${opt.strike}|${dteBucket}`;
    const gexContrib = callGexContribution + putGexContribution;
    if (!expiryMap.has(expiryKey)) {
      const expiryDate = new Date(Date.now() + dteBucket * 86400000);
      const expiryLabel = expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
      expiryMap.set(expiryKey, { strike: opt.strike, expiryLabel, dte: dteBucket, netGEX: 0, netVEX: 0 });
    }
    const expiryCell = expiryMap.get(expiryKey)!;
    expiryCell.netGEX += gexContrib;
    expiryCell.netVEX += vexContribution;
  }

  // Compute net exposures
  for (const entry of Array.from(strikeMap.values())) {
    entry.netGEX = entry.callGEX + entry.putGEX;
    entry.netVEX = entry.callVEX + entry.putVEX;
  }

  const strikes = Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);

  if (strikes.length === 0) {
    return {
      symbol, spotPrice, calculatedAt: Date.now(),
      totalGEX: 0, totalVEX: 0, totalDEX: 0, totalCharm: 0,
      callGEX: 0, putGEX: 0, putCallGEXRatio: 0,
      regime: 'neutral', vexRegime: 'vol_neutral',
      gammaFlipPrice: null, vannaFlipPrice: null,
      maxGammaStrike: spotPrice, maxVannaStrike: spotPrice,
      callWall: null, putWall: null, zeroGammaProjection: null,
      strikes: [],
      strikeExpiryMatrix: [],
      expirationsUsed, strikesScanned: 0, strikesWithOI: 0, vannaComputed: 0,
    };
  }

  // Aggregate totals
  const totalGEX = strikes.reduce((sum, s) => sum + s.netGEX, 0);
  const totalVEX = strikes.reduce((sum, s) => sum + s.netVEX, 0);
  const totalDEX = strikes.reduce((sum, s) => sum + s.netDEX, 0);
  const totalCharm = strikes.reduce((sum, s) => sum + s.netCharm, 0);
  const callGEX = strikes.reduce((sum, s) => sum + Math.max(0, s.callGEX), 0);
  const putGEX = Math.abs(strikes.reduce((sum, s) => sum + Math.min(0, s.putGEX), 0));

  // Find gamma flip (where cumulative gamma crosses zero)
  let gammaFlipPrice: number | null = null;
  let cumGamma = 0;
  let prevSign = 0;
  for (const s of strikes) {
    cumGamma += s.netGEX;
    const sign = Math.sign(cumGamma);
    if (prevSign !== 0 && sign !== prevSign) {
      gammaFlipPrice = s.strike;
      break;
    }
    prevSign = sign;
  }

  // Vanna flip (where cumulative VEX crosses zero)
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

  // Walls
  const callWall = strikes
    .filter((s) => s.strike > spotPrice && s.netGEX > 0)
    .sort((a, b) => b.netGEX - a.netGEX)[0]?.strike ?? null;

  const putWall = strikes
    .filter((s) => s.strike < spotPrice && s.netGEX < 0)
    .sort((a, b) => a.netGEX - b.netGEX)[0]?.strike ?? null;

  // Zero-gamma projection
  // In positive gamma regime → price magnetizes to max gamma
  // In negative gamma regime → breaks toward flip
  const zeroGammaProjection = totalGEX > 0 ? maxGammaStrike : gammaFlipPrice;

  // Regimes
  const regime: ExposureSnapshot['regime'] =
    totalGEX > 0.5 ? 'positive_gamma'
    : totalGEX < -0.5 ? 'negative_gamma'
    : Math.abs(totalGEX) < 0.2 ? 'neutral'
    : 'transitioning';

  // VEX regime: positive VEX = vol tailwind (higher vol = higher price via vanna)
  // VEX is in $M (not $B like GEX), so thresholds are 1000× the old values
  const vexRegime: ExposureSnapshot['vexRegime'] =
    totalVEX > 150 ? 'vol_tailwind'
    : totalVEX < -150 ? 'vol_headwind'
    : 'vol_neutral';

  const strikesWithOI = strikes.filter((s) => s.callOI + s.putOI > 0).length;

  logger.info(
    `[EXPOSURES] ${symbol}: ${strikes.length} strikes, ` +
    `GEX=${totalGEX.toFixed(2)}B VEX=${totalVEX.toFixed(1)}M DEX=${totalDEX.toFixed(2)}B ` +
    `flip=$${gammaFlipPrice || '—'} vflip=$${vannaFlipPrice || '—'} ` +
    `maxγ=$${maxGammaStrike} maxV=$${maxVannaStrike} ` +
    `regime=${regime}/${vexRegime} vannaComputed=${vannaComputedCount}`,
  );

  return {
    symbol, spotPrice, calculatedAt: Date.now(),
    totalGEX, totalVEX, totalDEX, totalCharm,
    callGEX, putGEX,
    putCallGEXRatio: callGEX > 0 ? putGEX / callGEX : 0,
    regime, vexRegime,
    gammaFlipPrice, vannaFlipPrice,
    maxGammaStrike, maxVannaStrike,
    callWall, putWall, zeroGammaProjection,
    strikes,
    // Include all strikes with any OI — let the frontend decide visibility.
    // Previous filter (netGEX > 0.0001) excluded far-OTM strikes, making
    // "ALL STRIKES" show the same data as collapsed view.
    strikeExpiryMatrix: Array.from(expiryMap.values())
      .sort((a, b) => b.strike - a.strike || a.dte - b.dte),
    expirationsUsed,
    strikesScanned: strikes.length,
    strikesWithOI,
    vannaComputed: vannaComputedCount,
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
    const expTime = new Date(exp + (exp.length <= 10 ? 'T16:00:00' : '')).getTime();
    dte = Math.max(0, (expTime - Date.now()) / 86400000);
  }

  // Prefer mid_iv, then smv_vol, then ask_iv, then bid_iv
  const g = opt.greeks || {};
  const iv = g.mid_iv || g.smv_vol || g.ask_iv || g.bid_iv || opt.impliedVolatility || 0.30;

  return {
    strike: opt.strike,
    optionType,
    openInterest: opt.open_interest || 0,
    volume: opt.volume || 0,
    impliedVolatility: iv,
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
