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

// DEPRECATED: Legacy confidence bands - use SIGNAL_STRENGTH_BANDS instead
// These are kept for backward compatibility but should not be used for new code
export const CONFIDENCE_BANDS = {
  HIGH: { key: 'high', label: 'High', range: '70+', min: 70, max: 100 },
  MEDIUM: { key: 'medium', label: 'Medium', range: '50-69', min: 50, max: 69 },
  LOW: { key: 'low', label: 'Low', range: '<50', min: 0, max: 49 },
} as const;

// DEPRECATED: Use SIGNAL_STRENGTH_BAND_LABELS instead
export const CONFIDENCE_BAND_LABELS: Record<string, string> = {
  high: 'High (70+)',
  medium: 'Medium (50-69)',
  low: 'Low (<50)',
};

// NEW: Signal Strength band labels - based on indicator consensus, not probability
export const SIGNAL_STRENGTH_BAND_LABELS: Record<string, string> = {
  'A': 'A (5+ signals)',
  'B+': 'B+ (4 signals)',
  'B': 'B (3 signals)',
  'C+': 'C+ (2 signals)',
  'C': 'C (1 signal)',
  'D': 'D (0 signals)',
};

// DEPRECATED: Get confidence band for a given score - use getSignalStrengthBand instead
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

/**
 * Canonical loss threshold - use this instead of hardcoding "3"
 * Trades that hit stop with less than this loss are considered "breakeven"
 */
export const CANONICAL_LOSS_THRESHOLD = PERFORMANCE_THRESHOLDS.MIN_LOSS_PERCENT;

/**
 * Check if a trade is a "real loss" - hit stop OR expired with >= 3% loss
 * Works with any object that has outcomeStatus and percentGain properties
 * 
 * A trade is a real loss if:
 * 1. It hit stop AND lost >= 3%, OR
 * 2. It expired AND lost >= 3% (e.g., a trade that expired with -22% is still a loss)
 */
export function isRealLoss(idea: { outcomeStatus?: string | null; percentGain?: number | null }): boolean {
  const status = (idea.outcomeStatus || '').trim().toLowerCase();
  
  // Only count hit_stop and expired as potential losses
  if (status !== 'hit_stop' && status !== 'expired') return false;
  
  // Check if the loss exceeds the threshold
  if (idea.percentGain !== null && idea.percentGain !== undefined) {
    return idea.percentGain <= -CANONICAL_LOSS_THRESHOLD;
  }
  
  // For hit_stop without percentGain data, count as loss (legacy behavior)
  // For expired without percentGain data, don't count as loss (could be neutral expiry)
  return status === 'hit_stop';
}

/**
 * Check if a trade is a "real loss" using resolutionReason instead of outcomeStatus
 * Used by auto-resolved trade endpoints
 * 
 * A trade is a real loss if:
 * 1. It was auto-resolved by stop hit AND lost >= 3%, OR
 * 2. It expired AND lost >= 3%
 */
export function isRealLossByResolution(idea: { resolutionReason?: string | null; percentGain?: number | null }): boolean {
  const reason = idea.resolutionReason;
  
  // Only count stop hits and expired as potential losses
  if (reason !== 'auto_stop_hit' && reason !== 'expired') return false;
  
  // Check if the loss exceeds the threshold
  if (idea.percentGain !== null && idea.percentGain !== undefined) {
    return idea.percentGain <= -CANONICAL_LOSS_THRESHOLD;
  }
  
  // For stop hit without percentGain data, count as loss (legacy behavior)
  // For expired without percentGain data, don't count as loss
  return reason === 'auto_stop_hit';
}

/**
 * Filter to current-gen engines only (exclude legacy Quant v1.x/v2.x)
 */
export function isCurrentGenEngine(idea: { engineVersion?: string | null }): boolean {
  if (!idea.engineVersion) {
    return true;
  }
  
  const version = idea.engineVersion.toLowerCase();
  if (version.startsWith('v3.')) return true;
  if (version.startsWith('flow_')) return true;
  if (version.startsWith('hybrid_')) return true;
  if (version.startsWith('ai_')) return true;
  
  return false;
}

