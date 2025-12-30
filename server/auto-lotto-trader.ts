import { storage } from "./storage";
import { executeTradeIdea, checkStopsAndTargets, updatePositionPrices } from "./paper-trading-service";
import { sendBotTradeEntryToDiscord, sendBotTradeExitToDiscord } from "./discord-service";
import { getTradierQuote, getTradierOptionsChainsByDTE } from "./tradier-api";
import { calculateLottoTargets, getLottoThresholds } from "./lotto-detector";
import { getLetterGrade } from "./grading";
import { formatInTimeZone } from "date-fns-tz";
import { TradeIdea, PaperPortfolio, InsertTradeIdea } from "@shared/schema";
import { logger } from "./logger";
import { getMarketContext, getEntryTiming, checkDynamicExit, MarketContext } from "./market-context-service";

const LOTTO_PORTFOLIO_NAME = "Auto-Lotto Bot";
const SYSTEM_USER_ID = "system-auto-trader";
const LOTTO_STARTING_CAPITAL = 300;
const MAX_POSITION_SIZE = 50;

let lottoPortfolio: PaperPortfolio | null = null;

interface BotDecision {
  action: 'enter' | 'skip' | 'wait';
  reason: string;
  confidence: number;
  signals: string[];
}

interface LottoOpportunity {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: string;
  delta: number;
  price: number;
  volume: number;
  daysToExpiry: number;
}

const BOT_SCAN_TICKERS = [
  'TSLA', 'NVDA', 'AMD', 'SPY', 'QQQ', 'AAPL', 'META', 'GOOGL', 'AMZN', 'NFLX',
  'IONQ', 'RGTI', 'QUBT', 'QBTS', 'MARA', 'RIOT', 'COIN', 'SOFI', 'HOOD', 'PLTR'
];

export async function getLottoPortfolio(): Promise<PaperPortfolio | null> {
  try {
    if (lottoPortfolio) {
      return lottoPortfolio;
    }

    const portfolios = await storage.getPaperPortfoliosByUser(SYSTEM_USER_ID);
    const existing = portfolios.find(p => p.name === LOTTO_PORTFOLIO_NAME);
    
    if (existing) {
      lottoPortfolio = existing;
      logger.info(`🤖 [BOT] Found portfolio: ${existing.id} (Balance: $${existing.cashBalance.toFixed(2)})`);
      return existing;
    }

    const newPortfolio = await storage.createPaperPortfolio({
      userId: SYSTEM_USER_ID,
      name: LOTTO_PORTFOLIO_NAME,
      startingCapital: LOTTO_STARTING_CAPITAL,
      cashBalance: LOTTO_STARTING_CAPITAL,
      totalValue: LOTTO_STARTING_CAPITAL,
      maxPositionSize: MAX_POSITION_SIZE,
      riskPerTrade: 0.05,
    });

    lottoPortfolio = newPortfolio;
    logger.info(`🤖 [BOT] Created new portfolio: ${newPortfolio.id} with $${LOTTO_STARTING_CAPITAL}`);
    return newPortfolio;
  } catch (error) {
    logger.error("🤖 [BOT] Failed to get/create portfolio:", error);
    return null;
  }
}

/**
 * BOT DECISION ENGINE
 * The bot evaluates each opportunity and decides whether to enter based on its own criteria
 */
