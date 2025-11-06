// Shared Lotto Play Detection Utility
// Used by all generators (AI, Quant, Hybrid, News, Flow) to identify high-risk lotto plays

import { logger } from './logger';

// Lotto Mode thresholds - High-risk far-OTM options with 20x potential
const LOTTO_ENTRY_MIN = 0.20; // $20 minimum (options priced at $0.20+)
const LOTTO_ENTRY_MAX = 0.70; // $70 maximum (options priced up to $0.70)
const LOTTO_DELTA_MAX = 0.30; // Far OTM (delta <0.30)
const LOTTO_MAX_DTE = 7; // Weekly expiration only (0-7 days)

interface LottoOption {
  lastPrice: number;           // Entry premium price
  greeks?: { delta?: number }; // Option greeks (delta for OTM detection)
  expiration: string;          // Expiry date (ISO format)
  symbol?: string;             // Option symbol (for logging)
}

/**
 * Check if an option qualifies as a Lotto Play (high-risk far-OTM with 20x potential)
 * 
 * Criteria:
 * 1. Entry price: $0.20 - $0.70 (cheap weeklies for small accounts)
 * 2. Delta: ≤0.30 (far out-of-the-money = high risk, high reward)
 * 3. DTE: 0-7 days (weekly expiration only - no monthlies)
 * 
 * @param option - Option data with lastPrice, greeks, and expiration
 * @returns true if option meets Lotto criteria, false otherwise
 */
export function isLottoCandidate(option: LottoOption): boolean {
  const entryPrice = option.lastPrice;
  const delta = option.greeks?.delta || 0;
  
  // Calculate days to expiration
  const today = new Date();
  const expiryDate = new Date(option.expiration);
  const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  // Lotto criteria validation
  const meetsLottoCriteria = (
    entryPrice >= LOTTO_ENTRY_MIN &&
    entryPrice <= LOTTO_ENTRY_MAX &&
    Math.abs(delta) <= LOTTO_DELTA_MAX &&
    daysToExpiry >= 0 &&
    daysToExpiry <= LOTTO_MAX_DTE
  );
  
  if (meetsLottoCriteria && option.symbol) {
    logger.info(`[LOTTO] ✅ DETECTED: ${option.symbol} - Entry=$${entryPrice.toFixed(2)}, Delta=${Math.abs(delta).toFixed(2)}, DTE=${daysToExpiry} days`);
  }
  
  return meetsLottoCriteria;
}

/**
 * Calculate Lotto-specific targets (20x return with adjusted R:R)
 * 
 * @param entryPrice - Option premium entry price
 * @param direction - Trade direction ('long' or 'short')
 * @returns Updated target price and R:R ratio for Lotto plays
 */
export function calculateLottoTargets(entryPrice: number, direction: 'long' | 'short'): {
  targetPrice: number;
  riskRewardRatio: number;
} {
  // Lotto plays aim for 20x return
  const targetPrice = direction === 'long' 
    ? entryPrice * 20 
    : entryPrice * 0.05; // For shorts, target is 95% drop
  
  return {
    targetPrice,
    riskRewardRatio: 20.0
  };
}

/**
 * Get Lotto thresholds for external use (e.g., filtering, validation)
 */
export function getLottoThresholds() {
  return {
    LOTTO_ENTRY_MIN,
    LOTTO_ENTRY_MAX,
    LOTTO_DELTA_MAX,
    LOTTO_MAX_DTE
  };
}
