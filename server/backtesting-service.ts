/**
 * Backtesting Service - RBI Framework Implementation
 * Research → Backtest → Implement
 * 
 * Tests trading strategies on historical data before live implementation
 */

import { fetchOHLCData, OHLCData } from './chart-analysis';

interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface BacktestConfig {
  symbol: string;
  strategy: 'breakout' | 'mean_reversion' | 'momentum' | 'custom';
  startDate?: string;
  endDate?: string;
  initialCapital: number;
  positionSizePercent: number;  // % of capital per trade
  stopLossPercent: number;
  takeProfitPercent: number;
  // Strategy-specific params
  lookbackPeriod?: number;      // For breakout: days to look back for resistance
  rsiPeriod?: number;           // For mean reversion
  rsiOversold?: number;
  rsiOverbought?: number;
}

interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  direction: 'long' | 'short';
  positionSize: number;
  pnl: number;
  pnlPercent: number;
  exitReason: 'take_profit' | 'stop_loss' | 'signal_exit' | 'end_of_data';
}

interface BacktestResult {
  config: BacktestConfig;
  trades: Trade[];
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    totalPnLPercent: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    sharpeRatio: number;
    profitFactor: number;
    averageWin: number;
    averageLoss: number;
    largestWin: number;
    largestLoss: number;
    averageHoldingPeriod: number;
    finalCapital: number;
  };
  equityCurve: { date: string; equity: number }[];
  timestamp: string;
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  for (let i = 0; i < period; i++) {
    rsi.push(50); // Not enough data
  }
  
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

// Get highest high over lookback period
function getResistance(bars: OHLCBar[], index: number, lookback: number): number {
  const start = Math.max(0, index - lookback);
  let highest = 0;
  for (let i = start; i < index; i++) {
    if (bars[i].high > highest) {
      highest = bars[i].high;
    }
  }
  return highest;
}

// Get lowest low over lookback period
function getSupport(bars: OHLCBar[], index: number, lookback: number): number {
  const start = Math.max(0, index - lookback);
  let lowest = Infinity;
  for (let i = start; i < index; i++) {
    if (bars[i].low < lowest) {
      lowest = bars[i].low;
    }
  }
  return lowest;
}

// Breakout Strategy: Buy when price breaks above 20-day high
function runBreakoutStrategy(
  bars: OHLCBar[],
  config: BacktestConfig
): Trade[] {
  const trades: Trade[] = [];
  const lookback = config.lookbackPeriod || 20;
  let inPosition = false;
  let entryPrice = 0;
  let entryDate = '';
  let positionSize = 0;
  let stopLoss = 0;
  let takeProfit = 0;
  let capital = config.initialCapital;
  
  for (let i = lookback; i < bars.length; i++) {
    const bar = bars[i];
    const resistance = getResistance(bars, i, lookback);
    
    if (!inPosition) {
      // Entry: Price closes above resistance (breakout)
      if (bar.close > resistance && resistance > 0) {
        inPosition = true;
        entryPrice = bar.close;
        entryDate = bar.date;
        positionSize = (capital * config.positionSizePercent / 100) / entryPrice;
        stopLoss = entryPrice * (1 - config.stopLossPercent / 100);
        takeProfit = entryPrice * (1 + config.takeProfitPercent / 100);
      }
    } else {
      // Check exit conditions
      let exitReason: Trade['exitReason'] | null = null;
      let exitPrice = 0;
      
      // Check stop loss (use low of candle)
      if (bar.low <= stopLoss) {
        exitReason = 'stop_loss';
        exitPrice = stopLoss;
      }
      // Check take profit (use high of candle)
      else if (bar.high >= takeProfit) {
        exitReason = 'take_profit';
        exitPrice = takeProfit;
      }
      // End of data
      else if (i === bars.length - 1) {
        exitReason = 'end_of_data';
        exitPrice = bar.close;
      }
      
      if (exitReason) {
        const pnl = (exitPrice - entryPrice) * positionSize;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        
        trades.push({
          entryDate,
          entryPrice,
          exitDate: bar.date,
          exitPrice,
          direction: 'long',
          positionSize,
          pnl,
          pnlPercent,
          exitReason
        });
        
        capital += pnl;
        inPosition = false;
      }
    }
  }
  
  return trades;
}

