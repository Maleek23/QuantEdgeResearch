# Score v2 study — can any evidence score rank NEXUS ideas?

Prepared 2026-10-01 (before the open). Read-only: one `SELECT` dump of `trade_ideas` from production, plus Alpaca bars. Nothing was written to any database.

- Script: `research/score-v2-study.ts` (`npm run research:score-v2`). Labels come from `research/lib/idea-replay.ts`, the exit-rule replay's simulation, extracted unchanged. `research/exit-rule-replay.ts` now imports it; a frozen re-run reproduces `research/exit-rule-replay-results.json` exactly.
- Features: `shared/setup-features.ts` (pure, point-in-time). Board order: `shared/board-sort.ts`.
- Results: `research/score-v2-study-results.json`. It holds every table below and every idea with its features and label.
- Tests: `npm run test:score-v2` (19 tests: point-in-time cuts, no-look-ahead invariance, feature arithmetic, board order).

## Verdict

**Nothing beat "no ranking" out of sample. Stop ranking the board by the evidence score.**

1. **The old score still does not rank outcomes.** Spearman between the score and realised R is −0.12 in H1 and −0.01 in H2. The top tercile (≥ 16 points) is the worst group on the record: −0.14R per trade, −$5,151. The 31 ideas the engine never scored did best (+0.43R).
2. **A rebuilt score did not fix it.** The model was fit on one half and tested on the other, in both directions. It reached Spearman +0.05 / +0.05. Both 95% intervals include zero.
   - Its top tercile was **worse** than its bottom tercile in both directions (−0.03R and −0.07R).
   - On the train half it predicted the top tercile at +0.19R. Out of sample that tercile realised −0.13R. The model is not calibrated.
3. **The engine record does not rank either.** Out of sample its Spearman is +0.06 / −0.02.
4. **So `SCORE_VERSION=v2` was not built.** The brief's condition was that the new score beat the old one out of sample in both directions, and it did not. `BOARD_SORT` and the "evidence (unvalidated)" label were built instead (see "What is wired").

**Recommendation.**

- Set `BOARD_SORT=recency` on the worker and the web process. It orders the board without claiming that one setup is better than another.
- Keep the evidence layers as a list of reasons. Do not use their total as a rank, a grade or a size.
- Re-run this study when the honest record doubles, at about 900 bar-verified ideas.

**What the brief's examples look like on this record:**

- **Following the leading semis group.** Ideas whose peer group was "igniting" or "extended" on the swing read were the worst slices: −0.46R (n = 28) and −0.38R (n = 25), negative in both halves. In this window, the rotation read worked as a fade signal, not a follow signal.
  - The recent MU / AMD longs in an extended semis group lost: MU 09-28 −1.0R, AMD 09-29 and 09-30 −0.76R each.
  - Rotation alignment flips sign between halves (ρ −0.10 then +0.02).
  - n is far too small to wire the fade as a rule.
- **Compression.** The old compression layer has no signal (ρ +0.04 then −0.03). Removing it costs nothing.
  - Raw compression is weakly **positive**, so the layer's −3 on a coiled name pointed the wrong way:
    - NR7 is positive in both halves on R (+0.08 / +0.05) and on $ (+0.11 / +0.13);
    - inside days in the last 5 sessions are positive on R (+0.09 / +0.05), but the $ sign flips.
  - The effect is too small to pass the bar on its own.
- **Breakout proximity.** No signal at 20 days (ρ +0.07 then −0.04). At 55 days it is slightly negative in both halves (−0.06 / −0.04): ideas already through the level did a little worse.

## Data and labels

**Ideas.** All 720 non-archived ideas published from 2026-08-26 onward.

- The same exclusions as `docs/EXIT_RULE_REPLAY.md` apply: duplicates, the expiry-parse bug, untriggered, void, no bars, and unpriceable options.
- That leaves **443 bar-verified ideas**: H1 2026-08-26 → 09-08 (n = 198) and H2 09-09 → 09-30 (n = 245). The split is at the median publish day.
- 412 of them carry an old score (`gen_conviction_score`) and the persisted layers (`gen_scoring_layers`).

