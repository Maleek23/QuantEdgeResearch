import { randomUUID } from "crypto";
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
} from "@shared/schema";

export interface IStorage {
  // Market Data
  getAllMarketData(): Promise<MarketData[]>;
  getMarketDataBySymbol(symbol: string): Promise<MarketData | undefined>;
  createMarketData(data: InsertMarketData): Promise<MarketData>;
  updateMarketData(id: string, data: Partial<InsertMarketData>): Promise<MarketData | undefined>;

  // Trade Ideas
  getAllTradeIdeas(): Promise<TradeIdea[]>;
  getTradeIdeaById(id: string): Promise<TradeIdea | undefined>;
  createTradeIdea(idea: InsertTradeIdea): Promise<TradeIdea>;
  deleteTradeIdea(id: string): Promise<boolean>;

  // Catalysts
  getAllCatalysts(): Promise<Catalyst[]>;
  getCatalystsBySymbol(symbol: string): Promise<Catalyst[]>;
  createCatalyst(catalyst: InsertCatalyst): Promise<Catalyst>;

  // Watchlist
  getAllWatchlist(): Promise<WatchlistItem[]>;
  getWatchlistItem(id: string): Promise<WatchlistItem | undefined>;
  addToWatchlist(item: InsertWatchlist): Promise<WatchlistItem>;
  removeFromWatchlist(id: string): Promise<boolean>;

  // Options Data
  getOptionsBySymbol(symbol: string): Promise<OptionsData[]>;
  createOptionsData(data: InsertOptionsData): Promise<OptionsData>;

  // User Preferences
  getUserPreferences(): Promise<UserPreferences | undefined>;
  updateUserPreferences(prefs: Partial<InsertUserPreferences>): Promise<UserPreferences>;
}

export class MemStorage implements IStorage {
  private marketData: Map<string, MarketData>;
  private tradeIdeas: Map<string, TradeIdea>;
  private catalysts: Map<string, Catalyst>;
  private watchlist: Map<string, WatchlistItem>;
  private optionsData: Map<string, OptionsData>;
  private userPreferences: UserPreferences | null;

  constructor() {
    this.marketData = new Map();
    this.tradeIdeas = new Map();
    this.catalysts = new Map();
    this.watchlist = new Map();
    this.optionsData = new Map();
    this.userPreferences = null;
    this.seedData();
  }

