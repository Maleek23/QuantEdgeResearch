// Tradier API integration for real-time market data and options chains
// Replaces rate-limited Alpha Vantage with unlimited Tradier access

import { logger } from './logger';
import { logAPIError, logAPISuccess } from './monitoring-service';

interface TradierQuote {
  symbol: string;
  description: string;
  exch: string;
  type: string;
  last: number;
  change: number;
  change_percentage: number;
  volume: number;
  average_volume: number;
  last_volume: number;
  trade_date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  prevclose: number;
  week_52_high: number;
  week_52_low: number;
  bid: number;
  bidsize: number;
  bidexch: string;
  bid_date: number;
  ask: number;
  asksize: number;
  askexch: string;
  ask_date: number;
  root_symbols?: string;
}

interface TradierHistoricalDay {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradierOption {
  symbol: string;
  description: string;
  exch: string;
  type: string; // "call" | "put"
  last: number;
  change: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  close: number;
  bid: number;
  ask: number;
  underlying: string;
  strike: number;
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    phi: number;
    bid_iv: number;
    mid_iv: number;
    ask_iv: number;
    smv_vol: number;
    updated_at: string;
  };
  change_percentage: number;
  average_volume: number;
  last_volume: number;
  trade_date: number;
  prevclose: number;
  week_52_high: number;
  week_52_low: number;
  bidsize: number;
  bidexch: string;
  bid_date: number;
  asksize: number;
  askexch: string;
  ask_date: number;
  open_interest: number;
  contract_size: number;
  expiration_date: string;
  expiration_type: string;
  option_type: string;
  root_symbol: string;
}

const TRADIER_API_BASE = 'https://api.tradier.com/v1';
const TRADIER_SANDBOX_BASE = 'https://sandbox.tradier.com/v1';

// Detect if using sandbox (paper trading) based on API key format
function isSandboxKey(apiKey: string): boolean {
  // Sandbox keys typically start with specific prefixes or can be detected
  // For now, we'll check environment variable or key format
  return process.env.TRADIER_USE_SANDBOX === 'true';
}

function getBaseUrl(apiKey: string): string {
  return isSandboxKey(apiKey) ? TRADIER_SANDBOX_BASE : TRADIER_API_BASE;
}

// Get real-time quote for a stock symbol
export async function getTradierQuote(symbol: string, apiKey?: string): Promise<TradierQuote | null> {
  const key = apiKey || process.env.TRADIER_API_KEY;
  if (!key) {
    logger.error('Tradier API key not found');
    logAPIError('Tradier', '/markets/quotes', new Error('API key not configured'));
    return null;
  }

  const startTime = Date.now();
  try {
    const baseUrl = getBaseUrl(key);
    const response = await fetch(`${baseUrl}/markets/quotes?symbols=${symbol}`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      logger.error(`Tradier quote error for ${symbol}: ${response.status} ${response.statusText}`);
      logAPIError('Tradier', '/markets/quotes', new Error(`HTTP ${response.status}: ${response.statusText}`));
      return null;
    }

    const data = await response.json();
    const quote = data.quotes?.quote;
    
    if (!quote || quote.type === 'index') {
      return null;
    }

    logAPISuccess('Tradier', '/markets/quotes', Date.now() - startTime);
    return quote;
  } catch (error) {
    logger.error(`Tradier quote fetch error for ${symbol}:`, error);
    logAPIError('Tradier', '/markets/quotes', error);
    return null;
  }
}

/**
 * Build OCC option symbol from components
 * Format: SYMBOL + YYMMDD + C/P + 8-digit strike (strike * 1000, zero-padded)
 * Example: AAPL240119C00175000 = AAPL Jan 19 2024 Call $175
 */
export function buildOptionSymbol(
  underlying: string,
  expiryDate: string,  // YYYY-MM-DD format
  optionType: 'call' | 'put',
  strike: number
): string {
  // Parse date
  const [year, month, day] = expiryDate.split('-');
  const yy = year.slice(-2);
  const mm = month.padStart(2, '0');
  const dd = day.padStart(2, '0');
  
  // Option type
  const typeChar = optionType === 'call' ? 'C' : 'P';
  
  // Strike price: multiply by 1000 and pad to 8 digits
  const strikeInt = Math.round(strike * 1000);
  const strikePadded = strikeInt.toString().padStart(8, '0');
  
  return `${underlying.toUpperCase()}${yy}${mm}${dd}${typeChar}${strikePadded}`;
}

/**
 * Fetch current option quote (premium/price) from Tradier
 * Can accept either OCC symbol or individual components
 */
