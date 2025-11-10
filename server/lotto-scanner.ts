// Dedicated Lotto Play Scanner
// Actively hunts for cheap far-OTM weekly options with 20x return potential

import type { InsertTradeIdea } from "@shared/schema";
import { getTradierQuote, getTradierOptionsChain, getTradierOptionsChainsByDTE } from './tradier-api';
import { logger } from './logger';
import { formatInTimeZone } from 'date-fns-tz';
import { storage } from './storage';
import { isLottoCandidate, calculateLottoTargets, getLottoThresholds } from './lotto-detector';

// High-volatility tickers perfect for lotto plays
const LOTTO_SCAN_TICKERS = [
  'TSLA', 'NVDA', 'AMD', 'MARA', 'RIOT', 'COIN', 'PLTR', 'SOFI', 'HOOD',
  'MSTR', 'GME', 'AMC', 'SPY', 'QQQ', 'AAPL', 'MSFT', 'NFLX', 'META', 'GOOGL', 'AMZN'
];

interface LottoCandidate {
  symbol: string;
  underlying: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  lastPrice: number;
  delta: number;
  daysToExpiry: number;
  volume: number;
  reasons: string[];
}

/**
 * Scan for lotto play candidates (cheap far-OTM weeklies)
 */
async function scanForLottoPlays(ticker: string): Promise<LottoCandidate[]> {
  try {
    logger.info(`🎰 [LOTTO] Scanning for lotto plays in ${ticker}...`);
    
    // Get options chain across multiple expirations
    const allOptions = await getTradierOptionsChainsByDTE(ticker);
    
    if (allOptions.length === 0) {
      logger.info(`🎰 [LOTTO] No options data for ${ticker}`);
      return [];
    }

    // Filter for ≤14 days (lotto plays are near-term)
    const today = new Date();
    const options = allOptions.filter(opt => {
      if (!opt.expiration_date) return false;
      const expiryDate = new Date(opt.expiration_date);
      const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysToExpiry <= 14;
    });

    logger.info(`🎰 [LOTTO] ${ticker}: Filtered to ${options.length} options with ≤14 days DTE (from ${allOptions.length} total)`);

    const thresholds = getLottoThresholds();
    const lottoCandidates: LottoCandidate[] = [];

    for (const option of options) {
      // Skip if missing critical data
      if (!option.last || option.last <= 0 || !option.greeks?.delta || !option.expiration_date) {
        continue;
      }

      // Calculate days to expiration
      const expiryDate = new Date(option.expiration_date);
      const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Check if meets lotto criteria
      const meetsLotto = isLottoCandidate({
        lastPrice: option.last,
        greeks: option.greeks,
        expiration: option.expiration_date,
        symbol: option.symbol
      });

      if (meetsLotto) {
        const reasons: string[] = [];
        reasons.push(`$${option.last.toFixed(2)} entry`);
        reasons.push(`Δ ${Math.abs(option.greeks.delta).toFixed(2)}`);
        reasons.push(`${daysToExpiry}d DTE`);
        
        lottoCandidates.push({
          symbol: option.symbol,
          underlying: option.underlying,
          optionType: option.option_type as 'call' | 'put',
          strike: option.strike,
          expiration: option.expiration_date,
          lastPrice: option.last,
          delta: option.greeks.delta,
          daysToExpiry,
          volume: option.volume || 0,
          reasons
        });

        logger.info(`🎰 [LOTTO] ✅ FOUND: ${ticker} ${option.option_type.toUpperCase()} $${option.strike} - ${reasons.join(', ')}`);
      }
    }

    logger.info(`🎰 [LOTTO] ${ticker}: Found ${lottoCandidates.length} lotto candidates`);
    return lottoCandidates;
  } catch (error) {
    logger.error(`🎰 [LOTTO] Error scanning ${ticker}:`, error);
    return [];
  }
}

/**
 * Generate trade idea from lotto candidate
 */
