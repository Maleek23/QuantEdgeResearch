# Loss attribution — NEXUS ideas and Quantinum Bot, 2026-08-26 → 2026-09-30

Prepared 2026-09-30 (after the close). Read-only against production; nothing was written to the database.

- Scripts: `research/loss-attribution.ts` (P&L by dimension, duplicates, exit stamps) and `research/shakeout-review.ts` (post-exit paths, stop-rule what-ifs).
- Results: `research/loss-attribution-results.json` and `research/shakeout-review-results.json` (every number below is in them).
- Window: ideas published since 2026-08-26 (the clean-era baseline). Earlier outcomes are invalid because of known tracker bugs and are excluded.
- Halves: H1 = 08-26 → 09-12 (218 closed trades), H2 = 09-13 → 09-30 (46 closed trades). H2 is small, so treat its numbers as indicative only.

## How the books are measured

- **NEXUS ideas (the desk book).** Every published idea is scored as a unit-sized trade, exactly as the journal scores it (`server/journal-row-maps.ts` `mapDeskIdea`):
  - options: 1 contract, at the recorded entry and exit premiums;
  - stocks and crypto: $1,000 notional.
  - "$ per trade" below means per unit-sized trade.
  - 470 ideas were scorable: 264 closed and 206 open. The open ideas are not in the P&L.
  - 374 ideas were excluded by the journal's own mapper rather than counted as $0:
    - 158 expired with no measured exit;
    - 108 were options with no entry premium, which is **all 142 `spx_session` ideas** plus 43 `gex_scanner` ideas;
    - 108 were resolved with no exit premium (102 of them `market_scanner`).
  - This coverage gap is itself a finding (see F-4 in the SR 11-7 v6 report).
- **Quantinum Bot.** Every `paper_positions` fill in every bot portfolio, at the bot's own size (`server/bot-ledger.ts`). That is 46 fills, of which 40 are closed.
- **Exit timing caveat.** The outcome tracker only ran continuously in production from 2026-09-30. Earlier exits were resolved in batch sweeps and carry the sweep time (see section 6). Two consequences:
  - Option exits recorded as `hit_stop` were priced at the contract quote **at the sweep**, not at the stop. This is why 17 `hit_stop` rows show a *positive* P&L (+$1,166 in total).
  - `research/shakeout-review.ts` re-prices every stop from bars as an independent check.

## 1. Where NEXUS loses money

**Whole book:** 264 closed trades. 103 won and 151 lost, a **39.0% win rate**. Net **−$4,070**, or −$15.42 per trade. The average win was +$238.58 and the average loss −$189.70.

### Biggest $ drains, ranked

These groups overlap, so their totals are not additive.

| # | Drain | n | Win rate | Net $ | $/trade |
|---|---|---|---|---|---|
| 1 | Ideas that **hit their stop** (all engines) | 72 | 23.6% | −7,160 | −99.44 |
| 2 | **Aug 31 batch**: ideas published Mon Aug 31, mostly after the close, then marked in the Sep 1 and Sep 8 sweeps | 74 | 32.4% | −7,634 | −103.16 |
| 3 | Options **published after the close** (16:00–24:00 ET) | 72 | 34.7% | −4,516 | −62.72 |
| 4 | `market_scanner` · call · swing (mostly 8–21 DTE) | 86 | 29.1% | −3,738 | −43.47 |
| 5 | `gex_scanner` (all) — negative in **both** halves (H1 −1,134, n=5; H2 −693, n=23) | 28 | 25.0% | −1,827 | −65.25 |
| 6 | Duplicate ideas: same symbol, side and engine, any strike (section 5) | 38 closed | 28.9% | −2,621 | −68.97 |
| 7 | `quant` · stock · swing | 8 | 12.5% | −1,013 | −126.58 |

Losses are concentrated:

- The 15 worst trades account for −$16,454, which is 57% of all gross losses (−$28,644).
- 13 of those 15 are `market_scanner` calls published Aug 31 – Sep 1, expiring Sep 11 or Sep 18.
- 9 of the 15 ended "expired" at 7 days, between −15% and −99% (MDB 500C −$2,120, NSC 310C −$1,350, CBOE 250C −$1,155, …).

