# Quant Edge Labs Design Guidelines v3.0
## Complete Design Consistency Framework

**Tagline**: "Multiple Engines, One Edge"  
**Mission**: Institutional-grade quantitative research platform combining AI analysis with quantitative validation for transparent, auditable trading research.

---

## 1. Design Philosophy: Terminal-Institutional

**Core Aesthetic**: Bloomberg Terminal meets institutional trading floors. Think: multi-monitor trading desks, data-dense displays, surgical precision, zero distractions.

### Guiding Principles
1. **Information Dominance**: Maximum data visibility, hierarchical clarity
2. **Monospace Authority**: All numerical data in JetBrains Mono—no exceptions
3. **Layered Depth**: Strategic glassmorphism creates UI hierarchy without clutter
4. **Grid Discipline**: 8px base grid, mathematical precision in spacing
5. **Real-Time Awareness**: Live indicators, status badges, timestamps everywhere
6. **Institutional Trust**: Performance transparency, audit trails, compliance-first

### The 3-Question Filter (Ruthless Minimalism)
Before adding **any** element to **any** page, ask:
1. **Does this help make a trading decision?** (If no, remove)
2. **Is this data displayed in monospace?** (If no, fix)
3. **Can this be collapsed in minimal mode?** (If no, add toggle)

**Design Mantra**: *"If Bloomberg Terminal doesn't have it, we don't need it."*

---

## 2. Typography System

### Font Stack
- **Primary UI**: Inter (labels, descriptions, buttons)
- **Data/Numerical**: JetBrains Mono (metrics, prices, percentages, timestamps)

### Hierarchy
| Element | Classes | Context |
|---------|---------|---------|
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

## 3. Color System (Dark Mode Primary)

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

## 4. Glassmorphism System

### Tier 1: Primary Cards (Command Center Panels)
```
Background: bg-slate-900/70
Backdrop:   backdrop-blur-xl
Border:     border border-slate-700/60
Shadow:     shadow-2xl shadow-black/20
```

### Tier 2: Nested Components (Engine Status, Metrics, Insights)
```
Background: bg-slate-800/50
Backdrop:   backdrop-blur-md
Border:     border border-slate-700/40
Shadow:     shadow-lg shadow-black/10
```

### Tier 3: Data Containers (Stats, Tables)
```
Background: bg-slate-800/30
Backdrop:   backdrop-blur-sm
Border:     border border-slate-700/30
Shadow:     none
```

### Tier 4: Hover States (Interactive Elements)
```
Background: bg-slate-700/40
Border:     border-cyan-500/40
Transition: transition-all duration-200
```

### Glassmorphism Rules
- Never exceed 3 glass layers deep
- Heavier blur (xl, 2xl) reserved for top-level panels
- Borders must be semi-transparent for depth perception
- Shadows enhance separation, use sparingly

---

## 5. Layout System

### Grid Foundation
- Base unit: 8px
- Container max-width: 1400px (2xl screens), fluid below
- Main content padding: p-6 (24px)

### Spacing Scale
| Size | Value | Usage |
|------|-------|-------|
| xs | 4px (p-1, gap-1) | Inline elements |
| sm | 8px (p-2, gap-2) | Compact spacing |
| md | 16px (p-4, gap-4) | Card spacing |
| lg | 24px (p-6, gap-6) | Section spacing |
| xl | 32px (p-8, gap-8) | Panel spacing |

### Common Layouts
- **Command Center**: 2/3 + 1/3 split (analysis left, widgets right)
- **Data Tables**: Full width with horizontal scroll on mobile
- **Card Grids**: 3-column on desktop, 2 on tablet, 1 on mobile

---

## 6. Content Density System

### Three Density Modes
1. **Minimal**: Core metrics only, expert traders
2. **Standard**: Metrics + key insights, default view
3. **Detailed**: Full analysis, educational content, beginners

### Implementation Pattern
```tsx
// Always visible (Minimal)
<GradeBadge>B- Tier</GradeBadge>

// Standard density
{!isMinimal && <FactorBreakdown factors={[...]} />}

// Detailed density only
{isDetailed && <MarketContextAnalysis context={...} />}
{isDetailed && <HistoricalStats stats={...} />}
```

### Smart Defaults by User Type
- Beginner → Detailed (educational)
- Intermediate → Standard
- Expert → Minimal (fast scanning)

---

## 7. Component Standards

### Form Inputs (Glass Style)
```tsx
<Input
  className="bg-slate-800/50 backdrop-blur-md border-slate-700/40 
             focus:border-cyan-500/60 focus:ring-cyan-500/20
             text-slate-200 placeholder:text-slate-500"
/>
```

