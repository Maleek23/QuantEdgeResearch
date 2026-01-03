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

Core features include public informational pages, user authentication, a main application dashboard, a trade desk with research briefs, a live trading journal, market overview, performance analytics, and various research tools like chart analysis and a historical trade pattern library. The platform includes a Data Intelligence System for historical performance analytics, a Loss Analysis System for automatic post-mortem of failed trades, and a Data Integrity System ensuring consistent statistics across the platform. An Auto-Lotto Bot provides an automated paper trading system with sample size gating for performance metrics. An Educational Blog System offers content on trading skills, while a Real-time Pricing Service consolidates market data from various providers. A Chart Analysis System provides comprehensive technical pattern recognition and support/resistance detection.

## External Dependencies

### Market Data
- **Coinbase WebSocket:** Real-time crypto prices (~1s latency) for 20 major coins
- **Yahoo Finance:** Real-time quotes, discovery, historical stock/futures data
- **CoinGecko:** Cryptocurrency metadata, market cap, 24h stats (fallback: Yahoo Finance)
- **Tradier:** Options chains, delta targeting, and live options pricing
- **Alpha Vantage:** Financial news feeds and earnings calendar

### Real-Time Price Service
Located in `server/realtime-price-service.ts`:
- **Crypto:** Coinbase WebSocket (`wss://ws-feed.exchange.coinbase.com`) - sub-second updates
- **Futures:** Yahoo Finance polling every 10 seconds (NQ, ES, GC)
- Status endpoint: `GET /api/realtime-status` - shows connection status and all live prices
- Automatic reconnection on WebSocket disconnect

### AI Providers
- **Anthropic (Claude Sonnet 4):** Primary AI engine and research assistant.
- **OpenAI (GPT-4):** Backup for fundamental analysis.
- **Google (Gemini):** Alternative AI analysis.

### Other Integrations
- **Discord:** Webhook notifications.

## Magic UI Components
Custom animated components located in `client/src/components/magicui/`:

- **NumberTicker:** Animated number counting for price displays (supports prefix/suffix, decimal places)
- **ShimmerButton:** Button with animated shimmer effect for premium CTAs
- **BorderBeam:** Glowing animated border beam effect for card highlights
- **SparklesText:** Text with animated sparkle particles (available for gain indicators)

Tailwind keyframes configured: `border-beam`, `shimmer-slide`, `spin-around`, `pulse-glow`

Usage:
- BorderBeam on Options (purple) and Futures (cyan) portfolio cards in watchlist-bot
- NumberTicker for animated balance/P&L displays
- ShimmerButton on landing page CTA sections

## Timing Intelligence System
Located in `server/timing-intelligence.ts`, this system calculates optimal entry/exit windows for trades.

**Holding Period Classification:**
- **Day trades:** Exit by market close same day (4:00 PM ET)
- **Swing trades:** Exit +3 trading days at market close (weekends skipped)
- **Position trades:** Exit +10 trading days at market close (weekends skipped)

**Auto-Promotion Logic (when no explicit holdingPeriod provided):**
1. Position: confidence >= 80% AND low volatility
2. Swing: confidence >= 65% AND (low OR normal volatility)
3. Day: default

**Key Fields:**
- `holdingPeriod`: Explicit override ('day' | 'swing' | 'position')
- `exitWindowMinutes`: Always recalculated from final `exitBy` timestamp for consistency
- `exitBy`: ISO timestamp of exit deadline

## Prop Firm Mode
Located in `server/auto-lotto-trader.ts`, Prop Firm Mode is a conservative futures trading system designed for funded account evaluations (e.g., Topstep).

**Account Parameters:**
- Starting Capital: $50,000
- Daily Loss Limit: $1,000
- Max Drawdown: $2,500
- Profit Target: $3,000
- Max Contracts: 2 (NQ only)