By contrast, options published during regular hours (RTH) made money: n=73, 37.0% win rate, **+$1,757.50**.

### By engine

| Engine | n | Win rate | Avg win | Avg loss | Net $ | $/trade |
|---|---|---|---|---|---|---|
| market_scanner | 162 | 37.7% | 294.31 | −225.71 | −3,941 | −24.33 |
| gex_scanner | 28 | 25.0% | 72.64 | −111.22 | −1,827 | −65.25 |
| zero_dte_desk | 3 | 33.3% | 20.00 | −46.00 | −72 | −24.00 |
| quant | 55 | 47.3% | 135.85 | −134.95 | +293 | +5.33 |
| flow | 8 | 37.5% | 557.00 | −249.00 | +675 | +84.38 |
| crypto_engine | 5 | 40.0% | 73.44 | −29.55 | +58 | +11.65 |
| gex_magnet / hybrid / tradingview | 1 each | — | — | — | +13 / +210 / +520 | — |

`spx_session` does not appear: all 142 of its ideas were excluded for having no entry premium. `sector_ignition` (2 ideas) and `premarket_gap` (0 ideas) have no closed trades.

### By asset, option side, holding period and DTE

Stocks and crypto are sized at $1,000, options at 1 contract.

| Slice | n | Win rate | Avg win | Avg loss | Net $ | $/trade |
|---|---|---|---|---|---|---|
| Option | 161 | 37.3% | 374.93 | −275.37 | −2,563 | −15.92 |
| Stock | 96 | 41.7% | 43.75 | −60.89 | −1,660 | −17.29 |
| Crypto | 7 | 42.9% | 109.57 | −44.11 | +152 | +21.75 |
| Calls | 136 | 36.0% | 449.33 | −309.97 | −1,850 | −13.61 |
| Puts | 25 | 44.0% | 43.50 | −85.07 | −712 | −28.50 |
| Swing | 208 | 39.4% | 257.91 | −221.66 | −5,007 | −24.07 |
| Day | 42 | 33.3% | 96.80 | −39.12 | +299 | +7.12 |
| Position | 14 | 50.0% | 295.78 | −238.74 | +638 | +45.57 |
| 0DTE | 15 | 40.0% | 144.00 | −18.67 | +696 | +46.40 |
| 8–21 DTE | 112 | 34.8% | 488.05 | −323.48 | −2,316 | −20.67 |
| 22–60 DTE | 28 | 46.4% | 198.31 | −275.92 | −733 | −26.18 |
| Lotto (trade type) | 20 | 55.0% | 223.64 | −157.56 | +1,042 | +52.10 |
| Scalp (trade type) | 20 | 25.0% | 66.40 | −38.14 | −202 | −10.10 |

### By direction, day of week, entry time and conviction band

| Slice | n | Win rate | Net $ | $/trade |
|---|---|---|---|---|
| Long thesis | 238 | 38.7% | −3,349 | −14.07 |
| Short thesis | 26 | 42.3% | −722 | −27.75 |
| Monday publishes (all Aug 31) | 74 | 32.4% | −7,634 | −103.16 |
| Tuesday | 82 | 39.0% | +958 | +11.69 |
| Wednesday | 86 | 45.3% | +2,690 | +31.28 |
| Published after close | 123 | 38.2% | −4,973 | −40.43 |
| Published during RTH | 122 | 38.5% | +747 | +6.12 |
| Published pre-market | 19 | 47.4% | +156 | +8.20 |
| Conviction band S | 6 | 33.3% | −2,333 | −388.81 |
| Conviction band A | 41 | 39.0% | +557 | +13.58 |
| Conviction band B | 85 | 31.8% | +1,490 | +17.53 |
| Conviction band C | 103 | 38.8% | −5,280 | −51.26 |
| No band | 29 | 62.1% | +1,495 | +51.57 |

The conviction band does not rank outcomes. S, the top band, is the worst per trade, and B beats A on dollars. `probabilityBand` shows the same disorder: A −$7,002 (n=130) against A− +$7,026 (n=17).

### By stop distance (underlying)

