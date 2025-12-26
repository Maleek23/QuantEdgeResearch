import { TradeIdea, FuturesContract } from "@shared/schema";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// 🎯 MINIMUM LOSS THRESHOLD: Losses below this are treated as "breakeven"
// Aligns with platform stop-loss rules: stocks=3.5%, crypto=5%
// Losses under 3% are likely noise/tight stops, not proper stop-loss hits
const MIN_LOSS_THRESHOLD_PERCENT = 3.0; // 3% minimum to count as a real loss

interface ValidationResult {
  shouldUpdate: boolean;
  outcomeStatus?: TradeIdea['outcomeStatus'];
  exitPrice?: number;
  realizedPnL?: number;
  percentGain?: number;
  resolutionReason?: TradeIdea['resolutionReason'];
  exitDate?: string;
  actualHoldingTimeMinutes?: number;
  predictionAccurate?: boolean; // LEGACY: kept for backward compatibility
  predictionAccuracyPercent?: number; // NEW: percentage-based accuracy (0-100+)
  predictionValidatedAt?: string;
  highestPriceReached?: number;
  lowestPriceReached?: number;
}

export class PerformanceValidator {
  /**
   * Parse human-readable exitBy dates like "Oct 22, 10:28 AM CST" or "Oct 22, 9:55 AM CST or Expiry"
   * Uses the trade's creation timestamp to determine the correct year
   * Returns a valid Date object or null if parsing fails
   */
  private static parseExitByDate(exitByString: string, tradeCreatedAt: Date): Date | null {
    try {
      // Remove "or Expiry" suffix if present
      const cleanedString = exitByString.replace(/\s+or\s+Expiry$/i, '').trim();
      
      // Try standard parsing first (handles ISO dates)
      let exitByDate = new Date(cleanedString);
      if (!isNaN(exitByDate.getTime())) {
        return exitByDate;
      }
      
      // Parse human-readable format: "Oct 22, 10:28 AM CST"
      // Regex: (Month) (Day), (Time) (AM/PM) (Timezone?)
      const match = cleanedString.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i);
      
      if (!match) {
        return null; // Can't parse
      }
      
      const [, monthStr, dayStr, hourStr, minuteStr, ampm] = match;
      
      // Convert month abbreviation to number (0-indexed)
      const monthMap: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
      };
      
      const month = monthMap[monthStr];
      if (month === undefined) {
        return null;
      }
      
      const day = parseInt(dayStr);
      let hour = parseInt(hourStr);
      const minute = parseInt(minuteStr);
      
