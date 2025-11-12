# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform for day-trading opportunities in US equities, options, and crypto markets. Its purpose is to deliver educational, research-grade trade ideas, robust risk management, and real-time market analysis. The platform emphasizes strong risk controls, educational disclaimers, and a professional dark-themed UI optimized for rapid data scanning. It integrates real historical data, features adaptive learning, and manages membership through Discord roles, with the web platform serving as a public dashboard. The ambition is to provide a comprehensive, data-driven solution for quantitative trading research.

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
The UI features a Bloomberg-style dark theme with deep charcoal backgrounds, gradients, shadows, and glassmorphism. A consistent color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS provides enhanced styling for cards, tables, grids, loading states, notifications, and optimistic UI updates. Features include real-time price displays, detailed analysis modals, mobile responsiveness, and an intelligent advisory system with dynamic R:R analysis. Advanced 3D Visual Analytics (Holographic Trading Floor, 3D Correlation Matrix Cube, 3D Brain Neural Network) are implemented using React Three Fiber and Three.js.

**Trade Desk UI Redesign (Nov 12, 2025):**
Comprehensive UI/UX improvements for better readability and reduced visual clutter:
- **Signal Pulse Stats Card:** Always-visible KPI dashboard showing 5 key metrics (FRESH, ACTIVE, WINNERS, LOSERS, EXPIRED) with color-coded tiles, icons, and counts
- **Consolidated Filter Toolbar:** Two-row organized controls merging expiry chips, dropdowns, search, and generation buttons into single ribbon
- **Simplified Mode Context:** Removed large gradient mode description card in favor of lighter contextual cues
- **Prominent Generation Buttons:** Color-keyed action buttons (Quant/AI/Hybrid/News/Flow) with clear loading states
- **Enhanced Empty States:** Improved messaging with actionable CTAs
- **Reduced Clutter:** Removed redundant card wrappers, borders, and tabbed navigation system
- **Professional Hierarchy:** Bloomberg-terminal-style stack with metrics strip, controls ribbon, and data feed following professional trading platform patterns

The platform uses a 6-item sidebar (Trade Desk, Performance, Market Intel, Research & Tools, Settings, Admin) with a hub-and-spoke design. The Trade Desk has 5 mode tabs for different strategies: Standard, Flow Scanner, Lotto, News Catalyst, and Manual. Each mode auto-applies filtering criteria. Trade cards are compact with mode-specific badges. The Performance page provides a single-page view of key metrics.

The platform now supports multi-expiration options across various DTE buckets. Expiry filter chips display dynamic trade counts that update in real-time based on active filters (asset type, grade, symbol search). The system uses calendar-day normalization for expiry dates and includes an "Expired" bucket. The "All" count includes all trades (options + stocks + crypto), while specific buckets count only options.

### Technical Implementations & Feature Specifications
The frontend uses React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Key features include a collapsible sidebar, symbol search, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification System, a quick actions dialog for trade idea creation (AI, Quantitative, Manual), market catalyst tracking, a Weekend Preview Banner, and watchlist management with crypto analysis and real-time price alerts. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution with real-time entry prices. A Comprehensive User Settings System allows platform personalization. Options trades feature a prominent details grid with Type, Strike Price, and Expiration Date, and an info modal explaining entry premium source, timing sequence, option premium vs. stock price, and data sources by asset type.

A Performance Tracking System validates trade outcomes and tracks win rates, including a Performance-Based Grading System. A Quantitative Timing Intelligence System provides data-backed entry/exit windows. The Performance page offers 5 advanced analytics dashboards: Symbol Performance Leaderboard, Time-of-Day Heatmap, Engine Performance Over Time, Confidence Score Calibration, and Win/Loss Streak Tracker. These use TanStack Query with structured queryKeys and Recharts for visualizations.

