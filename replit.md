# Quant Edge Labs - Trading Platform

## Overview
Quant Edge Labs is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls and educational disclaimers. The platform focuses on a dark-themed UI for rapid data scanning and is designed for research and educational purposes only, not financial advice.
**Tagline**: "Multiple Engines, One Edge"

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
The platform features a React 18, TypeScript, and Tailwind CSS frontend (Shadcn UI, TanStack Query, Wouter) and an Express.js, TypeScript backend with PostgreSQL (Neon serverless) and Drizzle ORM. Authentication uses session-based methods with bcrypt, Replit Auth, and Google OAuth. The system integrates two core engines: an AI Engine (Anthropic Claude, OpenAI GPT, Google Gemini) and a Quantitative Engine (RSI(2) Mean Reversion, VWAP Institutional Flow, Volume Spike Early Entry, ADX Regime Filtering).

UI/UX is designed with a "Tech-Minimalist" philosophy, drawing inspiration from institutional trading interfaces. It features a dark-mode-first design, a specific color palette (slate, cyan, green, red, amber, purple, blue), glassmorphism-inspired components, and a clear typography hierarchy using Inter (primary) and JetBrains Mono (data/code).

Core features include public informational pages, user authentication, a main application dashboard, a trade desk with research briefs, a live trading journal, market overview, performance analytics, and various research tools like chart analysis and a historical trade pattern library. The platform includes a Data Intelligence System for historical performance analytics, a Loss Analysis System for automatic post-mortem of failed trades, and a Data Integrity System ensuring consistent statistics across the platform. An Auto-Lotto Bot provides an automated paper trading system with sample size gating for performance metrics. An Educational Blog System offers content on trading skills, while a Real-time Pricing Service consolidates market data from various providers. A Chart Analysis System provides comprehensive technical pattern recognition and support/resistance detection. Additional features include a Timing Intelligence System for optimal trade entry/exit windows, a "Prop Firm Mode" for conservative futures trading with specific risk management, a Market Scanner tracking 500+ stocks across multiple timeframes, a Multi-Factor Analysis Engine with conviction-tiered scoring, a CT Tracker for crypto influencer sentiment, a Universal Idea Generator for trade ideas from various sources, and a Platform Reports System for daily, weekly, and monthly analytics.

## External Dependencies

### Market Data
- **Coinbase WebSocket:** Real-time crypto prices
- **Yahoo Finance:** Real-time quotes, discovery, historical stock/futures data
- **CoinGecko:** Cryptocurrency metadata (fallback: Yahoo Finance)
- **Tradier:** Options chains, delta targeting, and live options pricing
- **Alpha Vantage:** Financial news feeds and earnings calendar

### AI Providers
- **Anthropic (Claude Sonnet 4):** Primary AI engine.
- **OpenAI (GPT-4):** Backup for fundamental analysis.
- **Google (Gemini):** Alternative AI analysis.

### Catalyst Intelligence
- **SEC EDGAR:** SEC filing ingestion (10-K, 10-Q, 8-K, S-1, 4 insider trades)
- **USASpending.gov:** Government contract tracking with award amounts

### Other Integrations
- **Discord:** Webhook notifications.

## Catalyst Intelligence System

The platform includes a **Catalyst Intelligence System** that tracks SEC filings and government contracts to enhance trading decisions:

### Components
- **SEC EDGAR Integration:** Fetches company filings (10-K, 10-Q, 8-K, S-1, Form 4) with sentiment classification (bullish/bearish/neutral)
- **USASpending.gov Integration:** Tracks government contract awards by company name
- **Catalyst Scoring Engine:** Calculates -100 to +100 scores based on recent catalyst events
- **Auto-Lotto Bot Integration:** Three-tier confidence boost system (±5, ±8, ±12) based on catalyst strength
- **Frontend Panel:** CatalystIntelligencePanel component displays SEC filings, gov contracts, and aggregate scores

### API Endpoints
- `GET /api/catalysts/symbol/:ticker` - Get all catalysts and score for a symbol
- `GET /api/catalysts/upcoming` - Get upcoming catalyst events
- `POST /api/catalysts/refresh` - Refresh catalyst data for specified tickers
- `GET /api/sec-filings/:ticker` - Get SEC filings for a ticker
- `GET /api/gov-contracts/:ticker` - Get government contracts for a ticker
- `POST /api/catalysts/score` - Calculate catalyst score for a symbol

### Database Tables
- `sec_filings` - SEC EDGAR filing records with sentiment analysis
- `sec_filing_signals` - Extracted signals from filings (insider trades, etc.)
- `government_contracts` - USASpending.gov contract records
- `catalyst_events` - Unified catalyst event timeline
- `symbol_catalyst_snapshots` - Aggregated catalyst scores per symbol

