# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform focused on identifying day-trading opportunities in US equities, options, and crypto markets. Its core purpose is to provide educational, research-grade trade ideas, robust risk management tools, and real-time market analysis. The platform emphasizes strong risk controls and clear educational disclaimers, presented via a professional dark-themed UI for rapid data scanning. It integrates real historical data to enhance model accuracy and features adaptive learning capabilities to improve trade idea quality over time. The platform operates on a public-access model, managing membership tiers (Free vs. Premium) through Discord roles, with the web platform serving as a public dashboard.

## Recent Changes (Oct 21, 2025)

### 🎯 Quant Engine v2.3.0 - Accuracy Improvement Update
**Goal: Achieve 60%+ Quant Win Rate + Limit Losses to -30% Max**

**Changes Implemented:**
- **Tightened Stop Losses**: Reduced from 4-5% to 2-3% (breakouts: 5% → 3%)
  - Previous average loss: -66% (stop losses not enforced properly on old trades)
  - New target: Limit losses to -30% maximum
  - Better Risk:Reward ratios (2:1 → 4:1 for most signals, 2:1 → 3.33:1 for breakouts)
- **Stricter Signal Filtering**: Raised confidence threshold from 85 (B+ grade) to 90 (A grade minimum)
  - Only generates "A grade or better" trade ideas
  - Reduces low-quality signals that contribute to losing trades
- **Data Consistency Verified**: All pages (Performance, Signal Intelligence, Analytics) pull from same `trade_ideas` table
  - `/api/trade-ideas` → `storage.getAllTradeIdeas()`
  - `/api/performance/stats` → `storage.getPerformanceStats()` (uses `getAllTradeIdeas()`)
  - `/api/analytics/backtest` → `storage.getAllTradeIdeas()`
  - `/api/analytics/rolling-winrate` → `storage.getAllTradeIdeas()`

**Expected Impact:**
- Higher win rate (fewer losing trades due to stricter filtering)
- Lower average loss per trade (tighter stops prevent -66% drawdowns)
- Combined effect should drive Quant Win Rate toward 60%+ target
- Quant Accuracy should improve as average loss reduces from -66% to ~-30% max

**Metrics to Track:**
- **Market Win Rate**: Currently 42.4% (target: 60%+)
- **Quant Win Rate**: Currently 42.4% (target: 60%+) - same as Market Win Rate because all 78 trades are Quant-generated
- **Quant Accuracy**: Currently 3.2% (average % progress toward target) - needs improvement
  - Winners: 100% each (25 trades hit target perfectly)
  - Losers: -66% average (34 trades moved opposite direction)
  - Neutral: 0% each (19 expired with no movement)

### Research Integrity & Governance Implementation
- **Model Governance Metadata**: All trade ideas now capture engineVersion, mlWeightsVersion, and generationTimestamp for full audit trail (SR 11-7 compliance)
- **Model Cards System**: Created comprehensive governance documentation system tracking assumptions, data limitations, backtest metrics, and live performance per model version
- **Risk Disclosure Module**: Auto-displays regulatory-compliant disclaimers on Trade Ideas page with engine version labeling and educational warnings
- **Quant Learning Page**: Interactive educational resource (accordion-style) explaining RSI, MACD, volume analysis, breakouts, and mean reversion signals with priority scores and detection rules
- **Audit Coverage**: Quant generator v2.2.0 reliably populates governance metadata; model cards API initialized with first governance record

### Earnings Calendar Integration
- **Alpha Vantage Earnings API**: Added earnings calendar sync (2,213+ upcoming events Oct 22 - Nov 4) to catalyst feed
- **Earnings Awareness**: Trade ideas display earnings badges when earnings are within 3 days of the trade
- **Manual Sync UI**: Added manual sync button in CatalystFeed component with status toasts
- **Data Quality**: Major tech earnings synced (GOOGL Oct 28, META Oct 29, MSFT Oct 29, AAPL Oct 30, AMZN Oct 30)

