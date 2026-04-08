/**
 * Yahoo Finance Options Chain Fallback
 * ======================================
 * When Tradier API is down (401/missing key), fetch options chain from Yahoo Finance.
 * Returns data in TradierOption-compatible format so GEX/VEX calculators work unchanged.
 *
 * Yahoo Finance provides: strike, OI, volume, IV, and we compute approximate greeks
 * using Black-Scholes. Not as precise as Tradier's greeks but enough for GEX/VEX levels.
 */

import { logger } from './logger';
import { getYahooFinance, safeQuote } from './yahoo-finance-service';

// ─── Types (matches TradierOption shape) ─────────────────────

interface YahooOptionContract {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  expiration: Date;
  contractSymbol: string;
  inTheMoney: boolean;
}

interface TradierCompatOption {
  symbol: string;
  description: string;
  exch: string;
  type: string;
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

// ─── Black-Scholes Greeks (approximate) ──────────────────────

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function computeGreeks(
  spot: number,
  strike: number,
  tte: number,        // time to expiry in years
  iv: number,         // implied volatility (decimal, e.g. 0.25)
  isCall: boolean,
  riskFreeRate: number = 0.045,
): { delta: number; gamma: number; theta: number; vega: number; vanna: number } {
  if (tte <= 0 || iv <= 0 || spot <= 0 || strike <= 0) {
    return { delta: isCall ? (spot > strike ? 1 : 0) : (spot < strike ? -1 : 0), gamma: 0, theta: 0, vega: 0, vanna: 0 };
  }

  const sqrtT = Math.sqrt(tte);
  const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * iv * iv) * tte) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;

  const nd1 = normalPDF(d1);

  const delta = isCall ? normalCDF(d1) : normalCDF(d1) - 1;
  const gamma = nd1 / (spot * iv * sqrtT);
  const vega = spot * nd1 * sqrtT / 100; // per 1% IV move
  const theta = (-(spot * nd1 * iv) / (2 * sqrtT) - riskFreeRate * strike * Math.exp(-riskFreeRate * tte) * (isCall ? normalCDF(d2) : -normalCDF(-d2))) / 365;

  // Vanna = d(delta)/d(vol) = -d2 * nd1 / iv ... but simplified
  const vanna = -(d2 / iv) * nd1;

  return { delta, gamma, theta, vega, vanna };
}

// ─── Yahoo Options Chain Fetcher ─────────────────────────────

export async function getYahooOptionsChain(
  symbol: string,
  expiration?: string,
): Promise<TradierCompatOption[]> {
  try {
    const yf = await getYahooFinance();

    // Get spot price — prefer chart candle (most accurate) over quote (can be stale)
    const { getBestPrice, getChartLastPrice } = await import('./yahoo-finance-service');
    const [quote, chartPrice] = await Promise.all([
      safeQuote(symbol),
      getChartLastPrice(symbol),
    ]);
    const quotePrice = getBestPrice(quote);
    // Chart candle is ground truth; quote's regularMarketPrice can lag by hours
    const spotPrice = chartPrice > 0 ? chartPrice : quotePrice;
    if (spotPrice <= 0) {
      logger.warn(`[YAHOO-OPT] No spot price for ${symbol}`);
      return [];
    }

    // Fetch options — yahoo-finance2 v3 uses options() method
    let optionsData: any;
    try {
      // yahoo-finance2 expects date as epoch seconds (number) matching midnight UTC exactly
      const dateParam = expiration
        ? { date: Math.floor(new Date(expiration + 'T00:00:00Z').getTime() / 1000) }
        : undefined;
      optionsData = await yf.options(symbol, dateParam);
    } catch (e: any) {
      // Fallback: try quoteSummary with defaultKeyStatistics to at least get some data
      logger.warn(`[YAHOO-OPT] options() failed for ${symbol}: ${e.message}, trying alternative...`);
      // Try raw fetch as fallback
      optionsData = await fetchYahooOptionsRaw(symbol, expiration);
    }

    if (!optionsData) {
      logger.warn(`[YAHOO-OPT] No options data for ${symbol}`);
      return [];
    }

    const expirationDates: number[] = optionsData.expirationDates || [];
    const calls: YahooOptionContract[] = optionsData.options?.[0]?.calls || optionsData.calls || [];
    const puts: YahooOptionContract[] = optionsData.options?.[0]?.puts || optionsData.puts || [];

    // Get the actual expiration date string
    let expDateStr = expiration || '';
    if (!expDateStr && expirationDates.length > 0) {
      const d = new Date(expirationDates[0] * 1000);
      expDateStr = d.toISOString().split('T')[0];
    }

    // Calculate time to expiry
    const expDate = expDateStr ? new Date(expDateStr + 'T16:00:00') : new Date(Date.now() + 7 * 86400000);
    const tte = Math.max(0.001, (expDate.getTime() - Date.now()) / (365.25 * 86400000));

    const results: TradierCompatOption[] = [];

    // Filter to strikes within ~15% of spot for relevance
    const lowerBound = spotPrice * 0.85;
    const upperBound = spotPrice * 1.15;

    // Process calls
    for (const c of calls) {
      const strike = c.strike;
      if (strike < lowerBound || strike > upperBound) continue;
      const iv = c.impliedVolatility || 0.25;
      const oi = c.openInterest || 0;
      if (oi === 0 && (c.volume || 0) === 0) continue; // Skip empty strikes

      const greeks = computeGreeks(spotPrice, strike, tte, iv, true);

      results.push(buildCompatOption(symbol, c, greeks, iv, 'call', expDateStr, spotPrice));
    }

    // Process puts
    for (const p of puts) {
      const strike = p.strike;
      if (strike < lowerBound || strike > upperBound) continue;
      const iv = p.impliedVolatility || 0.25;
      const oi = p.openInterest || 0;
      if (oi === 0 && (p.volume || 0) === 0) continue;

      const greeks = computeGreeks(spotPrice, strike, tte, iv, false);

      results.push(buildCompatOption(symbol, p, greeks, iv, 'put', expDateStr, spotPrice));
    }

    const withOI = results.filter(r => r.open_interest > 0).length;
    const sample = results.slice(0, 3).map(r => `$${r.strike}(OI:${r.open_interest},g:${r.greeks?.gamma?.toFixed(4)})`).join(', ');
    logger.info(`[YAHOO-OPT] ${symbol}: ${results.length} options (${calls.length}c/${puts.length}p), spot=$${spotPrice.toFixed(2)}, ${withOI} w/OI, sample: ${sample}`);
    return results;
  } catch (error: any) {
    logger.error(`[YAHOO-OPT] Error fetching options for ${symbol}:`, error.message);
    return [];
  }
}

