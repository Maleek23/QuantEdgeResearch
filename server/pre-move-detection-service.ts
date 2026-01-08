// Pre-Move Detection Service
// Detects potential stock moves BEFORE news or market close
// Monitors: Late-day options flow, volume spikes, IV expansion, defense contracts

import { getTradierQuote, getTradierOptionsChainsByDTE } from './tradier-api';
import { sendPreMoveAlertToDiscord } from './discord-service';
import { logger } from './logger';
import { isUSMarketOpen } from '@shared/market-calendar';
import { fetchGovernmentContractsForTicker } from './catalyst-intelligence-service';

// Defense & Aerospace stocks to monitor closely
export const DEFENSE_TICKERS = ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'HII', 'LHX', 'LDOS', 'KTOS', 'AVAV'];

// High-profile movers to watch
export const HIGH_PROFILE_TICKERS = [
  ...DEFENSE_TICKERS,
  'NVDA', 'TSLA', 'AAPL', 'AMZN', 'GOOGL', 'META', 'MSFT', 'AMD', 'PLTR', 'COIN',
  'GME', 'AMC', 'MSTR', 'SMCI', 'ARM', 'IONQ', 'RGTI', 'QUBT'
];

// Pre-move signal types
export type PreMoveSignalType = 
  | 'late_day_sweep'      // Large options sweep in final hour
  | 'volume_spike'        // Volume > 2x average in last 30 min
  | 'iv_expansion'        // IV rising without news
  | 'defense_contract'    // Government contract filing
  | 'unusual_accumulation' // Quiet accumulation pattern
  | 'sector_momentum';    // Sector leader moving, others follow

export interface PreMoveSignal {
  symbol: string;
  signalType: PreMoveSignalType;
  confidence: number; // 0-100
  direction: 'bullish' | 'bearish' | 'neutral';
  details: string;
  timestamp: Date;
  metrics: {
    currentPrice?: number;
    volumeRatio?: number;      // Today's volume / 20-day avg
    ivChange?: number;         // IV change in %
    optionPremium?: number;    // Large sweep premium
    contractValue?: number;    // Government contract $
  };
}

// Cache for baseline metrics
const baselineCache = new Map<string, {
  avgVolume: number;
  avgIV: number;
  lastUpdate: number;
}>();

const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Track alerted signals to prevent duplicates
const alertedSignals = new Map<string, number>();
const ALERT_COOLDOWN = 30 * 60 * 1000; // 30 minutes

function getSignalKey(signal: PreMoveSignal): string {
  return `${signal.symbol}:${signal.signalType}:${signal.direction}`;
}

function canAlert(signal: PreMoveSignal): boolean {
  const key = getSignalKey(signal);
  const lastAlert = alertedSignals.get(key);
  if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN) {
    return false;
  }
  return true;
}

function recordAlert(signal: PreMoveSignal): void {
  alertedSignals.set(getSignalKey(signal), Date.now());
}

// Check if we're in the "power hour" (last hour before close)
function isInPowerHour(): boolean {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = etNow.getHours();
  const minutes = etNow.getMinutes();
  
  // Power hour: 3:00 PM - 4:00 PM ET
  return hours === 15 || (hours === 16 && minutes === 0);
}

// Check if we're in the final 30 minutes
function isInFinal30Minutes(): boolean {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = etNow.getHours();
  const minutes = etNow.getMinutes();
  
  // Final 30 min: 3:30 PM - 4:00 PM ET
  return hours === 15 && minutes >= 30;
}

// Detect late-day options sweeps
export async function detectLateDaySweeps(ticker: string): Promise<PreMoveSignal | null> {
  if (!isInPowerHour()) return null;
  
  try {
    const options = await getTradierOptionsChainsByDTE(ticker);
    if (!options || options.length === 0) return null;
    
    // Look for large volume on short-dated options
    let totalCallVolume = 0;
    let totalPutVolume = 0;
    let largestSweep = { volume: 0, premium: 0, type: 'call' as 'call' | 'put', strike: 0 };
    
    for (const opt of options) {
      if (!opt.volume || opt.volume < 100) continue;
      
      const premium = (opt.volume * (opt.last || opt.bid || 0) * 100);
      
      if (opt.option_type === 'call') {
        totalCallVolume += opt.volume;
        if (premium > largestSweep.premium) {
          largestSweep = { volume: opt.volume, premium, type: 'call', strike: opt.strike };
        }
      } else {
        totalPutVolume += opt.volume;
        if (premium > largestSweep.premium) {
          largestSweep = { volume: opt.volume, premium, type: 'put', strike: opt.strike };
        }
      }
    }
    
    // Significant sweep: > $500k premium on a single strike
    if (largestSweep.premium < 500000) return null;
    
    const direction = largestSweep.type === 'call' ? 'bullish' : 'bearish';
    const confidence = Math.min(95, 70 + Math.floor(largestSweep.premium / 200000));
    
    const quote = await getTradierQuote(ticker);
    
    return {
      symbol: ticker,
      signalType: 'late_day_sweep',
      confidence,
      direction,
      details: `🔥 POWER HOUR SWEEP: ${ticker} $${largestSweep.strike} ${largestSweep.type.toUpperCase()} - ${largestSweep.volume.toLocaleString()} contracts, $${(largestSweep.premium / 1000000).toFixed(2)}M premium`,
      timestamp: new Date(),
      metrics: {
        currentPrice: quote?.last || 0,
        optionPremium: largestSweep.premium
      }
    };
  } catch (e) {
    logger.error(`[PRE-MOVE] Error detecting sweeps for ${ticker}:`, e);
    return null;
  }
}

