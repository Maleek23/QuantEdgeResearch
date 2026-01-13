# Quant Edge Labs - Trading Platform

## Overview
Quant Edge Labs is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its core purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls. The platform is designed for research and educational purposes only, not financial advice, offering a comprehensive, institutional-style research environment for individual traders focused on risk management and data integrity. The business vision is to empower individual traders with advanced analytical tools and a disciplined approach to market participation.

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
The platform utilizes a modern web stack: React 18, TypeScript, and Tailwind CSS (Shadcn UI, TanStack Query, Wouter) for the frontend, and an Express.js, TypeScript backend with PostgreSQL (Neon serverless) and Drizzle ORM. Authentication is session-based, supporting bcrypt, Replit Auth, and Google OAuth.

Two core analytical engines drive the platform:
1.  **AI Engine**: Integrates Anthropic Claude, OpenAI GPT, and Google Gemini for advanced market analysis.
2.  **Quantitative Engine**: Executes strategies such as RSI(2) Mean Reversion, VWAP Institutional Flow, Volume Spike Early Entry, and ADX Regime Filtering.

The UI/UX adopts a "Tech-Minimalist" design inspired by institutional trading interfaces, prioritizing dark mode, a specific color palette (slate, cyan, green, red, amber, purple, blue), glassmorphism-inspired components, and a clear typography hierarchy using Inter and JetBrains Mono.

Key features and architectural decisions include:
-   **Command Center (Unified Trading Hub)**: A consolidated workspace comprising Analysis, Bots, Positions, and Settings tabs. It integrates contextual intelligence, portfolio overviews, bot management, and professional risk controls (stop-loss, take-profit, trailing stop, max position size, daily loss limits, circuit breakers).
-   **Core Application**: Provides public informational pages, user authentication, a trade desk with research briefs, a live trading journal, market overviews, and performance analytics.
-   **Research Tools**: Includes chart analysis, a historical trade pattern library, Data Intelligence, Loss Analysis, and Data Integrity Systems.
-   **Automated Systems**: Features an Auto-Lotto Bot for automated paper trading with sample size gating and a Real-time Pricing Service.
-   **Specialized Intelligence**: Incorporates a Timing Intelligence System, "Prop Firm Mode", a Market Scanner (Day Trade/Swing modes), a Multi-Factor Analysis Engine, CT Tracker for crypto sentiment, a Universal Idea Generator, and a Platform Reports System.
-   **Catalyst Intelligence System**: Monitors SEC filings and government contracts, performing sentiment analysis.
-   **Polymarket Prediction Market Module**: Integrates for arbitrage detection.
-   **Unified Win Rate System**: Ensures consistent win rate metrics across the platform.
-   **Watchlist Grading System**: Evaluates assets using quantitative technical analysis, assigning tier-based scores (S-F).
-   **Elite Setup Trade Generator**: Converts high-grade watchlist items into small-account friendly trade ideas with strict risk management.
-   **Best Setups System**: Enforces trading discipline by highlighting top high-conviction setups, enhanced by ML Intelligence, hourly breakout confirmation, and historical win rates.
-   **Adaptive Loss Intelligence System**: Learns from trading mistakes, diagnoses loss categories, and adaptively adjusts bot parameters, integrating across idea generation, bot execution, and UI warnings.
-   **Auto-Lotto Bot Risk Controls**: Advanced entry thresholds, confluence validation, post-loss cooldowns, tiered premium caps, and position sizing, including a DTE-Aware Smart Exit Strategy and Duplicate Position Guard.
-   **Unified Entry Gate System**: Centralized, regime-aware trading safeguards utilizing a Market Context Service.
-   **Automations Hub UI**: Consolidated within the Command Center's "Bots" tab for streamlined access.
-   **Beta Access Control System**: Implements an invite-only beta mode with `hasBetaAccess` and `betaInviteId` fields, protected routes, and API endpoints.
-   **ML Intelligence System**: Provides Price Direction Prediction, Sentiment Analysis, Chart Pattern Recognition, Adaptive Position Sizing, and Market Regime Detection, integrating with the Auto-Lotto Bot.
-   **ML Retraining Service (Self-Improving Models)**: Automated pipeline that:
    -   Records all predictions with feature vectors and outcomes to `ml_training_samples` table
    -   Runs daily retraining at 3 AM CT on accumulated historical data (minimum 100 samples)
    -   Auto-adjusts signal weights based on prediction accuracy every 4 hours
    -   Deploys new models only if they beat current champion by 2%+ accuracy
    -   Model registry tracks all versions with performance metrics for rollback capability
    -   API endpoints at `/api/ml/retraining/*` for stats, weights, and manual trigger
-   **RBI Framework - Backtesting & Breakout Scanner**: Supports Research → Backtest → Implement framework with a backtesting module and a breakout scanner.
-   **Dynamic Mover Discovery System**: Continuously fetches real-time most-active stocks, top gainers/losers from Yahoo Finance, dynamically expanding the scanner universe.
-   **Trade Idea Aggregation System**: A centralized ingestion pipeline that aggregates trade ideas from various sources (Market Scanner, Bullish Trend Scanner, Watchlist Grading, Mover Discovery) with quality gates for deduplication, confidence thresholds, loss analyzer blocks, and price validation.
-   **Unified Grading System**: Uses a single `confidenceScore` (0-100) to determine a `probabilityBand` grade, stored at trade creation, with all scanners and bots using `getLetterGrade(confidenceScore)` from `shared/grading.ts`.

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

## Claude vs Gemini Migration Strategy

**Current Architecture**: Multi-provider AI with lazy-loaded clients in `server/ai-service.ts`
- **Primary**: Claude (Anthropic) - Best for financial reasoning, analysis quality
- **Backup**: OpenAI GPT - Fallback for rate limits
- **Alternative**: Gemini - Cost-efficient for bulk operations

**Recommendation**:
1. **Keep Claude as Primary** - Superior for financial/market analysis, nuanced reasoning
2. **Use Gemini for Bulk Operations** - Summaries, batch processing, cost savings
3. **Feature Flags Already in Place** - Switch providers via environment variables

**Cost Comparison**:
- Claude Sonnet: Highest quality for trading decisions
- Gemini Flash: ~10x cheaper for summaries and non-critical tasks
- GPT-4: Solid backup for rate limit fallback

## Platform Rules

**Directional Conviction Rules**:
- No flip-flopping between CALL and PUT
- Minimum 10-point confidence advantage required for directional signal
- 70% minimum confidence threshold for options (premium cost + time decay)
- Stock/crypto: 60% minimum confidence threshold

## Recent Cleanup (2026-01)
- Removed unused files: `home.tsx`, `account.tsx`, `trade-ideas.tsx`
- Fixed About page SidebarTrigger error
- Updated landing content to 6-engine system (ML, AI, Quant, Flow, Sentiment, Technical)