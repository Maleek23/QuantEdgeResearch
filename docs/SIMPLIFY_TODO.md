# Simplify TODO — duplicated logic left in place

Snapshot 2026-09-30 (feat/simplify). Everything below was **not** consolidated because
the outputs are not identical to the canonical helper and the divergence is not
documented as a bug. Merging any of them changes numbers somebody sees, so each needs an
owner decision and, where noted, a re-baseline. Ranked by value / risk.

Canonical homes: `shared/gex-math.ts` (greeks, exposure, flip, walls),
`shared/gex-regime.ts` (gamma regime, flip distance), `shared/model-record.ts`
(public win rate), `shared/loss-rules.ts` (`realizedVolDaily`, `expectedMove`),
`client/src/lib/format.ts` (display formatting).

## 1. GEX side implementations

1. **Flip-distance sign conventions (3).** Canonical `classifyGammaRegime().zeroGammaDistPct = (spot − zg) / zg · 100`.
   - `(flip − spot) / spot`: `server/gex-snapshot-service.ts` (read by `convictions-engine.ts` as `aboveFlip = dist < 0`), `server/gex-history-archiver.ts`, `server/gex-idea-scanner.ts` (`FLIP_PROXIMITY_PCT` 1.5).
   - `(spot − flip) / spot`: `server/index-scalp-engine.ts`, `server/gex-vex-scanner.ts`.
   - `|spot − flip| / spot`: `server/gex-vex-projector.ts`, `server/gex-to-trade-desk.ts` (re-implements `nearFlip`).
   - Repointing flips the sign for the snapshot/archiver path, so `convictions-engine` must invert `aboveFlip` at the same time. Archived `gex_snapshots` rows keep the old sign.
2. **`server/vanna-exposure.ts` (legacy VEX, opposite sign).** `+sign·vanna`, no 0.01 (per 100 vol pts), heuristic vanna `γ·S·(1−2|Δ|)/iv`, max-vanna × summed OI. Methodology Findings 3 and 4 call this wrong. Consumers: `/api/vanna-exposure/:symbol` (no client reader) and `gex-vex-projector.ts`. The sign flip does not move projector levels, but the 100× unit changes projector `strength`. Move onto `vannaPerVolPt` / `bsVanna` and re-baseline the projector.
3. **`server/gex-vex-projector.ts`.** Net-GEX top-5 walls (Finding 7 says use `pickWalls`); regime via absolute $0.5B thresholds (methodology §9). Move onto `pickWalls` + `classifyGammaRegime`. Feeds `unified-prediction-engine` and `projection-validator`, so re-baseline both.
4. **`server/flow-gex-convergence.ts` Tradier leg.** No 0.01 factor (100×), flip = last cumulative sign change. Only runs when CBOE fails and a Tradier key works (token documented dead). Candidate for deletion rather than repoint.
5. **`server/gex-bullflow-fallback.ts` walls.** Net-extreme walls with a stale "CBOE-path conventions" comment. Could feed `pickWalls` (`callGEX = call`, `putGEX = |put|`, OI walls null). The cumulative flip must stay (no contracts to re-price; disclosed).
6. **`server/gex-vex-scanner.ts toSnapshot` wall/GEX fallbacks.** Probably unreachable when the aggregator ran `pickWalls`, but `result` can come from fallback sources; confirm every producer sets `callWall`/`putWall` before deleting.
7. **Vanna-flip cumulative walk** is written three times (`options-exposures.ts`, `vanna-exposure.ts` ×2). Extract one helper into `gex-math.ts`.
8. **`server/yahoo-options-fallback.ts computeGreeks`.** Gamma is bit-identical to `bsGamma(…, 0.045)`. Vanna uses a different operation order (ulp-level). Theta and vega have no canonical equivalent yet.
9. **Flip-role tolerance** `max(0.5, spot·0.0025)` is duplicated in `gex-cboe-fallback.ts` and `gex-vex-scanner.ts`. Hoist it into `gex-math.ts`.
10. **`server/gex-dte-buckets.ts dealerFlowPer1PctFromGamma`** equals Σ sign·`gexPer1Pct` to about 1 ulp. Fold it into the caller (`gex-cboe-fallback.ts`).

## 2. Expected move (no canonical market-implied helper yet)

1. Pick a canonical `expectedMove` for the implied case (IV × √(days/252) vs /365). Today:
   - 252-day: `spx-intelligence-service.computeExpectedMove`, `market-projector.computeExpectedMove` (VIX in %), `unified-prediction-engine` / `gex-vex-projector` daily EM (identical to each other), `today.tsx` and `today-tools.tsx` (identical copies).
   - 365-day: `shared/contract-value.ts`, `server/contract-picker.ts` and `shared/contract-engine.ts` (identical expression), `deep-options-analyzer`, `earnings-hub`, `contract-analyzer/analyze`, `flow-scanner` (×0.5), `flow-validation`.
   - Straddle: `zero-dte-desk-core.expectedMoveFor` (ATM mid, no 0.85 factor).
