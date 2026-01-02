// Discord webhook service for automated trade alerts
import type { TradeIdea } from "@shared/schema";
import { getSignalLabel } from "@shared/constants";
import { logger } from './logger';

// GLOBAL DISABLE FLAG - Set to true to stop all Discord notifications
const DISCORD_DISABLED = false;

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

// Format trade idea as Discord rich embed
function formatTradeIdeaEmbed(idea: TradeIdea): DiscordEmbed {
  const isLong = idea.direction === 'long';
  const color = isLong ? COLORS.LONG : COLORS.SHORT;
  
  // Source badge
  const sourceBadge = idea.source === 'ai' ? '🧠 AI Signal' : 
                     idea.source === 'quant' ? '✨ Quant Signal' :
                     idea.source === 'hybrid' ? '🎯 Hybrid (AI+Quant)' :
                     '📝 Manual';
  
  // Direction indicator
  const directionEmoji = isLong ? '🟢' : '🔴';
  
  // Calculate potential gain
  const potentialGain = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(2);
  
  // Asset type emoji for title
  const assetEmoji = idea.assetType === 'option' ? '🎯' : idea.assetType === 'crypto' ? '₿' : '📈';
  
  // Build description - for options, put type/strike/expiry on STANDALONE LINE first
  let description = sourceBadge;
  if (idea.assetType === 'option') {
    // STANDALONE LINE: CALL $150 01/17
    const optionLine = `${(idea.optionType || 'OPTION').toUpperCase()}${idea.strikePrice ? ` $${idea.strikePrice}` : ''}${idea.expiryDate ? ` ${idea.expiryDate}` : ''}`;
    description = `**${optionLine}**\n\n${sourceBadge}`;
  } else if (idea.assetType === 'crypto') {
    description = `**Crypto**\n\n${sourceBadge}`;
  } else {
    description = `**Shares**\n\n${sourceBadge}`;
  }
  
  const embed: DiscordEmbed = {
    title: `${directionEmoji} ${idea.symbol} - ${idea.direction.toUpperCase()} ${assetEmoji}`,
    description,
    color,
    fields: [
      {
        name: '💰 Entry Price',
        value: `$${idea.entryPrice.toFixed(2)}`,
        inline: true
      },
      {
        name: '🎯 Target Price',
        value: `$${idea.targetPrice.toFixed(2)}`,
        inline: true
      },
      {
        name: '🛡️ Stop Loss',
        value: `$${idea.stopLoss.toFixed(2)}`,
        inline: true
      },
      {
        name: '📊 Risk/Reward',
        value: `${idea.riskRewardRatio}:1`,
        inline: true
      },
      {
        name: '📈 Potential Gain',
        value: `${potentialGain}%`,
        inline: true
      },
      {
        name: '⭐ Confidence',
        value: idea.confidenceScore 
          ? `${idea.confidenceScore}% (${getLetterGrade(idea.confidenceScore)})`
          : getSignalLabel(idea.qualitySignals?.length || 0),
        inline: true
      },
      {
        name: '📶 Signals',
        value: idea.qualitySignals?.length 
          ? `${idea.qualitySignals.length}/5 (${idea.qualitySignals.slice(0, 2).join(', ')}${idea.qualitySignals.length > 2 ? '...' : ''})`
          : '0 indicators',
        inline: true
      },
      {
        name: '⏱️ Trade Type',
        value: idea.holdingPeriod === 'day' ? '🏃 Day Trade' : 
               idea.holdingPeriod === 'swing' ? '📅 Swing Trade' : 
               idea.holdingPeriod === 'position' ? '📊 Position Trade' : 'Day Trade',
        inline: true
      }
    ],
    timestamp: new Date().toISOString()
  };
  
  // Add catalyst if available
  if (idea.catalyst) {
    embed.fields.push({
      name: '💡 Catalyst',
      value: idea.catalyst.substring(0, 200) + (idea.catalyst.length > 200 ? '...' : ''),
      inline: false
    });
  }
  
  // Add session context
  if (idea.sessionContext) {
    embed.fields.push({
      name: '⏰ Timing',
      value: idea.sessionContext,
      inline: false
    });
  }
  
  // Add data quality indicator
  if (idea.dataSourceUsed) {
    const qualityEmoji = idea.dataSourceUsed !== 'estimated' ? '✅' : '⚠️';
    embed.footer = {
      text: `${qualityEmoji} ${idea.dataSourceUsed !== 'estimated' ? 'Real Market Data' : 'Simulated Data'} | QuantEdge Research`
    };
  }
  
  return embed;
}

