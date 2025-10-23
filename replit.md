# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities in US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, robust risk management tools, and real-time market analysis. The platform emphasizes strong risk controls, clear educational disclaimers, and presents information via a professional dark-themed UI for rapid data scanning. It integrates real historical data for model accuracy, features adaptive learning, and operates on a public-access model managing membership tiers (Free vs. Premium) through Discord roles, with the web platform serving as a public dashboard. The platform's ambition is to offer a comprehensive, data-driven solution for quantitative trading research.

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

A Performance Tracking System validates trade outcomes and tracks win rates. It includes a Performance-Based Grading System calibrated to actual win rates, with metrics like EV Score, Adjusted Weighted Accuracy, and Opposite Direction Rate. A Machine Learning System enhances trade ideas through historical performance analysis, including a Signal Intelligence page, Learned Pattern Analyzer, and Adaptive Confidence Scoring. A Quantitative Timing Intelligence System provides data-backed entry/exit windows. The quantitative strategy uses a predictive approach, prioritizing MACD Crossover, Early Breakout Setups, Mean Reversion, and Volume Spikes, with realistic day-trading targets. **RSI Divergence signals removed (Oct 2025)** due to 0% win rate on reversal trades (catching falling knives). The platform also includes a complete date filtering system for performance tracking.

**Recent Critical Fixes (Oct 23, 2025)**:
- **Option Direction Normalization**: All option trades now use direction='long' with option type (call/put) indicating directional bias. Previously, the system created SHORT PUT trades for bearish signals, which caused inverted target/stop prices and misclassified outcomes. Now: Bullish = LONG CALL, Bearish = LONG PUT.
- **RSI Reversal Removal**: Disabled all RSI divergence signal generation due to 0% win rate. These reversal trades were attempting to catch falling knives with consistent losses (ITGR: -6.25%, GTX: -24.97%, QBTS: -25.01%). MACD crossover promoted to priority #1.

### System Design Choices
The platform employs a multi-page, publicly accessible architecture with membership managed via Discord roles. The system uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) via Drizzle ORM. Access tiers include Free, Premium, and Admin, with a password-protected `/admin` panel for comprehensive platform management. Security features include dual authentication, JWT authentication with HTTP-only cookies, session tokens with expiration, rate limiting, and `requireAdmin`/`requirePremium` middleware.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap, discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, discovery via screener, historical data). **Adaptive Discovery System**: Scans ~500 stocks per run (250 most active, 100 small-cap gainers, 150 undervalued) with 5-filter enforcement: (1) Real avg volume data required, (2) Intraday high data required, (3) Volume ratio ≥3x, (4) Bullish 0-10% move, (5) Price within 5% of day high (gap-and-fade rejection). Adaptive quant engine handles different phases: 0-2% (RSI/MACD predictive), 2-5% (MACD/volume breakout), 5-10% (5x+ volume momentum). This catches stocks across the full opportunity spectrum. Retry logic handles rate limiting.
-   **Alpha Vantage API:** Fallback for Stock historical data, Earnings calendar.
-   **Tradier API:** Options data (chains, delta targeting, live pricing).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.