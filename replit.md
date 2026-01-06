# Quant Edge Labs - Trading Platform

## Overview
Quant Edge Labs is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its core purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls. The platform is designed for research and educational purposes only, not financial advice, and features a dark-themed UI for rapid data scanning.

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
The platform utilizes a modern web stack: React 18, TypeScript, and Tailwind CSS (Shadcn UI, TanStack Query, Wouter) for the frontend, and an Express.js, TypeScript backend with PostgreSQL (Neon serverless) and Drizzle ORM. Authentication is handled via session-based methods, supporting bcrypt, Replit Auth, and Google OAuth.

The system integrates two core analytical engines:
1.  **AI Engine**: Leverages Anthropic Claude, OpenAI GPT, and Google Gemini for advanced analysis.
2.  **Quantitative Engine**: Implements strategies such as RSI(2) Mean Reversion, VWAP Institutional Flow, Volume Spike Early Entry, and ADX Regime Filtering.

The UI/UX adheres to a "Tech-Minimalist" design philosophy inspired by institutional trading interfaces, featuring a dark-mode-first approach, a specific color palette (slate, cyan, green, red, amber, purple, blue), glassmorphism-inspired components, and a clear typography hierarchy using Inter and JetBrains Mono.

Key features include:
-   **Core Application**: Public informational pages, user authentication, main dashboard, trade desk with research briefs, live trading journal, market overview, and performance analytics.
-   **Research Tools**: Chart analysis, historical trade pattern library, Data Intelligence System, Loss Analysis System for trade post-mortem, and a Data Integrity System for consistent statistics.
-   **Automated Systems**: Auto-Lotto Bot for automated paper trading with sample size gating, and a Real-time Pricing Service consolidating market data.
-   **Specialized Intelligence**: Timing Intelligence System for optimal entry/exit, "Prop Firm Mode" for conservative futures trading, Market Scanner, Multi-Factor Analysis Engine, CT Tracker for crypto sentiment, Universal Idea Generator, and Platform Reports System.
-   **Catalyst Intelligence System**: Tracks SEC filings and government contracts, performing sentiment analysis and generating catalyst scores.
-   **Polymarket Prediction Market Module**: Integrates with prediction markets to detect arbitrage opportunities based on news sentiment.
-   **Unified Win Rate System**: Provides consistent win rate metrics (Equities, Options, Overall) across the platform, calculated based on defined trade outcomes.
-   **Watchlist Grading System**: Evaluates watchlist assets using quantitative technical analysis (RSI, momentum, ADX, volume, moving averages) to assign a tier-based score (S-F).
-   **Adaptive Loss Intelligence System**: Learns from trading mistakes by diagnosing loss categories and adaptively adjusting bot parameters (confidence, stop loss, position size) and implementing symbol cooldowns.
-   **Auto-Lotto Bot Risk Controls (Jan 2026)**: 
    - **Entry thresholds**: Min 65% confidence required (B-grade minimum), 70%+ for batch entries, 85%+ for immediate execution
    - **Confluence validation**: MIN_CONFLUENCE_SCORE = 55 (raised from 35), priority ticker boost reduced from +15 to +5
    - **Post-loss cooldowns**: 30 min after losses, symbol blacklisting for repeat losers
    - **Tiered premium caps**: A+/A grade = $1.50 max, B+/B grade = $1.00 max, below B = $0.50 max (supports quality plays, not just cheap lottos)
    - **Position sizing**: $150 max per trade (can buy 1x $1.50 option or 2-3x cheaper options)
    - **Discord alerts**: B-grade or better only, max $2.00 premium ($1000 for 5 contracts), rate limited 3/min with 20s spacing
    - **Pro Trader Checklist (Jan 2026)**: 
      - Earnings check: Skip trades within 3 days of earnings (IV crush risk)
      - Liquidity check: Bid-ask spread must be <20% of premium
      - Volume/OI check: Min 50 open interest, 10 volume
      - Option direction fix: All options are `direction='long'` (we BUY, not sell)

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