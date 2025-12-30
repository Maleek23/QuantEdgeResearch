// Dedicated Lotto Play Scanner
// Actively hunts for cheap far-OTM weekly options with 20x return potential

import type { InsertTradeIdea, TradeIdea } from "@shared/schema";
import { detectSectorFocus, detectRiskProfile, detectResearchHorizon } from './sector-detector';
import { getTradierQuote, getTradierOptionsChain, getTradierOptionsChainsByDTE } from './tradier-api';
import { logger } from './logger';
import { formatInTimeZone } from 'date-fns-tz';
import { storage } from './storage';
import { isLottoCandidate, calculateLottoTargets, getLottoThresholds } from './lotto-detector';
import { sendLottoToDiscord } from './discord-service';
import { getLetterGrade } from './grading';

/**
 * Calculate quality signals for lotto plays based on underlying momentum and option characteristics
 * Returns an array of signals and a confidence score (0-100)
 */
interface LottoQualityResult {
  signals: string[];
  score: number;
  grade: string;
  isValidForDayTrade: boolean;
  isValidForSwingTrade: boolean;
}

function calculateLottoQuality(
  quote: { 
    change_percentage: number; 
    volume: number; 
    average_volume: number;
    last: number;
    week_52_high: number;
    week_52_low: number;
    high: number;
    low: number;
    open: number;
  },
  candidate: LottoCandidate
): LottoQualityResult {
  const signals: string[] = [];
  let score = 50; // Start at neutral
  
  // 1. MOMENTUM CHECK: Price change alignment with option direction
  const priceChange = quote.change_percentage || 0;
  const isCallOption = candidate.optionType === 'call';
  const momentumAligned = isCallOption ? priceChange > 0 : priceChange < 0;
  
  if (momentumAligned) {
    const absChange = Math.abs(priceChange);
    if (absChange >= 3) {
      signals.push(`strong_momentum_${absChange.toFixed(1)}%`);
      score += 20;
    } else if (absChange >= 1) {
      signals.push(`momentum_aligned_${absChange.toFixed(1)}%`);
      score += 10;
    } else {
      signals.push(`weak_momentum_${absChange.toFixed(1)}%`);
      score += 5;
    }
  } else if (Math.abs(priceChange) < 0.5) {
    signals.push('neutral_momentum');
    // No penalty for neutral
  } else {
    // Momentum against position
    signals.push(`counter_momentum_${priceChange.toFixed(1)}%`);
    score -= 15;
  }
  
  // 2. VOLUME CHECK: Relative volume vs average
  const relativeVolume = quote.average_volume > 0 
    ? quote.volume / quote.average_volume 
    : 1;
  
  if (relativeVolume >= 2.0) {
    signals.push(`high_volume_${relativeVolume.toFixed(1)}x`);
    score += 15;
  } else if (relativeVolume >= 1.2) {
    signals.push(`above_avg_volume_${relativeVolume.toFixed(1)}x`);
    score += 8;
  } else if (relativeVolume < 0.5) {
    signals.push('low_volume');
    score -= 10;
  }
  
  // 3. RANGE POSITION: Where is price in 52-week range?
  const range52w = quote.week_52_high - quote.week_52_low;
  if (range52w > 0) {
    const positionInRange = (quote.last - quote.week_52_low) / range52w;
    
    if (isCallOption && positionInRange < 0.3) {
      signals.push('near_52w_low_call_risky');
      score -= 10; // Calls near lows are risky
    } else if (!isCallOption && positionInRange > 0.7) {
      signals.push('near_52w_high_put_risky');
      score -= 10; // Puts near highs are risky
    } else if (isCallOption && positionInRange > 0.5) {
      signals.push('bullish_range_position');
      score += 5;
    } else if (!isCallOption && positionInRange < 0.5) {
      signals.push('bearish_range_position');
      score += 5;
    }
  }
  
  // 4. INTRADAY STRENGTH: Price vs intraday range
  const intradayRange = quote.high - quote.low;
  if (intradayRange > 0) {
    const intradayPosition = (quote.last - quote.low) / intradayRange;
    
    if (isCallOption && intradayPosition > 0.7) {
      signals.push('intraday_strength');
      score += 8;
    } else if (!isCallOption && intradayPosition < 0.3) {
      signals.push('intraday_weakness');
      score += 8;
    } else if (isCallOption && intradayPosition < 0.3) {
      signals.push('intraday_weak_for_call');
      score -= 5;
    } else if (!isCallOption && intradayPosition > 0.7) {
      signals.push('intraday_strong_for_put');
      score -= 5;
    }
  }
  
  // 5. DELTA CHECK: Optimal delta range for lotto plays (0.05-0.20)
  const absDelta = Math.abs(candidate.delta);
  if (absDelta >= 0.08 && absDelta <= 0.15) {
    signals.push(`optimal_delta_${absDelta.toFixed(2)}`);
    score += 10;
  } else if (absDelta < 0.05) {
    signals.push('very_far_otm');
    score -= 5; // Too far OTM, unlikely to hit
  } else if (absDelta > 0.20) {
    signals.push('close_to_money');
    score += 5; // More likely to hit but smaller R:R
  }
  
  // 6. DTE PREMIUM: Short DTE needs stronger signals
  if (candidate.daysToExpiry <= 2) {
    signals.push('day_trade_dte');
    // Day trades need extra conviction - penalty if momentum not strong
    if (!signals.some(s => s.includes('strong_momentum'))) {
      score -= 10;
    }
  } else if (candidate.daysToExpiry <= 7) {
    signals.push('weekly_dte');
  }
  
  // 7. OPTION VOLUME: Check if option itself has volume
  if (candidate.volume >= 1000) {
    signals.push(`option_volume_${candidate.volume}`);
    score += 8;
  } else if (candidate.volume >= 100) {
    signals.push('option_has_volume');
    score += 3;
  } else if (candidate.volume === 0) {
    signals.push('no_option_volume');
    score -= 5;
  }
  
  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));
  
  const grade = getLetterGrade(score);
  
  // Minimum grade requirements:
  // - Day trades (0-2 DTE): Require B grade (80+) - high risk needs strong conviction
  // - Swing trades (3+ DTE): Require C grade (70+) - more time to work
  const isValidForDayTrade = score >= 80; // B- or better
  const isValidForSwingTrade = score >= 70; // C- or better
  
  return {
    signals,
    score,
    grade,
    isValidForDayTrade,
    isValidForSwingTrade
  };
}

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

