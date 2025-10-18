# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities across US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, comprehensive risk management tools, and real-time market analysis. The platform aims to offer robust risk controls and clear educational disclaimers, all presented through a professional dark-themed UI optimized for rapid data scanning. The platform integrates real historical data, improving model accuracy significantly.

**NEW: Multi-User Authentication & Subscription System** - The platform now supports multi-user accounts with Replit Auth integration and subscription-based access tiers. This enables the GTM strategy of launching a paid Discord community ($39.99/month Premium tier) where the web platform serves as the premium subscriber dashboard with live signals and analytics, while free users can view the public performance track record.

**NEW: Machine Learning Enhancement** - The platform now features adaptive learning capabilities that improve trade idea quality over time by analyzing historical performance data, identifying winning patterns, and adjusting confidence scores based on signal effectiveness.

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

### Multi-Page Architecture & Authentication
The platform utilizes a multi-page architecture with Replit Auth integration for user management. **Landing Page** serves as the public-facing entry point with pricing tiers (Free: $0, Premium: $39.99/month), contact information (support@quantedge.io, discord.gg/quantedge), and login/signup CTAs. Unauthenticated users see the landing page; authenticated users are routed to the dashboard with full sidebar navigation. Navigation is managed via a sidebar (on app pages) organized into Research, Tools, and System groups.

**Authentication Architecture:**
- **Replit Auth Integration:** OpenID Connect-based authentication via Replit's oauth system (server/replitAuth.ts)
- **Multi-User Database Schema:** Users table with subscription fields (stripeCustomerId, stripeSubscriptionId, subscriptionTier, subscriptionStatus), sessions table for session management
- **User-Scoped Data:** Trade ideas, watchlists, and preferences are linked to userId for multi-tenant isolation
- **Auth Endpoints:** /api/login (initiate login), /api/callback (OAuth callback), /api/auth/logout (end session), /api/auth/me (current user)
- **Frontend Auth Hook:** useAuth() React hook provides isAuthenticated, isLoading, user, login(), logout() methods
- **Protected Routes:** App.tsx conditionally renders landing page vs. authenticated dashboard based on auth state

### UI/UX Decisions
The platform features a **professional Bloomberg-style dark theme** with deep charcoal backgrounds (rgb(13,14,18)) and enhanced visual depth through strategic use of gradients, shadows, and glassmorphism effects. The color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI (with improved hierarchy: 3xl for metrics, bold tracking for headers) and JetBrains Mono for financial data. **Custom CSS utility classes** include stat-card (gradient top borders, professional shadows), stat-card-bullish/bearish (color-coded accent cards), and pro-table (enhanced table styling). UI elements feature enhanced cards with shadow-lg depth, gradient headers (from-card to-muted/20), icon backgrounds with colored accents (bg-primary/10), hover effects, badges, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. Additional enhancements include glowing verification badges for real data, real-time price displays with subtle animations, simplified card layouts for faster scanning, accessible view toggles, detailed analysis modals with multiple tabs, and full mobile responsiveness with hamburger menu. An intelligent advisory system provides real-time trading advice with colored indicators, action badges, dynamic R:R analysis, and profit/loss tracking. The overall aesthetic elevates the platform from basic HTML to a polished, professional quantitative trading interface comparable to institutional-grade fintech platforms.

### Technical Implementations & Feature Specifications
The platform is built with a React/TypeScript frontend using Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, **PostgreSQL database (Neon) with Drizzle ORM for permanent data persistence**, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard with quick actions and idea generation, a unified trade ideas feed with robust filtering and generation capabilities (Quant and AI), and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores, probability bands, and multi-factor quality signals. Day trading features include specific handling for options, "DAY TRADE" badges, and dynamic grade systems. A quick actions dialog facilitates smart trade idea creation from symbol search with asset-specific recommendations and liquidity warnings. Watchlist management includes expandable quantitative analysis for crypto. The QuantAI Bot can auto-save structured trade ideas from conversations. An AI-free Quantitative Idea Generator provides ideas based on various signals, balancing asset distribution (stocks, options, crypto) with real-time entry prices and time windows for execution.

**Performance Tracking System:** A comprehensive analytics suite that validates trade outcomes, tracks win rates, and enables data-driven strategy improvement. Features include:
- **Auto-Validation Service:** Automatically checks current prices against targets/stops for all open ideas, marking them as won/lost/expired with accurate holding times and percent gains. Stamps validation timestamps on all checked ideas for dashboard transparency.
- **Manual Outcome Recording:** User-friendly dialog allowing traders to manually record outcomes (won/lost/breakeven) with exit prices and notes. Backend automatically calculates holding times from idea timestamp to exit time.
- **Performance Dashboard:** Professional analytics page (/performance) displaying overall metrics (total ideas, win rate, average gain, average holding time) plus detailed breakdowns by source (AI vs Quant vs Manual), asset type (stocks vs options vs crypto), and signal type (which technical indicators work best). **NEW: Enhanced with win rate trend chart, cumulative P&L equity curve, and smart insights panel.**
- **Outcome Badges:** Visual indicators on trade idea cards and detail modals showing outcome status (HIT TARGET in green, HIT STOP in red, EXPIRED/CLOSED in neutral).
- **CSV Export:** Export all trade ideas with complete performance data for external analysis in Excel or Google Sheets.
- **Tab Organization:** Trade Ideas page separates NEW IDEAS (open positions) from ARCHIVED (closed positions) for easy portfolio management.
- **Real-time Cache Invalidation:** Performance stats update immediately after manual recording or auto-validation to ensure live accuracy.

