import { CONVICTION_BAND_CUTOFFS } from "./conviction-bands";

/**
 * Presentation scale for a raw confluence score.
 *
 * The engine scores independent evidence in raw points (band cutoffs in
 * shared/conviction-bands.ts; S >= 25, A >= 19, B >= 13 at time of writing). Product surfaces use a 0–100 confidence index so a score of 27
 * is not incorrectly presented as "27%". Keep this transform here: alerts,
 * the terminal and any future API consumer must show the same scale.
 */
export function convictionDisplayPercent(score: number): number {
  const s = Math.max(0, score);
  const { S, A, B } = CONVICTION_BAND_CUTOFFS;
  let pct: number;

  if (s >= S) pct = 86 + ((s - S) / 10) * 13;
  else if (s >= A) pct = 72 + ((s - A) / (S - A)) * 14;
  else if (s >= B) pct = 58 + ((s - B) / (A - B)) * 14;
  else pct = (s / B) * 58;

  return Math.round(Math.max(0, Math.min(99, pct)));
}
