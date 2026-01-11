# Quant Edge Labs - Trading Platform

## Overview
Quant Edge Labs is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its core purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls. The platform is designed for research and educational purposes only, not financial advice. It features a dark-themed UI for rapid data scanning, aiming to offer a comprehensive, institutional-style research environment for individual traders focused on risk management and data integrity.

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
-   **Command Center (Unified Trading Hub)**: Consolidated workspace with 4 tabs:
    - **Analysis Tab**: Symbol analysis with confluence validation, Hot Symbols widget, portfolio overview, bot status, IV rank. Includes Contextual Intelligence Layer (Confluence Insights, Technical Insights, Position Size Calculator, Market Context Insights, News Insights).
    - **Bots Tab**: 4 trading bot cards (Options, Futures, Crypto, Small Account) with real-time stats, MarketOverviewWidget, ExpiryPatternInsights, WinRateWidget, and quick action links.
    - **Positions Tab**: AutoLottoDashboard for viewing all open positions and exit intelligence.
    - **Settings Tab**: Professional risk controls including stop-loss, take-profit, trailing stop, max position size, daily loss limits, and circuit breaker settings.
    - Key files: `client/src/pages/trading-engine.tsx`, `client/src/components/contextual-insights.tsx`, `client/src/components/auto-lotto-dashboard.tsx`
-   **Core Application**: Public informational pages, user authentication, trade desk with research briefs, live trading journal, market overview, and performance analytics.
-   **Research Tools**: Chart analysis, historical trade pattern library, Data Intelligence System, Loss Analysis System, and Data Integrity System.
-   **Automated Systems**: Auto-Lotto Bot for automated paper trading with sample size gating, and a Real-time Pricing Service.
-   **Specialized Intelligence**: Timing Intelligence System, "Prop Firm Mode", Market Scanner (Day Trade/Swing modes), Multi-Factor Analysis Engine, CT Tracker for crypto sentiment, Universal Idea Generator, and Platform Reports System.
-   **Catalyst Intelligence System**: Tracks SEC filings and government contracts, performing sentiment analysis.
-   **Polymarket Prediction Market Module**: Integrates with prediction markets for arbitrage detection.
-   **Unified Win Rate System**: Provides consistent win rate metrics.
-   **Watchlist Grading System**: Evaluates watchlist assets using quantitative technical analysis for a tier-based score (S-F).
-   **Elite Setup Trade Generator**: Converts high-grade watchlist items into small-account friendly trade ideas with strict risk management.
-   **Best Setups System**: Enforces trading discipline by highlighting top high-conviction setups daily/weekly. Enhanced conviction scoring integrates ML Intelligence (±20 points for direction alignment), hourly breakout confirmation (+15-20 for confirmed breakouts), and historical win rate by symbol (+15 for 70%+ win rate, -10 penalty for <40%).
-   **Adaptive Loss Intelligence System**: Learns from trading mistakes, diagnosing loss categories and adaptively adjusting bot parameters. Fully integrated across the platform:
    - **Universal Idea Generator**: HARD BLOCKS idea generation for symbols with `shouldAvoid=true` (3+ consecutive losses), returns null to prevent creation
    - **Auto-Lotto Bot**: Skips trades with `LOSS_COOLDOWN_BLOCK` signal when shouldAvoid is true
    - **UI Integration**: Trading Engine shows warning banners for symbols on cooldown; Trade Desk displays loss history badges with streak count and confidence adjustments
    - Key files: `server/loss-analyzer-service.ts`, `server/universal-idea-generator.ts` (line 274), `server/auto-lotto-trader.ts` (line 2714)
