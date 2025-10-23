// Discord webhook service for automated trade alerts
import type { TradeIdea } from "@shared/schema";
import { logger } from './logger';

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
  
  // Asset type badge
  const assetBadge = idea.assetType === 'stock' ? '📈 Stock' :
                    idea.assetType === 'option' ? '🎯 Option' :
                    '₿ Crypto';
  
  // Direction indicator
  const directionEmoji = isLong ? '🟢' : '🔴';
  
  // Calculate potential gain
  const potentialGain = ((idea.targetPrice - idea.entryPrice) / idea.entryPrice * 100).toFixed(2);
  
  const embed: DiscordEmbed = {
    title: `${directionEmoji} ${idea.symbol} - ${idea.direction.toUpperCase()}`,
    description: `${sourceBadge} • ${assetBadge}${idea.optionType ? ` ${idea.optionType.toUpperCase()}` : ''}`,
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
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    logger.info('⚠️ Discord webhook URL not configured - skipping alert');
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
}): Promise<void> {
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
    
    const embed: DiscordEmbed = {
      title: `${alertEmoji} WATCHLIST ALERT: ${alert.symbol}`,
      description: `**${alertTitle}**\n${alert.notes || 'Price alert triggered'}`,
      color,
      fields: [
        {
          name: '💰 Current Price',
          value: `$${alert.currentPrice.toFixed(4)}`,
          inline: true
        },
        {
          name: '🎯 Alert Price',
          value: `$${alert.alertPrice.toFixed(4)}`,
          inline: true
        },
        {
          name: '📊 Asset Type',
          value: alert.assetType.toUpperCase(),
          inline: true
        },
        {
          name: '📈 Distance from Target',
          value: `${alert.percentFromTarget > 0 ? '+' : ''}${alert.percentFromTarget.toFixed(2)}%`,
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: `QuantEdge Watchlist Monitor • ${alert.assetType === 'crypto' ? '24/7 Crypto' : 'Market Hours'}`
      }
    };
    
    const message: DiscordMessage = {
      content: `${alertEmoji} **WATCHLIST PRICE ALERT: ${alert.symbol}** ${alertEmoji}`,
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
export async function sendBatchSummaryToDiscord(ideas: TradeIdea[], source: 'ai' | 'quant' | 'hybrid'): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl || ideas.length === 0) {
    return;
  }
  
  try {
    const sourceLabel = source === 'ai' ? '🧠 AI' : 
                       source === 'hybrid' ? '🎯 Hybrid (AI+Quant)' :
                       '✨ Quant';
    const color = source === 'ai' ? COLORS.AI :
                 source === 'hybrid' ? COLORS.HYBRID :
                 COLORS.QUANT;
    
    const summary = ideas.map(idea => 
      `${idea.direction === 'long' ? '🟢' : '🔴'} **${idea.symbol}** (${idea.assetType}) - Entry: $${idea.entryPrice.toFixed(2)}`
    ).join('\n');
    
    const embed: DiscordEmbed = {
      title: `${sourceLabel} Batch Generated - ${ideas.length} Ideas`,
      description: summary,
      color,
      fields: [
        {
          name: '📊 Summary',
          value: `${ideas.filter(i => i.direction === 'long').length} Long • ${ideas.filter(i => i.direction === 'short').length} Short`,
          inline: false
        }
      ],
      footer: {
        text: 'QuantEdge Research • View full details in your dashboard'
      },
      timestamp: new Date().toISOString()
    };
    
    const message: DiscordMessage = {
      content: `📢 **${ideas.length} New ${sourceLabel} Trade Ideas Generated**`,
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
