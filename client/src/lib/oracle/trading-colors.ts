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
