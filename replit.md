# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities across US equities, options, and crypto markets. It aims to provide educational, research-grade trade ideas, comprehensive risk management tools, and real-time market analysis. The platform emphasizes risk controls and educational disclaimers, presenting information via a professional dark-themed UI optimized for rapid data scanning.

## User Preferences
- All timestamps should be displayed in America/Chicago timezone with market session context.
- The UI should be a professional dark-themed interface optimized for rapid data scanning.
- Educational disclaimers must be emphasized (not financial advice).
- Clear and precise risk/reward calculations and position sizing tools are required.
- The platform should highlight fresh, actionable trade ideas immediately upon opening.
- The platform should function fully even without external AI dependencies, offering a quantitative idea generator alternative.
- Provide helpful error messages for API billing, rate limits, and authentication issues.
- Liquidity warnings should be displayed for penny stocks and low-float securities.
- No personalized financial advice should be offered; it is for research purposes only.

## System Architecture

### Tech Stack
**Frontend:** React with TypeScript, Tailwind CSS + Shadcn UI, TanStack Query, Wouter, date-fns-tz.
**Backend:** Express.js with TypeScript, In-memory storage (MemStorage), Zod validation, RESTful API design.

### UI/UX Decisions
- **Dark Theme:** Professional dark background with green for bullish/positive, red for bearish/negative, amber for neutral/warning, and blue for primary actions.
- **Typography:** Inter for UI/labels, JetBrains Mono for prices/tickers/timestamps.
- **Components:** Cards with hover elevation, badges, sticky-header tables, responsive grids, loading skeletons.
- **Data Presentation:** Emphasis on visual hierarchy with larger fonts, better spacing, clear data scanning, and interactive tooltips for R:R ratios.
- **Freshness Indicators:** Pulsing "FRESH" badge for ideas posted within 24 hours, clear "Posted: [time] • [session]" timestamps.
- **Optimistic UI:** Watchlist additions provide immediate feedback.
- **Smart Notifications:** New trade idea notifications display stock symbols (e.g., "Generated 3 ideas: AAPL, TSLA, BTC") for both quant and AI-generated ideas.

### Key Features
- **Collapsible Sidebar Navigation:** Professional sidebar with icon-only collapse mode organizing platform into pages (Dashboard, About) and dashboard sections (Trade Ideas, Watchlist). Features toggle button in header, route-based navigation for pages, anchor navigation for dashboard sections, smooth expand/collapse transitions, and logo that shows icon-only when collapsed. Updated October 2025 to move About to separate page.
- **About Page:** Standalone page at `/about` featuring creator profile with photo, bio, education (M.S. Systems Engineering - University of Oklahoma, B.S. Computer Engineering - UT Arlington), certifications (CISA, MATLAB, Simulink), and social links (LinkedIn, GitHub). Highlights experience in AI/ML model validation and risk analytics at DTCC.
- **Settings Management:** Comprehensive settings dialog with persistence to localStorage. Includes Display Preferences (timezone, default view), Data & Refresh (auto-refresh toggle, refresh interval), Notifications (enable/disable, sound alerts), and Trade Idea Preferences (minimum confidence score, low liquidity warnings). Settings hydrate from localStorage on dialog open and persist on save/reset.
- **Header Auto-Hide:** Scroll-based header visibility to maximize screen space. Header hides when scrolling down past 100px and reappears when scrolling up. Uses CSS transforms with 300ms transition. Scroll listener attached to main.overflow-auto element with useRef pattern to avoid listener recreation.
- **Universal Symbol Search & Real-Time Pricing:** Search stocks (via Alpha Vantage API) or crypto (via CoinGecko API) with auto-persistence and auto-refresh (every 60 seconds) with manual refresh option. Prices and last update timestamps shown in CT. Prominent data freshness notice explains 60-second refresh cycle and free API tier limitations.
- **Real-time Market Dashboard:** Smart summary cards with actionable insights (active opportunities, top gainer/loser with micro-cap crypto price support), live price cards, and market session indicators. Properly formats small crypto prices (e.g., $0.00002145 for PEPE) using smart decimal detection up to 8 places.
- **Trade Ideas Feed:** Tabbed interface (NEW IDEAS, Stock Options, Stock Shares, Crypto) with "NEW IDEAS" tab featuring date-based accordions (Today/Yesterday/Older) with rotating chevron animations and asset-type subsections. Uses compact TradeIdeaBlock components with expandable details to prevent information overload. Displays quantitative entry/target/stop levels, risk/reward per share, gain/risk percentages, catalyst summaries, and one-click watchlist starring. Includes filter buttons (All, Long, Short, Day Trade) to quickly narrow down opportunities by direction or intraday timing. Features a mini calendar date picker to navigate and filter trade ideas by historical dates (future dates disabled), with bold highlighting on dates containing ideas and a clear button to reset filters.
- **Quality Scoring System:**
  - **Confidence Score:** 0-100 numeric quality score with 70+ threshold for display filtering
  - **Probability Bands:** A (80-100), B (70-79), C (60-69) grades indicating success probability
  - **Quality Signals:** Multi-factor scoring based on R:R ratio (min 2.0), volume confirmation, signal strength, liquidity, RSI/MACD indicators, and multi-timeframe alignment
  - **Technical Indicators:** RSI (14-period) and MACD (12,26,9) with +10 point bonus for confirmed signals
  - **Multi-Timeframe Analysis:** Daily (5-day vs 10-day SMA) and Weekly (4-week vs 10-week SMA on aggregated candles) with up to +15 points for strong alignment
  - **Gem Score:** Prioritization algorithm combining price action (40 pts), volume strength (30 pts), and liquidity (30 pts)
  - **Hard Guards:** Minimum 1.5:1 R:R ratio and 1.2x volume confirmation required for all generated ideas
