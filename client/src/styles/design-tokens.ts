/**
 * Design Tokens for Quant Edge Platform
 * Centralized color system, spacing, and style constants
 */

export const colors = {
  // Primary Brand - Cyan
  primary: {
    DEFAULT: "rgb(6 182 212)", // cyan-500
    hover: "rgb(8 145 178)", // cyan-600
    light: "rgb(34 211 238)", // cyan-400
    dark: "rgb(14 116 144)", // cyan-700
  },

  // Accent Colors
  accent: {
    success: "rgb(74 222 128)", // green-400
    danger: "rgb(248 113 113)", // red-400
    warning: "rgb(251 191 36)", // amber-400
    info: "rgb(96 165 250)", // blue-400
  },

  // Background Layers
  background: {
    base: "rgb(2 6 23)", // slate-950
    elevated: "rgb(15 23 42)", // slate-900
    card: "rgba(15, 23, 42, 0.9)", // slate-900/90
    cardGradient: "linear-gradient(to bottom right, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.5))",
  },

  // Text
  text: {
    primary: "rgb(241 245 249)", // slate-100
    secondary: "rgb(148 163 184)", // slate-400
    tertiary: "rgb(100 116 139)", // slate-500
    muted: "rgb(71 85 105)", // slate-600
  },

  // Borders
  border: {
    DEFAULT: "rgba(100, 116, 139, 0.2)", // slate-500/20
    cyan: "rgba(6, 182, 212, 0.2)", // cyan-500/20
    hover: "rgba(6, 182, 212, 0.4)", // cyan-500/40
  },
} as const;

export const spacing = {
  page: {
    padding: "1.5rem", // p-6
    maxWidth: "1600px",
  },
  card: {
    padding: "1.5rem", // p-6
    gap: "1rem", // gap-4
  },
  section: {
    paddingY: "4rem", // py-16
  },
} as const;

export const borderRadius = {
  card: "0.75rem", // rounded-xl
  button: "0.5rem", // rounded-lg
  input: "0.5rem", // rounded-lg
} as const;

export const shadows = {
  card: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  cardHover: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
  glow: {
    cyan: "0 0 20px rgba(6, 182, 212, 0.3)",
    success: "0 0 20px rgba(74, 222, 128, 0.3)",
    danger: "0 0 20px rgba(248, 113, 113, 0.3)",
  },
} as const;

// Utility classes for consistent styling
export const utilityClasses = {
  // Card styles
  card: "bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border border-cyan-500/20 rounded-xl",
  cardHover: "hover:border-cyan-500/40 transition-colors",

  // Button styles
  buttonPrimary: "bg-cyan-500 hover:bg-cyan-600 text-white font-medium",
  buttonSecondary: "border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10",
  buttonGhost: "text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10",

  // Background
  pageBackground: "min-h-screen bg-slate-950 relative overflow-x-hidden w-full",
  gradientOverlay: "fixed inset-0 z-0 bg-gradient-to-b from-slate-950 to-slate-900",

  // Text
  heading: "text-white font-bold tracking-tight",
  subheading: "text-slate-300",
  muted: "text-slate-400",

  // Badges
  badgeNew: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  badgeSuccess: "bg-green-500/10 text-green-400 border-green-500/30",
  badgeDanger: "bg-red-500/10 text-red-400 border-red-500/30",
} as const;
