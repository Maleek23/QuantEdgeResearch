/**
 * RATING ACCURACY — the measured record behind the S/A/B/C bands, as a dated
 * snapshot for the legend. Source: research/rating-accuracy.ts →
 * research/rating-accuracy-2026-09-29.json / .md (read-only replay of every
 * resolved idea on real 5-minute bars).
 *
 * This is a STUDY SNAPSHOT, not a live figure: it carries its own as-of date
 * and sample window so no surface can present it as current. Re-run the study
 * and update these numbers together; never edit one without the other.
 */
import type { ConvictionBand } from './conviction-bands';

export interface BandAccuracy {
  band: ConvictionBand;
  /** Ideas replayed in this band. */
  n: number;
  /** Ideas that reached target or stop within their horizon. */
  decided: number;
  /** Targets ÷ decided. */
  hitRate: number;
  hitRateCI95: [number, number];
  /** Mean realized R per idea (timeouts marked at the horizon close). */
  expectancyR: number;
  expectancyCI95: [number, number];
}

export const RATING_ACCURACY_SNAPSHOT = {
  asOf: '2026-09-29',
  window: { from: '2026-08-24', to: '2026-09-25' },
  method: 'Path replay on 5-minute bars from publication; band = the score published when the idea first surfaced, mapped through today’s cutoffs.',
  overall: { n: 794, decided: 580, hitRate: 0.228, hitRateCI95: [0.195, 0.263] as [number, number], breakEvenHitRate: 0.303, expectancyR: -0.175, expectancyCI95: [-0.272, -0.075] as [number, number] },
  bands: [
    { band: 'S', n: 41, decided: 33, hitRate: 0.273, hitRateCI95: [0.151, 0.442], expectancyR: 0.082, expectancyCI95: [-0.432, 0.638] },
    { band: 'A', n: 101, decided: 79, hitRate: 0.063, hitRateCI95: [0.027, 0.14], expectancyR: -0.636, expectancyCI95: [-0.809, -0.444] },
    { band: 'B', n: 140, decided: 101, hitRate: 0.228, hitRateCI95: [0.157, 0.319], expectancyR: 0.038, expectancyCI95: [-0.224, 0.326] },
    { band: 'C', n: 328, decided: 236, hitRate: 0.254, hitRateCI95: [0.203, 0.313], expectancyR: -0.131, expectancyCI95: [-0.279, 0.016] },
  ] as BandAccuracy[],
  /** Spearman rank correlation, published score vs realized R (n = 610). */
  scoreVsOutcome: { n: 610, spearman: -0.14, ci95: [-0.218, -0.054] as [number, number] },
  verdict:
    'The bands do not yet rank outcomes: a higher band has not done better. A lost money in each of the four weeks measured; S is too small (n=41) to tell from zero. Treat the band as a summary of how much evidence agrees, not as a probability of winning.',
} as const;