async function generateLottoTradeIdea(candidate: LottoCandidate): Promise<InsertTradeIdea | null> {
  try {
    const ticker = candidate.underlying;
    
    // Get current underlying price
    const quote = await getTradierQuote(ticker);
    if (!quote) {
      logger.error(`🎰 [LOTTO] Failed to get quote for ${ticker}`);
      return null;
    }

    const currentPrice = quote.last;
    const direction = candidate.optionType === 'call' ? 'long' : 'short';
    
    // Calculate lotto targets (20x return)
    const entryPrice = candidate.lastPrice;
    const { targetPrice, riskRewardRatio } = calculateLottoTargets(entryPrice, direction);
    
    // Calculate stop loss (100% loss on premium - this is lotto plays after all)
    const stopLoss = direction === 'long' 
      ? entryPrice * 0.5  // 50% stop for calls
      : entryPrice * 1.5; // 50% loss tolerance for puts

    // Generate analysis
    const analysis = `🎰 LOTTO PLAY: ${ticker} ${candidate.optionType.toUpperCase()} $${candidate.strike} expiring ${formatInTimeZone(new Date(candidate.expiration), 'America/Chicago', 'MMM dd')} - Far OTM play (Δ ${Math.abs(candidate.delta).toFixed(2)}) targeting 20x return. Entry: $${entryPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}. HIGH RISK: Weekly option with ${candidate.daysToExpiry}d until expiry. Sized for small account growth ($0.20-$2.00 entry range).`;

    // Get entry/exit windows (same day - lotto plays are intraday)
    const now = new Date();
    const entryWindow = formatInTimeZone(now, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX");
    const marketClose = new Date(now);
    marketClose.setHours(15, 30, 0, 0); // 3:30 PM CT
    const exitBy = formatInTimeZone(marketClose, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX");

    // Create trade idea
    const idea: InsertTradeIdea = {
      symbol: ticker,
      assetType: 'option' as const,
      direction,
      entryPrice,
      targetPrice,
      stopLoss,
      riskRewardRatio,
      confidenceScore: 40, // Lower confidence for lotto plays (high risk)
      catalyst: `🎰 Lotto Play: Far OTM weekly option targeting 20x return`,
      analysis,
      sessionContext: `Market hours - Lotto play on ${ticker}`,
      holdingPeriod: 'day' as const,
      source: 'lotto',
      strikePrice: candidate.strike,
      optionType: candidate.optionType,
      expiryDate: candidate.expiration,
      entryValidUntil: entryWindow,
      exitBy,
      isLottoPlay: true, // FLAG AS LOTTO PLAY
      timestamp: formatInTimeZone(now, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX")
    };

    // Basic validation: ensure prices make sense
    if (direction === 'long' && targetPrice <= entryPrice) {
      logger.warn(`🎰 [LOTTO] ${ticker} invalid prices for long: target must be > entry`);
      return null;
    }
    if (direction === 'short' && targetPrice >= entryPrice) {
      logger.warn(`🎰 [LOTTO] ${ticker} invalid prices for short: target must be < entry`);
      return null;
    }

    logger.info(`🎰 [LOTTO] ✅ Generated lotto play: ${ticker} ${candidate.optionType.toUpperCase()} $${candidate.strike} - Entry $${entryPrice.toFixed(2)}, Target $${targetPrice.toFixed(2)} (20x)`);
    return idea;
  } catch (error) {
    logger.error(`🎰 [LOTTO] Error generating trade idea for ${candidate.underlying}:`, error);
    return null;
  }
}

/**
 * Main lotto scanner - hunt for cheap far-OTM weeklies across all tickers
 */
export async function runLottoScanner(): Promise<void> {
  try {
    logger.info(`🎰 [LOTTO] ========== LOTTO SCANNER STARTED ==========`);
    const startTime = Date.now();

    const allCandidates: LottoCandidate[] = [];
    
    // Scan all tickers for lotto plays
    for (const ticker of LOTTO_SCAN_TICKERS) {
      const candidates = await scanForLottoPlays(ticker);
      allCandidates.push(...candidates);
    }

    logger.info(`🎰 [LOTTO] Total candidates found: ${allCandidates.length}`);

    // Sort by best opportunities (cheapest entry, lowest delta = furthest OTM)
    allCandidates.sort((a, b) => {
      // Prefer cheaper entries
      if (a.lastPrice !== b.lastPrice) {
        return a.lastPrice - b.lastPrice;
      }
      // Then prefer lower delta (further OTM)
      return Math.abs(a.delta) - Math.abs(b.delta);
    });

    // Generate trade ideas for top 5 lotto plays
    const TOP_LOTTO_PLAYS = 5;
    const topCandidates = allCandidates.slice(0, TOP_LOTTO_PLAYS);
    
    let successCount = 0;
    let duplicateCount = 0;

    for (const candidate of topCandidates) {
      // Check for duplicates
      const existing = await storage.getAllTradeIdeas();

      const isDuplicate = existing.some((idea: any) =>
        idea.symbol === candidate.underlying &&
        idea.assetType === 'option' &&
        idea.source === 'lotto' && 
        idea.strikePrice === candidate.strike &&
        idea.optionType === candidate.optionType &&
        idea.expiryDate === candidate.expiration &&
        new Date(idea.timestamp).getTime() > Date.now() - 4 * 60 * 60 * 1000 // Within 4 hours
      );

      if (isDuplicate) {
        logger.info(`🎰 [LOTTO] Skipping duplicate: ${candidate.underlying} ${candidate.optionType.toUpperCase()} $${candidate.strike}`);
        duplicateCount++;
        continue;
      }

      const idea = await generateLottoTradeIdea(candidate);
      if (idea) {
        await storage.createTradeIdea(idea);
        successCount++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`🎰 [LOTTO] ========== SCAN COMPLETE ==========`);
    logger.info(`🎰 [LOTTO] Duration: ${duration}s`);
    logger.info(`🎰 [LOTTO] Candidates: ${allCandidates.length}`);
    logger.info(`🎰 [LOTTO] Generated: ${successCount}`);
    logger.info(`🎰 [LOTTO] Duplicates: ${duplicateCount}`);
  } catch (error) {
    logger.error(`🎰 [LOTTO] Fatal error in scanner:`, error);
  }
}
