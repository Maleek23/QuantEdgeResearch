// Quantitative rules-based trade idea generator
// No AI required - uses technical analysis and market patterns

import type { MarketData, Catalyst, InsertTradeIdea } from "@shared/schema";
import { formatInTimeZone } from 'date-fns-tz';
import { 
  calculateRSI, 
  calculateMACD, 
  analyzeRSI, 
  analyzeMACD,
  calculateSMA
} from './technical-indicators';
import { discoverHiddenCryptoGems, discoverStockGems, fetchCryptoPrice, fetchHistoricalPrices } from './market-api';
import { logger } from './logger';
import { detectMarketRegime, calculateTimingWindows, type SignalStack } from './timing-intelligence';

// 🔐 MODEL GOVERNANCE: Engine version for audit trail
export const QUANT_ENGINE_VERSION = "v2.4.0"; // Updated Oct 22, 2025: PERFORMANCE OPTIMIZATIONS - Removed reversal setups (18% WR), crypto tier filter (top 20 only), penalized weak signals, fixed MTF alignment
export const ENGINE_CHANGELOG = {
  "v2.4.0": "PERFORMANCE FIX: Removed reversal setups (18% WR → eliminated), crypto tier filter (top 20 only, was 16.7% WR), penalized moderate/weak signals, fixed MTF 'Strong Trend' penalty (-10pts, was 18.5% WR)",
  "v2.3.0": "ACCURACY BOOST: Tighter stops (2-3%), stricter filtering (90+ confidence), -30% max loss target",
  "v2.2.0": "Predictive signals (RSI divergence, early MACD), widened stops (4-5%), removed momentum-chasing",
  "v2.1.0": "Added timing intelligence, market regime detection",
  "v2.0.0": "Initial production release with ML adaptive learning",
};

// Check if US stock market is open (Mon-Fri, 9:30 AM - 4:00 PM ET)
function isStockMarketOpen(): boolean {
  const now = new Date();
  
  // Get current time in ET timezone and parse the day of week from ET time (not UTC!)
  const etTime = formatInTimeZone(now, 'America/New_York', 'yyyy-MM-dd HH:mm:ss EEEE');
  const parts = etTime.split(' ');
  const dayName = parts[2]; // "Monday", "Tuesday", etc.
  
  // Check if weekend in ET timezone (Saturday or Sunday)
  if (dayName === 'Saturday' || dayName === 'Sunday') {
    logger.info(`🌙 US stock market CLOSED - ${dayName} (weekend)`);
    return false;
  }
  
  // Extract hour and minute from ET time string
  const timePart = parts[1]; // "HH:mm:ss"
  const etHour = parseInt(timePart.split(':')[0]);
  const etMinute = parseInt(timePart.split(':')[1]);
  
  // Market hours: 9:30 AM - 4:00 PM ET (Mon-Fri only)
  if (etHour < 9 || (etHour === 9 && etMinute < 30)) {
    logger.info(`🌙 US stock market CLOSED - ${dayName} ${timePart.substring(0, 5)} ET (before 9:30 AM)`);
    return false; // Before market open
  }
  if (etHour >= 16) {
    logger.info(`🌙 US stock market CLOSED - ${dayName} ${timePart.substring(0, 5)} ET (after 4:00 PM)`);
    return false; // After market close
  }
  
  logger.info(`✅ US stock market OPEN - ${dayName} ${timePart.substring(0, 5)} ET`);
  return true;
}

// Machine Learning: Fetch learned signal weights from retraining service (cached)
async function fetchLearnedWeights(): Promise<Map<string, number>> {
  try {
    const { mlRetrainingService } = await import('./ml-retraining-service');
    const weights = mlRetrainingService.getSignalWeights();
    
    if (weights.size === 0) {
      logger.info('📊 ML patterns not ready yet - using default weights');
      return new Map();
    }
    
    logger.info(`🧠 ML-Enhanced: Using ${weights.size} cached signal weights`);
    return weights;
  } catch (error) {
    logger.info('📊 Using default weights (ML service unavailable)');
    return new Map();
  }
}

interface QuantSignal {
  type: 'momentum' | 'volume_spike' | 'breakout' | 'mean_reversion' | 'catalyst_driven' | 'rsi_divergence' | 'macd_crossover';
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'long' | 'short';
  rsiValue?: number;
  macdValues?: { macd: number; signal: number; histogram: number };
}

interface MultiTimeframeAnalysis {
  dailyTrend: 'bullish' | 'bearish' | 'neutral';
  weeklyTrend: 'bullish' | 'bearish' | 'neutral';
  aligned: boolean;
  strength: 'strong' | 'moderate' | 'weak';
}

// REMOVED: Synthetic price fallback was generating fake trade ideas
// System now fails safely when real data is unavailable

// Multi-timeframe analysis: Check if daily and weekly trends align
async function analyzeMultiTimeframe(
  data: MarketData, 
  historicalPrices: number[]
): Promise<MultiTimeframeAnalysis> {
  // Require real historical prices - no synthetic fallback
  if (historicalPrices.length === 0) {
    return {
      dailyTrend: 'neutral',
      weeklyTrend: 'neutral',
      aligned: false,
      strength: 'weak'
    };
  }
  
  const dailyPrices = historicalPrices;
  
  // Create proper weekly candles by aggregating every 5 daily closes
  const weeklyPrices: number[] = [];
  for (let i = 4; i < dailyPrices.length; i += 5) {
    // Take the close of each 5-day period (Friday close in a weekly candle)
    weeklyPrices.push(dailyPrices[i]);
  }
  
  // Calculate daily trend using 5-day vs 10-day SMA on daily data
  const dailySMA5 = calculateSMA(dailyPrices, 5);
  const dailySMA10 = calculateSMA(dailyPrices, 10);
  const currentPrice = dailyPrices[dailyPrices.length - 1];
  
  let dailyTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (currentPrice > dailySMA5 && dailySMA5 > dailySMA10) {
    dailyTrend = 'bullish';
  } else if (currentPrice < dailySMA5 && dailySMA5 < dailySMA10) {
    dailyTrend = 'bearish';
  }
  
  // Calculate weekly trend using 4-week vs 10-week SMA on weekly candles
  // (20 days = 4 weeks, 50 days = 10 weeks)
  const weeklySMA4 = calculateSMA(weeklyPrices, Math.min(4, weeklyPrices.length));
  const weeklySMA10 = calculateSMA(weeklyPrices, Math.min(10, weeklyPrices.length));
  const currentWeeklyPrice = weeklyPrices[weeklyPrices.length - 1];
  
  let weeklyTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (weeklyPrices.length >= 10) {
    if (currentWeeklyPrice > weeklySMA4 && weeklySMA4 > weeklySMA10) {
      weeklyTrend = 'bullish';
    } else if (currentWeeklyPrice < weeklySMA4 && weeklySMA4 < weeklySMA10) {
      weeklyTrend = 'bearish';
    }
  }
  
  // Check alignment
  const aligned = dailyTrend === weeklyTrend && dailyTrend !== 'neutral';
  
  // Determine strength based on alignment and conviction
  let strength: 'strong' | 'moderate' | 'weak' = 'weak';
  if (aligned) {
    // Both timeframes agree - strong signal
    strength = 'strong';
  } else if (dailyTrend !== 'neutral' || weeklyTrend !== 'neutral') {
    // One timeframe has conviction
    strength = 'moderate';
  }
  
  return { dailyTrend, weeklyTrend, aligned, strength };
}

