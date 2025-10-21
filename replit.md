# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform designed to identify day-trading opportunities across US equities, options, and crypto markets. Its primary purpose is to provide educational, research-grade trade ideas, comprehensive risk management tools, and real-time market analysis. The platform aims to offer robust risk controls and clear educational disclaimers, all presented through a professional dark-themed UI optimized for rapid data scanning. It integrates real historical data to improve model accuracy and features adaptive learning capabilities that improve trade idea quality over time. The platform operates with a public-access model, managing membership tiers (Free vs. Premium) through Discord roles, with the web platform serving as a public dashboard.

## User Preferences
All timestamps should be displayed in America/Chicago timezone with market session context.
The UI should be a professional dark-themed interface optimized for rapid data scanning.
Educational disclaimers must be emphasized (not financial advice).
Clear and precise risk/reward calculations and position sizing tools are required.
The platform should highlight fresh, actionable trade ideas immediately upon opening.
The platform should function fully even without external AI dependencies, offering a quantitative idea generator alternative.
Provide helpful error messages for API billing, rate limits, and authentication issues.
Liquidity warnings should be displayed for penny stocks and low-float securities.
No personalized financial advice should be offered; it is for research purposes only.

## System Architecture

### Multi-Page Architecture & Public Access Model
The platform uses a multi-page architecture with all pages publicly accessible without authentication. Membership tiers are managed via Discord roles, and the web platform serves as a public dashboard for viewing signals and performance. Future integration with Discord OAuth is planned for gating premium features. Navigation is managed via a sidebar.

### UI/UX Decisions
The platform features a professional Bloomberg-style dark theme using deep charcoal backgrounds, gradients, shadows, and glassmorphism effects. The color palette uses green for bullish, red for bearish, amber for neutral/warning, and blue for primary actions. Typography uses Inter for UI and JetBrains Mono for financial data. Custom CSS utility classes provide enhanced styling for cards, tables, and accent elements. UI elements include enhanced cards with shadow depth, gradient headers, icon backgrounds, hover effects, badges, sticky-header tables, responsive grids, loading skeletons, pulsing "FRESH" badges, smart notifications, and optimistic UI updates. It includes glowing verification badges for real data, real-time price displays, simplified card layouts, accessible view toggles, detailed analysis modals, and full mobile responsiveness. An intelligent advisory system provides real-time trading advice with dynamic R:R analysis and profit/loss tracking. Responsive Design ensures adaptability across various screen sizes. Toast Notifications are used for user feedback, and Contextual Button Placement optimizes UI clutter.

### Technical Implementations & Feature Specifications
The frontend is built with React/TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, Wouter, and date-fns-tz. The backend uses Express.js with TypeScript, a PostgreSQL database (Neon) with Drizzle ORM for persistence, and Zod validation. Key features include a collapsible sidebar, symbol search with real-time pricing, a metrics-focused dashboard, a unified trade ideas feed with Quant and AI generation, and a conversational QuantAI Bot with multi-provider fallback and chat history. A quality scoring system incorporates confidence scores and probability bands.

The Holding Period Classification System clearly separates directional bias from holding period with distinct UI badges and icons. A quick actions dialog facilitates smart trade idea creation with AI-powered, Quantitative rules-based, and Manual Entry modes. Market catalysts are tracked with clickable source URLs. A Weekend Preview Banner displays next Monday market open time with asset filter dropdown. Watchlist management includes expandable quantitative analysis for crypto, plus a real-time price alert system with Discord notifications. The QuantAI Bot can auto-save structured trade ideas. An AI-free Quantitative Idea Generator provides ideas balancing asset distribution with real-time entry prices. Penny stocks are supported with a separate 'penny_stock' asset type and relaxed market cap requirements.

A Comprehensive User Settings System enables full platform personalization across Trading, Display, Alerts, and Advanced categories, persisting settings in PostgreSQL. A comprehensive Performance Tracking System automatically validates trade outcomes, tracks win rates, and enables strategy improvement. A Machine Learning System enhances trade ideas by analyzing historical performance, including a Signal Intelligence page, Learned Pattern Analyzer, and Adaptive Confidence Scoring. A Quantitative Timing Intelligence System provides data-backed entry/exit windows aligned with confidence grading, combining historical holding-time distributions with real-time market regime detection.

