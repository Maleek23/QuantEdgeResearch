// Discord webhook service for automated trade alerts
import type { TradeIdea } from "@shared/schema";
import { getSignalLabel } from "@shared/constants";
import { logger } from './logger';
import { isOptionsMarketOpen } from './paper-trading-service';

// GLOBAL DISABLE FLAG - Set to true to stop all Discord notifications
const DISCORD_DISABLED = false;

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY GATE - Lowered for better coverage, more ideas to Discord
// ═══════════════════════════════════════════════════════════════════════════
const MIN_SIGNALS_REQUIRED = 2; // B grade minimum (relaxed from 4)
const MIN_CONFIDENCE_REQUIRED = 55; // Medium confidence (relaxed from 70)

// Check if idea meets quality threshold to be sent to Discord
// Requires BOTH high confidence AND multi-engine validation
export function meetsQualityThreshold(idea: { 
  qualitySignals?: string[] | null; 
  confidenceScore?: number | null;
  assetType?: string;
  source?: string;
}): boolean {
  const signalCount = idea.qualitySignals?.length || 0;
  const confidence = idea.confidenceScore || 50;
  
  // STRICT: Must have 70%+ confidence AND 4+ signals (multi-engine validation)
  // This ensures only trades verified by AI, quant, technical analysis make it through
  const meetsConfidence = confidence >= MIN_CONFIDENCE_REQUIRED;
  const meetsSignals = signalCount >= MIN_SIGNALS_REQUIRED;
  
  // Require BOTH for maximum quality
  return meetsConfidence && meetsSignals;
}

// Check if this is a GEM (A+ grade) - gets special highlighting
export function isGemTrade(idea: { 
  qualitySignals?: string[] | null; 
  confidenceScore?: number | null;
}): boolean {
  const signalCount = idea.qualitySignals?.length || 0;
  const confidence = idea.confidenceScore || 50;
  // A+ grade: 5 signals AND 85%+ confidence
  return signalCount >= 5 && confidence >= 85;
}

// ═══════════════════════════════════════════════════════════════════════════
// STRICT DEDUPLICATION & COOLDOWN SYSTEM - Prevents ALL spam
// ═══════════════════════════════════════════════════════════════════════════
const recentMessages = new Map<string, number>(); // hash -> timestamp
const symbolCooldowns = new Map<string, number>(); // symbol -> timestamp
const optionCooldowns = new Map<string, number>(); // symbol+strike+expiry -> timestamp (strict option dedup)
const DEDUP_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 HOURS for exact duplicates (was 30 min)
const SYMBOL_COOLDOWN_MS = 60 * 60 * 1000; // 1 HOUR per symbol (was 15 min)
const OPTION_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 HOURS for same option (symbol+strike+expiry)

function generateMessageHash(type: string, key: string): string {
  return `${type}:${key}`;
}

function isDuplicateMessage(hash: string): boolean {
  const now = Date.now();
  
  // Clean old entries (older than window)
  for (const [key, timestamp] of Array.from(recentMessages.entries())) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      recentMessages.delete(key);
    }
  }
  
  if (recentMessages.has(hash)) {
    logger.info(`🚫 [DISCORD-DEDUP] Skipping duplicate: ${hash}`);
    return true;
  }
  
  recentMessages.set(hash, now);
  return false;
}

// Check symbol-level cooldown to prevent spam (e.g., ASTS alerted 3x in 2 mins)
export function isSymbolOnCooldown(symbol: string, source: string): boolean {
  const now = Date.now();
  const key = `${symbol}:${source}`;
  
  // Clean old entries
  for (const [k, timestamp] of Array.from(symbolCooldowns.entries())) {
    if (now - timestamp > SYMBOL_COOLDOWN_MS) {
      symbolCooldowns.delete(k);
    }
  }
  
  if (symbolCooldowns.has(key)) {
    const elapsed = Math.round((now - symbolCooldowns.get(key)!) / 1000 / 60);
    logger.info(`🚫 [DISCORD-COOLDOWN] ${symbol} on cooldown (${elapsed}m since last alert)`);
    return true;
  }
  
  symbolCooldowns.set(key, now);
  return false;
}

// STRICT: Check option-specific cooldown (same symbol + strike + expiry)
export function isOptionOnCooldown(symbol: string, strikePrice?: number | null, expiryDate?: string | null): boolean {
  if (!strikePrice && !expiryDate) return false; // Not an option, skip this check
  
  const now = Date.now();
  const key = `${symbol}:${strikePrice || 'na'}:${expiryDate || 'na'}`;
  
  // Clean old entries
  for (const [k, timestamp] of Array.from(optionCooldowns.entries())) {
    if (now - timestamp > OPTION_COOLDOWN_MS) {
      optionCooldowns.delete(k);
    }
  }
  
  if (optionCooldowns.has(key)) {
    const elapsed = Math.round((now - optionCooldowns.get(key)!) / 1000 / 60);
    logger.info(`🚫 [DISCORD-OPTION-DEDUP] ${symbol} $${strikePrice} ${expiryDate} already sent (${elapsed}m ago) - BLOCKING`);
    return true;
  }
  
  optionCooldowns.set(key, now);
  return false;
}

/**
 * DISCORD CHANNEL ORGANIZATION
 * 
 * Each webhook routes to a specific Discord channel with clear purpose:
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANNEL             │ WEBHOOK ENV VAR              │ PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 * #options-trades     │ DISCORD_WEBHOOK_OPTIONSTRADES│ Options trade ideas ONLY
 *                     │ (fallback: DISCORD_WEBHOOK_URL) │ Calls/puts with strike/exp
 * ───────────────────────────────────────────────────────────────────────────
 * #stock-shares       │ DISCORD_WEBHOOK_SHARES       │ Stock/penny stock trades
 *                     │                              │ Non-options equity trades
 * ───────────────────────────────────────────────────────────────────────────
 * #quantbot           │ DISCORD_WEBHOOK_QUANTBOT     │ Bot entries, exits & bot gains
 *                     │                              │ Auto-Lotto Bot paper trading
 * ───────────────────────────────────────────────────────────────────────────
 * #lotto              │ DISCORD_WEBHOOK_LOTTO        │ Lotto detector alerts
 *                     │                              │ Bot entries & exits (paper trading)
 * ───────────────────────────────────────────────────────────────────────────
 * #gains              │ DISCORD_WEBHOOK_GAINS        │ AI/Quant/Manual winning trades
 * ───────────────────────────────────────────────────────────────────────────
 * #futures            │ DISCORD_WEBHOOK_FUTURE_TRADES│ NQ/GC futures trades only
 * ───────────────────────────────────────────────────────────────────────────
 * #chart-analysis     │ DISCORD_WEBHOOK_CHARTANALYSIS│ Technical chart breakdowns
 * ───────────────────────────────────────────────────────────────────────────
 * #weekly-watchlist   │ DISCORD_WEBHOOK_WEEKLYWATCHLISTS │ Weekly watchlist summary
 *                     │                              │ Weekly premium picks
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Channel header prefixes for easy identification in Discord
const CHANNEL_HEADERS = {
  OPTIONS_TRADES: '📈 #OPTIONS-TRADES',
  STOCK_SHARES: '💵 #STOCK-SHARES',
  TRADE_ALERTS: '📊 #TRADE-ALERTS',
  QUANTBOT: '✨ #QUANTBOT',
  LOTTO: '🎰 #LOTTO',
  GAINS: '💰 #GAINS',
  FUTURES: '📈 #FUTURES',
  CHART_ANALYSIS: '📉 #CHART-ANALYSIS',
  WEEKLY_WATCHLIST: '📋 #WEEKLY-WATCHLIST',
};

// Penny stock threshold - stocks under this price route to shares channel
const PENNY_STOCK_THRESHOLD = 5.00;

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

// Color codes for Discord embeds
const COLORS = {
  LONG: 0x22c55e,    // Green for long/buy
  SHORT: 0xef4444,   // Red for short/sell
  AI: 0xa855f7,      // Purple for AI signals
  QUANT: 0x3b82f6,   // Blue for quant signals
  HYBRID: 0x10b981,  // Emerald for hybrid (AI + Quant)
  MANUAL: 0x64748b,  // Gray for manual trades
};

// Helper to convert confidence score to letter grade
function getLetterGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  return 'D';
}

/**
 * PREMIUM FILTER: Exclude ideas with "crazy premiums" (over $20/contract)
 * Unless it's a high-confidence index play
 */
function isPremiumTooHigh(idea: TradeIdea): boolean {
  const entry = idea.entryPrice || 0;
  const confidence = idea.confidenceScore || 0;
  
  // Crazy premiums = > $20.00 ($2000/contract)
  if (entry > 20.00) {
    // Exception: extremely high confidence (A+) index plays (SPY/QQQ)
    const isIndex = ['SPY', 'QQQ', 'DIA', 'IWM'].includes(idea.symbol.toUpperCase());
    if (isIndex && confidence >= 95) return false;
    return true;
  }
  return false;
}

// Helper to get grade emoji based on confidence
function getGradeEmoji(score: number): string {
  if (score >= 90) return '🔥';
  if (score >= 80) return '⭐';
  if (score >= 70) return '✨';
  if (score >= 60) return '👍';
  return '📊';
}

