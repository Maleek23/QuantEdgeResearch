/**
 * Trade Desk Executor
 *
 * Listens to Trade Desk signals and auto-executes via Alpaca
 * Uses confluence (Band B = 3+ signals) for high-probability trades
 *
 * This REPLACES the weak auto-idea-generator bot
 */

import { logger } from './logger';
import {
  submitBracketOrder,
  getAccount,
  getPositions,
  isMarketOpen,
  isAlpacaConfigured,
  AlpacaPosition,
  BracketOrderRequest,
} from './alpaca-trading';
import { sendPositionAlert } from './sms-notification-service';
import { storage } from './storage';

// ============================================
// USER TRADING RULES (Your $700 account rules)
// ============================================

interface TradingRules {
  accountSize: number;
  maxRiskPerTrade: number;       // $50 max
  maxRiskPercent: number;        // 7% of account
  maxOpenPositions: number;      // Don't overtrade
  minConfidence: number;         // Min confidence score
  minSignals: number;            // Band B = 3+ signals
  preferredTickers: string[];    // Your winners
  avoidTickers: string[];        // Your losers
  minDTE: number;                // Minimum days to expiry
  maxOTMPercent: number;         // Max % out of the money
  stopLossPercent: number;       // -30% stop
  takeProfitPercent: number;     // +50% target
  onlyDuringMarketHours: boolean;
  requireConfluence: boolean;    // Must have 3+ signals
}

const DEFAULT_RULES: TradingRules = {
  accountSize: 700,
  maxRiskPerTrade: 50,
  maxRiskPercent: 7,
  maxOpenPositions: 3,
  minConfidence: 75,
  minSignals: 3,                 // Band B requirement
  preferredTickers: ['SPY', 'QQQ', 'IWM', 'NVDA', 'AMD', 'ARM', 'NNE'],
  avoidTickers: ['RKLB', 'ORCL', 'HOOD', 'BIDU', 'MSTR', 'CVNA', 'SMR'],
  minDTE: 5,
  maxOTMPercent: 5,
  stopLossPercent: 30,
  takeProfitPercent: 50,
  onlyDuringMarketHours: true,
  requireConfluence: true,
};

let tradingRules = { ...DEFAULT_RULES };

// ============================================
// TRADE DESK SIGNAL INTERFACE
// ============================================

interface TradeDeskSignal {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  assetType: 'stock' | 'option';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidenceScore: number;
  probabilityBand: string;      // A, B+, B, C+, C
  qualitySignals: string[];     // The signals that triggered this
  source: string;
  catalyst: string;
  timestamp: Date;
}

// ============================================
// EXECUTION STATE
// ============================================

interface ExecutedTrade {
  signalId: string;
  symbol: string;
  orderId: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  executedAt: Date;
  status: 'open' | 'closed' | 'stopped' | 'target_hit';
}

const executedTrades: Map<string, ExecutedTrade> = new Map();
let isExecutorRunning = false;
let executorInterval: NodeJS.Timeout | null = null;

// ============================================
// SIGNAL VALIDATION
// ============================================

function validateSignalForExecution(signal: TradeDeskSignal): {
  valid: boolean;
  reason?: string;
} {
  // Rule 1: Avoid your problem tickers
  if (tradingRules.avoidTickers.includes(signal.symbol)) {
    return { valid: false, reason: `${signal.symbol} is on avoid list` };
  }

  // Rule 2: Check confidence
  if (signal.confidenceScore < tradingRules.minConfidence) {
    return { valid: false, reason: `Confidence ${signal.confidenceScore} below ${tradingRules.minConfidence}` };
  }

  // Rule 3: Check confluence (Band B = 3+ signals)
  if (tradingRules.requireConfluence && signal.qualitySignals.length < tradingRules.minSignals) {
    return { valid: false, reason: `Only ${signal.qualitySignals.length} signals, need ${tradingRules.minSignals}+` };
  }

  // Rule 4: Check probability band
  const goodBands = ['A', 'B+', 'B'];
  if (!goodBands.includes(signal.probabilityBand)) {
    return { valid: false, reason: `Band ${signal.probabilityBand} not in approved bands` };
  }

  // Rule 5: Prefer your winning tickers (boost, not block)
  const isPreferred = tradingRules.preferredTickers.includes(signal.symbol);

  // Rule 6: Calculate risk
  const riskPerShare = Math.abs(signal.entryPrice - signal.stopLoss);
  const maxShares = Math.floor(tradingRules.maxRiskPerTrade / riskPerShare);

  if (maxShares < 1) {
    return { valid: false, reason: `Risk per share $${riskPerShare.toFixed(2)} exceeds max risk $${tradingRules.maxRiskPerTrade}` };
  }

  return { valid: true };
}

