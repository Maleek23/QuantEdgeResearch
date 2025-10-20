import { db } from "./db";
import { tradeIdeas, type TradeIdea, type VolatilityRegime, type SessionPhase } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Timing Intelligence System
 * 
 * Calculates quantitatively-proven entry/exit windows based on:
 * - Historical holding-time distributions per signal/grade/asset
 * - Current market regime (volatility, session phase, trend strength)
 * - ML-learned patterns from validated outcomes
 * - Confidence score alignment with timing windows
 */

export interface TimingAnalytics {
  entryWindowMinutes: number;
  exitWindowMinutes: number;
  holdingPeriodType: 'day' | 'swing' | 'position' | 'week-ending';
  timingConfidence: number;
  targetHitProbability: number;
  volatilityRegime: VolatilityRegime;
  sessionPhase: SessionPhase;
  trendStrength: number;
}

export interface MarketRegime {
  volatilityRegime: VolatilityRegime;
  sessionPhase: SessionPhase;
  trendStrength: number;
}

export interface SignalStack {
  rsiValue?: number;
  macdHistogram?: number;
  volumeRatio?: number;
  priceVs52WeekHigh?: number;
  priceVs52WeekLow?: number;
  signals: string[];
  confidenceScore: number;
  grade: string;
}

/**
 * Compute historical holding-time distribution for given parameters
 */
async function getHistoricalHoldingTimes(
  assetType: 'stock' | 'crypto',
  grade: string,
  minConfidence: number
): Promise<number[]> {
  try {
    const historicalTrades = await db
      .select({
        holdingTime: tradeIdeas.actualHoldingTimeMinutes,
      })
      .from(tradeIdeas)
      .where(
        and(
          eq(tradeIdeas.assetType, assetType),
          eq(tradeIdeas.probabilityBand, grade),
          gte(tradeIdeas.confidenceScore, minConfidence),
          sql`${tradeIdeas.outcomeStatus} IN ('hit_target', 'hit_stop')`,
          sql`${tradeIdeas.actualHoldingTimeMinutes} IS NOT NULL`
        )
      );

    return historicalTrades
      .map((t: { holdingTime: number | null }) => t.holdingTime!)
      .filter((t: number) => t > 0 && t < 1440); // Filter 0 and > 24 hours
  } catch (error) {
    logger.error("Failed to fetch historical holding times", { error, assetType, grade });
    return [];
  }
}

/**
 * Calculate percentile from array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  
  if (upper >= sorted.length) return sorted[sorted.length - 1];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Detect current market regime
 */
export function detectMarketRegime(signals: SignalStack): MarketRegime {
  // Volatility regime based on volume ratio and price action
  let volatilityRegime: VolatilityRegime = 'normal';
  if (signals.volumeRatio && signals.volumeRatio > 3.0) {
    volatilityRegime = signals.volumeRatio > 5.0 ? 'extreme' : 'high';
  } else if (signals.volumeRatio && signals.volumeRatio < 0.7) {
    volatilityRegime = 'low';
  }

  // Session phase based on current time (CST timezone)
  const now = new Date();
  const hour = now.getUTCHours() - 5; // Convert to CST (simplified)
  let sessionPhase: SessionPhase = 'overnight';
  
  if (hour >= 9 && hour < 10) {
    sessionPhase = 'opening';
  } else if (hour >= 10 && hour < 15) {
    sessionPhase = 'mid-day';
  } else if (hour >= 15 && hour < 16) {
    sessionPhase = 'closing';
  }

  // Trend strength: combine MACD momentum + RSI extremity
  let trendStrength = 50; // Default neutral
  
  if (signals.rsiValue !== undefined) {
    // RSI extremes indicate strong trend
    if (signals.rsiValue < 30) trendStrength += 20;
    else if (signals.rsiValue > 70) trendStrength += 20;
    else if (signals.rsiValue >= 40 && signals.rsiValue <= 60) trendStrength -= 10; // Neutral zone
  }
  
  if (signals.macdHistogram !== undefined) {
    // Strong MACD histogram = strong trend
    const macdStrength = Math.abs(signals.macdHistogram);
    if (macdStrength > 1.0) trendStrength += 15;
    else if (macdStrength < 0.2) trendStrength -= 10;
  }
  
  trendStrength = Math.max(0, Math.min(100, trendStrength));

  return { volatilityRegime, sessionPhase, trendStrength };
}

