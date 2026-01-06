import { storage } from "./storage";
import { searchSymbol, fetchCryptoPrice, fetchStockPrice } from "./market-api";
import { getOptionQuote } from "./tradier-api";
import { logger } from "./logger";
import { isUSMarketOpen, normalizeDateString } from "@shared/market-calendar";
import { analyzeTrade, recordWin } from "./loss-analyzer-service";
import type {
  TradeIdea,
  PaperPortfolio,
  PaperPosition,
  InsertPaperPosition,
  InsertPaperEquitySnapshot,
  AssetType,
} from "@shared/schema";

// Re-export for backward compatibility
export function isOptionsMarketOpen(): { isOpen: boolean; reason: string } {
  const status = isUSMarketOpen();
  return { isOpen: status.isOpen, reason: status.reason };
}

export interface ExecuteTradeResult {
  success: boolean;
  position?: PaperPosition;
  error?: string;
}

export interface ClosePositionResult {
  success: boolean;
  position?: PaperPosition;
  error?: string;
}

export interface PortfolioValue {
  cashBalance: number;
  positionsValue: number;
  totalValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

// 🎯 SMART POSITION SIZING LIMITS
const MAX_PERCENT_PER_TRADE = 0.10; // 10% of portfolio per trade (bigger positions)
const MAX_PERCENT_PER_SYMBOL = 0.10; // 10% max exposure per symbol
const MAX_DOLLAR_PER_TRADE = 800; // Hard cap $800 per trade (allows 3-4 contracts)
const MAX_CONTRACTS_PER_TRADE = 5; // Target 3-4 contracts, max 5
const ONE_POSITION_PER_SYMBOL = true; // Only allow ONE open position per underlying symbol

export async function executeTradeIdea(
  portfolioId: string,
  tradeIdea: TradeIdea
): Promise<ExecuteTradeResult> {
  try {
    const portfolio = await storage.getPaperPortfolioById(portfolioId);
    if (!portfolio) {
      return { success: false, error: "Portfolio not found" };
    }

    // 🛑 CHECK EXISTING SYMBOL EXPOSURE - Prevent overconcentration
    const existingPositions = await storage.getPaperPositionsByPortfolio(portfolioId);
    const symbolPositions = existingPositions.filter(p => 
      p.symbol === tradeIdea.symbol && p.status === 'open'
    );
    
    // 🛑🛑 CRITICAL: CHECK FOR EXACT DUPLICATE POSITION (same option contract)
    // This prevents race condition duplicates from parallel bot executions
    if (tradeIdea.assetType === 'option' && tradeIdea.strikePrice && tradeIdea.optionType) {
      const exactDuplicate = existingPositions.find(p => 
        p.symbol === tradeIdea.symbol && 
        p.status === 'open' &&
        p.optionType === tradeIdea.optionType &&
        p.strikePrice === tradeIdea.strikePrice &&
        p.expiryDate === tradeIdea.expiryDate
      );
      
      if (exactDuplicate) {
        logger.warn(`🛑 [DUPLICATE-POSITION] Rejecting ${tradeIdea.symbol} ${tradeIdea.optionType?.toUpperCase()} $${tradeIdea.strikePrice} - already have open position (ID: ${exactDuplicate.id})`);
        return { success: false, error: `Duplicate position for ${tradeIdea.symbol} ${tradeIdea.optionType} $${tradeIdea.strikePrice}` };
      }
    }
    
    if (symbolPositions.length > 0) {
      // 🛑 ONE POSITION PER SYMBOL - Block any new trades on same underlying
      if (ONE_POSITION_PER_SYMBOL && tradeIdea.assetType === 'option') {
        const existingSymbolPos = symbolPositions[0];
        logger.warn(`🛑 [ONE-PER-SYMBOL] Rejecting ${tradeIdea.symbol} ${tradeIdea.optionType?.toUpperCase()} $${tradeIdea.strikePrice} - already have ${existingSymbolPos.optionType?.toUpperCase()} $${existingSymbolPos.strikePrice} open`);
        return { success: false, error: `Already have position on ${tradeIdea.symbol} - only 1 per symbol allowed` };
      }
      
      const totalSymbolExposure = symbolPositions.reduce((sum, p) => 
        sum + (p.quantity * (p.entryPrice || 0) * (p.optionType ? 100 : 1)), 0
      );
      const symbolExposurePercent = totalSymbolExposure / portfolio.startingCapital;
      
      if (symbolExposurePercent >= MAX_PERCENT_PER_SYMBOL) {
        logger.warn(`🛑 [POSITION-LIMIT] Rejecting ${tradeIdea.symbol} - already at ${(symbolExposurePercent * 100).toFixed(1)}% exposure (max ${MAX_PERCENT_PER_SYMBOL * 100}%)`);
        return { success: false, error: `Already at max exposure for ${tradeIdea.symbol}` };
      }
    }

    const currentPrice = tradeIdea.entryPrice;
    const multiplier = tradeIdea.assetType === 'option' ? 100 : 1;
    
    let quantity: number;
    let positionCost: number;

    if (tradeIdea.assetType === 'option') {
      // 🎯 SMART POSITION SIZING: Use the MINIMUM of:
      // 1. 5% of total portfolio value
      // 2. Hard cap of $500 per trade
      // 3. Available cash
      const percentBasedMax = portfolio.startingCapital * MAX_PERCENT_PER_TRADE;
      const maxAllowedSpend = Math.min(percentBasedMax, MAX_DOLLAR_PER_TRADE, portfolio.cashBalance);
      
      const contractCost = currentPrice * 100;
      quantity = Math.max(1, Math.min(MAX_CONTRACTS_PER_TRADE, Math.floor(maxAllowedSpend / contractCost)));
      positionCost = quantity * contractCost;
      
      logger.info(`📊 [POSITION-SIZE] ${tradeIdea.symbol}: ${quantity} contracts @ $${currentPrice.toFixed(2)} = $${positionCost.toFixed(0)} (${(positionCost / portfolio.startingCapital * 100).toFixed(1)}% of portfolio)`);
    } else {
      const riskPerTrade = portfolio.riskPerTrade || 0.02;
      const riskAmount = portfolio.cashBalance * riskPerTrade;
      const stopDistance = Math.abs(currentPrice - tradeIdea.stopLoss);
      
      if (stopDistance > 0) {
        quantity = Math.floor(riskAmount / stopDistance);
      } else {
        const maxPosition = portfolio.maxPositionSize || 5000;
        quantity = Math.floor(maxPosition / currentPrice);
      }
      
      quantity = Math.max(1, quantity);
      
      const maxPositionValue = portfolio.maxPositionSize || 5000;
      if (quantity * currentPrice > maxPositionValue) {
        quantity = Math.floor(maxPositionValue / currentPrice);
      }
      
      positionCost = quantity * currentPrice;
    }

    if (positionCost > portfolio.cashBalance) {
      return { 
        success: false, 
        error: `Insufficient cash. Need $${positionCost.toFixed(2)}, have $${portfolio.cashBalance.toFixed(2)}` 
      };
    }

    const now = new Date().toISOString();
    
    // Build entry reason from trade idea context
    const entryReason = tradeIdea.catalyst || tradeIdea.analysis || `${tradeIdea.source || 'QUANT'} signal for ${tradeIdea.symbol}`;
    const entrySignals = tradeIdea.qualitySignals ? JSON.stringify(tradeIdea.qualitySignals) : null;
    
    const positionData: InsertPaperPosition = {
      portfolioId,
      tradeIdeaId: tradeIdea.id,
      symbol: tradeIdea.symbol,
      assetType: tradeIdea.assetType,
      direction: tradeIdea.direction,
      optionType: tradeIdea.optionType || null,
      strikePrice: tradeIdea.strikePrice || null,
      expiryDate: tradeIdea.expiryDate || null,
      entryPrice: currentPrice,
      quantity,
      entryTime: now,
      entryReason,
      entrySignals,
      targetPrice: tradeIdea.targetPrice,
      stopLoss: tradeIdea.stopLoss,
      currentPrice,
      lastPriceUpdate: now,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      status: 'open',
    };

    const position = await storage.createPaperPosition(positionData);

    await storage.updatePaperPortfolio(portfolioId, {
      cashBalance: portfolio.cashBalance - positionCost,
    });

    logger.info(`Paper trade executed: ${tradeIdea.symbol} ${tradeIdea.direction} x${quantity} @ $${currentPrice}`, {
      portfolioId,
      positionId: position.id,
      cost: positionCost,
    });

    return { success: true, position };
  } catch (error) {
    logger.error("Error executing paper trade", { error, portfolioId, tradeIdeaId: tradeIdea.id });
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function closePosition(
  positionId: string,
  exitPrice: number,
  exitReason: string
): Promise<ClosePositionResult> {
  try {
    const position = await storage.closePaperPosition(positionId, exitPrice, exitReason);
    if (!position) {
      return { success: false, error: "Position not found" };
    }

    logger.info(`Paper position closed: ${position.symbol} @ $${exitPrice}`, {
      positionId,
      exitReason,
      realizedPnL: position.realizedPnL,
    });

    // === ADAPTIVE LOSS INTELLIGENCE ===
    // Analyze ALL closed trades to learn from both wins and losses
    const pnlPercent = position.realizedPnLPercent || 0;
    const isLoss = pnlPercent < 0;
    
    try {
      if (isLoss && Math.abs(pnlPercent) >= 5) {
        // Significant loss (>5%) - analyze for patterns and apply remediations
        const diagnosis = await analyzeTrade(position);
        
        if (diagnosis) {
          logger.info(`🧠 [ADAPTIVE LEARNING] Applied remediation for ${position.symbol} loss: ${diagnosis.primaryCause}`, {
            symbol: position.symbol,
            pnlPercent,
            cause: diagnosis.primaryCause,
            categories: diagnosis.lossCategories,
          });
        }
      } else if (pnlPercent >= 10) {
        // Significant win (>10%) - record positive reinforcement
        await recordWin(position);
        logger.info(`🎯 [ADAPTIVE LEARNING] Recorded win for ${position.symbol}: +${pnlPercent.toFixed(1)}%`);
      }
    } catch (analysisError) {
      // Don't fail the close operation if analysis fails
      logger.warn(`[ADAPTIVE LEARNING] Analysis failed for ${position.symbol}`, { error: analysisError });
    }

    return { success: true, position };
  } catch (error) {
    logger.error("Error closing paper position", { error, positionId });
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Fetch current price for a position
 * For options, we MUST fetch the actual option premium, NEVER fall back to stock prices
 * This prevents P&L calculation errors where stock prices are used instead of option premiums
 */
async function fetchCurrentPrice(
  symbol: string, 
  assetType: AssetType,
  optionDetails?: { underlying: string; expiryDate: string; optionType: 'call' | 'put'; strike: number },
  fallbackPrice?: number
): Promise<number | null> {
  try {
    if (assetType === 'crypto') {
      const data = await fetchCryptoPrice(symbol);
      return data?.currentPrice || null;
    } else if (assetType === 'option') {
      // CRITICAL: For options, we MUST have option details to get the correct premium
      // NEVER fall back to stock prices - this causes massively inflated P&L
      if (!optionDetails) {
        logger.error(`🚨 [PAPER] Option ${symbol} missing metadata - cannot fetch price. Using fallback: $${fallbackPrice?.toFixed(2) || 'null'}`);
        return fallbackPrice || null;
      }
      
      // Fetch actual option premium from Tradier
      const quote = await getOptionQuote({
        underlying: optionDetails.underlying,
        expiryDate: optionDetails.expiryDate,
        optionType: optionDetails.optionType,
        strike: optionDetails.strike,
      });
      
      if (quote) {
        // Use mid price for most accurate current value, fallback to last
        const price = quote.mid > 0 ? quote.mid : quote.last;
        if (price > 0) {
          logger.info(`📊 [PAPER] Option price for ${symbol} ${optionDetails.optionType.toUpperCase()} $${optionDetails.strike}: $${price.toFixed(2)} (bid: $${quote.bid}, ask: $${quote.ask})`);
          return price;
        }
      }
      
      // If quote fails, use fallback price (entry price or current price) - NEVER stock price
      logger.warn(`📊 [PAPER] No option quote for ${symbol} ${optionDetails.optionType?.toUpperCase()} $${optionDetails.strike} exp ${optionDetails.expiryDate} - using fallback: $${fallbackPrice?.toFixed(2) || 'null'}`);
      return fallbackPrice || null;
    } else {
      // Only use stock prices for actual stocks
      const data = await fetchStockPrice(symbol);
      return data?.currentPrice || null;
    }
  } catch (error) {
    logger.warn(`Failed to fetch price for ${symbol}`, { error });
    return fallbackPrice || null;
  }
}

export async function updatePositionPrices(portfolioId: string): Promise<void> {
  try {
    const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
    const openPositions = positions.filter(p => p.status === 'open');
    
    const now = new Date().toISOString();

    for (const position of openPositions) {
      // Build option details if this is an option position
      let optionDetails: { underlying: string; expiryDate: string; optionType: 'call' | 'put'; strike: number } | undefined;
      
      if (position.assetType === 'option' && position.strikePrice && position.optionType && position.expiryDate) {
        optionDetails = {
          underlying: position.symbol,
          expiryDate: position.expiryDate,
          optionType: position.optionType as 'call' | 'put',
          strike: position.strikePrice,
        };
      }
      
      // For options, pass current price as fallback to avoid using stock prices
      const fallbackPrice = position.assetType === 'option' 
        ? (position.currentPrice || position.entryPrice) 
        : undefined;
      
      const currentPrice = await fetchCurrentPrice(
        position.symbol, 
        position.assetType as AssetType,
        optionDetails,
        fallbackPrice
      );
      
      if (currentPrice !== null) {
        const multiplier = position.assetType === 'option' ? 100 : 1;
        const directionMultiplier = position.direction === 'long' ? 1 : -1;
        
        const unrealizedPnL = (currentPrice - position.entryPrice) * position.quantity * multiplier * directionMultiplier;
        const unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * directionMultiplier;

        // SMART TRAILING STOP: Update high water mark and trailing stop
        const updateData: Record<string, any> = {
          currentPrice,
          lastPriceUpdate: now,
          unrealizedPnL,
          unrealizedPnLPercent,
        };
        
        // Track highest price for trailing stops (for both long and short positions)
        const isLong = position.direction === 'long';
        const currentHWM = position.highWaterMark || position.entryPrice;
        const entryPrice = position.entryPrice;
        
        // For long positions: HWM is the peak high price
        // For short positions: HWM would be lowest low price (we use same field, just logic differs)
        const priceImproved = isLong ? currentPrice > currentHWM : currentPrice < currentHWM;
        
        if (priceImproved) {
          updateData.highWaterMark = currentPrice;
          
          // Dynamic trailing stop: wider trailing when winning big, tighter when gains are small
          // At 50%+ gain: use 35% trailing stop (let it breathe)
          // At 100%+ gain: use 40% trailing stop (let big winners run)
          // At 200%+ gain: use 50% trailing stop (mega winners need room)
          const gainPercent = isLong 
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - currentPrice) / entryPrice) * 100;
          
          let trailingPercent = 25; // Default 25% trailing stop
          
          if (gainPercent >= 200) {
            trailingPercent = 50; // Let mega winners run
          } else if (gainPercent >= 100) {
            trailingPercent = 40; // Let big winners run
          } else if (gainPercent >= 50) {
            trailingPercent = 35; // Let winners breathe
          } else if (gainPercent >= 25) {
            trailingPercent = 30; // Standard winners
          }
          
          // CRITICAL: Calculate trailing stop but ALWAYS clamp to at least break-even
          // This ensures a profitable trade NEVER exits at a loss
          let rawTrailingStop = isLong 
            ? currentPrice * (1 - trailingPercent / 100)
            : currentPrice * (1 + trailingPercent / 100);
          
          // Clamp trailing stop to at least break-even (entry price)
          // Only set trailing stop if it's above entry (for longs) or below entry (for shorts)
          const trailingStopAboveBreakeven = isLong 
            ? rawTrailingStop >= entryPrice
            : rawTrailingStop <= entryPrice;
          
          if (trailingStopAboveBreakeven) {
            updateData.trailingStopPercent = trailingPercent;
            updateData.trailingStopPrice = rawTrailingStop;
            
            const lockedGain = isLong 
              ? ((rawTrailingStop - entryPrice) / entryPrice) * 100
              : ((entryPrice - rawTrailingStop) / entryPrice) * 100;
            
            logger.info(`📈 [TRAILING] ${position.symbol}: New HWM $${currentPrice.toFixed(2)} (+${gainPercent.toFixed(0)}%), trailing stop at $${rawTrailingStop.toFixed(2)} (locks +${lockedGain.toFixed(0)}%)`);
          } else {
            // Trailing stop would be below break-even, don't activate it yet
            // Keep original stop loss active until trailing stop can lock in gains
            logger.debug(`📈 [TRAILING] ${position.symbol}: HWM $${currentPrice.toFixed(2)} (+${gainPercent.toFixed(0)}%), but trailing stop $${rawTrailingStop.toFixed(2)} is below entry - using original stop`);
          }
        }

        await storage.updatePaperPosition(position.id, updateData);
      }
    }

    logger.info(`Updated prices for ${openPositions.length} positions`, { portfolioId });
  } catch (error) {
    logger.error("Error updating position prices", { error, portfolioId });
  }
}

export async function checkStopsAndTargets(portfolioId: string): Promise<PaperPosition[]> {
  const closedPositions: PaperPosition[] = [];
  
  try {
    const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
    const openPositions = positions.filter(p => p.status === 'open');
    
    // Check if market is open for options - needed for valid price-based closures
    const marketStatus = isOptionsMarketOpen();

    for (const position of openPositions) {
      if (!position.currentPrice) continue;

      const isLong = position.direction === 'long';
      let shouldClose = false;
      let exitReason = '';
      
      // For options, only check stops/targets if market is open (real prices available)
      const isOption = position.assetType === 'option';
      const canUsePrice = !isOption || marketStatus.isOpen;
      
      // Check if current price is stale (equals entry price, suggesting no real update)
      const priceIsStale = isOption && 
        Math.abs(position.currentPrice - position.entryPrice) < 0.001;

      // Only check price-based exits if we have real prices (not stale)
      if (canUsePrice && !priceIsStale) {
        // SMART EXIT STRATEGY: Use trailing stops to let winners run
        const useTrailing = position.useTrailingStop !== false; // Default to true
        const trailingStopPrice = position.trailingStopPrice;
        const highWaterMark = position.highWaterMark || position.entryPrice;
        const entryPrice = position.entryPrice;
        
        // 1. Check TRAILING STOP (only if it's been set AND it's above break-even)
        // The trailing stop is only set when it would lock in a gain, so if it exists, use it
        if (useTrailing && trailingStopPrice) {
          const trailingHit = isLong 
            ? position.currentPrice <= trailingStopPrice
            : position.currentPrice >= trailingStopPrice;
          
          if (trailingHit) {
            const gainFromEntry = isLong
              ? ((highWaterMark - entryPrice) / entryPrice) * 100
              : ((entryPrice - highWaterMark) / entryPrice) * 100;
            const lockedGain = isLong
              ? ((trailingStopPrice - entryPrice) / entryPrice) * 100
              : ((entryPrice - trailingStopPrice) / entryPrice) * 100;
            shouldClose = true;
            exitReason = `trailing_stop_hit_locked_${Math.max(0, lockedGain).toFixed(0)}pct`;
            logger.info(`📉 [TRAILING] ${position.symbol}: Hit trailing stop at $${position.currentPrice.toFixed(2)} (set at $${trailingStopPrice.toFixed(2)}). Peak was $${highWaterMark.toFixed(2)} (+${gainFromEntry.toFixed(0)}%), locked +${lockedGain.toFixed(0)}%`);
          }
        }
        
        // 2. Check ORIGINAL STOP LOSS (only if trailing stop is NOT active)
        // Trailing stop takes priority once it's set above break-even
        if (!shouldClose && position.stopLoss && !trailingStopPrice) {
          if ((isLong && position.currentPrice <= position.stopLoss) ||
              (!isLong && position.currentPrice >= position.stopLoss)) {
            shouldClose = true;
            exitReason = 'stop_hit';
          }
        }
        
        // 3. Check MEGA TARGET (400%+ gain - take massive profits to lock in wins)
        if (!shouldClose && position.targetPrice) {
          const megaTarget = entryPrice * 4; // 300%+ gain is mega territory
          const megaHit = isLong 
            ? position.currentPrice >= megaTarget
            : position.currentPrice <= entryPrice * 0.25; // 75% drop for shorts (rare)
          
          if (megaHit) {
            shouldClose = true;
            exitReason = 'mega_target_hit';
            logger.info(`🚀 [MEGA] ${position.symbol}: Hit mega target at $${position.currentPrice.toFixed(2)} (400%+)!`);
          }
        }
      }

      // For expiry, only close if market is open (so we have real exit prices)
      if (isOption && position.expiryDate) {
        // Normalize both dates to YYYY-MM-DD for proper comparison
        const today = normalizeDateString(new Date());
        const expiryDateNormalized = normalizeDateString(position.expiryDate);
        
        if (expiryDateNormalized <= today) {
          if (marketStatus.isOpen && !priceIsStale) {
            // Market is open and we have real prices - close normally
            shouldClose = true;
            exitReason = 'expired';
          } else {
            // Market closed or stale price - log but don't close with bad prices
            logger.info(`📊 [PAPER] Skipping expired option close for ${position.symbol} - ${marketStatus.reason}, will close when market opens with real prices`);
          }
        }
      }

      if (shouldClose) {
        const result = await closePosition(position.id, position.currentPrice, exitReason);
        if (result.success && result.position) {
          closedPositions.push(result.position);
        }
      }
    }

    if (closedPositions.length > 0) {
      logger.info(`Auto-closed ${closedPositions.length} positions`, { portfolioId });
    }

    return closedPositions;
  } catch (error) {
    logger.error("Error checking stops and targets", { error, portfolioId });
    return closedPositions;
  }
}

export async function calculatePortfolioValue(portfolioId: string): Promise<PortfolioValue | null> {
  try {
    const portfolio = await storage.getPaperPortfolioById(portfolioId);
    if (!portfolio) return null;

    const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
    const openPositions = positions.filter(p => p.status === 'open');

    let positionsValue = 0;
    let unrealizedPnL = 0;

    for (const position of openPositions) {
      const multiplier = position.assetType === 'option' ? 100 : 1;
      const currentValue = (position.currentPrice || position.entryPrice) * position.quantity * multiplier;
      positionsValue += currentValue;
      unrealizedPnL += position.unrealizedPnL || 0;
    }

    const totalValue = portfolio.cashBalance + positionsValue;
    const unrealizedPnLPercent = portfolio.startingCapital > 0 
      ? ((totalValue - portfolio.startingCapital) / portfolio.startingCapital) * 100 
      : 0;

    return {
      cashBalance: portfolio.cashBalance,
      positionsValue,
      totalValue,
      unrealizedPnL,
      unrealizedPnLPercent,
    };
  } catch (error) {
    logger.error("Error calculating portfolio value", { error, portfolioId });
    return null;
  }
}

export async function recordEquitySnapshot(portfolioId: string): Promise<boolean> {
  try {
    const portfolioValue = await calculatePortfolioValue(portfolioId);
    if (!portfolioValue) return false;

    const portfolio = await storage.getPaperPortfolioById(portfolioId);
    if (!portfolio) return false;

    const today = new Date().toISOString().split('T')[0];

    const existingSnapshots = await storage.getPaperEquitySnapshots(portfolioId, today, today);
    if (existingSnapshots.length > 0) {
      logger.info(`Equity snapshot already exists for ${today}`, { portfolioId });
      return true;
    }

    const previousSnapshots = await storage.getPaperEquitySnapshots(portfolioId);
    const previousValue = previousSnapshots.length > 0 
      ? previousSnapshots[0].totalValue 
      : portfolio.startingCapital;

    const dailyPnL = portfolioValue.totalValue - previousValue;
    const dailyPnLPercent = previousValue > 0 
      ? (dailyPnL / previousValue) * 100 
      : 0;

    const snapshot: InsertPaperEquitySnapshot = {
      portfolioId,
      date: today,
      totalValue: portfolioValue.totalValue,
      cashBalance: portfolioValue.cashBalance,
      positionsValue: portfolioValue.positionsValue,
      dailyPnL,
      dailyPnLPercent,
    };

    await storage.createPaperEquitySnapshot(snapshot);
    
    await storage.updatePaperPortfolio(portfolioId, {
      totalValue: portfolioValue.totalValue,
      totalPnL: portfolioValue.totalValue - portfolio.startingCapital,
      totalPnLPercent: ((portfolioValue.totalValue - portfolio.startingCapital) / portfolio.startingCapital) * 100,
    });

    logger.info(`Equity snapshot recorded for ${today}`, { 
      portfolioId, 
      totalValue: portfolioValue.totalValue,
      dailyPnL,
    });

    return true;
  } catch (error) {
    logger.error("Error recording equity snapshot", { error, portfolioId });
    return false;
  }
}

export async function getOpenPositions(portfolioId: string): Promise<PaperPosition[]> {
  const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
  return positions.filter(p => p.status === 'open');
}

export async function getClosedPositions(portfolioId: string): Promise<PaperPosition[]> {
  const positions = await storage.getPaperPositionsByPortfolio(portfolioId);
  return positions.filter(p => p.status === 'closed');
}
