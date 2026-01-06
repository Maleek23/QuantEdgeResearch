import { logger } from "./logger";
import { storage } from "./storage";
import { generateTradeIdeas, validateTradeRisk } from "./ai-service";
import { shouldBlockSymbol } from "./earnings-service";
import { enrichOptionIdea } from "./options-enricher";
import { validateTradeWithChart } from "./chart-analysis";

// Penny stock tickers to emphasize during evening "Tomorrow's Playbook" sessions
const PENNY_STOCK_TICKERS = [
  // Quantum Computing ($1-10 range)
  'RGTI', 'QUBT', 'QBTS', 'ARQQ', 'QMCO',
  // Nuclear ($1-5 range)
  'DNN', 'URG', 'LTBR', 'NNE', 'OKLO', 'SMR', 'UEC', 'UUUU',
  // AI Penny Stocks
  'BBAI', 'SOUN',
  // Other Volatile Penny Stocks
  'MARA', 'RIOT', 'WULF', 'CLSK', 'APLD', 'BTBT', 'HUT', 'BITF',
  // Biotech/Healthcare Penny Plays
  'NVAX', 'SRNE', 'BNGO', 'NKLA', 'GOEV', 'FFIE', 'MULN'
];

// High-conviction Semiconductor & Storage tickers (AI Infrastructure)
const SEMI_STORAGE_TICKERS = [
  'NVDA', 'AMD', 'MU', 'WDC', 'LRCX', 'AMAT', 'ASML', 'TSM', 'AVGO', 'SMCI', 'ARM', 'STX'
];

/**
 * Automated Daily Idea Generation Service
 * Generates fresh AI trade ideas every weekday at 9:30 AM CT (market open)
 * Also generates "Tomorrow's Playbook" ideas at 8:30 PM CT for next-day trading
 */
class AutoIdeaGenerator {
  private intervalId: NodeJS.Timeout | null = null;
  private isGenerating = false;
  private lastRunTime: Date | null = null;
  private lastRunSuccess = false;
  private lastGeneratedCount = 0;

  /**
   * Start the automated idea generation service
   * Checks every 5 minutes and generates ideas at 9:30 AM CT on weekdays
   */
  start() {
    if (this.intervalId) {
      logger.info('⚠️  Auto idea generator already running');
      return;
    }

    logger.info('🤖 Starting Auto Idea Generator (checks every 5 minutes for 9:30 AM CT)');
    
    // Check immediately on startup
    this.checkAndGenerate().catch(err => 
      logger.error('❌ Initial idea generation check failed:', err)
    );

    // Check every 5 minutes
    this.intervalId = setInterval(() => {
      this.checkAndGenerate().catch(err => 
        logger.error('❌ Idea generation check failed:', err)
      );
    }, 5 * 60 * 1000); // 5 minutes

    logger.info('✅ Auto idea generator started');
  }

  /**
   * Stop the service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('🛑 Auto idea generator stopped');
    }
  }

  /**
   * Check if it's time to generate ideas and do it if needed
   */
  private async checkAndGenerate(): Promise<void> {
    // Prevent concurrent generations
    if (this.isGenerating) {
      return;
    }

    const now = new Date();
    const nowCT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    
    // Extract CT time components
    const hour = nowCT.getHours();
    const minute = nowCT.getMinutes();
    const dayOfWeek = nowCT.getDay(); // 0 = Sunday, 6 = Saturday

    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return;
    }

    // Generate ideas at multiple times during market hours + evening for tomorrow:
    // 9:30 AM (market open), 11:00 AM (mid-morning), 1:30 PM (afternoon), 8:30 PM (tomorrow's playbook)
    // This ensures we don't miss opportunities if server restarts
    const generationWindows = [
      { hour: 9, minStart: 30, minEnd: 35, label: '9:30 AM', isEvening: false },   // 9:30-9:35 AM CT - Market open
      { hour: 11, minStart: 0, minEnd: 5, label: '11:00 AM', isEvening: false },    // 11:00-11:05 AM CT - Mid-morning
      { hour: 13, minStart: 30, minEnd: 35, label: '1:30 PM', isEvening: false },  // 1:30-1:35 PM CT - Afternoon
      { hour: 20, minStart: 30, minEnd: 35, label: '8:30 PM', isEvening: true },   // 8:30-8:35 PM CT - Tomorrow's Playbook
    ];
    
