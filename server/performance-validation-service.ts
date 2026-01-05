import { storage } from "./storage";
import { PerformanceValidator } from "./performance-validator";
import { fetchStockPrice, fetchCryptoPrice } from "./market-api";
import { getOptionQuote } from "./tradier-api";
import { analyzeLoss } from "./loss-analyzer";
import { sendGainsToDiscord } from "./discord-service";
import type { TradeIdea, InsertTradePriceSnapshot, PriceSnapshotEventType } from "@shared/schema";

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
   * Check if stock market is open (weekday during market hours CT)
   * Returns false on weekends to prevent false validations with stale prices
   */
  private isMarketOpen(): boolean {
    const now = new Date();
    const ctTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const dayOfWeek = ctTime.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = ctTime.getHours();
    const minute = ctTime.getMinutes();
    
    // Weekend check - markets closed
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    // Market hours: 8:30 AM - 3:00 PM CT (regular session)
    // Extended validation window: 7:00 AM - 4:00 PM CT (includes pre/post market)
    const timeInMinutes = hour * 60 + minute;
    const marketOpen = 7 * 60; // 7:00 AM CT
    const marketClose = 16 * 60; // 4:00 PM CT
    
    return timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
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
    
    // Skip validation on weekends and outside market hours
    // This prevents false wins/losses from stale weekend prices
    if (!this.isMarketOpen()) {
      const now = new Date();
      const ctTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][ctTime.getDay()];
      console.log(`📊 Skipping validation - market closed (${dayName} ${ctTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} CT)`);
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
      
      // 🔧 BUG FIX: Fetch futures contracts to avoid circular dependency in validator
      // Collect unique contract codes from futures ideas
      const futuresContractCodes = new Set(
        openIdeas
          .filter(i => i.assetType === 'future' && i.futuresContractCode)
          .map(i => i.futuresContractCode!)
      );
      
      // Fetch all needed contracts in parallel
      const contractsMap = new Map();
      if (futuresContractCodes.size > 0) {
        console.log(`  📊 Fetching ${futuresContractCodes.size} futures contracts...`);
        const contractPromises = Array.from(futuresContractCodes).map(async code => {
          try {
            const contract = await storage.getFuturesContract(code);
            return { code, contract };
          } catch (error) {
            console.warn(`  ⚠️  Failed to fetch contract ${code}:`, error);
            return { code, contract: null };
          }
        });
        
        const contractResults = await Promise.all(contractPromises);
        for (const { code, contract } of contractResults) {
          if (contract) {
            contractsMap.set(code, contract);
          }
        }
        console.log(`  ✓ Fetched ${contractsMap.size}/${futuresContractCodes.size} contracts successfully`);
      }
      
      // Validate each idea with contract metadata
      const validationResults = PerformanceValidator.validateBatch(openIdeas, priceMap, contractsMap);

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
            // 🎓 EDUCATIONAL: Track what would have happened for missed entries
            missedEntryTheoreticalOutcome: result.missedEntryTheoreticalOutcome,
            missedEntryTheoreticalGain: result.missedEntryTheoreticalGain,
          });

          validated++;
          const idea = openIdeas.find(i => i.id === ideaId);
          
          if (result.outcomeStatus === 'hit_target') {
            winners++;
            // 💰 Send gains notification to Discord
            if (idea && result.percentGain && result.percentGain > 0) {
              try {
                await sendGainsToDiscord({
                  symbol: idea.symbol,
                  direction: idea.direction as 'long' | 'short',
                  assetType: idea.assetType,
                  entryPrice: idea.entryPrice,
                  exitPrice: result.exitPrice || idea.targetPrice,
                  percentGain: result.percentGain,
                  source: idea.source || undefined,
                  optionType: idea.optionType || undefined,
                  strikePrice: idea.strikePrice || undefined,
                  expiryDate: idea.expiryDate || undefined,
                  holdingPeriod: idea.holdingPeriod || undefined,
                });
              } catch (err) {
                console.warn(`  ⚠️  Failed to send gains to Discord for ${idea.symbol}:`, err);
              }
            }
          }
          else if (result.outcomeStatus === 'hit_stop') {
            losers++;
            // 📉 Automatic loss analysis - understand why this trade failed
            if (idea) {
              try {
                const updatedIdea = { ...idea, outcomeStatus: result.outcomeStatus as any, percentGain: result.percentGain ?? null, exitPrice: result.exitPrice ?? null, actualHoldingTimeMinutes: result.actualHoldingTimeMinutes ?? null };
                const lossAnalysis = await analyzeLoss(updatedIdea);
                if (lossAnalysis) {
                  await storage.createLossAnalysis(lossAnalysis);
                  console.log(`  📉 Loss analyzed: ${idea.symbol} - ${lossAnalysis.lossReason}`);
                }
              } catch (err) {
                console.warn(`  ⚠️  Failed to analyze loss for ${idea?.symbol}:`, err);
              }
            }
          }
          else if (result.outcomeStatus === 'expired') expired++;
          if (idea) {
            console.log(`  ✓ ${idea.symbol}: ${result.outcomeStatus} at $${result.exitPrice?.toFixed(2)} (${result.percentGain?.toFixed(1)}%)`);
            
            // 📸 Save price snapshot for audit trail
            const currentPrice = priceMap.get(idea.symbol) || result.exitPrice;
            if (currentPrice) {
              const eventType: PriceSnapshotEventType = 
                result.outcomeStatus === 'hit_target' ? 'target_hit' :
                result.outcomeStatus === 'hit_stop' ? 'stop_hit' :
                result.outcomeStatus === 'expired' ? 'expired' : 'validation_check';
              
              const snapshot: InsertTradePriceSnapshot = {
                tradeIdeaId: ideaId,
                eventType,
                eventTimestamp: new Date().toISOString(),
                currentPrice: currentPrice,
                bidPrice: null, // Full bid/ask available from Tradier for options
                askPrice: null,
                lastPrice: currentPrice,
                distanceToTargetPercent: result.percentGain ? Math.abs(result.percentGain) : null,
                distanceToStopPercent: null,
                pnlAtSnapshot: result.percentGain ?? null,
                validatorVersion: 'v1.0',
                dataSource: 'validation',
              };
              
              try {
                await storage.savePriceSnapshot(snapshot);
              } catch (err) {
                console.warn(`  ⚠️  Failed to save price snapshot for ${idea.symbol}:`, err);
              }
            }
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
   * Fetch current prices for all symbols including OPTIONS
   * OPTIMIZED: Deduplicates symbols, batches requests, includes retry logic
   * 
   * ✅ FIXED: Now fetches option premiums from Tradier API for proper validation
   */
  private async fetchCurrentPrices(ideas: TradeIdea[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();
    
    // OPTIMIZATION: Deduplicate symbols first (avoid redundant API calls)
    const uniqueStockSymbols = new Set(
      ideas
        .filter(i => i.assetType === 'stock' || i.assetType === 'penny_stock')
        .map(i => i.symbol)
    );
    
    const uniqueCryptoSymbols = new Set(
      ideas
        .filter(i => i.assetType === 'crypto')
        .map(i => i.symbol)
    );
    
    // Collect unique options (need full option details, not just symbol)
    const optionIdeas = ideas.filter(i => 
      i.assetType === 'option' && i.strikePrice && i.expiryDate && i.optionType
    );

    const totalUnique = uniqueStockSymbols.size + uniqueCryptoSymbols.size + optionIdeas.length;
    console.log(`  📊 Fetching prices for ${totalUnique} unique symbols (${uniqueStockSymbols.size} stocks, ${uniqueCryptoSymbols.size} crypto, ${optionIdeas.length} options)`);

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
    
    // Fetch option prices from Tradier
    const optionPromises = optionIdeas.map(async (idea) => {
      try {
        const quote = await getOptionQuote({
          underlying: idea.symbol,
          expiryDate: idea.expiryDate!,
          optionType: idea.optionType as 'call' | 'put',
          strike: idea.strikePrice!,
        });
        
        // Use mid price for fair value (average of bid/ask)
        const price = quote ? (quote.mid > 0 ? quote.mid : quote.last) : null;
        
        return {
          // Use unique key for each option contract
          symbol: `${idea.symbol}_${idea.expiryDate}_${idea.optionType}_${idea.strikePrice}`,
          ideaId: idea.id,
          type: 'option' as const,
          price,
        };
      } catch {
        return {
          symbol: idea.symbol,
          ideaId: idea.id,
          type: 'option' as const,
          price: null,
        };
      }
    });

    // Execute all price fetches concurrently
    const [stockResults, cryptoResults, optionResults] = await Promise.all([
      Promise.all(stockPromises),
      Promise.all(cryptoPromises),
      Promise.all(optionPromises),
    ]);

    // Collect results and track success/failure
    let stockSuccess = 0;
    let stockFailed = 0;
    let cryptoSuccess = 0;
    let cryptoFailed = 0;
    let optionSuccess = 0;
    let optionFailed = 0;

    for (const result of stockResults) {
      if (result.price !== null) {
        priceMap.set(result.symbol, result.price);
        stockSuccess++;
      } else {
        stockFailed++;
      }
    }
    
    for (const result of cryptoResults) {
      if (result.price !== null) {
        priceMap.set(result.symbol, result.price);
        cryptoSuccess++;
      } else {
        cryptoFailed++;
      }
    }
    
    // For options, store by idea ID since symbols aren't unique
    for (const result of optionResults) {
      if (result.price !== null && result.ideaId) {
        priceMap.set(`option_${result.ideaId}`, result.price);
        optionSuccess++;
      } else {
        optionFailed++;
      }
    }

    const totalSuccess = stockSuccess + cryptoSuccess + optionSuccess;
    const totalFailed = stockFailed + cryptoFailed + optionFailed;
    
    console.log(`  ✓ Fetched ${totalSuccess}/${totalUnique} prices successfully (${stockSuccess} stocks, ${cryptoSuccess} crypto, ${optionSuccess} options)`);
    if (totalFailed > 0) {
      console.warn(`  ⚠️  Failed to fetch ${totalFailed} prices total - those trades will be validated next cycle`);
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
