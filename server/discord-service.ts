// Discord webhook service for automated trade alerts
import type { TradeIdea } from "@shared/schema";
import { getSignalLabel } from "@shared/constants";
import { logger } from './logger';
import { isOptionsMarketOpen } from './paper-trading-service';

// GLOBAL DISABLE FLAG - Set to true to stop all Discord notifications
const DISCORD_DISABLED = false;

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY GATE - A-GRADE MINIMUM (75+ confidence, 4+ signals)
// User requested: ONLY highly convicted setups - tired of poor plays
// RAISED from B-grade (65%) to A-grade (75%) - Jan 2026
// "Bot sniped good entry again...need to trade more highly convicted setups"
// ═══════════════════════════════════════════════════════════════════════════
const MIN_SIGNALS_REQUIRED = 4; // Strong multi-engine validation (raised from 3)
const MIN_CONFIDENCE_REQUIRED = 75; // A-grade minimum (75% = A, 85% = A+)

// Maximum option premium cost (qty * price * 100) - prevents unaffordable alerts
const MAX_PREMIUM_COST = 1000; // $1000 max premium cost

// Valid grades for Discord alerts - A and A+ ONLY (no more B grades)
export const VALID_DISCORD_GRADES = ['A', 'A+'];

// Check if idea meets quality threshold to be sent to Discord
// Requires A-grade or better (75%+ confidence AND 4+ signals)
export function meetsQualityThreshold(idea: { 
  qualitySignals?: string[] | null; 
  confidenceScore?: number | null;
  assetType?: string;
  source?: string;
  probabilityBand?: string | null;
}): boolean {
  const signalCount = idea.qualitySignals?.length || 0;
  const confidence = idea.confidenceScore || 50;
  const grade = idea.probabilityBand || '';
  
  // STRICT: A-grade minimum (75%+ confidence AND 4+ signals) - highly convicted only
  const meetsConfidence = confidence >= MIN_CONFIDENCE_REQUIRED;
  const meetsSignals = signalCount >= MIN_SIGNALS_REQUIRED;
  
  // Also check grade if available - must be A or A+ 
  const hasValidGrade = !grade || VALID_DISCORD_GRADES.includes(grade);
  
  return meetsConfidence && meetsSignals && hasValidGrade;
}

// Check if option premium is affordable (under $1000 total cost)
export function isAffordablePremium(entryPrice: number, quantity: number = 5): boolean {
  const totalCost = entryPrice * quantity * 100; // Options are 100 shares each
  return totalCost <= MAX_PREMIUM_COST;
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
 * #ai-quant-options   │ DISCORD_WEBHOOK_OPTIONSTRADES│ Options trade ideas ONLY
 *                     │ (fallback: DISCORD_WEBHOOK_URL) │ Calls/puts with strike/exp
 * ───────────────────────────────────────────────────────────────────────────
 * #quant-ai           │ DISCORD_WEBHOOK_QUANTBOT     │ Bot entries, exits & bot gains
 *                     │                              │ Auto-Lotto Bot paper trading
 * ───────────────────────────────────────────────────────────────────────────
 * #lottos             │ DISCORD_WEBHOOK_LOTTO        │ Lotto detector alerts
 *                     │                              │ High-conviction lotto plays
 * ───────────────────────────────────────────────────────────────────────────
 * #quant-gains-los    │ DISCORD_WEBHOOK_GAINS        │ AI/Quant/Manual winning trades
 * ───────────────────────────────────────────────────────────────────────────
 * #future-trade-id    │ DISCORD_WEBHOOK_FUTURE_TRADES│ NQ/GC futures trades only
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
  LOTTO: 0xfacc15,   // Amber for Lotto
};

// Map portfolio IDs to display names and emojis
const PORTFOLIO_METADATA: Record<string, { name: string; emoji: string }> = {
  'options': { name: 'Options Portfolio', emoji: '🎯' },
  'small_account': { name: 'Small Account Lotto', emoji: '🎰' },
  'futures': { name: 'Futures Portfolio', emoji: '📈' },
  'crypto': { name: 'Crypto Portfolio', emoji: '₿' },
};

