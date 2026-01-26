# QuantEdge Page Audit - What Exists vs What's Missing

## 🔴 Critical Issues

### 1. Home vs Research Redundancy
**Problem**: Both serve as landing pages, confusing user journey

| Route | Page | Purpose | Status |
|-------|------|---------|--------|
| `/` | ➜ Redirects to `/research` | Root | ⚠️ Confusing |
| `/home` | home.tsx | Market indices, bot activity, top movers | ✅ Exists |
| `/research` | research-hub.tsx | Analysis agents (swing, technical, fundamental) | ✅ Exists |
| `/dashboard` | ➜ Redirects to `/research` | N/A | ⚠️ Redundant |

**Current Flow**:
```
User logs in → "/" → Redirects to "/research"
User clicks "Home" in nav → "/home" → Shows market data
```

**Recommendation**:
- **Option A**: Make `/home` the main landing (market overview) and `/research` the stock detail tool
- **Option B**: Merge both into a single unified dashboard with tabs
- **Option C**: Keep `/home` for market overview, make `/research` a dedicated research terminal (current stock-detail.tsx content)

---

## ✅ Pages That Exist (68 Total)

### Core Trading Pages
- ✅ `/home` - Market dashboard (indices, movers, bot activity)
- ✅ `/research` - Research hub with analysis agents
- ✅ `/stock/:symbol` - Stock detail with research terminal (NEW - just built)
- ✅ `/trade-desk` - Active trade ideas from bots
- ✅ `/chart-analysis` - Technical charting tool
- ✅ `/market` - Market overview
- ✅ `/market-scanner` - Stock screener
- ✅ `/market-movers` - Real-time movers tracking

### Options & Advanced
- ✅ `/options-analyzer` - Options chain analysis
- ✅ `/whale-flow` - Unusual options activity
- ✅ `/futures` - Futures trading
- ✅ `/ct-tracker` - Commitment of Traders data

### Analysis & Intelligence
- ✅ `/analysis` - Stock analysis tool
- ✅ `/backtest` - Strategy backtesting
- ✅ `/bullish-trends` - Momentum scanner
- ✅ `/historical-intelligence` - Historical performance
- ✅ `/smart-money` - Institutional flow tracking
- ✅ `/smart-advisor` - AI recommendations
- ✅ `/wsb-trending` - WallStreetBets trending
- ✅ `/social-trends` - Social media sentiment

### Portfolio & Performance
- ✅ `/dashboard` - ➜ Redirects to /research (UNUSED)
- ✅ `/watchlist` - Personal watchlist
- ✅ `/watchlist-kavout` - Kavout-powered watchlist
- ✅ `/watchlist-bot` - Automated watchlist management
- ✅ `/performance` - Trading performance analytics
- ✅ `/paper-trading` - Simulated trading
- ✅ `/wallet-tracker` - Crypto wallet tracking

### Bots & Automation
- ✅ `/command-center` - Bot control center
- ✅ `/command-center-v2` - Updated command center
- ✅ `/trading-engine` - Automated trading engine
- ✅ `/automations` - Trading automations
- ✅ `/watchlist-bot` - Watchlist automation
- ✅ `/ai-stock-picker` - AI-powered stock selection

### Education & Learning
- ✅ `/academy` - Trading academy
- ✅ `/learning-dashboard` - Personalized learning
- ✅ `/strategy-playbooks` - Strategy guides
- ✅ `/technical-guide` - Technical analysis guide
- ✅ `/trading-rules` - Trading rules & discipline

### Admin Pages
- ✅ `/admin` - Admin dashboard
- ✅ `/admin/users` - User management
- ✅ `/admin/beta-invites` - Beta invite management
- ✅ `/admin/credits` - Credit system
- ✅ `/admin/reports` - System reports
- ✅ `/admin/security` - Security settings
- ✅ `/admin/win-loss` - Win/loss tracking

### Auditing & Quality
- ✅ `/data-audit-center` - Data quality auditing
- ✅ `/trade-audit` - Trade audit trail
- ✅ `/chart-database` - Chart pattern database

### Marketing & Info
- ✅ `/landing` - Marketing landing page
- ✅ `/features` - Feature showcase
- ✅ `/pricing` - Pricing plans
- ✅ `/about` - About page
- ✅ `/blog` - Blog listing
- ✅ `/blog/:slug` - Blog post
- ✅ `/success-stories` - User testimonials