| Stop distance | n | Win rate | Net $ | $/trade |
|---|---|---|---|---|
| <0.5% | 20 | 40.0% | +644 | +32.20 |
| 0.5–1% | 14 | 21.4% | −864 | −61.74 |
| 1–2% | 78 | 29.5% | −7,387 | −94.71 |
| 2–4% | 72 | 44.4% | +8,239 | +114.43 |
| 4%+ | 80 | 46.3% | −4,702 | −58.77 |

## 2. Where the Quantinum Bot loses money

**Whole book:** 40 closed fills (all options; 39 calls, 1 put). 12 won and 28 lost, a 30.0% win rate. Net **+$103**, or +$2.58 per fill. The average win was +$1,241.83 and the average loss −$528.54.

| Slice | n | Win rate | Net $ | $/fill |
|---|---|---|---|---|
| Run 2 (Aug 26 – Sep 18) | 30 | 40.0% | +4,908 | +163.60 |
| **Run 3 (Sep 24 –)** | 9 | **0%** | **−4,632** | −514.67 |
| Exit: hard or soft **stop** | 13 | 0% | **−9,080** | −698.46 |
| Exit: trailing stop | 4 | 0% | −1,020 | −255.00 |
| Exit: time / expiry | 4 | 50% | +4,306 | +1,076.50 |
| Exit: other (gap_magnet, flow_reversal) | 19 | 52.6% | +5,897 | +310.37 |
| Engine `gex_scanner` | 3 | 0% | −1,967 | −655.67 |
| Engine `market_scanner` | 15 | 26.7% | −1,127 | −75.13 |
| Engine `flow` | 2 | 0% | −1,026 | −513.00 |
| Engine `quant` | 20 | 40.0% | +4,223 | +211.15 |
| DTE 22–60 | 7 | 28.6% | −1,738 | −248.29 |
| DTE 60+ (SNOW 420C Jan-27) | 1 | 0% | −1,538 | −1,538.00 |
| DTE 8–21 | 30 | 33.3% | +4,045 | +134.83 |
| Band S / B / C | 9 / 10 / 11 | 33 / 10 / 18% | −2,220 / −1,689 / −1,196 | — |
| Band A | 10 | 60% | +5,208 | +520.80 |
| Friday entries | 14 | 7.1% | −5,050 | −360.71 |

The bot's drains, ranked:

1. Premium stops at −31% to −95%: −$9,080.
2. Every Run 3 fill (from Sep 24) lost: −$4,632. These were mostly `gex_scanner`, `flow` and `market_scanner` signals taken Sep 24–25.
3. Long-dated contracts (22+ DTE): −$3,276.

Only `quant`-sourced signals and band A made money.

## 3. Shakeouts: stopped out, then green

Method (`research/shakeout-review.ts`):

- For each closed losing trade, the script finds the first 5-minute regular-session bar that crossed the stop. Stocks use Yahoo bars; options use Alpaca 1-hour contract bars. For ideas that expired rather than hit their stop, the exit time is used instead.
- It then looks at the rest of the original plan window. That window is `exit_by`, else publish + 7 days, capped at the contract's expiry and at now.
- Each loss is labelled:
  - **shakeout → target**: the underlying reached the original target after the stop;
  - **shakeout → green**: the contract (or the stock) closed above entry at some point, but the target was not reached;
  - **real loss**: neither happened.

| Population | n | Real loss | → target | → green | Shakeout rate | Lost $ |
|---|---|---|---|---|---|---|
| All closed losses | 151 | 121 | 10 | 20 | 19.9% | −28,645 |
| **Stop-outs (`hit_stop`)** | **46** | 29 | 6 | 11 | **37.0%** | −8,326 |
| Expired or time-stopped losses | 105 | 92 | 4 | 9 | 12.4% | −20,318 |

**The dollars are in the real losses, not the shakeouts.**

- The 17 stop-out shakeouts cost −$1,447 in total. The 29 real stop-out losses cost −$6,879.
- On the 36 stop-outs that could be priced, holding to the end of the plan would have lost **−$5,081**, against −$4,411 realised. The stops saved $670 net.
- Of 60 expired option losses, 20 closed above entry at some point before the contract's own expiry. The 7-day plan window cut them off. This is a horizon mismatch, not a stop problem (see fixes).

Stop-out shakeouts, broken down:

| Slice | n | Shakeout rate | Lost $ |
|---|---|---|---|
| quant | 12 | 66.7% | −824 |
| flow | 3 | 66.7% | −992 |
| gex_scanner | 12 | 25.0% | −2,230 |
| market_scanner | 16 | 25.0% | −4,191 |
| crypto_engine | 3 | 0% | −89 |
| Stop <1% of underlying | 10 | 40.0% | −731 |
| Stop 1–2% | 20 | 45.0% | −2,564 |
| Stop 2–4% | 12 | 33.3% | −3,394 |
| Stop 4%+ | 4 | 0% | −1,637 |
| Stop <0.5 ATR | 19 | 36.8% | −3,952 |
| Stop 0.5–1 ATR | 25 | 40.0% | −2,938 |
| Stop ≥1 ATR | 2 | 0% | −1,436 |
| Option down <10% at the stop bar | 8 | 37.5% | −1,039 |
| Option down 10–25% | 7 | 14.3% | −1,881 |
| Option down 35–50% | 4 | 25.0% | −2,565 |
| Option down ≥50% | 5 | 20.0% | −1,794 |
| H1 | 30 | 46.7% | −6,069 |
| H2 | 16 | 18.8% | −2,257 |

**Today's examples, checked against bars:**

- **IWM 290P and 275P (Oct 16, `gex_scanner`).** These were *not* price stops.
  - They hit the Loss Rules v1 **time stop**. `gex_scanner` tagged these 16-DTE puts `holding_period='day'`, so `horizonTradingDays` gave a 1-day horizon.
  - Half of one day means an exit at 12:45 ET unless the trade was at least +0.5R.
  - They closed at −0.7% (−$8) and −4.7% (−$13.50). Both contracts later closed above entry (290P high 12.60 vs 11.51 entry; 275P 3.23 vs 2.865). Confirmed shakeouts.
- **IWM 280P (Oct 1).** Expired at its same-day deadline at −7.3% (−$12). The contract later printed 2.20 vs 1.65 entry. Confirmed shakeout.
- **IWM 279P ×3, IWM 280P (Sep 30), SPY 767C/768C (Sep 30), TSLA 355C/352.5C, META 732.5P.**
  - Their exits are stamped **Sep 29 8:00 PM ET, before they were published**.
  - Cause: `server/performance-validator.ts` (option-expiry check, ~line 702) does `new Date(idea.expiryDate)`. A date-only string parses as 00:00 UTC, which is 8 PM ET the previous evening.
  - So any idea on an option that expires that day is "expired" at the first tracker pass and priced at whatever that pass reads. There are 9 such rows; they are 0DTE ideas and expiry-day holds.
  - Two of the IWM 279P rows later reached the original target.
- **LGHL (`quant`, stock).** Stopped at 1:35 PM at −14.9% (−$149). The stop was 14.9% away (0.54 ATR). **Not green so far**: the best 5-minute close after the stop was still 2.9% below entry. Its 7-day window is still open.
- **SPY 770C and 768C (Oct 1).** Correctly stopped. Neither recovered; horizon values were 0.29 vs 1.60 and 0.58 vs 1.78.

## 4. Stop-rule what-ifs (same closed trades)

The rules compared:

- **A** — the current rule, re-priced at the first bar that crossed the underlying stop.
- **B** — exit only when the underlying stop is through **and** the contract is down at least 25%.
- **C** — the same as B at 35%.
- **D** — the stop is never tighter than 1.25 × ATR(14), for swing and position ideas.

Only the 72 `hit_stop` rows can change. The other 192 closed trades are identical under every rule, so they are carried at their recorded P&L. Where a variant cannot be priced from bars (11–15 rows), the recorded P&L is kept.

| Rule | All 264: net $ | Win rate | H1 (218) net $ | H2 (46) net $ |
|---|---|---|---|---|
| Recorded | −4,070 | 39.0% | −5,500 | +1,429 |
| A current, bar-priced | −5,097 | 39.4% | −7,351 | +2,253 |
| B option ≥25% | **−7,061** | 36.7% | −8,586 | +1,525 |
| C option ≥35% | −4,217 | 37.9% | −5,936 | +1,719 |
| D 1.25×ATR floor | **−603** | 39.8% | −3,359 | +2,756 |

