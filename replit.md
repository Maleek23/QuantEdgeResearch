# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls and educational disclaimers. The platform focuses on a dark-themed UI for rapid data scanning and is designed for research and educational purposes only, not financial advice.
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