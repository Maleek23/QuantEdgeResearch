import { storage } from "./storage";
import { logger } from "./logger";
import { fetchStockPrice } from "./market-api";
import { getRealtimeQuote } from "./realtime-pricing-service";
import type { PaperPosition } from "@shared/schema";

export interface ExitAdvisory {
  positionId: string;
  symbol: string;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  
  exitWindow: 'immediate' | 'soon' | 'hold' | 'watch';
  exitProbability: number;
  exitReason: string;
  exitTimeEstimate: string;
  
  momentum: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  momentumScore: number;
  
  dteRemaining: number | null;
  thetaUrgency: 'critical' | 'high' | 'moderate' | 'low';
  
  riskRewardCurrent: number;
  distanceToTarget: number;
  distanceToStop: number;
  
  signals: string[];
  lastUpdated: string;
}

export interface PositionMonitorState {
  portfolioId: string;
  positions: ExitAdvisory[];
  lastRefresh: string;
  marketStatus: 'open' | 'closed' | 'pre_market' | 'after_hours';
}

const priceCache = new Map<string, { price: number; timestamp: number }>();
const PRICE_CACHE_TTL = 30000;

async function getCachedPrice(symbol: string): Promise<number | null> {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }
  
  try {
    const quote = await getRealtimeQuote(symbol, 'stock');
    if (quote?.price) {
      priceCache.set(symbol, { price: quote.price, timestamp: Date.now() });
      return quote.price;
    }
  } catch (e) {
  }
  
  try {
    const data = await fetchStockPrice(symbol);
    if (data?.currentPrice) {
      priceCache.set(symbol, { price: data.currentPrice, timestamp: Date.now() });
      return data.currentPrice;
    }
  } catch (e) {
  }
  
  return cached?.price || null;
}