// Mean Reversion Strategy: Buy when RSI oversold, sell when overbought
function runMeanReversionStrategy(
  bars: OHLCBar[],
  config: BacktestConfig
): Trade[] {
  const trades: Trade[] = [];
  const rsiPeriod = config.rsiPeriod || 2;
  const oversold = config.rsiOversold || 10;
  const overbought = config.rsiOverbought || 90;
  
  const closes = bars.map(b => b.close);
  const rsiValues = calculateRSI(closes, rsiPeriod);
  
  let inPosition = false;
  let entryPrice = 0;
  let entryDate = '';
  let positionSize = 0;
  let stopLoss = 0;
  let capital = config.initialCapital;
  
  for (let i = rsiPeriod + 1; i < bars.length; i++) {
    const bar = bars[i];
    const rsi = rsiValues[i];
    const prevRsi = rsiValues[i - 1];
    
    if (!inPosition) {
      // Entry: RSI crosses above oversold
      if (prevRsi <= oversold && rsi > oversold) {
        inPosition = true;
        entryPrice = bar.close;
        entryDate = bar.date;
        positionSize = (capital * config.positionSizePercent / 100) / entryPrice;
        stopLoss = entryPrice * (1 - config.stopLossPercent / 100);
      }
    } else {
      let exitReason: Trade['exitReason'] | null = null;
      let exitPrice = 0;
      
      // Exit on RSI overbought
      if (rsi >= overbought) {
        exitReason = 'signal_exit';
        exitPrice = bar.close;
      }
      // Stop loss
      else if (bar.low <= stopLoss) {
        exitReason = 'stop_loss';
        exitPrice = stopLoss;
      }
      // End of data
      else if (i === bars.length - 1) {
        exitReason = 'end_of_data';
        exitPrice = bar.close;
      }
      
      if (exitReason) {
        const pnl = (exitPrice - entryPrice) * positionSize;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        
        trades.push({
          entryDate,
          entryPrice,
          exitDate: bar.date,
          exitPrice,
          direction: 'long',
          positionSize,
          pnl,
          pnlPercent,
          exitReason
        });
        
        capital += pnl;
        inPosition = false;
      }
    }
  }
  
  return trades;
}

// Momentum Strategy: Buy on strong upward momentum
function runMomentumStrategy(
  bars: OHLCBar[],
  config: BacktestConfig
): Trade[] {
  const trades: Trade[] = [];
  const lookback = config.lookbackPeriod || 10;
  
  let inPosition = false;
  let entryPrice = 0;
  let entryDate = '';
  let positionSize = 0;
  let stopLoss = 0;
  let takeProfit = 0;
  let capital = config.initialCapital;
  
  for (let i = lookback; i < bars.length; i++) {
    const bar = bars[i];
    const pastBar = bars[i - lookback];
    const momentum = ((bar.close - pastBar.close) / pastBar.close) * 100;
    
    if (!inPosition) {
      // Entry: Strong positive momentum (>5%)
      if (momentum > 5) {
        inPosition = true;
        entryPrice = bar.close;
        entryDate = bar.date;
        positionSize = (capital * config.positionSizePercent / 100) / entryPrice;
        stopLoss = entryPrice * (1 - config.stopLossPercent / 100);
        takeProfit = entryPrice * (1 + config.takeProfitPercent / 100);
      }
    } else {
      let exitReason: Trade['exitReason'] | null = null;
      let exitPrice = 0;
      
      // Momentum reversal exit
      if (momentum < -3) {
        exitReason = 'signal_exit';
        exitPrice = bar.close;
      }
      // Stop loss
      else if (bar.low <= stopLoss) {
        exitReason = 'stop_loss';
        exitPrice = stopLoss;
      }
      // Take profit
      else if (bar.high >= takeProfit) {
        exitReason = 'take_profit';
        exitPrice = takeProfit;
      }
      // End of data
      else if (i === bars.length - 1) {
        exitReason = 'end_of_data';
        exitPrice = bar.close;
      }
      
      if (exitReason) {
        const pnl = (exitPrice - entryPrice) * positionSize;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        
        trades.push({
          entryDate,
          entryPrice,
          exitDate: bar.date,
          exitPrice,
          direction: 'long',
          positionSize,
          pnl,
          pnlPercent,
          exitReason
        });
        
        capital += pnl;
        inPosition = false;
      }
    }
  }
  
  return trades;
}

