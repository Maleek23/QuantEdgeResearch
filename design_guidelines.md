# QuantEdge Research Design Guidelines

## Design Approach
**Reference-Based**: Linear's precision engineering + Stripe's sophisticated restraint + Bloomberg Terminal's data density. Dark-first institutional aesthetic with strategic glassmorphism for depth and modern fintech credibility.

## Typography
- **Primary**: Inter (Google Fonts) - exceptional readability for extended screen time
- **Data/Monospace**: JetBrains Mono for all numerical content, charts, metrics, tables
- **Hierarchy**:
  - Hero/H1: text-5xl font-bold tracking-tight
  - H2: text-3xl font-semibold
  - H3: text-xl font-medium
  - Body: text-base leading-relaxed
  - Data/Metrics: text-sm md:text-base font-mono tabular-nums
  - Small labels: text-xs font-medium uppercase tracking-wide

## Color System

**Background Palette**:
- Primary: slate-950 (deep charcoal base)
- Secondary: slate-900 (card backgrounds)
- Tertiary: slate-800 (elevated surfaces)

**Data Visualization Colors**:
- Bullish/Positive: green-400 (primary), green-500 (intense)
- Bearish/Negative: red-400 (primary), red-500 (intense)
- Neutral/Info: cyan-400 (primary accent)
- Secondary Accent: purple-400 (alerts, highlights)

**Interactive States**:
- Primary CTA: cyan-500 background with cyan-400 glow on hover
- Borders: slate-700 (default), slate-600 (hover), cyan-500 (focus/active)
- Text: slate-100 (primary), slate-400 (secondary), slate-500 (disabled)

**Glassmorphism Layers**:
- **glass-card**: bg-slate-900/40 backdrop-blur-xl border-slate-700/50 shadow-2xl shadow-cyan-500/10
- **glass-elevated**: bg-slate-800/30 backdrop-blur-lg border-slate-600/30
- **glass-subtle**: bg-slate-900/20 backdrop-blur-md border-slate-700/30

## Layout System

**Sidebar Architecture**:
- Collapsed: w-16, icon-only navigation
- Expanded: w-64, icon + label
- Transition: duration-300 ease-in-out on all states
- Main content margin: ml-16 (collapsed), ml-64 (expanded) with matching transition

**Grid Primitives**:
- Dashboard: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Chart Analysis: grid-cols-1 lg:grid-cols-3 (2-col main + 1-col sidebar)
- Data Tables: Full-width with horizontal scroll on mobile

**Spacing Scale**: 2, 4, 6, 8, 12, 16
- Component padding: p-6
- Section spacing: py-12 lg:py-16
- Card gaps: gap-4 md:gap-6
- Tight data: gap-2

## Component Library

**Navigation**:
- Top bar: Fixed h-16, glass-card, logo left, search center, profile/notifications right
- Sidebar: Full-height fixed, glass-elevated, section dividers with slate-700/50
- Active states: bg-cyan-500/10 with border-l-2 border-cyan-500, subtle cyan glow

**Data Cards**:
- Base: glass-card rounded-xl p-6
- Header: flex justify-between items-center mb-4
- Metrics: Large mono numbers (text-3xl font-bold font-mono) with small uppercase labels
- Color-coded by sentiment: green-400 (up), red-400 (down), cyan-400 (neutral)
- Sparklines: Inline mini-charts with matching sentiment colors

**Chart Containers**:
- glass-card p-6, min-h-[400px]
- Responsive heights: h-64 md:h-96 lg:h-[500px]
- Dark gridlines (slate-700/30), cyan accent lines for significant levels
- Tooltips: glass-subtle with backdrop-blur-md

**Tables**:
- glass-elevated base, striped rows (odd:bg-slate-800/20)
- Sticky header: bg-slate-800/80 backdrop-blur-lg top-0
- Mono font for all numbers, right-aligned columns
- Color-coded cells based on value sentiment
- Row hover: bg-slate-700/20

**Buttons**:
- Primary: bg-cyan-500 hover:bg-cyan-400 with cyan glow (shadow-lg shadow-cyan-500/30)
- Secondary: glass-elevated border-cyan-500/50 hover:border-cyan-400
- Destructive: bg-red-500/90 hover:bg-red-500
- Success: bg-green-500/90 hover:bg-green-500
- Hero overlay: backdrop-blur-md bg-slate-900/50 (no hover effects on these)

**Forms**:
- Inputs: glass-subtle border-slate-600 focus:border-cyan-500 focus:ring-2 ring-cyan-500/20
- Mono font for numeric/code inputs
- Labels: text-sm font-medium text-slate-300 mb-2

**Status Indicators**:
- Live: w-2 h-2 rounded-full bg-green-400 animate-pulse
- Processing: bg-yellow-400
- Inactive: bg-slate-500
- Pair with text labels in matching colors

## Images

**Hero Section**: Yes - Large, immersive
- Dimensions: h-[600px] desktop, h-[400px] mobile
- Treatment: Dark gradient overlay (from-slate-900/85 to-slate-950)
- Suggested image: Abstract financial data visualization with glowing cyan/purple data points, volumetric lighting, depth of field, dark futuristic aesthetic
- Content: Centered headline + subheadline + CTA buttons with backdrop-blur backgrounds

**Supporting Images**:
- Feature cards: Trading terminal screenshots with glass-card frames and subtle cyan border glow
- Dashboard previews: Abstract chart visualizations (w-full h-48 rounded-lg)
- Trust/credibility: Data provider logos on glass-subtle backgrounds
- About section: Team photos with professional glass-card treatments

## Animations
**Minimal, Performance-First**:
- Sidebar: transform and margin transitions only
- Card hover: translateY(-2px) + shadow intensify
- Number changes: Counter animation for live metrics
- Chart interactions: Crosshair + tooltip fade-in
- Avoid: Heavy JS animations, excessive motion, color transitions

All transitions use GPU-accelerated properties (transform, opacity) with duration-200 to duration-300.