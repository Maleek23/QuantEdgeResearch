# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls, educational disclaimers, and a dark-themed UI for rapid data scanning. The platform is designed for research and educational purposes only and does not provide financial advice.

## User Preferences
- All timestamps displayed in **America/Chicago (CT)** timezone with market session context
- Dark/light theme toggle (dark mode is primary)
- Educational disclaimers must be emphasized on every screen
- Clear risk/reward calculations and position sizing tools
- Fresh research briefs highlighted immediately upon opening
- Platform functions fully without external AI dependencies (quantitative fallback)
- Helpful error messages for API billing, rate limits, and authentication issues
- Liquidity warnings for penny stocks and low-float securities

## System Architecture
The platform is built with a React 18, TypeScript, and Tailwind CSS frontend, utilizing Shadcn UI, TanStack Query, and Wouter. The backend is an Express.js, TypeScript application with a PostgreSQL database (Neon serverless) and Drizzle ORM. Authentication uses session-based methods with bcrypt, Replit Auth, and Google OAuth. The system features two core engines: an AI Engine (integrated with Anthropic Claude, OpenAI GPT, and Google Gemini) and a Quantitative Engine (utilizing RSI(2) Mean Reversion, VWAP Institutional Flow, Volume Spike Early Entry, and ADX Regime Filtering). Key UI/UX decisions include a dark-mode-first design with a specific color palette, glassmorphism-inspired components, and a clear typography hierarchy using Inter and JetBrains Mono. Core features include public informational pages, user authentication, a main application dashboard, trade desk with research briefs, live trading journal, market overview, performance analytics, and various research tools like chart analysis and a historical trade pattern library.

## External Dependencies

### Market Data
- **Yahoo Finance:** Real-time quotes, discovery, historical stock data.
- **CoinGecko:** Real-time and historical cryptocurrency data.
- **Tradier:** Options chains, delta targeting, and live options pricing.
- **Alpha Vantage:** Financial news feeds and earnings calendar.
- **Databento:** Real-time futures data (NQ, GC).

### AI Providers
- **Anthropic (Claude Sonnet 4):** Primary AI engine and research assistant.
- **OpenAI (GPT-4):** Backup for fundamental analysis.
- **Google (Gemini):** Alternative AI analysis.

### Other Integrations
- **Discord:** Webhook notifications.

## Data Intelligence System

### API Endpoint: `/api/data-intelligence`
Provides historical performance analytics from 411+ resolved trades:
- **Engine Performance**: Flow (81.9%), AI (57.1%), Hybrid (40.6%), Quant (34.4%), Chart Analysis (22.2%)
- **Symbol Performance**: 30+ symbols with 3+ trades tracked
- **Confidence Calibration**: Bands recalibrated based on actual outcomes

### Engine Performance (Verified Dec 2025)
| Engine | Trades | W/L | Win Rate | Avg Gain |
|--------|--------|-----|----------|----------|
| Flow Scanner | 199 | 163W/36L | 81.9% | +3.11% |
| AI Engine | 77 | 44W/33L | 57.1% | +1.07% |
| Hybrid | 32 | 13W/19L | 40.6% | -0.16% |
| Quant Engine | 93 | 32W/61L | 34.4% | +0.01% |
| Chart Analysis | 9 | 2W/7L | 22.2% | -0.12% |
| Manual | 1 | 0W/1L | 0% | -3.58% |

**Data Integrity Notes:**
- Outlier protection: avgGain calculations clamp values to ±50% to prevent corrupted data from skewing averages
- Corrupted trades identified and fixed: PINS (ai), TSLY (quant) - marked exclude_from_training=true

### Signal Strength Bands (Replaces Misleading Confidence Dec 2025)
The A/B/C grades now represent **signal consensus**, not probability:
- **A band**: 5+ signals agreeing (Strong Consensus)
- **B+ band**: 4 signals agreeing (Good Consensus)
- **B band**: 3 signals agreeing (Moderate)
- **C+ band**: 2 signals agreeing (Weak)
- **C band**: 1 signal only (Minimal)
- **D band**: 0 signals or conflicting (Avoid)

