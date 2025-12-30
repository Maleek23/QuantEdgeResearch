import { storage } from "./storage";
import { executeTradeIdea, checkStopsAndTargets, updatePositionPrices } from "./paper-trading-service";
import { TradeIdea, PaperPortfolio } from "@shared/schema";
import { logger } from "./logger";

const LOTTO_PORTFOLIO_NAME = "Auto-Lotto Bot";
const SYSTEM_USER_ID = "system-auto-trader";
const LOTTO_STARTING_CAPITAL = 10000; // $10K for lotto plays
const MAX_POSITION_SIZE = 500; // Max $500 per lotto play

let lottoPortfolio: PaperPortfolio | null = null;

/**
 * Get or create the system portfolio for auto-trading lottos
 */
export async function getLottoPortfolio(): Promise<PaperPortfolio | null> {
  try {
    // Check cache first
    if (lottoPortfolio) {
      return lottoPortfolio;
    }

    // Try to find existing portfolio
    const portfolios = await storage.getPaperPortfoliosByUser(SYSTEM_USER_ID);
    const existing = portfolios.find(p => p.name === LOTTO_PORTFOLIO_NAME);
    
    if (existing) {
      lottoPortfolio = existing;
      logger.info(`🤖 [AUTO-LOTTO] Found existing portfolio: ${existing.id} (Balance: $${existing.cashBalance.toFixed(2)})`);
      return existing;
    }

    // Create new portfolio for auto-trading
    const newPortfolio = await storage.createPaperPortfolio({
      userId: SYSTEM_USER_ID,
      name: LOTTO_PORTFOLIO_NAME,
      startingCapital: LOTTO_STARTING_CAPITAL,
      cashBalance: LOTTO_STARTING_CAPITAL,
      totalValue: LOTTO_STARTING_CAPITAL,
      maxPositionSize: MAX_POSITION_SIZE,
      riskPerTrade: 0.05, // 5% risk per trade (aggressive for lottos)
    });

    lottoPortfolio = newPortfolio;
    logger.info(`🤖 [AUTO-LOTTO] Created new portfolio: ${newPortfolio.id} with $${LOTTO_STARTING_CAPITAL}`);
    return newPortfolio;
  } catch (error) {
    logger.error("🤖 [AUTO-LOTTO] Failed to get/create portfolio:", error);
    return null;
  }
}

/**
 * Auto-execute a lotto trade idea in the paper trading portfolio
 */
export async function autoExecuteLotto(idea: TradeIdea): Promise<boolean> {
  try {
    const portfolio = await getLottoPortfolio();
    if (!portfolio) {
      logger.error("🤖 [AUTO-LOTTO] No portfolio available for auto-trading");
      return false;
    }

    // Check if we already have a position for this idea
    const positions = await storage.getPaperPositionsByPortfolio(portfolio.id);
    const existingPosition = positions.find(p => 
      p.tradeIdeaId === idea.id || 
      (p.symbol === idea.symbol && p.status === 'open' && p.strikePrice === idea.strikePrice)
    );

    if (existingPosition) {
      logger.info(`🤖 [AUTO-LOTTO] Skipping ${idea.symbol} - already have position`);
      return false;
    }

    // Execute the trade
    const result = await executeTradeIdea(portfolio.id, idea);
    
    if (result.success && result.position) {
      logger.info(`🤖 [AUTO-LOTTO] ✅ Executed: ${idea.symbol} ${idea.optionType?.toUpperCase()} $${idea.strikePrice} x${result.position.quantity} @ $${idea.entryPrice.toFixed(2)}`);
      
      // Refresh portfolio cache
      const updated = await storage.getPaperPortfolioById(portfolio.id);
      if (updated) lottoPortfolio = updated;
      
      return true;
    } else {
      logger.warn(`🤖 [AUTO-LOTTO] ❌ Failed to execute ${idea.symbol}: ${result.error}`);
      return false;
    }
  } catch (error) {
    logger.error(`🤖 [AUTO-LOTTO] Error executing lotto trade:`, error);
    return false;
  }
}

/**
 * Monitor and auto-close lotto positions on stop/target/expiry
 */
export async function monitorLottoPositions(): Promise<void> {
  try {
    const portfolio = await getLottoPortfolio();
    if (!portfolio) {
      return;
    }

    // Update prices for all open positions
    await updatePositionPrices(portfolio.id);
    
    // Check stops and targets, auto-close if hit
    const closedPositions = await checkStopsAndTargets(portfolio.id);
    
    if (closedPositions.length > 0) {
      logger.info(`🤖 [AUTO-LOTTO] Auto-closed ${closedPositions.length} positions`);
      
      for (const pos of closedPositions) {
        const pnl = pos.realizedPnL || 0;
        const emoji = pnl >= 0 ? '🎉' : '💀';
        logger.info(`${emoji} [AUTO-LOTTO] Closed ${pos.symbol}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pos.exitReason})`);
      }
      
      // Refresh portfolio cache
      const updated = await storage.getPaperPortfolioById(portfolio.id);
      if (updated) lottoPortfolio = updated;
    }
  } catch (error) {
    logger.error("🤖 [AUTO-LOTTO] Error monitoring positions:", error);
  }
}

/**
 * Get current lotto portfolio stats
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
    logger.error("🤖 [AUTO-LOTTO] Error getting stats:", error);
    return null;
  }
}
