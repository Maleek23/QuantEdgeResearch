// Discord webhook service for automated trade alerts
import type { TradeIdea } from "@shared/schema";
import { getSignalLabel } from "@shared/constants";
import { logger } from './logger';
import { isOptionsMarketOpen } from './paper-trading-service';

// GLOBAL DISABLE FLAG - Set to true to stop all Discord notifications
const DISCORD_DISABLED = false;

// QUALITY GATE - A-GRADE MINIMUM (75+ confidence, 4+ signals)
const MIN_SIGNALS_REQUIRED = 4;
const MIN_CONFIDENCE_REQUIRED = 75;

// Maximum option premium cost
const MAX_PREMIUM_COST = 1000;

// Valid grades for Discord alerts
export const VALID_DISCORD_GRADES = ['A', 'A+'];

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

// Map portfolio IDs to display names and emojis
const PORTFOLIO_METADATA: Record<string, { name: string; emoji: string }> = {
  'options': { name: 'Options Portfolio', emoji: '🎯' },
  'small_account': { name: 'Small Account Lotto', emoji: '🎰' },
  'futures': { name: 'Futures Portfolio', emoji: '📈' },
  'crypto': { name: 'Crypto Portfolio', emoji: '₿' },
};

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
  analysis?: string | null;
  confidence?: number | null;
  portfolio?: string;
  isSmallAccount?: boolean;
  source?: string;
  isLotto?: boolean;
  delta?: number | null;
  riskRewardRatio?: number | null;
  signals?: string[] | null;
}): Promise<void> {
  if (DISCORD_DISABLED) return;

  const portfolioId = trade.portfolio || (trade.isSmallAccount ? 'small_account' : 'options');
  const meta = PORTFOLIO_METADATA[portfolioId] || { name: 'Bot Portfolio', emoji: '🤖' };
  const isSmallAccount = trade.isSmallAccount || portfolioId === 'small_account';
  // Lotto branding only for actual lotto plays, NOT for small account portfolio
  const isLotto = (trade.isLotto || trade.source === 'lotto') && !isSmallAccount;

  let webhookUrls: string[] = [];
  const source = trade.source || (trade.assetType === 'future' ? 'futures' : 'quant');

  if (source === 'futures' || trade.assetType === 'future') {
    // Futures go to #future-trades channel
    const fw = process.env.DISCORD_WEBHOOK_FUTURE_TRADES;
    if (fw) webhookUrls.push(fw);
  } else if (isSmallAccount) {
    // Small Account entries go to #quantbot channel (per user request)
    const qw = process.env.DISCORD_WEBHOOK_QUANTBOT;
    if (qw) webhookUrls.push(qw);
  } else if (source === 'lotto' || trade.isLotto) {
    // Lotto plays (not small account) go to #lottos channel
    const lw = process.env.DISCORD_WEBHOOK_LOTTO;
    if (lw) webhookUrls.push(lw);
  } else {
    // All other options/quant entries go to #quantbot
    const qw = process.env.DISCORD_WEBHOOK_QUANTBOT;
    if (qw) webhookUrls.push(qw);
  }

  if (webhookUrls.length === 0) {
    const fb = process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL;
    if (fb) webhookUrls.push(fb);
  }

  if (webhookUrls.length === 0) return;

  try {
    const isCall = trade.optionType === 'call';
    const color = isLotto ? COLORS.LOTTO : (isCall ? 0x22c55e : 0xef4444);
    
    // Confidence grade
    const grade = trade.confidence ? getLetterGrade(trade.confidence) : '';
    
    // Greeks/Delta
    let deltaDisplay = '';
    if (trade.delta !== undefined && trade.delta !== null) {
      const absDelta = Math.abs(trade.delta);
      const deltaLabel = absDelta < 0.15 ? '🎰 Far OTM' : 
                         absDelta < 0.30 ? '📈 OTM' : 
                         absDelta < 0.45 ? '⚖️ ATM' : '💪 ITM';
      deltaDisplay = `δ=${absDelta.toFixed(2)} ${deltaLabel}`;
    }

    // CLEAR direction statement - no ambiguity
    const directionEmoji = isCall ? '📈' : '📉';
    const directionLabel = isCall ? 'BULLISH (CALL)' : 'BEARISH (PUT)';
    const cleanAnalysis = trade.analysis 
      ? `**${directionEmoji} ${directionLabel}** - ${trade.analysis}`
      : `**${directionEmoji} ${directionLabel}** - ${meta.name} position opened.`;

    const embed: DiscordEmbed = {
      title: `${meta.emoji} ${isSmallAccount ? '💰 SMALL ACCOUNT' : '🤖 BOT'} ENTRY: ${trade.symbol} ${trade.optionType?.toUpperCase() || ''} ${trade.strikePrice ? '$' + trade.strikePrice : ''}`,
      description: cleanAnalysis,
      color: isSmallAccount ? 0xfbbf24 : color,
      fields: [
        { name: '💰 Entry', value: `$${trade.entryPrice.toFixed(2)}`, inline: true },
        { name: '🎯 Target', value: trade.targetPrice ? `$${trade.targetPrice.toFixed(2)}` : 'N/A', inline: true },
        { name: '🛑 Stop', value: trade.stopLoss ? `$${trade.stopLoss.toFixed(2)}` : 'N/A', inline: true },
        { name: '⚖️ R:R', value: trade.riskRewardRatio ? `${trade.riskRewardRatio.toFixed(1)}:1` : 'N/A', inline: true },
        { name: '🎯 Grade', value: grade || 'N/A', inline: true },
        { name: '📊 Details', value: deltaDisplay || `Qty: ${trade.quantity}`, inline: true }
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `Quant Edge Labs • ${meta.name}${grade ? ` | Grade: ${grade}` : ''}` }
    };

    if (trade.expiryDate) {
      embed.fields.push({ name: '📅 Expiry', value: trade.expiryDate, inline: true });
    }

    const message: DiscordMessage = {
      content: `🚀 **BOT ENTRY**: ${trade.symbol} (${meta.name})`,
      embeds: [embed]
    };

    await Promise.allSettled(webhookUrls.map(url => 
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      })
    ));
  } catch (error) {
    logger.error('❌ Failed to send Discord bot alert:', error);
  }
}

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
  portfolio?: string;
  isSmallAccount?: boolean;
  source?: string;
  price?: number;
  pnl?: number;
  reason?: string;
}): Promise<void> {
  if (DISCORD_DISABLED) return;

  const portfolioId = exit.portfolio || (exit.isSmallAccount ? 'small_account' : 'options');
  const meta = PORTFOLIO_METADATA[portfolioId] || { name: 'Bot Portfolio', emoji: '🤖' };
  
  // Small Account entries/exits go to #quantbot channel (per user request)
  // Only pure lotto plays (not small account) go to lotto channel
  const isSmallAccountExit = exit.isSmallAccount || portfolioId === 'small_account';
  const isLottoExit = exit.source === 'lotto' && !isSmallAccountExit;
  const webhookUrl = isLottoExit 
    ? (process.env.DISCORD_WEBHOOK_LOTTO || process.env.DISCORD_WEBHOOK_QUANTBOT)
    : process.env.DISCORD_WEBHOOK_QUANTBOT;

  if (!webhookUrl) return;

  try {
    const realizedPnL = exit.realizedPnL ?? exit.pnl ?? 0;
    const isProfit = realizedPnL > 0;
    const color = isProfit ? COLORS.LONG : COLORS.SHORT;
    const exitPrice = exit.exitPrice ?? exit.price ?? 0;
    const exitReason = exit.exitReason ?? exit.reason ?? 'Unknown';
    const pnlPercent = exit.entryPrice > 0 
      ? (exitPrice - exit.entryPrice) / exit.entryPrice * 100 
      : 0;
    
    const embed: DiscordEmbed = {
      title: `${isProfit ? '🎉' : '💀'} ${exit.isSmallAccount ? '💰 SMALL ACCOUNT' : '🤖 BOT'} EXIT: ${exit.symbol} (${isProfit ? 'PROFIT' : 'LOSS'})`,
      description: `**${meta.name}** closed position - ${exitReason}`,
      color: exit.isSmallAccount ? 0xfbbf24 : color,
      fields: [
        { name: '💵 Entry', value: `$${exit.entryPrice.toFixed(2)}`, inline: true },
        { name: '🚪 Exit', value: `$${exitPrice.toFixed(2)}`, inline: true },
        { name: '📊 P&L', value: `${isProfit ? '+' : ''}$${realizedPnL.toFixed(2)} (${pnlPercent.toFixed(1)}%)`, inline: true },
        { name: '📋 Reason', value: exitReason, inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: `Quant Edge Labs • ${meta.name}` }
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${isProfit ? '✅' : '❌'} **BOT EXIT**: ${exit.symbol} (${meta.name})`,
        embeds: [embed]
      }),
    });
  } catch (error) {
    logger.error('❌ Failed to send Discord bot exit alert:', error);
  }
}

export function meetsQualityThreshold(idea: any): boolean {
  const signalCount = idea.qualitySignals?.length || 0;
  const confidence = idea.confidenceScore || 50;
  return confidence >= MIN_CONFIDENCE_REQUIRED && signalCount >= MIN_SIGNALS_REQUIRED;
}

export async function sendTradeIdeaToDiscord(idea: TradeIdea): Promise<void> {
  if (DISCORD_DISABLED) return;
  const webhookUrl = idea.assetType === 'option' 
    ? (process.env.DISCORD_WEBHOOK_OPTIONSTRADES || process.env.DISCORD_WEBHOOK_URL)
    : process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const isLong = idea.direction === 'long';
    const color = isLong ? COLORS.LONG : COLORS.SHORT;
    const embed: DiscordEmbed = {
      title: `${isLong ? '🟢' : '🔴'} ${idea.symbol} ${idea.direction.toUpperCase()}`,
      description: idea.analysis || 'New trade idea detected.',
      color,
      fields: [
        { name: '💰 Entry', value: `$${idea.entryPrice.toFixed(2)}`, inline: true },
        { name: '🎯 Target', value: `$${idea.targetPrice.toFixed(2)}`, inline: true },
        { name: '🛡️ Stop', value: idea.stopLoss ? `$${idea.stopLoss.toFixed(2)}` : 'N/A', inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) { logger.error(e); }
}

export async function sendChartAnalysisToDiscord(analysis: any): Promise<boolean> {
  if (DISCORD_DISABLED) return false;
  const webhookUrl = process.env.DISCORD_WEBHOOK_CHARTANALYSIS || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;
  try {
    const color = analysis.sentiment === 'bullish' ? 0x22c55e : 0xef4444;
    const embed: DiscordEmbed = {
      title: `📊 Chart Analysis: ${analysis.symbol}`,
      description: analysis.analysis,
      color,
      fields: [
        { name: 'Sentiment', value: analysis.sentiment, inline: true },
        { name: 'Confidence', value: `${analysis.confidence}%`, inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    return true;
  } catch (e) { return false; }
}

export async function sendLottoToDiscord(idea: TradeIdea): Promise<void> {
  if (DISCORD_DISABLED) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_LOTTO;
  if (!webhookUrl) return;
  try {
    // Build title with option details if available
    const optionType = (idea as any).optionType ? (idea as any).optionType.toUpperCase() : '';
    const strike = (idea as any).strikePrice ? `$${(idea as any).strikePrice}` : '';
    const rawExpiry = (idea as any).expiryDate || (idea as any).expirationDate;
    const expiry = rawExpiry ? `exp ${String(rawExpiry).split('T')[0]}` : '';
    
    // Format: 🎰 LOTTO: INTC CALL $25 (exp 2026-01-09)
    const titleSuffix = (optionType && strike) 
      ? ` ${optionType} ${strike} ${expiry ? `(${expiry})` : ''}`
      : '';
    
    const embed: DiscordEmbed = {
      title: `🎰 LOTTO: ${idea.symbol}${titleSuffix}`,
      description: idea.analysis || 'New lotto detected',
      color: COLORS.LOTTO,
      fields: [
        { name: 'Entry', value: `$${idea.entryPrice.toFixed(2)}`, inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) {}
}

export async function sendBatchTradeIdeasToDiscord(ideas: TradeIdea[], source: string): Promise<void> {
  if (DISCORD_DISABLED || ideas.length === 0) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_OPTIONSTRADES || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const description = ideas.slice(0, 10).map((i: any) => {
      const optionType = i.optionType ? i.optionType.toUpperCase() : '';
      const strike = i.strikePrice ? `$${i.strikePrice}` : '';
      // Support both expiryDate and expirationDate field names
      const rawExpiry = i.expiryDate || i.expirationDate;
      const expiry = rawExpiry ? `exp ${String(rawExpiry).split('T')[0]}` : '';
      // Format price properly - avoid "$N/A"
      const priceStr = i.entryPrice != null ? `$${Number(i.entryPrice).toFixed(2)}` : 'N/A';
      
      // Format: INTC CALL $25 @ $0.48 (exp 2026-01-09)
      if (i.assetType === 'option' && optionType && strike) {
        return `${i.symbol} ${optionType} ${strike} @ ${priceStr} ${expiry ? `(${expiry})` : ''}`;
      }
      return `${i.symbol}: ${priceStr}`;
    }).join('\n');
    
    const embed: DiscordEmbed = {
      title: `📢 BATCH: ${source.toUpperCase()} - ${ideas.length} Ideas`,
      description,
      color: COLORS.QUANT,
      fields: [],
      timestamp: new Date().toISOString()
    };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) {}
}

// Send generic Discord alert
export async function sendDiscordAlert(content: string, type: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
  if (DISCORD_DISABLED) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_QUANTFLOOR;
  if (!webhookUrl) return;

  try {
    const color = type === 'error' ? COLORS.SHORT : type === 'warn' ? 0xf59e0b : 0x3b82f6;
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${type === 'error' ? '❌' : type === 'warn' ? '⚠️' : 'ℹ️'} ${content}`,
        embeds: [{
          description: content,
          color,
          timestamp: new Date().toISOString()
        }]
      }),
    });
  } catch (e) { logger.error(e); }
}

