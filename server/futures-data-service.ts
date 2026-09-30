import { logger } from "./logger";
import { storage } from "./storage";
import type { FuturesContract } from "@shared/schema";
import { getFuturesPrice as getRealtimeFuturesPrice } from "./realtime-price-service";

// Price cache with 30-second TTL
interface PriceCacheEntry {
  price: number;
  timestamp: Date;
}

const priceCache = new Map<string, PriceCacheEntry>();
const FUTURES_ROOTS = new Set(['NQ', 'ES', 'YM', 'RTY', 'GC', 'SI', 'HG', 'PL', 'PA', 'CL', 'NG', 'ZB', 'ZN']);
/**
 * Get active front month contract for a root symbol
 * @param rootSymbol - Futures root symbol (e.g., 'NQ', 'GC', 'HG', 'CL')
 * @returns Active front month futures contract
 * @throws Error if no active contract found
 */
export async function getActiveFuturesContract(rootSymbol: string): Promise<FuturesContract> {
  logger.debug(`[FUTURES-SERVICE] Fetching active front month contract for ${rootSymbol}`);

  const contract = await storage.getActiveFuturesContract(rootSymbol);

  if (!contract) {
    const error = `No active front month contract found for ${rootSymbol}`;
    logger.error(`[FUTURES-SERVICE] ${error}`);
    throw new Error(error);
  }

  logger.info(`[FUTURES-SERVICE] Found active contract: ${contract.contractCode} (expires: ${contract.expirationDate})`);

  return contract;
}

/**
 * Get current price for a specific futures contract
 * @param contractCode - e.g., 'NQH25', 'GCJ25'
 * @returns Current price (mock data until Databento integrated)
 * @throws Error if contract not found
 */
export async function getFuturesPrice(contractCode: string): Promise<number> {
  logger.debug(`[FUTURES-SERVICE] Fetching price for ${contractCode}`);

  // Root symbols (ES/NQ/CL/...) are widely used by market context callers.
  // Resolve them through the real quote adapter before looking for a stored
  // dated contract. The previous implementation rejected them, then other
  // screens quietly displayed a static mock.
  if (FUTURES_ROOTS.has(contractCode.toUpperCase())) {
    const { fetchFuturesQuote } = await import('./market-api');
    const quote = await fetchFuturesQuote(contractCode.toUpperCase());
    if (!quote || !Number.isFinite(quote.price)) {
      throw new Error(`Live futures price unavailable: ${contractCode.toUpperCase()}`);
    }
    return quote.price;
  }
  
  // Validate contract exists in database
  const contract = await storage.getFuturesContract(contractCode);
  
  if (!contract) {
    const error = `Contract not found: ${contractCode}`;
    logger.error(`[FUTURES-SERVICE] ${error}`);
    throw new Error(error);
  }
  
  // PRIORITY 1: Try real-time Databento WebSocket price (sub-second latency)
  const realtimePrice = getRealtimeFuturesPrice(contract.rootSymbol);
  if (realtimePrice) {
    const ageMs = Date.now() - realtimePrice.timestamp.getTime();
    logger.debug(`[FUTURES-RT] ${contractCode}: $${realtimePrice.price} (${ageMs}ms old, source: ${realtimePrice.source})`);
    
    // Update cache with real-time price
    priceCache.set(contractCode, {
      price: realtimePrice.price,
      timestamp: realtimePrice.timestamp,
    });
    
    return realtimePrice.price;
  }
  
  // Never manufacture a tradable mark. Consumers must render unavailable and
  // preserve the last verified observation, not a hard-coded ES/NQ/CL value.
  throw new Error(`Live futures price unavailable: ${contractCode}`);
}

/**
 * Get multiple contract prices at once (bulk operation)
 * @param contractCodes - Array of contract codes (e.g., ['NQH25', 'GCJ25'])
 * @returns Map of contract code to price
 */
