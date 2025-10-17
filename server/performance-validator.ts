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
}

export class PerformanceValidator {
  /**
   * Validates a trade idea against current market price
   * Determines if it hit target, hit stop, or expired
   */
  static validateTradeIdea(idea: TradeIdea, currentPrice: number): ValidationResult {
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

    // Check if expired (7+ days old)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (createdAt < sevenDaysAgo) {
      const percentGain = this.calculatePercentGain(
        idea.direction,
        idea.entryPrice,
        currentPrice
      );

      return {
        shouldUpdate: true,
        outcomeStatus: 'expired',
        exitPrice: currentPrice,
        percentGain,
        realizedPnL: 0, // Don't calculate P&L for expired ideas
        resolutionReason: 'auto_expired',
        exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        actualHoldingTimeMinutes: holdingTimeMinutes,
      };
    }

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

      return {
        shouldUpdate: true,
        outcomeStatus: 'hit_stop',
        exitPrice: idea.stopLoss,
        percentGain,
        realizedPnL: 0,
        resolutionReason: 'auto_stop_hit',
        exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        actualHoldingTimeMinutes: holdingTimeMinutes,
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
   * Batch validate multiple trade ideas
   */
  static validateBatch(
    ideas: TradeIdea[],
    priceMap: Map<string, number>
  ): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const idea of ideas) {
      const currentPrice = priceMap.get(idea.symbol);
      if (!currentPrice) continue;

      const result = this.validateTradeIdea(idea, currentPrice);
      if (result.shouldUpdate) {
        results.set(idea.id, result);
      }
    }

    return results;
  }
}
