/**
 * SELF-LEARNING SERVICE
 *
 * Makes the 6 engines learn from their own performance:
 * 1. Tracks every trade outcome (win/loss/neutral)
 * 2. Analyzes patterns in successful vs failed trades
 * 3. Automatically adjusts engine parameters
 * 4. Improves predictions over time
 */

import { logger } from './logger';
import { storage } from './storage';
import type { TradeIdea } from '@shared/schema';

// Learning metrics per engine
interface EngineMetrics {
  engine: string;
  totalTrades: number;
  wins: number;
  losses: number;
  neutral: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  expectancy: number;
  // Pattern analysis
  bestTimeOfDay: string;
  bestDayOfWeek: string;
  bestAssetType: string;
  bestDirection: 'long' | 'short';
  // Threshold recommendations
  recommendedConfluenceScore: number;
  recommendedMinRR: number;
  recommendedMaxLoss: number;
}

interface LearningInsight {
  category: string;
  insight: string;
  confidence: number;
  actionable: boolean;
  recommendation?: string;
}

// In-memory cache of engine performance
const enginePerformanceCache = new Map<string, EngineMetrics>();

// Default thresholds (can be adjusted by learning)
export const LEARNED_THRESHOLDS = {
  confluence: {
    minScore: 55, // Minimum confluence score
    optimalScore: 70,
  },
  riskReward: {
    minRatio: 1.5,
    optimalRatio: 2.5,
  },
  timing: {
    bestHour: 10, // 10 AM market open momentum
    avoidHours: [12, 13], // Lunch lull
  },
  positionSizing: {
    kellyFraction: 0.25, // Quarter Kelly for safety
    maxPositionPercent: 5,
  },
};

class SelfLearningService {
  private learningInterval: NodeJS.Timeout | null = null;
  private lastAnalysis: Date = new Date(0);

  /**
   * Start the learning loop
   */
  start() {
    logger.info('🧠 Self-Learning Service starting...');

    // Run analysis every hour
    this.learningInterval = setInterval(() => {
      this.runLearningCycle();
    }, 60 * 60 * 1000); // 1 hour

    // Run immediately on startup
    this.runLearningCycle();
  }

  stop() {
    if (this.learningInterval) {
      clearInterval(this.learningInterval);
      this.learningInterval = null;
    }
    logger.info('🧠 Self-Learning Service stopped');
  }

  /**
   * Main learning cycle - analyzes all completed trades
   */
  async runLearningCycle(): Promise<void> {
    try {
      logger.info('🧠 Running learning cycle...');

      // Get all completed trades from database
      const allIdeas = await storage.getAllTradeIdeas();
      const completedTrades = allIdeas.filter(
        (t: TradeIdea) => t.outcomeStatus && ['hit_target', 'hit_stop', 'expired', 'manual_exit'].includes(t.outcomeStatus)
      );

      if (completedTrades.length < 10) {
        logger.info('🧠 Not enough completed trades for learning (need 10+)');
        return;
      }

      // Analyze by engine/source
      const engineGroups = this.groupByEngine(completedTrades);

      for (const [engine, trades] of Array.from(engineGroups)) {
        const metrics = this.calculateEngineMetrics(engine, trades);
        enginePerformanceCache.set(engine, metrics);

        // Log insights
        logger.info(`🧠 ${engine}: ${metrics.winRate.toFixed(1)}% win rate (${trades.length} trades), expectancy: ${metrics.expectancy.toFixed(2)}%`);

        // Adjust thresholds based on performance
        this.adjustThresholds(metrics);
      }

      // Generate cross-engine insights
      const insights = this.generateInsights(completedTrades);
      for (const insight of insights) {
        logger.info(`💡 INSIGHT [${insight.category}]: ${insight.insight}`);
        if (insight.recommendation) {
          logger.info(`   → Recommendation: ${insight.recommendation}`);
        }
      }

      this.lastAnalysis = new Date();
      logger.info('🧠 Learning cycle complete');

    } catch (error) {
      logger.error('🧠 Learning cycle error:', error);
    }
  }

