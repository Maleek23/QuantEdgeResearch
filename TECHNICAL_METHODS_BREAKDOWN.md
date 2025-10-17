# QuantEdge Research - Technical Methods Breakdown

## 🔬 **QUANTITATIVE METHODS** (Rules-Based Engine)

### 1. **Momentum Detection**
**Method:** Price velocity analysis with volume confirmation
```
- Strong Momentum: |ΔP| ≥ 5% AND Volume Ratio ≥ 1.5x
- Moderate Momentum: |ΔP| ≥ 2% AND Volume Ratio ≥ 1.2x
- Weak Momentum: |ΔP| ≥ 1.5% AND Volume Ratio ≥ 1.0x
```
**Direction:** Bullish if ΔP > 0, Bearish if ΔP < 0

### 2. **Volume Spike Analysis**
**Method:** Statistical outlier detection
```
Volume Ratio = Current Volume / Average Volume

- Strong Signal: Volume Ratio ≥ 5x (institutional activity)
- Moderate Signal: Volume Ratio ≥ 3x (unusual activity)
- Threshold: Volume Ratio ≥ 1.2x minimum
```

### 3. **Breakout Pattern Recognition**
**Method:** 52-week high/low proximity analysis
```
Bullish Breakout:
  Current Price ≥ 0.98 × High52Week AND Volume Ratio ≥ 1.5x

Bearish Breakdown:
  Current Price ≤ 1.02 × Low52Week AND Volume Ratio ≥ 1.5x

Strength: Strong if Volume Ratio ≥ 2.5x, else Moderate
```

### 4. **Mean Reversion Signals**
**Method:** Extreme price deviation detection
```
Oversold (Long Setup):
  ΔP ≤ -7% → Strong reversal signal

Overbought (Short Setup):
  ΔP ≥ 7% (stocks only) → Moderate pullback signal
```

---

## 📊 **STATISTICAL METHODS**

### 1. **RSI (Relative Strength Index)** - Wilder's Algorithm
**Formula:**
```
Step 1: Calculate price changes
  Gains[i] = max(0, Price[i] - Price[i-1])
  Losses[i] = max(0, Price[i-1] - Price[i])

Step 2: Initial averages (14-period)
  AvgGain₀ = Σ(Gains[1:14]) / 14
  AvgLoss₀ = Σ(Losses[1:14]) / 14

Step 3: Wilder's Smoothing
  AvgGain[i] = (AvgGain[i-1] × 13 + Gains[i]) / 14
  AvgLoss[i] = (AvgLoss[i-1] × 13 + Losses[i]) / 14

Step 4: Calculate RSI
  RS = AvgGain / AvgLoss
  RSI = 100 - (100 / (1 + RS))
```

**Signal Thresholds:**
```
Strong Oversold: RSI ≤ 20 → Strong Long
Oversold: RSI ≤ 30 → Moderate Long
Neutral: 30 < RSI < 70 → No Signal
Overbought: RSI ≥ 70 → Moderate Short
Strong Overbought: RSI ≥ 80 → Strong Short
```

### 2. **MACD (Moving Average Convergence Divergence)**
**Formula:**
```
Step 1: Calculate EMAs
  EMA Multiplier = 2 / (Period + 1)
  
  EMA₀ = SMA(Period)
  EMA[i] = (Price[i] - EMA[i-1]) × Multiplier + EMA[i-1]

Step 2: Calculate MACD Line
  Fast EMA = EMA(12 periods)
  Slow EMA = EMA(26 periods)
  MACD Line = Fast EMA - Slow EMA

Step 3: Calculate Signal Line
  Signal Line = EMA(MACD Line, 9 periods)

Step 4: Calculate Histogram
  Histogram = MACD Line - Signal Line
```

**Signal Interpretation:**
```
Strong Bullish: |Histogram| > 0.5 AND Histogram > 0
Moderate Bullish: 0.1 < |Histogram| < 0.5 AND Histogram > 0
Crossover Zone: |Histogram| < 0.05 (imminent signal change)
Moderate Bearish: 0.1 < |Histogram| < 0.5 AND Histogram < 0
Strong Bearish: |Histogram| > 0.5 AND Histogram < 0
```

### 3. **SMA (Simple Moving Average)**
**Formula:**
```
SMA(n) = Σ(Prices[i-(n-1) : i]) / n

Used for:
- Daily Trend: SMA(5) vs SMA(10) on daily prices
- Weekly Trend: SMA(4) vs SMA(10) on weekly candles
```

### 4. **EMA (Exponential Moving Average)**
**Formula:**
```
Multiplier α = 2 / (Period + 1)
EMA₀ = SMA(Period)
EMA[t] = Price[t] × α + EMA[t-1] × (1 - α)

Gives more weight to recent prices (used in MACD calculation)
```

### 5. **Bollinger Bands**
**Formula:**
```
Middle Band = SMA(20)
Standard Deviation σ = √(Σ(Price - SMA)² / n)
Upper Band = SMA(20) + 2σ
Lower Band = SMA(20) - 2σ

Used for: Volatility analysis and reversal setups
```

