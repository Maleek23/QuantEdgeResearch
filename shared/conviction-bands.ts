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

/** Human legend, e.g. "S ≥ 25 · A ≥ 19 · B ≥ 13 · C < 13". */
export const CONVICTION_BAND_LEGEND =
  `S ≥ ${CONVICTION_BAND_CUTOFFS.S} · A ≥ ${CONVICTION_BAND_CUTOFFS.A} · ` +
  `B ≥ ${CONVICTION_BAND_CUTOFFS.B} · C < ${CONVICTION_BAND_CUTOFFS.B}`;
