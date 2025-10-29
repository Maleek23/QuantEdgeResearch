import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Subscription Tier Type
export type SubscriptionTier = 'free' | 'premium' | 'admin';

// Simplified user tracking for Discord community members
// Discord OAuth will be implemented later - for now this is manual tier tracking
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  discordUserId: varchar("discord_user_id").unique(), // From Discord
  discordUsername: varchar("discord_username"), // From Discord
  email: varchar("email"), // Optional - may not have
  
  // Subscription tier tracking (managed manually via Discord roles for now)
  subscriptionTier: text("subscription_tier").$type<SubscriptionTier>().notNull().default('free'),
  subscriptionStatus: varchar("subscription_status").default('active'), // 'active', 'canceled', 'past_due'
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Market Session Type
export type MarketSession = 'pre-market' | 'rth' | 'after-hours' | 'closed';

// Asset Types
export type AssetType = 'stock' | 'penny_stock' | 'option' | 'crypto';

// Performance Tracking Outcome Types
export type OutcomeStatus = 'open' | 'hit_target' | 'hit_stop' | 'manual_exit' | 'expired';

// Resolution Reason - How outcome was determined
export type ResolutionReason = 'auto_target_hit' | 'auto_stop_hit' | 'auto_expired' | 'manual_user_won' | 'manual_user_lost' | 'manual_user_breakeven';

// Volatility Regime - Market volatility classification at entry time
export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

// Session Phase - Intraday timing classification
export type SessionPhase = 'opening' | 'mid-day' | 'closing' | 'overnight';

// Trade Idea
export const tradeIdeas = pgTable("trade_ideas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // nullable for backward compatibility, will be required for new ideas
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().$type<AssetType>(),
  direction: text("direction").notNull(), // 'long' | 'short'
  holdingPeriod: text("holding_period").$type<'day' | 'swing' | 'position' | 'week-ending'>().notNull().default('day'), // day (<6hrs), swing (1-5 days), position (5+ days), week-ending (exit by Friday close)
  entryPrice: real("entry_price").notNull(),
  targetPrice: real("target_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  riskRewardRatio: real("risk_reward_ratio").notNull(),
  catalyst: text("catalyst").notNull(),
  catalystSourceUrl: text("catalyst_source_url"), // Clickable link to catalyst source
  analysis: text("analysis").notNull(),
  liquidityWarning: boolean("liquidity_warning").default(false),
  sessionContext: text("session_context").notNull(),
  timestamp: text("timestamp").notNull(),
  isPublic: boolean("is_public").default(false), // For public performance ledger
  visibility: text("visibility").notNull().default('private'), // 'private' | 'public' | 'subscribers_only'
  
  // Time Windows for Day Trading
  entryValidUntil: text("entry_valid_until"), // When entry window closes (e.g., +2 hours)
  exitBy: text("exit_by"), // Max hold time / exit deadline (e.g., market close)
  
  expiryDate: text("expiry_date"), // For options
  strikePrice: real("strike_price"), // For options
  optionType: text("option_type"), // 'call' | 'put' for options
  source: text("source").notNull().$type<IdeaSource>().default('quant'), // 'ai' | 'quant'
  confidenceScore: real("confidence_score").notNull().default(0), // 0-100 quality score
  qualitySignals: text("quality_signals").array(), // Array of signal names that fired
  probabilityBand: text("probability_band").notNull().default('C'), // 'A+' (95+), 'A' (90+), 'B+' (85+), 'B' (80+), 'C+' (75+), 'C' (70+), 'D' (<70)
  
  // Performance Tracking Fields
  outcomeStatus: text("outcome_status").$type<OutcomeStatus>().default('open'), // Tracks if trade worked
  exitPrice: real("exit_price"), // Actual exit price when closed
  realizedPnL: real("realized_pnl"), // Actual profit/loss in dollars
  exitDate: text("exit_date"), // When trade was closed
  outcomeNotes: text("outcome_notes"), // Additional notes about outcome
  resolutionReason: text("resolution_reason").$type<ResolutionReason>(), // How outcome was determined
  actualHoldingTimeMinutes: integer("actual_holding_time_minutes"), // How long trade was held
  percentGain: real("percent_gain"), // Actual % gain or loss
  validatedAt: text("validated_at"), // When auto-validation last checked this idea
  
  // Quant Prediction Accuracy Tracking
  predictionAccurate: boolean("prediction_accurate"), // LEGACY: Did price move in predicted direction by meaningful amount?
  predictionAccuracyPercent: real("prediction_accuracy_percent"), // % progress toward target (0-100+)
  predictionValidatedAt: text("prediction_validated_at"), // When prediction accuracy was checked
  highestPriceReached: real("highest_price_reached"), // Peak price during trade (for long positions)
  lowestPriceReached: real("lowest_price_reached"), // Lowest price during trade (for short positions)
  
  // ML Training Eligibility - Flag to exclude legacy/bad trades from model training
  excludeFromTraining: boolean("exclude_from_training").default(false), // If true, ML retraining ignores this trade
  
  // 🔐 MODEL GOVERNANCE & AUDITABILITY (SR 11-7 / OCC 201-12 compliance)
  engineVersion: text("engine_version"), // Quant engine version that generated this idea (e.g., "v2.1.0")
  mlWeightsVersion: text("ml_weights_version"), // ML weights snapshot used (e.g., "weights_v5_20251021")
  generationTimestamp: text("generation_timestamp"), // ISO timestamp when idea was generated (for audit trail)
  
  // Data Quality Tracking
  dataSourceUsed: text("data_source_used"), // 'tradier', 'yahoo', 'coingecko', 'alphavantage', 'estimated'
  
  // Explainability - Technical Indicator Values (for transparency)
  rsiValue: real("rsi_value"), // Actual RSI value (0-100)
  macdLine: real("macd_line"), // MACD line value
  macdSignal: real("macd_signal"), // MACD signal line value
  macdHistogram: real("macd_histogram"), // MACD histogram value
  volumeRatio: real("volume_ratio"), // Current volume / average volume
  priceVs52WeekHigh: real("price_vs_52week_high"), // Distance from 52-week high (%)
  priceVs52WeekLow: real("price_vs_52week_low"), // Distance from 52-week low (%)
  
  // Timing Intelligence - Market Regime & Quantitative Timing Windows
  volatilityRegime: text("volatility_regime").$type<VolatilityRegime>(), // 'low' | 'normal' | 'high' | 'extreme'
  sessionPhase: text("session_phase").$type<SessionPhase>(), // 'opening' | 'mid-day' | 'closing' | 'overnight'
  trendStrength: real("trend_strength"), // 0-100 measure of trend alignment across timeframes
  entryWindowMinutes: integer("entry_window_minutes"), // Quantitatively-derived optimal entry window
  exitWindowMinutes: integer("exit_window_minutes"), // Quantitatively-derived optimal exit window
  timingConfidence: real("timing_confidence"), // 0-100 confidence in timing windows
  targetHitProbability: real("target_hit_probability"), // ML-predicted probability of hitting target within exit window
  
  // News Catalyst Mode - Relaxes R:R validation for breaking news events
  isNewsCatalyst: boolean("is_news_catalyst").default(false), // True for major news events (earnings beat, acquisition, Fed announcements, etc.)
});