### 6. **Multi-Timeframe Analysis**
**Method:** Trend concordance validation
```
Daily Trend:
  IF Current > SMA(5) AND SMA(5) > SMA(10) → Bullish
  IF Current < SMA(5) AND SMA(5) < SMA(10) → Bearish
  ELSE → Neutral

Weekly Trend (aggregated 5-day candles):
  IF Current > SMA(4 weeks) AND SMA(4) > SMA(10 weeks) → Bullish
  IF Current < SMA(4 weeks) AND SMA(4) < SMA(10 weeks) → Bearish
  ELSE → Neutral

Alignment Score:
  Strong: Daily = Weekly AND ≠ Neutral
  Moderate: One timeframe has conviction
  Weak: Both neutral or conflicting
```

---

## 💰 **FINANCIAL ENGINEERING METHODS**

### 1. **Risk/Reward Ratio Calculation**
**Formula:**
```
R:R Ratio = (Target Price - Entry Price) / (Entry Price - Stop Loss)

Minimum Threshold: 2:1 (earn $2 for every $1 risked)
Optimal: ≥ 3:1 (excellent trade setup)
```

### 2. **Options Strike Selection (Delta-Based)**
**Method:** Moneyness targeting via Tradier API
```
Target Delta Range: 0.30 - 0.40
- Delta = 0.35 ≈ 35% probability of expiring ITM
- Provides optimal balance between cost and leverage

Call Options: Selected when direction = 'long'
Put Options: Selected when direction = 'short'
```

### 3. **Options Expiration Distribution**
**Method:** Probabilistic time-decay modeling
```
Distribution Probabilities:
- 60% → This Friday (near-term theta decay)
- 30% → Next Friday (medium-term exposure)
- 10% → Two weeks out (longer-term positioning)

Constraint: All expirations must be Fridays (market standard)
Timezone: America/Chicago (market hours reference)
```

### 4. **Position Sizing (Kelly Criterion Derivative)**
**Formula:**
```
Risk Per Trade = Account Size × Risk Tolerance %
Position Size = Risk Amount / (Entry - Stop Loss)

Example:
  Account = $10,000
  Risk Tolerance = 2%
  Risk Amount = $200
  Trade: Entry $100, Stop $95
  Position Size = $200 / ($100 - $95) = 40 shares
```

### 5. **Entry/Target/Stop Logic**
**Dynamic Level Calculation by Signal Type:**
```
Momentum (Long):
  Entry = Current × 0.995 (pullback entry)
  Target = Current × 1.08 (8% gain)
  Stop = Current × 0.96 (4% risk)
  R:R = 2:1

Volume Spike (Long):
  Entry = Current
  Target = Current × 1.12 (12% gain)
  Stop = Current × 0.94 (6% risk)
  R:R = 2:1

Breakout (Long):
  Entry = Current × 1.005 (enter on strength)
  Target = Current × 1.15 (15% gain)
  Stop = Current × 0.96 (4% risk)
  R:R = 3.75:1

Mean Reversion (Long):
  Entry = Current × 0.99 (buy the dip)
  Target = Current × 1.15 (bounce target)
  Stop = Current × 0.92 (8% risk)
  R:R = 1.88:1

RSI Divergence (Long):
  Entry = Current × 0.995
  Target = Current × 1.12 (12% reversal)
  Stop = Current × 0.94 (6% risk)
  R:R = 2:1

MACD Crossover (Long):
  Entry = Current
  Target = Current × 1.1 (10% trend)
  Stop = Current × 0.95 (5% risk)
  R:R = 2:1
```

### 6. **Asset Allocation Algorithm**
**Method:** Quota-enforced portfolio construction
```
Target Distribution:
  Stock Shares: 3 ideas (37.5%)
  Stock Options: 3 ideas (37.5%)
  Crypto: 2 ideas (25%)

Interleaved Priority Sorting:
  Pattern: Stock, Stock, Crypto, Option, Option, Stock, Crypto, Option
  
Shortfall-Based Logic:
  Current = [Stocks: 1, Options: 0, Crypto: 0]
  Shortage = [Stocks: 2, Options: 3, Crypto: 2]
  Next Priority = Options (largest shortage: 3)

Hard Quota Enforcement:
  IF Stock Count = 3 → Reject new stock candidates
  IF Option Count = 3 → Reject new option candidates
  IF Crypto Count = 2 → Reject new crypto candidates
```

---

## 🤖 **AI METHODS**

### 1. **Multi-Provider Ensemble**
**Architecture:** Parallel inference with diversity maximization
```
Providers:
1. OpenAI GPT-5 (Latest model as of August 2025)
2. Anthropic Claude Sonnet 4 (Model: claude-sonnet-4-20250514)
3. Google Gemini 2.5 Pro

Execution: Promise.all() for concurrent API calls
Aggregation: Combine all responses → diverse perspectives
```

### 2. **Structured JSON Output**
**Method:** Schema-constrained generation
```json
{
  "ideas": [
    {
      "symbol": "AAPL",
      "assetType": "stock|option|crypto",
      "direction": "long|short",
      "entryPrice": 150.00,
      "targetPrice": 165.00,
      "stopLoss": 145.00,
      "catalyst": "Q4 earnings beat with 15% revenue growth",
      "analysis": "Technical and fundamental analysis...",
      "sessionContext": "Pre-market | Market Open | After Hours",
      "expiryDate": "2025-11-21" // options only
    }
  ]
}
```

