/**
 * TradingView Webhook Service
 * ===========================
 * Receives signals from TradingView strategy alerts (v15/v15B),
 * enriches with Tradier options data, creates trade ideas,
 * and sends Discord alerts.
 *
 * Flow: TV Alert → Webhook POST → Enrich → Trade Idea → Discord
 */

import { logger } from './logger';
import { db } from './db';
import { tradeIdeas } from '@shared/schema';
import { getTradierQuote, getTradierOptionsChainsByDTE } from './tradier-api';
import { isLottoCandidate, calculateLottoTargets } from './lotto-detector';
import { sendTradeIdeaToDiscord } from './discord-service';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TVWebhookPayload {
  secret: string;
  ticker: string;
  direction: 'long' | 'short' | 'buy' | 'sell';
  price: number;
  strategy?: string;       // e.g. "v15", "v15B"
  timeframe?: string;      // e.g. "15", "60"
  confidence?: string;     // "high", "medium", "low"
  signal_type?: string;    // "reversal", "breakout", "breakdown"
  message?: string;        // TradingView {{strategy.order.comment}}
}

// Rate limiting
const recentSignals = new Map<string, number>();
const MAX_SIGNALS_PER_MIN = 10;
const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 min cooldown per symbol

// ═══════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════

export function validateWebhookSecret(secret: string): boolean {
  const expected = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expected) {
    logger.error('[TV-WEBHOOK] TRADINGVIEW_WEBHOOK_SECRET not configured');
    return false;
  }
  return secret === expected;
}

function isRateLimited(ticker: string): boolean {
  const now = Date.now();
  const lastSignal = recentSignals.get(ticker);
  if (lastSignal && now - lastSignal < SIGNAL_COOLDOWN_MS) {
    return true;
  }

  // Global rate limit
  const recentCount = [...recentSignals.values()].filter(t => now - t < 60_000).length;
  if (recentCount >= MAX_SIGNALS_PER_MIN) {
    return true;
  }

  return false;
}

function normalizeDirection(dir: string): 'long' | 'short' {
  const d = dir.toLowerCase();
  if (d === 'buy' || d === 'long') return 'long';
  return 'short';
}

// ═══════════════════════════════════════════════════════════════
// OPTION SELECTION (from Tradier chain)
// ═══════════════════════════════════════════════════════════════

function isValidTradingDay(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00Z');
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return true;
}