// Analyze market data for quantitative signals with RSI/MACD integration
// ADAPTIVE STRATEGY: Different signals for different momentum phases
function analyzeMarketData(data: MarketData, historicalPrices: number[]): QuantSignal | null {
  const priceChange = data.changePercent;
  const volume = data.volume || 0;
  const avgVolume = data.avgVolume || volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
  
  // Determine momentum phase
  const priceChangeAbs = Math.abs(priceChange);
  const isEarlyPhase = priceChangeAbs < 2;     // 0-2%: Early accumulation
  const isBreakoutPhase = priceChangeAbs < 5;  // 2-5%: Breakout building
  const isMomentumPhase = priceChangeAbs < 10; // 5-10%: Strong momentum

  // PHASE 1: EARLY ACCUMULATION (0-2%)
  // Use RSI, MACD, volume spike - predictive signals
  if (isEarlyPhase) {
    // PRIORITY 1: RSI and MACD Analysis - PREDICTIVE signals (check FIRST, not last!)
    // Require real historical prices - no synthetic fallback
    if (historicalPrices.length > 0) {
      const prices = historicalPrices;
      
      const rsi = calculateRSI(prices, 14);
      const macd = calculateMACD(prices);
      
      const rsiAnalysis = analyzeRSI(rsi);
      const macdAnalysis = analyzeMACD(macd);
      
      // REMOVED: RSI Divergence Signal - Analysis shows 0% win rate
      // These "reversal" trades were catching falling knives (trying to pick bottoms/tops)
      // All RSI-based reversal trades failed:
      // - ITGR long (RSI 19): -6.25%, -1.81%, -1.81%
      // - GTX short (RSI 72): -24.97%
      // - QBTS short (RSI 75): -25.01%
      //
      // if (rsiAnalysis.strength === 'strong' && rsiAnalysis.direction !== 'neutral') {
      //   return {
      //     type: 'rsi_divergence',
      //     strength: 'strong',
      //     direction: rsiAnalysis.direction,
      //     rsiValue: rsi
      //   };
      // }
      
      // MACD Crossover Signal - PRIORITY 1 (was #2, now promoted)
      if ((macdAnalysis.crossover || macdAnalysis.strength === 'strong') && macdAnalysis.direction !== 'neutral') {
        return {
          type: 'macd_crossover',
          strength: macdAnalysis.strength,
          direction: macdAnalysis.direction,
          macdValues: macd
        };
      }
      
      // REMOVED: Moderate RSI signals also disabled (same 0% win rate issue)
      // if (rsiAnalysis.strength === 'moderate' && rsiAnalysis.direction !== 'neutral') {
      //   return {
      //     type: 'rsi_divergence',
      //     strength: 'moderate',
      //     direction: rsiAnalysis.direction,
      //     rsiValue: rsi
      //   };
      // }
    }

    // PRIORITY 2: EARLY breakout signals - price APPROACHING highs (not after big move)
    // Only trigger if move is small (<2%) but volume is building
    if (data.high52Week && data.currentPrice >= data.high52Week * 0.95 && data.currentPrice < data.high52Week * 0.98 && volumeRatio >= 1.5) {
      return {
        type: 'breakout',
        strength: volumeRatio >= 2.5 ? 'strong' : 'moderate',
        direction: 'long' // early breakout setup
      };
    }

    // PRIORITY 3: Volume spike with SMALL price move (institutional positioning BEFORE big move)
    // Only long positions (discovery filters out bearish moves)
    if (volumeRatio >= 3 && priceChange >= 0 && priceChange < 1) {
      return {
        type: 'volume_spike',
        strength: volumeRatio >= 5 ? 'strong' : 'moderate',
        direction: 'long'
      };
    }
  }
  
  // PHASE 2: BREAKOUT BUILDING (2-5%)
  // Use MACD crossover, volume confirmation - momentum building
  // Discovery only sends bullish moves, so always long
  else if (isBreakoutPhase && !isEarlyPhase && priceChange >= 0) {
    // Require MACD confirmation for breakouts
    if (historicalPrices.length > 0) {
      const macd = calculateMACD(historicalPrices);
      const macdAnalysis = analyzeMACD(macd);
      
      // MACD must confirm bullish direction
      if (macdAnalysis.direction === 'long') {
        return {
          type: 'macd_crossover',
          strength: volumeRatio >= 3 ? 'strong' : 'moderate',
          direction: 'long',
          macdValues: macd
        };
      }
    }
    
    // Volume spike with building momentum (bullish only)
    if (volumeRatio >= 3) {
      return {
        type: 'volume_spike',
        strength: volumeRatio >= 5 ? 'strong' : 'moderate',
        direction: 'long'
      };
    }
  }
  
  // PHASE 3: STRONG MOMENTUM (5-10%)
  // Require exceptional volume to ride the wave
  // Discovery only sends bullish moves, so always long
  else if (isMomentumPhase && !isBreakoutPhase && priceChange >= 0) {
    // Only trade with exceptional volume (5x+) to avoid late entries
    if (volumeRatio >= 5) {
      return {
        type: 'volume_spike',
        strength: 'strong',
        direction: 'long'
      };
    }
  }

  // No signal found for this stock at this phase
  return null;
}

// Calculate entry, target, and stop based on REAL-TIME market prices for ACTIVE trading
// Entry = CURRENT market price (immediate execution)
// Target/Stop = Calculated from entry for actionable levels
// UPDATED: Asset-type-specific minimums - Stocks: 8%, Crypto: 12%, Options: 25%
function calculateLevels(data: MarketData, signal: QuantSignal, assetType?: string) {
  // ✅ ACTIVE TRADING: Entry is ALWAYS current market price for immediate execution
  const entryPrice = data.currentPrice;
  let targetPrice: number;
  let stopLoss: number;

  // Asset-type-specific multipliers for minimum thresholds
  // Base targets are 8% for stocks, then scaled up for crypto/options
  const assetMultiplier = assetType === 'crypto' ? 1.5 :  // 12% min for crypto (1.5x stocks)
                          assetType === 'option' ? 3.125 : // 25% min for options (3.125x stocks)
                          1.0;  // 8% min for stocks/penny stocks (baseline)

  // NOTE: "momentum" signal type removed from strategy, but keeping logic for backward compatibility
  if (signal.type === 'momentum') {
    if (signal.direction === 'long') {
      targetPrice = entryPrice * (1 + 0.08 * assetMultiplier); // 8% stocks, 12% crypto, 25% options
      stopLoss = entryPrice * (1 - 0.02 * assetMultiplier); // TIGHTENED: 2% stops - limit losses
    } else {
      targetPrice = entryPrice * (1 - 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 + 0.02 * assetMultiplier);
    }
  } else if (signal.type === 'volume_spike') {
    // Early volume accumulation - minimum 8% stocks, 12% crypto, 25% options
    if (signal.direction === 'long') {
      targetPrice = entryPrice * (1 + 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 - 0.02 * assetMultiplier); // TIGHTENED: 2% stops - limit losses
    } else {
      targetPrice = entryPrice * (1 - 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 + 0.02 * assetMultiplier);
    }
  } else if (signal.type === 'breakout') {
    // Breakout setup - higher target, slightly wider stops for volatility
    // Stocks: 10%/3% = 3.33:1, Crypto: 15%/4.5% = 3.33:1, Options: 31.25%/9.375% = 3.33:1
    if (signal.direction === 'long') {
      targetPrice = entryPrice * (1 + 0.10 * assetMultiplier);
      stopLoss = entryPrice * (1 - 0.03 * assetMultiplier); // TIGHTENED: 3% stops (was 5%) - better R:R
    } else {
      targetPrice = entryPrice * (1 - 0.10 * assetMultiplier);
      stopLoss = entryPrice * (1 + 0.03 * assetMultiplier);
    }
  } else if (signal.type === 'mean_reversion') {
    // Mean reversion - minimum 8% stocks, 12% crypto, 25% options
    if (signal.direction === 'long') {
      targetPrice = entryPrice * (1 + 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 - 0.02 * assetMultiplier); // TIGHTENED: 2% stops - limit losses
    } else {
      targetPrice = entryPrice * (1 - 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 + 0.02 * assetMultiplier);
    }
  } else if (signal.type === 'rsi_divergence') {
    // RSI-based mean reversion - minimum 8% stocks, 12% crypto, 25% options
    if (signal.direction === 'long') {
      targetPrice = entryPrice * (1 + 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 - 0.02 * assetMultiplier); // TIGHTENED: 2% stops - limit losses
    } else {
      targetPrice = entryPrice * (1 - 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 + 0.02 * assetMultiplier);
    }
  } else if (signal.type === 'macd_crossover') {
    // MACD trend following - minimum 8% stocks, 12% crypto, 25% options
    if (signal.direction === 'long') {
      targetPrice = entryPrice * (1 + 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 - 0.02 * assetMultiplier); // TIGHTENED: 2% stops - limit losses
    } else {
      targetPrice = entryPrice * (1 - 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 + 0.02 * assetMultiplier);
    }
  } else {
    // Default case - minimum 8% stocks, 12% crypto, 25% options
    if (signal.direction === 'long') {
      targetPrice = entryPrice * (1 + 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 - 0.04 * assetMultiplier); // WIDENED: 4% stops
    } else {
      targetPrice = entryPrice * (1 - 0.08 * assetMultiplier);
      stopLoss = entryPrice * (1 + 0.04 * assetMultiplier);
    }
  }

  return {
    entryPrice: Number(entryPrice.toFixed(2)),
    targetPrice: Number(targetPrice.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2))
  };
}

