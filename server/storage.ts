import { randomUUID } from "crypto";
import { formatInTimeZone } from "date-fns-tz";
import type {
  MarketData,
  InsertMarketData,
  TradeIdea,
  InsertTradeIdea,
  Catalyst,
  InsertCatalyst,
  WatchlistItem,
  InsertWatchlist,
  OptionsData,
  InsertOptionsData,
  UserPreferences,
  InsertUserPreferences,
  ModelCard,
  InsertModelCard,
  OutcomeStatus,
  User,
  UpsertUser,
  FuturesContract,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, desc, sql as drizzleSql } from "drizzle-orm";
import {
  tradeIdeas,
  marketData as marketDataTable,
  catalysts as catalystsTable,
  watchlist as watchlistTable,
  optionsData as optionsDataTable,
  userPreferences as userPreferencesTable,
  modelCards as modelCardsTable,
  users,
  futuresContracts,
} from "@shared/schema";

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface PerformanceStats {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    closedIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    expiredIdeas: number;
    winRate: number; // Market win rate: hit_target / (hit_target + hit_stop)
    quantAccuracy: number; // Weighted prediction accuracy (confidence-weighted avg progress toward target)
    directionalAccuracy: number; // % of trades that moved at least 25% toward target
    avgPercentGain: number;
    avgHoldingTimeMinutes: number;
    // PROFESSIONAL RISK METRICS (Phase 1)
    sharpeRatio: number; // Risk-adjusted return (target >1.5 for day trading)
    maxDrawdown: number; // Worst peak-to-trough decline (%)
    profitFactor: number; // Gross wins / Gross losses (target >1.3)
    expectancy: number; // Expected value per trade ($ per $1 risked)
    // ENHANCED QUANT METRICS (Phase 2)
    evScore: number; // Expected Value: Avg(Win Size) / |Avg(Loss Size)|
    adjustedWeightedAccuracy: number; // quantAccuracy × √(min(EV Score, 4)) / 2
    oppositeDirectionRate: number; // % of trades moving opposite to prediction
    oppositeDirectionCount: number; // Count of opposite direction trades
    avgWinSize: number; // Average win size (%)
    avgLossSize: number; // Average loss size (%)
  };
  bySource: {
    source: string;
    totalIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    winRate: number;
    avgPercentGain: number;
  }[];
  byAssetType: {
    assetType: string;
    totalIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    winRate: number;
    avgPercentGain: number;
  }[];
  bySignalType: {
    signal: string;
    totalIdeas: number;
    wonIdeas: number;
    lostIdeas: number;
    winRate: number;
    avgPercentGain: number;
  }[];
}

export interface IStorage {
  // User operations (Required for Replit Auth)
  // Reference: blueprint:javascript_log_in_with_replit
  getUser(id: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  updateUserSubscription(userId: string, subscriptionData: { stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionTier?: string; subscriptionStatus?: string; subscriptionEndsAt?: Date | null }): Promise<User | undefined>;
  
  // Market Data
  getAllMarketData(): Promise<MarketData[]>;
  getMarketDataBySymbol(symbol: string): Promise<MarketData | undefined>;
  createMarketData(data: InsertMarketData): Promise<MarketData>;
  updateMarketData(symbol: string, data: Partial<InsertMarketData>): Promise<MarketData | undefined>;

  // Trade Ideas
  getAllTradeIdeas(): Promise<TradeIdea[]>;
  getTradeIdeaById(id: string): Promise<TradeIdea | undefined>;
  createTradeIdea(idea: InsertTradeIdea): Promise<TradeIdea>;
  updateTradeIdea(id: string, updates: Partial<TradeIdea>): Promise<TradeIdea | undefined>;
  deleteTradeIdea(id: string): Promise<boolean>;
  findSimilarTradeIdea(symbol: string, direction: string, entryPrice: number, hoursBack?: number, assetType?: string, optionType?: string, strikePrice?: number): Promise<TradeIdea | undefined>;
  updateTradeIdeaPerformance(id: string, performance: Partial<Pick<TradeIdea, 'outcomeStatus' | 'exitPrice' | 'exitDate' | 'resolutionReason' | 'actualHoldingTimeMinutes' | 'percentGain' | 'realizedPnL' | 'validatedAt' | 'outcomeNotes' | 'predictionAccurate' | 'predictionValidatedAt' | 'highestPriceReached' | 'lowestPriceReached'>>): Promise<TradeIdea | undefined>;
  getOpenTradeIdeas(): Promise<TradeIdea[]>;
  getPerformanceStats(): Promise<PerformanceStats>;

  // Catalysts
  getAllCatalysts(): Promise<Catalyst[]>;
  getCatalystsBySymbol(symbol: string): Promise<Catalyst[]>;
  createCatalyst(catalyst: InsertCatalyst): Promise<Catalyst>;

  // Watchlist
  getAllWatchlist(): Promise<WatchlistItem[]>;
  getWatchlistItem(id: string): Promise<WatchlistItem | undefined>;
  getWatchlistByUser(userId: string): Promise<WatchlistItem[]>;
  addToWatchlist(item: InsertWatchlist): Promise<WatchlistItem>;
  updateWatchlistItem(id: string, data: Partial<WatchlistItem>): Promise<WatchlistItem | undefined>;
  removeFromWatchlist(id: string): Promise<boolean>;

  // Options Data
  getOptionsBySymbol(symbol: string): Promise<OptionsData[]>;
  createOptionsData(data: InsertOptionsData): Promise<OptionsData>;

  // User Preferences
  getUserPreferences(): Promise<UserPreferences | undefined>;
  updateUserPreferences(prefs: Partial<InsertUserPreferences>): Promise<UserPreferences>;

  // 🔐 Model Cards (Governance & Auditability)
  getAllModelCards(): Promise<ModelCard[]>;
  getModelCardByVersion(engineVersion: string): Promise<ModelCard | undefined>;
  createModelCard(card: InsertModelCard): Promise<ModelCard>;
  updateModelCard(engineVersion: string, updates: Partial<ModelCard>): Promise<ModelCard | undefined>;
  getActiveModelCard(): Promise<ModelCard | undefined>;

  // Futures Contracts
  getFuturesContract(contractCode: string): Promise<FuturesContract | null>;
  getFuturesContractsByRoot(rootSymbol: string): Promise<FuturesContract[]>;
  getActiveFuturesContract(rootSymbol: string): Promise<FuturesContract | null>;
  updateFuturesContract(contractCode: string, updates: Partial<FuturesContract>): Promise<FuturesContract>;

  // Chat Messages
  getChatHistory(): Promise<ChatMessage[]>;
  addChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage>;
  clearChatHistory(): Promise<void>;
}

export class MemStorage implements IStorage {
  private marketData: Map<string, MarketData>;
  private tradeIdeas: Map<string, TradeIdea>;
  private catalysts: Map<string, Catalyst>;
  private watchlist: Map<string, WatchlistItem>;
  private optionsData: Map<string, OptionsData>;
  private userPreferences: UserPreferences | null;
  private chatHistory: Map<string, ChatMessage>;
  private users: Map<string, User>;
  private futuresContracts: Map<string, FuturesContract>;

  constructor() {
    this.marketData = new Map();
    this.tradeIdeas = new Map();
    this.catalysts = new Map();
    this.watchlist = new Map();
    this.optionsData = new Map();
    this.userPreferences = null;
    this.chatHistory = new Map();
    this.users = new Map();
    this.futuresContracts = new Map();
    this.seedData();
  }

