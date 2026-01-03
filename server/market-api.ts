import type { AssetType } from "@shared/schema";
import { getTradierQuote, getTradierHistory } from './tradier-api';
import { logger } from './logger';
import { logAPIError, logAPISuccess } from './monitoring-service';
import { getCryptoPrice as getRealtimeCryptoPrice, getFuturesPrice as getRealtimeFuturesPrice } from './realtime-price-service';

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

// Fallback cache for crypto prices when rate limited (stores last known good prices)
const cryptoPriceCache = new Map<string, { data: ExternalMarketData; timestamp: number }>();
const CRYPTO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for normal operations
const CRYPTO_FALLBACK_CACHE_TTL = 30 * 60 * 1000; // 30 minutes when rate limited (extended fallback)

// Yahoo Finance crypto symbols for backup data source
const YAHOO_CRYPTO_MAP: Record<string, string> = {
  'BTC': 'BTC-USD', 'ETH': 'ETH-USD', 'SOL': 'SOL-USD', 'BNB': 'BNB-USD',
  'XRP': 'XRP-USD', 'ADA': 'ADA-USD', 'DOGE': 'DOGE-USD', 'DOT': 'DOT-USD',
  'AVAX': 'AVAX-USD', 'LINK': 'LINK-USD', 'MATIC': 'MATIC-USD', 'SHIB': 'SHIB-USD',
  'LTC': 'LTC-USD', 'UNI': 'UNI-USD', 'AAVE': 'AAVE-USD', 'ATOM': 'ATOM-USD',
  'NEAR': 'NEAR-USD', 'APT': 'APT-USD', 'FIL': 'FIL-USD', 'INJ': 'INJ-USD'
};

