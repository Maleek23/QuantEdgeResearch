# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities in US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, robust risk management tools, and real-time market analysis. The platform emphasizes strong risk controls, clear educational disclaimers, and presents information via a professional dark-themed UI for rapid data scanning. It integrates real historical data for model accuracy, features adaptive learning, and operates on a public-access model managing membership tiers (Free vs. Premium) through Discord roles, with the web platform serving as a public dashboard. The platform's ambition is to offer a comprehensive, data-driven solution for quantitative trading research.

**NEW: AI System Overhaul (Oct 23, 2025)**
- **Free AI Tier**: Switched to Gemini free tier (25 requests/day, commercial use allowed) - eliminates paid API costs
- **Hybrid AI+Quant System**: New `/api/hybrid/generate-ideas` endpoint combines proven quant signals with AI fundamental analysis
- **Dashboard Integration**: Added "Free AI Ideas" button with FREE badge and "Hybrid (AI+Quant)" button for best-of-both-worlds generation

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