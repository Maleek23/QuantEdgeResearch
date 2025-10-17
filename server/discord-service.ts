// Discord webhook service for automated trade alerts
import type { TradeIdea } from "@shared/schema";

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
  MANUAL: 0x64748b,  // Gray for manual trades
};

// Format trade idea as Discord rich embed
function formatTradeIdeaEmbed(idea: TradeIdea): DiscordEmbed {
  const isLong = idea.direction === 'long';
  const color = isLong ? COLORS.LONG : COLORS.SHORT;
  
  // Source badge
  const sourceBadge = idea.source === 'ai' ? '🧠 AI Signal' : 
                     idea.source === 'quant' ? '✨ Quant Signal' : 
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
  if (idea.dataSource) {
    const qualityEmoji = idea.dataSource === 'real' ? '✅' : '⚠️';
    embed.footer = {
      text: `${qualityEmoji} ${idea.dataSource === 'real' ? 'Real Market Data' : 'Simulated Data'} | QuantEdge Research`
    };
  }
  
  return embed;
}

// Send trade idea to Discord webhook
export async function sendTradeIdeaToDiscord(idea: TradeIdea): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.log('⚠️ Discord webhook URL not configured - skipping alert');
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
    
    console.log(`✅ Discord alert sent: ${idea.symbol} ${idea.direction.toUpperCase()}`);
  } catch (error) {
    console.error('❌ Failed to send Discord alert:', error);
  }
}

// Send batch summary to Discord
export async function sendBatchSummaryToDiscord(ideas: TradeIdea[], source: 'ai' | 'quant'): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl || ideas.length === 0) {
    return;
  }
  
  try {
    const sourceLabel = source === 'ai' ? '🧠 AI' : '✨ Quant';
    const color = source === 'ai' ? COLORS.AI : COLORS.QUANT;
    
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
      console.log(`✅ Discord batch summary sent: ${ideas.length} ${source} ideas`);
    }
  } catch (error) {
    console.error('❌ Failed to send Discord batch summary:', error);
  }
}
