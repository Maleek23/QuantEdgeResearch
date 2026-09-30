/**
 * INDEX SCALP ENGINE
 * ==================
 * 2026-09-29: the setups that PUBLISH now come from the pre-registered,
 * structure-gated policies in server/zero-dte-policies.ts (A: negative-gamma
 * continuation, B: positive-gamma wall fade / power-hour pin, C: no trade),
 * which gate on zero-gamma + walls AND VWAP / opening range / prior-day levels
 * from 5-minute bars, carry a 15:55 ET time stop, and say they are unvalidated.
 * The older proximity builders below (flip bounce, wall fade/break, trend
 * continuation, and a power-hour play that fired "even if no structural
 * trigger") are kept for scripts/test-index-scalps.ts only — they read the
 * legacy regime enum, which reads 'transitioning' whenever spot is within 1%
 * of zero-gamma (SPY most of 2026-09-29), so they almost never fired, and the
 * power-hour one had no structure at all.
 *
 * Generates intraday SPX/SPY/QQQ scalp ideas using GEX structural levels.
 * Targets liquid 0DTE contracts only when the structural thesis, executable
 * chain, and account-risk limits agree. Large returns are measured outcomes,
 * never an engine promise.
 *
 * Uses SPY/QQQ GEX data — translates SPY levels to SPX strikes (SPX ≈ SPY × 10).
 *
 * Setup types:
 *   1. **Flip Bounce** — spot near gamma flip → dealer hedging reaction
 *   2. **Wall Fade** — spot pinned at wall in positive gamma → mean revert
 *   3. **Wall Break** — spot breaking wall in negative gamma → momentum
 *   4. **Power Hour Momentum** — 3–4 PM ET aggressive plays
 *
 * Each idea persists to `trade_ideas` with source='gex_scanner',
 * holdingPeriod='day', and 0DTE strike/expiry attached.
 */

import { readShared, writeSharedSync } from './lib/shared-state';
import { readsSharedState, writesSharedState } from './lib/process-role';
import { logger } from './logger';
import { storage } from './storage';
import { getGexSnapshotBatch, type GexSnapshot } from './gex-snapshot-service';
import { fetchYahooFinancePrice } from './market-api';
import { getIntradayStructure } from './zero-dte-structure';
import { evaluateZeroDte, timeStopIso, zeroDteWallsEnabled, ZERO_DTE_PROVENANCE, TIME_STOP_ET, type ZeroDtePolicy, type ZeroDteBucketInput } from './zero-dte-policies';

// ─── Types ──────────────────────────────────────────────────

export type ScalpSetup = 'flip_bounce' | 'wall_fade' | 'wall_break' | 'power_hour';

export interface IndexScalpIdea {
  symbol: string;             // Trade vehicle: SPX, SPY, QQQ
  underlying: string;         // GEX source: SPY or QQQ
  setup: ScalpSetup;
  direction: 'long' | 'short';
  bias: 'calls' | 'puts';
  spotPrice: number;          // Current underlying price
  suggestedStrike: number;    // Rounded to nearest valid strike
  expiryDate: string;         // YYYY-MM-DD (today for 0DTE)
  premiumRange: string;       // e.g. "$1.50–$4.00"
  target: number;             // Underlying price target
  stop: number;               // Underlying stop level
  riskRewardRatio: number;
  confidence: number;         // 0-100
  thesis: string;
  isPowerHour: boolean;
  // GEX context
  gammaFlip: number | null;
  callWall: number | null;
  putWall: number | null;
  regime: string;
  // Structure-gated policy provenance (server/zero-dte-policies.ts)
  policy?: ZeroDtePolicy;
  evidence?: string[];
  /** ISO — hard time stop (15:55 ET). */
  exitBy?: string;
  /** ISO — the trigger is stale after this. */
  entryValidUntil?: string;
}

// ─── Constants ──────────────────────────────────────────────

const INDEX_MAP: Record<string, { spx: boolean; strikeInterval: number; multiplier: number }> = {
  SPY: { spx: true, strikeInterval: 5, multiplier: 10 },   // SPY → SPX ($5 strikes)
  QQQ: { spx: false, strikeInterval: 1, multiplier: 1 },   // QQQ direct ($1 strikes)
  IWM: { spx: false, strikeInterval: 1, multiplier: 1 },   // IWM direct ($1 strikes, Russell)
};

const FLIP_PROXIMITY_PCT = 0.8;
const WALL_PROXIMITY_PCT = 0.5;
const DUPE_WINDOW_MS = 30 * 60 * 1000; // 30 min (scalps are fast)

// ─── Session / Power Hour Detection ─────────────────────────

interface SessionInfo {
  isMarketOpen: boolean;
  isPowerHour: boolean;
  isLastHour: boolean;
  minutesToClose: number;
  sessionLabel: string;
}

