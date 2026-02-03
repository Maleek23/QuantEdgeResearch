/**
 * 0DTE (Zero Days to Expiration) Trading Utilities
 *
 * Research-backed algorithms for SPX/SPY 0DTE options trading:
 * - VIX-based position sizing
 * - Strike selection based on delta and gamma levels
 * - Risk management calculations
 * - Session-aware entry timing
 */

// ============================================
// POSITION SIZING BASED ON VIX
// ============================================

export interface PositionSizeParams {
  accountSize: number;
  vix: number;
  maxRiskPercent?: number; // Default 1% of account per trade
  sessionPhase?: 'opening' | 'morning' | 'midday' | 'afternoon' | 'power_hour';
}

export interface PositionSizeResult {
  maxDollarRisk: number;
  recommendedContracts: number;
  stopLossPercent: number;
  targetProfitPercent: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  sizeMultiplier: number;
  warnings: string[];
}

export function calculatePositionSize(params: PositionSizeParams): PositionSizeResult {
  const { accountSize, vix, maxRiskPercent = 1, sessionPhase } = params;
  const warnings: string[] = [];

  // Base position sizing from VIX
  let sizeMultiplier: number;
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  let stopLossPercent: number;
  let targetProfitPercent: number;

  if (vix < 15) {
    sizeMultiplier = 1.0;
    riskLevel = 'LOW';
    stopLossPercent = 30; // Tighter stops in low VIX
    targetProfitPercent = 50;
  } else if (vix < 20) {
    sizeMultiplier = 0.75;
    riskLevel = 'MEDIUM';
    stopLossPercent = 40;
    targetProfitPercent = 75;
  } else if (vix < 30) {
    sizeMultiplier = 0.5;
    riskLevel = 'HIGH';
    stopLossPercent = 50;
    targetProfitPercent = 100;
    warnings.push('High VIX environment - reduce position size');
  } else {
    sizeMultiplier = 0.25;
    riskLevel = 'EXTREME';
    stopLossPercent = 60;
    targetProfitPercent = 150;
    warnings.push('EXTREME VIX - consider sitting out or paper trading only');
  }

  // Session phase adjustments
  if (sessionPhase === 'opening') {
    sizeMultiplier *= 0.5; // Half size during first 30 min
    warnings.push('Opening range - wait for confirmation, reduce size');
  } else if (sessionPhase === 'power_hour') {
    sizeMultiplier *= 0.5;
    warnings.push('Power hour - maximum volatility, reduce size');
  } else if (sessionPhase === 'midday') {
    warnings.push('Midday chop zone - lower probability setups');
  }

  // Calculate dollar amounts
  const baseRisk = accountSize * (maxRiskPercent / 100);
  const maxDollarRisk = baseRisk * sizeMultiplier;

  // Estimate contracts based on typical SPX option prices
  // Assuming average option cost of $3-5 per contract ($300-500)
  const avgContractCost = 400;
  const recommendedContracts = Math.max(1, Math.floor(maxDollarRisk / avgContractCost));

  return {
    maxDollarRisk,
    recommendedContracts,
    stopLossPercent,
    targetProfitPercent,
    riskLevel,
    sizeMultiplier,
    warnings,
  };
}

// ============================================
// STRIKE SELECTION
// ============================================

export interface StrikeSelectionParams {
  currentPrice: number;
  gammaFlipLevel?: number;
  direction: 'CALL' | 'PUT';
  strategy: 'ATM' | 'OTM_SCALP' | 'LOTTO';
  timeToClose: number; // Hours until market close
}

export interface StrikeRecommendation {
  recommendedStrike: number;
  deltaTarget: number;
  rationale: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  maxHoldTime: string;
}