**Expected Value Display**: Shows "+$X.XX per $1 risked" based on engine historical performance
- Formula: `EV = (winRate × avgWin) - (lossRate × avgLoss)`
- Displayed alongside signal strength for honest, data-backed metrics

### Key Performance Insights
- **Top Symbols**: AAPL, AMD, SOFI, NFLX, QQQ, AMZN, GOOGL, ETH, HOOD (100% win rate, 3+ trades)
- **Avoid**: SOL, AAVE, SMCI, CLF, USAR (0% win rate)
- **Flow Engine Dominance**: Best performer at 81.9% win rate
- **Historical Badges**: Trade cards show engine/symbol performance via HistoricalPerformanceBadge component

## Loss Analysis System

### Automatic Post-Mortem
When trades hit their stop loss, the system automatically analyzes why the trade failed and stores the analysis in the `loss_analysis` table. This provides:
- **What went wrong**: Detailed explanation of the failure
- **Lessons learned**: What to do differently next time
- **Prevention strategy**: How to avoid similar losses

### 15 Loss Reason Categories
- market_reversal, sector_weakness, bad_timing, news_catalyst_failed
- stop_too_tight, overconfident_signal, low_volume_trap, gap_down_open
- trend_exhaustion, fundamental_miss, technical_breakdown
- options_decay, volatility_crush, correlation_blindspot, unknown

### Severity Levels
- Minor: >= -2% loss
- Moderate: -2% to -5% loss
- Significant: -5% to -10% loss
- Severe: < -10% loss

### API Endpoints
- GET `/api/loss-analysis/summary` - Summary with top reasons, worst symbols, engine breakdown
- GET `/api/loss-analysis` - All loss analyses
- GET `/api/loss-analysis/patterns` - Loss patterns grouped by reason
- GET `/api/loss-analysis/trade/:tradeId` - Analysis for specific trade
- POST `/api/loss-analysis/analyze-all` - Admin trigger to analyze historical losses

### UI Component
`LossPatternsDashboard` in the Performance page shows:
- Summary stats (total losses, avg loss, total lost)
- Top loss reasons with visual progress bars
- Worst performing symbols
- Engine breakdown by loss count

## Data Integrity System (Dec 2025)

### Consistent Statistics Across Platform
All performance endpoints now use unified logic for counting wins, losses, and calculating win rates:

**Unified Rules:**
1. **3% Minimum Loss Threshold**: Trades that hit stop with < 3% loss are "breakeven", not counted as losses
2. **Decided Trades Only**: Win rate = wins / (wins + real losses). Excludes expired and breakeven trades
3. **Engine Version Filter**: Only current-gen engines (v3.x, Flow, Hybrid, AI). Excludes legacy v1.x/v2.x

**Endpoints Using Unified Logic:**
- `/api/performance/stats` - Main performance stats (source of truth)
- `/api/data-intelligence` - Historical performance lookups
- `/api/performance/calibrated-stats` - Confidence band calibration
- `/api/performance/symbol-leaderboard` - Top/bottom symbols
- `/api/performance/engine-trends` - Weekly engine trends
- `/api/performance/confidence-calibration` - Confidence vs win rate

**Frontend Consistency:**
- `home.tsx` - Uses same 3% threshold for weekly stats
- `trade-desk.tsx` - Uses same 3% threshold for "Recent Performance"
- `performance.tsx` - All stats from unified `/api/performance/stats`

### Terminology
- **Closed**: All non-open trades (includes hit_target, hit_stop, expired)
- **Decided**: hit_target + real losses (excludes expired, breakeven)
- **Real Loss**: hit_stop with percentGain <= -3%
- **Breakeven**: hit_stop with percentGain > -3%

## Auto-Lotto Bot (Dec 2025)

### Overview
Automated paper trading system that executes lotto plays (high R:R options) to build verifiable performance data before showing win rates to users.

### Sample Size Gating
**All performance metrics are hidden until 20 trades are completed:**
- Non-admin users see "Pending" or "Hidden" for all P&L, win/loss counts, and win rates
- Only the trade count progress is shown (e.g., "2/20 trades")
- This prevents misleading statistics from low sample sizes

### API Endpoint: `/api/auto-lotto-bot`
- **Authentication**: Required (session-based)
- **Admin access**: Full data including individual positions
- **Non-admin access**: Only aggregated stats after 20 trades, no position details

