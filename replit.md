# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform for day-trading US equities, options, and crypto markets. Its core purpose is to provide educational, research-grade trade ideas, robust risk management, and real-time market analysis. The platform emphasizes strong risk controls, educational disclaimers, and a dark-themed UI optimized for rapid data scanning. It integrates real historical data, features adaptive learning, and manages membership via Discord roles, with the web platform serving as a public dashboard. The ambition is to provide a comprehensive, data-driven solution for quantitative trading research. The core branding is "2 Engines. 1 Edge." representing AI Analysis + Quantitative Signals working together.

## User Preferences
- All timestamps should be displayed in America/Chicago timezone with market session context.
- The UI features both dark and light theme modes with a toggle button for user preference.
- Educational disclaimers must be emphasized (not financial advice).
- Clear and precise risk/reward calculations and position sizing tools are required.
- The platform should highlight fresh, actionable trade ideas immediately upon opening.
- The platform should function fully even without external AI dependencies, offering a quantitative idea generator alternative.
- Provide helpful error messages for API billing, rate limits, and authentication issues.
- Liquidity warnings should be displayed for penny stocks and low-float securities.
- No personalized financial advice should be offered; it is for research purposes only.

## System Architecture

### Technical Stack
**Frontend:** React 18, TypeScript, Tailwind CSS 4 (with custom glassmorphism), Shadcn UI, TanStack Query v5, Wouter, date-fns-tz, Lucide React, React Icons, Framer Motion, React Three Fiber/Three.js.
**Backend:** Express.js, TypeScript, PostgreSQL (Neon), Drizzle ORM, Zod validation, Winston logging.

### Feature Specifications
- **Navigation:** Simplified structure with Main (Home, Trade Desk, Live Trading, Trading Rules), More (Performance, Market, Chart Analysis), and System sections (Pricing, Settings, Admin). The Home page provides a daily "game plan" with key insights.
- **Hidden Features:** Includes a Paper Trading Simulator, Wallet Tracker (crypto whale monitoring), and CT Tracker (crypto influencer intelligence), each with dedicated API endpoints for managing their respective data.
- **Dual Engine Architecture:** Combines "AI Analysis" (Claude, GPT, Gemini for fundamental analysis) and "Quantitative Signals" (RSI(2), VWAP, volume spike, ADX, time-of-day filtering, chart pattern validation) for a hybrid approach to trade idea generation.
- **Quantitative Engine (v3.7.0):** Employs RSI(2) Mean Reversion with 200-Day MA Filter, VWAP Institutional Flow, Volume Spike Early Entry, ADX Regime Filtering, Signal Confidence Voting, and time-of-day filtering. Risk parameters include 3.5% stock stop-loss, 5% crypto stop-loss, 2:1 R:R, and 55-65% target win rate.
- **Authentication:** Replit Auth (OpenID Connect) with PostgreSQL session persistence (7-day TTL).
- **Subscription Tiers:** Differentiated Free and Advanced tiers with varying access to ideas, market data, performance history, AI generations, and alerts.
- **Performance Target:** <60s end-to-end latency for trading decisions.

## External Dependencies

### Data Sources
- **CoinGecko API:** Crypto data (real-time, historical, market cap, discovery).
- **Yahoo Finance:** Stock data (real-time quotes, discovery, historical).
- **Alpha Vantage API:** Breaking news, fallback for stock historical data, earnings calendar.
- **Tradier API:** Options data (chains, delta targeting, live pricing).
- **Databento API:** Futures data (NQ, GC - real-time, contract specs, CME).
- **Alchemy API:** (Optional) Ethereum/Solana whale wallet monitoring.

### AI Providers
- **OpenAI API:** For GPT integration.
- **Anthropic API:** For Claude Sonnet integration.
- **Google Gemini API:** For Gemini integration.

---

## Design Guidelines

### Design Philosophy
**Bloomberg-Style Glassmorphism** - A professional trading terminal aesthetic combining frosted glass effects with information-dense layouts. The design prioritizes rapid data scanning, status clarity, and confident trading decisions.