**Machine Learning System (NEW):** Adaptive intelligence that learns from historical performance to improve future trade ideas:
- **Signal Intelligence Page (/signals):** Dedicated analytics page showing which technical indicators perform best, signal combination win rates, reliability scores, and expectancy calculations. Requires minimum 10 closed trades for statistical significance.
- **Learned Pattern Analyzer:** ML endpoint that calculates optimal signal weights based on historical win/loss data. Trained on closed trades and updates dynamically as more data becomes available.
- **Adaptive Confidence Scoring:** Quant generator fetches learned weights and applies them to confidence calculations. High-performing signals boost confidence scores (🧠 ML-Boosted), underperforming signals reduce them (🧠 ML-Adjusted).
- **Win Rate Visualization:** Rolling 10-trade window chart showing performance trends over time on Performance page.
- **Equity Curve Tracking:** Cumulative P&L chart displaying total gains/losses progression on Performance page.
- **Minimum Data Guard:** All ML features require 10+ closed trades to prevent learning from statistical noise and ensure reliable insights.

### System Design Choices
The system employs a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences, emphasizing modularity, responsiveness, and clear separation of concerns. Comprehensive data quality and error handling are implemented to guard against invalid numeric values in calculations, displaying "N/A" for professional presentation.

**Data Persistence:** The platform uses a PostgreSQL database (Neon-backed) managed by Drizzle ORM. All trade ideas, performance tracking data, market data, watchlists, catalysts, options data, user accounts, sessions, and user preferences are stored permanently in the database. Data survives server restarts, redeployments, and publishing. Chat history is kept in-memory for simplicity. Database schema is defined in `shared/schema.ts` and managed via `npm run db:push`.

**Multi-User Schema:**
- **users table:** id (primary key), email, firstName, lastName, stripeCustomerId, stripeSubscriptionId, subscriptionTier (free/premium), subscriptionStatus (active/canceled/past_due), subscriptionEndsAt, createdAt, updatedAt
- **sessions table:** PostgreSQL session storage using connect-pg-simple for Passport.js session persistence
- **Foreign Keys:** tradeIdeas.userId, watchlist.userId, userPreferences.userId link data to specific users

**Subscription Tiers:**
- **Free ($0/month):** View public performance ledger, historical trade ideas archive, basic market data
- **Premium ($39.99/month):** Everything in Free + real-time trade signals, AI + Quant dual-engine, Discord community access, instant Discord notifications, advanced analytics & ML insights

## External Dependencies

### Data Sources
-   **CoinGecko API:** Primary for Crypto (real-time prices, historical data, market cap rankings, market-wide discovery).
-   **Yahoo Finance:** Primary for Stocks (real-time quotes, **market-wide stock discovery via screener API**, historical data - unlimited requests).
-   **Alpha Vantage API:** Fallback for Stocks (historical data, rate-limited to 25/day).
-   **Tradier API:** Inactive (options chains, 401 authentication errors).

**NEW: Dynamic Market-Wide Stock Discovery** - The platform scans the ENTIRE stock market (not just hardcoded symbols) to discover high-volume movers and breakout candidates. Yahoo Finance screener endpoints provide top gainers, losers, and most active stocks with filtering criteria: $1-$500 price range, 100K+ volume, $50M+ market cap. Discovers 30+ opportunities per scan including hidden gems like LBRT (+28.3%), IRON (+21.0%), PRAX (+16.8%), HIMS (-15.8%). Stock discovery mirrors the successful crypto gem finder pattern.

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.

### Data Flow Hierarchy
1.  **Stock Current Prices:** Tradier → Alpha Vantage → Yahoo Finance
2.  **Stock Historical Data:** Tradier → Alpha Vantage → **Yahoo Finance (UNLIMITED fallback)**
3.  **Stock Discovery:** Yahoo Finance screener (gainers/losers/mostActive - unlimited)
4.  **Crypto Current Prices:** CoinGecko
5.  **Crypto Historical Data:** CoinGecko
6.  **Crypto Discovery:** CoinGecko market rankings (filters top-20, targets $50M-$2B cap with 3%+ moves or 10%+ turnover)
7.  **Options:** Not currently available (Tradier inactive)