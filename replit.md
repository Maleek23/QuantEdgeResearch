# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform focused on day-trading opportunities in US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, robust risk management, and real-time market analysis. The platform emphasizes strong risk controls, educational disclaimers, and a professional dark-themed UI optimized for rapid data scanning. It integrates real historical data, features adaptive learning capabilities, and manages membership through Discord roles, with the web platform serving as a public dashboard. The ambition is to provide a comprehensive, data-driven solution for quantitative trading research.

## User Preferences
All timestamps should be displayed in America/Chicago timezone with market session context.
The UI features both dark and light theme modes with a toggle button for user preference.
Educational disclaimers must be emphasized (not financial advice).
Clear and precise risk/reward calculations and position sizing tools are required.
The platform should highlight fresh, actionable trade ideas immediately upon opening.
The platform should function fully even without external AI dependencies, offering a quantitative idea generator alternative.
Provide helpful error messages for API billing, rate limits, and authentication issues.
Liquidity warnings should be displayed for penny stocks and low-float securities.
No personalized financial advice should be offered; it is for research purposes only.

## System Architecture

### UI/UX Decisions
The UI features a Bloomberg-style dark theme with a consistent color palette (green for bullish, red for bearish, amber for neutral/warning, blue for primary actions). Typography uses Inter for UI and JetBrains Mono for financial data. Key features include real-time price displays, detailed analysis modals, mobile responsiveness, an intelligent advisory system, and advanced 3D Visual Analytics (Holographic Trading Floor, 3D Correlation Matrix Cube, 3D Brain Neural Network) using React Three Fiber and Three.js. Recent UI/UX improvements focus on readability, reduced visual clutter (e.g., `Signal Pulse Stats Card`, consolidated filter toolbar, pagination), and a streamlined Trade Desk with distinct sections for active and closed trades. A public-facing redesign enhances the landing page. The Trade Desk now features a single unified feed for all trade ideas with source badges and horizontal filter tabs. Draft trades are visually distinguished.

**Simplified Navigation:**
- **Main Section**: Home, Trade Desk, Trading Rules
- **More Section**: Performance, Market, Chart Analysis
- **System Section**: Settings, Admin (conditional)

**Home Page:** A daily "game plan" page for authenticated users, including a greeting, weekly goal tracker, top 3 trade ideas, risk reminder, and quick action cards.

### Technical Implementations & Feature Specifications
The frontend uses React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Core features include a collapsible sidebar, symbol search, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification, quick actions for trade idea creation, market catalyst tracking, a Weekend Preview Banner, and watchlist management. The QuantAI Bot auto-saves structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution. A Comprehensive User Settings System allows personalization. Options trades feature a prominent details grid and info modal.

A Performance Tracking System validates trade outcomes and tracks win rates, including a Performance-Based Grading System. A Quantitative Timing Intelligence System provides data-backed entry/exit windows. The Performance page offers 5 advanced analytics dashboards: Symbol Performance Leaderboard, Time-of-Day Heatmap, Engine Performance Over Time, Confidence Score Calibration, and Win/Loss Streak Tracker.

The quantitative engine (v3.7.0) leverages RSI(2) Mean Reversion with a 200-Day MA Filter, VWAP Institutional Flow, Volume Spike Early Entry, ADX Regime Filtering, Signal Confidence Voting, time-of-day filtering, and **chart pattern pre-validation**. Stop losses are set at 3.5% for stocks and 5% for crypto, with a standard 2:1 R:R. A Hybrid AI+Quant system combines quantitative signals with AI fundamental analysis. Realistic live win rate expectation is 55-65%, with trading cost modeling for slippage, commission, and spread.

**Strict Chart Pattern Validation:** Chart validation is now REQUIRED for standard trade ideas (rejected if without chart data, except lotto/news trades), ensuring technical confirmation.

**Dynamic Exit Time Recalculation:** Exit times fluctuate dynamically based on estimated live volatility, using price movement from entry and stop/target spread as proxies.

**Chart Analysis Pre-Validation:** All trade ideas are pre-validated against 7 chart patterns and support/resistance levels. Trade targets and stops are adjusted accordingly, and conflicting ideas are rejected. Confidence is boosted for confirmed setups.

A dual-layer trade validation framework ensures all trade ideas pass Structural Validation and Risk Guardrails (max 5% loss, min 2:1 R:R). News Catalyst Mode relaxes R:R to 1.5:1. Duplicate trades are prevented, and audit trails are maintained. A two-tier data filtering system exists for User-Facing Mode and ML/Admin Mode.

**Minimum Loss Threshold:** A platform-wide 3% minimum loss threshold treats losses below this as "breakeven," excluding them from win/loss calculations for performance statistics.

The platform supports CME futures trading (NQ, GC) with dedicated schema, data services, adapted quant engine logic, and UI integration. Automated services run on a schedule for idea generation, news monitoring, flow scanning, and performance validation.

**Chart Analysis & Draft Trade Workflow:** Users can upload chart screenshots for AI-powered technical analysis, saving results as draft trade ideas. Draft trades are visually distinguished and can be promoted to published status. The Trade Desk features source-aware filtering and status toggles.

### System Design Choices
The platform employs a multi-page architecture with user authentication via Replit Auth (OpenID Connect) supporting Google, GitHub, X, Apple, or email/password. User sessions persist in PostgreSQL with a 7-day TTL. It uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, User Data, and User Preferences. Data persistence uses PostgreSQL with Drizzle ORM. Access tiers include Free, Premium, and Admin, with a password-protected `/admin` panel using separate JWT authentication. Security features include OpenID Connect, PostgreSQL session storage, JWT authentication with HTTP-only cookies, session tokens, rate limiting, and `requireAdmin`/`requirePremium` middleware.

**Subscription Tier System:** Two-tier model for beta launch (Pro tier reserved for future).
-   **Free**: Limited ideas, delayed market data, limited performance history, stocks & crypto only, limited watchlist.
-   **Advanced**: Unlimited ideas, real-time market data, chart analyses, AI generations, full performance history, Discord alerts, advanced analytics, data export, extended watchlist.
Admin users have unlimited access.

**Performance Optimization:** Tiered caching strategy:
-   Critical trading data: 30s refetch + 15s staleTime
-   Admin monitoring: 15s refetch + 10s staleTime
-   System metrics: 30s refetch + 15s staleTime
-   Secondary analytics: 1hr refetch + 30min staleTime
-   Server caching: 60s price cache TTL, 5min engine-breakdown/performance-stats cache
End-to-end latency target: <60s for all trading decisions.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap, discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, discovery, historical data).
-   **Alpha Vantage API:** Breaking news (NEWS_SENTIMENT endpoint), fallback for stock historical data, earnings calendar.
-   **Tradier API:** Options data (chains, delta targeting, live pricing).
-   **Databento API:** Futures data (NQ E-mini Nasdaq-100, GC Gold futures - real-time pricing, contract specifications, CME data).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.