// Detect volume spikes in final 30 minutes
export async function detectVolumeSpike(ticker: string): Promise<PreMoveSignal | null> {
  if (!isInFinal30Minutes()) return null;
  
  try {
    const quote = await getTradierQuote(ticker);
    if (!quote || !quote.volume || !quote.average_volume) return null;
    
    const volumeRatio = quote.volume / quote.average_volume;
    
    // Need at least 2x average volume
    if (volumeRatio < 2) return null;
    
    // Price direction determines bullish/bearish
    const priceChange = quote.change_percentage || 0;
    const direction = priceChange > 0.5 ? 'bullish' : priceChange < -0.5 ? 'bearish' : 'neutral';
    
    const confidence = Math.min(90, 60 + Math.floor(volumeRatio * 5));
    
    return {
      symbol: ticker,
      signalType: 'volume_spike',
      confidence,
      direction,
      details: `📊 VOLUME SPIKE: ${ticker} trading at ${volumeRatio.toFixed(1)}x average volume in final 30 min. Price ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
      timestamp: new Date(),
      metrics: {
        currentPrice: quote.last,
        volumeRatio
      }
    };
  } catch (e) {
    logger.error(`[PRE-MOVE] Error detecting volume spike for ${ticker}:`, e);
    return null;
  }
}

// Detect IV expansion without news (someone knows something)
export async function detectIVExpansion(ticker: string): Promise<PreMoveSignal | null> {
  try {
    const options = await getTradierOptionsChainsByDTE(ticker);
    if (!options || options.length === 0) return null;
    
    // Calculate average ATM IV
    const quote = await getTradierQuote(ticker);
    if (!quote || !quote.last) return null;
    
    const atPrice = quote.last;
    const atmOptions = options.filter(opt => {
      const distance = Math.abs(opt.strike - atPrice) / atPrice;
      return distance < 0.05 && opt.greeks?.mid_iv;
    });
    
    if (atmOptions.length === 0) return null;
    
    const currentIV = atmOptions.reduce((sum, opt) => sum + (opt.greeks?.mid_iv || 0), 0) / atmOptions.length;
    
    // Check against baseline
    const cached = baselineCache.get(ticker);
    const now = Date.now();
    
    if (!cached || now - cached.lastUpdate > CACHE_TTL) {
      // Set baseline
      baselineCache.set(ticker, {
        avgVolume: quote.average_volume || quote.volume || 0,
        avgIV: currentIV,
        lastUpdate: now
      });
      return null;
    }
    
    const ivChange = ((currentIV - cached.avgIV) / cached.avgIV) * 100;
    
    // Need at least 15% IV expansion
    if (ivChange < 15) return null;
    
    const confidence = Math.min(88, 65 + Math.floor(ivChange / 2));
    
    return {
      symbol: ticker,
      signalType: 'iv_expansion',
      confidence,
      direction: 'neutral', // IV expansion alone doesn't indicate direction
      details: `⚡ IV EXPANSION: ${ticker} IV up ${ivChange.toFixed(1)}% from baseline (${(cached.avgIV * 100).toFixed(0)}% → ${(currentIV * 100).toFixed(0)}%). Market pricing in a move.`,
      timestamp: new Date(),
      metrics: {
        currentPrice: quote.last,
        ivChange
      }
    };
  } catch (e) {
    logger.error(`[PRE-MOVE] Error detecting IV expansion for ${ticker}:`, e);
    return null;
  }
}

// Monitor defense contracts (for LMT, RTX, NOC, etc.)
export async function checkDefenseContracts(ticker: string): Promise<PreMoveSignal | null> {
  if (!DEFENSE_TICKERS.includes(ticker)) return null;
  
  try {
    const contracts = await fetchGovernmentContractsForTicker(ticker);
    if (!contracts || contracts.length === 0) return null;
    
    // Check for recent contracts (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentContracts = contracts.filter(c => new Date(c.awardDate) > oneDayAgo);
    
    if (recentContracts.length === 0) return null;
    
    // Find largest contract
    const largest = recentContracts.reduce((max, c) => 
      (c.obligationAmount || 0) > (max.obligationAmount || 0) ? c : max
    );
    
    if (!largest.obligationAmount || largest.obligationAmount < 10000000) return null; // Min $10M
    
    const quote = await getTradierQuote(ticker);
    const confidence = Math.min(95, 75 + Math.floor(Math.log10(largest.obligationAmount) * 3));
    
    return {
      symbol: ticker,
      signalType: 'defense_contract',
      confidence,
      direction: 'bullish',
      details: `🇺🇸 DEFENSE CONTRACT: ${ticker} awarded $${(largest.obligationAmount / 1000000).toFixed(1)}M contract from ${largest.awardingAgencyName || 'Government'}. ${largest.description?.slice(0, 100) || ''}`,
      timestamp: new Date(),
      metrics: {
        currentPrice: quote?.last || 0,
        contractValue: largest.obligationAmount
      }
    };
  } catch (e) {
    logger.error(`[PRE-MOVE] Error checking defense contracts for ${ticker}:`, e);
    return null;
  }
}

// Main scan function - runs all detection algorithms
export async function scanForPreMoveSignals(tickers: string[] = HIGH_PROFILE_TICKERS): Promise<PreMoveSignal[]> {
  const marketStatus = isUSMarketOpen();
  if (!marketStatus.isOpen) {
    logger.info('[PRE-MOVE] Market closed, skipping scan');
    return [];
  }
  
  logger.info(`[PRE-MOVE] Scanning ${tickers.length} tickers for pre-move signals...`);
  const signals: PreMoveSignal[] = [];
  
  // Process in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (ticker) => {
      const tickerSignals: PreMoveSignal[] = [];
      
      // Run all detection algorithms in parallel
      const [sweep, volume, iv, contract] = await Promise.all([
        detectLateDaySweeps(ticker),
        detectVolumeSpike(ticker),
        detectIVExpansion(ticker),
        checkDefenseContracts(ticker)
      ]);
      
      if (sweep) tickerSignals.push(sweep);
      if (volume) tickerSignals.push(volume);
      if (iv) tickerSignals.push(iv);
      if (contract) tickerSignals.push(contract);
      
      return tickerSignals;
    });
    
    const batchResults = await Promise.all(batchPromises);
    for (const result of batchResults) {
      signals.push(...result);
    }
    
    // Small delay between batches
    if (i + batchSize < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Sort by confidence
  signals.sort((a, b) => b.confidence - a.confidence);
  
  // Send alerts for high-confidence signals
  for (const signal of signals) {
    if (signal.confidence >= 75 && canAlert(signal)) {
      try {
        await sendPreMoveAlertToDiscord(signal);
        recordAlert(signal);
        logger.info(`[PRE-MOVE] Alert sent: ${signal.symbol} - ${signal.signalType} (${signal.confidence}%)`);
      } catch (e) {
        logger.error(`[PRE-MOVE] Failed to send alert for ${signal.symbol}:`, e);
      }
    }
  }
  
  logger.info(`[PRE-MOVE] Scan complete. Found ${signals.length} signals, ${signals.filter(s => s.confidence >= 75).length} high-confidence`);
  
  return signals;
}

// Schedule regular scans during market hours
let scanInterval: ReturnType<typeof setInterval> | null = null;

export function startPreMoveScanner(): void {
  if (scanInterval) return;
  
  logger.info('[PRE-MOVE] Starting Pre-Move Detection Scanner...');
  
  // Run every 5 minutes during market hours
  scanInterval = setInterval(async () => {
    const marketStatus = isUSMarketOpen();
    if (!marketStatus.isOpen) return;
    
    // Intensify scanning during power hour
    if (isInPowerHour()) {
      await scanForPreMoveSignals(HIGH_PROFILE_TICKERS);
    } else {
      // Regular hours: just scan defense stocks
      await scanForPreMoveSignals(DEFENSE_TICKERS);
    }
  }, 5 * 60 * 1000);
  
  // Initial scan
  scanForPreMoveSignals(DEFENSE_TICKERS).catch(console.error);
}

export function stopPreMoveScanner(): void {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    logger.info('[PRE-MOVE] Pre-Move Detection Scanner stopped');
  }
}
