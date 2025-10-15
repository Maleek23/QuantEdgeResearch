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
  updateMarketData(symbol: string, data: Partial<InsertMarketData>): Promise<MarketData | undefined>;

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
        currentPrice: 225.40,
        changePercent: 1.82,
        volume: 48230000,
        marketCap: 3500000000000,
        session: "rth",
        timestamp: now,
        high24h: 227.15,
        low24h: 223.80,
        avgVolume: 52000000,
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
        avgVolume: 88000000,
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
        avgVolume: 42000000,
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
        avgVolume: 78000000,
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
        avgVolume: 28000000000,
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
        avgVolume: 16500000000,
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
        avgVolume: 2100000000,
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
        avgVolume: 85000000,
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
        entryPrice: 138.50,
        targetPrice: 148.00,
        stopLoss: 135.00,
        riskRewardRatio: 2.71,
        catalyst: "Strong AI chip demand, Q4 earnings beat expected",
        analysis: "NVDA showing bullish momentum with consolidation above $135 support. AI sector tailwinds remain strong with data center demand exceeding supply. Technical setup shows higher lows formation with RSI at 58, indicating room for upside. Volume profile suggests accumulation. Target based on measured move from recent breakout pattern. Potential gain: +6.9% | Risk: -2.5%",
        liquidityWarning: false,
        sessionContext: "Regular Trading Hours",
        timestamp: now,
      },
      {
        symbol: "SPY",
        assetType: "option",
        direction: "long",
        entryPrice: 5.80,
        targetPrice: 9.50,
        stopLoss: 4.20,
        riskRewardRatio: 2.31,
        catalyst: "Fed dovish comments, VIX compression",
        analysis: "SPY 580 calls expiring in 2 weeks showing unusual volume spike (3x normal). Implied volatility at 16% with IV rank at 28th percentile suggests options are relatively cheap. Market structure bullish with support holding at 570. Breakout above 578 could trigger gamma squeeze to 585+. Potential gain: +63.8% | Risk: -27.6%",
        liquidityWarning: false,
        sessionContext: "Regular Trading Hours",
        timestamp: now,
        expiryDate: "Oct 27, 2025",
      },
      {
        symbol: "SNDL",
        assetType: "stock",
        direction: "long",
        entryPrice: 1.85,
        targetPrice: 2.45,
        stopLoss: 1.68,
        riskRewardRatio: 3.53,
        catalyst: "Cannabis legislation news, unusual volume",
        analysis: "Penny stock with 2.5x average volume indicating institutional interest. Breaking above $1.80 resistance on heavy volume. CAUTION: Low float stock with high volatility - use tight stops. News catalyst from state cannabis bill could drive momentum. Limit position size to 2-3% of portfolio maximum. Potential gain: +32.4% | Risk: -9.2%",
        liquidityWarning: true,
        sessionContext: "Regular Trading Hours",
        timestamp: now,
      },
      {
        symbol: "XRP",
        assetType: "crypto",
        direction: "long",
        entryPrice: 2.35,
        targetPrice: 2.75,
        stopLoss: 2.20,
        riskRewardRatio: 2.67,
        catalyst: "SEC lawsuit resolution optimism, institutional adoption",
        analysis: "XRP breaking out of multi-month consolidation pattern near $2.30 support level. Recent favorable court developments and increasing institutional adoption signals. RSI at 62 showing bullish momentum. Target represents previous resistance zone. 24h volume significantly above average. Potential gain: +17.0% | Risk: -6.4%",
        liquidityWarning: false,
        sessionContext: "24/7 Trading",
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