### Bot Configuration
- **Portfolio**: "Auto-Lotto Bot" with system user "system-auto-trader"
- **Max position size**: $500 per trade
- **Risk per trade**: 5%
- **Check frequency**: Every 5 minutes during market hours
- **Targets**: Lotto ideas with R:R >= 2:1

### UI Page
`/watchlist-bot` - Shows bot dashboard with:
- Portfolio value and P&L (if admin or 20+ trades)
- Win rate with sample size context
- Recent positions (admin only)
- "Building Statistical Evidence" banner for non-admin below threshold

## Educational Blog System (Dec 2025)

### Purpose
The blog is designed as an educational content platform to attract organic traffic and help people learn trading concepts - not platform marketing. Each article teaches a fundamental trading skill.

### Blog Categories with Visual Design
- **Education** (blue/cyan gradient): Options basics, candlesticks, Greeks, support/resistance
- **Strategy** (purple/pink gradient): Trading psychology, trading strategies
- **Risk Management** (green gradient): Position sizing, portfolio management
- **Market Insights** (orange/amber gradient): Market analysis, sector trends

### Seeded Educational Articles
1. **Understanding Options: A Beginner's Complete Guide** - Calls, puts, strikes, expiration
2. **Position Sizing: The Most Important Skill in Trading** - The 2% rule, Kelly criterion
3. **How to Read Candlestick Charts** - Patterns, timeframes, confirmation
4. **The Greeks Explained: Delta, Theta, Gamma, Vega** - Options sensitivity measures
5. **Trading Psychology: How to Control Your Emotions** - Fear, greed, FOMO management
6. **Support and Resistance: The Foundation of Technical Analysis** - Key levels identification

### API Endpoints
- `GET /api/blog` - Get all published blog posts
- `GET /api/blog/:slug` - Get single blog post by slug
- `POST /api/blog` - Create blog post (admin only)
- `PATCH /api/blog/:id` - Update blog post (admin only)
- `DELETE /api/blog/:id` - Delete blog post (admin only)
- `POST /api/admin/seed-blog` - Seed educational content (admin only)

### Visual Design
Each blog card uses gradient backgrounds and icons instead of images:
- Hero section with "Learn to Trade" messaging
- Category filter pills for content discovery
- Featured article spotlight
- Gradient visual cards with lucide-react icons
- Topic sections for different skill levels

## Real-time Pricing Service (Dec 2025)

### Unified Pricing Architecture
`server/realtime-pricing-service.ts` consolidates all asset types with provider-specific fallbacks:
- **Stocks**: Tradier (primary) → Yahoo Finance (fallback) - 10s cache TTL
- **Crypto**: CoinGecko with rate limit handling - 30s cache TTL + 5min fallback cache
- **Options**: Tradier OCC symbol lookup - 15s cache TTL
- **Futures**: Yahoo Finance - 5s cache TTL

### API Endpoints
- `GET /api/realtime-quote/:symbol` - Single quote with asset type detection
- `POST /api/realtime-quotes/batch` - Batch quotes for multiple symbols

### Rate Limit Handling
- CoinGecko 429 errors trigger 60s backoff
- Cached prices (up to 5 minutes old) returned as fallback
- Prevents empty crypto data during rate limiting

## Markets Page (Dec 2025)

### Overview
Route: `/markets` - Real-time pricing dashboard for stocks, crypto, and options.

### Features
- **Stocks Tab**: Live quotes for AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, AMD, NFLX, COIN
- **Crypto Tab**: Live quotes for BTC, ETH, SOL, DOGE, XRP, ADA, AVAX, LINK
- **Options Tab**: OCC symbol lookup for specific option contracts
- Market session indicator (Pre-Market, Regular Hours, After-Hours, Closed)
- Auto-refresh every 10 seconds
- Glass card UI with price change highlighting

### Data Flow
1. Frontend makes POST request to `/api/realtime-quotes/batch`
2. Backend checks unified cache, fetches fresh data if expired
3. Returns quotes keyed by raw symbol (e.g., "AAPL", "BTC")
4. Frontend maps quotes to display cards