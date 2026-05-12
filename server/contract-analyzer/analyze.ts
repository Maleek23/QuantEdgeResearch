/**
 * CONTRACT ANALYZER — End-to-End Engine
 * =======================================
 * Given a ContractSpec (symbol + strike + expiry + type), run every signal
 * fetcher in parallel and produce a Bullflow-style graded analysis card.
 *
 * Output:
 *   - streaming-style status lines (rendered as terminal output)
 *   - 8-12 graded signals (A+ to F per signal)
 *   - "tempered by X" synthesis paragraph
 *   - Final composite grade
 *   - ROI scenarios at ±1σ, ±2σ
 *   - Trade plan: T1, T2, invalidation
 *
 * Uses the existing conviction-agent grading logic but specialized for a
 * single contract (instead of pattern-matched ticker scan).
 */

import { logger } from '../logger';
import {
  computeComposite,
  scoreToExtendedGrade,
  synthesizeTake,
} from '../thesis-radar/conviction-agent';
import type { ExtendedGrade, SignalScore } from '@shared/thesis-radar-types';
import type { ContractSpec } from './parser';

// ─── Output shape ──────────────────────────────────────────────────

export interface ContractAnalysis {
  spec: ContractSpec;
  spotAtAnalysis: number;
  contractMid?: number;
  contractBid?: number;
  contractAsk?: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  signals: SignalScore[];
  finalGrade: ExtendedGrade;
  finalScore: number;
  synthesis: string;
  /** Streaming status lines, ordered */
  statusLines: string[];
  /** Trade plan derived from signals + Greeks */
  plan: {
    t1: number;        // first target (stock price)
    t2: number;        // second target
    invalidation: number;
    horizonDays: number;
    sellTriggers: { trim33: number; trim50: number; runner: number };
  };
  /** ROI scenarios at expiry */
  roiScenarios: { stockPrice: number; contractValue: number; roi: number; pct: number }[];
  /** Timestamp */
  analyzedAt: string;
}

// ─── Greeks (Black-Scholes) — reuses pattern from elsewhere ────────

function bsGreeks(
  S: number,        // spot
  K: number,        // strike
  T: number,        // years to expiry
  r: number,        // risk-free rate
  sigma: number,    // IV
  isCall: boolean,
): { delta: number; gamma: number; theta: number; vega: number; price: number } {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
    return { delta: 0, gamma: 0, theta: 0, vega: 0, price: intrinsic };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  // Normal CDF approximation (Abramowitz & Stegun)
  const N = (x: number): number => {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * ax);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
    return 0.5 * (1.0 + sign * y);
  };
  const phi = (x: number): number => Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);

  const Nd1 = N(d1);
  const Nd2 = N(d2);

  const price = isCall
    ? S * Nd1 - K * Math.exp(-r * T) * Nd2
    : K * Math.exp(-r * T) * N(-d2) - S * N(-d1);
  const delta = isCall ? Nd1 : Nd1 - 1;
  const gamma = phi(d1) / (S * sigma * sqrtT);
  const theta =
    (-S * phi(d1) * sigma / (2 * sqrtT) - r * K * Math.exp(-r * T) * (isCall ? Nd2 : 1 - Nd2)) / 365;
  const vega = (S * phi(d1) * sqrtT) / 100;

  return { delta, gamma, theta, vega, price };
}

// ─── Chain data fetcher ────────────────────────────────────────────

/**
 * Fetch the live option chain for the symbol and locate the user's contract.
 * Returns mid, bid, ask, IV, OI for that specific contract.
 */