2. Weekly realized-vol cone: `routes.ts` (weekly-path input, guard 0.02–1.5) and `ticker-page.tsx` (guard 0.02–3) re-derive `shared/loss-rules.realizedVolDaily` with different guards.
3. `tv-chart.tsx` 1σ band ≈ `expectedMove(spot, realizedVolDaily(closes, 20), 1)`, but it does not filter non-positive closes.
4. Misleading names: `options-quant.ts` returns a **percent** in a field named `expectedMove`; `earnings-prediction-service.calculateImpliedMove` ignores its `currentPrice` argument.

## 3. Regime / VIX classifiers (no shared VIX classifier exists)

`shared/gex-regime.ts` classifies gamma only. VIX buckets differ everywhere:
`macro-signals.analyzeVIXRegime` (30/20/15/12), `macro-signals.getQuickMacroRegime` (15/25),
`market-pulse.classifyVix` (13/20/30), `market-context-service` (15/20/25),
`quantitative-analysis-engine.classifyMarketRegime` (35/25/**13**), `ml/regime-detector.detectRegime` (35/25/**15**),
`multi-factor-analysis.assessMarketRegime` (15/25/35), `unified-prediction-engine` (35/25/18/13),
`projection-validator` (15/25), `unified-validator` (38/13/25), `geopolitical-matrix` (25/15).
The closest pair is `quantitative-analysis-engine` and `ml/regime-detector`, which differ only in the low-vol cut (13 vs 15). Decide one table in `shared/` first.
Gamma-regime copies: `gex-vex-projector.determineRegime` (see 1.3) and `gex-history-archiver.netGexSign` (no 5% neutral band).

## 4. Win rate (canonical: `shared/model-record.ts computeModelRecord`)

1. `/api/performance/outcome-model` (routes.ts): same population and `classifyOutcomeV2`, but no 30-sample floor and `toFixed` rounding. It becomes identical once the floor is applied, so it is the easiest next repoint.
2. `server/win-rate-service.ts WinRateService.calculate` (`/api/performance/unified-win-rate` and three other routes): v1 ±3% rule, all time. model-record.ts names the resulting 43.4% as invalid. Retire it or relabel it as a legacy view.
3. `/api/performance/auto-lotto-bot` counts breakeven as a loss (model-record.ts cites the resulting 31.6%). `auto-lotto-trader.ts` (prop firm and lotto portfolio), `/api/auto-lotto-bot/status` and routes.ts ~28430 use wins/closed. These are separate books (bot P&L), so they need their own canonical, not model-record.
4. Admin reports and the Friday recap use v1 status-only rates (hit_target / (hit_target + hit_stop), or / all non-open).
5. `premarket-ideas.summarizeRecord` is close to v2 but has a 20-sample floor and ignores `optionPercentGain`.

## 5. Formatting helpers vs `client/src/lib/format.ts`

Repointed in this pass (identical output): `gex-colors.fmtSignedUsd` (and `fmtGexB` / `fmtVexM` through it), `journal/missed-view.pct`, `journal/loss-view.fmtR` / `fmtSPct`.

Near-misses. Each one changes a visible string, usually for the better (U+2212 minus, "—" for NaN, no "+0%"):
- `ticker/ticker-data.ts` `fmtPct` ("+0.00%" at zero), `fmtPx`, `fmtBig` (1-dp B tier).
- `gex-colors.fmtAge` vs `fmtDuration` (keeps ".0h", negatives print "-5s").
- `dashboard/tools/flow/tape.ts money` (2-dp M), `flow/flow-board.tsx money` (no B tier), `flow/flow-card.tsx money`.
- `charting/chart-layers.ts fmtUsd` (signed calls are identical to `fmtUsd(v, {compact, signed})`; the unsigned form drops the minus sign).
- `lib/journal/metrics.ts` `fmtMoney` / `fmtPct` / `fmtPrice`, `metrics-extra.ts money`, `use-journal-extra.ts fmtUsd`.
- `zerodte/zero-dte-desk.tsx` and `zero-dte-ideas.tsx` `px` / `pct`, `today-model.tsx fmt`, `today.tsx usd`, `nexus-parts.tsx money`.
- `lib/utils.ts` `formatCurrency` / `formatPercent` / `formatVolume` (null → "$0.00" / "+0.00%").
- `crypto-nexus.tsx`, `conviction-backtest-card.tsx`, `oracle-market-field.tsx`, `journal/trade-view.tsx`, `journal/traders-view.tsx` percent helpers.
- Leave as is (intentionally different): `gex-strike-grid.fmtCompact`, `oracle/signal-detail` and `gap-magnets` `money`, `ui/qe-num fmt`, `chart-layers fmtVol`.

## 6. Dead code left for an owner

- `client/src/components/ui/{empty-state,qe-bar,qe-legend,qe-num,switch}.tsx` and `shared/rating-accuracy.ts` (only `qe-legend` imports it) are unreachable from `main.tsx`. They were kept as primitive-library pieces (the qe-* set was upgraded in the luxui merge; `qe-legend` and `rating-accuracy` landed 2026-09-29). Adopt them or delete them.
- The mobile `@media` rules at the end of the v1 landing block in `client/src/styles/nexus.css` still name `.modules-grid` and `.workflow-grid`, which no page renders. They are compound one-liners and harmless.