// Format bot trade for Discord - ENHANCED with portfolio context
export async function sendBotTradeEntryToDiscord(trade: {
  symbol: string;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  entryPrice: number;
  quantity: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
  direction?: 'long' | 'short' | null;
  analysis?: string | null;
  signals?: string[] | null;
  confidence?: number | null;
  riskRewardRatio?: number | null;
  isSmallAccount?: boolean;
  source?: 'quant' | 'lotto' | 'futures' | 'small_account';
  delta?: number | null;
  portfolio?: string;
  isLotto?: boolean;
}): Promise<void> {
  if (DISCORD_DISABLED) return;

  const portfolioId = trade.portfolio || (trade.isSmallAccount ? 'small_account' : 'options');
  const meta = PORTFOLIO_METADATA[portfolioId] || { name: 'Bot Portfolio', emoji: '🤖' };
  const isLotto = trade.isLotto || trade.source === 'lotto' || portfolioId === 'small_account';

  // Determine webhook URLs based on source/asset type
  const source = trade.source || (trade.assetType === 'future' ? 'futures' : 'quant');
  
  let webhookUrls: string[] = [];
  
  if (source === 'futures' || trade.assetType === 'future') {
    const futuresWebhook = process.env.DISCORD_WEBHOOK_FUTURE_TRADES;
    if (futuresWebhook) webhookUrls.push(futuresWebhook);
  } else if (source === 'lotto' || isLotto) {
    const lottoWebhook = process.env.DISCORD_WEBHOOK_LOTTO;
    if (lottoWebhook) webhookUrls.push(lottoWebhook);
  } else {
    const quantBotWebhook = process.env.DISCORD_WEBHOOK_QUANTBOT;
    if (quantBotWebhook) webhookUrls.push(quantBotWebhook);
  }
  
  if (webhookUrls.length === 0) {
    const fallback = process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL;
    if (fallback) webhookUrls.push(fallback);
  }
  
  if (webhookUrls.length === 0) return;

  try {
    const isCall = trade.optionType === 'call';
    const color = isLotto ? COLORS.LOTTO : (isCall ? 0x22c55e : 0xef4444);
    
    const embed: DiscordEmbed = {
      title: `${meta.emoji} ${trade.symbol} ${trade.optionType?.toUpperCase()} ${trade.strikePrice ? \`$\${trade.strikePrice}\` : ''} ENTRY`,
      description: trade.analysis || \`**\${meta.name}** has entered a new position.\`,
      color,
      fields: [
        { name: '💰 Entry', value: \`$\${trade.entryPrice.toFixed(2)}\`, inline: true },
        { name: '📦 Quantity', value: \`\${trade.quantity}\`, inline: true },
        { name: '🎯 Confidence', value: \`\${trade.confidence || 0}%\`, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: \`Quant Edge Labs • \${meta.name}\` }
    };

    if (trade.expiryDate) {
      embed.fields.push({ name: '📅 Expiry', value: trade.expiryDate, inline: true });
    }

    await Promise.allSettled(webhookUrls.map(url => 
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: \`🚀 **BOT ENTRY**: \${trade.symbol} (\${meta.name})\`,
          embeds: [embed]
        }),
      })
    ));
  } catch (error) {
    logger.error('❌ Failed to send Discord bot alert:', error);
  }
}

// Send bot exit to Discord
export async function sendBotTradeExitToDiscord(exit: {
  symbol: string;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  entryPrice: number;
  exitPrice?: number | null;
  quantity: number;
  realizedPnL?: number | null;
  exitReason?: string | null;
  isSmallAccount?: boolean;
  source?: 'quant' | 'lotto' | 'futures' | 'small_account';
  portfolio?: string;
  price?: number; // V1 fallback
  pnl?: number; // V1 fallback
  pnlPercent?: number; // V1 fallback
  reason?: string; // V1 fallback
}): Promise<void> {
  if (DISCORD_DISABLED) return;

  const portfolioId = exit.portfolio || (exit.isSmallAccount ? 'small_account' : 'options');
  const meta = PORTFOLIO_METADATA[portfolioId] || { name: 'Bot Portfolio', emoji: '🤖' };
  
  const isLotto = exit.source === 'lotto' || portfolioId === 'small_account';
  const webhookUrl = isLotto 
    ? (process.env.DISCORD_WEBHOOK_LOTTO || process.env.DISCORD_WEBHOOK_QUANTBOT)
    : process.env.DISCORD_WEBHOOK_QUANTBOT;

  if (!webhookUrl) return;

  try {
    const realizedPnL = exit.realizedPnL ?? exit.pnl ?? 0;
    const isProfit = realizedPnL > 0;
    const color = isProfit ? COLORS.LONG : COLORS.SHORT;
    const exitPrice = exit.exitPrice ?? exit.price ?? 0;
    const exitReason = exit.exitReason ?? exit.reason ?? 'Unknown';
    
    const embed: DiscordEmbed = {
      title: \`\${isProfit ? '💰' : '📉'} \${exit.symbol} EXIT (\${isProfit ? 'PROFIT' : 'LOSS'})\`,
      description: \`**\${meta.name}** has closed this position.\`,
      color,
      fields: [
        { name: '💵 Exit Price', value: \`$\${exitPrice.toFixed(2)}\`, inline: true },
        { name: '📊 P&L', value: \`\${isProfit ? '+' : ''}$\${realizedPnL.toFixed(2)}\`, inline: true },
        { name: '📝 Reason', value: exitReason, inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: \`Quant Edge Labs • \${meta.name}\` }
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`\${isProfit ? '✅' : '❌'} **BOT EXIT**: \${exit.symbol} (\${meta.name})\`,
        embeds: [embed]
      }),
    });
  } catch (error) {
    logger.error('❌ Failed to send Discord bot exit alert:', error);
  }
}

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
    const strike = idea.strikePrice ? \`$\${idea.strikePrice}\` : '';
    const expFormatted = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
    
    description = \`**\${optType} \${strike} exp \${expFormatted}**\n\n\`;
    description += \`\${sourceEmoji} **\${sourceLabel}** | \${gradeEmoji} Grade: **\${letterGrade}** (\${confidenceScore}%)\n\`;
    description += \`Signal Strength: \${signalStars} (\${signalCount}/5)\`;
  } else if (idea.assetType === 'crypto') {
    description = \`**Crypto Position**\n\n\${sourceEmoji} **\${sourceLabel}** | \${gradeEmoji} Grade: **\${letterGrade}**\`;
  } else if (idea.assetType === 'penny_stock') {
    description = \`**Penny Moonshot**\n\n\${sourceEmoji} **\${sourceLabel}** | \${gradeEmoji} Grade: **\${letterGrade}**\`;
  } else {
    description = \`**Shares**\n\n\${sourceEmoji} **\${sourceLabel}** | \${gradeEmoji} Grade: **\${letterGrade}**\`;
  }
  
  const embed: DiscordEmbed = {
    title: \`\${directionEmoji} \${idea.symbol} \${idea.direction.toUpperCase()} \${assetEmoji}\`,
    description,
    color,
    fields: [
      {
        name: '💰 Entry',
        value: \`$\${idea.entryPrice.toFixed(2)}\`,
        inline: true
      },
      {
        name: '🎯 Target',
        value: \`$\${idea.targetPrice.toFixed(2)} (+\${potentialGain}%)\`,
        inline: true
      },
      {
        name: '🛡️ Stop',
        value: idea.stopLoss ? \`$\${idea.stopLoss.toFixed(2)} (-\${potentialLoss}%)\` : 'Not set',
        inline: true
      },
      {
        name: '📊 Risk/Reward',
        value: \`**\${idea.riskRewardRatio}:1**\`,
        inline: true
      },
      {
        name: '⭐ Quant Edge Labs Grade',
        value: \`\${gradeEmoji} **\${letterGrade}** (\${confidenceScore}%)\`,
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
  
  // 📊 OPTIONS GREEKS - Critical for options traders
  if (idea.assetType === 'option' && idea.optionDelta) {
    const delta = Math.abs(idea.optionDelta);
    const deltaLabel = delta < 0.15 ? '🎰 Far OTM' : 
                       delta < 0.30 ? '📈 OTM' : 
                       delta < 0.45 ? '⚖️ ATM' : '💪 ITM';
    const thetaDisplay = idea.optionTheta ? \`θ=\${idea.optionTheta.toFixed(3)}\` : '';
    
    embed.fields.push({
      name: '📊 Greeks',
      value: \`δ=\${delta.toFixed(2)} \${deltaLabel}\${thetaDisplay ? \` | \${thetaDisplay}\` : ''}\`,
      inline: true
    });
  }
  
  // Add signals breakdown if available
  if (idea.qualitySignals && idea.qualitySignals.length > 0) {
    const signalsDisplay = idea.qualitySignals.slice(0, 4).join(' • ');
    embed.fields.push({
      name: \`📶 Technical Signals (\${signalCount}/5)\`,
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
      value: \`>>> \${analysisExcerpt}\${idea.analysis.length > 200 ? '...' : ''}\`,
      inline: false
    });
  }
  
  // Enhanced footer with data quality and risk
  const qualityEmoji = idea.dataSourceUsed && idea.dataSourceUsed !== 'estimated' ? '✅' : '⚠️';
  const riskLevel = idea.riskProfile === 'speculative' ? 'HIGH RISK' : 
                   idea.riskProfile === 'aggressive' ? 'AGGRESSIVE' : 'MODERATE';
  embed.footer = {
    text: \`\${qualityEmoji} \${idea.dataSourceUsed || 'Live Data'} | \${riskLevel} | Quant Edge Labs\`
  };
  
  return embed;
}

// Send trade idea to Discord webhook
// ALL research ideas (quant, AI, hybrid, flow) go to #trade-alerts
// Bot entries (when bot actually trades) go to #quantbot via sendBotTradeEntryToDiscord
export async function sendTradeIdeaToDiscord(idea: TradeIdea): Promise<void> {
  logger.info(\`📨 Discord single trade called: \${idea.symbol} (\${idea.source || 'unknown'}) assetType=\${idea.assetType}\`);
  
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping notification');
    return;
  }
  
  // QUALITY GATE: Only send trades with high/medium confidence
  if (!meetsQualityThreshold(idea)) {
    const signalCount = idea.qualitySignals?.length || 0;
    logger.info(\`📨 [QUALITY-GATE] Skipping \${idea.symbol} - only \${signalCount}/5 signals (below B grade threshold)\`);
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
    logger.info(\`📨 [PREMIUM-FILTER] Skipping \${idea.symbol} - premium too high ($\${idea.entryPrice})\`);
    return;
  }

  // AFFORDABILITY: Skip entries that cost more than $1000 for 5 contracts
  if (!isAffordablePremium(idea.entryPrice)) {
    logger.info(\`📨 [AFFORDABILITY-GATE] Skipping \${idea.symbol} - too expensive ($\${idea.entryPrice})\`);
    return;
  }

  // Generate message hash for final dedup
  const messageHash = generateMessageHash('trade', \`\${idea.symbol}:\${idea.source}:\${idea.assetType}\`);
  if (isDuplicateMessage(messageHash)) return;

  // Determine webhook URL based on asset type
  const webhookUrl = idea.assetType === 'option' 
    ? (process.env.DISCORD_WEBHOOK_OPTIONSTRADES || process.env.DISCORD_WEBHOOK_URL)
    : process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.warn('⚠️ Discord webhook not configured for single trade');
    return;
  }

  try {
    const embed = formatTradeIdeaEmbed(idea);
    const channelHeader = idea.assetType === 'option' ? CHANNEL_HEADERS.OPTIONS_TRADES : CHANNEL_HEADERS.TRADE_ALERTS;
    
    // Add special highlighting for GEMs (A+ grade)
    const isGem = isGemTrade({ qualitySignals: idea.qualitySignals, confidenceScore: idea.confidenceScore });
    const content = isGem ? \`💎 **A+ GEM DETECTED** → \${idea.symbol} │ \${channelHeader}\` : \`📢 **NEW RESEARCH** → \${idea.symbol} │ \${channelHeader}\`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, embeds: [embed] }),
    });

    if (response.ok) {
      logger.info(\`✅ Discord notification sent for \${idea.symbol}\`);
    } else {
      logger.error(\`❌ Discord webhook failed: \${response.status}\`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord trade idea:', error);
  }
}

// Send batch of trade ideas to Discord
export async function sendBatchTradeIdeasToDiscord(ideas: TradeIdea[], source: string): Promise<void> {
  if (DISCORD_DISABLED || ideas.length === 0) return;
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_OPTIONSTRADES || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const sourceLabel = source === 'ai' ? 'AI Engine' : 
                       source === 'quant' ? 'Quant Engine' : 
                       source === 'hybrid' ? 'Hybrid Intelligence' : 'Flow Scanner';
    
    const longIdeas = ideas.filter(i => i.direction === 'long');
    const shortIdeas = ideas.filter(i => i.direction === 'short');
    
    // Check if any idea is a GEM
    const hasGem = ideas.some(i => isGemTrade({ qualitySignals: i.qualitySignals, confidenceScore: i.confidenceScore }));
    const gemIndicator = hasGem ? ' 💎' : '';
    
    // Filter to meet quality threshold
    const filteredIdeas = ideas.filter(meetsQualityThreshold);
    if (filteredIdeas.length === 0) {
      logger.info(\`Batch \${sourceLabel}: 0/\${ideas.length} ideas met quality threshold (75%+ conf)\`);
      return;
    }

    const avgConfidence = Math.round(filteredIdeas.reduce((sum, i) => sum + (i.confidenceScore || 0), 0) / filteredIdeas.length);
    const avgRR = (filteredIdeas.reduce((sum, i) => sum + (i.riskRewardRatio || 0), 0) / filteredIdeas.length).toFixed(1);
    const avgGrade = getLetterGrade(avgConfidence);
    const color = source === 'ai' ? COLORS.AI : source === 'quant' ? COLORS.QUANT : COLORS.HYBRID;
    
    const topIdeas = filteredIdeas.slice(0, 15);
    const listLines = topIdeas.map(idea => {
      const isLong = idea.direction === 'long';
      const side = isLong ? '🟢' : '🔴';
      const type = idea.optionType?.toUpperCase() || 'OPT';
      const strike = idea.strikePrice ? \`$\${idea.strikePrice}\` : '';
      const exp = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
      const grade = getLetterGrade(idea.confidenceScore || 50);
      const entry = idea.entryPrice?.toFixed(2);
      const target = idea.targetPrice?.toFixed(2);
      const gain = idea.entryPrice ? ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(0) : '0';
      
      return \`\${side} **\${idea.symbol}** \${type} \${strike} \${exp} • \$\${entry}→\$\${target} (+\${gain}%) │ \${grade}\`;
    });

    const description = listLines.join('\n') + (filteredIdeas.length > 15 ? \`\\n*+\${filteredIdeas.length - 15} more in dashboard*\` : '');
    
    const embed: DiscordEmbed = {
      title: \`\${sourceLabel} - \${filteredIdeas.length} Trade Ideas\${gemIndicator}\`,
      description,
      color,
      fields: [
        { name: '📊 Direction', value: \`🟢 \${longIdeas.length} Long • 🔴 \${shortIdeas.length} Short\`, inline: true },
        { name: '✨ Avg Grade', value: \`**\${avgGrade}** (\${avgConfidence}%)\`, inline: true },
        { name: '📈 Avg R:R', value: \`**\${avgRR}:1**\`, inline: true }
      ],
      footer: { text: '⚠️ For educational research only | Quant Edge Labs' },
      timestamp: new Date().toISOString()
    };
    
    const channelHeader = CHANNEL_HEADERS.TRADE_ALERTS;
    const message: DiscordMessage = {
      content: \`📢 **BATCH ALERT** → \${ideas.length} \${sourceLabel} Ideas │ \${channelHeader}\`,
      embeds: [embed]
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    
    if (response.ok) {
      logger.info(\`✅ Discord batch summary sent: \${ideas.length} \${source} ideas\`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord batch summary:', error);
  }
}

// Send futures trade ideas to dedicated Discord channel
export async function sendFuturesTradesToDiscord(ideas: TradeIdea[]): Promise<void> {
  logger.info(\`📨 Discord futures trades called: \${ideas.length} ideas\`);
  
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping futures notification');
    return;
  }
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_FUTURE_TRADES || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || ideas.length === 0) return;

  try {
    const formatFuturesIdea = (idea: TradeIdea) => {
      const emoji = idea.direction === 'long' ? '🟢' : '🔴';
      const gainPct = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(2);
      const riskPct = ((idea.entryPrice - idea.stopLoss) / idea.entryPrice * 100).toFixed(2);
      const contractInfo = idea.futuresContractCode || idea.symbol;
      const rootSymbol = idea.futuresRootSymbol || idea.symbol.substring(0, 2);
      
      return \`\${emoji} **\${rootSymbol}** (\${contractInfo}) \${idea.direction.toUpperCase()}\\n\` +
             \`Entry: \$\${idea.entryPrice.toFixed(2)} → Target: \$\${idea.targetPrice.toFixed(2)} (+\${gainPct}%)\\n\` +
             \`Stop: \$\${idea.stopLoss.toFixed(2)} (-\${riskPct}%) | R:R \${idea.riskRewardRatio?.toFixed(1) || 'N/A'}:1\`;
    };
    
    const description = ideas.map(formatFuturesIdea).join('\n\n');
    
    const embed: DiscordEmbed = {
      title: \`🔮 Futures Trade Ideas - \${ideas.length} Setups\`,
      description,
      color: 0x8B5CF6,
      fields: [
        {
          name: 'Direction',
          value: \`🟢 \${ideas.filter(i => i.direction === 'long').length} Long • 🔴 \${ideas.filter(i => i.direction === 'short').length} Short\`,
          inline: true
        }
      ],
      footer: { text: 'Quant Edge Labs Futures • Educational Research Only' },
      timestamp: new Date().toISOString()
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`🔮 **\${ideas.length} FUTURES TRADES** → NQ/GC Ideas │ \${CHANNEL_HEADERS.FUTURES}\`,
        embeds: [embed]
      }),
    });
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
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_CHARTANALYSIS || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const isBullish = analysis.sentiment === "bullish";
    const isBearish = analysis.sentiment === "bearish";
    const sentimentEmoji = isBullish ? "🟢" : isBearish ? "🔴" : "🟡";
    const color = isBullish ? 0x22c55e : isBearish ? 0xef4444 : 0xf59e0b;
    const gainPercent = ((analysis.targetPrice - analysis.entryPoint) / analysis.entryPoint * 100).toFixed(1);
    
    const embed: DiscordEmbed = {
      title: \`\${sentimentEmoji} Chart Analysis: \${analysis.symbol.toUpperCase()}\`,
      description: \`**\${analysis.sentiment.toUpperCase()}** • \${analysis.confidence}% Confidence\`,
      color,
      fields: [
        { name: '💰 Entry', value: \`$\${analysis.entryPoint.toFixed(2)}\`, inline: true },
        { name: '🎯 Target', value: \`$\${analysis.targetPrice.toFixed(2)} (+\${gainPercent}%)\`, inline: true },
        { name: '🛡️ Stop', value: \`$\${analysis.stopLoss.toFixed(2)}\`, inline: true },
        { name: '📊 R:R', value: \`\${analysis.riskRewardRatio.toFixed(1)}:1\`, inline: true },
        { name: '⏰ Timeframe', value: analysis.timeframe || 'Daily', inline: true },
        { name: '📈 Patterns', value: analysis.patterns.slice(0, 3).join(', ') || 'None detected', inline: true },
        { name: '📝 Analysis', value: analysis.analysis.length > 1020 ? analysis.analysis.substring(0, 1020) + '...' : analysis.analysis, inline: false }
      ],
      footer: { text: 'Quant Edge Labs Chart Analysis • Not financial advice' },
      timestamp: new Date().toISOString()
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`📊 **CHART ANALYSIS** → \${analysis.symbol.toUpperCase()} \${sentimentEmoji} │ \${CHANNEL_HEADERS.CHART_ANALYSIS}\`,
        embeds: [embed]
      }),
    });
    
    return response.ok;
  } catch (error) {
    logger.error('❌ Failed to send Discord chart analysis:', error);
    return false;
  }
}

// Send lotto play to dedicated lotto Discord channel
export async function sendLottoToDiscord(idea: TradeIdea): Promise<void> {
  if (DISCORD_DISABLED) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_LOTTO;
  if (!webhookUrl) return;

  try {
    const isCall = idea.optionType === 'call';
    const color = isCall ? 0x22c55e : 0xef4444;
    const expiryFormatted = idea.expiryDate || 'N/A';
    const potentialReturn = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(0);
    
    const embed: DiscordEmbed = {
      title: \`🎰 LOTTO: \${idea.symbol} \${(idea.optionType || 'OPT').toUpperCase()} \$\${idea.strikePrice}\`,
      description: \`**\${expiryFormatted} exp** | Targeting **\${potentialReturn}%**\`,
      color,
      fields: [
        { name: '💰 Entry', value: \`$\${idea.entryPrice.toFixed(2)}\`, inline: true },
        { name: '🎯 Target', value: \`$\${idea.targetPrice.toFixed(2)}\`, inline: true },
        { name: '🛡️ Stop', value: \`$\${idea.stopLoss.toFixed(2)}\`, inline: true }
      ],
      footer: { text: '⚠️ HIGH RISK | Quant Edge Labs' },
      timestamp: new Date().toISOString()
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`🎰 **LOTTO ALERT** → \${idea.symbol} \${(idea.optionType || 'OPT').toUpperCase()} \$\${idea.strikePrice} exp \${expiryFormatted} │ \${CHANNEL_HEADERS.LOTTO}\`,
        embeds: [embed]
      }),
    });
  } catch (error) {
    logger.error('❌ Failed to send Discord lotto alert:', error);
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
  logger.info(\`🪙 [CRYPTO-BOT] Skipping Discord notification for \${trade.symbol} (Options-only policy)\`);
  return;
}

// Send watchlist items to QuantBot channel
export async function sendWatchlistToQuantBot(items: Array<{
  symbol: string;
  assetType: string;
  notes?: string | null;
  entryAlertPrice?: number | null;
  targetAlertPrice?: number | null;
  stopAlertPrice?: number | null;
}>): Promise<{ success: boolean; message: string }> {
  if (DISCORD_DISABLED) return { success: false, message: 'Discord disabled' };
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { success: false, message: 'Discord webhook not configured' };
  if (items.length === 0) return { success: false, message: 'No items to send' };

  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Chicago' });
    const itemList = items.slice(0, 15).map((item, i) => {
      const typeIcon = item.assetType === 'crypto' ? '₿' : item.assetType === 'option' ? '📋' : '📈';
      const entry = item.entryAlertPrice ? \`Entry \$\${item.entryAlertPrice.toFixed(2)}\` : '';
      const target = item.targetAlertPrice ? \`Target \$\${item.targetAlertPrice.toFixed(2)}\` : '';
      const stop = item.stopAlertPrice ? \`Stop \$\${item.stopAlertPrice.toFixed(2)}\` : '';
      const levels = [entry, target, stop].filter(Boolean).join(' • ');
      return \`\${i + 1}. \${typeIcon} **\${item.symbol}** \${levels ? \`→ \${levels}\` : ''}\`;
    }).join('\n');
    
    const embed: DiscordEmbed = {
      title: \`🤖 QuantBot Watchlist - \${dateStr} CT\`,
      description: \`**\${items.length} Items Under Surveillance**\\n\\n\${itemList}\`,
      color: 0x06b6d4,
      fields: [
        { name: '📊 Asset Mix', value: \`\${items.filter(i => i.assetType === 'stock').length} Stocks • \${items.filter(i => i.assetType === 'option').length} Options • \${items.filter(i => i.assetType === 'crypto').length} Crypto\`, inline: true }
      ],
      footer: { text: '⚠️ Research only - not financial advice | Quant Edge Labs QuantBot' },
      timestamp: new Date().toISOString()
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`🤖 **QUANTBOT WATCHLIST** → \${items.length} items on radar\`,
        embeds: [embed]
      }),
    });
    
    return { success: response.ok, message: response.ok ? 'Sent to Discord' : \`Discord error: \${response.status}\` };
  } catch (error) {
    logger.error('❌ Failed to send QuantBot watchlist:', error);
    return { success: false, message: 'Failed to send to Discord' };
  }
}

// Send annual breakout candidates to Discord
export async function sendAnnualBreakoutsToDiscord(items: Array<{
  symbol: string;
  sector?: string | null;
  startOfYearPrice?: number | null;
  yearlyTargetPrice?: number | null;
  conviction?: string | null;
  thesis?: string | null;
}>): Promise<{ success: boolean; message: string }> {
  if (DISCORD_DISABLED || items.length === 0) return { success: false, message: 'Disabled/No items' };
  const webhookUrl = process.env.DISCORD_WEBHOOK_WEEKLYWATCHLISTS || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { success: false, message: 'No webhook' };

  try {
    const itemList = items.slice(0, 20).map((item, i) => {
      const entry = item.startOfYearPrice ? \`$\${item.startOfYearPrice.toFixed(0)}\` : '-';
      const target = item.yearlyTargetPrice ? \`$\${item.yearlyTargetPrice.toFixed(0)}\` : '-';
      const conviction = item.conviction === 'high' ? '🔥' : item.conviction === 'speculative' ? '⚡' : '📊';
      return \`\${i + 1}. \${conviction} **\${item.symbol}** → \${entry} → \${target}\`;
    }).join('\n');
    
    const embed: DiscordEmbed = {
      title: \`🚀 2026 Breakout Candidates\`,
      description: itemList,
      color: 0x10b981,
      footer: { text: '⚠️ Research only - not financial advice | Quant Edge Labs' },
      timestamp: new Date().toISOString()
    };
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`🚀 **2026 BREAKOUT WATCHLIST** → \${items.length} curated candidates\`,
        embeds: [embed]
      }),
    });
    
    return { success: response.ok, message: 'Sent' };
  } catch (error) {
    logger.error('❌ Failed to send annual breakouts:', error);
    return { success: false, message: 'Failed' };
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
  if (DISCORD_DISABLED || items.length === 0) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_WEEKLYWATCHLISTS;
  if (!webhookUrl) return;

  try {
    const itemList = items.slice(0, 10).map((item, i) => {
      const typeIcon = item.assetType === 'crypto' ? '₿' : item.assetType === 'option' ? '📋' : '📈';
      return \`\${i + 1}. \${typeIcon} **\${item.symbol}**\`;
    }).join('\n');
    
    const embed: DiscordEmbed = {
      title: \`📋 Weekly Watchlist\`,
      description: itemList,
      color: 0x8b5cf6,
      footer: { text: '⚠️ Educational research only - not financial advice | Quant Edge Labs' },
      timestamp: new Date().toISOString()
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`📋 **WEEKLY WATCHLIST** → \${items.length} items tracked │ \${CHANNEL_HEADERS.WEEKLY_WATCHLIST}\`,
        embeds: [embed]
      }),
    });
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
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetMultiplier: number;
  playType: 'lotto' | 'day_trade' | 'swing';
  confidence: number;
  delta: number;
}>, weekRange: { start: string; end: string }): Promise<void> {
  if (DISCORD_DISABLED || picks.length === 0) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_WEEKLYWATCHLISTS || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const formatPick = (p: typeof picks[0]) => {
      const emoji = p.optionType === 'call' ? '🟢' : '🔴';
      return \`\${emoji} **\${p.symbol}** \${p.optionType.toUpperCase()} \$\${p.strike} exp \${p.expiration}\\n\` +
             \`   💰 Entry \$\${p.entryPrice.toFixed(2)} → Target \$\${p.targetPrice.toFixed(2)} (\${p.targetMultiplier}x)\`;
    };
    
    const embed: DiscordEmbed = {
      title: \`🎯 NEXT WEEK'S PREMIUM PICKS (\${weekRange.start} - \${weekRange.end})\`,
      description: picks.slice(0, 10).map(formatPick).join('\n\n'),
      color: 0xa855f7,
      footer: { text: '⚠️ Educational research only - not financial advice | Quant Edge Labs' },
      timestamp: new Date().toISOString()
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`🎯 **NEXT WEEK PREMIUM PICKS** → \${picks.length} curated plays │ \${CHANNEL_HEADERS.WEEKLY_WATCHLIST}\`,
        embeds: [embed]
      }),
    });
  } catch (error) {
    logger.error('❌ Failed to send Discord next week picks:', error);
  }
}

// Send daily summary of top trade ideas
export async function sendDailySummaryToDiscord(ideas: TradeIdea[]): Promise<void> {
  if (DISCORD_DISABLED) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_GAINS;
  if (!webhookUrl) return;

  try {
    const listLines = ideas.slice(0, 10).map(idea => {
      const emoji = idea.direction === 'long' ? '🟢' : '🔴';
      return \`\${emoji} **\${idea.symbol}** \${idea.optionType?.toUpperCase()} \$\${idea.strikePrice} exp \${idea.expiryDate}\`;
    });
    
    const embed: DiscordEmbed = {
      title: \`🤖 Daily Trade Summary\`,
      description: listLines.join('\n'),
      color: 0x06b6d4,
      footer: { text: 'Quant Edge Labs • Daily Highlights' },
      timestamp: new Date().toISOString()
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: \`🤖 **DAILY SUMMARY** → \${ideas.length} setups on radar\`,
        embeds: [embed]
      }),
    });
  } catch (error) {
    logger.error('❌ Failed to send Discord daily summary:', error);
  }
}
