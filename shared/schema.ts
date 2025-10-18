import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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
export type AssetType = 'stock' | 'option' | 'crypto';

// Performance Tracking Outcome Types
export type OutcomeStatus = 'open' | 'hit_target' | 'hit_stop' | 'manual_exit' | 'expired';

// Resolution Reason - How outcome was determined
export type ResolutionReason = 'auto_target_hit' | 'auto_stop_hit' | 'auto_expired' | 'manual_user_won' | 'manual_user_lost' | 'manual_user_breakeven';

// Trade Idea
export const tradeIdeas = pgTable("trade_ideas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // nullable for backward compatibility, will be required for new ideas
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().$type<AssetType>(),
  direction: text("direction").notNull(), // 'long' | 'short'
  entryPrice: real("entry_price").notNull(),
  targetPrice: real("target_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  riskRewardRatio: real("risk_reward_ratio").notNull(),
  catalyst: text("catalyst").notNull(),
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
  probabilityBand: text("probability_band").notNull().default('C'), // 'A' (80+), 'B' (70-79), 'C' (<70)
  
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
});

export const insertTradeIdeaSchema = createInsertSchema(tradeIdeas).omit({ id: true });
export type InsertTradeIdea = z.infer<typeof insertTradeIdeaSchema>;
export type TradeIdea = typeof tradeIdeas.$inferSelect;

// Data Source Type
export type DataSource = 'seed' | 'live';

// Idea Source Type
export type IdeaSource = 'ai' | 'quant' | 'manual';

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
  accountSize: real("account_size").notNull().default(10000),
  maxRiskPerTrade: real("max_risk_per_trade").notNull().default(1), // percentage
  defaultCapitalPerIdea: real("default_capital_per_idea").notNull().default(1000),
  defaultOptionsBudget: real("default_options_budget").notNull().default(250),
  preferredAssets: text("preferred_assets").array().notNull().default(['stock', 'option', 'crypto']),
  holdingHorizon: text("holding_horizon").notNull().default('intraday'),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({ id: true });
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;

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
