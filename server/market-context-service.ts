import { getTradierQuote } from "./tradier-api";
import { logger } from "./logger";

export interface MarketContext {
  regime: 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
  riskSentiment: 'risk_on' | 'risk_off' | 'neutral';
  score: number;
  shouldTrade: boolean;
  reasons: string[];
  spyData: { price: number; change: number; relativeVolume: number } | null;
  vixLevel: number | null;
  timestamp: Date;
}

interface QuoteData {
  last: number;
  change_percentage: number;
  volume: number;
  average_volume: number;
  high: number;
  low: number;
  week_52_high: number;
  week_52_low: number;
}

let cachedContext: MarketContext | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getMarketContext(forceRefresh = false): Promise<MarketContext> {
  const now = Date.now();
  
  if (!forceRefresh && cachedContext && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedContext;
  }

  try {
    const [spyQuote, qqqQuote, vixQuote] = await Promise.all([
      getTradierQuote('SPY').catch(() => null),
      getTradierQuote('QQQ').catch(() => null),
      getTradierQuote('VIX').catch(() => null),
    ]) as [QuoteData | null, QuoteData | null, QuoteData | null];

    const context = analyzeMarketConditions(spyQuote, qqqQuote, vixQuote);
    
    cachedContext = context;
    lastFetchTime = now;
    
    logger.info(`📊 [MARKET] Regime: ${context.regime}, Sentiment: ${context.riskSentiment}, Score: ${context.score}, Trade: ${context.shouldTrade}`);
    
    return context;
  } catch (error) {
    logger.error("📊 [MARKET] Failed to fetch market context:", error);
    
    return {
      regime: 'ranging',
      riskSentiment: 'neutral',
      score: 50,
      shouldTrade: true,
      reasons: ['Market data unavailable - using neutral defaults'],
      spyData: null,
      vixLevel: null,
      timestamp: new Date(),
    };
  }
}

function analyzeMarketConditions(
  spy: QuoteData | null,
  qqq: QuoteData | null,
  vix: QuoteData | null
): MarketContext {
  const reasons: string[] = [];
  let score = 50;
  let regime: MarketContext['regime'] = 'ranging';
  let riskSentiment: MarketContext['riskSentiment'] = 'neutral';

  if (!spy) {
    return {
      regime: 'ranging',
      riskSentiment: 'neutral',
      score: 50,
      shouldTrade: true,
      reasons: ['SPY data unavailable'],
      spyData: null,
      vixLevel: null,
      timestamp: new Date(),
    };
  }

  const spyChange = spy.change_percentage || 0;
  const qqqChange = qqq?.change_percentage || 0;
  const spyRelVol = spy.average_volume > 0 ? spy.volume / spy.average_volume : 1;
  const vixLevel = vix?.last || null;
  const spyRange = spy.high > 0 && spy.low > 0 ? ((spy.high - spy.low) / spy.low) * 100 : 0;

  if (spyChange > 0.8 && qqqChange > 0.8) {
    regime = 'trending_up';
    score += 20;
    reasons.push(`Strong uptrend: SPY +${spyChange.toFixed(1)}%, QQQ +${qqqChange.toFixed(1)}%`);
  } else if (spyChange < -0.8 && qqqChange < -0.8) {
    regime = 'trending_down';
    score += 10;
    reasons.push(`Downtrend: SPY ${spyChange.toFixed(1)}%, QQQ ${qqqChange.toFixed(1)}%`);
  } else if (Math.abs(spyChange) < 0.3 && Math.abs(qqqChange) < 0.3) {
    regime = 'ranging';
    score -= 10;
    reasons.push(`Low movement: SPY ${spyChange.toFixed(2)}%, QQQ ${qqqChange.toFixed(2)}%`);
  }

  if (spyRange > 1.5 || (vixLevel && vixLevel > 25)) {
    regime = 'volatile';
    reasons.push(`High volatility: Range ${spyRange.toFixed(1)}%${vixLevel ? `, VIX ${vixLevel.toFixed(1)}` : ''}`);
  }

  if (vixLevel) {
    if (vixLevel < 15) {
      riskSentiment = 'risk_on';
      score += 15;
      reasons.push(`Low VIX (${vixLevel.toFixed(1)}) = Risk-on environment`);
    } else if (vixLevel > 25) {
      riskSentiment = 'risk_off';
      score -= 15;
      reasons.push(`High VIX (${vixLevel.toFixed(1)}) = Risk-off/Fear`);
    } else if (vixLevel > 20) {
      score -= 5;
      reasons.push(`Elevated VIX (${vixLevel.toFixed(1)})`);
    }
  }

  if (spyRelVol > 1.5) {
    score += 10;
    reasons.push(`High SPY volume (${spyRelVol.toFixed(1)}x avg)`);
  } else if (spyRelVol < 0.7) {
    score -= 10;
    reasons.push(`Low SPY volume (${spyRelVol.toFixed(1)}x avg) - thin market`);
  }

  const correlation = (spyChange > 0 && qqqChange > 0) || (spyChange < 0 && qqqChange < 0);
  if (correlation && Math.abs(spyChange) > 0.5) {
    score += 5;
    reasons.push('SPY/QQQ correlated - clear direction');
  } else if (!correlation && Math.abs(spyChange - qqqChange) > 1) {
    score -= 10;
    reasons.push('SPY/QQQ diverging - mixed signals');
  }

  const shouldTrade = score >= 45 && regime !== 'volatile';

  if (!shouldTrade) {
    reasons.push(`⛔ Skip trading: Score ${score} < 45 or volatile regime`);
  }

  return {
    regime,
    riskSentiment,
    score: Math.max(0, Math.min(100, score)),
    shouldTrade,
    reasons,
    spyData: {
      price: spy.last,
      change: spyChange,
      relativeVolume: spyRelVol,
    },
    vixLevel,
    timestamp: new Date(),
  };
}

