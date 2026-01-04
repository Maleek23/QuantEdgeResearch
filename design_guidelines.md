# Quant Edge Labs Design Guidelines

## Brand Identity
**Tagline**: "Multiple Engines, One Edge"
**Mission**: Dual-engine quantitative research platform combining AI analysis with quantitative validation for transparent, auditable trading research.

## Design Philosophy: Tech-Minimalist

**Core Aesthetic**: Terminal-inspired institutional trading interface with surgical precision. Think Bloomberg Terminal meets Linear's restraint meets Vercel's clean engineering aesthetic.

**Guiding Principles**:
1. **Data-Dense, Not Cluttered**: Maximum information, minimum decoration
2. **Monospace Authority**: Numbers demand JetBrains Mono - no exceptions
3. **Surgical Cyan Accents**: One primary accent color, used sparingly
4. **Restrained Glass**: Subtle depth, never distracting
5. **Grid Discipline**: Align everything to an invisible 8px grid
6. **Transparency = Trust**: Performance data always visible, always auditable

## Typography

**Font Stack**:
- **Primary**: Inter - clean, professional, exceptional readability
- **Data/Code**: JetBrains Mono - ALL numerical content, metrics, prices, percentages

**Hierarchy** (use consistently across all pages):
| Element | Class | Usage |
|---------|-------|-------|
| Hero/H1 | `text-4xl sm:text-5xl font-bold tracking-tight` | Landing hero only |
| Page Title | `text-2xl sm:text-3xl font-semibold` | Dashboard headers |
| Section Title | `text-xl font-semibold` | Card headers, sections |
| Body | `text-base leading-relaxed` | Paragraphs, descriptions |
| Data Large | `text-2xl font-bold font-mono tabular-nums` | Key metrics |
| Data Medium | `text-lg font-semibold font-mono` | Secondary metrics |
| Data Small | `text-sm font-mono` | Table cells, inline data |
| Label | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | Metric labels |

## Color System

### Dark Mode Palette (Default)
```
Background:     slate-950 (#020617) / hsl(0 0% 4%)
Surface 1:      slate-900 (#0f172a)
Surface 2:      slate-800 (#1e293b)
Border:         slate-700 (#334155)
Border Subtle:  slate-800 (#1e293b)
Text Primary:   slate-50 (#f8fafc)
Text Muted:     slate-400 (#94a3b8)
```

### Light Mode Palette
```
Background:     slate-50 (#f8fafc) / hsl(220 14% 96%)
Surface 1:      white (#ffffff)
Surface 2:      slate-100 (#f1f5f9)
Border:         slate-200 (#e2e8f0) / hsl(220 13% 88%)
Border Subtle:  slate-100 (#f1f5f9)
Text Primary:   slate-900 (#0f172a) / hsl(220 15% 15%)
Text Muted:     slate-500 (#64748b) / hsl(220 10% 45%)
```

### Accent Colors (Both Modes)
```
Primary:        cyan-500 (#06b6d4) - CTAs, active states, links
Primary Hover:  cyan-400 (#22d3ee) dark / cyan-600 (#0891b2) light
Success:        green-400 (#4ade80) dark / green-600 (#16a34a) light
Danger:         red-400 (#f87171) dark / red-600 (#dc2626) light
Warning:        amber-400 (#fbbf24) dark / amber-600 (#d97706) light
```

### Light Mode Guidelines
- Use semantic color tokens (`bg-background`, `text-foreground`) rather than hardcoded colors
- Shadows are more visible in light mode - use `shadow-sm` instead of `shadow-md`
- Glass effects: reduce opacity (bg-white/60 instead of bg-slate-900/60)
- Borders are more prominent - use `border-slate-200` or `border` default
- Engine colors remain the same (purple, blue, cyan) but may need darker variants for contrast

**Data Visualization**:
- Bullish: `text-green-400` / `bg-green-500/10`
- Bearish: `text-red-400` / `bg-red-500/10`
- Neutral: `text-cyan-400` / `bg-cyan-500/10`
- AI Engine: `text-purple-400` / `bg-purple-500/10`
- Quant Engine: `text-blue-400` / `bg-blue-500/10`
- Flow Engine: `text-cyan-400` / `bg-cyan-500/10`

## Glass Effects (Restrained)

Use glass effects for depth hierarchy, not decoration:

```css
/* Primary cards - subtle blur */
.glass-card: bg-slate-900/60 backdrop-blur-md border border-slate-700/50

/* Elevated surfaces - light glass */
.glass-elevated: bg-slate-800/40 backdrop-blur-sm border border-slate-700/30

/* Stats containers - minimal */
.stat-glass: bg-slate-800/30 border border-slate-700/40

/* Subtle backgrounds */
.glass-subtle: bg-slate-900/30 backdrop-blur-sm
```

**Rules**:
- Never stack multiple glass layers
- Glass blur should be subtle (md or less)
- Avoid heavy shadows on glass elements

## Layout System

**Spacing Scale** (8px base):
- `gap-2` (8px): Tight inline elements
- `gap-4` (16px): Related items, card content
- `gap-6` (24px): Card to card, sections
- `gap-8` (32px): Major section breaks
- `p-4`: Compact cards
- `p-6`: Standard cards
- `py-12 lg:py-16`: Page sections

**Grid System**:
```
Dashboard:      grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
Data Tables:    Full-width, overflow-x-auto on mobile
Split View:     grid-cols-1 lg:grid-cols-3 (main 2 + sidebar 1)
Metrics Strip:  grid-cols-2 sm:grid-cols-4 gap-4
```

