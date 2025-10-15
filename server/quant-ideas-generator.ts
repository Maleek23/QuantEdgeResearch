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

// Main function to generate quantitative trade ideas
export async function generateQuantIdeas(
  marketData: MarketData[],
  catalysts: Catalyst[],
  count: number = 8
): Promise<InsertTradeIdea[]> {
  const ideas: InsertTradeIdea[] = [];
  const timezone = 'America/Chicago';
  const now = new Date();

  // Analyze each market data point
  for (const data of marketData) {
    if (ideas.length >= count) break;

    const signal = analyzeMarketData(data);
    if (!signal) continue;

    const levels = calculateLevels(data, signal);
    const catalyst = generateCatalyst(data, signal, catalysts);
    const analysis = generateAnalysis(data, signal);

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

    // Calculate risk/reward ratio
    const riskRewardRatio = (levels.targetPrice - levels.entryPrice) / (levels.entryPrice - levels.stopLoss);

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
        ? formatInTimeZone(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), timezone, 'yyyy-MM-dd')
        : undefined
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

      // Generate session context string
      const sessionContext = symbolData.session === 'rth' 
        ? 'Regular Trading Hours' 
        : symbolData.session === 'pre-market' 
          ? 'Pre-Market' 
          : symbolData.session === 'after-hours'
            ? 'After Hours'
            : 'Market Closed';

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
        liquidityWarning: entryPrice < 5
      };

      ideas.push(idea);
    }
  }

  return ideas;
}
