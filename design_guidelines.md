# QuantEdge Research Design Guidelines

## Design Approach
**Reference-Based**: Drawing from Linear's precision + Stripe's sophistication + Bloomberg Terminal's data density, adapted for dark theme trading aesthetics. Glassmorphism elevates the technical platform with modern, layered visual hierarchy.

## Typography
- **Primary**: Inter (Google Fonts) - clean, technical readability
- **Data/Numbers**: JetBrains Mono for charts, metrics, tables
- **Hierarchy**: 
  - Hero/H1: text-5xl font-bold
  - H2: text-3xl font-semibold  
  - H3: text-xl font-medium
  - Body: text-base
  - Data: text-sm font-mono

## Layout System

### Sidebar Solution
**Fixed-Width Sidebar States**:
- Collapsed: w-16 (64px)
- Expanded: w-64 (256px)
- Transition: duration-300 ease-in-out

**Main Content Grid**:
```
ml-16 (when sidebar collapsed)
ml-64 (when sidebar expanded)
transition-[margin] duration-300 ease-in-out
```

**Critical**: Main content uses `calc()` for responsive width:
- Collapsed state: `calc(100vw - 64px)`
- Expanded state: `calc(100vw - 256px)`

**Spacing Primitives**: 2, 4, 6, 8, 12, 16 units
- Tight spacing: p-2, gap-4
- Section padding: p-6, p-8
- Major sections: p-12, p-16

### Chart Analysis Page Grid
**Desktop Layout**:
- 2-column: `grid grid-cols-1 lg:grid-cols-3 gap-6`
- Main chart: `col-span-2`
- Side panel: `col-span-1`
- All containers: `min-w-0` (prevents overflow)

**Mobile**: Single column stack with full-width charts

## Component Library

### Glassmorphism Classes
**glass-card**: 
- bg-slate-900/40
- backdrop-blur-xl
- border border-slate-700/50
- rounded-xl
- shadow-2xl shadow-cyan-500/10

**glass**: Lighter variant
- bg-slate-800/30
- backdrop-blur-lg
- border border-slate-600/30

### Core Components

**Navigation Bar** (Top):
- Fixed, glass effect, h-16
- Logo left, search center, user profile right
- Subtle cyan glow on active states

**Sidebar**:
- Fixed left, full-height
- Icon-only when collapsed, icon+label when expanded
- Active state: bg-cyan-500/10, border-l-2 border-cyan-500
- Sections: Dashboard, Markets, Analysis, Portfolio, Settings

**Data Cards**:
- glass-card base
- Header: flex justify-between, icon + title + action
- Metric displays: Large mono numbers with small labels
- Bullish metrics: text-green-400
- Bearish metrics: text-red-400
- Neutral: text-cyan-400

**Chart Containers**:
- glass-card with p-6
- Min-height: min-h-[400px]
- Responsive: h-64 md:h-96 lg:h-[500px]
- Dark gridlines, cyan accent lines for key levels

**Tables**:
- glass base, striped rows (odd:bg-slate-800/20)
- Header: bg-slate-800/50, sticky top-0
- Mono font for numbers, right-aligned
- Color-coded values (green/red/cyan)

**Buttons**:
- Primary: bg-cyan-500 hover:bg-cyan-400 (cyan glow)
- Secondary: glass border-cyan-500/50
- Danger: bg-red-500/90 hover:bg-red-500
- Success: bg-green-500/90 hover:bg-green-500
- On hero images: backdrop-blur-md bg-slate-900/50

**Input Fields**:
- glass base, border-slate-600
- focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20
- Mono font for numeric inputs

**Status Indicators**:
- Dots: w-2 h-2 rounded-full
- Live: bg-green-400 animate-pulse
- Delayed: bg-yellow-400
- Offline: bg-slate-500

## Images

### Hero Section
**Large Hero Image**: Yes
- Full-width, h-[600px] on desktop, h-[400px] mobile
- Dark overlay: bg-gradient-to-b from-slate-900/80 to-slate-900/95
- Image suggestion: Abstract trading charts visualization with glowing cyan data points, dark futuristic aesthetic, depth of field
- Centered content over image with CTA buttons using backdrop-blur backgrounds

### Supporting Images
- **Dashboard tiles**: Small abstract chart previews (w-full h-48)
- **Feature showcases**: Trading terminal screenshots with subtle cyan glow borders
- **About/Team**: Professional portraits with glass-card frames

### Placement
- Hero: Immediate impact, platform visualization
- Features section: 2-3 column grid of screenshot cards
- Trust section: Logos of data providers (glass backgrounds)

## Animations
**Minimal, purposeful only**:
- Sidebar expand/collapse: transform + margin transitions
- Card hover: subtle translateY(-2px) + glow intensify
- Data updates: number counter animations
- Chart tooltips: fade-in on hover

**Performance**: Prefer CSS transitions over JS animations, GPU-accelerated properties only (transform, opacity)