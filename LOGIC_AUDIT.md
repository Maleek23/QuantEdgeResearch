# QuantEdge Universal Analysis Engine - Logic Audit

## 🚨 Problem Statement

**CURRENT STATE (BROKEN):**
```
Trade Desk      → Uses confidenceScore (existing grading)
Research Hub    → No scoring (just runs agents)
Stock Detail    → Uses fundamentalScore + technicalScore
Home            → Shows bot activity (different metrics)
Chart Analysis  → Technical patterns only
Discover        → ???
```

**Each page has DIFFERENT logic. This is WRONG.**

---

## ✅ Solution: Universal Analysis Engine

**ONE SINGLE SOURCE OF TRUTH for all stock analysis**

### Architecture
```
┌─────────────────────────────────────────────────┐
│         Universal Analysis Engine               │
│                                                  │
│  Input: Stock Symbol                            │
│  Output: Unified Score Object                   │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │  7-Dimensional Scoring System            │  │
│  │  ─────────────────────────────────────   │  │
│  │  1. Technical (25%)                      │  │
│  │  2. Fundamental (30%)                    │  │
│  │  3. Quantitative (15%)                   │  │
│  │  4. ML Predictions (10%)                 │  │
│  │  5. Order Flow (15%)                     │  │
│  │  6. Sentiment (10%)                      │  │
│  │  7. Catalysts (5%)                       │  │
│  └──────────────────────────────────────────┘  │
│                                                  │
│  Returns:                                        │
│  {                                               │
│    symbol: "AAPL",                              │
│    overallGrade: "A+",                          │
│    overallScore: 92,                            │
│    components: {                                │
│      technical: { score: 88, grade: "A" },     │
│      fundamental: { score: 94, grade: "A+" },  │
│      quantitative: { score: 85, grade: "A" },  │
│      ml: { score: 78, grade: "B+" },           │
│      orderFlow: { score: 90, grade: "A+" },    │
│      sentiment: { score: 85, grade: "A" },     │
│      catalysts: { score: 70, grade: "B" }      │
│    },                                            │
│    recommendation: "BUY",                       │
│    confidence: "HIGH",                          │
│    timeHorizon: "SWING",  // or DAY, LONG      │
│    generatedAt: "2026-01-25T13:30:00Z"         │
│  }                                               │
└─────────────────────────────────────────────────┘
```

---

## 📐 Page-Specific Consumption

### All pages consume THE SAME analysis, filtered by context:

```typescript
// Trade Desk (Swing Trading Focus)
const analysis = await UniversalEngine.analyze("AAPL", {
  timeHorizon: "SWING",
  minScore: 70,
  focus: ["technical", "orderFlow", "catalysts"]
});

// Research Hub (Comprehensive)
const analysis = await UniversalEngine.analyze("AAPL", {
  timeHorizon: "ANY",
  minScore: 0,
  focus: "ALL" // All 7 dimensions
});

// Stock Detail (Full Breakdown)
const analysis = await UniversalEngine.analyze("AAPL", {
  timeHorizon: "ANY",
  includeBreakdown: true,
  includeHistorical: true
});

// Discover (Screening)
const batch = await UniversalEngine.batchAnalyze(["AAPL", "MSFT", "GOOGL"], {
  timeHorizon: "LONG",
  minScore: 80
});
```

---

## 🔍 Logic Audit System

### Every Analysis is Logged and Auditable

