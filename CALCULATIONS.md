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
11. [Auto-Lotto Bot](#auto-lotto-bot)
12. [Scanners](#scanners)
13. [Risk Engine (Advanced)](#risk-engine-advanced)
14. [Quantitative Engine](#quantitative-engine)
15. [ADX Momentum Detection](#adx-momentum-detection)
16. [VIX-Based Signal Filtering](#vix-based-signal-filtering)
17. [Weekly Signal Recalibration](#weekly-signal-recalibration)
18. [Correlation Position Caps](#correlation-position-caps)
19. [Options Analysis](#options-analysis)
20. [Backtesting Service](#backtesting-service)
21. [Orphaned/Underutilized Features](#orphanedunderutilized-features)

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

Each signal type adds/subtracts points. These values are defined in `SIGNAL_WEIGHTS` in `server/universal-idea-generator.ts`:

**Technical Signals:**
| Signal | Weight |
|--------|--------|
| RSI_OVERSOLD | +12 |
| RSI_OVERBOUGHT | +10 |
| MACD_BULLISH_CROSS | +10 |
| MACD_BEARISH_CROSS | +10 |
| GOLDEN_CROSS | +15 |
| DEATH_CROSS | +12 |
| ABOVE_VWAP | +8 |
| BELOW_VWAP | +8 |
| VOLUME_SURGE | +10 |
| BREAKOUT | +12 |
| BREAKDOWN | +10 |
| SUPPORT_BOUNCE | +12 |
| RESISTANCE_REJECTION | +10 |

**Momentum Signals:**
| Signal | Weight |
|--------|--------|
| MARKET_SCANNER_MOVER | +8 |
| TOP_GAINER | +10 |
| TOP_LOSER | +8 |
| UNUSUAL_VOLUME | +10 |
| SECTOR_LEADER | +8 |

**Options Flow Signals:**
| Signal | Weight |
|--------|--------|
| UNUSUAL_CALL_FLOW | +12 |
| UNUSUAL_PUT_FLOW | +10 |
| SWEEP_DETECTED | +15 |
| LARGE_PREMIUM | +12 (dynamic: +5 to +15 based on size) |
| DARK_POOL_PRINT | +14 |

**Social/Sentiment Signals:**
| Signal | Weight |
|--------|--------|
| TRENDING_TICKER | +8 |
| INFLUENCER_MENTION | +10 |
| SENTIMENT_BULLISH | +8 |
| SENTIMENT_BEARISH | +6 |
| HIGH_ENGAGEMENT | +6 |

**Chart Pattern Signals:**
| Signal | Weight |
|--------|--------|
| BULL_FLAG | +10 |
| BEAR_FLAG | +8 |
| HEAD_SHOULDERS | +12 |
| DOUBLE_BOTTOM | +12 |
| DOUBLE_TOP | +10 |
| ASCENDING_TRIANGLE | +10 |
| DESCENDING_TRIANGLE | +8 |
| CUP_HANDLE | +14 |

**Fundamental Signals:**
| Signal | Weight |
|--------|--------|
| EARNINGS_BEAT | +10 |
| REVENUE_BEAT | +8 |
| UPGRADE | +12 |
| DOWNGRADE | +8 |
| INSIDER_BUYING | +15 |
| INSTITUTIONAL_ACCUMULATION | +12 |

**Risk Signals (Negative):**
| Signal | Weight |
|--------|--------|
| HIGH_IV | -5 |
| LOW_LIQUIDITY | -8 |
| PENNY_STOCK | -3 |
| EARNINGS_SOON | -6 |

**Convergence Signals:**
| Signal | Weight |
|--------|--------|
| MULTI_SIGNAL_CONFLUENCE | +15 |
| CROSS_ENGINE_AGREEMENT | +12 |

### Signal Correlation Groups

Signals in the same group are considered redundant. Only the **highest-weight signal in each group** gets full credit; all others receive a **50% penalty**. This is order-independent.

| Correlation Group | Signals (highest weight gets 100%, others get 50%) |
|-------------------|---------------------------------------------------|
| Mean Reversion Oversold | RSI_OVERSOLD, STOCHASTIC_OVERSOLD, SUPPORT_BOUNCE |
| Mean Reversion Overbought | RSI_OVERBOUGHT, STOCHASTIC_OVERBOUGHT, RESISTANCE_REJECTION |
| Volume Signals | VOLUME_SURGE, UNUSUAL_VOLUME, LARGE_PREMIUM |
| Bullish Momentum Crosses | MACD_BULLISH_CROSS, GOLDEN_CROSS |
| Bearish Momentum Crosses | MACD_BEARISH_CROSS, DEATH_CROSS |
| Bullish Breakout Patterns | BREAKOUT, ASCENDING_TRIANGLE, BULL_FLAG, CUP_HANDLE |
| Bearish Breakdown Patterns | BREAKDOWN, DESCENDING_TRIANGLE, BEAR_FLAG, HEAD_SHOULDERS |
| Bullish Options Flow | UNUSUAL_CALL_FLOW, SWEEP_DETECTED |
| Bearish Options Flow | UNUSUAL_PUT_FLOW, SWEEP_DETECTED |
| Gainer Momentum | TOP_GAINER, MARKET_SCANNER_MOVER |
| Loser Momentum | TOP_LOSER, MARKET_SCANNER_MOVER |

### Saturation Curve

Diminishing returns beyond 3 signals to prevent grade inflation:

```typescript
// Positive signals only (excluding risk penalties)
signalCount = count(signals where weight > 0)

// Saturation factor decreases with more signals
saturationFactor = signalCount <= 3 ? 1.0 : 1 / (1 + 0.1 × (signalCount - 3))

// Effect on final signal contribution:
// 3 signals: factor = 1.00 (100% weight)
// 4 signals: factor = 0.91 (91% weight)
// 5 signals: factor = 0.83 (83% weight)
// 6 signals: factor = 0.77 (77% weight)
// 8 signals: factor = 0.67 (67% weight)
```

### Confluence Bonus

Additional bonuses for 3-5 confirming signals only:
- 3-5 signals: +5 points
- >5 signals: No additional bonus (saturation curve applies)

### Final Confidence Formula

```typescript
// Step 1: Calculate total signal weight with correlation penalties
totalWeight = 0
appliedSignals = Set()
for each signal:
  weight = SIGNAL_WEIGHTS[signal.type]
  if (primary signal already applied && signal is correlated):
    weight *= 0.5  // Correlation penalty
  totalWeight += weight
  appliedSignals.add(signal.type)

// Step 2: Apply saturation curve
adjustedWeight = totalWeight × saturationFactor

// Step 3: Calculate final confidence
confidence = BASE_CONFIDENCE[source]
           + adjustedWeight
           + confluenceBonus  // +5 for 3-5 signals only
           + lossAdjustment   // from Loss Analyzer

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

| Category | Cause Weight | Description |
|----------|--------------|-------------|
| direction_wrong | 100 | Market moved against position |
| regime_shift | 90 | Market regime changed during trade |
| theta_decay | 85 | Option lost value due to time decay |
| iv_crush | 85 | Implied volatility collapsed |
| stop_too_loose | 80 | Stop loss was too far from entry |
| timing_late | 75 | Entered after move already happened |
| chasing_entry | 75 | Low confidence entry (confidence < 65) |
| timing_early | 70 | Entered too early, never saw profit |
| stop_too_tight | 65 | Stop was too close, quick stop-out |
| catalyst_failed | 60 | Expected catalyst didn't materialize |
| liquidity_issue | 50 | Liquidity problems affected exit |
| oversized_position | 40 | Position too large for account |
| unknown | 0 | Cause unclear, needs review |

### Remediation Actions

When a loss is diagnosed, the system applies adjustments:

**Stop Loss Multiplier Adjustments:**
```
Trigger: Large loss (> -30%) with stop_loss exit
Action: adjustStopMultiplier = 0.85 (tighten stop by 15%)

Trigger: Gave back profit (peak > 20%, closed negative)
Action: adjustStopMultiplier = 0.9 (tighten by 10%)
```

**Regime-Aware Quick Stop-Out Adjustment:**
```typescript
// Quick stop-out (< 15% loss in < 1 day) - response depends on market regime
const regime = exitSnapshot.marketRegime || 'ranging'
const isTrending = regime === 'trending_up' || regime === 'trending_down'
const isRanging = regime === 'ranging'

if (quickStopOut && isRanging) {
  // Ranging market - stop was genuinely too tight
  category = 'stop_too_tight'
  adjustStopMultiplier = 1.1  // Loosen by 10%
} else if (quickStopOut && isTrending) {
  // Trending market - wrong side of trend
  category = 'direction_wrong'
  adjustConfidenceThreshold = +15  // Much more selective
  adjustStopMultiplier = 0.95      // Tighten by 5%
} else {
  // Transitional/volatile regime
  category = 'stop_too_tight'
  adjustConfidenceThreshold = +5
}
```

**Confidence Threshold Adjustments:**
```
Trigger: Direction wrong (SPY moved > 1.5% against)
Action: adjustConfidenceThreshold = +5

Trigger: Same-day large loss (> 20%)
Action: adjustConfidenceThreshold = +10

Trigger: Low confidence entry (< 65)
Action: adjustConfidenceThreshold = +10

Trigger: Quick stop-out in trending market (ADX >= 25)
Action: adjustConfidenceThreshold = +15
```

### Learning State Formulas

**Global Confidence Threshold Update:**
```typescript
newThreshold = min(85, currentThreshold + (adjustment × 0.3))
// Scales adjustment by 30%, caps at 85%
```

**Global Stop Loss Multiplier Update:**
```typescript
change = (adjustStopMultiplier - 1.0) × 0.2
newMultiplier = clamp(currentMultiplier + change, 0.7, 1.3)
// Scales change by 20%, keeps between 70%-130%
```

### Symbol-Specific Adjustments

**Per-Symbol Confidence Boost:**
```typescript
// On loss:
confidenceBoost = max(-20, currentBoost - 3)
lossStreak += 1

// On win:
confidenceBoost = min(+10, currentBoost + 1)
lossStreak = 0
avoidUntil = null  // Clear cooldown
```

### Symbol Avoidance System

**Magnitude-Based Dynamic Cooldown:**

When a symbol has **3+ consecutive losses**, cooldown duration scales with loss severity:

```typescript
// Track recent loss magnitudes (last 5 losses)
recentLosses.push(pnlPercent)
if (recentLosses.length > 5) recentLosses.shift()

if (lossStreak >= 3) {
  avgLossMagnitude = sum(recentLosses) / recentLosses.length
  
  if (avgLossMagnitude <= -15) {
    // Severe losses - 3 day cooldown
    cooldownDays = 3
  } else if (avgLossMagnitude <= -8) {
    // Moderate losses - 1 day cooldown
    cooldownDays = 1
  } else {
    // Small losses (< 8%) - no cooldown, confidence penalty only
    cooldownDays = 0
  }
  
  if (cooldownDays > 0) {
    avoidUntil = now + cooldownDays
    shouldAvoid = true
  }
}
```

**Cooldown Tiers:**
| Avg Loss Magnitude | Cooldown Duration | Rationale |
|--------------------|-------------------|-----------|
| ≤ -15% | 3 days | Severe losses need full pattern reset |
| -8% to -15% | 1 day | Moderate losses need brief cooling |
| > -8% | 0 days | Small losses handled via confidence penalty |

**Integration Points:**
- **Universal Idea Generator**: HARD BLOCKS idea generation when `shouldAvoid=true`
- **Auto-Lotto Bot**: Skips trades with `LOSS_COOLDOWN_BLOCK` signal
- **UI**: Shows warning banner with streak count and cooldown expiry

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

## Auto-Lotto Bot

**Source File:** `server/auto-lotto-trader.ts`

### Overview

The Auto-Lotto Bot is an autonomous trading system that scans markets, analyzes opportunities, and executes trades based on configurable preferences and risk controls.

### Kill Switches (Environment Variables)

| Variable | Default | Effect |
|----------|---------|--------|
| `ENABLE_AUTO_LOTTO` | `true` | Master kill switch for options bot |
| `ENABLE_CRYPTO_BOT` | `true` | Kill switch for crypto trading |
| `ENABLE_FUTURES_BOT` | `true` | Kill switch for futures trading |
| `ENABLE_ML_PREDICTIONS` | `true` | Enable/disable ML confidence adjustments |
| `ENABLE_VIX_FILTERING` | `true` | Enable/disable VIX-based signal filtering |

### Entry Logic

1. **Session Gating**: Check if current trading session is favorable
2. **Market Context**: Analyze SPY/QQQ/VIX for overall conditions
3. **Portfolio Check**: Verify available cash and position limits
4. **Signal Scanning**: Scan top movers for confluence
5. **Confidence Calculation**: Apply ML + VIX adjustments
6. **Entry Gate**: Validate via Unified Entry Gate System

### Entry Requirements

| Parameter | Conservative | Moderate | Aggressive |
|-----------|--------------|----------|------------|
| Min Confidence | 85% | 80% | 75% |
| Min R:R Ratio | 1.5 | 1.0 | 0.8 |
| Max Position Size | $300 | $500 | $750 |
| Max Concurrent | 15 | 20 | 30 |

### DTE-Aware Exit Strategy

| DTE Range | Stop-Loss | Profit Target | Action |
|-----------|-----------|---------------|--------|
| 0 DTE | -15% | +25% | Aggressive stops |
| 1-2 DTE | -20% | +40% | Moderate stops |
| 3-5 DTE | -25% | +50% | Standard stops |
| 6+ DTE | -30% | +75% | Wide stops |

### Risk Controls

- **Daily Loss Limit**: Stops trading after $2000 daily loss
- **Consecutive Loss Guard**: Pauses after 3 consecutive losses
- **Correlation Caps**: Max 3 positions per sector
- **Position Size Limits**: Max 10% of portfolio per trade

---

## Scanners

### Breakout Scanner

**Source File:** `server/breakout-scanner.ts`

Detects resistance/support level breaks with volume confirmation.

**Detection Logic:**
```
Breakout = (CurrentPrice > Resistance × 1.02) AND (Volume > Avg × 1.5)
Breakdown = (CurrentPrice < Support × 0.98) AND (Volume > Avg × 1.5)
```

**Confirmation Requirements:**
- Price must break level by at least 2%
- Volume must be 1.5x average
- Consecutive close above/below level preferred

### Bullish Trend Scanner

**Source File:** `server/bullish-trend-scanner.ts`

Identifies stocks in momentum phases using phase analysis.

**Phase Classification:**
| Phase | Criteria | Score |
|-------|----------|-------|
| Accumulation | Low volume, price basing | +5 |
| Markup | Price rising, volume increasing | +15 |
| Distribution | High volume, price stalling | -5 |
| Decline | Price falling, selling pressure | -15 |

**Momentum Score:**
```
MomentumScore = (RSI_Signal × 2) + (MACD_Signal × 2) + (ADX_Signal × 1.5) + PhaseBonus
```

### Market Scanner

**Source File:** `server/market-scanner.ts`

Scans for day trade and swing opportunities with universe expansion.

**Modes:**
- **Day Trade**: High volatility, RSI extremes, volume spikes
- **Swing**: Trend continuation, breakouts, support bounces

**Universe Selection:**
- Static ticker list (800+ symbols)
- Dynamic mover discovery (real-time gainers/losers)
- Combined for comprehensive coverage

### Mover Discovery

**Source File:** `server/mover-discovery.ts`

Fetches real-time most-active stocks from Yahoo Finance.

**Schedule:** Every 15 minutes during market hours (8 AM - 5 PM CT)

**Criteria:**
- Top gainers (>5% daily move)
- Top losers (<-5% daily move)
- Volume leaders (>5x average)

### Options Flow Scanner

**Source File:** `server/options-flow-scanner.ts`

Detects unusual options activity indicating institutional interest.

**Detection Thresholds:**
| Metric | Threshold | Weight |
|--------|-----------|--------|
| Premium | >$100K | +15 |
| OI vs Volume | Vol > 2x OI | +10 |
| Sweep | >5 exchanges | +12 |
| Near ITM | Delta 0.4-0.6 | +8 |

---

## Risk Engine (Advanced)

**Source File:** `server/risk-engine.ts`

### Value at Risk (VaR)

```
VaR_95 = μ - 1.645σ × PortfolioValue
VaR_99 = μ - 2.326σ × PortfolioValue
```

Where:
- μ = Mean daily return
- σ = Standard deviation of returns

### Conditional VaR (CVaR / Expected Shortfall)

```
CVaR_95 = E[Loss | Loss > VaR_95]
```

Average of losses beyond the VaR threshold.

### Kelly Criterion

```
Kelly = (WinRate × AvgWin - (1 - WinRate) × AvgLoss) / AvgWin

Position Sizing:
- Full Kelly: Kelly × PortfolioValue
- Half Kelly: Kelly × 0.5 × PortfolioValue (recommended)
- Quarter Kelly: Kelly × 0.25 × PortfolioValue (conservative)
```

### Sharpe Ratio

```
Sharpe = (PortfolioReturn - RiskFreeRate) / StandardDeviation
```

Annualized with √252 scaling.

### Sortino Ratio

```
Sortino = (PortfolioReturn - RiskFreeRate) / DownsideDeviation
```

Only penalizes negative volatility.

### Circuit Breakers

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Daily Loss | >5% portfolio | Halt trading |
| Max Drawdown | >15% | Reduce position sizes 50% |
| Consecutive Losses | >5 | Pause for cooldown |
| VIX Spike | >35 | Halt new positions |

### VIX Caching

Real VIX is fetched and cached every 5 minutes via `updateVIXCache()`. The `getCachedVIX()` function provides synchronous access for risk calculations.

---

## Quantitative Engine

**Source File:** `server/quantitative-engine.ts`

### RSI(2) Mean Reversion

```
Entry Long: RSI(2) < 10 AND Close > 200 SMA
Entry Short: RSI(2) > 90 AND Close < 200 SMA
Exit: RSI(2) crosses 50
```

### VWAP Institutional Flow

```
Bullish: Price < VWAP AND Volume Surge
Bearish: Price > VWAP AND Volume Surge
```

### Volume Spike Early Entry

```
Signal: CurrentVolume > 3 × AverageVolume
Confirmation: Price in top/bottom 20% of range
```

### ADX Regime Filtering

```
Trending: ADX > 25 → Use momentum strategies
Ranging: ADX < 20 → Use mean reversion
Developing: 20-25 → Mixed approach
```

---

## ADX Momentum Detection

**Source File:** `server/technical-indicators.ts`

### Function: `detectADXMomentum()`

Determines if trend is accelerating or decaying using ADX slope analysis.

**Parameters:**
- `period`: ADX calculation period (default 14)
- `lookback`: Periods to compare (default 5)

**Returns:**
| Momentum | ADX Delta | Confidence Multiplier |
|----------|-----------|----------------------|
| Accelerating | > +3 | 1.15 (boost 15%) |
| Stable | -3 to +3 | 1.0 (no change) |
| Decaying | < -3 | 0.8-0.9 (reduce 10-20%) |

**Trading Recommendations:**
- `enter_trend`: ADX rising, >25 strength
- `hold`: Stable trend conditions
- `exit_trend`: ADX falling, trend weakening
- `wait`: Unclear conditions

---

## VIX-Based Signal Filtering

**Source File:** `server/universal-idea-generator.ts`

### Signal Strength Multipliers

| VIX Level | Mean Reversion Signals | Volatility Signals |
|-----------|------------------------|-------------------|
| ≤15 (Low) | 1.1x boost | 0.9x reduce |
| 16-20 (Normal) | 1.0x | 1.0x |
| 21-30 (Elevated) | 0.7x reduce | 1.15x boost |
| >30 (High) | 0.5x strong reduce | 1.1x boost |

**Mean Reversion Signals:**
- RSI_OVERSOLD, RSI_OVERBOUGHT
- STOCHASTIC_OVERSOLD, STOCHASTIC_OVERBOUGHT
- SUPPORT_BOUNCE, RESISTANCE_REJECTION

**Volatility Signals:**
- VOLUME_SURGE, UNUSUAL_VOLUME
- SWEEP_DETECTED, BREAKOUT, BREAKDOWN

---

## Weekly Signal Recalibration

**Source File:** `server/signal-weight-recalibration.ts`

### Overview

Analyzes actual trade outcomes weekly to adjust signal weights dynamically.

### Recalibration Logic

```
For each signal with 5+ trades:
  winRate = wins / (wins + losses)
  
  if winRate >= 70%: adjustment = +2
  if winRate >= 60%: adjustment = +1
  if winRate <= 40%: adjustment = -1
  if winRate <= 30%: adjustment = -2
```

### Constraints

- Max adjustment per week: ±2 points
- Cumulative adjustment cap: ±10 points
- Minimum trades required: 5 per signal

### API

```typescript
runWeeklyRecalibration(): Promise<RecalibrationResult>
getAdjustedSignalWeight(signalType: string): number
getAllSignalWeights(): Record<string, number>
resetRecalibration(): void
```

---

## Correlation Position Caps

**Source File:** `server/correlation-position-caps.ts`

### Correlation Groups

| Group | Symbols |
|-------|---------|
| mega_tech | AAPL, MSFT, GOOGL, AMZN, META, NVDA |
| semiconductor | AMD, INTC, NVDA, AVGO, QCOM, MU |
| ev_clean | TSLA, RIVN, LCID, NIO, PLUG, FCEL |
| fintech | SQ, PYPL, COIN, SOFI, AFRM |
| biotech | MRNA, BNTX, PFE, JNJ |
| energy | XOM, CVX, OXY, SLB |
| crypto | BTC, ETH, SOL, DOGE |
| meme | GME, AMC, BB |
| index | SPY, QQQ, IWM, DIA |

### Limits

| Parameter | Default |
|-----------|---------|
| Max positions per group | 3 |
| Max portfolio exposure per group | 25% |
| Max single position size | 10% |

### Validation

```typescript
checkCorrelationCaps(portfolioId, symbol, positionSize): CorrelationCheckResult
```

Returns `allowed: false` with reason if limits exceeded.

---

## Options Analysis

**Source File:** `server/deep-options-analyzer.ts`

### Greeks Analysis

| Greek | Formula | Interpretation |
|-------|---------|----------------|
| Delta | ∂V/∂S | Price sensitivity |
| Gamma | ∂²V/∂S² | Delta change rate |
| Theta | ∂V/∂t | Time decay |
| Vega | ∂V/∂σ | IV sensitivity |

### IV Percentile

```
IV_Percentile = (# days IV < current) / Total days × 100
```

| Percentile | Interpretation | Strategy |
|------------|----------------|----------|
| >80% | High IV | Sell premium |
| 20-80% | Normal IV | Direction plays |
| <20% | Low IV | Buy premium |

### Delta Targeting

```
For Lottos: Target 0.15-0.25 delta
For Swings: Target 0.40-0.60 delta
For Hedges: Target 0.70-0.90 delta
```

---

## Backtesting Service

**Source File:** `server/backtesting-service.ts`

### Methodology

1. Load historical price data for specified period
2. Apply strategy rules at each bar
3. Track hypothetical entries/exits
4. Calculate performance metrics

### Metrics Calculated

| Metric | Formula |
|--------|---------|
| Win Rate | Wins / Total Trades |
| Profit Factor | Gross Profit / Gross Loss |
| Max Drawdown | Max(Peak - Trough) / Peak |
| Sharpe | Annualized(Return / StdDev) |
| Average Win | Sum(Wins) / # Wins |
| Average Loss | Sum(Losses) / # Losses |
| Expectancy | (WinRate × AvgWin) - (LossRate × AvgLoss) |

---

## Orphaned/Underutilized Features

These features were built but may not be fully connected or utilized.

**Note:** Many modules appear orphaned in static analysis but are actually:
1. Dynamically imported via `await import('./module')` for lazy-loading
2. Used in scheduled tasks or cron jobs
3. Referenced by the frontend but not the server

### Confirmed Orphaned (No References Found)

| Module | Description | Recommendation |
|--------|-------------|----------------|
| `wallet-sync-service.ts` | External wallet syncing | Remove or integrate |
| `ct-ingestion-service.ts` | CT Tracker data ingestion | Remove or connect to scheduler |
| `api-retry.ts` | Generic API retry logic | Integrate into API calls or remove |

### Dynamically Imported (Lazy-Loaded)

These modules ARE used but are dynamically imported via `await import()`:

| Module | Import Location | Usage |
|--------|-----------------|-------|
| `auto-lotto-trader.ts` | index.ts, lotto-scanner.ts | Autonomous trading bot |
| `backtesting-service.ts` | routes.ts | Backtesting API endpoints |
| `ml-intelligence-service.ts` | routes.ts, auto-lotto-trader | ML predictions |
| `polymarket-service.ts` | index.ts, routes.ts | Prediction market scanning |
| `social-sentiment-scanner.ts` | routes.ts | Social sentiment analysis |
| `weekly-picks-generator.ts` | index.ts, routes.ts | Premium weekly picks |
| `deep-options-analyzer.ts` | Various | Deep options analysis |
| `breakout-scanner.ts` | Various | Breakout pattern detection |
| `penny-scanner.ts` | routes.ts, index.ts | Penny stock scanning |
| `pre-market-surge-detector.ts` | index.ts | Pre-market volume detection |

### Frontend-Connected Modules

| Module | Frontend Component | Purpose |
|--------|-------------------|---------|
| `watch-suggestions.ts` | `client/src/components/watch-suggestions.tsx` | AI watchlist suggestions |

### Potentially Underutilized

These modules exist but may need better integration:

| Module | Issue | Recommendation |
|--------|-------|----------------|
| `dynamic-signal-weights.ts` | Weight adaptation may not be running | Connect to scheduled updates |
| `expiry-pattern-service.ts` | Unclear bot connection | Verify integration with auto-lotto |
| `premium-tracking-service.ts` | UI display uncertain | Add dashboard widget |
| `performance-validation-service.ts` | May not be scheduled | Add to validation pipeline |
| `futures-research-service.ts` | Limited coverage | Expand futures support |
| `quant-mean-reversion-bot.ts` | Separate from auto-lotto | Consider consolidation |
| `scan-deduper.ts` | Utility functions available | Ensure called by scanners |
| `error-sanitizer.ts` | Error handling utility | Integrate into error middleware |

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