### 3. **Conversational RAG (QuantAI Bot)**
**Method:** Multi-turn dialogue with market context
```
Architecture:
- System Prompt: Define role as quantitative analyst
- Context Injection: Current market conditions, user portfolio
- Memory: Persistent chat history (localStorage)
- Fallback Chain: Anthropic → OpenAI → Gemini (reliability)

Prompt Engineering:
- Few-shot examples for trade analysis
- Chain-of-thought reasoning for complex questions
- Structured output for actionable recommendations
```

### 4. **Error Handling & Fallback**
**Method:** Graceful degradation
```
Try Provider 1 (Anthropic)
  → Success: Return ideas
  → Fail: Try Provider 2 (OpenAI)
    → Success: Return ideas
    → Fail: Try Provider 3 (Gemini)
      → Success: Return ideas
      → Fail: Return empty array (safe failure)
```

---

## 🎯 **COMPOSITE SCORING SYSTEM**

### **Confidence Score Calculation (0-100 points)**
**Multi-Factor Model:**
```
Total Score = R:R Score + Volume Score + Signal Score + 
              Price Action + Liquidity + Indicator Bonus + 
              Timeframe Bonus + Momentum Bonus

1. Risk/Reward (0-25 points):
   - R:R ≥ 3:1 → 25 pts
   - R:R ≥ 2:1 → 20 pts
   - R:R ≥ 1.5:1 → 10 pts

2. Volume Confirmation (0-25 points):
   - Volume ≥ 3x → 25 pts
   - Volume ≥ 2x → 20 pts
   - Volume ≥ 1.5x → 15 pts
   - Volume ≥ 1.2x → 5 pts

3. Signal Strength (0-20 points):
   - Strong → 20 pts
   - Moderate → 15 pts
   - Weak → 10 pts

4. Price Action Quality (0-15 points):
   - Breakout + ΔP ≥ 3% → 15 pts
   - Momentum + ΔP ≥ 5% → 15 pts
   - Volume Spike ≥ 5x → 15 pts
   - Generic ΔP ≥ 3% → 10 pts

5. Liquidity Factor (0-15 points):
   - Price ≥ $10 → 15 pts
   - Price ≥ $5 → 10 pts
   - Price < $5 → 0 pts (penny stock penalty)

6. RSI/MACD Indicator Bonus (0-10 points):
   - RSI Divergence detected → +10 pts
   - MACD Crossover detected → +10 pts

7. Multi-Timeframe Alignment (0-15 points):
   - Aligned + Strong → 15 pts
   - Aligned → 10 pts
   - Partial Support → 5 pts

8. Bearish Momentum Bonus (0-20 points):
   - ΔP ≤ -3% (short direction) → 20 pts
   - ΔP ≤ -2% (short direction) → 15 pts
   - ΔP ≤ -1.5% (short direction) → 10 pts

Maximum Score: 100 (capped)
```

### **Probability Band Mapping**
```
Score → Grade → Win Probability
95-100 → A+ → 95-100%
90-94  → A  → 90-94%
85-89  → A- → 85-89%
80-84  → B+ → 80-84%
75-79  → B  → 75-79%
70-74  → B- → 70-74%
67-69  → C+ → 67-69%
65-66  → C  → 65-66%
<65    → C- → <65%

Minimum Threshold: 65% (C- grade)
```

---

## 📐 **DATA QUALITY VALIDATION**

### **Fail-Safe Architecture**
```
IF Historical Prices = Empty:
  REJECT Candidate (no synthetic fallback)
  LOG: "⚠️ {Symbol}: Skipped - no historical data available"
  INCREMENT: dataQuality.noHistoricalData

IF Signal = Null:
  REJECT Candidate
  INCREMENT: dataQuality.noSignal

IF Confidence < 65% OR R:R < 2:1 OR Volume < 1.0x:
  REJECT Candidate
  INCREMENT: dataQuality.lowQuality

IF Quota Full:
  REJECT Candidate
  INCREMENT: dataQuality.quotaFull
```

---

## 📊 **SUMMARY STATISTICS**

**Methods Implemented:**
- 7 Quantitative Signal Types
- 6 Statistical Indicators (RSI, MACD, SMA, EMA, Bollinger Bands, MTF Analysis)
- 6 Financial Engineering Models (R:R, Options Pricing, Position Sizing, Entry/Stop/Target, Asset Allocation, Expiration Distribution)
- 4 AI Techniques (Multi-provider ensemble, Structured output, RAG chatbot, Fallback chains)
- 8-Factor Composite Scoring System
- 9-Grade Probability Band Classification

**Quality Metrics:**
- Minimum R:R Ratio: 2:1
- Minimum Confidence: 65%
- Minimum Volume Confirmation: 1.0x average
- Target Pass Rate: ~40% (strict filtering)
- Data Integrity: 100% real data (zero synthetic fallback)