export const insertTradeIdeaSchema = createInsertSchema(tradeIdeas).omit({ id: true });
export type InsertTradeIdea = z.infer<typeof insertTradeIdeaSchema>;
export type TradeIdea = typeof tradeIdeas.$inferSelect & {
  currentPrice?: number | null; // Dynamically added by backend with live price data
};

// Data Source Type
export type DataSource = 'seed' | 'live';

// Idea Source Type
export type IdeaSource = 'ai' | 'quant' | 'hybrid' | 'manual' | 'news';

// Hidden Gem Discovery Criteria
export interface HiddenGemCriteria {
  stocks: {
    marketCapMin: number;      // $50M minimum
    marketCapMax: number;      // $5B maximum for "hidden" status
    volumeMultiplier: number;  // 3x average volume spike
    priceGapMin: number;       // 5% price gap minimum
    minLiquidity: number;      // Minimum daily volume for safety
  };
  crypto: {
    marketCapMin: number;      // $50M minimum
    marketCapMax: number;      // $2B maximum for emerging assets
    volumeMin: number;         // $5M+ daily volume
    excludeTopN: number;       // Exclude top 20 by market cap
  };
  options: {
    volumeMultiplier: number;  // 5x baseline OI/volume
    minUnderlyingLiquidity: number;
  };
}

// Anomaly Detection Signals
export interface AnomalySignals {
  volumeSpike: boolean;        // Volume >3x average
  priceGap: boolean;          // Price gap >5%
  relativeStrength: boolean;  // Outperforming sector
  unusualFlow: boolean;       // Options: OI/volume spike
  emergingTrend: boolean;     // Multi-timeframe alignment
}

