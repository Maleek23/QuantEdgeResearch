/**
 * Live, not carried (audit 2026-10-01 P0 #7).
 *
 * The one rule for "what is the market price of this idea right now": a live
 * quote, or nothing. The publish-time entry price is never a stand-in for the
 * market, and neither is a board price that is merely the stored price carried
 * forward. Callers render "quote unavailable" and skip geometry (progress,
 * trigger/target/stop checks, P&L) when this returns null.
 */
export interface LiveMarkInput {
  entryPrice: number;
  /** The board's price for the idea (may be live, may be carried). */
  currentPrice?: number | null;
  /** Server flag: true = currentPrice is a live quote this build, false = carried. */
  priceIsLive?: boolean | null;
}

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** The board price when it is a live read; null when it is carried or missing. */
export function boardLivePrice(p: LiveMarkInput): number | null {
  if (!positive(p.currentPrice)) return null;
  if (p.priceIsLive === false) return null;
  if (p.priceIsLive === true) return p.currentPrice;
  // Older payloads have no flag: a copy of the entry is a stale board, never the market.
  return Math.abs(p.currentPrice - p.entryPrice) > 1e-9 ? p.currentPrice : null;
}

/** A fresh quote wins; then a live board price; otherwise null (never the entry). */
export function liveMark(p: LiveMarkInput, quotePrice?: number | null): number | null {
  if (positive(quotePrice)) return quotePrice;
  return boardLivePrice(p);
}
