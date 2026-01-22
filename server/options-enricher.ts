// Options Enrichment Utility
// Converts AI stock-price-based option ideas into real option trades with Tradier pricing

import { getTradierQuote, getTradierOptionsChainsByDTE } from './tradier-api';
import { isLottoCandidate, calculateLottoTargets } from './lotto-detector';
import { logger } from './logger';
import type { AITradeIdea } from './ai-service';

// US Market Holidays 2025-2026 (options don't expire on holidays)
const MARKET_HOLIDAYS = new Set([
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

// Validate expiration date is a valid trading day
function isValidTradingDay(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00Z');
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false; // Weekend
  if (MARKET_HOLIDAYS.has(dateStr)) return false; // Holiday
  return true;
}

interface EnrichedOptionTrade {
  symbol: string;
  assetType: 'option';
  direction: 'long' | 'short';
  entryPrice: number;           // Option premium (NOT stock price)
  targetPrice: number;          // Option premium target
  stopLoss: number;             // Option premium stop
  riskRewardRatio: number;
  catalyst: string;
  analysis: string;
  sessionContext: string;
  optionType: 'call' | 'put';
  strikePrice: number;
  expiryDate: string;
  isLottoPlay: boolean;
}

/**
 * Enrich AI option ideas with real Tradier data
 * 
 * AI provides stock-price-based direction/targets. We need to:
 * 1. Fetch real options chain from Tradier
 * 2. Pick appropriate strike based on AI's directional view
 * 3. Use real option premium as entry price
 * 4. Calculate premium-based targets (not stock targets)
 * 5. Detect if it's a Lotto play
 * 
 * @param aiIdea - AI-generated option idea (uses stock prices)
 * @returns Enriched option trade with real premiums, or null if unable to enrich
 */
export async function enrichOptionIdea(aiIdea: AITradeIdea): Promise<EnrichedOptionTrade | null> {
  try {
    logger.info(`[OPTIONS-ENRICH] Processing ${aiIdea.symbol} ${aiIdea.direction} option from AI...`);

    // 1. Get current stock price
    const quote = await getTradierQuote(aiIdea.symbol);
    if (!quote || quote.last <= 0) {
      logger.warn(`[OPTIONS-ENRICH] Failed to get quote for ${aiIdea.symbol}`);
      return null;
    }
    
    const stockPrice = quote.last;
    logger.info(`[OPTIONS-ENRICH] ${aiIdea.symbol} stock price: $${stockPrice.toFixed(2)}`);

    // 2. Fetch options chain across all expirations (multi-expiration coverage)
    const optionsChain = await getTradierOptionsChainsByDTE(aiIdea.symbol);
    if (optionsChain.length === 0) {
      logger.warn(`[OPTIONS-ENRICH] No options chain available for ${aiIdea.symbol}`);
      return null;
    }
    
    logger.info(`[OPTIONS-ENRICH] Fetched ${optionsChain.length} options across multiple expirations for ${aiIdea.symbol}`);

    // 3. Determine option type based on AI's direction
    // Direction 'long' = Call, Direction 'short' = Put
    const optionType: 'call' | 'put' = aiIdea.direction === 'short' ? 'put' : 'call';
    
    // 4. Filter options by type and find good candidates
    // 🔒 STRICT PRICING: REQUIRE bid/ask for accurate premiums - don't use stale 'last' price
    // 🔒 VALIDATION: Also filter out options with invalid expiration dates (weekends, holidays)
    const optionsByType = optionsChain.filter(opt => {
      // REQUIRE bid/ask for accurate pricing
      const hasBidAsk = opt.bid && opt.bid > 0 && opt.ask && opt.ask > 0;
      if (!hasBidAsk) return false; // Skip options without live bid/ask
      
      const midPrice = (opt.bid + opt.ask) / 2;
      
      return opt.option_type === optionType && 
        midPrice > 0 &&
        opt.volume > 0 &&
        opt.expiration_date && 
        isValidTradingDay(opt.expiration_date);
    });

    if (optionsByType.length === 0) {
      logger.warn(`[OPTIONS-ENRICH] No ${optionType}s with volume for ${aiIdea.symbol}`);
      return null;
    }

    // 5. Pick strike based on delta (0.25-0.35 for balanced risk/reward)
    // For Lotto plays, we want far OTM (delta ≤0.30)
    // For standard plays, we want slightly OTM (delta 0.25-0.40)
    
    // 🔧 FIX: Filter out 0DTE options for standard plays - they expire too fast!
    // Only allow 0DTE for explicit lotto plays where we want same-day gamma explosion
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const goodOptions = optionsByType
      .filter(opt => {
        const hasDelta = opt.greeks?.delta && Math.abs(opt.greeks.delta) >= 0.20 && Math.abs(opt.greeks.delta) <= 0.40;
        const is0DTE = opt.expiration_date === today;
        // Skip 0DTE for standard plays - they get expired by validation before they can trade
        // Allow 0DTE only for very cheap options ($0.50 or less) which are lotto candidates
        const midPrice = opt.bid && opt.ask ? (opt.bid + opt.ask) / 2 : opt.last;
        const isLottoCandidate = midPrice <= 0.50;
        
        if (is0DTE && !isLottoCandidate) {
          return false; // Skip 0DTE for non-lotto plays
        }
        return hasDelta;
      })
      .sort((a, b) => (b.volume || 0) - (a.volume || 0)); // Sort by volume descending

    if (goodOptions.length === 0) {
      logger.warn(`[OPTIONS-ENRICH] No options with suitable delta for ${aiIdea.symbol} (0DTE excluded for non-lotto)`);
      return null;
    }

    // Pick the most liquid option (highest volume)
    const selectedOption = goodOptions[0];
    // 🔒 PRICING FIX: Use bid/ask mid-price for accurate entry premium
    const hasBidAsk = selectedOption.bid && selectedOption.bid > 0 && selectedOption.ask && selectedOption.ask > 0;
    const entryPremium = hasBidAsk ? (selectedOption.bid + selectedOption.ask) / 2 : selectedOption.last;
    const strikePrice = selectedOption.strike;
    const expiryDate = selectedOption.expiration_date;
    const delta = selectedOption.greeks?.delta || 0;

    logger.info(`[OPTIONS-ENRICH] Selected ${optionType.toUpperCase()} $${strikePrice} (delta: ${Math.abs(delta).toFixed(2)}, premium: $${entryPremium.toFixed(2)}, exp: ${expiryDate})`);

    // 6. Check if this is a Lotto play
    const isLotto = isLottoCandidate({
      lastPrice: entryPremium,
      greeks: selectedOption.greeks,
      expiration: expiryDate,
      symbol: selectedOption.symbol
    });

    // 7. Calculate targets based on premium movement
    let targetPremium: number;
    let stopPremium: number;
    let riskRewardRatio: number;

    if (isLotto) {
      // Lotto plays: DTE-aware targets (0DTE=4x, 1-2DTE=7x, 3-7DTE=15x)
      const lottoTargets = calculateLottoTargets(entryPremium, expiryDate);
      targetPremium = lottoTargets.targetPrice;
      riskRewardRatio = lottoTargets.riskRewardRatio;
      // For lotto, risk entire premium (stop = $0.01)
      stopPremium = 0.01;
      logger.info(`[OPTIONS-ENRICH] 🎰 LOTTO DETECTED (${lottoTargets.dteCategory}): Target ${lottoTargets.targetMultiplier}x ($${targetPremium.toFixed(2)})`);
    } else {
      // 🔧 FIX: OPTIONS PREMIUM TARGETS - You're always BUYING the option!
      // Whether CALL or PUT, you BUY the option and want premium to increase.
      // - CALL (direction='long'): Buy call, stock up, call premium UP ✓
      // - PUT (direction='short'): Buy put, stock down, put premium UP ✓
      // Both cases: You profit when premium goes UP!
      // MINIMUM 50-75% gain targets - options are risky, need real upside!
      // DTE-based: Shorter DTE = higher target (more gamma), Longer DTE = lower (slower theta)
      const daysToExpiry = Math.max(1, Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      let targetMultiplier: number;
      if (daysToExpiry <= 3) {
        targetMultiplier = 2.0; // 100% gain for short DTE (high gamma)
      } else if (daysToExpiry <= 7) {
        targetMultiplier = 1.75; // 75% gain for weekly
      } else if (daysToExpiry <= 14) {
        targetMultiplier = 1.60; // 60% gain for 2-week
      } else {
        targetMultiplier = 1.50; // 50% minimum for swing/monthly
      }
      
      targetPremium = entryPremium * targetMultiplier;
      stopPremium = entryPremium * 0.50; // 50% max loss on premium (risk management)
      
      const risk = entryPremium - stopPremium;
      const reward = targetPremium - entryPremium;
      riskRewardRatio = reward / risk;
      const gainPercent = Math.round((targetMultiplier - 1) * 100);
      
      logger.info(`[OPTIONS-ENRICH] Standard play: Entry=$${entryPremium.toFixed(2)}, Target=$${targetPremium.toFixed(2)} (+${gainPercent}%), Stop=$${stopPremium.toFixed(2)} (-50%), R:R=${riskRewardRatio.toFixed(2)}:1, DTE=${daysToExpiry}`);
    }

    // 8. Build enriched analysis
    const daysToExp = Math.max(1, Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const gainTarget = isLotto ? '20x' : daysToExp <= 3 ? '+100%' : daysToExp <= 7 ? '+75%' : daysToExp <= 14 ? '+60%' : '+50%';
    const enrichedAnalysis = `${aiIdea.analysis} OPTIONS PLAY: ${optionType.toUpperCase()} $${strikePrice} (delta: ${Math.abs(delta).toFixed(2)}) expiring ${expiryDate}. Entry premium: $${entryPremium.toFixed(2)}${isLotto ? ' - LOTTO PLAY targeting 20x return' : ` targeting ${gainTarget} gain`}.`;

    return {
      symbol: aiIdea.symbol,
      assetType: 'option',
      direction: aiIdea.direction,
      entryPrice: entryPremium,
      targetPrice: targetPremium,
      stopLoss: stopPremium,
      riskRewardRatio,
      catalyst: aiIdea.catalyst,
      analysis: enrichedAnalysis,
      sessionContext: aiIdea.sessionContext,
      optionType,
      strikePrice,
      expiryDate,
      isLottoPlay: isLotto
    };

  } catch (error) {
    logger.error(`[OPTIONS-ENRICH] Failed to enrich ${aiIdea.symbol} option:`, error);
    return null;
  }
}
