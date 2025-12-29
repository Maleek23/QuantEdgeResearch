// Discord webhook service for automated trade alerts
import type { TradeIdea } from "@shared/schema";
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
        name: '⭐ Grade',
        value: idea.probabilityBand || 'N/A',
        inline: true
      },
      {
        name: '📋 Type',
        value: idea.assetType === 'option' 
          ? `${(idea.optionType || 'option').toUpperCase()}${idea.strikePrice ? ` $${idea.strikePrice}` : ''}${idea.expiryDate ? ` ${idea.expiryDate}` : ''}`
          : idea.assetType === 'crypto' 
            ? 'Crypto' 
            : 'Shares',
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
    
    // COMPACT FORMAT: Show top ideas with confidence % on the side
    const longIdeas = ideas.filter(i => i.direction === 'long');
    const shortIdeas = ideas.filter(i => i.direction === 'short');
    
    // Format compactly: emoji SYMBOL C/P$strike MM/DD | $entry | conf%
    const formatIdea = (idea: TradeIdea) => {
      const emoji = idea.direction === 'long' ? '🟢' : '🔴';
      const conf = idea.confidenceScore ? `**${idea.confidenceScore}%**` : '';
      
      if (idea.assetType === 'option') {
        const optType = idea.optionType?.toUpperCase().charAt(0) || 'O';
        const strike = idea.strikePrice ? `$${idea.strikePrice}` : '';
        // Format expiry as MM/DD (compact)
        const exp = idea.expiryDate ? idea.expiryDate.substring(5).replace('-', '/') : '';
        return `${emoji} ${idea.symbol} ${optType}${strike} ${exp} • $${idea.entryPrice.toFixed(2)} • ${conf}`;
      }
      return `${emoji} ${idea.symbol} $${idea.entryPrice.toFixed(2)} • ${conf}`;
    };
    
    // Limit to top 12 ideas (sorted by confidence) to keep compact
    const sortedIdeas = [...ideas].sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
    const topIdeas = sortedIdeas.slice(0, 12);
    const summary = topIdeas.map(formatIdea).join('\n');
    const remainingCount = ideas.length - topIdeas.length;
    const moreText = remainingCount > 0 ? `\n_+${remainingCount} more in dashboard_` : '';
    
    // Calculate average confidence
    const avgConf = Math.round(ideas.reduce((sum, i) => sum + (i.confidenceScore || 0), 0) / ideas.length);
    
    const embed: DiscordEmbed = {
      title: `${sourceLabel} - ${ideas.length} Ideas`,
      description: summary + moreText,
      color,
      fields: [
        {
          name: 'Signals',
          value: `🟢 ${longIdeas.length} Long • 🔴 ${shortIdeas.length} Short`,
          inline: true
        },
        {
          name: 'Avg Conf',
          value: `${avgConf}%`,
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
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ Discord webhook URL not configured - skipping chart analysis alert');
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
    
    // Filter to open ideas with high confidence, sorted by confidence
    const topIdeas = ideas
      .filter(i => i.outcomeStatus === 'open' && i.confidenceScore >= 70)
      .sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))
      .slice(0, 5);
    
    if (topIdeas.length === 0) {
      logger.info('📭 No high-confidence open ideas for daily summary');
      return;
    }
    
    // Format top ideas with clear asset type labels - for options show TYPE STRIKE EXPIRY
    const ideaList = topIdeas.map((idea, i) => {
      const emoji = idea.direction === 'long' ? '🟢' : '🔴';
      const sourceIcon = idea.source === 'ai' ? '🧠' : idea.source === 'quant' ? '✨' : idea.source === 'hybrid' ? '🎯' : '📊';
      let typeLabel: string;
      if (idea.assetType === 'option') {
        const optType = idea.optionType?.toUpperCase() || 'OPT';
        const strike = idea.strikePrice ? `$${idea.strikePrice}` : '';
        const exp = idea.expiryDate || '';
        typeLabel = `${optType} ${strike} ${exp}`.trim();
      } else if (idea.assetType === 'crypto') {
        typeLabel = 'CRYPTO';
      } else {
        typeLabel = 'SHARES';
      }
      return `${i + 1}. ${emoji} **${idea.symbol}** ${typeLabel} → $${idea.targetPrice.toFixed(2)} (${idea.confidenceScore}% conf) ${sourceIcon}`;
    }).join('\n');
    
    // Calculate stats
    const totalOpen = ideas.filter(i => i.outcomeStatus === 'open').length;
    const longCount = topIdeas.filter(i => i.direction === 'long').length;
    const shortCount = topIdeas.filter(i => i.direction === 'short').length;
    const avgConfidence = Math.round(topIdeas.reduce((sum, i) => sum + (i.confidenceScore || 0), 0) / topIdeas.length);
    
    const embed: DiscordEmbed = {
      title: `📈 Daily Trading Preview - ${dateStr}`,
      description: `**Top ${topIdeas.length} Trade Ideas Today**\n\n${ideaList}`,
      color: 0x3b82f6, // Blue
      fields: [
        {
          name: '📊 Total Open Ideas',
          value: `${totalOpen}`,
          inline: true
        },
        {
          name: '📈 Direction',
          value: `${longCount} Long • ${shortCount} Short`,
          inline: true
        },
        {
          name: '⭐ Avg Confidence',
          value: `${avgConfidence}%`,
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