// Generate catalyst for signal type
// UPDATED: Describe the SETUP, not the finished move (avoid chasing language)
function generateCatalyst(data: MarketData, signal: QuantSignal, catalysts: Catalyst[]): string {
  // Check if there's a real catalyst for this symbol
  const symbolCatalyst = catalysts.find(c => c.symbol === data.symbol);
  if (symbolCatalyst) {
    return symbolCatalyst.title;
  }

  // Generate technical catalyst - describe PREDICTIVE setup, not past moves
  const volumeRatio = data.volume && data.avgVolume ? (data.volume / data.avgVolume).toFixed(1) : '1.0';
  
  if (signal.type === 'momentum') {
    // NOTE: Momentum signal removed from strategy, but keep for backward compatibility
    return `Early momentum setup - volume building at ${volumeRatio}x average`;
  } else if (signal.type === 'volume_spike') {
    return `Institutional accumulation detected - ${volumeRatio}x volume before breakout`;
  } else if (signal.type === 'mean_reversion') {
    return `Extreme ${data.changePercent < 0 ? 'oversold' : 'overbought'} condition - reversal setup forming`;
  } else if (signal.type === 'breakout') {
    return `Early breakout setup - price approaching key resistance with volume`;
  } else if (signal.type === 'rsi_divergence') {
    const rsiValue = signal.rsiValue || 50;
    return `RSI ${rsiValue < 30 ? 'oversold' : 'overbought'} at ${rsiValue.toFixed(0)} - reversal opportunity`;
  } else if (signal.type === 'macd_crossover') {
    return `MACD ${signal.direction === 'long' ? 'bullish' : 'bearish'} crossover - early trend signal`;
  } else {
    return `Technical setup developing - ${volumeRatio}x volume confirmation`;
  }
}

// Generate analysis for trade idea
function generateAnalysis(data: MarketData, signal: QuantSignal): string {
  const priceChange = data.changePercent;
  const volumeRatio = data.volume && data.avgVolume ? data.volume / data.avgVolume : 1;

  let analysis = '';

  if (signal.type === 'momentum') {
    analysis = `Strong ${signal.direction === 'long' ? 'bullish' : 'bearish'} momentum with ${Math.abs(priceChange).toFixed(1)}% move. `;
    analysis += `Volume is ${volumeRatio.toFixed(1)}x average, confirming institutional participation. `;
    analysis += signal.strength === 'strong' 
      ? 'High probability trend continuation setup.' 
      : 'Moderate strength - watch for follow-through.';
  } else if (signal.type === 'volume_spike') {
    analysis = `Unusual volume activity (${volumeRatio.toFixed(1)}x normal) suggests smart money positioning. `;
    analysis += `Price ${priceChange >= 0 ? 'holding gains' : 'under pressure'} indicates ${signal.direction === 'long' ? 'accumulation' : 'distribution'}. `;
    analysis += 'Monitor for continuation or reversal signals.';
  } else if (signal.type === 'breakout') {
    const nearHigh = data.high52Week && data.currentPrice >= data.high52Week * 0.98;
    const nearLow = data.low52Week && data.currentPrice <= data.low52Week * 1.02;
    
    if (signal.direction === 'long' && nearHigh) {
      analysis = `Bullish breakout near 52-week high with ${volumeRatio.toFixed(1)}x volume. `;
      analysis += 'Price clearing resistance indicates strong momentum continuation. ';
      analysis += signal.strength === 'strong' 
        ? 'High probability breakout setup with institutional support.' 
        : 'Monitor for sustained move above resistance.';
    } else {
      analysis = `Bearish breakdown near support with ${volumeRatio.toFixed(1)}x volume. `;
      analysis += 'Price breaking key level suggests acceleration to downside. ';
      analysis += 'Watch for continuation or failed breakdown reversal.';
    }
  } else if (signal.type === 'mean_reversion') {
    analysis = `Extreme ${priceChange > 0 ? 'overbought' : 'oversold'} condition (${Math.abs(priceChange).toFixed(1)}% move). `;
    analysis += 'Statistical probability favors mean reversion. ';
    analysis += signal.direction === 'long' 
      ? 'Look for bounce entry on reduced selling pressure.' 
      : 'Watch for profit-taking and reversal patterns.';
  } else if (signal.type === 'rsi_divergence') {
    const rsiValue = signal.rsiValue || 50;
    analysis = `RSI indicator at ${rsiValue.toFixed(0)} shows ${rsiValue < 30 ? 'oversold' : 'overbought'} condition. `;
    analysis += `Technical analysis suggests ${signal.direction === 'long' ? 'bullish' : 'bearish'} reversal opportunity. `;
    analysis += signal.strength === 'strong'
      ? 'Strong RSI divergence indicates high probability setup.'
      : 'Moderate RSI signal - confirm with price action.';
  } else if (signal.type === 'macd_crossover') {
    const macd = signal.macdValues;
    analysis = `MACD showing ${signal.direction === 'long' ? 'bullish' : 'bearish'} momentum signal. `;
    if (macd) {
      analysis += `Histogram at ${macd.histogram.toFixed(2)} ${macd.histogram > 0 ? 'confirms uptrend' : 'signals downtrend'}. `;
    }
    analysis += 'Trend-following setup with momentum confirmation.';
  } else {
    analysis = `Technical setup shows ${signal.direction === 'long' ? 'bullish' : 'bearish'} bias. `;
    analysis += `Price action and volume support ${signal.direction === 'long' ? 'upside' : 'downside'} move. `;
    analysis += 'Risk/reward ratio favorable for quantitative entry.';
  }

  return analysis;
}

