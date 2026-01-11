/**
 * Trade Idea Ingestion System
 * 
 * Centralized module that aggregates trade ideas from ALL sources
 * into Trade Desk with proper quality gates, deduplication, and loss analyzer checks.
 * 
 * Sources that feed into this system:
 * - Market Scanner (day trade + swing trade movers)
 * - Bullish Trend Scanner (detected trends)
 * - Watchlist Grading (S/A grade symbols)
 * - Mover Discovery (top gainers/losers)
 * - Flow Scanner (unusual options activity)
 * - Auto-Lotto Bot (options opportunities)
 */

import { createAndSaveUniversalIdea, IdeaSignal, IdeaSource } from "./universal-idea-generator";
import { getSymbolAdjustment } from "./loss-analyzer-service";
import { logger } from "./logger";

// Deduplication cache - prevents flooding Trade Desk with duplicates
const recentIngestions = new Map<string, number>();
const INGESTION_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between same symbol/source

// Source-specific minimum confidence thresholds
const SOURCE_THRESHOLDS: Record<IdeaSource, number> = {
  market_scanner: 65,      // Market movers need decent setup
  bullish_trend: 60,       // Bullish trends pre-screened (lower threshold)
  watchlist: 70,           // Watchlist items need good grade
  options_flow: 75,        // Flow needs high confidence
  chart_analysis: 70,      // Chart patterns need confirmation
  quant_signal: 65,        // Quant signals are validated
  ai_analysis: 75,         // AI analysis should be high quality
  social_sentiment: 60,    // Social can be lower (speculative)
  crypto_scanner: 65,      // Crypto movers
  news_catalyst: 70,       // News-driven plays
  earnings_play: 75,       // Earnings need high conviction
  sector_rotation: 65,     // Sector momentum
  manual: 50,              // Manual entries allowed lower
  bot_screener: 80,        // Bot screener needs 80%+ (A- grade) for Trade Desk
};

export interface IngestionInput {
  source: IdeaSource;
  symbol: string;
  assetType: 'stock' | 'option' | 'crypto' | 'future';
  direction: 'bullish' | 'bearish';
  signals: IdeaSignal[];
  holdingPeriod?: 'day' | 'swing' | 'position';
  currentPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  catalyst?: string;
  analysis?: string;
  technicalSignals?: string[];
  optionType?: 'call' | 'put';
  strikePrice?: number;
  expiryDate?: string;
  sourceMetadata?: Record<string, any>;
}

export interface IngestionResult {
  success: boolean;
  reason: string;
  symbol: string;
  source: IdeaSource;
  confidence?: number;
}

/**
 * Check if a symbol was recently ingested from the same source
 */
function isDuplicate(symbol: string, source: IdeaSource): boolean {
  const key = `${symbol}:${source}`;
  const lastIngestion = recentIngestions.get(key);
  
  if (!lastIngestion) return false;
  
  const elapsed = Date.now() - lastIngestion;
  return elapsed < INGESTION_COOLDOWN_MS;
}

/**
 * Mark a symbol as recently ingested
 */
function markIngested(symbol: string, source: IdeaSource): void {
  const key = `${symbol}:${source}`;
  recentIngestions.set(key, Date.now());
  
  // Clean up old entries periodically
  if (recentIngestions.size > 1000) {
    const now = Date.now();
    const entries = Array.from(recentIngestions.entries());
    for (const [k, v] of entries) {
      if (now - v > INGESTION_COOLDOWN_MS * 2) {
        recentIngestions.delete(k);
      }
    }
  }
}

/**
 * Central ingestion function - validates and saves trade ideas from any source
 * 
 * Quality gates applied:
 * 1. Deduplication (same symbol/source within cooldown)
 * 2. Loss analyzer check (block symbols with repeated losses)
 * 3. Minimum confidence threshold per source
 * 4. Basic price/liquidity validation
 */
