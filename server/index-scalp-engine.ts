/**
 * INDEX SCALP ENGINE
 * ==================
 * Generates intraday SPX/SPY/QQQ scalp ideas using GEX structural levels.
 * Targets 0DTE and same-week options in the $1.50–$10.00 premium sweet spot
 * for potential 100–1000%+ runners.
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

import { logger } from './logger';
import { storage } from './storage';
import { getGexSnapshotBatch, type GexSnapshot } from './gex-snapshot-service';

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
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  // EDT (UTC-4)
  const etH = (utcH - 4 + 24) % 24;
  const etMin = etH * 60 + utcM;

  const marketOpen = 9 * 60 + 30;   // 9:30 AM ET
  const powerHour = 15 * 60;         // 3:00 PM ET
  const marketClose = 16 * 60;       // 4:00 PM ET

  // Weekend guard — getUTCDay 0=Sun, 6=Sat. Without this, any Sat/Sun between
  // 9:30–4pm ET would falsely report open and run the scanner on dead data.
  const etDay = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  const isWeekday = etDay >= 1 && etDay <= 5;

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

async function isDuplicate(symbol: string, setup: ScalpSetup, bias: string): Promise<boolean> {
  try {
    const all = await storage.getAllTradeIdeas();
    const cutoff = Date.now() - DUPE_WINDOW_MS;
    return all.some(
      (i: any) =>
        i.symbol === symbol &&
        i.source === 'gex_scanner' &&
        (i.dataSourceUsed || '').includes('scalp') &&
        (i.dataSourceUsed || '').includes(setup) &&
        new Date(i.timestamp).getTime() > cutoff,
    );
  } catch { return false; }
}

// ─── Persistence ────────────────────────────────────────────

async function persistScalp(idea: IndexScalpIdea): Promise<boolean> {
  if (await isDuplicate(idea.symbol, idea.setup, idea.bias)) return false;

  const tradeIdea = {
    symbol: idea.symbol,
    sector: 'index' as const,
    assetType: 'option' as const,
    direction: idea.direction,
    entryPrice: idea.spotPrice,
    targetPrice: idea.target,
    stopLoss: idea.stop,
    riskRewardRatio: idea.riskRewardRatio,
    optionType: idea.bias === 'calls' ? ('call' as const) : ('put' as const),
    strikePrice: idea.suggestedStrike,
    expiryDate: idea.expiryDate,
    catalyst: `${idea.isPowerHour ? '⚡ POWER HOUR ' : ''}${idea.symbol} 0DTE ${idea.bias.toUpperCase()} — ${idea.setup.replace('_', ' ')} | Est. premium ${idea.premiumRange}`,
    analysis: idea.thesis,
    source: 'gex_scanner',
    dataSourceUsed: `GEX_index_scalp_${idea.setup}`,
    sessionContext: idea.isPowerHour ? 'power_hour' : 'intraday',
    timestamp: new Date().toISOString(),
    outcomeStatus: 'open' as const,
    confidenceScore: idea.confidence,
    holdingPeriod: 'day' as const,
    qualitySignals: [
      `index_scalp:${idea.setup}`,
      `regime:${idea.regime}`,
      `underlying:${idea.underlying}`,
      idea.gammaFlip ? `flip:${idea.gammaFlip.toFixed(2)}` : '',
      idea.callWall ? `call_wall:${idea.callWall.toFixed(2)}` : '',
      idea.putWall ? `put_wall:${idea.putWall.toFixed(2)}` : '',
      `strike:${idea.suggestedStrike}`,
      `0DTE:${idea.expiryDate}`,
      idea.isPowerHour ? 'power_hour' : '',
    ].filter(Boolean),
  };

  try {
    await storage.createTradeIdea(tradeIdea as any);
    logger.info(
      `[INDEX-SCALP] ✅ ${idea.symbol} ${idea.bias.toUpperCase()} $${idea.suggestedStrike} 0DTE | ${idea.setup} | ${idea.premiumRange} | ${idea.isPowerHour ? '⚡ POWER HOUR' : 'intraday'}`,
    );

    // Fire a Discord callout for the fresh scalp (gated on DISCORD_WEBHOOK_SPX;
    // no-ops cleanly if unconfigured). Fire-and-forget — never block persist.
    import('./discord-service')
      .then(({ sendIndexScalpToDiscord }) =>
        sendIndexScalpToDiscord({
          symbol: idea.symbol,
          bias: idea.bias,
          setup: idea.setup,
          suggestedStrike: idea.suggestedStrike,
          expiryDate: idea.expiryDate,
          spotPrice: idea.spotPrice,
          target: idea.target,
          stop: idea.stop,
          riskRewardRatio: idea.riskRewardRatio,
          confidence: idea.confidence,
          thesis: idea.thesis,
          premiumRange: idea.premiumRange,
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
}

/**
 * Run the index scalp scanner.
 * Fetches GEX snapshots for SPY + QQQ, generates 0DTE scalp ideas,
 * and persists them to trade_ideas for Trade Desk display.
 */
export async function runIndexScalpScanner(): Promise<IndexScalpResult> {
  const session = getScalpSession();

  if (!session.isMarketOpen) {
    logger.info('[INDEX-SCALP] Market closed — skipping scan');
    return { session, scanned: 0, ideas: [], persisted: 0 };
  }

  const symbols = Object.keys(INDEX_MAP); // SPY, QQQ
  logger.info(`[INDEX-SCALP] Scanning ${symbols.join(', ')} | session=${session.sessionLabel} | powerHour=${session.isPowerHour} | ${session.minutesToClose}min to close`);

  const snaps = await getGexSnapshotBatch(symbols);
  const ideas: IndexScalpIdea[] = [];

  for (const snap of snaps.values()) {
    // Try all setup types — first match wins per symbol
    const setups = [
      buildFlipBounce(snap, session),
      buildWallFade(snap, session),
      buildWallBreak(snap, session),
      buildTrendContinuation(snap, session),
      buildPowerHourPlay(snap, session),
    ].filter(Boolean) as IndexScalpIdea[];

    ideas.push(...setups);
  }

  logger.info(`[INDEX-SCALP] Found ${ideas.length} scalp ideas`);

  let persisted = 0;
  for (const idea of ideas) {
    if (await persistScalp(idea)) persisted++;
  }

  return { session, scanned: snaps.size, ideas, persisted };
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

const REGULAR_CADENCE_MS = 3 * 60 * 1000;  // every 3 min in regular hours
const POWER_HOUR_CADENCE_MS = 90 * 1000;   // every 90s during power hour
let lastScalpRunMs = 0;

export function startIndexScalpScheduler(): void {
  if (scalpInterval) return;
  logger.info('[INDEX-SCALP] Starting intraday scheduler (3min regular / 90s power hour)...');

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

export function stopIndexScalpScheduler(): void {
  if (scalpInterval) {
    clearInterval(scalpInterval);
    scalpInterval = null;
  }
  logger.info('[INDEX-SCALP] Intraday scheduler stopped');
}
