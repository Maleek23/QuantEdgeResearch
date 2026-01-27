import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startWatchlistMonitor } from "./watchlist-monitor";
import { startWatchlistGradingScheduler } from "./watchlist-grading-service";
import { logger } from "./logger";
import { validateTradierAPI } from "./tradier-api";
import { deriveTimingWindows, verifyTimingUniqueness } from "./timing-intelligence";
import { initializeRealtimePrices, getRealtimeStatus } from "./realtime-price-service";
import { initializeBotNotificationService } from "./bot-notification-service";
import { securityHeaders } from "./security";
import { csrfMiddleware, validateCSRF } from "./csrf";

const app = express();

// Trust proxy for accurate rate limiting (Replit sets X-Forwarded-For header)
app.set('trust proxy', true);

// Enable gzip compression for all responses (significant speed improvement)
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }}));

// Add a simple health check endpoint
app.get("/health", (req: Request, res: Response) => {
  const realtimeStatus = getRealtimeStatus();
  const overallStatus = realtimeStatus.isHealthy ? "OK" : "DEGRADED";
  res.status(realtimeStatus.isHealthy ? 200 : 503).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    realtimePrices: realtimeStatus,
    message: realtimeStatus.isHealthy ? "Server is healthy" : "Realtime price service is degraded",
  });
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

app.use(securityHeaders);
app.use(csrfMiddleware);
app.use((req, res, next) => {
  if (/^(GET|HEAD|OPTIONS)$/i.test(req.method)) {
    return next();
  }
  validateCSRF(req, res, next);
});

