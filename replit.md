# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform for day-trading US equities, options, crypto, and futures markets. The core branding is **"2 Engines. 1 Edge."** representing AI Analysis + Quantitative Signals working together.

**Purpose:** Provide educational, research-grade trade ideas with robust risk management and real-time market analysis. Emphasizes strong risk controls, educational disclaimers, and a dark-themed UI optimized for rapid data scanning.

**Disclaimer:** Platform provides research and educational content only - NOT financial advice.

---

## User Preferences
- All timestamps displayed in **America/Chicago (CT)** timezone with market session context
- Dark/light theme toggle (dark mode is primary)
- Educational disclaimers must be emphasized
- Clear risk/reward calculations and position sizing tools
- Fresh, actionable trade ideas highlighted immediately upon opening
- Platform functions fully without external AI dependencies (quantitative fallback)
- Helpful error messages for API billing, rate limits, and authentication issues
- Liquidity warnings for penny stocks and low-float securities

---

## Technical Stack

### Frontend
- **Framework:** React 18, TypeScript
- **Styling:** Tailwind CSS 4 with custom glassmorphism, Shadcn UI
- **State:** TanStack Query v5 for data fetching
- **Routing:** Wouter
- **Utilities:** date-fns-tz, Lucide React icons, React Icons, Framer Motion
- **3D:** React Three Fiber, Three.js

### Backend
- **Runtime:** Express.js, TypeScript, tsx
- **Database:** PostgreSQL (Neon serverless)
- **ORM:** Drizzle ORM with Zod validation
- **Logging:** Winston
- **Auth:** Session-based with bcrypt, Replit Auth (OIDC), Google OAuth

---

## Database Schema (shared/schema.ts)

### Core Tables
| Table | Purpose |
|-------|---------|
| `users` | User accounts, auth, subscription tiers (free/advanced) |
| `tradeIdeas` | Trade ideas with entry/exit prices, catalysts, performance tracking |
| `marketData` | Current/historical market data for assets |
| `optionsData` | Options contract data (greeks, IV, OI) |
| `futuresContracts` | Futures contract specs and margin requirements |
| `watchlist` | User watchlists with price alerts |
| `catalysts` | Market catalysts and news events |
| `userPreferences` | User settings (trading, display, notifications) |

### Trading Tables
| Table | Purpose |
|-------|---------|
| `activeTrades` | Live trade positions with real-time P&L |
| `paperPortfolios` | Paper trading virtual portfolios |
| `paperPositions` | Paper trading open positions |
| `paperEquitySnapshots` | Daily equity curves for paper trading |

### Tracking Tables
| Table | Purpose |
|-------|---------|
| `trackedWallets` | Crypto whale wallet monitoring |
| `walletHoldings` | Wallet token holdings |
| `walletTransactions` | Wallet transaction history |
| `walletAlerts` | Wallet activity alerts |
| `ctSources` | Social media influencer sources |
| `ctMentions` | Influencer trade mentions |
| `ctCallPerformance` | Influencer call performance tracking |

### System Tables
| Table | Purpose |
|-------|---------|
| `modelCards` | ML/Quant model version governance |
| `dailyUsage` | Rate limiting usage tracking |

---

## Page Routes (client/src/App.tsx)

### Main Pages
| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Public landing page |
| `/home` | Home | Daily game plan dashboard |
| `/trade-desk` | Trade Desk | Primary trading interface |
| `/live-trading` | Live Trading | Real-time trade tracking |
| `/trading-rules` | Trading Rules | Strategy documentation |

### Research Pages
| Route | Page | Description |
|-------|------|-------------|
| `/performance` | Performance | Analytics and metrics |
| `/market` | Market | Market overview, watchlist |
| `/chart-analysis` | Chart Analysis | AI chart pattern analysis |
| `/chart-database` | Chart Database | Historical trade patterns |

### Hidden Features
| Route | Page | Description |
|-------|------|-------------|
| `/paper-trading` | Paper Trading | Virtual trading simulator |
| `/wallet-tracker` | Wallet Tracker | Crypto whale monitoring |
| `/ct-tracker` | CT Tracker | Crypto influencer tracking |

