import type { AssetType } from "@shared/schema";
import { getTradierQuote, getTradierHistory } from './tradier-api';
import { logger } from './logger';
import { logAPIError, logAPISuccess } from './monitoring-service';

export interface ExternalMarketData {
  symbol: string;
  assetType: AssetType;
  currentPrice: number;
  changePercent: number;
  volume: number;
  avgVolume?: number;
  marketCap?: number;
  high24h?: number;
  low24h?: number;
}

const COINGECKO_API = "https://api.coingecko.com/api/v3";
const ALPHA_VANTAGE_API = "https://www.alphavantage.co/query";
const YAHOO_FINANCE_API = "https://query1.finance.yahoo.com/v8/finance/chart";

// Dynamic crypto symbol map with common coins pre-cached
const CRYPTO_SYMBOL_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  XRP: "ripple",
  SOL: "solana",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  LINK: "chainlink",
  UNI: "uniswap",
  AVAX: "avalanche-2",
  ATOM: "cosmos",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  ALGO: "algorand",
  XLM: "stellar",
  NEAR: "near",
  APT: "aptos",
  FIL: "filecoin",
  IMX: "immutable-x",
};

/**
 * Dynamically search CoinGecko for a crypto symbol and return the coin ID
 * Uses the highest market cap ranked result to avoid ambiguity
 */
async function searchCryptoSymbol(symbol: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${COINGECKO_API}/search?query=${symbol.toLowerCase()}`
    );

    if (!response.ok) {
      logger.warn(`CoinGecko search failed for ${symbol}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const coins = data.coins as Array<{
      id: string;
      symbol: string;
      name: string;
      market_cap_rank: number | null;
    }>;

    if (!coins || coins.length === 0) {
      logger.warn(`No CoinGecko results found for symbol: ${symbol}`);
      return null;
    }

    // Filter for exact symbol match (case-insensitive)
    const exactMatches = coins.filter(
      (coin) => coin.symbol.toLowerCase() === symbol.toLowerCase()
    );

    if (exactMatches.length === 0) {
      logger.warn(`No exact symbol match found for: ${symbol}`);
      return null;
    }

    // Sort by market cap rank (lower number = higher rank = more likely the right coin)
    // Filter out coins without rank and use the highest ranked one
    const rankedCoins = exactMatches
      .filter((coin) => coin.market_cap_rank !== null)
      .sort((a, b) => a.market_cap_rank! - b.market_cap_rank!);

    if (rankedCoins.length > 0) {
      const topCoin = rankedCoins[0];
      logger.info(`✅ Discovered crypto: ${symbol} → ${topCoin.id} (${topCoin.name}, rank #${topCoin.market_cap_rank})`);
      
      // Cache the result for future use
      CRYPTO_SYMBOL_MAP[symbol.toUpperCase()] = topCoin.id;
      
      return topCoin.id;
    }

    // If no ranked coins, use the first exact match as fallback
    const fallbackCoin = exactMatches[0];
    logger.info(`⚠️ Using unranked crypto: ${symbol} → ${fallbackCoin.id} (${fallbackCoin.name})`);
    CRYPTO_SYMBOL_MAP[symbol.toUpperCase()] = fallbackCoin.id;
    
    return fallbackCoin.id;
  } catch (error) {
    logger.error(`Error searching CoinGecko for ${symbol}:`, error);
    return null;
  }
}

