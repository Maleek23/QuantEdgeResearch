import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startWatchlistMonitor } from "./watchlist-monitor";
import { logger } from "./logger";
import { validateTradierAPI } from "./tradier-api";

const app = express();

// Trust proxy for accurate rate limiting (Replit sets X-Forwarded-For header)
app.set('trust proxy', true);

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
    
    // Start automated news-driven trade generation (every 15 minutes during market hours)
    const cron = await import('node-cron');
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
            
            // 🛡️ LAYER 1: Structural validation
            const structureValid = validateTradeStructure({
              symbol: idea.symbol,
              assetType: idea.assetType,
              direction: idea.direction,
              entryPrice: idea.entryPrice,
              targetPrice: idea.targetPrice,
              stopLoss: idea.stopLoss
            }, 'Flow-Cron');
            
            if (!structureValid) {
              rejectedCount++;
              continue;
            }
            
            // 🛡️ LAYER 2: Risk validation
            const { validateTradeRisk } = await import('./ai-service');
            const validation = validateTradeRisk({
              symbol: idea.symbol,
              assetType: idea.assetType,
              direction: idea.direction,
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
  });
})();
