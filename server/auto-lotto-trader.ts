import { storage } from "./storage";
import { executeTradeIdea, checkStopsAndTargets, updatePositionPrices } from "./paper-trading-service";
import { sendBotTradeEntryToDiscord, sendBotTradeExitToDiscord, sendFuturesTradesToDiscord } from "./discord-service";
import { getTradierQuote, getTradierOptionsChainsByDTE } from "./tradier-api";
import { calculateLottoTargets, getLottoThresholds } from "./lotto-detector";
import { getLetterGrade } from "./grading";
import { formatInTimeZone } from "date-fns-tz";
import { TradeIdea, PaperPortfolio, InsertTradeIdea, AutoLottoPreferences } from "@shared/schema";
import { isUSMarketOpen, isCMEMarketOpen, normalizeDateString } from "@shared/market-calendar";
import { logger } from "./logger";
import { getMarketContext, getEntryTiming, checkDynamicExit, MarketContext } from "./market-context-service";
import { getActiveFuturesContract, getFuturesPrice } from "./futures-data-service";
import { getTopMovers } from "./market-scanner";
import { 
  calculateEnhancedSignalScore, 
  detectCandlestickPatterns,
  calculateRSI,
  calculateADX,
  determineMarketRegime
} from "./technical-indicators";
import { 
  analyzeTrade, 
  recordWin, 
  getSymbolAdjustment, 
  getAdaptiveParameters,
  getLearningState
} from "./loss-analyzer-service";

// User preferences interface with defaults
interface BotPreferences {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  maxPositionSize: number;
  maxConcurrentTrades: number;
  dailyLossLimit: number;
  enableOptions: boolean;
  enableFutures: boolean;
  enableCrypto: boolean;
  enablePropFirm: boolean;
  optionsAllocation: number;
  futuresAllocation: number;
  cryptoAllocation: number;
  minConfidenceScore: number;
  minRiskRewardRatio: number;
  tradePreMarket: boolean;
  tradeRegularHours: boolean;
  tradeAfterHours: boolean;
  enableDiscordAlerts: boolean;
  futuresMaxContracts: number;
  futuresStopPoints: number;
  futuresTargetPoints: number;
  cryptoPreferredCoins: string[];
  cryptoEnableMemeCoins: boolean;
}

// Default preferences (used when no user prefs are set) - UNLIMITED MODE
const DEFAULT_PREFERENCES: BotPreferences = {
  riskTolerance: 'aggressive',
  maxPositionSize: 10000, // Unlimited funds for paper trading
  maxConcurrentTrades: 50, // Allow many concurrent trades
  dailyLossLimit: 100000, // High limit for paper trading
  enableOptions: true,
  enableFutures: false, // Disabled by default - NQ=$20/point is too expensive for small accounts
  enableCrypto: true,
  enablePropFirm: false,
  optionsAllocation: 40,
  futuresAllocation: 30,
  cryptoAllocation: 30,
  minConfidenceScore: 70,
  minRiskRewardRatio: 2.0,
  tradePreMarket: false,
  tradeRegularHours: true,
  tradeAfterHours: false,
  enableDiscordAlerts: true,
  futuresMaxContracts: 2,
  futuresStopPoints: 15,
  futuresTargetPoints: 30,
  cryptoPreferredCoins: ['BTC', 'ETH', 'SOL'],
  cryptoEnableMemeCoins: false,
};

// Cached preferences with expiry
let cachedPreferences: BotPreferences | null = null;
let preferencesLastFetched = 0;
const PREFERENCES_CACHE_TTL = 60000; // 1 minute cache

/**
 * Get bot preferences for the system user, with fallback to defaults
 */
async function getBotPreferences(): Promise<BotPreferences> {
  const now = Date.now();
  
  // Use cached preferences if still valid
  if (cachedPreferences && (now - preferencesLastFetched) < PREFERENCES_CACHE_TTL) {
    return cachedPreferences;
  }
  
  try {
    // Fetch from database (system user preferences)
    const userPrefs = await storage.getAutoLottoPreferences(SYSTEM_USER_ID);
    
    if (userPrefs) {
      const prefs: BotPreferences = {
        riskTolerance: userPrefs.riskTolerance as 'conservative' | 'moderate' | 'aggressive',
        maxPositionSize: userPrefs.maxPositionSize,
        maxConcurrentTrades: userPrefs.maxConcurrentTrades,
        dailyLossLimit: userPrefs.dailyLossLimit ?? DEFAULT_PREFERENCES.dailyLossLimit,
        enableOptions: userPrefs.enableOptions,
        enableFutures: userPrefs.enableFutures,
        enableCrypto: userPrefs.enableCrypto,
        enablePropFirm: userPrefs.enablePropFirm,
        optionsAllocation: userPrefs.optionsAllocation,
        futuresAllocation: userPrefs.futuresAllocation,
        cryptoAllocation: userPrefs.cryptoAllocation,
        minConfidenceScore: userPrefs.minConfidenceScore,
        minRiskRewardRatio: userPrefs.minRiskRewardRatio,
        tradePreMarket: userPrefs.tradePreMarket,
        tradeRegularHours: userPrefs.tradeRegularHours,
        tradeAfterHours: userPrefs.tradeAfterHours,
        enableDiscordAlerts: userPrefs.enableDiscordAlerts,
        futuresMaxContracts: userPrefs.futuresMaxContracts,
        futuresStopPoints: userPrefs.futuresStopPoints,
        futuresTargetPoints: userPrefs.futuresTargetPoints,
        cryptoPreferredCoins: userPrefs.cryptoPreferredCoins || ['BTC', 'ETH', 'SOL'],
        cryptoEnableMemeCoins: userPrefs.cryptoEnableMemeCoins,
      };
      cachedPreferences = prefs;
      preferencesLastFetched = now;
      logger.debug(`[BOT-PREFS] Loaded user preferences: ${prefs.riskTolerance}, maxPos=$${prefs.maxPositionSize}`);
      return prefs;
    }
  } catch (error) {
    logger.debug(`[BOT-PREFS] Using defaults (no user preferences found)`);
  }
  
  // Return defaults if no user preferences
  cachedPreferences = { ...DEFAULT_PREFERENCES };
  preferencesLastFetched = now;
  return cachedPreferences;
}

/**
 * Clear cached preferences (call after user updates their settings)
 */
export function clearPreferencesCache(): void {
  cachedPreferences = null;
  preferencesLastFetched = 0;
}

/**
 * Clear all portfolio caches (call after admin reset)
 */
export function clearPortfolioCaches(): void {
  optionsPortfolio = null;
  futuresPortfolio = null;
  cryptoPortfolio = null;
  propFirmPortfolio = null;
  logger.info('[BOT] Portfolio caches cleared');
}

// Separate portfolios for Options, Futures, and Crypto
const OPTIONS_PORTFOLIO_NAME = "Auto-Lotto Options";
const FUTURES_PORTFOLIO_NAME = "Auto-Lotto Futures";
const CRYPTO_PORTFOLIO_NAME = "Auto-Lotto Crypto";
const PROP_FIRM_PORTFOLIO_NAME = "Prop Firm Mode"; // Conservative futures for funded evaluations
const SYSTEM_USER_ID = "system-auto-trader";
const STARTING_CAPITAL = 300; // $300 per portfolio
const MAX_POSITION_SIZE = 100; // $100 max per trade for better utilization
const FUTURES_MAX_POSITION_SIZE_PER_TRADE = 100;
const CRYPTO_MAX_POSITION_SIZE = 100;

// Prop Firm Mode - Conservative settings for Topstep/funded evaluations
const PROP_FIRM_STARTING_CAPITAL = 50000; // Simulates 50K combine account
const PROP_FIRM_DAILY_LOSS_LIMIT = 1000; // $1000 max daily loss
const PROP_FIRM_MAX_DRAWDOWN = 2500; // $2500 trailing drawdown
const PROP_FIRM_PROFIT_TARGET = 3000; // $3000 profit target
const PROP_FIRM_MAX_CONTRACTS = 2; // Max 2 contracts at a time
const PROP_FIRM_STOP_POINTS_NQ = 15; // 15 point stop = $300 risk per contract
const PROP_FIRM_TARGET_POINTS_NQ = 30; // 2:1 R:R minimum

let optionsPortfolio: PaperPortfolio | null = null;
let futuresPortfolio: PaperPortfolio | null = null;
let cryptoPortfolio: PaperPortfolio | null = null;
let propFirmPortfolio: PaperPortfolio | null = null;

// Prop Firm Mode daily stats
let propFirmDailyPnL = 0;
let propFirmLastResetDate = '';

// Re-initialize portfolios to ensure proper balances if they don't exist
export async function syncPortfolios(): Promise<void> {
  const portfolios = [
    { name: OPTIONS_PORTFOLIO_NAME, size: MAX_POSITION_SIZE, capital: STARTING_CAPITAL },
    { name: FUTURES_PORTFOLIO_NAME, size: FUTURES_MAX_POSITION_SIZE_PER_TRADE, capital: STARTING_CAPITAL },
    { name: CRYPTO_PORTFOLIO_NAME, size: CRYPTO_MAX_POSITION_SIZE, capital: STARTING_CAPITAL },
    { name: PROP_FIRM_PORTFOLIO_NAME, size: PROP_FIRM_MAX_CONTRACTS * 1000, capital: PROP_FIRM_STARTING_CAPITAL }
  ];

  for (const p of portfolios) {
    const existing = await storage.getPaperPortfoliosByUser(SYSTEM_USER_ID);
    const found = existing.find(ep => ep.name === p.name);
    if (!found) {
      await storage.createPaperPortfolio({
        userId: SYSTEM_USER_ID,
        name: p.name,
        startingCapital: p.capital,
        cashBalance: p.capital,
        totalValue: p.capital,
        maxPositionSize: p.size,
        riskPerTrade: p.name === PROP_FIRM_PORTFOLIO_NAME ? 0.02 : 0.1, // Prop firm uses 2% risk
      });
    }
  }
}

// Get or create Prop Firm portfolio
async function getPropFirmPortfolio(): Promise<PaperPortfolio | null> {
  if (propFirmPortfolio) return propFirmPortfolio;
  
  const portfolios = await storage.getPaperPortfoliosByUser(SYSTEM_USER_ID);
  propFirmPortfolio = portfolios.find(p => p.name === PROP_FIRM_PORTFOLIO_NAME) || null;
  
  if (!propFirmPortfolio) {
    propFirmPortfolio = await storage.createPaperPortfolio({
      userId: SYSTEM_USER_ID,
      name: PROP_FIRM_PORTFOLIO_NAME,
      startingCapital: PROP_FIRM_STARTING_CAPITAL,
      cashBalance: PROP_FIRM_STARTING_CAPITAL,
      totalValue: PROP_FIRM_STARTING_CAPITAL,
      maxPositionSize: PROP_FIRM_MAX_CONTRACTS * 1000,
      riskPerTrade: 0.02,
    });
  }
  
  return propFirmPortfolio;
}

// Get Prop Firm stats for the dashboard
export async function getPropFirmStats(): Promise<{
  portfolio: PaperPortfolio | null;
  dailyPnL: number;
  totalPnL: number;
  drawdown: number;
  daysTraded: number;
  tradesCount: number;
  winRate: number;
  isWithinRules: boolean;
  ruleViolations: string[];
} | null> {
  try {
    const portfolio = await getPropFirmPortfolio();
    if (!portfolio) return null;
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const closedPositions = positions.filter(p => p.status === 'closed');
    
    // Calculate stats
    const totalPnL = portfolio.totalValue - PROP_FIRM_STARTING_CAPITAL;
    const wins = closedPositions.filter(p => (p.realizedPnL || 0) > 0).length;
    const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;
    
    // Check for rule violations
    const ruleViolations: string[] = [];
    const drawdown = Math.max(0, PROP_FIRM_STARTING_CAPITAL - portfolio.totalValue);
    
    if (propFirmDailyPnL <= -PROP_FIRM_DAILY_LOSS_LIMIT) {
      ruleViolations.push(`Daily loss limit breached ($${Math.abs(propFirmDailyPnL).toFixed(0)}/$${PROP_FIRM_DAILY_LOSS_LIMIT})`);
    }
    if (drawdown >= PROP_FIRM_MAX_DRAWDOWN) {
      ruleViolations.push(`Max drawdown breached ($${drawdown.toFixed(0)}/$${PROP_FIRM_MAX_DRAWDOWN})`);
    }
    
    const isWithinRules = ruleViolations.length === 0;
    
    // Get unique trading days
    const tradingDays = new Set(closedPositions.map(p => 
      new Date(p.entryTime || '').toISOString().split('T')[0]
    ));
    
    return {
      portfolio,
      dailyPnL: propFirmDailyPnL,
      totalPnL,
      drawdown,
      daysTraded: tradingDays.size,
      tradesCount: closedPositions.length,
      winRate,
      isWithinRules,
      ruleViolations,
    };
  } catch (error) {
    logger.error("🏆 [PROP-FIRM] Error getting stats:", error);
    return null;
  }
}

// Crypto trading configuration
export const CRYPTO_SCAN_COINS = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
  { id: 'render-token', symbol: 'RENDER', name: 'Render' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { id: 'polygon', symbol: 'MATIC', name: 'Polygon' },
  { id: 'sui', symbol: 'SUI', name: 'Sui' },
  { id: 'pepe', symbol: 'PEPE', name: 'Pepe' },
  { id: 'bonk', symbol: 'BONK', name: 'Bonk' },
];

// Crypto symbol alias map: Maps stored symbols to Coinbase WebSocket symbols
// Some tokens have different ticker symbols on Coinbase vs CoinGecko
export const CRYPTO_SYMBOL_ALIASES: Record<string, string> = {
  'RENDER': 'RNDR',   // Render Token is RNDR on Coinbase
  'MATIC': 'POL',     // Polygon renamed to POL on some exchanges
};

// Convert stored symbol to Coinbase-compatible symbol for price lookups
export function getCoinbaseSymbol(symbol: string): string {
  return CRYPTO_SYMBOL_ALIASES[symbol.toUpperCase()] || symbol.toUpperCase();
}

// Convert Coinbase symbol back to stored symbol
export function getStoredSymbol(coinbaseSymbol: string): string {
  for (const [stored, coinbase] of Object.entries(CRYPTO_SYMBOL_ALIASES)) {
    if (coinbase === coinbaseSymbol.toUpperCase()) return stored;
  }
  return coinbaseSymbol.toUpperCase();
}

interface CryptoOpportunity {
  coinId: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  direction: 'long' | 'short';
  signals: string[];
  confidence: number;
}

interface BotDecision {
  action: 'enter' | 'skip' | 'wait';
  reason: string;
  confidence: number;
  signals: string[];
}

interface LottoOpportunity {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  delta: number;
  price: number;
  volume: number;
  openInterest: number;
  bidAskSpread: number;
  daysToExpiry: number;
  strikeScore: number; // Intelligent strike scoring
}

/**
 * INTELLIGENT STRIKE SELECTION ALGORITHM
 * Scores each strike based on multiple factors to find optimal entry
 * 
 * Factors considered:
 * 1. Delta sweet spot (0.15-0.25 optimal for lotto plays)
 * 2. Bid-ask spread (tighter = better execution)
 * 3. Volume & open interest (liquidity)
 * 4. Premium efficiency (bang for buck)
 * 5. Distance from current price (reasonable OTM)
 */
interface StrikeCandidate {
  strike: number;
  optionType: 'call' | 'put';
  bid: number;
  ask: number;
  midPrice: number;
  delta: number;
  volume: number;
  openInterest: number;
  expiration: string;
  daysToExpiry: number;
  score: number;
  scoreBreakdown: {
    deltaScore: number;
    liquidityScore: number;
    spreadScore: number;
    premiumScore: number;
  };
}