export async function fetchCryptoPrice(symbol: string): Promise<ExternalMarketData | null> {
  const startTime = Date.now();
  try {
    // Try hardcoded map first (fast path for common coins)
    let coinId: string | undefined = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
    
    // If not in map, search dynamically
    if (!coinId) {
      logger.info(`Crypto ${symbol} not in cache, searching CoinGecko...`);
      const searchResult = await searchCryptoSymbol(symbol);
      
      if (!searchResult) {
        logger.warn(`❌ Could not find CoinGecko ID for symbol: ${symbol}`);
        return null;
      }
      
      coinId = searchResult;
    }

    const response = await fetch(
      `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
    );

    if (!response.ok) {
      logAPIError('CoinGecko', `/coins/${coinId}`, new Error(`HTTP ${response.status}`));
      return null;
    }

    const data = await response.json();
    const marketData = data.market_data;

    logAPISuccess('CoinGecko', `/coins/${coinId}`, Date.now() - startTime);

    return {
      symbol: symbol.toUpperCase(),
      assetType: "crypto",
      currentPrice: marketData.current_price.usd,
      changePercent: marketData.price_change_percentage_24h || 0,
      volume: marketData.total_volume.usd,
      marketCap: marketData.market_cap.usd,
      high24h: marketData.high_24h.usd,
      low24h: marketData.low_24h.usd,
    };
  } catch (error) {
    logger.error(`Error fetching crypto price for ${symbol}`, { error: error instanceof Error ? error.message : String(error) });
    logAPIError('CoinGecko', `/coins/${symbol}`, error);
    return null;
  }
}

export async function fetchYahooFinancePrice(
  symbol: string
): Promise<ExternalMarketData | null> {
  const startTime = Date.now();
  try {
    const response = await fetch(
      `${YAHOO_FINANCE_API}/${symbol}?interval=1d&range=1d`
    );

    if (!response.ok) {
      logAPIError('Yahoo Finance', `/chart/${symbol}`, new Error(`HTTP ${response.status}`));
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result || !result.meta) {
      logAPIError('Yahoo Finance', `/chart/${symbol}`, new Error('No data returned'));
      return null;
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const regularMarketPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const changePercent = previousClose 
      ? ((regularMarketPrice - previousClose) / previousClose) * 100 
      : 0;

    logAPISuccess('Yahoo Finance', `/chart/${symbol}`, Date.now() - startTime);

    return {
      symbol: symbol.toUpperCase(),
      assetType: "stock",
      currentPrice: regularMarketPrice,
      changePercent: changePercent,
      volume: quote?.volume?.[0] || meta.regularMarketVolume || 0,
      high24h: quote?.high?.[0] || meta.regularMarketDayHigh,
      low24h: quote?.low?.[0] || meta.regularMarketDayLow,
      marketCap: meta.marketCap,
    };
  } catch (error) {
    logger.error(`Error fetching Yahoo Finance price for ${symbol}:`, error);
    logAPIError('Yahoo Finance', `/chart/${symbol}`, error);
    return null;
  }
}

export async function fetchStockPrice(
  symbol: string,
  apiKey?: string
): Promise<ExternalMarketData | null> {
  // Try Tradier first (unlimited, real-time)
  const tradierKey = process.env.TRADIER_API_KEY;
  if (tradierKey) {
    try {
      const quote = await getTradierQuote(symbol, tradierKey);
      if (quote) {
        return {
          symbol: quote.symbol.toUpperCase(),
          assetType: "stock",
          currentPrice: quote.last,
          changePercent: quote.change_percentage,
          volume: quote.volume,
          avgVolume: quote.average_volume,
          high24h: quote.high,
          low24h: quote.low,
          marketCap: undefined, // Tradier doesn't provide market cap
        };
      }
    } catch (error) {
      logger.error(`Tradier quote error for ${symbol}, falling back:`, error);
    }
  }

  // Fallback to Alpha Vantage if available
  if (apiKey) {
    try {
      const response = await fetch(
        `${ALPHA_VANTAGE_API}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
      );

      if (!response.ok) {
        logger.info(`Alpha Vantage API error for ${symbol}, falling back to Yahoo Finance`);
        return await fetchYahooFinancePrice(symbol);
      }

      const data = await response.json();
      
      if (data.Information && data.Information.includes("rate limit")) {
        logger.info(`Alpha Vantage rate limit hit for ${symbol}, falling back to Yahoo Finance`);
        return await fetchYahooFinancePrice(symbol);
      }

      const quote = data["Global Quote"];

      if (!quote || !quote["05. price"]) {
        logger.info(`No Alpha Vantage data for ${symbol}, falling back to Yahoo Finance`);
        return await fetchYahooFinancePrice(symbol);
      }

      return {
        symbol: symbol.toUpperCase(),
        assetType: "stock",
        currentPrice: parseFloat(quote["05. price"]),
        changePercent: parseFloat(quote["10. change percent"].replace("%", "")),
        volume: parseInt(quote["06. volume"]),
        high24h: parseFloat(quote["03. high"]),
        low24h: parseFloat(quote["04. low"]),
      };
    } catch (error) {
      logger.error(`Error fetching stock price for ${symbol}:`, error);
      return await fetchYahooFinancePrice(symbol);
    }
  }

  return await fetchYahooFinancePrice(symbol);
}