// Check if market is open
function isMarketOpen(): { isOpen: boolean; reason: string } {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  const dateStr = etTime.toISOString().split('T')[0];
  
  if (day === 0 || day === 6) return { isOpen: false, reason: 'Weekend' };
  if (MARKET_HOLIDAYS.has(dateStr)) return { isOpen: false, reason: `Holiday (${dateStr})` };
  if (timeInMinutes < 570 || timeInMinutes >= 960) return { isOpen: false, reason: 'Outside market hours' };
  return { isOpen: true, reason: 'Market open' };
}

// High-volatility tickers perfect for lotto plays - EXPANDED with Quantum, Nuclear, Healthcare penny stocks
// These are characterized by extreme volatility, binary catalysts, and retail interest
const LOTTO_SCAN_TICKERS = [
  // === CORE HIGH-VOLATILITY ===
  'TSLA', 'NVDA', 'AMD', 'SPY', 'QQQ', 'AAPL', 'MSFT', 'NFLX', 'META', 'GOOGL', 'AMZN',
  
  // === 🔬 QUANTUM COMPUTING PENNY LOTTOS ===
  'IONQ',   // IonQ - Trapped ion ($5-15)
  'RGTI',   // Rigetti - Superconducting ($1-10) ⚡ TOP LOTTO
  'QUBT',   // Quantum Computing Inc ($1-5) ⚡ TOP LOTTO
  'QBTS',   // D-Wave Quantum ($3-10) ⚡ TOP LOTTO
  'ARQQ',   // Arqit Quantum ($1-5) ⚡ TOP LOTTO
  
  // === ⚛️ NUCLEAR FUSION PENNY LOTTOS ===
  'NNE',    // Nano Nuclear Energy ($10-30)
  'OKLO',   // Oklo - Advanced fission ($10-40)
  'SMR',    // NuScale Power ($10-25)
  'UEC',    // Uranium Energy ($5-10)
  'DNN',    // Denison Mines ($1-3) ⚡ TOP LOTTO
  'URG',    // Ur-Energy ($1-3) ⚡ TOP LOTTO
  'LTBR',   // Lightbridge ($2-5) ⚡ TOP LOTTO
  
  // === 🧬 BIOTECH PENNY LOTTOS ===
  'NVAX',   // Novavax ($5-20)
  'EDIT',   // Editas Medicine ($2-10) ⚡ TOP LOTTO
  // REMOVED: BLUE (delisted)
  'INO',    // Inovio ($1-5) ⚡ TOP LOTTO
  'SRNE',   // Sorrento ($0.20-1) ⚡ ULTRA LOTTO
  'VXRT',   // Vaxart ($0.50-3) ⚡ ULTRA LOTTO
  'FATE',   // Fate Therapeutics ($1-5) ⚡ TOP LOTTO
  'GRTS',   // Gritstone bio ($0.50-3) ⚡ ULTRA LOTTO
  
  // === 💰 CRYPTO/MEME PENNY LOTTOS ===
  'MARA', 'RIOT', 'COIN', 'MSTR',
  'CLSK',   // CleanSpark
  'BTBT',   // Bit Digital ($2-5) ⚡ TOP LOTTO
  'BITF',   // Bitfarms ($1-5) ⚡ TOP LOTTO
  'WULF',   // TeraWulf ($3-8)
  
  // === 🚗 EV PENNY LOTTOS ===
  'LCID',   // Lucid ($2-5) ⚡ TOP LOTTO
  'NIO',    // NIO ($3-10)
  'CHPT',   // ChargePoint ($0.50-3) ⚡ ULTRA LOTTO
  'BLNK',   // Blink ($1-5) ⚡ TOP LOTTO
  // REMOVED: FFIE, GOEV (delisted)
  'NKLA',   // Nikola ($0.50-3) ⚡ ULTRA LOTTO
  
  // === 🚀 SPACE PENNY LOTTOS ===
  'SPCE',   // Virgin Galactic ($1-5) ⚡ TOP LOTTO
  'BKSY',   // BlackSky ($0.50-2) ⚡ ULTRA LOTTO
  // REMOVED: LLAP (delisted)
  
  // === ⚡ CLEAN ENERGY PENNY LOTTOS ===
  'PLUG',   // Plug Power ($1-5) ⚡ TOP LOTTO
  'FCEL',   // FuelCell ($0.50-3) ⚡ ULTRA LOTTO
  'STEM',   // Stem Inc ($0.50-2) ⚡ ULTRA LOTTO
  'QS',     // QuantumScape ($3-10)
  
  // === 🎮 RETAIL/MEME FAVORITES ===
  'PLTR', 'SOFI', 'HOOD', 'GME', 'AMC',
  'TLRY',   // Tilray ($1-5) ⚡ TOP LOTTO
  'CGC',    // Canopy ($2-10)
  'SNDL',   // SNDL ($1-3) ⚡ TOP LOTTO
  
  // === 🤖 AI PENNY LOTTOS ===
  'SOUN',   // SoundHound ($5-15)
  'BBAI',   // BigBear.ai ($1-5) ⚡ TOP LOTTO
  'GFAI'    // Guardforce AI ($0.50-2) ⚡ ULTRA LOTTO
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

    // Filter for ≤14 days (lotto plays are near-term) AND valid trading days
    const today = new Date();
    const options = allOptions.filter(opt => {
      if (!opt.expiration_date) return false;
      // 🔒 VALIDATION: Skip options with invalid expiration dates (weekends, holidays)
      if (!isValidTradingDay(opt.expiration_date)) return false;
      const expiryDate = new Date(opt.expiration_date);
      const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysToExpiry <= 14;
    });

    logger.info(`🎰 [LOTTO] ${ticker}: Filtered to ${options.length} options with ≤14 days DTE (from ${allOptions.length} total)`);

    const thresholds = getLottoThresholds();
    const lottoCandidates: LottoCandidate[] = [];

    let noBidAskCount = 0;
    
    for (const option of options) {
      // 🔒 STRICT PRICING: REQUIRE bid/ask for accurate premiums - don't use stale 'last' price
      const hasBidAsk = option.bid && option.bid > 0 && option.ask && option.ask > 0;
      if (!hasBidAsk) {
        noBidAskCount++;
        continue; // Skip options without live bid/ask (market likely closed)
      }
      const midPrice = (option.bid + option.ask) / 2;
      
      // Skip if missing critical data
      if (midPrice <= 0 || !option.greeks?.delta || !option.expiration_date) {
        continue;
      }

      // Calculate days to expiration
      const expiryDate = new Date(option.expiration_date);
      const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Check if meets lotto criteria (use mid-price for accurate assessment)
      const meetsLotto = isLottoCandidate({
        lastPrice: midPrice,
        greeks: option.greeks,
        expiration: option.expiration_date,
        symbol: option.symbol
      });

      if (meetsLotto) {
        const reasons: string[] = [];
        reasons.push(`$${midPrice.toFixed(2)} entry`);
        reasons.push(`Δ ${Math.abs(option.greeks.delta).toFixed(2)}`);
        reasons.push(`${daysToExpiry}d DTE`);
        
        lottoCandidates.push({
          symbol: option.symbol,
          underlying: option.underlying,
          optionType: option.option_type as 'call' | 'put',
          strike: option.strike,
          expiration: option.expiration_date,
          lastPrice: midPrice, // Use mid-price for accurate entry
          delta: option.greeks.delta,
          daysToExpiry,
          volume: option.volume || 0,
          reasons
        });

        logger.info(`🎰 [LOTTO] ✅ FOUND: ${ticker} ${option.option_type.toUpperCase()} $${option.strike} @ $${midPrice.toFixed(2)} - ${reasons.join(', ')}`);
      }
    }

    if (noBidAskCount > 0) {
      logger.info(`🎰 [LOTTO] ${ticker}: Skipped ${noBidAskCount} options without bid/ask (market closed?)`);
    }
    logger.info(`🎰 [LOTTO] ${ticker}: Found ${lottoCandidates.length} lotto candidates`);
    return lottoCandidates;
  } catch (error) {
    logger.error(`🎰 [LOTTO] Error scanning ${ticker}:`, error);
    return [];
  }
}

