# Structural / Algorithmic Levels — Audit and Gap Matrix

Snapshot: 2026-09-30, branch from `integrate/pdf-fixes` (0bdc7048). Line numbers are
as of that commit.

**Why this exists.** The operator flagged this live TSLA flow idea: "Entry at last
($350.41), invalidation at the session low ($345.88)… T1 $359.47 is stated plainly as 2R
off that invalidation, not a structural level. Stop widened … to $337.00 (1.25× ATR)". Both
the target and the hard stop were formula multiples, not prices that desks and algorithms
trade around.

## 1. What the platform computes today, and where

| Level | Computed? | Where (file:function) |
|---|---|---|
| Session VWAP | yes (several copies) | `zero-dte-structure.ts:structureFromBars` :61-74; `technical-indicators.ts:calculateVWAP` :857 / `calculateSimpleVWAP` :240; `daytrade-scanner.ts:calculateVWAP` :94; `zero-dte-sniper-core.ts:vwapSeries` :111; `liquid-reversal-publisher.ts:vwap` :146 |
| VWAP ±1σ / ±2σ bands | display only | `spx-intelligence-service.ts:computeVWAP` :555 (SPX only; used for a position label) |
| Anchored VWAP (prior close / week / month / earnings / swing) | **no** | — |
| Prior-day H/L/C | yes | `zero-dte-structure.ts` :77-79; `premarket-ideas.ts:buildPlanContext` :525; `zero-dte-sniper.ts` :209; `spx-session-scanner.ts:calculateDayLevels` :304 (close only) |
| Prior-week / prior-month H/L/C | **no** | nearest: `target-ladder.ts` 20/60/120-day highs/lows :81-83; sector-ignition 20/60-session |
| Overnight / pre-market H/L | partial | `premarket-ideas.ts:pmSessionStats` :78; `zero-dte-sniper.ts` :248. `pre-market-service.ts` gives the gap % only, no H/L |
| Opening range 5 / 15 / 30 m | partial (OR15, OR30 only) | `zero-dte-structure.ts` OR30 :63-76; premarket 09:30–09:45 OR :274-277; `spx-orb-scanner.ts:calculateOpeningRange` :351; sniper orb15/orb30 |
| Floor pivots | display only | `index-lotto-scanner.ts:calculatePivotPoints` :69; `spx-session-scanner` pivotHigh/Low |
| Camarilla | **no** | — |
| Fibonacci | display / ladder | `technical-indicators.ts:calculateFibonacciLevels` :1258 (via `ta-engine.ts:computeTA` :186-196); `pattern-predictor.ts` :417; candidates in `target-ladder.ts` :90-92 |
| Swing highs / lows, S/R | yes | `level-engine.ts:findSwings` :59; `structural-levels.ts:deriveStructuralPlan` :80; `chart-analysis.ts:detectSupportResistance` :151; `technical-indicators.ts:detectSupportResistanceLevels` :988 |
| Volume profile POC / VAH / VAL, HVN / LVN | **no** | `technical-indicators.ts` :1175-1240 "volumeProfile" is only a rising/falling label |
| GEX call wall / put wall / zero γ / max γ | yes | `options-exposures.ts:computeExposures` :303; `shared/gex-math.ts:pickWalls` :206; `zero-dte-desk-core.ts:expiryBucketLevels` :291; `gex-snapshot-service.ts` |
| Vanna / charm levels | computed, display only | `options-exposures.ts` :245-287 (`vannaFlipPrice`, `maxVannaStrike`); `vanna-exposure.ts` :58 |
| 0DTE strike magnets | yes (index engines) | `gex-magnet.ts:detectMagnets` :90; 0DTE max-γ via `expiryBucketLevels` |
| Dark-pool levels | display only | `chart-overlays.ts:darkPoolFor` :250 (top 60 by notional; SPX = SPY × live ratio) |
| Round numbers | scoring / quant only | `chart-analysis.ts` :209-225; `unified-prediction-engine.ts:buildPsychLevels` :488; `zero-dte-sniper-core.ts:roundStep` :123; `shared/ticker-base-rates.ts:roundNumberPin` :170 |
| MOC / 15:50 imbalance | **no real feed** | `spx-session-scanner.ts:scanCloseImbalance` :738 infers it from volume/VWAP |
| Gap-fill levels | display only | `shared/gap-engine.ts:findGaps` :77 / `analyzeGaps` :133; `structural-targets.ts:findStructuralTargets` :97 (read-only route); `gap-aware-exits.ts` :52 |

