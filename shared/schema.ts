import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, boolean, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Subscription Tier Type - 3 tiers for monetization
export type SubscriptionTier = 'free' | 'advanced' | 'pro' | 'admin';

// Session storage table (Required for Replit Auth)
// Reference: blueprint:javascript_log_in_with_replit
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (Local auth with password)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Auth fields
  email: varchar("email").unique().notNull(),
  passwordHash: varchar("password_hash"), // bcrypt hashed password
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  
  // Discord fields (optional - for Discord community integration)
  discordUserId: varchar("discord_user_id"),
  discordUsername: varchar("discord_username"),
  
  // Subscription tier tracking
  subscriptionTier: text("subscription_tier").$type<SubscriptionTier>().notNull().default('free'),
  subscriptionStatus: varchar("subscription_status").default('active'), // 'active', 'canceled', 'past_due'
  
  // Stripe Integration
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  stripePriceId: varchar("stripe_price_id"),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Market Session Type
export type MarketSession = 'pre-market' | 'rth' | 'after-hours' | 'closed';

// Asset Types
export type AssetType = 'stock' | 'penny_stock' | 'option' | 'crypto' | 'future';

// Performance Tracking Outcome Types
export type OutcomeStatus = 'open' | 'hit_target' | 'hit_stop' | 'manual_exit' | 'expired';

// Resolution Reason - How outcome was determined
export type ResolutionReason = 'auto_target_hit' | 'auto_stop_hit' | 'auto_expired' | 'auto_breakeven' | 'missed_entry_window' | 'missed_entry_would_have_won' | 'missed_entry_would_have_lost' | 'missed_entry_no_outcome' | 'manual_user_won' | 'manual_user_lost' | 'manual_user_breakeven';

// Volatility Regime - Market volatility classification at entry time
export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

// Session Phase - Intraday timing classification
export type SessionPhase = 'opening' | 'mid-day' | 'closing' | 'overnight';

// Research Horizon - Time frame categorization for educational research
export type ResearchHorizon = 'intraday' | 'short_swing' | 'multi_week' | 'thematic_long';

// Risk Profile - Risk categorization for speculative plays
export type RiskProfile = 'conservative' | 'moderate' | 'aggressive' | 'speculative';

// Sector Focus - Thematic sector categorization
export type SectorFocus = 'quantum_computing' | 'nuclear_fusion' | 'healthcare' | 'ai_ml' | 'space' | 'clean_energy' | 'crypto' | 'fintech' | 'other';

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
  
  // Futures Fields
  futuresContractCode: text("futures_contract_code"), // e.g., 'NQH25' for NQ March 2025
  futuresRootSymbol: text("futures_root_symbol"), // 'NQ', 'GC'
  futuresMultiplier: real("futures_multiplier"), // $20 for NQ, $100 for GC
  futuresTickSize: real("futures_tick_size"), // 0.25 for NQ, 0.10 for GC
  futuresInitialMargin: real("futures_initial_margin"), // Required margin to open position (from contract)
  futuresMaintenanceMargin: real("futures_maintenance_margin"), // Minimum margin to hold position (from contract)
  
  source: text("source").notNull().$type<IdeaSource>().default('quant'), // 'ai' | 'quant' | 'chart_analysis'
  status: text("status").$type<TradeIdeaStatus>().notNull().default('published'), // 'draft' | 'published' | 'archived'
  chartImageUrl: text("chart_image_url"), // URL/path to uploaded chart image (for chart_analysis source)
  chartAnalysisJson: jsonb("chart_analysis_json"), // Full AI analysis result (for chart_analysis source)
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
  
  // Lotto Mode - High-risk far-OTM options ($20-70 entry) with 20x potential
  isLottoPlay: boolean("is_lotto_play").default(false), // True for $20-70 options with delta <0.30 (far OTM)
  
  // 🎓 EDUCATIONAL TRACKING - For missed entries (entry window expired before trade placed)
  // These fields track what WOULD HAVE happened - separate from real performance metrics
  missedEntryTheoreticalOutcome: text("missed_entry_theoretical_outcome").$type<'would_have_won' | 'would_have_lost' | 'inconclusive'>(), // What would have happened if entry was made
  missedEntryTheoreticalGain: real("missed_entry_theoretical_gain"), // Theoretical % gain/loss if trade was entered
  
  // Research Categorization - For educational framing and filtering
  researchHorizon: text("research_horizon").$type<ResearchHorizon>().default('intraday'), // Time frame: intraday, short_swing, multi_week, thematic_long
  riskProfile: text("risk_profile").$type<RiskProfile>().default('moderate'), // Risk level: conservative, moderate, aggressive, speculative
  sectorFocus: text("sector_focus").$type<SectorFocus>(), // Thematic sector: quantum_computing, nuclear_fusion, healthcare, ai_ml, etc.
});