**Outcome (label).**

- The label is the **underlying R-multiple** of the replay's rule 7: the published plan, plus a time stop at ½ horizon unless the trade is at ≥ +0.5R. That is the winning exit rule, and it is already live.
- R = Σ fill fraction × side × (exit − entry) / |entry − stop|.
- Means are winsorised to [−3, +5]. Spearman uses ranks.
- Secondary label: **$ at equal size**, rule 7, with options at $500 of premium filled at the bar high and stock or crypto at $1,000 notional.
- The book under this label is −0.05R per trade (41% win, −$8,808). H1 is −0.03R (+$405); H2 is −0.07R (−$9,213).

**Features.** Every feature is point-in-time at the idea's publish time.

- **Layers.** The points each layer had when the idea was first surfaced (`gen_scoring_layers`), summed by layer kind, plus the old total.
- **Daily-bar features.** Built from **completed** sessions only:
  - for stocks, a session counts once 16:00 ET on that day has passed;
  - for crypto, at 00:00 UTC the next day;
  - price is the last 1-minute close before publish.
  - The features are breakout proximity (20 / 55-day), inside days, NR7, the EMA20 distance, the EMA50 side, ADX and DI, relative volume, the publish-day gap (post-open publishes only), stop width in ATRs, R:R, and the entry's distance from price.
- **Sector rotation.** `shared/sector-ignition.ts` `scoreSwing` runs on the symbol's peer group (`shared/sector-peers.ts`):
  - the group ETF and SPY 5-session RS slope, member breadth versus the 10-day MA, and the stage;
  - cut at the same completed session;
  - aligned means the group's side equals the idea's side.
  - 164 of 443 ideas map to a group.
- **Categorical.** Engine, instrument / side, DTE, and publish time of day.
- **Excluded by design.** No per-ticker features. Flow direction was available only as a layer citation (`flowLayer`). The publish-day relative volume uses the last *completed* session, because the publishing session is partial.

## Old score, re-measured on bar-verified labels

| Half | n | Spearman ρ (R) | 95% CI | ρ ($) | Top − bottom tercile (R) |
|---|---|---|---|---|---|
| H1 | 180 | −0.12 | [−0.28, +0.02] | −0.17 | −0.15R |
| H2 | 232 | −0.01 | [−0.14, +0.14] | −0.01 | +0.09R |
| All | 412 | −0.06 | — | — | −0.07R |

## Univariate — every feature, both halves

Spearman ρ between the feature and realised R. Features are direction-signed where marked. **yes** means the same sign in both halves with |ρ| ≥ 0.05; "yes (tiny)" means the same sign but below that.

