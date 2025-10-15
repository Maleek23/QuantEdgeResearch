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

export async function fetchStockPrice(
  symbol: string,
  apiKey?: string
): Promise<ExternalMarketData | null> {
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `${ALPHA_VANTAGE_API}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const quote = data["Global Quote"];

    if (!quote || !quote["05. price"]) {
      return null;
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
    return null;
  }
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
