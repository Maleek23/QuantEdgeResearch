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
  
  // Determine DTE category - aligned with lotto-detector categories
  let dteCategory: FlowDteCategory;
  if (dte === 0) {
    dteCategory = '0DTE';
  } else if (dte <= 2) {
    dteCategory = '1-2DTE';
  } else if (dte <= 7) {
    dteCategory = '3-7DTE';
  } else if (dte <= 30) {
    dteCategory = 'swing';      // 8-30 DTE = swing
  } else if (dte <= 90) {
    dteCategory = 'monthly';    // 31-90 DTE = monthly/quarterly
  } else {
    dteCategory = 'leaps';      // 90+ DTE = LEAPS
  }
  
  // Lotto detection - ALIGNED with lotto-detector.ts thresholds:
  // - Entry: $0.20-$8.00 per contract (LOTTO_ENTRY_MIN/MAX)
  // - Delta: <= 0.15 (LOTTO_DELTA_MAX)
  // - DTE: 0-540 days (LOTTO_MAX_DTE) - includes LEAPS lottos
  const perContractPremium = flow.premium / 100; // Convert to per-contract
  const absDelta = Math.abs(flow.delta);
  
  const isLotto = (
    perContractPremium >= 0.20 &&
    perContractPremium <= 8.00 &&    // Expanded for LEAPS lottos
    absDelta <= 0.15 &&
    dte <= 540                        // Allow LEAPS up to 18 months
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

// Expanded watchlist for options flow scanning (100+ high-volume optionable stocks)
// PRIORITIZE: Momentum stocks with frequent surges (crypto miners, space, fintech)
const DEFAULT_OPTIONS_WATCHLIST = [
  // 🔥 HIGH PRIORITY - Crypto Miners & Data Centers (IREN, MARA, RIOT, CLSK, APLD surge together)
  'IREN', 'MARA', 'RIOT', 'CLSK', 'WULF', 'BITF', 'HUT', 'CIFR', 'COIN', 'MSTR', 'APLD',
  // 🔥 HIGH PRIORITY - Space & Defense Momentum (RDW, ASTS, LUNR often surge)
  'RKLB', 'RDW', 'ASTS', 'LUNR', 'JOBY', 'ACHR', 'RCAT', 'LMT', 'RTX', 'NOC', 'GD',
  // 🔥 HIGH PRIORITY - Fintech Momentum (ONDS, ZETA often surge)
  'ONDS', 'ZETA', 'SOFI', 'HOOD', 'AFRM', 'UPST', 'BILL', 'TOST', 'FOUR', 'FLYW', 'PAYO', 'NU',
  // 🔥 HIGH PRIORITY - AI & Quantum (volatile, frequent moves)
  'IONQ', 'RGTI', 'QUBT', 'PLTR', 'AI', 'SOUN', 'ARQQ', 'QBTS', 'LAES', 'NBIS',
  // Major Indices & ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'ARKK', 'TQQQ', 'SOXL',
  // 🥇 COMMODITY ETFs - Metals, Gold, Silver, Copper (user requested)
  'GLD', 'SLV', 'COPX', 'GDX', 'GDXJ', 'SIL', 'SILJ', 'JNUG', 'NUGT', 'GOLD', 'NEM', 'FCX', 'SCCO', 'TECK',
  // 🛢️ OIL & GAS ETFs
  'USO', 'XOP', 'OIH', 'UCO', 'GUSH', 'DRIP',
  // Mega-Cap Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'AVGO', 'NFLX',
  // AI & Semiconductors
  'ARM', 'SMCI', 'SNOW', 'CRWD', 'MRVL', 'QCOM', 'INTC', 'MU',
  // Growth & Momentum
  'CRM', 'SHOP', 'DDOG', 'NET', 'ZS', 'PANW', 'ADBE', 'NOW', 'WDAY', 'SQ', 'PYPL',
  // EV & Energy / Nuclear / Clean Tech
  'RIVN', 'LCID', 'NIO', 'XPEV', 'ENPH', 'FSLR', 'SMR', 'OKLO', 'CEG', 'VST', 'NNE', 'LEU', 'CCJ',
  // Healthcare & Biotech
  'UNH', 'LLY', 'JNJ', 'MRNA', 'PFE', 'DNA', 'CRSP', 'EDIT', 'NTLA', 'BEAM', 'BNTX', 'NVAX',
  // High-Momentum Mid-Caps (frequently have big moves)
  'CVNA', 'W', 'DASH', 'ABNB', 'UBER', 'LYFT', 'RBLX', 'U', 'SNAP',
  // China ADRs (volume surge)
  'BABA', 'BIDU', 'JD', 'PDD', 'LI',
  // Meme & Retail Favorites
  'GME', 'AMC', 'FUBO', 'OPEN', 'CLOV',
  // Speculative plays (often surge)
  'USAR', 'BNAI', 'KULR', 'QS', 'SLDP',
  // Cannabis (High Vol Options)
  'TLRY', 'CGC', 'SNDL',
  // SPACs & Recent IPOs with Options
  'DWAC', 'DKNG',
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
 * Gets expirations first, then fetches chains for each expiration
 */
async function fetchOptionsChain(symbol: string): Promise<any[]> {
  try {
    const apiKey = process.env.TRADIER_API_KEY;
    if (!apiKey) {
      logger.warn('[OPTIONS-FLOW] No Tradier API key configured');
      return [];
    }
    
    // Step 1: Get available expirations first (REQUIRED by Tradier)
    const expResponse = await fetch(
      `https://api.tradier.com/v1/markets/options/expirations?symbol=${symbol}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      }
    );
    
    if (!expResponse.ok) {
      logger.warn(`[OPTIONS-FLOW] Failed to get expirations for ${symbol}: ${expResponse.status}`);
      return [];
    }
    
    const expData = await expResponse.json();
    const expirations: string[] = expData.expirations?.date || [];
    
    if (expirations.length === 0) {
      return [];
    }
    
    // Step 2: Get next 4 expirations to capture near-term flow
    const nearTermExpirations = expirations.slice(0, 4);
    const allOptions: any[] = [];
    
    for (const expiration of nearTermExpirations) {
      const response = await fetch(
        `https://api.tradier.com/v1/markets/options/chains?symbol=${symbol}&expiration=${expiration}&greeks=true`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const options = data.options?.option || [];
        allOptions.push(...options);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return allOptions;
  } catch (error) {
    logger.error(`[OPTIONS-FLOW] Error fetching options chain for ${symbol}:`, error);
    return [];
  }
}

/**
 * Get best available price for an option (with fallbacks)
 * Uses last price, then mid-price (bid+ask)/2, then bid, then ask
 */
function getOptionPrice(option: any): number {
  if (option.last && option.last > 0) return option.last;
  if (option.bid && option.ask) return (option.bid + option.ask) / 2;
  if (option.bid && option.bid > 0) return option.bid;
  if (option.ask && option.ask > 0) return option.ask;
  return 0;
}

/**
 * Calculate estimated total premium for an option
 */
function calculatePremium(option: any): number {
  const price = getOptionPrice(option);
  const volume = option.volume || 0;
  return volume * price * 100; // Each contract = 100 shares
}

/**
 * Calculate unusual score for an option
 * Scores based on: volume/OI, premium size, IV, delta, and DTE
 */
function calculateUnusualScore(option: any): number {
  let score = 0;
  const volume = option.volume || 0;
  const openInterest = option.open_interest || 1;
  
  // Skip if no volume
  if (volume === 0) return 0;
  
  // Volume/OI ratio (max 30 points) - key indicator of unusual activity
  const volumeOI = volume / openInterest;
  if (volumeOI > 5) score += 30;
  else if (volumeOI > 3) score += 25;
  else if (volumeOI > 2) score += 20;
  else if (volumeOI > 1.5) score += 15;
  else if (volumeOI > 1) score += 10;
  
  // Premium size (max 30 points) - huge money indicator
  const premium = calculatePremium(option);
  if (premium > 1000000) score += 30;      // $1M+ = major institutional
  else if (premium > 500000) score += 25;  // $500k+
  else if (premium > 250000) score += 20;  // $250k+
  else if (premium > 100000) score += 15;  // $100k+
  else if (premium > 50000) score += 10;   // $50k+
  else if (premium > 25000) score += 5;    // $25k+
  
  // IV percentile (max 15 points) - high IV = expected move
  const iv = option.greeks?.mid_iv || 0;
  if (iv > 1.0) score += 15;
  else if (iv > 0.8) score += 12;
  else if (iv > 0.6) score += 10;
  else if (iv > 0.4) score += 5;
  
  // Delta exposure (max 15 points) - ATM options most valuable
  const delta = Math.abs(option.greeks?.delta || 0);
  if (delta > 0.4 && delta < 0.6) score += 15; // ATM sweet spot
  else if (delta > 0.3 && delta < 0.7) score += 12;
  else if (delta > 0.2) score += 8;
  else if (delta > 0.1) score += 5;
  
  // Time to expiry bonus for near-term (max 10 points)
  const expiry = new Date(option.expiration_date);
  const daysToExpiry = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysToExpiry <= 2) score += 10;  // 0-2 DTE highest urgency
  else if (daysToExpiry <= 7) score += 8;
  else if (daysToExpiry <= 14) score += 5;
  else if (daysToExpiry <= 30) score += 3;
  
  return Math.min(100, score);
}

/**
 * Determine flow type based on premium and volume/OI ratio
 */
function determineFlowType(option: any, score: number): OptionsFlow['flowType'] {
  const premium = calculatePremium(option);
  const volumeOI = (option.volume || 0) / (option.open_interest || 1);
  
  // Block trade: $500k+ premium on single strike (institutional)
  if (premium >= 500000) return 'block';
  // Sweep: High volume relative to OI (aggressive buying)
  if (volumeOI > 5) return 'sweep';
  // Unusual volume: Volume exceeds 2x OI
  if (volumeOI > 2) return 'unusual_volume';
  // Dark pool: High score but not matching other criteria
  if (score >= 70) return 'dark_pool';
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
      
      // Persist flows meeting quality criteria: premium >= $10k OR unusualScore >= 65
      // Lowered from $50k/$75 to capture more educational flow data
      const flowsToSave = unusualFlows.filter(f => f.premium >= 10000 || f.unusualScore >= 65);
      
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

  // 🎯 AUTO-GENERATE TRADE IDEAS from options flow
  // LOWERED THRESHOLDS: score >= 60, premium >= $15k to catch more plays
  const highQualityFlows = unusualFlows.filter(f => f.unusualScore >= 60 && f.premium >= 15000);
  if (highQualityFlows.length > 0) {
    logger.info(`[OPTIONS-FLOW] 🎯 Converting ${highQualityFlows.length} high-quality flows to trade ideas...`);

    try {
      const { generateIdeaFromFlow } = await import('./universal-idea-generator');
      const { storage } = await import('./storage');

      let ideasCreated = 0;
      // Limit to top 5 flows per scan to avoid flooding
      for (const flow of highQualityFlows.slice(0, 5)) {
        try {
          const idea = await generateIdeaFromFlow(
            flow.symbol,
            flow.optionType,
            flow.strikePrice,
            flow.expiryDate,
            flow.premium,
            flow.unusualScore,
            [
              {
                type: flow.flowType === 'sweep' ? 'SWEEP_DETECTED' : 'UNUSUAL_CALL_FLOW',
                weight: 12,
                description: `${flow.flowType.toUpperCase()} flow detected - Vol/OI: ${flow.volumeOIRatio.toFixed(1)}x`
              }
            ]
          );

          if (idea) {
            await storage.createTradeIdea(idea);
            ideasCreated++;
            logger.info(`[OPTIONS-FLOW] ✅ Created trade idea: ${flow.symbol} ${flow.optionType.toUpperCase()} $${flow.strikePrice} (${flow.expiryDate})`);
          }
        } catch (ideaErr) {
          logger.debug(`[OPTIONS-FLOW] Failed to create idea for ${flow.symbol}:`, ideaErr);
        }
      }

      logger.info(`[OPTIONS-FLOW] 🎯 Created ${ideasCreated} trade ideas from options flow`);
    } catch (err) {
      logger.warn('[OPTIONS-FLOW] Failed to generate trade ideas from flows:', err);
    }
  }

  return unusualFlows;
}

/**
 * Send alerts for unusual flows
 */
async function sendFlowAlerts(flows: OptionsFlow[]): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook || flows.length === 0) return;

  // DEDUPLICATION: Check if we can send notification (global + per-symbol cooldown)
  const { canSendScannerNotification, markScannerNotificationSent } = await import('./discord-service');
  const symbols = flows.map(f => f.symbol);
  const dedupCheck = canSendScannerNotification('options_flow', symbols);

  if (!dedupCheck.canSend) {
    logger.info(`[OPTIONS-FLOW] Discord notification BLOCKED: ${dedupCheck.reason}`);
    return;
  }

  // Filter flows to only those that passed symbol dedup
  const filteredFlows = flows.filter(f => dedupCheck.filteredSymbols.includes(f.symbol));
  if (filteredFlows.length === 0) {
    logger.info('[OPTIONS-FLOW] All flows were recently notified - skipping Discord');
    return;
  }

  try {
    const content = [
      '# 📊 Unusual Options Flow Detected',
      '',
      ...filteredFlows.map(flow => {
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

    // Mark notification as sent to prevent spam
    markScannerNotificationSent('options_flow', filteredFlows.map(f => f.symbol));
    logger.info(`[OPTIONS-FLOW] Discord alert sent for ${filteredFlows.length} flows (deduped)`);
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
  lottoFlows: any[];
  summary: {
    totalFlows: number;
    bullishFlows: number;
    bearishFlows: number;
    totalPremium: number;
    lottoCount: number;
    strategyCounts: Record<string, number>;
    dteCounts: Record<string, number>;
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
        lottoFlows: [],
        summary: { 
          totalFlows: 0, 
          bullishFlows: 0, 
          bearishFlows: 0, 
          totalPremium: 0, 
          lottoCount: 0,
          strategyCounts: {},
          dteCounts: {},
          topSymbols: [] 
        }
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
    
    // Count by strategy category
    const lottoFlows = flows.filter(f => f.isLotto).length;
    const lottoList = flows.filter(f => f.isLotto);
    
    // Count by DTE category
    const dteCounts: Record<string, number> = {};
    const strategyCounts: Record<string, number> = {};
    for (const flow of flows) {
      const dte = flow.dteCategory || 'swing';
      const strategy = flow.strategyCategory || 'institutional';
      dteCounts[dte] = (dteCounts[dte] || 0) + 1;
      strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
    }
    
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
      lottoFlows: lottoList,
      summary: {
        totalFlows: flows.length,
        bullishFlows,
        bearishFlows,
        totalPremium,
        lottoCount: lottoFlows,
        strategyCounts,
        dteCounts,
        topSymbols
      }
    };
  } catch (error) {
    logger.error('[OPTIONS-FLOW] Failed to get watchlist flow history:', error);
    return {
      flows: [],
      lottoFlows: [],
      summary: { 
        totalFlows: 0, 
        bullishFlows: 0, 
        bearishFlows: 0, 
        totalPremium: 0, 
        lottoCount: 0,
        strategyCounts: {},
        dteCounts: {},
        topSymbols: [] 
      }
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

/**
 * Scan watchlist symbols for unusual options activity and persist to database
 * Works even outside market hours by using last price when bid/ask unavailable
 */
export async function scanWatchlistForFlows(): Promise<{ scanned: number; flowsFound: number; saved: number }> {
  try {
    logger.info('[OPTIONS-FLOW] Starting watchlist-specific flow scan for HUGE MONEY flows...');
    
    // Get all watchlist symbols
    const watchlistSymbols = await db.select({ symbol: watchlist.symbol })
      .from(watchlist);
    
    if (watchlistSymbols.length === 0) {
      logger.info('[OPTIONS-FLOW] No watchlist symbols to scan');
      return { scanned: 0, flowsFound: 0, saved: 0 };
    }
    
    const symbols = watchlistSymbols.map(w => w.symbol.toUpperCase());
    logger.info(`[OPTIONS-FLOW] Scanning ALL ${symbols.length} watchlist symbols for unusual flows...`);
    
    const allFlows: OptionsFlow[] = [];
    let symbolsWithVolume = 0;
    let totalOptionsScanned = 0;
    
    // Scan ALL watchlist symbols (no limit)
    for (const symbol of symbols) {
      try {
        const chain = await fetchOptionsChain(symbol);
        
        if (!chain || chain.length === 0) {
          continue;
        }
        
        let symbolHasVolume = false;
        
        for (const option of chain) {
          totalOptionsScanned++;
          
          // Skip options with no volume at all
          if (!option.volume || option.volume === 0) continue;
          
          symbolHasVolume = true;
          
          // Get best available price (with fallback)
          const price = getOptionPrice(option);
          if (price <= 0) continue;
          
          const premium = calculatePremium(option);
          const score = calculateUnusualScore(option);
          const volumeOI = option.volume / (option.open_interest || 1);
          
          // HUGE MONEY DETECTION: Focus on high premium OR high unusual score
          // - $25k+ premium (significant position)
          // - OR score >= 40 with any volume (unusual activity)
          // - OR volume/OI > 2 (heavy accumulation)
          const isHugeMoney = premium >= 25000;
          const isUnusual = score >= 40 || volumeOI > 2;
          
          if (isHugeMoney || isUnusual) {
            const flow: OptionsFlow = {
              id: `${symbol}-${option.symbol}-${Date.now()}`,
              symbol,
              optionType: option.option_type as 'call' | 'put',
              strikePrice: option.strike,
              expiryDate: option.expiration_date,
              volume: option.volume,
              openInterest: option.open_interest || 0,
              volumeOIRatio: volumeOI,
              premium: premium,
              impliedVolatility: option.greeks?.mid_iv || 0,
              delta: option.greeks?.delta || 0,
              sentiment: determineSentiment(option),
              flowType: determineFlowType(option, score),
              unusualScore: score,
              detectedAt: new Date().toISOString(),
            };
            
            allFlows.push(flow);
            
            // Log big flows immediately
            if (premium >= 100000) {
              logger.info(`[OPTIONS-FLOW] 💰 BIG MONEY: ${symbol} ${option.option_type.toUpperCase()} $${option.strike} - $${(premium/1000).toFixed(0)}k premium, Vol/OI: ${volumeOI.toFixed(1)}`);
            }
          }
        }
        
        if (symbolHasVolume) symbolsWithVolume++;
        
        // Rate limiting - 200ms between symbols
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        logger.warn(`[OPTIONS-FLOW] Error scanning ${symbol}:`, error);
      }
    }
    
    // Sort by premium (biggest money first)
    allFlows.sort((a, b) => b.premium - a.premium);
    
    logger.info(`[OPTIONS-FLOW] Scan complete: ${symbols.length} symbols, ${symbolsWithVolume} with volume, ${totalOptionsScanned} options checked, ${allFlows.length} flows found`);
    
    // Persist to database
    let savedCount = 0;
    const today = new Date().toISOString().split('T')[0];
    
    // Get existing flows for deduplication
    const existingFlows = await db.select({
      symbol: optionsFlowHistory.symbol,
      optionType: optionsFlowHistory.optionType,
      strikePrice: optionsFlowHistory.strikePrice,
      expirationDate: optionsFlowHistory.expirationDate,
    }).from(optionsFlowHistory)
      .where(eq(optionsFlowHistory.detectedDate, today));
    
    const existingSet = new Set(existingFlows.map(f => 
      `${f.symbol}-${f.optionType}-${f.strikePrice}-${f.expirationDate}`.toUpperCase()
    ));
    
    // Save top flows by score
    const flowsToSave = allFlows
      .filter(f => f.premium >= 10000 || f.unusualScore >= 60) // Lower threshold for watchlist
      .sort((a, b) => b.unusualScore - a.unusualScore)
      .slice(0, 50);
    
    for (const flow of flowsToSave) {
      const flowKey = `${flow.symbol}-${flow.optionType}-${flow.strikePrice}-${flow.expiryDate}`.toUpperCase();
      
      if (existingSet.has(flowKey)) continue;
      
      try {
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
          premium: flow.premium / 100,
          totalPremium: flow.premium,
          impliedVolatility: flow.impliedVolatility,
          delta: flow.delta,
          sentiment: flow.sentiment,
          flowType: flow.flowType,
          unusualScore: flow.unusualScore,
          strategyCategory: classification.strategyCategory,
          dteCategory: classification.dteCategory,
          isLotto: classification.isLotto,
          isWatchlistSymbol: true,
          detectedDate: today,
        });
        
        existingSet.add(flowKey);
        savedCount++;
        
        logger.info(`[OPTIONS-FLOW] ✅ Saved ${flow.symbol} ${flow.optionType.toUpperCase()} $${flow.strikePrice} - Score: ${flow.unusualScore}`);
      } catch (insertErr) {
        // Skip insert errors
      }
    }
    
    logger.info(`[OPTIONS-FLOW] Watchlist scan complete: ${symbols.length} scanned, ${allFlows.length} flows found, ${savedCount} saved`);

    // 🎯 AUTO-GENERATE TRADE IDEAS from watchlist flows
    // LOWERED THRESHOLDS: score >= 55, premium >= $10k for watchlist stocks
    const highQualityFlows = allFlows.filter(f => f.unusualScore >= 55 && f.premium >= 10000);
    let ideasCreated = 0;

    if (highQualityFlows.length > 0) {
      logger.info(`[OPTIONS-FLOW] 🎯 Converting ${highQualityFlows.length} watchlist flows to trade ideas...`);

      try {
        const { generateIdeaFromFlow } = await import('./universal-idea-generator');

        // Limit to top 5 flows per scan
        for (const flow of highQualityFlows.slice(0, 5)) {
          try {
            const idea = await generateIdeaFromFlow(
              flow.symbol,
              flow.optionType,
              flow.strikePrice,
              flow.expiryDate,
              flow.premium,
              flow.unusualScore,
              [
                {
                  type: flow.flowType === 'sweep' ? 'SWEEP_DETECTED' : flow.optionType === 'call' ? 'UNUSUAL_CALL_FLOW' : 'UNUSUAL_PUT_FLOW',
                  weight: 12,
                  description: `Watchlist ${flow.flowType.toUpperCase()} - Vol/OI: ${flow.volumeOIRatio.toFixed(1)}x`
                }
              ]
            );

            if (idea) {
              await storage.createTradeIdea(idea);
              ideasCreated++;
              logger.info(`[OPTIONS-FLOW] ✅ Created watchlist idea: ${flow.symbol} ${flow.optionType.toUpperCase()} $${flow.strikePrice}`);
            }
          } catch (ideaErr) {
            logger.debug(`[OPTIONS-FLOW] Failed to create idea for ${flow.symbol}:`, ideaErr);
          }
        }

        logger.info(`[OPTIONS-FLOW] 🎯 Created ${ideasCreated} trade ideas from watchlist flow`);
      } catch (err) {
        logger.warn('[OPTIONS-FLOW] Failed to generate trade ideas from watchlist flows:', err);
      }
    }

    return { scanned: symbols.length, flowsFound: allFlows.length, saved: savedCount, ideasCreated };
  } catch (error) {
    logger.error('[OPTIONS-FLOW] Watchlist flow scan failed:', error);
    return { scanned: 0, flowsFound: 0, saved: 0, ideasCreated: 0 };
  }
}
