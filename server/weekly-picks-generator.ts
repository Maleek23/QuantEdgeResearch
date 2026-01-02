/**
 * Weekly Premium Picks Generator
 * 
 * Generates curated option plays for the upcoming week similar to what
 * the Auto-Lotto Bot trades - META PUTs, NFLX PUTs, AAPL CALLs, etc.
 * 
 * Categories:
 * - 🎰 Lotto Plays: 0-7 DTE, far OTM, small position sizing (4x-15x targets)
 * - ⚡ Day Trades: 0-2 DTE, moderate OTM, quick in/out 
 * - 📊 Swing Trades: 3-14 DTE, slightly OTM, hold for directional move
 * 
 * Focus: Medium-to-High confidence (60%+) plays only
 */

import { logger } from './logger';
import { getTradierQuote, getTradierOptionsChainsByDTE } from './tradier-api';
import { calculateLottoTargets, isLottoCandidate } from './lotto-detector';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * Calculate days until next Monday (for trade entry timing)
 */
function getDaysUntilNextMonday(date: Date): number {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) return 1; // Sunday -> Monday is 1 day
  if (dayOfWeek === 6) return 2; // Saturday -> Monday is 2 days
  return 8 - dayOfWeek; // Other days -> next Monday
}

// Premium watchlist symbols - proven movers with liquid options
const PREMIUM_SYMBOLS = [
  // Mega-cap tech (most liquid options)
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  // High-beta momentum (great for swings)
  'NFLX', 'AMD', 'PLTR', 'COIN', 'HOOD', 'SOFI', 'RIVN',
  // Sector plays
  'XLF', 'XLE', 'QQQ', 'SPY', 'IWM',
  // Volatility favorites
  'MARA', 'RIOT', 'CLSK', 'GME', 'AMC',
  // Nuclear/AI themes
  'SMR', 'OKLO', 'IONQ', 'RGTI', 'QBTS'
];

export interface WeeklyPick {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  expirationFormatted: string; // Human readable date
  suggestedExitDate: string;   // Recommended exit timing
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetMultiplier: number;
  dteCategory: '0DTE' | '1-2DTE' | '3-7DTE' | 'swing';
  playType: 'lotto' | 'day_trade' | 'swing';
  confidence: number;
  catalyst: string;
  delta: number;
  volume: number;
  dte: number; // Days to expiration
  optimalHoldDays: number; // Recommended hold period based on analysis
  riskAnalysis: string; // Brief risk assessment
}

/**
 * Generate premium picks for next week
 */
