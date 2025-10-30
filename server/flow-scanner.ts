// DIY Unusual Options Flow Scanner
// Detects unusual options activity and generates stock trade ideas

import type { InsertTradeIdea } from "@shared/schema";
import { getTradierQuote, getTradierOptionsChain } from './tradier-api';
import { validateTradeRisk } from './ai-service';
import { logger } from './logger';
import { formatInTimeZone } from 'date-fns-tz';

// Top 20 high-volume tickers for flow scanning
const FLOW_SCAN_TICKERS = [
  'SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD',
  'NFLX', 'DIS', 'BA', 'COIN', 'PLTR', 'SOFI', 'HOOD', 'RIOT', 'MARA', 'MSTR'
];

// Unusual activity thresholds
const VOLUME_RATIO_THRESHOLD = 3.0; // 3x average volume
const PREMIUM_THRESHOLD = 100000; // $100k+ premium
const IV_THRESHOLD = 100; // 100%+ implied volatility

interface UnusualOption {
  symbol: string;
  underlying: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  volume: number;
  averageVolume: number;
  volumeRatio: number;
  premium: number; // volume * last * 100
  lastPrice: number;
  impliedVol: number;
  reasons: string[];
}

interface FlowSignal {
  ticker: string;
  direction: 'long' | 'short';
  currentPrice: number;
  unusualOptions: UnusualOption[];
  totalPremium: number;
  signalStrength: number;
}

// Detect unusual options activity
async function detectUnusualOptions(ticker: string): Promise<UnusualOption[]> {
  try {
    logger.info(`📊 [FLOW] Scanning options for ${ticker}...`);
    
    // Get options chain
    const options = await getTradierOptionsChain(ticker);
    
    if (options.length === 0) {
      logger.info(`📊 [FLOW] No options data available for ${ticker}`);
      return [];
    }

    const unusualOptions: UnusualOption[] = [];

    for (const option of options) {
      // Skip if missing critical data
      if (!option.volume || !option.average_volume || !option.last || option.last <= 0) {
        continue;
      }

      const volumeRatio = option.volume / Math.max(option.average_volume, 1);
      const premium = option.volume * option.last * 100; // Contract size = 100
      const impliedVol = option.greeks?.mid_iv || option.greeks?.bid_iv || 0;

      const reasons: string[] = [];
      let isUnusual = false;

      // Check volume ratio
      if (volumeRatio >= VOLUME_RATIO_THRESHOLD) {
        reasons.push(`${volumeRatio.toFixed(1)}x avg volume`);
        isUnusual = true;
      }

      // Check premium
      if (premium >= PREMIUM_THRESHOLD) {
        reasons.push(`$${(premium / 1000).toFixed(0)}k premium`);
        isUnusual = true;
      }

      // Check IV spike
      if (impliedVol >= IV_THRESHOLD) {
        reasons.push(`${impliedVol.toFixed(0)}% IV`);
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
          averageVolume: option.average_volume,
          volumeRatio,
          premium,
          lastPrice: option.last,
          impliedVol,
          reasons
        });

        logger.info(`📊 [FLOW] UNUSUAL: ${ticker} ${option.option_type.toUpperCase()} $${option.strike} - ${reasons.join(', ')}`);
      }
    }

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

  // Calculate signal strength (0-100)
  const avgVolumeRatio = dominantOptions.reduce((sum, opt) => sum + opt.volumeRatio, 0) / dominantOptions.length;
  const signalStrength = Math.min(100, 50 + (avgVolumeRatio - VOLUME_RATIO_THRESHOLD) * 10);

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

// Generate trade idea from flow signal
function generateTradeFromFlow(signal: FlowSignal): InsertTradeIdea | null {
  const { ticker, direction, currentPrice, unusualOptions, totalPremium, signalStrength } = signal;

  // Find the most active strike (highest premium)
  const mostActiveOption = unusualOptions.reduce((max, opt) => 
    opt.premium > max.premium ? opt : max
  );

  const targetStrike = mostActiveOption.strike;

  // Calculate entry, target, and stop
  const entryPrice = currentPrice;
  let targetPrice: number;
  let stopLoss: number;

  if (direction === 'long') {
    // LONG: Entry = current, Target = strike, Stop = 3.5% below entry
    targetPrice = targetStrike;
    stopLoss = entryPrice * 0.965; // 3.5% below
  } else {
    // SHORT: Entry = current, Target = strike, Stop = 3.5% above entry
    targetPrice = targetStrike;
    stopLoss = entryPrice * 1.035; // 3.5% above
  }

  // Calculate R:R ratio
  const risk = direction === 'long' ? (entryPrice - stopLoss) : (stopLoss - entryPrice);
  const reward = direction === 'long' ? (targetPrice - entryPrice) : (entryPrice - targetPrice);
  const riskRewardRatio = reward / risk;

  // Validate trade risk
  const validation = validateTradeRisk({
    symbol: ticker,
    assetType: 'stock',
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
  const exitBy = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(); // +6 hours (day trade)

  // Build catalyst and analysis
  const catalyst = `Unusual ${direction === 'long' ? 'CALL' : 'PUT'} Flow: ${unusualOptions.length} contracts, $${(totalPremium / 1000000).toFixed(2)}M premium`;
  
  const topOptions = unusualOptions.slice(0, 3).map(opt => 
    `${opt.optionType.toUpperCase()} $${opt.strike} (${opt.reasons.join(', ')})`
  ).join('; ');

  const analysis = `Smart money targeting $${targetStrike} strike. Most active: ${mostActiveOption.optionType.toUpperCase()} $${mostActiveOption.strike} with ${mostActiveOption.volumeRatio.toFixed(1)}x volume surge and $${(mostActiveOption.premium / 1000).toFixed(0)}k premium. Top unusual options: ${topOptions}. Flow suggests ${direction === 'long' ? 'bullish' : 'bearish'} move toward $${targetStrike}.`;

  const sessionContext = `${formatInTimeZone(now, 'America/New_York', 'ha zzz')} - Unusual options flow detected in ${ticker}`;

  return {
    symbol: ticker,
    assetType: 'stock',
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
      `volume_surge_${mostActiveOption.volumeRatio.toFixed(1)}x`,
      `premium_$${(totalPremium / 1000000).toFixed(2)}M`
    ],
    probabilityBand: signalStrength >= 70 ? 'B+' : signalStrength >= 60 ? 'B' : 'C+',
    dataSourceUsed: 'tradier',
    engineVersion: 'flow_v1.0.0',
    generationTimestamp: timestamp,
  };
}

// Main flow scanner function
export async function scanUnusualOptionsFlow(): Promise<InsertTradeIdea[]> {
  logger.info(`📊 [FLOW] Starting unusual options flow scan on ${FLOW_SCAN_TICKERS.length} tickers...`);
  
  const tradeIdeas: InsertTradeIdea[] = [];
  let scannedCount = 0;
  let unusualCount = 0;

  for (const ticker of FLOW_SCAN_TICKERS) {
    try {
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

      // Generate trade idea
      const tradeIdea = generateTradeFromFlow(signal);
      
      if (tradeIdea) {
        tradeIdeas.push(tradeIdea);
        logger.info(`📊 [FLOW] Generated ${signal.direction.toUpperCase()} trade for ${ticker}: Entry=$${currentPrice}, Target=$${tradeIdea.targetPrice}, Stop=$${tradeIdea.stopLoss}, R:R=${tradeIdea.riskRewardRatio.toFixed(2)}:1`);
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
