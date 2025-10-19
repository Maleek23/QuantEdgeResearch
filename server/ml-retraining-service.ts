/**
 * ML Auto-Retraining Service
 * Continuously learns from trade outcomes and updates model weights
 * Runs on schedule + triggers based on new data
 */

import { logger } from './logger';
import type { IStorage } from './storage';

export interface MLWeights {
  signalWeights: Map<string, number>;
  entryOptimization: {
    avgEntryDeviation: number; // How far from signal price should entry be
    optimalEntryZone: number; // % range for best entries
  };
  exitOptimization: {
    avgTargetMultiple: number; // Average R:R of winners
    optimalHoldingMinutes: Record<string, number>; // By asset type
  };
  lastUpdated: string;
  trainedOnTrades: number;
}

class MLRetrainingService {
  private storage: IStorage | null = null;
  private currentWeights: MLWeights | null = null;
  private retrainingInterval: NodeJS.Timeout | null = null;
  private newTradesSinceRetrain = 0;
  private readonly RETRAIN_INTERVAL_MS = 3600000; // 1 hour
  private readonly RETRAIN_AFTER_TRADES = 5; // Retrain after 5 new closed trades

  initialize(storage: IStorage) {
    this.storage = storage;
    logger.info('🧠 ML Retraining Service initialized');
    
    // Initial training
    this.performRetraining().then(() => {
      logger.info('✅ Initial ML training complete');
    });

    // Schedule hourly retraining
    this.retrainingInterval = setInterval(() => {
      this.performRetraining();
    }, this.RETRAIN_INTERVAL_MS);

    logger.info(`⏱️  ML Auto-Retraining: Every ${this.RETRAIN_INTERVAL_MS / 60000} minutes`);
  }

  // Trigger retraining when new outcomes are recorded
  async onNewOutcome() {
    this.newTradesSinceRetrain++;
    
    if (this.newTradesSinceRetrain >= this.RETRAIN_AFTER_TRADES) {
      logger.info(`🔄 Triggering ML retraining - ${this.newTradesSinceRetrain} new outcomes`);
      await this.performRetraining();
      this.newTradesSinceRetrain = 0;
    }
  }

  // Core retraining logic
  private async performRetraining(): Promise<void> {
    if (!this.storage) {
      logger.warn('❌ ML retraining skipped - storage not initialized');
      return;
    }

    try {
      const startTime = Date.now();
      const allIdeas = await this.storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open' && i.percentGain !== null);

      // Need minimum data for statistical validity
      if (closedIdeas.length < 10) {
        logger.info(`📊 ML training paused - need 10+ closed trades (have ${closedIdeas.length})`);
        return;
      }

      // 1. Learn Signal Weights
      const signalWeights = await this.learnSignalWeights(closedIdeas);

      // 2. Optimize Entry Pricing
      const entryOptimization = this.optimizeEntryPricing(closedIdeas);

      // 3. Optimize Exit Targeting
      const exitOptimization = this.optimizeExitTargets(closedIdeas);

      // Update current weights
      this.currentWeights = {
        signalWeights,
        entryOptimization,
        exitOptimization,
        lastUpdated: new Date().toISOString(),
        trainedOnTrades: closedIdeas.length,
      };

      const duration = Date.now() - startTime;
      logger.info(`✅ ML Retraining complete in ${duration}ms - ${closedIdeas.length} trades analyzed`);
      logger.info(`   📈 ${signalWeights.size} signals weighted, ${Object.keys(exitOptimization.optimalHoldingMinutes).length} asset types optimized`);
    } catch (error) {
      logger.error('❌ ML retraining failed:', error);
    }
  }

  // Learn which signals predict winners
  private async learnSignalWeights(closedIdeas: any[]): Promise<Map<string, number>> {
    const signalWeights = new Map<string, number>();
    
    if (!this.storage) return signalWeights;

    const stats = await this.storage.getPerformanceStats();
    
    stats.bySignalType.forEach(signal => {
      // Calculate weight: 1.0 baseline, adjust -50% to +50% based on win rate
      const winRateBonus = (signal.winRate - 50) / 100; // -0.5 to +0.5
      
      // Bonus for sample size (more confident with more data)
      const sampleSizeBonus = Math.min(signal.totalIdeas / 40, 0.25); // Up to +0.25 for 40+ trades
      
      // Bonus for expectancy (win rate * avg gain)
      const expectancyBonus = signal.avgPercentGain > 5 ? 0.15 : 0;
      
      const weight = 1.0 + winRateBonus + sampleSizeBonus + expectancyBonus;
      
      // Bound weights to prevent extreme values
      signalWeights.set(signal.signal, Math.max(0.5, Math.min(1.5, weight)));
    });

    return signalWeights;
  }

  // Learn optimal entry price deviations
  private optimizeEntryPricing(closedIdeas: any[]): MLWeights['entryOptimization'] {
    const winners = closedIdeas.filter(i => i.outcomeStatus === 'hit_target');
    
    if (winners.length === 0) {
      return {
        avgEntryDeviation: 0,
        optimalEntryZone: 1.0, // Default: within 1% of signal
      };
    }

    // Calculate how far actual entry was from initial signal
    // (For now, using entryPrice as signal - future: track signal price separately)
    const deviations = winners.map(idea => {
      const deviation = Math.abs((idea.exitPrice - idea.entryPrice) / idea.entryPrice) * 100;
      return deviation;
    });

    const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
    
    return {
      avgEntryDeviation: avgDeviation,
      optimalEntryZone: Math.min(avgDeviation * 0.5, 2.0), // Conservative zone
    };
  }

  // Learn optimal profit targets and holding times
  private optimizeExitTargets(closedIdeas: any[]): MLWeights['exitOptimization'] {
    const winners = closedIdeas.filter(i => i.outcomeStatus === 'hit_target');
    
    // Calculate average R:R of winners
    const rrMultiples = winners
      .filter(i => i.riskRewardRatio)
      .map(i => i.riskRewardRatio!);
    
    const avgRR = rrMultiples.length > 0
      ? rrMultiples.reduce((sum, rr) => sum + rr, 0) / rrMultiples.length
      : 2.0; // Default 2:1

    // Learn optimal holding times per asset type
    const holdingTimes: Record<string, number> = {};
    
    ['stock', 'crypto', 'option'].forEach(assetType => {
      const assetWinners = winners.filter(i => 
        i.assetType === assetType && 
        i.actualHoldingTimeMinutes !== null
      );
      
      if (assetWinners.length > 0) {
        const avgTime = assetWinners.reduce((sum, i) => 
          sum + (i.actualHoldingTimeMinutes || 0), 0
        ) / assetWinners.length;
        
        holdingTimes[assetType] = Math.round(avgTime);
      } else {
        // Defaults based on asset type
        holdingTimes[assetType] = assetType === 'crypto' ? 120 : 180;
      }
    });

    return {
      avgTargetMultiple: avgRR,
      optimalHoldingMinutes: holdingTimes,
    };
  }

  // Get current ML weights (for idea generation)
  getCurrentWeights(): MLWeights | null {
    return this.currentWeights;
  }

  // Get weights in legacy format for backward compatibility
  getSignalWeights(): Map<string, number> {
    return this.currentWeights?.signalWeights || new Map();
  }

  // Shutdown
  shutdown() {
    if (this.retrainingInterval) {
      clearInterval(this.retrainingInterval);
      logger.info('🛑 ML Retraining Service stopped');
    }
  }
}

// Singleton instance
export const mlRetrainingService = new MLRetrainingService();
