import { logger } from './logger';
import { formatInTimeZone } from 'date-fns-tz';
import { storage } from './storage';

interface MorningPreview {
  marketOutlook: 'bullish' | 'bearish' | 'neutral';
  keyLevels: { spy: number; qqq: number; vix: number };
  topWatchlist: Array<{ symbol: string; reason: string; sentiment: number }>;
  catalysts: string[];
  tradingPlan: string;
  timestamp: string;
}

async function sendToDiscord(preview: MorningPreview): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTBOT || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('[MORNING-PREVIEW] No Discord webhook configured');
    return;
  }

  const outlookEmoji = preview.marketOutlook === 'bullish' ? '🟢' : 
                       preview.marketOutlook === 'bearish' ? '🔴' : '🟡';
  
  const watchlistText = preview.topWatchlist.slice(0, 5).map(w => 
    `• **${w.symbol}** - ${w.reason} (${w.sentiment}% sentiment)`
  ).join('\n') || 'No high-conviction setups found';

  const catalystsText = preview.catalysts.slice(0, 3).join('\n• ') || 'No major catalysts today';

  const embed = {
    title: `☀️ MORNING TRADING PREVIEW - ${formatInTimeZone(new Date(), 'America/Chicago', 'MMM d, yyyy')}`,
    description: `**Market Outlook: ${outlookEmoji} ${preview.marketOutlook.toUpperCase()}**\n\n${preview.tradingPlan}`,
    color: preview.marketOutlook === 'bullish' ? 0x22c55e : 
           preview.marketOutlook === 'bearish' ? 0xef4444 : 0xfbbf24,
    fields: [
      { 
        name: '📊 Key Levels', 
        value: `SPY: $${preview.keyLevels.spy.toFixed(2)}\nQQQ: $${preview.keyLevels.qqq.toFixed(2)}\nVIX: ${preview.keyLevels.vix.toFixed(2)}`, 
        inline: true 
      },
      { 
        name: '🎯 Bot Watchlist', 
        value: watchlistText, 
        inline: false 
      },
      { 
        name: '📅 Catalysts', 
        value: `• ${catalystsText}`, 
        inline: false 
      }
    ],
    footer: { text: 'Quant Edge Labs • 8:30 AM CT Preview' },
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '☀️ **GOOD MORNING TRADERS!** Here\'s your 8:30 AM CT preview:',
        embeds: [embed]
      })
    });
    logger.info('[MORNING-PREVIEW] Sent morning preview to Discord');
  } catch (error) {
    logger.error('[MORNING-PREVIEW] Failed to send Discord preview:', error);
  }
}

export async function generateMorningPreview(): Promise<MorningPreview> {
  logger.info('[MORNING-PREVIEW] Generating 8:30 AM trading preview...');
  
  try {
    const yahooFinance = (await import('yahoo-finance2')).default;
    const { getMarketContext } = await import('./market-context-service');
    const { getBotSentimentWatchlist } = await import('./bot-sentiment-watchlist');
    const { getUpcomingCatalysts } = await import('./catalyst-intelligence-service');
    
    const [spyQuote, qqqQuote, vixQuote, marketContext, sentimentWatchlist, catalysts] = await Promise.allSettled([
      yahooFinance.quote('SPY'),
      yahooFinance.quote('QQQ'),
      yahooFinance.quote('^VIX'),
      getMarketContext(),
      getBotSentimentWatchlist(),
      getUpcomingCatalysts(5)
    ]);

    const spy = spyQuote.status === 'fulfilled' ? (spyQuote.value as any)?.regularMarketPrice || 0 : 0;
    const qqq = qqqQuote.status === 'fulfilled' ? (qqqQuote.value as any)?.regularMarketPrice || 0 : 0;
    const vix = vixQuote.status === 'fulfilled' ? (vixQuote.value as any)?.regularMarketPrice || 0 : 0;
    const context = marketContext.status === 'fulfilled' ? marketContext.value : null;
    const watchlist = sentimentWatchlist.status === 'fulfilled' ? sentimentWatchlist.value : [];
    const todayCatalysts = catalysts.status === 'fulfilled' ? catalysts.value : [];

    let outlook: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let tradingPlan = '';

    if (context) {
      if (context.regime === 'trending_up') {
        outlook = 'bullish';
        tradingPlan = '📈 **BULLISH BIAS**: Look for CALL opportunities on pullbacks. Focus on momentum names breaking out. Avoid shorts unless clear reversal signals.';
      } else if (context.regime === 'trending_down') {
        outlook = 'bearish';
        tradingPlan = '📉 **BEARISH BIAS**: Defensive mode. Consider PUT spreads on weak names. Wait for clear capitulation before going long.';
      } else {
        outlook = 'neutral';
        tradingPlan = '⚖️ **NEUTRAL/RANGE-BOUND**: Choppy conditions expected. Smaller position sizes. Focus on defined-risk spreads. Wait for breakout confirmation.';
      }
    }

    if (vix > 25) {
      tradingPlan += '\n\n⚠️ **HIGH VIX WARNING**: Elevated volatility - reduce position sizes and use wider stops.';
    }

    const preview: MorningPreview = {
      marketOutlook: outlook,
      keyLevels: { spy, qqq, vix },
      topWatchlist: watchlist.slice(0, 10).map((w: any) => ({
        symbol: w.symbol,
        reason: w.reason || 'Sentiment signal',
        sentiment: w.sentimentScore || 0
      })),
      catalysts: todayCatalysts.map((c: any) => `${c.ticker || c.symbol}: ${c.eventType || 'Catalyst'}`),
      tradingPlan,
      timestamp: new Date().toISOString()
    };

    await sendToDiscord(preview);
    
    logger.info(`[MORNING-PREVIEW] Created preview: ${outlook} outlook, SPY $${spy.toFixed(2)}, ${preview.topWatchlist.length} watchlist items`);

    logger.info(`[MORNING-PREVIEW] Generated preview: ${outlook} outlook, ${watchlist.length} watchlist items`);
    return preview;
  } catch (error) {
    logger.error('[MORNING-PREVIEW] Failed to generate preview:', error);
    throw error;
  }
}

// Track last preview date to prevent duplicate morning previews
let lastMorningPreviewDate = '';

export function startMorningPreviewScheduler(): void {
  const checkAndRunPreview = async () => {
    const now = new Date();
    const ctTime = formatInTimeZone(now, 'America/Chicago', 'HH:mm');
    const ctDate = formatInTimeZone(now, 'America/Chicago', 'yyyy-MM-dd');
    const dayOfWeek = now.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    // Only run once per day - prevent spam from multiple interval hits
    if (lastMorningPreviewDate === ctDate) return;

    if (ctTime === '08:30') {
      try {
        lastMorningPreviewDate = ctDate; // Mark as sent BEFORE running
        await generateMorningPreview();
      } catch (error) {
        logger.error('[MORNING-PREVIEW] Scheduled preview failed:', error);
      }
    }
  };

  setInterval(checkAndRunPreview, 60 * 1000);
  logger.info('[MORNING-PREVIEW] Scheduler started - will run at 8:30 AM CT weekdays');
}
