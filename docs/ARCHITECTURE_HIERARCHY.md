# QuantEdge Platform Architecture Hierarchy

## Navigation Structure (Current)

```
QuantEdge Header Navigation
├── Trade Desk (/trade-desk) - AI trade setups & ideas
├── AI Picks (/trade-desk/best-setups) - Best AI-selected setups
├── Markets (/market) - Market overview & movers
├── Charts (/chart-analysis) - Advanced charting
├── Smart Money (/smart-money) - Institutional flow
├── Watchlist (/watchlist) - User watchlists
└── Discover (dropdown)
    ├── Academy (/academy) - Learning resources
    ├── News & Social (/discover) - Social trends
    ├── Bullish Trends (/bullish-trends) - Trending stocks
    └── Market Scanner (/market-scanner) - Stock screener
```

---

## Complete Page Hierarchy (59 Pages - Consolidated from 63)

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
│   ├── blog.tsx             → /blog
│   └── blog-post.tsx        → /blog/:slug
│
├── Auth
│   ├── login.tsx            → /login
│   ├── signup.tsx           → /signup
│   ├── forgot-password.tsx  → /forgot-password
│   ├── reset-password.tsx   → /reset-password
│   ├── join-beta.tsx        → /join-beta
│   └── invite-welcome.tsx   → /invite
│
└── Legal
    ├── privacy-policy.tsx   → /privacy
    └── terms-of-service.tsx → /terms

PROTECTED (Beta Access Required)
├── Core Trading
│   ├── home.tsx             → /home (Dashboard)
│   ├── trade-desk.tsx       → /trade-desk (MAIN HUB)
│   ├── chart-analysis.tsx   → /chart-analysis
│   ├── stock-detail.tsx     → /stock/:symbol
│   ├── market.tsx           → /market
│   ├── market-scanner.tsx   → /market-scanner
│   ├── discover.tsx         → /discover
│   └── unified-watchlist.tsx → /watchlist
│
├── Analysis Tools
│   ├── options-analyzer.tsx → /options-analyzer
│   ├── smart-money.tsx      → /smart-money
│   ├── bullish-trends.tsx   → /bullish-trends
│   └── analysis.tsx         → /analysis/:symbol
│
├── Automation & Trading
│   ├── automations.tsx      → /automations
│   ├── paper-trading.tsx    → /paper-trading
│   ├── trading-engine.tsx   → /trading-engine
│   └── futures.tsx          → /futures (→ trade-desk?tab=futures)
│
├── Performance & History
│   ├── performance.tsx      → /performance
│   ├── history.tsx          → /history
│   └── backtest.tsx         → /backtest
│
├── Utility
│   ├── settings.tsx         → /settings
│   ├── trade-audit.tsx      → /trade-ideas/:id/audit
│   ├── ct-tracker.tsx       → /ct-tracker
│   └── wallet-tracker.tsx   → /wallet-tracker
│
└── Admin (Consolidated - 12 pages)
    ├── admin/overview.tsx      → /admin
    ├── admin/users.tsx         → /admin/users
    ├── admin/invites.tsx       → /admin/invites
    ├── admin/waitlist.tsx      → /admin/waitlist
    ├── admin/system.tsx        → /admin/system
    ├── admin/trade-ideas.tsx   → /admin/trade-ideas
    ├── admin/blog.tsx          → /admin/blog
    ├── admin/reports.tsx       → /admin/reports
    ├── admin/security.tsx      → /admin/security
    ├── admin/win-loss.tsx      → /admin/win-loss
    ├── admin/credits.tsx       → /admin/credits
    └── admin/beta-invites.tsx  → /admin/beta-invites
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

ANALYSIS ENGINES (6 Engines)
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
                    │  Landing │ Trade Desk │ Charts │ Markets   │
                    └─────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┴───────────────────────┐
                    │              DISCORD ALERTS                 │
                    │  Pre-move signals │ Convergence │ Movers   │
                    └─────────────────────────────────────────────┘
```

---

## CLEANUP COMPLETED (2026-01-29)

### Removed Dead Code
| Item | Status |
|------|--------|
| `/components/terminal/` | ✅ DELETED |
| `/components/remotion/` | ✅ DELETED |
| `catalyst-calendar.tsx` | ✅ DELETED |
| `data-audit-center.tsx` | ✅ DELETED |
| Root-level admin-*.tsx files | ✅ MOVED to admin/ |
| `admin.tsx` (old monolith) | ✅ DELETED |

### Admin Consolidation
All admin pages now live in `pages/admin/`:
- overview, users, invites, waitlist, system
- trade-ideas, blog, reports, security
- win-loss, credits, beta-invites

---

## REMAINING ISSUES

### 1. Hardcoded Mock Data (To Fix)

| File | Problem |
|------|---------|
| `landing.tsx` | Some mock testimonials |
| `live-activity-feed.tsx` | Mock win activities |
| `whale-flow-monitor.tsx` | Fallback mock flow data |
| `trading-signals-feed.tsx` | Random signal generator |

### 2. Duplicate Services (To Consolidate)

| Service 1 | Service 2 |
|-----------|-----------|
| `realtime-price-service.ts` | `realtime-pricing-service.ts` |
| `loss-analyzer.ts` | `loss-analyzer-service.ts` |

---

## SCALING PIPELINE

### Current State: Post-Cleanup
- 59 pages (down from 63)
- 6 analysis engines running
- Discord alerts working
- Admin pages consolidated

### Phase 1: Data Quality ✅ STARTED
- [x] Delete unused components
- [x] Consolidate admin pages
- [ ] Replace remaining mock data
- [ ] Remove fake testimonials

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

*Updated: 2026-01-29*