  private seedData() {
    // Seed some initial market data
    const now = new Date().toISOString();
    
    const seedMarketData: InsertMarketData[] = [
      {
        symbol: "AAPL",
        assetType: "stock",
        currentPrice: 225.40,
        changePercent: 1.82,
        volume: 48230000,
        marketCap: 3500000000000,
        session: "rth",
        timestamp: now,
        high24h: 227.15,
        low24h: 223.80,
        high52Week: 237.50,
        low52Week: 164.08,
        avgVolume: 52000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "TSLA",
        assetType: "stock",
        currentPrice: 258.92,
        changePercent: -0.85,
        volume: 92100000,
        marketCap: 820000000000,
        session: "rth",
        timestamp: now,
        high24h: 262.40,
        low24h: 256.15,
        high52Week: 299.29,
        low52Week: 138.80,
        avgVolume: 88000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "NVDA",
        assetType: "stock",
        currentPrice: 138.75,
        changePercent: 3.24,
        volume: 38900000,
        marketCap: 3400000000000,
        session: "rth",
        timestamp: now,
        high24h: 140.20,
        low24h: 134.50,
        high52Week: 140.76,
        low52Week: 39.23,
        avgVolume: 42000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "SPY",
        assetType: "option",
        currentPrice: 575.30,
        changePercent: 0.45,
        volume: 82100000,
        session: "rth",
        timestamp: now,
        high24h: 576.85,
        low24h: 573.20,
        high52Week: 598.24,
        low52Week: 408.93,
        avgVolume: 78000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "BTC",
        assetType: "crypto",
        currentPrice: 97250.00,
        changePercent: 2.15,
        volume: 32400000000,
        marketCap: 1920000000000,
        session: "rth",
        timestamp: now,
        high24h: 98500.00,
        low24h: 95100.00,
        high52Week: 108135.00,
        low52Week: 38505.00,
        avgVolume: 28000000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "ETH",
        assetType: "crypto",
        currentPrice: 3615.80,
        changePercent: 1.67,
        volume: 18200000000,
        marketCap: 435000000000,
        session: "rth",
        timestamp: now,
        high24h: 3680.00,
        low24h: 3555.00,
        high52Week: 4878.26,
        low52Week: 1523.24,
        avgVolume: 16500000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "XRP",
        assetType: "crypto",
        currentPrice: 2.38,
        changePercent: 4.12,
        volume: 2450000000,
        marketCap: 135000000000,
        session: "rth",
        timestamp: now,
        high24h: 2.42,
        low24h: 2.28,
        high52Week: 3.40,
        low52Week: 0.38,
        avgVolume: 2100000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "SNDL",
        assetType: "stock",
        currentPrice: 1.85,
        changePercent: 8.82,
        volume: 128000000,
        marketCap: 420000000,
        session: "rth",
        timestamp: now,
        high24h: 1.92,
        low24h: 1.68,
        high52Week: 3.96,
        low52Week: 1.82,
        avgVolume: 85000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "GME",
        assetType: "stock",
        currentPrice: 12.35,
        changePercent: -2.29,
        volume: 18500000,
        marketCap: 5200000000,
        session: "rth",
        timestamp: now,
        high24h: 12.80,
        low24h: 12.30,
        high52Week: 48.15,
        low52Week: 12.20,
        avgVolume: 11000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "AMC",
        assetType: "stock",
        currentPrice: 4.82,
        changePercent: 12.45,
        volume: 89500000,
        marketCap: 2100000000,
        session: "rth",
        timestamp: now,
        high24h: 4.95,
        low24h: 4.25,
        high52Week: 28.89,
        low52Week: 2.38,
        avgVolume: 35000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "BBBY",
        assetType: "stock",
        currentPrice: 0.28,
        changePercent: 35.48,
        volume: 145000000,
        marketCap: 25000000,
        session: "rth",
        timestamp: now,
        high24h: 0.32,
        low24h: 0.18,
        high52Week: 4.95,
        low52Week: 0.12,
        avgVolume: 42000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "PEPE",
        assetType: "crypto",
        currentPrice: 0.00002145,
        changePercent: 48.92,
        volume: 892000000,
        marketCap: 9020000000,
        session: "rth",
        timestamp: now,
        high24h: 0.00002389,
        low24h: 0.00001425,
        high52Week: 0.00004285,
        low52Week: 0.00000058,
        avgVolume: 285000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "SHIB",
        assetType: "crypto",
        currentPrice: 0.00003892,
        changePercent: 22.15,
        volume: 1240000000,
        marketCap: 22900000000,
        session: "rth",
        timestamp: now,
        high24h: 0.00004125,
        low24h: 0.00003105,
        high52Week: 0.00008845,
        low52Week: 0.00000558,
        avgVolume: 425000000,
        dataSource: "seed",
        lastUpdated: now,
      },
      {
        symbol: "AVAX",
        assetType: "crypto",
        currentPrice: 48.25,
        changePercent: 8.45,
        volume: 825000000,
        marketCap: 19500000000,
        session: "rth",
        timestamp: now,
        high24h: 49.85,
        low24h: 44.10,
        high52Week: 151.25,
        low52Week: 8.85,
        avgVolume: 485000000,
        dataSource: "seed",
        lastUpdated: now,
      },
    ];

    seedMarketData.forEach((data) => {
      const id = randomUUID();
      this.marketData.set(id, { ...data, id } as MarketData);
    });

    // Seed trade ideas with time windows
    // Time window helpers for seed data
    const getEntryValidUntil = (assetType: string) => {
      const minutesValid = assetType === 'crypto' ? 120 : 90;
      const validUntilDate = new Date(Date.now() + minutesValid * 60 * 1000);
      return formatInTimeZone(validUntilDate, 'America/Chicago', 'h:mm a zzz');
    };
    
    const getExitBy = (assetType: string) => {
      if (assetType === 'crypto') {
        const exitDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return formatInTimeZone(exitDate, 'America/Chicago', 'MMM d, h:mm a zzz');
      } else {
        // Stocks: Exit by market close
        return formatInTimeZone(new Date(), 'America/Chicago', 'MMM d') + ' 4:00 PM EST';
      }
    };

    const seedTradeIdeas: InsertTradeIdea[] = [
      {
        symbol: "RENDER",
        assetType: "crypto",
        direction: "long",
        entryPrice: 4.85,
        targetPrice: 6.20,
        stopLoss: 4.30,
        riskRewardRatio: 2.45,
        catalyst: "GPU rendering network expansion, AI compute demand surge",
        analysis: "RENDER breaking out from consolidation with AI/GPU narrative gaining traction. Network utilization up 40% month-over-month as AI companies seek decentralized compute. Technical setup shows accumulation pattern with volume spike. Market cap $1.8B positions this in hidden gem range. RSI at 58 with room for upside. Potential gain: +27.8% | Risk: -11.3%",
        liquidityWarning: false,
        sessionContext: "24/7 Trading",
        timestamp: now,
        entryValidUntil: getEntryValidUntil('crypto'),
        exitBy: getExitBy('crypto'),
        source: "quant",
        confidenceScore: 78,
        qualitySignals: ['Strong R:R (2.5:1)', 'Volume Spike (2.8x)', 'Emerging Sector'],
        probabilityBand: 'B',
        outcomeStatus: 'open' as OutcomeStatus,
      },
      {
        symbol: "ONDO",
        assetType: "crypto",
        direction: "long",
        entryPrice: 0.92,
        targetPrice: 1.28,
        stopLoss: 0.82,
        riskRewardRatio: 3.60,
        catalyst: "Real-world asset tokenization trend, institutional partnerships",
        analysis: "ONDO Finance leading RWA tokenization with $500M+ in tokenized treasuries. Recent partnership announcements driving volume 4x above average. Breaking above $0.90 resistance with strong conviction. Market cap $1.3B - undervalued vs. competitors. Technical indicators aligned bullish across timeframes. Potential gain: +39.1% | Risk: -10.9%",
        liquidityWarning: false,
        sessionContext: "24/7 Trading",
        timestamp: now,
        entryValidUntil: getEntryValidUntil('crypto'),
        exitBy: getExitBy('crypto'),
        source: "quant",
        confidenceScore: 82,
        qualitySignals: ['Excellent R:R (3.6:1)', 'Institutional Flow', 'RWA Narrative'],
        probabilityBand: 'A',
        outcomeStatus: 'open' as OutcomeStatus,
      },
      {
        symbol: "JUP",
        assetType: "crypto",
        direction: "long",
        entryPrice: 0.78,
        targetPrice: 1.05,
        stopLoss: 0.68,
        riskRewardRatio: 2.70,
        catalyst: "Solana DEX dominance, Jupiter aggregator volume surge",
        analysis: "Jupiter (JUP) capturing 70%+ of Solana DEX volume as SOL ecosystem expands. Protocol revenue up 3x month-over-month. Hidden gem at $1.1B market cap with strong fundamentals. Volume spike indicating smart money accumulation. RSI bullish divergence forming at support. Multi-timeframe analysis confirms uptrend resumption. Potential gain: +34.6% | Risk: -12.8%",
        liquidityWarning: false,
        sessionContext: "24/7 Trading",
        timestamp: now,
        entryValidUntil: getEntryValidUntil('crypto'),
        exitBy: getExitBy('crypto'),
        source: "quant",
        confidenceScore: 76,
        qualitySignals: ['Strong R:R (2.7:1)', 'Revenue Growth', 'DeFi Leader'],
        probabilityBand: 'B',
        outcomeStatus: 'open' as OutcomeStatus,
      },
      {
        symbol: "PENDLE",
        assetType: "crypto",
        direction: "long",
        entryPrice: 3.42,
        targetPrice: 4.65,
        stopLoss: 3.10,
        riskRewardRatio: 3.84,
        catalyst: "Yield trading protocol innovation, DeFi TVL growth",
        analysis: "PENDLE pioneering yield tokenization with TVL growing 250% quarter-over-quarter. Undervalued at $850M market cap relative to DeFi peers. Breaking out from accumulation zone with institutional buying signals. Volume 3.2x average confirming breakout validity. MACD bullish crossover with RSI at 62. Potential gain: +36.0% | Risk: -9.4%",
        liquidityWarning: false,
        sessionContext: "24/7 Trading",
        timestamp: now,
        entryValidUntil: getEntryValidUntil('crypto'),
        exitBy: getExitBy('crypto'),
        source: "quant",
        confidenceScore: 80,
        qualitySignals: ['Excellent R:R (3.8:1)', 'TVL Expansion', 'Innovation Leader'],
        probabilityBand: 'A',
        outcomeStatus: 'open' as OutcomeStatus,
      },
    ];

    seedTradeIdeas.forEach((idea) => {
      const id = randomUUID();
      this.tradeIdeas.set(id, { ...idea, id } as TradeIdea);
    });

    // Seed catalysts
    const seedCatalysts: InsertCatalyst[] = [
      {
        symbol: "AAPL",
        title: "Apple Q4 Earnings Report Exceeds Expectations",
        description: "Apple reported Q4 revenue of $89.5B, beating analyst estimates of $85.2B. iPhone sales particularly strong in China market, up 15% YoY. Services revenue hit record high.",
        source: "Bloomberg",
        timestamp: now,
        eventType: "earnings",
        impact: "high",
      },
      {
        symbol: "TSLA",
        title: "Tesla Cybertruck Production Delays Announced",
        description: "Company announced 3-month delay in Cybertruck mass production timeline due to supply chain constraints. Management maintains full-year delivery guidance.",
        source: "Reuters",
        timestamp: now,
        eventType: "news",
        impact: "medium",
      },
      {
        symbol: "NVDA",
        title: "Major Cloud Provider Announces $10B AI Infrastructure Deal",
        description: "Leading cloud provider confirmed massive order for NVDA H100 GPUs as part of AI infrastructure expansion. Delivery expected over next 18 months.",
        source: "WSJ",
        timestamp: now,
        eventType: "news",
        impact: "high",
      },
      {
        symbol: "BTC",
        title: "Bitcoin ETF Approval Decision Expected This Week",
        description: "SEC deadline for spot Bitcoin ETF decision approaches. Market speculation building around potential approval of multiple applications.",
        source: "CoinDesk",
        timestamp: now,
        eventType: "news",
        impact: "high",
      },
    ];

    seedCatalysts.forEach((catalyst) => {
      const id = randomUUID();
      this.catalysts.set(id, { ...catalyst, id });
    });

    // Seed watchlist items
    const seedWatchlist: InsertWatchlist[] = [
      {
        symbol: "NVDA",
        assetType: "stock" as const,
        targetPrice: 145.00,
        notes: "Breakout above 140 with strong AI momentum",
        addedAt: now,
      },
      {
        symbol: "BTC",
        assetType: "crypto" as const,
        targetPrice: 100000,
        notes: "Watching for break above 100k psychological level",
        addedAt: now,
      },
      {
        symbol: "AAPL",
        assetType: "stock" as const,
        targetPrice: 235.00,
        notes: "iPhone sales momentum - targeting 235",
        addedAt: now,
      },
    ];

    seedWatchlist.forEach((item) => {
      const id = randomUUID();
      this.watchlist.set(id, { ...item, id } as WatchlistItem);
    });

    // Initialize default user preferences
    this.userPreferences = {
      id: randomUUID(),
      accountSize: 10000,
      maxRiskPerTrade: 1,
      defaultCapitalPerIdea: 1000,
      defaultOptionsBudget: 250,
      preferredAssets: ["stock", "option", "crypto"],
      holdingHorizon: "intraday",
    };
  }