### Scheduled Polling
- Catalyst data refreshes every 30 minutes for priority tickers (AAPL, MSFT, GOOGL, etc.)

## Polymarket Prediction Market Module

The platform includes a **Polymarket Integration** for news-driven prediction market arbitrage detection:

### Components
- **Market Discovery:** Fetches trending prediction markets with volume and liquidity data
- **News-Market Matching:** Keyword analysis matches breaking news to relevant prediction markets
- **Arbitrage Detection:** Calculates edge based on sentiment vs. current prices
- **Paper Trading:** Generates paper trade signals with risk/reward parameters

### API Endpoints
- `GET /api/polymarket/trending` - Get trending prediction markets (admin only)
- `GET /api/polymarket/opportunities` - Scan for arbitrage opportunities using recent news
- `POST /api/polymarket/scan` - Trigger manual scan for prediction market opportunities (admin only)

### Configuration
- Scans run every 30 minutes via cron job
- Minimum 5% edge required for opportunity detection
- Minimum 55% confidence required for paper trade generation
- Uses `assetType: 'prediction'` and `source: 'prediction-market'` for analytics segregation

### Technical Notes
- Markets matched via keyword extraction and category detection
- Categories: politics, crypto, tech, sports, entertainment, finance, legal, science
- Sentiment analysis from Alpha Vantage news feeds drives edge calculations

## Unified Win Rate System

The platform uses a **unified win rate methodology** that provides consistent metrics across all endpoints:

### Segmented Win Rates
- **Equities Win Rate**: Stocks, crypto, futures (non-options, non-flow/lotto)
- **Options Win Rate**: Options + flow scanner + lotto scanner trades
- **Overall Win Rate**: All trades combined (used everywhere for consistency)

### Win Rate Calculation
- **Win**: Trade hit target price (`outcomeStatus = 'hit_target'`)
- **Loss**: Trade hit stop loss AND loss > 3% threshold (`outcomeStatus = 'hit_stop' && percentGain <= -3%`)
- **Excluded**: Breakeven trades (loss < 3%), expired trades, open trades

### Data Source
- Uses `allTradesForSegmented` which includes:
  - All non-buggy trades (`excludeFromTraining = false`)
  - Current-gen engine versions only (v3.0+)
  - All asset types and sources (equities AND options)

### Display
- Performance Dashboard KPI strip shows: `EQ 71% | OPT 80% | ALL 77%`
- Tooltips reveal W/L breakdown for each segment
- All other components use `stats.overall.winRate` (unified methodology)

### Data Integrity Audit
- `GET /api/audit/data-integrity` - Independent reconciliation of win/loss calculations
- Recomputes stats from raw data using canonical helpers and compares to performance stats
- Canonical helpers used: `applyCanonicalPerformanceFilters`, `getDecidedTrades`, `isRealLoss`
- Returns: reconciliation checks (pass/fail), sample trades, methodology documentation

### Outcome Display Styling
All trade outcome displays use canonical helpers from `client/src/lib/signal-grade.ts`:
- `getTradeOutcomeStyle(outcomeStatus)` - Returns color class based on outcome status
- `getPnlColor(outcomeStatus, percentGain)` - Returns P&L color class respecting win rate methodology
- **Color mapping**: WIN (green) for hit_target, LOSS (red) for hit_stop, EXPIRED (amber) for expired trades
- **Critical**: Always use `getPnlColor()` instead of raw percentGain-based coloring to ensure expired trades show neutral amber styling
- Files using these utilities: performance.tsx, trade-audit.tsx, data-audit-center.tsx, chart-database.tsx, trade-idea-block.tsx, trade-idea-detail-modal.tsx, closed-trades-table.tsx

## Render Deployment

### Required Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (Neon serverless)
- `SESSION_SECRET` - Random 32+ character string for session encryption
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (for authentication)
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

### Optional Environment Variables
- `STRIPE_SECRET_KEY` - For billing features (disabled if not set)
- `ANTHROPIC_API_KEY` - For Claude AI analysis
- `OPENAI_API_KEY` - For GPT-4 analysis
- `TRADIER_API_KEY` - For options data
- `ALPHA_VANTAGE_API_KEY` - For news feeds

### Authentication Notes
- **Replit Auth** is only available when running on Replit (requires `REPL_ID`)
- On Render/external hosting, Replit Auth is automatically disabled
- Use **Google OAuth** for authentication on Render deployments
- Google OAuth requires callback URL: `https://your-domain.com/auth/google/callback`