## 2. How each publishing engine sets entry, stop and target

| Engine | Stop | Target | Uses structure for… | Write path |
|---|---|---|---|---|
| **Flow tape** `bullflow-tape-scanner.ts` | session low/high, else prior close (1.2–8% band) | **T1 = entry ± 2R (formula)** :295-297, :450-452 | stop only | `ingestTradeIdea` (swing → 1.25× ATR floor) |
| **GEX scanner** `gex-idea-scanner.ts` | flip / wall ×(1±0.5–1%) | wall on the trade side; else `deriveStructuralPlan`; wall-fade target = flip capped at 3% | GEX levels + swings | `storage.createTradeIdea` direct (**no ATR floor**) |
| **Market scanner** `market-scanner.ts:ingestMoversToTradeDesk` :1073 | none passed | none passed | nothing | `ingestTradeIdea`. **Rejected every time** at the discovery-only gate (`trade-idea-ingestion.ts:261-271`), so it is effectively dead |
| **Index scalp / 0DTE desk** `zero-dte-policies.ts:evaluateZeroDte` | broken level ±0.10%, or beyond wall / 3-bar extreme | nearest of call/put wall, PDH/PDL, OR30, zero γ, 0DTE wall (≥1.5R); VWAP / zero γ / 0DTE max γ | **most structural engine** | `storage.createTradeIdea` direct |
| **0DTE short swing** `zero-dte-desk-core.ts:planShortSwing` | wall / zero γ +0.2% if inside 0.35–0.75σ, else 0.5σ | max γ or wall, capped at 1σ | GEX | direct |
| **Pre-market ideas** `premarket-ideas.ts:evaluateSetups` | OR low/high, session extreme | first candidate ≥1R among GEX wall, PDH/PDL, PM H/L, prior close (gap fill) **and 1×/2× range projections (formula)** | mixed | direct |
| **Sector ignition** `sector-ignition.ts` | VWAP / OR30 ±0.1%; swing: 5-session extreme ±0.5% | PDH/PDL, 1×/2× OR30 projections (formula), 20/60-session H/L | mixed | direct |
| **Quant** `quant-ideas-generator.ts:calculateLevels` | swing low + 1×ATR, else 2×ATR; fallback flat 3.5/5/6.25% | swing high within 3.5 ATR else 2×ATR; fallback flat 8%; catalyst branch ±8% / ±2% | close-only swings (weak) | direct |

Post-processing on every new idea: universal-generator sanity clamps
(`universal-idea-generator.ts:1087-1102`) and the loss-rule expected-move cap on T1
(`storage.createTradeIdea` → `loss-rules.ts:applyLossRulesToNewIdea`). Ingestion-path
swing/position ideas also get the 1.25× ATR stop floor (`trade-idea-ingestion.ts`
Gate 5). None of these three steps knows any price level.

## 3. Gap matrix

C = computed · E = used for **entry / stop / target** · D = display / scoring only · — = absent

| Level | Computed | Flow tape | GEX scanner | Market scanner | Index scalp / 0DTE | Pre-market | Sector ignition | Quant |
|---|---|---|---|---|---|---|---|---|
| Session VWAP | C | — | — | — | E | — | E (stop) | D |
| VWAP σ bands | D (SPX only) | — | — | — | — | — | — | — |
| Anchored VWAPs | — | — | — | — | — | — | — | — |
| Prior-day H/L/C | C | E (prior close as stop fallback) | — | — | E | E | E | — |
| Prior-week / month H/L/C | — | — | — | — | — | — | — | — |
| Pre-market H/L | partial | — | — | — | — | E | — | — |
| Opening range | partial | — | — | — | E (OR30) | E (OR15) | E (OR30) | — |
| Floor pivots / Camarilla | D / — | — | — | — | — | — | — | — |
| Volume profile POC / VAH / VAL | — | — | — | — | — | — | — | — |
| GEX walls / zero γ / max γ | C | — | E | — | E | E (walls) | — | — |
| Vanna / charm | D | — | — | — | — | — | — | — |
| 0DTE magnets | C | — | — | — | E | — | — | — |
| Dark pool | D | — | — | — | — | — | — | — |
| Round numbers | D | — | — | — | — | — | — | E (via chart S/R) |
| Swing H/L | C | — | E (fallback) | — | E (3-bar) | — | E (5/20/60) | E |
| MOC imbalance | — (inferred) | — | — | — | — | — | — | — |
| Gap fill | D | E (prior close) | — | — | — | E (fade) | — | — |
| **Confluence of ≥2 kinds** | **—** | — | — | — | — | — | — | — |

