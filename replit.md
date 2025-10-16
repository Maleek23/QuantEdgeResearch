# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities across US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, comprehensive risk management tools, and real-time market analysis. The platform aims to offer robust risk controls and clear educational disclaimers, all presented through a professional dark-themed UI optimized for rapid data scanning. The project envisions empowering users with actionable insights and research capabilities to improve their trading strategies.

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

### UI/UX Decisions
The platform features a professional dark theme with a consistent color palette (green for bullish, red for bearish, amber for neutral/warning, blue for actions). Typography uses Inter for UI and JetBrains Mono for financial data. Components include cards with hover effects, badges, sticky-header tables, responsive grids, and loading skeletons. Data presentation prioritizes visual hierarchy, clear scanning, and interactive tooltips. Key UI elements include pulsing "FRESH" badges, smart notifications for new ideas, and optimistic UI updates for quick actions.

### Technical Implementations & Feature Specifications
- **Tech Stack:** React with TypeScript, Tailwind CSS + Shadcn UI, TanStack Query, Wouter, date-fns-tz for the frontend; Express.js with TypeScript, In-memory storage, and Zod validation for the backend.
- **Core Navigation:** Collapsible sidebar, dedicated About page for creator profile, and robust settings management with localStorage persistence.
- **Market Data:** Universal symbol search with real-time pricing for stocks (Alpha Vantage) and crypto (CoinGecko), including auto-refresh and clear data freshness indicators.
- **Real-time Dashboard:** Smart summary cards, live price cards, and market session indicators, with precise formatting for micro-cap crypto prices.
- **Trade Ideas Feed:** Tabbed interface with date-based accordions for "NEW IDEAS," compact `TradeIdeaBlock` components, and detailed expandable views showing quantitative entry/target/stop levels, R:R, and catalyst summaries. Includes filtering options (All, Long, Short, Day Trade) and a mini calendar for historical navigation.
- **Quality Scoring System:** Incorporates Confidence Scores (0-100), Probability Bands (A, B, C grades), and multi-factor Quality Signals based on R:R, volume, indicators (RSI, MACD), and multi-timeframe alignment, with hard guards for minimum R:R and volume confirmation.
- **Day Trading Features:** Specific handling for options (strike, type, expiry), "DAY TRADE" badges, visual differentiation of AI vs. quantitative ideas, compact expandable UI with dynamic grade system adjusting in real-time, and at-a-glance metrics in collapsed cards (time since posted, P&L, progress bar).
- **Symbol Detail Modal:** Comprehensive modal with Overview, Analysis (analyst ratings), and Sentiment tabs, accessible from any symbol.
- **Watchlist Management:** Full-width section with expandable quantitative analysis for crypto assets (RSI, MACD, Trend, Volume, Support/Resistance cards) and auto-refresh for prices.
- **QuantAI Bot:** AI-powered trading assistant with a sliding chatbot interface, intelligent multi-provider fallback (Anthropic, OpenAI, Google Gemini), and persistent chat history.
- **Quantitative Idea Generator:** An AI-free alternative generating trade ideas based on momentum, volume spike, breakout, mean reversion, and indicator divergence/crossover signals. Features a "Hidden Gem Discovery Engine" for crypto, advanced RSI/MACD analysis, multi-timeframe confirmation, and intelligent deduplication.
- **Performance Tracking & Auto-Archiving:** Allows manual recording of trade outcomes and automatic archiving of ideas when targets are hit, stop losses are triggered, or ideas expire (7+ days old). Active feeds filter out completed trades, preserving historical data.

### System Design Choices
The system uses a RESTful API design for all core functionalities. Data models include Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. The design emphasizes modularity, responsiveness, and clear separation of concerns between frontend and backend.

## External Dependencies
- **CoinGecko API:** For crypto symbol search and real-time prices.
- **Alpha Vantage API:** For stock symbol lookup and market data.
- **OpenAI API:** For GPT-5 integration within the QuantAI Bot.
- **Anthropic API:** For Claude Sonnet 4 integration within the QuantAI Bot.
- **Google Gemini API:** For Gemini 2.5 integration within the QuantAI Bot.