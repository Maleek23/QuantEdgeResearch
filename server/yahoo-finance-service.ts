/**
 * Yahoo Finance Service - Shared instance for all Yahoo Finance API calls
 *
 * yahoo-finance2 v3+ requires instantiation before use.
 * This service provides a properly initialized singleton instance.
 */

import { logger } from './logger';

let yahooFinanceInstance: any = null;
let initPromise: Promise<any> | null = null;

/**
 * Get the Yahoo Finance instance (lazy initialization)
 * This ensures only one instance is created and shared across the app.
 */
export async function getYahooFinance() {
  if (yahooFinanceInstance) {
    return yahooFinanceInstance;
  }

  // Prevent multiple simultaneous initializations
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const { default: YahooFinance } = await import('yahoo-finance2');
      yahooFinanceInstance = new YahooFinance();
      logger.info('[YAHOO] Yahoo Finance v3 instance initialized');
      return yahooFinanceInstance;
    } catch (error: any) {
      logger.error('[YAHOO] Failed to initialize Yahoo Finance:', error.message);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Safe quote fetch - handles errors gracefully
 */
export async function safeQuote(symbol: string): Promise<any | null> {
  try {
    const yf = await getYahooFinance();
    return await yf.quote(symbol);
  } catch (error: any) {
    logger.debug(`[YAHOO] Quote failed for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Safe batch quote fetch - returns whatever succeeds
 */
export async function safeBatchQuotes(symbols: string[]): Promise<Record<string, any>> {
  const yf = await getYahooFinance();
  const results: Record<string, any> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const quote = await yf.quote(symbol);
        if (quote) {
          results[symbol] = quote;
        }
      } catch (error: any) {
        logger.debug(`[YAHOO] Batch quote failed for ${symbol}:`, error.message);
      }
    })
  );

  return results;
}

/**
 * Safe screener fetch
 */
export async function safeScreener(params: { scrIds: string; count?: number }): Promise<any | null> {
  try {
    const yf = await getYahooFinance();
    return await yf.screener(params);
  } catch (error: any) {
    logger.debug(`[YAHOO] Screener failed:`, error.message);
    return null;
  }
}

/**
 * Safe quote summary fetch
 */
export async function safeQuoteSummary(symbol: string, modules: string[]): Promise<any | null> {
  try {
    const yf = await getYahooFinance();
    return await yf.quoteSummary(symbol, { modules });
  } catch (error: any) {
    logger.debug(`[YAHOO] Quote summary failed for ${symbol}:`, error.message);
    return null;
  }
}
