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