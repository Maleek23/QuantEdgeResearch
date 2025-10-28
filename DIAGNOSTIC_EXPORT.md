# Diagnostic Data Export for LLM Analysis

## Overview

The diagnostic export system generates comprehensive JSON reports for LLM analysis to identify performance bottlenecks, technical issues, system faults, and data quality problems.

## Endpoint

```
GET /api/admin/diagnostic-export
```

**Authentication:** Requires admin access token

## Query Parameters

- `daysBack` (optional, default: 30) - Number of days of historical data to include
- `includeRawData` (optional, default: false) - Include full raw trade data (increases file size significantly)

## Usage Examples

### Basic Export (Last 30 days, no raw data)
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "http://localhost:5000/api/admin/diagnostic-export" \
  -o diagnostic-export.json
```

### Extended Export (Last 90 days with raw data)
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "http://localhost:5000/api/admin/diagnostic-export?daysBack=90&includeRawData=true" \
  -o diagnostic-full-export.json
```

## Export Structure

The export contains four main sections:

### 1. Performance Analysis
Comprehensive trade outcome analysis including:

- **Overall Metrics:**
  - Total trades, win rate, profit factor
  - Max drawdown, average holding time
  - Risk/reward ratios

- **Signal Type Metrics:**
  - Win rates by signal type (RSI, VWAP, Volume Spike, etc.)
  - Average returns per signal
  - Confidence score effectiveness per signal
  - Success rates by confidence range

- **Asset Type Breakdown:**
  - Performance by asset type (stock, crypto, option)
  - Win rates and average returns
  - Risk/reward metrics

- **Market Condition Analysis:**
  - Performance in different volatility regimes
  - Win rates across market conditions

- **Engine Version Tracking:**
  - Performance by quant engine version
  - Historical progression of win rates
  - Version deployment timeline

- **Time of Day Analysis:**
  - Win rates by hour (Eastern Time)
  - Optimal trading windows

- **Confidence Score Calibration:**
  - Expected vs actual win rates by confidence range
  - Accuracy deltas (over/under-confidence detection)

- **Raw Trade Data (if includeRawData=true):**
  - Complete trade records with validation errors
  - Entry/exit prices, timestamps
  - Full metadata for ML training

### 2. Technical Issues
API reliability and system health diagnostics:

- **API Reliability:**
  - Success rates by provider (Yahoo Finance, CoinGecko, Alpha Vantage, Tradier)
  - Average response times
  - Recent failure logs
  - Rate limit warnings

- **Data Staleness Concerns:**
  - Outdated cache entries
  - Missing updates

- **Signal Calculation Issues:**
  - Computation errors
  - Anomalous readings

### 3. System Faults
Internal system integrity issues:

- **Confidence Scoring Issues:**
  - Trades where confidence score didn't match outcome
  - High-confidence losers (90%+ confidence but hit stop)
  - Low-confidence big winners (anomalies)

- **Data Integrity Violations:**
  - Logic errors (LONG trades with target below entry)
  - Invalid risk/reward ratios
  - Stop loss configuration errors

- **System Alerts:**
  - Recent error/warning/critical alerts
  - Unresolved issues
  - Alert categorization

### 4. Data Quality
Cross-validation and consistency checks:

- **Cross-Source Validation:**
  - Price discrepancies between providers
  - Data consistency issues

- **Missing Data:**
  - Trades missing exit prices
  - Incomplete outcome data
  - Impact assessment

- **Signal Generation Inconsistencies:**
  - Expected vs actual signals
  - Detection failures

- **Outcome Validation Issues:**
  - Outcome status conflicts with price movement
  - Winner marked but price went down (and vice versa)

## Analysis Use Cases

### 1. Win Rate Improvement
**LLM Analysis Focus:**
- Compare signal type win rates to identify underperformers
- Analyze engine version progression
- Identify optimal confidence score thresholds
- Find best time-of-day trading windows

**Example Prompt:**
```
Analyze the Performance Analysis section. Which signals have <60% win rate? 
Are there specific market conditions where the engine underperforms? 
What confidence score ranges show the largest accuracy deltas?
```

### 2. API Reliability Monitoring
**LLM Analysis Focus:**
- Identify failing or slow API providers
- Detect rate limiting issues
- Find data quality gaps

**Example Prompt:**
```
Review the Technical Issues section. Which APIs have <95% success rate? 
Are there specific symbols or times when API failures spike? 
Should we add fallback providers?
```

### 3. Data Integrity Audit
**LLM Analysis Focus:**
- Find logic errors in trade setup
- Identify miscalibrated confidence scores
- Detect outcome validation failures

**Example Prompt:**
```
Examine System Faults and Data Quality sections. What are the most common 
data integrity violations? Are confidence scores consistently over/under-confident?
List all trades where outcome status conflicts with actual price movement.
```

### 4. Engine Calibration
**LLM Analysis Focus:**
- Compare expected vs actual confidence score performance
- Identify signals that need weight adjustments
- Find asset types that need different parameters

**Example Prompt:**
```
Analyze Confidence Score Effectiveness. Which confidence ranges are most 
miscalibrated? Should we adjust signal weights based on actual performance?
Compare crypto vs stock vs options performance - do stop losses need asset-specific tuning?
```

## File Size Considerations

- **Without raw data (includeRawData=false):** ~100-500KB for 30 days
- **With raw data (includeRawData=true):** ~1-5MB for 30 days depending on trade volume

For LLM analysis, raw data is optional. Summary metrics are usually sufficient for identifying issues and trends.

## Automation

You can automate regular exports using cron:

```bash
#!/bin/bash
# Export diagnostics daily at 2 AM
0 2 * * * curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  "http://localhost:5000/api/admin/diagnostic-export" \
  -o /backups/diagnostic-$(date +\%Y\%m\%d).json
```

## Best Practices

1. **Regular Exports:** Generate weekly exports to track trends over time
2. **Compare Versions:** Export before/after engine updates to measure impact
3. **Targeted Analysis:** Use shorter time ranges (7-14 days) for recent issue diagnosis
4. **Full Exports:** Use longer ranges (90+ days) with raw data for ML model training
5. **LLM Context:** Feed the export to Claude/GPT-4 with specific analysis questions

## Sample Analysis Workflow

1. **Export Data:**
   ```bash
   curl -H "Authorization: Bearer TOKEN" \
     "http://localhost:5000/api/admin/diagnostic-export?daysBack=30" \
     -o export.json
   ```

2. **Send to LLM:** Upload export.json to Claude/GPT-4

3. **Ask Targeted Questions:**
   - "What's causing the 31% win rate vs 60% target?"
   - "Which signals should we disable or recalibrate?"
   - "Are there specific hours we should avoid trading?"
   - "Is the confidence scoring system accurate?"

4. **Implement Fixes:** Based on LLM recommendations

5. **Re-export & Compare:** After changes, export again and compare metrics

## Notes

- Export generates fresh data on each request (not cached)
- Large exports (90+ days with raw data) may take 5-10 seconds
- All timestamps are in ISO 8601 format (UTC)
- Percentages are decimal values (e.g., 85.5 = 85.5%)
- The export is designed for programmatic analysis, not human reading