// ============================================
// EXECUTE TRADE
// ============================================

async function executeSignal(signal: TradeDeskSignal): Promise<boolean> {
  // Validate
  const validation = validateSignalForExecution(signal);
  if (!validation.valid) {
    logger.info(`[EXECUTOR] Skipping ${signal.symbol}: ${validation.reason}`);
    return false;
  }

  // Check if already executed
  if (executedTrades.has(signal.id)) {
    logger.info(`[EXECUTOR] Signal ${signal.id} already executed`);
    return false;
  }

  // Check max positions
  const positions = await getPositions();
  if (positions.length >= tradingRules.maxOpenPositions) {
    logger.info(`[EXECUTOR] Max positions (${tradingRules.maxOpenPositions}) reached`);
    return false;
  }

  // Check if already in this symbol
  if (positions.some(p => p.symbol === signal.symbol)) {
    logger.info(`[EXECUTOR] Already have position in ${signal.symbol}`);
    return false;
  }

  // Calculate position size
  const riskPerShare = Math.abs(signal.entryPrice - signal.stopLoss);
  const quantity = Math.floor(tradingRules.maxRiskPerTrade / riskPerShare);

  if (quantity < 1) {
    logger.info(`[EXECUTOR] Position size too small for ${signal.symbol}`);
    return false;
  }

  // Calculate stop loss and take profit prices
  const isLong = signal.direction === 'long';
  const stopLossPrice = isLong
    ? signal.entryPrice * (1 - tradingRules.stopLossPercent / 100)
    : signal.entryPrice * (1 + tradingRules.stopLossPercent / 100);

  const takeProfitPrice = isLong
    ? signal.entryPrice * (1 + tradingRules.takeProfitPercent / 100)
    : signal.entryPrice * (1 - tradingRules.takeProfitPercent / 100);

  // Submit bracket order
  const bracketRequest: BracketOrderRequest = {
    symbol: signal.symbol,
    qty: quantity,
    side: isLong ? 'buy' : 'sell',
    entryType: 'limit',
    entryPrice: signal.entryPrice,
    stopLoss: Math.round(stopLossPrice * 100) / 100,
    takeProfit: Math.round(takeProfitPrice * 100) / 100,
    timeInForce: 'day',
  };

  logger.info(`[EXECUTOR] 🚀 Executing ${signal.symbol}:`);
  logger.info(`[EXECUTOR]    Direction: ${signal.direction.toUpperCase()}`);
  logger.info(`[EXECUTOR]    Quantity: ${quantity} shares`);
  logger.info(`[EXECUTOR]    Entry: $${signal.entryPrice}`);
  logger.info(`[EXECUTOR]    Stop: $${bracketRequest.stopLoss} (-${tradingRules.stopLossPercent}%)`);
  logger.info(`[EXECUTOR]    Target: $${bracketRequest.takeProfit} (+${tradingRules.takeProfitPercent}%)`);
  logger.info(`[EXECUTOR]    Signals: ${signal.qualitySignals.join(', ')}`);

  const order = await submitBracketOrder(bracketRequest);

  if (order) {
    // Track executed trade
    executedTrades.set(signal.id, {
      signalId: signal.id,
      symbol: signal.symbol,
      orderId: order.id,
      entryPrice: signal.entryPrice,
      stopLoss: bracketRequest.stopLoss,
      takeProfit: bracketRequest.takeProfit,
      quantity,
      executedAt: new Date(),
      status: 'open',
    });

    // Send SMS notification
    await sendPositionAlert({
      type: 'profit_target', // Using this type for new position notification
      symbol: signal.symbol,
      underlying: signal.symbol,
      plPercent: 0,
      currentPrice: signal.entryPrice,
      avgCost: signal.entryPrice,
      quantity,
      message: `🟢 OPENED: ${quantity} ${signal.symbol} @ $${signal.entryPrice}\nStop: $${bracketRequest.stopLoss} | Target: $${bracketRequest.takeProfit}\nSignals: ${signal.qualitySignals.length}`,
    });

    logger.info(`[EXECUTOR] ✅ Order submitted: ${order.id}`);
    return true;
  } else {
    logger.error(`[EXECUTOR] ❌ Failed to submit order for ${signal.symbol}`);
    return false;
  }
}

