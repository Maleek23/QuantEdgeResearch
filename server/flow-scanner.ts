// DIY Unusual Options Flow Scanner  
// Detects unusual options activity and generates OPTIONS trade ideas based on real premiums

import type { InsertTradeIdea } from "@shared/schema";
import { getTradierQuote, getTradierOptionsChain, getTradierOptionsChainsByDTE, getTradierHistoryOHLC } from './tradier-api';
import { validateTradeRisk } from './ai-service';
import { logger } from './logger';
import { formatInTimeZone } from 'date-fns-tz';
import { storage } from './storage';
import { calculateATR } from './technical-indicators';
import { isLottoCandidate, calculateLottoTargets } from './lotto-detector';

// Top 20 high-volume tickers for flow scanning
const FLOW_SCAN_TICKERS = [
  'SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD',
  'NFLX', 'DIS', 'BA', 'COIN', 'PLTR', 'SOFI', 'HOOD', 'RIOT', 'MARA', 'MSTR'
];

// Unusual activity thresholds (adjusted for Tradier Sandbox limitations)
// NOTE: Tradier Sandbox doesn't provide average_volume data, so we use absolute volume
const VOLUME_THRESHOLD = 500; // Absolute volume >500 contracts (since avg_vol=0 in sandbox)
const PREMIUM_THRESHOLD = 50000; // $50k+ premium
const IV_THRESHOLD = 0.5; // 50%+ implied volatility

interface UnusualOption {
  symbol: string;
  underlying: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  volume: number;
  premium: number; // volume * last * 100
  lastPrice: number;
  impliedVol: number;
  reasons: string[];
  greeks?: {
    delta?: number;
  };
}

interface FlowSignal {
  ticker: string;
  direction: 'long' | 'short';
  currentPrice: number;
  unusualOptions: UnusualOption[];
  totalPremium: number;
  signalStrength: number;
}

// NOTE: isLottoCandidate moved to shared lotto-detector.ts for use across all engines

// Detect unusual options activity
async function detectUnusualOptions(ticker: string): Promise<UnusualOption[]> {
  try {
    logger.info(`📊 [FLOW] Scanning options for ${ticker}...`);
    
    // Get options chain
    const options = await getTradierOptionsChainsByDTE(ticker);
    
    if (options.length === 0) {
      logger.info(`📊 [FLOW] No options data available for ${ticker}`);
      return [];
    }

    logger.info(`📊 [FLOW] ${ticker}: Found ${options.length} option contracts to analyze`);
    
    // Debug: Sample first contract to see what data we're getting
    if (options.length > 0) {
      const sample = options[0];
      logger.info(`📊 [FLOW] ${ticker}: Sample contract - volume=${sample.volume}, avg_vol=${sample.average_volume}, last=${sample.last}, greeks=${sample.greeks ? 'yes' : 'no'}`);
    }
    
    const unusualOptions: UnusualOption[] = [];
    let skippedCount = 0;
    let missingVolume = 0;
    let missingAvgVolume = 0;
    let missingLast = 0;

    for (const option of options) {
      // Skip if missing critical data (NOTE: average_volume is 0 in Tradier Sandbox, so we don't check it)
      if (!option.volume) missingVolume++;
      if (!option.average_volume) missingAvgVolume++;
      if (!option.last || option.last <= 0) missingLast++;
      
      if (!option.volume || !option.last || option.last <= 0) {
        skippedCount++;
        continue;
      }

      const premium = option.volume * option.last * 100; // Contract size = 100
      const impliedVol = option.greeks?.mid_iv || option.greeks?.bid_iv || 0;

      const reasons: string[] = [];
      let isUnusual = false;

      // Check absolute volume (since Tradier Sandbox doesn't provide average_volume)
      if (option.volume >= VOLUME_THRESHOLD) {
        reasons.push(`${option.volume} vol`);
        isUnusual = true;
      }

      // Check premium
      if (premium >= PREMIUM_THRESHOLD) {
        reasons.push(`$${(premium / 1000).toFixed(0)}k premium`);
        isUnusual = true;
      }

      // Check IV spike (Tradier returns IV as decimal, multiply by 100 for display)
      if (impliedVol >= IV_THRESHOLD) {
        reasons.push(`${(impliedVol * 100).toFixed(0)}% IV`);
        isUnusual = true;
      }

      if (isUnusual) {
        unusualOptions.push({
          symbol: option.symbol,
          underlying: option.underlying,
          optionType: option.option_type as 'call' | 'put',
          strike: option.strike,
          expiration: option.expiration_date,
          volume: option.volume,
          premium,
          lastPrice: option.last,
          impliedVol,
          reasons,
          greeks: option.greeks ? {
            delta: option.greeks.delta
          } : undefined
        });

        logger.info(`📊 [FLOW] UNUSUAL: ${ticker} ${option.option_type.toUpperCase()} $${option.strike} - ${reasons.join(', ')}`);
      }
    }

    logger.info(`📊 [FLOW] ${ticker}: Analyzed ${options.length} contracts, skipped ${skippedCount} (missing: vol=${missingVolume}, avg_vol=${missingAvgVolume}, last=${missingLast}), found ${unusualOptions.length} unusual`);
    return unusualOptions;
  } catch (error) {
    logger.error(`📊 [FLOW] Error scanning ${ticker}:`, error);
    return [];
  }
}