export async function generateNextWeekPicks(): Promise<WeeklyPick[]> {
  logger.info('📋 [WEEKLY-PICKS] Generating premium picks for next week...');
  
  const picks: WeeklyPick[] = [];
  const now = new Date();
  const timezone = 'America/Chicago';
  
  for (const symbol of PREMIUM_SYMBOLS) {
    try {
      // Get current quote
      const quote = await getTradierQuote(symbol);
      if (!quote || quote.last <= 0) continue;
      
      const stockPrice = quote.last;
      const change = quote.change_percentage || 0;
      
      // Get options chain
      const optionsChain = await getTradierOptionsChainsByDTE(symbol);
      if (optionsChain.length === 0) continue;
      
      // Calculate today's date for 0DTE filtering
      const today = now.toISOString().split('T')[0];
      
      // Find good candidates for each play type
      for (const opt of optionsChain) {
        // Skip if no bid/ask
        if (!opt.bid || !opt.ask || opt.bid <= 0 || opt.ask <= 0) continue;
        
        const midPrice = (opt.bid + opt.ask) / 2;
        const delta = opt.greeks?.delta || 0;
        const absDelta = Math.abs(delta);
        
        // Calculate DTE
        const expDate = new Date(opt.expiration_date);
        const dte = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Skip 0DTE for weekly picks (they'd expire before next week)
        if (opt.expiration_date === today) continue;
        
        // Determine play type based on DTE and delta
        // For "next week" picks, we need slightly longer DTE since trades start Monday
        let playType: 'lotto' | 'day_trade' | 'swing' | null = null;
        let confidence = 60;
        
        // 🎰 LOTTO: Far OTM (delta ≤ 0.20), cheap premium, 5-14 DTE 
        // Strict delta cutoff to separate from day trades
        if (midPrice >= 0.15 && midPrice <= 2.00 && absDelta <= 0.20 && dte >= 5 && dte <= 14) {
          playType = 'lotto';
          confidence = 65 + Math.min((opt.volume || 0) / 500, 15); // Volume boost
          confidence = Math.min(85, confidence);
        }
        // ⚡ DAY TRADE: Near ATM (delta 0.30-0.50), moderate premium, 3-7 DTE
        // Higher delta = quick scalp potential for early week
        else if (absDelta >= 0.30 && absDelta <= 0.50 && dte >= 3 && dte <= 7 && midPrice >= 0.50 && midPrice <= 6.00) {
          playType = 'day_trade';
          confidence = 60 + absDelta * 40; // Higher delta = more responsive
          confidence = Math.min(80, confidence);
        }
        // 📊 SWING: Moderate OTM (delta 0.25-0.45), larger premium, 10-21 DTE
        // Longer hold time, more time for thesis to play out
        else if (absDelta >= 0.25 && absDelta <= 0.45 && dte >= 10 && dte <= 21 && midPrice >= 1.50 && midPrice <= 12.00) {
          playType = 'swing';
          confidence = 65 + Math.min((dte / 21) * 15, 15);
          confidence = Math.min(80, confidence);
        }
        
        if (!playType) continue;
        if (confidence < 60) continue; // Only medium-to-high confidence
        
        // Calculate targets based on play type
        let targetPrice: number;
        let stopLoss: number;
        let targetMultiplier: number;
        let dteCategory: '0DTE' | '1-2DTE' | '3-7DTE' | 'swing';
        
        if (playType === 'lotto') {
          const lottoTargets = calculateLottoTargets(midPrice, opt.expiration_date);
          targetPrice = lottoTargets.targetPrice;
          targetMultiplier = lottoTargets.targetMultiplier;
          dteCategory = lottoTargets.dteCategory;
          stopLoss = midPrice * 0.5; // 50% stop for lotto
        } else if (playType === 'day_trade') {
          targetMultiplier = 2; // 2x for day trades
          targetPrice = midPrice * targetMultiplier;
          stopLoss = midPrice * 0.7; // 30% stop
          dteCategory = '1-2DTE';
        } else {
          // Swing trade
          targetMultiplier = 1.5; // 50% gain for swings
          targetPrice = midPrice * targetMultiplier;
          stopLoss = midPrice * 0.8; // 20% stop
          dteCategory = 'swing';
        }
        
        // Determine catalyst
        const direction = opt.option_type === 'call' ? 'bullish' : 'bearish';
        const catalyst = change > 2 
          ? `Strong ${direction} momentum (+${change.toFixed(1)}% today)`
          : change < -2
          ? `Reversal play after ${change.toFixed(1)}% drop`
          : `Technical setup for ${direction} continuation`;
        
        // Calculate optimal hold days and suggested exit based on play type analysis
        let optimalHoldDays: number;
        let suggestedExitDate: string;
        let riskAnalysis: string;
        
        if (playType === 'lotto') {
          // Lotto: Hold 1-2 days max, quick scalp or bust
          optimalHoldDays = Math.min(2, dte - 1);
          const exitDate = new Date(now);
          exitDate.setDate(now.getDate() + optimalHoldDays + getDaysUntilNextMonday(now));
          suggestedExitDate = formatInTimeZone(exitDate, timezone, 'EEE MMM d');
          riskAnalysis = `Far OTM (δ${(absDelta * 100).toFixed(0)}), rapid theta decay. Exit quickly on 50%+ move or cut at -50%.`;
        } else if (playType === 'day_trade') {
          // Day trade: Same day or next day exit
          optimalHoldDays = 1;
          const exitDate = new Date(now);
          exitDate.setDate(now.getDate() + getDaysUntilNextMonday(now));
          suggestedExitDate = formatInTimeZone(exitDate, timezone, 'EEE MMM d') + ' (same day)';
          riskAnalysis = `Near ATM (δ${(absDelta * 100).toFixed(0)}), responsive to stock moves. Quick scalp, exit by 2PM CT.`;
        } else {
          // Swing: Hold 3-5 trading days, exit before theta accelerates
          optimalHoldDays = Math.min(5, Math.max(3, dte - 5));
          const exitDate = new Date(now);
          exitDate.setDate(now.getDate() + optimalHoldDays + getDaysUntilNextMonday(now));
          suggestedExitDate = formatInTimeZone(exitDate, timezone, 'EEE MMM d');
          riskAnalysis = `Moderate OTM (δ${(absDelta * 100).toFixed(0)}), ${dte} DTE cushion. Exit 5+ days before expiry to avoid theta crush.`;
        }
        
        // Format expiration as human readable
        const expirationFormatted = formatInTimeZone(expDate, timezone, 'EEE MMM d');
        
        picks.push({
          symbol,
          optionType: opt.option_type as 'call' | 'put',
          strike: opt.strike,
          expiration: opt.expiration_date,
          expirationFormatted,
          suggestedExitDate,
          entryPrice: Math.round(midPrice * 100) / 100,
          targetPrice: Math.round(targetPrice * 100) / 100,
          stopLoss: Math.round(stopLoss * 100) / 100,
          targetMultiplier,
          dteCategory,
          playType,
          confidence: Math.round(confidence),
          catalyst,
          delta: absDelta,
          volume: opt.volume || 0,
          dte,
          optimalHoldDays,
          riskAnalysis
        });
      }
      
    } catch (error) {
      logger.warn(`📋 [WEEKLY-PICKS] Error scanning ${symbol}:`, error);
    }
  }
  
  // Sort by confidence (highest first), then by volume
  picks.sort((a, b) => {
    const confDiff = b.confidence - a.confidence;
    if (Math.abs(confDiff) > 5) return confDiff;
    return b.volume - a.volume; // Higher volume = more liquid
  });
  
  // Dedupe: only keep best pick per symbol per play type
  const deduped: WeeklyPick[] = [];
  const seen = new Set<string>();
  
  for (const pick of picks) {
    const key = `${pick.symbol}-${pick.playType}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(pick);
    }
  }
  
  // Take top picks per category (balanced mix from different symbols)
  const lottos = deduped.filter(p => p.playType === 'lotto').slice(0, 5);
  const dayTrades = deduped.filter(p => p.playType === 'day_trade').slice(0, 5);
  const swings = deduped.filter(p => p.playType === 'swing').slice(0, 5);
  
  const finalPicks = [...lottos, ...dayTrades, ...swings];
  
  logger.info(`📋 [WEEKLY-PICKS] Generated ${finalPicks.length} premium picks (${lottos.length} lotto, ${dayTrades.length} day trades, ${swings.length} swings)`);
  
  return finalPicks;
}

/**
 * Get next week's date range for display
 */
export function getNextWeekRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  // Days until next Monday (if Sunday, next Monday is 1 day; if Monday, it's 7)
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  
  const nextFriday = new Date(nextMonday);
  nextFriday.setDate(nextMonday.getDate() + 4);
  
  return {
    start: formatInTimeZone(nextMonday, 'America/Chicago', 'MMM d'),
    end: formatInTimeZone(nextFriday, 'America/Chicago', 'MMM d')
  };
}
