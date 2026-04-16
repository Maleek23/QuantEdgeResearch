# QuantEdge Platform Audit — Senior Quant Review

**Date:** 2026-04-13
**Reviewer Persona:** Senior PhD quant, Wall Street desk, evaluating QuantEdge as a daily-driver research tool
**Method:** Full source code audit across 6 domains, 7 parallel agents

---

## Executive Summary

QuantEdge has genuine engineering in several areas (GEX math, cross-validation, conviction architecture, OlAlgo bot framework). But it undermines that real work with lies ("6 ML engines", Databento, fake trade tapes), fabricated data (`Math.random()` in financial calculations), and misleading metrics (non-annualized Sharpe, fictional equity curves, "confidence" scores that aren't probabilities). The platform is 60% real and 40% theater. The fixes below are prioritized by what would get a quant fired vs what's just missing polish.

---

## P0 — LIES & DANGEROUS (fix before anyone trades on this)

### 1. "6 ML Engines" — The ML Engine Does Not Exist
- `server/ml-intelligence-service.ts` is **missing**. The import at routes.ts:26091 will throw at runtime.
- `six-engine-panel.tsx` catches the error and hardcodes `mlScore = 50`.
- SEO meta tags, landing page, about page all claim "6 independent ML engines."
- **Fix:** Remove all "6 ML engines" claims. Rename to "6 analysis layers" or honest count of what exists: Technical, Flow, Sentiment (LLM), Quant (rules), Convergence, GEX.

### 2. Math.random() in Financial Calculations
- **routes.ts:24399-24403** — Entire "trade tape" for institutional flow is fabricated with random buy/sell
- **routes.ts:25968, 26041, 26107, 26251** — All ML/prediction endpoints use `1000000 + Math.random() * 500000` for volume
- **routes.ts:16507** — Fallback synthetic price history with random noise feeds into technical indicators silently
- **routes.ts:28314** — 252 days of synthetic IV history from random numbers
- **Fix:** Delete every `Math.random()` in financial code. Return null/error when real data unavailable. Never fabricate financial data.

### 3. R:R Goes Stale Immediately
- R:R is computed once at idea generation and never recalculated from live price.
- An idea at $150 entry / $160 target / $145 stop (2.0x R:R) now trading at $158 has real R:R of 0.4x upside vs 2.6x downside. UI still shows 2.0x.
- **Fix:** Recalculate R:R from live price on every render. Show both original and live R:R.

### 4. "Backtest" Page Does Zero Backtesting
- `/backtest` calls `/api/patterns?symbol=X` which returns current technical indicators and candlestick patterns.
- No historical simulation, no entry/exit rules, no P&L series, no walk-forward.
- **Fix:** Rename to "Pattern Scanner" or build a real backtester.

### 5. Confidence Score is Fabricated
- Ingestion pipeline computes `estimatedConfidence` via `38 + (signalWeight * saturationFactor)` with ceiling at 94.
- Not a probability, not a backtest win rate, not a Bayesian posterior. Just a weighted signal count mapped to look like a percentage.
- **Fix:** Rename to "Signal Strength" and drop the % symbol. Or calibrate against actual outcomes.

---

## P1 — INACCURATE (misleading but not immediately dangerous)

### 6. Databento Listed as Data Source — Does Nothing
- `initializeDatabentoWebSocket()` logs "requires Python SDK" and falls back to Yahoo polling. Pure theater.
- Features page lists it alongside real sources.
- **Fix:** Remove from features page and all marketing materials.

### 7. Polymarket Routes Exist, Service Dead
- `/api/polymarket/*` endpoints exist in routes.ts but no service implementation. Will 500.
- **Fix:** Remove dead routes.

### 8. Conviction Score Range is Misleading
- Labeled "0-100" but theoretical max is ~85. In practice scores cluster 15-35.
- Band cutoffs: S>=30, A>=22, B>=15, C<15. An "S-tier" idea needs only 30/100.
- Score of "32" looks terrible to users; calling it "S-tier" looks generous.
- **Fix:** Either normalize to 0-100 or change display to show score within band (e.g., "32/40 possible").

### 9. Conviction Weights Are Unjustified
- No empirical basis for why convergence caps at 18 while technical caps at ~20.
- No logistic regression on outcomes, no weight sensitivity analysis.
- **Fix:** At minimum, disclose as heuristic. Ideally, calibrate weights via realized outcome data.

### 10. Sharpe Ratio is Wrong
- Uses raw `percentGain` per trade, not annualized, not time-weighted.
- A 2% gain in 1 hour and 2% gain in 3 weeks are treated identically.
- No risk-free rate subtraction.
- **Fix:** Annualize. Use time-weighted returns. Subtract risk-free rate.

### 11. Max Drawdown Uses Fictional Equity Curve
- Simulates equity curve assuming each trade's `percentGain` applies to full equity.
- Trades overlap in time, capital is fractional. Produces wildly wrong drawdowns.
- **Fix:** Track actual daily portfolio value or at minimum account for position sizing.

### 12. Open Trades Mixed into Conviction Backtest
- Conviction backtest mixes unrealized P&L (open trades at live price) with realized results.
- Classic survivorship/look-ahead contamination.
- **Fix:** Separate realized and unrealized. Mark unrealized clearly.

### 13. "LIVE" Badge on News Feed
- News refreshes every 120s via polling. Not WebSocket/SSE.
- **Fix:** Change to "Updated 2m ago" or actual timestamp.

### 14. Entry/Target/Stop Are LLM Hallucinations
- Idea generation endpoints use GPT/Claude to generate prices.
- Validated only for structural sanity (max 5% loss, min 2:1 R:R), not anchored to support/resistance or statistical expected moves.
- Ingestion pipeline force-adjusts option targets upward to meet minimums — manufacturing fake targets.
- **Fix:** Disclose "AI-generated, not levels-derived." Anchor to ATR, pivot levels, or GEX strikes.

### 15. Wrong Sector Mappings
- CLSK (crypto miner) mapped to `'space'`
- BROS (Dutch Bros coffee) mapped to `'software'`
- DKNG (DraftKings gambling) mapped to `'software'`
- IONQ/RGTI/QBTS (quantum computing) mapped to `'software'`
- CCJ/LEU/UEC labeled `'nuclear_fusion'` — these are uranium/fission, not fusion
- **Fix:** Correct all sector mappings.

### 16. Silent Fallback to Synthetic Data
- When real price data fetch fails, routes.ts:16496-16513 generates synthetic prices with random noise.
- Technical indicators are then computed on fake data with no user-visible warning.
- **Fix:** Return error, not fake data. Or clearly badge as "simulated."

---

## P2 — GAPS (missing features a serious quant expects)

### Data & Analytics
- [ ] **No IV Rank / IV Percentile** anywhere in the platform
- [ ] **No Greeks on option suggestions** (delta, theta, vega, premium estimate)
- [ ] **No historical GEX/VEX time-series** — every page fetch recomputes from scratch
- [ ] **No VIX term structure** (VX1-VX2 contango/backwardation)
- [ ] **No expected move vs target move ratio**
- [ ] **No put/call ratio time-series**
- [ ] **No volume profile, VWAP, or market microstructure data**
- [ ] **No Level 2 / order book depth**
- [ ] **No Time & Sales tape**
- [ ] **No spread detection in flow scanner** (can't identify verticals, iron condors)
- [ ] **No Keltner Channel in squeeze detection** (only Bollinger — more false positives)
- [ ] **Hardcoded risk-free rate at 4.5%** — should pull from FRED
- [ ] **No dividend yield in Black-Scholes** — meaningful error for high-div names

### Performance & Risk
- [ ] **No benchmark comparison** on main performance page (alpha vs SPY)
- [ ] **No Sortino ratio** on main page (only in admin endpoint)
- [ ] **No VaR / Expected Shortfall**
- [ ] **No position correlation matrix**
- [ ] **No commissions/slippage in any P&L calculation**
- [ ] **No confidence intervals on win rates** (showing 72% on n=18 without error bars)
- [ ] **No time-weighted returns** (TWRR/MWRR)
- [ ] **3% loss threshold silently filters small losers** — inflates win rate
- [ ] **Default 50% win rate for thin symbols** feeds into conviction scoring

### Trade Desk
- [ ] **No live R:R recalculation** from current price
- [ ] **No distance-to-target / distance-to-stop display**
- [ ] **No position sizing based on account risk %**
- [ ] **No correlation check** (platform shows 5 long-tech ideas simultaneously)
- [ ] **No per-source/sector/period hit rate** breakdown
- [ ] **No decay analysis** (does a 3-day-old idea still have edge?)

### Watchlist & Bot
- [ ] **No price alerts, target prices, or stop tracking** on watchlist
- [ ] **No weekly outcome tracking** (seed Monday, measure Friday)
- [ ] **No per-ticker vol override in OlAlgo** (hardcoded sigma=0.30 for all)
- [ ] **No transaction costs in OlAlgoMax**
- [ ] **getTier() returns null** for SMALL_ACCOUNT and CRYPTO tickers
- [ ] **~120 ticker universe never disclosed** to users

### UX & Navigation
- [ ] **Orphan pages** — Automations, History, Strategy Playbooks, Options Analyzer, Market Outlook, Learning Dashboard have no sidebar entry
- [ ] **Cmd+K command palette** — shortcut hint shown but nothing wired up
- [ ] **No alerting system** — Settings has notification toggles but no alert creation flow
- [ ] **No CSV/Excel export** on any page except bot trade logs
- [ ] **No multi-monitor/workspace layouts** — dead code in design-tokens.ts
- [ ] **Bot controls in Settings are theater** — pause/restart buttons have no handlers, thresholds reset on reload
- [ ] **GEX Hub and Options Flow** are separate sidebar items pointing to tabs on same page
- [ ] **Search button navigates to /market → /home** instead of opening search
- [ ] **Academy disconnected from Learning Dashboard** — two education features, zero integration

---

## GOOD (what the quant would appreciate)

1. **GEX/VEX/DEX math is real and correct** — proper Black-Scholes greeks, dealer sign convention, Vanna formula, 4-source cascade
2. **Cross-validation system** — parallel multi-source price validation with spread detection and quality scoring
3. **14-layer conviction architecture** — independently testable, null-safe, transparent layer breakdown in UI
4. **Freshness/staleness system** — weekend-aware, age decay, drift detection, session labeling
5. **OlAlgo bot framework** — Monte Carlo simulations, trim ladders, DTE-bucketed stops, sector caps, reproducible seeded RNG
6. **Design token system** — unified CSS variables, light/dark mode, consistent component API
7. **Redirect hygiene** — 35+ legacy URLs properly redirected, no chains
8. **Dashboard stats fixed** — hardcoded P&L removed, `_meta` block discloses methodology
9. **Flow scanner uses real Tradier data** with validation, whale detection, DTE-aware timing gates
10. **Weekend-aware caching** — briefing 2hr on weekends vs 30min weekdays, outlook extends lookback

---

## What Would Make This a Real Quant Tool

1. **Kill all Math.random() in financial code** — this is the single biggest credibility destroyer
2. **Ship honest labeling** — "Signal Strength" not "Confidence %", "Analysis Layers" not "ML Engines"
3. **Live R:R from current price** — table-stakes for any trade management surface
4. **Greeks on every option suggestion** — delta, premium, IV rank at minimum
5. **Real backtester** — walk-forward, out-of-sample, with proper P&L accounting
6. **Benchmark comparison** — every performance metric should show alpha vs SPY
7. **Command palette + keyboard navigation** — quants live in keyboards
8. **Data source attribution** — show where each number comes from and when it was last refreshed
9. **Alerting** — price, GEX level, conviction change, delivered to Discord/email
10. **Export everything** — CSV on every table, shareable chart snapshots
