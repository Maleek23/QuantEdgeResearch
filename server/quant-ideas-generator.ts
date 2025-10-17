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
import { discoverHiddenCryptoGems, fetchCryptoPrice, fetchHistoricalPrices } from './market-api';

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
function analyzeMarketData(data: MarketData, historicalPrices: number[]): QuantSignal | null {
  const priceChange = data.changePercent;
  const volume = data.volume || 0;
  const avgVolume = data.avgVolume || volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

  // Strong momentum signal (>5% move with good volume)
  if (Math.abs(priceChange) >= 5 && volumeRatio >= 1.5) {
    return {
      type: 'momentum',
      strength: 'strong',
      direction: priceChange > 0 ? 'long' : 'short'
    };
  }

  // Volume spike signal (>3x average volume)
  if (volumeRatio >= 3) {
    return {
      type: 'volume_spike',
      strength: volumeRatio >= 5 ? 'strong' : 'moderate',
      direction: priceChange >= 0 ? 'long' : 'short'
    };
  }

  // Moderate momentum (2-5% move) - LOWERED from 3% to 2% for more sensitivity
  if (Math.abs(priceChange) >= 2 && volumeRatio >= 1.2) {
    return {
      type: 'momentum',
      strength: 'moderate',
      direction: priceChange > 0 ? 'long' : 'short'
    };
  }

  // Breakout signal - price near highs with volume
  // Detect when price is within 2% of 52-week high and volume is elevated
  if (data.high52Week && data.currentPrice >= data.high52Week * 0.98 && volumeRatio >= 1.5) {
    return {
      type: 'breakout',
      strength: volumeRatio >= 2.5 ? 'strong' : 'moderate',
      direction: 'long' // breakout continuation
    };
  }

  // Bearish breakdown - price near lows with volume
  if (data.low52Week && data.currentPrice <= data.low52Week * 1.02 && volumeRatio >= 1.5) {
    return {
      type: 'breakout',
      strength: volumeRatio >= 2.5 ? 'strong' : 'moderate',
      direction: 'short' // breakdown continuation
    };
  }

  // Weak bearish momentum - catch smaller down moves for PUT opportunities
  if (priceChange <= -1.5 && volumeRatio >= 1.0) {
    return {
      type: 'momentum',
      strength: 'weak',
      direction: 'short'
    };
  }

  // Mean reversion - strong oversold/overbought
  if (priceChange <= -7) {
    return {
      type: 'mean_reversion',
      strength: 'strong',
      direction: 'long' // oversold bounce
    };
  }

  if (priceChange >= 7 && data.assetType === 'stock') {
    return {
      type: 'mean_reversion',
      strength: 'moderate',
      direction: 'short' // overbought pullback
    };
  }

  // RSI and MACD Analysis - Advanced Technical Signals
  // Require real historical prices - no synthetic fallback
  if (historicalPrices.length === 0) {
    return null; // Cannot analyze without real data
  }
  
  const prices = historicalPrices;
  
  const rsi = calculateRSI(prices, 14);
  const macd = calculateMACD(prices);
  
  const rsiAnalysis = analyzeRSI(rsi);
  const macdAnalysis = analyzeMACD(macd);
  
  // RSI Divergence Signal (strong oversold/overbought)
  if (rsiAnalysis.strength === 'strong' && rsiAnalysis.direction !== 'neutral') {
    return {
      type: 'rsi_divergence',
      strength: 'strong',
      direction: rsiAnalysis.direction,
      rsiValue: rsi
    };
  }
  
  // MACD Crossover Signal
  if ((macdAnalysis.crossover || macdAnalysis.strength === 'strong') && macdAnalysis.direction !== 'neutral') {
    return {
      type: 'macd_crossover',
      strength: macdAnalysis.strength,
      direction: macdAnalysis.direction,
      macdValues: macd
    };
  }
  
  // Moderate RSI signal
  if (rsiAnalysis.strength === 'moderate' && rsiAnalysis.direction !== 'neutral') {
    return {
      type: 'rsi_divergence',
      strength: 'moderate',
      direction: rsiAnalysis.direction,
      rsiValue: rsi
    };
  }

  return null;
}

