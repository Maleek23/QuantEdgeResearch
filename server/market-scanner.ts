import { logger } from './logger';
import { getFullUniverse, getSectorTickers, PREMIUM_WATCHLIST, LOTTO_ELIGIBLE } from './ticker-universe';

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
const moversCache = new Map<string, { data: { gainers: StockPerformance[]; losers: StockPerformance[] }; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MOVERS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes for movers

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

export function getStockUniverse(category: 'all' | 'sp500' | 'growth' | 'penny' | 'etf' | 'premium' | 'lotto' = 'all'): string[] {
  switch (category) {
    case 'sp500':
      return SP500_SYMBOLS;
    case 'growth':
      return GROWTH_STOCKS;
    case 'penny':
      return PENNY_STOCKS;
    case 'etf':
      return ETF_UNIVERSE;
    case 'premium':
      return PREMIUM_WATCHLIST;
    case 'lotto':
      return LOTTO_ELIGIBLE;
    case 'all':
    default:
      // Use unified ticker universe (500+ tickers)
      return getFullUniverse();
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
  const moversCacheKey = `movers_${timeframe}_${category}_${limit}`;
  
  const cachedMovers = moversCache.get(moversCacheKey);
  if (cachedMovers && Date.now() - cachedMovers.timestamp < MOVERS_CACHE_TTL) {
    logger.debug(`[SCANNER] Using cached movers for ${timeframe}/${category}`);
    return cachedMovers.data;
  }

  const symbols = getStockUniverse(category);
  const includeHistorical = timeframe !== 'day';
  
  logger.info(`[SCANNER] Fetching top movers: ${timeframe}/${category} (${symbols.length} symbols)`);
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
  
  if (validStocks.length === 0) {
    logger.warn(`[SCANNER] No valid stocks found for ${timeframe}/${category}`);
  }
  
  const sorted = validStocks.sort((a, b) => {
    const aVal = a[sortField] as number;
    const bVal = b[sortField] as number;
    return bVal - aVal;
  });

  const result = {
    gainers: sorted.slice(0, limit),
    losers: sorted.slice(-limit).reverse(),
  };

  moversCache.set(moversCacheKey, { data: result, timestamp: Date.now() });
  logger.info(`[SCANNER] Cached movers: ${result.gainers.length} gainers, ${result.losers.length} losers`);
  
  return result;
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
  moversCache.clear();
  logger.info('[SCANNER] Cache cleared');
}

// Smart Watchlist Pick with trade idea analysis
export interface SmartWatchlistPick {
  symbol: string;
  name: string;
  currentPrice: number;
  changePercent: number;
  timeframe: 'day' | 'week' | 'month' | 'ytd' | 'year';
  direction: 'long' | 'short';
  volume: number;
  avgVolume?: number;
  volumeRatio: number;
  marketCap?: number;
  week52High?: number;
  week52Low?: number;
  distanceFrom52High?: number;
  distanceFrom52Low?: number;
  tradeIdea: {
    thesis: string;
    entryReason: string;
    riskLevel: 'low' | 'medium' | 'high' | 'speculative';
    suggestedAction: string;
    technicalSignals: string[];
  };
  score: number;
}

const watchlistCache = new Map<string, { data: SmartWatchlistPick[]; timestamp: number }>();
const WATCHLIST_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for watchlists

// Get the change percent for the specific timeframe
function getTimeframeChange(stock: StockPerformance, timeframe: string): number {
  switch (timeframe) {
    case 'week': return stock.weekChangePercent ?? stock.dayChangePercent;
    case 'month': return stock.monthChangePercent ?? stock.dayChangePercent;
    case 'ytd': return stock.ytdChangePercent ?? stock.dayChangePercent;
    case 'year': return stock.yearChangePercent ?? stock.dayChangePercent;
    default: return stock.dayChangePercent;
  }
}

// Generate trade idea analysis for a stock based on its performance data
function generateTradeIdea(stock: StockPerformance, timeframe: string, isGainer: boolean): SmartWatchlistPick['tradeIdea'] {
  const technicalSignals: string[] = [];
  const volumeRatio = stock.avgVolume ? stock.volume / stock.avgVolume : 1;
  const distanceFrom52High = stock.week52High && stock.currentPrice 
    ? ((stock.week52High - stock.currentPrice) / stock.week52High) * 100 : undefined;
  const distanceFrom52Low = stock.week52Low && stock.currentPrice 
    ? ((stock.currentPrice - stock.week52Low) / stock.week52Low) * 100 : undefined;
  
  // Get the correct change for this timeframe
  const timeframeChange = getTimeframeChange(stock, timeframe);
  const changeAbs = Math.abs(timeframeChange);
  
  // Build technical signals based on the timeframe
  if (volumeRatio > 2) technicalSignals.push('Unusual Volume (2x+ avg)');
  else if (volumeRatio > 1.5) technicalSignals.push('Above Avg Volume');
  
  if (distanceFrom52High !== undefined && distanceFrom52High < 5) {
    technicalSignals.push('Near 52-Week High');
  } else if (distanceFrom52High !== undefined && distanceFrom52High < 15) {
    technicalSignals.push('Within 15% of 52-Week High');
  }
  
  if (distanceFrom52Low !== undefined && distanceFrom52Low < 20) {
    technicalSignals.push('Potential Bounce Zone');
  }
  
  // Add timeframe-appropriate momentum signals
  if (timeframe === 'day') {
    if (changeAbs > 10) technicalSignals.push('Strong Intraday Move');
    else if (changeAbs > 5) technicalSignals.push('Notable Daily Move');
  } else if (timeframe === 'week') {
    if (changeAbs > 15) technicalSignals.push('Strong Weekly Momentum');
    else if (changeAbs > 8) technicalSignals.push('Solid Weekly Gains');
  } else if (timeframe === 'month') {
    if (changeAbs > 25) technicalSignals.push('Exceptional Monthly Run');
    else if (changeAbs > 15) technicalSignals.push('Strong Monthly Trend');
  } else if (timeframe === 'ytd' || timeframe === 'year') {
    if (changeAbs > 100) technicalSignals.push('Multi-Bagger');
    else if (changeAbs > 50) technicalSignals.push('Strong Annual Performer');
    else if (changeAbs > 25) technicalSignals.push('Outperforming Market');
  }
  
  if (stock.peRatio && stock.peRatio < 15) technicalSignals.push('Value Play (Low P/E)');
  if (stock.marketCap && stock.marketCap < 2e9) technicalSignals.push('Small Cap (Higher Vol)');
  if (stock.marketCap && stock.marketCap >= 100e9) technicalSignals.push('Large Cap (Stable)');
  
  // Determine risk level based on timeframe-appropriate thresholds
  let riskLevel: 'low' | 'medium' | 'high' | 'speculative' = 'medium';
  if (stock.currentPrice < 5) riskLevel = 'speculative';
  else if (stock.marketCap && stock.marketCap < 1e9) riskLevel = 'high';
  else if (stock.marketCap && stock.marketCap >= 50e9) riskLevel = 'low';
  else if (timeframe === 'day' && changeAbs > 15) riskLevel = 'high';
  else if (timeframe === 'week' && changeAbs > 25) riskLevel = 'high';
  else if ((timeframe === 'month' || timeframe === 'ytd' || timeframe === 'year') && changeAbs > 50) riskLevel = 'high';
  
  // Build thesis based on timeframe and direction
  let thesis = '';
  let entryReason = '';
  let suggestedAction = '';
  
  if (isGainer) {
    switch (timeframe) {
      case 'day':
        thesis = `${stock.symbol} showing strong intraday momentum with ${stock.dayChangePercent.toFixed(1)}% gain.`;
        entryReason = volumeRatio > 1.5 
          ? 'High volume confirms buyer interest - momentum likely to continue.' 
          : 'Price action strong but watch for volume confirmation.';
        suggestedAction = 'Consider day trade or swing entry on pullback to VWAP.';
        break;
      case 'week':
        thesis = `${stock.symbol} outperforming over the week with ${(stock.weekChangePercent || 0).toFixed(1)}% gain.`;
        entryReason = 'Weekly momentum suggests institutional accumulation phase.';
        suggestedAction = 'Look for entry near weekly support or on consolidation break.';
        break;
      case 'month':
        thesis = `${stock.symbol} showing monthly strength with ${(stock.monthChangePercent || 0).toFixed(1)}% gain.`;
        entryReason = 'Sustained monthly gains indicate trend development.';
        suggestedAction = 'Swing trade opportunity - consider position sizing for multi-week hold.';
        break;
      case 'ytd':
        thesis = `${stock.symbol} is a YTD leader with ${(stock.ytdChangePercent || 0).toFixed(1)}% return.`;
        entryReason = 'Strong YTD performance suggests leadership position in sector.';
        suggestedAction = 'Position trade candidate - buy dips in established uptrend.';
        break;
      case 'year':
        thesis = `${stock.symbol} up ${(stock.yearChangePercent || 0).toFixed(1)}% over 52 weeks - strong long-term trend.`;
        entryReason = 'Year-long momentum indicates fundamental strength.';
        suggestedAction = 'Long-term accumulation opportunity on significant pullbacks.';
        break;
    }
  } else {
    // For losers - potential bounce plays or shorts
    switch (timeframe) {
      case 'day':
        thesis = `${stock.symbol} down ${Math.abs(stock.dayChangePercent).toFixed(1)}% - potential oversold bounce.`;
        entryReason = volumeRatio > 2 
          ? 'Heavy selling may indicate capitulation - watch for reversal.' 
          : 'Selling pressure present but not extreme yet.';
        suggestedAction = 'Wait for price to stabilize and show reversal candle before entry.';
        break;
      case 'week':
        thesis = `${stock.symbol} weak weekly performance - down ${Math.abs(stock.weekChangePercent || 0).toFixed(1)}%.`;
        entryReason = 'Weekly weakness may present mean reversion opportunity.';
        suggestedAction = 'Watch for weekly support levels and RSI oversold conditions.';
        break;
      default:
        thesis = `${stock.symbol} showing extended weakness - potential value opportunity.`;
        entryReason = 'Extended selling may be creating entry point for contrarian trade.';
        suggestedAction = 'Research fundamentals before catching falling knife.';
    }
  }
  
  return {
    thesis,
    entryReason,
    riskLevel,
    suggestedAction,
    technicalSignals: technicalSignals.slice(0, 4),
  };
}

// Score stocks for watchlist ranking (higher = better pick)
function scoreStock(stock: StockPerformance, timeframe: string, isGainer: boolean): number {
  let score = 50; // Base score
  
  const volumeRatio = stock.avgVolume ? stock.volume / stock.avgVolume : 1;
  const changePercent = Math.abs(getTimeframeChange(stock, timeframe));
  
  // Volume boost (max +20)
  if (volumeRatio > 3) score += 20;
  else if (volumeRatio > 2) score += 15;
  else if (volumeRatio > 1.5) score += 10;
  else if (volumeRatio > 1) score += 5;
  
  // Change percent boost with timeframe-appropriate thresholds (max +20)
  if (timeframe === 'day') {
    if (changePercent > 15) score += 20;
    else if (changePercent > 8) score += 15;
    else if (changePercent > 4) score += 10;
    else if (changePercent > 2) score += 5;
  } else if (timeframe === 'week') {
    if (changePercent > 20) score += 20;
    else if (changePercent > 12) score += 15;
    else if (changePercent > 6) score += 10;
    else if (changePercent > 3) score += 5;
  } else if (timeframe === 'month') {
    if (changePercent > 35) score += 20;
    else if (changePercent > 20) score += 15;
    else if (changePercent > 10) score += 10;
    else if (changePercent > 5) score += 5;
  } else { // ytd, year
    if (changePercent > 80) score += 20;
    else if (changePercent > 50) score += 15;
    else if (changePercent > 25) score += 10;
    else if (changePercent > 10) score += 5;
  }
  
  // Market cap stability (prefer tradeable, liquid stocks)
  if (stock.marketCap) {
    if (stock.marketCap >= 10e9) score += 10; // Large cap bonus
    else if (stock.marketCap >= 1e9) score += 5; // Mid cap
    else if (stock.marketCap < 500e6) score -= 5; // Micro cap penalty
  }
  
  // Near 52-week high bonus for gainers
  if (isGainer && stock.week52High && stock.currentPrice) {
    const distanceFromHigh = ((stock.week52High - stock.currentPrice) / stock.week52High) * 100;
    if (distanceFromHigh < 5) score += 15; // Breaking out
    else if (distanceFromHigh < 10) score += 10;
  }
  
  // Avoid penny stocks for main watchlist (unless specifically in penny category)
  if (stock.currentPrice < 1) score -= 20;
  else if (stock.currentPrice < 5) score -= 10;
  
  return Math.max(0, Math.min(100, score));
}

// Generate curated smart watchlist for a given timeframe
export async function generateSmartWatchlist(
  timeframe: 'day' | 'week' | 'month' | 'ytd' | 'year' = 'day',
  limit: number = 15
): Promise<SmartWatchlistPick[]> {
  const cacheKey = `smart_${timeframe}_${limit}`;
  
  const cached = watchlistCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WATCHLIST_CACHE_TTL) {
    logger.debug(`[SCANNER] Using cached smart watchlist for ${timeframe}`);
    return cached.data;
  }
  
  logger.info(`[SCANNER] Generating smart watchlist for ${timeframe}...`);
  
  // Get top movers from all categories for broader coverage
  const { gainers, losers } = await getTopMovers(timeframe, 'all', 50);
  
  // Combine and score all candidates
  const candidates: SmartWatchlistPick[] = [];
  
  // Process gainers (long opportunities)
  for (const stock of gainers) {
    const score = scoreStock(stock, timeframe, true);
    const volumeRatio = stock.avgVolume ? stock.volume / stock.avgVolume : 1;
    const tradeIdea = generateTradeIdea(stock, timeframe, true);
    
    const changePercent = (() => {
      switch (timeframe) {
        case 'week': return stock.weekChangePercent || 0;
        case 'month': return stock.monthChangePercent || 0;
        case 'ytd': return stock.ytdChangePercent || 0;
        case 'year': return stock.yearChangePercent || 0;
        default: return stock.dayChangePercent;
      }
    })();
    
    candidates.push({
      symbol: stock.symbol,
      name: stock.name,
      currentPrice: stock.currentPrice,
      changePercent,
      timeframe,
      direction: 'long',
      volume: stock.volume,
      avgVolume: stock.avgVolume,
      volumeRatio,
      marketCap: stock.marketCap,
      week52High: stock.week52High,
      week52Low: stock.week52Low,
      distanceFrom52High: stock.week52High ? ((stock.week52High - stock.currentPrice) / stock.week52High) * 100 : undefined,
      distanceFrom52Low: stock.week52Low ? ((stock.currentPrice - stock.week52Low) / stock.week52Low) * 100 : undefined,
      tradeIdea,
      score,
    });
  }
  
  // Process top losers (potential bounce/short opportunities) - limit to top 5
  for (const stock of losers.slice(0, 5)) {
    const score = scoreStock(stock, timeframe, false);
    const volumeRatio = stock.avgVolume ? stock.volume / stock.avgVolume : 1;
    const tradeIdea = generateTradeIdea(stock, timeframe, false);
    
    const changePercent = (() => {
      switch (timeframe) {
        case 'week': return stock.weekChangePercent || 0;
        case 'month': return stock.monthChangePercent || 0;
        case 'ytd': return stock.ytdChangePercent || 0;
        case 'year': return stock.yearChangePercent || 0;
        default: return stock.dayChangePercent;
      }
    })();
    
    // Add bounce play candidates with lower scores
    candidates.push({
      symbol: stock.symbol,
      name: stock.name,
      currentPrice: stock.currentPrice,
      changePercent,
      timeframe,
      direction: 'long', // Bounce play
      volume: stock.volume,
      avgVolume: stock.avgVolume,
      volumeRatio,
      marketCap: stock.marketCap,
      week52High: stock.week52High,
      week52Low: stock.week52Low,
      distanceFrom52High: stock.week52High ? ((stock.week52High - stock.currentPrice) / stock.week52High) * 100 : undefined,
      distanceFrom52Low: stock.week52Low ? ((stock.currentPrice - stock.week52Low) / stock.week52Low) * 100 : undefined,
      tradeIdea,
      score: score - 10, // Slightly lower score for contrarian plays
    });
  }
  
  // Sort by score and take top picks
  const sortedPicks = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  watchlistCache.set(cacheKey, { data: sortedPicks, timestamp: Date.now() });
  logger.info(`[SCANNER] Generated ${sortedPicks.length} smart watchlist picks for ${timeframe}`);
  
  return sortedPicks;
}
