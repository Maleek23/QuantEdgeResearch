// Net Gamma Exposure (GEX) Calculator
// Shows where market makers need to hedge - indicates support/resistance levels

import { logger } from './logger';
import { getTradierOptionsChain, getTradierQuote } from './tradier-api';
import { getYahooOptionsChain, getYahooExpirations } from './yahoo-options-fallback';
import { safeQuote } from './yahoo-finance-service';

interface GammaByStrike {
  strike: number;
  callGamma: number;
  putGamma: number;
  callOI: number;
  putOI: number;
  netGEX: number;  // Net gamma exposure in dollar terms
  callGEX: number;
  putGEX: number;
}

interface GammaExposureResult {
  symbol: string;
  spotPrice: number;
  expiration: string;
  totalNetGEX: number;
  flipPoint: number | null;  // Price where gamma flips from positive to negative
  maxGammaStrike: number;    // Strike with highest absolute gamma
  strikes: GammaByStrike[];
  timestamp: string;
}

export async function calculateGammaExposure(
  symbol: string,
  expiration?: string
): Promise<GammaExposureResult | null> {
  try {
    // Get current stock price — chart candle (most accurate), then Tradier, then Yahoo quote
    const { getChartLastPrice, getBestPrice } = await import('./yahoo-finance-service');
    let quote = await getTradierQuote(symbol);
    let spotPrice = quote?.last || quote?.close || 0;

    // Cross-validate with chart candle price (regularMarketPrice can be stale)
    const chartPrice = await getChartLastPrice(symbol);
    if (chartPrice > 0 && spotPrice > 0 && Math.abs(chartPrice - spotPrice) / spotPrice > 0.01) {
      logger.info(`[GEX] Using chart price $${chartPrice.toFixed(2)} (Tradier $${spotPrice.toFixed(2)} stale)`);
      spotPrice = chartPrice;
    } else if (chartPrice > 0 && spotPrice <= 0) {
      spotPrice = chartPrice;
    }

    if (spotPrice <= 0) {
      const yQuote = await safeQuote(symbol);
      spotPrice = getBestPrice(yQuote);
    }

    if (spotPrice <= 0) {
      logger.error(`[GEX] Invalid spot price for ${symbol}`);
      return null;
    }

    // Get options chain — Tradier first, Yahoo fallback
    let options = await getTradierOptionsChain(symbol, expiration);
    if (options.length === 0) {
      logger.info(`[GEX] Tradier returned no data for ${symbol}, trying Yahoo Finance...`);
      options = await getYahooOptionsChain(symbol, expiration) as any;
    }
    if (options.length === 0) {
      logger.warn(`[GEX] No options data for ${symbol} from any source`);
      return null;
    }

    // Get actual expiration from first option
    const actualExpiration = options[0]?.expiration_date || expiration || 'unknown';

    // Group options by strike
    const strikeMap = new Map<number, GammaByStrike>();

    for (const opt of options) {
      const strike = opt.strike;
      const gamma = opt.greeks?.gamma || 0;
      const oi = opt.open_interest || 0;
      const isCall = opt.option_type === 'call';

      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, {
          strike,
          callGamma: 0,
          putGamma: 0,
          callOI: 0,
          putOI: 0,
          netGEX: 0,
          callGEX: 0,
          putGEX: 0,
        });
      }

      const entry = strikeMap.get(strike)!;
      if (isCall) {
        entry.callGamma = gamma;
        entry.callOI = oi;
      } else {
        entry.putGamma = gamma;
        entry.putOI = oi;
      }
    }

    // Calculate GEX for each strike
    // Formula: GEX = OI × Gamma × 100 × Spot²
    // Calls: Market makers are typically SHORT calls → positive gamma (they buy as price rises)
    // Puts: Market makers are typically LONG puts → negative gamma (they sell as price rises)
    const spotSquared = spotPrice * spotPrice;
    const contractMultiplier = 100; // Standard option contract = 100 shares

    const strikes: GammaByStrike[] = [];
    let totalNetGEX = 0;

    for (const entry of Array.from(strikeMap.values())) {
      // Call GEX: positive (MMs short calls, need to buy stock when price rises)
      entry.callGEX = entry.callOI * entry.callGamma * contractMultiplier * spotSquared / 1e9;
      
      // Put GEX: negative (MMs long puts, need to sell stock when price rises)  
      entry.putGEX = -entry.putOI * entry.putGamma * contractMultiplier * spotSquared / 1e9;
      
      // Net GEX at this strike (in billions, normalized)
      entry.netGEX = entry.callGEX + entry.putGEX;
      
      totalNetGEX += entry.netGEX;
      strikes.push(entry);
    }

    // Sort by strike price
    strikes.sort((a, b) => a.strike - b.strike);

    // Find gamma flip point (where cumulative gamma changes sign)
    let flipPoint: number | null = null;
    let cumulativeGEX = 0;
    let prevSign = 0;
    
    for (const s of strikes) {
      cumulativeGEX += s.netGEX;
      const currentSign = Math.sign(cumulativeGEX);
      if (prevSign !== 0 && currentSign !== prevSign) {
        flipPoint = s.strike;
        break;
      }
      prevSign = currentSign;
    }

    // Find strike with max absolute gamma
    let maxGammaStrike = strikes[0]?.strike || spotPrice;
    let maxGamma = 0;
    for (const s of strikes) {
      const absGamma = Math.abs(s.netGEX);
      if (absGamma > maxGamma) {
        maxGamma = absGamma;
        maxGammaStrike = s.strike;
      }
    }

    // Diagnostic: check data quality
    const nonZeroGamma = strikes.filter(s => s.callGamma > 0 || s.putGamma > 0).length;
    const nonZeroOI = strikes.filter(s => s.callOI > 0 || s.putOI > 0).length;
    const top3 = [...strikes].sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX)).slice(0, 3);
    logger.info(`[GEX] ${symbol}: ${strikes.length} strikes (${nonZeroGamma} w/gamma, ${nonZeroOI} w/OI), spot=$${spotPrice.toFixed(2)}, total GEX: ${totalNetGEX.toFixed(2)}B, maxGamma@$${maxGammaStrike}, top3: ${top3.map(s => `$${s.strike}=${s.netGEX.toFixed(3)}`).join(', ')}`);

    return {
      symbol,
      spotPrice,
      expiration: actualExpiration,
      totalNetGEX,
      flipPoint,
      maxGammaStrike,
      strikes,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`[GEX] Error calculating gamma exposure for ${symbol}:`, error);
    return null;
  }
}