export function getScalpSession(): SessionInfo {
  const now = new Date();
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const etH = Number(etParts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
  const etM = Number(etParts.find((part) => part.type === 'minute')?.value ?? 0);
  const etMin = etH * 60 + etM;

  const marketOpen = 9 * 60 + 30;   // 9:30 AM ET
  const powerHour = 15 * 60;         // 3:00 PM ET
  const marketClose = 16 * 60;       // 4:00 PM ET

  // Weekend guard — getUTCDay 0=Sun, 6=Sat. Without this, any Sat/Sun between
  // 9:30–4pm ET would falsely report open and run the scanner on dead data.
  const weekday = etParts.find((part) => part.type === 'weekday')?.value;
  const isWeekday = weekday !== 'Sat' && weekday !== 'Sun';

  const isMarketOpen = isWeekday && etMin >= marketOpen && etMin < marketClose;
  const isPowerHour = etMin >= powerHour && etMin < marketClose;
  const isLastHour = isPowerHour;
  const minutesToClose = isMarketOpen ? Math.max(0, marketClose - etMin) : 0;

  let sessionLabel = 'closed';
  if (isPowerHour) sessionLabel = 'power_hour';
  else if (etMin >= 14 * 60 && etMin < powerHour) sessionLabel = 'afternoon';
  else if (etMin >= 12 * 60) sessionLabel = 'midday';
  else if (etMin >= marketOpen) sessionLabel = 'morning';

  return { isMarketOpen, isPowerHour, isLastHour, minutesToClose, sessionLabel };
}

// ─── Strike Calculation ─────────────────────────────────────

function roundStrike(price: number, interval: number): number {
  return Math.round(price / interval) * interval;
}

/**
 * Calculate suggested 0DTE strike for the $1.50–$10.00 premium sweet spot.
 * - Calls: 5–15 points OTM (SPX) or 0.5–1.5% OTM (QQQ)
 * - Power hour: tighter (closer to ATM for gamma explosion)
 */
function suggestStrike(
  underlying: string,
  spot: number,
  bias: 'calls' | 'puts',
  isPowerHour: boolean,
  target?: number | null,
): number {
  const config = INDEX_MAP[underlying];
  if (!config) return spot;

  const spxSpot = config.spx ? spot * config.multiplier : spot;
  const interval = config.strikeInterval;

  // OTM offset: tighter during power hour for gamma explosion
  const otmPct = isPowerHour ? 0.004 : 0.008; // 0.4% vs 0.8% OTM
  const otmOffset = spxSpot * otmPct;

  let strike: number;
  if (bias === 'calls') {
    // If we have a GEX target (e.g., call wall), bias toward it
    const raw = target && config.spx ? target * config.multiplier : spxSpot + otmOffset;
    // Don't go too deep ITM — stay slightly OTM
    strike = Math.max(raw, spxSpot + interval);
    strike = roundStrike(strike, interval);
  } else {
    const raw = target && config.spx ? target * config.multiplier : spxSpot - otmOffset;
    strike = Math.min(raw, spxSpot - interval);
    strike = roundStrike(strike, interval);
  }

  return strike;
}

/**
 * Estimate premium range based on distance OTM + time.
 * Rough heuristic — real pricing needs live chain data.
 */
function estimatePremiumRange(
  spot: number,
  strike: number,
  isPowerHour: boolean,
): string {
  const dist = Math.abs(strike - spot);
  const pctOTM = (dist / spot) * 100;

  if (isPowerHour) {
    // Power hour: gamma is massive, premiums elevated
    if (pctOTM < 0.3) return '$5.00–$15.00';
    if (pctOTM < 0.5) return '$2.50–$8.00';
    if (pctOTM < 1.0) return '$1.00–$4.00';
    return '$0.50–$2.00';
  }
  if (pctOTM < 0.3) return '$4.00–$10.00';
  if (pctOTM < 0.5) return '$2.00–$6.00';
  if (pctOTM < 1.0) return '$0.80–$3.00';
  return '$0.30–$1.50';
}

// ─── Scalp Setup Builders ───────────────────────────────────

export function buildFlipBounce(snap: GexSnapshot, session: SessionInfo): IndexScalpIdea | null {
  const { symbol, spot, flipPoint, callWall, putWall, regime } = snap;
  if (!flipPoint || spot <= 0) return null;

  const flipDist = ((spot - flipPoint) / spot) * 100;
  if (Math.abs(flipDist) > FLIP_PROXIMITY_PCT) return null;

  const aboveFlip = flipDist > 0;
  const config = INDEX_MAP[symbol];
  if (!config) return null;

  // Near gamma flip = high-conviction zone
  let direction: 'long' | 'short';
  let bias: 'calls' | 'puts';
  let target: number;
  let stop: number;
  let thesis: string;

  if (regime === 'negative_gamma') {
    // Negative gamma at flip = dealers chase the cross direction
    direction = aboveFlip ? 'long' : 'short';
    bias = aboveFlip ? 'calls' : 'puts';
    target = aboveFlip
      ? (callWall && callWall > spot ? callWall : spot * 1.008)
      : (putWall && putWall < spot ? putWall : spot * 0.992);
    stop = aboveFlip ? flipPoint * 0.998 : flipPoint * 1.002;
    thesis = `Negative gamma flip cross — dealers must chase ${aboveFlip ? 'upside' : 'downside'}. ${config.spx ? 'SPX' : symbol} ${bias.toUpperCase()} targeting ${aboveFlip ? 'call wall' : 'put wall'}.`;
  } else {
    // Positive gamma at flip = mean revert / pin
    direction = aboveFlip ? 'short' : 'long';
    bias = aboveFlip ? 'puts' : 'calls';
    target = flipPoint;
    stop = aboveFlip ? spot * 1.005 : spot * 0.995;
    thesis = `Positive gamma flip pin — dealers pulling price back to flip $${flipPoint.toFixed(0)}. Fade for mean revert.`;
  }

  const risk = Math.abs(spot - stop);
  const reward = Math.abs(target - spot);
  if (risk <= 0 || reward / risk < 1.5) return null;

  const tradeSym = config.spx ? 'SPX' : symbol;
  const tradeSpot = config.spx ? spot * config.multiplier : spot;
  const strike = suggestStrike(symbol, spot, bias, session.isPowerHour, bias === 'calls' ? callWall : putWall);

  return {
    symbol: tradeSym,
    underlying: symbol,
    setup: 'flip_bounce',
    direction,
    bias,
    spotPrice: tradeSpot,
    suggestedStrike: strike,
    expiryDate: getTodayExpiry(),
    premiumRange: estimatePremiumRange(tradeSpot, strike, session.isPowerHour),
    target: config.spx ? target * config.multiplier : target,
    stop: config.spx ? stop * config.multiplier : stop,
    riskRewardRatio: +(reward / risk).toFixed(2),
    confidence: regime === 'negative_gamma' ? 75 : 68,
    thesis,
    isPowerHour: session.isPowerHour,
    gammaFlip: flipPoint,
    callWall,
    putWall,
    regime: regime || 'unknown',
  };
}

export function buildWallFade(snap: GexSnapshot, session: SessionInfo): IndexScalpIdea | null {
  const { symbol, spot, flipPoint, callWall, putWall, regime } = snap;
  if (regime !== 'positive_gamma' || spot <= 0) return null;
  const config = INDEX_MAP[symbol];
  if (!config) return null;

  // Check call wall proximity
  if (callWall && callWall > spot) {
    const dist = ((callWall - spot) / spot) * 100;
    if (dist <= WALL_PROXIMITY_PCT) {
      const target = flipPoint && flipPoint < spot ? Math.max(flipPoint, spot * 0.992) : spot * 0.992;
      const stop = callWall * 1.003;
      const risk = stop - spot;
      const reward = spot - target;
      if (risk > 0 && reward / risk >= 1.5) {
        const tradeSym = config.spx ? 'SPX' : symbol;
        const tradeSpot = config.spx ? spot * config.multiplier : spot;
        const strike = suggestStrike(symbol, spot, 'puts', session.isPowerHour, putWall);
        return {
          symbol: tradeSym, underlying: symbol, setup: 'wall_fade',
          direction: 'short', bias: 'puts', spotPrice: tradeSpot,
          suggestedStrike: strike, expiryDate: getTodayExpiry(),
          premiumRange: estimatePremiumRange(tradeSpot, strike, session.isPowerHour),
          target: config.spx ? target * config.multiplier : target,
          stop: config.spx ? stop * config.multiplier : stop,
          riskRewardRatio: +(reward / risk).toFixed(2),
          confidence: session.isPowerHour ? 72 : 68,
          thesis: `Pinned at call wall $${callWall.toFixed(0)} — positive gamma dealers sell rallies. ${tradeSym} PUTS for fade.`,
          isPowerHour: session.isPowerHour,
          gammaFlip: flipPoint, callWall, putWall, regime: regime || 'positive_gamma',
        };
      }
    }
  }

  // Check put wall proximity
  if (putWall && putWall < spot) {
    const dist = ((spot - putWall) / spot) * 100;
    if (dist <= WALL_PROXIMITY_PCT) {
      const target = flipPoint && flipPoint > spot ? Math.min(flipPoint, spot * 1.008) : spot * 1.008;
      const stop = putWall * 0.997;
      const risk = spot - stop;
      const reward = target - spot;
      if (risk > 0 && reward / risk >= 1.5) {
        const tradeSym = config.spx ? 'SPX' : symbol;
        const tradeSpot = config.spx ? spot * config.multiplier : spot;
        const strike = suggestStrike(symbol, spot, 'calls', session.isPowerHour, callWall);
        return {
          symbol: tradeSym, underlying: symbol, setup: 'wall_fade',
          direction: 'long', bias: 'calls', spotPrice: tradeSpot,
          suggestedStrike: strike, expiryDate: getTodayExpiry(),
          premiumRange: estimatePremiumRange(tradeSpot, strike, session.isPowerHour),
          target: config.spx ? target * config.multiplier : target,
          stop: config.spx ? stop * config.multiplier : stop,
          riskRewardRatio: +(reward / risk).toFixed(2),
          confidence: session.isPowerHour ? 72 : 68,
          thesis: `Pinned at put wall $${putWall.toFixed(0)} — positive gamma dealers buy dips. ${tradeSym} CALLS for bounce.`,
          isPowerHour: session.isPowerHour,
          gammaFlip: flipPoint, callWall, putWall, regime: regime || 'positive_gamma',
        };
      }
    }
  }

  return null;
}

export function buildWallBreak(snap: GexSnapshot, session: SessionInfo): IndexScalpIdea | null {
  const { symbol, spot, flipPoint, callWall, putWall, regime } = snap;
  if (regime !== 'negative_gamma' || spot <= 0) return null;
  const config = INDEX_MAP[symbol];
  if (!config) return null;

  // Breaking call wall in negative gamma = momentum long.
  // Band-gated to the *moment of break* (just crossed above) so the target
  // stays above spot — once price extends well past the wall, the
  // trend-continuation setup takes over instead.
  if (callWall && spot > callWall * 0.998 && spot < callWall * 1.006) {
    const target = callWall * 1.01;
    const stop = callWall * 0.995;
    const risk = Math.abs(spot - stop);
    const reward = Math.abs(target - spot);
    if (risk > 0 && reward / risk >= 1.3) {
      const tradeSym = config.spx ? 'SPX' : symbol;
      const tradeSpot = config.spx ? spot * config.multiplier : spot;
      const strike = suggestStrike(symbol, spot, 'calls', session.isPowerHour);
      return {
        symbol: tradeSym, underlying: symbol, setup: 'wall_break',
        direction: 'long', bias: 'calls', spotPrice: tradeSpot,
        suggestedStrike: strike, expiryDate: getTodayExpiry(),
        premiumRange: estimatePremiumRange(tradeSpot, strike, session.isPowerHour),
        target: config.spx ? target * config.multiplier : target,
        stop: config.spx ? stop * config.multiplier : stop,
        riskRewardRatio: +(reward / risk).toFixed(2),
        confidence: session.isPowerHour ? 78 : 72,
        thesis: `Breaking call wall $${callWall.toFixed(0)} in negative gamma — dealers chase upside. ${tradeSym} CALLS for momentum.`,
        isPowerHour: session.isPowerHour,
        gammaFlip: flipPoint, callWall, putWall, regime: 'negative_gamma',
      };
    }
  }

  // Breaking put wall in negative gamma = momentum short.
  // Band-gated to the moment of break (just crossed below) so target stays
  // below spot; deeper extensions are handled by trend-continuation.
  if (putWall && spot < putWall * 1.002 && spot > putWall * 0.994) {
    const target = putWall * 0.99;
    const stop = putWall * 1.005;
    const risk = Math.abs(stop - spot);
    const reward = Math.abs(spot - target);
    if (risk > 0 && reward / risk >= 1.3) {
      const tradeSym = config.spx ? 'SPX' : symbol;
      const tradeSpot = config.spx ? spot * config.multiplier : spot;
      const strike = suggestStrike(symbol, spot, 'puts', session.isPowerHour);
      return {
        symbol: tradeSym, underlying: symbol, setup: 'wall_break',
        direction: 'short', bias: 'puts', spotPrice: tradeSpot,
        suggestedStrike: strike, expiryDate: getTodayExpiry(),
        premiumRange: estimatePremiumRange(tradeSpot, strike, session.isPowerHour),
        target: config.spx ? target * config.multiplier : target,
        stop: config.spx ? stop * config.multiplier : stop,
        riskRewardRatio: +(reward / risk).toFixed(2),
        confidence: session.isPowerHour ? 78 : 72,
        thesis: `Breaking put wall $${putWall.toFixed(0)} in negative gamma — dealers chase downside. ${tradeSym} PUTS for momentum.`,
        isPowerHour: session.isPowerHour,
        gammaFlip: flipPoint, callWall, putWall, regime: 'negative_gamma',
      };
    }
  }

  return null;
}

/**
 * Power Hour special: even if no structural trigger,
 * generate a momentum play based on current trend direction
 * when gamma is negative (amplified moves in last hour).
 */
export function buildPowerHourPlay(snap: GexSnapshot, session: SessionInfo): IndexScalpIdea | null {
  if (!session.isPowerHour) return null;
  const { symbol, spot, flipPoint, callWall, putWall, regime } = snap;
  if (spot <= 0) return null;
  const config = INDEX_MAP[symbol];
  if (!config) return null;

  // Power hour in negative gamma = volatility explosion
  const isNegGamma = regime === 'negative_gamma' || regime === 'transitioning';
  if (!isNegGamma) return null;

  const aboveFlip = flipPoint ? spot > flipPoint : true; // default bullish if no flip
  const direction: 'long' | 'short' = aboveFlip ? 'long' : 'short';
  const bias: 'calls' | 'puts' = aboveFlip ? 'calls' : 'puts';
  const target = aboveFlip
    ? (callWall && callWall > spot ? callWall : spot * 1.006)
    : (putWall && putWall < spot ? putWall : spot * 0.994);
  const stop = aboveFlip ? spot * 0.997 : spot * 1.003;

  const risk = Math.abs(spot - stop);
  const reward = Math.abs(target - spot);
  if (risk <= 0 || reward / risk < 1.5) return null;

  const tradeSym = config.spx ? 'SPX' : symbol;
  const tradeSpot = config.spx ? spot * config.multiplier : spot;
  const strike = suggestStrike(symbol, spot, bias, true);

  return {
    symbol: tradeSym, underlying: symbol, setup: 'power_hour',
    direction, bias, spotPrice: tradeSpot,
    suggestedStrike: strike, expiryDate: getTodayExpiry(),
    premiumRange: estimatePremiumRange(tradeSpot, strike, true),
    target: config.spx ? target * config.multiplier : target,
    stop: config.spx ? stop * config.multiplier : stop,
    riskRewardRatio: +(reward / risk).toFixed(2),
    confidence: 70,
    thesis: `⚡ POWER HOUR — ${regime} regime, dealers ${isNegGamma ? 'amplifying' : 'dampening'} moves. ${tradeSym} ${bias.toUpperCase()} for ${session.minutesToClose}min sprint to ${aboveFlip ? 'call wall' : 'put wall'}.`,
    isPowerHour: true,
    gammaFlip: flipPoint, callWall, putWall, regime: regime || 'unknown',
  };
}

/**
 * TREND CONTINUATION — the setup that catches sustained directional days.
 *
 * Once price has decisively broken a wall in NEGATIVE gamma, dealers keep
 * hedging in the trend direction (selling into weakness / buying strength),
 * which is exactly the regime that produces the runaway 0DTE runners. The
 * proximity setups (flip/wall fade/wall break) all go quiet once spot has
 * extended past the wall — this one stays live and rides the move with a
 * tight momentum stop (not the far wall, so R:R stays favourable).
 *
 * Fires only when spot is 0.6%–3% beyond a wall (past the wall-break band,
 * but not so stretched we're chasing the very end of the move).
 */
export function buildTrendContinuation(snap: GexSnapshot, session: SessionInfo): IndexScalpIdea | null {
  const { symbol, spot, flipPoint, callWall, putWall, regime } = snap;
  if (regime !== 'negative_gamma' || spot <= 0) return null;
  const config = INDEX_MAP[symbol];
  if (!config) return null;

  let direction: 'long' | 'short' | null = null;
  let bias: 'calls' | 'puts' = 'calls';
  let thesis = '';

  // Downtrend: extended below the put wall
  if (putWall && spot < putWall * 0.994 && spot > putWall * 0.97) {
    direction = 'short';
    bias = 'puts';
    thesis = `Negative-gamma downtrend — price extended below put wall $${putWall.toFixed(0)}, dealers keep selling into weakness. ${config.spx ? 'SPX' : symbol} PUTS riding momentum.`;
  }
  // Uptrend: extended above the call wall
  else if (callWall && spot > callWall * 1.006 && spot < callWall * 1.03) {
    direction = 'long';
    bias = 'calls';
    thesis = `Negative-gamma uptrend — price extended above call wall $${callWall.toFixed(0)}, dealers keep chasing strength. ${config.spx ? 'SPX' : symbol} CALLS riding momentum.`;
  }

  if (!direction) return null;

  // Tight momentum stop + extension target (own risk, not the far wall).
  const stop = direction === 'short' ? spot * 1.004 : spot * 0.996;
  const target = direction === 'short' ? spot * 0.990 : spot * 1.010;

  const risk = Math.abs(spot - stop);
  const reward = Math.abs(target - spot);
  if (risk <= 0 || reward / risk < 1.3) return null;

  const tradeSym = config.spx ? 'SPX' : symbol;
  const tradeSpot = config.spx ? spot * config.multiplier : spot;
  const strike = suggestStrike(symbol, spot, bias, session.isPowerHour);

  return {
    symbol: tradeSym,
    underlying: symbol,
    setup: 'wall_break', // shares the momentum lane for dedup/labeling
    direction,
    bias,
    spotPrice: tradeSpot,
    suggestedStrike: strike,
    expiryDate: getTodayExpiry(),
    premiumRange: estimatePremiumRange(tradeSpot, strike, session.isPowerHour),
    target: config.spx ? target * config.multiplier : target,
    stop: config.spx ? stop * config.multiplier : stop,
    riskRewardRatio: +(reward / risk).toFixed(2),
    confidence: session.isPowerHour ? 74 : 69,
    thesis: `${session.isPowerHour ? '⚡ ' : ''}${thesis}`,
    isPowerHour: session.isPowerHour,
    gammaFlip: flipPoint,
    callWall,
    putWall,
    regime: 'negative_gamma',
  };
}

// ─── Helpers ────────────────────────────────────────────────

function getTodayExpiry(): string {
  const now = new Date();
  // ET offset
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return etDate.toISOString().split('T')[0];
}

// In-process dedup. The old version loaded EVERY trade idea (getAllTradeIdeas)
// on each candidate — on a 1-vCPU droplet, every minute. The spine's own
// dedup window in createTradeIdea covers a restart.
const recentPublishes = new Map<string, number>();
/** Last reason a triggered setup was NOT published, per GEX underlying (0DTE desk reads it). */
const lastWithheld = new Map<string, { at: number; reason: string }>();
function isDuplicate(symbol: string, setup: string, bias: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentPublishes) if (now - t > DUPE_WINDOW_MS) recentPublishes.delete(k);
  return recentPublishes.has(`${symbol}|${setup}|${bias}`);
}