// Analyze flow signals from unusual options
function analyzeFlowSignals(ticker: string, currentPrice: number, unusualOptions: UnusualOption[]): FlowSignal | null {
  if (unusualOptions.length === 0) return null;

  // Separate calls and puts
  const calls = unusualOptions.filter(opt => opt.optionType === 'call');
  const puts = unusualOptions.filter(opt => opt.optionType === 'put');

  // Calculate total premium for each side
  const callPremium = calls.reduce((sum, opt) => sum + opt.premium, 0);
  const putPremium = puts.reduce((sum, opt) => sum + opt.premium, 0);

  // Determine direction based on dominant flow
  let direction: 'long' | 'short';
  let dominantOptions: UnusualOption[];
  let totalPremium: number;

  if (callPremium > putPremium) {
    direction = 'long';
    dominantOptions = calls;
    totalPremium = callPremium;
  } else {
    direction = 'short';
    dominantOptions = puts;
    totalPremium = putPremium;
  }

  // Calculate signal strength (0-100) based on average volume
  const avgVolume = dominantOptions.reduce((sum, opt) => sum + opt.volume, 0) / dominantOptions.length;
  const signalStrength = Math.min(100, 50 + ((avgVolume - VOLUME_THRESHOLD) / 100));

  logger.info(`📊 [FLOW] ${ticker} FLOW SIGNAL: ${direction.toUpperCase()} - ${dominantOptions.length} unusual ${direction === 'long' ? 'calls' : 'puts'}, $${(totalPremium / 1000000).toFixed(2)}M premium, ${signalStrength.toFixed(0)}% strength`);

  return {
    ticker,
    direction,
    currentPrice,
    unusualOptions: dominantOptions,
    totalPremium,
    signalStrength
  };
}