export function selectOptimalStrike(params: StrikeSelectionParams): StrikeRecommendation {
  const { currentPrice, gammaFlipLevel, direction, strategy, timeToClose } = params;

  // Round to nearest 5 for SPX
  const roundToStrike = (price: number) => Math.round(price / 5) * 5;
  const atm = roundToStrike(currentPrice);

  let recommendedStrike: number;
  let deltaTarget: number;
  let rationale: string;
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  let maxHoldTime: string;

  switch (strategy) {
    case 'ATM':
      // At-the-money for momentum plays
      recommendedStrike = atm;
      deltaTarget = direction === 'CALL' ? 0.50 : -0.50;
      rationale = 'ATM strike for maximum gamma exposure and liquidity';
      confidence = timeToClose > 2 ? 'HIGH' : 'MEDIUM';
      maxHoldTime = '15-30 minutes';
      break;

    case 'OTM_SCALP':
      // 5-10 points OTM for quick scalps
      const otmOffset = direction === 'CALL' ? 10 : -10;
      recommendedStrike = roundToStrike(currentPrice + otmOffset);
      deltaTarget = direction === 'CALL' ? 0.35 : -0.35;
      rationale = 'Slight OTM for better risk/reward on quick moves';
      confidence = 'MEDIUM';
      maxHoldTime = '5-15 minutes';
      break;

    case 'LOTTO':
      // 20-30 points OTM for high-risk lotto plays
      const lottoOffset = direction === 'CALL' ? 25 : -25;
      recommendedStrike = roundToStrike(currentPrice + lottoOffset);
      deltaTarget = direction === 'CALL' ? 0.15 : -0.15;
      rationale = 'Deep OTM lotto - high risk, potential 200-500% returns';
      confidence = 'LOW';
      maxHoldTime = '30-60 minutes';
      break;

    default:
      recommendedStrike = atm;
      deltaTarget = 0.50;
      rationale = 'Default ATM selection';
      confidence = 'MEDIUM';
      maxHoldTime = '15 minutes';
  }

  // Adjust confidence based on gamma flip
  if (gammaFlipLevel) {
    const aboveGammaFlip = currentPrice > gammaFlipLevel;
    if (direction === 'CALL' && aboveGammaFlip) {
      // Calls above gamma flip - dealers buying dips supports calls on pullbacks
      rationale += ' | Above gamma flip - mean reversion environment';
    } else if (direction === 'PUT' && !aboveGammaFlip) {
      // Puts below gamma flip - negative gamma amplifies down moves
      rationale += ' | Below gamma flip - momentum favors puts';
      confidence = confidence === 'LOW' ? 'LOW' : 'HIGH';
    }
  }

  // Time decay warning
  if (timeToClose < 1) {
    rationale += ' | WARNING: < 1hr to close - extreme theta decay';
    maxHoldTime = '5 minutes max';
  }

  return {
    recommendedStrike,
    deltaTarget,
    rationale,
    confidence,
    maxHoldTime,
  };
}

// ============================================
// ENTRY TIMING
// ============================================

export type SessionPhase = 'premarket' | 'opening' | 'morning' | 'midday' | 'afternoon' | 'power_hour' | 'closed';

export interface EntryTiming {
  phase: SessionPhase;
  isGoodEntry: boolean;
  waitTime: string;
  reason: string;
  tradingStyle: string;
}

export function evaluateEntryTiming(currentTimeET: Date): EntryTiming {
  const hours = currentTimeET.getHours();
  const minutes = currentTimeET.getMinutes();
  const time = hours + minutes / 60;
  const day = currentTimeET.getDay();

  // Weekend
  if (day === 0 || day === 6) {
    return {
      phase: 'closed',
      isGoodEntry: false,
      waitTime: 'Until Monday 9:30 AM ET',
      reason: 'Markets closed for weekend',
      tradingStyle: 'N/A',
    };
  }

  // Pre-market
  if (time < 9.5) {
    return {
      phase: 'premarket',
      isGoodEntry: false,
      waitTime: `${Math.floor((9.5 - time) * 60)} minutes`,
      reason: 'Wait for cash session open',
      tradingStyle: 'Prepare levels, watch futures',
    };
  }

  // Opening range (9:30-10:00)
  if (time < 10) {
    return {
      phase: 'opening',
      isGoodEntry: false,
      waitTime: `${Math.floor((10 - time) * 60)} minutes`,
      reason: 'Opening range forming - wait for 10:00 AM confirmation',
      tradingStyle: 'Wait for OR breakout confirmation',
    };
  }

  // Morning session (10:00-12:00)
  if (time < 12) {
    return {
      phase: 'morning',
      isGoodEntry: true,
      waitTime: 'Now',
      reason: 'Prime trading window - trends develop, good volume',
      tradingStyle: 'Momentum trades, breakout plays',
    };
  }

  // Midday (12:00-14:00)
  if (time < 14) {
    return {
      phase: 'midday',
      isGoodEntry: false,
      waitTime: `${Math.floor((14 - time) * 60)} minutes until afternoon`,
      reason: 'Low volume chop zone - higher chance of whipsaws',
      tradingStyle: 'Scalps only, or wait for 2 PM',
    };
  }

  // Afternoon (14:00-15:00)
  if (time < 15) {
    return {
      phase: 'afternoon',
      isGoodEntry: true,
      waitTime: 'Now',
      reason: 'Institutional positioning begins - trends can resume',
      tradingStyle: 'Trend continuation, watch for breakouts',
    };
  }

  // Power hour (15:00-16:00)
  if (time < 16) {
    return {
      phase: 'power_hour',
      isGoodEntry: true,
      waitTime: 'Now - HIGH RISK',
      reason: 'Maximum gamma exposure - extreme moves possible',
      tradingStyle: 'Quick scalps, tight stops, reduced size',
    };
  }

  // After hours
  return {
    phase: 'closed',
    isGoodEntry: false,
    waitTime: 'Until next day 9:30 AM ET',
    reason: 'Cash market closed',
    tradingStyle: 'Review trades, prepare for tomorrow',
  };
}

