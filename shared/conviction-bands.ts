/**
 * CONVICTION BANDS — the single source of truth for S/A/B/C cutoffs.
 *
 * The convictions engine (server/convictions-engine.ts) assigns a band from a
 * raw confluence-points score. Every surface that turns that score into a
 * band, a letter grade, a legend, or an alert gate must read the cutoffs from
 * here. Before this file existed the server cut at S≥25/A≥19/B≥13 while the
 * client letter-grade table still used the pre-retune S≥30/A≥22/B≥15, so the
 * same score rendered as different bands on different screens (SR 11-7 F3.3).
 *
 * Provenance of the numbers — retuned 22 Aug 2026 after the Watchlist Tier
 * layer stopped scoring. Anchored to percentiles of a live distribution
 * (n=88, max 29, median 12.5):
 *   S = 25  → top ~5%
 *   A = 19  → top ~22%
 *   B = 13  → top ~48%
 *   C = the rest
 *
 * ⚠️ That sample was a WEEKEND snapshot with stale data (freshness penalties,
 * Yahoo rate limiting). Intraday scores should run higher. Re-measure on a
 * trading day and publish hit-rate confidence intervals per band before
 * changing these — and when they change, change them HERE only.
 */

export type ConvictionBand = "S" | "A" | "B" | "C";

export const CONVICTION_BAND_CUTOFFS = { S: 25, A: 19, B: 13 } as const;

/** Band for a raw conviction score, using the canonical cutoffs. */
export function convictionBandFor(score: number): ConvictionBand {
  return score >= CONVICTION_BAND_CUTOFFS.S ? "S"
       : score >= CONVICTION_BAND_CUTOFFS.A ? "A"
       : score >= CONVICTION_BAND_CUTOFFS.B ? "B"
       : "C";
}

/** Human legend, e.g. "S ≥ 25 · A ≥ 19 · B ≥ 13 · C < 13". */
export const CONVICTION_BAND_LEGEND =
  `S ≥ ${CONVICTION_BAND_CUTOFFS.S} · A ≥ ${CONVICTION_BAND_CUTOFFS.A} · ` +
  `B ≥ ${CONVICTION_BAND_CUTOFFS.B} · C < ${CONVICTION_BAND_CUTOFFS.B}`;
