# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities across US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, comprehensive risk management tools, and real-time market analysis. The platform aims to offer robust risk controls and clear educational disclaimers, all presented through a professional dark-themed UI optimized for rapid data scanning. It integrates real historical data to improve model accuracy and features adaptive learning capabilities that improve trade idea quality over time. The platform operates with a public-access model, managing membership tiers (Free vs. Premium) through Discord roles, with the web platform serving as a public dashboard.

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

### Multi-Page Architecture & Public Access Model
The platform uses a multi-page architecture with all pages publicly accessible without authentication. Membership tiers are managed via Discord roles, and the web platform serves as a public dashboard for viewing signals and performance. Future integration with Discord OAuth is planned for gating premium features. Navigation is managed via a sidebar.

### UI/UX Decisions
The platform features a professional Bloomberg-style dark theme using deep charcoal backgrounds, gradients, shadows, and glassmorphism effects. The color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS utility classes provide enhanced styling for cards, tables, and accent elements. UI elements include enhanced cards with shadow depth, gradient headers, icon backgrounds, hover effects, badges, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. It includes glowing verification badges for real data, real-time price displays, simplified card layouts, accessible view toggles, detailed analysis modals, and full mobile responsiveness. An intelligent advisory system provides real-time trading advice with dynamic R:R analysis and profit/loss tracking. **Responsive Design**: Generate buttons show compact text on mobile ("Q"/"A"), tab labels adapt to screen size (FRESH/ACTIVE/ARCHIVED on desktop, shorter variants on mobile), and weekend banner remains functional across all viewports. **Toast Notifications**: All toasts include data-testid attributes (toast-notification, toast-title, toast-description) for accessibility and automation testing.

### Technical Implementations & Feature Specifications
The frontend is built with React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM for persistence, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard, a unified trade ideas feed with Quant and AI generation, and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands. Day trading features include options handling, "DAY TRADE" badges, and dynamic grade systems. A quick actions dialog facilitates smart trade idea creation with three modes: AI-powered, Quantitative rules-based, and Manual Entry. Manual Entry mode enables users to create trade ideas with custom direction (LONG/SHORT), entry/target/stop prices, and live R:R calculation, with comprehensive validation to prevent invalid pricing relationships. **Market catalysts are tracked with clickable source URLs** - both the `catalysts` table and trade ideas include optional `sourceUrl`/`catalystSourceUrl` fields enabling users to click through to external news sources, SEC filings, or earnings reports. **Weekend Preview Banner** displays on Sat/Sun showing next Monday market open time with asset filter dropdown (Stock Shares/Options/Crypto) that bidirectionally syncs with main page filters - lightweight helper design prevents redundancy with Fresh Ideas tab. Watchlist management includes expandable quantitative analysis for crypto, plus a real-time price alert system. Users can add symbols to watchlist with custom entry/target/stop alert prices and receive Discord notifications when prices hit their targets. The watchlist monitor runs every 5 minutes checking all enabled alerts. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator provides ideas balancing asset distribution with real-time entry prices.

A comprehensive Performance Tracking System automatically validates trade outcomes, tracks win rates, and enables strategy improvement. It includes an auto-validation service, manual outcome recording, a performance dashboard with overall metrics and breakdowns, outcome badges, and CSV export.

A Machine Learning System enhances trade ideas by analyzing historical performance. It includes a Signal Intelligence page, a Learned Pattern Analyzer to calculate optimal signal weights, and Adaptive Confidence Scoring that adjusts confidence based on signal effectiveness. ML features require a minimum of 10 closed trades for statistical significance.

A **Quantitative Timing Intelligence System** provides data-backed entry/exit windows aligned with confidence grading. The system combines historical holding-time distributions (per signal/grade/asset) with real-time market regime detection (volatility, session phase, trend strength) to calculate optimal timing windows. Higher-confidence trades (A+/A grades) receive tighter, more aggressive windows backed by strong signal alignment, while lower-grade trades (B/C) get wider, conservative windows reflecting uncertainty. The system tracks volatility regime (low/normal/high/extreme), session phase (opening/mid-day/closing/overnight), trend strength (0-100), and provides target-hit probability estimates based on historical performance. All timing recommendations are quantitatively proven through backtesting and continuously improve via ML as more outcomes are recorded.

### System Design Choices
The system uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) managed by Drizzle ORM. All critical data is stored permanently. The user schema is simplified for future Discord integration, with subscription tiers managed externally via Discord.

### Access Control & Administration

**Current Access Tiers:**
- **Free Tier**: Public access to browse and view all content (no restrictions currently enforced)
- **Premium Tier** ($39.99/month): Full feature access including AI generation, quantitative ideas, and performance tracking (currently all features public, enforcement planned with Discord OAuth)
- **Admin Tier**: Platform management access via password-protected `/admin` panel

**Admin Panel Features:**
Located at `/admin`, password-protected using the `ADMIN_PASSWORD` environment variable:
- **Dashboard**: Real-time system statistics (total users, premium users, active trade ideas, win rate)
- **User Management**: View all registered users, subscription tiers, and Discord associations
- **Trade Ideas**: Browse all trade ideas across the platform with outcomes and performance data
- **System Tools**: 
  - Export platform data to CSV
  - Clear test data (ONLY deletes OPEN trades >7 days old - PRESERVES all trades with outcomes)
  - Refresh cache/invalidate queries
  - Database monitoring

**Technical Implementation:**
- **Phase 1 Security (✅ COMPLETED):**
  - JWT authentication with HTTP-only cookies (24-hour expiration)
  - Session tokens stored securely, not accessible via JavaScript
  - Fail-fast JWT secret validation (requires JWT_SECRET or SESSION_SECRET)
  - No hard-coded secret fallbacks - prevents token forgery
  - Legacy password auth maintained for backward compatibility
  - Winston structured logging for all admin actions
  - Comprehensive rate limiting on all admin endpoints (30 req/15min)
- `requireAdmin` middleware protects all admin routes (supports both JWT cookies and legacy password headers)
- `requirePremium` middleware created but not enforced (awaiting Discord OAuth integration)

**Next Steps - Discord OAuth Integration:**
1. Implement Discord OAuth login flow
2. Sync Discord roles with platform subscription tiers
3. Enable `requirePremium` middleware on AI/Quant generation endpoints
4. Add upgrade prompts for free users attempting premium features
5. Auto-refresh user tier when Discord roles change

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap rankings, market-wide discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, market-wide stock discovery via screener API, historical data - unlimited requests).
-   **Alpha Vantage API:** Fallback for Stocks (historical data).
-   **Tradier API:** Options data (CURRENTLY DISABLED - API key 401 Unauthorized). Options generation is set to 0% until a valid Tradier API key is provided. Without real options chains, delta targeting, and live contract pricing, the platform was generating placeholder/estimated data which is unacceptable for a professional trading platform. Only stock shares and crypto are generated (both use real data).
-   **Dynamic Market-Wide Stock Discovery:** Utilizes Yahoo Finance screener endpoints to find high-volume movers and breakout candidates across the entire stock market.

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.

### Data Flow Hierarchy
1.  **Stock Current Prices:** Alpha Vantage → Yahoo Finance
2.  **Stock Historical Data:** Alpha Vantage → Yahoo Finance (UNLIMITED fallback)
3.  **Stock Discovery:** Yahoo Finance screener
4.  **Crypto Current Prices:** CoinGecko
5.  **Crypto Historical Data:** CoinGecko
6.  **Crypto Discovery:** CoinGecko market rankings