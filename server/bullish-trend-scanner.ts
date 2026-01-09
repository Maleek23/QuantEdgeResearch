import { db } from './db';
import { bullishTrends, type BullishTrend, type TrendStrength, type TrendPhase, type TrendCategory } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { logger } from './logger';
import { calculateRSI, calculateMACD, calculateSMA } from './technical-indicators';
import { recordSymbolAttention } from './attention-tracking-service';

const YAHOO_FINANCE_API = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_QUOTE_API = "https://query2.finance.yahoo.com/v7/finance/quote";

const USER_BULLISH_WATCHLIST = [
  'INTC', 'ZETA', 'RIVN', 'SOFI', 'ONDS', 'RKLB', 'ASTS', 'NVO', 'NBIS', 'IREN',
  'CIFR', 'PATH', 'UPST', 'PL', 'OUST', 'SERV', 'UAMY', 'UUU', 'NAK', 'USAR', 'HIMS',
  'PLTR', 'IONQ', 'SMR', 'OKLO', 'APP', 'SOUN', 'MARA', 'RIOT', 'COIN', 'HOOD',
  'CVNA', 'DASH', 'UBER', 'ABNB', 'CRWD', 'NET', 'SNOW', 'DDOG', 'ARM', 'SMCI',
  'AFRM', 'NU', 'DKNG', 'TTD', 'ROKU', 'SQ', 'SHOP', 'MELI', 'NNE', 'LEU', 'CCJ', 'UEC'
];

const SECTOR_CATEGORIES: Record<string, TrendCategory> = {
  'Technology': 'growth',
  'Financial Services': 'turnaround',
  'Consumer Cyclical': 'momentum',
  'Energy': 'sector_rotation',
  'Healthcare': 'growth',
  'Basic Materials': 'speculative',
  'Industrials': 'momentum',
  'Communication Services': 'growth',
  'Real Estate': 'sector_rotation',
  'Utilities': 'sector_rotation',
};

interface QuoteData {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageDailyVolume10Day?: number;
  averageDailyVolume3Month?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  marketCap?: number;
  sector?: string;
  industry?: string;
}

interface HistoricalData {
  prices: number[];
  volumes: number[];
  timestamps: number[];
}

