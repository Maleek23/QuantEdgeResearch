/**
 * Watchlist Grading Service
 * 
 * Evaluates watchlist items using quantitative metrics and assigns grades/tiers.
 * Supports stocks, crypto, and futures with asset-appropriate scoring.
 * 
 * Tier Definitions (based on gradeScore 0-100):
 * - S (Super): 85+ (Exceptional opportunity)
 * - A (Excellent): 75-84
 * - B (Good): 65-74
 * - C (Average): 55-64
 * - D (Below Average): 45-54
 * - F (Avoid): <45
 */

import { storage } from './storage';
import { logger } from './logger';
import { getLetterGrade, getAcademicGrade } from './grading';
import {
  calculateRSI,
  calculateMACD,
  calculateSMA,
  calculateATR,
  calculateADX,
  calculateEnhancedSignalScore,
  determineMarketRegime,
} from './technical-indicators';
import { getCryptoPrice } from './realtime-price-service';
import { getFuturesPrice } from './futures-data-service';
import { getRealtimeQuote } from './realtime-pricing-service';
import type { WatchlistItem, AssetType, TradeIdea } from '@shared/schema';

type WatchlistTier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

interface GradeInputs {
  rsi14: number | null;
  rsi2: number | null;
  momentum5d: number | null;
  momentum20d: number | null;
  volumeRatio: number | null;
  adx: number | null;
  macdSignal: 'bullish' | 'bearish' | 'neutral' | null;
  priceVsMA20: number | null;
  priceVsMA50: number | null;
  atr: number | null;
  signals: string[];
}

interface GradeResult {
  gradeScore: number;
  gradeLetter: string;
  tier: WatchlistTier;
  gradeInputs: GradeInputs;
}