export async function getFuturesPrices(contractCodes: string[]): Promise<Map<string, number>> {
  logger.debug(`[FUTURES-SERVICE] Fetching prices for ${contractCodes.length} contracts`);
  
  const priceMap = new Map<string, number>();
  
  // TODO: Replace with Databento batch API when available
  // Reference: https://databento.com/docs/api-reference/timeseries/batch
  // For now, fetch each price individually (can be optimized later)
  
  for (const contractCode of contractCodes) {
    try {
      const price = await getFuturesPrice(contractCode);
      priceMap.set(contractCode, price);
    } catch (error) {
      logger.error(`[FUTURES-SERVICE] Failed to get price for ${contractCode}:`, error);
      // Continue with other contracts even if one fails
    }
  }
  
  logger.info(`[FUTURES-SERVICE] Successfully fetched ${priceMap.size}/${contractCodes.length} prices`);
  
  return priceMap;
}

// Price history cache for trend analysis
const historyCache = new Map<string, { prices: number[]; timestamp: Date }>();
const HISTORY_CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Get recent price history for trend analysis
 * Uses Yahoo Finance for historical data
 * @param contractCode - e.g., 'NQH25', 'GCJ25'
 * @returns Array of recent prices (last 20 data points)
 */
export async function getFuturesHistory(contractCode: string): Promise<number[]> {
  // Check cache first
  const cached = historyCache.get(contractCode);
  if (cached && (Date.now() - cached.timestamp.getTime()) < HISTORY_CACHE_TTL) {
    return cached.prices;
  }
  
  // Map contract code to Yahoo Finance symbol
  const rootSymbol = contractCode.substring(0, 2).toUpperCase();

  // Yahoo Finance futures symbols mapping
  const yahooSymbolMap: Record<string, string> = {
    // Index futures
    NQ: 'NQ=F', ES: 'ES=F', YM: 'YM=F', RTY: 'RTY=F',
    // Metals (COMEX)
    GC: 'GC=F', SI: 'SI=F', HG: 'HG=F', PL: 'PL=F', PA: 'PA=F',
    // Energy (NYMEX)
    CL: 'CL=F', NG: 'NG=F', RB: 'RB=F', HO: 'HO=F',
    // Bonds
    ZB: 'ZB=F', ZN: 'ZN=F', ZF: 'ZF=F', ZT: 'ZT=F',
    // Agriculture
    ZC: 'ZC=F', ZS: 'ZS=F', ZW: 'ZW=F',
  };

  const yahooSymbol = yahooSymbolMap[rootSymbol] || `${rootSymbol}=F`;
  
  try {
    // Fetch from Yahoo Finance
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=5m&range=2d`);
    if (!response.ok) {
      logger.warn(`[FUTURES-HISTORY] Yahoo fetch failed for ${yahooSymbol}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const quotes = data.chart?.result?.[0]?.indicators?.quote?.[0];
    const closes = quotes?.close?.filter((p: any) => p !== null) || [];
    
    // Get last 20 prices for trend analysis
    const recentPrices = closes.slice(-20) as number[];
    
    // Cache the result
    historyCache.set(contractCode, {
      prices: recentPrices,
      timestamp: new Date()
    });
    
    logger.info(`[FUTURES-HISTORY] Fetched ${recentPrices.length} prices for ${contractCode}`);
    return recentPrices;
  } catch (error) {
    logger.warn(`[FUTURES-HISTORY] Error fetching history for ${contractCode}:`, error);
    return [];
  }
}
/**
 * Get cache statistics (for monitoring/debugging)
 */
export function getCacheStats(): { size: number; entries: Array<{ contractCode: string; price: number; age: number }> } {
  const now = new Date();
  const entries = Array.from(priceCache.entries()).map(([contractCode, entry]) => ({
    contractCode,
    price: entry.price,
    age: Math.floor((now.getTime() - entry.timestamp.getTime()) / 1000), // age in seconds
  }));
  
  return {
    size: priceCache.size,
    entries,
  };
}
