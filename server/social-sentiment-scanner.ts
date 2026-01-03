/**
 * Social Sentiment Scanner
 * 
 * Monitors Twitter/X and Reddit for ticker mentions,
 * sentiment analysis, and trending stocks.
 */

import { logger } from './logger';

interface SocialMention {
  id: string;
  symbol: string;
  platform: 'twitter' | 'reddit' | 'stocktwits';
  content: string;
  author: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -100 to 100
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  timestamp: string;
  url: string | null;
}

interface TrendingTicker {
  symbol: string;
  mentionCount: number;
  sentimentScore: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  change24h: number;
  topMentions: SocialMention[];
}

interface ScannerStatus {
  isActive: boolean;
  lastScan: string | null;
  mentionsFound: number;
  trendingTickers: TrendingTicker[];
  recentMentions: SocialMention[];
  settings: {
    watchlist: string[];
    platforms: ('twitter' | 'reddit' | 'stocktwits')[];
    minEngagement: number;
    updateInterval: number; // minutes
  };
}

let scannerStatus: ScannerStatus = {
  isActive: false,
  lastScan: null,
  mentionsFound: 0,
  trendingTickers: [],
  recentMentions: [],
  settings: {
    watchlist: ['META', 'GOOGL', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'AMD', 'SPY', 'QQQ', 'BTC', 'ETH'],
    platforms: ['twitter', 'reddit', 'stocktwits'],
    minEngagement: 10,
    updateInterval: 15,
  },
};

// Sentiment keywords for basic analysis
const BULLISH_KEYWORDS = [
  'buy', 'long', 'moon', 'bullish', 'calls', 'pump', 'breakout', 'upside', 'rocket',
  'squeeze', 'undervalued', 'accumulate', 'green', 'rally', 'bounce', 'support',
  'higher', 'strong', 'earnings beat', 'upgraded', 'outperform'
];

const BEARISH_KEYWORDS = [
  'sell', 'short', 'puts', 'bearish', 'dump', 'crash', 'overvalued', 'downside',
  'breakdown', 'resistance', 'weak', 'lower', 'drop', 'red', 'fade', 'downgrade',
  'miss', 'disappointing', 'sell-off', 'panic'
];

/**
 * Analyze sentiment of text
 */
function analyzeSentiment(text: string): { sentiment: 'bullish' | 'bearish' | 'neutral'; score: number } {
  const lowerText = text.toLowerCase();
  
  let bullishScore = 0;
  let bearishScore = 0;
  
  for (const keyword of BULLISH_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      bullishScore += 10;
    }
  }
  
  for (const keyword of BEARISH_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      bearishScore += 10;
    }
  }
  
  // Amplify for strong language
  if (lowerText.includes('!')) {
    bullishScore *= 1.2;
    bearishScore *= 1.2;
  }
  if (lowerText.includes('🚀') || lowerText.includes('📈')) {
    bullishScore += 15;
  }
  if (lowerText.includes('📉') || lowerText.includes('💀')) {
    bearishScore += 15;
  }
  
  const netScore = bullishScore - bearishScore;
  const normalizedScore = Math.max(-100, Math.min(100, netScore));
  
  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (normalizedScore > 15) sentiment = 'bullish';
  else if (normalizedScore < -15) sentiment = 'bearish';
  
  return { sentiment, score: normalizedScore };
}

/**
 * Extract ticker symbols from text
 */
function extractTickers(text: string): string[] {
  // Match $TICKER or just TICKER patterns
  const tickerRegex = /\$([A-Z]{1,5})\b|\b([A-Z]{2,5})\b/g;
  const matches = text.matchAll(tickerRegex);
  
  const tickers: string[] = [];
  for (const match of matches) {
    const ticker = match[1] || match[2];
    if (ticker && scannerStatus.settings.watchlist.includes(ticker)) {
      tickers.push(ticker);
    }
  }
  
  return [...new Set(tickers)];
}

/**
 * Mock function to simulate social media scanning
 * In production, you would integrate with actual APIs
 */
async function scanPlatform(platform: 'twitter' | 'reddit' | 'stocktwits'): Promise<SocialMention[]> {
  // Simulated mentions - in production, use actual API integrations
  const mockMentions: SocialMention[] = [];
  
  // This is a placeholder - you would integrate with:
  // - Twitter API v2 for tweets
  // - Reddit API for posts/comments
  // - StockTwits API for messages
  
  logger.info(`[SOCIAL-SENTIMENT] Scanning ${platform}... (mock mode)`);
  
  return mockMentions;
}

/**
 * Scan all platforms for mentions
 */
