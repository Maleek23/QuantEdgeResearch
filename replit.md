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

## System Architecture

### UI/UX Decisions
The UI features a Bloomberg-style dark theme with deep charcoal backgrounds, gradients, shadows, and glassmorphism. A consistent color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS provides enhanced styling, including enhanced cards, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. Features like glowing verification badges, real-time price displays, detailed analysis modals, and full mobile responsiveness are included. An intelligent advisory system offers real-time trading advice with dynamic R:R analysis and P/L tracking. Toast notifications provide user feedback, and contextual button placement optimizes the UI. Advanced 3D Visual Analytics, including a Holographic Trading Floor, 3D Correlation Matrix Cube, and a 3D Brain Neural Network, are implemented using React Three Fiber and Three.js. A canvas-based scroll particle effect system provides dynamic visual feedback.

### Technical Implementations & Feature Specifications
The frontend is built with React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification System, a quick actions dialog for trade idea creation (AI-powered, Quantitative rules-based, Manual), market catalyst tracking, a Weekend Preview Banner, and watchlist management with crypto analysis and real-time price alerts. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution with real-time entry prices. Penny stock support is included. A Comprehensive User Settings System allows platform personalization. Options trades feature a prominent details grid showing Type (CALL/PUT with color coding), Strike Price, and Expiration Date displayed directly below Entry/Target/Stop using the same 3-column layout for visual consistency.

A Performance Tracking System validates trade outcomes and tracks win rates. It includes a Performance-Based Grading System calibrated to actual win rates, with metrics like EV Score, Adjusted Weighted Accuracy, and Opposite Direction Rate. A Quantitative Timing Intelligence System provides data-backed entry/exit windows. The platform also includes a complete date filtering system for performance tracking.

The quantitative engine (v3.2.0) leverages three academically-proven signals: RSI(2) Mean Reversion with a 200-Day MA Filter (BOTH long and short), VWAP Institutional Flow, and Volume Spike Early Entry. It incorporates ADX Regime Filtering (ADX ≤30), Signal Confidence Voting (requiring 2+ signals, with exception for high-conviction SHORT trades at RSI>95), and extended trading window (9:30 AM - 3:00 PM ET). Stop losses are widened to 3.5% for stocks (was 2%), 5% for crypto (was 3%) based on academic research. A Hybrid AI+Quant system combines quantitative signals with AI fundamental analysis. AI-generated trades are subject to a four-layer risk validation framework enforcing a maximum 5% loss cap, minimum 2:1 R:R ratio, price sanity checks, and an extreme volatility filter. All generation methods prevent duplicate trades.

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