import { logger } from "./logger";
import { storage } from "./storage";
import { InsertTradeIdea } from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import { getTradierQuote } from "./tradier-api";

/**
 * UNIVERSAL TRADE IDEA GENERATOR
 * 
 * This module provides a unified interface for generating trade ideas with confidence scores
 * from ANY source across the platform - watchlists, scanners, flow alerts, social sentiment,
 * chart analysis, manual submission, etc.
 * 
 * Each source contributes signals that are combined to produce a final confidence score.
 */

// Source types for trade ideas
export type IdeaSource = 
  | 'watchlist'           // From user's watchlist
  | 'market_scanner'      // From market scanner movers
  | 'options_flow'        // From unusual options activity
  | 'social_sentiment'    // From CT Tracker / social mentions
  | 'chart_analysis'      // From technical chart patterns
  | 'quant_signal'        // From quantitative engine
  | 'ai_analysis'         // From AI engine
  | 'manual'              // User-submitted idea
  | 'crypto_scanner'      // From crypto scanner
  | 'news_catalyst'       // From news/catalyst detection
  | 'earnings_play'       // From earnings calendar
  | 'sector_rotation';    // From sector analysis

// Signal types that contribute to confidence
export interface IdeaSignal {
  type: string;
  weight: number;     // 0-20 points per signal
  description: string;
  data?: Record<string, any>;
}

// Input for generating a trade idea from any source
export interface UniversalIdeaInput {
  symbol: string;
  source: IdeaSource;
  assetType: 'stock' | 'option' | 'crypto' | 'future';
  direction: 'bullish' | 'bearish' | 'neutral';
  
  // Optional price data (will be fetched if not provided)
  currentPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  
  // Option-specific fields
  optionType?: 'call' | 'put';
  strikePrice?: number;
  expiryDate?: string;
  
  // Signals contributing to confidence
  signals: IdeaSignal[];
  
  // Source-specific metadata
  sourceMetadata?: {
    scannerTimeframe?: 'day' | 'week' | 'month' | 'year';
    flowPremium?: number;
    sentimentScore?: number;
    patternType?: string;
    rsiBand?: 'oversold' | 'neutral' | 'overbought';
    volumeRatio?: number;
    influencerName?: string;
    mentionCount?: number;
    unusualActivityScore?: number;
  };
  
  // Holding period suggestion
  holdingPeriod?: 'day' | 'swing' | 'position';
  
  // Analysis text
  catalyst?: string;
  analysis?: string;
  technicalSignals?: string[];
}

// Base confidence by source (starting points)
const SOURCE_BASE_CONFIDENCE: Record<IdeaSource, number> = {
  'ai_analysis': 55,
  'quant_signal': 60,
  'options_flow': 55,
  'market_scanner': 50,
  'chart_analysis': 55,
  'social_sentiment': 45,
  'watchlist': 50,
  'crypto_scanner': 50,
  'news_catalyst': 52,
  'earnings_play': 48,
  'sector_rotation': 50,
  'manual': 40,
};