**Core Branding:** "2 Engines. 1 Edge." - AI Analysis + Quantitative Signals working together.

### Core Design Principles
1. **Data First** - Information hierarchy optimized for quick scanning and decision-making
2. **Status Clarity** - Visual indicators for market state, risk levels, and performance metrics
3. **Density Control** - Efficient space usage without overwhelming the user
4. **Action Accessibility** - Critical trading actions always within 1-2 clicks

---

## Color Palette

### Dark Mode (Primary)
**Background:** `#0A0A0A` (0 0% 4%) - Deep black optimized for glassmorphism contrast

**Semantic Colors:**
| Purpose | Tailwind Class | Hex |
|---------|---------------|-----|
| Primary/Cyan | `text-cyan-400` | #22d3ee |
| Bullish/Positive | `text-green-400` | #4ade80 |
| Bearish/Negative | `text-red-400` | #f87171 |
| Warning/Neutral | `text-amber-400` | #fbbf24 |
| Muted Text | `text-muted-foreground` | ~#9ca3af |

**Glassmorphism Colors:**
```css
--glass-cyan: 188 100% 50%;
--glass-cyan-rgb: 0, 212, 255;
--glass-border: rgba(255, 255, 255, 0.15);
--glass-border-hover: rgba(255, 255, 255, 0.25);
```

**Chart Colors:**
```css
--chart-1: 217 91% 60%;  /* Blue */
--chart-2: 142 76% 45%;  /* Green */
--chart-3: 45 93% 58%;   /* Amber */
--chart-4: 0 72% 55%;    /* Red */
--chart-5: 280 70% 60%;  /* Purple */
```

### Light Mode (Secondary)
- Background: 220 14% 96%
- Cards: Pure white (0 0% 100%)
- Text: Dark blue-gray (220 15% 15%)

---

## Glassmorphism System

### Container Classes
| Class | Description |
|-------|-------------|
| `.glass-card` | Primary container - `rgba(255,255,255,0.05)`, blur 20px |
| `.glass` | Cyan-tinted interactive - `rgba(0,212,255,0.25)`, glow shadow |
| `.glass-secondary` | Neutral elements - `rgba(42,42,43,0.40)` |
| `.glass-success` | Bullish/positive - Green tint, green glow |
| `.glass-danger` | Bearish/negative - Red tint, red glow |

### Usage Examples
```jsx
<div className="glass-card rounded-xl p-5">Content</div>
<div className="glass-card rounded-xl border-l-2 border-l-cyan-500 p-5">Primary accent</div>
<div className="glass-success rounded-lg px-3 py-1.5">Bullish</div>
<div className="glass-danger rounded-lg px-3 py-1.5">Bearish</div>
```

---

## Typography

### Font Stack
- Sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- Mono: 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace

### Type Scale
| Element | Class |
|---------|-------|
| Page Title | `text-2xl sm:text-3xl font-bold` |
| Section Header | `text-xl font-semibold` |
| Card Title | `text-lg font-semibold` |
| Body Text | `text-base` |
| Data Labels | `text-sm font-medium` |
| Prices/Tickers | `font-mono text-sm` |
| Captions | `text-xs text-muted-foreground` |

### Text Color Usage
- **Primary highlights:** `text-cyan-400`
- **Bullish/gains:** `text-green-400`
- **Bearish/losses:** `text-red-400`
- **Warnings:** `text-amber-400`
- **Secondary:** `text-muted-foreground`

---

## Button System

### Variants
| Variant | Usage |
|---------|-------|
| `variant="glass"` | Primary actions (cyan glow) |
| `variant="glass-secondary"` | Secondary actions (neutral) |
| `variant="glass-success"` | Bullish/buy actions |
| `variant="glass-danger"` | Bearish/sell/delete |
| `variant="default"` | Standard blue |
| `variant="destructive"` | Danger/delete |
| `variant="outline"` | Bordered |
| `variant="ghost"` | Minimal |

