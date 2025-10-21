import { storage } from "./storage";
import { PerformanceValidator } from "./performance-validator";
import { fetchStockPrice, fetchCryptoPrice } from "./market-api";
import type { TradeIdea } from "@shared/schema";

/**
 * Automated Performance Validation Service
 * Runs periodically to validate open trade ideas and update outcomes
 */
class PerformanceValidationService {
  private intervalId: NodeJS.Timeout | null = null;
  private isValidating = false;
  private validationIntervalMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Start the automated validation service
   */
  start() {
    if (this.intervalId) {
      console.log('⚠️  Performance validation service already running');
      return;
    }

    console.log(`🎯 Starting Performance Validation Service (interval: ${this.validationIntervalMs / 1000 / 60} minutes)`);
    
    // Run immediately on startup
    this.validateAllOpenTrades().catch(err => 
      console.error('❌ Initial performance validation failed:', err)
    );

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.validateAllOpenTrades().catch(err => 
        console.error('❌ Performance validation failed:', err)
      );
    }, this.validationIntervalMs);

    console.log('✅ Performance validation service started');
  }

  /**
   * Stop the validation service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Performance validation service stopped');
    }
  }

  /**
   * Validate all open trade ideas
   * Fetches current prices and checks if any hit target/stop/expired
   */
  async validateAllOpenTrades(): Promise<{ 
    validated: number; 
    winners: number; 
    losers: number; 
    expired: number;
  }> {
    // Prevent concurrent validations
    if (this.isValidating) {
      console.log('⏭️  Skipping validation - already in progress');
      return { validated: 0, winners: 0, losers: 0, expired: 0 };
    }

    this.isValidating = true;
    this.lastRunTime = new Date();
    let validated = 0;
    let winners = 0;
    let losers = 0;
    let expired = 0;

    try {
      const openIdeas = await storage.getOpenTradeIdeas();
      
      if (openIdeas.length === 0) {
        console.log('📊 No open trade ideas to validate');
        this.lastRunSuccess = true; // Clean run with no work to do
        return { validated: 0, winners: 0, losers: 0, expired: 0 };
      }

      console.log(`📊 Validating ${openIdeas.length} open trade ideas...`);

      // Fetch current prices for all symbols
      const priceMap = await this.fetchCurrentPrices(openIdeas);
      
      // Validate each idea
      const validationResults = PerformanceValidator.validateBatch(openIdeas, priceMap);

      // Update database for ideas that need updating
      for (const [ideaId, result] of Array.from(validationResults.entries())) {
        if (result.shouldUpdate) {
          await storage.updateTradeIdeaPerformance(ideaId, {
            outcomeStatus: result.outcomeStatus,
            exitPrice: result.exitPrice,
            percentGain: result.percentGain,
            resolutionReason: result.resolutionReason,
            exitDate: result.exitDate,
            actualHoldingTimeMinutes: result.actualHoldingTimeMinutes,
            predictionAccurate: result.predictionAccurate,
            predictionValidatedAt: result.predictionValidatedAt,
            highestPriceReached: result.highestPriceReached,
            lowestPriceReached: result.lowestPriceReached,
          });

          validated++;
          if (result.outcomeStatus === 'hit_target') winners++;
          else if (result.outcomeStatus === 'hit_stop') losers++;
          else if (result.outcomeStatus === 'expired') expired++;

          const idea = openIdeas.find(i => i.id === ideaId);
          if (idea) {
            console.log(`  ✓ ${idea.symbol}: ${result.outcomeStatus} at $${result.exitPrice?.toFixed(2)} (${result.percentGain?.toFixed(1)}%)`);
          }
        }
      }

      if (validated > 0) {
        console.log(`✅ Validated ${validated} trades: ${winners} winners, ${losers} losers, ${expired} expired`);
      } else {
        console.log('📊 All open trades still in progress');
      }

      this.lastRunSuccess = true;
      return { validated, winners, losers, expired };

    } catch (error) {
      console.error('❌ Performance validation error:', error);
      this.lastRunSuccess = false;
      throw error;
    } finally {
      this.isValidating = false;
    }
  }

  /**
   * Fetch current prices for all symbols
   * OPTIMIZED: Deduplicates symbols, batches requests, includes retry logic
   */
  private async fetchCurrentPrices(ideas: TradeIdea[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();
    
    // OPTIMIZATION: Deduplicate symbols first (avoid redundant API calls)
    const uniqueStockSymbols = new Set(
      ideas
        .filter(i => i.assetType === 'stock' || i.assetType === 'penny_stock' || i.assetType === 'option')
        .map(i => i.symbol)
    );
    
    const uniqueCryptoSymbols = new Set(
      ideas
        .filter(i => i.assetType === 'crypto')
        .map(i => i.symbol)
    );

    const totalUnique = uniqueStockSymbols.size + uniqueCryptoSymbols.size;
    console.log(`  📊 Fetching prices for ${totalUnique} unique symbols (${uniqueStockSymbols.size} stocks, ${uniqueCryptoSymbols.size} crypto)`);

    // OPTIMIZATION: Fetch all prices in parallel using Promise.all
    const stockPromises = Array.from(uniqueStockSymbols).map(async (symbol) => ({
      symbol,
      type: 'stock' as const,
      price: await this.fetchWithRetry(symbol, 'stock'),
    }));

    const cryptoPromises = Array.from(uniqueCryptoSymbols).map(async (symbol) => ({
      symbol,
      type: 'crypto' as const,
      price: await this.fetchWithRetry(symbol, 'crypto'),
    }));

    // Execute all price fetches concurrently
    const allResults = await Promise.all([...stockPromises, ...cryptoPromises]);

    // Collect results and track success/failure
    let stockSuccess = 0;
    let stockFailed = 0;
    let cryptoSuccess = 0;
    let cryptoFailed = 0;

    for (const result of allResults) {
      if (result.price !== null) {
        priceMap.set(result.symbol, result.price);
        if (result.type === 'stock') stockSuccess++;
        else cryptoSuccess++;
      } else {
        if (result.type === 'stock') stockFailed++;
        else cryptoFailed++;
      }
    }

    const totalSuccess = stockSuccess + cryptoSuccess;
    const totalFailed = stockFailed + cryptoFailed;
    
    console.log(`  ✓ Fetched ${totalSuccess}/${totalUnique} prices successfully (${stockSuccess} stocks, ${cryptoSuccess} crypto)`);
    if (totalFailed > 0) {
      console.warn(`  ⚠️  Failed to fetch ${totalFailed} prices - trades will be validated next cycle`);
    }
    
    return priceMap;
  }

  /**
   * Fetch price with exponential backoff retry logic
   */
  private async fetchWithRetry(
    symbol: string, 
    type: 'stock' | 'crypto', 
    maxRetries = 2
  ): Promise<number | null> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = type === 'stock' 
          ? await fetchStockPrice(symbol)
          : await fetchCryptoPrice(symbol);
          
        if (data && data.currentPrice) {
          return data.currentPrice;
        }
      } catch (error: any) {
        // Only retry on network/5xx errors, not 4xx
        const shouldRetry = attempt < maxRetries && 
          (error.statusCode >= 500 || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET');
        
        if (shouldRetry) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // 1s, 2s, max 5s
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }
    
    return null; // All retries failed
  }

  /**
   * Get validation service status
   */
  getStatus() {
    return {
      running: this.intervalId !== null,
      isValidating: this.isValidating,
      intervalMinutes: this.validationIntervalMs / 1000 / 60,
      lastRun: this.lastRunTime,
      lastRunSuccess: this.lastRunSuccess,
    };
  }

  private lastRunTime: Date | null = null;
  private lastRunSuccess: boolean = false;
}

// Singleton instance
export const performanceValidationService = new PerformanceValidationService();
