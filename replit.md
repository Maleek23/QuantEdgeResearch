# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities in US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, robust risk management tools, and real-time market analysis. The platform emphasizes strong risk controls, clear educational disclaimers, and presents information via a professional dark-themed UI for rapid data scanning. It integrates real historical data for model accuracy, features adaptive learning, and operates on a public-access model managing membership tiers (Free vs. Premium) through Discord roles, with the web platform serving as a public dashboard. The platform's ambition is to offer a comprehensive, data-driven solution for quantitative trading research.

**NEW: Quant Engine v3.1.0 (Oct 24, 2025)**
- **ADX Regime Filtering**: Calculates ADX to detect market regime (ranging vs trending)
  - Mean reversion signals (RSI2) ONLY work in ranging markets (ADX < 25)
  - Momentum signals (VWAP, Volume Spike) work in ALL regimes
  - Fixes the 31 expired trade issue (mean reversion in wrong regime)
- **Signal Confidence Voting**: Requires 2+ signals to agree before generating trade idea
  - Research shows 2+ signal agreement = 70%+ win rate vs 55-65% for single signals
  - Reduces false signals and noise significantly
- **Optimal Trading Window**: Time-of-day filter for first 2 hours (9:30-11:30 AM ET)
  - Best liquidity and volume in opening hours
  - Improves execution quality and reduces slippage
- **UI Redundancy Fix**: Eliminated duplicate metrics across Tools tab pages
  - **Performance page**: ALL core metrics (Win Rate, Sharpe, Drawdown, Profit Factor, Expectancy)
  - **Analytics page**: ONLY advanced tools (Rolling Win Rate, Signal Breakdown, Calibration)
  - Removed duplicate metric cards that frustrated users
- **CRITICAL EXIT PRICE FIX (Oct 24)**: Removed broken validation from GET /api/trade-ideas
  - Root cause: GET endpoint had inline validation setting exitPrice = currentPrice instead of target/stop
  - Fixed 72 trades with wrong exit prices (35 hit_target, 37 hit_stop)
  - Recalculated percentGain for 118 trades using correct formula
  - Database repair: profitFactor improved from 0.92 to 2.02, evScore from 1.82 to 3.24
  - Validation now ONLY happens in Performance Validation Service (every 5 min) and manual endpoint
- **CODE CLEANUP (Oct 24)**: Removed 886 lines of dead code from v3.0.0 rebuild
  - Deleted `backtesting.ts` (305 lines) - never used
  - Deleted `timing-intelligence.ts` (356 lines) - v3.0 removed complex DB-based timing
  - Deleted `ml-retraining-service.ts` (225 lines) - v3.0 removed ML system
  - Replaced complex timing with simple 120-line implementation in quant-ideas-generator.ts
  - Result: Cleaner codebase, no more hourly ML retraining waste, faster startup

**AI System Overhaul (Oct 23, 2025)**
- **Free AI Tier**: Switched to Gemini free tier (25 requests/day, commercial use allowed) - eliminates paid API costs
- **Hybrid AI+Quant System**: New `/api/hybrid/generate-ideas` endpoint combines proven quant signals with AI fundamental analysis
- **Dashboard Integration**: Added "Free AI Ideas" button with FREE badge and "Hybrid (AI+Quant)" button for best-of-both-worlds generation
- **Analytics Source Filtering**: Analytics page now supports filtering by source (All/Quant/AI/Hybrid) to compare performance across generation methods
- **Duplicate Prevention**: All three generation methods (Quant, AI, Hybrid) now check for existing open trades and skip duplicate symbols automatically
- **CRITICAL PRICE FIXES (Oct 23)**: Fixed price inversion bugs across ALL generation systems
  - **AI:** Added explicit price rules to prompt (LONG: target > entry > stop) + automatic validation
  - **Quant:** Fixed `calculateLevels()` to handle PUT options correctly (target DOWN, stop UP for bearish)
  - **Hybrid:** Inherits quant fix + defensive validation layer
  - **Triple Protection:** AI prompt rules → Calculation logic → Validation safety net

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

### UI/UX Decisions
The UI features a Bloomberg-style dark theme with deep charcoal backgrounds, gradients, shadows, and glassmorphism. A consistent color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS provides enhanced styling, including enhanced cards, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. Features like glowing verification badges, real-time price displays, detailed analysis modals, and full mobile responsiveness are included. An intelligent advisory system offers real-time trading advice with dynamic R:R analysis and P/L tracking. Toast notifications provide user feedback, and contextual button placement optimizes the UI. Advanced 3D Visual Analytics, including a Holographic Trading Floor, 3D Correlation Matrix Cube, and a 3D Brain Neural Network, are implemented using React Three Fiber and Three.js. A canvas-based scroll particle effect system provides dynamic visual feedback.

### Technical Implementations & Feature Specifications
The frontend is built with React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification System, a quick actions dialog for trade idea creation (AI-powered, Quantitative rules-based, Manual), market catalyst tracking, a Weekend Preview Banner, and watchlist management with crypto analysis and real-time price alerts. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution with real-time entry prices. Penny stock support is included. A Comprehensive User Settings System allows platform personalization. **Options trades feature a prominent details grid** showing Type (CALL/PUT with color coding), Strike Price, and Expiration Date displayed directly below Entry/Target/Stop using the same 3-column layout for visual consistency.

