import { logger } from './logger';

const YAHOO_FINANCE_API = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_SCREENER_API = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved";

export interface StockPerformance {
  symbol: string;
  name: string;
  sector?: string;
  currentPrice: number;
  previousClose: number;
  dayChange: number;
  dayChangePercent: number;
  weekChange?: number;
  weekChangePercent?: number;
  monthChange?: number;
  monthChangePercent?: number;
  ytdChange?: number;
  ytdChangePercent?: number;
  yearChange?: number;
  yearChangePercent?: number;
  volume: number;
  avgVolume?: number;
  marketCap?: number;
  peRatio?: number;
  week52High?: number;
  week52Low?: number;
  lastUpdated: Date;
}

interface YahooQuoteResult {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageDailyVolume10Day?: number;
  marketCap?: number;
  trailingPE?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  sector?: string;
}

const scannerCache = new Map<string, { data: StockPerformance[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const SP500_SYMBOLS = [
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'BRK-B', 'UNH', 'XOM',
  'JNJ', 'JPM', 'V', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'LLY',
  'PEP', 'KO', 'COST', 'AVGO', 'TMO', 'WMT', 'MCD', 'CSCO', 'ABT', 'DHR',
  'ACN', 'VZ', 'ADBE', 'CRM', 'CMCSA', 'NKE', 'NEE', 'TXN', 'PM', 'BMY',
  'INTC', 'AMD', 'QCOM', 'HON', 'UPS', 'RTX', 'LOW', 'UNP', 'SPGI', 'CAT',
  'GS', 'MS', 'BLK', 'AMAT', 'ELV', 'DE', 'BA', 'IBM', 'GILD', 'MDLZ',
  'AXP', 'ISRG', 'ADI', 'BKNG', 'SBUX', 'PLD', 'LMT', 'TJX', 'MMC', 'REGN',
  'SYK', 'AMT', 'VRTX', 'LRCX', 'GE', 'NOW', 'ZTS', 'CVS', 'MO', 'CB',
  'C', 'ETN', 'PANW', 'CI', 'BDX', 'SO', 'DUK', 'CL', 'EQIX', 'CME',
  'PGR', 'AON', 'ITW', 'BSX', 'KLAC', 'FI', 'MU', 'WM', 'APD', 'MCK',
  'PLTR', 'IONQ', 'RKLB', 'SMR', 'OKLO', 'HIMS', 'APP', 'SOUN', 'MARA', 'RIOT',
  'COIN', 'HOOD', 'SOFI', 'AFRM', 'UPST', 'NU', 'DKNG', 'ABNB', 'CRWD', 'NET',
  'SNOW', 'DDOG', 'ZS', 'MDB', 'OKTA', 'TWLO', 'DOCU', 'TTD', 'ROKU', 'SQ',
  'SHOP', 'MELI', 'SE', 'BABA', 'JD', 'PDD', 'GRAB', 'PATH', 'U', 'RBLX',
  'ARM', 'SMCI', 'VRT', 'DELL', 'HPE', 'ORCL', 'SAP', 'CRM', 'WDAY', 'TEAM',
];

const PENNY_STOCKS = [
  'SNDL', 'PLUG', 'FCEL', 'NKLA', 'LCID', 'RIVN', 'FSR', 'GOEV', 'WKHS', 'RIDE',
  'SPCE', 'ASTR', 'RDW', 'VORB', 'ASTS', 'GSAT', 'BKSY', 'LUNR', 'SATL', 'MNTS',
  'MULN', 'FFIE', 'REE', 'DRMA', 'CLSK', 'HUT', 'BITF', 'CORZ', 'GREE', 'IREN',
  'DNA', 'BEAM', 'CRSP', 'EDIT', 'NTLA', 'VERV', 'ACHR', 'JOBY', 'EVTL', 'LILM',
  'ARBE', 'LAZR', 'AEVA', 'MVIS', 'VLDR', 'OUST', 'INVZ', 'CPTN', 'LIDR', 'AEYE',
];

const GROWTH_STOCKS = [
  'NVDA', 'AMD', 'PLTR', 'SMCI', 'ARM', 'MRVL', 'AVGO', 'MU', 'LRCX', 'KLAC',
  'ASML', 'TSM', 'INTC', 'TXN', 'ADI', 'ON', 'NXPI', 'QCOM', 'AMAT', 'SNPS',
  'CDNS', 'ANSS', 'MCHP', 'SWKS', 'QRVO', 'WOLF', 'CRUS', 'SITM', 'RMBS', 'MPWR',
  'CRWD', 'NET', 'ZS', 'PANW', 'FTNT', 'S', 'OKTA', 'CYBR', 'RPD', 'TENB',
  'SNOW', 'DDOG', 'MDB', 'CFLT', 'ESTC', 'NEWR', 'SPLK', 'SUMO', 'DT', 'GTLB',
  'APP', 'SOUN', 'IONQ', 'RKLB', 'SMR', 'OKLO', 'NNE', 'LEU', 'CCJ', 'UEC',
  'COIN', 'MARA', 'RIOT', 'HUT', 'CLSK', 'BITF', 'CORZ', 'IREN', 'BTBT', 'ARBK',
];

const ETF_UNIVERSE = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'VT', 'SCHD', 'JEPI', 'JEPQ',
  'ARKK', 'ARKG', 'ARKF', 'ARKW', 'ARKQ', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI',
  'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'SMH', 'SOXX', 'IGV', 'FXI', 'EEM',
  'TLT', 'SHY', 'BND', 'HYG', 'LQD', 'GLD', 'SLV', 'USO', 'UNG', 'WEAT',
  'TQQQ', 'SQQQ', 'UPRO', 'SPXU', 'TNA', 'TZA', 'SOXL', 'SOXS', 'LABU', 'LABD',
];

export function getStockUniverse(category: 'all' | 'sp500' | 'growth' | 'penny' | 'etf' = 'all'): string[] {
  switch (category) {
    case 'sp500':
      return SP500_SYMBOLS;
    case 'growth':
      return GROWTH_STOCKS;
    case 'penny':
      return PENNY_STOCKS;
    case 'etf':
      return ETF_UNIVERSE;
    case 'all':
    default:
      const allSymbols = new Set([...SP500_SYMBOLS, ...GROWTH_STOCKS, ...PENNY_STOCKS, ...ETF_UNIVERSE]);
      return Array.from(allSymbols);
  }
}

async function fetchYahooQuote(symbol: string): Promise<YahooQuoteResult | null> {
  try {
    const response = await fetch(
      `${YAHOO_FINANCE_API}/${symbol}?interval=1d&range=1y`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result) return null;

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const closes = quote?.close || [];
    const volumes = quote?.volume || [];
    
    const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];
    const previousClose = meta.previousClose || (closes.length > 1 ? closes[closes.length - 2] : currentPrice);
    
    return {
      symbol: meta.symbol || symbol,
      shortName: meta.shortName,
      longName: meta.longName,
      regularMarketPrice: currentPrice,
      regularMarketPreviousClose: previousClose,
      regularMarketChange: currentPrice - previousClose,
      regularMarketChangePercent: previousClose ? ((currentPrice - previousClose) / previousClose) * 100 : 0,
      regularMarketVolume: volumes[volumes.length - 1] || 0,
      averageDailyVolume10Day: meta.averageDailyVolume10Day,
      marketCap: meta.marketCap,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    };
  } catch (error) {
    logger.debug(`Failed to fetch quote for ${symbol}: ${error}`);
    return null;
  }
}

