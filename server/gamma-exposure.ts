// Net Gamma Exposure (GEX) Calculator
// Shows where market makers need to hedge - indicates support/resistance levels

import { logger } from './logger';
import { getTradierOptionsChain, getTradierQuote } from './tradier-api';

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
    // Get current stock price
    const quote = await getTradierQuote(symbol);
    if (!quote) {
      logger.error(`[GEX] Could not get quote for ${symbol}`);
      return null;
    }
    const spotPrice = quote.last || quote.close || 0;
    
    if (spotPrice <= 0) {
      logger.error(`[GEX] Invalid spot price for ${symbol}: ${spotPrice}`);
      return null;
    }

    // Get options chain with greeks
    const options = await getTradierOptionsChain(symbol, expiration);
    if (options.length === 0) {
      logger.warn(`[GEX] No options data for ${symbol}`);
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

    logger.info(`[GEX] ${symbol}: Calculated gamma exposure across ${strikes.length} strikes, total GEX: ${totalNetGEX.toFixed(2)}B`);

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
    const quote = await getTradierQuote(symbol);
    if (!quote) return null;
    
    const spotPrice = quote.last || quote.close || 0;
    if (spotPrice <= 0) return null;

    // Get all available expirations
    const apiKey = process.env.TRADIER_API_KEY;
    if (!apiKey) return null;

    const baseUrl = 'https://api.tradier.com/v1';
    const expResponse = await fetch(`${baseUrl}/markets/options/expirations?symbol=${symbol}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!expResponse.ok) return null;

    const expData = await expResponse.json();
    const allExpirations: string[] = expData.expirations?.date || [];

    // Get next 4 expirations for aggregate view
    const nearExpirations = allExpirations.slice(0, 4);
    
    if (nearExpirations.length === 0) return null;

    // Aggregate gamma across expirations
    const strikeMap = new Map<number, GammaByStrike>();
    const spotSquared = spotPrice * spotPrice;
    const contractMultiplier = 100;

    for (const exp of nearExpirations) {
      const options = await getTradierOptionsChain(symbol, exp);
      
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

    logger.info(`[GEX] ${symbol}: Aggregate gamma across ${nearExpirations.length} expirations, ${strikes.length} strikes`);

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
