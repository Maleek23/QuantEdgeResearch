// Options Enrichment Utility
// Converts AI stock-price-based option ideas into real option trades with Tradier pricing

import { getTradierQuote, getTradierOptionsChain } from './tradier-api';
import { isLottoCandidate, calculateLottoTargets } from './lotto-detector';
import { logger } from './logger';
import type { AITradeIdea } from './ai-service';

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

    // 2. Fetch options chain
    const optionsChain = await getTradierOptionsChain(aiIdea.symbol);
    if (optionsChain.length === 0) {
      logger.warn(`[OPTIONS-ENRICH] No options chain available for ${aiIdea.symbol}`);
      return null;
    }

    // 3. Determine option type based on AI's direction
    const optionType: 'call' | 'put' = aiIdea.direction === 'long' ? 'call' : 'put';
    
    // 4. Filter options by type and find good candidates
    const optionsByType = optionsChain.filter(opt => 
      opt.option_type === optionType && 
      opt.last > 0 &&
      opt.volume > 0
    );

    if (optionsByType.length === 0) {
      logger.warn(`[OPTIONS-ENRICH] No ${optionType}s with volume for ${aiIdea.symbol}`);
      return null;
    }

    // 5. Pick strike based on delta (0.25-0.35 for balanced risk/reward)
    // For Lotto plays, we want far OTM (delta ≤0.30)
    // For standard plays, we want slightly OTM (delta 0.25-0.40)
    const goodOptions = optionsByType
      .filter(opt => opt.greeks?.delta && Math.abs(opt.greeks.delta) >= 0.20 && Math.abs(opt.greeks.delta) <= 0.40)
      .sort((a, b) => (b.volume || 0) - (a.volume || 0)); // Sort by volume descending

    if (goodOptions.length === 0) {
      logger.warn(`[OPTIONS-ENRICH] No options with suitable delta for ${aiIdea.symbol}`);
      return null;
    }

    // Pick the most liquid option (highest volume)
    const selectedOption = goodOptions[0];
    const entryPremium = selectedOption.last;
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
      // Lotto plays: 20x targets
      const lottoTargets = calculateLottoTargets(entryPremium, aiIdea.direction);
      targetPremium = lottoTargets.targetPrice;
      riskRewardRatio = lottoTargets.riskRewardRatio;
      // For lotto, risk entire premium (stop = $0.01)
      stopPremium = 0.01;
      logger.info(`[OPTIONS-ENRICH] 🎰 LOTTO DETECTED: Target 20x ($${targetPremium.toFixed(2)})`);
    } else {
      // Standard options: 25% gain target, 6.25% stop (maintains 4:1 R:R)
      if (aiIdea.direction === 'long') {
        targetPremium = entryPremium * 1.25; // +25%
        stopPremium = entryPremium * 0.9375; // -6.25%
      } else {
        targetPremium = entryPremium * 0.75; // -25%
        stopPremium = entryPremium * 1.0625; // +6.25%
      }
      
      const risk = Math.abs(entryPremium - stopPremium);
      const reward = Math.abs(targetPremium - entryPremium);
      riskRewardRatio = reward / risk;
      
      logger.info(`[OPTIONS-ENRICH] Standard play: Entry=$${entryPremium.toFixed(2)}, Target=$${targetPremium.toFixed(2)} (+25%), Stop=$${stopPremium.toFixed(2)} (-6.25%), R:R=${riskRewardRatio.toFixed(2)}:1`);
    }

    // 8. Build enriched analysis
    const enrichedAnalysis = `${aiIdea.analysis} OPTIONS PLAY: ${optionType.toUpperCase()} $${strikePrice} (delta: ${Math.abs(delta).toFixed(2)}) expiring ${expiryDate}. Entry premium: $${entryPremium.toFixed(2)}${isLotto ? ' - LOTTO PLAY targeting 20x return' : ' targeting +25% gain'}.`;

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
