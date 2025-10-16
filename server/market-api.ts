import type { AssetType } from "@shared/schema";

export interface ExternalMarketData {
  symbol: string;
  assetType: AssetType;
  currentPrice: number;
  changePercent: number;
  volume: number;
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
  try {
    const coinId = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
    if (!coinId) {
      return null;
    }

    const response = await fetch(
      `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const marketData = data.market_data;

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
    console.error(`Error fetching crypto price for ${symbol}:`, error);
    return null;
  }
}

export async function fetchYahooFinancePrice(
  symbol: string
): Promise<ExternalMarketData | null> {
  try {
    const response = await fetch(
      `${YAHOO_FINANCE_API}/${symbol}?interval=1d&range=1d`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result || !result.meta) {
      return null;
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const regularMarketPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose || meta.previousClose;
    const changePercent = previousClose 
      ? ((regularMarketPrice - previousClose) / previousClose) * 100 
      : 0;

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
    console.error(`Error fetching Yahoo Finance price for ${symbol}:`, error);
    return null;
  }
}

export async function fetchStockPrice(
  symbol: string,
  apiKey?: string
): Promise<ExternalMarketData | null> {
  if (apiKey) {
    try {
      const response = await fetch(
        `${ALPHA_VANTAGE_API}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
      );

      if (!response.ok) {
        console.log(`Alpha Vantage API error for ${symbol}, falling back to Yahoo Finance`);
        return await fetchYahooFinancePrice(symbol);
      }

      const data = await response.json();
      
      if (data.Information && data.Information.includes("rate limit")) {
        console.log(`Alpha Vantage rate limit hit for ${symbol}, falling back to Yahoo Finance`);
        return await fetchYahooFinancePrice(symbol);
      }

      const quote = data["Global Quote"];

      if (!quote || !quote["05. price"]) {
        console.log(`No Alpha Vantage data for ${symbol}, falling back to Yahoo Finance`);
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
      console.error(`Error fetching stock price for ${symbol}:`, error);
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

  if (alphaVantageKey) {
    return await fetchStockPrice(upperSymbol, alphaVantageKey);
  }

  return null;
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
  apiKey?: string
): Promise<number[]> {
  try {
    if (assetType === 'crypto') {
      // Fetch CoinGecko historical data
      const coinId = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
      if (!coinId) {
        console.log(`No CoinGecko mapping for ${symbol}, using fallback`);
        return [];
      }

      const response = await fetch(
        `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=${periods}&interval=daily`
      );

      if (!response.ok) {
        console.log(`CoinGecko historical data error for ${symbol}`);
        return [];
      }

      const data = await response.json();
      // CoinGecko returns [timestamp, price] arrays
      const prices = data.prices.map((p: [number, number]) => p[1]);
      
      console.log(`✅ Fetched ${prices.length} real historical prices for ${symbol} (crypto)`);
      return prices;
    }

    // Fetch Alpha Vantage historical data for stocks
    if (!apiKey) {
      console.log(`No Alpha Vantage API key, cannot fetch historical data for ${symbol}`);
      return [];
    }

    const response = await fetch(
      `${ALPHA_VANTAGE_API}?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}&outputsize=compact`
    );

    if (!response.ok) {
      console.log(`Alpha Vantage historical data error for ${symbol}`);
      return [];
    }

    const data = await response.json();

    // Check for rate limit or errors
    if (data.Information || data.Note) {
      console.log(`Alpha Vantage rate limit or error for ${symbol}: ${data.Information || data.Note}`);
      return [];
    }

    const timeSeries = data["Time Series (Daily)"];
    if (!timeSeries) {
      console.log(`No time series data for ${symbol}`);
      return [];
    }

    // Extract closing prices, sorted from oldest to newest
    const prices = Object.keys(timeSeries)
      .sort() // Sort dates chronologically (oldest first)
      .slice(-periods) // Take last N periods
      .map(date => parseFloat(timeSeries[date]["4. close"]));

    console.log(`✅ Fetched ${prices.length} real historical prices for ${symbol} (stock)`);
    return prices;
  } catch (error) {
    console.error(`Error fetching historical prices for ${symbol}:`, error);
    return [];
  }
}

export async function discoverHiddenCryptoGems(limit: number = 10): Promise<HiddenCryptoGem[]> {
  try {
    const marketCapResponse = await fetch(
      `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=24h`
    );

    if (!marketCapResponse.ok) {
      console.error("CoinGecko API error:", marketCapResponse.statusText);
      return [];
    }

    const allCoins = await marketCapResponse.json();

    const top20ByMarketCap = new Set(
      allCoins.slice(0, 20).map((coin: any) => coin.id)
    );

    const hiddenGems: HiddenCryptoGem[] = allCoins
      .map((coin: any, marketCapRank: number) => {
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

        return {
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
      })
      .filter((gem: any) => 
        !top20ByMarketCap.has(gem.coinId) &&
        gem.marketCap >= 50_000_000 &&
        gem.marketCap <= 2_000_000_000 &&
        gem.volume24h >= 5_000_000 &&
        (gem.priceGap || gem.volumeSpike)
      )
      .sort((a: any, b: any) => b.anomalyScore - a.anomalyScore)
      .slice(0, limit);

    console.log(`✅ Discovery: ${hiddenGems.length} hidden gems found (excluded top-20, required 3%+ move OR 10%+ turnover, $50M-$2B cap)`);
    
    return hiddenGems;
  } catch (error) {
    console.error("Error discovering hidden crypto gems:", error);
    return [];
  }
}
