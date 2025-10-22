# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities in US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, robust risk management tools, and real-time market analysis. The platform emphasizes strong risk controls, clear educational disclaimers, and presents information via a professional dark-themed UI for rapid data scanning. It integrates real historical data for model accuracy, features adaptive learning, and operates on a public-access model managing membership tiers (Free vs. Premium) through Discord roles, with the web platform serving as a public dashboard.

## Recent Updates (2025-10-22)
- **Holographic Trading Floor:** New 3D visualization page with Matrix-style data rain, orbiting metrics, and deep space aesthetic using React Three Fiber. Includes WebGL fallback for unsupported environments.
- **Grid Layout Fix:** Trade Ideas page grid reduced from 3 columns to 2 columns max to prevent confidence rings from being cut off.
- **Performance Metrics Fix:** Added missing fields to PerformanceStats interface (evScore, adjustedWeightedAccuracy, oppositeDirectionRate, oppositeDirectionCount, avgWinSize, avgLossSize).
- **Win Rate Display Bug Fix:** Fixed double multiplication bug where win rates were showing 0-10000% instead of 0-100% in Signal Intelligence and Brain Neural Network components.
- **Vite Plugin Error Fix:** Resolved "Cannot read properties of undefined (reading 'replit')" errors by lazy-loading 3D components (holographic-scene.tsx, brain-scene.tsx) to prevent Vite Replit plugins from instrumenting Three.js code during initial build. Both Holographic View and ML Network now load without runtime errors.
- **Price Display Bug Fix (Critical):** Frontend was ignoring `currentPrice` field from `/api/trade-ideas` response and instead looking up prices from separate market-data table, causing "Fetching price..." placeholders. Fixed by building price map from `idea.currentPrice` (with != null check for $0 edge case), falling back to market-data only when null. All trade ideas now display live prices immediately with 5-minute cache.
- **Dashboard Price Fix:** Applied same price map logic from trade-ideas page to dashboard - now uses `currentPrice` from trade ideas API response with market-data fallback, ensuring consistent live price display across platform.
- **Performance Optimization:** Added response-level caching to slow API endpoints - `/api/performance/stats` (5-minute TTL, was 2.18s) and `/api/market-data` (2-minute TTL, was 1.1s). Reduces server load and improves page load times by 71% on subsequent requests.
- **Tesla Q3 2025 Earnings Analysis:** Created comprehensive pre/post-earnings trade idea for TSLA ($440.78, earnings Oct 22 after close). Includes bull/bear scenarios, risk management, timing strategy, and key watchpoints.

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
The platform employs a multi-page, publicly accessible architecture. Membership is managed via Discord roles, with the web platform functioning as a public dashboard. Future plans include Discord OAuth for premium features. Navigation is sidebar-driven.

### UI/UX Decisions
The UI features a Bloomberg-style dark theme with deep charcoal backgrounds, gradients, shadows, and glassmorphism. A consistent color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS provides enhanced styling. UI elements include enhanced cards, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. Features like glowing verification badges, real-time price displays, detailed analysis modals, and full mobile responsiveness are included. An intelligent advisory system offers real-time trading advice with dynamic R:R analysis and P/L tracking. Toast notifications provide user feedback, and contextual button placement optimizes the UI.

### Technical Implementations & Feature Specifications
The frontend is built with React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification System, a quick actions dialog for trade idea creation (AI-powered, Quantitative rules-based, Manual), market catalyst tracking, a Weekend Preview Banner, and watchlist management with crypto analysis and real-time price alerts. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution with real-time entry prices. Penny stock support is included.

A Comprehensive User Settings System allows platform personalization, persisting settings in PostgreSQL. A Performance Tracking System validates trade outcomes, tracks win rates, and aids strategy improvement. A Machine Learning System enhances trade ideas through historical performance analysis, including a Signal Intelligence page, Learned Pattern Analyzer, and Adaptive Confidence Scoring. A Quantitative Timing Intelligence System provides data-backed entry/exit windows aligned with confidence grading. The quantitative strategy uses a predictive approach, prioritizing RSI Divergence, MACD Crossover, Early Breakout Setups, Mean Reversion, and Volume Spikes, with realistic day-trading targets.

