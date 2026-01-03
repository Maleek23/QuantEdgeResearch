/**
 * Options Flow Scanner
 * 
 * Detects unusual institutional options activity including:
 * - Large block trades
 * - Unusual volume spikes
 * - Sweep orders
 * - Dark pool activity signals
 */

import { logger } from './logger';
import { storage } from './storage';

interface OptionsFlow {
  id: string;
  symbol: string;
  optionType: 'call' | 'put';
  strikePrice: number;
  expiryDate: string;
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  premium: number;
  impliedVolatility: number;
  delta: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  flowType: 'block' | 'sweep' | 'unusual_volume' | 'dark_pool' | 'normal';
  unusualScore: number;
  detectedAt: string;
}

interface ScannerStatus {
  isActive: boolean;
  lastScan: string | null;
  flowsDetected: number;
  todayFlows: OptionsFlow[];
  settings: {
    minPremium: number;
    minVolumeOIRatio: number;
    watchlist: string[];
    alertThreshold: number;
  };
}

let scannerStatus: ScannerStatus = {
  isActive: false,
  lastScan: null,
  flowsDetected: 0,
  todayFlows: [],
  settings: {
    minPremium: 100000, // $100k minimum premium
    minVolumeOIRatio: 2.0, // Volume 2x open interest
    watchlist: ['SPY', 'QQQ', 'META', 'GOOGL', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'AMD'],
    alertThreshold: 75, // Unusual score threshold
  },
};

/**
 * Fetch options chain data from Tradier
 */
async function fetchOptionsChain(symbol: string): Promise<any[]> {
  try {
    const apiKey = process.env.TRADIER_API_KEY;
    if (!apiKey) {
      logger.warn('[OPTIONS-FLOW] No Tradier API key configured');
      return [];
    }
    
    // Get current date and next month expiration
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    
    const response = await fetch(
      `https://api.tradier.com/v1/markets/options/chains?symbol=${symbol}&greeks=true`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Tradier API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.options?.option || [];
  } catch (error) {
    logger.error(`[OPTIONS-FLOW] Error fetching options chain for ${symbol}:`, error);
    return [];
  }
}

/**
 * Calculate unusual score for an option
 */
function calculateUnusualScore(option: any): number {
  let score = 0;
  
  // Volume/OI ratio (max 30 points)
  const volumeOI = option.volume / (option.open_interest || 1);
  if (volumeOI > 5) score += 30;
  else if (volumeOI > 3) score += 25;
  else if (volumeOI > 2) score += 20;
  else if (volumeOI > 1.5) score += 15;
  
  // Premium size (max 25 points)
  const premium = option.volume * option.last * 100;
  if (premium > 1000000) score += 25;
  else if (premium > 500000) score += 20;
  else if (premium > 250000) score += 15;
  else if (premium > 100000) score += 10;
  
  // IV percentile (max 20 points)
  const iv = option.greeks?.mid_iv || 0;
  if (iv > 0.8) score += 20;
  else if (iv > 0.6) score += 15;
  else if (iv > 0.4) score += 10;
  
  // Delta exposure (max 15 points)
  const delta = Math.abs(option.greeks?.delta || 0);
  if (delta > 0.3 && delta < 0.7) score += 15; // ATM options
  else if (delta > 0.1) score += 10;
  
  // Time to expiry bonus for near-term (max 10 points)
  const expiry = new Date(option.expiration_date);
  const daysToExpiry = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysToExpiry <= 7) score += 10;
  else if (daysToExpiry <= 14) score += 5;
  
  return Math.min(100, score);
}

/**
 * Determine flow type
 */
function determineFlowType(option: any, score: number): OptionsFlow['flowType'] {
  const premium = option.volume * option.last * 100;
  const volumeOI = option.volume / (option.open_interest || 1);
  
  if (premium > 1000000) return 'block';
  if (volumeOI > 5) return 'sweep';
  if (volumeOI > 2) return 'unusual_volume';
  if (score > 70) return 'dark_pool';
  return 'normal';
}

/**
 * Determine sentiment
 */
function determineSentiment(option: any): OptionsFlow['sentiment'] {
  const delta = option.greeks?.delta || 0;
  const optionType = option.option_type;
  
  // Calls with positive delta = bullish
  // Puts with negative delta = bearish
  if (optionType === 'call' && delta > 0.3) return 'bullish';
  if (optionType === 'put' && delta < -0.3) return 'bearish';
  return 'neutral';
}

/**
 * Scan for unusual options activity
 */