| Feature | n | ρ all | ρ H1 | ρ H2 | Same sign |
|---|---|---|---|---|---|
| Old evidence score (gen_conviction_score, raw points) (`old`) | 412 | −0.06 | −0.12 | −0.01 | yes (tiny) |
| Non-zero layers at surfacing (`layerCount`) | 412 | −0.04 | −0.11 | +0.03 | no |
| Layer: technical (`L_technical`) | 412 | +0.02 | −0.02 | +0.10 | no |
| Layer: structure / leadership / aggressor tape (`L_structure`) | 412 | +0.04 | 0.00 | +0.07 | no |
| Layer: regime (`L_regime`) | 412 | −0.01 | 0.00 | −0.02 | no |
| Layer: TA confluence (`L_ta`) | 412 | −0.03 | +0.08 | −0.12 | no |
| Layer: pre-market gap (`L_premarket`) | 412 | −0.08 | −0.14 | +0.01 | no |
| Layer: GEX (`L_gex`) | 412 | −0.12 | −0.13 | −0.10 | **yes** |
| Layer: sector rotation (old) (`L_sector`) | 412 | −0.03 | −0.08 | +0.05 | no |
| Layer: breadth (`L_breadth`) | 412 | −0.08 | +0.10 | −0.13 | no |
| Layer: compression (old) (`L_compression`) | 412 | +0.01 | +0.04 | −0.03 | no |
| A layer cites aligned net premium / aggressor tape (`flowLayer`) | 412 | +0.05 | 0.00 | +0.07 | no |
| Peer-group rotation aligned (+1) / opposed (−1) (`rotAligned`) | 433 | −0.04 | −0.10 | +0.02 | no |
| Peer-group ETF/SPY 5-session RS, signed by side (`rotRs5`) | 433 | −0.04 | −0.11 | +0.03 | no |
| Symbol/SPY 5-session RS, signed by side (`rs5Self`) | 432 | +0.01 | +0.01 | +0.03 | yes (tiny) |
| Distance to 20-day high (long) / low (short), ATRs (`brk20`) | 442 | +0.01 | +0.07 | −0.04 | no |
| Distance to 55-day extreme, ATRs (`brk55`) | 442 | −0.05 | −0.06 | −0.04 | yes (tiny) |
| Inside days in the last 5 sessions (`insideDays5`) | 442 | +0.07 | +0.09 | +0.05 | **yes** |
| Last session NR7 (`nr7`) | 442 | +0.07 | +0.08 | +0.05 | **yes** |
| (price − EMA20)/ATR, signed by side (`ema20Dist`) | 442 | −0.03 | −0.02 | −0.05 | yes (tiny) |
| Price on the idea side of EMA50 (`ema50Side`) | 442 | +0.04 | +0.10 | −0.02 | no |
| ADX(14) (`adx`) | 442 | −0.12 | −0.18 | −0.08 | **yes** |
| (+DI − −DI) signed by side (`diAligned`) | 442 | −0.09 | −0.10 | −0.10 | **yes** |
| Last session volume / 20-day average (`rvol`) | 441 | +0.00 | +0.01 | −0.01 | no |
| Publish-day opening gap in the idea direction, ATRs (post-open publishes) (`gapAtr`) | 384 | −0.12 | −0.14 | −0.11 | **yes** |
| Stop width: abs(entry − stop) / ATR (`stopAtr`) | 442 | +0.18 | +0.23 | +0.11 | **yes** |
| R:R at publish (`rr`) | 443 | −0.17 | −0.17 | −0.21 | **yes** |
| (entry − price at publish)/ATR, signed by side (`entryDist`) | 442 | −0.07 | +0.03 | −0.16 | no |
| Option days to expiry (`dte`) | 307 | +0.05 | −0.03 | +0.08 | no |
| Call (`isCall`) | 443 | 0.00 | −0.01 | +0.01 | no |
| Put (`isPut`) | 443 | +0.11 | +0.18 | +0.07 | **yes** |
| Stock (`isStock`) | 443 | −0.08 | −0.12 | −0.04 | yes (tiny) |
| Short side (puts + short stock) (`isShort`) | 443 | +0.12 | +0.18 | +0.09 | **yes** |
| Engine: market_scanner (`srcMarketScanner`) | 443 | +0.01 | −0.01 | +0.01 | no |
| Engine: gex_scanner (`srcGex`) | 443 | −0.02 | +0.01 | −0.05 | no |
| Engine: quant (`srcQuant`) | 443 | −0.05 | −0.02 | −0.09 | yes (tiny) |
| Engine: flow (`srcFlow`) | 443 | +0.08 | 0.00 | +0.13 | no |
| Day hold (`hpDay`) | 443 | −0.01 | −0.01 | −0.00 | yes (tiny) |
| Published after the close / non-session (`afterClose`) | 443 | +0.00 | +0.04 | −0.05 | no |
| Published pre-open (`preOpen`) | 443 | +0.05 | +0.11 | −0.01 | no |
| Published in the first hour (`firstHour`) | 443 | −0.05 | −0.09 | −0.06 | **yes** |

With n ≈ 200 per half, one standard error of ρ is about 0.07, so **no single feature is individually significant**.

The same features were checked against the $ label (Spearman per half, H1 / H2):

