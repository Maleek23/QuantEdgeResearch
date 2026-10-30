# Journal truth: spot-check and re-run (2026-10-30)

Read-only, like the 2026-10-15 run. The verifier ran on the droplet against prod data in one READ ONLY transaction that was rolled back. Option bars came from Alpaca 1-min (`--no-massive`; prod's Massive plan is not entitled to option aggs, so the nightly job sees the same sources). Underlying order bars came from Alpaca SIP 1-min. Output went to /tmp/journal-truth only. Nothing was written to the prod database or the prod ledger files.

- Verifier: `research/verify-nexus-book.ts` (rules `verify-nexus-book-v3`), core rules in `research/verify-option-core.ts`
- Aggregation: `research/journal-truth/dryrun.ts`
- Raw output: `reverify-dryrun-2026-10-30.json`

## 1. Spot-check of `wrong_outcome_order`

On 10-15 this class held 267 rows. I checked 21 of them by hand against the contract's 1-min bars and the underlying's 1-min bars: 6 were 0DTE, 15 were swing, and 13 came from premium-stop engines.

**Verdict on the class:** about half of it was artifacts of the verifier, not of the record. When the fixed verifier re-judges the same 267 rows:
- 142 are still wrong order.
- 48 are VERIFIED.
- 28 are entry_repriced.
- 27 are unverifiable.
- 12 are exit_time_misstamped.
- 9 are exit_premium_not_traded.
- 1 is illiquid.

| Row | Recorded | What the bars show | Artifact or real | New verdict |
|---|---|---|---|---|
| QQQ 746P 10-08 0DTE | stop @0.44, 19:20Z | premium stop printed 19:22Z (underlying stop also 19:22Z) | **artifact**: the stamp is a 5-min bucket start and the window ended at stamp+1m | VERIFIED −$30 |
| IWM 276P 10-08 0DTE | target @0.82, 14:50Z | T1 printed 14:54Z | **artifact** (5-min bucket) | VERIFIED +$28 |
| QQQ 753P 10-07 0DTE | stop @1.43, 13:55Z | stop printed 13:58Z | **artifact** (5-min bucket) | VERIFIED −$19 |
| MU 1050C swing | premium stop 14:15Z | stop printed 14:11Z; trigger observed 14:46Z, after the exit | **artifact**: stale trigger stamp, so the window was empty | VERIFIED −$1,072 |
| INTC 115C swing | time exit 13:30Z @9.20 | stop and exit inside the same 09:30 bar | **artifact**: a touch inside the exit minute cannot be ordered | VERIFIED −$245 |
| ARM 270P swing | target @38.85 | T1 on the idea's own Δ is ≤38.85; the assumed Δ0.50 put T1 at 39.59 | **artifact**: `optionDelta` / `qualitySignals` were not passed to the premium plan | VERIFIED +$1,295 |
| AMD 615P 0DTE | target @5.80, 15:25Z | contract 3.8–4.0 at 15:25Z; T1 first printed 16:01Z; no stop before | **real stamp error, outcome right** | exit_time_misstamped +$201 |
| PBR 20.5P 0DTE | stop @0.02 | stop printed 30 min after the stamp | **real stamp error, outcome right** | exit_time_misstamped |
| ALAB 260C swing | premium stop | no contract bars; it had been judged on the underlying instead | **artifact**: a premium-governed row fell back to the underlying | unverifiable |
| META 775C swing | target, stamped 09:02 ET pre-market | target touched at the 09:30 open; recorded exit 23.8 never traded | **artifact** on order; the exit premium is genuinely wrong | unverifiable |
| PSX 220C swing | expired | one print reached T1 on 10-05; the entry re-print came 60 min late | mixed | unverifiable |
| BBY 95C swing | target @3.80 | 3.80 printed; the 1.80 entry never traded | real (entry) | entry_repriced +$187 |
| WDC 420C swing | stop stamped 04:15 ET (extended-hours quote) | stop never touched in RTH, at the open or within 24 h | **real** | wrong_outcome_order |
| IWM 275P swing | stop stamped 08:30 ET | trigger observed after the exit; stop never touched in RTH | **real** (pre-market stop) | wrong_outcome_order |
| DLTR 105C / DHR 165C / MRK 80C / PALL 24C / DELL 470C | expired | underlying stop (or target) touched days before expiry, before 2026-09-30 when the tracker started | **real**: the tracker was not running | wrong_outcome_order |
| TSLA 357.5C 08-27 | stop @ entry | published stop never touched; the stop had been rewritten to breakeven | **real** (rewritten stop) | wrong_outcome_order |
| SPY 765C 0DTE | time exit | trigger bar already above the target | real (incoherent trigger) | wrong_outcome_order |
| QQQ 747C 09-25 | option_target_hit +100% | the old engine's +100% premium rule cannot be reconstructed | legacy label | wrong_outcome_order |

**What still makes up the remaining wrong-order rows (189, including new rows):**
- 110 rows are from before the tracker started on 2026-09-30. 82 of these are "expired" rows whose underlying stop was touched first. These are real misses.
- 37 rows are post-tracker premium "hit" rows where the contract never printed the level, mostly `live` or deadline stamps. The tracker read a quote that never printed as a trade. This quote-versus-print gap cannot be settled without quote history, so these rows stay outside the headline.

**Checks of rows the verifier passed:**
- **10 VERIFIED rows (4 0DTE, 6 swing):** 8 are right as they stand. CNC 70C and KORU 17P passed only because the "first 5 prints after publish" range spanned two days. CNC is now unverifiable. KORU is now entry_repriced at +$280 against +$260 recorded.
- **5 entry_repriced rows:** NVDA 250C, U 41C, SPY 780P and NTAP 190C are right. DASH 145C was "filled" at a print 8 days after the trigger. It is now unverifiable.

## 2. Verifier fixes (rules v3, `research/verify-option-core.ts`; 8 new checks in `test:verify-option-core`)

1. **Order window:**
   - For a barrier outcome, the window runs to the stamp + 5 min. A `live` (cycle) stamp gets + 15 min.
   - A stamp outside RTH runs to the next RTH open + 5 min.
   - For a time or expiry exit, the window ends before the exit minute.
2. **Stale trigger:** a trigger observed after the exit falls back to the first underlying bar at entry, or to publication.
3. **The tracker's premium plan:** the plan uses the idea's `option_delta`, `quality_signals` (prem_t1 / prem_stop) and the tracker's short-dated rule. It is built from the recorded entry.
4. **Premium-governed rows with no contract bars** are unverifiable, never judged on the underlying. `option_target_hit` and `option_stop_hit` count as premium-governed.
5. **New class `exit_time_misstamped`:** the recorded barrier is the first one touched, but later than the stamp (24 h look-ahead). The exit is re-priced at the real touch. The class is correctable.
6. **Entry evidence:**
   - The off-hours "first prints" range spans at most 30 min.
   - A re-priced fill must print within 60 min of the trigger's session open. Otherwise the row is unverifiable.
7. **Ledger version:** the ledger is stamped `verifierVersion`. `--incremental` over a ledger built under other rules does a full re-judge, so old-rule and new-rule verdicts never mix. Tested on the droplet: an unversioned prod copy triggered a full run, and a v3 ledger ran incrementally.

## 3. Headline (1,941 closed rows since 2026-08-26; options as published)

**Verifier counts:**
- All closed rows: 940 VERIFIED, 684 MISMATCH, 317 UNVERIFIABLE, 87 duplicates.
- Options (1,449):
  - VERIFIED: 570.
  - MISMATCH by class: entry_repriced 265, wrong_outcome_order 189, barrier_order_disagrees 51, exit_premium_not_traded 37, exit_time_misstamped 21, fill_off_strike_scale 17, settlement_repriced 8, never_triggered 6, premium_scale_ladder 1.
  - UNVERIFIABLE: 284.

| | n | P&L | W / L |
|---|---|---|---|
| 1 contract each | 838 | **+$24,123** | 325 / 497 |
| $500 budget (over budget shown at 1 contract) | 816 | **−$15,000** | 308 / 492 |

On 10-15 the same view gave +$28,283 (n 411) at 1 contract and −$9,691 (n 396) at $500.

**At $500, by category:**
- Counted: verified 516 (−$16,161) and corrected 300 (+$1,161).
- Not counted:
  - oversize review: 22, +$31,298
  - bar mismatch: 264, −$35,562
  - unverifiable: 260, +$10,924
  - duplicate: 87, +$14,232
  - crypto: 133, −$5,524

At $500, 549 rows sit at "1 contract (over budget)" and 5 sub-$0.10 entries were capped.

**0DTE vs swing:**

| | 1 contract | $500 |
|---|---|---|
| 0DTE | n 188, −$1,366 (51W / 134L) | n 186, −$5,503 (49W / 134L) |
| swing | n 650, +$25,489 (274W / 363L) | n 630, −$9,497 (259W / 358L) |

**Last 10 sessions (2026-10-16 → 10-29, by ET exit day):**

| | 1 contract | $500 |
|---|---|---|
| all | n 339, −$5,625 (109W / 230L) | n 334, −$12,335 (105W / 229L) |
| 0DTE | n 90, −$1,617 (23W / 67L) | n 89, −$4,449 (22W / 67L) |
| swing | n 249, −$4,008 (86W / 163L) | n 245, −$7,886 (83W / 162L) |

Only 10-20 (+$1,758) and 10-21 (+$602) were positive at $500. 10-23 lost −$3,586 with 2W / 25L.

**NEXUS Today, 10-29, at $500:** −$559 realized, 10W / 22L, 4 rows "checking" (+$222 recorded, not counted). Best was NCLH +$565 and worst was SPY −$252. At $1,000 the day is −$911.

**Not scored:**
- legacy shares: 359
- expired without a measured exit: 228
- contract not recorded: 174
- missed entry: 168
- no exit premium: 44
- awaiting entry: 5
- never triggered: 5

**Retro options view (prod retro ledger, reported separately):** 24 of 448 verified. 19 land in the book at −$704 at $500.

## 4. Deploy readiness

- **Nightly `journal-verify`:** the command line is unchanged. The first run after deploy sees the unversioned prod ledger and re-judges every row in full. That took about 25 min on a cold cache here, inside the job's 3 h timeout. The run writes a v3 ledger, and later runs are incremental.
- **UI:** the ledger trade fields `ledgerEntryOf` reads are unchanged. `exit_time_misstamped` is in `CORRECTABLE_BUG_CLASSES`. It passes the never-rewrite-the-outcome guard because its recomputed outcome equals the recorded one. The dry run used the journal's own mapper and view, so these are the numbers the Journal will show.
- **PUBLIC_RECORD:** it is not set in the prod `.env`, and `server/public-showcase.ts` withholds the record unless it is `on`.
- **Gates:**
  - tsc: 445 errors, at the ceiling of 445.
  - `npm run build`: passes.
  - test:* scripts: 88 of 89 pass. test:open-drive fails 18/19, the known market-hours failure. test:discord-lifecycle needs `node_modules/.bin/tsx`, which the worktree does not have; it passed 16/16 on the droplet copy.

---

# (previous) Journal truth: dry-run re-verification (2026-10-15)

This run was read-only. The fixed verifier ran on the droplet against prod data. It used one READ ONLY transaction that was rolled back. Option bars came from Alpaca 1-min with `--no-massive`. All output went to /tmp/journal-truth only. Nothing was written to the prod database or the prod ledger files. The aggregation step is `research/journal-truth/dryrun.ts`. The raw output is `reverify-dryrun.json`.

## Fixed verifier: 1,433 closed trades since 2026-08-26
- VERIFIED: 577 trades, +$30,514 recorded with duplicates excluded. 648 MISMATCH, 208 UNVERIFIABLE, 80 duplicates.
- Options (788): 244 VERIFIED.
  - MISMATCH by class: wrong_outcome_order 267, entry_repriced 168, barrier_order_disagrees 50, exit_premium_not_traded 41, fill_off_strike_scale 17, settlement_repriced 3, never_triggered 3, premium_scale_ladder 1.
  - UNVERIFIABLE: 194.

## New headline (options as published)
| | n | P&L | W / L |
|---|---|---|---|
| 1 contract each | 411 | +$28,283 | 167 / 228 |
| $500 budget (over budget shown at 1 contract) | 396 | −$9,691 | 154 / 226 |

The audit's earlier figures were +$2,694 for the $500 view and +$9,538 verified at 1 lot.

15 trades whose sized P&L is above 2× the budget (+$32,757 at $500) are flagged for review and not counted at $500. At 1 contract they are still included. At $500, 489 rows sit at "1 contract (over budget)" and 4 sub-$0.10 entries were capped. No rows were dropped.

**Counted at $500, by category:** verified 209 (−$9,275) and corrected 187 (−$417).

**Outside the headline at $500:**
- oversize_review: 15, +$32,757
- bar_mismatch: 318, −$12,367
- bar_unverifiable: 179, −$3,905
- duplicate: 80, +$13,686
- crypto: 69, −$3,308

**0DTE vs swing (0DTE now means 0 days to expiry only):**

| | 1 contract | $500 |
|---|---|---|
| 0DTE | n 79, −$1,103 | n 78, −$5,264 (17W / 58L) |
| swing | n 332, +$29,386 | n 318, −$4,427 |

**Not scored, with the reason listed:**
- legacy shares: 359
- expired with no measured exit and no settlement print: 208
- contract not recorded: 175
- missed entry: 113
- no exit premium: 43
- awaiting entry: 29
- never triggered: 5

**Options view of legacy shares ideas (retro dry run, not in the headline):** 86 of 447 verified, up from 0. 74 land in the book for +$755 at $500.

## NEXUS "Today" (2026-10-15, $500)
- Old rule: +$8,402, 30W / 9L, best SMTC +$1,035. This reproduces the strip exactly.
- New rule: +$6,202 realized, 29W / 12L, best AMAT +$1,151, worst DDOG −$735.
  - 19 rows are bar-corrected.
  - 12 rows sit at 1 contract (over budget).
  - 15 rows show "checking" (recorded +$26,761, not counted). These are wrong-order rows such as SMTC and two PANW rows, plus over-2×-budget winners such as SNDK +$10,865 and ASML +$5,700.
- At $1,000 the new rule gives +$19,882.
- Open rows with no quote are shown as "N unquoted (excluded)". Unrealized needs live marks, so it was not reproduced here.

## Gaps
- wrong_outcome_order (267) needs a spot-check, because cycle-stamped exits or 5-minute underlying fallbacks may inflate it.
- Settlement uses the daily close. AM-settled index monthlies are approximate.
- QQQ 746P comes out as VERIFIED under the premium-stop rule. The audit read it as a label error.
- The 1-contract headline is driven by over-budget 1-lot winners.
