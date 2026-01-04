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
import type { WatchlistItem, AssetType } from '@shared/schema';

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