// Calculate quality/confidence score for trade idea (0-100)
// 🧠 ML-ENHANCED: Now accepts learned weights from historical performance
function calculateConfidenceScore(
  data: MarketData,
  signal: QuantSignal,
  riskRewardRatio: number,
  mtfAnalysis?: MultiTimeframeAnalysis,
  learnedWeights?: Map<string, number>
): { score: number; signals: string[] } {
  let score = 0;
  const qualitySignals: string[] = [];
  const volumeRatio = data.volume && data.avgVolume ? data.volume / data.avgVolume : 1;
  const priceChangeAbs = Math.abs(data.changePercent);

  // 1. Risk/Reward Ratio Quality (0-30 points) - RECALIBRATED
  if (riskRewardRatio >= 3) {
    score += 30;
    qualitySignals.push('Excellent R:R (3:1+)');
  } else if (riskRewardRatio >= 2) {
    score += 28;  // Increased from 20
    qualitySignals.push('Strong R:R (2:1+)');
  } else if (riskRewardRatio >= 1.5) {
    score += 20;  // Increased from 10
    qualitySignals.push('Moderate R:R');
  }

  // 2. Volume Confirmation (0-25 points)
  if (volumeRatio >= 3) {
    score += 25;
    qualitySignals.push('Exceptional Volume (3x+)');
  } else if (volumeRatio >= 2) {
    score += 22;  // Increased from 20
    qualitySignals.push('Strong Volume (2x+)');
  } else if (volumeRatio >= 1.5) {
    score += 18;  // Increased from 15
    qualitySignals.push('Above Avg Volume');
  } else if (volumeRatio >= 1.2) {
    score += 12;  // Increased from 5
    qualitySignals.push('Confirmed Volume');
  }

  // 3. Signal Strength (0-25 points) - RECALIBRATED & TIGHTENED (v2.4.0)
  // Analysis: "Moderate Signal" has only 22.9% win rate vs 58.5% for "Strong Signal"
  if (signal.strength === 'strong') {
    score += 25;  // Keep strong at 25
    qualitySignals.push('Strong Signal');
  } else if (signal.strength === 'moderate') {
    score += 12;  // REDUCED from 20 to penalize moderate signals (22.9% win rate)
    qualitySignals.push('Moderate Signal');
  } else {
    score += 5;   // REDUCED from 15 to heavily penalize weak signals
    qualitySignals.push('Weak Signal');
  }

  // 4. Predictive Setup Quality (0-25 points) - BOOSTED: Reward EARLY signals heavily
  if (signal.type === 'rsi_divergence' && signal.rsiValue) {
    // RSI divergence - highly predictive when caught early
    const rsiExtreme = signal.rsiValue <= 20 || signal.rsiValue >= 80;
    if (rsiExtreme) {
      score += 25; // BOOSTED from 15
      qualitySignals.push('🎯 Extreme RSI Divergence');
    } else {
      score += 18; // BOOSTED from 10
      qualitySignals.push('RSI Divergence Setup');
    }
  } else if (signal.type === 'macd_crossover' && signal.macdValues) {
    // MACD crossover - best when histogram is still small (early)
    const histStrength = Math.abs(signal.macdValues.histogram);
    if (histStrength < 0.1) {
      score += 25; // NEW: Reward FRESH crossovers
      qualitySignals.push('🎯 Fresh MACD Crossover');
    } else if (histStrength < 0.3) {
      score += 20; // BOOSTED from 10
      qualitySignals.push('Early MACD Signal');
    } else {
      score += 5; // REDUCED from 15 - large histogram means late
      qualitySignals.push('Late MACD');
    }
  } else if (signal.type === 'breakout' && priceChangeAbs < 2) {
    // EARLY breakout (small move, building volume) - highly predictive
    score += 22; // BOOSTED from 15
    qualitySignals.push('🎯 Early Breakout Setup');
  } else if (signal.type === 'volume_spike' && volumeRatio >= 5 && priceChangeAbs < 1) {
    // EARLY institutional flow (big volume, small move) - highly predictive
    score += 25; // BOOSTED from 15
    qualitySignals.push('🎯 Early Institutional Flow');
  } else if (signal.type === 'mean_reversion') {
    // Mean reversion on extreme move
    score += 15; // BOOSTED from 10
    qualitySignals.push('Reversal Setup');
  }

  // 5. Liquidity Factor (0-15 points)
  if (data.currentPrice >= 10) {
    score += 15;
    qualitySignals.push('High Liquidity');
  } else if (data.currentPrice >= 5) {
    score += 10;
    qualitySignals.push('Adequate Liquidity');
  } else {
    score += 0; // Penalty for penny stocks
    qualitySignals.push('Low Liquidity Risk');
  }

  // 6. RSI/MACD Indicator Bonus (0-10 points)
  if (signal.type === 'rsi_divergence' || signal.type === 'macd_crossover') {
    score += 10;
    qualitySignals.push('Technical Indicator Confirmed');
  }

  // 7. Multi-Timeframe Alignment Bonus/Penalty (v2.4.0)
  // Analysis: "Strong Trend" has 18.5% win rate (5W/27L), "Partial Timeframe" has 38.6%
  // These indicate LATE entries after the move is exhausted
  if (mtfAnalysis) {
    if (mtfAnalysis.aligned && mtfAnalysis.strength === 'strong') {
      // PENALTY: Strong aligned trend = late entry after move is done
      score -= 10;  // CHANGED from +5 to -10 (18.5% win rate!)
      qualitySignals.push('Strong Trend');
    } else if (mtfAnalysis.aligned && mtfAnalysis.strength === 'moderate') {
      score += 8;  // Moderate aligned trend = early building move
      qualitySignals.push('Timeframes Aligned (Strong)');
    } else if (mtfAnalysis.aligned) {
      score += 10; // Newly aligned = best early entry
      qualitySignals.push('Timeframes Building');
    } else if (mtfAnalysis.strength === 'moderate') {
      score += 2;  // REDUCED from 5 (38.6% win rate)
      qualitySignals.push('Partial Timeframe Support');
    }
  }

  // 8. Early Momentum Detection - ONLY reward small moves with volume (0-10 points max)
  // REMOVED: Large price moves indicate FINISHED momentum, not early setups
  if (signal.direction === 'short' && data.changePercent < 0) {
    const downMoveSize = Math.abs(data.changePercent);
    // ONLY reward SMALL moves with volume - these are early setups
    if (downMoveSize < 1 && volumeRatio >= 2) {
      score += 10;
      qualitySignals.push('Early Bearish Setup');
    } else if (downMoveSize >= 3) {
      // PENALTY for chasing finished moves
      score -= 10;
      qualitySignals.push('⚠️ Move Already Extended');
    }
  }
  
  // Similar check for longs
  if (signal.direction === 'long' && data.changePercent > 0) {
    const upMoveSize = Math.abs(data.changePercent);
    if (upMoveSize < 1 && volumeRatio >= 2) {
      score += 10;
      qualitySignals.push('Early Bullish Setup');
    } else if (upMoveSize >= 3) {
      score -= 10;
      qualitySignals.push('⚠️ Move Already Extended');
    }
  }

  // 🧠 ML ENHANCEMENT: Apply learned signal weights from historical performance
  if (learnedWeights && learnedWeights.size > 0) {
    const baseScore = score;
    qualitySignals.forEach(signalName => {
      const weight = learnedWeights.get(signalName);
      if (weight !== undefined && weight !== 1.0) {
        // Apply weight adjustment: boost high-performing signals, reduce underperformers
        const adjustment = (weight - 1.0) * 10; // ±5 points max per signal
        score += adjustment;
      }
    });
    
    if (Math.abs(score - baseScore) > 1) {
      const boost = score > baseScore;
      qualitySignals.push(boost ? '🧠 ML-Boosted' : '🧠 ML-Adjusted');
    }
  }

  return { score: Math.min(Math.max(score, 0), 100), signals: qualitySignals };
}

// Calculate probability band based on confidence score
// ALIGNED with frontend display logic in trade-idea-block.tsx
function getProbabilityBand(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  return 'D';
}

// Adjust target and stop prices based on confidence score
// Higher quality setups get better R:R ratios
function adjustTargetsForQuality(
  entryPrice: number,
  baseTarget: number,
  baseStop: number,
  confidenceScore: number,
  direction: 'long' | 'short'
): { targetPrice: number; stopLoss: number } {
  // Calculate multipliers based on confidence score
  let targetMultiplier = 1.0;
  let stopMultiplier = 1.0;

  if (confidenceScore >= 95) {
    // A+ grade: Aggressive targets, tighter stops (R:R ~3:1)
    targetMultiplier = 1.4;
    stopMultiplier = 0.8;
  } else if (confidenceScore >= 90) {
    // A grade: Strong targets (R:R ~2.5:1)
    targetMultiplier = 1.25;
    stopMultiplier = 0.9;
  } else if (confidenceScore >= 85) {
    // B+ grade: Good targets (R:R ~2:1)
    targetMultiplier = 1.1;
    stopMultiplier = 0.95;
  } else if (confidenceScore >= 80) {
    // B grade: Standard targets (R:R ~1.8:1)
    targetMultiplier = 1.0;
    stopMultiplier = 1.0;
  } else if (confidenceScore >= 75) {
    // C+ grade: Conservative targets (R:R ~1.5:1)
    targetMultiplier = 0.9;
    stopMultiplier = 1.1;
  } else if (confidenceScore >= 70) {
    // C grade: Tight targets (R:R ~1.3:1)
    targetMultiplier = 0.8;
    stopMultiplier = 1.15;
  } else {
    // D grade: Minimal targets (R:R ~1.2:1)
    targetMultiplier = 0.7;
    stopMultiplier = 1.2;
  }

  if (direction === 'long') {
    const targetDistance = (baseTarget - entryPrice) * targetMultiplier;
    const stopDistance = (entryPrice - baseStop) * stopMultiplier;
    return {
      targetPrice: Number((entryPrice + targetDistance).toFixed(2)),
      stopLoss: Number((entryPrice - stopDistance).toFixed(2))
    };
  } else {
    const targetDistance = (entryPrice - baseTarget) * targetMultiplier;
    const stopDistance = (baseStop - entryPrice) * stopMultiplier;
    return {
      targetPrice: Number((entryPrice - targetDistance).toFixed(2)),
      stopLoss: Number((entryPrice + stopDistance).toFixed(2))
    };
  }
}

