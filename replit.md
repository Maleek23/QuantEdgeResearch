# QuantEdge Research - Trading Platform

## Overview
A professional quantitative trading research platform for discovering day-trading opportunities across US equities, options, and crypto. The platform provides comprehensive risk management tools, real-time market analysis, and educational research-grade trade ideas.

**Status:** MVP Complete  
**Last Updated:** October 15, 2025

## Purpose & Goals
- Provide educational, research-grade trading opportunities across multiple asset classes
- Deliver precise risk/reward calculations and position sizing tools
- Display all timestamps in America/Chicago timezone with market session context
- Emphasize risk controls and educational disclaimers (not financial advice)
- Offer professional dark-themed UI optimized for rapid data scanning

## Recent Changes (October 15, 2025)
- ✅ Implemented complete data schema for stocks, options, crypto, trade ideas, catalysts, and watchlists
- ✅ Built comprehensive UI with dark trading theme and professional components
- ✅ Created risk calculator with position sizing and R:R ratio calculations
- ✅ Implemented multi-asset screener with advanced filtering
- ✅ Added catalyst feed for market events and news
- ✅ Set up in-memory storage with realistic seed data
- ✅ Created all API endpoints for market data, trade ideas, and user preferences
- ✅ **Universal Symbol Search** - Search and add any stock or crypto to dashboard
  - CoinGecko API integration for 20+ crypto symbols (no API key needed)
  - Alpha Vantage API support for stocks (requires API key)
  - Auto-persistence of searched symbols to market data
  - Real-time price updates for BTC, ETH, SOL, DOGE, MATIC, LINK, and more

## Project Architecture

### Tech Stack
**Frontend:**
- React with TypeScript
- Tailwind CSS + Shadcn UI components
- TanStack Query for data fetching
- Wouter for routing
- date-fns-tz for timezone handling

**Backend:**
- Express.js with TypeScript
- In-memory storage (MemStorage)
- Zod validation
- RESTful API design

### Data Models
- **Market Data:** Real-time prices, volume, market cap, session info
- **Trade Ideas:** Entry/exit levels, R:R ratios, catalysts, analysis
- **Options Data:** Strikes, IV, Greeks, expiry dates
- **Catalysts:** News, earnings, FDA events with impact ratings
- **Watchlist:** User-tracked symbols with price targets
- **User Preferences:** Account size, risk limits, holding horizons

### Key Features
1. **Universal Symbol Search**
   - Search any stock or crypto symbol
   - Instant crypto lookup (BTC, ETH, SOL, DOGE, ADA, AVAX, LINK, MATIC, etc.)
   - Stock lookup with Alpha Vantage API key
   - Auto-add searched symbols to dashboard
   - Real-time price display with change percentages

2. **Real-time Market Dashboard**
   - Live price cards with change percentages
   - Market session indicators (pre-market/RTH/after-hours)
   - Asset type badges (stocks, options, crypto)

3. **Trade Ideas Feed**
   - Entry, target, and stop-loss levels
   - Risk/reward calculations
   - Catalyst summaries and analysis
   - Liquidity warnings for penny stocks
   - Educational disclaimers

4. **Multi-Asset Screener**
   - Filter by asset type, price range, volume
   - Penny stocks filter (<$5)
   - High IV options filter (>50%)
   - Unusual volume detection (>2x avg)

5. **Risk Calculator**
   - Position sizing based on risk parameters
   - R:R ratio visualization
   - Potential profit/loss calculations
   - Stop-loss percentage analysis

6. **Catalyst Feed**
   - Latest market events and news
   - Impact ratings (high/medium/low)
   - Source citations
   - Event type categorization

6. **Watchlist Management**
   - Symbol tracking with price targets
   - Notes and timestamps
   - Quick view/remove actions

## API Endpoints

### Market Data
- `GET /api/market-data` - Get all market data
- `GET /api/market-data/:symbol` - Get data by symbol
- `POST /api/market-data` - Create market data
- `GET /api/search-symbol/:symbol` - Search for stock/crypto and add to dashboard

### Trade Ideas
- `GET /api/trade-ideas` - Get all trade ideas
- `GET /api/trade-ideas/:id` - Get specific idea
- `POST /api/trade-ideas` - Create new idea
- `DELETE /api/trade-ideas/:id` - Delete idea

### Catalysts
- `GET /api/catalysts` - Get all catalysts
- `GET /api/catalysts/symbol/:symbol` - Get by symbol
- `POST /api/catalysts` - Create catalyst

### Watchlist
- `GET /api/watchlist` - Get all watchlist items
- `POST /api/watchlist` - Add to watchlist
- `DELETE /api/watchlist/:id` - Remove from watchlist

### Options
- `GET /api/options/:symbol` - Get options by symbol
- `POST /api/options` - Create options data

### Preferences
- `GET /api/preferences` - Get user preferences
- `PATCH /api/preferences` - Update preferences

## Design System

### Colors
- **Background:** Deep charcoal dark theme
- **Bullish/Positive:** Green (#16a34a)
- **Bearish/Negative:** Red (#ef4444)
- **Neutral/Warning:** Amber (#eab308)
- **Primary Action:** Blue (#3b82f6)

### Typography
- **Primary:** Inter (UI, labels, text)
- **Monospace:** JetBrains Mono (prices, tickers, timestamps)
- **Sizes:** Display (3xl), Heading (xl), Body (base), Data (sm mono)

### Components
- Cards with subtle elevation on hover
- Badges for status indicators
- Tables with sticky headers
- Responsive grid layouts
- Loading skeletons for async data

## User Preferences (Defaults)
- Account Size: $10,000
- Max Risk Per Trade: 1% of account
- Default Capital Per Idea: $1,000
- Default Options Budget: $250
- Preferred Assets: Stocks, Options, Crypto
- Holding Horizon: Intraday

## Important Notes
- All timestamps displayed in America/Chicago (CT) timezone
- Market session context shown (pre-market 4:00-9:30 AM, RTH 9:30 AM-4:00 PM, after-hours 4:00-8:00 PM CT)
- **Symbol Search:**
  - Crypto symbols work instantly via CoinGecko API (no key required)
  - Supported crypto: BTC, ETH, SOL, DOGE, XRP, ADA, AVAX, MATIC, LINK, UNI, ATOM, DOT, LTC, BCH, ALGO, XLM, NEAR, APT, FIL, IMX
  - Stock symbols require `ALPHA_VANTAGE_API_KEY` environment variable
  - Searched symbols are automatically added to market data and persist in memory
- Educational disclaimers on all trade ideas
- Liquidity warnings for penny stocks and low-float securities
- No personalized financial advice - research purposes only

## Development Commands
- `npm run dev` - Start development server (port 5000)
- Frontend: Vite dev server
- Backend: Express server with auto-reload

## Future Enhancements (Next Phase)
- Alpha Vantage API integration for live market data
- Options chain analyzer with IV rank/percentile
- Watchlist alerts for price targets and volume spikes
- Backtesting simulator with historical data
- PDF export for daily trade ideas
- Real-time WebSocket updates