### Top gaps (before this change)

1. **No confluence anywhere.** No engine asks whether two independent levels agree. A
   single wall or a single prior-day high is treated as equal to a price where the
   prior-day high, the value-area high and a round number all sit.
2. **Missing level families**: anchored VWAPs, VWAP σ bands, prior week/month H/L/C,
   Camarilla, and volume profile (POC/VAH/VAL/HVN/LVN). These are the standard
   institutional and algorithmic set, and none existed.
3. **Formula targets on the most-published path.** Flow-tape T1 is always 2R. Pre-market
   and sector ignition fall back to 1×/2× range projections. Quant falls back to flat
   percentages.
4. **Stops are never checked against structure.** The 1.25× ATR floor widens a stop to a
   volatility distance. It never asks whether the new stop sits just inside a level
   that will be run.
5. **Dark-pool levels, pivots, fibs, vanna and gap fills are computed but never
   traded.** They reach the chart and scoring layers only.
6. **Market scanner publishes nothing**: it passes no plan, so the gate rejects it.
7. **GEX, index scalp, 0DTE, pre-market, sector ignition and quant all bypass
   `ingestTradeIdea`**, so any central plan logic placed there reaches only the flow tape
   and the older pattern scanners.

## 4. What was built (this change)

- `shared/levels/level-math.ts` holds the pure math, tested in `scripts/test-levels.ts`
  (`npm run test:levels`). It builds a level map from 5-minute (extended-hours) and daily
  bars. Every level carries `source` and `asOf`. The levels:
  - session VWAP with ±1σ/±2σ bands
  - anchored VWAPs from the prior close and the week open (5-minute bars) and the month
    open (daily-bar approximation, labelled)
  - prior day, week and month H/L/C
  - pre-market H/L, session H/L, and 5/15/30-minute opening ranges (only once complete)
  - floor pivots and Camarilla
  - volume profile POC/VAH/VAL for the session (≥1h) and a 5-session composite, both
    **bar-approximated** and labelled so
  - round numbers by price tier
- Confluence: levels are clustered within max(0.1%, 0.15 × ATR(5m)). The score is the
  number of **independent families**. VWAP and its bands count as one family, pivots and
  Camarilla as one, and the D/W/M prior-period levels as one.
- `server/levels/level-map.ts`: `getLevelMap(symbol)` uses a 60-second `BoundedCache`
  (120 entries, 8 MB) with shared in-flight requests. It reuses `fetchCandles` for
  `5d/5m` and `3mo/1d`; the ingestion ATR floor already makes the `3mo/1d` call. GEX
  walls, zero gamma, max gamma and the top-5 dark-pool levels are merged **only from
  existing caches** via new read-only peeks:
  - `peekAggregateGammaExposure`, max age 30 minutes
  - `peekGexSnapshot`
  - `peekDarkPoolLevels`, max age 3 days; SPX is not mapped here

  No chain or Bullflow fetch is ever triggered.
- `shared/levels/snap.ts:snapPlanToStructure`:
  - **Targets** move to the confluent cluster nearest the formula target, before or at
    it. They never go further, never below half the formula reach, and stay inside the
    loss-rule expected-move cap, which is applied first. The target sits on the
    cluster's near edge.
  - **Stops** move just beyond the nearest confluent cluster at or beyond the formula
    stop. The extra room is bounded to max(½ formula risk, ½ daily ATR). For swing and
    position plans the 1.25× ATR floor is applied first and rounded away from entry, so
    Gate 5 never re-widens.
  - **Text** is rewritten honestly, for example "T1 $X = prior-day high + 5-day VAH (2
    independent kinds) — formula T1 was $Y". When nothing qualifies it says so: "…remains
    a formula target, not structure".