### Buttons (Three Variants)
```
Primary:   bg-cyan-500 hover:bg-cyan-400 text-slate-950
Secondary: border border-slate-600 hover:border-cyan-500 text-slate-300
Ghost:     hover:bg-slate-700/40 text-slate-300
```

### Interactive States
- Focus rings: `ring-2 ring-cyan-500 ring-offset-2 ring-offset-slate-900`
- Disabled: `opacity-50 cursor-not-allowed`
- Minimum touch target: 44x44px

### Insight Panels (Contextual Intelligence)
```tsx
<InsightPanel className="bg-slate-800/50 backdrop-blur-md border border-slate-700/40 rounded-lg p-4">
  <Header className="flex items-center gap-2 mb-3">
    <Icon className="h-4 w-4 text-cyan-400" />
    <Title className="text-sm font-semibold text-slate-200 uppercase">INSIGHT TITLE</Title>
  </Header>
  <Content className="text-sm text-slate-300">...</Content>
  <Action className="text-xs text-cyan-400 mt-3">
    <span className="font-semibold">Action:</span> Actionable guidance here.
  </Action>
</InsightPanel>
```

---

## 8. Loading & Empty States

### Terminal-Style Loading
```tsx
<div className="flex items-center font-mono text-sm">
  <span className="text-green-400 mr-2">⏳</span>
  <span className="text-slate-400">Loading market data...</span>
  <Loader2 className="ml-2 h-4 w-4 animate-spin text-cyan-400" />
</div>
```

### Empty States
```tsx
<EmptyState>
  <Icon className="text-4xl text-slate-600 mb-4" />
  <Title className="text-lg font-semibold text-slate-300">No Signals Found</Title>
  <Message className="text-sm text-slate-400 mt-2">
    Market is in ranging regime. Try adjusting scanner settings.
  </Message>
  <Actions className="mt-4 space-x-2">
    <Button variant="primary">Adjust Scanner</Button>
    <Button variant="secondary">View Market Context</Button>
  </Actions>
</EmptyState>
```

---

## 9. Animation Guidelines

### Allowed Animations
- `animate-pulse` for live indicators only
- `transition-colors duration-200` for hover states
- `transition-all duration-300` for expand/collapse

### Forbidden
- Bounce animations
- Rotate animations (except spinners)
- Parallax effects
- Auto-playing videos

---

## 10. Mobile Adaptation

### Breakpoint Strategy
- Mobile: < 640px (single column, bottom sheet nav)
- Tablet: 640-1024px (2 columns, collapsible sidebar)
- Desktop: > 1024px (full layout)

### Mobile Rules
- Sidebar becomes bottom sheet or hamburger menu
- Grid collapses to single column
- Font sizes scale down (metrics: text-lg, body: text-xs)
- Touch targets ≥ 44px
- No horizontal scrolling

---

## 11. Design QA Checklist

Every page must pass ALL checks before approval:

### Typography
- [ ] All numbers/prices/percentages use `font-mono tabular-nums`
- [ ] All UI text uses Inter font
- [ ] Heading hierarchy follows guidelines
- [ ] Timestamps use `text-xs font-mono text-slate-500`

### Color System
- [ ] Background is `slate-950` everywhere
- [ ] No gradients (except subtle black shadows)
- [ ] Accent colors used only for status/actions
- [ ] Engine colors consistent (Purple=AI, Blue=Quant, Cyan=Flow)

### Glassmorphism
- [ ] Max 3 glass layers per view
- [ ] Borders are `slate-700/40` or `slate-700/60`
- [ ] Backdrop blur values: xl for primary, md for nested, sm for data

### Spacing
- [ ] 8px base grid strictly enforced
- [ ] Padding: p-6 standard, p-8 for large panels, p-4 for compact
- [ ] Gap: gap-4 for cards, gap-6 for sections

### Content
- [ ] Educational disclaimers on every screen
- [ ] No marketing fluff text
- [ ] All numbers in monospace
- [ ] All actions have clear "Action:" statements
- [ ] Every insight ends with actionable guidance

### Performance
- [ ] No layout shift on load
- [ ] Glassmorphism layers don't cause jank
- [ ] Animations use GPU acceleration

---

## 12. Page Consistency Standards

### Reference Implementation
**Command Center** (`/trading-engine`) is the gold standard. All pages should match its:
- Glassmorphism tier usage
- Typography hierarchy
- Spacing patterns
- Color application

### Success Metric
User should be able to close their eyes, open any page, and **instantly know they're on Quant Edge Labs** by typography, spacing, and glassmorphism alone.

---

## 13. Key Files Reference

- `client/src/components/contextual-insights.tsx` - Insight panel implementations
- `client/src/pages/trading-engine.tsx` - Command Center (reference standard)
- `client/src/index.css` - CSS variables and base styles
- `tailwind.config.ts` - Theme configuration