export async function scanOptionsFlow(): Promise<OptionsFlow[]> {
  if (!scannerStatus.isActive) {
    return [];
  }
  
  logger.info('[OPTIONS-FLOW] Starting options flow scan...');
  scannerStatus.lastScan = new Date().toISOString();
  
  const unusualFlows: OptionsFlow[] = [];
  
  for (const symbol of scannerStatus.settings.watchlist) {
    try {
      const chain = await fetchOptionsChain(symbol);
      
      for (const option of chain) {
        if (!option.volume || option.volume < 100) continue;
        
        const score = calculateUnusualScore(option);
        
        if (score >= scannerStatus.settings.alertThreshold) {
          const flow: OptionsFlow = {
            id: `${symbol}-${option.symbol}-${Date.now()}`,
            symbol,
            optionType: option.option_type as 'call' | 'put',
            strikePrice: option.strike,
            expiryDate: option.expiration_date,
            volume: option.volume,
            openInterest: option.open_interest || 0,
            volumeOIRatio: option.volume / (option.open_interest || 1),
            premium: option.volume * option.last * 100,
            impliedVolatility: option.greeks?.mid_iv || 0,
            delta: option.greeks?.delta || 0,
            sentiment: determineSentiment(option),
            flowType: determineFlowType(option, score),
            unusualScore: score,
            detectedAt: new Date().toISOString(),
          };
          
          unusualFlows.push(flow);
        }
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      logger.warn(`[OPTIONS-FLOW] Error scanning ${symbol}:`, error);
    }
  }
  
  // Sort by unusual score
  unusualFlows.sort((a, b) => b.unusualScore - a.unusualScore);
  
  // Update status
  scannerStatus.flowsDetected += unusualFlows.length;
  scannerStatus.todayFlows = unusualFlows.slice(0, 50); // Keep top 50
  
  logger.info(`[OPTIONS-FLOW] Found ${unusualFlows.length} unusual flows`);
  
  // Send alerts for top flows
  if (unusualFlows.length > 0) {
    await sendFlowAlerts(unusualFlows.slice(0, 5));
  }
  
  return unusualFlows;
}

/**
 * Send alerts for unusual flows
 */
async function sendFlowAlerts(flows: OptionsFlow[]): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  
  try {
    const content = [
      '# 📊 Unusual Options Flow Detected',
      '',
      ...flows.map(flow => {
        const emoji = flow.sentiment === 'bullish' ? '🟢' : flow.sentiment === 'bearish' ? '🔴' : '⚪';
        const typeEmoji = flow.flowType === 'block' ? '🐋' : flow.flowType === 'sweep' ? '🧹' : '📈';
        return `${emoji} **${flow.symbol}** ${flow.optionType.toUpperCase()} $${flow.strikePrice} ${flow.expiryDate}\n` +
          `${typeEmoji} ${flow.flowType.toUpperCase()} | Vol: ${flow.volume.toLocaleString()} | Premium: $${(flow.premium / 1000).toFixed(0)}k | Score: ${flow.unusualScore}`;
      }),
    ].join('\n');
    
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        username: 'Options Flow Scanner',
      }),
    });
  } catch (error) {
    logger.warn('[OPTIONS-FLOW] Discord alert failed:', error);
  }
}

/**
 * Get scanner status
 */
export function getOptionsFlowStatus(): ScannerStatus {
  return { ...scannerStatus };
}

/**
 * Get today's flows
 */
export function getTodayFlows(): OptionsFlow[] {
  return [...scannerStatus.todayFlows];
}

/**
 * Toggle scanner active state
 */
export function setOptionsFlowActive(active: boolean): void {
  scannerStatus.isActive = active;
  logger.info(`[OPTIONS-FLOW] Scanner ${active ? 'ACTIVATED' : 'DEACTIVATED'}`);
}

/**
 * Update scanner settings
 */
export function updateOptionsFlowSettings(settings: Partial<ScannerStatus['settings']>): void {
  scannerStatus.settings = { ...scannerStatus.settings, ...settings };
  logger.info('[OPTIONS-FLOW] Settings updated:', scannerStatus.settings);
}

/**
 * Add symbol to watchlist
 */
export function addToWatchlist(symbol: string): void {
  if (!scannerStatus.settings.watchlist.includes(symbol)) {
    scannerStatus.settings.watchlist.push(symbol);
    logger.info(`[OPTIONS-FLOW] Added ${symbol} to watchlist`);
  }
}

/**
 * Remove symbol from watchlist
 */
export function removeFromWatchlist(symbol: string): void {
  scannerStatus.settings.watchlist = scannerStatus.settings.watchlist.filter(s => s !== symbol);
  logger.info(`[OPTIONS-FLOW] Removed ${symbol} from watchlist`);
}

/**
 * Reset daily flows (call at market open)
 */
export function resetDailyFlows(): void {
  scannerStatus.todayFlows = [];
}