// ============================================
// RISK MANAGEMENT
// ============================================

export interface RiskMetrics {
  maxLossPerTrade: number;
  dailyLossLimit: number;
  currentDailyPnL: number;
  tradesRemaining: number;
  shouldTrade: boolean;
  stopReason?: string;
}

export function calculateRiskMetrics(
  accountSize: number,
  dailyPnL: number,
  tradesExecuted: number,
  maxDailyTrades: number = 5,
  maxDailyLossPercent: number = 3
): RiskMetrics {
  const dailyLossLimit = accountSize * (maxDailyLossPercent / 100);
  const maxLossPerTrade = dailyLossLimit / maxDailyTrades;
  const tradesRemaining = maxDailyTrades - tradesExecuted;

  let shouldTrade = true;
  let stopReason: string | undefined;

  // Check if daily loss limit hit
  if (dailyPnL <= -dailyLossLimit) {
    shouldTrade = false;
    stopReason = `Daily loss limit hit: $${Math.abs(dailyPnL).toFixed(2)} lost`;
  }

  // Check if max trades reached
  if (tradesRemaining <= 0) {
    shouldTrade = false;
    stopReason = `Maximum daily trades (${maxDailyTrades}) reached`;
  }

  // Warning if close to limit
  if (dailyPnL < 0 && Math.abs(dailyPnL) > dailyLossLimit * 0.7) {
    stopReason = `Warning: 70% of daily loss limit used`;
  }

  return {
    maxLossPerTrade,
    dailyLossLimit,
    currentDailyPnL: dailyPnL,
    tradesRemaining,
    shouldTrade,
    stopReason,
  };
}

// ============================================
// GAMMA LEVEL UTILITIES
// ============================================

export interface GammaLevelAnalysis {
  zone: 'POSITIVE' | 'NEGATIVE' | 'TRANSITION';
  dealerBehavior: string;
  tradingBias: 'MEAN_REVERSION' | 'MOMENTUM' | 'NEUTRAL';
  confidence: number;
  keyLevels: {
    gammaFlip: number;
    majorSupport: number;
    majorResistance: number;
  };
}

export function analyzeGammaLevels(
  currentPrice: number,
  gammaFlipLevel: number,
  highGEX?: number,
  lowGEX?: number
): GammaLevelAnalysis {
  const distanceFromFlip = ((currentPrice - gammaFlipLevel) / gammaFlipLevel) * 100;

  let zone: 'POSITIVE' | 'NEGATIVE' | 'TRANSITION';
  let dealerBehavior: string;
  let tradingBias: 'MEAN_REVERSION' | 'MOMENTUM' | 'NEUTRAL';
  let confidence: number;

  if (distanceFromFlip > 0.5) {
    zone = 'POSITIVE';
    dealerBehavior = 'Dealers are long gamma - they buy dips and sell rips, dampening moves';
    tradingBias = 'MEAN_REVERSION';
    confidence = Math.min(0.8, 0.5 + distanceFromFlip / 5);
  } else if (distanceFromFlip < -0.5) {
    zone = 'NEGATIVE';
    dealerBehavior = 'Dealers are short gamma - they must sell into drops and buy into rallies, amplifying moves';
    tradingBias = 'MOMENTUM';
    confidence = Math.min(0.8, 0.5 + Math.abs(distanceFromFlip) / 5);
  } else {
    zone = 'TRANSITION';
    dealerBehavior = 'Near gamma flip - unstable zone, expect volatility';
    tradingBias = 'NEUTRAL';
    confidence = 0.4;
  }

  return {
    zone,
    dealerBehavior,
    tradingBias,
    confidence,
    keyLevels: {
      gammaFlip: gammaFlipLevel,
      majorSupport: lowGEX || gammaFlipLevel - 30,
      majorResistance: highGEX || gammaFlipLevel + 30,
    },
  };
}

// ============================================
// QUICK HELPERS
// ============================================

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function getETNow(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

export function getTimeToClose(): number {
  const et = getETNow();
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const closingTime = 16; // 4 PM ET

  if (hours >= closingTime) return 0;
  return closingTime - hours - minutes / 60;
}
