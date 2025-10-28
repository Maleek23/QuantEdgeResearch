# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities in US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, robust risk management tools, and real-time market analysis. The platform emphasizes strong risk controls, clear educational disclaimers, and presents information via a professional dark-themed UI for rapid data scanning. It integrates real historical data for model accuracy, features adaptive learning, and operates on a public-access model managing membership tiers through Discord roles, with the web platform serving as a public dashboard. The platform's ambition is to offer a comprehensive, data-driven solution for quantitative trading research.

## User Preferences
All timestamps should be displayed in America/Chicago timezone with market session context.
The UI should be a professional dark-themed interface optimized for rapid data scanning.
Educational disclaimers must be emphasized (not financial advice).
Clear and precise risk/reward calculations and position sizing tools are required.
The platform should highlight fresh, actionable trade ideas immediately upon opening.
The platform should function fully even without external AI dependencies, offering a quantitative idea generator alternative.
Provide helpful error messages for API billing, rate limits, and authentication issues.
Liquidity warnings should be displayed for penny stocks and low-float securities.
No personalized financial advice should be offered; it is for research purposes only.

## Recent Changes

-   **Quant Generation Time-Window Feedback** (Oct 28, 2025): Fixed silent failure when clicking Quant button outside optimal trading window. ROOT CAUSE: `generateQuantIdeas()` silently returned empty array with generic "No new trade ideas" message when outside 9:30-11:30 AM ET window. Users were confused about why no ideas generated. FIX: Now throws descriptive error explaining time restriction (9:30-11:30 AM ET / 8:30-10:30 AM CT), current time in both timezones, performance rationale (75-80% morning WR vs 16-46% afternoon), and when to retry. Toast notification provides clear user feedback.
-   **Penny Stock Discovery Integration** (Oct 28, 2025): Fixed missing penny stock analysis. ROOT CAUSE: `discoverPennyStocks()` function existed but was never called by quant generator. FIX: (1) Now calls both `discoverStockGems()` (Yahoo screeners) AND `discoverPennyStocks()` (curated watchlist), (2) Added VSEE and XHLD to watchlist, (3) Merges and deduplicates results. Penny stocks (<$5) now properly discovered and filterable in UI.
-   **Entry/Exit Timing Analysis** (Oct 28, 2025): Added comprehensive timing display for closed trades showing entry time, exit time, and holding duration with intelligent formatting (minutes, hours, days). Appears on both trade cards and detail modal. Addresses user request for visibility into trade lifecycle timestamps.
-   **v3.4.0 DEPLOYED** (Oct 28, 2025): CONFIDENCE RECALIBRATION - Fixed inverted scoring system where high confidence (90-100%) had 15.6% actual WR while low confidence (<60%) had 63% WR. ROOT CAUSE: "Excellent R:R (3:1+)" bonus was worst-performing signal (5.1% WR) - bonuses were inverse predictors. FIXES: (1) Removed ALL R:R and volume bonuses, (2) Lowered base scores from 90-95 to 50-65 matching actual 30-60% WR, (3) Recalibrated timing windows (62/55 thresholds vs old 90/85), (4) Fixed targetHitProbability to use score directly. Confidence scores now CORRELATE with actual performance instead of being inverted.
-   **v3.3.0 DEPLOYED** (Oct 28, 2025): TIME-OF-DAY FIX - Restricted quant generation to 9:30-11:30 AM ET ONLY. Root cause identified: v3.2.0 extended trading window from 2hr→full day, generating trades during low-performance hours. Diagnostic audit revealed morning trades (9:30-11:30 AM ET): 75-80% WR vs afternoon (12 PM+): 16-46% WR. This single change should restore 60%+ WR. Production tested and validated - generation correctly blocked outside prime window.
-   **v3.2.0 Regression DIAGNOSED**: Root cause of 0% win rate identified - extended trading window (2hr→full day) generated trades during low-performance hours. Fixed in v3.3.0.
-   **Dual-Layer Validation Framework**: Centralized trade-validation.ts enforces structural + risk guardrails across all generation paths (AI, Hybrid, Quant). Options quarantined, max 5% loss cap, min 2:1 R:R enforced.
-   **Diagnostic Export System**: Comprehensive /api/admin/diagnostic-export generates downloadable JSON reports with performance analysis, API reliability, system diagnostics, and data quality metrics.

## System Architecture

### UI/UX Decisions
The UI features a Bloomberg-style dark theme with deep charcoal backgrounds, gradients, shadows, and glassmorphism. A consistent color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS provides enhanced styling, including enhanced cards, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. Features like glowing verification badges, real-time price displays, detailed analysis modals, and full mobile responsiveness are included. An intelligent advisory system offers real-time trading advice with dynamic R:R analysis and P/L tracking. Toast notifications provide user feedback, and contextual button placement optimizes the UI. Advanced 3D Visual Analytics, including a Holographic Trading Floor, 3D Correlation Matrix Cube, and a 3D Brain Neural Network, are implemented using React Three Fiber and Three.js. A canvas-based scroll particle effect system provides dynamic visual feedback.