      // Convert to 24-hour format
      if (ampm.toUpperCase() === 'PM' && hour !== 12) {
        hour += 12;
      } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
        hour = 0;
      }
      
      // CRITICAL FIX: Build date string in ISO format and parse
      // The Date constructor is behaving weirdly with UTC, so let's use a string instead
      const currentYear = new Date().getFullYear();
      
      // Build ISO date string: "2025-10-22T16:28:00-06:00" (CST)
      // Month is 0-indexed in Date constructor but 1-indexed in ISO string
      const isoMonth = String(month + 1).padStart(2, '0');
      const isoDay = String(day).padStart(2, '0');
      const isoHour = String(hour).padStart(2, '0');
      const isoMinute = String(minute).padStart(2, '0');
      
      // CST = UTC-6, CDT = UTC-5
      const tzOffset = '-06:00'; // Using CST for consistency
      
      // Create ISO date string
      const isoString = `${currentYear}-${isoMonth}-${isoDay}T${isoHour}:${isoMinute}:00${tzOffset}`;
      
      exitByDate = new Date(isoString);
      
      // Validate the result
      if (isNaN(exitByDate.getTime())) {
        console.error(`Failed to parse ISO date: ${isoString}`);
        return null;
      }
      
      // If the parsed date is more than 6 months in the past, it's probably next year
      const sixMonthsAgo = new Date(Date.now() - (6 * 30 * 24 * 60 * 60 * 1000));
      if (exitByDate < sixMonthsAgo) {
        const nextYearIsoString = `${currentYear + 1}-${isoMonth}-${isoDay}T${isoHour}:${isoMinute}:00${tzOffset}`;
        exitByDate = new Date(nextYearIsoString);
      }
      
      return exitByDate;
    } catch (e) {
      return null;
    }
  }

  /**
   * Validate trade direction/target/stop/option type consistency
   * Preserves all VALID option combinations, only corrects STOCKS with mismatched direction
   * 
   * Valid combinations:
   * - Stocks: long (bullish) = target > entry, short (bearish) = target < entry
   * - Options bullish: {long call} OR {short put} with target > entry
   * - Options bearish: {long put} OR {short call} with target < entry
   * 
   * @returns Validated trade data with warnings for invalid options
   */
  static validateAndCorrectTrade(trade: {
    direction: string;
    assetType: string;
    optionType?: string | null;
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
  }): {
    direction: 'long' | 'short';
    optionType?: 'call' | 'put' | null;
    warnings: string[];
  } | null {
    const warnings: string[] = [];
    
    // Determine if trade is bullish or bearish based on entry/target
    const isBullish = trade.targetPrice > trade.entryPrice;
    
    // For non-options, validate and AUTO-CORRECT direction if needed
    if (trade.assetType !== 'option') {
      const expectedDirection = isBullish ? 'long' : 'short';
      if (trade.direction !== expectedDirection) {
        warnings.push(`Stock direction "${trade.direction}" doesn't match entry/target logic (entry=${trade.entryPrice}, target=${trade.targetPrice}). Auto-corrected to "${expectedDirection}".`);
        return {
          direction: expectedDirection,
          optionType: null,
          warnings
        };
      }
      // Valid stock trade
      return {
        direction: trade.direction as 'long' | 'short',
        optionType: null,
        warnings: []
      };
    }
    
    // For options, validate direction + optionType combination is valid for bias
    const validBullish = (trade.direction === 'long' && trade.optionType === 'call') ||
                         (trade.direction === 'short' && trade.optionType === 'put');
    const validBearish = (trade.direction === 'long' && trade.optionType === 'put') ||
                         (trade.direction === 'short' && trade.optionType === 'call');
    
    // Check if combination is valid for the expected directional bias
    if (isBullish && !validBullish) {
      warnings.push(`INVALID OPTION TRADE: Bullish target (${trade.targetPrice} > ${trade.entryPrice}) but direction="${trade.direction}" + optionType="${trade.optionType}" is not a valid bullish combination. Valid: {long call} or {short put}. Trade will be REJECTED.`);
      // DO NOT auto-correct options - this could corrupt user intent
      // Return original values with warning
      return {
        direction: trade.direction as 'long' | 'short',
        optionType: trade.optionType as 'call' | 'put' | null,
        warnings
      };
    } else if (!isBullish && !validBearish) {
      warnings.push(`INVALID OPTION TRADE: Bearish target (${trade.targetPrice} < ${trade.entryPrice}) but direction="${trade.direction}" + optionType="${trade.optionType}" is not a valid bearish combination. Valid: {long put} or {short call}. Trade will be REJECTED.`);
      // DO NOT auto-correct options - this could corrupt user intent
      // Return original values with warning
      return {
        direction: trade.direction as 'long' | 'short',
        optionType: trade.optionType as 'call' | 'put' | null,
        warnings
      };
    }
    
    // Valid option trade - no corrections needed
    return {
      direction: trade.direction as 'long' | 'short',
      optionType: trade.optionType as 'call' | 'put',
      warnings: []
    };
  }

  /**
   * Normalize trade direction considering both direction field and option type
   * This ensures correct validation for both stocks and options
   * 
   * Rules:
   * - Stocks: direction field directly indicates bullish (long) vs bearish (short)
   * - Options: {long call, short put} = bullish, {long put, short call} = bearish
   * 
   * @returns 'long' for bullish trades, 'short' for bearish trades
   */
  static getNormalizedDirection(idea: TradeIdea): 'long' | 'short' {
    // For non-option assets, use direction field directly
    if (idea.assetType !== 'option' || !idea.optionType) {
      return idea.direction as 'long' | 'short';
    }

    // For options, normalize based on direction + option type combination
    if (idea.direction === 'long' && idea.optionType === 'call') {
      return 'long';  // Long call = bullish (price goes up)
    } else if (idea.direction === 'long' && idea.optionType === 'put') {
      return 'short'; // Long put = bearish (price goes down)
    } else if (idea.direction === 'short' && idea.optionType === 'call') {
      return 'short'; // Short call = bearish (price goes down)
    } else if (idea.direction === 'short' && idea.optionType === 'put') {
      return 'long';  // Short put = bullish (price goes up)
    }

    // Fallback to direction field if unable to normalize
    return idea.direction as 'long' | 'short';
  }

  /**
   * Validates a trade idea against current market price
   * Determines if it hit target, hit stop, or expired
   * Note: currentPrice can be null/undefined for expiry checks when market is closed
   * @param futuresContract Optional futures contract metadata (avoids circular dependency)
   */
  static validateTradeIdea(idea: TradeIdea, currentPrice?: number | null, futuresContract?: FuturesContract | null): ValidationResult {
    // Skip if already closed
    if (idea.outcomeStatus !== 'open') {
      return { shouldUpdate: false };
    }

    const timezone = 'America/Chicago';
    const now = new Date();
    const createdAt = new Date(idea.timestamp);

    // Calculate holding time in minutes
    const holdingTimeMs = now.getTime() - createdAt.getTime();
    const holdingTimeMinutes = Math.floor(holdingTimeMs / (1000 * 60));

    // 🚨 CRITICAL CHECK: Has the entry window closed?
    // If entryValidUntil has passed, mark as expired (missed entry window)
    if (idea.entryValidUntil) {
      try {
        const entryValidUntilDate = this.parseExitByDate(idea.entryValidUntil, createdAt);
        
        if (entryValidUntilDate && now > entryValidUntilDate) {
          const hoursPassedSinceEntry = (now.getTime() - entryValidUntilDate.getTime()) / (1000 * 60 * 60);
          console.log(`⛔ [VALIDATION] ${idea.symbol} EXPIRED - Entry window closed ${hoursPassedSinceEntry.toFixed(1)}h ago (Valid Until: ${idea.entryValidUntil})`);
          
          // Use entry price since we never entered the trade
          const lastKnownPrice = idea.entryPrice;
          
          return {
            shouldUpdate: true,
            outcomeStatus: 'expired',
            exitPrice: lastKnownPrice,
            percentGain: 0, // Never entered, no gain/loss
            realizedPnL: 0,
            resolutionReason: 'missed_entry_window',
            exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            actualHoldingTimeMinutes: 0, // Never held the position
            predictionAccurate: false, // Can't validate if we didn't enter
            predictionAccuracyPercent: 0,
            predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            highestPriceReached: lastKnownPrice,
            lowestPriceReached: lastKnownPrice,
          };
        }
      } catch (e) {
        console.warn(`⚠️ [VALIDATION] Error parsing entryValidUntil for ${idea.symbol}:`, e);
      }
    }

    // 🚨 CRITICAL CHECK: Has the futures contract expired?
    // Futures use futuresContractCode and check against contract expiration
    // BUG FIX: Use passed contract parameter instead of dynamic import (avoids circular dependency)
    if (idea.assetType === 'future' && idea.futuresContractCode) {
      // 🔧 BUG FIX: Validate contract metadata exists - don't use hardcoded defaults
      if (!futuresContract) {
        console.error(`❌ [VALIDATION ERROR] ${idea.symbol}: Missing futures contract metadata for ${idea.futuresContractCode}. Cannot validate without contract data. Skipping validation.`);
        return { shouldUpdate: false };
      }
      
      if (!futuresContract.initialMargin || futuresContract.initialMargin <= 0) {
        console.error(`❌ [VALIDATION ERROR] ${idea.symbol}: Invalid or missing initialMargin for contract ${idea.futuresContractCode}. Cannot calculate margin return. Skipping validation.`);
        return { shouldUpdate: false };
      }
      
      try {
        const expiryDate = new Date(futuresContract.expirationDate);
        
        if (!isNaN(expiryDate.getTime()) && now > expiryDate) {
          const hoursPastExpiry = (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60);
          console.log(`⛔ [VALIDATION] ${idea.symbol} FUTURES CONTRACT EXPIRED ${hoursPastExpiry.toFixed(1)}h ago (Contract: ${idea.futuresContractCode}, Expiry: ${futuresContract.expirationDate})`);
          
          // Use last known price (entry price for futures since we can't fetch historical prices yet)
          const lastKnownPrice = currentPrice ?? idea.entryPrice;
          
          const highestPrice = Math.max(
            idea.highestPriceReached || idea.entryPrice,
            currentPrice || idea.highestPriceReached || idea.entryPrice
          );
          const lowestPrice = Math.min(
            idea.lowestPriceReached || idea.entryPrice,
            currentPrice || idea.lowestPriceReached || idea.entryPrice
          );
          
          const percentGain = this.calculatePercentGain(
            idea.direction as 'long' | 'short',
            idea.entryPrice,
            lastKnownPrice
          );
          
          // 🔧 BUG FIX: Calculate futures P&L correctly (multiply by multiplier ONCE, not twice)
          // Old broken formula: pnl = (price delta * multiplier) / (tick * multiplier) * (tick * multiplier)
          // New correct formula: Round price delta to tick size FIRST, then multiply by multiplier ONCE
          const directionSign = idea.direction === 'long' ? 1 : -1;
          const priceDelta = (lastKnownPrice - idea.entryPrice) * directionSign;
          const tickSize = idea.futuresTickSize || 0.25;
          const multiplier = idea.futuresMultiplier || 1;
          
          // 🔧 DIRECTION-AWARE ROUNDING: Conservative rounding to prevent sign flip
          // For LONG trades: use Math.floor (rounds down, conservative)
          // For SHORT trades: use Math.ceil (rounds up towards zero, conservative)
          const ticksAway = priceDelta / tickSize;
          const tickRounded = (idea.direction === 'long' ? Math.floor(ticksAway) : Math.ceil(ticksAway)) * tickSize;
          
          // Multiply by contract multiplier exactly ONCE
          const realizedPnL = tickRounded * multiplier;
          
          // Calculate margin return
          const marginReturn = futuresContract.initialMargin > 0 ? (realizedPnL / futuresContract.initialMargin) * 100 : 0;
          
          const predictionAccurate = this.checkPredictionAccuracy(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          console.log(`💰 [FUTURES-PNL] ${idea.symbol} ${idea.futuresContractCode}: P&L ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)} (${marginReturn.toFixed(1)}% return on margin)`);
          
          return {
            shouldUpdate: true,
            outcomeStatus: 'expired',
            exitPrice: lastKnownPrice,
            percentGain,
            realizedPnL,
            resolutionReason: 'auto_expired',
            exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            actualHoldingTimeMinutes: holdingTimeMinutes,
            predictionAccurate,
            predictionAccuracyPercent,
            predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            highestPriceReached: highestPrice,
            lowestPriceReached: lowestPrice,
          };
        }
      } catch (e) {
        console.warn(`⚠️ [VALIDATION] Error checking futures contract expiration for ${idea.symbol}:`, e);
      }
    }

    // 🚨 CRITICAL CHECK: Has the option expired?
    // Options use expiryDate field instead of exitBy
    if (idea.assetType === 'option' && idea.expiryDate) {
      try {
        const expiryDate = new Date(idea.expiryDate);
        
        if (!isNaN(expiryDate.getTime()) && now > expiryDate) {
          const hoursPastExpiry = (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60);
          console.log(`⛔ [VALIDATION] ${idea.symbol} OPTION EXPIRED ${hoursPastExpiry.toFixed(1)}h ago (Expiry: ${idea.expiryDate})`);
          
          // Use last known price (entry price for options since we can't fetch historical option premiums)
          const lastKnownPrice = currentPrice ?? idea.entryPrice;
          
          const highestPrice = Math.max(
            idea.highestPriceReached || idea.entryPrice,
            currentPrice || idea.highestPriceReached || idea.entryPrice
          );
          const lowestPrice = Math.min(
            idea.lowestPriceReached || idea.entryPrice,
            currentPrice || idea.lowestPriceReached || idea.entryPrice
          );
          
          const percentGain = this.calculatePercentGain(
            idea.direction as 'long' | 'short',
            idea.entryPrice,
            lastKnownPrice
          );
          
          const predictionAccurate = this.checkPredictionAccuracy(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          return {
            shouldUpdate: true,
            outcomeStatus: 'expired',
            exitPrice: lastKnownPrice,
            percentGain,
            realizedPnL: 0,
            resolutionReason: 'auto_expired',
            exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            actualHoldingTimeMinutes: holdingTimeMinutes,
            predictionAccurate,
            predictionAccuracyPercent,
            predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            highestPriceReached: highestPrice,
            lowestPriceReached: lowestPrice,
          };
        }
      } catch (e) {
        console.warn(`⚠️ [VALIDATION] Error parsing expiryDate for ${idea.symbol}:`, e);
      }
    }

    // Check if exitBy time has passed (holding period deadline)
    // This check doesn't require current price
    if (idea.exitBy) {
      try {
        const exitByDate = this.parseExitByDate(idea.exitBy, createdAt);
        
        if (!exitByDate) {
          console.warn(`⚠️ [VALIDATION] Invalid exitBy date for ${idea.symbol}: ${idea.exitBy}`);
          // Skip expiry check for invalid dates, fall through to other checks
        } else {
          // CRITICAL SAFEGUARD: Double-check date is actually in the past
          const timeDiff = exitByDate.getTime() - now.getTime();
          const hoursUntilExpiry = timeDiff / (1000 * 60 * 60);
          
          // Log validation details for debugging
          console.log(`📊 [VALIDATION] ${idea.symbol}: exitBy="${idea.exitBy}" → parsed as ${exitByDate.toISOString()} (${hoursUntilExpiry.toFixed(1)}h remaining)`);
          
          // SAFEGUARD: Only mark as expired if truly past deadline
          if (now > exitByDate) {
          // Use last known price (entry, highest, or lowest) if current price unavailable
          const lastKnownPrice = currentPrice ?? 
            (idea.highestPriceReached || idea.lowestPriceReached || idea.entryPrice);
          
          const highestPrice = Math.max(
            idea.highestPriceReached || idea.entryPrice, 
            currentPrice || idea.highestPriceReached || idea.entryPrice
          );
          const lowestPrice = Math.min(
            idea.lowestPriceReached || idea.entryPrice,
            currentPrice || idea.lowestPriceReached || idea.entryPrice
          );
          
          const directionForExpired = idea.assetType === 'option' 
            ? idea.direction as 'long' | 'short'
            : this.getNormalizedDirection(idea);
          const percentGain = this.calculatePercentGain(
            directionForExpired,
            idea.entryPrice,
            lastKnownPrice
          );
          
          const predictionAccurate = this.checkPredictionAccuracy(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );

            console.log(`✅ [VALIDATION] ${idea.symbol} EXPIRED (deadline passed ${(-hoursUntilExpiry).toFixed(1)}h ago)`);
            
            return {
              shouldUpdate: true,
              outcomeStatus: 'expired',
              exitPrice: lastKnownPrice,
              percentGain,
              realizedPnL: 0,
              resolutionReason: 'auto_expired',
              exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
              actualHoldingTimeMinutes: holdingTimeMinutes,
              predictionAccurate,
              predictionAccuracyPercent,
              predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
              highestPriceReached: highestPrice,
              lowestPriceReached: lowestPrice,
            };
          } else {
            // Date is in the future - DO NOT mark as expired
            console.log(`⏰ [VALIDATION] ${idea.symbol} still active (${hoursUntilExpiry.toFixed(1)}h until expiry)`);
          }
        }
      } catch (e) {
        // If exitBy parsing fails, continue to other checks
        console.warn(`❌ [VALIDATION] Failed to parse exitBy date for ${idea.symbol}: ${idea.exitBy}`, e);
      }
    }

    // Check if expired (7+ days old as backup)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (createdAt < sevenDaysAgo) {
      const lastKnownPrice = currentPrice ?? 
        (idea.highestPriceReached || idea.lowestPriceReached || idea.entryPrice);
      
      const highestPrice = Math.max(
        idea.highestPriceReached || idea.entryPrice, 
        currentPrice || idea.highestPriceReached || idea.entryPrice
      );
      const lowestPrice = Math.min(
        idea.lowestPriceReached || idea.entryPrice,
        currentPrice || idea.lowestPriceReached || idea.entryPrice
      );
      
      const directionFor7Days = idea.assetType === 'option' 
        ? idea.direction as 'long' | 'short'
        : this.getNormalizedDirection(idea);
      const percentGain = this.calculatePercentGain(
        directionFor7Days,
        idea.entryPrice,
        lastKnownPrice
      );
      
      const predictionAccurate = this.checkPredictionAccuracy(
        idea,
        lastKnownPrice,
        highestPrice,
        lowestPrice
      );
      
      const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
        idea,
        lastKnownPrice,
        highestPrice,
        lowestPrice
      );

      return {
        shouldUpdate: true,
        outcomeStatus: 'expired',
        exitPrice: lastKnownPrice,
        percentGain,
        realizedPnL: 0, // Don't calculate P&L for expired ideas
        resolutionReason: 'auto_expired',
        exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        actualHoldingTimeMinutes: holdingTimeMinutes,
        predictionAccurate,
        predictionAccuracyPercent,
        predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        highestPriceReached: highestPrice,
        lowestPriceReached: lowestPrice,
      };
    }

    // For target/stop checks, we need current price to update extremes
    // But we can still validate using historical extremes if current price unavailable
    
    // Track price extremes (update if current price is more extreme)
    const highestPrice = currentPrice 
      ? Math.max(idea.highestPriceReached || idea.entryPrice, currentPrice)
      : (idea.highestPriceReached || idea.entryPrice);
    const lowestPrice = currentPrice
      ? Math.min(idea.lowestPriceReached || idea.entryPrice, currentPrice)
      : (idea.lowestPriceReached || idea.entryPrice);

    // 🔧 CRITICAL FIX: For OPTIONS, use actual direction (not normalized)
    // because we're validating PREMIUM prices, not underlying stock movement.
    // For STOCKS/CRYPTO, use normalized direction for semantic correctness.
    //
    // Example: SHORT PUT (direction='short', optionType='put')
    //   - Normalized: 'long' (bullish on underlying)  
    //   - Actual: 'short' (you SELL the option, profit when premium DROPS)
    //   - We need ACTUAL direction to validate premium movement correctly!
    const directionForValidation = idea.assetType === 'option' 
      ? idea.direction as 'long' | 'short'
      : this.getNormalizedDirection(idea);

    // 🎯 CRITICAL FIX: Check INTRADAY highs/lows instead of current price
    // This catches targets that were hit intraday but reversed by EOD
    // For LONG trades: Check if highest price reached >= target
    // For SHORT trades: Check if lowest price reached <= target
    const targetHit = directionForValidation === 'long'
      ? highestPrice >= idea.targetPrice
      : lowestPrice <= idea.targetPrice;

    if (targetHit) {
      const percentGain = this.calculatePercentGain(
        directionForValidation,
        idea.entryPrice,
        idea.targetPrice
      );

      // Calculate futures P&L if applicable
      let realizedPnL = 0;
      if (idea.assetType === 'future' && idea.futuresMultiplier && idea.futuresTickSize) {
        // 🔧 BUG FIX: Calculate futures P&L correctly (multiply by multiplier ONCE, not twice)
        const directionSign = idea.direction === 'long' ? 1 : -1;
        const priceDelta = (idea.targetPrice - idea.entryPrice) * directionSign;
        const tickSize = idea.futuresTickSize;
        const multiplier = idea.futuresMultiplier;
        
        // 🔧 DIRECTION-AWARE ROUNDING: Conservative rounding to prevent sign flip
        // For LONG trades: use Math.floor (rounds down, conservative)
        // For SHORT trades: use Math.ceil (rounds up towards zero, conservative)
        const ticksAway = priceDelta / tickSize;
        const tickRounded = (idea.direction === 'long' ? Math.floor(ticksAway) : Math.ceil(ticksAway)) * tickSize;
        
        // Multiply by contract multiplier exactly ONCE
        realizedPnL = tickRounded * multiplier;
        
        console.log(`💰 [FUTURES-PNL] ${idea.symbol} target hit: P&L ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`);
      }

      console.log(`🎯 [VALIDATION] ${idea.symbol} HIT TARGET intraday (${directionForValidation.toUpperCase()}: ${directionForValidation === 'long' ? `high $${highestPrice.toFixed(2)} >= target $${idea.targetPrice}` : `low $${lowestPrice.toFixed(2)} <= target $${idea.targetPrice}`})`);

      return {
        shouldUpdate: true,
        outcomeStatus: 'hit_target',
        exitPrice: idea.targetPrice,
        percentGain,
        realizedPnL,
        resolutionReason: 'auto_target_hit',
        exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        actualHoldingTimeMinutes: holdingTimeMinutes,
        predictionAccurate: true, // Hit target = prediction was accurate
        predictionAccuracyPercent: 100, // Hit target = 100% accuracy
        predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        highestPriceReached: highestPrice,
        lowestPriceReached: lowestPrice,
      };
    }

    // 🎯 CRITICAL FIX: Check INTRADAY highs/lows for stops too
    // For LONG trades: Check if lowest price reached <= stop
    // For SHORT trades: Check if highest price reached >= stop
    const stopHit = directionForValidation === 'long'
      ? lowestPrice <= idea.stopLoss
      : highestPrice >= idea.stopLoss;

    if (stopHit) {
      const percentGain = this.calculatePercentGain(
        directionForValidation,
        idea.entryPrice,
        idea.stopLoss
      );
      
      // 🎯 MINIMUM LOSS THRESHOLD CHECK
      // If loss is below threshold (e.g., -0.1%, -0.4%), treat as breakeven/expired
      // This prevents noise-level stop-outs from counting as real losses
      const absLoss = Math.abs(percentGain);
      if (absLoss < MIN_LOSS_THRESHOLD_PERCENT) {
        console.log(`📊 [VALIDATION] ${idea.symbol} stop touched but loss too small (${percentGain.toFixed(2)}% < ${MIN_LOSS_THRESHOLD_PERCENT}% threshold) - marking as BREAKEVEN`);
        
        const predictionAccurate = this.checkPredictionAccuracy(
          idea,
          currentPrice || lowestPrice,
          highestPrice,
          lowestPrice
        );
        
        const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
          idea,
          currentPrice || lowestPrice,
          highestPrice,
          lowestPrice
        );
        
        return {
          shouldUpdate: true,
          outcomeStatus: 'expired', // Breakeven = expired, not a real loss
          exitPrice: idea.stopLoss,
          percentGain,
          realizedPnL: 0,
          resolutionReason: 'auto_breakeven', // New resolution reason
          exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
          actualHoldingTimeMinutes: holdingTimeMinutes,
          predictionAccurate,
          predictionAccuracyPercent,
          predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
          highestPriceReached: highestPrice,
          lowestPriceReached: lowestPrice,
        };
      }
      
      // Calculate futures P&L if applicable
      let realizedPnL = 0;
      if (idea.assetType === 'future' && idea.futuresMultiplier && idea.futuresTickSize) {
        // 🔧 BUG FIX: Calculate futures P&L correctly (multiply by multiplier ONCE, not twice)
        const directionSign = idea.direction === 'long' ? 1 : -1;
        const priceDelta = (idea.stopLoss - idea.entryPrice) * directionSign;
        const tickSize = idea.futuresTickSize;
        const multiplier = idea.futuresMultiplier;
        
        // 🔧 DIRECTION-AWARE ROUNDING: Conservative rounding to prevent sign flip
        // For LONG trades: use Math.floor (rounds down, conservative)
        // For SHORT trades: use Math.ceil (rounds up towards zero, conservative)
        const ticksAway = priceDelta / tickSize;
        const tickRounded = (idea.direction === 'long' ? Math.floor(ticksAway) : Math.ceil(ticksAway)) * tickSize;
        
        // Multiply by contract multiplier exactly ONCE
        realizedPnL = tickRounded * multiplier;
        
        console.log(`💰 [FUTURES-PNL] ${idea.symbol} stop hit: P&L ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`);
      }
      
      // Even if stop hit, check if prediction moved in right direction before reversing
      const predictionAccurate = this.checkPredictionAccuracy(
        idea,
        currentPrice || lowestPrice,
        highestPrice,
        lowestPrice
      );
      
      const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
        idea,
        currentPrice || lowestPrice,
        highestPrice,
        lowestPrice
      );

      console.log(`🛑 [VALIDATION] ${idea.symbol} HIT STOP intraday (${directionForValidation.toUpperCase()}: ${directionForValidation === 'long' ? `low $${lowestPrice.toFixed(2)} <= stop $${idea.stopLoss}` : `high $${highestPrice.toFixed(2)} >= stop $${idea.stopLoss}`}) - Loss: ${percentGain.toFixed(2)}%`);

      return {
        shouldUpdate: true,
        outcomeStatus: 'hit_stop',
        exitPrice: idea.stopLoss,
        percentGain,
        realizedPnL,
        resolutionReason: 'auto_stop_hit',
        exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        actualHoldingTimeMinutes: holdingTimeMinutes,
        predictionAccurate,
        predictionAccuracyPercent,
        predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        highestPriceReached: highestPrice,
        lowestPriceReached: lowestPrice,
      };
    }

    // Still open - update price extremes if they changed
    const priceExtremesChanged = currentPrice && (
      highestPrice !== (idea.highestPriceReached || idea.entryPrice) ||
      lowestPrice !== (idea.lowestPriceReached || idea.entryPrice)
    );

    if (priceExtremesChanged) {
      return {
        shouldUpdate: true,
        highestPriceReached: highestPrice,
        lowestPriceReached: lowestPrice,
      };
    }

    // Still open - no update needed
    return { shouldUpdate: false };
  }

  /**
   * Calculate percentage gain/loss
   */
  private static calculatePercentGain(
    direction: string,
    entryPrice: number,
    exitPrice: number
  ): number {
    if (!entryPrice || entryPrice === 0) return 0;

    const priceDiff = exitPrice - entryPrice;
    const percentChange = (priceDiff / entryPrice) * 100;

    // For shorts, invert the percentage
    return direction === 'short' ? -percentChange : percentChange;
  }

  /**
   * Calculate prediction accuracy as percentage progress toward target
   * Returns 0-100+ (can exceed 100% if price moves beyond target)
   * 
   * Example: Entry $100, Target $110 ($10 move expected)
   *   - If at $105: 50% progress (moved $5 of $10)
   *   - If at $108: 80% progress (moved $8 of $10)
   *   - If at $112: 120% progress (moved $12 of $10)
   */
  private static calculatePredictionAccuracyPercent(
    idea: TradeIdea,
    currentPrice: number,
    highestPrice?: number,
    lowestPrice?: number
  ): number {
    const expectedMove = idea.targetPrice - idea.entryPrice;
    
    if (idea.direction === 'long') {
      // For LONG: Calculate progress using highest price reached
      const peakPrice = highestPrice || currentPrice;
      const actualMove = peakPrice - idea.entryPrice;
      const progressPercent = (actualMove / expectedMove) * 100;
      // Clamp at 0 minimum (negative means moved wrong direction)
      return Math.max(0, progressPercent);
    } else {
      // For SHORT: Calculate progress using lowest price reached
      const bottomPrice = lowestPrice || currentPrice;
      const actualMove = idea.entryPrice - bottomPrice;
      const targetMove = idea.entryPrice - idea.targetPrice;
      const progressPercent = (actualMove / targetMove) * 100;
      // Clamp at 0 minimum (negative means moved wrong direction)
      return Math.max(0, progressPercent);
    }
  }
  
  /**
   * LEGACY: Check if prediction was accurate (50% threshold)
   * Kept for backward compatibility
   */
  private static checkPredictionAccuracy(
    idea: TradeIdea,
    currentPrice: number,
    highestPrice?: number,
    lowestPrice?: number
  ): boolean {
    const accuracyPercent = this.calculatePredictionAccuracyPercent(
      idea,
      currentPrice,
      highestPrice,
      lowestPrice
    );
    return accuracyPercent >= 50;
  }

  /**
   * Batch validate multiple trade ideas
   * Note: Validates ALL ideas, even without prices (for expiry checks)
   * @param contractsMap Optional map of futures contracts by contract code (avoids circular dependency)
   */
  static validateBatch(
    ideas: TradeIdea[],
    priceMap: Map<string, number>,
    contractsMap?: Map<string, FuturesContract>
  ): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const idea of ideas) {
      // Get price if available, otherwise undefined (expiry checks don't need price)
      const currentPrice = priceMap.get(idea.symbol);
      
      // Get futures contract if applicable
      const futuresContract = idea.futuresContractCode && contractsMap 
        ? contractsMap.get(idea.futuresContractCode)
        : undefined;
      
      const result = this.validateTradeIdea(idea, currentPrice, futuresContract);
      if (result.shouldUpdate) {
        results.set(idea.id, result);
      }
    }

    return results;
  }
}
