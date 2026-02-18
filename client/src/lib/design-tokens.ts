/**
 * QuantEdge Design System Tokens
 *
 * Visual identity: "Geometric Edge" - Sharp, precise, premium
 * Inspired by: Kompose.ai, Taskk, modern fintech
 */

// =============================================================================
// COLORS
// =============================================================================

export const colors = {
  // Backgrounds
  bg: {
    primary: '#0a0a0b',      // Near black - main background
    secondary: '#0f0f10',    // Slightly lighter - sections
    tertiary: '#141416',     // Card backgrounds
  },

  // Surfaces (cards, modals, dropdowns)
  surface: {
    1: 'rgba(15, 23, 42, 0.8)',      // slate-900/80 - primary cards
    2: 'rgba(30, 41, 59, 0.5)',      // slate-800/50 - nested elements
    3: 'rgba(51, 65, 85, 0.3)',      // slate-700/30 - hover states
    glass: 'rgba(15, 23, 42, 0.6)',  // glassmorphism base
  },

  // Borders
  border: {
    default: 'rgba(51, 65, 85, 0.5)',   // slate-700/50
    subtle: 'rgba(51, 65, 85, 0.3)',    // slate-700/30
    hover: 'rgba(20, 184, 166, 0.3)',   // teal-500/30
    active: 'rgba(20, 184, 166, 0.5)',  // teal-500/50
  },

  // Accent colors
  accent: {
    primary: '#14b8a6',      // teal-500 - main accent
    secondary: '#06b6d4',    // cyan-500 - secondary accent
    tertiary: '#3b82f6',     // blue-500 - tertiary
    gold: '#f59e0b',         // amber-500 - premium/highlight
  },

  // Gradients (as CSS strings)
  gradient: {
    primary: 'linear-gradient(to right, #14b8a6, #06b6d4)',           // teal → cyan
    secondary: 'linear-gradient(to right, #06b6d4, #3b82f6)',         // cyan → blue
    premium: 'linear-gradient(to right, #14b8a6, #f59e0b)',           // teal → gold
    surface: 'linear-gradient(to bottom right, #0f172a, #020617)',    // slate gradient
    glow: 'radial-gradient(circle, rgba(20,184,166,0.15) 0%, transparent 70%)',
  },

  // Text colors
  text: {
    primary: '#ffffff',
    secondary: '#94a3b8',    // slate-400
    tertiary: '#64748b',     // slate-500
    muted: '#475569',        // slate-600
  },

  // Semantic colors
  semantic: {
    success: '#10b981',      // emerald-500
    warning: '#f59e0b',      // amber-500
    error: '#ef4444',        // red-500
    info: '#3b82f6',         // blue-500
  },
} as const;

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
  '3xl': '4rem',   // 64px
} as const;

// =============================================================================
// BORDER RADIUS
// =============================================================================

export const radius = {
  sm: '0.5rem',    // 8px - buttons, badges
  md: '0.75rem',   // 12px - inputs, small cards
  lg: '1rem',      // 16px - cards
  xl: '1.5rem',    // 24px - large cards
  '2xl': '2rem',   // 32px - feature cards, modals
  full: '9999px',  // pills
} as const;