function calculateDTE(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function calculateThetaUrgency(dte: number | null): 'critical' | 'high' | 'moderate' | 'low' {
  if (dte === null) return 'low';
  if (dte <= 1) return 'critical';
  if (dte <= 3) return 'high';
  if (dte <= 7) return 'moderate';
  return 'low';
}

function calculateMomentum(
  currentPrice: number,
  entryPrice: number,
  targetPrice: number,
  stopLoss: number
): { momentum: ExitAdvisory['momentum']; score: number } {
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const targetDistance = ((targetPrice - currentPrice) / currentPrice) * 100;
  const stopDistance = ((currentPrice - stopLoss) / currentPrice) * 100;
  
  const score = pnlPercent * 2 + (stopDistance > 0 ? stopDistance : -10);
  
  if (pnlPercent >= 50) return { momentum: 'strong_bullish', score };
  if (pnlPercent >= 20) return { momentum: 'bullish', score };
  if (pnlPercent >= -10) return { momentum: 'neutral', score };
  if (pnlPercent >= -30) return { momentum: 'bearish', score };
  return { momentum: 'strong_bearish', score };
}

function calculateExitWindow(
  position: PaperPosition,
  currentPrice: number,
  dte: number | null,
  momentum: ExitAdvisory['momentum']
): { window: ExitAdvisory['exitWindow']; probability: number; reason: string; timeEstimate: string } {
  const entryPrice = position.entryPrice || 0;
  const targetPrice = position.targetPrice || entryPrice * 2;
  const stopLoss = position.stopLoss || entryPrice * 0.5;
  
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const distanceToTargetPercent = ((targetPrice - currentPrice) / currentPrice) * 100;
  const distanceToStopPercent = ((currentPrice - stopLoss) / currentPrice) * 100;
  
  if (currentPrice >= targetPrice) {
    return {
      window: 'immediate',
      probability: 95,
      reason: 'TARGET HIT - Take profits',
      timeEstimate: 'Now'
    };
  }
  
  if (currentPrice <= stopLoss) {
    return {
      window: 'immediate',
      probability: 95,
      reason: 'STOP HIT - Exit to protect capital',
      timeEstimate: 'Now'
    };
  }
  
  if (dte !== null && dte <= 1) {
    if (pnlPercent > 0) {
      return {
        window: 'immediate',
        probability: 90,
        reason: '0DTE with profit - Lock in gains before theta crush',
        timeEstimate: 'Within 30 min'
      };
    } else {
      return {
        window: 'immediate',
        probability: 85,
        reason: '0DTE underwater - Exit to avoid total loss',
        timeEstimate: 'Within 30 min'
      };
    }
  }
  
  if (pnlPercent >= 100) {
    return {
      window: 'soon',
      probability: 75,
      reason: 'DOUBLED UP - Consider taking partial profits',
      timeEstimate: '1-2 hours'
    };
  }
  
  if (pnlPercent >= 50) {
    return {
      window: 'soon',
      probability: 60,
      reason: '+50% - Strong gains, trail stop higher',
      timeEstimate: '2-4 hours'
    };
  }
  
  if (dte !== null && dte <= 3 && pnlPercent < 20) {
    return {
      window: 'soon',
      probability: 55,
      reason: 'Low DTE + limited gains - Theta working against you',
      timeEstimate: '2-4 hours'
    };
  }
  
  if (momentum === 'strong_bearish') {
    return {
      window: 'soon',
      probability: 65,
      reason: 'Strong bearish momentum - Consider early exit',
      timeEstimate: '1-2 hours'
    };
  }
  
  if (distanceToStopPercent < 10) {
    return {
      window: 'watch',
      probability: 40,
      reason: 'DANGER ZONE - Near stop loss, watch closely',
      timeEstimate: 'Monitor actively'
    };
  }
  
  if (pnlPercent >= 20 && momentum === 'bullish') {
    return {
      window: 'hold',
      probability: 25,
      reason: 'Healthy profit + bullish momentum - Let it ride',
      timeEstimate: 'Hold until target or momentum shift'
    };
  }
  
  return {
    window: 'hold',
    probability: 20,
    reason: 'Position developing - Monitor for signals',
    timeEstimate: 'Continue monitoring'
  };
}

function generateSignals(
  position: PaperPosition,
  currentPrice: number,
  dte: number | null,
  momentum: ExitAdvisory['momentum']
): string[] {
  const signals: string[] = [];
  const entryPrice = position.entryPrice || 0;
  const targetPrice = position.targetPrice || entryPrice * 2;
  const stopLoss = position.stopLoss || entryPrice * 0.5;
  
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
  const distanceToTarget = ((targetPrice - currentPrice) / targetPrice) * 100;
  const distanceToStop = ((currentPrice - stopLoss) / currentPrice) * 100;
  
  if (pnlPercent >= 100) signals.push('DOUBLED_UP');
  else if (pnlPercent >= 50) signals.push('STRONG_GAINS');
  else if (pnlPercent >= 20) signals.push('PROFITABLE');
  else if (pnlPercent <= -30) signals.push('DEEP_RED');
  else if (pnlPercent <= -15) signals.push('UNDERWATER');
  
  if (distanceToTarget <= 10) signals.push('NEAR_TARGET');
  if (distanceToStop <= 15) signals.push('NEAR_STOP');
  
  if (dte !== null) {
    if (dte === 0) signals.push('0DTE_URGENCY');
    else if (dte === 1) signals.push('1DTE_THETA_BURN');
    else if (dte <= 3) signals.push('LOW_DTE');
  }
  
  if (momentum === 'strong_bullish') signals.push('STRONG_MOMENTUM_UP');
  else if (momentum === 'strong_bearish') signals.push('STRONG_MOMENTUM_DOWN');
  
  return signals;
}

export async function analyzePosition(position: PaperPosition): Promise<ExitAdvisory | null> {
  try {
    const currentPrice = position.currentPrice || await getCachedPrice(position.symbol);
    if (!currentPrice) {
      logger.warn(`[POSITION-MONITOR] No price available for ${position.symbol}`);
      return null;
    }
    
    const entryPrice = position.entryPrice || 0;
    const targetPrice = position.targetPrice || entryPrice * 2;
    const stopLoss = position.stopLoss || entryPrice * 0.5;
    
    const dte = calculateDTE(position.expiryDate || null);
    const thetaUrgency = calculateThetaUrgency(dte);
    const { momentum, score: momentumScore } = calculateMomentum(currentPrice, entryPrice, targetPrice, stopLoss);
    const { window: exitWindow, probability: exitProbability, reason: exitReason, timeEstimate: exitTimeEstimate } = calculateExitWindow(position, currentPrice, dte, momentum);
    const signals = generateSignals(position, currentPrice, dte, momentum);
    
    const unrealizedPnL = (currentPrice - entryPrice) * (position.quantity || 1) * (position.optionType ? 100 : 1);
    const unrealizedPnLPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    const distanceToTarget = ((targetPrice - currentPrice) / currentPrice) * 100;
    const distanceToStop = ((currentPrice - stopLoss) / currentPrice) * 100;
    const riskRewardCurrent = distanceToTarget / Math.max(0.1, -distanceToStop);
    
    return {
      positionId: position.id,
      symbol: position.symbol,
      optionType: position.optionType || null,
      strikePrice: position.strikePrice || null,
      expiryDate: position.expiryDate || null,
      
      currentPrice,
      entryPrice,
      targetPrice,
      stopLoss,
      
      unrealizedPnL,
      unrealizedPnLPercent,
      
      exitWindow,
      exitProbability,
      exitReason,
      exitTimeEstimate,
      
      momentum,
      momentumScore,
      
      dteRemaining: dte,
      thetaUrgency,
      
      riskRewardCurrent: Math.round(riskRewardCurrent * 100) / 100,
      distanceToTarget: Math.round(distanceToTarget * 10) / 10,
      distanceToStop: Math.round(distanceToStop * 10) / 10,
      
      signals,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`[POSITION-MONITOR] Error analyzing ${position.symbol}:`, error);
    return null;
  }
}

export async function getPortfolioExitIntelligence(portfolioId: string): Promise<PositionMonitorState> {
  const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
  const openPositions = positions.filter(p => p.status === 'open');
  
  const advisories: ExitAdvisory[] = [];
  
  for (const position of openPositions) {
    const advisory = await analyzePosition(position);
    if (advisory) {
      advisories.push(advisory);
    }
  }
  
  advisories.sort((a, b) => {
    const windowPriority = { immediate: 0, soon: 1, watch: 2, hold: 3 };
    const priorityDiff = windowPriority[a.exitWindow] - windowPriority[b.exitWindow];
    if (priorityDiff !== 0) return priorityDiff;
    return b.exitProbability - a.exitProbability;
  });
  
  const now = new Date();
  const hour = now.getHours();
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  
  let marketStatus: PositionMonitorState['marketStatus'] = 'closed';
  if (!isWeekend) {
    if (hour >= 9 && hour < 16) marketStatus = 'open';
    else if (hour >= 4 && hour < 9) marketStatus = 'pre_market';
    else if (hour >= 16 && hour < 20) marketStatus = 'after_hours';
  }
  
  logger.info(`[POSITION-MONITOR] Analyzed ${advisories.length} positions for portfolio ${portfolioId}`);
  
  return {
    portfolioId,
    positions: advisories,
    lastRefresh: now.toISOString(),
    marketStatus
  };
}

export async function getAutoLottoExitIntelligence(): Promise<PositionMonitorState | null> {
  const portfolios = await storage.getAllPaperPortfolios();
  const autoLottoPortfolio = portfolios.find(p => p.name === 'Auto-Lotto Bot');
  
  if (!autoLottoPortfolio) {
    logger.warn('[POSITION-MONITOR] Auto-Lotto Bot portfolio not found');
    return null;
  }
  
  return getPortfolioExitIntelligence(autoLottoPortfolio.id);
}