The quantitative engine (v3.4.0) leverages RSI(2) Mean Reversion with a 200-Day MA Filter, VWAP Institutional Flow, Volume Spike Early Entry, ADX Regime Filtering, Signal Confidence Voting, and time-of-day filtering. Stop losses are widened to 3.5% for stocks and 5% for crypto. Confidence scoring (v3.4.0) is data-driven, and all trades use a standard 2:1 R:R. A Hybrid AI+Quant system combines quantitative signals with AI fundamental analysis.

A critical dual-layer trade validation framework ensures all trade ideas pass through Structural Validation and Risk Guardrails (max 5% loss, min 2:1 R:R, price sanity, volatility filters). News Catalyst Mode enables trade generation during major market events by relaxing the R:R minimum to 1.5:1 when keywords are detected. All generation methods prevent duplicate trades and maintain comprehensive audit trails. The platform implements a two-tier data filtering system: User-Facing Mode (v3.0+ trades) and ML/Admin Mode (all historical trades).

**Futures Trading Implementation (Nov 12, 2025):**
The platform now supports CME futures trading for NQ (E-mini Nasdaq-100) and GC (Gold) contracts:
- **Database Schema:** Added `futuresContracts` table with contract specifications (multiplier, tick size, margin requirements, expiration dates). Trade ideas extended with futures-specific fields (contractCode, rootSymbol, multiplier, tickSize, initialMargin, maintenanceMargin).
- **Data Service:** Mock pricing service (NQ ~$21k, GC ~$2.65k) with 30-second caching, ready for Databento API integration when key is provided. API endpoints for contract lookup and batch pricing.
- **Quant Engine:** Adapted RSI/VWAP/volume signals for futures with tick-based targets (NQ: $5 per tick, GC: $10 per tick). Enforces R:R ≥ 2.0 for leveraged products. Auto-selects front-month contracts.
- **Performance Validation:** Futures P&L calculated as (exitPrice - entryPrice) * multiplier * direction with tick-size rounding. Handles contract expiration as forced exit. Tracks margin utilization.
- **UI:** Dedicated "Futures (CME)" accordion section displaying contract month, expiration countdown, multiplier specs, tick values, and margin requirements. Asset type filters include 'future'.
- **Contract Management:** 9 contracts seeded (4 NQ quarterly: Mar/Jun/Sep/Dec, 5 GC monthly: Apr/Jun/Aug/Oct/Dec) with front-month tracking and rollover metadata.

Automated services run on a schedule:
-   **9:30 AM CT (Weekdays):** AI + Quant idea generation (3-5 trades each), with earnings calendar integration.
-   **9:45 AM CT (Weekdays):** Hybrid AI+Quant generation.
-   **Every 15 min (08:00-20:00 ET):** News Monitor.
-   **Every 15 min (09:30-16:00 ET):** Flow Scanner for unusual options flow, Lotto Scanner for cheap far-OTM weeklies.
-   **Every 5 min:** Performance Validation and Watchlist Monitor.

### System Design Choices
The platform employs a multi-page, publicly accessible architecture with membership managed via Discord roles. It uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) via Drizzle ORM. Access tiers include Free, Premium, and Admin, with a password-protected `/admin` panel. Security features include dual authentication, JWT authentication with HTTP-only cookies, session tokens with expiration, rate limiting, and `requireAdmin`/`requirePremium` middleware.

Performance stats were updated to correctly read from the PostgreSQL database, and options are excluded by default until pricing logic is fixed. The system defaults to analyzing 280 trades (stocks/crypto only), with an overall win rate of 46.5%. The AI Engine shows the best performance at 60.87% WR.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap, discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, discovery via screener, historical data).
-   **Alpha Vantage API:** Breaking news (NEWS_SENTIMENT endpoint), fallback for stock historical data, earnings calendar.
-   **Tradier API:** Options data (chains, delta targeting, live pricing).
-   **Databento API:** Futures data (NQ E-mini Nasdaq-100, GC Gold futures - real-time pricing, contract specifications, CME data).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.