function makeBotDecision(
  quote: {
    change_percentage: number;
    volume: number;
    average_volume: number;
    last: number;
    week_52_high: number;
    week_52_low: number;
    high: number;
    low: number;
  },
  opportunity: LottoOpportunity
): BotDecision {
  const signals: string[] = [];
  let score = 50;
  
  const priceChange = quote.change_percentage || 0;
  const isCall = opportunity.optionType === 'call';
  const momentumAligned = isCall ? priceChange > 0 : priceChange < 0;
  
  if (momentumAligned) {
    const absChange = Math.abs(priceChange);
    if (absChange >= 3) {
      signals.push(`STRONG_MOMENTUM_${absChange.toFixed(1)}%`);
      score += 25;
    } else if (absChange >= 1.5) {
      signals.push(`GOOD_MOMENTUM_${absChange.toFixed(1)}%`);
      score += 15;
    } else if (absChange >= 0.5) {
      signals.push(`ALIGNED_${absChange.toFixed(1)}%`);
      score += 8;
    }
  } else if (Math.abs(priceChange) >= 1) {
    signals.push(`COUNTER_MOMENTUM_${priceChange.toFixed(1)}%`);
    score -= 20;
  }
  
  const relativeVolume = quote.average_volume > 0 
    ? quote.volume / quote.average_volume 
    : 1;
  
  if (relativeVolume >= 2.0) {
    signals.push(`HIGH_VOL_${relativeVolume.toFixed(1)}x`);
    score += 15;
  } else if (relativeVolume >= 1.3) {
    signals.push(`ABOVE_AVG_VOL`);
    score += 8;
  } else if (relativeVolume < 0.5) {
    signals.push('LOW_VOLUME');
    score -= 15;
  }
  
  const range52w = quote.week_52_high - quote.week_52_low;
  if (range52w > 0) {
    const positionInRange = (quote.last - quote.week_52_low) / range52w;
    
    if (isCall && positionInRange > 0.6) {
      signals.push('BULLISH_TREND');
      score += 10;
    } else if (!isCall && positionInRange < 0.4) {
      signals.push('BEARISH_TREND');
      score += 10;
    } else if (isCall && positionInRange < 0.25) {
      signals.push('CALLS_AT_LOWS_RISKY');
      score -= 15;
    } else if (!isCall && positionInRange > 0.75) {
      signals.push('PUTS_AT_HIGHS_RISKY');
      score -= 15;
    }
  }
  
  const intradayRange = quote.high - quote.low;
  if (intradayRange > 0) {
    const intradayPosition = (quote.last - quote.low) / intradayRange;
    
    if (isCall && intradayPosition > 0.7) {
      signals.push('INTRADAY_STRONG');
      score += 10;
    } else if (!isCall && intradayPosition < 0.3) {
      signals.push('INTRADAY_WEAK');
      score += 10;
    }
  }
  
  const absDelta = Math.abs(opportunity.delta);
  if (absDelta >= 0.08 && absDelta <= 0.18) {
    signals.push(`OPTIMAL_DELTA_${absDelta.toFixed(2)}`);
    score += 10;
  } else if (absDelta < 0.05) {
    signals.push('TOO_FAR_OTM');
    score -= 10;
  }
  
  if (opportunity.volume >= 500) {
    signals.push(`OPT_VOL_${opportunity.volume}`);
    score += 10;
  } else if (opportunity.volume >= 100) {
    signals.push('HAS_OPT_VOLUME');
    score += 5;
  }
  
  if (opportunity.daysToExpiry <= 2) {
    signals.push('0-2_DTE');
    if (!signals.some(s => s.includes('STRONG_MOMENTUM'))) {
      score -= 10;
    }
  } else if (opportunity.daysToExpiry <= 7) {
    signals.push('WEEKLY');
  }
  
  score = Math.max(0, Math.min(100, score));
  const grade = getLetterGrade(score);
  
  const isDayTrade = opportunity.daysToExpiry <= 2;
  const minScoreForEntry = isDayTrade ? 80 : 70;
  
  if (score >= minScoreForEntry) {
    return {
      action: 'enter',
      reason: `${grade} grade (${score}) - ${signals.slice(0, 3).join(', ')}`,
      confidence: score,
      signals
    };
  } else if (score >= 60) {
    return {
      action: 'wait',
      reason: `${grade} grade (${score}) needs stronger signals`,
      confidence: score,
      signals
    };
  } else {
    return {
      action: 'skip',
      reason: `${grade} grade (${score}) too weak - ${signals.slice(0, 2).join(', ')}`,
      confidence: score,
      signals
    };
  }
}

/**
 * Bot scans for opportunities and decides what to trade
 */
