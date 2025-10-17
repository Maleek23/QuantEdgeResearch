# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities across US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, comprehensive risk management tools, and real-time market analysis. The platform aims to offer robust risk controls and clear educational disclaimers, all presented through a professional dark-themed UI optimized for rapid data scanning. The platform integrates real historical data, improving model accuracy significantly.

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

### Multi-Page Architecture
The platform utilizes a multi-page architecture including a Landing Page, Dashboard, Trade Ideas, Market Overview, Watchlist, Risk Calculator, and About page. The Landing page provides professional onboarding and showcases features before routing users to the application. Navigation is managed via a sidebar (on app pages) organized into Research, Tools, and System groups.

### UI/UX Decisions
The platform features a professional dark theme with a consistent color palette (green for bullish, red for bearish, amber for neutral/warning, blue for actions). Typography uses Inter for UI and JetBrains Mono for financial data. UI elements include cards with hover effects, badges, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. Enhancements include glowing verification badges for real data, real-time price displays with subtle animations, a simplified card layout for faster scanning, an accessible view toggle, a detailed analysis modal with multiple tabs, and full mobile responsiveness with a hamburger menu. An intelligent advisory system provides real-time trading advice, including colored indicators, action badges, dynamic R:R analysis, and profit/loss tracking.

### Technical Implementations & Feature Specifications
The platform is built with a React/TypeScript frontend using Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, in-memory storage, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard with quick actions and idea generation, a unified trade ideas feed with robust filtering and generation capabilities (Quant and AI), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores, probability bands, and multi-factor quality signals. Day trading features include specific handling for options, "DAY TRADE" badges, and dynamic grade systems. A quick actions dialog facilitates smart trade idea creation from symbol search with asset-specific recommendations and liquidity warnings. Watchlist management includes expandable quantitative analysis for crypto. The QuantAI Bot can auto-save structured trade ideas from conversations. An AI-free Quantitative Idea Generator provides ideas based on various signals, balancing asset distribution (stocks, options, crypto) with real-time entry prices and time windows for execution. Performance tracking includes manual outcome recording and automatic archiving of ideas based on targets, stop losses, or expiry.

### System Design Choices
The system employs a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences, emphasizing modularity, responsiveness, and clear separation of concerns. Comprehensive data quality and error handling are implemented to guard against invalid numeric values in calculations, displaying "N/A" for professional presentation.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Primary for Crypto (real-time prices, historical data, market cap rankings).
-   **Yahoo Finance:** Primary for Stocks (real-time quotes, unlimited requests).
-   **Alpha Vantage API:** Fallback for Stocks (historical data, rate-limited).
-   **Tradier API:** Inactive (options chains, unlimited access).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.

### Data Flow Hierarchy
1.  **Stocks:** Yahoo Finance → Alpha Vantage (if rate limited) → Skip
2.  **Crypto:** CoinGecko → Skip
3.  **Options:** Not currently available (Tradier inactive)