// ============================================
// MONITOR POSITIONS
// ============================================

async function monitorPositions(): Promise<void> {
  const positions = await getPositions();

  for (const position of positions) {
    const pl = parseFloat(position.unrealized_pl);
    const plPercent = parseFloat(position.unrealized_plpc) * 100;
    const currentPrice = parseFloat(position.current_price);
    const avgCost = parseFloat(position.avg_entry_price);
    const qty = parseInt(position.qty);

    // Check for stop loss hit
    if (plPercent <= -tradingRules.stopLossPercent) {
      logger.warn(`[EXECUTOR] 🔴 STOP HIT: ${position.symbol} at ${plPercent.toFixed(1)}%`);

      await sendPositionAlert({
        type: 'stop_loss',
        symbol: position.symbol,
        underlying: position.symbol,
        plPercent,
        currentPrice,
        avgCost,
        quantity: qty,
        message: `🔴 STOP HIT: ${position.symbol}\nP&L: ${plPercent.toFixed(1)}% ($${pl.toFixed(2)})\nClosing position...`,
      });
    }

    // Check for take profit hit
    if (plPercent >= tradingRules.takeProfitPercent) {
      logger.info(`[EXECUTOR] 🎯 TARGET HIT: ${position.symbol} at ${plPercent.toFixed(1)}%`);

      await sendPositionAlert({
        type: 'profit_target',
        symbol: position.symbol,
        underlying: position.symbol,
        plPercent,
        currentPrice,
        avgCost,
        quantity: qty,
        message: `🎯 TARGET HIT: ${position.symbol}\nP&L: +${plPercent.toFixed(1)}% (+$${pl.toFixed(2)})\nClosing position...`,
      });
    }

    // Check for bag hold warning
    if (plPercent <= -50) {
      await sendPositionAlert({
        type: 'bag_hold',
        symbol: position.symbol,
        underlying: position.symbol,
        plPercent,
        currentPrice,
        avgCost,
        quantity: qty,
        message: `⚠️ BAG HOLD WARNING: ${position.symbol}\nDown ${plPercent.toFixed(1)}%!\nConsider cutting losses.`,
      });
    }
  }
}

// ============================================
// SCAN TRADE DESK FOR SIGNALS
// ============================================

async function scanForExecutableSignals(): Promise<TradeDeskSignal[]> {
  try {
    // Get recent trade ideas from Trade Desk
    const allIdeas = await storage.getAllTradeIdeas();
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Filter for recent, high-quality signals
    const executableSignals: TradeDeskSignal[] = allIdeas
      .filter((idea: any) => {
        // Only recent ideas
        const ideaTime = new Date(idea.timestamp);
        if (ideaTime < fiveMinutesAgo) return false;

        // Only open ideas
        if (idea.outcomeStatus !== 'open') return false;

        // Only stocks for now (options more complex)
        if (idea.assetType !== 'stock') return false;

        // Must have confidence score
        if (!idea.confidenceScore) return false;

        return true;
      })
      .map((idea: any) => ({
        id: idea.id,
        symbol: idea.symbol,
        direction: idea.direction as 'long' | 'short',
        assetType: idea.assetType as 'stock' | 'option',
        entryPrice: idea.entryPrice,
        targetPrice: idea.targetPrice,
        stopLoss: idea.stopLoss,
        confidenceScore: idea.confidenceScore,
        probabilityBand: idea.probabilityBand || 'C',
        qualitySignals: idea.qualitySignals || [],
        source: idea.source,
        catalyst: idea.catalyst,
        timestamp: new Date(idea.timestamp),
      }));

    return executableSignals;
  } catch (error) {
    logger.error('[EXECUTOR] Error scanning for signals:', error);
    return [];
  }
}

// ============================================
// MAIN EXECUTOR LOOP
// ============================================

