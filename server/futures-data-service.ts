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
const PRICE_CACHE_TTL = 30 * 1000; // 30 seconds

// Mock price base values
const MOCK_PRICES = {
  NQ: 21000, // E-mini Nasdaq-100 base price
  GC: 2650,  // Gold futures base price
};

// Price fluctuation ranges
const PRICE_FLUCTUATIONS = {
  NQ: 10, // +/- 10 points
  GC: 5,  // +/- 5 points
};

/**
 * Check if Databento API is available
 * TODO: Replace with actual Databento API key check when available
 * Reference: https://databento.com/docs/api-reference/authentication
 */
export function isDatentoAvailable(): boolean {
  const apiKey = process.env.DATABENTO_API_KEY;
  const isAvailable = !!apiKey && apiKey.length > 0;
  
  if (!isAvailable) {
    logger.info('[FUTURES-SERVICE] Databento API key not available - using mock data');
  }
  
  return isAvailable;
}

/**
 * Generate mock price with small random fluctuations
 * @param rootSymbol - 'NQ' or 'GC'
 * @returns Mock price with random fluctuation
 */
function generateMockPrice(rootSymbol: 'NQ' | 'GC'): number {
  const basePrice = MOCK_PRICES[rootSymbol];
  const fluctuation = PRICE_FLUCTUATIONS[rootSymbol];
  
  // Add random fluctuation: +/- fluctuation range
  const randomFluctuation = (Math.random() * 2 - 1) * fluctuation;
  const price = basePrice + randomFluctuation;
  
  // Round to appropriate tick size
  const tickSize = rootSymbol === 'NQ' ? 0.25 : 0.10;
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Get cached price or generate new mock price
 * @param contractCode - e.g., 'NQH25'
 * @param rootSymbol - 'NQ' or 'GC'
 * @returns Cached or newly generated price
 */
function getCachedOrGeneratePrice(contractCode: string, rootSymbol: 'NQ' | 'GC'): number {
  const cached = priceCache.get(contractCode);
  const now = new Date();
  
  // Check if cache is valid (within TTL)
  if (cached && (now.getTime() - cached.timestamp.getTime()) < PRICE_CACHE_TTL) {
    logger.debug(`[FUTURES-SERVICE] Using cached price for ${contractCode}: $${cached.price}`);
    return cached.price;
  }
  
  // Generate new mock price
  const price = generateMockPrice(rootSymbol);
  
  // Update cache
  priceCache.set(contractCode, {
    price,
    timestamp: now,
  });
  
  logger.info(`[FUTURES-SERVICE] Generated mock price for ${contractCode}: $${price} (${rootSymbol} base: $${MOCK_PRICES[rootSymbol]})`);
  
  return price;
}

/**
 * Get active front month contract for a root symbol
 * @param rootSymbol - 'NQ' or 'GC'
 * @returns Active front month futures contract
 * @throws Error if no active contract found
 */
export async function getActiveFuturesContract(rootSymbol: 'NQ' | 'GC'): Promise<FuturesContract> {
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
  
  // Fallback to mock data if Databento not connected
  if (isDatentoAvailable()) {
    logger.debug(`[FUTURES-SERVICE] Databento API key found but no real-time price yet - using mock data`);
  }
  
  const price = getCachedOrGeneratePrice(contractCode, contract.rootSymbol as 'NQ' | 'GC');
  
  return price;
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
  let yahooSymbol = 'NQ=F'; // Default to NQ futures
  
  if (rootSymbol === 'NQ') {
    yahooSymbol = 'NQ=F';
  } else if (rootSymbol === 'GC') {
    yahooSymbol = 'GC=F';
  } else if (rootSymbol === 'ES') {
    yahooSymbol = 'ES=F';
  }
  
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
 * Clear price cache (useful for testing or forcing refresh)
 */
export function clearPriceCache(): void {
  const size = priceCache.size;
  priceCache.clear();
  logger.info(`[FUTURES-SERVICE] Cleared price cache (${size} entries)`);
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