// Send trade idea to Discord webhook
export async function sendTradeIdeaToDiscord(idea: TradeIdea): Promise<void> {
  logger.info(`📨 Discord single trade called: ${idea.symbol} (${idea.source || 'unknown'})`);
  
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping notification');
    return;
  }
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.warn('⚠️ Discord webhook URL not configured - skipping alert');
    return;
  }
  
  try {
    const embed = formatTradeIdeaEmbed(idea);
    const message: DiscordMessage = {
      content: `🎯 **New Trade Alert from QuantEdge**`,
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
    
    logger.info(`✅ Discord alert sent: ${idea.symbol} ${idea.direction.toUpperCase()}`);
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
        text: `QuantEdge Watchlist • ${alert.assetType === 'crypto' ? '24/7' : 'Market Hours'}`
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
    
    const message: DiscordMessage = {
      content: `${alertEmoji} **${alert.symbol}** ${alert.assetType === 'option' && alert.optionType ? `${alert.optionType.toUpperCase()}${alert.strike ? ` $${alert.strike}` : ''}${alert.expiry ? ` ${alert.expiry}` : ''}` : alert.assetType === 'crypto' ? 'Crypto' : 'Shares'}`,
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

// Send batch summary to Discord
export async function sendBatchSummaryToDiscord(ideas: TradeIdea[], source: 'ai' | 'quant' | 'hybrid' | 'flow' | 'news'): Promise<void> {
  logger.info(`📨 Discord batch summary called: ${ideas.length} ${source} ideas`);
  
  if (DISCORD_DISABLED) {
    logger.warn('⚠️ Discord is DISABLED - skipping notification');
    return;
  }
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.warn('⚠️ No DISCORD_WEBHOOK_URL configured - skipping notification');
    return;
  }
  
  if (ideas.length === 0) {
    logger.info('📨 No ideas to send to Discord');
    return;
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
    const longIdeas = ideas.filter(i => i.direction === 'long');
    const shortIdeas = ideas.filter(i => i.direction === 'short');
    
    // Format actionably: emoji SYMBOL TYPE $entry→$target (signals)
    const formatIdea = (idea: TradeIdea) => {
      const emoji = idea.direction === 'long' ? '🟢' : '🔴';
      // Signal strength using canonical function for consistency with dashboard
      const signalCount = idea.qualitySignals?.length || 0;
      const signalLabel = getSignalLabel(signalCount);
      
      // Calculate gain target
      const gainPct = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(1);
      
      if (idea.assetType === 'option') {
        const optType = idea.optionType?.toUpperCase() || 'OPTION';
        const strike = idea.strikePrice ? `$${idea.strikePrice}` : '';
        // Format expiry as MM/DD (compact)
        const exp = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
        return `${emoji} **${idea.symbol}** ${optType} ${strike} ${exp} | $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${signalLabel}`;
      } else if (idea.assetType === 'crypto') {
        return `${emoji} **${idea.symbol}** CRYPTO | $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${signalLabel}`;
      }
      return `${emoji} **${idea.symbol}** SHARES | $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${signalLabel}`;
    };
    
    // Limit to top 8 ideas (sorted by signal count then R:R) to keep readable
    const sortedIdeas = [...ideas].sort((a, b) => {
      const aSignals = a.qualitySignals?.length || 0;
      const bSignals = b.qualitySignals?.length || 0;
      if (bSignals !== aSignals) return bSignals - aSignals;
      return (b.riskRewardRatio || 0) - (a.riskRewardRatio || 0);
    });
    const topIdeas = sortedIdeas.slice(0, 8);
    const summary = topIdeas.map(formatIdea).join('\n');
    const remainingCount = ideas.length - topIdeas.length;
    const moreText = remainingCount > 0 ? `\n_+${remainingCount} more in dashboard_` : '';
    
    // Calculate average signal count
    const avgSignals = Math.round(ideas.reduce((sum, i) => sum + (i.qualitySignals?.length || 0), 0) / ideas.length);
    const avgRR = (ideas.reduce((sum, i) => sum + (i.riskRewardRatio || 0), 0) / ideas.length).toFixed(1);
    
    const embed: DiscordEmbed = {
      title: `${sourceLabel} - ${ideas.length} Trade Ideas`,
      description: summary + moreText,
      color,
      fields: [
        {
          name: 'Direction',
          value: `🟢 ${longIdeas.length} Long • 🔴 ${shortIdeas.length} Short`,
          inline: true
        },
        {
          name: 'Avg Signals',
          value: `${avgSignals}/5 indicators`,
          inline: true
        },
        {
          name: 'Avg R:R',
          value: `${avgRR}:1`,
          inline: true
        }
      ],
      footer: {
        text: 'QuantEdge • Dashboard for full details'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `📢 **${ideas.length} ${sourceLabel} Ideas**`,
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
        text: 'QuantEdge Futures • Educational Research Only'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `🔮 **${ideas.length} Futures Trade Ideas**`,
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
        text: 'QuantEdge Chart Analysis • Not financial advice'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `📊 **Chart Analysis Alert: ${analysis.symbol.toUpperCase()}** ${sentimentEmoji}`,
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
      description: `**${expiryFormatted} Expiry** (${dteText} DTE)\n\n${sectorText ? `**${sectorText}** sector | ` : ''}${holdingLabel} - **${targetLabel}** targeting **${potentialReturn}%** return`,
      color,
      fields: [
        {
          name: '💰 Entry',
          value: `$${idea.entryPrice.toFixed(2)}`,
          inline: true
        },
        {
          name: `🎯 Target (${targetMultiplier}x)`,
          value: `$${idea.targetPrice.toFixed(2)}`,
          inline: true
        },
        {
          name: '🛡️ Stop (-50%)',
          value: `$${idea.stopLoss.toFixed(2)}`,
          inline: true
        },
        {
          name: '📅 DTE',
          value: dteText,
          inline: true
        },
        {
          name: '⏱️ Hold',
          value: holdingLabel,
          inline: true
        },
        {
          name: '🏷️ Sector',
          value: sectorText || 'General',
          inline: true
        }
      ],
      footer: {
        text: '⚠️ HIGH RISK - Small position size only | QuantEdge Research'
      },
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
      content: `🎰 **LOTTO ALERT: ${idea.symbol}** ${(idea.optionType || 'OPT').toUpperCase()} $${idea.strikePrice} exp ${expiryFormatted}`,
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
export async function sendBotTradeEntryToDiscord(position: {
  symbol: string;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  entryPrice: number;
  quantity: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
}): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  // Use LOTTO webhook or main webhook
  const webhookUrl = process.env.DISCORD_WEBHOOK_LOTTO || process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    return;
  }
  
  try {
    const isCall = position.optionType === 'call';
    const color = isCall ? 0x22c55e : 0xef4444;
    const contractCost = position.entryPrice * position.quantity * 100;
    
    const embed: DiscordEmbed = {
      title: `🤖 BOT ENTRY: ${position.symbol} ${(position.optionType || 'OPT').toUpperCase()} $${position.strikePrice}`,
      description: `Auto-Lotto Bot opened a new position`,
      color,
      fields: [
        {
          name: '💰 Entry Price',
          value: `$${position.entryPrice.toFixed(2)}`,
          inline: true
        },
        {
          name: '📦 Contracts',
          value: `${position.quantity}`,
          inline: true
        },
        {
          name: '💵 Position Cost',
          value: `$${contractCost.toFixed(2)}`,
          inline: true
        },
        {
          name: '🎯 Target',
          value: position.targetPrice ? `$${position.targetPrice.toFixed(2)}` : 'N/A',
          inline: true
        },
        {
          name: '🛡️ Stop',
          value: position.stopLoss ? `$${position.stopLoss.toFixed(2)}` : 'N/A',
          inline: true
        },
        {
          name: '📅 Expiry',
          value: position.expiryDate || 'N/A',
          inline: true
        }
      ],
      footer: {
        text: '🤖 Auto-Lotto Bot | Paper Trading'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `🤖 **BOT ENTRY** → ${position.symbol} ${(position.optionType || '').toUpperCase()} $${position.strikePrice} x${position.quantity} @ $${position.entryPrice.toFixed(2)}`,
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
export async function sendBotTradeExitToDiscord(position: {
  symbol: string;
  optionType?: string | null;
  strikePrice?: number | null;
  entryPrice: number;
  exitPrice?: number | null;
  quantity: number;
  realizedPnL?: number | null;
  exitReason?: string | null;
}): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_LOTTO || process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    return;
  }
  
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
      description: `Auto-Lotto Bot closed position - **${reasonText}**`,
      color,
      fields: [
        {
          name: '💰 Entry',
          value: `$${position.entryPrice.toFixed(2)}`,
          inline: true
        },
        {
          name: '🚪 Exit',
          value: `$${(position.exitPrice || 0).toFixed(2)}`,
          inline: true
        },
        {
          name: '📊 P&L',
          value: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`,
          inline: true
        },
        {
          name: '📦 Contracts',
          value: `${position.quantity}`,
          inline: true
        },
        {
          name: '📋 Reason',
          value: reasonText,
          inline: true
        }
      ],
      footer: {
        text: '🤖 Auto-Lotto Bot | Paper Trading'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `${emoji} **BOT EXIT** → ${position.symbol} | ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | ${reasonText}`,
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
        text: '⚠️ Educational research only - not financial advice | QuantEdge'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `📋 **WEEKLY WATCHLIST** - ${items.length} items being tracked`,
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
  
  // Use dedicated webhook for premium picks - falls back to main trades webhook, NOT futures
  const webhookUrl = process.env.DISCORD_WEBHOOK_GAINS || process.env.DISCORD_WEBHOOK_URL;
  
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
        text: '⚠️ Educational research only - not financial advice | QuantEdge Auto-Lotto Bot Style'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `🎯 **NEXT WEEK'S PREMIUM PICKS** - ${picks.length} curated options plays (Auto-Lotto Bot style)`,
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

// Send daily summary of top trade ideas (scheduled for 8:00 AM CT)
export async function sendDailySummaryToDiscord(ideas: TradeIdea[]): Promise<void> {
  if (DISCORD_DISABLED) return;
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ Discord webhook URL not configured - skipping daily summary');
    return;
  }
  
  try {
    // Get today's date in CT
    const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const dateStr = nowCT.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    
    // Filter to open ideas with strong signals (3+ indicators), sorted by signal count then R:R
    const topIdeas = ideas
      .filter(i => i.outcomeStatus === 'open' && (i.qualitySignals?.length || 0) >= 2)
      .sort((a, b) => {
        const aSignals = a.qualitySignals?.length || 0;
        const bSignals = b.qualitySignals?.length || 0;
        if (bSignals !== aSignals) return bSignals - aSignals;
        return (b.riskRewardRatio || 0) - (a.riskRewardRatio || 0);
      })
      .slice(0, 5);
    
    if (topIdeas.length === 0) {
      logger.info('📭 No high-signal open ideas for daily summary');
      return;
    }
    
    // Format top ideas with actionable trade info
    const ideaList = topIdeas.map((idea, i) => {
      const emoji = idea.direction === 'long' ? '🟢' : '🔴';
      const sourceIcon = idea.source === 'ai' ? '🧠' : idea.source === 'quant' ? '✨' : idea.source === 'hybrid' ? '🎯' : idea.source === 'flow' ? '📊' : '📝';
      const signalCount = idea.qualitySignals?.length || 0;
      const signalGrade = signalCount >= 5 ? 'A+' : signalCount >= 4 ? 'A' : signalCount >= 3 ? 'B' : signalCount >= 2 ? 'C' : 'D';
      const gainPct = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(1);
      
      let typeLabel: string;
      if (idea.assetType === 'option') {
        const optType = idea.optionType?.toUpperCase() || 'OPT';
        const strike = idea.strikePrice ? `$${idea.strikePrice}` : '';
        const exp = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
        typeLabel = `${optType} ${strike} ${exp}`.trim();
      } else if (idea.assetType === 'crypto') {
        typeLabel = 'CRYPTO';
      } else {
        typeLabel = 'SHARES';
      }
      return `${i + 1}. ${emoji} **${idea.symbol}** ${typeLabel} | $${idea.entryPrice.toFixed(2)}→$${idea.targetPrice.toFixed(2)} (+${gainPct}%) | ${signalGrade} (${signalCount}/5) ${sourceIcon}`;
    }).join('\n');
    
    // Calculate stats
    const totalOpen = ideas.filter(i => i.outcomeStatus === 'open').length;
    const longCount = topIdeas.filter(i => i.direction === 'long').length;
    const shortCount = topIdeas.filter(i => i.direction === 'short').length;
    const avgSignals = Math.round(topIdeas.reduce((sum, i) => sum + (i.qualitySignals?.length || 0), 0) / topIdeas.length);
    const avgRR = (topIdeas.reduce((sum, i) => sum + (i.riskRewardRatio || 0), 0) / topIdeas.length).toFixed(1);
    
    const embed: DiscordEmbed = {
      title: `📈 Daily Trading Preview - ${dateStr}`,
      description: `**Top ${topIdeas.length} Trade Ideas Today**\n\n${ideaList}`,
      color: 0x3b82f6, // Blue
      fields: [
        {
          name: '📊 Total Open',
          value: `${totalOpen} ideas`,
          inline: true
        },
        {
          name: '📈 Direction',
          value: `${longCount} Long • ${shortCount} Short`,
          inline: true
        },
        {
          name: '⭐ Avg Signals',
          value: `${avgSignals}/5 | R:R ${avgRR}:1`,
          inline: true
        }
      ],
      footer: {
        text: 'QuantEdge Research • View full details at your dashboard'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `☀️ **Good Morning! Here's your Daily Trading Preview**`,
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
      logger.info(`✅ Discord daily summary sent: ${topIdeas.length} top ideas`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord daily summary:', error);
  }
}

/**
 * 💰 Send Gains Notification to Discord
 * Posts winning trades to the DISCORD_WEBHOOK_GAINS channel
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
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_GAINS;
  
  if (!webhookUrl) {
    logger.info('⚠️ DISCORD_WEBHOOK_GAINS not configured - skipping gains alert');
    return;
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
      description: `**${assetLabel}**\n\n${sourceIcon} Signal Hit Target!`,
      color: 0x22c55e, // Green
      fields: [
        {
          name: '📥 Entry',
          value: `$${trade.entryPrice.toFixed(2)}`,
          inline: true
        },
        {
          name: '📤 Exit',
          value: `$${trade.exitPrice.toFixed(2)}`,
          inline: true
        },
        {
          name: '💵 Gain',
          value: `+${trade.percentGain.toFixed(1)}%`,
          inline: true
        },
        {
          name: '💰 Per $100',
          value: `+$${dollarGainPer100.toFixed(2)}`,
          inline: true
        },
        {
          name: '📊 Engine',
          value: sourceIcon,
          inline: true
        },
        {
          name: '⏱️ Type',
          value: trade.holdingPeriod === 'day' ? 'Day Trade' : 
                 trade.holdingPeriod === 'swing' ? 'Swing' : 
                 trade.holdingPeriod === 'position' ? 'Position' : 'Day Trade',
          inline: true
        }
      ],
      footer: {
        text: 'QuantEdge Research • Paper Trading Results'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `${gainEmoji} **${trade.symbol}** hit target! **+${trade.percentGain.toFixed(1)}%** gain`,
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
      logger.info(`✅ Discord gains alert sent: ${trade.symbol} +${trade.percentGain.toFixed(1)}%`);
    } else {
      logger.error(`❌ Discord gains webhook failed: ${response.status}`);
    }
  } catch (error) {
    logger.error('❌ Failed to send Discord gains alert:', error);
  }
}