// Get all available expiration dates
export async function getYahooExpirations(symbol: string): Promise<string[]> {
  try {
    const yf = await getYahooFinance();
    const optionsData = await yf.options(symbol);
    const rawDates: any[] = optionsData?.expirationDates || [];
    return rawDates.map((d: any) => {
      // yahoo-finance2 v3 returns Date objects, not epoch numbers
      if (d instanceof Date) return d.toISOString().split('T')[0];
      if (typeof d === 'number') return new Date(d * 1000).toISOString().split('T')[0];
      return String(d).split('T')[0];
    });
  } catch {
    // Fallback via raw API
    try {
      const data = await fetchYahooOptionsRaw(symbol);
      const timestamps: number[] = data?.expirationDates || [];
      return timestamps.map((ts: number) => new Date(ts * 1000).toISOString().split('T')[0]);
    } catch {
      return [];
    }
  }
}

// ─── Raw Yahoo Finance API fallback ──────────────────────────

async function fetchYahooOptionsRaw(symbol: string, expiration?: string): Promise<any> {
  try {
    let url = `https://query1.finance.yahoo.com/v7/finance/options/${symbol}`;
    if (expiration) {
      const epochSeconds = Math.floor(new Date(expiration + 'T16:00:00').getTime() / 1000);
      url += `?date=${epochSeconds}`;
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      logger.warn(`[YAHOO-OPT] Raw API ${res.status} for ${symbol}`);
      return null;
    }

    const data = await res.json();
    const result = data?.optionChain?.result?.[0];
    if (!result) return null;

    return {
      expirationDates: result.expirationDates || [],
      calls: result.options?.[0]?.calls || [],
      puts: result.options?.[0]?.puts || [],
      options: result.options,
    };
  } catch (e: any) {
    logger.error(`[YAHOO-OPT] Raw API error for ${symbol}:`, e.message);
    return null;
  }
}

// ─── Helper ──────────────────────────────────────────────────

function buildCompatOption(
  underlying: string,
  raw: YahooOptionContract,
  greeks: ReturnType<typeof computeGreeks>,
  iv: number,
  optionType: 'call' | 'put',
  expDateStr: string,
  spotPrice: number,
): TradierCompatOption {
  return {
    symbol: raw.contractSymbol || `${underlying}_${raw.strike}_${optionType}`,
    description: `${underlying} ${expDateStr} ${raw.strike} ${optionType}`,
    exch: 'YAHOO',
    type: optionType,
    last: raw.lastPrice || 0,
    change: 0,
    volume: raw.volume || 0,
    open: raw.lastPrice || 0,
    high: raw.lastPrice || 0,
    low: raw.lastPrice || 0,
    close: raw.lastPrice || 0,
    bid: raw.bid || 0,
    ask: raw.ask || 0,
    underlying,
    strike: raw.strike,
    greeks: {
      delta: greeks.delta,
      gamma: greeks.gamma,
      theta: greeks.theta,
      vega: greeks.vega,
      rho: 0,
      phi: 0,
      bid_iv: iv,
      mid_iv: iv,
      ask_iv: iv,
      smv_vol: iv,
      updated_at: new Date().toISOString(),
      vanna: greeks.vanna, // Computed from Black-Scholes
    } as any,
    change_percentage: 0,
    average_volume: raw.volume || 0,
    last_volume: raw.volume || 0,
    trade_date: Date.now(),
    prevclose: raw.lastPrice || 0,
    week_52_high: 0,
    week_52_low: 0,
    bidsize: 0,
    bidexch: '',
    bid_date: Date.now(),
    asksize: 0,
    askexch: '',
    ask_date: Date.now(),
    // Use OI if available; fall back to volume as proxy when OI is 0
    // (Yahoo often returns 0 OI after hours before EOD settlement)
    open_interest: raw.openInterest || raw.volume || 0,
    contract_size: 100,
    expiration_date: expDateStr,
    expiration_type: 'standard',
    option_type: optionType,
    root_symbol: underlying,
  };
}

logger.info('[YAHOO-OPT] Yahoo Finance options fallback loaded');
