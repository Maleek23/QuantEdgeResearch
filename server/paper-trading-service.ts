import { storage } from "./storage";
import { searchSymbol, fetchCryptoPrice, fetchStockPrice } from "./market-api";
import { getOptionQuote } from "./tradier-api";
import { logger } from "./logger";
import type {
  TradeIdea,
  PaperPortfolio,
  PaperPosition,
  InsertPaperPosition,
  InsertPaperEquitySnapshot,
  AssetType,
} from "@shared/schema";

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

export async function executeTradeIdea(
  portfolioId: string,
  tradeIdea: TradeIdea
): Promise<ExecuteTradeResult> {
  try {
    const portfolio = await storage.getPaperPortfolioById(portfolioId);
    if (!portfolio) {
      return { success: false, error: "Portfolio not found" };
    }

    const currentPrice = tradeIdea.entryPrice;
    const multiplier = tradeIdea.assetType === 'option' ? 100 : 1;
    
    let quantity: number;
    let positionCost: number;

    if (tradeIdea.assetType === 'option') {
      const maxContractCost = portfolio.maxPositionSize || 5000;
      const contractCost = currentPrice * 100;
      quantity = Math.max(1, Math.floor(maxContractCost / contractCost));
      positionCost = quantity * contractCost;
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

        await storage.updatePaperPosition(position.id, {
          currentPrice,
          lastPriceUpdate: now,
          unrealizedPnL,
          unrealizedPnLPercent,
        });
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

    for (const position of openPositions) {
      if (!position.currentPrice) continue;

      const isLong = position.direction === 'long';
      let shouldClose = false;
      let exitReason = '';

      if (position.targetPrice) {
        if ((isLong && position.currentPrice >= position.targetPrice) ||
            (!isLong && position.currentPrice <= position.targetPrice)) {
          shouldClose = true;
          exitReason = 'target_hit';
        }
      }

      if (!shouldClose && position.stopLoss) {
        if ((isLong && position.currentPrice <= position.stopLoss) ||
            (!isLong && position.currentPrice >= position.stopLoss)) {
          shouldClose = true;
          exitReason = 'stop_hit';
        }
      }

      if (position.assetType === 'option' && position.expiryDate) {
        const today = new Date().toISOString().split('T')[0];
        if (position.expiryDate <= today) {
          shouldClose = true;
          exitReason = 'expired';
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