```typescript
interface AnalysisAudit {
  id: string;
  symbol: string;
  timestamp: string;
  engine: "UniversalEngine_v1.0";

  // Input Parameters
  params: {
    timeHorizon: "DAY" | "SWING" | "LONG";
    focus?: string[];
    minScore?: number;
  };

  // Data Sources Used
  dataSources: {
    technical: { provider: "TradingView", timestamp: string, cached: boolean };
    fundamental: { provider: "AlphaVantage", timestamp: string, cached: boolean };
    orderFlow: { provider: "UnusualWhales", timestamp: string, cached: boolean };
    // ... etc
  };

  // Calculation Steps (for reproducibility)
  calculations: {
    technicalScore: {
      rawInputs: { rsi: 58, macd: "bullish", sma200: "above" },
      formula: "technicalScore = (rsi/100 * 0.3) + (macd * 0.4) + (sma * 0.3)",
      result: 88
    },
    fundamentalScore: {
      rawInputs: { pe: 28.5, roe: 147, debtToEquity: 1.73 },
      formula: "fundamentalScore = profitability*0.35 + valuation*0.25 + ...",
      result: 94
    },
    // ... etc for all 7 dimensions
  };

  // Final Output
  output: {
    overallScore: 92,
    overallGrade: "A+",
    recommendation: "BUY",
    confidence: "HIGH"
  };

  // Metadata
  version: "1.0.0",
  consumedBy: "TradeDeskPage" | "ResearchHub" | "StockDetail" | etc
}
```

### Audit Endpoints

```typescript
// Verify Analysis Integrity
GET /api/audit/analysis/:id
// Returns full audit trail for a specific analysis

// Compare Two Analyses (same stock, different times)
GET /api/audit/compare/:symbol?from=2026-01-20&to=2026-01-25
// Shows how score changed and why

// Logic Consistency Check
GET /api/audit/consistency-check
// Verifies all pages use same engine version

// Data Source Health
GET /api/audit/data-sources
// Shows which APIs are working, cache hit rates, etc
```

---

## 🏗️ File Structure

### Server-Side (Single Source of Truth)

```
server/
├── universal-analysis-engine.ts       ← MAIN ENGINE
├── scoring/
│   ├── technical-scorer.ts            ← Technical analysis (25%)
│   ├── fundamental-scorer.ts          ← Fundamental analysis (30%)
│   ├── quantitative-scorer.ts         ← Quant metrics (15%)
│   ├── ml-scorer.ts                   ← ML predictions (10%)
│   ├── order-flow-scorer.ts           ← Smart money (15%)
│   ├── sentiment-scorer.ts            ← News/social (10%)
│   └── catalysts-scorer.ts            ← Events (5%)
├── audit/
│   ├── analysis-logger.ts             ← Logs every analysis
│   ├── consistency-checker.ts         ← Verifies logic consistency
│   └── data-source-monitor.ts         ← Tracks API health
└── cache/
    └── analysis-cache.ts              ← Redis cache (5min TTL)
```

### Client-Side (Consumption Layer)

```
client/src/
├── hooks/
│   ├── useStockAnalysis.ts            ← Main hook (calls engine)
│   ├── useSwingAnalysis.ts            ← Filters for swing trading
│   ├── useLongTermAnalysis.ts         ← Filters for investing
│   └── useTechnicalOnly.ts            ← Technical focus only
└── services/
    └── analysis-service.ts            ← API client wrapper
```

---

## 📊 Unified API Response Format

**Every endpoint returns the SAME structure:**

```typescript
interface UnifiedAnalysisResponse {
  // Meta
  symbol: string;
  name: string;
  assetType: "stock" | "crypto" | "etf" | "forex";
  timestamp: string;
  auditId: string;  // For traceability

  // Overall Score
  overall: {
    grade: "S" | "A+" | "A" | "A-" | ... | "F";
    score: number;  // 0-100
    tier: "S" | "A" | "B" | "C" | "D" | "F";
    recommendation: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
    confidence: "HIGH" | "MEDIUM" | "LOW";
  };

  // Component Scores (All 7 Dimensions)
  components: {
    technical: ComponentScore;
    fundamental: ComponentScore;
    quantitative: ComponentScore;
    ml: ComponentScore;
    orderFlow: ComponentScore;
    sentiment: ComponentScore;
    catalysts: ComponentScore;
  };

  // Time Horizon Specific
  timeHorizons: {
    day: {
      signal: "BUY" | "SELL" | "WAIT";
      confidence: number;
      entry?: number;
      exit?: number;
    };
    swing: {
      signal: "BUY" | "SELL" | "WAIT";
      confidence: number;
      entry?: number;
      exit?: number;
      timeframe: "3-15 days";
    };
    long: {
      signal: "BUY" | "SELL" | "WAIT";
      confidence: number;
      targetPrice?: number;
      timeframe: "3-12 months";
    };
  };

  // Strengths & Weaknesses (same across all pages)
  insights: {
    strengths: string[];
    weaknesses: string[];
    catalysts: string[];
    risks: string[];
  };
}

interface ComponentScore {
  score: number;  // 0-100
  grade: string;  // S, A+, A, etc.
  weight: number; // 0.25, 0.30, etc.
  breakdown: {
    category: string;
    value: number | string;
    interpretation: string;
  }[];
}
```

