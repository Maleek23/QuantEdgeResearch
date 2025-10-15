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
- ✅ **Enhanced UX & Data Presentation**
  - **R:R Ratio Clarity**: Interactive tooltips explaining "For every $X risked, gain $Y" with visual breakdown
  - **Symbol Detail Modal**: Comprehensive analysis view with 3 tabs (Overview, Analysis, Sentiment)
  - **Smart Summary Cards**: Actionable insights - Active opportunities, Top Gainer/Loser (clickable)
  - **Watchlist Stars**: One-click add from trade ideas with optimistic UI updates
  - **Improved Visual Hierarchy**: Larger fonts, better spacing, clearer data scanning
- ✅ **Fresh Ideas System & Layout Optimization**
  - **FRESH Badge**: Trade ideas posted within 24 hours display pulsing "FRESH" badge for instant visibility
  - **Posted Timestamps**: Clear "Posted: [time] • [session]" format shows when each idea was generated
  - **Prioritized Layout**: Watchlist moved above Catalyst Feed for better visibility of tracked opportunities
  - **Wake Up & Trade**: Users now see fresh, actionable trade ideas immediately when opening the app
- ✅ **Trade Ideas Tab Restructure & Asset Clarity** (Latest - Oct 15, 2025)
  - **NEW IDEAS Tab**: Default tab showing all fresh opportunities from last 24 hours across all asset types
  - **Asset-Specific Tabs**: Organized Stock Options, Stock Shares, and Crypto tabs for focused analysis
  - **Clear Asset Badges**: "STOCK OPTIONS" vs "STOCK SHARES" vs "CRYPTO" badges eliminate confusion
  - **Quantitative Entry/Target/Stop Display**: 
    - Larger prices with uppercase labels (ENTRY PRICE, TARGET, STOP LOSS)
    - Risk per share and Reward per share calculations in red/green
    - Gain/risk percentages displayed with targets and stops
  - **Consistent Filtering**: Search and direction filters work identically across all tabs
  - **Direction Filters**: All/Long/Short/Daily buttons shared across tabs for unified experience

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
1. **Universal Symbol Search & Real-Time Pricing**
   - Search any stock or crypto symbol
   - Instant crypto lookup (BTC, ETH, SOL, DOGE, ADA, AVAX, LINK, MATIC, etc.)
   - Stock lookup with Alpha Vantage API key
   - Auto-add searched symbols to dashboard
   - **Auto-refresh every 60 seconds** - prices update automatically
   - Manual refresh button with countdown timer
   - Live price display with change percentages
   - Last update timestamp in CT timezone

2. **Real-time Market Dashboard**
   - Smart summary cards showing actionable insights:
     - Active opportunities + High R:R ideas count
     - Top Gainer (clickable to view details)
     - Top Loser (clickable to view details)
   - Live price cards with change percentages
   - Market session indicators (pre-market/RTH/after-hours)
   - Asset type badges (stocks, options, crypto)

3. **Trade Ideas Feed with Fresh Indicators & Tab Organization**
   - **NEW IDEAS Tab (Default)**: Shows all fresh opportunities from last 24 hours across all asset types
   - **Asset-Specific Tabs**: Stock Options, Stock Shares, Crypto for focused analysis
   - **FRESH Badge**: Pulsing badge on ideas posted within 24 hours for instant identification
   - **Posted Timestamps**: "Posted: [time] • [session]" format shows when ideas were generated
   - **Clear Asset Differentiation**: "STOCK OPTIONS" vs "STOCK SHARES" vs "CRYPTO" badges
   - **Quantitative Entry/Target/Stop Display**:
     - Uppercase labels (ENTRY PRICE, TARGET, STOP LOSS) with larger prices
     - Risk per share (red) and Reward per share (green) calculations
     - Gain/risk percentages with targets and stops
   - Interactive R:R ratio tooltips with plain-English explanations
   - Visual breakdown: "Potential Gain" vs "Max Risk" percentages
   - Catalyst summaries with one-click Google search
   - "View Full Analysis" button opens detailed symbol modal
   - One-click watchlist starring with optimistic updates
   - Consistent search and direction filtering across all tabs
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

6. **Symbol Detail Modal**
   - **Overview Tab**: Key metrics (market cap, volume, 24h high/low), performance summary
   - **Analysis Tab**: Analyst ratings with progress bars, trading recommendation (BUY/HOLD/SELL)
   - **Sentiment Tab**: Community sentiment breakdown (bullish/bearish/neutral), trader commentary
   - Accessible from trade ideas, summary cards, and screener results
   - Add to watchlist directly from modal

7. **Watchlist Management**
   - Symbol tracking with price targets
   - Notes and timestamps
   - Quick view/remove actions
   - Star buttons on trade ideas for instant add
   - Optimistic UI updates for responsive feedback

## API Endpoints

### Market Data
- `GET /api/market-data` - Get all market data
- `GET /api/market-data/:symbol` - Get data by symbol
- `POST /api/market-data` - Create market data
- `GET /api/search-symbol/:symbol` - Search for stock/crypto and add to dashboard
- `POST /api/refresh-prices` - Refresh all symbol prices from external APIs

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