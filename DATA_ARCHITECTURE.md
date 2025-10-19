# QuantEdge Data Architecture & Integrity

## Overview
This document explains how QuantEdge ensures data consistency and integrity across all analysis systems (Performance Tracking, Signal Intelligence ML, and Trade Ideas).

## Core Data Model

### Single Source of Truth: `trade_ideas` Table
All trade data, performance metrics, and ML training data comes from ONE PostgreSQL table: `trade_ideas`

**Key Fields for Analysis:**
```typescript
// Trade Identification
id: varchar (UUID)
symbol: text
assetType: 'stock' | 'option' | 'crypto'
source: 'ai' | 'quant' | 'manual'

// Entry Data
entryPrice: real
targetPrice: real
stopLoss: real
direction: 'long' | 'short'
timestamp: text (ISO 8601)

// Quality Signals (ML Features)
qualitySignals: text[] (array of signals like 'high_rr', 'momentum', etc.)
confidenceScore: integer (0-100)
confidenceGrade: 'A+' | 'A' | 'B' | 'C'

// Outcome Tracking (Performance Data)
outcomeStatus: 'open' | 'hit_target' | 'hit_stop' | 'expired' | 'manual_exit'
exitPrice: real (actual exit price)
exitDate: text (ISO 8601)
realizedPnL: real (profit/loss in dollars)
percentGain: real (actual % gain/loss)
actualHoldingTimeMinutes: integer
resolutionReason: 'auto_validated' | 'manual'
validatedAt: text (last validation check timestamp)
```

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                        │
│                      trade_ideas TABLE                        │
│  (Single Source of Truth for ALL systems)                    │
└────────────────────┬────────────────────────┬─────────────────┘
                     │                        │
                     │                        │
        ┌────────────▼─────────┐  ┌──────────▼──────────────┐
        │  Performance System  │  │  ML Signal Intelligence │
        │                      │  │                         │
        │  Queries:            │  │  Queries:               │
        │  - getPerformanceStats│  │  - getPerformanceStats  │
        │  - getAllTradeIdeas   │  │  - getAllTradeIdeas     │
        │                      │  │                         │
        │  Filters:            │  │  Filters:               │
        │  outcomeStatus !== 'open'│  outcomeStatus !== 'open'│
        │                      │  │                         │
        │  Displays:           │  │  Analyzes:              │
        │  - Win Rate          │  │  - Signal Effectiveness │
        │  - Avg % Gain        │  │  - Pattern Learning     │
        │  - Total P&L         │  │  - Optimal Time Windows │
        │  - Breakdowns        │  │  - Reliability Scores   │
        └──────────────────────┘  └─────────────────────────┘
```

## Data Integrity Guarantees

### 1. Write Operations
**Trade Creation:**
- `POST /api/trade-ideas` → `storage.createTradeIdea()`
- Sets `outcomeStatus = 'open'` by default
- All trades start identical regardless of source (AI/Quant/Manual)

**Outcome Updates:**
- `PATCH /api/trade-ideas/:id/performance` → `storage.updateTradeIdeaPerformance()`
- Atomically updates: `outcomeStatus`, `exitPrice`, `percentGain`, `realizedPnL`, `exitDate`, `actualHoldingTimeMinutes`
- Used by both auto-validation AND manual outcome recording

**Auto-Validation:**
- `POST /api/performance/validate`
- Checks all OPEN trades against current prices
- Closes trades that hit target/stop using same `updateTradeIdeaPerformance()` method
- Updates `validatedAt` timestamp for audit trail

### 2. Read Operations
**Performance Tracking:**
```typescript
// server/routes.ts - Line ~1314
const stats = await storage.getPerformanceStats();
const allIdeas = await storage.getAllTradeIdeas();
const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
```

**Signal Intelligence ML:**
```typescript
// server/routes.ts - Line ~1314
const stats = await storage.getPerformanceStats();
const allIdeas = await storage.getAllTradeIdeas();
const closedIdeas = allIdeas.filter(i => i.outcomeStatus !== 'open');
```

**IDENTICAL QUERIES** → Both systems see exactly the same data.

### 3. ML Training Data Safeguards

**Minimum Data Requirement:**
- ML requires 10+ closed trades before training
- Prevents learning from statistical noise
- Guards in: `/api/ml/signal-intelligence`, `/api/ml/learned-patterns`

**Data Quality Filters:**
```typescript
// Only use complete records for ML
const closedIdeas = allIdeas.filter(i => 
  i.outcomeStatus !== 'open' && 
  i.percentGain !== null
);
```

**Sample Size Weighting:**
```typescript
// Reliability score accounts for sample size
const sampleSizeWeight = Math.min(signalStat.totalIdeas / 20, 1.0);
const reliabilityScore = signalStat.winRate * sampleSizeWeight;
```

## Data Consistency Verification

### Automated Checks
The platform includes a data integrity verification endpoint that cross-checks:

1. **Count Consistency:** Performance stats match raw database counts
2. **Win Rate Consistency:** Calculated win rates match between systems
3. **No Orphaned Data:** All closed trades have required outcome fields populated
4. **Timestamp Integrity:** Exit dates are valid and after entry timestamps

**Verification Endpoint:**
```typescript
GET /api/admin/verify-data-integrity