export async function getOptionQuote(
  params: {
    occSymbol?: string;
    underlying?: string;
    expiryDate?: string;
    optionType?: 'call' | 'put';
    strike?: number;
  },
  apiKey?: string
): Promise<{ last: number; bid: number; ask: number; mid: number } | null> {
  const key = apiKey || process.env.TRADIER_API_KEY;
  if (!key) {
    logger.error('Tradier API key not found');
    return null;
  }

  // Build OCC symbol if not provided
  let optionSymbol = params.occSymbol;
  if (!optionSymbol && params.underlying && params.expiryDate && params.optionType && params.strike) {
    optionSymbol = buildOptionSymbol(params.underlying, params.expiryDate, params.optionType, params.strike);
  }
  
  if (!optionSymbol) {
    logger.error('Option quote requires either occSymbol or all components (underlying, expiryDate, optionType, strike)');
    return null;
  }

  try {
    const baseUrl = getBaseUrl(key);
    const response = await fetch(`${baseUrl}/markets/quotes?symbols=${optionSymbol}`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      // Don't log errors for expected cases like expired options
      return null;
    }

    const data = await response.json();
    const quote = data.quotes?.quote;
    
    if (!quote) {
      return null;
    }

    // Return pricing info
    const last = quote.last || 0;
    const bid = quote.bid || 0;
    const ask = quote.ask || 0;
    const mid = (bid + ask) / 2;
    
    return { last, bid, ask, mid };
  } catch (error) {
    // Silent fail for option quotes - they may be expired or invalid
    return null;
  }
}