// Signal type weights
const SIGNAL_WEIGHTS: Record<string, number> = {
  // Technical signals
  'RSI_OVERSOLD': 12,
  'RSI_OVERBOUGHT': 10,
  'MACD_BULLISH_CROSS': 10,
  'MACD_BEARISH_CROSS': 10,
  'GOLDEN_CROSS': 15,
  'DEATH_CROSS': 12,
  'ABOVE_VWAP': 8,
  'BELOW_VWAP': 8,
  'VOLUME_SURGE': 10,
  'BREAKOUT': 12,
  'BREAKDOWN': 10,
  'SUPPORT_BOUNCE': 12,
  'RESISTANCE_REJECTION': 10,
  
  // Momentum signals
  'MARKET_SCANNER_MOVER': 8,
  'TOP_GAINER': 10,
  'TOP_LOSER': 8,
  'UNUSUAL_VOLUME': 10,
  'SECTOR_LEADER': 8,
  
  // Options flow signals
  'UNUSUAL_CALL_FLOW': 12,
  'UNUSUAL_PUT_FLOW': 10,
  'SWEEP_DETECTED': 15,
  'LARGE_PREMIUM': 12,
  'DARK_POOL_PRINT': 14,
  
  // Social/sentiment signals
  'TRENDING_TICKER': 8,
  'INFLUENCER_MENTION': 10,
  'SENTIMENT_BULLISH': 8,
  'SENTIMENT_BEARISH': 6,
  'HIGH_ENGAGEMENT': 6,
  
  // Chart pattern signals
  'BULL_FLAG': 10,
  'BEAR_FLAG': 8,
  'HEAD_SHOULDERS': 12,
  'DOUBLE_BOTTOM': 12,
  'DOUBLE_TOP': 10,
  'ASCENDING_TRIANGLE': 10,
  'DESCENDING_TRIANGLE': 8,
  'CUP_HANDLE': 14,
  
  // Fundamental signals
  'EARNINGS_BEAT': 10,
  'REVENUE_BEAT': 8,
  'UPGRADE': 12,
  'DOWNGRADE': 8,
  'INSIDER_BUYING': 15,
  'INSTITUTIONAL_ACCUMULATION': 12,
  
  // Risk signals (negative)
  'HIGH_IV': -5,
  'LOW_LIQUIDITY': -8,
  'PENNY_STOCK': -3,
  'EARNINGS_SOON': -6,
  
  // Convergence signals
  'MULTI_SIGNAL_CONFLUENCE': 15,
  'CROSS_ENGINE_AGREEMENT': 12,
};

/**
 * Calculate confidence score from signals
 */