### Critical Bug Fixes
- **Prediction Accuracy Backfill**: Resolved 9 historical trades with missing prediction_accuracy_percent values (revealing actual 12.0% system accuracy)
- **Expiry Validation Bug**: Fixed critical date parsing bug that incorrectly marked 59 active trades as "expired"
  - Issue: exitBy dates stored as "Oct 22, 10:28 AM CST" couldn't be parsed by `new Date()`
  - Solution: Created `parseExitByDate()` function to handle human-readable dates with proper year inference
  - Result: All trades with future exit dates now correctly remain "open"
- **Earnings Sync Timing**: Fixed same-day earnings being dropped due to time comparison (now uses date-only comparison)
- **Fiscal Quarter**: Corrected fiscal quarter calculation (was showing Q0 for January due to zero-based months)

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

## System Architecture

### Multi-Page Architecture & Public Access Model
The platform uses a multi-page architecture with all pages publicly accessible. Membership tiers are managed externally via Discord roles, and the web platform acts as a public dashboard. Future Discord OAuth integration is planned for premium features. Navigation is sidebar-driven.

### UI/UX Decisions
The platform features a Bloomberg-style dark theme with deep charcoal backgrounds, gradients, shadows, and glassmorphism. A consistent color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography includes Inter for UI and JetBrains Mono for financial data. Custom CSS provides enhanced styling for various elements. UI elements include enhanced cards, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. Features like glowing verification badges, real-time price displays, detailed analysis modals, and full mobile responsiveness are included. An intelligent advisory system offers real-time trading advice with dynamic R:R analysis and P/L tracking. Toast notifications provide user feedback, and contextual button placement optimizes the UI.

### Technical Implementations & Feature Specifications
The frontend is built with React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification System, a quick actions dialog for trade idea creation (AI-powered, Quantitative rules-based, Manual), market catalyst tracking, a Weekend Preview Banner, and watchlist management with crypto analysis and real-time price alerts. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution with real-time entry prices. Penny stock support is included.

A Comprehensive User Settings System allows platform personalization, persisting settings in PostgreSQL. A Performance Tracking System validates trade outcomes, tracks win rates, and aids strategy improvement. A Machine Learning System enhances trade ideas through historical performance analysis, including a Signal Intelligence page, Learned Pattern Analyzer, and Adaptive Confidence Scoring. A Quantitative Timing Intelligence System provides data-backed entry/exit windows aligned with confidence grading.

The quantitative strategy has been redesigned to use a predictive approach, prioritizing RSI Divergence, MACD Crossover, Early Breakout Setups, Mean Reversion, and Volume Spikes, with realistic day-trading targets. Removed signals include momentum-chasing indicators. A Performance Grading System tracks Market Win Rate and Quant Accuracy (percentage progress toward target). Professional risk metrics (Sharpe Ratio, Max Drawdown, Profit Factor, Expectancy) are integrated, and ML training now requires a minimum of 30 trades for reliability.

### System Design Choices
The system utilizes a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) via Drizzle ORM. All critical data is stored permanently. The user schema is simplified for future Discord integration, with subscription tiers managed externally.

### Access Control & Administration
Access tiers include Free, Premium, and Admin. The password-protected `/admin` panel offers comprehensive platform management:
-   **Dashboard Features:** Real-time statistics, user management (tier modification, deletion), trade idea review, system health monitoring, activity logging.
-   **Database Maintenance Tools:** Cleanup old ideas, archive closed trades, database optimization, table statistics.
-   **Security:** Dual authentication (PIN + password), JWT authentication with HTTP-only cookies, session tokens with expiration, fail-fast JWT secret validation, rate limiting, and `requireAdmin` middleware. `requirePremium` middleware is in place for future premium feature gating.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap, discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, discovery via screener, historical data).
-   **Alpha Vantage API:** Fallback for Stock historical data.
-   **Tradier API:** Options data (chains, delta targeting, live pricing).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.

### Data Flow Hierarchy
1.  **Stock Current Prices:** Alpha Vantage → Yahoo Finance
2.  **Stock Historical Data:** Alpha Vantage → Yahoo Finance
3.  **Stock Discovery:** Yahoo Finance screener
4.  **Crypto Current Prices:** CoinGecko
5.  **Crypto Historical Data:** CoinGecko
6.  **Crypto Discovery:** CoinGecko market rankings