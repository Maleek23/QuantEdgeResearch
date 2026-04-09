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
      yahooFinanceInstance = new YahooFinance({
        suppressNotices: ['ripHistorical', 'yahooSurvey'],
      });
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
 * Get the best available price — uses post-market, pre-market, or regular market price
 * depending on which is most current. Essential for after-hours and pre-market moves.
 */
export function getBestPrice(quote: any): number {
  if (!quote) return 0;
  const state = quote.marketState;
  // During post-market session, use postMarketPrice if available
  if ((state === 'POST' || state === 'POSTPOST') && quote.postMarketPrice > 0) {
    return quote.postMarketPrice;
  }
  // During pre-market session, use preMarketPrice if available
  if ((state === 'PRE' || state === 'PREPRE') && quote.preMarketPrice > 0) {
    return quote.preMarketPrice;
  }
  return quote.regularMarketPrice || 0;
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
 * Get the most recent price from Yahoo chart API (1-minute candles).
 * This is more reliable than quote().regularMarketPrice which can be stale.
 */
export async function getChartLastPrice(symbol: string): Promise<number> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=true`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return 0;

    // Get last valid close from candle data
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null && closes[i]! > 0) return closes[i]!;
    }

    // Fallback to meta
    return result.meta?.regularMarketPrice || 0;
  } catch {
    return 0;
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