export async function ingestTradeIdea(input: IngestionInput): Promise<IngestionResult> {
  const symbol = input.symbol.toUpperCase();
  const source = input.source;
  
  // Gate 1: Deduplication
  if (isDuplicate(symbol, source)) {
    return {
      success: false,
      reason: `Duplicate - ${symbol} from ${source} already ingested recently`,
      symbol,
      source
    };
  }
  
  // Gate 2: Loss analyzer check
  try {
    const symbolAdj = await getSymbolAdjustment(symbol);
    if (symbolAdj.shouldAvoid) {
      logger.info(`[INGESTION] ⛔ Blocked ${symbol} from ${source}: Loss cooldown (${symbolAdj.lossStreak} consecutive losses)`);
      return {
        success: false,
        reason: `Loss cooldown - ${symbolAdj.lossStreak} consecutive losses`,
        symbol,
        source
      };
    }
  } catch (err) {
    // Loss analyzer unavailable, continue
  }
  
  // Gate 3: Calculate expected confidence and check threshold
  const minConfidence = SOURCE_THRESHOLDS[source] || 60;
  const signalWeight = input.signals.reduce((sum, s) => sum + (s.weight || 10), 0);
  const estimatedConfidence = Math.min(100, 40 + signalWeight); // Base 40 + signal weights
  
  if (estimatedConfidence < minConfidence && input.signals.length < 3) {
    return {
      success: false,
      reason: `Low confidence (${estimatedConfidence}% < ${minConfidence}% threshold) and only ${input.signals.length} signals`,
      symbol,
      source,
      confidence: estimatedConfidence
    };
  }
  
  // Gate 4: Price validation (skip penny stocks under $0.50)
  if (input.currentPrice && input.currentPrice < 0.50 && input.assetType !== 'crypto') {
    return {
      success: false,
      reason: `Price too low ($${input.currentPrice} < $0.50)`,
      symbol,
      source
    };
  }
  
  // All gates passed - create the idea
  try {
    const success = await createAndSaveUniversalIdea({
      symbol,
      source,
      assetType: input.assetType,
      direction: input.direction,
      signals: input.signals,
      holdingPeriod: input.holdingPeriod,
      currentPrice: input.currentPrice,
      targetPrice: input.targetPrice,
      stopLoss: input.stopLoss,
      catalyst: input.catalyst,
      analysis: input.analysis,
      technicalSignals: input.technicalSignals,
      optionType: input.optionType,
      strikePrice: input.strikePrice,
      expiryDate: input.expiryDate,
    });
    
    if (success) {
      markIngested(symbol, source);
      logger.info(`[INGESTION] ✅ Saved ${symbol} from ${source} to Trade Desk`);
      return {
        success: true,
        reason: 'Idea saved to Trade Desk',
        symbol,
        source,
        confidence: estimatedConfidence
      };
    } else {
      return {
        success: false,
        reason: 'Universal idea generator returned null (possibly blocked by loss analyzer)',
        symbol,
        source
      };
    }
  } catch (error) {
    logger.error(`[INGESTION] Error saving ${symbol} from ${source}:`, error);
    return {
      success: false,
      reason: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
      symbol,
      source
    };
  }
}

/**
 * Batch ingest multiple ideas - useful for scanner results
 */
export async function batchIngestIdeas(inputs: IngestionInput[]): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];
  
  for (const input of inputs) {
    const result = await ingestTradeIdea(input);
    results.push(result);
    
    // Small delay to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  const successCount = results.filter(r => r.success).length;
  logger.info(`[INGESTION] Batch complete: ${successCount}/${inputs.length} ideas saved`);
  
  return results;
}

/**
 * Helper to create signals from scanner data
 */
export function createScannerSignals(data: {
  changePercent?: number;
  relativeVolume?: number;
  rsi?: number;
  nearHigh?: boolean;
  breakout?: boolean;
  momentum?: string;
  trendStrength?: number;
  grade?: string;
}): IdeaSignal[] {
  const signals: IdeaSignal[] = [];
  
  if (data.changePercent && Math.abs(data.changePercent) >= 3) {
    signals.push({
      type: data.changePercent > 0 ? 'MOMENTUM_UP' : 'MOMENTUM_DOWN',
      weight: Math.min(15, 5 + Math.abs(data.changePercent)),
      description: `${data.changePercent > 0 ? '+' : ''}${data.changePercent.toFixed(1)}% move`
    });
  }
  
  if (data.relativeVolume && data.relativeVolume >= 1.5) {
    signals.push({
      type: 'VOLUME_SURGE',
      weight: Math.min(15, 5 + (data.relativeVolume - 1) * 5),
      description: `${data.relativeVolume.toFixed(1)}x relative volume`
    });
  }
  
  if (data.rsi !== undefined) {
    if (data.rsi < 30) {
      signals.push({
        type: 'RSI_OVERSOLD',
        weight: 12,
        description: `RSI oversold at ${data.rsi.toFixed(0)}`
      });
    } else if (data.rsi > 70) {
      signals.push({
        type: 'RSI_OVERBOUGHT',
        weight: 12,
        description: `RSI overbought at ${data.rsi.toFixed(0)}`
      });
    }
  }
  
  if (data.nearHigh) {
    signals.push({
      type: 'NEAR_HIGH',
      weight: 8,
      description: 'Trading near daily high'
    });
  }
  
  if (data.breakout) {
    signals.push({
      type: 'BREAKOUT',
      weight: 15,
      description: 'Breakout detected'
    });
  }
  
  if (data.trendStrength && data.trendStrength >= 0.6) {
    signals.push({
      type: 'STRONG_TREND',
      weight: Math.min(15, Math.round(data.trendStrength * 15)),
      description: `Strong trend (${(data.trendStrength * 100).toFixed(0)}%)`
    });
  }
  
  if (data.grade && ['S', 'A', 'A+', 'A-'].includes(data.grade)) {
    signals.push({
      type: 'HIGH_GRADE',
      weight: data.grade === 'S' ? 20 : data.grade === 'A+' ? 18 : data.grade === 'A' ? 15 : 12,
      description: `${data.grade} grade setup`
    });
  }
  
  return signals;
}

/**
 * Get ingestion stats for monitoring
 */
export function getIngestionStats(): { cacheSize: number; sources: Record<string, number> } {
  const sources: Record<string, number> = {};
  
  const entries = Array.from(recentIngestions.entries());
  for (const [key] of entries) {
    const [, source] = key.split(':');
    sources[source] = (sources[source] || 0) + 1;
  }
  
  return {
    cacheSize: recentIngestions.size,
    sources
  };
}

/**
 * Clear ingestion cache (for testing)
 */
export function clearIngestionCache(): void {
  recentIngestions.clear();
}