// SECURITY: Safe logging middleware - prevents sensitive data leakage
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // SECURITY: Only log request method, path, status, and duration
      // NEVER log request bodies (could contain passwords) or response bodies (could contain tokens/keys)
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      
      // Add safe metadata only (no sensitive data)
      if (res.statusCode >= 400) {
        logLine += ` [ERROR]`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // SECURITY: Sanitized error handler - prevents stack trace and internal detail exposure
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    
    // Log full error server-side
    import('./logger').then(({ logger }) => {
      logger.error('Express error handler:', err);
    });

    // Send sanitized message to client (never expose stack traces or internal details)
    res.status(status).json({ 
      error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed')
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Validate Tradier API on startup
    await validateTradierAPI();
    
    // Start watchlist price alert monitoring (checks every 5 minutes)
    startWatchlistMonitor(5);
    log('🔔 Watchlist Monitor started - checking every 5 minutes');
    
    // Start watchlist grading scheduler (every 15 minutes during market hours)
    startWatchlistGradingScheduler();
    log('📊 Watchlist Grading Scheduler started - grading every 15 minutes during market hours');
    
    // Start automated performance validation (checks every 5 minutes)
    const { performanceValidationService } = await import('./performance-validation-service');
    performanceValidationService.start();
    
    // Start automated daily idea generation (9:30 AM CT on weekdays)
    const { autoIdeaGenerator } = await import('./auto-idea-generator');
    autoIdeaGenerator.start();
    log('🤖 Auto Idea Generator started - will generate fresh ideas at 9:30 AM CT weekdays');
    
    // Start Penny Stock Moonshot Scanner (4:00 AM, 9:30 AM, 8:00 PM CT on weekdays)
    const { pennyScanner } = await import('./penny-scanner');
    pennyScanner.start();
    log('🚀 Penny Moonshot Scanner started - scanning at 4:00 AM, 9:30 AM, 8:00 PM CT weekdays');
    
    // Start Bullish Trend Scanner (tracks momentum stocks every 15 min during market hours)
    const { startBullishTrendScanner } = await import('./bullish-trend-scanner');
    startBullishTrendScanner();
    log('📈 Bullish Trend Scanner started - tracking momentum stocks every 15 minutes during market hours');
    
    // Start Morning Preview Scheduler (8:30 AM CT weekdays - sends preview to Discord)
    const { startMorningPreviewScheduler } = await import('./morning-preview-service');
    startMorningPreviewScheduler();
    log('☀️ Morning Preview Scheduler started - sends 8:30 AM CT trading preview to Discord');
    
    // Start Surge Detection Engine (event-driven, criteria-based detection every 60s)
    const { startDetectionEngine } = await import('./surge-detection-engine');
    startDetectionEngine(60000); // Run detection cycle every 60 seconds
    log('🎯 Surge Detection Engine started - criteria-based alerts every 60 seconds (price/volume/news/sector)');
    
    // Start Pre-Market Surge Detector (4:00 AM - 9:30 AM ET, every 5 minutes)
    const { startPreMarketSurgeDetector } = await import('./pre-market-surge-detector');
    startPreMarketSurgeDetector();
    log('🌅 Pre-Market Surge Detector started - monitoring for big moves every 5 minutes (4 AM - 9:30 AM ET)');
    
    // Start Symbol Attention Tracker (tracks flow across all scanners)
    const { startAttentionTrackingService } = await import('./attention-tracking-service');
    startAttentionTrackingService();
    log('🔥 Symbol Attention Tracker started - tracking convergence signals across all systems');
    
    // Initialize real-time price feeds with WebSocket broadcast (Coinbase for crypto, Databento for futures)
    initializeRealtimePrices(server);
    log('📡 Real-time price feeds initialized with WebSocket broadcast on /ws/prices');
    
    // Initialize bot notification WebSocket for real-time trade alerts
    initializeBotNotificationService(server);
    log('🤖 Bot notification service initialized with WebSocket broadcast on /ws/bot');
    
    // Start Catalyst Intelligence polling (SEC filings, government contracts)
    const { startCatalystPolling } = await import('./catalyst-intelligence-service');
    startCatalystPolling(30); // Refresh catalyst data every 30 minutes
    log('📋 Catalyst Intelligence polling started - refreshing SEC filings and gov contracts every 30 minutes');
    
    // Start Pre-Move Detection Scanner (power hour sweeps, volume spikes, IV expansion, defense contracts)
    const { startPreMoveScanner } = await import('./pre-move-detection-service');
    startPreMoveScanner();
    log('🔮 Pre-Move Detection Scanner started - monitoring for late-day sweeps, volume spikes, IV expansion, and defense contracts');

    // Start Self-Learning Service (engines learn from their own performance)
    const { selfLearning } = await import('./self-learning-service');
    selfLearning.start();
    log('🧠 Self-Learning Service started - engines will adapt based on trade outcomes');

    // Start Convergence Engine (multi-source signal correlation for pre-move detection)
    const { startConvergenceEngine } = await import('./convergence-engine');
    startConvergenceEngine();
    log('🎯 Convergence Engine started - correlating signals across news, options flow, insiders, sectors for pre-move detection');

    // Start News→Options Pipeline (early surge detection from breaking news)
    const { startNewsOptionsPipeline } = await import('./news-options-pipeline');
    startNewsOptionsPipeline();
    log('📰 News→Options Pipeline started - generating options plays from breaking news catalysts (RDW, USAR, BNAI-style surges)');

    // Start ML Retraining Service (self-improving models)
    // TODO: Implement ML retraining service
    // const { startMLRetrainingService } = await import('./ml-retraining-service');
    // startMLRetrainingService();
    // log('🧠 ML Retraining Service started - auto-improving models at 3 AM daily, weight updates every 4 hours');
    
    // 🌙 EVENING STARTUP: One-time check to run Tomorrow's Playbook generation if in evening hours
    (async () => {
      try {
        const now = new Date();
        const nowCT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const hourCT = nowCT.getHours();
        const dayOfWeek = nowCT.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Check if current time is between 6:00 PM (18:00) and 11:59 PM (23:59) CT
        // Also skip weekends - penny stock generation is for weekday trading
        const isEveningHours = hourCT >= 18 && hourCT <= 23;
        const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
        
        if (isEveningHours && isWeekday) {
          logger.info(`🌙 [EVENING STARTUP] Running Tomorrow's Playbook generation...`);
          logger.info(`🌙 [EVENING STARTUP] Current CT time: ${nowCT.toLocaleTimeString('en-US')} (${hourCT}:00 hour)`);
          
          // Call forceGenerate with focusPennyStocks=true and relaxedFilters=true
          const generatedCount = await autoIdeaGenerator.forceGenerate(true, true);
          
          if (generatedCount > 0) {
            logger.info(`🌙 [EVENING STARTUP] Successfully generated ${generatedCount} tomorrow's watchlist ideas`);
          } else {
            logger.info(`🌙 [EVENING STARTUP] No evening ideas generated (may be duplicates or AI unavailable)`);
          }
        } else {
          logger.info(`⏰ [STARTUP] Not evening hours (CT hour: ${hourCT}, day: ${dayOfWeek}) - skipping evening penny stock generation`);
        }
      } catch (error) {
        logger.error('🌙 [EVENING STARTUP] Failed to run evening generation:', error);
      }
    })();
    
    // Start automated hybrid idea generation (9:45 AM CT on weekdays - 15 min after AI/Quant)
    const cron = await import('node-cron');
    let lastHybridRunDate: string | null = null;
    let isHybridGenerating = false;
    
    // Check every 5 minutes for 9:45 AM CT window
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        // Prevent concurrent generations
        if (isHybridGenerating) {
          return;
        }
        
        const now = new Date();
        const nowCT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        
        // Extract CT time components
        const hour = nowCT.getHours();
        const minute = nowCT.getMinutes();
        const dayOfWeek = nowCT.getDay(); // 0 = Sunday, 6 = Saturday
        const dateKey = nowCT.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return;
        }
        
        // Check if it's 9:45 AM CT (hour = 9, minute = 45-49 to catch the window)
        const isHybridTime = hour === 9 && minute >= 45 && minute < 50;
        
        if (!isHybridTime) {
          return;
        }
        
        // Check if we already ran today
        if (lastHybridRunDate === dateKey) {
          return; // Already ran today
        }
        
        isHybridGenerating = true;
        lastHybridRunDate = dateKey;
        
        logger.info(`🔀 [HYBRID-CRON] Starting automated hybrid generation at 9:45 AM CT`);
        
        // 🚫 DEDUPLICATION: Check PAPER_POSITIONS (actual trades) not trade_ideas (3,453+ open)
        // CRITICAL FIX: Previously blocked all symbols that had any trade idea
        const existingOpenSymbols = new Set<string>();
        try {
          const portfolios = await storage.getAllPaperPortfolios();
          const quantPortfolio = portfolios.find((p: any) => p.name === 'Quant Bot Auto-Trader');
          if (quantPortfolio) {
            const positions = await storage.getPaperPositionsByPortfolio(quantPortfolio.id);
            positions.filter((p: any) => p.status === 'open').forEach((p: any) => existingOpenSymbols.add(p.symbol.toUpperCase()));
          }
          logger.info(`🚫 [HYBRID-CRON] Dedup: ${existingOpenSymbols.size} symbols have open paper positions`);
        } catch (e) {
          logger.info(`⚠️ [HYBRID-CRON] Could not fetch paper positions - allowing all symbols`);
        }
        
        // Generate hybrid ideas
        const { generateHybridIdeas } = await import('./ai-service');
        const { validateTradeRisk } = await import('./ai-service');
        const { validateAndLog: validateTradeStructure } = await import('./trade-validation');
        const hybridIdeas = await generateHybridIdeas("Market open conditions with quant + AI fusion");
        
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
            logger.info(`⏭️  [HYBRID-CRON] Skipped ${hybridIdea.symbol} - already has open trade`);
            metrics.dedupedCount++;
            continue;
          }
          
          // 📅 Check earnings calendar (block if earnings within 2 days, unless it's a news catalyst)
          if (hybridIdea.assetType === 'stock' || hybridIdea.assetType === 'option') {
            const { shouldBlockSymbol } = await import('./earnings-service');
            const isBlocked = await shouldBlockSymbol(hybridIdea.symbol, false);
            if (isBlocked) {
              logger.warn(`📅 [HYBRID-CRON] Skipped ${hybridIdea.symbol} - earnings within 2 days`);
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
                // MINIMUM 50-75% gain targets - options are risky, need real upside!
                const optionPremium = optimalStrike.lastPrice;
                const expDate = hybridIdea.expiryDate;
                const daysToExpiry = expDate 
                  ? Math.max(1, Math.ceil((new Date(expDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                  : 7; // default to weekly if unknown
                let targetMult = daysToExpiry <= 3 ? 2.0 : daysToExpiry <= 7 ? 1.75 : daysToExpiry <= 14 ? 1.60 : 1.50;
                
                hybridIdea.entryPrice = optionPremium;
                hybridIdea.targetPrice = optionPremium * targetMult; // 50-100% gain based on DTE
                hybridIdea.stopLoss = optionPremium * 0.50; // 50% max loss on premium
                
                const gainPct = Math.round((targetMult - 1) * 100);
                logger.info(`[HYBRID-CRON] ${hybridIdea.symbol} option pricing - Stock:$${stockPrice} -> Premium:$${optionPremium} (Target:$${hybridIdea.targetPrice.toFixed(2)} +${gainPct}%, Stop:$${hybridIdea.stopLoss.toFixed(2)})`);
              } else {
                // Fallback: estimate premium as ~5% of stock price
                // Use 75% target for estimated premiums (moderate aggression)
                const estimatedPremium = stockPrice * 0.05;
                hybridIdea.entryPrice = estimatedPremium;
                hybridIdea.targetPrice = estimatedPremium * 1.75; // +75% gain
                hybridIdea.stopLoss = estimatedPremium * 0.50; // 50% max loss
                
                logger.warn(`[HYBRID-CRON] ${hybridIdea.symbol} using estimated premium (~5% of stock) - Premium:$${estimatedPremium.toFixed(2)}, Target:+75%`);
              }
            } catch (error) {
              logger.error(`❌ [HYBRID-CRON] ${hybridIdea.symbol} option pricing failed:`, error);
              rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: 'Failed to fetch option premium' });
              metrics.optionsQuarantinedCount++;
              continue;
            }
          }
          
          // 🛡️ LAYER 1: Structural validation
          const structureValid = validateTradeStructure({
            symbol: hybridIdea.symbol,
            assetType: hybridIdea.assetType,
            direction: hybridIdea.direction,
            entryPrice: hybridIdea.entryPrice,
            targetPrice: hybridIdea.targetPrice,
            stopLoss: hybridIdea.stopLoss
          }, 'Hybrid-Cron');
          
          if (!structureValid) {
            rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: 'Structural validation failed' });
            metrics.structuralFailCount++;
            continue;
          }
          
          // 🛡️ LAYER 2: Risk guardrails
          const validation = validateTradeRisk(hybridIdea);
          
          if (!validation.isValid) {
            logger.warn(`🚫 [HYBRID-CRON] REJECTED ${hybridIdea.symbol} - ${validation.reason}`);
            rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: validation.reason || 'Unknown' });
            metrics.riskFailCount++;
            continue;
          }
          
          // ✅ Trade passes validation - save
          logger.info(`✅ [HYBRID-CRON] ${hybridIdea.symbol} passed validation - Loss:${validation.metrics?.maxLossPercent.toFixed(2)}% R:R:${validation.metrics?.riskRewardRatio.toFixed(2)}:1`);
          
          const { entryPrice, targetPrice, stopLoss } = hybridIdea;
          const riskRewardRatio = (targetPrice - entryPrice) / (entryPrice - stopLoss);
          
          // 📊 Calculate confidence score (simplified for CRON - use base 55 for hybrid)
          const confidenceScore = 55 + (validation.metrics?.riskRewardRatio ? Math.min(10, validation.metrics.riskRewardRatio * 5) : 0);
          
          // 📊 BUILD QUALITY SIGNALS based on validations
          const qualitySignals: string[] = [];
          qualitySignals.push('Hybrid (AI+Quant)'); // Always present
          if (riskRewardRatio >= 2.0) {
            qualitySignals.push(`R:R ${riskRewardRatio.toFixed(1)}:1`);
          }
          // Copy any existing signals from the hybrid idea
          if ((hybridIdea as any).qualitySignals?.length) {
            qualitySignals.push(...(hybridIdea as any).qualitySignals.slice(0, 3));
          }
          
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
            timestamp: new Date().toISOString(),
            entryValidUntil: timingWindows.entryValidUntil,
            exitBy: timingWindows.exitBy,
            expiryDate: hybridIdea.expiryDate || null,
            strikePrice: hybridIdea.assetType === 'option' ? ((hybridIdea as any).strikePrice || hybridIdea.entryPrice * (hybridIdea.direction === 'long' ? 1.02 : 0.98)) : null,
            optionType: hybridIdea.assetType === 'option' ? ((hybridIdea as any).optionType || (hybridIdea.direction === 'long' ? 'call' : 'put')) : null,
            source: 'hybrid',
            confidenceScore,
            qualitySignals, // Array of verified signal labels
            volatilityRegime: timingWindows.volatilityRegime,
            sessionPhase: timingWindows.sessionPhase,
            trendStrength: timingWindows.trendStrength,
            entryWindowMinutes: timingWindows.entryWindowMinutes,
            exitWindowMinutes: timingWindows.exitWindowMinutes,
            timingConfidence: timingWindows.timingConfidence,
            targetHitProbability: timingWindows.targetHitProbability,
            isLottoPlay: (hybridIdea as any).isLottoPlay || false,
          });
          savedIdeas.push(tradeIdea);
          metrics.passedCount++;
        }
        
        // 🔍 TIMING VERIFICATION: Ensure timing windows are unique across batch
        if (savedIdeas.length > 0) {
          verifyTimingUniqueness(savedIdeas.map((idea: any) => ({
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
          const { sendBatchSummaryToDiscord } = await import('./discord-service');
          sendBatchSummaryToDiscord(savedIdeas, 'hybrid').catch(err => 
            logger.error('[HYBRID-CRON] Discord notification failed:', err)
          );
        }
        
        // Log summary
        if (rejectedIdeas.length > 0) {
          logger.warn(`🛡️ [HYBRID-CRON] Risk Validation Summary: ${rejectedIdeas.length} rejected, ${savedIdeas.length} passed`);
        }
        
        if (savedIdeas.length > 0) {
          logger.info(`✅ [HYBRID-CRON] Successfully generated ${savedIdeas.length} hybrid trade ideas`);
        } else {
          logger.warn('⚠️  [HYBRID-CRON] No ideas generated - all rejected or AI unavailable');
        }
        
      } catch (error: any) {
        logger.error('🔀 [HYBRID-CRON] Hybrid generation failed:', error);
      } finally {
        isHybridGenerating = false;
      }
    });
    
    log('🔀 Hybrid Generator started - will generate ideas at 9:45 AM CT weekdays (15 min after AI/Quant)');
    
    // Start automated quant idea generation (9:35 AM CT on weekdays - 5 min after AI)
    let lastQuantRunDate: string | null = null;
    let isQuantGenerating = false;
    
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        if (isQuantGenerating) {
          return;
        }
        
        const now = new Date();
        const nowCT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        
        const hour = nowCT.getHours();
        const minute = nowCT.getMinutes();
        const dayOfWeek = nowCT.getDay();
        const dateKey = nowCT.toISOString().split('T')[0];

        // DEVELOPMENT MODE: Allow weekend testing
        // PRODUCTION MODE: Only weekdays
        const isDevelopment = process.env.NODE_ENV !== 'production';
        if (!isDevelopment && (dayOfWeek === 0 || dayOfWeek === 6)) {
          return;
        }

        // DEVELOPMENT MODE: Run every 30 minutes for testing
        // PRODUCTION MODE: Run at 9:35 AM CT and 1:00 PM CT only
        const isQuantTime = isDevelopment
          ? (minute >= 0 && minute < 5) || (minute >= 30 && minute < 35) // Every 30 min in dev
          : ((hour === 9 && minute >= 35 && minute < 40) || (hour === 13 && minute >= 0 && minute < 5)); // Scheduled times in prod

        if (!isQuantTime) {
          return;
        }

        // In production, only run morning session once per day
        if (!isDevelopment && lastQuantRunDate === dateKey && hour === 9) {
          return; // Already ran morning session today
        }
        
        isQuantGenerating = true;
        if (hour === 9) lastQuantRunDate = dateKey;
        
        logger.info(`📊 [QUANT-CRON] Starting automated quant generation at ${hour}:${minute.toString().padStart(2, '0')} CT`);
        
        const { generateQuantIdeas } = await import('./quant-ideas-generator');
        const marketData = await storage.getAllMarketData();
        const catalysts = await storage.getAllCatalysts();
        
        // Generate 10 quant ideas across different sectors
        const quantIdeas = await generateQuantIdeas(marketData, catalysts, 10, storage, true);
        
        const savedIdeas = [];
        
        // 🔧 FIX: Check OPEN paper_positions (actual trades), NOT trade_ideas (52k+ research entries)
        const { getOptionsPortfolio } = await import('./auto-lotto-trader');
        const portfolio = await getOptionsPortfolio();
        const openPositionKeys = new Set<string>();
        
        if (portfolio) {
          const openPositions = await storage.getPaperPositionsByPortfolio(portfolio.id);
          for (const pos of openPositions) {
            if (pos.status === 'open') {
              const key = `${pos.symbol}:${pos.optionType || ''}:${pos.strikePrice || ''}`.toUpperCase();
              openPositionKeys.add(key);
            }
          }
          logger.info(`🔍 [QUANT-CRON] Open positions to avoid duplicates: ${openPositionKeys.size}`);
        }
        
        for (const idea of quantIdeas) {
          // Skip only if we already have an OPEN POSITION for this exact option
          const ideaKey = `${idea.symbol}:${idea.optionType || ''}:${idea.strikePrice || ''}`.toUpperCase();
          if (openPositionKeys.has(ideaKey)) {
            logger.info(`⏭️  [QUANT-CRON] Skipped ${idea.symbol} ${idea.optionType || ''} $${idea.strikePrice || ''} - already have open position`);
            continue;
          }
          
          const saved = await storage.createTradeIdea({
            ...idea,
            source: 'quant',
            status: 'published',
          });
          savedIdeas.push(saved);
        }
        
        if (savedIdeas.length > 0) {
          logger.info(`✅ [QUANT-CRON] Generated ${savedIdeas.length} quant trade ideas`);
          const { sendBatchSummaryToDiscord, sendPremiumOptionsAlertToDiscord } = await import('./discord-service');
          
          // 🚀 AUTO-EXECUTE: Actually enter trades, not just generate ideas!
          const { getOptionsPortfolio } = await import('./auto-lotto-trader');
          const { executeTradeIdea } = await import('./paper-trading-service');
          const portfolio = await getOptionsPortfolio();
          
          if (portfolio) {
            let tradesExecuted = 0;
            for (const idea of savedIdeas) {
              // Execute options trades (the ones that have option details)
              if (idea.assetType === 'option' && idea.strikePrice && idea.optionType) {
                try {
                  const result = await executeTradeIdea(portfolio.id, idea);
                  if (result.success && result.position) {
                    tradesExecuted++;
                    logger.info(`🚀 [QUANT-CRON] AUTO-EXECUTED: ${idea.symbol} ${idea.optionType?.toUpperCase()} $${idea.strikePrice} @ $${idea.entryPrice?.toFixed(2)} x${result.position.quantity}`);
                  } else {
                    logger.warn(`⚠️ [QUANT-CRON] Execution failed for ${idea.symbol}: ${result.error}`);
                  }
                } catch (execErr) {
                  logger.error(`[QUANT-CRON] Trade execution error for ${idea.symbol}:`, execErr);
                }
              }
            }
            logger.info(`🎯 [QUANT-CRON] AUTO-EXECUTED ${tradesExecuted}/${savedIdeas.length} trades into paper portfolio`);
          } else {
            logger.warn(`⚠️ [QUANT-CRON] No portfolio available - trades saved but NOT executed`);
          }
          
          // 🎯 Send premium A/A+ alerts for options
          for (const idea of savedIdeas) {
            const grade = idea.probabilityBand || '';
            if (['A+', 'A'].includes(grade) && idea.assetType === 'option') {
              const dte = idea.expiryDate 
                ? Math.ceil((new Date(idea.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : undefined;
              sendPremiumOptionsAlertToDiscord({
                symbol: idea.symbol,
                optionType: (idea.optionType as 'call' | 'put') || 'call',
                strikePrice: idea.strikePrice || 0,
                expiryDate: idea.expiryDate || '',
                entryPrice: idea.entryPrice || 0,
                targetPrice: idea.targetPrice || 0,
                stopLoss: idea.stopLoss || 0,
                confidence: (idea as any).confidenceScore || 90,
                grade,
                delta: (idea as any).delta,
                dte,
                tradeType: dte && dte <= 1 ? 'day' : dte && dte <= 7 ? 'swing' : 'swing',
                signals: (idea as any).signals || [],
                source: 'quant'
              }).catch(err => logger.error(`[QUANT-CRON] Premium alert failed for ${idea.symbol}:`, err));
              logger.info(`📣 [QUANT-CRON] Premium A/A+ alert sent: ${idea.symbol} [${grade}]`);
            }
          }
          
          sendBatchSummaryToDiscord(savedIdeas, 'quant').catch(err => 
            logger.error('[QUANT-CRON] Discord notification failed:', err)
          );
        } else {
          logger.warn('⚠️  [QUANT-CRON] No quant ideas generated');
        }
        
      } catch (error: any) {
        logger.error('📊 [QUANT-CRON] Quant generation failed:', error);
      } finally {
        isQuantGenerating = false;
      }
    });
    
    log('📊 Quant Generator started - will generate ideas at 9:35 AM CT + 1:00 PM CT weekdays');
    
    // ONE-TIME STARTUP TRIGGER: Generate quant ideas immediately on server start
    // DISABLED IN PRODUCTION to prevent memory exhaustion and rate limiting on Render
    const SKIP_STARTUP_SCANS = process.env.NODE_ENV === 'production';

    if (SKIP_STARTUP_SCANS) {
      logger.info('🚀 [QUANT-STARTUP] Skipping startup scans in production (memory optimization)');
    }

    (async () => {
      if (SKIP_STARTUP_SCANS) return; // Skip heavy startup operations in production

      try {
        logger.info('🚀 [QUANT-STARTUP] Running one-time quant generation on server startup...');

        const { generateQuantIdeas } = await import('./quant-ideas-generator');
        const { storage: quantStorage } = await import('./storage');
        const marketData = await quantStorage.getAllMarketData();
        const catalysts = await quantStorage.getAllCatalysts();
        
        // Generate 15 quant ideas across different sectors
        const quantIdeas = await generateQuantIdeas(marketData, catalysts, 15, quantStorage, true);
        
        const savedIdeas = [];
        
        // 🔧 FIX: Check OPEN paper_positions (actual trades), NOT trade_ideas (52k+ research entries)
        // This was causing ALL ideas to be skipped as "duplicates" even though no trades were entered
        const { getOptionsPortfolio } = await import('./auto-lotto-trader');
        const portfolio = await getOptionsPortfolio();
        const openPositionKeys = new Set<string>();
        
        if (portfolio) {
          const openPositions = await quantStorage.getPaperPositionsByPortfolio(portfolio.id);
          for (const pos of openPositions) {
            if (pos.status === 'open') {
              const key = `${pos.symbol}:${pos.optionType || ''}:${pos.strikePrice || ''}`.toUpperCase();
              openPositionKeys.add(key);
            }
          }
          logger.info(`🔍 [QUANT-STARTUP] Open positions to avoid duplicates: ${openPositionKeys.size}`);
        }
        
        for (const idea of quantIdeas) {
          // Skip only if we already have an OPEN POSITION for this exact option
          const ideaKey = `${idea.symbol}:${idea.optionType || ''}:${idea.strikePrice || ''}`.toUpperCase();
          if (openPositionKeys.has(ideaKey)) {
            logger.info(`⏭️  [QUANT-STARTUP] Skipped ${idea.symbol} ${idea.optionType || ''} $${idea.strikePrice || ''} - already have open position`);
            continue;
          }
          
          // Options now allowed - direction bug fixed (was marking puts as 'short' instead of 'long')
          // All options are now LONG (bought) positions with correct P&L calculation
          
          const saved = await quantStorage.createTradeIdea({
            ...idea,
            source: 'quant',
            status: 'published', // Content status (published/draft), not trade outcome
          });
          savedIdeas.push(saved);
        }
        
        if (savedIdeas.length > 0) {
          logger.info(`✅ [QUANT-STARTUP] Generated ${savedIdeas.length} fresh quant trade ideas on startup`);
          const { sendBatchSummaryToDiscord, sendPremiumOptionsAlertToDiscord } = await import('./discord-service');
          
          // 🚀 AUTO-EXECUTE: Actually enter trades, not just generate ideas!
          const { getOptionsPortfolio } = await import('./auto-lotto-trader');
          const { executeTradeIdea } = await import('./paper-trading-service');
          const portfolio = await getOptionsPortfolio();
          
          if (portfolio) {
            let tradesExecuted = 0;
            for (const idea of savedIdeas) {
              // Execute options trades (the ones that have option details)
              if (idea.assetType === 'option' && idea.strikePrice && idea.optionType) {
                try {
                  const result = await executeTradeIdea(portfolio.id, idea);
                  if (result.success && result.position) {
                    tradesExecuted++;
                    logger.info(`🚀 [QUANT-STARTUP] AUTO-EXECUTED: ${idea.symbol} ${idea.optionType?.toUpperCase()} $${idea.strikePrice} @ $${idea.entryPrice?.toFixed(2)} x${result.position.quantity}`);
                  } else {
                    logger.warn(`⚠️ [QUANT-STARTUP] Execution failed for ${idea.symbol}: ${result.error}`);
                  }
                } catch (execErr) {
                  logger.error(`[QUANT-STARTUP] Trade execution error for ${idea.symbol}:`, execErr);
                }
              }
            }
            logger.info(`🎯 [QUANT-STARTUP] AUTO-EXECUTED ${tradesExecuted}/${savedIdeas.length} trades into paper portfolio`);
          } else {
            logger.warn(`⚠️ [QUANT-STARTUP] No portfolio available - trades saved but NOT executed`);
          }
          
          // 🎯 Send premium A/A+ alerts for options
          for (const idea of savedIdeas) {
            const grade = idea.probabilityBand || '';
            if (['A+', 'A'].includes(grade) && idea.assetType === 'option') {
              const dte = idea.expiryDate 
                ? Math.ceil((new Date(idea.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : undefined;
              sendPremiumOptionsAlertToDiscord({
                symbol: idea.symbol,
                optionType: (idea.optionType as 'call' | 'put') || 'call',
                strikePrice: idea.strikePrice || 0,
                expiryDate: idea.expiryDate || '',
                entryPrice: idea.entryPrice || 0,
                targetPrice: idea.targetPrice || 0,
                stopLoss: idea.stopLoss || 0,
                confidence: (idea as any).confidenceScore || 90,
                grade,
                delta: (idea as any).delta,
                dte,
                tradeType: dte && dte <= 1 ? 'day' : dte && dte <= 7 ? 'swing' : 'swing',
                signals: (idea as any).signals || [],
                source: 'quant'
              }).catch(err => logger.error(`[QUANT-STARTUP] Premium alert failed for ${idea.symbol}:`, err));
              logger.info(`📣 [QUANT-STARTUP] Premium A/A+ alert sent: ${idea.symbol} [${grade}]`);
            }
          }
          
          sendBatchSummaryToDiscord(savedIdeas, 'quant').catch(err => 
            logger.error('[QUANT-STARTUP] Discord notification failed:', err)
          );
        } else {
          logger.warn('⚠️  [QUANT-STARTUP] No new quant ideas generated (may be filtered or duplicates)');
        }
        
        // STARTUP TRIGGER: Send weekly picks to Discord for immediate viewing
        try {
          const { generateNextWeekPicks, getNextWeekRange } = await import('./weekly-picks-generator');
          const { sendNextWeekPicksToDiscord } = await import('./discord-service');
          
          const picks = await generateNextWeekPicks();
          const weekRange = getNextWeekRange();
          
          if (picks.length > 0) {
            await sendNextWeekPicksToDiscord(picks, weekRange);
            logger.info(`🎯 [STARTUP] Sent ${picks.length} weekly premium picks to Discord (${weekRange.start} - ${weekRange.end})`);
          } else {
            logger.warn('⚠️  [STARTUP] No weekly picks generated');
          }
        } catch (err: any) {
          logger.error('🎯 [STARTUP] Weekly picks failed:', err);
        }
        
        // STARTUP TRIGGER: Run autonomous bot scan immediately
        try {
          logger.info('🤖 [BOT-STARTUP] Running autonomous options scan on startup...');
          const { runAutonomousBotScan } = await import('./auto-lotto-trader');
          await runAutonomousBotScan();
          logger.info('🤖 [BOT-STARTUP] Autonomous options scan complete');
        } catch (err: any) {
          logger.error('🤖 [BOT-STARTUP] Autonomous scan failed:', err);
        }
        
      } catch (error: any) {
        logger.error('🚀 [QUANT-STARTUP] Startup quant generation failed:', error);
      }
    })();
    
    // Start automated news-driven trade generation (every 15 minutes during market hours)
    const { fetchBreakingNews, getNewsServiceStatus } = await import('./news-service');
    const { generateTradeIdeasFromNews } = await import('./ai-service');
    const { storage } = await import('./storage');
    
    // Schedule news fetching every 15 minutes
    cron.default.schedule('*/15 * * * *', async () => {
      try {
        // Check if market is open or in extended hours (08:00-20:00 ET Mon-Fri)
        const now = new Date();
        const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const hour = nyTime.getHours();
        const dayOfWeek = nyTime.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return;
        }
        
        // Only run during extended market hours: 08:00-20:00 ET (pre-market to after-hours)
        if (hour < 8 || hour >= 20) {
          return;
        }
        
        // Check API quota status
        const status = getNewsServiceStatus();
        if (!status.isHealthy || status.quotaRemaining < 10) {
          logger.warn(`📰 [NEWS-CRON] Skipping news fetch - quota low: ${status.quotaRemaining}/500 remaining`);
          return;
        }
        
        logger.info(`📰 [NEWS-CRON] Fetching breaking news (${hour}:${nyTime.getMinutes().toString().padStart(2, '0')} ET)`);
        
        // Fetch breaking news (limit to 20 articles to conserve quota)
        const breakingNews = await fetchBreakingNews(undefined, undefined, 20);
        
        if (breakingNews.length === 0) {
          logger.info('📰 [NEWS-CRON] No breaking news found');
          return;
        }
        
        logger.info(`📰 [NEWS-CRON] Found ${breakingNews.length} breaking news articles`);
        
        // 🚫 DEDUPLICATION: Check PAPER_POSITIONS (actual trades) not trade_ideas
        // CRITICAL FIX: Previously blocked all symbols with any trade idea (3,453+)
        const existingOpenSymbols = new Set<string>();
        try {
          const portfolios = await storage.getAllPaperPortfolios();
          const quantPortfolio = portfolios.find((p: any) => p.name === 'Quant Bot Auto-Trader');
          if (quantPortfolio) {
            const positions = await storage.getPaperPositionsByPortfolio(quantPortfolio.id);
            positions.filter((p: any) => p.status === 'open').forEach((p: any) => existingOpenSymbols.add(p.symbol.toUpperCase()));
          }
        } catch (e) { /* Allow all if error */ }
        
        // Generate trade ideas from breaking news (limit to top 3 to avoid spam)
        let generatedCount = 0;
        let skippedCount = 0;
        
        for (const article of breakingNews.slice(0, 3)) {
          try {
            // Skip if we already have an open trade for this ticker
            if (existingOpenSymbols.has(article.primaryTicker.toUpperCase())) {
              logger.info(`📰 [NEWS-CRON] Skipped ${article.primaryTicker} - already has open trade`);
              skippedCount++;
              continue;
            }
            
            // Generate trade idea from news
            const aiIdea = await generateTradeIdeasFromNews(article);
            
            if (!aiIdea) {
              logger.warn(`📰 [NEWS-CRON] Failed to generate valid trade from "${article.title}"`);
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
            
            generatedCount++;
            logger.info(`✅ [NEWS-CRON] Created news-driven trade: ${tradeIdea.symbol} ${tradeIdea.direction.toUpperCase()} from "${article.title}"`);
            
            // Send Discord notification for news-driven trade
            const { sendBatchSummaryToDiscord } = await import('./discord-service');
            sendBatchSummaryToDiscord([tradeIdea], 'news').catch(err => 
              logger.error('[NEWS-CRON] Discord notification failed:', err)
            );
          } catch (error: any) {
            logger.error(`📰 [NEWS-CRON] Failed to process article "${article.title}":`, error);
          }
        }
        
        if (generatedCount > 0) {
          logger.info(`📰 [NEWS-CRON] Generated ${generatedCount} news-driven trades (${skippedCount} skipped - duplicates)`);
        } else {
          logger.info(`📰 [NEWS-CRON] No trades generated from ${breakingNews.length} breaking news articles`);
        }
        
        // Log quota status
        const updatedStatus = getNewsServiceStatus();
        logger.info(`📰 [NEWS-CRON] API quota: ${updatedStatus.quotaUsed}/500 used, ${updatedStatus.quotaRemaining} remaining`);
      } catch (error: any) {
        logger.error('📰 [NEWS-CRON] News processing failed:', error);
      }
    });
    
    log('📰 News Monitor started - fetching breaking news every 15 minutes during market hours (08:00-20:00 ET)');
    
    // Start automated unusual options flow scanner (every 15 minutes during market hours)
    const { scanUnusualOptionsFlow, isMarketHoursForFlow } = await import('./flow-scanner');
    const { validateAndLog: validateTradeStructure } = await import('./trade-validation');
    
    // Schedule flow scanning every 15 minutes
    cron.default.schedule('*/15 * * * *', async () => {
      try {
        // Check if market is open (9:30 AM - 4:00 PM ET, Mon-Fri)
        if (!isMarketHoursForFlow()) {
          return;
        }
        
        logger.info('📊 [FLOW-CRON] Starting automated flow scan...');
        
        // Scan for unusual options flow
        const flowIdeas = await scanUnusualOptionsFlow();
        
        if (flowIdeas.length === 0) {
          logger.info('📊 [FLOW-CRON] No unusual flow detected');
          return;
        }
        
        logger.info(`📊 [FLOW-CRON] Found ${flowIdeas.length} flow signals, validating...`);
        
        // 🚫 DEDUPLICATION: Check PAPER_POSITIONS (actual trades) not trade_ideas
        // CRITICAL FIX: Previously blocked all symbols with any trade idea (3,453+)
        const existingOpenSymbols = new Set<string>();
        try {
          const portfolios = await storage.getAllPaperPortfolios();
          const quantPortfolio = portfolios.find((p: any) => p.name === 'Quant Bot Auto-Trader');
          if (quantPortfolio) {
            const positions = await storage.getPaperPositionsByPortfolio(quantPortfolio.id);
            positions.filter((p: any) => p.status === 'open').forEach((p: any) => existingOpenSymbols.add(p.symbol.toUpperCase()));
          }
        } catch (e) { /* Allow all if error */ }
        
        // Validate and save flow trades
        let savedCount = 0;
        let rejectedCount = 0;
        let duplicateCount = 0;
        const savedIdeas = [];
        
        for (const idea of flowIdeas) {
          try {
            // Skip duplicates
            if (existingOpenSymbols.has(idea.symbol.toUpperCase())) {
              logger.info(`📊 [FLOW-CRON] Skipped ${idea.symbol} - already has open trade`);
              duplicateCount++;
              continue;
            }
            
            // 🛡️ LAYER 1: Structural validation (with options fields)
            const structureValid = validateTradeStructure({
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
            }, 'Flow-Cron');
            
            if (!structureValid) {
              rejectedCount++;
              continue;
            }
            
            // 🛡️ LAYER 2: Risk validation
            const { validateTradeRisk } = await import('./ai-service');
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
              logger.warn(`📊 [FLOW-CRON] REJECTED ${idea.symbol} - ${validation.reason}`);
              rejectedCount++;
              continue;
            }
            
            // Save trade idea
            const tradeIdea = await storage.createTradeIdea(idea);
            savedIdeas.push(tradeIdea);
            savedCount++;

            logger.info(`✅ [FLOW-CRON] Created flow trade: ${tradeIdea.symbol} ${tradeIdea.direction.toUpperCase()} - Entry=$${tradeIdea.entryPrice}, Target=$${tradeIdea.targetPrice}, R:R=${tradeIdea.riskRewardRatio.toFixed(2)}:1`);

            // 🐋 WHALE FLOW DETECTION - Check if this is institutional-level flow
            const totalPremium = (tradeIdea.entryPrice || 0) * 100; // Premium per contract * 100 shares
            const isWhaleFlow = totalPremium >= 10000; // $10k+ per contract = whale territory
            const isMegaWhale = totalPremium >= 50000; // $50k+ per contract = mega whale

            // 📣 Send individual Discord alert AFTER successful save (prevents ghost alerts)
            const grade = tradeIdea.probabilityBand || '';
            const entryPrice = tradeIdea.entryPrice || 0;
            const DISCORD_ALERT_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-'];
            const isValidGrade = DISCORD_ALERT_GRADES.includes(grade);
            const maxPremiumFor5Contracts = 2.00; // $1000 budget / 5 contracts / 100 shares
            const isAffordable = entryPrice <= maxPremiumFor5Contracts;

            // 🐋 WHALE FLOW ALERT - Send regardless of affordability
            if (isWhaleFlow || isMegaWhale) {
              // Save whale flow to database for tracking
              try {
                await storage.createWhaleFlow({
                  symbol: tradeIdea.symbol,
                  optionType: (tradeIdea.optionType as 'call' | 'put') || 'call',
                  strikePrice: tradeIdea.strikePrice || 0,
                  expiryDate: tradeIdea.expiryDate || '',
                  entryPrice: entryPrice,
                  targetPrice: tradeIdea.targetPrice || 0,
                  stopLoss: tradeIdea.stopLoss || 0,
                  premiumPerContract: totalPremium,
                  isMegaWhale,
                  flowSize: isMegaWhale ? 'mega_whale' : 'whale',
                  grade,
                  confidenceScore: tradeIdea.confidenceScore || 0,
                  direction: tradeIdea.direction as 'long' | 'short',
                  outcomeStatus: 'open',
                  discordNotified: false,
                  tradeIdeaId: tradeIdea.id,
                });
                logger.info(`🐋 [WHALE-DB] Saved whale flow to database: ${tradeIdea.symbol}`);
              } catch (err) {
                logger.error(`🐋 [WHALE-DB] Failed to save whale flow: ${err}`);
              }

              // Send Discord alert
              const { sendWhaleFlowAlertToDiscord } = await import('./discord-service');
              sendWhaleFlowAlertToDiscord({
                symbol: tradeIdea.symbol,
                optionType: (tradeIdea.optionType as 'call' | 'put') || 'call',
                strikePrice: tradeIdea.strikePrice || 0,
                expiryDate: tradeIdea.expiryDate || '',
                entryPrice: entryPrice,
                targetPrice: tradeIdea.targetPrice || 0,
                stopLoss: tradeIdea.stopLoss || 0,
                grade,
                premiumPerContract: totalPremium,
                isMegaWhale,
                direction: tradeIdea.direction as 'long' | 'short',
                confidenceScore: tradeIdea.confidenceScore || 0
              }).catch(err => logger.error(`🐋 [FLOW-CRON] Whale alert failed for ${tradeIdea.symbol}:`, err));
              logger.warn(`🐋 [WHALE-ALERT] ${isMegaWhale ? 'MEGA ' : ''}WHALE FLOW: ${tradeIdea.symbol} ${tradeIdea.optionType?.toUpperCase()} $${tradeIdea.strikePrice} - $${(totalPremium / 1000).toFixed(1)}k premium per contract`);
            }

            // 📣 REGULAR AFFORDABILITY-BASED ALERTS
            if (isValidGrade && isAffordable) {
              const { sendFlowAlertToDiscord, sendPremiumOptionsAlertToDiscord } = await import('./discord-service');
              const targetPercent = tradeIdea.targetPrice && entryPrice 
                ? ((tradeIdea.targetPrice - entryPrice) / entryPrice * 100).toFixed(0)
                : '?';
              const rr = tradeIdea.riskRewardRatio?.toFixed(1) || '?';
              
              // 🎯 PREMIUM A/A+ FORMAT - Use premium template for high-conviction options
              if (['A+', 'A'].includes(grade) && tradeIdea.assetType === 'option') {
                const dte = tradeIdea.expiryDate 
                  ? Math.ceil((new Date(tradeIdea.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : undefined;
                sendPremiumOptionsAlertToDiscord({
                  symbol: tradeIdea.symbol,
                  optionType: (tradeIdea.optionType as 'call' | 'put') || 'call',
                  strikePrice: tradeIdea.strikePrice || 0,
                  expiryDate: tradeIdea.expiryDate || '',
                  entryPrice: entryPrice,
                  targetPrice: tradeIdea.targetPrice || 0,
                  stopLoss: tradeIdea.stopLoss || 0,
                  confidence: tradeIdea.confidenceScore || 90,
                  grade,
                  delta: (tradeIdea as any).delta,
                  dte,
                  tradeType: dte && dte <= 1 ? 'day' : dte && dte <= 7 ? 'swing' : 'swing',
                  signals: (tradeIdea as any).signals || [],
                  source: 'flow'
                }).catch(err => logger.error(`📊 [FLOW-CRON] Premium alert failed for ${tradeIdea.symbol}:`, err));
                logger.info(`📣 [FLOW-CRON] Premium A/A+ alert sent: ${tradeIdea.symbol} ${tradeIdea.optionType?.toUpperCase()} $${tradeIdea.strikePrice} [${grade}]`);
              } else {
                // Standard format for B+ and below
                sendFlowAlertToDiscord({
                  symbol: tradeIdea.symbol,
                  optionType: tradeIdea.optionType || 'call',
                  strikePrice: tradeIdea.strikePrice || 0,
                  expiryDate: tradeIdea.expiryDate || '',
                  entryPrice: entryPrice,
                  targetPrice: tradeIdea.targetPrice || 0,
                  targetPercent,
                  grade,
                  riskReward: rr,
                  isLotto: (tradeIdea as any).isLottoPlay || false
                }).catch(err => logger.error(`📊 [FLOW-CRON] Discord alert failed for ${tradeIdea.symbol}:`, err));
                logger.info(`📣 [FLOW-CRON] Discord alert sent: ${tradeIdea.symbol} ${tradeIdea.optionType?.toUpperCase()} $${tradeIdea.strikePrice} (${grade})`);
              }
            }
            
          } catch (error: any) {
            logger.error(`📊 [FLOW-CRON] Failed to process ${idea.symbol}:`, error);
            rejectedCount++;
          }
        }
        
        // Send Discord notification for batch
        if (savedCount > 0) {
          const { sendBatchSummaryToDiscord } = await import('./discord-service');
          sendBatchSummaryToDiscord(savedIdeas, 'flow').catch(err => 
            logger.error('[FLOW-CRON] Discord notification failed:', err)
          );
        }
        
        logger.info(`📊 [FLOW-CRON] Complete: ${savedCount} trades created, ${rejectedCount} rejected, ${duplicateCount} duplicates skipped`);
        
      } catch (error: any) {
        logger.error('📊 [FLOW-CRON] Flow scan failed:', error);
      }
    });
    
    log('📊 Flow Scanner started - scanning unusual options every 15 minutes during market hours (9:30 AM-4:00 PM ET)');
    
    // CONSOLIDATED BOT SCANNING - Fast opportunistic scanning every 3 minutes
    // DISABLED IN PRODUCTION to prevent memory exhaustion on Render
    // Single unified scan loop that checks for opportunities then monitors positions
    const lastScanTime: Record<string, number> = {};
    const SCAN_COOLDOWN_MS = 6 * 60 * 1000; // 6 minute cooldown between full scans (every other cycle)
    const POSITION_CHECK_MS = 3 * 60 * 1000; // 3 minute cooldown for position monitoring

    // Unified options bot - 6-minute scanning cycle during market hours
    // RE-ENABLED: Now with proper rate limiting and memory optimizations
    cron.default.schedule('*/6 * * * *', async () => {
      try {
        if (!isMarketHoursForFlow()) {
          return;
        }

        const now = Date.now();
        const lastOptionsScan = lastScanTime['options'] || 0;
        const { runAutonomousBotScan, monitorLottoPositions } = await import('./auto-lotto-trader');

        // Always monitor existing positions (quick check)
        await monitorLottoPositions();

        // Only do full scan if cooldown has passed (prevents redundant scanning)
        if (now - lastOptionsScan >= SCAN_COOLDOWN_MS) {
          logger.info('🤖 [UNIFIED-BOT] Running opportunistic OPTIONS scan...');
          await runAutonomousBotScan();
          lastScanTime['options'] = now;

          // 🎰 LOTTO SCANNER - Generate and auto-execute lotto plays
          try {
            const { runLottoScanner } = await import('./lotto-scanner');
            logger.info('🎰 [LOTTO-SCANNER] Running lotto scanner for cheap far-OTM plays...');
            await runLottoScanner();
          } catch (lottoError: any) {
            logger.error('🎰 [LOTTO-SCANNER] Lotto scan failed:', lottoError);
          }
        }

      } catch (error: any) {
        logger.error('🤖 [UNIFIED-BOT] Options scan failed:', error);
      }
    });

    log('🤖 Unified Options Bot ENABLED - 6-minute scanning cycle (9:30 AM-4:00 PM ET)');
    log('🎰 Lotto Scanner ENABLED - hunts cheap far-OTM weeklies during market hours');

    // Crypto Bot - 10-minute scanning cycle (24/7 since crypto markets never close)
    // RE-ENABLED: Staggered 2 minutes after options bot to prevent memory spikes
    cron.default.schedule('2,12,22,32,42,52 * * * *', async () => {
      try {
        const now = Date.now();
        const lastCryptoScan = lastScanTime['crypto'] || 0;

        // Only scan if cooldown has passed
        if (now - lastCryptoScan >= 10 * 60 * 1000) {
          const { runCryptoBotScan, monitorCryptoPositions } = await import('./auto-lotto-trader');

          logger.info('🪙 [CRYPTO-BOT] Running crypto scan...');
          await runCryptoBotScan();
          await monitorCryptoPositions();
          lastScanTime['crypto'] = now;
        }
      } catch (error: any) {
        logger.error('🪙 [CRYPTO-BOT] Scan failed:', error);
      }
    });

    log('🪙 Crypto Bot ENABLED - 10-minute scanning cycle (24/7)');

    // Futures Bot - 10-minute scanning cycle during CME market hours
    // RE-ENABLED: Staggered 4 minutes after options bot
    cron.default.schedule('4,14,24,34,44,54 * * * *', async () => {
      try {
        const now = Date.now();
        const lastFuturesScan = lastScanTime['futures'] || 0;

        // Only scan if cooldown has passed
        if (now - lastFuturesScan >= 10 * 60 * 1000) {
          const { runFuturesBotScan, monitorFuturesPositions } = await import('./auto-lotto-trader');

          logger.info('📈 [FUTURES-BOT] Running futures scan...');
          await runFuturesBotScan();
          await monitorFuturesPositions();
          lastScanTime['futures'] = now;
        }
      } catch (error: any) {
        logger.error('📈 [FUTURES-BOT] Scan failed:', error);
      }
    });

    log('📈 Futures Bot ENABLED - 10-minute scanning cycle (during CME hours)');

    // Prediction Market Scanner - Polymarket arbitrage opportunities every 30 minutes
    cron.default.schedule('*/30 * * * *', async () => {
      try {
        const { runPredictionMarketScan } = await import('./polymarket-service');
        logger.info('[POLYMARKET] Starting prediction market scan...');
        await runPredictionMarketScan();
      } catch (error: any) {
        logger.error('[POLYMARKET] Scan failed:', error);
      }
    });
    
    log('[POLYMARKET] Prediction Market Scanner started - scanning Polymarket every 30 minutes');
    
    // Watchlist Grading - Re-grade all watchlist items every 15 minutes during market hours
    cron.default.schedule('*/15 * * * *', async () => {
      try {
        const now = new Date();
        const nowCT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const hour = nowCT.getHours();
        const dayOfWeek = nowCT.getDay();
        
        // Only grade during market hours (8 AM - 4 PM CT on weekdays)
        if (dayOfWeek === 0 || dayOfWeek === 6 || hour < 8 || hour >= 16) {
          return; // Silent skip outside market hours
        }
        
        const { gradeAllWatchlistItems } = await import('./watchlist-grading-service');
        logger.info('[GRADE] Starting scheduled watchlist grading...');
        const result = await gradeAllWatchlistItems();
        logger.info(`[GRADE] Graded ${result.graded}/${result.total} items`);
      } catch (error: any) {
        logger.error('[GRADE] Scheduled grading failed:', error);
      }
    });
    
    log('📊 Watchlist Grading started - re-grading every 15 minutes during market hours');
    
    // Daily summary to Discord at 8:00 AM CT (before market open)
    let lastDailySummaryDate: string | null = null;
    
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        const now = new Date();
        const nowCT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        
        const hour = nowCT.getHours();
        const minute = nowCT.getMinutes();
        const dayOfWeek = nowCT.getDay();
        const dateKey = nowCT.toISOString().split('T')[0];
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return;
        }
        
        // Check if it's 8:30 AM CT (hour = 8, minute = 30-34 to catch the window)
        const isDailySummaryTime = hour === 8 && minute >= 30 && minute < 35;
        
        if (!isDailySummaryTime) {
          return;
        }
        
        // Check if we already sent today
        if (lastDailySummaryDate === dateKey) {
          return;
        }
        
        lastDailySummaryDate = dateKey;

        logger.info('📨 [DAILY-PREVIEW] Sending 8:30 AM trading preview to Discord...');

        // Send daily preview with market movers and breakouts
        const { sendDailyPreview } = await import('./discord-service');
        const result = await sendDailyPreview();

        if (result.success) {
          logger.info(`📨 [DAILY-PREVIEW] ${result.message}`);
        } else {
          logger.error(`📨 [DAILY-PREVIEW] Failed: ${result.message}`);
        }
        
      } catch (error: any) {
        logger.error('📨 [DAILY-SUMMARY] Failed to send daily summary:', error);
      }
    });
    
    log('📨 Daily Summary started - sending top ideas to Discord at 8:30 AM CT weekdays');
    
    // Next Week Premium Picks to Discord on Sunday at 5:00 PM CT (1 hour before regular watchlist)
    let lastNextWeekPicksDate = '';
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const dayOfWeek = ctTime.getDay(); // 0 = Sunday
        const hour = ctTime.getHours();
        const minute = ctTime.getMinutes();
        const dateKey = ctTime.toISOString().split('T')[0];
        
        // Check if it's Sunday 5:00 PM CT
        const isPremiumPicksTime = dayOfWeek === 0 && hour === 17 && minute >= 0 && minute < 5;
        
        if (!isPremiumPicksTime) {
          return;
        }
        
        // Check if we already sent this week
        if (lastNextWeekPicksDate === dateKey) {
          return;
        }
        
        lastNextWeekPicksDate = dateKey;
        
        logger.info('🎯 [NEXT-WEEK-PICKS] Generating premium picks for next week...');
        
        // Generate picks and send to Discord
        const { generateNextWeekPicks, getNextWeekRange } = await import('./weekly-picks-generator');
        const { sendNextWeekPicksToDiscord } = await import('./discord-service');
        
        const picks = await generateNextWeekPicks();
        const weekRange = getNextWeekRange();
        
        await sendNextWeekPicksToDiscord(picks, weekRange);
        
        logger.info(`🎯 [NEXT-WEEK-PICKS] Sent ${picks.length} premium picks to Discord`);
        
      } catch (error: any) {
        logger.error('🎯 [NEXT-WEEK-PICKS] Failed to generate picks:', error);
      }
    });
    
    log('🎯 Next Week Picks started - sending premium plays to Discord every Sunday at 5:00 PM CT');
    
    // Weekly watchlist summary to Discord on Sunday at 6:00 PM CT
    let lastWeeklyWatchlistDate = '';
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const dayOfWeek = ctTime.getDay(); // 0 = Sunday
        const hour = ctTime.getHours();
        const minute = ctTime.getMinutes();
        const dateKey = ctTime.toISOString().split('T')[0];
        
        // Check if it's Sunday 6:00 PM CT
        const isWeeklyTime = dayOfWeek === 0 && hour === 18 && minute >= 0 && minute < 5;
        
        if (!isWeeklyTime) {
          return;
        }
        
        // Check if we already sent this week
        if (lastWeeklyWatchlistDate === dateKey) {
          return;
        }
        
        lastWeeklyWatchlistDate = dateKey;
        
        logger.info('📋 [WEEKLY-WATCHLIST] Sending weekly watchlist to Discord...');
        
        // Get all watchlist items
        const { db } = await import('./db');
        const { watchlist } = await import('@shared/schema');
        const watchlistItems = await db.select().from(watchlist);
        
        // Send weekly summary
        const { sendWeeklyWatchlistToDiscord } = await import('./discord-service');
        await sendWeeklyWatchlistToDiscord(watchlistItems);
        
        logger.info('📋 [WEEKLY-WATCHLIST] Weekly watchlist sent successfully');
        
      } catch (error: any) {
        logger.error('📋 [WEEKLY-WATCHLIST] Failed to send weekly watchlist:', error);
      }
    });
    
    log('📋 Weekly Watchlist started - sending to Discord every Sunday at 6:00 PM CT');
    
    // ============================================================================
    // PLATFORM REPORT GENERATOR CRON JOBS
    // ============================================================================
    
    // Daily Report: 5:00 PM CT (after market close) on weekdays
    let lastDailyReportDate = '';
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const dayOfWeek = ctTime.getDay(); // 0 = Sunday, 6 = Saturday
        const hour = ctTime.getHours();
        const minute = ctTime.getMinutes();
        const dateKey = ctTime.toISOString().split('T')[0];
        
        // Check if it's weekday 5:00 PM CT (hour = 17, minute = 0-4)
        const isDailyReportTime = dayOfWeek >= 1 && dayOfWeek <= 5 && hour === 17 && minute >= 0 && minute < 5;
        
        if (!isDailyReportTime) {
          return;
        }
        
        // Check if we already generated today
        if (lastDailyReportDate === dateKey) {
          return;
        }
        
        lastDailyReportDate = dateKey;
        
        logger.info('📊 [DAILY-REPORT] Generating end-of-day platform report...');
        
        const { generateDailyReport } = await import('./report-generator');
        const report = await generateDailyReport();
        
        logger.info(`📊 [DAILY-REPORT] Report generated successfully: ${report.id} (${report.totalIdeasGenerated} ideas, ${report.overallWinRate?.toFixed(1)}% win rate)`);
        
      } catch (error: any) {
        logger.error('📊 [DAILY-REPORT] Failed to generate daily report:', error);
      }
    });
    
    log('📊 Daily Report Generator started - generating at 5:00 PM CT weekdays');
    
    // Weekly Report: Sunday 11:59 PM CT
    let lastWeeklyReportDate = '';
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const dayOfWeek = ctTime.getDay(); // 0 = Sunday
        const hour = ctTime.getHours();
        const minute = ctTime.getMinutes();
        const dateKey = ctTime.toISOString().split('T')[0];
        
        // Check if it's Sunday 11:55-11:59 PM CT (hour = 23, minute = 55-59)
        const isWeeklyReportTime = dayOfWeek === 0 && hour === 23 && minute >= 55 && minute <= 59;
        
        if (!isWeeklyReportTime) {
          return;
        }
        
        // Check if we already generated this week
        if (lastWeeklyReportDate === dateKey) {
          return;
        }
        
        lastWeeklyReportDate = dateKey;
        
        logger.info('📈 [WEEKLY-REPORT] Generating weekly platform report...');
        
        const { generateWeeklyReport } = await import('./report-generator');
        const report = await generateWeeklyReport();
        
        logger.info(`📈 [WEEKLY-REPORT] Report generated successfully: ${report.id} (${report.totalIdeasGenerated} ideas, ${report.overallWinRate?.toFixed(1)}% win rate)`);
        
      } catch (error: any) {
        logger.error('📈 [WEEKLY-REPORT] Failed to generate weekly report:', error);
      }
    });
    
    log('📈 Weekly Report Generator started - generating Sundays at 11:59 PM CT');
    
    // Monthly Report: 1st of each month at 12:01 AM CT
    let lastMonthlyReportMonth = '';
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const day = ctTime.getDate();
        const hour = ctTime.getHours();
        const minute = ctTime.getMinutes();
        const monthKey = `${ctTime.getFullYear()}-${String(ctTime.getMonth() + 1).padStart(2, '0')}`;
        
        // Check if it's 1st of month at 12:00-12:05 AM CT
        const isMonthlyReportTime = day === 1 && hour === 0 && minute >= 0 && minute < 5;
        
        if (!isMonthlyReportTime) {
          return;
        }
        
        // Check if we already generated for this month
        if (lastMonthlyReportMonth === monthKey) {
          return;
        }
        
        lastMonthlyReportMonth = monthKey;
        
        // Generate report for previous month
        const prevMonth = ctTime.getMonth() === 0 ? 12 : ctTime.getMonth();
        const prevYear = ctTime.getMonth() === 0 ? ctTime.getFullYear() - 1 : ctTime.getFullYear();
        
        logger.info(`📅 [MONTHLY-REPORT] Generating monthly platform report for ${prevYear}-${String(prevMonth).padStart(2, '0')}...`);
        
        const { generateMonthlyReport } = await import('./report-generator');
        const report = await generateMonthlyReport(prevYear, prevMonth);
        
        logger.info(`📅 [MONTHLY-REPORT] Report generated successfully: ${report.id} (${report.totalIdeasGenerated} ideas, ${report.overallWinRate?.toFixed(1)}% win rate)`);
        
      } catch (error: any) {
        logger.error('📅 [MONTHLY-REPORT] Failed to generate monthly report:', error);
      }
    });
    
    log('📅 Monthly Report Generator started - generating 1st of month at 12:01 AM CT');
    
    // ============================================================================
    // DAILY PREMIUM TRACKING - Track option premiums for watchlist items
    // Runs at 4:30 PM CT (after market close) on weekdays
    // ============================================================================
    let lastPremiumTrackingDate = '';
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const dayOfWeek = ctTime.getDay(); // 0 = Sunday, 6 = Saturday
        const hour = ctTime.getHours();
        const minute = ctTime.getMinutes();
        const dateKey = ctTime.toISOString().split('T')[0];
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return;
        }
        
        // Check if it's 4:30-4:35 PM CT (after market close)
        const isPremiumTrackingTime = hour === 16 && minute >= 30 && minute < 35;
        
        if (!isPremiumTrackingTime) {
          return;
        }
        
        // Check if we already tracked today
        if (lastPremiumTrackingDate === dateKey) {
          return;
        }
        
        lastPremiumTrackingDate = dateKey;
        
        logger.info('💰 [PREMIUM-TRACKER] Starting daily premium tracking for watchlist items...');
        
        const { trackAllPremiums } = await import('./premium-tracking-service');
        const result = await trackAllPremiums();
        
        logger.info(`💰 [PREMIUM-TRACKER] Completed: ${result.tracked} items tracked, ${result.failed} failed`);
        
        // Check for premium opportunities and send alerts
        const { checkPremiumOpportunities } = await import('./premium-tracking-service');
        await checkPremiumOpportunities();
        
      } catch (error: any) {
        logger.error('💰 [PREMIUM-TRACKER] Failed to track premiums:', error);
      }
    });
    
    log('💰 Premium Tracker started - tracking option premiums at 4:30 PM CT weekdays');
    
    // ============================================================================
    // DYNAMIC MOVER DISCOVERY - Find stocks NOT in static universe that are moving
    // Runs every 15 minutes during market hours to catch emerging movers
    // ============================================================================
    cron.default.schedule('*/15 * * * *', async () => {
      try {
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const dayOfWeek = ctTime.getDay();
        const hour = ctTime.getHours();
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return;
        }
        
        // Only run during extended market hours (8 AM - 5 PM CT)
        if (hour < 8 || hour > 17) {
          return;
        }
        
        logger.info('🔍 [MOVER-DISCOVERY] Running dynamic mover discovery scan...');
        
        const { runMoverDiscovery } = await import('./market-scanner');
        const result = await runMoverDiscovery();
        
        if (result.newMovers.length > 0) {
          logger.info(`🔍 [MOVER-DISCOVERY] Found ${result.newMovers.length} new movers not in static universe`);
        }
        
      } catch (error: any) {
        logger.error('🔍 [MOVER-DISCOVERY] Failed to run mover discovery:', error);
      }
    });
    
    log('🔍 Mover Discovery started - scanning for emerging movers every 15 min during market hours');
    
    // ============================================================================
    // BULLISH TREND SCANNER - Track momentum stocks and breakouts
    // Runs every 30 minutes during market hours + initial scan on startup
    // ============================================================================
    
    // Initial scan on startup (delayed by 30 seconds to let server stabilize)
    setTimeout(async () => {
      try {
        logger.info('📈 [BULLISH-TRENDS] Running initial bullish trend scan...');
        const { scanBullishTrends, ingestBullishTrendsToTradeDesk } = await import('./bullish-trend-scanner');
        const results = await scanBullishTrends();
        logger.info(`📈 [BULLISH-TRENDS] Initial scan complete: ${results.length} stocks analyzed`);
        
        // Ingest strong trends to Trade Desk
        logger.info('📈 [BULLISH-TRENDS] Running initial Trade Desk ingestion...');
        const ingestionResult = await ingestBullishTrendsToTradeDesk();
        logger.info(`📈 [BULLISH-TRENDS] Ingested ${ingestionResult.ingested} ideas to Trade Desk (${ingestionResult.skipped} skipped)`);
      } catch (error: any) {
        logger.error('📈 [BULLISH-TRENDS] Initial scan failed:', error);
      }
    }, 30000);
    
    // Schedule regular scans every 30 minutes
    cron.default.schedule('*/30 * * * *', async () => {
      try {
        const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const dayOfWeek = ctTime.getDay();
        const hour = ctTime.getHours();
        
        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return;
        }
        
        // Only run during market hours (8 AM - 5 PM CT)
        if (hour < 8 || hour > 17) {
          return;
        }
        
        logger.info('📈 [BULLISH-TRENDS] Running scheduled bullish trend scan...');
        
        const { scanBullishTrends, ingestBullishTrendsToTradeDesk } = await import('./bullish-trend-scanner');
        const results = await scanBullishTrends();
        
        logger.info(`📈 [BULLISH-TRENDS] Scan complete: ${results.length} stocks analyzed`);
        
        // Ingest strong trends to Trade Desk
        const ingestionResult = await ingestBullishTrendsToTradeDesk();
        logger.info(`📈 [BULLISH-TRENDS] Ingested ${ingestionResult.ingested} ideas to Trade Desk (${ingestionResult.skipped} skipped)`);
        
      } catch (error: any) {
        logger.error('📈 [BULLISH-TRENDS] Scheduled scan failed:', error);
      }
    });
    
    log('📈 Bullish Trend Scanner started - analyzing momentum stocks every 30 min during market hours');

    // ============================================================================
    // AUTO-CLEANUP - Remove stale/expired trades to free memory
    // Runs every hour to keep Trade Desk showing only RELEVANT opportunities
    // ============================================================================
    cron.default.schedule('0 * * * *', async () => {
      try {
        const { storage } = await import('./storage');
        const deletedCount = await storage.cleanupStaleTradeIdeas();
        if (deletedCount > 0) {
          logger.info(`🧹 [AUTO-CLEANUP] Removed ${deletedCount} stale/expired trades from memory`);
        }
      } catch (error: any) {
        logger.error('🧹 [AUTO-CLEANUP] Cleanup failed:', error);
      }
    });

    log('🧹 Auto-Cleanup started - removing stale trades every hour to free memory');
  });
})();
