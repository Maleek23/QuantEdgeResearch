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
import { recordSymbolAttention } from './attention-tracking-service';
import { db } from './db';
import { optionsFlowHistory, watchlist, FlowStrategyCategory, FlowDteCategory } from '@shared/schema';
import { eq, desc, gte, inArray, and, sql } from 'drizzle-orm';

/**
 * Classify a flow by strategy category and DTE horizon
 * Identifies lotto plays (whale OTM calls/puts) vs institutional blocks
 */
function classifyFlowStrategy(flow: {
  premium: number;
  delta: number;
  expiryDate: string;
  flowType: 'block' | 'sweep' | 'unusual_volume' | 'dark_pool' | 'normal';
}): { strategyCategory: FlowStrategyCategory; dteCategory: FlowDteCategory; isLotto: boolean } {
  const today = new Date();
  const expiry = new Date(flow.expiryDate);
  const dte = Math.max(0, Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  
  // Determine DTE category
  let dteCategory: FlowDteCategory;
  if (dte === 0) {
    dteCategory = '0DTE';
  } else if (dte <= 2) {
    dteCategory = '1-2DTE';
  } else if (dte <= 7) {
    dteCategory = '3-7DTE';
  } else if (dte <= 21) {
    dteCategory = 'swing';
  } else if (dte <= 60) {
    dteCategory = 'monthly';
  } else {
    dteCategory = 'leaps';
  }
  
  // Lotto detection: Far OTM (low delta) with moderate premium
  // Premium per contract between $20-$500 ($0.20-$5.00) with delta < 0.15
  const perContractPremium = flow.premium / 100; // Convert to per-contract
  const absDelta = Math.abs(flow.delta);
  
  const isLotto = (
    perContractPremium >= 0.20 &&
    perContractPremium <= 5.00 &&
    absDelta <= 0.15 &&
    dte <= 45
  );
  
  // Determine strategy category
  let strategyCategory: FlowStrategyCategory;
  if (isLotto) {
    strategyCategory = 'lotto';
  } else if (flow.flowType === 'block' || flow.flowType === 'dark_pool') {
    strategyCategory = 'institutional';
  } else if (dte === 0) {
    strategyCategory = 'scalp';
  } else if (dte <= 7) {
    strategyCategory = 'swing';
  } else {
    strategyCategory = 'monthly';
  }
  
  return { strategyCategory, dteCategory, isLotto };
}

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

// Expanded watchlist for options flow scanning (80+ high-volume optionable stocks)
const DEFAULT_OPTIONS_WATCHLIST = [
  // Major Indices & ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'ARKK', 'TQQQ', 'SOXL',
  // Mega-Cap Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'AVGO', 'NFLX',
  // AI & Semiconductors
  'ARM', 'SMCI', 'PLTR', 'SNOW', 'CRWD', 'AI', 'MRVL', 'QCOM', 'INTC', 'MU',
  // High Volatility Favorites
  'IONQ', 'RGTI', 'QUBT', 'MSTR', 'COIN', 'HOOD', 'SOFI', 'AFRM', 'SQ', 'PYPL',
  // Growth & Momentum
  'CRM', 'SHOP', 'DDOG', 'NET', 'ZS', 'PANW', 'ADBE', 'NOW', 'WDAY',
  // EV & Energy
  'RIVN', 'LCID', 'NIO', 'XPEV', 'ENPH', 'FSLR',
  // Financials
  'JPM', 'GS', 'BAC', 'V', 'MA',
  // Healthcare
  'UNH', 'LLY', 'JNJ', 'MRNA', 'PFE',
  // Other High Volume
  'BA', 'DIS', 'WMT', 'HD', 'MCD', 'COST',
  // High-Momentum Mid-Caps (frequently have big moves)
  'CVNA', 'UPST', 'W', 'DASH', 'ABNB', 'UBER', 'LYFT', 'RBLX', 'U', 'SNAP',
  // China ADRs (volume surge Jan 2026)
  'BABA', 'BIDU', 'JD', 'PDD', 'LI', 'XPEV',
  // Meme & Retail Favorites
  'GME', 'AMC', 'BBBY', 'FUBO', 'OPEN', 'CLOV',
  // Biotech High-Vol
  'MRNA', 'BNTX', 'NVAX', 'SGEN', 'REGN'
];

let scannerStatus: ScannerStatus = {
  isActive: true,  // Scanners run by default via cron schedules
  lastScan: null,
  flowsDetected: 0,
  todayFlows: [],
  settings: {
    minPremium: 50000, // Lowered to $50k minimum premium (better for smaller flows)
    minVolumeOIRatio: 1.5, // Lowered threshold for unusual volume
    watchlist: DEFAULT_OPTIONS_WATCHLIST,
    alertThreshold: 70, // Slightly lower threshold to catch more activity
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
  
  // 📊 PERSIST FLOWS TO DATABASE - Track for historical analysis
  if (unusualFlows.length > 0) {
    try {
      // Get all watchlist symbols to mark matching flows
      const allWatchlistSymbols = await db.select({ symbol: watchlist.symbol })
        .from(watchlist);
      const watchlistSet = new Set(allWatchlistSymbols.map(w => w.symbol.toUpperCase()));
      
      const today = new Date().toISOString().split('T')[0];
      
      // Persist flows meeting quality criteria: premium >= $50k OR unusualScore >= 75
      const flowsToSave = unusualFlows.filter(f => f.premium >= 50000 || f.unusualScore >= 75);
      
      // Query existing flows for today to prevent duplicates
      const existingFlows = await db.select({
        symbol: optionsFlowHistory.symbol,
        optionType: optionsFlowHistory.optionType,
        strikePrice: optionsFlowHistory.strikePrice,
        expirationDate: optionsFlowHistory.expirationDate,
      }).from(optionsFlowHistory)
        .where(eq(optionsFlowHistory.detectedDate, today));
      
      // Create dedup set for fast lookup
      const existingSet = new Set(existingFlows.map(f => 
        `${f.symbol}-${f.optionType}-${f.strikePrice}-${f.expirationDate}`.toUpperCase()
      ));
      
      let savedCount = 0;
      for (const flow of flowsToSave) {
        const flowKey = `${flow.symbol}-${flow.optionType}-${flow.strikePrice}-${flow.expiryDate}`.toUpperCase();
        
        // Skip if already exists for today
        if (existingSet.has(flowKey)) continue;
        
        try {
          // Classify the flow by strategy type
          const classification = classifyFlowStrategy({
            premium: flow.premium,
            delta: flow.delta,
            expiryDate: flow.expiryDate,
            flowType: flow.flowType
          });
          
          await db.insert(optionsFlowHistory).values({
            symbol: flow.symbol,
            optionType: flow.optionType,
            strikePrice: flow.strikePrice,
            expirationDate: flow.expiryDate,
            volume: flow.volume,
            openInterest: flow.openInterest,
            volumeOIRatio: flow.volumeOIRatio,
            premium: flow.premium / 100, // Store per-contract premium
            totalPremium: flow.premium,
            impliedVolatility: flow.impliedVolatility,
            delta: flow.delta,
            sentiment: flow.sentiment,
            flowType: flow.flowType,
            unusualScore: flow.unusualScore,
            strategyCategory: classification.strategyCategory,
            dteCategory: classification.dteCategory,
            isLotto: classification.isLotto,
            isWatchlistSymbol: watchlistSet.has(flow.symbol.toUpperCase()),
            detectedDate: today,
          });
          existingSet.add(flowKey); // Mark as saved for remaining flows
          savedCount++;
          
          if (classification.isLotto) {
            logger.info(`[OPTIONS-FLOW] 🎰 LOTTO DETECTED: ${flow.symbol} ${flow.optionType.toUpperCase()} $${flow.strikePrice} (${classification.dteCategory})`);
          }
        } catch (insertErr) {
          // Skip insert errors (e.g., constraint violations)
        }
      }
      logger.info(`[OPTIONS-FLOW] Persisted ${savedCount} new flows to history (${flowsToSave.length} qualified, ${flowsToSave.length - savedCount} skipped as duplicates)`);
    } catch (dbErr) {
      logger.warn(`[OPTIONS-FLOW] Failed to persist flows:`, dbErr);
    }
  }
  
  // 🎯 CONVERGENCE TRACKING: Record unusual flow for heat map
  for (const flow of unusualFlows.slice(0, 10)) {
    try {
      await recordSymbolAttention(flow.symbol, 'ml_signal', 'scan', {
        direction: flow.sentiment === 'bullish' ? 'bullish' : flow.sentiment === 'bearish' ? 'bearish' : undefined,
        confidence: Math.min(100, flow.unusualScore),
        message: `${flow.flowType.toUpperCase()} ${flow.optionType.toUpperCase()} $${flow.strikePrice} - $${(flow.premium / 1000).toFixed(0)}k premium`
      });
    } catch (attentionErr) {
      logger.debug(`[OPTIONS-FLOW] Attention tracking failed:`, attentionErr);
    }
  }
  
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

/**
 * Get flow history for watchlist symbols over the past N days
 */
export async function getWatchlistFlowHistory(days: number = 7): Promise<{
  flows: any[];
  summary: {
    totalFlows: number;
    bullishFlows: number;
    bearishFlows: number;
    totalPremium: number;
    topSymbols: { symbol: string; flowCount: number; totalPremium: number }[];
  };
}> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    // Get all watchlist symbols
    const watchlistSymbols = await db.select({ symbol: watchlist.symbol })
      .from(watchlist);
    const symbols = watchlistSymbols.map(w => w.symbol.toUpperCase());
    
    if (symbols.length === 0) {
      return {
        flows: [],
        summary: { totalFlows: 0, bullishFlows: 0, bearishFlows: 0, totalPremium: 0, topSymbols: [] }
      };
    }
    
    // Query flow history for watchlist symbols
    const flows = await db.select()
      .from(optionsFlowHistory)
      .where(and(
        gte(optionsFlowHistory.detectedDate, startDateStr),
        inArray(sql`UPPER(${optionsFlowHistory.symbol})`, symbols)
      ))
      .orderBy(desc(optionsFlowHistory.detectedAt))
      .limit(100);
    
    // Calculate summary stats
    const bullishFlows = flows.filter(f => f.sentiment === 'bullish').length;
    const bearishFlows = flows.filter(f => f.sentiment === 'bearish').length;
    const totalPremium = flows.reduce((sum, f) => sum + (f.totalPremium || 0), 0);
    
    // Group by symbol for top symbols
    const symbolStats: Record<string, { flowCount: number; totalPremium: number }> = {};
    for (const flow of flows) {
      const sym = flow.symbol.toUpperCase();
      if (!symbolStats[sym]) {
        symbolStats[sym] = { flowCount: 0, totalPremium: 0 };
      }
      symbolStats[sym].flowCount++;
      symbolStats[sym].totalPremium += flow.totalPremium || 0;
    }
    
    const topSymbols = Object.entries(symbolStats)
      .map(([symbol, stats]) => ({ symbol, ...stats }))
      .sort((a, b) => b.totalPremium - a.totalPremium)
      .slice(0, 10);
    
    return {
      flows,
      summary: {
        totalFlows: flows.length,
        bullishFlows,
        bearishFlows,
        totalPremium,
        topSymbols
      }
    };
  } catch (error) {
    logger.error('[OPTIONS-FLOW] Failed to get watchlist flow history:', error);
    return {
      flows: [],
      summary: { totalFlows: 0, bullishFlows: 0, bearishFlows: 0, totalPremium: 0, topSymbols: [] }
    };
  }
}

/**
 * Get flow history for a specific symbol
 */
export async function getSymbolFlowHistory(symbol: string, days: number = 30): Promise<any[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const flows = await db.select()
      .from(optionsFlowHistory)
      .where(and(
        gte(optionsFlowHistory.detectedDate, startDateStr),
        eq(sql`UPPER(${optionsFlowHistory.symbol})`, symbol.toUpperCase())
      ))
      .orderBy(desc(optionsFlowHistory.detectedAt))
      .limit(50);
    
    return flows;
  } catch (error) {
    logger.error(`[OPTIONS-FLOW] Failed to get flow history for ${symbol}:`, error);
    return [];
  }
}