### Quantitative Strategy Design (October 2025 Redesign)

The quantitative idea generator was completely redesigned to eliminate "momentum chasing" behavior that led to 2.3% prediction accuracy. The previous implementation detected moves that already happened (e.g., "10.6% rally"), entered at current price (after the rally), then expected unrealistic 8-15% continuation. This resulted in 34 out of 35 closed trades moving closer to stop loss than target.

**Current Strategy (Predictive Approach):**

Signal Priority (checked in order):
1. **RSI Divergence** (HIGHEST PRIORITY): Oversold (<30) or overbought (>70) conditions signaling mean reversion before bounce/pullback occurs
2. **MACD Crossover** (SECOND PRIORITY): Bullish/bearish crossover signals indicating early trend formation
3. **Early Breakout Setups** (THIRD PRIORITY): Price approaching 52-week highs/lows (95-98% range) with volume building, but move still <2% (not after big breakout). Moved up from 4th priority as more predictive than mean reversion.
4. **Mean Reversion** (FOURTH PRIORITY): Extreme moves (±7%) creating reversal setups before the bounce/crash begins. Moved down as still reactive to large moves.
5. **Volume Spikes** (FIFTH PRIORITY): Exceptional volume (3x+ average) with minimal price movement (<1%), catching institutional accumulation before the move

**Removed Signals:**
- All "momentum" signals (5%, 2%, 1.5% rallies) that chased finished moves
- Volume spikes after big price moves
- Breakouts detected after price already broke out

**Realistic Targets (Day Trading Focus):**
- RSI/MACD: 4-5% targets with 2-3% stops (was 10-12% targets, 5-6% stops)
- Breakouts: 5% targets with 2% stops (was 15% targets, 4% stops)  
- Mean Reversion: 6% targets with 3% stops (was 15% targets, 8% stops)
- Volume Spikes: 5% targets with 2% stops (was 12% targets, 6% stops)

**Catalyst Language:**
- Predictive: "RSI oversold at 28 - reversal opportunity"
- NOT reactive: "10.6% rally on 1.5x volume" (chasing)

**Performance Grading System:**

Two separate metrics track different aspects of performance:

1. **Market Win Rate** (Traditional Trading Metric):
   - Measures actual trading outcomes: hit_target ÷ (hit_target + hit_stop)
   - Excludes expired trades from calculation
   - Represents "if you traded these ideas, did you make money?"

2. **Quant Accuracy** (Prediction Correctness):
   - Measures prediction quality: correct predictions ÷ total evaluated
   - Includes all trades (open + closed) with price tracking data
   - Uses 50% threshold: price must move at least halfway to target to count as "accurate"
   - For open trades: dynamically evaluated using highest/lowestPriceReached
   - For closed trades: uses saved predictionAccurate field from database
   - Represents "did the quant model correctly predict direction and magnitude?"

Critical fixes (October 2025):
- Performance validator now properly saves predictionAccurate, predictionValidatedAt, highestPriceReached, and lowestPriceReached fields when updating trades, ensuring accurate historical tracking.
- Added `excludeFromTraining` flag to prevent legacy/bad trades from poisoning ML model. All 35 trades from the flawed momentum-chasing strategy were marked as excluded (October 21, 2025).
- Confidence scoring fixed to reward EARLY predictive setups (RSI extremes, MACD histogram strength, early breakouts with small moves) instead of finished price moves, aligning scoring with predictive strategy.
- ML retraining now filters out trades where `excludeFromTraining = true`, preventing model poisoning from legacy bad data.
- **B+ Quality Filter (October 21, 2025):** Removed backwards quality-based R:R adjustment that penalized weak trades; recalibrated confidence scoring to make 85+ achievable (increased points for R:R 2:1+ from 20→28, volume 1.5x+ from 15→18, strong signals from 20→25); implemented multi-tier filtering requiring confidence ≥85 AND R:R ≥1.3 (stocks) or ≥1.2 (crypto) AND volume ≥1.0x (longs), ≥0.8x (shorts), ≥0.6x (crypto). Result: Only B+ grade and above trades generated (scores 85-100).

