/**
 * WORKER PROCESS — Heavy Background Services
 *
 * This is Process 2 of 2 in production. It runs:
 * - All trade idea generators (AI, Quant, Hybrid, News)
 * - All market scanners (Surge, Bullish Trends, Options Flow, etc.)
 * - All intelligence services (Convergence, Catalyst, Self-Learning)
 * - All automated trading (Trade Executor, Lotto Scanner, Crypto/Futures bots)
 * - All cron jobs (reports, Discord alerts, cleanup, etc.)
 *
 * Expected memory: 1-2GB during market hours
 * Expected CPU: High during scans, low between scans
 *
 * This process has NO HTTP server. It reads/writes to the same
 * Neon PostgreSQL database as the web process.
 *
 * At 4:10 PM ET, this process exits and PM2 restarts it.
 * It comes back in lightweight mode (no heavy services until 9:25 AM ET).
 */

import "dotenv/config";
import { runStartupCheck } from "./startup-check";
runStartupCheck();

import { logger } from "./logger";
import { startWatchlistGradingScheduler } from "./watchlist-grading-service";
import { validateTradierAPI } from "./tradier-api";
import { deriveTimingWindows, verifyTimingUniqueness } from "./timing-intelligence";

function log(msg: string) {
  const now = new Date().toLocaleTimeString('en-US');
  console.log(`${now} [worker] ${msg}`);
}

// ========================================================================
// MARKET-HOURS-AWARE SERVICE MANAGEMENT
// ========================================================================
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function isMarketCurrentlyOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const isWeekday = day >= 1 && day <= 5;
  const timeInMinutes = hour * 60 + minute;
  // 9:00 AM - 4:30 PM ET
  return isWeekday && timeInMinutes >= 540 && timeInMinutes <= 990;
}