async function executorLoop(): Promise<void> {
  if (!isAlpacaConfigured()) {
    logger.warn('[EXECUTOR] Alpaca not configured, skipping');
    return;
  }

  // Check market hours
  if (tradingRules.onlyDuringMarketHours) {
    const marketOpen = await isMarketOpen();
    if (!marketOpen) {
      logger.info('[EXECUTOR] Market closed, skipping');
      return;
    }
  }

  // Check account
  const account = await getAccount();
  if (!account) {
    logger.error('[EXECUTOR] Cannot access Alpaca account');
    return;
  }

  const buyingPower = parseFloat(account.buying_power);
  if (buyingPower < tradingRules.maxRiskPerTrade) {
    logger.warn(`[EXECUTOR] Insufficient buying power: $${buyingPower.toFixed(2)}`);
    return;
  }

  // Monitor existing positions
  await monitorPositions();

  // Scan for new signals
  const signals = await scanForExecutableSignals();
  logger.info(`[EXECUTOR] Found ${signals.length} potential signals`);

  // Execute valid signals
  for (const signal of signals) {
    await executeSignal(signal);
  }
}

// ============================================
// START/STOP EXECUTOR
// ============================================

export async function startTradeExecutor(): Promise<boolean> {
  if (isExecutorRunning) {
    logger.warn('[EXECUTOR] Already running');
    return false;
  }

  if (!isAlpacaConfigured()) {
    logger.error('[EXECUTOR] Cannot start - Alpaca not configured');
    return false;
  }

  logger.info('[EXECUTOR] 🤖 Starting Trade Desk Executor...');
  logger.info(`[EXECUTOR]    Max Risk/Trade: $${tradingRules.maxRiskPerTrade}`);
  logger.info(`[EXECUTOR]    Max Positions: ${tradingRules.maxOpenPositions}`);
  logger.info(`[EXECUTOR]    Min Confidence: ${tradingRules.minConfidence}%`);
  logger.info(`[EXECUTOR]    Require Confluence: ${tradingRules.requireConfluence} (${tradingRules.minSignals}+ signals)`);
  logger.info(`[EXECUTOR]    Stop Loss: -${tradingRules.stopLossPercent}%`);
  logger.info(`[EXECUTOR]    Take Profit: +${tradingRules.takeProfitPercent}%`);

  isExecutorRunning = true;

  // Run immediately
  await executorLoop();

  // Then run every 30 seconds
  executorInterval = setInterval(executorLoop, 30 * 1000);

  logger.info('[EXECUTOR] ✅ Trade Desk Executor started (checking every 30s)');
  return true;
}

export function stopTradeExecutor(): void {
  if (executorInterval) {
    clearInterval(executorInterval);
    executorInterval = null;
  }
  isExecutorRunning = false;
  logger.info('[EXECUTOR] 🛑 Trade Desk Executor stopped');
}

export function isExecutorActive(): boolean {
  return isExecutorRunning;
}

// ============================================
// CONFIGURATION
// ============================================

export function getExecutorRules(): TradingRules {
  return { ...tradingRules };
}

export function updateExecutorRules(updates: Partial<TradingRules>): TradingRules {
  tradingRules = { ...tradingRules, ...updates };
  logger.info('[EXECUTOR] Rules updated:', tradingRules);
  return tradingRules;
}

export function getExecutedTrades(): ExecutedTrade[] {
  return Array.from(executedTrades.values());
}

// ============================================
// MANUAL EXECUTION (for testing)
// ============================================

export async function manualExecute(signalId: string): Promise<boolean> {
  const allIdeas = await storage.getAllTradeIdeas();
  const idea = allIdeas.find((i: any) => i.id === signalId);

  if (!idea) {
    logger.error(`[EXECUTOR] Signal ${signalId} not found`);
    return false;
  }

  const signal: TradeDeskSignal = {
    id: idea.id,
    symbol: idea.symbol,
    direction: idea.direction as 'long' | 'short',
    assetType: idea.assetType as 'stock' | 'option',
    entryPrice: idea.entryPrice,
    targetPrice: idea.targetPrice,
    stopLoss: idea.stopLoss,
    confidenceScore: idea.confidenceScore || 50,
    probabilityBand: idea.probabilityBand || 'C',
    qualitySignals: idea.qualitySignals || [],
    source: idea.source,
    catalyst: idea.catalyst,
    timestamp: new Date(idea.timestamp),
  };

  return executeSignal(signal);
}