function calculateConfidence(source: IdeaSource, signals: IdeaSignal[]): number {
  let confidence = SOURCE_BASE_CONFIDENCE[source] || 50;
  
  for (const signal of signals) {
    const weight = signal.weight || SIGNAL_WEIGHTS[signal.type] || 5;
    confidence += weight;
  }
  
  // Bonus for multiple confirming signals
  if (signals.length >= 3) {
    confidence += 5; // Confluence bonus
  }
  if (signals.length >= 5) {
    confidence += 5; // Strong confluence
  }
  
  // Cap at 0-100
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

/**
 * Get letter grade from confidence score
 */
function getLetterGrade(confidence: number): string {
  if (confidence >= 85) return 'A+';
  if (confidence >= 80) return 'A';
  if (confidence >= 75) return 'A-';
  if (confidence >= 70) return 'B+';
  if (confidence >= 65) return 'B';
  if (confidence >= 60) return 'B-';
  if (confidence >= 55) return 'C+';
  if (confidence >= 50) return 'C';
  if (confidence >= 45) return 'C-';
  if (confidence >= 40) return 'D';
  return 'F';
}

/**
 * Determine holding period based on signals and source
 */
function determineHoldingPeriod(input: UniversalIdeaInput): 'day' | 'swing' | 'position' {
  if (input.holdingPeriod) return input.holdingPeriod;
  
  // Check for day trade signals
  const hasDayTradeSignals = input.signals.some(s => 
    ['RSI_OVERSOLD', 'RSI_OVERBOUGHT', 'VOLUME_SURGE', 'SWEEP_DETECTED'].includes(s.type)
  );
  
  // Check for swing signals
  const hasSwingSignals = input.signals.some(s =>
    ['BREAKOUT', 'SUPPORT_BOUNCE', 'BULL_FLAG', 'CUP_HANDLE'].includes(s.type)
  );
  
  // Check for position signals
  const hasPositionSignals = input.signals.some(s =>
    ['GOLDEN_CROSS', 'INSTITUTIONAL_ACCUMULATION', 'INSIDER_BUYING'].includes(s.type)
  );
  
  if (hasPositionSignals) return 'position';
  if (hasSwingSignals) return 'swing';
  if (hasDayTradeSignals) return 'day';
  
  // Default based on source
  if (input.source === 'options_flow' || input.source === 'social_sentiment') return 'day';
  if (input.source === 'chart_analysis' || input.source === 'quant_signal') return 'swing';
  
  return 'swing';
}

/**
 * Generate engine type label based on source
 */
function getEngineType(source: IdeaSource): string {
  switch (source) {
    case 'ai_analysis': return 'AI';
    case 'quant_signal': return 'Quant';
    case 'options_flow': return 'Flow';
    case 'market_scanner': return 'Scanner';
    case 'chart_analysis': return 'Chart';
    case 'social_sentiment': return 'Social';
    case 'watchlist': return 'Watchlist';
    case 'crypto_scanner': return 'Crypto';
    case 'news_catalyst': return 'News';
    case 'earnings_play': return 'Earnings';
    case 'sector_rotation': return 'Sector';
    case 'manual': return 'Manual';
    default: return 'Hybrid';
  }
}

/**
 * Universal Trade Idea Generator
 * Creates a trade idea from ANY source with calculated confidence
 */
export async function generateUniversalTradeIdea(input: UniversalIdeaInput): Promise<InsertTradeIdea | null> {
  try {
    // 🛡️ LOSS ANALYZER CHECK - Block avoided symbols and apply confidence adjustments
    let lossAdjustment = 0;
    let lossWarningSignal: string | null = null;
    try {
      const { getSymbolAdjustment } = await import("./loss-analyzer-service");
      const symbolAdj = await getSymbolAdjustment(input.symbol.toUpperCase());
      
      if (symbolAdj.shouldAvoid) {
        // 🚫 HARD BLOCK - Do NOT generate ideas for symbols on loss cooldown
        logger.warn(`[UNIVERSAL] ⛔ BLOCKED ${input.symbol}: Symbol on loss cooldown (${symbolAdj.lossStreak} consecutive losses) - idea generation prevented`);
        return null; // Return null to prevent idea generation entirely
      } else if (symbolAdj.lossStreak > 0) {
        logger.info(`[UNIVERSAL] ⚠️ ${input.symbol}: Loss history detected (${symbolAdj.lossStreak} losses, adj: ${symbolAdj.confidenceBoost})`);
        lossWarningSignal = `LOSS_HISTORY (${symbolAdj.lossStreak}L, adj: ${symbolAdj.confidenceBoost})`;
        lossAdjustment = symbolAdj.confidenceBoost; // Apply the loss analyzer adjustment
      } else if (symbolAdj.confidenceBoost > 0) {
        logger.debug(`[UNIVERSAL] ✅ ${input.symbol}: Winning symbol boost +${symbolAdj.confidenceBoost}`);
        lossAdjustment = symbolAdj.confidenceBoost;
      }
    } catch (err) {
      // Loss analyzer not available, continue without adjustment
      logger.debug(`[UNIVERSAL] Loss analyzer check skipped for ${input.symbol}`);
    }
    
    // Fetch current price if not provided
    let price = input.currentPrice;
    if (!price) {
      const quote = await getTradierQuote(input.symbol);
      if (quote && quote.last) {
        price = quote.last;
      } else {
        logger.warn(`[UNIVERSAL] Could not fetch price for ${input.symbol}`);
        return null;
      }
    }
    
    // Ensure we have a valid price
    const currentPrice: number = price;
    
    // Calculate confidence from all signals with loss adjustment
    let confidence = calculateConfidence(input.source, input.signals);
    confidence = Math.max(0, Math.min(100, confidence + lossAdjustment));
    const grade = getLetterGrade(confidence);
    
    // Determine holding period
    const holdingPeriod = determineHoldingPeriod(input);
    
    // Calculate target and stop if not provided
    const targetMultiplier = holdingPeriod === 'day' ? 1.03 : holdingPeriod === 'swing' ? 1.08 : 1.15;
    const stopMultiplier = holdingPeriod === 'day' ? 0.97 : holdingPeriod === 'swing' ? 0.95 : 0.92;
    
    const targetPrice = input.targetPrice || (
      input.direction === 'bullish' 
        ? currentPrice * targetMultiplier 
        : currentPrice * (2 - targetMultiplier)
    );
    
    const stopLoss = input.stopLoss || (
      input.direction === 'bullish'
        ? currentPrice * stopMultiplier
        : currentPrice * (2 - stopMultiplier)
    );
    
    // Build signal descriptions (include loss warning if applicable)
    const signalDescriptions = input.signals.map(s => s.description || s.type);
    if (lossWarningSignal) {
      signalDescriptions.push(lossWarningSignal);
    }
    const technicalSignals = input.technicalSignals || signalDescriptions;
    
    // Generate analysis text
    const analysis = input.analysis || `${getEngineType(input.source)} signal detected: ${signalDescriptions.slice(0, 3).join(', ')}. ` +
      `${input.direction === 'bullish' ? 'Bullish' : 'Bearish'} setup with ${confidence}% confidence.`;
    
    const idea: InsertTradeIdea = {
      symbol: input.symbol.toUpperCase(),
      assetType: input.assetType,
      direction: input.direction === 'bullish' ? 'long' : 'short',
      entryPrice: currentPrice,
      targetPrice,
      stopLoss,
      confidenceScore: confidence,
      probabilityBand: grade,
      holdingPeriod,
      timestamp: new Date().toISOString(),
      
      // Option fields
      optionType: input.optionType || null,
      strikePrice: input.strikePrice || null,
      expiryDate: input.expiryDate || null,
      
      // Analysis
      catalyst: input.catalyst || `${getEngineType(input.source)} detected ${input.direction} signal`,
      analysis,
      technicalSignals,
      qualitySignals: signalDescriptions,
      
      // Engine tracking
      engineUsed: getEngineType(input.source),
      
      // Outcome tracking
      outcomeStatus: 'open',
      
      // Source metadata
      dataSourceUsed: input.source,
    };
    
    logger.info(`[UNIVERSAL] Generated ${input.symbol} idea from ${input.source}: ${confidence}% (${grade})`);
    
    return idea;
    
  } catch (error) {
    logger.error(`[UNIVERSAL] Error generating idea for ${input.symbol}:`, error);
    return null;
  }
}

/**
 * Generate and save a trade idea from any source
 */
export async function createAndSaveUniversalIdea(input: UniversalIdeaInput): Promise<boolean> {
  const idea = await generateUniversalTradeIdea(input);
  
  if (!idea) {
    return false;
  }
  
  try {
    await storage.createTradeIdea(idea);
    logger.info(`[UNIVERSAL] Saved trade idea: ${idea.symbol} from ${input.source}`);
    return true;
  } catch (error) {
    logger.error(`[UNIVERSAL] Failed to save idea for ${input.symbol}:`, error);
    return false;
  }
}

/**
 * Generate idea from watchlist item when setup is detected
 */
export async function generateIdeaFromWatchlist(
  symbol: string,
  signals: IdeaSignal[],
  assetType: 'stock' | 'option' | 'crypto' = 'stock'
): Promise<InsertTradeIdea | null> {
  const direction = signals.some(s => 
    ['RSI_OVERSOLD', 'SUPPORT_BOUNCE', 'BULL_FLAG', 'GOLDEN_CROSS'].includes(s.type)
  ) ? 'bullish' : 'bearish';
  
  return generateUniversalTradeIdea({
    symbol,
    source: 'watchlist',
    assetType,
    direction,
    signals,
  });
}

/**
 * Generate idea from market scanner mover
 */
export async function generateIdeaFromScanner(
  symbol: string,
  changePercent: number,
  timeframe: 'day' | 'week' | 'month' | 'year',
  additionalSignals: IdeaSignal[] = []
): Promise<InsertTradeIdea | null> {
  const isGainer = changePercent > 0;
  
  const signals: IdeaSignal[] = [
    {
      type: isGainer ? 'TOP_GAINER' : 'TOP_LOSER',
      weight: 10,
      description: `${Math.abs(changePercent).toFixed(1)}% ${isGainer ? 'gainer' : 'loser'} (${timeframe})`,
    },
    {
      type: 'MARKET_SCANNER_MOVER',
      weight: 8,
      description: `Top mover from market scanner`,
    },
    ...additionalSignals,
  ];
  
  return generateUniversalTradeIdea({
    symbol,
    source: 'market_scanner',
    assetType: 'stock',
    direction: isGainer ? 'bullish' : 'bearish',
    signals,
    holdingPeriod: timeframe === 'day' ? 'day' : 'swing',
    sourceMetadata: { scannerTimeframe: timeframe },
  });
}

/**
 * Generate idea from options flow alert
 */
export async function generateIdeaFromFlow(
  symbol: string,
  optionType: 'call' | 'put',
  strikePrice: number,
  expiryDate: string,
  premium: number,
  unusualScore: number,
  additionalSignals: IdeaSignal[] = []
): Promise<InsertTradeIdea | null> {
  const isCall = optionType === 'call';
  
  const signals: IdeaSignal[] = [
    {
      type: isCall ? 'UNUSUAL_CALL_FLOW' : 'UNUSUAL_PUT_FLOW',
      weight: 12,
      description: `Unusual ${optionType} activity detected`,
    },
    {
      type: 'LARGE_PREMIUM',
      weight: premium > 500000 ? 15 : premium > 100000 ? 10 : 5,
      description: `$${(premium / 1000).toFixed(0)}k premium`,
    },
    ...additionalSignals,
  ];
  
  if (unusualScore >= 80) {
    signals.push({
      type: 'SWEEP_DETECTED',
      weight: 15,
      description: `High unusual score: ${unusualScore}`,
    });
  }
  
  return generateUniversalTradeIdea({
    symbol,
    source: 'options_flow',
    assetType: 'option',
    direction: isCall ? 'bullish' : 'bearish',
    optionType,
    strikePrice,
    expiryDate,
    signals,
    holdingPeriod: 'day',
    sourceMetadata: { flowPremium: premium, unusualActivityScore: unusualScore },
  });
}

/**
 * Generate idea from social sentiment / CT Tracker
 */
export async function generateIdeaFromSocial(
  symbol: string,
  sentiment: 'bullish' | 'bearish' | 'neutral',
  mentionCount: number,
  influencerName?: string,
  additionalSignals: IdeaSignal[] = []
): Promise<InsertTradeIdea | null> {
  const signals: IdeaSignal[] = [
    {
      type: 'TRENDING_TICKER',
      weight: 8,
      description: `${mentionCount} mentions detected`,
    },
    {
      type: sentiment === 'bullish' ? 'SENTIMENT_BULLISH' : 'SENTIMENT_BEARISH',
      weight: 8,
      description: `${sentiment} sentiment from social sources`,
    },
    ...additionalSignals,
  ];
  
  if (influencerName) {
    signals.push({
      type: 'INFLUENCER_MENTION',
      weight: 10,
      description: `Mentioned by ${influencerName}`,
    });
  }
  
  if (mentionCount >= 10) {
    signals.push({
      type: 'HIGH_ENGAGEMENT',
      weight: 6,
      description: `High mention volume`,
    });
  }
  
  return generateUniversalTradeIdea({
    symbol,
    source: 'social_sentiment',
    assetType: 'crypto', // Social often tracks crypto
    direction: sentiment === 'neutral' ? 'bullish' : sentiment,
    signals,
    holdingPeriod: 'day',
    sourceMetadata: { mentionCount, influencerName },
  });
}

/**
 * Generate idea from chart pattern detection
 */
export async function generateIdeaFromChart(
  symbol: string,
  patternType: string,
  direction: 'bullish' | 'bearish',
  supportLevel?: number,
  resistanceLevel?: number,
  additionalSignals: IdeaSignal[] = []
): Promise<InsertTradeIdea | null> {
  const signals: IdeaSignal[] = [
    {
      type: patternType.toUpperCase().replace(/\s+/g, '_'),
      weight: SIGNAL_WEIGHTS[patternType.toUpperCase().replace(/\s+/g, '_')] || 10,
      description: `${patternType} pattern detected`,
    },
    ...additionalSignals,
  ];
  
  if (supportLevel) {
    signals.push({
      type: 'SUPPORT_BOUNCE',
      weight: 8,
      description: `Support at $${supportLevel.toFixed(2)}`,
    });
  }
  
  if (resistanceLevel) {
    signals.push({
      type: 'RESISTANCE_REJECTION',
      weight: 8,
      description: `Resistance at $${resistanceLevel.toFixed(2)}`,
    });
  }
  
  return generateUniversalTradeIdea({
    symbol,
    source: 'chart_analysis',
    assetType: 'stock',
    direction,
    signals,
    holdingPeriod: 'swing',
    sourceMetadata: { patternType },
  });
}

// Export signal weights for external use
export { SIGNAL_WEIGHTS, SOURCE_BASE_CONFIDENCE };
