// Technical Indicators for Trading Analysis

/**
 * Calculate RSI (Relative Strength Index)
 * RSI measures momentum on a scale of 0-100
 * - Above 70: Overbought (potential sell signal)
 * - Below 30: Oversold (potential buy signal)
 * 
 * @param prices - Array of closing prices (most recent last)
 * @param period - Period for RSI calculation (default: 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) {
    return 50; // Neutral if not enough data
  }

  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // Calculate initial average gain/loss
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Calculate smoothed averages (Wilder's smoothing)
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  // Calculate RSI
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Number(rsi.toFixed(2));
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * MACD shows trend direction and momentum
 * - Positive MACD: Bullish signal
 * - Negative MACD: Bearish signal
 * - MACD crossing above signal line: Buy signal
 * - MACD crossing below signal line: Sell signal
 * 
 * @param prices - Array of closing prices (most recent last)
 * @param fastPeriod - Fast EMA period (default: 12)
 * @param slowPeriod - Slow EMA period (default: 26)
 * @param signalPeriod - Signal line EMA period (default: 9)
 * @returns MACD values {macd, signal, histogram}
 */
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } {
  if (prices.length < slowPeriod + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0 }; // Not enough data
  }

  // Calculate EMA (Exponential Moving Average)
  const calculateEMA = (data: number[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);
    
    // Start with SMA for first value
    const sma = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    ema.push(sma);

    // Calculate EMA for remaining values
    for (let i = period; i < data.length; i++) {
      const value = (data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
      ema.push(value);
    }

    return ema;
  };

  // Calculate fast and slow EMAs
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  // Calculate MACD line
  const macdLine: number[] = [];
  const offset = slowPeriod - fastPeriod;
  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push(fastEMA[i + offset] - slowEMA[i]);
  }

  // Calculate signal line (EMA of MACD)
  const signalLine = calculateEMA(macdLine, signalPeriod);

  // Get most recent values
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  const histogram = macd - signal;

  return {
    macd: Number(macd.toFixed(4)),
    signal: Number(signal.toFixed(4)),
    histogram: Number(histogram.toFixed(4))
  };
}

/**
 * Calculate Simple Moving Average
 * @param prices - Array of closing prices
 * @param period - Period for SMA
 * @returns SMA value
 */
export function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) {
    return prices[prices.length - 1] || 0;
  }

  const slice = prices.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return Number((sum / period).toFixed(2));
}

/**
 * Analyze RSI signal strength
 * @param rsi - RSI value (0-100)
 * @returns Signal interpretation
 */
export function analyzeRSI(rsi: number): {
  signal: 'strong_oversold' | 'oversold' | 'neutral' | 'overbought' | 'strong_overbought';
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'long' | 'short' | 'neutral';
} {
  if (rsi <= 20) {
    return { signal: 'strong_oversold', strength: 'strong', direction: 'long' };
  } else if (rsi <= 30) {
    return { signal: 'oversold', strength: 'moderate', direction: 'long' };
  } else if (rsi >= 80) {
    return { signal: 'strong_overbought', strength: 'strong', direction: 'short' };
  } else if (rsi >= 70) {
    return { signal: 'overbought', strength: 'moderate', direction: 'short' };
  } else {
    return { signal: 'neutral', strength: 'weak', direction: 'neutral' };
  }
}

/**
 * Analyze MACD signal strength
 * @param macd - MACD values
 * @returns Signal interpretation
 */
export function analyzeMACD(macd: { macd: number; signal: number; histogram: number }): {
  signal: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'long' | 'short' | 'neutral';
  crossover: boolean; // True if potential crossover
} {
  const { macd: macdValue, signal: signalValue, histogram } = macd;
  const isBullish = macdValue > signalValue;
  const histogramAbs = Math.abs(histogram);
  
  // Strong divergence
  if (histogramAbs > 0.5) {
    if (isBullish) {
      return { signal: 'strong_bullish', strength: 'strong', direction: 'long', crossover: false };
    } else {
      return { signal: 'strong_bearish', strength: 'strong', direction: 'short', crossover: false };
    }
  }
  
  // Moderate divergence
  if (histogramAbs > 0.1) {
    if (isBullish) {
      return { signal: 'bullish', strength: 'moderate', direction: 'long', crossover: false };
    } else {
      return { signal: 'bearish', strength: 'moderate', direction: 'short', crossover: false };
    }
  }
  
  // Near crossover
  if (histogramAbs < 0.05) {
    return { 
      signal: 'neutral', 
      strength: 'weak', 
      direction: 'neutral', 
      crossover: true // Potential crossover imminent
    };
  }
  
  return { signal: 'neutral', strength: 'weak', direction: 'neutral', crossover: false };
}

/**
 * Calculate Bollinger Bands
 * @param prices - Array of closing prices
 * @param period - Period for calculation (default: 20)
 * @param stdDev - Number of standard deviations (default: 2)
 * @returns Bollinger Band values
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number; middle: number; lower: number } {
  if (prices.length < period) {
    const current = prices[prices.length - 1] || 0;
    return { upper: current, middle: current, lower: current };
  }

  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  
  // Calculate standard deviation
  const variance = slice.reduce((sum, price) => sum + Math.pow(price - middle, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  const upper = middle + (stdDev * standardDeviation);
  const lower = middle - (stdDev * standardDeviation);
  
  return {
    upper: Number(upper.toFixed(2)),
    middle: Number(middle.toFixed(2)),
    lower: Number(lower.toFixed(2))
  };
}

/**
 * Calculate VWAP (Volume-Weighted Average Price)
 * VWAP is the average price weighted by volume - used by institutional traders
 * @param prices - Array of closing prices (most recent last)
 * @param volumes - Array of volumes (same length as prices)
 * @returns VWAP value
 */
export function calculateVWAP(prices: number[], volumes: number[]): number {
  if (prices.length === 0 || volumes.length === 0 || prices.length !== volumes.length) {
    return prices[prices.length - 1] || 0;
  }

  let totalPV = 0;
  let totalVolume = 0;

  for (let i = 0; i < prices.length; i++) {
    totalPV += prices[i] * volumes[i];
    totalVolume += volumes[i];
  }

  if (totalVolume === 0) {
    return prices[prices.length - 1] || 0;
  }

  return Number((totalPV / totalVolume).toFixed(2));
}

/**
 * Analyze RSI(2) mean reversion signal (Proven 75-91% win rate)
 * Based on Larry Connors' research: RSI(2) < 10 with 200-day MA trend filter
 * @param rsi2 - RSI value with 2-period
 * @param currentPrice - Current price
 * @param sma200 - 200-day simple moving average
 * @returns Mean reversion signal
 */
export function analyzeRSI2MeanReversion(
  rsi2: number,
  currentPrice: number,
  sma200: number
): {
  signal: 'strong_buy' | 'buy' | 'none';
  strength: 'strong' | 'moderate' | 'weak';
} {
  // CRITICAL: Only trade WITH the trend (price above 200 MA for longs)
  const aboveTrend = currentPrice > sma200;

  // RSI(2) < 5 = Strong oversold (Connors' extreme threshold)
  if (rsi2 < 5 && aboveTrend) {
    return { signal: 'strong_buy', strength: 'strong' };
  }

  // RSI(2) < 10 = Standard oversold (75-91% win rate threshold)
  if (rsi2 < 10 && aboveTrend) {
    return { signal: 'buy', strength: 'moderate' };
  }

  return { signal: 'none', strength: 'weak' };
}