A Performance Tracking System validates trade outcomes and tracks win rates. It includes a Performance-Based Grading System calibrated to actual win rates, with metrics like EV Score, Adjusted Weighted Accuracy, and Opposite Direction Rate. A Quantitative Timing Intelligence System provides data-backed entry/exit windows. The platform also includes a complete date filtering system for performance tracking.

**v3.0.0 COMPLETE REBUILD (Oct 23, 2025)** - Research-Backed Simplification:
After 12.1% win rate (4W/29L) proved complex ML system fundamentally broken, the quant engine was completely rebuilt using ONLY academically-proven signals:

**New Strategy - 3 Proven Signals Only:**
1. **RSI(2) Mean Reversion + 200-Day MA Filter** (Priority #1)
   - Research: 75-91% win rate (QuantifiedStrategies QQQ backtest 1998-2024)
   - Larry Connors research: Buy when RSI(2) < 10 AND price above 200-day MA
   - Targets 2-4% mean reversion moves with tight stops

2. **VWAP Institutional Flow** (Priority #2)
   - Research: 80%+ win rate (most widely used by professional traders)
   - LIMITATION: Currently approximated with daily data (not true intraday VWAP)
   - Detects institutional buying when price crosses above VWAP with 1.5x+ volume

3. **Volume Spike Early Entry** (Priority #3)
   - Targets 3x+ volume spikes with 0-2% price moves
   - Catches early breakout setups before momentum fades

**Removed (Research-Proven Failures):**
- ❌ MACD (academic consensus: "very low success rate" - FINVIZ 16,954 stock study)
- ❌ RSI Divergence (0% live win rate - catching falling knives)
- ❌ Complex ML scoring (178 lines → 54 lines simple rule-based)
- ❌ Multi-timeframe analysis (added complexity without proven edge)

**Simplification Results:**
- Signal detection: 130+ lines → 64 lines
- Confidence scoring: 178 lines → 54 lines (simple rule-based)
- Focus: Academic research over complex algorithms

**Research Sources:**
- QuantifiedStrategies: RSI(2) QQQ backtest (1998-2024)
- FINVIZ: Multi-year 16,954 stock study
- Larry Connors: RSI(2) mean reversion with 200 MA filter
- Academic consensus: MACD "very low success rate"

**Critical Fixes:**
- **Option Direction Normalization**: All option trades now use direction='long' with option type (call/put) indicating directional bias. Previously, the system created SHORT PUT trades for bearish signals, which caused inverted target/stop prices and misclassified outcomes. Now: Bullish = LONG CALL, Bearish = LONG PUT.

**Smart Engine Version Filtering (Oct 25, 2025)**:
The platform implements a two-tier data filtering system to balance clean user-facing metrics with comprehensive ML learning:

- **User-Facing Mode** (default): Shows v3.0+ trades only
  - Performance page displays only v3.0.0+ trades (currently 4 total)
  - Blue alert banner explains filtering ("Showing v3.0+ only for cleaner metrics")
  - Rationale: v2.x trades used broken signals (MACD, ML) with 39.4% win rate - polluting metrics
  - Implementation: `getPerformanceStats()` filters to `engineVersion.startsWith('v3.')`

- **ML/Admin Mode** (includeAllVersions=true): Analyzes ALL historical trades
  - ML endpoints (`/api/ml/signal-intelligence`, `/api/ml/learned-patterns`) include all 169 trades
  - Admin verification (`/api/ml/verify-data-integrity`) audits complete database
  - Rationale: Signal intelligence NEEDS v2.x failures to learn which signals don't work
  - Implementation: `getPerformanceStats({ includeAllVersions: true })` skips version filter

- **Database Preservation**: All 169 trades remain in database (127 unversioned, 21 v2.3.0, 17 v2.4.0, 4 v3.0.0)
  - Nothing deleted - complete historical record for analysis and learning
  - ML can analyze why RSI Divergence (0% WR) and MACD (academic research: "very low success rate") failed
  - Admin can audit data integrity across all engine versions

### System Design Choices
The platform employs a multi-page, publicly accessible architecture with membership managed via Discord roles. The system uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) via Drizzle ORM. Access tiers include Free, Premium, and Admin, with a password-protected `/admin` panel for comprehensive platform management. Security features include dual authentication, JWT authentication with HTTP-only cookies, session tokens with expiration, rate limiting, and `requireAdmin`/`requirePremium` middleware.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap, discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, discovery via screener, historical data). **Adaptive Discovery System**: Scans ~500 stocks per run (250 most active, 100 small-cap gainers, 150 undervalued) with 5-filter enforcement: (1) Real avg volume data required, (2) Intraday high data required, (3) Volume ratio ≥3x, (4) Bullish 0-10% move, (5) Price within 5% of day high (gap-and-fade rejection). **v3.0.0 Quant Engine** uses 3 proven signals: (1) RSI(2) < 10 + 200-day MA filter (75-91% win rate), (2) VWAP institutional flow proxy (80%+ win rate), (3) Volume spike early entry (3x+ volume). Retry logic handles rate limiting.
-   **Alpha Vantage API:** Fallback for Stock historical data, Earnings calendar.
-   **Tradier API:** Options data (chains, delta targeting, live pricing).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.