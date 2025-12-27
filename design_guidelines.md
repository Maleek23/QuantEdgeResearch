# Design Guidelines: QuantEdge Research Platform

## Design Philosophy
**Bloomberg-Style Glassmorphism** - A professional trading terminal aesthetic combining frosted glass effects with information-dense layouts. The design prioritizes rapid data scanning, status clarity, and confident trading decisions.

**Core Branding:** "2 Engines. 1 Edge." - AI Analysis + Quantitative Signals working together.

## Core Design Principles
1. **Data First** - Information hierarchy optimized for quick scanning and decision-making
2. **Status Clarity** - Visual indicators for market state, risk levels, and performance metrics
3. **Density Control** - Efficient space usage without overwhelming the user
4. **Action Accessibility** - Critical trading actions always within 1-2 clicks

---

## Color Palette

### Dark Mode (Primary)

**Background:** `#0A0A0A` (0 0% 4%) - Deep black optimized for glassmorphism contrast

**Semantic Colors:**
| Purpose | Tailwind Class | CSS Variable | Hex |
|---------|---------------|--------------|-----|
| Primary/Cyan | `text-cyan-400` | N/A | #22d3ee |
| Bullish/Positive | `text-green-400` | `--chart-2` | #4ade80 |
| Bearish/Negative | `text-red-400` | `--destructive` | #f87171 |
| Warning/Neutral | `text-amber-400` | `--chart-3` | #fbbf24 |
| Info/Accent | `text-primary` | `--primary` | Blue |
| Muted Text | `text-muted-foreground` | `--muted-foreground` | ~#9ca3af |

**Glassmorphism Colors:**
```css
--glass-cyan: 188 100% 50%;
--glass-cyan-rgb: 0, 212, 255;
--glass-border: rgba(255, 255, 255, 0.15);
--glass-border-hover: rgba(255, 255, 255, 0.25);
```

**Chart/Visualization Colors:**
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
- Same semantic colors with slight desaturation for contrast

---

## Glassmorphism System

### Container Classes

| Class | Description | Properties |
|-------|-------------|------------|
| `.glass-card` | Primary container | `rgba(255,255,255,0.05)`, blur 20px, subtle border |
| `.glass` | Cyan-tinted interactive | `rgba(0,212,255,0.25)`, glow shadow |
| `.glass-secondary` | Neutral elements | `rgba(42,42,43,0.40)`, no glow |
| `.glass-success` | Bullish/positive | Green tint, green glow |
| `.glass-danger` | Bearish/negative | Red tint, red glow |

### Hover States
All glass classes include built-in hover states:
- Increased background opacity
- Enhanced glow/shadow
- Brighter borders

### Usage Examples
```jsx
{/* Container */}
<div className="glass-card rounded-xl p-5">Content</div>

{/* With colored accent */}
<div className="glass-card rounded-xl border-l-2 border-l-cyan-500 p-5">
  Primary accent
</div>

{/* Status containers */}
<div className="glass-success rounded-lg px-3 py-1.5">Bullish</div>
<div className="glass-danger rounded-lg px-3 py-1.5">Bearish</div>
```

---

## Typography

### Font Stack
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace;
```

### Type Scale
| Element | Class | Size |
|---------|-------|------|
| Page Title | `text-2xl sm:text-3xl font-bold` | 24-30px |
| Section Header | `text-xl font-semibold` | 20px |
| Card Title | `text-lg font-semibold` | 18px |
| Body Text | `text-base` | 16px |
| Data Labels | `text-sm font-medium` | 14px |
| Prices/Tickers | `font-mono text-sm` | 14px monospace |
| Captions | `text-xs text-muted-foreground` | 12px |
| Uppercase Labels | `text-xs uppercase tracking-wide` | 12px |

### Text Color Usage
- **Primary highlights:** `text-cyan-400`
- **Bullish/gains:** `text-green-400`
- **Bearish/losses:** `text-red-400`
- **Warnings:** `text-amber-400`
- **Secondary:** `text-muted-foreground`
- **Default:** `text-foreground`

---

## Component Patterns

### Hero Header (Standard Page Header)
```jsx
<div className="relative overflow-hidden rounded-xl glass-card p-6 sm:p-8">
  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-500/10" />
  <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase mb-1">
        {format(new Date(), 'EEEE, MMMM d')}
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold mb-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg glass flex items-center justify-center">
          <Icon className="h-5 w-5 text-cyan-400" />
        </div>
        <span className="text-cyan-400">Title</span>
      </h1>
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

### Badge/Pill (use styled spans, NOT Badge component)
```jsx
{/* Neutral */}
<span className="bg-white/10 text-muted-foreground rounded px-2 py-0.5 text-xs">Label</span>

{/* Status pills */}
<span className="glass rounded-lg px-3 py-1.5 text-sm font-medium">Active</span>
<span className="glass-success rounded-lg px-3 py-1.5 text-sm font-medium">+5.2%</span>
<span className="glass-danger rounded-lg px-3 py-1.5 text-sm font-medium">-3.1%</span>
```

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

## Layout System

### Spacing (Tailwind 4px units)
- **Micro (within components):** `p-2`, `gap-2`
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

## Form Inputs

### Glass-styled inputs
```jsx
<Input className="glass" placeholder="Search..." />
<Textarea className="glass" rows={3} />
<Select><SelectTrigger className="glass">...</SelectTrigger></Select>
<TabsList className="glass">...</TabsList>
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

### Risk/Reward
```jsx
<div className="flex items-center gap-2">
  <span className="text-red-400">-$50</span>
  <span className="text-muted-foreground">/</span>
  <span className="text-green-400">+$100</span>
  <span className="text-muted-foreground">(2:1 R:R)</span>
</div>
```

---

## Tables

### Glass-styled table
```jsx
<Table className="glass-card rounded-xl overflow-hidden">
  <TableHeader className="bg-white/5">
    <TableRow>
      <TableHead className="text-muted-foreground">Column</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow className="hover:bg-white/5 border-b border-white/5">
      <TableCell>Data</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

## Accessibility

- High contrast ratios (WCAG AA minimum for all text)
- Keyboard navigation with visible focus indicators
- Loading skeletons for async data
- Error states with clear recovery actions
- All timestamps displayed in CT timezone

---

## Images

**No hero images** - This is a utility-focused trading platform. Visual content limited to:
- Chart visualizations (generated by charting library)
- Icons for asset types (stocks, options, crypto)
- Status indicators and risk gauges
- Brand mark in empty states only

---

## Summary

This design creates a **professional, information-dense trading interface** that prioritizes:
- **Speed** - Rapid data scanning and action
- **Clarity** - Clear status and risk indicators
- **Confidence** - Premium aesthetic for trading decisions

All components use the glassmorphism system for visual consistency, with cyan as the primary accent, green/red for market direction, and amber for warnings.