**Responsive Breakpoints**:
- Mobile: < 640px (stack everything)
- Tablet: 640-1024px (2-column grids)
- Desktop: > 1024px (full layouts)

## Component Patterns

### Cards
```tsx
<Card className="glass-card rounded-lg p-6">
  <div className="flex items-center justify-between mb-4">
    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      Label
    </span>
    <Icon className="h-4 w-4 text-muted-foreground" />
  </div>
  <p className="text-2xl font-bold font-mono tabular-nums">
    Value
  </p>
</Card>
```

### Metric Display
```tsx
<div className="stat-glass rounded-lg p-4">
  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
    Win Rate
  </p>
  <p className="text-2xl font-bold font-mono text-green-400">
    65.2%
  </p>
</div>
```

### Engine Badges
```tsx
// AI Engine
<Badge className="bg-purple-500/10 text-purple-400 border-purple-500/30">
  AI
</Badge>

// Quant Engine
<Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30">
  Quant
</Badge>

// Flow Engine
<Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
  Flow
</Badge>
```

### Buttons
```tsx
// Primary - Cyan accent
<Button className="bg-cyan-500 hover:bg-cyan-400 text-slate-950">
  Action
</Button>

// Secondary - Outline
<Button variant="outline" className="border-slate-700 hover:border-cyan-500">
  Secondary
</Button>

// Ghost - Minimal
<Button variant="ghost">
  Ghost
</Button>
```

## Landing Page Structure

**Hero Section**:
- Tagline: "Multiple Engines, One Edge"
- Subline: Brief value proposition (1 line)
- Stats strip: 3-4 key metrics in mono font
- CTAs: Primary "Get Started" + Secondary "View Performance"
- Background: Subtle grid pattern or vector lines (no heavy images)

**Trust Section** (required on all public pages):
- Data sources: Yahoo Finance, Tradier, CoinGecko, Alpha Vantage
- Compliance badge: "Educational Research Only"
- Performance transparency note

**Features**:
- Two-column "Engine | Outcome" matrix
- Monochrome icons (lucide-react)
- Brief descriptions, no marketing fluff

## Required Elements

**Every Page Must Have**:
1. Consistent header with "QuantEdge" branding
2. Theme toggle (light/dark)
3. Educational disclaimer (footer or prominent placement)
4. Consistent spacing and typography

**Dashboard Pages Must Have**:
1. Page title with current date/context
2. Key metrics visible above fold
3. Clear data hierarchy (most important first)
4. Loading states (skeleton components)

**Data Display Rules**:
1. All numbers use `font-mono tabular-nums`
2. Positive values: `text-green-600 dark:text-green-400`
3. Negative values: `text-red-600 dark:text-red-400`
4. Percentages include % symbol
5. Currency includes $ symbol
6. Large numbers use compact notation (1.2K, 3.5M)
7. All accent colors must use light/dark variants for readability:
   - Cyan: `text-cyan-600 dark:text-cyan-400`
   - Purple: `text-purple-600 dark:text-purple-400`
   - Amber: `text-amber-600 dark:text-amber-400`

## Animation Guidelines

**Allowed**:
- `transition-colors duration-200` for hover states
- `transition-opacity duration-300` for fade-in
- Skeleton loading animations
- Subtle pulse for live indicators (`animate-pulse`)

**Forbidden**:
- Heavy JS animations
- Bouncing or scaling effects
- Color gradient animations
- Auto-playing carousels
- Excessive motion

## Accessibility

- All interactive elements: min 44x44px touch target
- Color contrast: WCAG AA minimum (4.5:1 for text)
- Focus states: visible `ring-2 ring-cyan-500`
- Screen reader labels on icon-only buttons
- Semantic HTML (nav, main, article, section)

---

## Change Log

| Date | Change | Impacted Views |
|------|--------|----------------|
| 2025-12-31 | Tech-minimalist redesign, established brand guidelines | All pages |
| 2025-12-31 | Added "Multiple Engines, One Edge" tagline | Landing, Headers |
| 2025-12-31 | Standardized typography hierarchy | All pages |
| 2025-12-31 | Defined engine color system | Trade cards, badges |
| 2025-12-31 | Replaced features grid with Engine→Outcome matrix | Landing page |
| 2025-12-31 | Added grid background pattern to hero | Landing page |
| 2025-12-31 | Created terminal-style stats strip | Landing page |
| 2025-12-31 | Added .graph-grid CSS utility for platform-wide use | All pages |
| 2025-12-31 | Simplified AuthHeader (removed glass styling) | App layout |
| 2025-12-31 | Simplified Footer (minimal, monospace) | App layout |
| 2025-12-31 | Simplified Sidebar header (QE badge + tagline) | App sidebar |
| 2025-12-31 | Applied graph-grid background to MainContentWrapper | All authenticated pages |
| 2026-01-03 | Performance page redesign: 3-tier layout (Executive Overview KPI strip, Engine Accordion, simplified Data Audit), 62% code reduction | Performance page |
| 2026-01-03 | Light mode optimization: theme-aware glass utilities, semantic color tokens, accent color light/dark variants | All pages |

---

## Documentation Process

When making UI changes:
1. Check this file for existing patterns
2. Apply consistent styling from guidelines
3. Update Change Log with date, change, and impacted views
4. Update replit.md if architectural changes made
