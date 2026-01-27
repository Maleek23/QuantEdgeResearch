/**
 * CONVERGENCE ENGINE
 *
 * The brain that connects all signal sources to find pre-move opportunities.
 * Designed to catch ARM, BNAI, Coreweave-style moves BEFORE they happen.
 *
 * Key insight: When 2+ independent signal sources flag the same symbol,
 * the probability of a significant move increases exponentially.
 *
 * Signal Sources:
 * - Options flow (whale sweeps, unusual activity)
 * - Breaking news (overnight announcements, SEC filings)
 * - Insider activity (conviction buying, accumulation)
 * - Social sentiment (Reddit, Twitter momentum)
 * - Sector momentum (leader-follower patterns)
 * - Pre-market surges (overnight moves)
 *
 * Output: High-conviction trade signals pushed to Trade Desk
 */

import { db } from './db';
import { tradeIdeas, attentionEvents, symbolHeatScores } from '@shared/schema';
import { eq, desc, gte, and, or, sql } from 'drizzle-orm';
import { logger } from './logger';
import { recordSymbolAttention, getHotSymbols } from './attention-tracking-service';
import { fetchBreakingNews } from './news-service';
import { getUpcomingCatalysts, fetchGovernmentContractsForTicker } from './catalyst-intelligence-service';
import { scanForPreMoveSignals, HIGH_PROFILE_TICKERS, DEFENSE_TICKERS } from './pre-move-detection-service';
import { getTradierQuote } from './tradier-api';
import { createAndSaveUniversalIdea, type IdeaSignal } from './universal-idea-generator';
import { sendDiscordAlert } from './discord-service';

// ============================================
// CONVERGENCE CONFIGURATION
// ============================================

// Minimum convergence level to generate trade idea
const MIN_CONVERGENCE_FOR_IDEA = 2;

// Source types for convergence tracking
export type ConvergenceSignalSource =
  | 'options_sweep'
  | 'breaking_news'
  | 'insider_buying'
  | 'social_momentum'
  | 'sector_leader'
  | 'premarket_surge'
  | 'volume_spike'
  | 'iv_expansion'
  | 'analyst_upgrade'
  | 'defense_contract'
  | 'earnings_whisper';

// Signal with metadata for convergence
export interface ConvergenceSignal {
  symbol: string;
  source: ConvergenceSignalSource;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  details: string;
  magnitude: number; // 1-10 scale for signal strength
  timestamp: Date;
  expiresAt: Date; // Signal validity window
  metadata?: Record<string, any>;
}

// Aggregated convergence result
export interface ConvergenceResult {
  symbol: string;
  signals: ConvergenceSignal[];
  convergenceScore: number; // 0-100
  direction: 'bullish' | 'bearish' | 'mixed';
  urgency: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
  generatedAt: Date;
}

