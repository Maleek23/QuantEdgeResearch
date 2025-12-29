/**
 * Shared constants for consistent terminology across the platform
 * Use these labels everywhere instead of hardcoding strings
 */

// Engine/Source terminology - use "Engine" consistently
export const ENGINE_LABELS: Record<string, string> = {
  ai: 'AI',
  quant: 'Quant',
  hybrid: 'Hybrid',
  flow_scanner: 'Flow Scanner',
  chart_analysis: 'Chart Analysis',
  lotto_scanner: 'Lotto Scanner',
} as const;

export const ENGINE_KEYS = ['ai', 'quant', 'hybrid', 'flow_scanner', 'chart_analysis', 'lotto_scanner'] as const;
export type EngineKey = typeof ENGINE_KEYS[number];

// Confidence bands - consistent naming with ranges
export const CONFIDENCE_BANDS = {
  HIGH: { key: 'high', label: 'High', range: '70+', min: 70, max: 100 },
  MEDIUM: { key: 'medium', label: 'Medium', range: '50-69', min: 50, max: 69 },
  LOW: { key: 'low', label: 'Low', range: '<50', min: 0, max: 49 },
} as const;

export const CONFIDENCE_BAND_LABELS: Record<string, string> = {
  high: 'High (70+)',
  medium: 'Medium (50-69)',
  low: 'Low (<50)',
};

// Get confidence band for a given score
export function getConfidenceBand(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

// Trade outcome terminology
export const OUTCOME_LABELS = {
  win: 'Win',
  loss: 'Loss',
  pending: 'Pending',
  expired: 'Expired',
} as const;

// Asset class terminology
export const ASSET_CLASSES = {
  stock: 'Stock',
  option: 'Option',
  crypto: 'Crypto',
  futures: 'Futures',
} as const;

// Tier terminology
export const TIER_LABELS = {
  free: 'Free',
  advanced: 'Advanced',
  pro: 'Pro',
} as const;

// Performance thresholds
export const PERFORMANCE_THRESHOLDS = {
  MIN_LOSS_PERCENT: 3, // Trades must lose at least 3% to count as a loss
  WIN_RATE_GOOD: 60,
  WIN_RATE_WARNING: 45,
} as const;

// Engine colors for consistent styling
export const ENGINE_COLORS: Record<string, { border: string; text: string; bg: string }> = {
  ai: { border: 'border-amber-500/50', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  quant: { border: 'border-cyan-500/50', text: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  hybrid: { border: 'border-purple-500/50', text: 'text-purple-400', bg: 'bg-purple-500/10' },
  flow_scanner: { border: 'border-green-500/50', text: 'text-green-400', bg: 'bg-green-500/10' },
  chart_analysis: { border: 'border-blue-500/50', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  lotto_scanner: { border: 'border-pink-500/50', text: 'text-pink-400', bg: 'bg-pink-500/10' },
} as const;
