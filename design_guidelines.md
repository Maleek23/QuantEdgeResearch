# Quant Edge Labs Design Guidelines v2.0

## Brand Identity
**Tagline**: "Multiple Engines, One Edge"  
**Mission**: Institutional-grade quantitative research platform combining AI analysis with quantitative validation for transparent, auditable trading research.

## Design Philosophy: Terminal-Institutional

**Core Aesthetic**: Bloomberg Terminal meets institutional trading floors. Think: multi-monitor trading desks, data-dense displays, surgical precision, zero distractions.

**Guiding Principles**:
1. **Information Dominance**: Maximum data visibility, hierarchical clarity
2. **Monospace Authority**: All numerical data in JetBrains Mono—no exceptions
3. **Layered Depth**: Strategic glassmorphism creates UI hierarchy without clutter
4. **Grid Discipline**: 8px base grid, mathematical precision in spacing
5. **Real-Time Awareness**: Live indicators, status badges, timestamp everywhere
6. **Institutional Trust**: Performance transparency, audit trails, compliance-first

---

## Typography System

**Font Stack**:
- **Primary**: Inter (UI text, labels, descriptions)
- **Data/Numerical**: JetBrains Mono (metrics, prices, percentages, timestamps)

**Hierarchy**:
| Element | Class | Context |
|---------|-------|---------|
| Dashboard Title | `text-3xl font-bold tracking-tight` | Command Center header |
| Section Header | `text-xl font-semibold` | Engine panels, metric groups |
| Subsection | `text-base font-semibold` | Card titles, table headers |
| Body Text | `text-sm leading-relaxed` | Descriptions, alerts |
| Large Metric | `text-3xl font-bold font-mono tabular-nums` | Primary KPIs |
| Medium Metric | `text-xl font-semibold font-mono tabular-nums` | Secondary metrics |
| Small Metric | `text-sm font-mono tabular-nums` | Table data, inline values |
| Label | `text-xs font-medium uppercase tracking-wider text-slate-400` | Metric labels |
| Timestamp | `text-xs font-mono text-slate-500` | Last updated, event times |

---

## Color System (Dark Mode Primary)

### Base Palette
```
Background:     slate-950 (#020617)
Surface Deep:   slate-900 (#0f172a)
Surface Mid:    slate-800 (#1e293b)
Surface Light:  slate-700 (#334155)
Border Strong:  slate-600 (#475569)
Border Subtle:  slate-700/40
Text Primary:   slate-50 (#f8fafc)
Text Secondary: slate-300 (#cbd5e1)
Text Muted:     slate-400 (#94a3b8)
```

### Accent Colors
```
Primary Action: cyan-500 (#06b6d4)
Primary Hover:  cyan-400 (#22d3ee)
Success:        green-400 (#4ade80) / green-500 backgrounds
Danger:         red-400 (#f87171) / red-500 backgrounds
Warning:        amber-400 (#fbbf24) / amber-500 backgrounds
Info:           blue-400 (#60a5fa)
```

### Engine Identity Colors
```
AI Engine:      purple-400 (#c084fc) / purple-500/15 backgrounds
Quant Engine:   blue-400 (#60a5fa) / blue-500/15 backgrounds
Flow Engine:    cyan-400 (#22d3ee) / cyan-500/15 backgrounds
```

### Status Indicators
```
Active/Live:    green-400 with pulse animation
Processing:     amber-400 with pulse
Idle:           slate-400
Error:          red-400 with pulse
```

---

## Glassmorphism System (Enhanced)

### Tier 1: Primary Cards (Command Center Panels)
```
Background: bg-slate-900/70
Backdrop: backdrop-blur-xl
Border: border border-slate-700/60
Shadow: shadow-2xl shadow-black/20
```

### Tier 2: Nested Components (Engine Status, Metrics)
```
Background: bg-slate-800/50
Backdrop: backdrop-blur-md
Border: border border-slate-700/40
Shadow: shadow-lg shadow-black/10
```

### Tier 3: Data Containers (Stats, Tables)
```
Background: bg-slate-800/30
Backdrop: backdrop-blur-sm
Border: border border-slate-700/30
Shadow: none
```

### Tier 4: Hover States (Interactive Elements)
```
Background: bg-slate-700/40
Border: border-cyan-500/40
Transition: transition-all duration-200
```

**Rules**:
- Never exceed 3 glass layers deep
- Heavier blur (xl, 2xl) reserved for top-level panels
- Borders must be semi-transparent for depth perception
- Shadows enhance separation, use sparingly

---

## Layout System

**Spacing Scale (8px base)**:
- `gap-2` (8px): Inline badges, tight elements
- `gap-4` (16px): Card internal spacing
- `gap-6` (24px): Between major components
- `gap-8` (32px): Panel separation
- `p-6`: Standard card padding
- `p-8`: Large panel padding
- `py-4`: Compact vertical sections