// Calculate GEX across multiple expirations (aggregate view)
export async function calculateAggregateGammaExposure(
  symbol: string
): Promise<GammaExposureResult | null> {
  try {
    // Get spot price — chart candle (most accurate), then Tradier, then Yahoo quote
    const { getChartLastPrice, getBestPrice } = await import('./yahoo-finance-service');
    let quote = await getTradierQuote(symbol);
    let spotPrice = quote?.last || quote?.close || 0;
    const chartPrice = await getChartLastPrice(symbol);
    if (chartPrice > 0 && spotPrice > 0 && Math.abs(chartPrice - spotPrice) / spotPrice > 0.01) {
      spotPrice = chartPrice;
    } else if (chartPrice > 0 && spotPrice <= 0) {
      spotPrice = chartPrice;
    }
    if (spotPrice <= 0) {
      const yQuote = await safeQuote(symbol);
      spotPrice = getBestPrice(yQuote);
    }
    if (spotPrice <= 0) return null;

    // Get all available expirations — Tradier first, Yahoo fallback
    let allExpirations: string[] = [];
    const apiKey = process.env.TRADIER_API_KEY;

    if (apiKey) {
      try {
        const baseUrl = 'https://api.tradier.com/v1';
        const expResponse = await fetch(`${baseUrl}/markets/options/expirations?symbol=${symbol}`, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
        });
        if (expResponse.ok) {
          const expData = await expResponse.json();
          allExpirations = expData.expirations?.date || [];
        }
      } catch { /* fall through to Yahoo */ }
    }

    if (allExpirations.length === 0) {
      logger.info(`[GEX-AGG] Tradier expirations failed for ${symbol}, trying Yahoo...`);
      allExpirations = await getYahooExpirations(symbol);
    }

    // Get next 4 expirations for aggregate view
    const nearExpirations = allExpirations.slice(0, 4);
    if (nearExpirations.length === 0) return null;

    // Aggregate gamma across expirations
    const strikeMap = new Map<number, GammaByStrike>();
    const spotSquared = spotPrice * spotPrice;
    const contractMultiplier = 100;

    for (const exp of nearExpirations) {
      let options = await getTradierOptionsChain(symbol, exp);
      if (options.length === 0) {
        options = await getYahooOptionsChain(symbol, exp) as any;
      }
      
      for (const opt of options) {
        const strike = opt.strike;
        const gamma = opt.greeks?.gamma || 0;
        const oi = opt.open_interest || 0;
        const isCall = opt.option_type === 'call';

        if (!strikeMap.has(strike)) {
          strikeMap.set(strike, {
            strike,
            callGamma: 0,
            putGamma: 0,
            callOI: 0,
            putOI: 0,
            netGEX: 0,
            callGEX: 0,
            putGEX: 0,
          });
        }

        const entry = strikeMap.get(strike)!;
        if (isCall) {
          entry.callOI += oi;
          entry.callGamma = Math.max(entry.callGamma, gamma); // Use max gamma
        } else {
          entry.putOI += oi;
          entry.putGamma = Math.max(entry.putGamma, gamma);
        }
      }
    }

    // Calculate GEX
    const strikes: GammaByStrike[] = [];
    let totalNetGEX = 0;

    for (const entry of Array.from(strikeMap.values())) {
      entry.callGEX = entry.callOI * entry.callGamma * contractMultiplier * spotSquared / 1e9;
      entry.putGEX = -entry.putOI * entry.putGamma * contractMultiplier * spotSquared / 1e9;
      entry.netGEX = entry.callGEX + entry.putGEX;
      totalNetGEX += entry.netGEX;
      strikes.push(entry);
    }

    strikes.sort((a, b) => a.strike - b.strike);

    // Find flip point
    let flipPoint: number | null = null;
    let cumulativeGEX = 0;
    let prevSign = 0;
    
    for (const s of strikes) {
      cumulativeGEX += s.netGEX;
      const currentSign = Math.sign(cumulativeGEX);
      if (prevSign !== 0 && currentSign !== prevSign) {
        flipPoint = s.strike;
        break;
      }
      prevSign = currentSign;
    }

    // Max gamma strike
    let maxGammaStrike = strikes[0]?.strike || spotPrice;
    let maxGamma = 0;
    for (const s of strikes) {
      if (Math.abs(s.netGEX) > maxGamma) {
        maxGamma = Math.abs(s.netGEX);
        maxGammaStrike = s.strike;
      }
    }

    const nonZeroGamma = strikes.filter(s => s.callGamma > 0 || s.putGamma > 0).length;
    const nonZeroOI = strikes.filter(s => s.callOI > 0 || s.putOI > 0).length;
    const top5 = [...strikes].sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX)).slice(0, 5);
    logger.info(`[GEX] ${symbol}: Agg ${nearExpirations.length} exp, ${strikes.length} strikes (${nonZeroGamma} w/gamma, ${nonZeroOI} w/OI), spot=$${spotPrice.toFixed(2)}, GEX=${totalNetGEX.toFixed(3)}B, flip=$${flipPoint || 'none'}, maxGamma@$${maxGammaStrike}`);
    if (top5.length > 0) {
      logger.info(`[GEX] ${symbol} top5: ${top5.map(s => `$${s.strike}(c:${s.callOI}/g:${s.callGamma.toFixed(4)} p:${s.putOI}/g:${s.putGamma.toFixed(4)} net:${s.netGEX.toFixed(3)})`).join(', ')}`);
    }

    return {
      symbol,
      spotPrice,
      expiration: `Aggregate (${nearExpirations.length} exp)`,
      totalNetGEX,
      flipPoint,
      maxGammaStrike,
      strikes,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`[GEX] Aggregate calculation error for ${symbol}:`, error);
    return null;
  }
}