export async function searchSymbol(
  symbol: string,
  alphaVantageKey?: string
): Promise<ExternalMarketData | null> {
  const upperSymbol = symbol.toUpperCase();

  if (CRYPTO_SYMBOL_MAP[upperSymbol]) {
    return await fetchCryptoPrice(upperSymbol);
  }

  // Always try stock price fetch - Tradier will be used if available, with fallbacks
  return await fetchStockPrice(upperSymbol, alphaVantageKey);
}

/**
 * Fetch historical daily prices from Yahoo Finance (UNLIMITED)
 * Returns array of closing prices from oldest to newest
 */
async function fetchYahooHistoricalPrices(
  symbol: string,
  periods: number = 60
): Promise<number[]> {
  try {
    // Calculate date range (periods days ago to today)
    const endDate = Math.floor(Date.now() / 1000);
    const startDate = endDate - (periods * 24 * 60 * 60);
    
    const response = await fetch(
      `${YAHOO_FINANCE_API}/${symbol}?interval=1d&period1=${startDate}&period2=${endDate}`
    );

    if (!response.ok) {
      logger.info(`Yahoo Finance historical data error for ${symbol}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      logger.info(`No Yahoo Finance historical data for ${symbol}`);
      return [];
    }

    // Extract closing prices (filter out null values)
    const closePrices = result.indicators.quote[0].close.filter((price: number | null) => price !== null);
    
    logger.info(`✅ Fetched ${closePrices.length} real historical prices for ${symbol} (Yahoo Finance)`);
    return closePrices;
  } catch (error) {
    logger.error(`Yahoo Finance historical error for ${symbol}:`, error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

export interface HiddenCryptoGem {
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  volumeSpike: boolean;
  priceGap: boolean;
  anomalyScore: number;
  coinId?: string;
  marketCapRank?: number;
}

/**
 * Fetch real historical daily prices for accurate technical analysis
 * Returns array of closing prices from oldest to newest
 */
export async function fetchHistoricalPrices(
  symbol: string,
  assetType: AssetType,
  periods: number = 60,
  apiKey?: string,
  coinId?: string  // Optional: Direct coinId for crypto (bypasses CRYPTO_SYMBOL_MAP lookup)
): Promise<number[]> {
  try {
    if (assetType === 'crypto') {
      // Fetch CoinGecko historical data
      // Use provided coinId if available (from discovery), otherwise lookup in map
      const resolvedCoinId = coinId || CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
      if (!resolvedCoinId) {
        logger.info(`No CoinGecko mapping for ${symbol}, using fallback`);
        return [];
      }

      const response = await fetch(
        `${COINGECKO_API}/coins/${resolvedCoinId}/market_chart?vs_currency=usd&days=${periods}&interval=daily`
      );

      if (!response.ok) {
        logger.info(`CoinGecko historical data error for ${symbol}`);
        return [];
      }

      const data = await response.json();
      // CoinGecko returns [timestamp, price] arrays
      const prices = data.prices.map((p: [number, number]) => p[1]);
      
      logger.info(`✅ Fetched ${prices.length} real historical prices for ${symbol} (crypto)`);
      return prices;
    }

    // Try Tradier first for stock historical data (unlimited)
    const tradierKey = process.env.TRADIER_API_KEY;
    if (tradierKey) {
      try {
        const prices = await getTradierHistory(symbol, periods, tradierKey);
        if (prices.length > 0) {
          logger.info(`✅ Fetched ${prices.length} real historical prices for ${symbol} (Tradier)`);
          return prices;
        }
      } catch (error) {
        logger.info(`Tradier error for ${symbol}, trying next source`);
      }
    }

    // Fallback to Alpha Vantage historical data for stocks
    if (apiKey) {
      try {
        const response = await fetch(
          `${ALPHA_VANTAGE_API}?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}&outputsize=compact`
        );

        if (response.ok) {
          const data = await response.json();

          // Check for rate limit or errors
          if (!data.Information && !data.Note) {
            const timeSeries = data["Time Series (Daily)"];
            if (timeSeries) {
              // Extract closing prices, sorted from oldest to newest
              const prices = Object.keys(timeSeries)
                .sort() // Sort dates chronologically (oldest first)
                .slice(-periods) // Take last N periods
                .map(date => parseFloat(timeSeries[date]["4. close"]));

              logger.info(`✅ Fetched ${prices.length} real historical prices for ${symbol} (Alpha Vantage)`);
              return prices;
            }
          } else {
            logger.info(`Alpha Vantage rate limit or error for ${symbol}: ${data.Information || data.Note}`);
          }
        }
      } catch (error) {
        logger.info(`Alpha Vantage error for ${symbol}, trying Yahoo Finance`);
      }
    }

    // Final fallback: Yahoo Finance (UNLIMITED, always available)
    logger.info(`Trying Yahoo Finance for ${symbol} historical data...`);
    return await fetchYahooHistoricalPrices(symbol, periods);
  } catch (error) {
    logger.error(`Error fetching historical prices for ${symbol}:`, error);
    return [];
  }
}

export async function discoverHiddenCryptoGems(limit: number = 10): Promise<HiddenCryptoGem[]> {
  try {
    const marketCapResponse = await fetch(
      `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=24h`
    );

    if (!marketCapResponse.ok) {
      logger.error("CoinGecko API error:", marketCapResponse.statusText);
      return [];
    }

    const allCoins = await marketCapResponse.json();

    const top20ByMarketCap = new Set(
      allCoins.slice(0, 20).map((coin: any) => coin.id)
    );

    // Map all coins and deduplicate by symbol (keep highest market cap for duplicate symbols)
    const gemsBySymbol = new Map<string, any>();
    
    allCoins.forEach((coin: any, marketCapRank: number) => {
      const marketCap = coin.market_cap || 0;
      const volume24h = coin.total_volume || 0;
      const priceChange = Math.abs(coin.price_change_percentage_24h || 0);
      
      const volumeToMarketCapRatio = marketCap > 0 ? volume24h / marketCap : 0;
      const highTurnover = volumeToMarketCapRatio > 0.10;
      const priceGap = priceChange >= 3.0;
      
      let anomalyScore = 0;
      if (priceGap) anomalyScore += 40;
      if (highTurnover) anomalyScore += 30;
      if (marketCapRank > 50 && marketCapRank <= 150) anomalyScore += 20;
      if (marketCapRank > 150) anomalyScore += 10;

      const gem = {
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        currentPrice: coin.current_price,
        marketCap: marketCap,
        volume24h: volume24h,
        priceChange24h: coin.price_change_percentage_24h || 0,
        volumeSpike: highTurnover,
        priceGap,
        anomalyScore,
        coinId: coin.id,
        marketCapRank: marketCapRank + 1,
      };
      
      // Deduplicate by symbol - keep highest market cap
      const existing = gemsBySymbol.get(gem.symbol);
      if (!existing || gem.marketCap > existing.marketCap) {
        gemsBySymbol.set(gem.symbol, gem);
      }
    });
    
    const hiddenGems: HiddenCryptoGem[] = Array.from(gemsBySymbol.values())
      .filter((gem: any) => 
        !top20ByMarketCap.has(gem.coinId) &&
        gem.marketCap >= 50_000_000 &&
        gem.marketCap <= 2_000_000_000 &&
        gem.volume24h >= 5_000_000 &&
        (gem.priceGap || gem.volumeSpike)
      )
      .sort((a: any, b: any) => b.anomalyScore - a.anomalyScore)
      .slice(0, limit);

    logger.info(`✅ Discovery: ${hiddenGems.length} hidden gems found (excluded top-20, required 3%+ move OR 10%+ turnover, $50M-$2B cap)`);
    
    return hiddenGems;
  } catch (error) {
    logger.error("Error discovering hidden crypto gems:", error);
    return [];
  }
}

// 🔍 PREDICTIVE STOCK SCANNER: Find stocks BEFORE big moves
// Strategy: Scan high-volume universe for early technical setups (unusual volume, RSI divergence, breakout patterns)
// NOT "top gainers" (reactive) - those already moved
interface StockGem {
  symbol: string;
  currentPrice: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  avgVolume?: number; // For volume ratio calculation
  dayHigh?: number;   // Intraday high to detect gap-and-fade
  dayLow?: number;    // Intraday low for reference
}

export async function discoverStockGems(limit: number = 30): Promise<StockGem[]> {
  const gems: StockGem[] = [];
  
  try {
    logger.info('🔍 PREDICTIVE SCAN: Finding stocks BEFORE big moves (high volume + small price changes)...');
    
    // REDESIGNED STRATEGY:
    // 1. Scan "most_actives" (high volume, but NOT necessarily big price moves)
    // 2. Scan "small_cap_gainers" (smaller stocks more likely to have explosive moves)
    // 3. Skip "top gainers/losers" (those already moved - we want to catch BEFORE the rally)
    // 4. Let quant engine filter for: unusual volume (3x+), small moves (<2%), RSI divergence
    const categories = [
      { name: 'mostActive', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=most_actives&count=250', retries: 3 },
      { name: 'smallCapsGainers', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=small_cap_gainers&count=100', retries: 3 },
      { name: 'undervalued', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=undervalued_growth_stocks&count=150', retries: 3 }
    ];
    
    for (const category of categories) {
      let attempt = 0;
      let success = false;
      
      while (attempt < category.retries && !success) {
        try {
          attempt++;
          
          // Add delay between retries (exponential backoff)
          if (attempt > 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000); // Max 8s delay
            logger.info(`  ⏳ Retry attempt ${attempt}/${category.retries} for ${category.name} after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          const response = await fetch(category.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          // Handle rate limiting
          if (response.status === 429) {
            logger.info(`⚠️  Yahoo ${category.name} rate limited (429) - will retry`);
            continue; // Try again with backoff
          }
          
          if (!response.ok) {
            logger.info(`⚠️  Yahoo ${category.name} endpoint returned ${response.status}`);
            break; // Don't retry on other errors
          }
          
          const data = await response.json();
          const quotes = data?.finance?.result?.[0]?.quotes || [];
          
          logger.info(`  ✓ Found ${quotes.length} stocks in ${category.name}`);
          success = true;
          
          for (const quote of quotes) {
            // Filter criteria: 
            // - Price > $1 (avoid sub-dollar micro-caps, but include $1-$5 penny stocks)
            // - Price < $500 (avoid expensive stocks that are hard to trade)
            // - Volume exists
            // - Market cap varies: $10M+ for penny stocks, $50M+ for regular stocks
            const price = quote.regularMarketPrice?.raw || quote.regularMarketPrice;
            const change = quote.regularMarketChangePercent?.raw || quote.regularMarketChangePercent || 0;
            const volume = quote.regularMarketVolume?.raw || quote.regularMarketVolume || 0;
            const avgVolume = quote.averageDailyVolume3Month?.raw || quote.averageDailyVolume3Month;
            const marketCap = quote.marketCap?.raw || quote.marketCap || 0;
            const dayHigh = quote.regularMarketDayHigh?.raw || quote.regularMarketDayHigh;
            const dayLow = quote.regularMarketDayLow?.raw || quote.regularMarketDayLow;
            
            if (!price || price < 1 || price > 500) continue;
            if (volume < 100000) continue; // Minimum 100K volume
            // Relax market cap filter for penny stocks ($1-$5) - allow smaller caps
            if (price >= 5 && marketCap < 50_000_000) continue; // Regular stocks need $50M+ cap
            if (price < 5 && marketCap < 10_000_000) continue; // Penny stocks need $10M+ cap
            
            gems.push({
              symbol: quote.symbol,
              currentPrice: price,
              changePercent: change,
              volume: volume,
              marketCap: marketCap,
              avgVolume: avgVolume,
              dayHigh: dayHigh,
              dayLow: dayLow
            });
          }
        } catch (error) {
          logger.info(`  ⚠️  Failed to fetch ${category.name} (attempt ${attempt}):`, error instanceof Error ? error.message : 'Unknown error');
          if (attempt >= category.retries) {
            break; // Give up after max retries
          }
        }
      }
    }
    
    // Remove duplicates (same symbol might appear in multiple categories)
    const uniqueGems = new Map<string, StockGem>();
    gems.forEach(gem => {
      if (!uniqueGems.has(gem.symbol)) {
        uniqueGems.set(gem.symbol, gem);
      }
    });
    
    // ADAPTIVE DISCOVERY: Wide net captures multiple momentum phases
    // Strategy: Let quant engine decide entry timing, discovery just finds unusual volume + healthy price action
    const sortedGems = Array.from(uniqueGems.values())
      .filter(gem => {
        // DATA QUALITY FILTERS: Require day high (critical for gap-fade detection)
        // More lenient with avgVolume (use current volume as proxy if missing)
        if (!gem.dayHigh || gem.dayHigh === 0) {
          return false; // Can't detect gap-and-fade without intraday high
        }
        
        // Use avgVolume if available, otherwise use current volume (less accurate but usable)
        const effectiveAvgVolume = gem.avgVolume && gem.avgVolume > 0 ? gem.avgVolume : gem.volume;
        const volumeRatio = gem.volume / effectiveAvgVolume;
        
        // CORE FILTERS: Unusual volume + healthy price action
        // RELAXED from 3x to 2x volume (catch more opportunities)
        const hasUnusualVolume = volumeRatio >= 2.0;           // 2x+ average volume (above-average interest)
        const isBullish = gem.changePercent >= 0;               // Only bullish (exclude selloffs)
        const notTooLate = gem.changePercent < 15.0;           // Skip stocks that already rallied >15% (was 10%, now more lenient)
        
        // GAP-AND-FADE FILTER: Price must be within 10% of day high
        // RELAXED from 95% to 90% (allow stocks with minor pullbacks)
        const nearDayHigh = (gem.currentPrice / gem.dayHigh) >= 0.90;
        
        // ADAPTIVE APPROACH: Accept 0-10% bullish moves, let quant engine decide strategy
        // - 0-2%: Early accumulation (RSI, MACD)
        // - 2-5%: Breakout phase (MACD, volume spike)
        // - 5-10%: Strong momentum (5x+ volume required)
        // - Rejected: Stock that gapped +15%, faded to +4% (currentPrice/dayHigh < 95%)
        // - Rejected: Stock with -2% = selloff (bearish)
        // - Rejected: Stock missing dayHigh = can't verify gap-and-fade
        return hasUnusualVolume && isBullish && notTooLate && nearDayHigh;
      })
      .map(gem => {
        // Use avgVolume if available, otherwise use current volume (same as filter)
        const effectiveAvgVolume = gem.avgVolume && gem.avgVolume > 0 ? gem.avgVolume : gem.volume;
        const volumeRatio = gem.volume / effectiveAvgVolume;
        
        // BALANCED SCORING: All phases get competitive scores
        let score = 0;
        
        // Volume component (0-60 points): Higher volume = better (all phases)
        if (volumeRatio >= 5) score += 60;
        else if (volumeRatio >= 4) score += 55;
        else if (volumeRatio >= 3) score += 50;
        
        // Price change component (0-40 points): Balanced across phases
        // Early accumulation (0-2%): Slight preference (38-40 points)
        if (gem.changePercent < 0.5) score += 40;
        else if (gem.changePercent < 1.0) score += 39;
        else if (gem.changePercent < 1.5) score += 39;
        else if (gem.changePercent < 2.0) score += 38;
        // Breakout phase (2-5%): Competitive score (35-37 points)
        else if (gem.changePercent < 3.0) score += 37;
        else if (gem.changePercent < 4.0) score += 36;
        else if (gem.changePercent < 5.0) score += 35;
        // Strong momentum (5-10%): Still competitive (32-34 points)
        else if (gem.changePercent < 7.0) score += 34;
        else if (gem.changePercent < 10.0) score += 32;
        
        return { ...gem, volumeRatio, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    const totalScanned = uniqueGems.size;
    const passedFilters = sortedGems.length;
    const rejectionRate = totalScanned > 0 ? ((totalScanned - passedFilters) / totalScanned * 100).toFixed(1) : '0.0';
    
    logger.info(`🎯 PREDICTIVE SCAN: ${passedFilters}/${totalScanned} stocks passed filters (${rejectionRate}% rejected)`);
    if (passedFilters > 0) {
      logger.info(`   Top 5: ${sortedGems.slice(0, 5).map(g => `${g.symbol} (+${g.changePercent.toFixed(1)}%, ${g.volumeRatio?.toFixed(1)}x vol, ${((g.currentPrice / g.dayHigh!) * 100).toFixed(1)}% of high)`).join(', ')}`);
    }
    
    return sortedGems;
  } catch (error) {
    logger.error('❌ Stock discovery error:', error);
    return [];
  }
}

// 💎 PENNY STOCK DISCOVERY: Find high-volume penny stocks ($1-$5 range)
// Yahoo screeners don't return penny stocks, so we maintain a curated watchlist
export async function discoverPennyStocks(): Promise<StockGem[]> {
  try {
    logger.info('🔍 Discovering popular stocks ($1-$50 range - penny stocks + retail favorites)...');
    
    // Expanded stock watchlist - popular retail/swing trading stocks
    // Includes penny stocks ($1-$7) AND popular mid-cap stocks ($7-$50)
    const pennyStockSymbols = [
      // Major stocks currently under $7 (high liquidity penny stocks)
      'AAL', 'NOK', 'F', 'SNAP', 'CCL', 'NCLH',
      // Tech & EV sector
      'FUBO', 'GSAT', 'BB',
      // Healthcare
      'SNDL', 'MNKD', 'OCGN', 'BNGO',
      // Energy & Resources
      'BTU', 'KGC', 'VALE',
      // Financial
      'UWMC', 'PBF',
      // User-requested penny stocks
      'VSEE', 'XHLD',
      // Popular retail/swing stocks ($7-$50 range)
      'SOFI', 'PLTR', 'NIO', 'RIVN', 'LCID', 'AMC', 'GME',
      'HOOD', 'DKNG', 'OPEN', 'UPST', 'ROKU',
      // Mega-cap tech (news-driven - NVDA $5T, AAPL/MSFT $4T)
      'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'TSLA',
      // High-volume tech & crypto stocks
      'INTC', 'AMD', 'MARA', 'RIOT', 'COIN',
      // Earnings/news movers
      'UPS', 'CVS', 'UNH'
    ];
    
    const pennyStocks: StockGem[] = [];
    
    // Fetch current prices for penny stock candidates
    for (const symbol of pennyStockSymbols) {
      try {
        const priceData = await fetchStockPrice(symbol);
        if (!priceData) continue;
        
        const price = priceData.currentPrice;
        const change = priceData.changePercent || 0;
        const volume = priceData.volume || 0;
        const marketCap = priceData.marketCap || 0;
        
        // Filter: Must be $1-$50 (expanded to include popular swing trading stocks)
        // Minimum volume 100K for liquidity, min market cap $10M to avoid scams
        if (price >= 1 && price <= 50 && volume >= 100000 && marketCap >= 10_000_000) {
          pennyStocks.push({
            symbol,
            currentPrice: price,
            changePercent: change,
            volume,
            marketCap
          });
        }
      } catch (error) {
        // Skip this symbol if fetch fails
        continue;
      }
    }
    
    // Sort by volume (higher volume = more liquid)
    const sortedPennyStocks = pennyStocks
      .sort((a, b) => b.volume - a.volume);
    
    logger.info(`💎 Discovered ${sortedPennyStocks.length} popular stocks: ${sortedPennyStocks.slice(0, 10).map(g => `${g.symbol} ($${g.currentPrice.toFixed(2)})`).join(', ')}${sortedPennyStocks.length > 10 ? '...' : ''}`);
    
    return sortedPennyStocks.slice(0, 30); // Return top 30 by volume
  } catch (error) {
    logger.error('❌ Penny stock discovery error:', error);
    return [];
  }
}

/**
 * Earnings event data from Alpha Vantage
 */
export interface EarningsEvent {
  symbol: string;
  name: string;
  reportDate: string; // YYYY-MM-DD format
  fiscalDateEnding: string;
  estimate: number | null; // Analyst consensus EPS estimate
  currency: string;
}

/**
 * Fetch upcoming earnings calendar from Alpha Vantage
 * Returns earnings events for the next 3 months
 */
export async function fetchEarningsCalendar(horizon: '3month' | '6month' | '12month' = '3month'): Promise<EarningsEvent[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  
  if (!apiKey) {
    logger.warn('⚠️ No Alpha Vantage API key - earnings calendar unavailable');
    return [];
  }

  try {
    const url = `${ALPHA_VANTAGE_API}?function=EARNINGS_CALENDAR&horizon=${horizon}&apikey=${apiKey}`;
    
    logger.info(`📅 Fetching earnings calendar (${horizon})...`);
    const response = await fetch(url);
    
    if (!response.ok) {
      logger.error(`❌ Alpha Vantage earnings API error: HTTP ${response.status}`);
      return [];
    }

    const csvText = await response.text();
    
    // Check for rate limit
    if (csvText.includes('rate limit') || csvText.includes('premium endpoint')) {
      logger.warn('⚠️ Alpha Vantage rate limit or premium endpoint - earnings unavailable');
      return [];
    }

    // Parse CSV manually (Alpha Vantage returns CSV, not JSON)
    const lines = csvText.trim().split('\n');
    
    if (lines.length < 2) {
      logger.warn('⚠️ No earnings data returned from Alpha Vantage');
      return [];
    }

    // First line is header: symbol,name,reportDate,fiscalDateEnding,estimate,currency
    const header = lines[0].split(',');
    const symbolIdx = header.indexOf('symbol');
    const nameIdx = header.indexOf('name');
    const reportDateIdx = header.indexOf('reportDate');
    const fiscalDateIdx = header.indexOf('fiscalDateEnding');
    const estimateIdx = header.indexOf('estimate');
    const currencyIdx = header.indexOf('currency');

    const earnings: EarningsEvent[] = [];
    
    // Parse each row (skip header)
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      
      if (row.length < 6) continue; // Skip malformed rows
      
      const symbol = row[symbolIdx]?.trim();
      const reportDate = row[reportDateIdx]?.trim();
      
      if (!symbol || !reportDate) continue;
      
      earnings.push({
        symbol,
        name: row[nameIdx]?.trim() || symbol,
        reportDate,
        fiscalDateEnding: row[fiscalDateIdx]?.trim() || reportDate,
        estimate: row[estimateIdx] ? parseFloat(row[estimateIdx]) : null,
        currency: row[currencyIdx]?.trim() || 'USD',
      });
    }

    logger.info(`✅ Found ${earnings.length} upcoming earnings events`);
    logAPISuccess('AlphaVantage', 'earnings_calendar');
    
    return earnings;
  } catch (error) {
    logger.error('❌ Error fetching earnings calendar:', error);
    logAPIError('AlphaVantage', 'earnings_calendar', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Get earnings for specific symbols only
 */
export async function fetchSymbolEarnings(symbols: string[]): Promise<Map<string, EarningsEvent>> {
  const allEarnings = await fetchEarningsCalendar('3month');
  const symbolSet = new Set(symbols.map(s => s.toUpperCase()));
  
  const filtered = allEarnings.filter(e => symbolSet.has(e.symbol));
  
  const earningsMap = new Map<string, EarningsEvent>();
  filtered.forEach(e => earningsMap.set(e.symbol, e));
  
  return earningsMap;
}