**Phase 1 - Professional Risk Metrics (October 21, 2025):**
Following professional quant trader standards, implemented industry-standard risk metrics to improve user confidence and accuracy assessment:

1. **Professional Metrics Added:**
   - **Sharpe Ratio:** Risk-adjusted returns (target >1.5 for day trading)
   - **Max Drawdown:** Worst peak-to-trough equity decline (%)
   - **Profit Factor:** Gross wins ÷ gross losses (target >1.3)
   - **Expectancy:** Expected value per trade in percentage terms

2. **ML Training Threshold Raised:**
   - Increased from 10 → 30 trades minimum before ML training begins
   - Professional quants never trust results from <30 samples
   - Prevents premature pattern recognition from small sample sizes

3. **UI Enhancements:**
   - New "Professional Risk Metrics" section on Performance page
   - Color-coded thresholds (green/amber/red) based on professional standards
   - Clear target guidance for each metric

**⏰ PHASE 2 TODO (Requires 30+ Closed Trades First):**
Once sufficient clean data is available (30+ training-eligible closed trades), implement:
- 70/30 train/test data split for ML validation
- Validation set performance tracking
- Only deploy ML weights if validation Sharpe >1.5
- Prevents overfitting by testing on unseen data before production deployment

### System Design Choices
The system uses a RESTful API design. Data models cover Market Data, Trade Ideas, Options Data, Catalysts, Watchlist, and User Preferences. Data persistence is handled by a PostgreSQL database (Neon-backed) managed by Drizzle ORM. All critical data is stored permanently. The user schema is simplified for future Discord integration, with subscription tiers managed externally via Discord.

### Access Control & Administration
Access tiers include Free, Premium, and Admin. The Admin Panel, located at `/admin` and password-protected, provides comprehensive platform management capabilities:

**Dashboard Features:**
- Real-time statistics (total users, trade ideas, win rate, database health)
- User management with tier modification (Free ↔ Premium) and account deletion
- Trade idea review and monitoring
- System health monitoring (AI providers, market data APIs, database)
- Activity logging and alert tracking

**Database Maintenance Tools:**
- Cleanup old ideas (configurable retention period, default 30 days)
- Archive closed trades (configurable, default 7 days)
- Database optimization (VACUUM ANALYZE)
- Table statistics and health monitoring

**Security:**
- Dual authentication: 4-digit PIN (ADMIN_ACCESS_CODE) + password (ADMIN_PASSWORD)
- JWT authentication with HTTP-only cookies
- Session tokens with expiration
- Fail-fast JWT secret validation
- Rate limiting on admin endpoints
- `requireAdmin` middleware for protected routes

`requirePremium` middleware is in place for future use with Discord OAuth integration.

## External Dependencies

### Data Sources
-   **CoinGecko API:** Crypto (real-time prices, historical data, market cap rankings, market-wide discovery).
-   **Yahoo Finance:** Stocks (real-time quotes, market-wide stock discovery via screener API, historical data).
-   **Alpha Vantage API:** Fallback for Stocks (historical data).
-   **Tradier API:** Options data (real options chains, delta targeting, live contract pricing).

### AI Providers
-   **OpenAI API:** For GPT-5 integration.
-   **Anthropic API:** For Claude Sonnet 4 integration.
-   **Google Gemini API:** For Gemini 2.5 integration.

### Data Flow Hierarchy
1.  **Stock Current Prices:** Alpha Vantage → Yahoo Finance
2.  **Stock Historical Data:** Alpha Vantage → Yahoo Finance
3.  **Stock Discovery:** Yahoo Finance screener
4.  **Crypto Current Prices:** CoinGecko
5.  **Crypto Historical Data:** CoinGecko
6.  **Crypto Discovery:** CoinGecko market rankings