  /**
   * Group trades by their source engine
   */
  private groupByEngine(trades: TradeIdea[]): Map<string, TradeIdea[]> {
    const groups = new Map<string, TradeIdea[]>();

    for (const trade of trades) {
      const engine = trade.source || 'unknown';
      if (!groups.has(engine)) {
        groups.set(engine, []);
      }
      groups.get(engine)!.push(trade);
    }

    return groups;
  }

  /**
   * Calculate comprehensive metrics for an engine
   */
  private calculateEngineMetrics(engine: string, trades: TradeIdea[]): EngineMetrics {
    const wins = trades.filter(t => t.outcomeStatus === 'hit_target' || (t.percentGain && t.percentGain >= 3));
    const losses = trades.filter(t => t.outcomeStatus === 'hit_stop' && t.percentGain && t.percentGain <= -3);
    const neutral = trades.filter(t => !wins.includes(t) && !losses.includes(t));

    const winRate = trades.length > 0 ? (wins.length / (wins.length + losses.length)) * 100 : 0;

    const avgWinPercent = wins.length > 0
      ? wins.reduce((sum, t) => sum + (t.percentGain || 0), 0) / wins.length
      : 0;

    const avgLossPercent = losses.length > 0
      ? Math.abs(losses.reduce((sum, t) => sum + (t.percentGain || 0), 0) / losses.length)
      : 0;

    const expectancy = (winRate / 100) * avgWinPercent - ((100 - winRate) / 100) * avgLossPercent;

    // Analyze patterns
    const bestTimeOfDay = this.findBestTimeOfDay(wins);
    const bestDayOfWeek = this.findBestDayOfWeek(wins);
    const bestAssetType = this.findBestAssetType(wins);
    const bestDirection = this.findBestDirection(wins);

    // Calculate recommended thresholds based on winning trades
    const winningConfluenceScores = wins
      .filter(t => t.confidenceScore)
      .map(t => t.confidenceScore!);

    const recommendedConfluenceScore = winningConfluenceScores.length > 0
      ? Math.round(winningConfluenceScores.reduce((a, b) => a + b, 0) / winningConfluenceScores.length)
      : 55;

    return {
      engine,
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      neutral: neutral.length,
      winRate,
      avgWinPercent,
      avgLossPercent,
      expectancy,
      bestTimeOfDay,
      bestDayOfWeek,
      bestAssetType,
      bestDirection,
      recommendedConfluenceScore,
      recommendedMinRR: 1.5,
      recommendedMaxLoss: 5,
    };
  }

  private findBestTimeOfDay(wins: TradeIdea[]): string {
    const hourCounts = new Map<number, number>();
    for (const trade of wins) {
      if (trade.timestamp) {
        const hour = new Date(trade.timestamp).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }
    }

    let bestHour = 10;
    let maxCount = 0;
    for (const [hour, count] of Array.from(hourCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestHour = hour;
      }
    }

    return `${bestHour}:00`;
  }

  private findBestDayOfWeek(wins: TradeIdea[]): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCounts = new Map<number, number>();

    for (const trade of wins) {
      if (trade.timestamp) {
        const day = new Date(trade.timestamp).getDay();
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
      }
    }

    let bestDay = 1; // Monday default
    let maxCount = 0;
    for (const [day, count] of Array.from(dayCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestDay = day;
      }
    }