  private seedData() {
    // Seed some initial market data
    const now = new Date().toISOString();
    
    const seedMarketData: InsertMarketData[] = [
      {
        symbol: "AAPL",
        assetType: "stock",
        currentPrice: 178.45,
        changePercent: 2.34,
        volume: 52340000,
        marketCap: 2800000000000,
        session: "rth",
        timestamp: now,
        high24h: 179.20,
        low24h: 175.80,
        avgVolume: 48000000,
      },
      {
        symbol: "TSLA",
        assetType: "stock",
        currentPrice: 242.18,
        changePercent: -1.45,
        volume: 98500000,
        marketCap: 770000000000,
        session: "rth",
        timestamp: now,
        high24h: 248.90,
        low24h: 240.15,
        avgVolume: 85000000,
      },
      {
        symbol: "NVDA",
        assetType: "stock",
        currentPrice: 489.32,
        changePercent: 4.67,
        volume: 42100000,
        marketCap: 1200000000000,
        session: "rth",
        timestamp: now,
        high24h: 492.50,
        low24h: 468.20,
        avgVolume: 38000000,
      },
      {
        symbol: "SPY",
        assetType: "option",
        currentPrice: 442.15,
        changePercent: 0.78,
        volume: 78900000,
        session: "rth",
        timestamp: now,
        high24h: 443.20,
        low24h: 440.50,
        avgVolume: 72000000,
      },
      {
        symbol: "BTC",
        assetType: "crypto",
        currentPrice: 43250.00,
        changePercent: 3.21,
        volume: 28500000000,
        marketCap: 845000000000,
        session: "rth",
        timestamp: now,
        high24h: 44100.00,
        low24h: 41800.00,
        avgVolume: 25000000000,
      },
      {
        symbol: "ETH",
        assetType: "crypto",
        currentPrice: 2285.50,
        changePercent: 2.89,
        volume: 15200000000,
        marketCap: 275000000000,
        session: "rth",
        timestamp: now,
        high24h: 2320.00,
        low24h: 2215.00,
        avgVolume: 14000000000,
      },
      {
        symbol: "XRP",
        assetType: "crypto",
        currentPrice: 0.5842,
        changePercent: 5.67,
        volume: 1850000000,
        marketCap: 32000000000,
        session: "rth",
        timestamp: now,
        high24h: 0.5920,
        low24h: 0.5510,
        avgVolume: 1600000000,
      },
      {
        symbol: "SNDL",
        assetType: "stock",
        currentPrice: 2.45,
        changePercent: 12.44,
        volume: 145000000,
        marketCap: 580000000,
        session: "rth",
        timestamp: now,
        high24h: 2.68,
        low24h: 2.15,
        avgVolume: 62000000,
      },
    ];

    seedMarketData.forEach((data) => {
      const id = randomUUID();
      this.marketData.set(id, { ...data, id } as MarketData);
    });

    // Seed trade ideas
    const seedTradeIdeas: InsertTradeIdea[] = [
      {
        symbol: "NVDA",
        assetType: "stock",
        direction: "long",
        entryPrice: 485.00,
        targetPrice: 520.00,
        stopLoss: 475.00,
        riskRewardRatio: 3.5,
        catalyst: "Strong AI chip demand, Q4 earnings beat expected",
        analysis: "NVDA showing bullish momentum with consolidation above $480 support. AI sector tailwinds remain strong with data center demand exceeding supply. Technical setup shows higher lows formation with RSI at 58, indicating room for upside. Volume profile suggests accumulation. Target based on measured move from recent breakout pattern.",
        liquidityWarning: false,
        sessionContext: "Regular Trading Hours",
        timestamp: now,
      },
      {
        symbol: "SPY",
        assetType: "option",
        direction: "long",
        entryPrice: 4.50,
        targetPrice: 7.00,
        stopLoss: 3.20,
        riskRewardRatio: 1.92,
        catalyst: "Fed dovish comments, VIX compression",
        analysis: "SPY 450 calls expiring in 2 weeks showing unusual volume spike (3x normal). Implied volatility at 18% with IV rank at 25th percentile suggests options are relatively cheap. Market structure bullish with support holding at 440. Breakout above 445 could trigger gamma squeeze to 450+.",
        liquidityWarning: false,
        sessionContext: "Regular Trading Hours",
        timestamp: now,
        expiryDate: "Oct 27, 2025",
      },
      {
        symbol: "SNDL",
        assetType: "stock",
        direction: "long",
        entryPrice: 2.40,
        targetPrice: 3.20,
        stopLoss: 2.15,
        riskRewardRatio: 3.2,
        catalyst: "Cannabis legislation news, unusual volume",
        analysis: "Penny stock with 2.3x average volume indicating institutional interest. Breaking above $2.35 resistance on heavy volume. CAUTION: Low float stock with high volatility - use tight stops. News catalyst from state cannabis bill could drive momentum. Limit position size to 2-3% of portfolio maximum.",
        liquidityWarning: true,
        sessionContext: "Regular Trading Hours",
        timestamp: now,
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
        assetType: "stock",
        targetPrice: 500.00,
        notes: "Breakout above 495 with strong volume",
        addedAt: now,
      },
      {
        symbol: "BTC",
        assetType: "crypto",
        targetPrice: 45000,
        notes: "Watching for break above 44k resistance",
        addedAt: now,
      },
      {
        symbol: "AAPL",
        assetType: "stock",
        targetPrice: 185.00,
        notes: "Earnings beat - targeting 185",
        addedAt: now,
      },
    ];

    seedWatchlist.forEach((item) => {
      const id = randomUUID();
      this.watchlist.set(id, { ...item, id });
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

  async updateMarketData(id: string, data: Partial<InsertMarketData>): Promise<MarketData | undefined> {
    const existing = this.marketData.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data } as MarketData;
    this.marketData.set(id, updated);
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
    const tradeIdea: TradeIdea = { ...idea, id } as TradeIdea;
    this.tradeIdeas.set(id, tradeIdea);
    return tradeIdea;
  }

  async deleteTradeIdea(id: string): Promise<boolean> {
    return this.tradeIdeas.delete(id);
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

  async addToWatchlist(item: InsertWatchlist): Promise<WatchlistItem> {
    const id = randomUUID();
    const watchlistItem: WatchlistItem = { ...item, id } as WatchlistItem;
    this.watchlist.set(id, watchlistItem);
    return watchlistItem;
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
        accountSize: 10000,
        maxRiskPerTrade: 1,
        defaultCapitalPerIdea: 1000,
        defaultOptionsBudget: 250,
        preferredAssets: ["stock", "option", "crypto"],
        holdingHorizon: "intraday",
        ...prefs,
      };
    } else {
      this.userPreferences = { ...this.userPreferences, ...prefs };
    }
    return this.userPreferences;
  }
}

export const storage = new MemStorage();