    const currentWindow = generationWindows.find(
      window => hour === window.hour && minute >= window.minStart && minute < window.minEnd
    );
    
    if (!currentWindow) {
      return;
    }

    // Check if we already ran in this window (within last 2 hours)
    if (this.lastRunTime) {
      const hoursSinceLastRun = (now.getTime() - this.lastRunTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRun < 2 && this.lastRunSuccess) {
        return; // Already ran recently
      }
    }

    // Time to generate!
    await this.generateFreshIdeas(currentWindow.isEvening, currentWindow.label);
  }

  /**
   * Generate fresh AI trade ideas with full risk validation
   * @param isEveningSession - If true, this is the "Tomorrow's Playbook" session with penny stock focus
   * @param timeLabel - Human-readable time label for logging
   */
  private async generateFreshIdeas(isEveningSession = false, timeLabel = '9:30 AM'): Promise<number> {
    this.isGenerating = true;
    this.lastRunTime = new Date();
    this.lastGeneratedCount = 0;

    try {
      const nowCT = new Date(this.lastRunTime.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      
      // 🌙 TOMORROW'S PLAYBOOK: Evening session for next-day trading
      const sessionLabel = isEveningSession ? "🌙 [TOMORROW'S PLAYBOOK]" : "🎯 [AUTO-GEN]";
      logger.info(`${sessionLabel} Generating fresh AI ideas for ${nowCT.toLocaleDateString('en-US')} at ${timeLabel} CT`);
      
      if (isEveningSession) {
        logger.info(`🌙 [TOMORROW'S PLAYBOOK] Evening session - focusing on penny stocks and lotto plays for tomorrow's trading`);
        logger.info(`🌙 [TOMORROW'S PLAYBOOK] Target tickers: ${PENNY_STOCK_TICKERS.slice(0, 10).join(', ')}...`);
      }

      // 🚫 DEDUPLICATION: Only block symbols that have open AI-generated ideas
      // Allow different engines (lotto, flow, quant) to have ideas for same symbol
      const allIdeas = await storage.getAllTradeIdeas();
      const existingOpenAiSymbols = new Set(
        allIdeas
          .filter((idea: any) => idea.outcomeStatus === 'open' && idea.source === 'ai')
          .map((idea: any) => idea.symbol.toUpperCase())
      );

      // Build market context - add penny stock emphasis for evening sessions
      const semiTickers = SEMI_STORAGE_TICKERS.join(', ');
      let marketContext = `Current market conditions with focus on stocks, options, and crypto. 
      Pay special attention to Semiconductors and Memory/Storage sectors (AI Infrastructure): ${semiTickers}.`;
      
      if (isEveningSession) {
        const pennyTickers = PENNY_STOCK_TICKERS.join(', ');
        marketContext = `TOMORROW'S PLAYBOOK - Evening research session for next-day trading opportunities. 
Focus heavily on AI infrastructure (Semiconductors & Storage: ${semiTickers}) and high-volatility penny stocks. 
Priority tickers to analyze: ${semiTickers}, ${pennyTickers}.
Look for: 
1. AI Infrastructure (NVDA, MU, WDC, LRCX) - exploding demand for compute and memory
2. Quantum computing plays (IONQ, RGTI, QUBT, QBTS) - next big tech wave
3. Nuclear/clean energy (NNE, OKLO, SMR, DNN, UEC) - energy transition momentum
4. AI penny stocks (BBAI, SOUN) - AI bubble opportunities
5. Crypto miners (MARA, RIOT, WULF, CLSK) - Bitcoin correlation plays
Generate swing trade and lotto option ideas with asymmetric risk/reward. Include OTM call options for potential 5-10x returns.`;
      }
      const aiIdeas = await generateTradeIdeas(marketContext);

      // 🛡️ Apply strict risk validation to all AI-generated ideas
      const savedIdeas = [];
      const rejectedIdeas: Array<{symbol: string, reason: string}> = [];

      for (const aiIdea of aiIdeas) {
        // 🚫 Skip if symbol already has an open AI-generated trade
        if (existingOpenAiSymbols.has(aiIdea.symbol.toUpperCase())) {
          logger.info(`⏭️  [AUTO-GEN] Skipped ${aiIdea.symbol} - already has open AI trade`);
          continue;
        }

        // 📅 Check earnings calendar (block if earnings within 2 days, unless it's a news catalyst)
        // AI-generated ideas are NOT news catalysts by default
        if (aiIdea.assetType === 'stock' || aiIdea.assetType === 'option') {
          const isBlocked = await shouldBlockSymbol(aiIdea.symbol, false);
          if (isBlocked) {
            logger.warn(`📅 [AUTO-GEN] Skipped ${aiIdea.symbol} - earnings within 2 days`);
            rejectedIdeas.push({ symbol: aiIdea.symbol, reason: 'Earnings within 2 days' });
            continue;
          }
        }

        // 📊 OPTIONS ENRICHMENT: If AI suggested an option, fetch real Tradier data
        let processedIdea: any = aiIdea;
        let isLotto = false;
        
        if (aiIdea.assetType === 'option') {
          logger.info(`📊 [AUTO-GEN] Enriching ${aiIdea.symbol} option with Tradier data...`);
          const enrichedOption = await enrichOptionIdea(aiIdea);
          
          if (!enrichedOption) {
            logger.warn(`🚫 [AUTO-GEN] Failed to enrich ${aiIdea.symbol} option - skipping`);
            rejectedIdeas.push({ symbol: aiIdea.symbol, reason: 'Failed to fetch real option data' });
            continue;
          }
          
          processedIdea = enrichedOption;
          isLotto = enrichedOption.isLottoPlay;
          logger.info(`✅ [AUTO-GEN] Enriched ${aiIdea.symbol} option${isLotto ? ' (LOTTO PLAY)' : ''}`);
        }

        // 🛡️ CRITICAL: Validate risk guardrails (max 5% loss, min 2:1 R:R, price sanity)
        const validation = validateTradeRisk(processedIdea);

        if (!validation.isValid) {
          logger.warn(`🚫 [AUTO-GEN] REJECTED ${processedIdea.symbol} - ${validation.reason}`);
          rejectedIdeas.push({ symbol: processedIdea.symbol, reason: validation.reason || 'Unknown' });
          continue; // Skip this trade - does NOT save to database
        }

        // ✅ Trade passes risk validation - log metrics and save
        logger.info(`✅ [AUTO-GEN] ${processedIdea.symbol} passed risk validation - Loss:${validation.metrics?.maxLossPercent.toFixed(2)}% R:R:${validation.metrics?.riskRewardRatio.toFixed(2)}:1 Gain:${validation.metrics?.potentialGainPercent.toFixed(2)}%`);

        // 📈 CHART ANALYSIS PRE-VALIDATION: Check patterns, support/resistance before proceeding
        // Map option to underlying stock for chart analysis (options use stock charts)
        const chartAssetType: 'stock' | 'crypto' = processedIdea.assetType === 'option' ? 'stock' : 
          processedIdea.assetType === 'crypto' ? 'crypto' : 'stock';
        
        const chartValidation = await validateTradeWithChart(
          processedIdea.symbol,
          chartAssetType,
          processedIdea.direction,
          processedIdea.entryPrice,
          processedIdea.targetPrice,
          processedIdea.stopLoss
        );

        // 🛡️ STRICT CHART VALIDATION: Reject if chart data unavailable (unless lotto/news)
        // Check if this is a lotto play or news catalyst trade - these can bypass chart validation
        const isLottoOrNews = isLotto || processedIdea.isNewsCatalyst === true;
        
        if (!chartValidation.chartAnalysis) {
          if (isLottoOrNews) {
            // Lotto and news catalyst trades can proceed without chart validation
            logger.info(`📊 [AUTO-GEN] ${processedIdea.symbol} - no chart data available, proceeding (${isLotto ? 'LOTTO' : 'NEWS CATALYST'} trade - chart validation optional)`);
          } else {
            // Regular trades REQUIRE chart validation - reject if unavailable
            logger.warn(`🚫 [AUTO-GEN] CHART REJECTED ${processedIdea.symbol} - chart data unavailable for non-lotto/non-news trade`);
            rejectedIdeas.push({ symbol: processedIdea.symbol, reason: 'Chart data unavailable - chart validation required for standard trades' });
            continue;
          }
        } else if (!chartValidation.isValid) {
          const rejectNote = chartValidation.validationNotes.find(n => n.startsWith('REJECTED')) || 'Chart pattern conflict';
          logger.warn(`📉 [AUTO-GEN] CHART REJECTED ${processedIdea.symbol} - ${rejectNote}`);
          rejectedIdeas.push({ symbol: processedIdea.symbol, reason: `Chart: ${rejectNote}` });
          continue;
        }

        // Apply chart-adjusted prices if suggested (ONLY for stock/crypto, NOT options which have their own premium pricing)
        let entryPrice = processedIdea.entryPrice;
        let targetPrice = processedIdea.targetPrice;
        let stopLoss = processedIdea.stopLoss;
        
        // Options use their own pricing from Tradier - never apply chart adjustments to options
        if (processedIdea.assetType !== 'option' && chartValidation.chartAnalysis) {
          if (chartValidation.adjustedEntry) entryPrice = chartValidation.adjustedEntry;
          if (chartValidation.adjustedTarget) targetPrice = chartValidation.adjustedTarget;
          if (chartValidation.adjustedStop) stopLoss = chartValidation.adjustedStop;
        }

        // 🛡️ RE-VALIDATE RISK after chart adjustments (ensure 2:1 R:R and max-loss still hold)
        const adjustedIdea = { ...processedIdea, entryPrice, targetPrice, stopLoss };
        const postChartValidation = validateTradeRisk(adjustedIdea);
        
        if (!postChartValidation.isValid) {
          logger.warn(`🚫 [AUTO-GEN] POST-CHART REJECTED ${processedIdea.symbol} - ${postChartValidation.reason}`);
          rejectedIdeas.push({ symbol: processedIdea.symbol, reason: `Post-chart: ${postChartValidation.reason}` });
          continue;
        }

        // Log chart validation notes and build chart context for analysis
        let chartContext = '';
        if (chartValidation.validationNotes.length > 0) {
          logger.info(`📊 [AUTO-GEN] ${processedIdea.symbol} chart notes: ${chartValidation.validationNotes.slice(0, 3).join(' | ')}`);
          // Add chart context to analysis (first 2 notes for brevity)
          const relevantNotes = chartValidation.validationNotes
            .filter(n => !n.startsWith('⚠️')) // Exclude warnings for now
            .slice(0, 2);
          if (relevantNotes.length > 0) {
            chartContext = ` Chart: ${relevantNotes.join('; ')}.`;
          }
        }

        // Log post-chart validation metrics for auditability
        if (postChartValidation.metrics) {
          logger.info(`📊 [AUTO-GEN] ${processedIdea.symbol} post-chart metrics: Loss:${postChartValidation.metrics.maxLossPercent.toFixed(2)}% R:R:${postChartValidation.metrics.riskRewardRatio.toFixed(2)}:1 Gain:${postChartValidation.metrics.potentialGainPercent.toFixed(2)}%`);
        }

        // Boost confidence if chart confirms (+5)
        const chartConfirmed = chartValidation.chartAnalysis?.patterns.some(
          p => (processedIdea.direction === 'long' && p.type === 'bullish') ||
               (processedIdea.direction === 'short' && p.type === 'bearish')
        );
        const confidenceBoost = chartConfirmed ? 5 : 0;

        // Use post-chart validation metrics (these reflect any chart adjustments)
        const riskRewardRatio = postChartValidation.metrics?.riskRewardRatio || 
          (targetPrice - entryPrice) / (entryPrice - stopLoss);
        
        // 📊 BUILD QUALITY SIGNALS based on actual validations passed
        const qualitySignals: string[] = [];
        
        // Signal 1: AI Analysis - always present for AI-generated ideas
        qualitySignals.push('AI Analysis');
        
        // Signal 2: Risk validation passed (R:R requirement met)
        if (riskRewardRatio >= 2.0) {
          qualitySignals.push(`R:R ${riskRewardRatio.toFixed(1)}:1`);
        }
        
        // Signal 3: Chart pattern confirmation
        if (chartConfirmed) {
          qualitySignals.push('Chart Confirmed');
        }
        
        // Signal 4: Chart support/resistance alignment
        if (chartValidation.chartAnalysis?.patterns.length) {
          qualitySignals.push('Technical Pattern');
        }
        
        // Signal 5: Option enriched with real data
        if (processedIdea.assetType === 'option' && processedIdea.strikePrice) {
          qualitySignals.push('Option Enriched');
        }
        
        // Append chart context to analysis for downstream consumers
        const enhancedAnalysis = chartContext 
          ? `${processedIdea.analysis}${chartContext}` 
          : processedIdea.analysis;

        // Calculate base confidence + chart boost (AI ideas start at 60 base confidence)
        const baseConfidence = 60;
        const finalConfidence = Math.min(100, baseConfidence + confidenceBoost);

        // AI ideas: choose holding period based on confidence and catalyst type
        // High confidence (>= 65) → swing trade (more conviction = hold longer)
        // Intraday catalysts → day trade
        // Default → day trade (preserves existing behavior)
        const catalystLower = (processedIdea.catalyst || '').toLowerCase();
        const hasIntradayCatalyst = catalystLower.includes('earnings today') ||
                                     catalystLower.includes('breaking:') ||
                                     catalystLower.includes('intraday');
        
        let holdingPeriod: 'day' | 'swing' | 'position';
        if (processedIdea.assetType === 'crypto') {
          holdingPeriod = 'position'; // Crypto → position trades (24/7 market)
        } else if (hasIntradayCatalyst) {
          holdingPeriod = 'day'; // Urgent catalysts → day trade
        } else if (finalConfidence >= 65) {
          holdingPeriod = 'swing'; // High confidence → swing trade
        } else {
          holdingPeriod = 'day'; // Default to day trade
        }
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: processedIdea.symbol,
          assetType: processedIdea.assetType,
          direction: processedIdea.direction,
          holdingPeriod: holdingPeriod,
          entryPrice,
          targetPrice,
          stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: processedIdea.catalyst,
          analysis: enhancedAnalysis, // Includes chart context if available
          liquidityWarning: processedIdea.entryPrice < 5,
          sessionContext: processedIdea.sessionContext,
          timestamp: new Date().toISOString(),
          expiryDate: processedIdea.expiryDate || null,
          strikePrice: processedIdea.strikePrice || null,
          optionType: processedIdea.optionType || null,
          source: 'ai',
          isLottoPlay: isLotto,
          confidenceScore: finalConfidence, // Base 60 + chart boost (+5 if chart confirms)
          qualitySignals, // Array of verified signal labels
        });
        savedIdeas.push(tradeIdea);
      }

      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'ai').catch(err => 
          logger.error('[AUTO-GEN] Discord notification failed:', err)
        );
      }

      // Log summary of risk validation
      if (rejectedIdeas.length > 0) {
        logger.warn(`🛡️ [AUTO-GEN] Risk Validation Summary: ${rejectedIdeas.length} ideas rejected, ${savedIdeas.length} passed`);
        rejectedIdeas.forEach(r => logger.warn(`   - ${r.symbol}: ${r.reason}`));
      }

      if (savedIdeas.length > 0) {
        logger.info(`✅ [AUTO-GEN] Successfully generated ${savedIdeas.length} fresh AI trade ideas`);
        this.lastRunSuccess = true;
        this.lastGeneratedCount = savedIdeas.length;
      } else {
        logger.warn('⚠️  [AUTO-GEN] No ideas generated - all rejected or AI unavailable');
        this.lastRunSuccess = false;
        this.lastGeneratedCount = 0;
      }
      return savedIdeas.length;
    } catch (error: any) {
      logger.error('[AUTO-GEN] Failed to generate ideas:', error);
      this.lastRunSuccess = false;
      this.lastGeneratedCount = 0;
      return 0;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Get service status for monitoring
   */
  getStatus() {
    return {
      running: this.intervalId !== null,
      isGenerating: this.isGenerating,
      lastRunTime: this.lastRunTime,
      lastRunSuccess: this.lastRunSuccess,
      lastGeneratedCount: this.lastGeneratedCount
    };
  }

  /**
   * Manually trigger idea generation (for testing/admin use)
   */
  async manualGenerate(): Promise<void> {
    await this.generateFreshIdeas();
  }

  /**
   * Force immediate idea generation regardless of time windows
   * Can be called from API routes for on-demand generation
   * @param focusPennyStocks - If true, emphasize penny stocks and lotto plays (like evening session)
   * @param relaxedFilters - If true, skip chart validation and use lenient risk thresholds (for evening watchlist)
   * @returns Number of ideas generated
   */
  async forceGenerate(focusPennyStocks = false, relaxedFilters = false): Promise<number> {
    if (this.isGenerating) {
      logger.warn('⚠️ [FORCE-GEN] Generation already in progress, skipping...');
      return 0;
    }
    
    if (relaxedFilters) {
      logger.info(`🌙 [EVENING MODE] Relaxed filters active for tomorrow's watchlist`);
      return await this.generateRelaxedIdeas(focusPennyStocks);
    }
    
    logger.info(`🚀 [FORCE-GEN] Manual idea generation triggered (penny stock focus: ${focusPennyStocks})`);
    return await this.generateFreshIdeas(focusPennyStocks, 'On-Demand');
  }

  /**
   * Generate trade ideas with relaxed validation for evening "Tomorrow's Playbook" sessions
   * Skips chart validation, uses lenient risk thresholds, allows lower confidence
   * @param focusPennyStocks - If true, emphasize penny stocks and lotto plays
   * @returns Number of ideas generated
   */
  private async generateRelaxedIdeas(focusPennyStocks = true): Promise<number> {
    this.isGenerating = true;
    this.lastRunTime = new Date();
    this.lastGeneratedCount = 0;

    try {
      const nowCT = new Date(this.lastRunTime.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
      
      logger.info(`🌙 [EVENING MODE] Generating tomorrow's watchlist ideas for ${nowCT.toLocaleDateString('en-US')}`);
      logger.info(`🌙 [EVENING MODE] Relaxed validation: skipping chart analysis, lenient risk thresholds`);
      
      if (focusPennyStocks) {
        logger.info(`🌙 [EVENING MODE] Penny stock focus enabled - targeting: ${PENNY_STOCK_TICKERS.slice(0, 10).join(', ')}...`);
      }

      // 🚫 DEDUPLICATION: Only block symbols that have open AI-generated ideas
      const allIdeas = await storage.getAllTradeIdeas();
      const existingOpenAiSymbols = new Set(
        allIdeas
          .filter((idea: any) => idea.outcomeStatus === 'open' && idea.source === 'ai')
          .map((idea: any) => idea.symbol.toUpperCase())
      );

      // Build market context for tomorrow's watchlist
      const semiTickers = SEMI_STORAGE_TICKERS.join(', ');
      const pennyTickers = PENNY_STOCK_TICKERS.join(', ');
      const marketContext = `🌙 TOMORROW'S WATCHLIST - Evening research session for next-day trading opportunities.
This is a relaxed evening scan to identify interesting setups for tomorrow's trading day.
Focus heavily on AI infrastructure (Semiconductors & Storage: ${semiTickers}) and high-volatility penny stocks.
Priority tickers to analyze: ${semiTickers}, ${pennyTickers}.
Look for:
1. AI Infrastructure (NVDA, MU, WDC, LRCX) - exploding demand for compute and memory
2. Quantum computing plays (IONQ, RGTI, QUBT, QBTS) - next big tech wave
3. Nuclear/clean energy (NNE, OKLO, SMR, DNN, UEC) - energy transition momentum
4. AI penny stocks (BBAI, SOUN) - AI bubble opportunities
5. Crypto miners (MARA, RIOT, WULF, CLSK) - Bitcoin correlation plays
Generate swing trade and lotto option ideas with asymmetric risk/reward. Include OTM call options for potential 5-10x returns.
This is a WATCHLIST scan - be more inclusive of speculative setups.`;

      const aiIdeas = await generateTradeIdeas(marketContext);
      logger.info(`🌙 [EVENING MODE] AI generated ${aiIdeas.length} candidate ideas`);

      // 🛡️ Apply RELAXED validation to evening ideas
      const savedIdeas = [];
      const rejectedIdeas: Array<{symbol: string, reason: string}> = [];

      for (const aiIdea of aiIdeas) {
        // 🚫 Skip if symbol already has an open AI-generated trade
        if (existingOpenAiSymbols.has(aiIdea.symbol.toUpperCase())) {
          logger.info(`⏭️  [EVENING MODE] Skipped ${aiIdea.symbol} - already has open AI trade`);
          continue;
        }

        // 📅 Check earnings calendar (still block earnings, but allow news catalysts)
        if (aiIdea.assetType === 'stock' || aiIdea.assetType === 'option') {
          const isBlocked = await shouldBlockSymbol(aiIdea.symbol, false);
          if (isBlocked) {
            logger.warn(`📅 [EVENING MODE] Skipped ${aiIdea.symbol} - earnings within 2 days`);
            rejectedIdeas.push({ symbol: aiIdea.symbol, reason: 'Earnings within 2 days' });
            continue;
          }
        }

        // 📊 OPTIONS ENRICHMENT: If AI suggested an option, fetch real Tradier data
        let processedIdea: any = aiIdea;
        let isLotto = false;
        
        if (aiIdea.assetType === 'option') {
          logger.info(`📊 [EVENING MODE] Enriching ${aiIdea.symbol} option with Tradier data...`);
          const enrichedOption = await enrichOptionIdea(aiIdea);
          
          if (!enrichedOption) {
            logger.warn(`🚫 [EVENING MODE] Failed to enrich ${aiIdea.symbol} option - skipping`);
            rejectedIdeas.push({ symbol: aiIdea.symbol, reason: 'Failed to fetch real option data' });
            continue;
          }
          
          processedIdea = enrichedOption;
          isLotto = enrichedOption.isLottoPlay;
          logger.info(`✅ [EVENING MODE] Enriched ${aiIdea.symbol} option${isLotto ? ' (LOTTO PLAY)' : ''}`);
        }

        // 🌙 RELAXED RISK VALIDATION: More lenient thresholds for evening watchlist
        // Only apply basic sanity checks - not strict R:R requirements
        const { entryPrice, targetPrice, stopLoss, direction, assetType } = processedIdea;
        
        // Basic sanity checks (price > 0, symbol exists)
        if (entryPrice <= 0 || targetPrice <= 0 || stopLoss <= 0) {
          logger.warn(`🚫 [EVENING MODE] REJECTED ${processedIdea.symbol} - invalid prices: entry=$${entryPrice}, target=$${targetPrice}, stop=$${stopLoss}`);
          rejectedIdeas.push({ symbol: processedIdea.symbol, reason: 'Invalid prices (must be > 0)' });
          continue;
        }

        // Validate price relationships (relaxed - just check direction makes sense)
        if (direction === 'long' && targetPrice <= entryPrice) {
          logger.warn(`🚫 [EVENING MODE] REJECTED ${processedIdea.symbol} - long trade but target <= entry`);
          rejectedIdeas.push({ symbol: processedIdea.symbol, reason: 'Long trade but target <= entry' });
          continue;
        }
        if (direction === 'short' && targetPrice >= entryPrice) {
          logger.warn(`🚫 [EVENING MODE] REJECTED ${processedIdea.symbol} - short trade but target >= entry`);
          rejectedIdeas.push({ symbol: processedIdea.symbol, reason: 'Short trade but target >= entry' });
          continue;
        }

        // 🌙 SKIP CHART VALIDATION: Evening mode doesn't require chart confirmation
        logger.info(`🌙 [EVENING MODE] ${processedIdea.symbol} - skipping chart validation (evening watchlist mode)`);

        // Calculate basic risk metrics for display (but don't enforce strict thresholds)
        const maxLoss = direction === 'long' 
          ? (entryPrice - stopLoss) 
          : (stopLoss - entryPrice);
        
        const potentialGain = direction === 'long'
          ? (targetPrice - entryPrice)
          : (entryPrice - targetPrice);
        
        const riskRewardRatio = maxLoss > 0 ? potentialGain / maxLoss : 1.5;
        
        logger.info(`🌙 [EVENING MODE] ${processedIdea.symbol} passed relaxed validation - R:R:${riskRewardRatio.toFixed(2)}:1`);

        // 📊 BUILD QUALITY SIGNALS for evening watchlist
        const qualitySignals: string[] = ['AI Analysis', 'Evening Watchlist'];
        
        if (riskRewardRatio >= 2.0) {
          qualitySignals.push(`R:R ${riskRewardRatio.toFixed(1)}:1`);
        }
        
        if (processedIdea.assetType === 'option' && processedIdea.strikePrice) {
          qualitySignals.push('Option Enriched');
        }

        if (isLotto) {
          qualitySignals.push('Lotto Play');
        }

        // Evening mode uses lower base confidence (50 vs 60 for regular)
        const baseConfidence = 50;
        const finalConfidence = Math.min(100, baseConfidence + (riskRewardRatio >= 2.0 ? 5 : 0));

        // Evening ideas default to swing trades (holding overnight for tomorrow)
        const holdingPeriod: 'day' | 'swing' | 'position' = 
          processedIdea.assetType === 'crypto' ? 'position' : 'swing';
        
        const tradeIdea = await storage.createTradeIdea({
          symbol: processedIdea.symbol,
          assetType: processedIdea.assetType,
          direction: processedIdea.direction,
          holdingPeriod: holdingPeriod,
          entryPrice,
          targetPrice,
          stopLoss,
          riskRewardRatio: Math.round(riskRewardRatio * 10) / 10,
          catalyst: processedIdea.catalyst,
          analysis: `[Tomorrow's Watchlist] ${processedIdea.analysis}`,
          liquidityWarning: processedIdea.entryPrice < 5,
          sessionContext: `Evening scan for ${nowCT.toLocaleDateString('en-US')} - tomorrow's trading`,
          timestamp: new Date().toISOString(),
          expiryDate: processedIdea.expiryDate || null,
          strikePrice: processedIdea.strikePrice || null,
          optionType: processedIdea.optionType || null,
          source: 'ai',
          isLottoPlay: isLotto,
          confidenceScore: finalConfidence,
          qualitySignals,
        });
        savedIdeas.push(tradeIdea);
      }

      // Send Discord notification for batch
      if (savedIdeas.length > 0) {
        const { sendBatchSummaryToDiscord } = await import("./discord-service");
        sendBatchSummaryToDiscord(savedIdeas, 'ai').catch(err => 
          logger.error('[EVENING MODE] Discord notification failed:', err)
        );
      }

      // Log summary
      if (rejectedIdeas.length > 0) {
        logger.warn(`🌙 [EVENING MODE] Relaxed Validation Summary: ${rejectedIdeas.length} ideas rejected, ${savedIdeas.length} passed`);
        rejectedIdeas.forEach(r => logger.warn(`   - ${r.symbol}: ${r.reason}`));
      }

      if (savedIdeas.length > 0) {
        logger.info(`🌙 [EVENING MODE] Successfully generated ${savedIdeas.length} tomorrow's watchlist ideas`);
        this.lastRunSuccess = true;
        this.lastGeneratedCount = savedIdeas.length;
      } else {
        logger.warn('🌙 [EVENING MODE] No ideas generated - all rejected or AI unavailable');
        this.lastRunSuccess = false;
        this.lastGeneratedCount = 0;
      }
      return savedIdeas.length;
    } catch (error: any) {
      logger.error('[EVENING MODE] Failed to generate ideas:', error);
      this.lastRunSuccess = false;
      this.lastGeneratedCount = 0;
      return 0;
    } finally {
      this.isGenerating = false;
    }
  }
}

// Export singleton instance
export const autoIdeaGenerator = new AutoIdeaGenerator();