// ─── Persistence ────────────────────────────────────────────

async function persistScalp(idea: IndexScalpIdea, opts: { discord?: boolean } = {}): Promise<boolean> {
  const dedupKey = idea.policy ?? idea.setup;
  if (isDuplicate(idea.symbol, dedupKey, idea.bias)) return false;

  // A price-level signal is not an option contract. Resolve the actual vehicle
  // against the live chain and the user's stated small-account guardrails. The
  // old code attached a heuristic strike and an estimated premium range; that
  // is how an attractive SPX thesis could become an unbuyable or unreachable
  // contract. No eligible contract means no published 0DTE callout.
  const { selectContracts } = await import('./option-selection-engine');
  const accountSize = Math.max(1_000, Number(process.env.INDEX_0DTE_ACCOUNT_SIZE ?? 10_000));
  const riskBudgetDollars = Math.max(25, Number(process.env.INDEX_0DTE_RISK_BUDGET ?? 200));
  const maxDebitDollars = Math.max(25, Number(process.env.INDEX_0DTE_MAX_DEBIT ?? 200));
  // Preserve an SPX-level thesis, but do not force a $100-multiplier SPXW
  // contract into a small account. SPY is the liquid, account-sized fallback.
  const vehicles = idea.symbol === 'SPX'
    ? [{ symbol: 'SPX', scale: 1 }, { symbol: 'SPY', scale: 1 / INDEX_MAP.SPY.multiplier }]
    : [{ symbol: idea.symbol, scale: 1 }];
  let selection: Awaited<ReturnType<typeof selectContracts>> | null = null;
  let contract: Awaited<ReturnType<typeof selectContracts>>['picks'][number] | null = null;
  let vehicle = vehicles[0];
  for (const candidate of vehicles) {
    const result = await selectContracts({
      symbol: candidate.symbol,
      direction: idea.direction === 'long' ? 'bullish' : 'bearish',
      setup: 'scalp',
      expiryTier: '0DTE',
      allowZeroDte: true,
      entry: idea.spotPrice * candidate.scale,
      stop: idea.stop * candidate.scale,
      t1: idea.target * candidate.scale,
      holdingDays: 0,
      conviction: idea.confidence,
      asOfSpot: idea.spotPrice * candidate.scale,
      accountSize,
      riskBudgetDollars,
      maxDebitDollars,
      minRoiAtT1Pct: 50,
    });
    // For the index desk, return the best ACCOUNT-FIT expression, not merely
    // the generic tier recommendation. This deliberately prefers a liquid
    // $0.20–$2.00 contract that can be sized inside the debit cap while still
    // clearing reachability, return and R:R gates. It avoids both $2k SPXW
    // contracts and five-cent lottery tickets whose spread is the whole trade.
    // fitsAccount is the limit CONSTRAINT (never a grade deduction); grade is
    // contract quality from shared/contract-engine.ts — an F is never published.
    const eligible = result.picks.filter((p) =>
      p.fitsAccount &&
      p.grade !== 'F' &&
      p.targetCrossesStrike &&
      p.entryPremium >= 0.20 &&
      p.entryPremium * 100 <= maxDebitDollars &&
      p.roiAtT1Pct >= 50 &&
      p.riskRewardRatio >= 1
    );
    const pick = [...eligible].sort((a, b) => {
      const accountFitA = a.entryPremium <= 2 ? 12 : 0;
      const accountFitB = b.entryPremium <= 2 ? 12 : 0;
      const returnA = Math.min(18, a.roiAtT1Pct / 20);
      const returnB = Math.min(18, b.roiAtT1Pct / 20);
      return (b.score + accountFitB + returnB) - (a.score + accountFitA + returnA);
    })[0] ?? null;
    selection = result;
    if (pick) { contract = pick; vehicle = candidate; break; }
  }
  if (!contract) {
    logger.info(`[INDEX-SCALP] ${idea.symbol} ${idea.setup} withheld: ${selection?.note ?? 'no account-fit 0DTE contract'}`);
    lastWithheld.set(idea.underlying, { at: Date.now(), reason: selection?.note ?? 'no account-fit 0DTE contract' });
    return false;
  }

  const packageQuantity = Math.max(1, Math.min(5, Math.floor(maxDebitDollars / (contract.entryPremium * 100))));
  const packageDebit = contract.entryPremium * 100 * packageQuantity;
  // Label the contract by its REAL days to expiry. 2026-09-29 published an IWM
  // 2026-09-30 contract as "IWM 0DTE CALLS" — it was a 1DTE.
  const todayEt = getTodayExpiry();
  const dteDays = Math.round((Date.parse(`${contract.expiry}T12:00:00Z`) - Date.parse(`${todayEt}T12:00:00Z`)) / 864e5);
  const dteLabel = dteDays <= 0 ? '0DTE' : `${dteDays}DTE`;
  const setupLabel = idea.policy === 'A_neg_gamma_continuation' ? 'A · −γ continuation'
    : idea.policy === 'B_pos_gamma_wall_fade' ? (idea.isPowerHour ? 'B · +γ power-hour pin' : 'B · +γ wall fade')
    : idea.setup.replace('_', ' ');
  const evidenceText = idea.evidence?.length ? ` Evidence: ${idea.evidence.join(' | ')}.` : '';
  const provenanceText = idea.policy ? ` ${ZERO_DTE_PROVENANCE}` : '';
  const timeStopText = ` Hard time stop ${TIME_STOP_ET} ET — flat before the close whatever the P&L.${dteDays > 0 ? ` (No same-day expiry fit the account gate; the ${contract.expiry} contract is held intraday only.)` : ''}`;

  const tradeIdea = {
    symbol: vehicle.symbol,
    sector: 'index' as const,
    assetType: 'option' as const,
    direction: idea.direction,
    entryPrice: idea.spotPrice * vehicle.scale,
    targetPrice: idea.target * vehicle.scale,
    stopLoss: idea.stop * vehicle.scale,
    riskRewardRatio: idea.riskRewardRatio,
    optionType: contract.optionType,
    strikePrice: contract.strike,
    expiryDate: contract.expiry,
    entryPremium: Number(contract.entryPremium.toFixed(2)),
    catalyst: `${idea.isPowerHour ? '⚡ POWER HOUR ' : ''}${vehicle.symbol} ${dteLabel} ${idea.bias.toUpperCase()} — ${setupLabel} | ${contract.tier} ${contract.grade} · ${packageQuantity}x @ $${contract.entryPremium.toFixed(2)} (≤$${packageDebit.toFixed(0)} debit) · modeled +${contract.roiAtT1Pct.toFixed(0)}% at T1`,
    analysis: `${idea.thesis}${vehicle.symbol !== idea.symbol ? ` Account-fit execution uses ${vehicle.symbol}; the thesis was measured on ${idea.symbol}.` : ''}${evidenceText}${timeStopText}${provenanceText}`,
    source: 'gex_scanner',
    dataSourceUsed: `GEX_index_scalp_${idea.policy ?? idea.setup}`,
    sessionContext: idea.isPowerHour ? 'power_hour' : 'intraday',
    timestamp: new Date().toISOString(),
    exitBy: idea.exitBy ?? timeStopIso(),
    ...(idea.entryValidUntil ? { entryValidUntil: idea.entryValidUntil } : {}),
    expiryTier: dteDays <= 0 ? '0DTE' : 'DAILY',
    optionDte: Math.max(0, dteDays),
    tradeType: 'scalp' as const,
    outcomeStatus: 'open' as const,
    confidenceScore: idea.confidence,
    holdingPeriod: 'day' as const,
    qualitySignals: [
      `index_scalp:${idea.setup}`,
      `regime:${idea.regime}`,
      `underlying:${idea.underlying}`,
      `vehicle:${vehicle.symbol}`,
      idea.gammaFlip ? `flip:${idea.gammaFlip.toFixed(2)}` : '',
      idea.callWall ? `call_wall:${idea.callWall.toFixed(2)}` : '',
      idea.putWall ? `put_wall:${idea.putWall.toFixed(2)}` : '',
      `strike:${contract.strike}`,
      `0DTE:${contract.expiry}`,
      `contract_rr:${contract.riskRewardRatio.toFixed(2)}`,
      `contract_debit:${(contract.entryPremium * 100).toFixed(0)}`,
      `package_qty:${packageQuantity}`,
      `package_debit:${packageDebit.toFixed(0)}`,
      idea.isPowerHour ? 'power_hour' : '',
      idea.policy ? `policy:${idea.policy}` : '',
      idea.policy ? 'validated:false' : '',
      idea.evidence?.some((e) => e.includes('0DTE-only levels')) ? 'levels:0dte_walls' : '',
      `time_stop:${TIME_STOP_ET}ET`,
      `contract_dte:${dteDays}`,
    ].filter(Boolean),
  };

  try {
    const created = await storage.createTradeIdea(tradeIdea as any, { dedupWindowHours: 0.5 });
    const { isDedupedResult } = await import('./lib/instrument-dedup');
    if (isDedupedResult(created)) {
      // Same contract already open / published this session — no re-alert.
      recentPublishes.set(`${idea.symbol}|${dedupKey}|${idea.bias}`, Date.now());
      logger.info(`[INDEX-SCALP] ${vehicle.symbol} ${contract.optionType.toUpperCase()} $${contract.strike} ${contract.expiry} not republished — existing idea ${(created as any)?.id}`);
      return false;
    }
    recentPublishes.set(`${idea.symbol}|${dedupKey}|${idea.bias}`, Date.now());
    logger.info(
      `[INDEX-SCALP] ✅ ${vehicle.symbol} ${contract.optionType.toUpperCase()} $${contract.strike} ${contract.expiry} @ $${contract.entryPremium.toFixed(2)} | ${idea.setup} | ${idea.isPowerHour ? '⚡ POWER HOUR' : 'intraday'}`,
    );

    // Cockpit is an operational surface, not a page the user should have to
    // refresh. Reuse the existing websocket channel so a newly published
    // SPX/SPY/QQQ/IWM call becomes an in-app alert immediately.
    import('./bot-notification-service')
      .then(({ broadcastBotEvent }) => broadcastBotEvent({
        eventType: 'signal',
        source: 'index_scalp',
        symbol: vehicle.symbol,
        optionType: contract!.optionType,
        strike: contract!.strike,
        expiry: contract!.expiry,
        price: contract!.entryPremium,
        quantity: packageQuantity,
        confidence: idea.confidence,
        portfolio: 'small_account',
        reason: `${idea.setup}|${idea.thesis}`,
      }))
      .catch((e) => logger.warn(`[INDEX-SCALP] cockpit alert failed: ${e?.message}`));

    // Fire a Discord callout for the fresh scalp (gated on DISCORD_WEBHOOK_SPX;
    // no-ops cleanly if unconfigured). Fire-and-forget — never block persist.
    // The web-process schedule publishes only (idea-producer-schedule.ts rule);
    // it passes discord:false unless INDEX_0DTE_DISCORD=1.
    if (opts.discord !== false) import('./discord-service')
      .then(({ sendIndexScalpToDiscord }) =>
        sendIndexScalpToDiscord({
          symbol: vehicle.symbol,
          bias: idea.bias,
          setup: idea.setup,
          suggestedStrike: contract.strike,
          expiryDate: contract.expiry,
          spotPrice: idea.spotPrice * vehicle.scale,
          target: idea.target * vehicle.scale,
          stop: idea.stop * vehicle.scale,
          riskRewardRatio: idea.riskRewardRatio,
          confidence: idea.confidence,
          thesis: `${idea.thesis}${vehicle.symbol !== idea.symbol ? ` Executed through account-fit ${vehicle.symbol}.` : ''}`,
          premiumRange: `$${contract.bid.toFixed(2)}–$${contract.ask.toFixed(2)}`,
          regime: idea.regime,
          isPowerHour: idea.isPowerHour,
        }),
      )
      .catch((e) => logger.warn(`[INDEX-SCALP] discord callout failed: ${e?.message}`));

    return true;
  } catch (err) {
    logger.warn(`[INDEX-SCALP] persist failed: ${(err as Error).message}`);
    return false;
  }
}

