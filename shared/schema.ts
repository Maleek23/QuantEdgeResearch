import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, boolean, timestamp, index, jsonb, doublePrecision } from "drizzle-orm/pg-core";
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

// Watchlist Category Types
export type WatchlistCategory = 'active' | 'annual_breakout' | 'options_watch' | 'swing_candidates' | 'archive';

// Conviction Level for Annual Watchlist
export type ConvictionLevel = 'high' | 'medium' | 'speculative';

// Watchlist
export const watchlist = pgTable("watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // nullable for backward compatibility
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull().$type<AssetType>(),
  targetPrice: real("target_price"),
  notes: text("notes"),
  addedAt: text("added_at").notNull(),
  
  // Category for organizing watchlist items
  category: text("category").$type<WatchlistCategory>().notNull().default('active'),
  
  // Annual Breakout Tracking Fields
  thesis: text("thesis"), // Investment thesis for long-term holds
  conviction: text("conviction").$type<ConvictionLevel>(), // high, medium, speculative
  sector: text("sector"), // Sector/industry focus
  startOfYearPrice: real("start_of_year_price"), // Price at Jan 1
  yearlyTargetPrice: real("yearly_target_price"), // Target price for the year (e.g., $70+)
  catalystNotes: text("catalyst_notes"), // Expected catalysts for the year
  reviewDate: text("review_date"), // Next scheduled review date
  currentPrice: real("current_price"), // Latest tracked price
  priceUpdatedAt: text("price_updated_at"), // When current_price was last updated
  ytdPerformance: real("ytd_performance"), // Year-to-date % gain/loss
  
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
  quantity: doublePrecision("quantity").notNull().default(1), // Number of contracts/shares (decimal for crypto)
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
  autoExecute: boolean("auto_execute").default(false), // Auto-execute Quant Edge Labs signals
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
  quantity: doublePrecision("quantity").notNull(), // Decimal for crypto fractional units
  entryTime: text("entry_time").notNull(),
  entryReason: text("entry_reason"), // Why the bot entered this trade
  entrySignals: text("entry_signals"), // JSON array of signals that triggered entry
  
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
  
  // Auto-follow settings
  autoFollowTrades: boolean("auto_follow_trades").default(false), // Auto-paper-trade their calls
  maxAutoTradeSize: real("max_auto_trade_size").default(100), // Max position size for auto-trades
  
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

// Signal Attribution Analytics - Tracks win/loss rates per indicator
export const signalPerformance = pgTable("signal_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  signalName: text("signal_name").notNull().unique(), // e.g., "RSI2_MEAN_REVERSION", "MACD_GOLDEN_CROSS"
  
  // Win/Loss Statistics
  totalTrades: integer("total_trades").notNull().default(0),
  winCount: integer("win_count").notNull().default(0),
  lossCount: integer("loss_count").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  
  // Performance Metrics
  winRate: real("win_rate").notNull().default(0), // 0-100 percentage
  avgWinPercent: real("avg_win_percent").notNull().default(0), // Average % gain on wins
  avgLossPercent: real("avg_loss_percent").notNull().default(0), // Average % loss on losses
  profitFactor: real("profit_factor").notNull().default(0), // Total wins / Total losses
  expectancy: real("expectancy").notNull().default(0), // Expected value per trade
  
  // By Asset Type
  stockWinRate: real("stock_win_rate").default(0),
  optionWinRate: real("option_win_rate").default(0),
  cryptoWinRate: real("crypto_win_rate").default(0),
  
  // Trend Data (last 30 trades)
  recentWinRate: real("recent_win_rate").default(0), // Win rate of most recent 30 trades
  trendDirection: text("trend_direction").$type<'improving' | 'declining' | 'stable'>().default('stable'),
  
  // Confidence Score (calculated)
  reliabilityScore: real("reliability_score").default(0), // 0-100, higher = more reliable signal
  sampleSizeGrade: text("sample_size_grade").$type<'A' | 'B' | 'C' | 'D' | 'F'>().default('F'), // Based on # of trades
  
  // Metadata
  lastCalculatedAt: timestamp("last_calculated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSignalPerformanceSchema = createInsertSchema(signalPerformance).omit({ id: true, createdAt: true, lastCalculatedAt: true });
export type InsertSignalPerformance = z.infer<typeof insertSignalPerformanceSchema>;
export type SignalPerformance = typeof signalPerformance.$inferSelect;

// Signal Performance by Time Period - For trend analysis
export interface SignalTrendData {
  signalName: string;
  period: 'day' | 'week' | 'month' | 'all_time';
  winRate: number;
  totalTrades: number;
  profitFactor: number;
}

// Auto Lotto Bot Preferences - Personalized trading strategy settings
export const autoLottoPreferences = pgTable("auto_lotto_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  
  // Risk Profile Settings
  riskTolerance: text("risk_tolerance").$type<'conservative' | 'moderate' | 'aggressive'>().notNull().default('moderate'),
  maxPositionSize: real("max_position_size").notNull().default(100), // Max $ per trade
  maxConcurrentTrades: integer("max_concurrent_trades").notNull().default(5),
  dailyLossLimit: real("daily_loss_limit").default(200), // Stop trading after this daily loss
  
  // Capital Allocation
  optionsAllocation: real("options_allocation").notNull().default(40), // % of capital for options
  futuresAllocation: real("futures_allocation").notNull().default(30), // % for futures
  cryptoAllocation: real("crypto_allocation").notNull().default(30), // % for crypto
  
  // Asset Type Preferences
  enableOptions: boolean("enable_options").notNull().default(true),
  enableFutures: boolean("enable_futures").notNull().default(true),
  enableCrypto: boolean("enable_crypto").notNull().default(true),
  enablePropFirm: boolean("enable_prop_firm").notNull().default(false),
  
  // Options Strategy Preferences
  optionsPreferredDte: integer("options_preferred_dte").notNull().default(7), // Days to expiration
  optionsMaxDte: integer("options_max_dte").notNull().default(14),
  optionsMinDelta: real("options_min_delta").notNull().default(0.20),
  optionsMaxDelta: real("options_max_delta").notNull().default(0.40),
  optionsPreferCalls: boolean("options_prefer_calls").notNull().default(true),
  optionsPreferPuts: boolean("options_prefer_puts").notNull().default(true),
  optionsPreferredSymbols: text("options_preferred_symbols").array(), // Specific tickers to watch
  
  // Futures Strategy Preferences
  futuresPreferredContracts: text("futures_preferred_contracts").array().default(sql`ARRAY['NQ', 'ES', 'GC']::text[]`),
  futuresMaxContracts: integer("futures_max_contracts").notNull().default(2),
  futuresStopPoints: integer("futures_stop_points").notNull().default(15), // Stop loss in points
  futuresTargetPoints: integer("futures_target_points").notNull().default(30), // Profit target in points
  
  // Crypto Strategy Preferences
  cryptoPreferredCoins: text("crypto_preferred_coins").array().default(sql`ARRAY['BTC', 'ETH', 'SOL']::text[]`),
  cryptoEnableMemeCoins: boolean("crypto_enable_meme_coins").notNull().default(false), // PEPE, BONK, DOGE
  cryptoMaxLeverageMultiplier: real("crypto_max_leverage_multiplier").notNull().default(1.0), // 1.0 = no leverage
  
  // Entry/Exit Rules
  minConfidenceScore: integer("min_confidence_score").notNull().default(70), // 0-100, minimum score to enter
  preferredHoldingPeriod: text("preferred_holding_period").$type<'day' | 'swing' | 'position'>().notNull().default('day'),
  minRiskRewardRatio: real("min_risk_reward_ratio").notNull().default(2.0), // Minimum R:R to take trade
  useDynamicExits: boolean("use_dynamic_exits").notNull().default(true), // Use trailing stops
  
  // Trading Session Preferences
  tradePreMarket: boolean("trade_pre_market").notNull().default(false),
  tradeRegularHours: boolean("trade_regular_hours").notNull().default(true),
  tradeAfterHours: boolean("trade_after_hours").notNull().default(false),
  preferredEntryWindows: text("preferred_entry_windows").array().default(sql`ARRAY['09:30-11:00', '14:00-15:30']::text[]`), // CT times
  
  // Notifications & Alerts
  enableDiscordAlerts: boolean("enable_discord_alerts").notNull().default(true),
  enableEmailAlerts: boolean("enable_email_alerts").notNull().default(false),
  alertOnEntry: boolean("alert_on_entry").notNull().default(true),
  alertOnExit: boolean("alert_on_exit").notNull().default(true),
  alertOnDailyLimit: boolean("alert_on_daily_limit").notNull().default(true),
  
  // Automation Level
  automationMode: text("automation_mode").$type<'full_auto' | 'signals_only' | 'paper_only'>().notNull().default('paper_only'),
  requireConfirmation: boolean("require_confirmation").notNull().default(true), // Require user confirmation before entry
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAutoLottoPreferencesSchema = createInsertSchema(autoLottoPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAutoLottoPreferences = z.infer<typeof insertAutoLottoPreferencesSchema>;
export type AutoLottoPreferences = typeof autoLottoPreferences.$inferSelect;

// Zod schema for frontend form validation with extended rules
export const autoLottoPreferencesFormSchema = insertAutoLottoPreferencesSchema.extend({
  maxPositionSize: z.coerce.number().min(10).max(1000),
  maxConcurrentTrades: z.coerce.number().min(1).max(20),
  dailyLossLimit: z.coerce.number().min(50).max(5000).optional(),
  optionsAllocation: z.coerce.number().min(0).max(100),
  futuresAllocation: z.coerce.number().min(0).max(100),
  cryptoAllocation: z.coerce.number().min(0).max(100),
  minConfidenceScore: z.coerce.number().min(50).max(95),
  minRiskRewardRatio: z.coerce.number().min(1.0).max(10.0),
  optionsMinDelta: z.coerce.number().min(0.05).max(0.50),
  optionsMaxDelta: z.coerce.number().min(0.10).max(0.60),
});

// ============================================================================
// PLATFORM REPORTS - Daily/Weekly/Monthly Analytics Reports
// ============================================================================

export type ReportPeriod = 'daily' | 'weekly' | 'monthly';
export type ReportStatus = 'generating' | 'completed' | 'failed';

export const platformReports = pgTable("platform_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  period: text("period").$type<ReportPeriod>().notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").$type<ReportStatus>().notNull().default('generating'),
  
  // Trade Idea Stats
  totalIdeasGenerated: integer("total_ideas_generated").default(0),
  aiIdeasGenerated: integer("ai_ideas_generated").default(0),
  quantIdeasGenerated: integer("quant_ideas_generated").default(0),
  hybridIdeasGenerated: integer("hybrid_ideas_generated").default(0),
  
  // Performance Metrics
  totalTradesResolved: integer("total_trades_resolved").default(0),
  totalWins: integer("total_wins").default(0),
  totalLosses: integer("total_losses").default(0),
  overallWinRate: real("overall_win_rate"),
  avgGainPercent: real("avg_gain_percent"),
  avgLossPercent: real("avg_loss_percent"),
  totalPnlPercent: real("total_pnl_percent"),
  
  // Engine-Specific Performance
  aiWinRate: real("ai_win_rate"),
  quantWinRate: real("quant_win_rate"),
  hybridWinRate: real("hybrid_win_rate"),
  bestPerformingEngine: text("best_performing_engine"),
  
  // Bot Activity Stats
  autoLottoTrades: integer("auto_lotto_trades").default(0),
  autoLottoPnl: real("auto_lotto_pnl").default(0),
  futuresBotTrades: integer("futures_bot_trades").default(0),
  futuresBotPnl: real("futures_bot_pnl").default(0),
  cryptoBotTrades: integer("crypto_bot_trades").default(0),
  cryptoBotPnl: real("crypto_bot_pnl").default(0),
  propFirmTrades: integer("prop_firm_trades").default(0),
  propFirmPnl: real("prop_firm_pnl").default(0),
  
  // Scanner Activity
  optionsFlowAlerts: integer("options_flow_alerts").default(0),
  marketScannerSymbolsTracked: integer("market_scanner_symbols_tracked").default(0),
  ctTrackerMentions: integer("ct_tracker_mentions").default(0),
  ctTrackerAutoTrades: integer("ct_tracker_auto_trades").default(0),
  
  // Asset Type Breakdown
  stockTradeCount: integer("stock_trade_count").default(0),
  optionsTradeCount: integer("options_trade_count").default(0),
  cryptoTradeCount: integer("crypto_trade_count").default(0),
  futuresTradeCount: integer("futures_trade_count").default(0),
  
  // Top Performers
  topWinningSymbols: jsonb("top_winning_symbols"),
  topLosingSymbols: jsonb("top_losing_symbols"),
  
  // User Engagement (optional)
  activeUsers: integer("active_users").default(0),
  newUsers: integer("new_users").default(0),
  
  // Full report data as JSON for detailed breakdown
  reportData: jsonb("report_data"),
  
  generatedBy: varchar("generated_by"),
  generatedAt: timestamp("generated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlatformReportSchema = createInsertSchema(platformReports).omit({ id: true, createdAt: true, generatedAt: true });
export type InsertPlatformReport = z.infer<typeof insertPlatformReportSchema>;
export type PlatformReport = typeof platformReports.$inferSelect;

// ==========================================
// SEC FILINGS & GOVERNMENT CONTRACTS
// Catalyst Intelligence System
// ==========================================

// SEC Filing Types
export type SECFilingType = '8-K' | '10-K' | '10-Q' | '13F' | 'Form4' | 'S-1' | 'DEF14A' | 'other';
export type FilingSentiment = 'bullish' | 'bearish' | 'neutral' | 'mixed';
export type CatalystEventType = 'sec_filing' | 'gov_contract' | 'earnings' | 'insider_trade' | 'acquisition' | 'product_launch';

// SEC Filings - Track SEC EDGAR filings
export const secFilings = pgTable("sec_filings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Filing Identification
  accessionNumber: varchar("accession_number").unique().notNull(), // SEC unique ID
  cik: varchar("cik").notNull(), // Company CIK number
  ticker: varchar("ticker"), // Stock ticker if mapped
  companyName: text("company_name").notNull(),
  
  // Filing Details
  filingType: text("filing_type").$type<SECFilingType>().notNull(),
  filingDate: text("filing_date").notNull(), // When filed with SEC
  acceptanceDate: text("acceptance_date"), // When SEC accepted
  
  // Content
  filingUrl: text("filing_url").notNull(), // Link to SEC EDGAR
  documentCount: integer("document_count").default(1),
  
  // Parsed Analysis
  extractedSummary: text("extracted_summary"), // AI-extracted key points
  sentiment: text("sentiment").$type<FilingSentiment>().default('neutral'),
  sentimentScore: real("sentiment_score").default(0), // -100 to +100
  catalystTags: text("catalyst_tags").array(), // ['acquisition', 'revenue_growth', 'executive_change']
  
  // Key Data Points (extracted)
  revenueChange: real("revenue_change"), // % change if financial filing
  epsChange: real("eps_change"),
  guidanceDirection: text("guidance_direction"), // 'raised', 'lowered', 'maintained', 'withdrawn'
  insiderShares: integer("insider_shares"), // For Form 4
  insiderValue: real("insider_value"), // Dollar value of insider transaction
  insiderDirection: text("insider_direction"), // 'buy', 'sell', 'gift'
  
  // Processing Status
  parsedAt: timestamp("parsed_at"),
  isProcessed: boolean("is_processed").default(false),
  processingError: text("processing_error"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSecFilingSchema = createInsertSchema(secFilings).omit({ id: true, createdAt: true });
export type InsertSecFiling = z.infer<typeof insertSecFilingSchema>;
export type SecFiling = typeof secFilings.$inferSelect;

// SEC Filing Signals - Individual signals extracted from filings
export const secFilingSignals = pgTable("sec_filing_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filingId: varchar("filing_id").notNull(), // References secFilings.id
  
  signalType: text("signal_type").notNull(), // 'insider_buy_large', 'revenue_beat', 'acquisition_announced', etc.
  polarity: text("polarity").notNull().$type<'bullish' | 'bearish' | 'neutral'>(),
  confidence: real("confidence").notNull().default(0.5), // 0-1
  weight: real("weight").notNull().default(1), // Scoring weight
  
  rawContext: text("raw_context"), // The text snippet that triggered this signal
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSecFilingSignalSchema = createInsertSchema(secFilingSignals).omit({ id: true, createdAt: true });
export type InsertSecFilingSignal = z.infer<typeof insertSecFilingSignalSchema>;
export type SecFilingSignal = typeof secFilingSignals.$inferSelect;

// Government Contracts - Track USASpending.gov contract awards
export const governmentContracts = pgTable("government_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Contract Identification
  awardId: varchar("award_id").unique().notNull(), // USASpending unique ID
  piid: varchar("piid"), // Procurement Instrument ID
  
  // Recipient
  recipientName: text("recipient_name").notNull(),
  recipientTicker: varchar("recipient_ticker"), // Stock ticker if public company
  recipientDuns: varchar("recipient_duns"), // DUNS number
  
  // Agency
  awardingAgencyName: text("awarding_agency_name").notNull(),
  awardingAgencyCode: varchar("awarding_agency_code"),
  fundingAgencyName: text("funding_agency_name"),
  
  // Contract Details
  description: text("description"),
  contractType: text("contract_type"), // 'fixed_price', 'cost_plus', 'time_materials'
  naicsCode: varchar("naics_code"), // Industry classification
  naicsDescription: text("naics_description"),
  
  // Financial
  obligationAmount: real("obligation_amount").notNull(), // Current obligation
  totalOutlayAmount: real("total_outlay_amount"), // Total spent
  baseAndExercisedOptionsValue: real("base_exercised_value"), // Potential value
  
  // Dates
  awardDate: text("award_date").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  
  // Classification
  isDefense: boolean("is_defense").default(false),
  isHealthcare: boolean("is_healthcare").default(false),
  isTechnology: boolean("is_technology").default(false),
  
  // Scoring
  significanceScore: real("significance_score").default(0), // 0-100 based on size/company
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGovernmentContractSchema = createInsertSchema(governmentContracts).omit({ id: true, createdAt: true });
export type InsertGovernmentContract = z.infer<typeof insertGovernmentContractSchema>;
export type GovernmentContract = typeof governmentContracts.$inferSelect;

// Catalyst Events - Unified view of all catalysts for trading signals
export const catalystEvents = pgTable("catalyst_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Symbol mapping
  ticker: varchar("ticker").notNull(),
  companyName: text("company_name"),
  
  // Event Type
  eventType: text("event_type").$type<CatalystEventType>().notNull(),
  sourceId: varchar("source_id"), // References secFilings.id or governmentContracts.id
  sourceTable: text("source_table"), // 'sec_filings' | 'government_contracts'
  
  // Event Details
  title: text("title").notNull(),
  summary: text("summary"),
  eventDate: text("event_date").notNull(),
  
  // Scoring for Multi-Factor Analysis
  signalStrength: real("signal_strength").notNull().default(0), // 0-100
  polarity: text("polarity").notNull().$type<'bullish' | 'bearish' | 'neutral'>(),
  confidence: real("confidence").notNull().default(0.5), // 0-1
  
  // Relevance Decay
  expiresAt: text("expires_at"), // When this catalyst becomes stale
  isActive: boolean("is_active").default(true),
  
  // Trade Integration
  wasUsedInTrade: boolean("was_used_in_trade").default(false),
  tradeIdeaId: varchar("trade_idea_id"), // If this catalyst triggered a trade
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCatalystEventSchema = createInsertSchema(catalystEvents).omit({ id: true, createdAt: true });
export type InsertCatalystEvent = z.infer<typeof insertCatalystEventSchema>;
export type CatalystEvent = typeof catalystEvents.$inferSelect;

// Symbol Catalyst Snapshots - Cached catalyst summary per symbol for fast lookups
export const symbolCatalystSnapshots = pgTable("symbol_catalyst_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  ticker: varchar("ticker").unique().notNull(),
  
  // Aggregate Scores
  bullishCatalystCount: integer("bullish_catalyst_count").default(0),
  bearishCatalystCount: integer("bearish_catalyst_count").default(0),
  neutralCatalystCount: integer("neutral_catalyst_count").default(0),
  
  aggregateCatalystScore: real("aggregate_catalyst_score").default(0), // Net score -100 to +100
  
  // Recent Events Summary
  recentCatalysts: jsonb("recent_catalysts"), // Array of recent catalyst summaries
  
  // Last SEC Filing
  lastSecFilingDate: text("last_sec_filing_date"),
  lastSecFilingType: text("last_sec_filing_type"),
  
  // Last Government Contract
  lastGovContractDate: text("last_gov_contract_date"),
  lastGovContractValue: real("last_gov_contract_value"),
  
  // Cache Management
  lastUpdated: timestamp("last_updated").defaultNow(),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSymbolCatalystSnapshotSchema = createInsertSchema(symbolCatalystSnapshots).omit({ id: true, createdAt: true, lastUpdated: true });
export type InsertSymbolCatalystSnapshot = z.infer<typeof insertSymbolCatalystSnapshotSchema>;
export type SymbolCatalystSnapshot = typeof symbolCatalystSnapshots.$inferSelect;

// ============================================================================
// USER ANALYTICS & TRACKING
// ============================================================================

// User Login History - Track login events
export const userLoginHistory = pgTable("user_login_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  
  // Login details
  loginAt: timestamp("login_at").defaultNow(),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  
  // Parsed user agent info
  browser: varchar("browser"),
  os: varchar("os"),
  device: varchar("device"), // 'desktop', 'mobile', 'tablet'
  
  // Session info
  sessionId: varchar("session_id"),
  logoutAt: timestamp("logout_at"),
  
  // Auth method
  authMethod: varchar("auth_method"), // 'password', 'google', 'replit'
  
  // Location (if available from IP)
  country: varchar("country"),
  city: varchar("city"),
});

export const insertUserLoginHistorySchema = createInsertSchema(userLoginHistory).omit({ id: true, loginAt: true });
export type InsertUserLoginHistory = z.infer<typeof insertUserLoginHistorySchema>;
export type UserLoginHistory = typeof userLoginHistory.$inferSelect;

// Page Views - Track page visits
export const pageViews = pgTable("page_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User info (nullable for anonymous)
  userId: varchar("user_id"),
  sessionId: varchar("session_id"),
  
  // Page info
  path: varchar("path").notNull(),
  referrer: text("referrer"),
  
  // Timing
  viewedAt: timestamp("viewed_at").defaultNow(),
  timeOnPage: integer("time_on_page"), // seconds spent on page
  
  // Device info
  userAgent: text("user_agent"),
  device: varchar("device"),
  browser: varchar("browser"),
  
  // UTM tracking
  utmSource: varchar("utm_source"),
  utmMedium: varchar("utm_medium"),
  utmCampaign: varchar("utm_campaign"),
});

export const insertPageViewSchema = createInsertSchema(pageViews).omit({ id: true, viewedAt: true });
export type InsertPageView = z.infer<typeof insertPageViewSchema>;
export type PageView = typeof pageViews.$inferSelect;

// User Activity Events - Track feature usage
export type UserActivityType = 
  | 'view_trade_idea' 
  | 'generate_idea' 
  | 'view_chart' 
  | 'export_pdf' 
  | 'add_to_watchlist' 
  | 'journal_entry' 
  | 'run_scanner'
  | 'view_performance'
  | 'settings_change'
  | 'subscription_action';

export const userActivityEvents = pgTable("user_activity_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  userId: varchar("user_id").notNull(),
  sessionId: varchar("session_id"),
  
  // Activity details
  activityType: varchar("activity_type").notNull().$type<UserActivityType>(),
  description: text("description"),
  
  // Context data (flexible JSON for different activity types)
  metadata: jsonb("metadata"), // { symbol: 'AAPL', ideaId: '123', etc. }
  
  // Timing
  occurredAt: timestamp("occurred_at").defaultNow(),
  
  // Device info
  device: varchar("device"),
});

export const insertUserActivityEventSchema = createInsertSchema(userActivityEvents).omit({ id: true, occurredAt: true });
export type InsertUserActivityEvent = z.infer<typeof insertUserActivityEventSchema>;
export type UserActivityEvent = typeof userActivityEvents.$inferSelect;

// User Analytics Summary - Aggregated daily stats per user
export const userAnalyticsSummary = pgTable("user_analytics_summary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  userId: varchar("user_id").notNull(),
  date: varchar("date").notNull(), // YYYY-MM-DD format
  
  // Session stats
  totalSessions: integer("total_sessions").default(0),
  totalTimeSeconds: integer("total_time_seconds").default(0),
  
  // Page stats
  pageViews: integer("page_views").default(0),
  uniquePages: integer("unique_pages").default(0),
  
  // Feature usage
  ideasViewed: integer("ideas_viewed").default(0),
  ideasGenerated: integer("ideas_generated").default(0),
  chartsViewed: integer("charts_viewed").default(0),
  pdfsExported: integer("pdfs_exported").default(0),
  journalEntries: integer("journal_entries").default(0),
  scannersRun: integer("scanners_run").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserAnalyticsSummarySchema = createInsertSchema(userAnalyticsSummary).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUserAnalyticsSummary = z.infer<typeof insertUserAnalyticsSummarySchema>;
export type UserAnalyticsSummary = typeof userAnalyticsSummary.$inferSelect;