function scoreToTier(score: number): WatchlistTier {
  if (score >= 85) return 'S';
  if (score >= 75) return 'A';
  if (score >= 65) return 'B';
  if (score >= 55) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

// Yahoo Finance symbol mapping for crypto (verified symbols)
const CRYPTO_YAHOO_SYMBOLS: Record<string, string> = {
  'BTC': 'BTC-USD', 'ETH': 'ETH-USD', 'SOL': 'SOL-USD', 'XRP': 'XRP-USD',
  'DOGE': 'DOGE-USD', 'ADA': 'ADA-USD', 'AVAX': 'AVAX-USD', 'DOT': 'DOT-USD',
  'LINK': 'LINK-USD', 'LTC': 'LTC-USD', 'UNI': 'UNI-USD', 'SHIB': 'SHIB-USD',
  'SUI': 'SUI-USD', 'NEAR': 'NEAR-USD', 'APT': 'APT-USD', 'ARB': 'ARB-USD',
  'OP': 'OP-USD', 'PEPE': 'PEPE-USD', 'ATOM': 'ATOM-USD', 'MATIC': 'MATIC-USD',
};

// Yahoo Finance symbol mapping for futures
const FUTURES_YAHOO_SYMBOLS: Record<string, string> = {
  'NQ': 'NQ=F', 'ES': 'ES=F', 'GC': 'GC=F', 'SI': 'SI=F', 'CL': 'CL=F',
};

async function fetchHistoricalPrices(symbol: string, assetType: AssetType): Promise<{
  prices: number[];
  high: number[];
  low: number[];
  volume: number[];
  currentPrice: number;
} | null> {
  try {
    let yahooSymbol: string;
    
    if (assetType === 'crypto') {
      // Use Yahoo Finance for crypto historical data
      yahooSymbol = CRYPTO_YAHOO_SYMBOLS[symbol.toUpperCase()] || `${symbol.toUpperCase()}-USD`;
    } else if (assetType === 'future') {
      // Use Yahoo Finance for futures historical data
      const rootSymbol = symbol.includes('NQ') ? 'NQ' : 
                         symbol.includes('ES') ? 'ES' :
                         symbol.includes('GC') ? 'GC' : 
                         symbol.includes('SI') ? 'SI' :
                         symbol.includes('CL') ? 'CL' : 'NQ';
      yahooSymbol = FUTURES_YAHOO_SYMBOLS[rootSymbol] || `${rootSymbol}=F`;
    } else {
      // Stocks - use symbol directly
      yahooSymbol = symbol.replace('.', '-');
    }
    
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=3mo`
    );
    
    if (!response.ok) {
      logger.warn(`[GRADE] Failed to fetch Yahoo data for ${symbol} (${yahooSymbol}): ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const result = data.chart?.result?.[0];
    
    if (!result?.indicators?.quote?.[0]) {
      logger.warn(`[GRADE] No price data for ${symbol} (${yahooSymbol})`);
      return null;
    }
    
    const quote = result.indicators.quote[0];
    const prices = (quote.close || []).filter((p: number | null) => p !== null) as number[];
    const high = (quote.high || []).filter((h: number | null) => h !== null) as number[];
    const low = (quote.low || []).filter((l: number | null) => l !== null) as number[];
    const volume = (quote.volume || []).filter((v: number | null) => v !== null) as number[];
    
    if (prices.length < 20) {
      logger.warn(`[GRADE] Insufficient data for ${symbol}: ${prices.length} prices`);
      return null;
    }
    
    return {
      prices,
      high,
      low,
      volume,
      currentPrice: prices[prices.length - 1],
    };
  } catch (error) {
    logger.error(`[GRADE] Error fetching prices for ${symbol}:`, error);
    return null;
  }
}

function calculateGrade(
  prices: number[],
  high: number[],
  low: number[],
  volume: number[],
  assetType: AssetType
): GradeResult {
  const signals: string[] = [];
  let score = 50;
  
  const currentPrice = prices[prices.length - 1];
  
  let rsi14: number | null = null;
  let rsi2: number | null = null;
  let momentum5d: number | null = null;
  let momentum20d: number | null = null;
  let volumeRatio: number | null = null;
  let adx: number | null = null;
  let macdSignal: 'bullish' | 'bearish' | 'neutral' | null = null;
  let priceVsMA20: number | null = null;
  let priceVsMA50: number | null = null;
  let atr: number | null = null;
  
  try {
    if (prices.length >= 14) {
      rsi14 = calculateRSI(prices, 14);
      if (rsi14 < 30) {
        score += 15;
        signals.push(`RSI14 Oversold (${rsi14.toFixed(0)})`);
      } else if (rsi14 > 70) {
        score -= 10;
        signals.push(`RSI14 Overbought (${rsi14.toFixed(0)})`);
      } else if (rsi14 >= 40 && rsi14 <= 60) {
        score += 5;
        signals.push(`RSI14 Neutral (${rsi14.toFixed(0)})`);
      }
    }
    
    if (prices.length >= 5) {
      rsi2 = calculateRSI(prices, 2);
      if (rsi2 < 10) {
        score += 20;
        signals.push(`RSI2 Extreme Oversold (${rsi2.toFixed(0)})`);
      } else if (rsi2 < 25) {
        score += 12;
        signals.push(`RSI2 Oversold (${rsi2.toFixed(0)})`);
      } else if (rsi2 > 90) {
        score -= 15;
        signals.push(`RSI2 Extreme Overbought (${rsi2.toFixed(0)})`);
      } else if (rsi2 > 75) {
        score -= 8;
        signals.push(`RSI2 Overbought (${rsi2.toFixed(0)})`);
      }
    }
  } catch (e) {
    logger.debug(`[GRADE] RSI calculation failed: ${e}`);
  }
  
  try {
    if (prices.length >= 5) {
      momentum5d = ((currentPrice - prices[prices.length - 5]) / prices[prices.length - 5]) * 100;
      if (momentum5d > 5) {
        score += 10;
        signals.push(`Strong 5D Momentum (+${momentum5d.toFixed(1)}%)`);
      } else if (momentum5d > 2) {
        score += 5;
        signals.push(`Positive 5D Momentum (+${momentum5d.toFixed(1)}%)`);
      } else if (momentum5d < -5) {
        score -= 8;
        signals.push(`Weak 5D Momentum (${momentum5d.toFixed(1)}%)`);
      }
    }
    
    if (prices.length >= 20) {
      momentum20d = ((currentPrice - prices[prices.length - 20]) / prices[prices.length - 20]) * 100;
      if (momentum20d > 10) {
        score += 8;
        signals.push(`Strong 20D Trend (+${momentum20d.toFixed(1)}%)`);
      } else if (momentum20d < -10) {
        score -= 5;
        signals.push(`Weak 20D Trend (${momentum20d.toFixed(1)}%)`);
      }
    }
  } catch (e) {
    logger.debug(`[GRADE] Momentum calculation failed: ${e}`);
  }
  
  try {
    if (volume.length >= 20) {
      const avgVolume = volume.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const recentVolume = volume[volume.length - 1];
      volumeRatio = recentVolume / avgVolume;
      
      if (volumeRatio > 2.0) {
        score += 12;
        signals.push(`Volume Spike (${volumeRatio.toFixed(1)}x avg)`);
      } else if (volumeRatio > 1.5) {
        score += 6;
        signals.push(`Elevated Volume (${volumeRatio.toFixed(1)}x avg)`);
      } else if (volumeRatio < 0.5) {
        score -= 5;
        signals.push(`Low Volume (${volumeRatio.toFixed(1)}x avg)`);
      }
    }
  } catch (e) {
    logger.debug(`[GRADE] Volume calculation failed: ${e}`);
  }
  
  try {
    if (prices.length >= 30 && high.length >= 30 && low.length >= 30) {
      adx = calculateADX(high, low, prices);
      const regime = determineMarketRegime(adx);
      
      if (adx > 25) {
        score += 8;
        signals.push(`Strong Trend (ADX ${adx.toFixed(0)})`);
      } else if (adx < 15) {
        score -= 3;
        signals.push(`Weak Trend (ADX ${adx.toFixed(0)})`);
      }
    }
  } catch (e) {
    logger.debug(`[GRADE] ADX calculation failed: ${e}`);
  }
  
  try {
    if (prices.length >= 30) {
      const macd = calculateMACD(prices);
      if (macd.histogram > 0 && macd.macd > macd.signal) {
        macdSignal = 'bullish';
        score += 10;
        signals.push('MACD Bullish Crossover');
      } else if (macd.histogram < 0 && macd.macd < macd.signal) {
        macdSignal = 'bearish';
        score -= 8;
        signals.push('MACD Bearish Crossover');
      } else {
        macdSignal = 'neutral';
      }
    }
  } catch (e) {
    logger.debug(`[GRADE] MACD calculation failed: ${e}`);
  }
  
  try {
    if (prices.length >= 20) {
      const ma20 = calculateSMA(prices, 20);
      priceVsMA20 = ((currentPrice - ma20) / ma20) * 100;
      
      if (priceVsMA20 > 5) {
        score += 5;
        signals.push(`Above MA20 (+${priceVsMA20.toFixed(1)}%)`);
      } else if (priceVsMA20 < -5) {
        score -= 3;
        signals.push(`Below MA20 (${priceVsMA20.toFixed(1)}%)`);
      }
    }
    
    if (prices.length >= 50) {
      const ma50 = calculateSMA(prices, 50);
      priceVsMA50 = ((currentPrice - ma50) / ma50) * 100;
      
      if (priceVsMA50 > 10) {
        score += 5;
        signals.push(`Above MA50 (+${priceVsMA50.toFixed(1)}%)`);
      } else if (priceVsMA50 < -10) {
        score -= 3;
        signals.push(`Below MA50 (${priceVsMA50.toFixed(1)}%)`);
      }
    }
  } catch (e) {
    logger.debug(`[GRADE] MA calculation failed: ${e}`);
  }
  
  try {
    if (high.length >= 14 && low.length >= 14 && prices.length >= 14) {
      atr = calculateATR(high, low, prices);
    }
  } catch (e) {
    logger.debug(`[GRADE] ATR calculation failed: ${e}`);
  }
  
  if (assetType === 'crypto') {
    score += 3;
  } else if (assetType === 'future') {
    score += 2;
  }
  
  score = Math.max(0, Math.min(100, score));
  
  const { grade } = getAcademicGrade(score);
  const tier = scoreToTier(score);
  
  return {
    gradeScore: Math.round(score * 10) / 10,
    gradeLetter: grade,
    tier,
    gradeInputs: {
      rsi14,
      rsi2,
      momentum5d,
      momentum20d,
      volumeRatio,
      adx,
      macdSignal,
      priceVsMA20,
      priceVsMA50,
      atr,
      signals,
    },
  };
}

export async function gradeWatchlistItem(item: WatchlistItem): Promise<GradeResult | null> {
  logger.info(`[GRADE] Evaluating ${item.symbol} (${item.assetType})`);
  
  const priceData = await fetchHistoricalPrices(item.symbol, item.assetType as AssetType);
  
  if (!priceData) {
    logger.warn(`[GRADE] Could not fetch price data for ${item.symbol}`);
    return null;
  }
  
  const grade = calculateGrade(
    priceData.prices,
    priceData.high,
    priceData.low,
    priceData.volume,
    item.assetType as AssetType
  );
  
  logger.info(`[GRADE] ${item.symbol}: Score=${grade.gradeScore}, Grade=${grade.gradeLetter}, Tier=${grade.tier}`);
  
  return grade;
}

export async function gradeAndUpdateWatchlistItem(itemId: string): Promise<boolean> {
  try {
    const items = await storage.getAllWatchlist();
    const item = items.find((i: WatchlistItem) => i.id === itemId);
    
    if (!item) {
      logger.warn(`[GRADE] Watchlist item ${itemId} not found`);
      return false;
    }
    
    const grade = await gradeWatchlistItem(item);
    
    if (!grade) {
      return false;
    }
    
    await storage.updateWatchlistItem(itemId, {
      gradeScore: grade.gradeScore,
      gradeLetter: grade.gradeLetter,
      tier: grade.tier,
      lastEvaluatedAt: new Date().toISOString(),
      gradeInputs: JSON.stringify(grade.gradeInputs),
    });
    
    logger.info(`[GRADE] Updated ${item.symbol} with grade ${grade.gradeLetter} (Tier ${grade.tier})`);
    return true;
  } catch (error) {
    logger.error(`[GRADE] Failed to grade item ${itemId}:`, error);
    return false;
  }
}

export async function gradeAllWatchlistItems(): Promise<{
  total: number;
  graded: number;
  failed: number;
}> {
  logger.info('[GRADE] Starting full watchlist grading...');
  
  const items = await storage.getAllWatchlist();
  let graded = 0;
  let failed = 0;
  
  for (const item of items) {
    const success = await gradeAndUpdateWatchlistItem(item.id);
    if (success) {
      graded++;
    } else {
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  logger.info(`[GRADE] Completed: ${graded}/${items.length} graded, ${failed} failed`);
  
  return {
    total: items.length,
    graded,
    failed,
  };
}

export async function getGradedWatchlist(userId?: string): Promise<WatchlistItem[]> {
  const items = userId 
    ? await storage.getWatchlistByUser(userId)
    : await storage.getAllWatchlist();
  
  return items.sort((a: WatchlistItem, b: WatchlistItem) => {
    const tierOrder: Record<string, number> = { 'S': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'F': 5 };
    const aTier = a.tier ? tierOrder[a.tier] ?? 6 : 6;
    const bTier = b.tier ? tierOrder[b.tier] ?? 6 : 6;
    
    if (aTier !== bTier) {
      return aTier - bTier;
    }
    
    return (b.gradeScore || 0) - (a.gradeScore || 0);
  });
}

export function startWatchlistGradingScheduler(): void {
  logger.info('[GRADE] Starting watchlist grading scheduler (every 15 minutes)');
  
  // Run once immediately on startup to grade any ungraded items
  setTimeout(async () => {
    try {
      logger.info('[GRADE] Running initial watchlist grading on startup...');
      await gradeAllWatchlistItems();
    } catch (error) {
      logger.error('[GRADE] Initial grading failed:', error);
    }
  }, 5000); // 5 second delay to let other services initialize
  
  setInterval(async () => {
    try {
      const now = new Date();
      const ctHour = parseInt(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric',
          hour12: false,
        }).format(now)
      );
      
      if (ctHour >= 8 && ctHour <= 16) {
        logger.info('[GRADE] Running scheduled watchlist grading...');
        await gradeAllWatchlistItems();
      } else {
        logger.debug('[GRADE] Outside market hours, skipping scheduled grading');
      }
    } catch (error) {
      logger.error('[GRADE] Scheduled grading failed:', error);
    }
  }, 15 * 60 * 1000);
}

/**
 * Generate trade ideas from elite watchlist setups (S, A, A+ tiers)
 * These are high-conviction setups tagged as 'elite' source
 * 
 * SMALL ACCOUNT RISK MANAGEMENT:
 * - Target account: $300
 * - Max risk per trade: 2% = $6
 * - Max position cost: 20% of account = $60
 * - For options: Max premium $1.50 (1-2 contracts at $60-150 each)
 */
export async function generateEliteTradeIdeas(userId?: string): Promise<{
  generated: number;
  ideas: Partial<TradeIdea>[];
  skipped: string[];
}> {
  logger.info('[ELITE] Generating trade ideas from elite watchlist setups...');
  
  // Small account risk parameters
  const ACCOUNT_SIZE = 300;           // $300 target account
  const MAX_RISK_PERCENT = 0.02;      // 2% max risk per trade  
  const MAX_POSITION_PERCENT = 0.20;  // 20% max position size
  const MAX_RISK_DOLLARS = ACCOUNT_SIZE * MAX_RISK_PERCENT;  // $6
  const MAX_POSITION_DOLLARS = ACCOUNT_SIZE * MAX_POSITION_PERCENT;  // $60
  const MAX_OPTION_PREMIUM = 1.50;    // Max option premium for small accounts
  
  const items = await getGradedWatchlist(userId);
  const eliteItems = items.filter((item: WatchlistItem) => 
    item.tier === 'S' || item.tier === 'A'
  );
  
  logger.info(`[ELITE] Found ${eliteItems.length} elite setups (S/A tier)`);
  
  const generatedIdeas: Partial<TradeIdea>[] = [];
  const skippedSymbols: string[] = [];
  
  // Get all existing ideas once for efficient duplicate checking
  // Key format: "SYMBOL:source:assetType:direction"
  const existingIdeas = await storage.getAllTradeIdeas();
  const existingSymbolDirections = new Set(
    existingIdeas
      .filter((idea: TradeIdea) => 
        idea.status === 'published' &&
        new Date(idea.timestamp || '').getTime() > Date.now() - 24 * 60 * 60 * 1000
      )
      .map((idea: TradeIdea) => `${idea.symbol}:${idea.source}:${idea.assetType}:${idea.direction}`)
  );
  
  for (const item of eliteItems) {
    try {
      const assetType = item.assetType as 'stock' | 'option' | 'crypto';
      
      // Check if we already have an active idea for this symbol with same source
      const baseKey = `${item.symbol}:quant:${assetType}`;
      
      if (existingSymbolDirections.has(`${baseKey}:long`) || existingSymbolDirections.has(`${baseKey}:short`)) {
        logger.debug(`[ELITE] Skipping ${item.symbol} - already has active quant idea`);
        skippedSymbols.push(`${item.symbol} (active idea exists)`);
        continue;
      }
      
      // Fetch current price data
      const priceData = await fetchHistoricalPrices(item.symbol, assetType as AssetType);
      if (!priceData) {
        skippedSymbols.push(`${item.symbol} (no price data)`);
        continue;
      }
      
      const currentPrice = priceData.currentPrice;
      const gradeInputs = item.gradeInputs ? JSON.parse(item.gradeInputs as string) : null;
      
      // Determine direction based on signals (needed early for target/stop calculation)
      const isBullish = gradeInputs?.signals?.some((s: string) => 
        s.toLowerCase().includes('oversold') || 
        s.toLowerCase().includes('bullish') ||
        s.toLowerCase().includes('positive')
      ) ?? (gradeInputs?.rsi14 && gradeInputs.rsi14 < 40);
      
      const direction = isBullish ? 'long' : 'short';
      
      // Asset-type-aware sizing with stop/target calculation
      let positionSize: number;
      let positionCost: number;
      let maxLoss: number;
      let sizeLabel: string;
      let stopLoss: number;
      let targetPrice: number;
      let riskRewardRatio: number;
      
      if (assetType === 'option') {
        // OPTIONS: 100 shares per contract, max premium $1.50, risk capped at $6
        const CONTRACT_MULTIPLIER = 100;
        
        // Skip options that are too expensive
        if (currentPrice > MAX_OPTION_PREMIUM) {
          skippedSymbols.push(`${item.symbol} ($${currentPrice.toFixed(2)} premium exceeds $${MAX_OPTION_PREMIUM} cap)`);
          continue;
        }
        
        const contractCost = currentPrice * CONTRACT_MULTIPLIER;
        
        // Skip if 1 contract costs more than max position
        if (contractCost > MAX_POSITION_DOLLARS) {
          skippedSymbols.push(`${item.symbol} ($${contractCost.toFixed(0)}/contract exceeds $${MAX_POSITION_DOLLARS} budget)`);
          continue;
        }
        
        // Calculate stop-loss percentage that limits risk to MAX_RISK_DOLLARS ($6)
        // Risk = contractCost * stopLossPercent, so stopLossPercent = MAX_RISK_DOLLARS / contractCost
        const stopLossPercent = Math.min(MAX_RISK_DOLLARS / contractCost, 0.50); // Cap at 50% stop
        
        positionSize = 1;
        positionCost = positionSize * contractCost;
        maxLoss = positionCost * stopLossPercent; // Risk limited by stop-loss ($6 max)
        
        // For options: stop and target are based on the stop loss percentage
        stopLoss = currentPrice * (1 - stopLossPercent);
        // Target: 2:1 R:R for A tier, 3:1 for S tier
        const targetMultiplier = item.tier === 'S' ? 3 : 2;
        const targetGain = (currentPrice - stopLoss) * targetMultiplier;
        targetPrice = currentPrice + targetGain;
        riskRewardRatio = targetMultiplier;
        
        sizeLabel = `1 contract @ $${currentPrice.toFixed(2)} ($${positionCost.toFixed(0)}) | Stop: $${stopLoss.toFixed(2)} (${Math.round(stopLossPercent * 100)}%)`;
        
      } else if (assetType === 'crypto') {
        // CRYPTO: Can buy fractional, so just cap by position dollars
        if (currentPrice > MAX_POSITION_DOLLARS * 10) {
          skippedSymbols.push(`${item.symbol} ($${currentPrice.toFixed(0)} too expensive for small account)`);
          continue;
        }
        
        const atr = gradeInputs?.atr || currentPrice * 0.03;
        const stopPercent = atr / currentPrice;
        const riskPerUnit = currentPrice * stopPercent;
        let units = MAX_RISK_DOLLARS / riskPerUnit;
        
        // Cap position cost
        if (units * currentPrice > MAX_POSITION_DOLLARS) {
          units = MAX_POSITION_DOLLARS / currentPrice;
        }
        
        positionSize = Math.round(units * 1000) / 1000; // 3 decimal places for crypto
        positionCost = positionSize * currentPrice;
        maxLoss = positionSize * riskPerUnit;
        
        // Calculate stop/target
        const targetMultiplier = item.tier === 'S' ? 3 : 2;
        stopLoss = direction === 'long' ? currentPrice - atr : currentPrice + atr;
        targetPrice = direction === 'long' 
          ? currentPrice + (atr * targetMultiplier) 
          : currentPrice - (atr * targetMultiplier);
        riskRewardRatio = targetMultiplier;
        
        sizeLabel = `${positionSize} coins @ $${currentPrice.toFixed(2)} = $${positionCost.toFixed(0)}`;
        
      } else {
        // STOCKS: Max $60 position, max $6 risk
        if (currentPrice > MAX_POSITION_DOLLARS) {
          skippedSymbols.push(`${item.symbol} ($${currentPrice.toFixed(0)} exceeds $${MAX_POSITION_DOLLARS} budget)`);
          continue;
        }
        
        const atr = gradeInputs?.atr || currentPrice * 0.02;
        const riskPerShare = atr; // Use ATR as stop distance
        let shares = Math.floor(MAX_RISK_DOLLARS / riskPerShare);
        
        // Cap position cost
        if (shares * currentPrice > MAX_POSITION_DOLLARS) {
          shares = Math.floor(MAX_POSITION_DOLLARS / currentPrice);
        }
        
        if (shares < 1) {
          skippedSymbols.push(`${item.symbol} (can't afford 1 share at $${currentPrice.toFixed(2)})`);
          continue;
        }
        
        positionSize = shares;
        positionCost = shares * currentPrice;
        maxLoss = shares * riskPerShare;
        
        // Calculate stop/target
        const targetMultiplier = item.tier === 'S' ? 3 : 2;
        stopLoss = direction === 'long' ? currentPrice - atr : currentPrice + atr;
        targetPrice = direction === 'long' 
          ? currentPrice + (atr * targetMultiplier) 
          : currentPrice - (atr * targetMultiplier);
        riskRewardRatio = targetMultiplier;
        
        sizeLabel = `${shares} shares @ $${currentPrice.toFixed(2)} = $${positionCost.toFixed(0)}`;
      }
      
      // Build analysis from grade inputs with position sizing
      const signals = gradeInputs?.signals || [];
      const analysis = `Elite ${item.tier}-Tier Setup | Score: ${item.gradeScore}/100 | ` +
        `${sizeLabel} | Max Risk: $${maxLoss.toFixed(0)} | ${signals.slice(0, 2).join(' | ')}`;
      
      const newIdea = await storage.createTradeIdea({
        userId: userId || null,
        symbol: item.symbol,
        assetType: assetType,
        direction: direction,
        holdingPeriod: 'swing',
        entryPrice: currentPrice,
        targetPrice: Math.round(targetPrice * 100) / 100,
        stopLoss: Math.round(stopLoss * 100) / 100,
        riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
        catalyst: `${item.tier}-Tier Elite Setup`,
        analysis: analysis,
        liquidityWarning: currentPrice < 5 || (assetType === 'option' && currentPrice < 0.10),
        sessionContext: 'RTH',
        timestamp: new Date().toISOString(),
        source: 'quant',
        status: 'published',
        isElite: true,
        eliteTier: item.tier,
        gradeScore: item.gradeScore,
        positionSize: positionSize,
        positionCost: positionCost,
        maxRisk: maxLoss,
      } as any);
      
      // Add to existing set to prevent same-run duplicates
      existingSymbolDirections.add(`${item.symbol}:quant:${assetType}:${direction}`);
      
      generatedIdeas.push(newIdea);
      logger.info(`[ELITE] Generated trade idea for ${item.symbol} (${item.tier}-tier, ${assetType}, ${direction}, $${positionCost.toFixed(0)} cost)`);
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      logger.error(`[ELITE] Failed to generate idea for ${item.symbol}:`, error);
      skippedSymbols.push(`${item.symbol} (error)`);
    }
  }
  
  logger.info(`[ELITE] Generated ${generatedIdeas.length} elite trade ideas`);
  
  return {
    generated: generatedIdeas.length,
    ideas: generatedIdeas,
    skipped: skippedSymbols,
  };
}