// Engine colors for consistent styling
export const ENGINE_COLORS: Record<string, { border: string; text: string; bg: string }> = {
  ai: { border: 'border-amber-500/50', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  quant: { border: 'border-cyan-500/50', text: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  hybrid: { border: 'border-purple-500/50', text: 'text-purple-400', bg: 'bg-purple-500/10' },
  flow_scanner: { border: 'border-green-500/50', text: 'text-green-400', bg: 'bg-green-500/10' },
  chart_analysis: { border: 'border-blue-500/50', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  lotto_scanner: { border: 'border-pink-500/50', text: 'text-pink-400', bg: 'bg-pink-500/10' },
} as const;

/**
 * SIGNAL STRENGTH BANDS (Replaces misleading confidence bands)
 * 
 * CANONICAL grading used across Discord cards AND Dashboard.
 * These bands represent SIGNAL CONSENSUS, not probability.
 * A+ = Exceptional (5+ signals agree)
 * A = Strong (4 signals)
 * B = Good (3 signals)
 * C = Average (2 signals)
 * D = Weak (0-1 signals)
 */
export const SIGNAL_STRENGTH_BANDS = {
  'A+': { min: 5, label: 'A+', description: 'Exceptional - All indicators aligned', color: 'green' },
  A: { min: 4, label: 'A', description: 'Strong - Most indicators aligned', color: 'green' },
  B: { min: 3, label: 'B', description: 'Good - Multiple indicators aligned', color: 'cyan' },
  C: { min: 2, label: 'C', description: 'Average - Some indicators aligned', color: 'amber' },
  D: { min: 0, label: 'D', description: 'Weak - Few indicators aligned', color: 'red' },
} as const;

export type SignalStrengthBand = keyof typeof SIGNAL_STRENGTH_BANDS;

/**
 * Get Signal Strength band from signal count
 * CANONICAL function - used by Discord cards AND Dashboard for consistency
 */
export function getSignalStrengthBand(signalCount: number): SignalStrengthBand {
  if (signalCount >= 5) return 'A+';
  if (signalCount >= 4) return 'A';
  if (signalCount >= 3) return 'B';
  if (signalCount >= 2) return 'C';
  return 'D';
}

/**
 * Get signal label for Discord cards (e.g., "A+ Signal")
 */
export function getSignalLabel(signalCount: number): string {
  const band = getSignalStrengthBand(signalCount);
  if (band === 'D') return 'Low Signal';
  return `${band} Signal`;
}

/**
 * Get styling classes for signal strength band
 */
export function getSignalStrengthStyles(band: SignalStrengthBand): { bg: string; text: string; border: string } {
  switch (band) {
    case 'A+':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' };
    case 'A':
      return { bg: 'bg-green-500/15', text: 'text-green-400', border: 'border-green-500/40' };
    case 'B':
      return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/50' };
    case 'C':
      return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50' };
    case 'D':
    default:
      return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' };
  }
}

/**
 * EXPECTED VALUE CALCULATION
 * 
 * Instead of fake probability, show expected return per $1 risked
 * Formula: EV = (winRate * avgWin) - (lossRate * avgLoss)
 */
export interface ExpectedValueData {
  winRate: number;        // 0-100 percentage
  avgWin: number;         // Average gain on winning trades (e.g., 3.11%)
  avgLoss: number;        // Average loss on losing trades (e.g., -2.5%)
  totalTrades: number;    // Sample size for transparency
}

/**
 * Calculate expected value per $1 risked
 * Returns the expected return for every $1 you risk
 */
export function calculateExpectedValue(data: ExpectedValueData): number {
  const winProb = data.winRate / 100;
  const lossProb = 1 - winProb;
  
  // Expected value = (P(win) * avg_gain) - (P(loss) * avg_loss)
  // avgLoss is already negative, so we use absolute value
  const ev = (winProb * data.avgWin) - (lossProb * Math.abs(data.avgLoss));
  
  // Convert from percentage to per-dollar return
  // e.g., EV of 2% means $1.02 returned per $1 risked, or +$0.02 profit
  return ev / 100;
}

/**
 * Format expected value for display
 * Shows "+$X.XX per $1 risked" or "-$X.XX per $1 risked"
 */
export function formatExpectedValue(ev: number): string {
  const sign = ev >= 0 ? '+' : '';
  return `${sign}$${ev.toFixed(2)} per $1`;
}

/**
 * Historical engine performance data (verified Dec 2025)
 * Used for calculating expected value when real-time data unavailable
 */
export const ENGINE_HISTORICAL_PERFORMANCE: Record<string, ExpectedValueData> = {
  flow_scanner: { winRate: 81.9, avgWin: 3.11, avgLoss: -2.5, totalTrades: 199 },
  ai: { winRate: 57.1, avgWin: 1.07, avgLoss: -2.0, totalTrades: 77 },
  hybrid: { winRate: 40.6, avgWin: 2.0, avgLoss: -2.5, totalTrades: 32 },
  quant: { winRate: 34.4, avgWin: 2.5, avgLoss: -2.0, totalTrades: 93 },
  chart_analysis: { winRate: 22.2, avgWin: 2.0, avgLoss: -2.5, totalTrades: 9 },
  manual: { winRate: 0, avgWin: 0, avgLoss: -3.58, totalTrades: 1 },
} as const;

/**
 * Normalize engine name to canonical key
 * Handles: "Flow Scanner", "flow_scanner", "flow", "FLOW", etc.
 */
export function normalizeEngineKey(engine: string): string {
  const normalized = engine.toLowerCase().trim().replace(/\s+/g, '_');
  
  // Map common variations to canonical keys
  const engineMap: Record<string, string> = {
    'flow': 'flow_scanner',
    'flow_scanner': 'flow_scanner',
    'ai': 'ai',
    'quant': 'quant',
    'hybrid': 'hybrid',
    'chart': 'chart_analysis',
    'chart_analysis': 'chart_analysis',
    'manual': 'manual',
    'lotto': 'lotto_scanner',
    'lotto_scanner': 'lotto_scanner',
  };
  
  return engineMap[normalized] || normalized;
}

/**
 * Get expected value for an engine
 */
export function getEngineExpectedValue(engine: string): { ev: number; formatted: string; data: ExpectedValueData } | null {
  const normalizedEngine = normalizeEngineKey(engine);
  const data = ENGINE_HISTORICAL_PERFORMANCE[normalizedEngine];
  
  if (!data || data.totalTrades < 3) {
    return null; // Not enough data
  }
  
  const ev = calculateExpectedValue(data);
  return {
    ev,
    formatted: formatExpectedValue(ev),
    data
  };
}