// Get historical price data
export async function getTradierHistory(
  symbol: string, 
  days: number = 60, 
  apiKey?: string
): Promise<number[]> {
  const key = apiKey || process.env.TRADIER_API_KEY;
  if (!key) {
    logger.error('Tradier API key not found');
    return [];
  }

  try {
    const baseUrl = getBaseUrl(key);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    const response = await fetch(
      `${baseUrl}/markets/history?symbol=${symbol}&interval=daily&start=${start}&end=${end}`,
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      logger.error(`Tradier history error for ${symbol}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const history: TradierHistoricalDay[] = data.history?.day || [];
    
    if (history.length === 0) {
      return [];
    }

    // Return closing prices in chronological order
    return history.map(day => day.close);
  } catch (error) {
    logger.error(`Tradier history fetch error for ${symbol}:`, error);
    return [];
  }
}

// Get historical OHLC data for ATR calculation and chart analysis
export async function getTradierHistoryOHLC(
  symbol: string,
  days: number = 20,
  apiKey?: string
): Promise<{ opens: number[]; highs: number[]; lows: number[]; closes: number[]; dates: string[] } | null> {
  const key = apiKey || process.env.TRADIER_API_KEY;
  if (!key) {
    logger.error('Tradier API key not found');
    return null;
  }

  try {
    const baseUrl = getBaseUrl(key);
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    const response = await fetch(
      `${baseUrl}/markets/history?symbol=${symbol}&interval=daily&start=${start}&end=${end}`,
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      logger.error(`Tradier OHLC history error for ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const history: TradierHistoricalDay[] = data.history?.day || [];
    
    if (history.length === 0) {
      return null;
    }

    // Return OHLC arrays in chronological order (including opens and dates for chart analysis)
    return {
      opens: history.map(day => day.open),
      highs: history.map(day => day.high),
      lows: history.map(day => day.low),
      closes: history.map(day => day.close),
      dates: history.map(day => day.date)
    };
  } catch (error) {
    logger.error(`Tradier OHLC history fetch error for ${symbol}:`, error);
    return null;
  }
}

// Get options chain for a symbol
export async function getTradierOptionsChain(
  symbol: string,
  expiration?: string,
  apiKey?: string
): Promise<TradierOption[]> {
  const key = apiKey || process.env.TRADIER_API_KEY;
  if (!key) {
    logger.error('Tradier API key not found');
    return [];
  }

  try {
    const baseUrl = getBaseUrl(key);
    
    // If no expiration provided, get the nearest expiration
    let targetExpiration = expiration;
    if (!targetExpiration) {
      const expResponse = await fetch(`${baseUrl}/markets/options/expirations?symbol=${symbol}`, {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json'
        }
      });

      if (expResponse.ok) {
        const expData = await expResponse.json();
        const expirations = expData.expirations?.date || [];
        if (expirations.length > 0) {
          targetExpiration = expirations[0]; // First expiration (nearest)
        }
      }
    }

    if (!targetExpiration) {
      logger.error(`No expiration found for ${symbol}`);
      return [];
    }

    const response = await fetch(
      `${baseUrl}/markets/options/chains?symbol=${symbol}&expiration=${targetExpiration}&greeks=true`,
      {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      logger.error(`Tradier options chain error for ${symbol}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const options: TradierOption[] = data.options?.option || [];
    
    return options;
  } catch (error) {
    logger.error(`Tradier options chain fetch error for ${symbol}:`, error);
    return [];
  }
}

// Get options across multiple expiration buckets (weeklies, monthlies, quarterlies, LEAPS)
export async function getTradierOptionsChainsByDTE(
  symbol: string,
  apiKey?: string
): Promise<TradierOption[]> {
  const key = apiKey || process.env.TRADIER_API_KEY;
  if (!key) {
    logger.error('Tradier API key not found');
    return [];
  }

  try {
    const baseUrl = getBaseUrl(key);
    
    // 1. Get all available expirations
    const expResponse = await fetch(`${baseUrl}/markets/options/expirations?symbol=${symbol}`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
      }
    });

    if (!expResponse.ok) {
      logger.error(`Tradier expirations error for ${symbol}: ${expResponse.status}`);
      return [];
    }

    const expData = await expResponse.json();
    const allExpirations: string[] = expData.expirations?.date || [];
    
    if (allExpirations.length === 0) {
      logger.info(`No expirations found for ${symbol}`);
      return [];
    }

    // 2. Bucket expirations by DTE ranges
    const now = new Date();
    const buckets = {
      frontWeek: { min: 0, max: 7, expirations: [] as string[] },    // 0-7 days (includes today/tomorrow, critical for lotto plays)
      weekly: { min: 7, max: 14, expirations: [] as string[] },      // 7-14 days
      monthly: { min: 30, max: 60, expirations: [] as string[] },    // 30-60 days
      quarterly: { min: 90, max: 270, expirations: [] as string[] }, // 90-270 days (3-9 months)
      leaps: { min: 270, max: 540, expirations: [] as string[] },    // 270-540 days (9-18 months)
    };

    for (const expDate of allExpirations) {
      const daysToExp = Math.ceil((new Date(expDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysToExp >= buckets.frontWeek.min && daysToExp <= buckets.frontWeek.max) {
        buckets.frontWeek.expirations.push(expDate);
      } else if (daysToExp >= buckets.weekly.min && daysToExp <= buckets.weekly.max) {
        buckets.weekly.expirations.push(expDate);
      } else if (daysToExp >= buckets.monthly.min && daysToExp <= buckets.monthly.max) {
        buckets.monthly.expirations.push(expDate);
      } else if (daysToExp >= buckets.quarterly.min && daysToExp <= buckets.quarterly.max) {
        buckets.quarterly.expirations.push(expDate);
      } else if (daysToExp >= buckets.leaps.min && daysToExp <= buckets.leaps.max) {
        buckets.leaps.expirations.push(expDate);
      }
    }

    // 3. Select one representative expiration per bucket (nearest in each range)
    // CRITICAL: Always include nearest expiration (for lotto/flow scanners) + longer-dated options
    const selectedExpirations: string[] = [];
    
    // Always add nearest expiration first (safety measure for 0DTE/1DTE plays)
    if (allExpirations.length > 0) {
      selectedExpirations.push(allExpirations[0]);
    }
    
    // Add one per bucket (skip frontWeek since nearest is already added)
    if (buckets.weekly.expirations.length > 0 && !selectedExpirations.includes(buckets.weekly.expirations[0])) {
      selectedExpirations.push(buckets.weekly.expirations[0]);
    }
    if (buckets.monthly.expirations.length > 0) selectedExpirations.push(buckets.monthly.expirations[0]);
    if (buckets.quarterly.expirations.length > 0) selectedExpirations.push(buckets.quarterly.expirations[0]);
    if (buckets.leaps.expirations.length > 0) selectedExpirations.push(buckets.leaps.expirations[0]);

    logger.info(`📅 [OPTIONS] ${symbol}: Found expirations across ${selectedExpirations.length} buckets - ${selectedExpirations.join(', ')}`);

    // 4. Fetch options for each selected expiration (parallelized with rate limiting)
    const optionsPromises = selectedExpirations.map(async (exp, index) => {
      // Basic rate limiting: stagger requests by 100ms each
      await new Promise(resolve => setTimeout(resolve, index * 100));
      return getTradierOptionsChain(symbol, exp, apiKey);
    });

    const optionsArrays = await Promise.all(optionsPromises);
    const allOptions = optionsArrays.flat();

    logger.info(`📅 [OPTIONS] ${symbol}: Retrieved ${allOptions.length} total option contracts across ${selectedExpirations.length} expiration dates`);
    
    return allOptions;
  } catch (error) {
    logger.error(`Tradier multi-expiration fetch error for ${symbol}:`, error);
    return [];
  }
}

// Get market status
export async function getTradierMarketStatus(apiKey?: string): Promise<{
  state: 'premarket' | 'open' | 'postmarket' | 'closed';
  description: string;
  timestamp: string;
} | null> {
  const key = apiKey || process.env.TRADIER_API_KEY;
  if (!key) {
    logger.error('Tradier API key not found');
    return null;
  }

  try {
    const baseUrl = getBaseUrl(key);
    const response = await fetch(`${baseUrl}/markets/clock`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      logger.error(`Tradier market clock error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const clock = data.clock;
    
    return {
      state: clock.state,
      description: clock.description,
      timestamp: clock.timestamp
    };
  } catch (error) {
    logger.error('Tradier market clock fetch error:', error);
    return null;
  }
}

// Find optimal option strike based on current price and direction
export async function findOptimalStrike(
  symbol: string,
  currentPrice: number,
  direction: 'long' | 'short',
  apiKey?: string
): Promise<{ strike: number; optionType: 'call' | 'put'; delta?: number; lastPrice?: number } | null> {
  const options = await getTradierOptionsChain(symbol, undefined, apiKey);
  
  if (options.length === 0) {
    // Fallback to simple calculation if no options data
    const strike = direction === 'long' 
      ? Number((currentPrice * 1.02).toFixed(2))
      : Number((currentPrice * 0.98).toFixed(2));
    
    return {
      strike,
      optionType: direction === 'long' ? 'call' : 'put',
      delta: undefined,
      lastPrice: undefined
    };
  }

  // Filter options by type based on direction
  const optionType: 'call' | 'put' = direction === 'long' ? 'call' : 'put';
  const filteredOptions = options.filter(opt => opt.option_type === optionType);

  if (filteredOptions.length === 0) {
    return null;
  }

  // Find option closest to desired delta (0.30-0.40 for slightly OTM)
  const targetDelta = direction === 'long' ? 0.35 : -0.35;
  
  let bestOption = filteredOptions[0];
  let bestDeltaDiff = Math.abs((bestOption.greeks?.delta || 0) - targetDelta);

  for (const option of filteredOptions) {
    const delta = option.greeks?.delta || 0;
    const deltaDiff = Math.abs(delta - targetDelta);
    
    if (deltaDiff < bestDeltaDiff) {
      bestOption = option;
      bestDeltaDiff = deltaDiff;
    }
  }

  return {
    strike: bestOption.strike,
    optionType: bestOption.option_type as 'call' | 'put',
    delta: bestOption.greeks?.delta,
    lastPrice: bestOption.last || bestOption.bid || bestOption.ask
  };
}

// Validate Tradier API key on startup
export async function validateTradierAPI(): Promise<boolean> {
  const key = process.env.TRADIER_API_KEY;
  if (!key) {
    logger.warn('⚠️  Tradier API key not configured');
    logger.warn('   → Options trading DISABLED until valid key is provided');
    logger.warn('   → Only stock shares and crypto will be generated');
    logAPIError('Tradier', 'validate', new Error('API key not configured'));
    return false;
  }

  const startTime = Date.now();
  try {
    // Test with a simple quote request
    const baseUrl = getBaseUrl(key);
    const response = await fetch(`${baseUrl}/markets/quotes?symbols=AAPL`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      logger.error(`❌ Tradier API validation failed: ${response.status} ${response.statusText}`);
      logger.error('   → Options trading DISABLED - invalid or expired API key');
      logger.error('   → Get a valid key at: https://tradier.com/individuals/api-access');
      logAPIError('Tradier', 'validate', new Error(`HTTP ${response.status}: ${response.statusText} - Invalid or expired API key`));
      return false;
    }

    logger.info('✅ Tradier API connected successfully');
    logger.info('   → Options trading available with real-time data');
    logAPISuccess('Tradier', 'validate', Date.now() - startTime);
    return true;
  } catch (error) {
    logger.error('❌ Tradier API connection error:', error);
    logger.error('   → Options trading DISABLED');
    logAPIError('Tradier', 'validate', error);
    return false;
  }
}

interface TradierLookupResult {
  symbol: string;
  exchange: string;
  type: string;
  description: string;
}

export async function searchSymbolLookup(query: string, apiKey?: string): Promise<TradierLookupResult[]> {
  const key = apiKey || process.env.TRADIER_API_KEY;
  if (!key || query.length < 1) {
    return [];
  }

  const startTime = Date.now();
  try {
    const baseUrl = getBaseUrl(key);
    const response = await fetch(`${baseUrl}/markets/lookup?q=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      logger.warn(`Tradier lookup error for "${query}": ${response.status}`);
      return [];
    }

    const data = await response.json();
    const securities = data.securities?.security;
    
    if (!securities) {
      return [];
    }

    const results = Array.isArray(securities) ? securities : [securities];
    
    logAPISuccess('Tradier', '/markets/lookup', Date.now() - startTime);
    
    return results
      .filter((s: any) => s.type === 'stock' || s.type === 'etf')
      .slice(0, 10)
      .map((s: any) => ({
        symbol: s.symbol,
        exchange: s.exchange,
        type: s.type,
        description: s.description
      }));
  } catch (error) {
    logger.error('Tradier lookup error:', error);
    return [];
  }
}
