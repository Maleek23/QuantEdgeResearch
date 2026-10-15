# Journal truth: dry-run re-verification (2026-10-15)

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