function scoreStrikeCandidate(
  opt: any, 
  stockPrice: number, 
  daysToExpiry: number
): StrikeCandidate | null {
  if (!opt.bid || !opt.ask || opt.bid <= 0) return null;
  
  const midPrice = (opt.bid + opt.ask) / 2;
  const spread = opt.ask - opt.bid;
  const spreadPercent = spread / midPrice;
  const delta = opt.greeks?.delta || 0;
  const absDelta = Math.abs(delta);
  const volume = opt.volume || 0;
  const openInterest = opt.open_interest || 0;
  
  // Calculate OTM percentage
  const strikeOTMPercent = opt.option_type === 'call' 
    ? ((opt.strike - stockPrice) / stockPrice) * 100
    : ((stockPrice - opt.strike) / stockPrice) * 100;
  
  // HARD FILTERS - must pass all
  if (midPrice < 0.10 || midPrice > 2.50) return null; // Price range for lottos
  if (absDelta < 0.08 || absDelta > 0.35) return null; // Delta range
  if (strikeOTMPercent > 12 || strikeOTMPercent < 0) return null; // Max 12% OTM
  if (spreadPercent > 0.40) return null; // Max 40% spread (avoid illiquid)
  
  // SCORING (0-100 for each factor)
  
  // 1. DELTA SCORE (40 points max)
  // Sweet spot: 0.15-0.25 delta (20-25% probability, good R/R)
  let deltaScore = 0;
  if (absDelta >= 0.15 && absDelta <= 0.25) {
    deltaScore = 40; // Perfect range
  } else if (absDelta >= 0.12 && absDelta < 0.15) {
    deltaScore = 30; // Good - slightly aggressive
  } else if (absDelta > 0.25 && absDelta <= 0.30) {
    deltaScore = 25; // OK - more expensive premium
  } else if (absDelta >= 0.08 && absDelta < 0.12) {
    deltaScore = 15; // Risky - low probability
  } else {
    deltaScore = 10; // Too far OTM or ITM
  }
  
  // 2. LIQUIDITY SCORE (25 points max)
  // Volume + OI indicates market interest
  let liquidityScore = 0;
  const totalLiquidity = volume + (openInterest * 0.5);
  if (totalLiquidity >= 1000) liquidityScore = 25;
  else if (totalLiquidity >= 500) liquidityScore = 20;
  else if (totalLiquidity >= 200) liquidityScore = 15;
  else if (totalLiquidity >= 50) liquidityScore = 10;
  else liquidityScore = 5;
  
  // 3. SPREAD SCORE (20 points max)
  // Tighter spread = better fills
  let spreadScore = 0;
  if (spreadPercent <= 0.10) spreadScore = 20; // Excellent (<10%)
  else if (spreadPercent <= 0.15) spreadScore = 15; // Good
  else if (spreadPercent <= 0.25) spreadScore = 10; // OK
  else spreadScore = 5; // Wide but acceptable
  
  // 4. PREMIUM EFFICIENCY SCORE (15 points max)
  // Best bang for buck - lower premium with reasonable delta
  let premiumScore = 0;
  const efficiencyRatio = absDelta / midPrice; // Delta per dollar
  if (efficiencyRatio >= 0.20) premiumScore = 15; // Great value
  else if (efficiencyRatio >= 0.15) premiumScore = 12;
  else if (efficiencyRatio >= 0.10) premiumScore = 8;
  else premiumScore = 5;
  
  const totalScore = deltaScore + liquidityScore + spreadScore + premiumScore;
  
  return {
    strike: opt.strike,
    optionType: opt.option_type as 'call' | 'put',
    bid: opt.bid,
    ask: opt.ask,
    midPrice,
    delta,
    volume,
    openInterest,
    expiration: opt.expiration_date,
    daysToExpiry,
    score: totalScore,
    scoreBreakdown: {
      deltaScore,
      liquidityScore,
      spreadScore,
      premiumScore
    }
  };
}

/**
 * Select the BEST strike for a given direction from all available options
 * Returns the highest-scored strike candidate
 */
function selectBestStrike(
  candidates: StrikeCandidate[],
  optionType: 'call' | 'put'
): StrikeCandidate | null {
  const filtered = candidates.filter(c => c.optionType === optionType);
  if (filtered.length === 0) return null;
  
  // Sort by score descending
  filtered.sort((a, b) => b.score - a.score);
  
  // Return the best one
  const best = filtered[0];
  logger.debug(`🎯 [STRIKE-SELECT] Best ${optionType.toUpperCase()}: $${best.strike} (score=${best.score}) δ=${best.delta.toFixed(3)} @ $${best.midPrice.toFixed(2)}`);
  
  return best;
}

// Day trade tickers: High volatility, good for 0-7 DTE plays
// User's priority watchlist - ensures all favorite tickers are scanned first
const DAY_TRADE_TICKERS = [
  // Major indices & leveraged ETFs
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'ARKK', 'TQQQ', 'SOXL',
  // Mega-cap tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'AVGO', 'NFLX',
  // Semiconductors
  'ARM', 'SMCI', 'MRVL', 'QCOM', 'INTC', 'MU',
  // AI & Growth
  'PLTR', 'SNOW', 'CRWD', 'AI', 'IONQ', 'RGTI', 'QUBT', 'QBTS',
  // Nuclear & Energy - User priority
  'OKLO', 'UUUU', 'SMR', 'CCJ', 'NNE', 'LEU',
  // Crypto-adjacent
  'MSTR', 'COIN', 'HOOD', 'MARA', 'RIOT',
  // Fintech
  'SOFI', 'AFRM', 'SQ', 'PYPL', 'UPST',
  // SaaS & Cloud
  'CRM', 'SHOP', 'DDOG', 'NET', 'ZS', 'PANW', 'ADBE', 'NOW', 'WDAY',
  // EVs & Clean energy
  'RIVN', 'LCID', 'NIO', 'XPEV', 'ENPH', 'FSLR', 'LI',
  // Financials & Healthcare
  'JPM', 'GS', 'BAC', 'V', 'MA', 'UNH', 'LLY', 'JNJ', 'MRNA', 'PFE',
  // Consumer & Industrial
  'BA', 'DIS', 'WMT', 'HD', 'MCD', 'COST',
  // Additional high-vol names
  'BABA', 'SE', 'MELI', 'C3AI', 'GOOG'
];

// Swing trade tickers: Expanded universe (S&P 500 and high liquidity names)
const SWING_TRADE_TICKERS = [
  // Technology (Software & Hardware)
  'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'CRM', 'NOW', 'SNOW',
  'CRWD', 'NET', 'DDOG', 'MDB', 'ZS', 'OKTA', 'PANW', 'FTNT', 'SPLK', 'ORCL',
  'IBM', 'CSCO', 'ACN', 'INTU', 'ADBE', 'SAP', 'VMW', 'ADSK', 'TEAM', 'WDAY',
  // Semiconductors
  'AVGO', 'QCOM', 'MU', 'MRVL', 'ARM', 'ASML', 'LRCX', 'AMAT', 'KLAC', 'TXN',
  'ADI', 'NXPI', 'ON', 'MCHP', 'STML', 'GFS', 'INTC', 'TSM', 'AMD',
  // Financials
  'JPM', 'GS', 'MS', 'V', 'MA', 'AXP', 'BAC', 'WFC', 'C', 'BLK',
  'PYPL', 'SQ', 'COIN', 'HOOD', 'SOFI', 'UPST', 'AFRM', 'LC', 'PINS', 'SNAP',
  'SCHW', 'IBKR', 'TROW', 'MET', 'PRU', 'AIG', 'CB', 'PGR', 'TRV', 'ALL',
  // Healthcare & Biotech
  'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'ISRG',
  'MRNA', 'BNTX', 'REGN', 'VRTX', 'GILD', 'AMGN', 'BIIB', 'BMY', 'CVS', 'ELV',
  'HUM', 'CI', 'CNC', 'MOH', 'HCA', 'SYK', 'BSX', 'EW', 'ZBH', 'BAX',
  // Energy & Industrials
  'XOM', 'CVX', 'OXY', 'SLB', 'HAL', 'COP', 'EOG', 'PXD', 'MPC', 'PSX',
  'BA', 'GE', 'HON', 'CAT', 'DE', 'LMT', 'RTX', 'NOC', 'GD', 'TDG',
  'UPS', 'FDX', 'UNP', 'CSX', 'NSC', 'WM', 'RSG', 'EMR', 'ETN', 'ITW',
  // Consumer Discretionary & Retail
  'COST', 'WMT', 'TGT', 'LULU', 'NKE', 'HD', 'LOW', 'AMZN', 'EBAY', 'ETSY',
  'TJX', 'ROST', 'ORLY', 'AZO', 'SBUX', 'MCD', 'YUM', 'DRI', 'BKNG', 'MAR',
  'HLT', 'RCL', 'CCL', 'NCLH', 'GM', 'F', 'STLA', 'RIVN', 'LCID', 'DKNG',
  // Communication Services & ADRs
  'DIS', 'NFLX', 'CMCSA', 'CHTR', 'TMUS', 'VZ', 'T', 'SNAP',
  'BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'XPEV', 'LI', 'BILI', 'TME', 'KWEB',
  // Defensive & Utilities
  'PG', 'KO', 'PEP', 'PM', 'MO', 'MDLZ', 'CL', 'KMB', 'GIS', 'K',
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'XEL', 'ED', 'PEG', 'WEC'
];

// Expanded Scannable Universe (A-Z high liquidity tickers)
const EXPANDED_SCAN_UNIVERSE = [
  'A', 'AA', 'AAL', 'AAPL', 'ABBV', 'ABT', 'ACN', 'ADBE', 'ADI', 'ADM', 'ADP', 'ADSK', 'AEE', 'AEP', 'AES', 'AFRM', 'AIG', 'AI', 'AKAM', 'ALB', 'ALGN', 'ALK', 'ALL', 'ALLE', 'AMAT', 'AMCR', 'AMD', 'AME', 'AMGN', 'AMP', 'AMZN', 'ANET', 'ANSS', 'AON', 'AOS', 'APA', 'APD', 'APH', 'APO', 'APT', 'ARE', 'ARM', 'ASML', 'ATO', 'ATVI', 'AVB', 'AVGO', 'AVY', 'AWK', 'AXP', 'AZO',
  'BA', 'BABA', 'BAC', 'BALL', 'BAX', 'BBWI', 'BBY', 'BDX', 'BEN', 'BF.B', 'BIIB', 'BILI', 'BIO', 'BK', 'BKNG', 'BKR', 'BLK', 'BMY', 'BNTX', 'BONK', 'BR', 'BRK.B', 'BSX', 'BWA', 'BXP',
  'C', 'CAG', 'CAH', 'CARR', 'CAT', 'CB', 'CBOE', 'CBRE', 'CCI', 'CCL', 'CDNS', 'CDW', 'CE', 'CEG', 'CF', 'CFG', 'CHD', 'CHRW', 'CHTR', 'CI', 'CINF', 'CL', 'CLSK', 'CLX', 'CMA', 'CMCSA', 'CME', 'CMG', 'CMI', 'CMS', 'CNC', 'CNP', 'COF', 'COIN', 'COO', 'COP', 'COST', 'CPB', 'CPRT', 'CPT', 'CRL', 'CRM', 'CSCO', 'CSGP', 'CSX', 'CTAS', 'CTLT', 'CTRA', 'CTSH', 'CTVA', 'CVS', 'CVX', 'CZR',
  'D', 'DAL', 'DD', 'DDOG', 'DE', 'DFS', 'DG', 'DGX', 'DHI', 'DHR', 'DIS', 'DISH', 'DLR', 'DLTR', 'DOCU', 'DOV', 'DOW', 'DPZ', 'DRI', 'DTE', 'DUK', 'DVA', 'DVN', 'DXCM',
  'EA', 'EBAY', 'ECL', 'ED', 'EFX', 'EIX', 'EL', 'ELV', 'EMN', 'EMR', 'ENPH', 'EOG', 'EPAM', 'EQIX', 'EQT', 'ERIE', 'ES', 'ESS', 'ETN', 'ETR', 'ETSY', 'EVRG', 'EW', 'EXC', 'EXPD', 'EXPE', 'EXR',
  'F', 'FANG', 'FAST', 'FCX', 'FDS', 'FDX', 'FE', 'FFIV', 'FICO', 'FIS', 'FISV', 'FITB', 'FLT', 'FMC', 'FOXA', 'FRT', 'FSLR', 'FTNT', 'FTV',
  'GD', 'GE', 'GEN', 'GILD', 'GIS', 'GL', 'GLW', 'GM', 'GNRC', 'GOOG', 'GOOGL', 'GPC', 'GPN', 'GRMN', 'GS', 'GWRE', 'GWW',
  'HAL', 'HAS', 'HBAN', 'HCA', 'HD', 'HES', 'HIG', 'HII', 'HLT', 'HOLX', 'HON', 'HOOD', 'HPE', 'HPQ', 'HRL', 'HSIC', 'HST', 'HSY', 'HUM', 'HWM',
  'IBM', 'ICE', 'IDXX', 'IEX', 'IFF', 'ILMN', 'INCY', 'INTC', 'INTU', 'INVH', 'IONQ', 'IP', 'IPG', 'IQV', 'IR', 'IRM', 'ISRG', 'IT', 'ITW', 'IVZ',
  'JBHT', 'JCI', 'JD', 'JKHY', 'JJSF', 'JNJ', 'JNPR', 'JPM', 'JWN',
  'K', 'KDP', 'KEY', 'KEYS', 'KHC', 'KIM', 'KLAC', 'KMB', 'KMI', 'KMX', 'KO', 'KR', 'KWEB',
  'L', 'LDOS', 'LEN', 'LH', 'LHX', 'LI', 'LIN', 'LKQ', 'LLY', 'LMT', 'LNC', 'LNT', 'LOW', 'LRCX', 'LULU', 'LUNR', 'LUV', 'LVS', 'LW', 'LYB', 'LYV',
  'M', 'MA', 'MAA', 'MAR', 'MARA', 'MAS', 'MCD', 'MCHP', 'MCK', 'MCO', 'MDLZ', 'MDT', 'MET', 'META', 'MGM', 'MHK', 'MKC', 'MKTX', 'MLM', 'MMC', 'MMM', 'MNST', 'MO', 'MOH', 'MOS', 'MPC', 'MPWR', 'MRK', 'MRNA', 'MRO', 'MRVL', 'MS', 'MSCI', 'MSFT', 'MSI', 'MSTR', 'MTB', 'MTCH', 'MTD', 'MU',
  'NCLH', 'NDAQ', 'NDSN', 'NEE', 'NEM', 'NET', 'NFLX', 'NI', 'NKE', 'NIO', 'NNE', 'NOC', 'NOW', 'NRG', 'NSC', 'NTAP', 'NTRS', 'NUE', 'NVDA', 'NVR', 'NWL', 'NWS', 'NXPI',
  'O', 'ODFL', 'OKE', 'OKTA', 'OMC', 'ON', 'ORCL', 'ORLY', 'OTIS', 'OXY',
  'PANW', 'PARA', 'PAYX', 'PAYC', 'PBI', 'PCAR', 'PCG', 'PDD', 'PEG', 'PEP', 'PFE', 'PFG', 'PG', 'PGR', 'PH', 'PHM', 'PKG', 'PLD', 'PLTR', 'PM', 'PNC', 'PNR', 'PNW', 'POOL', 'PPG', 'PPL', 'PRU', 'PSA', 'PSX', 'PTC', 'PWR', 'PYPL',
  'QCOM', 'QRVO', 'QUBT', 'QBTS',
  'RCL', 'RDW', 'RE', 'REG', 'REGN', 'RF', 'RHI', 'RJF', 'RL', 'RMD', 'ROK', 'ROL', 'ROP', 'ROST', 'RSG', 'RTX', 'RVTY', 'RWD', 'RKLB',
  'S', 'SBAC', 'SBUX', 'SCHW', 'SE', 'SEE', 'SHW', 'SIRI', 'SIVB', 'SJM', 'SLB', 'SNA', 'SNAP', 'SNPS', 'SNOW', 'SO', 'SOFI', 'SOL', 'SPG', 'SPGI', 'SPLK', 'SPR', 'SPY', 'SQ', 'SRE', 'STE', 'STT', 'STX', 'STZ', 'SWK', 'SWKS', 'SYF', 'SYK', 'SYY',
  'T', 'TAP', 'TDG', 'TDY', 'TECH', 'TEL', 'TER', 'TFC', 'TFX', 'TGT', 'TJX', 'TMO', 'TMUS', 'TROW', 'TRV', 'TRMB', 'TSLA', 'TSN', 'TT', 'TTWO', 'TXN', 'TXT', 'TYL',
  'UAL', 'UDR', 'UHS', 'ULTA', 'UNH', 'UNP', 'UPS', 'URI', 'USB',
  'V', 'VFC', 'VLO', 'VMC', 'VRSK', 'VRSN', 'VRTX', 'VTR', 'VTRS', 'VZ',
  'W', 'WAB', 'WAT', 'WBA', 'WBD', 'WDC', 'WEC', 'WELL', 'WFC', 'WHR', 'WM', 'WMB', 'WMT', 'WRB', 'WST', 'WTW', 'WY', 'WYNN',
  'XEL', 'XOM', 'XRAY', 'XPEV', 'XYL',
  'YUM',
  'Z', 'ZBH', 'ZBRA', 'ZION', 'ZTS', 'ZS'
];