**Command Center Grid**:
```
Main Layout:    grid grid-cols-1 lg:grid-cols-12 gap-6
Left Panel:     lg:col-span-8 (engine status, analysis)
Right Sidebar:  lg:col-span-4 (live metrics, alerts)
Metrics Strip:  grid-cols-2 md:grid-cols-4 gap-4
Engine Panels:  grid-cols-1 md:grid-cols-3 gap-6
```

**Responsive Strategy**:
- Mobile (<640px): Single column, priority stacking
- Tablet (640-1024px): Two-column grids
- Desktop (>1024px): Full 12-column grid system

---

## Component Patterns

### Engine Status Card
```
Structure:
- Glass Tier 1 container
- Header: Engine name badge + status indicator (pulse)
- Metrics row: Win rate, accuracy, last signal (mono)
- Recent signals table (scrollable, max-height)
- Footer: Last updated timestamp
```

### Real-Time Ticker
```
Placement: Top of Command Center
Style: Full-width bg-slate-900/90 backdrop-blur-md border-b border-slate-700/50
Content: Scrolling market data (mono font), live price updates
Height: py-3
```

### Trading Signal Panel
```
Layout: Two-column (Signal info | Action buttons)
Signal Badge: Color-coded by engine (purple/blue/cyan)
Confidence Meter: Progress bar with percentage
Action Area: Glass button with blurred bg, primary cyan accent
```

### Performance Metrics Grid
```
Cards: 4-column grid on desktop
Glass: Tier 3 (subtle)
Content: Large mono number + small label + trend indicator (↑/↓)
Accent: Color-coded by metric type (green/red/cyan)
```

### Alert/Notification Panel
```
Container: Tier 2 glass, fixed height with scroll
Items: Stacked alerts with timestamp, icon, brief message
Priority: Border accent (red/amber/cyan) based on severity
Animation: Fade-in for new alerts
```

---

## Command Center Visual Hierarchy

**Priority 1 (Immediate Attention)**:
- Real-time ticker (top)
- Engine status indicators (pulse animations)
- Critical alerts (red/amber accents)

**Priority 2 (Active Monitoring)**:
- Trading signals panel
- Performance metrics grid
- Live data tables

**Priority 3 (Context/Reference)**:
- Historical charts
- Audit logs
- System settings

**Hierarchy Implementation**:
- Use glass tier levels (1=highest priority, 3=lowest)
- Larger typography for critical data
- Pulse animations only on live/active elements
- Cyan accents draw eye to actionable items

---

## Interactive Elements

### Buttons
```
Primary: bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg
Secondary: border border-slate-600 hover:border-cyan-500 bg-slate-800/50
Ghost: hover:bg-slate-800/50
Disabled: opacity-50 cursor-not-allowed

On Images/Glass: backdrop-blur-md bg-slate-900/60 border-slate-700/60
```

### Badges
```
Engine AI: bg-purple-500/15 text-purple-400 border-purple-500/40
Engine Quant: bg-blue-500/15 text-blue-400 border-blue-500/40
Engine Flow: bg-cyan-500/15 text-cyan-400 border-cyan-500/40
Status Live: bg-green-500/15 text-green-400 border-green-500/40
```

### Data Tables
```
Header: bg-slate-800/50 text-xs uppercase tracking-wider
Row: hover:bg-slate-800/30 border-b border-slate-800/50
Cell: font-mono for numbers, text-sm
Zebra Striping: Optional, subtle bg-slate-900/30 on alternates
```

---

## Animation Guidelines

**Allowed**:
- Pulse for live indicators: `animate-pulse` (green-400)
- Fade-in for new data: `transition-opacity duration-300`
- Hover state color shifts: `transition-colors duration-200`
- Skeleton loaders for async data
- Chart/graph transitions (chart.js default animations)

**Forbidden**:
- Bouncing effects
- Rotating elements
- Excessive motion (causes distraction)
- Auto-playing carousels

---

## Required Elements

**Command Center Must Include**:
1. Real-time ticker (market data feed)
2. Engine status dashboard (3 engines visible)
3. Live performance metrics strip
4. Recent signals/trades table
5. Alert notification panel
6. Last updated timestamps on all data
7. Educational disclaimer footer

**Every Data Display**:
1. Timestamp (font-mono, text-xs)
2. Source indicator (badge or label)
3. Loading state (skeleton)
4. Error state (red accent, retry action)

---

## Accessibility

- Touch targets: min 44x44px
- Focus rings: `ring-2 ring-cyan-500 ring-offset-2 ring-offset-slate-950`
- WCAG AA contrast (4.5:1 minimum)
- Screen reader labels on icon buttons
- Keyboard navigation support (Tab, Arrow keys for tables)

---

**Change Log**: 2026-01-03 | Command Center revamp: Enhanced glassmorphism tier system, real-time ticker, engine status panels, institutional visual hierarchy, pulse animations for live indicators.