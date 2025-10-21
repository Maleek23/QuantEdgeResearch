import { TradeIdea } from "@shared/schema";

interface BacktestMetrics {
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  expectancy: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  largestWin: number;
  largestLoss: number;
  avgHoldingTimeMinutes: number;
  totalReturn: number;
  returnPerDay: number;
}

interface SignalPerformance {
  signalName: string;
  trades: number;
  winRate: number;
  avgReturn: number;
  sharpe: number;
  contribution: number; // % of total return
}

export class BacktestingEngine {
  /**
   * Calculate comprehensive backtest metrics from historical trades
   * Uses actual closed trade data (hit_target, hit_stop, expired)
   */
  static calculateMetrics(trades: TradeIdea[]): BacktestMetrics {
    // Filter only closed trades
    const closedTrades = trades.filter(t => 
      t.outcomeStatus !== 'open' && t.percentGain !== null && t.percentGain !== undefined
    );

    if (closedTrades.length === 0) {
      return this.emptyMetrics();
    }

    const totalTrades = closedTrades.length;
    const winners = closedTrades.filter(t => (t.percentGain ?? 0) > 0);
    const losers = closedTrades.filter(t => (t.percentGain ?? 0) <= 0);
    
    const winRate = (winners.length / totalTrades) * 100;
    
    // Average win/loss
    const avgWin = winners.length > 0
      ? winners.reduce((sum, t) => sum + (t.percentGain ?? 0), 0) / winners.length
      : 0;
    const avgLoss = losers.length > 0
      ? Math.abs(losers.reduce((sum, t) => sum + (t.percentGain ?? 0), 0) / losers.length)
      : 0;

    // Profit factor: gross profit / gross loss
    const grossProfit = winners.reduce((sum, t) => sum + (t.percentGain ?? 0), 0);
    const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.percentGain ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    // Expectancy: (Win% × AvgWin) - (Loss% × AvgLoss)
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

    // Returns array for risk metrics
    const returns = closedTrades.map(t => t.percentGain ?? 0);
    
    // Sharpe Ratio (assuming risk-free rate = 0 for simplicity)
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    // Sortino Ratio (only downside deviation)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideVariance = downsideReturns.length > 0
      ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
      : 0;
    const downsideStdDev = Math.sqrt(downsideVariance);
    const sortinoRatio = downsideStdDev > 0 ? avgReturn / downsideStdDev : 0;

    // Max Drawdown (cumulative worst decline from peak)
    const { maxDrawdown, maxDrawdownPercent } = this.calculateMaxDrawdown(returns);

    // Consecutive streaks
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    
    closedTrades.forEach(t => {
      const isWin = (t.percentGain ?? 0) > 0;
      if (isWin) {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        maxWinStreak = Math.max(maxWinStreak, currentStreak);
      } else {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        maxLossStreak = Math.max(maxLossStreak, Math.abs(currentStreak));
      }
    });

    // Largest win/loss
    const largestWin = Math.max(...returns);
    const largestLoss = Math.min(...returns);

    // Average holding time (safeguard against division by zero)
    const tradesWithHoldingTime = closedTrades.filter(t => t.actualHoldingTimeMinutes);
    const avgHoldingTimeMinutes = tradesWithHoldingTime.length > 0
      ? tradesWithHoldingTime.reduce((sum, t) => sum + (t.actualHoldingTimeMinutes ?? 0), 0) / tradesWithHoldingTime.length
      : 0;

    // Total return (compounded)
    const totalReturn = returns.reduce((product, r) => product * (1 + r / 100), 1) - 1;
    
    // Return per day (safeguard against division by zero)
    const avgHoldingDays = avgHoldingTimeMinutes / (24 * 60);
    const returnPerDay = avgHoldingDays > 0 ? totalReturn / avgHoldingDays : 0;

    return {
      totalTrades,
      winners: winners.length,
      losers: losers.length,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownPercent,
      expectancy,
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak,
      largestWin,
      largestLoss,
      avgHoldingTimeMinutes,
      totalReturn: totalReturn * 100, // Convert to percentage
      returnPerDay: returnPerDay * 100,
    };
  }

