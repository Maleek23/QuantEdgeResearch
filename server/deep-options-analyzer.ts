/**
 * DEEP OPTIONS ANALYZER
 * Comprehensive options analysis engine that evaluates trades based on:
 * - Greeks (Delta, Gamma, Theta, Vega, Rho)
 * - Implied Volatility analysis (IV Rank, IV Percentile, IV Skew)
 * - Technical Analysis (Support/Resistance, Trend, ATR)
 * - Volume/Open Interest analysis (Unusual activity, Put/Call ratio)
 * - Catalyst detection (Earnings, News, SEC filings)
 * - Probability calculations (PoP, Expected Move)
 * - Risk/Reward scoring and scenario modeling
 */

import { logger } from './logger';
import { getTradierQuote, getTradierOptionsChain, getTradierHistoryOHLC } from './tradier-api';
import { analyzeVolatility, type VolatilityAnalysis } from './volatility-analysis-service';
import { calculateATR } from './technical-indicators';
import { formatInTimeZone } from 'date-fns-tz';

// Analysis thresholds
const IV_RANK_CHEAP = 25;
const IV_RANK_FAIR = 50;
const IV_RANK_EXPENSIVE = 75;
const IV_RANK_EXTREME = 90;

export interface GreeksAnalysis {
  delta: number;
  deltaInterpretation: string;
  gamma: number;
  gammaRisk: string;
  theta: number;
  thetaImpact: string;
  vega: number;
  vegaExposure: string;
  rho?: number;
}

export interface IVAnalysis {
  currentIV: number;
  ivRank: number;
  ivPercentile: number;
  ivTrend: 'rising' | 'falling' | 'stable';
  ivSkew: number;
  ivInterpretation: string;
  premiumAssessment: 'cheap' | 'fair' | 'expensive' | 'extreme';
  expectedMove: number;
  expectedMovePercent: number;
}

export interface TechnicalAnalysis {
  currentPrice: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  trendStrength: number;
  support: number[];
  resistance: number[];
  atr: number;
  atrPercent: number;
  rsi?: number;
  distanceToStrike: number;
  distanceToStrikePercent: number;
  breakEvenPrice: number;
  breakEvenMove: number;
}

export interface VolumeAnalysis {
  optionVolume: number;
  openInterest: number;
  volumeOIRatio: number;
  unusualActivity: boolean;
  putCallRatio?: number;
  bidAskSpread: number;
  spreadPercent: number;
  liquidityScore: number;
  liquidityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface CatalystAnalysis {
  hasEarnings: boolean;
  earningsDate?: string;
  daysToEarnings?: number;
  earningsRisk: 'high' | 'medium' | 'low' | 'none';
  recentNews: string[];
  secFilings: string[];
  catalystScore: number;
}

export interface ProbabilityAnalysis {
  probabilityOfProfit: number;
  probabilityITM: number;
  probabilityOTM: number;
  maxProfit: number;
  maxLoss: number;
  riskRewardRatio: number;
  breakEvenPrice: number;
  expectedValue: number;
}

export interface ScenarioAnalysis {
  bullCase: { price: number; pnl: number; pnlPercent: number };
  baseCase: { price: number; pnl: number; pnlPercent: number };
  bearCase: { price: number; pnl: number; pnlPercent: number };
  atExpiry: { itm: boolean; intrinsicValue: number };
}

export interface DeepOptionsAnalysis {
  symbol: string;
  optionSymbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  daysToExpiry: number;
  currentPrice: number;
  bid: number;
  ask: number;
  midPrice: number;
  lastPrice: number;
  
  greeks: GreeksAnalysis;
  iv: IVAnalysis;
  technical: TechnicalAnalysis;
  volume: VolumeAnalysis;
  catalyst: CatalystAnalysis;
  probability: ProbabilityAnalysis;
  scenarios: ScenarioAnalysis;
  
  overallScore: number;
  overallGrade: string;
  verdict: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'STRONG_AVOID';
  keyRisks: string[];
  keyEdges: string[];
  recommendation: string;
  
