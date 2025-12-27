# QuantEdge Research Platform - Technical Documentation

**Version:** v3.7.0  
**Last Updated:** December 27, 2025  
**Platform:** Quantitative Trading Research for US Equities, Options, Crypto & Futures

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Subscription Tier System](#2-subscription-tier-system)
3. [Quantitative Engine Architecture](#3-quantitative-engine-architecture)
4. [Technical Indicators Library](#4-technical-indicators-library)
5. [Chart Pattern Recognition](#5-chart-pattern-recognition)
6. [Timing Intelligence System](#6-timing-intelligence-system)
7. [Trade Validation Framework](#7-trade-validation-framework)
8. [Performance Validation](#8-performance-validation)
9. [Data Sources & APIs](#9-data-sources--apis)
10. [Database Schema](#10-database-schema)
11. [API Endpoints](#11-api-endpoints)
12. [Engine Changelog](#12-engine-changelog)

---

## 1. Platform Overview

QuantEdge Research is a professional quantitative trading research platform designed for day-trading opportunities in US equities, options, crypto, and CME futures markets.

### Core Features
- AI-powered trade ideas (GPT-5, Claude Sonnet 4, Gemini 2.5)
- Quantitative engine with research-backed strategies
- Chart pattern recognition with support/resistance detection
- Dynamic timing intelligence for entry/exit windows
- Performance tracking with trading cost modeling
- Two-tier subscription model (Free & Advanced)

### Critical Requirements
1. **Chart Pattern Pre-Validation**: All trade ideas must pass chart pattern validation before being suggested
2. **Dynamic Exit Times**: Exit times fluctuate ±10-30% based on volatility/IV/market conditions
3. **Minimum Loss Threshold**: 3% minimum loss threshold to filter noise from tight stops

---

## 1.1 Realistic Performance Expectations

> ⚠️ **IMPORTANT DISCLAIMER**: This platform provides research-grade trade ideas for educational purposes only. Past performance does not guarantee future results.

### Backtest vs Live Trading Reality

| Metric | Backtest (Academic) | Realistic Live |
|--------|---------------------|----------------|
| Win Rate | 75-91% | **55-65%** |
| Slippage | 0% | 0.1-2% per trade |
| Execution | Perfect | Variable |
| Costs | None | $0.50-$3+ per trade |

### Why Backtest Results Don't Transfer

1. **Slippage**: Academic backtests assume perfect execution at the exact price. Live trading has bid-ask spreads and market impact.

2. **Timing**: Backtests use closing prices; you can't trade at the close if you see the signal after market close.

3. **Selection Bias**: Historical patterns that worked may not persist (regime changes, market structure evolution).

4. **Position Sizing**: Backtests often assume fixed position sizes. Real trading requires dynamic sizing based on account equity.

### Trading Cost Impact

```typescript
// Real-world trading costs (modeled in performance calculations)
TRADING_COSTS = {
  slippage: {
    stock: $0.01/share,    // ~0.05% on $20 stock
    option: $0.05/contract, // ~2% on $2.50 option
    crypto: 0.1%,           // Per side
  },
  commission: {
    stock: $0 (most brokers),
    option: $0.65/contract,
    crypto: 0.1% (maker/taker),
  },
  spreadCost: {
    stock: 0.05%,
    option: 2%,  // Options have wide spreads
    crypto: 0.1%,
  }
};

// Example: $5,000 stock trade
// Entry: $0.01 slippage × 250 shares = $2.50
// Exit: $0.01 slippage × 250 shares = $2.50
// Spread: 0.05% × $5,000 = $2.50
// Total costs: ~$7.50 = 0.15% of trade value
```

### Recommended Risk Management

1. **Position Sizing**: Risk 1-2% of account per trade, not fixed dollar amounts
2. **Max Drawdown**: Stop trading if account draws down 10% in a day
3. **Correlation**: Don't take 5 similar tech stock signals simultaneously
4. **Paper Trade First**: Test for 30+ days before risking real capital

---

## 2. Subscription Tier System

### Tier Configuration (`server/tierConfig.ts`)

```typescript
export interface TierLimits {
  ideasPerDay: number;
  aiChatMessagesPerDay: number;
  chartAnalysisPerDay: number;
  watchlistItems: number;
  canAccessPerformance: boolean;
  canAccessAdvancedAnalytics: boolean;
  canAccessRealTimeAlerts: boolean;
  canExportData: boolean;
  prioritySupport: boolean;
}

export const TIER_CONFIG: Record<SubscriptionTier, TierLimits> = {
  free: {
    ideasPerDay: 5,
    aiChatMessagesPerDay: 3,
    chartAnalysisPerDay: 0,
    watchlistItems: 3,
    canAccessPerformance: false,
    canAccessAdvancedAnalytics: false,
    canAccessRealTimeAlerts: false,
    canExportData: false,
    prioritySupport: false,
  },
  advanced: {
    ideasPerDay: Infinity,
    aiChatMessagesPerDay: Infinity,
    chartAnalysisPerDay: Infinity,
    watchlistItems: Infinity,
    canAccessPerformance: true,
    canAccessAdvancedAnalytics: true,
    canAccessRealTimeAlerts: true,
    canExportData: true,
    prioritySupport: true, // Full access for beta launch
  },
  pro: { /* Reserved for future integrations */ },
  admin: { /* Unlimited access */ },
};

export const PRICING = {
  free: { monthly: 0, yearly: 0 },
  advanced: { monthly: 39, yearly: 349 },
  pro: { monthly: 79, yearly: 699 },
} as const;
```

### Tier Comparison Table

| Feature | Free ($0/mo) | Advanced ($39/mo) | Pro (Coming Soon) |
|---------|--------------|-------------------|-------------------|
| Trade Ideas | 5/day | **Unlimited** | Unlimited |
| AI Chat | 3 messages/day | **Unlimited** | Unlimited |
| Chart Analysis | None | **Unlimited** | Unlimited |
| Watchlist Items | 3 | **Unlimited** | Unlimited |
| Market Data | 15min delayed | Real-time | Real-time |
| Performance History | 7 days | Full history | Full history |
| Assets | Stocks & Crypto | All (incl. Options) | All + Futures |
| Discord Alerts | No | Yes | Priority channel |
| Data Export | No | Yes | Yes |
| Priority Support | No | **Yes** | Yes |
| API Access | No | No | Yes (future) |

**Note:** For beta launch, Advanced tier includes nearly all features. Pro tier is reserved for future integrations (API access, futures, white-label reports, etc.).

---

## 3. Quantitative Engine Architecture

### Engine Version & Governance

```typescript
// server/quant-ideas-generator.ts
export const QUANT_ENGINE_VERSION = "v3.6.0";
export const ENGINE_CHANGELOG = {
  "v3.6.0": "CHART ANALYSIS UPGRADE: Pre-validates all trade ideas with chart pattern recognition",
  "v3.5.0": "TRIPLE-FILTER UPGRADE: 50-day MA filter + ADX≤25 + Signal consensus",
  "v3.4.0": "CONFIDENCE RECALIBRATION: Fixed inverted confidence scoring",
  "v3.3.0": "TIME-OF-DAY FIX: Restricted to 9:30-11:30 AM ET ONLY",
  "v3.2.0": "CRITICAL RECALIBRATION: Enabled SHORT trades, widened stops",
  "v3.1.0": "REGIME FILTERING: ADX-based market regime detection",
  "v3.0.0": "COMPLETE REBUILD: Only proven strategies (RSI2 + VWAP + Volume)",
};
```

### Core Strategy: Triple-Filter System

The engine uses a **Triple-Filter System** for maximum win rate:

1. **50-Day MA Filter** - Price must be above 50-day MA for LONG, below for SHORT
2. **200-Day MA Filter** - Long-term trend alignment
3. **ADX ≤25 Filter** - Only trade in ranging markets (mean reversion works best)

### Signal Detection Algorithm

```typescript
// ONLY 3 PROVEN SIGNALS (75-91% backtested win rate):

interface QuantSignal {
  type: 'rsi2_mean_reversion' | 'vwap_cross' | 'volume_spike' | 'rsi2_short_reversion';
  strength: 'strong' | 'moderate' | 'weak';
  direction: 'long' | 'short';
  rsiValue?: number;
  vwapValue?: number;
}

function analyzeMarketData(data: MarketData, historicalPrices: number[]): QuantSignal | null {
  // Require 200+ days of historical data
  if (historicalPrices.length < 200) return null;

  const currentPrice = data.currentPrice;
  const sma200 = calculateSMA(historicalPrices, 200);
  const sma50 = calculateSMA(historicalPrices, 50);
  const rsi2 = calculateRSI(historicalPrices, 2);
  const adx = calculateADX(estimatedHighs, estimatedLows, historicalPrices, 14);
  
  const detectedSignals: string[] = [];
  
  // PRIORITY 1: RSI(2) Mean Reversion LONG
  // Research: 75-91% win rate (Larry Connors, QQQ backtest 1998-2024)
  if (rsi2 < 10 && currentPrice > sma200 && currentPrice > sma50 && adx <= 25) {
    detectedSignals.push('RSI2_MEAN_REVERSION');
    return {
      type: 'rsi2_mean_reversion',
      strength: rsi2 < 5 ? 'strong' : 'moderate',
      direction: 'long',
      rsiValue: rsi2
    };
  }
  
  // PRIORITY 2: RSI(2) Mean Reversion SHORT
  if (rsi2 > 90 && currentPrice < sma200 && currentPrice < sma50 && adx <= 25) {
    detectedSignals.push('RSI2_SHORT_REVERSION');
    return {
      type: 'rsi2_short_reversion',
      strength: rsi2 > 95 ? 'strong' : 'moderate',
      direction: 'short',
      rsiValue: rsi2
    };
  }
  
  // PRIORITY 3: VWAP Institutional Flow (80%+ win rate)
  if (currentPrice > vwap && currentPrice < vwap * 1.02 && volumeRatio >= 1.5) {
    detectedSignals.push('VWAP_CROSS');
    return {
      type: 'vwap_cross',
      strength: volumeRatio >= 2.5 ? 'strong' : 'moderate',
      direction: 'long',
      vwapValue: vwap
    };
  }
  
  // PRIORITY 4: Volume Spike (Early institutional flow)
  if (volumeRatio >= 3 && priceChange >= 0 && priceChange < 1.5 && currentPrice > sma200) {
    detectedSignals.push('VOLUME_SPIKE');
    return {
      type: 'volume_spike',
      strength: volumeRatio >= 5 ? 'strong' : 'moderate',
      direction: 'long'
    };
  }
  
  // Signal confidence voting: require 2+ signals for trade confirmation
  if (detectedSignals.length < 2) return null;
  
  return primarySignal;
}
```

### Optimal Trading Window

```typescript
// Only generate trades during optimal hours (9:30-11:30 AM ET)
// Diagnostic data: Morning = 75-80% WR, Afternoon = 16-46% WR

function isOptimalTradingWindow(): boolean {
  const now = new Date();
  const etTime = formatInTimeZone(now, 'America/New_York', 'HH:mm');
  const [hour, minute] = etTime.split(':').map(Number);
  
  // PRIME WINDOW: 9:30 AM - 11:30 AM ET ONLY
  if (hour === 9 && minute >= 30) return true;  // 9:30-9:59 AM
  if (hour === 10) return true;                  // 10:00-10:59 AM
  if (hour === 11 && minute < 30) return true;   // 11:00-11:29 AM
  
  return false;
}
```

### Risk Management Parameters

| Asset Type | Stop Loss | Target | Min R:R |
|------------|-----------|--------|---------|
| Stocks | 3.5% | 7% | 2:1 |
| Crypto | 5% | 10% | 2:1 |
| Options | ATR-based | 2x risk | 2:1 |
| Futures | 3.5% | 7% | 2:1 |

---

## 4. Technical Indicators Library

### RSI (Relative Strength Index)

```typescript
// server/technical-indicators.ts

/**
 * Calculate RSI - measures momentum on scale 0-100
 * - Above 70: Overbought (sell signal)
 * - Below 30: Oversold (buy signal)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50; // Neutral

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }

  // Wilder's smoothing
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
```

### RSI(2) Mean Reversion Strategy

```typescript
/**
 * RSI(2) Mean Reversion - 75-91% backtested win rate
 * Based on Larry Connors' research
 */
export function analyzeRSI2MeanReversion(
  rsi2: number,
  currentPrice: number,
  sma200: number
): { signal: 'strong_buy' | 'buy' | 'none'; strength: 'strong' | 'moderate' | 'weak' } {
  const aboveTrend = currentPrice > sma200;

  // RSI(2) < 5 = Extreme oversold (Connors' extreme threshold)
  if (rsi2 < 5 && aboveTrend) {
    return { signal: 'strong_buy', strength: 'strong' };
  }

  // RSI(2) < 10 = Standard oversold (75-91% win rate)
  if (rsi2 < 10 && aboveTrend) {
    return { signal: 'buy', strength: 'moderate' };
  }

  return { signal: 'none', strength: 'weak' };
}
```

### VWAP (Volume-Weighted Average Price)

```typescript
/**
 * VWAP - Used by institutional traders (80%+ win rate)
 */
export function calculateVWAP(prices: number[], volumes: number[]): number {
  if (prices.length === 0 || prices.length !== volumes.length) {
    return prices[prices.length - 1] || 0;
  }

  let totalPV = 0;
  let totalVolume = 0;

  for (let i = 0; i < prices.length; i++) {
    totalPV += prices[i] * volumes[i];
    totalVolume += volumes[i];
  }

  return totalVolume > 0 ? totalPV / totalVolume : prices[prices.length - 1];
}
```

### ADX (Average Directional Index)

```typescript
/**
 * ADX - Trend strength indicator (NOT direction)
 * - ADX < 20: Ranging/choppy → GOOD for mean reversion
 * - ADX 20-25: Developing trend
 * - ADX > 25: Strong trend → BAD for mean reversion
 */
export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trueRanges: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff = lows[i - 1] - lows[i];

    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  // Smooth calculations...
  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;
  const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100;

  return dx;
}

export function determineMarketRegime(adx: number) {
  if (adx < 20) {
    return { regime: 'ranging', suitableFor: 'mean_reversion', confidence: 'high' };
  } else if (adx < 25) {
    return { regime: 'developing', suitableFor: 'mixed', confidence: 'medium' };
  } else {
    return { regime: 'trending', suitableFor: 'momentum', confidence: 'high' };
  }
}
```

### ATR (Average True Range)

```typescript
/**
 * ATR - Volatility indicator for stop-loss placement
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  const trueRanges: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }

  // Wilder's smoothing
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}
```

### Bollinger Bands

```typescript
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number; middle: number; lower: number } {
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: middle + (stdDev * standardDeviation),
    middle: middle,
    lower: middle - (stdDev * standardDeviation)
  };
}
```

---

## 5. Chart Pattern Recognition

### Pattern Detection System (`server/chart-analysis.ts`)

The chart analysis system detects **7 major patterns**:

1. Head & Shoulders (bearish)
2. Double Top (bearish)
3. Double Bottom (bullish)
4. Bull Flag (bullish)
5. Ascending Triangle (bullish)
6. Descending Triangle (bearish)
7. Ascending/Descending Channels

### Support & Resistance Detection

```typescript
export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: 'strong' | 'moderate' | 'weak';
  touches: number;
  source: string; // 'swing_high', 'swing_low', 'SMA20', 'SMA50', 'SMA200', 'round_number'
}

export function detectSupportResistance(ohlc: OHLCData, currentPrice: number) {
  // 1. Find swing highs and lows
  const swingHighs = findSwingHighs(ohlc.highs, 5);
  const swingLows = findSwingLows(ohlc.lows, 5);
  
  // 2. Cluster price levels (tolerance: 1.5%)
  const highClusters = clusterPriceLevels(swingHighs, 0.015);
  const lowClusters = clusterPriceLevels(swingLows, 0.015);
  
  // 3. Add moving average levels
  const sma20 = calculateSMA(ohlc.closes, 20);
  const sma50 = calculateSMA(ohlc.closes, 50);
  const sma200 = calculateSMA(ohlc.closes, 200);
  
  // 4. Add round number levels
  const roundNumbers = [
    Math.floor(currentPrice / 100) * 100,
    Math.ceil(currentPrice / 100) * 100,
    Math.floor(currentPrice / 50) * 50,
    // ...
  ];
  
  // 5. Classify as support or resistance based on current price
  return { support, resistance };
}
```

### Swing High/Low Detection

```typescript
function findSwingHighs(highs: number[], period: number = 5): number[] {
  const swingHighs: number[] = [];
  
  for (let i = period; i < highs.length - period; i++) {
    let isSwingHigh = true;
    for (let j = 1; j <= period; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) swingHighs.push(highs[i]);
  }
  
  return swingHighs;
}

function findSwingLows(lows: number[], period: number = 5): number[] {
  const swingLows: number[] = [];
  
  for (let i = period; i < lows.length - period; i++) {
    let isSwingLow = true;
    for (let j = 1; j <= period; j++) {
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) swingLows.push(lows[i]);
  }
  
  return swingLows;
}
```

### Double Top Pattern Detection

```typescript
function detectDoubleTop(highs: number[], closes: number[], currentPrice: number): ChartPattern | null {
  const recentHighs = highs.slice(-30);
  const peaks: { index: number; price: number }[] = [];
  
  // Find peaks (local maxima)
  for (let i = 3; i < recentHighs.length - 3; i++) {
    if (recentHighs[i] > recentHighs[i-1] && recentHighs[i] > recentHighs[i-2] &&
        recentHighs[i] > recentHighs[i+1] && recentHighs[i] > recentHighs[i+2]) {
      peaks.push({ index: i, price: recentHighs[i] });
    }
  }
  
  // Check for double top pattern
  for (let i = 0; i < peaks.length - 1; i++) {
    const peak1 = peaks[i];
    const peak2 = peaks[i + 1];
    
    // Peaks must be 5-20 bars apart
    if (peak2.index - peak1.index >= 5 && peak2.index - peak1.index <= 20) {
      const priceDiff = Math.abs(peak1.price - peak2.price) / peak1.price;
      
      // Peaks must be within 3% of each other
      if (priceDiff < 0.03) {
        const neckline = Math.min(...recentHighs.slice(peak1.index, peak2.index));
        
        if (currentPrice < (peak1.price + peak2.price) / 2 * 0.98) {
          const patternHeight = ((peak1.price + peak2.price) / 2) - neckline;
          const target = neckline - patternHeight;
          
          return {
            name: 'Double Top',
            type: 'bearish',
            confidence: 70 + (1 - priceDiff) * 20,
            description: `Double top at $${avgPeak.toFixed(2)} with neckline at $${neckline.toFixed(2)}`,
            priceTarget: target,
            invalidationLevel: Math.max(peak1.price, peak2.price)
          };
        }
      }
    }
  }
  
  return null;
}
```

### Head & Shoulders Detection

```typescript
function detectHeadAndShoulders(highs: number[], lows: number[], closes: number[], currentPrice: number): ChartPattern | null {
  const peaks = findPeaks(highs.slice(-40));
  
  if (peaks.length >= 3) {
    for (let i = 0; i < peaks.length - 2; i++) {
      const leftShoulder = peaks[i];
      const head = peaks[i + 1];
      const rightShoulder = peaks[i + 2];
      
      // Head must be higher than both shoulders by at least 2%
      if (head.price > leftShoulder.price * 1.02 && head.price > rightShoulder.price * 1.02) {
        // Shoulders must be within 5% of each other
        const shoulderDiff = Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price;
        
        if (shoulderDiff < 0.05) {
          const neckline = calculateNeckline(lows, leftShoulder.index, head.index, rightShoulder.index);
          
          if (currentPrice < neckline * 1.02) {
            const patternHeight = head.price - neckline;
            const target = neckline - patternHeight;
            
            return {
              name: 'Head and Shoulders',
              type: 'bearish',
              confidence: 75 + (1 - shoulderDiff) * 15,
              description: `H&S pattern: Head at $${head.price.toFixed(2)}, neckline at $${neckline.toFixed(2)}`,
              priceTarget: target,
              invalidationLevel: head.price
            };
          }
        }
      }
    }
  }
  
  return null;
}
```

### Chart Validation for Trade Ideas

```typescript
// v3.6.0: All trade ideas MUST pass chart validation (except lotto/news plays)

export async function validateTradeWithChart(
  symbol: string,
  assetType: string,
  direction: 'long' | 'short',
  currentPrice: number,
  targetPrice: number,
  stopLoss: number
): Promise<{
  isValid: boolean;
  adjustedTarget?: number;
  adjustedStop?: number;
  confidenceBoost: number;
  reasons: string[];
  warnings: string[];
}> {
  const chartAnalysis = await analyzeChart(symbol, assetType, currentPrice);
  
  if (!chartAnalysis) {
    return { isValid: false, confidenceBoost: 0, reasons: ['Insufficient chart data'], warnings: [] };
  }
  
  const reasons: string[] = [];
  const warnings: string[] = [];
  let confidenceBoost = 0;
  
  // Check for conflicting patterns
  for (const pattern of chartAnalysis.patterns) {
    if (direction === 'long' && pattern.type === 'bearish' && pattern.confidence > 70) {
      warnings.push(`CONFLICT: ${pattern.name} bearish pattern detected`);
      return { isValid: false, confidenceBoost: -10, reasons, warnings };
    }
    if (direction === 'short' && pattern.type === 'bullish' && pattern.confidence > 70) {
      warnings.push(`CONFLICT: ${pattern.name} bullish pattern detected`);
      return { isValid: false, confidenceBoost: -10, reasons, warnings };
    }
    
    // Confirming pattern adds confidence
    if ((direction === 'long' && pattern.type === 'bullish') ||
        (direction === 'short' && pattern.type === 'bearish')) {
      reasons.push(`${pattern.name} confirms ${direction} bias`);
      confidenceBoost += 5;
    }
  }
  
  // Adjust target to pattern price target if available
  let adjustedTarget = targetPrice;
  const confirmingPattern = chartAnalysis.patterns.find(p => 
    (direction === 'long' && p.type === 'bullish') ||
    (direction === 'short' && p.type === 'bearish')
  );
  if (confirmingPattern?.priceTarget) {
    adjustedTarget = confirmingPattern.priceTarget;
    reasons.push(`Target adjusted to pattern target: $${adjustedTarget.toFixed(2)}`);
  }
  
  // Adjust stop to nearest support level
  let adjustedStop = stopLoss;
  if (direction === 'long' && chartAnalysis.supportLevels.length > 0) {
    const nearestSupport = chartAnalysis.supportLevels[0];
    if (nearestSupport.price < currentPrice && nearestSupport.price > stopLoss) {
      adjustedStop = nearestSupport.price * 0.99; // 1% below support
      reasons.push(`Stop adjusted to support: $${adjustedStop.toFixed(2)}`);
    }
  }
  
  return {
    isValid: true,
    adjustedTarget,
    adjustedStop,
    confidenceBoost,
    reasons,
    warnings
  };
}
```

---

## 6. Timing Intelligence System

### Dynamic Entry/Exit Windows (`server/timing-intelligence.ts`)

The timing system derives unique entry/exit windows based on:
- NLP cues from analysis text
- Volatility regime estimation
- Confidence score adjustments
- Asset-specific base windows

### NLP Timing Cues Parser

```typescript
function parseTimingCues(analysisText: string): {
  entryUrgency: 'immediate' | 'moderate' | 'patient';
  entryMultiplier: number;
  reason: string;
} {
  const text = analysisText.toLowerCase();
  
  // IMMEDIATE ENTRY CUES (0.5x - 0.75x multiplier)
  const immediateCues = [
    'breakout', 'momentum', 'squeeze', 'spike', 'gap up', 'gap down', 'explosive'
  ];
  
  // PATIENT ENTRY CUES (1.5x - 2.0x multiplier)
  const patientCues = [
    'wait for pullback', 'consolidation', 'accumulation', 'support test', 'reversal setup'
  ];
  
  for (const cue of immediateCues) {
    if (text.includes(cue)) {
      return {
        entryUrgency: 'immediate',
        entryMultiplier: 0.5 + Math.random() * 0.25,
        reason: `"${cue}" detected - short entry window`
      };
    }
  }
  
  for (const cue of patientCues) {
    if (text.includes(cue)) {
      return {
        entryUrgency: 'patient',
        entryMultiplier: 1.5 + Math.random() * 0.5,
        reason: `"${cue}" detected - extended entry window`
      };
    }
  }
  
  // Default: moderate with ±10% randomization
  return {
    entryUrgency: 'moderate',
    entryMultiplier: 0.9 + Math.random() * 0.2,
    reason: 'standard entry window with randomization'
  };
}
```

### Volatility Regime Estimation

```typescript
function estimateVolatilityRegime(input: TimingWindowsInput): {
  regime: VolatilityRegime;
  exitMultiplier: number;
  reason: string;
} {
  // Calculate max loss percentage from stop
  const maxLoss = input.direction === 'long'
    ? (input.entryPrice - input.stopLoss) / input.entryPrice
    : (input.stopLoss - input.entryPrice) / input.entryPrice;
  const maxLossPercent = maxLoss * 100;
  
  const hasHighRSI = input.rsiValue !== undefined && (input.rsiValue > 70 || input.rsiValue < 30);
  const hasHighVolume = input.volumeRatio !== undefined && input.volumeRatio > 2.5;
  const isOptions = input.assetType === 'option';
  const isCrypto = input.assetType === 'crypto';
  
  // Decision tree
  if (isOptions || maxLossPercent > 4.0 || (hasHighRSI && hasHighVolume)) {
    return {
      regime: 'high',
      exitMultiplier: 0.6 + Math.random() * 0.2, // 0.6x - 0.8x (shorter holds)
      reason: `high volatility (${isOptions ? 'options' : maxLossPercent.toFixed(1) + '% stop'})`
    };
  } else if (isCrypto || maxLossPercent > 3.0 || hasHighVolume) {
    return {
      regime: 'normal',
      exitMultiplier: 0.9 + Math.random() * 0.2,
      reason: `normal volatility`
    };
  } else if (maxLossPercent < 2.0) {
    return {
      regime: 'low',
      exitMultiplier: 1.3 + Math.random() * 0.2, // 1.3x - 1.5x (longer holds)
      reason: `low volatility (${maxLossPercent.toFixed(1)}% stop)`
    };
  }
  
  return { regime: 'normal', exitMultiplier: 1.0, reason: 'default' };
}
```

### Dynamic Exit Time Recalculation

```typescript
/**
 * v3.7.0: Recalculates exit times dynamically based on current market conditions
 * Adds ±10-30% variance to prevent all trades showing identical exit times
 */
export function recalculateExitTime(input: RecalculateExitTimeInput): RecalculateExitTimeOutput {
  const { symbol, assetType, entryPrice, targetPrice, stopLoss, direction, originalExitBy, currentPrice } = input;
  
  const originalExitDate = new Date(originalExitBy);
  const now = new Date();
  const remainingMs = originalExitDate.getTime() - now.getTime();
  
  // Don't adjust if less than 5 minutes remaining
  if (remainingMs < 5 * 60 * 1000) {
    return { exitBy: originalExitBy, varianceApplied: 0, reason: 'Exit time imminent' };
  }
  
  // Estimate volatility from price action
  let volatilityMultiplier = 1.0;
  
  if (currentPrice !== undefined) {
    const currentPriceMove = Math.abs(currentPrice - entryPrice) / entryPrice * 100;
    
    if (currentPriceMove > 2.5) {
      volatilityMultiplier = 0.7 + Math.random() * 0.1; // Shorten window
    } else if (currentPriceMove > 1.5) {
      volatilityMultiplier = 0.85 + Math.random() * 0.15;
    } else {
      volatilityMultiplier = 1.0 + Math.random() * 0.2; // Can extend slightly
    }
  }
  
  // Asset-specific adjustments
  if (assetType === 'option') {
    volatilityMultiplier *= 0.85; // Options: shorter due to theta decay
  } else if (assetType === 'crypto') {
    volatilityMultiplier *= 1.1; // Crypto: slightly longer (24/7 trading)
  }
  
  // Add ±10-30% variance using symbol hash for consistency
  const symbolHash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seedVariance = ((symbolHash % 41) - 20) / 100; // -20% to +20%
  const randomVariance = (Math.random() - 0.5) * 0.2; // ±10% additional
  const totalVariance = Math.max(-0.3, Math.min(0.3, seedVariance + randomVariance));
  
  const finalMultiplier = volatilityMultiplier * (1 + totalVariance);
  const adjustedRemainingMs = Math.max(10 * 60 * 1000, remainingMs * finalMultiplier);
  
  const newExitDate = new Date(now.getTime() + adjustedRemainingMs);
  
  return {
    exitBy: newExitDate.toISOString(),
    varianceApplied: Math.round((adjustedRemainingMs - remainingMs) / remainingMs * 100),
    reason: `volatility adjustment (${volatilityMultiplier.toFixed(2)}x)`
  };
}
```

### Asset-Specific Base Windows

| Asset Type | Base Entry Window | Base Exit Window | Holding Period |
|------------|-------------------|------------------|----------------|
| Stock | 60 minutes | 360 minutes (6h) | day |
| Crypto | 90 minutes | 720 minutes (12h) | swing |
| Option | 45 minutes | 300 minutes (5h) | day |
| Future | 60 minutes | 360 minutes (6h) | day |

---

## 7. Trade Validation Framework

### Pre-Execution Validation (`server/trade-validation.ts`)

All trade ideas pass through a dual-layer validation framework:

**Layer 1: Structural Validation**
- Zero/negative price checks
- Stop loss equals entry price (fatal bug)
- Direction-price relationship validation
- Option format validation

**Layer 2: Risk Guardrails**
- Max 5% loss limit
- Min 2:1 R:R ratio
- Price sanity checks (< 50% moves for day trades)
- Volatility filters

```typescript
export interface TradeValidationInput {
  symbol: string;
  assetType: 'stock' | 'option' | 'crypto';
  direction: 'long' | 'short';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  strikePrice?: number;
  expiryDate?: string;
  optionType?: 'call' | 'put';
}

export function validateTrade(trade: TradeValidationInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // CRITICAL: Zero or negative prices
  if (trade.entryPrice <= 0 || trade.targetPrice <= 0 || trade.stopLoss <= 0) {
    errors.push(`Invalid prices: entry=$${trade.entryPrice}, target=$${trade.targetPrice}, stop=$${trade.stopLoss}`);
  }

  // CRITICAL: Stop loss equals entry price
  if (trade.stopLoss === trade.entryPrice) {
    errors.push(`Stop loss equals entry price. Fatal configuration error.`);
  }

  // CRITICAL: Direction-price relationship
  if (trade.direction === 'long') {
    if (trade.targetPrice <= trade.entryPrice) {
      errors.push(`LONG trade has target at or below entry. target=${trade.targetPrice}, entry=${trade.entryPrice}`);
    }
    if (trade.stopLoss >= trade.entryPrice) {
      errors.push(`LONG trade has stop at or above entry. stop=${trade.stopLoss}, entry=${trade.entryPrice}`);
    }
  } else if (trade.direction === 'short') {
    if (trade.targetPrice >= trade.entryPrice) {
      errors.push(`SHORT trade has target at or above entry. target=${trade.targetPrice}, entry=${trade.entryPrice}`);
    }
    if (trade.stopLoss <= trade.entryPrice) {
      errors.push(`SHORT trade has stop at or below entry. stop=${trade.stopLoss}, entry=${trade.entryPrice}`);
    }
  }

  // Warning: Unrealistic price movements
  const gainPercent = Math.abs((trade.targetPrice - trade.entryPrice) / trade.entryPrice) * 100;
  const lossPercent = Math.abs((trade.stopLoss - trade.entryPrice) / trade.entryPrice) * 100;

  if (gainPercent > 50) {
    warnings.push(`Unrealistic gain target: ${gainPercent.toFixed(1)}% move expected.`);
  }
  if (lossPercent > 10) {
    warnings.push(`Extremely wide stop loss: ${lossPercent.toFixed(1)}% risk.`);
  }

  // R:R ratio check
  const maxLoss = Math.abs(trade.direction === 'long' 
    ? trade.entryPrice - trade.stopLoss 
    : trade.stopLoss - trade.entryPrice);
  const potentialGain = Math.abs(trade.direction === 'long'
    ? trade.targetPrice - trade.entryPrice
    : trade.entryPrice - trade.targetPrice);
  const rrRatio = potentialGain / maxLoss;

  if (rrRatio < 1.5) {
    warnings.push(`Poor R:R ratio: ${rrRatio.toFixed(2)}:1. Minimum recommended is 2:1.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    severity: errors.length > 0 ? 'critical' : (warnings.length > 0 ? 'medium' : null)
  };
}
```

---

## 8. Performance Validation

### Minimum Loss Threshold (`server/performance-validator.ts`)

```typescript
// Losses below 3% are treated as "breakeven" instead of real losses
// Aligns with platform stop-loss rules: stocks=3.5%, crypto=5%
const MIN_LOSS_THRESHOLD_PERCENT = 3.0;

// When calculating win rate:
// Win Rate = Wins / (Wins + Real Losses)
// Excludes: breakeven trades (<3% loss), expired trades
```

### Trade Outcome Validation

```typescript
export class PerformanceValidator {
  static validateTradeIdea(idea: TradeIdea, currentPrice?: number): ValidationResult {
    // Skip if already closed
    if (idea.outcomeStatus !== 'open') {
      return { shouldUpdate: false };
    }

    const createdAt = new Date(idea.timestamp);
    const now = new Date();

    // Check if entry window has passed
    if (idea.entryValidUntil) {
      const entryValidUntilDate = this.parseExitByDate(idea.entryValidUntil, createdAt);
      if (entryValidUntilDate && now > entryValidUntilDate) {
        return {
          shouldUpdate: true,
          outcomeStatus: 'expired',
          exitPrice: idea.entryPrice,
          percentGain: 0,
          realizedPnL: 0,
          resolutionReason: 'missed_entry_window'
        };
      }
    }

    // Check if target hit
    const normalizedDirection = this.getNormalizedDirection(idea);
    if (normalizedDirection === 'long' && currentPrice >= idea.targetPrice) {
      return this.calculateWinResult(idea, idea.targetPrice, 'target_hit');
    }
    if (normalizedDirection === 'short' && currentPrice <= idea.targetPrice) {
      return this.calculateWinResult(idea, idea.targetPrice, 'target_hit');
    }

    // Check if stop hit
    if (normalizedDirection === 'long' && currentPrice <= idea.stopLoss) {
      return this.calculateLossResult(idea, idea.stopLoss, 'stop_hit');
    }
    if (normalizedDirection === 'short' && currentPrice >= idea.stopLoss) {
      return this.calculateLossResult(idea, idea.stopLoss, 'stop_hit');
    }

    // Check if exit time passed
    if (idea.exitBy) {
      const exitByDate = this.parseExitByDate(idea.exitBy, createdAt);
      if (exitByDate && now > exitByDate) {
        const percentGain = ((currentPrice - idea.entryPrice) / idea.entryPrice) * 100;
        const isWin = normalizedDirection === 'long' ? percentGain > 0 : percentGain < 0;
        return {
          shouldUpdate: true,
          outcomeStatus: isWin ? 'win' : 'loss',
          exitPrice: currentPrice,
          percentGain: Math.abs(percentGain),
          resolutionReason: 'time_expired'
        };
      }
    }

    return { shouldUpdate: false };
  }
}
```

### Performance Statistics Calculation

```typescript
// From server/storage.ts

async getPerformanceStats(engineVersion?: string, startDate?: string, endDate?: string) {
  const ideas = await this.getTradeIdeas();
  
  // Filter by date range and engine version
  const filteredIdeas = ideas.filter(idea => {
    if (engineVersion && idea.engineVersion !== engineVersion) return false;
    if (startDate && new Date(idea.timestamp) < new Date(startDate)) return false;
    if (endDate && new Date(idea.timestamp) > new Date(endDate)) return false;
    if (idea.outcomeStatus === 'open') return false;
    return true;
  });

  const wins = filteredIdeas.filter(i => i.outcomeStatus === 'win').length;
  const losses = filteredIdeas.filter(i => 
    i.outcomeStatus === 'loss' && 
    Math.abs(i.percentGain || 0) >= MIN_LOSS_THRESHOLD_PERCENT
  ).length;
  const breakevens = filteredIdeas.filter(i => 
    i.outcomeStatus === 'loss' && 
    Math.abs(i.percentGain || 0) < MIN_LOSS_THRESHOLD_PERCENT
  ).length;
  const expired = filteredIdeas.filter(i => i.outcomeStatus === 'expired').length;

  const totalDecided = wins + losses; // Excludes breakeven and expired
  const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;

  return {
    totalTrades: filteredIdeas.length,
    wins,
    losses,
    breakevens,
    expired,
    winRate: winRate.toFixed(1) + '%',
    avgGain: calculateAvgGain(filteredIdeas.filter(i => i.outcomeStatus === 'win')),
    avgLoss: calculateAvgLoss(filteredIdeas.filter(i => i.outcomeStatus === 'loss'))
  };
}
```

### Real Performance Stats (v3.7.0)

The platform provides **two** performance calculations:
1. **Filtered Stats** - Uses 3% minimum loss threshold (user-friendly)
2. **Real Stats** - Counts ALL losses (honest accounting)

```typescript
// server/performance-validator.ts

/**
 * Calculate REAL performance stats counting ALL losses (no 3% filter)
 * This matches actual account P&L
 */
export function calculateRealPerformanceStats(closedTrades: TradeIdea[]): RealPerformanceStats {
  const wins = closedTrades.filter(t => t.outcomeStatus === 'win');
  const losses = closedTrades.filter(t => t.outcomeStatus === 'loss');
  
  const totalWins = wins.length;
  const totalLosses = losses.length;
  const totalTrades = totalWins + totalLosses;
  
  // Honest win rate - no filtering
  const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;
  
  // Average win/loss amounts
  const avgWinPercent = wins.length > 0
    ? wins.reduce((sum, t) => sum + (t.percentGain || 0), 0) / wins.length
    : 0;
  const avgLossPercent = losses.length > 0
    ? losses.reduce((sum, t) => sum + Math.abs(t.percentGain || 0), 0) / losses.length
    : 0;
  
  // Expectancy: (Win% × Avg Win) - (Loss% × Avg Loss)
  const expectancy = (winRate/100 * avgWinPercent) - ((100-winRate)/100 * avgLossPercent);
  
  // Profit Factor: Gross Profit / Gross Loss
  const grossProfit = wins.reduce((sum, t) => sum + (t.percentGain || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.percentGain || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  return {
    totalTrades,
    totalWins,
    totalLosses,
    winRate,
    avgWinPercent,
    avgLossPercent,
    expectancy,
    profitFactor,
    grossProfit,
    grossLoss,
    maxConsecutiveLosses: calculateMaxConsecutiveLosses(closedTrades)
  };
}
```

### Position Sizing Calculator (v3.7.0)

```typescript
/**
 * Calculate optimal position size using fixed fractional risk
 * Risk 1-2% of account per trade (Kelly-inspired conservative approach)
 */
export function calculatePositionSize(
  accountSize: number,
  riskPerTrade: number,    // e.g., 0.02 for 2%
  entryPrice: number,
  stopLoss: number,
  assetType: 'stock' | 'option' | 'crypto' | 'future' = 'stock'
): PositionSizeResult {
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  
  // Guard: stop = entry (invalid)
  if (riskPerShare === 0) {
    return { shares: 0, isValid: false, warnings: ['Stop equals entry'] };
  }
  
  const maxRiskAmount = accountSize * riskPerTrade;
  const multiplier = assetType === 'option' ? 100 : 1;
  
  let shares = Math.floor(maxRiskAmount / riskPerShare);
  
  // Clamp to account size and recalculate all values
  let positionValue = shares * entryPrice * multiplier;
  if (positionValue > accountSize) {
    shares = Math.floor(accountSize / (entryPrice * multiplier));
    positionValue = shares * entryPrice * multiplier;
  }
  
  return {
    shares,
    positionValue,
    maxLossAmount: shares * riskPerShare * multiplier,
    positionPercent: (positionValue / accountSize) * 100,
    isValid: true
  };
}
```

### Trading Cost Modeling (v3.7.0)

```typescript
const TRADING_COSTS = {
  stock: { slippage: 0.0001, commission: 0, spreadCost: 0.0005 },   // ~0.15% RT
  option: { slippage: 0.02, commission: 0.0065, spreadCost: 0.02 }, // ~4% RT
  crypto: { slippage: 0.001, commission: 0.001, spreadCost: 0.001 },// ~0.4% RT
  future: { slippage: 0.0002, commission: 2.5, spreadCost: 0.0005 } // ~0.2% RT
};

export function calculateTradingCosts(
  entryPrice: number,
  exitPrice: number,
  shares: number,
  assetType: 'stock' | 'option' | 'crypto' | 'future'
): TradingCosts {
  const costs = TRADING_COSTS[assetType];
  const positionValue = shares * entryPrice;
  
  const entrySlippage = positionValue * costs.slippage;
  const exitSlippage = shares * exitPrice * costs.slippage;
  const commission = typeof costs.commission === 'number' && costs.commission < 1
    ? positionValue * costs.commission  // Percentage-based
    : costs.commission * shares;        // Per-share
  const spreadCost = (entryPrice + exitPrice) / 2 * shares * costs.spreadCost;
  
  const totalCosts = entrySlippage + exitSlippage + commission * 2 + spreadCost;
  const costPercent = (totalCosts / positionValue) * 100;
  
  return { entrySlippage, exitSlippage, commission, spreadCost, totalCosts, costPercent };
}
```

### API Retry Logic (v3.7.0)

```typescript
// server/api-retry.ts

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,   // Open circuit after 5 failures
  resetTimeout: 60000,   // Try again after 60 seconds
};

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, baseDelay = 1000, serviceName = 'default' } = retryOptions;
  
  if (isCircuitOpen(serviceName)) {
    throw new Error(`Circuit breaker OPEN for ${serviceName}`);
  }
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      recordSuccess(serviceName);
      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, 10000);
        await sleep(delay);
      }
    }
  }
  
  recordFailure(serviceName);
  throw new Error('All retries failed');
}
```

---

## 9. Data Sources & APIs

### Stock Data: Yahoo Finance
```typescript
// Real-time quotes, historical data, discovery
const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
```

### Crypto Data: CoinGecko
```typescript
// Real-time prices, market cap, discovery
const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}`);
```

### Options Data: Tradier API
```typescript
// Options chains, delta targeting, live pricing
const response = await fetch(`https://api.tradier.com/v1/markets/options/chains?symbol=${symbol}`, {
  headers: { 'Authorization': `Bearer ${TRADIER_API_KEY}` }
});
```

### News Data: Alpha Vantage
```typescript
// Breaking news, sentiment analysis
const response = await fetch(
  `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
);
```

### Futures Data: Databento (Planned)
```typescript
// CME futures: NQ (E-mini Nasdaq-100), GC (Gold)
// Real-time pricing, contract specifications
```

---

## 10. Database Schema

### Trade Ideas Table (Drizzle ORM)

```typescript
export const tradeIdeas = pgTable("trade_ideas", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  assetType: text("asset_type").notNull(), // 'stock' | 'option' | 'crypto' | 'future'
  direction: text("direction").notNull(), // 'long' | 'short'
  holdingPeriod: text("holding_period"), // 'day' | 'swing' | 'position'
  
  // Pricing
  entryPrice: real("entry_price").notNull(),
  targetPrice: real("target_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  riskRewardRatio: real("risk_reward_ratio"),
  
  // Timing
  timestamp: text("timestamp").notNull(),
  entryValidUntil: text("entry_valid_until"),
  exitBy: text("exit_by"),
  
  // Analysis
  catalyst: text("catalyst"),
  analysis: text("analysis"),
  confidenceScore: integer("confidence_score"),
  probabilityBand: text("probability_band"), // 'A' | 'B' | 'C'
  qualitySignals: text("quality_signals").array(),
  
  // Source & Governance
  source: text("source"), // 'quant' | 'ai' | 'hybrid' | 'manual' | 'chart_analysis'
  engineVersion: text("engine_version"),
  generationTimestamp: text("generation_timestamp"),
  dataSourceUsed: text("data_source_used"),
  
  // Options-specific
  strikePrice: real("strike_price"),
  expiryDate: text("expiry_date"),
  optionType: text("option_type"), // 'call' | 'put'
  delta: real("delta"),
  
  // Futures-specific
  futuresContractCode: text("futures_contract_code"),
  futuresRootSymbol: text("futures_root_symbol"),
  futuresMultiplier: integer("futures_multiplier"),
  futuresTickSize: real("futures_tick_size"),
  
  // Outcome tracking
  outcomeStatus: text("outcome_status").default("open"), // 'open' | 'win' | 'loss' | 'expired'
  exitPrice: real("exit_price"),
  realizedPnL: real("realized_pnl"),
  percentGain: real("percent_gain"),
  resolutionReason: text("resolution_reason"),
  exitDate: text("exit_date"),
  
  // Visibility
  visibility: text("visibility").default("private"),
  isPublic: boolean("is_public").default(false),
  isDraft: boolean("is_draft").default(false),
  userId: text("user_id"),
});
```

---

## 11. API Endpoints

### Trade Ideas

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trade-ideas` | Get all trade ideas (filtered by user tier) |
| GET | `/api/trade-ideas/:id` | Get single trade idea |
| POST | `/api/trade-ideas` | Create new trade idea |
| PATCH | `/api/trade-ideas/:id` | Update trade idea |
| DELETE | `/api/trade-ideas/:id` | Delete trade idea |
| POST | `/api/trade-ideas/generate` | Generate quant trade ideas |
| POST | `/api/trade-ideas/generate-ai` | Generate AI trade ideas |

### Performance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/performance/stats` | Get performance statistics |
| GET | `/api/performance/engine-breakdown` | Win rate by engine source |
| GET | `/api/performance/engine-trends` | Performance over time |

### User & Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user` | Get current user |
| GET | `/api/user/tier` | Get user tier info and limits |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/register` | Register new user |
| GET | `/api/auth/logout` | Logout |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/sync-notion` | Sync documentation to Notion |
| GET | `/api/admin/users` | Get all users |
| POST | `/api/admin/validate-performance` | Run performance validation |

---

## 12. Engine Changelog

### v3.7.0 (December 2025) - Current
- **Strict Chart Validation**: Trade ideas without chart data are REJECTED
- **Dynamic Exit Time Recalculation**: Uses symbol hash + random factors, ±10-30% variance
- **Asset-specific adjustments**: Options get shorter windows (theta decay), crypto slightly longer
- **ADX Calculation Fix**: Now properly Wilder-smooths DX values (was returning raw DX)
- **Position Sizing Calculator**: Fixed fractional risk (1-2% per trade) with validation
- **Real Performance Stats**: Added `calculateRealPerformanceStats()` counting ALL losses (no 3% filter)
- **API Retry Logic**: Circuit breaker pattern with exponential backoff (5 failures → 60s cooldown)
- **Trading Cost Modeling**: Slippage, commission, spread costs for stocks/options/crypto/futures
- **Realistic Win Rate Expectations**: Documentation updated to 55-65% (vs 75-91% backtest)

### v3.6.0 (December 2025)
- **Chart Analysis Upgrade**: Pre-validates all trade ideas with chart pattern recognition
- Detects 7 patterns: Head & Shoulders, Double Top/Bottom, Bull Flags, Triangles, Wedges, Channels
- Support/Resistance detection using swing highs/lows, MAs, round numbers
- Adjusts targets to pattern targets, stops to support levels
- +5 confidence boost when chart confirms setup

### v3.5.0 (December 2025)
- **Triple-Filter Upgrade**: Target 60%+ win rate
- Added 50-day MA filter (price above for LONG, below for SHORT)
- Tightened ADX threshold from ≤30 to ≤25
- Signal consensus already optimized (2+ signals required)

### v3.4.0 (November 2025)
- **Confidence Recalibration**: Fixed inverted confidence scoring
- Discovered high scores (90-100%) = 15.6% WR, low scores (<60%) = 63% WR
- Removed ALL bonuses (R:R, volume) - they were inverse predictors
- Lowered base scores from 90-95 to 50-65

### v3.3.0 (November 2025)
- **Time-of-Day Fix**: Restricted to 9:30-11:30 AM ET ONLY
- Diagnostic data showed morning = 75-80% WR, afternoon = 16-46% WR

### v3.2.0 (October 2025)
- Enabled SHORT trades (RSI>90 below 200MA)
- Widened stops: 2%→3.5% stocks, 3%→5% crypto
- Re-enabled crypto for data collection

### v3.1.0 (October 2025)
- **Regime Filtering**: Added ADX-based market regime detection
- Signal confidence voting (require 2+ confirmations)
- Time-of-day filter (first 2 hours only)
- Earnings blackout (skip ±3 days)

### v3.0.0 (October 2025)
- **Complete Rebuild**: Removed all failing signals (MACD, RSI divergence)
- Implemented ONLY proven strategies:
  1. RSI(2) < 10 + 200MA filter (75-91% win rate)
  2. VWAP institutional flow (80%+ win rate)
  3. Volume spike early entry

---

## Appendix: Research References

1. **Larry Connors RSI(2) Strategy**: 75-91% backtested win rate on QQQ (1998-2024)
2. **FINVIZ Study**: MACD "generally very low success rate" (16,954 stocks, 1995-2009)
3. **ADX Regime Filtering**: Mean reversion fails in trending markets (ADX > 25)
4. **VWAP Institutional Flow**: 80%+ win rate, professional trader standard

---

*This documentation is auto-generated and reflects the current state of QuantEdge v3.7.0.*