async function fetchYahooHistoricalPerformance(symbol: string): Promise<{
  weekChange?: number;
  monthChange?: number;
  ytdChange?: number;
  yearChange?: number;
} | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneYearAgo = now - (365 * 24 * 60 * 60);
    
    const response = await fetch(
      `${YAHOO_FINANCE_API}/${symbol}?interval=1d&period1=${oneYearAgo}&period2=${now}`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (!result) return null;

    const closes = result.indicators?.quote?.[0]?.close?.filter((p: number | null) => p !== null) || [];
    const timestamps = result.timestamp || [];
    
    if (closes.length < 2) return null;

    const currentPrice = closes[closes.length - 1];
    
    const weekIdx = Math.max(0, closes.length - 5);
    const monthIdx = Math.max(0, closes.length - 22);
    
    const currentYear = new Date().getFullYear();
    const janFirst = new Date(currentYear, 0, 1).getTime() / 1000;
    let ytdIdx = 0;
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] >= janFirst) {
        ytdIdx = i;
        break;
      }
    }

    return {
      weekChange: closes[weekIdx] ? ((currentPrice - closes[weekIdx]) / closes[weekIdx]) * 100 : undefined,
      monthChange: closes[monthIdx] ? ((currentPrice - closes[monthIdx]) / closes[monthIdx]) * 100 : undefined,
      ytdChange: closes[ytdIdx] ? ((currentPrice - closes[ytdIdx]) / closes[ytdIdx]) * 100 : undefined,
      yearChange: closes[0] ? ((currentPrice - closes[0]) / closes[0]) * 100 : undefined,
    };
  } catch (error) {
    logger.debug(`Failed to fetch historical for ${symbol}: ${error}`);
    return null;
  }
}

