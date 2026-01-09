# Quant Edge Labs - Complete Calculation Reference

This document provides a comprehensive reference of ALL calculations, scoring systems, technical indicators, and algorithms used throughout the platform.

---

## Table of Contents
1. [Grading System](#grading-system)
2. [Confidence Score Calculations](#confidence-score-calculations)
3. [Technical Indicators](#technical-indicators)
4. [Signal Scoring & Weights](#signal-scoring--weights)
5. [Market Regime Detection](#market-regime-detection)
6. [Watchlist Grading](#watchlist-grading)
7. [Risk Calculations](#risk-calculations)
8. [Timing Intelligence](#timing-intelligence)
9. [Loss Analysis](#loss-analysis)
10. [ML Intelligence](#ml-intelligence)
11. [Orphaned/Underutilized Features](#orphanedunderutilized-features)

---

## Grading System

**Source File:** `shared/grading.ts`

### Unified Academic Scale (v4.0)

The platform uses a single, confidence-based grading system:

| Grade | Score Range | Description | Tier |
|-------|-------------|-------------|------|
| A+ | 95-100% | Exceptional | Elite |
| A | 93-94% | Excellent | Elite |
| A- | 90-92% | Very strong | Strong |
| B+ | 87-89% | Strong | Strong |
| B | 83-86% | Good | Strong |
| B- | 80-82% | Above average | Average |
| C+ | 77-79% | Average+ | Average |
| C | 73-76% | Average | Average |
| C- | 70-72% | Passing | Average |
| D+ | 67-69% | Below average | Weak |
| D | 63-66% | Poor | Weak |
| D- | 60-62% | Minimal pass | Weak |
| F | 0-59% | Failing | Failing |

### Key Functions

```typescript
// Convert score to grade
scoreToGrade(score: number): GradeInfo

// Get letter grade only
getLetterGrade(score: number): GradeLetter  // e.g., 85 → "B"

// Check if tradeable (B- or better)
isTradeableGrade(grade): boolean

// Check if elite tier (A range)
isEliteGrade(grade): boolean
```

### Signal Quality (Supplementary)

Signal count is NOT the grade - it's supplementary information:
- 5+ signals: Exceptional
- 4 signals: Strong
- 3 signals: Good
- 2 signals: Average
- 0-1 signals: Weak

### Combined Grade Formula

When combining confidence + signals:
```
bonus = 
  - 5 signals: +5 points
  - 4 signals: +3 points
  - 3 signals: +1 point
  - 2 signals: 0 points
  - 0-1 signals: -3 points

adjustedScore = clamp(confidenceScore + bonus, 0, 100)
```

---

## Confidence Score Calculations

**Source File:** `server/universal-idea-generator.ts`

### Base Confidence by Source

Each idea source starts with a base confidence:

| Source | Base Confidence |
|--------|-----------------|
| quant_signal | 60% |
| ai_analysis | 55% |
| options_flow | 55% |
| bullish_trend | 55% |
| chart_analysis | 55% |
| news_catalyst | 52% |
| market_scanner | 50% |
| watchlist | 50% |
| crypto_scanner | 50% |
| sector_rotation | 50% |
| earnings_play | 48% |
| social_sentiment | 45% |
| manual | 40% |

### Signal Weight System

Each signal type adds/subtracts points:

**Bullish Technical Signals:**
| Signal | Weight |
|--------|--------|
| RSI_OVERSOLD | +8 |
| RSI2_EXTREME_OVERSOLD | +12 |
| MACD_BULLISH_CROSSOVER | +10 |
| GOLDEN_CROSS | +15 |
| PRICE_ABOVE_VWAP | +5 |
| VOLUME_SURGE | +10 |
| SUPPORT_BOUNCE | +8 |
| BREAKOUT | +12 |

**Bearish Technical Signals:**
| Signal | Weight |
|--------|--------|
| RSI_OVERBOUGHT | +8 |
| RSI2_EXTREME_OVERBOUGHT | +12 |
| MACD_BEARISH_CROSSOVER | +10 |
| DEATH_CROSS | +15 |
| PRICE_BELOW_VWAP | +5 |
| BREAKDOWN | +12 |

**Pattern Signals:**
| Signal | Weight |
|--------|--------|
| BULL_FLAG | +10 |
| BEAR_FLAG | +10 |
| CUP_HANDLE | +12 |
| HEAD_SHOULDERS | +12 |
| DOUBLE_BOTTOM | +10 |
| DOUBLE_TOP | +10 |

**Options Flow Signals:**
| Signal | Weight |
|--------|--------|
| UNUSUAL_CALL_VOLUME | +8 |
| UNUSUAL_PUT_VOLUME | +8 |
| SWEEP_DETECTED | +12 |
| BLOCK_TRADE | +10 |
| WHALE_ACTIVITY | +15 |

**Sentiment Signals:**
| Signal | Weight |
|--------|--------|
| POSITIVE_SENTIMENT | +5 |
| NEGATIVE_SENTIMENT | +5 |
| INFLUENCER_MENTION | +8 |
| NEWS_CATALYST | +7 |

**Risk Signals (Negative):**
| Signal | Weight |
|--------|--------|
| HIGH_IV | -5 |
| LOW_LIQUIDITY | -8 |
| PENNY_STOCK | -3 |
| EARNINGS_SOON | -6 |

**Convergence Bonuses:**
| Signal | Weight |
|--------|--------|
| MULTI_SIGNAL_CONFLUENCE | +15 |
| CROSS_ENGINE_AGREEMENT | +12 |

### Confluence Bonus

Additional bonuses for multiple confirming signals:
- 3+ signals: +5 points
- 5+ signals: +10 points total

### Final Confidence Formula

```
confidence = BASE_CONFIDENCE[source]
           + Σ(signal_weight)
           + confluence_bonus
           + loss_adjustment  // from Loss Analyzer

confidence = clamp(confidence, 0, 100)
```

---

## Technical Indicators

**Source File:** `server/technical-indicators.ts`

### RSI (Relative Strength Index)

**Formula:**
```
RSI = 100 - (100 / (1 + RS))

where RS = Average Gain / Average Loss over N periods

Average Gain = (Previous Avg Gain × (N-1) + Current Gain) / N  // Wilder smoothing
```

**Interpretation:**
| RSI Value | Signal | Direction |
|-----------|--------|-----------|
| ≤ 20 | Strong Oversold | Long |
| 21-30 | Oversold | Long |
| 31-69 | Neutral | - |
| 70-79 | Overbought | Short |
| ≥ 80 | Strong Overbought | Short |

**RSI(2) Mean Reversion (Connors):**
- RSI(2) < 5 + above 200 SMA = Strong Buy
- RSI(2) < 10 + above 200 SMA = Buy
- Target: 55-65% live win rate

### MACD (Moving Average Convergence Divergence)

**Formula:**
```
MACD Line = EMA(12) - EMA(26)
Signal Line = EMA(9) of MACD Line
Histogram = MACD Line - Signal Line

EMA = (Price - Previous EMA) × Multiplier + Previous EMA
Multiplier = 2 / (Period + 1)
```

**Interpretation:**
| Histogram | Signal |
|-----------|--------|
| > 0.5 | Strong Bullish/Bearish |
| 0.1 - 0.5 | Moderate Bullish/Bearish |
| < 0.05 | Potential Crossover |

### Bollinger Bands

**Formula:**
```
Middle Band = SMA(20)
Upper Band = Middle + (2 × Standard Deviation)
Lower Band = Middle - (2 × Standard Deviation)

Standard Deviation = √(Σ(Price - SMA)² / N)
```

### VWAP (Volume-Weighted Average Price)

**Formula:**
```
VWAP = Σ(Price × Volume) / Σ(Volume)
```

Used by institutional traders to gauge fair value.

### ATR (Average True Range)

**Formula:**
```
True Range = max(
  High - Low,
  |High - Previous Close|,
  |Low - Previous Close|
)

ATR = Wilder Smoothed Average of True Range over N periods
```

Used for:
- Stop loss placement (typically 1.5-2x ATR)
- Position sizing
- Volatility assessment

### ADX (Average Directional Index)

**Formula:**
```
+DM = Current High - Previous High (if positive and > -DM)
-DM = Previous Low - Current Low (if positive and > +DM)

+DI = 100 × Smoothed(+DM) / Smoothed(TR)
-DI = 100 × Smoothed(-DM) / Smoothed(TR)

DX = 100 × |+DI - -DI| / (+DI + -DI)
ADX = Wilder Smoothed Average of DX
```

**Market Regime Interpretation:**
| ADX Value | Regime | Best Strategy |
|-----------|--------|---------------|
| < 20 | Ranging/Choppy | Mean Reversion |
| 20-25 | Developing | Mixed |
| > 25 | Trending | Momentum |
| > 40 | Strong Trend | Momentum (high confidence) |

### Stochastic RSI

```
RSI = Calculate regular RSI
Stoch RSI = (RSI - Lowest RSI) / (Highest RSI - Lowest RSI)
%K = SMA(Stoch RSI, K-period)
%D = SMA(%K, D-period)
```

More sensitive than regular RSI for oversold/overbought detection.

### Ichimoku Cloud

```
Tenkan-sen (Conversion Line) = (Highest High + Lowest Low) / 2 over 9 periods
Kijun-sen (Base Line) = (Highest High + Lowest Low) / 2 over 26 periods
Senkou Span A = (Tenkan + Kijun) / 2 plotted 26 periods ahead
Senkou Span B = (Highest High + Lowest Low) / 2 over 52 periods, plotted 26 ahead
Chikou Span = Close plotted 26 periods behind
```

### Candlestick Pattern Detection

Uses `technicalindicators` library for pattern recognition:

**Bullish Patterns (Strong):**
- Bullish Engulfing
- Morning Star
- Three White Soldiers

**Bullish Patterns (Moderate):**
- Hammer
- Piercing Line
- Tweezer Bottom

**Bearish Patterns (Strong):**
- Bearish Engulfing
- Evening Star
- Three Black Crows

**Bearish Patterns (Moderate):**
- Shooting Star
- Hanging Man
- Tweezer Top

---

## Signal Scoring & Weights

**Source File:** `server/dynamic-signal-weights.ts`

The platform uses adaptive signal weights that adjust based on market conditions and historical performance.

### Signal Attribution

**Source File:** `server/signal-attribution.ts`

Tracks which signals contributed to winning vs losing trades to improve future predictions.

---

## Market Regime Detection

**Source File:** `server/market-context-service.ts`

### Trading Sessions (Chicago Time)

| Session | Hours (CT) | Characteristics |
|---------|------------|-----------------|
| Pre-Market | 4:00-8:30 AM | Low volume, high spreads |
| Opening | 8:30-10:00 AM | High volatility, momentum |
| Mid-Day | 10:00 AM-2:00 PM | Lower volume, ranging |
| Power Hour | 2:00-3:00 PM | Increased activity |
| Close | 3:00-4:00 PM | Institutional activity |
| After Hours | 4:00-8:00 PM | Low liquidity |

### Regime Detection

Combines ADX with volatility analysis:
- **Low Volatility + Ranging ADX** = Mean reversion favorable
- **High Volatility + Trending ADX** = Momentum favorable
- **VIX Elevated** = Risk-off, smaller positions

---

## Watchlist Grading

**Source File:** `server/watchlist-grading-service.ts`

### Tier System

| Tier | Grade Score | Meaning |
|------|-------------|---------|
| S | 85-100 | Exceptional opportunity |
| A | 75-84 | Excellent |
| B | 65-74 | Good |
| C | 55-64 | Average |
| D | 45-54 | Below Average |
| F | 0-44 | Avoid |

### Grading Inputs

Technical metrics evaluated:
- RSI(14) and RSI(2)
- 5-day and 20-day momentum
- Volume ratio (vs average)
- ADX (trend strength)
- MACD signal
- Price vs MA20/MA50
- ATR (volatility)
- Bollinger Band position

### Grade Calculation

Each metric contributes to a composite score (0-100), then converted to tier using the tier thresholds above.

---

## Risk Calculations

**Source File:** `server/risk-engine.ts`

### Position Sizing

```
Position Size = Account Risk % / Trade Risk %
Trade Risk % = (Entry - Stop Loss) / Entry × 100

Example:
  Account: $10,000
  Risk per trade: 2% ($200)
  Entry: $100, Stop: $95 (5% risk)
  Position Size = $200 / $5 = 40 shares
```

### Risk/Reward Ratio

```
R:R = (Target - Entry) / (Entry - Stop Loss)

Minimum acceptable: 1.5:1
Preferred: 2:1 or better
```

### Stop Loss Placement

ATR-based stops:
- Conservative: 1.5x ATR below entry
- Standard: 2x ATR below entry
- Aggressive: 1x ATR below entry

---

## Timing Intelligence

**Source File:** `server/timing-intelligence.ts`

### Exit Time Calculation

Factors considered:
- DTE (Days to Expiration) for options
- Market session (avoid overnight risk)
- Volatility regime
- Theta decay (options)
- Historical pattern duration

### Time Adjustments

Exit times adjusted based on:
- Wide range days: -20% to -45%
- Options theta decay
- Approaching market close
- Earnings proximity

---

## Loss Analysis

**Source File:** `server/loss-analyzer-service.ts`

### Loss Categories

| Category | Description |
|----------|-------------|
| EARLY_EXIT | Closed before target hit |
| LATE_EXIT | Held too long |
| WRONG_DIRECTION | Opposite move |
| VOLATILITY_CRUSH | IV collapsed |
| BAD_ENTRY | Poor timing |
| BLACK_SWAN | Unforeseen event |

### Symbol Avoidance System

When a symbol has 3+ consecutive losses:
- `shouldAvoid = true`
- Universal Idea Generator BLOCKS new ideas
- Auto-Lotto Bot skips trades
- UI shows warning banner

### Confidence Adjustment

Based on loss history:
```
adjustment = lossSeverity × -3  // per consecutive loss
maxPenalty = -15
```

---

## ML Intelligence

**Source File:** `server/ml-intelligence-service.ts`

### Capabilities

1. **Price Direction Prediction**
   - Input: Historical prices, volume, technicals
   - Output: Up/Down probability

2. **Sentiment Analysis**
   - Input: News, social mentions
   - Output: Bullish/Bearish/Neutral score

3. **Chart Pattern Recognition**
   - Input: OHLC candles
   - Output: Detected patterns with confidence

4. **Adaptive Position Sizing**
   - Input: Win rate, volatility, account size
   - Output: Optimal position size

5. **Market Regime Detection**
   - Input: VIX, ADX, sector rotation
   - Output: Trending/Ranging/Volatile

### Integration with Auto-Lotto Bot

ML predictions boost/reduce confidence:
- Aligned direction: +20 points
- Opposite direction: -20 points

---

## Orphaned/Underutilized Features

These features were built but may not be fully connected or utilized:

### Confirmed Orphaned (Not Imported Anywhere)

| Module | Description | Status |
|--------|-------------|--------|
| `pre-market-surge-detector.ts` | Detects pre-market volume surges | **NOT USED** |
| `wallet-sync-service.ts` | Syncs external wallets | **NOT USED** |
| `watch-suggestions.ts` | AI watchlist suggestions | **NOT USED** |
| `ct-ingestion-service.ts` | CT Tracker ingestion | **NOT USED** |
| `penny-scanner.ts` | Penny stock scanner | **NOT USED** |
| `scan-deduper.ts` | Deduplicates scan results | **NOT USED** |
| `error-sanitizer.ts` | Error message sanitization | **NOT USED** |
| `api-retry.ts` | API retry logic | **NOT USED** |

### Dynamically Imported (Used But Lazy-Loaded)

| Module | Import Location | Usage |
|--------|-----------------|-------|
| `auto-lotto-trader.ts` | index.ts, lotto-scanner.ts | Autonomous bot |
| `backtesting-service.ts` | routes.ts | Backtesting API |
| `ml-intelligence-service.ts` | routes.ts, auto-lotto-trader | ML predictions |
| `polymarket-service.ts` | index.ts, routes.ts | Prediction markets |
| `social-sentiment-scanner.ts` | routes.ts | Social sentiment |
| `weekly-picks-generator.ts` | index.ts, routes.ts | Premium picks |
| `deep-options-analyzer.ts` | Various | Options analysis |
| `breakout-scanner.ts` | Various | Breakout detection |

### Potentially Underutilized

| Module | Issue |
|--------|-------|
| `dynamic-signal-weights.ts` | May not be actively adapting |
| `expiry-pattern-service.ts` | Unclear if connected to bot |
| `premium-tracking-service.ts` | May not be displayed in UI |
| `performance-validation-service.ts` | May not be running |
| `futures-research-service.ts` | Limited futures coverage |
| `quant-mean-reversion-bot.ts` | Separate from main auto-lotto |

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Unified Grading | `shared/grading.ts` |
| Server Grading | `server/grading.ts` |
| Technical Indicators | `server/technical-indicators.ts` |
| Universal Idea Generator | `server/universal-idea-generator.ts` |
| Watchlist Grading | `server/watchlist-grading-service.ts` |
| Market Context | `server/market-context-service.ts` |
| Loss Analysis | `server/loss-analyzer-service.ts` |
| ML Intelligence | `server/ml-intelligence-service.ts` |
| Auto-Lotto Bot | `server/auto-lotto-trader.ts` |
| Options Enrichment | `server/options-enricher.ts` |
| Timing Intelligence | `server/timing-intelligence.ts` |
| Risk Engine | `server/risk-engine.ts` |

---

*Last Updated: January 2026*
*Version: 4.0 (Unified Grading System)*