async function fetchQuotes(symbols: string[]): Promise<QuoteData[]> {
  try {
    const chunks = [];
    for (let i = 0; i < symbols.length; i += 50) {
      chunks.push(symbols.slice(i, i + 50));
    }
    
    const results: QuoteData[] = [];
    
    for (const chunk of chunks) {
      const url = `${YAHOO_QUOTE_API}?symbols=${chunk.join(',')}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const quotes = data.quoteResponse?.result || [];
      results.push(...quotes);
      
      await new Promise(r => setTimeout(r, 200));
    }
    
    return results;
  } catch (error) {
    logger.error('[BULLISH] Failed to fetch quotes', { error });
    return [];
  }
}

async function fetchHistoricalData(symbol: string, period = '3mo'): Promise<HistoricalData | null> {
  try {
    const url = `${YAHOO_FINANCE_API}/${symbol}?interval=1d&range=${period}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    
    const timestamps = result.timestamp || [];
    const prices = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    
    return {
      prices: prices.filter((p: number | null) => p !== null),
      volumes: volumes.filter((v: number | null) => v !== null),
      timestamps
    };
  } catch (error) {
    logger.debug(`[BULLISH] Failed to fetch historical for ${symbol}`, { error });
    return null;
  }
}

function calculateMomentumScore(data: {
  rsi14: number;
  priceVsSma20: number;
  priceVsSma50: number;
  priceVsSma200: number;
  volumeRatio: number;
  dayChangePercent: number;
  weekChangePercent: number;
  percentFrom52High: number;
}): number {
  let score = 50;
  
  if (data.rsi14 > 50 && data.rsi14 < 70) score += 10;
  else if (data.rsi14 >= 70) score += 5;
  else if (data.rsi14 < 30) score -= 15;
  else if (data.rsi14 < 50) score -= 5;
  
  if (data.priceVsSma20 > 0) score += Math.min(10, data.priceVsSma20 * 2);
  if (data.priceVsSma50 > 0) score += Math.min(10, data.priceVsSma50);
  if (data.priceVsSma200 > 0) score += Math.min(10, data.priceVsSma200 * 0.5);
  
  if (data.volumeRatio > 2) score += 15;
  else if (data.volumeRatio > 1.5) score += 10;
  else if (data.volumeRatio > 1) score += 5;
  
  if (data.dayChangePercent > 5) score += 10;
  else if (data.dayChangePercent > 2) score += 5;
  else if (data.dayChangePercent < -3) score -= 10;
  
  if (data.weekChangePercent > 10) score += 10;
  else if (data.weekChangePercent > 5) score += 5;
  else if (data.weekChangePercent < -5) score -= 10;
  
  if (data.percentFrom52High > -5) score += 10;
  else if (data.percentFrom52High > -15) score += 5;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function determineTrendStrength(momentumScore: number): TrendStrength {
  if (momentumScore >= 80) return 'explosive';
  if (momentumScore >= 65) return 'strong';
  if (momentumScore >= 45) return 'moderate';
  return 'weak';
}

function determineTrendPhase(data: {
  priceVsSma20: number;
  priceVsSma50: number;
  volumeRatio: number;
  percentFrom52High: number;
  dayChangePercent: number;
}): TrendPhase {
  if (data.volumeRatio > 2 && data.priceVsSma20 > 3 && data.dayChangePercent > 3) {
    return 'breakout';
  }
  if (data.priceVsSma20 > 0 && data.priceVsSma50 > 0 && data.percentFrom52High > -10) {
    return 'momentum';
  }
  if (data.priceVsSma20 < 0 && data.priceVsSma50 > 0) {
    return 'distribution';
  }
  return 'accumulation';
}

export async function scanBullishTrends(): Promise<BullishTrend[]> {
  logger.info('[BULLISH] Starting bullish trend scan...');
  
  const symbols = USER_BULLISH_WATCHLIST;
  const quotes = await fetchQuotes(symbols);
  
  if (quotes.length === 0) {
    logger.warn('[BULLISH] No quotes fetched');
    return [];
  }
  
  const results: BullishTrend[] = [];
  
  for (const quote of quotes) {
    try {
      const historical = await fetchHistoricalData(quote.symbol);
      if (!historical || historical.prices.length < 20) continue;
      
      const prices = historical.prices;
      const volumes = historical.volumes;
      
      const rsi14 = calculateRSI(prices, 14);
      const rsi2 = calculateRSI(prices, 2);
      const macd = calculateMACD(prices);
      
      const sma20 = calculateSMA(prices, 20);
      const sma50 = prices.length >= 50 ? calculateSMA(prices, 50) : sma20;
      const sma200 = quote.twoHundredDayAverage || sma50;
      
      const currentPrice = quote.regularMarketPrice;
      const priceVsSma20 = ((currentPrice - sma20) / sma20) * 100;
      const priceVsSma50 = ((currentPrice - sma50) / sma50) * 100;
      const priceVsSma200 = ((currentPrice - sma200) / sma200) * 100;
      
      const avgVolume = quote.averageDailyVolume10Day || 
        (volumes.slice(-10).reduce((a, b) => a + b, 0) / 10);
      const volumeRatio = avgVolume > 0 ? quote.regularMarketVolume / avgVolume : 1;
      
      const weekPrices = prices.slice(-5);
      const weekChangePercent = weekPrices.length >= 5 
        ? ((currentPrice - weekPrices[0]) / weekPrices[0]) * 100 
        : 0;
      
      const monthPrices = prices.slice(-22);
      const monthChangePercent = monthPrices.length >= 22
        ? ((currentPrice - monthPrices[0]) / monthPrices[0]) * 100
        : 0;
      
      const week52High = quote.fiftyTwoWeekHigh || Math.max(...prices);
      const week52Low = quote.fiftyTwoWeekLow || Math.min(...prices);
      const percentFrom52High = ((currentPrice - week52High) / week52High) * 100;
      const percentFrom52Low = ((currentPrice - week52Low) / week52Low) * 100;
      
      const momentumScore = calculateMomentumScore({
        rsi14,
        priceVsSma20,
        priceVsSma50,
        priceVsSma200,
        volumeRatio,
        dayChangePercent: quote.regularMarketChangePercent,
        weekChangePercent,
        percentFrom52High
      });
      
      const trendStrength = determineTrendStrength(momentumScore);
      const trendPhase = determineTrendPhase({
        priceVsSma20,
        priceVsSma50,
        volumeRatio,
        percentFrom52High,
        dayChangePercent: quote.regularMarketChangePercent
      });
      
      let macdSignal = 'neutral';
      if (macd.histogram > 0 && macd.macd > macd.signal) {
        macdSignal = macd.histogram > 0.1 ? 'bullish_cross' : 'bullish';
      } else if (macd.histogram < 0 && macd.macd < macd.signal) {
        macdSignal = macd.histogram < -0.1 ? 'bearish_cross' : 'bearish';
      }
      
      const isBreakout = volumeRatio > 1.5 && priceVsSma20 > 2 && quote.regularMarketChangePercent > 2;
      const isHighVolume = volumeRatio > 2;
      const isAboveMAs = priceVsSma20 > 0 && priceVsSma50 > 0 && priceVsSma200 > 0;
      const isNewHigh = percentFrom52High > -5;
      
      const sector = quote.sector || 'Other';
      const category = SECTOR_CATEGORIES[sector] || 'momentum';
      
      const trendData: Partial<BullishTrend> = {
        symbol: quote.symbol,
        name: quote.shortName || quote.longName || quote.symbol,
        sector,
        category,
        currentPrice,
        previousClose: quote.regularMarketPreviousClose,
        dayChange: quote.regularMarketChange,
        dayChangePercent: quote.regularMarketChangePercent,
        weekChangePercent,
        monthChangePercent,
        rsi14,
        rsi2,
        macdSignal,
        sma20,
        sma50,
        sma200,
        priceVsSma20,
        priceVsSma50,
        priceVsSma200,
        currentVolume: quote.regularMarketVolume,
        avgVolume,
        volumeRatio,
        trendStrength,
        trendPhase,
        momentumScore,
        week52High,
        week52Low,
        percentFrom52High,
        percentFrom52Low,
        isBreakout,
        isHighVolume,
        isAboveMAs,
        isNewHigh,
        isActive: true,
        lastScannedAt: new Date()
      };
      
      const existing = await db.select().from(bullishTrends)
        .where(eq(bullishTrends.symbol, quote.symbol))
        .limit(1);
      
      if (existing.length > 0) {
        await db.update(bullishTrends)
          .set({ ...trendData, updatedAt: new Date() })
          .where(eq(bullishTrends.id, existing[0].id));
        results.push({ ...existing[0], ...trendData } as BullishTrend);
      } else {
        const [inserted] = await db.insert(bullishTrends)
          .values(trendData as any)
          .returning();
        results.push(inserted);
      }
      
      // Record attention for bullish trend detection (momentum score 70+)
      if (momentumScore >= 70) {
        recordSymbolAttention(
          quote.symbol,
          'bullish_trend',
          momentumScore,
          'bullish',
          { trendPhase, trendStrength, isBreakout, isNewHigh }
        );
      }
      
      await new Promise(r => setTimeout(r, 100));
      
    } catch (error) {
      logger.debug(`[BULLISH] Error processing ${quote.symbol}`, { error });
    }
  }
  
  logger.info(`[BULLISH] Scan complete: ${results.length} stocks analyzed`);
  return results;
}

export async function getBullishTrends(): Promise<BullishTrend[]> {
  return db.select()
    .from(bullishTrends)
    .where(eq(bullishTrends.isActive, true))
    .orderBy(desc(bullishTrends.momentumScore));
}

export async function getTopMomentumStocks(limit = 10): Promise<BullishTrend[]> {
  return db.select()
    .from(bullishTrends)
    .where(and(
      eq(bullishTrends.isActive, true),
      eq(bullishTrends.trendStrength, 'strong')
    ))
    .orderBy(desc(bullishTrends.momentumScore))
    .limit(limit);
}

export async function getBreakoutStocks(): Promise<BullishTrend[]> {
  return db.select()
    .from(bullishTrends)
    .where(and(
      eq(bullishTrends.isActive, true),
      eq(bullishTrends.isBreakout, true)
    ))
    .orderBy(desc(bullishTrends.volumeRatio));
}

export async function addBullishStock(
  symbol: string, 
  userId: string,
  notes?: string,
  category?: TrendCategory
): Promise<BullishTrend | null> {
  try {
    const quotes = await fetchQuotes([symbol.toUpperCase()]);
    if (quotes.length === 0) {
      throw new Error(`Could not find quote data for ${symbol}`);
    }
    
    const quote = quotes[0];
    const historical = await fetchHistoricalData(quote.symbol);
    
    const prices = historical?.prices || [quote.regularMarketPrice];
    const rsi14 = calculateRSI(prices, 14);
    const sma20 = calculateSMA(prices, 20);
    
    const trendData = {
      symbol: quote.symbol,
      name: quote.shortName || quote.longName || quote.symbol,
      sector: quote.sector || 'Other',
      category: category || 'momentum',
      currentPrice: quote.regularMarketPrice,
      previousClose: quote.regularMarketPreviousClose,
      dayChange: quote.regularMarketChange,
      dayChangePercent: quote.regularMarketChangePercent,
      rsi14,
      sma20,
      currentVolume: quote.regularMarketVolume,
      avgVolume: quote.averageDailyVolume10Day || 0,
      volumeRatio: quote.averageDailyVolume10Day 
        ? quote.regularMarketVolume / quote.averageDailyVolume10Day 
        : 1,
      momentumScore: 50,
      trendStrength: 'moderate' as TrendStrength,
      trendPhase: 'accumulation' as TrendPhase,
      week52High: quote.fiftyTwoWeekHigh,
      week52Low: quote.fiftyTwoWeekLow,
      addedManually: true,
      addedBy: userId,
      notes,
      isActive: true
    };
    
    const existing = await db.select().from(bullishTrends)
      .where(eq(bullishTrends.symbol, quote.symbol))
      .limit(1);
    
    if (existing.length > 0) {
      await db.update(bullishTrends)
        .set({ ...trendData, updatedAt: new Date() })
        .where(eq(bullishTrends.id, existing[0].id));
      return { ...existing[0], ...trendData } as BullishTrend;
    }
    
    const [inserted] = await db.insert(bullishTrends)
      .values(trendData as any)
      .returning();
    
    return inserted;
  } catch (error) {
    logger.error(`[BULLISH] Failed to add stock ${symbol}`, { error });
    return null;
  }
}

export async function removeBullishStock(symbol: string): Promise<boolean> {
  try {
    await db.update(bullishTrends)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(bullishTrends.symbol, symbol.toUpperCase()));
    return true;
  } catch (error) {
    logger.error(`[BULLISH] Failed to remove stock ${symbol}`, { error });
    return false;
  }
}

export async function sendBreakoutAlerts(): Promise<void> {
  const breakouts = await getBreakoutStocks();
  const newBreakouts = breakouts.filter(b => !b.alertSent);
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_QUANTFLOOR || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  
  for (const breakout of newBreakouts) {
    try {
      const message = {
        embeds: [{
          title: `🚀 BREAKOUT ALERT: ${breakout.symbol}`,
          description: `**${breakout.name}** is breaking out!`,
          color: 0x00ff00,
          fields: [
            { name: 'Price', value: `$${breakout.currentPrice?.toFixed(2)}`, inline: true },
            { name: 'Change', value: `${breakout.dayChangePercent?.toFixed(2)}%`, inline: true },
            { name: 'Volume Ratio', value: `${breakout.volumeRatio?.toFixed(1)}x`, inline: true },
            { name: 'Momentum Score', value: `${breakout.momentumScore}/100`, inline: true },
            { name: 'Trend Phase', value: breakout.trendPhase || 'Unknown', inline: true },
            { name: 'RSI(14)', value: breakout.rsi14?.toFixed(1) || 'N/A', inline: true },
          ],
          footer: { text: 'Quant Edge Labs - Bullish Trend Tracker' },
          timestamp: new Date().toISOString()
        }]
      };
      
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      
      await db.update(bullishTrends)
        .set({ alertSent: true, lastAlertDate: new Date() })
        .where(eq(bullishTrends.id, breakout.id));
        
    } catch (error) {
      logger.error(`[BULLISH] Failed to send alert for ${breakout.symbol}`, { error });
    }
  }
}

export function startBullishTrendScanner(): void {
  logger.info('[BULLISH] Starting Bullish Trend Scanner...');
  
  scanBullishTrends().catch(err => 
    logger.error('[BULLISH] Initial scan failed', { error: err })
  );
  
  setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    if (day >= 1 && day <= 5 && hour >= 9 && hour <= 16) {
      scanBullishTrends().catch(err => 
        logger.error('[BULLISH] Scheduled scan failed', { error: err })
      );
      sendBreakoutAlerts().catch(err =>
        logger.error('[BULLISH] Alert sending failed', { error: err })
      );
    }
  }, 15 * 60 * 1000);
  
  logger.info('[BULLISH] Scanner started - scanning every 15 minutes during market hours');
}