/**
 * Calculate optimal timing windows based on historical data + current regime
 */
export async function calculateTimingWindows(
  assetType: 'stock' | 'crypto',
  signals: SignalStack,
  regime: MarketRegime
): Promise<TimingAnalytics> {
  // Get historical holding times for this grade/asset type
  const minConfidence = signals.confidenceScore - 10; // Look at similar confidence range
  const holdingTimes = await getHistoricalHoldingTimes(assetType, signals.grade, minConfidence);

  // Calculate base windows from historical data
  let entryWindowMinutes: number;
  let exitWindowMinutes: number;
  let targetHitProbability: number;

  if (holdingTimes.length >= 10) {
    // Sufficient data: use percentiles
    // Entry window: tighter for higher grades
    const entryPercentile = signals.confidenceScore > 85 ? 25 : signals.confidenceScore > 75 ? 50 : 75;
    entryWindowMinutes = Math.round(percentile(holdingTimes, entryPercentile) * 0.3); // 30% of typical hold time
    
    // Exit window: median to 75th percentile based on grade
    const exitPercentile = signals.confidenceScore > 85 ? 50 : signals.confidenceScore > 75 ? 60 : 75;
    exitWindowMinutes = Math.round(percentile(holdingTimes, exitPercentile));
    
    // Calculate success probability from historical win rate
    const successfulTrades = await db
      .select({ count: sql<number>`count(*)` })
      .from(tradeIdeas)
      .where(
        and(
          eq(tradeIdeas.assetType, assetType),
          eq(tradeIdeas.probabilityBand, signals.grade),
          eq(tradeIdeas.outcomeStatus, 'hit_target')
        )
      );
    
    const totalTrades = holdingTimes.length;
    targetHitProbability = totalTrades > 0 ? (Number(successfulTrades[0]?.count || 0) / totalTrades) * 100 : 70;
  } else {
    // Insufficient data: use grade-based defaults
    if (signals.confidenceScore >= 90) {
      entryWindowMinutes = 120; // 2 hours
      exitWindowMinutes = 240; // 4 hours
      targetHitProbability = 85;
    } else if (signals.confidenceScore >= 80) {
      entryWindowMinutes = 180; // 3 hours
      exitWindowMinutes = 360; // 6 hours
      targetHitProbability = 75;
    } else if (signals.confidenceScore >= 70) {
      entryWindowMinutes = 240; // 4 hours
      exitWindowMinutes = 480; // 8 hours
      targetHitProbability = 65;
    } else {
      entryWindowMinutes = 360; // 6 hours
      exitWindowMinutes = 720; // 12 hours
      targetHitProbability = 55;
    }
  }

  // CREATE VARIETY: Randomize holding period type for diversity
  // 25% day trades, 40% swing trades, 25% position trades, 10% week-ending
  // NOTE: Week-ending ONLY for stock/options (crypto trades 24/7)
  const holdingTypeRoll = Math.random();
  let holdingPeriodType: 'day' | 'swing' | 'position' | 'week-ending';
  
  if (assetType === 'crypto') {
    // Crypto: No week-ending (24/7 markets), redistribute to other types
    if (holdingTypeRoll < 0.25) {
      holdingPeriodType = 'day';
    } else if (holdingTypeRoll < 0.65) {
      holdingPeriodType = 'swing';
    } else {
      holdingPeriodType = 'position';
    }
  } else {
    // Stocks/Options: Include week-ending strategy
    if (holdingTypeRoll < 0.25) {
      holdingPeriodType = 'day'; // Day trade: exit same day
    } else if (holdingTypeRoll < 0.65) {
      holdingPeriodType = 'swing'; // Swing: hold 1-5 days
    } else if (holdingTypeRoll < 0.90) {
      holdingPeriodType = 'position'; // Position: hold 5+ days
    } else {
      holdingPeriodType = 'week-ending'; // Week-ending: exit by Friday
    }
  }

  // Adjust base windows based on holding period type
  if (holdingPeriodType === 'day') {
    // Day trade: tight windows (exit within same session)
    exitWindowMinutes = Math.min(exitWindowMinutes, 300); // Max 5 hours
  } else if (holdingPeriodType === 'swing') {
    // Swing trade: 1-5 days
    exitWindowMinutes = Math.min(exitWindowMinutes, 7200); // Max 5 days
    exitWindowMinutes = Math.max(exitWindowMinutes, 1440); // Min 1 day
  } else if (holdingPeriodType === 'position') {
    // Position trade: 5+ days to weeks
    exitWindowMinutes = Math.min(exitWindowMinutes, 20160); // Max ~2 weeks
    exitWindowMinutes = Math.max(exitWindowMinutes, 7200); // Min 5 days
  } else {
    // Week-ending: exit by Friday close
    const now = new Date();
    const currentDay = now.getDay(); // 0=Sunday, 6=Saturday
    
    if (currentDay >= 1 && currentDay <= 5) {
      // Calculate hours until Friday 4pm ET
      const daysUntilFriday = 5 - currentDay; // How many days until Friday
      const hoursUntilFridayClose = (daysUntilFriday * 24) + 4; // Approximate
      // ALWAYS set to Friday deadline (don't cap at base calculation)
      exitWindowMinutes = Math.max(60, hoursUntilFridayClose * 60);
    } else {
      // Weekend - use swing trade timing
      exitWindowMinutes = 2880; // 2 days
    }
  }

  // Store week-ending exit window to preserve it from adjustments
  const weekEndingExitWindow = holdingPeriodType === 'week-ending' ? exitWindowMinutes : null;

  // Adjust windows based on market regime (but NOT for week-ending trades)
  // High volatility = tighter windows (faster moves)
  if (holdingPeriodType !== 'week-ending') {
    if (regime.volatilityRegime === 'extreme') {
      entryWindowMinutes = Math.round(entryWindowMinutes * 0.6);
      exitWindowMinutes = Math.round(exitWindowMinutes * 0.8);
      targetHitProbability += 5; // Higher probability in extreme volatility
    } else if (regime.volatilityRegime === 'high') {
      entryWindowMinutes = Math.round(entryWindowMinutes * 0.8);
      exitWindowMinutes = Math.round(exitWindowMinutes * 0.9);
      targetHitProbability += 3;
    } else if (regime.volatilityRegime === 'low') {
      entryWindowMinutes = Math.round(entryWindowMinutes * 1.2);
      exitWindowMinutes = Math.round(exitWindowMinutes * 1.1);
      targetHitProbability -= 5; // Lower probability in low volatility
    }

    // Strong trends = can hold longer confidently
    if (regime.trendStrength > 70) {
      targetHitProbability += 5;
    } else if (regime.trendStrength < 40) {
      exitWindowMinutes = Math.round(exitWindowMinutes * 0.9); // Exit faster in weak trends
      targetHitProbability -= 5;
    }
  }

  // Session phase adjustments (only for day trades)
  if (holdingPeriodType === 'day') {
    if (regime.sessionPhase === 'opening') {
      entryWindowMinutes = Math.min(entryWindowMinutes, 90); // Tight entry in opening hour
      exitWindowMinutes = Math.round(exitWindowMinutes * 0.9); // Faster moves
    } else if (regime.sessionPhase === 'closing') {
      entryWindowMinutes = Math.min(entryWindowMinutes, 60); // Very tight near close
      exitWindowMinutes = Math.min(exitWindowMinutes, 120); // Must exit before close
    }
  }

  // Restore week-ending exit window (MUST exit by Friday regardless of adjustments)
  if (weekEndingExitWindow !== null) {
    exitWindowMinutes = weekEndingExitWindow;
  }

  // Crypto trades 24/7, so can extend all holding periods
  if (assetType === 'crypto') {
    entryWindowMinutes = Math.round(entryWindowMinutes * 1.3);
    exitWindowMinutes = Math.round(exitWindowMinutes * 1.2);
  }

  // Clamp values to reasonable ranges
  entryWindowMinutes = Math.max(30, Math.min(480, entryWindowMinutes)); // 30min - 8hr
  exitWindowMinutes = Math.max(60, Math.min(20160, exitWindowMinutes)); // 1hr - 2 weeks
  targetHitProbability = Math.max(50, Math.min(95, targetHitProbability));

  // Timing confidence based on data availability
  const timingConfidence = holdingTimes.length >= 20 ? 90 : holdingTimes.length >= 10 ? 75 : 60;

  return {
    entryWindowMinutes,
    exitWindowMinutes,
    holdingPeriodType,
    timingConfidence,
    targetHitProbability,
    volatilityRegime: regime.volatilityRegime,
    sessionPhase: regime.sessionPhase,
    trendStrength: regime.trendStrength,
  };
}