### Auth & Account
- ✅ `/login` - Login page
- ✅ `/signup` - Registration
- ✅ `/forgot-password` - Password reset request
- ✅ `/reset-password` - Password reset
- ✅ `/join-beta` - Beta signup
- ✅ `/invite-welcome` - Beta invite welcome
- ✅ `/settings` - User settings

### Legal
- ✅ `/privacy-policy` - Privacy policy
- ✅ `/terms-of-service` - Terms of service

### Other
- ✅ `/discover` - Discovery/explore page
- ✅ `/history` - Trade history
- ✅ `/swing-scanner` - Swing trade scanner
- ✅ `404` - Not found page

---

## ❌ Missing Pages (Critical Gaps)

### 1. User Profile & Account
**Status**: ❌ MISSING

**Routes Needed**:
- `/profile` - View own profile
- `/profile/:userId` - View other user profiles (if social features)
- `/profile/edit` - Edit profile

**Should Include**:
- User info (name, email, avatar)
- Trading stats (win rate, P&L, Sharpe ratio)
- Badges/achievements
- Recent activity
- Following/followers (if social)
- Public/private toggle

---

### 2. Notifications Center
**Status**: ❌ MISSING

**Route**: `/notifications`

**Should Include**:
- Trade alerts (entry/exit triggered)
- Bot activity notifications
- Price alerts
- News alerts
- System announcements
- Mark as read/unread
- Filter by type

---

### 3. Alerts & Watchlists Management
**Status**: ⚠️ PARTIAL (watchlist exists, but no alert management)

**Route**: `/alerts`

**Should Include**:
- Price alerts (above/below)
- Technical signal alerts (RSI, MACD crossovers)
- News alerts (symbol-specific)
- Volume alerts
- Create/edit/delete alerts
- Enable/disable toggles

---

### 4. Billing & Subscription
**Status**: ❌ MISSING

**Routes Needed**:
- `/billing` - Subscription management
- `/billing/upgrade` - Upgrade flow
- `/billing/invoices` - Invoice history

**Should Include**:
- Current plan details
- Usage stats (API calls, bot runs, etc.)
- Upgrade/downgrade buttons
- Payment method management
- Invoice downloads

---

### 5. API Keys & Integrations
**Status**: ❌ MISSING

**Route**: `/integrations` or `/settings/api`

**Should Include**:
- API key generation
- Webhook configuration
- TradingView integration
- Broker connections (Alpaca, TD Ameritrade)
- Discord bot setup
- Telegram bot setup

---

### 6. Social/Community Pages
**Status**: ❌ MISSING (if social features are planned)

**Routes Needed**:
- `/community` - Community feed
- `/leaderboard` - Top traders
- `/contests` - Trading competitions
- `/strategies/shared` - User-shared strategies

---

### 7. Help & Support
**Status**: ❌ MISSING

**Routes Needed**:
- `/help` - Help center
- `/help/:topic` - Help articles
- `/support` - Contact support
- `/faq` - Frequently asked questions
- `/changelog` - Product updates

---

### 8. Onboarding Flow
**Status**: ❌ MISSING

**Routes Needed**:
- `/onboarding/welcome` - Welcome screen
- `/onboarding/preferences` - Trading preferences
- `/onboarding/risk-profile` - Risk assessment
- `/onboarding/connect-broker` - Broker connection
- `/onboarding/complete` - Completion screen

---

### 9. Reports & Exports
**Status**: ⚠️ PARTIAL (admin reports exist, but no user exports)

**Route**: `/reports`

**Should Include**:
- Generate custom reports
- Export trades (CSV, Excel, PDF)
- Tax reports (Form 8949)
- Performance reports (monthly, quarterly, yearly)
- Share report links

---

### 10. Real-Time Monitoring Dashboard
**Status**: ❌ MISSING

**Route**: `/live` or `/monitor`

**Should Include**:
- Real-time P&L tracking
- Open positions
- Active alerts firing
- Bot status (running/stopped)
- Market heat map
- Live trade feed
- WebSocket updates

---

## 🔧 Page Organization Issues

### Duplicate/Similar Pages
1. **Command Center**: `/command-center` vs `/command-center-v2`
   - **Fix**: Deprecate v1, use v2 as main