| Feature | ρ($) H1 | ρ($) H2 | Reading |
|---|---|---|---|
| Stop width + | −0.01 | +0.04 | **Mostly mechanical.** R is measured in stop units, and the effect vanishes in $. It is a stop-placement finding, not a ranking feature. |
| R:R − | +0.05 | −0.13 | Far targets did worse in R; the $ sign flips. |
| Gap in the idea's direction − | −0.09 | −0.15 | Chasing the opening gap did worse. **Stable on both labels.** |
| ADX(14) − | −0.15 | −0.04 | Strong trends in the idea's direction did worse (mean reversion over the horizon). Stable on both labels. |
| GEX layer − | −0.13 | −0.10 | The GEX layer pointed the wrong way. Stable on both labels. |
| Short side (puts + short stock) + | +0.10 | +0.14 | Stable on both labels, but only 60 ideas, most of them in H2. |
| NR7 + | +0.11 | +0.13 | Small, stable on both labels. |
| Inside days + | −0.14 | +0.19 | Positive in R; the $ sign flips. |

### Bucket tables

Terciles are cut on the whole sample; they are descriptive only. Mean R uses the winsorised label. $ is equal size.

**Old evidence score (raw points)**

| Bucket | n | mean R | win % | $ | H1 n / R | H2 n / R |
|---|---|---|---|---|---|---|
| low (< 11) | 127 | −0.05 | 41.7% | −1,713 | 74 / −0.06 | 53 / −0.04 |
| mid | 129 | −0.07 | 41.1% | −3,638 | 39 / +0.20 | 90 / −0.19 |
| high (≥ 16) | 156 | −0.14 | 35.9% | −5,151 | 67 / −0.29 | 89 / −0.02 |
| n/a (never scored) | 31 | +0.43 | 64.5% | +1,694 | 18 / +0.53 | 13 / +0.29 |

**Peer-group rotation at publish (swing read)**

| Rotation | n | mean R | win % | $ | H1 n / R | H2 n / R |
|---|---|---|---|---|---|---|
| unmapped | 279 | −0.07 | 40.9% | −5,885 | 116 / −0.08 | 163 / −0.07 |
| long (aligned) | 80 | −0.11 | 36.3% | −1,446 | 43 / −0.07 | 37 / −0.15 |
| short (opposed) | 52 | −0.12 | 38.5% | −705 | 27 / −0.10 | 25 / −0.14 |
| long (opposed) | 17 | +0.49 | 64.7% | −313 | 4 / +1.68 | 13 / +0.13 |
| short (aligned) | 9 | +0.42 | 77.8% | +371 | 3 / +0.82 | 6 / +0.23 |
| flat | 6 | −0.25 | 16.7% | −830 | 5 / −0.17 | 1 / −0.62 |

**Peer-group ignition stage at publish**

| Stage | n | mean R | win % | $ | H1 n / R | H2 n / R |
|---|---|---|---|---|---|---|
| unmapped | 279 | −0.07 | 40.9% | −5,885 | 116 / −0.08 | 163 / −0.07 |
| stirring | 79 | +0.10 | 51.9% | +2,033 | 48 / +0.20 | 31 / −0.05 |
| quiet | 32 | +0.32 | 53.1% | −1,101 | 13 / +0.53 | 19 / +0.19 |
| igniting | 28 | −0.46 | 21.4% | −2,467 | 17 / −0.64 | 11 / −0.19 |
| extended | 25 | −0.38 | 16.0% | −1,388 | 4 / −0.82 | 21 / −0.29 |

**Breakout proximity, 20-day (ATRs; ≥ 0 = through the level)**

| Bucket | n | mean R | win % | $ | H1 n / R | H2 n / R |
|---|---|---|---|---|---|---|
| low (< −2.36) | 147 | −0.06 | 40.1% | −1,474 | 73 / −0.10 | 74 / −0.02 |
| mid | 147 | −0.04 | 43.5% | −2,183 | 67 / +0.04 | 80 / −0.11 |
| high (≥ −1.39) | 148 | −0.07 | 39.2% | −5,228 | 57 / −0.07 | 91 / −0.08 |

**Inside days in the last 5 sessions**

