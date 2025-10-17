// Tradier API integration for real-time market data and options chains
// Replaces rate-limited Alpha Vantage with unlimited Tradier access

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
    console.error('Tradier API key not found');
    return null;
  }

  try {
    const baseUrl = getBaseUrl(key);
    const response = await fetch(`${baseUrl}/markets/quotes?symbols=${symbol}`, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Tradier quote error for ${symbol}: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const quote = data.quotes?.quote;
    
    if (!quote || quote.type === 'index') {
      return null;
    }

    return quote;
  } catch (error) {
    console.error(`Tradier quote fetch error for ${symbol}:`, error);
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
    console.error('Tradier API key not found');
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
      console.error(`Tradier history error for ${symbol}: ${response.status}`);
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
    console.error(`Tradier history fetch error for ${symbol}:`, error);
    return [];
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
    console.error('Tradier API key not found');
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
      console.error(`No expiration found for ${symbol}`);
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
      console.error(`Tradier options chain error for ${symbol}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const options: TradierOption[] = data.options?.option || [];
    
    return options;
  } catch (error) {
    console.error(`Tradier options chain fetch error for ${symbol}:`, error);
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
    console.error('Tradier API key not found');
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
      console.error(`Tradier market clock error: ${response.status}`);
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
    console.error('Tradier market clock fetch error:', error);
    return null;
  }
}

// Find optimal option strike based on current price and direction
export async function findOptimalStrike(
  symbol: string,
  currentPrice: number,
  direction: 'long' | 'short',
  apiKey?: string
): Promise<{ strike: number; optionType: 'call' | 'put'; delta?: number } | null> {
  const options = await getTradierOptionsChain(symbol, undefined, apiKey);
  
  if (options.length === 0) {
    // Fallback to simple calculation if no options data
    const strike = direction === 'long' 
      ? Number((currentPrice * 1.02).toFixed(2))
      : Number((currentPrice * 0.98).toFixed(2));
    
    return {
      strike,
      optionType: direction === 'long' ? 'call' : 'put',
      delta: undefined
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
    delta: bestOption.greeks?.delta
  };
}
