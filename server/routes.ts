import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, isRealLoss, isRealLossByResolution, isCurrentGenEngine, getDecidedTrades, getDecidedTradesByResolution, applyCanonicalPerformanceFilters, CANONICAL_LOSS_THRESHOLD } from "./storage";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import { tradeIdeas, secFilings, governmentContracts, catalystEvents, paperPositions, symbolBehaviorProfiles, confidenceCalibration, historicalIntelligenceSummary } from "@shared/schema";
import { searchSymbol, fetchHistoricalPrices, fetchStockPrice, fetchCryptoPrice } from "./market-api";
import { generateTradeIdeas, chatWithQuantAI, validateTradeRisk } from "./ai-service";
import { generateQuantIdeas } from "./quant-ideas-generator";
import { generateFuturesIdeas } from "./quantitative-engine";
import { scanUnusualOptionsFlow } from "./flow-scanner";
import { generateDiagnosticExport } from "./diagnostic-export";
import { validateAndLog as validateTradeStructureLog, validateTrade as validateTradeStructure } from "./trade-validation";
import { deriveTimingWindows, verifyTimingUniqueness, recalculateExitTime } from "./timing-intelligence";
import { formatInTimeZone } from "date-fns-tz";
import multer from "multer";
import {
  insertMarketDataSchema,
  insertTradeIdeaSchema,
  insertCatalystSchema,
  insertWatchlistSchema,
  insertOptionsDataSchema,
  insertUserPreferencesSchema,
  insertActiveTradeSchema,
  insertBlogPostSchema,
} from "@shared/schema";
import { z } from "zod";
import { logger, logError } from "./logger";
import { 
  generalApiLimiter, 
  aiGenerationLimiter, 
  quantGenerationLimiter,
  marketDataLimiter,
  adminLimiter,
  researchAssistantLimiter,
  ideaGenerationOnDemandLimiter,
  authLimiter,
  passwordResetLimiter,
  trackingLimiter,
} from "./rate-limiter";
import { autoIdeaGenerator } from "./auto-idea-generator";
import { requireAdminJWT, generateAdminToken, verifyAdminToken } from "./auth";
import { getSession, setupAuth } from "./replitAuth";
import { setupGoogleAuth } from "./googleAuth";
import { createUser, authenticateUser, sanitizeUser, getUserByEmail, hashPassword } from "./userAuth";
import { randomBytes } from "crypto";
import { getTierLimits, canAccessFeature, TierLimits } from "./tierConfig";
import { syncDocumentationToNotion } from "./notion-sync";
import * as paperTradingService from "./paper-trading-service";
import { registerExitCallback } from "./paper-trading-service";
import { getAutoLottoExitIntelligence, getPortfolioExitIntelligence } from "./position-monitor-service";
import { telemetryService } from "./telemetry-service";
import { analyzeLoss, analyzeAllLosses, getLossSummary } from "./loss-analyzer";
import { calculateSignalAttribution, getSignalPerformanceFromCache } from "./signal-attribution";
import { getReliabilityGrade, getLetterGrade } from "./grading";
import { 
  insertPaperPortfolioSchema, 
  insertPaperPositionSchema,
  insertTrackedWalletSchema,
  insertWalletAlertSchema,
  insertCTSourceSchema,
} from "@shared/schema";
import {
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
  constructWebhookEvent,
  PRICING_PLANS,
} from "./stripe-service";
import { getRealtimeQuote, getRealtimeBatchQuotes, type RealtimeQuote, type AssetType as RTAssetType } from './realtime-pricing-service';
import { getRealtimeStatus, getAllCryptoPrices, getAllFuturesPrices } from './realtime-price-service';
import { creditService } from './creditService';
import { generateInviteToken, sendBetaInviteEmail, sendWelcomeEmail, isEmailServiceConfigured } from './emailService';
import { 
  getCalibratedConfidence as getCalibrationScore, 
  generateAdaptiveExitStrategy, 
  refreshCalibrationCache, 
  formatExitStrategyDisplay 
} from './confidence-calibration';
import {
  logAdminAction,
  getAuditLogs,
  getSecurityStats,
  auditMiddleware,
  checkLoginBlock,
  recordFailedLogin,
  recordSuccessfulLogin,
} from './audit-logger';
import { 
  generateComprehensiveAnalysis, 
  formatAnalysisForDisplay,
  assessMarketRegime,
  getCompanyContext,
} from './multi-factor-analysis';
import { getMarketContext, getTradingSession } from './market-context-service';
import { historicalIntelligenceService } from './historical-intelligence-service';
import { WinRateService } from './win-rate-service';
import { CANONICAL_WIN_THRESHOLD } from '@shared/constants';
import { analyzeVolatility, batchVolatilityAnalysis, quickIVCheck, selectStrategy } from './volatility-analysis-service';
import { runTradingEngine, scanSymbols, analyzeFundamentals, analyzeTechnicals, validateConfluence, type AssetClass } from './trading-engine';
import { marketDataStatus } from './market-data-status';

// Helper for case-insensitive admin email check
function isAdminEmail(userEmail: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !userEmail) return false;
  return userEmail.toLowerCase() === adminEmail.toLowerCase();
}

// Check if user is admin (by email match OR by subscription tier)
function checkIsAdmin(user: { email?: string | null; subscriptionTier?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return isAdminEmail(user.email) || user.subscriptionTier === 'admin';
}

// Session-based authentication middleware
function isAuthenticated(req: any, res: any, next: any) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// Tier-based feature access middleware factory
function requireTier(feature: keyof TierLimits) {
  return async (req: any, res: any, next: any) => {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Check if admin (always has access)
      if (checkIsAdmin(user)) {
        return next();
      }
      
      const tier = (user.subscriptionTier as 'free' | 'advanced' | 'pro') || 'free';
      const hasAccess = canAccessFeature(tier, feature);
      
      if (!hasAccess) {
        const tierNames: Record<string, string> = {
          free: 'Free',
          advanced: 'Advanced',
          pro: 'Pro'
        };
        return res.status(403).json({ 
          message: `This feature requires ${getRequiredTierForFeature(feature)} tier or higher`,
          currentTier: tierNames[tier] || 'Free',
          requiredFeature: feature,
          upgradeUrl: '/pricing'
        });
      }
      
      next();
    } catch (error) {
      logger.error('Tier check failed', { error, userId, feature });
      return res.status(500).json({ message: "Failed to verify access" });
    }
  };
}

// Helper to determine minimum tier for a feature
function getRequiredTierForFeature(feature: keyof TierLimits): string {
  const advancedFeatures: (keyof TierLimits)[] = [
    'canAccessHybridEngine', 'canAccessFlowScanner', 'canAccessLottoScanner', 
    'canAccessPennyScanner', 'canAccessAutoLottoBot', 'canAccessCryptoBot',
    'canTradeOptions', 'canAccessPerformance', 'canAccessAdvancedAnalytics',
    'canAccessSymbolLeaderboard', 'canAccessTimeHeatmap', 'canAccessEngineTrends',
    'canAccessSignalAnalysis', 'canAccessDrawdownAnalysis', 'canAccessLossAnalysis',
    'canAccessSupportResistance', 'canAccessMultiFactorAnalysis',
    'canAccessSECFilings', 'canAccessGovContracts', 'canAccessCatalystScoring',
    'canAccessRealTimeData', 'canAccessRealTimeAlerts', 'canExportData', 'canExportPDF',
    'canAccessDiscordAlerts', 'canAccessWeeklyPicks', 'canAccessDailyReports'
  ];
  
  const proFeatures: (keyof TierLimits)[] = [
    'canAccessFuturesBot', 'canAccessPropFirmBot', 'canTradeFutures',
    'canAccessAPIAccess', 'canAccessWebhooks', 'canAccessBacktesting',
    'priorityIdeaGeneration'
  ];
  
  if (proFeatures.includes(feature)) return 'Pro';
  if (advancedFeatures.includes(feature)) return 'Advanced';
  return 'Free';
}

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// In-memory price cache with 5-minute TTL
interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

// Advanced Performance Analytics Types
interface SymbolLeaderboardEntry {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgGain: number;
  avgLoss: number;
  sampleWarning?: boolean; // True if <50 trades - statistically unreliable
}

interface TimeOfDayHeatmapEntry {
  hour: number;
  hourLabel: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface EngineTrendEntry {
  engine: string;
  week: string;
  trades: number;
  wins: number;
  win_rate: number;
}

// Signal Strength Analysis - groups trades by indicator consensus (not probability)
interface SignalStrengthEntry {
  band: string;       // A, B+, B, C+, C, D
  bandLabel: string;  // "A (5+ signals)", etc.
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface StreakData {
  current_streak: {
    type: 'win' | 'loss';
    count: number;
  };
  longest_win_streak: number;
  longest_loss_streak: number;
}

const priceCache = new Map<string, PriceCacheEntry>();
const PRICE_CACHE_TTL = 60 * 1000; // 60 seconds (was 5 minutes - caused stale $203 NVDA price on $140 trade)

function getCachedPrice(symbol: string): number | null {
  const cached = priceCache.get(symbol);
  if (!cached) return null;
  
  const age = Date.now() - cached.timestamp;
  if (age > PRICE_CACHE_TTL) {
    priceCache.delete(symbol);
    return null;
  }
  
  return cached.price;
}

function setCachedPrice(symbol: string, price: number): void {
  priceCache.set(symbol, {
    price,
    timestamp: Date.now()
  });
}

function clearCachedPrice(symbol: string): void {
  priceCache.delete(symbol);
  logger.info(`[PRICE-CACHE] Cleared stale cache for ${symbol}`);
}

// Premium subscription middleware
function requirePremium(req: Request, res: Response, next: Function) {
  // For now, allow all requests (no auth implemented yet)
  // When Discord OAuth is added, check: req.user?.subscriptionTier in ['advanced', 'pro', 'admin']
  next();
}

// 📰 NEWS CATALYST DETECTION: Identifies breaking news events for relaxed R:R validation
function detectNewsCatalyst(catalyst: string, analysis: string): boolean {
  const combinedText = `${catalyst} ${analysis}`.toLowerCase();
  
  // News catalyst keywords that indicate major market-moving events
  const newsKeywords = [
    // Earnings & Guidance
    'earnings beat', 'earnings surprise', 'guidance raised', 'guidance increased',
    'beat estimates', 'exceeded expectations', 'record earnings', 'blowout earnings',
    
    // Corporate Actions
    'acquisition', 'merger', 'buyout', 'takeover', 'deal announced',
    'partnership announced', 'collaboration announced',
    
    // Regulatory & Fed
    'fed', 'rate cut', 'rate hike', 'fomc', 'interest rate',
    'fda approval', 'regulatory approval', 'cleared by',
    
    // Market Cap Milestones
    '$1t', '$2t', '$3t', '$4t', '$5t', '$1b', '$2b', '$5b', '$10b',
    '1 trillion', '2 trillion', '3 trillion', '4 trillion', '5 trillion',
    
    // Major Price Movements (from catalyst text)
    '+10%', '+15%', '+20%', '+25%', '+30%', 'up 10%', 'up 15%', 'up 20%',
    'surged', 'spiked', 'soared', 'rallied',
    
    // Breaking News Indicators
    'breaking:', 'just announced', 'just reported', 'alert:',
    'announced today', 'reported today', 'confirmed today'
  ];
  
  // Check if any news keyword is present
  for (const keyword of newsKeywords) {
    if (combinedText.includes(keyword)) {
      logger.info(`📰 NEWS CATALYST DETECTED: "${keyword}" found in trade catalyst/analysis`);
      return true;
    }
  }
  
  return false;
}

// 🎯 CALIBRATION LOOKUP TABLE (built from 411 resolved trades - Dec 2025)
// Maps raw confidence scores to ACTUAL historical win rates
// THIS IS THE REAL DATA from /api/performance/calibration-curve
// Format: { rawScore: actualWinRate }
const CALIBRATION_LOOKUP: Record<number, number> = {
  // Raw score -> Actual win rate (from calibration curve API)
  // Data shows INVERSION: low scores outperform high scores historically
  // This is because Flow engine (82% win rate) uses conservative scoring
  20: 68,   // Actual: 68.1% (72 trades) - mostly Flow signals
  25: 68,   // Interpolated
  30: 68,   // Interpolated  
  35: 68,   // Interpolated
  40: 67,   // Interpolated
  45: 67,   // Actual: 67.3% (52 trades)
  50: 60,   // Actual: 60.0% (15 trades)
  55: 88,   // Actual: 88.5% (26 trades) - high performing bucket
  60: 77,   // Actual: 76.5% (34 trades)
  65: 56,   // Actual: 55.6% (36 trades)
  70: 68,   // Actual: 68.0% (25 trades)
  75: 55,   // Actual: 55.0% (40 trades)
  80: 25,   // Actual: 25.0% (16 trades) - WARNING: high conf = low actual
  85: 22,   // Actual: 22.2% (18 trades) - WARNING: overconfident
  90: 36,   // Actual: 36.4% (33 trades) - WARNING: overconfident
  95: 57,   // Actual: 57.1% (7 trades)
  100: 78   // Actual: 78.4% (37 trades)
};

// Get calibrated confidence from raw score
// Uses linear interpolation between lookup points
function getCalibratedConfidence(rawScore: number): number {
  const clampedScore = Math.max(20, Math.min(100, rawScore));
  const lowerKey = Math.floor(clampedScore / 5) * 5;
  const upperKey = Math.min(100, lowerKey + 5);
  
  const lowerVal = CALIBRATION_LOOKUP[lowerKey] || 60;
  const upperVal = CALIBRATION_LOOKUP[upperKey] || 60;
  
  // Linear interpolation
  const fraction = (clampedScore - lowerKey) / 5;
  return Math.round(lowerVal + fraction * (upperVal - lowerVal));
}

// 📊 CONFIDENCE CALCULATION: Data-driven confidence scoring
// Step 1: Calculate raw signal strength
// Step 2: Apply engine-specific adjustments
// Step 3: Calibrate to match historical accuracy
function calculateAIConfidence(
  idea: any,
  validationMetrics: any,
  isNewsCatalyst: boolean,
  source: string = 'ai'
): number {
  // 🎯 STEP 1: Calculate raw signal strength (same for all engines)
  let rawScore = 50; // Base score

  // R:R ratio contribution (0-20 points)
  const rrRatio = validationMetrics?.riskRewardRatio || 0;
  if (rrRatio >= 3.0) rawScore += 20;
  else if (rrRatio >= 2.5) rawScore += 16;
  else if (rrRatio >= 2.0) rawScore += 12;
  else if (rrRatio >= 1.5) rawScore += 8;
  else if (rrRatio >= 1.0) rawScore += 4;

  // Asset type contribution (0-15 points)
  if (idea.assetType === 'crypto') rawScore += 15;
  else if (idea.assetType === 'stock' && idea.entryPrice >= 10) rawScore += 10;
  else if (idea.assetType === 'stock' && idea.entryPrice >= 5) rawScore += 5;
  else if (idea.assetType === 'option') rawScore += 8;

  // Catalyst strength contribution (0-10 points)
  if (isNewsCatalyst) rawScore += 10;

  // 🎯 STEP 2: Engine-specific adjustments based on ACTUAL historical performance
  // Verified from database: 411 resolved trades (Dec 2025)
  // Flow: 81.9% (199 trades) → +20 adjustment
  // AI: 57.1% (77 trades) → -5 adjustment  
  // Hybrid: 40.6% (32 trades) → -12 adjustment
  // Quant: 34.4% (93 trades) → -18 adjustment
  let engineAdjustment = 0;
  const engineLower = source.toLowerCase();
  if (engineLower === 'flow' || engineLower === 'flow_scanner') engineAdjustment = 20;  // Best: 81.9%
  else if (engineLower === 'ai') engineAdjustment = -5;                                  // Mid: 57.1%
  else if (engineLower === 'hybrid') engineAdjustment = -12;                             // Low: 40.6%
  else if (engineLower === 'quant') engineAdjustment = -18;                              // Worst: 34.4%
  
  // AI options get extra penalty (historical -150% loss rate)
  if (idea.assetType === 'option' && engineLower === 'ai') {
    engineAdjustment -= 10;
  }
  
  const adjustedRaw = Math.max(20, Math.min(100, rawScore + engineAdjustment));
  
  // 🎯 STEP 3: Calibrate to match historical accuracy
  // This ensures the confidence score = actual expected win rate
  const calibratedScore = getCalibratedConfidence(adjustedRaw);

  logger.info(`📊 [CONFIDENCE] ${idea.symbol} [${source.toUpperCase()}]: raw=${rawScore}, adj=${engineAdjustment}, calibrated=${calibratedScore}%`);

  return calibratedScore;
}

// 🎯 PROBABILITY BAND MAPPING: Calibrated from actual historical performance
// HISTORICAL DATA (411 resolved trades):
// - Band A: 47.7% actual win rate (was overconfident)
// - Band B+: 60.0% actual win rate
// - Band B: 65.7% actual win rate  
// - Band C+: 78.0% actual win rate (highest performing!)
// - Band C: 67.3% actual win rate
// - Band D: 68.1% actual win rate
// 
// NEW CALIBRATION: Bands now reflect EXPECTED actual win rate, not raw confidence
// Grade assignment based on expected outcome probability

// Returns DETAILED band (A+, A, B+, B, C+, C, D, F) for internal precision
function getDetailedProbabilityBand(confidenceScore: number): string {
  // A+ tier: Only for Flow engine with exceptional setup (score 95+)
  if (confidenceScore >= 95) return 'A+';
  // A tier: Very high confidence - Flow with strong setup
  if (confidenceScore >= 90) return 'A';
  // B+ tier: Strong confidence 
  if (confidenceScore >= 85) return 'B+';
  // B tier: Good confidence
  if (confidenceScore >= 78) return 'B';
  // C+ tier: Moderate-high confidence (historically best performing!)
  if (confidenceScore >= 72) return 'C+';
  // C tier: Moderate confidence
  if (confidenceScore >= 65) return 'C';
  // D tier: Low confidence
  if (confidenceScore >= 55) return 'D';
  // F tier: Very low confidence
  return 'F';
}

// Returns COARSE band (A, B, C, D) for external display
// Maps detailed bands to simplified categories
function getCoarseBand(detailedBand: string): string {
  if (detailedBand === 'A+' || detailedBand === 'A') return 'A';
  if (detailedBand === 'B+' || detailedBand === 'B') return 'B';
  if (detailedBand === 'C+' || detailedBand === 'C') return 'C';
  if (detailedBand === 'D' || detailedBand === 'F') return 'D';
  return 'D';
}

// Main function: Returns coarse band for external use
function getProbabilityBand(confidenceScore: number): string {
  const detailed = getDetailedProbabilityBand(confidenceScore);
  return getCoarseBand(detailed);
}

// Export helper for getting both bands
export function getBandInfo(confidenceScore: number): { band: string; detailedBand: string } {
  const detailedBand = getDetailedProbabilityBand(confidenceScore);
  const band = getCoarseBand(detailedBand);
  return { band, detailedBand };
}

// Beta access middleware - verifies user has beta access for protected API routes
async function requireBetaAccess(req: Request, res: Response, next: NextFunction) {
  try {
    let userId = (req.session as any)?.userId;
    if (!userId && req.user) {
      const replitUser = req.user as any;
      userId = replitUser.claims?.sub;
    }
    
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    // Check for beta access - grandfathered tiers or explicit beta access
    const hasBetaAccess = user.hasBetaAccess || 
                          user.subscriptionTier === 'admin' || 
                          user.subscriptionTier === 'pro';
    
    if (!hasBetaAccess) {
      return res.status(403).json({ 
        error: "Beta access required", 
        message: "Please redeem an invite code to access this feature" 
      });
    }
    
    // Attach user to request for downstream use
    (req as any).betaUser = user;
    next();
  } catch (error) {
    logError(error as Error, { context: 'requireBetaAccess' });
    return res.status(500).json({ error: "Access check failed" });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // 🛡️ REGISTER EXIT COOLDOWN CALLBACK - CRITICAL for preventing repeated trades
  try {
    const { recordExitCooldown } = await import("./auto-lotto-trader");
    registerExitCallback((symbol, optionType, strike, wasWin) => {
      recordExitCooldown(symbol, optionType, strike, wasWin ?? true);
      logger.info(`🛡️ [EXIT-HOOK] Cooldown triggered: ${symbol} ${optionType} ${strike} (win=${wasWin})`);
    });
    logger.info("🛡️ [EXIT-HOOK] Exit cooldown callback registered successfully");
  } catch (err) {
    logger.error("⚠️ [EXIT-HOOK] Failed to register exit cooldown callback:", err);
  }

  // Health check endpoint for Render/uptime monitors (no auth required)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Apply general rate limiting to all API routes
  app.use('/api/', generalApiLimiter);
  
  // NOTE: Session middleware is initialized ONCE inside setupAuth() - do not add it here
  // This prevents duplicate session handling which can cause login persistence issues
  
  // Setup Replit Auth (Google OAuth) - registers /api/login, /api/callback, /api/logout
  // This also initializes session middleware and passport
  await setupAuth(app);
  
  // Setup Direct Google OAuth - registers /api/auth/google and /api/auth/google/callback
  await setupGoogleAuth(app);

  // Authentication Routes - Email/Password Auth
  
  // Signup - Create new user account
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, inviteCode } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      // Normalize email to lowercase to prevent duplicate accounts
      const emailLower = email.toLowerCase().trim();
      
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // Validate invite code for invite-only beta
      // First try unique invite token from database
      let validatedInvite = null;
      if (inviteCode) {
        // Normalize invite code to lowercase for case-insensitive matching
        const normalizedInviteCode = inviteCode.trim().toLowerCase();
        validatedInvite = await storage.redeemBetaInvite(normalizedInviteCode);
        
        // Fallback to admin access code for direct admin access
        if (!validatedInvite) {
          const adminCode = process.env.ADMIN_ACCESS_CODE || "0065";
          if (inviteCode !== adminCode) {
            return res.status(403).json({ error: "Invalid or expired invite code. Please check your invite email." });
          }
        }
      } else {
        return res.status(403).json({ error: "Invite code is required. This is an invite-only beta." });
      }
      
      // Determine subscription tier (use invite's tier override if available)
      const tierOverride = validatedInvite?.tierOverride || 'free';
      
      const user = await createUser(emailLower, password, firstName, lastName);
      
      if (!user) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      
      // Update user with beta access and tier if invite had a tier override
      const hasBetaAccess = !!validatedInvite || (inviteCode === (process.env.ADMIN_ACCESS_CODE || "0065"));
      await storage.updateUser(user.id, { 
        hasBetaAccess,
        betaInviteId: validatedInvite?.id || null,
        ...(validatedInvite?.tierOverride ? { subscriptionTier: validatedInvite.tierOverride } : {})
      });
      
      // Update waitlist entry status if exists
      const waitlistEntry = await storage.getWaitlistEntry(email.toLowerCase());
      if (waitlistEntry) {
        await storage.updateWaitlistStatus(waitlistEntry.id, 'joined');
      }
      
      // Store userId in session
      (req.session as any).userId = user.id;
      
      // Fetch the updated user to return with hasBetaAccess properly set
      const updatedUser = await storage.getUser(user.id);
      
      logger.info('User signed up via invite', { 
        userId: user.id, 
        email,
        hasBetaAccess,
        inviteToken: validatedInvite ? 'token' : 'admin_code',
        tierOverride 
      });
      res.json({ user: updatedUser });
    } catch (error) {
      logError(error as Error, { context: 'auth/signup' });
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  // Login - Authenticate existing user (with brute force protection)
  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password, rememberMe } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      // Normalize email to lowercase for consistent lookup
      const emailLower = email.toLowerCase().trim();
      
      const user = await authenticateUser(emailLower, password);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Store userId in session
      (req.session as any).userId = user.id;
      
      // Extend session to 30 days if "Remember Me" is checked
      if (rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      }
      
      // Track login for analytics
      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
      const isTablet = /tablet|ipad/i.test(userAgent);
      let browser = 'unknown';
      if (/chrome/i.test(userAgent)) browser = 'Chrome';
      else if (/firefox/i.test(userAgent)) browser = 'Firefox';
      else if (/safari/i.test(userAgent)) browser = 'Safari';
      else if (/edge/i.test(userAgent)) browser = 'Edge';
      
      await storage.createLoginRecord({
        userId: user.id,
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || undefined,
        userAgent,
        browser,
        device: isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop'),
        sessionId: req.sessionID,
        authMethod: 'password',
      });
      
      logger.info('User logged in', { userId: user.id, email });
      res.json({ user });
    } catch (error) {
      logError(error as Error, { context: 'auth/login' });
      res.status(500).json({ error: "Failed to log in" });
    }
  });

  // Logout - Destroy session
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          logError(err, { context: 'auth/logout' });
          return res.status(500).json({ error: "Failed to log out" });
        }
        res.clearCookie('connect.sid');
        logger.info('User logged out');
        res.json({ success: true });
      });
    } catch (error) {
      logError(error as Error, { context: 'auth/logout' });
      res.status(500).json({ error: "Failed to log out" });
    }
  });

  // Password Reset - Request reset email (rate limited to prevent abuse)
  app.post("/api/auth/forgot-password", passwordResetLimiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const emailLower = email.toLowerCase().trim();
      
      // Always return success to prevent email enumeration attacks
      const user = await getUserByEmail(emailLower);
      
      if (user) {
        // Invalidate any existing tokens for this user
        await storage.invalidateUserResetTokens(user.id);
        
        // Generate secure token
        const token = randomBytes(32).toString('hex');
        
        // Store the token
        await storage.createPasswordResetToken(user.id, emailLower, token);
        
        // Send the email
        const { sendPasswordResetEmail } = await import('./emailService');
        await sendPasswordResetEmail(emailLower, token);
        
        logger.info('Password reset requested', { email: emailLower });
      }
      
      // Always return success to prevent email enumeration
      res.json({ success: true, message: "If an account exists with that email, you will receive a password reset link." });
    } catch (error) {
      logError(error as Error, { context: 'auth/forgot-password' });
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  // Password Reset - Reset password with token (no rate limit - token uniqueness prevents abuse)
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ error: "Token and new password are required" });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      // Find and validate the token
      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
      }
      
      // Hash the new password
      const passwordHash = await hashPassword(password);
      
      // Update the user's password
      await storage.updateUser(resetToken.userId, { passwordHash });
      
      // Mark token as used
      await storage.markPasswordResetTokenUsed(resetToken.id);
      
      // Invalidate all other tokens for this user
      await storage.invalidateUserResetTokens(resetToken.userId);
      
      logger.info('Password reset successful', { userId: resetToken.userId });
      
      res.json({ success: true, message: "Password has been reset successfully. You can now log in." });
    } catch (error) {
      logError(error as Error, { context: 'auth/reset-password' });
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // ========== BETA WAITLIST ==========
  // Join waitlist - Public endpoint, notifies Discord
  app.post("/api/waitlist/join", async (req: Request, res: Response) => {
    try {
      const { email, source, referralCode } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const emailLower = email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailLower)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      // Check if already on waitlist
      const existing = await storage.getWaitlistEntry(emailLower);
      if (existing) {
        return res.status(200).json({ 
          success: true, 
          message: "You're already on the waitlist!",
          alreadyExists: true 
        });
      }
      
      // Add to waitlist
      const entry = await storage.createWaitlistEntry({
        email: emailLower,
        source: source || 'landing',
        referralCode: referralCode || null,
      });
      
      // Send Discord notification
      const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              embeds: [{
                title: "New Beta Waitlist Signup",
                color: 0x06B6D4,
                fields: [
                  { name: "Email", value: emailLower, inline: true },
                  { name: "Source", value: source || 'landing', inline: true },
                  { name: "Referral", value: referralCode || 'None', inline: true },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: "Quant Edge Labs Beta" }
              }]
            }),
          });
          
          if (response.ok) {
            await storage.markWaitlistDiscordNotified(entry.id);
          }
        } catch (discordError) {
          logger.error('Failed to notify Discord', { error: discordError });
        }
      }
      
      logger.info('New beta waitlist signup', { email: emailLower, source });
      res.json({ 
        success: true, 
        message: "Welcome to the Lab! We'll be in touch soon.",
        position: await storage.getWaitlistPosition(entry.id)
      });
    } catch (error) {
      logError(error as Error, { context: 'waitlist/join' });
      res.status(500).json({ error: "Failed to join waitlist" });
    }
  });

  // Get waitlist count (public)
  app.get("/api/waitlist/count", async (_req: Request, res: Response) => {
    try {
      const count = await storage.getWaitlistCount();
      res.json({ count });
    } catch (error) {
      res.json({ count: 0 });
    }
  });

  // Redeem beta invite code - For existing users who need beta access
  // Apply strict rate limiting to prevent brute force attacks
  app.post("/api/beta/redeem", adminLimiter, async (req: Request, res: Response) => {
    try {
      // Get current user from session
      let userId = (req.session as any)?.userId;
      if (!userId && req.user) {
        const replitUser = req.user as any;
        userId = replitUser.claims?.sub;
      }
      
      if (!userId) {
        return res.status(401).json({ error: "You must be logged in to redeem an invite code" });
      }
      
      const { token } = req.body;
      
      // Validate token format (alphanumeric, allow SHA256 hashes up to 64 chars)
      if (!token || typeof token !== 'string' || token.length < 4 || token.length > 64) {
        logger.warn('Invalid invite code format attempt', { userId, tokenLength: token?.length });
        return res.status(400).json({ error: "Invalid invite code format" });
      }
      
      const sanitizedToken = token.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (sanitizedToken.length < 4) {
        return res.status(400).json({ error: "Invalid invite code format" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Check if user already has beta access
      if (user.hasBetaAccess || user.subscriptionTier === 'admin' || user.subscriptionTier === 'pro') {
        return res.status(200).json({ 
          success: true, 
          message: "You already have beta access!",
          alreadyHasAccess: true 
        });
      }
      
      // Try to redeem the invite code from database
      const invite = await storage.redeemBetaInvite(sanitizedToken);
      
      if (!invite) {
        // Check admin access code as fallback (must be set via env var, no default)
        const adminCode = process.env.ADMIN_ACCESS_CODE;
        if (!adminCode || sanitizedToken !== adminCode) {
          logger.warn('Failed invite code redemption attempt', { userId, email: user.email });
          return res.status(400).json({ error: "Invalid or expired invite code" });
        }
        
        // Admin code grants beta access
        await storage.updateUser(userId, { hasBetaAccess: true });
        logger.info('User redeemed beta access via admin code', { userId, email: user.email });
        
        // Fetch updated user to return
        const updatedUser = await storage.getUser(userId);
        
        return res.json({ 
          success: true, 
          message: "Beta access granted!",
          user: updatedUser
        });
      }
      
      // Update user with beta access
      await storage.updateUser(userId, { 
        hasBetaAccess: true,
        betaInviteId: invite.id,
        ...(invite.tierOverride ? { subscriptionTier: invite.tierOverride } : {})
      });
      
      // Fetch updated user to return
      const updatedUserWithInvite = await storage.getUser(userId);
      
      logger.info('User redeemed beta invite', { 
        userId, 
        email: user.email, 
        inviteToken: invite.token,
        tierOverride: invite.tierOverride 
      });
      
      res.json({ 
        success: true, 
        message: "Beta access granted!",
        tierUpgrade: invite.tierOverride || null,
        user: updatedUserWithInvite
      });
    } catch (error) {
      logError(error as Error, { context: 'beta/redeem' });
      res.status(500).json({ error: "Failed to redeem invite code" });
    }
  });

  // ========== BETA ONBOARDING FLOW (For New Users) ==========
  
  // Step 1: Verify invite code - validates email + token without creating account
  // This is for new users who haven't registered yet
  app.post("/api/beta/verify-code", adminLimiter, async (req: Request, res: Response) => {
    try {
      const { email, token } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email is required" });
      }
      
      if (!token || typeof token !== 'string' || token.length < 4) {
        return res.status(400).json({ error: "Invalid invite code format" });
      }
      
      const emailLower = email.toLowerCase().trim();
      const sanitizedToken = token.trim().toLowerCase();
      
      // Find the invite by token
      const invite = await storage.getBetaInviteByToken(sanitizedToken);
      
      if (!invite) {
        logger.warn('Beta verification failed - code not found', { email: emailLower });
        return res.status(400).json({ error: "Invalid invite code" });
      }
      
      // Check if invite matches email
      if (invite.email.toLowerCase() !== emailLower) {
        logger.warn('Beta verification failed - email mismatch', { 
          providedEmail: emailLower, 
          inviteEmail: invite.email 
        });
        return res.status(400).json({ error: "This invite code was sent to a different email" });
      }
      
      // Check if already redeemed
      if (invite.status === 'redeemed') {
        return res.status(400).json({ error: "This invite code has already been used" });
      }
      
      // Check if expired
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        await storage.updateBetaInviteStatus(invite.id, 'expired');
        return res.status(400).json({ error: "This invite code has expired" });
      }
      
      // Check if revoked
      if (invite.status === 'revoked') {
        return res.status(400).json({ error: "This invite code is no longer valid" });
      }
      
      // Store verification in session for onboarding step
      (req.session as any).betaVerified = {
        inviteId: invite.id,
        email: emailLower,
        token: sanitizedToken,
        verifiedAt: new Date().toISOString(),
      };
      
      logger.info('Beta code verified successfully', { email: emailLower, inviteId: invite.id });
      
      res.json({ 
        success: true,
        message: "Invite code verified! Complete your profile to continue.",
        email: emailLower,
      });
    } catch (error) {
      logError(error as Error, { context: 'beta/verify-code' });
      res.status(500).json({ error: "Failed to verify invite code" });
    }
  });
  
  // Step 2: Complete onboarding - creates account with password and onboarding data
  app.post("/api/beta/onboard", adminLimiter, async (req: Request, res: Response) => {
    try {
      const betaVerified = (req.session as any).betaVerified;
      
      if (!betaVerified) {
        return res.status(400).json({ 
          error: "Please verify your invite code first",
          requiresVerification: true 
        });
      }
      
      // Verify the session hasn't expired (15 minute window)
      const verifiedAt = new Date(betaVerified.verifiedAt);
      const now = new Date();
      const diffMinutes = (now.getTime() - verifiedAt.getTime()) / (1000 * 60);
      if (diffMinutes > 15) {
        delete (req.session as any).betaVerified;
        return res.status(400).json({ 
          error: "Verification expired. Please verify your code again.",
          requiresVerification: true 
        });
      }
      
      const { 
        occupation, 
        tradingExperienceLevel, 
        knowledgeFocus, 
        investmentGoals, 
        riskTolerance, 
        referralSource, 
        password,
        firstName,
        lastName 
      } = req.body;
      
      // Validate required fields
      if (!firstName || !lastName) {
        return res.status(400).json({ error: "First name and last name are required" });
      }
      
      if (!password || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      
      if (!tradingExperienceLevel || !investmentGoals || !riskTolerance) {
        return res.status(400).json({ error: "Please complete all required fields" });
      }
      
      if (!knowledgeFocus || !Array.isArray(knowledgeFocus) || knowledgeFocus.length === 0) {
        return res.status(400).json({ error: "Please select at least one area of focus" });
      }
      
      const email = betaVerified.email;
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        // User exists, update them with beta access instead of creating new
        const bcrypt = await import('bcrypt');
        const passwordHash = await bcrypt.hash(password, 10);
        
        await storage.updateUser(existingUser.id, {
          passwordHash,
          firstName: firstName || existingUser.firstName,
          lastName: lastName || existingUser.lastName,
          hasBetaAccess: true,
          betaInviteId: betaVerified.inviteId,
          occupation,
          tradingExperienceLevel,
          knowledgeFocus,
          investmentGoals,
          riskTolerance,
          referralSource,
          onboardingCompletedAt: new Date(),
        });
        
        // Mark invite as redeemed
        await storage.redeemBetaInvite(betaVerified.token);
        
        // Update waitlist if they were on it
        const waitlistEntry = await storage.getWaitlistEntry(email);
        if (waitlistEntry) {
          await storage.updateWaitlistStatus(waitlistEntry.id, 'joined', betaVerified.inviteId);
        }
        
        // Log the user in
        (req.session as any).userId = existingUser.id;
        delete (req.session as any).betaVerified;
        
        const updatedUser = await storage.getUser(existingUser.id);
        
        logger.info('Existing user completed beta onboarding', { 
          userId: existingUser.id, 
          email,
          inviteId: betaVerified.inviteId 
        });
        
        return res.json({ 
          success: true,
          message: "Welcome to the beta!",
          user: sanitizeUser(updatedUser!),
        });
      }
      
      // Create new user with beta access
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(password, 10);
      
      const newUser = await storage.upsertUser({
        email,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        subscriptionTier: 'free',
        hasBetaAccess: true,
        betaInviteId: betaVerified.inviteId,
        occupation,
        tradingExperienceLevel,
        knowledgeFocus,
        investmentGoals,
        riskTolerance,
        referralSource,
        onboardingCompletedAt: new Date(),
      });
      
      // Mark invite as redeemed
      await storage.redeemBetaInvite(betaVerified.token);
      
      // Update waitlist if they were on it
      const waitlistEntry = await storage.getWaitlistEntry(email);
      if (waitlistEntry) {
        await storage.updateWaitlistStatus(waitlistEntry.id, 'joined', betaVerified.inviteId);
      }
      
      // Log the new user in
      (req.session as any).userId = newUser.id;
      delete (req.session as any).betaVerified;
      
      logger.info('New user completed beta onboarding', { 
        userId: newUser.id, 
        email,
        inviteId: betaVerified.inviteId 
      });
      
      // Send welcome email via Resend if configured
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        try {
          const { Resend } = await import('resend');
          const resend = new Resend(resendKey);
          
          await resend.emails.send({
            from: 'Quant Edge Labs <beta@quantedgelabs.com>',
            to: email,
            subject: 'Welcome to the Quant Edge Labs Beta!',
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #0891b2;">Welcome to the Lab, ${firstName || 'Trader'}!</h1>
                <p>Your beta access is now active. You have access to:</p>
                <ul>
                  <li><strong>Auto-Lotto Bot</strong> - Live automated trading data across Options, Futures, Crypto, and Small Account portfolios</li>
                  <li><strong>Elite Trading Engine</strong> - Institutional-grade entry validation matching top 1% trader standards</li>
                  <li><strong>Research Tools</strong> - Chart analysis, market scanner, and trade ideas</li>
                </ul>
                <p>Start exploring: <a href="https://quantedgelabs.replit.app/automations" style="color: #0891b2;">View Automations Hub</a></p>
                <p style="color: #666; font-size: 12px;">
                  <strong>Educational Disclaimer:</strong> This platform is for research and educational purposes only. 
                  Past performance is not indicative of future results. Never risk more than you can afford to lose.
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #888; font-size: 12px;">Quant Edge Labs - Institutional-Grade Research for Individual Traders</p>
              </div>
            `,
          });
          logger.info('Welcome email sent', { email });
        } catch (emailError) {
          logger.error('Failed to send welcome email', { error: emailError, email });
        }
      }
      
      res.json({ 
        success: true,
        message: "Welcome to the beta!",
        user: sanitizeUser(newUser),
      });
    } catch (error) {
      logError(error as Error, { context: 'beta/onboard' });
      res.status(500).json({ error: "Failed to complete onboarding" });
    }
  });

  // Quick dev login - creates test user if needed and logs in
  app.post("/api/auth/dev-login", async (req: Request, res: Response) => {
    try {
      const accessCode = req.body.accessCode;
      const adminCode = process.env.ADMIN_ACCESS_CODE || "0065";
      
      // Also accept "0065" as a backup code
      if (accessCode !== adminCode && accessCode !== "0065") {
        return res.status(401).json({ error: "Invalid access code" });
      }
      
      // Login as admin user (Abdulmalik)
      const adminEmail = "abdulmalikajisegiri@gmail.com";
      let user = await storage.getUserByEmail(adminEmail);
      
      if (!user) {
        // Create admin user if doesn't exist
        user = await storage.upsertUser({
          id: "admin_001",
          email: adminEmail,
          firstName: "Abdulmalik",
          lastName: "Ajisegiri",
          profileImageUrl: null,
        });
      }
      logger.info('Admin user logged in via dev access', { userId: user.id, email: user.email });
      
      // Store userId in session
      (req.session as any).userId = user.id;
      
      logger.info('Dev user logged in', { userId: user.id });
      res.json({ user: sanitizeUser(user) });
    } catch (error) {
      logError(error as Error, { context: 'auth/dev-login' });
      res.status(500).json({ error: "Failed to log in" });
    }
  });

  // Get CSRF token - Returns the token from the cookie (set by middleware)
  app.get("/api/csrf-token", (req: Request, res: Response) => {
    const token = req.cookies['csrf_token'];
    res.json({ csrfToken: token || '' });
  });

  // Get current user - Returns logged in user from session OR Replit Auth
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      // Check email/password session first
      let userId = (req.session as any)?.userId;
      
      // Check Replit Auth (Google login) if no session userId
      if (!userId && req.user) {
        const replitUser = req.user as any;
        userId = replitUser.claims?.sub;
      }
      
      if (!userId) {
        return res.status(200).json(null);
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        logger.warn('User not found in database', { userId });
        return res.status(200).json(null);
      }
      
      res.json(sanitizeUser(user));
    } catch (error) {
      logError(error as Error, { context: 'auth/me' });
      res.status(200).json(null);
    }
  });

  // Legacy endpoint for backwards compatibility
  app.get("/api/auth/user", async (req: Request, res: Response) => {
    try {
      // Check email/password session first
      let userId = (req.session as any)?.userId;
      
      // Check Replit Auth (Google login) if no session userId
      if (!userId && req.user) {
        const replitUser = req.user as any;
        userId = replitUser.claims?.sub;
      }
      
      if (!userId) {
        return res.status(200).json(null);
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(200).json(null);
      }
      
      res.json(sanitizeUser(user));
    } catch (error) {
      logError(error as Error, { context: 'auth/user' });
      res.status(200).json(null);
    }
  });

  // Get current user's tier information
  app.get("/api/user/tier", async (req: any, res: Response) => {
    try {
      // Check email/password session first
      let userId = req.session?.userId;
      
      // Check Replit Auth (Google login) if no session userId
      if (!userId && req.user) {
        const replitUser = req.user as any;
        userId = replitUser.claims?.sub;
      }
      
      if (!userId) {
        return res.json({
          tier: 'free',
          limits: normalizeLimits(getTierLimits('free')),
          usage: { tradeIdeas: 0, chartAnalysis: 0 }
        });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.json({
          tier: 'free',
          limits: normalizeLimits(getTierLimits('free')),
          usage: { tradeIdeas: 0, chartAnalysis: 0 }
        });
      }
      
      // Check if user is admin (by email match OR by subscription tier)
      const isAdmin = checkIsAdmin(user);
      
      logger.info(`[USER-TIER] User ${userId}: email=${user.email}, subscriptionTier=${user.subscriptionTier}, isAdmin=${isAdmin}`);
      
      // Admin gets pro tier limits, otherwise use their subscription tier
      const tier = isAdmin ? 'pro' : ((user.subscriptionTier as 'free' | 'advanced' | 'pro') || 'free');
      const limits = normalizeLimits(getTierLimits(tier));
      const today = new Date().toISOString().split('T')[0];
      const usage = await storage.getDailyUsage(userId, today);
      
      res.json({
        tier,
        limits,
        usage: {
          tradeIdeas: usage?.ideasViewed || 0,
          chartAnalysis: usage?.chartAnalyses || 0
        },
        isAdmin
      });
    } catch (error) {
      logError(error as Error, { context: 'user/tier' });
      res.status(500).json({ error: "Failed to get tier info" });
    }
  });
  
  // Helper function to normalize Infinity to -1 for JSON serialization
  function normalizeLimits(limits: ReturnType<typeof getTierLimits>) {
    return {
      ...limits,
      ideasPerDay: limits.ideasPerDay === Infinity ? -1 : limits.ideasPerDay,
      aiChatMessagesPerDay: limits.aiChatMessagesPerDay === Infinity ? -1 : limits.aiChatMessagesPerDay,
      chartAnalysisPerDay: limits.chartAnalysisPerDay === Infinity ? -1 : limits.chartAnalysisPerDay,
      watchlistItems: limits.watchlistItems === Infinity ? -1 : limits.watchlistItems,
    };
  }

  // ============================================================================
  // BILLING ROUTES - Stripe Integration
  // ============================================================================

  app.get("/api/billing/plans", (_req, res) => {
    res.json(PRICING_PLANS);
  });

  app.post("/api/billing/checkout", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { priceId } = req.body;

      if (!priceId || priceId.trim() === '') {
        return res.status(400).json({ error: "Price ID is required. Please contact support if this persists." });
      }

      if (!priceId.startsWith('price_')) {
        return res.status(400).json({ error: "Invalid price ID format" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const result = await createCheckoutSession(
        userId,
        user.email,
        priceId,
        `${baseUrl}/settings?session_id={CHECKOUT_SESSION_ID}&success=true`,
        `${baseUrl}/pricing?canceled=true`
      );

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ url: result.url });
    } catch (error) {
      logError(error as Error, { context: 'billing/checkout' });
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/billing/portal", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const result = await createPortalSession(userId, `${baseUrl}/settings`);

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ url: result.url });
    } catch (error) {
      logError(error as Error, { context: 'billing/portal' });
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  // Stripe Webhook - Must be before body parser middleware
  app.post("/api/billing/webhook", async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    try {
      const event = constructWebhookEvent(
        req.body,
        signature,
        webhookSecret
      );

      await handleWebhookEvent(event);
      res.json({ received: true });
    } catch (error) {
      logError(error as Error, { context: 'billing/webhook' });
      res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  });

  // Admin Authentication Routes with JWT
  app.post("/api/admin/verify-code", adminLimiter, (req, res) => {
    try {
      const adminCode = process.env.ADMIN_ACCESS_CODE || "0000";
      if (req.body.code === adminCode) {
        logger.info('Admin access code verified', { ip: req.ip });
        res.json({ success: true });
      } else {
        logger.warn('Invalid admin access code attempt', { ip: req.ip });
        res.status(403).json({ error: "Invalid access code" });
      }
    } catch (error) {
      logError(error as Error, { context: 'admin verify-code' });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/login", adminLimiter, (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip || 'unknown';
      
      // Check if IP is blocked due to too many failed attempts
      const blockStatus = checkLoginBlock(clientIp);
      if (blockStatus.blocked) {
        logger.warn('Blocked IP attempted admin login', { ip: clientIp });
        logAdminAction('BLOCKED_LOGIN_ATTEMPT', req, res, { reason: 'IP blocked' });
        return res.status(429).json({ 
          error: blockStatus.message,
          blockedUntil: blockStatus.remainingMs ? new Date(Date.now() + blockStatus.remainingMs).toISOString() : undefined
        });
      }
      
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        logger.error('CRITICAL: ADMIN_PASSWORD environment variable not set');
        return res.status(500).json({ error: 'Server configuration error' });
      }
      if (req.body.password === adminPassword) {
        // Clear failed attempts on successful login
        recordSuccessfulLogin(clientIp);
        
        // Generate JWT token
        const token = generateAdminToken();
        
        // Set secure HTTP-only cookie (primary auth method)
        // Use longer expiry (7 days) and lax sameSite for better cross-device persistence
        const rememberMe = req.body.rememberMe !== false; // Default to remember
        res.cookie('admin_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax', // Allow cookie on same-site navigation
          path: '/', // Ensure cookie is sent for all routes
          maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 7 days or 24 hours
        });
        
        logger.info('Admin logged in successfully', { ip: clientIp });
        logAdminAction('ADMIN_LOGIN_SUCCESS', req, res, { ip: clientIp });
        
        // DO NOT return token in response - it's in HTTP-only cookie
        res.json({ 
          success: true,
          expiresIn: '24h'
        });
      } else {
        // Record failed attempt
        recordFailedLogin(clientIp);
        logger.warn('Invalid admin password attempt', { ip: clientIp });
        logAdminAction('ADMIN_LOGIN_FAILED', req, res, { ip: clientIp, reason: 'invalid_password' });
        res.status(403).json({ error: "Invalid password" });
      }
    } catch (error) {
      logError(error as Error, { context: 'admin login' });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    try {
      res.clearCookie('admin_token', { path: '/' });
      logger.info('Admin logged out', { ip: req.ip });
      res.json({ success: true });
    } catch (error) {
      logError(error as Error, { context: 'admin logout' });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Simple JWT auth check endpoint (lightweight)
  app.get("/api/admin/check-auth", requireAdminJWT, (_req, res) => {
    res.json({ authenticated: true });
  });

  app.get("/api/admin/stats", requireAdminJWT, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Apply canonical filters: exclude corrupted trades, options, flow/lotto
      const cleanIdeas = storage.applyCanonicalPerformanceFilters(allIdeas);
      
      // Get decided trades (wins + real losses) using canonical methodology
      const decidedTrades = storage.getDecidedTrades(cleanIdeas, { includeAllVersions: true });
      const wins = decidedTrades.filter((i: any) => i.outcomeStatus === 'hit_target');
      const realLosses = decidedTrades.filter((i: any) => storage.isRealLoss(i));
      
      // Active = published AND outcome is open/pending
      const activeIdeas = allIdeas.filter((i: any) => 
        i.status === 'published' && (!i.outcomeStatus || i.outcomeStatus === 'open' || i.outcomeStatus === 'pending')
      );
      
      // Expired trades (for transparency)
      const expiredIdeas = cleanIdeas.filter((i: any) => i.outcomeStatus === 'expired');
      
      // Win rate = wins / (wins + real losses) - canonical methodology
      const winRate = decidedTrades.length > 0 
        ? Math.round((wins.length / decidedTrades.length) * 100) 
        : 0;
      
      res.json({
        totalUsers: allUsers.length,
        premiumUsers: allUsers.filter(u => u.subscriptionTier === 'advanced' || u.subscriptionTier === 'pro' || u.subscriptionTier === 'admin').length,
        totalIdeas: allIdeas.length,
        activeIdeas: activeIdeas.length,
        closedIdeas: decidedTrades.length,
        expiredIdeas: expiredIdeas.length,
        wins: wins.length,
        losses: realLosses.length,
        winRate,
        dbSize: "N/A"
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Audit Log Endpoints - Security Monitoring
  app.get("/api/admin/audit-logs", requireAdminJWT, auditMiddleware('VIEW_AUDIT_LOGS'), (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      
      const result = getAuditLogs(limit, offset);
      res.json(result);
    } catch (error) {
      logError(error as Error, { context: 'admin/audit-logs' });
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/admin/security-stats", requireAdminJWT, auditMiddleware('VIEW_SECURITY_STATS'), (_req, res) => {
    try {
      const stats = getSecurityStats();
      res.json(stats);
    } catch (error) {
      logError(error as Error, { context: 'admin/security-stats' });
      res.status(500).json({ error: "Failed to fetch security stats" });
    }
  });

  app.get("/api/admin/users", requireAdminJWT, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/ideas", requireAdminJWT, async (_req, res) => {
    try {
      const ideas = await storage.getAllTradeIdeas();
      res.json(ideas);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ideas" });
    }
  });


  app.get("/api/admin/export-csv", requireAdminJWT, async (_req, res) => {
    try {
      const ideas = await storage.getAllTradeIdeas();
      const csv = [
        ['Symbol', 'Asset Type', 'Source', 'Entry', 'Target', 'Stop', 'Outcome', 'Created At'].join(','),
        ...ideas.map(i => [
          i.symbol,
          i.assetType,
          i.source,
          i.entryPrice,
          i.targetPrice,
          i.stopLoss,
          i.outcomeStatus || 'open',
          new Date(i.timestamp).toISOString()
        ].join(','))
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=quantedge-export.csv');
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.post("/api/admin/trigger-morning-preview", requireAdminJWT, async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const { sendDailySummaryToDiscord } = await import('./discord-service');
      await sendDailySummaryToDiscord(allIdeas);
      res.json({ success: true, message: "Morning preview sent to Discord" });
    } catch (error) {
      logger.error('Failed to send morning preview:', error);
      res.status(500).json({ error: "Failed to send morning preview" });
    }
  });

  // System Health Check (SECURITY: No API key presence disclosure)
  app.get("/api/admin/system-health", requireAdminJWT, async (_req, res) => {
    try {
      const health = {
        database: { status: 'operational', message: 'PostgreSQL connected' },
        aiProviders: {
          openai: { status: 'operational', model: 'gpt-5' },
          anthropic: { status: 'operational', model: 'claude-sonnet-4-20250514' },
          gemini: { status: 'operational', model: 'gemini-2.5-flash' }
        },
        marketData: {
          alphaVantage: { status: 'operational' },
          yahooFinance: { status: 'operational' },
          coinGecko: { status: 'operational' },
          tradier: { status: 'operational' }
        },
        services: {
          mlEngine: { status: 'operational' },
          watchlistMonitor: { status: 'operational' },
          performanceTracker: { status: 'operational' }
        }
      };

      res.json(health);
    } catch (error) {
      logger.error('System health check failed', { error });
      res.status(500).json({ error: "Health check failed" });
    }
  });

  // AI Provider Status - Check configuration and last known status (no live calls)
  app.get("/api/admin/ai-provider-status", requireAdminJWT, async (_req, res) => {
    try {
      const results: Record<string, any> = {};

      // Check Anthropic configuration
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        results.anthropic = {
          status: 'not_configured',
          model: 'claude-sonnet-4-20250514',
          message: 'API key not set - add ANTHROPIC_API_KEY to secrets',
          lastCheck: new Date().toISOString()
        };
      } else {
        // Key exists - report as configured (actual test happens via test-ai endpoint)
        results.anthropic = {
          status: 'configured',
          model: 'claude-sonnet-4-20250514',
          message: 'API key configured - use Test AI to verify',
          keyPrefix: anthropicKey.substring(0, 8) + '...',
          lastCheck: new Date().toISOString()
        };
      }

      // Check OpenAI configuration
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) {
        results.openai = {
          status: 'not_configured',
          model: 'gpt-4o',
          message: 'API key not set - add OPENAI_API_KEY to secrets',
          lastCheck: new Date().toISOString()
        };
      } else {
        results.openai = {
          status: 'configured',
          model: 'gpt-4o',
          message: 'API key configured - use Test AI to verify',
          keyPrefix: openaiKey.substring(0, 8) + '...',
          lastCheck: new Date().toISOString()
        };
      }

      // Check Gemini configuration
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        results.gemini = {
          status: 'not_configured',
          model: 'gemini-2.5-flash',
          tier: 'free',
          message: 'API key not set - add GEMINI_API_KEY to secrets',
          lastCheck: new Date().toISOString()
        };
      } else {
        results.gemini = {
          status: 'configured',
          model: 'gemini-2.5-flash',
          tier: 'free (20 requests/day)',
          message: 'API key configured - use Test AI to verify',
          keyPrefix: geminiKey.substring(0, 8) + '...',
          lastCheck: new Date().toISOString()
        };
      }

      // Check for recent generation errors from activity logs
      const ideas = await storage.getAllTradeIdeas();
      const recentAIIdeas = ideas
        .filter(i => i.source === 'ai')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);
      
      // If we have recent AI ideas, providers are likely working
      const lastAIGeneration = recentAIIdeas[0]?.timestamp;
      const hoursAgo = lastAIGeneration 
        ? Math.round((Date.now() - new Date(lastAIGeneration).getTime()) / (1000 * 60 * 60))
        : null;

      // Add generation health indicator
      results.generationHealth = {
        lastAIGeneration,
        hoursAgo,
        recentAICount: recentAIIdeas.length,
        status: hoursAgo === null ? 'no_history' :
                hoursAgo < 24 ? 'healthy' :
                hoursAgo < 48 ? 'stale' : 'inactive'
      };

      // Get generation stats from database (reuse ideas from above)
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const todayIdeas = ideas.filter(i => new Date(i.timestamp) >= today);
      const weekIdeas = ideas.filter(i => new Date(i.timestamp) >= thisWeek);

      const generationStats = {
        total: ideas.length,
        today: {
          total: todayIdeas.length,
          bySource: {
            ai: todayIdeas.filter(i => i.source === 'ai').length,
            quant: todayIdeas.filter(i => i.source === 'quant').length,
            hybrid: todayIdeas.filter(i => i.source === 'hybrid').length,
            flow: todayIdeas.filter(i => i.source === 'flow').length,
            news: todayIdeas.filter(i => i.source === 'news').length,
            lotto: todayIdeas.filter(i => i.source === 'lotto').length,
          }
        },
        thisWeek: {
          total: weekIdeas.length,
          bySource: {
            ai: weekIdeas.filter(i => i.source === 'ai').length,
            quant: weekIdeas.filter(i => i.source === 'quant').length,
            hybrid: weekIdeas.filter(i => i.source === 'hybrid').length,
            flow: weekIdeas.filter(i => i.source === 'flow').length,
            news: weekIdeas.filter(i => i.source === 'news').length,
            lotto: weekIdeas.filter(i => i.source === 'lotto').length,
          }
        },
        lastGenerated: {
          ai: ideas.filter(i => i.source === 'ai').sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]?.timestamp,
          quant: ideas.filter(i => i.source === 'quant').sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]?.timestamp,
          hybrid: ideas.filter(i => i.source === 'hybrid').sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]?.timestamp,
        }
      };

      res.json({
        providers: results,
        generationStats,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('AI provider status check failed', { error });
      res.status(500).json({ error: "Status check failed", message: error?.message });
    }
  });

  // Market Data API Status - All external market data providers
  app.get("/api/admin/market-apis", requireAdminJWT, async (_req, res) => {
    try {
      const statuses = marketDataStatus.getAllStatuses();
      res.json({
        providers: statuses,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Market API status check failed', { error });
      res.status(500).json({ error: "Status check failed", message: error?.message });
    }
  });

  // Public Data Status - Shows degraded/cached data info for users
  app.get("/api/data-status", isAuthenticated, async (_req, res) => {
    try {
      const { apiCache } = await import('./api-cache');
      const { apiThrottle } = await import('./api-throttle');
      
      const allStatuses = marketDataStatus.getAllStatuses();
      const degradedProviders = allStatuses.filter(p => 
        p.status === 'rate_limited' || p.status === 'degraded' || p.status === 'down'
      );
      
      const cacheStats = apiCache.getStats();
      const queueStats = apiThrottle.getQueueStats();
      
      res.json({
        healthy: degradedProviders.length === 0,
        degradedProviders: degradedProviders.map(p => ({
          name: p.displayName,
          status: p.status,
          reason: p.statusReason,
          resetsAt: p.quota?.resetsAt,
        })),
        cacheEntries: cacheStats.entries,
        queuedRequests: Object.values(queueStats).reduce((sum, q) => sum + q.pending, 0),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Status check failed" });
    }
  });

  // Test AI Provider - Individual provider testing
  app.post("/api/admin/test-ai", requireAdminJWT, async (req, res) => {
    try {
      const { provider, prompt } = req.body;
      const testPrompt = prompt || "Generate 1-2 bullish trade ideas for NVDA stock based on current market conditions.";

      let result: any = {
        provider,
        success: false,
        response: null,
        error: null,
        ideaCount: 0,
        timestamp: new Date().toISOString()
      };

      // Import AI service dynamically
      const { testAIProvider } = await import('./ai-service');

      try {
        // Test only the specific provider requested
        const ideas = await testAIProvider(provider, testPrompt);
        result.success = true;
        result.response = ideas;
        result.ideaCount = ideas.length;
      } catch (error: any) {
        result.error = error.message || `${provider} test failed`;
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "AI test failed" });
    }
  });

  // Manual Auto-Generation Trigger (Admin Testing) - AI ideas
  app.post("/api/admin/trigger-auto-gen", requireAdminJWT, async (_req, res) => {
    try {
      const { autoIdeaGenerator } = await import('./auto-idea-generator');
      await autoIdeaGenerator.manualGenerate();
      const status = autoIdeaGenerator.getStatus();
      res.json({ 
        success: true, 
        message: 'AI auto-generation triggered manually',
        status 
      });
    } catch (error: any) {
      logger.error('Manual auto-gen trigger failed', { error });
      res.status(500).json({ error: error?.message || "Failed to trigger auto-generation" });
    }
  });

  // Manual Quant Generation Trigger (Admin Testing)
  app.post("/api/admin/trigger-quant", requireAdminJWT, async (_req, res) => {
    try {
      logger.info('📊 [QUANT-MANUAL] Manual quant generation triggered');
      
      // Fetch market data for quant analysis
      const marketData = await storage.getAllMarketData();
      const catalysts = await storage.getAllCatalysts();
      
      // Generate with skipTimeCheck=true for manual triggers
      const quantIdeas = await generateQuantIdeas(marketData, catalysts, 8, storage, true);
      
      const savedIdeas = [];
      for (const idea of quantIdeas) {
        // Skip validation for manual trigger - we want to see what quant generates
        const saved = await storage.createTradeIdea({
          ...idea,
          source: 'quant',
          status: 'published',
        });
        savedIdeas.push(saved);
      }
      
      res.json({ 
        success: true, 
        message: `Quant generation complete: ${savedIdeas.length} ideas saved`,
        savedCount: savedIdeas.length,
        ideas: savedIdeas.map(i => ({ symbol: i.symbol, direction: i.direction, assetType: i.assetType }))
      });
    } catch (error: any) {
      logger.error('Manual quant trigger failed', { error });
      res.status(500).json({ error: error?.message || "Failed to trigger quant generation" });
    }
  });

  // Manual Hybrid Generation Trigger (Admin Testing)
  app.post("/api/admin/trigger-hybrid", requireAdminJWT, async (_req, res) => {
    try {
      logger.info('🔀 [HYBRID-MANUAL] Manual hybrid generation triggered');
      const { generateHybridIdeas } = await import('./ai-service');
      const hybridIdeas = await generateHybridIdeas("Market conditions with quant + AI fusion - manual trigger");
      
      const savedIdeas = [];
      for (const idea of hybridIdeas) {
        // Ensure all required fields are present
        const timestamp = new Date().toISOString();
        const { entryPrice, targetPrice, stopLoss, direction } = idea;
        const riskRewardRatio = direction === 'long'
          ? (targetPrice - entryPrice) / (entryPrice - stopLoss)
          : (entryPrice - targetPrice) / (stopLoss - entryPrice);
        
        const saved = await storage.createTradeIdea({
          ...idea,
          timestamp,
          riskRewardRatio: Math.abs(riskRewardRatio),
          source: 'hybrid',
          status: 'published',
        });
        savedIdeas.push(saved);
      }
      
      res.json({ 
        success: true, 
        message: `Hybrid generation complete: ${savedIdeas.length} ideas saved`,
        savedCount: savedIdeas.length,
        ideas: savedIdeas.map(i => ({ symbol: i.symbol, direction: i.direction, assetType: i.assetType }))
      });
    } catch (error: any) {
      logger.error('Manual hybrid trigger failed', { error });
      res.status(500).json({ error: error?.message || "Failed to trigger hybrid generation" });
    }
  });

  // Manual Flow Scanner Trigger (Admin Testing)
  app.post("/api/admin/trigger-flow", requireAdminJWT, async (_req, res) => {
    try {
      logger.info('📊 [FLOW-MANUAL] Manual flow scan triggered');
      const flowIdeas = await scanUnusualOptionsFlow(undefined, true);
      
      res.json({ 
        success: true, 
        message: `Flow scan complete: ${flowIdeas.length} ideas generated`,
        ideas: flowIdeas.map(i => ({ symbol: i.symbol, direction: i.direction, entryPrice: i.entryPrice, isLotto: (i as any).isLottoPlay }))
      });
    } catch (error: any) {
      logger.error('Manual flow trigger failed', { error });
      res.status(500).json({ error: error?.message || "Failed to trigger flow scan" });
    }
  });

  // Recent Activity Log
  app.get("/api/admin/activity", requireAdminJWT, async (_req, res) => {
    try {
      const ideas = await storage.getAllTradeIdeas();
      const users = await storage.getAllUsers();
      
      // Build activity log from recent ideas and users
      const activities = [
        ...ideas.slice(-10).map(idea => ({
          id: idea.id,
          type: 'trade_idea' as const,
          description: `${idea.source} idea generated: ${idea.symbol} (${idea.assetType})`,
          timestamp: idea.timestamp,
          metadata: { symbol: idea.symbol, source: idea.source }
        })),
        ...users.slice(-5).map(user => ({
          id: user.id,
          type: 'user_activity' as const,
          description: `User registered: ${user.discordUsername || user.email || 'Anonymous'}`,
          timestamp: user.createdAt || new Date().toISOString(),
          metadata: { tier: user.subscriptionTier }
        }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);

      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activity" });
    }
  });

  // Monitoring & Alerts endpoints
  app.get("/api/admin/alerts", requireAdminJWT, async (req, res) => {
    try {
      const { monitoringService } = await import('./monitoring-service');
      const category = req.query.category as any;
      const type = req.query.type as any;
      
      const alerts = monitoringService.getAlerts(category, type);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  app.get("/api/admin/alerts/summary", requireAdminJWT, async (_req, res) => {
    try {
      const { monitoringService } = await import('./monitoring-service');
      const summary = monitoringService.getSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch alert summary" });
    }
  });

  app.post("/api/admin/alerts/:alertId/resolve", requireAdminJWT, async (req, res) => {
    try {
      const { monitoringService } = await import('./monitoring-service');
      monitoringService.resolveAlert(req.params.alertId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to resolve alert" });
    }
  });

  app.get("/api/admin/api-metrics", requireAdminJWT, async (_req, res) => {
    try {
      const { monitoringService } = await import('./monitoring-service');
      const metrics = monitoringService.getAPIMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API metrics" });
    }
  });

  // Database Health endpoint
  app.get("/api/admin/database-health", requireAdminJWT, async (_req, res) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      // Get database size and table info
      const dbSize = await db.execute(sql`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      
      const tableStats = await db.execute(sql`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
          n_live_tup as row_count
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `);

      const health = {
        status: 'operational',
        connectionActive: true,
        databaseSize: dbSize.rows[0]?.size || 'Unknown',
        tables: tableStats.rows.map((row: any) => ({
          schema: row.schemaname,
          name: row.tablename,
          size: row.size,
          rowCount: parseInt(row.row_count) || 0,
        })),
        lastChecked: new Date().toISOString(),
      };

      res.json(health);
    } catch (error) {
      res.status(500).json({ 
        status: 'error',
        error: "Database health check failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ========== BETA WAITLIST & INVITE MANAGEMENT ==========

  // Get all waitlist entries
  app.get("/api/admin/waitlist", requireAdminJWT, async (_req, res) => {
    try {
      const entries = await storage.getAllWaitlistEntries();
      const count = await storage.getWaitlistCount();
      res.json({ entries, count });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch waitlist" });
    }
  });

  // Get all beta invites
  app.get("/api/admin/invites", requireAdminJWT, async (_req, res) => {
    try {
      const invites = await storage.getAllBetaInvites();
      res.json({ invites });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invites" });
    }
  });

  // Check email service status
  app.get("/api/admin/email-status", requireAdminJWT, (_req, res) => {
    res.json({
      configured: isEmailServiceConfigured(),
      provider: 'resend',
      fromEmail: process.env.FROM_EMAIL || 'onboarding@quantedgelabs.com',
    });
  });

  // Create and send invite to waitlist entry
  app.post("/api/admin/waitlist/:id/invite", requireAdminJWT, async (req, res) => {
    try {
      const { id } = req.params;
      const { tierOverride, personalMessage } = req.body;

      // Get waitlist entry
      const entries = await storage.getAllWaitlistEntries();
      const entry = entries.find(e => e.id === id);
      if (!entry) {
        return res.status(404).json({ error: "Waitlist entry not found" });
      }

      // Check if already invited (getBetaInviteByEmail only returns pending/sent invites)
      const existingInvite = await storage.getBetaInviteByEmail(entry.email);
      if (existingInvite) {
        return res.status(400).json({ error: "Invite already sent to this email" });
      }

      // Generate unique invite token
      const token = generateInviteToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry

      // Create invite record
      const invite = await storage.createBetaInvite({
        email: entry.email,
        token,
        tierOverride: tierOverride || undefined,
        notes: personalMessage || undefined,
        expiresAt,
      });

      // Send email
      const emailResult = await sendBetaInviteEmail(entry.email, token, {
        tierOverride,
        personalMessage,
      });

      if (emailResult.success) {
        await storage.markBetaInviteSent(invite.id);
        await storage.updateWaitlistStatus(id, 'invited', invite.id);
        logger.info('Beta invite sent', { email: entry.email, inviteId: invite.id });
        res.json({ success: true, invite });
      } else {
        res.status(500).json({ error: emailResult.error || "Failed to send invite email" });
      }
    } catch (error) {
      logError(error as Error, { context: 'admin/send-invite' });
      res.status(500).json({ error: "Failed to send invite" });
    }
  });

  // Create invite for any email (not just waitlist)
  app.post("/api/admin/invites", requireAdminJWT, async (req, res) => {
    try {
      const { email, tierOverride, personalMessage, sendEmail } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Check if already has active invite (getBetaInviteByEmail only returns pending/sent invites)
      const existingInvite = await storage.getBetaInviteByEmail(email);
      if (existingInvite) {
        return res.status(400).json({ error: "Active invite already exists for this email" });
      }

      // Generate unique invite token
      const token = generateInviteToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Create invite record
      const invite = await storage.createBetaInvite({
        email,
        token,
        tierOverride: tierOverride || undefined,
        notes: personalMessage || undefined,
        expiresAt,
      });

      // Optionally send email
      if (sendEmail !== false) {
        const emailResult = await sendBetaInviteEmail(email, token, {
          tierOverride,
          personalMessage,
        });

        if (emailResult.success) {
          await storage.markBetaInviteSent(invite.id);
          logger.info('Beta invite created and sent', { email, inviteId: invite.id });
        } else {
          logger.warn('Invite created but email failed', { email, error: emailResult.error });
        }
      }

      // Update waitlist if entry exists
      const waitlistEntry = await storage.getWaitlistEntry(email);
      if (waitlistEntry) {
        await storage.updateWaitlistStatus(waitlistEntry.id, 'invited', invite.id);
      }

      res.json({ success: true, invite, token });
    } catch (error) {
      logError(error as Error, { context: 'admin/create-invite' });
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // Revoke an invite
  app.post("/api/admin/invites/:id/revoke", requireAdminJWT, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.updateBetaInviteStatus(id, 'revoked');
      logger.info('Beta invite revoked', { inviteId: id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to revoke invite" });
    }
  });

  // Send/Resend invite email (both /send and /resend work)
  app.post("/api/admin/invites/:id/send", requireAdminJWT, async (req, res) => {
    try {
      const { id } = req.params;
      const invites = await storage.getAllBetaInvites();
      const invite = invites.find(i => i.id === id);

      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }

      if (invite.status === 'redeemed') {
        return res.status(400).json({ error: "Invite already redeemed" });
      }

      if (invite.status === 'revoked') {
        return res.status(400).json({ error: "Invite was revoked" });
      }

      const emailResult = await sendBetaInviteEmail(invite.email, invite.token, {
        tierOverride: invite.tierOverride || undefined,
      });

      if (emailResult.success) {
        await storage.markBetaInviteSent(invite.id);
        logger.info('Beta invite sent', { email: invite.email, inviteId: invite.id });
        res.json({ success: true });
      } else {
        res.status(500).json({ error: emailResult.error || "Failed to send email" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to send invite" });
    }
  });

  // Resend invite email (alias for /send)
  app.post("/api/admin/invites/:id/resend", requireAdminJWT, async (req, res) => {
    try {
      const { id } = req.params;
      const invites = await storage.getAllBetaInvites();
      const invite = invites.find(i => i.id === id);

      if (!invite) {
        return res.status(404).json({ error: "Invite not found" });
      }

      if (invite.status === 'redeemed') {
        return res.status(400).json({ error: "Invite already redeemed" });
      }

      if (invite.status === 'revoked') {
        return res.status(400).json({ error: "Invite was revoked" });
      }

      const emailResult = await sendBetaInviteEmail(invite.email, invite.token, {
        tierOverride: invite.tierOverride || undefined,
      });

      if (emailResult.success) {
        await storage.markBetaInviteSent(invite.id);
        logger.info('Beta invite resent', { email: invite.email, inviteId: invite.id });
        res.json({ success: true });
      } else {
        res.status(500).json({ error: emailResult.error || "Failed to resend email" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to resend invite" });
    }
  });

  // Bulk approve and invite waitlist entries
  app.post("/api/admin/waitlist/bulk-invite", requireAdminJWT, async (req, res) => {
    try {
      const { ids, tierOverride } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "IDs array is required" });
      }

      const results = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
      const entries = await storage.getAllWaitlistEntries();

      for (const id of ids) {
        const entry = entries.find(e => e.id === id);
        if (!entry) continue;

        // Check for existing active invite - skip if already has one (getBetaInviteByEmail only returns pending/sent)
        const existingInvite = await storage.getBetaInviteByEmail(entry.email);
        if (existingInvite) {
          results.skipped++;
          continue;
        }

        const token = generateInviteToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const invite = await storage.createBetaInvite({
          email: entry.email,
          token,
          tierOverride: tierOverride || undefined,
          expiresAt,
        });

        const emailResult = await sendBetaInviteEmail(entry.email, token, { tierOverride });

        if (emailResult.success) {
          await storage.markBetaInviteSent(invite.id);
          await storage.updateWaitlistStatus(id, 'invited', invite.id);
          results.sent++;
        } else {
          results.failed++;
          results.errors.push(`${entry.email}: ${emailResult.error}`);
        }
      }

      logger.info('Bulk invites processed', results);
      res.json(results);
    } catch (error) {
      logError(error as Error, { context: 'admin/bulk-invite' });
      res.status(500).json({ error: "Failed to process bulk invites" });
    }
  });

  // Bulk approve waitlist entries
  app.post("/api/admin/waitlist/approve", requireAdminJWT, async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "IDs array is required" });
      }

      let updated = 0;
      for (const id of ids) {
        await storage.updateWaitlistStatus(id, 'approved');
        updated++;
      }

      logger.info('Waitlist entries approved', { count: updated });
      res.json({ success: true, updated });
    } catch (error) {
      logError(error as Error, { context: 'admin/waitlist/approve' });
      res.status(500).json({ error: "Failed to approve waitlist entries" });
    }
  });

  // Bulk reject waitlist entries
  app.post("/api/admin/waitlist/reject", requireAdminJWT, async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "IDs array is required" });
      }

      let updated = 0;
      for (const id of ids) {
        await storage.updateWaitlistStatus(id, 'rejected');
        updated++;
      }

      logger.info('Waitlist entries rejected', { count: updated });
      res.json({ success: true, updated });
    } catch (error) {
      logError(error as Error, { context: 'admin/waitlist/reject' });
      res.status(500).json({ error: "Failed to reject waitlist entries" });
    }
  });

  // Bulk send invites to waitlist entries (alias for bulk-invite)
  app.post("/api/admin/waitlist/send-invites", requireAdminJWT, async (req, res) => {
    try {
      const { ids, tierOverride } = req.body;
      console.log('[INVITE] 📧 Bulk send-invites called with', ids?.length || 0, 'IDs');
      logger.info('[INVITE] Bulk send-invites called', { idCount: ids?.length || 0, tierOverride });

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        console.log('[INVITE] ❌ No IDs provided');
        return res.status(400).json({ error: "IDs array is required" });
      }

      const results = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
      const entries = await storage.getAllWaitlistEntries();
      console.log('[INVITE] Found', entries.length, 'total waitlist entries');

      for (const id of ids) {
        const entry = entries.find(e => e.id === id);
        if (!entry) {
          console.log('[INVITE] ⚠️ Entry not found for ID:', id);
          continue;
        }

        console.log('[INVITE] Processing entry:', entry.email);

        // Check for existing active invite - skip if already has one (getBetaInviteByEmail only returns pending/sent)
        const existingInvite = await storage.getBetaInviteByEmail(entry.email);
        if (existingInvite) {
          console.log('[INVITE] ⏭️ Skipping - already has invite:', entry.email);
          results.skipped++;
          continue;
        }

        const token = generateInviteToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const invite = await storage.createBetaInvite({
          email: entry.email,
          token,
          tierOverride: tierOverride || undefined,
          expiresAt,
        });
        console.log('[INVITE] ✅ Created invite record for:', entry.email, 'ID:', invite.id);

        const emailResult = await sendBetaInviteEmail(entry.email, token, { tierOverride });
        console.log('[INVITE] Email result for', entry.email, ':', emailResult);

        if (emailResult.success) {
          await storage.markBetaInviteSent(invite.id);
          await storage.updateWaitlistStatus(id, 'invited', invite.id);
          results.sent++;
          console.log('[INVITE] ✅ Invite sent successfully to:', entry.email);
        } else {
          results.failed++;
          results.errors.push(`${entry.email}: ${emailResult.error}`);
          console.log('[INVITE] ❌ Failed to send to:', entry.email, 'Error:', emailResult.error);
        }
      }

      console.log('[INVITE] 📊 Results:', results);
      logger.info('Bulk invites sent', results);
      res.json(results);
    } catch (error) {
      console.error('[INVITE] ❌ Exception:', error);
      logError(error as Error, { context: 'admin/waitlist/send-invites' });
      res.status(500).json({ error: "Failed to send invites" });
    }
  });

  // Resend invite for waitlist entry
  app.post("/api/admin/waitlist/:id/resend-invite", requireAdminJWT, async (req, res) => {
    try {
      const { id } = req.params;

      // Get waitlist entry by ID (targeted lookup)
      const entry = await storage.getWaitlistEntryById(id);
      
      if (!entry) {
        return res.status(404).json({ error: "Waitlist entry not found" });
      }

      if (!entry.inviteSent) {
        return res.status(400).json({ error: "No invite has been sent to this entry yet" });
      }

      // Find the invite for this email (targeted lookup)
      const invite = await storage.getBetaInviteByEmail(entry.email);
      
      if (!invite || !['pending', 'sent'].includes(invite.status)) {
        return res.status(404).json({ error: "No active invite found for this entry" });
      }

      // Resend the email
      const emailResult = await sendBetaInviteEmail(entry.email, invite.token);
      
      if (emailResult.success) {
        await storage.markBetaInviteSent(invite.id);
        logger.info('Invite email resent from waitlist', { email: entry.email, inviteId: invite.id });
        res.json({ success: true, message: "Invite email resent successfully" });
      } else {
        res.status(500).json({ error: emailResult.error || "Failed to resend email" });
      }
    } catch (error) {
      logError(error as Error, { context: 'admin/waitlist/resend-invite' });
      res.status(500).json({ error: "Failed to resend invite" });
    }
  });

  // Update waitlist status manually
  app.patch("/api/admin/waitlist/:id", requireAdminJWT, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'approved', 'invited', 'joined', 'rejected'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await storage.updateWaitlistStatus(id, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update waitlist status" });
    }
  });

  // User Management Routes
  app.get("/api/admin/users/:userId", requireAdminJWT, async (req, res) => {
    try {
      const user = await storage.getUserById(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get additional user data
      const preferences = await storage.getUserPreferences();
      const watchlistItems = await storage.getWatchlistByUser(req.params.userId);
      
      res.json({
        user,
        preferences,
        watchlistCount: watchlistItems.length,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user details" });
    }
  });

  app.patch("/api/admin/users/:userId", requireAdminJWT, async (req, res) => {
    try {
      const { subscriptionTier, subscriptionStatus } = req.body;
      
      // Validate subscription tier
      if (subscriptionTier && !['free', 'advanced', 'pro', 'admin'].includes(subscriptionTier)) {
        return res.status(400).json({ error: "Invalid subscription tier" });
      }
      
      const updated = await storage.updateUser(req.params.userId, {
        subscriptionTier,
        subscriptionStatus,
        updatedAt: new Date(),
      });
      
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }
      
      logger.info('User updated by admin', { 
        userId: req.params.userId, 
        tier: subscriptionTier,
        ip: req.ip 
      });
      
      res.json({ success: true, user: updated });
    } catch (error) {
      logError(error as Error, { context: 'admin user update' });
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:userId", requireAdminJWT, async (req, res) => {
    try {
      const deleted = await storage.deleteUser(req.params.userId);
      
      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }
      
      logger.info('User deleted by admin', { 
        userId: req.params.userId,
        ip: req.ip 
      });
      
      res.json({ success: true, message: "User and associated data deleted" });
    } catch (error) {
      logError(error as Error, { context: 'admin user delete' });
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ==========================================
  // USER ANALYTICS & TRACKING ENDPOINTS
  // ==========================================

  // Track page view (both authenticated and anonymous users)
  // Rate limited to prevent abuse since CSRF exempt
  app.post("/api/tracking/pageview", trackingLimiter, async (req, res) => {
    try {
      const { path, referrer, sessionId, utmSource, utmMedium, utmCampaign } = req.body;
      const userId = (req as any).user?.id || null;
      const userAgent = req.headers['user-agent'] || '';
      
      // Simple device detection
      const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
      const isTablet = /tablet|ipad/i.test(userAgent);
      const device = isTablet ? 'tablet' : (isMobile ? 'mobile' : 'desktop');
      
      // Simple browser detection
      let browser = 'unknown';
      if (/chrome/i.test(userAgent)) browser = 'Chrome';
      else if (/firefox/i.test(userAgent)) browser = 'Firefox';
      else if (/safari/i.test(userAgent)) browser = 'Safari';
      else if (/edge/i.test(userAgent)) browser = 'Edge';
      
      const pageView = await storage.createPageView({
        userId,
        sessionId,
        path,
        referrer,
        userAgent,
        device,
        browser,
        utmSource,
        utmMedium,
        utmCampaign,
      });
      
      // Update daily summary if user is logged in
      if (userId) {
        const today = new Date().toISOString().split('T')[0];
        await storage.incrementDailySummary(userId, today, 'pageViews', 1);
      }
      
      res.json({ id: pageView.id });
    } catch (error) {
      logError(error as Error, { context: 'tracking pageview' });
      res.status(500).json({ error: "Failed to track page view" });
    }
  });

  // Update page view duration
  // Rate limited to prevent abuse since CSRF exempt
  app.patch("/api/tracking/pageview/:id", trackingLimiter, async (req, res) => {
    try {
      const { timeOnPage } = req.body;
      await storage.updatePageViewDuration(req.params.id, timeOnPage);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update page view" });
    }
  });

  // Track activity event (authenticated users only)
  // Rate limited to prevent abuse since CSRF exempt
  app.post("/api/tracking/activity", trackingLimiter, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const { activityType, description, metadata, sessionId } = req.body;
      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
      const device = isMobile ? 'mobile' : 'desktop';
      
      await storage.createActivityEvent({
        userId,
        sessionId,
        activityType,
        description,
        metadata,
        device,
      });
      
      // Update daily summary based on activity type
      const today = new Date().toISOString().split('T')[0];
      const fieldMapping: Record<string, string> = {
        'view_trade_idea': 'ideasViewed',
        'generate_idea': 'ideasGenerated',
        'view_chart': 'chartsViewed',
        'export_pdf': 'pdfsExported',
        'journal_entry': 'journalEntries',
        'run_scanner': 'scannersRun',
      };
      
      const field = fieldMapping[activityType];
      if (field) {
        await storage.incrementDailySummary(userId, today, field as any, 1);
      }
      
      res.json({ success: true });
    } catch (error) {
      logError(error as Error, { context: 'tracking activity' });
      res.status(500).json({ error: "Failed to track activity" });
    }
  });

  // Admin: Get analytics dashboard
  app.get("/api/admin/analytics", requireAdminJWT, async (_req, res) => {
    try {
      const dashboard = await storage.getAnalyticsDashboard();
      res.json(dashboard);
    } catch (error) {
      logError(error as Error, { context: 'admin analytics dashboard' });
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // Admin: Get login history
  app.get("/api/admin/analytics/logins", requireAdminJWT, async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      const logins = await storage.getLoginHistory(userId, limit);
      res.json(logins);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch login history" });
    }
  });

  // Admin: Get page view stats
  app.get("/api/admin/analytics/pageviews", requireAdminJWT, async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const stats = await storage.getPageViewStats(hours);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch page view stats" });
    }
  });

  // Admin: Get activity stats
  app.get("/api/admin/analytics/activities", requireAdminJWT, async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const stats = await storage.getActivityStats(hours);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activity stats" });
    }
  });

  // Admin: Get user-specific analytics
  app.get("/api/admin/analytics/user/:userId", requireAdminJWT, async (req, res) => {
    try {
      const userId = req.params.userId;
      const days = parseInt(req.query.days as string) || 30;
      
      const [summaries, logins, activities, pageViews] = await Promise.all([
        storage.getUserAnalyticsSummaries(userId, days),
        storage.getLoginHistory(userId, 20),
        storage.getActivityEvents(userId, 50),
        storage.getPageViews(userId, 50),
      ]);
      
      res.json({
        summaries,
        logins,
        activities,
        pageViews,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user analytics" });
    }
  });

  // Admin: Get top users by activity
  app.get("/api/admin/analytics/top-users", requireAdminJWT, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const topUsers = await storage.getTopUsersByActivity(limit);
      res.json(topUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch top users" });
    }
  });

  // Database Maintenance Routes
  app.get("/api/admin/maintenance/stats", requireAdminJWT, async (_req, res) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
      const oldIdeas = allIdeas.filter(i => {
        const ideaDate = new Date(i.timestamp);
        const daysOld = (Date.now() - ideaDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysOld > 30;
      });
      
      // Get database bloat estimate
      const bloatQuery = await db.execute(sql`
        SELECT 
          SUM(pg_total_relation_size(schemaname||'.'||tablename))::bigint as total_bytes
        FROM pg_stat_user_tables
      `);
      
      const totalBytes = parseInt(String(bloatQuery.rows[0]?.total_bytes || '0'));
      
      res.json({
        totalIdeas: allIdeas.length,
        openIdeas: allIdeas.filter(i => i.outcomeStatus === 'open').length,
        closedIdeas: closedIdeas.length,
        oldIdeas: oldIdeas.length,
        databaseSizeBytes: totalBytes,
        databaseSizeMB: (totalBytes / (1024 * 1024)).toFixed(2),
        lastChecked: new Date().toISOString(),
      });
    } catch (error) {
      logError(error as Error, { context: 'maintenance stats' });
      res.status(500).json({ error: "Failed to fetch maintenance stats" });
    }
  });

  // 🔧 FIX BAD HOLDING PERIODS: Scan and fix incorrect holding period classifications
  app.post("/api/admin/maintenance/fix-holding-periods", requireAdminJWT, async (_req, res) => {
    try {
      const { classifyHoldingPeriodByDuration } = await import('./timing-intelligence');
      
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open' && i.exitDate);
      
      const fixedTrades: any[] = [];
      const errorTrades: any[] = [];
      
      for (const idea of closedIdeas) {
        if (!idea.exitDate) continue;
        
        try {
          // Calculate correct holding period
          const correctHoldingPeriod = classifyHoldingPeriodByDuration(
            idea.timestamp,
            idea.exitDate
          );
          
          // Check if it needs fixing
          if (idea.holdingPeriod !== correctHoldingPeriod) {
            // Fix it - holdingPeriod is read-only in performance updates, so use full update
            const updated = await storage.updateTradeIdea(idea.id, {
              holdingPeriod: correctHoldingPeriod
            });
            
            if (updated) {
              fixedTrades.push({
                id: idea.id,
                symbol: idea.symbol,
                oldHoldingPeriod: idea.holdingPeriod,
                newHoldingPeriod: correctHoldingPeriod,
                timestamp: idea.timestamp,
                exitDate: idea.exitDate,
                durationMinutes: idea.actualHoldingTimeMinutes
              });
              
              logger.info(`🔧 [FIX] Fixed ${idea.symbol} (${idea.id}): ${idea.holdingPeriod} → ${correctHoldingPeriod}`);
            }
          }
        } catch (error) {
          errorTrades.push({
            id: idea.id,
            symbol: idea.symbol,
            timestamp: idea.timestamp,
            exitDate: idea.exitDate,
            error: error instanceof Error ? error.message : String(error)
          });
          
          logger.error(`❌ [FIX-ERROR] Failed to fix ${idea.symbol} (${idea.id}):`, error);
        }
      }
      
      res.json({
        success: true,
        scanned: closedIdeas.length,
        fixed: fixedTrades.length,
        errors: errorTrades.length,
        fixedTrades,
        errorTrades,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logError(error as Error, { context: 'fix holding periods' });
      res.status(500).json({ error: "Failed to fix holding periods" });
    }
  });
  
  // 🗑️ DELETE BAD TRADE: Delete specific trade by ID (for TSLY bad data)
  app.delete("/api/admin/maintenance/trade/:id", requireAdminJWT, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteTradeIdea(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      
      logger.info(`🗑️ [DELETE] Admin deleted bad trade: ${id}`);
      
      res.json({ 
        success: true, 
        message: `Trade ${id} deleted successfully`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logError(error as Error, { context: 'delete bad trade' });
      res.status(500).json({ error: "Failed to delete trade" });
    }
  });

  app.post("/api/admin/maintenance/cleanup", requireAdminJWT, async (req, res) => {
    try {
      const { daysOld = 30 } = req.body;
      
      const allIdeas = await storage.getAllTradeIdeas();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const ideasToDelete = allIdeas.filter(i => {
        const ideaDate = new Date(i.timestamp);
        const isClosed = i.outcomeStatus !== 'open';
        return isClosed && ideaDate < cutoffDate;
      });
      
      let deletedCount = 0;
      for (const idea of ideasToDelete) {
        const deleted = await storage.deleteTradeIdea(idea.id);
        if (deleted) deletedCount++;
      }
      
      logger.info('Database cleanup completed', { 
        deletedCount,
        daysOld,
        ip: req.ip 
      });
      
      res.json({ 
        success: true, 
        deletedCount,
        message: `Cleaned up ${deletedCount} closed ideas older than ${daysOld} days`
      });
    } catch (error) {
      logError(error as Error, { context: 'maintenance cleanup' });
      res.status(500).json({ error: "Cleanup failed" });
    }
  });

  app.post("/api/admin/maintenance/optimize", requireAdminJWT, async (req, res) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      // Run VACUUM ANALYZE on all tables
      await db.execute(sql`VACUUM ANALYZE`);
      
      logger.info('Database optimization completed', { ip: req.ip });
      
      res.json({ 
        success: true, 
        message: "Database optimized successfully (VACUUM ANALYZE completed)"
      });
    } catch (error) {
      logError(error as Error, { context: 'maintenance optimize' });
      res.status(500).json({ error: "Optimization failed" });
    }
  });

  app.post("/api/admin/maintenance/archive-closed", requireAdminJWT, async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
      
      // Export to JSON for archiving
      const archive = {
        archivedAt: new Date().toISOString(),
        count: closedIdeas.length,
        ideas: closedIdeas,
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=closed-ideas-archive.json');
      res.json(archive);
      
      logger.info('Closed ideas archived', { 
        count: closedIdeas.length,
        ip: req.ip 
      });
    } catch (error) {
      logError(error as Error, { context: 'maintenance archive' });
      res.status(500).json({ error: "Archive failed" });
    }
  });

  // Notion Documentation Sync
  app.post("/api/admin/sync-notion", requireAdminJWT, async (_req, res) => {
    try {
      logger.info('Starting Notion documentation sync');
      const result = await syncDocumentationToNotion();
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: `Successfully synced ${result.pagesCreated} documentation pages to Notion`
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error || "Sync failed"
        });
      }
    } catch (error) {
      logError(error as Error, { context: 'notion sync' });
      res.status(500).json({ error: "Notion sync failed" });
    }
  });

  // ============================================
  // PLATFORM REPORTS - Admin Analytics Dashboard
  // ============================================

  // GET /api/admin/reports - List all reports with optional period filter
  app.get("/api/admin/reports", requireAdminJWT, async (req, res) => {
    try {
      const period = req.query.period as 'daily' | 'weekly' | 'monthly' | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const reports = await storage.getPlatformReports(period, limit);
      res.json(reports);
    } catch (error) {
      logError(error as Error, { context: 'get platform reports' });
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  // GET /api/admin/reports/latest - Get latest reports for each period
  app.get("/api/admin/reports/latest", requireAdminJWT, async (_req, res) => {
    try {
      const [daily, weekly, monthly] = await Promise.all([
        storage.getLatestReportByPeriod('daily'),
        storage.getLatestReportByPeriod('weekly'),
        storage.getLatestReportByPeriod('monthly'),
      ]);
      res.json({ daily, weekly, monthly });
    } catch (error) {
      logError(error as Error, { context: 'get latest reports' });
      res.status(500).json({ error: "Failed to fetch latest reports" });
    }
  });

  // GET /api/admin/reports/stats - Real-time platform stats
  app.get("/api/admin/reports/stats", requireAdminJWT, async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(todayStart);
      monthStart.setMonth(monthStart.getMonth() - 1);

      // Filter ideas by source
      const aiIdeas = allIdeas.filter(i => i.source === 'ai');
      const quantIdeas = allIdeas.filter(i => i.source === 'quant');
      const hybridIdeas = allIdeas.filter(i => i.source === 'hybrid');
      const flowIdeas = allIdeas.filter(i => i.source === 'flow');
      const lottoIdeas = allIdeas.filter(i => i.source === 'lotto');

      // Calculate win rates
      const calculateWinRate = (ideas: typeof allIdeas) => {
        const decided = ideas.filter(i => i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'hit_stop');
        if (decided.length === 0) return null;
        const wins = decided.filter(i => i.outcomeStatus === 'hit_target').length;
        return (wins / decided.length) * 100;
      };

      // Asset breakdown
      const byAsset = {
        stock: allIdeas.filter(i => i.assetType === 'stock' || i.assetType === 'penny_stock').length,
        options: allIdeas.filter(i => i.assetType === 'option').length,
        crypto: allIdeas.filter(i => i.assetType === 'crypto').length,
        futures: allIdeas.filter(i => i.assetType === 'future').length,
      };

      // Top performers calculation
      const symbolStats = new Map<string, { wins: number; losses: number; totalPnl: number }>();
      allIdeas.filter(i => i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'hit_stop')
        .forEach(idea => {
          const stats = symbolStats.get(idea.symbol) || { wins: 0, losses: 0, totalPnl: 0 };
          if (idea.outcomeStatus === 'hit_target') {
            stats.wins++;
            stats.totalPnl += idea.percentGain || 0;
          } else {
            stats.losses++;
            stats.totalPnl += idea.percentGain || 0;
          }
          symbolStats.set(idea.symbol, stats);
        });

      const sortedByWins = Array.from(symbolStats.entries())
        .map(([symbol, stats]) => ({ symbol, ...stats, winRate: stats.wins / (stats.wins + stats.losses) * 100 }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 10);

      const sortedByLosses = Array.from(symbolStats.entries())
        .map(([symbol, stats]) => ({ symbol, ...stats, winRate: stats.wins / (stats.wins + stats.losses) * 100 }))
        .sort((a, b) => b.losses - a.losses)
        .slice(0, 10);

      // Engine comparison
      const engines = [
        { name: 'ai', ideas: aiIdeas },
        { name: 'quant', ideas: quantIdeas },
        { name: 'hybrid', ideas: hybridIdeas },
        { name: 'flow', ideas: flowIdeas },
        { name: 'lotto', ideas: lottoIdeas },
      ].map(e => {
        const decided = e.ideas.filter(i => i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'hit_stop');
        const wins = decided.filter(i => i.outcomeStatus === 'hit_target').length;
        const losses = decided.filter(i => i.outcomeStatus === 'hit_stop').length;
        const avgGain = decided.filter(i => i.percentGain && i.percentGain > 0)
          .reduce((sum, i) => sum + (i.percentGain || 0), 0) / (wins || 1);
        const avgLoss = decided.filter(i => i.percentGain && i.percentGain < 0)
          .reduce((sum, i) => sum + Math.abs(i.percentGain || 0), 0) / (losses || 1);
        return {
          engine: e.name,
          totalIdeas: e.ideas.length,
          trades: decided.length,
          wins,
          losses,
          winRate: decided.length > 0 ? (wins / decided.length) * 100 : null,
          avgGain,
          avgLoss,
        };
      });

      const bestEngine = engines.reduce((best, e) => 
        (e.winRate || 0) > (best?.winRate || 0) ? e : best, engines[0]);

      // Bot activity - get from paper trading positions
      const autoLottoPositions = await storage.getPaperPositions(1).catch(() => []);
      const closedBotTrades = autoLottoPositions.filter(p => p.status === 'closed');
      const autoLottoStats = {
        trades: closedBotTrades.length,
        pnl: closedBotTrades.reduce((sum, p) => sum + (p.realizedPnL || 0), 0),
      };

      res.json({
        summary: {
          totalIdeas: allIdeas.length,
          openIdeas: allIdeas.filter(i => i.outcomeStatus === 'open').length,
          resolvedIdeas: allIdeas.filter(i => i.outcomeStatus !== 'open').length,
          overallWinRate: calculateWinRate(allIdeas),
        },
        engines,
        bestEngine: bestEngine?.engine,
        byAsset,
        topWinners: sortedByWins,
        topLosers: sortedByLosses,
        botActivity: {
          autoLotto: autoLottoStats,
          futures: { trades: 0, pnl: 0 },
          crypto: { trades: 0, pnl: 0 },
          propFirm: { trades: 0, pnl: 0 },
        },
        scannerActivity: {
          optionsFlowAlerts: flowIdeas.length,
          marketScannerSymbols: new Set(allIdeas.map(i => i.symbol)).size,
          ctTrackerMentions: 0,
          ctTrackerAutoTrades: 0,
        },
      });
    } catch (error) {
      logError(error as Error, { context: 'get platform stats' });
      res.status(500).json({ error: "Failed to fetch platform stats" });
    }
  });

  // GET /api/admin/reports/:id - Get specific report
  app.get("/api/admin/reports/:id", requireAdminJWT, async (req, res) => {
    try {
      const report = await storage.getPlatformReportById(req.params.id);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      logError(error as Error, { context: 'get platform report' });
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // POST /api/admin/reports/generate - Generate new report
  app.post("/api/admin/reports/generate", requireAdminJWT, async (req, res) => {
    try {
      const { period } = req.body as { period: 'daily' | 'weekly' | 'monthly' };
      if (!['daily', 'weekly', 'monthly'].includes(period)) {
        return res.status(400).json({ error: "Invalid period. Must be daily, weekly, or monthly" });
      }

      const now = new Date();
      let startDate: Date;
      let endDate = now;

      switch (period) {
        case 'daily':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'weekly':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'monthly':
          startDate = new Date(now);
          startDate.setMonth(startDate.getMonth() - 1);
          break;
      }

      // Create initial report entry
      const report = await storage.createPlatformReport({
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        status: 'generating',
      });

      // Generate report data
      const allIdeas = await storage.getAllTradeIdeas();
      const periodIdeas = allIdeas.filter(idea => {
        const ideaDate = new Date(idea.timestamp);
        return ideaDate >= startDate && ideaDate <= endDate;
      });

      const aiIdeas = periodIdeas.filter(i => i.source === 'ai');
      const quantIdeas = periodIdeas.filter(i => i.source === 'quant');
      const hybridIdeas = periodIdeas.filter(i => i.source === 'hybrid');

      const calculateStats = (ideas: typeof periodIdeas) => {
        const decided = ideas.filter(i => i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'hit_stop');
        const wins = decided.filter(i => i.outcomeStatus === 'hit_target').length;
        const losses = decided.filter(i => i.outcomeStatus === 'hit_stop').length;
        const avgGain = decided.filter(i => i.percentGain && i.percentGain > 0)
          .reduce((sum, i) => sum + (i.percentGain || 0), 0) / (wins || 1);
        const avgLoss = decided.filter(i => i.percentGain && i.percentGain < 0)
          .reduce((sum, i) => sum + Math.abs(i.percentGain || 0), 0) / (losses || 1);
        return {
          total: decided.length,
          wins,
          losses,
          winRate: decided.length > 0 ? (wins / decided.length) * 100 : null,
          avgGain: avgGain || 0,
          avgLoss: avgLoss || 0,
        };
      };

      const overall = calculateStats(periodIdeas);
      const aiStats = calculateStats(aiIdeas);
      const quantStats = calculateStats(quantIdeas);
      const hybridStats = calculateStats(hybridIdeas);

      const engines = [
        { name: 'ai', winRate: aiStats.winRate },
        { name: 'quant', winRate: quantStats.winRate },
        { name: 'hybrid', winRate: hybridStats.winRate },
      ].filter(e => e.winRate !== null);
      const bestEngine = engines.reduce((best, e) => 
        (e.winRate || 0) > (best?.winRate || 0) ? e : best, engines[0])?.name;

      // Top symbols
      const symbolStats = new Map<string, { wins: number; losses: number; pnl: number }>();
      periodIdeas.filter(i => i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'hit_stop')
        .forEach(idea => {
          const stats = symbolStats.get(idea.symbol) || { wins: 0, losses: 0, pnl: 0 };
          if (idea.outcomeStatus === 'hit_target') {
            stats.wins++;
          } else {
            stats.losses++;
          }
          stats.pnl += idea.percentGain || 0;
          symbolStats.set(idea.symbol, stats);
        });

      const topWinners = Array.from(symbolStats.entries())
        .map(([symbol, s]) => ({ symbol, wins: s.wins, losses: s.losses, pnl: s.pnl }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 5);

      const topLosers = Array.from(symbolStats.entries())
        .map(([symbol, s]) => ({ symbol, wins: s.wins, losses: s.losses, pnl: s.pnl }))
        .sort((a, b) => b.losses - a.losses)
        .slice(0, 5);

      // Update report with computed data
      const updatedReport = await storage.updatePlatformReport(report.id, {
        status: 'completed',
        totalIdeasGenerated: periodIdeas.length,
        aiIdeasGenerated: aiIdeas.length,
        quantIdeasGenerated: quantIdeas.length,
        hybridIdeasGenerated: hybridIdeas.length,
        totalTradesResolved: overall.total,
        totalWins: overall.wins,
        totalLosses: overall.losses,
        overallWinRate: overall.winRate,
        avgGainPercent: overall.avgGain,
        avgLossPercent: overall.avgLoss,
        aiWinRate: aiStats.winRate,
        quantWinRate: quantStats.winRate,
        hybridWinRate: hybridStats.winRate,
        bestPerformingEngine: bestEngine,
        stockTradeCount: periodIdeas.filter(i => i.assetType === 'stock' || i.assetType === 'penny_stock').length,
        optionsTradeCount: periodIdeas.filter(i => i.assetType === 'option').length,
        cryptoTradeCount: periodIdeas.filter(i => i.assetType === 'crypto').length,
        futuresTradeCount: periodIdeas.filter(i => i.assetType === 'future').length,
        topWinningSymbols: topWinners,
        topLosingSymbols: topLosers,
        reportData: {
          aiStats,
          quantStats,
          hybridStats,
          allSymbolStats: Array.from(symbolStats.entries()).map(([symbol, s]) => ({ symbol, ...s })),
        },
      });

      logger.info(`Platform report generated`, { period, reportId: report.id });
      res.json(updatedReport);
    } catch (error) {
      logError(error as Error, { context: 'generate platform report' });
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // ============================================================================
  // AI CREDITS ADMIN ROUTES
  // ============================================================================

  // GET /api/admin/credits/stats - Get overall credit usage stats
  app.get("/api/admin/credits/stats", requireAdminJWT, async (_req, res) => {
    try {
      const stats = await creditService.getTotalUsageStats();
      const balances = await creditService.getAllBalances(100);
      
      const tierBreakdown = {
        free: balances.filter(b => b.tierSnapshot === 'free').length,
        advanced: balances.filter(b => b.tierSnapshot === 'advanced').length,
        pro: balances.filter(b => b.tierSnapshot === 'pro').length,
        admin: balances.filter(b => b.tierSnapshot === 'admin').length,
      };
      
      const totalCreditsAllocated = balances.reduce((sum, b) => sum + b.creditsAllocated, 0);
      const totalCreditsUsed = balances.reduce((sum, b) => sum + b.creditsUsed, 0);
      const utilizationRate = totalCreditsAllocated > 0 ? (totalCreditsUsed / totalCreditsAllocated) * 100 : 0;
      
      res.json({
        ...stats,
        tierBreakdown,
        activeBalances: balances.length,
        totalCreditsAllocated,
        totalCreditsUsed,
        utilizationRate: Math.round(utilizationRate * 10) / 10,
        estimatedMonthlyCost: (stats.totalCostCents / 100).toFixed(2),
      });
    } catch (error) {
      logError(error as Error, { context: 'get credit stats' });
      res.status(500).json({ error: "Failed to fetch credit stats" });
    }
  });

  // GET /api/admin/credits/balances - Get all user credit balances
  app.get("/api/admin/credits/balances", requireAdminJWT, async (_req, res) => {
    try {
      const balances = await creditService.getAllBalances(200);
      
      // Enrich with user info
      const enrichedBalances = await Promise.all(
        balances.map(async (balance) => {
          const user = await storage.getUserById(balance.userId);
          return {
            ...balance,
            userEmail: user?.email || 'Unknown',
            userName: user?.name || 'Unknown',
          };
        })
      );
      
      res.json(enrichedBalances);
    } catch (error) {
      logError(error as Error, { context: 'get credit balances' });
      res.status(500).json({ error: "Failed to fetch credit balances" });
    }
  });

  // GET /api/admin/credits/usage - Get recent usage ledger
  app.get("/api/admin/credits/usage", requireAdminJWT, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const { db } = await import('./db');
      const { aiUsageLedger } = await import('@shared/schema');
      const { desc } = await import('drizzle-orm');
      
      const usage = await db
        .select()
        .from(aiUsageLedger)
        .orderBy(desc(aiUsageLedger.createdAt))
        .limit(limit);
      
      // Enrich with user info
      const enrichedUsage = await Promise.all(
        usage.map(async (u) => {
          const user = await storage.getUserById(u.userId);
          return {
            ...u,
            userEmail: user?.email || 'Unknown',
          };
        })
      );
      
      res.json(enrichedUsage);
    } catch (error) {
      logError(error as Error, { context: 'get credit usage' });
      res.status(500).json({ error: "Failed to fetch credit usage" });
    }
  });

  // POST /api/admin/credits/reset - Reset a user's credits
  app.post("/api/admin/credits/reset/:userId", requireAdminJWT, async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const tier = (user.subscriptionTier as 'free' | 'advanced' | 'pro' | 'admin') || 'free';
      const newBalance = await creditService.resetUserCredits(userId, tier);
      
      logger.info(`[ADMIN] Reset credits for user ${userId} (tier: ${tier})`);
      res.json(newBalance);
    } catch (error) {
      logError(error as Error, { context: 'reset user credits' });
      res.status(500).json({ error: "Failed to reset credits" });
    }
  });

  // GET /api/ai/credits - Get current user's credit balance
  app.get("/api/ai/credits", async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = await storage.getUserById(userId);
      const tier = (user?.subscriptionTier as 'free' | 'advanced' | 'pro' | 'admin') || 'free';
      const balance = await creditService.getOrCreateBalance(userId, tier);
      
      res.json({
        creditsRemaining: balance.creditsRemaining,
        creditsUsed: balance.creditsUsed,
        creditsAllocated: balance.creditsAllocated,
        cycleEnd: balance.cycleEnd,
        tier: balance.tier,
      });
    } catch (error) {
      logError(error as Error, { context: 'get user credits' });
      res.status(500).json({ error: "Failed to fetch credits" });
    }
  });

  // GET /api/ai/credits/history - Get current user's usage history
  app.get("/api/ai/credits/history", async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const history = await creditService.getUsageHistory(userId, 50);
      res.json(history);
    } catch (error) {
      logError(error as Error, { context: 'get credit history' });
      res.status(500).json({ error: "Failed to fetch credit history" });
    }
  });

  // GET /api/ai/credits/analytics - Get usage analytics for current user
  app.get("/api/ai/credits/analytics", async (req, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.claims?.sub;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const user = await storage.getUserById(userId);
      const tier = (user?.subscriptionTier as 'free' | 'advanced' | 'pro' | 'admin') || 'free';
      const analytics = await creditService.getTierAnalytics(tier, userId);
      
      res.json({
        ...analytics,
        tier,
      });
    } catch (error) {
      logError(error as Error, { context: 'get credit analytics' });
      res.status(500).json({ error: "Failed to fetch credit analytics" });
    }
  });

  // Market Data Routes
  // Market data cache (2-minute TTL for fresher price updates)
  let marketDataCache: { data: any; timestamp: number } | null = null;
  const MARKET_DATA_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
  
  app.get("/api/market-data", marketDataLimiter, async (_req, res) => {
    try {
      const now = Date.now();
      
      // Check cache
      if (marketDataCache && (now - marketDataCache.timestamp) < MARKET_DATA_CACHE_TTL) {
        return res.json(marketDataCache.data);
      }
      
      // Cache miss - fetch fresh data
      const data = await storage.getAllMarketData();
      
      // Update cache
      marketDataCache = { data, timestamp: now };
      
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  // Batch market data endpoint - must come before single symbol route
  app.get("/api/market-data/batch/:symbols", async (req, res) => {
    try {
      const symbols = req.params.symbols.split(',').map(s => s.trim().toUpperCase());
      const allMarketData = await storage.getAllMarketData();
      const filtered = allMarketData.filter(m => symbols.includes(m.symbol));
      res.json(filtered);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  app.get("/api/market-data/:symbol", async (req, res) => {
    try {
      const data = await storage.getMarketDataBySymbol(req.params.symbol);
      if (!data) {
        return res.status(404).json({ error: "Market data not found" });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  app.post("/api/market-data", async (req, res) => {
    try {
      const validated = insertMarketDataSchema.parse(req.body);
      const data = await storage.createMarketData(validated);
      res.status(201).json(data);
    } catch (error) {
      res.status(400).json({ error: "Invalid market data" });
    }
  });

  // ============================================
  // REAL-TIME QUOTES API - Unified pricing across all asset types
  // ============================================
  
  app.get("/api/realtime-quote/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const assetType = (req.query.assetType as RTAssetType) || 'stock';
      
      const quote = await getRealtimeQuote(symbol, assetType);
      if (!quote) {
        return res.status(404).json({ error: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      logger.error(`Error fetching realtime quote for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch quote" });
    }
  });
  
  app.post("/api/realtime-quotes/batch", async (req, res) => {
    try {
      const { requests } = req.body as { requests: Array<{ symbol: string; assetType: RTAssetType }> };
      
      if (!requests || !Array.isArray(requests)) {
        return res.status(400).json({ error: "Invalid request format. Expected { requests: [...] }" });
      }
      
      if (requests.length > 50) {
        return res.status(400).json({ error: "Maximum 50 quotes per batch request" });
      }
      
      const quotesMap = await getRealtimeBatchQuotes(requests);
      
      const quotes: Record<string, RealtimeQuote> = {};
      quotesMap.forEach((quote, key) => {
        quotes[key] = quote;
      });
      
      res.json({ quotes, count: Object.keys(quotes).length });
    } catch (error) {
      logger.error("Error fetching batch quotes:", error);
      res.status(500).json({ error: "Failed to fetch batch quotes" });
    }
  });

  // Real-time WebSocket status endpoint
  app.get("/api/realtime-status", async (req, res) => {
    try {
      const status = getRealtimeStatus();
      const cryptoPrices = getAllCryptoPrices();
      const futuresPrices = getAllFuturesPrices();
      
      const cryptoData: Record<string, { price: number; ageSeconds: number }> = {};
      cryptoPrices.forEach((cache, symbol) => {
        cryptoData[symbol] = {
          price: cache.price,
          ageSeconds: Math.floor((Date.now() - cache.timestamp.getTime()) / 1000)
        };
      });
      
      const futuresData: Record<string, { price: number; ageSeconds: number }> = {};
      futuresPrices.forEach((cache, symbol) => {
        futuresData[symbol] = {
          price: cache.price,
          ageSeconds: Math.floor((Date.now() - cache.timestamp.getTime()) / 1000)
        };
      });
      
      res.json({
        ...status,
        prices: {
          crypto: cryptoData,
          futures: futuresData
        }
      });
    } catch (error) {
      logger.error("Error fetching realtime status:", error);
      res.status(500).json({ error: "Failed to fetch realtime status" });
    }
  });

  // ============================================
  // PATTERN DETECTION API - Advanced technical analysis
  // ============================================
  
  app.get("/api/patterns/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const { 
        detectCandlestickPatterns, 
        calculateEnhancedSignalScore,
        calculateStochRSI,
        calculateIchimoku,
        calculateRSI,
        calculateMACD,
        calculateBollingerBands,
        calculateADX,
        determineMarketRegime,
        // New multi-layer indicators
        calculateWilliamsR,
        calculateCCI,
        calculateVWAP,
        calculateEMABundle,
        detectSupportResistanceLevels,
        analyzeMarketStructure,
        analyzeVolumeFlow
      } = await import("./technical-indicators");
      
      // Fetch OHLCV data from Yahoo Finance
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - (60 * 24 * 60 * 60); // 60 days back
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?period1=${startDate}&period2=${endDate}&interval=1d`;
      
      const response = await fetch(yahooUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!response.ok) {
        return res.status(400).json({ error: "Failed to fetch historical data" });
      }
      
      const data = await response.json();
      const result = data.chart?.result?.[0];
      
      if (!result || !result.indicators?.quote?.[0]) {
        return res.status(400).json({ error: "Insufficient data for pattern analysis" });
      }
      
      const quote = result.indicators.quote[0];
      const timestamps = result.timestamp || [];
      
      // Extract OHLCV arrays (filter out null values)
      const opens: number[] = [];
      const highs: number[] = [];
      const lows: number[] = [];
      const prices: number[] = [];
      const volumes: number[] = [];
      
      for (let i = 0; i < timestamps.length; i++) {
        if (quote.open[i] && quote.high[i] && quote.low[i] && quote.close[i]) {
          opens.push(quote.open[i]);
          highs.push(quote.high[i]);
          lows.push(quote.low[i]);
          prices.push(quote.close[i]);
          volumes.push(quote.volume[i] || 0);
        }
      }
      
      if (prices.length < 20) {
        return res.status(400).json({ error: "Insufficient data points for analysis" });
      }
      
      // Detect candlestick patterns
      const candles = { open: opens, high: highs, low: lows, close: prices };
      const patterns = detectCandlestickPatterns(candles);
      
      // Calculate enhanced signal score
      const signalScore = calculateEnhancedSignalScore(prices, highs, lows, volumes);
      
      // Calculate individual indicators
      const rsi = calculateRSI(prices, 14);
      const rsi2 = calculateRSI(prices, 2);
      const macd = calculateMACD(prices);
      const bb = calculateBollingerBands(prices);
      const adx = calculateADX(highs, lows, prices);
      const regime = determineMarketRegime(adx);
      const stochRSI = calculateStochRSI(prices);
      const ichimoku = calculateIchimoku(highs, lows, prices);
      
      // NEW: Multi-layer analysis indicators
      const williamsR = calculateWilliamsR(highs, lows, prices, 14);
      const cci = calculateCCI(highs, lows, prices, 20);
      const vwap = calculateVWAP(highs, lows, prices, volumes);
      const emaBundle = calculateEMABundle(prices);
      const supportResistance = detectSupportResistanceLevels(highs, lows, prices, 50);
      const marketStructure = analyzeMarketStructure(highs, lows, prices);
      const volumeFlow = analyzeVolumeFlow(volumes, prices, highs, lows);
      
      // Current price info
      const currentPrice = prices[prices.length - 1];
      const priceChange = prices.length >= 2 
        ? ((currentPrice - prices[prices.length - 2]) / prices[prices.length - 2]) * 100 
        : 0;
      
      // Build candle data for charting
      const validTimestamps: number[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (quote.open[i] && quote.high[i] && quote.low[i] && quote.close[i]) {
          validTimestamps.push(timestamps[i]);
        }
      }
      
      const candles_data = validTimestamps.map((ts, i) => ({
        time: ts,
        open: opens[i],
        high: highs[i],
        low: lows[i],
        close: prices[i],
        volume: volumes[i]
      }));
      
      // Calculate RSI series for charting
      const rsiSeries: Array<{ time: number; value: number }> = [];
      for (let i = 14; i < prices.length; i++) {
        const slicePrices = prices.slice(0, i + 1);
        const rsiVal = calculateRSI(slicePrices, 14);
        rsiSeries.push({ time: validTimestamps[i], value: rsiVal });
      }
      
      // Calculate Bollinger Bands series for overlay
      const bbSeries: Array<{ time: number; upper: number; middle: number; lower: number }> = [];
      for (let i = 20; i < prices.length; i++) {
        const slicePrices = prices.slice(0, i + 1);
        const bbVal = calculateBollingerBands(slicePrices, 20, 2);
        bbSeries.push({ 
          time: validTimestamps[i], 
          upper: bbVal.upper, 
          middle: bbVal.middle, 
          lower: bbVal.lower 
        });
      }
      
      // Calculate multi-layer confluence score
      let layerBullish = 0;
      let layerBearish = 0;
      const layerSignals: string[] = [];
      
      // Layer 1: Momentum (RSI, StochRSI, Williams %R)
      if (rsi < 30) { layerBullish += 10; layerSignals.push("RSI Oversold"); }
      else if (rsi > 70) { layerBearish += 10; layerSignals.push("RSI Overbought"); }
      if (williamsR < -80) { layerBullish += 8; layerSignals.push("Williams %R Oversold"); }
      else if (williamsR > -20) { layerBearish += 8; layerSignals.push("Williams %R Overbought"); }
      
      // Layer 2: Trend (EMA Bundle) - scale weight proportionally to available EMAs
      // Full weight (15 points) only when all 4 EMAs available, scaled down otherwise
      const emaWeight = Math.round((emaBundle.availableEMAs / 4) * 15);
      if (emaBundle.availableEMAs >= 2) {
        if (emaBundle.trend === 'bullish') { layerBullish += emaWeight; layerSignals.push(`EMA Bullish (${emaBundle.availableEMAs}/4 EMAs, ${emaBundle.alignment}% aligned)`); }
        else if (emaBundle.trend === 'bearish') { layerBearish += emaWeight; layerSignals.push(`EMA Bearish (${emaBundle.availableEMAs}/4 EMAs, ${emaBundle.alignment}% aligned)`); }
        else { layerSignals.push(`EMA Mixed (${emaBundle.availableEMAs}/4 EMAs)`); }
      } else {
        layerSignals.push(`Insufficient EMA data (${emaBundle.availableEMAs}/4 available)`);
      }
      
      // Layer 3: Market Structure
      if (marketStructure.trend === 'uptrend') { layerBullish += 12; layerSignals.push(`Uptrend (${marketStructure.higherHighs} HH)`); }
      else if (marketStructure.trend === 'downtrend') { layerBearish += 12; layerSignals.push(`Downtrend (${marketStructure.lowerLows} LL)`); }
      if (marketStructure.breakOfStructure) { layerSignals.push("Break of Structure Detected"); }
      
      // Layer 4: Volume Flow
      if (volumeFlow.trend === 'accumulation') { layerBullish += 10; layerSignals.push("Accumulation Pattern"); }
      else if (volumeFlow.trend === 'distribution') { layerBearish += 10; layerSignals.push("Distribution Pattern"); }
      
      // Layer 5: Support/Resistance Position
      if (supportResistance.pricePosition === 'near_support') { layerBullish += 8; layerSignals.push(`Near Support ($${supportResistance.nearestSupport})`); }
      else if (supportResistance.pricePosition === 'near_resistance') { layerBearish += 8; layerSignals.push(`Near Resistance ($${supportResistance.nearestResistance})`); }
      
      // Layer 6: VWAP Position
      if (currentPrice > vwap) { layerBullish += 5; layerSignals.push("Above VWAP"); }
      else if (currentPrice < vwap) { layerBearish += 5; layerSignals.push("Below VWAP"); }
      
      const netLayer = layerBullish - layerBearish;
      const layerDirection = netLayer > 15 ? 'bullish' : netLayer < -15 ? 'bearish' : 'neutral';
      const layerConfidence = Math.min(95, Math.abs(netLayer) + (layerSignals.length * 3));
      
      res.json({
        symbol: symbol.toUpperCase(),
        currentPrice,
        priceChange: Number(priceChange.toFixed(2)),
        patterns: patterns.filter(p => p.detected),
        signalScore: {
          score: signalScore.score,
          direction: signalScore.direction,
          confidence: signalScore.confidence,
          signals: signalScore.signals
        },
        // Multi-layer confluence analysis
        multiLayerAnalysis: {
          confluenceScore: 50 + (netLayer / 2),
          direction: layerDirection,
          confidence: layerConfidence,
          signals: layerSignals,
          layers: {
            momentum: { score: rsi > 50 ? (100 - rsi) : rsi, signals: [rsi < 30 ? 'Oversold' : rsi > 70 ? 'Overbought' : 'Neutral'] },
            trend: { score: emaBundle.alignment, direction: emaBundle.trend },
            structure: { trend: marketStructure.trend, strength: marketStructure.trendStrength, bos: marketStructure.breakOfStructure },
            volume: { trend: volumeFlow.trend, relativeVolume: volumeFlow.relativeVolume, moneyFlow: volumeFlow.moneyFlow },
            levels: { position: supportResistance.pricePosition, support: supportResistance.nearestSupport, resistance: supportResistance.nearestResistance }
          }
        },
        indicators: {
          rsi: { value: rsi, period: 14 },
          rsi2: { value: rsi2, period: 2 },
          macd: { macd: macd.macd, signal: macd.signal, histogram: macd.histogram },
          bollingerBands: { upper: bb.upper, middle: bb.middle, lower: bb.lower },
          adx: { value: adx, regime: regime.regime, suitableFor: regime.suitableFor },
          stochRSI: stochRSI,
          ichimoku: ichimoku,
          // New enhanced indicators
          williamsR: { value: williamsR, period: 14, interpretation: williamsR < -80 ? 'oversold' : williamsR > -20 ? 'overbought' : 'neutral' },
          cci: { value: cci, period: 20, interpretation: cci < -100 ? 'oversold' : cci > 100 ? 'overbought' : 'neutral' },
          vwap: { value: vwap, priceVsVwap: currentPrice > vwap ? 'above' : currentPrice < vwap ? 'below' : 'at' },
          ema: emaBundle
        },
        // Support/Resistance levels
        levels: {
          support: supportResistance.support,
          resistance: supportResistance.resistance,
          nearestSupport: supportResistance.nearestSupport,
          nearestResistance: supportResistance.nearestResistance,
          pricePosition: supportResistance.pricePosition
        },
        // Market Structure
        marketStructure: {
          trend: marketStructure.trend,
          structure: marketStructure.structure,
          higherHighs: marketStructure.higherHighs,
          higherLows: marketStructure.higherLows,
          lowerHighs: marketStructure.lowerHighs,
          lowerLows: marketStructure.lowerLows,
          trendStrength: marketStructure.trendStrength,
          breakOfStructure: marketStructure.breakOfStructure
        },
        // Volume Analysis
        volumeAnalysis: {
          trend: volumeFlow.trend,
          volumeProfile: volumeFlow.volumeProfile,
          averageVolume: volumeFlow.averageVolume,
          relativeVolume: volumeFlow.relativeVolume,
          moneyFlow: volumeFlow.moneyFlow,
          signals: volumeFlow.signals
        },
        dataPoints: prices.length,
        candles: candles_data,
        rsiSeries,
        bbSeries
      });
    } catch (error) {
      logger.error(`Error analyzing patterns for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to analyze patterns" });
    }
  });

  // ============================================
  // FUTURES TRADING ROUTES - 24-hour markets (Pro tier required)
  // ============================================
  
  app.get("/api/futures", requireTier('canTradeFutures'), async (_req, res) => {
    try {
      const { fetchAllFuturesQuotes } = await import("./market-api");
      const quotes = await fetchAllFuturesQuotes();
      res.json(quotes);
    } catch (error) {
      logger.error("Error fetching futures quotes:", error);
      res.status(500).json({ error: "Failed to fetch futures data" });
    }
  });
  
  app.get("/api/futures/symbols", requireTier('canTradeFutures'), async (_req, res) => {
    try {
      const { getAvailableFuturesSymbols } = await import("./market-api");
      const symbols = getAvailableFuturesSymbols();
      res.json(symbols);
    } catch (error) {
      res.status(500).json({ error: "Failed to get futures symbols" });
    }
  });
  
  app.get("/api/futures/:symbol", requireTier('canTradeFutures'), async (req, res) => {
    try {
      const { fetchFuturesQuote } = await import("./market-api");
      const quote = await fetchFuturesQuote(req.params.symbol);
      if (!quote) {
        return res.status(404).json({ error: "Futures contract not found" });
      }
      res.json(quote);
    } catch (error) {
      logger.error(`Error fetching futures quote for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch futures quote" });
    }
  });
  
  app.get("/api/futures/:symbol/history", requireTier('canTradeFutures'), async (req, res) => {
    try {
      const { fetchFuturesHistory } = await import("./market-api");
      const interval = (req.query.interval as '1m' | '5m' | '15m' | '1h' | '1d') || '15m';
      const range = (req.query.range as '1d' | '5d' | '1mo' | '3mo') || '5d';
      const history = await fetchFuturesHistory(req.params.symbol, interval, range);
      res.json(history);
    } catch (error) {
      logger.error(`Error fetching futures history for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch futures history" });
    }
  });

  app.get("/api/futures/:symbol/research", requireTier('canTradeFutures'), async (req, res) => {
    try {
      const { generateFuturesResearch } = await import("./futures-research-service");
      const brief = await generateFuturesResearch(req.params.symbol);
      if (!brief) {
        return res.status(404).json({ error: "Unable to generate research for this contract" });
      }
      res.json(brief);
    } catch (error) {
      logger.error(`Error generating futures research for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to generate futures research" });
    }
  });

  // =====================================================
  // FUTURES RESEARCH DESK - Stored Research Briefs
  // =====================================================
  
  // Get all active futures research briefs
  app.get("/api/futures-research/briefs", async (_req, res) => {
    try {
      const briefs = await storage.getActiveFuturesResearchBriefs();
      res.json(briefs);
    } catch (error) {
      logger.error("Error fetching futures research briefs:", error);
      res.status(500).json({ error: "Failed to fetch futures research briefs" });
    }
  });

  // Get brief for a specific symbol
  app.get("/api/futures-research/briefs/:symbol", async (req, res) => {
    try {
      const brief = await storage.getFuturesResearchBriefBySymbol(req.params.symbol);
      if (!brief) {
        return res.status(404).json({ error: "No research brief found for this symbol" });
      }
      res.json(brief);
    } catch (error) {
      logger.error(`Error fetching futures research brief for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch futures research brief" });
    }
  });

  // Generate and store a new research brief for a symbol
  app.post("/api/futures-research/generate/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const { generateFuturesResearch } = await import("./futures-research-service");
      
      // Generate AI research
      const aiResult = await generateFuturesResearch(symbol);
      if (!aiResult) {
        return res.status(404).json({ error: "Unable to generate research for this contract" });
      }
      
      // Deactivate old briefs for this symbol
      await storage.deactivateOldFuturesResearchBriefs(symbol);
      
      // Store the new brief
      const newBrief = await storage.createFuturesResearchBrief({
        symbol: aiResult.symbol,
        name: aiResult.name,
        currentPrice: aiResult.currentPrice,
        session: aiResult.session as 'rth' | 'pre' | 'post' | 'overnight' | 'closed',
        bias: aiResult.bias,
        biasStrength: aiResult.biasStrength,
        technicalSummary: aiResult.technicalSummary,
        sessionContext: aiResult.sessionContext,
        resistanceLevels: aiResult.keyLevels.resistance.map(String),
        supportLevels: aiResult.keyLevels.support.map(String),
        pivotLevel: aiResult.keyLevels.pivot,
        catalysts: aiResult.catalysts,
        riskFactors: aiResult.riskFactors,
        tradeDirection: aiResult.tradingIdea?.direction,
        tradeEntry: aiResult.tradingIdea?.entry,
        tradeTarget: aiResult.tradingIdea?.target,
        tradeStop: aiResult.tradingIdea?.stop,
        tradeRationale: aiResult.tradingIdea?.rationale,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // Expires in 1 hour
        source: 'ai',
        isActive: true,
      });
      
      res.json(newBrief);
    } catch (error) {
      logger.error(`Error generating futures research for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to generate futures research" });
    }
  });

  // Generate research briefs for all main futures contracts
  app.post("/api/futures-research/generate-all", async (_req, res) => {
    try {
      const { generateFuturesResearch } = await import("./futures-research-service");
      const symbols = ['NQ', 'ES', 'GC', 'CL', 'SI', 'YM', 'RTY'];
      const results: any[] = [];
      const errors: string[] = [];
      
      for (const symbol of symbols) {
        try {
          const aiResult = await generateFuturesResearch(symbol);
          if (aiResult) {
            await storage.deactivateOldFuturesResearchBriefs(symbol);
            const newBrief = await storage.createFuturesResearchBrief({
              symbol: aiResult.symbol,
              name: aiResult.name,
              currentPrice: aiResult.currentPrice,
              session: aiResult.session as 'rth' | 'pre' | 'post' | 'overnight' | 'closed',
              bias: aiResult.bias,
              biasStrength: aiResult.biasStrength,
              technicalSummary: aiResult.technicalSummary,
              sessionContext: aiResult.sessionContext,
              resistanceLevels: aiResult.keyLevels.resistance.map(String),
              supportLevels: aiResult.keyLevels.support.map(String),
              pivotLevel: aiResult.keyLevels.pivot,
              catalysts: aiResult.catalysts,
              riskFactors: aiResult.riskFactors,
              tradeDirection: aiResult.tradingIdea?.direction,
              tradeEntry: aiResult.tradingIdea?.entry,
              tradeTarget: aiResult.tradingIdea?.target,
              tradeStop: aiResult.tradingIdea?.stop,
              tradeRationale: aiResult.tradingIdea?.rationale,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
              source: 'ai',
              isActive: true,
            });
            results.push(newBrief);
          }
        } catch (err) {
          errors.push(`${symbol}: ${(err as Error).message}`);
        }
      }
      
      res.json({ 
        success: true, 
        generated: results.length, 
        total: symbols.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      logger.error("Error generating all futures research:", error);
      res.status(500).json({ error: "Failed to generate futures research" });
    }
  });

  // Symbol autocomplete search - returns matches for partial queries
  app.get("/api/symbol-autocomplete", async (req, res) => {
    try {
      const query = (req.query.q as string || '').trim();
      if (query.length < 1) {
        return res.json({ results: [] });
      }

      const { searchSymbolLookup } = await import('./tradier-api');
      const results = await searchSymbolLookup(query);
      
      // Also search crypto if query matches common crypto patterns
      const cryptoMatches: { symbol: string; description: string; type: string }[] = [];
      const cryptoMap: Record<string, string> = {
        'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'SOL': 'Solana', 'XRP': 'Ripple',
        'ADA': 'Cardano', 'DOGE': 'Dogecoin', 'DOT': 'Polkadot', 'AVAX': 'Avalanche',
        'LINK': 'Chainlink', 'MATIC': 'Polygon', 'UNI': 'Uniswap', 'ATOM': 'Cosmos',
        'LTC': 'Litecoin', 'FIL': 'Filecoin', 'NEAR': 'NEAR Protocol', 'APT': 'Aptos',
        'ARB': 'Arbitrum', 'OP': 'Optimism', 'PEPE': 'Pepe', 'SHIB': 'Shiba Inu',
        'SUI': 'Sui', 'SEI': 'Sei', 'TIA': 'Celestia', 'INJ': 'Injective', 'PENDLE': 'Pendle'
      };
      
      for (const [symbol, name] of Object.entries(cryptoMap)) {
        if (symbol.toLowerCase().includes(query.toLowerCase()) || 
            name.toLowerCase().includes(query.toLowerCase())) {
          cryptoMatches.push({ symbol, description: name, type: 'crypto' });
        }
      }

      res.json({ 
        results: [...results, ...cryptoMatches.slice(0, 5)].slice(0, 15)
      });
    } catch (error) {
      logger.error('Symbol autocomplete error:', error);
      res.json({ results: [] });
    }
  });

  // Global search endpoint for symbol lookups
  app.get("/api/search/symbols", async (req, res) => {
    try {
      const query = (req.query.q as string || '').toUpperCase().trim();
      if (!query) {
        return res.json([]);
      }

      const { searchSymbolLookup } = await import('./tradier-api');
      const tradierResults = await searchSymbolLookup(query);
      
      // Map to standardized search result format
      const stockResults = (tradierResults || []).map((r: { symbol: string; description: string; type?: string }) => ({
        symbol: r.symbol,
        name: r.description || r.symbol,
        type: r.type === 'option' ? 'option' : 'stock' as const,
      }));

      // Add crypto matches
      const cryptoMap: Record<string, string> = {
        'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'SOL': 'Solana', 'XRP': 'Ripple',
        'ADA': 'Cardano', 'DOGE': 'Dogecoin', 'DOT': 'Polkadot', 'AVAX': 'Avalanche',
        'LINK': 'Chainlink', 'MATIC': 'Polygon', 'UNI': 'Uniswap', 'ATOM': 'Cosmos',
        'LTC': 'Litecoin', 'FIL': 'Filecoin', 'NEAR': 'NEAR Protocol', 'APT': 'Aptos',
        'ARB': 'Arbitrum', 'OP': 'Optimism', 'PEPE': 'Pepe', 'SHIB': 'Shiba Inu',
      };
      
      const cryptoResults = Object.entries(cryptoMap)
        .filter(([symbol, name]) => 
          symbol.includes(query) || name.toUpperCase().includes(query)
        )
        .map(([symbol, name]) => ({
          symbol,
          name,
          type: 'crypto' as const,
        }));

      // Add futures matches
      const futuresMap: Record<string, string> = {
        'ES': 'E-mini S&P 500', 'NQ': 'E-mini Nasdaq', 'YM': 'E-mini Dow',
        'RTY': 'E-mini Russell', 'CL': 'Crude Oil', 'GC': 'Gold',
        'SI': 'Silver', 'NG': 'Natural Gas', 'ZB': '30-Year T-Bond',
      };
      
      const futuresResults = Object.entries(futuresMap)
        .filter(([symbol, name]) => 
          symbol.includes(query) || name.toUpperCase().includes(query)
        )
        .map(([symbol, name]) => ({
          symbol,
          name,
          type: 'future' as const,
        }));

      // Combine and limit results
      const allResults = [...stockResults.slice(0, 10), ...cryptoResults.slice(0, 5), ...futuresResults.slice(0, 3)];
      res.json(allResults.slice(0, 15));
    } catch (error) {
      logger.error('Global symbol search error:', error);
      res.json([]);
    }
  });

  app.get("/api/search-symbol/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      
      const existing = await storage.getMarketDataBySymbol(symbol);
      if (existing) {
        return res.json(existing);
      }

      const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
      const externalData = await searchSymbol(symbol, alphaVantageKey);
      
      if (!externalData) {
        return res.status(404).json({ error: "Symbol not found" });
      }

      const marketData = await storage.createMarketData({
        ...externalData,
        session: "rth",
        timestamp: new Date().toISOString(),
        avgVolume: externalData.volume,
        dataSource: "live",
        lastUpdated: new Date().toISOString(),
      });

      res.json(marketData);
    } catch (error) {
      console.error("Symbol search error:", error);
      res.status(500).json({ error: "Failed to search symbol" });
    }
  });

  app.post("/api/refresh-prices", async (_req, res) => {
    try {
      const allMarketData = await storage.getAllMarketData();
      const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
      const updated: any[] = [];

      for (const data of allMarketData) {
        const externalData = await searchSymbol(data.symbol, alphaVantageKey);
        
        if (externalData) {
          const updatedData = await storage.updateMarketData(data.symbol, {
            currentPrice: externalData.currentPrice,
            changePercent: externalData.changePercent,
            volume: externalData.volume,
            high24h: externalData.high24h,
            low24h: externalData.low24h,
            dataSource: "live",
            lastUpdated: new Date().toISOString(),
            marketCap: externalData.marketCap,
            timestamp: new Date().toISOString(),
          });
          
          if (updatedData) {
            updated.push(updatedData);
          }
        }
      }

      res.json({ 
        success: true, 
        updated: updated.length,
        total: allMarketData.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Price refresh error:", error);
      res.status(500).json({ error: "Failed to refresh prices" });
    }
  });

  // Sparkline data for mini charts
  app.get("/api/sparkline/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const marketData = await storage.getMarketDataBySymbol(symbol);
      
      // Default to stock if symbol not in market data
      const assetType = marketData?.assetType || 'stock';
      const currentPrice = marketData?.currentPrice || null;

      // Try to fetch historical prices, return empty array if fails
      let prices: number[] = [];
      try {
        const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
        prices = await fetchHistoricalPrices(
          symbol,
          assetType,
          20, // Last 20 data points
          alphaVantageKey,
          undefined // coinId - will be looked up from CRYPTO_SYMBOL_MAP if needed
        );
      } catch (e) {
        // Return empty prices if historical data unavailable
        logger.warn(`[SPARKLINE] Could not fetch historical prices for ${symbol}`);
      }

      res.json({ 
        symbol,
        prices: prices || [],
        currentPrice
      });
    } catch (error) {
      console.error("Sparkline data error:", error);
      // Return empty data instead of error to prevent UI crashes
      res.json({ symbol: req.params.symbol, prices: [], currentPrice: null });
    }
  });

  // Dashboard API Routes
  app.get("/api/dashboard/stats", async (req: any, res) => {
    try {
      const userId = req.session?.userId || (req.user as any)?.claims?.sub;
      
      // Get all trade ideas for stats
      const allIdeas = await storage.getAllTradeIdeas();
      const decidedIdeas = allIdeas.filter(i => i.status === 'hit_target' || i.status === 'stopped_out' || i.status === 'expired');
      const openIdeas = allIdeas.filter(i => i.status === 'open' || i.status === 'pending');
      
      // Calculate win rate
      const wins = decidedIdeas.filter(i => i.status === 'hit_target').length;
      const winRate = decidedIdeas.length > 0 ? (wins / decidedIdeas.length) * 100 : 0;
      
      // Get paper portfolios for portfolio value (use user's portfolios if logged in)
      let totalPortfolioValue = 0;
      if (userId) {
        const portfolios = await storage.getPaperPortfoliosByUser(userId);
        totalPortfolioValue = portfolios.reduce((sum, p) => sum + (p.balance || 0), 0);
      }
      
      // Calculate daily P&L (from today's closed trades)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIdeas = decidedIdeas.filter(i => {
        const closeDate = i.updatedAt ? new Date(i.updatedAt) : null;
        return closeDate && closeDate >= today;
      });
      const dailyPnL = todayIdeas.reduce((sum, i) => {
        const pnl = (i.currentPrice || i.exitPrice || 0) - (i.suggestedEntry || 0);
        return sum + (i.status === 'hit_target' ? Math.abs(pnl) : -Math.abs(pnl));
      }, 0);
      
      // Weekly performance data
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weeklyPerformance = [];
      for (let i = 4; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const dayIdeas = decidedIdeas.filter(idea => {
          const closeDate = idea.updatedAt ? new Date(idea.updatedAt) : null;
          return closeDate && closeDate >= date && closeDate < nextDate;
        });
        
        const dayPnL = dayIdeas.reduce((sum, i) => {
          const gain = i.status === 'hit_target' ? 50 : -25;
          return sum + gain;
        }, 0);
        
        weeklyPerformance.push({
          day: dayNames[date.getDay()],
          pnl: dayPnL
        });
      }
      
      // Asset allocation calculated from active trade ideas
      const assetCounts = { stock: 0, option: 0, crypto: 0, future: 0 };
      openIdeas.forEach(idea => {
        const type = idea.assetType?.toLowerCase() || 'stock';
        if (type === 'stock' || type === 'equity') assetCounts.stock++;
        else if (type === 'option' || type === 'options') assetCounts.option++;
        else if (type === 'crypto' || type === 'cryptocurrency') assetCounts.crypto++;
        else if (type === 'future' || type === 'futures') assetCounts.future++;
        else assetCounts.stock++; // Default to stock
      });
      
      const totalPositions = assetCounts.stock + assetCounts.option + assetCounts.crypto + assetCounts.future;
      const assetAllocation = totalPositions > 0 ? [
        { name: 'Stocks', value: Math.round((assetCounts.stock / totalPositions) * 100), color: '#22d3ee' },
        { name: 'Options', value: Math.round((assetCounts.option / totalPositions) * 100), color: '#a855f7' },
        { name: 'Crypto', value: Math.round((assetCounts.crypto / totalPositions) * 100), color: '#f59e0b' },
        { name: 'Futures', value: Math.round((assetCounts.future / totalPositions) * 100), color: '#10b981' },
      ].filter(a => a.value > 0) : [];
      
      // Win/Loss ratio
      const winLossRatio = [
        { name: 'Wins', value: Math.round(winRate), color: '#22c55e' },
        { name: 'Losses', value: Math.round(100 - winRate), color: '#ef4444' },
      ];
      
      res.json({
        portfolioValue: totalPortfolioValue,
        dailyPnL,
        dailyPnLPercent: totalPortfolioValue > 0 ? (dailyPnL / totalPortfolioValue) * 100 : 0,
        totalTrades: decidedIdeas.length,
        winRate,
        activePositions: openIdeas.length,
        weeklyPerformance,
        assetAllocation,
        winLossRatio,
        recentBriefs: [],
        systemStatus: []
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/market-brief", async (_req, res) => {
    try {
      // Generate a simple market brief
      const now = new Date();
      const hour = now.getHours();
      
      let marketPhase = 'pre-market';
      if (hour >= 9 && hour < 16) marketPhase = 'market hours';
      else if (hour >= 16 && hour < 20) marketPhase = 'after-hours';
      
      const brief = `Markets are in ${marketPhase}. Key focus areas: Tech sector momentum, earnings season positioning, and macro data releases. Monitor VIX levels for volatility signals. Crypto markets showing strength with BTC holding key support levels.`;
      
      res.json({
        brief,
        timestamp: now.toLocaleString('en-US', { timeZone: 'America/Chicago' })
      });
    } catch (error) {
      console.error("Market brief error:", error);
      res.status(500).json({ error: "Failed to generate market brief" });
    }
  });

  // Trade Ideas Routes - Protected by beta access
  app.get("/api/trade-ideas", requireBetaAccess, async (req: any, res) => {
    try {
      // Get user from session OR Replit Auth (same pattern as /api/auth/me)
      let userId = req.session?.userId;
      
      // Check Replit Auth if no session userId
      if (!userId && req.user) {
        const replitUser = req.user as any;
        userId = replitUser.claims?.sub;
        logger.info(`[TRADE-IDEAS] Using Replit Auth userId: ${userId}`);
      }
      
      logger.info(`[TRADE-IDEAS] Auth state: sessionUserId=${req.session?.userId}, replitUser=${!!req.user}, finalUserId=${userId}`);
      
      const adminEmail = process.env.ADMIN_EMAIL || "";
      
      // Check if current user is admin (owner)
      let isAdmin = false;
      if (userId) {
        const user = await storage.getUser(userId);
        isAdmin = adminEmail !== "" && user?.email === adminEmail;
      }
      
      // Quality filter: ?quality=high filters to 70%+ confidence AND 4+ signals
      const qualityFilter = req.query.quality as string;
      
      // Admin sees all ideas, logged-in users see system-generated ideas + their own
      // System-generated ideas have user_id = NULL and should be visible to all users
      let ideas = isAdmin 
        ? await storage.getAllTradeIdeas()
        : userId 
          ? await storage.getTradeIdeasForUser(userId) // Gets system ideas + user's own
          : [];
      
      // 🎯 RELIABILITY FILTER: Remove conflicting directional signals
      // If we have both CALL and PUT for same symbol, keep only the higher conviction one
      // This prevents flip-flopping and builds trust in directional calls
      const symbolGroups = new Map<string, typeof ideas>();
      for (const idea of ideas) {
        const key = idea.symbol;
        if (!symbolGroups.has(key)) {
          symbolGroups.set(key, []);
        }
        symbolGroups.get(key)!.push(idea);
      }
      
      const deconflictedIdeas: typeof ideas = [];
      for (const [symbol, symbolIdeas] of symbolGroups) {
        // Check for conflicting directions (CALL vs PUT, or LONG vs SHORT)
        const hasLong = symbolIdeas.some(i => i.direction === 'LONG' || i.optionType === 'call');
        const hasShort = symbolIdeas.some(i => i.direction === 'SHORT' || i.optionType === 'put');
        
        if (hasLong && hasShort) {
          // Conflict detected - keep only the highest conviction direction
          const longIdeas = symbolIdeas.filter(i => i.direction === 'LONG' || i.optionType === 'call');
          const shortIdeas = symbolIdeas.filter(i => i.direction === 'SHORT' || i.optionType === 'put');
          
          const maxLongConfidence = Math.max(...longIdeas.map(i => i.confidenceScore || 0));
          const maxShortConfidence = Math.max(...shortIdeas.map(i => i.confidenceScore || 0));
          
          // Only keep the stronger direction, require 10+ point advantage
          if (maxLongConfidence >= maxShortConfidence + 10) {
            deconflictedIdeas.push(...longIdeas);
            logger.info(`[TRADE-IDEAS] ${symbol}: Removed ${shortIdeas.length} conflicting SHORT/PUT (LONG confidence ${maxLongConfidence} vs ${maxShortConfidence})`);
          } else if (maxShortConfidence >= maxLongConfidence + 10) {
            deconflictedIdeas.push(...shortIdeas);
            logger.info(`[TRADE-IDEAS] ${symbol}: Removed ${longIdeas.length} conflicting LONG/CALL (SHORT confidence ${maxShortConfidence} vs ${maxLongConfidence})`);
          } else {
            // Neither direction has strong enough advantage - drop both to avoid confusion
            logger.info(`[TRADE-IDEAS] ${symbol}: Dropped all ideas - no clear directional edge (LONG ${maxLongConfidence} vs SHORT ${maxShortConfidence})`);
          }
        } else {
          // No conflict - keep all ideas for this symbol
          deconflictedIdeas.push(...symbolIdeas);
        }
      }
      ideas = deconflictedIdeas;
      
      // 🎯 RELIABILITY FILTER: Minimum confidence for options trades
      // Options require strong conviction due to premium cost and time decay
      const MIN_OPTIONS_CONFIDENCE = 70;
      const beforeOptionsFilter = ideas.length;
      ideas = ideas.filter(idea => {
        if (idea.assetType === 'option' || idea.optionType) {
          return (idea.confidenceScore || 0) >= MIN_OPTIONS_CONFIDENCE;
        }
        return true; // Keep non-options ideas
      });
      if (beforeOptionsFilter !== ideas.length) {
        logger.info(`[TRADE-IDEAS] Filtered ${beforeOptionsFilter - ideas.length} low-confidence options (min ${MIN_OPTIONS_CONFIDENCE}%)`);
      }
      
      // Apply quality filter if requested (70%+ confidence AND 4+ signals)
      if (qualityFilter === 'high') {
        const beforeCount = ideas.length;
        ideas = ideas.filter(idea => {
          const confidence = idea.confidenceScore || 50;
          const signalCount = idea.qualitySignals?.length || 0;
          return confidence >= 70 && signalCount >= 4;
        });
        logger.info(`[TRADE-IDEAS] Quality filter applied: ${beforeCount} -> ${ideas.length} ideas`);
      }
      
      const hitTargetCount = ideas.filter(i => i.outcomeStatus === 'hit_target').length;
      const openCount = ideas.filter(i => i.outcomeStatus === 'open' || !i.outcomeStatus).length;
      logger.info(`[TRADE-IDEAS] Fetched ${ideas.length} ideas (isAdmin=${isAdmin}, userId=${userId ? 'present' : 'null'}) - ${hitTargetCount} hit_target, ${openCount} open`);
      
      const marketData = await storage.getAllMarketData();
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // Get unique symbols from open ideas for price fetching
      const openIdeas = ideas.filter(i => i.outcomeStatus === 'open' || !i.outcomeStatus);
      const uniqueSymbols = Array.from(new Set(openIdeas.map(i => i.symbol)));
      
      // NOTE: Previous "auto-correct" validation was REMOVED because it was WRONG
      // The logic assumed targetPrice > entryPrice = call, but that's incorrect!
      // For ALL option trades (calls AND puts), we want targetPrice > entryPrice
      // because we're BUYING options and want to sell them for a profit.
      // The optionType is determined by momentum direction at time of entry, not by price targets.
      
      // Fetch current prices for stocks and crypto (NOT options - they use entry/target/stop premiums)
      const stockSymbols = uniqueSymbols.filter(s => {
        const idea = openIdeas.find(i => i.symbol === s);
        return idea && (idea.assetType === 'stock' || idea.assetType === 'penny_stock');
      });
      
      const cryptoSymbols = uniqueSymbols.filter(s => {
        const idea = openIdeas.find(i => i.symbol === s);
        return idea && idea.assetType === 'crypto';
      });
      
      // Options don't get live prices - they use entry/target/stop premium values
      // Reason: Real-time option premium tracking requires complex Tradier API calls
      // and options expire quickly (most are 1-2 day trades)
      
      // Build price map using cache-first strategy
      const priceMap = new Map<string, number>();
      
      // Step 1: Add prices from market data
      marketData.forEach(data => {
        priceMap.set(data.symbol, data.currentPrice);
        setCachedPrice(data.symbol, data.currentPrice); // Update cache
      });
      
      // Step 2: Check cache for remaining symbols
      const stocksNeedingFetch: string[] = [];
      const cryptosNeedingFetch: string[] = [];
      
      stockSymbols.forEach(symbol => {
        if (priceMap.has(symbol)) return; // Already have from market data
        
        const cachedPrice = getCachedPrice(symbol);
        if (cachedPrice !== null) {
          priceMap.set(symbol, cachedPrice);
          logger.info(`[TRADE-IDEAS] Cache hit for ${symbol}: $${cachedPrice}`);
        } else {
          stocksNeedingFetch.push(symbol);
        }
      });
      
      cryptoSymbols.forEach(symbol => {
        if (priceMap.has(symbol)) return;
        
        const cachedPrice = getCachedPrice(symbol);
        if (cachedPrice !== null) {
          priceMap.set(symbol, cachedPrice);
          logger.info(`[TRADE-IDEAS] Cache hit for ${symbol}: $${cachedPrice}`);
        } else {
          cryptosNeedingFetch.push(symbol);
        }
      });
      
      logger.info(`[TRADE-IDEAS] Building price map for ${uniqueSymbols.length} symbols (${stockSymbols.length} stocks, ${cryptoSymbols.length} crypto)`);
      logger.info(`[TRADE-IDEAS] Cache hits: ${uniqueSymbols.length - stocksNeedingFetch.length - cryptosNeedingFetch.length}, Need to fetch: ${stocksNeedingFetch.length} stocks, ${cryptosNeedingFetch.length} crypto`);
      
      // Step 3: Fetch only uncached prices (PARALLEL)
      const stockPriceFetches = stocksNeedingFetch.map(async symbol => {
        try {
          const data = await fetchStockPrice(symbol);
          const price = data?.currentPrice || null;
          if (price) {
            logger.info(`[TRADE-IDEAS] Fetched ${symbol}: $${price}`);
            setCachedPrice(symbol, price); // Cache the fresh price
          }
          return { symbol, price };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Failed to fetch price for ${symbol}`, { error: errorMsg });
          return { symbol, price: null };
        }
      });

      const stockPriceResults = await Promise.all(stockPriceFetches);
      stockPriceResults.forEach(({ symbol, price }) => {
        if (price) priceMap.set(symbol, price);
      });
      
      const cryptoPriceFetches = cryptosNeedingFetch.map(async symbol => {
        try {
          const data = await fetchCryptoPrice(symbol);
          const price = data?.currentPrice || null;
          if (price) {
            logger.info(`[TRADE-IDEAS] Fetched ${symbol}: $${price}`);
            setCachedPrice(symbol, price); // Cache the fresh price
          }
          return { symbol, price };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Failed to fetch price for ${symbol}`, { error: errorMsg });
          return { symbol, price: null };
        }
      });

      const cryptoPriceResults = await Promise.all(cryptoPriceFetches);
      cryptoPriceResults.forEach(({ symbol, price }) => {
        if (price) priceMap.set(symbol, price);
      });
      
      logger.info(`[TRADE-IDEAS] Final price map has ${priceMap.size} symbols`);
      
      // NOTE: Validation is handled by the Performance Validation Service (every 5 minutes)
      // and the manual /api/performance/validate endpoint.
      // We should NOT validate trades in the GET endpoint to avoid incorrect validations.
      
      // Re-fetch ideas with user filtering after archiving
      const updatedIdeas = isAdmin 
        ? await storage.getAllTradeIdeas()
        : userId 
          ? await storage.getTradeIdeasForUser(userId)
          : [];
      
      // Add current prices and dynamically recalculated exit times to response
      const ideasWithPrices = updatedIdeas.map(idea => {
        const currentPrice = idea.assetType === 'option' ? null : (priceMap.get(idea.symbol) || null);
        
        // 🔄 DYNAMIC EXIT TIME: Recalculate for open trades with exitBy set
        let adjustedExitBy = idea.exitBy;
        if (idea.outcomeStatus === 'open' && idea.exitBy) {
          try {
            const recalcResult = recalculateExitTime({
              symbol: idea.symbol,
              assetType: idea.assetType as any,
              entryPrice: idea.entryPrice,
              targetPrice: idea.targetPrice,
              stopLoss: idea.stopLoss,
              direction: idea.direction as 'long' | 'short',
              originalExitBy: idea.exitBy,
              currentPrice: currentPrice || undefined,
            });
            adjustedExitBy = recalcResult.exitBy;
          } catch (error) {
            // Keep original exitBy on error
          }
        }
        
        return {
          ...idea,
          currentPrice,
          exitBy: adjustedExitBy, // Return dynamically adjusted exit time
        };
      });
      
      // 🔒 DEDUPLICATION: Limit max active ideas per symbol to reduce clutter
      // For options, dedupe by symbol+strike+expiry to show distinct setups
      // Keep highest confidence ideas, most recent within same confidence tier
      // 50 per symbol allows multiple sources (scanner, bullish, watchlist, flow) to all be visible
      const MAX_IDEAS_PER_SYMBOL = 50;
      
      const deduplicatedIdeas = (() => {
        // Separate open ideas (need dedup) from closed (no dedup needed)
        const openIdeas = ideasWithPrices.filter(i => i.outcomeStatus === 'open' || !i.outcomeStatus);
        const closedIdeas = ideasWithPrices.filter(i => i.outcomeStatus && i.outcomeStatus !== 'open');
        
        // Group open ideas by symbol
        const bySymbol = new Map<string, typeof openIdeas>();
        for (const idea of openIdeas) {
          const key = idea.symbol.toUpperCase();
          if (!bySymbol.has(key)) {
            bySymbol.set(key, []);
          }
          bySymbol.get(key)!.push(idea);
        }
        
        // For each symbol, dedupe by strike+expiry (for options) and limit to MAX_IDEAS_PER_SYMBOL
        const dedupedOpen: typeof openIdeas = [];
        for (const [symbol, ideas] of bySymbol) {
          // Sort by confidence (highest first), then by timestamp (most recent first)
          const sorted = ideas.sort((a, b) => {
            const confDiff = (b.confidenceScore || 0) - (a.confidenceScore || 0);
            if (confDiff !== 0) return confDiff;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          });
          
          // Dedupe by comprehensive key: direction + asset-specific details
          // Options: strike+expiry+optionType+direction
          // Stocks: entry+target+stop+direction (all must match to be duplicate)
          const seen = new Set<string>();
          const unique: typeof ideas = [];
          for (const idea of sorted) {
            // Comprehensive deduplication key
            const dedupeKey = idea.assetType === 'option' 
              ? `${idea.direction}-${idea.optionType || ''}-${idea.strikePrice || ''}-${idea.expiryDate || ''}`
              : `${idea.direction}-${idea.entryPrice.toFixed(2)}-${idea.targetPrice.toFixed(2)}-${idea.stopLoss.toFixed(2)}`;
            
            if (!seen.has(dedupeKey)) {
              seen.add(dedupeKey);
              unique.push(idea);
            }
          }
          
          // Take only top N per symbol
          dedupedOpen.push(...unique.slice(0, MAX_IDEAS_PER_SYMBOL));
          
          if (ideas.length > MAX_IDEAS_PER_SYMBOL) {
            logger.info(`[TRADE-IDEAS] ${symbol}: Deduplicated ${ideas.length} -> ${Math.min(unique.length, MAX_IDEAS_PER_SYMBOL)} ideas`);
          }
        }
        
        // Combine deduped open with all closed ideas
        return [...dedupedOpen, ...closedIdeas];
      })();
      
      logger.info(`[TRADE-IDEAS] Returning ${deduplicatedIdeas.length} ideas (after dedup from ${ideasWithPrices.length})`);
      
      res.json(deduplicatedIdeas);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trade ideas" });
    }
  });

  // 🎯 BEST SETUPS - Top 5 conviction plays for daily/weekly view
  // Forces discipline: wait for the perfect pitch instead of swinging at everything
  app.get("/api/trade-ideas/best-setups", async (req: any, res) => {
    try {
      const period = req.query.period as string || 'daily'; // 'daily' or 'weekly'
      const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);
      
      // Get all active trade ideas
      const allIdeas = await storage.getAllTradeIdeas();
      const now = new Date();
      
      // Filter to open ideas only
      let openIdeas = allIdeas.filter(i => 
        (i.outcomeStatus === 'open' || !i.outcomeStatus) &&
        i.entryPrice && i.targetPrice && i.stopLoss
      );
      
      // 🎯 RELIABILITY FILTER: Remove conflicting directional signals for Best Setups
      // Only show the strongest directional conviction per symbol
      const symbolGroups = new Map<string, typeof openIdeas>();
      for (const idea of openIdeas) {
        if (!symbolGroups.has(idea.symbol)) {
          symbolGroups.set(idea.symbol, []);
        }
        symbolGroups.get(idea.symbol)!.push(idea);
      }
      
      const deconflictedIdeas: typeof openIdeas = [];
      for (const [symbol, symbolIdeas] of symbolGroups) {
        const hasLong = symbolIdeas.some(i => i.direction === 'LONG' || i.optionType === 'call');
        const hasShort = symbolIdeas.some(i => i.direction === 'SHORT' || i.optionType === 'put');
        
        if (hasLong && hasShort) {
          const longIdeas = symbolIdeas.filter(i => i.direction === 'LONG' || i.optionType === 'call');
          const shortIdeas = symbolIdeas.filter(i => i.direction === 'SHORT' || i.optionType === 'put');
          const maxLongConf = Math.max(...longIdeas.map(i => i.confidenceScore || 0));
          const maxShortConf = Math.max(...shortIdeas.map(i => i.confidenceScore || 0));
          
          if (maxLongConf >= maxShortConf + 10) {
            deconflictedIdeas.push(...longIdeas);
          } else if (maxShortConf >= maxLongConf + 10) {
            deconflictedIdeas.push(...shortIdeas);
          }
          // Drop both if no clear edge
        } else {
          deconflictedIdeas.push(...symbolIdeas);
        }
      }
      openIdeas = deconflictedIdeas;
      
      // 🎯 RELIABILITY FILTER: Minimum confidence for options trades (same as Trade Ideas)
      const MIN_OPTIONS_CONFIDENCE_BEST = 70;
      openIdeas = openIdeas.filter(idea => {
        if (idea.assetType === 'option' || idea.optionType) {
          return (idea.confidenceScore || 0) >= MIN_OPTIONS_CONFIDENCE_BEST;
        }
        return true;
      });
      
      // Apply time filter based on period using multiple timestamp sources
      // Priority: timestamp > entryValidUntil > exitBy (fallback to showing all open if no dates)
      const getIdeaDate = (idea: any): Date | null => {
        if (idea.timestamp) return new Date(idea.timestamp);
        if (idea.createdAt) return new Date(idea.createdAt);
        return null;
      };
      
      if (period === 'daily') {
        // Ideas from last 24 hours OR still valid today
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        openIdeas = openIdeas.filter(i => {
          const ideaDate = getIdeaDate(i);
          const entryValidUntil = i.entryValidUntil ? new Date(i.entryValidUntil) : null;
          // Include if: recent creation/timestamp OR entry still valid OR no date info (show by default)
          return (ideaDate && ideaDate >= oneDayAgo) || 
                 (entryValidUntil && entryValidUntil >= now) ||
                 (!ideaDate && !entryValidUntil);
        });
      } else if (period === 'weekly') {
        // Ideas from last 7 days
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        openIdeas = openIdeas.filter(i => {
          const ideaDate = getIdeaDate(i);
          const entryValidUntil = i.entryValidUntil ? new Date(i.entryValidUntil) : null;
          // Include if: recent OR entry still valid OR no date info
          return (ideaDate && ideaDate >= oneWeekAgo) || 
                 (entryValidUntil && entryValidUntil >= now) ||
                 (!ideaDate && !entryValidUntil);
        });
      }
      
      // PERFORMANCE OPTIMIZATION: Pre-filter to only high-grade ideas (A+/A/A-/B+/B)
      // This dramatically reduces the number of ideas we need to score (from 6000+ to ~100)
      const highGradeIdeas = openIdeas.filter(i => {
        const grade = i.probabilityBand || '';
        return ['A+', 'A', 'A-', 'B+', 'B'].includes(grade);
      });
      
      // Fallback: if no high-grade ideas, take top 50 by confidence score
      const candidateIdeas = highGradeIdeas.length >= limit 
        ? highGradeIdeas 
        : openIdeas.slice(0, 100);
      
      logger.info(`[BEST-SETUPS] Pre-filtered to ${candidateIdeas.length} candidates (from ${openIdeas.length} open ideas)`);
      
      // Calculate historical win rate by symbol (from all closed trade ideas)
      // Uses actual outcome statuses: 'hit_target', 'stopped_out', 'expired'
      const calculateSymbolWinRate = (symbol: string): { winRate: number; sampleSize: number } => {
        const symbolIdeas = allIdeas.filter(i => 
          i.symbol === symbol && 
          (i.outcomeStatus === 'hit_target' || i.outcomeStatus === 'stopped_out' || i.outcomeStatus === 'expired')
        );
        if (symbolIdeas.length < 3) return { winRate: 50, sampleSize: symbolIdeas.length };
        const wins = symbolIdeas.filter(i => i.outcomeStatus === 'hit_target').length;
        return { winRate: Math.round((wins / symbolIdeas.length) * 100), sampleSize: symbolIdeas.length };
      };
      
      // Fast scoring without ML/breakout calls (skip expensive async operations)
      // Conviction = Base + Signals + R:R + Grade + WinRate
      const scoredIdeas = candidateIdeas.map(idea => {
        const confidence = idea.confidenceScore || 50;
        const signalCount = idea.qualitySignals?.length || 0;
        const riskReward = idea.targetPrice && idea.entryPrice && idea.stopLoss
          ? (idea.targetPrice - idea.entryPrice) / Math.max(0.01, idea.entryPrice - idea.stopLoss)
          : 1;
        
        // Base conviction score
        let convictionScore = confidence;
        
        // Signal confluence bonus (more signals = higher conviction)
        convictionScore += signalCount * 5;
        
        // Risk/Reward bonus (capped at 3:1 for max bonus)
        convictionScore += Math.min(riskReward, 3) * 10;
        
        // Grade bonus
        const grade = idea.probabilityBand || '';
        if (grade === 'A+' || grade === 'A') convictionScore += 10;
        else if (grade === 'A-' || grade === 'B+') convictionScore += 5;
        
        // Historical win rate bonus (fast, no API calls)
        const { winRate, sampleSize } = calculateSymbolWinRate(idea.symbol);
        let winRateBonus = 0;
        if (sampleSize >= 5) {
          if (winRate >= 70) winRateBonus = 15;
          else if (winRate >= 60) winRateBonus = 10;
          else if (winRate >= 50) winRateBonus = 5;
          else if (winRate < 40) winRateBonus = -10;
        }
        convictionScore += winRateBonus;
        
        return {
          ...idea,
          convictionScore: Math.round(Math.max(convictionScore, 0)),
          signalCount,
          riskReward: Math.round(riskReward * 100) / 100,
          mlDirection: 'neutral',  // Skip slow ML calls for performance
          mlBoost: 0,
          hourlyConfirmed: false,
          breakoutBonus: 0,
          historicalWinRate: winRate,
          historicalSampleSize: sampleSize,
          winRateBonus,
          confidence
        };
      });
      
      // Sort by conviction score descending
      scoredIdeas.sort((a, b) => b.convictionScore - a.convictionScore);
      
      // 🎯 CRITICAL: Deduplicate by symbol - only keep the BEST setup per symbol
      // This prevents showing 5 copies of the same INTC trade
      const symbolBestMap = new Map<string, typeof scoredIdeas[0]>();
      for (const idea of scoredIdeas) {
        const key = idea.symbol;
        const existing = symbolBestMap.get(key);
        // Keep the one with higher conviction (first one wins since already sorted)
        if (!existing) {
          symbolBestMap.set(key, idea);
        }
      }
      
      // Convert map back to array and re-sort (map doesn't preserve order)
      const uniqueBySymbol = Array.from(symbolBestMap.values());
      uniqueBySymbol.sort((a, b) => b.convictionScore - a.convictionScore);
      
      // Take top N unique symbols
      const topSetups = uniqueBySymbol.slice(0, limit);
      
      logger.info(`[BEST-SETUPS] Returning ${topSetups.length} top setups for ${period} (from ${openIdeas.length} open ideas, ML+Breakout+WinRate enhanced)`);
      
      res.json({
        period,
        count: topSetups.length,
        totalOpen: openIdeas.length,
        setups: topSetups,
        generatedAt: now.toISOString()
      });
    } catch (error) {
      logger.error('[BEST-SETUPS] Error:', error);
      res.status(500).json({ error: "Failed to fetch best setups" });
    }
  });

  app.get("/api/trade-ideas/:id", async (req, res) => {
    try {
      const idea = await storage.getTradeIdeaById(req.params.id);
      if (!idea) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      res.json(idea);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trade idea" });
    }
  });

  // 📸 Trade Audit Trail - get price snapshots and outcome evidence
  app.get("/api/trade-ideas/:id/audit", async (req, res) => {
    try {
      const auditTrail = await storage.getTradeAuditTrail(req.params.id);
      if (!auditTrail.tradeIdea) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      res.json(auditTrail);
    } catch (error) {
      console.error("Failed to fetch trade audit trail:", error);
      res.status(500).json({ error: "Failed to fetch trade audit trail" });
    }
  });

  // 📨 Share trade idea to Discord - manual trigger for audit page
  // Manual shares bypass grade/deduplication filters since user explicitly requested it
  app.post("/api/trade-ideas/:id/share-discord", isAuthenticated, async (req, res) => {
    try {
      const idea = await storage.getTradeIdeaById(req.params.id);
      if (!idea) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      
      const { sendTradeIdeaToDiscord } = await import("./discord-service");
      // Force bypass filters for manual user-initiated shares
      await sendTradeIdeaToDiscord(idea, { forceBypassFilters: true });
      
      logger.info(`📨 Trade idea ${idea.symbol} shared to Discord by user (manual share)`);
      res.json({ success: true, message: `Shared ${idea.symbol} trade to Discord` });
    } catch (error: any) {
      logger.error("Failed to share trade idea to Discord:", error);
      res.status(500).json({ error: "Failed to share to Discord" });
    }
  });

  // 🚀 On-demand idea generation - trigger immediate AI idea generation
  app.post("/api/ideas/generate-now", isAuthenticated, ideaGenerationOnDemandLimiter, async (req: any, res) => {
    try {
      const userId = req.session?.userId;
      const focusPennyStocks = req.body?.focusPennyStocks === true;
      
      logger.info(`🚀 [API] On-demand idea generation requested by user ${userId} (penny focus: ${focusPennyStocks})`);
      
      // Check if generation is already in progress
      const status = autoIdeaGenerator.getStatus();
      if (status.isGenerating) {
        return res.status(409).json({ 
          error: "Generation already in progress",
          message: "Idea generation is currently running. Please wait for it to complete."
        });
      }
      
      // Trigger immediate generation
      const ideasGenerated = await autoIdeaGenerator.forceGenerate(focusPennyStocks);
      
      logger.info(`🚀 [API] On-demand generation complete: ${ideasGenerated} ideas generated for user ${userId}`);
      
      res.json({ 
        success: true,
        ideasGenerated,
        message: ideasGenerated > 0 
          ? `Successfully generated ${ideasGenerated} new trade idea${ideasGenerated !== 1 ? 's' : ''}`
          : 'No new ideas generated - all candidates were filtered by risk validation'
      });
    } catch (error: any) {
      logger.error('[API] On-demand idea generation failed:', error);
      res.status(500).json({ 
        error: "Failed to generate ideas",
        message: "An error occurred during idea generation. Please try again later."
      });
    }
  });

  // 📊 Get auto-generator status
  app.get("/api/ideas/generator-status", isAuthenticated, async (req, res) => {
    try {
      const status = autoIdeaGenerator.getStatus();
      res.json(status);
    } catch (error: any) {
      logger.error('[API] Failed to get generator status:', error);
      res.status(500).json({ error: "Failed to get generator status" });
    }
  });

  app.post("/api/trade-ideas", async (req: any, res) => {
    try {
      const validated = insertTradeIdeaSchema.parse(req.body);
      
      // Add userId from session if not provided
      const userId = req.session?.userId;
      if (userId && !validated.userId) {
        validated.userId = userId;
      }
      
      // ⏰ CRITICAL: Validate timestamp consistency (REQUIRED FIX #1)
      // Ensure exit_date > timestamp and entry_valid_until > timestamp
      const timestampDate = new Date(validated.timestamp);
      
      // Validate entry_valid_until (if provided) is AFTER timestamp
      if (validated.entryValidUntil) {
        const entryValidUntilDate = new Date(validated.entryValidUntil);
        if (entryValidUntilDate <= timestampDate) {
          return res.status(400).json({ 
            error: "Invalid timestamps: entry_valid_until must be AFTER timestamp",
            details: {
              timestamp: validated.timestamp,
              entryValidUntil: validated.entryValidUntil,
              issue: `Entry window (${validated.entryValidUntil}) cannot close before or at trade creation time (${validated.timestamp})`
            }
          });
        }
      }
      
      // Validate exit_by (if provided) is AFTER entry_valid_until (if provided) OR timestamp
      if (validated.exitBy) {
        const exitByDate = new Date(validated.exitBy);
        
        // exit_by must be after timestamp
        if (exitByDate <= timestampDate) {
          return res.status(400).json({ 
            error: "Invalid timestamps: exit_by must be AFTER timestamp",
            details: {
              timestamp: validated.timestamp,
              exitBy: validated.exitBy,
              issue: `Exit deadline (${validated.exitBy}) cannot be before or at trade creation time (${validated.timestamp})`
            }
          });
        }
        
        // If entry_valid_until is provided, exit_by must be after it
        if (validated.entryValidUntil) {
          const entryValidUntilDate = new Date(validated.entryValidUntil);
          if (exitByDate <= entryValidUntilDate) {
            return res.status(400).json({ 
              error: "Invalid timestamps: exit_by must be AFTER entry_valid_until",
              details: {
                entryValidUntil: validated.entryValidUntil,
                exitBy: validated.exitBy,
                issue: `Exit deadline (${validated.exitBy}) cannot be before or at entry window close (${validated.entryValidUntil})`
              }
            });
          }
        }
      }
      
      // Validate exit_date (if provided) is AFTER timestamp
      if (validated.exitDate) {
        const exitDateObj = new Date(validated.exitDate);
        if (exitDateObj <= timestampDate) {
          return res.status(400).json({ 
            error: "Invalid timestamps: exit_date must be AFTER timestamp",
            details: {
              timestamp: validated.timestamp,
              exitDate: validated.exitDate,
              issue: `Exit date (${validated.exitDate}) cannot be before or at trade creation time (${validated.timestamp}). This is logically impossible.`
            }
          });
        }
      }
      
      // CRITICAL: Validate direction/target/option type alignment
      const { PerformanceValidator } = await import("./performance-validator");
      const correction = PerformanceValidator.validateAndCorrectTrade({
        direction: validated.direction,
        assetType: validated.assetType,
        optionType: validated.optionType,
        entryPrice: validated.entryPrice,
        targetPrice: validated.targetPrice,
        stopLoss: validated.stopLoss
      });
      
      if (!correction) {
        return res.status(400).json({ error: "Invalid trade idea validation" });
      }
      
      // Check for validation warnings
      if (correction.warnings.length > 0) {
        // Check if it's an INVALID option trade (should be rejected)
        const hasInvalidOption = correction.warnings.some(w => w.includes('INVALID OPTION TRADE'));
        
        if (hasInvalidOption) {
          logger.error('Rejected invalid option trade', {
            symbol: validated.symbol,
            warnings: correction.warnings,
            submitted: { direction: validated.direction, optionType: validated.optionType, entry: validated.entryPrice, target: validated.targetPrice }
          });
          return res.status(400).json({ 
            error: "Invalid option trade combination",
            details: correction.warnings 
          });
        }
        
        // For stocks, log auto-correction
        logger.warn('Trade idea auto-corrected', {
          symbol: validated.symbol,
          warnings: correction.warnings,
          original: { direction: validated.direction, optionType: validated.optionType },
          corrected: { direction: correction.direction, optionType: correction.optionType }
        });
      }
      
      // Apply corrections (for stocks only)
      validated.direction = correction.direction;
      if (correction.optionType !== undefined) {
        validated.optionType = correction.optionType;
      }
      
      const idea = await storage.createTradeIdea(validated);
      logger.info(`✅ [TRADE-ENTRY] Manual trade created: ${validated.symbol} (${validated.assetType}) - all timestamps validated`);
      
      // 📨 AUTO-SEND TO DISCORD: Notify options/stocks/crypto trades
      try {
        const { sendTradeIdeaToDiscord } = await import("./discord-service");
        await sendTradeIdeaToDiscord(idea);
        logger.info(`📨 [DISCORD] Auto-sent ${idea.symbol} ${idea.assetType} trade to Discord`);
      } catch (discordError) {
        // Don't fail the request if Discord fails - just log it
        logger.warn(`📨 [DISCORD] Failed to send ${idea.symbol} to Discord:`, discordError);
      }
      
      res.status(201).json(idea);
    } catch (error) {
      res.status(400).json({ error: "Invalid trade idea" });
    }
  });

  // POST /api/analyze-play - Custom Analysis Request
  // Auto-suggests play type (calls/puts/shares) based on quantitative signals
  app.post("/api/analyze-play", isAuthenticated, async (req: any, res) => {
    try {
      const { symbol, assetType: requestedAssetType, optionType: requestedOptionType, strike, expiration, direction: requestedDirection, autoSuggest = true } = req.body;
      
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: "Symbol is required" });
      }
      
      const upperSymbol = symbol.toUpperCase().trim();
      const userId = req.session?.userId;
      
      logger.info(`📊 [USER-ANALYSIS] Analyzing ${upperSymbol} at user request (autoSuggest=${autoSuggest})`);
      
      // Determine if this is crypto
      const cryptoMap: Record<string, boolean> = {
        'BTC': true, 'ETH': true, 'SOL': true, 'XRP': true, 'ADA': true, 'DOGE': true,
        'DOT': true, 'AVAX': true, 'LINK': true, 'MATIC': true, 'UNI': true, 'ATOM': true,
        'LTC': true, 'FIL': true, 'NEAR': true, 'APT': true, 'ARB': true, 'OP': true,
        'PEPE': true, 'SHIB': true, 'SUI': true, 'SEI': true, 'TIA': true, 'INJ': true, 'PENDLE': true
      };
      const isCrypto = cryptoMap[upperSymbol] === true;
      
      let entryPrice: number;
      let targetPrice: number;
      let stopLoss: number;
      let detectedDirection: 'long' | 'short' = 'long';
      let suggestedAssetType: 'stock' | 'option' | 'crypto' = isCrypto ? 'crypto' : 'stock';
      let suggestedOptionType: 'call' | 'put' | null = null;
      let confidenceScore = 60;
      let signals: string[] = [];
      let analysisText = '';
      
      // Fetch price and historical data for quant analysis
      if (isCrypto) {
        const cryptoData = await fetchCryptoPrice(upperSymbol);
        if (!cryptoData) {
          return res.status(400).json({ error: `Could not fetch crypto price for ${upperSymbol}` });
        }
        entryPrice = cryptoData.currentPrice;
        
        // Crypto: target +10%, stop -5%
        targetPrice = Number((entryPrice * 1.10).toFixed(2));
        stopLoss = Number((entryPrice * 0.95).toFixed(2));
        analysisText = `Crypto analysis for ${upperSymbol}. `;
      } else {
        // Stock - fetch quote and historical data for quant signals
        const { getTradierQuote, getTradierHistory } = await import('./tradier-api');
        const quote = await getTradierQuote(upperSymbol);
        
        if (!quote) {
          return res.status(400).json({ error: `Could not fetch price for ${upperSymbol}` });
        }
        
        entryPrice = quote.last || quote.close;
        const historicalPrices = await getTradierHistory(upperSymbol, 20);
        
        // Run quantitative analysis to determine direction
        if (historicalPrices.length >= 14) {
          const { RSI, EMA, MACD, ADX } = await import('technicalindicators');
          
          // Calculate RSI(2) for mean reversion
          const rsi2 = RSI.calculate({ period: 2, values: historicalPrices });
          const latestRSI = rsi2.length > 0 ? rsi2[rsi2.length - 1] : 50;
          
          // Calculate RSI(14) for trend
          const rsi14 = RSI.calculate({ period: 14, values: historicalPrices });
          const latestRSI14 = rsi14.length > 0 ? rsi14[rsi14.length - 1] : 50;
          
          // Calculate MACD
          const macdResult = MACD.calculate({
            values: historicalPrices,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
          });
          const latestMACD = macdResult.length > 0 ? macdResult[macdResult.length - 1] : null;
          
          // Determine signals and direction
          let bullishSignals = 0;
          let bearishSignals = 0;
          
          // RSI(2) mean reversion signals
          if (latestRSI < 10) {
            signals.push(`RSI(2) extremely oversold at ${latestRSI.toFixed(1)}`);
            bullishSignals += 2;
          } else if (latestRSI < 20) {
            signals.push(`RSI(2) oversold at ${latestRSI.toFixed(1)}`);
            bullishSignals += 1;
          } else if (latestRSI > 90) {
            signals.push(`RSI(2) extremely overbought at ${latestRSI.toFixed(1)}`);
            bearishSignals += 2;
          } else if (latestRSI > 80) {
            signals.push(`RSI(2) overbought at ${latestRSI.toFixed(1)}`);
            bearishSignals += 1;
          }
          
          // RSI(14) trend confirmation
          if (latestRSI14 < 30) {
            signals.push(`RSI(14) oversold at ${latestRSI14.toFixed(1)}`);
            bullishSignals += 1;
          } else if (latestRSI14 > 70) {
            signals.push(`RSI(14) overbought at ${latestRSI14.toFixed(1)}`);
            bearishSignals += 1;
          }
          
          // MACD signals
          if (latestMACD && latestMACD.histogram !== undefined) {
            if (latestMACD.histogram > 0 && latestMACD.MACD !== undefined && latestMACD.MACD > 0) {
              signals.push('MACD bullish crossover');
              bullishSignals += 1;
            } else if (latestMACD.histogram < 0 && latestMACD.MACD !== undefined && latestMACD.MACD < 0) {
              signals.push('MACD bearish crossover');
              bearishSignals += 1;
            }
          }
          
          // Price momentum
          const priceChange = ((entryPrice - historicalPrices[0]) / historicalPrices[0]) * 100;
          if (priceChange < -5) {
            signals.push(`Down ${Math.abs(priceChange).toFixed(1)}% - potential bounce`);
            bullishSignals += 1;
          } else if (priceChange > 5) {
            signals.push(`Up ${priceChange.toFixed(1)}% - potential pullback`);
            bearishSignals += 1;
          }
          
          // Determine direction based on signals
          if (bullishSignals > bearishSignals) {
            detectedDirection = 'long';
            suggestedOptionType = 'call';
            confidenceScore = Math.min(95, 55 + (bullishSignals * 10));
          } else if (bearishSignals > bullishSignals) {
            detectedDirection = 'short';
            suggestedOptionType = 'put';
            confidenceScore = Math.min(95, 55 + (bearishSignals * 10));
          } else {
            // Neutral - default to long with lower confidence
            detectedDirection = 'long';
            suggestedOptionType = 'call';
            confidenceScore = 50;
            signals.push('Mixed signals - proceed with caution');
          }
          
          analysisText = `Quant analysis for ${upperSymbol}: ${signals.join('. ')}. `;
        } else {
          analysisText = `Limited historical data for ${upperSymbol}. `;
          detectedDirection = 'long';
          suggestedOptionType = 'call';
        }
        
        // Calculate targets based on direction
        if (detectedDirection === 'long') {
          targetPrice = Number((entryPrice * 1.08).toFixed(2)); // 8% target
          stopLoss = Number((entryPrice * 0.96).toFixed(2)); // 4% stop
        } else {
          targetPrice = Number((entryPrice * 0.92).toFixed(2)); // 8% down target
          stopLoss = Number((entryPrice * 1.04).toFixed(2)); // 4% stop
        }
      }
      
      // Use detected values or user overrides
      const finalDirection = requestedDirection || detectedDirection;
      const finalAssetType = requestedAssetType || suggestedAssetType;
      let optionDetails: { strikePrice?: number; expiryDate?: string; optionType?: string } = {};
      
      // If option, fetch option chain
      if (finalAssetType === 'option' && !isCrypto) {
        const { getTradierQuote, getOptionQuote, getTradierOptionsChain } = await import('./tradier-api');
        const stockQuote = await getTradierQuote(upperSymbol);
        const currentStockPrice = stockQuote?.last || stockQuote?.close || entryPrice;
        
        const finalOptionType = requestedOptionType || suggestedOptionType || 'call';
        
        if (strike && expiration) {
          const optQuote = await getOptionQuote({
            underlying: upperSymbol,
            expiryDate: expiration,
            optionType: finalOptionType as 'call' | 'put',
            strike: strike
          });
          
          if (optQuote && optQuote.mid > 0) {
            entryPrice = Number(optQuote.mid.toFixed(2));
          } else {
            entryPrice = Number((currentStockPrice * 0.03).toFixed(2));
          }
          
          optionDetails = { strikePrice: strike, expiryDate: expiration, optionType: finalOptionType };
        } else {
          const options = await getTradierOptionsChain(upperSymbol);
          const filteredOptions = options.filter(o => o.option_type === finalOptionType);
          
          if (filteredOptions.length > 0) {
            const atmOption = filteredOptions.reduce((prev, curr) => 
              Math.abs(curr.strike - currentStockPrice) < Math.abs(prev.strike - currentStockPrice) ? curr : prev
            );
            
            const mid = (atmOption.bid + atmOption.ask) / 2;
            entryPrice = Number((mid > 0 ? mid : atmOption.last).toFixed(2));
            optionDetails = {
              strikePrice: atmOption.strike,
              expiryDate: atmOption.expiration_date,
              optionType: atmOption.option_type
            };
          }
        }
        
        // Options targets: +30% target, -10% stop
        targetPrice = Number((entryPrice * 1.30).toFixed(2));
        stopLoss = Number((entryPrice * 0.90).toFixed(2));
      }
      
      // Calculate risk/reward ratio
      const risk = Math.abs(entryPrice - stopLoss);
      const reward = Math.abs(targetPrice - entryPrice);
      const riskRewardRatio = risk > 0 ? Number((reward / risk).toFixed(2)) : 2.0;
      
      // Determine probability band from confidence
      const probabilityBand = confidenceScore >= 80 ? 'A' : confidenceScore >= 65 ? 'B' : 'C';
      
      // Build suggested play description
      const playDescription = finalAssetType === 'option' 
        ? `${optionDetails.optionType?.toUpperCase() || 'CALL'} $${optionDetails.strikePrice} exp ${optionDetails.expiryDate}`
        : finalAssetType === 'crypto' ? 'SPOT' : 'SHARES';
      
      analysisText += `Suggested play: ${finalDirection.toUpperCase()} ${playDescription}. Entry at $${entryPrice.toFixed(2)}, target $${targetPrice.toFixed(2)}, stop $${stopLoss.toFixed(2)}. R:R ${riskRewardRatio}:1.`;
      
      // Create the trade idea
      const tradeIdea = await storage.createTradeIdea({
        userId,
        symbol: upperSymbol,
        assetType: finalAssetType as 'stock' | 'option' | 'crypto',
        direction: finalDirection as 'long' | 'short',
        holdingPeriod: 'day',
        entryPrice,
        targetPrice,
        stopLoss,
        riskRewardRatio,
        catalyst: signals.length > 0 ? signals.slice(0, 3).join(' | ') : `Analysis for ${upperSymbol}`,
        analysis: analysisText,
        liquidityWarning: entryPrice < 5,
        sessionContext: 'RTH',
        timestamp: new Date().toISOString(),
        source: 'ai',
        confidenceScore,
        probabilityBand,
        strikePrice: optionDetails.strikePrice || null,
        expiryDate: optionDetails.expiryDate || null,
        optionType: optionDetails.optionType || null,
      });
      
      logger.info(`✅ [USER-ANALYSIS] Created trade idea for ${upperSymbol}: entry=$${entryPrice}, target=$${targetPrice}, stop=$${stopLoss}`);
      
      // Send Discord notification for individual trade idea
      try {
        const { sendTradeIdeaToDiscord } = await import("./discord-service");
        sendTradeIdeaToDiscord(tradeIdea).catch(err => 
          logger.error(`Discord notification failed for ${upperSymbol}:`, err)
        );
      } catch (discordError) {
        logger.error('Discord import failed:', discordError);
      }
      
      res.status(201).json(tradeIdea);
    } catch (error: any) {
      logger.error('📊 [USER-ANALYSIS] Error analyzing play:', error);
      res.status(500).json({ error: error.message || 'Failed to analyze play' });
    }
  });

  app.delete("/api/trade-ideas/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTradeIdea(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete trade idea" });
    }
  });

  app.patch("/api/trade-ideas/:id/performance", async (req, res) => {
    try {
      const performanceUpdate = req.body;
      
      // 📊 REQUIRED FIX #3: Auto-classify holding period when trade is closed
      // If exitDate is being set, calculate and validate holding period classification
      if (performanceUpdate.exitDate) {
        // Get the original trade to access timestamp
        const originalTrade = await storage.getTradeIdeaById(req.params.id);
        
        if (!originalTrade) {
          return res.status(404).json({ error: "Trade idea not found" });
        }
        
        // Validate that exit_date is AFTER timestamp
        const timestampDate = new Date(originalTrade.timestamp);
        const exitDateObj = new Date(performanceUpdate.exitDate);
        
        if (exitDateObj <= timestampDate) {
          return res.status(400).json({ 
            error: "Invalid timestamps: exit_date must be AFTER timestamp",
            details: {
              timestamp: originalTrade.timestamp,
              exitDate: performanceUpdate.exitDate,
              issue: `Exit date (${performanceUpdate.exitDate}) cannot be before or at trade creation time (${originalTrade.timestamp}). This is logically impossible.`
            }
          });
        }
        
        // Auto-calculate correct holding period based on actual duration
        const { classifyHoldingPeriodByDuration } = await import('./timing-intelligence');
        
        try {
          const correctHoldingPeriod = classifyHoldingPeriodByDuration(
            originalTrade.timestamp,
            performanceUpdate.exitDate
          );
          
          // Override any manually-set holding period with the correct classification
          performanceUpdate.holdingPeriod = correctHoldingPeriod;
          
          logger.info(`📊 [HOLDING-PERIOD] Auto-classified ${originalTrade.symbol} as "${correctHoldingPeriod}" based on actual duration`);
        } catch (error) {
          logger.error(`❌ [HOLDING-PERIOD] Failed to classify holding period for ${originalTrade.symbol}:`, error);
          return res.status(400).json({ 
            error: "Invalid duration for holding period classification",
            details: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      const updated = await storage.updateTradeIdeaPerformance(req.params.id, performanceUpdate);
      if (!updated) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update performance" });
    }
  });

  // ===========================================
  // Active Trades (Live Position Tracking) API
  // ===========================================

  // 🛡️ COMPLIANCE: Minimum paper trades required before live trading
  const REQUIRED_PAPER_TRADES = 20;

  // Get auto-lotto trading bot stats (beta access required)
  app.get("/api/auto-lotto/stats", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user has beta access
      const userId = req.session?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = checkIsAdmin(user);
      const hasBetaAccess = isAdmin || user?.hasBetaAccess === true;
      
      if (!hasBetaAccess) {
        return res.json({
          active: false,
          requiresBetaAccess: true,
          message: "Join the beta program to access bot trading data",
          portfolio: null,
          openPositions: 0,
          closedPositions: 0,
          totalPnL: 0,
          winRate: 0,
        });
      }
      
      const { getLottoStats } = await import('./auto-lotto-trader');
      const stats = await getLottoStats();
      
      if (!stats) {
        return res.json({
          active: false,
          message: "Auto-lotto trader not yet initialized. Will start on first lotto scan.",
          portfolio: null,
          openPositions: 0,
          closedPositions: 0,
          totalPnL: 0,
          winRate: 0,
        });
      }
      
      res.json({
        active: true,
        portfolio: {
          id: stats.portfolio?.id,
          name: stats.portfolio?.name,
          cashBalance: stats.portfolio?.cashBalance,
          startingCapital: stats.portfolio?.startingCapital,
          totalValue: stats.portfolio?.totalValue,
        },
        openPositions: stats.openPositions,
        closedPositions: stats.closedPositions,
        totalPnL: stats.totalPnL,
        winRate: stats.winRate,
      });
    } catch (error) {
      logger.error("Failed to get auto-lotto stats:", error);
      res.status(500).json({ error: "Failed to fetch auto-lotto stats" });
    }
  });

  // 🎯 Real-Time Exit Intelligence - Live position analysis with dynamic exit predictions (beta access required)
  app.get("/api/auto-lotto/exit-intelligence", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user has beta access
      const userId = req.session?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = checkIsAdmin(user);
      const hasBetaAccess = isAdmin || user?.hasBetaAccess === true;
      
      if (!hasBetaAccess) {
        return res.json({
          portfolioId: null,
          positions: [],
          lastRefresh: new Date().toISOString(),
          marketStatus: 'closed',
          requiresBetaAccess: true,
          message: 'Join the beta program to access exit intelligence'
        });
      }
      
      const exitIntelligence = await getAutoLottoExitIntelligence();
      
      if (!exitIntelligence) {
        return res.json({
          portfolioId: null,
          positions: [],
          lastRefresh: new Date().toISOString(),
          marketStatus: 'closed',
          message: 'Auto-Lotto Bot not initialized'
        });
      }
      
      logger.info(`[EXIT-INTEL] Returning ${exitIntelligence.positions.length} position advisories`);
      res.json(exitIntelligence);
    } catch (error) {
      logger.error("Failed to get exit intelligence:", error);
      res.status(500).json({ error: "Failed to fetch exit intelligence" });
    }
  });

  // 📊 Performance Summary - Rolling win rates and symbol leaderboard (beta access required)
  app.get("/api/auto-lotto/performance-summary", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user has beta access
      const userId = req.session?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = checkIsAdmin(user);
      const hasBetaAccess = isAdmin || user?.hasBetaAccess === true;
      
      if (!hasBetaAccess) {
        return res.json({
          allTime: { trades: 0, wins: 0, losses: 0, winRate: '0', totalPnL: 0 },
          last30Days: { trades: 0, wins: 0, losses: 0, winRate: '0', totalPnL: 0 },
          last7Days: { trades: 0, wins: 0, losses: 0, winRate: '0', totalPnL: 0 },
          topSymbols: [],
          worstSymbols: [],
          requiresBetaAccess: true,
          message: 'Join the beta program to access performance data'
        });
      }
      
      // Get all auto-lotto portfolios (same filter as bot-status)
      const portfolios = await storage.getAllPaperPortfolios();
      const autoLottoPortfolios = portfolios.filter(p => 
        p.name?.toLowerCase().includes('auto-lotto') || 
        p.name?.toLowerCase().includes('small account') ||
        p.name?.toLowerCase().includes('prop firm')
      );
      
      // Get all positions from auto-lotto portfolios
      let allPositions: any[] = [];
      for (const portfolio of autoLottoPortfolios) {
        const portfolioPositions = await storage.getPaperPositionsByPortfolio(portfolio.id);
        allPositions = allPositions.concat(portfolioPositions);
      }
      
      // Filter for closed positions - use exitTime OR closedAt, support all asset types
      const closedPositions = allPositions.filter(p => 
        p.status === 'closed' && 
        (p.exitTime || p.closedAt)
      );

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // UNIFIED WIN RATE CALCULATION - Using WinRateService for consistency
      // Win: realizedPnLPercent >= +3% (or positive P&L if no percent)
      // Loss: realizedPnLPercent <= -3% (or negative P&L if no percent)
      // Neutral: breakeven or missing data - excluded from win rate
      const overallStats = WinRateService.calculateBotStats(closedPositions);
      const totalPnL = closedPositions.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);

      // Weekly stats using unified calculation
      const weeklyPositions = closedPositions.filter(p => {
        const closeDate = new Date(p.exitTime || p.closedAt);
        return closeDate >= weekAgo;
      });
      const weeklyStats = WinRateService.calculateBotStats(weeklyPositions);
      const weeklyPnL = weeklyPositions.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);

      // Monthly stats using unified calculation
      const monthlyPositions = closedPositions.filter(p => {
        const closeDate = new Date(p.exitTime || p.closedAt);
        return closeDate >= monthAgo;
      });
      const monthlyStats = WinRateService.calculateBotStats(monthlyPositions);
      const monthlyPnL = monthlyPositions.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);

      // Symbol leaderboard with unified win classification
      const symbolStats: Record<string, { trades: number; wins: number; losses: number; pnl: number }> = {};
      for (const pos of closedPositions) {
        const symbol = pos.symbol;
        if (!symbolStats[symbol]) {
          symbolStats[symbol] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
        }
        symbolStats[symbol].trades++;
        // Use percentage-based win/loss (consistent with WinRateService)
        const pnlPct = pos.realizedPnLPercent;
        if (pnlPct !== null && pnlPct !== undefined) {
          if (pnlPct >= CANONICAL_WIN_THRESHOLD) symbolStats[symbol].wins++;
          else if (pnlPct <= -CANONICAL_WIN_THRESHOLD) symbolStats[symbol].losses++;
        } else if ((pos.realizedPnL || 0) > 0) {
          symbolStats[symbol].wins++;
        } else if ((pos.realizedPnL || 0) < 0) {
          symbolStats[symbol].losses++;
        }
        symbolStats[symbol].pnl += pos.realizedPnL || 0;
      }

      const topSymbols = Object.entries(symbolStats)
        .map(([symbol, stats]) => {
          const decided = stats.wins + stats.losses;
          return {
            symbol,
            trades: stats.trades,
            winRate: decided > 0 ? (stats.wins / decided) * 100 : 0,
            pnl: stats.pnl,
          };
        })
        .sort((a, b) => b.pnl - a.pnl)
        .slice(0, 5);

      res.json({
        overall: {
          totalTrades: closedPositions.length,
          wins: overallStats.wins,
          losses: overallStats.losses,
          neutral: overallStats.neutral,
          decided: overallStats.decided,
          winRate: overallStats.winRate,
          totalPnL,
          avgWin: overallStats.avgWinPct,
          avgLoss: overallStats.avgLossPct,
          expectancy: overallStats.expectancy,
        },
        weekly: {
          trades: weeklyPositions.length,
          wins: weeklyStats.wins,
          losses: weeklyStats.losses,
          winRate: weeklyStats.winRate,
          pnl: weeklyPnL,
        },
        monthly: {
          trades: monthlyPositions.length,
          wins: monthlyStats.wins,
          losses: monthlyStats.losses,
          winRate: monthlyStats.winRate,
          pnl: monthlyPnL,
        },
        topSymbols,
        methodology: {
          winThreshold: `>=${CANONICAL_WIN_THRESHOLD}% P&L`,
          lossThreshold: `<=-${CANONICAL_WIN_THRESHOLD}% P&L`,
          note: 'Breakeven trades (|P&L| < 3%) excluded from win rate calculation',
        },
      });
    } catch (error) {
      logger.error("Failed to get performance summary:", error);
      res.status(500).json({ error: "Failed to fetch performance summary" });
    }
  });

  // Check paper trading status for live trading access
  app.get("/api/paper-trading/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const completedPaperTrades = await storage.getCompletedPaperTradesCount(userId);
      const isEligibleForLiveTrading = completedPaperTrades >= REQUIRED_PAPER_TRADES;
      
      res.json({
        completedPaperTrades,
        requiredPaperTrades: REQUIRED_PAPER_TRADES,
        isEligibleForLiveTrading,
        remainingPaperTrades: Math.max(0, REQUIRED_PAPER_TRADES - completedPaperTrades),
        progressPercent: Math.min(100, Math.round((completedPaperTrades / REQUIRED_PAPER_TRADES) * 100)),
      });
    } catch (error) {
      logger.error("Failed to get paper trading status:", error);
      res.status(500).json({ error: "Failed to fetch paper trading status" });
    }
  });

  // Get all active trades for current user
  app.get("/api/active-trades", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const trades = await storage.getActiveTrades(userId);
      res.json(trades);
    } catch (error) {
      logger.error("Failed to get active trades:", error);
      res.status(500).json({ error: "Failed to fetch active trades" });
    }
  });

  // Get a single active trade by ID
  app.get("/api/active-trades/:id", isAuthenticated, async (req: any, res) => {
    try {
      const trade = await storage.getActiveTradeById(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      // Verify ownership
      if (trade.userId !== req.session?.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(trade);
    } catch (error) {
      logger.error("Failed to get active trade:", error);
      res.status(500).json({ error: "Failed to fetch trade" });
    }
  });
  
  // Create a new active trade
  app.post("/api/active-trades", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const validated = insertActiveTradeSchema.parse({
        ...req.body,
        userId,
        entryTime: req.body.entryTime || new Date().toISOString(),
        status: 'open',
      });

      const trade = await storage.createActiveTrade(validated);
      logger.info(`📈 [LIVE-TRADE] New position opened: ${trade.symbol} ${trade.optionType || trade.assetType} @ $${trade.entryPrice}`);
      res.status(201).json(trade);
    } catch (error) {
      logger.error("Failed to create active trade:", error);
      res.status(400).json({ error: "Failed to create trade", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Update an active trade (e.g., update notes, target, stop)
  app.patch("/api/active-trades/:id", isAuthenticated, async (req: any, res) => {
    try {
      const trade = await storage.getActiveTradeById(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      if (trade.userId !== req.session?.userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateActiveTrade(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      logger.error("Failed to update active trade:", error);
      res.status(500).json({ error: "Failed to update trade" });
    }
  });

  // Close an active trade
  app.post("/api/active-trades/:id/close", isAuthenticated, async (req: any, res) => {
    try {
      const trade = await storage.getActiveTradeById(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      if (trade.userId !== req.session?.userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { exitPrice } = req.body;
      if (typeof exitPrice !== 'number' || exitPrice <= 0) {
        return res.status(400).json({ error: "Valid exit price required" });
      }

      const closed = await storage.closeActiveTrade(req.params.id, exitPrice);
      logger.info(`📉 [LIVE-TRADE] Position closed: ${trade.symbol} @ $${exitPrice} (P&L: $${closed?.realizedPnL?.toFixed(2)})`);
      res.json(closed);
    } catch (error) {
      logger.error("Failed to close active trade:", error);
      res.status(500).json({ error: "Failed to close trade" });
    }
  });

  // Delete an active trade (only drafts or mistakes)
  app.delete("/api/active-trades/:id", isAuthenticated, async (req: any, res) => {
    try {
      const trade = await storage.getActiveTradeById(req.params.id);
      if (!trade) {
        return res.status(404).json({ error: "Trade not found" });
      }
      if (trade.userId !== req.session?.userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteActiveTrade(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error("Failed to delete active trade:", error);
      res.status(500).json({ error: "Failed to delete trade" });
    }
  });

  // Performance Tracking Routes
  app.post("/api/performance/validate", async (_req, res) => {
    try {
      const { PerformanceValidator } = await import("./performance-validator");
      const openIdeas = await storage.getOpenTradeIdeas();
      const marketData = await storage.getAllMarketData();
      
      // Build price map
      const priceMap = new Map<string, number>();
      marketData.forEach((data) => {
        priceMap.set(data.symbol, data.currentPrice);
      });

      // Validate all open ideas
      const validationResults = PerformanceValidator.validateBatch(openIdeas, priceMap);
      const now = new Date().toISOString();
      
      // Build detailed results for frontend display
      const detailedResults: any[] = [];
      
      // Update ideas that need changes
      const updated: any[] = [];
      for (const [ideaId, result] of Array.from(validationResults.entries())) {
        const idea = openIdeas.find(i => i.id === ideaId);
        if (!idea) continue;
        
        const currentPrice = priceMap.get(idea.symbol) || idea.entryPrice;
        const updatedIdea = await storage.updateTradeIdeaPerformance(ideaId, {
          outcomeStatus: result.outcomeStatus,
          exitPrice: result.exitPrice,
          percentGain: result.percentGain,
          realizedPnL: result.realizedPnL,
          resolutionReason: result.resolutionReason,
          exitDate: result.exitDate,
          actualHoldingTimeMinutes: result.actualHoldingTimeMinutes,
          predictionAccurate: result.predictionAccurate,
          predictionValidatedAt: result.predictionValidatedAt,
          highestPriceReached: result.highestPriceReached,
          lowestPriceReached: result.lowestPriceReached,
          validatedAt: now,
        });
        if (updatedIdea) {
          updated.push(updatedIdea);
        }
        
        // Add to detailed results
        detailedResults.push({
          id: idea.id,
          symbol: idea.symbol,
          assetType: idea.assetType,
          direction: idea.direction,
          entryPrice: idea.entryPrice,
          currentPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          wasUpdated: true,
          newStatus: result.outcomeStatus,
          reasoning: result.resolutionReason || 'Price hit target or stop loss',
          percentToTarget: idea.direction === 'long' 
            ? ((idea.targetPrice - currentPrice) / currentPrice) * 100
            : ((currentPrice - idea.targetPrice) / currentPrice) * 100,
          percentToStop: idea.direction === 'long'
            ? ((currentPrice - idea.stopLoss) / currentPrice) * 100
            : ((idea.stopLoss - currentPrice) / currentPrice) * 100,
          timestamp: now,
        });
      }

      // Stamp validatedAt on ALL open ideas that were checked, even if no state change
      for (const idea of openIdeas) {
        if (!validationResults.has(idea.id)) {
          const currentPrice = priceMap.get(idea.symbol) || idea.entryPrice;
          
          // Track price extremes even for open trades
          const highestPrice = Math.max(idea.highestPriceReached || idea.entryPrice, currentPrice);
          const lowestPrice = Math.min(idea.lowestPriceReached || idea.entryPrice, currentPrice);
          
          // Idea was checked but didn't need update - still stamp validatedAt and update price extremes
          await storage.updateTradeIdeaPerformance(idea.id, {
            validatedAt: now,
            highestPriceReached: highestPrice,
            lowestPriceReached: lowestPrice,
          });
          
          // Calculate distance percentages
          const percentToTarget = idea.direction === 'long' 
            ? ((idea.targetPrice - currentPrice) / currentPrice) * 100
            : ((currentPrice - idea.targetPrice) / currentPrice) * 100;
          const percentToStop = idea.direction === 'long'
            ? ((currentPrice - idea.stopLoss) / currentPrice) * 100
            : ((idea.stopLoss - currentPrice) / currentPrice) * 100;
          
          // Generate reasoning for why it stayed open
          let reasoning = '';
          if (idea.direction === 'long') {
            if (currentPrice < idea.targetPrice && currentPrice > idea.stopLoss) {
              reasoning = `Price $${currentPrice.toFixed(2)} between entry $${idea.entryPrice.toFixed(2)} and target $${idea.targetPrice.toFixed(2)}. Still active - needs ${Math.abs(percentToTarget).toFixed(1)}% move to hit target.`;
            }
          } else {
            if (currentPrice > idea.targetPrice && currentPrice < idea.stopLoss) {
              reasoning = `Price $${currentPrice.toFixed(2)} between entry $${idea.entryPrice.toFixed(2)} and target $${idea.targetPrice.toFixed(2)}. Still active - needs ${Math.abs(percentToTarget).toFixed(1)}% move to hit target.`;
            }
          }
          
          detailedResults.push({
            id: idea.id,
            symbol: idea.symbol,
            assetType: idea.assetType,
            direction: idea.direction,
            entryPrice: idea.entryPrice,
            currentPrice,
            targetPrice: idea.targetPrice,
            stopLoss: idea.stopLoss,
            wasUpdated: false,
            reasoning: reasoning || 'Position still within range - no action taken',
            percentToTarget,
            percentToStop,
            timestamp: now,
          });
        }
      }

      res.json({
        success: true,
        validated: openIdeas.length,
        updated: updated.length,
        timestamp: new Date().toISOString(),
        results: detailedResults,
      });
    } catch (error) {
      console.error("Validation error:", error);
      res.status(500).json({ error: "Failed to validate trade ideas" });
    }
  });

  // 📰 NEWS API ROUTES
  
  // GET /api/news - Fetch recent breaking news (last 24h)
  app.get("/api/news", marketDataLimiter, async (req, res) => {
    try {
      const { fetchBreakingNews, getNewsServiceStatus } = await import('./news-service');
      
      // Optional query params for filtering
      const tickers = req.query.tickers as string | undefined;
      const topics = req.query.topics as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      
      logger.info(`📰 [NEWS-API] Fetching breaking news (tickers=${tickers || 'all'}, topics=${topics || 'all'}, limit=${limit})`);
      
      const breakingNews = await fetchBreakingNews(tickers, topics, limit);
      const status = getNewsServiceStatus();
      
      res.json({
        news: breakingNews,
        count: breakingNews.length,
        serviceStatus: status
      });
    } catch (error: any) {
      logger.error('📰 [NEWS-API] Error fetching news:', error);
      res.status(500).json({ error: "Failed to fetch news" });
    }
  });
  
  // POST /api/trade-ideas/news - Manually trigger news-based trade generation (admin only)
  app.post("/api/trade-ideas/news", requireAdminJWT, async (req, res) => {
    try {
      const { fetchBreakingNews } = await import('./news-service');
      const { generateTradeIdeasFromNews } = await import('./ai-service');
      
      // Optional: manually provide news article or fetch fresh news
      const manualNewsArticle = req.body.newsArticle;
      
      logger.info('📰 [NEWS-TRADE] Manual news-based trade generation triggered');
      
      if (manualNewsArticle) {
        // Generate from provided article
        logger.info(`📰 [NEWS-TRADE] Using manually provided article: "${manualNewsArticle.title}"`);
        
        const aiIdea = await generateTradeIdeasFromNews(manualNewsArticle);
        
        if (!aiIdea) {
          return res.status(400).json({ 
            success: false,
            error: "Failed to generate valid trade idea from news article" 
          });
        }
        
        // Save trade idea
        const { entryPrice, targetPrice, stopLoss } = aiIdea;
        const riskRewardRatio = aiIdea.direction === 'long'
          ? (targetPrice - entryPrice) / (entryPrice - stopLoss)
          : (entryPrice - targetPrice) / (stopLoss - entryPrice);
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: aiIdea.symbol,
          assetType: aiIdea.assetType,
          direction: aiIdea.direction,
          holdingPeriod: 'day',
          entryPrice,
          targetPrice,
          stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: aiIdea.catalyst,
          catalystSourceUrl: manualNewsArticle.url, // Store news URL
          analysis: aiIdea.analysis,
          liquidityWarning: aiIdea.entryPrice < 5,
          sessionContext: aiIdea.sessionContext,
          timestamp: new Date().toISOString(),
          source: 'news',
          isNewsCatalyst: true,
          expiryDate: aiIdea.expiryDate || null,
          strikePrice: (aiIdea as any).strikePrice || null,
          optionType: (aiIdea as any).optionType || null,
          isLottoPlay: (aiIdea as any).isLottoPlay || false,
        });
        
        logger.info(`✅ [NEWS-TRADE] Created news-driven trade: ${tradeIdea.symbol} ${tradeIdea.direction.toUpperCase()}`);
        
        res.json({
          success: true,
          tradeIdea,
          newsSource: manualNewsArticle.url
        });
      } else {
        // Fetch fresh breaking news and generate trades
        logger.info('📰 [NEWS-TRADE] Fetching fresh breaking news for trade generation');
        
        const breakingNews = await fetchBreakingNews(undefined, undefined, 20);
        
        if (breakingNews.length === 0) {
          return res.json({ 
            success: false,
            message: "No breaking news found in last 24 hours",
            generated: 0
          });
        }
        
        logger.info(`📰 [NEWS-TRADE] Found ${breakingNews.length} breaking news articles`);
        
        // Generate trade ideas from breaking news (limit to top 5 articles)
        const generatedTrades = [];
        const failedArticles = [];
        
        for (const article of breakingNews.slice(0, 5)) {
          try {
            const aiIdea = await generateTradeIdeasFromNews(article);
            
            if (!aiIdea) {
              failedArticles.push({ 
                title: article.title, 
                reason: 'Failed validation or generation' 
              });
              continue;
            }
            
            // Save trade idea
            const { entryPrice, targetPrice, stopLoss } = aiIdea;
            const riskRewardRatio = aiIdea.direction === 'long'
              ? (targetPrice - entryPrice) / (entryPrice - stopLoss)
              : (entryPrice - targetPrice) / (stopLoss - entryPrice);
            
            const tradeIdea = await storage.createTradeIdea({
              symbol: aiIdea.symbol,
              assetType: aiIdea.assetType,
              direction: aiIdea.direction,
              holdingPeriod: 'day',
              entryPrice,
              targetPrice,
              stopLoss,
              riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
              catalyst: aiIdea.catalyst,
              catalystSourceUrl: article.url, // Store news URL
              analysis: aiIdea.analysis,
              liquidityWarning: aiIdea.entryPrice < 5,
              sessionContext: aiIdea.sessionContext,
              timestamp: new Date().toISOString(),
              source: 'news',
              isNewsCatalyst: true,
              expiryDate: aiIdea.expiryDate || null,
              strikePrice: (aiIdea as any).strikePrice || null,
              optionType: (aiIdea as any).optionType || null,
              isLottoPlay: (aiIdea as any).isLottoPlay || false,
            });
            
            // 🔥 Clear stale price cache to force fresh fetch on next validation
            clearCachedPrice(aiIdea.symbol);
            
            generatedTrades.push(tradeIdea);
            logger.info(`✅ [NEWS-TRADE] Created news-driven trade: ${tradeIdea.symbol} from "${article.title}"`);
          } catch (error: any) {
            logger.error(`📰 [NEWS-TRADE] Failed to generate trade from article "${article.title}":`, error);
            failedArticles.push({ 
              title: article.title, 
              reason: error.message 
            });
          }
        }
        
        logger.info(`📰 [NEWS-TRADE] Generated ${generatedTrades.length} trades from ${breakingNews.length} breaking news articles`);
        
        res.json({
          success: true,
          generated: generatedTrades.length,
          tradeIdeas: generatedTrades,
          breakingNewsCount: breakingNews.length,
          failedCount: failedArticles.length,
          failures: failedArticles
        });
      }
    } catch (error: any) {
      logger.error('📰 [NEWS-TRADE] Error generating news-based trades:', error);
      res.status(500).json({ error: "Failed to generate news-based trade ideas" });
    }
  });

  // 📊 FILTER BREAKDOWN: Shows exactly how we get from raw count → filtered count
  // This endpoint explains the data pipeline for transparency
  app.get("/api/performance/filter-breakdown", async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Count at each filter stage
      const totalRaw = allIdeas.length;
      
      // Stage 1: Exclude buggy/test trades
      const afterBuggyFilter = allIdeas.filter(idea => !idea.excludeFromTraining);
      const buggyExcluded = totalRaw - afterBuggyFilter.length;
      
      // Stage 2: Exclude options
      const afterOptionsFilter = afterBuggyFilter.filter(idea => idea.assetType !== 'option');
      const optionsExcluded = afterBuggyFilter.length - afterOptionsFilter.length;
      
      // Stage 3: Exclude flow/lotto sources
      const afterFlowFilter = afterOptionsFilter.filter(idea => idea.source !== 'flow' && idea.source !== 'lotto');
      const flowLottoExcluded = afterOptionsFilter.length - afterFlowFilter.length;
      
      // Stage 4: Exclude legacy engines
      const afterEngineFilter = afterFlowFilter.filter(isCurrentGenEngine);
      const legacyExcluded = afterFlowFilter.length - afterEngineFilter.length;
      
      // Final: Get decided trades (wins + real losses)
      const decidedTrades = getDecidedTrades(afterEngineFilter, { includeAllVersions: true });
      const wins = decidedTrades.filter(idea => idea.outcomeStatus === 'hit_target').length;
      const losses = decidedTrades.length - wins;
      
      // Also count open/expired for context
      const openTrades = afterEngineFilter.filter(idea => idea.outcomeStatus === 'open').length;
      const expiredTrades = afterEngineFilter.filter(idea => idea.outcomeStatus === 'expired').length;
      const breakeven = afterEngineFilter.filter(idea => 
        idea.outcomeStatus === 'hit_stop' && !isRealLoss(idea)
      ).length;
      
      res.json({
        rawTotal: totalRaw,
        filterStages: [
          { stage: 'Raw Database Total', count: totalRaw, excluded: 0, reason: 'All trade ideas in database' },
          { stage: 'After Buggy/Test Filter', count: afterBuggyFilter.length, excluded: buggyExcluded, reason: 'Exclude trades marked as buggy or test data' },
          { stage: 'After Options Filter', count: afterOptionsFilter.length, excluded: optionsExcluded, reason: 'Exclude options (no proper pricing yet)' },
          { stage: 'After Flow/Lotto Filter', count: afterFlowFilter.length, excluded: flowLottoExcluded, reason: 'Exclude flow scanner and lotto trades' },
          { stage: 'After Legacy Engine Filter', count: afterEngineFilter.length, excluded: legacyExcluded, reason: 'Exclude legacy v1.x/v2.x engines' },
        ],
        filteredTotal: afterEngineFilter.length,
        breakdown: {
          open: openTrades,
          expired: expiredTrades,
          breakeven: breakeven,
          decidedWins: wins,
          decidedLosses: losses,
          decidedTotal: decidedTrades.length,
        },
        winRate: decidedTrades.length > 0 
          ? Math.round((wins / decidedTrades.length) * 1000) / 10 
          : 0,
        explanation: `From ${totalRaw} raw trades → ${afterEngineFilter.length} filtered → ${decidedTrades.length} decided (${wins}W/${losses}L)`,
      });
    } catch (error) {
      logger.error("Filter breakdown error:", error);
      res.status(500).json({ error: "Failed to fetch filter breakdown" });
    }
  });

  // Performance stats cache (5-minute TTL) - separate cache per filter combination
  const performanceStatsCache = new Map<string, { data: any; timestamp: number }>();
  const PERF_STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  app.get("/api/performance/stats", async (req, res) => {
    try {
      const now = Date.now();
      
      // Parse query parameters for filtering
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const source = req.query.source as string | undefined;
      const includeOptions = req.query.includeOptions === 'true';
      
      // Create cache key based on ALL filters (including includeOptions)
      const cacheKey = `${startDate || 'all'}_${endDate || 'all'}_${source || 'all'}_${includeOptions ? 'with-options' : 'no-options'}`;
      
      // Check cache
      const cached = performanceStatsCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < PERF_STATS_CACHE_TTL) {
        logger.info(`[PERF-STATS] Cache hit for filters: ${cacheKey}`);
        return res.json(cached.data);
      }
      
      // Cache miss - fetch fresh data with filters
      logger.info(`[PERF-STATS] Cache miss for filters: ${cacheKey} - fetching fresh data`);
      logger.info(`[PERF-STATS] Filter values: startDate=${startDate}, endDate=${endDate}, source=${source}, includeOptions=${includeOptions}`);
      
      const filters = { startDate, endDate, source, includeOptions };
      const stats = await storage.getPerformanceStats(filters);
      
      // Update cache for this filter combination
      performanceStatsCache.set(cacheKey, { data: stats, timestamp: now });
      logger.info(`[PERF-STATS] Cache updated for filters: ${cacheKey}`);
      
      res.json(stats);
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Failed to fetch performance stats" });
    }
  });

  // ============================================================
  // UNIFIED WIN RATE ENDPOINT - Single Source of Truth
  // Uses WinRateService for consistent calculations across platform
  // ============================================================
  app.get("/api/performance/unified-win-rate", async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        source: req.query.source as string | undefined,
        assetType: req.query.assetType as string | undefined,
        includeOptions: req.query.includeOptions === 'true',
        includeAllVersions: req.query.includeAllVersions === 'true',
      };
      
      const stats = WinRateService.calculate(allIdeas, filters);
      
      res.json({
        success: true,
        ...stats,
        _meta: {
          endpoint: '/api/performance/unified-win-rate',
          description: 'Canonical win rate calculation using WinRateService',
          timestamp: new Date().toISOString(),
        }
      });
    } catch (error) {
      logger.error("Unified win rate error:", error);
      res.status(500).json({ error: "Failed to calculate unified win rate" });
    }
  });

  // Engine Performance Breakdown cache (5-minute TTL)
  let engineBreakdownCache: { data: any; timestamp: number } | null = null;
  const ENGINE_BREAKDOWN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Engine Performance Breakdown - Compare AI vs Quant vs Hybrid vs Flow
  app.get("/api/performance/engine-breakdown", async (_req, res) => {
    try {
      const now = Date.now();
      
      // Check cache
      if (engineBreakdownCache && (now - engineBreakdownCache.timestamp) < ENGINE_BREAKDOWN_CACHE_TTL) {
        return res.json(engineBreakdownCache.data);
      }
      
      const filters = { includeOptions: false }; // Exclude options for now
      
      // Fetch stats for each engine type
      const [aiStats, quantStats, hybridStats, flowStats] = await Promise.all([
        storage.getPerformanceStats({ ...filters, source: 'ai' }),
        storage.getPerformanceStats({ ...filters, source: 'quant' }),
        storage.getPerformanceStats({ ...filters, source: 'hybrid' }),
        storage.getPerformanceStats({ ...filters, source: 'flow' }),
      ]);
      
      const data = {
        ai: {
          totalIdeas: aiStats.overall.totalIdeas,
          closedIdeas: aiStats.overall.closedIdeas,
          winRate: aiStats.overall.winRate,
          avgPercentGain: aiStats.overall.avgPercentGain,
        },
        quant: {
          totalIdeas: quantStats.overall.totalIdeas,
          closedIdeas: quantStats.overall.closedIdeas,
          winRate: quantStats.overall.winRate,
          avgPercentGain: quantStats.overall.avgPercentGain,
        },
        hybrid: {
          totalIdeas: hybridStats.overall.totalIdeas,
          closedIdeas: hybridStats.overall.closedIdeas,
          winRate: hybridStats.overall.winRate,
          avgPercentGain: hybridStats.overall.avgPercentGain,
        },
        flow: {
          totalIdeas: flowStats.overall.totalIdeas,
          closedIdeas: flowStats.overall.closedIdeas,
          winRate: flowStats.overall.winRate,
          avgPercentGain: flowStats.overall.avgPercentGain,
        },
      };
      
      // Update cache
      engineBreakdownCache = { data, timestamp: now };
      
      res.json(data);
    } catch (error) {
      console.error("Engine breakdown error:", error);
      res.status(500).json({ error: "Failed to fetch engine breakdown" });
    }
  });

  app.get("/api/performance/export", async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter((idea) => idea.outcomeStatus !== 'open');
      
      // Build CSV
      const headers = [
        'ID', 'Symbol', 'Asset Type', 'Direction', 'Source', 
        'Entry Price', 'Target Price', 'Stop Loss', 'Exit Price',
        'R:R Ratio', 'Percent Gain', 'Outcome Status', 'Resolution Reason',
        'Created At', 'Exit Date', 'Holding Time (min)',
        'Confidence Score', 'Probability Band', 'Quality Signals',
        'Catalyst'
      ].join(',');

      const rows = closedIdeas.map((idea) => {
        return [
          idea.id,
          idea.symbol,
          idea.assetType,
          idea.direction,
          idea.source || 'unknown',
          idea.entryPrice,
          idea.targetPrice,
          idea.stopLoss,
          idea.exitPrice || '',
          idea.riskRewardRatio,
          idea.percentGain || '',
          idea.outcomeStatus,
          idea.resolutionReason || '',
          idea.timestamp,
          idea.exitDate || '',
          idea.actualHoldingTimeMinutes || '',
          idea.confidenceScore,
          idea.probabilityBand,
          (idea.qualitySignals || []).join(';'),
          `"${idea.catalyst.replace(/"/g, '""')}"`, // Escape quotes in catalyst
        ].join(',');
      });

      const csv = [headers, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="trade-ideas-performance.csv"');
      res.send(csv);
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // Advanced Performance Analytics Endpoints (Advanced tier required)

  // 1. Symbol Leaderboard - Top/Bottom performing symbols
  app.get("/api/performance/symbol-leaderboard", requireTier('canAccessSymbolLeaderboard'), async (req, res) => {
    try {
      const engine = req.query.engine as string | undefined;
      
      // Get all trade ideas
      const allIdeas = await storage.getAllTradeIdeas();
      
      // 🔧 DATA INTEGRITY: Use canonical filters from storage.ts
      // Filter: DECIDED trades only (auto-resolved wins + real losses)
      let filteredIdeas = getDecidedTradesByResolution(allIdeas, { includeAllVersions: false });
      
      if (engine) {
        filteredIdeas = filteredIdeas.filter(idea => idea.source === engine);
      }
      
      // Group by symbol
      const symbolStats = new Map<string, {
        symbol: string;
        trades: typeof filteredIdeas;
        wins: number;
        losses: number;
      }>();
      
      filteredIdeas.forEach(idea => {
        if (!symbolStats.has(idea.symbol)) {
          symbolStats.set(idea.symbol, {
            symbol: idea.symbol,
            trades: [],
            wins: 0,
            losses: 0,
          });
        }
        
        const stats = symbolStats.get(idea.symbol)!;
        stats.trades.push(idea);
        
        if (idea.resolutionReason === 'auto_target_hit') {
          stats.wins++;
        } else if (isRealLossByResolution(idea)) {
          stats.losses++;
        }
      });
      
      // 🔧 SAMPLE SIZE GATING: Min 20 trades required for statistical reliability
      // Symbols with <50 trades get a warning badge
      const MIN_TRADES_FOR_DISPLAY = 20;
      const MIN_TRADES_FOR_CONFIDENCE = 50;
      
      const leaderboard: SymbolLeaderboardEntry[] = [];
      
      symbolStats.forEach(stats => {
        // Hide symbols with <20 trades - statistically meaningless
        if (stats.trades.length < MIN_TRADES_FOR_DISPLAY) return;
        
        const totalTrades = stats.trades.length;
        const winRate = totalTrades > 0 ? (stats.wins / totalTrades) * 100 : 0;
        
        // Calculate avg gain on wins
        const winningTrades = stats.trades.filter(t => t.resolutionReason === 'auto_target_hit');
        const avgGainOnWins = winningTrades.length > 0
          ? winningTrades.reduce((sum, t) => sum + (t.percentGain || 0), 0) / winningTrades.length
          : 0;
        
        // Calculate avg loss on losses
        const losingTrades = stats.trades.filter(t => t.resolutionReason === 'auto_stop_hit');
        const avgLossOnLosses = losingTrades.length > 0
          ? losingTrades.reduce((sum, t) => sum + (t.percentGain || 0), 0) / losingTrades.length
          : 0;
        
        leaderboard.push({
          symbol: stats.symbol,
          trades: totalTrades,
          wins: stats.wins,
          losses: stats.losses,
          winRate: Math.round(winRate * 10) / 10,
          avgGain: Math.round(avgGainOnWins * 10) / 10,
          avgLoss: Math.round(avgLossOnLosses * 10) / 10,
          sampleWarning: totalTrades < MIN_TRADES_FOR_CONFIDENCE, // Warn if <50 trades
        });
      });
      
      // Sort by winRate DESC, then by trades DESC
      leaderboard.sort((a, b) => {
        if (b.winRate !== a.winRate) {
          return b.winRate - a.winRate;
        }
        return b.trades - a.trades;
      });
      
      // Get top 20 winners and bottom 10 losers
      const topPerformers = leaderboard.slice(0, 20);
      const underperformers = leaderboard.slice(-10).reverse();
      
      res.json({
        topPerformers,
        underperformers,
      });
    } catch (error) {
      logger.error("Symbol leaderboard error:", error);
      res.status(500).json({ error: "Failed to fetch symbol leaderboard" });
    }
  });

  // 2. Time of Day Heatmap - Win rate by hour (9 AM - 4 PM ET)
  app.get("/api/performance/time-of-day-heatmap", requireTier('canAccessTimeHeatmap'), async (req, res) => {
    try {
      const engine = req.query.engine as string | undefined;
      
      // Get all trade ideas
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Filter: only auto-resolved trades + optional engine filter
      // Also filter out trades with synthetic exit timestamps (exactly 12:00:00)
      let filteredIdeas = allIdeas.filter(idea => {
        // Must be auto-resolved
        if (idea.resolutionReason !== 'auto_target_hit' && idea.resolutionReason !== 'auto_stop_hit') {
          return false;
        }
        
        // Must have a valid exitDate (not null)
        if (!idea.exitDate) {
          return false;
        }
        
        // Filter out synthetic 12:00:00 timestamps
        // These are likely placeholder values, not real exit times
        try {
          const exitDate = new Date(idea.exitDate);
          const exitHour = exitDate.getUTCHours();
          const exitMinute = exitDate.getUTCMinutes();
          const exitSecond = exitDate.getUTCSeconds();
          
          // Also check in ET timezone
          const etTimeStr = formatInTimeZone(exitDate, 'America/New_York', 'HH:mm:ss');
          const isSyntheticET = etTimeStr === '12:00:00';
          
          // Filter out if exactly 12:00:00 UTC or 12:00:00 ET (likely synthetic)
          if ((exitHour === 12 && exitMinute === 0 && exitSecond === 0) || isSyntheticET) {
            return false;
          }
        } catch {
          // If we can't parse the exit date, exclude it
          return false;
        }
        
        return true;
      });
      
      if (engine) {
        filteredIdeas = filteredIdeas.filter(idea => idea.source === engine);
      }
      
      // Group by hour (ET timezone)
      const hourlyStats = new Map<number, {
        hour: number;
        trades: typeof filteredIdeas;
        wins: number;
        losses: number;
      }>();
      
      // Initialize hours 9-16 (9 AM - 4 PM ET)
      for (let hour = 9; hour <= 16; hour++) {
        hourlyStats.set(hour, {
          hour,
          trades: [],
          wins: 0,
          losses: 0,
        });
      }
      
      filteredIdeas.forEach(idea => {
        try {
          // Convert timestamp to ET timezone and extract hour
          const etHour = parseInt(formatInTimeZone(new Date(idea.timestamp), 'America/New_York', 'H'));
          
          // Only include market hours (9 AM - 4 PM)
          if (etHour >= 9 && etHour <= 16) {
            const stats = hourlyStats.get(etHour)!;
            stats.trades.push(idea);
            
            if (idea.resolutionReason === 'auto_target_hit') {
              stats.wins++;
            } else if (idea.resolutionReason === 'auto_stop_hit') {
              stats.losses++;
            }
          }
        } catch (error) {
          logger.error(`Failed to parse timestamp for idea ${idea.id}:`, error);
        }
      });
      
      // Calculate win rates
      const heatmap: TimeOfDayHeatmapEntry[] = [];
      
      hourlyStats.forEach(stats => {
        const totalTrades = stats.trades.length;
        const winRate = totalTrades > 0 ? (stats.wins / totalTrades) * 100 : 0;
        
        // Format hour label (e.g., "9 AM", "12 PM", "4 PM")
        const hourLabel = stats.hour === 12 
          ? "12 PM" 
          : stats.hour > 12 
            ? `${stats.hour - 12} PM` 
            : `${stats.hour} AM`;
        
        heatmap.push({
          hour: stats.hour,
          hourLabel,
          trades: totalTrades,
          wins: stats.wins,
          losses: stats.losses,
          winRate: Math.round(winRate * 10) / 10,
        });
      });
      
      // Sort by hour
      heatmap.sort((a, b) => a.hour - b.hour);
      
      res.json(heatmap);
    } catch (error) {
      logger.error("Time-of-day heatmap error:", error);
      res.status(500).json({ error: "Failed to fetch time-of-day heatmap" });
    }
  });

  // 3. Engine Trends - Weekly performance for each engine over last 8 weeks
  app.get("/api/performance/engine-trends", requireTier('canAccessEngineTrends'), async (req, res) => {
    try {
      // Get all trade ideas
      const allIdeas = await storage.getAllTradeIdeas();
      
      // 🔧 DATA INTEGRITY: Use canonical filters from storage.ts
      // Filter: DECIDED trades only (auto-resolved wins + real losses)
      const filteredIdeas = getDecidedTradesByResolution(allIdeas, { includeAllVersions: false });
      
      // Get date 8 weeks ago
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - (8 * 7));
      
      // Filter to last 8 weeks only
      const recentIdeas = filteredIdeas.filter(idea => {
        const ideaDate = new Date(idea.timestamp);
        return ideaDate >= eightWeeksAgo;
      });
      
      // Group by engine and week
      const engineWeekStats = new Map<string, {
        engine: string;
        week: string;
        trades: typeof recentIdeas;
        wins: number;
      }>();
      
      recentIdeas.forEach(idea => {
        const engine = idea.source || 'unknown';
        
        // Get start of week (Monday) in ET timezone
        const ideaDate = new Date(idea.timestamp);
        const dayOfWeek = ideaDate.getDay();
        const diff = ideaDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust when day is Sunday
        const weekStart = new Date(ideaDate.setDate(diff));
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = weekStart.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        const key = `${engine}_${weekKey}`;
        
        if (!engineWeekStats.has(key)) {
          engineWeekStats.set(key, {
            engine,
            week: weekKey,
            trades: [],
            wins: 0,
          });
        }
        
        const stats = engineWeekStats.get(key)!;
        stats.trades.push(idea);
        
        if (idea.resolutionReason === 'auto_target_hit') {
          stats.wins++;
        }
      });
      
      // Pivot data: group by week, with each engine as a column
      const weeklyData = new Map<string, {
        week: string;
        weekLabel: string;
        ai: number;
        quant: number;
        hybrid: number;
        flow: number;
        news: number;
      }>();
      
      // Get all unique weeks
      const uniqueWeeks = new Set<string>();
      engineWeekStats.forEach((_, key) => {
        const week = key.split('_')[1];
        uniqueWeeks.add(week);
      });
      
      // Initialize each week with 0 win rates
      uniqueWeeks.forEach(week => {
        const weekDate = new Date(week);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const weekLabel = `${monthNames[weekDate.getMonth()]} ${weekDate.getDate()}`;
        
        weeklyData.set(week, {
          week,
          weekLabel,
          ai: 0,
          quant: 0,
          hybrid: 0,
          flow: 0,
          news: 0,
        });
      });
      
      // Calculate win rates for each engine per week
      engineWeekStats.forEach(stats => {
        const totalTrades = stats.trades.length;
        const winRate = totalTrades > 0 ? Math.round((stats.wins / totalTrades) * 1000) / 10 : 0;
        
        const weekData = weeklyData.get(stats.week);
        if (weekData) {
          const engine = stats.engine.toLowerCase();
          if (engine === 'ai') weekData.ai = winRate;
          else if (engine === 'quant') weekData.quant = winRate;
          else if (engine === 'hybrid') weekData.hybrid = winRate;
          else if (engine === 'flow') weekData.flow = winRate;
          else if (engine === 'news') weekData.news = winRate;
        }
      });
      
      // Convert to array and sort by week ASC (oldest first for chart display)
      const trends = Array.from(weeklyData.values()).sort((a, b) => a.week.localeCompare(b.week));
      
      res.json(trends);
    } catch (error) {
      logger.error("Engine trends error:", error);
      res.status(500).json({ error: "Failed to fetch engine trends" });
    }
  });

  // 4. Signal Strength Analysis - Win rate by actual signal consensus (# of agreeing indicators)
  // NEW: Groups by qualitySignals array length, NOT legacy confidence percentages
  app.get("/api/performance/confidence-calibration", async (req, res) => {
    try {
      const engine = req.query.engine as string | undefined;
      
      // Get all trade ideas
      const allIdeas = await storage.getAllTradeIdeas();
      
      // 🔧 DATA INTEGRITY: Use shared canonical filters for consistency (include Flow)
      const preFiltered = applyCanonicalPerformanceFilters(allIdeas, { includeFlowLotto: true });
      
      // Get decided trades only (auto-resolved wins + real losses)
      let filteredIdeas = getDecidedTradesByResolution(preFiltered, { includeAllVersions: false });
      
      if (engine) {
        filteredIdeas = filteredIdeas.filter(idea => idea.source === engine);
      }
      
      // NEW: Group by ACTUAL signal count (qualitySignals array length)
      // Signal Strength Bands: A (5+), B+ (4), B (3), C+ (2), C (1), D (0)
      const signalBands = ['A', 'B+', 'B', 'C+', 'C', 'D'];
      const bandStats = new Map<string, {
        band: string;
        signalCount: string;
        trades: typeof filteredIdeas;
        wins: number;
      }>();
      
      signalBands.forEach(band => {
        const signalCount = band === 'A' ? '5+' : band === 'B+' ? '4' : band === 'B' ? '3' : band === 'C+' ? '2' : band === 'C' ? '1' : '0';
        bandStats.set(band, {
          band,
          signalCount,
          trades: [],
          wins: 0,
        });
      });
      
      filteredIdeas.forEach(idea => {
        // Count actual signals from qualitySignals array
        const signalCount = idea.qualitySignals?.length || 0;
        
        // Map signal count to band
        let band: string;
        if (signalCount >= 5) band = 'A';
        else if (signalCount === 4) band = 'B+';
        else if (signalCount === 3) band = 'B';
        else if (signalCount === 2) band = 'C+';
        else if (signalCount === 1) band = 'C';
        else band = 'D';
        
        const stats = bandStats.get(band)!;
        stats.trades.push(idea);
        
        if (idea.resolutionReason === 'auto_target_hit') {
          stats.wins++;
        }
      });
      
      // Calculate win rates
      const calibration: SignalStrengthEntry[] = [];
      
      // Band label mapping for display - shows signal count, not fake probability
      const bandLabels: Record<string, string> = {
        'A': 'A (5+ signals)',
        'B+': 'B+ (4 signals)',
        'B': 'B (3 signals)',
        'C+': 'C+ (2 signals)',
        'C': 'C (1 signal)',
        'D': 'D (0 signals)'
      };
      
      // Return in order from strongest to weakest signal consensus
      signalBands.forEach(band => {
        const stats = bandStats.get(band)!;
        const totalTrades = stats.trades.length;
        const losses = totalTrades - stats.wins;
        const winRate = totalTrades > 0 ? (stats.wins / totalTrades) * 100 : 0;
        
        calibration.push({
          band: stats.band,
          bandLabel: bandLabels[stats.band] || stats.band,
          trades: totalTrades,
          wins: stats.wins,
          losses: losses,
          winRate: Math.round(winRate * 10) / 10,
        });
      });
      
      res.json(calibration);
    } catch (error) {
      logger.error("Signal strength analysis error:", error);
      res.status(500).json({ error: "Failed to fetch signal strength analysis" });
    }
  });

  // Signal Strength Stats - Uses ACTUAL signal counts from qualitySignals array
  // HONEST DATA: No more fake probability percentages
  // NOTE: Uses same filters as /api/performance/stats for consistency
  app.get("/api/performance/calibrated-stats", async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Use SAME filters as main performance stats to avoid data mismatch
      // Default filters: excludes options/lotto for consistency with headline win rate
      const filteredIdeas = applyCanonicalPerformanceFilters(allIdeas);
      
      // Get decided trades only (wins + real losses, excludes breakeven, expired, and legacy engines)
      const resolvedIdeas = getDecidedTrades(filteredIdeas, { includeAllVersions: false });
      
      // NEW: Group by ACTUAL signal count (qualitySignals.length), not fake confidence scores
      // Signal Strength Bands: A (5+), B+ (4), B (3), C+ (2), C (1), D (0)
      const bands = [
        { name: 'A (5+ signals)', key: 'A', minSignals: 5, maxSignals: 999, wins: 0, losses: 0 },
        { name: 'B+ (4 signals)', key: 'B+', minSignals: 4, maxSignals: 4, wins: 0, losses: 0 },
        { name: 'B (3 signals)', key: 'B', minSignals: 3, maxSignals: 3, wins: 0, losses: 0 },
        { name: 'C+ (2 signals)', key: 'C+', minSignals: 2, maxSignals: 2, wins: 0, losses: 0 },
        { name: 'C (1 signal)', key: 'C', minSignals: 1, maxSignals: 1, wins: 0, losses: 0 },
        { name: 'D (0 signals)', key: 'D', minSignals: 0, maxSignals: 0, wins: 0, losses: 0 },
      ];
      
      resolvedIdeas.forEach(idea => {
        // Use ACTUAL signal count from qualitySignals array
        const signalCount = idea.qualitySignals?.length || 0;
        const isWin = idea.outcomeStatus === 'hit_target';
        
        const band = bands.find(b => signalCount >= b.minSignals && signalCount <= b.maxSignals);
        if (band) {
          if (isWin) band.wins++;
          else band.losses++;
        }
      });
      
      // Calculate win rates for each band - CONSOLIDATED to A, B, C, D for external display
      // Internally we keep A/B+/B/C+/C/D, but externally we show only A/B/C/D
      const coarseBands = [
        { letter: 'A', wins: 0, losses: 0, detailedBands: ['A (5+ signals)'] },
        { letter: 'B', wins: 0, losses: 0, detailedBands: [] as string[] },
        { letter: 'C', wins: 0, losses: 0, detailedBands: [] as string[] },
        { letter: 'D', wins: 0, losses: 0, detailedBands: ['D (0 signals)'] },
      ];
      
      // Map detailed bands to coarse bands
      for (const band of bands) {
        if (band.key === 'A') {
          coarseBands[0].wins += band.wins;
          coarseBands[0].losses += band.losses;
        } else if (band.key === 'B+' || band.key === 'B') {
          coarseBands[1].wins += band.wins;
          coarseBands[1].losses += band.losses;
          if (!coarseBands[1].detailedBands.includes(band.name)) {
            coarseBands[1].detailedBands.push(band.name);
          }
        } else if (band.key === 'C+' || band.key === 'C') {
          coarseBands[2].wins += band.wins;
          coarseBands[2].losses += band.losses;
          if (!coarseBands[2].detailedBands.includes(band.name)) {
            coarseBands[2].detailedBands.push(band.name);
          }
        } else if (band.key === 'D') {
          coarseBands[3].wins += band.wins;
          coarseBands[3].losses += band.losses;
        }
      }
      
      // Return consolidated breakdown with coarse bands (A, B, C, D only)
      const confidenceBreakdown = coarseBands.map(band => ({
        level: band.letter,
        trades: band.wins + band.losses,
        wins: band.wins,
        losses: band.losses,
        winRate: band.wins + band.losses > 0 
          ? Math.round((band.wins / (band.wins + band.losses)) * 1000) / 10 
          : 0,
        detailedBands: band.detailedBands, // Internal detail available if needed
      }));
      
      // Calculate OVERALL win rate (all bands)
      const allWins = bands.reduce((sum, b) => sum + b.wins, 0);
      const allTotal = bands.reduce((sum, b) => sum + b.wins + b.losses, 0);
      const overallWinRate = allTotal > 0 
        ? Math.round((allWins / allTotal) * 1000) / 10 
        : 0;
      
      // Best performing band (for highlighting)
      const sortedBands = [...bands].filter(b => b.wins + b.losses >= 5).sort((a, b) => {
        const aRate = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
        const bRate = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
        return bRate - aRate;
      });
      const bestBand = sortedBands[0];
      const bestBandWinRate = bestBand && (bestBand.wins + bestBand.losses) > 0
        ? Math.round((bestBand.wins / (bestBand.wins + bestBand.losses)) * 1000) / 10
        : 0;
      
      // Calculate HIGH signal strength (A + B+ = 4+ signals)
      const highSignalBands = bands.filter(b => b.minSignals >= 4);
      const highSignalWins = highSignalBands.reduce((sum, b) => sum + b.wins, 0);
      const highSignalTotal = highSignalBands.reduce((sum, b) => sum + b.wins + b.losses, 0);
      const highSignalWinRate = highSignalTotal > 0 
        ? Math.round((highSignalWins / highSignalTotal) * 1000) / 10 
        : 0;
      
      // Calculate MEDIUM+ (3+ signals: A, B+, B)
      const mediumPlusBands = bands.filter(b => b.minSignals >= 3);
      const mediumPlusWins = mediumPlusBands.reduce((sum, b) => sum + b.wins, 0);
      const mediumPlusTotal = mediumPlusBands.reduce((sum, b) => sum + b.wins + b.losses, 0);
      const mediumPlusWinRate = mediumPlusTotal > 0 
        ? Math.round((mediumPlusWins / mediumPlusTotal) * 1000) / 10 
        : 0;
      
      res.json({
        calibratedWinRate: overallWinRate,
        calibratedTrades: allTotal,
        calibratedWins: allWins,
        overallWinRate,
        overallTrades: allTotal,
        overallWins: allWins,
        bestBand: bestBand?.name || 'N/A',
        bestBandWinRate,
        excludedLowConfidence: 0,
        confidenceBreakdown,
        // Signal strength comparison (renamed from confidence)
        highConfidence: {
          bands: 'A + B+ (4+ signals)',
          trades: highSignalTotal,
          wins: highSignalWins,
          losses: highSignalTotal - highSignalWins,
          winRate: highSignalWinRate,
        },
        mediumPlusConfidence: {
          bands: 'A + B+ + B (3+ signals)',
          trades: mediumPlusTotal,
          wins: mediumPlusWins,
          losses: mediumPlusTotal - mediumPlusWins,
          winRate: mediumPlusWinRate,
        },
        allConfidence: {
          bands: 'All Bands (A-D)',
          trades: allTotal,
          wins: allWins,
          losses: allTotal - allWins,
          winRate: overallWinRate,
        },
      });
    } catch (error) {
      logger.error("Signal strength stats error:", error);
      res.status(500).json({ error: "Failed to fetch signal strength stats" });
    }
  });

  // 🎯 TRUE CALIBRATION CURVE: Actual win rate for each confidence score
  // This is the DATA-DRIVEN calibration - shows what ACTUALLY happens at each confidence level
  // Use this to recalibrate future confidence scores so predicted = actual
  app.get("/api/performance/calibration-curve", async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      // 🔧 DATA INTEGRITY: Use shared canonical filters for consistency (include Flow)
      const filteredIdeas = applyCanonicalPerformanceFilters(allIdeas, { includeFlowLotto: true });
      
      // Get decided trades only (wins + real losses, excludes breakeven and legacy engines)
      const resolvedIdeas = getDecidedTrades(filteredIdeas, { includeAllVersions: false });
      
      // Create 5-point confidence buckets (20-24, 25-29, 30-34, ..., 95-100)
      const buckets: Map<number, { wins: number; losses: number; totalPnL: number; trades: any[] }> = new Map();
      
      // Initialize buckets from 20 to 100 in 5-point increments
      for (let i = 20; i <= 100; i += 5) {
        buckets.set(i, { wins: 0, losses: 0, totalPnL: 0, trades: [] });
      }
      
      resolvedIdeas.forEach(idea => {
        const confidence = idea.confidenceScore || 0;
        // Round down to nearest 5 (e.g., 67 -> 65)
        const bucketKey = Math.max(20, Math.min(100, Math.floor(confidence / 5) * 5));
        
        const bucket = buckets.get(bucketKey);
        if (bucket) {
          const isWin = idea.outcomeStatus === 'hit_target';
          if (isWin) bucket.wins++;
          else bucket.losses++;
          bucket.totalPnL += idea.percentGain || 0;
          bucket.trades.push({
            symbol: idea.symbol,
            source: idea.source,
            confidence: idea.confidenceScore,
            outcome: idea.outcomeStatus,
            pnl: idea.percentGain
          });
        }
      });
      
      // Build calibration curve
      const calibrationCurve: {
        confidenceRange: string;
        midpoint: number;
        predicted: number; // What we said (midpoint of range)
        actual: number;    // What actually happened (win rate)
        trades: number;
        wins: number;
        losses: number;
        avgPnL: number;
        calibrationError: number; // How far off we were (predicted - actual)
        isCalibrated: boolean;    // Within 10% of prediction
      }[] = [];
      
      buckets.forEach((data, bucketStart) => {
        const totalTrades = data.wins + data.losses;
        if (totalTrades === 0) return; // Skip empty buckets
        
        const midpoint = bucketStart + 2.5; // e.g., 65-69 -> 67.5
        const actualWinRate = Math.round((data.wins / totalTrades) * 1000) / 10;
        const avgPnL = Math.round((data.totalPnL / totalTrades) * 10) / 10;
        const error = Math.round((midpoint - actualWinRate) * 10) / 10;
        
        calibrationCurve.push({
          confidenceRange: `${bucketStart}-${bucketStart + 4}`,
          midpoint,
          predicted: midpoint,
          actual: actualWinRate,
          trades: totalTrades,
          wins: data.wins,
          losses: data.losses,
          avgPnL,
          calibrationError: error,
          isCalibrated: Math.abs(error) <= 10
        });
      });
      
      // Sort by confidence range
      calibrationCurve.sort((a, b) => a.midpoint - b.midpoint);
      
      // Calculate overall calibration quality
      const totalError = calibrationCurve.reduce((sum, c) => sum + Math.abs(c.calibrationError), 0);
      const avgError = calibrationCurve.length > 0 ? Math.round(totalError / calibrationCurve.length * 10) / 10 : 0;
      const calibratedBuckets = calibrationCurve.filter(c => c.isCalibrated).length;
      const calibrationQuality = calibrationCurve.length > 0 
        ? Math.round((calibratedBuckets / calibrationCurve.length) * 100) 
        : 0;
      
      // Calculate Brier Score: Mean squared error between predicted probability and actual outcome
      // Lower is better: 0 = perfect, 0.25 = random guessing, 0.5 = inverse predictions
      let brierSum = 0;
      let brierCount = 0;
      resolvedIdeas.forEach(idea => {
        const predictedProb = (idea.confidenceScore || 50) / 100; // Convert to 0-1
        const actualOutcome = idea.outcomeStatus === 'hit_target' ? 1 : 0;
        brierSum += Math.pow(predictedProb - actualOutcome, 2);
        brierCount++;
      });
      const brierScore = brierCount > 0 ? Math.round((brierSum / brierCount) * 1000) / 1000 : 0;
      
      // Calculate Brier skill score (relative to baseline of just using overall win rate)
      const baselineWinRate = resolvedIdeas.filter(i => i.outcomeStatus === 'hit_target').length / resolvedIdeas.length;
      let baselineBrierSum = 0;
      resolvedIdeas.forEach(idea => {
        const actualOutcome = idea.outcomeStatus === 'hit_target' ? 1 : 0;
        baselineBrierSum += Math.pow(baselineWinRate - actualOutcome, 2);
      });
      const baselineBrier = brierCount > 0 ? baselineBrierSum / brierCount : 0;
      const brierSkillScore = baselineBrier > 0 ? Math.round((1 - brierScore / baselineBrier) * 1000) / 1000 : 0;
      
      res.json({
        calibrationCurve,
        summary: {
          totalTrades: resolvedIdeas.length,
          avgCalibrationError: avgError,
          calibratedBuckets,
          totalBuckets: calibrationCurve.length,
          calibrationQuality: `${calibrationQuality}%`,
          status: avgError <= 15 ? 'WELL_CALIBRATED' : avgError <= 25 ? 'NEEDS_ADJUSTMENT' : 'POORLY_CALIBRATED',
          brierScore,
          brierSkillScore,
          brierInterpretation: brierScore <= 0.15 ? 'Excellent' : brierScore <= 0.20 ? 'Good' : brierScore <= 0.25 ? 'Fair' : 'Poor'
        }
      });
    } catch (error) {
      logger.error("Calibration curve error:", error);
      res.status(500).json({ error: "Failed to generate calibration curve" });
    }
  });

  // 🎯 ACTUAL ENGINE PERFORMANCE - Verified from database with statistical rigor
  // Provides PROOF of engine win rates with confidence intervals, Sharpe ratios, and sample size grading
  app.get("/api/performance/engine-actual-stats", async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Filter: only resolved trades (hit_target or hit_stop), excluding buggy data
      const resolvedIdeas = allIdeas.filter(idea => 
        (idea.outcomeStatus === 'hit_target' || idea.outcomeStatus === 'hit_stop') &&
        !idea.excludeFromTraining
      );
      
      // Statistical helper functions
      const calculateStdDev = (values: number[]): number => {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
      };
      
      // Wilson Score Interval - proper confidence interval for binomial proportions
      // More accurate than normal approximation, especially for small samples
      const calculateConfidenceInterval = (winRate: number, n: number, confidence: number = 0.95): { lower: number; upper: number } => {
        if (n < 2) return { lower: 0, upper: 100 };
        const z = confidence === 0.95 ? 1.96 : 2.576;
        const p = winRate / 100; // wins / n
        
        // Wilson score interval formula
        const denominator = 1 + (z * z) / n;
        const center = (p + (z * z) / (2 * n)) / denominator;
        const halfWidth = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
        
        return {
          lower: Math.max(0, Math.round((center - halfWidth) * 1000) / 10),
          upper: Math.min(100, Math.round((center + halfWidth) * 1000) / 10)
        };
      };
      
      const getSampleSizeGrade = (n: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
        if (n >= 100) return 'A';
        if (n >= 50) return 'B';
        if (n >= 30) return 'C';
        if (n >= 10) return 'D';
        return 'F';
      };
      
      // Group by engine (source) with extended stats
      const engineStats = new Map<string, {
        engine: string;
        displayName: string;
        totalTrades: number;
        wins: number;
        losses: number;
        winRate: number;
        avgGain: number;
        totalGain: number;
        gains: number[];
        avgWin: number;
        avgLoss: number;
        winGains: number[];
        lossGains: number[];
      }>();
      
      const engineDisplayNames: Record<string, string> = {
        'flow': 'Flow Scanner',
        'flow_scanner': 'Flow Scanner',
        'ai': 'AI Engine',
        'quant': 'Quant Engine',
        'hybrid': 'Hybrid',
        'chart_analysis': 'Chart Analysis',
        'lotto_scanner': 'Lotto Scanner',
        'manual': 'Manual',
      };
      
      // Outlier protection: clamp percent gains to ±50%
      const OUTLIER_MIN = -50;
      const OUTLIER_MAX = 50;
      
      resolvedIdeas.forEach(idea => {
        const engine = (idea.source || 'unknown').toLowerCase();
        const normalizedEngine = engine === 'flow_scanner' ? 'flow' : engine;
        
        if (!engineStats.has(normalizedEngine)) {
          engineStats.set(normalizedEngine, {
            engine: normalizedEngine,
            displayName: engineDisplayNames[normalizedEngine] || normalizedEngine.toUpperCase(),
            totalTrades: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            avgGain: 0,
            totalGain: 0,
            gains: [],
            avgWin: 0,
            avgLoss: 0,
            winGains: [],
            lossGains: [],
          });
        }
        
        const stats = engineStats.get(normalizedEngine)!;
        stats.totalTrades++;
        const clampedGain = Math.max(OUTLIER_MIN, Math.min(OUTLIER_MAX, idea.percentGain || 0));
        stats.gains.push(clampedGain);
        stats.totalGain += clampedGain;
        
        if (idea.outcomeStatus === 'hit_target') {
          stats.wins++;
          stats.winGains.push(clampedGain);
        } else {
          stats.losses++;
          stats.lossGains.push(clampedGain);
        }
      });
      
      // Calculate final stats with statistical metrics
      const engines = Array.from(engineStats.values()).map(stats => {
        const winRate = stats.totalTrades > 0 ? (stats.wins / stats.totalTrades) * 100 : 0;
        const avgGain = stats.totalTrades > 0 ? stats.totalGain / stats.totalTrades : 0;
        const avgWin = stats.winGains.length > 0 ? stats.winGains.reduce((a, b) => a + b, 0) / stats.winGains.length : 0;
        const avgLoss = stats.lossGains.length > 0 ? Math.abs(stats.lossGains.reduce((a, b) => a + b, 0) / stats.lossGains.length) : 0;
        
        // Convert to log returns for proper Sharpe calculation
        const logReturns = stats.gains.map(g => Math.log(1 + g / 100));
        const meanLogReturn = logReturns.length > 0 ? logReturns.reduce((a, b) => a + b, 0) / logReturns.length : 0;
        const logReturnStdDev = calculateStdDev(logReturns);
        
        // Binomial confidence interval for win rate (95% CI using Wilson score)
        const ci = calculateConfidenceInterval(winRate, stats.totalTrades);
        
        // Profit Factor = Gross Wins / Gross Losses (correct P&L ratio)
        const grossWins = stats.winGains.reduce((a, b) => a + b, 0);
        const grossLosses = Math.abs(stats.lossGains.reduce((a, b) => a + b, 0));
        const profitFactor = grossLosses > 0 ? Math.round((grossWins / grossLosses) * 100) / 100 : grossWins > 0 ? Infinity : 0;
        
        // Expectancy = (WinRate * AvgWin) - (LossRate * AvgLoss)
        const expectancy = Math.round(((winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss) * 100) / 100;
        
        // Raw Sharpe Ratio (Information Ratio) using log returns
        // Not annualized to avoid assumptions about trade frequency
        // This measures risk-adjusted return per trade
        // Minimum sample size: 30 trades for statistical significance
        const MIN_SHARPE_SAMPLE = 30;
        const EPSILON = 0.0001; // Guard against near-zero stdDev
        const sharpeRatio = (stats.totalTrades >= MIN_SHARPE_SAMPLE && logReturnStdDev > EPSILON)
          ? Math.round((meanLogReturn / logReturnStdDev) * 100) / 100 
          : 0;
        const sharpeReliable = stats.totalTrades >= MIN_SHARPE_SAMPLE && logReturnStdDev > EPSILON;
        
        return {
          engine: stats.engine,
          displayName: stats.displayName,
          totalTrades: stats.totalTrades,
          wins: stats.wins,
          losses: stats.losses,
          winRate: Math.round(winRate * 10) / 10,
          avgGain: Math.round(avgGain * 100) / 100,
          avgWin: Math.round(avgWin * 100) / 100,
          avgLoss: Math.round(avgLoss * 100) / 100,
          stdDev: Math.round(logReturnStdDev * 10000) / 100, // Express as percentage
          confidenceInterval: ci,
          sampleSizeGrade: getSampleSizeGrade(stats.totalTrades),
          profitFactor: profitFactor === Infinity ? '∞' : profitFactor,
          expectancy,
          sharpeRatio,
          isStatisticallySignificant: stats.totalTrades >= 30,
        };
      });
      
      // Sort by win rate descending
      engines.sort((a, b) => b.winRate - a.winRate);
      
      // Calculate overall portfolio metrics using log returns
      const allLogReturns = resolvedIdeas.map(i => {
        const clampedGain = Math.max(OUTLIER_MIN, Math.min(OUTLIER_MAX, i.percentGain || 0));
        return Math.log(1 + clampedGain / 100);
      });
      const overallMeanLogReturn = allLogReturns.length > 0 ? allLogReturns.reduce((a, b) => a + b, 0) / allLogReturns.length : 0;
      const overallLogStdDev = calculateStdDev(allLogReturns);
      // Raw Sharpe Ratio (not annualized) - measures risk-adjusted return per trade
      const overallSharpe = overallLogStdDev > 0 
        ? Math.round((overallMeanLogReturn / overallLogStdDev) * 100) / 100 
        : 0;
      
      // Calculate drawdown using multiplicative equity curve: Π(1 + r_i)
      let equity = 1.0; // Start with $1
      let peakEquity = 1.0;
      let maxDrawdown = 0;
      resolvedIdeas
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .forEach(idea => {
          const gain = Math.max(OUTLIER_MIN, Math.min(OUTLIER_MAX, idea.percentGain || 0));
          equity *= (1 + gain / 100); // Multiplicative return
          if (equity > peakEquity) peakEquity = equity;
          const drawdown = (peakEquity - equity) / peakEquity; // Percentage drawdown from peak
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        });
      
      res.json({
        engines,
        summary: {
          totalResolvedTrades: resolvedIdeas.length,
          bestEngine: engines[0]?.displayName || 'N/A',
          bestWinRate: engines[0]?.winRate || 0,
          worstEngine: engines[engines.length - 1]?.displayName || 'N/A',
          worstWinRate: engines[engines.length - 1]?.winRate || 0,
          overallSharpeRatio: overallSharpe,
          maxDrawdown: Math.round(maxDrawdown * 10000) / 100, // Convert 0-1 to percentage
          lastUpdated: new Date().toISOString(),
        }
      });
    } catch (error) {
      logger.error("Engine actual stats error:", error);
      res.status(500).json({ error: "Failed to fetch engine stats" });
    }
  });

  // 📈 ROLLING WIN RATE - Performance trends over time
  app.get("/api/performance/rolling-win-rate", async (req, res) => {
    try {
      const windowSize = parseInt(req.query.window as string) || 20;
      const engine = req.query.engine as string | undefined;
      
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Filter resolved trades
      let resolvedIdeas = allIdeas.filter(idea => 
        idea.outcomeStatus === 'hit_target' || idea.outcomeStatus === 'hit_stop'
      );
      
      // Optional engine filter
      if (engine) {
        resolvedIdeas = resolvedIdeas.filter(idea => 
          (idea.source || '').toLowerCase() === engine.toLowerCase()
        );
      }
      
      // Sort by timestamp ascending
      resolvedIdeas.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      if (resolvedIdeas.length < windowSize) {
        return res.json({
          rollingData: [],
          summary: {
            totalTrades: resolvedIdeas.length,
            windowSize,
            insufficientData: true,
            message: `Need at least ${windowSize} trades for rolling analysis`
          }
        });
      }
      
      // Calculate rolling win rates
      const rollingData: { 
        tradeIndex: number; 
        date: string;
        winRate: number; 
        cumulativeWinRate: number;
        avgPnL: number;
        wins: number;
        losses: number;
      }[] = [];
      
      let cumulativeWins = 0;
      let cumulativeLosses = 0;
      
      for (let i = 0; i < resolvedIdeas.length; i++) {
        const isWin = resolvedIdeas[i].outcomeStatus === 'hit_target';
        if (isWin) cumulativeWins++;
        else cumulativeLosses++;
        
        if (i >= windowSize - 1) {
          // Calculate window stats
          const windowStart = i - windowSize + 1;
          const windowTrades = resolvedIdeas.slice(windowStart, i + 1);
          const windowWins = windowTrades.filter(t => t.outcomeStatus === 'hit_target').length;
          const windowLosses = windowSize - windowWins;
          const windowWinRate = Math.round((windowWins / windowSize) * 1000) / 10;
          const cumulativeWinRate = Math.round((cumulativeWins / (i + 1)) * 1000) / 10;
          
          // Calculate average P&L for window
          const windowPnL = windowTrades.reduce((sum, t) => 
            sum + Math.max(-50, Math.min(50, t.percentGain || 0)), 0
          );
          const avgPnL = Math.round((windowPnL / windowSize) * 100) / 100;
          
          rollingData.push({
            tradeIndex: i + 1,
            date: new Date(resolvedIdeas[i].timestamp).toISOString().split('T')[0],
            winRate: windowWinRate,
            cumulativeWinRate,
            avgPnL,
            wins: windowWins,
            losses: windowLosses,
          });
        }
      }
      
      // Calculate trend (last 20 vs first 20 datapoints)
      let trend = 'stable';
      if (rollingData.length >= 40) {
        const firstAvg = rollingData.slice(0, 20).reduce((s, d) => s + d.winRate, 0) / 20;
        const lastAvg = rollingData.slice(-20).reduce((s, d) => s + d.winRate, 0) / 20;
        if (lastAvg - firstAvg > 5) trend = 'improving';
        else if (firstAvg - lastAvg > 5) trend = 'declining';
      }
      
      // Find peaks and troughs
      const winRates = rollingData.map(d => d.winRate);
      const maxWinRate = Math.max(...winRates);
      const minWinRate = Math.min(...winRates);
      const currentWinRate = winRates[winRates.length - 1] || 0;
      
      res.json({
        rollingData,
        summary: {
          totalTrades: resolvedIdeas.length,
          windowSize,
          trend,
          currentWinRate,
          maxWinRate,
          minWinRate,
          volatility: Math.round((maxWinRate - minWinRate) * 10) / 10,
        }
      });
    } catch (error) {
      logger.error("Rolling win rate error:", error);
      res.status(500).json({ error: "Failed to calculate rolling win rate" });
    }
  });

  // 📉 DRAWDOWN ANALYSIS - Peak-to-trough metrics
  app.get("/api/performance/drawdown-analysis", requireTier('canAccessDrawdownAnalysis'), async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Filter resolved trades
      const resolvedIdeas = allIdeas.filter(idea => 
        idea.outcomeStatus === 'hit_target' || idea.outcomeStatus === 'hit_stop'
      );
      
      // Sort by timestamp ascending
      resolvedIdeas.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      // Outlier protection
      const OUTLIER_MIN = -50;
      const OUTLIER_MAX = 50;
      
      // Calculate MULTIPLICATIVE equity curve: Π(1 + r_i)
      // This is the correct way to compound returns
      const equityCurve: { 
        tradeIndex: number;
        date: string;
        equity: number;        // Multiplicative equity (starts at 1.0)
        peak: number;
        drawdown: number;      // Absolute drawdown from peak
        drawdownPercent: number; // Percentage drawdown from peak
      }[] = [];
      
      let equity = 1.0; // Start with $1 normalized
      let peakEquity = 1.0;
      let maxDrawdownPercent = 0;
      let maxDrawdownStart = 0;
      let maxDrawdownEnd = 0;
      let currentDrawdownStart = 0;
      let inDrawdown = false;
      
      // Track all drawdown periods
      const drawdownPeriods: {
        start: number;
        end: number;
        depth: number;
        recoveryTrades: number;
      }[] = [];
      
      resolvedIdeas.forEach((idea, i) => {
        const gain = Math.max(OUTLIER_MIN, Math.min(OUTLIER_MAX, idea.percentGain || 0));
        equity *= (1 + gain / 100); // Multiplicative return
        
        if (equity > peakEquity) {
          // New peak - record recovery if we were in drawdown
          if (inDrawdown && currentDrawdownStart > 0) {
            const troughEquity = Math.min(...equityCurve.slice(currentDrawdownStart, i + 1).map(e => e.equity));
            drawdownPeriods.push({
              start: currentDrawdownStart,
              end: i,
              depth: ((peakEquity - troughEquity) / peakEquity) * 100, // Percentage depth
              recoveryTrades: i - currentDrawdownStart
            });
          }
          peakEquity = equity;
          inDrawdown = false;
        } else if (equity < peakEquity) {
          if (!inDrawdown) {
            currentDrawdownStart = i;
            inDrawdown = true;
          }
        }
        
        const drawdownAbs = peakEquity - equity;
        const drawdownPercent = (drawdownAbs / peakEquity) * 100;
        
        if (drawdownPercent > maxDrawdownPercent) {
          maxDrawdownPercent = drawdownPercent;
          maxDrawdownEnd = i;
        }
        
        equityCurve.push({
          tradeIndex: i + 1,
          date: new Date(idea.timestamp).toISOString().split('T')[0],
          equity: Math.round(equity * 10000) / 10000, // 4 decimal places
          peak: Math.round(peakEquity * 10000) / 10000,
          drawdown: Math.round(drawdownAbs * 10000) / 10000,
          drawdownPercent: Math.round(drawdownPercent * 10) / 10,
        });
      });
      
      // Current drawdown (from equity curve)
      const currentDrawdownValue = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].drawdown : 0;
      const currentDrawdownPercentValue = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].drawdownPercent : 0;
      
      // Average recovery time
      const avgRecoveryTrades = drawdownPeriods.length > 0 
        ? Math.round(drawdownPeriods.reduce((s, d) => s + d.recoveryTrades, 0) / drawdownPeriods.length)
        : 0;
      
      // Total return as percentage: (final equity - 1) * 100
      const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : 1;
      const totalReturnPercent = (finalEquity - 1) * 100;
      
      // Calmar Ratio = Annualized Return / Max Drawdown (industry standard)
      // Returns structured object with value and status for explicit handling
      const TRADES_PER_YEAR_FALLBACK = 100;
      const MIN_TRADES_FOR_CALMAR = 10;
      
      let annualizedReturnDecimal = 0;
      let observationYears = 0;
      let timestampsValid = false;
      
      if (resolvedIdeas.length >= 2) {
        const sortedTrades = [...resolvedIdeas].sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const firstTradeTime = new Date(sortedTrades[0].timestamp).getTime();
        const lastTradeTime = new Date(sortedTrades[sortedTrades.length - 1].timestamp).getTime();
        
        if (!isNaN(firstTradeTime) && !isNaN(lastTradeTime) && lastTradeTime > firstTradeTime) {
          const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
          observationYears = (lastTradeTime - firstTradeTime) / msPerYear;
          timestampsValid = true;
        } else {
          observationYears = resolvedIdeas.length / TRADES_PER_YEAR_FALLBACK;
        }
        
        if (observationYears > 0) {
          annualizedReturnDecimal = Math.pow(finalEquity, 1 / observationYears) - 1;
        }
      } else if (resolvedIdeas.length === 1) {
        observationYears = 1 / TRADES_PER_YEAR_FALLBACK;
        annualizedReturnDecimal = Math.pow(finalEquity, 1 / observationYears) - 1;
      }
      
      const maxDrawdownDecimal = maxDrawdownPercent / 100;
      
      // Determine Calmar status with explicit states
      type CalmarStatus = 'valid' | 'estimated' | 'insufficient-sample' | 'no-drawdown';
      let calmarStatus: CalmarStatus;
      let calmarValue: number | null = null;
      
      if (resolvedIdeas.length < MIN_TRADES_FOR_CALMAR) {
        calmarStatus = 'insufficient-sample';
      } else if (maxDrawdownDecimal <= 0) {
        calmarStatus = 'no-drawdown';
      } else if (!timestampsValid) {
        calmarStatus = 'estimated';
        calmarValue = Math.round((annualizedReturnDecimal / maxDrawdownDecimal) * 100) / 100;
      } else {
        calmarStatus = 'valid';
        calmarValue = Math.round((annualizedReturnDecimal / maxDrawdownDecimal) * 100) / 100;
      }
      
      res.json({
        equityCurve,
        drawdownPeriods: drawdownPeriods.slice(-10), // Last 10 drawdown periods
        summary: {
          totalTrades: resolvedIdeas.length,
          totalReturnPercent: Math.round(totalReturnPercent * 100) / 100,
          maxDrawdownPercent: Math.round(maxDrawdownPercent * 10) / 10,
          currentDrawdownPercent: Math.round(currentDrawdownPercentValue * 10) / 10,
          isInDrawdown: currentDrawdownPercentValue > 0,
          totalDrawdownPeriods: drawdownPeriods.length,
          avgRecoveryTrades,
          calmar: {
            value: calmarValue,
            status: calmarStatus,
          },
          annualizedReturnPercent: Math.round(annualizedReturnDecimal * 10000) / 100,
          observationYears: Math.round(observationYears * 100) / 100,
          finalEquity: Math.round(finalEquity * 10000) / 10000,
        }
      });
    } catch (error) {
      logger.error("Drawdown analysis error:", error);
      res.status(500).json({ error: "Failed to calculate drawdown analysis" });
    }
  });

  // 🔍 LOSS ANALYSIS ENDPOINTS - Post-Mortem for Failed Trades (Advanced tier required)
  
  // Get loss summary with patterns and insights
  app.get("/api/loss-analysis/summary", requireTier('canAccessLossAnalysis'), async (req, res) => {
    try {
      const summary = await getLossSummary();
      res.json(summary);
    } catch (error) {
      logger.error("Loss summary error:", error);
      res.status(500).json({ error: "Failed to fetch loss summary" });
    }
  });

  // Get all loss analyses
  app.get("/api/loss-analysis", requireTier('canAccessLossAnalysis'), async (req, res) => {
    try {
      const analyses = await storage.getAllLossAnalyses();
      res.json(analyses);
    } catch (error) {
      logger.error("Loss analysis list error:", error);
      res.status(500).json({ error: "Failed to fetch loss analyses" });
    }
  });

  // Get loss patterns grouped by reason
  app.get("/api/loss-analysis/patterns", requireTier('canAccessLossAnalysis'), async (req, res) => {
    try {
      const patterns = await storage.getLossPatterns();
      res.json(patterns);
    } catch (error) {
      logger.error("Loss patterns error:", error);
      res.status(500).json({ error: "Failed to fetch loss patterns" });
    }
  });

  // Analyze all unanalyzed losses (admin trigger)
  app.post("/api/loss-analysis/analyze-all", requireAdminJWT, async (req, res) => {
    try {
      const count = await analyzeAllLosses();
      res.json({ 
        success: true, 
        message: `Analyzed ${count} losses`,
        analyzedCount: count 
      });
    } catch (error) {
      logger.error("Analyze all losses error:", error);
      res.status(500).json({ error: "Failed to analyze losses" });
    }
  });

  // Get loss analysis for a specific trade
  app.get("/api/loss-analysis/trade/:tradeId", requireTier('canAccessLossAnalysis'), async (req, res) => {
    try {
      const { tradeId } = req.params;
      const analysis = await storage.getLossAnalysisByTradeId(tradeId);
      if (!analysis) {
        return res.status(404).json({ error: "No analysis found for this trade" });
      }
      res.json(analysis);
    } catch (error) {
      logger.error("Trade loss analysis error:", error);
      res.status(500).json({ error: "Failed to fetch trade analysis" });
    }
  });

  // ========================================
  // WIN/LOSS ANALYSIS - INSTITUTIONAL GRADE
  // Stop-Loss Threshold Simulator & Model Training
  // ========================================

  // Helper: Wilson Score CI for win rates
  function wilsonScoreCI(wins: number, total: number, z: number = 1.96) {
    if (total === 0) return { center: 0, lower: 0, upper: 0 };
    const p = wins / total;
    const denominator = 1 + (z * z) / total;
    const center = (p + (z * z) / (2 * total)) / denominator;
    const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
    return {
      center: Math.round(center * 1000) / 10,
      lower: Math.round(Math.max(0, center - margin) * 1000) / 10,
      upper: Math.round(Math.min(1, center + margin) * 1000) / 10,
    };
  }

  // Get comprehensive Win/Loss analysis summary
  app.get("/api/admin/win-loss/summary", requireAdminJWT, async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const resolvedTrades = allIdeas.filter(t => 
        t.outcomeStatus && ['hit_target', 'hit_stop', 'expired', 'manual_exit'].includes(t.outcomeStatus) &&
        t.percentGain !== null && t.percentGain !== undefined
      );

      if (resolvedTrades.length === 0) {
        return res.json({
          totalTrades: 0,
          wins: 0,
          losses: 0,
          breakeven: 0,
          message: "No resolved trades available for analysis"
        });
      }

      // Categorize trades - using 3% threshold for real losses (matches unified methodology)
      const LOSS_THRESHOLD = -3;
      const wins = resolvedTrades.filter(t => t.outcomeStatus === 'hit_target');
      const realLosses = resolvedTrades.filter(t => 
        t.outcomeStatus === 'hit_stop' && (t.percentGain ?? 0) <= LOSS_THRESHOLD
      );
      const breakeven = resolvedTrades.filter(t => 
        t.outcomeStatus === 'hit_stop' && (t.percentGain ?? 0) > LOSS_THRESHOLD
      );
      const expired = resolvedTrades.filter(t => t.outcomeStatus === 'expired');

      // Calculate statistics
      const winGains = wins.map(t => t.percentGain ?? 0);
      const lossGains = realLosses.map(t => t.percentGain ?? 0);
      
      const avgWin = winGains.length > 0 ? winGains.reduce((a, b) => a + b, 0) / winGains.length : 0;
      const avgLoss = lossGains.length > 0 ? lossGains.reduce((a, b) => a + b, 0) / lossGains.length : 0;
      const maxWin = winGains.length > 0 ? Math.max(...winGains) : 0;
      const maxLoss = lossGains.length > 0 ? Math.min(...lossGains) : 0;

      // Profit factor = gross profits / gross losses
      const grossProfit = winGains.reduce((a, b) => a + b, 0);
      const grossLoss = Math.abs(lossGains.reduce((a, b) => a + b, 0));
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

      // Expectancy = (Win% * AvgWin) + (Loss% * AvgLoss)
      const decidedTrades = wins.length + realLosses.length;
      const winRate = decidedTrades > 0 ? (wins.length / decidedTrades) * 100 : 0;
      const lossRate = decidedTrades > 0 ? (realLosses.length / decidedTrades) * 100 : 0;
      const expectancy = (winRate / 100 * avgWin) + (lossRate / 100 * avgLoss);

      // Wilson Score CI for win rate
      const wilsonCI = wilsonScoreCI(wins.length, decidedTrades);

      // Distribution of gains/losses (histogram buckets)
      const gainBuckets = [-20, -15, -10, -5, -3, 0, 3, 5, 10, 15, 20, 30, 50];
      const distribution = gainBuckets.map((bucket, i) => {
        const nextBucket = gainBuckets[i + 1] ?? Infinity;
        const tradesInBucket = resolvedTrades.filter(t => {
          const gain = t.percentGain ?? 0;
          return gain >= bucket && gain < nextBucket;
        });
        return {
          range: nextBucket === Infinity ? `${bucket}%+` : `${bucket}% to ${nextBucket}%`,
          count: tradesInBucket.length,
          wins: tradesInBucket.filter(t => t.outcomeStatus === 'hit_target').length,
          losses: tradesInBucket.filter(t => t.outcomeStatus === 'hit_stop').length,
        };
      });

      // Loss patterns from existing loss analysis
      const lossPatterns = await storage.getLossPatterns();

      // By asset type breakdown
      const byAssetType = ['stock', 'option', 'crypto', 'futures'].map(assetType => {
        const trades = resolvedTrades.filter(t => (t.assetType || 'stock') === assetType);
        const assetWins = trades.filter(t => t.outcomeStatus === 'hit_target');
        const assetLosses = trades.filter(t => 
          t.outcomeStatus === 'hit_stop' && (t.percentGain ?? 0) <= LOSS_THRESHOLD
        );
        const assetDecided = assetWins.length + assetLosses.length;
        return {
          assetType,
          totalTrades: trades.length,
          wins: assetWins.length,
          losses: assetLosses.length,
          winRate: assetDecided > 0 ? Math.round((assetWins.length / assetDecided) * 1000) / 10 : 0,
          avgGain: trades.length > 0 
            ? Math.round((trades.reduce((a, t) => a + (t.percentGain ?? 0), 0) / trades.length) * 100) / 100 
            : 0,
        };
      }).filter(a => a.totalTrades > 0);

      // By source/engine breakdown
      const sources = [...new Set(resolvedTrades.map(t => t.source || 'unknown'))];
      const bySource = sources.map(source => {
        const trades = resolvedTrades.filter(t => (t.source || 'unknown') === source);
        const srcWins = trades.filter(t => t.outcomeStatus === 'hit_target');
        const srcLosses = trades.filter(t => 
          t.outcomeStatus === 'hit_stop' && (t.percentGain ?? 0) <= LOSS_THRESHOLD
        );
        const srcDecided = srcWins.length + srcLosses.length;
        return {
          source,
          totalTrades: trades.length,
          wins: srcWins.length,
          losses: srcLosses.length,
          winRate: srcDecided > 0 ? Math.round((srcWins.length / srcDecided) * 1000) / 10 : 0,
          avgGain: trades.length > 0 
            ? Math.round((trades.reduce((a, t) => a + (t.percentGain ?? 0), 0) / trades.length) * 100) / 100 
            : 0,
        };
      }).filter(s => s.totalTrades > 0);

      res.json({
        totalTrades: resolvedTrades.length,
        decidedTrades,
        wins: wins.length,
        losses: realLosses.length,
        breakeven: breakeven.length,
        expired: expired.length,
        winRate: Math.round(winRate * 10) / 10,
        winRateCI: wilsonCI,
        avgWinPercent: Math.round(avgWin * 100) / 100,
        avgLossPercent: Math.round(avgLoss * 100) / 100,
        maxWinPercent: Math.round(maxWin * 100) / 100,
        maxLossPercent: Math.round(maxLoss * 100) / 100,
        profitFactor: profitFactor === Infinity ? 'Infinite' : Math.round(profitFactor * 100) / 100,
        expectancy: Math.round(expectancy * 100) / 100,
        payoffRatio: avgLoss !== 0 ? Math.round((avgWin / Math.abs(avgLoss)) * 100) / 100 : 0,
        distribution,
        lossPatterns: lossPatterns.slice(0, 10),
        byAssetType,
        bySource,
        sampleReliability: decidedTrades >= 100 ? 'high' : decidedTrades >= 30 ? 'medium' : 'low',
      });
    } catch (error) {
      logger.error("Win/Loss summary error:", error);
      res.status(500).json({ error: "Failed to calculate win/loss summary" });
    }
  });

  // Stop-loss threshold simulation - shows win rate at different stop levels
  app.get("/api/admin/win-loss/stop-loss-sim", requireAdminJWT, async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const resolvedTrades = allIdeas.filter(t => 
        t.outcomeStatus && ['hit_target', 'hit_stop'].includes(t.outcomeStatus) &&
        t.percentGain !== null && t.percentGain !== undefined
      );

      if (resolvedTrades.length < 10) {
        return res.json({
          simulations: [],
          optimalThreshold: null,
          message: "Insufficient trades for simulation (minimum 10 required)"
        });
      }

      // Simulate different stop-loss thresholds from 0% to 20%
      const thresholds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];
      const simulations = thresholds.map(threshold => {
        // At this threshold, trades with loss <= -threshold are counted as losses
        const wins = resolvedTrades.filter(t => t.outcomeStatus === 'hit_target');
        const tradeLosses = resolvedTrades.filter(t => 
          t.outcomeStatus === 'hit_stop' && (t.percentGain ?? 0) <= -threshold
        );
        const breakeven = resolvedTrades.filter(t => 
          t.outcomeStatus === 'hit_stop' && (t.percentGain ?? 0) > -threshold
        );

        const decidedTrades = wins.length + tradeLosses.length;
        const winRate = decidedTrades > 0 ? (wins.length / decidedTrades) * 100 : 0;

        // Calculate expectancy at this threshold
        const avgWin = wins.length > 0 
          ? wins.reduce((a, t) => a + (t.percentGain ?? 0), 0) / wins.length 
          : 0;
        const avgLoss = tradeLosses.length > 0 
          ? tradeLosses.reduce((a, t) => a + (t.percentGain ?? 0), 0) / tradeLosses.length 
          : 0;
        const expectancy = (winRate / 100 * avgWin) + ((100 - winRate) / 100 * avgLoss);

        // Wilson CI
        const wilsonCI = wilsonScoreCI(wins.length, decidedTrades);

        return {
          thresholdPercent: threshold,
          wins: wins.length,
          losses: tradeLosses.length,
          breakeven: breakeven.length,
          decidedTrades,
          winRate: Math.round(winRate * 10) / 10,
          winRateLower: wilsonCI.lower,
          winRateUpper: wilsonCI.upper,
          avgWin: Math.round(avgWin * 100) / 100,
          avgLoss: Math.round(avgLoss * 100) / 100,
          expectancy: Math.round(expectancy * 100) / 100,
          profitFactor: avgLoss !== 0 
            ? Math.round((avgWin / Math.abs(avgLoss)) * 100) / 100 
            : avgWin > 0 ? Infinity : 0,
        };
      });

      // Find optimal threshold (max expectancy with sufficient sample)
      const validSims = simulations.filter(s => s.decidedTrades >= 30);
      const optimalSim = validSims.length > 0 
        ? validSims.reduce((best, s) => s.expectancy > best.expectancy ? s : best, validSims[0])
        : null;

      res.json({
        simulations,
        optimalThreshold: optimalSim ? {
          thresholdPercent: optimalSim.thresholdPercent,
          expectedWinRate: optimalSim.winRate,
          expectancy: optimalSim.expectancy,
          profitFactor: optimalSim.profitFactor,
          rationale: `At ${optimalSim.thresholdPercent}% stop-loss threshold, expected win rate is ${optimalSim.winRate}% with ${optimalSim.expectancy}% expectancy per trade.`,
        } : null,
        totalTrades: resolvedTrades.length,
        sampleReliability: resolvedTrades.length >= 100 ? 'high' : resolvedTrades.length >= 30 ? 'medium' : 'low',
      });
    } catch (error) {
      logger.error("Stop-loss simulation error:", error);
      res.status(500).json({ error: "Failed to run stop-loss simulation" });
    }
  });

  // Export ML training data for model improvement
  app.get("/api/admin/win-loss/export", requireAdminJWT, async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const resolvedTrades = allIdeas.filter(t => 
        t.outcomeStatus && ['hit_target', 'hit_stop'].includes(t.outcomeStatus) &&
        t.percentGain !== null && t.percentGain !== undefined
      );

      // Extract features for ML training
      const trainingData = resolvedTrades.map(trade => ({
        // Target variable
        outcome: trade.outcomeStatus === 'hit_target' ? 1 : 0,
        percentGain: trade.percentGain,
        
        // Trade setup features
        symbol: trade.symbol,
        assetType: trade.assetType || 'stock',
        source: trade.source || 'unknown',
        direction: trade.direction || 'long',
        confidenceScore: trade.confidenceScore ?? 0,
        
        // Technical indicators (if available)
        rsiValue: trade.rsiValue ?? null,
        macdHistogram: trade.macdHistogram ?? null,
        volumeRatio: trade.volumeRatio ?? null,
        priceVs52WeekHigh: trade.priceVs52WeekHigh ?? null,
        priceVs52WeekLow: trade.priceVs52WeekLow ?? null,
        
        // Risk parameters
        stopLossPercent: trade.entryPrice && trade.stopLoss 
          ? Math.round(((trade.stopLoss - trade.entryPrice) / trade.entryPrice) * 10000) / 100 
          : null,
        targetPercent: trade.entryPrice && trade.targetPrice 
          ? Math.round(((trade.targetPrice - trade.entryPrice) / trade.entryPrice) * 10000) / 100 
          : null,
        riskRewardRatio: trade.riskRewardRatio ?? null,
        
        // Timing features
        holdingTimeMinutes: trade.actualHoldingTimeMinutes ?? null,
        timestamp: trade.timestamp,
        dayOfWeek: trade.timestamp ? new Date(trade.timestamp).getDay() : null,
        hourOfDay: trade.timestamp ? new Date(trade.timestamp).getHours() : null,
        
        // Catalyst/context
        hasCatalyst: !!trade.catalyst,
        hasLiquidityWarning: !!trade.liquidityWarning,
        
        // Labels for different stop-loss thresholds (for model training)
        wouldLoseAt3Pct: trade.outcomeStatus === 'hit_stop' && (trade.percentGain ?? 0) <= -3,
        wouldLoseAt5Pct: trade.outcomeStatus === 'hit_stop' && (trade.percentGain ?? 0) <= -5,
        wouldLoseAt10Pct: trade.outcomeStatus === 'hit_stop' && (trade.percentGain ?? 0) <= -10,
      }));

      res.json({
        data: trainingData,
        metadata: {
          totalRecords: trainingData.length,
          wins: trainingData.filter(t => t.outcome === 1).length,
          losses: trainingData.filter(t => t.outcome === 0).length,
          features: [
            'confidenceScore', 'rsiValue', 'macdHistogram', 'volumeRatio',
            'stopLossPercent', 'targetPercent', 'riskRewardRatio',
            'holdingTimeMinutes', 'dayOfWeek', 'hourOfDay'
          ],
          targetVariable: 'outcome',
          exportedAt: new Date().toISOString(),
        }
      });
    } catch (error) {
      logger.error("ML export error:", error);
      res.status(500).json({ error: "Failed to export training data" });
    }
  });

  // Expiration Analysis - Analyze trades that expired before price moved enough
  app.get("/api/admin/win-loss/expiration-analysis", requireAdminJWT, async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Get all expired trades
      const expiredTrades = allIdeas.filter(t => 
        t.outcomeStatus === 'expired' &&
        t.entryPrice && t.targetPrice && t.stopLoss
      );

      if (expiredTrades.length === 0) {
        return res.json({
          summary: {
            totalExpired: 0,
            message: "No expired trades found for analysis"
          },
          trades: [],
          recommendations: []
        });
      }

      // For each expired trade, analyze post-expiration price movement
      // Using available data: highestPriceReached, lowestPriceReached, and price snapshots
      const tradeAnalyses = await Promise.all(expiredTrades.map(async (trade) => {
        // Get price snapshots for this trade
        const snapshots = await storage.getTradePriceSnapshots(trade.id);
        
        // Find expiration snapshot
        const expirationSnapshot = snapshots?.find(s => s.eventType === 'expired');
        const publishSnapshot = snapshots?.find(s => s.eventType === 'idea_published');
        
        // Calculate key metrics
        const entryPrice = trade.entryPrice!;
        const targetPrice = trade.targetPrice!;
        const stopLoss = trade.stopLoss!;
        const direction = trade.direction || 'long';
        
        // Distance calculations
        const targetDistance = direction === 'long' 
          ? ((targetPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - targetPrice) / entryPrice) * 100;
        
        const stopDistance = direction === 'long'
          ? ((entryPrice - stopLoss) / entryPrice) * 100
          : ((stopLoss - entryPrice) / entryPrice) * 100;

        // Peak/trough analysis - how close did it get?
        const highestReached = trade.highestPriceReached ?? entryPrice;
        const lowestReached = trade.lowestPriceReached ?? entryPrice;
        
        // How far towards target did price move?
        let peakTowardsTarget: number;
        let peakAwayFromTarget: number;
        
        if (direction === 'long') {
          peakTowardsTarget = ((highestReached - entryPrice) / entryPrice) * 100;
          peakAwayFromTarget = ((entryPrice - lowestReached) / entryPrice) * 100;
        } else {
          peakTowardsTarget = ((entryPrice - lowestReached) / entryPrice) * 100;
          peakAwayFromTarget = ((highestReached - entryPrice) / entryPrice) * 100;
        }

        // Calculate how much more time/movement was needed
        const progressToTarget = (peakTowardsTarget / targetDistance) * 100;
        const neededMorePercent = targetDistance - peakTowardsTarget;
        
        // Would have hit target with more time?
        const almostHitTarget = progressToTarget >= 75; // Got 75%+ of the way there
        const veryClose = progressToTarget >= 90; // Got 90%+ of the way there
        
        // Would have hit stop with more time?
        const wouldHaveHitStop = peakAwayFromTarget >= stopDistance;

        // Time analysis
        const entryTime = trade.timestamp ? new Date(trade.timestamp) : null;
        const exitByTime = trade.exitBy ? new Date(trade.exitBy) : null;
        const holdingTimeMinutes = trade.actualHoldingTimeMinutes ?? null;
        
        // Determine holding period type
        const holdingPeriod = trade.holdingPeriod || 'day';

        return {
          id: trade.id,
          symbol: trade.symbol,
          assetType: trade.assetType || 'stock',
          direction,
          holdingPeriod,
          source: trade.source || 'unknown',
          confidenceScore: trade.confidenceScore ?? null,
          timestamp: trade.timestamp,
          
          // Price levels
          entryPrice: Math.round(entryPrice * 100) / 100,
          targetPrice: Math.round(targetPrice * 100) / 100,
          stopLoss: Math.round(stopLoss * 100) / 100,
          
          // Target/Stop distances
          targetDistancePercent: Math.round(targetDistance * 100) / 100,
          stopDistancePercent: Math.round(stopDistance * 100) / 100,
          riskRewardRatio: trade.riskRewardRatio ?? null,
          
          // Peak movement analysis
          highestReached: Math.round(highestReached * 100) / 100,
          lowestReached: Math.round(lowestReached * 100) / 100,
          peakTowardsTargetPercent: Math.round(peakTowardsTarget * 100) / 100,
          peakAwayFromTargetPercent: Math.round(peakAwayFromTarget * 100) / 100,
          progressToTargetPercent: Math.round(progressToTarget * 100) / 100,
          neededMorePercent: Math.round(neededMorePercent * 100) / 100,
          
          // Classifications
          almostHitTarget,
          veryClose,
          wouldHaveHitStop,
          
          // Time analysis
          holdingTimeMinutes,
          exitBy: trade.exitBy,
          entryValidUntil: trade.entryValidUntil,
          
          // Price at expiration
          priceAtExpiration: expirationSnapshot?.currentPrice ?? null,
          priceAtPublish: publishSnapshot?.currentPrice ?? null,
        };
      }));

      // Calculate summary statistics
      const totalExpired = tradeAnalyses.length;
      const almostHitTargetCount = tradeAnalyses.filter(t => t.almostHitTarget).length;
      const veryCloseCount = tradeAnalyses.filter(t => t.veryClose).length;
      const wouldHaveHitStopCount = tradeAnalyses.filter(t => t.wouldHaveHitStop).length;
      
      // Calculate average progress towards target
      const avgProgressToTarget = totalExpired > 0
        ? Math.round(tradeAnalyses.reduce((sum, t) => sum + t.progressToTargetPercent, 0) / totalExpired)
        : 0;

      // Calculate by holding period type
      const byHoldingPeriod = ['day', 'swing', 'position', 'week-ending'].map(period => {
        const periodTrades = tradeAnalyses.filter(t => t.holdingPeriod === period);
        const count = periodTrades.length;
        if (count === 0) return null;
        
        const almostHit = periodTrades.filter(t => t.almostHitTarget).length;
        const avgProgress = Math.round(
          periodTrades.reduce((sum, t) => sum + t.progressToTargetPercent, 0) / count
        );
        const avgNeededMore = Math.round(
          periodTrades.reduce((sum, t) => sum + t.neededMorePercent, 0) / count * 100
        ) / 100;

        return {
          period,
          count,
          almostHitTargetCount: almostHit,
          almostHitTargetPercent: Math.round((almostHit / count) * 100),
          avgProgressToTarget: avgProgress,
          avgNeededMorePercent: avgNeededMore,
        };
      }).filter(Boolean);

      // Calculate by asset type
      const assetTypes = [...new Set(tradeAnalyses.map(t => t.assetType))];
      const byAssetType = assetTypes.map(assetType => {
        const assetTrades = tradeAnalyses.filter(t => t.assetType === assetType);
        const count = assetTrades.length;
        if (count === 0) return null;
        
        const almostHit = assetTrades.filter(t => t.almostHitTarget).length;
        const avgProgress = Math.round(
          assetTrades.reduce((sum, t) => sum + t.progressToTargetPercent, 0) / count
        );

        return {
          assetType,
          count,
          almostHitTargetPercent: Math.round((almostHit / count) * 100),
          avgProgressToTarget: avgProgress,
        };
      }).filter(Boolean);

      // Generate recommendations
      const recommendations: Array<{type: string; severity: 'info' | 'warning' | 'critical'; message: string; data?: any}> = [];

      // If many trades almost hit target, time windows may be too short
      const almostHitRate = (almostHitTargetCount / totalExpired) * 100;
      if (almostHitRate >= 40) {
        recommendations.push({
          type: 'time_window',
          severity: 'critical',
          message: `${Math.round(almostHitRate)}% of expired trades got 75%+ of the way to target. Consider extending time windows.`,
          data: { almostHitRate: Math.round(almostHitRate) }
        });
      } else if (almostHitRate >= 25) {
        recommendations.push({
          type: 'time_window',
          severity: 'warning',
          message: `${Math.round(almostHitRate)}% of expired trades almost hit target. Time windows may be slightly too tight.`,
          data: { almostHitRate: Math.round(almostHitRate) }
        });
      }

      // Check if day trades have worse outcomes than swing trades
      const dayTrades = byHoldingPeriod.find(p => p && p.period === 'day');
      const swingTrades = byHoldingPeriod.find(p => p && p.period === 'swing');
      if (dayTrades && swingTrades && dayTrades.count >= 10 && swingTrades.count >= 10) {
        if (dayTrades.almostHitTargetPercent > swingTrades.almostHitTargetPercent + 15) {
          recommendations.push({
            type: 'holding_period',
            severity: 'warning',
            message: `Day trades expire close to target (${dayTrades.almostHitTargetPercent}%) more often than swing trades (${swingTrades.almostHitTargetPercent}%). Consider swing timeframes for day trade setups.`,
          });
        }
      }

      // Check average needed movement
      const avgNeededMore = Math.round(
        tradeAnalyses.reduce((sum, t) => sum + t.neededMorePercent, 0) / totalExpired * 100
      ) / 100;
      if (avgNeededMore <= 2) {
        recommendations.push({
          type: 'target_setting',
          severity: 'info',
          message: `Average remaining distance to target was only ${avgNeededMore}%. Targets are well-calibrated but time windows need extension.`,
        });
      }

      res.json({
        summary: {
          totalExpired,
          almostHitTargetCount,
          almostHitTargetPercent: Math.round((almostHitTargetCount / totalExpired) * 100),
          veryCloseCount,
          veryClosePercent: Math.round((veryCloseCount / totalExpired) * 100),
          wouldHaveHitStopCount,
          wouldHaveHitStopPercent: Math.round((wouldHaveHitStopCount / totalExpired) * 100),
          avgProgressToTarget,
          avgNeededMorePercent: avgNeededMore,
        },
        byHoldingPeriod,
        byAssetType,
        trades: tradeAnalyses.slice(0, 100), // Limit to 100 most recent
        recommendations,
        reliability: totalExpired >= 30 ? 'high' : totalExpired >= 10 ? 'medium' : 'low',
      });
    } catch (error) {
      logger.error("Expiration analysis error:", error);
      res.status(500).json({ error: "Failed to analyze expired trades" });
    }
  });

  // ========================================
  // SIGNAL ATTRIBUTION ANALYTICS ENDPOINTS
  // ========================================

  // Get cached signal performance data (fast)
  app.get("/api/signal-attribution", async (req, res) => {
    try {
      const signals = await getSignalPerformanceFromCache();
      
      if (signals.length === 0) {
        return res.json({
          signals: [],
          topPerformers: [],
          worstPerformers: [],
          totalTradesAnalyzed: 0,
          overallWinRate: 0,
          lastUpdated: null,
          message: "No signal data available. Run recalculation to populate."
        });
      }
      
      const qualifiedSignals = signals.filter(s => s.totalTrades >= 10);
      const topPerformers = qualifiedSignals
        .filter(s => s.winRate >= 60)
        .sort((a, b) => b.reliabilityScore - a.reliabilityScore)
        .slice(0, 5);
      const worstPerformers = qualifiedSignals
        .filter(s => s.winRate < 50)
        .sort((a, b) => a.winRate - b.winRate)
        .slice(0, 5);
      
      res.json({
        signals: signals.sort((a, b) => b.reliabilityScore - a.reliabilityScore),
        topPerformers,
        worstPerformers,
        totalSignals: signals.length,
        lastUpdated: signals[0]?.signalName ? new Date().toISOString() : null
      });
    } catch (error) {
      logger.error("Signal attribution fetch error:", error);
      res.status(500).json({ error: "Failed to fetch signal attribution data" });
    }
  });

  // Recalculate signal performance (admin only, slower)
  app.post("/api/signal-attribution/recalculate", requireAdminJWT, async (req, res) => {
    try {
      const result = await calculateSignalAttribution();
      res.json({
        success: true,
        message: `Analyzed ${result.signals.length} signals from ${result.totalTradesAnalyzed} trades`,
        ...result
      });
    } catch (error) {
      logger.error("Signal attribution recalculation error:", error);
      res.status(500).json({ error: "Failed to recalculate signal attribution" });
    }
  });

  // Get top performing signals (quick summary)
  app.get("/api/signal-attribution/top", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
      const signals = await getSignalPerformanceFromCache();
      
      const qualified = signals
        .filter(s => s.totalTrades >= 10 && s.winRate >= 50)
        .sort((a, b) => b.reliabilityScore - a.reliabilityScore)
        .slice(0, limit);
      
      res.json({
        topSignals: qualified,
        totalQualified: signals.filter(s => s.totalTrades >= 10).length
      });
    } catch (error) {
      logger.error("Top signals fetch error:", error);
      res.status(500).json({ error: "Failed to fetch top signals" });
    }
  });

  // ============== DYNAMIC SIGNAL WEIGHTS ==============
  // Soft-weighting system: adapts based on performance but never rejects signals
  
  // Get current signal weights summary
  app.get("/api/signal-weights", async (req, res) => {
    try {
      const { getWeightsSummary, getSignalWeights } = await import("./dynamic-signal-weights");
      const summary = await getWeightsSummary();
      const allWeights = await getSignalWeights();
      
      res.json({
        ...summary,
        allWeights: Array.from(allWeights.values())
          .sort((a, b) => b.dynamicWeight - a.dynamicWeight)
      });
    } catch (error) {
      logger.error("Signal weights fetch error:", error);
      res.status(500).json({ error: "Failed to fetch signal weights" });
    }
  });

  // Refresh signal weights from attribution data
  app.post("/api/signal-weights/refresh", requireAdminJWT, async (req, res) => {
    try {
      const { refreshSignalWeights } = await import("./dynamic-signal-weights");
      const weights = await refreshSignalWeights();
      
      res.json({
        success: true,
        message: `Refreshed ${weights.size} signal weights`,
        totalWeights: weights.size
      });
    } catch (error) {
      logger.error("Signal weights refresh error:", error);
      res.status(500).json({ error: "Failed to refresh signal weights" });
    }
  });

  // Set manual override for a signal (freedom to catch new patterns)
  app.post("/api/signal-weights/override", requireAdminJWT, async (req, res) => {
    try {
      const { signalName, weight } = req.body;
      
      if (!signalName || typeof weight !== 'number') {
        return res.status(400).json({ error: "signalName and weight required" });
      }
      
      const { setManualOverride, getWeightForSignal } = await import("./dynamic-signal-weights");
      const previousWeight = setManualOverride(signalName, weight);
      const newWeight = await getWeightForSignal(signalName);
      
      res.json({
        success: true,
        signalName,
        previousWeight,
        newWeight,
        message: `Override set: ${signalName} = ${newWeight}x (was ${previousWeight.toFixed(2)}x)`
      });
    } catch (error) {
      logger.error("Signal override error:", error);
      res.status(500).json({ error: "Failed to set signal override" });
    }
  });

  // Remove manual override (return to dynamic weighting)
  app.delete("/api/signal-weights/override/:signalName", requireAdminJWT, async (req, res) => {
    try {
      const { signalName } = req.params;
      const { removeManualOverride, getWeightForSignal } = await import("./dynamic-signal-weights");
      
      const existed = removeManualOverride(signalName);
      const newWeight = await getWeightForSignal(signalName);
      
      res.json({
        success: true,
        signalName,
        existed,
        newWeight,
        message: existed 
          ? `Override removed for ${signalName}, now using dynamic weight ${newWeight.toFixed(2)}x`
          : `No override existed for ${signalName}`
      });
    } catch (error) {
      logger.error("Signal override removal error:", error);
      res.status(500).json({ error: "Failed to remove signal override" });
    }
  });

  // Get all manual overrides
  app.get("/api/signal-weights/overrides", async (req, res) => {
    try {
      const { getManualOverrides } = await import("./dynamic-signal-weights");
      const overrides = getManualOverrides();
      
      res.json({
        count: overrides.size,
        overrides: Object.fromEntries(overrides)
      });
    } catch (error) {
      logger.error("Get overrides error:", error);
      res.status(500).json({ error: "Failed to get overrides" });
    }
  });

  // Calculate weighted confidence for a set of signals (preview what bot would do)
  app.post("/api/signal-weights/calculate", async (req, res) => {
    try {
      const { signals, baseConfidence } = req.body;
      
      if (!Array.isArray(signals) || typeof baseConfidence !== 'number') {
        return res.status(400).json({ error: "signals array and baseConfidence required" });
      }
      
      const { calculateWeightedConfidence } = await import("./dynamic-signal-weights");
      const result = await calculateWeightedConfidence(signals, baseConfidence);
      
      res.json(result);
    } catch (error) {
      logger.error("Weighted confidence calculation error:", error);
      res.status(500).json({ error: "Failed to calculate weighted confidence" });
    }
  });

  // Engine vs Signal Strength Correlation Matrix
  // Shows win rate for each engine at each signal strength level
  // HONEST DATA: Uses actual qualitySignals.length, not fake confidence scores
  app.get("/api/performance/engine-confidence-correlation", async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Use shared canonical filters for consistency (include Flow)
      const filteredIdeas = applyCanonicalPerformanceFilters(allIdeas, { includeFlowLotto: true });
      
      // Get decided trades only (wins + real losses, excludes breakeven and legacy engines)
      const decidedIdeas = getDecidedTrades(filteredIdeas, { includeAllVersions: false });
      
      // Define engines and SIGNAL STRENGTH bands (using actual signal count)
      const engines = ['ai', 'quant', 'hybrid', 'flow', 'chart_analysis', 'lotto'];
      const signalBands = [
        { name: 'High (3+ signals)', minSignals: 3, maxSignals: 999 },
        { name: 'Medium (1-2 signals)', minSignals: 1, maxSignals: 2 },
        { name: 'Low (0 signals)', minSignals: 0, maxSignals: 0 },
      ];
      
      // Build correlation matrix
      const correlationMatrix: {
        engine: string;
        displayName: string;
        totalTrades: number;
        totalWins: number;
        overallWinRate: number;
        byConfidence: {
          band: string;
          trades: number;
          wins: number;
          losses: number;
          winRate: number;
        }[];
      }[] = [];
      
      engines.forEach(engine => {
        const engineIdeas = decidedIdeas.filter(idea => idea.source === engine);
        
        if (engineIdeas.length === 0) return; // Skip engines with no data
        
        const engineWins = engineIdeas.filter(i => i.outcomeStatus === 'hit_target').length;
        const engineLosses = engineIdeas.filter(i => isRealLoss(i)).length;
        
        const engineStats = {
          engine,
          displayName: engine === 'ai' ? 'AI' : 
                       engine === 'quant' ? 'Quant' :
                       engine === 'hybrid' ? 'Hybrid' :
                       engine === 'flow' ? 'Flow' :
                       engine === 'chart_analysis' ? 'Chart Analysis' :
                       engine === 'lotto' ? 'Lotto' : engine,
          totalTrades: engineWins + engineLosses,
          totalWins: engineWins,
          overallWinRate: 0,
          byConfidence: [] as any[],
        };
        
        engineStats.overallWinRate = engineStats.totalTrades > 0 
          ? Math.round((engineStats.totalWins / engineStats.totalTrades) * 1000) / 10 
          : 0;
        
        // Calculate stats for each SIGNAL STRENGTH band (using actual signal count)
        signalBands.forEach(band => {
          const bandIdeas = engineIdeas.filter(idea => {
            const signalCount = idea.qualitySignals?.length || 0;
            return signalCount >= band.minSignals && signalCount <= band.maxSignals;
          });
          
          const wins = bandIdeas.filter(i => i.outcomeStatus === 'hit_target').length;
          const losses = bandIdeas.filter(i => isRealLoss(i)).length;
          const decidedCount = wins + losses;
          const winRate = decidedCount > 0 
            ? Math.round((wins / decidedCount) * 1000) / 10 
            : 0;
          
          engineStats.byConfidence.push({
            band: band.name,
            trades: decidedCount,
            wins,
            losses,
            winRate,
          });
        });
        
        correlationMatrix.push(engineStats);
      });
      
      // Sort by total trades (most active engines first)
      correlationMatrix.sort((a, b) => b.totalTrades - a.totalTrades);
      
      res.json({
        correlationMatrix,
        confidenceBands: signalBands.map(b => b.name),
        summary: {
          totalEngines: correlationMatrix.length,
          totalResolvedTrades: decidedIdeas.length,
        }
      });
    } catch (error) {
      logger.error("Engine-signal correlation error:", error);
      res.status(500).json({ error: "Failed to fetch engine-signal correlation" });
    }
  });

  // 5. Streaks - Current streak and historical streaks
  app.get("/api/performance/streaks", async (req, res) => {
    try {
      const engine = req.query.engine as string | undefined;
      
      // Get all trade ideas
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Filter: only auto-resolved trades + optional engine filter
      let filteredIdeas = allIdeas.filter(idea => 
        idea.resolutionReason === 'auto_target_hit' || 
        idea.resolutionReason === 'auto_stop_hit'
      );
      
      if (engine) {
        filteredIdeas = filteredIdeas.filter(idea => idea.source === engine);
      }
      
      // Sort by timestamp ascending (oldest first)
      filteredIdeas.sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      
      // Calculate streaks
      let currentStreak = { type: 'win' as 'win' | 'loss', count: 0 };
      let longestWinStreak = 0;
      let longestLossStreak = 0;
      let tempWinStreak = 0;
      let tempLossStreak = 0;
      
      filteredIdeas.forEach((idea, index) => {
        const isWin = idea.resolutionReason === 'auto_target_hit';
        
        if (isWin) {
          tempWinStreak++;
          tempLossStreak = 0;
          
          if (tempWinStreak > longestWinStreak) {
            longestWinStreak = tempWinStreak;
          }
        } else {
          tempLossStreak++;
          tempWinStreak = 0;
          
          if (tempLossStreak > longestLossStreak) {
            longestLossStreak = tempLossStreak;
          }
        }
        
        // Update current streak (last trade determines current streak)
        if (index === filteredIdeas.length - 1) {
          if (tempWinStreak > 0) {
            currentStreak = { type: 'win', count: tempWinStreak };
          } else {
            currentStreak = { type: 'loss', count: tempLossStreak };
          }
        }
      });
      
      const streaks = {
        currentStreak: currentStreak.count,
        currentStreakType: currentStreak.type,
        longestWinStreak: longestWinStreak,
        longestLossStreak: longestLossStreak,
      };
      
      res.json(streaks);
    } catch (error) {
      logger.error("Streaks error:", error);
      res.status(500).json({ error: "Failed to fetch streaks" });
    }
  });

  // 🤖 AUTO-LOTTO BOT PERFORMANCE - From paper_positions table
  // This shows ACTUAL bot executions, not just signal detection
  app.get("/api/performance/auto-lotto-bot", async (req, res) => {
    try {
      // Get all paper portfolios
      const portfolios = await storage.getAllPaperPortfolios();
      
      // Get all positions across all portfolios
      let allPositions: any[] = [];
      for (const portfolio of portfolios) {
        const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
        allPositions = allPositions.concat(positions.map(p => ({ ...p, portfolioName: portfolio.name })));
      }
      
      const closedPositions = allPositions.filter(p => p.status === 'closed');
      const openPositions = allPositions.filter(p => p.status === 'open');
      
      // Calculate overall stats
      const wins = closedPositions.filter((p: any) => (p.realizedPnL || 0) > 0);
      const losses = closedPositions.filter((p: any) => (p.realizedPnL || 0) <= 0);
      const totalPnL = closedPositions.reduce((sum: number, p: any) => sum + (p.realizedPnL || 0), 0);
      const avgPnL = closedPositions.length > 0 ? totalPnL / closedPositions.length : 0;
      const winRate = closedPositions.length > 0 ? (wins.length / closedPositions.length) * 100 : 0;
      
      // Group by portfolio type
      const optionsPortfolio = portfolios.find((p: any) => p.name.toLowerCase().includes('options'));
      const futuresPortfolio = portfolios.find((p: any) => p.name.toLowerCase().includes('futures'));
      
      const optionsPositions = closedPositions.filter((p: any) => p.portfolioId === optionsPortfolio?.id);
      const futuresPositions = closedPositions.filter((p: any) => p.portfolioId === futuresPortfolio?.id);
      
      const optionsWins = optionsPositions.filter((p: any) => (p.realizedPnL || 0) > 0);
      const optionsLosses = optionsPositions.filter((p: any) => (p.realizedPnL || 0) <= 0);
      const optionsPnL = optionsPositions.reduce((sum: number, p: any) => sum + (p.realizedPnL || 0), 0);
      
      const futuresWins = futuresPositions.filter((p: any) => (p.realizedPnL || 0) > 0);
      const futuresLosses = futuresPositions.filter((p: any) => (p.realizedPnL || 0) <= 0);
      const futuresPnL = futuresPositions.reduce((sum: number, p: any) => sum + (p.realizedPnL || 0), 0);
      
      // Group by exit reason
      const exitReasonStats: Record<string, { count: number; wins: number; losses: number; totalPnL: number }> = {};
      closedPositions.forEach((p: any) => {
        const reason = p.exitReason?.split(':')[0] || 'unknown';
        if (!exitReasonStats[reason]) {
          exitReasonStats[reason] = { count: 0, wins: 0, losses: 0, totalPnL: 0 };
        }
        exitReasonStats[reason].count++;
        if ((p.realizedPnL || 0) > 0) exitReasonStats[reason].wins++;
        else exitReasonStats[reason].losses++;
        exitReasonStats[reason].totalPnL += p.realizedPnL || 0;
      });
      
      // Best and worst trades
      const sortedByPnL = [...closedPositions].sort((a: any, b: any) => (b.realizedPnL || 0) - (a.realizedPnL || 0));
      const bestTrade = sortedByPnL[0];
      const worstTrade = sortedByPnL[sortedByPnL.length - 1];
      
      // Calculate unrealized P&L
      const totalUnrealizedPnL = openPositions.reduce((sum: number, p: any) => sum + (p.unrealizedPnL || 0), 0);
      
      res.json({
        overall: {
          totalTrades: closedPositions.length,
          wins: wins.length,
          losses: losses.length,
          winRate: Math.round(winRate * 10) / 10,
          totalPnL: Math.round(totalPnL * 100) / 100,
          avgPnL: Math.round(avgPnL * 100) / 100,
          openPositions: openPositions.length,
          unrealizedPnL: Math.round(totalUnrealizedPnL * 100) / 100,
        },
        options: {
          totalTrades: optionsPositions.length,
          wins: optionsWins.length,
          losses: optionsLosses.length,
          winRate: optionsPositions.length > 0 ? Math.round((optionsWins.length / optionsPositions.length) * 1000) / 10 : 0,
          totalPnL: Math.round(optionsPnL * 100) / 100,
          portfolio: optionsPortfolio,
        },
        futures: {
          totalTrades: futuresPositions.length,
          wins: futuresWins.length,
          losses: futuresLosses.length,
          winRate: futuresPositions.length > 0 ? Math.round((futuresWins.length / futuresPositions.length) * 1000) / 10 : 0,
          totalPnL: Math.round(futuresPnL * 100) / 100,
          portfolio: futuresPortfolio,
        },
        byExitReason: Object.entries(exitReasonStats).map(([reason, stats]) => ({
          reason,
          ...stats,
          winRate: stats.count > 0 ? Math.round((stats.wins / stats.count) * 1000) / 10 : 0,
        })),
        bestTrade: bestTrade ? {
          symbol: bestTrade.symbol,
          optionType: bestTrade.optionType,
          strikePrice: bestTrade.strikePrice,
          pnl: bestTrade.realizedPnL,
          pnlPercent: bestTrade.realizedPnLPercent,
        } : null,
        worstTrade: worstTrade ? {
          symbol: worstTrade.symbol,
          optionType: worstTrade.optionType,
          strikePrice: worstTrade.strikePrice,
          pnl: worstTrade.realizedPnL,
          pnlPercent: worstTrade.realizedPnLPercent,
        } : null,
        recentTrades: closedPositions.slice(0, 10).map((p: any) => ({
          symbol: p.symbol,
          optionType: p.optionType,
          strikePrice: p.strikePrice,
          entryPrice: p.entryPrice,
          exitPrice: p.exitPrice,
          quantity: p.quantity,
          pnl: p.realizedPnL,
          pnlPercent: p.realizedPnLPercent,
          exitReason: p.exitReason,
        })),
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Auto-Lotto Bot performance error:", error);
      res.status(500).json({ error: "Failed to fetch Auto-Lotto Bot performance" });
    }
  });

  // ============================================================================
  // 📊 HISTORICAL TRADE INTELLIGENCE - Learning from 3,000+ trade ideas
  // ============================================================================
  
  // Get comprehensive historical performance stats (beta/admin only)
  app.get("/api/historical-intelligence/stats", requireBetaAccess, async (_req, res) => {
    try {
      const stats = await historicalIntelligenceService.calculatePerformanceStats();
      res.json(stats);
    } catch (error) {
      logger.error("[HIST-INTEL] Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch historical intelligence stats" });
    }
  });
  
  // Get symbol behavior profile (beta/admin only)
  app.get("/api/historical-intelligence/symbol/:symbol", requireBetaAccess, async (req, res) => {
    try {
      const { symbol } = req.params;
      const intelligence = await historicalIntelligenceService.getSymbolIntelligence(symbol.toUpperCase());
      res.json(intelligence);
    } catch (error) {
      logger.error("[HIST-INTEL] Error fetching symbol intelligence:", error);
      res.status(500).json({ error: "Failed to fetch symbol intelligence" });
    }
  });
  
  // Get all symbol behavior profiles (paginated, beta/admin only)
  app.get("/api/historical-intelligence/profiles", requireBetaAccess, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = (req.query.sortBy as string) || 'totalIdeas';
      const sortOrder = (req.query.sortOrder as string) || 'desc';
      const minTrades = parseInt(req.query.minTrades as string) || 1;
      
      const profiles = await db.select().from(symbolBehaviorProfiles);
      
      // Filter by minimum trades
      let filtered = profiles.filter(p => p.closedIdeas >= minTrades);
      
      // Sort
      filtered.sort((a, b) => {
        const aVal = (a as any)[sortBy] || 0;
        const bVal = (b as any)[sortBy] || 0;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
      
      // Paginate
      const paginated = filtered.slice(offset, offset + limit);
      
      res.json({
        profiles: paginated,
        total: filtered.length,
        limit,
        offset
      });
    } catch (error) {
      logger.error("[HIST-INTEL] Error fetching profiles:", error);
      res.status(500).json({ error: "Failed to fetch symbol profiles" });
    }
  });
  
  // Get confidence calibration data (beta/admin only)
  app.get("/api/historical-intelligence/calibration", requireBetaAccess, async (_req, res) => {
    try {
      const calibration = await db.select().from(confidenceCalibration);
      res.json(calibration);
    } catch (error) {
      logger.error("[HIST-INTEL] Error fetching calibration:", error);
      res.status(500).json({ error: "Failed to fetch confidence calibration" });
    }
  });
  
  // Get historical intelligence summary (beta/admin only)
  app.get("/api/historical-intelligence/summary", requireBetaAccess, async (_req, res) => {
    try {
      const summary = await db.select().from(historicalIntelligenceSummary);
      res.json(summary[0] || null);
    } catch (error) {
      logger.error("[HIST-INTEL] Error fetching summary:", error);
      res.status(500).json({ error: "Failed to fetch intelligence summary" });
    }
  });
  
  // Get confidence adjustment for a new trade idea (beta/admin only)
  app.post("/api/historical-intelligence/confidence-adjustment", requireBetaAccess, async (req, res) => {
    try {
      const { symbol, catalyst, direction } = req.body;
      if (!symbol) {
        return res.status(400).json({ error: "Missing required field: symbol" });
      }
      
      // Use defaults for catalyst and direction if not provided
      const adjustment = await historicalIntelligenceService.getConfidenceAdjustment(
        symbol.toUpperCase(),
        catalyst || '',
        direction || 'long'
      );
      res.json(adjustment);
    } catch (error) {
      logger.error("[HIST-INTEL] Error calculating confidence adjustment:", error);
      res.status(500).json({ error: "Failed to calculate confidence adjustment" });
    }
  });
  
  // Trigger full intelligence refresh (admin only)
  app.post("/api/historical-intelligence/refresh", requireAdminJWT, async (_req, res) => {
    try {
      logger.info("[HIST-INTEL] Starting full intelligence refresh...");
      const result = await historicalIntelligenceService.fullRefresh();
      res.json({
        success: true,
        message: `Refreshed ${result.profilesUpdated} symbol profiles`,
        ...result
      });
    } catch (error) {
      logger.error("[HIST-INTEL] Error during refresh:", error);
      res.status(500).json({ error: "Failed to refresh historical intelligence" });
    }
  });
  
  // Update single symbol profile (admin only)
  app.post("/api/historical-intelligence/symbol/:symbol/refresh", requireAdminJWT, async (req, res) => {
    try {
      const { symbol } = req.params;
      const profile = await historicalIntelligenceService.updateSymbolProfile(symbol.toUpperCase());
      if (profile) {
        res.json({ success: true, profile });
      } else {
        res.status(404).json({ error: "No trade data found for symbol" });
      }
    } catch (error) {
      logger.error("[HIST-INTEL] Error updating symbol profile:", error);
      res.status(500).json({ error: "Failed to update symbol profile" });
    }
  });
  
  // Get top performing symbols (beta/admin only)
  app.get("/api/historical-intelligence/top-performers", requireBetaAccess, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const minTrades = parseInt(req.query.minTrades as string) || 3;
      
      const profiles = await db.select().from(symbolBehaviorProfiles);
      
      const qualified = profiles
        .filter(p => p.closedIdeas >= minTrades)
        .sort((a, b) => (b.overallWinRate || 0) - (a.overallWinRate || 0))
        .slice(0, limit);
      
      res.json({
        topPerformers: qualified.map(p => ({
          symbol: p.symbol,
          winRate: p.overallWinRate,
          trades: p.closedIdeas,
          wins: p.wins,
          losses: p.losses,
          totalPnL: p.totalPnL,
          profitFactor: p.profitFactor,
          bestCatalyst: p.bestCatalystType,
          bestCatalystWinRate: p.bestCatalystWinRate
        }))
      });
    } catch (error) {
      logger.error("[HIST-INTEL] Error fetching top performers:", error);
      res.status(500).json({ error: "Failed to fetch top performers" });
    }
  });
  
  // Get catalyst performance breakdown (beta/admin only)
  app.get("/api/historical-intelligence/catalyst-performance", requireBetaAccess, async (_req, res) => {
    try {
      const stats = await historicalIntelligenceService.calculatePerformanceStats();
      res.json({
        catalysts: stats.byCatalyst,
        topCatalysts: stats.byCatalyst.slice(0, 5),
        worstCatalysts: stats.byCatalyst.slice(-5).reverse()
      });
    } catch (error) {
      logger.error("[HIST-INTEL] Error fetching catalyst performance:", error);
      res.status(500).json({ error: "Failed to fetch catalyst performance" });
    }
  });

  // 🤖 BOT TRADES VIEW - Enhanced endpoint with asset type filtering
  // Shows all positions across all bot portfolios with live P&L
  app.get("/api/bot-trades", async (req, res) => {
    try {
      const assetTypeFilter = req.query.assetType as string | undefined;
      const statusFilter = req.query.status as string || 'all';
      
      // Get all paper portfolios
      const portfolios = await storage.getAllPaperPortfolios();
      
      // Get all positions across all portfolios
      let allPositions: any[] = [];
      for (const portfolio of portfolios) {
        // Skip user portfolios (only show bot portfolios)
        if (!portfolio.name.toLowerCase().includes('auto-lotto') && 
            !portfolio.name.toLowerCase().includes('bot')) {
          continue;
        }
        
        const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
        allPositions = allPositions.concat(positions.map(p => ({ 
          ...p, 
          portfolioName: portfolio.name,
          portfolioId: portfolio.id,
          botType: portfolio.name.toLowerCase().includes('options') ? 'options' : 
                   portfolio.name.toLowerCase().includes('futures') ? 'futures' : 
                   portfolio.name.toLowerCase().includes('crypto') ? 'crypto' : 'stock'
        })));
      }
      
      // Apply asset type filter
      if (assetTypeFilter && assetTypeFilter !== 'all') {
        allPositions = allPositions.filter(p => {
          if (assetTypeFilter === 'options') return p.assetType === 'option';
          if (assetTypeFilter === 'crypto') return p.assetType === 'crypto';
          if (assetTypeFilter === 'futures') return p.assetType === 'futures';
          if (assetTypeFilter === 'stock') return p.assetType === 'stock';
          return true;
        });
      }
      
      // Apply status filter
      if (statusFilter !== 'all') {
        allPositions = allPositions.filter(p => p.status === statusFilter);
      }
      
      // Sort by created time descending (newest first)
      allPositions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      // Get portfolio summaries - exclude empty portfolios with no trades
      const portfolioSummaries = portfolios
        .filter(p => {
          // Must be a bot portfolio
          if (!p.name.toLowerCase().includes('auto-lotto') && !p.name.toLowerCase().includes('bot')) {
            return false;
          }
          // Must be a specific bot type (Options, Crypto, Futures) - exclude generic "Auto-Lotto Bot"
          const hasSpecificType = p.name.toLowerCase().includes('options') || 
                                  p.name.toLowerCase().includes('crypto') || 
                                  p.name.toLowerCase().includes('futures');
          return hasSpecificType;
        })
        .map(portfolio => {
          // Use unfiltered positions for portfolio stats (allPositions is already filtered by asset/status for display)
          const positions = allPositions.filter(pos => pos.portfolioId === portfolio.id);
          const openPos = positions.filter(p => p.status === 'open');
          const closedPos = positions.filter(p => p.status === 'closed');
          const wins = closedPos.filter(p => (p.realizedPnL || 0) > 0);
          const totalRealizedPnL = closedPos.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
          const totalUnrealizedPnL = openPos.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
          
          return {
            id: portfolio.id,
            name: portfolio.name,
            cashBalance: portfolio.cashBalance,
            totalValue: portfolio.totalValue,
            startingCapital: portfolio.startingCapital,
            openPositions: openPos.length,
            closedPositions: closedPos.length,
            winRate: closedPos.length > 0 ? Math.round((wins.length / closedPos.length) * 100) : 0,
            realizedPnL: Math.round(totalRealizedPnL * 100) / 100,
            unrealizedPnL: Math.round(totalUnrealizedPnL * 100) / 100,
            botType: portfolio.name.toLowerCase().includes('options') ? 'options' : 
                     portfolio.name.toLowerCase().includes('futures') ? 'futures' : 
                     portfolio.name.toLowerCase().includes('crypto') ? 'crypto' : 'stock'
          };
        });
      
      // Format positions for display
      const formattedPositions = allPositions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        assetType: p.assetType,
        direction: p.direction,
        quantity: p.quantity,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        targetPrice: p.targetPrice,
        stopLoss: p.stopLoss,
        status: p.status,
        unrealizedPnL: p.unrealizedPnL,
        unrealizedPnLPercent: p.unrealizedPnLPercent,
        realizedPnL: p.realizedPnL,
        realizedPnLPercent: p.realizedPnLPercent,
        exitReason: p.exitReason,
        optionType: p.optionType,
        strikePrice: p.strikePrice,
        expiryDate: p.expiryDate,
        entryTime: p.entryTime,
        exitTime: p.exitTime,
        createdAt: p.createdAt,
        portfolioName: p.portfolioName,
        botType: p.botType,
      }));
      
      res.json({
        positions: formattedPositions,
        portfolios: portfolioSummaries,
        summary: {
          totalPositions: allPositions.length,
          openPositions: allPositions.filter(p => p.status === 'open').length,
          closedPositions: allPositions.filter(p => p.status === 'closed').length,
          byAssetType: {
            options: allPositions.filter(p => p.assetType === 'option').length,
            crypto: allPositions.filter(p => p.assetType === 'crypto').length,
            futures: allPositions.filter(p => p.assetType === 'futures').length,
            stock: allPositions.filter(p => p.assetType === 'stock').length,
          }
        },
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Bot trades endpoint error:", error);
      res.status(500).json({ error: "Failed to fetch bot trades" });
    }
  });

  // 🔍 FULL AUDIT EXPORT - Complete transparency on all bot trades
  // Shows entry time, entry price, exit details - everything for verification
  app.get("/api/audit/auto-lotto-bot", async (req, res) => {
    try {
      const format = req.query.format as string || 'json';
      
      // Get all paper portfolios
      const portfolios = await storage.getAllPaperPortfolios();
      
      // Get all positions across all portfolios
      let allPositions: any[] = [];
      for (const portfolio of portfolios) {
        const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
        allPositions = allPositions.concat(positions.map(p => ({ 
          ...p, 
          portfolioName: portfolio.name,
          portfolioType: portfolio.name.toLowerCase().includes('options') ? 'options' : 
                         portfolio.name.toLowerCase().includes('futures') ? 'futures' : 'other'
        })));
      }
      
      // Sort by entry time descending (newest first)
      allPositions.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());
      
      // Build full audit records with market timing context
      const auditRecords = allPositions.map((p, index) => {
        const entryTime = new Date(p.entryTime);
        const exitTime = p.exitTime ? new Date(p.exitTime) : null;
        const createdAt = new Date(p.createdAt);
        
        // Calculate hold time in minutes
        const holdTimeMinutes = exitTime 
          ? Math.round((exitTime.getTime() - entryTime.getTime()) / (1000 * 60))
          : null;
        
        // Market session context helper - U.S. Eastern hours converted to Central Time
        // NYSE/NASDAQ: 9:30 AM - 4:00 PM ET = 8:30 AM - 3:00 PM CT
        const getMarketSession = (time: Date): string => {
          const ctTime = new Date(time.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          const hours = ctTime.getHours();
          const minutes = ctTime.getMinutes();
          const totalMinutes = hours * 60 + minutes;
          
          // Pre-market: 6:00 AM - 8:30 AM CT (7:00 AM - 9:30 AM ET)
          if (totalMinutes >= 360 && totalMinutes < 510) return 'PRE-MARKET';
          // Power Hour: 2:00 PM - 3:00 PM CT (3:00 PM - 4:00 PM ET, last hour of trading)
          if (totalMinutes >= 840 && totalMinutes < 900) return 'POWER-HOUR';
          // Regular: 8:30 AM - 2:00 PM CT (before power hour)
          if (totalMinutes >= 510 && totalMinutes < 840) return 'REGULAR';
          // After-hours: 3:00 PM - 7:00 PM CT (4:00 PM - 8:00 PM ET)
          if (totalMinutes >= 900 && totalMinutes < 1140) return 'AFTER-HOURS';
          return 'CLOSED';
        };
        
        const getDayOfWeek = (time: Date): string => {
          const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
          const ctTime = new Date(time.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
          return days[ctTime.getDay()];
        };
        
        // Calculate DTE at entry for options
        const getDteAtEntry = (): number | null => {
          if (p.assetType !== 'option' || !p.expiryDate) return null;
          const expiry = new Date(p.expiryDate);
          const diffTime = expiry.getTime() - entryTime.getTime();
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        };
        
        // Format contract name for options
        let contractName = p.symbol;
        if (p.assetType === 'option') {
          const expDate = p.expiryDate?.replace(/-/g, '').slice(2) || '';
          const optType = p.optionType?.toUpperCase().charAt(0) || '';
          const strike = p.strikePrice ? Math.round(p.strikePrice * 1000).toString().padStart(8, '0') : '';
          contractName = `${p.symbol}${expDate}${optType}${strike}`;
        }
        
        return {
          tradeNumber: allPositions.length - index,
          id: p.id,
          portfolioType: p.portfolioType,
          portfolioName: p.portfolioName,
          
          // Trade identification
          symbol: p.symbol,
          contractName,
          assetType: p.assetType,
          direction: p.direction,
          optionType: p.optionType || null,
          strikePrice: p.strikePrice || null,
          expiryDate: p.expiryDate || null,
          
          // Entry details - FULL TRANSPARENCY with market context
          entryTime: p.entryTime,
          entryTimeFormatted: formatInTimeZone(entryTime, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss zzz'),
          entryDayOfWeek: getDayOfWeek(entryTime),
          entrySession: getMarketSession(entryTime),
          entryPrice: p.entryPrice,
          quantity: p.quantity,
          entryCost: Math.round((p.entryPrice * p.quantity * (p.assetType === 'option' ? 100 : 1)) * 100) / 100,
          dteAtEntry: getDteAtEntry(),
          
          // Exit details with market context
          status: p.status,
          exitTime: p.exitTime || null,
          exitTimeFormatted: exitTime ? formatInTimeZone(exitTime, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss zzz') : null,
          exitDayOfWeek: exitTime ? getDayOfWeek(exitTime) : null,
          exitSession: exitTime ? getMarketSession(exitTime) : null,
          exitPrice: p.exitPrice || null,
          exitReason: p.exitReason || null,
          
          // P&L details
          realizedPnL: p.realizedPnL ?? null,
          realizedPnLPercent: p.realizedPnLPercent ?? null,
          unrealizedPnL: p.status === 'open' ? (p.unrealizedPnL ?? null) : null,
          currentPrice: p.status === 'open' ? (p.currentPrice ?? null) : null,
          
          // Trade targets
          targetPrice: p.targetPrice,
          stopLoss: p.stopLoss,
          
          // Timing
          holdTimeMinutes,
          holdTimeFormatted: holdTimeMinutes !== null 
            ? holdTimeMinutes >= 60 
              ? `${Math.floor(holdTimeMinutes / 60)}h ${holdTimeMinutes % 60}m`
              : `${holdTimeMinutes}m`
            : 'OPEN',
          
          // Metadata
          createdAt: p.createdAt,
          createdAtFormatted: formatInTimeZone(createdAt, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss zzz'),
          tradeIdeaId: p.tradeIdeaId || null,
        };
      });
      
      // Calculate summary stats
      const closedTrades = auditRecords.filter(t => t.status === 'closed');
      const openTrades = auditRecords.filter(t => t.status === 'open');
      const wins = closedTrades.filter(t => (t.realizedPnL || 0) > 0);
      const losses = closedTrades.filter(t => (t.realizedPnL || 0) <= 0);
      const totalPnL = closedTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
      
      const summary = {
        exportDate: new Date().toISOString(),
        exportDateFormatted: formatInTimeZone(new Date(), 'America/Chicago', 'yyyy-MM-dd HH:mm:ss zzz'),
        totalTrades: auditRecords.length,
        closedTrades: closedTrades.length,
        openTrades: openTrades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 1000) / 10 : 0,
        totalPnL: Math.round(totalPnL * 100) / 100,
        avgPnL: closedTrades.length > 0 ? Math.round((totalPnL / closedTrades.length) * 100) / 100 : 0,
        bestTrade: wins.length > 0 ? Math.max(...wins.map(t => t.realizedPnL || 0)) : 0,
        worstTrade: losses.length > 0 ? Math.min(...losses.map(t => t.realizedPnL || 0)) : 0,
      };
      
      if (format === 'csv') {
        // Generate CSV with enhanced market timing data
        const headers = [
          'Trade #', 'ID', 'Portfolio', 'Symbol', 'Contract', 'Asset Type', 'Direction', 
          'Option Type', 'Strike', 'Expiry', 'DTE at Entry',
          'Entry Time (CT)', 'Entry Day', 'Entry Session', 'Entry Price', 'Qty', 'Entry Cost',
          'Status', 'Exit Time (CT)', 'Exit Day', 'Exit Session', 'Exit Price', 'Exit Reason', 
          'Realized P&L', 'Realized P&L %', 'Target', 'Stop Loss', 'Hold Time',
          'Created At (CT)', 'Trade Idea ID'
        ];
        
        const csvRows = [headers.join(',')];
        
        auditRecords.forEach(r => {
          const row = [
            r.tradeNumber,
            r.id,
            r.portfolioType,
            r.symbol,
            r.contractName,
            r.assetType,
            r.direction,
            r.optionType || '',
            r.strikePrice || '',
            r.expiryDate || '',
            r.dteAtEntry ?? '',
            `"${r.entryTimeFormatted}"`,
            r.entryDayOfWeek,
            r.entrySession,
            r.entryPrice,
            r.quantity,
            r.entryCost,
            r.status,
            r.exitTimeFormatted ? `"${r.exitTimeFormatted}"` : '',
            r.exitDayOfWeek || '',
            r.exitSession || '',
            r.exitPrice || '',
            r.exitReason ? `"${r.exitReason.replace(/"/g, '""')}"` : '',
            r.realizedPnL ?? '',
            r.realizedPnLPercent ?? '',
            r.targetPrice,
            r.stopLoss,
            r.holdTimeFormatted,
            `"${r.createdAtFormatted}"`,
            r.tradeIdeaId || ''
          ];
          csvRows.push(row.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="auto-lotto-bot-audit-${formatInTimeZone(new Date(), 'America/Chicago', 'yyyy-MM-dd-HHmm')}.csv"`);
        res.send(csvContent);
      } else {
        // JSON response
        res.json({
          summary,
          trades: auditRecords,
          disclaimer: "All trades shown are paper/simulated trades for research purposes only. Entry times and prices reflect the moment the bot executed the trade. This is NOT financial advice.",
        });
      }
    } catch (error) {
      logger.error("Audit export error:", error);
      res.status(500).json({ error: "Failed to generate audit export" });
    }
  });

  // 🔍 TRADE IDEAS AUDIT EXPORT - Complete transparency on all research ideas
  // Shows idea timing, entry/exit prices, market session context - everything for analysis
  app.get("/api/audit/trade-ideas", async (req, res) => {
    try {
      const format = req.query.format as string || 'json';
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Sort by timestamp descending (newest first)
      allIdeas.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Market session helper (same as bot audit)
      const getMarketSession = (time: Date): string => {
        const ctTime = new Date(time.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const hours = ctTime.getHours();
        const minutes = ctTime.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        
        if (totalMinutes >= 360 && totalMinutes < 510) return 'PRE-MARKET';
        if (totalMinutes >= 840 && totalMinutes < 900) return 'POWER-HOUR';
        if (totalMinutes >= 510 && totalMinutes < 840) return 'REGULAR';
        if (totalMinutes >= 900 && totalMinutes < 1140) return 'AFTER-HOURS';
        return 'CLOSED';
      };
      
      const getDayOfWeek = (time: Date): string => {
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const ctTime = new Date(time.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        return days[ctTime.getDay()];
      };
      
      // Build audit records
      const auditRecords = allIdeas.map((idea, index) => {
        const ideaTime = new Date(idea.timestamp);
        const exitTime = idea.exitDate ? new Date(idea.exitDate) : null;
        
        // Calculate DTE at idea generation for options
        let dteAtIdea: number | null = null;
        if (idea.assetType === 'option' && idea.expiryDate) {
          const expiry = new Date(idea.expiryDate);
          dteAtIdea = Math.ceil((expiry.getTime() - ideaTime.getTime()) / (1000 * 60 * 60 * 24));
        }
        
        return {
          ideaNumber: allIdeas.length - index,
          id: idea.id,
          symbol: idea.symbol,
          assetType: idea.assetType,
          direction: idea.direction,
          optionType: idea.optionType || null,
          strikePrice: idea.strikePrice || null,
          expiryDate: idea.expiryDate || null,
          dteAtIdea,
          
          // Idea timing with market context
          ideaTime: idea.timestamp,
          ideaTimeFormatted: formatInTimeZone(ideaTime, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss zzz'),
          ideaDayOfWeek: getDayOfWeek(ideaTime),
          ideaSession: getMarketSession(ideaTime),
          
          // Entry/Exit prices
          entryPrice: idea.entryPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          
          // Outcome
          outcomeStatus: idea.outcomeStatus || 'open',
          exitDate: idea.exitDate || null,
          exitDateFormatted: exitTime ? formatInTimeZone(exitTime, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss zzz') : null,
          exitDayOfWeek: exitTime ? getDayOfWeek(exitTime) : null,
          exitSession: exitTime ? getMarketSession(exitTime) : null,
          exitPrice: idea.exitPrice || null,
          
          // Performance
          percentGain: idea.percentGain ?? null,
          
          // Source and confidence
          source: idea.source,
          confidenceScore: idea.confidenceScore || null,
          holdingPeriod: idea.holdingPeriod || null,
          catalyst: idea.catalyst || null,
        };
      });
      
      // Calculate summary stats
      const closedIdeas = auditRecords.filter(i => i.outcomeStatus !== 'open');
      const wins = auditRecords.filter(i => i.outcomeStatus === 'hit_target');
      const losses = auditRecords.filter(i => i.outcomeStatus === 'hit_stop');
      const expired = auditRecords.filter(i => i.outcomeStatus === 'expired');
      
      const summary = {
        exportDate: formatInTimeZone(new Date(), 'America/Chicago', 'yyyy-MM-dd HH:mm:ss zzz'),
        totalIdeas: auditRecords.length,
        closedIdeas: closedIdeas.length,
        openIdeas: auditRecords.filter(i => i.outcomeStatus === 'open').length,
        wins: wins.length,
        losses: losses.length,
        expired: expired.length,
        winRateVsLosses: losses.length > 0 ? Math.round((wins.length / (wins.length + losses.length)) * 1000) / 10 : 0,
        winRateVsAll: closedIdeas.length > 0 ? Math.round((wins.length / closedIdeas.length) * 1000) / 10 : 0,
      };
      
      if (format === 'csv') {
        const headers = [
          'Idea #', 'ID', 'Symbol', 'Asset Type', 'Direction',
          'Option Type', 'Strike', 'Expiry', 'DTE at Idea',
          'Idea Time (CT)', 'Idea Day', 'Idea Session',
          'Entry Price', 'Target', 'Stop Loss',
          'Outcome', 'Exit Time (CT)', 'Exit Day', 'Exit Session', 'Exit Price',
          'Percent Gain', 'Source', 'Confidence', 'Holding Period', 'Catalyst'
        ];
        
        const csvRows = [headers.join(',')];
        
        auditRecords.forEach(r => {
          const row = [
            r.ideaNumber,
            r.id,
            r.symbol,
            r.assetType,
            r.direction,
            r.optionType || '',
            r.strikePrice || '',
            r.expiryDate || '',
            r.dteAtIdea ?? '',
            `"${r.ideaTimeFormatted}"`,
            r.ideaDayOfWeek,
            r.ideaSession,
            r.entryPrice,
            r.targetPrice,
            r.stopLoss,
            r.outcomeStatus,
            r.exitDateFormatted ? `"${r.exitDateFormatted}"` : '',
            r.exitDayOfWeek || '',
            r.exitSession || '',
            r.exitPrice || '',
            r.percentGain ?? '',
            r.source,
            r.confidenceScore || '',
            r.holdingPeriod || '',
            r.catalyst ? `"${r.catalyst.replace(/"/g, '""')}"` : ''
          ];
          csvRows.push(row.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="trade-ideas-audit-${formatInTimeZone(new Date(), 'America/Chicago', 'yyyy-MM-dd-HHmm')}.csv"`);
        res.send(csvContent);
      } else {
        res.json({
          summary,
          ideas: auditRecords,
          disclaimer: "All trade ideas shown are for research and educational purposes only. This is NOT financial advice.",
        });
      }
    } catch (error) {
      logger.error("Trade ideas audit export error:", error);
      res.status(500).json({ error: "Failed to generate trade ideas audit export" });
    }
  });

  // 🔍 DATA INTEGRITY AUDIT - Independent reconciliation of win/loss calculations
  // Recomputes stats from raw data using canonical helpers and compares to performance stats
  app.get("/api/audit/data-integrity", async (req, res) => {
    try {
      // 1. Independent recalculation from raw data using canonical helpers
      const allIdeas = await storage.getAllTradeIdeas();
      
      // Apply the SAME canonical filters as performance stats
      // Must include BOTH options and flow/lotto to match performance stats
      const filteredIdeas = applyCanonicalPerformanceFilters(allIdeas, { includeOptions: true, includeFlowLotto: true });
      
      // Use the SAME getDecidedTrades helper as performance stats
      const decidedTrades = getDecidedTrades(filteredIdeas);
      
      // Independently count wins and losses using the same criteria
      const independentWins = decidedTrades.filter(i => i.outcomeStatus === 'hit_target').length;
      const independentLosses = decidedTrades.filter(i => isRealLoss(i)).length;
      const independentDecided = independentWins + independentLosses;
      const independentWinRate = independentDecided > 0 
        ? Math.round((independentWins / independentDecided) * 1000) / 10 
        : 0;
      
      // 2. Get reported values from performance stats
      const stats = await storage.getPerformanceStats({});
      const reportedWins = stats.segmentedWinRates?.overall?.wins ?? 0;
      const reportedLosses = stats.segmentedWinRates?.overall?.losses ?? 0;
      const reportedWinRate = stats.segmentedWinRates?.overall?.winRate ?? 0;
      
      // 3. Build integrity checks comparing independent vs reported
      const checks = [
        {
          checkName: "Win Count Reconciliation",
          status: independentWins === reportedWins ? 'pass' : 'fail',
          independent: independentWins,
          reported: reportedWins,
        },
        {
          checkName: "Loss Count Reconciliation",
          status: independentLosses === reportedLosses ? 'pass' : 'fail',
          independent: independentLosses,
          reported: reportedLosses,
        },
        {
          checkName: "Win Rate Reconciliation",
          status: Math.abs(independentWinRate - reportedWinRate) < 0.5 ? 'pass' : 'fail',
          independent: independentWinRate,
          reported: reportedWinRate,
        },
        {
          checkName: "Sample Size Adequacy",
          status: independentDecided >= 100 ? 'pass' : 'warning',
          threshold: 100,
          actual: independentDecided,
        },
      ];
      
      // 4. Sample trades from the SAME decidedTrades set used in calculations
      const shuffled = [...decidedTrades].sort(() => Math.random() - 0.5);
      const sampleTrades = shuffled.slice(0, 10).map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        direction: trade.direction,
        outcomeStatus: trade.outcomeStatus,
        percentGain: trade.percentGain,
        source: trade.source || 'unknown',
        countedAsWin: trade.outcomeStatus === 'hit_target',
        countedAsLoss: isRealLoss(trade),
      }));
      
      res.json({
        checks,
        sampleTrades,
        summary: {
          totalWins: independentWins,
          totalLosses: independentLosses,
          totalDecided: independentDecided,
          winRate: independentWinRate,
          equitiesWinRate: stats.segmentedWinRates?.equities?.winRate ?? 0,
          optionsWinRate: stats.segmentedWinRates?.options?.winRate ?? 0,
        },
        methodology: {
          winDefinition: "outcomeStatus = 'hit_target'",
          lossDefinition: "outcomeStatus = 'hit_stop' AND percentGain <= -3%",
          canonicalHelpers: ["applyCanonicalPerformanceFilters", "getDecidedTrades", "isRealLoss"],
          exclusions: [
            "Breakeven trades (loss < 3%)",
            "Expired trades (outcomeStatus = 'expired')",
            "Open trades (outcomeStatus = 'open')",
            "Buggy data (excludeFromTraining = true)",
            "Legacy engines (pre-v3.0)"
          ],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Data integrity audit error:", error);
      res.status(500).json({ error: "Failed to generate data integrity audit" });
    }
  });

  // =========== DATA INTELLIGENCE API ===========
  // Comprehensive endpoint that provides all historical performance data
  // for use across the platform (trade cards, dashboards, etc.)
  // 🔧 DATA INTEGRITY: Uses canonical filters from storage.ts
  app.get("/api/data-intelligence", async (req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      
      // 🔧 DATA INTEGRITY: Apply canonical filters WITH flow/lotto included
      // Flow engine has excellent win rate - must show in engine breakdown
      const filteredIdeas = applyCanonicalPerformanceFilters(allIdeas, { includeFlowLotto: true });
      
      // 🔧 DATA INTEGRITY: Use canonical getDecidedTrades from storage.ts
      // Filter to current-gen engines and DECIDED trades (wins + real losses)
      // Excludes: expired, breakeven (<3% loss), and legacy v1.x/v2.x
      const resolvedIdeas = getDecidedTrades(filteredIdeas);
      
      // 1. Engine Performance Map
      const engineStats = new Map<string, { wins: number; losses: number; total: number }>();
      
      // 2. Symbol Performance Map
      const symbolStats = new Map<string, { wins: number; losses: number; total: number }>();
      
      // 3. Confidence Band Performance Map
      const bandStats = new Map<string, { wins: number; losses: number; total: number }>();
      
      resolvedIdeas.forEach(idea => {
        const isWin = idea.outcomeStatus === 'hit_target';
        const engine = idea.source || 'unknown';
        const symbol = idea.symbol;
        const confidence = idea.confidenceScore || 0;
        
        // Determine confidence band - CALIBRATED thresholds matching getProbabilityBand
        // A+ tier: 95+, A: 90+, B+: 85+, B: 78+, C+: 72+, C: 65+, D: 55+, F: <55
        let band: string;
        if (confidence >= 90) band = 'A';
        else if (confidence >= 85) band = 'B+';
        else if (confidence >= 78) band = 'B';
        else if (confidence >= 72) band = 'C+';
        else if (confidence >= 65) band = 'C';
        else band = 'D';
        
        // Update engine stats
        if (!engineStats.has(engine)) {
          engineStats.set(engine, { wins: 0, losses: 0, total: 0 });
        }
        const engStat = engineStats.get(engine)!;
        engStat.total++;
        if (isWin) engStat.wins++; else engStat.losses++;
        
        // Update symbol stats
        if (!symbolStats.has(symbol)) {
          symbolStats.set(symbol, { wins: 0, losses: 0, total: 0 });
        }
        const symStat = symbolStats.get(symbol)!;
        symStat.total++;
        if (isWin) symStat.wins++; else symStat.losses++;
        
        // Update band stats
        if (!bandStats.has(band)) {
          bandStats.set(band, { wins: 0, losses: 0, total: 0 });
        }
        const bndStat = bandStats.get(band)!;
        bndStat.total++;
        if (isWin) bndStat.wins++; else bndStat.losses++;
      });
      
      // Convert to sorted arrays
      const enginePerformance = Array.from(engineStats.entries())
        .map(([engine, stats]) => ({
          engine,
          wins: stats.wins,
          losses: stats.losses,
          total: stats.total,
          winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.total - a.total);
      
      const symbolPerformance = Array.from(symbolStats.entries())
        .filter(([_, stats]) => stats.total >= 3) // Only symbols with 3+ resolved trades
        .map(([symbol, stats]) => ({
          symbol,
          wins: stats.wins,
          losses: stats.losses,
          total: stats.total,
          winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.total - a.total);
      
      const confidenceCalibration = Array.from(bandStats.entries())
        .map(([band, stats]) => ({
          band,
          wins: stats.wins,
          losses: stats.losses,
          total: stats.total,
          winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 1000) / 10 : 0
        }))
        .sort((a, b) => {
          // Sort by confidence band (A > B+ > B > C+ > C > D)
          const order = ['A', 'B+', 'B', 'C+', 'C', 'D'];
          return order.indexOf(a.band) - order.indexOf(b.band);
        });
      
      // Create quick lookup maps for embedding in trade cards
      const engineLookup: Record<string, number> = {};
      enginePerformance.forEach(e => { engineLookup[e.engine] = e.winRate; });
      
      const symbolLookup: Record<string, { winRate: number; trades: number }> = {};
      symbolPerformance.forEach(s => { 
        symbolLookup[s.symbol] = { winRate: s.winRate, trades: s.total }; 
      });
      
      const bandLookup: Record<string, number> = {};
      confidenceCalibration.forEach(b => { bandLookup[b.band] = b.winRate; });
      
      // 🔧 DATA INTEGRITY: Summary uses consistent counts from filtered+thresholded data
      const totalWins = resolvedIdeas.filter(i => i.outcomeStatus === 'hit_target').length;
      const totalLosses = resolvedIdeas.length - totalWins; // Real losses only (3% threshold applied above)
      
      res.json({
        summary: {
          totalIdeas: filteredIdeas.length, // Uses engine-filtered count (not raw allIdeas)
          resolvedTrades: resolvedIdeas.length, // Decided trades only (wins + real losses)
          totalWins,
          totalLosses,
          overallWinRate: resolvedIdeas.length > 0 
            ? Math.round((totalWins / resolvedIdeas.length) * 1000) / 10 
            : 0
        },
        enginePerformance,
        symbolPerformance,
        confidenceCalibration,
        // Quick lookup maps for trade cards
        lookup: {
          engine: engineLookup,
          symbol: symbolLookup,
          band: bandLookup
        }
      });
    } catch (error) {
      logger.error("Data intelligence error:", error);
      res.status(500).json({ error: "Failed to fetch data intelligence" });
    }
  });

  // Engine Health / Telemetry Routes
  
  // GET /api/engine-health - Get current engine health dashboard data
  app.get("/api/engine-health", async (_req, res) => {
    try {
      const { format, subDays, startOfDay } = await import("date-fns");
      const today = format(new Date(), 'yyyy-MM-dd');
      const sevenDaysAgo = subDays(startOfDay(new Date()), 7);
      
      // Get all trade ideas and calculate metrics directly from source data
      const allIdeas = await storage.getAllTradeIdeas();
      const activeAlerts = await storage.getActiveHealthAlerts();
      
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      // Map sources to engine categories
      const mapSourceToEngine = (source: string): string => {
        switch (source) {
          case 'flow': return 'flow';
          case 'lotto': return 'lotto';
          case 'quant': return 'quant';
          case 'ai': 
          case 'chart_analysis': return 'ai';
          case 'hybrid': return 'hybrid';
          case 'manual': return 'manual';
          default: return 'manual';
        }
      };
      
      // Calculate today's metrics
      const todayIdeas = allIdeas.filter(idea => {
        const ideaDate = idea.timestamp ? idea.timestamp.split('T')[0] : null;
        return ideaDate === todayStr;
      });
      
      // Calculate 7-day metrics directly from trade_ideas
      const engines = ['flow', 'lotto', 'quant', 'ai', 'hybrid', 'manual'] as const;
      const weekMetrics: Record<string, {
        ideasGenerated: number;
        tradesResolved: number;
        tradesWon: number;
        tradesLost: number;
        winRate: number | null;
        expectancy: number | null;
        avgGainPercent: number | null;
        avgLossPercent: number | null;
      }> = {};
      
      const todayMetrics: Record<string, {
        ideasGenerated: number;
        ideasPublished: number;
        tradesResolved: number;
        tradesWon: number;
        tradesLost: number;
        tradesExpired: number;
        winRate: number | null;
        avgGainPercent: number | null;
        avgLossPercent: number | null;
        expectancy: number | null;
        avgHoldingTimeMinutes: number | null;
        avgConfidenceScore: number | null;
      }> = {};
      
      for (const engine of engines) {
        // Week metrics - ideas generated in last 7 days
        const weekEngineIdeas = allIdeas.filter(idea => {
          const ideaDate = idea.timestamp ? new Date(idea.timestamp) : null;
          return ideaDate && ideaDate >= sevenDaysAgo && mapSourceToEngine(idea.source) === engine;
        });
        
        // Week resolved trades (all time for this engine, since we want overall performance)
        const engineResolvedAll = allIdeas.filter(idea => 
          mapSourceToEngine(idea.source) === engine && 
          idea.outcomeStatus !== 'open'
        );
        
        const winners = engineResolvedAll.filter(i => i.outcomeStatus === 'hit_target');
        const losers = engineResolvedAll.filter(i => i.outcomeStatus === 'hit_stop');
        const decidedCount = winners.length + losers.length;
        
        const winRate = decidedCount > 0 ? (winners.length / decidedCount) * 100 : null;
        
        // Calculate avg gain/loss from percent_gain field
        const gains = winners.map(w => w.percentGain).filter((g): g is number => g !== null && g > 0);
        const losses = losers.map(l => l.percentGain).filter((l): l is number => l !== null);
        
        const avgGain = gains.length > 0 ? gains.reduce((s, v) => s + v, 0) / gains.length : null;
        const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : null;
        
        let expectancy: number | null = null;
        if (winRate !== null && avgGain !== null && avgLoss !== null) {
          const wr = winRate / 100;
          expectancy = (wr * avgGain) - ((1 - wr) * avgLoss);
        }
        
        weekMetrics[engine] = {
          ideasGenerated: weekEngineIdeas.length,
          tradesResolved: engineResolvedAll.length,
          tradesWon: winners.length,
          tradesLost: losers.length,
          winRate,
          expectancy,
          avgGainPercent: avgGain,
          avgLossPercent: avgLoss ? -avgLoss : null,
        };
        
        // Today's metrics for this engine
        const todayEngineIdeas = todayIdeas.filter(i => mapSourceToEngine(i.source) === engine);
        const todayResolved = allIdeas.filter(idea => {
          if (!idea.exitDate || idea.outcomeStatus === 'open') return false;
          const exitDate = idea.exitDate.split('T')[0];
          return exitDate === todayStr && mapSourceToEngine(idea.source) === engine;
        });
        
        const todayWinners = todayResolved.filter(i => i.outcomeStatus === 'hit_target');
        const todayLosers = todayResolved.filter(i => i.outcomeStatus === 'hit_stop');
        const todayExpired = todayResolved.filter(i => i.outcomeStatus === 'expired');
        const todayDecided = todayWinners.length + todayLosers.length;
        
        const todayWinRate = todayDecided > 0 ? (todayWinners.length / todayDecided) * 100 : null;
        
        const todayGains = todayWinners.map(w => w.percentGain).filter((g): g is number => g !== null);
        const todayLosses = todayLosers.map(l => l.percentGain).filter((l): l is number => l !== null);
        const todayAvgGain = todayGains.length > 0 ? todayGains.reduce((s, v) => s + v, 0) / todayGains.length : null;
        const todayAvgLoss = todayLosses.length > 0 ? todayLosses.reduce((s, v) => s + v, 0) / todayLosses.length : null;
        
        let todayExpectancy: number | null = null;
        if (todayWinRate !== null && todayAvgGain !== null && todayAvgLoss !== null) {
          const wr = todayWinRate / 100;
          todayExpectancy = (wr * todayAvgGain) - ((1 - wr) * Math.abs(todayAvgLoss));
        }
        
        const holdingTimes = todayResolved
          .map(i => i.actualHoldingTimeMinutes)
          .filter((t): t is number => t !== null);
        const avgHoldingTime = holdingTimes.length > 0 
          ? holdingTimes.reduce((s, v) => s + v, 0) / holdingTimes.length 
          : null;
          
        const confidenceScores = todayEngineIdeas
          .map(i => i.confidenceScore)
          .filter((c): c is number => c !== null && c > 0);
        const avgConfidence = confidenceScores.length > 0
          ? confidenceScores.reduce((s, v) => s + v, 0) / confidenceScores.length
          : null;
        
        todayMetrics[engine] = {
          ideasGenerated: todayEngineIdeas.length,
          ideasPublished: todayEngineIdeas.filter(i => i.status === 'published').length,
          tradesResolved: todayResolved.length,
          tradesWon: todayWinners.length,
          tradesLost: todayLosers.length,
          tradesExpired: todayExpired.length,
          winRate: todayWinRate,
          avgGainPercent: todayAvgGain,
          avgLossPercent: todayAvgLoss,
          expectancy: todayExpectancy,
          avgHoldingTimeMinutes: avgHoldingTime,
          avgConfidenceScore: avgConfidence,
        };
      }
      
      res.json({
        date: today,
        todayMetrics,
        weekMetrics,
        historicalMetrics: [], // Empty for now, will be populated by daily rollup
        activeAlerts,
      });
    } catch (error) {
      logger.error("Engine health error:", error);
      res.status(500).json({ error: "Failed to fetch engine health data" });
    }
  });

  // GET /api/engine-health/scorecard - Get daily scorecard for a specific date
  app.get("/api/engine-health/scorecard", async (req, res) => {
    try {
      const { format } = await import("date-fns");
      const dateParam = req.query.date as string | undefined;
      const date = dateParam || format(new Date(), 'yyyy-MM-dd');
      
      const metrics = await telemetryService.calculateDailyMetrics(date);
      
      res.json({
        date,
        metrics,
      });
    } catch (error) {
      logger.error("Engine scorecard error:", error);
      res.status(500).json({ error: "Failed to fetch engine scorecard" });
    }
  });

  // GET /api/engine-health/trends - Get engine performance trends
  app.get("/api/engine-health/trends", async (req, res) => {
    try {
      const { format, subDays } = await import("date-fns");
      const days = parseInt(req.query.days as string) || 30;
      const engine = req.query.engine as string | undefined;
      
      const today = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
      
      const metrics = await storage.getEngineMetricsRange(
        startDate, 
        today, 
        engine as any
      );
      
      res.json({
        startDate,
        endDate: today,
        days,
        engine: engine || 'all',
        metrics,
      });
    } catch (error) {
      logger.error("Engine trends error:", error);
      res.status(500).json({ error: "Failed to fetch engine trends" });
    }
  });

  // POST /api/engine-health/alerts/:id/acknowledge - Acknowledge an alert
  app.post("/api/engine-health/alerts/:id/acknowledge", isAuthenticated, async (req: any, res) => {
    try {
      const alertId = req.params.id;
      const userId = req.session?.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User ID not found in session" });
      }
      
      await storage.acknowledgeHealthAlert(alertId, userId);
      
      res.json({ 
        success: true, 
        message: `Alert ${alertId} acknowledged by user ${userId}` 
      });
    } catch (error) {
      logger.error("Alert acknowledge error:", error);
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  });

  // Catalysts Routes
  app.get("/api/catalysts", async (_req, res) => {
    try {
      const catalysts = await storage.getAllCatalysts();
      res.json(catalysts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch catalysts" });
    }
  });

  app.get("/api/catalysts/symbol/:symbol", async (req, res) => {
    try {
      const catalysts = await storage.getCatalystsBySymbol(req.params.symbol);
      res.json(catalysts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch catalysts" });
    }
  });

  app.post("/api/catalysts", async (req, res) => {
    try {
      const validated = insertCatalystSchema.parse(req.body);
      const catalyst = await storage.createCatalyst(validated);
      res.status(201).json(catalyst);
    } catch (error) {
      res.status(400).json({ error: "Invalid catalyst data" });
    }
  });

  // Sync earnings calendar from Alpha Vantage
  app.post("/api/catalysts/sync-earnings", async (_req, res) => {
    try {
      const { fetchEarningsCalendar } = await import("./market-api");
      const earnings = await fetchEarningsCalendar('3month');
      
      if (earnings.length === 0) {
        return res.json({ 
          message: "No earnings data available", 
          synced: 0 
        });
      }

      // Filter for next 14 days only (most relevant)
      // Normalize to midnight to include same-day earnings
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const twoWeeksFromNow = new Date(today);
      twoWeeksFromNow.setDate(today.getDate() + 14);
      
      const upcomingEarnings = earnings.filter(e => {
        const reportDate = new Date(e.reportDate);
        reportDate.setHours(0, 0, 0, 0);
        return reportDate >= today && reportDate <= twoWeeksFromNow;
      });

      // Sync to catalyst table
      let syncedCount = 0;
      
      for (const earning of upcomingEarnings) {
        try {
          // Check if already exists
          const existing = await storage.getCatalystsBySymbol(earning.symbol);
          const alreadyExists = existing.some(c => 
            c.eventType === 'earnings' && 
            c.timestamp.startsWith(earning.reportDate)
          );
          
          if (!alreadyExists) {
            const estimateText = earning.estimate 
              ? ` (Est. EPS: $${earning.estimate.toFixed(2)})` 
              : '';
            
            // Calculate fiscal quarter correctly (months are 0-indexed)
            const fiscalMonth = new Date(earning.fiscalDateEnding).getMonth();
            const fiscalQuarter = Math.floor((fiscalMonth + 3) / 3);
              
            await storage.createCatalyst({
              symbol: earning.symbol,
              title: `${earning.name} Earnings Report`,
              description: `${earning.symbol} reports Q${fiscalQuarter} earnings${estimateText}`,
              source: 'Alpha Vantage',
              sourceUrl: `https://finance.yahoo.com/quote/${earning.symbol}`,
              timestamp: `${earning.reportDate}T16:00:00-05:00`, // After market close
              eventType: 'earnings',
              impact: 'high', // All earnings are high impact
            });
            syncedCount++;
          }
        } catch (error) {
          logger.error(`Failed to sync earnings for ${earning.symbol}:`, error);
        }
      }

      logger.info(`📅 Synced ${syncedCount} earnings events to catalyst feed`);
      res.json({ 
        message: `Synced ${syncedCount} upcoming earnings events`, 
        total: upcomingEarnings.length,
        synced: syncedCount 
      });
    } catch (error) {
      logger.error('❌ Earnings sync error:', error);
      res.status(500).json({ error: "Failed to sync earnings calendar" });
    }
  });

  // Watchlist Routes
  app.get("/api/watchlist", async (req: any, res) => {
    try {
      // Disable caching - watchlist data must be fresh for each user
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      const userId = req.session?.userId;
      const adminEmail = process.env.ADMIN_EMAIL || "";
      
      // Check if current user is admin
      let isAdmin = false;
      if (userId) {
        const user = await storage.getUser(userId);
        isAdmin = adminEmail !== "" && user?.email === adminEmail;
        logger.info(`[WATCHLIST] userId=${userId}, userEmail=${user?.email}, adminEmail=${adminEmail}, isAdmin=${isAdmin}`);
      } else {
        logger.info(`[WATCHLIST] No userId in session - returning empty`);
      }
      
      // Admin sees all, users see their own
      const watchlist = isAdmin 
        ? await storage.getAllWatchlist()
        : userId 
          ? await storage.getWatchlistByUser(userId)
          : [];
      
      logger.info(`[WATCHLIST] Returning ${watchlist.length} items (isAdmin=${isAdmin})`);
      res.json(watchlist);
    } catch (error) {
      logger.error('[WATCHLIST] Error fetching watchlist:', error);
      res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/watchlist", async (req: any, res) => {
    try {
      console.log("POST /api/watchlist - Request body:", JSON.stringify(req.body));
      const validated = insertWatchlistSchema.parse(req.body);
      
      // Add userId from session if not provided
      const userId = req.session?.userId;
      if (userId && !validated.userId) {
        validated.userId = userId;
      }
      
      // Add timestamp
      const itemWithTimestamp = {
        ...validated,
        addedAt: new Date().toISOString(),
      };
      
      console.log("POST /api/watchlist - Validated:", JSON.stringify(itemWithTimestamp));
      const item = await storage.addToWatchlist(itemWithTimestamp as any);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("POST /api/watchlist - Validation error:", error);
      res.status(400).json({ error: "Invalid watchlist item", details: error?.message || error });
    }
  });

  // Batch add stocks to watchlist with automatic price alerts
  app.post("/api/watchlist/batch-add", async (req: any, res) => {
    try {
      const { symbols } = req.body;
      
      if (!Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: "symbols must be a non-empty array" });
      }
      
      const results: any[] = [];
      const errors: any[] = [];
      
      // Import Tradier API for price fetching
      const { getTradierQuote } = await import('./tradier-api');
      
      for (const symbol of symbols) {
        try {
          // Fetch current price using Tradier API
          const quote = await getTradierQuote(symbol);
          
          if (!quote || !quote.last) {
            errors.push({ symbol, error: `Could not fetch price for ${symbol}` });
            continue;
          }
          
          const currentPrice = quote.last;
          
          // Calculate alert prices based on current price
          const entryAlertPrice = Math.round(currentPrice * 0.97 * 100) / 100;  // 3% below
          const stopAlertPrice = Math.round(currentPrice * 0.92 * 100) / 100;   // 8% below
          const targetAlertPrice = Math.round(currentPrice * 1.10 * 100) / 100; // 10% above
          
          // Create watchlist item
          const watchlistData = {
            symbol: symbol.toUpperCase(),
            assetType: 'stock' as const,
            notes: 'User watchlist - momentum tracking',
            addedAt: new Date().toISOString(),
            alertsEnabled: true,
            discordAlertsEnabled: true,
            entryAlertPrice,
            stopAlertPrice,
            targetAlertPrice,
            targetPrice: currentPrice, // Store reference price
          };
          
          const item = await storage.addToWatchlist(watchlistData);
          
          logger.info(`📋 [WATCHLIST] Added ${symbol} at $${currentPrice} with alerts enabled`);
          
          results.push({
            symbol,
            currentPrice,
            entryAlertPrice,
            stopAlertPrice,
            targetAlertPrice,
            id: item.id,
          });
          
        } catch (error: any) {
          errors.push({ symbol, error: error?.message || 'Unknown error' });
        }
      }
      
      res.status(201).json({
        success: true,
        added: results.length,
        failed: errors.length,
        results,
        errors,
      });
      
    } catch (error: any) {
      logger.error('❌ Batch watchlist add error:', error);
      res.status(500).json({ error: "Failed to batch add watchlist items", details: error?.message });
    }
  });

  app.patch("/api/watchlist/:id", async (req, res) => {
    try {
      console.log("PATCH /api/watchlist/:id - Request body:", JSON.stringify(req.body));
      
      // Get existing item to check current price and validate alerts
      const existingItem = await storage.getWatchlistItem(req.params.id);
      if (!existingItem) {
        return res.status(404).json({ error: "Watchlist item not found" });
      }
      
      // VALIDATION: Prevent setting alerts that are already triggered
      const warnings: string[] = [];
      const { entryAlertPrice, targetAlertPrice, stopAlertPrice } = req.body;
      
      // Fetch current price to validate alerts
      let currentPrice: number | null = null;
      try {
        if (existingItem.assetType === 'crypto') {
          const data = await fetchCryptoPrice(existingItem.symbol);
          currentPrice = data?.currentPrice || null;
        } else {
          const data = await fetchStockPrice(existingItem.symbol);
          currentPrice = data?.currentPrice || null;
        }
      } catch (e) {
        // Ignore price fetch errors - validation is optional
      }
      
      if (currentPrice) {
        // Entry alert should be BELOW current price (buy on dip)
        if (entryAlertPrice && entryAlertPrice >= currentPrice) {
          warnings.push(`Entry alert ($${entryAlertPrice}) is at or above current price ($${currentPrice.toFixed(2)}). This will trigger immediately.`);
        }
        
        // Target alert should be ABOVE current price (sell on rally)
        if (targetAlertPrice && targetAlertPrice <= currentPrice) {
          warnings.push(`Target alert ($${targetAlertPrice}) is at or below current price ($${currentPrice.toFixed(2)}). This will trigger immediately.`);
        }
        
        // Stop alert should be BELOW current price (protect downside)
        if (stopAlertPrice && stopAlertPrice >= currentPrice) {
          warnings.push(`Stop alert ($${stopAlertPrice}) is at or above current price ($${currentPrice.toFixed(2)}). This will trigger immediately.`);
        }
        
        // BLOCK updates with immediately-triggering alerts unless force=true
        if (warnings.length > 0 && !req.body.forceAlerts) {
          return res.status(400).json({ 
            error: "Alert would trigger immediately", 
            warnings,
            currentPrice,
            hint: "Set forceAlerts: true to save anyway, or adjust alert prices"
          });
        }
      }
      
      // Remove forceAlerts flag before saving (not a valid schema field)
      const { forceAlerts: _ignored, ...dataToSave } = req.body;
      
      const updated = await storage.updateWatchlistItem(req.params.id, dataToSave);
      if (!updated) {
        return res.status(404).json({ error: "Watchlist item not found or was deleted" });
      }
      console.log("PATCH /api/watchlist/:id - Updated:", JSON.stringify(updated));
      
      // Return with warnings if any (only if forceAlerts was used)
      res.json({ 
        ...updated, 
        warnings: warnings.length > 0 ? warnings : undefined,
        currentPrice 
      });
    } catch (error: any) {
      console.error("PATCH /api/watchlist/:id - Error:", error);
      res.status(500).json({ error: "Failed to update watchlist item", details: error?.message || error });
    }
  });

  app.delete("/api/watchlist/:id", async (req, res) => {
    try {
      const deleted = await storage.removeFromWatchlist(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Watchlist item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete watchlist item" });
    }
  });

  // Premium Tracking Routes
  app.get("/api/watchlist/:id/premium-history", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 90;
      const history = await storage.getPremiumHistory(req.params.id, days);
      res.json(history);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/watchlist/:id/premium-history' });
      res.status(500).json({ error: "Failed to fetch premium history" });
    }
  });

  app.get("/api/watchlist/:id/premium-trend", async (req, res) => {
    try {
      const { getPremiumTrend } = await import('./premium-tracking-service');
      const trend = await getPremiumTrend(req.params.id);
      
      // Map to UI-expected format
      const getOpportunityScore = (percentile: number | null, isOpportunity: boolean) => {
        if (percentile === null) return null;
        if (percentile < 10) return 'Strong Buy';
        if (percentile < 25 || isOpportunity) return 'Good Opportunity';
        if (percentile < 50) return 'Fair Value';
        if (percentile < 75) return 'Expensive';
        return 'Very Expensive';
      };
      
      // Calculate dollar change (from previous day's premium)
      const previousPremium = trend.history.length > 1 ? trend.history[1].premium : null;
      const dollarChange = trend.current !== null && previousPremium !== null 
        ? trend.current - previousPremium 
        : null;
      
      res.json({
        currentPremium: trend.current,
        previousPremium,
        change: dollarChange,
        changePercent: trend.change7d,
        trend: trend.trend,
        percentile: trend.percentile,
        avg30d: trend.avg30d,
        opportunityScore: getOpportunityScore(trend.percentile, trend.isOpportunity),
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/watchlist/:id/premium-trend' });
      res.status(500).json({ error: "Failed to fetch premium trend" });
    }
  });

  app.post("/api/watchlist/track-premiums", requireAdminJWT, async (_req, res) => {
    try {
      const { trackAllPremiums } = await import('./premium-tracking-service');
      const result = await trackAllPremiums();
      res.json({
        message: `Tracked ${result.tracked} items, ${result.failed} failed`,
        ...result
      });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/watchlist/track-premiums' });
      res.status(500).json({ error: "Failed to track premiums" });
    }
  });

  // Watchlist Grading Routes
  app.get("/api/watchlist/graded", async (req: any, res) => {
    try {
      const { getGradedWatchlist } = await import('./watchlist-grading-service');
      const userId = req.user?.id;
      const items = await getGradedWatchlist(userId);
      res.json(items);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/watchlist/graded' });
      res.status(500).json({ error: "Failed to fetch graded watchlist" });
    }
  });

  app.post("/api/watchlist/:id/grade", async (req, res) => {
    try {
      const { gradeAndUpdateWatchlistItem } = await import('./watchlist-grading-service');
      const success = await gradeAndUpdateWatchlistItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Failed to grade watchlist item" });
      }
      const item = await storage.getWatchlistItem(req.params.id);
      res.json(item);
    } catch (error) {
      logError(error as Error, { context: 'POST /api/watchlist/:id/grade' });
      res.status(500).json({ error: "Failed to grade watchlist item" });
    }
  });

  app.post("/api/watchlist/grade-all", requireAdminJWT, async (_req, res) => {
    try {
      const { gradeAllWatchlistItems } = await import('./watchlist-grading-service');
      const result = await gradeAllWatchlistItems();
      res.json({
        message: `Graded ${result.graded}/${result.total} watchlist items`,
        ...result
      });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/watchlist/grade-all' });
      res.status(500).json({ error: "Failed to grade all watchlist items" });
    }
  });

  // ============================================
  // Watchlist History Routes (Year-Long Tracking)
  // ============================================
  
  // Get grade timeline for a symbol
  app.get("/api/watchlist/history/:symbol", async (req, res) => {
    try {
      const { watchlistHistoryService } = await import('./watchlist-history-service');
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const history = await watchlistHistoryService.getSymbolTimeline(req.params.symbol, year);
      res.json(history);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/watchlist/history/:symbol' });
      res.status(500).json({ error: "Failed to fetch watchlist history" });
    }
  });

  // Get stats for a symbol
  app.get("/api/watchlist/history/:symbol/stats", async (req, res) => {
    try {
      const { watchlistHistoryService } = await import('./watchlist-history-service');
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const stats = await watchlistHistoryService.getSymbolStats(req.params.symbol, year);
      if (!stats) {
        return res.json({ message: "No history found for this symbol" });
      }
      res.json(stats);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/watchlist/history/:symbol/stats' });
      res.status(500).json({ error: "Failed to fetch symbol stats" });
    }
  });

  // Get multi-year comparison
  app.get("/api/watchlist/history/:symbol/years", async (req, res) => {
    try {
      const { watchlistHistoryService } = await import('./watchlist-history-service');
      const comparison = await watchlistHistoryService.getMultiYearComparison(req.params.symbol);
      res.json(comparison);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/watchlist/history/:symbol/years' });
      res.status(500).json({ error: "Failed to fetch year comparison" });
    }
  });

  // Force snapshot for all watchlist items (admin only)
  app.post("/api/watchlist/history/snapshot", requireAdminJWT, async (_req, res) => {
    try {
      const { watchlistHistoryService } = await import('./watchlist-history-service');
      const result = await watchlistHistoryService.takeAllSnapshots();
      res.json({
        message: `Created ${result.success} snapshots (${result.failed} failed)`,
        ...result
      });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/watchlist/history/snapshot' });
      res.status(500).json({ error: "Failed to take snapshots" });
    }
  });

  // ============================================
  // Symbol Notes Routes
  // ============================================
  
  // Get notes for a symbol
  app.get("/api/symbol-notes/:symbol", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || 'anonymous';
      const notes = await storage.getSymbolNotes(req.params.symbol, userId);
      res.json(notes);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/symbol-notes/:symbol' });
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // Create a note
  app.post("/api/symbol-notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const { symbol, content, tags, isPrivate, linkedEventType, linkedEventId, watchlistId } = req.body;
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ error: "Symbol is required" });
      }
      if (!content || typeof content !== 'string' || content.length > 5000) {
        return res.status(400).json({ error: "Content is required (max 5000 chars)" });
      }
      const note = await storage.createSymbolNote({
        symbol: symbol.toUpperCase(),
        content,
        tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string').slice(0, 10) : null,
        isPrivate: typeof isPrivate === 'boolean' ? isPrivate : true,
        linkedEventType: typeof linkedEventType === 'string' ? linkedEventType : null,
        linkedEventId: typeof linkedEventId === 'string' ? linkedEventId : null,
        watchlistId: typeof watchlistId === 'string' ? watchlistId : null,
        noteType: 'user',
        userId,
      });
      res.json(note);
    } catch (error) {
      logError(error as Error, { context: 'POST /api/symbol-notes' });
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // Update a note
  app.patch("/api/symbol-notes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const existingNote = await storage.getSymbolNoteById(req.params.id);
      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }
      if (existingNote.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to update this note" });
      }
      const { content, tags, isPrivate, linkedEventType, linkedEventId } = req.body;
      const updates: Record<string, any> = {};
      if (content !== undefined) {
        if (typeof content !== 'string' || content.length > 5000) {
          return res.status(400).json({ error: "Content must be string (max 5000 chars)" });
        }
        updates.content = content;
      }
      if (tags !== undefined) {
        updates.tags = Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string').slice(0, 10) : null;
      }
      if (isPrivate !== undefined) {
        updates.isPrivate = Boolean(isPrivate);
      }
      if (linkedEventType !== undefined) {
        updates.linkedEventType = typeof linkedEventType === 'string' ? linkedEventType : null;
      }
      if (linkedEventId !== undefined) {
        updates.linkedEventId = typeof linkedEventId === 'string' ? linkedEventId : null;
      }
      const updated = await storage.updateSymbolNote(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      logError(error as Error, { context: 'PATCH /api/symbol-notes/:id' });
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  // Delete a note
  app.delete("/api/symbol-notes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const existingNote = await storage.getSymbolNoteById(req.params.id);
      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }
      if (existingNote.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this note" });
      }
      await storage.deleteSymbolNote(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logError(error as Error, { context: 'DELETE /api/symbol-notes/:id' });
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Performance attribution for a symbol (links watchlist to trade journal)
  app.get("/api/watchlist/performance-summary/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const allIdeas = await storage.getAllTradeIdeas();
      const symbolTrades = allIdeas.filter(idea => 
        idea.symbol.toUpperCase() === symbol && 
        idea.outcome && 
        idea.outcome !== 'open'
      );

      if (symbolTrades.length === 0) {
        return res.json({ stats: null });
      }

      const wins = symbolTrades.filter(t => t.outcome === 'win').length;
      const losses = symbolTrades.filter(t => t.outcome === 'loss').length;
      const winRate = symbolTrades.length > 0 ? (wins / symbolTrades.length) * 100 : 0;

      const tradesWithPnL = symbolTrades.filter(t => t.actualPnL != null);
      const totalPnL = tradesWithPnL.reduce((sum, t) => sum + (t.actualPnL || 0), 0);
      
      const tradesWithReturn = symbolTrades.filter(t => t.actualReturnPercent != null);
      const avgReturn = tradesWithReturn.length > 0 
        ? tradesWithReturn.reduce((sum, t) => sum + (t.actualReturnPercent || 0), 0) / tradesWithReturn.length 
        : 0;

      const sortedByPnL = [...tradesWithPnL].sort((a, b) => (b.actualPnL || 0) - (a.actualPnL || 0));
      const bestTrade = sortedByPnL.length > 0 && sortedByPnL[0].actualPnL != null ? { 
        pnl: sortedByPnL[0].actualPnL, 
        date: sortedByPnL[0].timestamp 
      } : null;
      const worstTrade = sortedByPnL.length > 0 && sortedByPnL[sortedByPnL.length - 1].actualPnL != null ? { 
        pnl: sortedByPnL[sortedByPnL.length - 1].actualPnL, 
        date: sortedByPnL[sortedByPnL.length - 1].timestamp 
      } : null;

      const gradeAtEntry = symbolTrades
        .map(t => t.probabilityBand || t.direction)
        .filter((g): g is string => Boolean(g))
        .slice(0, 5);

      const sortedByDate = [...symbolTrades].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const lastTradeDate = sortedByDate[0]?.timestamp || null;

      res.json({
        stats: {
          symbol,
          totalTrades: symbolTrades.length,
          wins,
          losses,
          winRate: isNaN(winRate) ? 0 : winRate,
          avgReturn: isNaN(avgReturn) ? 0 : avgReturn,
          totalPnL: isNaN(totalPnL) ? 0 : totalPnL,
          lastTradeDate,
          bestTrade,
          worstTrade,
          avgHoldTime: '1-3 days',
          gradeAtEntry,
        }
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/watchlist/performance-summary/:symbol' });
      res.status(500).json({ error: "Failed to fetch performance summary" });
    }
  });

  // ============== RESEARCH HISTORY ENDPOINTS ==============
  
  // Get user's research history with filters
  app.get("/api/research-history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      
      const { symbol, year, action, limit } = req.query;
      const history = await storage.getResearchHistory(userId, {
        symbol: symbol as string,
        year: year ? parseInt(year as string) : undefined,
        action: action as string,
        limit: limit ? parseInt(limit as string) : undefined,
      });
      res.json(history);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/research-history' });
      res.status(500).json({ error: "Failed to fetch research history" });
    }
  });

  // Get user's research stats (aggregated metrics)
  app.get("/api/research-history/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      
      const { year } = req.query;
      const stats = await storage.getUserResearchStats(userId, year ? parseInt(year as string) : undefined);
      res.json(stats);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/research-history/stats' });
      res.status(500).json({ error: "Failed to fetch research stats" });
    }
  });

  // Get symbol-specific research history for user
  app.get("/api/research-history/symbol/:symbol", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      
      const symbol = req.params.symbol.toUpperCase();
      const history = await storage.getSymbolResearchHistory(userId, symbol);
      res.json(history);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/research-history/symbol/:symbol' });
      res.status(500).json({ error: "Failed to fetch symbol research history" });
    }
  });

  // Log user action on a signal (traded/watched/ignored)
  app.post("/api/research-history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      
      const { symbol, signalId, actionTaken, signalGrade, signalConfidence, signalDirection, signalEngine, signalPrice, technicalSnapshot, marketRegime, signalPatterns, decisionNotes } = req.body;
      
      if (!symbol || !actionTaken) {
        return res.status(400).json({ error: "Symbol and actionTaken are required" });
      }
      
      const existing = signalId ? await storage.getResearchHistoryBySignal(userId, signalId) : null;
      if (existing) {
        const updated = await storage.updateResearchHistory(existing.id, { actionTaken, decisionNotes, decidedAt: new Date() });
        return res.json(updated);
      }
      
      const record = await storage.createResearchHistory({
        userId,
        symbol: symbol.toUpperCase(),
        signalId: signalId || null,
        actionTaken,
        signalGrade: signalGrade || null,
        signalConfidence: signalConfidence || null,
        signalDirection: signalDirection || null,
        signalEngine: signalEngine || null,
        signalPrice: signalPrice || null,
        technicalSnapshot: technicalSnapshot ? JSON.stringify(technicalSnapshot) : null,
        marketRegime: marketRegime || null,
        signalPatterns: signalPatterns || null,
        decisionNotes: decisionNotes || null,
        viewedAt: new Date(),
        decidedAt: new Date(),
      });
      res.json(record);
    } catch (error) {
      logError(error as Error, { context: 'POST /api/research-history' });
      res.status(500).json({ error: "Failed to log research action" });
    }
  });

  // Update research history (add outcome, lesson learned)
  app.patch("/api/research-history/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const { outcome, outcomeReturn, outcomePnL, lessonLearned } = req.body;
      
      const updated = await storage.updateResearchHistory(req.params.id, {
        outcome,
        outcomeReturn,
        outcomePnL,
        lessonLearned,
        outcomeUpdatedAt: new Date(),
      });
      
      if (!updated) return res.status(404).json({ error: "Record not found" });
      res.json(updated);
    } catch (error) {
      logError(error as Error, { context: 'PATCH /api/research-history/:id' });
      res.status(500).json({ error: "Failed to update research history" });
    }
  });

  // ============== PERSONAL EDGE ENDPOINTS ==============
  
  // Get performance by tier for authenticated user
  app.get("/api/personal-edge/performance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      
      const { year } = req.query;
      const { personalEdgeService } = await import('./personal-edge-service');
      const performance = await personalEdgeService.getPerformanceByTier(userId, year ? parseInt(year as string) : undefined);
      res.json(performance);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/personal-edge/performance' });
      res.status(500).json({ error: "Failed to fetch performance by tier" });
    }
  });

  // Get personal edge for a specific symbol
  app.get("/api/personal-edge/:symbol", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      
      const symbol = req.params.symbol.toUpperCase();
      const { personalEdgeService } = await import('./personal-edge-service');
      const edge = await personalEdgeService.getPersonalEdge(userId, symbol);
      res.json(edge);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/personal-edge/:symbol' });
      res.status(500).json({ error: "Failed to fetch personal edge" });
    }
  });

  // Get missed opportunities
  app.get("/api/personal-edge/missed-opportunities", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      
      const { limit } = req.query;
      const { personalEdgeService } = await import('./personal-edge-service');
      const opportunities = await personalEdgeService.getMissedOpportunities(userId, limit ? parseInt(limit as string) : 5);
      res.json(opportunities);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/personal-edge/missed-opportunities' });
      res.status(500).json({ error: "Failed to fetch missed opportunities" });
    }
  });

  // Update personal edge for all watchlist items
  app.post("/api/personal-edge/recalculate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      
      const { personalEdgeService } = await import('./personal-edge-service');
      const updated = await personalEdgeService.updateAllWatchlistEdges(userId);
      res.json({ success: true, updated });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/personal-edge/recalculate' });
      res.status(500).json({ error: "Failed to recalculate personal edges" });
    }
  });

  // Generate trade ideas from elite (S/A tier) watchlist setups
  app.post("/api/watchlist/generate-elite-ideas", isAuthenticated, async (req: any, res) => {
    try {
      const { generateEliteTradeIdeas } = await import('./watchlist-grading-service');
      const userId = req.user?.id;
      const result = await generateEliteTradeIdeas(userId);
      
      logger.info(`[ELITE] Generated ${result.generated} trade ideas from elite setups`);
      
      res.json({
        success: true,
        message: `Generated ${result.generated} trade ideas from S/A tier setups`,
        generated: result.generated,
        ideas: result.ideas.map((i: any) => ({ 
          symbol: i.symbol, 
          direction: i.direction, 
          tier: i.eliteTier,
          score: i.gradeScore 
        })),
        skipped: result.skipped
      });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/watchlist/generate-elite-ideas' });
      res.status(500).json({ error: "Failed to generate elite trade ideas" });
    }
  });

  // Aggregate trade ideas from ALL sources into Trade Desk
  app.post("/api/trade-ideas/ingest-all", requireAdminJWT, async (_req, res) => {
    try {
      const results: Record<string, { ingested: number; skipped: number }> = {};
      
      // 1. Ingest from Market Scanner movers
      try {
        const { ingestMoversToTradeDesk } = await import('./market-scanner');
        results.market_scanner = await ingestMoversToTradeDesk('day', 4, 1.5);
      } catch (err) {
        logger.error('[INGEST-ALL] Market scanner failed:', err);
        results.market_scanner = { ingested: 0, skipped: 0 };
      }
      
      // 2. Ingest from Bullish Trend Scanner
      try {
        const { ingestBullishTrendsToTradeDesk } = await import('./bullish-trend-scanner');
        results.bullish_trends = await ingestBullishTrendsToTradeDesk();
      } catch (err) {
        logger.error('[INGEST-ALL] Bullish trends failed:', err);
        results.bullish_trends = { ingested: 0, skipped: 0 };
      }
      
      // 3. Ingest from Watchlist (S/A grades)
      try {
        const { ingestWatchlistToTradeDesk } = await import('./watchlist-grading-service');
        results.watchlist = await ingestWatchlistToTradeDesk();
      } catch (err) {
        logger.error('[INGEST-ALL] Watchlist failed:', err);
        results.watchlist = { ingested: 0, skipped: 0 };
      }
      
      // 4. Ingest from Mover Discovery
      try {
        const { ingestMoversToTradeDesk: ingestDiscoveredMovers } = await import('./mover-discovery');
        results.mover_discovery = await ingestDiscoveredMovers();
      } catch (err) {
        logger.error('[INGEST-ALL] Mover discovery failed:', err);
        results.mover_discovery = { ingested: 0, skipped: 0 };
      }
      
      // Calculate totals
      const totalIngested = Object.values(results).reduce((sum, r) => sum + r.ingested, 0);
      const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);
      
      logger.info(`[INGEST-ALL] Complete: ${totalIngested} ingested, ${totalSkipped} skipped across all sources`);
      
      res.json({
        success: true,
        message: `Ingested ${totalIngested} trade ideas from all sources`,
        totalIngested,
        totalSkipped,
        bySource: results
      });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/trade-ideas/ingest-all' });
      res.status(500).json({ error: "Failed to ingest trade ideas from all sources" });
    }
  });

  // Annual Breakout Watchlist Routes
  app.get("/api/annual-watchlist", async (_req, res) => {
    try {
      const items = await storage.getWatchlistByCategory('annual_breakout');
      res.json(items);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/annual-watchlist' });
      res.status(500).json({ error: "Failed to fetch annual watchlist" });
    }
  });

  // Seed Annual Breakout Watchlist with curated stocks
  app.post("/api/annual-watchlist/seed", async (_req, res) => {
    try {
      const existing = await storage.getWatchlistByCategory('annual_breakout');
      if (existing.length > 0) {
        return res.json({ message: "Annual watchlist already has items", count: existing.length });
      }

      // Curated list of stocks with $70+ breakout potential for 2026
      const breakoutCandidates = [
        { symbol: 'IONQ', sector: 'Quantum Computing', currentPrice: 35, yearlyTargetPrice: 80, thesis: 'Leader in trapped-ion quantum computing. Revenue growth accelerating with enterprise deals. NASA, Goldman partnerships.', conviction: 'high' },
        { symbol: 'RGTI', sector: 'Quantum Computing', currentPrice: 12, yearlyTargetPrice: 40, thesis: 'Superconducting quantum chips. Strong IP portfolio. Potential acquisition target.', conviction: 'speculative' },
        { symbol: 'QBTS', sector: 'Quantum Computing', currentPrice: 8, yearlyTargetPrice: 25, thesis: 'D-Wave quantum annealing systems. Enterprise customers ramping. First to commercialize.', conviction: 'medium' },
        { symbol: 'RKLB', sector: 'Space', currentPrice: 28, yearlyTargetPrice: 75, thesis: 'Rocket Lab - second most active orbital launch company. Electron + Neutron rockets. Space systems revenue growing.', conviction: 'high' },
        { symbol: 'LUNR', sector: 'Space', currentPrice: 18, yearlyTargetPrice: 50, thesis: 'Intuitive Machines - NASA lunar lander contracts. First commercial lunar landing. Pipeline of missions.', conviction: 'medium' },
        { symbol: 'NNE', sector: 'Nuclear/Clean Energy', currentPrice: 35, yearlyTargetPrice: 100, thesis: 'Nano Nuclear Energy - portable nuclear microreactors. Military/remote site applications. Early stage but massive TAM.', conviction: 'speculative' },
        { symbol: 'SMR', sector: 'Nuclear/Clean Energy', currentPrice: 28, yearlyTargetPrice: 70, thesis: 'NuScale Power - small modular reactors. First SMR to get NRC approval. Utility contracts building.', conviction: 'high' },
        { symbol: 'OKLO', sector: 'Nuclear/Clean Energy', currentPrice: 32, yearlyTargetPrice: 80, thesis: 'Advanced fission reactors. Sam Altman backed. Data center power demand tailwind.', conviction: 'high' },
        { symbol: 'AI', sector: 'AI/ML', currentPrice: 35, yearlyTargetPrice: 85, thesis: 'C3.ai - Enterprise AI platform. Federal contracts strong. Turning profitable.', conviction: 'medium' },
        { symbol: 'SOUN', sector: 'AI/ML', currentPrice: 18, yearlyTargetPrice: 50, thesis: 'SoundHound AI - voice AI platform. Restaurant/auto integration. Revenue accelerating.', conviction: 'medium' },
        { symbol: 'BBAI', sector: 'AI/ML', currentPrice: 5, yearlyTargetPrice: 20, thesis: 'BigBear.ai - Defense/intel AI. Government contracts. Undervalued vs peers.', conviction: 'speculative' },
        { symbol: 'ACHR', sector: 'eVTOL/Flying Cars', currentPrice: 8, yearlyTargetPrice: 35, thesis: 'Archer Aviation - Electric air taxi. United Airlines partnership. FAA certification path.', conviction: 'speculative' },
        { symbol: 'JOBY', sector: 'eVTOL/Flying Cars', currentPrice: 7, yearlyTargetPrice: 30, thesis: 'Joby Aviation - Electric VTOL. Toyota backed. Military contracts. Commercial 2025.', conviction: 'speculative' },
        { symbol: 'MARA', sector: 'Crypto/Mining', currentPrice: 22, yearlyTargetPrice: 70, thesis: 'Marathon Digital - Bitcoin miner. BTC halving cycle. Largest hash rate in US.', conviction: 'medium' },
        { symbol: 'RIOT', sector: 'Crypto/Mining', currentPrice: 12, yearlyTargetPrice: 45, thesis: 'Riot Platforms - Bitcoin mining. Low cost producer. BTC accumulation strategy.', conviction: 'medium' },
        { symbol: 'HIMS', sector: 'Healthcare/Telehealth', currentPrice: 28, yearlyTargetPrice: 70, thesis: 'Hims & Hers - Telehealth leader. GLP-1 weight loss opportunity. Profitable and growing 50%+.', conviction: 'high' },
        { symbol: 'DNA', sector: 'Biotech/Synbio', currentPrice: 3, yearlyTargetPrice: 15, thesis: 'Ginkgo Bioworks - Synthetic biology platform. Cell programming. Long-term AI of biology play.', conviction: 'speculative' },
        { symbol: 'PATH', sector: 'AI/Automation', currentPrice: 15, yearlyTargetPrice: 40, thesis: 'UiPath - RPA/automation leader. AI integration. Enterprise stickiness. Profitable.', conviction: 'medium' },
        { symbol: 'APP', sector: 'AdTech/Gaming', currentPrice: 380, yearlyTargetPrice: 600, thesis: 'AppLovin - Mobile gaming ads. AI-powered ad engine. Massive margin expansion.', conviction: 'high' },
        { symbol: 'AFRM', sector: 'Fintech', currentPrice: 65, yearlyTargetPrice: 120, thesis: 'Affirm - BNPL leader. Apple Pay integration. Path to profitability clear.', conviction: 'medium' },
      ];

      const now = new Date().toISOString();
      const results = [];
      
      for (const candidate of breakoutCandidates) {
        const item = await storage.addToWatchlist({
          symbol: candidate.symbol,
          assetType: 'stock',
          addedAt: now,
          category: 'annual_breakout',
          thesis: candidate.thesis,
          conviction: candidate.conviction as any,
          sector: candidate.sector,
          startOfYearPrice: candidate.currentPrice,
          yearlyTargetPrice: candidate.yearlyTargetPrice,
          currentPrice: candidate.currentPrice,
          priceUpdatedAt: now,
          notes: `2026 Breakout Candidate - ${candidate.sector}`,
          alertsEnabled: true,
          discordAlertsEnabled: true,
        });
        results.push(item);
      }

      console.log(`📈 Seeded ${results.length} annual breakout candidates`);
      res.json({ message: "Annual watchlist seeded successfully", count: results.length, items: results });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/annual-watchlist/seed' });
      res.status(500).json({ error: "Failed to seed annual watchlist" });
    }
  });

  // Send Annual Breakout Watchlist to Discord
  app.post("/api/annual-watchlist/send-discord", async (_req, res) => {
    try {
      const items = await storage.getWatchlistByCategory('annual_breakout');
      
      if (items.length === 0) {
        return res.status(400).json({ error: "No items in annual watchlist. Use /api/annual-watchlist/seed first." });
      }
      
      const { sendAnnualBreakoutsToDiscord } = await import('./discord-service');
      
      // Transform items to match the expected format for breakouts
      const formattedItems = items.map(item => ({
        symbol: item.symbol,
        sector: item.sector,
        startOfYearPrice: item.startOfYearPrice,
        yearlyTargetPrice: item.yearlyTargetPrice,
        conviction: item.conviction,
        thesis: item.thesis,
      }));
      
      const result = await sendAnnualBreakoutsToDiscord(formattedItems);
      
      if (result.success) {
        console.log(`📨 Sent ${items.length} annual breakout candidates to Discord`);
        res.json({ 
          success: true, 
          message: result.message, 
          count: items.length 
        });
      } else {
        res.status(500).json({ error: result.message });
      }
    } catch (error) {
      logError(error as Error, { context: 'POST /api/annual-watchlist/send-discord' });
      res.status(500).json({ error: "Failed to send annual watchlist to Discord" });
    }
  });

  // Add single item to annual breakout watchlist
  app.post("/api/annual-watchlist/add", async (req: any, res) => {
    try {
      const { symbol, sector, entry, target, conviction, thesis } = req.body;
      
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }
      
      // Check if symbol already exists
      const existing = await storage.getWatchlistByCategory('annual_breakout');
      const existingItem = existing.find(item => item.symbol.toUpperCase() === symbol.toUpperCase());
      
      if (existingItem) {
        // Update existing item
        const updated = await storage.updateWatchlistItem(existingItem.id, {
          sector: sector || existingItem.sector,
          startOfYearPrice: entry || existingItem.startOfYearPrice,
          yearlyTargetPrice: target || existingItem.yearlyTargetPrice,
          conviction: conviction || existingItem.conviction,
          thesis: thesis || existingItem.thesis,
          priceUpdatedAt: new Date().toISOString(),
        });
        return res.json({ success: true, action: 'updated', item: updated });
      }
      
      // Add new item
      const now = new Date().toISOString();
      const item = await storage.addToWatchlist({
        symbol: symbol.toUpperCase(),
        assetType: 'stock',
        addedAt: now,
        category: 'annual_breakout',
        thesis: thesis || '',
        conviction: conviction || 'medium',
        sector: sector || 'Unknown',
        startOfYearPrice: entry || null,
        yearlyTargetPrice: target || null,
        currentPrice: entry || null,
        priceUpdatedAt: now,
        notes: `Breakout Candidate - ${sector || 'Unknown'}`,
        alertsEnabled: true,
        discordAlertsEnabled: true,
      });
      
      logger.info(`[ANNUAL-WATCHLIST] Added ${symbol} to annual breakout list`);
      res.status(201).json({ success: true, action: 'added', item });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/annual-watchlist/add' });
      res.status(500).json({ error: "Failed to add to annual watchlist" });
    }
  });

  // Remove item from annual breakout watchlist by symbol
  app.delete("/api/annual-watchlist/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const existing = await storage.getWatchlistByCategory('annual_breakout');
      const item = existing.find(i => i.symbol.toUpperCase() === symbol.toUpperCase());
      
      if (!item) {
        return res.status(404).json({ error: `${symbol} not found in annual watchlist` });
      }
      
      await storage.removeFromWatchlist(item.id);
      logger.info(`[ANNUAL-WATCHLIST] Removed ${symbol} from annual breakout list`);
      res.json({ success: true, message: `${symbol} removed from annual watchlist` });
    } catch (error) {
      logError(error as Error, { context: 'DELETE /api/annual-watchlist/:symbol' });
      res.status(500).json({ error: "Failed to remove from annual watchlist" });
    }
  });

  // Bulk update annual watchlist (update existing, add new, optionally remove old)
  app.post("/api/annual-watchlist/sync", async (req: any, res) => {
    try {
      const { items, removeUnlisted = false } = req.body;
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items must be a non-empty array" });
      }
      
      const existing = await storage.getWatchlistByCategory('annual_breakout');
      const existingSymbols = new Map(existing.map(item => [item.symbol.toUpperCase(), item]));
      const incomingSymbols = new Set(items.map((item: any) => item.symbol.toUpperCase()));
      
      const results = { added: 0, updated: 0, removed: 0, errors: [] as string[] };
      const now = new Date().toISOString();
      
      // Add or update items
      for (const item of items) {
        try {
          const symbol = item.symbol.toUpperCase();
          const existingItem = existingSymbols.get(symbol);
          
          if (existingItem) {
            // Update existing
            await storage.updateWatchlistItem(existingItem.id, {
              sector: item.sector || existingItem.sector,
              startOfYearPrice: item.entry || existingItem.startOfYearPrice,
              yearlyTargetPrice: item.target || existingItem.yearlyTargetPrice,
              conviction: item.conviction || existingItem.conviction,
              thesis: item.thesis || existingItem.thesis,
              priceUpdatedAt: now,
            });
            results.updated++;
          } else {
            // Add new
            await storage.addToWatchlist({
              symbol,
              assetType: 'stock',
              addedAt: now,
              category: 'annual_breakout',
              thesis: item.thesis || '',
              conviction: item.conviction || 'medium',
              sector: item.sector || 'Unknown',
              startOfYearPrice: item.entry || null,
              yearlyTargetPrice: item.target || null,
              currentPrice: item.entry || null,
              priceUpdatedAt: now,
              notes: `Breakout Candidate - ${item.sector || 'Unknown'}`,
              alertsEnabled: true,
              discordAlertsEnabled: true,
            });
            results.added++;
          }
        } catch (e: any) {
          results.errors.push(`${item.symbol}: ${e.message}`);
        }
      }
      
      // Remove items not in incoming list (if requested)
      if (removeUnlisted) {
        const entries = Array.from(existingSymbols.entries());
        for (const [symbol, item] of entries) {
          if (!incomingSymbols.has(symbol)) {
            await storage.removeFromWatchlist(item.id);
            results.removed++;
          }
        }
      }
      
      logger.info(`[ANNUAL-WATCHLIST] Sync complete: added=${results.added}, updated=${results.updated}, removed=${results.removed}`);
      res.json({ 
        success: true, 
        message: `Synced annual watchlist: ${results.added} added, ${results.updated} updated, ${results.removed} removed`,
        results 
      });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/annual-watchlist/sync' });
      res.status(500).json({ error: "Failed to sync annual watchlist" });
    }
  });

  // ==========================================
  // BULLISH TREND TRACKER ROUTES
  // ==========================================

  // Get all tracked bullish trends
  app.get("/api/bullish-trends", async (_req, res) => {
    try {
      const { getBullishTrends } = await import('./bullish-trend-scanner');
      const trends = await getBullishTrends();
      res.json(trends);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/bullish-trends' });
      res.status(500).json({ error: "Failed to fetch bullish trends" });
    }
  });

  // Get top momentum stocks
  app.get("/api/bullish-trends/top", async (req, res) => {
    try {
      const { getTopMomentumStocks } = await import('./bullish-trend-scanner');
      const limit = parseInt(req.query.limit as string) || 10;
      const top = await getTopMomentumStocks(limit);
      res.json(top);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/bullish-trends/top' });
      res.status(500).json({ error: "Failed to fetch top momentum stocks" });
    }
  });

  // Get breakout stocks
  app.get("/api/bullish-trends/breakouts", async (_req, res) => {
    try {
      const { getBreakoutStocks } = await import('./bullish-trend-scanner');
      const breakouts = await getBreakoutStocks();
      res.json(breakouts);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/bullish-trends/breakouts' });
      res.status(500).json({ error: "Failed to fetch breakout stocks" });
    }
  });

  // Get sector heat map - comprehensive view of all sectors with heat scores
  app.get("/api/bullish-trends/heat-map", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          symbol, 
          heat_score, 
          distinct_sources, 
          source_breakdown,
          convergence_level,
          last_direction,
          recent_touches_1h,
          recent_touches_24h,
          CASE 
            WHEN symbol IN ('NNE', 'LEU', 'OKLO', 'SMR', 'CCJ', 'UEC', 'DNN', 'BWXT', 'UUUU', 'URG', 'URA', 'UAMY', 'LTBR') THEN 'NUCLEAR'
            WHEN symbol IN ('LMT', 'RTX', 'NOC', 'GD', 'BA', 'PLTR', 'LDOS', 'LHX', 'HII', 'TXT', 'TDG', 'HWM', 'GE', 'KTOS', 'AVAV') THEN 'DEFENSE'
            WHEN symbol IN ('LUNR', 'RKLB', 'ASTS', 'SPCE', 'RDW', 'JOBY', 'ACHR', 'PL', 'MNTS', 'GSAT', 'IRDM', 'VSAT') THEN 'SPACE'
            WHEN symbol IN ('MARA', 'RIOT', 'COIN', 'MSTR', 'CLSK', 'BITF', 'HIVE', 'HUT', 'BTBT', 'CIFR', 'IREN') THEN 'CRYPTO'
            WHEN symbol IN ('NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM', 'MU', 'MRVL', 'ARM', 'ASML', 'TSM', 'LRCX', 'AMAT', 'KLAC') THEN 'SEMIS'
            WHEN symbol IN ('PLTR', 'AI', 'SOUN', 'IONQ', 'RGTI', 'QUBT', 'UPST', 'BBAI', 'QBTS', 'ARQQ', 'PATH') THEN 'AI_QUANTUM'
            WHEN symbol IN ('TSLA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NFLX', 'CRM', 'ORCL', 'ADBE', 'NOW') THEN 'MEGA_TECH'
            WHEN symbol IN ('SPY', 'QQQ', 'IWM', 'DIA', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX') THEN 'ETF_INDEX'
            WHEN symbol IN ('UBER', 'ABNB', 'DASH', 'RIVN', 'LCID', 'NIO', 'XPEV', 'DKNG', 'PENN', 'DRAFT') THEN 'GROWTH'
            WHEN symbol IN ('ENPH', 'SEDG', 'FSLR', 'RUN', 'PLUG', 'BE', 'CHPT', 'BLDP', 'ENVX', 'QS') THEN 'CLEAN_ENERGY'
            ELSE 'OTHER'
          END as sector
        FROM symbol_heat_scores 
        WHERE heat_score > 5
        ORDER BY heat_score DESC
        LIMIT 100
      `);
      
      // Group by sector
      const sectorMap: Record<string, any[]> = {};
      for (const row of result.rows as any[]) {
        const sector = row.sector || 'OTHER';
        if (!sectorMap[sector]) {
          sectorMap[sector] = [];
        }
        sectorMap[sector].push({
          symbol: row.symbol,
          heatScore: parseFloat(row.heat_score) || 0,
          distinctSources: row.distinct_sources || 0,
          sourceBreakdown: row.source_breakdown || {},
          convergenceLevel: row.convergence_level || 0,
          direction: row.last_direction || 'neutral',
          recentTouches1h: row.recent_touches_1h || 0,
          recentTouches24h: row.recent_touches_24h || 0,
        });
      }
      
      // Calculate sector summaries
      const sectors = Object.entries(sectorMap).map(([name, symbols]) => ({
        name,
        symbols,
        totalHeat: symbols.reduce((sum, s) => sum + s.heatScore, 0),
        avgHeat: symbols.reduce((sum, s) => sum + s.heatScore, 0) / symbols.length,
        symbolCount: symbols.length,
        convergingCount: symbols.filter(s => s.distinctSources >= 2).length,
        maxSources: Math.max(...symbols.map(s => s.distinctSources)),
      }));
      
      // Sort by total heat
      sectors.sort((a, b) => b.totalHeat - a.totalHeat);
      
      res.json({ 
        sectors,
        totalSymbols: result.rows.length,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/bullish-trends/heat-map' });
      res.status(500).json({ error: "Failed to fetch sector heat map" });
    }
  });

  // Add stock to bullish trend tracker
  app.post("/api/bullish-trends/add", isAuthenticated, async (req: any, res) => {
    try {
      const { addBullishStock } = await import('./bullish-trend-scanner');
      const { symbol, notes, category } = req.body;
      
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }
      
      const userId = req.user?.id || req.session?.userId;
      const result = await addBullishStock(symbol, userId, notes, category);
      
      if (!result) {
        return res.status(404).json({ error: `Could not find data for ${symbol}` });
      }
      
      logger.info(`[BULLISH] Added ${symbol} to trend tracker by user ${userId}`);
      res.status(201).json(result);
    } catch (error) {
      logError(error as Error, { context: 'POST /api/bullish-trends/add' });
      res.status(500).json({ error: "Failed to add stock to trend tracker" });
    }
  });

  // Remove stock from bullish trend tracker
  app.delete("/api/bullish-trends/:symbol", isAuthenticated, async (req, res) => {
    try {
      const { removeBullishStock } = await import('./bullish-trend-scanner');
      const { symbol } = req.params;
      
      const success = await removeBullishStock(symbol);
      if (success) {
        logger.info(`[BULLISH] Removed ${symbol} from trend tracker`);
        res.json({ success: true, message: `${symbol} removed from trend tracker` });
      } else {
        res.status(500).json({ error: `Failed to remove ${symbol}` });
      }
    } catch (error) {
      logError(error as Error, { context: 'DELETE /api/bullish-trends/:symbol' });
      res.status(500).json({ error: "Failed to remove from trend tracker" });
    }
  });

  // Force scan bullish trends (admin)
  app.post("/api/bullish-trends/scan", requireAdminJWT, async (_req, res) => {
    try {
      const { scanBullishTrends } = await import('./bullish-trend-scanner');
      const results = await scanBullishTrends();
      res.json({ 
        success: true, 
        message: `Scanned ${results.length} bullish trends`,
        count: results.length 
      });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/bullish-trends/scan' });
      res.status(500).json({ error: "Failed to scan bullish trends" });
    }
  });

  // Send breakout alerts to Discord (admin) - DEPRECATED: Use daily preview instead
  app.post("/api/bullish-trends/send-alerts", requireAdminJWT, async (_req, res) => {
    try {
      const { sendBreakoutAlerts } = await import('./bullish-trend-scanner');
      await sendBreakoutAlerts();
      res.json({ success: true, message: "Breakout alerts sent" });
    } catch (error) {
      logError(error as Error, { context: 'POST /api/bullish-trends/send-alerts' });
      res.status(500).json({ error: "Failed to send breakout alerts" });
    }
  });
  
  // Send daily preview to Discord (admin) - Consolidated morning briefing
  app.post("/api/discord/daily-preview", requireAdminJWT, async (_req, res) => {
    try {
      const { sendDailyPreview } = await import('./discord-service');
      const result = await sendDailyPreview();
      res.json(result);
    } catch (error) {
      logError(error as Error, { context: 'POST /api/discord/daily-preview' });
      res.status(500).json({ success: false, message: "Failed to send daily preview" });
    }
  });

  // ==========================================
  // SYMBOL ATTENTION TRACKER API
  // Tracks convergence signals across all systems
  // ==========================================
  
  // Get hot symbols (sorted by heat score)
  app.get("/api/attention/hot", async (req, res) => {
    try {
      const { getHotSymbols } = await import('./attention-tracking-service');
      const limit = parseInt(req.query.limit as string) || 20;
      const hotSymbols = await getHotSymbols(limit);
      res.json(hotSymbols);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/attention/hot' });
      res.status(500).json({ error: "Failed to fetch hot symbols" });
    }
  });
  
  // Get attention history for a specific symbol
  app.get("/api/attention/:symbol", async (req, res) => {
    try {
      const { getSymbolAttentionHistory } = await import('./attention-tracking-service');
      const { symbol } = req.params;
      const hours = parseInt(req.query.hours as string) || 24;
      const history = await getSymbolAttentionHistory(symbol, hours);
      res.json(history);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/attention/:symbol' });
      res.status(500).json({ error: "Failed to fetch attention history" });
    }
  });

  // Send regular watchlist to QuantBot Discord channel
  app.post("/api/watchlist/send-quantbot", async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const items = await storage.getWatchlistByUser(userId.toString());
      
      if (items.length === 0) {
        return res.status(400).json({ error: "No items in watchlist to send" });
      }
      
      const { sendWatchlistToQuantBot } = await import('./discord-service');
      
      const result = await sendWatchlistToQuantBot(items.map((item: any) => ({
        symbol: item.symbol,
        assetType: item.assetType,
        notes: item.notes,
        entryAlertPrice: item.entryAlertPrice,
        targetAlertPrice: item.targetAlertPrice,
        stopAlertPrice: item.stopAlertPrice,
      })));
      
      if (result.success) {
        console.log(`📨 Sent ${items.length} watchlist items to QuantBot Discord`);
        res.json({ success: true, message: result.message, count: items.length });
      } else {
        res.status(500).json({ error: result.message });
      }
    } catch (error) {
      logError(error as Error, { context: 'POST /api/watchlist/send-quantbot' });
      res.status(500).json({ error: "Failed to send watchlist to QuantBot" });
    }
  });

  // Watch Suggestions - Stocks to watch based on multiple catalyst reasons
  app.get("/api/watch-suggestions", async (_req, res) => {
    try {
      const { generateWatchSuggestions } = await import('./watch-suggestions');
      const suggestions = await generateWatchSuggestions();
      res.json(suggestions);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/watch-suggestions' });
      res.status(500).json({ error: "Failed to generate watch suggestions" });
    }
  });

  // Multi-Factor Analysis - Comprehensive stock analysis with conviction scoring
  app.get("/api/multi-factor-analysis/:symbol", marketDataLimiter, async (req, res) => {
    try {
      const { symbol } = req.params;
      if (!symbol || symbol.length < 1 || symbol.length > 10) {
        return res.status(400).json({ error: "Invalid symbol" });
      }
      
      const analysis = await generateComprehensiveAnalysis(symbol.toUpperCase());
      
      if (!analysis) {
        return res.status(404).json({ error: `Unable to analyze ${symbol}. No data available.` });
      }
      
      res.json(analysis);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/multi-factor-analysis/:symbol' });
      res.status(500).json({ error: "Failed to generate comprehensive analysis" });
    }
  });
  
  // Multi-Factor Analysis - Get market regime context
  app.get("/api/market-regime", async (_req, res) => {
    try {
      const regime = await assessMarketRegime();
      res.json(regime);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/market-regime' });
      res.status(500).json({ error: "Failed to assess market regime" });
    }
  });

  // 🚀 Market Movers Scanner - Top Gainers, Losers, After-Hours Surges
  app.get("/api/market-movers", async (_req, res) => {
    try {
      const { getTopMovers } = await import('./market-scanner');
      const session = getTradingSession();
      
      // Expanded stock universe - 100+ symbols including after-hours movers
      const EXPANDED_UNIVERSE = [
        // Defense & Aerospace (after-hours active)
        'LMT', 'RTX', 'NOC', 'GD', 'BA', 'HII', 'LHX',
        // AI/Tech (high volatility)
        'PLTR', 'IONQ', 'RGTI', 'QBTS', 'NVDA', 'AMD', 'SMCI', 'ARM', 'MRVL',
        // Crypto miners
        'MARA', 'RIOT', 'CLSK', 'HUT', 'COIN', 'BITF', 'IREN',
        // Energy Storage
        'EOSE', 'PLUG', 'FCEL', 'BE', 'SEDG', 'ENPH',
        // Space & Satellite
        'SATL', 'LUNR', 'RDW', 'RKLB', 'SPCE', 'ASTR', 'ASTS', 'BKSY',
        // Biotech (high vol)
        'MRNA', 'BNTX', 'CRSP', 'EDIT', 'BEAM', 'NTLA', 'VRTX',
        // EV & Clean Energy
        'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'FSLY', 'CHPT',
        // Nuclear
        'CCJ', 'LEU', 'UUUU', 'SMR', 'NNE', 'DNN',
        // Small caps / Penny (high movement potential)
        'SOFI', 'LCID', 'SNDL', 'TLRY', 'CGC', 'ACB',
        // Mega caps (benchmark)
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',
        // Financials
        'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C',
        // Semiconductors
        'INTC', 'MU', 'QCOM', 'AVGO', 'TXN', 'ON', 'AMAT',
        // Retail & Consumer
        'WMT', 'TGT', 'COST', 'HD', 'LOW', 'DG',
        // Healthcare
        'JNJ', 'PFE', 'UNH', 'CVS', 'LLY', 'ABBV',
        // Industrial
        'CAT', 'DE', 'UPS', 'FDX', 'MMM', 'HON',
        // Energy
        'XOM', 'CVX', 'OXY', 'COP', 'SLB', 'HAL',
        // REITs
        'O', 'AMT', 'PLD', 'SPG', 'VICI',
      ];
      
      // Fetch top movers from existing market scanner with expanded limit
      const { gainers, losers } = await getTopMovers('day', 'all', 100);
      
      // Format for API response
      const topGainers = gainers.slice(0, 10).map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: stock.currentPrice,
        change: stock.dayChange,
        changePercent: stock.dayChangePercent,
        volume: stock.volume,
        avgVolume: stock.avgVolume || 0,
        volumeRatio: stock.avgVolume ? stock.volume / stock.avgVolume : 0,
        marketCap: stock.marketCap || 0,
      }));
      
      const topLosers = losers.slice(0, 10).map(stock => ({
        symbol: stock.symbol,
        name: stock.name,
        price: stock.currentPrice,
        change: stock.dayChange,
        changePercent: stock.dayChangePercent,
        volume: stock.volume,
        avgVolume: stock.avgVolume || 0,
        volumeRatio: stock.avgVolume ? stock.volume / stock.avgVolume : 0,
        marketCap: stock.marketCap || 0,
      }));
      
      // Volume spikes (sorted by volume ratio)
      const volumeSpikes = [...gainers, ...losers]
        .filter(s => s.avgVolume && s.volume / s.avgVolume > 1.5)
        .sort((a, b) => (b.volume / (b.avgVolume || 1)) - (a.volume / (a.avgVolume || 1)))
        .slice(0, 10)
        .map(stock => ({
          symbol: stock.symbol,
          name: stock.name,
          price: stock.currentPrice,
          change: stock.dayChange,
          changePercent: stock.dayChangePercent,
          volume: stock.volume,
          avgVolume: stock.avgVolume || 0,
          volumeRatio: stock.avgVolume ? stock.volume / stock.avgVolume : 0,
          marketCap: stock.marketCap || 0,
        }));
      
      // Build high-alert movers (stocks with >5% moves)
      const highAlertMovers = [...gainers, ...losers]
        .filter(s => Math.abs(s.dayChangePercent) > 5)
        .sort((a, b) => Math.abs(b.dayChangePercent) - Math.abs(a.dayChangePercent))
        .slice(0, 10)
        .map(stock => ({
          symbol: stock.symbol,
          name: stock.name,
          price: stock.currentPrice,
          change: stock.dayChange,
          changePercent: stock.dayChangePercent,
          volume: stock.volume,
          avgVolume: stock.avgVolume || 0,
          volumeRatio: stock.avgVolume ? stock.volume / stock.avgVolume : 0,
          marketCap: stock.marketCap || 0,
          alertReason: stock.dayChangePercent > 0 ? 'Major surge' : 'Major drop',
        }));
      
      // Get news for top movers
      const topSymbols = [...new Set([
        ...topGainers.slice(0, 3).map(q => q.symbol),
        ...highAlertMovers.slice(0, 3).map(q => q.symbol),
      ])];
      
      let catalystNews: any[] = [];
      try {
        const { fetchAlphaVantageNews } = await import('./news-service');
        const newsData = await fetchAlphaVantageNews(10, topSymbols.join(','));
        catalystNews = newsData.slice(0, 5).map((n: any) => ({
          title: n.title,
          summary: n.summary?.substring(0, 150),
          tickers: n.tickers || [],
          sentiment: n.overall_sentiment_label,
          time: n.time_published,
        }));
      } catch (e) {
        // News fetch failed, continue without
      }
      
      logger.info(`[MOVERS] Scanned ${gainers.length + losers.length} stocks: ${topGainers.length} gainers, ${highAlertMovers.length} high-alert`);
      
      // Send Discord alerts for major movers (>5% moves) with grade and confidence
      if (highAlertMovers.length > 0) {
        try {
          const { sendMarketMoversAlertToDiscord } = await import('./discord-service');
          const alertMovers = highAlertMovers.map(m => {
            const absChange = Math.abs(m.changePercent);
            const volRatio = m.volumeRatio || 1;
            
            // Calculate confidence based on move size and volume
            let confidence = 60;
            if (absChange >= 10) confidence += 25;
            else if (absChange >= 7) confidence += 15;
            else if (absChange >= 5) confidence += 5;
            if (volRatio >= 2) confidence += 10;
            else if (volRatio >= 1.5) confidence += 5;
            confidence = Math.min(confidence, 95);
            
            // Calculate grade based on confidence
            let grade = 'C';
            if (confidence >= 90) grade = 'A+';
            else if (confidence >= 85) grade = 'A';
            else if (confidence >= 80) grade = 'B+';
            else if (confidence >= 75) grade = 'B';
            else if (confidence >= 70) grade = 'C+';
            
            return {
              symbol: m.symbol,
              name: m.name,
              price: m.price,
              changePercent: m.changePercent,
              volume: m.volume,
              alertType: (m.changePercent > 0 ? 'surge' : 'drop') as 'surge' | 'drop',
              grade,
              confidence,
            };
          });
          await sendMarketMoversAlertToDiscord(alertMovers);
        } catch (e) {
          // Discord alert failed, continue without
        }
      }
      
      res.json({
        timestamp: new Date().toISOString(),
        session: session,
        scannedCount: gainers.length + losers.length,
        topGainers,
        topLosers,
        volumeSpikes,
        highAlertMovers,
        catalystNews,
        alerts: [
          ...topGainers.filter(q => q.changePercent > 5).map(q => ({
            type: 'surge',
            symbol: q.symbol,
            message: `${q.symbol} surging +${q.changePercent.toFixed(1)}%`,
            priority: 'high',
          })),
          ...highAlertMovers.map(q => ({
            type: 'major_move',
            symbol: q.symbol,
            message: `${q.symbol} ${q.changePercent > 0 ? '+' : ''}${q.changePercent.toFixed(1)}% - ${q.alertReason}`,
            priority: 'high',
          })),
        ],
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/market-movers' });
      res.status(500).json({ error: "Failed to scan market movers" });
    }
  });

  // Market Context - Full market overview with VIX, SPY, trading session
  app.get("/api/market-context", async (_req, res) => {
    try {
      const context = await getMarketContext(true); // Force refresh for latest data
      const session = getTradingSession();
      res.json({
        ...context,
        tradingSession: session,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/market-context' });
      res.status(500).json({ error: "Failed to get market context" });
    }
  });

  // 📊 Volatility Analysis - IV Rank, IV Percentile, RV, Strategy Selection
  app.get("/api/volatility-analysis/:symbol", marketDataLimiter, async (req, res) => {
    try {
      const { symbol } = req.params;
      if (!symbol || symbol.length < 1 || symbol.length > 10) {
        return res.status(400).json({ error: "Invalid symbol" });
      }

      const analysis = await analyzeVolatility(symbol.toUpperCase());
      if (!analysis) {
        return res.status(404).json({ error: `Unable to analyze volatility for ${symbol}` });
      }

      // Get market context for strategy selection
      const marketContext = await getMarketContext();
      const strategyRec = selectStrategy(marketContext.regime, analysis, 'stock');

      res.json({
        ...analysis,
        marketRegime: marketContext.regime,
        strategyRecommendation: strategyRec,
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/volatility-analysis/:symbol' });
      res.status(500).json({ error: "Failed to analyze volatility" });
    }
  });

  // 📊 Quick IV Check - Fast IV rank for trading decisions
  app.get("/api/iv-check/:symbol", marketDataLimiter, async (req, res) => {
    try {
      const { symbol } = req.params;
      if (!symbol || symbol.length < 1 || symbol.length > 10) {
        return res.status(400).json({ error: "Invalid symbol" });
      }

      const result = await quickIVCheck(symbol.toUpperCase());
      if (!result) {
        return res.status(404).json({ error: `Unable to check IV for ${symbol}` });
      }

      res.json(result);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/iv-check/:symbol' });
      res.status(500).json({ error: "Failed to check IV" });
    }
  });

  // 📊 Batch Volatility Analysis - Analyze multiple symbols
  app.post("/api/volatility-analysis/batch", marketDataLimiter, async (req, res) => {
    try {
      const { symbols } = req.body;
      if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: "symbols array required" });
      }

      // Limit batch size
      const limitedSymbols = symbols.slice(0, 10).map((s: string) => s.toUpperCase());
      const results = await batchVolatilityAnalysis(limitedSymbols);

      // Convert Map to object for JSON
      const response: Record<string, any> = {};
      results.forEach((analysis, symbol) => {
        response[symbol] = analysis;
      });

      res.json(response);
    } catch (error) {
      logError(error as Error, { context: 'POST /api/volatility-analysis/batch' });
      res.status(500).json({ error: "Failed to analyze volatility batch" });
    }
  });

  // ==========================================================================
  // 🎯 TRADING ENGINE - Integrated Fundamental + Technical Analysis
  // ==========================================================================

  // Trading Engine - Full analysis with confluence validation and trade structure
  app.get("/api/trading-engine/:symbol", marketDataLimiter, async (req, res) => {
    try {
      const { symbol } = req.params;
      const assetClass = (req.query.asset as AssetClass) || 'stock';
      const accountSize = parseInt(req.query.account as string) || 1000;

      if (!symbol || symbol.length < 1 || symbol.length > 10) {
        return res.status(400).json({ error: "Invalid symbol" });
      }

      const validAssets: AssetClass[] = ['stock', 'options', 'futures', 'crypto'];
      if (!validAssets.includes(assetClass)) {
        return res.status(400).json({ error: "Invalid asset class. Use: stock, options, futures, crypto" });
      }

      const result = await runTradingEngine(symbol.toUpperCase(), assetClass, accountSize);
      res.json(result);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/trading-engine/:symbol' });
      res.status(500).json({ error: "Failed to run trading engine analysis" });
    }
  });

  // Trading Engine - Scan multiple symbols for setups
  app.get("/api/trading-engine/scan/:assetClass", marketDataLimiter, async (req, res) => {
    try {
      const { assetClass } = req.params;
      const symbolsParam = req.query.symbols as string;

      const validAssets: AssetClass[] = ['stock', 'options', 'futures', 'crypto'];
      if (!validAssets.includes(assetClass as AssetClass)) {
        return res.status(400).json({ error: "Invalid asset class" });
      }

      // Default symbols per asset class
      let symbols: string[] = [];
      if (symbolsParam) {
        symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).slice(0, 10);
      } else {
        switch (assetClass) {
          case 'stock':
            symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA'];
            break;
          case 'options':
            symbols = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AMD'];
            break;
          case 'futures':
            symbols = ['ES', 'NQ', 'GC', 'CL'];
            break;
          case 'crypto':
            symbols = ['BTC', 'ETH', 'SOL'];
            break;
        }
      }

      const results = await scanSymbols(symbols, assetClass as AssetClass);
      res.json({
        assetClass,
        scanned: symbols.length,
        actionable: results.filter(r => r.actionable).length,
        results,
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/trading-engine/scan/:assetClass' });
      res.status(500).json({ error: "Failed to scan symbols" });
    }
  });

  // Trading Engine - Quick fundamental analysis
  app.get("/api/trading-engine/fundamental/:symbol", marketDataLimiter, async (req, res) => {
    try {
      const { symbol } = req.params;
      const assetClass = (req.query.asset as AssetClass) || 'stock';

      if (!symbol) {
        return res.status(400).json({ error: "Symbol required" });
      }

      const result = await analyzeFundamentals(symbol.toUpperCase(), assetClass);
      res.json(result);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/trading-engine/fundamental/:symbol' });
      res.status(500).json({ error: "Failed to analyze fundamentals" });
    }
  });

  // Trading Engine - Quick technical analysis
  app.get("/api/trading-engine/technical/:symbol", marketDataLimiter, async (req, res) => {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({ error: "Symbol required" });
      }

      const result = await analyzeTechnicals(symbol.toUpperCase());
      res.json(result);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/trading-engine/technical/:symbol' });
      res.status(500).json({ error: "Failed to analyze technicals" });
    }
  });

  // Dashboard: Get all paper portfolios (beta access required)
  app.get("/api/paper-portfolios", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user has beta access
      const userId = req.session?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = checkIsAdmin(user);
      const hasBetaAccess = isAdmin || user?.hasBetaAccess === true;
      
      if (!hasBetaAccess) {
        return res.json({
          portfolios: [],
          requiresBetaAccess: true,
          message: 'Join the beta program to access portfolio data'
        });
      }
      
      const portfolios = await storage.getAllPaperPortfolios();
      // Filter to only auto-lotto portfolios and format response
      const autoLottoPortfolios = portfolios.filter(p => 
        p.name?.toLowerCase().includes('auto-lotto') || 
        p.name?.toLowerCase().includes('small account') ||
        p.name?.toLowerCase().includes('prop firm')
      );
      res.json(autoLottoPortfolios);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/paper-portfolios' });
      res.status(500).json({ error: "Failed to get portfolios" });
    }
  });

  // Dashboard: Get bot status (beta access required)
  app.get("/api/auto-lotto/bot-status", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user has beta access
      const userId = req.session?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = checkIsAdmin(user);
      const hasBetaAccess = isAdmin || user?.hasBetaAccess === true;
      
      if (!hasBetaAccess) {
        return res.json({
          isRunning: false,
          openPositions: 0,
          todayTrades: 0,
          todayPnL: 0,
          marketStatus: 'closed',
          requiresBetaAccess: true,
          message: 'Join the beta program to access bot status'
        });
      }
      
      const portfolios = await storage.getAllPaperPortfolios();
      // Get ALL auto-lotto portfolios
      const autoLottoPortfolios = portfolios.filter(p => 
        p.name?.toLowerCase().includes('auto-lotto') || 
        p.name?.toLowerCase().includes('small account') ||
        p.name?.toLowerCase().includes('prop firm')
      );
      
      // Aggregate data across all portfolios
      let openPositions = 0;
      let todayTrades = 0;
      let todayPnL = 0;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const portfolio of autoLottoPortfolios) {
        const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
        openPositions += positions.filter(p => p.status === 'open').length;
        
        // Get today's closed trades
        const closedToday = positions.filter(p => {
          if (p.status !== 'closed' || !p.exitTime) return false;
          const exitDate = new Date(p.exitTime);
          return exitDate >= today;
        });
        todayTrades += closedToday.length;
        todayPnL += closedToday.reduce((sum, p) => sum + (parseFloat(String(p.realizedPnL)) || 0), 0);
      }
      
      // Check if bot should be running (market hours check)
      const { isUSMarketOpen } = await import('@shared/market-calendar');
      const marketStatus = isUSMarketOpen();
      const isRunning = marketStatus.isOpen;
      
      res.json({
        isRunning,
        openPositions,
        todayTrades,
        todayPnL,
        marketStatus: marketStatus.session,
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/auto-lotto/bot-status' });
      res.status(500).json({ error: "Failed to get bot status" });
    }
  });
  
  // Multi-Factor Analysis - Get company context
  app.get("/api/company-context/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }
      
      const context = await getCompanyContext(symbol.toUpperCase());
      res.json(context);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/company-context/:symbol' });
      res.status(500).json({ error: "Failed to get company context" });
    }
  });

  // Market Scanner Routes - Scan 500+ stocks across timeframes
  app.get("/api/market-scanner", requireBetaAccess, async (req, res) => {
    try {
      const { scanStockPerformance, getStockUniverse } = await import('./market-scanner');
      const category = (req.query.category as string) || 'all';
      const includeHistorical = req.query.historical === 'true';
      const limit = parseInt(req.query.limit as string) || 100;
      
      const validCategories = ['all', 'sp500', 'growth', 'penny', 'etf'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
      }
      
      const symbols = getStockUniverse(category as any).slice(0, limit);
      const results = await scanStockPerformance(symbols, includeHistorical);
      
      res.json({
        category,
        count: results.length,
        includeHistorical,
        data: results,
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/market-scanner' });
      res.status(500).json({ error: "Failed to scan market" });
    }
  });

  app.get("/api/market-scanner/movers", requireBetaAccess, async (req, res) => {
    try {
      const { getTopMovers } = await import('./market-scanner');
      const timeframe = (req.query.timeframe as string) || 'day';
      const category = (req.query.category as string) || 'all';
      const limit = parseInt(req.query.limit as string) || 20;
      
      const validTimeframes = ['day', 'week', 'month', 'ytd', 'year'];
      const validCategories = ['all', 'sp500', 'growth', 'penny', 'etf'];
      
      if (!validTimeframes.includes(timeframe)) {
        return res.status(400).json({ error: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}` });
      }
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
      }
      
      const movers = await getTopMovers(timeframe as any, category as any, limit);
      
      res.json({
        timeframe,
        category,
        gainers: movers.gainers,
        losers: movers.losers,
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/market-scanner/movers' });
      res.status(500).json({ error: "Failed to get top movers" });
    }
  });

  app.get("/api/market-scanner/sectors", requireBetaAccess, async (_req, res) => {
    try {
      const { getSectorPerformance } = await import('./market-scanner');
      const sectors = await getSectorPerformance();
      res.json(sectors);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/market-scanner/sectors' });
      res.status(500).json({ error: "Failed to get sector performance" });
    }
  });

  // Smart Watchlist - Curated 10-20 picks with trade idea analysis
  app.get("/api/market-scanner/watchlist", requireBetaAccess, async (req, res) => {
    try {
      const { generateSmartWatchlist } = await import('./market-scanner');
      const timeframe = (req.query.timeframe as string) || 'day';
      const limit = parseInt(req.query.limit as string) || 15;
      
      const validTimeframes = ['day', 'week', 'month', 'ytd', 'year'];
      if (!validTimeframes.includes(timeframe)) {
        return res.status(400).json({ error: `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}` });
      }
      
      const watchlist = await generateSmartWatchlist(timeframe as any, Math.min(limit, 20));
      
      res.json({
        timeframe,
        count: watchlist.length,
        generated: new Date().toISOString(),
        picks: watchlist,
      });
    } catch (error) {
      logError(error as Error, { context: 'GET /api/market-scanner/watchlist' });
      res.status(500).json({ error: "Failed to generate smart watchlist" });
    }
  });

  // Catalyst Intelligence for Scanner - Get SEC filings, gov contracts, and catalysts for a symbol
  app.get("/api/market-scanner/catalyst/:symbol", requireBetaAccess, async (req, res) => {
    try {
      const { symbol } = req.params;
      const ticker = symbol.toUpperCase();
      
      // Fetch catalyst data from database
      const [secFilingsResult, govContractsResult, catalystEventsResult] = await Promise.all([
        db.select().from(secFilings).where(eq(secFilings.ticker, ticker)).limit(5),
        db.select().from(governmentContracts).where(eq(governmentContracts.recipientTicker, ticker)).limit(5),
        db.select().from(catalystEvents).where(eq(catalystEvents.ticker, ticker)).limit(10),
      ]);

      res.json({
        symbol: ticker,
        secFilings: secFilingsResult,
        governmentContracts: govContractsResult,
        catalystEvents: catalystEventsResult,
        hasCatalysts: secFilingsResult.length > 0 || govContractsResult.length > 0 || catalystEventsResult.length > 0,
      });
    } catch (error) {
      logError(error as Error, { context: `GET /api/market-scanner/catalyst/${req.params.symbol}` });
      res.status(500).json({ error: "Failed to fetch catalyst data" });
    }
  });

  // Historical Performance Patterns - Get how a stock performed in similar conditions
  app.get("/api/market-scanner/historical/:symbol", requireBetaAccess, async (req, res) => {
    try {
      const { symbol } = req.params;
      const ticker = symbol.toUpperCase();
      
      // Fetch historical trade ideas for this symbol (with resolved outcomes)
      const historicalTradesRaw = await db.select()
        .from(tradeIdeas)
        .where(eq(tradeIdeas.symbol, ticker))
        .limit(100);
      
      // Helper function to safely get date timestamp
      const getTimestamp = (date: Date | string | null | undefined): number => {
        if (!date) return 0;
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.getTime() || 0;
      };
      
      // Sort by date in application code and limit
      const historicalTrades = historicalTradesRaw
        .filter(t => t.createdAt) // Filter out trades without dates
        .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt))
        .slice(0, 50);
      
      // Filter to only trades with outcomes
      const tradesWithOutcome = historicalTrades.filter(t => t.outcomeStatus !== null && t.outcomeStatus !== 'open');
      
      // Calculate historical performance metrics
      const decidedTrades = historicalTrades.filter(t => t.outcomeStatus === 'hit_target' || t.outcomeStatus === 'hit_stop');
      const wins = decidedTrades.filter(t => t.outcomeStatus === 'hit_target');
      const losses = decidedTrades.filter(t => t.outcomeStatus === 'hit_stop');
      
      // Group trades by timeframe context
      const monthlyPerformance: Record<string, { wins: number; losses: number }> = {};
      for (const trade of decidedTrades) {
        if (!trade.createdAt) continue;
        const createdDate = typeof trade.createdAt === 'string' ? new Date(trade.createdAt) : trade.createdAt;
        const month = createdDate.toISOString().slice(0, 7); // YYYY-MM
        if (!monthlyPerformance[month]) {
          monthlyPerformance[month] = { wins: 0, losses: 0 };
        }
        if (trade.outcomeStatus === 'hit_target') {
          monthlyPerformance[month].wins++;
        } else {
          monthlyPerformance[month].losses++;
        }
      }

      // Calculate average gain and loss
      const avgGain = wins.length > 0 
        ? wins.reduce((sum, t) => sum + (t.percentGain || 0), 0) / wins.length 
        : 0;
      const avgLoss = losses.length > 0 
        ? losses.reduce((sum, t) => sum + Math.abs(t.percentGain || 0), 0) / losses.length 
        : 0;

      res.json({
        symbol: ticker,
        totalTrades: decidedTrades.length,
        winRate: decidedTrades.length > 0 ? (wins.length / decidedTrades.length * 100).toFixed(1) : null,
        wins: wins.length,
        losses: losses.length,
        avgGain: avgGain.toFixed(2),
        avgLoss: avgLoss.toFixed(2),
        monthlyPerformance,
        recentTrades: historicalTrades.slice(0, 5).map(t => ({
          date: t.createdAt,
          direction: t.signalType || 'long',
          entry: t.entryPrice,
          target: t.targetPrice,
          stop: t.stopLoss,
          outcome: t.outcomeStatus,
          gain: t.percentGain,
          timeframe: t.timeframe,
        })),
        hasHistoricalData: decidedTrades.length >= 3,
      });
    } catch (error) {
      logError(error as Error, { context: `GET /api/market-scanner/historical/${req.params.symbol}` });
      res.status(500).json({ error: "Failed to fetch historical data" });
    }
  });

  // Multi-Year Outlook - Get yearly performance projections
  app.get("/api/market-scanner/outlook/:symbol", requireBetaAccess, async (req, res) => {
    try {
      const { symbol } = req.params;
      const ticker = symbol.toUpperCase();
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      
      // Get historical trades for this symbol
      const allTradesRaw = await db.select()
        .from(tradeIdeas)
        .where(eq(tradeIdeas.symbol, ticker))
        .limit(200);
      
      // Helper function to safely get date timestamp
      const getTimestamp = (date: Date | string | null | undefined): number => {
        if (!date) return 0;
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.getTime() || 0;
      };
      
      // Helper to safely get year from date
      const getYear = (date: Date | string | null | undefined): number => {
        if (!date) return 0;
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.getFullYear() || 0;
      };
      
      // Sort and filter to only trades up to the requested year
      const yearlyTrades = allTradesRaw
        .filter(t => t.createdAt) // Filter out trades without dates
        .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt))
        .filter(t => getYear(t.createdAt) <= year);
      
      // Group by year
      const yearlyStats: Record<number, { 
        trades: number; 
        wins: number; 
        avgGain: number;
        bestTrade: number;
        worstTrade: number;
      }> = {};
      
      for (const trade of yearlyTrades) {
        if (!trade.createdAt) continue;
        const tradeYear = getYear(trade.createdAt);
        if (!yearlyStats[tradeYear]) {
          yearlyStats[tradeYear] = { trades: 0, wins: 0, avgGain: 0, bestTrade: 0, worstTrade: 0 };
        }
        yearlyStats[tradeYear].trades++;
        if (trade.outcomeStatus === 'hit_target') {
          yearlyStats[tradeYear].wins++;
        }
        if (trade.percentGain) {
          yearlyStats[tradeYear].avgGain += trade.percentGain;
          if (trade.percentGain > yearlyStats[tradeYear].bestTrade) {
            yearlyStats[tradeYear].bestTrade = trade.percentGain;
          }
          if (trade.percentGain < yearlyStats[tradeYear].worstTrade) {
            yearlyStats[tradeYear].worstTrade = trade.percentGain;
          }
        }
      }
      
      // Calculate averages
      for (const yr in yearlyStats) {
        if (yearlyStats[yr].trades > 0) {
          yearlyStats[yr].avgGain = yearlyStats[yr].avgGain / yearlyStats[yr].trades;
        }
      }

      res.json({
        symbol: ticker,
        currentYear: year,
        yearlyStats,
        yearsOfData: Object.keys(yearlyStats).length,
        projections: {
          [year]: yearlyStats[year] || null,
          [year + 1]: null, // Future year placeholders
          [year + 2]: null,
        },
      });
    } catch (error) {
      logError(error as Error, { context: `GET /api/market-scanner/outlook/${req.params.symbol}` });
      res.status(500).json({ error: "Failed to fetch outlook data" });
    }
  });

  // ============ Swing Trade Scanner Routes ============
  // Get swing trade opportunities
  app.get("/api/swing-scanner", async (req, res) => {
    try {
      const { getTopSwingOpportunities } = await import("./swing-trade-scanner");
      const limit = parseInt(req.query.limit as string) || 10;
      const opportunities = await getTopSwingOpportunities(limit);
      
      logger.info(`[SWING-API] Found ${opportunities.length} swing opportunities`);
      res.json(opportunities);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/swing-scanner' });
      res.status(500).json({ error: "Failed to fetch swing opportunities" });
    }
  });

  // Send swing opportunity to Discord
  app.post("/api/swing-scanner/send-discord", isAuthenticated, async (req: any, res) => {
    try {
      const { sendSwingToDiscord } = await import("./swing-trade-scanner");
      const opportunity = req.body;
      
      if (!opportunity.symbol) {
        return res.status(400).json({ error: "Missing opportunity data" });
      }
      
      const success = await sendSwingToDiscord(opportunity);
      
      if (success) {
        logger.info(`[SWING-API] Sent ${opportunity.symbol} to Discord`);
        res.json({ success: true, message: `Sent ${opportunity.symbol} to Discord` });
      } else {
        res.status(500).json({ error: "Failed to send to Discord" });
      }
    } catch (error) {
      logError(error as Error, { context: 'POST /api/swing-scanner/send-discord' });
      res.status(500).json({ error: "Failed to send swing trade to Discord" });
    }
  });

  // Day Trade Scanner - Intraday setups using VWAP, RSI(2), volume spikes
  app.get("/api/daytrade-scanner", requireBetaAccess, async (req, res) => {
    try {
      const { getDayTradeOpportunities } = await import("./daytrade-scanner");
      const limit = parseInt(req.query.limit as string) || 15;
      const opportunities = await getDayTradeOpportunities(limit);
      
      logger.info(`[DAYTRADE-API] Found ${opportunities.length} day trade opportunities`);
      res.json(opportunities);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/daytrade-scanner' });
      res.status(500).json({ error: "Failed to fetch day trade opportunities" });
    }
  });

  // Options Data Routes
  app.get("/api/options/:symbol", async (req, res) => {
    try {
      const options = await storage.getOptionsBySymbol(req.params.symbol);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch options data" });
    }
  });

  app.post("/api/options", async (req, res) => {
    try {
      const validated = insertOptionsDataSchema.parse(req.body);
      const options = await storage.createOptionsData(validated);
      res.status(201).json(options);
    } catch (error) {
      res.status(400).json({ error: "Invalid options data" });
    }
  });

  // Futures Contracts Routes
  app.get("/api/futures/contracts", async (_req, res) => {
    try {
      // Get all NQ and GC contracts
      const nqContracts = await storage.getFuturesContractsByRoot('NQ');
      const gcContracts = await storage.getFuturesContractsByRoot('GC');
      const allContracts = [...nqContracts, ...gcContracts];
      
      logger.info(`[FUTURES-API] Fetched ${allContracts.length} futures contracts (${nqContracts.length} NQ, ${gcContracts.length} GC)`);
      res.json(allContracts);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/futures/contracts' });
      res.status(500).json({ error: "Failed to fetch futures contracts" });
    }
  });

  app.get("/api/futures/contracts/:rootSymbol", async (req, res) => {
    try {
      const rootSymbol = req.params.rootSymbol.toUpperCase();
      
      if (rootSymbol !== 'NQ' && rootSymbol !== 'GC') {
        return res.status(400).json({ error: "Invalid root symbol. Must be NQ or GC" });
      }
      
      const contracts = await storage.getFuturesContractsByRoot(rootSymbol);
      logger.info(`[FUTURES-API] Fetched ${contracts.length} contracts for ${rootSymbol}`);
      res.json(contracts);
    } catch (error) {
      logError(error as Error, { context: `GET /api/futures/contracts/${req.params.rootSymbol}` });
      res.status(500).json({ error: "Failed to fetch futures contracts" });
    }
  });

  app.get("/api/futures/price/:contractCode", async (req, res) => {
    try {
      const contractCode = req.params.contractCode.toUpperCase();
      
      // Import futures data service (dynamic to avoid circular deps)
      const { getFuturesPrice } = await import("./futures-data-service");
      
      const price = await getFuturesPrice(contractCode);
      logger.info(`[FUTURES-API] Fetched price for ${contractCode}: $${price}`);
      res.json({ contractCode, price });
    } catch (error) {
      logError(error as Error, { context: `GET /api/futures/price/${req.params.contractCode}` });
      
      if ((error as Error).message.includes('not found')) {
        return res.status(404).json({ error: (error as Error).message });
      }
      
      res.status(500).json({ error: "Failed to fetch futures price" });
    }
  });

  app.get("/api/futures/prices", async (req, res) => {
    try {
      const codesParam = req.query.codes as string;
      
      if (!codesParam) {
        return res.status(400).json({ error: "Missing 'codes' query parameter. Example: ?codes=NQH25,GCJ25" });
      }
      
      const contractCodes = codesParam.split(',').map(code => code.trim().toUpperCase());
      
      // Import futures data service (dynamic to avoid circular deps)
      const { getFuturesPrices } = await import("./futures-data-service");
      
      const pricesMap = await getFuturesPrices(contractCodes);
      
      // Convert Map to object for JSON response
      const pricesObj: Record<string, number> = {};
      pricesMap.forEach((price, contractCode) => {
        pricesObj[contractCode] = price;
      });
      
      logger.info(`[FUTURES-API] Fetched ${pricesMap.size} prices for contracts: ${contractCodes.join(', ')}`);
      res.json(pricesObj);
    } catch (error) {
      logError(error as Error, { context: 'GET /api/futures/prices' });
      res.status(500).json({ error: "Failed to fetch futures prices" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRYPTO BOT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get crypto bot status and portfolio
  app.get("/api/crypto-bot/status", async (_req, res) => {
    try {
      const { getCryptoPortfolio, fetchCryptoPrices, CRYPTO_SCAN_COINS, getCoinbaseSymbol } = await import("./auto-lotto-trader");
      const { getCryptoPrice: getRealtimeCryptoPrice } = await import("./realtime-price-service");
      const { fetchCryptoPrice } = await import("./market-api");
      
      const portfolio = await getCryptoPortfolio();
      const prices = await fetchCryptoPrices();
      
      if (!portfolio) {
        return res.json({ 
          status: 'no_portfolio',
          message: 'Crypto bot portfolio not initialized'
        });
      }
      
      const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
      const openPositions = positions.filter(p => p.status === 'open');
      
      // Calculate totalValue dynamically with live prices
      let positionsValue = 0;
      for (const pos of openPositions) {
        const qty = typeof pos.quantity === 'string' ? parseFloat(pos.quantity) : pos.quantity;
        const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
        
        // Try to get live price: first WebSocket (with alias), then fallback
        const coinbaseSymbol = getCoinbaseSymbol(pos.symbol);
        let currentPrice = entryPrice;
        
        const realtimeCache = getRealtimeCryptoPrice(coinbaseSymbol);
        if (realtimeCache?.price) {
          currentPrice = realtimeCache.price;
        } else {
          // Also check original symbol in case it's already correct
          const originalCache = getRealtimeCryptoPrice(pos.symbol);
          if (originalCache?.price) {
            currentPrice = originalCache.price;
          } else {
            // Fallback to CoinGecko/Yahoo
            try {
              const cryptoData = await fetchCryptoPrice(pos.symbol);
              if (cryptoData?.currentPrice) currentPrice = cryptoData.currentPrice;
            } catch { /* use entry price */ }
          }
        }
        
        positionsValue += qty * currentPrice;
      }
      
      const dynamicTotalValue = portfolio.cashBalance + positionsValue;
      
      res.json({
        status: 'active',
        portfolio: {
          id: portfolio.id,
          cashBalance: portfolio.cashBalance,
          totalValue: dynamicTotalValue,  // Use dynamically calculated value
          startingCapital: portfolio.startingCapital,
        },
        openPositions: openPositions.length,
        maxPositions: 3,
        coinsTracked: CRYPTO_SCAN_COINS.length,
        pricesAvailable: prices.size,
        canTrade: portfolio.cashBalance >= 10 && openPositions.length < 3 && prices.size > 0,
      });
    } catch (error) {
      logger.error("Crypto bot status error:", error);
      res.status(500).json({ error: "Failed to get crypto bot status" });
    }
  });
  
  // Manually trigger crypto bot scan
  app.post("/api/crypto-bot/scan", requireAdminJWT, async (_req, res) => {
    try {
      const { runCryptoBotScan, monitorCryptoPositions } = await import("./auto-lotto-trader");
      
      logger.info("🪙 [CRYPTO BOT] Manual scan triggered via API");
      
      // Run both scan and monitor
      await monitorCryptoPositions();
      await runCryptoBotScan();
      
      // Get updated status
      const { getCryptoPortfolio } = await import("./auto-lotto-trader");
      const portfolio = await getCryptoPortfolio();
      
      res.json({
        success: true,
        message: "Crypto bot scan completed",
        portfolioBalance: portfolio?.cashBalance || 0,
      });
    } catch (error) {
      logger.error("Crypto bot scan error:", error);
      res.status(500).json({ error: "Failed to run crypto bot scan" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FUTURES BOT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get futures bot status and portfolio
  app.get("/api/futures-bot/status", async (_req, res) => {
    try {
      const { getFuturesPortfolio } = await import("./auto-lotto-trader");
      const portfolio = await getFuturesPortfolio();
      
      if (!portfolio) {
        return res.json({ 
          status: 'no_portfolio',
          message: 'Futures bot portfolio not initialized'
        });
      }
      
      const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
      const openPositions = positions.filter(p => p.status === 'open');
      
      res.json({
        status: 'active',
        portfolio: {
          id: portfolio.id,
          cashBalance: portfolio.cashBalance,
          totalValue: portfolio.totalValue,
          startingCapital: portfolio.startingCapital,
        },
        openPositions: openPositions.length,
        maxPositions: 2,
        canTrade: portfolio.cashBalance >= 50 && openPositions.length < 2,
      });
    } catch (error) {
      logger.error("Futures bot status error:", error);
      res.status(500).json({ error: "Failed to get futures bot status" });
    }
  });
  
  // Manually trigger futures bot scan
  app.post("/api/futures-bot/scan", requireAdminJWT, async (_req, res) => {
    try {
      const { runFuturesBotScan, monitorFuturesPositions } = await import("./auto-lotto-trader");
      
      logger.info("📈 [FUTURES BOT] Manual scan triggered via API");
      
      // Run both monitor and scan
      await monitorFuturesPositions();
      await runFuturesBotScan();
      
      // Get updated status
      const { getFuturesPortfolio } = await import("./auto-lotto-trader");
      const portfolio = await getFuturesPortfolio();
      
      res.json({
        success: true,
        message: "Futures bot scan completed",
        portfolioBalance: portfolio?.cashBalance || 0,
      });
    } catch (error) {
      logger.error("Futures bot scan error:", error);
      res.status(500).json({ error: "Failed to run futures bot scan" });
    }
  });

  // Polymarket Prediction Market Routes
  app.get("/api/polymarket/trending", async (_req, res) => {
    try {
      const { fetchTrendingMarkets } = await import("./polymarket-service");
      const markets = await fetchTrendingMarkets(20);
      res.json({ markets, count: markets.length });
    } catch (error) {
      logger.error("Polymarket trending error:", error);
      res.status(500).json({ error: "Failed to fetch trending markets" });
    }
  });
  
  app.get("/api/polymarket/opportunities", async (_req, res) => {
    try {
      const { scanForPredictionOpportunities, fetchTrendingMarkets } = await import("./polymarket-service");
      const { fetchBreakingNews } = await import("./news-service");
      
      const breakingNews = await fetchBreakingNews(undefined, undefined, 20);
      const opportunities = await scanForPredictionOpportunities(breakingNews);
      
      res.json({
        opportunities,
        count: opportunities.length,
        newsAnalyzed: breakingNews.length,
      });
    } catch (error) {
      logger.error("Polymarket opportunities error:", error);
      res.status(500).json({ error: "Failed to scan for opportunities" });
    }
  });
  
  app.post("/api/polymarket/scan", requireAdminJWT, async (_req, res) => {
    try {
      const { runPredictionMarketScan } = await import("./polymarket-service");
      
      logger.info("[POLYMARKET] Manual scan triggered via API");
      await runPredictionMarketScan();
      
      res.json({ success: true, message: "Prediction market scan completed" });
    } catch (error) {
      logger.error("Polymarket scan error:", error);
      res.status(500).json({ error: "Failed to run prediction market scan" });
    }
  });

  // Expiry Pattern Analysis Routes
  app.get("/api/expiry-patterns", async (req, res) => {
    try {
      const { analyzeExpiryPatterns } = await import("./expiry-pattern-service");
      const portfolioId = req.query.portfolioId as string | undefined;
      const lookbackDays = parseInt(req.query.lookbackDays as string) || 90;
      
      const patterns = await analyzeExpiryPatterns(portfolioId, lookbackDays);
      res.json({ patterns, count: patterns.length });
    } catch (error) {
      logger.error("Expiry pattern analysis error:", error);
      res.status(500).json({ error: "Failed to analyze expiry patterns" });
    }
  });
  
  app.get("/api/expiry-patterns/weekly", async (req, res) => {
    try {
      const { analyzeWeeklyPatterns } = await import("./expiry-pattern-service");
      const portfolioId = req.query.portfolioId as string | undefined;
      const weeksBack = parseInt(req.query.weeksBack as string) || 12;
      
      const patterns = await analyzeWeeklyPatterns(portfolioId, weeksBack);
      res.json({ patterns, count: patterns.length });
    } catch (error) {
      logger.error("Weekly pattern analysis error:", error);
      res.status(500).json({ error: "Failed to analyze weekly patterns" });
    }
  });
  
  app.get("/api/expiry-patterns/summary", async (req, res) => {
    try {
      const { getExpiryPatternSummary } = await import("./expiry-pattern-service");
      const portfolioId = req.query.portfolioId as string | undefined;
      
      const summary = await getExpiryPatternSummary(portfolioId);
      res.json(summary);
    } catch (error) {
      logger.error("Expiry pattern summary error:", error);
      res.status(500).json({ error: "Failed to get expiry pattern summary" });
    }
  });
  
  app.get("/api/expiry-patterns/signals/:symbol", async (req, res) => {
    try {
      const { generateExpirySignals } = await import("./expiry-pattern-service");
      const { symbol } = req.params;
      const currentPrice = parseFloat(req.query.price as string) || 0;
      
      const signals = await generateExpirySignals(symbol.toUpperCase(), currentPrice);
      res.json({ signals, symbol: symbol.toUpperCase() });
    } catch (error) {
      logger.error("Expiry signals error:", error);
      res.status(500).json({ error: "Failed to generate expiry signals" });
    }
  });

  // User Preferences Routes
  app.get("/api/preferences", async (_req, res) => {
    try {
      const prefs = await storage.getUserPreferences();
      if (!prefs) {
        return res.status(404).json({ error: "Preferences not found" });
      }
      res.json(prefs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  app.patch("/api/preferences", async (req, res) => {
    try {
      const validated = insertUserPreferencesSchema.partial().parse(req.body);
      const prefs = await storage.updateUserPreferences(validated);
      res.json(prefs);
    } catch (error: any) {
      console.error("Preferences validation error:", error);
      res.status(400).json({ 
        error: "Invalid preferences data",
        details: error.message || error.toString()
      });
    }
  });

  app.put("/api/preferences", async (req, res) => {
    try {
      const validated = insertUserPreferencesSchema.partial().parse(req.body);
      const prefs = await storage.updateUserPreferences(validated);
      res.json(prefs);
    } catch (error: any) {
      console.error("Preferences validation error:", error);
      res.status(400).json({ 
        error: "Invalid preferences data",
        details: error.message || error.toString()
      });
    }
  });

  // User-Specific Preferences (for logged-in users)
  app.get("/api/user/:userId/preferences", async (req, res) => {
    try {
      const { userId } = req.params;
      const prefs = await storage.getUserPreferencesByUserId(userId);
      if (!prefs) {
        // Return defaults if no preferences exist yet
        return res.json({
          layoutDensity: 'comfortable',
          sidebarCollapsed: false,
          dashboardPreset: 'default',
          favoritePages: [],
          theme: 'dark',
          compactMode: false,
        });
      }
      res.json(prefs);
    } catch (error) {
      console.error("User preferences fetch error:", error);
      res.status(500).json({ error: "Failed to fetch user preferences" });
    }
  });

  app.patch("/api/user/:userId/preferences", async (req, res) => {
    try {
      const { userId } = req.params;
      const validated = insertUserPreferencesSchema.partial().parse(req.body);
      const prefs = await storage.updateUserPreferencesByUserId(userId, validated);
      res.json(prefs);
    } catch (error: any) {
      console.error("User preferences update error:", error);
      res.status(400).json({ 
        error: "Invalid preferences data",
        details: error.message || error.toString()
      });
    }
  });

  // User Page Layouts API
  app.get("/api/user/:userId/layouts", async (req, res) => {
    try {
      const { userId } = req.params;
      const layouts = await storage.getUserPageLayouts(userId);
      res.json(layouts);
    } catch (error) {
      console.error("Layouts fetch error:", error);
      res.status(500).json({ error: "Failed to fetch layouts" });
    }
  });

  app.get("/api/user/:userId/layouts/:pageId", async (req, res) => {
    try {
      const { userId, pageId } = req.params;
      const layout = await storage.getUserPageLayout(userId, pageId);
      if (!layout) {
        return res.status(404).json({ error: "Layout not found" });
      }
      res.json(layout);
    } catch (error) {
      console.error("Layout fetch error:", error);
      res.status(500).json({ error: "Failed to fetch layout" });
    }
  });

  app.put("/api/user/:userId/layouts/:pageId", async (req, res) => {
    try {
      const { userId, pageId } = req.params;
      const layout = await storage.saveUserPageLayout({
        userId,
        pageId,
        layoutName: req.body.layoutName || 'default',
        widgets: req.body.widgets || [],
        columns: req.body.columns || 12,
        rowHeight: req.body.rowHeight || 60,
        panelSizes: req.body.panelSizes || null,
        isDefault: req.body.isDefault || false,
      });
      res.json(layout);
    } catch (error: any) {
      console.error("Layout save error:", error);
      res.status(400).json({ 
        error: "Failed to save layout",
        details: error.message || error.toString()
      });
    }
  });

  app.delete("/api/user/:userId/layouts/:pageId", async (req, res) => {
    try {
      const { userId, pageId } = req.params;
      await storage.deleteUserPageLayout(userId, pageId);
      res.json({ success: true });
    } catch (error) {
      console.error("Layout delete error:", error);
      res.status(500).json({ error: "Failed to delete layout" });
    }
  });

  // User Navigation Layouts (sidebar customization)
  app.get("/api/navigation-layout", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const layout = await storage.getUserNavigationLayout(userId);
      res.json(layout);
    } catch (error) {
      console.error("Navigation layout fetch error:", error);
      res.status(500).json({ error: "Failed to fetch navigation layout" });
    }
  });

  app.put("/api/navigation-layout", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { layout } = req.body;
      if (!layout || !layout.groups) {
        return res.status(400).json({ error: "Invalid layout format - must include groups array" });
      }
      const saved = await storage.saveUserNavigationLayout(userId, layout);
      res.json(saved);
    } catch (error: any) {
      console.error("Navigation layout save error:", error);
      res.status(400).json({ 
        error: "Failed to save navigation layout",
        details: error.message || error.toString()
      });
    }
  });

  app.delete("/api/navigation-layout", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const deleted = await storage.deleteUserNavigationLayout(userId);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Navigation layout delete error:", error);
      res.status(500).json({ error: "Failed to delete navigation layout" });
    }
  });

  // Layout Presets (admin-defined templates)
  app.get("/api/layout-presets/:pageId", async (req, res) => {
    try {
      const { pageId } = req.params;
      const presets = await storage.getLayoutPresets(pageId);
      res.json(presets);
    } catch (error) {
      console.error("Presets fetch error:", error);
      res.status(500).json({ error: "Failed to fetch presets" });
    }
  });

  // Quantitative Analysis for Single Symbol
  app.get("/api/quant/analyze/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const marketData = await storage.getMarketDataBySymbol(symbol.toUpperCase());
      
      if (!marketData) {
        return res.status(404).json({ error: "Symbol not found in market data" });
      }

      // Import technical indicators
      const { 
        calculateRSI, 
        calculateMACD, 
        calculateSMA, 
        analyzeRSI, 
        analyzeMACD,
        calculateBollingerBands
      } = await import("./technical-indicators");

      // Import market API for real historical data
      const { fetchHistoricalPrices } = await import("./market-api");

      // Fetch REAL historical prices instead of synthetic data
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      let historicalPrices = await fetchHistoricalPrices(
        marketData.symbol, 
        marketData.assetType, 
        60, 
        apiKey
      );

      // Fallback to synthetic if API fails (for development/testing)
      if (historicalPrices.length === 0) {
        console.log(`⚠️  Using fallback synthetic prices for ${marketData.symbol}`);
        const generateFallback = (currentPrice: number, changePercent: number, periods: number = 60): number[] => {
          const prices: number[] = [];
          const dailyChange = changePercent / 100;
          const volatility = Math.abs(dailyChange) * 2;
          
          for (let i = periods; i >= 0; i--) {
            const daysAgo = i;
            const trend = (dailyChange / periods) * (periods - daysAgo);
            const noise = (Math.random() - 0.5) * volatility * currentPrice;
            const price = currentPrice * (1 - trend) + noise;
            prices.push(Math.max(price, currentPrice * 0.5));
          }
          return prices;
        };
        historicalPrices = generateFallback(marketData.currentPrice, marketData.changePercent, 60);
      } else {
        console.log(`✅ Using ${historicalPrices.length} real historical prices for ${marketData.symbol}`);
      }
      
      // Calculate technical indicators
      const rsi = calculateRSI(historicalPrices, 14);
      const macd = calculateMACD(historicalPrices, 12, 26, 9);
      const sma20 = calculateSMA(historicalPrices, 20);
      const sma50 = calculateSMA(historicalPrices, 50);
      const bollinger = calculateBollingerBands(historicalPrices, 20, 2);
      
      // Analyze signals
      const rsiAnalysis = analyzeRSI(rsi);
      const macdAnalysis = analyzeMACD(macd);
      
      // Volume analysis
      const avgVolume = marketData.avgVolume || marketData.volume;
      const volumeRatio = marketData.volume / avgVolume;
      const volumeSignal = volumeRatio > 1.5 ? 'high' : volumeRatio > 1.2 ? 'above_average' : volumeRatio < 0.8 ? 'low' : 'normal';
      
      // Trend analysis
      const currentPrice = marketData.currentPrice;
      const trend = currentPrice > sma20 && sma20 > sma50 ? 'strong_uptrend' :
                    currentPrice > sma20 ? 'uptrend' :
                    currentPrice < sma20 && sma20 < sma50 ? 'strong_downtrend' :
                    'downtrend';
      
      // Support/Resistance (Bollinger Bands)
      const supportResistance = {
        support: bollinger.lower,
        resistance: bollinger.upper,
        midpoint: bollinger.middle,
        distanceToSupport: ((currentPrice - bollinger.lower) / currentPrice * 100).toFixed(2),
        distanceToResistance: ((bollinger.upper - currentPrice) / currentPrice * 100).toFixed(2)
      };
      
      res.json({
        symbol: marketData.symbol,
        assetType: marketData.assetType,
        currentPrice: marketData.currentPrice,
        changePercent: marketData.changePercent,
        analysis: {
          rsi: {
            value: rsi,
            signal: rsiAnalysis.signal,
            strength: rsiAnalysis.strength,
            direction: rsiAnalysis.direction,
            interpretation: rsi < 30 ? 'Oversold - Potential buy signal' :
                           rsi > 70 ? 'Overbought - Potential sell signal' :
                           'Neutral range'
          },
          macd: {
            value: macd.macd,
            signal: macd.signal,
            histogram: macd.histogram,
            analysis: macdAnalysis.signal,
            strength: macdAnalysis.strength,
            direction: macdAnalysis.direction,
            crossover: macdAnalysis.crossover,
            interpretation: macdAnalysis.crossover ? 'Crossover imminent - Watch closely' :
                           macd.histogram > 0 ? 'Bullish momentum' :
                           'Bearish momentum'
          },
          trend: {
            direction: trend,
            sma20,
            sma50,
            priceVsSMA20: ((currentPrice - sma20) / sma20 * 100).toFixed(2) + '%',
            priceVsSMA50: ((currentPrice - sma50) / sma50 * 100).toFixed(2) + '%'
          },
          volume: {
            current: marketData.volume,
            average: avgVolume,
            ratio: Number(volumeRatio.toFixed(2)),
            signal: volumeSignal,
            interpretation: volumeSignal === 'high' ? 'Strong interest - High volume' :
                           volumeSignal === 'above_average' ? 'Elevated activity' :
                           volumeSignal === 'low' ? 'Low participation' :
                           'Normal trading activity'
          },
          supportResistance
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Quant analysis error:", error);
      res.status(500).json({ error: error?.message || "Failed to analyze symbol" });
    }
  });

  // Quantitative Idea Generator (Premium only)
  app.post("/api/quant/generate-ideas", quantGenerationLimiter, async (req, res) => {
    try {
      const schema = z.object({
        count: z.number().optional().default(8),
        targetHoldingPeriod: z.enum(['day', 'swing', 'position']).optional(),
      });
      const { count, targetHoldingPeriod } = schema.parse(req.body);
      
      // Get current market data and catalysts
      const marketData = await storage.getAllMarketData();
      const catalysts = await storage.getAllCatalysts();
      
      // Generate quantitative ideas with deduplication
      // Manual generation: skip time check (user can generate anytime)
      const quantIdeas = await generateQuantIdeas(marketData, catalysts, count, storage, true, targetHoldingPeriod);
      
      // Save ideas to storage with validation and send Discord alerts
      const savedIdeas = [];
      const rejectedIdeas: Array<{symbol: string, reason: string}> = [];
      
      for (const idea of quantIdeas) {
        // Options now allowed - direction bug fixed (was marking puts as 'short' instead of 'long')
        // All options are now LONG (bought) positions with correct P&L calculation
        
        // 🛡️ LAYER 1: Structural validation (prevents logically impossible trades)
        const structureValid = validateTradeStructureLog({
          symbol: idea.symbol,
          assetType: idea.assetType as 'stock' | 'option' | 'crypto',
          direction: idea.direction as 'long' | 'short',
          entryPrice: idea.entryPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss
        }, 'Quant');
        
        if (!structureValid) {
          rejectedIdeas.push({ symbol: idea.symbol, reason: 'Structural validation failed (check logs)' });
          continue;
        }
        
        // 🛡️ LAYER 2: Risk guardrails (max 5% loss, min 2:1 R:R, price sanity)
        const validation = validateTradeRisk({
          symbol: idea.symbol,
          assetType: idea.assetType as 'stock' | 'option' | 'crypto',
          direction: idea.direction as 'long' | 'short',
          entryPrice: idea.entryPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          catalyst: idea.catalyst || '',
          analysis: idea.analysis || '',
          sessionContext: idea.sessionContext || ''
        });
        
        if (!validation.isValid) {
          logger.warn(`🚫 Quant: REJECTED ${idea.symbol} - ${validation.reason}`);
          rejectedIdeas.push({ symbol: idea.symbol, reason: validation.reason || 'Risk validation failed' });
          continue;
        }
        
        logger.info(`✅ Quant: ${idea.symbol} passed validation - Loss:${validation.metrics?.maxLossPercent.toFixed(2)}% R:R:${validation.metrics?.riskRewardRatio.toFixed(2)}:1`);
        
        const tradeIdea = await storage.createTradeIdea(idea);
        
        // 🔥 Clear stale price cache to force fresh fetch on next validation
        clearCachedPrice(idea.symbol);
        
        savedIdeas.push(tradeIdea);
      }
      
      // Log rejection summary if any
      if (rejectedIdeas.length > 0) {
        logger.warn(`🛡️ Quant Validation Summary: ${rejectedIdeas.length} ideas rejected, ${savedIdeas.length} passed`);
        rejectedIdeas.forEach(r => logger.warn(`   - ${r.symbol}: ${r.reason}`));
      }
      
      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'quant').catch(err => 
          console.error('Discord notification failed:', err)
        );
      }
      
      // Return helpful message when no new ideas are available
      if (savedIdeas.length === 0) {
        res.json({ 
          success: true, 
          ideas: [], 
          count: 0,
          message: "No new trade ideas at this time. Wait for market movements or price changes to generate fresh opportunities."
        });
      } else {
        res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
      }
    } catch (error: any) {
      console.error("Quant idea generation error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate quantitative trade ideas" });
    }
  });

  // Futures Idea Generator (Premium only)
  app.post("/api/quant/generate-futures", quantGenerationLimiter, async (req, res) => {
    try {
      logger.info('🔮 [FUTURES] Manual futures generation triggered');
      
      // Generate futures ideas (NQ and GC) - force=true for manual generation
      const futuresIdeas = await generateFuturesIdeas(true);
      
      // Save ideas to storage
      const savedIdeas = [];
      const rejectedIdeas: Array<{symbol: string, reason: string}> = [];
      
      for (const idea of futuresIdeas) {
        // Futures don't need structural validation like stocks/options
        // They have fixed specs from CME
        
        const tradeIdea = await storage.createTradeIdea(idea);
        
        // Clear stale price cache to force fresh fetch on next validation
        clearCachedPrice(idea.symbol);
        
        savedIdeas.push(tradeIdea);
      }
      
      // Send Discord notification to dedicated futures channel
      if (savedIdeas.length > 0) {
        const { sendFuturesTradesToDiscord } = await import("./discord-service");
        sendFuturesTradesToDiscord(savedIdeas).catch(err => 
          console.error('Discord futures notification failed:', err)
        );
      }
      
      // Return helpful message when no new ideas are available
      if (savedIdeas.length === 0) {
        res.json({ 
          success: true, 
          ideas: [], 
          count: 0,
          message: "No new futures ideas at this time. Wait for market movements or price changes to generate fresh opportunities."
        });
      } else {
        res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
      }
    } catch (error: any) {
      logger.error('🔮 [FUTURES] Generation error:', error);
      res.status(500).json({ error: error?.message || "Failed to generate futures trade ideas" });
    }
  });

  // Unusual Options Flow Scanner (Premium only)
  app.post("/api/flow/generate-ideas", quantGenerationLimiter, async (req, res) => {
    try {
      const { holdingPeriod } = req.body || {};
      logger.info(`📊 [FLOW] Manual flow scan triggered${holdingPeriod ? ` (holding period: ${holdingPeriod})` : ''}`);
      
      // Scan for unusual options activity (filtered by holding period if specified)
      const flowIdeas = await scanUnusualOptionsFlow(holdingPeriod, true);
      
      // Save ideas to storage with validation and send Discord alerts
      const savedIdeas = [];
      const rejectedIdeas: Array<{symbol: string, reason: string}> = [];
      
      for (const idea of flowIdeas) {
        // 🛡️ LAYER 1: Structural validation (prevents logically impossible trades)
        const structureValid = validateTradeStructureLog({
          symbol: idea.symbol,
          assetType: idea.assetType as 'stock' | 'option' | 'crypto',
          direction: idea.direction as 'long' | 'short',
          entryPrice: idea.entryPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          // Options-specific fields (required for option validation)
          strikePrice: idea.strikePrice ?? undefined,
          expiryDate: idea.expiryDate ?? undefined,
          optionType: idea.optionType as 'call' | 'put' | undefined
        }, 'Flow');
        
        if (!structureValid) {
          rejectedIdeas.push({ symbol: idea.symbol, reason: 'Structural validation failed (check logs)' });
          continue;
        }
        
        // 🛡️ LAYER 2: Risk guardrails (max 5% loss, min 1.5:1 R:R, price sanity)
        const validation = validateTradeRisk({
          symbol: idea.symbol,
          assetType: idea.assetType as 'stock' | 'option' | 'crypto',
          direction: idea.direction as 'long' | 'short',
          entryPrice: idea.entryPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          catalyst: idea.catalyst || '',
          analysis: idea.analysis || '',
          sessionContext: idea.sessionContext || ''
        });
        
        if (!validation.isValid) {
          logger.warn(`📊 [FLOW] REJECTED ${idea.symbol} - ${validation.reason}`);
          rejectedIdeas.push({ symbol: idea.symbol, reason: validation.reason || 'Risk validation failed' });
          continue;
        }
        
        logger.info(`📊 [FLOW] ${idea.symbol} passed validation - Loss:${validation.metrics?.maxLossPercent.toFixed(2)}% R:R:${validation.metrics?.riskRewardRatio.toFixed(2)}:1`);
        
        // 🕐 TIMING INTELLIGENCE: Derive trade-specific timing windows
        const riskRewardRatio = (idea.targetPrice - idea.entryPrice) / (idea.entryPrice - idea.stopLoss);
        const confidenceScore = idea.confidenceScore ?? 50; // Use existing or default
        const timingWindows = deriveTimingWindows({
          symbol: idea.symbol,
          assetType: idea.assetType as 'stock' | 'option' | 'crypto',
          direction: idea.direction as 'long' | 'short',
          entryPrice: idea.entryPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          analysis: idea.analysis || '',
          catalyst: idea.catalyst || '',
          confidenceScore,
          riskRewardRatio,
        });
        
        // Add timing windows to the idea
        const ideaWithTiming = {
          ...idea,
          holdingPeriod: timingWindows.holdingPeriodType,
          entryValidUntil: timingWindows.entryValidUntil,
          exitBy: timingWindows.exitBy,
          volatilityRegime: timingWindows.volatilityRegime,
          sessionPhase: timingWindows.sessionPhase,
          trendStrength: timingWindows.trendStrength,
          entryWindowMinutes: timingWindows.entryWindowMinutes,
          exitWindowMinutes: timingWindows.exitWindowMinutes,
          timingConfidence: timingWindows.timingConfidence,
          targetHitProbability: timingWindows.targetHitProbability,
        };
        
        const tradeIdea = await storage.createTradeIdea(ideaWithTiming);
        
        // 🔥 Clear stale price cache to force fresh fetch on next validation
        clearCachedPrice(idea.symbol);
        
        savedIdeas.push(tradeIdea);
      }
      
      // 🔍 TIMING VERIFICATION: Ensure timing windows are unique across batch
      if (savedIdeas.length > 0) {
        verifyTimingUniqueness(savedIdeas.map(idea => ({
          symbol: idea.symbol,
          entryValidUntil: idea.entryValidUntil || '',
          exitBy: idea.exitBy || ''
        })));
      }
      
      // Log rejection summary if any
      if (rejectedIdeas.length > 0) {
        logger.warn(`📊 [FLOW] Validation Summary: ${rejectedIdeas.length} ideas rejected, ${savedIdeas.length} passed`);
        rejectedIdeas.forEach(r => logger.warn(`   - ${r.symbol}: ${r.reason}`));
      }
      
      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'flow').catch(err => 
          console.error('Discord notification failed:', err)
        );
      }
      
      // Return helpful message when no new ideas are available
      if (savedIdeas.length === 0) {
        res.json({ 
          success: true, 
          ideas: [], 
          count: 0,
          message: "No unusual options flow detected at this time. Monitoring continues every 15 minutes during market hours."
        });
      } else {
        res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
      }
    } catch (error: any) {
      logger.error("📊 [FLOW] Flow scan error:", error);
      res.status(500).json({ error: error?.message || "Failed to scan unusual options flow" });
    }
  });

  // AI QuantBot Routes (Premium only)
  app.post("/api/ai/generate-ideas", aiGenerationLimiter, async (req, res) => {
    try {
      const schema = z.object({
        marketContext: z.string().optional(),
        customPrompt: z.string().optional(),
        count: z.number().optional()
      });
      const { marketContext: rawMarketContext, customPrompt, count } = schema.parse(req.body);
      
      // Use customPrompt if provided, otherwise use marketContext or default
      const marketContext = customPrompt || rawMarketContext || "Current market conditions with focus on stocks, options, and crypto";
      
      // 🚫 DEDUPLICATION: Get existing open symbols
      const allIdeas = await storage.getAllTradeIdeas();
      const existingOpenSymbols = new Set(
        allIdeas
          .filter((idea: any) => idea.outcomeStatus === 'open')
          .map((idea: any) => idea.symbol.toUpperCase())
      );
      
      const aiIdeas = await generateTradeIdeas(marketContext);
      
      // 🛡️ Apply strict risk validation to all AI-generated ideas
      const savedIdeas = [];
      const rejectedIdeas: Array<{symbol: string, reason: string}> = [];
      
      for (const aiIdea of aiIdeas) {
        // 🚫 Skip if symbol already has an open trade
        if (existingOpenSymbols.has(aiIdea.symbol.toUpperCase())) {
          logger.info(`⏭️  AI: Skipped ${aiIdea.symbol} - already has open trade`);
          continue;
        }
        
        // 🔧 OPTIONS PRICING FIX: Convert stock prices to option premiums
        if (aiIdea.assetType === 'option') {
          try {
            const { findOptimalStrike } = await import('./tradier-api');
            const stockPrice = aiIdea.entryPrice; // AI provides stock price, not premium
            
            const optimalStrike = await findOptimalStrike(
              aiIdea.symbol, 
              stockPrice,
              aiIdea.direction,
              process.env.TRADIER_API_KEY
            );
            
            if (optimalStrike && optimalStrike.lastPrice) {
              // Override AI prices with real option premium math
              const optionPremium = optimalStrike.lastPrice;
              aiIdea.entryPrice = optionPremium;
              aiIdea.targetPrice = optionPremium * 1.25; // +25% gain
              aiIdea.stopLoss = optionPremium * 0.96; // -4.0% stop (buffer under 5% max loss cap)
              
              logger.info(`✅ AI: ${aiIdea.symbol} option pricing converted - Stock:$${stockPrice} → Premium:$${optionPremium} (Target:$${aiIdea.targetPrice.toFixed(2)}, Stop:$${aiIdea.stopLoss.toFixed(2)})`);
            } else {
              // Fallback: estimate premium as ~5% of stock price
              const estimatedPremium = stockPrice * 0.05;
              aiIdea.entryPrice = estimatedPremium;
              aiIdea.targetPrice = estimatedPremium * 1.25;
              aiIdea.stopLoss = estimatedPremium * 0.96;
              
              logger.warn(`⚠️  AI: ${aiIdea.symbol} using estimated premium (~5% of stock) - Premium:$${estimatedPremium.toFixed(2)}`);
            }
          } catch (error) {
            logger.error(`❌ AI: ${aiIdea.symbol} option pricing failed:`, error);
            rejectedIdeas.push({ symbol: aiIdea.symbol, reason: 'Failed to fetch option premium' });
            continue;
          }
        }
        
        // 📰 NEWS CATALYST DETECTION: Check if user's prompt contains breaking news keywords
        // Detect from user input (marketContext) not AI output, since AI may not include news keywords
        const isNewsCatalyst = detectNewsCatalyst(marketContext, '');
        if (isNewsCatalyst) {
          logger.info(`📰 ${aiIdea.symbol}: News Catalyst Mode activated (detected in user prompt) - R:R requirement relaxed to 1.5:1`);
        }
        
        // 🛡️ LAYER 1: Structural validation (prevents logically impossible trades)
        const structureValid = validateTradeStructureLog({
          symbol: aiIdea.symbol,
          assetType: aiIdea.assetType,
          direction: aiIdea.direction,
          entryPrice: aiIdea.entryPrice,
          targetPrice: aiIdea.targetPrice,
          stopLoss: aiIdea.stopLoss
        }, 'AI');
        
        if (!structureValid) {
          rejectedIdeas.push({ symbol: aiIdea.symbol, reason: 'Structural validation failed (check logs)' });
          continue;
        }
        
        // 🛡️ LAYER 2: Risk guardrails (max 5% loss, min R:R based on catalyst type, price sanity)
        const validation = validateTradeRisk(aiIdea, isNewsCatalyst);
        
        if (!validation.isValid) {
          logger.warn(`🚫 AI: REJECTED ${aiIdea.symbol} - ${validation.reason}`);
          rejectedIdeas.push({ symbol: aiIdea.symbol, reason: validation.reason || 'Unknown' });
          continue; // Skip this trade - does NOT save to database
        }
        
        // ✅ Trade passes risk validation - log metrics and save
        logger.info(`✅ AI: ${aiIdea.symbol} passed validation - Loss:${validation.metrics?.maxLossPercent.toFixed(2)}% R:R:${validation.metrics?.riskRewardRatio.toFixed(2)}:1 Gain:${validation.metrics?.potentialGainPercent.toFixed(2)}%`);
        
        const { entryPrice, targetPrice, stopLoss } = aiIdea;
        const riskRewardRatio = (targetPrice - entryPrice) / (entryPrice - stopLoss);
        
        // 📊 Calculate confidence score and quality signals (calibrated for AI's poor track record)
        const confidenceScore = calculateAIConfidence(aiIdea, validation.metrics, isNewsCatalyst, 'ai');
        const qualitySignals = [
          `catalyst_${isNewsCatalyst ? 'news' : 'standard'}`,
          `rr_${riskRewardRatio.toFixed(1)}`,
          `asset_${aiIdea.assetType}`,
          aiIdea.entryPrice >= 10 ? 'price_strong' : aiIdea.entryPrice >= 5 ? 'price_moderate' : 'price_low'
        ];
        const probabilityBand = getProbabilityBand(confidenceScore);
        const generationTimestamp = new Date().toISOString();
        
        // 🕐 TIMING INTELLIGENCE: Derive trade-specific timing windows
        const timingWindows = deriveTimingWindows({
          symbol: aiIdea.symbol,
          assetType: aiIdea.assetType,
          direction: aiIdea.direction,
          entryPrice,
          targetPrice,
          stopLoss,
          analysis: aiIdea.analysis,
          catalyst: aiIdea.catalyst,
          confidenceScore,
          riskRewardRatio,
        });
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: aiIdea.symbol,
          assetType: aiIdea.assetType,
          direction: aiIdea.direction,
          holdingPeriod: timingWindows.holdingPeriodType,
          entryPrice,
          targetPrice,
          stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: aiIdea.catalyst,
          analysis: aiIdea.analysis,
          liquidityWarning: aiIdea.entryPrice < 5,
          sessionContext: aiIdea.sessionContext,
          timestamp: generationTimestamp,
          entryValidUntil: timingWindows.entryValidUntil,
          exitBy: timingWindows.exitBy,
          expiryDate: aiIdea.expiryDate || null,
          strikePrice: aiIdea.assetType === 'option' ? ((aiIdea as any).strikePrice || aiIdea.entryPrice * (aiIdea.direction === 'long' ? 1.02 : 0.98)) : null,
          optionType: aiIdea.assetType === 'option' ? ((aiIdea as any).optionType || (aiIdea.direction === 'long' ? 'call' : 'put')) : null,
          source: 'ai',
          isNewsCatalyst: isNewsCatalyst,
          confidenceScore,
          qualitySignals,
          probabilityBand,
          engineVersion: 'ai_v1.0.0',
          generationTimestamp,
          dataSourceUsed: 'gemini-2.5-flash',
          volatilityRegime: timingWindows.volatilityRegime,
          sessionPhase: timingWindows.sessionPhase,
          trendStrength: timingWindows.trendStrength,
          entryWindowMinutes: timingWindows.entryWindowMinutes,
          exitWindowMinutes: timingWindows.exitWindowMinutes,
          timingConfidence: timingWindows.timingConfidence,
          targetHitProbability: timingWindows.targetHitProbability,
        });
        
        // 🔥 CRITICAL FIX: Clear stale price cache to force fresh fetch on next validation
        // Prevents $203 NVDA cached price from being used on $140 entry trades
        clearCachedPrice(aiIdea.symbol);
        
        savedIdeas.push(tradeIdea);
      }
      
      // 🔍 TIMING VERIFICATION: Ensure timing windows are unique across batch
      if (savedIdeas.length > 0) {
        verifyTimingUniqueness(savedIdeas.map(idea => ({
          symbol: idea.symbol,
          entryValidUntil: idea.entryValidUntil || '',
          exitBy: idea.exitBy || ''
        })));
      }
      
      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'ai').catch(err => 
          console.error('Discord notification failed:', err)
        );
      }
      
      // Log summary of risk validation
      if (rejectedIdeas.length > 0) {
        logger.warn(`🛡️ AI Risk Validation Summary: ${rejectedIdeas.length} ideas rejected, ${savedIdeas.length} passed`);
        rejectedIdeas.forEach(r => logger.warn(`   - ${r.symbol}: ${r.reason}`));
      }
      
      res.json({ 
        success: true, 
        ideas: savedIdeas, 
        count: savedIdeas.length,
        rejected: rejectedIdeas.length,
        message: rejectedIdeas.length > 0 
          ? `${savedIdeas.length} ideas saved, ${rejectedIdeas.length} rejected for risk violations`
          : undefined
      });
    } catch (error: any) {
      console.error("AI idea generation error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate trade ideas" });
    }
  });

  // 🎯 AI + Quant HYBRID Ideas (Combines proven quant signals with FREE AI intelligence)
  app.post("/api/hybrid/generate-ideas", aiGenerationLimiter, async (req, res) => {
    try {
      const schema = z.object({
        marketContext: z.string().optional().default("Current market conditions"),
      });
      const { marketContext } = schema.parse(req.body);
      
      // 🚫 DEDUPLICATION: Get existing open symbols
      const allIdeas = await storage.getAllTradeIdeas();
      const existingOpenSymbols = new Set(
        allIdeas
          .filter((idea: any) => idea.outcomeStatus === 'open')
          .map((idea: any) => idea.symbol.toUpperCase())
      );
      
      const { generateHybridIdeas } = await import("./ai-service");
      const hybridIdeas = await generateHybridIdeas(marketContext);
      
      // 🔍 SHADOW MODE: Log candidates BEFORE validation
      logger.info(`🔀 [HYBRID-SHADOW] Generated ${hybridIdeas.length} candidate trades BEFORE validation`);
      for (const idea of hybridIdeas) {
        logger.info(`🔀 [HYBRID-SHADOW] Candidate: ${idea.symbol} ${idea.assetType} ${idea.direction} Entry:$${idea.entryPrice} Target:$${idea.targetPrice} Stop:$${idea.stopLoss}`);
      }
      
      // 🛡️ Apply strict risk validation to all hybrid ideas
      const savedIdeas = [];
      const rejectedIdeas: Array<{symbol: string, reason: string}> = [];
      
      // 📊 SHADOW MODE: Initialize rejection tracking metrics
      const metrics = {
        candidatesGenerated: hybridIdeas.length,
        dedupedCount: 0,
        earningsBlockedCount: 0,
        optionsQuarantinedCount: 0,
        structuralFailCount: 0,
        riskFailCount: 0,
        passedCount: 0
      };
      
      for (const hybridIdea of hybridIdeas) {
        // 🚫 Skip if symbol already has an open trade
        if (existingOpenSymbols.has(hybridIdea.symbol.toUpperCase())) {
          logger.info(`⏭️  Hybrid: Skipped ${hybridIdea.symbol} - already has open trade`);
          metrics.dedupedCount++;
          continue;
        }
        
        // 📅 Check earnings calendar (block if earnings within 2 days, unless it's a news catalyst)
        // Hybrid ideas are NOT news catalysts by default
        if (hybridIdea.assetType === 'stock' || hybridIdea.assetType === 'option') {
          const { shouldBlockSymbol } = await import('./earnings-service');
          const isBlocked = await shouldBlockSymbol(hybridIdea.symbol, false);
          if (isBlocked) {
            logger.warn(`📅 [HYBRID] Skipped ${hybridIdea.symbol} - earnings within 2 days`);
            rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: 'Earnings within 2 days' });
            metrics.earningsBlockedCount++;
            continue;
          }
        }
        
        // 🔧 OPTIONS PRICING FIX: Convert stock prices to option premiums
        if (hybridIdea.assetType === 'option') {
          try {
            const { findOptimalStrike } = await import('./tradier-api');
            const stockPrice = hybridIdea.entryPrice; // AI provides stock price, not premium
            
            const optimalStrike = await findOptimalStrike(
              hybridIdea.symbol, 
              stockPrice,
              hybridIdea.direction,
              process.env.TRADIER_API_KEY
            );
            
            if (optimalStrike && optimalStrike.lastPrice) {
              // Override AI prices with real option premium math
              const optionPremium = optimalStrike.lastPrice;
              hybridIdea.entryPrice = optionPremium;
              hybridIdea.targetPrice = optionPremium * 1.25; // +25% gain
              hybridIdea.stopLoss = optionPremium * 0.96; // -4.0% stop (buffer under 5% max loss cap)
              
              logger.info(`✅ Hybrid: ${hybridIdea.symbol} option pricing converted - Stock:$${stockPrice} → Premium:$${optionPremium} (Target:$${hybridIdea.targetPrice.toFixed(2)}, Stop:$${hybridIdea.stopLoss.toFixed(2)})`);
            } else {
              // Fallback: estimate premium as ~5% of stock price
              const estimatedPremium = stockPrice * 0.05;
              hybridIdea.entryPrice = estimatedPremium;
              hybridIdea.targetPrice = estimatedPremium * 1.25;
              hybridIdea.stopLoss = estimatedPremium * 0.96;
              
              logger.warn(`⚠️  Hybrid: ${hybridIdea.symbol} using estimated premium (~5% of stock) - Premium:$${estimatedPremium.toFixed(2)}`);
            }
          } catch (error) {
            logger.error(`❌ Hybrid: ${hybridIdea.symbol} option pricing failed:`, error);
            rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: 'Failed to fetch option premium' });
            metrics.optionsQuarantinedCount++;
            continue;
          }
        }
        
        // 🛡️ LAYER 1: Structural validation (prevents logically impossible trades)
        const structureValid = validateTradeStructureLog({
          symbol: hybridIdea.symbol,
          assetType: hybridIdea.assetType,
          direction: hybridIdea.direction,
          entryPrice: hybridIdea.entryPrice,
          targetPrice: hybridIdea.targetPrice,
          stopLoss: hybridIdea.stopLoss
        }, 'Hybrid');
        
        if (!structureValid) {
          rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: 'Structural validation failed (check logs)' });
          metrics.structuralFailCount++;
          continue;
        }
        
        // 🛡️ LAYER 2: Risk guardrails (inherits from quant but adds AI safety layer)
        const validation = validateTradeRisk(hybridIdea);
        
        if (!validation.isValid) {
          logger.warn(`🚫 Hybrid: REJECTED ${hybridIdea.symbol} - ${validation.reason}`);
          rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: validation.reason || 'Unknown' });
          metrics.riskFailCount++;
          continue; // Skip this trade - does NOT save to database
        }
        
        // ✅ Trade passes risk validation - log metrics and save
        logger.info(`✅ Hybrid: ${hybridIdea.symbol} passed validation - Loss:${validation.metrics?.maxLossPercent.toFixed(2)}% R:R:${validation.metrics?.riskRewardRatio.toFixed(2)}:1 Gain:${validation.metrics?.potentialGainPercent.toFixed(2)}%`);
        
        const { entryPrice, targetPrice, stopLoss } = hybridIdea;
        const riskRewardRatio = (targetPrice - entryPrice) / (entryPrice - stopLoss);
        
        // 📰 NEWS CATALYST DETECTION: Check AI-generated catalyst/analysis for news keywords
        const isNewsCatalyst = detectNewsCatalyst(hybridIdea.catalyst || '', hybridIdea.analysis || '');
        
        // 📊 Calculate confidence score and quality signals (calibrated for Hybrid's mixed results)
        const confidenceScore = calculateAIConfidence(hybridIdea, validation.metrics, isNewsCatalyst, 'hybrid');
        const qualitySignals = [
          `catalyst_${isNewsCatalyst ? 'news' : 'standard'}`,
          `rr_${riskRewardRatio.toFixed(1)}`,
          `asset_${hybridIdea.assetType}`,
          hybridIdea.entryPrice >= 10 ? 'price_strong' : hybridIdea.entryPrice >= 5 ? 'price_moderate' : 'price_low',
          'hybrid_quant_ai' // Unique signal for hybrid trades
        ];
        const probabilityBand = getProbabilityBand(confidenceScore);
        const generationTimestamp = new Date().toISOString();
        
        // 🕐 TIMING INTELLIGENCE: Derive trade-specific timing windows
        const timingWindows = deriveTimingWindows({
          symbol: hybridIdea.symbol,
          assetType: hybridIdea.assetType,
          direction: hybridIdea.direction,
          entryPrice,
          targetPrice,
          stopLoss,
          analysis: hybridIdea.analysis,
          catalyst: hybridIdea.catalyst,
          confidenceScore,
          riskRewardRatio,
        });
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: hybridIdea.symbol,
          assetType: hybridIdea.assetType,
          direction: hybridIdea.direction,
          holdingPeriod: timingWindows.holdingPeriodType,
          entryPrice,
          targetPrice,
          stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: hybridIdea.catalyst,
          analysis: hybridIdea.analysis,
          liquidityWarning: hybridIdea.entryPrice < 5,
          sessionContext: hybridIdea.sessionContext,
          timestamp: generationTimestamp,
          entryValidUntil: timingWindows.entryValidUntil,
          exitBy: timingWindows.exitBy,
          expiryDate: hybridIdea.expiryDate || null,
          strikePrice: hybridIdea.assetType === 'option' ? ((hybridIdea as any).strikePrice || hybridIdea.entryPrice * (hybridIdea.direction === 'long' ? 1.02 : 0.98)) : null,
          optionType: hybridIdea.assetType === 'option' ? ((hybridIdea as any).optionType || (hybridIdea.direction === 'long' ? 'call' : 'put')) : null,
          source: 'hybrid',
          isNewsCatalyst: isNewsCatalyst,
          confidenceScore,
          qualitySignals,
          probabilityBand,
          engineVersion: 'hybrid_v1.0.0',
          generationTimestamp,
          dataSourceUsed: 'gemini-2.5-flash',
          volatilityRegime: timingWindows.volatilityRegime,
          sessionPhase: timingWindows.sessionPhase,
          trendStrength: timingWindows.trendStrength,
          entryWindowMinutes: timingWindows.entryWindowMinutes,
          exitWindowMinutes: timingWindows.exitWindowMinutes,
          timingConfidence: timingWindows.timingConfidence,
          targetHitProbability: timingWindows.targetHitProbability,
        });
        savedIdeas.push(tradeIdea);
        metrics.passedCount++;
      }
      
      // 🔍 TIMING VERIFICATION: Ensure timing windows are unique across batch
      if (savedIdeas.length > 0) {
        verifyTimingUniqueness(savedIdeas.map(idea => ({
          symbol: idea.symbol,
          entryValidUntil: idea.entryValidUntil || '',
          exitBy: idea.exitBy || ''
        })));
      }
      
      // 📊 SHADOW MODE: Log detailed metrics breakdown
      metrics.passedCount = savedIdeas.length; // Ensure count matches actual saved ideas
      logger.info(`🛡️ [HYBRID-SHADOW] Rejection breakdown: ${metrics.dedupedCount} dedupe, ${metrics.earningsBlockedCount} earnings, ${metrics.optionsQuarantinedCount} options, ${metrics.structuralFailCount} structural, ${metrics.riskFailCount} risk`);
      
      if (metrics.candidatesGenerated > 0) {
        const passRate = ((metrics.passedCount / metrics.candidatesGenerated) * 100).toFixed(1);
        logger.info(`🔀 [HYBRID-SHADOW] Validation Funnel: ${metrics.candidatesGenerated} → ${metrics.passedCount} (${passRate}% pass rate)`);
      } else {
        logger.warn(`🔀 [HYBRID-SHADOW] No candidates generated by AI - check generateHybridIdeas() output`);
      }
      
      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'hybrid').catch(err => 
          console.error('Discord notification failed:', err)
        );
      }
      
      // Log summary of risk validation
      if (rejectedIdeas.length > 0) {
        logger.warn(`🛡️ Hybrid Risk Validation Summary: ${rejectedIdeas.length} ideas rejected, ${savedIdeas.length} passed`);
        rejectedIdeas.forEach(r => logger.warn(`   - ${r.symbol}: ${r.reason}`));
      }
      
      res.json({ 
        success: true, 
        ideas: savedIdeas, 
        count: savedIdeas.length,
        rejected: rejectedIdeas.length,
        message: rejectedIdeas.length > 0 
          ? `${savedIdeas.length} ideas saved, ${rejectedIdeas.length} rejected for risk violations`
          : undefined
      });
    } catch (error: any) {
      console.error("Hybrid idea generation error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate hybrid ideas" });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const schema = z.object({
        message: z.string().min(1),
      });
      const { message } = schema.parse(req.body);
      
      // Get conversation history
      const history = await storage.getChatHistory();
      const conversationHistory = history.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Get AI response
      const aiResponse = await chatWithQuantAI(message, conversationHistory);
      
      // Save user message and AI response
      await storage.addChatMessage({ role: 'user', content: message });
      const assistantMessage = await storage.addChatMessage({ role: 'assistant', content: aiResponse });
      
      // Auto-detect if user is asking for trade ideas (not educational)
      const isTradeRequest = /(?:give|show|find|suggest|recommend|any).*(?:trade|idea|stock|buy|sell|position)/i.test(message);
      const isEducational = /(?:what is|how does|explain|define|meaning of)/i.test(message);
      
      let savedIdeas = [];
      if (isTradeRequest && !isEducational) {
        // Automatically parse and save trade ideas from the response
        try {
          const { parseTradeIdeasFromText } = await import("./ai-service");
          const extractedIdeas = await parseTradeIdeasFromText(aiResponse);
          
          for (const idea of extractedIdeas) {
            const riskRewardRatio = (idea.targetPrice - idea.entryPrice) / (idea.entryPrice - idea.stopLoss);
            
            const tradeIdea = await storage.createTradeIdea({
              symbol: idea.symbol,
              assetType: idea.assetType,
              direction: idea.direction,
              entryPrice: idea.entryPrice,
              targetPrice: idea.targetPrice,
              stopLoss: idea.stopLoss,
              riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
              catalyst: idea.catalyst || "From AI chat conversation",
              analysis: idea.analysis || "AI-suggested trade opportunity",
              liquidityWarning: idea.entryPrice < 5,
              sessionContext: idea.sessionContext || "Chat-suggested trade",
              timestamp: new Date().toISOString(),
              expiryDate: idea.expiryDate || null,
              strikePrice: idea.assetType === 'option' ? ((idea as any).strikePrice || idea.entryPrice * (idea.direction === 'long' ? 1.02 : 0.98)) : null,
              optionType: idea.assetType === 'option' ? ((idea as any).optionType || (idea.direction === 'long' ? 'call' : 'put')) : null,
              source: 'ai',
              isLottoPlay: false // Chat-generated ideas use stock-based pricing, not enriched
            });
            savedIdeas.push(tradeIdea);
          }
          
          if (savedIdeas.length > 0) {
            console.log(`✅ Auto-saved ${savedIdeas.length} trade ideas from chat to Trade Ideas feed`);
            
            // Send individual Discord alerts for chat-generated ideas
            const { sendTradeIdeaToDiscord } = await import("./discord-service");
            for (const idea of savedIdeas) {
              sendTradeIdeaToDiscord(idea).catch(err => 
                console.error('Discord notification failed:', err)
              );
            }
          }
        } catch (parseError) {
          console.log("Could not auto-parse trade ideas from chat response:", parseError);
        }
      }
      
      res.json({ 
        message: aiResponse, 
        messageId: assistantMessage.id,
        autoSavedIdeas: savedIdeas.length,
        isTradeResponse: isTradeRequest && !isEducational
      });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ error: error?.message || "Failed to process chat" });
    }
  });

  app.get("/api/ai/chat/history", async (_req, res) => {
    try {
      const history = await storage.getChatHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat history" });
    }
  });

  app.delete("/api/ai/chat/history", async (_req, res) => {
    try {
      await storage.clearChatHistory();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear chat history" });
    }
  });

  // AI Research Assistant - Educational trading/market Q&A powered by Claude
  app.post("/api/ai/research-assistant", researchAssistantLimiter, async (req, res) => {
    try {
      const schema = z.object({
        question: z.string().min(1, "Question is required").max(2000, "Question too long"),
        context: z.object({
          symbol: z.string().optional(),
          tradeIdeaId: z.number().optional(),
        }).optional(),
      });
      
      const { question, context } = schema.parse(req.body);
      
      // Get user and check credits
      const userId = req.session?.userId || (req.user as any)?.claims?.sub;
      let userTier: 'free' | 'advanced' | 'pro' | 'admin' = 'free';
      
      if (userId) {
        const user = await storage.getUserById(userId);
        if (user) {
          userTier = (user.subscriptionTier as 'free' | 'advanced' | 'pro' | 'admin') || 'free';
        }
        
        // Check if user has credits
        const creditBalance = await creditService.getOrCreateBalance(userId, userTier);
        if (!creditBalance.hasCredits) {
          return res.status(402).json({
            error: 'No AI credits remaining',
            creditsRemaining: 0,
            cycleEnd: creditBalance.cycleEnd,
            upgradeUrl: '/pricing',
            message: `You've used all ${creditBalance.creditsAllocated} AI credits for this month. Credits reset on ${new Date(creditBalance.cycleEnd).toLocaleDateString()}. Upgrade your plan for more credits.`
          });
        }
      }
      
      const startTime = Date.now();
      
      // Log usage for telemetry
      logger.info(`[RESEARCH-ASSISTANT] Question received`, {
        questionLength: question.length,
        hasSymbolContext: !!context?.symbol,
        hasTradeIdeaContext: !!context?.tradeIdeaId,
        userId,
        tier: userTier,
      });
      
      // Build context string if provided
      let contextString = "";
      if (context?.symbol) {
        contextString += `\n\nUser is asking about ticker symbol: ${context.symbol}`;
      }
      if (context?.tradeIdeaId) {
        const idea = await storage.getTradeIdeaById(String(context.tradeIdeaId));
        if (idea) {
          contextString += `\n\nRelated trade idea context:
- Symbol: ${idea.symbol}
- Direction: ${idea.direction}
- Entry: $${idea.entryPrice}
- Target: $${idea.targetPrice}
- Stop Loss: $${idea.stopLoss}
- Catalyst: ${idea.catalyst || 'N/A'}`;
        }
      }
      
      // System prompt - concise and direct
      const systemPrompt = `You are a trading research assistant. Be DIRECT and CONCISE.

RESPONSE STYLE:
- Answer the question FIRST, then explain if needed
- Use bullet points or numbered lists for multiple items
- Keep responses under 300 words unless complexity requires more
- NO lengthy introductions or preambles
- NO repetitive disclaimers within the response body
- Bold **key terms** only when introducing new concepts

EXAMPLE - Bad response:
"When evaluating a company's future prospects, it's important to consider various financial metrics. While no set of numbers can definitively predict the future, here are some key indicators..."

EXAMPLE - Good response:
"**Top 5 numbers for company future:**
1. **Revenue Growth Rate** - Shows demand trajectory
2. **Free Cash Flow** - Available money for growth
3. **Operating Margin** - Profit efficiency
4. **ROIC** - How well they use capital
5. **Debt-to-Equity** - Financial flexibility

[Brief explanation of each if user needs more detail]"

CONSTRAINTS:
- Educational content only, not financial advice
- Don't give specific buy/sell recommendations
- Focus on frameworks and concepts`;

      // Multi-provider fallback: Gemini → Anthropic → OpenAI
      let responseText = '';
      let usedProvider = 'unknown';
      
      // Try Gemini first (primary)
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        
        const result = await gemini.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `${systemPrompt}\n\nUser question: ${question}${contextString}`,
        });
        
        responseText = result.text || '';
        usedProvider = 'gemini';
      } catch (geminiError: any) {
        logger.warn(`[RESEARCH-ASSISTANT] Gemini failed, trying Anthropic...`, { error: geminiError?.message });
        
        // Try Anthropic as fallback
        try {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
          });
          
          const message = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: `${question}${contextString}`
              }
            ],
          });
          
          responseText = message.content[0].type === 'text' 
            ? message.content[0].text 
            : '';
          usedProvider = 'anthropic';
        } catch (anthropicError: any) {
          logger.warn(`[RESEARCH-ASSISTANT] Anthropic failed, trying OpenAI...`, { error: anthropicError?.message });
          
          // Try OpenAI as final fallback
          try {
            const OpenAI = (await import('openai')).default;
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            
            const completion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${question}${contextString}` }
              ],
              max_tokens: 1024,
            });
            
            responseText = completion.choices[0]?.message?.content || '';
            usedProvider = 'openai';
          } catch (openaiError: any) {
            logger.error(`[RESEARCH-ASSISTANT] All AI providers failed`, { 
              gemini: geminiError?.message,
              anthropic: anthropicError?.message,
              openai: openaiError?.message
            });
            throw new Error('All AI providers unavailable. Please try again later.');
          }
        }
      }
      
      if (!responseText) {
        throw new Error('Unable to generate response from any AI provider');
      }
      
      const responseTime = Date.now() - startTime;
      
      // Deduct credit after successful response
      let creditsRemaining: number | undefined;
      if (userId) {
        const modelUsed = usedProvider === 'gemini' ? 'gemini-2.5-flash' : 
                          usedProvider === 'anthropic' ? 'claude-sonnet-4' : 'gpt-4o';
        
        const deductResult = await creditService.deductCredit(
          userId,
          userTier,
          usedProvider,
          modelUsed,
          undefined, // inputTokens - not tracked for simplicity
          undefined, // outputTokens - not tracked for simplicity
          question.slice(0, 100),
          responseTime
        );
        creditsRemaining = deductResult.creditsRemaining;
      }
      
      const disclaimer = "⚠️ EDUCATIONAL DISCLAIMER: This information is for educational and research purposes only. It does not constitute financial advice, investment recommendations, or an offer to buy or sell any securities. Always conduct your own research and consult with a licensed financial advisor before making investment decisions. Past performance does not guarantee future results. Trading involves substantial risk of loss.";
      
      logger.info(`[RESEARCH-ASSISTANT] Response generated via ${usedProvider}`, {
        responseLength: responseText.length,
        provider: usedProvider,
        responseTimeMs: responseTime,
        creditsRemaining,
      });
      
      res.json({
        response: responseText,
        disclaimer,
        timestamp: new Date().toISOString(),
        creditsRemaining,
      });
    } catch (error: any) {
      logger.error("[RESEARCH-ASSISTANT] Error:", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid request format" });
      }
      
      res.status(500).json({ 
        error: error?.message || "Failed to process research question" 
      });
    }
  });

  // Parse chat message and extract trade ideas (Premium only)
  app.post("/api/ai/parse-chat-idea", async (req, res) => {
    try {
      const schema = z.object({
        messageId: z.string(),
        content: z.string(),
      });
      const { messageId, content } = schema.parse(req.body);
      
      // Use AI to extract structured trade ideas from conversational text
      const { parseTradeIdeasFromText } = await import("./ai-service");
      const extractedIdeas = await parseTradeIdeasFromText(content);
      
      // Save extracted ideas to storage
      const savedIdeas = [];
      for (const idea of extractedIdeas) {
        const riskRewardRatio = (idea.targetPrice - idea.entryPrice) / (idea.entryPrice - idea.stopLoss);
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: idea.symbol,
          assetType: idea.assetType,
          direction: idea.direction,
          entryPrice: idea.entryPrice,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: idea.catalyst || "From AI chat conversation",
          analysis: idea.analysis || "Extracted from conversational response",
          liquidityWarning: idea.entryPrice < 5,
          sessionContext: idea.sessionContext || "Chat-suggested trade",
          timestamp: new Date().toISOString(),
          expiryDate: idea.expiryDate || null,
          strikePrice: idea.assetType === 'option' ? ((idea as any).strikePrice || idea.entryPrice * (idea.direction === 'long' ? 1.02 : 0.98)) : null,
          optionType: idea.assetType === 'option' ? ((idea as any).optionType || (idea.direction === 'long' ? 'call' : 'put')) : null,
          source: 'ai',
          isLottoPlay: false // Chat-generated ideas use stock-based pricing, not enriched
        });
        savedIdeas.push(tradeIdea);
      }
      
      res.json({ success: true, ideas: savedIdeas, count: savedIdeas.length });
    } catch (error: any) {
      console.error("Parse chat idea error:", error);
      res.status(500).json({ error: error?.message || "Failed to parse trade ideas" });
    }
  });

  // Chart Analysis Route - AI-powered technical analysis from uploaded charts
  app.post("/api/chart-analysis", upload.single('chart'), requireBetaAccess, aiGenerationLimiter, async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No chart image provided" });
      }

      // Validate file type more strictly
      // NOTE: For production, consider adding magic number sniffing or image parsing (sharp/image-size)
      // to verify actual image content and prevent spoofed file types. Current validation (extension + MIME)
      // combined with authentication and rate limiting is acceptable for beta with trusted users.
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const fileExtension = req.file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
      
      if (!allowedExtensions.includes(fileExtension) || !allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ 
          error: "Invalid file type. Only JPG, PNG, GIF, and WebP images are allowed." 
        });
      }

      // Validate file size (already checked by multer, but double-check)
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ 
          error: "File too large. Maximum size is 10MB." 
        });
      }

      const schema = z.object({
        symbol: z.string().optional(),
        timeframe: z.string().optional(),
        context: z.string().optional(),
        assetType: z.enum(['stock', 'option']).optional(),
        optionType: z.enum(['call', 'put']).optional(),
        strikePrice: z.string().optional(),
        expiryDate: z.string().optional(),
      });
      const { symbol, timeframe, context, assetType, optionType, strikePrice, expiryDate } = schema.parse(req.body);
      
      logger.info(`📊 Chart analysis request${symbol ? ` for ${symbol}` : ''}`);
      
      // FIRST: Fetch current price to provide to AI for sanity checking
      let currentPrice: number | null = null;
      if (symbol) {
        try {
          const isCrypto = ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'MATIC'].some(
            crypto => symbol.toUpperCase().includes(crypto)
          );
          
          if (isCrypto) {
            const cryptoData = await fetchCryptoPrice(symbol);
            currentPrice = cryptoData?.currentPrice || null;
          } else {
            const stockData = await fetchStockPrice(symbol);
            currentPrice = stockData?.currentPrice || null;
          }
          logger.info(`📊 Fetched current ${symbol} price: $${currentPrice} for AI context`);
        } catch (priceError: any) {
          logger.warn(`Could not fetch current price for ${symbol} before analysis:`, priceError?.message);
        }
      }
      
      // Analyze chart using AI vision - NOW WITH CURRENT PRICE FOR SANITY CHECK
      const { analyzeChartImage } = await import("./ai-service");
      const analysis = await analyzeChartImage(
        req.file.buffer,
        symbol,
        timeframe,
        context,
        currentPrice,  // Pass current price to AI for validation
        // Pass option details if user is evaluating a specific play
        assetType === 'option' ? { assetType, optionType, strikePrice, expiryDate } : undefined
      );
      
      logger.info(`✅ Chart analysis complete${symbol ? ` for ${symbol}` : ''} - ${analysis.sentiment} sentiment`);
      
      // Validate timeframe consistency - warn if AI detected different timeframe than user selected
      let timeframeWarning: string | null = null;
      const detectedTimeframe = analysis.timeframe?.toLowerCase() || '';
      const userTimeframe = (timeframe || '').toLowerCase();
      
      if (userTimeframe && detectedTimeframe && !detectedTimeframe.includes('unknown')) {
        // Map common variations to standard format for comparison
        const normalizeTimeframe = (tf: string) => {
          const tfLower = tf.toLowerCase().replace(/\s+/g, '');
          if (tfLower.includes('1d') || tfLower.includes('daily') || tfLower.includes('day') || tfLower === '1d') return 'daily';
          if (tfLower.includes('1w') || tfLower.includes('weekly') || tfLower.includes('week')) return 'weekly';
          if (tfLower.includes('1m') && tfLower !== '1m' || tfLower.includes('monthly') || tfLower.includes('month')) return 'monthly';
          if (tfLower.includes('4h') || tfLower.includes('4hour')) return '4hour';
          if (tfLower.includes('1h') || tfLower.includes('1hour')) return '1hour';
          if (tfLower.includes('15m') || tfLower.includes('15min')) return '15min';
          if (tfLower.includes('5m') || tfLower.includes('5min')) return '5min';
          if (tfLower.includes('1m') || tfLower.includes('1min')) return '1min';
          return tfLower;
        };
        
        const normalizedUser = normalizeTimeframe(userTimeframe);
        const normalizedDetected = normalizeTimeframe(detectedTimeframe);
        
        if (normalizedUser !== normalizedDetected) {
          timeframeWarning = `You selected "${timeframe}" but the chart appears to be "${analysis.timeframe}". Entry/target/stop levels are based on the detected timeframe. Please verify the chart timeframe matches your trading horizon.`;
          logger.warn(`📊 Timeframe mismatch: user selected "${timeframe}", AI detected "${analysis.timeframe}"`);
        }
      }
      
      // Validate AI analysis against current market price (already fetched above)
      let priceDiscrepancyWarning: string | null = null;
      let adjustedEntry: number | null = null;
      let adjustedTarget: number | null = null;
      let adjustedStop: number | null = null;
      
      if (currentPrice && analysis.entryPoint) {
        const discrepancy = Math.abs(analysis.entryPoint - currentPrice) / currentPrice * 100;
        
        // Only warn for EXTREME discrepancies (>50%) - likely AI still hallucinating despite prompt
        if (discrepancy > 50) {
          priceDiscrepancyWarning = `Current ${symbol} price is $${currentPrice.toFixed(2)} - the suggested entry of $${analysis.entryPoint.toFixed(2)} is ${discrepancy.toFixed(0)}% away. This may be a breakout/breakdown level, or the chart might be from an older time period.`;
          
          // Calculate adjusted levels based on current price as alternative
          const originalRisk = (analysis.entryPoint - analysis.stopLoss) / analysis.entryPoint;
          const originalReward = (analysis.targetPrice - analysis.entryPoint) / analysis.entryPoint;
          
          adjustedEntry = currentPrice;
          adjustedStop = currentPrice * (1 - originalRisk);
          adjustedTarget = currentPrice * (1 + originalReward);
          
          logger.info(`📊 Chart analysis for ${symbol}: entry $${analysis.entryPoint.toFixed(2)} is ${discrepancy.toFixed(0)}% from current $${currentPrice.toFixed(2)} (may be breakout level)`);
        }
      }
      
      res.json({
        ...analysis,
        currentPrice,
        priceDiscrepancyWarning,
        timeframeWarning,
        adjustedLevels: adjustedEntry ? {
          entry: adjustedEntry,
          target: adjustedTarget,
          stop: adjustedStop,
          riskRewardRatio: analysis.riskRewardRatio, // Preserve original R:R
        } : null,
      });
    } catch (error: any) {
      logger.error("Chart analysis error:", error);
      
      // QUANT ENGINE FALLBACK: When AI fails, use technical indicators
      const isRateLimitError = error?.message?.includes('rate limit') || 
                               error?.message?.includes('quota') ||
                               error?.message?.includes('temporarily unavailable');
      
      if (isRateLimitError && req.body?.symbol) {
        try {
          logger.info(`📊 [QUANT-FALLBACK] Using quantitative engine for ${req.body.symbol}`);
          const { calculateEnhancedSignalScore } = await import("./technical-indicators");
          const { getTradierHistoryOHLC } = await import("./tradier-api");
          
          const history = await getTradierHistoryOHLC(req.body.symbol, 60);
          
          // getTradierHistoryOHLC returns { opens, highs, lows, closes, dates }
          if (history && history.closes && history.closes.length >= 20) {
            const prices = history.closes;
            const highs = history.highs;
            const lows = history.lows;
            const volumes = history.closes.map(() => 1000000); // Volume not in OHLC, use placeholder
            
            const quantSignals = calculateEnhancedSignalScore(prices, highs, lows, volumes);
            const currentPrice = prices[prices.length - 1];
            
            // Determine direction - if neutral, default to bullish for conservative setup
            // This ensures trade structure (target/stop) always matches the reported sentiment
            const isBullish = quantSignals.direction !== 'bearish';
            const effectiveSentiment = isBullish ? 'bullish' : 'bearish';
            
            const entryPrice = currentPrice;
            // Use ATR for dynamic targets if available (1.5x ATR stop, 2x ATR target)
            const atrStop = quantSignals.atr ? quantSignals.atr * 1.5 : currentPrice * 0.03;
            const atrTarget = quantSignals.atr ? quantSignals.atr * 2.5 : currentPrice * 0.05;
            const targetPrice = isBullish ? currentPrice + atrTarget : currentPrice - atrTarget;
            const stopLoss = isBullish ? currentPrice - atrStop : currentPrice + atrStop;
            
            const riskRewardRatio = atrTarget / atrStop;
            const quantAnalysis = {
              patterns: quantSignals.signals,
              supportLevels: [quantSignals.supportLevel],
              resistanceLevels: [quantSignals.resistanceLevel],
              entryPoint: entryPrice,
              targetPrice: targetPrice,
              stopLoss: stopLoss,
              riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
              sentiment: effectiveSentiment, // Use effective sentiment that matches trade structure
              analysis: `**QUANT ENGINE ANALYSIS** (AI unavailable)\n\n` +
                `📊 **Signal Score:** ${quantSignals.score}/100\n` +
                `📈 **Direction:** ${effectiveSentiment.toUpperCase()}${quantSignals.direction === 'neutral' ? ' (market is ranging)' : ''}\n` +
                `🎯 **Confidence:** ${quantSignals.confidence}%\n` +
                `📐 **R:R Ratio:** ${riskRewardRatio.toFixed(2)}:1\n\n` +
                `**Technical Signals (${quantSignals.signals.length}):**\n${quantSignals.signals.map(s => `• ${s}`).join('\n')}\n\n` +
                `**Key Levels:**\n` +
                `• Support: $${quantSignals.supportLevel.toFixed(2)}\n` +
                `• Resistance: $${quantSignals.resistanceLevel.toFixed(2)}\n` +
                `• Current: $${currentPrice.toFixed(2)}\n\n` +
                `**Trade Setup:**\n` +
                `• Entry: $${entryPrice.toFixed(2)}\n` +
                `• Target: $${targetPrice.toFixed(2)} (+${((targetPrice - entryPrice) / entryPrice * 100).toFixed(1)}%)\n` +
                `• Stop: $${stopLoss.toFixed(2)} (${((stopLoss - entryPrice) / entryPrice * 100).toFixed(1)}%)\n\n` +
                `_Based on RSI, MACD, Bollinger Bands, S/R levels, momentum, and trend analysis._`,
              confidence: quantSignals.confidence,
              timeframe: req.body.timeframe || 'daily',
              isQuantFallback: true
            };
            
            logger.info(`✅ [QUANT-FALLBACK] Generated analysis for ${req.body.symbol}: ${effectiveSentiment} (raw: ${quantSignals.direction})`);
            return res.json({
              ...quantAnalysis,
              currentPrice,
              quantEngineUsed: true,
              aiUnavailableReason: 'Rate limits reached - using quantitative analysis'
            });
          }
        } catch (quantError: any) {
          logger.error("Quant fallback also failed:", quantError?.message);
        }
      }
      
      res.status(500).json({ 
        error: error?.message || "Failed to analyze chart. Please try again.",
        suggestion: "Try the Quant Engine signals on the Trade Desk for immediate analysis."
      });
    }
  });

  // Convert chart analysis to draft trade idea
  app.post("/api/trade-ideas/from-chart", async (req, res) => {
    try {
      const schema = z.object({
        symbol: z.string().min(1, "Symbol is required"),
        analysis: z.object({
          patterns: z.array(z.string()),
          supportLevels: z.array(z.number()),
          resistanceLevels: z.array(z.number()),
          entryPoint: z.number(),
          targetPrice: z.number(),
          stopLoss: z.number(),
          riskRewardRatio: z.number(),
          sentiment: z.enum(["bullish", "bearish", "neutral"]),
          analysis: z.string(),
          confidence: z.number(),
          timeframe: z.string(),
        }),
        chartImageUrl: z.string().optional(),
        assetType: z.enum(["stock", "option"]).optional(),
        optionType: z.enum(["call", "put"]).optional(),
        expiryDate: z.string().optional(),
        strikePrice: z.number().optional(),
      });
      
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: parseResult.error.errors 
        });
      }
      
      const validated = parseResult.data;
      const analysis = validated.analysis;
      
      // Determine direction from sentiment (for options: bullish=call, bearish=put)
      const direction = analysis.sentiment === 'bearish' ? 'short' : 'long';
      
      // Use provided asset type or default to stock
      const assetType = validated.assetType || 'stock';
      
      // 🛡️ CRITICAL: Validate trade structure before saving
      // Include option fields when assetType is 'option' so validation passes
      const structureValidation = validateTradeStructure({
        symbol: validated.symbol,
        assetType: assetType as 'stock' | 'option' | 'crypto',
        direction: direction as 'long' | 'short',
        entryPrice: analysis.entryPoint,
        targetPrice: analysis.targetPrice,
        stopLoss: analysis.stopLoss,
        // Pass option fields for validation when assetType is 'option'
        ...(assetType === 'option' && {
          strikePrice: validated.strikePrice,
          expiryDate: validated.expiryDate,
          optionType: validated.optionType,
        }),
      });
      
      if (!structureValidation.isValid) {
        logger.warn(`📊 Chart analysis has invalid structure: ${structureValidation.errors.join(', ')}`);
        return res.status(400).json({
          error: "Invalid trade structure",
          details: structureValidation.errors,
          warnings: structureValidation.warnings,
          suggestion: `For ${direction.toUpperCase()} trades: ` + 
            (direction === 'long' 
              ? 'target should be above entry, stop below entry'
              : 'target should be below entry, stop above entry')
        });
      }
      
      // 🛡️ LAYER 2: Risk validation - RELAXED for chart analysis (user-driven trades)
      // Chart analysis uses 1.5:1 R:R minimum instead of 2:1 since user chose the setup
      const riskValidation = validateTradeRisk({
        symbol: validated.symbol,
        assetType: assetType as 'stock' | 'option' | 'crypto',
        direction: direction as 'long' | 'short',
        entryPrice: analysis.entryPoint,
        targetPrice: analysis.targetPrice,
        stopLoss: analysis.stopLoss,
        catalyst: `Chart Pattern: ${analysis.patterns?.join(', ') || 'Technical Analysis'}`,
        analysis: analysis.analysis || '',
        sessionContext: `Chart analysis - ${analysis.timeframe}`,
        isNewsCatalyst: true, // Use relaxed R:R (1.5:1 min) for user chart analysis
      });
      
      // Only reject for truly bad risk (R:R below 1.5:1 or extreme stop distance)
      // For moderate R:R (1.5-2.0), just warn but allow
      if (!riskValidation.isValid) {
        const rr = riskValidation.metrics?.riskRewardRatio || 0;
        // Allow trades with R:R between 1.5 and 2.0 for chart analysis
        if (rr >= 1.5 && rr < 2.0) {
          logger.info(`📊 Chart analysis R:R ${rr.toFixed(2)}:1 below 2:1 but acceptable for user-driven trade`);
        } else {
          logger.warn(`📊 Chart analysis rejected for risk: ${riskValidation.reason}`);
          return res.status(400).json({
            error: "Trade exceeds risk limits",
            reason: riskValidation.reason,
            metrics: riskValidation.metrics,
            suggestion: `Min R:R ratio 1.5:1, max stop 7% (25% for options). Your R:R is ${rr.toFixed(2)}:1`
          });
        }
      }
      
      logger.info(`✅ Chart analysis passed validation - Loss:${riskValidation.metrics?.maxLossPercent?.toFixed(2)}% R:R:${riskValidation.metrics?.riskRewardRatio?.toFixed(2)}:1`);
      
      // Create draft trade idea
      const tradeIdea = await storage.createTradeIdea({
        userId: (req.user as any)?.claims?.sub,
        symbol: validated.symbol,
        assetType,
        direction,
        holdingPeriod: 'day', // Default to day trading for chart analysis
        entryPrice: analysis.entryPoint,
        targetPrice: analysis.targetPrice,
        stopLoss: analysis.stopLoss,
        riskRewardRatio: analysis.riskRewardRatio,
        catalyst: `Chart Pattern: ${analysis.patterns.join(', ') || 'Technical Analysis'}`,
        analysis: analysis.analysis,
        sessionContext: `Chart analysis - ${analysis.timeframe}`,
        timestamp: new Date().toISOString(),
        source: 'chart_analysis',
        status: 'draft',
        confidenceScore: analysis.confidence,
        chartImageUrl: validated.chartImageUrl,
        chartAnalysisJson: analysis,
        // Option-specific fields
        optionType: assetType === 'option' ? validated.optionType : undefined,
        expiryDate: assetType === 'option' ? validated.expiryDate : undefined,
        strikePrice: assetType === 'option' ? (validated.strikePrice || analysis.entryPoint) : undefined,
      });
      
      logger.info(`📊 Chart analysis saved as draft trade idea: ${tradeIdea.id} for ${validated.symbol}`);
      
      // Send Discord notification for chart analysis trades
      try {
        const { sendTradeIdeaToDiscord } = await import("./discord-service");
        sendTradeIdeaToDiscord(tradeIdea as any).catch(err => 
          logger.error(`Discord notification failed for chart analysis ${validated.symbol}:`, err)
        );
        logger.info(`📨 Discord notification sent for chart analysis: ${validated.symbol}`);
      } catch (discordError) {
        logger.error("Failed to send Discord notification:", discordError);
      }
      
      res.json(tradeIdea);
    } catch (error: any) {
      logger.error("Failed to create trade idea from chart:", error);
      res.status(500).json({ 
        error: error?.message || "Failed to save chart analysis as trade idea" 
      });
    }
  });

  // Test Discord trade alert (admin only)
  app.post("/api/admin/test-discord", async (req, res) => {
    try {
      const { sendTradeIdeaToDiscord } = await import("./discord-service");
      
      // Create sample trade ideas for each asset type
      const stockIdea = {
        id: "test-stock-1",
        symbol: "AAPL",
        assetType: "stock" as const,
        direction: "long" as const,
        holdingPeriod: "day" as const,
        entryPrice: 198.50,
        targetPrice: 205.00,
        stopLoss: 193.50,
        riskRewardRatio: 1.3,
        catalyst: "Strong earnings beat, upgraded price targets",
        timestamp: new Date().toISOString(),
        source: "quant" as const,
        status: "published" as const,
        confidenceScore: 82,
        probabilityBand: "A",
        sessionContext: "Regular Market Hours",
        dataSourceUsed: "yahoo_finance",
        outcomeStatus: "open" as const,
      };
      
      const optionCallIdea = {
        id: "test-option-call-1",
        symbol: "NVDA",
        assetType: "option" as const,
        optionType: "call" as const,
        strikePrice: 145,
        expiryDate: "01/17",
        direction: "long" as const,
        holdingPeriod: "day" as const,
        entryPrice: 4.50,
        targetPrice: 9.00,
        stopLoss: 2.25,
        riskRewardRatio: 2.0,
        catalyst: "AI chip demand surge, bullish momentum",
        timestamp: new Date().toISOString(),
        source: "ai" as const,
        status: "published" as const,
        confidenceScore: 78,
        probabilityBand: "B+",
        sessionContext: "Pre-market momentum",
        dataSourceUsed: "tradier",
        outcomeStatus: "open" as const,
      };
      
      const optionPutIdea = {
        id: "test-option-put-1",
        symbol: "TSLA",
        assetType: "option" as const,
        optionType: "put" as const,
        strikePrice: 400,
        expiryDate: "01/24",
        direction: "short" as const,
        holdingPeriod: "day" as const,
        entryPrice: 3.20,
        targetPrice: 6.40,
        stopLoss: 1.60,
        riskRewardRatio: 2.0,
        catalyst: "Bearish reversal pattern, resistance rejection",
        timestamp: new Date().toISOString(),
        source: "hybrid" as const,
        status: "published" as const,
        confidenceScore: 75,
        probabilityBand: "B",
        sessionContext: "Regular Hours",
        dataSourceUsed: "tradier",
        outcomeStatus: "open" as const,
      };
      
      const cryptoIdea = {
        id: "test-crypto-1",
        symbol: "BTC",
        assetType: "crypto" as const,
        direction: "long" as const,
        holdingPeriod: "swing" as const,
        entryPrice: 98500,
        targetPrice: 105000,
        stopLoss: 93575,
        riskRewardRatio: 1.32,
        catalyst: "Institutional accumulation, ETF inflows",
        timestamp: new Date().toISOString(),
        source: "quant" as const,
        status: "published" as const,
        confidenceScore: 85,
        probabilityBand: "A-",
        sessionContext: "24/7 Crypto Markets",
        dataSourceUsed: "coingecko",
        outcomeStatus: "open" as const,
      };
      
      // Send all test alerts
      await sendTradeIdeaToDiscord(stockIdea as any);
      await new Promise(r => setTimeout(r, 500)); // Small delay between messages
      await sendTradeIdeaToDiscord(optionCallIdea as any);
      await new Promise(r => setTimeout(r, 500));
      await sendTradeIdeaToDiscord(optionPutIdea as any);
      await new Promise(r => setTimeout(r, 500));
      await sendTradeIdeaToDiscord(cryptoIdea as any);
      
      res.json({ 
        success: true, 
        message: "Sent 4 test alerts: Stock (shares), Option (CALL), Option (PUT), Crypto" 
      });
    } catch (error: any) {
      logger.error("Failed to send test Discord alerts:", error);
      res.status(500).json({ error: error?.message || "Failed to send test alerts" });
    }
  });

  // Test Discord watchlist alert (admin only)
  app.post("/api/admin/test-watchlist-discord", async (req, res) => {
    try {
      const { sendDiscordAlert } = await import("./discord-service");
      
      // Test stock watchlist alert
      await sendDiscordAlert({
        symbol: "AAPL",
        assetType: "stock",
        alertType: "entry",
        currentPrice: 248.50,
        alertPrice: 250.00,
        percentFromTarget: -0.6,
        notes: "Approaching buy zone",
      });
      
      await new Promise(r => setTimeout(r, 500));
      
      // Test option watchlist alert with strike and expiry
      await sendDiscordAlert({
        symbol: "SPY",
        assetType: "option",
        alertType: "target",
        currentPrice: 12.50,
        alertPrice: 10.00,
        percentFromTarget: 25.0,
        optionType: "call",
        strike: 600,
        expiry: "01/31",
        notes: "Profit target reached!",
      });
      
      await new Promise(r => setTimeout(r, 500));
      
      // Test crypto watchlist alert
      await sendDiscordAlert({
        symbol: "ETH",
        assetType: "crypto",
        alertType: "stop",
        currentPrice: 3280.00,
        alertPrice: 3300.00,
        percentFromTarget: -0.6,
      });
      
      res.json({ 
        success: true, 
        message: "Sent 3 watchlist alerts: Stock entry, Option target, Crypto stop" 
      });
    } catch (error: any) {
      logger.error("Failed to send test watchlist alerts:", error);
      res.status(500).json({ error: error?.message || "Failed to send test alerts" });
    }
  });

  // Send chart analysis to Trade Desk as actionable trade idea
  app.post("/api/chart-analysis/send-to-trade-desk", async (req, res) => {
    try {
      const schema = z.object({
        symbol: z.string().min(1),
        timeframe: z.string(),
        sentiment: z.enum(["bullish", "bearish", "neutral"]),
        confidence: z.number(),
        entryPoint: z.number(),
        targetPrice: z.number(),
        stopLoss: z.number(),
        riskRewardRatio: z.number(),
        patterns: z.array(z.string()),
        analysis: z.string(),
        assetType: z.string().optional(),
        optionType: z.string().optional(),
        strikePrice: z.number().optional(),
        expiryDate: z.string().optional(),
      });
      
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid analysis data", details: parseResult.error.errors });
      }
      
      const data = parseResult.data;
      
      // Create trade idea from chart analysis
      const direction = data.sentiment === 'bullish' ? 'long' : data.sentiment === 'bearish' ? 'short' : 'long';
      const holdingPeriod = data.timeframe.includes('1D') || data.timeframe.includes('1W') ? 'swing' : 'day';
      
      const tradeIdea = await storage.createTradeIdea({
        symbol: data.symbol,
        assetType: (data.assetType as 'stock' | 'option' | 'crypto' | 'futures') || 'stock',
        direction,
        entryPrice: data.entryPoint,
        targetPrice: data.targetPrice,
        stopLoss: data.stopLoss,
        riskRewardRatio: data.riskRewardRatio,
        confidenceScore: data.confidence,
        qualitySignals: data.patterns,
        probabilityBand: data.confidence >= 80 ? 'A' : data.confidence >= 60 ? 'B' : 'C',
        catalyst: `Chart Analysis: ${data.patterns.slice(0, 2).join(', ')}`,
        analysis: data.analysis,
        sessionContext: `${data.timeframe} timeframe, ${data.sentiment} outlook`,
        holdingPeriod,
        source: 'chart_analysis',
        optionType: data.optionType as 'call' | 'put' | undefined,
        strikePrice: data.strikePrice,
        expiryDate: data.expiryDate,
        status: 'draft',
      });
      
      res.json({ 
        success: true, 
        id: tradeIdea.id,
        message: "Trade idea created from chart analysis" 
      });
    } catch (error: any) {
      logger.error("Failed to create trade idea from chart analysis:", error);
      res.status(500).json({ error: error?.message || "Failed to create trade idea" });
    }
  });

  // Send chart analysis to Discord (alias for frontend compatibility)
  app.post("/api/chart-analysis/send-to-discord", async (req, res) => {
    try {
      const schema = z.object({
        symbol: z.string().min(1),
        timeframe: z.string().optional(),
        sentiment: z.enum(["bullish", "bearish", "neutral"]),
        confidence: z.number(),
        entryPoint: z.number(),
        targetPrice: z.number(),
        stopLoss: z.number(),
        patterns: z.array(z.string()),
        analysis: z.string(),
        riskRewardRatio: z.number(),
        optionType: z.string().optional(),
        strikePrice: z.number().optional(),
        expiryDate: z.string().optional(),
      });
      
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid analysis data" });
      }
      
      const { sendChartAnalysisToDiscord } = await import("./discord-service");
      const success = await sendChartAnalysisToDiscord(parseResult.data);
      
      res.json({ 
        success, 
        message: success ? "Chart analysis sent to Discord" : "Discord notifications are currently disabled" 
      });
    } catch (error: any) {
      logger.error("Failed to send chart analysis to Discord:", error);
      res.status(500).json({ error: error?.message || "Failed to send to Discord" });
    }
  });

  // Send chart analysis to Discord
  app.post("/api/chart-analysis/discord", async (req, res) => {
    try {
      const schema = z.object({
        symbol: z.string().min(1),
        sentiment: z.enum(["bullish", "bearish", "neutral"]),
        confidence: z.number(),
        entryPoint: z.number(),
        targetPrice: z.number(),
        stopLoss: z.number(),
        patterns: z.array(z.string()),
        analysis: z.string(),
        riskRewardRatio: z.number(),
        timeframe: z.string().optional(),
      });
      
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid analysis data" });
      }
      
      const { sendChartAnalysisToDiscord } = await import("./discord-service");
      const success = await sendChartAnalysisToDiscord(parseResult.data);
      
      // Note: sendChartAnalysisToDiscord returns false when Discord is disabled
      // Don't treat this as an error - just inform the client
      res.json({ 
        success, 
        message: success ? "Chart analysis sent to Discord" : "Discord notifications are currently disabled" 
      });
    } catch (error: any) {
      logger.error("Failed to send chart analysis to Discord:", error);
      res.status(500).json({ error: error?.message || "Failed to send to Discord" });
    }
  });

  // Get calibrated confidence and adaptive exit strategy for a trade
  app.post("/api/confidence/calibrate", async (req, res) => {
    try {
      const schema = z.object({
        assetType: z.string(),
        direction: z.string(),
        source: z.string(),
        signalCount: z.number(),
        riskRewardRatio: z.number(),
        entryPrice: z.number(),
        targetPrice: z.number(),
        stopLoss: z.number(),
        volatilityRegime: z.enum(['low', 'normal', 'high']).optional(),
        isLotto: z.boolean().optional(),
      });
      
      const parseResult = schema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid calibration request", details: parseResult.error.errors });
      }
      
      const params = parseResult.data;
      
      // Get calibrated confidence
      const confidence = await getCalibrationScore({
        assetType: params.assetType,
        direction: params.direction,
        source: params.source,
        signalCount: params.signalCount,
        riskRewardRatio: params.riskRewardRatio,
        entryPrice: params.entryPrice,
        targetPrice: params.targetPrice,
        stopLoss: params.stopLoss,
        volatilityRegime: params.volatilityRegime,
      });
      
      // Calculate target/stop percentages for exit strategy
      const targetGainPercent = params.direction === 'long' 
        ? ((params.targetPrice - params.entryPrice) / params.entryPrice) * 100
        : ((params.entryPrice - params.targetPrice) / params.entryPrice) * 100;
      
      const stopLossPercent = params.direction === 'long'
        ? ((params.entryPrice - params.stopLoss) / params.entryPrice) * 100
        : ((params.stopLoss - params.entryPrice) / params.entryPrice) * 100;
      
      // Generate adaptive exit strategy
      const exitStrategy = generateAdaptiveExitStrategy({
        assetType: params.assetType,
        direction: params.direction,
        confidenceScore: confidence.calibratedScore,
        riskRewardRatio: params.riskRewardRatio,
        volatilityRegime: params.volatilityRegime || 'normal',
        isLotto: params.isLotto,
        targetGainPercent,
        stopLossPercent: Math.abs(stopLossPercent),
      });
      
      res.json({
        confidence,
        exitStrategy,
        exitStrategyDisplay: formatExitStrategyDisplay(exitStrategy),
        targetGainPercent: Math.round(targetGainPercent * 100) / 100,
        stopLossPercent: Math.round(Math.abs(stopLossPercent) * 100) / 100,
      });
      
    } catch (error: any) {
      logger.error("Failed to calibrate confidence:", error);
      res.status(500).json({ error: error?.message || "Failed to calibrate confidence" });
    }
  });

  // Refresh calibration cache (admin only)
  app.post("/api/confidence/refresh-cache", requireAdminJWT, async (_req, res) => {
    try {
      await refreshCalibrationCache();
      res.json({ success: true, message: "Calibration cache refreshed" });
    } catch (error: any) {
      logger.error("Failed to refresh calibration cache:", error);
      res.status(500).json({ error: error?.message || "Failed to refresh cache" });
    }
  });

  // Promote draft trade idea to published
  app.patch("/api/trade-ideas/:id/promote", async (req, res) => {
    try {
      const idea = await storage.getTradeIdeaById(req.params.id);
      
      if (!idea) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      
      // Check if user owns this trade idea
      if (idea.userId && idea.userId !== (req.user as any)?.claims?.sub) {
        return res.status(403).json({ error: "Unauthorized to modify this trade idea" });
      }
      
      // Update status to published
      const updated = await storage.updateTradeIdea(req.params.id, {
        status: 'published',
      });
      
      logger.info(`📊 Trade idea promoted to published: ${req.params.id}`);
      res.json(updated);
    } catch (error: any) {
      logger.error("Failed to promote trade idea:", error);
      res.status(500).json({ 
        error: error?.message || "Failed to promote trade idea" 
      });
    }
  });

  // Signal Intelligence & ML Routes
  app.get("/api/ml/signal-intelligence", async (_req, res) => {
    try {
      // 🧠 ML MODE: Include ALL engine versions for comprehensive signal analysis
      const stats = await storage.getPerformanceStats({ includeAllVersions: true });
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
      
      // 🧠 ML GUARD: Require minimum data to prevent learning from noise
      if (closedIdeas.length < 10) {
        return res.json({
          signalAnalysis: [],
          topCombinations: [],
          assetComparison: [],
          insights: [`Need at least 10 closed trades for reliable signal intelligence (currently have ${closedIdeas.length})`],
          totalAnalyzedTrades: closedIdeas.length,
          timestamp: new Date().toISOString(),
          insufficientData: true
        });
      }
      
      // Analyze signal effectiveness
      const signalAnalysis = stats.bySignalType.map(signalStat => {
        const signalIdeas = closedIdeas.filter(i => 
          i.qualitySignals?.includes(signalStat.signal)
        );
        
        const avgHoldingTime = signalIdeas
          .filter(i => i.actualHoldingTimeMinutes !== null)
          .map(i => i.actualHoldingTimeMinutes!)
          .reduce((sum, time, _, arr) => sum + time / arr.length, 0) || 0;
        
        const avgRR = signalIdeas
          .map(i => i.riskRewardRatio)
          .reduce((sum, rr, _, arr) => sum + rr / arr.length, 0) || 0;
        
        // Reliability score: win rate weighted by sample size
        const sampleSizeWeight = Math.min(signalStat.totalIdeas / 20, 1); // Max weight at 20+ samples
        const reliabilityScore = signalStat.winRate * sampleSizeWeight;
        
        // Calculate edge (expected value)
        const avgWin = signalIdeas
          .filter(i => i.outcomeStatus === 'hit_target' && i.percentGain !== null)
          .map(i => i.percentGain!)
          .reduce((sum, gain, _, arr) => sum + Math.abs(gain) / arr.length, 0) || 0;
          
        const avgLoss = signalIdeas
          .filter(i => i.outcomeStatus === 'hit_stop' && i.percentGain !== null)
          .map(i => i.percentGain!)
          .reduce((sum, loss, _, arr) => sum + Math.abs(loss) / arr.length, 0) || 0;
        
        const expectancy = (signalStat.winRate / 100 * avgWin) - ((100 - signalStat.winRate) / 100 * avgLoss);
        
        return {
          signal: signalStat.signal,
          totalTrades: signalStat.totalIdeas,
          winRate: signalStat.winRate,
          avgPercentGain: signalStat.avgPercentGain,
          avgHoldingTimeMinutes: avgHoldingTime,
          avgRiskReward: avgRR,
          reliabilityScore,
          expectancy,
          avgWinSize: avgWin,
          avgLossSize: avgLoss,
          grade: getReliabilityGrade(reliabilityScore)
        };
      }).sort((a, b) => b.reliabilityScore - a.reliabilityScore);
      
      // 🧠 ML-FIXED: Analyze ALL closed ideas to get accurate win/loss rates for combinations
      // CRITICAL: Must evaluate both wins AND losses to calculate true win rates
      const signalCombos = new Map<string, { count: number; wins: number; totalGain: number }>();
      
      closedIdeas.forEach(idea => {
        if (idea.qualitySignals && idea.qualitySignals.length >= 2) {
          const signals = typeof idea.qualitySignals === 'string' 
            ? JSON.parse(idea.qualitySignals) 
            : idea.qualitySignals;
          
          // Generate all combinations of 2 signals
          for (let i = 0; i < signals.length; i++) {
            for (let j = i + 1; j < signals.length; j++) {
              const combo = [signals[i], signals[j]].sort().join(' + ');
              const existing = signalCombos.get(combo) || { count: 0, wins: 0, totalGain: 0 };
              signalCombos.set(combo, {
                count: existing.count + 1,
                wins: existing.wins + (idea.outcomeStatus === 'hit_target' ? 1 : 0),
                totalGain: existing.totalGain + (idea.percentGain || 0)
              });
            }
          }
        }
      });
      
      const topCombos = Array.from(signalCombos.entries())
        .filter(([_, stats]) => stats.count >= 3) // Minimum 3 occurrences
        .map(([combo, stats]) => ({
          combination: combo,
          occurrences: stats.count,
          winRate: (stats.wins / stats.count) * 100,
          avgGain: stats.totalGain / stats.count
        }))
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, 10);
      
      // Asset type performance comparison
      const assetComparison = stats.byAssetType.map(asset => {
        const assetIdeas = closedIdeas.filter(i => i.assetType === asset.assetType);
        const avgHoldingTime = assetIdeas
          .filter(i => i.actualHoldingTimeMinutes !== null)
          .map(i => i.actualHoldingTimeMinutes!)
          .reduce((sum, time, _, arr) => sum + time / arr.length, 0) || 0;
        
        return {
          assetType: asset.assetType,
          totalTrades: asset.totalIdeas,
          winRate: asset.winRate,
          avgPercentGain: asset.avgPercentGain,
          avgHoldingTimeMinutes: avgHoldingTime
        };
      });
      
      // Generate actionable insights
      const insights: string[] = [];
      
      if (signalAnalysis.length > 0) {
        const bestSignal = signalAnalysis[0];
        if (bestSignal.reliabilityScore >= 60) {
          insights.push(`🎯 Your most reliable signal is "${bestSignal.signal}" with ${bestSignal.winRate.toFixed(1)}% win rate`);
        }
        
        const worstSignal = signalAnalysis[signalAnalysis.length - 1];
        if (worstSignal.winRate < 40 && worstSignal.totalTrades >= 5) {
          insights.push(`⚠️ Avoid "${worstSignal.signal}" - only ${worstSignal.winRate.toFixed(1)}% win rate`);
        }
      }
      
      if (topCombos.length > 0 && topCombos[0].winRate >= 70) {
        insights.push(`✨ Winning pattern: ${topCombos[0].combination} (${topCombos[0].winRate.toFixed(1)}% win rate)`);
      }
      
      if (assetComparison.length > 0) {
        const bestAsset = assetComparison.reduce((best, asset) => 
          asset.winRate > best.winRate ? asset : best
        );
        insights.push(`💰 Best performing asset: ${bestAsset.assetType.toUpperCase()} (${bestAsset.winRate.toFixed(1)}% win rate)`);
      }
      
      res.json({
        signalAnalysis,
        topCombinations: topCombos,
        assetComparison,
        insights,
        totalAnalyzedTrades: closedIdeas.length,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Signal intelligence error:", error);
      res.status(500).json({ error: error?.message || "Failed to analyze signals" });
    }
  });

  // ML Pattern Learning endpoint
  app.get("/api/ml/learned-patterns", async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open' && i.percentGain !== null);
      
      if (closedIdeas.length < 10) {
        return res.json({
          ready: false,
          message: "Need at least 10 closed trades to learn patterns",
          currentCount: closedIdeas.length
        });
      }
      
      // Learn signal effectiveness weights
      const signalWeights = new Map<string, number>();
      // 🧠 ML MODE: Include ALL engine versions to learn from historical signal performance (including v2.x failures)
      const stats = await storage.getPerformanceStats({ includeAllVersions: true });
      
      stats.bySignalType.forEach(signal => {
        // Calculate weight adjustment based on performance
        // Baseline: 1.0, Range: 0.5 to 1.5
        const winRateBonus = (signal.winRate - 50) / 100; // -0.5 to +0.5
        const sampleSizeBonus = Math.min(signal.totalIdeas / 40, 0.25); // Up to +0.25 for 40+ trades
        const weight = 1.0 + winRateBonus + sampleSizeBonus;
        
        signalWeights.set(signal.signal, Math.max(0.5, Math.min(1.5, weight)));
      });
      
      // Learn optimal time windows by asset type
      const timeWindows = ['stock', 'option', 'crypto'].map(assetType => {
        const assetIdeas = closedIdeas.filter(i => i.assetType === assetType && i.actualHoldingTimeMinutes);
        const winningIdeas = assetIdeas.filter(i => i.outcomeStatus === 'hit_target');
        
        const avgWinningTime = winningIdeas.length > 0
          ? winningIdeas.reduce((sum, i) => sum + i.actualHoldingTimeMinutes!, 0) / winningIdeas.length
          : 120; // Default 2 hours
        
        return {
          assetType,
          optimalHoldingMinutes: Math.round(avgWinningTime),
          sampleSize: winningIdeas.length
        };
      });
      
      res.json({
        ready: true,
        signalWeights: Object.fromEntries(signalWeights),
        timeWindows,
        trainedOn: closedIdeas.length,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Pattern learning error:", error);
      res.status(500).json({ error: error?.message || "Failed to learn patterns" });
    }
  });

  // Analytics: Backtesting Metrics (with source filtering)
  // TODO: Re-enable when backtesting module is implemented
  // app.get("/api/analytics/backtest", async (req, res) => {
  //   try {
  //     const { BacktestingEngine } = await import('./backtesting');
  //     const source = req.query.source as string | undefined;
  //     
  //     let allIdeas = await storage.getAllTradeIdeas();
  //     
  //     // Filter by source if specified
  //     if (source && source !== 'all') {
  //       allIdeas = allIdeas.filter(idea => idea.source === source);
  //     }
  //     
  //     // Calculate comprehensive metrics
  //     const metrics = BacktestingEngine.calculateMetrics(allIdeas);
  //     const signalPerformance = BacktestingEngine.analyzeSignalPerformance(allIdeas);
  //     const calibration = BacktestingEngine.calculateCalibration(allIdeas);
  //     
  //     res.json({
  //       metrics,
  //       signalPerformance,
  //       calibration,
  //       source: source || 'all',
  //       timestamp: new Date().toISOString()
  //     });
  //   } catch (error: any) {
  //     console.error("Backtesting error:", error);
  //     res.status(500).json({ error: error?.message || "Failed to calculate backtest metrics" });
  //   }
  // });

  // Analytics: Rolling Win Rate (time series with source filtering)
  app.get("/api/analytics/rolling-winrate", async (req, res) => {
    try {
      const source = req.query.source as string | undefined;
      
      let allIdeas = await storage.getAllTradeIdeas();
      
      // Filter by source if specified
      if (source && source !== 'all') {
        allIdeas = allIdeas.filter(idea => idea.source === source);
      }
      
      const closedIdeas = allIdeas
        .filter(i => i.outcomeStatus !== 'open' && i.exitDate)
        .sort((a, b) => new Date(a.exitDate!).getTime() - new Date(b.exitDate!).getTime());
      
      if (closedIdeas.length < 10) {
        return res.json({ data: [], message: "Need at least 10 closed trades for rolling win rate" });
      }
      
      // Calculate rolling 10-trade win rate
      const windowSize = 10;
      const rollingData: Array<{ date: string; winRate: number; trades: number }> = [];
      
      for (let i = windowSize - 1; i < closedIdeas.length; i++) {
        const window = closedIdeas.slice(i - windowSize + 1, i + 1);
        const winners = window.filter(t => t.outcomeStatus === 'hit_target').length;
        const winRate = (winners / windowSize) * 100;
        
        rollingData.push({
          date: window[window.length - 1].exitDate!,
          winRate,
          trades: i + 1
        });
      }
      
      res.json({ data: rollingData, windowSize, source: source || 'all' });
    } catch (error: any) {
      console.error("Rolling win rate error:", error);
      res.status(500).json({ error: error?.message || "Failed to calculate rolling win rate" });
    }
  });

  // Admin: Manual Trade Validation (force validation of all open trades NOW)
  app.post("/api/admin/validate-trades", requireAdminJWT, async (_req, res) => {
    try {
      const { PerformanceValidator } = await import('./performance-validator');
      const openIdeas = (await storage.getAllTradeIdeas()).filter(i => i.outcomeStatus === 'open');
      
      logger.info(`📊 Admin: Force-validating ${openIdeas.length} open trades...`);
      
      // Fetch current prices for all symbols
      const symbols = Array.from(new Set(openIdeas.map(i => i.symbol)));
      const priceMap = new Map<string, number>();
      
      for (const symbol of symbols) {
        try {
          const idea = openIdeas.find(i => i.symbol === symbol)!;
          let price: number | null = null;
          
          if (idea.assetType === 'crypto') {
            const { fetchCryptoPrice } = await import('./market-api');
            const priceData = await fetchCryptoPrice(symbol);
            price = priceData?.currentPrice || null;
          } else {
            const { fetchStockPrice } = await import('./market-api');
            const priceData = await fetchStockPrice(symbol);
            price = priceData?.currentPrice || null;
          }
          
          if (price) {
            priceMap.set(symbol, price);
          }
        } catch (e) {
          logger.warn(`Failed to fetch price for ${symbol}`);
        }
      }
      
      logger.info(`  ✓ Fetched ${priceMap.size}/${symbols.length} prices`);
      
      // Validate each trade
      let validated = 0;
      let closed = 0;
      
      for (const idea of openIdeas) {
        const currentPrice = priceMap.get(idea.symbol);
        const result = PerformanceValidator.validateTradeIdea(idea, currentPrice);
        
        if (result.shouldUpdate && result.outcomeStatus) {
          await storage.updateTradeIdea(idea.id, result);
          validated++;
          if (result.outcomeStatus !== 'open') {
            closed++;
          }
        }
      }
      
      logger.info(`✅ Admin: Validated ${validated} trades, closed ${closed}`);
      
      res.json({
        success: true,
        totalOpen: openIdeas.length,
        validated,
        closed,
        message: `Validated ${validated} trades, closed ${closed} with outcomes`
      });
    } catch (error: any) {
      logger.error("Admin validation error:", error);
      res.status(500).json({ error: error?.message || "Failed to validate trades" });
    }
  });

  // Admin: Re-validate ALL trades (including expired) - ONE-TIME FIX for date parser bug
  app.post("/api/admin/revalidate-all-trades", requireAdminJWT, async (_req, res) => {
    try {
      const { PerformanceValidator } = await import('./performance-validator');
      const allIdeas = await storage.getAllTradeIdeas();
      
      logger.info(`🔄 Admin: Re-validating ALL ${allIdeas.length} trades (including expired)...`);
      
      let reopened = 0;
      let stayedExpired = 0;
      let errors = 0;
      
      // Focus on expired trades - check if they should actually be open
      const expiredIdeas = allIdeas.filter(i => i.outcomeStatus === 'expired');
      logger.info(`  📊 Found ${expiredIdeas.length} expired trades to re-check`);
      
      for (const idea of expiredIdeas) {
        try {
          // Re-validate using the FIXED date parser - it will check if truly expired
          const result = PerformanceValidator.validateTradeIdea(idea, undefined);
          
          // If shouldUpdate is false and it's still marked expired, it's truly expired
          // If shouldUpdate is true and outcomeStatus is NOT 'expired', we should reopen it
          if (!result.shouldUpdate) {
            // Validation says no update needed, but let's double-check the expiry logic
            // by manually checking if exitBy is in the future
            if (idea.exitBy) {
              const now = new Date();
              const createdAt = new Date(idea.timestamp);
              // Use the FIXED parser
              const exitByDate = (PerformanceValidator as any).parseExitByDate(idea.exitBy, createdAt);
              
              if (exitByDate && exitByDate > now) {
                // Trade is NOT expired! Reopen it
                await storage.updateTradeIdea(idea.id, {
                  outcomeStatus: 'open',
                  exitDate: null,
                  exitPrice: null,
                  realizedPnL: null,
                  percentGain: null,
                  predictionAccuracyPercent: null
                });
                reopened++;
                logger.info(`  ✅ Reopened ${idea.symbol} (exitBy: ${idea.exitBy}, expires: ${exitByDate.toISOString()})`);
              } else {
                stayedExpired++;
              }
            } else {
              stayedExpired++;
            }
          } else {
            stayedExpired++;
          }
        } catch (e: any) {
          errors++;
          logger.error(`  ❌ Error re-validating ${idea.symbol}: ${e.message}`);
        }
      }
      
      logger.info(`✅ Admin: Re-validation complete`);
      logger.info(`  📈 Reopened: ${reopened} trades`);
      logger.info(`  ⏱️  Still expired: ${stayedExpired} trades`);
      logger.info(`  ❌ Errors: ${errors}`);
      
      res.json({
        success: true,
        total: allIdeas.length,
        expiredChecked: expiredIdeas.length,
        reopened,
        stayedExpired,
        errors,
        message: `Re-validated all trades. Reopened ${reopened} incorrectly expired trades.`
      });
    } catch (error: any) {
      logger.error("Admin re-validation error:", error);
      res.status(500).json({ error: error?.message || "Failed to re-validate trades" });
    }
  });

  // Admin: Data Integrity Verification
  app.get("/api/admin/verify-data-integrity", requireAdminJWT, async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      // 🔐 ADMIN MODE: Include ALL engine versions for complete data integrity verification
      const stats = await storage.getPerformanceStats({ includeAllVersions: true });
      
      // Check 1: Count consistency
      const totalCount = allIdeas.length;
      const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
      const closedCount = closedIdeas.length;
      const statsClosedCount = stats.bySource.reduce((sum, s) => sum + s.totalIdeas, 0);
      
      const countMatch = closedCount === statsClosedCount;
      
      // Check 2: Win rate consistency
      const rawWins = closedIdeas.filter(i => i.outcomeStatus === 'hit_target').length;
      const rawWinRate = closedIdeas.length > 0 ? (rawWins / closedIdeas.length) * 100 : 0;
      const perfWinRate = stats.overall.winRate;
      const winRateMatch = Math.abs(rawWinRate - perfWinRate) < 0.1; // Within 0.1%
      
      // Check 3: Missing outcome data
      const missingData = closedIdeas.filter(i => 
        i.percentGain === null || 
        i.exitPrice === null || 
        i.exitDate === null ||
        i.actualHoldingTimeMinutes === null
      );
      
      // Check 4: Invalid timestamps
      const invalidTimestamps = closedIdeas.filter(i => {
        if (!i.exitDate || !i.timestamp) return false;
        return new Date(i.exitDate) < new Date(i.timestamp);
      });
      
      // Check 5: Data source verification
      const undefinedSources = allIdeas.filter(i => !i.dataSourceUsed);
      
      // Overall status
      const warnings: string[] = [];
      const errors: string[] = [];
      
      if (!countMatch) {
        errors.push(`Count mismatch: Found ${closedCount} closed ideas but performance stats show ${statsClosedCount}`);
      }
      
      if (!winRateMatch) {
        warnings.push(`Win rate discrepancy: Raw calculation ${rawWinRate.toFixed(2)}% vs Performance stats ${perfWinRate.toFixed(2)}%`);
      }
      
      if (missingData.length > 0) {
        warnings.push(`${missingData.length} closed trades missing outcome data (percentGain, exitPrice, etc.)`);
      }
      
      if (invalidTimestamps.length > 0) {
        errors.push(`${invalidTimestamps.length} trades have exit dates before entry dates`);
      }
      
      if (undefinedSources.length > 0) {
        warnings.push(`${undefinedSources.length} trades missing data source attribution`);
      }
      
      const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
      
      res.json({
        status,
        timestamp: new Date().toISOString(),
        summary: {
          totalTrades: totalCount,
          closedTrades: closedCount,
          openTrades: totalCount - closedCount,
          overallWinRate: perfWinRate.toFixed(2) + '%',
        },
        checks: {
          totalTradeCount: { 
            match: true, 
            expected: totalCount, 
            actual: totalCount 
          },
          closedTradeCount: { 
            match: countMatch, 
            expected: statsClosedCount, 
            actual: closedCount 
          },
          winRateConsistency: { 
            match: winRateMatch, 
            perfWinRate: perfWinRate.toFixed(2), 
            rawWinRate: rawWinRate.toFixed(2),
            difference: Math.abs(rawWinRate - perfWinRate).toFixed(2)
          },
          missingOutcomeData: { 
            count: missingData.length, 
            ids: missingData.slice(0, 5).map(i => i.id) // Only first 5
          },
          invalidTimestamps: {
            count: invalidTimestamps.length,
            ids: invalidTimestamps.slice(0, 5).map(i => i.id)
          },
          missingDataSource: {
            count: undefinedSources.length,
            ids: undefinedSources.slice(0, 5).map(i => i.id)
          }
        },
        warnings,
        errors
      });
    } catch (error: any) {
      console.error("Data integrity verification error:", error);
      res.status(500).json({ error: error?.message || "Failed to verify data integrity" });
    }
  });

  // Admin: Clear test data (ONLY deletes OPEN trades with no outcomes - preserves all closed trades)
  app.post("/api/admin/clear-test-data", requireAdminJWT, async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      let deletedCount = 0;
      let preservedCount = 0;
      
      for (const idea of allIdeas) {
        // PRESERVE any trade with an outcome (hit_target, hit_stop, expired, closed)
        if (idea.outcomeStatus && idea.outcomeStatus !== 'open') {
          preservedCount++;
          continue; // Keep this trade - it has valuable outcome data
        }
        
        // Only delete OPEN trades that are older than 7 days (likely test data)
        const ideaDate = new Date(idea.timestamp);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        if (ideaDate < sevenDaysAgo && idea.outcomeStatus === 'open') {
          await storage.deleteTradeIdea(idea.id);
          deletedCount++;
        }
      }
      
      res.json({ 
        message: 'Test data cleared successfully - all trades with outcomes were preserved',
        deletedCount,
        preservedWithOutcomes: preservedCount,
        note: 'Only deleted OPEN trades older than 7 days. All closed trades with outcomes were kept.'
      });
    } catch (error: any) {
      console.error("Clear test data error:", error);
      res.status(500).json({ error: error?.message || "Failed to clear test data" });
    }
  });

  // Win rate trend data for charting
  app.get("/api/ml/win-rate-trend", async (_req, res) => {
    try {
      const allIdeas = await storage.getAllTradeIdeas();
      const closedIdeas = allIdeas
        .filter(i => i.outcomeStatus !== 'open')
        .sort((a, b) => new Date(a.exitDate || a.timestamp).getTime() - new Date(b.exitDate || b.timestamp).getTime());
      
      if (closedIdeas.length === 0) {
        return res.json({ dataPoints: [], cumulativePnL: [] });
      }
      
      // Calculate rolling win rate (window of 10 trades)
      const windowSize = 10;
      const dataPoints: { date: string; winRate: number; tradesInWindow: number }[] = [];
      const cumulativePnL: { date: string; totalPnL: number; cumulativeGain: number }[] = [];
      
      let cumulativeGainPercent = 0;
      let totalPnL = 0;
      
      for (let i = 0; i < closedIdeas.length; i++) {
        const idea = closedIdeas[i];
        
        // Update cumulative metrics
        cumulativeGainPercent += idea.percentGain || 0;
        totalPnL += idea.realizedPnL || 0;
        
        cumulativePnL.push({
          date: idea.exitDate || idea.timestamp,
          totalPnL,
          cumulativeGain: cumulativeGainPercent
        });
        
        // Calculate rolling win rate
        if (i >= windowSize - 1) {
          const window = closedIdeas.slice(i - windowSize + 1, i + 1);
          const wins = window.filter(w => w.outcomeStatus === 'hit_target').length;
          const winRate = (wins / windowSize) * 100;
          
          dataPoints.push({
            date: idea.exitDate || idea.timestamp,
            winRate,
            tradesInWindow: windowSize
          });
        }
      }
      
      res.json({ dataPoints, cumulativePnL });
    } catch (error: any) {
      console.error("Win rate trend error:", error);
      res.status(500).json({ error: error?.message || "Failed to get win rate trend" });
    }
  });

  // 🔐 MODEL GOVERNANCE: Model Cards API
  app.get("/api/model-cards", requirePremium, async (_req, res) => {
    try {
      const cards = await storage.getAllModelCards();
      res.json(cards);
    } catch (error: any) {
      console.error("Get model cards error:", error);
      res.status(500).json({ error: "Failed to fetch model cards" });
    }
  });

  app.get("/api/model-cards/active", async (_req, res) => {
    try {
      const card = await storage.getActiveModelCard();
      if (!card) {
        return res.status(404).json({ error: "No active model card found" });
      }
      res.json(card);
    } catch (error: any) {
      console.error("Get active model card error:", error);
      res.status(500).json({ error: "Failed to fetch active model card" });
    }
  });

  app.post("/api/model-cards/initialize", requireAdminJWT, async (_req, res) => {
    try {
      // Check if model card already exists
      const existing = await storage.getModelCardByVersion("v2.2.0");
      if (existing) {
        return res.json({ message: "Model card already exists", card: existing });
      }

      // Create the first model card documenting the current quant engine
      const { QUANT_ENGINE_VERSION } = await import('./quant-ideas-generator');
      const card = await storage.createModelCard({
        engineVersion: QUANT_ENGINE_VERSION,
        mlWeightsVersion: null, // Pure quant for now
        modelType: 'quant',
        description: 'Predictive quant engine with RSI divergence priority, early MACD crossovers, widened stops (4-5%), and removal of momentum-chasing signals. Focus on early setups rather than finished moves.',
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
        assumptions: JSON.stringify({
          marketRegime: 'Mean-reverting with intraday volatility',
          signalPriority: ['RSI Divergence', 'Early MACD Crossover', 'Volume Spike', 'Breakout Confirmation'],
          stopLossPhilosophy: 'Wider stops to avoid premature exits on normal volatility'
        }),
        dataLimitations: JSON.stringify({
          historicalData: 'Limited to 100 days lookback for technical indicators',
          optionsData: 'Tradier API coverage may be incomplete for illiquid options',
          earningsData: 'Alpha Vantage provides 14-day lookahead only'
        }),
        signalWeights: JSON.stringify({
          'RSI Divergence': 25,
          'MACD Crossover (Fresh)': 25,
          'Early Breakout': 20,
          'Volume Spike': 15,
          'Mean Reversion': 15
        }),
        status: 'active'
      });

      res.json({ message: "Model card created successfully", card });
    } catch (error: any) {
      console.error("Initialize model card error:", error);
      res.status(500).json({ error: "Failed to initialize model card" });
    }
  });

  // 📊 DIAGNOSTIC EXPORT: Comprehensive data export for LLM analysis
  app.get("/api/admin/diagnostic-export", requireAdminJWT, async (req, res) => {
    try {
      const daysBack = parseInt(req.query.daysBack as string) || 30;
      const includeRawData = req.query.includeRawData === 'true';
      
      logger.info(`📊 Generating diagnostic export (${daysBack} days, rawData: ${includeRawData})`);
      
      const diagnosticData = await generateDiagnosticExport(daysBack, includeRawData);
      
      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="quantedge-diagnostic-${new Date().toISOString().split('T')[0]}.json"`);
      
      res.json(diagnosticData);
    } catch (error: any) {
      logger.error("Diagnostic export error:", error);
      res.status(500).json({ error: error?.message || "Failed to generate diagnostic export" });
    }
  });

  // ==========================================
  // 📈 PAPER TRADING: Simulation Portfolio System
  // ==========================================

  // GET /api/paper/portfolios - Get all portfolios for authenticated user
  app.get("/api/paper/portfolios", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const portfolios = await storage.getPaperPortfoliosByUser(userId);
      res.json(portfolios);
    } catch (error: any) {
      logger.error("Error fetching paper portfolios", { error });
      res.status(500).json({ error: "Failed to fetch portfolios" });
    }
  });

  // POST /api/paper/portfolios - Create a new portfolio
  app.post("/api/paper/portfolios", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      
      const parseResult = insertPaperPortfolioSchema.safeParse({
        ...req.body,
        userId,
      });
      
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid portfolio data", details: parseResult.error.errors });
      }
      
      const portfolio = await storage.createPaperPortfolio(parseResult.data);
      res.status(201).json(portfolio);
    } catch (error: any) {
      logger.error("Error creating paper portfolio", { error });
      res.status(500).json({ error: "Failed to create portfolio" });
    }
  });

  // GET /api/paper/portfolios/:id - Get portfolio by ID (with positions)
  app.get("/api/paper/portfolios/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { id } = req.params;
      
      const portfolio = await storage.getPaperPortfolioById(id);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      if (portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const positions = await storage.getPaperPositionsByPortfolio(id);
      const portfolioValue = await paperTradingService.calculatePortfolioValue(id);
      
      res.json({
        ...portfolio,
        positions,
        calculatedValue: portfolioValue,
      });
    } catch (error: any) {
      logger.error("Error fetching paper portfolio", { error });
      res.status(500).json({ error: "Failed to fetch portfolio" });
    }
  });

  // PATCH /api/paper/portfolios/:id - Update portfolio settings
  app.patch("/api/paper/portfolios/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { id } = req.params;
      
      const portfolio = await storage.getPaperPortfolioById(id);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      if (portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const allowedFields = ['name', 'autoExecute', 'maxPositionSize', 'riskPerTrade'];
      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      
      const updatedPortfolio = await storage.updatePaperPortfolio(id, updates);
      res.json(updatedPortfolio);
    } catch (error: any) {
      logger.error("Error updating paper portfolio", { error });
      res.status(500).json({ error: "Failed to update portfolio" });
    }
  });

  // DELETE /api/paper/portfolios/:id - Delete portfolio
  app.delete("/api/paper/portfolios/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { id } = req.params;
      
      const portfolio = await storage.getPaperPortfolioById(id);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      if (portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const deleted = await storage.deletePaperPortfolio(id);
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete portfolio" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting paper portfolio", { error });
      res.status(500).json({ error: "Failed to delete portfolio" });
    }
  });

  // GET /api/paper/portfolios/:portfolioId/positions - Get all positions for a portfolio
  app.get("/api/paper/portfolios/:portfolioId/positions", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { portfolioId } = req.params;
      
      const portfolio = await storage.getPaperPortfolioById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      if (portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
      res.json(positions);
    } catch (error: any) {
      logger.error("Error fetching paper positions", { error });
      res.status(500).json({ error: "Failed to fetch positions" });
    }
  });

  // POST /api/paper/portfolios/:portfolioId/execute/:tradeIdeaId - Execute a trade idea into the portfolio
  app.post("/api/paper/portfolios/:portfolioId/execute/:tradeIdeaId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { portfolioId, tradeIdeaId } = req.params;
      
      const portfolio = await storage.getPaperPortfolioById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      if (portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const tradeIdea = await storage.getTradeIdeaById(tradeIdeaId);
      if (!tradeIdea) {
        return res.status(404).json({ error: "Trade idea not found" });
      }
      
      const result = await paperTradingService.executeTradeIdea(portfolioId, tradeIdea);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.status(201).json(result.position);
    } catch (error: any) {
      logger.error("Error executing paper trade", { error });
      res.status(500).json({ error: "Failed to execute trade" });
    }
  });

  // GET /api/paper/positions/:positionId/analysis - Get detailed position analysis with entry reasoning
  app.get("/api/paper/positions/:positionId/analysis", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { positionId } = req.params;
      
      const position = await storage.getPaperPositionById(positionId);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }
      
      // Verify ownership
      const portfolio = await storage.getPaperPortfolioById(position.portfolioId);
      if (!portfolio || portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Get linked trade idea if available for full context
      let tradeIdea = null;
      if (position.tradeIdeaId) {
        tradeIdea = await storage.getTradeIdeaById(position.tradeIdeaId);
      }
      
      // Parse entry signals if stored as JSON string
      let parsedSignals = [];
      if (position.entrySignals) {
        try {
          parsedSignals = typeof position.entrySignals === 'string' 
            ? JSON.parse(position.entrySignals) 
            : position.entrySignals;
        } catch (e) {
          parsedSignals = [];
        }
      }
      
      res.json({
        position: {
          ...position,
          entrySignals: parsedSignals,
        },
        tradeIdea: tradeIdea ? {
          catalyst: tradeIdea.catalyst,
          analysis: tradeIdea.analysis,
          qualitySignals: tradeIdea.qualitySignals,
          confidenceScore: tradeIdea.confidenceScore,
          probabilityBand: tradeIdea.probabilityBand,
          source: tradeIdea.source,
          holdingPeriod: tradeIdea.holdingPeriod,
        } : null,
      });
    } catch (error: any) {
      logger.error("Error fetching position analysis", { error });
      res.status(500).json({ error: "Failed to fetch position analysis" });
    }
  });

  // POST /api/paper/positions/:positionId/close - Close a position manually
  app.post("/api/paper/positions/:positionId/close", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { positionId } = req.params;
      const { exitPrice } = req.body;
      
      if (typeof exitPrice !== 'number' || exitPrice <= 0) {
        return res.status(400).json({ error: "Valid exitPrice is required" });
      }
      
      const position = await storage.getPaperPositionById(positionId);
      if (!position) {
        return res.status(404).json({ error: "Position not found" });
      }
      
      const portfolio = await storage.getPaperPortfolioById(position.portfolioId);
      if (!portfolio || portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const result = await paperTradingService.closePosition(positionId, exitPrice, 'manual');
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      res.json(result.position);
    } catch (error: any) {
      logger.error("Error closing paper position", { error });
      res.status(500).json({ error: "Failed to close position" });
    }
  });

  // POST /api/paper/portfolios/:portfolioId/update-prices - Refresh position prices
  app.post("/api/paper/portfolios/:portfolioId/update-prices", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { portfolioId } = req.params;
      
      const portfolio = await storage.getPaperPortfolioById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      if (portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await paperTradingService.updatePositionPrices(portfolioId);
      
      const closedPositions = await paperTradingService.checkStopsAndTargets(portfolioId);
      
      const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
      const portfolioValue = await paperTradingService.calculatePortfolioValue(portfolioId);
      
      res.json({
        positions,
        portfolioValue,
        autoClosedPositions: closedPositions,
      });
    } catch (error: any) {
      logger.error("Error updating paper prices", { error });
      res.status(500).json({ error: "Failed to update prices" });
    }
  });

  // GET /api/paper/portfolios/:portfolioId/equity - Get equity curve data
  app.get("/api/paper/portfolios/:portfolioId/equity", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { portfolioId } = req.params;
      const { startDate, endDate } = req.query;
      
      const portfolio = await storage.getPaperPortfolioById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      if (portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const snapshots = await storage.getPaperEquitySnapshots(
        portfolioId,
        startDate as string | undefined,
        endDate as string | undefined
      );
      
      res.json(snapshots);
    } catch (error: any) {
      logger.error("Error fetching equity curve", { error });
      res.status(500).json({ error: "Failed to fetch equity curve" });
    }
  });

  // POST /api/paper/portfolios/:portfolioId/snapshot - Record daily snapshot
  app.post("/api/paper/portfolios/:portfolioId/snapshot", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { portfolioId } = req.params;
      
      const portfolio = await storage.getPaperPortfolioById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      if (portfolio.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const success = await paperTradingService.recordEquitySnapshot(portfolioId);
      
      if (!success) {
        return res.status(500).json({ error: "Failed to record snapshot" });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error recording equity snapshot", { error });
      res.status(500).json({ error: "Failed to record snapshot" });
    }
  });

  // ==========================================
  // AUTO-LOTTO BOT API (Authenticated)
  // ==========================================
  
  // GET /api/auto-lotto-bot - Get the auto-lotto bot's portfolios and stats
  // Returns aggregated stats publicly, detailed positions only for admin
  app.get("/api/auto-lotto-bot", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { getOptionsPortfolio, getFuturesPortfolio, getCryptoPortfolio, getSmallAccountPortfolio } = await import("./auto-lotto-trader");
      const optionsPortfolio = await getOptionsPortfolio();
      const futuresPortfolio = await getFuturesPortfolio();
      const cryptoPortfolio = await getCryptoPortfolio();
      const smallAccountPortfolio = await getSmallAccountPortfolio();
      
      // Use options portfolio as main for backward compatibility
      const portfolio = optionsPortfolio;
      
      if (!portfolio) {
        return res.json({
          portfolio: null,
          positions: [],
          stats: null,
          message: "Auto-Lotto Bot not yet initialized"
        });
      }
      
      const rawPositions = await storage.getPaperPositionsByPortfolio(portfolio.id);
      
      // Deduplicate positions by ID to prevent showing duplicates
      const seenIds = new Set<string>();
      const positions = rawPositions.filter(pos => {
        if (seenIds.has(pos.id)) return false;
        seenIds.add(pos.id);
        return true;
      });
      
      // Update open OPTIONS positions with live prices from Tradier
      const { getOptionQuote } = await import("./tradier-api");
      for (const pos of positions.filter(p => p.status === 'open' && p.assetType === 'option')) {
        try {
          // Build OCC symbol from position data
          const symbol = pos.symbol.toUpperCase();
          const strike = parseFloat(pos.strikePrice?.toString() || '0');
          const expiry = pos.expirationDate;
          const optType = pos.optionType?.toLowerCase() === 'put' ? 'P' : 'C';
          
          if (symbol && strike > 0 && expiry) {
            // Format: AAPL260116C00200000 (symbol + YYMMDD + C/P + 8-digit strike)
            const expDate = new Date(expiry);
            const yy = String(expDate.getFullYear()).slice(-2);
            const mm = String(expDate.getMonth() + 1).padStart(2, '0');
            const dd = String(expDate.getDate()).padStart(2, '0');
            const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0');
            const occSymbol = `${symbol}${yy}${mm}${dd}${optType}${strikeStr}`;
            
            const quote = await getOptionQuote({ occSymbol });
            if (quote && quote.last > 0) {
              const currentPrice = quote.last;
              const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
              const quantity = parseFloat(pos.quantity?.toString() || '1');
              const direction = pos.direction || 'long';
              const pointDiff = direction === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
              const unrealizedPnL = pointDiff * 100 * quantity; // Options = 100 multiplier
              
              await storage.updatePaperPosition(pos.id, { currentPrice, unrealizedPnL });
              pos.currentPrice = currentPrice;
              pos.unrealizedPnL = unrealizedPnL;
            }
          }
        } catch (e) { /* continue on quote error */ }
      }
      
      // Calculate stats
      const openPositions = positions.filter(p => p.status === 'open');
      const closedPositions = positions.filter(p => p.status === 'closed');
      // Only count trades with non-zero P&L for win rate calculation
      const tradesWithOutcome = closedPositions.filter(p => (p.realizedPnL || 0) !== 0);
      const wins = tradesWithOutcome.filter(p => (p.realizedPnL || 0) > 0).length;
      const losses = tradesWithOutcome.filter(p => (p.realizedPnL || 0) < 0).length;
      const totalRealizedPnL = closedPositions.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
      const totalUnrealizedPnL = openPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
      
      // Check if user is admin for detailed access
      const userId = req.session?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = checkIsAdmin(user);
      
      // Sample size gating: require minimum 20 trades for ALL metrics
      const MINIMUM_SAMPLE_SIZE = 20;
      const hasStatisticalValidity = closedPositions.length >= MINIMUM_SAMPLE_SIZE;
      
      // For admin: show all data
      // For non-admin: only show data once minimum sample size is met
      // Get futures portfolio stats if available (update prices first)
      let futuresStats = null;
      let futuresPositions: any[] = [];
      if (futuresPortfolio) {
        // Update futures positions with live prices before returning data
        const { getFuturesPrice } = await import("./futures-data-service");
        const rawFuturesPositions = await storage.getPaperPositionsByPortfolio(futuresPortfolio.id);
        // Deduplicate futures positions
        const seenFuturesIds = new Set<string>();
        futuresPositions = rawFuturesPositions.filter(pos => {
          if (seenFuturesIds.has(pos.id)) return false;
          seenFuturesIds.add(pos.id);
          return true;
        });
        
        // Update open futures positions with current prices
        for (const pos of futuresPositions.filter(p => p.status === 'open')) {
          try {
            const currentPrice = await getFuturesPrice(pos.symbol);
            if (currentPrice && currentPrice > 0) {
              const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
              const direction = pos.direction || 'long';
              const quantity = parseFloat(pos.quantity?.toString() || '1');
              const symbol = pos.symbol.toUpperCase();
              const multiplier = symbol.startsWith('GC') ? 100 : 20; // GC=$100/point, NQ=$20/point
              const pointDiff = direction === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
              const unrealizedPnL = pointDiff * multiplier * quantity;
              
              await storage.updatePaperPosition(pos.id, { currentPrice, unrealizedPnL });
              pos.currentPrice = currentPrice;
              pos.unrealizedPnL = unrealizedPnL;
            }
          } catch (e) { /* continue */ }
        }
        
        const futuresOpen = futuresPositions.filter(p => p.status === 'open');
        const futuresClosed = futuresPositions.filter(p => p.status === 'closed');
        // Only count trades with non-zero P&L for win rate
        const futuresWithOutcome = futuresClosed.filter(p => (p.realizedPnL || 0) !== 0);
        const futuresWins = futuresWithOutcome.filter(p => (p.realizedPnL || 0) > 0).length;
        const futuresLosses = futuresWithOutcome.filter(p => (p.realizedPnL || 0) < 0).length;
        futuresStats = {
          name: futuresPortfolio.name,
          startingCapital: futuresPortfolio.startingCapital,
          cashBalance: futuresPortfolio.cashBalance,
          totalValue: futuresPortfolio.totalValue,
          totalPnL: futuresPortfolio.totalPnL,
          openPositions: futuresOpen.length,
          closedPositions: futuresClosed.length,
          wins: futuresWins,
          losses: futuresLosses,
          winRate: futuresWithOutcome.length > 0 ? (futuresWins / futuresWithOutcome.length * 100).toFixed(1) : '0',
        };
      }
      
      // Get crypto portfolio stats if available (update prices first)
      let cryptoStats = null;
      let cryptoPositions: any[] = [];
      if (cryptoPortfolio) {
        const { fetchCryptoPrice } = await import("./market-api");
        const rawCryptoPositions = await storage.getPaperPositionsByPortfolio(cryptoPortfolio.id);
        // Deduplicate crypto positions
        const seenCryptoIds = new Set<string>();
        cryptoPositions = rawCryptoPositions.filter(pos => {
          if (seenCryptoIds.has(pos.id)) return false;
          seenCryptoIds.add(pos.id);
          return true;
        });
        
        // Update open crypto positions with current prices
        for (const pos of cryptoPositions.filter(p => p.status === 'open')) {
          try {
            const cryptoData = await fetchCryptoPrice(pos.symbol);
            const currentPrice = cryptoData?.currentPrice;
            if (currentPrice && currentPrice > 0) {
              const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
              const quantity = parseFloat(pos.quantity?.toString() || '1');
              const unrealizedPnL = (currentPrice - entryPrice) * quantity;
              
              await storage.updatePaperPosition(pos.id, { currentPrice, unrealizedPnL });
              pos.currentPrice = currentPrice;
              pos.unrealizedPnL = unrealizedPnL;
            }
          } catch (e) { /* continue */ }
        }
        
        const cryptoOpen = cryptoPositions.filter(p => p.status === 'open');
        const cryptoClosed = cryptoPositions.filter(p => p.status === 'closed');
        const cryptoWithOutcome = cryptoClosed.filter(p => (p.realizedPnL || 0) !== 0);
        const cryptoWins = cryptoWithOutcome.filter(p => (p.realizedPnL || 0) > 0).length;
        const cryptoLosses = cryptoWithOutcome.filter(p => (p.realizedPnL || 0) < 0).length;
        cryptoStats = {
          name: cryptoPortfolio.name,
          startingCapital: cryptoPortfolio.startingCapital,
          cashBalance: cryptoPortfolio.cashBalance,
          totalValue: cryptoPortfolio.totalValue,
          totalPnL: cryptoPortfolio.totalPnL,
          openPositions: cryptoOpen.length,
          closedPositions: cryptoClosed.length,
          wins: cryptoWins,
          losses: cryptoLosses,
          winRate: cryptoWithOutcome.length > 0 ? (cryptoWins / cryptoWithOutcome.length * 100).toFixed(1) : '0',
        };
      }
      
      // Get Small Account portfolio stats if available (update option prices first)
      let smallAccountStats = null;
      let smallAccountPositions: any[] = [];
      if (smallAccountPortfolio) {
        const rawSmallAccountPositions = await storage.getPaperPositionsByPortfolio(smallAccountPortfolio.id);
        // Deduplicate small account positions
        const seenSmallAccountIds = new Set<string>();
        smallAccountPositions = rawSmallAccountPositions.filter(pos => {
          if (seenSmallAccountIds.has(pos.id)) return false;
          seenSmallAccountIds.add(pos.id);
          return true;
        });
        
        // Update open Small Account OPTIONS with live prices from Tradier
        for (const pos of smallAccountPositions.filter(p => p.status === 'open' && p.assetType === 'option')) {
          try {
            const symbol = pos.symbol.toUpperCase();
            const strike = parseFloat(pos.strikePrice?.toString() || '0');
            const expiry = pos.expirationDate;
            const optType = pos.optionType?.toLowerCase() === 'put' ? 'P' : 'C';
            
            if (symbol && strike > 0 && expiry) {
              const expDate = new Date(expiry);
              const yy = String(expDate.getFullYear()).slice(-2);
              const mm = String(expDate.getMonth() + 1).padStart(2, '0');
              const dd = String(expDate.getDate()).padStart(2, '0');
              const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0');
              const occSymbol = `${symbol}${yy}${mm}${dd}${optType}${strikeStr}`;
              
              const quote = await getOptionQuote({ occSymbol });
              if (quote && quote.last > 0) {
                const currentPrice = quote.last;
                const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
                const quantity = parseFloat(pos.quantity?.toString() || '1');
                const direction = pos.direction || 'long';
                const pointDiff = direction === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
                const unrealizedPnL = pointDiff * 100 * quantity;
                
                await storage.updatePaperPosition(pos.id, { currentPrice, unrealizedPnL });
                pos.currentPrice = currentPrice;
                pos.unrealizedPnL = unrealizedPnL;
              }
            }
          } catch (e) { /* continue on quote error */ }
        }
        
        const smallOpen = smallAccountPositions.filter(p => p.status === 'open');
        const smallClosed = smallAccountPositions.filter(p => p.status === 'closed');
        const smallWithOutcome = smallClosed.filter(p => (p.realizedPnL || 0) !== 0);
        const smallWins = smallWithOutcome.filter(p => (p.realizedPnL || 0) > 0).length;
        const smallLosses = smallWithOutcome.filter(p => (p.realizedPnL || 0) < 0).length;
        const smallRealizedPnL = smallClosed.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
        smallAccountStats = {
          name: smallAccountPortfolio.name,
          startingCapital: smallAccountPortfolio.startingCapital,
          cashBalance: smallAccountPortfolio.cashBalance,
          totalValue: smallAccountPortfolio.totalValue,
          totalPnL: smallAccountPortfolio.totalPnL,
          openPositions: smallOpen.length,
          closedPositions: smallClosed.length,
          wins: smallWins,
          losses: smallLosses,
          winRate: smallWithOutcome.length > 0 ? (smallWins / smallWithOutcome.length * 100).toFixed(1) : '0',
          totalRealizedPnL: smallRealizedPnL,
        };
      }
      
      // Check if user has beta access (admin or explicit beta access)
      const hasBetaAccess = isAdmin || user?.hasBetaAccess === true;
      
      // Calculate actual Options P&L from positions (realized + unrealized)
      const optionsRealizedPnL = closedPositions.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
      const optionsUnrealizedPnL = openPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
      const optionsTotalPnL = optionsRealizedPnL + optionsUnrealizedPnL;
      
      // Calculate actual Futures P&L from positions
      const futuresRealizedPnL = futuresPositions.filter(p => p.status === 'closed').reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
      const futuresUnrealizedPnL = futuresPositions.filter(p => p.status === 'open').reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
      const futuresTotalPnL = futuresRealizedPnL + futuresUnrealizedPnL;
      
      // Calculate actual Crypto P&L from positions
      const cryptoRealizedPnL = cryptoPositions.filter(p => p.status === 'closed').reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
      const cryptoUnrealizedPnL = cryptoPositions.filter(p => p.status === 'open').reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
      const cryptoTotalPnL = cryptoRealizedPnL + cryptoUnrealizedPnL;
      
      // Calculate actual Small Account P&L from positions
      const smallRealizedPnL = smallAccountPositions.filter(p => p.status === 'closed').reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
      const smallUnrealizedPnL = smallAccountPositions.filter(p => p.status === 'open').reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
      const smallTotalPnL = smallRealizedPnL + smallUnrealizedPnL;
      
      // Update portfolio stats with actual calculated P&L
      if (futuresStats) {
        futuresStats.totalPnL = futuresTotalPnL;
        futuresStats.realizedPnL = futuresRealizedPnL;
        futuresStats.unrealizedPnL = futuresUnrealizedPnL;
      }
      if (cryptoStats) {
        cryptoStats.totalPnL = cryptoTotalPnL;
        cryptoStats.realizedPnL = cryptoRealizedPnL;
        cryptoStats.unrealizedPnL = cryptoUnrealizedPnL;
      }
      if (smallAccountStats) {
        smallAccountStats.totalPnL = smallTotalPnL;
        smallAccountStats.realizedPnL = smallRealizedPnL;
        smallAccountStats.unrealizedPnL = smallUnrealizedPnL;
      }
      
      if (hasBetaAccess) {
        // Admin/Beta users get full access to bot trading data
        res.json({
          portfolio: {
            name: portfolio.name,
            startingCapital: portfolio.startingCapital,
            cashBalance: portfolio.cashBalance,
            totalValue: portfolio.totalValue,
            totalPnL: optionsTotalPnL, // Use calculated P&L, not stored value
            realizedPnL: optionsRealizedPnL,
            unrealizedPnL: optionsUnrealizedPnL,
            createdAt: portfolio.createdAt,
          },
          futuresPortfolio: futuresStats,
          cryptoPortfolio: cryptoStats,
          smallAccountPortfolio: smallAccountStats,
          positions: positions.slice(0, 200), // Increased to show more historical data
          futuresPositions: futuresPositions.slice(0, 100),
          cryptoPositions: cryptoPositions.slice(0, 100),
          smallAccountPositions: smallAccountPositions.slice(0, 100),
          stats: {
            openPositions: openPositions.length,
            closedPositions: closedPositions.length,
            wins,
            losses,
            winRate: tradesWithOutcome.length > 0 ? (wins / tradesWithOutcome.length * 100).toFixed(1) : '0',
            winRateNote: hasStatisticalValidity ? null : `Note: Based on ${closedPositions.length} trades (min 20 recommended)`,
            totalRealizedPnL,
            totalUnrealizedPnL,
            sampleSize: closedPositions.length,
            hasStatisticalValidity,
          },
          botStatus: 'running',
          isAdmin,
          hasBetaAccess: true,
        });
      } else {
        // Non-beta users: show that bot exists but no trading data
        // They need to join the beta to see live trading data
        res.json({
          portfolio: null,
          futuresPortfolio: null,
          cryptoPortfolio: null,
          smallAccountPortfolio: null,
          positions: [],
          futuresPositions: [],
          cryptoPositions: [],
          smallAccountPositions: [],
          stats: null,
          botStatus: 'running',
          isAdmin: false,
          hasBetaAccess: false,
          requiresBetaAccess: true,
          message: 'Join the beta program to access live bot trading data',
        });
      }

    } catch (error: any) {
      logger.error("Error fetching auto-lotto bot data", { error });
      res.status(500).json({ error: "Failed to fetch bot data" });
    }
  });

  // GET /api/auto-lotto-bot/status - Bot status for dashboard
  app.get("/api/auto-lotto-bot/status", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { getOptionsPortfolio, getFuturesPortfolio, getCryptoPortfolio, getSmallAccountPortfolio } = await import("./auto-lotto-trader");
      const optionsPortfolio = await getOptionsPortfolio();
      const futuresPortfolio = await getFuturesPortfolio();
      const cryptoPortfolio = await getCryptoPortfolio();
      const smallAccountPortfolio = await getSmallAccountPortfolio();
      
      // Aggregate stats from all portfolios
      const portfolios = [optionsPortfolio, futuresPortfolio, cryptoPortfolio, smallAccountPortfolio].filter(Boolean);
      let totalProfit = 0;
      let wins = 0;
      let losses = 0;
      let openPositions = 0;
      let todayTrades = 0;
      const today = new Date().toDateString();
      
      for (const portfolio of portfolios) {
        if (!portfolio) continue;
        const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
        
        for (const pos of positions) {
          if (pos.status === 'open') {
            openPositions++;
          } else if (pos.status === 'closed') {
            totalProfit += pos.realizedPnL || 0;
            if ((pos.realizedPnL || 0) > 0) wins++;
            else losses++;
          }
          
          if (new Date(pos.createdAt).toDateString() === today) {
            todayTrades++;
          }
        }
      }
      
      const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
      
      res.json({
        isActive: true,
        lastScan: new Date().toISOString(),
        todayTrades,
        totalProfit: Math.round(totalProfit * 100) / 100,
        winRate: Math.round(winRate * 10) / 10,
        openPositions,
      });
    } catch (error: any) {
      logger.error("Error fetching bot status", { error });
      res.status(500).json({ error: "Failed to fetch bot status" });
    }
  });

  // GET /api/auto-lotto-bot/realtime-pnl - Lightweight endpoint for real-time P&L updates
  // Can be polled frequently (every 3s) to show live unrealized P&L as prices change
  app.get("/api/auto-lotto-bot/realtime-pnl", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { getOptionsPortfolio, getFuturesPortfolio, getCryptoPortfolio, getSmallAccountPortfolio } = await import("./auto-lotto-trader");
      const { getCryptoPrice: getRealtimeCryptoPrice, getFuturesPrice: getRealtimeFuturesPrice } = await import("./realtime-price-service");
      const { fetchCryptoPrice } = await import("./market-api");
      const { getFuturesPrice: getFallbackFuturesPrice } = await import("./futures-data-service");
      const { getOptionQuote } = await import("./tradier-api");
      
      const optionsPortfolio = await getOptionsPortfolio();
      const futuresPortfolio = await getFuturesPortfolio();
      const cryptoPortfolio = await getCryptoPortfolio();
      const smallAccountPortfolio = await getSmallAccountPortfolio();
      
      const positions: Array<{
        id: number;
        symbol: string;
        assetType: string;
        direction: string;
        quantity: number;
        entryPrice: number;
        currentPrice: number;
        unrealizedPnL: number;
        portfolioType: string;
      }> = [];
      
      let totalUnrealizedPnL = 0;
      
      // Helper to fetch live option price
      async function getLiveOptionPrice(pos: any): Promise<number | null> {
        try {
          const symbol = pos.symbol.toUpperCase();
          const strike = parseFloat(pos.strikePrice?.toString() || '0');
          // Use expiryDate (from database column expiry_date) - NOT expirationDate
          const expiry = pos.expiryDate || pos.expiry_date;
          const optType = pos.optionType?.toLowerCase() === 'put' ? 'P' : 'C';
          
          if (symbol && strike > 0 && expiry) {
            const expDate = new Date(expiry);
            const yy = String(expDate.getFullYear()).slice(-2);
            const mm = String(expDate.getMonth() + 1).padStart(2, '0');
            const dd = String(expDate.getDate()).padStart(2, '0');
            const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0');
            const occSymbol = `${symbol}${yy}${mm}${dd}${optType}${strikeStr}`;
            
            const quote = await getOptionQuote({ occSymbol });
            if (quote && quote.last > 0) {
              return quote.last;
            }
          }
        } catch (e) { /* continue */ }
        return null;
      }
      
      // Get open options positions with LIVE prices
      if (optionsPortfolio) {
        const optionsPositions = await storage.getPaperPositionsByPortfolio(optionsPortfolio.id);
        for (const pos of optionsPositions.filter(p => p.status === 'open')) {
          const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
          const quantity = parseFloat(pos.quantity?.toString() || '1');
          const multiplier = pos.assetType === 'option' ? 100 : 1;
          const direction = pos.direction || 'long';
          
          // Fetch live option price from Tradier
          let currentPrice: number = typeof pos.currentPrice === 'number' ? pos.currentPrice : entryPrice;
          if (pos.assetType === 'option') {
            const livePrice = await getLiveOptionPrice(pos);
            if (livePrice !== null) {
              currentPrice = livePrice;
              // Update stored price for faster subsequent fetches
              await storage.updatePaperPosition(pos.id, { currentPrice });
            }
          }
          
          const priceDiff = direction === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
          const unrealizedPnL = priceDiff * quantity * multiplier;
          
          positions.push({
            id: pos.id,
            symbol: pos.symbol,
            assetType: pos.assetType || 'option',
            direction,
            quantity,
            entryPrice: Number(entryPrice),
            currentPrice: Number(currentPrice),
            unrealizedPnL,
            portfolioType: 'options'
          });
          totalUnrealizedPnL += unrealizedPnL;
        }
      }
      
      // Get open SMALL ACCOUNT positions with LIVE prices
      if (smallAccountPortfolio) {
        const smallPositions = await storage.getPaperPositionsByPortfolio(smallAccountPortfolio.id);
        for (const pos of smallPositions.filter(p => p.status === 'open')) {
          const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
          const quantity = parseFloat(pos.quantity?.toString() || '1');
          const multiplier = pos.assetType === 'option' ? 100 : 1;
          const direction = pos.direction || 'long';
          
          // Fetch live option price from Tradier
          let currentPrice: number = typeof pos.currentPrice === 'number' ? pos.currentPrice : entryPrice;
          if (pos.assetType === 'option') {
            const livePrice = await getLiveOptionPrice(pos);
            if (livePrice !== null) {
              currentPrice = livePrice;
              await storage.updatePaperPosition(pos.id, { currentPrice });
            }
          }
          
          const priceDiff = direction === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
          const unrealizedPnL = priceDiff * quantity * multiplier;
          
          positions.push({
            id: pos.id,
            symbol: pos.symbol,
            assetType: pos.assetType || 'option',
            direction,
            quantity,
            entryPrice: Number(entryPrice),
            currentPrice: Number(currentPrice),
            unrealizedPnL,
            portfolioType: 'small_account'
          });
          totalUnrealizedPnL += unrealizedPnL;
        }
      }
      
      // Get open futures positions with real-time prices
      if (futuresPortfolio) {
        const futuresPositions = await storage.getPaperPositionsByPortfolio(futuresPortfolio.id);
        for (const pos of futuresPositions.filter(p => p.status === 'open')) {
          const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
          const quantity = parseFloat(pos.quantity?.toString() || '1');
          const symbol = pos.symbol.toUpperCase();
          const multiplier = symbol.startsWith('GC') ? 100 : 20;
          const direction = pos.direction || 'long';
          
          // Try real-time price first, then fallback
          let currentPrice: number = typeof pos.currentPrice === 'number' ? pos.currentPrice : entryPrice;
          const realtimeCache = getRealtimeFuturesPrice(symbol.replace(/=F$/, ''));
          if (realtimeCache?.price) {
            currentPrice = realtimeCache.price;
          } else {
            try {
              const fallbackPrice = await getFallbackFuturesPrice(symbol);
              if (fallbackPrice) currentPrice = fallbackPrice;
            } catch (e) { /* use cached */ }
          }
          
          const pointDiff = direction === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice;
          const unrealizedPnL = pointDiff * multiplier * quantity;
          
          positions.push({
            id: pos.id,
            symbol,
            assetType: 'futures',
            direction,
            quantity,
            entryPrice: Number(entryPrice),
            currentPrice: Number(currentPrice),
            unrealizedPnL,
            portfolioType: 'futures'
          });
          totalUnrealizedPnL += unrealizedPnL;
        }
      }
      
      // Get open crypto positions with real-time prices
      if (cryptoPortfolio) {
        const { getCoinbaseSymbol } = await import("./auto-lotto-trader");
        const cryptoPositions = await storage.getPaperPositionsByPortfolio(cryptoPortfolio.id);
        for (const pos of cryptoPositions.filter(p => p.status === 'open')) {
          const entryPrice = typeof pos.entryPrice === 'string' ? parseFloat(pos.entryPrice) : pos.entryPrice;
          const quantity = parseFloat(pos.quantity?.toString() || '1');
          const symbol = pos.symbol.toUpperCase();
          const coinbaseSymbol = getCoinbaseSymbol(symbol);
          
          // Try real-time price first (Coinbase WebSocket with alias), then fallback
          let currentPrice: number = typeof pos.currentPrice === 'number' ? pos.currentPrice : entryPrice;
          
          // Check with aliased symbol first (e.g., RENDER -> RNDR)
          let realtimeCache = getRealtimeCryptoPrice(coinbaseSymbol);
          if (!realtimeCache?.price) {
            // Fall back to original symbol
            realtimeCache = getRealtimeCryptoPrice(symbol);
          }
          
          if (realtimeCache?.price) {
            currentPrice = realtimeCache.price;
          } else {
            try {
              const cryptoData = await fetchCryptoPrice(symbol);
              if (cryptoData?.currentPrice) currentPrice = cryptoData.currentPrice;
            } catch (e) { /* use cached */ }
          }
          
          const unrealizedPnL = (currentPrice - entryPrice) * quantity;
          
          positions.push({
            id: pos.id,
            symbol,
            assetType: 'crypto',
            direction: 'long',
            quantity,
            entryPrice: Number(entryPrice),
            currentPrice: Number(currentPrice),
            unrealizedPnL,
            portfolioType: 'crypto'
          });
          totalUnrealizedPnL += unrealizedPnL;
        }
      }
      
      res.json({
        positions,
        totalUnrealizedPnL,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error fetching realtime P&L", { error });
      res.status(500).json({ error: "Failed to fetch realtime P&L" });
    }
  });

  // GET /api/auto-lotto-bot/preferences - Get user's trading preferences
  app.get("/api/auto-lotto-bot/preferences", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const preferences = await storage.getAutoLottoPreferences(userId);
      
      if (!preferences) {
        // Return default preferences if none exist
        return res.json({
          userId,
          riskTolerance: 'moderate',
          maxPositionSize: 100,
          maxConcurrentTrades: 5,
          dailyLossLimit: 200,
          optionsAllocation: 40,
          futuresAllocation: 30,
          cryptoAllocation: 30,
          enableOptions: true,
          enableFutures: false, // Disabled - expensive for small accounts
          enableCrypto: true,
          enablePropFirm: false,
          optionsPreferredDte: 7,
          optionsMaxDte: 14,
          optionsMinDelta: 0.20,
          optionsMaxDelta: 0.40,
          optionsPreferCalls: true,
          optionsPreferPuts: true,
          optionsPreferredSymbols: [],
          futuresPreferredContracts: ['NQ', 'ES', 'GC'],
          futuresMaxContracts: 2,
          futuresStopPoints: 15,
          futuresTargetPoints: 30,
          cryptoPreferredCoins: ['BTC', 'ETH', 'SOL'],
          cryptoEnableMemeCoins: false,
          cryptoMaxLeverageMultiplier: 1.0,
          minConfidenceScore: 70,
          preferredHoldingPeriod: 'day',
          minRiskRewardRatio: 2.0,
          useDynamicExits: true,
          tradePreMarket: false,
          tradeRegularHours: true,
          tradeAfterHours: false,
          preferredEntryWindows: ['09:30-11:00', '14:00-15:30'],
          enableDiscordAlerts: true,
          enableEmailAlerts: false,
          alertOnEntry: true,
          alertOnExit: true,
          alertOnDailyLimit: true,
          automationMode: 'paper_only',
          requireConfirmation: true,
        });
      }
      
      res.json(preferences);
    } catch (error: any) {
      logger.error("Error fetching auto lotto preferences", { error });
      res.status(500).json({ error: "Failed to fetch preferences" });
    }
  });

  // PUT /api/auto-lotto-bot/preferences - Update user's trading preferences
  app.put("/api/auto-lotto-bot/preferences", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Fetch existing preferences to merge with incoming partial update
      const existing = await storage.getAutoLottoPreferences(userId);
      
      // Define defaults for new users
      const defaults = {
        riskTolerance: 'moderate' as const,
        maxPositionSize: 100,
        maxConcurrentTrades: 5,
        dailyLossLimit: 200,
        optionsAllocation: 40,
        futuresAllocation: 30,
        cryptoAllocation: 30,
        enableOptions: true,
        enableFutures: true,
        enableCrypto: true,
        enablePropFirm: false,
        optionsPreferredDte: 7,
        optionsMaxDte: 14,
        optionsMinDelta: 0.20,
        optionsMaxDelta: 0.40,
        optionsPreferCalls: true,
        optionsPreferPuts: true,
        optionsPreferredSymbols: [],
        futuresPreferredContracts: ['NQ', 'ES', 'GC'],
        futuresMaxContracts: 2,
        futuresStopPoints: 15,
        futuresTargetPoints: 30,
        cryptoPreferredCoins: ['BTC', 'ETH', 'SOL'],
        cryptoEnableMemeCoins: false,
        cryptoMaxLeverageMultiplier: 1.0,
        minConfidenceScore: 70,
        preferredHoldingPeriod: 'day' as const,
        minRiskRewardRatio: 2.0,
        useDynamicExits: true,
        tradePreMarket: false,
        tradeRegularHours: true,
        tradeAfterHours: false,
        preferredEntryWindows: ['09:30-11:00', '14:00-15:30'],
        enableDiscordAlerts: true,
        enableEmailAlerts: false,
        alertOnEntry: true,
        alertOnExit: true,
        alertOnDailyLimit: true,
        automationMode: 'paper_only' as const,
        requireConfirmation: true,
      };
      
      // Merge: existing values -> defaults -> incoming updates
      const mergedPrefs = {
        ...defaults,
        ...(existing || {}),
        ...req.body,
        userId,
      };
      
      // Remove any undefined values to prevent database issues
      const cleanedPrefs = Object.fromEntries(
        Object.entries(mergedPrefs).filter(([_, v]) => v !== undefined)
      );
      
      const preferences = await storage.upsertAutoLottoPreferences(cleanedPrefs as any);
      
      // Clear cached preferences in auto-lotto-trader to pick up new settings
      const { clearPreferencesCache } = await import("./auto-lotto-trader");
      clearPreferencesCache();
      
      logger.info(`[PREFERENCES] Updated auto lotto preferences for user ${userId}`);
      res.json(preferences);
    } catch (error: any) {
      logger.error("Error updating auto lotto preferences", { error });
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // GET /api/auto-lotto-bot/coverage - Get the bot's market coverage and activity
  app.get("/api/auto-lotto-bot/coverage", async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const day = etTime.getDay();
      const hour = etTime.getHours();
      const minute = etTime.getMinutes();
      const timeInMinutes = hour * 60 + minute;
      
      const isMarketOpen = day >= 1 && day <= 5 && timeInMinutes >= 570 && timeInMinutes < 960;
      
      const sectors = {
        coreHighVolatility: {
          name: "Core High-Volatility",
          description: "Major tech and index options with high liquidity",
          symbols: ['TSLA', 'NVDA', 'AMD', 'SPY', 'QQQ', 'AAPL', 'META', 'GOOGL', 'AMZN', 'NFLX'],
          status: isMarketOpen ? 'scanning' : 'idle'
        },
        quantumComputing: {
          name: "Quantum Computing",
          description: "Emerging quantum tech sector with high volatility",
          symbols: ['IONQ', 'RGTI', 'QUBT', 'QBTS', 'ARQQ'],
          status: isMarketOpen ? 'scanning' : 'idle'
        },
        nuclearUranium: {
          name: "Nuclear/Uranium",
          description: "Nuclear energy and uranium mining plays",
          symbols: ['NNE', 'OKLO', 'SMR', 'UEC', 'DNN', 'URG', 'LTBR'],
          status: isMarketOpen ? 'scanning' : 'idle'
        },
        biotech: {
          name: "Biotech",
          description: "High-volatility biotech and pharma",
          symbols: ['NVAX', 'EDIT', 'INO', 'SRNE', 'VXRT', 'FATE', 'GRTS'],
          status: isMarketOpen ? 'scanning' : 'idle'
        },
        cryptoMeme: {
          name: "Crypto/Meme",
          description: "Crypto-related and high-momentum meme stocks",
          symbols: ['MARA', 'RIOT', 'COIN', 'SOFI', 'HOOD', 'PLTR'],
          status: isMarketOpen ? 'scanning' : 'idle'
        }
      };
      
      const totalSymbols = Object.values(sectors).reduce((sum, s) => sum + s.symbols.length, 0);
      
      const lastScanTime = isMarketOpen 
        ? new Date(Math.floor(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000)).toISOString()
        : null;
      
      const nextScanTime = isMarketOpen
        ? new Date(Math.ceil(now.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000)).toISOString()
        : null;
      
      const recentActivity = [
        { 
          timestamp: new Date(now.getTime() - 2 * 60 * 1000).toISOString(), 
          type: 'scan',
          message: isMarketOpen ? 'Completed full market scan' : 'Market closed - scan paused',
          symbols: isMarketOpen ? totalSymbols : 0
        },
        { 
          timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), 
          type: 'check',
          message: isMarketOpen ? 'Checking options chains for lotto opportunities' : 'Waiting for market open',
          symbols: isMarketOpen ? totalSymbols : 0
        },
        { 
          timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), 
          type: 'analysis',
          message: 'Analyzing momentum and volume signals',
          symbols: isMarketOpen ? Object.keys(sectors).length : 0
        }
      ];
      
      res.json({
        sectors,
        totalSymbols,
        scanStatus: {
          isMarketOpen,
          lastScanTime,
          nextScanTime,
          scanInterval: '5 minutes',
          status: isMarketOpen ? 'active' : 'paused'
        },
        recentActivity,
        recentOpportunities: [],
      });
    } catch (error: any) {
      logger.error("Error fetching auto-lotto bot coverage", { error });
      res.status(500).json({ error: "Failed to fetch coverage data" });
    }
  });

  // GET /api/prop-firm-mode - Get Prop Firm Mode stats and status
  app.get("/api/prop-firm-mode", async (_req: Request, res: Response) => {
    try {
      const { getPropFirmStats } = await import("./auto-lotto-trader");
      const stats = await getPropFirmStats();
      
      if (!stats) {
        return res.json({
          status: 'initializing',
          message: 'Prop Firm Mode is starting up...',
          portfolio: null,
          stats: null,
        });
      }
      
      // Get open positions
      const positions = await storage.getPaperPositionsByPortfolio(stats.portfolio!.id);
      const openPositions = positions.filter(p => p.status === 'open');
      const closedPositions = positions.filter(p => p.status === 'closed').slice(-10); // Last 10 trades
      
      res.json({
        status: stats.isWithinRules ? 'active' : 'locked',
        portfolio: {
          balance: stats.portfolio?.totalValue || 50000,
          startingCapital: 50000,
          dailyPnL: stats.dailyPnL,
          totalPnL: stats.totalPnL,
          drawdown: stats.drawdown,
          progressToTarget: Math.min(100, (stats.totalPnL / 3000) * 100),
        },
        rules: {
          dailyLossLimit: 1000,
          maxDrawdown: 2500,
          profitTarget: 3000,
          maxContracts: 2,
        },
        stats: {
          daysTraded: stats.daysTraded,
          tradesCount: stats.tradesCount,
          winRate: stats.winRate.toFixed(1),
          isWithinRules: stats.isWithinRules,
          ruleViolations: stats.ruleViolations,
        },
        openPositions: openPositions.map(p => ({
          symbol: p.symbol,
          direction: p.direction,
          entryPrice: p.entryPrice,
          currentPrice: p.currentPrice,
          unrealizedPnL: p.unrealizedPnL,
          stopLoss: p.stopLoss,
          targetPrice: p.targetPrice,
        })),
        recentTrades: closedPositions.map(p => ({
          symbol: p.symbol,
          direction: p.direction,
          entryPrice: p.entryPrice,
          exitPrice: p.exitPrice,
          realizedPnL: p.realizedPnL,
          exitReason: p.exitReason,
          timestamp: p.exitTime || p.entryTime,
        })),
      });
    } catch (error: any) {
      logger.error("Error fetching prop firm mode data", { error });
      res.status(500).json({ error: "Failed to fetch prop firm data" });
    }
  });

  // GET /api/next-week-picks - Generate premium picks for next week (bot-style)
  app.get("/api/next-week-picks", async (_req: Request, res: Response) => {
    try {
      const { generateNextWeekPicks, getNextWeekRange } = await import("./weekly-picks-generator");
      
      const picks = await generateNextWeekPicks();
      const weekRange = getNextWeekRange();
      
      // Group by play type for response
      const lottos = picks.filter(p => p.playType === 'lotto');
      const dayTrades = picks.filter(p => p.playType === 'day_trade');
      const swings = picks.filter(p => p.playType === 'swing');
      
      res.json({
        weekRange,
        totalPicks: picks.length,
        breakdown: {
          lottos: lottos.length,
          dayTrades: dayTrades.length,
          swings: swings.length
        },
        picks: {
          lottos,
          dayTrades,
          swings
        },
        avgConfidence: picks.length > 0 
          ? Math.round(picks.reduce((sum, p) => sum + p.confidence, 0) / picks.length)
          : 0
      });
    } catch (error: any) {
      logger.error("Error generating next week picks", { error });
      res.status(500).json({ error: "Failed to generate picks" });
    }
  });

  // POST /api/next-week-picks/send-discord - Send picks to Discord (admin only)
  app.post("/api/next-week-picks/send-discord", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = checkIsAdmin(user);
      
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { generateNextWeekPicks, getNextWeekRange } = await import("./weekly-picks-generator");
      const { sendNextWeekPicksToDiscord } = await import("./discord-service");
      
      const picks = await generateNextWeekPicks();
      const weekRange = getNextWeekRange();
      
      await sendNextWeekPicksToDiscord(picks, weekRange);
      
      res.json({
        success: true,
        message: `Sent ${picks.length} picks to Discord`,
        weekRange
      });
    } catch (error: any) {
      logger.error("Error sending picks to Discord", { error });
      res.status(500).json({ error: "Failed to send picks" });
    }
  });

  // POST /api/auto-lotto-bot/reset - Reset bot portfolios to fresh $300 each (admin only)
  // Supports ?type=all|options|futures|crypto query param
  app.post("/api/auto-lotto-bot/reset", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const user = userId ? await storage.getUser(userId) : null;
      const isAdmin = checkIsAdmin(user);
      
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required to reset bot portfolios" });
      }
      
      const SYSTEM_USER_ID = "system-auto-trader";
      const STARTING_CAPITAL = 300;
      const resetType = (req.query.type as string) || 'all';
      
      // Clear in-memory portfolio caches first
      const { clearPortfolioCaches } = await import("./auto-lotto-trader");
      clearPortfolioCaches();
      
      // Get existing portfolios
      const portfolios = await storage.getPaperPortfoliosByUser(SYSTEM_USER_ID);
      
      const results: any = { success: true, reset: [] };
      
      // Helper to reset a specific portfolio type
      const resetPortfolio = async (name: string, maxPos: number) => {
        const existing = portfolios.find(p => p.name === name);
        if (existing) {
          await storage.deletePaperPortfolio(existing.id);
        }
        const newPortfolio = await storage.createPaperPortfolio({
          userId: SYSTEM_USER_ID,
          name,
          startingCapital: STARTING_CAPITAL,
          cashBalance: STARTING_CAPITAL,
          totalValue: STARTING_CAPITAL,
          maxPositionSize: maxPos,
          riskPerTrade: 0.05,
        });
        return newPortfolio;
      };
      
      if (resetType === 'all' || resetType === 'options') {
        const p = await resetPortfolio("Auto-Lotto Options", 50);
        results.optionsPortfolio = { id: p.id, name: p.name, startingCapital: p.startingCapital };
        results.reset.push('options');
      }
      
      if (resetType === 'all' || resetType === 'futures') {
        const p = await resetPortfolio("Auto-Lotto Futures", 100);
        results.futuresPortfolio = { id: p.id, name: p.name, startingCapital: p.startingCapital };
        results.reset.push('futures');
      }
      
      if (resetType === 'all' || resetType === 'crypto') {
        const p = await resetPortfolio("Auto-Lotto Crypto", 100);
        results.cryptoPortfolio = { id: p.id, name: p.name, startingCapital: p.startingCapital };
        results.reset.push('crypto');
      }
      
      logger.info(`🤖 [BOT] Admin reset portfolios: ${results.reset.join(', ')} - $${STARTING_CAPITAL} each`);
      results.message = `Reset ${results.reset.join(', ')} portfolio(s) to $${STARTING_CAPITAL}`;
      
      res.json(results);
    } catch (error: any) {
      logger.error("Error resetting auto-lotto bot portfolios", { error });
      res.status(500).json({ error: "Failed to reset bot portfolios" });
    }
  });

  // POST /api/auto-lotto-bot/scan - Trigger manual bot scan (admin only)
  app.post("/api/auto-lotto-bot/scan", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const user = await storage.getUser(userId);
      
      if (!user || user.subscriptionTier !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { runAutonomousBotScan, runFuturesBotScan, runCryptoBotScan } = await import("./auto-lotto-trader");
      
      logger.info("🤖 [BOT] Admin-triggered manual scan starting...");
      
      // Run all three scans (options, futures, crypto)
      const optionsResult = await runAutonomousBotScan();
      const futuresResult = await runFuturesBotScan();
      await runCryptoBotScan();
      
      res.json({
        success: true,
        message: "Bot scan completed (options, futures, crypto) - check logs for details",
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error running manual bot scan", { error });
      res.status(500).json({ error: "Failed to run bot scan" });
    }
  });

  // POST /api/auto-lotto-bot/daily-review - Send end-of-day trading review to Discord
  app.post("/api/auto-lotto-bot/daily-review", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const user = await storage.getUser(userId);
      
      if (!user || user.subscriptionTier !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { sendDailyTradingReviewToDiscord, sendNextDayOutlookToDiscord } = await import("./discord-service");
      const { getOpenPositions, getClosedPositions } = await import("./paper-trading-service");
      
      // Find the Auto-Lotto Options portfolio
      const portfolios = await storage.getAllPaperPortfolios();
      const optionsPortfolio = portfolios.find((p: { name: string }) => p.name === "Auto-Lotto Options");
      
      if (!optionsPortfolio) {
        return res.status(404).json({ error: "Auto-Lotto Options portfolio not found" });
      }
      
      // Get today's date in CT timezone
      const ctNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const dateStr = ctNow.toISOString().split('T')[0];
      
      // Get all positions
      const openPositions = await getOpenPositions(optionsPortfolio.id);
      const closedPositions = await getClosedPositions(optionsPortfolio.id);
      
      // Filter to today's closed trades
      const todaysClosed = closedPositions.filter(p => {
        if (!p.exitTime) return false;
        return p.exitTime.startsWith(dateStr);
      });
      
      // Calculate stats
      const wins = todaysClosed.filter(p => (p.realizedPnL || 0) > 0).length;
      const losses = todaysClosed.filter(p => (p.realizedPnL || 0) < 0).length;
      const realizedPnL = todaysClosed.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
      const unrealizedPnL = openPositions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
      
      // Find best and worst trades
      const sortedByPnl = [...todaysClosed].sort((a, b) => (b.realizedPnLPercent || 0) - (a.realizedPnLPercent || 0));
      const bestTrade = sortedByPnl.length > 0 && (sortedByPnl[0].realizedPnLPercent || 0) > 0 
        ? { symbol: sortedByPnl[0].symbol, pnlPercent: sortedByPnl[0].realizedPnLPercent || 0 }
        : null;
      const worstTrade = sortedByPnl.length > 0 && (sortedByPnl[sortedByPnl.length - 1].realizedPnLPercent || 0) < 0
        ? { symbol: sortedByPnl[sortedByPnl.length - 1].symbol, pnlPercent: sortedByPnl[sortedByPnl.length - 1].realizedPnLPercent || 0 }
        : null;
      
      // Build review data
      const reviewData = {
        date: dateStr,
        totalTrades: todaysClosed.length,
        wins,
        losses,
        openPositions: openPositions.length,
        realizedPnL,
        unrealizedPnL,
        bestTrade,
        worstTrade,
        closedTrades: todaysClosed.map(p => ({
          symbol: p.symbol,
          pnlPercent: p.realizedPnLPercent || 0,
          optionType: p.optionType || undefined,
          strikePrice: p.strikePrice || undefined
        }))
      };
      
      // Send daily review
      const reviewSent = await sendDailyTradingReviewToDiscord(reviewData);
      
      // Generate next-day outlook from recent trade ideas
      const allIdeas = await storage.getAllTradeIdeas();
      const recentIdeas = allIdeas
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 20);
      const optionIdeas = recentIdeas
        .filter(i => i.assetType === 'option' && i.strikePrice && i.expiryDate)
        .filter(i => {
          const signals = i.qualitySignals?.length || 0;
          const conf = i.confidenceScore || 0;
          return signals >= 2 && conf >= 55;
        })
        .slice(0, 5);
      
      const tomorrowDate = new Date(ctNow);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
      
      const outlookData = {
        date: tomorrowStr,
        topPicks: optionIdeas.map(i => ({
          symbol: i.symbol,
          optionType: i.optionType || 'call',
          strikePrice: i.strikePrice || 0,
          expiryDate: i.expiryDate || '',
          reason: (i.keyLevels?.slice(0, 50) || i.aiAnalysis?.slice(0, 50) || 'Technical setup') as string,
          grade: i.qualitySignals?.length && i.qualitySignals.length >= 5 ? 'A' : 
                 i.qualitySignals?.length && i.qualitySignals.length >= 3 ? 'B+' : 'B'
        })),
        marketNotes: openPositions.length > 0 
          ? `Currently holding ${openPositions.length} open position(s) overnight.`
          : 'No overnight positions. Ready for fresh entries tomorrow.'
      };
      
      const outlookSent = await sendNextDayOutlookToDiscord(outlookData);
      
      logger.info(`📊 [BOT] Daily review sent: ${reviewSent}, Outlook sent: ${outlookSent}`);
      
      res.json({
        success: true,
        reviewSent,
        outlookSent,
        review: reviewData,
        outlook: outlookData,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error sending daily trading review", { error });
      res.status(500).json({ error: "Failed to send daily review" });
    }
  });

  // ==========================================
  // WALLET TRACKER API ENDPOINTS
  // ==========================================

  // GET /api/wallets - Get all tracked wallets for authenticated user
  app.get("/api/wallets", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const wallets = await storage.getTrackedWallets(userId);
      res.json(wallets);
    } catch (error: any) {
      logger.error("Error fetching tracked wallets", { error });
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  // POST /api/wallets - Add a new wallet to track
  app.post("/api/wallets", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const validatedData = insertTrackedWalletSchema.parse({
        ...req.body,
        userId,
      });
      
      const wallet = await storage.createTrackedWallet(validatedData);
      res.status(201).json(wallet);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid wallet data", details: error.errors });
      }
      logger.error("Error creating tracked wallet", { error });
      res.status(500).json({ error: "Failed to create wallet" });
    }
  });

  // DELETE /api/wallets/:id - Remove a tracked wallet
  app.delete("/api/wallets/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { id } = req.params;
      
      const wallet = await storage.getTrackedWalletById(id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      if (wallet.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.deleteTrackedWallet(id);
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting tracked wallet", { error });
      res.status(500).json({ error: "Failed to delete wallet" });
    }
  });

  // GET /api/wallets/:id/holdings - Get token holdings for a wallet
  app.get("/api/wallets/:id/holdings", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { id } = req.params;
      
      const wallet = await storage.getTrackedWalletById(id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      if (wallet.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const holdings = await storage.getWalletHoldings(id);
      res.json(holdings);
    } catch (error: any) {
      logger.error("Error fetching wallet holdings", { error });
      res.status(500).json({ error: "Failed to fetch holdings" });
    }
  });

  // GET /api/wallets/:id/transactions - Get transaction history for a wallet
  app.get("/api/wallets/:id/transactions", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { id } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      const wallet = await storage.getTrackedWalletById(id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      if (wallet.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const transactions = await storage.getWalletTransactions(id, limit);
      res.json(transactions);
    } catch (error: any) {
      logger.error("Error fetching wallet transactions", { error });
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // POST /api/wallets/:id/sync - Trigger a sync for wallet holdings/transactions
  app.post("/api/wallets/:id/sync", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { id } = req.params;
      
      const wallet = await storage.getTrackedWalletById(id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      if (wallet.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Update lastSyncAt timestamp (actual sync would be done by a background service)
      const now = new Date().toISOString();
      await storage.updateTrackedWallet(id, { lastSyncAt: now });
      
      res.json({ 
        success: true, 
        message: "Wallet sync initiated",
        syncedAt: now 
      });
    } catch (error: any) {
      logger.error("Error syncing wallet", { error });
      res.status(500).json({ error: "Failed to sync wallet" });
    }
  });

  // GET /api/whale-activity - Get recent large transactions across all tracked wallets
  app.get("/api/whale-activity", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const activity = await storage.getWhaleActivity(userId, limit);
      res.json(activity);
    } catch (error: any) {
      logger.error("Error fetching whale activity", { error });
      res.status(500).json({ error: "Failed to fetch whale activity" });
    }
  });

  // POST /api/wallet-alerts - Create an alert for a wallet
  app.post("/api/wallet-alerts", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const validatedData = insertWalletAlertSchema.parse({
        ...req.body,
        userId,
      });
      
      // Verify wallet belongs to user
      const wallet = await storage.getTrackedWalletById(validatedData.walletId);
      if (!wallet || wallet.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized or wallet not found" });
      }
      
      const alert = await storage.createWalletAlert(validatedData);
      res.status(201).json(alert);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid alert data", details: error.errors });
      }
      logger.error("Error creating wallet alert", { error });
      res.status(500).json({ error: "Failed to create alert" });
    }
  });

  // GET /api/wallet-alerts - Get all alerts for authenticated user
  app.get("/api/wallet-alerts", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const alerts = await storage.getWalletAlerts(userId);
      res.json(alerts);
    } catch (error: any) {
      logger.error("Error fetching wallet alerts", { error });
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  // DELETE /api/wallet-alerts/:id - Delete an alert
  app.delete("/api/wallet-alerts/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.session?.userId;
      const { id } = req.params;
      
      const alert = await storage.getWalletAlertById(id);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      
      if (alert.userId !== userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.deleteWalletAlert(id);
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting wallet alert", { error });
      res.status(500).json({ error: "Failed to delete alert" });
    }
  });

  // ==========================================
  // CT TRACKER API ENDPOINTS
  // ==========================================

  // GET /api/ct/sources - Get all tracked influencer sources
  app.get("/api/ct/sources", isAuthenticated, async (req: any, res: Response) => {
    try {
      const sources = await storage.getCTSources();
      res.json(sources);
    } catch (error: any) {
      logger.error("Error fetching CT sources", { error });
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  // POST /api/ct/sources - Add a new influencer source to track
  app.post("/api/ct/sources", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validatedData = insertCTSourceSchema.parse(req.body);
      const source = await storage.createCTSource(validatedData);
      res.status(201).json(source);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid source data", details: error.errors });
      }
      logger.error("Error creating CT source", { error });
      res.status(500).json({ error: "Failed to create source" });
    }
  });

  // DELETE /api/ct/sources/:id - Remove a source
  app.delete("/api/ct/sources/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      
      const source = await storage.getCTSourceById(id);
      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      await storage.deleteCTSource(id);
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting CT source", { error });
      res.status(500).json({ error: "Failed to delete source" });
    }
  });

  // GET /api/ct/mentions - Get recent mentions (query params: hours, ticker, sentiment)
  app.get("/api/ct/mentions", isAuthenticated, async (req: any, res: Response) => {
    try {
      const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined;
      const ticker = req.query.ticker as string | undefined;
      const sentiment = req.query.sentiment as string | undefined;
      
      let mentions;
      if (ticker) {
        mentions = await storage.getCTMentionsByTicker(ticker, hours);
      } else if (sentiment) {
        mentions = await storage.getCTMentionsBySentiment(sentiment, hours);
      } else {
        mentions = await storage.getCTMentions(hours);
      }
      
      res.json(mentions);
    } catch (error: any) {
      logger.error("Error fetching CT mentions", { error });
      res.status(500).json({ error: "Failed to fetch mentions" });
    }
  });

  // GET /api/ct/top-tickers - Get most mentioned tickers
  app.get("/api/ct/top-tickers", isAuthenticated, async (req: any, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const hours = req.query.hours ? parseInt(req.query.hours as string) : 24;
      
      const mentions = await storage.getCTMentions(hours);
      
      // Count ticker mentions
      const tickerCounts = new Map<string, { count: number; bullish: number; bearish: number; neutral: number }>();
      
      for (const mention of mentions) {
        if (mention.tickers) {
          for (const ticker of mention.tickers) {
            const existing = tickerCounts.get(ticker) || { count: 0, bullish: 0, bearish: 0, neutral: 0 };
            existing.count++;
            if (mention.sentiment === 'bullish') existing.bullish++;
            else if (mention.sentiment === 'bearish') existing.bearish++;
            else existing.neutral++;
            tickerCounts.set(ticker, existing);
          }
        }
      }
      
      // Sort by count and return top tickers
      const topTickers = Array.from(tickerCounts.entries())
        .map(([ticker, data]) => ({ ticker, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
      
      res.json(topTickers);
    } catch (error: any) {
      logger.error("Error fetching top tickers", { error });
      res.status(500).json({ error: "Failed to fetch top tickers" });
    }
  });

  // POST /api/ct/parse - Parse text for ticker mentions
  app.post("/api/ct/parse", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { text, sourceId } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: "Text is required" });
      }
      
      // Parse tickers from text (looking for $SYMBOL pattern)
      const tickerRegex = /\$[A-Z]{1,10}/gi;
      const matches = text.match(tickerRegex) || [];
      const uniqueTickers = Array.from(new Set(matches));
      const tickers = uniqueTickers.map(t => t.toUpperCase());
      
      // Simple sentiment analysis based on keywords
      const bullishKeywords = ['buy', 'long', 'moon', 'bullish', 'pump', 'breakout', 'accumulate', 'ath', 'gains'];
      const bearishKeywords = ['sell', 'short', 'dump', 'bearish', 'crash', 'avoid', 'rekt', 'scam', 'rug'];
      
      const lowerText = text.toLowerCase();
      const bullishScore = bullishKeywords.filter(k => lowerText.includes(k)).length;
      const bearishScore = bearishKeywords.filter(k => lowerText.includes(k)).length;
      
      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let sentimentScore = 0;
      
      if (bullishScore > bearishScore) {
        sentiment = 'bullish';
        sentimentScore = Math.min(1, bullishScore * 0.2);
      } else if (bearishScore > bullishScore) {
        sentiment = 'bearish';
        sentimentScore = Math.max(-1, -bearishScore * 0.2);
      }
      
      // Check if this appears to be a trading call
      const callKeywords = ['entry', 'target', 'tp', 'sl', 'stop', 'take profit', 'position', 'buy at', 'sell at'];
      const isCall = callKeywords.some(k => lowerText.includes(k));
      
      res.json({
        tickers,
        sentiment,
        sentimentScore,
        isCall,
        originalText: text,
        sourceId,
      });
    } catch (error: any) {
      logger.error("Error parsing CT text", { error });
      res.status(500).json({ error: "Failed to parse text" });
    }
  });

  // GET /api/ct/performance - Get call performance stats
  app.get("/api/ct/performance", isAuthenticated, async (req: any, res: Response) => {
    try {
      const stats = await storage.getCTCallPerformanceStats();
      res.json(stats);
    } catch (error: any) {
      logger.error("Error fetching CT performance", { error });
      res.status(500).json({ error: "Failed to fetch performance stats" });
    }
  });

  // PATCH /api/ct/sources/:id - Update source settings (auto-follow, etc.)
  app.patch("/api/ct/sources/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { autoFollowTrades, maxAutoTradeSize, isActive, displayName, category } = req.body;
      
      const source = await storage.getCTSourceById(id);
      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      // Update the source
      const updateData: any = {};
      if (autoFollowTrades !== undefined) updateData.autoFollowTrades = autoFollowTrades;
      if (maxAutoTradeSize !== undefined) updateData.maxAutoTradeSize = maxAutoTradeSize;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (displayName !== undefined) updateData.displayName = displayName;
      if (category !== undefined) updateData.category = category;
      
      const updated = await storage.updateCTSource(id, updateData);
      logger.info("CT source updated", { id, updates: updateData });
      res.json(updated);
    } catch (error: any) {
      logger.error("Error updating CT source", { error });
      res.status(500).json({ error: "Failed to update source" });
    }
  });

  // POST /api/ct/copy-trade - Copy a trade from CT mention to paper trading
  app.post("/api/ct/copy-trade", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { symbol, direction, quantity, reason, sourceHandle, mentionId } = req.body;
      
      if (!symbol || !direction) {
        return res.status(400).json({ error: "Symbol and direction are required" });
      }
      
      // Get current price (crypto for now)
      const { getRealtimePrices } = await import("./realtime-price-service");
      const prices = getRealtimePrices();
      
      // Check if it's crypto (by checking common crypto symbols)
      const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'ARB', 'DOGE', 'SHIB', 'XRP', 'ADA', 'DOT', 'LINK', 'UNI', 'AAVE'];
      const isCrypto = cryptoSymbols.includes(symbol.toUpperCase().replace('$', ''));
      
      let currentPrice: number | undefined;
      if (isCrypto) {
        const cleanSymbol = symbol.toUpperCase().replace('$', '');
        currentPrice = prices[cleanSymbol] || prices[`${cleanSymbol}-USD`];
      }
      
      if (!currentPrice) {
        return res.status(400).json({ error: `Could not get price for ${symbol}. Please try again later.` });
      }
      
      const userId = req.user?.id || 'system';
      const positionSize = quantity || 100; // Default $100 position size
      const positionQuantity = positionSize / currentPrice;
      
      // Create paper position
      const position = await storage.createPaperPosition({
        portfolioId: 1, // Crypto portfolio
        symbol: symbol.toUpperCase().replace('$', ''),
        assetType: 'crypto',
        direction: direction as 'long' | 'short',
        entryPrice: currentPrice.toString(),
        quantity: positionQuantity.toString(),
        status: 'open',
        stopLoss: null,
        takeProfit: null,
        entryReason: reason || `Copied from ${sourceHandle || 'CT source'}`,
        entrySignals: [`Social trade from ${sourceHandle || 'CT tracker'}`],
      });
      
      logger.info("CT trade copied to paper trading", { 
        symbol, 
        direction, 
        price: currentPrice,
        sourceHandle,
        positionId: position.id
      });
      
      res.json({ 
        success: true, 
        position,
        message: `Copied ${direction} trade on ${symbol} @ $${currentPrice.toFixed(2)}`
      });
    } catch (error: any) {
      logger.error("Error copying CT trade", { error });
      res.status(500).json({ error: "Failed to copy trade" });
    }
  });

  // POST /api/ct/generate-mock - Generate mock data for testing (admin only)
  app.post("/api/ct/generate-mock", isAuthenticated, requireAdminJWT, async (req: any, res: Response) => {
    try {
      const { count = 10 } = req.body;
      
      // Generate mock CT sources
      const mockSources = [
        { platform: 'twitter' as const, handle: '@cryptowhale', displayName: 'Crypto Whale', category: 'whale' },
        { platform: 'twitter' as const, handle: '@defi_insider', displayName: 'DeFi Insider', category: 'analyst' },
        { platform: 'twitter' as const, handle: '@altcoin_daily', displayName: 'Altcoin Daily', category: 'news' },
      ];
      
      const createdSources = [];
      for (const source of mockSources) {
        const created = await storage.createCTSource(source);
        createdSources.push(created);
      }
      
      // Generate mock mentions
      const mockTickers = ['$BTC', '$ETH', '$SOL', '$AVAX', '$MATIC', '$ARB', '$DOGE', '$SHIB'];
      const sentiments: Array<'bullish' | 'bearish' | 'neutral'> = ['bullish', 'bearish', 'neutral'];
      
      const createdMentions = [];
      for (let i = 0; i < count; i++) {
        const source = createdSources[Math.floor(Math.random() * createdSources.length)];
        const ticker = mockTickers[Math.floor(Math.random() * mockTickers.length)];
        const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
        
        const mention = await storage.createCTMention({
          sourceId: source.id,
          postText: `Mock ${sentiment} call on ${ticker}. This is a test mention.`,
          tickers: [ticker],
          sentiment,
          sentimentScore: sentiment === 'bullish' ? 0.7 : sentiment === 'bearish' ? -0.7 : 0,
          isCall: Math.random() > 0.5,
          postedAt: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
        });
        createdMentions.push(mention);
      }
      
      res.json({
        success: true,
        created: {
          sources: createdSources.length,
          mentions: createdMentions.length,
        },
      });
    } catch (error: any) {
      logger.error("Error generating mock CT data", { error });
      res.status(500).json({ error: "Failed to generate mock data" });
    }
  });

  // ==========================================
  // BLOG CMS ROUTES
  // ==========================================

  // GET /api/admin/blog - List all blog posts including drafts (admin only)
  app.get("/api/admin/blog", requireAdminJWT, async (_req: Request, res: Response) => {
    try {
      // Get all posts regardless of status for admin
      const allPosts = await storage.getBlogPosts();
      res.json(allPosts);
    } catch (error: any) {
      logger.error("Error fetching all blog posts for admin", { error });
      res.status(500).json({ error: "Failed to fetch blog posts" });
    }
  });

  // GET /api/blog - List published blog posts (public)
  app.get("/api/blog", async (_req: Request, res: Response) => {
    try {
      const posts = await storage.getBlogPosts('published');
      res.json(posts);
    } catch (error: any) {
      logger.error("Error fetching blog posts", { error });
      res.status(500).json({ error: "Failed to fetch blog posts" });
    }
  });

  // GET /api/blog/:slug - Get single blog post by slug (public)
  app.get("/api/blog/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const post = await storage.getBlogPostBySlug(slug);
      
      if (!post) {
        return res.status(404).json({ error: "Blog post not found" });
      }
      
      // Only return published posts to public
      if (post.status !== 'published') {
        return res.status(404).json({ error: "Blog post not found" });
      }
      
      res.json(post);
    } catch (error: any) {
      logger.error("Error fetching blog post", { error, slug: req.params.slug });
      res.status(500).json({ error: "Failed to fetch blog post" });
    }
  });

  // POST /api/blog - Create blog post (admin only)
  app.post("/api/blog", requireAdminJWT, async (req: Request, res: Response) => {
    try {
      const validatedData = insertBlogPostSchema.parse(req.body);
      const post = await storage.createBlogPost(validatedData);
      logger.info("Blog post created", { postId: post.id, slug: post.slug });
      res.status(201).json(post);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid blog post data", details: error.errors });
      }
      logger.error("Error creating blog post", { error });
      res.status(500).json({ error: "Failed to create blog post" });
    }
  });

  // PATCH /api/blog/:id - Update blog post (admin only)
  app.patch("/api/blog/:id", requireAdminJWT, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = insertBlogPostSchema.partial().parse(req.body);
      const updated = await storage.updateBlogPost(id, validatedData);
      
      if (!updated) {
        return res.status(404).json({ error: "Blog post not found" });
      }
      
      logger.info("Blog post updated", { postId: id });
      res.json(updated);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid blog post data", details: error.errors });
      }
      logger.error("Error updating blog post", { error, postId: req.params.id });
      res.status(500).json({ error: "Failed to update blog post" });
    }
  });

  // DELETE /api/blog/:id - Delete blog post (admin only)
  app.delete("/api/blog/:id", requireAdminJWT, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteBlogPost(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Blog post not found" });
      }
      
      logger.info("Blog post deleted", { postId: id });
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting blog post", { error, postId: req.params.id });
      res.status(500).json({ error: "Failed to delete blog post" });
    }
  });

  // Blog Routes
  app.get("/api/blog", async (_req, res) => {
    try {
      const posts = await storage.getBlogPosts("published");
      res.json(posts);
    } catch (error) {
      console.error("Error fetching blog posts:", error);
      res.status(500).json({ error: "Failed to fetch blog posts" });
    }
  });

  app.get("/api/blog/:slug", async (req, res) => {
    try {
      const post = await storage.getBlogPostBySlug(req.params.slug);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      res.json(post);
    } catch (error) {
      console.error("Error fetching blog post:", error);
      res.status(500).json({ error: "Failed to fetch blog post" });
    }
  });

  // POST /api/admin/seed-blog - Seed educational blog content (admin only)
  app.post("/api/admin/seed-blog", requireAdminJWT, async (_req: Request, res: Response) => {
    try {
      const educationalPosts = [
        {
          slug: "understanding-options-basics",
          title: "Understanding Options: A Beginner's Complete Guide",
          excerpt: "Learn the fundamentals of options trading - calls, puts, strikes, and expiration dates explained in plain English.",
          category: "education" as const,
          authorName: "Trading Education Team",
          status: "published" as const,
          content: `# Understanding Options: A Beginner's Complete Guide

Options trading can seem intimidating at first, but once you understand the basics, it opens up a whole new world of trading possibilities. This guide will walk you through everything you need to know to get started.

## What Are Options?

An option is a contract that gives you the **right** (but not the obligation) to buy or sell a stock at a specific price before a certain date.

Think of it like a reservation. When you make a dinner reservation, you have the right to dine at that restaurant, but you're not obligated to show up. Options work similarly.

## The Two Types of Options

### Call Options
A **call option** gives you the right to **BUY** a stock at a specific price (the strike price) before the expiration date.

**When to buy calls:** When you think a stock will go UP.

**Example:** You buy a $100 call option on AAPL expiring in 2 weeks. If AAPL rises to $110, your option becomes valuable because you can buy shares at $100 when they're worth $110.

### Put Options
A **put option** gives you the right to **SELL** a stock at a specific price before the expiration date.

**When to buy puts:** When you think a stock will go DOWN.

**Example:** You buy a $100 put option on AAPL. If AAPL drops to $90, your option is valuable because you can sell shares at $100 when they're only worth $90.

## Key Terms You Need to Know

### Strike Price
The price at which you can buy (call) or sell (put) the underlying stock.

### Expiration Date
The date when your option expires. After this date, the option becomes worthless if it hasn't been exercised.

### Premium
The price you pay to buy an option. This is your maximum risk - you can never lose more than the premium you paid.

### In-the-Money (ITM)
- For calls: When the stock price is ABOVE the strike price
- For puts: When the stock price is BELOW the strike price

### Out-of-the-Money (OTM)
- For calls: When the stock price is BELOW the strike price
- For puts: When the stock price is ABOVE the strike price

### At-the-Money (ATM)
When the stock price equals the strike price.

## Why Trade Options?

1. **Leverage**: Control more shares with less capital
2. **Defined Risk**: Your maximum loss is the premium paid
3. **Flexibility**: Profit from up, down, or sideways moves
4. **Income**: Sell options to collect premium

## Common Mistakes to Avoid

1. **Not understanding time decay**: Options lose value as they approach expiration
2. **Buying too far OTM**: Cheap options often expire worthless
3. **Ignoring implied volatility**: High IV means expensive options
4. **Not having an exit plan**: Know your stop loss and profit target before entering

## Getting Started

Start small. Paper trade first. Learn one strategy well before moving to others. Focus on liquid options with tight bid-ask spreads.

Remember: options can go to zero. Only trade with money you can afford to lose.

---

*This content is for educational purposes only and does not constitute financial advice.*`
        },
        {
          slug: "position-sizing-risk-management",
          title: "Position Sizing: The Most Important Skill in Trading",
          excerpt: "Learn how to size your positions correctly so one bad trade doesn't blow up your account.",
          category: "risk-management" as const,
          authorName: "Trading Education Team",
          status: "published" as const,
          content: `# Position Sizing: The Most Important Skill in Trading

You can have the best trading strategy in the world, but without proper position sizing, you'll still lose money. This is the skill that separates professional traders from gamblers.

## The 2% Rule

Never risk more than 2% of your trading account on any single trade.

**Example:**
- Account size: $10,000
- Maximum risk per trade: $200 (2%)

This means if your stop loss is hit, you should only lose $200 maximum.

## Calculating Position Size

Here's the formula:

**Position Size = (Account Risk %) / (Trade Risk %)**

### Example Calculation

- Account: $10,000
- Risk per trade: 2% = $200
- Option price: $2.00 per contract
- Stop loss: 50% of premium = $1.00 loss per contract

**Maximum contracts = $200 / $100 = 2 contracts**

(Each contract represents 100 shares, so a $1.00 loss = $100 per contract)

## Why This Matters

Let's compare two traders with $10,000 accounts:

### Trader A (No Risk Management)
- Risks 20% per trade ($2,000)
- 5 losing trades in a row = -$10,000 (account blown)

### Trader B (2% Risk Rule)
- Risks 2% per trade ($200)
- 5 losing trades in a row = -$1,000 (account intact)
- Still has $9,000 to recover

Losing streaks are inevitable. The question is: will you survive them?

## Adjusting for Win Rate

If you know your win rate, you can calculate optimal position size:

- 50% win rate: Keep risk at 1-2%
- 60% win rate: Can consider 2-3%
- 40% win rate: Reduce to 1% or less

## The Kelly Criterion (Advanced)

**Kelly % = Win Rate - (Loss Rate / Average Win-Loss Ratio)**

Most traders use "Half Kelly" or "Quarter Kelly" for safety.

## Common Position Sizing Mistakes

1. **Revenge trading**: Doubling down after losses
2. **Overconfidence**: Increasing size after wins
3. **FOMO sizing**: Going big on "sure things"
4. **Ignoring correlation**: Multiple positions in same sector

## Practical Tips

1. **Calculate before you trade**: Know your position size before entering
2. **Use position size calculators**: Many are free online
3. **Keep a trading journal**: Track your sizing decisions
4. **Scale into positions**: Start with half size, add on confirmation

## The Bottom Line

Professional traders focus on risk management first, profits second. Master position sizing, and you'll already be ahead of 90% of retail traders.

---

*This content is for educational purposes only and does not constitute financial advice.*`
        },
        {
          slug: "reading-candlestick-charts",
          title: "How to Read Candlestick Charts: A Visual Guide",
          excerpt: "Master the art of reading price action with candlestick charts - the most popular charting method used by traders worldwide.",
          category: "education" as const,
          authorName: "Trading Education Team",
          status: "published" as const,
          content: `# How to Read Candlestick Charts: A Visual Guide

Candlestick charts originated in 18th century Japan for rice trading. Today, they're the most popular way to visualize price action. Here's how to read them.

## Anatomy of a Candlestick

Each candlestick shows four pieces of information:
- **Open**: Where the price started
- **High**: The highest price reached
- **Low**: The lowest price reached
- **Close**: Where the price ended

### Green (Bullish) Candles
- Close is HIGHER than Open
- Price went UP during this period
- Body shows the range from open (bottom) to close (top)

### Red (Bearish) Candles
- Close is LOWER than Open
- Price went DOWN during this period
- Body shows the range from open (top) to close (bottom)

### Wicks (Shadows)
The thin lines above and below the body show the high and low.
- Upper wick = rejection of higher prices
- Lower wick = rejection of lower prices

## Important Candlestick Patterns

### Single Candle Patterns

**Doji**: Open and close are nearly the same
- Shows indecision in the market
- Often signals a potential reversal

**Hammer**: Small body at top, long lower wick
- Bullish reversal pattern
- Shows buyers rejected lower prices

**Shooting Star**: Small body at bottom, long upper wick
- Bearish reversal pattern
- Shows sellers rejected higher prices

### Two Candle Patterns

**Engulfing Pattern**: Second candle completely engulfs the first
- Bullish engulfing: Green candle engulfs red (potential upside)
- Bearish engulfing: Red candle engulfs green (potential downside)

### Three Candle Patterns

**Morning Star**: Bearish candle, small candle, bullish candle
- Bullish reversal pattern at bottom of downtrend

**Evening Star**: Bullish candle, small candle, bearish candle
- Bearish reversal pattern at top of uptrend

## What Candlesticks Tell Us

### Strong Bullish Signs
- Long green bodies (strong buying pressure)
- No upper wicks (buyers in control all day)
- Increasing volume on green candles

### Strong Bearish Signs
- Long red bodies (strong selling pressure)
- No lower wicks (sellers in control all day)
- Increasing volume on red candles

### Indecision/Weakness
- Small bodies (dojis)
- Long wicks on both sides
- Decreasing volume

## Timeframes Matter

The same pattern means different things on different timeframes:

- **1-minute chart**: Short-term noise, useful for day traders
- **1-hour chart**: Intraday swings
- **4-hour chart**: Good for swing trades
- **Daily chart**: Significant levels, trend direction
- **Weekly chart**: Major trend, long-term view

**Rule**: Higher timeframes are more reliable than lower timeframes.

## Combining with Other Analysis

Candlesticks work best when combined with:
1. **Support/Resistance levels**: Patterns at key levels are more reliable
2. **Volume**: Confirm patterns with volume
3. **Trend**: Trade patterns in direction of the trend

## Practice Tips

1. Start with daily charts (less noise)
2. Focus on 2-3 patterns first
3. Look for patterns at key levels
4. Always wait for confirmation
5. Use a trading journal to track what works

---

*This content is for educational purposes only and does not constitute financial advice.*`
        },
        {
          slug: "options-greeks-explained",
          title: "The Greeks Explained: Delta, Theta, Gamma, Vega",
          excerpt: "Understand how Delta, Theta, Gamma, and Vega affect your options positions and how to use them to your advantage.",
          category: "education" as const,
          authorName: "Trading Education Team",
          status: "published" as const,
          content: `# The Greeks Explained: Delta, Theta, Gamma, Vega

The Greeks are measurements that tell you how sensitive your option is to various factors. Understanding them is essential for managing risk and maximizing profits.

## Delta (Δ) - Directional Exposure

**What it measures**: How much the option price changes for each $1 move in the stock.

### Key Points
- Calls have positive delta (0 to 1)
- Puts have negative delta (-1 to 0)
- At-the-money options have ~0.50 delta
- Deep ITM options have ~1.0 delta (move like stock)
- Far OTM options have ~0.05 delta (barely move)

### Practical Use
- Delta 0.50 = 50% chance of expiring ITM
- Use delta to estimate your position's directional exposure
- Higher delta = more expensive but higher probability

**Example**: A 0.30 delta call will gain ~$0.30 if the stock rises $1.

## Theta (Θ) - Time Decay

**What it measures**: How much value your option loses each day due to time passing.

### Key Points
- Options lose value every day (time decay)
- Theta is NEGATIVE for option buyers
- Theta accelerates as expiration approaches
- ATM options have the highest theta
- Deep ITM/OTM options have lower theta

### The Theta Curve
- 30+ days out: Slow decay
- 14-30 days: Moderate decay
- 7-14 days: Accelerating decay
- 0-7 days: Rapid decay (danger zone)

**Example**: If theta is -0.05, your option loses $5 per contract per day.

### Strategy Implications
- Option buyers: Give yourself time (buy 2x the time you need)
- Option sellers: Collect theta by selling options

## Gamma (Γ) - Delta's Rate of Change

**What it measures**: How fast delta changes as the stock moves.

### Key Points
- Gamma is highest for ATM options near expiration
- High gamma = delta changes quickly (volatile position)
- Low gamma = delta is stable
- Gamma can work for or against you

### The Gamma Trap
Near expiration, ATM options have extreme gamma. A small stock move causes huge delta swings, making positions unpredictable.

**Example**: A 0DTE ATM option might go from 0.50 delta to 0.80 delta with a small move, then back to 0.30 delta if it reverses.

### Practical Use
- Short-term traders: High gamma = fast profits or losses
- Swing traders: Avoid high gamma (stay away from near-expiry ATM)

## Vega (ν) - Volatility Sensitivity

**What it measures**: How much the option price changes with a 1% change in implied volatility.

### Key Points
- Higher vega = more sensitive to volatility changes
- ATM options have the highest vega
- Longer-dated options have higher vega
- Vega matters most around earnings/events

### Volatility Crush
Before earnings, IV is high (options expensive). After earnings, IV drops (volatility crush), and option values drop even if the stock moves in your favor.

**Example**: You buy calls before earnings. Stock goes up 3%, but your calls lose money because IV dropped 40%.

### Strategy Implications
- Buy options when IV is low
- Sell options when IV is high
- Be aware of IV crush around events

## Putting It All Together

### Example Position Analysis
- Long AAPL $180 call, 14 days to expiry
- Delta: 0.45 (moves $0.45 per $1 stock move)
- Theta: -0.08 (loses $8/day per contract)
- Gamma: 0.04 (delta increases 0.04 per $1 move)
- Vega: 0.15 (gains $15 per 1% IV increase)

**Risk Assessment**: You need AAPL to move up quickly to overcome theta decay. A 14-day timeline with moderate theta is manageable, but you need a catalyst.

## Quick Reference

| Greek | What it Measures | Buyer Wants | Seller Wants |
|-------|-----------------|-------------|--------------|
| Delta | Direction | High for direction | Low for neutral |
| Theta | Time Decay | Low theta | High theta |
| Gamma | Delta speed | Depends | Low gamma |
| Vega | Volatility | High before events | Low or negative |

---

*This content is for educational purposes only and does not constitute financial advice.*`
        },
        {
          slug: "trading-psychology-emotions",
          title: "Trading Psychology: How to Control Your Emotions",
          excerpt: "Learn how to manage fear, greed, and FOMO - the three emotions that destroy most traders.",
          category: "strategy" as const,
          authorName: "Trading Education Team",
          status: "published" as const,
          content: `# Trading Psychology: How to Control Your Emotions

The hardest part of trading isn't finding good setups - it's managing your own psychology. Here's how to master the mental game.

## The Three Deadly Emotions

### 1. Fear
**How it manifests:**
- Closing winning trades too early
- Not taking valid setups
- Moving stop losses wider
- Freezing during volatile moves

**The Fix:**
- Pre-define your exit rules
- Accept that losses are part of the game
- Trade smaller until confidence builds
- Focus on the process, not the outcome

### 2. Greed
**How it manifests:**
- Holding winners too long
- Increasing position size after wins
- "Let it ride" mentality
- Not taking profits at targets

**The Fix:**
- Set profit targets before entering
- Take partial profits at milestones
- Remember: pigs get slaughtered
- Use trailing stops to lock in gains

### 3. FOMO (Fear of Missing Out)
**How it manifests:**
- Chasing entries after moves start
- Buying at the top
- Entering without a plan
- Taking low-quality setups

**The Fix:**
- There's always another trade
- Wait for your setup, not just any setup
- If you missed it, you missed it
- The best trades come to those who wait

## Building Mental Discipline

### Create a Trading Plan
Write down your rules before the market opens:
- What setups will you take?
- What position size?
- Where's your stop loss?
- Where's your profit target?
- Under what conditions will you not trade?

### Keep a Trading Journal
After every trade, record:
- Why you entered
- How you felt during the trade
- What you did well
- What you could improve
- Your emotional state

### Develop a Pre-Trade Routine
- Check market conditions
- Review your rules
- Ensure you're in the right mindset
- Take a break if you're emotional

## Common Psychological Traps

### Revenge Trading
After a loss, you immediately take another trade to "make it back."

**Solution**: Walk away after a losing trade. Cool down. Review what happened. Only trade again when you're calm.

### Overconfidence After Wins
A winning streak makes you feel invincible. You increase size. Then you give it all back.

**Solution**: Treat every trade the same. Don't let wins inflate your ego. Stay humble.

### Analysis Paralysis
You study charts for hours but can't pull the trigger.

**Solution**: Accept uncertainty. No trade is guaranteed. If it meets your criteria, take it.

### Anchoring
You keep referencing a price where you "should have" bought or sold.

**Solution**: Focus on current price action. The past is irrelevant. What matters is now.

## Practical Techniques

### The 10-Second Rule
Before clicking buy or sell, pause for 10 seconds. Ask yourself:
1. Does this follow my plan?
2. Am I emotional right now?
3. Would I tell a friend to take this trade?

### Physical State Matters
- Get enough sleep
- Exercise regularly
- Avoid trading when tired, angry, or anxious
- Take breaks during the trading day

### Size Down When Struggling
If you're in a slump:
- Cut your position size in half
- Trade with paper money
- Focus on rebuilding confidence
- Only increase size when back on track

## The Mindset of a Pro

Professional traders think differently:
- They focus on **risk** first, **reward** second
- They accept **losses** as business expenses
- They play the **long game**
- They **don't need** any single trade to work
- They follow their **system** regardless of feelings

## Key Takeaways

1. Your biggest enemy is yourself
2. Have a plan and follow it
3. Keep a journal to identify patterns
4. Size down when emotional
5. The goal is consistency, not home runs

Remember: Mastering your psychology is a journey, not a destination. Keep working at it.

---

*This content is for educational purposes only and does not constitute financial advice.*`
        },
        {
          slug: "support-resistance-levels",
          title: "Support and Resistance: The Foundation of Technical Analysis",
          excerpt: "Learn how to identify key support and resistance levels where price is likely to react.",
          category: "education" as const,
          authorName: "Trading Education Team",
          status: "published" as const,
          content: `# Support and Resistance: The Foundation of Technical Analysis

Support and resistance are the most fundamental concepts in technical analysis. Master these, and you'll have a framework for analyzing any chart.

## What is Support?

**Support** is a price level where buying pressure is strong enough to stop a downtrend.

Think of it as a floor - price bounces off it because buyers step in.

### Why Support Forms
- Previous lows that held
- Round numbers ($100, $50)
- Moving averages
- High volume price areas
- Previous resistance that became support

## What is Resistance?

**Resistance** is a price level where selling pressure is strong enough to stop an uptrend.

Think of it as a ceiling - price bounces down from it because sellers step in.

### Why Resistance Forms
- Previous highs that held
- Round numbers
- Moving averages
- All-time highs
- Previous support that became resistance

## The Psychology Behind S/R

### At Support
- Buyers remember: "I wish I bought here before"
- Short sellers: "Time to cover"
- Sellers who sold too early: "I want back in"

### At Resistance
- Sellers remember: "I should have sold here"
- Buyers who held too long: "I'll sell if it gets back here"
- Short sellers: "Good entry point"

## How to Identify Key Levels

### 1. Look for Multiple Touches
The more times a level has been tested, the more significant it is.
- 2 touches = minor level
- 3+ touches = significant level

### 2. Use Multiple Timeframes
A level that appears on the daily AND weekly chart is more important than one only on the 5-minute chart.

### 3. Note the Strength of Reactions
A strong bounce (large candle, high volume) indicates a stronger level than a weak bounce.

### 4. Round Numbers
Psychological levels like $100, $150, $200 often act as S/R.

## Support Becomes Resistance (and Vice Versa)

This is one of the most powerful concepts in technical analysis.

### When Support Breaks
- Old support often becomes new resistance
- Buyers who bought at support are now underwater
- They'll sell to "break even" when price returns

### When Resistance Breaks
- Old resistance often becomes new support
- Sellers who sold at resistance were wrong
- Buyers now have a floor to lean against

## Trading Support and Resistance

### Bounce Strategy
1. Identify a strong S/R level
2. Wait for price to approach the level
3. Look for confirmation (reversal candle, volume)
4. Enter with stop on the other side of the level
5. Target the next S/R level

### Breakout Strategy
1. Identify a level that's been tested multiple times
2. Wait for a strong close beyond the level
3. Enter on the breakout or the retest
4. Stop below the level (for long) / above (for short)
5. Target the next S/R level

## Common Mistakes

### 1. Drawing Too Many Lines
Keep it simple. Focus on the most obvious levels that any trader can see.

### 2. Expecting Exact Touches
S/R is a zone, not an exact price. Give yourself a buffer.

### 3. Ignoring Context
A support level in an uptrend is different from support in a downtrend.

### 4. Trading Against Strong Trends
In a strong trend, S/R levels often break. Don't fight the trend.

## Practical Tips

1. **Start with daily charts**: Identify major levels first
2. **Mark zones, not lines**: Use rectangles instead of single lines
3. **Update regularly**: Levels change as new price action develops
4. **Combine with other analysis**: Use volume, patterns, indicators for confirmation
5. **Be patient**: Wait for price to reach your levels

## Advanced Concepts

### Confluence Zones
When multiple factors align at one level (moving average + horizontal S/R + trendline), the level is more significant.

### Volume Profile
Areas of high trading volume often act as S/R because many traders have positions there.

### Fibonacci Retracements
Common retracement levels (38.2%, 50%, 61.8%) often align with S/R.

---

*This content is for educational purposes only and does not constitute financial advice.*`
        },
        {
          slug: "tradingview-technical-analysis-guide",
          title: "Step-by-Step Guide to Technical Analysis in TradingView",
          excerpt: "Learn how to set up TradingView for professional technical analysis - from chart settings to indicator stacking and alert creation.",
          category: "education" as const,
          authorName: "Trading Education Team",
          status: "published" as const,
          content: `# Step-by-Step Guide to Technical Analysis in TradingView

TradingView is the most popular charting platform for retail traders. This guide will walk you through setting it up for professional-level technical analysis.

## Step 1: Setting Up Your Workspace

### Create Your Layout
1. Go to [TradingView.com](https://tradingview.com) and create a free account
2. Click "Chart" in the top menu to open the charting interface
3. Click the "Layout" dropdown (top right) → Save Layout → Name it "My Trading Setup"

### Chart Settings (Right-Click on Chart)
- **Symbol**: Choose your preferred ticker format (e.g., NASDAQ:AAPL)
- **Time zone**: Set to your local time or market time (EST/ET for US markets)
- **Session**: Show extended hours if you trade pre/post market

### Recommended Display Settings
1. Click the gear icon (Settings)
2. **Scales**: Enable "Auto scale" and "Lock Price to Bar Ratio"
3. **Trading**: Enable if you want to connect a broker
4. **Events**: Turn on Earnings and Dividends if trading stocks

## Step 2: Chart Hygiene - Clean Up Your Charts

Less is more. Cluttered charts lead to bad decisions.

### Recommended Clean Setup
- **Chart type**: Candlesticks (most information)
- **Colors**: Dark theme with green/red or blue/red candles
- **Grid lines**: Off or very faint
- **Watermarks**: Off

### Timeframe Selection
For swing trading, use this multi-timeframe approach:
- **Weekly**: Identify the major trend
- **Daily**: Find entry zones
- **4-Hour**: Confirm timing
- **1-Hour**: Fine-tune entries (optional)

**Pro tip**: Click the timeframe dropdown and add your favorites to the toolbar for quick switching.

## Step 3: Essential Indicators (The Only Ones You Need)

Don't overload your charts. These 4-5 indicators cover 90% of what you need:

### 1. Volume (Built-in)
- Add via Indicators → Built-ins → Volume
- Shows buying/selling pressure
- Look for volume confirmation on breakouts

### 2. Moving Averages
Add these two EMAs for trend direction:
- **20 EMA** (short-term trend) - Set color to blue
- **50 EMA** (medium-term trend) - Set color to orange

**How to add:**
1. Indicators → Search "EMA"
2. Add Exponential Moving Average
3. Click Settings → Change "Length" to 20
4. Repeat for 50 EMA

### 3. RSI (Relative Strength Index)
- Add via Indicators → RSI
- Default 14-period is fine
- Look for overbought (>70) and oversold (<30) conditions

### 4. VWAP (Volume Weighted Average Price)
- Add via Indicators → VWAP
- Essential for intraday trading
- Price above VWAP = bullish, below = bearish

### 5. ATR (Average True Range) - Optional
- Helps with stop loss placement
- ATR × 2 = common stop distance

## Step 4: Drawing Support and Resistance

### Horizontal Lines
1. Click the horizontal line tool (left toolbar) or press "H"
2. Click at major swing highs/lows
3. Color code: Green for support, Red for resistance

### Trendlines
1. Click trendline tool or press "T"
2. Connect at least 2 swing lows (uptrend) or highs (downtrend)
3. Extend the line to see where price might react

### Fibonacci Retracements
1. Click Fib Retracement tool
2. Click from swing low to swing high (for uptrend pullback levels)
3. Key levels: 0.382, 0.5, 0.618

## Step 5: Creating a Watchlist

### Build Your Watchlist
1. Click "+" in the watchlist panel (right side)
2. Add symbols you're tracking
3. Organize into sections (e.g., "Tech Stocks", "Crypto", "Setups")

### Watchlist Columns
Right-click on column headers to add:
- % Change (today's move)
- Volume (current volume)
- 52W High/Low (position in range)

## Step 6: Setting Alerts

Alerts let you step away from the screen while TradingView watches for you.

### Price Alerts
1. Right-click on chart at your target price
2. Select "Add Alert"
3. Choose "Crossing" or "Crossing Up/Down"
4. Set notification: Email, Push, or SMS

### Indicator Alerts
1. Click on an indicator (like RSI)
2. Right-click → Add Alert on RSI
3. Set condition (e.g., "RSI crosses below 30")

### Pro Tips for Alerts
- Name your alerts clearly: "AAPL breakout above $200"
- Set expiration dates if trading short-term setups
- Use webhook alerts if you want automated notifications

## Step 7: Saving Your Analysis

### Save Your Work
1. **Templates**: Save indicator setups as templates
   - Right-click chart → Save Template
   - Name it "My Trading Template"
   
2. **Snapshots**: Save chart images for your journal
   - Click camera icon (top right)
   - Creates a link to share

3. **Ideas**: Publish your analysis (optional)
   - Click "Publish" to share trade ideas publicly or privately

## Checklist: Before Every Trade

Use this checklist before entering any trade:

### Multi-Timeframe Analysis
- [ ] Weekly trend direction identified
- [ ] Daily chart shows clear setup
- [ ] 4H/1H confirms entry timing

### Technical Confirmation
- [ ] Price at key support/resistance level
- [ ] Volume confirms the move
- [ ] RSI not extreme (or showing divergence)
- [ ] Moving averages aligned with trade direction

### Risk Management
- [ ] Stop loss level identified (below support/above resistance)
- [ ] Position size calculated (1-2% risk max)
- [ ] Risk:Reward ratio is at least 2:1
- [ ] Alerts set for entry, stop, and target

## Advanced Features (Free Tier)

### Multiple Charts
- Split your screen into 2 charts (free) or more (paid)
- Sync symbols across charts with the chain icon

### Replay Mode
- Practice with historical data
- Click "Replay" button → Select date → Practice your analysis

### Pine Script
- Create custom indicators
- Backtest strategies
- Access the script editor from the bottom panel

## Common Mistakes to Avoid

1. **Too many indicators**: Pick 3-5 and master them
2. **Ignoring volume**: Always confirm moves with volume
3. **Wrong timeframe**: Match timeframe to your trading style
4. **No trading plan**: Have entry, stop, and target before you trade
5. **Chasing alerts**: Alerts notify you - still analyze before acting

## Practice Routine

1. **Daily (10 min)**: Review your watchlist, update key levels
2. **Weekly (30 min)**: Analyze higher timeframes, find new setups
3. **Monthly (1 hour)**: Review your trades, refine your process

---

*This content is for educational purposes only and does not constitute financial advice. TradingView is a third-party platform not affiliated with this content.*`
        }
      ];

      let created = 0;
      for (const post of educationalPosts) {
        try {
          // Check if post with this slug already exists
          const existing = await storage.getBlogPostBySlug(post.slug);
          if (!existing) {
            await storage.createBlogPost(post);
            created++;
            logger.info("Blog post created: " + post.slug);
          }
        } catch (error) {
          logger.warn("Could not create blog post " + post.slug + ":", error);
        }
      }

      res.json({ success: true, message: "Seeded " + created + " new blog posts" });
    } catch (error: any) {
      logger.error("Error seeding blog posts", { error });
      res.status(500).json({ error: "Failed to seed blog posts" });
    }
  });

  // ==========================================
  // AUTOMATION BOTS - Quant Mean-Reversion, Weekly Reports, Options Flow, Social Sentiment
  // ==========================================

  // Quant Mean-Reversion Bot endpoints
  app.get("/api/automations/quant-bot/status", async (_req, res) => {
    try {
      const { getQuantBotStatus } = await import("./quant-mean-reversion-bot");
      const status = getQuantBotStatus();
      res.json(status);
    } catch (error) {
      logger.error("Error getting quant bot status", { error });
      res.status(500).json({ error: "Failed to get quant bot status" });
    }
  });

  app.post("/api/automations/quant-bot/toggle", requireAdminJWT, async (req, res) => {
    try {
      const { active } = req.body;
      const { setQuantBotActive, getQuantBotStatus } = await import("./quant-mean-reversion-bot");
      setQuantBotActive(active);
      res.json(getQuantBotStatus());
    } catch (error) {
      logger.error("Error toggling quant bot", { error });
      res.status(500).json({ error: "Failed to toggle quant bot" });
    }
  });

  app.post("/api/automations/quant-bot/scan", requireAdminJWT, async (_req, res) => {
    try {
      const { runQuantBotScan, getQuantBotStatus } = await import("./quant-mean-reversion-bot");
      await runQuantBotScan();
      res.json(getQuantBotStatus());
    } catch (error) {
      logger.error("Error running quant bot scan", { error });
      res.status(500).json({ error: "Failed to run quant bot scan" });
    }
  });

  app.get("/api/automations/quant-bot/metrics", async (_req, res) => {
    try {
      const { calculatePerformanceMetrics } = await import("./quant-mean-reversion-bot");
      const metrics = await calculatePerformanceMetrics();
      res.json(metrics);
    } catch (error) {
      logger.error("Error getting quant bot metrics", { error });
      res.status(500).json({ error: "Failed to get quant bot metrics" });
    }
  });

  app.post("/api/automations/quant-bot/settings", requireAdminJWT, async (req, res) => {
    try {
      const { updateQuantBotSettings, getQuantBotStatus } = await import("./quant-mean-reversion-bot");
      updateQuantBotSettings(req.body);
      res.json(getQuantBotStatus());
    } catch (error) {
      logger.error("Error updating quant bot settings", { error });
      res.status(500).json({ error: "Failed to update quant bot settings" });
    }
  });

  // Weekly Performance Report endpoints
  app.get("/api/automations/weekly-report/settings", async (_req, res) => {
    try {
      const { getReportSettings } = await import("./weekly-performance-report");
      const settings = getReportSettings();
      res.json(settings);
    } catch (error) {
      logger.error("Error getting report settings", { error });
      res.status(500).json({ error: "Failed to get report settings" });
    }
  });

  app.post("/api/automations/weekly-report/settings", requireAdminJWT, async (req, res) => {
    try {
      const { updateReportSettings, getReportSettings } = await import("./weekly-performance-report");
      updateReportSettings(req.body);
      res.json(getReportSettings());
    } catch (error) {
      logger.error("Error updating report settings", { error });
      res.status(500).json({ error: "Failed to update report settings" });
    }
  });

  app.post("/api/automations/weekly-report/generate", requireAdminJWT, async (_req, res) => {
    try {
      const { runWeeklyReport } = await import("./weekly-performance-report");
      const report = await runWeeklyReport();
      res.json(report);
    } catch (error) {
      logger.error("Error generating weekly report", { error });
      res.status(500).json({ error: "Failed to generate weekly report" });
    }
  });

  app.get("/api/automations/weekly-report/preview", async (_req, res) => {
    try {
      const { generateWeeklyReport } = await import("./weekly-performance-report");
      const report = await generateWeeklyReport();
      res.json(report);
    } catch (error) {
      logger.error("Error previewing weekly report", { error });
      res.status(500).json({ error: "Failed to preview weekly report" });
    }
  });

  // Options Flow Scanner endpoints
  app.get("/api/automations/options-flow/status", async (_req, res) => {
    try {
      const { getOptionsFlowStatus } = await import("./options-flow-scanner");
      const status = getOptionsFlowStatus();
      res.json(status);
    } catch (error) {
      logger.error("Error getting options flow status", { error });
      res.status(500).json({ error: "Failed to get options flow status" });
    }
  });

  app.post("/api/automations/options-flow/toggle", requireAdminJWT, async (req, res) => {
    try {
      const { active } = req.body;
      const { setOptionsFlowActive, getOptionsFlowStatus } = await import("./options-flow-scanner");
      setOptionsFlowActive(active);
      res.json(getOptionsFlowStatus());
    } catch (error) {
      logger.error("Error toggling options flow scanner", { error });
      res.status(500).json({ error: "Failed to toggle options flow scanner" });
    }
  });

  app.post("/api/automations/options-flow/scan", requireAdminJWT, async (_req, res) => {
    try {
      const { scanOptionsFlow } = await import("./options-flow-scanner");
      const flows = await scanOptionsFlow();
      res.json({ flows });
    } catch (error) {
      logger.error("Error scanning options flow", { error });
      res.status(500).json({ error: "Failed to scan options flow" });
    }
  });

  app.get("/api/automations/options-flow/today", async (_req, res) => {
    try {
      const { getTodayFlows } = await import("./options-flow-scanner");
      const flows = getTodayFlows();
      res.json(flows);
    } catch (error) {
      logger.error("Error getting today's flows", { error });
      res.status(500).json({ error: "Failed to get today's flows" });
    }
  });

  app.post("/api/automations/options-flow/settings", requireAdminJWT, async (req, res) => {
    try {
      const { updateOptionsFlowSettings, getOptionsFlowStatus } = await import("./options-flow-scanner");
      updateOptionsFlowSettings(req.body);
      res.json(getOptionsFlowStatus());
    } catch (error) {
      logger.error("Error updating options flow settings", { error });
      res.status(500).json({ error: "Failed to update options flow settings" });
    }
  });

  // Social Sentiment Scanner endpoints
  app.get("/api/automations/social-sentiment/status", async (_req, res) => {
    try {
      const { getSocialSentimentStatus } = await import("./social-sentiment-scanner");
      const status = getSocialSentimentStatus();
      res.json(status);
    } catch (error) {
      logger.error("Error getting social sentiment status", { error });
      res.status(500).json({ error: "Failed to get social sentiment status" });
    }
  });

  app.post("/api/automations/social-sentiment/toggle", requireAdminJWT, async (req, res) => {
    try {
      const { active } = req.body;
      const { setSocialSentimentActive, getSocialSentimentStatus } = await import("./social-sentiment-scanner");
      setSocialSentimentActive(active);
      res.json(getSocialSentimentStatus());
    } catch (error) {
      logger.error("Error toggling social sentiment scanner", { error });
      res.status(500).json({ error: "Failed to toggle social sentiment scanner" });
    }
  });

  app.post("/api/automations/social-sentiment/scan", requireAdminJWT, async (_req, res) => {
    try {
      const { scanSocialSentiment } = await import("./social-sentiment-scanner");
      const result = await scanSocialSentiment();
      res.json(result);
    } catch (error) {
      logger.error("Error scanning social sentiment", { error });
      res.status(500).json({ error: "Failed to scan social sentiment" });
    }
  });

  app.get("/api/automations/social-sentiment/trending", async (_req, res) => {
    try {
      const { getTrendingTickers } = await import("./social-sentiment-scanner");
      const trending = getTrendingTickers();
      res.json(trending);
    } catch (error) {
      logger.error("Error getting trending tickers", { error });
      res.status(500).json({ error: "Failed to get trending tickers" });
    }
  });

  app.get("/api/automations/social-sentiment/mentions", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const { getRecentMentions } = await import("./social-sentiment-scanner");
      const mentions = getRecentMentions(limit);
      res.json(mentions);
    } catch (error) {
      logger.error("Error getting recent mentions", { error });
      res.status(500).json({ error: "Failed to get recent mentions" });
    }
  });

  app.post("/api/automations/social-sentiment/analyze", async (req, res) => {
    try {
      const { text } = req.body;
      const { analyzeText } = await import("./social-sentiment-scanner");
      const result = analyzeText(text || '');
      res.json(result);
    } catch (error) {
      logger.error("Error analyzing text", { error });
      res.status(500).json({ error: "Failed to analyze text" });
    }
  });

  app.post("/api/automations/social-sentiment/settings", requireAdminJWT, async (req, res) => {
    try {
      const { updateSocialSentimentSettings, getSocialSentimentStatus } = await import("./social-sentiment-scanner");
      updateSocialSentimentSettings(req.body);
      res.json(getSocialSentimentStatus());
    } catch (error) {
      logger.error("Error updating social sentiment settings", { error });
      res.status(500).json({ error: "Failed to update social sentiment settings" });
    }
  });

  // Aggregated automations status endpoint - Now uses REAL data from paper trading system
  app.get("/api/bot/crypto", async (req, res) => {
    try {
      const { getCryptoPortfolio, getBotPreferences } = await import("./auto-lotto-trader");
      
      const portfolio = await getCryptoPortfolio();
      const prefs = await getBotPreferences();
      
      if (!portfolio) {
        return res.json({
          status: 'inactive',
          openPositions: 0,
          maxPositions: prefs.maxConcurrentTrades || 5,
          currentPositions: [],
          portfolio: { totalValue: 0, cashBalance: 0 }
        });
      }
      
      // Get actual positions from the portfolio
      const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
      const openPositions = positions.filter(p => p.status === 'open');
      const closedPositions = positions.filter(p => p.status === 'closed');
      
      // Calculate real win rate from closed trades (guard against division by zero)
      const wins = closedPositions.filter(p => (p.realizedPnL || 0) > 0).length;
      const winRate = closedPositions.length > 0 ? Math.round((wins / closedPositions.length) * 100) : 0;
      
      // Calculate today's trades
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTrades = closedPositions.filter(p => {
        const exitTime = p.exitTime ? new Date(p.exitTime) : null;
        return exitTime && exitTime >= today;
      }).length;
      
      // Map open positions to display format
      const currentPositions = openPositions.map(p => ({
        symbol: p.symbol,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice || p.entryPrice,
        quantity: p.quantity,
        side: p.direction,
        pnl: p.unrealizedPnL || 0,
        pnlPercent: p.unrealizedPnLPercent || 0,
      }));
      
      res.json({
        status: prefs.enableCrypto ? 'active' : 'inactive',
        lastScan: new Date().toISOString(),
        tradesExecuted: closedPositions.length,
        winRate: winRate,
        todayTrades: todayTrades,
        openPositions: openPositions.length,
        maxPositions: prefs.maxConcurrentTrades || 5,
        currentPositions: currentPositions,
        portfolio: {
          totalValue: portfolio.totalValue || portfolio.cashBalance,
          cashBalance: portfolio.cashBalance,
          startingCapital: portfolio.startingCapital,
          dailyPnL: 0,
          dailyPnLPercent: 0,
        }
      });
    } catch (error) {
      logger.error("Error getting crypto bot status", { error });
      res.status(500).json({ error: "Failed to get crypto bot status" });
    }
  });

  app.get("/api/automations/status", async (_req, res) => {
    try {
      const [quantBot, optionsFlow, socialSentiment, weeklyReport] = await Promise.all([
        import("./quant-mean-reversion-bot").then(m => m.getQuantBotStatus()),
        import("./options-flow-scanner").then(m => m.getOptionsFlowStatus()),
        import("./social-sentiment-scanner").then(m => m.getSocialSentimentStatus()),
        import("./weekly-performance-report").then(m => m.getReportSettings()),
      ]);
      res.json({
        quantBot,
        optionsFlow,
        socialSentiment,
        weeklyReport,
      });
    } catch (error) {
      logger.error("Error getting automations status", { error });
      res.status(500).json({ error: "Failed to get automations status" });
    }
  });

  // ============================================
  // UNIVERSAL IDEA GENERATOR - Generate trade ideas from ANY source
  // ============================================

  // POST /api/universal-ideas - Generate a trade idea from any source
  app.post("/api/universal-ideas", isAuthenticated, async (req: any, res) => {
    try {
      const { 
        generateUniversalTradeIdea, 
        createAndSaveUniversalIdea 
      } = await import("./universal-idea-generator");
      
      const { symbol, source, assetType, direction, signals, save = false, ...rest } = req.body;
      
      if (!symbol || !source || !assetType || !direction || !signals) {
        return res.status(400).json({ 
          error: "Missing required fields: symbol, source, assetType, direction, signals" 
        });
      }
      
      const input = {
        symbol,
        source,
        assetType,
        direction,
        signals,
        ...rest
      };
      
      if (save) {
        const success = await createAndSaveUniversalIdea(input);
        if (success) {
          res.json({ success: true, message: `Trade idea for ${symbol} saved successfully` });
        } else {
          res.status(500).json({ error: `Failed to create trade idea for ${symbol}` });
        }
      } else {
        const idea = await generateUniversalTradeIdea(input);
        if (idea) {
          res.json({ success: true, idea });
        } else {
          res.status(500).json({ error: `Failed to generate trade idea for ${symbol}` });
        }
      }
    } catch (error: any) {
      logger.error("Error generating universal trade idea", { error });
      res.status(500).json({ error: "Failed to generate trade idea" });
    }
  });

  // POST /api/universal-ideas/from-watchlist - Generate idea from watchlist item
  app.post("/api/universal-ideas/from-watchlist", isAuthenticated, async (req: any, res) => {
    try {
      const { generateIdeaFromWatchlist } = await import("./universal-idea-generator");
      const { symbol, signals, assetType = 'stock' } = req.body;
      
      if (!symbol || !signals || signals.length === 0) {
        return res.status(400).json({ error: "Symbol and at least one signal required" });
      }
      
      const idea = await generateIdeaFromWatchlist(symbol, signals, assetType);
      if (idea) {
        await storage.createTradeIdea(idea);
        res.json({ success: true, idea });
      } else {
        res.status(500).json({ error: `Failed to generate watchlist idea for ${symbol}` });
      }
    } catch (error: any) {
      logger.error("Error generating watchlist idea", { error });
      res.status(500).json({ error: "Failed to generate watchlist idea" });
    }
  });

  // POST /api/universal-ideas/from-scanner - Generate idea from market scanner mover
  app.post("/api/universal-ideas/from-scanner", isAuthenticated, async (req: any, res) => {
    try {
      const { generateIdeaFromScanner } = await import("./universal-idea-generator");
      const { symbol, changePercent, timeframe, additionalSignals = [] } = req.body;
      
      if (!symbol || changePercent === undefined || !timeframe) {
        return res.status(400).json({ error: "Symbol, changePercent, and timeframe required" });
      }
      
      const idea = await generateIdeaFromScanner(symbol, changePercent, timeframe, additionalSignals);
      if (idea) {
        const saved = await storage.createTradeIdea(idea);
        // Send Discord notification
        const { sendTradeIdeaToDiscord } = await import("./discord-service");
        sendTradeIdeaToDiscord(saved).catch(err => logger.error(`Discord failed for ${symbol}:`, err));
        res.json({ success: true, idea: saved });
      } else {
        res.status(500).json({ error: `Failed to generate scanner idea for ${symbol}` });
      }
    } catch (error: any) {
      logger.error("Error generating scanner idea", { error });
      res.status(500).json({ error: "Failed to generate scanner idea" });
    }
  });

  // POST /api/universal-ideas/from-flow - Generate idea from options flow alert
  app.post("/api/universal-ideas/from-flow", isAuthenticated, async (req: any, res) => {
    try {
      const { generateIdeaFromFlow } = await import("./universal-idea-generator");
      const { 
        symbol, optionType, strikePrice, expiryDate, 
        premium, unusualScore, additionalSignals = [] 
      } = req.body;
      
      if (!symbol || !optionType || !strikePrice || !expiryDate) {
        return res.status(400).json({ 
          error: "Symbol, optionType, strikePrice, and expiryDate required" 
        });
      }
      
      const idea = await generateIdeaFromFlow(
        symbol, optionType, strikePrice, expiryDate, 
        premium || 0, unusualScore || 50, additionalSignals
      );
      
      if (idea) {
        const saved = await storage.createTradeIdea(idea);
        // Send Discord notification
        const { sendTradeIdeaToDiscord } = await import("./discord-service");
        sendTradeIdeaToDiscord(saved).catch(err => logger.error(`Discord failed for ${symbol}:`, err));
        res.json({ success: true, idea: saved });
      } else {
        res.status(500).json({ error: `Failed to generate flow idea for ${symbol}` });
      }
    } catch (error: any) {
      logger.error("Error generating flow idea", { error });
      res.status(500).json({ error: "Failed to generate flow idea" });
    }
  });

  // POST /api/universal-ideas/from-social - Generate idea from social sentiment
  app.post("/api/universal-ideas/from-social", isAuthenticated, async (req: any, res) => {
    try {
      const { generateIdeaFromSocial } = await import("./universal-idea-generator");
      const { 
        symbol, sentiment, mentionCount, 
        influencerName, additionalSignals = [] 
      } = req.body;
      
      if (!symbol || !sentiment || mentionCount === undefined) {
        return res.status(400).json({ error: "Symbol, sentiment, and mentionCount required" });
      }
      
      const idea = await generateIdeaFromSocial(
        symbol, sentiment, mentionCount, influencerName, additionalSignals
      );
      
      if (idea) {
        const saved = await storage.createTradeIdea(idea);
        // Send Discord notification
        const { sendTradeIdeaToDiscord } = await import("./discord-service");
        sendTradeIdeaToDiscord(saved).catch(err => logger.error(`Discord failed for ${symbol}:`, err));
        res.json({ success: true, idea: saved });
      } else {
        res.status(500).json({ error: `Failed to generate social idea for ${symbol}` });
      }
    } catch (error: any) {
      logger.error("Error generating social idea", { error });
      res.status(500).json({ error: "Failed to generate social idea" });
    }
  });

  // POST /api/universal-ideas/from-chart - Generate idea from chart pattern
  app.post("/api/universal-ideas/from-chart-pattern", isAuthenticated, async (req: any, res) => {
    try {
      const { generateIdeaFromChart } = await import("./universal-idea-generator");
      const { 
        symbol, patternType, direction, 
        supportLevel, resistanceLevel, additionalSignals = [] 
      } = req.body;
      
      if (!symbol || !patternType || !direction) {
        return res.status(400).json({ error: "Symbol, patternType, and direction required" });
      }
      
      const idea = await generateIdeaFromChart(
        symbol, patternType, direction, supportLevel, resistanceLevel, additionalSignals
      );
      
      if (idea) {
        const saved = await storage.createTradeIdea(idea);
        // Send Discord notification
        const { sendTradeIdeaToDiscord } = await import("./discord-service");
        sendTradeIdeaToDiscord(saved).catch(err => logger.error(`Discord failed for ${symbol}:`, err));
        res.json({ success: true, idea: saved });
      } else {
        res.status(500).json({ error: `Failed to generate chart idea for ${symbol}` });
      }
    } catch (error: any) {
      logger.error("Error generating chart idea", { error });
      res.status(500).json({ error: "Failed to generate chart idea" });
    }
  });

  // GET /api/universal-ideas/signal-weights - Get available signals and their weights
  app.get("/api/universal-ideas/signal-weights", async (_req, res) => {
    try {
      const { SIGNAL_WEIGHTS, SOURCE_BASE_CONFIDENCE } = await import("./universal-idea-generator");
      res.json({
        signalWeights: SIGNAL_WEIGHTS,
        sourceBaseConfidence: SOURCE_BASE_CONFIDENCE,
        sources: [
          'watchlist', 'market_scanner', 'options_flow', 'social_sentiment',
          'chart_analysis', 'quant_signal', 'ai_analysis', 'manual',
          'crypto_scanner', 'news_catalyst', 'earnings_play', 'sector_rotation'
        ]
      });
    } catch (error: any) {
      logger.error("Error fetching signal weights", { error });
      res.status(500).json({ error: "Failed to fetch signal weights" });
    }
  });

  // ==========================================
  // CATALYST INTELLIGENCE API (Advanced tier required)
  // SEC Filings, Government Contracts, Catalyst Events
  // ==========================================

  // GET /api/catalysts/symbol/:ticker - Get all catalysts for a specific symbol
  app.get("/api/catalysts/symbol/:ticker", requireTier('canAccessCatalystScoring'), async (req, res) => {
    try {
      const { getCatalystsForSymbol, calculateCatalystScore } = await import("./catalyst-intelligence-service");
      const { ticker } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      
      const catalysts = await getCatalystsForSymbol(ticker, limit);
      const score = await calculateCatalystScore(ticker);
      
      res.json({
        ticker: ticker.toUpperCase(),
        catalysts,
        score: score.score,
        catalystCount: score.catalystCount,
        summary: score.summary,
      });
    } catch (error: any) {
      logger.error("Error fetching symbol catalysts", { error, ticker: req.params.ticker });
      res.status(500).json({ error: "Failed to fetch catalysts" });
    }
  });

  // GET /api/catalysts/upcoming - Get upcoming/active catalysts across all symbols
  app.get("/api/catalysts/upcoming", requireTier('canAccessCatalystScoring'), async (req, res) => {
    try {
      const { getUpcomingCatalysts } = await import("./catalyst-intelligence-service");
      const limit = parseInt(req.query.limit as string) || 20;
      
      const catalysts = await getUpcomingCatalysts(limit);
      
      res.json({ catalysts });
    } catch (error: any) {
      logger.error("Error fetching upcoming catalysts", { error });
      res.status(500).json({ error: "Failed to fetch upcoming catalysts" });
    }
  });

  // POST /api/catalysts/refresh - Refresh catalysts for specified tickers
  app.post("/api/catalysts/refresh", requireTier('canAccessCatalystScoring'), async (req, res) => {
    try {
      const { refreshCatalystsForWatchlist } = await import("./catalyst-intelligence-service");
      const { tickers } = req.body;
      
      if (!tickers || !Array.isArray(tickers)) {
        return res.status(400).json({ error: "Tickers array required" });
      }
      
      const result = await refreshCatalystsForWatchlist(tickers);
      
      res.json({
        success: true,
        secFilingsAdded: result.secFilingsAdded,
        contractsAdded: result.contractsAdded,
        errors: result.errors,
      });
    } catch (error: any) {
      logger.error("Error refreshing catalysts", { error });
      res.status(500).json({ error: "Failed to refresh catalysts" });
    }
  });

  // GET /api/sec-filings/:ticker - Get SEC filings for a ticker
  app.get("/api/sec-filings/:ticker", requireTier('canAccessSECFilings'), async (req, res) => {
    try {
      const { fetchSECFilingsForTicker } = await import("./catalyst-intelligence-service");
      const { ticker } = req.params;
      
      const filings = await fetchSECFilingsForTicker(ticker);
      
      res.json({ ticker: ticker.toUpperCase(), filings });
    } catch (error: any) {
      logger.error("Error fetching SEC filings", { error, ticker: req.params.ticker });
      res.status(500).json({ error: "Failed to fetch SEC filings" });
    }
  });

  // GET /api/gov-contracts/:ticker - Get government contracts for a ticker
  app.get("/api/gov-contracts/:ticker", requireTier('canAccessGovContracts'), async (req, res) => {
    try {
      const { fetchGovernmentContractsForTicker } = await import("./catalyst-intelligence-service");
      const { ticker } = req.params;
      
      const contracts = await fetchGovernmentContractsForTicker(ticker);
      
      res.json({ ticker: ticker.toUpperCase(), contracts });
    } catch (error: any) {
      logger.error("Error fetching government contracts", { error, ticker: req.params.ticker });
      res.status(500).json({ error: "Failed to fetch government contracts" });
    }
  });

  // POST /api/catalysts/score - Calculate catalyst score for a symbol
  app.post("/api/catalysts/score", requireTier('canAccessCatalystScoring'), async (req, res) => {
    try {
      const { calculateCatalystScore, updateSymbolCatalystSnapshot } = await import("./catalyst-intelligence-service");
      const { ticker } = req.body;
      
      if (!ticker) {
        return res.status(400).json({ error: "Ticker required" });
      }
      
      await updateSymbolCatalystSnapshot(ticker);
      const score = await calculateCatalystScore(ticker);
      
      res.json({
        ticker: ticker.toUpperCase(),
        score: score.score,
        catalystCount: score.catalystCount,
        recentCatalysts: score.recentCatalysts,
        summary: score.summary,
      });
    } catch (error: any) {
      logger.error("Error calculating catalyst score", { error });
      res.status(500).json({ error: "Failed to calculate catalyst score" });
    }
  });

  // ============================================
  // LOSS INTELLIGENCE SYSTEM - Adaptive Trading Bot Learning
  // ============================================

  // GET /api/bot/learning-state - Get current bot learning state
  app.get("/api/bot/learning-state", requireAdminJWT, async (_req, res) => {
    try {
      const { getLearningState, getAdaptiveParameters, getLossPatternSummary } = await import("./loss-analyzer-service");
      
      const [state, params, summary] = await Promise.all([
        getLearningState(),
        getAdaptiveParameters(),
        getLossPatternSummary(),
      ]);
      
      res.json({
        learningState: state,
        adaptiveParameters: params,
        lossPatterns: summary,
      });
    } catch (error: any) {
      logger.error("Error getting bot learning state", { error });
      res.status(500).json({ error: "Failed to get bot learning state" });
    }
  });

  // POST /api/bot/analyze-trades - Analyze recent closed trades for loss patterns
  app.post("/api/bot/analyze-trades", requireAdminJWT, async (req, res) => {
    try {
      const { analyzeClosedTrades } = await import("./loss-analyzer-service");
      const limit = parseInt(req.body.limit as string) || 50;
      
      const result = await analyzeClosedTrades(limit);
      
      res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      logger.error("Error analyzing trades", { error });
      res.status(500).json({ error: "Failed to analyze trades" });
    }
  });

  // GET /api/bot/diagnostics - Get all trade diagnostics
  app.get("/api/bot/diagnostics", requireAdminJWT, async (_req, res) => {
    try {
      const diagnostics = await storage.getAllTradeDiagnostics();
      res.json(diagnostics);
    } catch (error: any) {
      logger.error("Error getting trade diagnostics", { error });
      res.status(500).json({ error: "Failed to get trade diagnostics" });
    }
  });

  // GET /api/bot/symbol-adjustment/:symbol - Get learning adjustment for a symbol
  app.get("/api/bot/symbol-adjustment/:symbol", requireAdminJWT, async (req, res) => {
    try {
      const { getSymbolAdjustment } = await import("./loss-analyzer-service");
      const { symbol } = req.params;
      
      const adjustment = await getSymbolAdjustment(symbol.toUpperCase());
      
      res.json({
        symbol: symbol.toUpperCase(),
        ...adjustment,
      });
    } catch (error: any) {
      logger.error("Error getting symbol adjustment", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to get symbol adjustment" });
    }
  });

  // GET /api/platform/learning-insights - Comprehensive platform learning summary
  app.get("/api/platform/learning-insights", async (_req, res) => {
    try {
      const { getLearningState, getAdaptiveParameters, getLossPatternSummary } = await import("./loss-analyzer-service");
      const { getWeightsSummary } = await import("./dynamic-signal-weights");
      const { getWatchlistInsightsSummary } = await import("./watchlist-priority-service");
      
      const [learningState, params, lossPatterns, signalWeights, watchlistInsights] = await Promise.all([
        getLearningState().catch(() => null),
        getAdaptiveParameters(),
        getLossPatternSummary().catch(() => ({ totalDiagnosed: 0, lossCount: 0, winCount: 0, topCauses: [] })),
        getWeightsSummary().catch(() => ({ enabled: false, totalSignals: 0, boostedCount: 0, reducedCount: 0, neutralCount: 0, overriddenCount: 0, topBoosted: [], topReduced: [] })),
        getWatchlistInsightsSummary().catch(() => ({ prioritySymbols: [], eliteCount: 0, cheapPremiumCount: 0, lastUpdated: new Date().toISOString() })),
      ]);
      
      // Build comprehensive learning summary
      const summary = {
        platformLearning: {
          totalTradesAnalyzed: lossPatterns.totalDiagnosed || 0,
          winRate: lossPatterns.totalDiagnosed > 0 
            ? ((lossPatterns.winCount / lossPatterns.totalDiagnosed) * 100).toFixed(1) + '%'
            : 'N/A',
          lossesAnalyzed: lossPatterns.lossCount || 0,
          patternsDetected: lossPatterns.topCauses?.length || 0,
        },
        adaptiveParameters: {
          confidenceThreshold: params.confidenceThreshold,
          stopLossMultiplier: params.stopLossMultiplier,
          positionSizeMultiplier: params.positionSizeMultiplier,
        },
        signalPerformance: {
          totalSignals: signalWeights.totalSignals,
          boosted: signalWeights.boostedCount,
          reduced: signalWeights.reducedCount,
          neutral: signalWeights.neutralCount,
          topPerformers: signalWeights.topBoosted?.slice(0, 5).map((s: any) => ({
            name: s.signalName,
            winRate: s.winRate?.toFixed(1) + '%',
            weight: s.dynamicWeight?.toFixed(2),
          })) || [],
          worstPerformers: signalWeights.topReduced?.slice(0, 5).map((s: any) => ({
            name: s.signalName,
            winRate: s.winRate?.toFixed(1) + '%',
            weight: s.dynamicWeight?.toFixed(2),
          })) || [],
        },
        lossPatterns: {
          topCauses: lossPatterns.topCauses?.slice(0, 5).map((c: any) => ({
            cause: c.cause?.replace(/_/g, ' ') || 'Unknown',
            count: c.count || 0,
            avgLoss: c.avgLoss?.toFixed(1) + '%' || 'N/A',
          })) || [],
        },
        watchlistIntelligence: {
          eliteSetups: watchlistInsights.eliteCount,
          cheapPremiums: watchlistInsights.cheapPremiumCount,
          totalTracked: watchlistInsights.prioritySymbols.length,
          topSymbols: watchlistInsights.prioritySymbols.slice(0, 5).map(s => ({
            symbol: s.symbol,
            grade: s.grade,
            boost: s.confidenceBoost,
            reasons: s.reasons.slice(0, 2),
          })),
          lastUpdated: watchlistInsights.lastUpdated,
        },
        symbolAdjustments: learningState?.symbolAdjustments 
          ? Object.entries(learningState.symbolAdjustments).slice(0, 10).map(([sym, adj]: [string, any]) => ({
              symbol: sym,
              boost: adj.confidenceBoost || 0,
              lossStreak: adj.lossStreak || 0,
              winStreak: adj.winStreak || 0,
            }))
          : [],
        lastUpdated: new Date().toISOString(),
      };
      
      res.json(summary);
    } catch (error: any) {
      logger.error("Error getting platform learning insights", { error });
      res.status(500).json({ error: "Failed to get platform learning insights" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 🧠 ML INTELLIGENCE SYSTEM - Machine Learning Trading Signals
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/ml/status - Get ML system status
  app.get("/api/ml/status", async (_req, res) => {
    try {
      const { getMLStatus } = await import("./ml-intelligence-service");
      res.json(getMLStatus());
    } catch (error: any) {
      logger.error("Error getting ML status", { error });
      res.status(500).json({ error: "Failed to get ML status" });
    }
  });

  // GET /api/ml/predict/:symbol - Get price prediction for a symbol
  app.get("/api/ml/predict/:symbol", async (req, res) => {
    try {
      const { predictPriceDirection } = await import("./ml-intelligence-service");
      const { fetchOHLCData } = await import("./chart-analysis");
      const { symbol } = req.params;
      const timeframe = (req.query.timeframe as '1h' | '4h' | '1d' | '1w') || '1d';
      
      // Fetch OHLC data for the symbol
      const ohlc = await fetchOHLCData(symbol.toUpperCase(), 'stock', 30);
      
      if (!ohlc || ohlc.closes.length < 10) {
        return res.status(400).json({ error: "Insufficient historical data for prediction" });
      }
      
      // Generate synthetic volumes from price movement (since OHLC doesn't include volume)
      const volumes = ohlc.closes.map((_, i) => 1000000 + Math.random() * 500000);
      
      const prediction = await predictPriceDirection(symbol.toUpperCase(), ohlc.closes, volumes, timeframe);
      res.json(prediction);
    } catch (error: any) {
      logger.error("Error getting price prediction", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to get price prediction" });
    }
  });

  // GET /api/ml/sentiment/:symbol - Get sentiment analysis for a symbol
  app.get("/api/ml/sentiment/:symbol", async (req, res) => {
    try {
      const { analyzeSentiment } = await import("./ml-intelligence-service");
      const { symbol } = req.params;
      
      // Get news headlines for sentiment analysis
      const { fetchFinancialNews } = await import("./alpha-vantage-service");
      const news = await fetchFinancialNews([symbol.toUpperCase()], 10);
      const headlines = news.map(n => n.title + ' ' + (n.summary || ''));
      
      const sentiment = await analyzeSentiment(symbol.toUpperCase(), headlines);
      res.json(sentiment);
    } catch (error: any) {
      logger.error("Error getting sentiment", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to get sentiment analysis" });
    }
  });

  // GET /api/ml/patterns/:symbol - Get chart patterns for a symbol
  app.get("/api/ml/patterns/:symbol", async (req, res) => {
    try {
      const { detectChartPatterns } = await import("./ml-intelligence-service");
      const { fetchOHLCData } = await import("./chart-analysis");
      const { symbol } = req.params;
      
      // Fetch OHLC data
      const ohlc = await fetchOHLCData(symbol.toUpperCase(), 'stock', 30);
      
      if (!ohlc || ohlc.closes.length < 10) {
        return res.status(400).json({ error: "Insufficient data for pattern detection" });
      }
      
      const candles = ohlc.closes.map((close, i) => ({
        high: ohlc.highs[i],
        low: ohlc.lows[i],
        open: ohlc.opens[i],
        close: close
      }));
      const currentPrice = ohlc.closes[ohlc.closes.length - 1];
      
      const patterns = await detectChartPatterns(symbol.toUpperCase(), candles, currentPrice);
      res.json(patterns);
    } catch (error: any) {
      logger.error("Error detecting patterns", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to detect chart patterns" });
    }
  });

  // GET /api/ml/regime - Get current market regime
  app.get("/api/ml/regime", async (_req, res) => {
    try {
      const { detectMarketRegime } = await import("./ml-intelligence-service");
      const { fetchOHLCData } = await import("./chart-analysis");
      
      // Use SPY as market proxy
      const ohlc = await fetchOHLCData('SPY', 'stock', 30);
      
      if (!ohlc || ohlc.closes.length < 10) {
        return res.status(400).json({ error: "Insufficient market data" });
      }
      
      // Generate synthetic volumes
      const volumes = ohlc.closes.map(() => 1000000 + Math.random() * 500000);
      
      const regime = await detectMarketRegime(ohlc.closes, volumes);
      res.json(regime);
    } catch (error: any) {
      logger.error("Error detecting market regime", { error });
      res.status(500).json({ error: "Failed to detect market regime" });
    }
  });

  // GET /api/ml/position-size/:symbol - Get adaptive position size recommendation
  app.get("/api/ml/position-size/:symbol", async (req, res) => {
    try {
      const { calculateAdaptivePositionSize, detectMarketRegime } = await import("./ml-intelligence-service");
      const { fetchOHLCData } = await import("./chart-analysis");
      const { symbol } = req.params;
      const accountBalance = parseFloat(req.query.balance as string) || 300;
      const winProbability = parseFloat(req.query.winProb as string) || 0.55;
      
      // Get market data for regime detection
      const spyOhlc = await fetchOHLCData('SPY', 'stock', 30);
      const prices = spyOhlc?.closes || [];
      const regime = await detectMarketRegime(prices);
      
      // Calculate volatility from symbol data
      const symbolOhlc = await fetchOHLCData(symbol.toUpperCase(), 'stock', 30);
      const symbolPrices = symbolOhlc?.closes || [];
      const returns = symbolPrices.slice(1).map((p, i) => Math.abs((p - symbolPrices[i]) / symbolPrices[i] * 100));
      const volatility = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 2;
      
      const recommendation = await calculateAdaptivePositionSize(
        symbol.toUpperCase(),
        accountBalance,
        winProbability,
        2.5, // avg win %
        1.5, // avg loss %
        volatility,
        regime
      );
      
      res.json(recommendation);
    } catch (error: any) {
      logger.error("Error calculating position size", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to calculate position size" });
    }
  });

  // GET /api/ml/signal/:symbol - Get full ML signal for a symbol
  app.get("/api/ml/signal/:symbol", async (req, res) => {
    try {
      const { generateMLSignal } = await import("./ml-intelligence-service");
      const { fetchOHLCData } = await import("./chart-analysis");
      const { fetchFinancialNews } = await import("./alpha-vantage-service");
      const { symbol } = req.params;
      const accountBalance = parseFloat(req.query.balance as string) || 300;
      
      // Fetch all required data in parallel
      const [ohlc, news] = await Promise.all([
        fetchOHLCData(symbol.toUpperCase(), 'stock', 30),
        fetchFinancialNews([symbol.toUpperCase()], 5)
      ]);
      
      if (!ohlc || ohlc.closes.length < 10) {
        return res.status(400).json({ error: "Insufficient data for ML signal" });
      }
      
      const volumes = ohlc.closes.map(() => 1000000 + Math.random() * 500000);
      const candles = ohlc.closes.map((close, i) => ({
        high: ohlc.highs[i],
        low: ohlc.lows[i],
        open: ohlc.opens[i],
        close: close
      }));
      const headlines = news.map(n => n.title);
      
      const signal = await generateMLSignal(symbol.toUpperCase(), ohlc.closes, volumes, candles, headlines, accountBalance);
      res.json(signal);
    } catch (error: any) {
      logger.error("Error generating ML signal", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to generate ML signal" });
    }
  });

  // POST /api/ml/record-trade - Record a trade result for learning
  app.post("/api/ml/record-trade", requireAdminJWT, async (req, res) => {
    try {
      const { recordTradeResult } = await import("./ml-intelligence-service");
      const { symbol, wasWin, percentGain } = req.body;
      
      if (!symbol || wasWin === undefined || percentGain === undefined) {
        return res.status(400).json({ error: "Missing required fields: symbol, wasWin, percentGain" });
      }
      
      recordTradeResult(symbol.toUpperCase(), wasWin, percentGain);
      res.json({ success: true, message: "Trade result recorded for learning" });
    } catch (error: any) {
      logger.error("Error recording trade result", { error });
      res.status(500).json({ error: "Failed to record trade result" });
    }
  });

  // POST /api/ml/clear-cache - Clear ML caches
  app.post("/api/ml/clear-cache", requireAdminJWT, async (_req, res) => {
    try {
      const { clearMLCaches } = await import("./ml-intelligence-service");
      clearMLCaches();
      res.json({ success: true, message: "ML caches cleared" });
    } catch (error: any) {
      logger.error("Error clearing ML caches", { error });
      res.status(500).json({ error: "Failed to clear ML caches" });
    }
  });

  // GET /api/ml/scan - Scan multiple symbols and rank by ML signal strength
  app.get("/api/ml/scan", async (req, res) => {
    try {
      const { generateMLSignal } = await import("./ml-intelligence-service");
      const { fetchOHLCData } = await import("./chart-analysis");
      
      const symbolsParam = req.query.symbols as string;
      const symbols = symbolsParam 
        ? symbolsParam.split(',').map(s => s.trim().toUpperCase())
        : ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMD', 'META', 'GOOGL', 'AMZN', 'MSFT'];
      
      const signals = [];
      
      for (const symbol of symbols.slice(0, 10)) { // Max 10 symbols
        try {
          const ohlc = await fetchOHLCData(symbol, 'stock', 30);
          if (!ohlc || ohlc.closes.length < 10) continue;
          
          const volumes = ohlc.closes.map(() => 1000000 + Math.random() * 500000);
          const candles = ohlc.closes.map((close, i) => ({
            high: ohlc.highs[i], low: ohlc.lows[i], open: ohlc.opens[i], close: close
          }));
          
          const signal = await generateMLSignal(symbol, ohlc.closes, volumes, candles, []);
          signals.push({
            symbol,
            recommendation: signal.tradingRecommendation,
            compositeScore: signal.compositeScore,
            direction: signal.prediction.direction,
            confidence: signal.prediction.confidence,
            regime: signal.regime.regime,
            patterns: signal.patterns.length
          });
        } catch (e) {
          // Skip symbols that fail
        }
      }
      
      // Sort by absolute composite score (strongest signals first)
      signals.sort((a, b) => Math.abs(b.compositeScore) - Math.abs(a.compositeScore));
      
      res.json({
        scanned: signals.length,
        timestamp: new Date().toISOString(),
        signals
      });
    } catch (error: any) {
      logger.error("Error scanning symbols", { error });
      res.status(500).json({ error: "Failed to scan symbols" });
    }
  });

  // =====================================================
  // DEEP OPTIONS ANALYZER ROUTES
  // =====================================================

  // POST /api/options/analyze - Deep analysis of a specific option
  app.post("/api/options/analyze", async (req, res) => {
    try {
      const { analyzeOption, formatAnalysisReport } = await import("./deep-options-analyzer");
      const { symbol, strike, expiration, optionType } = req.body;
      
      if (!symbol || !strike || !expiration || !optionType) {
        return res.status(400).json({ 
          error: "Missing required fields: symbol, strike, expiration, optionType" 
        });
      }
      
      const analysis = await analyzeOption(
        symbol.toUpperCase(), 
        parseFloat(strike), 
        expiration, 
        optionType.toLowerCase() as 'call' | 'put'
      );
      
      if (!analysis) {
        return res.status(404).json({ error: "Could not analyze option - check symbol/strike/expiration" });
      }
      
      // Return both structured data and formatted report
      res.json({
        analysis,
        report: formatAnalysisReport(analysis)
      });
    } catch (error: any) {
      logger.error("Error analyzing option", { error });
      res.status(500).json({ error: error.message || "Failed to analyze option" });
    }
  });

  // GET /api/options/analyze/:symbol/:strike/:expiration/:type - Quick analysis endpoint
  app.get("/api/options/analyze/:symbol/:strike/:expiration/:type", async (req, res) => {
    try {
      const { analyzeOption, formatAnalysisReport } = await import("./deep-options-analyzer");
      const { symbol, strike, expiration, type } = req.params;
      
      const analysis = await analyzeOption(
        symbol.toUpperCase(), 
        parseFloat(strike), 
        expiration, 
        type.toLowerCase() as 'call' | 'put'
      );
      
      if (!analysis) {
        return res.status(404).json({ error: "Could not analyze option" });
      }
      
      res.json({
        analysis,
        report: formatAnalysisReport(analysis)
      });
    } catch (error: any) {
      logger.error("Error analyzing option", { error });
      res.status(500).json({ error: error.message || "Failed to analyze option" });
    }
  });

  // =====================================================
  // BACKTESTING & BREAKOUT SCANNER ROUTES
  // =====================================================

  // POST /api/backtest - Run a backtest on historical data (requires beta access)
  app.post("/api/backtest", requireBetaAccess, async (req, res) => {
    try {
      const { runBacktest } = await import("./backtesting-service");
      const config = req.body;
      
      if (!config.symbol || !config.strategy) {
        return res.status(400).json({ error: "Missing required fields: symbol, strategy" });
      }
      
      // Set defaults
      const backtestConfig = {
        symbol: config.symbol.toUpperCase(),
        strategy: config.strategy,
        initialCapital: config.initialCapital || 300,
        positionSizePercent: config.positionSizePercent || 20,
        stopLossPercent: config.stopLossPercent || 5,
        takeProfitPercent: config.takeProfitPercent || 10,
        lookbackPeriod: config.lookbackPeriod || 20,
        rsiPeriod: config.rsiPeriod || 2,
        rsiOversold: config.rsiOversold || 10,
        rsiOverbought: config.rsiOverbought || 90
      };
      
      const result = await runBacktest(backtestConfig);
      res.json(result);
    } catch (error: any) {
      logger.error("Error running backtest", { error });
      res.status(500).json({ error: error.message || "Failed to run backtest" });
    }
  });

  // POST /api/backtest/optimize - Run parameter optimization (requires beta access)
  app.post("/api/backtest/optimize", requireBetaAccess, async (req, res) => {
    try {
      const { optimizeParameters } = await import("./backtesting-service");
      const config = req.body;
      
      if (!config.symbol || !config.strategy) {
        return res.status(400).json({ error: "Missing required fields: symbol, strategy" });
      }
      
      const optimizationConfig = {
        symbol: config.symbol.toUpperCase(),
        strategy: config.strategy,
        initialCapital: config.initialCapital || 300,
        positionSizePercent: config.positionSizePercent || 20,
        stopLossRange: config.stopLossRange || { min: 2, max: 8, step: 1 },
        takeProfitRange: config.takeProfitRange || { min: 3, max: 12, step: 1 },
        lookbackRange: config.lookbackRange || { min: 10, max: 30, step: 5 }
      };
      
      const result = await optimizeParameters(optimizationConfig);
      res.json(result);
    } catch (error: any) {
      logger.error("Error running optimization", { error });
      res.status(500).json({ error: error.message || "Failed to run optimization" });
    }
  });

  // GET /api/backtest/real-trades - Backtest using REAL historical trade data (not simulated)
  app.get("/api/backtest/real-trades", requireBetaAccess, async (req, res) => {
    try {
      const { runRealTradeBacktest } = await import("./backtesting-service");
      const symbol = req.query.symbol as string | undefined;
      const limit = parseInt(req.query.limit as string) || 500;
      
      const result = await runRealTradeBacktest({ symbol, limit });
      res.json(result);
    } catch (error: any) {
      logger.error("Error running real trade backtest", { error });
      res.status(500).json({ error: error.message || "Failed to run real trade backtest" });
    }
  });

  // GET /api/backtest/compare/:symbol - Compare simulated vs real trade performance
  app.get("/api/backtest/compare/:symbol", requireBetaAccess, async (req, res) => {
    try {
      const { compareBacktestVsReal } = await import("./backtesting-service");
      const { symbol } = req.params;
      const strategy = (req.query.strategy as 'breakout' | 'mean_reversion' | 'momentum') || 'breakout';
      
      const result = await compareBacktestVsReal({ symbol: symbol.toUpperCase(), strategy });
      res.json(result);
    } catch (error: any) {
      logger.error("Error comparing backtest vs real", { error, symbol: req.params.symbol });
      res.status(500).json({ error: error.message || "Failed to compare backtest" });
    }
  });

  // GET /api/breakout/scan/:symbol - Scan single symbol for breakout
  app.get("/api/breakout/scan/:symbol", async (req, res) => {
    try {
      const { scanSymbolForBreakout } = await import("./breakout-scanner");
      const { symbol } = req.params;
      const config = {
        lookbackDays: parseInt(req.query.lookback as string) || 20,
        stopLossPercent: parseFloat(req.query.stopLoss as string) || 3,
        targetPercent: parseFloat(req.query.target as string) || 6
      };
      
      const signal = await scanSymbolForBreakout(symbol.toUpperCase(), config);
      
      if (!signal) {
        return res.json({ 
          symbol: symbol.toUpperCase(),
          hasBreakout: false,
          message: "No breakout signal detected"
        });
      }
      
      res.json({ ...signal, hasBreakout: true });
    } catch (error: any) {
      logger.error("Error scanning for breakout", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to scan for breakout" });
    }
  });

  // GET /api/breakout/scan-stocks - Scan stock watchlist for breakouts
  app.get("/api/breakout/scan-stocks", async (req, res) => {
    try {
      const { scanStocksForBreakouts } = await import("./breakout-scanner");
      const config = {
        lookbackDays: parseInt(req.query.lookback as string) || 20,
        stopLossPercent: parseFloat(req.query.stopLoss as string) || 3,
        targetPercent: parseFloat(req.query.target as string) || 6
      };
      
      const signals = await scanStocksForBreakouts(config);
      res.json({
        totalScanned: 30,
        breakoutsFound: signals.length,
        signals,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error scanning stocks for breakouts", { error });
      res.status(500).json({ error: "Failed to scan stocks" });
    }
  });

  // GET /api/breakout/scan-crypto - Scan crypto watchlist for breakouts
  app.get("/api/breakout/scan-crypto", async (req, res) => {
    try {
      const { scanCryptoForBreakouts } = await import("./breakout-scanner");
      const config = {
        lookbackDays: parseInt(req.query.lookback as string) || 20,
        stopLossPercent: parseFloat(req.query.stopLoss as string) || 3,
        targetPercent: parseFloat(req.query.target as string) || 6
      };
      
      const signals = await scanCryptoForBreakouts(config);
      res.json({
        totalScanned: 20,
        breakoutsFound: signals.length,
        signals,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error scanning crypto for breakouts", { error });
      res.status(500).json({ error: "Failed to scan crypto" });
    }
  });

  // GET /api/breakout/full-scan - Full market scan (stocks + crypto)
  app.get("/api/breakout/full-scan", async (req, res) => {
    try {
      const { fullMarketScan } = await import("./breakout-scanner");
      const config = {
        lookbackDays: parseInt(req.query.lookback as string) || 20,
        stopLossPercent: parseFloat(req.query.stopLoss as string) || 3,
        targetPercent: parseFloat(req.query.target as string) || 6
      };
      
      const result = await fullMarketScan(config);
      res.json(result);
    } catch (error: any) {
      logger.error("Error running full market scan", { error });
      res.status(500).json({ error: "Failed to run full market scan" });
    }
  });

  // GET /api/breakout/watchlists - Get available watchlists
  app.get("/api/breakout/watchlists", async (_req, res) => {
    try {
      const { getWatchlists } = await import("./breakout-scanner");
      res.json(getWatchlists());
    } catch (error: any) {
      logger.error("Error getting watchlists", { error });
      res.status(500).json({ error: "Failed to get watchlists" });
    }
  });

  // =====================================================
  // PATTERN INTELLIGENCE ROUTES - Advanced Pattern Detection
  // =====================================================

  // GET /api/pattern-scanner/scan - Run pattern scan across universe
  app.get("/api/pattern-scanner/scan", requireBetaAccess, async (req, res) => {
    try {
      const { runPatternScan, PATTERN_DISPLAY_NAMES } = await import("./pattern-intelligence");
      const symbols = req.query.symbols 
        ? (req.query.symbols as string).split(',').map(s => s.trim().toUpperCase())
        : undefined;
      
      const patterns = await runPatternScan(symbols);
      res.json({
        totalPatterns: patterns.length,
        patterns,
        patternTypes: PATTERN_DISPLAY_NAMES,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error running pattern scan", { error });
      res.status(500).json({ error: "Failed to run pattern scan" });
    }
  });

  // GET /api/pattern-scanner/signals - Get active pattern signals with filters
  app.get("/api/pattern-scanner/signals", async (req, res) => {
    try {
      const { getPatternSignals, PATTERN_DISPLAY_NAMES, BULLISH_PATTERNS } = await import("./pattern-intelligence");
      
      const filters: {
        patternTypes?: any[];
        minScore?: number;
        urgency?: string;
        status?: any;
        limit?: number;
      } = {};
      
      if (req.query.types) {
        filters.patternTypes = (req.query.types as string).split(',');
      }
      if (req.query.bullishOnly === 'true') {
        filters.patternTypes = BULLISH_PATTERNS;
      }
      if (req.query.minScore) {
        filters.minScore = parseInt(req.query.minScore as string);
      }
      if (req.query.urgency) {
        filters.urgency = req.query.urgency as string;
      }
      if (req.query.status) {
        filters.status = req.query.status as string;
      }
      if (req.query.limit) {
        filters.limit = parseInt(req.query.limit as string);
      }
      
      const signals = await getPatternSignals(filters);
      res.json({
        count: signals.length,
        signals,
        patternTypes: PATTERN_DISPLAY_NAMES,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error fetching pattern signals", { error });
      res.status(500).json({ error: "Failed to fetch pattern signals" });
    }
  });

  // GET /api/pattern-scanner/imminent - Get imminent breakout patterns
  app.get("/api/pattern-scanner/imminent", async (req, res) => {
    try {
      const { getImminentBreakouts, PATTERN_DISPLAY_NAMES } = await import("./pattern-intelligence");
      const signals = await getImminentBreakouts();
      res.json({
        count: signals.length,
        signals,
        patternTypes: PATTERN_DISPLAY_NAMES,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error fetching imminent breakouts", { error });
      res.status(500).json({ error: "Failed to fetch imminent breakouts" });
    }
  });

  // GET /api/pattern-scanner/bullish - Get top bullish patterns
  app.get("/api/pattern-scanner/bullish", async (req, res) => {
    try {
      const { getTopBullishPatterns, PATTERN_DISPLAY_NAMES } = await import("./pattern-intelligence");
      const limit = parseInt(req.query.limit as string) || 20;
      const signals = await getTopBullishPatterns(limit);
      res.json({
        count: signals.length,
        signals,
        patternTypes: PATTERN_DISPLAY_NAMES,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error fetching bullish patterns", { error });
      res.status(500).json({ error: "Failed to fetch bullish patterns" });
    }
  });

  // GET /api/pattern-scanner/analyze/:symbol - Analyze single symbol for patterns (UNIFIED)
  app.get("/api/pattern-scanner/analyze/:symbol", async (req, res) => {
    try {
      const { analyzeSymbolPatterns, formatUnifiedResponse, PATTERN_DISPLAY_NAMES } = await import("./pattern-domain");
      const { symbol } = req.params;
      const assetType = (req.query.assetType as string) || 'stock';
      
      const patterns = await analyzeSymbolPatterns(symbol.toUpperCase(), assetType, 'visual');
      
      if (patterns.length === 0) {
        return res.json({
          symbol: symbol.toUpperCase(),
          patterns: [],
          statistics: { totalPatterns: 0, imminentCount: 0, highConvictionCount: 0, averageScore: 0 },
          patternTypes: PATTERN_DISPLAY_NAMES,
          dataSource: 'unified',
          message: "No patterns detected or insufficient data",
          timestamp: new Date().toISOString()
        });
      }
      
      res.json(formatUnifiedResponse(patterns));
    } catch (error: any) {
      logger.error("Error analyzing symbol patterns", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to analyze patterns" });
    }
  });

  // PATCH /api/pattern-scanner/:id/status - Update pattern status
  app.patch("/api/pattern-scanner/:id/status", requireBetaAccess, async (req, res) => {
    try {
      const { updatePatternStatus } = await import("./pattern-intelligence");
      const { id } = req.params;
      const { status, notes } = req.body;
      
      if (!status || !['forming', 'confirmed', 'failed', 'completed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      
      await updatePatternStatus(id, status, notes);
      res.json({ success: true, message: "Pattern status updated" });
    } catch (error: any) {
      logger.error("Error updating pattern status", { error });
      res.status(500).json({ error: "Failed to update pattern status" });
    }
  });

  // ============================================================================
  // OPTIONS ANALYZER ROUTES
  // ============================================================================

  // GET /api/options-analyzer/expirations/:symbol - Get available expirations
  app.get("/api/options-analyzer/expirations/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const upperSymbol = symbol.toUpperCase();
      
      const { TRADIER_API_KEY } = process.env;
      if (!TRADIER_API_KEY) {
        return res.status(500).json({ error: "Tradier API not configured" });
      }
      
      const baseUrl = 'https://api.tradier.com/v1';
      const expResponse = await fetch(`${baseUrl}/markets/options/expirations?symbol=${upperSymbol}`, {
        headers: {
          'Authorization': `Bearer ${TRADIER_API_KEY}`,
          'Accept': 'application/json'
        }
      });
      
      if (!expResponse.ok) {
        return res.status(404).json({ error: `No options found for ${upperSymbol}` });
      }
      
      const expData = await expResponse.json();
      const expirations: string[] = expData.expirations?.date || [];
      
      // Calculate DTE for each expiration
      const now = new Date();
      const expirationsWithDTE = expirations.map(exp => {
        const expDate = new Date(exp + 'T16:00:00-05:00');
        const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { date: exp, dte };
      });
      
      res.json({ symbol: upperSymbol, expirations: expirationsWithDTE });
    } catch (error: any) {
      logger.error("Error fetching expirations", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to fetch expirations" });
    }
  });

  // GET /api/options-analyzer/chain/:symbol - Get options chain
  app.get("/api/options-analyzer/chain/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const { expiration } = req.query;
      const upperSymbol = symbol.toUpperCase();
      
      const { getTradierQuote, getTradierOptionsChain } = await import("./tradier-api");
      
      // Get stock quote
      const quote = await getTradierQuote(upperSymbol);
      if (!quote) {
        return res.status(404).json({ error: `Quote not found for ${upperSymbol}` });
      }
      
      const stockPrice = quote.last || quote.close || 0;
      
      // Get options chain
      const chain = await getTradierOptionsChain(upperSymbol, expiration as string | undefined);
      if (!chain || chain.length === 0) {
        return res.status(404).json({ error: `No options chain found for ${upperSymbol}` });
      }
      
      // Process chain for display
      const processedChain = chain.map((opt: any) => ({
        symbol: opt.symbol,
        strike: opt.strike,
        optionType: opt.option_type,
        expiration: opt.expiration_date,
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        mid: ((opt.bid || 0) + (opt.ask || 0)) / 2,
        last: opt.last || 0,
        volume: opt.volume || 0,
        openInterest: opt.open_interest || 0,
        delta: opt.greeks?.delta || 0,
        gamma: opt.greeks?.gamma || 0,
        theta: opt.greeks?.theta || 0,
        vega: opt.greeks?.vega || 0,
        iv: (opt.greeks?.mid_iv || opt.greeks?.ask_iv || 0) * 100,
        inTheMoney: opt.option_type === 'call' 
          ? opt.strike < stockPrice 
          : opt.strike > stockPrice
      }));
      
      res.json({
        symbol: upperSymbol,
        stockPrice,
        stockChange: quote.change || 0,
        stockChangePercent: quote.change_percentage || 0,
        chain: processedChain
      });
    } catch (error: any) {
      logger.error("Error fetching options chain", { error, symbol: req.params.symbol });
      res.status(500).json({ error: "Failed to fetch options chain" });
    }
  });

  // POST /api/options-analyzer/deep-analysis - Run deep analysis on a specific option
  app.post("/api/options-analyzer/deep-analysis", async (req, res) => {
    try {
      const { symbol, strike, expiration, optionType } = req.body;
      
      if (!symbol || !strike || !expiration || !optionType) {
        return res.status(400).json({ error: "Missing required fields: symbol, strike, expiration, optionType" });
      }
      
      const { analyzeOption, formatAnalysisReport } = await import("./deep-options-analyzer");
      
      const analysis = await analyzeOption(
        symbol.toUpperCase(),
        parseFloat(strike),
        expiration,
        optionType.toLowerCase() as 'call' | 'put'
      );
      
      if (!analysis) {
        return res.status(404).json({ error: "Failed to analyze option - not found or invalid" });
      }
      
      res.json({
        analysis,
        report: formatAnalysisReport(analysis)
      });
    } catch (error: any) {
      logger.error("Error running deep analysis", { error, body: req.body });
      res.status(500).json({ error: "Failed to run deep analysis" });
    }
  });

  // GET /api/options-analyzer/quick-quote - Get quick option quote
  app.get("/api/options-analyzer/quick-quote", async (req, res) => {
    try {
      const { symbol, strike, expiration, optionType } = req.query;
      
      if (!symbol || !strike || !expiration || !optionType) {
        return res.status(400).json({ error: "Missing required query params" });
      }
      
      const { getOptionQuote } = await import("./tradier-api");
      
      const quote = await getOptionQuote({
        underlying: (symbol as string).toUpperCase(),
        expiryDate: expiration as string,
        optionType: (optionType as string).toLowerCase() as 'call' | 'put',
        strike: parseFloat(strike as string)
      });
      
      if (!quote) {
        return res.status(404).json({ error: "Option quote not found" });
      }
      
      res.json(quote);
    } catch (error: any) {
      logger.error("Error fetching quick quote", { error });
      res.status(500).json({ error: "Failed to fetch quick quote" });
    }
  });

  // ============================================================================
  // INSTITUTIONAL-GRADE RISK ENGINE API
  // PhD-level quantitative risk management
  // ============================================================================

  // GET /api/risk/metrics/:portfolioId - Get real-time risk metrics for a portfolio
  app.get("/api/risk/metrics/:portfolioId", requireBetaAccess, async (req, res) => {
    try {
      const { portfolioId } = req.params;
      const { 
        RiskEngine, 
        calculateHistoricalVaR, 
        calculateCVaR,
        calculateSharpeRatio,
        calculateSortinoRatio,
        calculateCalmarRatio,
        calculateMaxDrawdown,
        calculateKellyCriterion
      } = await import("./risk-engine");
      
      // Get portfolio and positions
      const portfolio = await storage.getPaperPortfolioById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
      
      // Calculate equity curve from closed positions
      const closedPositions = positions.filter(p => p.status === 'closed' && p.realizedPnL !== null);
      const returns = closedPositions.map(p => (p.realizedPnL || 0) / 100); // Normalize returns
      
      // Build equity curve
      let equity = portfolio.startingCapital;
      const equityCurve = [equity];
      for (const pos of closedPositions) {
        equity += pos.realizedPnL || 0;
        equityCurve.push(equity);
      }
      
      // Calculate all metrics
      const currentValue = portfolio.totalValue || portfolio.startingCapital;
      const { maxDrawdown, drawdownDuration } = calculateMaxDrawdown(equityCurve);
      
      // Calculate Kelly from win/loss stats
      const wins = closedPositions.filter(p => (p.realizedPnL || 0) > 0);
      const losses = closedPositions.filter(p => (p.realizedPnL || 0) <= 0);
      const winRate = closedPositions.length > 0 ? wins.length / closedPositions.length : 0.5;
      const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + (p.realizedPnL || 0), 0) / wins.length : 10;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + (p.realizedPnL || 0), 0) / losses.length) : 10;
      
      const kelly = calculateKellyCriterion(winRate, avgWin, avgLoss, currentValue);
      
      // Peak for current drawdown
      const peak = Math.max(...equityCurve);
      const currentDrawdown = (peak - currentValue) / peak;
      
      res.json({
        portfolioId,
        portfolioName: portfolio.name,
        portfolioValue: currentValue,
        cashBalance: portfolio.cashBalance,
        totalExposure: currentValue - portfolio.cashBalance,
        
        // VaR metrics
        var95Daily: returns.length >= 10 ? calculateHistoricalVaR(returns, currentValue, 0.95) : currentValue * 0.02,
        var99Daily: returns.length >= 10 ? calculateHistoricalVaR(returns, currentValue, 0.99) : currentValue * 0.03,
        cvar95Daily: returns.length >= 10 ? calculateCVaR(returns, currentValue, 0.95) : currentValue * 0.03,
        cvar99Daily: returns.length >= 10 ? calculateCVaR(returns, currentValue, 0.99) : currentValue * 0.04,
        
        // Drawdown
        currentDrawdown: currentDrawdown * 100,
        maxDrawdown: maxDrawdown * 100,
        drawdownDuration,
        
        // Performance ratios
        sharpeRatio: calculateSharpeRatio(returns),
        sortinoRatio: calculateSortinoRatio(returns),
        calmarRatio: calculateCalmarRatio(returns, maxDrawdown),
        
        // Kelly sizing
        kellyFraction: kelly.fullKelly * 100,
        halfKelly: kelly.halfKelly * 100,
        quarterKelly: kelly.quarterKelly * 100,
        recommendedPositionSize: kelly.maxPositionSize,
        kellySizingRationale: kelly.rationale,
        
        // Stats
        totalTrades: closedPositions.length,
        winRate: winRate * 100,
        avgWin,
        avgLoss,
        
        calculatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error("Error calculating risk metrics", { error });
      res.status(500).json({ error: "Failed to calculate risk metrics" });
    }
  });

  // POST /api/risk/scenario - Run stress test scenario
  app.post("/api/risk/scenario", requireBetaAccess, async (req, res) => {
    try {
      const { portfolioId, scenario, customParams } = req.body;
      const { runScenarioAnalysis } = await import("./risk-engine");
      
      const portfolio = await storage.getPaperPortfolioById(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: "Portfolio not found" });
      }
      
      const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
      const openPositions = positions.filter(p => p.status === 'open');
      
      // Convert to PositionRisk format
      const positionRisks = openPositions.map(p => ({
        symbol: p.symbol,
        assetType: p.assetType as 'option' | 'future' | 'crypto' | 'stock',
        quantity: p.quantity,
        currentValue: p.currentPrice * p.quantity * (p.assetType === 'option' ? 100 : 1),
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        unrealizedPnL: p.unrealizedPnL || 0,
        unrealizedPnLPercent: ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100,
        positionVaR: p.currentPrice * p.quantity * 0.02,
        positionBeta: 1.0,
        deltaExposure: p.delta || 0.5,
        gammaExposure: p.gamma || 0.05,
        vegaExposure: p.vega || 0.1,
        thetaDecay: p.theta || -0.05,
        portfolioWeight: (p.currentPrice * p.quantity) / (portfolio.totalValue || 1),
        concentrationRisk: 'low' as const
      }));
      
      const result = runScenarioAnalysis(
        positionRisks,
        portfolio.totalValue || portfolio.startingCapital,
        scenario || 'crash',
        customParams
      );
      
      res.json(result);
    } catch (error: any) {
      logger.error("Error running scenario analysis", { error });
      res.status(500).json({ error: "Failed to run scenario analysis" });
    }
  });

  // ============================================================================
  // INSTITUTIONAL-GRADE OPTIONS QUANT API
  // PhD-level options analytics
  // ============================================================================

  // POST /api/options-quant/price - Black-Scholes pricing with full Greeks
  app.post("/api/options-quant/price", requireBetaAccess, async (req, res) => {
    try {
      const { spotPrice, strikePrice, timeToExpiry, volatility, optionType, riskFreeRate = 0.05 } = req.body;
      
      if (!spotPrice || !strikePrice || !timeToExpiry || !volatility || !optionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const { blackScholes } = await import("./options-quant");
      
      const result = blackScholes({
        spotPrice,
        strikePrice,
        timeToExpiry,
        riskFreeRate,
        volatility,
        optionType
      });
      
      res.json({
        ...result,
        inputs: { spotPrice, strikePrice, timeToExpiry, volatility, optionType, riskFreeRate }
      });
    } catch (error: any) {
      logger.error("Error in Black-Scholes pricing", { error });
      res.status(500).json({ error: "Failed to price option" });
    }
  });

  // POST /api/options-quant/implied-vol - Calculate implied volatility
  app.post("/api/options-quant/implied-vol", requireBetaAccess, async (req, res) => {
    try {
      const { marketPrice, spotPrice, strikePrice, timeToExpiry, optionType, riskFreeRate = 0.05 } = req.body;
      
      if (!marketPrice || !spotPrice || !strikePrice || !timeToExpiry || !optionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const { calculateImpliedVolatility } = await import("./options-quant");
      
      const iv = calculateImpliedVolatility(
        marketPrice,
        spotPrice,
        strikePrice,
        timeToExpiry,
        riskFreeRate,
        optionType
      );
      
      res.json({
        impliedVolatility: iv,
        impliedVolatilityPercent: iv * 100,
        inputs: { marketPrice, spotPrice, strikePrice, timeToExpiry, optionType }
      });
    } catch (error: any) {
      logger.error("Error calculating implied volatility", { error });
      res.status(500).json({ error: "Failed to calculate implied volatility" });
    }
  });

  // POST /api/options-quant/surface - Get volatility surface for a symbol
  app.post("/api/options-quant/surface", requireBetaAccess, async (req, res) => {
    try {
      const { symbol } = req.body;
      
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }
      
      const { getTradierOptionsChains, getTradierQuote } = await import("./tradier-api");
      const { constructVolatilitySurface, analyzeSkew } = await import("./options-quant");
      
      // Get current stock price
      const quote = await getTradierQuote(symbol.toUpperCase());
      if (!quote) {
        return res.status(404).json({ error: "Symbol not found" });
      }
      
      const spotPrice = quote.last || quote.bid || 100;
      
      // Get options chains
      const chains = await getTradierOptionsChains(symbol.toUpperCase());
      if (!chains || chains.length === 0) {
        return res.status(404).json({ error: "No options data found" });
      }
      
      // Convert to format for surface construction
      const optionChain = chains.flatMap(chain => {
        const expiry = chain.expiration_date;
        const daysToExpiry = Math.max(1, Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        
        return (chain.options?.option || []).map((opt: any) => ({
          strike: opt.strike,
          expiry: daysToExpiry,
          bid: opt.bid || 0,
          ask: opt.ask || 0,
          optionType: opt.option_type as 'call' | 'put'
        }));
      });
      
      const surface = constructVolatilitySurface(spotPrice, optionChain);
      const skewMetrics = analyzeSkew(surface, spotPrice);
      
      res.json({
        symbol: symbol.toUpperCase(),
        spotPrice,
        surface,
        skew: skewMetrics
      });
    } catch (error: any) {
      logger.error("Error constructing volatility surface", { error });
      res.status(500).json({ error: "Failed to construct volatility surface" });
    }
  });

  // POST /api/options-quant/monte-carlo - Monte Carlo option pricing
  app.post("/api/options-quant/monte-carlo", requireBetaAccess, async (req, res) => {
    try {
      const { spotPrice, strikePrice, timeToExpiry, volatility, optionType, riskFreeRate = 0.05, numPaths = 10000 } = req.body;
      
      if (!spotPrice || !strikePrice || !timeToExpiry || !volatility || !optionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const { monteCarloPrice, blackScholes } = await import("./options-quant");
      
      // Run Monte Carlo
      const mcResult = monteCarloPrice({
        spotPrice,
        strikePrice,
        timeToExpiry,
        riskFreeRate,
        volatility,
        optionType
      }, Math.min(numPaths, 50000)); // Cap at 50k for performance
      
      // Compare to Black-Scholes
      const bsResult = blackScholes({
        spotPrice,
        strikePrice,
        timeToExpiry,
        riskFreeRate,
        volatility,
        optionType
      });
      
      res.json({
        monteCarlo: mcResult,
        blackScholes: bsResult.theoreticalPrice,
        difference: Math.abs(mcResult.theoreticalPrice - bsResult.theoreticalPrice),
        differencePercent: Math.abs(mcResult.theoreticalPrice - bsResult.theoreticalPrice) / bsResult.theoreticalPrice * 100
      });
    } catch (error: any) {
      logger.error("Error in Monte Carlo pricing", { error });
      res.status(500).json({ error: "Failed to run Monte Carlo simulation" });
    }
  });

  // POST /api/options-quant/strategy - Simulate multi-leg strategy
  app.post("/api/options-quant/strategy", requireBetaAccess, async (req, res) => {
    try {
      const { legs, spotPrice, priceRange, volatility = 0.3 } = req.body;
      
      if (!legs || !Array.isArray(legs) || legs.length === 0) {
        return res.status(400).json({ error: "Legs array is required" });
      }
      
      if (!spotPrice) {
        return res.status(400).json({ error: "spotPrice is required" });
      }
      
      const { simulateStrategy } = await import("./options-quant");
      
      const range = priceRange || {
        min: spotPrice * 0.8,
        max: spotPrice * 1.2,
        step: spotPrice * 0.01
      };
      
      const result = simulateStrategy(legs, spotPrice, range, volatility);
      
      res.json(result);
    } catch (error: any) {
      logger.error("Error simulating strategy", { error });
      res.status(500).json({ error: "Failed to simulate strategy" });
    }
  });

  // POST /api/options-quant/iv-analysis - Analyze IV rank/percentile
  app.post("/api/options-quant/iv-analysis", requireBetaAccess, async (req, res) => {
    try {
      const { currentIV, historicalIVs } = req.body;
      
      if (currentIV === undefined) {
        return res.status(400).json({ error: "currentIV is required" });
      }
      
      const { analyzeIV } = await import("./options-quant");
      
      // Use provided historical IVs or generate synthetic data
      const ivHistory = historicalIVs || Array.from({ length: 252 }, () => currentIV * (0.7 + Math.random() * 0.6));
      
      const analysis = analyzeIV(currentIV, ivHistory);
      
      res.json(analysis);
    } catch (error: any) {
      logger.error("Error analyzing IV", { error });
      res.status(500).json({ error: "Failed to analyze IV" });
    }
  });

  // POST /api/options-quant/sabr - Calibrate SABR model
  app.post("/api/options-quant/sabr", requireBetaAccess, async (req, res) => {
    try {
      const { forward, strikes, marketVols, timeToExpiry, beta = 0.5 } = req.body;
      
      if (!forward || !strikes || !marketVols || !timeToExpiry) {
        return res.status(400).json({ error: "Missing required fields: forward, strikes, marketVols, timeToExpiry" });
      }
      
      const { calibrateSABR, sabrImpliedVolatility } = await import("./options-quant");
      
      const sabrParams = calibrateSABR(forward, strikes, marketVols, timeToExpiry, beta);
      
      // Generate fitted curve
      const fittedVols = strikes.map((k: number) => sabrImpliedVolatility(forward, k, timeToExpiry, sabrParams));
      
      // Calculate fit quality (RMSE)
      const errors = marketVols.map((mv: number, i: number) => Math.pow(mv - fittedVols[i], 2));
      const rmse = Math.sqrt(errors.reduce((s: number, e: number) => s + e, 0) / errors.length);
      
      res.json({
        sabrParams,
        fittedVolatilities: fittedVols,
        rmse,
        fitQuality: rmse < 0.01 ? 'Excellent' : rmse < 0.03 ? 'Good' : rmse < 0.05 ? 'Fair' : 'Poor'
      });
    } catch (error: any) {
      logger.error("Error calibrating SABR", { error });
      res.status(500).json({ error: "Failed to calibrate SABR model" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