**Risk Management:**
- 15-point stop loss, 30-point target (2:1 R:R)
- Force-liquidation when risk limits are breached
- Only trades during CME hours and optimal sessions (9:30-11:00 AM, 2:00-3:30 PM CT)
- Requires 70%+ confidence score for entry

**P&L Calculation:**
- Futures use point-based P&L with contract multipliers:
  - NQ (E-mini Nasdaq): $20 per point
  - GC (Gold): $100 per point
- Options use $100 multiplier (100 shares per contract)
- `closePaperPosition` in `server/storage.ts` is the single source of truth for portfolio updates

**Data Architecture:**
- Each bot has separate portfolios: options, futures, crypto, prop-firm
- Daily P&L tracked in-memory (`propFirmDailyPnL`), resets at start of each trading day
- Paper positions use flat $100 margin per contract (not full notional value)

## Market Scanner
Located in `server/market-scanner.ts`, the Market Scanner tracks 500+ stocks across multiple timeframes.

**Stock Universe Categories:**
- **sp500:** 155 symbols including S&P 500 components and major tech stocks
- **growth:** 70 growth/momentum stocks (AI, quantum computing, crypto miners, nuclear)
- **penny:** 50 penny stocks (EVs, space, clean energy, biotech)
- **etf:** 50 ETFs (index, sector, leveraged)
- **all:** Combined universe (325+ unique symbols)

**API Endpoints:**
- `GET /api/market-scanner` - Scan stocks by category, with optional historical data
- `GET /api/market-scanner/movers` - Get top gainers/losers by timeframe
- `GET /api/market-scanner/sectors` - Sector performance via ETF proxies

**Timeframes:**
- day: Daily change
- week: 5-day change
- month: 22-day change
- ytd: Year-to-date change
- year: 52-week change

**Data Source:**
- Yahoo Finance API with 5-minute cache TTL
- Batch processing (10 stocks at a time, 100ms delay between batches)
- Automatic rate limiting and error handling

## CT Tracker (Crypto Twitter Tracker)
Located in `client/src/pages/ct-tracker.tsx`, tracks crypto influencer calls and sentiment.

**Features:**
- Track Twitter/X, Bluesky, Reddit, Discord, Telegram influencers
- Auto-detect ticker mentions and sentiment (bullish/bearish/neutral)
- Performance tracking for influencer calls
- Top trending tickers analysis

**Auto-Follow Trades:**
- Toggle per source to automatically copy trades from tracked influencers
- Default max position size: $100 (designed for small accounts)
- Uses real-time crypto prices from Coinbase WebSocket for accurate entry pricing
- API: `PATCH /api/ct/sources/:id` with `autoFollowTrades: boolean, maxAutoTradeSize: number`

**API Endpoints:**
- `GET /api/ct/sources` - List tracked influencer sources
- `POST /api/ct/sources` - Add new source
- `PATCH /api/ct/sources/:id` - Update source settings (auto-follow, etc.)
- `DELETE /api/ct/sources/:id` - Remove source
- `GET /api/ct/mentions` - Get recent mentions with sentiment
- `GET /api/ct/top-tickers` - Get trending tickers by mention count
- `POST /api/ct/copy-trade` - Manually copy a trade to paper portfolio

## Universal Idea Generator
Located in `server/universal-idea-generator.ts`, this system provides a unified interface for generating trade ideas with confidence scores from ANY platform source.

**Supported Sources:**
- `watchlist` - From user's watchlist when setup detected
- `market_scanner` - From market scanner movers (top gainers/losers)
- `options_flow` - From unusual options activity detection
- `social_sentiment` - From CT Tracker / social media mentions
- `chart_analysis` - From technical chart pattern detection
- `quant_signal` - From quantitative engine signals
- `ai_analysis` - From AI engine analysis
- `manual` - User-submitted ideas
- `crypto_scanner` - From crypto-specific scanning
- `news_catalyst` - From news/catalyst detection
- `earnings_play` - From earnings calendar setups
- `sector_rotation` - From sector analysis

