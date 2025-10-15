// Quantitative rules-based trade idea generator
// No AI required - uses technical analysis and market patterns

import type { MarketData, Catalyst, InsertTradeIdea } from "@shared/schema";
import { formatInTimeZone } from 'date-fns-tz';

interface QuantSignal {
  type: 'momentum' | 'volume_spike' | 'breakout' | 'mean_reversion' | 'catalyst_driven';
  strength: 'strong' | 'moderate';
  direction: 'long' | 'short';
}

// Analyze market data for quantitative signals
function analyzeMarketData(data: MarketData): QuantSignal | null {
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

  // Moderate momentum (3-5% move)
  if (Math.abs(priceChange) >= 3 && volumeRatio >= 1.2) {
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

  return null;
}

// Calculate entry, target, and stop based on signal type
function calculateLevels(data: MarketData, signal: QuantSignal) {
  const currentPrice = data.currentPrice;
  const priceChange = data.changePercent;
  
  let entryPrice = currentPrice;
  let targetPrice: number;
  let stopLoss: number;

  if (signal.type === 'momentum') {
    // Momentum trade - ride the trend
    if (signal.direction === 'long') {
      entryPrice = currentPrice * 0.995; // slight pullback entry
      targetPrice = currentPrice * 1.08; // 8% target
      stopLoss = currentPrice * 0.96; // 4% stop
    } else {
      entryPrice = currentPrice * 1.005;
      targetPrice = currentPrice * 0.92; // 8% target
      stopLoss = currentPrice * 1.04; // 4% stop
    }
  } else if (signal.type === 'volume_spike') {
    // Volume breakout
    if (signal.direction === 'long') {
      entryPrice = currentPrice;
      targetPrice = currentPrice * 1.12; // 12% target
      stopLoss = currentPrice * 0.94; // 6% stop
    } else {
      entryPrice = currentPrice;
      targetPrice = currentPrice * 0.88;
      stopLoss = currentPrice * 1.06;
    }
  } else if (signal.type === 'breakout') {
    // Breakout trade - momentum continuation
    if (signal.direction === 'long') {
      entryPrice = currentPrice * 1.005; // enter on strength
      targetPrice = currentPrice * 1.15; // 15% target
      stopLoss = currentPrice * 0.96; // 4% stop
    } else {
      entryPrice = currentPrice * 0.995; // enter on weakness
      targetPrice = currentPrice * 0.85; // 15% target
      stopLoss = currentPrice * 1.04; // 4% stop
    }
  } else if (signal.type === 'mean_reversion') {
    // Mean reversion - contrarian
    if (signal.direction === 'long') {
      entryPrice = currentPrice * 0.99; // buy the dip
      targetPrice = currentPrice * 1.15; // bounce target
      stopLoss = currentPrice * 0.92; // 8% stop
    } else {
      entryPrice = currentPrice * 1.01;
      targetPrice = currentPrice * 0.85;
      stopLoss = currentPrice * 1.08;
    }
  } else {
    // Default case
    if (signal.direction === 'long') {
      entryPrice = currentPrice;
      targetPrice = currentPrice * 1.1;
      stopLoss = currentPrice * 0.95;
    } else {
      entryPrice = currentPrice;
      targetPrice = currentPrice * 0.9;
      stopLoss = currentPrice * 1.05;
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
  riskRewardRatio: number
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
  } else {
    score += 10;
    qualitySignals.push('Moderate Signal');
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

  return { score: Math.min(score, 100), signals: qualitySignals };
}

// Calculate probability band based on confidence score
function getProbabilityBand(score: number): string {
  if (score >= 80) return 'A'; // 80-100: High probability (80%+)
  if (score >= 70) return 'B'; // 70-79: Good probability (70-79%)
  return 'C'; // Below 70: Lower probability (<70%)
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
  count: number = 8
): Promise<InsertTradeIdea[]> {
  const ideas: InsertTradeIdea[] = [];
  const timezone = 'America/Chicago';
  const now = new Date();

  // Sort market data by gem score (highest first) to prioritize interesting opportunities
  const sortedData = [...marketData].sort((a, b) => calculateGemScore(b) - calculateGemScore(a));

  // Analyze each market data point
  for (const data of sortedData) {
    if (ideas.length >= count) break;

    const signal = analyzeMarketData(data);
    if (!signal) continue;

    const levels = calculateLevels(data, signal);
    const catalyst = generateCatalyst(data, signal, catalysts);
    const analysis = generateAnalysis(data, signal);

    // Calculate risk/reward ratio
    const riskRewardRatio = (levels.targetPrice - levels.entryPrice) / (levels.entryPrice - levels.stopLoss);

    // Calculate confidence score and quality signals
    const { score: confidenceScore, signals: qualitySignals } = calculateConfidenceScore(data, signal, riskRewardRatio);
    const probabilityBand = getProbabilityBand(confidenceScore);

    // QUALITY FILTER: Only accept ideas with 70+ confidence (B grade or better)
    if (confidenceScore < 70) {
      continue; // Skip low-quality ideas
    }

    // Additional hard guards for quality
    if (riskRewardRatio < 1.5) continue; // Minimum R:R requirement
    const volumeRatio = data.volume && data.avgVolume ? data.volume / data.avgVolume : 1;
    if (volumeRatio < 1.2) continue; // Minimum volume confirmation

    // Determine asset type for options vs shares
    const assetType = data.assetType === 'stock' && Math.random() > 0.5 ? 'option' : data.assetType;

    // Generate session context string
    const sessionContext = data.session === 'rth' 
      ? 'Regular Trading Hours' 
      : data.session === 'pre-market' 
        ? 'Pre-Market' 
        : data.session === 'after-hours'
          ? 'After Hours'
          : 'Market Closed';

    // For options, calculate strike price and determine call/put based on direction and price action
    const strikePrice = assetType === 'option' 
      ? (signal.direction === 'long' 
          ? Math.round(data.currentPrice * 1.02) // Slightly OTM call for bullish
          : Math.round(data.currentPrice * 0.98)) // Slightly OTM put for bearish
      : undefined;
    
    const optionType = assetType === 'option'
      ? (signal.direction === 'long' ? 'call' : 'put')
      : undefined;

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
      liquidityWarning: levels.entryPrice < 5,
      expiryDate: assetType === 'option' 
        ? formatInTimeZone(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), timezone, 'MMM d, yyyy')
        : undefined,
      strikePrice: strikePrice,
      optionType: optionType,
      source: 'quant',
      confidenceScore: Math.round(confidenceScore),
      qualitySignals: qualitySignals,
      probabilityBand: probabilityBand
    };

    ideas.push(idea);
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
      
      // Find market data for this symbol
      const symbolData = marketData.find(d => d.symbol === catalyst.symbol);
      if (!symbolData) continue;

      const isPositiveCatalyst = catalyst.impact === 'high' || catalyst.eventType === 'earnings';
      const direction: 'long' | 'short' = isPositiveCatalyst ? 'long' : 'short';
      
      const currentPrice = symbolData.currentPrice;
      const entryPrice = Number((currentPrice * 0.998).toFixed(2));
      const targetPrice = Number((currentPrice * (direction === 'long' ? 1.1 : 0.9)).toFixed(2));
      const stopLoss = Number((currentPrice * (direction === 'long' ? 0.95 : 1.05)).toFixed(2));
      const riskRewardRatio = (targetPrice - entryPrice) / (entryPrice - stopLoss);

      // Quality check for catalyst ideas
      if (riskRewardRatio < 1.5) continue; // Skip if R:R too low

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

      // Skip if below quality threshold
      if (confidenceScore < 70) continue;

      const idea: InsertTradeIdea = {
        symbol: catalyst.symbol,
        assetType: 'stock',
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