---

## 🎯 Page Differentiation

### Home Page (Landing/Marketing)
**Purpose:** First impression, quick overview, CTA

**Content:**
- Hero with QuantEdge branding
- Feature highlights (AI-powered, multi-dimensional, etc.)
- Market indices (SPY, QQQ, DIA, IWM)
- Top movers (today's winners/losers)
- Bot activity status
- CTA buttons → "View AI Trade Ideas", "Start Research"

**Analysis:** None (just displays aggregated metrics)

---

### Research Hub (Deep Analysis)
**Purpose:** Run comprehensive analysis on ANY stock

**Content:**
- Universal search (stocks, crypto, forex, ETFs)
- Agent selection (Swing Trade, Fundamental, Technical, News, etc.)
- Research history (past analyses)
- Full 7-dimensional breakdown
- Exportable reports

**Analysis:** Full Universal Engine (all 7 dimensions)

**Flow:**
1. User searches "AAPL"
2. User selects "Fundamental Analyst" agent
3. System calls `UniversalEngine.analyze("AAPL", { focus: ["fundamental"] })`
4. Display full fundamental breakdown
5. Save to research history

---

### Trade Desk (Action-Oriented)
**Purpose:** Find tradeable setups NOW

**Content:**
- Active trade ideas (from all 6 bots)
- Filtered by score (70+ only)
- Time horizon: Swing (3-15 days)
- Entry/exit levels
- Live updates (WebSocket)

**Analysis:** Universal Engine filtered for swing trading

**Flow:**
1. System continuously runs `UniversalEngine.batchAnalyze(watchlist, { timeHorizon: "SWING", minScore: 70 })`
2. Bot engines add their own signals
3. Trade Desk displays unified results
4. User can click to see full analysis

---

### Stock Detail (Comprehensive View)
**Purpose:** Everything about ONE stock

**Content:**
- Large animated grade card
- All 7 dimensions displayed
- Historical performance
- News feed
- Technical charts
- Fundamentals table

**Analysis:** Full Universal Engine with historical data

---

### Chart Analysis (Visual Focus)
**Purpose:** Chart patterns and technicals

**Content:**
- TradingView chart
- Technical indicators
- Pattern recognition
- Support/resistance levels

**Analysis:** Universal Engine (technical dimension only)

---

### Discover (Screener)
**Purpose:** Find stocks matching criteria

**Content:**
- Filters (score > 80, sector = Tech, etc.)
- Batch analysis of 100+ stocks
- Sortable results

**Analysis:** Universal Engine batch mode

---

## 🔐 Logic Consistency Rules

### RULE 1: Single Engine
✅ **CORRECT:**
```typescript
// Trade Desk
const analysis = await UniversalEngine.analyze("AAPL", { timeHorizon: "SWING" });
display(analysis.timeHorizons.swing);

// Research Hub
const analysis = await UniversalEngine.analyze("AAPL", { focus: "ALL" });
display(analysis);

// Stock Detail
const analysis = await UniversalEngine.analyze("AAPL", { includeBreakdown: true });
display(analysis);
```

❌ **WRONG:**
```typescript
// Trade Desk
const analysis = await TradeDeskScorer.score("AAPL"); // ❌ DIFFERENT ENGINE

// Research Hub
const analysis = await ResearchEngine.analyze("AAPL"); // ❌ DIFFERENT ENGINE
```

---

### RULE 2: Same Weights
✅ **CORRECT:**
```typescript
const WEIGHTS = {
  technical: 0.25,
  fundamental: 0.30,
  quantitative: 0.15,
  ml: 0.10,
  orderFlow: 0.15,
  sentiment: 0.10,
  catalysts: 0.05
};
// Used EVERYWHERE
```

❌ **WRONG:**
```typescript
// Trade Desk uses different weights
const TRADE_WEIGHTS = { technical: 0.50, fundamental: 0.50 }; // ❌
```

---

### RULE 3: Same Formulas
✅ **CORRECT:**
```typescript
function scoreROE(roe: number): number {
  if (roe >= 25) return 100;
  if (roe >= 20) return 90;
  if (roe >= 15) return 80;
  // ... same everywhere
}
```

❌ **WRONG:**
```typescript
// Trade Desk
function scoreROE(roe: number) { return roe > 15 ? 100 : 50; } // ❌ DIFFERENT

// Research Hub
function scoreROE(roe: number) { return roe * 5; } // ❌ DIFFERENT
```

---

### RULE 4: Audit Every Call
✅ **CORRECT:**
```typescript
const analysis = await UniversalEngine.analyze("AAPL");
await AuditLogger.log({
  symbol: "AAPL",
  consumedBy: "TradeDeskPage",
  analysis: analysis,
  auditId: analysis.auditId
});
```

---

## 🧪 Testing & Validation

### Consistency Tests

```typescript
describe("Logic Consistency", () => {
  it("should return same score for same symbol across pages", async () => {
    const tradeDeskAnalysis = await UniversalEngine.analyze("AAPL", { timeHorizon: "SWING" });
    const researchAnalysis = await UniversalEngine.analyze("AAPL", { focus: "ALL" });
    const stockDetailAnalysis = await UniversalEngine.analyze("AAPL");

    // Overall score should be IDENTICAL
    expect(tradeDeskAnalysis.overall.score).toBe(researchAnalysis.overall.score);
    expect(researchAnalysis.overall.score).toBe(stockDetailAnalysis.overall.score);
  });

  it("should use same weights everywhere", () => {
    const weights1 = TechnicalScorer.getWeights();
    const weights2 = UniversalEngine.getWeights();

    expect(weights1).toEqual(weights2);
  });
});
```

---

## 📈 Migration Plan

### Phase 1: Create Universal Engine (Week 1)
- [ ] Build `universal-analysis-engine.ts`
- [ ] Consolidate all scoring logic
- [ ] Set up audit logging
- [ ] Create unified API endpoint: `GET /api/analyze/:symbol`

### Phase 2: Migrate Pages (Week 2)
- [ ] Update Trade Desk to use Universal Engine
- [ ] Update Research Hub to use Universal Engine
- [ ] Update Stock Detail to use Universal Engine
- [ ] Update Discover to use Universal Engine
- [ ] Update Chart Analysis to use Universal Engine

### Phase 3: Differentiate Pages (Week 3)
- [ ] Redesign Home (landing/marketing only)
- [ ] Enhance Research Hub (full analysis + history)
- [ ] Keep Trade Desk action-oriented
- [ ] Add batch mode to Discover

### Phase 4: Audit & Validate (Week 4)
- [ ] Run consistency tests
- [ ] Verify all pages use same engine
- [ ] Check audit logs
- [ ] Performance optimization

---

## ✅ Success Criteria

1. **Single Source of Truth**: All analysis comes from `UniversalEngine`
2. **Reproducible**: Same symbol + same params = same result
3. **Auditable**: Every analysis logged with full trail
4. **Consistent**: All pages show same overall score
5. **Fast**: < 500ms for cached, < 2s for fresh

---

Ready to implement? Let's start with the Universal Engine!
