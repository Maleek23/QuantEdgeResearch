/**
 * TRADING COLOR SEMANTICS — colour means one thing on this platform, always.
 *
 * The old look leaned on teal/cyan next to bullish green, which read as "this is
 * bullish" on cards that were nothing of the sort — including bearish setups. On a
 * trading surface colour is data, so it gets one job each:
 *
 *   GREEN  — long / bullish / in profit. Direction and P&L ONLY.
 *   RED    — short / bearish / at a loss / invalidation risk.
 *   AMBER  — waiting or caution: pending trigger, near stop, time running out.
 *   CYAN   — structural + neutral information (levels, spot, UI accents). Never a
 *            directional claim. Deliberately kept distinct from bullish green.
 *   MUTED  — inert / closed / no reading.
 *
 * Non-directional health bars (validity, pace) must NOT use green/red, or a strong
 * BEARISH setup renders green and reads as bullish. They use the neutral ramp below.
 */

export const TC = {
  bull:    'var(--trade-bullish, #22c55e)',
  bear:    'var(--trade-bearish, #ef4444)',
  warn:    '#e0a458',
  info:    'var(--brand-cyan, #22d3ee)',
  muted:   'var(--muted-foreground, #8b98a8)',
  neutral: 'var(--foreground, #e6edf3)',
} as const;

/** Direction colour — the only place green/red may be chosen from a side. */
export function directionColor(direction: 'long' | 'short' | string): string {
  return direction === 'short' ? TC.bear : TC.bull;
}

/** P&L colour — green in profit, red at a loss, muted at flat. */
export function pnlColor(pct: number, flatEpsilon = 0.01): string {
  if (Math.abs(pct) < flatEpsilon) return TC.muted;
  return pct > 0 ? TC.bull : TC.bear;
}

/**
 * Health ramp for NON-directional 0–100 metrics (validity, pace, overlay, structure).
 * Cyan→amber→red: strength without implying a market direction.
 */
export function healthColor(v: number): string {
  if (v >= 66) return TC.info;
  if (v >= 33) return TC.warn;
  return TC.bear;
}

/** Status colour for a signal's lifecycle state. */
export function statusColor(status: string): string {
  switch (status) {
    case 'at_target':       return TC.bull;
    case 'invalidated':     return TC.bear;
    case 'near_stop':       return TC.bear;
    case 'pending_trigger': return TC.warn;
    case 'closed':          return TC.muted;
    default:                return TC.info; // in play — structural, not directional
  }
}

/**
 * How much of the risk budget is spent. This IS directional in meaning (against the
 * trade), so red is correct as it climbs.
 */
export function riskColor(pctUsed: number): string {
  if (pctUsed >= 75) return TC.bear;
  if (pctUsed >= 40) return TC.warn;
  return TC.muted;
}

/**
 * BAND COLOUR — S / A / B / C must be visually distinct.
 *
 * Every band was rendering in the same colour, so "ELITE BULLISH" and "MED BULLISH" looked
 * identical and the grade carried no visual weight at all. Direction still owns green/red,
 * so the band gets its own ramp: gold for elite (rare, earns attention), cyan for strong,
 * slate for ordinary, muted for weak. Reading the ramp tells you the tier before you read
 * the word.
 */
export function bandColor(band?: string | null): string {
  switch ((band ?? '').toUpperCase()) {
    case 'S': return '#e0a458';                       // gold — elite
    case 'A': return 'var(--brand-cyan, #22d3ee)';    // cyan — strong
    case 'B': return '#7aa2f7';                       // slate blue — solid
    default:  return 'var(--muted-foreground, #8b98a8)';
  }
}

/**
 * Fill colour for a confidence meter, graded by the score itself rather than one flat
 * accent — so a 90 and a 40 don't look the same length-adjusted.
 */
export function confidenceFill(score: number): string {
  if (score >= 85) return '#e0a458';
  if (score >= 70) return 'var(--brand-cyan, #22d3ee)';
  if (score >= 50) return '#7aa2f7';
  if (score >= 30) return '#8b98a8';
  return 'var(--trade-bearish, #ef4444)';
}