**Robustness check:** the change against A on the 72 stop rows.

| Rule | Δ$ vs A | Trades better / worse | Δ$ excluding the two duplicate MDB 350C rows |
|---|---|---|---|
| B | −1,962 | 6 / 25 | −7,070 |
| C | +718 | 9 / 26 | −4,390 |
| D | +4,307 | 21 / 27 | **−801** |
| D, H2 only | +503 | 5 / 7 | (driven by DELL +$890) |

What the what-ifs show:

- **Contract-% stops (B, C) make things worse in both halves.** They keep losers open until the contract is already down 25–35%.
- **The ATR floor (D) looks best, but its whole gain comes from one trade published twice.** MDB 350C, published Aug 25 9:05 PM and again Aug 26 4:35 AM, gapped up after the stop; that is +$5,108.
  - Without those two rows, D is flat to slightly negative: −$801 over 72 stops, with 21 trades better and 27 worse.
  - The v3 walk-forward that supported the floor (n=332) is **not confirmed on this window**. The label stays "measuring".
- **Does the 1.25 × ATR floor already apply to swings? Only for engines that write through `server/trade-idea-ingestion.ts`.**
  - `gex_scanner` (`storage.createTradeIdea` in `server/gex-idea-scanner.ts:366`) and `gex_magnet` (`server/gex-magnet-actions.ts:138`) bypass it.
  - Swing and position ideas published since 2026-09-24 with a stop tighter than 1.2 ATR:

    | Engine | Below 1.2 ATR |
    |---|---|
    | gex_scanner | 33 of 50 |
    | gex_magnet | 1 of 1 |
    | quant | 2 of 2 |
    | market_scanner | 25 of 141 |

- **Stop timing:**
  - 27 of 72 stops were first crossed in the **9:30 opening bar**: ideas published after the close that gapped through the stop.
  - 9 of 72 stops are **not crossed in any regular-session bar**. Examples are NVDA recorded at 4:45 PM and GOOGL at 4:22 PM. They were triggered on extended-hours or stale quotes.

## 5. Duplicates

| Definition | Groups | Duplicate ideas | Closed | Win rate | Net $ | $/trade | Still open |
|---|---|---|---|---|---|---|---|
| Same symbol + side + engine + **same instrument**, overlapping or same/next ET day | 21 | 31 (26 while an earlier one was open) | 15 | 33.3% | −1,218 | −81.19 | 16 |
| Same symbol + side + engine, **any strike or expiry** | 28 | 59 | 38 | 28.9% | −2,621 | −68.97 | 21 |

- For comparison, first instances returned −$11.46 per trade. The second and later copies lose about 6–7× as much per trade.
- By engine (any-strike, closed):

  | Engine | n | Net $ | Wins |
  |---|---|---|---|
  | gex_scanner | 15 | −665 | 2 |
  | quant | 16 | −598 | — |
  | market_scanner | 3 | −1,377 | — |

- Examples:
  - IWM 279P ×3 (Sep 30);
  - XBI 150P ×5 (Sep 26–29);
  - QQQ 700P and AVGO 400C ×4 each;
  - CRM 220P ×2 (both −$232);
  - WDC 530C ×3 within 40 minutes on Aug 26 (−$824 and −$220).
- 87 further rows were already collapsed in the database (`resolution_reason='duplicate_collapsed'`).
- A same-instrument dedup (`server/lib/instrument-dedup.ts`) was deployed at 17:10 CT today. It does not cover the any-strike case.

## 6. Exit-time sanity

- Of the 522 closed ideas that have an `exit_date`, there are only **129 distinct timestamps**.
- **49 timestamps are shared by two or more different symbols. They cover 433 rows (83%).**
- Only 33 rows carry an `[exit-time:…]` tag: 14 `bar_hit`, 17 `deadline`, 2 `live`. 76 rows have a date-only stamp.