export async function sendWatchlistToQuantBot(items: any[]): Promise<any> {
  return { success: true };
}

export async function sendWeeklyWatchlistToDiscord(items: any[]): Promise<void> {}
export async function sendNextWeekPicksToDiscord(picks: any[], range: any): Promise<void> {}
export async function sendDailySummaryToDiscord(ideas: any[]): Promise<void> {}
export async function sendAnnualBreakoutsToDiscord(items: any[]): Promise<any> { return { success: true }; }
export async function sendCryptoBotTradeToDiscord(trade: any): Promise<void> {}
export async function sendReportNotificationToDiscord(report: any): Promise<void> {
  if (DISCORD_DISABLED) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const embed: DiscordEmbed = {
      title: `📊 Platform Report: ${report.period || 'daily'}`,
      description: report.summary || 'New platform report available',
      color: COLORS.LONG,
      fields: [
        { name: 'Period', value: report.period || 'daily', inline: true },
        { name: 'Date', value: report.reportDate || new Date().toISOString().split('T')[0], inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) { logger.error(e); }
}
export async function sendFuturesTradesToDiscord(ideas: any[]): Promise<void> {}
export async function sendBatchSummaryToDiscord(ideas: any[], type?: string): Promise<void> {
  if (DISCORD_DISABLED || !ideas || ideas.length === 0) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const summary = ideas.slice(0, 10).map((i: any) => {
      const emoji = i.direction === 'long' ? '🟢' : '🔴';
      const optionType = i.optionType ? i.optionType.toUpperCase() : '';
      const strike = i.strikePrice ? `$${i.strikePrice}` : '';
      // Support both expiryDate and expirationDate field names
      const rawExpiry = i.expiryDate || i.expirationDate;
      const expiry = rawExpiry ? `exp ${String(rawExpiry).split('T')[0]}` : '';
      // Format price properly - avoid "$N/A"
      const priceStr = i.entryPrice != null ? `$${Number(i.entryPrice).toFixed(2)}` : 'N/A';
      
      // Format: 🟢 INTC CALL $25 @ $0.48 (exp 2026-01-09)
      if (i.assetType === 'option' && optionType && strike) {
        return `${emoji} **${i.symbol}** ${optionType} ${strike} @ ${priceStr} ${expiry ? `(${expiry})` : ''}`;
      }
      // Fallback for non-options
      return `${emoji} **${i.symbol}** ${priceStr}`;
    }).join('\n');
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        content: `📊 **${type || 'BATCH'}**: ${ideas.length} ideas\n${summary}` 
      }),
    });
  } catch (e) {}
}
export async function sendFlowAlertToDiscord(flow: any): Promise<void> {
  if (DISCORD_DISABLED) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const embed: DiscordEmbed = {
      title: `📊 Unusual Flow: ${flow.symbol}`,
      description: flow.description || 'Unusual options activity detected',
      color: flow.type === 'call' ? COLORS.LONG : COLORS.SHORT,
      fields: [
        { name: 'Volume', value: String(flow.volume || 'N/A'), inline: true },
        { name: 'Premium', value: `$${flow.premium?.toFixed(0) || 'N/A'}`, inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (e) {}
}

// Track recently alerted symbols to prevent duplicates
const recentAlertedSymbols = new Map<string, number>();
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

export async function sendMarketMoversAlertToDiscord(movers: {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  alertType: 'surge' | 'drop' | 'volume_spike';
  grade?: string;
  confidence?: number;
}[]): Promise<void> {
  if (DISCORD_DISABLED || !movers || movers.length === 0) return;
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  
  try {
    const now = Date.now();
    
    // Clean up old entries and filter out recently alerted symbols
    for (const [symbol, timestamp] of recentAlertedSymbols) {
      if (now - timestamp > ALERT_COOLDOWN_MS) {
        recentAlertedSymbols.delete(symbol);
      }
    }
    
    // Filter to only >5% moves that haven't been alerted recently AND are B+ or higher grade
    const VALID_GRADES = ['A+', 'A', 'B+'];
    const filteredMovers = movers.filter(m => {
      const absChange = Math.abs(m.changePercent);
      if (absChange < 5) return false;
      if (recentAlertedSymbols.has(m.symbol)) return false;
      // Only send B+ and above ratings to Discord
      if (m.grade && !VALID_GRADES.includes(m.grade)) return false;
      return true;
    });
    
    if (filteredMovers.length === 0) return;
    
    // Mark these symbols as alerted
    filteredMovers.forEach(m => recentAlertedSymbols.set(m.symbol, now));
    
    const surges = filteredMovers.filter(m => m.alertType === 'surge');
    const drops = filteredMovers.filter(m => m.alertType === 'drop');
    
    if (surges.length === 0 && drops.length === 0) return;
    
    const fields: { name: string; value: string; inline?: boolean }[] = [];
    
    if (surges.length > 0) {
      const surgeList = surges.slice(0, 5).map(s => {
        const gradeStr = s.grade ? ` [${s.grade}]` : '';
        const confStr = s.confidence ? ` ${s.confidence}%` : '';
        return `**${s.symbol}**${gradeStr}${confStr} +${s.changePercent.toFixed(1)}% @ $${s.price.toFixed(2)}`;
      }).join('\n');
      fields.push({ name: 'Major Surges', value: surgeList, inline: false });
    }
    
    if (drops.length > 0) {
      const dropList = drops.slice(0, 3).map(s => {
        const gradeStr = s.grade ? ` [${s.grade}]` : '';
        const confStr = s.confidence ? ` ${s.confidence}%` : '';
        return `**${s.symbol}**${gradeStr}${confStr} ${s.changePercent.toFixed(1)}% @ $${s.price.toFixed(2)}`;
      }).join('\n');
      fields.push({ name: 'Major Drops', value: dropList, inline: false });
    }
    
    const embed: DiscordEmbed = {
      title: 'Market Movers Alert',
      description: `${filteredMovers.length} stocks with >5% moves detected`,
      color: surges.length > drops.length ? COLORS.LONG : COLORS.SHORT,
      fields,
      footer: { text: 'Quant Edge Labs Real-time Scanner' },
      timestamp: new Date().toISOString()
    };
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    
    logger.info(`[DISCORD] Sent market movers alert: ${surges.length} surges, ${drops.length} drops`);
  } catch (e) {
    logger.error(`[DISCORD] Failed to send market movers alert: ${e}`);
  }
}
