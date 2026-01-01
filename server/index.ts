import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startWatchlistMonitor } from "./watchlist-monitor";
import { logger } from "./logger";
import { validateTradierAPI } from "./tradier-api";
import { deriveTimingWindows, verifyTimingUniqueness } from "./timing-intelligence";

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
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

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
    
    // Start automated performance validation (checks every 5 minutes)
    const { performanceValidationService } = await import('./performance-validation-service');
    performanceValidationService.start();
    
    // Start automated daily idea generation (9:30 AM CT on weekdays)
    const { autoIdeaGenerator } = await import('./auto-idea-generator');
    autoIdeaGenerator.start();
    log('🤖 Auto Idea Generator started - will generate fresh ideas at 9:30 AM CT weekdays');
    
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
        
        // 🚫 DEDUPLICATION: Get existing open symbols
        const allIdeas = await storage.getAllTradeIdeas();
        const existingOpenSymbols = new Set(
          allIdeas
            .filter((idea: any) => idea.outcomeStatus === 'open')
            .map((idea: any) => idea.symbol.toUpperCase())
        );
        
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
                const optionPremium = optimalStrike.lastPrice;
                hybridIdea.entryPrice = optionPremium;
                hybridIdea.targetPrice = optionPremium * 1.25; // +25% gain
                hybridIdea.stopLoss = optionPremium * 0.96; // -4.0% stop (buffer under 5% max loss cap)
                
                logger.info(`✅ [HYBRID-CRON] ${hybridIdea.symbol} option pricing converted - Stock:$${stockPrice} → Premium:$${optionPremium} (Target:$${hybridIdea.targetPrice.toFixed(2)}, Stop:$${hybridIdea.stopLoss.toFixed(2)})`);
              } else {
                // Fallback: estimate premium as ~5% of stock price
                const estimatedPremium = stockPrice * 0.05;
                hybridIdea.entryPrice = estimatedPremium;
                hybridIdea.targetPrice = estimatedPremium * 1.25;
                hybridIdea.stopLoss = estimatedPremium * 0.96;
                
                logger.warn(`⚠️  [HYBRID-CRON] ${hybridIdea.symbol} using estimated premium (~5% of stock) - Premium:$${estimatedPremium.toFixed(2)}`);
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
        
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return;
        }
        
        // Run at 9:35 AM CT and 1:00 PM CT for afternoon opportunities
        const isQuantTime = (hour === 9 && minute >= 35 && minute < 40) || 
                            (hour === 13 && minute >= 0 && minute < 5);
        
        if (!isQuantTime) {
          return;
        }
        
        if (lastQuantRunDate === dateKey && hour === 9) {
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
        const allExistingIdeas = await storage.getAllTradeIdeas();
        const existingOpenQuantSymbols = new Set(
          allExistingIdeas
            .filter((i: any) => i.outcomeStatus === 'open' && i.source === 'quant')
            .map((i: any) => i.symbol.toUpperCase())
        );
        
        for (const idea of quantIdeas) {
          // Skip duplicates
          if (existingOpenQuantSymbols.has(idea.symbol.toUpperCase())) {
            logger.info(`⏭️  [QUANT-CRON] Skipped ${idea.symbol} - already has open quant trade`);
            continue;
          }
          
          // Options are quarantined for quant (performance was -99%)
          if (idea.assetType === 'option') {
            logger.warn(`🚫 [QUANT-CRON] Skipped ${idea.symbol} option - options quarantined for quant engine`);
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
          const { sendBatchSummaryToDiscord } = await import('./discord-service');
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
    // This ensures fresh ideas are available even outside scheduled times
    (async () => {
      try {
        logger.info('🚀 [QUANT-STARTUP] Running one-time quant generation on server startup...');
        
        const { generateQuantIdeas } = await import('./quant-ideas-generator');
        const { storage: quantStorage } = await import('./storage');
        const marketData = await quantStorage.getAllMarketData();
        const catalysts = await quantStorage.getAllCatalysts();
        
        // Generate 15 quant ideas across different sectors
        const quantIdeas = await generateQuantIdeas(marketData, catalysts, 15, quantStorage, true);
        
        const savedIdeas = [];
        const allExistingIdeas = await quantStorage.getAllTradeIdeas();
        const existingOpenQuantSymbols = new Set(
          allExistingIdeas
            .filter((i: any) => i.outcomeStatus === 'open' && i.source === 'quant')
            .map((i: any) => i.symbol.toUpperCase())
        );
        
        for (const idea of quantIdeas) {
          // Skip duplicates
          if (existingOpenQuantSymbols.has(idea.symbol.toUpperCase())) {
            logger.info(`⏭️  [QUANT-STARTUP] Skipped ${idea.symbol} - already has open quant trade`);
            continue;
          }
          
          // Options are quarantined for quant (performance was -99%)
          if (idea.assetType === 'option') {
            logger.warn(`🚫 [QUANT-STARTUP] Skipped ${idea.symbol} option - options quarantined`);
            continue;
          }
          
          const saved = await quantStorage.createTradeIdea({
            ...idea,
            source: 'quant',
            status: 'published', // Content status (published/draft), not trade outcome
          });
          savedIdeas.push(saved);
        }
        
        if (savedIdeas.length > 0) {
          logger.info(`✅ [QUANT-STARTUP] Generated ${savedIdeas.length} fresh quant trade ideas on startup`);
          const { sendBatchSummaryToDiscord } = await import('./discord-service');
          sendBatchSummaryToDiscord(savedIdeas, 'quant').catch(err => 
            logger.error('[QUANT-STARTUP] Discord notification failed:', err)
          );
        } else {
          logger.warn('⚠️  [QUANT-STARTUP] No new quant ideas generated (may be filtered or duplicates)');
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
        
        // Get existing open trade symbols to avoid duplicates
        const allIdeas = await storage.getAllTradeIdeas();
        const existingOpenSymbols = new Set(
          allIdeas
            .filter((idea: any) => idea.outcomeStatus === 'open')
            .map((idea: any) => idea.symbol.toUpperCase())
        );
        
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
        
        // Get existing open trade symbols to avoid duplicates
        const allIdeas = await storage.getAllTradeIdeas();
        const existingOpenSymbols = new Set(
          allIdeas
            .filter((idea: any) => idea.outcomeStatus === 'open')
            .map((idea: any) => idea.symbol.toUpperCase())
        );
        
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
    
    // Start automated lotto scanner (every 15 minutes during market hours)
    const { runLottoScanner } = await import('./lotto-scanner');
    
    // Schedule lotto scanning every 15 minutes
    cron.default.schedule('*/15 * * * *', async () => {
      try {
        // Check if market is open (9:30 AM - 4:00 PM ET, Mon-Fri)
        if (!isMarketHoursForFlow()) {
          return;
        }
        
        logger.info('🎰 [LOTTO-CRON] Starting automated lotto scan...');
        
        // Scan for lotto plays
        await runLottoScanner();
        
        logger.info('🎰 [LOTTO-CRON] Lotto scan complete');
        
      } catch (error: any) {
        logger.error('🎰 [LOTTO-CRON] Lotto scan failed:', error);
      }
    });
    
    log('🎰 Lotto Scanner started - hunting for cheap far-OTM weeklies every 15 minutes during market hours (9:30 AM-4:00 PM ET)');
    
    // Monitor lotto paper trading positions every 5 minutes during market hours
    cron.default.schedule('*/5 * * * *', async () => {
      try {
        if (!isMarketHoursForFlow()) {
          return;
        }
        
        const { monitorLottoPositions } = await import('./auto-lotto-trader');
        await monitorLottoPositions();
        
      } catch (error: any) {
        logger.error('🤖 [AUTO-LOTTO-CRON] Position monitoring failed:', error);
      }
    });
    
    // Autonomous OPTIONS bot scan every 15 minutes during US market hours
    cron.default.schedule('*/15 * * * *', async () => {
      try {
        if (!isMarketHoursForFlow()) {
          return;
        }
        
        logger.info('🤖 [AUTO-BOT] Starting autonomous OPTIONS market scan...');
        const { runAutonomousBotScan } = await import('./auto-lotto-trader');
        await runAutonomousBotScan();
        
      } catch (error: any) {
        logger.error('🤖 [AUTO-BOT-CRON] Autonomous scan failed:', error);
      }
    });
    
    log('🤖 Auto-Lotto Bot started - scanning options every 15 minutes (9:30 AM-4:00 PM ET)');
    
    // Separate futures bot cron - runs INDEPENDENTLY during CME hours (nearly 24/7)
    cron.default.schedule('*/15 * * * *', async () => {
      try {
        const { isCMEOpen, runFuturesBotScan, monitorFuturesPositions } = await import('./auto-lotto-trader');
        
        if (!isCMEOpen()) {
          logger.info('🔮 [FUTURES-BOT] CME market closed - skipping futures scan');
          return;
        }
        
        logger.info('🔮 [FUTURES-BOT] CME market OPEN - starting futures scan...');
        await runFuturesBotScan();
        await monitorFuturesPositions();
        
        // Also generate futures research ideas (NQ, GC)
        const { generateFuturesIdeas } = await import('./quantitative-engine');
        const futuresIdeas = await generateFuturesIdeas();
        if (futuresIdeas.length > 0) {
          const savedFuturesIdeas = [];
          for (const idea of futuresIdeas) {
            const saved = await storage.createTradeIdea(idea);
            savedFuturesIdeas.push(saved);
          }
          logger.info(`🔮 [FUTURES-BOT] Generated ${futuresIdeas.length} futures research ideas`);
          
          const { sendFuturesTradesToDiscord } = await import('./discord-service');
          await sendFuturesTradesToDiscord(savedFuturesIdeas);
        }
        
      } catch (error: any) {
        logger.error('🔮 [FUTURES-BOT] Futures scan failed:', error);
      }
    });
    
    log('🔮 Futures Bot started - scanning NQ/GC every 15 minutes during CME hours (nearly 24/7)');
    
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
        
        // Check if it's 8:00 AM CT (hour = 8, minute = 0-4 to catch the window)
        const isDailySummaryTime = hour === 8 && minute >= 0 && minute < 5;
        
        if (!isDailySummaryTime) {
          return;
        }
        
        // Check if we already sent today
        if (lastDailySummaryDate === dateKey) {
          return;
        }
        
        lastDailySummaryDate = dateKey;
        
        logger.info('📨 [DAILY-SUMMARY] Sending morning summary to Discord...');
        
        // Get all open ideas
        const allIdeas = await storage.getAllTradeIdeas();
        
        // Send daily summary
        const { sendDailySummaryToDiscord } = await import('./discord-service');
        await sendDailySummaryToDiscord(allIdeas);
        
        logger.info('📨 [DAILY-SUMMARY] Morning summary sent successfully');
        
      } catch (error: any) {
        logger.error('📨 [DAILY-SUMMARY] Failed to send daily summary:', error);
      }
    });
    
    log('📨 Daily Summary started - sending top ideas to Discord at 8:00 AM CT weekdays');
    
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
  });
})();