export function getEntryTiming(
  quote: QuoteData,
  optionType: 'call' | 'put',
  marketContext: MarketContext
): { shouldEnterNow: boolean; reason: string } {
  const priceChange = quote.change_percentage || 0;
  const relVol = quote.average_volume > 0 ? quote.volume / quote.average_volume : 1;
  const isCall = optionType === 'call';
  
  const momentumAligned = isCall ? priceChange > 0 : priceChange < 0;
  
  if (!momentumAligned && Math.abs(priceChange) > 1) {
    return { 
      shouldEnterNow: false, 
      reason: `Counter-momentum: ${priceChange.toFixed(1)}% move against ${optionType}` 
    };
  }

  if (relVol < 0.8) {
    return { 
      shouldEnterNow: false, 
      reason: `Low volume (${relVol.toFixed(1)}x) - wait for confirmation` 
    };
  }

  if (marketContext.regime === 'volatile' && Math.abs(priceChange) > 3) {
    return { 
      shouldEnterNow: false, 
      reason: `Volatile market with ${priceChange.toFixed(1)}% move - wait for stabilization` 
    };
  }

  if (momentumAligned && Math.abs(priceChange) >= 1 && relVol >= 1.2) {
    return { 
      shouldEnterNow: true, 
      reason: `✅ Entry: ${optionType.toUpperCase()} aligned with ${priceChange.toFixed(1)}% move, ${relVol.toFixed(1)}x volume` 
    };
  }

  if (marketContext.regime === 'trending_up' && isCall) {
    return { 
      shouldEnterNow: true, 
      reason: `✅ Entry: Uptrend regime favors calls` 
    };
  }
  
  if (marketContext.regime === 'trending_down' && !isCall) {
    return { 
      shouldEnterNow: true, 
      reason: `✅ Entry: Downtrend regime favors puts` 
    };
  }

  return { 
    shouldEnterNow: relVol >= 1.0 && marketContext.shouldTrade, 
    reason: `Neutral conditions - proceed with caution` 
  };
}

export interface DynamicExitSignal {
  shouldExit: boolean;
  exitType: 'trailing_stop' | 'time_decay' | 'momentum_fade' | 'regime_shift' | 'none';
  reason: string;
  suggestedExitPrice?: number;
}

export function checkDynamicExit(
  currentPrice: number,
  entryPrice: number,
  highestPrice: number,
  daysToExpiry: number,
  optionType: 'call' | 'put',
  marketContext: MarketContext
): DynamicExitSignal {
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const fromHigh = highestPrice > 0 ? ((currentPrice - highestPrice) / highestPrice) * 100 : 0;

  if (pnlPercent > 30 && fromHigh < -20) {
    return {
      shouldExit: true,
      exitType: 'trailing_stop',
      reason: `Trailing stop: Up ${pnlPercent.toFixed(0)}% but dropped ${Math.abs(fromHigh).toFixed(0)}% from high`,
      suggestedExitPrice: currentPrice,
    };
  }

  if (daysToExpiry <= 1 && pnlPercent > 15) {
    return {
      shouldExit: true,
      exitType: 'time_decay',
      reason: `Time exit: ${daysToExpiry} DTE with +${pnlPercent.toFixed(0)}% profit - lock it in`,
      suggestedExitPrice: currentPrice,
    };
  }

  if (daysToExpiry <= 0 && pnlPercent > 0) {
    return {
      shouldExit: true,
      exitType: 'time_decay',
      reason: `0DTE exit: Expiring today with +${pnlPercent.toFixed(0)}% profit`,
      suggestedExitPrice: currentPrice,
    };
  }

  const isCall = optionType === 'call';
  const regimeBad = (isCall && marketContext.regime === 'trending_down') || 
                    (!isCall && marketContext.regime === 'trending_up');
  
  if (regimeBad && pnlPercent > 10) {
    return {
      shouldExit: true,
      exitType: 'regime_shift',
      reason: `Regime shift: Market now ${marketContext.regime}, taking +${pnlPercent.toFixed(0)}% profit`,
      suggestedExitPrice: currentPrice,
    };
  }

  if (pnlPercent > 50 && fromHigh < -10) {
    return {
      shouldExit: true,
      exitType: 'momentum_fade',
      reason: `Momentum fading: Was +${((highestPrice - entryPrice) / entryPrice * 100).toFixed(0)}%, now +${pnlPercent.toFixed(0)}%`,
      suggestedExitPrice: currentPrice,
    };
  }

  return {
    shouldExit: false,
    exitType: 'none',
    reason: 'Hold position',
  };
}
