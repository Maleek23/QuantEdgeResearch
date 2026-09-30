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
  if (typeof idea.convictionScore === "number") return convictionBandForScore(idea.convictionScore);
  if (idea.convictionBand) return idea.convictionBand;
  const legacy = idea.probabilityBand;
  if (!legacy) return null;
  // Map A+/A/A- → A, B+/B/B- → B, C+/C/C- → C, D → C
  if (legacy.startsWith("A")) return "A";
  if (legacy.startsWith("B")) return "B";
  return "C";
}
// ─────────────────────────────────────────────────────────────
// U2 — Letter grade display
// ─────────────────────────────────────────────────────────────
//
// Renders a single letter grade (A+ … F with +/- modifiers) for a trade
// idea. Resolution order (canonical-first, so the grade stays monotonic with
// displayedScore / sortIdeas, which also prefer convictionScore):
//
//   1. If `convictionScore` is set (canonical 13-layer engine, ~0-60 raw),
//      map it through CONVICTION_GRADE_CUTOFFS. This is the field the table
//      sorts and scores on, so the headline row can never show a worse grade
//      than a lower-ranked sibling collapsed under it.
//   2. Else if `probabilityBand` is set on the row (assigned at trade creation
//      by shared/grading.ts), trust it — the legacy fallback for ideas that
//      were never enriched by the convictions engine.
//   3. Else if `confidenceScore` is set (0-100 legacy scanner), delegate
//      to the shared `getLetterGrade()` so we share the same threshold
//      table the rest of the platform uses.
//   4. Else "F".
//
// IMPORTANT — A4 audit fix:
// The convictions engine clamps to 0–100 but realistically scores in
// the ~0–60 range (sum of 14 layer points). Server bands (server/
// convictions engine cuts at S≥25, A≥19, B≥13, C<13. The
// CONVICTION_GRADE_CUTOFFS table below is calibrated to that real range
// so a server "S" pick renders as A+/A/A- (not B+ as the original 0-100
// table did). Bands and grades stay aligned visually:
//   S band  → A+ / A / A-     (≥25)
//   A band  → B+ / B / B-     (19–24)
//   B band  → C+ / C / C-     (13–18)
//   C band  → D+ / D / D- / F (<13)

import { getLetterGrade as confidenceToGrade, type GradeLetter } from "@shared/grading";
import { convictionBandForScore, isHighConvictionBand, convictionLetterGrade } from "@shared/conviction-bands";

export type LetterGrade = GradeLetter;

// The table lives in shared/conviction-bands.ts (CONVICTION_GRADE_CUTOFFS) so the
// server (Discord alerts, dossier) grades a raw score exactly as this badge does.
function convictionScoreToGrade(score: number): LetterGrade {
  return convictionLetterGrade(score) as LetterGrade;
}

function isValidGradeString(g: unknown): g is LetterGrade {
  return typeof g === "string" && /^([ABCD][+-]?|F)$/.test(g);
}

/**
 * Returns the letter grade (A+ … F) for a trade idea. See resolution order
 * above. Use this everywhere a "how good is this trade?" badge is rendered.
 * Keep the underlying numeric score in the tooltip so power users can still
 * see the raw value.
 */
export function displayedGrade(idea: ScoredIdea | null | undefined): LetterGrade {
  if (!idea) return "F";
  // Canonical-first: the grade must derive from the same field the UI scores
  // and sorts on (displayedScore / sortIdeas prefer convictionScore), so the
  // letter stays monotonic with the rank. Legacy probabilityBand is only a
  // fallback for un-enriched ideas — using it first let a higher-conviction
  // row render a worse grade than a lower-ranked sibling.
  if (typeof idea.convictionScore === "number") {
    return convictionScoreToGrade(idea.convictionScore);
  }
  if (isValidGradeString(idea.probabilityBand)) return idea.probabilityBand;
  if (typeof idea.confidenceScore === "number") {
    return confidenceToGrade(idea.confidenceScore);
  }
  return "F";
}

/**
 * Tailwind class shorthand for grade-coloured badges.
 * A-grades = bullish green, B-grades = blue, C-grades = amber, D/F = red.
 * (Same palette family as shared/grading.ts getGradeStyle so the look stays
 *  consistent across pages that still use the legacy helper.)
 */
export function gradeColorClass(grade: LetterGrade): string {
  if (grade === "A+") return "text-[var(--trade-bullish)] border-emerald-500/50 bg-emerald-500/15";
  if (grade.startsWith("A")) return "text-[var(--trade-bullish)] border-emerald-500/40 bg-emerald-500/10";
  if (grade.startsWith("B")) return "text-blue-300 border-blue-500/40 bg-blue-500/10";
  if (grade.startsWith("C")) return "text-amber-300 border-amber-500/40 bg-amber-500/10";
  return "text-[var(--trade-bearish)] border-red-500/40 bg-red-500/10";
}
