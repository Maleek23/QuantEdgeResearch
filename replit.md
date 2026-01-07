# Quant Edge Labs - Trading Platform

## Overview
Quant Edge Labs is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its core purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls. The platform is designed for research and educational purposes only, not financial advice, and features a dark-themed UI for rapid data scanning. The project's ambition is to offer a comprehensive, institutional-style research environment for individual traders, focusing on risk management and data integrity.

## User Preferences
- All timestamps displayed in **America/Chicago (CT)** timezone with market session context
- Dark/light theme toggle (dark mode is primary)
- Educational disclaimers must be emphasized on every screen
- Clear risk/reward calculations and position sizing tools
- Fresh research briefs highlighted immediately upon opening
- Platform functions fully without external AI dependencies (quantitative fallback)
- Helpful error messages for API billing, rate limits, and authentication issues
- Liquidity warnings for penny stocks and low-float securities

## System Architecture
The platform employs a modern web stack: React 18, TypeScript, and Tailwind CSS (Shadcn UI, TanStack Query, Wouter) for the frontend, and an Express.js, TypeScript backend with PostgreSQL (Neon serverless) and Drizzle ORM. Authentication uses session-based methods, supporting bcrypt, Replit Auth, and Google OAuth.

The system integrates two core analytical engines:
1.  **AI Engine**: Leverages Anthropic Claude, OpenAI GPT, and Google Gemini for advanced analysis.
2.  **Quantitative Engine**: Implements strategies such as RSI(2) Mean Reversion, VWAP Institutional Flow, Volume Spike Early Entry, and ADX Regime Filtering.

The UI/UX follows a "Tech-Minimalist" design inspired by institutional trading interfaces, featuring a dark-mode-first approach, a specific color palette (slate, cyan, green, red, amber, purple, blue), glassmorphism-inspired components, and a clear typography hierarchy using Inter and JetBrains Mono.

Key features include:
-   **Core Application**: Public informational pages, user authentication, main dashboard, trade desk with research briefs, live trading journal, market overview, and performance analytics.
-   **Research Tools**: Chart analysis, historical trade pattern library, Data Intelligence System, Loss Analysis System, and Data Integrity System.
-   **Automated Systems**: Auto-Lotto Bot for automated paper trading with sample size gating, and a Real-time Pricing Service.
-   **Specialized Intelligence**: Timing Intelligence System, "Prop Firm Mode" for conservative futures trading, Market Scanner (with Day Trade and Swing modes), Multi-Factor Analysis Engine, CT Tracker for crypto sentiment, Universal Idea Generator, and Platform Reports System.
-   **Catalyst Intelligence System**: Tracks SEC filings and government contracts, performing sentiment analysis.
-   **Polymarket Prediction Market Module**: Integrates with prediction markets to detect arbitrage opportunities.
-   **Unified Win Rate System**: Provides consistent win rate metrics across the platform.
-   **Watchlist Grading System**: Evaluates watchlist assets using quantitative technical analysis to assign a tier-based score (S-F).
-   **Elite Setup Trade Generator**: Converts high-grade watchlist items into small-account friendly trade ideas with strict risk management ($300 budget, $60 max position, $6 max risk per trade).
-   **Best Setups System**: Enforces trading discipline by highlighting top 5 high-conviction setups daily/weekly, calculated via a comprehensive conviction score formula.
-   **Adaptive Loss Intelligence System**: Learns from trading mistakes, diagnosing loss categories and adaptively adjusting bot parameters and implementing symbol cooldowns.
-   **Auto-Lotto Bot Risk Controls**: Advanced entry thresholds, confluence validation, post-loss cooldowns, tiered premium caps, and position sizing. Includes a "Pro Trader Checklist" for earnings, liquidity, and volume checks, and a DTE-Aware Smart Exit Strategy with tiered stop-loss logic and thesis revalidation. Integrates with Exit Intelligence for smart position management and Theta Protection System for DTE-based option filtering. **Momentum-Direction Alignment (Jan 2026)**: Bot now STRICTLY aligns option type with price momentum - CALLs only when stock is bullish (+0.5%+), PUTs only when bearish (-0.5% or less). Neutral conditions are skipped entirely. This prevents wrong-direction trades like buying PUTs on +11% movers. **Post-Exit Cooldown (Jan 2026)**: 15-minute cooldown after ANY position exit (win or loss) to prevent infinite re-entry loops that artificially inflate P&L by repeatedly trading the same profitable position. **Exit Callback Hook System (Jan 2026)**: Centralized exit callback registered at server startup in routes.ts - ALL position closes now trigger cooldowns via paper-trading-service's registerExitCallback connecting to auto-lotto-trader's recordExitCooldown. This fixes the root cause where exits from checkStopsAndTargets bypassed cooldown system entirely. **Duplicate Position Guard**: Prevents multiple positions on same symbol/optionType/strike combination with proper key format.
-   **Unified Entry Gate System**: Centralized, regime-aware trading safeguards using a Market Context Service to analyze trading sessions and market regimes. Applies session-specific confidence multipliers and block entries based on strategy type, market exhaustion, and Exit-Intelligence veto.
-   **Automations Hub UI**: A restructured interface prominently displaying 4 main portfolio trading bots (Options, Futures, Crypto, Small Account) with real-time stats, simplified tab navigation, and quick actions.
-   **Beta Access Control System**: An invite-only beta mode with user fields for `hasBetaAccess` and `betaInviteId`. Features grandfathered access for Admin/Pro users, invite redemption via API, protected frontend routes (`withBetaProtection` HOC), and protected backend API endpoints (`requireBetaAccess` middleware). Includes security features like rate limiting, input sanitization, and failed attempt logging.

## External Dependencies

### Market Data
-   **Coinbase WebSocket:** Real-time crypto prices.
-   **Yahoo Finance:** Real-time quotes, discovery, historical stock/futures data.
-   **CoinGecko:** Cryptocurrency metadata.
-   **Tradier:** Options chains, delta targeting, live options pricing.
-   **Alpha Vantage:** Financial news feeds, earnings calendar.

### AI Providers
-   **Anthropic (Claude Sonnet 4):** Primary AI engine.
-   **OpenAI (GPT-4):** Backup for fundamental analysis.
-   **Google (Gemini):** Alternative AI analysis.

### Catalyst Intelligence
-   **SEC EDGAR:** SEC filing ingestion (10-K, 10-Q, 8-K, S-1, 4 insider trades).
-   **USASpending.gov:** Government contract tracking.

### Other Integrations
-   **Discord:** Webhook notifications (A-grade only quality filtering for flow alerts).

## Recent Updates (Jan 2026)

### Dashboard Accuracy Fixes
- **Market Calendar Fix**: Fixed `getETTime()` and `getETDateString()` functions to use actual current ET time instead of hardcoded test data. Fixed `isUSMarketOpen()` to correctly return `isOpen: false` after 4PM ET (was incorrectly returning `isOpen: true` for "Late Session").
- **Bot Status Aggregation**: `/api/auto-lotto/bot-status` now aggregates data from ALL auto-lotto portfolios (Options, Futures, Crypto, Small Account, Prop Firm) instead of looking for a single non-existent "Auto-Lotto Bot" portfolio.
- **Performance Summary Consistency**: `/api/auto-lotto/performance-summary` now uses `exitTime OR closedAt` for position close detection and includes all portfolio types (options, futures, crypto, prop firm).
- **P&L Calculation Fix**: Dashboard now uses `totalValue` field for accurate P&L display instead of `cashBalance`.
- **Bot Activity Status**: Correctly displays "SCANNING" during market hours and "MARKET CLOSED" during after hours.