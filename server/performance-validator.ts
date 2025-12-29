import { TradeIdea, FuturesContract } from "@shared/schema";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// 🎯 MINIMUM LOSS THRESHOLD: Losses below this are treated as "breakeven"
// Aligns with platform stop-loss rules: stocks=3.5%, crypto=5%
// Losses under 3% are likely noise/tight stops, not proper stop-loss hits
const MIN_LOSS_THRESHOLD_PERCENT = 3.0; // 3% minimum to count as a real loss

// 📊 REALISTIC TRADING COSTS: Applied to performance calculations
// These model real-world execution costs that reduce backtest performance
export const TRADING_COSTS = {
  // Slippage: difference between expected and actual execution price
  slippage: {
    stock: 0.01,      // $0.01 per share for liquid stocks
    option: 0.05,     // $0.05 per contract (wider spreads)
    crypto: 0.001,    // 0.1% of trade value (typical exchange slippage)
    future: 0.02,     // $0.02 per contract (CME futures)
  },
  // Commission per trade (round trip = 2x)
  commission: {
    stock: 0,         // Most brokers now commission-free
    option: 0.65,     // $0.65 per contract (Schwab, TD, etc.)
    crypto: 0.001,    // 0.1% maker/taker fee
    future: 2.25,     // $2.25 per contract (CME)
  },
  // Spread cost as percentage (bid-ask spread impact)
  spreadCost: {
    stock: 0.0005,    // 0.05% for liquid stocks
    option: 0.02,     // 2% for options (can be much higher)
    crypto: 0.001,    // 0.1% for major pairs
    future: 0.0003,   // 0.03% for ES/NQ
  },
};

/**
 * Calculate realistic trading costs for a trade
 * @param assetType - Type of asset traded
 * @param entryPrice - Entry price
 * @param quantity - Number of shares/contracts (default: 100 shares, 1 contract)
 * @returns Total cost in dollars and as percentage of trade value
 */
export function calculateTradingCosts(
  assetType: 'stock' | 'option' | 'crypto' | 'future',
  entryPrice: number,
  quantity: number = assetType === 'stock' ? 100 : 1
): { totalCost: number; costPercent: number } {
  const costs = TRADING_COSTS;
  
  // Calculate trade value
  const multiplier = assetType === 'option' ? 100 : 1; // Options represent 100 shares
  const tradeValue = entryPrice * quantity * multiplier;
  
  // Slippage cost (both entry and exit)
  const slippagePerUnit = costs.slippage[assetType] || 0.01;
  const slippageCost = assetType === 'crypto' 
    ? tradeValue * slippagePerUnit * 2  // Crypto: percentage-based
    : slippagePerUnit * quantity * 2;    // Others: per-unit
  
  // Commission (round trip)
  const commissionPerUnit = costs.commission[assetType] || 0;
  const commissionCost = assetType === 'crypto'
    ? tradeValue * commissionPerUnit * 2  // Crypto: percentage-based
    : commissionPerUnit * quantity * 2;    // Others: per-unit
  
  // Spread cost (entry only - exit assumed at mid)
  const spreadPercent = costs.spreadCost[assetType] || 0.001;
  const spreadCost = tradeValue * spreadPercent;
  
  const totalCost = slippageCost + commissionCost + spreadCost;
  const costPercent = (totalCost / tradeValue) * 100;
  
  return { totalCost, costPercent };
}

/**
 * Calculate position size based on fixed fractional risk (Kelly-inspired)
 * This is the recommended way to size positions for proper risk management
 * 
 * @param accountSize - Total account value in dollars
 * @param riskPerTrade - Risk per trade as decimal (0.01 = 1%, 0.02 = 2%)
 * @param entryPrice - Entry price per share/contract
 * @param stopLoss - Stop loss price per share/contract
 * @param assetType - Type of asset being traded
 * @returns Position sizing details
 */
export function calculatePositionSize(
  accountSize: number,
  riskPerTrade: number,
  entryPrice: number,
  stopLoss: number,
  assetType: 'stock' | 'option' | 'crypto' | 'future' = 'stock'
): {
  shares: number;
  positionValue: number;
  maxLossAmount: number;
  positionPercent: number;
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let isValid = true;
  
  // Calculate risk per share/unit
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  
  // Guard against zero risk (stop at entry price)
  if (riskPerShare === 0) {
    warnings.push('Stop loss equals entry price - cannot calculate position size');
    return {
      shares: 0,
      positionValue: 0,
      maxLossAmount: 0,
      positionPercent: 0,
      isValid: false,
      warnings,
    };
  }
  
  // Multiplier for options (1 contract = 100 shares)
  const multiplier = assetType === 'option' ? 100 : 1;
  
  // Maximum amount willing to risk on this trade
  const maxRiskAmount = accountSize * riskPerTrade;
  
  // Calculate number of shares that fits within risk budget
  let shares = Math.floor(maxRiskAmount / riskPerShare);
  
  // For options, minimum is 1 contract
  if (assetType === 'option' && shares < 1) {
    shares = 1;
    warnings.push('Minimum 1 contract for options - exceeds risk budget');
  }
  
  // Check if position is too large for account and clamp
  let positionValue = shares * entryPrice * multiplier;
  if (positionValue > accountSize) {
    isValid = false;
    warnings.push('Position value exceeds account size - reducing to fit');
    shares = Math.floor(accountSize / (entryPrice * multiplier));
  }
  
  // Recalculate ALL derived values after any share adjustments
  shares = Math.max(shares, 0);
  positionValue = shares * entryPrice * multiplier;
  const maxLossAmount = shares * riskPerShare * multiplier;
  const positionPercent = accountSize > 0 ? (positionValue / accountSize) * 100 : 0;
  
  // Check if position is too concentrated (>25% of account is risky)
  if (positionPercent > 25) {
    warnings.push(`Position is ${positionPercent.toFixed(1)}% of account - consider reducing`);
  }
  
  // Check if stop is too wide (risk per share > 10% of price)
  if (riskPerShare / entryPrice > 0.10) {
    warnings.push('Stop loss is very wide (>10% from entry)');
  }
  
  return {
    shares,
    positionValue,
    maxLossAmount,
    positionPercent,
    isValid,
    warnings,
  };
}

