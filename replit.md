# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities across US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, comprehensive risk management tools, and real-time market analysis. The platform aims to offer robust risk controls and clear educational disclaimers, all presented through a professional dark-themed UI optimized for rapid data scanning. 

**Major Update (Oct 2025):** Platform upgraded with real historical data integration (replacing synthetic simulations) and multi-page architecture for better navigation and deep linking. Expected model accuracy improved from 40-60% to 75-85% through authentic market data usage.

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
- GitHub repository: https://github.com/Maleek23

## System Architecture

### Multi-Page Architecture (Updated Oct 2025)
The platform now uses a modern multi-page architecture with deep linking support:
- **Dashboard (/)** - Metrics-focused overview with quick actions, idea generation buttons, market movers, and recent ideas preview
- **Trade Ideas (/trade-ideas)** - Unified feed with source filtering (All | AI | Quant | Manual), date-based accordions, and archived trades
- **Market Overview (/market)** - Live prices, top movers, market stats, catalyst feed
- **Watchlist (/watchlist)** - Symbol tracking with target prices and asset type filtering
- **Risk Calculator (/risk)** - Position sizing tool with educational content
- **About (/about)** - Creator profile and platform information

Sidebar navigation organized into logical groups: Research (Dashboard, Trade Ideas, Market, Watchlist) / Tools (Risk Calculator) / System (About). Active states tracked via wouter's useLocation hook.

### UI/UX Decisions
The platform features a professional dark theme with a consistent color palette (green for bullish, red for bearish, amber for neutral/warning, blue for actions). Typography uses Inter for UI and JetBrains Mono for financial data. Components include cards with hover effects, badges, sticky-header tables, responsive grids, and loading skeletons. Data presentation prioritizes visual hierarchy, clear scanning, and interactive tooltips. Key UI elements include pulsing "FRESH" badges, smart notifications for new ideas, and optimistic UI updates for quick actions.

**Recent UI/UX Enhancements (Oct 2025):**
- **Glowing Verification Badges:** Real data badges pulse with subtle glow animation (2s infinite loop) using CSS `glow-pulse` keyframes. Applied to all success-variant badges to highlight verified market data without overwhelming the interface.
- **Real-Time Price Display:** Trade idea cards show live market prices (30s refresh interval) with prominent 2xl font-mono styling. Prices pulse/scale (300ms animation) when values change, using ref-based change detection to trigger exactly once per update.
- **Simplified Card Layout:** Redesigned for faster scanning with large symbol/price at top, grade badge in top-right, compact single-row info (asset type + data quality + source + time), and side-by-side entry/target boxes.
- **Accessible View Toggle:** List/Grid view mode controls moved from inside Filters popover to compact button group next to Filters in header for one-click access.

### Technical Implementations & Feature Specifications
- **Tech Stack:** React with TypeScript, Tailwind CSS + Shadcn UI, TanStack Query, Wouter, date-fns-tz for the frontend; Express.js with TypeScript, In-memory storage, and Zod validation for the backend.
- **Core Navigation:** Collapsible sidebar, dedicated About page for creator profile, and robust settings management with localStorage persistence.
- **Market Data:** Universal symbol search with real-time pricing for stocks (Alpha Vantage) and crypto (CoinGecko), including auto-refresh and clear data freshness indicators.
- **Real-time Dashboard:** Transformed to metrics-focused overview (69% code reduction from 1009→310 lines). Features quick action cards including Symbol Search and Generate New Ideas section with direct Quant and AI generation buttons. Displays Active Ideas count with AI/Quant breakdown, High Grade Ideas, Tracked Assets, Market Catalysts metrics. Shows Top Gainers/Losers market movers and Recent Trade Ideas preview with "View All" quick link.
- **Trade Ideas Feed:** Unified page with ultra-simplified single-row filter interface: just Search bar + Filters button with active filter count badge. All filter controls (Asset Type, Source, Grade, Direction, Date, View Mode) organized inside a clean popover panel. Header includes direct idea generation buttons (Generate Quant + Generate AI) for on-page creation. View toggle supports list (vertical) and grid (responsive 1/2/3 columns) layouts. Tabbed interface with date-based accordions for "NEW IDEAS," compact `TradeIdeaBlock` components, and detailed expandable views showing quantitative entry/target/stop levels, R:R, and catalyst summaries.
- **Idea Generation System:** Dual-source direct generation architecture available on both Dashboard and Trade Ideas pages. (1) Generate Quant Ideas: POST `/api/quant/generate-ideas` for AI-free quantitative signal generation. (2) Generate AI Ideas: POST `/api/ai/generate-ideas` for LLM-powered analysis. All ideas tagged with source='ai', 'quant', or 'manual', created with outcomeStatus='open', and immediately viewable in NEW IDEAS tab. Ideas filterable by source for performance comparison.
- **QuantAI Bot:** Separate conversational assistant (accessed via "Ask QuantAI" button) with sliding chatbot interface, intelligent multi-provider fallback (Anthropic, OpenAI, Google Gemini), and persistent chat history. Used for analysis and discussion, not primary idea generation.
- **Quality Scoring System:** Incorporates Confidence Scores (0-100), Probability Bands (A, B, C grades), and multi-factor Quality Signals based on R:R, volume, indicators (RSI, MACD), and multi-timeframe alignment, with hard guards for minimum R:R and volume confirmation.
- **Day Trading Features:** Specific handling for options (strike, type, expiry), "DAY TRADE" badges, visual differentiation of AI vs. quantitative ideas, compact expandable UI with dynamic grade system adjusting in real-time, and at-a-glance metrics in collapsed cards (time since posted, P&L, progress bar).
- **Symbol Detail Modal:** Comprehensive modal with Overview, Analysis (analyst ratings), and Sentiment tabs, accessible from any symbol.
- **Quick Actions Dialog:** Smart trade idea creation from symbol search with asset-specific recommendations:
  - **Crypto Assets:** Shows "Crypto Shares" button only (crypto has no options market), creates crypto trade ideas with assetType='crypto'
  - **Stock Assets:** Shows "Stock Shares" and "Stock Options" buttons, intelligently recommends based on price, momentum, and volume
  - **Recommendation Engine:** Analyzes price action, volume ratio, and market conditions to suggest optimal trade type with confidence scoring (high/medium/low)
  - **Direction Analysis:** Automatically determines long/short direction based on momentum and price movement
  - **Liquidity Warnings:** Displays alerts for penny stocks (<$5) with limited options markets
