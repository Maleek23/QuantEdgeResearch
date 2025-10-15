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

### Key Features
- **Universal Symbol Search & Real-Time Pricing:** Search stocks (via Alpha Vantage API) or crypto (via CoinGecko API) with auto-persistence and auto-refresh (every 60 seconds) with manual refresh option. Prices and last update timestamps shown in CT. Prominent data freshness notice explains 60-second refresh cycle and free API tier limitations.
- **Real-time Market Dashboard:** Smart summary cards with actionable insights (active opportunities, top gainer/loser), live price cards, and market session indicators.
- **Trade Ideas Feed:** Tabbed interface (NEW IDEAS, Stock Options, Stock Shares, Crypto) with "NEW IDEAS" tab featuring date-based accordions (Today/Yesterday/Older) with rotating chevron animations and asset-type subsections. Uses compact TradeIdeaBlock components with expandable details to prevent information overload. Displays quantitative entry/target/stop levels, risk/reward per share, gain/risk percentages, catalyst summaries, and one-click watchlist starring.
- **Quality Scoring System:**
  - **Confidence Score:** 0-100 numeric quality score with 70+ threshold for display filtering
  - **Probability Bands:** A (80-100), B (70-79), C (60-69) grades indicating success probability
  - **Quality Signals:** Multi-factor scoring based on R:R ratio (min 2.0), volume confirmation, signal strength, and liquidity
  - **Gem Score:** Prioritization algorithm combining price action (40 pts), volume strength (30 pts), and liquidity (30 pts)
  - **Hard Guards:** Minimum 1.5:1 R:R ratio and 1.2x volume confirmation required for all generated ideas
- **Day Trading Features:** 
  - **Options Accuracy:** Strike price, option type (call/put), and expiry date displayed in dedicated badges for options trade ideas (e.g., "$580 CALL Exp: Oct 27, 2025")
  - **Intraday Indicators:** "DAY TRADE" badge highlights opportunities during Regular Trading Hours, Pre-Market, and After Hours sessions
  - **Source Differentiation:** Visual badges distinguish AI-generated ideas (Brain icon, purple) from quantitative ideas (Sparkles icon, blue)
  - **Compact Expandable UI:** Trade ideas shown in collapsed state with prominent current price, entry, and target visible at a glance
  - **Grade Display:** Letter grades with +/- modifiers (A+/A-/B+/B/C+/C) with numeric score below, color-coded (90+ green, 80-89 blue, 70-79 amber)
  - **Enhanced Analysis:** In-depth analysis prominently displayed in expanded view with highlighted background and clickable text selection
  - **Accordion Animations:** Smooth rotating chevron arrows indicate section expansion/collapse state
- **Multi-Asset Screener:** Filters by asset type, price, volume, penny stocks, high IV options, and unusual volume.
- **Risk Calculator:** Position sizing, R:R ratio visualization, potential profit/loss calculations, and stop-loss analysis.
- **Catalyst Feed:** Displays latest market events, news, impact ratings, and source citations.
- **Symbol Detail Modal:** Comprehensive analysis with Overview, Analysis (analyst ratings, recommendations), and Sentiment (community sentiment, commentary) tabs.
- **Watchlist Management:** Track symbols with price targets, notes, and quick actions.
- **QuantAI Bot:** AI-powered trading assistant with a sliding chatbot interface. Integrates OpenAI GPT-5, Anthropic Claude Sonnet 4, and Google Gemini 2.5 for conversational insights and AI-generated trade ideas. Includes persistent chat history and intelligent error handling for API billing/credit issues with graceful fallback suggestions.
- **Quantitative Idea Generator:** An AI-free alternative generating trade ideas based on Momentum, Volume Spike, Bullish/Bearish Breakout, and Mean Reversion signals using technical analysis.

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