- **Day Trading Features:** 
  - **Options Accuracy:** Strike price, option type (call/put), and expiry date displayed in dedicated badges for options trade ideas (e.g., "$580 CALL Exp: Oct 27, 2025")
  - **Intraday Indicators:** "DAY TRADE" badge highlights true intraday opportunities - options expiring TODAY (not weeks/months out), or stocks/crypto during active trading sessions (Regular Trading Hours, Pre-Market, After Hours)
  - **Source Differentiation:** Visual badges distinguish AI-generated ideas (Brain icon, purple) from quantitative ideas (Sparkles icon, blue)
  - **Compact Expandable UI:** Trade ideas shown in collapsed state with clean 3-column grid layout displaying Current | Entry | Target prices with no overlap, prominent current price (text-2xl) with color-coded change percentage
  - **Dynamic Grade System:** Letter grades with +/- modifiers (A+/A-/B+/B/C+/C) that adjust in real-time based on market movement - grades improve as price moves toward profit target, degrade as price moves toward stop loss, using absolute distance calculations with 50-95% guardrails for both long and short positions
  - **Enhanced Analysis:** In-depth analysis prominently displayed in expanded view with highlighted background and clickable text selection
  - **Accordion Animations:** Smooth rotating chevron arrows indicate section expansion/collapse state
  - **At-a-Glance Metrics in Collapsed Cards:** Trade idea cards display time since posted (e.g., "2h ago") with Clock icon, real-time P&L showing dollar value and percentage change (color-coded green/red), visual progress bar indicating distance to target (0-100%), and quick action buttons (Eye/Star icons) appearing on hover for instant access to symbol details and watchlist
  - **Intelligent UI Interactions:** Quick action buttons positioned absolutely with semi-transparent background to avoid button nesting issues, smooth opacity transitions on hover, lightweight calculations guarded against missing data, and all interactive elements tagged with data-testid for automation testing
- **Multi-Asset Screener:** Filters by asset type, price, volume, penny stocks, high IV options, and unusual volume.
- **Risk Calculator:** Position sizing, R:R ratio visualization, potential profit/loss calculations, and stop-loss analysis.
- **Catalyst Feed:** Displays latest market events, news, impact ratings, and source citations.
- **Symbol Detail Modal:** Click any symbol in trade ideas or use "View Details" button in expanded blocks to open comprehensive analysis modal with three tabs:
  - **Overview:** Key metrics (market cap, volume, 24h high/low) and performance summary
  - **Analysis:** Analyst ratings with visual breakdown and trading recommendations (BUY/HOLD/SELL)
  - **Sentiment:** Community sentiment (Bullish/Neutral/Bearish percentages) with trader commentary
  - **Access Points:** Symbol names (clickable links) or "View Details" button in expanded trade idea blocks
- **Watchlist Management:** Track symbols with price targets, notes, and quick actions.
- **QuantAI Bot:** AI-powered trading assistant with a sliding chatbot interface. Features intelligent multi-provider fallback system (Anthropic Claude Sonnet 4 → OpenAI GPT-5 → Google Gemini 2.5) with helpful error messaging for API credit/billing issues. Includes persistent chat history and graceful degradation when primary providers fail.
- **Quantitative Idea Generator:** An AI-free alternative generating trade ideas based on Momentum, Volume Spike, Bullish/Bearish Breakout, Mean Reversion, RSI Divergence, and MACD Crossover signals using advanced technical analysis. Features:
  - **RSI Analysis:** 14-period RSI with oversold (<30) and overbought (>70) detection for reversal setups
  - **MACD Analysis:** 12,26,9 MACD with bullish/bearish crossover signals for trend confirmation
  - **Multi-Timeframe Confirmation:** Analyzes both daily (5/10-day SMA) and weekly (4/10-week SMA on aggregated candles) trends, requiring alignment for higher confidence
  - **Intelligent Deduplication:** Prevents creating similar ideas within 24 hours (matches by symbol, direction, and entry price within 5%), with helpful "wait for market movements" messaging when no new opportunities are detected
- **Performance Tracking:** Record actual trade outcomes with dialog in trade idea blocks. Track WIN/LOSS/BREAKEVEN/STOPPED outcomes, actual exit prices, and realized P&L. Enables measurement of actual win rates against predicted confidence scores.

### Data Models
Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, User Preferences.

### API Endpoints
Comprehensive RESTful API for Market Data (search, refresh), Trade Ideas (CRUD), Catalysts (CRUD), Watchlist (CRUD), Options (GET/POST), Preferences (GET/PATCH), and AI/QuantAI Bot (chat, generate ideas, chat history).

## External Dependencies
- **CoinGecko API:** For crypto symbol search and real-time prices (no API key required).
- **Alpha Vantage API:** For stock symbol lookup and market data (requires `ALPHA_VANTAGE_API_KEY`).
- **OpenAI API:** For GPT-5 integration within QuantAI Bot (requires `OPENAI_API_KEY`).
- **Anthropic API:** For Claude Sonnet 4 integration within QuantAI Bot (requires `ANTHROPIC_API_KEY`).
- **Google Gemini API:** For Gemini 2.5 integration within QuantAI Bot (requires `GEMINI_API_KEY`).