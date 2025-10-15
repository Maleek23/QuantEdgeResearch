# Design Guidelines: Quantitative Trading Research Platform

## Design Approach
**Selected Approach:** Design System + Industry Reference Hybrid
- **Primary System:** Material Design with Carbon Design influences for data-intensive components
- **Industry References:** Bloomberg Terminal (information density), TradingView (charting), Robinhood (modern fintech clarity)
- **Rationale:** Professional trading tools demand stability, information clarity, and rapid data processing. The design prioritizes function over form while maintaining modern fintech aesthetics.

## Core Design Principles
1. **Data First:** Information hierarchy optimized for quick scanning and decision-making
2. **Status Clarity:** Visual indicators for market state, risk levels, and performance metrics
3. **Density Control:** Efficient space usage without overwhelming the user
4. **Action Accessibility:** Critical trading actions always within 1-2 clicks

## Color Palette

**Dark Mode (Primary):**
- Background Primary: 220 15% 12% (Deep charcoal - main surface)
- Background Secondary: 220 15% 16% (Slightly lighter cards/panels)
- Background Elevated: 220 15% 20% (Modals, dropdowns)
- Text Primary: 220 10% 95%
- Text Secondary: 220 8% 70%
- Text Muted: 220 8% 50%

**Market Status Colors:**
- Bullish/Positive: 142 76% 45% (Green for gains, buy signals)
- Bearish/Negative: 0 72% 55% (Red for losses, sell signals)
- Neutral/Warning: 45 93% 58% (Amber for alerts, caution)
- Info/Highlight: 217 91% 60% (Blue for information, links)

**Accent Colors:**
- Primary Action: 217 91% 60% (Vibrant blue for CTAs)
- Secondary Action: 220 15% 30% (Muted gray for secondary buttons)
- Critical Action: 0 72% 55% (Red for stop losses, exits)

**Light Mode (Secondary):**
- Background: 0 0% 98%
- Surface: 0 0% 100%
- Text: 220 15% 12%
- Adjust market colors for light mode contrast (slight desaturation)

## Typography
**Font Stack:**
- Primary: 'Inter' (via Google Fonts) - UI elements, data labels
- Monospace: 'JetBrains Mono' - Prices, tickers, timestamps, code
- Accent: 'Inter' bold/semibold for headings

**Scale:**
- Display (Dashboard Titles): text-3xl font-bold (30px)
- Heading (Section Headers): text-xl font-semibold (20px)
- Subheading (Card Titles): text-lg font-medium (18px)
- Body (Primary Text): text-base (16px)
- Data Labels: text-sm font-medium (14px)
- Ticker/Price Display: text-sm font-mono (14px monospace)
- Captions/Metadata: text-xs (12px)

## Layout System
**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, 12, 16
- Micro spacing (within components): p-2, gap-2
- Component padding: p-4, p-6
- Section spacing: p-8, py-12
- Page margins: px-6, lg:px-8

**Grid Structure:**
- Dashboard: 12-column grid with flexible widget sizing
- Watchlist/Tables: Fixed column widths with horizontal scroll
- Charts: Full-width responsive containers
- Sidebars: 280px fixed width (collapsible to icons)

## Component Library

**Navigation:**
- Fixed top bar (h-16) with market status indicators
- Left sidebar with collapsible sections (Watchlists, Positions, Alerts, Research)
- Breadcrumb trail for deep navigation contexts

**Data Display:**
- **Price Cards:** Ticker symbol, current price (large monospace), % change with color coding, sparkline chart
- **Watchlist Tables:** Sticky headers, alternating row backgrounds, inline actions, real-time updates
- **Position Cards:** Entry price, current P&L, risk metrics (R:R), action buttons
- **Alert Panels:** Icon + message + timestamp, dismissible, color-coded by severity

**Charts & Visualization:**
- TradingView-style charts with dark theme integration
- Candlestick default, line/area alternatives
- Volume bars below price action
- Overlay indicators with legend

**Forms & Inputs:**
- **Search/Screener:** Prominent search bar with autocomplete, filter chips
- **Trade Entry Forms:** Labeled inputs with validation, risk calculator, position size preview
- **Quick Actions:** Keyboard shortcuts displayed, hover tooltips

**Risk & Status Indicators:**
- Progress bars for portfolio allocation
- Gauge charts for risk levels
- Badge pills for market state (Pre-market, RTH, After-hours)
- Pill badges for sentiment (Bullish/Bearish/Neutral)

**Modals & Overlays:**
- Trade confirmation dialogs with clear action buttons
- Settings panel (slide-in from right)
- Alert detail drawers

## Information Architecture

**Dashboard Layout:**
1. **Top Bar:** Market indices, account balance, notifications
2. **Main Panel (70%):** Active chart, selected analysis, trade ideas feed
3. **Right Sidebar (30%):** Watchlist, open positions, pending alerts
4. **Bottom Ticker:** Real-time price updates for followed symbols

**Research Pages:**
- Screener: Filter panel left, results table center, detail preview right
- Analysis: Full-width report with sections (Catalyst, Technical, Risk/Reward)
- Historical: Timeline view with expandable entries

## Accessibility & Interaction
- High contrast ratios (WCAG AAA for critical data)
- Keyboard navigation with visual focus indicators
- Real-time data updates without jarring transitions
- Loading skeletons for async data
- Error states with recovery actions
- Timezone display (CT) in all timestamps

## Images
**No hero images** - This is a utility-focused trading platform. Visual content limited to:
- Chart visualizations (generated by charting library)
- Icon sets for asset types (stocks, options, crypto)
- Status indicators and risk gauges
- Optional: Subtle brand mark in empty states

## Animation Strategy
**Minimal & Purposeful:**
- Price flash animations (green up, red down) - 200ms
- Smooth transitions for panel slides - 300ms ease-out
- Loading spinners for async operations
- No decorative animations - every motion serves data clarity

This design creates a professional, information-dense trading interface that prioritizes speed, clarity, and confident decision-making while maintaining modern fintech aesthetics.