// ─── Main Scanner ───────────────────────────────────────────

export interface IndexScalpResult {
  session: SessionInfo;
  scanned: number;
  ideas: IndexScalpIdea[];
  persisted: number;
  /** Why each symbol did not fire this pass (policy C / gates) — WAIT is a result. */
  waits?: Record<string, string[]>;
  /** ISO — when this pass ran (a cached result is returned inside the min interval). */
  ranAt?: string;
}

function etMinutesNow(now = new Date()): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  return (Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24) * 60 + Number(p.find((x) => x.type === 'minute')?.value ?? 0);
}

/** Policy C event gate: a high-impact release within ±30 min of now (today's calendar). */
async function eventBlockNow(etMin: number): Promise<string | null> {
  try {
    const { getTodayEvents } = await import('./economic-calendar');
    for (const e of getTodayEvents()) {
      if (e.importance !== 'high') continue;
      const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(e.time ?? '');
      if (!m) continue;
      const mins = ((Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
      if (Math.abs(etMin - mins) <= 30) return `${e.name} at ${e.time}`;
    }
  } catch { /* calendar unavailable — disclosed in logs, not a block */ }
  return null;
}

/**
 * 0DTE-only walls for the index underlyings (power-hour fix, 2026-09-29).
 * Same default Alpaca chain the GEX snapshot just used (shared cache key), so
 * this costs no extra provider request when the snapshot was fresh.
 */
async function zeroDteBucketFor(sym: string, spot: number, nowMs: number): Promise<ZeroDteBucketInput | null> {
  if (!zeroDteWallsEnabled()) return null;
  try {
    const { getAlpacaOptionsChain, alpacaToTradierShape } = await import('./alpaca-options');
    const chain = await getAlpacaOptionsChain(sym);
    if (!chain?.contracts.length) return null;
    const { pickDeskExpiry, expiryBucketLevels, etDateKey } = await import('./zero-dte-desk-core');
    const ex = pickDeskExpiry(chain.expirations, etDateKey(nowMs));
    if (!ex.expiry || !ex.sameDay) return null; // only a SAME-DAY expiry pins into the close
    const lv = expiryBucketLevels(sym, alpacaToTradierShape(chain) as any, spot, ex.expiry);
    return lv ? { expiry: lv.expiry, callWall: lv.callWall, putWall: lv.putWall, maxGamma: lv.maxGamma, zeroGamma: lv.zeroGamma } : null;
  } catch (e) {
    logger.warn(`[INDEX-SCALP] ${sym} 0DTE bucket failed: ${(e as Error).message}`);
    return null;
  }
}

/** The last completed pass (the 0DTE desk shows its waits for SPX) + withheld reasons. */
export function getLastIndexScan(): { at: number; result: IndexScalpResult; withheld: Record<string, { at: number; reason: string }> } | null {
  if (readsSharedState()) {
    // ROLE=web: the worker runs the scanner; read its last pass.
    const r = readShared<{ at: number; result: IndexScalpResult; withheld: Record<string, { at: number; reason: string }> }>(INDEX_SHARED);
    if (r && (!lastScan || r.data.at > lastScan.at)) return r.data;
  }
  return lastScan ? { ...lastScan, withheld: Object.fromEntries(lastWithheld) } : null;
}
const INDEX_SHARED = 'index-0dte-last';

let inflightScan: Promise<IndexScalpResult> | null = null;
let lastScan: { at: number; result: IndexScalpResult } | null = null;
const MIN_SCAN_INTERVAL_MS = 60_000;

/**
 * Run the index 0DTE scanner.
 * GEX snapshot (zero-gamma, walls, sign) + 5-minute structure for SPY/QQQ/IWM
 * → server/zero-dte-policies.ts → live-chain account-fit contract → trade_ideas.
 * SPY setups are expressed on SPX first (SPY GEX levels translated by the live
 * SPX/SPY ratio) with SPY as the account-fit fallback.
 *
 * Throttled: concurrent callers share one pass and a pass inside 60 s of the
 * last returns that result (the GEX hub fires this on every hub load).
 */
export async function runIndexScalpScanner(opts: { discord?: boolean } = {}): Promise<IndexScalpResult> {
  if (inflightScan) return inflightScan;
  if (lastScan && Date.now() - lastScan.at < MIN_SCAN_INTERVAL_MS) return lastScan.result;
  inflightScan = runIndexScalpScannerOnce(opts)
    .then((r) => {
      lastScan = { at: Date.now(), result: r };
      if (writesSharedState()) writeSharedSync(INDEX_SHARED, { ...lastScan, withheld: Object.fromEntries(lastWithheld) });
      return r;
    })
    .finally(() => { inflightScan = null; });
  return inflightScan;
}

async function runIndexScalpScannerOnce(opts: { discord?: boolean }): Promise<IndexScalpResult> {
  const session = getScalpSession();
  const ranAt = new Date().toISOString();

  if (!session.isMarketOpen) {
    return { session, scanned: 0, ideas: [], persisted: 0, waits: {}, ranAt };
  }

  const symbols = Object.keys(INDEX_MAP); // SPY, QQQ, IWM
  const etMin = etMinutesNow();
  const waits: Record<string, string[]> = {};
  if (etMin < 585 || etMin > 945) {
    for (const s of symbols) waits[s] = ['outside 09:45–15:45 ET entry window'];
    return { session, scanned: 0, ideas: [], persisted: 0, waits, ranAt };
  }

  const [snaps, eventBlock] = await Promise.all([getGexSnapshotBatch(symbols), eventBlockNow(etMin)]);

  // SPX is not SPY × 10. The ratio drifts enough to move a 0DTE suggestion by
  // several strikes (today it was roughly 10.056). Resolve the live cash-index
  // ratio once per scan before translating SPY GEX levels into SPX levels.
  const spySnap = snaps.get('SPY');
  if (spySnap && spySnap.spot > 0) {
    try {
      const spxCash = await fetchYahooFinancePrice('%5EGSPC');
      if (spxCash?.currentPrice && spxCash.currentPrice > 1_000) {
        INDEX_MAP.SPY.multiplier = spxCash.currentPrice / spySnap.spot;
      } else {
        logger.warn('[INDEX-SCALP] SPX cash quote unavailable — using fallback SPY×10 translation');
      }
    } catch {
      logger.warn('[INDEX-SCALP] SPX cash quote failed — using fallback SPY×10 translation');
    }
  }

  const ideas: IndexScalpIdea[] = [];
  const now = Date.now();
  for (const sym of symbols) {
    const snap = snaps.get(sym);
    if (!snap) { waits[sym] = ['no GEX snapshot (chain fetch failed or timed out)']; continue; }
    const st = await getIntradayStructure(sym);
    if (!st) { waits[sym] = ['no intraday bars']; continue; }
    const zeroDte = await zeroDteBucketFor(sym, snap.spot, now);
    const verdict = evaluateZeroDte(sym, {
      spot: snap.spot, zeroGamma: snap.flipPoint, callWall: snap.callWall, putWall: snap.putWall,
      sign: snap.netGexSign, fetchedAt: snap.fetchedAt, modelledGrossShare: snap.modelledGrossShare ?? null,
    }, st, now, etMin, eventBlock, { zeroDte });
    if (!verdict.setup) { waits[sym] = verdict.wait; continue; }
    const v = verdict.setup;
    const config = INDEX_MAP[sym];
    const scale = config.spx ? config.multiplier : 1;
    const tradeSym = config.spx ? 'SPX' : sym;
    const bias: 'calls' | 'puts' = v.direction === 'long' ? 'calls' : 'puts';
    ideas.push({
      symbol: tradeSym,
      underlying: sym,
      setup: v.powerHour ? 'power_hour' : v.policy === 'A_neg_gamma_continuation' ? 'wall_break' : 'wall_fade',
      direction: v.direction,
      bias,
      spotPrice: v.entry * scale,
      suggestedStrike: roundStrike(v.entry * scale, config.strikeInterval),
      expiryDate: getTodayExpiry(),
      premiumRange: 'live chain',
      target: v.target * scale,
      stop: v.stop * scale,
      riskRewardRatio: +v.rr.toFixed(2),
      // A rank placeholder, not a probability — the policy is unvalidated.
      confidence: 65,
      thesis: `${v.powerHour ? '⚡ ' : ''}${sym} ${v.direction === 'long' ? 'long' : 'short'} — trigger ${v.trigger.name} $${v.trigger.price.toFixed(2)}, target ${v.targetLevel.name} $${v.targetLevel.price.toFixed(2)}, stop $${v.stop.toFixed(2)} (${v.rr.toFixed(2)}R on ${sym}).`,
      isPowerHour: v.powerHour,
      gammaFlip: snap.flipPoint,
      callWall: snap.callWall,
      putWall: snap.putWall,
      regime: snap.regime ?? snap.netGexSign,
      policy: v.policy,
      evidence: v.evidence,
      exitBy: timeStopIso(now),
      entryValidUntil: new Date(now + 10 * 60_000).toISOString(),
    });
  }

  const waitLine = Object.entries(waits).map(([k, w]) => `${k}: ${w[0] ?? '—'}`).join(' · ');
  logger.info(`[INDEX-SCALP] ${session.sessionLabel} ${ideas.length} setup(s)${waitLine ? ` · waits — ${waitLine}` : ''}`);

  let persisted = 0;
  for (const idea of ideas) {
    if (await persistScalp(idea, opts)) persisted++;
  }

  return { session, scanned: snaps.size, ideas, persisted, waits, ranAt };
}

// ─── Intraday Scheduler ─────────────────────────────────────
//
// THE missing wire: before this, the scanner only ran when someone happened
// to load the GEX Hub. That's why intraday index moves got missed — no one
// was watching when price ran. This loops it automatically through the whole
// session: a steady cadence in regular hours, tighter during power hour when
// 0DTE gamma moves accelerate. Self-gating — runIndexScalpScanner() no-ops
// when the market is closed, so this is safe to leave running 24/7.

let scalpInterval: ReturnType<typeof setInterval> | null = null;

const REGULAR_CADENCE_MS = 60 * 1000;      // every minute in regular hours
const POWER_HOUR_CADENCE_MS = 30 * 1000;   // every 30s during power hour
let lastScalpRunMs = 0;

export function startIndexScalpScheduler(): void {
  if (scalpInterval) return;
  logger.info('[INDEX-SCALP] Starting intraday scheduler (60s regular / 30s power hour)...');

  // Tick every 30s; decide whether enough time has elapsed for this session
  // phase. Cheap when the market is closed (early return inside the scanner).
  scalpInterval = setInterval(async () => {
    try {
      const session = getScalpSession();
      if (!session.isMarketOpen) return;

      const cadence = session.isPowerHour ? POWER_HOUR_CADENCE_MS : REGULAR_CADENCE_MS;
      if (Date.now() - lastScalpRunMs < cadence) return;
      lastScalpRunMs = Date.now();

      const result = await runIndexScalpScanner();
      if (result.persisted > 0) {
        logger.info(`[INDEX-SCALP] scheduler persisted ${result.persisted} new scalp idea(s) | session=${result.session.sessionLabel}`);
      }
    } catch (err) {
      logger.warn(`[INDEX-SCALP] scheduler cycle failed: ${(err as Error).message}`);
    }
  }, 30 * 1000);

  logger.info('[INDEX-SCALP] Intraday scheduler started');
}