// Format trade idea as Discord rich embed - ENHANCED for options with full grading
function formatTradeIdeaEmbed(idea: TradeIdea): DiscordEmbed {
  const isLong = idea.direction === 'long';
  const color = isLong ? COLORS.LONG : COLORS.SHORT;
  
  // Source badge with emoji
  const sourceEmoji = idea.source === 'ai' ? '🧠' : 
                     idea.source === 'quant' ? '✨' : 
                     idea.source === 'hybrid' ? '🎯' :
                     idea.source === 'flow' ? '📊' : '📝';
  const sourceLabel = idea.source === 'ai' ? 'AI Signal' : 
                     idea.source === 'quant' ? 'Quant Signal' :
                     idea.source === 'hybrid' ? 'Hybrid (AI+Quant)' :
                     idea.source === 'flow' ? 'Flow Scanner' : 'Manual';
  
  // Direction indicator
  const directionEmoji = isLong ? '🟢' : '🔴';
  
  // Calculate potential gain/loss with null safety
  const potentialGain = idea.entryPrice > 0 ? ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(1) : '0';
  const potentialLoss = idea.stopLoss && idea.entryPrice > 0 ? ((idea.entryPrice - idea.stopLoss) / idea.entryPrice * 100).toFixed(1) : 'N/A';
  
  // QuantEdge grading
  const confidenceScore = idea.confidenceScore || 50;
  const letterGrade = getLetterGrade(confidenceScore);
  const gradeEmoji = getGradeEmoji(confidenceScore);
  const signalCount = idea.qualitySignals?.length || 0;
  const signalStars = '⭐'.repeat(Math.min(signalCount, 5)) + '☆'.repeat(Math.max(0, 5 - signalCount));
  
  // Asset type emoji for title
  const assetEmoji = idea.assetType === 'option' ? '🎯' : idea.assetType === 'crypto' ? '₿' : '📈';
  
  // Build description with comprehensive grading for OPTIONS
  let description = '';
  if (idea.assetType === 'option') {
    const optType = (idea.optionType || 'OPTION').toUpperCase();
    const strike = idea.strikePrice ? `$${idea.strikePrice}` : '';
    const expFormatted = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
    
    description = `**${optType} ${strike} exp ${expFormatted}**\n\n`;
    description += `${sourceEmoji} **${sourceLabel}** | ${gradeEmoji} Grade: **${letterGrade}** (${confidenceScore}%)\n`;
    description += `Signal Strength: ${signalStars} (${signalCount}/5)`;
  } else if (idea.assetType === 'crypto') {
    description = `**Crypto Position**\n\n${sourceEmoji} **${sourceLabel}** | ${gradeEmoji} Grade: **${letterGrade}**`;
  } else if (idea.assetType === 'penny_stock') {
    description = `**Penny Moonshot**\n\n${sourceEmoji} **${sourceLabel}** | ${gradeEmoji} Grade: **${letterGrade}**`;
  } else {
    description = `**Shares**\n\n${sourceEmoji} **${sourceLabel}** | ${gradeEmoji} Grade: **${letterGrade}**`;
  }
  
  const embed: DiscordEmbed = {
    title: `${directionEmoji} ${idea.symbol} ${idea.direction.toUpperCase()} ${assetEmoji}`,
    description,
    color,
    fields: [
      {
        name: '💰 Entry',
        value: `$${idea.entryPrice.toFixed(2)}`,
        inline: true
      },
      {
        name: '🎯 Target',
        value: `$${idea.targetPrice.toFixed(2)} (+${potentialGain}%)`,
        inline: true
      },
      {
        name: '🛡️ Stop',
        value: idea.stopLoss ? `$${idea.stopLoss.toFixed(2)} (-${potentialLoss}%)` : 'Not set',
        inline: true
      },
      {
        name: '📊 Risk/Reward',
        value: `**${idea.riskRewardRatio}:1**`,
        inline: true
      },
      {
        name: '⭐ Quant Edge Labs Grade',
        value: `${gradeEmoji} **${letterGrade}** (${confidenceScore}%)`,
        inline: true
      },
      {
        name: '⏱️ Hold Period',
        value: idea.holdingPeriod === 'day' ? '🏃 Day Trade' : 
               idea.holdingPeriod === 'swing' ? '📅 Swing (2-5d)' : 
               idea.holdingPeriod === 'position' ? '📊 Position (5d+)' : '🏃 Day Trade',
        inline: true
      }
    ],
    timestamp: new Date().toISOString()
  };
  
  // Add signals breakdown if available
  if (idea.qualitySignals && idea.qualitySignals.length > 0) {
    const signalsDisplay = idea.qualitySignals.slice(0, 4).join(' • ');
    embed.fields.push({
      name: `📶 Technical Signals (${signalCount}/5)`,
      value: signalsDisplay || 'Momentum detected',
      inline: false
    });
  }
  
  // Add catalyst if available
  if (idea.catalyst) {
    embed.fields.push({
      name: '💡 Catalyst',
      value: idea.catalyst.substring(0, 150) + (idea.catalyst.length > 150 ? '...' : ''),
      inline: false
    });
  }
  
  // Add brief analysis excerpt if available
  if (idea.analysis && idea.analysis.length > 20) {
    const analysisExcerpt = idea.analysis.substring(0, 200).replace(/\n/g, ' ');
    embed.fields.push({
      name: '📝 Analysis',
      value: `>>> ${analysisExcerpt}${idea.analysis.length > 200 ? '...' : ''}`,
      inline: false
    });
  }
  
  // Enhanced footer with data quality and risk
  const qualityEmoji = idea.dataSourceUsed && idea.dataSourceUsed !== 'estimated' ? '✅' : '⚠️';
  const riskLevel = idea.riskProfile === 'speculative' ? 'HIGH RISK' : 
                   idea.riskProfile === 'aggressive' ? 'AGGRESSIVE' : 'MODERATE';
  embed.footer = {
    text: `${qualityEmoji} ${idea.dataSourceUsed || 'Live Data'} | ${riskLevel} | Quant Edge Labs`
  };
  
  return embed;
}

