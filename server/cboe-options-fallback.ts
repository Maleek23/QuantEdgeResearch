/**
 * CBOE Delayed Options Fallback
 * ==============================
 * Free delayed options chain data from CBOE's public API.
 * No API key required. Data is 15-min delayed during market hours.
 *
 * Used as a last-resort fallback when both Tradier and Yahoo fail.
 * Returns TradierOption-compatible format so GEX/VEX calculators work unchanged.
 */

import { logger } from './logger';

interface CBOEOption {
  option: string;         // OCC symbol
  bid: number;
  ask: number;
  last_sale_price: number;
  volume: number;
  open_interest: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  strike: number;
  expiration_date: string; // "2026-04-18"
  option_type: string;     // "Call" | "Put"
}

interface CBOEQuote {
  current_price: number;
  prev_day_close: number;
  change: number;
  change_percent: number;
}

// ─── CBOE Delayed API ────────────────────────────────────────

export async function getCBOEOptionsChain(symbol: string): Promise<{
  options: any[];
  spotPrice: number;
  expirations: string[];
  source: 'cboe';
} | null> {
  try {
    // CBOE serves delayed quotes via their market data API
    const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol.toUpperCase()}.json`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      logger.warn(`[CBOE-OPT] API ${res.status} for ${symbol}`);
      return null;
    }

    const data = await res.json();
    const quote: CBOEQuote = data?.data?.quote;
    const rawOptions: CBOEOption[] = data?.data?.options || [];

    if (!quote || rawOptions.length === 0) {
      logger.warn(`[CBOE-OPT] No data returned for ${symbol}`);
      return null;
    }

    const spotPrice = quote.current_price || quote.prev_day_close;
    if (spotPrice <= 0) return null;

    // Collect unique expirations
    const expirationSet = new Set<string>();
    for (const opt of rawOptions) {
      if (opt.expiration_date) expirationSet.add(opt.expiration_date);
    }
    const expirations = Array.from(expirationSet).sort();

    // Convert to Tradier-compatible format
    // Filter to strikes within ~15% of spot
    const lowerBound = spotPrice * 0.85;
    const upperBound = spotPrice * 1.15;

    const options = rawOptions
      .filter(opt => opt.strike >= lowerBound && opt.strike <= upperBound)
      .filter(opt => opt.open_interest > 0 || opt.volume > 0)
      .map(opt => ({
        symbol: opt.option,
        description: `${symbol} ${opt.expiration_date} ${opt.strike} ${opt.option_type.toLowerCase()}`,
        exch: 'CBOE',
        type: opt.option_type.toLowerCase(),
        last: opt.last_sale_price || 0,
        change: 0,
        volume: opt.volume || 0,
        open: opt.last_sale_price || 0,
        high: opt.last_sale_price || 0,
        low: opt.last_sale_price || 0,
        close: opt.last_sale_price || 0,
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        underlying: symbol,
        strike: opt.strike,
        greeks: {
          delta: opt.delta || 0,
          gamma: opt.gamma || 0,
          theta: opt.theta || 0,
          vega: opt.vega || 0,
          rho: opt.rho || 0,
          phi: 0,
          bid_iv: opt.iv || 0,
          mid_iv: opt.iv || 0,
          ask_iv: opt.iv || 0,
          smv_vol: opt.iv || 0,
          updated_at: new Date().toISOString(),
        },
        change_percentage: 0,
        average_volume: opt.volume || 0,
        last_volume: opt.volume || 0,
        trade_date: Date.now(),
        prevclose: 0,
        week_52_high: 0,
        week_52_low: 0,
        bidsize: 0,
        bidexch: 'CBOE',
        bid_date: Date.now(),
        asksize: 0,
        askexch: 'CBOE',
        ask_date: Date.now(),
        open_interest: opt.open_interest || 0,
        contract_size: 100,
        expiration_date: opt.expiration_date,
        expiration_type: 'standard',
        option_type: opt.option_type.toLowerCase(),
        root_symbol: symbol,
      }));

    logger.info(`[CBOE-OPT] ${symbol}: ${options.length} options across ${expirations.length} expirations, spot=$${spotPrice.toFixed(2)}`);

    return { options, spotPrice, expirations, source: 'cboe' };
  } catch (e: any) {
    logger.warn(`[CBOE-OPT] Error for ${symbol}: ${e.message}`);
    return null;
  }
}

/**
 * Get expirations from CBOE delayed data
 */
export async function getCBOEExpirations(symbol: string): Promise<string[]> {
  try {
    const result = await getCBOEOptionsChain(symbol);
    return result?.expirations || [];
  } catch {
    return [];
  }
}

logger.info('[CBOE-OPT] CBOE delayed options fallback loaded');
