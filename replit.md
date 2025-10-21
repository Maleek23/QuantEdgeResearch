# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities in US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, robust risk management tools, and real-time market analysis. The platform emphasizes strong risk controls, clear educational disclaimers, and presents information via a professional dark-themed UI for rapid data scanning. It integrates real historical data for model accuracy, features adaptive learning, and operates on a public-access model managing membership tiers (Free vs. Premium) through Discord roles, with the web platform serving as a public dashboard.

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

A Comprehensive User Settings System allows platform personalization, persisting settings in PostgreSQL. A Performance Tracking System validates trade outcomes, tracks win rates, and aids strategy improvement. A Machine Learning System enhances trade ideas through historical performance analysis, including a Signal Intelligence page, Learned Pattern Analyzer, and Adaptive Confidence Scoring. A Quantitative Timing Intelligence System provides data-backed entry/exit windows aligned with confidence grading. The quantitative strategy uses a predictive approach, prioritizing RSI Divergence, MACD Crossover, Early Breakout Setups, Mean Reversion, and Volume Spikes, with realistic day-trading targets. A Performance Grading System tracks Market Win Rate and Quant Accuracy. Professional risk metrics (Sharpe Ratio, Max Drawdown, Profit Factor, Expectancy) are integrated, and ML training requires a minimum of 30 trades for reliability. Advanced 3D Visual Analytics are implemented for Signal Intelligence, featuring a 3D Correlation Matrix Cube and a 3D Brain Neural Network using React Three Fiber and Three.js.

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