// Ticker Data Types
export type TickerMention = {
  ticker: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
};

export const insertTradeIdeaSchema = createInsertSchema(tradeIdeas).omit({ id: true });
export type InsertTradeIdea = z.infer<typeof insertTradeIdeaSchema>;
export type TradeIdea = typeof tradeIdeas.$inferSelect & {
  currentPrice?: number | null; // Dynamically added by backend with live price data
};

// Data Source Type
export type DataSource = 'seed' | 'live';

// Idea Source Type
export type IdeaSource = 'ai' | 'quant' | 'hybrid' | 'manual' | 'news' | 'flow' | 'lotto' | 'chart_analysis' | 'penny-scanner';

// Trade Idea Status Type
export type TradeIdeaStatus = 'draft' | 'published' | 'archived';

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

// Futures Contracts - CME specifications
export const futuresContracts = pgTable("futures_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rootSymbol: text("root_symbol").notNull(), // 'NQ', 'GC'
  contractCode: text("contract_code").notNull().unique(), // 'NQH25' (NQ March 2025), 'GCJ25' (GC April 2025)
  exchange: text("exchange").notNull(), // 'CME', 'COMEX'
  expirationDate: text("expiration_date").notNull(), // ISO date when contract expires
  
  // Contract Specifications
  multiplier: real("multiplier").notNull(), // NQ=$20/point, GC=$100/oz
  tickSize: real("tick_size").notNull(), // Minimum price increment (NQ=0.25, GC=0.10)
  tickValue: real("tick_value").notNull(), // Dollar value of 1 tick (NQ=$5, GC=$10)
  
  // Margin Requirements
  initialMargin: real("initial_margin").notNull(), // Required margin to open position
  maintenanceMargin: real("maintenance_margin").notNull(), // Minimum margin to hold position
  
  // Contract Status
  isFrontMonth: boolean("is_front_month").default(false), // Is this the active front month contract?
  rollDate: text("roll_date"), // When to roll to next contract
  
  // Metadata
  description: text("description"), // 'E-mini Nasdaq-100 Futures', 'Gold Futures'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFuturesContractSchema = createInsertSchema(futuresContracts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFuturesContract = z.infer<typeof insertFuturesContractSchema>;
export type FuturesContract = typeof futuresContracts.$inferSelect;

// Futures Research Briefs - AI-generated analysis for futures contracts
export type FuturesBias = 'bullish' | 'bearish' | 'neutral';
export type FuturesBiasStrength = 'strong' | 'moderate' | 'weak';
export type FuturesSession = 'rth' | 'pre' | 'post' | 'overnight' | 'closed';

export const futuresResearchBriefs = pgTable("futures_research_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  symbol: text("symbol").notNull(), // 'NQ', 'ES', 'GC', 'CL'
  name: text("name").notNull(), // 'E-mini Nasdaq-100', 'Gold'
  
  // Current Market State
  currentPrice: real("current_price").notNull(),
  session: text("session").notNull().$type<FuturesSession>(),
  
  // AI Analysis
  bias: text("bias").notNull().$type<FuturesBias>(),
  biasStrength: text("bias_strength").notNull().$type<FuturesBiasStrength>(),
  technicalSummary: text("technical_summary").notNull(),
  sessionContext: text("session_context").notNull(),
  
  // Key Levels (stored as JSON)
  resistanceLevels: text("resistance_levels").array(), // e.g., ['21500', '21600']
  supportLevels: text("support_levels").array(), // e.g., ['21300', '21200']
  pivotLevel: real("pivot_level"),
  
  // Catalysts & Risks
  catalysts: text("catalysts").array(),
  riskFactors: text("risk_factors").array(),
  
  // Trading Idea (optional)
  tradeDirection: text("trade_direction").$type<'long' | 'short'>(),
  tradeEntry: real("trade_entry"),
  tradeTarget: real("trade_target"),
  tradeStop: real("trade_stop"),
  tradeRationale: text("trade_rationale"),
  
  // Metadata
  generatedAt: timestamp("generated_at").defaultNow(),
  expiresAt: timestamp("expires_at"), // When this brief should be refreshed
  source: text("source").default('ai'), // 'ai' | 'quant' | 'manual'
  isActive: boolean("is_active").default(true),
});