// Calculate entry, target, and stop based on REAL-TIME market prices for ACTIVE trading
// Entry = CURRENT market price (immediate execution)
// Target/Stop = Calculated from entry for actionable levels
function calculateLevels(data: MarketData, signal: QuantSignal) {
  // ✅ ACTIVE TRADING: Entry is ALWAYS current market price for immediate execution
  const entryPrice = data.currentPrice;
  let targetPrice: number;
  let stopLoss: number;

  if (signal.type === 'momentum') {
    // Momentum trade - ride the trend
    if (signal.direction === 'long') {
      targetPrice = entryPrice * 1.08; // 8% target from entry
      stopLoss = entryPrice * 0.96; // 4% stop from entry
    } else {
      targetPrice = entryPrice * 0.92; // 8% target from entry
      stopLoss = entryPrice * 1.04; // 4% stop from entry
    }
  } else if (signal.type === 'volume_spike') {
    // Volume breakout
    if (signal.direction === 'long') {
      targetPrice = entryPrice * 1.12; // 12% target from entry
      stopLoss = entryPrice * 0.94; // 6% stop from entry
    } else {
      targetPrice = entryPrice * 0.88;
      stopLoss = entryPrice * 1.06;
    }
  } else if (signal.type === 'breakout') {
    // Breakout trade - momentum continuation
    if (signal.direction === 'long') {
      targetPrice = entryPrice * 1.15; // 15% target from entry
      stopLoss = entryPrice * 0.96; // 4% stop from entry
    } else {
      targetPrice = entryPrice * 0.85; // 15% target from entry
      stopLoss = entryPrice * 1.04; // 4% stop from entry
    }
  } else if (signal.type === 'mean_reversion') {
    // Mean reversion - contrarian
    if (signal.direction === 'long') {
      targetPrice = entryPrice * 1.15; // bounce target from entry
      stopLoss = entryPrice * 0.92; // 8% stop from entry
    } else {
      targetPrice = entryPrice * 0.85;
      stopLoss = entryPrice * 1.08;
    }
  } else if (signal.type === 'rsi_divergence') {
    // RSI-based mean reversion
    if (signal.direction === 'long') {
      targetPrice = entryPrice * 1.12; // 12% reversal target from entry
      stopLoss = entryPrice * 0.94; // 6% stop from entry
    } else {
      targetPrice = entryPrice * 0.88;
      stopLoss = entryPrice * 1.06;
    }
  } else if (signal.type === 'macd_crossover') {
    // MACD trend following
    if (signal.direction === 'long') {
      targetPrice = entryPrice * 1.1; // 10% trend target from entry
      stopLoss = entryPrice * 0.95; // 5% stop from entry
    } else {
      targetPrice = entryPrice * 0.9;
      stopLoss = entryPrice * 1.05;
    }
  } else {
    // Default case
    if (signal.direction === 'long') {
      targetPrice = entryPrice * 1.1;
      stopLoss = entryPrice * 0.95;
    } else {
      targetPrice = entryPrice * 0.9;
      stopLoss = entryPrice * 1.05;
    }
  }

  return {
    entryPrice: Number(entryPrice.toFixed(2)),
    targetPrice: Number(targetPrice.toFixed(2)),
    stopLoss: Number(stopLoss.toFixed(2))
  };
}

