import { logger } from "./logger";
import { addDays, parseISO, isAfter, isBefore } from "date-fns";

/**
 * Earnings Calendar Service
 * 
 * Fetches upcoming earnings dates from Alpha Vantage and caches them for 24 hours.
 * Used to block trade generation 2 days before earnings (unless it's a news catalyst).
 */

interface EarningsEvent {
  symbol: string;
  reportDate: string; // YYYY-MM-DD format
  fiscalDateEnding: string;
  estimate: string | null;
}

interface EarningsCache {
  data: EarningsEvent[];
  timestamp: number;
}

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const ALPHA_VANTAGE_API = "https://www.alphavantage.co/query";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let earningsCache: EarningsCache | null = null;

/**
 * Fetch earnings calendar from Alpha Vantage
 * Returns next 3 months of earnings announcements
 */
async function fetchEarningsCalendar(): Promise<EarningsEvent[]> {
  if (!ALPHA_VANTAGE_API_KEY) {
    logger.warn('⚠️ ALPHA_VANTAGE_API_KEY not set - earnings calendar disabled');
    return [];
  }

  try {
    const url = `${ALPHA_VANTAGE_API}?function=EARNINGS_CALENDAR&horizon=3month&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    logger.info('📊 Fetching earnings calendar from Alpha Vantage...');
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: HTTP ${response.status}`);
    }

    const csvData = await response.text();
    
    // Parse CSV (Alpha Vantage returns CSV format)
    // Format: symbol,name,reportDate,fiscalDateEnding,estimate,currency
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    
    const events: EarningsEvent[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      
      if (values.length < 6) continue; // Skip malformed rows
      
      events.push({
        symbol: values[0].trim(),
        reportDate: values[2].trim(), // YYYY-MM-DD
        fiscalDateEnding: values[3].trim(),
        estimate: values[4].trim() || null,
      });
    }

    logger.info(`✅ Fetched ${events.length} upcoming earnings events`);
    return events;
    
  } catch (error) {
    logger.error('❌ Failed to fetch earnings calendar:', error);
    return [];
  }
}

/**
 * Get cached earnings data or fetch fresh if cache expired
 */
async function getEarningsData(): Promise<EarningsEvent[]> {
  const now = Date.now();
  
  // Check cache validity
  if (earningsCache && (now - earningsCache.timestamp) < CACHE_TTL_MS) {
    logger.info(`📋 Using cached earnings data (age: ${Math.round((now - earningsCache.timestamp) / 1000 / 60)} minutes)`);
    return earningsCache.data;
  }

  // Fetch fresh data
  const freshData = await fetchEarningsCalendar();
  
  earningsCache = {
    data: freshData,
    timestamp: now,
  };

  return freshData;
}

/**
 * Check if a symbol has earnings within the next 2 days
 * 
 * @param symbol - Stock symbol to check
 * @returns true if earnings are within 2 days, false otherwise
 */
export async function hasUpcomingEarnings(symbol: string): Promise<boolean> {
  const earningsData = await getEarningsData();
  const now = new Date();
  // 🛡️ Extended from 2 to 3 days to avoid IV crush risk before earnings
  const threeDaysFromNow = addDays(now, 3);

  const symbolUpper = symbol.toUpperCase();
  
  for (const event of earningsData) {
    if (event.symbol.toUpperCase() === symbolUpper) {
      try {
        const reportDate = parseISO(event.reportDate);
        
        // Check if earnings are within next 3 days (was 2 days - too risky)
        if (isAfter(reportDate, now) && isBefore(reportDate, threeDaysFromNow)) {
          logger.info(`📅 EARNINGS ALERT: ${symbol} has earnings on ${event.reportDate} (within 3 days - IV crush risk)`);
          return true;
        }
      } catch (error) {
        logger.warn(`⚠️ Invalid earnings date for ${symbol}: ${event.reportDate}`);
      }
    }
  }

  return false;
}

/**
 * Check if a symbol should be blocked from trade generation
 * 
 * Symbols are blocked if:
 * - Earnings are within 2 days AND
 * - It's NOT a news catalyst trade
 * 
 * @param symbol - Stock symbol to check
 * @param isNewsCatalyst - Whether this is a news-driven trade
 * @returns true if symbol should be blocked, false if it's safe to trade
 */
export async function shouldBlockSymbol(
  symbol: string,
  isNewsCatalyst: boolean = false
): Promise<boolean> {
  // News catalyst trades are exempt from earnings blocks
  if (isNewsCatalyst) {
    logger.info(`📰 ${symbol} is a news catalyst trade - earnings block EXEMPTED`);
    return false;
  }

  // Check for upcoming earnings
  const hasEarnings = await hasUpcomingEarnings(symbol);
  
  if (hasEarnings) {
    logger.warn(`🚫 BLOCKED: ${symbol} has earnings within 2 days (not a news catalyst)`);
    return true;
  }

  return false;
}

/**
 * Get earnings calendar status for monitoring
 */
export function getEarningsServiceStatus() {
  if (!earningsCache) {
    return {
      status: 'not_initialized',
      cacheAge: 0,
      eventsCount: 0,
    };
  }

  const cacheAgeMinutes = Math.round((Date.now() - earningsCache.timestamp) / 1000 / 60);
  const isCacheValid = (Date.now() - earningsCache.timestamp) < CACHE_TTL_MS;

  return {
    status: isCacheValid ? 'active' : 'stale',
    cacheAge: cacheAgeMinutes,
    eventsCount: earningsCache.data.length,
  };
}

/**
 * Force refresh earnings cache (for testing/admin)
 */
export async function refreshEarningsCache(): Promise<void> {
  logger.info('🔄 Forcing earnings cache refresh...');
  earningsCache = null;
  await getEarningsData();
  logger.info('✅ Earnings cache refreshed');
}