| Stamp (ET) | Rows | Symbols | What |
|---|---|---|---|
| Sep 24 9:15:51 AM | 103 | 103 | one sweep; all `auto_expired` (market_scanner, quant) |
| Sep 8 2:43:12 PM | 95 | 95 | one sweep; all `auto_expired` |
| Sep 1 12:41:18 PM | 23 | 23 | one sweep; 18 stops, 3 targets, 2 expired |
| Sep 29 8:00:00 PM | 12 | 5 | the UTC-midnight expiry bug above; `deadline` tag |
| Sep 30 11:40:00 AM | 6 | 4 | CRM ×3, FNV, AMC, XBI — `bar_hit`, "repaired from sweep stamp 10:42 CT" |

- **Code path that sets the exit time.**
  - `server/performance-validator.ts` stamps target and stop hits with `exitDate: formatExitDate(now)`: the tracker pass time, in America/Chicago.
  - `server/performance-validation-service.ts` `refineExitTiming()` (added today in c896300b) then replaces that with the first bar at or after the **entry anchor** that crossed the level (`shared/exit-hit-time.ts` `firstLevelTouch`).
  - The entry anchor is `server/lib/exit-time-bars.ts` `entryAnchorMs`: the later of the publish time and `executionAudit.triggerObservedAt`.
  - The exit premium is still the quote at the pass. The note says so: "contract exit premium unchanged (quoted at the sweep)".
- **The Sep 30 11:40 AM cluster is one trigger-observer pass, not six stops in one bar.**
  - All six rows have `triggerObservedAt = 2026-09-30T15:35:35.404Z`.
  - The first 5-minute bar after that is 11:40. Each underlying was already beyond its stop at 11:40, so each one "crossed" in that bar.
  - Independent bars show the real first crossings:
    - CRM (stops 227.43 and 228.14): the 9:35 AM bar;
    - XBI (157.36): **Sep 28 1:10 PM**;
    - FNV and AMC: the Sep 29 9:30 opening bar.
  - Two errors follow:
    1. The trigger observer marked ideas "triggered" whose stop was already violated.
    2. The repair anchored the hit time to that trigger rather than to the real breach.

## Recommended fixes, ranked by $ impact in this window

1. **Stop publishing options after the close, or hold them until the next session's first 30 minutes and re-price.**
   - After-close options lost −$4,516 (n=72) while RTH options made +$1,758 (n=73).
   - 27 of 72 stops were first crossed in the opening bar.
   - Owner: idea pipeline (`market_scanner` scheduler).
2. **Suspend or re-gate `market_scanner` call swings (8–21 DTE)** until a walk-forward replay shows a positive half. The group lost −$3,738 on n=86, and the Aug 31 batch alone lost −$7,634.
3. **Fix the stop-out bookkeeping before trusting any stop metric.**
   - Price option stop exits at the stop bar, not at the sweep: 17 "stops" are booked as wins (+$1,166).
   - Do not trigger an idea whose stop is already breached.
   - Anchor the repaired hit time to the first real breach, not to `triggerObservedAt`.
4. **Fix the expiry-date parse** in `server/performance-validator.ts`. Treat `expiryDate` as 16:00 ET on that date. Otherwise every 0DTE or expiry-day idea is "expired" before it is published (9 rows today; all 0DTE results are invalid until fixed).
5. **Collapse any-strike duplicates** (same symbol, side and engine within a session). That is 59 ideas, −$2,621 closed, 21 still open.
6. **`gex_scanner` and `gex_magnet`:**
   - route them through the ingestion gates (the ATR floor);
   - stop tagging multi-week contracts `holding_period='day'`, which puts a noon time stop on 16-DTE puts (the IWM 290P and 275P shakeouts);
   - `gex_scanner` lost in both halves (−$1,827, 25% win rate).
7. **Do not adopt contract-% stops (B or C).** They were worse in both halves.
   - Keep the ATR floor as "measuring": this window neither confirms nor refutes it once the duplicated MDB trade is removed.
   - Revisit with n ≥ 150 stop-outs.
8. **Bot:**
   - Premium stops cost −$9,080. Holding those contracts to the end of the plan would have cost more (−$14,268 vs −$11,340 realised on the 25 that could be priced), so the stops are not the leak. Signal selection is.
   - Restrict the bot to `quant`-sourced / band-A signals (+$4,223 and +$5,208) until the Run 3 engines (`gex_scanner`, `flow`, `market_scanner`: 0/9) show a positive replay.