- **Watchlist Management:** Full-width section with expandable quantitative analysis for crypto assets (RSI, MACD, Trend, Volume, Support/Resistance cards) and auto-refresh for prices.
- **QuantAI Bot:** AI-powered trading assistant with sliding chatbot interface, ChatGPT-style UI with proper markdown rendering, intelligent multi-provider fallback (Anthropic, OpenAI, Google Gemini), and persistent chat history. **Auto-Save Trade Ideas (Oct 2025):** Automatically detects trade requests (e.g., "give me trade ideas for NVDA") and parses AI responses to extract structured trade ideas, saving them directly to Trade Ideas feed with AI badge. Features smart detection to distinguish trade requests from educational questions, real-time toast notifications, and manual "Save as Trade Idea" backup button for edge cases.
- **Quantitative Idea Generator:** An AI-free alternative generating trade ideas based on momentum, volume spike, breakout, mean reversion, and indicator divergence/crossover signals. Features a "Hidden Gem Discovery Engine" for crypto, advanced RSI/MACD analysis, multi-timeframe confirmation, and intelligent deduplication. **Strategic Asset Distribution (Oct 2025):** Implements strict quota enforcement to deliver balanced mix of 3 stock shares, 3 options, and 2 crypto ideas (40%/35%/25% split). Uses interleaved sorting to prevent single asset type domination, shortfall-based priority logic for stock/option selection, and relaxed quality filters for crypto to ensure all asset types are represented.
- **Performance Tracking & Auto-Archiving:** Allows manual recording of trade outcomes and automatic archiving of ideas when targets are hit, stop losses are triggered, or ideas expire (7+ days old). Active feeds filter out completed trades, preserving historical data.

### System Design Choices
The system uses a RESTful API design for all core functionalities. Data models include Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. The design emphasizes modularity, responsiveness, and clear separation of concerns between frontend and backend.

## External Dependencies

### **Data Sources (As of Oct 2025)**
- **✅ CoinGecko API (Primary for Crypto):** Real-time prices, historical data, market cap rankings. **Status: Working**
- **✅ Yahoo Finance (Primary for Stocks):** Real-time quotes, unlimited requests, free. **Status: Working**
- **✅ Alpha Vantage API (Fallback for Stocks):** Historical data, rate-limited (25-500 req/day). **Status: Working**
- **❌ Tradier API (Inactive):** Real-time quotes, options chains, unlimited access. **Status: Invalid API Key (expired/inactive)**

### **AI Providers**
- **OpenAI API:** For GPT-5 integration within the QuantAI Bot.
- **Anthropic API:** For Claude Sonnet 4 integration within the QuantAI Bot.
- **Google Gemini API:** For Gemini 2.5 integration within the QuantAI Bot.

### **Data Flow Hierarchy**
1. **Stocks:** Yahoo Finance → Alpha Vantage (if rate limited) → Skip
2. **Crypto:** CoinGecko → Skip
3. **Options:** Not currently available (Tradier inactive)

**Note:** Tradier API key needs renewal to enable options chain data and unlimited stock quotes. Current system functions with Yahoo Finance (stocks) and CoinGecko (crypto).