    return days[bestDay];
  }

  private findBestAssetType(wins: TradeIdea[]): string {
    const typeCounts = new Map<string, number>();
    for (const trade of wins) {
      const type = trade.assetType || 'stock';
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }

    let bestType = 'stock';
    let maxCount = 0;
    for (const [type, count] of Array.from(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        bestType = type;
      }
    }

    return bestType;
  }

  private findBestDirection(wins: TradeIdea[]): 'long' | 'short' {
    const longWins = wins.filter(t => t.direction === 'long').length;
    const shortWins = wins.filter(t => t.direction === 'short').length;
    return longWins >= shortWins ? 'long' : 'short';
  }

  /**
   * Adjust global thresholds based on learned performance
   */
  private adjustThresholds(metrics: EngineMetrics): void {
    // Only adjust if we have enough data and good performance
    if (metrics.totalTrades < 20) return;

    // If win rate is above 55%, we can trust this engine's patterns
    if (metrics.winRate > 55) {
      // Adjust confluence threshold towards what's working
      const currentMin = LEARNED_THRESHOLDS.confluence.minScore;
      const recommended = metrics.recommendedConfluenceScore;

      // Gradual adjustment (10% towards recommended)
      LEARNED_THRESHOLDS.confluence.minScore = Math.round(
        currentMin * 0.9 + recommended * 0.1
      );

      logger.info(`🧠 Adjusted ${metrics.engine} confluence threshold: ${currentMin} → ${LEARNED_THRESHOLDS.confluence.minScore}`);
    }

    // Update best trading hours
    const bestHour = parseInt(metrics.bestTimeOfDay.split(':')[0]);
    if (bestHour !== LEARNED_THRESHOLDS.timing.bestHour) {
      LEARNED_THRESHOLDS.timing.bestHour = bestHour;
      logger.info(`🧠 Best trading hour updated: ${bestHour}:00`);
    }
  }

  /**
   * Generate actionable insights from all trades
   */
  private generateInsights(trades: TradeIdea[]): LearningInsight[] {
    const insights: LearningInsight[] = [];

    // Insight 1: Best performing asset type
    const assetTypePerf = this.calculateAssetTypePerformance(trades);
    const bestAsset = Object.entries(assetTypePerf).sort((a, b) => b[1] - a[1])[0];
    if (bestAsset && bestAsset[1] > 50) {
      insights.push({
        category: 'Asset Allocation',
        insight: `${bestAsset[0].toUpperCase()} trades have ${bestAsset[1].toFixed(1)}% win rate`,
        confidence: 0.8,
        actionable: true,
        recommendation: `Focus more on ${bestAsset[0]} trades`,
      });
    }

    // Insight 2: Time-of-day patterns
    const morningWinRate = this.calculateTimeWindowWinRate(trades, 9, 11);
    const afternoonWinRate = this.calculateTimeWindowWinRate(trades, 14, 16);

    if (morningWinRate > afternoonWinRate + 10) {
      insights.push({
        category: 'Timing',
        insight: `Morning trades (9-11 AM) outperform afternoon by ${(morningWinRate - afternoonWinRate).toFixed(1)}%`,
        confidence: 0.7,
        actionable: true,
        recommendation: 'Prioritize trading in the first 2 hours after market open',
      });
    }

    // Insight 3: Confluence score correlation
    const highConfluenceWinRate = this.calculateWinRateByConfluence(trades, 70, 100);
    const lowConfluenceWinRate = this.calculateWinRateByConfluence(trades, 0, 60);

    if (highConfluenceWinRate > lowConfluenceWinRate + 15) {
      insights.push({
        category: 'Confluence',
        insight: `High confluence (70+) trades: ${highConfluenceWinRate.toFixed(1)}% vs Low (<60): ${lowConfluenceWinRate.toFixed(1)}%`,
        confidence: 0.9,
        actionable: true,
        recommendation: 'Raise minimum confluence threshold to 65-70',
      });
    }

    // Insight 4: Loss pattern analysis
    const losses = trades.filter(t => t.outcomeStatus === 'hit_stop');
    if (losses.length >= 5) {
      const avgLossTime = this.calculateAvgHoldTime(losses);
      insights.push({
        category: 'Risk Management',
        insight: `Average losing trade held for ${avgLossTime} before stopping out`,
        confidence: 0.6,
        actionable: true,
        recommendation: avgLossTime > '4h' ? 'Consider tighter time-based stops' : 'Current stop timing is appropriate',
      });
    }

    return insights;
  }

  private calculateAssetTypePerformance(trades: TradeIdea[]): Record<string, number> {
    const perf: Record<string, { wins: number; total: number }> = {};

    for (const trade of trades) {
      const type = trade.assetType || 'stock';
      if (!perf[type]) perf[type] = { wins: 0, total: 0 };
      perf[type].total++;
      if (trade.outcomeStatus === 'hit_target' || (trade.percentGain && trade.percentGain >= 3)) {
        perf[type].wins++;
      }
    }

    const result: Record<string, number> = {};
    for (const [type, data] of Object.entries(perf)) {
      result[type] = data.total > 0 ? (data.wins / data.total) * 100 : 0;
    }
    return result;
  }

  private calculateTimeWindowWinRate(trades: TradeIdea[], startHour: number, endHour: number): number {
    const windowTrades = trades.filter(t => {
      if (!t.timestamp) return false;
      const hour = new Date(t.timestamp).getHours();
      return hour >= startHour && hour < endHour;
    });

    if (windowTrades.length === 0) return 0;

    const wins = windowTrades.filter(
      t => t.outcomeStatus === 'hit_target' || (t.percentGain && t.percentGain >= 3)
    ).length;

    return (wins / windowTrades.length) * 100;
  }

  private calculateWinRateByConfluence(trades: TradeIdea[], minScore: number, maxScore: number): number {
    const filtered = trades.filter(t => {
      const score = t.confidenceScore || 50;
      return score >= minScore && score <= maxScore;
    });

    if (filtered.length === 0) return 0;

    const wins = filtered.filter(
      t => t.outcomeStatus === 'hit_target' || (t.percentGain && t.percentGain >= 3)
    ).length;

    return (wins / filtered.length) * 100;
  }

  private calculateAvgHoldTime(trades: TradeIdea[]): string {
    let totalHours = 0;
    let count = 0;

    for (const trade of trades) {
      if (trade.timestamp && trade.exitDate) {
        const created = new Date(trade.timestamp).getTime();
        const exited = new Date(trade.exitDate).getTime();
        const hours = (exited - created) / (1000 * 60 * 60);
        if (hours > 0 && hours < 168) { // Less than a week
          totalHours += hours;
          count++;
        }
      }
    }

    if (count === 0) return 'N/A';

    const avgHours = totalHours / count;
    if (avgHours < 1) return `${Math.round(avgHours * 60)}m`;
    if (avgHours < 24) return `${avgHours.toFixed(1)}h`;
    return `${(avgHours / 24).toFixed(1)}d`;
  }

  /**
   * Get current learned thresholds for engines to use
   */
  getLearnedThresholds() {
    return { ...LEARNED_THRESHOLDS };
  }

  /**
   * Get performance metrics for a specific engine
   */
  getEngineMetrics(engine: string): EngineMetrics | undefined {
    return enginePerformanceCache.get(engine);
  }

  /**
   * Get all engine metrics
   */
  getAllEngineMetrics(): Map<string, EngineMetrics> {
    return new Map(enginePerformanceCache);
  }

  /**
   * Should this trade be taken based on learned patterns?
   */
  shouldTakeTrade(trade: Partial<TradeIdea>): { take: boolean; reason: string; confidence: number } {
    const thresholds = this.getLearnedThresholds();

    // Check confluence score
    if (trade.confidenceScore && trade.confidenceScore < thresholds.confluence.minScore) {
      return {
        take: false,
        reason: `Confidence score ${trade.confidenceScore} below learned minimum ${thresholds.confluence.minScore}`,
        confidence: 0.8,
      };
    }

    // Check timing
    const currentHour = new Date().getHours();
    if (thresholds.timing.avoidHours.includes(currentHour)) {
      return {
        take: false,
        reason: `Current hour ${currentHour}:00 is in avoid list (low win rate historically)`,
        confidence: 0.6,
      };
    }

    // Check engine-specific metrics
    const engineMetrics = trade.source ? this.getEngineMetrics(trade.source) : undefined;
    if (engineMetrics) {
      if (engineMetrics.winRate < 40 && engineMetrics.totalTrades > 30) {
        return {
          take: false,
          reason: `Engine ${trade.source} has poor win rate (${engineMetrics.winRate.toFixed(1)}%)`,
          confidence: 0.7,
        };
      }
    }

    return {
      take: true,
      reason: 'Trade passes all learned criteria',
      confidence: 0.75,
    };
  }
}

// Singleton instance
export const selfLearning = new SelfLearningService();

// Auto-start on import
selfLearning.start();
