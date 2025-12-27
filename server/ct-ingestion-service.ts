import { storage } from "./storage";
import { type CTMention, type CTSource } from "@shared/schema";

/**
 * Register a new influencer/source
 */
export async function addCTSource(name: string, platform: any, url?: string, followerCount?: number): Promise<CTSource> {
  return await storage.createCTSource({
    platform,
    handle: url || "",
    displayName: name,
    followersCount: followerCount || 0,
    isActive: true,
  });
}

/**
 * Simple rule-based sentiment analysis
 */
function analyzeSentiment(text: string): 'bullish' | 'bearish' | 'neutral' {
  const bullishWords = ["moon", "pump", "long", "buy", "bullish", "ape", "🚀", "📈"];
  const bearishWords = ["dump", "short", "sell", "bearish", "rekt", "📉"];

  const lowercaseText = text.toLowerCase();
  
  const isBullish = bullishWords.some(word => lowercaseText.includes(word));
  const isBearish = bearishWords.some(word => lowercaseText.includes(word));

  if (isBullish && !isBearish) return 'bullish';
  if (isBearish && !isBullish) return 'bearish';
  return 'neutral';
}

/**
 * Parse a post for ticker mentions and sentiment
 */
export async function parseCTMention(text: string, sourceId: string, timestamp?: string): Promise<CTMention[]> {
  // Ticker Parsing Rules:
  // - Match $TICKER format (e.g., $BTC, $ETH, $SOL)
  // - Match TICKER/USD or TICKER/USDT pairs
  // - Ignore common words that look like tickers
  
  const tickers = new Set<string>();
  
  // $TICKER
  const cashtagRegex = /\$([A-Z]{2,10})/g;
  let match;
  while ((match = cashtagRegex.exec(text.toUpperCase())) !== null) {
    tickers.add(match[1]);
  }

  // TICKER/USD or TICKER/USDT
  const pairRegex = /\b([A-Z]{2,10})\/(USD|USDT)\b/g;
  while ((match = pairRegex.exec(text.toUpperCase())) !== null) {
    tickers.add(match[1]);
  }

  const commonWords = new Set(["THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "ANY", "CAN", "HAD", "WAS", "NEW", "NOW", "ONE", "OUT", "SET", "WHO", "WHY"]);
  
  const createdMentions: CTMention[] = [];
  const sentiment = analyzeSentiment(text);
  const tickerArray = Array.from(tickers).filter(t => !commonWords.has(t));

  if (tickerArray.length > 0) {
    const mention = await storage.createCTMention({
      sourceId,
      postText: text,
      tickers: tickerArray,
      sentiment,
      postedAt: timestamp || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    });
    createdMentions.push(mention);
  }

  return createdMentions;
}

/**
 * Fetch latest posts from source (Mock implementation)
 */
export async function fetchAndStoreMentions(sourceId: string): Promise<void> {
  const mockPosts = [
    "Just loaded up more $SOL. Looking for the next leg up to $200! 🚀",
    "Market looking weak, might be time to $BTC short. Bearish divergence on the 4H. 📉",
    "Absolute moon mission for $PEPE. Don't fade the meme coins. 📈",
    "Accumulating $ETH/USDT here. Long term conviction is high. Bullish.",
    "$LINK is the infrastructure of the future. Buy and hold.",
    "Major dump incoming for $XRP. Be careful out there. rekt incoming.",
    "Aping into $AR. AI compute narrative is too strong to ignore. 🚀",
  ];

  const randomPost = mockPosts[Math.floor(Math.random() * mockPosts.length)];
  await parseCTMention(randomPost, sourceId);
}

/**
 * Get mentions from the last N hours
 */
export async function getRecentMentions(hours: number): Promise<CTMention[]> {
  return await storage.getCTMentions(hours);
}

/**
 * Get most mentioned tickers
 */
export async function getTopTickers(limit: number): Promise<{ ticker: string, count: number }[]> {
  const mentions = await storage.getCTMentions(24); // Last 24 hours
  const counts: Record<string, number> = {};
  
  mentions.forEach(m => {
    (m.tickers || []).forEach(ticker => {
      counts[ticker] = (counts[ticker] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .map(([ticker, count]) => ({ ticker, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Update call performance after price check
 */
export async function trackCallPerformance(mentionId: any): Promise<void> {
  const mentions = await storage.getCTMentions();
  const mention = mentions.find(m => m.id === mentionId);
  if (!mention) return;

  // In a real app, we'd fetch the live price for mention.ticker
  // For this mock, we'll assume currentPrice is slightly different from entry
  const mockEntryPrice = 100;
  const mockCurrentPrice = mention.sentiment === 'bullish' ? 110 : 90;
  const pnlPercent = ((mockCurrentPrice - mockEntryPrice) / mockEntryPrice) * 100;

  await storage.updateCTCallPerformance(mentionId, {
    symbol: mention.tickers?.[0] || "UNKNOWN",
    direction: mention.sentiment === 'bearish' ? 'short' : 'long',
    callPrice: mockEntryPrice,
    exitPrice: mockCurrentPrice,
    pnlPercent,
    outcome: pnlPercent > 0 ? 'win' : 'loss',
    resolvedAt: new Date().toISOString(),
  });
}

/**
 * Generate realistic CT posts with ticker mentions (Mock Data Mode)
 */
export async function generateMockCTData(hours: number = 24): Promise<void> {
  const sources = await storage.getCTSources();
  if (sources.length === 0) {
    await addCTSource("CryptoWhale", "twitter", "twitter.com/cryptowhale", 500000);
    await addCTSource("MacroGuru", "twitter", "twitter.com/macroguru", 250000);
    await addCTSource("AlphaSeeker", "rss", "https://cryptopotato.com/feed/", 100000);
  }

  const allSources = await storage.getCTSources();
  const iterations = hours * 2; // Roughly 2 posts per hour

  for (let i = 0; i < iterations; i++) {
    const source = allSources[Math.floor(Math.random() * allSources.length)];
    const backDate = new Date(Date.now() - Math.random() * hours * 60 * 60 * 1000).toISOString();
    
    // Simulate activity
    const mockPosts = [
      `I'm really bullish on $BTC right now. 🚀`,
      `$ETH looks like it's ready to pump. 📈`,
      `Thinking of going short on $SOL. Bearish.`,
      `$DOT/USD is testing key support. Might buy here.`,
      `Just sold my $DOGE bags. Rekt. 📉`,
      `$UNI moon mission soon? 🚀`,
      `$AAVE long at these levels looks good.`,
    ];
    
    const text = mockPosts[Math.floor(Math.random() * mockPosts.length)];
    await parseCTMention(text, source.id, backDate);
  }
}

// Export all functions
export default {
  addCTSource,
  parseCTMention,
  fetchAndStoreMentions,
  getRecentMentions,
  getTopTickers,
  trackCallPerformance,
  generateMockCTData
};