async function fetchContractFromChain(spec: ContractSpec): Promise<{
  spot: number;
  contractMid: number;
  contractBid: number;
  contractAsk: number;
  iv: number;
  oi: number;
  volume: number;
  topStrikeOI: number;
  totalChainOI: number;
} | null> {
  try {
    const r = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${spec.symbol}.json`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as { data?: { close?: number; last?: number; options?: any[] } };
    const d = data.data;
    if (!d) return null;
    const spot = (d.close ?? d.last) || 0;
    if (!spot) return null;

    let target: any = null;
    let totalChainOI = 0;
    let topStrikeOI = 0;
    const occMatch = (occ: string) => {
      const m = occ.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
      if (!m) return null;
      return {
        sym: m[1],
        exp: `20${m[2]}-${m[3]}-${m[4]}`,
        type: m[5] === 'C' ? 'call' : 'put',
        strike: parseInt(m[6]) / 1000,
      };
    };

    for (const o of d.options ?? []) {
      const parsed = occMatch(o.option);
      if (!parsed) continue;
      const oi = Number(o.open_interest ?? 0);
      totalChainOI += oi;
      if (oi > topStrikeOI) topStrikeOI = oi;
      if (
        parsed.exp === spec.expiry &&
        parsed.type === spec.optionType &&
        Math.abs(parsed.strike - spec.strike) < 0.01
      ) {
        target = o;
      }
    }

    if (!target) return null;
    const mid = (Number(target.bid ?? 0) + Number(target.ask ?? 0)) / 2;
    return {
      spot,
      contractMid: mid,
      contractBid: Number(target.bid ?? 0),
      contractAsk: Number(target.ask ?? 0),
      iv: Number(target.iv ?? 0),
      oi: Number(target.open_interest ?? 0),
      volume: Number(target.volume ?? 0),
      topStrikeOI,
      totalChainOI,
    };
  } catch (e) {
    logger.warn(`[CONTRACT-ANALYZER] chain fetch failed: ${(e as Error).message}`);
    return null;
  }
}

// ─── Per-contract signal graders ───────────────────────────────────

function gradeOI(oi: number, topStrikeOI: number, totalChainOI: number): SignalScore | null {
  if (totalChainOI === 0) return null;
  const concentration = oi / totalChainOI;
  let score = 50;
  if (concentration >= 0.30) score += 30;
  else if (concentration >= 0.20) score += 22;
  else if (concentration >= 0.10) score += 12;
  if (oi >= 10000) score += 12;
  else if (oi >= 3000) score += 6;
  score = Math.min(100, score);
  return {
    label: `OI ${oi.toLocaleString()} (${(concentration * 100).toFixed(0)}% of chain)`,
    grade: scoreToExtendedGrade(score),
    score,
    source: 'unusual_activity',
  };
}

function gradeIV(iv: number, optionType: 'call' | 'put'): SignalScore | null {
  if (!iv || iv <= 0) return null;
  const ivPct = iv * 100;
  let score = 50;
  // For long calls/puts: lower IV is better (cheaper premium, room for vega expansion)
  if (ivPct < 30) score += 25;
  else if (ivPct < 50) score += 15;
  else if (ivPct < 80) score += 5;
  else if (ivPct >= 120) score -= 20;
  else if (ivPct >= 100) score -= 12;
  score = Math.max(0, Math.min(100, score));
  const cheap = ivPct < 50 ? ' (cheap — vega tailwind)' : ivPct >= 100 ? ' (juiced — vega headwind)' : '';
  return {
    label: `IV ${ivPct.toFixed(0)}%${cheap}`,
    grade: scoreToExtendedGrade(score),
    score,
    source: 'iv_skew',
  };
}

function gradeDelta(delta: number, optionType: 'call' | 'put'): SignalScore | null {
  const d = Math.abs(delta);
  let score = 50;
  let label: string;
  if (d >= 0.55 && d <= 0.70) {
    score = 85;
    label = `Delta ${d.toFixed(2)} — near-ATM, high gamma`;
  } else if (d >= 0.40 && d < 0.55) {
    score = 80;
    label = `Delta ${d.toFixed(2)} — slight OTM, balanced`;
  } else if (d >= 0.25 && d < 0.40) {
    score = 70;
    label = `Delta ${d.toFixed(2)} — OTM, leverage favored`;
  } else if (d < 0.25) {
    score = 50;
    label = `Delta ${d.toFixed(2)} — deep OTM, lottery`;
  } else {
    score = 65;
    label = `Delta ${d.toFixed(2)} — ITM, slow but safe`;
  }
  return { label, grade: scoreToExtendedGrade(score), score, source: 'price_action' };
}

function gradeTheta(theta: number, mid: number, dte: number): SignalScore | null {
  if (mid <= 0 || dte <= 0) return null;
  const dailyDecayPct = Math.abs(theta) / mid * 100;
  let score = 60;
  let label: string;
  if (dte < 14 && dailyDecayPct > 4) {
    score = 35;
    label = `Theta -$${Math.abs(theta).toFixed(3)}/day (${dailyDecayPct.toFixed(1)}% — BRUTAL near expiry)`;
  } else if (dte < 30 && dailyDecayPct > 2) {
    score = 50;
    label = `Theta -$${Math.abs(theta).toFixed(3)}/day (${dailyDecayPct.toFixed(1)}% — heavy)`;
  } else if (dailyDecayPct < 0.5) {
    score = 85;
    label = `Theta -$${Math.abs(theta).toFixed(3)}/day (${dailyDecayPct.toFixed(1)}% — slow burn)`;
  } else {
    score = 65;
    label = `Theta -$${Math.abs(theta).toFixed(3)}/day (${dailyDecayPct.toFixed(1)}%)`;
  }
  return { label, grade: scoreToExtendedGrade(score), score, source: 'price_action' };
}

function gradeMoneyness(spot: number, strike: number, optionType: 'call' | 'put'): SignalScore {
  const otmPct = optionType === 'call' ? (strike / spot - 1) * 100 : (1 - strike / spot) * 100;
  let score = 60;
  let label: string;
  if (Math.abs(otmPct) <= 3) {
    score = 80;
    label = `ATM strike (within 3% of spot) — gamma kingdom`;
  } else if (otmPct > 3 && otmPct <= 15) {
    score = 72;
    label = `+${otmPct.toFixed(0)}% OTM — leverage zone`;
  } else if (otmPct > 15 && otmPct <= 35) {
    score = 60;
    label = `+${otmPct.toFixed(0)}% OTM — needs catalyst`;
  } else if (otmPct > 35) {
    score = 45;
    label = `+${otmPct.toFixed(0)}% OTM — lottery strike`;
  } else if (otmPct < -10) {
    score = 65;
    label = `${otmPct.toFixed(0)}% ITM — high delta, low leverage`;
  } else {
    score = 70;
    label = `${otmPct.toFixed(0)}% from spot`;
  }
  return { label, grade: scoreToExtendedGrade(score), score, source: 'price_action' };
}

function gradeDTE(dte: number): SignalScore {
  let score = 60;
  let label: string;
  if (dte < 3) {
    score = 30;
    label = `${dte} DTE — 0DTE territory, max theta`;
  } else if (dte < 14) {
    score = 50;
    label = `${dte} DTE — weekly, theta heavy`;
  } else if (dte < 45) {
    score = 75;
    label = `${dte} DTE — sweet spot for swings`;
  } else if (dte < 180) {
    score = 80;
    label = `${dte} DTE — multi-month thesis`;
  } else {
    score = 85;
    label = `${dte} DTE — LEAP territory, theta minimal`;
  }
  return { label, grade: scoreToExtendedGrade(score), score, source: 'price_action' };
}

// ─── Catalyst lookup ──────────────────────────────────────────────

async function gradeCatalyst(symbol: string, dte: number): Promise<SignalScore | null> {
  try {
    const { getCatalystsForSymbol } = await import('../catalyst-tracker-service');
    const cats = await getCatalystsForSymbol(symbol).catch(() => []);
    if (!cats || cats.length === 0) return null;
    const nowMs = Date.now();
    let nearestDays: number | null = null;
    let nearestKind = '';
    for (const c of cats) {
      const ts = new Date(((c as any).date ?? (c as any).eventDate ?? '') as string).getTime();
      if (!ts || isNaN(ts) || ts < nowMs) continue;
      const days = Math.round((ts - nowMs) / 86400000);
      if (nearestDays == null || days < nearestDays) {
        nearestDays = days;
        nearestKind = ((c as any).type ?? (c as any).kind ?? 'catalyst') as string;
      }
    }
    if (nearestDays == null) return null;
    let score = 50;
    let labelExtra = '';
    if (nearestDays < dte) {
      // Catalyst BEFORE expiry — good (can drive the trade)
      if (nearestDays <= 14) { score = 85; labelExtra = ' — IV expansion likely'; }
      else if (nearestDays <= 30) { score = 78; labelExtra = ' — within sweet spot'; }
      else { score = 70; labelExtra = ''; }
    } else {
      // Catalyst AFTER expiry — neutral (no event risk but also no catalyst pop)
      score = 60;
      labelExtra = ' — after expiry (no event risk)';
    }
    return {
      label: `${nearestKind} in ${nearestDays}d${labelExtra}`,
      grade: scoreToExtendedGrade(score),
      score,
      source: 'news_nlp',
    };
  } catch {
    return null;
  }
}

// ─── Price-action grader (reuses chart-analysis) ───────────────────

async function gradePriceAction(symbol: string, spot: number, isCall: boolean): Promise<SignalScore | null> {
  try {
    const { fetchOHLCData } = await import('../chart-analysis');
    const ohlc = await fetchOHLCData(symbol, 'stock');
    if (!ohlc || !Array.isArray(ohlc.closes) || ohlc.closes.length < 50) return null;
    const closes: number[] = ohlc.closes;
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    // RSI 14
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const ch = closes[i] - closes[i - 1];
      if (ch > 0) gains += ch;
      else losses -= ch;
    }
    const rs = gains / (losses || 1);
    const rsi = 100 - 100 / (1 + rs);

    let score = 50;
    const labels: string[] = [];
    if (isCall) {
      if (spot > sma20) { score += 12; labels.push('above 20-SMA'); }
      if (spot > sma50) { score += 12; labels.push('above 50-SMA'); }
      if (rsi >= 50 && rsi < 70) { score += 10; labels.push(`RSI ${rsi.toFixed(0)} bullish`); }
      else if (rsi >= 70) { score -= 4; labels.push(`RSI ${rsi.toFixed(0)} overbought`); }
      else if (rsi < 40) { score -= 8; labels.push(`RSI ${rsi.toFixed(0)} weak`); }
    } else {
      if (spot < sma20) { score += 12; labels.push('below 20-SMA'); }
      if (spot < sma50) { score += 12; labels.push('below 50-SMA'); }
      if (rsi <= 50 && rsi > 30) { score += 10; labels.push(`RSI ${rsi.toFixed(0)} bearish`); }
      else if (rsi <= 30) { score -= 4; labels.push(`RSI ${rsi.toFixed(0)} oversold`); }
    }
    score = Math.max(0, Math.min(100, score));
    return {
      label: labels.length > 0 ? labels.slice(0, 2).join(' · ') : 'Trend neutral',
      grade: scoreToExtendedGrade(score),
      score,
      source: 'price_action',
    };
  } catch {
    return null;
  }
}

// ─── Analyst rating ────────────────────────────────────────────────

async function gradeAnalystSig(symbol: string, spot: number, isCall: boolean): Promise<SignalScore | null> {
  try {
    const { getAnalystSnapshot } = await import('../analyst-data-service');
    const snap = await getAnalystSnapshot(symbol).catch(() => null);
    if (!snap || !snap.targetMeanPrice) return null;
    const upside = ((snap.targetMeanPrice - spot) / spot) * 100;
    let score = 60;
    let label: string;
    if (isCall) {
      if (upside >= 30) { score = 85; label = `Analyst PT +${upside.toFixed(0)}% (buy-heavy)`; }
      else if (upside >= 10) { score = 75; label = `Analyst PT +${upside.toFixed(0)}%`; }
      else if (upside >= -5) { score = 55; label = `Analyst PT ${upside >= 0 ? '+' : ''}${upside.toFixed(0)}%`; }
      else { score = 35; label = `Analyst PT ${upside.toFixed(0)}% (below spot — bearish)`; }
    } else {
      // For puts: bearish analyst view (low upside) is bullish for the put
      if (upside <= -10) { score = 80; label = `Analyst PT ${upside.toFixed(0)}% (bearish)`; }
      else if (upside <= 0) { score = 65; label = `Analyst PT ${upside.toFixed(0)}%`; }
      else { score = 45; label = `Analyst PT +${upside.toFixed(0)}% (bullish — puts work against)`; }
    }
    return { label, grade: scoreToExtendedGrade(score), score, source: 'analyst_ratings' };
  } catch {
    return null;
  }
}

// ─── ROI scenario builder ─────────────────────────────────────────

function buildROIScenarios(
  spot: number,
  strike: number,
  iv: number,
  dte: number,
  optionType: 'call' | 'put',
  mid: number,
): ContractAnalysis['roiScenarios'] {
  const sigma = iv || 0.4;
  const annualMove = sigma * Math.sqrt(dte / 365);
  // Compute the contract value at +/- 0.5σ, ±1σ, ±2σ
  const moves = [-2, -1, -0.5, 0, 0.5, 1, 1.5, 2];
  const scenarios: ContractAnalysis['roiScenarios'] = [];
  // Use ~10% of original DTE remaining when evaluating outcome (mid-trade exit)
  const Tremaining = Math.max(0.01, (dte * 0.1) / 365);
  for (const m of moves) {
    const stockPrice = spot * (1 + m * annualMove);
    const isCall = optionType === 'call';
    const intrinsic = isCall ? Math.max(0, stockPrice - strike) : Math.max(0, strike - stockPrice);
    const { price } = bsGreeks(stockPrice, strike, Tremaining, 0.045, sigma, isCall);
    const contractValue = Math.max(intrinsic, price);
    scenarios.push({
      stockPrice,
      contractValue,
      roi: mid > 0 ? (contractValue - mid) / mid : 0,
      pct: m,
    });
  }
  return scenarios;
}

// ─── Main analyze function ─────────────────────────────────────────

export async function analyzeContract(spec: ContractSpec): Promise<ContractAnalysis | null> {
  const statusLines: string[] = [];
  const occ = `O:${spec.symbol}${spec.expiry.slice(2, 4)}${spec.expiry.slice(5, 7)}${spec.expiry.slice(8, 10)}${spec.optionType === 'call' ? 'C' : 'P'}${(spec.strike * 1000).toFixed(0).padStart(8, '0')}`;
  statusLines.push(`Connected. Running analysis for ${occ}.`);
  statusLines.push(
    `${spec.optionType === 'call' ? 'Long call' : 'Long put'} on ${spec.symbol} — strike $${spec.strike} expiring ${spec.expiry}. Beginning analysis.`,
  );

  const chain = await fetchContractFromChain(spec);
  if (!chain) {
    statusLines.push(`Chain fetch failed — couldn't locate ${spec.symbol} $${spec.strike}${spec.optionType === 'call' ? 'C' : 'P'} ${spec.expiry}.`);
    return null;
  }
  statusLines.push(`Target loaded: $${spec.strike}${spec.optionType === 'call' ? 'C' : 'P'} mid $${chain.contractMid.toFixed(2)}, OI ${chain.oi.toLocaleString()}.`);

  // Compute greeks
  const dte = Math.max(1, Math.round((new Date(spec.expiry).getTime() - Date.now()) / 86400000));
  const T = dte / 365;
  const sigma = chain.iv || 0.4;
  const greeks = bsGreeks(chain.spot, spec.strike, T, 0.045, sigma, spec.optionType === 'call');

  // Run all signal graders (some async)
  const signals: SignalScore[] = [];

  const sigMoneyness = gradeMoneyness(chain.spot, spec.strike, spec.optionType);
  if (sigMoneyness) signals.push(sigMoneyness);

  const sigDTE = gradeDTE(dte);
  if (sigDTE) signals.push(sigDTE);

  const sigDelta = gradeDelta(greeks.delta, spec.optionType);
  if (sigDelta) signals.push(sigDelta);

  const sigTheta = gradeTheta(greeks.theta, chain.contractMid, dte);
  if (sigTheta) signals.push(sigTheta);

  const sigIV = gradeIV(chain.iv, spec.optionType);
  if (sigIV) signals.push(sigIV);

  const sigOI = gradeOI(chain.oi, chain.topStrikeOI, chain.totalChainOI);
  if (sigOI) signals.push(sigOI);

  const sigPriceAction = await gradePriceAction(spec.symbol, chain.spot, spec.optionType === 'call');
  if (sigPriceAction) signals.push(sigPriceAction);

  const sigCatalyst = await gradeCatalyst(spec.symbol, dte);
  if (sigCatalyst) signals.push(sigCatalyst);

  const sigAnalyst = await gradeAnalystSig(spec.symbol, chain.spot, spec.optionType === 'call');
  if (sigAnalyst) signals.push(sigAnalyst);

  statusLines.push(`Combining ${signals.length} individual tool analyses into final conviction.`);

  const composite = computeComposite(signals);
  const synthesis = synthesizeTake(signals, composite.grade);
  statusLines.push(`Analysis complete.`);

  // Trade plan based on signal context
  const isCall = spec.optionType === 'call';
  const annualMove = sigma * Math.sqrt(T);
  const t1 = isCall ? chain.spot * (1 + annualMove * 0.5) : chain.spot * (1 - annualMove * 0.5);
  const t2 = isCall ? chain.spot * (1 + annualMove * 1.0) : chain.spot * (1 - annualMove * 1.0);
  const invalidation = isCall ? chain.spot * 0.93 : chain.spot * 1.07;

  return {
    spec,
    spotAtAnalysis: chain.spot,
    contractMid: chain.contractMid,
    contractBid: chain.contractBid,
    contractAsk: chain.contractAsk,
    iv: chain.iv,
    delta: greeks.delta,
    gamma: greeks.gamma,
    theta: greeks.theta,
    vega: greeks.vega,
    signals,
    finalGrade: composite.grade,
    finalScore: composite.score,
    synthesis,
    statusLines,
    plan: {
      t1,
      t2,
      invalidation,
      horizonDays: dte,
      sellTriggers: { trim33: 0.5, trim50: 1.0, runner: 2.0 },
    },
    roiScenarios: buildROIScenarios(chain.spot, spec.strike, chain.iv, dte, spec.optionType, chain.contractMid),
    analyzedAt: new Date().toISOString(),
  };
}