// =============================================================================
// SHADOWS
// =============================================================================

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 4px 6px rgba(0, 0, 0, 0.3)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.3)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.3)',
  glow: {
    teal: '0 0 40px rgba(20, 184, 166, 0.15)',
    cyan: '0 0 40px rgba(6, 182, 212, 0.15)',
    gold: '0 0 40px rgba(245, 158, 11, 0.15)',
  },
  inner: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
} as const;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const typography = {
  // Font sizes with line heights
  size: {
    xs: ['0.75rem', '1rem'],      // 12px
    sm: ['0.875rem', '1.25rem'],  // 14px
    base: ['1rem', '1.5rem'],     // 16px
    lg: ['1.125rem', '1.75rem'],  // 18px
    xl: ['1.25rem', '1.75rem'],   // 20px
    '2xl': ['1.5rem', '2rem'],    // 24px
    '3xl': ['1.875rem', '2.25rem'], // 30px
    '4xl': ['2.25rem', '2.5rem'], // 36px
    '5xl': ['3rem', '1'],         // 48px
    '6xl': ['3.75rem', '1'],      // 60px
    '7xl': ['4.5rem', '1'],       // 72px
    '8xl': ['6rem', '1'],         // 96px
  },

  // Font weights
  weight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  // Letter spacing
  tracking: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// =============================================================================
// ANIMATIONS
// =============================================================================

export const animations = {
  // Durations
  duration: {
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Easings
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

// =============================================================================
// COMPONENT STYLES (Tailwind class strings)
// =============================================================================

export const componentStyles = {
  // Card variants
  card: {
    default: 'rounded-2xl bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm',
    glass: 'rounded-2xl bg-slate-900/60 border border-slate-700/50 backdrop-blur-md',
    elevated: 'rounded-2xl bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm shadow-xl',
    interactive: 'rounded-2xl bg-slate-900/80 border border-slate-800/50 backdrop-blur-sm hover:border-teal-500/30 transition-all',
    feature: 'rounded-3xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800/50 backdrop-blur-sm',
  },

  // Button variants
  button: {
    primary: 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-white font-medium border border-slate-700',
    outline: 'border border-slate-700 hover:bg-slate-800 text-white font-medium',
    ghost: 'hover:bg-slate-800/50 text-slate-400 hover:text-white',
  },

  // Badge variants
  badge: {
    default: 'px-2 py-1 rounded-full bg-slate-800/80 border border-slate-700/50 text-xs text-slate-300',
    accent: 'px-2 py-1 rounded-full bg-teal-500/20 border border-teal-500/30 text-xs text-teal-400',
    success: 'px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-400',
    warning: 'px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-xs text-amber-400',
    error: 'px-2 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-xs text-red-400',
  },

  // Input styles
  input: {
    default: 'rounded-xl bg-slate-900/80 border border-slate-700/50 px-4 py-3 text-white placeholder:text-slate-500 focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition-all',
  },

  // Section styles
  section: {
    default: 'py-16 md:py-24',
    compact: 'py-8 md:py-12',
  },

  // Container styles
  container: {
    default: 'max-w-7xl mx-auto px-6 md:px-8',
    narrow: 'max-w-4xl mx-auto px-6 md:px-8',
    wide: 'max-w-[1600px] mx-auto px-6 md:px-8',
  },
} as const;

// =============================================================================
// PAGE BACKGROUNDS
// =============================================================================

export const backgrounds = {
  // Grid pattern overlay
  grid: `
    background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 60px 60px;
  `,

  // Gradient orbs (as positioned divs)
  orbTeal: 'absolute w-[600px] h-[600px] bg-gradient-to-br from-teal-500/10 via-cyan-500/5 to-transparent rounded-full blur-3xl',
  orbBlue: 'absolute w-[500px] h-[500px] bg-gradient-to-tr from-blue-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl',
} as const;

// =============================================================================
// Z-INDEX SCALE
// =============================================================================

export const zIndex = {
  base: 0,
  behind: -1,
  dropdown: 10,
  sticky: 20,
  fixed: 30,
  modalBackdrop: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
} as const;

// =============================================================================
// WORKSPACE PRESETS — Layout configurations for resizable panel grids
// =============================================================================

export const workspacePresets = {
  single: {
    cols: 1,
    rows: 1,
    template: "1fr",
    label: "Single",
  },
  split: {
    cols: 2,
    rows: 1,
    template: "1fr 1fr",
    label: "Split",
  },
  tripleSplit: {
    cols: 3,
    rows: 1,
    template: "1fr 1fr 1fr",
    label: "Triple",
  },
  sidebar: {
    cols: 2,
    rows: 1,
    template: "320px 1fr",
    label: "Sidebar",
  },
  tradeDesk: {
    cols: 2,
    rows: 2,
    template: "1.5fr 1fr",
    label: "Trade Desk",
  },
  quad: {
    cols: 2,
    rows: 2,
    template: "1fr 1fr",
    label: "Quad",
  },
} as const;