(async () => {
  log('🔧 Worker process starting...');

  await validateTradierAPI();

  // ── Heavy services: ONLY during market hours ─────────────────────────
  let heavyServicesStarted = false;

  async function startHeavyServices() {
    if (heavyServicesStarted) return;
    heavyServicesStarted = true;
    log('🚀 Starting heavy services (market is open)...');

    try {
      startWatchlistGradingScheduler();
      log('📊 Watchlist Grading Scheduler started');

      await delay(2000);

      const { autoIdeaGenerator } = await import('./auto-idea-generator');
      autoIdeaGenerator.start();
      log('🤖 Auto Idea Generator started');

      const { performanceValidationService } = await import('./performance-validation-service');
      performanceValidationService.start();

      const { pennyScanner } = await import('./penny-scanner');
      pennyScanner.start();
      log('🚀 Penny Moonshot Scanner started');

      await delay(3000);

      const { startBullishTrendScanner } = await import('./bullish-trend-scanner');
      startBullishTrendScanner();
      log('📈 Bullish Trend Scanner started');

      const { startMorningPreviewScheduler } = await import('./morning-preview-service');
      startMorningPreviewScheduler();
      log('☀️ Morning Preview Scheduler started');

      const { startAttentionTrackingService } = await import('./attention-tracking-service');
      startAttentionTrackingService();
      log('🔥 Symbol Attention Tracker started');

      await delay(3000);

      const { startPreMarketSurgeDetector } = await import('./pre-market-surge-detector');
      startPreMarketSurgeDetector();
      log('🌅 Pre-Market Surge Detector started');

      await delay(5000);

      const { startCatalystPolling } = await import('./catalyst-intelligence-service');
      startCatalystPolling(30);
      log('📋 Catalyst Intelligence polling started');

      const { startPreMoveScanner } = await import('./pre-move-detection-service');
      startPreMoveScanner();
      log('🔮 Pre-Move Detection Scanner started');

      await delay(5000);

      const { selfLearning } = await import('./self-learning-service');
      selfLearning.start();
      log('🧠 Self-Learning Service started');

      // Trade Desk Executor (Alpaca auto-trading)
      const { startTradeExecutor } = await import('./trade-desk-executor');
      const { isAlpacaConfigured, initializeAlpaca } = await import('./alpaca-trading');
      if (isAlpacaConfigured()) {
        const alpacaReady = await initializeAlpaca();
        if (alpacaReady) {
          await startTradeExecutor();
          log('🤖 Trade Desk Executor started');
          const { startIntelligentMonitoring } = await import('./position-manager');
          await startIntelligentMonitoring();
          log('🧠 Intelligent Position Manager started');
        }
      }

      await delay(5000);

      const { startConvergenceEngine } = await import('./convergence-engine');
      startConvergenceEngine();
      log('🎯 Convergence Engine started');

      const { startNewsOptionsPipeline } = await import('./news-options-pipeline');
      startNewsOptionsPipeline();
      log('📰 News→Options Pipeline started');

      const { startPopularTickersScanner } = await import('./popular-tickers-scanner');
      startPopularTickersScanner();
      log('🌟 Popular Tickers Scanner started');

      log('✅ All heavy services started (staggered over ~30s)');
    } catch (err) {
      logger.error('❌ Error starting heavy services:', err);
    }
  }

  // Check if market is currently open
  if (isMarketCurrentlyOpen()) {
    log('📈 Market is OPEN — starting heavy services in 10s...');
    setTimeout(() => startHeavyServices(), 10000);
  } else {
    log('🌙 Market is CLOSED — running in lightweight mode');
    log('🌙 Heavy services will auto-start at 9:25 AM ET on next market day');
  }

  // ── Cron: Start heavy services at market open ──────────────────────────
  const cron = await import('node-cron');
  cron.default.schedule('25 9 * * 1-5', () => {
    log('⏰ Market open cron triggered — starting heavy services...');
    startHeavyServices();
  }, { timezone: 'America/New_York' });

  // ── Cron: Restart process at market close to free memory ───────────────
  cron.default.schedule('10 16 * * 1-5', () => {
    log('🌙 Market closed — restarting process to free memory...');
    setTimeout(() => {
      log('🔄 Exiting for PM2 restart (lightweight mode)...');
      process.exit(0);
    }, 5000);
  }, { timezone: 'America/New_York' });

  // ====================================================================
  // ALL CRON JOBS (from original index.ts)
  // These use dynamic imports and have their own market-hours guards.
  // They only consume memory when their specific cron window fires.
  // ====================================================================

  // Hybrid idea generation (9:45 AM CT weekdays)
  let lastHybridRunDate: string | null = null;
  let isHybridGenerating = false;

  cron.default.schedule('*/5 * * * *', async () => {
    try {
      if (isHybridGenerating) return;

      const now = new Date();
      const nowCT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const hour = nowCT.getHours();
      const minute = nowCT.getMinutes();
      const dayOfWeek = nowCT.getDay();
      const dateKey = nowCT.toISOString().split('T')[0];

      if (dayOfWeek === 0 || dayOfWeek === 6) return;
      const isHybridTime = hour === 9 && minute >= 45 && minute < 50;
      if (!isHybridTime) return;
      if (lastHybridRunDate === dateKey) return;

      isHybridGenerating = true;
      lastHybridRunDate = dateKey;

      logger.info(`🔀 [HYBRID-CRON] Starting automated hybrid generation at 9:45 AM CT`);

      const { storage } = await import('./storage');
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

      const { generateHybridIdeas, validateTradeRisk } = await import('./ai-service');
      const { validateAndLog: validateTradeStructure } = await import('./trade-validation');
      const hybridIdeas = await generateHybridIdeas("Market open conditions with quant + AI fusion");

      logger.info(`🔀 [HYBRID-SHADOW] Generated ${hybridIdeas.length} candidate trades BEFORE validation`);

      const savedIdeas: any[] = [];
      const rejectedIdeas: Array<{symbol: string, reason: string}> = [];
      const metrics = { candidatesGenerated: hybridIdeas.length, dedupedCount: 0, earningsBlockedCount: 0, optionsQuarantinedCount: 0, structuralFailCount: 0, riskFailCount: 0, passedCount: 0 };

      for (const hybridIdea of hybridIdeas) {
        if (existingOpenSymbols.has(hybridIdea.symbol.toUpperCase())) { metrics.dedupedCount++; continue; }

        if (hybridIdea.assetType === 'stock' || hybridIdea.assetType === 'option') {
          const { shouldBlockSymbol } = await import('./earnings-service');
          const isBlocked = await shouldBlockSymbol(hybridIdea.symbol, false);
          if (isBlocked) { rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: 'Earnings within 2 days' }); metrics.earningsBlockedCount++; continue; }
        }

        if (hybridIdea.assetType === 'option') {
          try {
            const { findOptimalStrike } = await import('./tradier-api');
            const stockPrice = hybridIdea.entryPrice;
            const optimalStrike = await findOptimalStrike(hybridIdea.symbol, stockPrice, hybridIdea.direction, process.env.TRADIER_API_KEY);
            if (optimalStrike && optimalStrike.lastPrice) {
              const optionPremium = optimalStrike.lastPrice;
              const expDate = hybridIdea.expiryDate;
              const daysToExpiry = expDate ? Math.max(1, Math.ceil((new Date(expDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 7;
              let targetMult = daysToExpiry <= 3 ? 2.0 : daysToExpiry <= 7 ? 1.75 : daysToExpiry <= 14 ? 1.60 : 1.50;
              hybridIdea.entryPrice = optionPremium;
              hybridIdea.targetPrice = optionPremium * targetMult;
              hybridIdea.stopLoss = optionPremium * 0.50;
            } else {
              const estimatedPremium = stockPrice * 0.05;
              hybridIdea.entryPrice = estimatedPremium;
              hybridIdea.targetPrice = estimatedPremium * 1.75;
              hybridIdea.stopLoss = estimatedPremium * 0.50;
            }
          } catch (error) {
            rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: 'Failed to fetch option premium' });
            metrics.optionsQuarantinedCount++;
            continue;
          }
        }

        const structureValid = validateTradeStructure({ symbol: hybridIdea.symbol, assetType: hybridIdea.assetType, direction: hybridIdea.direction, entryPrice: hybridIdea.entryPrice, targetPrice: hybridIdea.targetPrice, stopLoss: hybridIdea.stopLoss }, 'Hybrid-Cron');
        if (!structureValid) { rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: 'Structural validation failed' }); metrics.structuralFailCount++; continue; }

        const validation = validateTradeRisk(hybridIdea);
        if (!validation.isValid) { rejectedIdeas.push({ symbol: hybridIdea.symbol, reason: validation.reason || 'Unknown' }); metrics.riskFailCount++; continue; }

        const { entryPrice, targetPrice, stopLoss } = hybridIdea;
        const riskRewardRatio = (targetPrice - entryPrice) / (entryPrice - stopLoss);
        const confidenceScore = 55 + (validation.metrics?.riskRewardRatio ? Math.min(10, validation.metrics.riskRewardRatio * 5) : 0);

        const qualitySignals: string[] = ['Hybrid (AI+Quant)'];
        if (riskRewardRatio >= 2.0) qualitySignals.push(`R:R ${riskRewardRatio.toFixed(1)}:1`);
        if ((hybridIdea as any).qualitySignals?.length) qualitySignals.push(...(hybridIdea as any).qualitySignals.slice(0, 3));

        const timingWindows = deriveTimingWindows({ symbol: hybridIdea.symbol, assetType: hybridIdea.assetType, direction: hybridIdea.direction, entryPrice, targetPrice, stopLoss, analysis: hybridIdea.analysis, catalyst: hybridIdea.catalyst, confidenceScore, riskRewardRatio });

        const tradeIdea = await storage.createTradeIdea({
          symbol: hybridIdea.symbol, assetType: hybridIdea.assetType, direction: hybridIdea.direction,
          holdingPeriod: timingWindows.holdingPeriodType, entryPrice, targetPrice, stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10, catalyst: hybridIdea.catalyst,
          analysis: hybridIdea.analysis, liquidityWarning: hybridIdea.entryPrice < 5,
          sessionContext: hybridIdea.sessionContext, timestamp: new Date().toISOString(),
          entryValidUntil: timingWindows.entryValidUntil, exitBy: timingWindows.exitBy,
          expiryDate: hybridIdea.expiryDate || null,
          strikePrice: hybridIdea.assetType === 'option' ? ((hybridIdea as any).strikePrice || hybridIdea.entryPrice * (hybridIdea.direction === 'long' ? 1.02 : 0.98)) : null,
          optionType: hybridIdea.assetType === 'option' ? ((hybridIdea as any).optionType || (hybridIdea.direction === 'long' ? 'call' : 'put')) : null,
          source: 'hybrid', confidenceScore, qualitySignals,
          volatilityRegime: timingWindows.volatilityRegime, sessionPhase: timingWindows.sessionPhase,
          trendStrength: timingWindows.trendStrength, entryWindowMinutes: timingWindows.entryWindowMinutes,
          exitWindowMinutes: timingWindows.exitWindowMinutes, timingConfidence: timingWindows.timingConfidence,
          targetHitProbability: timingWindows.targetHitProbability,
          isLottoPlay: (hybridIdea as any).isLottoPlay || false,
        });
        savedIdeas.push(tradeIdea);
        metrics.passedCount++;
      }

      if (savedIdeas.length > 0) {
        verifyTimingUniqueness(savedIdeas.map((idea: any) => ({ symbol: idea.symbol, entryValidUntil: idea.entryValidUntil || '', exitBy: idea.exitBy || '' })));
        const { sendBatchSummaryToDiscord } = await import('./discord-service');
        sendBatchSummaryToDiscord(savedIdeas, 'hybrid').catch(err => logger.error('[HYBRID-CRON] Discord failed:', err));
      }

      logger.info(`🔀 [HYBRID-CRON] Result: ${savedIdeas.length} saved, ${rejectedIdeas.length} rejected`);
    } catch (error: any) {
      logger.error('🔀 [HYBRID-CRON] Failed:', error);
    } finally {
      isHybridGenerating = false;
    }
  });
  log('🔀 Hybrid Generator scheduled (9:45 AM CT weekdays)');

  // Quant idea generation (9:35 AM CT + 1:00 PM CT weekdays)
  let lastQuantRunDate: string | null = null;
  let isQuantGenerating = false;

  cron.default.schedule('*/5 * * * *', async () => {
    try {
      if (isQuantGenerating) return;
      const now = new Date();
      const nowCT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const hour = nowCT.getHours();
      const minute = nowCT.getMinutes();
      const dayOfWeek = nowCT.getDay();
      const dateKey = nowCT.toISOString().split('T')[0];

      const isDevelopment = process.env.NODE_ENV !== 'production';
      if (!isDevelopment && (dayOfWeek === 0 || dayOfWeek === 6)) return;

      const isQuantTime = isDevelopment
        ? (minute >= 0 && minute < 5) || (minute >= 30 && minute < 35)
        : ((hour === 9 && minute >= 35 && minute < 40) || (hour === 13 && minute >= 0 && minute < 5));
      if (!isQuantTime) return;
      if (!isDevelopment && lastQuantRunDate === dateKey && hour === 9) return;

      isQuantGenerating = true;
      if (hour === 9) lastQuantRunDate = dateKey;

      logger.info(`📊 [QUANT-CRON] Starting at ${hour}:${minute.toString().padStart(2, '0')} CT`);

      const { generateQuantIdeas } = await import('./quant-ideas-generator');
      const { storage } = await import('./storage');
      const marketData = await storage.getAllMarketData();
      const catalysts = await storage.getAllCatalysts();
      const quantIdeas = await generateQuantIdeas(marketData, catalysts, 10, storage, true);

      const savedIdeas: any[] = [];
      const { getOptionsPortfolio } = await import('./auto-lotto-trader');
      const portfolio = await getOptionsPortfolio();
      const openPositionKeys = new Set<string>();
      if (portfolio) {
        const openPositions = await storage.getPaperPositionsByPortfolio(portfolio.id);
        for (const pos of openPositions) {
          if (pos.status === 'open') openPositionKeys.add(`${pos.symbol}:${pos.optionType || ''}:${pos.strikePrice || ''}`.toUpperCase());
        }
      }

      for (const idea of quantIdeas) {
        const ideaKey = `${idea.symbol}:${idea.optionType || ''}:${idea.strikePrice || ''}`.toUpperCase();
        if (openPositionKeys.has(ideaKey)) continue;
        const saved = await storage.createTradeIdea({ ...idea, source: 'quant', status: 'published' });
        savedIdeas.push(saved);
      }

      if (savedIdeas.length > 0) {
        logger.info(`✅ [QUANT-CRON] Generated ${savedIdeas.length} quant trade ideas`);
        const { sendBatchSummaryToDiscord } = await import('./discord-service');

        // Auto-execute trades
        const { executeTradeIdea } = await import('./paper-trading-service');
        const execPortfolio = await getOptionsPortfolio();
        if (execPortfolio) {
          let tradesExecuted = 0;
          for (const idea of savedIdeas) {
            if (idea.assetType === 'option' && idea.strikePrice && idea.optionType) {
              try {
                const result = await executeTradeIdea(execPortfolio.id, idea);
                if (result.success && result.position) tradesExecuted++;
              } catch (execErr) { logger.error(`[QUANT-CRON] Exec error:`, execErr); }
            }
          }
          logger.info(`🎯 [QUANT-CRON] AUTO-EXECUTED ${tradesExecuted}/${savedIdeas.length} trades`);
        }
        sendBatchSummaryToDiscord(savedIdeas, 'quant').catch(err => logger.error('[QUANT-CRON] Discord failed:', err));
      }
    } catch (error: any) {
      logger.error('📊 [QUANT-CRON] Failed:', error);
    } finally {
      isQuantGenerating = false;
    }
  });
  log('📊 Quant Generator scheduled (9:35 AM + 1:00 PM CT weekdays)');

  // News-driven trade generation (every 15 min during market hours)
  const { fetchBreakingNews, getNewsServiceStatus } = await import('./news-service');
  const { generateTradeIdeasFromNews } = await import('./ai-service');
  const { storage } = await import('./storage');

  cron.default.schedule('*/15 * * * *', async () => {
    try {
      const now = new Date();
      const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const hour = nyTime.getHours();
      const dayOfWeek = nyTime.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) return;
      if (hour < 8 || hour >= 20) return;

      const status = getNewsServiceStatus();
      if (!status.isHealthy || status.quotaRemaining < 10) return;

      const breakingNews = await fetchBreakingNews(undefined, undefined, 20);
      if (breakingNews.length === 0) return;

      const existingOpenSymbols = new Set<string>();
      try {
        const portfolios = await storage.getAllPaperPortfolios();
        const quantPortfolio = portfolios.find((p: any) => p.name === 'Quant Bot Auto-Trader');
        if (quantPortfolio) {
          const positions = await storage.getPaperPositionsByPortfolio(quantPortfolio.id);
          positions.filter((p: any) => p.status === 'open').forEach((p: any) => existingOpenSymbols.add(p.symbol.toUpperCase()));
        }
      } catch (e) { /* Allow all */ }

      let generatedCount = 0;
      for (const article of breakingNews.slice(0, 3)) {
        try {
          if (existingOpenSymbols.has(article.primaryTicker.toUpperCase())) continue;
          const aiIdea = await generateTradeIdeasFromNews(article);
          if (!aiIdea) continue;
          const { entryPrice, targetPrice, stopLoss } = aiIdea;
          const riskRewardRatio = aiIdea.direction === 'long' ? (targetPrice - entryPrice) / (entryPrice - stopLoss) : (entryPrice - targetPrice) / (stopLoss - entryPrice);
          await storage.createTradeIdea({
            symbol: aiIdea.symbol, assetType: aiIdea.assetType, direction: aiIdea.direction, holdingPeriod: 'day',
            entryPrice, targetPrice, stopLoss, riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
            catalyst: aiIdea.catalyst, catalystSourceUrl: article.url, analysis: aiIdea.analysis,
            liquidityWarning: aiIdea.entryPrice < 5, sessionContext: aiIdea.sessionContext,
            timestamp: new Date().toISOString(), source: 'news', isNewsCatalyst: true,
            expiryDate: aiIdea.expiryDate || null, strikePrice: (aiIdea as any).strikePrice || null,
            optionType: (aiIdea as any).optionType || null, isLottoPlay: (aiIdea as any).isLottoPlay || false,
          });
          generatedCount++;
        } catch (error: any) { logger.error(`📰 [NEWS-CRON] Article failed:`, error); }
      }
      if (generatedCount > 0) logger.info(`📰 [NEWS-CRON] Generated ${generatedCount} news trades`);
    } catch (error: any) { logger.error('📰 [NEWS-CRON] Failed:', error); }
  });
  log('📰 News Monitor scheduled (every 15 min during 8AM-8PM ET)');

  // Options flow scanner (every 15 min during market hours)
  const { scanUnusualOptionsFlow, isMarketHoursForFlow } = await import('./flow-scanner');
  const { validateAndLog: validateTradeStructure } = await import('./trade-validation');

  cron.default.schedule('*/15 * * * *', async () => {
    try {
      if (!isMarketHoursForFlow()) return;
      logger.info('📊 [FLOW-CRON] Starting automated flow scan...');
      const flowIdeas = await scanUnusualOptionsFlow();
      if (flowIdeas.length === 0) return;

      const existingOpenSymbols = new Set<string>();
      try {
        const portfolios = await storage.getAllPaperPortfolios();
        const qp = portfolios.find((p: any) => p.name === 'Quant Bot Auto-Trader');
        if (qp) {
          const positions = await storage.getPaperPositionsByPortfolio(qp.id);
          positions.filter((p: any) => p.status === 'open').forEach((p: any) => existingOpenSymbols.add(p.symbol.toUpperCase()));
        }
      } catch (e) { /* Allow all */ }

      let savedCount = 0;
      for (const idea of flowIdeas) {
        try {
          if (existingOpenSymbols.has(idea.symbol.toUpperCase())) continue;
          const structureValid = validateTradeStructure({
            symbol: idea.symbol, assetType: idea.assetType as any, direction: idea.direction as any,
            entryPrice: idea.entryPrice, targetPrice: idea.targetPrice, stopLoss: idea.stopLoss,
            strikePrice: idea.strikePrice ?? undefined, expiryDate: idea.expiryDate ?? undefined,
            optionType: idea.optionType as any
          }, 'Flow-Cron');
          if (!structureValid) continue;

          const { validateTradeRisk } = await import('./ai-service');
          const validation = validateTradeRisk({
            symbol: idea.symbol, assetType: idea.assetType as any, direction: idea.direction as any,
            entryPrice: idea.entryPrice, targetPrice: idea.targetPrice, stopLoss: idea.stopLoss,
            catalyst: idea.catalyst || '', analysis: idea.analysis || '', sessionContext: idea.sessionContext || ''
          });
          if (!validation.isValid) continue;

          await storage.createTradeIdea(idea);
          savedCount++;
        } catch (error: any) { logger.error(`📊 [FLOW-CRON] Failed:`, error); }
      }
      logger.info(`📊 [FLOW-CRON] Complete: ${savedCount} trades created`);
    } catch (error: any) { logger.error('📊 [FLOW-CRON] Failed:', error); }
  });
  log('📊 Flow Scanner scheduled (every 15 min during market hours)');

  // Unified options bot (6-min scanning during market hours)
  cron.default.schedule('*/6 * * * *', async () => {
    try {
      if (!isMarketHoursForFlow()) return;
      const { runAutonomousBotScan, monitorLottoPositions } = await import('./auto-lotto-trader');
      await monitorLottoPositions();
      logger.info('🤖 [UNIFIED-BOT] Running options scan...');
      await runAutonomousBotScan();
      try {
        const { runLottoScanner } = await import('./lotto-scanner');
        await runLottoScanner();
      } catch (e) { logger.error('🎰 Lotto scan failed:', e); }
    } catch (error: any) { logger.error('🤖 [UNIFIED-BOT] Failed:', error); }
  });
  log('🤖 Unified Options Bot scheduled (6-min during market hours)');

  // Crypto bot (10-min scanning, 24/7)
  const lastScanTime: Record<string, number> = {};
  cron.default.schedule('2,12,22,32,42,52 * * * *', async () => {
    try {
      const now = Date.now();
      if (now - (lastScanTime['crypto'] || 0) >= 10 * 60 * 1000) {
        const { runCryptoBotScan, monitorCryptoPositions } = await import('./auto-lotto-trader');
        await runCryptoBotScan();
        await monitorCryptoPositions();
        lastScanTime['crypto'] = now;
      }
    } catch (error: any) { logger.error('🪙 [CRYPTO-BOT] Failed:', error); }
  });
  log('🪙 Crypto Bot scheduled (10-min, 24/7)');

  // Futures bot (10-min during CME hours)
  cron.default.schedule('4,14,24,34,44,54 * * * *', async () => {
    try {
      const now = Date.now();
      if (now - (lastScanTime['futures'] || 0) >= 10 * 60 * 1000) {
        const { runFuturesBotScan, monitorFuturesPositions } = await import('./auto-lotto-trader');
        await runFuturesBotScan();
        await monitorFuturesPositions();
        lastScanTime['futures'] = now;
      }
    } catch (error: any) { logger.error('📈 [FUTURES-BOT] Failed:', error); }
  });
  log('📈 Futures Bot scheduled (10-min during CME hours)');

  // Polymarket (every 30 min)
  cron.default.schedule('*/30 * * * *', async () => {
    try {
      const { runPredictionMarketScan } = await import('./polymarket-service');
      await runPredictionMarketScan();
    } catch (error: any) { logger.error('[POLYMARKET] Failed:', error); }
  });
  log('[POLYMARKET] Prediction Market Scanner scheduled');

  // Watchlist grading (every 15 min during market hours)
  cron.default.schedule('*/15 * * * *', async () => {
    try {
      const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const hour = nowCT.getHours();
      const dayOfWeek = nowCT.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6 || hour < 8 || hour >= 16) return;
      const { gradeAllWatchlistItems } = await import('./watchlist-grading-service');
      const result = await gradeAllWatchlistItems();
      logger.info(`[GRADE] Graded ${result.graded}/${result.total} items`);
    } catch (error: any) { logger.error('[GRADE] Failed:', error); }
  });
  log('📊 Watchlist Grading scheduled (15 min during market hours)');

  // Earnings scanner (hourly during market hours)
  cron.default.schedule('0 * * * *', async () => {
    try {
      const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (nowCT.getDay() === 0 || nowCT.getDay() === 6 || nowCT.getHours() < 8 || nowCT.getHours() >= 16) return;
      const { scanEarningsOpportunities } = await import('./earnings-trade-scanner');
      await scanEarningsOpportunities();
    } catch (error: any) { logger.error('[EARNINGS] Failed:', error); }
  });
  log('📅 Earnings Scanner scheduled (hourly during market hours)');

  // Daily summary to Discord (8:30 AM CT)
  let lastDailySummaryDate: string | null = null;
  cron.default.schedule('*/5 * * * *', async () => {
    try {
      const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      const hour = nowCT.getHours();
      const minute = nowCT.getMinutes();
      const dayOfWeek = nowCT.getDay();
      const dateKey = nowCT.toISOString().split('T')[0];
      if (dayOfWeek === 0 || dayOfWeek === 6) return;
      if (!(hour === 8 && minute >= 30 && minute < 35)) return;
      if (lastDailySummaryDate === dateKey) return;
      lastDailySummaryDate = dateKey;
      const { sendDailyPreview } = await import('./discord-service');
      await sendDailyPreview();
    } catch (error: any) { logger.error('📨 [DAILY-SUMMARY] Failed:', error); }
  });
  log('📨 Daily Summary scheduled (8:30 AM CT weekdays)');

  // Next week picks (Sunday 5 PM CT)
  let lastNextWeekPicksDate = '';
  cron.default.schedule('*/5 * * * *', async () => {
    try {
      const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (!(ctTime.getDay() === 0 && ctTime.getHours() === 17 && ctTime.getMinutes() < 5)) return;
      const dateKey = ctTime.toISOString().split('T')[0];
      if (lastNextWeekPicksDate === dateKey) return;
      lastNextWeekPicksDate = dateKey;
      const { generateNextWeekPicks, getNextWeekRange } = await import('./weekly-picks-generator');
      const { sendNextWeekPicksToDiscord } = await import('./discord-service');
      const picks = await generateNextWeekPicks();
      await sendNextWeekPicksToDiscord(picks, getNextWeekRange());
    } catch (error: any) { logger.error('🎯 [NEXT-WEEK-PICKS] Failed:', error); }
  });

  // Weekly watchlist (Sunday 6 PM CT)
  let lastWeeklyWatchlistDate = '';
  cron.default.schedule('*/5 * * * *', async () => {
    try {
      const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (!(ctTime.getDay() === 0 && ctTime.getHours() === 18 && ctTime.getMinutes() < 5)) return;
      const dateKey = ctTime.toISOString().split('T')[0];
      if (lastWeeklyWatchlistDate === dateKey) return;
      lastWeeklyWatchlistDate = dateKey;
      const { db } = await import('./db');
      const { watchlist } = await import('@shared/schema');
      const watchlistItems = await db.select().from(watchlist);
      const { sendWeeklyWatchlistToDiscord } = await import('./discord-service');
      await sendWeeklyWatchlistToDiscord(watchlistItems);
    } catch (error: any) { logger.error('📋 [WEEKLY-WATCHLIST] Failed:', error); }
  });

  // Daily report (5 PM CT weekdays)
  let lastDailyReportDate = '';
  cron.default.schedule('*/5 * * * *', async () => {
    try {
      const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (!(ctTime.getDay() >= 1 && ctTime.getDay() <= 5 && ctTime.getHours() === 17 && ctTime.getMinutes() < 5)) return;
      const dateKey = ctTime.toISOString().split('T')[0];
      if (lastDailyReportDate === dateKey) return;
      lastDailyReportDate = dateKey;
      const { generateDailyReport } = await import('./report-generator');
      await generateDailyReport();
    } catch (error: any) { logger.error('📊 [DAILY-REPORT] Failed:', error); }
  });

  // Weekly report (Sunday 11:55 PM CT)
  let lastWeeklyReportDate = '';
  cron.default.schedule('*/5 * * * *', async () => {
    try {
      const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (!(ctTime.getDay() === 0 && ctTime.getHours() === 23 && ctTime.getMinutes() >= 55)) return;
      const dateKey = ctTime.toISOString().split('T')[0];
      if (lastWeeklyReportDate === dateKey) return;
      lastWeeklyReportDate = dateKey;
      const { generateWeeklyReport } = await import('./report-generator');
      await generateWeeklyReport();
    } catch (error: any) { logger.error('📈 [WEEKLY-REPORT] Failed:', error); }
  });

  // Monthly report (1st of month 12 AM CT)
  let lastMonthlyReportMonth = '';
  cron.default.schedule('*/5 * * * *', async () => {
    try {
      const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (!(ctTime.getDate() === 1 && ctTime.getHours() === 0 && ctTime.getMinutes() < 5)) return;
      const monthKey = `${ctTime.getFullYear()}-${String(ctTime.getMonth() + 1).padStart(2, '0')}`;
      if (lastMonthlyReportMonth === monthKey) return;
      lastMonthlyReportMonth = monthKey;
      const prevMonth = ctTime.getMonth() === 0 ? 12 : ctTime.getMonth();
      const prevYear = ctTime.getMonth() === 0 ? ctTime.getFullYear() - 1 : ctTime.getFullYear();
      const { generateMonthlyReport } = await import('./report-generator');
      await generateMonthlyReport(prevYear, prevMonth);
    } catch (error: any) { logger.error('📅 [MONTHLY-REPORT] Failed:', error); }
  });

  // Premium tracking (4:30 PM CT weekdays)
  let lastPremiumTrackingDate = '';
  cron.default.schedule('*/5 * * * *', async () => {
    try {
      const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (ctTime.getDay() === 0 || ctTime.getDay() === 6) return;
      if (!(ctTime.getHours() === 16 && ctTime.getMinutes() >= 30 && ctTime.getMinutes() < 35)) return;
      const dateKey = ctTime.toISOString().split('T')[0];
      if (lastPremiumTrackingDate === dateKey) return;
      lastPremiumTrackingDate = dateKey;
      const { trackAllPremiums, checkPremiumOpportunities } = await import('./premium-tracking-service');
      await trackAllPremiums();
      await checkPremiumOpportunities();
    } catch (error: any) { logger.error('💰 [PREMIUM-TRACKER] Failed:', error); }
  });

  // Mover discovery (every 15 min during market hours)
  cron.default.schedule('*/15 * * * *', async () => {
    try {
      const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (ctTime.getDay() === 0 || ctTime.getDay() === 6) return;
      if (ctTime.getHours() < 8 || ctTime.getHours() > 17) return;
      const { runMoverDiscovery } = await import('./market-scanner');
      await runMoverDiscovery();
    } catch (error: any) { logger.error('🔍 [MOVER-DISCOVERY] Failed:', error); }
  });

  // Bullish trend scanner (every 30 min during market hours)
  cron.default.schedule('*/30 * * * *', async () => {
    try {
      const ctTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      if (ctTime.getDay() === 0 || ctTime.getDay() === 6) return;
      if (ctTime.getHours() < 8 || ctTime.getHours() > 17) return;
      const { scanBullishTrends, ingestBullishTrendsToTradeDesk } = await import('./bullish-trend-scanner');
      await scanBullishTrends();
      await ingestBullishTrendsToTradeDesk();
    } catch (error: any) { logger.error('📈 [BULLISH-TRENDS] Failed:', error); }
  });

  // Auto-cleanup (hourly)
  cron.default.schedule('0 * * * *', async () => {
    try {
      const { storage: s } = await import('./storage');
      const deletedCount = await (s as any).cleanupStaleTradeIdeas();
      if (deletedCount > 0) logger.info(`🧹 [AUTO-CLEANUP] Removed ${deletedCount} stale trades`);
    } catch (error: any) { logger.error('🧹 [AUTO-CLEANUP] Failed:', error); }
  });

  log('✅ [WORKER] All cron jobs scheduled. Process ready.');
  log('✅ [WORKER] Heavy services will start/stop based on market hours.');
})();