async function scanForOpportunities(ticker: string): Promise<LottoOpportunity[]> {
  try {
    const quote = await getTradierQuote(ticker);
    if (!quote || !quote.last) return [];
    
    const thresholds = getLottoThresholds();
    
    const optionsData = await getTradierOptionsChainsByDTE(ticker);
    if (!optionsData || optionsData.length === 0) return [];
    
    const opportunities: LottoOpportunity[] = [];
    
    for (const opt of optionsData) {
      if (!opt.bid || !opt.ask || opt.bid <= 0) continue;
      
      const midPrice = (opt.bid + opt.ask) / 2;
      const delta = opt.greeks?.delta || 0;
      const absDelta = Math.abs(delta);
      
      if (midPrice < thresholds.LOTTO_ENTRY_MIN || midPrice > thresholds.LOTTO_ENTRY_MAX) continue;
      if (absDelta < 0.03 || absDelta > thresholds.LOTTO_DELTA_MAX) continue;
      
      const expDate = new Date(opt.expiration_date);
      const now = new Date();
      const daysToExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysToExpiry < 0 || daysToExpiry > thresholds.LOTTO_MAX_DTE) continue;
      
      opportunities.push({
        symbol: ticker,
        optionType: opt.option_type as 'call' | 'put',
        strike: opt.strike,
        expiration: opt.expiration_date,
        delta: delta,
        price: midPrice,
        volume: opt.volume || 0,
        daysToExpiry
      });
    }
    
    return opportunities;
  } catch (error) {
    logger.error(`🤖 [BOT] Error scanning ${ticker}:`, error);
    return [];
  }
}

/**
 * Bot creates a trade idea from an opportunity
 */
