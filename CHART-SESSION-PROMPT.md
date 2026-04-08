# Chart Overhaul Session Prompt

Copy everything below the line and paste it as the prompt for the next Claude Code session working on the chart.

---

## Context

You're working on **QuantEdge** (`/Users/abdulmalik/UnTitld/QuantEdgeee`), a trading research platform. The main chart lives at:

- **Chart component:** `client/src/components/gex-vex-chart.tsx` — Recharts-based ComposedChart with price candles, GEX/VEX level lines, and a multi-segment projection curve
- **Command page:** `client/src/pages/command.tsx` — The Command Center page that hosts the chart + sidebar intelligence panels
- **Prediction engine:** `server/unified-prediction-engine.ts` — Backend that computes GEX/VEX levels, horizon outlook (TODAY/WEEK/MONTH), expected moves, trade setups
- **GEX/VEX projector:** `server/gex-vex-projector.ts` — Computes gamma exposure levels, call/put walls, regime, flow data

The chart currently:
- Shows 30-day OHLC price data as an area chart (not true candlesticks)
- Has GEX/VEX levels as horizontal reference lines (call walls, put walls, gamma flip, magnet, targets)
- Has a multi-segment dashed projection curve: TODAY segment (bullish up to $682) → WEEK segment (bearish down to $659) → MONTH segment (bearish to $649)
- Has a brush/zoom bar at the bottom
- Has EM (expected move) and GEX range shown as dashed reference areas

## Reference: @Glitch_Trades' Skylit Indicator
The gold standard we're competing with. Key features:
- Gamma % concentration at each level (e.g. $587 = 31%, $584 = 22%) — already computed in our backend as `gammaConcentration`
- Precise level reactions — price bounces off levels to the dollar
- Smooth blue projection curve sweeping toward the target
- Real-time 15-min updates with immediate chart refresh
- "After 2-3 candles you should be in the play" — levels act as magnets

## What Already Works (don't rebuild these)
- **Auto-refresh**: 60s countdown timer with visual indicator (top-right)
- **Gamma % concentration**: computed server-side, displayed in Key Levels sidebar card
- **Multi-segment projection curve**: 3 segments (today→week→month) with ease-in-out transitions
- **Distance from spot**: "X away" labels on each key level
- **Flow data**: PCR and flow bias from options positioning
- **Horizon outlook**: TODAY/WEEK/MONTH with divergent directions

## What Needs to Happen

Make the chart **seriously interactive, adaptive, and readable at all layers**. This is the centerpiece of the platform — it needs to look and feel like @Glitch_Trades' Skylit or a Bloomberg terminal chart, not a basic Recharts demo.

### 1. Real-Time Auto-Refresh
- Add auto-refresh every 60 seconds (configurable) that re-fetches `/api/unified-prediction/{symbol}?timeframe={tf}` and updates the chart WITHOUT full page reload
- Show a subtle "refreshing..." indicator during fetch
- The projection curve, levels, and sidebar should all update together
- Add a manual refresh button
- Preserve user's zoom/scroll state across refreshes

### 2. True Candlestick Rendering
- Replace the area chart with proper OHLC candlesticks (green/red bodies with wicks)
- Each candle: open→close body, high→low wick
- Color: green when close > open, red when close < open
- The candles should be the primary visual, with a subtle volume histogram below them (if volume data is available)

### 3. Interactive Level Lines
- GEX/VEX levels (call wall, put wall, gamma flip, magnet, targets) should be **hoverable** — show a tooltip with: level name, price, distance from current price ($ and %), and what it means (e.g. "Dealers hedge here → resistance")
- Levels should have **different visual treatments**: call walls = solid green, put walls = solid red, gamma flip = dashed yellow, magnet = dotted cyan, targets = thick bright with arrows
- Add click-to-highlight: clicking a level line makes it glow and pins its tooltip
- Levels that are far from current price should be dimmer/thinner; levels near price should be bolder

