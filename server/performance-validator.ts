import { TradeIdea } from "@shared/schema";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

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
      
      // CRITICAL FIX: Use trade creation year as baseline, not current year
      // This prevents dates from rolling into next year after they've passed
      const tradeYear = tradeCreatedAt.getFullYear();
      
      // Start with trade's year
      exitByDate = new Date(Date.UTC(tradeYear, month, day, hour + 6, minute, 0, 0)); // +6 for CST offset
      
      // If exitBy is BEFORE trade creation, it must be next year
      // (e.g., trade created Dec 31, exitBy Jan 1)
      if (exitByDate < tradeCreatedAt) {
        exitByDate = new Date(Date.UTC(tradeYear + 1, month, day, hour + 6, minute, 0, 0));
      }
      
      return exitByDate;
    } catch (e) {
      return null;
    }
  }

  /**
   * Validates a trade idea against current market price
   * Determines if it hit target, hit stop, or expired
   * Note: currentPrice can be null/undefined for expiry checks when market is closed
   */
  static validateTradeIdea(idea: TradeIdea, currentPrice?: number | null): ValidationResult {
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

    // Check if exitBy time has passed (holding period deadline)
    // This check doesn't require current price
    if (idea.exitBy) {
      try {
        const exitByDate = this.parseExitByDate(idea.exitBy, createdAt);
        
        if (!exitByDate) {
          console.warn(`Invalid exitBy date for ${idea.symbol}: ${idea.exitBy}`);
          // Skip expiry check for invalid dates, fall through to other checks
        } else if (now > exitByDate) {
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
          
          const percentGain = this.calculatePercentGain(
            idea.direction,
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
        // If exitBy parsing fails, continue to other checks
        console.warn(`Failed to parse exitBy date for ${idea.symbol}: ${idea.exitBy}`);
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
      
      const percentGain = this.calculatePercentGain(
        idea.direction,
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

    // For target/stop checks, we need current price
    if (!currentPrice) {
      return { shouldUpdate: false };
    }

    // Track price extremes (update if current price is more extreme)
    const highestPrice = Math.max(idea.highestPriceReached || idea.entryPrice, currentPrice);
    const lowestPrice = Math.min(idea.lowestPriceReached || idea.entryPrice, currentPrice);

    // Check if target hit
    const targetHit = idea.direction === 'long'
      ? currentPrice >= idea.targetPrice
      : currentPrice <= idea.targetPrice;

    if (targetHit) {
      const percentGain = this.calculatePercentGain(
        idea.direction,
        idea.entryPrice,
        idea.targetPrice
      );

      return {
        shouldUpdate: true,
        outcomeStatus: 'hit_target',
        exitPrice: idea.targetPrice,
        percentGain,
        realizedPnL: 0, // Will be calculated when user enters position size
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

    // Check if stop loss hit
    const stopHit = idea.direction === 'long'
      ? currentPrice <= idea.stopLoss
      : currentPrice >= idea.stopLoss;

    if (stopHit) {
      const percentGain = this.calculatePercentGain(
        idea.direction,
        idea.entryPrice,
        idea.stopLoss
      );
      
      // Even if stop hit, check if prediction moved in right direction before reversing
      const predictionAccurate = this.checkPredictionAccuracy(
        idea,
        currentPrice,
        highestPrice,
        lowestPrice
      );
      
      const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
        idea,
        currentPrice,
        highestPrice,
        lowestPrice
      );

      return {
        shouldUpdate: true,
        outcomeStatus: 'hit_stop',
        exitPrice: idea.stopLoss,
        percentGain,
        realizedPnL: 0,
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
    const priceExtremesChanged = 
      highestPrice !== (idea.highestPriceReached || idea.entryPrice) ||
      lowestPrice !== (idea.lowestPriceReached || idea.entryPrice);

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
   */
  static validateBatch(
    ideas: TradeIdea[],
    priceMap: Map<string, number>
  ): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const idea of ideas) {
      // Get price if available, otherwise undefined (expiry checks don't need price)
      const currentPrice = priceMap.get(idea.symbol);
      
      const result = this.validateTradeIdea(idea, currentPrice);
      if (result.shouldUpdate) {
        results.set(idea.id, result);
      }
    }

    return results;
  }
}
