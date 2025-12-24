# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed for day-trading opportunities in US equities, options, and crypto markets. Its core purpose is to deliver educational, research-grade trade ideas, robust risk management, and real-time market analysis. The platform emphasizes strong risk controls, educational disclaimers, and a professional dark-themed UI optimized for rapid data scanning. It integrates real historical data, features adaptive learning capabilities, and manages membership through Discord roles, with the web platform serving as a public dashboard. The ambition is to provide a comprehensive, data-driven solution for quantitative trading research.

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
The UI features a Bloomberg-style dark theme with deep charcoal backgrounds, gradients, shadows, and glassmorphism. A consistent color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS provides enhanced styling. Key features include real-time price displays, detailed analysis modals, mobile responsiveness, an intelligent advisory system with dynamic R:R analysis, and advanced 3D Visual Analytics (Holographic Trading Floor, 3D Correlation Matrix Cube, 3D Brain Neural Network) using React Three Fiber and Three.js.

Recent UI/UX improvements focus on readability and reduced visual clutter, including an always-visible KPI dashboard (`Signal Pulse Stats Card`), a consolidated filter toolbar, a pagination system for trade listings, and accordion headers for summary statistics. The Trade Desk now features a dual-section layout separating active trades (card view) from closed trades (compact table view) for improved information density. A public-facing redesign (Tradvio-inspired) enhances the landing page with platform value propositions, "How It Works" workflow, Success Stories, Chart Database, Academy, and Blog sections. The Trade Desk has been simplified to a single unified feed displaying all trade ideas, with clear source badges (AI, Quant, Hybrid, Flow, News, Manual, Chart, Lotto) and horizontal source filter tabs with live counts. Draft trades are visually distinguished with badges and muted styling, with status filtering (All/Published/Draft) and promote-to-published workflow.

**Simplified Navigation (Dec 2025):**
The platform now features a cleaner, less overwhelming navigation structure:
- **Main Section** (no label): Home, Trade Desk, Trading Rules - core daily workflow
- **More Section**: Performance, Market, Chart Analysis - additional tools
- **System Section**: Settings, Admin (conditional on user role)

**Home Page (/home):**
A new daily "game plan" page serves as the main landing experience for authenticated users:
- Greeting with current date
- Weekly goal progress tracker (targeting $200/week)
- Today's Top 3 trade ideas (sorted by confidence)
- Quick risk reminder alert
- Quick action cards for Trade Desk and Trading Rules

The Trade Desk has been further simplified by removing the duplicate "Top Picks" section (now on Home page). Focus is on browsing/filtering all trade ideas with minimal controls (search + status filter + generate button).

### Technical Implementations & Feature Specifications
The frontend uses React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM, and Zod validation. Key features include a collapsible sidebar, symbol search, a metrics-focused dashboard, a unified trade ideas feed (Quant and AI generated), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The system includes a Holding Period Classification System, a quick actions dialog for trade idea creation, market catalyst tracking, a Weekend Preview Banner, and watchlist management. The QuantAI Bot auto-saves structured trade ideas. An AI-free Quantitative Idea Generator balances asset distribution with real-time entry prices. A Comprehensive User Settings System allows platform personalization. Options trades feature a prominent details grid and an info modal explaining various parameters.

A Performance Tracking System validates trade outcomes and tracks win rates, including a Performance-Based Grading System. A Quantitative Timing Intelligence System provides data-backed entry/exit windows. The Performance page offers 5 advanced analytics dashboards: Symbol Performance Leaderboard, Time-of-Day Heatmap, Engine Performance Over Time, Confidence Score Calibration, and Win/Loss Streak Tracker, using TanStack Query and Recharts.

The quantitative engine (v3.4.0) leverages RSI(2) Mean Reversion with a 200-Day MA Filter, VWAP Institutional Flow, Volume Spike Early Entry, ADX Regime Filtering, Signal Confidence Voting, and time-of-day filtering. Stop losses are set at 3.5% for stocks and 5% for crypto, with a standard 2:1 R:R. A Hybrid AI+Quant system combines quantitative signals with AI fundamental analysis.

A critical dual-layer trade validation framework ensures all trade ideas pass through Structural Validation and Risk Guardrails (max 5% loss, min 2:1 R:R, price sanity, volatility filters). News Catalyst Mode relaxes the R:R minimum to 1.5:1 when keywords are detected. All generation methods prevent duplicate trades and maintain comprehensive audit trails. The platform implements a two-tier data filtering system: User-Facing Mode (v3.0+ trades) and ML/Admin Mode (all historical trades).

The platform now supports CME futures trading (NQ, GC) with dedicated database schema, data services, adapted quant engine logic (tick-based targets, R:R ≥ 2.0), performance validation, and UI integration. Automated services run on a schedule for idea generation, news monitoring, flow scanning, and performance validation.

**Chart Analysis & Draft Trade Workflow (Nov 2025):**
Users can upload chart screenshots for AI-powered technical analysis. Chart analysis results automatically save as draft trade ideas (source="chart_analysis") with full validation. Draft trades display with visual distinction (badge + muted styling) and can be promoted to published status. Trade Desk features source-aware filtering with horizontal tabs (All, AI, Quant, Hybrid, Chart, Flow, News, Manual, Lotto) showing live counts, plus status toggle (All/Published/Draft). Tab counts dynamically respect active status filter.

### System Design Choices
The platform employs a multi-page architecture with user authentication via Replit Auth (OpenID Connect). Users can login/signup with Google, GitHub, X, Apple, or email/password. User sessions persist in PostgreSQL with 7-day TTL. The platform uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, User Data, and User Preferences. Data persistence is handled by a PostgreSQL database (provisioned via Replit) with Drizzle ORM. Access tiers include Free, Premium, and Admin, with a password-protected `/admin` panel using separate JWT authentication. Security features include OpenID Connect authentication, PostgreSQL session storage (connect-pg-simple), JWT authentication for admin panel with HTTP-only cookies, session tokens with expiration, rate limiting, and `requireAdmin`/`requirePremium` middleware. Performance statistics are read from the PostgreSQL database. The Trade Desk UI has been simplified for trader use with reduced visual clutter (3 key metrics instead of 5, consolidated 1-row filter toolbar, compact trade cards).

**Configuration Notes:**
- Vite HMR error overlay has been disabled in vite.config.ts (`server.hmr.overlay: false`) to prevent cosmetic dev-banner plugin errors from disrupting the user experience.

**Performance Optimization (Dec 2025):**
Tiered caching strategy balancing speed vs data freshness for day-trading:
- **Critical trading data** (trade-ideas, market-data): 30s refetch + 15s staleTime (~45s max staleness)
- **Admin monitoring** (alerts, alert-summary): 15s refetch + 10s staleTime (rapid incident response)
- **System metrics** (api-metrics, system-health, signal-gauge): 30s refetch + 15s staleTime
- **Secondary analytics** (catalysts): 1hr refetch + 30min staleTime (slow-changing data)
- **Server caching**: 60s price cache TTL, 5min engine-breakdown/performance-stats cache
- End-to-end latency target: <60s for all trading decisions

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