async function pickBestOption(symbol: string, direction: 'long' | 'short', stockPrice: number) {
  const chain = await getTradierOptionsChainsByDTE(symbol);
  if (!chain || chain.length === 0) return null;

  const optionType: 'call' | 'put' = direction === 'long' ? 'call' : 'put';
  const today = new Date().toISOString().split('T')[0];

  const candidates = chain
    .filter(opt => {
      if (opt.option_type !== optionType) return false;
      if (!opt.bid || opt.bid <= 0 || !opt.ask || opt.ask <= 0) return false;
      if (!isValidTradingDay(opt.expiration_date)) return false;
      // Skip 0DTE unless very cheap (lotto)
      const midPrice = (opt.bid + opt.ask) / 2;
      if (opt.expiration_date === today && midPrice > 0.50) return false;
      // Delta 0.20-0.45 (slightly wider for TV signals)
      const delta = opt.greeks?.delta ? Math.abs(opt.greeks.delta) : 0;
      if (delta < 0.20 || delta > 0.45) return false;
      return true;
    })
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));

  if (candidates.length === 0) return null;

  const best = candidates[0];
  const midPrice = (best.bid + best.ask) / 2;
  const delta = best.greeks?.delta ? Math.abs(best.greeks.delta) : 0;
  const dte = Math.max(1, Math.ceil((new Date(best.expiration_date).getTime() - Date.now()) / 86400000));

  // Lotto check
  const isLotto = isLottoCandidate({
    lastPrice: midPrice,
    greeks: best.greeks,
    expiration: best.expiration_date,
    symbol: best.symbol,
  });

  let targetPremium: number;
  let stopPremium: number;

  if (isLotto) {
    const lottoTargets = calculateLottoTargets(midPrice, best.expiration_date);
    targetPremium = lottoTargets.targetPrice;
    stopPremium = 0.01;
  } else {
    // DTE-based targets matching options-enricher.ts pattern
    const mult = dte <= 3 ? 2.0 : dte <= 7 ? 1.75 : dte <= 14 ? 1.60 : 1.50;
    targetPremium = midPrice * mult;
    stopPremium = midPrice * 0.50;
  }

  const risk = midPrice - stopPremium;
  const reward = targetPremium - midPrice;
  const rr = risk > 0 ? reward / risk : 1;

  return {
    optionType,
    strikePrice: best.strike,
    expiryDate: best.expiration_date,
    entryPremium: +midPrice.toFixed(2),
    targetPremium: +targetPremium.toFixed(2),
    stopPremium: +stopPremium.toFixed(2),
    riskRewardRatio: +rr.toFixed(2),
    delta: +delta.toFixed(2),
    dte,
    isLotto,
    iv: best.greeks?.mid_iv || 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN PROCESSOR
// ═══════════════════════════════════════════════════════════════

export async function processSignal(payload: TVWebhookPayload): Promise<{ success: boolean; ideaId?: string; error?: string }> {
  const symbol = payload.ticker.toUpperCase();
  const direction = normalizeDirection(payload.direction);
  const strategy = payload.strategy || 'v15';
  const signalType = payload.signal_type || 'signal';
  const confidence = payload.confidence || 'high';

  logger.info(`[TV-WEBHOOK] Processing ${symbol} ${direction} signal (${strategy}, ${signalType})`);

  // Rate limit check
  if (isRateLimited(symbol)) {
    logger.warn(`[TV-WEBHOOK] Rate limited: ${symbol}`);
    return { success: false, error: 'Rate limited — cooldown active for this ticker' };
  }

  try {
    // 1. Get live quote
    const quote = await getTradierQuote(symbol);
    if (!quote || !quote.last || quote.last <= 0) {
      return { success: false, error: `Could not get quote for ${symbol}` };
    }
    const stockPrice = quote.last;

    // 2. Pick best option
    const option = await pickBestOption(symbol, direction, stockPrice);

    // 3. Build confidence score
    // TV signals from backtested strategy get high base confidence
    const confMap: Record<string, number> = { high: 85, medium: 75, low: 65 };
    let confScore = confMap[confidence] || 80;
    // Boost for reversal setups (highest WR in backtest)
    if (signalType === 'reversal') confScore = Math.min(95, confScore + 5);

    // 4. Build trade idea
    const now = new Date();
    const catalyst = payload.message || `TradingView ${strategy} ${signalType} signal on ${symbol}`;
    const isOption = !!option;

    const idea: any = {
      symbol,
      assetType: isOption ? 'option' : 'stock',
      direction,
      entryPrice: isOption ? option!.entryPremium : stockPrice,
      targetPrice: isOption ? option!.targetPremium : (direction === 'long' ? stockPrice * 1.03 : stockPrice * 0.97),
      stopLoss: isOption ? option!.stopPremium : (direction === 'long' ? stockPrice * 0.985 : stockPrice * 1.015),
      riskRewardRatio: isOption ? option!.riskRewardRatio : 2.0,
      catalyst,
      analysis: isOption
        ? `${strategy.toUpperCase()} ${signalType} signal. ${option!.optionType.toUpperCase()} $${option!.strikePrice} (delta: ${option!.delta}, IV: ${(option!.iv * 100).toFixed(0)}%) exp ${option!.expiryDate}. Entry: $${option!.entryPremium}, Target: $${option!.targetPremium}${option!.isLotto ? ' — LOTTO PLAY' : ''}.`
        : `${strategy.toUpperCase()} ${signalType} signal at $${stockPrice.toFixed(2)}. ${payload.message || ''}`,
      sessionContext: `TradingView ${strategy} ${payload.timeframe || '15'}min`,
      timestamp: now.toISOString(),
      source: 'tradingview',
      status: 'published',
      confidenceScore: confScore,
      probabilityBand: confScore >= 90 ? 'A+' : confScore >= 85 ? 'A' : confScore >= 80 ? 'B+' : 'B',
      visibility: 'private',
      isLottoPlay: isOption ? option!.isLotto : false,
      tradeType: isOption && option!.isLotto ? 'lotto' : 'swing',
    };

    // Add option fields if we have them
    if (isOption) {
      idea.optionType = option!.optionType;
      idea.strikePrice = option!.strikePrice;
      idea.expiryDate = option!.expiryDate;
      idea.optionDelta = option!.delta;
      idea.optionIV = option!.iv;
    }

    // 5. Insert into DB
    const [saved] = await db.insert(tradeIdeas).values(idea).returning();
    logger.info(`[TV-WEBHOOK] Saved trade idea: ${saved.id} — ${symbol} ${direction} ${isOption ? option!.optionType + ' $' + option!.strikePrice : 'stock'}`);

    // 6. Mark cooldown
    recentSignals.set(symbol, Date.now());

    // 7. Send Discord alert (bypass grade filters — user's own backtested signals)
    try {
      await sendTradeIdeaToDiscord(saved as any, { forceBypassFilters: true });
      logger.info(`[TV-WEBHOOK] Discord alert sent for ${symbol}`);
    } catch (e) {
      logger.error(`[TV-WEBHOOK] Discord alert failed: ${e}`);
    }

    return { success: true, ideaId: saved.id };
  } catch (error) {
    logger.error(`[TV-WEBHOOK] Error processing ${symbol}:`, error);
    return { success: false, error: `Processing failed: ${error}` };
  }
}

logger.info('[TV-WEBHOOK] TradingView Webhook Service initialized');