// Generate catalyst for signal type
function generateCatalyst(data: MarketData, signal: QuantSignal, catalysts: Catalyst[]): string {
  // Check if there's a real catalyst for this symbol
  const symbolCatalyst = catalysts.find(c => c.symbol === data.symbol);
  if (symbolCatalyst) {
    return symbolCatalyst.title;
  }

  // Generate technical catalyst
  const volumeRatio = data.volume && data.avgVolume ? (data.volume / data.avgVolume).toFixed(1) : '1.0';
  
  if (signal.type === 'momentum') {
    return `${Math.abs(data.changePercent).toFixed(1)}% ${data.changePercent > 0 ? 'rally' : 'selloff'} on ${volumeRatio}x volume`;
  } else if (signal.type === 'volume_spike') {
    return `Unusual volume spike (${volumeRatio}x average) - institutional activity detected`;
  } else if (signal.type === 'mean_reversion') {
    return `Oversold/overbought condition - ${Math.abs(data.changePercent).toFixed(1)}% move creates reversal opportunity`;
  } else if (signal.type === 'breakout') {
    return `Price breakout on strong volume - momentum continuation expected`;
  } else if (signal.type === 'rsi_divergence') {
    const rsiValue = signal.rsiValue || 50;
    return `RSI ${rsiValue < 30 ? 'oversold' : 'overbought'} at ${rsiValue.toFixed(0)} - reversal setup developing`;
  } else if (signal.type === 'macd_crossover') {
    return `MACD ${signal.direction === 'long' ? 'bullish' : 'bearish'} crossover signal - trend momentum building`;
  } else {
    return `Technical setup - ${data.changePercent.toFixed(1)}% move with volume confirmation`;
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
function calculateConfidenceScore(
  data: MarketData,
  signal: QuantSignal,
  riskRewardRatio: number,
  mtfAnalysis?: MultiTimeframeAnalysis
): { score: number; signals: string[] } {
  let score = 0;
  const qualitySignals: string[] = [];
  const volumeRatio = data.volume && data.avgVolume ? data.volume / data.avgVolume : 1;
  const priceChangeAbs = Math.abs(data.changePercent);

  // 1. Risk/Reward Ratio Quality (0-25 points)
  if (riskRewardRatio >= 3) {
    score += 25;
    qualitySignals.push('Excellent R:R (3:1+)');
  } else if (riskRewardRatio >= 2) {
    score += 20;
    qualitySignals.push('Strong R:R (2:1+)');
  } else if (riskRewardRatio >= 1.5) {
    score += 10;
    qualitySignals.push('Moderate R:R');
  }

  // 2. Volume Confirmation (0-25 points)
  if (volumeRatio >= 3) {
    score += 25;
    qualitySignals.push('Exceptional Volume (3x+)');
  } else if (volumeRatio >= 2) {
    score += 20;
    qualitySignals.push('Strong Volume (2x+)');
  } else if (volumeRatio >= 1.5) {
    score += 15;
    qualitySignals.push('Above Avg Volume');
  } else if (volumeRatio >= 1.2) {
    score += 5;
    qualitySignals.push('Confirmed Volume');
  }

  // 3. Signal Strength (0-20 points)
  if (signal.strength === 'strong') {
    score += 20;
    qualitySignals.push('Strong Signal');
  } else if (signal.strength === 'moderate') {
    score += 15;
    qualitySignals.push('Moderate Signal');
  } else {
    score += 10;
    qualitySignals.push('Weak Signal');
  }

  // 4. Price Action Quality (0-15 points)
  if (signal.type === 'breakout' && priceChangeAbs >= 3) {
    score += 15;
    qualitySignals.push('Breakout Momentum');
  } else if (signal.type === 'momentum' && priceChangeAbs >= 5) {
    score += 15;
    qualitySignals.push('Strong Trend');
  } else if (signal.type === 'volume_spike' && volumeRatio >= 5) {
    score += 15;
    qualitySignals.push('Institutional Flow');
  } else if (priceChangeAbs >= 3) {
    score += 10;
    qualitySignals.push('Price Confirmation');
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

  // 7. Multi-Timeframe Alignment Bonus (0-15 points)
  if (mtfAnalysis) {
    if (mtfAnalysis.aligned && mtfAnalysis.strength === 'strong') {
      score += 15;
      qualitySignals.push('Timeframes Aligned (Strong)');
    } else if (mtfAnalysis.aligned) {
      score += 10;
      qualitySignals.push('Timeframes Aligned');
    } else if (mtfAnalysis.strength === 'moderate') {
      score += 5;
      qualitySignals.push('Partial Timeframe Support');
    }
  }

  // 8. Bearish Momentum Bonus - Help PUT ideas qualify (0-20 points)
  if (signal.direction === 'short' && data.changePercent < 0) {
    const downMoveSize = Math.abs(data.changePercent);
    if (downMoveSize >= 3) {
      score += 20;
      qualitySignals.push('Strong Bearish Momentum');
    } else if (downMoveSize >= 2) {
      score += 15;
      qualitySignals.push('Moderate Bearish Momentum');
    } else if (downMoveSize >= 1.5) {
      score += 10;
      qualitySignals.push('Bearish Pressure');
    }
  }

  return { score: Math.min(score, 100), signals: qualitySignals };
}

// Calculate probability band based on confidence score
// ALIGNED with frontend display logic in trade-idea-block.tsx
function getProbabilityBand(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A-';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'B-';
  if (score >= 70) return 'C+';
  if (score >= 65) return 'C';
  return 'C-';
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

  // DISCOVERY PHASE: Find hidden crypto gems dynamically
  const hiddenGems = await discoverHiddenCryptoGems(15);
  console.log(`🔍 Discovered ${hiddenGems.length} hidden crypto gems:`, hiddenGems.map(g => `${g.symbol} ($${g.marketCap.toLocaleString()})`).join(', '));

  // Convert discovered gems directly to MarketData (no need to fetch prices again!)
  const discoveredMarketData: MarketData[] = hiddenGems.map(gem => ({
    id: `discovered-${gem.symbol}`,
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
    avgVolume: gem.volume24h / 1.5, // Estimate baseline volume
    dataSource: 'live' as const, // Discovered from live API data
    lastUpdated: now.toISOString(),
  }));

  // Filter out large-cap cryptos from existing market data (>$2B) - only use discovered gems for crypto
  const filteredMarketData = marketData.filter(d => {
    if (d.assetType === 'crypto') {
      // For crypto, only keep if marketCap exists AND is within hidden gem range
      const keep = d.marketCap !== null && d.marketCap !== undefined && d.marketCap <= 2_000_000_000;
      if (!keep) {
        console.log(`  ⚠️  Filtered out large-cap crypto: ${d.symbol} (${d.marketCap ? '$' + (d.marketCap / 1e9).toFixed(1) + 'B' : 'no cap data'})`);
      }
      return keep;
    }
    // Keep all non-crypto assets (stocks, options)
    return true;
  });

  // Combine filtered market data with discovered hidden gems
  const combinedData = [...filteredMarketData, ...discoveredMarketData];

  // Separate by asset type for balanced iteration
  const stockData = combinedData.filter(d => d.assetType === 'stock').sort((a, b) => calculateGemScore(b) - calculateGemScore(a));
  const cryptoData = combinedData.filter(d => d.assetType === 'crypto').sort((a, b) => calculateGemScore(b) - calculateGemScore(a));
  
  // Interleave asset types to ensure balanced distribution (2 stocks, then 1 crypto pattern)
  const sortedData: typeof combinedData = [];
  let si = 0, ci = 0;
  while (si < stockData.length || ci < cryptoData.length) {
    // Add 2 stocks
    if (si < stockData.length) sortedData.push(stockData[si++]);
    if (si < stockData.length) sortedData.push(stockData[si++]);
    // Add 1 crypto
    if (ci < cryptoData.length) sortedData.push(cryptoData[ci++]);
  }

  console.log(`📊 Analysis pool: ${sortedData.length} total (${filteredMarketData.length} existing + ${discoveredMarketData.length} discovered)`);

  // Track asset type distribution to ensure balanced mix
  const assetTypeCount = { stock: 0, option: 0, crypto: 0 };
  const targetDistribution = {
    stock: Math.round(count * 0.4),  // 40% stock shares (3 for count=8)
    option: Math.round(count * 0.35), // 35% options (3 for count=8)
    crypto: 0   // Will be calculated to fill remaining
  };
  // Ensure targets add up to count by allocating remainder to crypto
  targetDistribution.crypto = count - targetDistribution.stock - targetDistribution.option;

  // Helper to check if we should accept this asset type based on distribution targets
  const shouldAcceptAssetType = (assetType: string): boolean => {
    if (ideas.length >= count) return false;
    
    // Strict rule: Only accept if this asset type is below its target
    if (assetType === 'stock') return assetTypeCount.stock < targetDistribution.stock;
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
    const historicalPrices = await fetchHistoricalPrices(data.symbol, data.assetType, 60, apiKey);
    
    if (historicalPrices.length === 0) {
      dataQuality.noHistoricalData++;
      console.log(`  ⚠️  ${data.symbol}: Skipped - no historical data available`);
      continue;
    }
    
    // Analyze with REAL historical prices only
    const signal = analyzeMarketData(data, historicalPrices);
    if (!signal) {
      dataQuality.noSignal++;
      continue;
    }

    const levels = calculateLevels(data, signal);
    const catalyst = generateCatalyst(data, signal, catalysts);
    const analysis = generateAnalysis(data, signal);
    
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
      signal, 
      riskRewardRatio,
      mtfAnalysis
    );
    const probabilityBand = getProbabilityBand(confidenceScore);

    // QUALITY FILTER: Trust quantitative signals - adjust thresholds by asset type
    let minConfidence: number;
    let minRiskReward: number;
    let minVolume: number;
    
    if (data.assetType === 'crypto') {
      // More lenient for crypto (different market dynamics)
      minConfidence = signal.direction === 'short' ? 45 : 50;
      minRiskReward = 1.2; // Crypto can have tighter stops
      minVolume = 0.6; // Crypto volume can be more erratic
    } else {
      // Standard thresholds for stocks
      minConfidence = signal.direction === 'short' ? 50 : 55;
      minRiskReward = 1.3;
      minVolume = signal.direction === 'short' ? 0.8 : 1.0;
    }
    
    if (confidenceScore < minConfidence) {
      dataQuality.lowQuality++;
      continue;
    }
    if (riskRewardRatio < minRiskReward) {
      dataQuality.lowQuality++;
      continue;
    }
    
    const volumeRatio = data.volume && data.avgVolume ? data.volume / data.avgVolume : 1;
    if (volumeRatio < minVolume) {
      dataQuality.lowQuality++;
      continue;
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
          const optimalStrike = await findOptimalStrike(data.symbol, data.currentPrice, signal.direction, tradierKey);
          if (optimalStrike) {
            strikePrice = optimalStrike.strike;
            optionType = optimalStrike.optionType;
          }
        } catch (error) {
          console.log(`Tradier options chain unavailable for ${data.symbol}, using fallback strike`);
        }
      }
      
      // Fallback to simple calculation if Tradier unavailable
      if (!strikePrice) {
        strikePrice = signal.direction === 'long' 
          ? Number((data.currentPrice * 1.02).toFixed(2)) // Slightly OTM call for bullish
          : Number((data.currentPrice * 0.98).toFixed(2)); // Slightly OTM put for bearish
        optionType = signal.direction === 'long' ? 'call' : 'put';
      }
    }

    // Check for duplicate ideas before creating
    if (storage) {
      const duplicate = await storage.findSimilarTradeIdea(
        data.symbol,
        signal.direction,
        levels.entryPrice,
        24 // Look back 24 hours
      );
      if (duplicate) {
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

    // Calculate time windows for day trading
    const entryValidUntil = (() => {
      // Entry window: 90 minutes for stocks/options, 2 hours for crypto
      const minutesValid = assetType === 'crypto' ? 120 : 90;
      const validUntilDate = new Date(now.getTime() + minutesValid * 60 * 1000);
      return formatInTimeZone(validUntilDate, timezone, 'h:mm a zzz');
    })();

    const exitBy = (() => {
      if (assetType === 'option') {
        // Options: Hold until expiry or sooner if target/stop hit
        return 'Expiry or Target/Stop';
      } else if (assetType === 'crypto') {
        // Crypto: 24/7 market, suggest 24-hour max hold for day trades
        const exitDate = new Date(now.getTime() + 24 * 60 * 1000);
        return formatInTimeZone(exitDate, timezone, 'MMM d, h:mm a zzz');
      } else {
        // Stocks: Exit by market close (4 PM ET)
        const currentHour = parseInt(formatInTimeZone(now, timezone, 'H'));
        if (currentHour >= 16) {
          // After market close, suggest tomorrow's close
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          return formatInTimeZone(tomorrow, timezone, 'MMM d') + ' 4:00 PM EST';
        } else {
          // Today's market close
          return formatInTimeZone(now, timezone, 'MMM d') + ' 4:00 PM EST';
        }
      }
    })();
    
    console.log(`⏰ ${data.symbol} time windows: Entry by ${entryValidUntil}, Exit by ${exitBy}`);

    // TODO: Extract RSI/MACD values from signal detection for full transparency
    // For now, we populate what's available and will enhance in next iteration
    
    const idea: InsertTradeIdea = {
      symbol: data.symbol,
      assetType: assetType,
      direction: signal.direction,
      entryPrice: levels.entryPrice,
      targetPrice: levels.targetPrice,
      stopLoss: levels.stopLoss,
      riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
      catalyst: catalyst,
      analysis: analysis,
      sessionContext: sessionContext,
      timestamp: now.toISOString(),
      
      // Time windows for day trading
      entryValidUntil: entryValidUntil,
      exitBy: exitBy,
      
      liquidityWarning: levels.entryPrice < 5,
      
      // Data quality tracking
      dataSourceUsed: dataSourceUsed,
      
      // Explainability fields (partial - will enhance to include RSI/MACD)
      volumeRatio: actualVolumeRatio,
      // TODO: Add rsiValue, macdLine, macdSignal, macdHistogram from signal detection
      
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
      probabilityBand: probabilityBand
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
  
  console.log(`✅ Generated ${ideas.length} ideas: ${assetTypeCount.stock} stock shares, ${assetTypeCount.option} options, ${assetTypeCount.crypto} crypto`);
  
  // Data quality report
  console.log(`📊 Data Quality Report:`);
  console.log(`   Candidates processed: ${dataQuality.processed}`);
  console.log(`   ❌ No historical data: ${dataQuality.noHistoricalData}`);
  console.log(`   ❌ No signal detected: ${dataQuality.noSignal}`);
  console.log(`   ❌ Low quality (filters): ${dataQuality.lowQuality}`);
  console.log(`   ⛔ Quota full (rejected): ${dataQuality.quotaFull}`);
  console.log(`   ✅ Ideas generated: ${ideas.length}`);
  
  // Warn if target distribution was not met
  if (assetTypeCount.stock < targetDistribution.stock) {
    console.log(`⚠️  Stock shares: generated ${assetTypeCount.stock}, target was ${targetDistribution.stock}`);
  }
  if (assetTypeCount.option < targetDistribution.option) {
    console.log(`⚠️  Options: generated ${assetTypeCount.option}, target was ${targetDistribution.option}`);
  }
  if (assetTypeCount.crypto < targetDistribution.crypto) {
    console.log(`⚠️  Crypto: generated ${assetTypeCount.crypto}, target was ${targetDistribution.crypto}`);
  }
  
  // Critical data quality warning
  if (dataQuality.noHistoricalData > 0) {
    console.log(`🚨 WARNING: ${dataQuality.noHistoricalData} candidates skipped due to missing historical data - ideas are based on real data only!`);
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
      const symbolData = filteredMarketData.find(d => d.symbol === catalyst.symbol);
      if (!symbolData) continue;

      const isPositiveCatalyst = catalyst.impact === 'high' || catalyst.eventType === 'earnings';
      const direction: 'long' | 'short' = isPositiveCatalyst ? 'long' : 'short';
      
      const currentPrice = symbolData.currentPrice;
      const entryPrice = Number((currentPrice * 0.998).toFixed(2));
      const targetPrice = Number((currentPrice * (direction === 'long' ? 1.1 : 0.9)).toFixed(2));
      const stopLoss = Number((currentPrice * (direction === 'long' ? 0.95 : 1.05)).toFixed(2));
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
      const { score: confidenceScore, signals: qualitySignals } = calculateConfidenceScore(symbolData, catalystSignal, riskRewardRatio);
      const probabilityBand = getProbabilityBand(confidenceScore);

      // Skip if below quality threshold (lowered to trust catalyst analysis)
      if (confidenceScore < 55) continue;

      // Check for duplicate ideas before creating
      if (storage) {
        const duplicate = await storage.findSimilarTradeIdea(
          catalyst.symbol,
          direction,
          entryPrice,
          24 // Look back 24 hours
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
        probabilityBand: probabilityBand
      };

      ideas.push(idea);
    }
  }

  return ideas;
}