-   **Auto-Lotto Bot Risk Controls**: Advanced entry thresholds, confluence validation, post-loss cooldowns, tiered premium caps, and position sizing. Includes a "Pro Trader Checklist" and a DTE-Aware Smart Exit Strategy with tiered stop-loss logic and thesis revalidation. It features Momentum-Direction Alignment, Post-Exit Cooldown, an Exit Callback Hook System, and a Duplicate Position Guard.
-   **Unified Entry Gate System**: Centralized, regime-aware trading safeguards using a Market Context Service to analyze trading sessions and market regimes.
-   **Automations Hub UI**: Now consolidated into the Command Center's "Bots" tab. The separate /automations page has been removed to reduce redundancy.
-   **Beta Access Control System**: An invite-only beta mode with user fields for `hasBetaAccess` and `betaInviteId`, including grandfathered access for Admin/Pro users, invite redemption via API, protected frontend routes, and protected backend API endpoints.
-   **ML Intelligence System**: Comprehensive machine learning system with 5 core capabilities: Price Direction Prediction, Sentiment Analysis, Chart Pattern Recognition, Adaptive Position Sizing, and Market Regime Detection. It integrates with the Auto-Lotto Bot to boost/reduce confidence scores and has a dedicated dashboard.
-   **RBI Framework - Backtesting & Breakout Scanner**: Implements Research → Backtest → Implement framework with a backtesting module for various strategies and a breakout scanner detecting resistance/support levels with volume confirmation.
-   **Dynamic Mover Discovery System**: Runs every 15 minutes during market hours (8 AM - 5 PM CT) to fetch real-time most-active stocks, top gainers/losers from Yahoo Finance. Automatically injects discovered movers into the scanner universe even if they're not in the static ticker list. This ensures the platform never misses breakout stocks like CVNA, DASH, IWM that are moving but weren't pre-listed. Key files: `server/mover-discovery.ts`, `server/ticker-universe.ts` (800+ static tickers), `server/market-scanner.ts` (getExpandedUniverse combines static + discovered movers).
-   **Trade Idea Aggregation System**: Centralized ingestion pipeline that aggregates trade ideas from ALL sources into Trade Desk with quality gates:
    - **Sources**: Market Scanner (movers), Bullish Trend Scanner (momentum stocks), Watchlist Grading (S/A tier), Mover Discovery (emerging stocks)
    - **Quality Gates**: Deduplication (4-hour cooldown per symbol/source), source-specific confidence thresholds (65-75%), loss analyzer blocks (3+ consecutive losses), price validation (no penny stocks under $0.50)
    - **Admin Trigger**: `/api/trade-ideas/ingest-all` endpoint for manual aggregation from all sources
    - Key files: `server/trade-idea-ingestion.ts` (centralized module), plus ingestion helpers in `market-scanner.ts`, `bullish-trend-scanner.ts`, `watchlist-grading-service.ts`, `mover-discovery.ts`

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

## Unified Grading System (v4.0)

**IMPORTANT**: The platform now uses a single, unified grading contract defined in `shared/grading.ts`.

### Grading Philosophy
- **Primary metric**: `confidenceScore` (0-100) determines `probabilityBand` grade
- **Signal count**: Supplementary information displayed in tooltips, NOT the grade
- **Single source of truth**: Grades assigned at trade creation time and stored with the record

### Academic Scale (Standard)
| Grade | Score Range | Description |
|-------|-------------|-------------|
| A+ | 95%+ | Exceptional |
| A | 93-94% | Excellent |
| A- | 90-92% | Very strong |
| B+ | 87-89% | Strong |
| B | 83-86% | Good |
| B- | 80-82% | Above average |
| C+ | 77-79% | Average+ |
| C | 73-76% | Average |
| C- | 70-72% | Passing |
| D+/D/D- | 60-69% | Below average |
| F | <60% | Failing |

### Key Files
- `shared/grading.ts` - Unified grading contract (source of truth)
- `server/grading.ts` - Re-exports shared contract with legacy aliases
- Trade ideas store `probabilityBand` field - this is the authoritative grade

### Integration Points
All scanners and bots MUST use `getLetterGrade(confidenceScore)` from `shared/grading.ts` to assign grades. UI components should display the stored `probabilityBand` rather than recalculating.

## Documentation

### CALCULATIONS.md
Comprehensive reference of ALL platform calculations, scoring systems, and algorithms:
- Unified grading system with full academic scale
- Confidence score formulas with signal weights
- Technical indicators (RSI, MACD, ATR, ADX, Bollinger, VWAP, Ichimoku)
- Market regime detection logic
- Risk calculations and position sizing
- Loss analysis and symbol avoidance rules
- **Orphaned/underutilized features audit**

See `CALCULATIONS.md` for the complete technical reference.

## Future Plans

### Content Studio (Planned)
Auto-generates tweet-ready content from existing trading data for social engagement:

**Core Panels**:
1. **Market State Panel**: Real-time bias gauge (SPY direction, VIX level, risk sentiment)
2. **Key Level Engine**: VWAP, prior day H/L, support/resistance zones with proximity alerts
3. **Setup Watchlist**: Active setups with confidence scores and invalidation triggers
4. **Flow Snapshot**: Options activity, unusual volume, dark pool signals

**Auto-Tweet Features**:
- Generate "Morning Setup" tweets from top-graded ideas
- Market bias summaries with visual indicators
- Setup invalidation alerts when levels break
- Performance metrics (hit rate, avg R, time-in-trade)

**Public Metrics**:
- Win rate by grade tier
- Average R-multiple by setup type
- % of setups that reached target vs. invalidated

### Bot & Scanner Enhancements (Planned)
1. **Historical Pattern Integration**: Link scanner signals to past performance by symbol/setup type
2. **Cross-Scanner Confluence**: Boost confidence when multiple scanners flag same symbol
3. **Trend Continuation Scoring**: Weight setups aligned with higher timeframe trends
4. **Volume Profile Integration**: Add VPOC levels to key level engine