### Technical Implementations & Feature Specifications
The frontend is built with React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification System, a quick actions dialog for trade idea creation (AI-powered, Quantitative rules-based, Manual), market catalyst tracking, a Weekend Preview Banner, and watchlist management with crypto analysis and real-time price alerts. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution with real-time entry prices. Penny stock support is included. A Comprehensive User Settings System allows platform personalization. Options trades feature a prominent details grid showing Type (CALL/PUT with color coding), Strike Price, and Expiration Date displayed directly below Entry/Target/Stop using the same 3-column layout for visual consistency.

A Performance Tracking System validates trade outcomes and tracks win rates. It includes a Performance-Based Grading System calibrated to actual win rates, with metrics like EV Score, Adjusted Weighted Accuracy, and Opposite Direction Rate. A Quantitative Timing Intelligence System provides data-backed entry/exit windows. The platform also includes a complete date filtering system for performance tracking.

The quantitative engine (v3.4.0) leverages three academically-proven signals: RSI(2) Mean Reversion with a 200-Day MA Filter (BOTH long and short), VWAP Institutional Flow, and Volume Spike Early Entry. It incorporates ADX Regime Filtering (ADX ≤30), Signal Confidence Voting (requiring 2+ signals, with exception for high-conviction SHORT trades at RSI>95), and **time-of-day filter restricting generation to 9:30-11:30 AM ET ONLY** (diagnostic data shows 75-80% WR vs 16-46% afternoon). Stop losses are widened to 3.5% for stocks (was 2%), 5% for crypto (was 3%) based on academic research. 

**Confidence Scoring (v3.4.0)**: Data-driven recalibration based on actual performance - base scores lowered to 50-65 range (was 90-95) to match actual 30-60% win rates. Removed ALL R:R bonuses (inverse predictors: "Excellent R:R 3:1+" had 5.1% WR) and volume bonuses (not predictive). Timing windows recalibrated for 45-65 score range with thresholds at 62 (day trade), 55 (swing trade). All trades use standard 2:1 R:R - higher R:R targets correlated with lower win rates. A Hybrid AI+Quant system combines quantitative signals with AI fundamental analysis.

**Critical Dual-Layer Trade Validation Framework** (implemented Oct 2025): All trade ideas (AI, Hybrid, Quant) now pass through mandatory two-tier validation before database persistence:
- **Layer 1 - Structural Validation**: Prevents logically impossible trades (LONG: target must exceed entry, entry must exceed stop; SHORT: stop must exceed entry, entry must exceed target). Rejects zero/negative prices and stop-equals-entry scenarios. Module: `server/trade-validation.ts`
- **Layer 2 - Risk Guardrails**: Enforces maximum 5% loss cap, minimum 2:1 risk/reward ratio, price sanity checks (rejects >50% single-day moves), extreme volatility filters. Detailed rejection logging for audit compliance.
- **Options Quarantine**: All options trades explicitly blocked across AI prompts, hybrid generation, and quant routes pending pricing logic audit (historical avg return: -99.3%).

All generation methods prevent duplicate trades and maintain comprehensive audit trails via engineVersion, mlWeightsVersion, and generationTimestamp fields.

The platform implements a two-tier data filtering system: a User-Facing Mode displays only v3.0+ trades for cleaner metrics, while an ML/Admin Mode includes all historical trades for comprehensive analysis and learning. All historical trade data is preserved for analytical purposes.

### System Design Choices
The platform employs a multi-page, publicly accessible architecture with membership managed via Discord roles. The system uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) via Drizzle ORM. Access tiers include Free, Premium, and Admin, with a password-protected `/admin` panel for comprehensive platform management. Security features include dual authentication, JWT authentication with HTTP-only cookies, session tokens with expiration, rate limiting, and `requireAdmin`/`requirePremium` middleware.

### Automated Services
**Auto Idea Generator:** Automatically generates 3-5 fresh AI trade ideas every weekday at 9:30 AM CT (market open). The service runs every 5 minutes to check for the target time window and ensures no duplicate generations on the same day. All generated ideas pass through the same four-layer risk validation framework (max 5% loss, min 2:1 R:R, price sanity, volatility filters) and deduplication checks. Manual triggering available via admin endpoint `/api/admin/trigger-auto-gen` for testing.

**Performance Validation Service:** Runs every 5 minutes to automatically validate open trade ideas by checking if they hit target, stop loss, or expired. Uses intraday price monitoring with high/low tracking.

**Watchlist Monitor:** Checks watchlist items every 5 minutes for price alerts and updates.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap, discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, discovery via screener, historical data). An Adaptive Discovery System scans ~500 stocks per run with 5-filter enforcement.
-   **Alpha Vantage API:** Fallback for Stock historical data, Earnings calendar.
-   **Tradier API:** Options data (chains, delta targeting, live pricing).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.