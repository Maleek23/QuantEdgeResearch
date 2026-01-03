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
  FuturesResearchBrief,
  InsertFuturesResearchBrief,
  DailyUsage,
  InsertDailyUsage,
  ActiveTrade,
  InsertActiveTrade,
  ActiveTradeStatus,
  SubscriptionTier,
  AssetType,
  PaperPortfolio,
  InsertPaperPortfolio,
  PaperPosition,
  InsertPaperPosition,
  PaperEquitySnapshot,
  InsertPaperEquitySnapshot,
  PaperTradeStatus,
  InsertCTSource,
  CTSource,
  InsertCTMention,
  CTMention,
  InsertCTCallPerformance,
  CTCallPerformance,
  TrackedWallet,
  InsertTrackedWallet,
  WalletHolding,
  InsertWalletHolding,
  WalletTransaction,
  InsertWalletTransaction,
  WalletAlert,
  InsertWalletAlert,
  InsertTradeInputSnapshot,
  TradeInputSnapshot,
  InsertEngineDailyMetrics,
  EngineDailyMetrics,
  InsertEngineHealthAlert,
  EngineHealthAlert,
  EngineSource,
  InsertTradePriceSnapshot,
  TradePriceSnapshot,
  BlogPost,
  InsertBlogPost,
  BlogPostStatus,
  AutoLottoPreferences,
  InsertAutoLottoPreferences,
  PlatformReport,
  InsertPlatformReport,
  ReportPeriod,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, gte, lte, desc, isNull, sql as drizzleSql } from "drizzle-orm";
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
  dailyUsage as dailyUsageTable,
  activeTrades as activeTradesTable,
  paperPortfolios as paperPortfoliosTable,
  paperPositions as paperPositionsTable,
  paperEquitySnapshots as paperEquitySnapshotsTable,
  ctSources,
  ctMentions,
  ctCallPerformance,
  trackedWallets,
  walletHoldings,
  walletTransactions,
  walletAlerts,
  tradeInputSnapshots,
  engineDailyMetrics,
  engineHealthAlerts,
  tradePriceSnapshots,
  blogPosts,
  lossAnalysis,
  InsertLossAnalysis,
  LossAnalysis,
  futuresResearchBriefs,
  autoLottoPreferences,
  platformReports,
} from "@shared/schema";

// ========================================
// 🔧 DATA INTEGRITY: Canonical Trade Filters
// ========================================
// Re-export canonical functions from shared/constants.ts
// This is the SINGLE SOURCE OF TRUTH - both frontend and backend use the same logic
export { 
  CANONICAL_LOSS_THRESHOLD, 
  isRealLoss, 
  isRealLossByResolution, 
  isCurrentGenEngine 
} from "@shared/constants";

// Import for use in this file
import { CANONICAL_LOSS_THRESHOLD, isRealLoss, isRealLossByResolution, isCurrentGenEngine } from "@shared/constants";

/**
 * Get canonical "decided" trades - wins + real losses only
 * Excludes expired, breakeven, and legacy engine versions
 */
export function getDecidedTrades(ideas: any[], options: { includeAllVersions?: boolean } = {}): any[] {
  let filtered = ideas;
  
  // Apply engine version filter unless explicitly disabled
  if (!options.includeAllVersions) {
    filtered = filtered.filter(isCurrentGenEngine);
  }
  
  // Filter to decided trades only (wins + real losses)
  return filtered.filter(idea => 
    idea.outcomeStatus === 'hit_target' || isRealLoss(idea)
  );
}

/**
 * Get canonical "decided" trades using resolutionReason
 * For auto-resolved trade endpoints
 */
export function getDecidedTradesByResolution(ideas: any[], options: { includeAllVersions?: boolean } = {}): any[] {
  let filtered = ideas;
  
  // Apply engine version filter unless explicitly disabled
  if (!options.includeAllVersions) {
    filtered = filtered.filter(isCurrentGenEngine);
  }
  
  // Filter to decided trades only (auto-resolved wins + real losses)
  return filtered.filter(idea => 
    idea.resolutionReason === 'auto_target_hit' || isRealLossByResolution(idea)
  );
}

/**
 * 🔧 CANONICAL PERFORMANCE FILTERS
 * Apply the same pre-filters used by /api/performance/stats to ensure
 * consistent trade counts across all performance analytics endpoints.
 * 
 * Filters applied:
 * 1. Exclude options (no proper pricing yet)
 * 2. Exclude flow/lotto sources (unvalidatable options)
 * 3. Optionally exclude buggy/test trades
 * 
 * Use this helper BEFORE calling getDecidedTrades or getDecidedTradesByResolution
 */
export interface CanonicalFilterOptions {
  includeOptions?: boolean;      // Include option trades (default: false)
  includeFlowLotto?: boolean;    // Include flow/lotto sources (default: false)
  includeBuggyTrades?: boolean;  // Include trades with excludeFromTraining=true (default: false)
}

