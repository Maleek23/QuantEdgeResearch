# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform focused on identifying day-trading opportunities in US equities, options, and crypto markets. Its core purpose is to deliver educational, research-grade trade ideas, robust risk management, and real-time market analysis. The platform emphasizes strong risk controls, clear educational disclaimers, and presents information through a professional dark-themed UI optimized for rapid data scanning. It integrates real historical data, features adaptive learning, and manages membership through Discord roles, with the web platform serving as a public dashboard. The ambition is to provide a comprehensive, data-driven solution for quantitative trading research.

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
The UI features a Bloomberg-style dark theme with deep charcoal backgrounds, gradients, shadows, and glassmorphism. A consistent color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS provides enhanced styling, including enhanced cards, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. Features like glowing verification badges, real-time price displays, detailed analysis modals, and full mobile responsiveness are included. An intelligent advisory system offers real-time trading advice with dynamic R:R analysis and P/L tracking. Toast notifications provide user feedback, and contextual button placement optimizes the UI. Advanced 3D Visual Analytics, including a Holographic Trading Floor, 3D Correlation Matrix Cube, and a 3D Brain Neural Network, are implemented using React Three Fiber and Three.js. A canvas-based scroll particle effect system provides dynamic visual feedback. The platform is streamlined to 10 pages (6 core + 3 legal + 1 utility) with a sidebar navigation of 6 core items: Trade Ideas, Performance, Market (with watchlist), Settings, and Admin. Trade cards are designed for compact display, and market catalyst feeds include pagination and filters. The Performance page offers a simplified single-page view of key metrics.

### Technical Implementations & Feature Specifications
The frontend is built with React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification System, a quick actions dialog for trade idea creation (AI-powered, Quantitative rules-based, Manual), market catalyst tracking, a Weekend Preview Banner, and watchlist management with crypto analysis and real-time price alerts. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution with real-time entry prices, with penny stock support. A Comprehensive User Settings System allows platform personalization. Options trades feature a prominent details grid showing Type, Strike Price, and Expiration Date.

A Performance Tracking System validates trade outcomes and tracks win rates, including a Performance-Based Grading System. A Quantitative Timing Intelligence System provides data-backed entry/exit windows.

The quantitative engine (v3.4.0) leverages three academically-proven signals: RSI(2) Mean Reversion with a 200-Day MA Filter, VWAP Institutional Flow, and Volume Spike Early Entry. It incorporates ADX Regime Filtering (ADX ≤30), Signal Confidence Voting, and time-of-day filtering (9:30-11:30 AM ET). Stop losses are widened to 3.5% for stocks and 5% for crypto. Confidence scoring (v3.4.0) is data-driven, recalibrated to match actual performance, and all trades use a standard 2:1 R:R. A Hybrid AI+Quant system combines quantitative signals with AI fundamental analysis.

A critical dual-layer trade validation framework ensures all trade ideas pass through mandatory two-tier validation: Structural Validation and Risk Guardrails (enforcing max 5% loss, min 2:1 R:R, price sanity, volatility filters). Options trades are explicitly blocked pending pricing logic audit.

News Catalyst Mode enables trade generation during major market events by relaxing the R:R minimum to 1.5:1 when breaking news keywords are detected in the user's prompt. These trades are marked with `isNewsCatalyst: true` and display an amber "NEWS CATALYST" badge.

All generation methods prevent duplicate trades and maintain comprehensive audit trails. The platform implements a two-tier data filtering system: a User-Facing Mode displays only v3.0+ trades, while an ML/Admin Mode includes all historical trades for analysis.

### System Design Choices
The platform employs a multi-page, publicly accessible architecture with membership managed via Discord roles. The system uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) via Drizzle ORM. Access tiers include Free, Premium, and Admin, with a password-protected `/admin` panel. Security features include dual authentication, JWT authentication with HTTP-only cookies, session tokens with expiration, rate limiting, and `requireAdmin`/`requirePremium` middleware.

### Critical Bug Fixes & Performance Data
**🚨 CRITICAL BUG FIX (Nov 2025):** Performance validation was comparing STOCK prices to OPTION premiums, causing completely invalid win rates. The Flow Scanner's reported 99.4% win rate and Options' 91% win rate were entirely false wins from this bug.

**Fix Applied:**
- Performance validator now excludes options from price fetching until proper option pricing is implemented
- Performance stats API now excludes options by default (`includeOptions: false`)
- Options can be included via `includeOptions: true` parameter, but stats will be invalid until option pricing is fixed

**TRUE Performance Stats (Stocks + Crypto Only):**
- **Overall:** 234 trades, 53.5% win rate
- **By Engine:**
  - AI Engine: 64.1% WR (65 trades) - BEST performer
  - Hybrid Engine: 52.9% WR (18 trades)
  - Quant Engine: 40.9% WR (70 trades) - underperforming, needs investigation
  - Flow Scanner: 0.0% WR (80 trades) - only effective on options (cannot validate yet)
- **By Asset Type:**
  - Crypto: 60.0% WR (58 trades)
  - Stocks: 51.9% WR (170 trades)
  - Penny Stocks: 33.3% WR (6 trades)

**Impact:** The bug revealed that AI is the platform's best-performing engine for stocks/crypto. Flow Scanner is only effective for options (which cannot be validated yet). Quant engine's 40.9% win rate suggests strategy refinement needed, not a data bug.

Automated services run on a schedule:
-   **9:30 AM CT (Weekdays):** AI + Quant idea generation (3-5 trades each), with earnings calendar integration to block trades 2 days before/after earnings (unless news catalyst).
-   **9:45 AM CT (Weekdays):** Hybrid AI+Quant generation.
-   **Every 15 min (08:00-20:00 ET):** News Monitor, generating ideas from major market events with sentiment analysis and keyword detection.
-   **Every 15 min (09:30-16:00 ET):** Flow Scanner for unusual options flow on high-volume tickers.
-   **Every 5 min:** Performance Validation (automatic trade outcome detection) and Watchlist Monitor (price alerts and updates).

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap, discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, discovery via screener, historical data).
-   **Alpha Vantage API:** Breaking news (NEWS_SENTIMENT endpoint), fallback for stock historical data, earnings calendar.
-   **Tradier API:** Options data (chains, delta targeting, live pricing).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.