# Codex audit — Oct 3 edits (2026-10-06)

Branch `audit/codex`, based on `a4a638ba` (integrate/pdf-fixes).

- `96e6f3e6 wip(codex): Oct 3 edits as found`: the patch and untracked files exactly as Codex left them. The `git apply --3way` was clean.
- Fixes and reverts are separate commits on top of it.
- The operator's two follow-up asks are the last two commits.

## Verdicts

| # | Area (files) | Verdict | Reason |
|---|---|---|---|
| 1 | Live-leadership wiring (`server/index.ts` cron, `routes.ts` `/api/market-scanner/surges/feed`) | **REVERT** `858f2888` | This is the operator's separate work, not Codex's. It imports `./live-leadership-promoter`, which is not in this tree. The route would return 500 and the cron would log an error every 5 minutes. The a4a638ba handler is restored. |
| 2 | Option outcome classification (`shared/constants.ts` `hasMeasuredOptionOutcome` → `isRealWin` / `isRealLoss` / `classifyOutcomeV2`; `storage.getDecidedTrades`; `win-rate-service`; journal desk exclusions; track-record note) | **FIX** `d6a327d0` | Codex gated every option win/loss on an `[exit-premium:execution]` tag, and no producer writes that tag. Every option target and stop became "unresolved". The canonical record, model record, journal and win-rate service would all silently drop options, which is a methodology change to the operator's record. The a4a638ba semantics are restored. `hasMeasuredOptionOutcome` stays, documented as a diagnostic. **Kept:** options are judged on contract P&L only, never the underlying move, for expiry and manual closes; the touch-bar and intrinsic counters stay. |
| 3 | Bot quote gate (`tradier-api.optionMarkExecutionIssue`, `paper-trading-service` marks / stop checks / `closeOptionPositionAtBid`, `quant-bot` entries, manual close route) | **FIX** `a9c6ddde` | Every delayed quote was refused for entries, marks and exits. Prod has only delayed feeds: Tradier sandbox, Alpaca indicative and CBOE. As patched, that means **zero entries**, no re-marks (so stops and targets never fire), 0DTE positions held through the flatten, and manual option closes impossible. **Fix:** a two-sided delayed quote is accepted with `delayed=true` provenance, after 10:00 ET (09:50 for index 0DTE). Exits fall back from delayed bid to the last mark if it is under 10 minutes old. The quote audit tags are kept, and the Alpaca priority lane is no longer forced for display marks. The stale `delayedFillNotBeforeEtMinutes` config is restored. |
| 4 | GEX/VEX hold from contract DTE; prepared-plan ingestion (`persistPreparedTradeIdea`) for gex scanner, gex-vex, gex magnet and index scalps | **KEEP + FIX** `30bf3f95` | Routing these through dedup, the cross-source "already held" check, loss cooldown and the ATR floor is right. Three defects fixed. **(a)** gex-magnet dropped `optionPublishPlan`; restored. **(b)** gex-vex R:R divided by a possibly-zero risk; now guarded and rounded. **(c)** Index scalps got a 30-minute per-symbol cooldown plus the open-row and cross-source blocks, so one SPY swing idea would block every SPY 0DTE scalp. The new `intradayContract` option keeps loss cooldown and the 0.5h instrument dedup. |
| 5 | Plan snapshot (`shared/plan-snapshot.ts`, `storage.createTradeIdea` / `updateTradeIdea`, journal plan levels) | **KEEP + FIX** `fc0382da` | Freezing published levels is right. Two defects fixed. **(a)** The freeze overwrote contract fields with the snapshot's nulls, so the stock→option backfill (`universal-idea-generator`) wrote option rows with no strike, expiry or premium. A contract unknown at publish can now be attached once. **(b)** Every `updateTradeIdea` did an extra SELECT, including on the outcome tracker's hot path. It now reads only when the update touches plan fields. The journal now reads only `->'planSnapshot'`, not the full JSON for every desk row. |
| 6 | Oracle trigger observer (`oracle-lifecycle-reconciler.ts`): bar-path trigger vs invalidation | **KEEP + FIX** `fc0382da` | Resolving trigger vs stop order from bars is right. Two defects fixed. **(a)** When trigger and stop fell in the same bar, the idea was resolved as "invalidated before trigger". That made it a missed entry (unresolved), which silently removed real losses from the record; it now resolves to triggered. **(b)** With no bar path, an idea could never trigger; it now falls back to the poll extrema. Candle fetches are now sequential (1 vCPU). |
| 7 | Option expiry at exact intrinsic (`performance-validation-service`), `[expiry-premium:*]` tags, bot-reconcile expiry tag | **KEEP** | Settles at the expiry-day print, or withholds if there is none. Honest, and consistent with the journal. |
| 8 | Tracker-pass option exits stop feeding `optionPercentGain` | **KEEP (operator note)** | A later-pass mark is not the outcome-time price (live-not-carried). `exitPremium` is still stored, so the journal desk still shows a P&L for those rows (see decision 4). |
| 9 | `option-minute-history` drops zero/volume-less Yahoo bars; 60s max delay on a mark | **KEEP** | Zero rows were being read as $0 trades. |
| 10 | Confidence calibration, ML calibrator, conviction backtest, `/api/admin/win-loss*`, stop-loss sim | **KEEP** | All of these now use the canonical classifier. The ML calibrator also had real schema bugs (`confidence` → `confidenceScore`, `createdAt` → `timestamp`). The stop-loss sim no longer claims an "optimal threshold" from final outcomes. With #2 fixed they follow the restored methodology. |
| 11 | `stripConflictingTargetClaims` (thesis text vs persisted T1) | **KEEP** | |
| 12 | Bot fill verification (`shared/bot-fill-verification.ts`), journal measurement column, bot page "quote-audited W–L", research CSVs and scripts | **KEEP** | Display and audit only. A delayed or last-mark fill is correctly classified "unverified". |
| 13 | NEXUS grade g2 (`shared/nexus-grade.ts`) + NEXUS row/detail | **KEEP + extended** `3afa8890` | The operator asked for this direction. See "Operator ask a". |
| 14 | Bot grade snapshot on fills, `lastCycle.skipped` | **KEEP + extended** `636f4518` | See "Operator ask b". |
| 15 | `displayedBand` / `displayedGrade` reorder, trade-audit `CanonGrade` | **Superseded** | The trade audit now shows the NEXUS grade at publish. |