### System Pages
| Route | Page | Description |
|-------|------|-------------|
| `/settings` | Settings | User preferences |
| `/pricing` | Pricing | Subscription tiers |
| `/admin` | Admin | Admin panel (PIN protected) |
| `/login` | Login | User authentication |
| `/signup` | Signup | User registration |

### Content Pages
| Route | Page | Description |
|-------|------|-------------|
| `/academy` | Academy | Educational resources |
| `/blog` | Blog | Articles and insights |
| `/success-stories` | Success Stories | Trade showcases |
| `/about` | About | Creator info |
| `/privacy` | Privacy Policy | Legal |
| `/terms` | Terms of Service | Legal |

---

## API Routes Overview (server/routes.ts)

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Current user info
- `GET /api/login/google` - Google OAuth

### Trade Ideas
- `GET /api/trade-ideas` - List all trade ideas
- `POST /api/trade-ideas` - Create trade idea
- `POST /api/generate-ideas` - AI idea generation
- `POST /api/generate-quant-ideas` - Quant engine generation
- `POST /api/generate-futures-ideas` - Futures idea generation

### Market Data
- `GET /api/search` - Symbol search
- `GET /api/market-data` - Market data
- `GET /api/options-chain/:symbol` - Options chain
- `GET /api/stock-price/:symbol` - Stock price
- `GET /api/crypto-price/:symbol` - Crypto price

### Performance
- `GET /api/performance/stats` - Performance statistics
- `GET /api/performance/leaderboard` - Symbol leaderboard
- `GET /api/performance/heatmap` - Time-of-day heatmap

### Live Trading
- `GET /api/active-trades` - User's active trades
- `POST /api/active-trades` - Create active trade
- `PATCH /api/active-trades/:id` - Update trade
- `DELETE /api/active-trades/:id` - Delete trade

### Paper Trading
- `GET /api/paper-portfolios` - User portfolios
- `POST /api/paper-portfolios` - Create portfolio
- `POST /api/paper-positions` - Open position
- `PATCH /api/paper-positions/:id/close` - Close position

### Watchlist
- `GET /api/watchlist` - User watchlist
- `POST /api/watchlist` - Add to watchlist
- `DELETE /api/watchlist/:id` - Remove from watchlist

---

## Backend Services (server/)

### Core Services
| File | Purpose |
|------|---------|
| `ai-service.ts` | OpenAI/Claude/Gemini integration |
| `quant-ideas-generator.ts` | Quantitative signal generator |
| `quantitative-engine.ts` | Advanced quant engine (futures) |
| `flow-scanner.ts` | Unusual options flow detection |
| `lotto-scanner.ts` | Far-OTM weekly options scanner |

### Data Services
| File | Purpose |
|------|---------|
| `market-api.ts` | Yahoo Finance, CoinGecko integration |
| `tradier-api.ts` | Options chain and live pricing |
| `futures-data-service.ts` | Futures contract data |
| `news-service.ts` | Alpha Vantage news feed |
| `earnings-service.ts` | Earnings calendar |

### Background Jobs
| File | Purpose |
|------|---------|
| `auto-idea-generator.ts` | Daily 9:30 AM CT idea generation |
| `watchlist-monitor.ts` | Price alert monitoring (5 min) |
| `performance-validation-service.ts` | Trade outcome validation (5 min) |
| `discord-service.ts` | Discord webhook notifications |

### Utility Services
| File | Purpose |
|------|---------|
| `timing-intelligence.ts` | Entry/exit timing calculations |
| `trade-validation.ts` | Trade structure validation |
| `technical-indicators.ts` | RSI, VWAP, volume calculations |
| `options-enricher.ts` | Options data enrichment |
| `chart-analysis.ts` | AI chart pattern analysis |

---

## External API Dependencies