export const insertFuturesResearchBriefSchema = createInsertSchema(futuresResearchBriefs).omit({ id: true, generatedAt: true });
export type InsertFuturesResearchBrief = z.infer<typeof insertFuturesResearchBriefSchema>;
export type FuturesResearchBrief = typeof futuresResearchBriefs.$inferSelect;

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

// Daily usage tracking for tier limits
export const dailyUsage = pgTable("daily_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  ideasViewed: integer("ideas_viewed").notNull().default(0),
  aiChatMessages: integer("ai_chat_messages").notNull().default(0),
  chartAnalyses: integer("chart_analyses").notNull().default(0),
});

export const insertDailyUsageSchema = createInsertSchema(dailyUsage).omit({ id: true });
export type InsertDailyUsage = z.infer<typeof insertDailyUsageSchema>;
export type DailyUsage = typeof dailyUsage.$inferSelect;

// Active Trade Position Status
export type ActiveTradeStatus = 'open' | 'closed' | 'expired';

// Active Trades - Live position tracking for real-time P&L monitoring
export const activeTrades = pgTable("active_trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  
  // Position Details
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().$type<AssetType>(),
  direction: text("direction").notNull(), // 'long' | 'short'
  
  // Option-specific fields
  optionType: text("option_type"), // 'call' | 'put'
  strikePrice: real("strike_price"),
  expiryDate: text("expiry_date"), // YYYY-MM-DD
  
  // Entry Details
  entryPrice: real("entry_price").notNull(), // Price paid for option/stock
  quantity: integer("quantity").notNull().default(1), // Number of contracts/shares
  entryTime: text("entry_time").notNull(), // ISO timestamp
  
  // Targets & Stops
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  
  // Live Tracking
  currentPrice: real("current_price"), // Last fetched price
  lastPriceUpdate: text("last_price_update"), // When price was last updated
  unrealizedPnL: real("unrealized_pnl"), // Current P&L in dollars
  unrealizedPnLPercent: real("unrealized_pnl_percent"), // Current P&L as %
  
  // Exit Details
  status: text("status").$type<ActiveTradeStatus>().notNull().default('open'),
  exitPrice: real("exit_price"),
  exitTime: text("exit_time"),
  realizedPnL: real("realized_pnl"),
  realizedPnLPercent: real("realized_pnl_percent"),
  
  // Notes
  notes: text("notes"),
  linkedTradeIdeaId: varchar("linked_trade_idea_id"), // Optional link to a trade idea
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActiveTradeSchema = createInsertSchema(activeTrades).omit({ id: true, createdAt: true });
export type InsertActiveTrade = z.infer<typeof insertActiveTradeSchema>;
export type ActiveTrade = typeof activeTrades.$inferSelect;

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

// ==========================================
// PAPER TRADING - Simulation Portfolio System
// ==========================================

export type PaperTradeStatus = 'open' | 'closed';

// Paper Trading Portfolio - Virtual portfolio for simulation
export const paperPortfolios = pgTable("paper_portfolios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull().default('My Paper Portfolio'),
  
  // Capital
  startingCapital: real("starting_capital").notNull().default(100000), // Default $100K
  cashBalance: real("cash_balance").notNull().default(100000), // Available cash
  
  // Performance Metrics (calculated)
  totalValue: real("total_value").notNull().default(100000), // Cash + positions value
  totalPnL: real("total_pnl").notNull().default(0),
  totalPnLPercent: real("total_pnl_percent").notNull().default(0),
  winCount: integer("win_count").notNull().default(0),
  lossCount: integer("loss_count").notNull().default(0),
  
  // Settings
  autoExecute: boolean("auto_execute").default(false), // Auto-execute QuantEdge signals
  maxPositionSize: real("max_position_size").default(5000), // Max per position
  riskPerTrade: real("risk_per_trade").default(0.02), // 2% default risk
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPaperPortfolioSchema = createInsertSchema(paperPortfolios).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaperPortfolio = z.infer<typeof insertPaperPortfolioSchema>;
export type PaperPortfolio = typeof paperPortfolios.$inferSelect;

// Paper Positions - Open simulated positions
export const paperPositions = pgTable("paper_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: varchar("portfolio_id").notNull(),
  tradeIdeaId: varchar("trade_idea_id"), // Link to original signal
  
  // Position Details
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().$type<AssetType>(),
  direction: text("direction").notNull(), // 'long' | 'short'
  
  // Option-specific
  optionType: text("option_type"), // 'call' | 'put'
  strikePrice: real("strike_price"),
  expiryDate: text("expiry_date"),
  
  // Entry
  entryPrice: real("entry_price").notNull(),
  quantity: integer("quantity").notNull(),
  entryTime: text("entry_time").notNull(),
  
  // Targets
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  
  // Trailing Stop System - let winners run
  highWaterMark: real("high_water_mark"), // Highest price seen during trade
  trailingStopPercent: real("trailing_stop_percent").default(25), // Dynamic trailing stop %
  trailingStopPrice: real("trailing_stop_price"), // Calculated trailing stop level
  useTrailingStop: boolean("use_trailing_stop").default(true), // Enable trailing stops
  
  // Current State
  currentPrice: real("current_price"),
  lastPriceUpdate: text("last_price_update"),
  unrealizedPnL: real("unrealized_pnl").default(0),
  unrealizedPnLPercent: real("unrealized_pnl_percent").default(0),
  
  // Status
  status: text("status").$type<PaperTradeStatus>().notNull().default('open'),
  exitPrice: real("exit_price"),
  exitTime: text("exit_time"),
  exitReason: text("exit_reason"), // 'target_hit' | 'stop_hit' | 'manual' | 'expired'
  realizedPnL: real("realized_pnl"),
  realizedPnLPercent: real("realized_pnl_percent"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaperPositionSchema = createInsertSchema(paperPositions).omit({ id: true, createdAt: true });
export type InsertPaperPosition = z.infer<typeof insertPaperPositionSchema>;
export type PaperPosition = typeof paperPositions.$inferSelect;

// Paper Equity Snapshots - Daily equity curve
export const paperEquitySnapshots = pgTable("paper_equity_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: varchar("portfolio_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  totalValue: real("total_value").notNull(),
  cashBalance: real("cash_balance").notNull(),
  positionsValue: real("positions_value").notNull(),
  dailyPnL: real("daily_pnl").notNull().default(0),
  dailyPnLPercent: real("daily_pnl_percent").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaperEquitySnapshotSchema = createInsertSchema(paperEquitySnapshots).omit({ id: true, createdAt: true });
export type InsertPaperEquitySnapshot = z.infer<typeof insertPaperEquitySnapshotSchema>;
export type PaperEquitySnapshot = typeof paperEquitySnapshots.$inferSelect;

// ==========================================
// WALLET TRACKER - Whale Wallet Monitoring
// ==========================================

export type BlockchainNetwork = 'ethereum' | 'solana' | 'bitcoin';
export type WalletAlertType = 'large_transfer' | 'token_accumulation' | 'token_dump' | 'new_token';

// Tracked Wallets - Whale wallets to monitor
export const trackedWallets = pgTable("tracked_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Who added this wallet
  
  address: text("address").notNull(),
  network: text("network").$type<BlockchainNetwork>().notNull(),
  label: text("label"), // e.g., "Vitalik", "Jump Trading", "Alameda"
  category: text("category"), // 'whale' | 'institution' | 'dex' | 'cex' | 'personal'
  
  // Tracking Status
  isActive: boolean("is_active").default(true),
  lastSyncAt: text("last_sync_at"),
  syncErrorCount: integer("sync_error_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTrackedWalletSchema = createInsertSchema(trackedWallets).omit({ id: true, createdAt: true });
export type InsertTrackedWallet = z.infer<typeof insertTrackedWalletSchema>;
export type TrackedWallet = typeof trackedWallets.$inferSelect;

// Wallet Holdings - Token balances for tracked wallets
export const walletHoldings = pgTable("wallet_holdings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletId: varchar("wallet_id").notNull(),
  
  tokenAddress: text("token_address"), // null for native (ETH/SOL)
  tokenSymbol: text("token_symbol").notNull(),
  tokenName: text("token_name"),
  
  balance: real("balance").notNull(),
  balanceUsd: real("balance_usd"),
  
  // Change tracking
  previousBalance: real("previous_balance"),
  changePercent: real("change_percent"),
  
  lastUpdatedAt: text("last_updated_at").notNull(),
});

export const insertWalletHoldingSchema = createInsertSchema(walletHoldings).omit({ id: true });
export type InsertWalletHolding = z.infer<typeof insertWalletHoldingSchema>;
export type WalletHolding = typeof walletHoldings.$inferSelect;

// Wallet Transactions - Transfer history
export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletId: varchar("wallet_id").notNull(),
  
  txHash: text("tx_hash").notNull(),
  network: text("network").$type<BlockchainNetwork>().notNull(),
  
  // Transaction details
  type: text("type").notNull(), // 'send' | 'receive' | 'swap' | 'stake' | 'unstake'
  tokenSymbol: text("token_symbol").notNull(),
  tokenAddress: text("token_address"),
  amount: real("amount").notNull(),
  amountUsd: real("amount_usd"),
  
  // Counterparty
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  
  // Metadata
  blockNumber: integer("block_number"),
  timestamp: text("timestamp").notNull(),
  isLargeTransaction: boolean("is_large_transaction").default(false), // >$100K
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({ id: true, createdAt: true });
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletTransaction = typeof walletTransactions.$inferSelect;

// Wallet Alerts - Notifications for significant activity
export const walletAlerts = pgTable("wallet_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  walletId: varchar("wallet_id").notNull(),
  transactionId: varchar("transaction_id"),
  
  alertType: text("alert_type").$type<WalletAlertType>().notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  
  tokenSymbol: text("token_symbol"),
  amountUsd: real("amount_usd"),
  
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWalletAlertSchema = createInsertSchema(walletAlerts).omit({ id: true, createdAt: true });
export type InsertWalletAlert = z.infer<typeof insertWalletAlertSchema>;
export type WalletAlert = typeof walletAlerts.$inferSelect;

// ==========================================
// CT TRACKER - Crypto Twitter / Social Intelligence
// ==========================================

export type CTSourceType = 'twitter' | 'bluesky' | 'reddit' | 'discord' | 'rss' | 'telegram';
export type CTSentiment = 'bullish' | 'bearish' | 'neutral';
export type CTCallOutcome = 'pending' | 'win' | 'loss' | 'expired';

// CT Sources - Influencer accounts to track
export const ctSources = pgTable("ct_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  platform: text("platform").$type<CTSourceType>().notNull(),
  handle: text("handle").notNull(), // @username or feed URL
  displayName: text("display_name"),
  profileImageUrl: text("profile_image_url"),
  
  // Metrics
  followersCount: integer("followers_count"),
  historicalAccuracy: real("historical_accuracy"), // Win rate of past calls
  
  // Status
  isActive: boolean("is_active").default(true),
  lastFetchAt: text("last_fetch_at"),
  fetchErrorCount: integer("fetch_error_count").default(0),
  
  // Admin control
  isVerified: boolean("is_verified").default(false), // Admin-verified influencer
  category: text("category"), // 'analyst' | 'whale' | 'news' | 'degen'
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCTSourceSchema = createInsertSchema(ctSources).omit({ id: true, createdAt: true });
export type InsertCTSource = z.infer<typeof insertCTSourceSchema>;
export type CTSource = typeof ctSources.$inferSelect;

// CT Mentions - Parsed ticker mentions from social
export const ctMentions = pgTable("ct_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").notNull(),
  
  // Content
  postUrl: text("post_url"),
  postText: text("post_text").notNull(),
  
  // Parsed Data
  tickers: text("tickers").array(), // ['$BTC', '$ETH', '$SOL']
  sentiment: text("sentiment").$type<CTSentiment>().notNull().default('neutral'),
  sentimentScore: real("sentiment_score"), // -1 to 1
  
  // Call details (if trading call detected)
  isCall: boolean("is_call").default(false), // Is this a specific trading call?
  callDirection: text("call_direction"), // 'long' | 'short'
  callTargetPrice: real("call_target_price"),
  callStopLoss: real("call_stop_loss"),
  
  // Engagement
  likesCount: integer("likes_count"),
  retweetsCount: integer("retweets_count"),
  repliesCount: integer("replies_count"),
  
  // Timestamps
  postedAt: text("posted_at").notNull(),
  fetchedAt: text("fetched_at").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCTMentionSchema = createInsertSchema(ctMentions).omit({ id: true, createdAt: true });
export type InsertCTMention = z.infer<typeof insertCTMentionSchema>;
export type CTMention = typeof ctMentions.$inferSelect;

// CT Call Performance - Track accuracy of influencer calls
export const ctCallPerformance = pgTable("ct_call_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mentionId: varchar("mention_id").notNull(),
  sourceId: varchar("source_id").notNull(),
  
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // 'long' | 'short'
  
  // Entry/Exit
  callPrice: real("call_price").notNull(), // Price when call was made
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  
  // Outcome
  outcome: text("outcome").$type<CTCallOutcome>().notNull().default('pending'),
  exitPrice: real("exit_price"),
  pnlPercent: real("pnl_percent"),
  resolvedAt: text("resolved_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCTCallPerformanceSchema = createInsertSchema(ctCallPerformance).omit({ id: true, createdAt: true });
export type InsertCTCallPerformance = z.infer<typeof insertCTCallPerformanceSchema>;
export type CTCallPerformance = typeof ctCallPerformance.$inferSelect;

// ============================================================================
// TELEMETRY & CONTINUOUS IMPROVEMENT TABLES
// ============================================================================

// Engine Source Type for telemetry
export type EngineSource = 'flow' | 'lotto' | 'quant' | 'ai' | 'hybrid' | 'manual';

// Trade Input Snapshots - Store signal inputs at generation time for ML feedback loops
export const tradeInputSnapshots = pgTable("trade_input_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeIdeaId: varchar("trade_idea_id").notNull(), // Link to trade_ideas.id
  engine: text("engine").$type<EngineSource>().notNull(),
  
  // Signal Inputs at Generation Time
  signalInputs: jsonb("signal_inputs"), // Full snapshot of inputs (RSI, volume, IV, etc.)
  
  // Key metrics that were used in decision
  volumeAtEntry: real("volume_at_entry"),
  rsiAtEntry: real("rsi_at_entry"),
  ivAtEntry: real("iv_at_entry"),
  premiumAtEntry: real("premium_at_entry"),
  skewRatioAtEntry: real("skew_ratio_at_entry"),
  
  // Confidence breakdown
  confidenceTotal: real("confidence_total"),
  confidenceBreakdown: jsonb("confidence_breakdown"), // {volume: 65, premium: 40, iv: 55, ...}
  qualityBand: text("quality_band"), // 'A', 'B+', 'B', 'C+', 'C'
  
  // Market context
  marketSessionAtEntry: text("market_session_at_entry"), // 'pre-market', 'rth', 'after-hours'
  vixAtEntry: real("vix_at_entry"),
  spyChangeAtEntry: real("spy_change_at_entry"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTradeInputSnapshotSchema = createInsertSchema(tradeInputSnapshots).omit({ id: true, createdAt: true });
export type InsertTradeInputSnapshot = z.infer<typeof insertTradeInputSnapshotSchema>;
export type TradeInputSnapshot = typeof tradeInputSnapshots.$inferSelect;

// Engine Daily Metrics - Aggregated daily performance per engine
export const engineDailyMetrics = pgTable("engine_daily_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull(), // YYYY-MM-DD
  engine: text("engine").$type<EngineSource>().notNull(),
  
  // Idea Generation Stats
  ideasGenerated: integer("ideas_generated").notNull().default(0),
  ideasPublished: integer("ideas_published").notNull().default(0),
  
  // Outcome Stats
  tradesResolved: integer("trades_resolved").notNull().default(0),
  tradesWon: integer("trades_won").notNull().default(0),
  tradesLost: integer("trades_lost").notNull().default(0),
  tradesExpired: integer("trades_expired").notNull().default(0),
  
  // Performance Metrics
  winRate: real("win_rate"), // % (0-100)
  avgGainPercent: real("avg_gain_percent"), // Average % gain on winners
  avgLossPercent: real("avg_loss_percent"), // Average % loss on losers
  expectancy: real("expectancy"), // (winRate * avgGain) - ((1-winRate) * avgLoss)
  
  // Timing Metrics
  avgHoldingTimeMinutes: real("avg_holding_time_minutes"),
  avgTimeToTarget: real("avg_time_to_target"), // How fast winners hit target
  avgTimeToStop: real("avg_time_to_stop"), // How fast losers hit stop
  
  // Confidence Calibration
  avgConfidenceScore: real("avg_confidence_score"),
  confidenceByBand: jsonb("confidence_by_band"), // { A: {count, winRate}, B+: {...}, ... }
  
  // Risk Metrics
  maxDrawdownPercent: real("max_drawdown_percent"),
  sharpeRatio: real("sharpe_ratio"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEngineDailyMetricsSchema = createInsertSchema(engineDailyMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEngineDailyMetrics = z.infer<typeof insertEngineDailyMetricsSchema>;
export type EngineDailyMetrics = typeof engineDailyMetrics.$inferSelect;

// Engine Health Alerts - Track when engines underperform
export const engineHealthAlerts = pgTable("engine_health_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  engine: text("engine").$type<EngineSource>().notNull(),
  alertType: text("alert_type").notNull(), // 'win_rate_drop', 'confidence_miscalibration', 'no_ideas', 'high_drawdown'
  severity: text("severity").notNull(), // 'info', 'warning', 'critical'
  
  message: text("message").notNull(),
  details: jsonb("details"), // Additional context
  
  // Resolution tracking
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: text("acknowledged_at"),
  resolved: boolean("resolved").default(false),
  resolvedAt: text("resolved_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEngineHealthAlertSchema = createInsertSchema(engineHealthAlerts).omit({ id: true, createdAt: true });
export type InsertEngineHealthAlert = z.infer<typeof insertEngineHealthAlertSchema>;
export type EngineHealthAlert = typeof engineHealthAlerts.$inferSelect;

// ============================================================================
// TRADE AUDIT TRAIL - Price Evidence & Outcome Verification
// ============================================================================

// Price Snapshot Event Type
export type PriceSnapshotEventType = 
  | 'idea_published'      // When trade idea was created
  | 'entry_window_open'   // Entry window started
  | 'entry_window_closed' // Entry window ended
  | 'validation_check'    // Periodic validation check
  | 'target_hit'          // Price reached target
  | 'stop_hit'            // Price hit stop loss
  | 'expired'             // Trade expired without hitting target/stop
  | 'manual_close';       // User manually closed

// Trade Price Snapshots - Capture market evidence at key moments
export const tradePriceSnapshots = pgTable("trade_price_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeIdeaId: varchar("trade_idea_id").notNull(), // Link to trade_ideas.id
  
  // Event info
  eventType: text("event_type").$type<PriceSnapshotEventType>().notNull(),
  eventTimestamp: text("event_timestamp").notNull(), // ISO timestamp
  
  // Price data captured at this moment
  currentPrice: real("current_price").notNull(), // Underlying or option price
  bidPrice: real("bid_price"), // For options
  askPrice: real("ask_price"), // For options
  lastPrice: real("last_price"), // Last traded price
  
  // Distance from targets
  distanceToTargetPercent: real("distance_to_target_percent"), // How far from target
  distanceToStopPercent: real("distance_to_stop_percent"), // How far from stop
  pnlAtSnapshot: real("pnl_at_snapshot"), // Unrealized P&L at this point
  
  // For options - track greeks if available
  deltaAtSnapshot: real("delta_at_snapshot"),
  ivAtSnapshot: real("iv_at_snapshot"),
  
  // Data source info
  dataSource: text("data_source"), // 'tradier', 'yahoo', 'coingecko'
  validatorVersion: text("validator_version"), // Version of validation code
  
  // Raw quote data for audit purposes
  rawQuoteData: jsonb("raw_quote_data"), // Full quote response
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTradePriceSnapshotSchema = createInsertSchema(tradePriceSnapshots).omit({ id: true, createdAt: true });
export type InsertTradePriceSnapshot = z.infer<typeof insertTradePriceSnapshotSchema>;
export type TradePriceSnapshot = typeof tradePriceSnapshots.$inferSelect;

// ============================================================================
// BLOG CMS - Content Marketing & SEO
// ============================================================================

export type BlogPostStatus = 'draft' | 'published' | 'archived';
export type BlogCategory = 'market-commentary' | 'platform-updates' | 'education' | 'risk-management' | 'strategy' | 'news';

export const blogPosts = pgTable("blog_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").unique().notNull(), // URL-friendly slug
  title: varchar("title").notNull(),
  excerpt: text("excerpt"), // Short description for SEO/previews
  content: text("content").notNull(), // Markdown content
  heroImageUrl: varchar("hero_image_url"),
  category: text("category").$type<BlogCategory>().notNull().default('market-commentary'),
  tags: text("tags").array(), // Array of tags
  authorId: varchar("author_id"), // Link to users table
  authorName: varchar("author_name").notNull().default('Trading Education Team'),
  status: text("status").$type<BlogPostStatus>().notNull().default('draft'),
  metaDescription: text("meta_description"), // SEO meta description
  metaKeywords: text("meta_keywords"), // SEO keywords
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type BlogPost = typeof blogPosts.$inferSelect;

// ============================================================================
// TESTIMONIALS - Social Proof
// ============================================================================

export const testimonials = pgTable("testimonials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  title: varchar("title"), // Job title/role
  company: varchar("company"),
  avatarUrl: varchar("avatar_url"),
  quote: text("quote").notNull(),
  rating: integer("rating").default(5), // 1-5 stars
  featured: boolean("featured").default(false),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTestimonialSchema = createInsertSchema(testimonials).omit({ id: true, createdAt: true });
export type InsertTestimonial = z.infer<typeof insertTestimonialSchema>;
export type Testimonial = typeof testimonials.$inferSelect;

// ============================================================================
// LOSS ANALYSIS - Post-Mortem Analysis of Failed Trades
// ============================================================================

// Loss Reason Categories
export type LossReasonCategory = 
  | 'market_reversal'      // Broad market turned against position
  | 'sector_weakness'      // Sector-specific headwind
  | 'bad_timing'           // Entry at wrong time (extended, exhaustion)
  | 'news_catalyst_failed' // Expected catalyst didn't materialize
  | 'stop_too_tight'       // Stop loss was too close to entry
  | 'overconfident_signal' // Engine gave high confidence but was wrong
  | 'low_volume_trap'      // Got trapped in illiquid name
  | 'gap_down_open'        // Overnight gap destroyed position
  | 'trend_exhaustion'     // Trend was already extended
  | 'fundamental_miss'     // Missed fundamental red flag
  | 'technical_breakdown'  // Key support/resistance failed
  | 'options_decay'        // Theta decay killed options position
  | 'volatility_crush'     // IV crush after event
  | 'correlation_blindspot'// Didn't account for correlated assets
  | 'unknown';             // Unable to determine cause

// Loss Severity
export type LossSeverity = 'minor' | 'moderate' | 'significant' | 'severe';

export const lossAnalysis = pgTable("loss_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tradeIdeaId: varchar("trade_idea_id").notNull(), // Reference to the failed trade
  
  // Trade Context at Time of Loss
  symbol: text("symbol").notNull(),
  engine: text("engine").notNull(), // ai, quant, flow, hybrid
  assetType: text("asset_type").notNull(), // stock, option, crypto
  direction: text("direction").notNull(), // long, short
  confidenceScore: real("confidence_score"), // What confidence was given
  probabilityBand: text("probability_band"), // A, B, C, D band
  
  // Loss Details
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price").notNull(),
  percentLoss: real("percent_loss").notNull(), // Negative number
  dollarLoss: real("dollar_loss"), // If position size known
  holdingTimeMinutes: integer("holding_time_minutes"),
  
  // Analysis Fields
  lossReason: text("loss_reason").$type<LossReasonCategory>().notNull().default('unknown'),
  severity: text("severity").$type<LossSeverity>().notNull().default('moderate'),
  
  // Context Factors
  marketConditionAtEntry: text("market_condition_at_entry"), // bullish, bearish, choppy
  vixLevelAtEntry: real("vix_level_at_entry"),
  sectorPerformance: text("sector_performance"), // sector was up/down
  timeOfDay: text("time_of_day"), // opening, mid-day, closing
  dayOfWeek: text("day_of_week"),
  
  // What Went Wrong
  whatWentWrong: text("what_went_wrong").notNull(), // Detailed explanation
  lessonsLearned: text("lessons_learned"), // What to do differently
  preventionStrategy: text("prevention_strategy"), // How to avoid in future
  
  // Pattern Detection
  isPatternMatch: boolean("is_pattern_match").default(false), // Matches a known failure pattern
  patternType: text("pattern_type"), // e.g., "extended_entry", "news_fade"
  similarLosses: text("similar_losses").array(), // IDs of similar past losses
  
  // AI Analysis (if available)
  aiAnalysis: text("ai_analysis"), // Claude's detailed post-mortem
  aiRecommendations: text("ai_recommendations").array(), // List of AI suggestions
  
  // Metadata
  analyzedAt: timestamp("analyzed_at").defaultNow(),
  analyzedBy: text("analyzed_by").default('system'), // 'system' or 'manual'
  reviewedByUser: boolean("reviewed_by_user").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLossAnalysisSchema = createInsertSchema(lossAnalysis).omit({ id: true, createdAt: true, analyzedAt: true });
export type InsertLossAnalysis = z.infer<typeof insertLossAnalysisSchema>;
export type LossAnalysis = typeof lossAnalysis.$inferSelect;
