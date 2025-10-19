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

export async function fetchCryptoPrice(symbol: string): Promise<ExternalMarketData | null> {
  const startTime = Date.now();
  try {
    const coinId = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
    if (!coinId) {
      return null;
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

// 🔍 STOCK MARKET SCREENER: Discover high-volume movers and breakout candidates
// Similar to crypto gem finder but for stocks across the entire market
interface StockGem {
  symbol: string;
  currentPrice: number;
  changePercent: number;
  volume: number;
  marketCap: number;
}

export async function discoverStockGems(limit: number = 30): Promise<StockGem[]> {
  const gems: StockGem[] = [];
  
  try {
    logger.info('🔍 Scanning stock market for movers and breakouts...');
    
    // Fetch multiple categories to get a diverse set of opportunities
    const categories = [
      { name: 'gainers', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=day_gainers&count=25' },
      { name: 'losers', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=day_losers&count=25' },
      { name: 'mostActive', url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=most_actives&count=25' }
    ];
    
    for (const category of categories) {
      try {
        const response = await fetch(category.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (!response.ok) {
          logger.info(`⚠️  Yahoo ${category.name} endpoint returned ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const quotes = data?.finance?.result?.[0]?.quotes || [];
        
        logger.info(`  ✓ Found ${quotes.length} stocks in ${category.name}`);
        
        for (const quote of quotes) {
          // Filter criteria: 
          // - Price > $1 (avoid penny stocks)
          // - Price < $500 (avoid expensive stocks that are hard to trade)
          // - Volume exists
          // - Market cap > $50M (avoid micro caps)
          const price = quote.regularMarketPrice?.raw || quote.regularMarketPrice;
          const change = quote.regularMarketChangePercent?.raw || quote.regularMarketChangePercent || 0;
          const volume = quote.regularMarketVolume?.raw || quote.regularMarketVolume || 0;
          const marketCap = quote.marketCap?.raw || quote.marketCap || 0;
          
          if (!price || price < 1 || price > 500) continue;
          if (volume < 100000) continue; // Minimum 100K volume
          if (marketCap < 50_000_000) continue; // Min $50M market cap
          
          gems.push({
            symbol: quote.symbol,
            currentPrice: price,
            changePercent: change,
            volume: volume,
            marketCap: marketCap
          });
        }
      } catch (error) {
        logger.info(`  ⚠️  Failed to fetch ${category.name}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Remove duplicates (same symbol might appear in multiple categories)
    const uniqueGems = new Map<string, StockGem>();
    gems.forEach(gem => {
      if (!uniqueGems.has(gem.symbol)) {
        uniqueGems.set(gem.symbol, gem);
      }
    });
    
    // Sort by absolute price change (both gainers and losers are interesting)
    const sortedGems = Array.from(uniqueGems.values())
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, limit);
    
    logger.info(`🎯 Discovered ${sortedGems.length} stock gems: ${sortedGems.slice(0, 5).map(g => `${g.symbol} (${g.changePercent > 0 ? '+' : ''}${g.changePercent.toFixed(1)}%)`).join(', ')}${sortedGems.length > 5 ? '...' : ''}`);
    
    return sortedGems;
  } catch (error) {
    logger.error('❌ Stock discovery error:', error);
    return [];
  }
}