**Security.** No auth changes. The manual paper-close route still checks ownership. The CSV export quotes `outcomeNotes`.

**Performance (1-CPU droplet).** Three per-row costs found, all fixed: the extra SELECT per update (#5), the full JSON per journal row (#5) and parallel candle fetches (#6).

## Operator ask a: one NEXUS grade everywhere (`3afa8890`)

**The grade.** g2 is the only grade (`docs/NEXUS_GRADE_G2_2026-10-03.md`). It sums five factors:

| Factor | Points |
|---|---:|
| Confluence | 25 |
| Technical | 15 |
| Live validity | 25 |
| Window left | 25 |
| Session | 10 |

- The score is one integer, and the letter is read off that integer, so there is no more "73.7 vs 93" or "B 90".
- `formatNexusGrade()` is the only display string.
- The label everywhere is *actionability score — unvalidated, not a win probability*.
- Legacy scores appear only in a collapsed "diagnostics (unvalidated)" section.

**Surfaces.**
- NEXUS rows, detail, table and grid, plus the GRADE A/B lens.
- Today: book list, Top NEXUS grade, signal cards.
- Ticker setups, Catalyst, and the Quantinum cockpit layer.
- Discord: the signal gate is now grade ≥ B; the bot-entry embed and the daily preview show the grade; weekly picks no longer print a blank grade.
- Bot page log and fills; journal note and loss-analysis dimension.
- Alerts: "NEXUS grade A" replaces "90+", and the jump rule fires on a letter change.
- Trade audit, Flow, Chart Lab.

**Validation logging.** Components are written once per idea at first board surfacing to `convergence_signals_json.nexusGradeAtPublish`, with a `[NEXUS-GRADE]` log line. Every bot fill carries `gradeComponentsTag`. `research/grade-audit.ts` is fixed for g2 and prefers the logged stamp.

**Test.** `test:nexus-grade` includes a cross-surface identity test: the same fixture idea gives an identical "L NN" through every path.

**Finding: g2 does not rank outcomes.** `research/grade-audit.ts --study` (443 bar-verified ideas):

| Measure | ρ H1 | ρ H2 | Result |
|---|---:|---:|---|
| g2 grade | −0.09 | +0.05 | Does not rank outcomes |
| Confluence (25 points) | −0.11 | −0.13 | **Negative** in both halves |
| Stop width in ATR | +0.23 | +0.11 | Holds |
| Short side | +0.18 | +0.09 | Holds |

High grades currently mean "strong-looking and takeable", not "more likely to win".

## Operator ask b: why the bot took no trades (`636f4518`)

**Diagnosis from code.** I had no prod access; run `npm run research:bot-diagnose` read-only on the droplet to confirm which of these applies.

1. **Capacity.** One `maxOpen=10` shared by long-dated swing contracts that had no time stop, so stale positions held the book full.
2. **Entry floor.** The floor was the raw evidence score ≥ 18. Index 0DTE plans score low, and the score is inverted on the honest record.
3. **0DTE path.** Only gex_scanner index scalps expiring *today* had a 0DTE path. zero_dte_desk, zero_dte_flow and gex_magnet ideas fell through to the swing selector (30–60 DTE under a $300 debit cap) and found no contract.
4. **Quote gate.** Codex's gate (#3) would have refused every entry on prod's delayed feeds.
5. **Tape sit-out.** A tape "sit_out" verdict blocks every entry for the cycle. Kept; it is now visible in the skip reasons.
6. **No reasons recorded.** Refusals were counted, never explained.

**Worker/web double-run.** The Postgres advisory lock already prevented double cycles. Cycles are now refused under `ROLE=web` and scheduled only in the worker.

**Implemented** (reusing `fix/bot-entries` `09c638f5` `shared/bot-sleeves.ts`):

| Area | Rules |
|---|---|
| 0DTE/1DTE sleeve | Index + mega-cap names. Sources: index scalps, zero_dte_desk, zero_dte_flow, gex_magnet ≤ 2 DTE. Entries 09:35–11:30 ET; delayed quotes accepted from 09:50. `BOT_0DTE_MAX=3`. |
| 0DTE premium bracket | −40% stop. +50% moves the stop to breakeven. +100% target. Flatten at 15:45. |
| Swing sleeve | Top NEXUS grade ≥ 65. `BOT_SWING_MAX=4`. |
| Time stops | At the live mid only; no live quote means no close. Applies to retired runs too. |
| Hard rules | Never opposite directions on one symbol (also enforced in `executeTradeIdea`). No same-day re-entry after a stop-out. |
| Skip reasons | Per-cycle counts by reason, the best three refused, and capacity, shared from the worker to the web process and shown on the bot page. |

**Test.** `npm run test:bot-sleeves`.

## Checks

- **tsc:** 451 at baseline, 450 for Codex as found, **446** now. Live-leadership import removed (−1), surge-feed signal typed (−3), and no new errors. tsc-gate passes.
- **nav:** `research/nav-architecture.py`: 0 FAIL.
- **build:** `npm run build` passes (vite + esbuild web/worker).
- **test:\* scripts:** 39 run, 38 pass. That includes the new `test:bot-sleeves`; `test:nexus-grade` is rewritten for g2; `test:publish-gates` gains plan-snapshot checks; `test:idea-dedup` and `test:journal` are updated. Codex's edits had broken 6 of these (journal, exit-dates, outcome-pipeline, idea-dedup, track-record, nexus-grade); all are fixed. `test:consistency` already fails at a4a638ba ("bucket walls … units $B per 1%"); it is pre-existing and not touched here.

## Decisions for the operator

1. **Strict option provenance.** Should the canonical record count an option outcome only with an executable-fill tag, as Codex proposed? As it stands, no producer writes that tag, so turning it on would empty the options record. It needs a real fill feed (OPRA or production Tradier) first.
2. **Grade weights.** g2 rewards confluence, which ranked negatively in both halves. Keep it as an actionability ordering, or re-weight toward stop width and side once the logged components (`nexusGradeAtPublish`) accumulate?
3. **Live quotes for 0DTE at 09:35.** On delayed feeds the 0DTE sleeve effectively starts at 09:50. Fills stay "unverified" until an OPRA (Alpaca) or production Tradier entitlement exists.
4. **Pass-priced option exits.** These no longer set `optionPercentGain` (#8), but the journal still prices them from `exitPremium`. Exclude them from the journal too, or keep them?
5. **Sleeve settings.** Swing grade floor (65), sleeve sizes (`BOT_0DTE_RISK_USD=150`, `BOT_SWING_RISK_USD=500`, `BOT_SWING_MAX_DEBIT_USD=1500`) and `BOT_0DTE_AFTERNOON` (off) are environment settings; confirm them before deploy.
6. **Deploy rule.** Nothing was deployed. No deploys between 08:30 and 10:30 ET.
