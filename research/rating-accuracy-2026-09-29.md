# Are the ratings accurate? S/A/B/C conviction bands vs outcomes (2026-09-29)

**Short answer: no, not yet.** A higher band has not done better. Across 610 scored ideas the published conviction score is weakly *negatively* related to the outcome. The A band is the clearest failure: it hit target on 6% of decided ideas and lost 0.64R per idea. S is too small (n=41) to tell apart from zero. The honest reading is that the band summarises *how much evidence agrees*; it is not a probability of winning. It should be labelled that way until a walk-forward says otherwise.

This agrees with the 2026-09-24 SR 11-7 validation, which found stated confidence "ranks outcomes but is not calibrated" on a smaller sample and found no demonstrated edge overall.

## Method

- **Sample.** Every resolved idea in prod `trade_ideas` (`hit_target` / `hit_stop` / `expired`) that has coherent geometry, the same validity screen as `research/path-replay.ts`. That is 797 ideas published 2026-08-24 → 2026-09-25. Of these, 794 were replayed, 2 had no bar data and 1 had levels that were not in the underlying's units. Nothing resolved after 09-25 was in the table at run time.
- **Outcome (primary): path replay.** Each idea is re-adjudicated on real 5-minute bars from the first bar after publication:
  - regular session only;
  - a gap through a barrier fills at the open;
  - a bar that touches both barriers counts as a stop;
  - the horizon is 1 session for day ideas, 10 for swing, 20 for position;
  - neither barrier by the horizon is a *timeout*, marked at the horizon close.

  The stored tracker outcome is reported next to it for comparison only. The 09-24 validation showed the tracker recorded 50 stops that never happened after publication.
- **Band.** `gen_conviction_score` is written once, when an idea first surfaces on the board, so it is the score the platform actually published. It is mapped through today's cutoffs in `shared/conviction-bands.ts` (S ≥ 25, A ≥ 19, B ≥ 13). The stored letter matched in 100% of rows. "Unscored" means ideas that never surfaced on the board.
- **Statistics.**
  - **Hit rate** = targets ÷ (targets + stops), with a Wilson 95% CI.
  - **Break-even** = mean of 1/(1+R:R) over decided ideas; a band needs a hit rate above this to make money.
  - **Avg R** = mean realized R over *all* replayed ideas, timeouts included, with a seeded 2,000-resample bootstrap 95% CI. R is capped at −3/+6.
  - **Monotonicity** = Spearman ρ between score and realized R (bootstrap CI), plus a one-sided permutation test that S+A beat B+C.

Reproduce: `npx tsx research/rating-accuracy.ts` (read-only) → `research/rating-accuracy-2026-09-29.json`.

## By band

| Band | n | Decided | Hit rate (95% CI) | Break-even | Avg R (95% CI) | Tracker hit rate (95% CI) |
|---|---|---|---|---|---|---|
| S | 41 | 33 (9T/24S) | 27.3% (15.1–44.2%) | 32.8% | +0.082 (−0.43 to +0.64) | 6/16 = 37.5% (18.5–61.4%) |
| A | 101 | 79 (5T/74S) | **6.3% (2.7–14.0%)** | 25.9% | **−0.636 (−0.81 to −0.44)** | 5/31 = 16.1% (7.1–32.6%) |
| B | 140 | 101 (23T/78S) | 22.8% (15.7–31.9%) | 24.8% | +0.038 (−0.22 to +0.33) | 9/29 = 31.0% (17.3–49.2%) |
| C | 328 | 236 (60T/176S) | 25.4% (20.3–31.3%) | 31.2% | −0.131 (−0.28 to +0.02) | 28/128 = 21.9% (15.6–29.8%) |
| unscored | 184 | 131 (35T/96S) | 26.7% (19.9–34.9%) | 34.8% | −0.219 (−0.43 to −0.00) | 16/77 = 20.8% (13.2–31.1%) |
| **All** | 794 | 580 (132T/448S) | 22.8% (19.5–26.3%) | 30.3% | **−0.175 (−0.27 to −0.07)** | 64/281 = 22.8% (18.3–28.0%) |