// Default Hidden Gem Criteria
export const DEFAULT_HIDDEN_GEM_CRITERIA: HiddenGemCriteria = {
  stocks: {
    marketCapMin: 50_000_000,      // $50M
    marketCapMax: 5_000_000_000,   // $5B
    volumeMultiplier: 3.0,
    priceGapMin: 5.0,
    minLiquidity: 500_000,         // $500K daily volume
  },
  crypto: {
    marketCapMin: 50_000_000,      // $50M
    marketCapMax: 2_000_000_000,   // $2B
    volumeMin: 5_000_000,          // $5M daily
    excludeTopN: 20,
  },
  options: {
    volumeMultiplier: 5.0,
    minUnderlyingLiquidity: 1_000_000,
  },
};

// Market Data
export const marketData = pgTable("market_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull().unique(),
  assetType: text("asset_type").notNull().$type<AssetType>(),
  currentPrice: real("current_price").notNull(),
  changePercent: real("change_percent").notNull(),
  volume: real("volume").notNull(),
  marketCap: real("market_cap"),
  session: text("session").notNull().$type<MarketSession>(),
  timestamp: text("timestamp").notNull(),
  high24h: real("high_24h"),
  low24h: real("low_24h"),
  high52Week: real("high_52_week"),
  low52Week: real("low_52_week"),
  avgVolume: real("avg_volume"),
  dataSource: text("data_source").notNull().$type<DataSource>().default('seed'),
  lastUpdated: text("last_updated").notNull(),
});

export const insertMarketDataSchema = createInsertSchema(marketData).omit({ id: true });
export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;
export type MarketData = typeof marketData.$inferSelect;

// Options Data
export const optionsData = pgTable("options_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  strikePrice: real("strike_price").notNull(),
  expiryDate: text("expiry_date").notNull(),
  optionType: text("option_type").notNull(), // 'call' | 'put'
  impliedVolatility: real("implied_volatility").notNull(),
  openInterest: integer("open_interest").notNull(),
  volume: integer("volume").notNull(),
  bid: real("bid").notNull(),
  ask: real("ask").notNull(),
  lastPrice: real("last_price").notNull(),
  delta: real("delta"),
  gamma: real("gamma"),
  theta: real("theta"),
  vega: real("vega"),
});

export const insertOptionsDataSchema = createInsertSchema(optionsData).omit({ id: true });
export type InsertOptionsData = z.infer<typeof insertOptionsDataSchema>;
export type OptionsData = typeof optionsData.$inferSelect;

// Watchlist
export const watchlist = pgTable("watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // nullable for backward compatibility
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().$type<AssetType>(),
  targetPrice: real("target_price"),
  notes: text("notes"),
  addedAt: text("added_at").notNull(),
  
  // Price Alert Targets
  entryAlertPrice: real("entry_alert_price"), // Alert when price drops to this level (buying opportunity)
  stopAlertPrice: real("stop_alert_price"), // Alert when price hits stop loss
  targetAlertPrice: real("target_alert_price"), // Alert when price hits profit target
  
  // Alert Settings
  alertsEnabled: boolean("alerts_enabled").default(true), // Master toggle for all alerts
  discordAlertsEnabled: boolean("discord_alerts_enabled").default(true), // Send to Discord
  
  // Alert Tracking
  lastAlertSent: text("last_alert_sent"), // Timestamp of last alert to prevent spam
  alertCount: integer("alert_count").default(0), // Track how many alerts sent
});

export const insertWatchlistSchema = createInsertSchema(watchlist).omit({ id: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type WatchlistItem = typeof watchlist.$inferSelect;

// Catalyst/News
export const catalysts = pgTable("catalysts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url"), // Clickable link to external source
  timestamp: text("timestamp").notNull(),
  eventType: text("event_type").notNull(), // 'earnings', 'fda', 'guidance', 'news', etc.
  impact: text("impact").notNull(), // 'high' | 'medium' | 'low'
});

export const insertCatalystSchema = createInsertSchema(catalysts).omit({ id: true });
export type InsertCatalyst = z.infer<typeof insertCatalystSchema>;
export type Catalyst = typeof catalysts.$inferSelect;