// Calculate gem score for prioritizing opportunities
function calculateGemScore(data: MarketData): number {
  let score = 0;
  
  // Price action strength (0-40 points)
  const changePercent = Math.abs(data.changePercent || 0);
  if (changePercent >= 5) {
    score += 40;
  } else if (changePercent >= 3) {
    score += 30;
  } else if (changePercent >= 1) {
    score += 20;
  } else {
    score += 10;
  }
  
  // Volume strength (0-30 points)
  if (data.volume && data.avgVolume) {
    const volumeRatio = data.volume / data.avgVolume;
    if (volumeRatio >= 3) {
      score += 30;
    } else if (volumeRatio >= 2) {
      score += 20;
    } else if (volumeRatio >= 1.5) {
      score += 10;
    }
  }
  
  // Liquidity (0-30 points)
  if (data.currentPrice >= 10) {
    score += 30;
  } else if (data.currentPrice >= 5) {
    score += 20;
  } else if (data.currentPrice >= 1) {
    score += 10;
  }
  
  return score;
}

// Main function to generate quantitative trade ideas
export async function generateQuantIdeas(
  marketData: MarketData[],
  catalysts: Catalyst[],
  count: number = 8,
  storage?: any
): Promise<InsertTradeIdea[]> {
  const ideas: InsertTradeIdea[] = [];
  const timezone = 'America/Chicago';
  const now = new Date();

  // 🧠 ML ENHANCEMENT: Load learned signal weights from performance data
  const learnedWeights = await fetchLearnedWeights();

  // 🔍 DISCOVERY PHASE: Dynamically scan the entire market for opportunities
  logger.info('🔍 Starting market-wide discovery...');
  
  // Check if stock market is open (Mon-Fri, 9:30 AM - 4:00 PM ET)
  const marketOpen = isStockMarketOpen();
  
  // Discover stock movers and breakouts ONLY if market is open
  // This includes penny stocks which are auto-classified based on price < $5
  const stockGems = marketOpen ? await discoverStockGems(40) : [];
  if (marketOpen) {
    const pennyCount = stockGems.filter(g => g.currentPrice < 5).length;
    logger.info(`  ✓ Stock discovery: ${stockGems.length} total (${pennyCount} penny stocks under $5)`);
  }
  
  // Discover hidden crypto gems (small-caps with anomalies) - 24/7 markets
  const cryptoGems = await discoverHiddenCryptoGems(15);
  logger.info(`  ✓ Crypto discovery: ${cryptoGems.length} gems found`);

  // Convert discovered stock gems to MarketData
  // CLASSIFY: Stocks under $5 = penny_stock (SEC definition), $5+ = regular stock
  const discoveredStockData: MarketData[] = stockGems.map(gem => {
    const assetType: 'stock' | 'penny_stock' = gem.currentPrice < 5 ? 'penny_stock' : 'stock';
    return {
      id: `stock-gem-${gem.symbol}`,
      symbol: gem.symbol,
      assetType,
      currentPrice: gem.currentPrice,
      changePercent: gem.changePercent,
      volume: gem.volume,
      marketCap: gem.marketCap,
      session: 'rth' as const,
      timestamp: now.toISOString(),
      high24h: null,
      low24h: null,
      high52Week: null,
      low52Week: null,
      avgVolume: gem.volume / 1.3, // Estimate baseline volume
      dataSource: 'live' as const,
      lastUpdated: now.toISOString(),
    };
  });
  
  // Build dynamic symbol-to-coinId map for discovered crypto gems
  // This allows historical price fetching to work with newly discovered symbols
  const cryptoCoinIdMap: Record<string, string> = {};
  cryptoGems.forEach(gem => {
    if (gem.coinId) {
      cryptoCoinIdMap[gem.symbol.toUpperCase()] = gem.coinId;
    }
  });
  
  // Convert discovered crypto gems to MarketData
  const discoveredCryptoData: MarketData[] = cryptoGems.map(gem => ({
    id: `crypto-gem-${gem.symbol}`,
    symbol: gem.symbol,
    assetType: 'crypto' as const,
    currentPrice: gem.currentPrice,
    changePercent: gem.priceChange24h,
    volume: gem.volume24h,
    marketCap: gem.marketCap,
    session: 'rth' as const,
    timestamp: now.toISOString(),
    high24h: null,
    low24h: null,
    high52Week: null,
    low52Week: null,
    avgVolume: gem.volume24h / 1.5,
    dataSource: 'live' as const,
    lastUpdated: now.toISOString(),
  }));

  // 🔥 PRIORITIZE DISCOVERED GEMS: Use dynamic discovery instead of static database symbols
  // Only use database symbols as fallback if discovery fails
  const totalPennyStocks = discoveredStockData.filter(d => d.assetType === 'penny_stock').length;
  logger.info(`💎 Using ${discoveredStockData.length} discovered stocks (${totalPennyStocks} penny stocks <$5) + ${discoveredCryptoData.length} discovered cryptos`);
  
  const combinedData = [...discoveredStockData, ...discoveredCryptoData];
  
  // Only add database symbols as fallback if we didn't get enough from discovery
  if (combinedData.length < count * 2) {
    logger.info('📊 Adding fallback symbols from database...');
    marketData.forEach(d => {
      // Skip if we already have this symbol from discovery
      if (!combinedData.some(gem => gem.symbol === d.symbol)) {
        combinedData.push(d);
      }
    });
  }

  // Separate by asset type for balanced iteration
  const stockData = combinedData.filter(d => d.assetType === 'stock').sort((a, b) => calculateGemScore(b) - calculateGemScore(a));
  const pennyStockData = combinedData.filter(d => d.assetType === 'penny_stock').sort((a, b) => calculateGemScore(b) - calculateGemScore(a));
  const cryptoData = combinedData.filter(d => d.assetType === 'crypto').sort((a, b) => calculateGemScore(b) - calculateGemScore(a));
  
  // Interleave asset types to ensure balanced distribution (1 stock, 1 penny, 1 crypto pattern)
  const sortedData: typeof combinedData = [];
  let si = 0, pi = 0, ci = 0;
  while (si < stockData.length || pi < pennyStockData.length || ci < cryptoData.length) {
    // Add 1 regular stock
    if (si < stockData.length) sortedData.push(stockData[si++]);
    // Add 1 penny stock
    if (pi < pennyStockData.length) sortedData.push(pennyStockData[pi++]);
    // Add 1 crypto
    if (ci < cryptoData.length) sortedData.push(cryptoData[ci++]);
  }

  logger.info(`📊 Processing ${sortedData.length} candidates (${stockData.length} stocks, ${pennyStockData.length} penny stocks, ${cryptoData.length} crypto)`);
  logger.info(`   Top movers: ${sortedData.slice(0, 10).map(d => `${d.symbol} ${d.changePercent > 0 ? '+' : ''}${d.changePercent.toFixed(1)}%`).join(', ')}${sortedData.length > 10 ? '...' : ''}`);

  // Track asset type distribution to ensure balanced mix
  const assetTypeCount = { stock: 0, penny_stock: 0, option: 0, crypto: 0 };
  
  const targetDistribution = {
    stock: marketOpen ? Math.round(count * 0.25) : 0,  // 25% regular stocks when market open
    penny_stock: marketOpen ? Math.round(count * 0.15) : 0,  // 15% penny stocks when market open
    option: marketOpen ? Math.round(count * 0.20) : 0, // 20% options when market open (Tradier API working)
    crypto: 0   // Will be calculated to fill remaining
  };
  // Ensure targets add up to count by allocating remainder to crypto
  targetDistribution.crypto = count - targetDistribution.stock - targetDistribution.penny_stock - targetDistribution.option;

  // Helper to check if we should accept this asset type based on distribution targets
  const shouldAcceptAssetType = (assetType: string): boolean => {
    if (ideas.length >= count) return false;
    
    // Strict rule: Only accept if this asset type is below its target
    if (assetType === 'stock') return assetTypeCount.stock < targetDistribution.stock;
    if (assetType === 'penny_stock') return assetTypeCount.penny_stock < targetDistribution.penny_stock;
    if (assetType === 'option') return assetTypeCount.option < targetDistribution.option;
    if (assetType === 'crypto') return assetTypeCount.crypto < targetDistribution.crypto;
    
    return false; // Unknown asset type - reject
  };

  // Data quality tracking
  const dataQuality = {
    processed: 0,
    noHistoricalData: 0,
    noSignal: 0,
    lowQuality: 0,
    quotaFull: 0
  };

  // Analyze each market data point
  for (const data of sortedData) {
    if (ideas.length >= count) break;
    dataQuality.processed++;

    // Fetch real historical prices - REQUIRED for accurate analysis (no synthetic fallback)
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    // For crypto, pass the coinId from discovery if available (enables newly discovered gems)
    const cryptoCoinId = data.assetType === 'crypto' ? cryptoCoinIdMap[data.symbol.toUpperCase()] : undefined;
    const historicalPrices = await fetchHistoricalPrices(data.symbol, data.assetType, 60, apiKey, cryptoCoinId);
    
    if (historicalPrices.length === 0) {
      dataQuality.noHistoricalData++;
      logger.info(`  ⚠️  ${data.symbol}: Skipped - no historical data available`);
      continue;
    }
    
    // Analyze with REAL historical prices only
    const signal = analyzeMarketData(data, historicalPrices);
    if (!signal) {
      dataQuality.noSignal++;
      continue;
    }

    // CRITICAL FIX: For options, normalize signal direction BEFORE calculating levels
    // Options always use LONG positions (no shorts), so direction should always be 'long'
    // The option type (call/put) determines the directional bias
    let normalizedSignal = signal;
    if (data.assetType === 'option') {
      normalizedSignal = {
        ...signal,
        direction: 'long' as 'long' | 'short' // Always LONG for options
      };
    }

    let levels = calculateLevels(data, normalizedSignal, data.assetType);
    const catalyst = generateCatalyst(data, normalizedSignal, catalysts);
    const analysis = generateAnalysis(data, normalizedSignal);
    
    // Multi-timeframe analysis for enhanced confidence
    const mtfAnalysis = await analyzeMultiTimeframe(data, historicalPrices);

    // Calculate risk/reward ratio with guards
    const riskDistance = Math.abs(levels.entryPrice - levels.stopLoss);
    const rewardDistance = Math.abs(levels.targetPrice - levels.entryPrice);
    let riskRewardRatio = riskDistance > 0 ? rewardDistance / riskDistance : 0;
    
    // Guard against extreme values
    if (!isFinite(riskRewardRatio) || isNaN(riskRewardRatio)) {
      riskRewardRatio = 0;
    }
    riskRewardRatio = Math.min(riskRewardRatio, 99.9); // Cap at reasonable max

    // Calculate confidence score and quality signals with multi-timeframe analysis  
    const { score: confidenceScore, signals: qualitySignals } = calculateConfidenceScore(
      data, 
      normalizedSignal, 
      riskRewardRatio,
      mtfAnalysis,
      learnedWeights  // 🧠 ML enhancement
    );
    const probabilityBand = getProbabilityBand(confidenceScore);

    // 🚫 QUALITY FILTER: Stricter filtering for A grade and above (v2.3.0+)
    // 1. Confidence score must be >= 90 (A grade minimum) - improved from 85
    if (confidenceScore < 90) {
      logger.info(`Filtered out ${getProbabilityBand(confidenceScore)}-grade idea for ${data.symbol} (score: ${confidenceScore}) - below A grade`);
      dataQuality.lowQuality++;
      continue;
    }

    // 2. Risk/Reward ratio must meet minimum thresholds
    const minRiskReward = data.assetType === 'crypto' ? 1.2 : 1.3;
    if (riskRewardRatio < minRiskReward) {
      logger.info(`Filtered out ${data.symbol} - insufficient R:R (${riskRewardRatio.toFixed(2)} < ${minRiskReward})`);
      dataQuality.lowQuality++;
      continue;
    }

    // 3. Volume must meet asset-specific thresholds
    const volumeRatio = data.volume && data.avgVolume ? data.volume / data.avgVolume : 1;
    const minVolume = data.assetType === 'crypto' ? 0.6 : (signal.direction === 'short' ? 0.8 : 1.0);
    if (volumeRatio < minVolume) {
      logger.info(`Filtered out ${data.symbol} - insufficient volume (${volumeRatio.toFixed(2)}x < ${minVolume}x)`);
      dataQuality.lowQuality++;
      continue;
    }

    // 4. Crypto Tier Filter (v2.4.0) - Only trade top-tier crypto
    // Analysis: Crypto has 16.7% win rate (1W/5L) vs 44-47% for stocks/options
    // Restrict to highly liquid, top 20 market cap coins only
    if (data.assetType === 'crypto') {
      const topTierCrypto = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC', 
                             'LINK', 'UNI', 'ATOM', 'LTC', 'APT', 'ARB', 'OP', 'INJ', 'TIA', 'SUI'];
      if (!topTierCrypto.includes(data.symbol.toUpperCase())) {
        logger.info(`Filtered out ${data.symbol} - not top-tier crypto (16.7% win rate on low-tier)`);
        dataQuality.lowQuality++;
        continue;
      }
    }

    // Intelligent asset type selection based on distribution targets
    let assetType = data.assetType;
    
    if (data.assetType === 'stock') {
      // For stocks, decide between stock shares vs options - prioritize what's furthest from target
      const stockShortfall = targetDistribution.stock - assetTypeCount.stock;
      const optionShortfall = targetDistribution.option - assetTypeCount.option;
      
      if (stockShortfall > 0 && optionShortfall <= 0) {
        // Only stock shares needed
        assetType = 'stock';
      } else if (optionShortfall > 0 && stockShortfall <= 0) {
        // Only options needed
        assetType = 'option';
      } else if (stockShortfall > optionShortfall) {
        // Stock shares further from target, prioritize it
        assetType = 'stock';
      } else if (optionShortfall > stockShortfall) {
        // Options further from target, prioritize it
        assetType = 'option';
      } else {
        // Equal shortfall - use market characteristics to decide
        assetType = (Math.abs(data.changePercent) > 3 || signal.strength === 'strong') ? 'option' : 'stock';
      }
      
      // IMPORTANT: If assetType changed to 'option', recalculate levels with option thresholds (25% target)
      if (assetType === 'option' && data.assetType === 'stock') {
        levels = calculateLevels(data, normalizedSignal, assetType);
        
        // Recalculate R:R with new option levels
        const riskDistance = Math.abs(levels.entryPrice - levels.stopLoss);
        const rewardDistance = Math.abs(levels.targetPrice - levels.entryPrice);
        riskRewardRatio = riskDistance > 0 ? rewardDistance / riskDistance : 0;
        if (!isFinite(riskRewardRatio) || isNaN(riskRewardRatio)) {
          riskRewardRatio = 0;
        }
        riskRewardRatio = Math.min(riskRewardRatio, 99.9);
      }
    }
    // Crypto stays as crypto (already filtered to hidden gems only)

    // Generate session context string
    const sessionContext = data.session === 'rth' 
      ? 'Regular Trading Hours' 
      : data.session === 'pre-market' 
        ? 'Pre-Market' 
        : data.session === 'after-hours'
          ? 'After Hours'
          : 'Market Closed';

    // For options, use Tradier to find optimal strike based on Greeks, fallback to simple calculation
    let strikePrice: number | undefined = undefined;
    let optionType: 'call' | 'put' | undefined = undefined;
    
    if (assetType === 'option') {
      // Try to use Tradier for intelligent strike selection
      const tradierKey = process.env.TRADIER_API_KEY;
      if (tradierKey) {
        try {
          const { findOptimalStrike } = await import('./tradier-api');
          // Use ORIGINAL signal direction for Tradier (not normalized), as it needs the true bias
          const optimalStrike = await findOptimalStrike(data.symbol, data.currentPrice, signal.direction, tradierKey);
          if (optimalStrike) {
            strikePrice = optimalStrike.strike;
            optionType = optimalStrike.optionType;
          }
        } catch (error) {
          logger.info(`Tradier options chain unavailable for ${data.symbol}, using fallback strike`);
        }
      }
      
      // Fallback to simple calculation if Tradier unavailable
      // Use ORIGINAL signal direction (not normalized) to determine option type
      if (!strikePrice) {
        strikePrice = signal.direction === 'long' 
          ? Number((data.currentPrice * 1.02).toFixed(2)) // Slightly OTM call for bullish
          : Number((data.currentPrice * 0.98).toFixed(2)); // Slightly OTM put for bearish
        optionType = signal.direction === 'long' ? 'call' : 'put';
      }
      
      // CRITICAL FIX: For options, we need to normalize direction BEFORE calculating levels
      // Options work differently than stocks:
      // - LONG CALL = bullish (price goes up)
      // - LONG PUT = bearish (price goes down)
      // - SHORT CALL = bearish (price goes down) - AVOID for simplicity
      // - SHORT PUT = bullish (price goes up) - AVOID for simplicity
      //
      // DECISION: Always use LONG options to avoid confusion
      // If current signal suggests SHORT PUT or SHORT CALL, flip to LONG with correct option type
      //
      // This ensures target/stop prices match the directional bias:
      // - Bullish (LONG CALL): target ABOVE entry, stop BELOW entry
      // - Bearish (LONG PUT): target BELOW entry, stop ABOVE entry
      //
      // BEFORE FIX: SHORT PUT had bearish targets (WRONG - short put is bullish!)
      // AFTER FIX: Convert SHORT PUT → LONG CALL, SHORT CALL → LONG PUT for clarity
    }

    // Check for duplicate ideas before creating
    if (storage) {
      const duplicate = await storage.findSimilarTradeIdea(
        data.symbol,
        normalizedSignal.direction,
        levels.entryPrice,
        72, // Look back 72 hours (INCREASED from 24 to reduce duplicates)
        assetType, // Asset type filter (stock/option/crypto)
        optionType, // Option type filter (call/put) for options
        strikePrice // Strike price filter for options
      );
      if (duplicate) {
        dataQuality.lowQuality++; // Count as filtered for better reporting
        continue; // Skip this idea, it's too similar to an existing one
      }
    }

    // Determine data source used (based on known working APIs)
    const dataSourceUsed = assetType === 'crypto' 
      ? 'coingecko'  // CoinGecko for crypto prices
      : assetType === 'option' 
        ? 'estimated'  // Options strikes estimated (Tradier API inactive)
        : 'yahoo';     // Yahoo Finance for stock prices (primary, unlimited)

    // Calculate volume ratio for transparency
    const actualVolumeRatio = data.volume && data.avgVolume ? data.volume / data.avgVolume : null;

    // Extract RSI/MACD values for timing intelligence and transparency
    const rsiValue = normalizedSignal.rsiValue ?? (historicalPrices.length > 0 ? calculateRSI(historicalPrices, 14) : undefined);
    const macdValues = normalizedSignal.macdValues ?? (historicalPrices.length > 0 ? calculateMACD(historicalPrices) : undefined);
    
    // Build signal stack for timing intelligence system
    const signalStack: SignalStack = {
      rsiValue,
      macdHistogram: macdValues?.histogram,
      volumeRatio: actualVolumeRatio ?? undefined,
      priceVs52WeekHigh: data.high52Week ? ((data.currentPrice - data.high52Week) / data.high52Week) * 100 : undefined,
      priceVs52WeekLow: data.low52Week ? ((data.currentPrice - data.low52Week) / data.low52Week) * 100 : undefined,
      signals: qualitySignals,
      confidenceScore,
      grade: probabilityBand
    };

    // Quantitatively-proven timing windows based on historical performance + market regime
    const regime = detectMarketRegime(signalStack);
    const timingAnalytics = await calculateTimingWindows(
      assetType === 'option' || assetType === 'penny_stock' ? 'stock' : assetType, // Options and penny stocks use stock timing
      signalStack,
      regime
    );

    // Format entry and exit windows using quantitative timing intelligence
    const entryValidUntil = (() => {
      const validUntilDate = new Date(now.getTime() + timingAnalytics.entryWindowMinutes * 60 * 1000);
      return formatInTimeZone(validUntilDate, timezone, 'h:mm a') + ' CST';
    })();

    const exitBy = (() => {
      const exitDate = new Date(now.getTime() + timingAnalytics.exitWindowMinutes * 60 * 1000);
      // Store as ISO timestamp for reliable machine parsing
      // Will be formatted for display in UI layer
      return exitDate.toISOString();
    })();
    
    // Use holding period from timing analytics (includes week-ending strategy)
    const holdingPeriod = timingAnalytics.holdingPeriodType;
    
    // Format exitBy for logging display
    const exitByFormatted = formatInTimeZone(new Date(exitBy), timezone, 'MMM d, h:mm a') + ' CST';
    
    logger.info(
      `⏰ ${data.symbol} QUANTITATIVE TIMING: Entry in ${timingAnalytics.entryWindowMinutes}min (${entryValidUntil}), ` +
      `Exit in ${timingAnalytics.exitWindowMinutes}min (${exitByFormatted}) | ` +
      `${holdingPeriod.toUpperCase()} TRADE | ` +
      `Regime: ${regime.volatilityRegime} volatility, ${regime.sessionPhase} session | ` +
      `Target hit probability: ${timingAnalytics.targetHitProbability.toFixed(1)}%`
    );
    
    // For consistency, use normalizedSignal.direction (already set to 'long' for options)
    
    const idea: InsertTradeIdea = {
      symbol: data.symbol,
      assetType: assetType,
      direction: normalizedSignal.direction,
      holdingPeriod: holdingPeriod,
      entryPrice: levels.entryPrice,
      targetPrice: levels.targetPrice,
      stopLoss: levels.stopLoss,
      riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
      catalyst: catalyst,
      analysis: analysis,
      sessionContext: sessionContext,
      timestamp: now.toISOString(),
      
      // Time windows for day trading (quantitatively-proven)
      entryValidUntil: entryValidUntil,
      exitBy: exitBy,
      
      liquidityWarning: levels.entryPrice < 5,
      
      // Data quality tracking
      dataSourceUsed: dataSourceUsed,
      
      // Explainability fields - Technical Indicator Values
      volumeRatio: actualVolumeRatio,
      rsiValue: rsiValue,
      macdLine: macdValues?.macd,
      macdSignal: macdValues?.signal,
      macdHistogram: macdValues?.histogram,
      priceVs52WeekHigh: signalStack.priceVs52WeekHigh,
      priceVs52WeekLow: signalStack.priceVs52WeekLow,
      
      // Timing Intelligence - Quantitatively-proven windows aligned with confidence grading
      volatilityRegime: regime.volatilityRegime,
      sessionPhase: regime.sessionPhase,
      trendStrength: regime.trendStrength,
      entryWindowMinutes: timingAnalytics.entryWindowMinutes,
      exitWindowMinutes: timingAnalytics.exitWindowMinutes,
      timingConfidence: timingAnalytics.timingConfidence,
      targetHitProbability: timingAnalytics.targetHitProbability,
      
      expiryDate: assetType === 'option' 
        ? (() => {
            // Options expire on Fridays - find next valid Friday in Chicago timezone
            // Distribute: 60% this week's Friday, 30% next week's Friday, 10% week after
            const rand = Math.random();
            let weeksOut: number;
            if (rand < 0.6) {
              weeksOut = 0; // This week's Friday
            } else if (rand < 0.9) {
              weeksOut = 1; // Next week's Friday
            } else {
              weeksOut = 2; // Week after next Friday
            }
            
            // Get current day of week in Chicago timezone (0=Sunday, 5=Friday)
            const currentDayStr = formatInTimeZone(now, timezone, 'i'); // ISO day (1=Mon, 7=Sun)
            const currentHour = parseInt(formatInTimeZone(now, timezone, 'H'));
            const currentDay = parseInt(currentDayStr) % 7; // Convert to JS format (0=Sun, 6=Sat)
            
            // Find days until next Friday
            let daysUntilFriday = (5 - currentDay + 7) % 7;
            if (daysUntilFriday === 0 && currentHour >= 16) {
              // After 4pm on Friday, use next Friday
              daysUntilFriday = 7;
            }
            
            const daysToExpiry = daysUntilFriday + (weeksOut * 7);
            return formatInTimeZone(
              new Date(now.getTime() + daysToExpiry * 24 * 60 * 60 * 1000), 
              timezone, 
              'MMM d, yyyy'
            );
          })()
        : undefined,
      strikePrice: strikePrice,
      optionType: optionType,
      source: 'quant',
      confidenceScore: Math.round(confidenceScore),
      qualitySignals: qualitySignals,
      probabilityBand: probabilityBand,
      
      // 🔐 MODEL GOVERNANCE: Audit trail for regulatory compliance
      engineVersion: QUANT_ENGINE_VERSION,
      mlWeightsVersion: learnedWeights.size > 0 ? `weights_v${learnedWeights.size}_${formatInTimeZone(now, timezone, 'yyyyMMdd')}` : null,
      generationTimestamp: now.toISOString(),
    };

    // Check if we should accept this asset type based on distribution
    if (!shouldAcceptAssetType(assetType)) {
      dataQuality.quotaFull++;
      continue; // Skip this idea to maintain balanced distribution
    }
    
    ideas.push(idea);
    
    // Track asset type for distribution
    if (assetType === 'stock') assetTypeCount.stock++;
    else if (assetType === 'option') assetTypeCount.option++;
    else if (assetType === 'crypto') assetTypeCount.crypto++;
  }
  
  logger.info(`✅ Generated ${ideas.length} ideas: ${assetTypeCount.stock} stock shares, ${assetTypeCount.option} options, ${assetTypeCount.crypto} crypto`);
  
  // Data quality report
  logger.info(`📊 Data Quality Report:`);
  logger.info(`   Candidates processed: ${dataQuality.processed}`);
  logger.info(`   ❌ No historical data: ${dataQuality.noHistoricalData}`);
  logger.info(`   ❌ No signal detected: ${dataQuality.noSignal}`);
  logger.info(`   ❌ Low quality (filters): ${dataQuality.lowQuality}`);
  logger.info(`   ⛔ Quota full (rejected): ${dataQuality.quotaFull}`);
  logger.info(`   ✅ Ideas generated: ${ideas.length}`);
  
  // Warn if target distribution was not met
  if (assetTypeCount.stock < targetDistribution.stock) {
    logger.info(`⚠️  Stock shares: generated ${assetTypeCount.stock}, target was ${targetDistribution.stock}`);
  }
  if (assetTypeCount.option < targetDistribution.option) {
    logger.info(`⚠️  Options: generated ${assetTypeCount.option}, target was ${targetDistribution.option}`);
  }
  if (assetTypeCount.crypto < targetDistribution.crypto) {
    logger.info(`⚠️  Crypto: generated ${assetTypeCount.crypto}, target was ${targetDistribution.crypto}`);
  }
  
  // Critical data quality warning
  if (dataQuality.noHistoricalData > 0) {
    logger.info(`🚨 WARNING: ${dataQuality.noHistoricalData} candidates skipped due to missing historical data - ideas are based on real data only!`);
  }

  // If we don't have enough ideas, generate some based on catalysts
  if (ideas.length < count && catalysts.length > 0) {
    const now = new Date();
    const recentCatalysts = catalysts.filter(c => {
      const catalystDate = new Date(c.timestamp);
      return catalystDate >= now || (now.getTime() - catalystDate.getTime()) < 24 * 60 * 60 * 1000;
    });

    for (const catalyst of recentCatalysts) {
      if (ideas.length >= count) break;
      
      // Find market data for this symbol (use FILTERED data to respect large-cap crypto exclusions)
      const symbolData = combinedData.find((d: MarketData) => d.symbol === catalyst.symbol);
      if (!symbolData) continue;

      const isPositiveCatalyst = catalyst.impact === 'high' || catalyst.eventType === 'earnings';
      const direction: 'long' | 'short' = isPositiveCatalyst ? 'long' : 'short';
      
      // Apply asset-type-specific targets (stocks: 8%, crypto: 12%, options: 25%)
      const assetMultiplier = symbolData.assetType === 'crypto' ? 1.5 :
                              symbolData.assetType === 'option' ? 3.125 :
                              1.0;
      
      const currentPrice = symbolData.currentPrice;
      const entryPrice = Number((currentPrice * 0.998).toFixed(2));
      const targetPrice = Number((currentPrice * (direction === 'long' ? (1 + 0.08 * assetMultiplier) : (1 - 0.08 * assetMultiplier))).toFixed(2));
      const stopLoss = Number((currentPrice * (direction === 'long' ? (1 - 0.02 * assetMultiplier) : (1 + 0.02 * assetMultiplier))).toFixed(2)); // TIGHTENED: 2% stops - limit losses
      // Calculate risk/reward ratio with guards
      const riskDistance = Math.abs(entryPrice - stopLoss);
      const rewardDistance = Math.abs(targetPrice - entryPrice);
      let riskRewardRatio = riskDistance > 0 ? rewardDistance / riskDistance : 0;
      
      // Guard against extreme values
      if (!isFinite(riskRewardRatio) || isNaN(riskRewardRatio)) {
        riskRewardRatio = 0;
      }
      riskRewardRatio = Math.min(riskRewardRatio, 99.9);

      // Quality check for catalyst ideas
      if (riskRewardRatio < 1.3) continue; // Skip if R:R too low (lowered to trust signals)

      // Generate session context string
      const sessionContext = symbolData.session === 'rth' 
        ? 'Regular Trading Hours' 
        : symbolData.session === 'pre-market' 
          ? 'Pre-Market' 
          : symbolData.session === 'after-hours'
            ? 'After Hours'
            : 'Market Closed';

      // Calculate confidence for catalyst ideas (slightly different scoring)
      const catalystSignal: QuantSignal = {
        type: 'catalyst_driven',
        strength: catalyst.impact === 'high' ? 'strong' : 'moderate',
        direction: direction
      };
      const { score: confidenceScore, signals: qualitySignals } = calculateConfidenceScore(
        symbolData, 
        catalystSignal, 
        riskRewardRatio,
        undefined,  // No MTF analysis for catalyst ideas
        learnedWeights  // 🧠 ML enhancement
      );
      const probabilityBand = getProbabilityBand(confidenceScore);

      // Skip if below quality threshold - STRICT A minimum (90+) for ALL ideas (v2.3.0+)
      if (confidenceScore < 90) {
        logger.info(`Filtered out catalyst idea for ${catalyst.symbol} - below A grade threshold (score: ${confidenceScore})`);
        continue;
      }

      // Check for duplicate ideas before creating
      if (storage) {
        const duplicate = await storage.findSimilarTradeIdea(
          catalyst.symbol,
          direction,
          entryPrice,
          72, // Look back 72 hours (INCREASED from 24 to reduce duplicates)
          symbolData.assetType // Asset type filter
        );
        if (duplicate) {
          continue; // Skip this idea, it's too similar to an existing one
        }
      }

      const idea: InsertTradeIdea = {
        symbol: catalyst.symbol,
        assetType: symbolData.assetType,
        direction: direction,
        entryPrice: entryPrice,
        targetPrice: targetPrice,
        stopLoss: stopLoss,
        riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
        catalyst: catalyst.title,
        analysis: `Catalyst-driven ${direction} opportunity. ${catalyst.description} Event impact rated ${catalyst.impact}. Position for ${direction === 'long' ? 'upside' : 'downside'} reaction.`,
        sessionContext: sessionContext,
        timestamp: now.toISOString(),
        liquidityWarning: entryPrice < 5,
        source: 'quant',
        confidenceScore: Math.round(confidenceScore),
        qualitySignals: qualitySignals,
        probabilityBand: probabilityBand,
        
        // 🔐 MODEL GOVERNANCE: Audit trail for regulatory compliance
        engineVersion: QUANT_ENGINE_VERSION,
        mlWeightsVersion: learnedWeights.size > 0 ? `weights_v${learnedWeights.size}_${formatInTimeZone(now, timezone, 'yyyyMMdd')}` : null,
        generationTimestamp: now.toISOString(),
      };

      ideas.push(idea);
    }
  }

  return ideas;
}