**Confidence Calculation:**
Each source has a base confidence (40-60%), then signals add weighted points:
- Technical signals: RSI_OVERSOLD (+12), BREAKOUT (+12), VOLUME_SURGE (+10)
- Options flow: SWEEP_DETECTED (+15), UNUSUAL_CALL_FLOW (+12), LARGE_PREMIUM (+12)
- Chart patterns: CUP_HANDLE (+14), GOLDEN_CROSS (+15), DOUBLE_BOTTOM (+12)
- Social signals: INFLUENCER_MENTION (+10), TRENDING_TICKER (+8)
- Confluence bonuses: 3+ signals (+5), 5+ signals (+10 additional)

**Letter Grading:**
- A+ (85+), A (80-84), A- (75-79), B+ (70-74), B (65-69), B- (60-64)
- C+ (55-59), C (50-54), C- (45-49), D (40-44), F (<40)

**API Endpoints:**
- `POST /api/universal-ideas` - Generate idea from any source
- `POST /api/universal-ideas/from-watchlist` - Generate from watchlist item
- `POST /api/universal-ideas/from-scanner` - Generate from market scanner
- `POST /api/universal-ideas/from-flow` - Generate from options flow
- `POST /api/universal-ideas/from-social` - Generate from social sentiment
- `POST /api/universal-ideas/from-chart-pattern` - Generate from chart pattern
- `GET /api/universal-ideas/signal-weights` - Get all signal weights and sources

**Helper Functions:**
- `generateUniversalTradeIdea(input)` - Core generator function
- `createAndSaveUniversalIdea(input)` - Generate and persist to database
- `generateIdeaFromWatchlist(symbol, signals)` - Watchlist helper
- `generateIdeaFromScanner(symbol, change, timeframe)` - Scanner helper
- `generateIdeaFromFlow(symbol, optionType, strike, expiry, premium)` - Flow helper
- `generateIdeaFromSocial(symbol, sentiment, mentionCount)` - Social helper
- `generateIdeaFromChart(symbol, pattern, direction)` - Chart helper

## Platform Reports System
Located in `server/report-generator.ts`, the Platform Reports System provides comprehensive daily, weekly, and monthly analytics for all platform activities.

**Report Types:**
- **Daily Reports:** Generated at 5:00 PM CT (after market close) on weekdays
- **Weekly Reports:** Generated Sunday at 11:59 PM CT
- **Monthly Reports:** Generated 1st of each month at 12:01 AM CT

**Report Contents:**
- Trade idea generation statistics by engine (AI, Quant, Hybrid, Flow, Lotto)
- Win/loss performance metrics (win rate, average gains/losses, expectancy)
- Bot activity summary (Auto-Lotto, Futures, Crypto, Prop Firm trades and P&L)
- Scanner activity (Options Flow alerts, Market Scanner symbols, CT Tracker mentions)
- Asset type breakdown (stocks, options, crypto, futures)
- Top winning and losing symbols

**Key Functions:**
- `generateDailyReport(date?: Date)` - Creates end-of-day report
- `generateWeeklyReport(endDate?: Date)` - Aggregates 7 days of data
- `generateMonthlyReport(year, month)` - Full month summary

**API Endpoints (Admin-Only):**
- `GET /api/admin/reports` - List all reports (with period filter)
- `GET /api/admin/reports/latest` - Get latest daily/weekly/monthly reports
- `GET /api/admin/reports/stats` - Real-time platform statistics
- `GET /api/admin/reports/:id` - Get specific report details
- `POST /api/admin/reports/generate` - Manually generate a report

**Features:**
- PDF export capability (uses jsPDF with professional formatting)
- Discord webhook notifications when reports are generated
- Glassmorphism-styled dashboard at `/admin/reports`
- Historical report archive with trend analysis

**Database Table:** `platform_reports` stores all generated reports with full metrics breakdown