### Sizes
| Size | Height |
|------|--------|
| `default` | 36px (min-h-9) |
| `sm` | 32px (min-h-8) |
| `lg` | 40px (min-h-10) |
| `icon` | 36x36px |

---

## Component Patterns

### Hero Header (Standard Page Header)
```jsx
<div className="relative overflow-hidden rounded-xl glass-card p-6 sm:p-8">
  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-cyan-400/10" />
  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase mb-1">
        {format(new Date(), 'EEEE, MMMM d')}
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold mb-3">Title</h1>
      <div className="flex flex-wrap items-center gap-3">
        <div className="glass-success rounded-lg px-3 py-1.5">Status</div>
      </div>
    </div>
    <div className="flex gap-2">
      <Button variant="glass">Action</Button>
    </div>
  </div>
</div>
```

### Icon Container
```jsx
<div className="h-10 w-10 rounded-lg glass flex items-center justify-center">
  <Icon className="h-5 w-5 text-cyan-400" />
</div>
```

### Stat Card
```jsx
<div className="glass-card rounded-xl p-5">
  <div className="flex items-center gap-3 mb-2">
    <div className="h-10 w-10 rounded-lg glass flex items-center justify-center">
      <Icon className="h-5 w-5 text-cyan-400" />
    </div>
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">Label</p>
      <p className="text-2xl font-bold text-cyan-400">$1,234</p>
    </div>
  </div>
</div>
```

### Badge/Pill (use styled spans)
```jsx
<span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">Label</span>
<span className="glass rounded-lg px-3 py-1.5 text-sm font-medium">Active</span>
<span className="glass-success rounded-lg px-3 py-1.5 text-sm font-medium">+5.2%</span>
<span className="glass-danger rounded-lg px-3 py-1.5 text-sm font-medium">-3.1%</span>
```

---

## Layout System

### Spacing (Tailwind 4px units)
- **Micro:** `p-2`, `gap-2`
- **Component padding:** `p-4`, `p-5`, `p-6`
- **Section spacing:** `space-y-6`, `gap-6`
- **Page margins:** `p-6`, `px-6 lg:px-8`

### Grid Structures
```jsx
{/* Page container */}
<div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">

{/* Two-column */}
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

{/* Three-column stats */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">

{/* Dashboard layout */}
<div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
  <div className="lg:col-span-3">Main</div>
  <div className="lg:col-span-2">Sidebar</div>
</div>
```

---

## Animation & Interaction

### Elevation System
```css
.hover-elevate    /* Subtle brightness on hover */
.active-elevate-2 /* Stronger brightness on click */
.toggle-elevate   /* For toggleable elements */
.toggle-elevated  /* Active toggle state */
```

### Utility Animations
```css
.price-update  /* Subtle pulse for real-time price changes */
.badge-glow    /* Pulsing glow for verification badges */
.shimmer       /* Loading skeleton effect */
```

### Transitions
- All glass elements have 200ms transitions
- Buttons have `active:scale-[0.98]` for tactile feedback
- Glass hover states include `translate-y-[-1px]` lift effect

---

## Data Visualization

### Price Display
```jsx
<span className="font-mono text-lg text-green-400">$152.34</span>
<span className="font-mono text-sm text-red-400">-2.3%</span>
```

### Direction Indicators
```jsx
{direction === 'long' 
  ? <TrendingUp className="h-4 w-4 text-green-400" />
  : <TrendingDown className="h-4 w-4 text-red-400" />
}
```

---

## Accessibility
- High contrast ratios (WCAG AA minimum)
- Keyboard navigation with visible focus indicators
- Loading skeletons for async data
- Error states with clear recovery actions
- All timestamps in CT timezone

---

## Images
**No hero images** - Utility-focused trading platform. Visual content limited to:
- Chart visualizations
- Asset type icons
- Status indicators and risk gauges