- **Wiring**, behind env `LEVEL_SNAP` (default ON, new ideas only; existing rows are never
  touched):
  - `trade-idea-ingestion.ts` Gate 4b, before the ATR floor. This covers the flow tape,
    the market scanner (if it ever supplies a plan) and every other ingestion producer.
    The stale "stated plainly as 2R" sentence is stripped.
  - `gex-idea-scanner.ts:persistCandidate`, because the GEX scanner writes directly to
    storage.
  - The stamp is stored at `convergenceSignalsJson.levelSnap`, with status `measuring`.
- `GET /api/levels/:symbol` serves the map, and a "Levels" list sits in the NEXUS setup
  detail (`nexus-parts.tsx:LevelsList`). The list shows confluent clusters around the
  plan with price, kinds and distance %. Rows the plan's entry, stop or T1 sits on are
  highlighted, and hovering a row shows each level's source.

### Still missing (not built here)

- HVN/LVN nodes, and anchored VWAPs from earnings, gap days and swings.
- A real MOC imbalance feed, and vanna/charm-driven levels.
- 0DTE magnets outside the index engines.
- The snap is **not** yet wired into the engines that bypass ingestion: index scalp /
  0DTE (already structural), pre-market ideas, sector ignition and quant. Those are the
  next candidates, pre-market and sector ignition first because of their range-projection
  fallbacks.
- The market scanner still publishes nothing, since it has no plan to snap.

## 5. Measurement

The research file is `research/level-snap-replay.ts`. Results are in the section below,
and the status is **measuring** until they are read.

### Replay result (run 2026-09-30)

**Setup**
- 20 names, 250 sessions each, 2025-10-01 → 2026-09-29, Alpaca SIP 5-minute and daily bars.
- Levels are built at 10:00 ET with the production `buildLevelMap`, with no look-ahead and no GEX or dark-pool levels.
- Candidate levels sit 0.2–1.5 × daily ATR from price.
- A touch is followed as a hold or a break-through, symmetric at ±0.25 × ATR.

| Half | Group | Levels | Touch rate | Hold of resolved (95% CI) |
|---|---|---|---|---|
| Oct–Mar | confluent (≥2 families) | 12,280 | 33.3% | 57.4% (55.7–59.1), n=3,295 |
| Oct–Mar | confluent ≥3 | 4,192 | 40.7% | 58.5% (55.9–61.1) |
| Oct–Mar | single family | 21,113 | 21.0% | 59.2% (57.6–60.9) |
| Oct–Mar | random (no level within 2 tol) | 16,313 | 17.4% | 56.8% (54.7–58.9), n=2,144 |
| Apr–Sep | confluent | 12,229 | 31.2% | 61.4% (59.6–63.1), n=2,972 |
| Apr–Sep | confluent ≥3 | 4,130 | 38.5% | 62.3% (59.6–65.0) |
| Apr–Sep | single family | 21,267 | 19.1% | 59.4% (57.7–61.2) |
| Apr–Sep | random | 17,196 | 16.1% | 61.4% (59.3–63.4), n=2,121 |

Confluent minus random, hold of resolved:
- Oct–Mar: +0.6 pts (z = 0.44)
- Apr–Sep: 0.0 pts (z = −0.01)

**Reading**
- **Once price reaches a level, confluent levels do not hold better than arbitrary
  prices at a similar distance, in either half.** Every group sits at about 57–61%. That
  baseline is above 50% because of the conservative same-bar rule and intraday mean
  reversion, and it applies to all groups alike.
- Confluent levels are touched about twice as often as random ones (31–33% vs 16–17%).
  Much of that is **selection**: levels such as VWAP bands, OR and session H/L are built
  from where price has just been. It is not evidence that price is attracted to them.
- Conclusion: there is **no measured reaction edge** for bar-derived confluence. The
  snap stays labelled **measuring**. It is defensible only as consistency: it never
  extends a target, only moves stops wider, and states honestly what each number is. It
  is not an alpha claim.
- GEX and dark-pool levels were not in this test because those caches have no history.
- Caveat: observations cluster by symbol-day, so the confidence intervals are
  optimistic.
- Next test: replay actual published plans (formula vs snapped) on hit rate and R.
