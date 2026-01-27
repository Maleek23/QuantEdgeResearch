# QuantEdge Platform Architecture Hierarchy

## Navigation Structure

```
QuantEdge
├── Landing (/) - Marketing page
├── Trade Desk (/trade-desk) - Main trading hub
├── Markets (/market) - Market overview
├── Chart (/chart-analysis) - Advanced charting
├── Watchlist (/watchlist) - User watchlists
├── Research (/research-hub) - Research dashboard
└── Flow (/whale-flow) - Options flow tracker
```

---

## Complete Page Hierarchy (63 Pages)

```
CLIENT PAGES
============

PUBLIC (No Auth Required)
├── Marketing
│   ├── landing.tsx          → /
│   ├── features.tsx         → /features
│   ├── pricing.tsx          → /pricing
│   ├── about.tsx            → /about
│   ├── academy.tsx          → /academy
│   └── blog.tsx             → /blog
│
├── Auth
│   ├── login.tsx            → /login
│   ├── signup.tsx           → /signup
│   ├── forgot-password.tsx  → /forgot-password
│   ├── reset-password.tsx   → /reset-password
│   └── join-beta.tsx        → /join-beta
│
└── Legal
    ├── privacy-policy.tsx   → /privacy-policy
    └── terms-of-service.tsx → /terms-of-service

PROTECTED (Auth Required)
├── Core Trading
│   ├── trade-desk.tsx       → /trade-desk (MAIN HUB)
│   ├── research-hub.tsx     → /research-hub
│   ├── chart-analysis.tsx   → /chart-analysis
│   ├── stock-detail.tsx     → /stock/:symbol
│   ├── discover.tsx         → /discover
│   ├── market.tsx           → /market
│   └── market-movers.tsx    → /market-movers
│
├── Analysis Tools
│   ├── options-analyzer.tsx → /options-analyzer
│   ├── whale-flow.tsx       → /whale-flow
│   ├── smart-money.tsx      → /smart-money
│   └── screener.tsx         → /screener
│
├── Automation
│   ├── watchlist-bot.tsx    → /watchlist-bot
│   ├── automations.tsx      → /automations
│   ├── paper-trading.tsx    → /paper-trading
│   └── trading-engine.tsx   → /trading-engine
│
├── Performance
│   ├── performance.tsx      → /performance
│   ├── history.tsx          → /history
│   └── backtest.tsx         → /backtest
│
└── Admin (Admin Role)
    ├── admin/overview.tsx   → /admin
    ├── admin/users.tsx      → /admin/users
    ├── admin/trade-ideas.tsx→ /admin/trade-ideas
    └── ... (9 admin pages)
```

---

## Server Architecture

```
SERVER SERVICES (100+ files)
============================

CORE LAYER
├── routes.ts              → Main API router (22K+ lines)
├── storage.ts             → Database operations (Drizzle ORM)
├── db.ts                  → PostgreSQL connection
├── auth.ts                → JWT authentication
└── index.ts               → Server entry point

DATA SOURCES
├── tradier-api.ts         → Stocks/options quotes
├── coinbase-api.ts        → Crypto prices
├── yahoo-finance-api.ts   → Backup equity data
├── alpha-vantage-api.ts   → News/earnings
├── polygon-api.ts         → Historical data
└── news-service.ts        → News aggregation

ANALYSIS ENGINES
├── ML Engine
│   ├── pattern-predictor.ts
│   ├── multi-factor-analysis.ts
│   └── confidence-calibration.ts
│
├── AI Engine
│   ├── ai-service.ts
│   ├── multi-llm-service.ts
│   └── multi-llm-validation.ts
│
├── Quant Engine
│   ├── quantitative-engine.ts
│   ├── breakout-scanner.ts
│   └── bullish-trend-scanner.ts
│
├── Flow Engine
│   ├── flow-scanner.ts
│   ├── whale-tracker.ts
│   └── institutional-flow.ts
│
├── Sentiment Engine
│   ├── sentiment-analyzer.ts
│   └── social-scanner.ts
│
└── Technical Engine
    ├── technical-scanner.ts
    └── chart-pattern-detector.ts

TRADING SYSTEMS
├── trading-engine.ts
├── auto-idea-generator.ts
├── auto-lotto-trader.ts
├── convergence-engine.ts
├── pre-move-detection-service.ts
└── breakout-discovery-service.ts

ALERTING
├── discord-service.ts
├── email-service.ts
└── notification-service.ts
```