// Track CoinGecko rate limit status
let coinGeckoRateLimited = false;
let rateLimitResetTime = 0;

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
  const upperSymbol = symbol.toUpperCase();
  
  // PRIORITY 1: Try real-time Coinbase WebSocket price (sub-second latency)
  const realtimePrice = getRealtimeCryptoPrice(upperSymbol);
  if (realtimePrice) {
    const ageMs = Date.now() - realtimePrice.timestamp.getTime();
    logger.debug(`[CRYPTO-RT] ${symbol}: $${realtimePrice.price} (${ageMs}ms old, source: ${realtimePrice.source})`);
    
    // Use real-time price with cached market data for other fields
    const cached = cryptoPriceCache.get(upperSymbol);
    return {
      symbol: upperSymbol,
      assetType: 'crypto',
      currentPrice: realtimePrice.price,
      changePercent: cached?.data.changePercent || 0,
      volume: cached?.data.volume || 0,
      marketCap: cached?.data.marketCap,
      high24h: cached?.data.high24h,
      low24h: cached?.data.low24h,
    };
  }
  
  // Check if rate limit window has expired - reset flag if so
  if (coinGeckoRateLimited && Date.now() >= rateLimitResetTime) {
    coinGeckoRateLimited = false;
    logger.info('[CRYPTO] CoinGecko rate limit window expired, resuming normal requests');
  }
  
  // Check if we're still rate limited - use extended cache TTL and Yahoo fallback
  if (coinGeckoRateLimited) {
    // Try extended cache first (30 min instead of 5 min when rate limited)
    const cached = cryptoPriceCache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < CRYPTO_FALLBACK_CACHE_TTL) {
      logger.debug(`[CRYPTO] Using cached price for ${symbol} (rate limited): $${cached.data.currentPrice}`);
      return cached.data;
    }
    // Try Yahoo Finance as backup for major cryptos
    const yahooResult = await fetchCryptoPriceFromYahoo(symbol);
    if (yahooResult) {
      logger.info(`[CRYPTO] Using Yahoo backup for ${symbol} (CoinGecko rate limited)`);
      return yahooResult;
    }
    // If Yahoo also fails, still try CoinGecko (might be back online)
    logger.info(`[CRYPTO] Yahoo fallback unavailable for ${symbol}, attempting CoinGecko anyway`);
  }
  
  try {
    // Try hardcoded map first (fast path for common coins)
    let coinId: string | undefined = CRYPTO_SYMBOL_MAP[upperSymbol];
    
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

    // Handle rate limiting with backoff
    if (response.status === 429) {
      coinGeckoRateLimited = true;
      rateLimitResetTime = Date.now() + 60 * 1000; // Wait 60 seconds before trying again
      logger.warn(`[CRYPTO] CoinGecko rate limited, backing off for 60s`);
      
      // Return cached data if available (use extended TTL when rate limited)
      const cached = cryptoPriceCache.get(upperSymbol);
      if (cached && Date.now() - cached.timestamp < CRYPTO_FALLBACK_CACHE_TTL) {
        logger.info(`[CRYPTO] Returning cached price for ${symbol}: $${cached.data.currentPrice} (${Math.floor((Date.now() - cached.timestamp) / 1000)}s old)`);
        return cached.data;
      }
      
      // Try Yahoo Finance as backup for major cryptos
      const yahooBackup = await fetchCryptoPriceFromYahoo(symbol);
      if (yahooBackup) {
        logger.info(`[CRYPTO] Using Yahoo backup for ${symbol} after rate limit`);
        return yahooBackup;
      }
      
      logAPIError('CoinGecko', `/coins/${coinId}`, new Error('HTTP 429 - Rate Limited'));
      return null;
    }

    if (!response.ok) {
      logAPIError('CoinGecko', `/coins/${coinId}`, new Error(`HTTP ${response.status}`));
      return null;
    }

    // Reset rate limit flag on successful request
    coinGeckoRateLimited = false;

    const data = await response.json();
    const marketData = data.market_data;

    logAPISuccess('CoinGecko', `/coins/${coinId}`, Date.now() - startTime);

    const result: ExternalMarketData = {
      symbol: upperSymbol,
      assetType: "crypto",
      currentPrice: marketData.current_price.usd,
      changePercent: marketData.price_change_percentage_24h || 0,
      volume: marketData.total_volume.usd,
      marketCap: marketData.market_cap.usd,
      high24h: marketData.high_24h.usd,
      low24h: marketData.low_24h.usd,
    };
    
    // Cache the successful result for fallback
    cryptoPriceCache.set(upperSymbol, { data: result, timestamp: Date.now() });
    
    return result;
  } catch (error) {
    logger.error(`Error fetching crypto price for ${symbol}`, { error: error instanceof Error ? error.message : String(error) });
    logAPIError('CoinGecko', `/coins/${symbol}`, error);
    
    // Try to return cached data on error (use extended TTL)
    const cached = cryptoPriceCache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < CRYPTO_FALLBACK_CACHE_TTL) {
      logger.info(`[CRYPTO] Returning cached price for ${symbol} after error: $${cached.data.currentPrice}`);
      return cached.data;
    }
    
    // Last resort: try Yahoo Finance for major cryptos
    const yahooFallback = await fetchCryptoPriceFromYahoo(symbol);
    if (yahooFallback) return yahooFallback;
    
    return null;
  }
}

