/** Canonical raw-evidence band contract shared by every producer and surface. */
export const CONVICTION_BAND_CUTOFFS = Object.freeze({
  S: 25,
  A: 19,
  B: 13,
} as const);

export type ConvictionBand = "S" | "A" | "B" | "C";

export function convictionBandForScore(score: number): ConvictionBand {
  const finiteScore = Number.isFinite(score) ? score : 0;
  if (finiteScore >= CONVICTION_BAND_CUTOFFS.S) return "S";
  if (finiteScore >= CONVICTION_BAND_CUTOFFS.A) return "A";
  if (finiteScore >= CONVICTION_BAND_CUTOFFS.B) return "B";
  return "C";
}

export function isHighConvictionBand(band: string | null | undefined): boolean {
  return band === "S" || band === "A";
}
/**
 * Letter grade for a RAW conviction score (the same ~0–60 points the bands use).
 * One table for every surface — the web badge (client/src/lib/conviction-display.ts),
 * Discord signal alerts and the quantinum dossier. Aligned to the bands:
 *   S (≥25) → A+/A/A-   A (19–24) → B+/B/B-   B (13–18) → C+/C/C-   C (<13) → D+/D/D-/F
 * Audit 2026-09-29: Discord graded convictionDisplayPercent(score) on the 0–100
 * confidence table instead, so raw 28 was "A" in Discord and "A-" on the web, and
 * raw 19–20 (A band) became B- and was silently dropped by the Discord grade gate.
 */
export const CONVICTION_GRADE_CUTOFFS: ReadonlyArray<readonly [number, string]> = Object.freeze([
  [35, "A+"], [30, "A"], [CONVICTION_BAND_CUTOFFS.S, "A-"],
  [23, "B+"], [21, "B"], [CONVICTION_BAND_CUTOFFS.A, "B-"],
  [17, "C+"], [15, "C"], [CONVICTION_BAND_CUTOFFS.B, "C-"],
  [9, "D+"], [5, "D"], [1, "D-"],
] as const);

export type ConvictionLetter = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

export function convictionLetterGrade(score: number): ConvictionLetter {
  const s = Number.isFinite(score) ? score : 0;
  for (const [cutoff, grade] of CONVICTION_GRADE_CUTOFFS) if (s >= cutoff) return grade as ConvictionLetter;
  return "F";
}
