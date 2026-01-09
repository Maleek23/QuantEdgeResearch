import { db } from './db';
import { bullishTrends, tradeIdeas, type BullishTrend, type TrendStrength, type TrendPhase, type TrendCategory } from '@shared/schema';
import { eq, desc, and, gte } from 'drizzle-orm';
import { logger } from './logger';
import { calculateRSI, calculateMACD, calculateSMA } from './technical-indicators';
import { recordSymbolAttention } from './attention-tracking-service';

// Track recently created trade ideas to avoid duplicates
const recentTradeIdeas = new Map<string, Date>();
const TRADE_IDEA_COOLDOWN_MS = 8 * 60 * 60 * 1000; // 8 hours between same symbol trade ideas

const YAHOO_FINANCE_API = "https://query1.finance.yahoo.com/v8/finance/chart";
const TRADIER_API = "https://api.tradier.com/v1";
const TRADIER_API_KEY = process.env.TRADIER_API_KEY;

const USER_BULLISH_WATCHLIST = [
  // Nuclear & Energy
  'OKLO', 'NNE', 'SMR', 'LEU', 'CCJ', 'UEC', 'DNN', 'URG', 'BWXT',
  // Defense & Aerospace
  'LMT', 'NOC', 'RTX', 'GD', 'BA', 'HII', 'LHX', 'TXT', 'HWM',
  // Space & Satellites
  'RKLB', 'ASTS', 'LUNR', 'RDW', 'MNTS', 'LLAP', 'SPCE', 'PL', 'OUST',
  // Crypto & Fintech
  'MARA', 'RIOT', 'CLSK', 'IREN', 'CIFR', 'COIN', 'HOOD', 'SOFI', 'AFRM', 'NU',
  // AI & Quantum
  'PLTR', 'RGTI', 'NBIS', 'IONQ', 'QBTS', 'ARQQ', 'QUBT', 'LAES', 'SOUN', 'APP',
  // Tech Leaders & Growth
  'CVNA', 'DASH', 'UBER', 'ABNB', 'CRWD', 'NET', 'SNOW', 'DDOG', 'ARM', 'SMCI',
  'TTD', 'ROKU', 'SQ', 'SHOP', 'MELI', 'DKNG', 'HIMS', 'RIVN', 'PATH', 'UPST', 'ZETA',
  // Speculative
  'INTC', 'SERV', 'UAMY', 'UUU', 'NAK', 'USAR', 'ONDS', 'NVO'
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
    // Use Tradier API (more reliable than Yahoo)
    if (!TRADIER_API_KEY) {
      logger.warn('[BULLISH] No Tradier API key, falling back to limited Yahoo data');
      return await fetchQuotesYahooFallback(symbols);
    }
    
    const results: QuoteData[] = [];
    const symbolList = symbols.join(',');
    
    try {
      const url = `${TRADIER_API}/markets/quotes?symbols=${symbolList}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${TRADIER_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const quotes = data.quotes?.quote || [];
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
        
        for (const q of quotesArray) {
          if (q && q.symbol && typeof q.last === 'number') {
            results.push({
              symbol: q.symbol,
              shortName: q.description,
              longName: q.description,
              regularMarketPrice: q.last || q.close || 0,
              regularMarketPreviousClose: q.prevclose || q.close || 0,
              regularMarketChange: q.change || 0,
              regularMarketChangePercent: q.change_percentage || 0,
              regularMarketVolume: q.volume || 0,
              averageDailyVolume10Day: q.average_volume || 0,
              averageDailyVolume3Month: q.average_volume || 0,
              fiftyTwoWeekHigh: q.week_52_high || 0,
              fiftyTwoWeekLow: q.week_52_low || 0,
            });
          }
        }
        
        logger.info(`[BULLISH] Tradier fetched ${results.length}/${symbols.length} quotes`);
        return results;
      } else {
        logger.warn(`[BULLISH] Tradier quotes failed: ${response.status}`);
      }
    } catch (tradierError) {
      logger.warn('[BULLISH] Tradier API error, falling back to Yahoo', { error: tradierError });
    }
    
    // Fallback to Yahoo if Tradier fails
    return await fetchQuotesYahooFallback(symbols);
  } catch (error) {
    logger.error('[BULLISH] Failed to fetch quotes', { error });
    return [];
  }
}

async function fetchQuotesYahooFallback(symbols: string[]): Promise<QuoteData[]> {
  const results: QuoteData[] = [];
  
  // Fetch quotes one at a time with delays to avoid rate limiting
  for (const symbol of symbols.slice(0, 20)) { // Limit to 20 to avoid rate limits
    try {
      const url = `${YAHOO_FINANCE_API}/${symbol}?interval=1d&range=5d`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (response.ok) {
        const data = await response.json();
        const result = data.chart?.result?.[0];
        const meta = result?.meta;
        
        if (meta) {
          results.push({
            symbol: meta.symbol,
            shortName: meta.symbol,
            longName: meta.symbol,
            regularMarketPrice: meta.regularMarketPrice || 0,
            regularMarketPreviousClose: meta.chartPreviousClose || meta.previousClose || 0,
            regularMarketChange: (meta.regularMarketPrice || 0) - (meta.chartPreviousClose || meta.regularMarketPrice || 0),
            regularMarketChangePercent: meta.chartPreviousClose ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100 : 0,
            regularMarketVolume: meta.regularMarketVolume || 0,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
          });
        }
      }
      
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      // Skip individual failures
    }
  }
  
  logger.info(`[BULLISH] Yahoo fallback fetched ${results.length} quotes`);
  return results;
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
          'alert',
          { 
            confidence: momentumScore, 
            direction: 'bullish',
            message: `Momentum ${momentumScore}% | ${trendPhase} phase | ${trendStrength} trend${isBreakout ? ' | BREAKOUT' : ''}${isNewHigh ? ' | NEW HIGH' : ''}`
          }
        );
      }
      
      await new Promise(r => setTimeout(r, 100));
      
    } catch (error) {
      logger.debug(`[BULLISH] Error processing ${quote.symbol}`, { error });
    }
  }
  
  logger.info(`[BULLISH] Scan complete: ${results.length} stocks analyzed`);
  
  // Generate trade ideas for top momentum stocks (75+ score)
  await generateTradeIdeasFromMomentum(results);
  
  return results;
}

// Generate trade ideas for high-momentum bullish stocks
async function generateTradeIdeasFromMomentum(trends: BullishTrend[]): Promise<void> {
  // Filter for high-conviction momentum stocks
  const highMomentum = trends.filter(t => 
    t.momentumScore && t.momentumScore >= 75 &&
    t.currentPrice && t.currentPrice > 1 && // Avoid penny stocks
    (t.trendPhase === 'breakout' || t.trendPhase === 'momentum') &&
    t.isAboveMAs // Price above all moving averages
  );
  
  if (highMomentum.length === 0) {
    logger.debug('[BULLISH] No high-momentum stocks for trade ideas');
    return;
  }
  
  let ideasCreated = 0;
  
  for (const trend of highMomentum.slice(0, 5)) { // Limit to top 5
    try {
      const symbol = trend.symbol;
      
      // Check cooldown
      const lastCreated = recentTradeIdeas.get(symbol);
      if (lastCreated && Date.now() - lastCreated.getTime() < TRADE_IDEA_COOLDOWN_MS) {
        logger.debug(`[BULLISH] Skipping ${symbol} - trade idea cooldown`);
        continue;
      }
      
      // Check if a similar idea exists in the database recently
      const cutoffTime = new Date(Date.now() - TRADE_IDEA_COOLDOWN_MS).toISOString();
      const existingIdea = await db.select()
        .from(tradeIdeas)
        .where(and(
          eq(tradeIdeas.symbol, symbol),
          eq(tradeIdeas.direction, 'long'),
          eq(tradeIdeas.assetType, 'stock'),
          gte(tradeIdeas.timestamp, cutoffTime)
        ))
        .limit(1);
      
      if (existingIdea.length > 0) {
        logger.debug(`[BULLISH] Skipping ${symbol} - recent idea exists`);
        recentTradeIdeas.set(symbol, new Date());
        continue;
      }
      
      const currentPrice = trend.currentPrice!;
      
      // Calculate targets based on momentum and technical levels
      // For high momentum stocks, use 3-5% target, 2% stop
      const targetPercent = trend.momentumScore! >= 85 ? 0.05 : 0.03;
      const stopPercent = 0.02;
      
      const targetPrice = currentPrice * (1 + targetPercent);
      const stopLoss = currentPrice * (1 - stopPercent);
      const riskRewardRatio = targetPercent / stopPercent;
      
      // Build signals array
      const signals: string[] = [];
      if (trend.trendPhase === 'breakout') signals.push('BREAKOUT');
      if (trend.isNewHigh) signals.push('NEW_HIGH');
      if (trend.isHighVolume) signals.push('HIGH_VOLUME');
      if (trend.rsi14 && trend.rsi14 > 50 && trend.rsi14 < 70) signals.push('RSI_BULLISH');
      if (trend.macdSignal === 'bullish_cross') signals.push('MACD_CROSS');
      if (trend.isAboveMAs) signals.push('ABOVE_MAs');
      signals.push(`MOMENTUM_${trend.momentumScore}`);
      
      // Calculate confidence based on signals
      const confidence = Math.min(95, 70 + (signals.length * 3));
      const grade = confidence >= 90 ? 'A' : confidence >= 85 ? 'B+' : 'B';
      
      // Create the trade idea
      const now = new Date();
      const entryValidUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours
      const exitBy = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days (swing)
      
      const tradeIdea = {
        symbol,
        assetType: 'stock' as const,
        direction: 'long',
        holdingPeriod: 'swing' as const,
        entryPrice: currentPrice,
        targetPrice,
        stopLoss,
        riskRewardRatio,
        catalyst: `Bullish momentum scanner: ${trend.trendPhase?.toUpperCase()} phase with ${trend.momentumScore}/100 momentum score`,
        analysis: `${trend.name} showing strong bullish momentum. ${trend.trendPhase === 'breakout' ? 'Breaking out with ' + (trend.volumeRatio?.toFixed(1) || 'N/A') + 'x volume.' : 'Sustained uptrend momentum.'} RSI: ${trend.rsi14?.toFixed(0) || 'N/A'}, MACD: ${trend.macdSignal || 'neutral'}. ${trend.isNewHigh ? 'Near 52-week high.' : ''} ${trend.isAboveMAs ? 'Trading above all key moving averages.' : ''}`,
        sessionContext: `Market hours - Bullish trend detected by momentum scanner`,
        timestamp: now.toISOString(),
        entryValidUntil,
        exitBy,
        source: 'quant' as const,
        status: 'published' as const,
        confidenceScore: confidence,
        qualitySignals: signals,
        probabilityBand: grade,
        rsiValue: trend.rsi14 || null,
        volumeRatio: trend.volumeRatio || null,
        priceVs52WeekHigh: trend.percentFrom52High || null,
        priceVs52WeekLow: trend.percentFrom52Low || null,
        dataSourceUsed: 'tradier',
        isPublic: true,
        visibility: 'public' as const
      };
      
      await db.insert(tradeIdeas).values(tradeIdea as any);
      recentTradeIdeas.set(symbol, now);
      ideasCreated++;
      
      logger.info(`[BULLISH] Created trade idea: ${symbol} LONG @ $${currentPrice.toFixed(2)} → $${targetPrice.toFixed(2)} [${grade} ${confidence}%]`);
      
    } catch (error) {
      logger.debug(`[BULLISH] Error creating trade idea for ${trend.symbol}`, { error });
    }
  }
  
  if (ideasCreated > 0) {
    logger.info(`[BULLISH] Generated ${ideasCreated} new trade ideas from momentum scan`);
  }
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
  
  // QUANTFLOOR restricted to announcements only - breakout alerts go to general URL
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
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
      // DISABLED: Individual breakout alerts spam Discord - use daily preview instead
      // sendBreakoutAlerts().catch(err =>
      //   logger.error('[BULLISH] Alert sending failed', { error: err })
      // );
    }
  }, 15 * 60 * 1000);
  
  logger.info('[BULLISH] Scanner started - scanning every 15 minutes during market hours (alerts disabled, use daily preview)');
}