// Yahoo Finance backup for crypto when CoinGecko is rate limited
export async function fetchCryptoPriceFromYahoo(symbol: string): Promise<ExternalMarketData | null> {
  const upperSymbol = symbol.toUpperCase();
  const yahooSymbol = YAHOO_CRYPTO_MAP[upperSymbol];
  if (!yahooSymbol) return null;
  
  try {
    const response = await fetch(`${YAHOO_FINANCE_API}/${yahooSymbol}?interval=1d&range=1d`);
    if (!response.ok) return null;
    
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result?.meta) return null;
    
    const meta = result.meta;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const changePercent = previousClose 
      ? ((meta.regularMarketPrice - previousClose) / previousClose) * 100 
      : 0;
    
    const marketData: ExternalMarketData = {
      symbol: upperSymbol,
      assetType: 'crypto',
      currentPrice: meta.regularMarketPrice,
      changePercent,
      volume: meta.regularMarketVolume || 0,
      high24h: meta.regularMarketDayHigh,
      low24h: meta.regularMarketDayLow,
    };
    
    // Cache this result too for future fallback
    cryptoPriceCache.set(upperSymbol, { data: marketData, timestamp: Date.now() });
    logger.info(`[CRYPTO-YAHOO] Backup fetch ${symbol}: $${marketData.currentPrice.toFixed(2)}`);
    
    return marketData;
  } catch (error) {
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
        const errorText = await response.text().catch(() => 'Unable to read error');
        logger.warn(`CoinGecko historical data error for ${symbol}: HTTP ${response.status} - ${errorText.substring(0, 200)}`);
        
        // Check for specific error types
        if (response.status === 429) {
          logger.error(`🚨 CoinGecko Rate Limit Hit - ${symbol}`);
        } else if (response.status === 403) {
          logger.error(`🚨 CoinGecko Access Forbidden - ${symbol} - Check API key/permissions`);
        } else if (response.status === 404) {
          logger.warn(`⚠️  CoinGecko Coin Not Found - ${symbol} (coinId: ${resolvedCoinId})`);
        }
        
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
    // 3. Scan "aggressive_small_caps" for high-risk/high-reward plays
    // 4. Scan "growth_technology_stocks" for tech momentum plays
    // 5. Skip "top gainers/losers" (those already moved - we want to catch BEFORE the rally)
    // 6. Let quant engine filter for: unusual volume (3x+), small moves (<2%), RSI divergence
    const categories = [
      { name: 'mostActive', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=most_actives&count=250', retries: 3 },
      { name: 'smallCapsGainers', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=small_cap_gainers&count=100', retries: 3 },
      { name: 'undervalued', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=undervalued_growth_stocks&count=150', retries: 3 },
      { name: 'aggressiveSmallCaps', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=aggressive_small_caps&count=100', retries: 2 },
      { name: 'growthTech', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=growth_technology_stocks&count=100', retries: 2 },
      { name: 'dayGainers', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=day_gainers&count=50', retries: 2 }
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
    
    // EXPANDED NICHE STOCK UNIVERSE - Hidden gems + lesser-known opportunities
    // Includes penny stocks ($1-$7), niche small caps, and sector plays
    const pennyStockSymbols = [
      // === NICHE PENNY STOCKS (Under $7) ===
      // ========================================
      // === NEXT BIG THINGS: QUANTUM + FUSION ===
      // ========================================
      
      // 🔬 QUANTUM COMPUTING (THE #1 NEXT BIG THING)
      'IONQ',   // IonQ - Leading trapped ion quantum
      'RGTI',   // Rigetti Computing - Superconducting qubits  
      'QUBT',   // Quantum Computing Inc - Photonic quantum
      'QBTS',   // D-Wave Quantum - Quantum annealing leader
      'ARQQ',   // Arqit Quantum - Quantum encryption/cybersecurity
      'QTUM',   // Defiance Quantum ETF - Quantum basket
      'FORM',   // FormFactor - Quantum probe cards
      'IBM',    // IBM - Quantum roadmap leader (large cap exposure)
      'GOOG',   // Google/Alphabet - Sycamore processor
      'HON',    // Honeywell - Quantinuum (spun off but HON exposure)
      
      // ⚛️ NUCLEAR FUSION & ADVANCED NUCLEAR (THE #2 NEXT BIG THING)
      'NNE',    // Nano Nuclear Energy - Micro modular reactors
      'OKLO',   // Oklo Inc - Advanced fission/fusion tech
      'SMR',    // NuScale Power - Small modular reactors
      'LEU',    // Centrus Energy - Uranium enrichment, HALEU for fusion
      'CCJ',    // Cameco - Uranium mining leader
      'UEC',    // Uranium Energy Corp - US uranium producer
      'URA',    // Global X Uranium ETF
      'UUUU',   // Energy Fuels - Uranium + rare earths
      'DNN',    // Denison Mines - Uranium developer
      'NXE',    // NexGen Energy - High-grade uranium
      'BWXT',   // BWX Technologies - Nuclear components
      'CEG',    // Constellation Energy - Nuclear fleet operator
      'VST',    // Vistra - Nuclear power generation
      
      // 🤖 AI & MACHINE LEARNING (CURRENT BIG THING)
      'SOUN',   // SoundHound AI - Voice AI
      'BBAI',   // BigBear.ai - AI analytics
      'AI',     // C3.ai - Enterprise AI
      'PLTR',   // Palantir - AI/data analytics
      'PATH',   // UiPath - AI automation
      'SNOW',   // Snowflake - AI data cloud
      'DDOG',   // Datadog - AI observability
      'MDB',    // MongoDB - AI database
      'ESTC',   // Elastic - AI search
      'GTLB',   // GitLab - AI DevOps
      
      // 🚀 SPACE & SATELLITE TECH
      'ASTS',   // AST SpaceMobile - Space-based cellular
      'SPCE',   // Virgin Galactic - Space tourism
      'RKLB',   // Rocket Lab - Small satellite launch
      'LUNR',   // Intuitive Machines - Lunar landers
      'RDW',    // Redwire - Space infrastructure
      'BKSY',   // BlackSky - Geospatial intelligence
      'IRDM',   // Iridium - Satellite communications
      'VSAT',   // Viasat - Satellite internet
      'SATL',   // Satellogic - Earth observation
      // REMOVED: MAXR (acquired), LLAP (delisted)
      
      // 🧬 BIOTECH/PHARMA (CATALYST-DRIVEN)
      'NVAX',   // Novavax - Vaccines
      'INO',    // Inovio - DNA medicines
      'SRNE',   // Sorrento Therapeutics
      'VXRT',   // Vaxart - Oral vaccines
      'CRSP',   // CRISPR Therapeutics - Gene editing
      'EDIT',   // Editas Medicine - Gene editing
      'NTLA',   // Intellia Therapeutics - CRISPR
      'BEAM',   // Beam Therapeutics - Base editing
      // REMOVED: VERV (delisted), BLUE (delisted)
      
      // ⚡ CLEAN ENERGY & EV
      'FCEL',   // FuelCell Energy
      'PLUG',   // Plug Power - Green hydrogen
      'BE',     // Bloom Energy - Solid oxide fuel cells
      'CHPT',   // ChargePoint - EV charging
      'BLNK',   // Blink Charging
      'EVGO',   // EVgo - Fast charging
      // REMOVED: PTRA (bankrupt/delisted)
      'ENVX',   // Enovix - Next-gen batteries
      'QS',     // QuantumScape - Solid-state batteries
      'STEM',   // Stem Inc - AI energy storage
      'RUN',    // Sunrun - Residential solar
      'SEDG',   // SolarEdge - Solar inverters
      'ENPH',   // Enphase - Microinverters
      
      // 🚗 EV & AUTONOMOUS VEHICLES
      'RIVN',   // Rivian - Electric trucks
      'LCID',   // Lucid - Luxury EV
      'NIO',    // NIO - Chinese premium EV
      'XPEV',   // XPeng - Chinese EV
      'LI',     // Li Auto - Chinese hybrid EV
      // REMOVED: FSR (bankrupt), FFIE (delisted), GOEV (delisted)
      'NKLA',   // Nikola - Hydrogen trucks
      'TSLA',   // Tesla - EV + AI + Energy
      
      // 🛡️ DEFENSE & DRONES
      'RCAT',   // Red Cat Holdings - Drones
      'UAVS',   // AgEagle Aerial - Drone tech
      'JOBY',   // Joby Aviation - eVTOL
      'ACHR',   // Archer Aviation - eVTOL
      'EVTL',   // Vertical Aerospace - eVTOL
      'KTOS',   // Kratos Defense - Drones
      'AVAV',   // AeroVironment - Military drones
      'AMBA',   // Ambarella - AI vision processors
      
      // 💰 CRYPTO/BLOCKCHAIN
      'MARA',   // Marathon Digital - BTC mining
      'RIOT',   // Riot Platforms - BTC mining
      'CLSK',   // CleanSpark - BTC mining
      'BTBT',   // Bit Digital
      'BITF',   // Bitfarms
      'HUT',    // Hut 8 Mining
      'CIFR',   // Cipher Mining
      'COIN',   // Coinbase - Crypto exchange
      'MSTR',   // MicroStrategy - BTC treasury
      
      // 🔐 CYBERSECURITY
      'CRWD',   // CrowdStrike
      'S',      // SentinelOne
      'ZS',     // Zscaler
      'NET',    // Cloudflare
      'PANW',   // Palo Alto Networks
      'TENB',   // Tenable
      'CYBR',   // CyberArk
      'OKTA',   // Okta - Identity
      'FTNT',   // Fortinet
      
      // 💳 FINTECH
      'UPST',   // Upstart - AI lending
      'AFRM',   // Affirm - BNPL
      'SOFI',   // SoFi - Digital banking
      'DAVE',   // Dave - Neobank
      'HOOD',   // Robinhood - Trading app
      'XYZ',    // Block (formerly Square) - Payments
      'PYPL',   // PayPal
      'NU',     // Nu Holdings - Brazilian fintech
      
      // 🎮 GAMING & METAVERSE
      'RBLX',   // Roblox
      'U',      // Unity Software
      'DKNG',   // DraftKings
      'SKLZ',   // Skillz
      
      // 🌿 CANNABIS
      'TLRY',   // Tilray
      'CGC',    // Canopy Growth
      'ACB',    // Aurora Cannabis
      'SNDL',   // SNDL
      
      // 💎 SEMICONDUCTORS (NON MEGA-CAP)
      'SMCI',   // Super Micro Computer
      'AEHR',   // Aehr Test Systems
      'WOLF',   // Wolfspeed - SiC
      'LSCC',   // Lattice Semiconductor
      'SITM',   // SiTime - Timing solutions
      'ARM',    // Arm Holdings
      'AVGO',   // Broadcom
      'MU',     // Micron
      
      // 🌏 INTERNATIONAL ADRs
      'GRAB',   // Grab Holdings - SE Asia super app
      'SE',     // Sea Limited - SE Asia tech
      'BABA',   // Alibaba
      'PDD',    // PDD Holdings
      'JD',     // JD.com
      'BIDU',   // Baidu - Chinese AI
      'MELI',   // MercadoLibre - LatAm e-commerce
      
      // 📺 STREAMING/MEDIA
      'FUBO',   // FuboTV
      // REMOVED: PARA (merged/delisted)
      'WBD',    // Warner Bros Discovery
      
      // ✈️ TRAVEL/LEISURE (HIGH BETA)
      'AAL',    // American Airlines
      'CCL',    // Carnival Cruise
      'NCLH',   // Norwegian Cruise
      'UAL',    // United Airlines
      'DAL',    // Delta Airlines
      
      // 🏠 REAL ESTATE TECH
      'OPEN',   // Opendoor
      'Z',      // Zillow
      // REMOVED: RDFN (delisted)
      
      // 📱 TECH RETAIL FAVORITES
      'F',      // Ford
      'NOK',    // Nokia
      'BB',     // BlackBerry
      'SNAP',   // Snapchat
      'AMC',    // AMC Entertainment
      'GME',    // GameStop
      
      // 🏛️ MEGA-CAP TECH (NEWS-DRIVEN)
      'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN',
      'INTC', 'AMD', 'ROKU',
      
      // ⛏️ COMMODITIES/MATERIALS
      'BTU',    // Peabody Energy - Coal
      'KGC',    // Kinross Gold
      'VALE',   // Vale - Mining
      'PBF',    // PBF Energy
      'GOLD',   // Barrick Gold
      'NEM',    // Newmont Mining
      'FCX',    // Freeport-McMoRan - Copper
      'MP',     // MP Materials - Rare earths
      'LAC',    // Lithium Americas
      'ALB'     // Albemarle - Lithium
    ];
    
    const pennyStocks: StockGem[] = [];
    
    // Fetch current prices for penny stock candidates
    for (const symbol of pennyStockSymbols) {
      try {
        const priceData = await fetchStockPrice(symbol);
        if (!priceData) continue;
        
        const price = priceData.currentPrice;
        const change = priceData.changePercent || 0;
        // Use avgVolume as fallback when current volume is 0 (off-hours)
        const volume = priceData.volume || priceData.avgVolume || 0;
        const avgVolume = priceData.avgVolume || 0;
        const marketCap = priceData.marketCap || 0;
        
        // Filter: Must be $0.50-$500 (expanded to include all actionable stocks)
        // Use avgVolume threshold during off-hours when volume is 0
        // Make marketCap optional - many stocks don't report it
        const volumeOk = volume >= 50000 || avgVolume >= 50000;
        const priceOk = price >= 0.50 && price <= 500;
        // Skip marketCap filter if not available (focus on volume/price)
        if (priceOk && volumeOk) {
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
    
    return sortedPennyStocks.slice(0, 50); // Return top 50 by volume (expanded universe)
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

// ============================================
// FUTURES DATA - 24-hour trading
// ============================================

export interface FuturesQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  session: 'pre' | 'rth' | 'post' | 'overnight' | 'closed';
  lastUpdate: string;
}

// Yahoo Finance futures symbols
const FUTURES_SYMBOLS: Record<string, { yahoo: string; name: string; tickSize: number; pointValue: number }> = {
  'ES': { yahoo: 'ES=F', name: 'E-mini S&P 500', tickSize: 0.25, pointValue: 50 },
  'NQ': { yahoo: 'NQ=F', name: 'E-mini Nasdaq-100', tickSize: 0.25, pointValue: 20 },
  'YM': { yahoo: 'YM=F', name: 'E-mini Dow', tickSize: 1, pointValue: 5 },
  'RTY': { yahoo: 'RTY=F', name: 'E-mini Russell 2000', tickSize: 0.1, pointValue: 50 },
  'GC': { yahoo: 'GC=F', name: 'Gold', tickSize: 0.1, pointValue: 100 },
  'SI': { yahoo: 'SI=F', name: 'Silver', tickSize: 0.005, pointValue: 5000 },
  'CL': { yahoo: 'CL=F', name: 'Crude Oil', tickSize: 0.01, pointValue: 1000 },
  'NG': { yahoo: 'NG=F', name: 'Natural Gas', tickSize: 0.001, pointValue: 10000 },
  'ZB': { yahoo: 'ZB=F', name: '30-Year T-Bond', tickSize: 0.03125, pointValue: 1000 },
  'ZN': { yahoo: 'ZN=F', name: '10-Year T-Note', tickSize: 0.015625, pointValue: 1000 },
  '6E': { yahoo: '6E=F', name: 'Euro FX', tickSize: 0.00005, pointValue: 125000 },
  '6J': { yahoo: '6J=F', name: 'Japanese Yen', tickSize: 0.0000005, pointValue: 12500000 },
};

// Cache for futures quotes (5 second TTL for real-time feel)
const futuresCache = new Map<string, { quote: FuturesQuote; timestamp: number }>();
const FUTURES_CACHE_TTL = 5000; // 5 seconds

/**
 * Determine current futures trading session
 */
function getFuturesSession(): 'pre' | 'rth' | 'post' | 'overnight' | 'closed' {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Futures closed: Friday 5pm to Sunday 6pm ET
  if (day === 6 || (day === 5 && timeInMinutes >= 1020) || (day === 0 && timeInMinutes < 1080)) {
    return 'closed';
  }
  
  // RTH (Regular Trading Hours): 9:30am - 4:00pm ET
  if (timeInMinutes >= 570 && timeInMinutes < 960) {
    return 'rth';
  }
  
  // Pre-market: 6:00am - 9:30am ET
  if (timeInMinutes >= 360 && timeInMinutes < 570) {
    return 'pre';
  }
  
  // Post-market: 4:00pm - 5:00pm ET (daily close)
  if (timeInMinutes >= 960 && timeInMinutes < 1020) {
    return 'post';
  }
  
  // Overnight session (5pm previous day to 6am)
  return 'overnight';
}

/**
 * Fetch single futures quote from Yahoo Finance
 */
async function fetchYahooFuturesQuote(symbol: string): Promise<FuturesQuote | null> {
  const futuresInfo = FUTURES_SYMBOLS[symbol.toUpperCase()];
  if (!futuresInfo) {
    logger.warn(`Unknown futures symbol: ${symbol}`);
    return null;
  }
  
  // Check cache first
  const cached = futuresCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < FUTURES_CACHE_TTL) {
    return cached.quote;
  }
  
  try {
    const response = await fetch(
      `${YAHOO_FINANCE_API}/${futuresInfo.yahoo}?interval=1m&range=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    
    if (!response.ok) {
      logger.warn(`Yahoo Finance futures error for ${symbol}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result || !result.meta) {
      return null;
    }
    
    const meta = result.meta;
    const previousClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
    const currentPrice = meta.regularMarketPrice;
    const change = currentPrice - previousClose;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;
    
    const quote: FuturesQuote = {
      symbol: symbol.toUpperCase(),
      name: futuresInfo.name,
      price: currentPrice,
      change,
      changePercent,
      high: meta.regularMarketDayHigh || currentPrice,
      low: meta.regularMarketDayLow || currentPrice,
      volume: meta.regularMarketVolume || 0,
      previousClose,
      session: getFuturesSession(),
      lastUpdate: new Date().toISOString(),
    };
    
    // Update cache
    futuresCache.set(symbol, { quote, timestamp: Date.now() });
    
    logger.info(`✅ Futures quote: ${symbol} @ $${currentPrice.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);
    
    return quote;
  } catch (error) {
    logger.error(`Error fetching futures quote for ${symbol}:`, error);
    return null;
  }
}

/**
 * Fetch all major futures quotes
 */
export async function fetchAllFuturesQuotes(): Promise<FuturesQuote[]> {
  const symbols = Object.keys(FUTURES_SYMBOLS);
  const quotes: FuturesQuote[] = [];
  
  // Fetch in batches to avoid rate limits
  for (const symbol of symbols) {
    const quote = await fetchYahooFuturesQuote(symbol);
    if (quote) {
      quotes.push(quote);
    }
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return quotes;
}

/**
 * Fetch specific futures quote
 */
export async function fetchFuturesQuote(symbol: string): Promise<FuturesQuote | null> {
  return fetchYahooFuturesQuote(symbol);
}

/**
 * Get list of available futures symbols
 */
export function getAvailableFuturesSymbols(): Array<{ symbol: string; name: string; tickSize: number; pointValue: number }> {
  return Object.entries(FUTURES_SYMBOLS).map(([symbol, info]) => ({
    symbol,
    name: info.name,
    tickSize: info.tickSize,
    pointValue: info.pointValue,
  }));
}

/**
 * Fetch futures historical data for charting
 */
export async function fetchFuturesHistory(
  symbol: string,
  interval: '1m' | '5m' | '15m' | '1h' | '1d' = '15m',
  range: '1d' | '5d' | '1mo' | '3mo' = '5d'
): Promise<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }[]> {
  const futuresInfo = FUTURES_SYMBOLS[symbol.toUpperCase()];
  if (!futuresInfo) {
    return [];
  }
  
  try {
    const response = await fetch(
      `${YAHOO_FINANCE_API}/${futuresInfo.yahoo}?interval=${interval}&range=${range}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
      return [];
    }
    
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    
    const candles: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[] = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.open[i] !== null && quote.close[i] !== null) {
        candles.push({
          timestamp: timestamps[i] * 1000,
          open: quote.open[i],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: quote.volume[i] || 0,
        });
      }
    }
    
    return candles;
  } catch (error) {
    logger.error(`Error fetching futures history for ${symbol}:`, error);
    return [];
  }
}
