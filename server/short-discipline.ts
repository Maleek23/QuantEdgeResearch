/**
 * SHORT DISCIPLINE
 *
 * Two rules about when this platform is allowed to publish a short.
 *
 * 1. A short needs an EVENT, not a chart. "RSI(2) overbought" and "price rejected
 *    under VWAP" are descriptions of what price already did — generateCatalyst()
 *    turns them into prose that reads like a catalyst, but nothing is actually
 *    happening to the company. A long that fails drifts; a short that fails is
 *    short a name that is being bid, which is the trade that burns you.
 *
 * 2. Crypto miners and treasury-holders are BTC proxies. MARA is not an
 *    independent equity thesis, it is levered bitcoin with a listing. Shorting
 *    one while BTC is holding up is taking the opposite side of the thing that
 *    actually drives it. Structurally these names are long-biased; a short needs
 *    BTC itself to be breaking down AND an event on top.
 *
 * This does not stop shorts. It stops shorts nobody can point at a reason for.
 */

import { logger } from './logger';

/**
 * Equities whose price is a bitcoin proxy — miners, treasury holders, and the
 * exchange. Direction on these follows BTC, not their own fundamentals.
 */
export const BTC_PROXIES = new Set([
  // Miners
  'MARA', 'RIOT', 'CLSK', 'HUT', 'IREN', 'WULF', 'CIFR', 'BITF', 'CORZ', 'BTBT',
  'HIVE', 'BTDR', 'GREE', 'SDIG', 'ARBK', 'CAN',
  // Treasury / balance-sheet proxies
  'MSTR', 'BMNR', 'SMLR',
  // Exchange / infrastructure
  'COIN', 'BKKT', 'GLXY',
  // Spot & equity ETFs that track the same beta
  'IBIT', 'FBTC', 'GBTC', 'BITO', 'BITX', 'WGMI', 'BLOK',
]);

export function isBtcProxy(symbol: string): boolean {
  return BTC_PROXIES.has(symbol.toUpperCase());
}

/**
 * How far BTC has to be breaking down before a short on one of its proxies is
 * even considered. Set to a genuine flush, not ordinary chop — these names are
 * treated as close to long-only, and a -3% BTC day was judged too loose a bar
 * for taking the other side of levered beta.
 */
const BTC_BREAKDOWN_PCT = -5;

export interface ShortDisciplineInput {
  symbol: string;
  direction: 'long' | 'short';
  /**
   * True only when a real dated event backs this trade — an earnings print, a
   * downgrade, guidance, an SEC action. A technical pattern is NOT a catalyst,
   * so callers must not pass `true` merely because `catalyst` is a non-empty
   * string: generateCatalyst() always returns one.
   */
  hasEventCatalyst: boolean;
  /** BTC's session change in percent, when known. */
  btcChangePercent?: number | null;
}

export interface ShortDisciplineResult {
  allowed: boolean;
  reason: string | null;
}

export function evaluateShortDiscipline(input: ShortDisciplineInput): ShortDisciplineResult {
  const { symbol, direction, hasEventCatalyst, btcChangePercent } = input;

  // Longs are not this module's business.
  if (direction !== 'short') return { allowed: true, reason: null };

  if (!hasEventCatalyst) {
    return {
      allowed: false,
      reason: 'short without an event catalyst — technical pattern only',
    };
  }

  if (isBtcProxy(symbol)) {
    const btcIsBreakingDown =
      typeof btcChangePercent === 'number' &&
      Number.isFinite(btcChangePercent) &&
      btcChangePercent <= BTC_BREAKDOWN_PCT;

    if (!btcIsBreakingDown) {
      const btcText =
        typeof btcChangePercent === 'number' && Number.isFinite(btcChangePercent)
          ? `BTC ${btcChangePercent >= 0 ? '+' : ''}${btcChangePercent.toFixed(1)}%`
          : 'BTC move unknown';
      return {
        allowed: false,
        reason: `${symbol} is a BTC proxy and ${btcText} is not a breakdown (needs ≤ ${BTC_BREAKDOWN_PCT}%)`,
      };
    }
  }

  return { allowed: true, reason: null };
}

/** Convenience wrapper that logs the rejection in the generator's voice. */
export function passesShortDiscipline(input: ShortDisciplineInput): boolean {
  const verdict = evaluateShortDiscipline(input);
  if (!verdict.allowed) {
    logger.info(`  🚫 ${input.symbol}: ${verdict.reason}`);
  }
  return verdict.allowed;
}

/**
 * What counts as the EVENT a short requires. The catalysts table holds every
 * ticker-tagged news row, including multi-ticker roundups and opinion pieces —
 * measured live: META carried a Constellation Energy guidance piece as its
 * "catalyst". A mention is not an event. classifyImpact() already grades rows
 * (high = earnings/FDA/M&A/guidance on the actual name, not a roundup), so the
 * gate delegates to that grade instead of re-deriving it.
 */
export function isSubstantiveEventCatalyst(row: { impact?: string | null }): boolean {
  return row.impact === 'high';
}