**Monotonicity: fails.**

| Test | Result |
|---|---|
| Spearman ρ, score vs realized R (n = 610) | **−0.14**, 95% CI (−0.22 to −0.05). The CI excludes zero, in the wrong direction. |
| S+A minus B+C avg R | −0.35R (n = 142 vs 468). One-sided permutation p that high bands do better = **0.99**. |
| Bands strictly ordered S > A > B > C on avg R | **No.** The order is S (+0.08) > B (+0.04) > C (−0.13) > A (−0.64). |

**Is A a one-week artifact?** No. A lost money in every week measured: −0.66R (week of 08-24, n=45), −0.89R (08-31, n=22), −0.46R (09-07, n=32) and −0.07R (09-21, n=2). The same held inside each large producer. quant·A was −0.71R (n=48) and market_scanner·A was −0.59R (n=51). So the A band consistently collects something that loses. This study does not establish why; the layer attribution in `research/accuracy-attribution.ts` is where to look next.

## By source

| Source | n | Decided | Hit rate (95% CI) | Break-even | Avg R (95% CI) |
|---|---|---|---|---|---|
| quant | 330 | 245 | 29.0% (23.7–35.0%) | 29.9% | −0.093 (−0.23 to +0.05) |
| market_scanner | 242 | 163 | **10.4% (6.6–16.1%)** | 21.6% | −0.165 (−0.36 to +0.04) |
| spx_session | 184 | 152 | 25.7% (19.4–33.1%) | 39.6% | **−0.301 (−0.49 to −0.09)** |
| gex_scanner | 31 | 14 | 14.3% (4.0–39.9%) | 34.7% | −0.464 (−0.81 to −0.14) |
| flow / manual / tradingview / hybrid | 4 / 1 / 1 / 1 | — | too few to read | | |

Source × band, largest cells:

| Cell | n | Avg R (95% CI) |
|---|---|---|
| quant · B | 41 | **+0.51 (+0.02 to +0.96)** |
| quant · C | 139 | +0.06 (−0.15 to +0.28) |
| quant · S | 28 | −0.24 (−0.70 to +0.28) |
| quant · A | 48 | −0.71 (−0.95 to −0.43) |
| market_scanner · S | 10 | +1.07 (−0.38 to +2.82) |
| market_scanner · A | 51 | −0.59 (−0.83 to −0.33) |
| market_scanner · B | 95 | −0.16 (−0.49 to +0.19) |
| market_scanner · C | 78 | −0.07 (−0.40 to +0.33) |

quant·B is the only cell whose interval clears zero. About 30 cells were examined, so one crossing at 95% is roughly what chance produces; treat it as a lead, not a finding.

## What this means for the product

1. **Do not present a band as a win probability.** The legend now says so and shows these numbers with n and CIs (`shared/rating-accuracy.ts` → `client/src/components/ui/qe-legend.tsx`, "How accurate are the ratings?").
2. **The A band needs investigation before it is shown as "Strong".** It is the only band whose interval sits entirely below zero, and it is not tied to one week or one producer.
3. **Overall expectancy is negative (−0.18R, CI excludes zero)** on the replayed book. This is the same conclusion as the 09-24 validation, now on 794 ideas. Roughly 220 resolved ideas are needed to confirm a 0.2R edge, and we have them. The answer is that there is no edge yet at the book level.
4. **The new peer-confirmation layer** (`server/peer-confirmation.ts`) is weighted as a stated prior (−10…+8) and labelled as explanation. It should not be up-weighted until a walk-forward shows peer agreement predicts outcome.

**Limits.**
- The window is one month (08-24 → 09-25), and one regime dominates it.
- Replay uses the idea's stored levels, including any later "level repair".
- The score is the one at first surfacing, which can be minutes to hours after creation.
- Options P&L is not measured here; everything is on underlying-price R.