// Calculate backtest metrics
function calculateMetrics(
  trades: Trade[],
  initialCapital: number
): BacktestResult['summary'] {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      profitFactor: 0,
      averageWin: 0,
      averageLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      averageHoldingPeriod: 0,
      finalCapital: initialCapital
    };
  }
  
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  
  // Calculate drawdown
  let peak = initialCapital;
  let maxDrawdown = 0;
  let equity = initialCapital;
  
  for (const trade of trades) {
    equity += trade.pnl;
    if (equity > peak) peak = equity;
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  // Calculate Sharpe Ratio (simplified, annualized)
  const returns = trades.map(t => t.pnlPercent);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  // Calculate average holding period in days
  const holdingPeriods = trades.map(t => {
    const entry = new Date(t.entryDate);
    const exit = new Date(t.exitDate);
    return (exit.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24);
  });
  const avgHoldingPeriod = holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length;
  
  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: (winningTrades.length / trades.length) * 100,
    totalPnL,
    totalPnLPercent: (totalPnL / initialCapital) * 100,
    maxDrawdown,
    maxDrawdownPercent: (maxDrawdown / peak) * 100,
    sharpeRatio,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    averageWin: winningTrades.length > 0 ? grossProfit / winningTrades.length : 0,
    averageLoss: losingTrades.length > 0 ? grossLoss / losingTrades.length : 0,
    largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0,
    largestLoss: losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0,
    averageHoldingPeriod: avgHoldingPeriod,
    finalCapital: initialCapital + totalPnL
  };
}

// Build equity curve
function buildEquityCurve(
  trades: Trade[],
  initialCapital: number
): { date: string; equity: number }[] {
  const curve: { date: string; equity: number }[] = [];
  let equity = initialCapital;
  
  for (const trade of trades) {
    equity += trade.pnl;
    curve.push({ date: trade.exitDate, equity });
  }
  
  return curve;
}

// Main backtest function
export async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  console.log(`[Backtest] Running ${config.strategy} strategy on ${config.symbol}`);
  
  // Fetch historical data
  const ohlcResult = await fetchOHLCData(config.symbol, '1d', 365);
  
  if (!ohlcResult || !ohlcResult.closes || ohlcResult.closes.length === 0) {
    throw new Error(`Failed to fetch historical data for ${config.symbol}`);
  }
  
  // Convert OHLCData arrays to OHLCBar objects
  const bars: OHLCBar[] = ohlcResult.dates.map((date, i) => ({
    date,
    open: ohlcResult.opens[i],
    high: ohlcResult.highs[i],
    low: ohlcResult.lows[i],
    close: ohlcResult.closes[i],
    volume: 0 // Volume not available in OHLCData
  }));
  
  // Run strategy
  let trades: Trade[];
  
  switch (config.strategy) {
    case 'breakout':
      trades = runBreakoutStrategy(bars, config);
      break;
    case 'mean_reversion':
      trades = runMeanReversionStrategy(bars, config);
      break;
    case 'momentum':
      trades = runMomentumStrategy(bars, config);
      break;
    default:
      trades = runBreakoutStrategy(bars, config);
  }
  
  const summary = calculateMetrics(trades, config.initialCapital);
  const equityCurve = buildEquityCurve(trades, config.initialCapital);
  
  console.log(`[Backtest] Completed: ${trades.length} trades, ${summary.winRate.toFixed(1)}% win rate, $${summary.totalPnL.toFixed(2)} P&L`);
  
  return {
    config,
    trades,
    summary,
    equityCurve,
    timestamp: new Date().toISOString()
  };
}