/**
 * Generate trade idea from lotto candidate with quality checks
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

    // 🔍 QUALITY CHECK: Calculate quality signals and score
    const quality = calculateLottoQuality(quote, candidate);
    const isDayTrade = candidate.daysToExpiry <= 2;
    
    // 🚫 FILTER: Reject low-quality ideas based on DTE
    if (isDayTrade && !quality.isValidForDayTrade) {
      logger.info(`🎰 [LOTTO] ❌ REJECTED ${ticker} day trade - Grade ${quality.grade} (${quality.score}) below B minimum. Signals: ${quality.signals.join(', ')}`);
      return null;
    }
    
    if (!isDayTrade && !quality.isValidForSwingTrade) {
      logger.info(`🎰 [LOTTO] ❌ REJECTED ${ticker} swing trade - Grade ${quality.grade} (${quality.score}) below C minimum. Signals: ${quality.signals.join(', ')}`);
      return null;
    }
    
    logger.info(`🎰 [LOTTO] ✅ QUALITY CHECK PASSED: ${ticker} Grade ${quality.grade} (${quality.score}). Signals: ${quality.signals.join(', ')}`);

    const currentPrice = quote.last;
    // For lotto plays, direction indicates market expectation (call=bullish, put=bearish)
    // But we're BUYING the option in both cases, so premium target is always 20x
    const direction = candidate.optionType === 'call' ? 'long' : 'short';
    
    // Calculate lotto targets (20x return on option premium)
    const entryPrice = candidate.lastPrice;
    const { targetPrice, riskRewardRatio } = calculateLottoTargets(entryPrice);
    
    // Calculate stop loss - 50% of premium for all lotto plays
    // (We're BUYING the option, so stop triggers if premium drops 50%)
    const stopLoss = entryPrice * 0.5;

    // Determine option type label based on DTE
    const optionTypeLabel = candidate.daysToExpiry <= 7 ? 'weekly' : candidate.daysToExpiry <= 30 ? 'monthly' : candidate.daysToExpiry <= 365 ? 'long-dated' : 'LEAPS';
    // 0-2 DTE = day trade, 3-14 DTE = swing trade, 15+ DTE = position trade
    const holdingTypeLabel = isDayTrade ? 'Day trade' : candidate.daysToExpiry <= 14 ? 'Swing trade' : 'Position trade';
    
    // Generate analysis with quality context
    const qualityContext = `[${quality.grade}] ${quality.signals.slice(0, 3).join(', ')}`;
    const analysis = `🎰 LOTTO PLAY: ${ticker} ${candidate.optionType.toUpperCase()} $${candidate.strike} expiring ${formatInTimeZone(new Date(candidate.expiration), 'America/Chicago', 'MMM dd, yyyy')} - Far OTM play (Δ ${Math.abs(candidate.delta).toFixed(2)}) targeting 20x return. Entry: $${entryPrice.toFixed(2)}, Target: $${targetPrice.toFixed(2)}. Quality: ${qualityContext}. HIGH RISK: ${optionTypeLabel} option with ${candidate.daysToExpiry}d until expiry. ${holdingTypeLabel} - sized for small account growth ($0.20-$2.00 entry range).`;

    // Get entry/exit windows based on DTE (days to expiry)
    const now = new Date();
    const dte = candidate.daysToExpiry;
    
    // Entry window scales with DTE:
    // - Short-dated (0-7 DTE): 1 hour entry window (act fast, theta decay)
    // - Medium-dated (8-30 DTE): 4 hours entry window  
    // - Long-dated (31-90 DTE): 24 hours entry window
    // - LEAPS (91+ DTE): 48 hours entry window (more time to enter position trades)
    let entryWindowMinutes: number;
    if (dte <= 7) {
      entryWindowMinutes = 60; // 1 hour
    } else if (dte <= 30) {
      entryWindowMinutes = 240; // 4 hours
    } else if (dte <= 90) {
      entryWindowMinutes = 1440; // 24 hours (1 day)
    } else {
      entryWindowMinutes = 2880; // 48 hours (2 days)
    }
    
    const entryValidUntilDate = new Date(now.getTime() + entryWindowMinutes * 60 * 1000);
    const entryWindow = formatInTimeZone(entryValidUntilDate, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX");
    
    // Exit window scales with DTE - give position time to work:
    // - Weekly (0-7 DTE): Exit same day/next day
    // - Monthly (8-30 DTE): Exit within 5-7 days (swing trade)
    // - Quarterly (31-90 DTE): Exit within 2-3 weeks
    // - LEAPS (91-365 DTE): Exit within 30-45 days
    // - Long LEAPS (365+ DTE): Exit within 60-90 days
    let exitWindowDays: number;
    let holdingPeriod: 'day' | 'swing' | 'position';
    
    if (dte <= 2) {
      // 0-2 DTE: True day trade - exit same/next day
      exitWindowDays = 1;
      holdingPeriod = 'day';
    } else if (dte <= 7) {
      // 3-7 DTE: Weekly swing trade - hold 2-3 days
      exitWindowDays = Math.min(3, dte - 1); // Exit at least 1 day before expiry
      holdingPeriod = 'swing';
    } else if (dte <= 30) {
      exitWindowDays = Math.min(7, Math.floor(dte * 0.5)); // 50% of DTE, max 7 days
      holdingPeriod = 'swing';
    } else if (dte <= 90) {
      exitWindowDays = Math.min(21, Math.floor(dte * 0.3)); // 30% of DTE, max 21 days
      holdingPeriod = 'swing';
    } else if (dte <= 365) {
      exitWindowDays = Math.min(45, Math.floor(dte * 0.15)); // 15% of DTE, max 45 days
      holdingPeriod = 'position';
    } else {
      // LEAPS (1+ year out)
      exitWindowDays = Math.min(90, Math.floor(dte * 0.1)); // 10% of DTE, max 90 days
      holdingPeriod = 'position';
    }
    
    // Calculate exit time (market close on that day, 3:30 PM CT)
    const exitDate = new Date(now);
    exitDate.setDate(exitDate.getDate() + exitWindowDays);
    exitDate.setHours(15, 30, 0, 0); // 3:30 PM CT
    const exitBy = formatInTimeZone(exitDate, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX");
    
    logger.info(`🎰 [LOTTO] ${ticker} TIMING: DTE=${dte}d → Entry window ${entryWindowMinutes}min, Exit in ${exitWindowDays}d (${holdingPeriod} trade)`);

    // Create trade idea
    const sectorFocus = detectSectorFocus(ticker);
    const riskProfile = detectRiskProfile(ticker, entryPrice, true, 'option'); // Always speculative for lotto
    const researchHorizon = detectResearchHorizon(holdingPeriod, candidate.daysToExpiry);
    
    const idea: InsertTradeIdea = {
      symbol: ticker,
      assetType: 'option' as const,
      direction,
      entryPrice,
      targetPrice,
      stopLoss,
      riskRewardRatio,
      confidenceScore: quality.score, // Dynamic confidence based on quality signals
      qualitySignals: quality.signals, // Store actual quality signals
      probabilityBand: quality.grade, // Store the calculated grade
      catalyst: `🎰 ${ticker} ${candidate.optionType.toUpperCase()} $${candidate.strike} | ${quality.grade} | Δ${Math.abs(candidate.delta).toFixed(2)} | ${dte}d DTE | ${holdingPeriod} trade`,
      analysis,
      sessionContext: `Market hours - Lotto play on ${ticker} (${holdingPeriod} trade)`,
      holdingPeriod,
      source: 'lotto',
      strikePrice: candidate.strike,
      optionType: candidate.optionType,
      expiryDate: candidate.expiration,
      entryValidUntil: entryWindow,
      exitBy,
      isLottoPlay: true, // FLAG AS LOTTO PLAY
      timestamp: formatInTimeZone(now, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX"),
      sectorFocus,
      riskProfile,
      researchHorizon,
      liquidityWarning: true, // All lotto plays get liquidity warning
      engineVersion: 'lotto_v3.1.0_quality_gated', // Track quality-gated version
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

    logger.info(`🎰 [LOTTO] ✅ Generated lotto play: ${ticker} ${candidate.optionType.toUpperCase()} $${candidate.strike} [${quality.grade}] - Entry $${entryPrice.toFixed(2)}, Target $${targetPrice.toFixed(2)} (20x)`);
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
    
    // 🔒 MARKET HOURS CHECK: Only scan when market is open
    const marketStatus = isMarketOpen();
    if (!marketStatus.isOpen) {
      logger.info(`🎰 [LOTTO] Skipping scan - ${marketStatus.reason}. Data would be stale.`);
      return;
    }
    
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
        const createdIdea = await storage.createTradeIdea(idea);
        successCount++;
        
        // Send to dedicated Lotto Discord channel
        try {
          await sendLottoToDiscord(createdIdea as TradeIdea);
        } catch (discordError) {
          logger.warn(`🎰 [LOTTO] Discord notification failed for ${candidate.underlying}:`, discordError);
        }
        
        // Auto-execute in paper trading portfolio
        try {
          const { autoExecuteLotto } = await import('./auto-lotto-trader');
          await autoExecuteLotto(createdIdea as TradeIdea);
        } catch (autoTradeError) {
          logger.warn(`🎰 [LOTTO] Auto-trade failed for ${candidate.underlying}:`, autoTradeError);
        }
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