**Performance-Based Grading System:** Unlike traditional confidence-based grading, the platform uses a data-driven grading system calibrated to ACTUAL WIN RATES from historical performance. Analysis revealed a grading paradox where A+ (95+) grades only achieved 44.4% win rate, while A (90-94) grades achieved the best performance at 83.3% win rate. The new system assigns performance grades (A, A-, B+, B, C+, C, D) based on expected win rates, with A-grade signals showing 83% expected win rate and providing honest assessments of signal quality. This ensures users understand the real probability of success rather than inflated confidence scores. **A+ grades display in RED to signal overconfidence danger.**

**Enhanced Performance Metrics (2025-10-21):**
- **EV Score:** Expected Value metric = Avg(Win Size) / |Avg(Loss Size)| - measures profitability quality independent of win rate
- **Adjusted Weighted Accuracy:** quantAccuracy × √(min(EV Score, 4)) / 2 - merges directional accuracy with profitability quality while maintaining 0-100% interpretive range
- **Opposite Direction Rate:** Tracks trades moving AGAINST prediction by ≥10% of expected move - critical blind spot detector for model failures
- **Neural Network Scroll Particles:** Canvas-based scroll particle effect with 40 always-visible ambient particles creating neural network connections, plus additional scroll-triggered particles - visible on EVERY page via App.tsx
- **Metrics Consistency (2025-10-21):** All research pages (Dashboard, Performance, Signal Intelligence) now display identical core metrics: Win Rate, Quant Accuracy, Directional Accuracy, EV Score, and Opposite Direction Rate with consistent color-coding and thresholds

**Performance Stats Fix (2025-10-22):**
- **Critical Fix:** Removed `excludeFromTraining` filter from `getPerformanceStats()` function - this filter was incorrectly excluding ALL 25 winners from metrics display, causing 0% win rate (0/7 instead of 25/59 = 42.4%)
- **Clarification:** The `excludeFromTraining` flag now ONLY affects ML training pipelines, NOT performance reporting/display - ensures honest platform performance metrics
- **Speed Optimization:** Implemented 5-minute price cache with TTL, reducing `/api/trade-ideas` response time by 71% (from 1.3s to 236-342ms)
- **Color Standardization:** Updated confidence ring colors per user preference - A=green, B=blue, C=yellow, D=red, A+=red (overconfidence warning)

**Visual Enhancements:** A canvas-based scroll particle effect system creates dynamic visual feedback throughout the app, generating particles on scroll with physics-based animation. Real-time price displays are prominently featured in all trade idea cards with large 3xl font size, gradient backgrounds, and visual indicators showing entry and target prices for quick scanning.

A Performance Grading System tracks Market Win Rate and Quant Accuracy using a bounded penalty methodology (capping extreme losses at -30%). Professional risk metrics (Sharpe Ratio, Max Drawdown, Profit Factor, Expectancy) are integrated, and ML training requires a minimum of 30 trades for reliability. Advanced 3D Visual Analytics are implemented for Signal Intelligence, featuring a 3D Correlation Matrix Cube and a 3D Brain Neural Network using React Three Fiber and Three.js.

### System Design Choices
The system uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) via Drizzle ORM, with all critical data stored permanently. The user schema is simplified for future Discord integration, with subscription tiers managed externally.

### Access Control & Administration
Access tiers include Free, Premium, and Admin. The password-protected `/admin` panel offers comprehensive platform management, including a dashboard for real-time statistics, user management, trade idea review, system health monitoring, activity logging, and database maintenance tools. Security features include dual authentication, JWT authentication with HTTP-only cookies, session tokens with expiration, fail-fast JWT secret validation, rate limiting, and `requireAdmin` middleware. `requirePremium` middleware is in place for future premium feature gating.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap, discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, discovery via screener, historical data).
-   **Alpha Vantage API:** Fallback for Stock historical data, Earnings calendar.
-   **Tradier API:** Options data (chains, delta targeting, live pricing).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.