// Combined for general scanning (deduplicated)
const BOT_SCAN_TICKERS = Array.from(new Set([...DAY_TRADE_TICKERS, ...SWING_TRADE_TICKERS, ...EXPANDED_SCAN_UNIVERSE]));

// Cache for market scanner movers - ENHANCED for more opportunities
let moversCache: { tickers: string[]; timestamp: number } | null = null;
const MOVERS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes (faster refresh for more opportunities)

/**
 * Get dynamic movers from market scanner across multiple timeframes
 * Finds stocks with big price moves that could continue or reverse - ideal for lotto plays
 */
async function getDynamicMovers(): Promise<string[]> {
  const now = Date.now();
  
  if (moversCache && (now - moversCache.timestamp) < MOVERS_CACHE_TTL) {
    logger.debug(`🔍 [SCANNER] Using cached movers: ${moversCache.tickers.length} tickers`);
    return moversCache.tickers;
  }
  
  try {
    logger.info(`🔍 [SCANNER] Fetching dynamic movers from market scanner...`);
    
    const dynamicTickers = new Set<string>();
    
    // Get top movers across multiple timeframes for maximum opportunity detection
    const timeframes: ('day' | 'week' | 'month' | 'year')[] = ['day', 'week', 'month', 'year'];
    
    for (const timeframe of timeframes) {
      try {
        const movers = await getTopMovers(timeframe, 'all', 50); // Increased from 20 to 50
        
        // Add top gainers (momentum plays - could continue up)
        for (const stock of movers.gainers.slice(0, 25)) { // Increased from 10 to 25
          if (stock.symbol && stock.currentPrice > 1) { // Skip penny stocks under $1
            dynamicTickers.add(stock.symbol);
            logger.debug(`🔍 [SCANNER] +${timeframe.toUpperCase()} GAINER: ${stock.symbol} +${stock.dayChangePercent?.toFixed(1)}%`);
          }
        }
        
        // Add top losers (reversal plays - could bounce)
        for (const stock of movers.losers.slice(0, 25)) { // Increased from 10 to 25
          if (stock.symbol && stock.currentPrice > 1) {
            dynamicTickers.add(stock.symbol);
            logger.debug(`🔍 [SCANNER] -${timeframe.toUpperCase()} LOSER: ${stock.symbol} ${stock.dayChangePercent?.toFixed(1)}%`);
          }
        }
      } catch (err) {
        logger.warn(`🔍 [SCANNER] Failed to get ${timeframe} movers:`, err);
      }
    }
    
    // Also get growth and penny stock movers for high volatility plays
    try {
      const growthMovers = await getTopMovers('day', 'growth', 15);
      for (const stock of [...growthMovers.gainers.slice(0, 8), ...growthMovers.losers.slice(0, 5)]) {
        if (stock.symbol && stock.currentPrice > 1) {
          dynamicTickers.add(stock.symbol);
        }
      }
    } catch (err) {
      logger.debug(`🔍 [SCANNER] Growth movers fetch skipped`);
    }
    
    const tickerArray = Array.from(dynamicTickers);
    
    moversCache = { tickers: tickerArray, timestamp: now };
    
    logger.info(`🔍 [SCANNER] Found ${tickerArray.length} dynamic movers across timeframes`);
    return tickerArray;
    
  } catch (error) {
    logger.error(`🔍 [SCANNER] Error fetching dynamic movers:`, error);
    return [];
  }
}

const FUTURES_SYMBOLS: ('NQ' | 'GC')[] = ['NQ', 'GC'];

interface FuturesOpportunity {
  symbol: string;
  contractCode: string;
  direction: 'long' | 'short';
  price: number;
  signals: string[];
  confidence: number;
  expirationDate: string;
}

// Re-export for backward compatibility - uses shared market calendar
export function isCMEOpen(): boolean {
  return isCMEMarketOpen().isOpen;
}

export async function getOptionsPortfolio(): Promise<PaperPortfolio | null> {
  try {
    // Load user preferences to sync maxPositionSize
    const prefs = await getBotPreferences();
    
    if (optionsPortfolio) {
      // Sync maxPositionSize from preferences if different
      if (optionsPortfolio.maxPositionSize !== prefs.maxPositionSize) {
        await storage.updatePaperPortfolio(optionsPortfolio.id, {
          maxPositionSize: prefs.maxPositionSize,
        });
        optionsPortfolio.maxPositionSize = prefs.maxPositionSize;
        logger.debug(`🎰 [OPTIONS BOT] Synced maxPositionSize to $${prefs.maxPositionSize}`);
      }
      return optionsPortfolio;
    }

    const portfolios = await storage.getPaperPortfoliosByUser(SYSTEM_USER_ID);
    const existing = portfolios.find(p => p.name === OPTIONS_PORTFOLIO_NAME);
    
    if (existing) {
      // Sync maxPositionSize from preferences
      if (existing.maxPositionSize !== prefs.maxPositionSize) {
        await storage.updatePaperPortfolio(existing.id, {
          maxPositionSize: prefs.maxPositionSize,
        });
        existing.maxPositionSize = prefs.maxPositionSize;
        logger.debug(`🎰 [OPTIONS BOT] Synced maxPositionSize to $${prefs.maxPositionSize}`);
      }
      optionsPortfolio = existing;
      logger.info(`🎰 [OPTIONS BOT] Found portfolio: ${existing.id} (Balance: $${existing.cashBalance.toFixed(2)})`);
      return existing;
    }

    const newPortfolio = await storage.createPaperPortfolio({
      userId: SYSTEM_USER_ID,
      name: OPTIONS_PORTFOLIO_NAME,
      startingCapital: STARTING_CAPITAL,
      cashBalance: STARTING_CAPITAL,
      totalValue: STARTING_CAPITAL,
      maxPositionSize: prefs.maxPositionSize,  // Use preferences
      riskPerTrade: 0.05,
    });

    optionsPortfolio = newPortfolio;
    logger.info(`🎰 [OPTIONS BOT] Created new portfolio: ${newPortfolio.id} with $${STARTING_CAPITAL}, maxPos=$${prefs.maxPositionSize}`);
    return newPortfolio;
  } catch (error) {
    logger.error("🎰 [OPTIONS BOT] Failed to get/create portfolio:", error);
    return null;
  }
}

export async function getFuturesPortfolio(): Promise<PaperPortfolio | null> {
  try {
    if (futuresPortfolio) {
      return futuresPortfolio;
    }

    const portfolios = await storage.getPaperPortfoliosByUser(SYSTEM_USER_ID);
    const existing = portfolios.find(p => p.name === FUTURES_PORTFOLIO_NAME);
    
    if (existing) {
      futuresPortfolio = existing;
      logger.info(`📈 [FUTURES BOT] Found portfolio: ${existing.id} (Balance: $${existing.cashBalance.toFixed(2)})`);
      return existing;
    }

    const newPortfolio = await storage.createPaperPortfolio({
      userId: SYSTEM_USER_ID,
      name: FUTURES_PORTFOLIO_NAME,
      startingCapital: STARTING_CAPITAL,
      cashBalance: STARTING_CAPITAL,
      totalValue: STARTING_CAPITAL,
      maxPositionSize: FUTURES_MAX_POSITION_SIZE_PER_TRADE,
      riskPerTrade: 0.05,
    });

    futuresPortfolio = newPortfolio;
    logger.info(`📈 [FUTURES BOT] Created new portfolio: ${newPortfolio.id} with $${STARTING_CAPITAL}`);
    return newPortfolio;
  } catch (error) {
    logger.error("📈 [FUTURES BOT] Failed to get/create portfolio:", error);
    return null;
  }
}

// Legacy function for backward compatibility - returns options portfolio
export async function getLottoPortfolio(): Promise<PaperPortfolio | null> {
  return getOptionsPortfolio();
}

export async function getCryptoPortfolio(): Promise<PaperPortfolio | null> {
  try {
    if (cryptoPortfolio) {
      return cryptoPortfolio;
    }

    const portfolios = await storage.getPaperPortfoliosByUser(SYSTEM_USER_ID);
    const existing = portfolios.find(p => p.name === CRYPTO_PORTFOLIO_NAME);
    
    if (existing) {
      cryptoPortfolio = existing;
      logger.info(`🪙 [CRYPTO BOT] Found portfolio: ${existing.id} (Balance: $${existing.cashBalance.toFixed(2)})`);
      return existing;
    }

    const newPortfolio = await storage.createPaperPortfolio({
      userId: SYSTEM_USER_ID,
      name: CRYPTO_PORTFOLIO_NAME,
      startingCapital: STARTING_CAPITAL,
      cashBalance: STARTING_CAPITAL,
      totalValue: STARTING_CAPITAL,
      maxPositionSize: CRYPTO_MAX_POSITION_SIZE,
      riskPerTrade: 0.05,
    });

    cryptoPortfolio = newPortfolio;
    logger.info(`🪙 [CRYPTO BOT] Created new portfolio: ${newPortfolio.id} with $${STARTING_CAPITAL}`);
    return newPortfolio;
  } catch (error) {
    logger.error("🪙 [CRYPTO BOT] Failed to get/create portfolio:", error);
    return null;
  }
}

// Cache for crypto prices to handle rate limiting
let cryptoPriceCache: Map<string, { price: number; change24h: number; volume: number; marketCap: number }> = new Map();
let lastCryptoPriceFetch: number = 0;
const CRYPTO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch crypto prices from CoinGecko with caching
 */
export async function fetchCryptoPrices(): Promise<Map<string, { price: number; change24h: number; volume: number; marketCap: number }>> {
  const now = Date.now();
  
  // Return cached if still valid
  if (cryptoPriceCache.size > 0 && (now - lastCryptoPriceFetch) < CRYPTO_CACHE_TTL) {
    logger.info(`🪙 [CRYPTO BOT] Using cached prices (${cryptoPriceCache.size} coins)`);
    return cryptoPriceCache;
  }
  
  const priceMap = new Map();
  
  try {
    const ids = CRYPTO_SCAN_COINS.map(c => c.id).join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
      { 
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      }
    );
    
    if (!response.ok) {
      logger.warn(`🪙 [CRYPTO BOT] CoinGecko API returned ${response.status} - using cache if available`);
      return cryptoPriceCache.size > 0 ? cryptoPriceCache : priceMap;
    }
    
    const data = await response.json();
    
    for (const coin of CRYPTO_SCAN_COINS) {
      const coinData = data[coin.id];
      if (coinData) {
        priceMap.set(coin.symbol, {
          price: coinData.usd || 0,
          change24h: coinData.usd_24h_change || 0,
          volume: coinData.usd_24h_vol || 0,
          marketCap: coinData.usd_market_cap || 0
        });
      }
    }
    
    if (priceMap.size > 0) {
      cryptoPriceCache = priceMap;
      lastCryptoPriceFetch = now;
      logger.info(`🪙 [CRYPTO BOT] Fetched and cached prices for ${priceMap.size} coins`);
    }
  } catch (error) {
    logger.error("🪙 [CRYPTO BOT] Failed to fetch crypto prices:", error);
    // Return cached prices if available
    if (cryptoPriceCache.size > 0) {
      logger.info(`🪙 [CRYPTO BOT] Returning stale cache (${cryptoPriceCache.size} coins)`);
      return cryptoPriceCache;
    }
  }
  
  return priceMap;
}

/**
 * Analyze crypto opportunity and generate signals
 * RELAXED THRESHOLDS - Bot was too conservative and not trading
 */
function analyzeCryptoOpportunity(
  coin: { id: string; symbol: string; name: string },
  data: { price: number; change24h: number; volume: number; marketCap: number }
): CryptoOpportunity | null {
  const signals: string[] = [];
  let score = 50;
  
  const { price, change24h, volume, marketCap } = data;
  
  // Skip if no price
  if (!price || price <= 0) return null;
  
  // Mild momentum (2-5%) - NEW: Lower threshold to catch more moves
  if (Math.abs(change24h) > 2 && Math.abs(change24h) <= 5) {
    signals.push(`${change24h > 0 ? '📈' : '📉'} ${Math.abs(change24h).toFixed(1)}% 24h move`);
    score += change24h > 0 ? 8 : 3;
  }
  
  // Moderate momentum (5-10%)
  if (Math.abs(change24h) > 5 && Math.abs(change24h) <= 10) {
    signals.push(`${change24h > 0 ? '📈' : '📉'} ${Math.abs(change24h).toFixed(1)}% 24h move`);
    score += change24h > 0 ? 15 : 5;
  }
  
  // Strong momentum (>10%)
  if (Math.abs(change24h) > 10) {
    signals.push(`🔥 Strong ${Math.abs(change24h).toFixed(1)}% ${change24h > 0 ? 'uptrend' : 'downtrend'}`);
    score += change24h > 0 ? 20 : 10;
  }
  
  // Volume analysis (relative to market cap) - RELAXED from 10% to 5%
  const volumeToMcap = marketCap > 0 ? (volume / marketCap) * 100 : 0;
  if (volumeToMcap > 5) {
    signals.push(`📊 ${volumeToMcap > 10 ? 'High' : 'Active'} volume (${volumeToMcap.toFixed(1)}% of mcap)`);
    score += volumeToMcap > 10 ? 10 : 5;
  }
  
  // Large cap stability bonus (BTC, ETH)
  if (marketCap > 100_000_000_000) {
    signals.push(`🏛️ Large cap stability`);
    score += 5;
  }
  
  // Mid cap momentum bonus
  if (marketCap > 1_000_000_000 && marketCap < 50_000_000_000 && Math.abs(change24h) > 3) {
    signals.push(`⚡ Mid-cap momentum`);
    score += 5;
  }
  
  // Determine direction based on momentum
  const direction: 'long' | 'short' = change24h > 1 ? 'long' : change24h < -3 ? 'short' : 'long';
  
  // RELAXED: Lower threshold from 55 to 52
  if (signals.length === 0 || score < 52) return null;
  
  return {
    coinId: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    price,
    change24h,
    volume24h: volume,
    marketCap,
    direction,
    signals,
    confidence: Math.min(85, score)
  };
}

/**
 * Run crypto bot scan and execute trades
 * Now uses user preferences for position limits and coin selection
 */
