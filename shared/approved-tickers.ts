/**
 * Shared Approved Tickers
 * =======================
 * Single source of truth for the watchlist gate.
 * Import this everywhere instead of inline copies.
 */

// S-Tier: highest conviction, best backtested results
export const S_TIER = [
  'AAOI', 'CRCL', 'OKLO', 'LUNR', 'KLAC', 'SMTC',
  'AEHR', 'OLED', 'RMBS', 'BILL', 'INTA', 'MKSI',
] as const;

// A-Tier: strong results, proven setups
export const A_TIER = [
  'LRCX', 'AFRM', 'WDC', 'MU', 'AMD', 'TSEM', 'COIN', 'ARM',
  'HIMS', 'ONTO', 'ENTG', 'UPST', 'DUOL', 'PATH', 'MDB',
  'AMBA', 'COHU', 'SNOW', 'NET', 'FRSH', 'ESTC', 'ACLS', 'ASAN',
  'SOFI', 'DDOG', 'DELL', 'SHOP', 'DKNG', 'MARA', 'BROS',
  'LITE', 'FN', 'CIEN', 'AXTI', 'NBIS', 'TSLA', 'AVGO', 'NFLX',
  'COHR', 'ALGM',
] as const;

// Index ETFs
export const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'XSP', 'DIA'] as const;

// Crypto
export const CRYPTO_TICKERS = ['BTC', 'ETH', 'SOL', 'DOGE'] as const;

// Secondary (allowed but not prioritized)
export const SECONDARY = ['CLSK', 'RKLB', 'ASTS', 'PLTR', 'SMCI', 'SMH', 'XLK'] as const;

// All approved tickers combined
export const APPROVED_TICKERS = new Set([
  ...S_TIER, ...A_TIER, ...INDEX_TICKERS, ...CRYPTO_TICKERS, ...SECONDARY,
]);

// Skip list: proven money losers
export const SKIP_TICKERS = new Set([
  'AI', 'GLBE', 'TOST', 'CYBR', 'MNDY', 'GRAB', 'SE',
]);

/**
 * Check if a ticker is on the approved watchlist
 */
export function isApprovedTicker(symbol: string): boolean {
  return APPROVED_TICKERS.has(symbol.toUpperCase());
}

/**
 * Check if a ticker is on the skip list
 */
export function isSkipTicker(symbol: string): boolean {
  return SKIP_TICKERS.has(symbol.toUpperCase());
}

/**
 * Get tier for a ticker
 */
export function getTier(symbol: string): 'S' | 'A' | 'INDEX' | 'SECONDARY' | null {
  const s = symbol.toUpperCase();
  if ((S_TIER as readonly string[]).includes(s)) return 'S';
  if ((A_TIER as readonly string[]).includes(s)) return 'A';
  if ((INDEX_TICKERS as readonly string[]).includes(s)) return 'INDEX';
  if ((SECONDARY as readonly string[]).includes(s)) return 'SECONDARY';
  return null;
}
