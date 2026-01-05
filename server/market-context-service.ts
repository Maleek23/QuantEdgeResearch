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

  // FORCED TRUE FOR TESTING - always allow trading
  const shouldTrade = true;

  if (!shouldTrade) {
    reasons.push(`⛔ Skip trading: Score ${score} < 30 or volatile regime`);
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
  // FORCED TRUE FOR TESTING - Remove after testing
  return { 
    shouldEnterNow: true, 
    reason: `✅ FORCED_ENTRY_FOR_TESTING` 
  };
  
  /* ORIGINAL LOGIC - UNCOMMENT AFTER TESTING
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
  */
}

export interface DynamicExitSignal {
  shouldExit: boolean;
  exitType: 'trailing_stop' | 'time_decay' | 'momentum_fade' | 'regime_shift' | 'partial_profit' | 'none';
  reason: string;
  suggestedExitPrice?: number;
  partialExitPercent?: number; // For partial profit taking (e.g., 50% of position)
}

// Trade lifecycle phases for smarter exits
type TradePhase = 'discovery' | 'expansion' | 'distribution' | 'decline';

function getTradePhase(pnlPercent: number, fromHigh: number): TradePhase {
  // Discovery: Just entered, small gains/losses
  if (pnlPercent >= -10 && pnlPercent <= 20) return 'discovery';
  // Expansion: Solid gains, still near highs
  if (pnlPercent > 20 && fromHigh > -10) return 'expansion';
  // Distribution: High gains but pulling back from peak
  if (pnlPercent > 15 && fromHigh <= -10) return 'distribution';
  // Decline: Losing or gave back most gains
  return 'decline';
}

// Adaptive trailing stop based on profit level and volatility
function getAdaptiveTrailingStop(pnlPercent: number, daysToExpiry: number, isVolatile: boolean): number {
  // Base trailing stop percentage (how much pullback from high triggers exit)
  let trailingStop: number;
  
  if (pnlPercent >= 100) {
    // 100%+ gains: Very tight stop to lock in massive gains
    trailingStop = isVolatile ? -15 : -12;
  } else if (pnlPercent >= 75) {
    // 75%+ gains: Tight stop
    trailingStop = isVolatile ? -18 : -15;
  } else if (pnlPercent >= 50) {
    // 50%+ gains: Moderate stop
    trailingStop = isVolatile ? -22 : -18;
  } else if (pnlPercent >= 30) {
    // 30%+ gains: Looser stop to let winners run
    trailingStop = isVolatile ? -28 : -25;
  } else {
    // Under 30%: Wide stop, still in discovery phase
    trailingStop = isVolatile ? -35 : -30;
  }
  
  // Tighten stops as expiry approaches (theta risk)
  if (daysToExpiry <= 1) {
    trailingStop = trailingStop * 0.6; // 40% tighter
  } else if (daysToExpiry <= 3) {
    trailingStop = trailingStop * 0.8; // 20% tighter
  }
  
  return trailingStop;
}