  /**
   * Calculate maximum drawdown from returns array
   */
  private static calculateMaxDrawdown(returns: number[]): { maxDrawdown: number; maxDrawdownPercent: number } {
    let peak = 100; // Start with $100
    let maxDrawdown = 0;
    let currentValue = 100;

    returns.forEach(r => {
      currentValue = currentValue * (1 + r / 100);
      peak = Math.max(peak, currentValue);
      const drawdown = peak - currentValue;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });

    const maxDrawdownPercent = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

    return { maxDrawdown, maxDrawdownPercent };
  }

  /**
   * Analyze performance by signal type
   */
  static analyzeSignalPerformance(trades: TradeIdea[]): SignalPerformance[] {
    // Filter closed trades with quality signals
    const tradesWithSignals = trades.filter(t => 
      t.outcomeStatus !== 'open' && 
      t.qualitySignals && 
      t.qualitySignals.length > 0 &&
      t.percentGain !== null &&
      t.percentGain !== undefined
    );

    if (tradesWithSignals.length === 0) {
      return [];
    }

    // Group by signal
    const signalMap = new Map<string, TradeIdea[]>();
    
    tradesWithSignals.forEach(trade => {
      trade.qualitySignals?.forEach(signal => {
        if (!signalMap.has(signal)) {
          signalMap.set(signal, []);
        }
        signalMap.get(signal)!.push(trade);
      });
    });

    // Calculate metrics per signal
    const totalReturn = tradesWithSignals.reduce((sum, t) => sum + (t.percentGain ?? 0), 0);

    return Array.from(signalMap.entries()).map(([signalName, signalTrades]) => {
      const winners = signalTrades.filter(t => (t.percentGain ?? 0) > 0).length;
      const winRate = (winners / signalTrades.length) * 100;
      const avgReturn = signalTrades.reduce((sum, t) => sum + (t.percentGain ?? 0), 0) / signalTrades.length;
      
      // Sharpe for this signal
      const returns = signalTrades.map(t => t.percentGain ?? 0);
      const mean = avgReturn;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      const sharpe = stdDev > 0 ? mean / stdDev : 0;

      // Contribution to total return
      const signalReturn = signalTrades.reduce((sum, t) => sum + (t.percentGain ?? 0), 0);
      const contribution = totalReturn !== 0 ? (signalReturn / totalReturn) * 100 : 0;

      return {
        signalName,
        trades: signalTrades.length,
        winRate,
        avgReturn,
        sharpe,
        contribution,
      };
    }).sort((a, b) => b.contribution - a.contribution); // Sort by contribution
  }

  /**
   * Empty metrics template
   */
  private static emptyMetrics(): BacktestMetrics {
    return {
      totalTrades: 0,
      winners: 0,
      losers: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      expectancy: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      largestWin: 0,
      largestLoss: 0,
      avgHoldingTimeMinutes: 0,
      totalReturn: 0,
      returnPerDay: 0,
    };
  }

  /**
   * Calculate confidence score calibration
   * Returns: { predictedProbability, actualWinRate } pairs
   */
  static calculateCalibration(trades: TradeIdea[]): Array<{ bucket: string; predicted: number; actual: number; count: number }> {
    const closedTrades = trades.filter(t => 
      t.outcomeStatus !== 'open' && 
      t.confidenceScore !== null &&
      t.percentGain !== null
    );

    if (closedTrades.length === 0) {
      return [];
    }

    // Group by confidence score buckets
    const buckets = [
      { min: 95, max: 100, label: '95-100%' },
      { min: 90, max: 95, label: '90-95%' },
      { min: 85, max: 90, label: '85-90%' },
      { min: 80, max: 85, label: '80-85%' },
      { min: 75, max: 80, label: '75-80%' },
      { min: 70, max: 75, label: '70-75%' },
      { min: 0, max: 70, label: '<70%' },
    ];

    return buckets.map(bucket => {
      const tradesInBucket = closedTrades.filter(t => 
        (t.confidenceScore ?? 0) >= bucket.min && (t.confidenceScore ?? 0) < bucket.max
      );

      if (tradesInBucket.length === 0) {
        return {
          bucket: bucket.label,
          predicted: (bucket.min + bucket.max) / 2,
          actual: 0,
          count: 0,
        };
      }

      const winners = tradesInBucket.filter(t => (t.percentGain ?? 0) > 0).length;
      const actualWinRate = (winners / tradesInBucket.length) * 100;

      return {
        bucket: bucket.label,
        predicted: (bucket.min + bucket.max) / 2,
        actual: actualWinRate,
        count: tradesInBucket.length,
      };
    }).filter(b => b.count > 0); // Only return buckets with data
  }
}