// Parameter optimization
export interface OptimizationConfig {
  symbol: string;
  strategy: BacktestConfig['strategy'];
  initialCapital: number;
  positionSizePercent: number;
  // Parameter ranges to test
  stopLossRange: { min: number; max: number; step: number };
  takeProfitRange: { min: number; max: number; step: number };
  lookbackRange?: { min: number; max: number; step: number };
}

export interface OptimizationResult {
  bestConfig: BacktestConfig;
  bestSummary: BacktestResult['summary'];
  allResults: {
    stopLoss: number;
    takeProfit: number;
    lookback?: number;
    winRate: number;
    totalPnL: number;
    sharpeRatio: number;
    profitFactor: number;
  }[];
  optimizationMetric: string;
  timestamp: string;
}

export async function optimizeParameters(config: OptimizationConfig): Promise<OptimizationResult> {
  console.log(`[Optimization] Starting parameter optimization for ${config.symbol} - ${config.strategy}`);
  
  const results: OptimizationResult['allResults'] = [];
  let bestResult: { config: BacktestConfig; summary: BacktestResult['summary'] } | null = null;
  let bestScore = -Infinity;
  
  // Generate parameter combinations
  const stopLosses: number[] = [];
  for (let sl = config.stopLossRange.min; sl <= config.stopLossRange.max; sl += config.stopLossRange.step) {
    stopLosses.push(sl);
  }
  
  const takeProfits: number[] = [];
  for (let tp = config.takeProfitRange.min; tp <= config.takeProfitRange.max; tp += config.takeProfitRange.step) {
    takeProfits.push(tp);
  }
  
  const lookbacks: number[] = config.lookbackRange 
    ? Array.from({ length: Math.floor((config.lookbackRange.max - config.lookbackRange.min) / config.lookbackRange.step) + 1 }, 
        (_, i) => config.lookbackRange!.min + i * config.lookbackRange!.step)
    : [20]; // Default lookback
  
  const totalCombinations = stopLosses.length * takeProfits.length * lookbacks.length;
  console.log(`[Optimization] Testing ${totalCombinations} parameter combinations`);
  
  let tested = 0;
  
  for (const stopLoss of stopLosses) {
    for (const takeProfit of takeProfits) {
      for (const lookback of lookbacks) {
        const backtestConfig: BacktestConfig = {
          symbol: config.symbol,
          strategy: config.strategy,
          initialCapital: config.initialCapital,
          positionSizePercent: config.positionSizePercent,
          stopLossPercent: stopLoss,
          takeProfitPercent: takeProfit,
          lookbackPeriod: lookback
        };
        
        try {
          const result = await runBacktest(backtestConfig);
          
          results.push({
            stopLoss,
            takeProfit,
            lookback: config.lookbackRange ? lookback : undefined,
            winRate: result.summary.winRate,
            totalPnL: result.summary.totalPnL,
            sharpeRatio: result.summary.sharpeRatio,
            profitFactor: result.summary.profitFactor
          });
          
          // Score: Prioritize profit factor and win rate
          const score = result.summary.profitFactor * 0.4 + 
                       result.summary.winRate * 0.3 + 
                       result.summary.sharpeRatio * 0.3;
          
          if (score > bestScore && result.summary.totalTrades >= 5) {
            bestScore = score;
            bestResult = { config: backtestConfig, summary: result.summary };
          }
        } catch (error) {
          console.error(`[Optimization] Error testing SL=${stopLoss}, TP=${takeProfit}: ${error}`);
        }
        
        tested++;
        if (tested % 10 === 0) {
          console.log(`[Optimization] Progress: ${tested}/${totalCombinations}`);
        }
      }
    }
  }
  
  if (!bestResult) {
    throw new Error('No valid optimization results found');
  }
  
  console.log(`[Optimization] Best result: SL=${bestResult.config.stopLossPercent}%, TP=${bestResult.config.takeProfitPercent}%, WinRate=${bestResult.summary.winRate.toFixed(1)}%`);
  
  return {
    bestConfig: bestResult.config,
    bestSummary: bestResult.summary,
    allResults: results.sort((a, b) => b.profitFactor - a.profitFactor),
    optimizationMetric: 'profit_factor + win_rate + sharpe_ratio',
    timestamp: new Date().toISOString()
  };
}