// Get profit milestone for partial exits
function shouldTakePartialProfit(pnlPercent: number, fromHigh: number, daysToExpiry: number): { take: boolean; percent: number; reason: string } | null {
  // Take 50% off at 100%+ gains if pulling back
  if (pnlPercent >= 100 && fromHigh <= -8) {
    return { take: true, percent: 50, reason: `💰 PARTIAL: +${pnlPercent.toFixed(0)}% gains, take 50% off to lock in profits` };
  }
  
  // Take 30% off at 75%+ gains with 2 DTE or less
  if (pnlPercent >= 75 && daysToExpiry <= 2) {
    return { take: true, percent: 30, reason: `⏰ PARTIAL: +${pnlPercent.toFixed(0)}% with ${daysToExpiry} DTE, take 30% off` };
  }
  
  // Take 25% off at 50%+ gains if momentum fading
  if (pnlPercent >= 50 && fromHigh <= -12) {
    return { take: true, percent: 25, reason: `📉 PARTIAL: Momentum fading from peak, take 25% off` };
  }
  
  return null;
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
  const peakGain = highestPrice > 0 ? ((highestPrice - entryPrice) / entryPrice) * 100 : 0;
  
  const isCall = optionType === 'call';
  const regimeBad = (isCall && marketContext.regime === 'trending_down') || 
                    (!isCall && marketContext.regime === 'trending_up');
  const isVolatile = marketContext.regime === 'volatile';
  const phase = getTradePhase(pnlPercent, fromHigh);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🛑 STOP LOSS RULES (protect capital)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Hard stop: -40% (absolute floor)
  if (pnlPercent <= -40) {
    return {
      shouldExit: true,
      exitType: 'trailing_stop',
      reason: `⛔ HARD STOP: Down ${Math.abs(pnlPercent).toFixed(0)}% - cutting loss`,
      suggestedExitPrice: currentPrice,
    };
  }

  // Time-based stop: Exit losers before expiry accelerates losses
  if (pnlPercent <= -20 && daysToExpiry <= 2) {
    return {
      shouldExit: true,
      exitType: 'time_decay',
      reason: `⛔ TIME STOP: Down ${Math.abs(pnlPercent).toFixed(0)}% with ${daysToExpiry} DTE - theta risk`,
      suggestedExitPrice: currentPrice,
    };
  }

  // Regime stop: Market turned against us while losing
  if (regimeBad && pnlPercent <= -15) {
    return {
      shouldExit: true,
      exitType: 'regime_shift',
      reason: `⛔ REGIME STOP: ${marketContext.regime} + down ${Math.abs(pnlPercent).toFixed(0)}%`,
      suggestedExitPrice: currentPrice,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 💰 PROFIT PROTECTION RULES (maximize gains)
  // ═══════════════════════════════════════════════════════════════════════════

  // Check for partial profit opportunity - for now, treat as full exit recommendation
  // Future: implement position scaling to only exit partialExitPercent of position
  const partialProfit = shouldTakePartialProfit(pnlPercent, fromHigh, daysToExpiry);
  if (partialProfit) {
    return {
      shouldExit: true,
      exitType: 'trailing_stop', // Use existing exit type until execution layer supports partial
      reason: `${partialProfit.reason} (recommend ${partialProfit.percent}% exit)`,
      suggestedExitPrice: currentPrice,
      partialExitPercent: partialProfit.percent, // Future: use for scaling
    };
  }

  // ADAPTIVE TRAILING STOP: Tighter as gains increase, tighter near expiry
  const trailingThreshold = getAdaptiveTrailingStop(pnlPercent, daysToExpiry, isVolatile);
  
  if (pnlPercent > 25 && fromHigh < trailingThreshold) {
    return {
      shouldExit: true,
      exitType: 'trailing_stop',
      reason: `🎯 TRAILING STOP: Was +${peakGain.toFixed(0)}%, now +${pnlPercent.toFixed(0)}% (${fromHigh.toFixed(0)}% pullback, threshold ${trailingThreshold.toFixed(0)}%)`,
      suggestedExitPrice: currentPrice,
    };
  }

  // 0DTE/1DTE: Take any meaningful profit to avoid overnight/expiry risk
  if (daysToExpiry <= 1 && pnlPercent > 10) {
    return {
      shouldExit: true,
      exitType: 'time_decay',
      reason: `⏰ ${daysToExpiry}DTE EXIT: Lock in +${pnlPercent.toFixed(0)}% before theta decay`,
      suggestedExitPrice: currentPrice,
    };
  }

  // Expiring today with any gains - exit immediately
  if (daysToExpiry <= 0 && pnlPercent > 0) {
    return {
      shouldExit: true,
      exitType: 'time_decay',
      reason: `🚨 0DTE: Expiring today, taking +${pnlPercent.toFixed(0)}%`,
      suggestedExitPrice: currentPrice,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 📉 MOMENTUM FADE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  // Distribution phase with regime shift - take profits
  if (phase === 'distribution' && regimeBad && pnlPercent > 15) {
    return {
      shouldExit: true,
      exitType: 'momentum_fade',
      reason: `📉 DISTRIBUTION + REGIME: Market turned ${marketContext.regime}, take +${pnlPercent.toFixed(0)}%`,
      suggestedExitPrice: currentPrice,
    };
  }

  // Gave back 50%+ of peak gains - momentum clearly fading
  if (peakGain >= 40 && pnlPercent < peakGain * 0.5 && pnlPercent > 15) {
    return {
      shouldExit: true,
      exitType: 'momentum_fade',
      reason: `📉 MOMENTUM FADE: Peaked at +${peakGain.toFixed(0)}%, now only +${pnlPercent.toFixed(0)}%`,
      suggestedExitPrice: currentPrice,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ HOLD - LET WINNERS RUN
  // ═══════════════════════════════════════════════════════════════════════════

  // Still in expansion phase with momentum - let it ride
  if (phase === 'expansion' && !regimeBad) {
    return {
      shouldExit: false,
      exitType: 'none',
      reason: `🚀 EXPANSION: +${pnlPercent.toFixed(0)}%, ${Math.abs(fromHigh).toFixed(0)}% off high - let it run`,
    };
  }

  return {
    shouldExit: false,
    exitType: 'none',
    reason: `📊 HOLD: Phase=${phase}, PnL=+${pnlPercent.toFixed(0)}%, ${daysToExpiry} DTE`,
  };
}
