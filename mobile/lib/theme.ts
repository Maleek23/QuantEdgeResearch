/**
 * QuantEdge Dark Theme
 * Matches web app: bg-[#0a0a0a], cards bg-[#111], borders [#222], emerald accent
 */

export const colors = {
  // Backgrounds
  bg: '#0a0a0a',
  card: '#111111',
  cardHover: '#161616',
  surface: '#0d0d0d',

  // Borders
  border: '#222222',
  borderLight: '#1a1a1a',
  borderAccent: 'rgba(16, 185, 129, 0.2)',

  // Text
  text: '#ffffff',
  textSecondary: '#94a3b8', // slate-400
  textMuted: '#64748b',     // slate-500
  textDim: '#475569',       // slate-600

  // Emerald accent
  emerald: '#10b981',       // emerald-500
  emeraldDark: '#059669',   // emerald-600
  emeraldLight: '#34d399',  // emerald-400
  emeraldBg: 'rgba(16, 185, 129, 0.1)',
  emeraldBorder: 'rgba(16, 185, 129, 0.3)',

  // Status
  green: '#10b981',
  red: '#ef4444',
  yellow: '#eab308',
  blue: '#3b82f6',

  // Tab bar
  tabBarBg: '#0a0a0a',
  tabBarBorder: '#1a1a1a',
  tabBarActive: '#10b981',
  tabBarInactive: '#64748b',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 24,
  xxxl: 32,
  hero: 40,
} as const;

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;