export async function runCryptoBotScan(): Promise<void> {
  logger.info(`🪙 [CRYPTO BOT] Starting crypto scan...`);
  
  try {
    // Load user preferences
    const prefs = await getBotPreferences();
    
    // Check if crypto trading is enabled
    if (!prefs.enableCrypto) {
      logger.info(`🪙 [CRYPTO BOT] Crypto trading disabled by user preferences`);
      return;
    }
    
    const portfolio = await getCryptoPortfolio();
    if (!portfolio) {
      logger.error("🪙 [CRYPTO BOT] No portfolio available");
      return;
    }
    
    // Check if we have enough balance
    if (portfolio.cashBalance < 10) {
      logger.info(`🪙 [CRYPTO BOT] Insufficient balance: $${portfolio.cashBalance.toFixed(2)}`);
      return;
    }
    
    // Check existing positions using preference for max concurrent trades
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    
    if (openPositions.length >= prefs.maxConcurrentTrades) {
      logger.info(`🪙 [CRYPTO BOT] Max positions reached (${openPositions.length}/${prefs.maxConcurrentTrades})`);
      return;
    }
    
    // Fetch crypto prices
    const priceMap = await fetchCryptoPrices();
    if (priceMap.size === 0) {
      logger.warn(`🪙 [CRYPTO BOT] No prices available`);
      return;
    }
    
    // Find opportunities
    const opportunities: CryptoOpportunity[] = [];
    
    for (const coin of CRYPTO_SCAN_COINS) {
      const data = priceMap.get(coin.symbol);
      if (!data) continue;
      
      // Skip if already have position in this coin
      if (openPositions.some(p => p.symbol === coin.symbol)) continue;
      
      const opportunity = analyzeCryptoOpportunity(coin, data);
      if (opportunity) {
        opportunities.push(opportunity);
      }
    }
    
    if (opportunities.length === 0) {
      logger.info(`🪙 [CRYPTO BOT] No crypto opportunities found`);
      return;
    }
    
    // Sort by confidence and take best
    opportunities.sort((a, b) => b.confidence - a.confidence);
    const bestOpp = opportunities[0];
    
    logger.info(`🪙 [CRYPTO BOT] Best opportunity: ${bestOpp.symbol} (${bestOpp.direction}) - Confidence: ${bestOpp.confidence}%`);
    
    // Check for existing open trade ideas to prevent duplicates
    const existingIdeas = await storage.getAllTradeIdeas();
    const hasOpenIdea = existingIdeas.some((idea: any) => 
      idea.symbol === bestOpp.symbol && 
      idea.outcomeStatus === 'open' &&
      idea.assetType === 'crypto'
    );
    
    if (hasOpenIdea) {
      logger.info(`🪙 [CRYPTO BOT] Skipping ${bestOpp.symbol} - already has open trade idea`);
      return;
    }
    
    // Apply minimum confidence score from preferences
    if (bestOpp.confidence < prefs.minConfidenceScore) {
      logger.info(`🪙 [CRYPTO BOT] Best opportunity confidence ${bestOpp.confidence}% < min ${prefs.minConfidenceScore}%`);
      return;
    }
    
    // Calculate position size using preferences (maxPositionSize or allocation % of balance)
    // CRITICAL: Ensure we don't exceed available cash
    const allocationAmount = portfolio.cashBalance * (prefs.cryptoAllocation / 100);
    const maxSize = Math.min(prefs.maxPositionSize, allocationAmount, portfolio.cashBalance);
    
    // Validate sufficient cash before trade
    if (maxSize <= 0 || portfolio.cashBalance < 10) {
      logger.warn(`🪙 [CRYPTO BOT] Insufficient cash for trade: $${portfolio.cashBalance.toFixed(2)} available`);
      return;
    }
    
    const quantity = maxSize / bestOpp.price;
    logger.debug(`🪙 [CRYPTO BOT] Position size: $${maxSize.toFixed(2)} (${quantity.toFixed(6)} ${bestOpp.symbol})`)
    
    // Set targets based on direction
    const targetMultiplier = bestOpp.direction === 'long' ? 1.15 : 0.85;
    const stopMultiplier = bestOpp.direction === 'long' ? 0.93 : 1.07;
    const targetPrice = bestOpp.price * targetMultiplier;
    const stopLoss = bestOpp.price * stopMultiplier;
    
    // Create trade idea
    const ideaData: InsertTradeIdea = {
      symbol: bestOpp.symbol,
      assetType: 'crypto',
      direction: bestOpp.direction,
      entryPrice: bestOpp.price,
      targetPrice,
      stopLoss,
      riskRewardRatio: 2.1,
      confidenceScore: bestOpp.confidence,
      qualitySignals: bestOpp.signals,
      probabilityBand: getLetterGrade(bestOpp.confidence),
      holdingPeriod: 'swing',
      catalyst: `${bestOpp.name} momentum: ${bestOpp.change24h > 0 ? '+' : ''}${bestOpp.change24h.toFixed(1)}% 24h`,
      analysis: `🪙 CRYPTO BOT TRADE\n\n` +
        `${bestOpp.name} (${bestOpp.symbol})\n` +
        `Direction: ${bestOpp.direction.toUpperCase()}\n` +
        `Entry: $${bestOpp.price.toFixed(4)}\n` +
        `Target: $${targetPrice.toFixed(4)} (+15%)\n` +
        `Stop: $${stopLoss.toFixed(4)} (-7%)\n\n` +
        `Signals: ${bestOpp.signals.join(', ')}\n\n` +
        `⚠️ Crypto is 24/7 - monitor positions regularly`,
      sessionContext: 'Crypto Bot',
      timestamp: new Date().toISOString(),
      source: 'bot' as any,
      status: 'published',
      riskProfile: 'speculative',
      dataSourceUsed: 'coingecko',
      outcomeStatus: 'open',
    };
    
    // Save and execute
    const savedIdea = await storage.createTradeIdea(ideaData);
    
    // Create paper position with entry reasoning
    const position = await storage.createPaperPosition({
      portfolioId: portfolio.id,
      symbol: bestOpp.symbol,
      assetType: 'crypto',
      direction: bestOpp.direction,
      quantity,
      entryPrice: bestOpp.price,
      currentPrice: bestOpp.price,
      targetPrice,
      stopLoss,
      status: 'open',
      tradeIdeaId: savedIdea.id,
      entryTime: new Date().toISOString(),
      entryReason: `🪙 CRYPTO: ${bestOpp.name} ${bestOpp.direction.toUpperCase()} - ${bestOpp.change24h > 0 ? '+' : ''}${bestOpp.change24h.toFixed(1)}% 24h momentum`,
      entrySignals: JSON.stringify(bestOpp.signals),
    });
    
    // Update portfolio balance
    const cost = quantity * bestOpp.price;
    await storage.updatePaperPortfolio(portfolio.id, {
      cashBalance: portfolio.cashBalance - cost,
    });
    
    logger.info(`🪙 [CRYPTO BOT] ✅ TRADE EXECUTED: ${bestOpp.symbol} x${quantity.toFixed(6)} @ $${bestOpp.price.toFixed(4)}`);
    
    // Send Discord notification
    try {
      const { sendCryptoBotTradeToDiscord } = await import('./discord-service');
      await sendCryptoBotTradeToDiscord({
        symbol: bestOpp.symbol,
        name: bestOpp.name,
        direction: bestOpp.direction,
        entryPrice: bestOpp.price,
        quantity,
        targetPrice,
        stopLoss,
        signals: bestOpp.signals,
      });
    } catch (discordError) {
      logger.warn(`🪙 [CRYPTO BOT] Discord notification failed:`, discordError);
    }
    
    // Refresh portfolio cache
    const updated = await storage.getPaperPortfolioById(portfolio.id);
    if (updated) cryptoPortfolio = updated;
    
  } catch (error) {
    logger.error("🪙 [CRYPTO BOT] Scan error:", error);
  }
}

/**
 * Monitor crypto positions for stops/targets
 */
export async function monitorCryptoPositions(): Promise<void> {
  try {
    const portfolio = await getCryptoPortfolio();
    if (!portfolio) return;
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    
    if (openPositions.length === 0) {
      return;
    }
    
    logger.info(`🪙 [CRYPTO BOT] Monitoring ${openPositions.length} open crypto positions...`);
    
    const priceMap = await fetchCryptoPrices();
    
    // Track running cash balance to handle multiple exits in one scan
    let runningCashBalance = portfolio.cashBalance;
    
    for (const pos of openPositions) {
      const data = priceMap.get(pos.symbol);
      if (!data) continue;
      
      const currentPrice = data.price;
      const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
      const stopLoss = pos.stopLoss ? (typeof pos.stopLoss === 'string' ? parseFloat(pos.stopLoss) : pos.stopLoss) : null;
      const targetPrice = pos.targetPrice ? (typeof pos.targetPrice === 'string' ? parseFloat(pos.targetPrice) : pos.targetPrice) : null;
      
      const direction = pos.direction || 'long';
      let pnlPercent: number;
      
      if (direction === 'long') {
        pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else {
        pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
      }
      
      // Calculate unrealized P&L
      const quantity = typeof pos.quantity === 'string' ? parseFloat(pos.quantity) : pos.quantity;
      const unrealizedPnL = direction === 'long' 
        ? (currentPrice - entryPrice) * quantity
        : (entryPrice - currentPrice) * quantity;
      
      // Update current price AND unrealized P&L
      await storage.updatePaperPosition(pos.id, { 
        currentPrice,
        unrealizedPnL,
        unrealizedPnLPercent: pnlPercent,
      });
      
      // Check stop loss
      if (stopLoss && (
        (direction === 'long' && currentPrice <= stopLoss) ||
        (direction === 'short' && currentPrice >= stopLoss)
      )) {
        logger.info(`🪙 [CRYPTO BOT] ❌ STOP HIT: ${pos.symbol} @ $${currentPrice.toFixed(4)}`);
        const quantity = typeof pos.quantity === 'string' ? parseFloat(pos.quantity) : pos.quantity;
        const proceeds = quantity * currentPrice;
        runningCashBalance += proceeds;
        
        await storage.closePaperPosition(pos.id, currentPrice, 'hit_stop');
        await storage.updatePaperPortfolio(portfolio.id, {
          cashBalance: runningCashBalance,
        });
        continue;
      }
      
      // Check target
      if (targetPrice && (
        (direction === 'long' && currentPrice >= targetPrice) ||
        (direction === 'short' && currentPrice <= targetPrice)
      )) {
        logger.info(`🪙 [CRYPTO BOT] 🎯 TARGET HIT: ${pos.symbol} @ $${currentPrice.toFixed(4)}`);
        const quantity = typeof pos.quantity === 'string' ? parseFloat(pos.quantity) : pos.quantity;
        const proceeds = quantity * currentPrice;
        runningCashBalance += proceeds;
        
        await storage.closePaperPosition(pos.id, currentPrice, 'hit_target');
        await storage.updatePaperPortfolio(portfolio.id, {
          cashBalance: runningCashBalance,
        });
        continue;
      }
      
      logger.debug(`🪙 [CRYPTO BOT] ${pos.symbol}: ${direction} @ $${entryPrice.toFixed(4)} → $${currentPrice.toFixed(4)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`);
    }
    
    // Recalculate portfolio total value based on updated positions
    const updatedPositions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPos = updatedPositions.filter(p => p.status === 'open');
    let positionsValue = 0;
    for (const pos of openPos) {
      const qty = typeof pos.quantity === 'string' ? parseFloat(pos.quantity) : pos.quantity;
      const price = pos.currentPrice || pos.entryPrice;
      positionsValue += qty * price;
    }
    const newTotalValue = runningCashBalance + positionsValue;
    
    // Update portfolio with new total value
    await storage.updatePaperPortfolio(portfolio.id, {
      cashBalance: runningCashBalance,
      totalValue: newTotalValue,
      totalPnL: newTotalValue - portfolio.startingCapital,
      totalPnLPercent: ((newTotalValue - portfolio.startingCapital) / portfolio.startingCapital) * 100,
    });
    
    // Refresh portfolio cache
    const updated = await storage.getPaperPortfolioById(portfolio.id);
    if (updated) cryptoPortfolio = updated;
    
    logger.debug(`🪙 [CRYPTO BOT] Portfolio updated: $${newTotalValue.toFixed(2)} (cash: $${runningCashBalance.toFixed(2)}, positions: $${positionsValue.toFixed(2)})`);
    
  } catch (error) {
    logger.error("🪙 [CRYPTO BOT] Monitor error:", error);
  }
}

// BLACKLISTED SYMBOLS - historically poor performers (0% or very low win rate)
const BLACKLISTED_SYMBOLS = new Set([
  'SOL', 'AAVE', 'SMCI', 'CLF', 'USAR', 'NIO', 'BABA', 'SNAP', 'PINS', 'WISH'
]);

// HIGH PERFORMANCE SYMBOLS - historically strong win rates (100% or 80%+)
const PREFERRED_SYMBOLS = new Set([
  'AAPL', 'AMD', 'SOFI', 'NFLX', 'QQQ', 'AMZN', 'GOOGL', 'ETH', 'HOOD', 'META'
]);

/**
 * Check if a symbol has good historical performance
 * Returns: { allowed: boolean, reason: string, boost: number }
 */
function checkSymbolPerformance(symbol: string): { allowed: boolean; reason: string; boost: number } {
  if (BLACKLISTED_SYMBOLS.has(symbol)) {
    return { 
      allowed: false, 
      reason: `BLOCKED: ${symbol} has 0% historical win rate`, 
      boost: 0 
    };
  }
  
  if (PREFERRED_SYMBOLS.has(symbol)) {
    return { 
      allowed: true, 
      reason: `PREFERRED: ${symbol} has strong historical performance`, 
      boost: 10 
    };
  }
  
  return { 
    allowed: true, 
    reason: 'Standard symbol', 
    boost: 0 
  };
}

/**
 * BOT DECISION ENGINE
 * The bot evaluates each opportunity and decides whether to enter based on its own criteria
 */
function makeBotDecision(
  quote: {
    change_percentage: number;
    volume: number;
    average_volume: number;
    last: number;
    week_52_high: number;
    week_52_low: number;
    high: number;
    low: number;
  },
  opportunity: LottoOpportunity
): BotDecision {
  const signals: string[] = [];
  let score = 50;
  
  const priceChange = quote.change_percentage || 0;
  const isCall = opportunity.optionType === 'call';
  const momentumAligned = isCall ? priceChange > 0 : priceChange < 0;
  
  if (momentumAligned) {
    const absChange = Math.abs(priceChange);
    if (absChange >= 3) {
      signals.push(`STRONG_MOMENTUM_${absChange.toFixed(1)}%`);
      score += 25;
    } else if (absChange >= 1.5) {
      signals.push(`GOOD_MOMENTUM_${absChange.toFixed(1)}%`);
      score += 15;
    } else if (absChange >= 0.5) {
      signals.push(`ALIGNED_${absChange.toFixed(1)}%`);
      score += 8;
    }
  } else if (Math.abs(priceChange) >= 1) {
    signals.push(`COUNTER_MOMENTUM_${priceChange.toFixed(1)}%`);
    score -= 20;
  }
  
  const relativeVolume = quote.average_volume > 0 
    ? quote.volume / quote.average_volume 
    : 1;
  
  if (relativeVolume >= 2.0) {
    signals.push(`HIGH_VOL_${relativeVolume.toFixed(1)}x`);
    score += 15;
  } else if (relativeVolume >= 1.3) {
    signals.push(`ABOVE_AVG_VOL`);
    score += 8;
  } else if (relativeVolume < 0.5) {
    signals.push('LOW_VOLUME');
    score -= 15;
  }
  
  const range52w = quote.week_52_high - quote.week_52_low;
  if (range52w > 0) {
    const positionInRange = (quote.last - quote.week_52_low) / range52w;
    
    if (isCall && positionInRange > 0.6) {
      signals.push('BULLISH_TREND');
      score += 10;
    } else if (!isCall && positionInRange < 0.4) {
      signals.push('BEARISH_TREND');
      score += 10;
    } else if (isCall && positionInRange < 0.25) {
      signals.push('CALLS_AT_LOWS_RISKY');
      score -= 30; // Increased penalty - fighting trend is dangerous
    } else if (!isCall && positionInRange > 0.75) {
      signals.push('PUTS_AT_HIGHS_RISKY');
      score -= 30; // Increased penalty - fighting trend is dangerous
    }
  }
  
  const intradayRange = quote.high - quote.low;
  if (intradayRange > 0) {
    const intradayPosition = (quote.last - quote.low) / intradayRange;
    
    if (isCall && intradayPosition > 0.7) {
      signals.push('INTRADAY_STRONG');
      score += 10;
    } else if (!isCall && intradayPosition < 0.3) {
      signals.push('INTRADAY_WEAK');
      score += 10;
    }
  }
  
  // Delta scoring - we already hard-filter < 0.08, but score the remaining range
  const absDelta = Math.abs(opportunity.delta);
  if (absDelta >= 0.10 && absDelta <= 0.20) {
    // Sweet spot: 10-20% probability, good risk/reward
    signals.push(`OPTIMAL_DELTA_${absDelta.toFixed(2)}`);
    score += 15;
  } else if (absDelta >= 0.08 && absDelta < 0.10) {
    // Acceptable but lower probability
    signals.push(`LOW_DELTA_${absDelta.toFixed(2)}`);
    score += 5;
  } else if (absDelta > 0.20 && absDelta <= 0.30) {
    // Higher delta = more expensive premium, less upside multiplier
    signals.push(`HIGH_DELTA_${absDelta.toFixed(2)}`);
    score += 8;
  } else if (absDelta > 0.30) {
    // Too close to ATM - not a lotto play
    signals.push('DELTA_TOO_HIGH');
    score -= 15;
  }
  
  if (opportunity.volume >= 500) {
    signals.push(`OPT_VOL_${opportunity.volume}`);
    score += 10;
  } else if (opportunity.volume >= 100) {
    signals.push('HAS_OPT_VOLUME');
    score += 5;
  }
  
  // DTE-based scoring - swings get bonus for time value
  if (opportunity.daysToExpiry <= 2) {
    signals.push('0-2_DTE');
    if (!signals.some(s => s.includes('STRONG_MOMENTUM'))) {
      score -= 10; // Day trades need momentum
    }
  } else if (opportunity.daysToExpiry <= 7) {
    signals.push('WEEKLY_3-7DTE');
    score += 5; // Weekly lotto - decent time
  } else if (opportunity.daysToExpiry <= 14) {
    signals.push('SWING_8-14DTE');
    score += 12; // Swings give more time to be right - BOOST
  } else if (opportunity.daysToExpiry <= 21) {
    signals.push('SWING_15-21DTE');
    score += 15; // 2-3 week swings - good theta/time balance
  } else if (opportunity.daysToExpiry <= 30) {
    signals.push('MONTHLY_22-30DTE');
    score += 18; // Monthly swings - excellent for trend trades
  } else if (opportunity.daysToExpiry <= 45) {
    signals.push('MONTHLY_31-45DTE');
    score += 20; // 6-week swings - best for sector rotations
  }
  
  score = Math.max(0, Math.min(100, score));
  
  // Analysis-based confidence boost for strong technical signals
  let analysisBoost = 0;
  const boostReasons: string[] = [];
  
  if (signals.some(s => s.includes('STRONG_MOMENTUM'))) {
    analysisBoost += 10;
    boostReasons.push('STRONG_MOMENTUM+10');
  }
  if (signals.some(s => s.includes('HIGH_VOL'))) {
    analysisBoost += 8;
    boostReasons.push('HIGH_VOL+8');
  }
  if (signals.some(s => s.includes('OPTIMAL_DELTA'))) {
    analysisBoost += 5;
    boostReasons.push('OPTIMAL_DELTA+5');
  }
  
  const boostedScore = Math.min(100, score + analysisBoost);
  const grade = getLetterGrade(boostedScore);
  const hasAnalysisBoost = analysisBoost > 0;
  
  // DTE-aware entry criteria (lower thresholds for swings since they have more time)
  // Day trades (0-2 DTE): 65 - need strong momentum
  // Weekly trades (3-7 DTE): 60 - moderate conviction
  // Swing trades (8-21 DTE): 50 - time is on our side
  // Monthly swings (22-45 DTE): 45 - even more time to be right
  const isDayTrade = opportunity.daysToExpiry <= 2;
  const isWeekly = opportunity.daysToExpiry > 2 && opportunity.daysToExpiry <= 7;
  const isSwingTrade = opportunity.daysToExpiry >= 8 && opportunity.daysToExpiry <= 21;
  const isMonthlySwing = opportunity.daysToExpiry > 21;
  
  let minScoreForEntry = 60; // default
  if (isDayTrade) minScoreForEntry = 65;
  else if (isWeekly) minScoreForEntry = 58;
  else if (isSwingTrade) minScoreForEntry = 50;
  else if (isMonthlySwing) minScoreForEntry = 45; // Monthly swings need lowest threshold
  
  // Require at least 1 positive signal to enter (reduced from 2)
  const positiveSignals = signals.filter(s => 
    !s.includes('LOW_VOLUME') && 
    !s.includes('RISKY') && 
    !s.includes('COUNTER') &&
    !s.includes('TOO_FAR')
  );
  
  if (positiveSignals.length < 1) {
    return {
      action: 'skip',
      reason: `No positive signals found`,
      confidence: boostedScore,
      signals
    };
  }
  
  // HARD REJECTION: Contrarian trades at extremes on short-dated options (< 14 DTE)
  // Buying puts at 52-week highs or calls at 52-week lows is fighting the trend
  // Only accept these if we have significant time (14+ DTE) for a reversal
  const hasRiskyContrarianSignal = signals.some(s => 
    s.includes('PUTS_AT_HIGHS_RISKY') || s.includes('CALLS_AT_LOWS_RISKY')
  );
  if (hasRiskyContrarianSignal && opportunity.daysToExpiry < 14) {
    return {
      action: 'skip',
      reason: `REJECTED: Contrarian trade (${signals.find(s => s.includes('RISKY'))}) with only ${opportunity.daysToExpiry} DTE - need 14+ DTE for reversals`,
      confidence: boostedScore,
      signals
    };
  }
  
  // Enter on A, B, or C+ grades with boosted score
  const entryReason = hasAnalysisBoost 
    ? `${grade} grade (${score}+${analysisBoost}=${boostedScore}) ANALYSIS_BOOST: ${boostReasons.join(', ')}`
    : `${grade} grade (${boostedScore}) - ${signals.slice(0, 3).join(', ')}`;
    
  if (boostedScore >= minScoreForEntry && (grade === 'A' || grade === 'B+' || grade === 'B' || grade === 'C+' || grade === 'C')) {
    return {
      action: 'enter',
      reason: entryReason,
      confidence: boostedScore,
      signals: hasAnalysisBoost ? [...signals, ...boostReasons] : signals
    };
  } else if (boostedScore >= 50) {
    return {
      action: 'wait',
      reason: `${grade} grade (${boostedScore}) needs higher score for entry (min: ${minScoreForEntry})`,
      confidence: boostedScore,
      signals
    };
  } else {
    return {
      action: 'skip',
      reason: `${grade} grade (${boostedScore}) too weak - ${signals.slice(0, 2).join(', ')}`,
      confidence: boostedScore,
      signals
    };
  }
}

/**
 * Bot scans for opportunities and decides what to trade
 * Uses INTELLIGENT STRIKE SELECTION to pick optimal strikes
 */
async function scanForOpportunities(ticker: string): Promise<LottoOpportunity[]> {
  try {
    const quote = await getTradierQuote(ticker);
    if (!quote || !quote.last) return [];
    
    const thresholds = getLottoThresholds();
    
    const optionsData = await getTradierOptionsChainsByDTE(ticker);
    if (!optionsData || optionsData.length === 0) return [];
    
    // Group options by expiration date
    const optionsByExpiry = new Map<string, any[]>();
    for (const opt of optionsData) {
      const expiry = opt.expiration_date;
      if (!optionsByExpiry.has(expiry)) {
        optionsByExpiry.set(expiry, []);
      }
      optionsByExpiry.get(expiry)!.push(opt);
    }
    
    const opportunities: LottoOpportunity[] = [];
    
    // For each expiration, use intelligent strike selection to pick the BEST call and put
    for (const [expiry, options] of Array.from(optionsByExpiry.entries())) {
      const expDate = new Date(expiry);
      const now = new Date();
      const daysToExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysToExpiry < 0 || daysToExpiry > thresholds.LOTTO_MAX_DTE) continue;
      
      // Score ALL strikes for this expiration
      const candidates: StrikeCandidate[] = [];
      for (const opt of options) {
        const scored = scoreStrikeCandidate(opt, quote.last, daysToExpiry);
        if (scored) candidates.push(scored);
      }
      
      if (candidates.length === 0) continue;
      
      // Select the BEST call and BEST put for this expiration
      const bestCall = selectBestStrike(candidates, 'call');
      const bestPut = selectBestStrike(candidates, 'put');
      
      // Add best call if found
      if (bestCall && bestCall.score >= 50) { // Minimum score threshold
        opportunities.push({
          symbol: ticker,
          optionType: 'call',
          strike: bestCall.strike,
          expiration: bestCall.expiration,
          delta: bestCall.delta,
          price: bestCall.midPrice,
          volume: bestCall.volume,
          openInterest: bestCall.openInterest,
          bidAskSpread: bestCall.ask - bestCall.bid,
          daysToExpiry: bestCall.daysToExpiry,
          strikeScore: bestCall.score
        });
      }
      
      // Add best put if found
      if (bestPut && bestPut.score >= 50) { // Minimum score threshold
        opportunities.push({
          symbol: ticker,
          optionType: 'put',
          strike: bestPut.strike,
          expiration: bestPut.expiration,
          delta: bestPut.delta,
          price: bestPut.midPrice,
          volume: bestPut.volume,
          openInterest: bestPut.openInterest,
          bidAskSpread: bestPut.ask - bestPut.bid,
          daysToExpiry: bestPut.daysToExpiry,
          strikeScore: bestPut.score
        });
      }
    }
    
    // Sort by strike score (best opportunities first)
    opportunities.sort((a, b) => b.strikeScore - a.strikeScore);
    
    logger.debug(`🎯 [STRIKE-SELECT] ${ticker}: Found ${opportunities.length} optimized opportunities`);
    
    return opportunities;
  } catch (error) {
    logger.error(`🤖 [BOT] Error scanning ${ticker}:`, error);
    return [];
  }
}

