/**
 * H9 — Single source of truth for the score the UI displays.
 *
 * Three score concepts exist in this codebase. Naming was historically muddy;
 * this module enforces the policy:
 *
 *  1. `convictionScore` (canonical)
 *     Source: `server/convictions-engine.ts` (13-layer scoring engine)
 *     Range:  ~0–60 (sum of layer points; bands derived at S/A/B/C cutoffs)
 *     Enriched onto every idea served by /api/trade-ideas/best-setups and
 *     /api/convictions. **This is the number the UI should display.**
 *
 *  2. `confidenceScore` (legacy)
 *     Source: each individual scanner (breakout, options-flow, etc.)
 *     Range:  0–100 raw scanner confidence
 *     Stored on the `trade_ideas` row. Older code paths sort/display it
 *     directly. New UI code should treat it as the **fallback** when no
 *     conviction enrichment exists for the idea.
 *
 *  3. `rankingScore` (in-route, internal)
 *     Source: /api/trade-ideas/best-setups in `server/routes.ts`
 *     Used purely to pre-rank candidates before convictions enrichment.
 *     **Never displayed.** Renamed from the previous `convictionScore`
 *     name to remove the shadow conflict with concept 1.
 *
 * Use `displayedScore(idea)` and `displayedBand(idea)` everywhere a single
 * "how good is this trade?" number/letter is rendered to the user.
 */

export interface ScoredIdea {
  convictionScore?: number | null;
  convictionBand?: string | null;
  confidenceScore?: number | null;
  probabilityBand?: string | null;
}

/**
 * Returns the score to render for a trade idea.
 * Prefers the canonical engine score; falls back to legacy scanner confidence.
 */
export function displayedScore(idea: ScoredIdea | null | undefined): number {
  if (!idea) return 0;
  if (typeof idea.convictionScore === "number") return Math.round(idea.convictionScore);
  if (typeof idea.confidenceScore === "number") return Math.round(idea.confidenceScore);
  return 0;
}

/**
 * Returns the band letter (S/A/B/C) to render.
 * Prefers the canonical engine band; falls back to mapping legacy probabilityBand.
 */
export function displayedBand(idea: ScoredIdea | null | undefined): string | null {
  if (!idea) return null;
  if (idea.convictionBand) return idea.convictionBand;
  const legacy = idea.probabilityBand;
  if (!legacy) return null;
  // Map A+/A/A- → A, B+/B/B- → B, C+/C/C- → C, D → C
  if (legacy.startsWith("A")) return "A";
  if (legacy.startsWith("B")) return "B";
  return "C";
}

/**
 * True if the idea is "high conviction" — S or A band by canonical engine,
 * with legacy A+/A/A- as a fallback.
 */
export function isHighConviction(idea: ScoredIdea | null | undefined): boolean {
  if (!idea) return false;
  if (idea.convictionBand === "S" || idea.convictionBand === "A") return true;
  if (idea.convictionBand === "B" || idea.convictionBand === "C") return false;
  const legacy = idea.probabilityBand || "";
  return ["A+", "A", "A-"].includes(legacy);
}

/**
 * Bar-fill percentage (0–100) for the score, normalizing the two scales.
 * Conviction scores live around 0–60; confidence scores are 0–100.
 */
export function displayedScoreBarPct(idea: ScoredIdea | null | undefined): number {
  if (!idea) return 0;
  if (typeof idea.convictionScore === "number") {
    return Math.min(100, Math.max(0, idea.convictionScore * 1.8));
  }
  if (typeof idea.confidenceScore === "number") {
    return Math.min(100, Math.max(0, idea.confidenceScore));
  }
  return 0;
}
