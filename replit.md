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