export async function scanStockPerformance(
  symbols: string[],
  includeHistorical: boolean = false
): Promise<StockPerformance[]> {
  const cacheKey = `scan_${symbols.slice(0, 10).join('_')}_${symbols.length}_${includeHistorical}`;
  
  const cached = scannerCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`[SCANNER] Using cached data for ${symbols.length} symbols`);
    return cached.data;
  }

  logger.info(`[SCANNER] Scanning ${symbols.length} symbols...`);
  const results: StockPerformance[] = [];
  
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (symbol) => {
      const quote = await fetchYahooQuote(symbol);
      if (!quote) return null;

      let historical = null;
      if (includeHistorical) {
        historical = await fetchYahooHistoricalPerformance(symbol);
      }

      return {
        symbol: quote.symbol,
        name: quote.longName || quote.shortName || symbol,
        currentPrice: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        dayChange: quote.regularMarketChange,
        dayChangePercent: quote.regularMarketChangePercent,
        weekChange: historical?.weekChange,
        weekChangePercent: historical?.weekChange,
        monthChange: historical?.monthChange,
        monthChangePercent: historical?.monthChange,
        ytdChange: historical?.ytdChange,
        ytdChangePercent: historical?.ytdChange,
        yearChange: historical?.yearChange,
        yearChangePercent: historical?.yearChange,
        volume: quote.regularMarketVolume,
        avgVolume: quote.averageDailyVolume10Day,
        marketCap: quote.marketCap,
        peRatio: quote.trailingPE,
        week52High: quote.fiftyTwoWeekHigh,
        week52Low: quote.fiftyTwoWeekLow,
        lastUpdated: new Date(),
      } as StockPerformance;
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter((r): r is StockPerformance => r !== null));
    
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  scannerCache.set(cacheKey, { data: results, timestamp: Date.now() });
  
  logger.info(`[SCANNER] Completed scan: ${results.length}/${symbols.length} symbols fetched`);
  return results;
}

export async function getTopMovers(
  timeframe: 'day' | 'week' | 'month' | 'ytd' | 'year' = 'day',
  category: 'all' | 'sp500' | 'growth' | 'penny' | 'etf' = 'all',
  limit: number = 50
): Promise<{ gainers: StockPerformance[]; losers: StockPerformance[] }> {
  const symbols = getStockUniverse(category);
  const includeHistorical = timeframe !== 'day';
  
  const stocks = await scanStockPerformance(symbols, includeHistorical);
  
  let sortField: keyof StockPerformance;
  switch (timeframe) {
    case 'week':
      sortField = 'weekChangePercent';
      break;
    case 'month':
      sortField = 'monthChangePercent';
      break;
    case 'ytd':
      sortField = 'ytdChangePercent';
      break;
    case 'year':
      sortField = 'yearChangePercent';
      break;
    default:
      sortField = 'dayChangePercent';
  }

  const validStocks = stocks.filter(s => s[sortField] !== undefined && s[sortField] !== null);
  
  const sorted = validStocks.sort((a, b) => {
    const aVal = a[sortField] as number;
    const bVal = b[sortField] as number;
    return bVal - aVal;
  });

  return {
    gainers: sorted.slice(0, limit),
    losers: sorted.slice(-limit).reverse(),
  };
}

export async function getSectorPerformance(): Promise<Record<string, { avg: number; count: number }>> {
  const sectorETFs: Record<string, string> = {
    'Technology': 'XLK',
    'Financials': 'XLF',
    'Healthcare': 'XLV',
    'Energy': 'XLE',
    'Consumer Discretionary': 'XLY',
    'Consumer Staples': 'XLP',
    'Industrials': 'XLI',
    'Materials': 'XLB',
    'Real Estate': 'XLRE',
    'Utilities': 'XLU',
    'Communication Services': 'XLC',
  };

  const results: Record<string, { avg: number; count: number }> = {};
  
  for (const [sector, etf] of Object.entries(sectorETFs)) {
    const quote = await fetchYahooQuote(etf);
    if (quote) {
      results[sector] = {
        avg: quote.regularMarketChangePercent,
        count: 1,
      };
    }
  }

  return results;
}

export function clearScannerCache(): void {
  scannerCache.clear();
  logger.info('[SCANNER] Cache cleared');
}