function createTradeIdea(opportunity: LottoOpportunity, decision: BotDecision): InsertTradeIdea {
  const now = new Date();
  const { targetPrice, riskRewardRatio } = calculateLottoTargets(opportunity.price);
  const stopLoss = opportunity.price * 0.5;
  const direction = opportunity.optionType === 'call' ? 'long' : 'short';
  
  const exitWindowDays = opportunity.daysToExpiry <= 2 ? 1 : Math.min(3, opportunity.daysToExpiry - 1);
  const exitDate = new Date(now);
  exitDate.setDate(exitDate.getDate() + exitWindowDays);
  exitDate.setHours(15, 30, 0, 0);
  
  const entryValidUntil = new Date(now.getTime() + 60 * 60 * 1000);
  
  return {
    symbol: opportunity.symbol,
    assetType: 'option',
    direction,
    entryPrice: opportunity.price,
    targetPrice,
    stopLoss,
    riskRewardRatio,
    confidenceScore: decision.confidence,
    qualitySignals: decision.signals,
    probabilityBand: getLetterGrade(decision.confidence),
    catalyst: `🤖 BOT DECISION: ${opportunity.symbol} ${opportunity.optionType.toUpperCase()} $${opportunity.strike} | ${decision.signals.slice(0, 3).join(' | ')}`,
    analysis: `Auto-Lotto Bot autonomous trade: ${decision.reason}. Entry $${opportunity.price.toFixed(2)}, Target $${targetPrice.toFixed(2)} (20x), Stop $${stopLoss.toFixed(2)} (50%).`,
    sessionContext: 'Bot autonomous trading',
    holdingPeriod: opportunity.daysToExpiry <= 2 ? 'day' : 'swing',
    source: 'lotto',
    strikePrice: opportunity.strike,
    optionType: opportunity.optionType,
    expiryDate: opportunity.expiration,
    entryValidUntil: formatInTimeZone(entryValidUntil, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    exitBy: formatInTimeZone(exitDate, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    isLottoPlay: true,
    timestamp: formatInTimeZone(now, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    sectorFocus: 'momentum',
    riskProfile: 'speculative',
    researchHorizon: opportunity.daysToExpiry <= 2 ? 'intraday' : 'week',
    liquidityWarning: true,
    engineVersion: 'bot_autonomous_v1.0',
  };
}

/**
 * MAIN BOT FUNCTION: Scans market and makes autonomous trading decisions
 */
export async function runAutonomousBotScan(): Promise<void> {
  try {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = etTime.getDay();
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    if (day === 0 || day === 6 || timeInMinutes < 570 || timeInMinutes >= 960) {
      logger.info(`🤖 [BOT] Market closed - skipping autonomous scan`);
      return;
    }
    
    logger.info(`🤖 [BOT] ========== AUTONOMOUS SCAN STARTED ==========`);
    
    // 📊 MARKET CONTEXT ANALYSIS - Check overall market conditions before trading
    const marketContext = await getMarketContext();
    logger.info(`🤖 [BOT] Market: ${marketContext.regime} | ${marketContext.riskSentiment} | Score: ${marketContext.score}`);
    
    if (!marketContext.shouldTrade) {
      logger.info(`🤖 [BOT] ⛔ MARKET GATE: Skipping trades - ${marketContext.reasons.join(', ')}`);
      return;
    }
    
    const portfolio = await getLottoPortfolio();
    if (!portfolio) {
      logger.error(`🤖 [BOT] No portfolio available`);
      return;
    }
    
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    
    if (openPositions.length >= 3) {
      logger.info(`🤖 [BOT] Already have ${openPositions.length} open positions - waiting for exits`);
      return;
    }
    
    const openSymbols = new Set(openPositions.map(p => p.symbol));
    let bestOpportunity: { opp: LottoOpportunity; decision: BotDecision; entryTiming: { shouldEnterNow: boolean; reason: string } } | null = null;
    
    for (const ticker of BOT_SCAN_TICKERS) {
      if (openSymbols.has(ticker)) continue;
      
      const opportunities = await scanForOpportunities(ticker);
      
      for (const opp of opportunities) {
        const quote = await getTradierQuote(ticker);
        if (!quote) continue;
        
        const decision = makeBotDecision(quote, opp);
        
        // 📊 ENTRY TIMING CHECK - Should we enter now or wait?
        const entryTiming = getEntryTiming(quote, opp.optionType, marketContext);
        
        if (decision.action === 'enter' && entryTiming.shouldEnterNow) {
          logger.info(`🤖 [BOT] ✅ ${ticker} ${opp.optionType.toUpperCase()} $${opp.strike}: ${decision.reason} | ${entryTiming.reason}`);
          
          if (!bestOpportunity || decision.confidence > bestOpportunity.decision.confidence) {
            bestOpportunity = { opp, decision, entryTiming };
          }
        } else if (decision.action === 'wait') {
          logger.debug(`🤖 [BOT] ⏳ ${ticker}: ${decision.reason}`);
        }
      }
    }
    
    if (bestOpportunity) {
      const { opp, decision } = bestOpportunity;
      
      logger.info(`🤖 [BOT] 🎯 EXECUTING BEST TRADE: ${opp.symbol} ${opp.optionType.toUpperCase()} $${opp.strike} @ $${opp.price.toFixed(2)}`);
      
      const ideaData = createTradeIdea(opp, decision);
      const savedIdea = await storage.createTradeIdea(ideaData);
      
      const result = await executeTradeIdea(portfolio.id, savedIdea as TradeIdea);
      
      if (result.success && result.position) {
        logger.info(`🤖 [BOT] ✅ TRADE EXECUTED: ${opp.symbol} x${result.position.quantity} @ $${opp.price.toFixed(2)}`);
        
        try {
          await sendBotTradeEntryToDiscord({
            symbol: opp.symbol,
            optionType: opp.optionType,
            strikePrice: opp.strike,
            expiryDate: opp.expiration,
            entryPrice: opp.price,
            quantity: result.position.quantity,
            targetPrice: ideaData.targetPrice,
            stopLoss: ideaData.stopLoss,
          });
          logger.info(`🤖 [BOT] 📱 Discord entry notification sent`);
        } catch (discordError) {
          logger.warn(`🤖 [BOT] Discord notification failed:`, discordError);
        }
        
        const updated = await storage.getPaperPortfolioById(portfolio.id);
        if (updated) lottoPortfolio = updated;
      } else {
        logger.warn(`🤖 [BOT] ❌ Trade failed: ${result.error}`);
      }
    } else {
      logger.info(`🤖 [BOT] No opportunities met entry criteria`);
    }
    
    logger.info(`🤖 [BOT] ========== AUTONOMOUS SCAN COMPLETE ==========`);
  } catch (error) {
    logger.error(`🤖 [BOT] Error in autonomous scan:`, error);
  }
}

/**
 * Auto-execute a trade idea (for backward compatibility with lotto scanner)
 */
export async function autoExecuteLotto(idea: TradeIdea): Promise<boolean> {
  try {
    if (idea.assetType === 'option') {
      if (!idea.strikePrice || !idea.expiryDate || !idea.optionType) {
        logger.error(`🤖 [BOT] ❌ Rejecting ${idea.symbol} - missing option metadata`);
        return false;
      }
      
      if (idea.entryPrice > 20) {
        logger.warn(`🤖 [BOT] ⚠️ Rejecting ${idea.symbol} - entry price $${idea.entryPrice} too high for lotto`);
        return false;
      }
    }
    
    const portfolio = await getLottoPortfolio();
    if (!portfolio) {
      logger.error("🤖 [BOT] No portfolio available");
      return false;
    }

    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const existingPosition = positions.find(p => 
      p.tradeIdeaId === idea.id || 
      (p.symbol === idea.symbol && p.status === 'open' && p.strikePrice === idea.strikePrice)
    );

    if (existingPosition) {
      logger.info(`🤖 [BOT] Skipping ${idea.symbol} - already have position`);
      return false;
    }

    const result = await executeTradeIdea(portfolio.id, idea);
    
    if (result.success && result.position) {
      logger.info(`🤖 [BOT] ✅ Executed: ${idea.symbol} ${idea.optionType?.toUpperCase()} $${idea.strikePrice} x${result.position.quantity} @ $${idea.entryPrice.toFixed(2)}`);
      
      try {
        await sendBotTradeEntryToDiscord({
          symbol: idea.symbol,
          optionType: idea.optionType,
          strikePrice: idea.strikePrice,
          expiryDate: idea.expiryDate,
          entryPrice: idea.entryPrice,
          quantity: result.position.quantity,
          targetPrice: idea.targetPrice,
          stopLoss: idea.stopLoss,
        });
        logger.info(`🤖 [BOT] 📱 Discord entry notification sent`);
      } catch (discordError) {
        logger.warn(`🤖 [BOT] Discord notification failed:`, discordError);
      }
      
      const updated = await storage.getPaperPortfolioById(portfolio.id);
      if (updated) lottoPortfolio = updated;
      
      return true;
    } else {
      logger.warn(`🤖 [BOT] ❌ Failed to execute ${idea.symbol}: ${result.error}`);
      return false;
    }
  } catch (error) {
    logger.error(`🤖 [BOT] Error executing trade:`, error);
    return false;
  }
}

/**
 * Monitor and auto-close positions on stop/target/expiry
 * Now includes dynamic exits: trailing stops, time decay, momentum fade
 */
export async function monitorLottoPositions(): Promise<void> {
  try {
    const portfolio = await getLottoPortfolio();
    if (!portfolio) return;

    await updatePositionPrices(portfolio.id);
    
    // 📊 Get market context for dynamic exit decisions
    const marketContext = await getMarketContext();
    
    // Get open positions to check for dynamic exits
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    
    // Check each position for dynamic exit signals
    for (const pos of openPositions) {
      if (!pos.currentPrice || !pos.entryPrice) continue;
      
      // Calculate days to expiry for options
      let daysToExpiry = 7; // Default for non-options
      if (pos.expiryDate) {
        const expDate = new Date(pos.expiryDate);
        const now = new Date();
        daysToExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
      
      const highestPrice = pos.currentPrice; // Track highest price based on current
      
      const exitSignal = checkDynamicExit(
        pos.currentPrice,
        pos.entryPrice,
        highestPrice,
        daysToExpiry,
        (pos.optionType as 'call' | 'put') || 'call',
        marketContext
      );
      
      if (exitSignal.shouldExit) {
        logger.info(`🤖 [BOT] 📊 DYNAMIC EXIT: ${pos.symbol} - ${exitSignal.exitType}: ${exitSignal.reason}`);
        
        // Close the position with dynamic exit reason
        try {
          const exitPrice = exitSignal.suggestedExitPrice || pos.currentPrice;
          const pnl = (exitPrice - pos.entryPrice) * pos.quantity * 100;
          
          await storage.updatePaperPosition(pos.id, {
            status: 'closed',
            exitPrice,
            exitTime: new Date().toISOString(),
            exitReason: `${exitSignal.exitType}: ${exitSignal.reason}`,
            realizedPnL: pnl,
          });
          
          // Send Discord notification
          await sendBotTradeExitToDiscord({
            symbol: pos.symbol,
            optionType: pos.optionType,
            strikePrice: pos.strikePrice,
            entryPrice: pos.entryPrice,
            exitPrice,
            quantity: pos.quantity,
            realizedPnL: pnl,
            exitReason: `${exitSignal.exitType}: ${exitSignal.reason}`,
          });
          
          logger.info(`🤖 [BOT] 📱 Dynamic exit completed: ${pos.symbol} P&L: $${pnl.toFixed(2)}`);
        } catch (exitError) {
          logger.error(`🤖 [BOT] Failed to execute dynamic exit for ${pos.symbol}:`, exitError);
        }
      }
    }
    
    // Standard stop/target checking (for positions not caught by dynamic exits)
    const closedPositions = await checkStopsAndTargets(portfolio.id);
    
    if (closedPositions.length > 0) {
      logger.info(`🤖 [BOT] Auto-closed ${closedPositions.length} positions`);
      
      for (const pos of closedPositions) {
        const pnl = pos.realizedPnL || 0;
        const emoji = pnl >= 0 ? '🎉' : '💀';
        logger.info(`${emoji} [BOT] Closed ${pos.symbol}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pos.exitReason})`);
        
        try {
          await sendBotTradeExitToDiscord({
            symbol: pos.symbol,
            optionType: pos.optionType,
            strikePrice: pos.strikePrice,
            entryPrice: pos.entryPrice,
            exitPrice: pos.exitPrice,
            quantity: pos.quantity,
            realizedPnL: pos.realizedPnL,
            exitReason: pos.exitReason,
          });
          logger.info(`🤖 [BOT] 📱 Discord exit notification sent for ${pos.symbol}`);
        } catch (discordError) {
          logger.warn(`🤖 [BOT] Discord exit notification failed:`, discordError);
        }
      }
      
      const updated = await storage.getPaperPortfolioById(portfolio.id);
      if (updated) lottoPortfolio = updated;
    }
  } catch (error) {
    logger.error("🤖 [BOT] Error monitoring positions:", error);
  }
}

/**
 * Get current bot stats
 */
export async function getLottoStats(): Promise<{
  portfolio: PaperPortfolio | null;
  openPositions: number;
  closedPositions: number;
  totalPnL: number;
  winRate: number;
} | null> {
  try {
    const portfolio = await getLottoPortfolio();
    if (!portfolio) return null;

    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const openPositions = positions.filter(p => p.status === 'open');
    const closedPositions = positions.filter(p => p.status === 'closed');
    
    const totalPnL = closedPositions.reduce((sum, p) => sum + (p.realizedPnL || 0), 0);
    const wins = closedPositions.filter(p => (p.realizedPnL || 0) > 0).length;
    const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;

    return {
      portfolio,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      totalPnL,
      winRate,
    };
  } catch (error) {
    logger.error("🤖 [BOT] Error getting stats:", error);
    return null;
  }
}