// Sector definitions for momentum propagation
const SECTOR_GROUPS: Record<string, string[]> = {
  'ai_compute': ['NVDA', 'AMD', 'INTC', 'SMCI', 'ARM', 'AVGO', 'MRVL', 'TSM'],
  'ai_software': ['MSFT', 'GOOGL', 'AMZN', 'META', 'PLTR', 'CRM', 'NOW', 'SNOW'],
  'quantum': ['IONQ', 'RGTI', 'QUBT', 'ARQQ', 'QBTS'],
  'nuclear': ['OKLO', 'SMR', 'NNE', 'CCJ', 'LEU', 'BWXT'],
  'space': ['RKLB', 'ASTS', 'LUNR', 'SPCE', 'RDW', 'VORB'],
  'defense': DEFENSE_TICKERS,
  'ev_auto': ['TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'F', 'GM'],
  'biotech': ['MRNA', 'BNTX', 'NVAX', 'REGN', 'VRTX', 'BIIB', 'GILD'],
  'crypto': ['COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'HUT'],
  'energy': ['XOM', 'CVX', 'COP', 'SLB', 'HAL', 'OXY'],
};

// In-memory signal buffer (decays over time)
const activeSignals = new Map<string, ConvergenceSignal[]>();
const SIGNAL_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// Cooldown for convergence alerts
const convergenceAlertCooldown = new Map<string, number>();
const CONVERGENCE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// ============================================
// SIGNAL REGISTRATION
// ============================================

/**
 * Register a new convergence signal
 */
export function registerSignal(signal: ConvergenceSignal): void {
  const symbol = signal.symbol.toUpperCase();
  const existing = activeSignals.get(symbol) || [];

  // Check for duplicate source within TTL
  const isDuplicate = existing.some(s =>
    s.source === signal.source &&
    new Date().getTime() - s.timestamp.getTime() < 30 * 60 * 1000
  );

  if (isDuplicate) {
    logger.debug(`[CONVERGENCE] Skipping duplicate ${symbol} signal from ${signal.source}`);
    return;
  }

  // Add expiration if not set
  if (!signal.expiresAt) {
    signal.expiresAt = new Date(Date.now() + SIGNAL_TTL_MS);
  }

  existing.push(signal);
  activeSignals.set(symbol, existing);

  logger.info(`[CONVERGENCE] Registered signal: ${symbol} from ${signal.source} (${signal.direction}, conf: ${signal.confidence})`);

  // Record in attention tracking for persistence
  recordSymbolAttention(symbol, 'trade_idea', 'alert', {
    confidence: signal.confidence,
    direction: signal.direction === 'neutral' ? undefined : signal.direction,
    message: signal.details,
  });

  // Check for convergence immediately
  checkConvergence(symbol);
}

/**
 * Clean up expired signals
 */
function cleanupExpiredSignals(): void {
  const now = new Date();
  for (const [symbol, signals] of Array.from(activeSignals.entries())) {
    const valid = signals.filter((s: ConvergenceSignal) => s.expiresAt > now);
    if (valid.length === 0) {
      activeSignals.delete(symbol);
    } else {
      activeSignals.set(symbol, valid);
    }
  }
}

// ============================================
// CONVERGENCE DETECTION
// ============================================

/**
 * Check if symbol has enough signals for convergence
 */
async function checkConvergence(symbol: string): Promise<ConvergenceResult | null> {
  const signals = activeSignals.get(symbol) || [];

  if (signals.length < MIN_CONVERGENCE_FOR_IDEA) {
    return null;
  }

  // Count distinct sources
  const sources = new Set(signals.map((s: ConvergenceSignal) => s.source));
  if (sources.size < MIN_CONVERGENCE_FOR_IDEA) {
    return null;
  }

  // Check cooldown
  const lastAlert = convergenceAlertCooldown.get(symbol);
  if (lastAlert && Date.now() - lastAlert < CONVERGENCE_COOLDOWN_MS) {
    logger.debug(`[CONVERGENCE] ${symbol} on cooldown, skipping`);
    return null;
  }

  // Calculate convergence metrics
  const bullishSignals = signals.filter((s: ConvergenceSignal) => s.direction === 'bullish');
  const bearishSignals = signals.filter((s: ConvergenceSignal) => s.direction === 'bearish');

  const direction = bullishSignals.length > bearishSignals.length ? 'bullish' :
                    bearishSignals.length > bullishSignals.length ? 'bearish' : 'mixed';

  // Calculate weighted convergence score
  let totalWeight = 0;
  let weightedConfidence = 0;
  for (const signal of signals) {
    const recency = Math.max(0, 1 - (Date.now() - signal.timestamp.getTime()) / SIGNAL_TTL_MS);
    const weight = signal.magnitude * recency;
    totalWeight += weight;
    weightedConfidence += signal.confidence * weight;
  }

  const convergenceScore = Math.min(95, Math.round(
    (weightedConfidence / totalWeight) * (1 + sources.size * 0.1)
  ));

  // Determine urgency
  const urgency = convergenceScore >= 85 ? 'critical' :
                  convergenceScore >= 70 ? 'high' :
                  convergenceScore >= 55 ? 'medium' : 'low';

  // Generate recommendation
  const sourceList = Array.from(sources).join(', ');
  const recommendation = `${symbol} showing ${direction} convergence from ${sources.size} independent sources: ${sourceList}. ` +
    `Score: ${convergenceScore}%. ${urgency === 'critical' ? 'IMMEDIATE ATTENTION REQUIRED.' : ''}`;

  const result: ConvergenceResult = {
    symbol,
    signals,
    convergenceScore,
    direction,
    urgency,
    recommendation,
    generatedAt: new Date(),
  };

  // If high enough, create trade idea
  if (convergenceScore >= 65 && direction !== 'mixed') {
    await createConvergenceTradeIdea(result);
  }

  // Record cooldown
  convergenceAlertCooldown.set(symbol, Date.now());

  logger.info(`[CONVERGENCE] 🎯 ${symbol}: ${convergenceScore}% convergence (${sources.size} sources) - ${urgency}`);

  return result;
}

/**
 * Create trade idea from convergence
 */
async function createConvergenceTradeIdea(result: ConvergenceResult): Promise<void> {
  try {
    const quote = await getTradierQuote(result.symbol);
    if (!quote || !quote.last) return;

    const isLong = result.direction === 'bullish';
    const price = quote.last;

    // Build signals array (IdeaSignal requires: type, weight, description)
    const ideaSignals: IdeaSignal[] = result.signals.map((s: ConvergenceSignal) => ({
      type: s.source.toUpperCase().replace(/_/g, '_'),
      weight: s.magnitude * 2,
      description: s.details,
      data: { confidence: s.confidence },
    }));

    // Add convergence bonus signal
    ideaSignals.push({
      type: 'CONVERGENCE_MULTI_SOURCE',
      weight: result.signals.length * 5,
      description: `${result.signals.length} independent sources converged`,
    });

    await createAndSaveUniversalIdea({
      symbol: result.symbol,
      source: 'bot_screener',
      assetType: 'stock',
      direction: isLong ? 'bullish' : 'bearish',
      currentPrice: price,
      targetPrice: price * (isLong ? 1.08 : 0.92),
      stopLoss: price * (isLong ? 0.95 : 1.05),
      signals: ideaSignals,
      holdingPeriod: 'swing',
      catalyst: result.recommendation,
      analysis: `CONVERGENCE ALERT: ${result.symbol} triggered by ${result.signals.length} independent signals. ` +
        `Sources: ${result.signals.map((s: ConvergenceSignal) => s.source).join(', ')}. ` +
        `Direction: ${result.direction.toUpperCase()}. ` +
        `Urgency: ${result.urgency.toUpperCase()}.`,
    });

    // Discord alert for critical/high urgency
    if (result.urgency === 'critical' || result.urgency === 'high') {
      try {
        const alertMessage = `🎯 **CONVERGENCE: ${result.symbol}**\n` +
          `${result.recommendation}\n\n` +
          `**Score:** ${result.convergenceScore}% | **Direction:** ${result.direction.toUpperCase()}\n` +
          `**Urgency:** ${result.urgency.toUpperCase()} | **Price:** $${price.toFixed(2)}\n` +
          `**Sources:** ${result.signals.map((s: ConvergenceSignal) => s.source).join(', ')}`;
        await sendDiscordAlert(alertMessage, 'warn');
      } catch (e) {
        logger.error('[CONVERGENCE] Failed to send Discord alert:', e);
      }
    }

    logger.info(`[CONVERGENCE] Created trade idea for ${result.symbol} with ${result.convergenceScore}% confidence`);
  } catch (e) {
    logger.error(`[CONVERGENCE] Failed to create trade idea for ${result.symbol}:`, e);
  }
}

// ============================================
// OVERNIGHT/PRE-MARKET MONITORING
// ============================================

/**
 * Scan overnight news and catalysts (run at 7 AM ET)
 */
export async function scanOvernightCatalysts(): Promise<ConvergenceSignal[]> {
  logger.info('[CONVERGENCE] Scanning overnight catalysts...');
  const signals: ConvergenceSignal[] = [];

  try {
    // 1. Breaking news from overnight
    const news = await fetchBreakingNews();
    for (const article of news.slice(0, 20)) {
      // Extract tickers from news
      const tickers = extractTickersFromText(article.title + ' ' + (article.summary || ''));
      for (const ticker of tickers) {
        const sentimentScore = article.overallSentimentScore || 0;
        const sentiment = sentimentScore > 0.25 ? 'bullish' :
                          sentimentScore < -0.25 ? 'bearish' : 'neutral';

        if (sentiment !== 'neutral' && Math.abs(sentimentScore) > 0.15) {
          const signal: ConvergenceSignal = {
            symbol: ticker,
            source: 'breaking_news',
            direction: sentiment,
            confidence: Math.min(85, Math.abs(sentimentScore) * 100 + 40),
            details: `Breaking news: ${article.title.slice(0, 100)}`,
            magnitude: Math.min(8, Math.abs(sentimentScore) * 10 + 3),
            timestamp: new Date(),
            expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
            metadata: { newsId: article.title, source: article.source },
          };
          signals.push(signal);
          registerSignal(signal);
        }
      }
    }

    // 2. Upcoming catalysts (earnings, FDA, etc.)
    const catalysts = await getUpcomingCatalysts();
    for (const catalyst of catalysts.filter(c => c.ticker)) {
      // If catalyst is today or tomorrow
      const catalystDate = new Date(catalyst.eventDate || catalyst.createdAt || new Date());
      const now = new Date();
      const daysDiff = (catalystDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff >= 0 && daysDiff <= 1) {
        const signal: ConvergenceSignal = {
          symbol: catalyst.ticker,
          source: catalyst.eventType === 'earnings' ? 'earnings_whisper' : 'breaking_news',
          direction: 'neutral', // Catalysts are directionally neutral until they happen
          confidence: 60,
          details: `Catalyst today: ${catalyst.eventType} - ${catalyst.title || catalyst.summary}`,
          magnitude: 5,
          timestamp: new Date(),
          expiresAt: catalystDate,
          metadata: { catalystType: catalyst.eventType },
        };
        signals.push(signal);
        registerSignal(signal);
      }
    }

    // 3. Government contracts announced overnight (defense stocks)
    for (const ticker of DEFENSE_TICKERS) {
      try {
        const contracts = await fetchGovernmentContractsForTicker(ticker);
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentContracts = contracts.filter(c => new Date(c.awardDate) > yesterday);

        for (const contract of recentContracts) {
          if (contract.obligationAmount && contract.obligationAmount > 10000000) {
            const signal: ConvergenceSignal = {
              symbol: ticker,
              source: 'defense_contract',
              direction: 'bullish',
              confidence: Math.min(90, 70 + Math.log10(contract.obligationAmount) * 5),
              details: `Contract: $${(contract.obligationAmount / 1000000).toFixed(1)}M from ${contract.awardingAgencyName}`,
              magnitude: Math.min(9, Math.log10(contract.obligationAmount)),
              timestamp: new Date(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              metadata: { contractValue: contract.obligationAmount },
            };
            signals.push(signal);
            registerSignal(signal);
          }
        }
      } catch (e) {
        // Continue on individual failures
      }
    }

    logger.info(`[CONVERGENCE] Found ${signals.length} overnight signals`);
    return signals;
  } catch (e) {
    logger.error('[CONVERGENCE] Overnight scan failed:', e);
    return [];
  }
}

/**
 * Extract stock tickers from text
 */
function extractTickersFromText(text: string): string[] {
  // Match 1-5 uppercase letters (potential tickers)
  const matches = text.match(/\b[A-Z]{1,5}\b/g) || [];

  // Filter to known tickers or high-profile list
  const allTickers = new Set([
    ...HIGH_PROFILE_TICKERS,
    ...Object.values(SECTOR_GROUPS).flat(),
  ]);

  return matches.filter(m => allTickers.has(m));
}

// ============================================
// SECTOR MOMENTUM PROPAGATION
// ============================================

/**
 * Detect when a sector leader moves and flag related stocks
 */
export async function detectSectorMomentum(): Promise<ConvergenceSignal[]> {
  logger.info('[CONVERGENCE] Checking sector momentum propagation...');
  const signals: ConvergenceSignal[] = [];

  try {
    for (const [sectorName, tickers] of Object.entries(SECTOR_GROUPS)) {
      // Get prices for sector
      const quotes = await Promise.all(
        tickers.slice(0, 5).map(t => getTradierQuote(t).catch(() => null))
      );

      // Find leaders moving >3%
      const leaders: { ticker: string; change: number }[] = [];
      for (let i = 0; i < quotes.length; i++) {
        const q = quotes[i];
        if (q && Math.abs(q.change_percentage || 0) > 3) {
          leaders.push({ ticker: tickers[i], change: q.change_percentage || 0 });
        }
      }

      if (leaders.length >= 2) {
        // Sector momentum detected
        const avgChange = leaders.reduce((sum, l) => sum + l.change, 0) / leaders.length;
        const direction = avgChange > 0 ? 'bullish' : 'bearish';

        // Flag laggards in the sector
        for (const ticker of tickers) {
          const isLeader = leaders.some(l => l.ticker === ticker);
          if (!isLeader) {
            const signal: ConvergenceSignal = {
              symbol: ticker,
              source: 'sector_leader',
              direction,
              confidence: Math.min(75, 50 + Math.abs(avgChange) * 3),
              details: `${sectorName.toUpperCase()} sector ${direction}: ${leaders.map(l => `${l.ticker} ${l.change > 0 ? '+' : ''}${l.change.toFixed(1)}%`).join(', ')}`,
              magnitude: Math.min(7, 3 + leaders.length),
              timestamp: new Date(),
              expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
              metadata: { sector: sectorName, leaders },
            };
            signals.push(signal);
            registerSignal(signal);
          }
        }
      }
    }

    logger.info(`[CONVERGENCE] Found ${signals.length} sector momentum signals`);
    return signals;
  } catch (e) {
    logger.error('[CONVERGENCE] Sector momentum detection failed:', e);
    return [];
  }
}

// ============================================
// INSIDER BUYING DETECTION
// ============================================

/**
 * Check for significant insider buying activity
 */
export async function detectInsiderConviction(symbol: string, insiderData: any): Promise<ConvergenceSignal | null> {
  if (!insiderData?.transactions || insiderData.transactions.length === 0) {
    return null;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentTransactions = insiderData.transactions.filter((t: any) => {
    const txDate = new Date(t.transactionDate || t.filingDate);
    return txDate > thirtyDaysAgo;
  });

  // Count buys vs sells
  const buys = recentTransactions.filter((t: any) =>
    t.transactionType?.toLowerCase().includes('purchase') ||
    t.transactionType?.toLowerCase().includes('buy') ||
    t.transactionCode === 'P'
  );

  const sells = recentTransactions.filter((t: any) =>
    t.transactionType?.toLowerCase().includes('sale') ||
    t.transactionType?.toLowerCase().includes('sell') ||
    t.transactionCode === 'S'
  );

  // Calculate total value of buys
  const buyValue = buys.reduce((sum: number, t: any) => {
    const shares = t.shares || t.transactionShares || 0;
    const price = t.pricePerShare || t.price || 0;
    return sum + (shares * price);
  }, 0);

  // Significant insider buying: 3+ buys or $1M+ in purchases
  if (buys.length >= 3 || buyValue > 1000000) {
    const signal: ConvergenceSignal = {
      symbol,
      source: 'insider_buying',
      direction: 'bullish',
      confidence: Math.min(85, 55 + buys.length * 5 + Math.min(20, buyValue / 100000)),
      details: `${buys.length} insider purchases (${sells.length} sells) in 30d. ~$${(buyValue / 1000000).toFixed(2)}M bought.`,
      magnitude: Math.min(8, 4 + buys.length),
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      metadata: { buyCount: buys.length, sellCount: sells.length, buyValue },
    };

    registerSignal(signal);
    return signal;
  }

  return null;
}

// ============================================
// PRE-MOVE SIGNAL INTEGRATION
// ============================================

/**
 * Convert pre-move signals to convergence signals
 * Note: Alerts are skipped here - the pre-move scanner handles Discord alerts directly
 */
export async function integratePreMoveSignals(): Promise<void> {
  // Skip alerts when called from convergence engine to prevent duplicate alerts
  const preMovSignals = await scanForPreMoveSignals(HIGH_PROFILE_TICKERS, { skipAlerts: true });

  for (const pmSignal of preMovSignals) {
    const sourceMap: Record<string, ConvergenceSignalSource> = {
      'late_day_sweep': 'options_sweep',
      'volume_spike': 'volume_spike',
      'iv_expansion': 'iv_expansion',
      'defense_contract': 'defense_contract',
    };

    const source = sourceMap[pmSignal.signalType] || 'options_sweep';

    const signal: ConvergenceSignal = {
      symbol: pmSignal.symbol,
      source,
      direction: pmSignal.direction,
      confidence: pmSignal.confidence,
      details: pmSignal.details,
      magnitude: Math.min(9, Math.floor(pmSignal.confidence / 10)),
      timestamp: pmSignal.timestamp,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      metadata: pmSignal.metrics,
    };

    registerSignal(signal);
  }
}

// ============================================
// GET CURRENT CONVERGENCE STATE
// ============================================

/**
 * Get all current convergence opportunities
 */
export async function getConvergenceOpportunities(): Promise<ConvergenceResult[]> {
  cleanupExpiredSignals();

  const opportunities: ConvergenceResult[] = [];

  for (const [symbol, signals] of Array.from(activeSignals.entries())) {
    const sources = new Set(signals.map((s: ConvergenceSignal) => s.source));
    if (sources.size < MIN_CONVERGENCE_FOR_IDEA) continue;

    const bullish = signals.filter((s: ConvergenceSignal) => s.direction === 'bullish');
    const bearish = signals.filter((s: ConvergenceSignal) => s.direction === 'bearish');
    const direction = bullish.length > bearish.length ? 'bullish' :
                      bearish.length > bullish.length ? 'bearish' : 'mixed';

    let totalWeight = 0;
    let weightedConf = 0;
    for (const s of signals) {
      const recency = Math.max(0, 1 - (Date.now() - s.timestamp.getTime()) / SIGNAL_TTL_MS);
      const w = s.magnitude * recency;
      totalWeight += w;
      weightedConf += s.confidence * w;
    }

    const score = Math.min(95, Math.round((weightedConf / totalWeight) * (1 + sources.size * 0.1)));
    const urgency = score >= 85 ? 'critical' : score >= 70 ? 'high' : score >= 55 ? 'medium' : 'low';

    opportunities.push({
      symbol,
      signals,
      convergenceScore: score,
      direction,
      urgency,
      recommendation: `${symbol}: ${sources.size} sources, ${score}% convergence`,
      generatedAt: new Date(),
    });
  }

  return opportunities.sort((a, b) => b.convergenceScore - a.convergenceScore);
}

// ============================================
// MAIN LOOP
// ============================================

let convergenceInterval: ReturnType<typeof setInterval> | null = null;
let overnightTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Start the convergence engine
 */
export function startConvergenceEngine(): void {
  logger.info('[CONVERGENCE] Starting Convergence Engine...');

  // Run convergence check every 5 minutes
  convergenceInterval = setInterval(async () => {
    try {
      // Integrate pre-move signals
      await integratePreMoveSignals();

      // Check sector momentum
      await detectSectorMomentum();

      // Cleanup old signals
      cleanupExpiredSignals();

    } catch (e) {
      logger.error('[CONVERGENCE] Engine error:', e);
    }
  }, 5 * 60 * 1000);

  // Schedule overnight scan for 7 AM ET
  scheduleOvernightScan();

  // Initial run
  setTimeout(async () => {
    await integratePreMoveSignals();
    await detectSectorMomentum();
  }, 5000);

  logger.info('[CONVERGENCE] Convergence Engine started');
}

/**
 * Schedule overnight scan at 7 AM ET
 */
function scheduleOvernightScan(): void {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  // Calculate time until next 7 AM ET
  let target = new Date(etNow);
  target.setHours(7, 0, 0, 0);

  if (target <= etNow) {
    target.setDate(target.getDate() + 1);
  }

  const msUntilTarget = target.getTime() - etNow.getTime();

  overnightTimeout = setTimeout(async () => {
    logger.info('[CONVERGENCE] Running overnight scan at 7 AM ET');
    await scanOvernightCatalysts();

    // Reschedule for tomorrow
    scheduleOvernightScan();
  }, msUntilTarget);

  logger.info(`[CONVERGENCE] Overnight scan scheduled in ${Math.round(msUntilTarget / 1000 / 60)} minutes`);
}

/**
 * Stop the convergence engine
 */
export function stopConvergenceEngine(): void {
  if (convergenceInterval) {
    clearInterval(convergenceInterval);
    convergenceInterval = null;
  }
  if (overnightTimeout) {
    clearTimeout(overnightTimeout);
    overnightTimeout = null;
  }
  logger.info('[CONVERGENCE] Convergence Engine stopped');
}

// Export for API routes
export { activeSignals };