// Calculate dynamic target based on option Greeks, IV, and ATR
async function calculateDynamicTarget(
  ticker: string,
  currentPrice: number,
  direction: 'long' | 'short',
  mostActiveOption: UnusualOption
): Promise<{ targetMultiplier: number; method: string; explanation: string }> {
  // Calculate days to expiration (DTE)
  const expirationDate = new Date(mostActiveOption.expiration);
  const now = new Date();
  const daysToExpiry = Math.max(1, Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  // METHOD 1: IV-Based (Preferred for options)
  // Formula: Expected Move = √(DTE/365) × IV
  // Target = Expected Move × 50% (conservative)
  if (mostActiveOption.impliedVol && mostActiveOption.impliedVol > 0) {
    const ivPercent = mostActiveOption.impliedVol; // Already in decimal form (e.g., 0.50 for 50%)
    const expectedMove = Math.sqrt(daysToExpiry / 365) * ivPercent;
    const targetMultiplier = expectedMove * 0.5; // Use 50% of expected move as target
    
    // Ensure reasonable bounds (5% to 25%)
    const boundedMultiplier = Math.max(0.05, Math.min(0.25, targetMultiplier));
    
    logger.info(`📊 [FLOW] ${ticker}: IV-based target calculated - IV=${(ivPercent * 100).toFixed(1)}%, DTE=${daysToExpiry}d, Expected Move=${(expectedMove * 100).toFixed(1)}%, Target=${(boundedMultiplier * 100).toFixed(1)}%`);
    
    return {
      targetMultiplier: boundedMultiplier,
      method: 'IV-based',
      explanation: `${(boundedMultiplier * 100).toFixed(1)}% target based on ${(ivPercent * 100).toFixed(0)}% IV, ${daysToExpiry}d DTE`
    };
  }

  // METHOD 2: ATR-Based (Fallback if no IV available)
  // Fetch historical OHLC data for ATR calculation
  const ohlcData = await getTradierHistoryOHLC(ticker, 20);
  if (ohlcData && ohlcData.highs.length >= 15) {
    const atr = calculateATR(ohlcData.highs, ohlcData.lows, ohlcData.closes, 14);
    if (atr > 0) {
      const atrPercent = atr / currentPrice; // ATR as % of current price
      const targetMultiplier = atrPercent * 1.5; // Use 1.5x ATR as target
      
      // Ensure reasonable bounds (5% to 25%)
      const boundedMultiplier = Math.max(0.05, Math.min(0.25, targetMultiplier));
      
      logger.info(`📊 [FLOW] ${ticker}: ATR-based target calculated - ATR=$${atr.toFixed(2)}, ATR%=${(atrPercent * 100).toFixed(1)}%, Target=${(boundedMultiplier * 100).toFixed(1)}%`);
      
      return {
        targetMultiplier: boundedMultiplier,
        method: 'ATR-based',
        explanation: `${(boundedMultiplier * 100).toFixed(1)}% target based on ATR $${atr.toFixed(2)} (${(atrPercent * 100).toFixed(1)}% of price)`
      };
    }
  }

  // METHOD 3: Fallback to conservative 5.25% if no data available
  logger.info(`📊 [FLOW] ${ticker}: Using fallback 5.25% target (no IV/ATR data available)`);
  return {
    targetMultiplier: 0.0525,
    method: 'fallback',
    explanation: '5.25% target (fallback - no volatility data available)'
  };
}

// Generate trade idea from flow signal
async function generateTradeFromFlow(signal: FlowSignal): Promise<InsertTradeIdea | null> {
  const { ticker, direction, currentPrice, unusualOptions, totalPremium, signalStrength } = signal;

  // Find the most active strike (highest premium)
  const mostActiveOption = unusualOptions.reduce((max, opt) => 
    opt.premium > max.premium ? opt : max
  );

  // 🎯 DYNAMIC TARGETS: Calculate based on option Greeks, IV, and volatility
  const dynamicTarget = await calculateDynamicTarget(ticker, currentPrice, direction, mostActiveOption);
  const targetMultiplier = dynamicTarget.targetMultiplier;
  
  // Calculate stop loss (maintain 1.5:1 R:R minimum)
  const stopMultiplier = targetMultiplier / 1.5; // Risk is 2/3 of reward
  
  // 🔧 OPTIONS PRICING FIX: Use OPTION PREMIUM, not stock price
  // The mostActiveOption already has the last traded premium price
  const optionPremium = mostActiveOption.lastPrice;  // Option premium from Tradier
  
  // Entry/Target/Stop are now based on OPTION PREMIUM, not stock price
  const entryPrice = optionPremium;
  let targetPrice: number;
  let stopLoss: number;

  if (direction === 'long') {
    // LONG: Entry = current, Target = dynamic % above, Stop = calculated for 1.5:1 R:R
    targetPrice = entryPrice * (1 + targetMultiplier);
    stopLoss = entryPrice * (1 - stopMultiplier);
  } else {
    // SHORT: Entry = current, Target = dynamic % below, Stop = calculated for 1.5:1 R:R
    targetPrice = entryPrice * (1 - targetMultiplier);
    stopLoss = entryPrice * (1 + stopMultiplier);
  }

  // Calculate R:R ratio
  const risk = direction === 'long' ? (entryPrice - stopLoss) : (stopLoss - entryPrice);
  const reward = direction === 'long' ? (targetPrice - entryPrice) : (entryPrice - targetPrice);
  let riskRewardRatio = reward / risk;

  // 🔧 FIX: Generate OPTIONS trades (not stocks) - we're detecting options flow!
  // Use the most active option's type (call/put) to determine the option contract type
  const optionType = mostActiveOption.optionType; // 'call' or 'put'
  
  // Validate trade risk
  const validation = validateTradeRisk({
    symbol: ticker,
    assetType: 'option',  // ✅ FIXED: Generate options, not stocks
    direction,
    entryPrice,
    targetPrice,
    stopLoss,
    catalyst: `Unusual ${direction === 'long' ? 'CALL' : 'PUT'} flow detected`,
    analysis: '',
    sessionContext: '',
  });

  if (!validation.isValid) {
    logger.warn(`📊 [FLOW] ${ticker} trade rejected: ${validation.reason}`);
    return null;
  }

  // Generate timestamp and entry/exit windows
  const now = new Date();
  const timestamp = now.toISOString();
  const entryValidUntil = new Date(now.getTime() + 60 * 60 * 1000).toISOString(); // +1 hour
  
  // ✅ FIX: For options, exit_by MUST be BEFORE or ON expiry_date (can't hold past expiration!)
  const optionExpiryDate = new Date(mostActiveOption.expiration);
  // Set option expiry to 4:00 PM ET (16:00) on expiry date (when options expire)
  optionExpiryDate.setHours(16, 0, 0, 0);
  
  // Calculate default exit_by (+6 hours from now for day trade)
  const defaultExitBy = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  
  // Use the EARLIER of: (defaultExitBy OR option expiry time)
  // This ensures we never try to exit AFTER the option has expired
  const exitBy = (defaultExitBy < optionExpiryDate ? defaultExitBy : optionExpiryDate).toISOString();
  
  logger.info(`📊 [FLOW] ${ticker} TIMING: Entry valid until ${formatInTimeZone(new Date(entryValidUntil), 'America/New_York', 'MMM dd h:mm a zzz')}, Exit by ${formatInTimeZone(new Date(exitBy), 'America/New_York', 'MMM dd h:mm a zzz')} (option expires ${formatInTimeZone(optionExpiryDate, 'America/New_York', 'MMM dd h:mm a zzz')})`)

  // Build catalyst and analysis with dynamic target explanation
  const catalyst = `Unusual ${direction === 'long' ? 'CALL' : 'PUT'} Flow: ${unusualOptions.length} contracts, $${(totalPremium / 1000000).toFixed(2)}M premium`;
  
  const topOptions = unusualOptions.slice(0, 3).map(opt => 
    `${opt.optionType.toUpperCase()} $${opt.strike} (${opt.reasons.join(', ')})`
  ).join('; ');

  const targetPercent = (targetMultiplier * 100).toFixed(1);
  const analysis = `OPTIONS FLOW: Smart money betting on ${direction === 'long' ? '+' : '-'}${targetPercent}% move in option premium (${dynamicTarget.explanation}). Entry: $${entryPrice.toFixed(2)} premium for ${mostActiveOption.optionType.toUpperCase()} $${mostActiveOption.strike} (exp: ${mostActiveOption.expiration}). Most active contract: ${mostActiveOption.volume} volume, $${(mostActiveOption.premium / 1000).toFixed(0)}k premium. Top unusual options: ${topOptions}. Flow suggests ${direction === 'long' ? 'bullish' : 'bearish'} momentum on underlying ${ticker}.`;

  const sessionContext = `${formatInTimeZone(now, 'America/New_York', 'ha zzz')} - Unusual options flow detected in ${ticker}`;
  
  // 📊 DETAILED LOGGING: Show options trade details
  logger.info(`📊 [FLOW] ${ticker} OPTIONS TRADE: ${optionType.toUpperCase()} $${mostActiveOption.strike} (exp: ${mostActiveOption.expiration})`);
  logger.info(`📊 [FLOW] ${ticker} PREMIUM LEVELS: Entry=$${entryPrice.toFixed(2)}, Target=$${targetPrice.toFixed(2)} (${direction === 'long' ? '+' : '-'}${targetPercent}%), Stop=$${stopLoss.toFixed(2)}, R:R=${riskRewardRatio.toFixed(2)}:1`);
  logger.info(`📊 [FLOW] ${ticker} UNDERLYING: Stock @ $${currentPrice.toFixed(2)}, Flow suggests ${direction === 'long' ? 'bullish' : 'bearish'} momentum`);

  // 🎰 LOTTO MODE DETECTION: Check if this qualifies as a high-risk lotto play
  const isLotto = isLottoCandidate({
    lastPrice: mostActiveOption.lastPrice,
    greeks: mostActiveOption.greeks,
    expiration: mostActiveOption.expiration,
    symbol: mostActiveOption.symbol
  });
  
  if (isLotto) {
    // Override targets for lotto plays - aim for 20x return
    const lottoTargets = calculateLottoTargets(entryPrice, direction);
    targetPrice = lottoTargets.targetPrice;
    riskRewardRatio = lottoTargets.riskRewardRatio;
    logger.info(`🎰 [FLOW] ${ticker} LOTTO PLAY DETECTED: Entry=$${entryPrice.toFixed(2)}, Delta=${Math.abs(mostActiveOption.greeks?.delta || 0).toFixed(2)}, Target=$${targetPrice.toFixed(2)} (20x potential)`);
  }

  return {
    symbol: ticker,
    assetType: 'option',  // ✅ FIXED: Generate options, not stocks
    direction,
    holdingPeriod: 'day',
    entryPrice,
    targetPrice,
    stopLoss,
    riskRewardRatio,
    catalyst,
    analysis,
    sessionContext,
    timestamp,
    entryValidUntil,
    exitBy,
    source: 'flow',
    confidenceScore: signalStrength,
    qualitySignals: [
      `unusual_${direction === 'long' ? 'call' : 'put'}_flow`,
      `volume_${mostActiveOption.volume}_contracts`,
      `premium_$${(totalPremium / 1000000).toFixed(2)}M`
    ],
    probabilityBand: signalStrength >= 70 ? 'B+' : signalStrength >= 60 ? 'B' : 'C+',
    dataSourceUsed: 'tradier',
    engineVersion: 'flow_v2.1.0_options_generation',  // Updated version for options
    generationTimestamp: timestamp,
    // ✅ OPTIONS-SPECIFIC FIELDS (match schema field names)
    optionType,  // 'call' or 'put' from most active option
    strikePrice: mostActiveOption.strike,  // Match schema: strikePrice not strike
    expiryDate: mostActiveOption.expiration,  // Match schema: expiryDate not expiration
    // 🎰 LOTTO MODE FLAG
    isLottoPlay: isLotto,
  };
}

// Main flow scanner function
export async function scanUnusualOptionsFlow(): Promise<InsertTradeIdea[]> {
  logger.info(`📊 [FLOW] Starting unusual options flow scan on ${FLOW_SCAN_TICKERS.length} tickers...`);
  
  // 🚫 DEDUPLICATION: Get existing open symbols to avoid duplicate trades
  const allIdeas = await storage.getAllTradeIdeas();
  const existingOpenSymbols = new Set(
    allIdeas
      .filter((idea: any) => idea.outcomeStatus === 'open')
      .map((idea: any) => idea.symbol.toUpperCase())
  );
  
  const tradeIdeas: InsertTradeIdea[] = [];
  let scannedCount = 0;
  let unusualCount = 0;

  for (const ticker of FLOW_SCAN_TICKERS) {
    try {
      // 🚫 Skip if symbol already has an open trade
      if (existingOpenSymbols.has(ticker.toUpperCase())) {
        logger.info(`📊 [FLOW] Skipped ${ticker} - already has open trade`);
        continue;
      }
      
      // Get current stock price
      const quote = await getTradierQuote(ticker);
      if (!quote || !quote.last || quote.last <= 0) {
        logger.warn(`📊 [FLOW] No quote data for ${ticker}`);
        continue;
      }

      scannedCount++;
      const currentPrice = quote.last;

      // Detect unusual options
      const unusualOptions = await detectUnusualOptions(ticker);
      
      if (unusualOptions.length === 0) {
        continue;
      }

      unusualCount++;

      // Analyze flow signals
      const signal = analyzeFlowSignals(ticker, currentPrice, unusualOptions);
      
      if (!signal) {
        continue;
      }

      // Generate trade idea with dynamic targets
      const tradeIdea = await generateTradeFromFlow(signal);
      
      if (tradeIdea) {
        tradeIdeas.push(tradeIdea);
      }

    } catch (error) {
      logger.error(`📊 [FLOW] Error processing ${ticker}:`, error);
    }
  }

  logger.info(`📊 [FLOW] Scan complete: ${scannedCount}/${FLOW_SCAN_TICKERS.length} tickers scanned, ${unusualCount} with unusual activity, ${tradeIdeas.length} trades generated`);
  
  return tradeIdeas;
}

// Check if market hours (9:30 AM - 4:00 PM ET, Mon-Fri)
export function isMarketHoursForFlow(): boolean {
  const now = new Date();
  const etTime = formatInTimeZone(now, 'America/New_York', 'yyyy-MM-dd HH:mm:ss EEEE');
  const parts = etTime.split(' ');
  const dayName = parts[2];
  const timePart = parts[1];
  const etHour = parseInt(timePart.split(':')[0]);
  const etMinute = parseInt(timePart.split(':')[1]);

  // Skip weekends
  if (dayName === 'Saturday' || dayName === 'Sunday') {
    return false;
  }

  // Market hours: 9:30 AM - 4:00 PM ET
  if (etHour < 9 || (etHour === 9 && etMinute < 30)) {
    return false; // Before market open
  }
  if (etHour >= 16) {
    return false; // After market close
  }

  return true;
}