### 4. Multi-Segment Projection Curve Enhancement
- The projection already has 3 segments (today/week/month). Make each segment a **different color**: today = bright cyan, week = amber/yellow, month = red/pink
- Add small **inflection point markers** (dots) where segments meet, with labels: "Today Target $682", "Week Target $659", "Month Target $649"
- Add a **confidence band** (shaded area) around the projection that widens over time (tighter for today, wider for month) based on the EM range from `horizonOutlook.emRange`
- The projection curve should smoothly animate when data updates (not jump)

### 5. Crosshair & Tooltip
- Full crosshair (vertical + horizontal lines) that follows the mouse
- Tooltip shows: date, OHLC, volume, and which GEX zone the price is in (above/below gamma flip, near call wall, etc.)
- On the projection portion, tooltip should show: "Projected: $X (TODAY/WEEK/MONTH horizon, confidence: Y%)"
- Snap crosshair to nearest data point

### 6. Zoom & Navigation
- Mouse wheel zoom (zoom into a date range)
- Click-and-drag to pan
- Double-click to reset zoom
- Timeframe buttons (5m, 15m, 1H, 4H, 1D, 1W) already exist — make sure the chart transitions smoothly between timeframes (fade animation)
- Keep the brush bar but make it more visually integrated

### 7. Responsive & Dark Theme
- The chart MUST work at all viewport sizes (sidebar visible or collapsed)
- All text, labels, and gridlines should use the existing design tokens from `client/src/lib/design-tokens.ts`
- Use `componentStyles.card.*` for any card containers
- Price/number text uses mono font
- Grid lines should be very subtle (opacity ~0.1)
- Background should be transparent (inherits from card)

### 8. Annotation Layer
- Allow the prediction engine's trade setups to appear on the chart as annotations: entry point arrow, target line, stop-loss line
- If a trade setup exists in the prediction data (`prediction.tradeSetups`), draw: green arrow at entry, green dashed line at target, red dashed line at stop, with R:R ratio label

### 9. Performance
- The chart may have 200+ data points + 10+ reference lines + projection + annotations. It needs to render at 60fps
- Debounce tooltip/crosshair updates
- Use `useMemo` aggressively for computed data
- Consider if Recharts is sufficient or if you need to switch to a canvas-based library (like lightweight-charts from TradingView) for better performance — but ONLY if Recharts can't handle it

### 10. Data Layer Readability
- Current price should ALWAYS be visible with a prominent badge/label on the right Y-axis
- The Y-axis should auto-scale to show all relevant levels + projection, with 5% padding
- X-axis should show clean date labels (not cramped)
- Legend at bottom showing what each color/style means
- The "POSITIVE GAMMA" / "NEGATIVE GAMMA" badge should be positioned at top-right of chart area, not overlapping data

## Files to Read First
1. `client/src/components/gex-vex-chart.tsx` — current chart implementation
2. `client/src/pages/command.tsx` — how the chart is used, what props are passed
3. `client/src/lib/design-tokens.ts` — color/style tokens
4. `server/unified-prediction-engine.ts` — the data shape (search for `UnifiedPrediction` interface)
5. `server/gex-vex-projector.ts` — the ProjectorResult interface and levels shape

## Constraints
- Keep using React + TypeScript
- The backend API shape should NOT change — only modify the frontend chart component
- If you need to add new data to the API response, do it backwards-compatibly
- The chart component should remain a single file (`gex-vex-chart.tsx`) unless it genuinely needs to be split
- Test with SPY, QQQ, and IWM — they have different price ranges and should all look good
- Run `npx vite build` to verify no TypeScript errors before finishing

## Current Tech Stack
- React 18 + TypeScript + Vite
- Recharts for charting
- Tailwind CSS + shadcn/ui components
- The server runs on port 3000 (Express), client is Vite dev server proxied through it
- Start dev: `npm run dev` from project root