2. **Watchlist**: `/watchlist` vs `/watchlist-kavout` vs `/watchlist-bot`
   - **Fix**: Merge into single `/watchlist` with tabs (Personal, Kavout, Bot-Generated)

3. **Dashboard**: Multiple entry points (/, /home, /dashboard, /research)
   - **Fix**: See recommendations above

### Orphaned Pages
- `/stock-detail-old-backup.tsx` - Should be deleted (backup)
- `/history.tsx` - Check if used vs `/trade-audit`

---

## 📊 Priority Matrix

| Priority | Page | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | User Profile | Medium | High |
| 🔴 P0 | Notifications Center | Medium | High |
| 🔴 P0 | Fix Home vs Research redundancy | Low | High |
| 🟠 P1 | Billing & Subscription | High | High |
| 🟠 P1 | Alerts Management | Medium | High |
| 🟡 P2 | Help & Support | Medium | Medium |
| 🟡 P2 | Real-Time Monitoring | High | High |
| 🟡 P2 | Onboarding Flow | Medium | Medium |
| 🟢 P3 | API Keys & Integrations | Medium | Low |
| 🟢 P3 | Reports & Exports | Medium | Low |
| 🟢 P3 | Social/Community | High | Low |

---

## 🎯 Recommended Action Plan

### Phase 1: Critical Fixes (Week 1)
1. **Resolve Home vs Research Confusion**
   ```
   Decision: Make /home the main dashboard (market overview)
            Make /research redirect to /stock/:symbol search
            Remove /dashboard redirect
   ```

2. **Build User Profile Page**
   - Basic profile view
   - Stats dashboard
   - Edit profile form

3. **Build Notifications Center**
   - Real-time notification feed
   - Mark as read
   - Filter by type

### Phase 2: Essential Features (Week 2-3)
4. **Alerts Management**
   - Create/edit alerts
   - Alert history
   - Enable/disable toggles

5. **Billing & Subscription**
   - Current plan display
   - Upgrade flow
   - Payment methods

6. **Help Center**
   - Help articles
   - Contact support
   - FAQ

### Phase 3: Enhancements (Week 4+)
7. **Real-Time Monitoring**
   - Live P&L
   - Position tracking
   - Market heat map

8. **Onboarding Flow**
   - Welcome wizard
   - Preferences setup
   - Broker connection

9. **Reports & Exports**
   - Custom reports
   - Tax documents
   - CSV exports

---

## 🗺️ Proposed Navigation Structure

```
Primary Navigation:
├── Home (/)               ← Market dashboard
├── Research (/research)   ← Stock search/analysis
├── Trade Desk (/trade-desk)
├── Chart (/chart-analysis)
└── Discover (/discover)

Secondary Navigation:
├── Portfolio
│   ├── Watchlist
│   ├── History
│   └── Performance
├── Bots
│   ├── Command Center
│   ├── Trade Ideas
│   └── Automations
├── Tools
│   ├── Options Analyzer
│   ├── Market Scanner
│   ├── Backtest
│   └── Alerts (NEW)

User Menu:
├── Profile (NEW)
├── Notifications (NEW)
├── Settings
├── Billing (NEW)
├── Help (NEW)
└── Logout
```

---

## 🚀 Next Steps

1. **User Decision Required**:
   - Confirm Home vs Research strategy (Option A, B, or C?)
   - Approve priority order (P0 → P1 → P2 → P3?)
   - Social features yes/no?

2. **Technical Implementation**:
   - Create missing page skeletons
   - Design user profile UI
   - Design notifications UI
   - Build alerts management

3. **Navigation Cleanup**:
   - Update App.tsx routes
   - Update navigation components
   - Remove duplicate redirects

---

## 📝 Summary

**Total Pages**: 68 exist, ~11 critical gaps
**Main Issue**: Home vs Research confusion (4 entry points fighting)
**Biggest Gaps**: User Profile, Notifications, Alerts Management, Billing
**Quick Wins**: Profile page, Notifications, Fix redirects
**Long-term**: Real-time monitoring, onboarding, social features

**Recommendation**: Start with Phase 1 (Home/Research fix + Profile + Notifications) - will take ~1 week and solve 80% of user confusion.