/**
 * Calculate REAL performance stats counting ALL losses (no 3% filter)
 * This is the honest accounting that matches actual account P&L
 */
export interface RealPerformanceStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;           // Real win rate (no filtering)
  avgWinPercent: number;
  avgLossPercent: number;
  expectancy: number;        // Expected value per trade
  profitFactor: number;      // Gross profit / Gross loss
  maxConsecutiveLosses: number;
  largestWin: number;
  largestLoss: number;
}

/**
 * Calculate real performance stats from trade results - NO FILTERING
 * This is the honest accounting that shows actual account impact
 * 
 * @param trades - Array of completed trade results with percentGain
 * @returns Real performance statistics without any loss filtering
 */
export function calculateRealPerformanceStats(
  trades: Array<{ percentGain: number | null; outcomeStatus: string }>
): RealPerformanceStats {
  // Only include closed trades with valid P&L
  const completedTrades = trades.filter(
    t => t.outcomeStatus !== 'open' && t.percentGain !== null
  );
  
  if (completedTrades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      expectancy: 0,
      profitFactor: 0,
      maxConsecutiveLosses: 0,
      largestWin: 0,
      largestLoss: 0,
    };
  }
  
  // Categorize trades honestly (including small losses)
  const wins = completedTrades.filter(t => (t.percentGain || 0) > 0);
  const losses = completedTrades.filter(t => (t.percentGain || 0) < 0);
  const breakeven = completedTrades.filter(t => (t.percentGain || 0) === 0);
  
  // Calculate averages
  const avgWinPercent = wins.length > 0
    ? wins.reduce((sum, t) => sum + (t.percentGain || 0), 0) / wins.length
    : 0;
  
  const avgLossPercent = losses.length > 0
    ? losses.reduce((sum, t) => sum + (t.percentGain || 0), 0) / losses.length
    : 0;
  
  // Win rate (honest - no filtering)
  const winRate = wins.length / completedTrades.length;
  
  // Expectancy: (Win% × AvgWin) + (Loss% × AvgLoss)
  const lossRate = losses.length / completedTrades.length;
  const expectancy = (winRate * avgWinPercent) + (lossRate * avgLossPercent);
  
  // Profit factor: Gross Profit / |Gross Loss|
  const grossProfit = wins.reduce((sum, t) => sum + (t.percentGain || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.percentGain || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  // Max consecutive losses
  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  for (const trade of completedTrades) {
    if ((trade.percentGain || 0) < 0) {
      currentStreak++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  // Largest win/loss
  const largestWin = wins.length > 0
    ? Math.max(...wins.map(t => t.percentGain || 0))
    : 0;
  
  const largestLoss = losses.length > 0
    ? Math.min(...losses.map(t => t.percentGain || 0))
    : 0;
  
  return {
    totalTrades: completedTrades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: Number((winRate * 100).toFixed(1)),
    avgWinPercent: Number(avgWinPercent.toFixed(2)),
    avgLossPercent: Number(avgLossPercent.toFixed(2)),
    expectancy: Number(expectancy.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    maxConsecutiveLosses,
    largestWin: Number(largestWin.toFixed(2)),
    largestLoss: Number(largestLoss.toFixed(2)),
  };
}

interface ValidationResult {
  shouldUpdate: boolean;
  outcomeStatus?: TradeIdea['outcomeStatus'];
  exitPrice?: number;
  realizedPnL?: number;
  percentGain?: number;
  resolutionReason?: TradeIdea['resolutionReason'];
  exitDate?: string;
  actualHoldingTimeMinutes?: number;
  predictionAccurate?: boolean; // LEGACY: kept for backward compatibility
  predictionAccuracyPercent?: number; // NEW: percentage-based accuracy (0-100+)
  predictionValidatedAt?: string;
  highestPriceReached?: number;
  lowestPriceReached?: number;
}

export class PerformanceValidator {
  /**
   * Parse human-readable exitBy dates like "Oct 22, 10:28 AM CST" or "Oct 22, 9:55 AM CST or Expiry"
   * Uses the trade's creation timestamp to determine the correct year
   * Returns a valid Date object or null if parsing fails
   */
  private static parseExitByDate(exitByString: string, tradeCreatedAt: Date): Date | null {
    try {
      // Strip surrounding quotes if present (some DB values have them)
      let cleanedString = exitByString.replace(/^["']|["']$/g, '').trim();
      
      // Remove "or Expiry" suffix if present
      cleanedString = cleanedString.replace(/\s+or\s+Expiry$/i, '').trim();
      
      // Try standard parsing first (handles ISO dates like "2025-10-22T15:57:36.995Z")
      let exitByDate = new Date(cleanedString);
      if (!isNaN(exitByDate.getTime())) {
        return exitByDate;
      }
      
      // Parse human-readable format: "Oct 22, 10:28 AM CST" or "Oct 22, 10:28 AM ET"
      // Regex captures: (Month) (Day), (Hour):(Min) (AM/PM) (optional Timezone)
      const match = cleanedString.match(/^(\w{3})\s+(\d{1,2}),\s+(\d{1,2}):(\d{2})\s+(AM|PM)(?:\s+(\w+))?/i);
      
      if (!match) {
        console.warn(`[parseExitByDate] Failed to parse: "${exitByString}"`);
        return null;
      }
      
      const [, monthStr, dayStr, hourStr, minuteStr, ampm, tzStr] = match;
      
      // Convert month abbreviation to number (0-indexed) - case insensitive
      const monthMapLower: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };
      
      const month = monthMapLower[monthStr.toLowerCase()];
      if (month === undefined) {
        console.warn(`[parseExitByDate] Unknown month: "${monthStr}"`);
        return null;
      }
      
      const day = parseInt(dayStr);
      let hour = parseInt(hourStr);
      const minute = parseInt(minuteStr);
      
      // Convert to 24-hour format
      if (ampm.toUpperCase() === 'PM' && hour !== 12) {
        hour += 12;
      } else if (ampm.toUpperCase() === 'AM' && hour === 12) {
        hour = 0;
      }
      
      // 🔧 FIX: Use the trade's year, not current year
      const tradeYear = tradeCreatedAt.getFullYear();
      
      // Determine which year to use by comparing against trade timestamp ± 36 hours
      // Most trades exit within 36 hours of creation - use this window for year inference
      let exitYear = tradeYear;
      
      // Build a candidate date in the trade's year first
      const candidateInTradeYear = new Date(tradeYear, month, day, hour, minute);
      const candidateInNextYear = new Date(tradeYear + 1, month, day, hour, minute);
      
      // Calculate time difference from trade creation (in hours)
      const diffTradeYear = Math.abs(candidateInTradeYear.getTime() - tradeCreatedAt.getTime()) / (1000 * 60 * 60);
      const diffNextYear = Math.abs(candidateInNextYear.getTime() - tradeCreatedAt.getTime()) / (1000 * 60 * 60);
      
      // Use the year that puts the exit date closest to trade timestamp within a reasonable window
      // If trade year candidate is within 36 hours, use it; otherwise check next year
      if (diffTradeYear <= 36) {
        exitYear = tradeYear;
      } else if (diffNextYear <= 36) {
        exitYear = tradeYear + 1;
      } else {
        // Both are far from trade date - pick the closer one that's in the future relative to trade
        if (candidateInTradeYear >= tradeCreatedAt) {
          exitYear = tradeYear;
        } else if (candidateInNextYear >= tradeCreatedAt) {
          exitYear = tradeYear + 1;
        } else {
          // Fallback: use trade year
          exitYear = tradeYear;
        }
      }
      
      // 🔧 FIX: Parse timezone from string and use correct offset
      // CST = Central Standard Time (UTC-6)
      // CDT = Central Daylight Time (UTC-5)
      // EST = Eastern Standard Time (UTC-5)
      // EDT = Eastern Daylight Time (UTC-4)
      // ET = Eastern Time (could be EST or EDT, assume standard for safety)
      const tzOffsets: Record<string, string> = {
        'CST': '-06:00',
        'CDT': '-05:00',
        'EST': '-05:00',
        'EDT': '-04:00',
        'ET': '-05:00',  // Default to EST
        'CT': '-06:00',  // Default to CST
        'PST': '-08:00',
        'PDT': '-07:00',
        'PT': '-08:00',  // Default to PST
      };
      
      const tzOffset = tzOffsets[tzStr?.toUpperCase()] || '-05:00'; // Default to ET (Eastern Time)
      
      // Build ISO date string
      const isoMonth = String(month + 1).padStart(2, '0');
      const isoDay = String(day).padStart(2, '0');
      const isoHour = String(hour).padStart(2, '0');
      const isoMinute = String(minute).padStart(2, '0');
      
      const isoString = `${exitYear}-${isoMonth}-${isoDay}T${isoHour}:${isoMinute}:00${tzOffset}`;
      
      exitByDate = new Date(isoString);
      
      if (isNaN(exitByDate.getTime())) {
        console.error(`[parseExitByDate] Failed to parse ISO date: ${isoString}`);
        return null;
      }
      
      // Sanity check: exitBy should be after trade creation (or within a reasonable window before for pre-market)
      const maxDaysBeforeTrade = 1; // Allow 1 day before trade creation for pre-market ideas
      const minValidDate = new Date(tradeCreatedAt.getTime() - (maxDaysBeforeTrade * 24 * 60 * 60 * 1000));
      
      if (exitByDate < minValidDate) {
        // Exit date is way before trade creation - probably wrong year, try next year
        const nextYearIsoString = `${exitYear + 1}-${isoMonth}-${isoDay}T${isoHour}:${isoMinute}:00${tzOffset}`;
        const nextYearDate = new Date(nextYearIsoString);
        if (!isNaN(nextYearDate.getTime())) {
          console.log(`[parseExitByDate] Adjusted ${exitByString} from ${exitYear} to ${exitYear + 1}`);
          return nextYearDate;
        }
      }
      
      return exitByDate;
    } catch (e) {
      console.error(`[parseExitByDate] Exception parsing "${exitByString}":`, e);
      return null;
    }
  }

  /**
   * Validate trade direction/target/stop/option type consistency
   * Preserves all VALID option combinations, only corrects STOCKS with mismatched direction
   * 
   * Valid combinations:
   * - Stocks: long (bullish) = target > entry, short (bearish) = target < entry
   * - Options bullish: {long call} OR {short put} with target > entry
   * - Options bearish: {long put} OR {short call} with target < entry
   * 
   * @returns Validated trade data with warnings for invalid options
   */
  static validateAndCorrectTrade(trade: {
    direction: string;
    assetType: string;
    optionType?: string | null;
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
  }): {
    direction: 'long' | 'short';
    optionType?: 'call' | 'put' | null;
    warnings: string[];
  } | null {
    const warnings: string[] = [];
    
    // Determine if trade is bullish or bearish based on entry/target
    const isBullish = trade.targetPrice > trade.entryPrice;
    
    // For non-options, validate and AUTO-CORRECT direction if needed
    if (trade.assetType !== 'option') {
      const expectedDirection = isBullish ? 'long' : 'short';
      if (trade.direction !== expectedDirection) {
        warnings.push(`Stock direction "${trade.direction}" doesn't match entry/target logic (entry=${trade.entryPrice}, target=${trade.targetPrice}). Auto-corrected to "${expectedDirection}".`);
        return {
          direction: expectedDirection,
          optionType: null,
          warnings
        };
      }
      // Valid stock trade
      return {
        direction: trade.direction as 'long' | 'short',
        optionType: null,
        warnings: []
      };
    }
    
    // For options, validate direction + optionType combination is valid for bias
    const validBullish = (trade.direction === 'long' && trade.optionType === 'call') ||
                         (trade.direction === 'short' && trade.optionType === 'put');
    const validBearish = (trade.direction === 'long' && trade.optionType === 'put') ||
                         (trade.direction === 'short' && trade.optionType === 'call');
    
    // Check if combination is valid for the expected directional bias
    if (isBullish && !validBullish) {
      warnings.push(`INVALID OPTION TRADE: Bullish target (${trade.targetPrice} > ${trade.entryPrice}) but direction="${trade.direction}" + optionType="${trade.optionType}" is not a valid bullish combination. Valid: {long call} or {short put}. Trade will be REJECTED.`);
      // DO NOT auto-correct options - this could corrupt user intent
      // Return original values with warning
      return {
        direction: trade.direction as 'long' | 'short',
        optionType: trade.optionType as 'call' | 'put' | null,
        warnings
      };
    } else if (!isBullish && !validBearish) {
      warnings.push(`INVALID OPTION TRADE: Bearish target (${trade.targetPrice} < ${trade.entryPrice}) but direction="${trade.direction}" + optionType="${trade.optionType}" is not a valid bearish combination. Valid: {long put} or {short call}. Trade will be REJECTED.`);
      // DO NOT auto-correct options - this could corrupt user intent
      // Return original values with warning
      return {
        direction: trade.direction as 'long' | 'short',
        optionType: trade.optionType as 'call' | 'put' | null,
        warnings
      };
    }
    
    // Valid option trade - no corrections needed
    return {
      direction: trade.direction as 'long' | 'short',
      optionType: trade.optionType as 'call' | 'put',
      warnings: []
    };
  }

  /**
   * Normalize trade direction considering both direction field and option type
   * This ensures correct validation for both stocks and options
   * 
   * Rules:
   * - Stocks: direction field directly indicates bullish (long) vs bearish (short)
   * - Options: {long call, short put} = bullish, {long put, short call} = bearish
   * 
   * @returns 'long' for bullish trades, 'short' for bearish trades
   */
  static getNormalizedDirection(idea: TradeIdea): 'long' | 'short' {
    // For non-option assets, use direction field directly
    if (idea.assetType !== 'option' || !idea.optionType) {
      return idea.direction as 'long' | 'short';
    }

    // For options, normalize based on direction + option type combination
    if (idea.direction === 'long' && idea.optionType === 'call') {
      return 'long';  // Long call = bullish (price goes up)
    } else if (idea.direction === 'long' && idea.optionType === 'put') {
      return 'short'; // Long put = bearish (price goes down)
    } else if (idea.direction === 'short' && idea.optionType === 'call') {
      return 'short'; // Short call = bearish (price goes down)
    } else if (idea.direction === 'short' && idea.optionType === 'put') {
      return 'long';  // Short put = bullish (price goes up)
    }

    // Fallback to direction field if unable to normalize
    return idea.direction as 'long' | 'short';
  }

  /**
   * Validates a trade idea against current market price
   * Determines if it hit target, hit stop, or expired
   * Note: currentPrice can be null/undefined for expiry checks when market is closed
   * @param futuresContract Optional futures contract metadata (avoids circular dependency)
   */
  static validateTradeIdea(idea: TradeIdea, currentPrice?: number | null, futuresContract?: FuturesContract | null): ValidationResult {
    // Skip if already closed
    if (idea.outcomeStatus !== 'open') {
      return { shouldUpdate: false };
    }

    const timezone = 'America/Chicago';
    const now = new Date();
    const createdAt = new Date(idea.timestamp);

    // Calculate holding time in minutes
    const holdingTimeMs = now.getTime() - createdAt.getTime();
    const holdingTimeMinutes = Math.floor(holdingTimeMs / (1000 * 60));

    // 🚨 CRITICAL CHECK: Has the entry window closed?
    // If entryValidUntil has passed, mark as expired (missed entry window)
    if (idea.entryValidUntil) {
      try {
        const entryValidUntilDate = this.parseExitByDate(idea.entryValidUntil, createdAt);
        
        if (entryValidUntilDate && now > entryValidUntilDate) {
          const hoursPassedSinceEntry = (now.getTime() - entryValidUntilDate.getTime()) / (1000 * 60 * 60);
          console.log(`⛔ [VALIDATION] ${idea.symbol} EXPIRED - Entry window closed ${hoursPassedSinceEntry.toFixed(1)}h ago (Valid Until: ${idea.entryValidUntil})`);
          
          // Use entry price since we never entered the trade
          const lastKnownPrice = idea.entryPrice;
          
          return {
            shouldUpdate: true,
            outcomeStatus: 'expired',
            exitPrice: lastKnownPrice,
            percentGain: 0, // Never entered, no gain/loss
            realizedPnL: 0,
            resolutionReason: 'missed_entry_window',
            exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            actualHoldingTimeMinutes: 0, // Never held the position
            predictionAccurate: false, // Can't validate if we didn't enter
            predictionAccuracyPercent: 0,
            predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            highestPriceReached: lastKnownPrice,
            lowestPriceReached: lastKnownPrice,
          };
        }
      } catch (e) {
        console.warn(`⚠️ [VALIDATION] Error parsing entryValidUntil for ${idea.symbol}:`, e);
      }
    }

    // 🚨 CRITICAL CHECK: Has the futures contract expired?
    // Futures use futuresContractCode and check against contract expiration
    // BUG FIX: Use passed contract parameter instead of dynamic import (avoids circular dependency)
    if (idea.assetType === 'future' && idea.futuresContractCode) {
      // 🔧 BUG FIX: Validate contract metadata exists - don't use hardcoded defaults
      if (!futuresContract) {
        console.error(`❌ [VALIDATION ERROR] ${idea.symbol}: Missing futures contract metadata for ${idea.futuresContractCode}. Cannot validate without contract data. Skipping validation.`);
        return { shouldUpdate: false };
      }
      
      if (!futuresContract.initialMargin || futuresContract.initialMargin <= 0) {
        console.error(`❌ [VALIDATION ERROR] ${idea.symbol}: Invalid or missing initialMargin for contract ${idea.futuresContractCode}. Cannot calculate margin return. Skipping validation.`);
        return { shouldUpdate: false };
      }
      
      try {
        const expiryDate = new Date(futuresContract.expirationDate);
        
        if (!isNaN(expiryDate.getTime()) && now > expiryDate) {
          const hoursPastExpiry = (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60);
          console.log(`⛔ [VALIDATION] ${idea.symbol} FUTURES CONTRACT EXPIRED ${hoursPastExpiry.toFixed(1)}h ago (Contract: ${idea.futuresContractCode}, Expiry: ${futuresContract.expirationDate})`);
          
          // Use last known price (entry price for futures since we can't fetch historical prices yet)
          const lastKnownPrice = currentPrice ?? idea.entryPrice;
          
          const highestPrice = Math.max(
            idea.highestPriceReached || idea.entryPrice,
            currentPrice || idea.highestPriceReached || idea.entryPrice
          );
          const lowestPrice = Math.min(
            idea.lowestPriceReached || idea.entryPrice,
            currentPrice || idea.lowestPriceReached || idea.entryPrice
          );
          
          const percentGain = this.calculatePercentGain(
            idea.direction as 'long' | 'short',
            idea.entryPrice,
            lastKnownPrice
          );
          
          // 🔧 BUG FIX: Calculate futures P&L correctly (multiply by multiplier ONCE, not twice)
          // Old broken formula: pnl = (price delta * multiplier) / (tick * multiplier) * (tick * multiplier)
          // New correct formula: Round price delta to tick size FIRST, then multiply by multiplier ONCE
          const directionSign = idea.direction === 'long' ? 1 : -1;
          const priceDelta = (lastKnownPrice - idea.entryPrice) * directionSign;
          const tickSize = idea.futuresTickSize || 0.25;
          const multiplier = idea.futuresMultiplier || 1;
          
          // 🔧 DIRECTION-AWARE ROUNDING: Conservative rounding to prevent sign flip
          // For LONG trades: use Math.floor (rounds down, conservative)
          // For SHORT trades: use Math.ceil (rounds up towards zero, conservative)
          const ticksAway = priceDelta / tickSize;
          const tickRounded = (idea.direction === 'long' ? Math.floor(ticksAway) : Math.ceil(ticksAway)) * tickSize;
          
          // Multiply by contract multiplier exactly ONCE
          const realizedPnL = tickRounded * multiplier;
          
          // Calculate margin return
          const marginReturn = futuresContract.initialMargin > 0 ? (realizedPnL / futuresContract.initialMargin) * 100 : 0;
          
          const predictionAccurate = this.checkPredictionAccuracy(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          console.log(`💰 [FUTURES-PNL] ${idea.symbol} ${idea.futuresContractCode}: P&L ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)} (${marginReturn.toFixed(1)}% return on margin)`);
          
          return {
            shouldUpdate: true,
            outcomeStatus: 'expired',
            exitPrice: lastKnownPrice,
            percentGain,
            realizedPnL,
            resolutionReason: 'auto_expired',
            exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            actualHoldingTimeMinutes: holdingTimeMinutes,
            predictionAccurate,
            predictionAccuracyPercent,
            predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            highestPriceReached: highestPrice,
            lowestPriceReached: lowestPrice,
          };
        }
      } catch (e) {
        console.warn(`⚠️ [VALIDATION] Error checking futures contract expiration for ${idea.symbol}:`, e);
      }
    }

    // 🚨 CRITICAL CHECK: Has the option expired?
    // Options use expiryDate field instead of exitBy
    if (idea.assetType === 'option' && idea.expiryDate) {
      try {
        const expiryDate = new Date(idea.expiryDate);
        
        if (!isNaN(expiryDate.getTime()) && now > expiryDate) {
          const hoursPastExpiry = (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60);
          console.log(`⛔ [VALIDATION] ${idea.symbol} OPTION EXPIRED ${hoursPastExpiry.toFixed(1)}h ago (Expiry: ${idea.expiryDate})`);
          
          // Use last known price (entry price for options since we can't fetch historical option premiums)
          const lastKnownPrice = currentPrice ?? idea.entryPrice;
          
          const highestPrice = Math.max(
            idea.highestPriceReached || idea.entryPrice,
            currentPrice || idea.highestPriceReached || idea.entryPrice
          );
          const lowestPrice = Math.min(
            idea.lowestPriceReached || idea.entryPrice,
            currentPrice || idea.lowestPriceReached || idea.entryPrice
          );
          
          const percentGain = this.calculatePercentGain(
            idea.direction as 'long' | 'short',
            idea.entryPrice,
            lastKnownPrice
          );
          
          const predictionAccurate = this.checkPredictionAccuracy(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          return {
            shouldUpdate: true,
            outcomeStatus: 'expired',
            exitPrice: lastKnownPrice,
            percentGain,
            realizedPnL: 0,
            resolutionReason: 'auto_expired',
            exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            actualHoldingTimeMinutes: holdingTimeMinutes,
            predictionAccurate,
            predictionAccuracyPercent,
            predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
            highestPriceReached: highestPrice,
            lowestPriceReached: lowestPrice,
          };
        }
      } catch (e) {
        console.warn(`⚠️ [VALIDATION] Error parsing expiryDate for ${idea.symbol}:`, e);
      }
    }

    // Check if exitBy time has passed (holding period deadline)
    // This check doesn't require current price
    if (idea.exitBy) {
      try {
        const exitByDate = this.parseExitByDate(idea.exitBy, createdAt);
        
        if (!exitByDate) {
          console.warn(`⚠️ [VALIDATION] Invalid exitBy date for ${idea.symbol}: ${idea.exitBy}`);
          // Skip expiry check for invalid dates, fall through to other checks
        } else {
          // CRITICAL SAFEGUARD: Double-check date is actually in the past
          const timeDiff = exitByDate.getTime() - now.getTime();
          const hoursUntilExpiry = timeDiff / (1000 * 60 * 60);
          
          // Log validation details for debugging
          console.log(`📊 [VALIDATION] ${idea.symbol}: exitBy="${idea.exitBy}" → parsed as ${exitByDate.toISOString()} (${hoursUntilExpiry.toFixed(1)}h remaining)`);
          
          // SAFEGUARD: Only mark as expired if truly past deadline
          if (now > exitByDate) {
          // Use last known price (entry, highest, or lowest) if current price unavailable
          const lastKnownPrice = currentPrice ?? 
            (idea.highestPriceReached || idea.lowestPriceReached || idea.entryPrice);
          
          const highestPrice = Math.max(
            idea.highestPriceReached || idea.entryPrice, 
            currentPrice || idea.highestPriceReached || idea.entryPrice
          );
          const lowestPrice = Math.min(
            idea.lowestPriceReached || idea.entryPrice,
            currentPrice || idea.lowestPriceReached || idea.entryPrice
          );
          
          const directionForExpired = idea.assetType === 'option' 
            ? idea.direction as 'long' | 'short'
            : this.getNormalizedDirection(idea);
          const percentGain = this.calculatePercentGain(
            directionForExpired,
            idea.entryPrice,
            lastKnownPrice
          );
          
          const predictionAccurate = this.checkPredictionAccuracy(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );
          
          const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
            idea,
            lastKnownPrice,
            highestPrice,
            lowestPrice
          );

            console.log(`✅ [VALIDATION] ${idea.symbol} EXPIRED (deadline passed ${(-hoursUntilExpiry).toFixed(1)}h ago)`);
            
            return {
              shouldUpdate: true,
              outcomeStatus: 'expired',
              exitPrice: lastKnownPrice,
              percentGain,
              realizedPnL: 0,
              resolutionReason: 'auto_expired',
              exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
              actualHoldingTimeMinutes: holdingTimeMinutes,
              predictionAccurate,
              predictionAccuracyPercent,
              predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
              highestPriceReached: highestPrice,
              lowestPriceReached: lowestPrice,
            };
          } else {
            // Date is in the future - DO NOT mark as expired
            console.log(`⏰ [VALIDATION] ${idea.symbol} still active (${hoursUntilExpiry.toFixed(1)}h until expiry)`);
          }
        }
      } catch (e) {
        // If exitBy parsing fails, continue to other checks
        console.warn(`❌ [VALIDATION] Failed to parse exitBy date for ${idea.symbol}: ${idea.exitBy}`, e);
      }
    }

    // Check if expired (7+ days old as backup)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (createdAt < sevenDaysAgo) {
      const lastKnownPrice = currentPrice ?? 
        (idea.highestPriceReached || idea.lowestPriceReached || idea.entryPrice);
      
      const highestPrice = Math.max(
        idea.highestPriceReached || idea.entryPrice, 
        currentPrice || idea.highestPriceReached || idea.entryPrice
      );
      const lowestPrice = Math.min(
        idea.lowestPriceReached || idea.entryPrice,
        currentPrice || idea.lowestPriceReached || idea.entryPrice
      );
      
      const directionFor7Days = idea.assetType === 'option' 
        ? idea.direction as 'long' | 'short'
        : this.getNormalizedDirection(idea);
      const percentGain = this.calculatePercentGain(
        directionFor7Days,
        idea.entryPrice,
        lastKnownPrice
      );
      
      const predictionAccurate = this.checkPredictionAccuracy(
        idea,
        lastKnownPrice,
        highestPrice,
        lowestPrice
      );
      
      const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
        idea,
        lastKnownPrice,
        highestPrice,
        lowestPrice
      );

      return {
        shouldUpdate: true,
        outcomeStatus: 'expired',
        exitPrice: lastKnownPrice,
        percentGain,
        realizedPnL: 0, // Don't calculate P&L for expired ideas
        resolutionReason: 'auto_expired',
        exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        actualHoldingTimeMinutes: holdingTimeMinutes,
        predictionAccurate,
        predictionAccuracyPercent,
        predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        highestPriceReached: highestPrice,
        lowestPriceReached: lowestPrice,
      };
    }

    // For target/stop checks, we need current price to update extremes
    // But we can still validate using historical extremes if current price unavailable
    
    // Track price extremes (update if current price is more extreme)
    const highestPrice = currentPrice 
      ? Math.max(idea.highestPriceReached || idea.entryPrice, currentPrice)
      : (idea.highestPriceReached || idea.entryPrice);
    const lowestPrice = currentPrice
      ? Math.min(idea.lowestPriceReached || idea.entryPrice, currentPrice)
      : (idea.lowestPriceReached || idea.entryPrice);

    // 🔧 CRITICAL FIX: For OPTIONS, use actual direction (not normalized)
    // because we're validating PREMIUM prices, not underlying stock movement.
    // For STOCKS/CRYPTO, use normalized direction for semantic correctness.
    //
    // Example: SHORT PUT (direction='short', optionType='put')
    //   - Normalized: 'long' (bullish on underlying)  
    //   - Actual: 'short' (you SELL the option, profit when premium DROPS)
    //   - We need ACTUAL direction to validate premium movement correctly!
    const directionForValidation = idea.assetType === 'option' 
      ? idea.direction as 'long' | 'short'
      : this.getNormalizedDirection(idea);

    // 🎯 CRITICAL FIX: Check INTRADAY highs/lows instead of current price
    // This catches targets that were hit intraday but reversed by EOD
    // For LONG trades: Check if highest price reached >= target
    // For SHORT trades: Check if lowest price reached <= target
    const targetHit = directionForValidation === 'long'
      ? highestPrice >= idea.targetPrice
      : lowestPrice <= idea.targetPrice;

    if (targetHit) {
      const percentGain = this.calculatePercentGain(
        directionForValidation,
        idea.entryPrice,
        idea.targetPrice
      );

      // Calculate futures P&L if applicable
      let realizedPnL = 0;
      if (idea.assetType === 'future' && idea.futuresMultiplier && idea.futuresTickSize) {
        // 🔧 BUG FIX: Calculate futures P&L correctly (multiply by multiplier ONCE, not twice)
        const directionSign = idea.direction === 'long' ? 1 : -1;
        const priceDelta = (idea.targetPrice - idea.entryPrice) * directionSign;
        const tickSize = idea.futuresTickSize;
        const multiplier = idea.futuresMultiplier;
        
        // 🔧 DIRECTION-AWARE ROUNDING: Conservative rounding to prevent sign flip
        // For LONG trades: use Math.floor (rounds down, conservative)
        // For SHORT trades: use Math.ceil (rounds up towards zero, conservative)
        const ticksAway = priceDelta / tickSize;
        const tickRounded = (idea.direction === 'long' ? Math.floor(ticksAway) : Math.ceil(ticksAway)) * tickSize;
        
        // Multiply by contract multiplier exactly ONCE
        realizedPnL = tickRounded * multiplier;
        
        console.log(`💰 [FUTURES-PNL] ${idea.symbol} target hit: P&L ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`);
      }

      console.log(`🎯 [VALIDATION] ${idea.symbol} HIT TARGET intraday (${directionForValidation.toUpperCase()}: ${directionForValidation === 'long' ? `high $${highestPrice.toFixed(2)} >= target $${idea.targetPrice}` : `low $${lowestPrice.toFixed(2)} <= target $${idea.targetPrice}`})`);

      return {
        shouldUpdate: true,
        outcomeStatus: 'hit_target',
        exitPrice: idea.targetPrice,
        percentGain,
        realizedPnL,
        resolutionReason: 'auto_target_hit',
        exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        actualHoldingTimeMinutes: holdingTimeMinutes,
        predictionAccurate: true, // Hit target = prediction was accurate
        predictionAccuracyPercent: 100, // Hit target = 100% accuracy
        predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        highestPriceReached: highestPrice,
        lowestPriceReached: lowestPrice,
      };
    }

    // 🎯 CRITICAL FIX: Check INTRADAY highs/lows for stops too
    // For LONG trades: Check if lowest price reached <= stop
    // For SHORT trades: Check if highest price reached >= stop
    const stopHit = directionForValidation === 'long'
      ? lowestPrice <= idea.stopLoss
      : highestPrice >= idea.stopLoss;

    if (stopHit) {
      const percentGain = this.calculatePercentGain(
        directionForValidation,
        idea.entryPrice,
        idea.stopLoss
      );
      
      // 🎯 MINIMUM LOSS THRESHOLD CHECK
      // If loss is below threshold (e.g., -0.1%, -0.4%), treat as breakeven/expired
      // This prevents noise-level stop-outs from counting as real losses
      const absLoss = Math.abs(percentGain);
      if (absLoss < MIN_LOSS_THRESHOLD_PERCENT) {
        console.log(`📊 [VALIDATION] ${idea.symbol} stop touched but loss too small (${percentGain.toFixed(2)}% < ${MIN_LOSS_THRESHOLD_PERCENT}% threshold) - marking as BREAKEVEN`);
        
        const predictionAccurate = this.checkPredictionAccuracy(
          idea,
          currentPrice || lowestPrice,
          highestPrice,
          lowestPrice
        );
        
        const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
          idea,
          currentPrice || lowestPrice,
          highestPrice,
          lowestPrice
        );
        
        return {
          shouldUpdate: true,
          outcomeStatus: 'expired', // Breakeven = expired, not a real loss
          exitPrice: idea.stopLoss,
          percentGain,
          realizedPnL: 0,
          resolutionReason: 'auto_breakeven', // New resolution reason
          exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
          actualHoldingTimeMinutes: holdingTimeMinutes,
          predictionAccurate,
          predictionAccuracyPercent,
          predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
          highestPriceReached: highestPrice,
          lowestPriceReached: lowestPrice,
        };
      }
      
      // Calculate futures P&L if applicable
      let realizedPnL = 0;
      if (idea.assetType === 'future' && idea.futuresMultiplier && idea.futuresTickSize) {
        // 🔧 BUG FIX: Calculate futures P&L correctly (multiply by multiplier ONCE, not twice)
        const directionSign = idea.direction === 'long' ? 1 : -1;
        const priceDelta = (idea.stopLoss - idea.entryPrice) * directionSign;
        const tickSize = idea.futuresTickSize;
        const multiplier = idea.futuresMultiplier;
        
        // 🔧 DIRECTION-AWARE ROUNDING: Conservative rounding to prevent sign flip
        // For LONG trades: use Math.floor (rounds down, conservative)
        // For SHORT trades: use Math.ceil (rounds up towards zero, conservative)
        const ticksAway = priceDelta / tickSize;
        const tickRounded = (idea.direction === 'long' ? Math.floor(ticksAway) : Math.ceil(ticksAway)) * tickSize;
        
        // Multiply by contract multiplier exactly ONCE
        realizedPnL = tickRounded * multiplier;
        
        console.log(`💰 [FUTURES-PNL] ${idea.symbol} stop hit: P&L ${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`);
      }
      
      // Even if stop hit, check if prediction moved in right direction before reversing
      const predictionAccurate = this.checkPredictionAccuracy(
        idea,
        currentPrice || lowestPrice,
        highestPrice,
        lowestPrice
      );
      
      const predictionAccuracyPercent = this.calculatePredictionAccuracyPercent(
        idea,
        currentPrice || lowestPrice,
        highestPrice,
        lowestPrice
      );

      console.log(`🛑 [VALIDATION] ${idea.symbol} HIT STOP intraday (${directionForValidation.toUpperCase()}: ${directionForValidation === 'long' ? `low $${lowestPrice.toFixed(2)} <= stop $${idea.stopLoss}` : `high $${highestPrice.toFixed(2)} >= stop $${idea.stopLoss}`}) - Loss: ${percentGain.toFixed(2)}%`);

      return {
        shouldUpdate: true,
        outcomeStatus: 'hit_stop',
        exitPrice: idea.stopLoss,
        percentGain,
        realizedPnL,
        resolutionReason: 'auto_stop_hit',
        exitDate: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        actualHoldingTimeMinutes: holdingTimeMinutes,
        predictionAccurate,
        predictionAccuracyPercent,
        predictionValidatedAt: formatInTimeZone(now, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        highestPriceReached: highestPrice,
        lowestPriceReached: lowestPrice,
      };
    }

    // Still open - update price extremes if they changed
    const priceExtremesChanged = currentPrice && (
      highestPrice !== (idea.highestPriceReached || idea.entryPrice) ||
      lowestPrice !== (idea.lowestPriceReached || idea.entryPrice)
    );

    if (priceExtremesChanged) {
      return {
        shouldUpdate: true,
        highestPriceReached: highestPrice,
        lowestPriceReached: lowestPrice,
      };
    }

    // Still open - no update needed
    return { shouldUpdate: false };
  }

  /**
   * Calculate percentage gain/loss
   */
  private static calculatePercentGain(
    direction: string,
    entryPrice: number,
    exitPrice: number
  ): number {
    if (!entryPrice || entryPrice === 0) return 0;

    const priceDiff = exitPrice - entryPrice;
    const percentChange = (priceDiff / entryPrice) * 100;

    // For shorts, invert the percentage
    return direction === 'short' ? -percentChange : percentChange;
  }

  /**
   * Calculate prediction accuracy as percentage progress toward target
   * Returns 0-100+ (can exceed 100% if price moves beyond target)
   * 
   * Example: Entry $100, Target $110 ($10 move expected)
   *   - If at $105: 50% progress (moved $5 of $10)
   *   - If at $108: 80% progress (moved $8 of $10)
   *   - If at $112: 120% progress (moved $12 of $10)
   */
  private static calculatePredictionAccuracyPercent(
    idea: TradeIdea,
    currentPrice: number,
    highestPrice?: number,
    lowestPrice?: number
  ): number {
    const expectedMove = idea.targetPrice - idea.entryPrice;
    
    if (idea.direction === 'long') {
      // For LONG: Calculate progress using highest price reached
      const peakPrice = highestPrice || currentPrice;
      const actualMove = peakPrice - idea.entryPrice;
      const progressPercent = (actualMove / expectedMove) * 100;
      // Clamp at 0 minimum (negative means moved wrong direction)
      return Math.max(0, progressPercent);
    } else {
      // For SHORT: Calculate progress using lowest price reached
      const bottomPrice = lowestPrice || currentPrice;
      const actualMove = idea.entryPrice - bottomPrice;
      const targetMove = idea.entryPrice - idea.targetPrice;
      const progressPercent = (actualMove / targetMove) * 100;
      // Clamp at 0 minimum (negative means moved wrong direction)
      return Math.max(0, progressPercent);
    }
  }
  
  /**
   * LEGACY: Check if prediction was accurate (50% threshold)
   * Kept for backward compatibility
   */
  private static checkPredictionAccuracy(
    idea: TradeIdea,
    currentPrice: number,
    highestPrice?: number,
    lowestPrice?: number
  ): boolean {
    const accuracyPercent = this.calculatePredictionAccuracyPercent(
      idea,
      currentPrice,
      highestPrice,
      lowestPrice
    );
    return accuracyPercent >= 50;
  }

  /**
   * Batch validate multiple trade ideas
   * Note: Validates ALL ideas, even without prices (for expiry checks)
   * @param contractsMap Optional map of futures contracts by contract code (avoids circular dependency)
   */
  static validateBatch(
    ideas: TradeIdea[],
    priceMap: Map<string, number>,
    contractsMap?: Map<string, FuturesContract>
  ): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const idea of ideas) {
      // Get price - for options, look up by idea ID since premiums are stored that way
      let currentPrice: number | undefined;
      if (idea.assetType === 'option') {
        currentPrice = priceMap.get(`option_${idea.id}`);
      } else {
        currentPrice = priceMap.get(idea.symbol);
      }
      
      // Get futures contract if applicable
      const futuresContract = idea.futuresContractCode && contractsMap 
        ? contractsMap.get(idea.futuresContractCode)
        : undefined;
      
      const result = this.validateTradeIdea(idea, currentPrice, futuresContract);
      if (result.shouldUpdate) {
        results.set(idea.id, result);
      }
    }

    return results;
  }
}