### Market Data
| API | Purpose | Data |
|-----|---------|------|
| **Yahoo Finance** | Stocks | Real-time quotes, discovery, historical |
| **CoinGecko** | Crypto | Real-time, historical, market cap |
| **Tradier** | Options | Chains, delta targeting, live pricing |
| **Alpha Vantage** | News | Breaking news, earnings calendar |
| **Databento** | Futures | NQ, GC real-time, contract specs |

### AI Providers
| API | Model | Usage |
|-----|-------|-------|
| **OpenAI** | GPT-4 | Fundamental analysis |
| **Anthropic** | Claude Sonnet | Trade idea generation |
| **Google** | Gemini | Alternative AI analysis |

---

## Quantitative Engine (v3.7.0)

### Signal Components
1. **RSI(2) Mean Reversion** with 200-Day MA Filter
2. **VWAP Institutional Flow** detection
3. **Volume Spike Early Entry** (3x avg volume)
4. **ADX Regime Filtering** (trend strength)
5. **Signal Confidence Voting** system
6. **Time-of-Day Filtering** (optimal trading windows)

### Risk Parameters
- Stop-loss: 5-7% for stocks and crypto
- Risk/Reward minimum: 1.5:1
- Target win rate: 55-65%
- Performance target: <60s end-to-end latency

---

## Subscription Tiers

| Feature | Free | Advanced |
|---------|------|----------|
| Daily Ideas | 5 | Unlimited |
| AI Generations | 3/day | Unlimited |
| Performance History | 7 days | Full |
| Price Alerts | 3 | Unlimited |
| Paper Trading | Basic | Full |

---

## Design System

### Color Palette (Dark Mode Primary)
| Purpose | Class | Hex |
|---------|-------|-----|
| Primary/Accent | `text-cyan-400` | #22d3ee |
| Bullish | `text-green-400` | #4ade80 |
| Bearish | `text-red-400` | #f87171 |
| Warning | `text-amber-400` | #fbbf24 |
| Muted | `text-muted-foreground` | ~#9ca3af |

### Glassmorphism Classes
| Class | Usage |
|-------|-------|
| `.glass-card` | Primary containers |
| `.glass` | Cyan-tinted interactive |
| `.glass-secondary` | Neutral elements |
| `.glass-success` | Bullish/positive |
| `.glass-danger` | Bearish/negative |

### Button Variants
| Variant | Usage |
|---------|-------|
| `variant="glass"` | Primary actions (cyan) |
| `variant="glass-secondary"` | Secondary actions |
| `variant="glass-success"` | Buy/bullish actions |
| `variant="glass-danger"` | Sell/bearish actions |

### Typography
- Sans: Inter
- Mono: JetBrains Mono
- Page titles: `text-2xl sm:text-3xl font-bold`
- Prices: `font-mono text-sm`

### Layout
- Page container: `p-4 sm:p-6 space-y-6 max-w-7xl mx-auto`
- Glass card: `glass-card rounded-xl p-5`
- Hero header gradient: `from-cyan-500/10 via-transparent to-cyan-400/10`

---

## Environment Variables

### Required Secrets
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption
- `ADMIN_ACCESS_CODE` - Admin PIN
- `ADMIN_PASSWORD` - Admin password

### API Keys
- `OPENAI_API_KEY` - GPT integration
- `ANTHROPIC_API_KEY` - Claude integration
- `GEMINI_API_KEY` - Gemini integration
- `TRADIER_API_KEY` - Options data
- `ALPHA_VANTAGE_API_KEY` - News/earnings
- `DISCORD_WEBHOOK_URL` - Notifications

### Optional
- `GOOGLE_CLIENT_ID/SECRET` - Google OAuth
- `NOTION_API_KEY` - Documentation sync
- `DATABENTO_API_KEY` - Futures data

---

## Development

### Start Command
```bash
npm run dev
```
Runs Express backend + Vite frontend on port 5000.

### Database Migrations
```bash
npx drizzle-kit push
```

### Key Files
- `client/src/App.tsx` - Route definitions
- `server/routes.ts` - API endpoints
- `server/storage.ts` - Database operations
- `shared/schema.ts` - Type definitions
- `client/src/index.css` - Glassmorphism styles