Returns:
{
  "status": "ok" | "warning" | "error",
  "checks": {
    "totalTradeCount": { match: boolean, expected: number, actual: number },
    "closedTradeCount": { match: boolean, expected: number, actual: number },
    "winRateConsistency": { match: boolean, perfWinRate: number, rawWinRate: number },
    "missingOutcomeData": { count: number, ids: string[] }
  },
  "timestamp": "ISO 8601"
}
```

### Manual Verification Steps
1. Navigate to `/admin` panel
2. Click "Verify Data Integrity" button
3. Review consistency report
4. Export data to CSV for external validation if needed

## Best Practices

### For Developers

1. **Never bypass storage layer:** Always use `storage.*` methods, never direct SQL
2. **Atomic updates:** Use `updateTradeIdeaPerformance()` for outcome changes
3. **Consistent filters:** Always filter closed trades with `outcomeStatus !== 'open'`
4. **Preserve historical data:** Never delete trades with outcomes (see `/api/admin/clear-test-data`)

### For Data Analysis

1. **Check data sufficiency:** Verify 10+ closed trades before trusting ML insights
2. **Cross-validate:** Compare Performance page stats with Signal Intelligence
3. **Monitor validation:** Check `validatedAt` timestamps to ensure auto-validation is running
4. **Export regularly:** Use CSV export to backup performance data

### For System Operations

1. **Database backups:** PostgreSQL handles persistence, ensure Replit backups enabled
2. **Validation schedule:** Auto-validation runs on-demand, consider scheduling
3. **Clean old data:** Use admin panel "Clear Test Data" to remove stale OPEN trades (preserves all outcomes)

## Database Schema Reference

**Table:** `trade_ideas`
**Location:** `shared/schema.ts`
**ORM:** Drizzle ORM
**Database:** PostgreSQL (Neon-backed)

**Critical Constraint:** `outcomeStatus` determines if a trade is included in analysis
- `'open'` → Excluded from Performance/ML (active trade)
- `'hit_target' | 'hit_stop' | 'expired' | 'manual_exit'` → Included in analysis (closed trade)

## Troubleshooting

### Performance stats don't match Signal Intelligence
**Likely Cause:** Cached query data on frontend
**Solution:** Hard refresh browser (Ctrl+Shift+R) or run data integrity verification

### ML shows "Insufficient Data" despite closed trades
**Likely Cause:** Trades missing `percentGain` field
**Solution:** Check data integrity, ensure auto-validation is populating all outcome fields

### Win rate seems incorrect
**Likely Cause:** Inconsistent `outcomeStatus` values or incomplete outcome data
**Solution:** Run `/api/admin/verify-data-integrity` and fix any flagged issues

## Future Enhancements

- **Scheduled Auto-Validation:** Run validation every 5-15 minutes automatically
- **Real-time Data Streaming:** WebSocket updates when trades close
- **Advanced ML Features:** Correlation analysis, regime detection, ensemble methods
- **Audit Logging:** Track all data modifications with timestamps and reasons
- **Data Quality Dashboard:** Visualize data completeness and consistency metrics