export function applyCanonicalPerformanceFilters(
  ideas: any[], 
  options: CanonicalFilterOptions = {}
): any[] {
  let filtered = ideas;
  
  // Step 1: Exclude buggy/test trades (excludeFromTraining=true)
  if (!options.includeBuggyTrades) {
    filtered = filtered.filter(idea => !idea.excludeFromTraining);
  }
  
  // Step 2: Exclude options (no proper pricing yet)
  // EXCEPTION: When includeFlowLotto is true, keep flow/lotto options (they ARE options)
  if (!options.includeOptions) {
    filtered = filtered.filter(idea => {
      // Keep non-options
      if (idea.assetType !== 'option') return true;
      // If includeFlowLotto is set, keep flow/lotto options
      if (options.includeFlowLotto && (idea.source === 'flow' || idea.source === 'lotto')) return true;
      // Otherwise exclude options
      return false;
    });
  }
  
  // Step 3: Exclude flow/lotto sources (unvalidatable options)
  if (!options.includeFlowLotto) {
    filtered = filtered.filter(idea => idea.source !== 'flow' && idea.source !== 'lotto');
  }
  
  return filtered;
}

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
  getUserByEmail(email: string): Promise<User | undefined>;
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
  updateTradeIdeaPerformance(id: string, performance: Partial<Pick<TradeIdea, 'outcomeStatus' | 'exitPrice' | 'exitDate' | 'resolutionReason' | 'actualHoldingTimeMinutes' | 'percentGain' | 'realizedPnL' | 'validatedAt' | 'outcomeNotes' | 'predictionAccurate' | 'predictionValidatedAt' | 'highestPriceReached' | 'lowestPriceReached' | 'missedEntryTheoreticalOutcome' | 'missedEntryTheoreticalGain'>>): Promise<TradeIdea | undefined>;
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
  getWatchlistByCategory(category: string): Promise<WatchlistItem[]>;
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

  // Futures Research Briefs
  getAllFuturesResearchBriefs(): Promise<FuturesResearchBrief[]>;
  getActiveFuturesResearchBriefs(): Promise<FuturesResearchBrief[]>;
  getFuturesResearchBriefBySymbol(symbol: string): Promise<FuturesResearchBrief | null>;
  createFuturesResearchBrief(brief: InsertFuturesResearchBrief): Promise<FuturesResearchBrief>;
  updateFuturesResearchBrief(id: string, updates: Partial<FuturesResearchBrief>): Promise<FuturesResearchBrief | null>;
  deactivateFuturesResearchBrief(id: string): Promise<boolean>;
  deactivateOldFuturesResearchBriefs(symbol: string): Promise<void>;

  // Chat Messages
  getChatHistory(): Promise<ChatMessage[]>;
  addChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage>;
  clearChatHistory(): Promise<void>;
  
  // Daily Usage Tracking
  getDailyUsage(userId: string, date: string): Promise<DailyUsage | null>;
  incrementDailyUsage(userId: string, field: 'ideasViewed' | 'aiChatMessages' | 'chartAnalyses'): Promise<DailyUsage>;
  
  // User-filtered Trade Ideas
  getTradeIdeasByUser(userId: string): Promise<TradeIdea[]>;
  getTradeIdeasForUser(userId: string): Promise<TradeIdea[]>; // System ideas + user's own
  
  // Active Trades (Live Position Tracking)
  getActiveTrades(userId: string): Promise<ActiveTrade[]>;
  getActiveTradeById(id: string): Promise<ActiveTrade | undefined>;
  createActiveTrade(trade: InsertActiveTrade): Promise<ActiveTrade>;
  updateActiveTrade(id: string, updates: Partial<ActiveTrade>): Promise<ActiveTrade | undefined>;
  closeActiveTrade(id: string, exitPrice: number): Promise<ActiveTrade | undefined>;
  deleteActiveTrade(id: string): Promise<boolean>;

  // Paper Trading - Portfolios
  createPaperPortfolio(portfolio: InsertPaperPortfolio): Promise<PaperPortfolio>;
  getPaperPortfoliosByUser(userId: string): Promise<PaperPortfolio[]>;
  getAllPaperPortfolios(): Promise<PaperPortfolio[]>;
  getPaperPortfolioById(id: string): Promise<PaperPortfolio | undefined>;
  updatePaperPortfolio(id: string, updates: Partial<PaperPortfolio>): Promise<PaperPortfolio | undefined>;
  deletePaperPortfolio(id: string): Promise<boolean>;

  // Paper Trading - Positions
  createPaperPosition(position: InsertPaperPosition): Promise<PaperPosition>;
  getPaperPositionsByPortfolio(portfolioId: string): Promise<PaperPosition[]>;
  getPaperPositionById(id: string): Promise<PaperPosition | undefined>;
  updatePaperPosition(id: string, updates: Partial<PaperPosition>): Promise<PaperPosition | undefined>;
  closePaperPosition(id: string, exitPrice: number, exitReason: string): Promise<PaperPosition | undefined>;

  // Paper Trading - Equity Snapshots
  createPaperEquitySnapshot(snapshot: InsertPaperEquitySnapshot): Promise<PaperEquitySnapshot>;
  getPaperEquitySnapshots(portfolioId: string, startDate?: string, endDate?: string): Promise<PaperEquitySnapshot[]>;
  
  // Paper Trading - Compliance
  getCompletedPaperTradesCount(userId: string): Promise<number>;

  // CT Ingestion
  createCTSource(source: InsertCTSource): Promise<CTSource>;
  getCTSources(): Promise<CTSource[]>;
  getCTSourceById(id: string): Promise<CTSource | undefined>;
  updateCTSource(id: string, updates: Partial<CTSource>): Promise<CTSource>;
  deleteCTSource(id: string): Promise<boolean>;
  createCTMention(mention: InsertCTMention): Promise<CTMention>;
  getCTMentions(hours?: number): Promise<CTMention[]>;
  getCTMentionsByTicker(ticker: string, hours?: number): Promise<CTMention[]>;
  getCTMentionsBySentiment(sentiment: string, hours?: number): Promise<CTMention[]>;
  getCTCallPerformance(mentionId: number): Promise<CTCallPerformance | undefined>;
  getCTCallPerformanceStats(): Promise<{ totalCalls: number; wins: number; losses: number; winRate: number }>;
  updateCTCallPerformance(mentionId: number, updates: Partial<CTCallPerformance>): Promise<CTCallPerformance>;

  // Wallet Tracker
  getTrackedWallets(userId: string): Promise<TrackedWallet[]>;
  getTrackedWalletById(id: string): Promise<TrackedWallet | undefined>;
  createTrackedWallet(wallet: InsertTrackedWallet): Promise<TrackedWallet>;
  deleteTrackedWallet(id: string): Promise<boolean>;
  updateTrackedWallet(id: string, updates: Partial<TrackedWallet>): Promise<TrackedWallet | undefined>;
  
  getWalletHoldings(walletId: string): Promise<WalletHolding[]>;
  createWalletHolding(holding: InsertWalletHolding): Promise<WalletHolding>;
  updateWalletHolding(id: string, updates: Partial<WalletHolding>): Promise<WalletHolding | undefined>;
  deleteWalletHoldings(walletId: string): Promise<boolean>;
  
  getWalletTransactions(walletId: string, limit?: number): Promise<WalletTransaction[]>;
  getWhaleActivity(userId: string, limit?: number): Promise<WalletTransaction[]>;
  createWalletTransaction(tx: InsertWalletTransaction): Promise<WalletTransaction>;
  
  getWalletAlerts(userId: string): Promise<WalletAlert[]>;
  getWalletAlertById(id: string): Promise<WalletAlert | undefined>;
  createWalletAlert(alert: InsertWalletAlert): Promise<WalletAlert>;
  deleteWalletAlert(id: string): Promise<boolean>;

  // Telemetry - Trade Input Snapshots
  saveTradeInputSnapshot(snapshot: InsertTradeInputSnapshot): Promise<TradeInputSnapshot>;
  getTradeInputSnapshot(tradeIdeaId: string): Promise<TradeInputSnapshot | null>;

  // Telemetry - Engine Daily Metrics
  saveEngineDailyMetrics(metrics: InsertEngineDailyMetrics): Promise<EngineDailyMetrics>;
  getEngineDailyMetrics(date: string, engine?: EngineSource): Promise<EngineDailyMetrics[]>;
  getEngineMetricsRange(startDate: string, endDate: string, engine?: EngineSource): Promise<EngineDailyMetrics[]>;

  // Telemetry - Engine Health Alerts
  saveEngineHealthAlert(alert: InsertEngineHealthAlert): Promise<EngineHealthAlert>;
  getActiveHealthAlerts(): Promise<EngineHealthAlert[]>;
  acknowledgeHealthAlert(id: string, userId: string): Promise<void>;

  // Trade Audit Trail - Price Snapshots
  savePriceSnapshot(snapshot: InsertTradePriceSnapshot): Promise<TradePriceSnapshot>;
  getPriceSnapshots(tradeIdeaId: string): Promise<TradePriceSnapshot[]>;
  getTradeAuditTrail(tradeIdeaId: string): Promise<{
    tradeIdea: TradeIdea | null;
    priceSnapshots: TradePriceSnapshot[];
  }>;

  // Blog Posts CMS
  getBlogPosts(status?: BlogPostStatus): Promise<BlogPost[]>;
  getBlogPostBySlug(slug: string): Promise<BlogPost | null>;
  createBlogPost(post: InsertBlogPost): Promise<BlogPost>;
  updateBlogPost(id: string, post: Partial<InsertBlogPost>): Promise<BlogPost | null>;
  deleteBlogPost(id: string): Promise<boolean>;

  // Loss Analysis - Post-Mortem for Failed Trades
  createLossAnalysis(analysis: InsertLossAnalysis): Promise<LossAnalysis>;
  getLossAnalysisByTradeId(tradeIdeaId: string): Promise<LossAnalysis | null>;
  getAllLossAnalyses(): Promise<LossAnalysis[]>;
  getLossPatterns(): Promise<{ pattern: string; count: number; avgLoss: number }[]>;

  // Auto Lotto Preferences
  getAutoLottoPreferences(userId: string): Promise<AutoLottoPreferences | null>;
  upsertAutoLottoPreferences(prefs: InsertAutoLottoPreferences): Promise<AutoLottoPreferences>;
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
  private ctSources: Map<number, CTSource>;
  private ctMentions: Map<number, CTMention>;
  private ctCallPerformance: Map<number, CTCallPerformance>;
  private blogPosts: Map<string, BlogPost>;

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
    this.ctSources = new Map();
    this.ctMentions = new Map();
    this.ctCallPerformance = new Map();
    this.blogPosts = new Map();
    this.seedData();
  }

  private seedBlogPosts() {
    const posts: BlogPost[] = [
      {
        id: "1",
        slug: "how-ai-is-revolutionizing-day-trading",
        title: "How AI is Revolutionizing Day Trading",
        excerpt: "Explore how artificial intelligence is transforming the way traders analyze markets, identify opportunities, and manage risk in real-time.",
        content: "Full content here...",
        heroImageUrl: null,
        category: "AI Trading",
        tags: ["AI", "Trading", "Tech"],
        authorName: "QuantEdge Team",
        status: "published",
        publishedAt: new Date("2025-01-15"),
      },
      {
        id: "2",
        slug: "the-power-of-quantitative-trading-strategies",
        title: "The Power of Quantitative Trading Strategies",
        excerpt: "Dive deep into proven quantitative strategies like RSI(2) mean reversion and VWAP institutional flow that consistently outperform the market.",
        content: "Full content here...",
        heroImageUrl: null,
        category: "Quantitative Analysis",
        tags: ["Quant", "Strategies"],
        authorName: "QuantEdge Team",
        status: "published",
        publishedAt: new Date("2025-01-10"),
      },
      {
        id: "3",
        slug: "understanding-risk-reward-ratios",
        title: "Understanding Risk-Reward Ratios",
        excerpt: "Master the fundamentals of risk management with a comprehensive guide to calculating and optimizing your risk-reward ratios.",
        content: "Full content here...",
        heroImageUrl: null,
        category: "Risk Management",
        tags: ["Risk", "Basics"],
        authorName: "QuantEdge Team",
        status: "published",
        publishedAt: new Date("2025-01-05"),
      },
      {
        id: "4",
        slug: "market-timing-finding-the-perfect-entry",
        title: "Market Timing: Finding the Perfect Entry",
        excerpt: "Learn how time-of-day analysis and market session patterns can significantly improve your entry timing and overall win rate.",
        content: "Full content here...",
        heroImageUrl: null,
        category: "Trading Psychology",
        tags: ["Timing", "Market"],
        authorName: "QuantEdge Team",
        status: "published",
        publishedAt: new Date("2024-12-28"),
      },
      {
        id: "5",
        slug: "dual-engine-trading-combining-ai-and-quant-signals",
        title: "Dual-Engine Trading: Combining AI and Quant Signals",
        excerpt: "Discover how combining AI contextual analysis with quantitative signals creates high-conviction trading opportunities.",
        content: "Full content here...",
        heroImageUrl: null,
        category: "Platform Features",
        tags: ["AI", "Quant", "Features"],
        authorName: "QuantEdge Team",
        status: "published",
        publishedAt: new Date("2024-12-20"),
      },
      {
        id: "6",
        slug: "options-trading-101",
        title: "Options Trading 101: Calls, Puts, and Delta",
        excerpt: "A beginner-friendly introduction to options trading, covering the basics of calls, puts, and how to interpret delta values.",
        content: "Full content here...",
        heroImageUrl: null,
        category: "Options Trading",
        tags: ["Options", "Beginner"],
        authorName: "QuantEdge Team",
        status: "published",
        publishedAt: new Date("2024-12-15"),
      }
    ];

    posts.forEach(post => this.blogPosts.set(post.id, post));
  }

  private seedData() {
    this.seedBlogPosts();
    this.seedMarketAndTradeData();
  }

  async getBlogPosts(status?: BlogPostStatus): Promise<BlogPost[]> {
    return Array.from(this.blogPosts.values())
      .filter(post => !status || post.status === status)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
    return Array.from(this.blogPosts.values()).find(post => post.slug === slug) || null;
  }

  async createBlogPost(post: InsertBlogPost): Promise<BlogPost> {
    const id = randomUUID();
    const newPost: BlogPost = {
      ...post,
      id,
      publishedAt: new Date(),
    };
    this.blogPosts.set(id, newPost);
    return newPost;
  }

  async updateBlogPost(id: string, post: Partial<InsertBlogPost>): Promise<BlogPost | null> {
    const existing = this.blogPosts.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...post };
    this.blogPosts.set(id, updated);
    return updated;
  }

  async deleteBlogPost(id: string): Promise<boolean> {
    return this.blogPosts.delete(id);
  }

  private seedMarketAndTradeData() {
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
      this.catalysts.set(id, { ...catalyst, id, sourceUrl: catalyst.sourceUrl ?? null } as Catalyst);
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
    };
  }

  // User Management Methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return undefined;
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
      email: userData.email ?? `user_${id}@quantedge.local`, // Email required in schema
      passwordHash: userData.passwordHash || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      profileImageUrl: userData.profileImageUrl || null,
      subscriptionTier: (userData.subscriptionTier || 'free') as SubscriptionTier,
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
      
      // Base conditions - check ALL open ideas regardless of source
      // This prevents duplicate ideas like multiple DOGE trades from different generation runs
      let matches = (
        idea.symbol === symbol &&
        idea.direction === direction &&
        priceDiff <= priceThreshold &&
        ideaTime >= cutoffTime &&
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

  async updateTradeIdeaPerformance(id: string, performance: Partial<Pick<TradeIdea, 'outcomeStatus' | 'exitPrice' | 'exitDate' | 'resolutionReason' | 'actualHoldingTimeMinutes' | 'percentGain' | 'realizedPnL' | 'validatedAt' | 'outcomeNotes' | 'predictionAccurate' | 'predictionValidatedAt' | 'highestPriceReached' | 'lowestPriceReached' | 'missedEntryTheoreticalOutcome' | 'missedEntryTheoreticalGain'>>): Promise<TradeIdea | undefined> {
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
    startDate?: string;
    endDate?: string;
    source?: string;
    includeAllVersions?: boolean;
  }): Promise<PerformanceStats> {
    let allIdeas = Array.from(this.tradeIdeas.values());
    
    // Audit: Ensure only non-excluded trades are used for performance
    allIdeas = allIdeas.filter(idea => !idea.excludeFromTraining);
    
    // Audit: Date filtering logic (Audit for UTC vs Local time consistency)
    if (filters?.startDate || filters?.endDate) {
      allIdeas = allIdeas.filter(idea => {
        const ideaDateStr = idea.timestamp.split('T')[0];
        if (filters.startDate && ideaDateStr < filters.startDate) return false;
        if (filters.endDate && ideaDateStr > filters.endDate) return false;
        return true;
      });
    }

    const closedIdeas = allIdeas.filter((idea) => idea.outcomeStatus !== 'open');
    const wonIdeas = closedIdeas.filter((idea) => idea.outcomeStatus === 'hit_target');
    
    // Audit: Canonical Loss Threshold consistency
    const CANONICAL_LOSS_THRESHOLD = 3.0; 
    const lostIdeas = closedIdeas.filter((idea) => {
      if (idea.outcomeStatus !== 'hit_stop') return false;
      if (idea.percentGain !== null && idea.percentGain !== undefined) {
        return idea.percentGain <= -CANONICAL_LOSS_THRESHOLD;
      }
      return true;
    });
    
    const decidedIdeas = wonIdeas.length + lostIdeas.length;
    const winRate = decidedIdeas > 0 ? (wonIdeas.length / decidedIdeas) * 100 : 0;
    
    // Enhanced Audit: Average Profit vs Average Loss (Risk/Reward)
    const avgWin = wonIdeas.length > 0 ? wonIdeas.reduce((s, i) => s + (i.percentGain || 0), 0) / wonIdeas.length : 0;
    const avgLoss = lostIdeas.length > 0 ? lostIdeas.reduce((s, i) => s + (i.percentGain || 0), 0) / lostIdeas.length : 0;

    return {
      totalIdeas: allIdeas.length,
      wonIdeas: wonIdeas.length,
      lostIdeas: lostIdeas.length,
      winRate,
      avgPercentGain: closedIdeas.length > 0 ? closedIdeas.reduce((s, i) => s + (i.percentGain || 0), 0) / closedIdeas.length : 0,
      avgHoldingTime: 0, 
      bySource,
      byAssetType,
      bySignalType,
      quantAccuracy: 0,
      directionalAccuracy: 0,
      evScore: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0,
      adjustedWeightedAccuracy: 0,
      oppositeDirectionRate: 0
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
    const newCatalyst: Catalyst = { ...catalyst, id, sourceUrl: catalyst.sourceUrl ?? null };
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

  async getWatchlistByCategory(category: string): Promise<WatchlistItem[]> {
    return Array.from(this.watchlist.values()).filter(item => item.category === category);
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

  // Futures Research Briefs (stub - not persisted in MemStorage)
  async getAllFuturesResearchBriefs(): Promise<FuturesResearchBrief[]> {
    return [];
  }

  async getActiveFuturesResearchBriefs(): Promise<FuturesResearchBrief[]> {
    return [];
  }

  async getFuturesResearchBriefBySymbol(_symbol: string): Promise<FuturesResearchBrief | null> {
    return null;
  }

  async createFuturesResearchBrief(_brief: InsertFuturesResearchBrief): Promise<FuturesResearchBrief> {
    throw new Error("Futures Research Briefs not supported in MemStorage");
  }

  async updateFuturesResearchBrief(_id: string, _updates: Partial<FuturesResearchBrief>): Promise<FuturesResearchBrief | null> {
    return null;
  }

  async deactivateFuturesResearchBrief(_id: string): Promise<boolean> {
    return false;
  }

  async deactivateOldFuturesResearchBriefs(_symbol: string): Promise<void> {
    // No-op in MemStorage
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

  // Daily Usage Tracking (stub - not persisted in MemStorage)
  async getDailyUsage(_userId: string, _date: string): Promise<DailyUsage | null> {
    return null;
  }

  async incrementDailyUsage(_userId: string, _field: 'ideasViewed' | 'aiChatMessages' | 'chartAnalyses'): Promise<DailyUsage> {
    throw new Error("Daily Usage not supported in MemStorage");
  }

  // User-filtered Trade Ideas (stub)
  async getTradeIdeasByUser(_userId: string): Promise<TradeIdea[]> {
    return Array.from(this.tradeIdeas.values());
  }

  async getTradeIdeasForUser(_userId: string): Promise<TradeIdea[]> {
    // In MemStorage, return all ideas (no filtering)
    return Array.from(this.tradeIdeas.values());
  }

  // Active Trades (stub - not persisted in MemStorage)
  async getActiveTrades(_userId: string): Promise<ActiveTrade[]> {
    return [];
  }

  async getActiveTradeById(_id: string): Promise<ActiveTrade | undefined> {
    return undefined;
  }

  async createActiveTrade(_trade: InsertActiveTrade): Promise<ActiveTrade> {
    throw new Error("Active Trades not supported in MemStorage");
  }

  async updateActiveTrade(_id: string, _updates: Partial<ActiveTrade>): Promise<ActiveTrade | undefined> {
    return undefined;
  }

  async closeActiveTrade(_id: string, _exitPrice: number): Promise<ActiveTrade | undefined> {
    return undefined;
  }

  async deleteActiveTrade(_id: string): Promise<boolean> {
    return false;
  }

  // Paper Trading - Portfolios (stub - not persisted in MemStorage)
  async createPaperPortfolio(_portfolio: InsertPaperPortfolio): Promise<PaperPortfolio> {
    throw new Error("Paper Trading not supported in MemStorage");
  }

  async getPaperPortfoliosByUser(_userId: string): Promise<PaperPortfolio[]> {
    return [];
  }

  async getAllPaperPortfolios(): Promise<PaperPortfolio[]> {
    return [];
  }

  async getPaperPortfolioById(_id: string): Promise<PaperPortfolio | undefined> {
    return undefined;
  }

  async updatePaperPortfolio(_id: string, _updates: Partial<PaperPortfolio>): Promise<PaperPortfolio | undefined> {
    return undefined;
  }

  async deletePaperPortfolio(_id: string): Promise<boolean> {
    return false;
  }

  // Paper Trading - Positions (stub)
  async createPaperPosition(_position: InsertPaperPosition): Promise<PaperPosition> {
    throw new Error("Paper Trading not supported in MemStorage");
  }

  async getPaperPositionsByPortfolio(_portfolioId: string): Promise<PaperPosition[]> {
    return [];
  }

  async getPaperPositionById(_id: string): Promise<PaperPosition | undefined> {
    return undefined;
  }

  async updatePaperPosition(_id: string, _updates: Partial<PaperPosition>): Promise<PaperPosition | undefined> {
    return undefined;
  }

  async closePaperPosition(_id: string, _exitPrice: number, _exitReason: string): Promise<PaperPosition | undefined> {
    return undefined;
  }

  // Paper Trading - Equity Snapshots (stub)
  async createPaperEquitySnapshot(_snapshot: InsertPaperEquitySnapshot): Promise<PaperEquitySnapshot> {
    throw new Error("Paper Trading not supported in MemStorage");
  }

  async getPaperEquitySnapshots(_portfolioId: string, _startDate?: string, _endDate?: string): Promise<PaperEquitySnapshot[]> {
    return [];
  }
  
  // Paper Trading - Compliance (stub returns 0 for MemStorage)
  async getCompletedPaperTradesCount(_userId: string): Promise<number> {
    return 0;
  }

  // Telemetry - Trade Input Snapshots (stub)
  async saveTradeInputSnapshot(_snapshot: InsertTradeInputSnapshot): Promise<TradeInputSnapshot> {
    throw new Error("Telemetry not supported in MemStorage");
  }

  async getTradeInputSnapshot(_tradeIdeaId: string): Promise<TradeInputSnapshot | null> {
    throw new Error("Telemetry not supported in MemStorage");
  }

  // Telemetry - Engine Daily Metrics (stub)
  async saveEngineDailyMetrics(_metrics: InsertEngineDailyMetrics): Promise<EngineDailyMetrics> {
    throw new Error("Telemetry not supported in MemStorage");
  }

  async getEngineDailyMetrics(_date: string, _engine?: EngineSource): Promise<EngineDailyMetrics[]> {
    throw new Error("Telemetry not supported in MemStorage");
  }

  async getEngineMetricsRange(_startDate: string, _endDate: string, _engine?: EngineSource): Promise<EngineDailyMetrics[]> {
    throw new Error("Telemetry not supported in MemStorage");
  }

  // Telemetry - Engine Health Alerts (stub)
  async saveEngineHealthAlert(_alert: InsertEngineHealthAlert): Promise<EngineHealthAlert> {
    throw new Error("Telemetry not supported in MemStorage");
  }

  async getActiveHealthAlerts(): Promise<EngineHealthAlert[]> {
    throw new Error("Telemetry not supported in MemStorage");
  }

  async acknowledgeHealthAlert(_id: string, _userId: string): Promise<void> {
    throw new Error("Telemetry not supported in MemStorage");
  }

  async savePriceSnapshot(_snapshot: InsertTradePriceSnapshot): Promise<TradePriceSnapshot> {
    throw new Error("Audit trail not supported in MemStorage");
  }

  async getPriceSnapshots(_tradeIdeaId: string): Promise<TradePriceSnapshot[]> {
    throw new Error("Audit trail not supported in MemStorage");
  }

  async getTradeAuditTrail(_tradeIdeaId: string): Promise<{
    tradeIdea: TradeIdea | null;
    priceSnapshots: TradePriceSnapshot[];
  }> {
    throw new Error("Audit trail not supported in MemStorage");
  }

  // Blog Posts CMS (stub)
  async getBlogPosts(_status?: BlogPostStatus): Promise<BlogPost[]> {
    throw new Error("Blog not supported in MemStorage");
  }

  async getBlogPostBySlug(_slug: string): Promise<BlogPost | null> {
    throw new Error("Blog not supported in MemStorage");
  }

  async createBlogPost(_post: InsertBlogPost): Promise<BlogPost> {
    throw new Error("Blog not supported in MemStorage");
  }

  async updateBlogPost(_id: string, _post: Partial<InsertBlogPost>): Promise<BlogPost | null> {
    throw new Error("Blog not supported in MemStorage");
  }

  async deleteBlogPost(_id: string): Promise<boolean> {
    throw new Error("Blog not supported in MemStorage");
  }

  // Loss Analysis (stub)
  async createLossAnalysis(_analysis: InsertLossAnalysis): Promise<LossAnalysis> {
    throw new Error("Loss analysis not supported in MemStorage");
  }

  async getLossAnalysisByTradeId(_tradeIdeaId: string): Promise<LossAnalysis | null> {
    throw new Error("Loss analysis not supported in MemStorage");
  }

  async getAllLossAnalyses(): Promise<LossAnalysis[]> {
    throw new Error("Loss analysis not supported in MemStorage");
  }

  async getLossPatterns(): Promise<{ pattern: string; count: number; avgLoss: number }[]> {
    throw new Error("Loss analysis not supported in MemStorage");
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

  async updateUserSubscription(userId: string, subscriptionData: { stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionTier?: SubscriptionTier; subscriptionStatus?: string; subscriptionEndsAt?: Date | null }): Promise<User | undefined> {
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
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
    const [created] = await db.insert(marketDataTable).values(data as any).returning();
    return created;
  }

  async updateMarketData(symbol: string, data: Partial<InsertMarketData>): Promise<MarketData | undefined> {
    const [updated] = await db.update(marketDataTable)
      .set(data as any)
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
    const [created] = await db.insert(tradeIdeas).values(idea as any).returning();
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

    // Build base query conditions - check ALL open ideas regardless of source
    // This prevents duplicate ideas like multiple DOGE trades from different generation runs
    const conditions = [
      eq(tradeIdeas.symbol, symbol),
      eq(tradeIdeas.direction, direction),
      gte(tradeIdeas.timestamp, cutoffTime),
      eq(tradeIdeas.outcomeStatus, 'open') // Only check open ideas
    ];

    // Add asset type filter if provided
    if (assetType) {
      conditions.push(eq(tradeIdeas.assetType, assetType as AssetType));
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

  async updateTradeIdeaPerformance(id: string, performance: Partial<Pick<TradeIdea, 'outcomeStatus' | 'exitPrice' | 'exitDate' | 'resolutionReason' | 'actualHoldingTimeMinutes' | 'percentGain' | 'realizedPnL' | 'validatedAt' | 'outcomeNotes' | 'predictionAccurate' | 'predictionValidatedAt' | 'highestPriceReached' | 'lowestPriceReached' | 'missedEntryTheoreticalOutcome' | 'missedEntryTheoreticalGain'>>): Promise<TradeIdea | undefined> {
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
    
    // 🎯 ENGINE VERSION FILTERING - CONSISTENT (Dec 2025)
    // Uses canonical isCurrentGenEngine from shared/constants.ts
    // Excludes legacy v1.x/v2.x engines by default for consistent stats across all endpoints
    // Set includeAllVersions=true to include legacy engines (for admin/ML analysis)
    if (filters?.includeAllVersions !== true) {
      // Default: Exclude legacy engines for consistent stats across endpoints
      const beforeVersionFilter = allIdeas.length;
      allIdeas = allIdeas.filter(idea => isCurrentGenEngine(idea));
      console.log(`[PERF-STATS] Engine filter: Current-gen only → ${beforeVersionFilter} filtered to ${allIdeas.length}`);
    } else {
      // Explicitly requested to include all versions (admin/ML mode)
      console.log(`[PERF-STATS] Engine filter: All versions included (admin mode) → ${allIdeas.length} ideas`);
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
      
      // 🚨 ALSO exclude 'flow' and 'lotto' sources - they're almost entirely options
      // Flow Scanner: 965/1127 expired (unvalidatable options), 99.4% "win rate" is fake
      // Lotto Scanner: 341/341 expired (all far-OTM options)
      // These inflate stats artificially - exclude from public display
      const beforeSourceFilter = allIdeas.length;
      allIdeas = allIdeas.filter(idea => idea.source !== 'flow' && idea.source !== 'lotto');
      const flowLottoCount = beforeSourceFilter - allIdeas.length;
      if (flowLottoCount > 0) {
        console.log(`[PERF-STATS] Source filter: Excluded ${flowLottoCount} flow/lotto trades (unvalidatable options) → ${allIdeas.length} ideas remain`);
      }
    } else {
      console.log(`[PERF-STATS] Options included (includeOptions=true) - WARNING: option win rates may be invalid`);
    }
    
    const openIdeas = allIdeas.filter(i => i.outcomeStatus === 'open');
    const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
    const wonIdeas = closedIdeas.filter(i => i.outcomeStatus === 'hit_target');
    // 🎯 MINIMUM LOSS THRESHOLD: Only count as loss if percentGain is below -3%
    const lostIdeas = closedIdeas.filter(i => {
      if (i.outcomeStatus !== 'hit_stop') return false;
      if (i.percentGain !== null && i.percentGain !== undefined) {
        return i.percentGain <= -CANONICAL_LOSS_THRESHOLD;
      }
      return true;
    });
    const expiredIdeas = closedIdeas.filter(i => i.outcomeStatus === 'expired' || i.outcomeStatus === 'manual_exit');

    const calculateAvg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    
    // Helper function to filter real losses (above threshold)
    const isRealLoss = (idea: TradeIdea) => {
      if (idea.outcomeStatus !== 'hit_stop') return false;
      if (idea.percentGain !== null && idea.percentGain !== undefined) {
        return idea.percentGain <= -CANONICAL_LOSS_THRESHOLD;
      }
      return true;
    };
    
    const closedGains = closedIdeas.filter(i => i.percentGain !== null).map(i => i.percentGain!);
    const closedHoldingTimes = closedIdeas.filter(i => i.actualHoldingTimeMinutes !== null).map(i => i.actualHoldingTimeMinutes!);

    // Group by source (ALL ideas, not just closed) - DYNAMICALLY to include all sources (flow, hybrid, ai, quant, manual)
    const sourcesSet = new Set(allIdeas.map(i => i.source || 'unknown'));
    const bySource = Array.from(sourcesSet).map(source => {
      const sourceAllIdeas = allIdeas.filter(i => i.source === source);
      const sourceClosedIdeas = closedIdeas.filter(i => i.source === source);
      const sourceWon = sourceClosedIdeas.filter(i => i.outcomeStatus === 'hit_target');
      const sourceLost = sourceClosedIdeas.filter(i => isRealLoss(i));
      const sourceGains = sourceClosedIdeas.filter(i => i.percentGain !== null).map(i => i.percentGain!);
      // WIN RATE FIX: Only count decided trades (exclude expired and breakeven)
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
      const assetLost = assetClosedIdeas.filter(i => isRealLoss(i));
      const assetGains = assetClosedIdeas.filter(i => i.percentGain !== null).map(i => i.percentGain!);
      // WIN RATE FIX: Only count decided trades (exclude expired and breakeven)
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
      const signalLost = ideas.filter(i => isRealLoss(i));
      const signalGains = ideas.filter(i => i.percentGain !== null).map(i => i.percentGain!);
      // WIN RATE FIX: Only count decided trades (exclude expired and breakeven)
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
        winRate,
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
    const [created] = await db.insert(catalystsTable).values(catalyst as any).returning();
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

  async getWatchlistByCategory(category: string): Promise<WatchlistItem[]> {
    return await db.select().from(watchlistTable)
      .where(eq(watchlistTable.category, category as any))
      .orderBy(desc(watchlistTable.addedAt));
  }

  async addToWatchlist(item: InsertWatchlist): Promise<WatchlistItem> {
    const [created] = await db.insert(watchlistTable).values(item as any).returning();
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

  // Futures Research Briefs Methods
  async getAllFuturesResearchBriefs(): Promise<FuturesResearchBrief[]> {
    return await db.select()
      .from(futuresResearchBriefs)
      .orderBy(desc(futuresResearchBriefs.generatedAt));
  }

  async getActiveFuturesResearchBriefs(): Promise<FuturesResearchBrief[]> {
    return await db.select()
      .from(futuresResearchBriefs)
      .where(eq(futuresResearchBriefs.isActive, true))
      .orderBy(desc(futuresResearchBriefs.generatedAt));
  }

  async getFuturesResearchBriefBySymbol(symbol: string): Promise<FuturesResearchBrief | null> {
    const [brief] = await db.select()
      .from(futuresResearchBriefs)
      .where(and(
        eq(futuresResearchBriefs.symbol, symbol),
        eq(futuresResearchBriefs.isActive, true)
      ))
      .orderBy(desc(futuresResearchBriefs.generatedAt))
      .limit(1);
    return brief || null;
  }

  async createFuturesResearchBrief(brief: InsertFuturesResearchBrief): Promise<FuturesResearchBrief> {
    const [created] = await db.insert(futuresResearchBriefs)
      .values(brief)
      .returning();
    return created;
  }

  async updateFuturesResearchBrief(id: string, updates: Partial<FuturesResearchBrief>): Promise<FuturesResearchBrief | null> {
    const [updated] = await db.update(futuresResearchBriefs)
      .set(updates)
      .where(eq(futuresResearchBriefs.id, id))
      .returning();
    return updated || null;
  }

  async deactivateFuturesResearchBrief(id: string): Promise<boolean> {
    const [updated] = await db.update(futuresResearchBriefs)
      .set({ isActive: false })
      .where(eq(futuresResearchBriefs.id, id))
      .returning();
    return !!updated;
  }

  async deactivateOldFuturesResearchBriefs(symbol: string): Promise<void> {
    await db.update(futuresResearchBriefs)
      .set({ isActive: false })
      .where(eq(futuresResearchBriefs.symbol, symbol));
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

  // Daily Usage Tracking Methods
  async getDailyUsage(userId: string, date: string): Promise<DailyUsage | null> {
    const [usage] = await db.select().from(dailyUsageTable)
      .where(and(
        eq(dailyUsageTable.userId, userId),
        eq(dailyUsageTable.date, date)
      ));
    return usage || null;
  }

  async incrementDailyUsage(userId: string, field: 'ideasViewed' | 'aiChatMessages' | 'chartAnalyses'): Promise<DailyUsage> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Try to get existing record
    let existing = await this.getDailyUsage(userId, today);
    
    if (!existing) {
      // Create new record for today
      const [created] = await db.insert(dailyUsageTable).values({
        userId,
        date: today,
        ideasViewed: field === 'ideasViewed' ? 1 : 0,
        aiChatMessages: field === 'aiChatMessages' ? 1 : 0,
        chartAnalyses: field === 'chartAnalyses' ? 1 : 0,
      }).returning();
      return created;
    }
    
    // Increment the specified field
    const increment = { [field]: (existing[field] || 0) + 1 };
    const [updated] = await db.update(dailyUsageTable)
      .set(increment)
      .where(eq(dailyUsageTable.id, existing.id))
      .returning();
    return updated;
  }

  // User-filtered Trade Ideas
  async getTradeIdeasByUser(userId: string): Promise<TradeIdea[]> {
    return await db.select().from(tradeIdeas)
      .where(eq(tradeIdeas.userId, userId))
      .orderBy(desc(tradeIdeas.timestamp));
  }

  // Get system-generated ideas (userId is NULL) plus user's own ideas
  async getTradeIdeasForUser(userId: string): Promise<TradeIdea[]> {
    return await db.select().from(tradeIdeas)
      .where(or(
        isNull(tradeIdeas.userId),  // System-generated ideas
        eq(tradeIdeas.userId, userId)  // User's own ideas
      ))
      .orderBy(desc(tradeIdeas.timestamp));
  }

  // Active Trades (Live Position Tracking)
  async getActiveTrades(userId: string): Promise<ActiveTrade[]> {
    return await db.select().from(activeTradesTable)
      .where(eq(activeTradesTable.userId, userId))
      .orderBy(desc(activeTradesTable.createdAt));
  }

  async getActiveTradeById(id: string): Promise<ActiveTrade | undefined> {
    const [trade] = await db.select().from(activeTradesTable)
      .where(eq(activeTradesTable.id, id));
    return trade || undefined;
  }

  async createActiveTrade(trade: InsertActiveTrade): Promise<ActiveTrade> {
    const [created] = await db.insert(activeTradesTable).values(trade as any).returning();
    return created;
  }

  async updateActiveTrade(id: string, updates: Partial<ActiveTrade>): Promise<ActiveTrade | undefined> {
    const [updated] = await db.update(activeTradesTable)
      .set(updates)
      .where(eq(activeTradesTable.id, id))
      .returning();
    return updated || undefined;
  }

  async closeActiveTrade(id: string, exitPrice: number): Promise<ActiveTrade | undefined> {
    const trade = await this.getActiveTradeById(id);
    if (!trade) return undefined;

    const now = new Date().toISOString();
    const realizedPnL = (exitPrice - trade.entryPrice) * trade.quantity * (trade.direction === 'short' ? -1 : 1) * 100; // Options are 100x
    const realizedPnLPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.direction === 'short' ? -1 : 1);

    const [updated] = await db.update(activeTradesTable)
      .set({
        status: 'closed' as ActiveTradeStatus,
        exitPrice,
        exitTime: now,
        realizedPnL,
        realizedPnLPercent,
      })
      .where(eq(activeTradesTable.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteActiveTrade(id: string): Promise<boolean> {
    const result = await db.delete(activeTradesTable)
      .where(eq(activeTradesTable.id, id));
    return true;
  }

  // ==========================================
  // PAPER TRADING - Portfolio Operations
  // ==========================================

  async createPaperPortfolio(portfolio: InsertPaperPortfolio): Promise<PaperPortfolio> {
    const [created] = await db.insert(paperPortfoliosTable).values(portfolio).returning();
    return created;
  }

  async getPaperPortfoliosByUser(userId: string): Promise<PaperPortfolio[]> {
    return await db.select().from(paperPortfoliosTable)
      .where(eq(paperPortfoliosTable.userId, userId))
      .orderBy(desc(paperPortfoliosTable.createdAt));
  }

  async getAllPaperPortfolios(): Promise<PaperPortfolio[]> {
    return await db.select().from(paperPortfoliosTable)
      .orderBy(desc(paperPortfoliosTable.createdAt));
  }

  async getPaperPortfolioById(id: string): Promise<PaperPortfolio | undefined> {
    const [portfolio] = await db.select().from(paperPortfoliosTable)
      .where(eq(paperPortfoliosTable.id, id));
    return portfolio || undefined;
  }

  async updatePaperPortfolio(id: string, updates: Partial<PaperPortfolio>): Promise<PaperPortfolio | undefined> {
    // DEFENSIVE CHECK: Prevent negative cash balance updates
    // This ensures bots can't accidentally overdraw accounts
    if (updates.cashBalance !== undefined && updates.cashBalance < 0) {
      console.warn(`[STORAGE] ⚠️ Attempted to set negative cash balance: $${updates.cashBalance.toFixed(2)} for portfolio ${id}`);
      console.warn(`[STORAGE] ⚠️ This indicates a bug in position sizing or P&L calculation. Clamping to $0.`);
      // Clamp to 0 - this prevents cascading errors but indicates a bug that needs fixing
      updates.cashBalance = 0;
    }
    
    const [updated] = await db.update(paperPortfoliosTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(paperPortfoliosTable.id, id))
      .returning();
    return updated || undefined;
  }
  
  // Helper to validate cash before opening a position
  async validateCashForTrade(portfolioId: string, requiredCash: number): Promise<{ valid: boolean; available: number; error?: string }> {
    const portfolio = await this.getPaperPortfolioById(portfolioId);
    if (!portfolio) {
      return { valid: false, available: 0, error: 'Portfolio not found' };
    }
    if (portfolio.cashBalance < requiredCash) {
      return { 
        valid: false, 
        available: portfolio.cashBalance, 
        error: `Insufficient cash: need $${requiredCash.toFixed(2)}, have $${portfolio.cashBalance.toFixed(2)}` 
      };
    }
    return { valid: true, available: portfolio.cashBalance };
  }

  async deletePaperPortfolio(id: string): Promise<boolean> {
    await db.delete(paperPositionsTable).where(eq(paperPositionsTable.portfolioId, id));
    await db.delete(paperEquitySnapshotsTable).where(eq(paperEquitySnapshotsTable.portfolioId, id));
    await db.delete(paperPortfoliosTable).where(eq(paperPortfoliosTable.id, id));
    return true;
  }

  // ==========================================
  // PAPER TRADING - Position Operations
  // ==========================================

  async createPaperPosition(position: InsertPaperPosition): Promise<PaperPosition> {
    const insertData = {
      portfolioId: position.portfolioId,
      symbol: position.symbol,
      assetType: position.assetType as AssetType,
      direction: position.direction,
      entryPrice: position.entryPrice,
      quantity: position.quantity,
      entryTime: position.entryTime || new Date().toISOString(),
      tradeIdeaId: position.tradeIdeaId ?? undefined,
      optionType: position.optionType ?? undefined,
      strikePrice: position.strikePrice ?? undefined,
      expiryDate: position.expiryDate ?? undefined,
      targetPrice: position.targetPrice ?? undefined,
      stopLoss: position.stopLoss ?? undefined,
      currentPrice: position.currentPrice ?? undefined,
      lastPriceUpdate: position.lastPriceUpdate ?? undefined,
      unrealizedPnL: position.unrealizedPnL ?? undefined,
      unrealizedPnLPercent: position.unrealizedPnLPercent ?? undefined,
      status: (position.status ?? 'open') as PaperTradeStatus,
    };
    const [created] = await db.insert(paperPositionsTable).values(insertData).returning();
    return created;
  }

  async getPaperPositionsByPortfolio(portfolioId: string): Promise<PaperPosition[]> {
    return await db.select().from(paperPositionsTable)
      .where(eq(paperPositionsTable.portfolioId, portfolioId))
      .orderBy(desc(paperPositionsTable.createdAt));
  }

  async getPaperPositionById(id: string): Promise<PaperPosition | undefined> {
    const [position] = await db.select().from(paperPositionsTable)
      .where(eq(paperPositionsTable.id, id));
    return position || undefined;
  }

  async updatePaperPosition(id: string, updates: Partial<PaperPosition>): Promise<PaperPosition | undefined> {
    const [updated] = await db.update(paperPositionsTable)
      .set(updates)
      .where(eq(paperPositionsTable.id, id))
      .returning();
    return updated || undefined;
  }

  async closePaperPosition(id: string, exitPrice: number, exitReason: string): Promise<PaperPosition | undefined> {
    const position = await this.getPaperPositionById(id);
    if (!position) return undefined;

    const now = new Date().toISOString();
    
    // Calculate proper multiplier based on asset type
    let multiplier = 1;
    if (position.assetType === 'option') {
      multiplier = 100; // Options: 100 shares per contract
    } else if (position.assetType === 'future') {
      // Futures use point-based P&L calculation
      const symbol = position.symbol || '';
      if (symbol.startsWith('NQ') || symbol === 'NQ') {
        multiplier = 20; // NQ: $20 per point
      } else if (symbol.startsWith('GC') || symbol === 'GC') {
        multiplier = 100; // GC: $100 per point (10 per tick, 10 ticks per point)
      } else {
        multiplier = 20; // Default to NQ
      }
    }
    
    const directionMultiplier = position.direction === 'long' ? 1 : -1;
    const priceDiff = exitPrice - position.entryPrice;
    
    // For futures: P&L = price difference * multiplier * contracts
    // For options: P&L = price difference * 100 * contracts  
    // For stocks/crypto: P&L = price difference * quantity
    const realizedPnL = priceDiff * position.quantity * multiplier * directionMultiplier;
    const realizedPnLPercent = position.entryPrice > 0 
      ? (priceDiff / position.entryPrice) * 100 * directionMultiplier 
      : 0;

    const [updated] = await db.update(paperPositionsTable)
      .set({
        status: 'closed' as PaperTradeStatus,
        exitPrice,
        exitTime: now,
        exitReason,
        realizedPnL,
        realizedPnLPercent,
      })
      .where(eq(paperPositionsTable.id, id))
      .returning();

    if (updated) {
      const portfolio = await this.getPaperPortfolioById(position.portfolioId);
      if (portfolio) {
        // For futures, we return margin + P&L
        // For options/stocks, we return notional cost + P&L
        let positionCost: number;
        if (position.assetType === 'future') {
          // Futures use margin-based position sizing
          // Since futures use margin and the P&L is the full gain/loss, just return the margin
          positionCost = 100; // Standard margin per contract for paper trading
        } else {
          positionCost = position.entryPrice * position.quantity * multiplier;
        }
        
        await this.updatePaperPortfolio(portfolio.id, {
          cashBalance: portfolio.cashBalance + positionCost + realizedPnL,
          totalPnL: portfolio.totalPnL + realizedPnL,
          winCount: realizedPnL > 0 ? portfolio.winCount + 1 : portfolio.winCount,
          lossCount: realizedPnL <= 0 ? portfolio.lossCount + 1 : portfolio.lossCount,
        });
      }
    }

    return updated || undefined;
  }

  // ==========================================
  // PAPER TRADING - Equity Snapshot Operations
  // ==========================================

  async createPaperEquitySnapshot(snapshot: InsertPaperEquitySnapshot): Promise<PaperEquitySnapshot> {
    const [created] = await db.insert(paperEquitySnapshotsTable).values(snapshot).returning();
    return created;
  }

  async getPaperEquitySnapshots(portfolioId: string, startDate?: string, endDate?: string): Promise<PaperEquitySnapshot[]> {
    let conditions = [eq(paperEquitySnapshotsTable.portfolioId, portfolioId)];
    
    if (startDate) {
      conditions.push(gte(paperEquitySnapshotsTable.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(paperEquitySnapshotsTable.date, endDate));
    }

    return await db.select().from(paperEquitySnapshotsTable)
      .where(and(...conditions))
      .orderBy(desc(paperEquitySnapshotsTable.date));
  }

  // 🛡️ COMPLIANCE: Count completed (closed) paper trades for a user
  // Required for paper trading enforcement before live trading access
  async getCompletedPaperTradesCount(userId: string): Promise<number> {
    // Get all portfolios for this user
    const portfolios = await this.getPaperPortfoliosByUser(userId);
    if (portfolios.length === 0) return 0;
    
    // Count closed positions across all portfolios
    let totalClosedTrades = 0;
    for (const portfolio of portfolios) {
      const positions = await db.select().from(paperPositionsTable)
        .where(and(
          eq(paperPositionsTable.portfolioId, portfolio.id),
          eq(paperPositionsTable.status, 'closed')
        ));
      totalClosedTrades += positions.length;
    }
    
    return totalClosedTrades;
  }

  // CT Ingestion
  async createCTSource(source: InsertCTSource): Promise<CTSource> {
    const [created] = await db.insert(ctSources).values(source as any).returning();
    return created;
  }

  async getCTSources(): Promise<CTSource[]> {
    return await db.select().from(ctSources);
  }

  async createCTMention(mention: InsertCTMention): Promise<CTMention> {
    const [created] = await db.insert(ctMentions).values(mention as any).returning();
    return created;
  }

  async getCTMentions(hours?: number): Promise<CTMention[]> {
    if (hours) {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      return await db.select().from(ctMentions)
        .where(gte(ctMentions.timestamp, cutoff))
        .orderBy(desc(ctMentions.timestamp));
    }
    return await db.select().from(ctMentions).orderBy(desc(ctMentions.timestamp));
  }

  async getCTCallPerformance(mentionId: number): Promise<CTCallPerformance | undefined> {
    const [performance] = await db.select().from(ctCallPerformance)
      .where(eq(ctCallPerformance.mentionId, mentionId));
    return performance || undefined;
  }

  async updateCTCallPerformance(mentionId: number, updates: Partial<CTCallPerformance>): Promise<CTCallPerformance> {
    const performance = await this.getCTCallPerformance(mentionId);
    if (performance) {
      const [updated] = await db.update(ctCallPerformance)
        .set({ ...updates, lastCheckedAt: new Date() })
        .where(eq(ctCallPerformance.id, performance.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(ctCallPerformance).values({
      mentionId,
      entryPrice: updates.entryPrice || 0,
      currentPrice: updates.currentPrice || null,
      maxPriceReached: updates.maxPriceReached || null,
      percentChange: updates.percentChange || null,
      status: updates.status || 'active',
      lastCheckedAt: new Date(),
    } as any).returning();
    return created;
  }

  async getCTSourceById(id: string): Promise<CTSource | undefined> {
    const [source] = await db.select().from(ctSources).where(eq(ctSources.id, id));
    return source || undefined;
  }

  async updateCTSource(id: string, updates: Partial<CTSource>): Promise<CTSource> {
    const [updated] = await db.update(ctSources)
      .set(updates as any)
      .where(eq(ctSources.id, id))
      .returning();
    return updated;
  }

  async deleteCTSource(id: string): Promise<boolean> {
    await db.delete(ctMentions).where(eq(ctMentions.sourceId, id));
    await db.delete(ctSources).where(eq(ctSources.id, id));
    return true;
  }

  async getCTMentionsByTicker(ticker: string, hours?: number): Promise<CTMention[]> {
    const normalizedTicker = ticker.startsWith('$') ? ticker : `$${ticker}`;
    const allMentions = await this.getCTMentions(hours);
    return allMentions.filter(m => m.tickers?.includes(normalizedTicker));
  }

  async getCTMentionsBySentiment(sentiment: string, hours?: number): Promise<CTMention[]> {
    const allMentions = await this.getCTMentions(hours);
    return allMentions.filter(m => m.sentiment === sentiment);
  }

  async getCTCallPerformanceStats(): Promise<{ totalCalls: number; wins: number; losses: number; winRate: number }> {
    const allPerformance = await db.select().from(ctCallPerformance);
    const wins = allPerformance.filter(p => p.status === 'win').length;
    const losses = allPerformance.filter(p => p.status === 'loss').length;
    const totalCalls = allPerformance.length;
    const winRate = totalCalls > 0 ? (wins / (wins + losses)) * 100 : 0;
    return { totalCalls, wins, losses, winRate };
  }

  // ==========================================
  // WALLET TRACKER OPERATIONS
  // ==========================================

  async getTrackedWallets(userId: string): Promise<TrackedWallet[]> {
    return await db.select().from(trackedWallets)
      .where(eq(trackedWallets.userId, userId))
      .orderBy(desc(trackedWallets.createdAt));
  }

  async getTrackedWalletById(id: string): Promise<TrackedWallet | undefined> {
    const [wallet] = await db.select().from(trackedWallets).where(eq(trackedWallets.id, id));
    return wallet || undefined;
  }

  async createTrackedWallet(wallet: InsertTrackedWallet): Promise<TrackedWallet> {
    const [created] = await db.insert(trackedWallets).values(wallet as any).returning();
    return created;
  }

  async deleteTrackedWallet(id: string): Promise<boolean> {
    await db.delete(walletHoldings).where(eq(walletHoldings.walletId, id));
    await db.delete(walletTransactions).where(eq(walletTransactions.walletId, id));
    await db.delete(walletAlerts).where(eq(walletAlerts.walletId, id));
    await db.delete(trackedWallets).where(eq(trackedWallets.id, id));
    return true;
  }

  async updateTrackedWallet(id: string, updates: Partial<TrackedWallet>): Promise<TrackedWallet | undefined> {
    const [updated] = await db.update(trackedWallets)
      .set(updates)
      .where(eq(trackedWallets.id, id))
      .returning();
    return updated || undefined;
  }

  async getWalletHoldings(walletId: string): Promise<WalletHolding[]> {
    return await db.select().from(walletHoldings)
      .where(eq(walletHoldings.walletId, walletId));
  }

  async createWalletHolding(holding: InsertWalletHolding): Promise<WalletHolding> {
    const [created] = await db.insert(walletHoldings).values(holding as any).returning();
    return created;
  }

  async updateWalletHolding(id: string, updates: Partial<WalletHolding>): Promise<WalletHolding | undefined> {
    const [updated] = await db.update(walletHoldings)
      .set(updates)
      .where(eq(walletHoldings.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteWalletHoldings(walletId: string): Promise<boolean> {
    await db.delete(walletHoldings).where(eq(walletHoldings.walletId, walletId));
    return true;
  }

  async getWalletTransactions(walletId: string, limit?: number): Promise<WalletTransaction[]> {
    const query = db.select().from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId))
      .orderBy(desc(walletTransactions.createdAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }

  async getWhaleActivity(userId: string, limit: number = 50): Promise<WalletTransaction[]> {
    const userWallets = await this.getTrackedWallets(userId);
    const walletIds = userWallets.map(w => w.id);
    
    if (walletIds.length === 0) {
      return [];
    }

    const transactions = await db.select().from(walletTransactions)
      .where(eq(walletTransactions.isLargeTransaction, true))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit);
    
    return transactions.filter(tx => walletIds.includes(tx.walletId));
  }

  async createWalletTransaction(tx: InsertWalletTransaction): Promise<WalletTransaction> {
    const [created] = await db.insert(walletTransactions).values(tx as any).returning();
    return created;
  }

  async getWalletAlerts(userId: string): Promise<WalletAlert[]> {
    return await db.select().from(walletAlerts)
      .where(eq(walletAlerts.userId, userId))
      .orderBy(desc(walletAlerts.createdAt));
  }

  async getWalletAlertById(id: string): Promise<WalletAlert | undefined> {
    const [alert] = await db.select().from(walletAlerts).where(eq(walletAlerts.id, id));
    return alert || undefined;
  }

  async createWalletAlert(alert: InsertWalletAlert): Promise<WalletAlert> {
    const [created] = await db.insert(walletAlerts).values(alert as any).returning();
    return created;
  }

  async deleteWalletAlert(id: string): Promise<boolean> {
    await db.delete(walletAlerts).where(eq(walletAlerts.id, id));
    return true;
  }

  // ==========================================
  // TELEMETRY OPERATIONS
  // ==========================================

  // Trade Input Snapshots
  async saveTradeInputSnapshot(snapshot: InsertTradeInputSnapshot): Promise<TradeInputSnapshot> {
    const [created] = await db.insert(tradeInputSnapshots).values(snapshot as any).returning();
    return created;
  }

  async getTradeInputSnapshot(tradeIdeaId: string): Promise<TradeInputSnapshot | null> {
    const [snapshot] = await db.select().from(tradeInputSnapshots)
      .where(eq(tradeInputSnapshots.tradeIdeaId, tradeIdeaId));
    return snapshot || null;
  }

  // Engine Daily Metrics
  async saveEngineDailyMetrics(metrics: InsertEngineDailyMetrics): Promise<EngineDailyMetrics> {
    const [created] = await db.insert(engineDailyMetrics).values(metrics as any).returning();
    return created;
  }

  async getEngineDailyMetrics(date: string, engine?: EngineSource): Promise<EngineDailyMetrics[]> {
    if (engine) {
      return await db.select().from(engineDailyMetrics)
        .where(and(
          eq(engineDailyMetrics.date, date),
          eq(engineDailyMetrics.engine, engine)
        ));
    }
    return await db.select().from(engineDailyMetrics)
      .where(eq(engineDailyMetrics.date, date));
  }

  async getEngineMetricsRange(startDate: string, endDate: string, engine?: EngineSource): Promise<EngineDailyMetrics[]> {
    if (engine) {
      return await db.select().from(engineDailyMetrics)
        .where(and(
          gte(engineDailyMetrics.date, startDate),
          lte(engineDailyMetrics.date, endDate),
          eq(engineDailyMetrics.engine, engine)
        ))
        .orderBy(desc(engineDailyMetrics.date));
    }
    return await db.select().from(engineDailyMetrics)
      .where(and(
        gte(engineDailyMetrics.date, startDate),
        lte(engineDailyMetrics.date, endDate)
      ))
      .orderBy(desc(engineDailyMetrics.date));
  }

  // Engine Health Alerts
  async saveEngineHealthAlert(alert: InsertEngineHealthAlert): Promise<EngineHealthAlert> {
    const [created] = await db.insert(engineHealthAlerts).values(alert as any).returning();
    return created;
  }

  async getActiveHealthAlerts(): Promise<EngineHealthAlert[]> {
    return await db.select().from(engineHealthAlerts)
      .where(eq(engineHealthAlerts.acknowledged, false))
      .orderBy(desc(engineHealthAlerts.createdAt));
  }

  async acknowledgeHealthAlert(id: string, userId: string): Promise<void> {
    await db.update(engineHealthAlerts)
      .set({
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date().toISOString(),
      })
      .where(eq(engineHealthAlerts.id, id));
  }

  // Trade Audit Trail - Price Snapshots
  async savePriceSnapshot(snapshot: InsertTradePriceSnapshot): Promise<TradePriceSnapshot> {
    const [created] = await db.insert(tradePriceSnapshots).values(snapshot as any).returning();
    return created;
  }

  async getPriceSnapshots(tradeIdeaId: string): Promise<TradePriceSnapshot[]> {
    return await db.select().from(tradePriceSnapshots)
      .where(eq(tradePriceSnapshots.tradeIdeaId, tradeIdeaId))
      .orderBy(desc(tradePriceSnapshots.createdAt));
  }

  async getTradeAuditTrail(tradeIdeaId: string): Promise<{
    tradeIdea: TradeIdea | null;
    priceSnapshots: TradePriceSnapshot[];
  }> {
    const [tradeIdea, priceSnapshots] = await Promise.all([
      this.getTradeIdeaById(tradeIdeaId),
      this.getPriceSnapshots(tradeIdeaId),
    ]);
    return { tradeIdea: tradeIdea ?? null, priceSnapshots };
  }

  // ==========================================
  // BLOG POSTS CMS
  // ==========================================

  async getBlogPosts(status?: BlogPostStatus): Promise<BlogPost[]> {
    if (status) {
      return await db.select().from(blogPosts)
        .where(eq(blogPosts.status, status))
        .orderBy(desc(blogPosts.publishedAt));
    }
    return await db.select().from(blogPosts)
      .orderBy(desc(blogPosts.publishedAt));
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | null> {
    const [post] = await db.select().from(blogPosts)
      .where(eq(blogPosts.slug, slug));
    return post || null;
  }

  async createBlogPost(post: InsertBlogPost): Promise<BlogPost> {
    const [created] = await db.insert(blogPosts).values({
      ...post,
      publishedAt: post.status === 'published' ? new Date() : null,
    } as any).returning();
    return created;
  }

  async updateBlogPost(id: string, updates: Partial<InsertBlogPost>): Promise<BlogPost | null> {
    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };
    
    if (updates.status === 'published') {
      const [existing] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
      if (existing && !existing.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }
    
    const [updated] = await db.update(blogPosts)
      .set(updateData)
      .where(eq(blogPosts.id, id))
      .returning();
    return updated || null;
  }

  async deleteBlogPost(id: string): Promise<boolean> {
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
    return true;
  }

  // Loss Analysis - Post-Mortem for Failed Trades
  async createLossAnalysis(analysis: InsertLossAnalysis): Promise<LossAnalysis> {
    const [created] = await db.insert(lossAnalysis).values(analysis as any).returning();
    return created;
  }

  async getLossAnalysisByTradeId(tradeIdeaId: string): Promise<LossAnalysis | null> {
    const [result] = await db.select().from(lossAnalysis)
      .where(eq(lossAnalysis.tradeIdeaId, tradeIdeaId));
    return result || null;
  }

  async getAllLossAnalyses(): Promise<LossAnalysis[]> {
    return await db.select().from(lossAnalysis)
      .orderBy(desc(lossAnalysis.createdAt));
  }

  async getLossPatterns(): Promise<{ pattern: string; count: number; avgLoss: number }[]> {
    const results = await db.select({
      pattern: lossAnalysis.lossReason,
      count: drizzleSql<number>`count(*)::int`,
      avgLoss: drizzleSql<number>`avg(${lossAnalysis.percentLoss})::float`,
    })
    .from(lossAnalysis)
    .groupBy(lossAnalysis.lossReason)
    .orderBy(desc(drizzleSql`count(*)`));
    
    return results.map(r => ({
      pattern: r.pattern || 'unknown',
      count: r.count,
      avgLoss: r.avgLoss || 0,
    }));
  }

  // Auto Lotto Preferences
  async getAutoLottoPreferences(userId: string): Promise<AutoLottoPreferences | null> {
    const [result] = await db.select().from(autoLottoPreferences)
      .where(eq(autoLottoPreferences.userId, userId));
    return result || null;
  }

  async upsertAutoLottoPreferences(prefs: InsertAutoLottoPreferences): Promise<AutoLottoPreferences> {
    const existing = await this.getAutoLottoPreferences(prefs.userId);
    
    if (existing) {
      const [updated] = await db.update(autoLottoPreferences)
        .set({
          ...prefs as any,
          updatedAt: new Date(),
        })
        .where(eq(autoLottoPreferences.userId, prefs.userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(autoLottoPreferences)
        .values(prefs as any)
        .returning();
      return created;
    }
  }

  // ==========================================
  // PLATFORM REPORTS - Daily/Weekly/Monthly Analytics
  // ==========================================

  async getPlatformReports(period?: ReportPeriod, limit: number = 50): Promise<PlatformReport[]> {
    if (period) {
      return await db.select().from(platformReports)
        .where(eq(platformReports.period, period))
        .orderBy(desc(platformReports.generatedAt))
        .limit(limit);
    }
    return await db.select().from(platformReports)
      .orderBy(desc(platformReports.generatedAt))
      .limit(limit);
  }

  async getPlatformReportById(id: string): Promise<PlatformReport | null> {
    const [report] = await db.select().from(platformReports)
      .where(eq(platformReports.id, id));
    return report || null;
  }

  async getLatestReportByPeriod(period: ReportPeriod): Promise<PlatformReport | null> {
    const [report] = await db.select().from(platformReports)
      .where(eq(platformReports.period, period))
      .orderBy(desc(platformReports.generatedAt))
      .limit(1);
    return report || null;
  }

  async createPlatformReport(report: InsertPlatformReport): Promise<PlatformReport> {
    const [created] = await db.insert(platformReports).values(report as any).returning();
    return created;
  }

  async updatePlatformReport(id: string, updates: Partial<InsertPlatformReport>): Promise<PlatformReport | null> {
    const [updated] = await db.update(platformReports)
      .set(updates as any)
      .where(eq(platformReports.id, id))
      .returning();
    return updated || null;
  }

  async deletePlatformReport(id: string): Promise<boolean> {
    await db.delete(platformReports).where(eq(platformReports.id, id));
    return true;
  }
}

export const storage = new DatabaseStorage();