// Send trade idea to Discord webhook
// ALL research ideas (quant, AI, hybrid, flow) go to #trade-alerts
// Bot entries (when bot actually trades) go to #quantbot via sendBotTradeEntryToDiscord
export async function sendTradeIdeaToDiscord(idea: TradeIdea): Promise<void> {
  logger.info(`📨 Discord single trade called: ${idea.symbol} (${idea.source || 'unknown'}) assetType=${idea.assetType}`);
  
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping notification');
    return;
  }
  
  // QUALITY GATE: Only send trades with high/medium confidence
  if (!meetsQualityThreshold(idea)) {
    const signalCount = idea.qualitySignals?.length || 0;
    logger.info(`📨 [QUALITY-GATE] Skipping ${idea.symbol} - only ${signalCount}/5 signals (below B grade threshold)`);
    return;
  }
  
  // SYMBOL COOLDOWN: Prevent spam (same symbol within 1 hour)
  if (isSymbolOnCooldown(idea.symbol, idea.source || 'trade')) {
    return; // Already logged in isSymbolOnCooldown
  }
  
  // OPTION-SPECIFIC DEDUP: Prevent same option (symbol+strike+expiry) for 6 hours
  if (idea.assetType === 'option' && isOptionOnCooldown(idea.symbol, idea.strikePrice, idea.expiryDate)) {
    return; // Already logged in isOptionOnCooldown
  }

  // PREMIUM FILTER
  if (isPremiumTooHigh(idea)) {
    logger.info(`🚫 [DISCORD-FILTER] Skipping ${idea.symbol} - premium too high ($${idea.entryPrice})`);
    return;
  }
  
  // DEDUP: Create unique key for this trade idea
  const optionKey = idea.assetType === 'option' ? `${idea.optionType}_${idea.strikePrice}_${idea.expiryDate}` : '';
  const dedupKey = `${idea.symbol}_${idea.direction}_${idea.source}_${optionKey}_${idea.entryPrice?.toFixed(2)}`;
  const hash = generateMessageHash('trade', dedupKey);
  
  if (isDuplicateMessage(hash)) {
    return; // Skip duplicate
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CHANNEL ROUTING BY ASSET TYPE
  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONS → #options-trades (DISCORD_WEBHOOK_OPTIONSTRADES)
  // STOCKS/PENNY STOCKS → #stock-shares (DISCORD_WEBHOOK_SHARES)
  // FUTURES → handled by separate function, but fallback here
  // ═══════════════════════════════════════════════════════════════════════════
  
  let webhookUrl: string | undefined;
  let channelHeader: string;
  let isPennyStock = false;
  
  if (idea.assetType === 'option') {
    // OPTIONS go to dedicated options channel (fallback to main URL)
    webhookUrl = process.env.DISCORD_WEBHOOK_OPTIONSTRADES || process.env.DISCORD_WEBHOOK_URL;
    channelHeader = CHANNEL_HEADERS.OPTIONS_TRADES;
    logger.info(`📨 [ROUTING] ${idea.symbol} → #options-trades (option)`);
  } else if (idea.assetType === 'stock' || idea.assetType === 'penny_stock') {
    // STOCKS/PENNY STOCKS go to shares channel
    isPennyStock = (idea.entryPrice || 0) < PENNY_STOCK_THRESHOLD;
    webhookUrl = process.env.DISCORD_WEBHOOK_SHARES;
    channelHeader = CHANNEL_HEADERS.STOCK_SHARES;
    logger.info(`📨 [ROUTING] ${idea.symbol} → #stock-shares (${isPennyStock ? 'penny stock' : 'stock'})`);
  } else if (idea.assetType === 'future') {
    // FUTURES go to futures channel
    webhookUrl = process.env.DISCORD_WEBHOOK_FUTURE_TRADES || process.env.DISCORD_WEBHOOK_URL;
    channelHeader = CHANNEL_HEADERS.FUTURES;
    logger.info(`📨 [ROUTING] ${idea.symbol} → #futures`);
  } else {
    // Default fallback for crypto or unknown types
    webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    channelHeader = CHANNEL_HEADERS.TRADE_ALERTS;
    logger.info(`📨 [ROUTING] ${idea.symbol} → #trade-alerts (default: ${idea.assetType})`);
  }
  
  if (!webhookUrl) {
    logger.warn(`⚠️ Discord webhook not configured for ${idea.assetType} trades - skipping alert`);
    return;
  }
  
  try {
    const embed = formatTradeIdeaEmbed(idea);
    const sourceLabel = idea.source === 'ai' ? 'AI' : idea.source === 'quant' ? 'QUANT' : idea.source === 'hybrid' ? 'HYBRID' : 'FLOW';
    const pennyLabel = isPennyStock ? ' 🪙' : '';
    const message: DiscordMessage = {
      content: `🎯 **${sourceLabel} TRADE** → ${idea.symbol}${pennyLabel} │ ${channelHeader}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }
    
    logger.info(`✅ Discord alert sent: ${idea.symbol} ${idea.direction.toUpperCase()} → ${channelHeader}`);
  } catch (error) {
    logger.error('❌ Failed to send Discord alert:', error);
  }
}

/**
 * Send Watchlist Price Alert to Discord
 */
export async function sendDiscordAlert(alert: {
  symbol: string;
  assetType: string;
  alertType: 'entry' | 'stop' | 'target';
  currentPrice: number;
  alertPrice: number;
  percentFromTarget: number;
  notes?: string;
  // Option-specific fields
  optionType?: string;
  strike?: number;
  expiry?: string;
}): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ Discord webhook URL not configured - skipping watchlist alert');
    return;
  }
  
  try {
    const alertEmoji = alert.alertType === 'entry' ? '🚨' : alert.alertType === 'stop' ? '🛑' : '🎯';
    const alertTitle = alert.alertType === 'entry' ? 'ENTRY OPPORTUNITY' : 
                      alert.alertType === 'stop' ? 'STOP LOSS ALERT' : 'PROFIT TARGET HIT';
    const color = alert.alertType === 'entry' ? 0x00ff00 : // Green for entry
                  alert.alertType === 'stop' ? 0xff0000 : // Red for stop
                  0x0099ff; // Blue for target
    
    // Format prices appropriately (fewer decimals for stocks)
    const priceDecimals = alert.assetType === 'crypto' && alert.currentPrice < 1 ? 6 : 2;
    
    // Build description - for options, put type/strike/expiry on its own line first
    let description = `**${alertTitle}**`;
    if (alert.assetType === 'option' && alert.optionType) {
      // STANDALONE LINE: CALL $150 01/17
      const optionLine = `${alert.optionType.toUpperCase()}${alert.strike ? ` $${alert.strike}` : ''}${alert.expiry ? ` ${alert.expiry}` : ''}`;
      description = `**${optionLine}**\n\n${alertTitle}`;
    }
    
    // Simple asset emoji for title
    const assetEmoji = alert.assetType === 'option' ? '🎯' : alert.assetType === 'crypto' ? '₿' : '📈';
    
    const embed: DiscordEmbed = {
      title: `${alertEmoji} ${alert.symbol} ${assetEmoji}`,
      description,
      color,
      fields: [
        {
          name: '💰 Current',
          value: `$${alert.currentPrice.toFixed(priceDecimals)}`,
          inline: true
        },
        {
          name: '🎯 Alert At',
          value: `$${alert.alertPrice.toFixed(priceDecimals)}`,
          inline: true
        },
        {
          name: '📊 Distance',
          value: `${alert.percentFromTarget > 0 ? '+' : ''}${alert.percentFromTarget.toFixed(2)}%`,
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: `Quant Edge Labs Watchlist • ${alert.assetType === 'crypto' ? '24/7' : 'Market Hours'}`
      }
    };
    
    // Only add notes if meaningful (skip default/auto-generated notes)
    if (alert.notes && 
        !alert.notes.includes('symbol search') && 
        !alert.notes.includes('Watchlist alert') &&
        alert.notes.length > 5) {
      embed.fields.push({
        name: '📝 Notes',
        value: alert.notes.substring(0, 100),
        inline: false
      });
    }
    
    const assetDetail = alert.assetType === 'option' && alert.optionType 
      ? `${alert.optionType.toUpperCase()}${alert.strike ? ` $${alert.strike}` : ''}${alert.expiry ? ` ${alert.expiry}` : ''}` 
      : alert.assetType === 'crypto' ? 'Crypto' : 'Shares';
    const message: DiscordMessage = {
      content: `${alertEmoji} **WATCHLIST ALERT** → ${alert.symbol} ${assetDetail} │ ${CHANNEL_HEADERS.TRADE_ALERTS}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (!response.ok) {
      throw new Error(`Discord watchlist alert failed: ${response.status} ${response.statusText}`);
    }
    
    logger.info(`✅ Discord watchlist alert sent: ${alert.symbol} ${alert.alertType.toUpperCase()}`);
  } catch (error) {
    logger.error('❌ Failed to send Discord watchlist alert:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL-TIME FLOW SCANNER ALERT - Sends B- to A+ options as they're discovered
// ═══════════════════════════════════════════════════════════════════════════

export async function sendFlowAlertToDiscord(alert: {
  symbol: string;
  optionType: string;
  strikePrice: number;
  expiryDate: string;
  entryPrice: number;
  targetPrice: number;
  targetPercent: string;
  grade: string;
  riskReward: string;
  isLotto: boolean;
}): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  // 🚫 MARKET HOURS CHECK: Only send flow alerts during market hours (9:30 AM - 4:00 PM ET)
  const marketStatus = isOptionsMarketOpen();
  if (!marketStatus.isOpen) {
    logger.info(`📊 Flow alert skipped - ${marketStatus.reason}. No stale alerts.`);
    return;
  }
  
  // Route to options channel or lotto channel based on type
  const webhookUrl = alert.isLotto 
    ? (process.env.DISCORD_WEBHOOK_LOTTO || process.env.DISCORD_WEBHOOK_OPTIONSTRADES || process.env.DISCORD_WEBHOOK_URL)
    : (process.env.DISCORD_WEBHOOK_OPTIONSTRADES || process.env.DISCORD_WEBHOOK_URL);
  
  if (!webhookUrl) {
    logger.warn('⚠️ No Discord webhook configured for flow alerts');
    return;
  }
  
  // 🛑 SYMBOL-LEVEL COOLDOWN: Prevent spam for same symbol (uses existing system)
  if (isSymbolOnCooldown(alert.symbol, 'flow')) {
    return;
  }
  
  // Standard deduplication for exact option match
  const flowKey = `${alert.symbol}-${alert.optionType}-${alert.strikePrice}-${alert.expiryDate}`;
  const hash = generateMessageHash('flow-alert', flowKey);
  if (isDuplicateMessage(hash)) {
    return;
  }
  
  try {
    const isCall = alert.optionType.toLowerCase() === 'call';
    const emoji = isCall ? '🟢' : '🔴';
    const gradeEmoji = alert.grade.includes('A') ? '🔥' : '⭐';
    const lottoTag = alert.isLotto ? '🎰 ' : '';
    const color = isCall ? 0x22c55e : 0xef4444;
    
    // PREMIUM FILTER for Flow Alerts
    if (alert.entryPrice > 20.00 && !alert.grade.includes('A+')) {
      logger.info(`📊 [FLOW-PREMIUM-FILTER] Skipping expensive flow alert: ${alert.symbol} @ $${alert.entryPrice.toFixed(2)}`);
      return;
    }

    // Format expiry date nicely (e.g., "01/16" or "04/17")
    let expiryFormatted = alert.expiryDate;
    try {
      const expDate = new Date(alert.expiryDate);
      expiryFormatted = `${(expDate.getMonth() + 1).toString().padStart(2, '0')}/${expDate.getDate().toString().padStart(2, '0')}`;
    } catch {}
    
    const embed: DiscordEmbed = {
      title: `${lottoTag}${emoji} ${alert.symbol} ${alert.optionType.toUpperCase()} $${alert.strikePrice} ${expiryFormatted}`,
      description: `**${gradeEmoji} Grade ${alert.grade}** | Entry: **$${alert.entryPrice.toFixed(2)}**`,
      color,
      fields: [
        { name: '🎯 Target', value: `$${alert.targetPrice.toFixed(2)} (+${alert.targetPercent}%)`, inline: true },
        { name: '📊 R:R', value: `${alert.riskReward}:1`, inline: true }
      ],
      footer: { text: 'Flow Scanner • Quant Edge Labs' },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `📊 **FLOW ALERT** → ${alert.symbol} ${alert.optionType.toUpperCase()} $${alert.strikePrice} | ${gradeEmoji} ${alert.grade}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord flow alert sent: ${alert.symbol} ${alert.optionType.toUpperCase()} $${alert.strikePrice} (${alert.grade})`);
    } else {
      logger.error(`❌ Discord flow alert failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord flow alert:', error);
  }
}

// Send batch summary to Discord
// OPTIONS → #options-trades (DISCORD_WEBHOOK_OPTIONSTRADES)
// STOCKS/CRYPTO → #stock-shares (DISCORD_WEBHOOK_SHARES)  
// Bot entries go to #quantbot via sendBotTradeEntryToDiscord
export async function sendBatchSummaryToDiscord(ideas: TradeIdea[], source: 'ai' | 'quant' | 'hybrid' | 'flow' | 'news'): Promise<void> {
  logger.info(`📨 Discord batch summary called: ${ideas.length} ${source} ideas`);
  
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping notification');
    return;
  }
  
  // 🚫 MARKET HOURS CHECK: Only send batch alerts during market hours (9:30 AM - 4:00 PM ET)
  const marketStatus = isOptionsMarketOpen();
  if (!marketStatus.isOpen) {
    logger.info(`📨 Discord batch skipped - ${marketStatus.reason}. No stale alerts.`);
    return;
  }
  
  // Route to appropriate channel based on predominant asset type
  // OPTIONS go to dedicated options channel, everything else to shares/main
  const optionCount = ideas.filter(i => i.assetType === 'option').length;
  const isOptionsHeavy = optionCount > ideas.length / 2;
  
  const webhookUrl = isOptionsHeavy 
    ? (process.env.DISCORD_WEBHOOK_OPTIONSTRADES || process.env.DISCORD_WEBHOOK_URL)
    : (process.env.DISCORD_WEBHOOK_SHARES || process.env.DISCORD_WEBHOOK_URL);
  
  if (!webhookUrl) {
    logger.warn('⚠️ No Discord webhook configured - skipping notification');
    return;
  }
  
  if (ideas.length === 0) {
    logger.info('📨 No ideas to send to Discord');
    return;
  }
  
  // QUALITY GATE: Only send OPTIONS with high/medium confidence (70%+, 4+ signals)
  // EXCLUDE: penny stocks, moonshots, shares - only options go to Discord
  // PREMIUM FILTER: Exclude "crazy premiums" (>$20/contract) unless high confidence (A+)
  const qualityIdeas = ideas.filter(idea => {
    // Must be an OPTION (not shares, penny stocks, or crypto)
    if (idea.assetType !== 'option') {
      return false;
    }

    // PREMIUM FILTER: Exclude very expensive contracts (>$20.00)
    // Most retail lotto/momentum players want cheap contracts
    const isVeryExpensive = idea.entryPrice > 20.00;
    const isTopTier = (idea.confidenceScore || 0) >= 90;
    
    if (isVeryExpensive && !isTopTier) {
      logger.info(`📨 [PREMIUM-FILTER] Excluded expensive option: ${idea.symbol} @ $${idea.entryPrice.toFixed(2)}`);
      return false;
    }

    // Must meet quality threshold (70%+ confidence, 4+ signals)
    return meetsQualityThreshold(idea);
  });
  
  if (qualityIdeas.length === 0) {
    const nonOptions = ideas.filter(i => i.assetType !== 'option').length;
    const lowQuality = ideas.filter(i => i.assetType === 'option' && !meetsQualityThreshold(i)).length;
    logger.info(`📨 [QUALITY-GATE] No high-confidence OPTIONS in batch of ${ideas.length} (${nonOptions} non-options, ${lowQuality} low-grade options) - skipping Discord`);
    return;
  }
  
  if (qualityIdeas.length < ideas.length) {
    logger.info(`📨 [QUALITY-GATE] Filtered to ${qualityIdeas.length} high-confidence OPTIONS (excluded ${ideas.length - qualityIdeas.length} non-options/low-grade)`);
  }
  
  // Use filtered ideas from here
  const filteredIdeas = qualityIdeas;
  
  // DEDUP: Create unique key for this batch (source + symbols sorted)
  const symbols = filteredIdeas.map(i => i.symbol).sort().join(',');
  const dedupKey = `${source}_${filteredIdeas.length}_${symbols.substring(0, 100)}`;
  const hash = generateMessageHash('batch', dedupKey);
  
  if (isDuplicateMessage(hash)) {
    return; // Skip duplicate batch
  }
  
  try {
    const sourceLabel = source === 'ai' ? '🧠 AI' : 
                       source === 'hybrid' ? '🎯 Hybrid (AI+Quant)' :
                       source === 'flow' ? '📊 Flow Scanner' :
                       source === 'news' ? '📰 News Catalyst' :
                       '✨ Quant';
    const color = source === 'ai' ? COLORS.AI :
                 source === 'hybrid' ? COLORS.HYBRID :
                 source === 'flow' ? 0x9B59B6 : // Purple for flow
                 source === 'news' ? 0xE67E22 : // Orange for news
                 COLORS.QUANT;
    
    // ACTIONABLE FORMAT: Show asset type, entry→target, and signal count (not misleading %)
    const longIdeas = filteredIdeas.filter(i => i.direction === 'long');
    const shortIdeas = filteredIdeas.filter(i => i.direction === 'short');
    
    // Check for GEMs (A+ trades) to highlight
    const gems = filteredIdeas.filter(i => isGemTrade(i));
    const hasGems = gems.length > 0;
    
    // Format actionably with QuantEdge grading: emoji SYMBOL TYPE $entry→$target Grade
    const formatIdea = (idea: TradeIdea) => {
      const emoji = idea.direction === 'long' ? '🟢' : '🔴';
      const signalCount = idea.qualitySignals?.length || 0;
      
      // QuantEdge confidence grading
      const confidence = idea.confidenceScore || (40 + signalCount * 10);
      const grade = getLetterGrade(confidence);
      const gradeEmoji = getGradeEmoji(confidence);
      
      // Calculate gain target
      const gainPct = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(0);
      
      if (idea.assetType === 'option') {
        const optType = idea.optionType?.toUpperCase() || 'OPT';
        const strike = idea.strikePrice ? `$${idea.strikePrice}` : '';
        const exp = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
        return `${emoji} **${idea.symbol}** ${optType} ${strike} ${exp}\n   💰 $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${gradeEmoji} ${grade} | R:R ${idea.riskRewardRatio || 'N/A'}:1`;
      } else if (idea.assetType === 'crypto') {
        return `${emoji} **${idea.symbol}** CRYPTO | $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${gradeEmoji} ${grade}`;
      } else if (idea.assetType === 'penny_stock') {
        return `${emoji} **${idea.symbol}** MOONSHOT | $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${gradeEmoji} ${grade}`;
      }
      return `${emoji} **${idea.symbol}** SHARES | $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${gradeEmoji} ${grade}`;
    };
    
    // Limit to top 8 ideas (sorted by signal count then R:R) to keep readable
    // Put GEMs first, then sort by signals
    const sortedIdeas = [...filteredIdeas].sort((a, b) => {
      const aIsGem = isGemTrade(a) ? 1 : 0;
      const bIsGem = isGemTrade(b) ? 1 : 0;
      if (bIsGem !== aIsGem) return bIsGem - aIsGem;
      const aSignals = a.qualitySignals?.length || 0;
      const bSignals = b.qualitySignals?.length || 0;
      if (bSignals !== aSignals) return bSignals - aSignals;
      return (b.riskRewardRatio || 0) - (a.riskRewardRatio || 0);
    });
    const listLines = topIdeas.map(idea => {
      const isLong = idea.direction === 'long';
      const side = isLong ? '🟢' : '🔴';
      const type = idea.optionType?.toUpperCase() || 'OPT';
      const strike = idea.strikePrice ? `$${idea.strikePrice}` : '';
      const exp = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
      const grade = getLetterGrade(idea.confidenceScore || 50);
      const entry = idea.entryPrice?.toFixed(2);
      const target = idea.targetPrice?.toFixed(2);
      const gain = idea.entryPrice ? ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(0) : '0';
      
      return `${side} **${idea.symbol}** ${type} ${strike} ${exp} • $${entry}→$${target} (+${gain}%) │ ${grade}`;
    });

    const description = listLines.join('\n') + (filteredIdeas.length > 15 ? `\n*+${filteredIdeas.length - 15} more in dashboard*` : '');
    
    const embed: DiscordEmbed = {
      title: `${sourceLabel} - ${filteredIdeas.length} Trade Ideas${gemIndicator}`,
      description,
      color,
      fields: [
        { name: '📊 Direction', value: `🟢 ${longIdeas.length} Long • 🔴 ${shortIdeas.length} Short`, inline: true },
        { name: '✨ Avg Grade', value: `**${avgGrade}** (${avgConfidence}%)`, inline: true },
        { name: '📈 Avg R:R', value: `**${avgRR}:1**`, inline: true }
      ],
      footer: { text: '⚠️ For educational research only | Quant Edge Labs' },
      timestamp: new Date().toISOString()
    };
    
    const channelHeader = CHANNEL_HEADERS.TRADE_ALERTS;
    const message: DiscordMessage = {
      content: `📢 **BATCH ALERT** → ${ideas.length} ${sourceLabel} Ideas │ ${channelHeader}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord batch summary sent: ${ideas.length} ${source} ideas`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord batch summary:', error);
  }
}

// Send futures trade ideas to dedicated Discord channel
export async function sendFuturesTradesToDiscord(ideas: TradeIdea[]): Promise<void> {
  logger.info(`📨 Discord futures trades called: ${ideas.length} ideas`);
  
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping futures notification');
    return;
  }
  
  // Use dedicated futures webhook, fall back to general webhook
  const webhookUrl = process.env.DISCORD_WEBHOOK_FUTURE_TRADES || process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.warn('⚠️ No DISCORD_WEBHOOK_FUTURE_TRADES configured - skipping futures notification');
    return;
  }
  
  if (ideas.length === 0) {
    logger.info('📨 No futures ideas to send to Discord');
    return;
  }
  
  try {
    // Format each futures idea
    const formatFuturesIdea = (idea: TradeIdea) => {
      const emoji = idea.direction === 'long' ? '🟢' : '🔴';
      const gainPct = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(2);
      const riskPct = ((idea.entryPrice - idea.stopLoss) / idea.entryPrice * 100).toFixed(2);
      
      // Show contract code if available
      const contractInfo = idea.futuresContractCode || idea.symbol;
      const rootSymbol = idea.futuresRootSymbol || idea.symbol.substring(0, 2);
      
      return `${emoji} **${rootSymbol}** (${contractInfo}) ${idea.direction.toUpperCase()}\n` +
             `Entry: $${idea.entryPrice.toFixed(2)} → Target: $${idea.targetPrice.toFixed(2)} (+${gainPct}%)\n` +
             `Stop: $${idea.stopLoss.toFixed(2)} (-${riskPct}%) | R:R ${idea.riskRewardRatio?.toFixed(1) || 'N/A'}:1`;
    };
    
    const description = ideas.map(formatFuturesIdea).join('\n\n');
    
    const embed: DiscordEmbed = {
      title: `🔮 Futures Trade Ideas - ${ideas.length} Setups`,
      description,
      color: 0x8B5CF6, // Purple for futures
      fields: [
        {
          name: 'Direction',
          value: `🟢 ${ideas.filter(i => i.direction === 'long').length} Long • 🔴 ${ideas.filter(i => i.direction === 'short').length} Short`,
          inline: true
        },
        {
          name: 'Contracts',
          value: ideas.map(i => i.futuresRootSymbol || i.symbol.substring(0, 2)).join(', '),
          inline: true
        }
      ],
      footer: {
        text: 'Quant Edge Labs Futures • Educational Research Only'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `🔮 **${ideas.length} FUTURES TRADES** → NQ/GC Ideas │ ${CHANNEL_HEADERS.FUTURES}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord futures trades sent: ${ideas.length} ideas`);
    } else {
      logger.error(`❌ Discord futures webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord futures trades:', error);
  }
}

// Send chart analysis to Discord
export async function sendChartAnalysisToDiscord(analysis: {
  symbol: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  entryPoint: number;
  targetPrice: number;
  stopLoss: number;
  patterns: string[];
  analysis: string;
  riskRewardRatio: number;
  timeframe?: string;
}): Promise<boolean> {
  if (DISCORD_DISABLED) return false;
  
  // Use dedicated chart analysis webhook, fall back to general webhook
  const webhookUrl = process.env.DISCORD_WEBHOOK_CHARTANALYSIS || process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_CHARTANALYSIS not configured - skipping chart analysis alert');
    return false;
  }
  
  try {
    const isBullish = analysis.sentiment === "bullish";
    const isBearish = analysis.sentiment === "bearish";
    const sentimentEmoji = isBullish ? "🟢" : isBearish ? "🔴" : "🟡";
    const color = isBullish ? 0x22c55e : isBearish ? 0xef4444 : 0xf59e0b;
    
    // Calculate gain %
    const gainPercent = ((analysis.targetPrice - analysis.entryPoint) / analysis.entryPoint * 100).toFixed(1);
    
    const embed: DiscordEmbed = {
      title: `${sentimentEmoji} Chart Analysis: ${analysis.symbol.toUpperCase()}`,
      description: `**${analysis.sentiment.toUpperCase()}** • ${analysis.confidence}% Confidence`,
      color,
      fields: [
        {
          name: '💰 Entry',
          value: `$${analysis.entryPoint.toFixed(2)}`,
          inline: true
        },
        {
          name: '🎯 Target',
          value: `$${analysis.targetPrice.toFixed(2)} (+${gainPercent}%)`,
          inline: true
        },
        {
          name: '🛡️ Stop',
          value: `$${analysis.stopLoss.toFixed(2)}`,
          inline: true
        },
        {
          name: '📊 R:R',
          value: `${analysis.riskRewardRatio.toFixed(1)}:1`,
          inline: true
        },
        {
          name: '⏰ Timeframe',
          value: analysis.timeframe || 'Daily',
          inline: true
        },
        {
          name: '📈 Patterns',
          value: analysis.patterns.slice(0, 3).join(', ') || 'None detected',
          inline: true
        },
        {
          name: '📝 Analysis',
          value: analysis.analysis.length > 1020 
            ? analysis.analysis.substring(0, 1020) + '...' 
            : analysis.analysis,
          inline: false
        }
      ],
      footer: {
        text: 'Quant Edge Labs Chart Analysis • Not financial advice'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `📊 **CHART ANALYSIS** → ${analysis.symbol.toUpperCase()} ${sentimentEmoji} │ ${CHANNEL_HEADERS.CHART_ANALYSIS}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord chart analysis sent: ${analysis.symbol}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('❌ Failed to send Discord chart analysis:', error);
    return false;
  }
}

// Send lotto play to dedicated lotto Discord channel
export async function sendLottoToDiscord(idea: TradeIdea): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_LOTTO;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_LOTTO not configured - skipping lotto alert');
    return;
  }
  
  try {
    const isCall = idea.optionType === 'call';
    const color = isCall ? 0x22c55e : 0xef4444; // Green for calls, red for puts
    
    // Format expiry nicely
    const expiryFormatted = idea.expiryDate || 'N/A';
    
    // Calculate DTE from expiry and determine target multiplier
    let dteText = 'N/A';
    let dte = 7; // Default to 7 if unknown
    if (idea.expiryDate) {
      const expiryDate = new Date(idea.expiryDate);
      const now = new Date();
      dte = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      dteText = `${dte}d`;
    }
    
    // DTE-aware target multiplier (matches calculateLottoTargets logic)
    const targetMultiplier = dte === 0 ? 4 : dte <= 2 ? 7 : 15;
    const targetLabel = dte === 0 ? 'gamma play' : dte <= 2 ? 'short-term' : 'weekly lotto';
    
    // Calculate potential return
    const potentialReturn = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(0);
    
    // Determine holding period label
    const holdingLabel = idea.holdingPeriod === 'position' ? 'Position Trade' : 
                         idea.holdingPeriod === 'swing' ? 'Swing Trade' : 'Day Trade';
    
    // Get sector if available
    const sectorText = idea.sectorFocus && (idea.sectorFocus as string) !== 'general' ? idea.sectorFocus.toUpperCase() : '';
    
    const embed: DiscordEmbed = {
      title: `🎰 LOTTO: ${idea.symbol} ${(idea.optionType || 'OPT').toUpperCase()} $${idea.strikePrice}`,
      description: `**${expiryFormatted} exp** (${dteText}) | ${holdingLabel} targeting **${potentialReturn}%**`,
      color,
      fields: [
        { name: '💰 Entry', value: `$${idea.entryPrice.toFixed(2)}`, inline: true },
        { name: '🎯 Target', value: `$${idea.targetPrice.toFixed(2)}`, inline: true },
        { name: '🛡️ Stop', value: `$${idea.stopLoss.toFixed(2)}`, inline: true }
      ],
      footer: { text: '⚠️ HIGH RISK | Quant Edge Labs' },
      timestamp: new Date().toISOString()
    };
    
    // Add unique analysis if available
    if (idea.analysis && idea.analysis.length > 50) {
      embed.fields.push({
        name: '📝 Analysis',
        value: idea.analysis.substring(0, 250) + (idea.analysis.length > 250 ? '...' : ''),
        inline: false
      });
    }
    
    const message: DiscordMessage = {
      content: `🎰 **LOTTO ALERT** → ${idea.symbol} ${(idea.optionType || 'OPT').toUpperCase()} $${idea.strikePrice} exp ${expiryFormatted} │ ${CHANNEL_HEADERS.LOTTO}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord lotto alert sent: ${idea.symbol} ${idea.optionType} $${idea.strikePrice}`);
    } else {
      logger.warn(`⚠️ Discord lotto webhook failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord lotto alert:', error);
  }
}

// Send bot trade entry notification to Discord
// Bot entries (when bot ACTUALLY trades) go to #quantbot channel
// This is separate from trade ideas (research signals) which go to #trade-alerts
export async function sendBotTradeEntryToDiscord(position: {
  symbol: string;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  entryPrice: number;
  quantity: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
  direction?: 'long' | 'short' | null; // Added for futures support
}): Promise<void> {
  logger.info(`📱 [DISCORD] sendBotTradeEntryToDiscord called for ${position.symbol}`);
  
  if (DISCORD_DISABLED) {
    logger.warn(`📱 [DISCORD] DISABLED - skipping entry notification for ${position.symbol}`);
    return;
  }
  
  // Route to specific channel based on asset type
  const webhookUrl = position.assetType === 'future' 
    ? (process.env.DISCORD_WEBHOOK_FUTURE_TRADES || process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL)
    : (process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL);
  
  if (!webhookUrl) {
    logger.warn(`📱 [DISCORD] No webhook URL configured - skipping entry notification for ${position.symbol}`);
    return;
  }
  
  logger.info(`📱 [DISCORD] Sending entry notification to webhook for ${position.symbol}...`);
  
  try {
    const isCall = position.optionType === 'call';
    const color = isCall ? 0x22c55e : 0xef4444;
    const contractCost = position.entryPrice * position.quantity * 100;
    
    const embed: DiscordEmbed = {
      title: `🤖 BOT ENTRY: ${position.symbol} ${(position.optionType || 'OPT').toUpperCase()} $${position.strikePrice}`,
      description: `Auto-Lotto Bot opened position`,
      color,
      fields: [
        { name: '💰 Entry', value: `$${position.entryPrice.toFixed(2)}`, inline: true },
        { name: '📦 Qty', value: `${position.quantity}`, inline: true },
        { name: '🎯 Target', value: position.targetPrice ? `$${position.targetPrice.toFixed(2)}` : 'N/A', inline: true }
      ],
      footer: { text: '🤖 Auto-Lotto Bot' },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `🤖 **BOT ENTRY** → ${position.symbol} ${(position.optionType || '').toUpperCase()} $${position.strikePrice} x${position.quantity} @ $${position.entryPrice.toFixed(2)} │ ${CHANNEL_HEADERS.LOTTO}`,
      embeds: [embed]
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    logger.info(`✅ Discord bot entry notification sent: ${position.symbol}`);
  } catch (error) {
    logger.error('❌ Failed to send Discord bot entry notification:', error);
  }
}

// Send bot trade exit notification to Discord
// Bot exits go to #quantbot channel (same as bot entries)
// Winning trades ALSO go to #gains via sendGainsToDiscord
export async function sendBotTradeExitToDiscord(position: {
  symbol: string;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  entryPrice: number;
  exitPrice?: number | null;
  quantity: number;
  realizedPnL?: number | null;
  exitReason?: string | null;
}): Promise<void> {
  logger.info(`📱 [DISCORD] sendBotTradeExitToDiscord called for ${position.symbol}`);
  
  if (DISCORD_DISABLED) {
    logger.warn(`📱 [DISCORD] DISABLED - skipping exit notification for ${position.symbol}`);
    return;
  }
  
  // Route to specific channel based on asset type
  const webhookUrl = position.assetType === 'future'
    ? (process.env.DISCORD_WEBHOOK_FUTURE_TRADES || process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL)
    : (process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL);
  
  if (!webhookUrl) {
    logger.warn(`📱 [DISCORD] No webhook URL configured - skipping exit notification for ${position.symbol}`);
    return;
  }
  
  logger.info(`📱 [DISCORD] Sending exit notification to webhook for ${position.symbol}...`);
  
  try {
    const pnl = position.realizedPnL || 0;
    const isWin = pnl > 0;
    const color = isWin ? 0x22c55e : 0xef4444;
    const emoji = isWin ? '🎉' : '💀';
    const pnlPercent = position.entryPrice > 0 
      ? ((position.exitPrice || 0) - position.entryPrice) / position.entryPrice * 100 
      : 0;
    
    const reasonText = position.exitReason === 'target_hit' ? 'Target Hit' :
                       position.exitReason === 'stop_hit' ? 'Stop Hit' :
                       position.exitReason === 'expired' ? 'Expired' : 'Closed';
    
    const embed: DiscordEmbed = {
      title: `${emoji} BOT EXIT: ${position.symbol} ${(position.optionType || 'OPT').toUpperCase()} $${position.strikePrice}`,
      description: `Closed - **${reasonText}**`,
      color,
      fields: [
        { name: '🚪 Exit', value: `$${(position.exitPrice || 0).toFixed(2)}`, inline: true },
        { name: '📊 P&L', value: `${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`, inline: true },
        { name: '📋 Reason', value: reasonText, inline: true }
      ],
      footer: { text: '🤖 Auto-Lotto Bot' },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `${emoji} **BOT EXIT** → ${position.symbol} | ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | ${reasonText} │ ${CHANNEL_HEADERS.LOTTO}`,
      embeds: [embed]
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    logger.info(`✅ Discord bot exit notification sent: ${position.symbol} P&L: $${pnl.toFixed(2)}`);
  } catch (error) {
    logger.error('❌ Failed to send Discord bot exit notification:', error);
  }
}

// Send crypto bot trade notification to Discord
export async function sendCryptoBotTradeToDiscord(trade: {
  symbol: string;
  name: string;
  direction: 'long' | 'short';
  entryPrice: number;
  quantity: number;
  targetPrice: number;
  stopLoss: number;
  signals: string[];
}): Promise<void> {
  // USER REQUEST: ONLY options to Discord. Crypto bot trades only on platform.
  logger.info(`🪙 [CRYPTO-BOT] Skipping Discord notification for ${trade.symbol} (Options-only policy)`);
  return;
}

// Send watchlist items to QuantBot channel (for bot page watchlist)
export async function sendWatchlistToQuantBot(items: Array<{
  symbol: string;
  assetType: string;
  notes?: string | null;
  entryAlertPrice?: number | null;
  targetAlertPrice?: number | null;
  stopAlertPrice?: number | null;
}>): Promise<{ success: boolean; message: string }> {
  if (DISCORD_DISABLED) return { success: false, message: 'Discord disabled' };
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_QUANTBOT not configured - skipping watchlist to QuantBot');
    return { success: false, message: 'Discord webhook not configured' };
  }
  
  if (items.length === 0) {
    logger.info('📭 No watchlist items to send to QuantBot');
    return { success: false, message: 'No items to send' };
  }
  
  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });
    
    // Format watchlist items with trade details
    const itemList = items.slice(0, 15).map((item, i) => {
      const typeIcon = item.assetType === 'crypto' ? '₿' : item.assetType === 'option' ? '📋' : '📈';
      const entry = item.entryAlertPrice ? `Entry $${item.entryAlertPrice.toFixed(2)}` : '';
      const target = item.targetAlertPrice ? `Target $${item.targetAlertPrice.toFixed(2)}` : '';
      const stop = item.stopAlertPrice ? `Stop $${item.stopAlertPrice.toFixed(2)}` : '';
      const levels = [entry, target, stop].filter(Boolean).join(' • ');
      const notesStr = item.notes ? `\n   _${item.notes.substring(0, 60)}${item.notes.length > 60 ? '...' : ''}_` : '';
      return `${i + 1}. ${typeIcon} **${item.symbol}** ${levels ? `→ ${levels}` : ''}${notesStr}`;
    }).join('\n');
    
    // Count by asset type
    const stocks = items.filter(i => i.assetType === 'stock').length;
    const options = items.filter(i => i.assetType === 'option').length;
    const crypto = items.filter(i => i.assetType === 'crypto').length;
    
    const embed: DiscordEmbed = {
      title: `🤖 QuantBot Watchlist - ${dateStr} CT`,
      description: `**${items.length} Items Under Surveillance**\n\n${itemList}`,
      color: 0x06b6d4, // Cyan for QuantBot
      fields: [
        {
          name: '📊 Asset Mix',
          value: `${stocks} Stocks • ${options} Options • ${crypto} Crypto`,
          inline: true
        },
        {
          name: '🎯 With Alerts',
          value: `${items.filter(i => i.entryAlertPrice || i.targetAlertPrice || i.stopAlertPrice).length} of ${items.length}`,
          inline: true
        }
      ],
      footer: {
        text: '⚠️ Research only - not financial advice | Quant Edge Labs QuantBot'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `🤖 **QUANTBOT WATCHLIST** → ${items.length} items on radar`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord QuantBot watchlist sent: ${items.length} items`);
      return { success: true, message: `Sent ${items.length} items to QuantBot channel` };
    } else {
      logger.warn(`⚠️ Discord QuantBot webhook failed: ${response.status}`);
      return { success: false, message: `Discord error: ${response.status}` };
    }
  } catch (error) {
    logger.error('❌ Failed to send QuantBot watchlist:', error);
    return { success: false, message: 'Failed to send to Discord' };
  }
}

// Send annual breakout candidates to Discord (all 20 stocks)
export async function sendAnnualBreakoutsToDiscord(items: Array<{
  symbol: string;
  sector?: string | null;
  startOfYearPrice?: number | null;
  yearlyTargetPrice?: number | null;
  conviction?: string | null;
  thesis?: string | null;
}>): Promise<{ success: boolean; message: string }> {
  if (DISCORD_DISABLED) return { success: false, message: 'Discord disabled' };
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_WEEKLYWATCHLISTS || process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ Discord webhook not configured - skipping annual breakouts');
    return { success: false, message: 'Discord webhook not configured' };
  }
  
  if (items.length === 0) {
    return { success: false, message: 'No breakout candidates to send' };
  }
  
  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    // Format all breakout candidates (up to 20)
    const itemList = items.slice(0, 20).map((item, i) => {
      const entry = item.startOfYearPrice ? `$${item.startOfYearPrice.toFixed(0)}` : '-';
      const target = item.yearlyTargetPrice ? `$${item.yearlyTargetPrice.toFixed(0)}` : '-';
      const upside = item.yearlyTargetPrice && item.startOfYearPrice 
        ? `+${Math.round(((item.yearlyTargetPrice - item.startOfYearPrice) / item.startOfYearPrice) * 100)}%`
        : '';
      const conviction = item.conviction === 'high' ? '🔥' : item.conviction === 'speculative' ? '⚡' : '📊';
      return `${i + 1}. ${conviction} **${item.symbol}** → ${entry} → ${target} ${upside}`;
    }).join('\n');
    
    // Count by conviction
    const highConviction = items.filter(i => i.conviction === 'high').length;
    const speculative = items.filter(i => i.conviction === 'speculative').length;
    const sectors = new Set(items.map(i => i.sector).filter(Boolean)).size;
    const avgUpside = Math.round(items.reduce((sum, item) => {
      if (!item.yearlyTargetPrice || !item.startOfYearPrice) return sum;
      return sum + ((item.yearlyTargetPrice - item.startOfYearPrice) / item.startOfYearPrice) * 100;
    }, 0) / items.length);
    
    const embed: DiscordEmbed = {
      title: `🚀 2026 Breakout Candidates - ${dateStr}`,
      description: `**${items.length} Stocks with $70+ Target Potential**\n\n${itemList}`,
      color: 0x10b981, // Emerald
      fields: [
        {
          name: '🔥 High Conviction',
          value: `${highConviction}`,
          inline: true
        },
        {
          name: '⚡ Speculative',
          value: `${speculative}`,
          inline: true
        },
        {
          name: '📈 Avg Upside',
          value: `+${avgUpside}%`,
          inline: true
        },
        {
          name: '🏷️ Sectors',
          value: `${sectors} sectors`,
          inline: true
        }
      ],
      footer: {
        text: '⚠️ Research only - not financial advice | Quant Edge Labs'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `🚀 **2026 BREAKOUT WATCHLIST** → ${items.length} curated candidates`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord annual breakouts sent: ${items.length} candidates`);
      return { success: true, message: `Sent ${items.length} breakout candidates to Discord` };
    } else {
      logger.warn(`⚠️ Discord annual breakouts webhook failed: ${response.status}`);
      return { success: false, message: `Discord error: ${response.status}` };
    }
  } catch (error) {
    logger.error('❌ Failed to send annual breakouts:', error);
    return { success: false, message: 'Failed to send to Discord' };
  }
}

// Send weekly watchlist summary to dedicated channel
export async function sendWeeklyWatchlistToDiscord(items: Array<{
  symbol: string;
  assetType: string;
  notes?: string | null;
  entryAlertPrice?: number | null;
  targetAlertPrice?: number | null;
  stopAlertPrice?: number | null;
}>): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_WEEKLYWATCHLISTS;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_WEEKLYWATCHLISTS not configured - skipping watchlist summary');
    return;
  }
  
  if (items.length === 0) {
    logger.info('📭 No watchlist items to send');
    return;
  }
  
  try {
    // Get current date
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    
    // Format watchlist items
    const itemList = items.slice(0, 10).map((item, i) => {
      const typeIcon = item.assetType === 'crypto' ? '₿' : item.assetType === 'option' ? '📋' : '📈';
      const entry = item.entryAlertPrice ? `Entry $${item.entryAlertPrice.toFixed(2)}` : '';
      const target = item.targetAlertPrice ? `Target $${item.targetAlertPrice.toFixed(2)}` : '';
      const stop = item.stopAlertPrice ? `Stop $${item.stopAlertPrice.toFixed(2)}` : '';
      const levels = [entry, target, stop].filter(Boolean).join(' • ');
      return `${i + 1}. ${typeIcon} **${item.symbol}** ${levels ? `→ ${levels}` : ''}`;
    }).join('\n');
    
    // Count by asset type
    const stocks = items.filter(i => i.assetType === 'stock').length;
    const options = items.filter(i => i.assetType === 'option').length;
    const crypto = items.filter(i => i.assetType === 'crypto').length;
    
    const embed: DiscordEmbed = {
      title: `📋 Weekly Watchlist - ${dateStr}`,
      description: `**${items.length} Items on Radar**\n\n${itemList}`,
      color: 0x8b5cf6, // Purple
      fields: [
        {
          name: '📊 Breakdown',
          value: `${stocks} Stocks • ${options} Options • ${crypto} Crypto`,
          inline: true
        },
        {
          name: '🔔 Alerts Set',
          value: `${items.filter(i => i.entryAlertPrice || i.targetAlertPrice || i.stopAlertPrice).length}`,
          inline: true
        }
      ],
      footer: {
        text: '⚠️ Educational research only - not financial advice | Quant Edge Labs'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `📋 **WEEKLY WATCHLIST** → ${items.length} items tracked │ ${CHANNEL_HEADERS.WEEKLY_WATCHLIST}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord weekly watchlist sent: ${items.length} items`);
    } else {
      logger.warn(`⚠️ Discord watchlist webhook failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord watchlist summary:', error);
  }
}

// Send next week's premium picks to Discord
export async function sendNextWeekPicksToDiscord(picks: Array<{
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  expirationFormatted?: string;
  suggestedExitDate?: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetMultiplier: number;
  dteCategory: '0DTE' | '1-2DTE' | '3-7DTE' | 'swing';
  playType: 'lotto' | 'day_trade' | 'swing';
  confidence: number;
  catalyst: string;
  delta: number;
  volume: number;
  dte?: number;
  optimalHoldDays?: number;
  riskAnalysis?: string;
  botAnalysis?: string;
}>, weekRange: { start: string; end: string }): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  // Use weekly watchlist webhook for premium picks, NOT gains channel
  const webhookUrl = process.env.DISCORD_WEBHOOK_WEEKLYWATCHLISTS || process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ Discord webhook not configured - skipping next week picks');
    return;
  }
  
  if (picks.length === 0) {
    logger.info('📭 No premium picks generated for next week');
    return;
  }
  
  try {
    // Group by play type
    const lottos = picks.filter(p => p.playType === 'lotto');
    const dayTrades = picks.filter(p => p.playType === 'day_trade');
    const swings = picks.filter(p => p.playType === 'swing');
    
    // Format picks by category with enhanced date analysis and bot thoughts
    const formatPick = (p: typeof picks[0]) => {
      const emoji = p.optionType === 'call' ? '🟢' : '🔴';
      const type = p.optionType.toUpperCase();
      const exp = p.expirationFormatted || p.expiration.substring(5).replace('-', '/');
      const gain = ((p.targetPrice - p.entryPrice) / p.entryPrice * 100).toFixed(0);
      const dteInfo = p.dte ? ` (${p.dte}DTE)` : '';
      const exitInfo = p.suggestedExitDate ? `\n   📅 Exit by: ${p.suggestedExitDate}` : '';
      const holdInfo = p.optimalHoldDays !== undefined ? ` • Hold: ${p.optimalHoldDays === 0 ? 'same day' : p.optimalHoldDays + 'd'}` : '';
      const botThoughts = p.botAnalysis ? `\n   🤖 *${p.botAnalysis}*` : '';
      
      return `${emoji} **${p.symbol}** ${type} $${p.strike} exp ${exp}${dteInfo}\n` +
             `   💰 Entry $${p.entryPrice.toFixed(2)} → Target $${p.targetPrice.toFixed(2)} (${p.targetMultiplier}x, +${gain}%)${holdInfo}${exitInfo}\n` +
             `   ⚡ ${p.confidence}% conf | δ${(p.delta * 100).toFixed(0)}${botThoughts}`;
    };
    
    // Build description
    let description = '';
    
    if (lottos.length > 0) {
      description += `**🎰 LOTTO PLAYS (4x-15x targets)**\n`;
      description += lottos.slice(0, 5).map(formatPick).join('\n');
      description += '\n\n';
    }
    
    if (dayTrades.length > 0) {
      description += `**⚡ DAY TRADES (2x targets)**\n`;
      description += dayTrades.slice(0, 5).map(formatPick).join('\n');
      description += '\n\n';
    }
    
    if (swings.length > 0) {
      description += `**📊 SWING TRADES (1.5x targets)**\n`;
      description += swings.slice(0, 5).map(formatPick).join('\n');
    }
    
    // Calculate average DTE
    const avgDTE = picks.filter(p => p.dte).length > 0 
      ? Math.round(picks.filter(p => p.dte).reduce((sum, p) => sum + (p.dte || 0), 0) / picks.filter(p => p.dte).length)
      : 0;
    
    const embed: DiscordEmbed = {
      title: `🎯 NEXT WEEK'S PREMIUM PICKS (${weekRange.start} - ${weekRange.end})`,
      description: description.trim(),
      color: 0xa855f7, // Purple for premium
      fields: [
        {
          name: '📊 Breakdown',
          value: `${lottos.length} Lotto • ${dayTrades.length} Day Trades • ${swings.length} Swings`,
          inline: true
        },
        {
          name: '🔥 Avg Confidence',
          value: `${Math.round(picks.reduce((sum, p) => sum + p.confidence, 0) / picks.length)}%`,
          inline: true
        },
        {
          name: '📅 Avg DTE',
          value: avgDTE > 0 ? `${avgDTE} days` : 'N/A',
          inline: true
        }
      ],
      footer: {
        text: '⚠️ Educational research only - not financial advice | Quant Edge Labs Auto-Lotto Bot Style'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `🎯 **NEXT WEEK PREMIUM PICKS** → ${picks.length} curated plays │ ${CHANNEL_HEADERS.WEEKLY_WATCHLIST}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    
    if (response.ok) {
      logger.info(`✅ Discord next week picks sent: ${picks.length} plays`);
    } else {
      logger.warn(`⚠️ Discord next week picks webhook failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord next week picks:', error);
  }
}

// Send daily summary of top trade ideas (scheduled for 8:30 AM CT)
// FORMAT: Compact one-liner style for quick scanning
// DESTINATION: #quant-floor channel
export async function sendDailySummaryToDiscord(ideas: TradeIdea[]): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_GAINS;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_QUANTFLOOR not configured - skipping daily summary');
    return;
  }
  
  try {
    // Get today's date in CT
    const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const dateStr = nowCT.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    
    // Filter to open ideas with decent confidence (60%+)
    const topIdeas = ideas
      .filter(i => 
        i.outcomeStatus === 'open' && 
        (i.confidenceScore || 50) >= 60
      )
      .sort((a, b) => {
        // Sort by confidence then R:R
        const aConf = a.confidenceScore || 50;
        const bConf = b.confidenceScore || 50;
        if (bConf !== aConf) return bConf - aConf;
        return (b.riskRewardRatio || 1) - (a.riskRewardRatio || 1);
      })
      .slice(0, 5);
    
    if (topIdeas.length === 0) {
      logger.info('📭 No trade ideas for daily preview');
      return;
    }
    
    // Build compact one-liner format like user wants
    const tradeLines: string[] = [];
    let longCount = 0;
    let shortCount = 0;
    let totalSignals = 0;
    let totalRR = 0;
    
    for (const idea of topIdeas) {
      const isLong = idea.direction === 'long';
      const arrow = isLong ? '🟢' : '🔴';
      longCount += isLong ? 1 : 0;
      shortCount += isLong ? 0 : 1;
      
      // Asset type label
      let assetLabel = '';
      if (idea.assetType === 'option') {
        const cpLabel = idea.optionType === 'call' ? 'CALL' : 'PUT';
        const strike = idea.strikePrice ? `$${idea.strikePrice}` : '';
        const exp = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
        assetLabel = `${cpLabel} ${strike} ${exp}`;
      } else if (idea.assetType === 'crypto') {
        assetLabel = 'CRYPTO';
      } else {
        assetLabel = 'SHARES';
      }
      
      // Calculate gain %
      const gainPct = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(1);
      
      // Confidence grade
      const confidence = idea.confidenceScore || 50;
      const signalCount = idea.qualitySignals?.length || 0;
      totalSignals += signalCount;
      totalRR += idea.riskRewardRatio || 1;
      
      const grade = confidence >= 90 ? 'A+' : 
                    confidence >= 80 ? 'A' : 
                    confidence >= 70 ? 'B' : 'C';
      
      // Source icon
      const sourceIcon = idea.source === 'ai' ? '🧠' : 
                        idea.source === 'flow' ? '📊' : 
                        idea.source === 'quant' ? '📈' : '⚡';
      
      // Compact one-liner: 🟢 AAPL CALL $280 01/16 | $1.19→$1.49 (+25.0%) | A (4/5) 🧠
      const line = `${arrow} **${idea.symbol}** ${assetLabel} | $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${grade} (${signalCount}/5) ${sourceIcon}`;
      tradeLines.push(line);
    }
    
    // Calculate averages
    const avgSignals = (totalSignals / topIdeas.length).toFixed(0);
    const avgRR = (totalRR / topIdeas.length).toFixed(1);
    
    // Build the full message with stats
    const statsLine = `📊 **Total Open**: ${topIdeas.length} ideas | 📈 **Direction**: ${longCount} Long • ${shortCount} Short | ⭐ **Avg Signals**: ${avgSignals}/5 | R:R ${avgRR}:1`;
    
    const embed: DiscordEmbed = {
      title: `📈 Daily Trading Preview - ${dateStr}`,
      description: `**Top ${topIdeas.length} Trade Ideas Today**\n\n${tradeLines.join('\n')}\n\n${statsLine}`,
      color: 0x22c55e,
      footer: {
        text: 'QuantEdge Research • View full details at Trade Desk'
      }
    };
    
    const message: DiscordMessage = {
      content: '',
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord daily preview sent: ${topIdeas.length} options plays`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord daily summary:', error);
  }
}

/**
 * 💰 Send Gains Notification to Discord
 * Routes to proper channel based on source:
 * - Bot gains → DISCORD_WEBHOOK_QUANTBOT (#quantbot)
 * - AI/Quant/Manual gains → DISCORD_WEBHOOK_GAINS (#gains)
 */
export async function sendGainsToDiscord(trade: {
  symbol: string;
  direction: 'long' | 'short';
  assetType: string;
  entryPrice: number;
  exitPrice: number;
  percentGain: number;
  source?: string;
  optionType?: string;
  strikePrice?: number;
  expiryDate?: string;
  holdingPeriod?: string;
}): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  // Route bot gains to #quantbot, all other gains (including lotto) to #gains
  const isBot = trade.source === 'bot';
  const webhookUrl = isBot 
    ? (process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL)
    : process.env.DISCORD_WEBHOOK_GAINS;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_GAINS not configured - skipping gains alert');
    return;
  }
  
  // DEDUP: Create unique key for this gains notification
  const optionKey = trade.assetType === 'option' ? `${trade.optionType}_${trade.strikePrice}_${trade.expiryDate}` : '';
  const dedupKey = `${trade.symbol}_${trade.direction}_${optionKey}_${trade.entryPrice?.toFixed(2)}_${trade.exitPrice?.toFixed(2)}`;
  const hash = generateMessageHash('gains', dedupKey);
  
  if (isDuplicateMessage(hash)) {
    logger.info(`🚫 [GAINS-DEDUP] Skipping duplicate gains notification: ${trade.symbol}`);
    return; // Skip duplicate
  }
  
  try {
    const gainEmoji = trade.percentGain >= 50 ? '🚀' : trade.percentGain >= 20 ? '🔥' : trade.percentGain >= 10 ? '💰' : '✅';
    const sourceIcon = trade.source === 'ai' ? '🧠 AI' : 
                       trade.source === 'quant' ? '✨ Quant' : 
                       trade.source === 'hybrid' ? '🎯 Hybrid' : 
                       trade.source === 'flow' ? '📊 Flow' :
                       trade.source === 'lotto' ? '🎰 Lotto' : '📝 Manual';
    
    // Build asset label
    let assetLabel: string;
    if (trade.assetType === 'option') {
      const optType = trade.optionType?.toUpperCase() || 'OPT';
      const strike = trade.strikePrice ? `$${trade.strikePrice}` : '';
      const exp = trade.expiryDate ? trade.expiryDate.substring(5).replace('-', '/') : '';
      assetLabel = `${optType} ${strike} ${exp}`.trim();
    } else if (trade.assetType === 'crypto') {
      assetLabel = 'CRYPTO';
    } else {
      assetLabel = 'SHARES';
    }
    
    // Calculate dollar gain (assuming $100 position for display)
    const dollarGainPer100 = (trade.percentGain / 100) * 100;
    
    const embed: DiscordEmbed = {
      title: `${gainEmoji} WINNER: ${trade.symbol} +${trade.percentGain.toFixed(1)}%`,
      description: `**${assetLabel}** Signal Hit Target!`,
      color: 0x22c55e, // Green
      fields: [
        { name: '📥 Entry', value: `$${trade.entryPrice.toFixed(2)}`, inline: true },
        { name: '📤 Exit', value: `$${trade.exitPrice.toFixed(2)}`, inline: true },
        { name: '💵 Gain', value: `+${trade.percentGain.toFixed(1)}%`, inline: true }
      ],
      footer: { text: 'Quant Edge Labs Results' },
      timestamp: new Date().toISOString()
    };
    
    // Use correct channel header based on routing
    const channelHeader = isBot ? CHANNEL_HEADERS.QUANTBOT : CHANNEL_HEADERS.GAINS;
    const botLabel = isBot ? '🤖 BOT WIN' : 'WINNER';
    
    const message: DiscordMessage = {
      content: `${gainEmoji} **${botLabel}** → ${trade.symbol} **+${trade.percentGain.toFixed(1)}%** │ ${channelHeader}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      const channelName = isBot ? '#quantbot' : '#gains';
      logger.info(`✅ Discord ${channelName} alert sent: ${trade.symbol} +${trade.percentGain.toFixed(1)}%`);
    } else {
      logger.error(`❌ Discord gains webhook failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord gains alert:', error);
  }
}

// Engine labels for Discord display
const ENGINE_LABELS_DISCORD: Record<string, string> = {
  ai: "AI Engine",
  quant: "Quant Engine",
  hybrid: "Hybrid Engine",
  flow: "Flow Scanner",
  lotto: "Lotto Scanner",
};

/**
 * Send Platform Report Notification to Discord
 * Called after daily/weekly/monthly reports are generated
 */
export async function sendReportNotificationToDiscord(report: {
  period: string;
  startDate: string;
  endDate: string;
  totalIdeasGenerated: number;
  overallWinRate: number | null;
  totalPnlPercent: number | null;
  bestPerformingEngine: string | null;
  totalWins?: number;
  totalLosses?: number;
}): Promise<void> {
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping report notification');
    return;
  }
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ Discord webhook URL not configured - skipping report notification');
    return;
  }
  
  try {
    const periodLabel = report.period.charAt(0).toUpperCase() + report.period.slice(1);
    const pnl = report.totalPnlPercent || 0;
    const isPositive = pnl >= 0;
    const color = isPositive ? 0x22c55e : 0xef4444; // Green for positive, red for negative
    
    const periodEmoji = report.period === 'daily' ? '📅' : report.period === 'weekly' ? '📆' : '🗓️';
    const pnlEmoji = isPositive ? '📈' : '📉';
    const winRate = report.overallWinRate?.toFixed(1) || '—';
    const bestEngine = ENGINE_LABELS_DISCORD[report.bestPerformingEngine || ''] || 'N/A';
    
    const embed: DiscordEmbed = {
      title: `${periodEmoji} ${periodLabel} Platform Report`,
      description: `**Report Period:** ${report.startDate} to ${report.endDate}\n\nPlatform performance summary for the ${report.period} period.`,
      color,
      fields: [
        {
          name: '💡 Ideas Generated',
          value: String(report.totalIdeasGenerated),
          inline: true
        },
        {
          name: '🎯 Win Rate',
          value: `${winRate}%`,
          inline: true
        },
        {
          name: `${pnlEmoji} Total P&L`,
          value: `${isPositive ? '+' : ''}${pnl.toFixed(2)}%`,
          inline: true
        },
        {
          name: '🏆 Best Engine',
          value: bestEngine,
          inline: true
        },
        {
          name: '✅ Wins',
          value: String(report.totalWins || 0),
          inline: true
        },
        {
          name: '❌ Losses',
          value: String(report.totalLosses || 0),
          inline: true
        }
      ],
      footer: {
        text: 'Quant Edge Labs • Automated Report'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `📊 **${periodLabel.toUpperCase()} REPORT GENERATED** │ ${periodEmoji} ${report.startDate} to ${report.endDate}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord report notification sent: ${periodLabel} report`);
    } else {
      logger.error(`❌ Discord report webhook failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord report notification:', error);
  }
}

/**
 * Send End-of-Day Trading Review to Discord
 * Summarizes the day's trading activity with P&L, wins/losses, and key trades
 */
export async function sendDailyTradingReviewToDiscord(review: {
  date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  openPositions: number;
  realizedPnL: number;
  unrealizedPnL: number;
  bestTrade?: { symbol: string; pnlPercent: number } | null;
  worstTrade?: { symbol: string; pnlPercent: number } | null;
  closedTrades: Array<{ symbol: string; pnlPercent: number; optionType?: string; strikePrice?: number }>;
}): Promise<boolean> {
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping daily trading review');
    return false;
  }
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_GAINS;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_QUANTFLOOR not configured - skipping daily trading review');
    return false;
  }
  
  try {
    const winRate = review.totalTrades > 0 ? (review.wins / review.totalTrades * 100) : 0;
    const totalPnL = review.realizedPnL + review.unrealizedPnL;
    const isPositive = totalPnL >= 0;
    const color = isPositive ? 0x22c55e : 0xef4444;
    
    const closedTradesList = review.closedTrades.slice(0, 5).map(t => {
      const pnlEmoji = t.pnlPercent >= 0 ? '✅' : '❌';
      const pnlStr = t.pnlPercent >= 0 ? `+${t.pnlPercent.toFixed(1)}%` : `${t.pnlPercent.toFixed(1)}%`;
      const optionInfo = t.optionType ? ` ${t.optionType.toUpperCase()} $${t.strikePrice}` : '';
      return `${pnlEmoji} ${t.symbol}${optionInfo}: ${pnlStr}`;
    }).join('\n') || 'No closed trades today';
    
    const embed: DiscordEmbed = {
      title: `📊 Daily Trading Review - ${review.date}`,
      description: `End-of-day summary for Auto-Lotto Bot paper trading.`,
      color,
      fields: [
        {
          name: '📈 Day Summary',
          value: `**Trades:** ${review.totalTrades} | **Wins:** ${review.wins} | **Losses:** ${review.losses}\n**Win Rate:** ${winRate.toFixed(1)}%`,
          inline: false
        },
        {
          name: '💰 P&L',
          value: `**Realized:** ${review.realizedPnL >= 0 ? '+' : ''}$${review.realizedPnL.toFixed(2)}\n**Unrealized:** ${review.unrealizedPnL >= 0 ? '+' : ''}$${review.unrealizedPnL.toFixed(2)}\n**Total:** ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`,
          inline: true
        },
        {
          name: '📂 Open Positions',
          value: String(review.openPositions),
          inline: true
        },
        {
          name: '🏆 Closed Trades',
          value: closedTradesList,
          inline: false
        }
      ],
      footer: {
        text: 'Quant Edge Labs • Auto-Lotto Bot • Paper Trading Only'
      },
      timestamp: new Date().toISOString()
    };
    
    if (review.bestTrade) {
      embed.fields!.push({
        name: '🥇 Best Trade',
        value: `${review.bestTrade.symbol}: +${review.bestTrade.pnlPercent.toFixed(1)}%`,
        inline: true
      });
    }
    
    if (review.worstTrade) {
      embed.fields!.push({
        name: '📉 Worst Trade',
        value: `${review.worstTrade.symbol}: ${review.worstTrade.pnlPercent.toFixed(1)}%`,
        inline: true
      });
    }
    
    const dayEmoji = isPositive ? '🟢' : '🔴';
    const message: DiscordMessage = {
      content: `${dayEmoji} **END OF DAY REVIEW** │ ${review.date} │ ${isPositive ? '+' : ''}$${totalPnL.toFixed(2)} │ ${CHANNEL_HEADERS.GAINS}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord daily trading review sent for ${review.date}`);
      return true;
    } else {
      logger.error(`❌ Discord daily review webhook failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord daily trading review:', error);
    return false;
  }
}

/**
 * Send Next-Day Options Outlook to Discord
 * Highlights options to watch for the next trading session
 */
export async function sendNextDayOutlookToDiscord(outlook: {
  date: string;
  topPicks: Array<{
    symbol: string;
    optionType: string;
    strikePrice: number;
    expiryDate: string;
    reason: string;
    grade: string;
  }>;
  marketNotes?: string;
}): Promise<boolean> {
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping next-day outlook');
    return false;
  }
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_GAINS;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_QUANTFLOOR not configured - skipping next-day outlook');
    return false;
  }
  
  try {
    const picksList = outlook.topPicks.slice(0, 5).map((pick, i) => {
      const gradeEmoji = pick.grade.includes('A') ? '🔥' : pick.grade.includes('B') ? '⭐' : '📌';
      return `${i + 1}. ${gradeEmoji} **${pick.symbol}** ${pick.optionType.toUpperCase()} $${pick.strikePrice} (${pick.expiryDate})\n   └ ${pick.reason} [${pick.grade}]`;
    }).join('\n\n') || 'No picks generated for tomorrow';
    
    const embed: DiscordEmbed = {
      title: `🔮 Options to Watch - ${outlook.date}`,
      description: `Top opportunities for the next trading session based on technical signals and flow analysis.`,
      color: 0x8b5cf6, // Purple
      fields: [
        {
          name: '🎯 Top Picks',
          value: picksList,
          inline: false
        }
      ],
      footer: {
        text: 'Quant Edge Labs • Research Only • Not Financial Advice'
      },
      timestamp: new Date().toISOString()
    };
    
    if (outlook.marketNotes) {
      embed.fields!.push({
        name: '📝 Market Notes',
        value: outlook.marketNotes,
        inline: false
      });
    }
    
    const message: DiscordMessage = {
      content: `🔮 **TOMORROW'S OPTIONS OUTLOOK** │ ${outlook.date} │ ${outlook.topPicks.length} picks │ ${CHANNEL_HEADERS.GAINS}`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(`✅ Discord next-day outlook sent for ${outlook.date}`);
      return true;
    } else {
      logger.error(`❌ Discord next-day outlook webhook failed: ${response.status}`);
      return false;
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord next-day outlook:', error);
    return false;
  }
}