export async function scanSocialSentiment(): Promise<{
  mentions: SocialMention[];
  trending: TrendingTicker[];
}> {
  if (!scannerStatus.isActive) {
    return { mentions: [], trending: [] };
  }
  
  logger.info('[SOCIAL-SENTIMENT] Starting social media scan...');
  scannerStatus.lastScan = new Date().toISOString();
  
  const allMentions: SocialMention[] = [];
  
  for (const platform of scannerStatus.settings.platforms) {
    try {
      const mentions = await scanPlatform(platform);
      allMentions.push(...mentions);
    } catch (error) {
      logger.warn(`[SOCIAL-SENTIMENT] Error scanning ${platform}:`, error);
    }
  }
  
  // Aggregate by ticker
  const tickerMap = new Map<string, {
    mentions: SocialMention[];
    totalScore: number;
    count: number;
  }>();
  
  for (const mention of allMentions) {
    const existing = tickerMap.get(mention.symbol) || { mentions: [], totalScore: 0, count: 0 };
    existing.mentions.push(mention);
    existing.totalScore += mention.sentimentScore;
    existing.count++;
    tickerMap.set(mention.symbol, existing);
  }
  
  // Create trending tickers
  const trending: TrendingTicker[] = [];
  for (const [symbol, data] of tickerMap) {
    const avgScore = data.count > 0 ? data.totalScore / data.count : 0;
    
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (avgScore > 20) sentiment = 'bullish';
    else if (avgScore < -20) sentiment = 'bearish';
    
    trending.push({
      symbol,
      mentionCount: data.count,
      sentimentScore: avgScore,
      sentiment,
      change24h: 0, // Would be populated from price data
      topMentions: data.mentions.slice(0, 5),
    });
  }
  
  // Sort by mention count
  trending.sort((a, b) => b.mentionCount - a.mentionCount);
  
  // Update status
  scannerStatus.mentionsFound += allMentions.length;
  scannerStatus.trendingTickers = trending.slice(0, 20);
  scannerStatus.recentMentions = allMentions.slice(0, 100);
  
  logger.info(`[SOCIAL-SENTIMENT] Found ${allMentions.length} mentions, ${trending.length} tickers`);
  
  // Send alerts for high-activity tickers
  if (trending.length > 0) {
    await sendTrendingAlerts(trending.slice(0, 5));
  }
  
  return { mentions: allMentions, trending };
}

/**
 * Send alerts for trending tickers
 */
async function sendTrendingAlerts(trending: TrendingTicker[]): Promise<void> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook || trending.length === 0) return;
  
  try {
    const content = [
      '# 🔥 Trending on Social Media',
      '',
      ...trending.map(ticker => {
        const emoji = ticker.sentiment === 'bullish' ? '🟢' : ticker.sentiment === 'bearish' ? '🔴' : '⚪';
        return `${emoji} **$${ticker.symbol}** - ${ticker.mentionCount} mentions | Sentiment: ${ticker.sentimentScore > 0 ? '+' : ''}${ticker.sentimentScore.toFixed(0)}`;
      }),
    ].join('\n');
    
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        username: 'Social Sentiment Scanner',
      }),
    });
  } catch (error) {
    logger.warn('[SOCIAL-SENTIMENT] Discord alert failed:', error);
  }
}

/**
 * Get scanner status
 */
export function getSocialSentimentStatus(): ScannerStatus {
  return { ...scannerStatus };
}

/**
 * Get trending tickers
 */
export function getTrendingTickers(): TrendingTicker[] {
  return [...scannerStatus.trendingTickers];
}

/**
 * Get recent mentions
 */
export function getRecentMentions(limit = 50): SocialMention[] {
  return scannerStatus.recentMentions.slice(0, limit);
}

/**
 * Toggle scanner active state
 */
export function setSocialSentimentActive(active: boolean): void {
  scannerStatus.isActive = active;
  logger.info(`[SOCIAL-SENTIMENT] Scanner ${active ? 'ACTIVATED' : 'DEACTIVATED'}`);
}

/**
 * Update scanner settings
 */
export function updateSocialSentimentSettings(settings: Partial<ScannerStatus['settings']>): void {
  scannerStatus.settings = { ...scannerStatus.settings, ...settings };
  logger.info('[SOCIAL-SENTIMENT] Settings updated:', scannerStatus.settings);
}

/**
 * Add ticker to watchlist
 */
export function addTickerToWatch(symbol: string): void {
  if (!scannerStatus.settings.watchlist.includes(symbol)) {
    scannerStatus.settings.watchlist.push(symbol);
    logger.info(`[SOCIAL-SENTIMENT] Added ${symbol} to watchlist`);
  }
}

/**
 * Remove ticker from watchlist
 */
export function removeTickerFromWatch(symbol: string): void {
  scannerStatus.settings.watchlist = scannerStatus.settings.watchlist.filter(s => s !== symbol);
  logger.info(`[SOCIAL-SENTIMENT] Removed ${symbol} from watchlist`);
}

/**
 * Manually analyze text sentiment
 */
export function analyzeText(text: string): {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number;
  tickers: string[];
} {
  const { sentiment, score } = analyzeSentiment(text);
  const tickers = extractTickers(text);
  
  return { sentiment, score, tickers };
}