// User Preferences
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(), // One preferences record per user
  
  // Trading Preferences
  accountSize: real("account_size").notNull().default(10000),
  maxRiskPerTrade: real("max_risk_per_trade").notNull().default(1), // percentage
  defaultCapitalPerIdea: real("default_capital_per_idea").notNull().default(1000),
  defaultOptionsBudget: real("default_options_budget").notNull().default(250),
  preferredAssets: text("preferred_assets").array().notNull().default(['stock', 'option', 'crypto']),
  holdingHorizon: text("holding_horizon").notNull().default('intraday'),
  
  // Display Preferences
  theme: text("theme").notNull().default('dark'), // 'light' | 'dark' | 'auto'
  timezone: text("timezone").notNull().default('America/Chicago'),
  defaultViewMode: text("default_view_mode").notNull().default('card'), // 'card' | 'table'
  compactMode: boolean("compact_mode").notNull().default(false),
  
  // Notification Preferences
  discordWebhookUrl: text("discord_webhook_url"),
  enableTradeAlerts: boolean("enable_trade_alerts").notNull().default(true),
  enablePriceAlerts: boolean("enable_price_alerts").notNull().default(true),
  enablePerformanceAlerts: boolean("enable_performance_alerts").notNull().default(false),
  enableWeeklyReport: boolean("enable_weekly_report").notNull().default(false),
  
  // Default Filters
  defaultAssetFilter: text("default_asset_filter").notNull().default('all'), // 'all' | 'stock' | 'option' | 'crypto'
  defaultConfidenceFilter: text("default_confidence_filter").notNull().default('all'), // 'all' | 'A' | 'B' | 'C'
  autoRefreshEnabled: boolean("auto_refresh_enabled").notNull().default(true),
  
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({ id: true });
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

// 🔐 MODEL CARDS - ML Ops governance & auditability (SR 11-7 / OCC 201-12 compliance)
// Documents each quant engine version and ML weights snapshot for model risk management
export const modelCards = pgTable("model_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  engineVersion: text("engine_version").notNull().unique(), // e.g., "v2.1.0"
  mlWeightsVersion: text("ml_weights_version"), // e.g., "weights_v5_20251021" (null for pure quant)
  
  // Model Metadata
  modelType: text("model_type").notNull(), // 'quant' | 'ml_hybrid' | 'ai'
  description: text("description").notNull(), // What changed in this version
  createdAt: text("created_at").notNull(), // When this version was deployed
  createdBy: text("created_by"), // Who deployed it (for audit trail)
  
  // Model Assumptions & Data Limits
  assumptions: text("assumptions"), // JSON: Key assumptions (e.g., "Assumes mean-reverting markets")
  dataLimitations: text("data_limitations"), // JSON: Data quality issues (e.g., "Limited options chain data")
  signalWeights: text("signal_weights"), // JSON: Signal importance scores
  
  // Performance Benchmarks
  backtestStartDate: text("backtest_start_date"),
  backtestEndDate: text("backtest_end_date"),
  backtestWinRate: real("backtest_win_rate"), // % (e.g., 67.5)
  backtestSharpeRatio: real("backtest_sharpe_ratio"),
  backtestMaxDrawdown: real("backtest_max_drawdown"), // % (e.g., -12.3)
  
  // Live Performance Tracking
  liveTradesGenerated: integer("live_trades_generated").default(0),
  liveWinRate: real("live_win_rate"), // Real-world performance
  liveAccuracyRate: real("live_accuracy_rate"), // % progress toward target
  
  // Model Status
  status: text("status").notNull().default('active'), // 'active' | 'deprecated' | 'archived'
  deprecatedAt: text("deprecated_at"),
  deprecationReason: text("deprecation_reason"),
});

export const insertModelCardSchema = createInsertSchema(modelCards).omit({ id: true });
export type InsertModelCard = z.infer<typeof insertModelCardSchema>;
export type ModelCard = typeof modelCards.$inferSelect;

// Position Calculation Interface (not stored, just for calculations)
export interface PositionCalculation {
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  capitalAllocated: number;
  shares: number;
  riskAmount: number;
  riskPercent: number;
  potentialProfit: number;
  riskRewardRatio: number;
  stopLossPercent: number;
  targetPercent: number;
}

// Screener Filters
export interface ScreenerFilters {
  assetType?: AssetType[];
  priceRange?: { min?: number; max?: number };
  volumeThreshold?: number;
  changePercentRange?: { min?: number; max?: number };
  marketCapRange?: { min?: number; max?: number };
  pennyStocksOnly?: boolean; // <$5
  highIVOnly?: boolean; // IV > 50%
  unusualVolume?: boolean; // volume > 2x avg
}