  // User Management Methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const id = userData.id || randomUUID();
    const user: User = {
      id,
      discordUserId: userData.discordUserId || null,
      discordUsername: userData.discordUsername || null,
      email: userData.email || null,
      subscriptionTier: userData.subscriptionTier || 'free',
      subscriptionStatus: userData.subscriptionStatus || 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const existing = this.users.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async updateUserSubscription(userId: string, subscriptionData: any): Promise<User | undefined> {
    return this.updateUser(userId, subscriptionData);
  }

  // Market Data Methods
  async getAllMarketData(): Promise<MarketData[]> {
    return Array.from(this.marketData.values());
  }

  async getMarketDataBySymbol(symbol: string): Promise<MarketData | undefined> {
    return Array.from(this.marketData.values()).find((d) => d.symbol === symbol);
  }

  async createMarketData(data: InsertMarketData): Promise<MarketData> {
    const id = randomUUID();
    const marketData: MarketData = { ...data, id } as MarketData;
    this.marketData.set(id, marketData);
    return marketData;
  }

  async updateMarketData(symbol: string, data: Partial<InsertMarketData>): Promise<MarketData | undefined> {
    const existing = Array.from(this.marketData.values()).find((d) => d.symbol === symbol);
    if (!existing) return undefined;
    const updated = { ...existing, ...data } as MarketData;
    this.marketData.set(existing.id, updated);
    return updated;
  }

  // Trade Ideas Methods
  async getAllTradeIdeas(): Promise<TradeIdea[]> {
    return Array.from(this.tradeIdeas.values());
  }

  async getTradeIdeaById(id: string): Promise<TradeIdea | undefined> {
    return this.tradeIdeas.get(id);
  }

  async createTradeIdea(idea: InsertTradeIdea): Promise<TradeIdea> {
    const id = randomUUID();
    const tradeIdea: TradeIdea = { 
      ...idea, 
      id,
      outcomeStatus: 'open' 
    } as TradeIdea;
    this.tradeIdeas.set(id, tradeIdea);
    return tradeIdea;
  }

  async updateTradeIdea(id: string, updates: Partial<TradeIdea>): Promise<TradeIdea | undefined> {
    const existing = this.tradeIdeas.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.tradeIdeas.set(id, updated);
    return updated;
  }

  async deleteTradeIdea(id: string): Promise<boolean> {
    return this.tradeIdeas.delete(id);
  }

  async findSimilarTradeIdea(symbol: string, direction: string, entryPrice: number, hoursBack: number = 24, assetType?: string, optionType?: string, strikePrice?: number): Promise<TradeIdea | undefined> {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    
    const priceThreshold = 0.02; // 2% price difference threshold
    
    return Array.from(this.tradeIdeas.values()).find(idea => {
      const ideaTime = new Date(idea.timestamp);
      const priceDiff = Math.abs(idea.entryPrice - entryPrice) / entryPrice;
      
      // Base conditions
      let matches = (
        idea.symbol === symbol &&
        idea.direction === direction &&
        priceDiff <= priceThreshold &&
        ideaTime >= cutoffTime &&
        idea.source === 'quant' && // Only check quant ideas
        idea.outcomeStatus === 'open' // Only check open ideas
      );
      
      // Add asset type check if provided
      if (matches && assetType) {
        matches = matches && idea.assetType === assetType;
      }
      
      // Add option type check if provided
      if (matches && optionType) {
        matches = matches && idea.optionType === optionType;
      }
      
      // Add strike price check for options (within $1)
      if (matches && assetType === 'option' && strikePrice !== undefined && strikePrice !== null) {
        matches = matches && 
          idea.strikePrice !== null && 
          idea.strikePrice !== undefined &&
          Math.abs(idea.strikePrice - strikePrice) <= 1;
      }
      
      return matches;
    });
  }

  async updateTradeIdeaPerformance(id: string, performance: Partial<Pick<TradeIdea, 'outcomeStatus' | 'exitPrice' | 'exitDate' | 'resolutionReason' | 'actualHoldingTimeMinutes' | 'percentGain' | 'realizedPnL' | 'validatedAt' | 'outcomeNotes' | 'predictionAccurate' | 'predictionValidatedAt' | 'highestPriceReached' | 'lowestPriceReached'>>): Promise<TradeIdea | undefined> {
    const existing = this.tradeIdeas.get(id);
    if (!existing) return undefined;
    
    // Calculate actualHoldingTimeMinutes if not provided or is 0
    let holdingTimeMinutes: number | null = performance.actualHoldingTimeMinutes ?? null;
    if (performance.exitDate && (!holdingTimeMinutes || holdingTimeMinutes === 0)) {
      const createdAt = new Date(existing.timestamp);
      const exitedAt = new Date(performance.exitDate);
      const diffMs = exitedAt.getTime() - createdAt.getTime();
      holdingTimeMinutes = Math.floor(diffMs / (1000 * 60));
    }
    
    const updated = { 
      ...existing, 
      ...performance,
      actualHoldingTimeMinutes: holdingTimeMinutes
    };
    this.tradeIdeas.set(id, updated);
    
    return updated;
  }

  async getOpenTradeIdeas(): Promise<TradeIdea[]> {
    return Array.from(this.tradeIdeas.values()).filter(
      (idea) => idea.outcomeStatus === 'open'
    );
  }

  async getPerformanceStats(filters?: {
    startDate?: string; // ISO date string
    endDate?: string;   // ISO date string
    source?: string;    // 'ai', 'quant', 'manual'
    includeAllVersions?: boolean; // When true, includes v2.x trades for ML/admin analysis (default: false = v3.0+ only)
  }): Promise<PerformanceStats> {
    let allIdeas = Array.from(this.tradeIdeas.values());
    const originalCount = allIdeas.length;
    
    console.log(`[STORAGE] getPerformanceStats called with filters:`, JSON.stringify(filters));
    console.log(`[STORAGE] Total ideas before filtering:`, originalCount);
    
    // Exclude buggy/test trades (exclude_from_training=true)
    allIdeas = allIdeas.filter(idea => !idea.excludeFromTraining);
    
    // Apply date filters if provided (filter by date portion only, avoiding timezone issues)
    if (filters?.startDate || filters?.endDate) {
      allIdeas = allIdeas.filter(idea => {
        // Extract just the date portion (YYYY-MM-DD) from ISO timestamp
        const ideaDateStr = idea.timestamp.split('T')[0];
        
        if (filters.startDate) {
          if (ideaDateStr < filters.startDate) return false;
        }
        if (filters.endDate) {
          if (ideaDateStr > filters.endDate) return false;
        }
        return true;
      });
      console.log(`[PERF-STATS] Date filter applied: ${filters.startDate} to ${filters.endDate} → ${originalCount} ideas filtered to ${allIdeas.length}`);
    }
    
    // Apply source filter if provided
    if (filters?.source) {
      allIdeas = allIdeas.filter(idea => idea.source === filters.source);
    }
    
    // 🎯 SMART ENGINE VERSION FILTERING
    // Default behavior (includeAllVersions=false): Filter to current-gen engines only
    // ML/Admin mode (includeAllVersions=true): Include ALL versions for training, analysis, and auditing
    if (!filters?.includeAllVersions) {
      // CURRENT-GEN ENGINES (include):
      // - Quant v3.x (research-backed signals: RSI2, VWAP, Volume Spike)
      // - Flow Scanner (all versions - options flow detection)
      // - Hybrid (all versions - AI + Quant fusion)
      // - AI (all versions - GPT/Claude/Gemini analysis)
      // - No engineVersion (newly generated, treated as current-gen)
      // 
      // LEGACY ENGINES (exclude):
      // - Quant v2.x and v1.x (broken MACD, ML signals)
      const beforeVersionFilter = allIdeas.length;
      allIdeas = allIdeas.filter(idea => {
        if (!idea.engineVersion) {
          return true; // No version = current-gen (newly generated)
        }
        
        const version = idea.engineVersion.toLowerCase();
        
        // Include all current-gen engines
        if (version.startsWith('v3.')) return true;        // Quant v3.x
        if (version.startsWith('flow_')) return true;       // Flow Scanner
        if (version.startsWith('hybrid_')) return true;     // Hybrid
        if (version.startsWith('ai_')) return true;         // AI
        
        // Exclude legacy Quant v1.x and v2.x
        return false;
      });
      console.log(`[PERF-STATS] Engine filter: Current-gen only → ${beforeVersionFilter} ideas filtered to ${allIdeas.length}`);
    } else {
      console.log(`[PERF-STATS] All engine versions included (ML/Admin mode) → ${allIdeas.length} total ideas`);
    }
    
    const closedIdeas = allIdeas.filter((idea) => idea.outcomeStatus !== 'open');
    const wonIdeas = closedIdeas.filter((idea) => idea.outcomeStatus === 'hit_target');
    const lostIdeas = closedIdeas.filter((idea) => idea.outcomeStatus === 'hit_stop');
    const expiredIdeas = closedIdeas.filter((idea) => idea.outcomeStatus === 'expired');

    // Overall stats
    // WIN RATE FIX: Exclude expired ideas from denominator - only count actual wins vs losses
    const decidedIdeas = wonIdeas.length + lostIdeas.length;
    const winRate = decidedIdeas > 0 ? (wonIdeas.length / decidedIdeas) * 100 : 0;
    
    // QUANT ACCURACY: Calculate percentage progress toward target (0-100+%)
    // For ALL trades (open + closed), calculate how far price moved toward target
    const evaluatePredictionAccuracyPercent = (idea: TradeIdea): number | null => {
      // Closed trades: use explicit predictionAccuracyPercent field if available
      if (idea.outcomeStatus !== 'open') {
        return idea.predictionAccuracyPercent ?? null;
      }
      
      // Open trades: calculate percentage progress using highest/lowest price reached
      const expectedMove = idea.targetPrice - idea.entryPrice;
      
      if (idea.direction === 'long') {
        const highestPrice = idea.highestPriceReached;
        if (!highestPrice || highestPrice === idea.entryPrice) return null;
        const actualMove = highestPrice - idea.entryPrice;
        const progressPercent = (actualMove / expectedMove) * 100;
        return Math.max(0, progressPercent);
      } else {
        const lowestPrice = idea.lowestPriceReached;
        if (!lowestPrice || lowestPrice === idea.entryPrice) return null;
        const actualMove = idea.entryPrice - lowestPrice;
        const targetMove = idea.entryPrice - idea.targetPrice;
        const progressPercent = (actualMove / targetMove) * 100;
        return Math.max(0, progressPercent);
      }
    };
    
    // Calculate WEIGHTED prediction accuracy with BOUNDED PENALTIES
    // Methodology: Include all trades, but cap extreme negative values to prevent skew
    // Weighting: 2x for high confidence (>85), 1x baseline, 0.5x for expired/low confidence
    const weightedAccuracyData: Array<{ accuracy: number; weight: number }> = [];
    
    allIdeas.forEach(idea => {
      const accuracyPercent = evaluatePredictionAccuracyPercent(idea);
      
      if (accuracyPercent !== null) {
        // CLAMP extreme negative values to -30% to prevent single bad trades from dominating
        // This maintains honesty while preventing outliers from skewing the metric
        const boundedAccuracy = Math.max(-30, accuracyPercent);
        
        // Determine weight based on confidence and outcome
        let weight = 1.0; // baseline
        
        if (idea.confidenceScore && idea.confidenceScore > 85) {
          weight = 2.0; // High confidence gets 2x weight
        } else if (idea.outcomeStatus === 'expired' || (idea.confidenceScore && idea.confidenceScore < 70)) {
          weight = 0.5; // Expired or low confidence gets 0.5x weight
        }
        
        weightedAccuracyData.push({ accuracy: boundedAccuracy, weight });
      }
    });
    
    const quantAccuracy = weightedAccuracyData.length > 0 
      ? weightedAccuracyData.reduce((sum, item) => sum + (item.accuracy * item.weight), 0) / 
        weightedAccuracyData.reduce((sum, item) => sum + item.weight, 0)
      : 0;
    
    // Calculate Directional Accuracy: % of trades that moved at least 25% toward target
    const directionalSuccessCount = allIdeas.filter(idea => {
      const accuracyPercent = evaluatePredictionAccuracyPercent(idea);
      return accuracyPercent !== null && accuracyPercent >= 25; // At least 25% of target achieved
    }).length;
    
    const directionalAccuracy = allIdeas.length > 0
      ? (directionalSuccessCount / allIdeas.length) * 100
      : 0;
    
    const avgPercentGain = closedIdeas.length > 0
      ? closedIdeas.reduce((sum, idea) => sum + (idea.percentGain || 0), 0) / closedIdeas.length
      : 0;
    const avgHoldingTime = closedIdeas.filter(i => i.actualHoldingTimeMinutes).length > 0
      ? closedIdeas.filter(i => i.actualHoldingTimeMinutes).reduce((sum, idea) => sum + (idea.actualHoldingTimeMinutes || 0), 0) / closedIdeas.filter(i => i.actualHoldingTimeMinutes).length
      : 0;

    // By source
    const sourceMap = new Map<string, TradeIdea[]>();
    closedIdeas.forEach((idea) => {
      const source = idea.source || 'unknown';
      if (!sourceMap.has(source)) {
        sourceMap.set(source, []);
      }
      sourceMap.get(source)!.push(idea);
    });

    const bySource = Array.from(sourceMap.entries()).map(([source, ideas]) => {
      const won = ideas.filter((i) => i.outcomeStatus === 'hit_target').length;
      const lost = ideas.filter((i) => i.outcomeStatus === 'hit_stop').length;
      // WIN RATE FIX: Only count decided trades (exclude expired)
      const decided = won + lost;
      const rate = decided > 0 ? (won / decided) * 100 : 0;
      const avgGain = ideas.length > 0
        ? ideas.reduce((sum, i) => sum + (i.percentGain || 0), 0) / ideas.length
        : 0;

      return {
        source,
        totalIdeas: ideas.length,
        wonIdeas: won,
        lostIdeas: lost,
        winRate: rate,
        avgPercentGain: avgGain,
      };
    });

    // By asset type
    const assetTypeMap = new Map<string, TradeIdea[]>();
    closedIdeas.forEach((idea) => {
      const assetType = idea.assetType || 'unknown';
      if (!assetTypeMap.has(assetType)) {
        assetTypeMap.set(assetType, []);
      }
      assetTypeMap.get(assetType)!.push(idea);
    });

    const byAssetType = Array.from(assetTypeMap.entries()).map(([assetType, ideas]) => {
      const won = ideas.filter((i) => i.outcomeStatus === 'hit_target').length;
      const lost = ideas.filter((i) => i.outcomeStatus === 'hit_stop').length;
      // WIN RATE FIX: Only count decided trades (exclude expired)
      const decided = won + lost;
      const rate = decided > 0 ? (won / decided) * 100 : 0;
      const avgGain = ideas.length > 0
        ? ideas.reduce((sum, i) => sum + (i.percentGain || 0), 0) / ideas.length
        : 0;

      return {
        assetType,
        totalIdeas: ideas.length,
        wonIdeas: won,
        lostIdeas: lost,
        winRate: rate,
        avgPercentGain: avgGain,
      };
    });

    // By signal type (quality signals)
    const signalMap = new Map<string, TradeIdea[]>();
    closedIdeas.forEach((idea) => {
      const signals = idea.qualitySignals || [];
      signals.forEach((signal) => {
        if (!signalMap.has(signal)) {
          signalMap.set(signal, []);
        }
        signalMap.get(signal)!.push(idea);
      });
    });

    const bySignalType = Array.from(signalMap.entries()).map(([signal, ideas]) => {
      const won = ideas.filter((i) => i.outcomeStatus === 'hit_target').length;
      const lost = ideas.filter((i) => i.outcomeStatus === 'hit_stop').length;
      // WIN RATE FIX: Only count decided trades (exclude expired)
      const decided = won + lost;
      const rate = decided > 0 ? (won / decided) * 100 : 0;
      const avgGain = ideas.length > 0
        ? ideas.reduce((sum, i) => sum + (i.percentGain || 0), 0) / ideas.length
        : 0;

      return {
        signal,
        totalIdeas: ideas.length,
        wonIdeas: won,
        lostIdeas: lost,
        winRate: rate,
        avgPercentGain: avgGain,
      };
    });

    // Calculate Enhanced Quant-Defensible Metrics
    const wonWithGain = closedIdeas.filter(i => i.outcomeStatus === 'hit_target' && i.percentGain !== null && i.percentGain > 0);
    const lostWithLoss = closedIdeas.filter(i => i.outcomeStatus === 'hit_stop' && i.percentGain !== null && i.percentGain < 0);
    
    const avgWinSize = wonWithGain.length > 0
      ? wonWithGain.reduce((sum, i) => sum + Math.abs(i.percentGain!), 0) / wonWithGain.length
      : 0;
    const avgLossSize = lostWithLoss.length > 0
      ? Math.abs(lostWithLoss.reduce((sum, i) => sum + i.percentGain!, 0) / lostWithLoss.length)
      : 0;
    
    // EV Score = Avg(Win Size) / |Avg(Loss Size)|
    const evScore = avgLossSize > 0 ? avgWinSize / avgLossSize : (avgWinSize > 0 ? 99 : 1);
    
    // Adjusted Weighted Accuracy
    const adjustedWeightedAccuracy = quantAccuracy * Math.sqrt(Math.min(evScore, 4)) / 2;
    
    // Opposite Direction Rate
    const oppositeDirectionCount = allIdeas.filter(idea => {
      const accuracyPercent = evaluatePredictionAccuracyPercent(idea);
      return accuracyPercent !== null && accuracyPercent < -10;
    }).length;
    
    const oppositeDirectionRate = allIdeas.length > 0
      ? (oppositeDirectionCount / allIdeas.length) * 100
      : 0;

    return {
      overall: {
        totalIdeas: allIdeas.length,
        openIdeas: allIdeas.filter((i) => i.outcomeStatus === 'open').length,
        closedIdeas: closedIdeas.length,
        wonIdeas: wonIdeas.length,
        lostIdeas: lostIdeas.length,
        expiredIdeas: expiredIdeas.length,
        winRate,
        quantAccuracy,
        directionalAccuracy,
        avgPercentGain,
        avgHoldingTimeMinutes: avgHoldingTime,
        // Professional metrics (simplified for MemStorage)
        sharpeRatio: 0,
        maxDrawdown: 0,
        profitFactor: 0,
        expectancy: 0,
        // Enhanced quant-defensible metrics
        evScore,
        adjustedWeightedAccuracy,
        oppositeDirectionRate,
        oppositeDirectionCount,
        avgWinSize,
        avgLossSize,
      },
      bySource,
      byAssetType,
      bySignalType,
    };
  }

  // Catalyst Methods
  async getAllCatalysts(): Promise<Catalyst[]> {
    return Array.from(this.catalysts.values());
  }

  async getCatalystsBySymbol(symbol: string): Promise<Catalyst[]> {
    return Array.from(this.catalysts.values()).filter((c) => c.symbol === symbol);
  }

  async createCatalyst(catalyst: InsertCatalyst): Promise<Catalyst> {
    const id = randomUUID();
    const newCatalyst: Catalyst = { ...catalyst, id };
    this.catalysts.set(id, newCatalyst);
    return newCatalyst;
  }

  // Watchlist Methods
  async getAllWatchlist(): Promise<WatchlistItem[]> {
    return Array.from(this.watchlist.values());
  }

  async getWatchlistItem(id: string): Promise<WatchlistItem | undefined> {
    return this.watchlist.get(id);
  }

  async getWatchlistByUser(userId: string): Promise<WatchlistItem[]> {
    return Array.from(this.watchlist.values()).filter(item => item.userId === userId);
  }

  async addToWatchlist(item: InsertWatchlist): Promise<WatchlistItem> {
    const id = randomUUID();
    const watchlistItem: WatchlistItem = { ...item, id } as WatchlistItem;
    this.watchlist.set(id, watchlistItem);
    return watchlistItem;
  }

  async updateWatchlistItem(id: string, data: Partial<WatchlistItem>): Promise<WatchlistItem | undefined> {
    const existing = this.watchlist.get(id);
    if (!existing) {
      return undefined;
    }
    const updated = { ...existing, ...data, id };
    this.watchlist.set(id, updated);
    return updated;
  }

  async removeFromWatchlist(id: string): Promise<boolean> {
    return this.watchlist.delete(id);
  }

  // Options Data Methods
  async getOptionsBySymbol(symbol: string): Promise<OptionsData[]> {
    return Array.from(this.optionsData.values()).filter((o) => o.symbol === symbol);
  }

  async createOptionsData(data: InsertOptionsData): Promise<OptionsData> {
    const id = randomUUID();
    const optionsData: OptionsData = { ...data, id } as OptionsData;
    this.optionsData.set(id, optionsData);
    return optionsData;
  }

  // User Preferences Methods
  async getUserPreferences(): Promise<UserPreferences | undefined> {
    return this.userPreferences || undefined;
  }

  async updateUserPreferences(prefs: Partial<InsertUserPreferences>): Promise<UserPreferences> {
    if (!this.userPreferences) {
      const id = randomUUID();
      this.userPreferences = {
        id,
        userId: "default_user",
        accountSize: 10000,
        maxRiskPerTrade: 1,
        defaultCapitalPerIdea: 1000,
        defaultOptionsBudget: 250,
        preferredAssets: ["stock", "option", "crypto"],
        holdingHorizon: "intraday",
        theme: "dark",
        timezone: "America/Chicago",
        defaultViewMode: "card",
        compactMode: false,
        discordWebhookUrl: null,
        enableTradeAlerts: true,
        enablePriceAlerts: true,
        enablePerformanceAlerts: false,
        enableWeeklyReport: false,
        defaultAssetFilter: "all",
        defaultConfidenceFilter: "all",
        autoRefreshEnabled: true,
        updatedAt: new Date(),
        ...prefs,
      };
    } else {
      this.userPreferences = { ...this.userPreferences, ...prefs };
    }
    return this.userPreferences;
  }

  // Chat History Methods
  async getChatHistory(): Promise<ChatMessage[]> {
    return Array.from(this.chatHistory.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async addChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const chatMessage: ChatMessage = { ...message, id, timestamp };
    this.chatHistory.set(id, chatMessage);
    return chatMessage;
  }

  async clearChatHistory(): Promise<void> {
    this.chatHistory.clear();
  }

  // Futures Contracts Methods
  async getFuturesContract(contractCode: string): Promise<FuturesContract | null> {
    return this.futuresContracts.get(contractCode) || null;
  }

  async getFuturesContractsByRoot(rootSymbol: string): Promise<FuturesContract[]> {
    return Array.from(this.futuresContracts.values()).filter(
      contract => contract.rootSymbol === rootSymbol
    );
  }

  async getActiveFuturesContract(rootSymbol: string): Promise<FuturesContract | null> {
    const contracts = await this.getFuturesContractsByRoot(rootSymbol);
    return contracts.find(contract => contract.isFrontMonth) || null;
  }

  async updateFuturesContract(contractCode: string, updates: Partial<FuturesContract>): Promise<FuturesContract> {
    const contract = this.futuresContracts.get(contractCode);
    if (!contract) {
      throw new Error(`Futures contract not found: ${contractCode}`);
    }
    const updated = { ...contract, ...updates };
    this.futuresContracts.set(contractCode, updated);
    return updated;
  }

  // 🔐 Model Cards Methods (Stub - not persisted in MemStorage)
  async getAllModelCards(): Promise<ModelCard[]> {
    return [];
  }

  async getModelCardByVersion(_engineVersion: string): Promise<ModelCard | undefined> {
    return undefined;
  }

  async createModelCard(_card: InsertModelCard): Promise<ModelCard> {
    throw new Error("Model Cards not supported in MemStorage");
  }

  async updateModelCard(_engineVersion: string, _updates: Partial<ModelCard>): Promise<ModelCard | undefined> {
    return undefined;
  }

  async getActiveModelCard(): Promise<ModelCard | undefined> {
    return undefined;
  }
}

// Database Storage Implementation (from javascript_database blueprint)
export class DatabaseStorage implements IStorage {
  private chatHistory: Map<string, ChatMessage>; // Keep chat in memory for now

  constructor() {
    this.chatHistory = new Map();
  }

  // User Operations (Required for Replit Auth)
  // Reference: blueprint:javascript_log_in_with_replit
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserSubscription(userId: string, subscriptionData: { stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionTier?: string; subscriptionStatus?: string; subscriptionEndsAt?: Date | null }): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        ...subscriptionData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated || undefined;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    // Delete associated data first
    await db.delete(userPreferencesTable).where(eq(userPreferencesTable.userId, id));
    await db.delete(watchlistTable).where(eq(watchlistTable.userId, id));
    await db.delete(tradeIdeas).where(eq(tradeIdeas.userId, id));
    
    // Delete user
    const result = await db.delete(users).where(eq(users.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Market Data Methods
  async getAllMarketData(): Promise<MarketData[]> {
    return await db.select().from(marketDataTable);
  }

  async getMarketDataBySymbol(symbol: string): Promise<MarketData | undefined> {
    const [data] = await db.select().from(marketDataTable).where(eq(marketDataTable.symbol, symbol));
    return data || undefined;
  }

  async createMarketData(data: InsertMarketData): Promise<MarketData> {
    const [created] = await db.insert(marketDataTable).values(data).returning();
    return created;
  }

  async updateMarketData(symbol: string, data: Partial<InsertMarketData>): Promise<MarketData | undefined> {
    const [updated] = await db.update(marketDataTable)
      .set(data)
      .where(eq(marketDataTable.symbol, symbol))
      .returning();
    return updated || undefined;
  }

  // Trade Ideas Methods
  async getAllTradeIdeas(): Promise<TradeIdea[]> {
    return await db.select().from(tradeIdeas).orderBy(desc(tradeIdeas.timestamp));
  }

  async getTradeIdeaById(id: string): Promise<TradeIdea | undefined> {
    const [idea] = await db.select().from(tradeIdeas).where(eq(tradeIdeas.id, id));
    return idea || undefined;
  }

  async createTradeIdea(idea: InsertTradeIdea): Promise<TradeIdea> {
    const [created] = await db.insert(tradeIdeas).values(idea).returning();
    return created;
  }

  async updateTradeIdea(id: string, updates: Partial<TradeIdea>): Promise<TradeIdea | undefined> {
    const [updated] = await db.update(tradeIdeas)
      .set(updates)
      .where(eq(tradeIdeas.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTradeIdea(id: string): Promise<boolean> {
    const result = await db.delete(tradeIdeas).where(eq(tradeIdeas.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async findSimilarTradeIdea(symbol: string, direction: string, entryPrice: number, hoursBack: number = 24, assetType?: string, optionType?: string, strikePrice?: number): Promise<TradeIdea | undefined> {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const tolerance = entryPrice * 0.02; // 2% price tolerance

    // Build base query conditions
    const conditions = [
      eq(tradeIdeas.symbol, symbol),
      eq(tradeIdeas.direction, direction),
      gte(tradeIdeas.timestamp, cutoffTime),
      eq(tradeIdeas.source, 'quant'), // Only check quant ideas to prevent duplicates
      eq(tradeIdeas.outcomeStatus, 'open') // Only check open ideas
    ];

    // Add asset type filter if provided
    if (assetType) {
      conditions.push(eq(tradeIdeas.assetType, assetType));
    }

    // Add option-specific filters if provided
    if (optionType) {
      conditions.push(eq(tradeIdeas.optionType, optionType));
    }

    const results = await db.select().from(tradeIdeas)
      .where(and(...conditions));

    // For options, also check strike price match (within $1)
    if (assetType === 'option' && strikePrice !== undefined && strikePrice !== null) {
      return results.find(idea => 
        Math.abs(idea.entryPrice - entryPrice) <= tolerance &&
        idea.strikePrice !== null &&
        idea.strikePrice !== undefined &&
        Math.abs(idea.strikePrice - strikePrice) <= 1
      );
    }

    // For stocks/crypto, just check entry price tolerance
    return results.find(idea => 
      Math.abs(idea.entryPrice - entryPrice) <= tolerance
    );
  }

  async updateTradeIdeaPerformance(id: string, performance: Partial<Pick<TradeIdea, 'outcomeStatus' | 'exitPrice' | 'exitDate' | 'resolutionReason' | 'actualHoldingTimeMinutes' | 'percentGain' | 'realizedPnL' | 'validatedAt' | 'outcomeNotes' | 'predictionAccurate' | 'predictionValidatedAt' | 'highestPriceReached' | 'lowestPriceReached'>>): Promise<TradeIdea | undefined> {
    const existing = await this.getTradeIdeaById(id);
    if (!existing) return undefined;
    
    // Calculate actualHoldingTimeMinutes if not provided or is 0
    let holdingTimeMinutes: number | null = performance.actualHoldingTimeMinutes ?? null;
    if (performance.exitDate && (!holdingTimeMinutes || holdingTimeMinutes === 0)) {
      const createdAt = new Date(existing.timestamp);
      const exitedAt = new Date(performance.exitDate);
      const diffMs = exitedAt.getTime() - createdAt.getTime();
      holdingTimeMinutes = Math.floor(diffMs / (1000 * 60));
    }

    const [updated] = await db.update(tradeIdeas)
      .set({ ...performance, actualHoldingTimeMinutes: holdingTimeMinutes })
      .where(eq(tradeIdeas.id, id))
      .returning();
    return updated || undefined;
  }

  async getOpenTradeIdeas(): Promise<TradeIdea[]> {
    return await db.select().from(tradeIdeas).where(eq(tradeIdeas.outcomeStatus, 'open'));
  }

  async getPerformanceStats(filters?: {
    startDate?: string; // ISO date string (YYYY-MM-DD)
    endDate?: string;   // ISO date string (YYYY-MM-DD)
    source?: string;    // 'ai', 'quant', 'manual'
    includeAllVersions?: boolean; // When true, includes v2.x trades for ML/admin analysis (default: false = v3.0+ only)
    includeOptions?: boolean; // When true, includes options (default: false until proper option pricing implemented)
  }): Promise<PerformanceStats> {
    let allIdeasRaw = await this.getAllTradeIdeas();
    const originalCount = allIdeasRaw.length;
    
    // Apply date filters if provided (filter by date portion only, avoiding timezone issues)
    if (filters?.startDate || filters?.endDate) {
      allIdeasRaw = allIdeasRaw.filter(idea => {
        // Extract just the date portion (YYYY-MM-DD) from ISO timestamp
        const ideaDateStr = idea.timestamp.split('T')[0];
        
        if (filters.startDate) {
          if (ideaDateStr < filters.startDate) return false;
        }
        if (filters.endDate) {
          if (ideaDateStr > filters.endDate) return false;
        }
        return true;
      });
      console.log(`[PERF-STATS] Date filter applied: ${filters.startDate || 'all'} to ${filters.endDate || 'all'} → ${originalCount} ideas filtered to ${allIdeasRaw.length}`);
    }
    
    // Apply source filter if provided
    if (filters?.source) {
      allIdeasRaw = allIdeasRaw.filter(idea => idea.source === filters.source);
      console.log(`[PERF-STATS] Source filter applied: ${filters.source} → ${allIdeasRaw.length} ideas`);
    }
    
    // PERFORMANCE STATS: Exclude buggy/test trades (exclude_from_training=true)
    // These are legacy trades with known issues (e.g., inverted option directions)
    let allIdeas = allIdeasRaw.filter(idea => !idea.excludeFromTraining);
    console.log(`[PERF-STATS] After excluding buggy trades: ${allIdeas.length} ideas`);
    
    // 🎯 ENGINE VERSION FILTERING - RELAXED (Nov 11, 2025)
    // Previous issue: Excluded 500+ valid trades with NULL/legacy engineVersion
    // Fix: Default-include all trades to restore accurate performance stats
    // 
    // Only filter when explicitly requested via includeAllVersions parameter
    if (filters?.includeAllVersions === false) {
      // Explicitly requested to exclude legacy versions (rare case)
      const beforeVersionFilter = allIdeas.length;
      allIdeas = allIdeas.filter(idea => {
        if (!idea.engineVersion) return true; // NULL version = include
        
        const version = idea.engineVersion.toLowerCase();
        
        // Include current-gen engines
        if (version.startsWith('v3.')) return true;
        if (version.startsWith('flow_')) return true;
        if (version.startsWith('hybrid_')) return true;
        if (version.startsWith('ai_')) return true;
        if (version.startsWith('lotto_')) return true;
        if (version.startsWith('news_')) return true;
        
        return false; // Exclude other versions
      });
      console.log(`[PERF-STATS] Engine filter: Explicit legacy exclusion → ${beforeVersionFilter} filtered to ${allIdeas.length}`);
    } else {
      // Default: Include all versions (NULL, legacy, current-gen)
      console.log(`[PERF-STATS] Engine filter: Relaxed (all versions included) → ${allIdeas.length} ideas`);
    }
    
    // 🚨 OPTIONS FILTER: Exclude options by default until proper option pricing is implemented
    // Previous bug: Was comparing STOCK prices ($252) to OPTION premiums ($89), causing false wins
    // Flow Scanner's 99.4% win rate was entirely from false option wins!
    // Fix: Keep options disabled until premium fetching/normalization is fixed
    if (!filters?.includeOptions) {
      const beforeOptionsFilter = allIdeas.length;
      allIdeas = allIdeas.filter(idea => idea.assetType !== 'option');
      const optionsCount = beforeOptionsFilter - allIdeas.length;
      if (optionsCount > 0) {
        console.log(`[PERF-STATS] Options filter: Excluded ${optionsCount} option trades (no proper pricing yet) → ${allIdeas.length} ideas remain`);
      }
    } else {
      console.log(`[PERF-STATS] Options included (includeOptions=true) - WARNING: option win rates may be invalid`);
    }
    
    const openIdeas = allIdeas.filter(i => i.outcomeStatus === 'open');
    const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
    const wonIdeas = closedIdeas.filter(i => i.outcomeStatus === 'hit_target');
    const lostIdeas = closedIdeas.filter(i => i.outcomeStatus === 'hit_stop');
    const expiredIdeas = closedIdeas.filter(i => i.outcomeStatus === 'expired' || i.outcomeStatus === 'manual_exit');

    const calculateAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    
    const closedGains = closedIdeas.filter(i => i.percentGain !== null).map(i => i.percentGain!);
    const closedHoldingTimes = closedIdeas.filter(i => i.actualHoldingTimeMinutes !== null).map(i => i.actualHoldingTimeMinutes!);

    // Group by source (ALL ideas, not just closed) - DYNAMICALLY to include all sources (flow, hybrid, ai, quant, manual)
    const sourcesSet = new Set(allIdeas.map(i => i.source || 'unknown'));
    const bySource = Array.from(sourcesSet).map(source => {
      const sourceAllIdeas = allIdeas.filter(i => i.source === source);
      const sourceClosedIdeas = closedIdeas.filter(i => i.source === source);
      const sourceWon = sourceClosedIdeas.filter(i => i.outcomeStatus === 'hit_target');
      const sourceLost = sourceClosedIdeas.filter(i => i.outcomeStatus === 'hit_stop');
      const sourceGains = sourceClosedIdeas.filter(i => i.percentGain !== null).map(i => i.percentGain!);
      // WIN RATE FIX: Only count decided trades (exclude expired)
      const sourceDecided = sourceWon.length + sourceLost.length;
      
      return {
        source,
        totalIdeas: sourceAllIdeas.length, // Show ALL ideas (open + closed)
        wonIdeas: sourceWon.length,
        lostIdeas: sourceLost.length,
        winRate: sourceDecided > 0 ? (sourceWon.length / sourceDecided) * 100 : 0,
        avgPercentGain: calculateAvg(sourceGains),
      };
    }).sort((a, b) => b.totalIdeas - a.totalIdeas); // Sort by total trades descending

    // Group by asset type (ALL ideas, not just closed) - DYNAMICALLY to include all asset types
    const assetTypesSet = new Set(allIdeas.map(i => i.assetType || 'unknown'));
    const byAssetType = Array.from(assetTypesSet).map(assetType => {
      const assetAllIdeas = allIdeas.filter(i => i.assetType === assetType);
      const assetClosedIdeas = closedIdeas.filter(i => i.assetType === assetType);
      const assetWon = assetClosedIdeas.filter(i => i.outcomeStatus === 'hit_target');
      const assetLost = assetClosedIdeas.filter(i => i.outcomeStatus === 'hit_stop');
      const assetGains = assetClosedIdeas.filter(i => i.percentGain !== null).map(i => i.percentGain!);
      // WIN RATE FIX: Only count decided trades (exclude expired)
      const assetDecided = assetWon.length + assetLost.length;
      
      return {
        assetType,
        totalIdeas: assetAllIdeas.length, // Show ALL ideas (open + closed)
        wonIdeas: assetWon.length,
        lostIdeas: assetLost.length,
        winRate: assetDecided > 0 ? (assetWon.length / assetDecided) * 100 : 0,
        avgPercentGain: calculateAvg(assetGains),
      };
    }).sort((a, b) => b.totalIdeas - a.totalIdeas); // Sort by total trades descending

    // Group by signal type
    const signalMap = new Map<string, TradeIdea[]>();
    closedIdeas.forEach(idea => {
      if (idea.qualitySignals) {
        idea.qualitySignals.forEach(signal => {
          if (!signalMap.has(signal)) signalMap.set(signal, []);
          signalMap.get(signal)!.push(idea);
        });
      }
    });

    const bySignalType = Array.from(signalMap.entries()).map(([signal, ideas]) => {
      const signalWon = ideas.filter(i => i.outcomeStatus === 'hit_target');
      const signalLost = ideas.filter(i => i.outcomeStatus === 'hit_stop');
      const signalGains = ideas.filter(i => i.percentGain !== null).map(i => i.percentGain!);
      // WIN RATE FIX: Only count decided trades (exclude expired)
      const signalDecided = signalWon.length + signalLost.length;
      
      return {
        signal,
        totalIdeas: ideas.length,
        wonIdeas: signalWon.length,
        lostIdeas: signalLost.length,
        winRate: signalDecided > 0 ? (signalWon.length / signalDecided) * 100 : 0,
        avgPercentGain: calculateAvg(signalGains),
      };
    });

    // WIN RATE FIX: Exclude expired ideas from denominator - only count actual wins vs losses
    const decidedIdeas = wonIdeas.length + lostIdeas.length;

    // QUANT ACCURACY: Calculate percentage progress toward target (0-100+%)
    // For ALL trades (open + closed), calculate how far price moved toward target
    const evaluatePredictionAccuracyPercent = (idea: TradeIdea): number | null => {
      // Closed trades: use explicit predictionAccuracyPercent field if available
      if (idea.outcomeStatus !== 'open') {
        return idea.predictionAccuracyPercent ?? null;
      }
      
      // Open trades: calculate percentage progress using highest/lowest price reached
      const expectedMove = idea.targetPrice - idea.entryPrice;
      
      if (idea.direction === 'long') {
        const highestPrice = idea.highestPriceReached;
        if (!highestPrice || highestPrice === idea.entryPrice) return null;
        const actualMove = highestPrice - idea.entryPrice;
        const progressPercent = (actualMove / expectedMove) * 100;
        return Math.max(0, progressPercent);
      } else {
        const lowestPrice = idea.lowestPriceReached;
        if (!lowestPrice || lowestPrice === idea.entryPrice) return null;
        const actualMove = idea.entryPrice - lowestPrice;
        const targetMove = idea.entryPrice - idea.targetPrice;
        const progressPercent = (actualMove / targetMove) * 100;
        return Math.max(0, progressPercent);
      }
    };
    
    // Calculate WEIGHTED prediction accuracy with BOUNDED PENALTIES
    // Methodology: Include all trades, but cap extreme negative values to prevent skew
    // Weighting: 2x for high confidence (>85), 1x baseline, 0.5x for expired/low confidence
    const weightedAccuracyData: Array<{ accuracy: number; weight: number }> = [];
    
    allIdeas.forEach(idea => {
      const accuracyPercent = evaluatePredictionAccuracyPercent(idea);
      
      if (accuracyPercent !== null) {
        // CLAMP extreme negative values to -30% to prevent single bad trades from dominating
        // This maintains honesty while preventing outliers from skewing the metric
        const boundedAccuracy = Math.max(-30, accuracyPercent);
        
        // Determine weight based on confidence and outcome
        let weight = 1.0; // baseline
        
        if (idea.confidenceScore && idea.confidenceScore > 85) {
          weight = 2.0; // High confidence gets 2x weight
        } else if (idea.outcomeStatus === 'expired' || (idea.confidenceScore && idea.confidenceScore < 70)) {
          weight = 0.5; // Expired or low confidence gets 0.5x weight
        }
        
        weightedAccuracyData.push({ accuracy: boundedAccuracy, weight });
      }
    });
    
    const quantAccuracy = weightedAccuracyData.length > 0 
      ? weightedAccuracyData.reduce((sum, item) => sum + (item.accuracy * item.weight), 0) / 
        weightedAccuracyData.reduce((sum, item) => sum + item.weight, 0)
      : 0;
    
    // Calculate Directional Accuracy: % of trades that moved at least 25% toward target
    const directionalSuccessCount = allIdeas.filter(idea => {
      const accuracyPercent = evaluatePredictionAccuracyPercent(idea);
      return accuracyPercent !== null && accuracyPercent >= 25; // At least 25% of target achieved
    }).length;
    
    const directionalAccuracy = allIdeas.length > 0
      ? (directionalSuccessCount / allIdeas.length) * 100
      : 0;

    // ========================================
    // PROFESSIONAL RISK METRICS (Phase 1)
    // ========================================
    
    // 1. SHARPE RATIO: Risk-adjusted return
    // Formula: (Avg Return - Risk Free Rate) / StdDev of Returns
    // For day trading, risk-free rate ~0, so Sharpe = Avg Return / StdDev
    const calculateStdDev = (arr: number[]): number => {
      if (arr.length < 2) return 0;
      const avg = calculateAvg(arr);
      const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
      const variance = calculateAvg(squareDiffs);
      return Math.sqrt(variance);
    };
    
    const decidedGains = [...wonIdeas, ...lostIdeas]
      .filter(i => i.percentGain !== null)
      .map(i => i.percentGain!);
    
    const avgReturn = calculateAvg(decidedGains);
    const stdDevReturn = calculateStdDev(decidedGains);
    const sharpeRatio = stdDevReturn > 0 ? avgReturn / stdDevReturn : 0;
    
    // 2. MAX DRAWDOWN: Worst peak-to-trough decline
    // Simulate equity curve from trade sequence
    let peak = 100; // Start with $100
    let equity = 100;
    let maxDrawdown = 0;
    
    decidedIdeas > 0 && [...wonIdeas, ...lostIdeas]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach(idea => {
        if (idea.percentGain !== null) {
          equity = equity * (1 + idea.percentGain / 100);
          if (equity > peak) peak = equity;
          const drawdown = ((peak - equity) / peak) * 100;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
      });
    
    // 3. PROFIT FACTOR: Gross Wins / Gross Losses
    const grossWins = wonIdeas
      .filter(i => i.percentGain !== null && i.percentGain > 0)
      .reduce((sum, i) => sum + i.percentGain!, 0);
    
    const grossLosses = Math.abs(lostIdeas
      .filter(i => i.percentGain !== null && i.percentGain < 0)
      .reduce((sum, i) => sum + i.percentGain!, 0));
    
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? 99 : 0);
    
    // 4. EXPECTANCY: Expected value per trade
    // Formula: (Avg Win × Win%) - (Avg Loss × Loss%)
    const avgWin = wonIdeas.filter(i => i.percentGain !== null && i.percentGain > 0).length > 0
      ? calculateAvg(wonIdeas.filter(i => i.percentGain !== null && i.percentGain > 0).map(i => i.percentGain!))
      : 0;
    
    const avgLoss = lostIdeas.filter(i => i.percentGain !== null && i.percentGain < 0).length > 0
      ? Math.abs(calculateAvg(lostIdeas.filter(i => i.percentGain !== null && i.percentGain < 0).map(i => i.percentGain!)))
      : 0;
    
    const winPct = decidedIdeas > 0 ? wonIdeas.length / decidedIdeas : 0;
    const lossPct = decidedIdeas > 0 ? lostIdeas.length / decidedIdeas : 0;
    
    const expectancy = (avgWin * winPct) - (avgLoss * lossPct);

    // ========================================
    // EXPECTED VALUE (EV) SCORE - Quant-Defensible Profitability Metric
    // ========================================
    // Formula: EV Score = Avg(Expected Gain) / |Avg(Expected Loss)|
    // This shows the profitability quality - do wins compensate for losses?
    const evScore = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 99 : 1);
    
    // Adjusted Weighted Accuracy = quantAccuracy × sqrt(EV Score)
    // Merges accuracy and profitability quality into one interpretive metric
    // Using sqrt to keep the result in 0-100 range while EV Score impact is meaningful
    const adjustedWeightedAccuracy = quantAccuracy * Math.sqrt(Math.min(evScore, 4)) / 2; // Cap at 2x boost
    
    // ========================================
    // OPPOSITE DIRECTION RATE - Critical Blind Spot Detection
    // ========================================
    // Tracks trades that moved AGAINST prediction by at least 10% of expected move
    // This catches model failures where price moved significantly in wrong direction
    const oppositeDirectionCount = allIdeas.filter(idea => {
      const accuracyPercent = evaluatePredictionAccuracyPercent(idea);
      // Moved opposite to prediction by at least 10% of expected move
      return accuracyPercent !== null && accuracyPercent < -10;
    }).length;
    
    const oppositeDirectionRate = allIdeas.length > 0
      ? (oppositeDirectionCount / allIdeas.length) * 100
      : 0;

    return {
      overall: {
        totalIdeas: allIdeas.length,
        openIdeas: openIdeas.length,
        closedIdeas: closedIdeas.length,
        wonIdeas: wonIdeas.length,
        lostIdeas: lostIdeas.length,
        expiredIdeas: expiredIdeas.length,
        winRate: decidedIdeas > 0 ? (wonIdeas.length / decidedIdeas) * 100 : 0,
        quantAccuracy,
        directionalAccuracy,
        avgPercentGain: calculateAvg(closedGains),
        avgHoldingTimeMinutes: calculateAvg(closedHoldingTimes),
        // Professional risk metrics
        sharpeRatio,
        maxDrawdown,
        profitFactor,
        expectancy,
        // Enhanced quant-defensible metrics
        evScore,
        adjustedWeightedAccuracy,
        oppositeDirectionRate,
        oppositeDirectionCount,
        avgWinSize: avgWin,
        avgLossSize: avgLoss,
      },
      bySource,
      byAssetType,
      bySignalType,
    };
  }

  // Catalyst Methods
  async getAllCatalysts(): Promise<Catalyst[]> {
    // 🎯 PERFORMANCE FIX: Only return upcoming catalysts (next 14 days)
    // Was sending 5700 catalysts (1.78MB) to frontend, causing browser freeze
    const now = new Date();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const allCatalysts = await db.select().from(catalystsTable).orderBy(catalystsTable.timestamp);
    
    // Filter to only upcoming events (today to 14 days out)
    const upcomingCatalysts = allCatalysts.filter(catalyst => {
      const eventDate = new Date(catalyst.timestamp);
      return eventDate >= now && eventDate <= fourteenDaysFromNow;
    });
    
    console.log(`📰 Catalyst Feed: Showing ${upcomingCatalysts.length} upcoming events (next 14 days) out of ${allCatalysts.length} total`);
    return upcomingCatalysts;
  }

  async getCatalystsBySymbol(symbol: string): Promise<Catalyst[]> {
    return await db.select().from(catalystsTable)
      .where(eq(catalystsTable.symbol, symbol))
      .orderBy(desc(catalystsTable.timestamp));
  }

  async createCatalyst(catalyst: InsertCatalyst): Promise<Catalyst> {
    const [created] = await db.insert(catalystsTable).values(catalyst).returning();
    return created;
  }

  // Watchlist Methods
  async getAllWatchlist(): Promise<WatchlistItem[]> {
    return await db.select().from(watchlistTable).orderBy(desc(watchlistTable.addedAt));
  }

  async getWatchlistItem(id: string): Promise<WatchlistItem | undefined> {
    const [item] = await db.select().from(watchlistTable).where(eq(watchlistTable.id, id));
    return item || undefined;
  }

  async getWatchlistByUser(userId: string): Promise<WatchlistItem[]> {
    return await db.select().from(watchlistTable)
      .where(eq(watchlistTable.userId, userId))
      .orderBy(desc(watchlistTable.addedAt));
  }

  async addToWatchlist(item: InsertWatchlist): Promise<WatchlistItem> {
    const [created] = await db.insert(watchlistTable).values(item).returning();
    return created;
  }

  async updateWatchlistItem(id: string, data: Partial<WatchlistItem>): Promise<WatchlistItem | undefined> {
    const [updated] = await db
      .update(watchlistTable)
      .set(data)
      .where(eq(watchlistTable.id, id))
      .returning();
    return updated || undefined;
  }

  async removeFromWatchlist(id: string): Promise<boolean> {
    const result = await db.delete(watchlistTable).where(eq(watchlistTable.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Options Data Methods
  async getOptionsBySymbol(symbol: string): Promise<OptionsData[]> {
    return await db.select().from(optionsDataTable).where(eq(optionsDataTable.symbol, symbol));
  }

  async createOptionsData(data: InsertOptionsData): Promise<OptionsData> {
    const [created] = await db.insert(optionsDataTable).values(data).returning();
    return created;
  }

  // User Preferences Methods
  async getUserPreferences(): Promise<UserPreferences | undefined> {
    const [prefs] = await db.select().from(userPreferencesTable);
    return prefs || undefined;
  }

  async updateUserPreferences(prefs: Partial<InsertUserPreferences>): Promise<UserPreferences> {
    const existing = await this.getUserPreferences();
    
    if (!existing) {
      // Create default values, then override with provided prefs (excluding undefined userId)
      const { userId: _userId, ...prefsWithoutUserId } = prefs;
      const [created] = await db.insert(userPreferencesTable).values({
        userId: "default_user", // Always set userId for new records
        accountSize: 10000,
        maxRiskPerTrade: 1,
        defaultCapitalPerIdea: 1000,
        defaultOptionsBudget: 250,
        preferredAssets: ["stock", "option", "crypto"],
        holdingHorizon: "intraday",
        theme: "dark",
        timezone: "America/Chicago",
        defaultViewMode: "card",
        compactMode: false,
        discordWebhookUrl: null,
        enableTradeAlerts: true,
        enablePriceAlerts: true,
        enablePerformanceAlerts: false,
        enableWeeklyReport: false,
        defaultAssetFilter: "all",
        defaultConfidenceFilter: "all",
        autoRefreshEnabled: true,
        ...prefsWithoutUserId, // Spread after defaults, but without userId
      }).returning();
      return created;
    } else {
      const [updated] = await db.update(userPreferencesTable)
        .set(prefs)
        .where(eq(userPreferencesTable.id, existing.id))
        .returning();
      return updated;
    }
  }

  // Chat History Methods (in-memory for now - not in schema)
  async getChatHistory(): Promise<ChatMessage[]> {
    return Array.from(this.chatHistory.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async addChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const chatMessage: ChatMessage = { ...message, id, timestamp };
    this.chatHistory.set(id, chatMessage);
    return chatMessage;
  }

  async clearChatHistory(): Promise<void> {
    this.chatHistory.clear();
  }

  // Futures Contracts Methods
  async getFuturesContract(contractCode: string): Promise<FuturesContract | null> {
    const [contract] = await db.select()
      .from(futuresContracts)
      .where(eq(futuresContracts.contractCode, contractCode));
    return contract || null;
  }

  async getFuturesContractsByRoot(rootSymbol: string): Promise<FuturesContract[]> {
    return await db.select()
      .from(futuresContracts)
      .where(eq(futuresContracts.rootSymbol, rootSymbol));
  }

  async getActiveFuturesContract(rootSymbol: string): Promise<FuturesContract | null> {
    const [contract] = await db.select()
      .from(futuresContracts)
      .where(
        and(
          eq(futuresContracts.rootSymbol, rootSymbol),
          eq(futuresContracts.isFrontMonth, true)
        )
      );
    return contract || null;
  }

  async updateFuturesContract(contractCode: string, updates: Partial<FuturesContract>): Promise<FuturesContract> {
    const [updated] = await db.update(futuresContracts)
      .set(updates)
      .where(eq(futuresContracts.contractCode, contractCode))
      .returning();
    
    if (!updated) {
      throw new Error(`Futures contract not found: ${contractCode}`);
    }
    
    return updated;
  }

  // 🔐 Model Cards Methods (Governance & Auditability)
  async getAllModelCards(): Promise<ModelCard[]> {
    return await db.select().from(modelCardsTable).orderBy(desc(modelCardsTable.createdAt));
  }

  async getModelCardByVersion(engineVersion: string): Promise<ModelCard | undefined> {
    const [card] = await db.select().from(modelCardsTable).where(eq(modelCardsTable.engineVersion, engineVersion));
    return card || undefined;
  }

  async createModelCard(card: InsertModelCard): Promise<ModelCard> {
    const [created] = await db.insert(modelCardsTable).values(card).returning();
    return created;
  }

  async updateModelCard(engineVersion: string, updates: Partial<ModelCard>): Promise<ModelCard | undefined> {
    const [updated] = await db.update(modelCardsTable)
      .set(updates)
      .where(eq(modelCardsTable.engineVersion, engineVersion))
      .returning();
    return updated || undefined;
  }

  async getActiveModelCard(): Promise<ModelCard | undefined> {
    const [card] = await db.select().from(modelCardsTable)
      .where(eq(modelCardsTable.status, 'active'))
      .orderBy(desc(modelCardsTable.createdAt))
      .limit(1);
    return card || undefined;
  }
}

export const storage = new DatabaseStorage();
