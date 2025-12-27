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
 * Analyze RSI(2) mean reversion signal (targeting 55-65% live win rate)
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

  // RSI(2) < 10 = Standard oversold (targeting 55-65% live)
  if (rsi2 < 10 && aboveTrend) {
    return { signal: 'buy', strength: 'moderate' };
  }

  return { signal: 'none', strength: 'weak' };
}

/**
 * Calculate ATR (Average True Range) - volatility indicator
 * Higher ATR = higher volatility
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param period - Period for ATR (default: 14)
 * @returns ATR value
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return 0;
  }

  const trueRanges: number[] = [];

  // Calculate True Range for each period
  for (let i = 1; i < highs.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Calculate initial ATR (SMA of first 'period' true ranges)
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Smooth ATR using Wilder's method
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return Number(atr.toFixed(2));
}

/**
 * Calculate ADX (Average Directional Index) - trend strength indicator
 * ADX measures trend strength (NOT direction)
 * - ADX < 20: Weak trend (ranging/choppy) - GOOD for mean reversion
 * - ADX 20-25: Developing trend
 * - ADX > 25: Strong trend - BAD for mean reversion, GOOD for momentum
 * 
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param period - Period for ADX (default: 14)
 * @returns ADX value (0-100)
 */
export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return 50; // Neutral if not enough data
  }

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trueRanges: number[] = [];

  // Calculate directional movement and true range
  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff = lows[i - 1] - lows[i];

    // +DM and -DM
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

    // True Range
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Wilder smoothing for +DM, -DM, and TR
  let smoothedPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);

  // Calculate DX values for ADX smoothing
  const dxValues: number[] = [];

  for (let i = period; i < plusDM.length; i++) {
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
    smoothedTR = smoothedTR - (smoothedTR / period) + trueRanges[i];

    // Calculate +DI and -DI at this point
    const plusDI = smoothedTR !== 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR !== 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;

    // Calculate DX
    const diSum = plusDI + minusDI;
    const dx = diSum !== 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
    dxValues.push(dx);
  }

  // ADX is the Wilder-smoothed average of DX values
  if (dxValues.length < period) {
    // Not enough DX values for proper ADX smoothing, return simple average
    const avgDx = dxValues.length > 0 
      ? dxValues.reduce((a, b) => a + b, 0) / dxValues.length 
      : 50;
    return Number(avgDx.toFixed(2));
  }

  // Initial ADX is SMA of first 'period' DX values
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Apply Wilder smoothing to subsequent DX values
  for (let i = period; i < dxValues.length; i++) {
    adx = ((adx * (period - 1)) + dxValues[i]) / period;
  }

  return Number(adx.toFixed(2));
}

/**
 * Determine market regime based on ADX
 * @param adx - ADX value
 * @returns Market regime classification
 */
export function determineMarketRegime(adx: number): {
  regime: 'ranging' | 'developing' | 'trending';
  suitableFor: 'mean_reversion' | 'mixed' | 'momentum';
  confidence: 'high' | 'medium' | 'low';
} {
  if (adx < 20) {
    return {
      regime: 'ranging',
      suitableFor: 'mean_reversion',
      confidence: 'high'
    };
  } else if (adx < 25) {
    return {
      regime: 'developing',
      suitableFor: 'mixed',
      confidence: 'medium'
    };
  } else {
    return {
      regime: 'trending',
      suitableFor: 'momentum',
      confidence: adx > 40 ? 'high' : 'medium'
    };
  }
}