| Bucket | n | mean R | win % | $ | H1 n / R | H2 n / R |
|---|---|---|---|---|---|---|
| 0 | 201 | −0.12 | 35.8% | −8,131 | 71 / −0.24 | 130 / −0.06 |
| 1 | 185 | +0.02 | 45.4% | +528 | 100 / +0.10 | 85 / −0.08 |
| 2 | 50 | −0.07 | 46.0% | −1,149 | 23 / −0.03 | 27 / −0.10 |
| 3 | 6 | −0.08 | 33.3% | −133 | 3 / −0.18 | 3 / +0.03 |

**NR7 / old compression layer**

| Bucket | n | mean R | win % | $ | H1 n / R | H2 n / R |
|---|---|---|---|---|---|---|
| NR7 = 0 | 375 | −0.06 | 40.3% | −10,163 | 162 / −0.04 | 213 / −0.08 |
| NR7 = 1 | 67 | −0.02 | 44.8% | +1,279 | 35 / −0.02 | 32 / −0.01 |
| Compression layer < 0 ("coiled at the wrong end") | 44 | −0.09 | 31.8% | −1,144 | 23 / −0.10 | 21 / −0.08 |
| Compression layer ≥ 0 | 368 | −0.09 | 40.2% | −9,358 | 157 / −0.09 | 211 / −0.09 |

**Stop width (ATRs), R:R, gap**

| Bucket | n | mean R | win % | $ | H1 n / R | H2 n / R |
|---|---|---|---|---|---|---|
| stop < 0.59 ATR | 147 | +0.01 | 34.7% | −3,201 | 60 / −0.05 | 87 / +0.04 |
| stop 0.59–1.37 ATR | 147 | −0.16 | 41.5% | −5,317 | 51 / −0.22 | 96 / −0.13 |
| stop ≥ 1.37 ATR | 148 | −0.01 | 46.6% | −367 | 86 / +0.07 | 62 / −0.13 |
| R:R < 1.62 | 147 | −0.05 | 48.3% | −3,529 | 43 / −0.09 | 104 / −0.03 |
| R:R 1.62–3.19 | 148 | −0.04 | 44.6% | −457 | 69 / +0.13 | 79 / −0.19 |
| R:R ≥ 3.19 | 148 | −0.07 | 30.4% | −4,823 | 86 / −0.14 | 62 / +0.02 |

**Instrument, engine, publish time**

| Slice | n | mean R | win % | $ | H1 n / R | H2 n / R |
|---|---|---|---|---|---|---|
| call | 252 | −0.08 | 38.9% | −7,092 | 107 / −0.04 | 145 / −0.11 |
| stock long | 121 | −0.17 | 36.4% | −677 | 77 / −0.19 | 44 / −0.13 |
| put | 55 | +0.27 | 56.4% | −1,255 | 12 / +0.57 | 43 / +0.19 |
| market_scanner | 246 | −0.10 | 39.8% | −3,090 | 125 / −0.06 | 121 / −0.13 |
| gex_scanner | 93 | −0.06 | 36.6% | −5,919 | 18 / −0.15 | 75 / −0.04 |
| quant | 59 | +0.04 | 42.4% | −100 | 53 / +0.06 | 6 / −0.13 |
| flow | 25 | +0.07 | 60.0% | −375 | 0 / — | 25 / +0.07 |
| published after the close | 154 | −0.06 | 41.6% | +1,531 | 108 / −0.03 | 46 / −0.12 |
| published midday | 119 | −0.08 | 40.3% | −4,477 | 59 / −0.15 | 60 / −0.01 |
| published in the first hour | 55 | −0.26 | 36.4% | −3,029 | 2 / −0.87 | 53 / −0.24 |
| published pre-open | 41 | +0.29 | 46.3% | −1,105 | 17 / +0.42 | 24 / +0.19 |

Engine, instrument and time of day are confounded: `flow` exists only in H2, and `quant` almost only in H1. That is why no engine passes the both-halves test.

## The model and the out-of-sample test

**Model: a points table** (shrunk, monotone bucket effects).

The model was chosen before looking at the results. Each fit uses **one half only**:

1. **Selection.** A candidate is kept if its Spearman has the same sign in the training half's own two quarters, and |ρ| ≥ 0.05 on the training half. At most 8 features are kept, ranked by |ρ|. A candidate whose rank correlation with an already-kept feature exceeds 0.6 is dropped. No per-ticker features.
2. **Points.** Each kept feature is split into training terciles (binary features split 0 / 1).
   - Points = the bucket's mean R minus the training mean, × n / (n + 40) (shrinkage). The fit is forced to be monotone in the sign of ρ (pool-adjacent violators).
   - The summed score gets one global multiplier: the OLS slope of R on the raw sum, clipped to [0, 1], against double counting.
3. **Test.** The model is scored on the **other** half and compared with the old score on the same rows.

| Direction | Features chosen (sign) | Old ρ | New ρ (95% CI) | New − old Δρ (95% CI) | Old top − bottom | New top − bottom | Old ρ ($) | New ρ ($) |
|---|---|---|---|---|---|---|---|---|
| fit H1 → test H2 (n = 232) | stop width +, put +, ADX −, gap −, GEX layer −, stock −, group RS −, layer count − | −0.01 | +0.05 [−0.09, +0.17] | +0.05 [−0.16, +0.27] | +0.09R / −$306 | **−0.03R** / −$3,758 | −0.01 | −0.02 |
| fit H2 → test H1 (n = 180) | R:R −, entry distance −, breadth layer −, stop width +, gap −, technical layer +, DI −, GEX layer − | −0.12 | +0.05 [−0.10, +0.21] | +0.18 [−0.03, +0.38] | −0.15R / −$1,885 | **−0.07R** / +$1,560 | −0.17 | +0.08 |

**Calibration (test tercile, predicted R from the training fit → realised R):**

| Direction | Low | Mid | High |
|---|---|---|---|
| H1 → H2 | −0.21 → −0.10 | −0.02 → −0.05 | **+0.19 → −0.13** |
| H2 → H1 | −0.19 → −0.10 | −0.07 → −0.00 | **+0.04 → −0.17** |

**The pass rule was fixed before the run:** in both directions, ρ_new > ρ_old, the new top-minus-bottom spread > the old spread, and both are > 0. **It fails.**

- The new score's ρ is above the old one's in both directions only because the old one is negative.
- The new top tercile is the worst tercile in both directions.
- On $, v2 beats the old score in 2 of 4 comparisons (ρ and spread), and only in the H2 → H1 direction.

**Sensitivity** (honest nested fit; ρ / top − bottom R):

| ≤ features | Shrink K | H1 → H2 | H2 → H1 |
|---|---|---|---|
| 3 | 20 | +0.07 / +0.19 | −0.04 / +0.22 |
| 3 | 40 | +0.06 / +0.02 | −0.04 / +0.22 |
| 3 | 80 | +0.06 / +0.02 | −0.04 / +0.22 |
| 5 | 20 | +0.07 / +0.19 | +0.06 / −0.15 |
| 5 | 40 | +0.07 / +0.03 | +0.06 / −0.15 |
| 5 | 80 | +0.07 / +0.06 | +0.06 / −0.15 |
| 8 | 20 | +0.04 / −0.01 | +0.04 / −0.14 |
| 8 | 40 (pre-registered) | +0.05 / −0.03 | +0.05 / −0.07 |
| 8 | 80 | +0.05 / −0.03 | +0.05 / −0.07 |

No setting is positive on both measures in both directions.

**A selection-optimistic set** — not used for the verdict.

- Selecting the features with the same sign in **both** halves picks: stop width +, R:R −, ADX −, gap −, GEX layer −, short side +, DI −, stock −.
- Refit per half on that set, it reaches ρ +0.11 / +0.11 with spread +0.09 / +0.05R.
- But the selection saw both test halves. That is exactly the leak the nested test exists to remove.
- Treat this as the hypothesis for the next study, not as a result. Its table is in the results JSON under `production`.

## Engine record as the ranking

The engine's mean R is shrunk toward the book mean (K = 40), fit on one half and tested on the other:

| Direction | ρ (R) | ρ ($) | Top − bottom |
|---|---|---|---|
| H1 → H2 | +0.06 | +0.13 | −0.06R |
| H2 → H1 | −0.02 | +0.05 | +0.16R |

It does not pass either. Engines appear and disappear between halves (`flow` is H2-only; `quant` is H1-heavy).

## What is wired

**`BOARD_SORT=recency | engine_record`** (`shared/board-sort.ts`). Unset, or any other value, means `score`, which is unchanged.

- **Server.** `server/convictions-engine.ts`:
  - `buildConvictions` orders the deconflicted board with `orderBoard` and stamps `boardRank` on each pick;
  - the weekly-focus view (`deriveViewSync`) re-orders with the same comparator;
  - the response carries `boardSort`.
  - Set it on the **worker**, which builds the shared board, and on the web process.
- **Client.** `rankRows` (`client/src/components/dashboard/tools/nexus/nexus-parts.tsx`) keeps the server's `boardRank` when both rows carry one; otherwise it sorts by score, as before.
- **The two modes:**
  - `recency`: newest call first.
  - `engine_record`: the engine's shrunk mean R from this study (`ENGINE_RECORD`, as of the 2026-09-30 close), then recency. It is equally unvalidated.
- **What it does not change.** The `minScore` floor, the symbol/side dedupe and the deconfliction still use the score. Other consumers do not use `BOARD_SORT`: the quant bot, the Today top-setups list and the weekly seeder.

**Evidence ring.** The NEXUS setup detail now reads **"evidence (unvalidated) · {band}"**.

- A tooltip says that a higher score did not mean a better outcome on the bar-verified record.
- This label is unconditional. It is true whichever sort is active.

**Not wired.** `SCORE_VERSION=v2`, the rotation-alignment layer, the breakout-proximity layer, and new bands or display calibration. The study gave no validated score to build them on. The feature code exists and is tested in `shared/setup-features.ts`, so a later live layer measures exactly what was studied.

## Caveats

- **n.** 443 trades over 25 sessions. Per-half Spearman has a standard error of about 0.07. This study can find a ρ ≈ 0.15 effect at best, and it found none that survived.
- **Regime.** H1 is dominated by the 08-31 after-close batch and by `quant`; H2 by `gex_scanner` and `flow`. Engine mix and market regime are confounded with time.
- **Layers are as first surfaced.** The layers come from `gen_scoring_layers` at first surfacing on the board, which can be minutes to hours after publish. No layer was recomputed.
- **The label is the underlying R under rule 7.** Option P&L enters only through the secondary $ label: equal premium, bar-high fill, and 135 option ideas unpriceable (see the exit-rule replay).
- **Rotation is the swing read without flow.** Multi-day flow persistence cannot be rebuilt historically, so `flowDays` = null. The live ignition stage can therefore differ slightly from the reconstruction. 279 ideas are not in any peer group.

## Reproduce

```bash
# 1. Read-only dump (SELECT only) → .cache/score-v2/ideas-raw.json
ssh -i ~/.ssh/quantedge_deploy root@104.248.127.195 "cd /opt/quantedge && set -a && . ./.env && set +a && psql \"\$DATABASE_URL\" -At -c \"select json_agg(x) from (select id, symbol, direction, source, asset_type, option_type, strike_price, expiry_date, entry_price, entry_premium, stop_loss, target_price, timestamp as ts, gen_conviction_score, gen_scoring_layers, holding_period, outcome_status, exit_price, exit_date from trade_ideas where timestamp >= '2026-08-26' and coalesce(archived,false)=false) x\"" > .cache/score-v2/ideas-raw.json
# 2. Study (Alpaca keys from the main checkout's .env; minute bars reuse .cache/exit-replay/,
#    daily bars with volume cache under .cache/score-v2/day/). EXIT_REPLAY_NOW freezes "now";
#    the npm script defaults it to the exit-rule replay's run (2026-10-01T04:55:30Z).
npm run research:score-v2
npm run test:score-v2
```