---

## Data Flow Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │              EXTERNAL DATA SOURCES          │
                    ├─────────────────────────────────────────────┤
                    │  Tradier  │  Yahoo  │  Polygon  │  News APIs│
                    └─────┬─────┴────┬────┴─────┬─────┴─────┬─────┘
                          │          │          │           │
                          ▼          ▼          ▼           ▼
                    ┌─────────────────────────────────────────────┐
                    │           SERVER - Analysis Layer           │
                    ├─────────────────────────────────────────────┤
                    │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
                    │  │ ML  │ │ AI  │ │Quant│ │Flow │ │Sent │   │
                    │  │Eng. │ │Eng. │ │Eng. │ │Eng. │ │Eng. │   │
                    │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘   │
                    │     └──────┬┴──────┬┴──────┬┴──────┬┘      │
                    │            ▼       ▼       ▼       ▼       │
                    │     ┌─────────────────────────────────┐    │
                    │     │     CONVERGENCE ENGINE          │    │
                    │     │  (Multi-signal correlation)     │    │
                    │     └───────────────┬─────────────────┘    │
                    └─────────────────────┼───────────────────────┘
                                          ▼
                    ┌─────────────────────────────────────────────┐
                    │              PostgreSQL Database            │
                    │  trade_ideas │ watchlists │ users │ alerts │
                    └─────────────────────┬───────────────────────┘
                                          │
                    ┌─────────────────────┴───────────────────────┐
                    │              API ROUTES (/api/*)            │
                    └─────────────────────┬───────────────────────┘
                                          │
                    ┌─────────────────────┴───────────────────────┐
                    │           CLIENT - React Frontend           │
                    ├─────────────────────────────────────────────┤
                    │  Landing │ Trade Desk │ Charts │ Research  │
                    └─────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┴───────────────────────┐
                    │              DISCORD ALERTS                 │
                    │  Pre-move signals │ Convergence │ Movers   │
                    └─────────────────────────────────────────────┘
```

---

## CRITICAL ISSUES FOUND

### 1. Unused/Dead Code

| Item | Location | Status |
|------|----------|--------|
| `/components/terminal/` | Client | NOT IMPORTED ANYWHERE |
| `/components/remotion/` | Client | INTERNAL ONLY |
| `catalyst-calendar.tsx` | Client | ORPHANED |
| `/api/polymarket/*` | Server | NO FRONTEND CALLS |

### 2. Hardcoded Mock Data

| File | Line | Problem |
|------|------|---------|
| `landing.tsx` | 257-304 | Fake NVDA trade with hardcoded prices |
| `landing.tsx` | 321-326 | Fake "Trusted by" badges |
| `landing.tsx` | 338 | Fake "2.5K+ Active Beta Users" |
| `landing.tsx` | 599-633 | Fake testimonials |
| `live-activity-feed.tsx` | 14-23 | Mock win activities |
| `whale-flow-monitor.tsx` | 357-438 | Fallback mock flow data |
| `trading-signals-feed.tsx` | 51-70 | Random signal generator |

### 3. Duplicate Services

| Service 1 | Service 2 |
|-----------|-----------|
| `realtime-price-service.ts` | `realtime-pricing-service.ts` |
| `loss-analyzer.ts` | `loss-analyzer-service.ts` |

---

## SCALING PIPELINE

### Current State: MVP
- 6 analysis engines running
- Basic trade idea generation
- Discord alerts working
- ~60 pages, 100+ services

### Phase 1: Data Quality (NOW)
- [ ] Replace ALL hardcoded mock data
- [ ] Connect landing page to real API data
- [ ] Remove fake testimonials/stats
- [ ] Delete unused components

### Phase 2: Real-Time Data
- [ ] WebSocket price streaming
- [ ] Live options flow (not cached)
- [ ] Real-time news sentiment
- [ ] Institutional flow tracking

### Phase 3: AI Enhancement
- [ ] Better LLM prompting for ideas
- [ ] Multi-factor ranking system
- [ ] Backtesting validation
- [ ] Win rate tracking

### Phase 4: Scale
- [ ] Redis caching layer
- [ ] Background job queue
- [ ] Rate limit management
- [ ] Multi-region deployment

---

*Generated: 2026-01-27*