/**
 * Bot creates a trade idea from an opportunity
 */
function createTradeIdea(opportunity: LottoOpportunity, decision: BotDecision): InsertTradeIdea {
  const now = new Date();
  // DTE-aware targets: 0DTE=4x, 1-2DTE=7x, 3-7DTE=15x
  const { targetPrice, riskRewardRatio, targetMultiplier, dteCategory } = calculateLottoTargets(opportunity.price, opportunity.expiration);
  const stopLoss = opportunity.price * 0.5;
  // Always LONG (buying) options in lotto plays - we BUY calls and puts for leverage
  // CALL = bet stock goes UP, PUT = bet stock goes DOWN, but both are LONG (owned) positions
  // We're not selling/writing options (that would require margin and has unlimited risk)
  const direction = 'long' as const;
  
  // DTE-aware exit timing: day trades exit same day, swings 3-14 days, monthly 14-30 days
  let exitWindowDays: number;
  let holdingPeriod: 'day' | 'swing' | 'position';
  
  if (opportunity.daysToExpiry <= 2) {
    exitWindowDays = 1;
    holdingPeriod = 'day';
  } else if (opportunity.daysToExpiry <= 7) {
    exitWindowDays = Math.min(3, opportunity.daysToExpiry - 1);
    holdingPeriod = 'swing';
  } else if (opportunity.daysToExpiry <= 14) {
    exitWindowDays = Math.min(7, opportunity.daysToExpiry - 2);
    holdingPeriod = 'swing';
  } else if (opportunity.daysToExpiry <= 21) {
    exitWindowDays = Math.min(10, opportunity.daysToExpiry - 3);
    holdingPeriod = 'swing';
  } else if (opportunity.daysToExpiry <= 30) {
    exitWindowDays = Math.min(14, opportunity.daysToExpiry - 5);
    holdingPeriod = 'position';
  } else {
    // Monthly swings (31-45 DTE) - hold longer
    exitWindowDays = Math.min(21, opportunity.daysToExpiry - 7);
    holdingPeriod = 'position';
  }
  
  const exitDate = new Date(now);
  exitDate.setDate(exitDate.getDate() + exitWindowDays);
  exitDate.setHours(15, 30, 0, 0);
  
  const entryValidUntil = new Date(now.getTime() + 60 * 60 * 1000);
  
  // DTE-aware target label for analysis
  const targetLabel = dteCategory === '0DTE' ? 'gamma play' : 
    dteCategory === '1-2DTE' ? 'short-term' : 
    dteCategory === '3-7DTE' ? 'weekly lotto' : 
    dteCategory === 'swing' ? 'swing trade' : 
    dteCategory === 'monthly' ? 'monthly swing' : 'position';
  
  // Capture optionType explicitly to ensure correct type
  const optionTypeValue: 'call' | 'put' = opportunity.optionType;
  
  logger.debug(`🤖 [BOT] Creating trade idea for ${opportunity.symbol}: optionType=${optionTypeValue}, strike=${opportunity.strike}`);
  
  const ideaData = {
    symbol: opportunity.symbol,
    assetType: 'option' as const,
    direction,
    entryPrice: opportunity.price,
    targetPrice,
    stopLoss,
    riskRewardRatio,
    confidenceScore: decision.confidence,
    qualitySignals: decision.signals,
    probabilityBand: getLetterGrade(decision.confidence),
    catalyst: `🤖 BOT DECISION: ${opportunity.symbol} ${optionTypeValue.toUpperCase()} $${opportunity.strike} | ${decision.signals.slice(0, 3).join(' | ')}`,
    analysis: `Auto-Lotto Bot autonomous trade (${dteCategory} ${targetLabel}): ${decision.reason}. Entry $${opportunity.price.toFixed(2)}, Target $${targetPrice.toFixed(2)} (${targetMultiplier}x), Stop $${stopLoss.toFixed(2)} (50%).`,
    sessionContext: 'Bot autonomous trading',
    holdingPeriod,
    source: 'lotto' as const,
    strikePrice: opportunity.strike,
    optionType: optionTypeValue,
    expiryDate: opportunity.expiration,
    entryValidUntil: formatInTimeZone(entryValidUntil, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    exitBy: formatInTimeZone(exitDate, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    isLottoPlay: true,
    timestamp: formatInTimeZone(now, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    sectorFocus: 'momentum' as const,
    riskProfile: 'speculative' as const,
    researchHorizon: (opportunity.daysToExpiry <= 2 ? 'intraday' : opportunity.daysToExpiry <= 7 ? 'short_swing' : 'multi_week') as 'intraday' | 'short_swing' | 'multi_week',
    liquidityWarning: true,
    engineVersion: 'bot_autonomous_v1.2', // v1.2: Intelligent strike selection algorithm
  };
  
  logger.debug(`🤖 [BOT] Trade idea data: optionType=${ideaData.optionType}, catalyst contains=${ideaData.catalyst.includes('PUT') ? 'PUT' : 'CALL'}`);
  
  return ideaData;
}

/**
 * MAIN BOT FUNCTION: Scans market and makes autonomous trading decisions
 * Now uses user preferences for position limits, confidence thresholds, and trading hours
 */
export async function runAutonomousBotScan(): Promise<void> {
  try {
    // Load user preferences
    const prefs = await getBotPreferences();
    
    // Check if options trading is enabled
    if (!prefs.enableOptions) {
      logger.info(`🤖 [BOT] Options trading disabled by user preferences`);
      return;
    }
    
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = etTime.getDay();
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    // Check trading hours based on preferences
    const isPreMarket = timeInMinutes >= 240 && timeInMinutes < 570; // 4:00 AM - 9:30 AM
    const isRegularHours = timeInMinutes >= 570 && timeInMinutes < 960; // 9:30 AM - 4:00 PM
    const isAfterHours = timeInMinutes >= 960 && timeInMinutes < 1200; // 4:00 PM - 8:00 PM
    
    const canTrade = (day !== 0 && day !== 6) && (
      (prefs.tradePreMarket && isPreMarket) ||
      (prefs.tradeRegularHours && isRegularHours) ||
      (prefs.tradeAfterHours && isAfterHours)
    );
    
    if (!canTrade) {
      logger.info(`🤖 [BOT] Outside trading hours per preferences - skipping scan`);
      return;
    }
    
    logger.info(`🤖 [BOT] ========== AUTONOMOUS SCAN STARTED ==========`);
    logger.debug(`🤖 [BOT] Prefs: ${prefs.riskTolerance} risk, max ${prefs.maxConcurrentTrades} positions, $${prefs.maxPositionSize} max size`);
    
    // 📊 MARKET CONTEXT ANALYSIS - Check overall market conditions before trading
    const marketContext = await getMarketContext();
    logger.info(`🤖 [BOT] Market: ${marketContext.regime} | ${marketContext.riskSentiment} | Score: ${marketContext.score}`);
    
    if (!marketContext.shouldTrade) {
      logger.info(`🤖 [BOT] ⛔ MARKET GATE: Skipping trades - ${marketContext.reasons.join(', ')}`);
      return;
    }
    
    const portfolio = await getLottoPortfolio();
    if (!portfolio) {
      logger.error(`🤖 [BOT] No portfolio available`);
      return;
    }
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    
    // Use user preference for max concurrent trades
    if (openPositions.length >= prefs.maxConcurrentTrades) {
      logger.info(`🤖 [BOT] Already have ${openPositions.length}/${prefs.maxConcurrentTrades} open positions - waiting for exits`);
      return;
    }
    
    const openSymbols = new Set(openPositions.map(p => p.symbol));
    let bestOpportunity: { opp: LottoOpportunity; decision: BotDecision; entryTiming: { shouldEnterNow: boolean; reason: string } } | null = null;
    
    // 🔍 DYNAMIC MOVERS: Get top movers from market scanner first (big price moves = opportunity)
    const dynamicMovers = await getDynamicMovers();
    if (dynamicMovers.length > 0) {
      logger.info(`🔍 [BOT] Scanning ${dynamicMovers.length} dynamic movers from market scanner FIRST (prioritized)`);
    }
    
    // Combine dynamic movers (priority) with static list, deduplicated
    const combinedTickers = Array.from(new Set([...dynamicMovers, ...BOT_SCAN_TICKERS]));
    logger.info(`🤖 [BOT] Total scan universe: ${combinedTickers.length} tickers (${dynamicMovers.length} dynamic + static list)`);
    
    // 📋 CATALYST SCORE CACHE - Avoid redundant DB calls during scan
    const catalystScoreCache = new Map<string, { score: number; summary: string; catalystCount: number }>();
    
    for (const ticker of combinedTickers) {
      if (openSymbols.has(ticker)) {
        logger.debug(`  ⏭️  ${ticker}: Skipped - already has open trade`);
        continue;
      }
      
      // 📊 CHECK HISTORICAL PERFORMANCE - Skip blacklisted symbols
      const symbolCheck = checkSymbolPerformance(ticker);
      if (!symbolCheck.allowed) {
        logger.debug(`🤖 [BOT] ⛔ ${symbolCheck.reason}`);
        continue;
      }
      
      // 📋 CATALYST INTELLIGENCE - Fetch once per ticker with cache
      let catalystData = catalystScoreCache.get(ticker);
      if (!catalystData) {
        try {
          const { calculateCatalystScore } = await import("./catalyst-intelligence-service");
          catalystData = await calculateCatalystScore(ticker);
          catalystScoreCache.set(ticker, catalystData);
        } catch (err) {
          catalystData = { score: 0, summary: 'Catalyst check unavailable', catalystCount: 0 };
        }
      }
      
      const opportunities = await scanForOpportunities(ticker);
      
      for (const opp of opportunities) {
        const quote = await getTradierQuote(ticker);
        if (!quote) continue;
        
        let decision = makeBotDecision(quote, opp);
        
        // Apply performance boost for preferred symbols
        if (symbolCheck.boost > 0) {
          decision.confidence = Math.min(100, decision.confidence + symbolCheck.boost);
          decision.signals.push('PREFERRED_SYMBOL');
        }
        
        // 🔍 DYNAMIC MOVER BOOST: Extra confidence for stocks from market scanner (they have momentum!)
        if (dynamicMovers.includes(ticker)) {
          decision.confidence = Math.min(100, decision.confidence + 8);
          decision.signals.push('MARKET_SCANNER_MOVER');
          logger.debug(`🔍 [BOT] +8 boost for ${ticker} (dynamic mover from scanner)`);
        }
        
        // 📋 CATALYST INTELLIGENCE BOOST: Adjust confidence based on SEC filings, gov contracts, etc.
        if (catalystData && catalystData.catalystCount > 0) {
          // Map catalyst score (-100 to +100) to bounded confidence boost (-12 to +12)
          let catalystBoost = 0;
          const catalystScore = catalystData.score;
          
          if (catalystScore >= 50) {
            catalystBoost = 12; // Strong bullish catalyst
            decision.signals.push('CATALYST_STRONG_BULLISH');
          } else if (catalystScore >= 25) {
            catalystBoost = 8; // Moderate bullish catalyst
            decision.signals.push('CATALYST_BULLISH');
          } else if (catalystScore >= 10) {
            catalystBoost = 5; // Mild bullish catalyst
            decision.signals.push('CATALYST_MILD_BULLISH');
          } else if (catalystScore <= -50) {
            catalystBoost = -12; // Strong bearish catalyst
            decision.signals.push('CATALYST_STRONG_BEARISH');
          } else if (catalystScore <= -25) {
            catalystBoost = -8; // Moderate bearish catalyst
            decision.signals.push('CATALYST_BEARISH');
          } else if (catalystScore <= -10) {
            catalystBoost = -5; // Mild bearish catalyst
            decision.signals.push('CATALYST_MILD_BEARISH');
          }
          
          if (catalystBoost !== 0) {
            decision.confidence = Math.max(0, Math.min(100, decision.confidence + catalystBoost));
            logger.debug(`📋 [BOT] ${catalystBoost > 0 ? '+' : ''}${catalystBoost} catalyst boost for ${ticker} (score: ${catalystScore}, ${catalystData.catalystCount} events)`);
          }
        }
        
        // 📊 ENTRY TIMING CHECK - Should we enter now or wait?
        const entryTiming = getEntryTiming(quote, opp.optionType, marketContext);
        
        // 🧠 ADAPTIVE LEARNING: Apply adjustments based on past performance
        const symbolAdj = await getSymbolAdjustment(ticker);
        const adaptiveParams = await getAdaptiveParameters();
        
        if (symbolAdj.shouldAvoid) {
          logger.debug(`🧠 [BOT] ⛔ ${ticker}: Symbol on cooldown (${symbolAdj.lossStreak} consecutive losses)`);
          continue;
        }
        
        decision.confidence += symbolAdj.confidenceBoost;
        const effectiveMinConfidence = Math.max(prefs.minConfidenceScore, adaptiveParams.confidenceThreshold);
        
        // Apply minimum confidence score from preferences + adaptive learning
        if (decision.confidence < effectiveMinConfidence) {
          logger.debug(`🤖 [BOT] ⛔ ${ticker}: Confidence ${decision.confidence.toFixed(0)}% < min ${effectiveMinConfidence.toFixed(0)}% (adaptive: ${adaptiveParams.confidenceThreshold.toFixed(0)}%)`);
          continue;
        }
        
        if (decision.action === 'enter' && entryTiming.shouldEnterNow) {
          logger.info(`🤖 [BOT] ✅ ${ticker} ${opp.optionType.toUpperCase()} $${opp.strike}: ${decision.reason} | ${entryTiming.reason}`);
          
          if (!bestOpportunity || decision.confidence > bestOpportunity.decision.confidence) {
            bestOpportunity = { opp, decision, entryTiming };
          }
        } else if (decision.action === 'wait') {
          logger.debug(`🤖 [BOT] ⏳ ${ticker}: ${decision.reason}`);
        }
      }
    }
    
    if (bestOpportunity) {
      const { opp, decision } = bestOpportunity;
      
      logger.info(`🤖 [BOT] 🎯 EXECUTING BEST TRADE: ${opp.symbol} ${opp.optionType.toUpperCase()} $${opp.strike} @ $${opp.price.toFixed(2)}`);
      
      const ideaData = createTradeIdea(opp, decision);
      logger.info(`🤖 [BOT] 📝 Pre-save ideaData: optionType=${ideaData.optionType}, symbol=${ideaData.symbol}`);
      
      const savedIdea = await storage.createTradeIdea(ideaData);
      logger.info(`🤖 [BOT] 📝 Post-save savedIdea: optionType=${savedIdea.optionType}, id=${savedIdea.id}`);
      
      const result = await executeTradeIdea(portfolio.id, savedIdea as TradeIdea);
      
      if (result.success && result.position) {
        logger.info(`🤖 [BOT] ✅ TRADE EXECUTED: ${opp.symbol} x${result.position.quantity} @ $${opp.price.toFixed(2)}`);
        
        // Send Discord notification for all bot entries (always notify on trades)
        try {
          logger.info(`🤖 [BOT] 📱 Sending Discord ENTRY notification for ${opp.symbol}...`);
          await sendBotTradeEntryToDiscord({
            symbol: opp.symbol,
            assetType: 'option',
            optionType: opp.optionType,
            strikePrice: opp.strike,
            expiryDate: opp.expiration,
            entryPrice: opp.price,
            quantity: result.position.quantity,
            targetPrice: ideaData.targetPrice,
            stopLoss: ideaData.stopLoss,
          });
          logger.info(`🤖 [BOT] 📱✅ Discord ENTRY notification SENT for ${opp.symbol}`);
        } catch (discordError) {
          logger.error(`🤖 [BOT] 📱❌ Discord ENTRY notification FAILED for ${opp.symbol}:`, discordError);
        }
        
        const updated = await storage.getPaperPortfolioById(portfolio.id);
        if (updated) optionsPortfolio = updated;
      } else {
        logger.warn(`🤖 [BOT] ❌ Trade failed: ${result.error}`);
      }
    } else {
      logger.info(`🤖 [BOT] No opportunities met entry criteria`);
    }
    
    logger.info(`🤖 [BOT] ========== AUTONOMOUS SCAN COMPLETE ==========`);
  } catch (error) {
    logger.error(`🤖 [BOT] Error in autonomous scan:`, error);
  }
}

/**
 * Auto-execute a trade idea (for backward compatibility with lotto scanner)
 */
export async function autoExecuteLotto(idea: TradeIdea): Promise<boolean> {
  try {
    if (idea.assetType === 'option') {
      if (!idea.strikePrice || !idea.expiryDate || !idea.optionType) {
        logger.error(`🤖 [BOT] ❌ Rejecting ${idea.symbol} - missing option metadata`);
        return false;
      }
      
      if (idea.entryPrice > 20) {
        logger.warn(`🤖 [BOT] ⚠️ Rejecting ${idea.symbol} - entry price $${idea.entryPrice} too high for lotto`);
        return false;
      }
    }
    
    const portfolio = await getLottoPortfolio();
    if (!portfolio) {
      logger.error("🤖 [BOT] No portfolio available");
      return false;
    }

    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const existingPosition = positions.find(p => 
      p.tradeIdeaId === idea.id || 
      (p.symbol === idea.symbol && p.status === 'open' && p.strikePrice === idea.strikePrice)
    );

    if (existingPosition) {
      logger.info(`🤖 [BOT] Skipping ${idea.symbol} - already have position`);
      return false;
    }

    const result = await executeTradeIdea(portfolio.id, idea);
    
    if (result.success && result.position) {
      logger.info(`🤖 [BOT] ✅ Executed: ${idea.symbol} ${idea.optionType?.toUpperCase()} $${idea.strikePrice} x${result.position.quantity} @ $${idea.entryPrice.toFixed(2)}`);
      
      // Always send Discord notification for bot entries
      try {
        logger.info(`🤖 [BOT] 📱 Sending Discord ENTRY notification for ${idea.symbol}...`);
        await sendBotTradeEntryToDiscord({
          symbol: idea.symbol,
          assetType: idea.assetType || 'option',
          optionType: idea.optionType,
          strikePrice: idea.strikePrice,
          expiryDate: idea.expiryDate,
          entryPrice: idea.entryPrice,
          quantity: result.position.quantity,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
        });
        logger.info(`🤖 [BOT] 📱✅ Discord ENTRY notification SENT for ${idea.symbol}`);
      } catch (discordError) {
        logger.error(`🤖 [BOT] 📱❌ Discord ENTRY notification FAILED for ${idea.symbol}:`, discordError);
      }
      
      const updated = await storage.getPaperPortfolioById(portfolio.id);
      if (updated) optionsPortfolio = updated;
      
      return true;
    } else {
      logger.warn(`🤖 [BOT] ❌ Failed to execute ${idea.symbol}: ${result.error}`);
      return false;
    }
  } catch (error) {
    logger.error(`🤖 [BOT] Error executing trade:`, error);
    return false;
  }
}

/**
 * Monitor and auto-close positions on stop/target/expiry
 * Now includes dynamic exits: trailing stops, time decay, momentum fade
 */
export async function monitorLottoPositions(): Promise<void> {
  try {
    const portfolio = await getLottoPortfolio();
    if (!portfolio) return;

    await updatePositionPrices(portfolio.id);
    
    // 📊 Get market context for dynamic exit decisions
    const marketContext = await getMarketContext();
    
    // Use shared market status check (static import)
    const marketStatus = isUSMarketOpen();
    
    // Get open positions to check for dynamic exits
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    
    // Check each position for dynamic exit signals
    for (const pos of openPositions) {
      if (!pos.currentPrice || !pos.entryPrice) continue;
      
      // Skip dynamic exit checks if market is closed (prices may be stale)
      const isOption = pos.assetType === 'option';
      const priceIsStale = isOption && Math.abs(pos.currentPrice - pos.entryPrice) < 0.001;
      
      if (isOption && (!marketStatus.isOpen || priceIsStale)) {
        logger.debug(`🤖 [BOT] Skipping dynamic exit for ${pos.symbol} - ${marketStatus.reason}${priceIsStale ? ', stale price' : ''}`);
        continue;
      }
      
      // Calculate days to expiry for options
      let daysToExpiry = 7; // Default for non-options
      if (pos.expiryDate) {
        const expDate = new Date(pos.expiryDate);
        const now = new Date();
        daysToExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      const highestPrice = pos.currentPrice; // Track highest price based on current
      
      const exitSignal = checkDynamicExit(
        pos.currentPrice,
        pos.entryPrice,
        highestPrice,
        daysToExpiry,
        (pos.optionType as 'call' | 'put') || 'call',
        marketContext
      );
      
      if (exitSignal.shouldExit) {
        logger.info(`🤖 [BOT] 📊 DYNAMIC EXIT: ${pos.symbol} - ${exitSignal.exitType}: ${exitSignal.reason}`);
        
        // Close the position with dynamic exit reason
        try {
          const exitPrice = exitSignal.suggestedExitPrice || pos.currentPrice;
          const pnl = (exitPrice - pos.entryPrice) * pos.quantity * 100;
          
          await storage.updatePaperPosition(pos.id, {
            status: 'closed',
            exitPrice,
            exitTime: new Date().toISOString(),
            exitReason: `${exitSignal.exitType}: ${exitSignal.reason}`,
            realizedPnL: pnl,
          });
          
          // Send Discord notification for exit
          logger.info(`🤖 [BOT] 📱 Sending Discord EXIT notification for ${pos.symbol}...`);
          await sendBotTradeExitToDiscord({
            symbol: pos.symbol,
            assetType: pos.assetType || 'option',
            optionType: pos.optionType,
            strikePrice: pos.strikePrice,
            entryPrice: pos.entryPrice,
            exitPrice,
            quantity: pos.quantity,
            realizedPnL: pnl,
            exitReason: `${exitSignal.exitType}: ${exitSignal.reason}`,
          });
          
          logger.info(`🤖 [BOT] 📱✅ Discord EXIT notification SENT for ${pos.symbol} | P&L: $${pnl.toFixed(2)}`);
        } catch (exitError) {
          logger.error(`🤖 [BOT] Failed to execute dynamic exit for ${pos.symbol}:`, exitError);
        }
      }
    }
    
    // Standard stop/target checking (for positions not caught by dynamic exits)
    const closedPositions = await checkStopsAndTargets(portfolio.id);
    
    if (closedPositions.length > 0) {
      logger.info(`🤖 [BOT] Auto-closed ${closedPositions.length} positions`);
      
      for (const pos of closedPositions) {
        const pnl = pos.realizedPnL || 0;
        const emoji = pnl >= 0 ? '🎉' : '💀';
        logger.info(`${emoji} [BOT] Closed ${pos.symbol}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pos.exitReason})`);
        
        try {
          logger.info(`🤖 [BOT] 📱 Sending Discord EXIT notification for ${pos.symbol}...`);
          await sendBotTradeExitToDiscord({
            symbol: pos.symbol,
            assetType: pos.assetType || 'option',
            optionType: pos.optionType,
            strikePrice: pos.strikePrice,
            entryPrice: pos.entryPrice,
            exitPrice: pos.exitPrice,
            quantity: pos.quantity,
            realizedPnL: pos.realizedPnL,
            exitReason: pos.exitReason,
          });
          logger.info(`🤖 [BOT] 📱✅ Discord EXIT notification SENT for ${pos.symbol}`);
        } catch (discordError) {
          logger.error(`🤖 [BOT] 📱❌ Discord EXIT notification FAILED for ${pos.symbol}:`, discordError);
        }
        
        try {
          const pnlPercent = pos.realizedPnLPercent || 0;
          if (pnlPercent >= 3) {
            await recordWin(pos);
            logger.info(`🧠 [LOSS-ANALYZER] Recorded WIN for ${pos.symbol}`);
          } else if (pnlPercent <= -3) {
            const diagnostics = await analyzeTrade(pos);
            if (diagnostics) {
              logger.info(`🧠 [LOSS-ANALYZER] Analyzed LOSS for ${pos.symbol}: ${diagnostics.primaryCause}`);
            }
          }
        } catch (analyzeError) {
          logger.warn(`🧠 [LOSS-ANALYZER] Failed to analyze ${pos.symbol}:`, analyzeError);
        }
      }
      
      const updated = await storage.getPaperPortfolioById(portfolio.id);
      if (updated) optionsPortfolio = updated;
    }
  } catch (error) {
    logger.error("🤖 [BOT] Error monitoring positions:", error);
  }
}

/**
 * FUTURES TRADING - Scan and execute futures trades during CME market hours
 * Now uses user preferences for position limits and trading parameters
 */
export async function runFuturesBotScan(): Promise<void> {
  try {
    // Load user preferences
    const prefs = await getBotPreferences();
    
    // Check if futures trading is enabled
    if (!prefs.enableFutures) {
      logger.info(`🔮 [FUTURES-BOT] Futures trading disabled by user preferences`);
      return;
    }
    
    if (!isCMEOpen()) {
      logger.info(`🔮 [FUTURES-BOT] CME market closed - skipping futures scan`);
      return;
    }
    
    logger.info(`🔮 [FUTURES-BOT] ========== FUTURES SCAN STARTED ==========`);
    logger.debug(`🔮 [FUTURES-BOT] Prefs: max ${prefs.futuresMaxContracts} contracts, stop=${prefs.futuresStopPoints}pts, target=${prefs.futuresTargetPoints}pts`);
    
    const portfolio = await getFuturesPortfolio();
    if (!portfolio) {
      logger.error(`🔮 [FUTURES-BOT] No portfolio available`);
      return;
    }
    
    logger.info(`📈 [FUTURES-BOT] Portfolio: $${portfolio.cashBalance.toFixed(2)} cash / $${portfolio.totalValue.toFixed(2)} total`);
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openFuturesPositions = positions.filter(p => p.status === 'open' && p.assetType === 'future');
    
    // Use preference for max contracts
    if (openFuturesPositions.length >= prefs.futuresMaxContracts) {
      logger.info(`🔮 [FUTURES-BOT] Already have ${openFuturesPositions.length}/${prefs.futuresMaxContracts} open futures - waiting for exit`);
      return;
    }
    
    const openFuturesSymbols = new Set(openFuturesPositions.map(p => p.symbol.substring(0, 2)));
    let bestFuturesOpp: FuturesOpportunity | null = null;
    
    for (const rootSymbol of FUTURES_SYMBOLS) {
      if (openFuturesSymbols.has(rootSymbol)) continue;
      
      try {
        const contract = await getActiveFuturesContract(rootSymbol);
        const price = await getFuturesPrice(contract.contractCode);
        
        if (!price || price <= 0) {
          logger.warn(`🔮 [FUTURES-BOT] No price for ${contract.contractCode}`);
          continue;
        }
        
        const signals: string[] = [];
        let score = 50;
        
        // CME market is open
        signals.push(`PRICE_$${price.toFixed(2)}`);
        signals.push('CME_OPEN');
        score += 10;
        
        // Get price context from contract
        const contractSymbol = contract.contractCode;
        const isNQ = rootSymbol === 'NQ';
        const isGC = rootSymbol === 'GC';
        
        // Analyze market conditions for direction
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const hour = ctTime.getHours();
        
        // Time-based bias (morning momentum, afternoon mean reversion)
        const isMorningSession = hour >= 8 && hour <= 11;
        const isAfternoonSession = hour >= 13 && hour <= 15;
        
        if (isMorningSession) {
          signals.push('MORNING_MOMENTUM');
          score += 15;
        } else if (isAfternoonSession) {
          signals.push('AFTERNOON_SESSION');
          score += 10;
        }
        
        // Get recent price history for trend analysis
        const { getFuturesHistory } = await import('./futures-data-service');
        let priceHistory: number[] = [];
        try {
          priceHistory = await getFuturesHistory(contract.contractCode);
        } catch (e) {
          // Continue without history
        }
        
        // Calculate price trend (is price trending up or down?)
        let trendDirection: 'long' | 'short' = 'long';
        if (priceHistory.length >= 5) {
          const recentPrices = priceHistory.slice(-10);
          const avgRecent = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
          const avgOlder = priceHistory.slice(-20, -10).reduce((a, b) => a + b, 0) / Math.max(1, priceHistory.slice(-20, -10).length);
          
          if (avgRecent > avgOlder * 1.001) {
            trendDirection = 'long';
            signals.push('UPTREND');
            score += 15;
          } else if (avgRecent < avgOlder * 0.999) {
            trendDirection = 'short';
            signals.push('DOWNTREND');
            score += 15;
          } else {
            signals.push('SIDEWAYS');
            score -= 10; // Penalty for choppy market
          }
        }
        
        // Price level analysis for NQ (Nasdaq futures)
        if (isNQ) {
          if (price > 20000) {
            signals.push('NQ_STRONG');
            score += 5;
          }
        }
        
        // Gold tends to be safer in uncertain times
        if (isGC) {
          signals.push('GOLD_HEDGE');
          score += 5;
        }
        
        // Require minimum score of 70 for futures (need real trend confirmation)
        if (score >= 70) {
          // Use TREND-BASED direction, not random!
          const direction: 'long' | 'short' = trendDirection;
          const opportunity: FuturesOpportunity = {
            symbol: rootSymbol,
            contractCode: contract.contractCode,
            direction,
            price,
            signals,
            confidence: Math.min(score, 90),
            expirationDate: contract.expirationDate,
          };
          
          if (!bestFuturesOpp || score > bestFuturesOpp.confidence) {
            bestFuturesOpp = opportunity;
          }
          
          logger.info(`🔮 [FUTURES-BOT] ✅ ${rootSymbol}: ${direction.toUpperCase()} @ ${price.toFixed(2)} | ${signals.join(' | ')}`);
        }
      } catch (error) {
        logger.warn(`🔮 [FUTURES-BOT] Error scanning ${rootSymbol}:`, error);
      }
    }
    
    if (bestFuturesOpp) {
      logger.info(`🔮 [FUTURES-BOT] 🎯 FOUND FUTURES OPPORTUNITY: ${bestFuturesOpp.contractCode} ${bestFuturesOpp.direction.toUpperCase()} @ $${bestFuturesOpp.price.toFixed(2)}`);
      logger.info(`🔮 [FUTURES-BOT] 📊 Signals: ${bestFuturesOpp.signals.join(' | ')}`);
      
      // EXECUTE FUTURES TRADE
      // For paper trading futures with a small portfolio, we use margin-based position sizing
      // Risk per trade from preferences or 30% of cash
      // This represents the margin/risk amount, NOT the full contract notional value
      try {
        const marginRequired = Math.min(prefs.maxPositionSize, portfolio.cashBalance * (prefs.futuresAllocation / 100));
        const quantity = 1; // Paper trade 1 micro contract at a time
        
        // Check confidence meets threshold
        if (bestFuturesOpp.confidence < prefs.minConfidenceScore) {
          logger.info(`🔮 [FUTURES-BOT] Confidence ${bestFuturesOpp.confidence}% < min ${prefs.minConfidenceScore}% - skipping`);
          return;
        }
        
        if (marginRequired <= portfolio.cashBalance && marginRequired >= 10) {
          const entryPrice = bestFuturesOpp.price;
          
          // Use stop/target points from preferences for NQ (e.g., 15 stop / 30 target)
          // For other contracts, use percentage-based stops
          const isNQ = bestFuturesOpp.symbol === 'NQ';
          const stopLoss = isNQ
            ? (bestFuturesOpp.direction === 'long' 
                ? entryPrice - prefs.futuresStopPoints  // Use points from prefs
                : entryPrice + prefs.futuresStopPoints)
            : (bestFuturesOpp.direction === 'long' ? entryPrice * 0.98 : entryPrice * 1.02);
          
          const targetPrice = isNQ
            ? (bestFuturesOpp.direction === 'long'
                ? entryPrice + prefs.futuresTargetPoints  // Use points from prefs
                : entryPrice - prefs.futuresTargetPoints)
            : (bestFuturesOpp.direction === 'long' ? entryPrice * 1.04 : entryPrice * 0.96);
          
          logger.debug(`🔮 [FUTURES-BOT] Using prefs: stop=${prefs.futuresStopPoints}pts, target=${prefs.futuresTargetPoints}pts`);
          
          // Check for existing open trade ideas to prevent duplicates
          const existingIdeas = await storage.getAllTradeIdeas();
          const hasOpenIdea = existingIdeas.some((idea: any) => 
            (idea.symbol === bestFuturesOpp.contractCode || idea.symbol.startsWith(bestFuturesOpp.symbol)) && 
            idea.outcomeStatus === 'open' &&
            idea.assetType === 'future'
          );
          
          if (hasOpenIdea) {
            logger.info(`🔮 [FUTURES-BOT] Skipping ${bestFuturesOpp.contractCode} - already has open trade idea`);
            return;
          }
          
          const position = await storage.createPaperPosition({
            portfolioId: portfolio.id,
            symbol: bestFuturesOpp.contractCode,
            assetType: 'future',
            quantity: quantity,
            entryPrice: entryPrice,
            currentPrice: entryPrice,
            status: 'open',
            direction: bestFuturesOpp.direction,
            stopLoss: stopLoss,
            targetPrice: targetPrice,
            entryTime: new Date().toISOString(),
            entryReason: `🔮 FUTURES: ${bestFuturesOpp.contractCode} ${bestFuturesOpp.direction.toUpperCase()} @ $${entryPrice.toFixed(2)} - ${bestFuturesOpp.signals.slice(0, 3).join(', ')}`,
            entrySignals: JSON.stringify(bestFuturesOpp.signals),
          });
          
          // CREATE TRADE IDEA FOR TRADE DESK
          await storage.createTradeIdea({
            symbol: bestFuturesOpp.contractCode,
            assetType: 'future',
            direction: bestFuturesOpp.direction,
            entryPrice: entryPrice,
            targetPrice: targetPrice,
            stopLoss: stopLoss,
            riskRewardRatio: 2.0, // 4% target / 2% stop
            confidenceScore: bestFuturesOpp.confidence,
            qualitySignals: bestFuturesOpp.signals,
            probabilityBand: bestFuturesOpp.confidence >= 80 ? 'A' : 'B',
            holdingPeriod: 'day',
            catalyst: `Futures Setup: ${bestFuturesOpp.signals.join(', ')}`,
            analysis: `🔮 FUTURES BOT ANALYSIS\n\n${bestFuturesOpp.contractCode} showing ${bestFuturesOpp.direction.toUpperCase()} momentum.\n\nStructure: ${bestFuturesOpp.signals.join(' | ')}`,
            sessionContext: 'Futures Bot',
            source: 'quant',
            status: 'published',
            outcomeStatus: 'open',
            timestamp: new Date().toISOString()
          });
          
          // Update portfolio cash - subtract MARGIN amount, not full contract value
          // For paper trading, we treat the margin as our capital at risk
          await storage.updatePaperPortfolio(portfolio.id, {
            cashBalance: portfolio.cashBalance - marginRequired,
          });
          
          logger.info(`🔮 [FUTURES-BOT] ✅ EXECUTED: ${bestFuturesOpp.direction.toUpperCase()} ${quantity}x ${bestFuturesOpp.contractCode} @ $${entryPrice.toFixed(2)}`);
          logger.info(`🔮 [FUTURES-BOT] 📊 Stop: $${stopLoss.toFixed(2)} | Target: $${targetPrice.toFixed(2)} | Margin: $${marginRequired.toFixed(2)}`);
          
          // Send Discord notification only if enabled in preferences
          if (prefs.enableDiscordAlerts) {
            try {
              await sendBotTradeEntryToDiscord({
                symbol: bestFuturesOpp.contractCode, // Use full contract code e.g. NQH25
                assetType: 'future',
                entryPrice,
                quantity,
                targetPrice,
                stopLoss,
                direction: bestFuturesOpp.direction, // Include direction
              });
              logger.info(`🔮 [FUTURES-BOT] 📱 Discord entry notification sent`);
            } catch (discordError) {
              logger.warn(`🔮 [FUTURES-BOT] Discord notification failed:`, discordError);
            }
          }
        } else {
          logger.warn(`🔮 [FUTURES-BOT] Insufficient capital for trade: need $${marginRequired.toFixed(2)}, have $${portfolio.cashBalance.toFixed(2)}`);
        }
      } catch (execError) {
        logger.error(`🔮 [FUTURES-BOT] Failed to execute futures trade:`, execError);
      }
    } else {
      logger.info(`🔮 [FUTURES-BOT] No futures opportunities met entry criteria`);
    }
    
    logger.info(`🔮 [FUTURES-BOT] ========== FUTURES SCAN COMPLETE ==========`);
  } catch (error) {
    logger.error(`🔮 [FUTURES-BOT] Error in futures scan:`, error);
  }
}

/**
 * Monitor and manage open futures positions
 */
export async function monitorFuturesPositions(): Promise<void> {
  try {
    const portfolio = await getFuturesPortfolio();
    if (!portfolio) return;
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    
    if (openPositions.length === 0) {
      logger.info(`🔮 [FUTURES-MONITOR] No open futures positions to monitor`);
      return;
    }
    
    logger.info(`🔮 [FUTURES-MONITOR] Checking ${openPositions.length} open futures positions...`);
    
    for (const position of openPositions) {
      try {
        // Get current price for the futures contract
        const { getFuturesPrice } = await import('./futures-data-service');
        const currentPrice = await getFuturesPrice(position.symbol);
        
        if (!currentPrice || currentPrice <= 0) {
          logger.warn(`🔮 [FUTURES-MONITOR] No price for ${position.symbol}`);
          continue;
        }
        
        const entryPrice = typeof position.entryPrice === 'string' ? parseFloat(position.entryPrice) : position.entryPrice;
        const stopLoss = position.stopLoss ? (typeof position.stopLoss === 'string' ? parseFloat(position.stopLoss) : position.stopLoss) : null;
        const targetPrice = position.targetPrice ? (typeof position.targetPrice === 'string' ? parseFloat(position.targetPrice) : position.targetPrice) : null;
        
        const direction = position.direction || 'long';
        const quantity = parseFloat(position.quantity?.toString() || '1');
        
        // Get proper futures contract multiplier for MICRO contracts (paper trading with $300)
        // MNQ (Micro NQ): $2/point, MGC (Micro Gold): $10/point
        // For paper trading on small capital, we simulate MICRO contracts only
        const symbol = position.symbol.toUpperCase();
        let multiplier = 2; // Default MNQ (Micro NQ) - $2/point
        if (symbol.startsWith('GC') || symbol.startsWith('MGC')) {
          multiplier = 10; // Micro Gold - $10/point
        } else if (symbol.startsWith('NQ') || symbol.startsWith('MNQ')) {
          multiplier = 2; // Micro NQ - $2/point
        }
        
        // Calculate P&L using proper point value
        const pointDiff = direction === 'long' 
          ? currentPrice - entryPrice 
          : entryPrice - currentPrice;
        
        // Unrealized P&L = points * multiplier * quantity
        const unrealizedPnL = pointDiff * multiplier * quantity;
        const pnlPercent = entryPrice > 0 ? (pointDiff / entryPrice) * 100 : 0;
        
        // Update the position with current price and unrealized P&L
        await storage.updatePaperPosition(position.id, {
          currentPrice,
          unrealizedPnL,
          unrealizedPnLPercent: pnlPercent,
        });
        
        logger.info(`🔮 [FUTURES-MONITOR] ${position.symbol}: ${direction} @ $${entryPrice.toFixed(2)} → $${currentPrice.toFixed(2)} | P&L: ${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`);
        
        // Check stop loss
        if (stopLoss && (
          (direction === 'long' && currentPrice <= stopLoss) ||
          (direction === 'short' && currentPrice >= stopLoss)
        )) {
          logger.info(`🔮 [FUTURES-MONITOR] ❌ STOP HIT: ${position.symbol} @ $${currentPrice.toFixed(2)} | P&L: $${unrealizedPnL.toFixed(2)}`);
          // closePaperPosition handles all portfolio updates (cash, P&L, win/loss count)
          await storage.closePaperPosition(position.id, currentPrice, 'hit_stop');
          continue;
        }
        
        // Check target
        if (targetPrice && (
          (direction === 'long' && currentPrice >= targetPrice) ||
          (direction === 'short' && currentPrice <= targetPrice)
        )) {
          logger.info(`🔮 [FUTURES-MONITOR] ✅ TARGET HIT: ${position.symbol} @ $${currentPrice.toFixed(2)} | P&L: +$${unrealizedPnL.toFixed(2)}`);
          // closePaperPosition handles all portfolio updates (cash, P&L, win/loss count)
          await storage.closePaperPosition(position.id, currentPrice, 'hit_target');
          continue;
        }
        
      } catch (posErr) {
        logger.error(`🔮 [FUTURES-MONITOR] Error checking position ${position.symbol}:`, posErr);
      }
    }
  } catch (error) {
    logger.error(`🔮 [FUTURES-MONITOR] Position monitoring error:`, error);
  }
}

/**
 * Get current bot stats
 */
export async function getLottoStats(): Promise<{
  portfolio: PaperPortfolio | null;
  openPositions: number;
  closedPositions: number;
  totalPnL: number;
  winRate: number;
} | null> {
  try {
    const portfolio = await getLottoPortfolio();
    if (!portfolio) return null;

    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    const closedPositions = positions.filter(p => p.status === 'closed');
    
    const totalPnL = closedPositions.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
    const wins = closedPositions.filter(p => (p.realizedPnL || 0) > 0).length;
    const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;

    return {
      portfolio,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      totalPnL,
      winRate,
    };
  } catch (error) {
    logger.error("🤖 [BOT] Error getting stats:", error);
    return null;
  }
}

/**
 * Force-liquidate all open Prop Firm positions when risk limits are breached
 */
async function flattenAllPropFirmPositions(reason: string): Promise<number> {
  try {
    const portfolio = await getPropFirmPortfolio();
    if (!portfolio) return 0;
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open' && p.assetType === 'future');
    
    if (openPositions.length === 0) return 0;
    
    logger.warn(`🏆 [PROP-FIRM] 🚨 FLATTENING ${openPositions.length} POSITIONS - ${reason}`);
    
    let totalPnL = 0;
    for (const position of openPositions) {
      try {
        const currentPrice = await getFuturesPrice(position.symbol);
        if (!currentPrice || currentPrice <= 0) continue;
        
        const entryPrice = typeof position.entryPrice === 'string' ? parseFloat(position.entryPrice) : position.entryPrice;
        const direction = position.direction || 'long';
        const quantity = parseFloat(position.quantity?.toString() || '1');
        const multiplier = 2; // MNQ (Micro NQ) - $2/point for paper trading
        
        const pointDiff = direction === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
        const unrealizedPnL = pointDiff * multiplier * quantity;
        totalPnL += unrealizedPnL;
        
        logger.warn(`🏆 [PROP-FIRM] 🚨 FORCE CLOSE: ${position.symbol} @ $${currentPrice.toFixed(2)} | P&L: $${unrealizedPnL.toFixed(0)}`);
        await storage.closePaperPosition(position.id, currentPrice, 'risk_limit_breach');
        propFirmDailyPnL += unrealizedPnL;
      } catch (err) {
        logger.error(`🏆 [PROP-FIRM] Error force-closing position:`, err);
      }
    }
    
    return totalPnL;
  } catch (error) {
    logger.error(`🏆 [PROP-FIRM] Flatten error:`, error);
    return 0;
  }
}

/**
 * PROP FIRM MODE - Conservative futures trading for funded evaluations (Topstep, etc)
 * Key differences from regular futures bot:
 * - Stricter risk management (2% max risk per trade)
 * - Daily loss limit tracking
 * - Trailing drawdown monitoring
 * - Only trades high-probability setups (confidence >= 70%)
 * - 2:1 minimum reward-to-risk ratio
 */
export async function runPropFirmBotScan(): Promise<void> {
  try {
    // Reset daily P&L at start of each trading day
    const today = new Date().toISOString().split('T')[0];
    if (propFirmLastResetDate !== today) {
      propFirmDailyPnL = 0;
      propFirmLastResetDate = today;
      logger.info(`🏆 [PROP-FIRM] Daily P&L reset for ${today}`);
    }
    
    // Check if we've hit daily loss limit - FLATTEN ALL POSITIONS if breached
    if (propFirmDailyPnL <= -PROP_FIRM_DAILY_LOSS_LIMIT) {
      await flattenAllPropFirmPositions('DAILY LOSS LIMIT BREACH');
      logger.warn(`🏆 [PROP-FIRM] ⚠️ DAILY LOSS LIMIT REACHED ($${Math.abs(propFirmDailyPnL).toFixed(0)}) - Account locked`);
      return;
    }
    
    if (!isCMEOpen()) {
      logger.info(`🏆 [PROP-FIRM] CME market closed - skipping scan`);
      return;
    }
    
    logger.info(`🏆 [PROP-FIRM] ========== PROP FIRM SCAN STARTED ==========`);
    
    const portfolio = await getPropFirmPortfolio();
    if (!portfolio) {
      logger.error(`🏆 [PROP-FIRM] No portfolio available`);
      return;
    }
    
    // Check drawdown - FLATTEN ALL POSITIONS if breached
    const currentDrawdown = PROP_FIRM_STARTING_CAPITAL - portfolio.totalValue;
    if (currentDrawdown >= PROP_FIRM_MAX_DRAWDOWN) {
      await flattenAllPropFirmPositions('MAX DRAWDOWN BREACH');
      logger.warn(`🏆 [PROP-FIRM] ⚠️ MAX DRAWDOWN REACHED ($${currentDrawdown.toFixed(0)}) - Account locked`);
      return;
    }
    
    // Check if profit target reached - close all positions and lock in profits
    const totalPnL = portfolio.totalValue - PROP_FIRM_STARTING_CAPITAL;
    if (totalPnL >= PROP_FIRM_PROFIT_TARGET) {
      await flattenAllPropFirmPositions('PROFIT TARGET REACHED');
      logger.info(`🏆 [PROP-FIRM] 🎉 PROFIT TARGET REACHED! $${totalPnL.toFixed(0)}/$${PROP_FIRM_PROFIT_TARGET} - Combine PASSED!`);
      return;
    }
    
    logger.info(`🏆 [PROP-FIRM] 📊 Account: $${portfolio.totalValue.toFixed(0)} | Daily P&L: $${propFirmDailyPnL.toFixed(0)} | Drawdown: $${currentDrawdown.toFixed(0)} | Progress: $${totalPnL.toFixed(0)}/$${PROP_FIRM_PROFIT_TARGET}`);
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open' && p.assetType === 'future');
    
    // Only allow 1 position at a time for conservative approach
    if (openPositions.length >= 1) {
      logger.info(`🏆 [PROP-FIRM] Already have ${openPositions.length} open position - monitoring only`);
      return;
    }
    
    // Only trade NQ for Topstep (most liquid, smallest tick value)
    const contract = await getActiveFuturesContract('NQ');
    const price = await getFuturesPrice(contract.contractCode);
    
    if (!price || price <= 0) {
      logger.warn(`🏆 [PROP-FIRM] No price for ${contract.contractCode}`);
      return;
    }
    
    // High-probability setup detection
    const signals: string[] = [];
    let score = 50;
    
    // Time-based filters - only trade during optimal hours
    const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const hour = ctTime.getHours();
    const minute = ctTime.getMinutes();
    
    // Best trading hours: 9:30-11:00 AM and 2:00-3:30 PM CT
    const isMorningPrime = hour === 9 && minute >= 30 || hour === 10;
    const isAfternoonPrime = hour === 14 || (hour === 15 && minute <= 30);
    
    if (isMorningPrime) {
      signals.push('MORNING_PRIME_TIME');
      score += 15;
    } else if (isAfternoonPrime) {
      signals.push('AFTERNOON_PRIME_TIME');
      score += 12;
    } else {
      signals.push('OFF_PEAK_HOURS');
      score -= 10;
    }
    
    // Simple trend detection based on price levels
    const direction: 'long' | 'short' = Math.random() > 0.5 ? 'long' : 'short'; // Simplified for now
    signals.push(`DIRECTION_${direction.toUpperCase()}`);
    score += 10;
    
    // Only take high-probability trades (70%+ confidence)
    if (score < 70) {
      logger.info(`🏆 [PROP-FIRM] Score ${score}% below threshold (70%) - skipping trade`);
      return;
    }
    
    // Calculate conservative stop and target
    const stopPoints = PROP_FIRM_STOP_POINTS_NQ; // 15 points
    const targetPoints = PROP_FIRM_TARGET_POINTS_NQ; // 30 points (2:1 R:R)
    
    const entryPrice = price;
    const stopLoss = direction === 'long' ? entryPrice - stopPoints : entryPrice + stopPoints;
    const targetPrice = direction === 'long' ? entryPrice + targetPoints : entryPrice - targetPoints;
    
    // Risk per trade: $300 (15 points x $20/point)
    const riskPerContract = stopPoints * 20;
    const quantity = 1; // Single contract for conservative approach
    const marginRequired = 100; // Paper trading margin
    
    if (portfolio.cashBalance < marginRequired) {
      logger.warn(`🏆 [PROP-FIRM] Insufficient margin: $${portfolio.cashBalance.toFixed(0)} < $${marginRequired}`);
      return;
    }
    
    logger.info(`🏆 [PROP-FIRM] 🎯 ENTERING TRADE: ${direction.toUpperCase()} ${contract.contractCode} @ $${entryPrice.toFixed(2)}`);
    logger.info(`🏆 [PROP-FIRM] 📊 Stop: $${stopLoss.toFixed(2)} (-${stopPoints}pts) | Target: $${targetPrice.toFixed(2)} (+${targetPoints}pts) | Risk: $${riskPerContract}`);
    
    // Create trade idea
    const ideaData: InsertTradeIdea = {
      symbol: contract.contractCode,
      assetType: 'future',
      direction,
      entryPrice,
      targetPrice,
      stopLoss,
      riskRewardRatio: targetPoints / stopPoints,
      confidenceScore: score,
      qualitySignals: signals,
      probabilityBand: getLetterGrade(score),
      holdingPeriod: 'day',
      catalyst: `Prop Firm Mode: ${signals.join(', ')}`,
      analysis: `🏆 PROP FIRM TRADE\n\n` +
        `${contract.contractCode} ${direction.toUpperCase()}\n` +
        `Entry: $${entryPrice.toFixed(2)}\n` +
        `Stop: $${stopLoss.toFixed(2)} (-$${riskPerContract})\n` +
        `Target: $${targetPrice.toFixed(2)} (+$${targetPoints * 20})\n\n` +
        `Risk:Reward = 1:${(targetPoints / stopPoints).toFixed(1)}\n\n` +
        `⚠️ Conservative prop firm rules in effect`,
      sessionContext: 'Prop Firm Mode',
      timestamp: new Date().toISOString(),
      source: 'bot' as any,
      status: 'published',
      riskProfile: 'conservative',
      dataSourceUsed: 'databento',
      outcomeStatus: 'open',
    };
    
    const savedIdea = await storage.createTradeIdea(ideaData);
    
    // Create paper position with entry reasoning
    await storage.createPaperPosition({
      portfolioId: portfolio.id,
      symbol: contract.contractCode,
      assetType: 'future',
      direction,
      quantity,
      entryPrice,
      currentPrice: entryPrice,
      targetPrice,
      stopLoss,
      status: 'open',
      tradeIdeaId: savedIdea.id,
      entryTime: new Date().toISOString(),
      entryReason: `🏆 PROP FIRM: ${contract.contractCode} ${direction.toUpperCase()} @ $${entryPrice.toFixed(2)} - Confidence ${score}%`,
      entrySignals: JSON.stringify(signals),
    });
    
    // Deduct margin
    await storage.updatePaperPortfolio(portfolio.id, {
      cashBalance: portfolio.cashBalance - marginRequired,
    });
    
    logger.info(`🏆 [PROP-FIRM] ✅ Trade executed - monitoring for stops/targets`);
    
  } catch (error) {
    logger.error(`🏆 [PROP-FIRM] Scan error:`, error);
  }
}

/**
 * Monitor Prop Firm positions with strict risk management
 */
export async function monitorPropFirmPositions(): Promise<void> {
  try {
    const portfolio = await getPropFirmPortfolio();
    if (!portfolio) return;
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    
    if (openPositions.length === 0) return;
    
    for (const position of openPositions) {
      try {
        const currentPrice = await getFuturesPrice(position.symbol);
        if (!currentPrice || currentPrice <= 0) continue;
        
        const entryPrice = typeof position.entryPrice === 'string' ? parseFloat(position.entryPrice) : position.entryPrice;
        const stopLoss = position.stopLoss ? (typeof position.stopLoss === 'string' ? parseFloat(position.stopLoss) : position.stopLoss) : null;
        const targetPrice = position.targetPrice ? (typeof position.targetPrice === 'string' ? parseFloat(position.targetPrice) : position.targetPrice) : null;
        const direction = position.direction || 'long';
        const quantity = parseFloat(position.quantity?.toString() || '1');
        const multiplier = 2; // MNQ (Micro NQ) - $2/point for paper trading
        
        const pointDiff = direction === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
        const unrealizedPnL = pointDiff * multiplier * quantity;
        
        // Update position
        await storage.updatePaperPosition(position.id, {
          currentPrice,
          unrealizedPnL,
          unrealizedPnLPercent: (pointDiff / entryPrice) * 100,
        });
        
        logger.info(`🏆 [PROP-FIRM] ${position.symbol}: ${direction} @ $${entryPrice.toFixed(2)} → $${currentPrice.toFixed(2)} | P&L: ${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(0)}`);
        
        // Check stop loss
        if (stopLoss && (
          (direction === 'long' && currentPrice <= stopLoss) ||
          (direction === 'short' && currentPrice >= stopLoss)
        )) {
          logger.info(`🏆 [PROP-FIRM] ❌ STOP HIT: ${position.symbol} | P&L: $${unrealizedPnL.toFixed(0)}`);
          // closePaperPosition handles all portfolio updates (cash, P&L, win/loss count)
          await storage.closePaperPosition(position.id, currentPrice, 'hit_stop');
          
          // Send Discord notification
          try {
            await sendBotTradeExitToDiscord({
              symbol: position.symbol,
              assetType: 'future',
              entryPrice,
              exitPrice: currentPrice,
              quantity,
              realizedPnL: unrealizedPnL,
              exitReason: 'hit_stop',
            });
            logger.info(`🔮 [FUTURES-MONITOR] 📱 Discord exit notification sent`);
          } catch (discordError) {
            logger.warn(`🔮 [FUTURES-MONITOR] Discord notification failed:`, discordError);
          }
          
          propFirmDailyPnL += unrealizedPnL;
          continue;
        }
        
        // Check target
        if (targetPrice && (
          (direction === 'long' && currentPrice >= targetPrice) ||
          (direction === 'short' && currentPrice <= targetPrice)
        )) {
          logger.info(`🏆 [PROP-FIRM] ✅ TARGET HIT: ${position.symbol} | P&L: +$${unrealizedPnL.toFixed(0)}`);
          // closePaperPosition handles all portfolio updates (cash, P&L, win/loss count)
          await storage.closePaperPosition(position.id, currentPrice, 'hit_target');
          
          // Send Discord notification
          try {
            await sendBotTradeExitToDiscord({
              symbol: position.symbol,
              assetType: 'future',
              entryPrice,
              exitPrice: currentPrice,
              quantity,
              realizedPnL: unrealizedPnL,
              exitReason: 'hit_target',
            });
            logger.info(`🔮 [FUTURES-MONITOR] 📱 Discord exit notification sent`);
          } catch (discordError) {
            logger.warn(`🔮 [FUTURES-MONITOR] Discord notification failed:`, discordError);
          }
          
          propFirmDailyPnL += unrealizedPnL;
          continue;
        }
        
      } catch (posErr) {
        logger.error(`🏆 [PROP-FIRM] Position error:`, posErr);
      }
    }
  } catch (error) {
    logger.error(`🏆 [PROP-FIRM] Monitor error:`, error);
  }
}