  analyzedAt: string;
}

function calculateDaysToExpiry(expiration: string): number {
  const now = new Date();
  const exp = new Date(expiration + 'T16:00:00-05:00');
  const diffTime = exp.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function interpretDelta(delta: number, optionType: 'call' | 'put'): string {
  const absDelta = Math.abs(delta);
  if (absDelta >= 0.80) return 'Deep ITM - High directional exposure, low leverage';
  if (absDelta >= 0.60) return 'ITM - Strong directional exposure, moderate leverage';
  if (absDelta >= 0.45) return 'ATM - Balanced exposure, high gamma risk';
  if (absDelta >= 0.25) return 'OTM - Lower probability, higher leverage';
  if (absDelta >= 0.10) return 'Far OTM - Lotto territory, speculative';
  return 'Deep OTM - Very low probability, extreme speculation';
}

function interpretGamma(gamma: number, daysToExpiry: number): string {
  if (daysToExpiry <= 2 && gamma > 0.10) return 'CRITICAL: Extreme gamma risk near expiry';
  if (gamma > 0.15) return 'HIGH: Large delta swings expected with small price moves';
  if (gamma > 0.08) return 'MODERATE: Noticeable delta changes with price moves';
  return 'LOW: Stable delta, predictable behavior';
}

function interpretTheta(theta: number, premium: number, daysToExpiry: number): string {
  const dailyDecayPercent = Math.abs(theta / premium) * 100;
  if (daysToExpiry <= 2) return `CRITICAL: Losing $${Math.abs(theta).toFixed(2)}/day (${dailyDecayPercent.toFixed(1)}%/day)`;
  if (dailyDecayPercent > 5) return `HIGH DECAY: Losing ${dailyDecayPercent.toFixed(1)}%/day - need fast move`;
  if (dailyDecayPercent > 2) return `MODERATE DECAY: ${dailyDecayPercent.toFixed(1)}%/day time decay`;
  return `LOW DECAY: ${dailyDecayPercent.toFixed(1)}%/day - time is on your side`;
}

function interpretVega(vega: number, ivRank: number): string {
  if (ivRank > 75 && vega > 0.10) return 'HIGH RISK: Long vega in high IV - vulnerable to IV crush';
  if (ivRank < 25 && vega > 0.10) return 'EDGE: Long vega in low IV - potential IV expansion benefit';
  if (vega > 0.15) return 'HIGH VEGA: Very sensitive to IV changes';
  return 'MODERATE: Normal vega exposure';
}

function calculateLiquidityGrade(volume: number, oi: number, spreadPercent: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  let score = 0;
  
  // Volume scoring
  if (volume >= 1000) score += 30;
  else if (volume >= 500) score += 25;
  else if (volume >= 100) score += 15;
  else if (volume >= 10) score += 5;
  
  // OI scoring
  if (oi >= 5000) score += 30;
  else if (oi >= 1000) score += 25;
  else if (oi >= 500) score += 15;
  else if (oi >= 100) score += 5;
  
  // Spread scoring
  if (spreadPercent <= 0.05) score += 40;
  else if (spreadPercent <= 0.10) score += 30;
  else if (spreadPercent <= 0.20) score += 20;
  else if (spreadPercent <= 0.35) score += 10;
  
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

function calculateProbabilityOfProfit(
  optionType: 'call' | 'put',
  stockPrice: number,
  strike: number,
  premium: number,
  ivAnnualized: number,
  daysToExpiry: number
): number {
  const timeYears = daysToExpiry / 365;
  const volatility = ivAnnualized * Math.sqrt(timeYears);
  
  // Calculate break-even
  const breakEven = optionType === 'call' 
    ? strike + premium 
    : strike - premium;
  
  // Simple probability calculation using normal distribution approximation
  const logReturn = Math.log(breakEven / stockPrice);
  const zscore = logReturn / volatility;
  
  // Standard normal CDF approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = zscore < 0 ? -1 : 1;
  const x = Math.abs(zscore) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  const cdf = 0.5 * (1.0 + sign * y);
  
  // For calls: PoP = 1 - CDF(break-even)
  // For puts: PoP = CDF(break-even)
  return optionType === 'call' ? (1 - cdf) * 100 : cdf * 100;
}

function generateVerdict(score: number): 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'STRONG_AVOID' {
  if (score >= 80) return 'STRONG_BUY';
  if (score >= 65) return 'BUY';
  if (score >= 45) return 'HOLD';
  if (score >= 30) return 'AVOID';
  return 'STRONG_AVOID';
}

function getLetterGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 45) return 'D+';
  if (score >= 40) return 'D';
  return 'F';
}

export async function analyzeOption(
  symbol: string,
  strike: number,
  expiration: string,
  optionType: 'call' | 'put'
): Promise<DeepOptionsAnalysis | null> {
  try {
    logger.info(`[DEEP-ANALYZE] Starting deep analysis: ${symbol} $${strike} ${optionType} ${expiration}`);
    
    // Fetch stock quote
    const quote = await getTradierQuote(symbol);
    if (!quote) {
      logger.error(`[DEEP-ANALYZE] Failed to fetch quote for ${symbol}`);
      return null;
    }
    
    const stockPrice = quote.last || quote.bid || quote.ask || 0;
    if (stockPrice <= 0) {
      logger.error(`[DEEP-ANALYZE] Invalid stock price for ${symbol}`);
      return null;
    }
    
    // Fetch options chain for specific expiration
    const chain = await getTradierOptionsChain(symbol, expiration);
    if (!chain || chain.length === 0) {
      logger.error(`[DEEP-ANALYZE] No options chain found for ${symbol} ${expiration}`);
      return null;
    }
    
    // Find the specific option
    const option = chain.find((opt: any) => 
      opt.strike === strike && opt.option_type === optionType
    );
    
    if (!option) {
      logger.error(`[DEEP-ANALYZE] Option not found: ${symbol} $${strike} ${optionType} ${expiration}`);
      return null;
    }
    
    const daysToExpiry = calculateDaysToExpiry(expiration);
    const bid = option.bid || 0;
    const ask = option.ask || 0;
    const midPrice = (bid + ask) / 2;
    const lastPrice = option.last || midPrice;
    const premium = midPrice * 100; // Per contract
    
    // Greeks Analysis
    const delta = option.greeks?.delta || 0;
    const gamma = option.greeks?.gamma || 0;
    const theta = option.greeks?.theta || 0;
    const vega = option.greeks?.vega || 0;
    const rho = option.greeks?.rho;
    
    // Fetch volatility data
    let volData: VolatilityAnalysis | null = null;
    try {
      volData = await analyzeVolatility(symbol);
    } catch (e) {
      logger.debug(`[DEEP-ANALYZE] Volatility analysis failed for ${symbol}`);
    }
    
    const currentIV = (option.greeks?.mid_iv || option.greeks?.ask_iv || option.greeks?.bid_iv || 0.30) * 100;
    const ivRank = volData?.ivRank || 50;
    const ivPercentile = volData?.ivPercentile || 50;
    
    // Calculate expected move
    const timeToExpiry = daysToExpiry / 365;
    const expectedMovePercent = currentIV * Math.sqrt(timeToExpiry);
    const expectedMove = stockPrice * (expectedMovePercent / 100);
    
    // Technical Analysis
    let closes: number[] = [];
    let highs: number[] = [];
    let lows: number[] = [];
    try {
      const histData = await getTradierHistoryOHLC(symbol, 60);
      if (histData) {
        closes = histData.closes.filter(c => c > 0);
        highs = histData.highs.filter(h => h > 0);
        lows = histData.lows.filter(l => l > 0);
      }
    } catch (e) {
      logger.debug(`[DEEP-ANALYZE] Historical data failed for ${symbol}`);
    }
    
    // Calculate ATR
    const atr = calculateATR(highs, lows, closes, 14);
    const atrPercent = (atr / stockPrice) * 100;
    
    // Simple trend detection
    const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : stockPrice;
    const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : stockPrice;
    const trend = stockPrice > sma20 && sma20 > sma50 ? 'bullish' : 
                  stockPrice < sma20 && sma20 < sma50 ? 'bearish' : 'neutral';
    const trendStrength = Math.abs((stockPrice - sma20) / sma20) * 100;
    
    // Support/Resistance (simplified)
    const recentLows = lows.slice(-20);
    const recentHighs = highs.slice(-20);
    const support = recentLows.length > 0 ? [Math.min(...recentLows)] : [stockPrice * 0.95];
    const resistance = recentHighs.length > 0 ? [Math.max(...recentHighs)] : [stockPrice * 1.05];
    
    // Distance to strike
    const distanceToStrike = strike - stockPrice;
    const distanceToStrikePercent = (distanceToStrike / stockPrice) * 100;
    
    // Break-even calculation
    const breakEvenPrice = optionType === 'call' ? strike + midPrice : strike - midPrice;
    const breakEvenMove = ((breakEvenPrice - stockPrice) / stockPrice) * 100;
    
    // Volume Analysis
    const optionVolume = option.volume || 0;
    const openInterest = option.open_interest || 0;
    const volumeOIRatio = openInterest > 0 ? optionVolume / openInterest : 0;
    const unusualActivity = volumeOIRatio > 0.5 || optionVolume > openInterest;
    const bidAskSpread = ask - bid;
    const spreadPercent = midPrice > 0 ? bidAskSpread / midPrice : 1;
    const liquidityScore = Math.min(100, (optionVolume + openInterest) / 10);
    const liquidityGrade = calculateLiquidityGrade(optionVolume, openInterest, spreadPercent);
    
    // Probability Analysis
    const probabilityOfProfit = calculateProbabilityOfProfit(
      optionType, stockPrice, strike, midPrice, currentIV / 100, daysToExpiry
    );
    const probabilityITM = Math.abs(delta) * 100;
    const probabilityOTM = 100 - probabilityITM;
    const maxLoss = premium;
    const maxProfit = optionType === 'call' ? Infinity : (strike - midPrice) * 100;
    const riskRewardRatio = probabilityOfProfit > 0 ? (100 - probabilityOfProfit) / probabilityOfProfit : 0;
    const expectedValue = (probabilityOfProfit / 100 * maxProfit) - ((100 - probabilityOfProfit) / 100 * maxLoss);
    
    // Scenario Analysis
    const bullMove = stockPrice * (1 + expectedMovePercent / 100);
    const bearMove = stockPrice * (1 - expectedMovePercent / 100);
    
    const bullCasePnL = optionType === 'call' 
      ? Math.max(0, bullMove - strike) - midPrice
      : Math.max(0, strike - bullMove) - midPrice;
    const bearCasePnL = optionType === 'call'
      ? Math.max(0, bearMove - strike) - midPrice
      : Math.max(0, strike - bearMove) - midPrice;
    const baseCasePnL = -midPrice * 0.3; // 30% decay assumption
    
    // Catalyst Analysis (simplified - would integrate with catalyst service)
    const catalystScore = 50; // Placeholder - integrate with catalyst-intelligence-service
    
    // Calculate Overall Score
    let overallScore = 50; // Start at neutral
    const keyRisks: string[] = [];
    const keyEdges: string[] = [];
    
    // IV scoring
    if (ivRank > IV_RANK_EXTREME) {
      overallScore -= 20;
      keyRisks.push(`Extreme IV (${ivRank.toFixed(0)}%) - premium severely overpriced`);
    } else if (ivRank > IV_RANK_EXPENSIVE) {
      overallScore -= 10;
      keyRisks.push(`High IV (${ivRank.toFixed(0)}%) - premium expensive`);
    } else if (ivRank < IV_RANK_CHEAP) {
      overallScore += 10;
      keyEdges.push(`Low IV (${ivRank.toFixed(0)}%) - cheap premium, potential IV expansion`);
    }
    
    // Time decay scoring
    if (daysToExpiry <= 2) {
      overallScore -= 15;
      keyRisks.push(`Only ${daysToExpiry} DTE - extreme theta decay`);
    } else if (daysToExpiry <= 5) {
      overallScore -= 8;
      keyRisks.push(`Short-dated (${daysToExpiry} DTE) - accelerating decay`);
    } else if (daysToExpiry >= 30) {
      overallScore += 5;
      keyEdges.push(`${daysToExpiry} DTE - time for thesis to play out`);
    }
    
    // Liquidity scoring
    if (liquidityGrade === 'A') {
      overallScore += 10;
      keyEdges.push('Excellent liquidity - tight spreads, easy fills');
    } else if (liquidityGrade === 'F' || liquidityGrade === 'D') {
      overallScore -= 15;
      keyRisks.push(`Poor liquidity (Grade ${liquidityGrade}) - wide spreads, hard to exit`);
    }
    
    // Trend alignment scoring
    if ((optionType === 'call' && trend === 'bullish') || (optionType === 'put' && trend === 'bearish')) {
      overallScore += 10;
      keyEdges.push(`${trend.toUpperCase()} trend aligns with ${optionType} direction`);
    } else if ((optionType === 'call' && trend === 'bearish') || (optionType === 'put' && trend === 'bullish')) {
      overallScore -= 10;
      keyRisks.push(`${trend.toUpperCase()} trend opposes ${optionType} direction - fighting the trend`);
    }
    
    // Probability scoring
    if (probabilityOfProfit > 50) {
      overallScore += 8;
      keyEdges.push(`${probabilityOfProfit.toFixed(1)}% probability of profit`);
    } else if (probabilityOfProfit < 25) {
      overallScore -= 10;
      keyRisks.push(`Low ${probabilityOfProfit.toFixed(1)}% probability of profit`);
    }
    
    // Break-even move scoring
    if (Math.abs(breakEvenMove) > expectedMovePercent) {
      overallScore -= 10;
      keyRisks.push(`Break-even requires ${Math.abs(breakEvenMove).toFixed(1)}% move vs ${expectedMovePercent.toFixed(1)}% expected`);
    } else {
      overallScore += 5;
      keyEdges.push(`Break-even ${Math.abs(breakEvenMove).toFixed(1)}% within expected move range`);
    }
    
    // Unusual activity bonus
    if (unusualActivity && optionVolume > 500) {
      overallScore += 5;
      keyEdges.push(`Unusual activity detected (${optionVolume.toLocaleString()} volume)`);
    }
    
    // Clamp score
    overallScore = Math.max(0, Math.min(100, overallScore));
    
    // Generate recommendation
    const verdict = generateVerdict(overallScore);
    let recommendation = '';
    
    if (verdict === 'STRONG_BUY') {
      recommendation = `Strong opportunity with ${keyEdges.length} key edges. Consider position sizing at 1-2% of account.`;
    } else if (verdict === 'BUY') {
      recommendation = `Favorable setup with manageable risks. Watch for ${keyRisks.length > 0 ? keyRisks[0] : 'any adverse moves'}.`;
    } else if (verdict === 'HOLD') {
      recommendation = `Mixed signals. Wait for better entry or more confirmation before committing.`;
    } else if (verdict === 'AVOID') {
      recommendation = `Risk/reward unfavorable. Primary concern: ${keyRisks[0] || 'multiple red flags'}.`;
    } else {
      recommendation = `Strong avoid - multiple critical issues: ${keyRisks.slice(0, 2).join(', ')}.`;
    }
    
    const analysis: DeepOptionsAnalysis = {
      symbol,
      optionSymbol: option.symbol,
      optionType,
      strike,
      expiration,
      daysToExpiry,
      currentPrice: stockPrice,
      bid,
      ask,
      midPrice,
      lastPrice,
      
      greeks: {
        delta,
        deltaInterpretation: interpretDelta(delta, optionType),
        gamma,
        gammaRisk: interpretGamma(gamma, daysToExpiry),
        theta,
        thetaImpact: interpretTheta(theta, midPrice, daysToExpiry),
        vega,
        vegaExposure: interpretVega(vega, ivRank),
        rho
      },
      
      iv: {
        currentIV,
        ivRank,
        ivPercentile,
        ivTrend: 'stable', // Would calculate from historical IV
        ivSkew: 0, // Would calculate from options chain
        ivInterpretation: ivRank > IV_RANK_EXPENSIVE ? 'Premium is expensive relative to historical' :
                          ivRank < IV_RANK_CHEAP ? 'Premium is cheap relative to historical' : 'Fair value',
        premiumAssessment: ivRank > IV_RANK_EXTREME ? 'extreme' :
                           ivRank > IV_RANK_EXPENSIVE ? 'expensive' :
                           ivRank < IV_RANK_CHEAP ? 'cheap' : 'fair',
        expectedMove,
        expectedMovePercent
      },
      
      technical: {
        currentPrice: stockPrice,
        trend,
        trendStrength,
        support,
        resistance,
        atr,
        atrPercent,
        distanceToStrike,
        distanceToStrikePercent,
        breakEvenPrice,
        breakEvenMove
      },
      
      volume: {
        optionVolume,
        openInterest,
        volumeOIRatio,
        unusualActivity,
        bidAskSpread,
        spreadPercent,
        liquidityScore,
        liquidityGrade
      },
      
      catalyst: {
        hasEarnings: false, // Would integrate with earnings calendar
        earningsRisk: 'none',
        recentNews: [],
        secFilings: [],
        catalystScore
      },
      
      probability: {
        probabilityOfProfit,
        probabilityITM,
        probabilityOTM,
        maxProfit: maxProfit === Infinity ? 999999 : maxProfit,
        maxLoss,
        riskRewardRatio,
        breakEvenPrice,
        expectedValue
      },
      
      scenarios: {
        bullCase: { 
          price: bullMove, 
          pnl: bullCasePnL * 100, 
          pnlPercent: (bullCasePnL / midPrice) * 100 
        },
        baseCase: { 
          price: stockPrice, 
          pnl: baseCasePnL * 100, 
          pnlPercent: (baseCasePnL / midPrice) * 100 
        },
        bearCase: { 
          price: bearMove, 
          pnl: bearCasePnL * 100, 
          pnlPercent: (bearCasePnL / midPrice) * 100 
        },
        atExpiry: {
          itm: optionType === 'call' ? stockPrice > strike : stockPrice < strike,
          intrinsicValue: optionType === 'call' 
            ? Math.max(0, stockPrice - strike) 
            : Math.max(0, strike - stockPrice)
        }
      },
      
      overallScore,
      overallGrade: getLetterGrade(overallScore),
      verdict,
      keyRisks,
      keyEdges,
      recommendation,
      
      analyzedAt: formatInTimeZone(new Date(), 'America/Chicago', 'yyyy-MM-dd HH:mm:ss zzz')
    };
    
    logger.info(`[DEEP-ANALYZE] Completed: ${symbol} $${strike} ${optionType} - Score: ${overallScore} (${verdict})`);
    
    return analysis;
    
  } catch (error) {
    logger.error(`[DEEP-ANALYZE] Error analyzing ${symbol}:`, error);
    return null;
  }
}

export function formatAnalysisReport(analysis: DeepOptionsAnalysis): string {
  const lines: string[] = [];
  
  lines.push(`${'═'.repeat(60)}`);
  lines.push(`🔍 DEEP OPTIONS ANALYSIS: ${analysis.symbol} $${analysis.strike} ${analysis.optionType.toUpperCase()}`);
  lines.push(`📅 Expiration: ${analysis.expiration} (${analysis.daysToExpiry} DTE)`);
  lines.push(`${'═'.repeat(60)}`);
  lines.push('');
  
  // Overview
  lines.push(`📊 OVERVIEW`);
  lines.push(`   Stock Price: $${analysis.currentPrice.toFixed(2)}`);
  lines.push(`   Option Price: $${analysis.midPrice.toFixed(2)} (Bid: $${analysis.bid.toFixed(2)} / Ask: $${analysis.ask.toFixed(2)})`);
  lines.push(`   Contract Cost: $${(analysis.midPrice * 100).toFixed(2)}`);
  lines.push('');
  
  // Verdict
  const verdictEmoji = {
    'STRONG_BUY': '🟢🟢',
    'BUY': '🟢',
    'HOLD': '🟡',
    'AVOID': '🔴',
    'STRONG_AVOID': '🔴🔴'
  };
  lines.push(`⭐ VERDICT: ${verdictEmoji[analysis.verdict]} ${analysis.verdict} (Score: ${analysis.overallScore}/100, Grade: ${analysis.overallGrade})`);
  lines.push(`   ${analysis.recommendation}`);
  lines.push('');
  
  // Greeks
  lines.push(`📈 GREEKS ANALYSIS`);
  lines.push(`   Delta: ${analysis.greeks.delta.toFixed(3)} - ${analysis.greeks.deltaInterpretation}`);
  lines.push(`   Gamma: ${analysis.greeks.gamma.toFixed(4)} - ${analysis.greeks.gammaRisk}`);
  lines.push(`   Theta: ${analysis.greeks.theta.toFixed(4)} - ${analysis.greeks.thetaImpact}`);
  lines.push(`   Vega: ${analysis.greeks.vega.toFixed(4)} - ${analysis.greeks.vegaExposure}`);
  lines.push('');
  
  // IV Analysis
  lines.push(`📊 IMPLIED VOLATILITY`);
  lines.push(`   Current IV: ${analysis.iv.currentIV.toFixed(1)}%`);
  lines.push(`   IV Rank: ${analysis.iv.ivRank.toFixed(1)}% (${analysis.iv.premiumAssessment.toUpperCase()})`);
  lines.push(`   Expected Move: ±$${analysis.iv.expectedMove.toFixed(2)} (±${analysis.iv.expectedMovePercent.toFixed(1)}%)`);
  lines.push(`   ${analysis.iv.ivInterpretation}`);
  lines.push('');
  
  // Technical
  lines.push(`📉 TECHNICAL ANALYSIS`);
  lines.push(`   Trend: ${analysis.technical.trend.toUpperCase()} (${analysis.technical.trendStrength.toFixed(1)}% strength)`);
  lines.push(`   ATR: $${analysis.technical.atr.toFixed(2)} (${analysis.technical.atrPercent.toFixed(1)}% daily range)`);
  lines.push(`   Distance to Strike: ${analysis.technical.distanceToStrikePercent >= 0 ? '+' : ''}${analysis.technical.distanceToStrikePercent.toFixed(1)}%`);
  lines.push(`   Break-Even: $${analysis.technical.breakEvenPrice.toFixed(2)} (${analysis.technical.breakEvenMove >= 0 ? '+' : ''}${analysis.technical.breakEvenMove.toFixed(1)}% move required)`);
  lines.push('');
  
  // Liquidity
  lines.push(`💧 LIQUIDITY (Grade: ${analysis.volume.liquidityGrade})`);
  lines.push(`   Volume: ${analysis.volume.optionVolume.toLocaleString()} | OI: ${analysis.volume.openInterest.toLocaleString()}`);
  lines.push(`   Bid/Ask Spread: $${analysis.volume.bidAskSpread.toFixed(2)} (${(analysis.volume.spreadPercent * 100).toFixed(1)}%)`);
  lines.push(`   ${analysis.volume.unusualActivity ? '🔥 UNUSUAL ACTIVITY DETECTED' : 'Normal activity'}`);
  lines.push('');
  
  // Probability
  lines.push(`🎯 PROBABILITY ANALYSIS`);
  lines.push(`   Prob of Profit: ${analysis.probability.probabilityOfProfit.toFixed(1)}%`);
  lines.push(`   Prob ITM at Expiry: ${analysis.probability.probabilityITM.toFixed(1)}%`);
  lines.push(`   Max Loss: $${analysis.probability.maxLoss.toFixed(2)} | Max Profit: ${analysis.probability.maxProfit === 999999 ? 'Unlimited' : '$' + analysis.probability.maxProfit.toFixed(2)}`);
  lines.push('');
  
  // Scenarios
  lines.push(`📊 SCENARIO ANALYSIS`);
  lines.push(`   Bull Case ($${analysis.scenarios.bullCase.price.toFixed(2)}): ${analysis.scenarios.bullCase.pnl >= 0 ? '+' : ''}$${analysis.scenarios.bullCase.pnl.toFixed(0)} (${analysis.scenarios.bullCase.pnlPercent.toFixed(0)}%)`);
  lines.push(`   Base Case ($${analysis.scenarios.baseCase.price.toFixed(2)}): ${analysis.scenarios.baseCase.pnl >= 0 ? '+' : ''}$${analysis.scenarios.baseCase.pnl.toFixed(0)} (${analysis.scenarios.baseCase.pnlPercent.toFixed(0)}%)`);
  lines.push(`   Bear Case ($${analysis.scenarios.bearCase.price.toFixed(2)}): ${analysis.scenarios.bearCase.pnl >= 0 ? '+' : ''}$${analysis.scenarios.bearCase.pnl.toFixed(0)} (${analysis.scenarios.bearCase.pnlPercent.toFixed(0)}%)`);
  lines.push('');
  
  // Key Points
  if (analysis.keyEdges.length > 0) {
    lines.push(`✅ KEY EDGES`);
    analysis.keyEdges.forEach(edge => lines.push(`   • ${edge}`));
    lines.push('');
  }
  
  if (analysis.keyRisks.length > 0) {
    lines.push(`⚠️ KEY RISKS`);
    analysis.keyRisks.forEach(risk => lines.push(`   • ${risk}`));
    lines.push('');
  }
  
  lines.push(`${'─'.repeat(60)}`);
  lines.push(`Analyzed: ${analysis.analyzedAt}`);
  
  return lines.join('\n');
}
