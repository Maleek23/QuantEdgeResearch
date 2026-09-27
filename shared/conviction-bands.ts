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
