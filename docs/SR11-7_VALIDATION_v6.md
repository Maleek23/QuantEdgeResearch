# QuantEdge — Model Validation Report v6 (SR 11-7)

**Date:** 2026-09-30, after the close.
**Previous reports:**

- v1 and v2 (2026-09-24): replay ground truth; stop width identified as the #1 loss driver.
- v3: the 1.25 × ATR stop floor.
- v4: UI and UX.
- v5: surface inventory.

**Scope:** every model that publishes, ranks or trades an idea on the platform, measured on the clean-era record (ideas published from 2026-08-26). All evidence was produced read-only against production. Nothing was written, deployed or restarted.

**Evidence produced today:**

- `research/loss-attribution.ts` → `research/loss-attribution-results.json`
- `research/shakeout-review.ts` → `research/shakeout-review-results.json`
- The companion write-up, `docs/LOSS_ATTRIBUTION_2026-09-30.md`, has every table.
- Replay results from `research/flush-reclaim-replay.ts` were supplied by the operator; they were not re-run for this report.

**Status labels:**

- **Validated**: independent evidence supports the claim.
- **Not supported**: the evidence contradicts the claim.
- **Measuring**: too few observations, or no independent test yet.

---

## 1. Summary

1. **NEXUS ideas (unit-sized book)**
   - Record: 264 closed trades, 39.0% positive, net **−$4,070** (−$15.42 per trade).
   - H1 (Aug 26 – Sep 12): −$5,500 on n=218.
   - H2 (Sep 13 – Sep 30): +$1,429 on n=46.
   - H2 is too small to call a turn.
2. **The losses are concentrated, not spread evenly.**
   - Options published **after the close**: −$4,516 (n=72).
   - `market_scanner` 8–21 DTE call swings: −$3,738 (n=86). The Aug 31 batch alone lost −$7,634.
   - Options published during regular hours made +$1,758 (n=73).
3. **Stops are not the main leak.**
   - 37% of stop-outs later turned green (17 of 46). Those shakeouts cost only −$1,447.
   - Holding every priceable stop-out to the end of its plan would have lost **more** (−$5,081 vs −$4,411).
   - Contract-% stop rules were worse in both halves.
   - The 1.25 × ATR floor looks best, but only because of one trade that was published twice. Its status goes back to **measuring**.
4. **The outcome record has known defects that distort the metrics.** All are listed in section 7:
   - 83% of exit timestamps are shared across symbols (batch sweeps);
   - option stop exits are priced at the sweep, not at the stop;
   - a date-parse bug expires every expiry-day option idea the evening before;
   - the trigger observer triggers ideas whose stop is already breached;
   - 374 of 844 ideas cannot be scored at all.
5. **Quantinum Bot.** Net **+$103** on 40 closed fills. Run 2 made +$4,908; **Run 3 (from Sep 24) is 0 for 9, −$4,632**. Only `quant`-sourced and band-A signals are positive.
6. **Operations.**
   - Production restarted **40 times today** on the memory limit: 20 web, 20 worker, between 11:40 ET and 6 PM ET.
   - A deploy at 17:10 CT (c1980ccb) broke the NEXUS journal book: the desk loader throws `invalid regular expression`. **Critical; fix before the next session.**

---

## 2. Model inventory

| # | Model | Purpose | Code | Output since 08-26 | Status |
|---|---|---|---|---|---|
| M1 | **NEXUS engines**: the idea producers | Publish trade ideas (entry, stop, target, contract) | see rows below | 940 published ideas; 470 scorable | mixed |
| M1a | `market_scanner` | multi-setup equity/option scanner | `server/market-scanner.ts` → `trade-idea-ingestion.ts` | 426 ideas, 162 closed, −$3,941 | **Not supported** (H1 −$5,018 on n=158; H2 +$1,077 on only n=4) |
| M1b | `quant` | quant-engine ideas | `server/quantitative-analysis-engine.ts` | 168 ideas, 55 closed, +$293 | Measuring (+$5.33 per trade, 47% win rate) |
| M1c | `gex_scanner` | gamma-level ideas | `server/gex-idea-scanner.ts` (writes via `storage.createTradeIdea`, **bypassing the ingestion gates**) | 140 ideas, 28 closed, −$1,827 | **Not supported** (negative in both halves) |
| M1d | `flow` | options-flow ideas | flow tape pipeline | 31 ideas, 8 closed, +$675 | Measuring (n=8) |
| M1e | `spx_session` | SPX session scalps | `server/spx-session-scanner.ts` | 153 ideas; **0 scorable** (no entry premium) | Suspended since 09-24 (−0.27R in v2) |
| M1f | `gex_magnet`, `swing_catcher`, `orb_scanner`, `crypto_engine` | smaller producers | various | 5 / 2 / 1 / 6 ideas | Measuring |
| M2 | **Conviction engine** (`gen_conviction_band` S/A/B/C) | Ranks ideas at publish | `server/convictions-engine.ts` | bands on 235 closed desk trades | **Not supported** as a ranker: S −$388.81 per trade (n=6), A +$13.58, B +$17.53, C −$51.26 |
| M3 | **Quantinum Bot** (paper execution) | Takes signals, sizes them, manages exits (premium stops, trailing, gap_magnet) | `server/quant-bot.ts`, `server/bot-ledger.ts` | 46 fills, 40 closed, +$103 | Run 2 +; **Run 3 0/9** → Not supported for non-`quant` signals |
| M4 | **0DTE desk** (and the 0DTE sniper, deployed 17:10 CT today) | Same-day index/ETF option ideas | `server/zero-dte-desk*.ts`, `server/zero-dte-sniper*.ts` | 3 closed desk ideas, −$72 | **Measuring**. Invalid until the expiry-date parse is fixed (F-3) |
| M5 | **Sector ignition** | Sector-rotation ignition ideas | `server/sector-ignition.ts` | 2 ideas (today), 0 closed | Measuring |
| M6 | **Pre-market ideas** (`premarket_gap`) | Pre-market gap ideas | `server/premarket-ideas.ts` | **0 published** in the window | Measuring (no output) |
| M7 | **GEX engine** (levels, rankings, magnets) | Gamma exposure used by M1c, M1f and the UI | `server/gex-*.ts` | feeds M1c/M1f | Measuring. Its idea outputs (M1c) are not supported; no independent level-accuracy test this cycle |
| M8 | **Outcome tracker and trigger observer** | Grade ideas (target/stop/expiry, exit time, exit premium) | `server/performance-validator.ts`, `server/performance-validation-service.ts`, `shared/exit-hit-time.ts`, oracle lifecycle | every outcome above | **Defects found** (F-1, F-2, F-3, F-5) |
| M9 | **Loss Rules v1** (target cap, time stop) | Cap targets at expected move; exit at half-horizon unless ≥0.5R | `server/loss-rules.ts`, `shared/loss-rules.ts` | 2 time stops in the window | Measuring. Mis-applied when `holding_period` is wrong (F-7) |

## 3. Data lineage and quality

| Input | Source | Status | Effect |
|---|---|---|---|
| Option chains and quotes | Tradier (primary) | **Tradier key dead since 2026-09-30.** CBOE and Alpaca are the fallbacks (`server/alpaca-options.ts`, the shared CBOE loader) | Entry/exit premiums and marks come from delayed or indicative fallbacks. Source attribution is per mark (journal-marks) but not per stored premium |
| Flow direction | `options_flow_history` | **`sentiment` is 'unknown' on 100% of rows since 2026-08-27** (e.g. 253 of 253 on 09-30, 476 of 476 on 09-24) | Chain-snapshot flow carries no direction. Any flow "bias" or "tape flipped" logic built on it is unsupported |
| Underlying bars (for this report) | Yahoo chart API: 5-minute RTH bars since 08-19, daily bars for ATR | Complete for 262 of 264 trades (TRUMP and SUI missing) | Independent of the tracker |
| Option bars (for this report) | Alpaca `v1beta1/options/bars`, 1-hour | 158 of 161 option trades have prints (after capping `end` 20 minutes before now; the plan rejects the latest 15 minutes) | Hourly closes are coarse; stated |
| Stored option premiums | `trade_ideas.entry_premium` / `exit_premium` | 108 option ideas have **no entry premium** (all `spx_session` and 43 `gex_scanner`). 108 are resolved with **no exit premium** | 374 of 844 ideas cannot be scored (44%) |
| Exit timestamps | `trade_ideas.exit_date` (America/Chicago) | 433 of 522 share a stamp with another symbol. Only 33 carry an `[exit-time]` tag | Hour-of-exit and holding-time analyses before 09-30 are unreliable |

## 4. Outcomes vs the honest baseline

- **Baseline (2026-08-26, post-fix):**
  - 42% win rate, +0.137R per trade, on n=88 decided trades (Wilson 95% CI 32–52%).
  - Statistically indistinguishable from zero.
- **Today, same clean era, larger n:**
  - **Barrier outcomes** across all engines: 29 targets vs 138 stops. That is **17.4% of barrier-decided ideas**. The rest (about 560) expired, were collapsed, or are open.
  - **Journal P&L**, unit-sized: 264 closed, 39.0% positive, −$15.42 per trade. Average win +$238.58 vs average loss −$189.70, a payoff ratio of 1.26. At a 39% win rate that ratio is below break-even (1.56 would be needed).
  - Expectancy in R is **not** restated here. Option P&L is in contract dollars while stops are underlying levels, so a single R is not defined across the book.
- **Conclusion:** there is still no evidence of edge at the book level. The positive pockets are small:
  - RTH-published options: +$1,758 (n=73);
  - `quant`: +$293 (n=55);
  - 0DTE: +$696 (n=15), but that result is invalid under F-3;
  - lotto: +$1,042 (n=20).

  All of these are "measuring".

## 5. Today's findings

### 5.1 Loss attribution

Detail is in `docs/LOSS_ATTRIBUTION_2026-09-30.md`.

- After-close option publishing: −$4,516 (n=72).
- `market_scanner` call swings: −$3,738 (n=86).
- `gex_scanner`: −$1,827 (n=28), negative in both halves.
- `quant` stock swings: −$1,013 (n=8).
- The 15 worst trades are 57% of gross losses.
- The conviction band and the probability band do not rank outcomes.

### 5.2 Shakeouts

- **Stop-outs:** of 46 losing stop-outs, 6 later hit the original target and 11 turned green without the target (37%).
  - By engine: `quant` 67%, `flow` 67%, `gex_scanner` 25%, `market_scanner` 25%.
  - By stop tightness: <1 ATR 39% (n=44); ≥1 ATR 0% (n=2).
  - In dollars, real losses (−$6,879) dwarf shakeouts (−$1,447).
- **Expired option losses:** 20 of 60 were green at some point before the contract's own expiry. The 7-day plan window ends many 8–21 DTE contracts early.
- **Today's IWM 290P and 275P** shakeouts were Loss Rules **time stops**, not price stops. `gex_scanner` tags 16-DTE puts `day`.
- **SPY 770C and 768C** were correct stops.
- **LGHL** has not recovered to entry so far; its window is still open.

### 5.3 Stop-rule what-ifs

Net $ on 264 closed trades:

| Rule | All | H1 | H2 |
|---|---|---|---|
| Recorded | −4,070 | −5,500 | +1,429 |
| Current, bar-priced | −5,097 | −7,351 | +2,253 |
| Contract ≥25% | −7,061 | −8,586 | +1,525 |
| Contract ≥35% | −4,217 | −5,936 | +1,719 |
| 1.25×ATR | −603 | −3,359 | +2,756 |

- **Contract-% stops: Not supported** (worse in both halves).
- **1.25×ATR: back to Measuring.** +$5,108 of its gain is one MDB 350C trade published twice. Without it, the floor is −$801 across 72 stop-outs.
- **The floor does not cover `gex_scanner` or `gex_magnet`.** 33 of 50 `gex_scanner` swing ideas since 09-24 have stops under 1.2 ATR.

### 5.4 Duplicates

- Any-strike duplicates (same symbol, side and engine, overlapping or same/next day): **59 ideas**. The 38 closed ones lost **−$2,621** (−$68.97 per trade), against −$11.46 per trade for first instances. 21 are still open.
- Exact-instrument duplicates: 31 ideas, 15 closed, −$1,218.
- Today's deploy adds same-instrument dedup only.

### 5.5 Exit-time stamping

- 129 distinct stamps for 522 exits. Three sweeps account for 221 rows:
  - Sep 24 9:15:51 ET: 103 rows;
  - Sep 8 2:43:12 PM: 95 rows;
  - Sep 1 12:41:18 PM: 23 rows.
- **The Sep 30 11:40 ET cluster** (CRM ×3, FNV, AMC, XBI):
  - The code path is `performance-validation-service.ts refineExitTiming` → `shared/exit-hit-time.ts firstLevelTouch`, anchored at `server/lib/exit-time-bars.ts entryAnchorMs` = max(publish, `triggerObservedAt`).
  - All six share `triggerObservedAt` = 11:35:35 ET, from one trigger-observer pass. The first bar after it (11:40) is "the hit" because price was already through the stop.
  - The real first crossings were CRM 9:35 ET, XBI **Sep 28** 1:10 PM, and FNV/AMC Sep 29 9:30.
- The validator's own stamp is `formatExitDate(now)` (`server/performance-validator.ts`, target and stop branches).
- Exit premiums remain the sweep quote.

### 5.6 Production memory restarts and in-memory state

- **pm2 restarts (`max_memory_restart`):**
  - Web: 700 MB limit, observed peaks up to 1.31 GB.
  - Worker: 900 MB limit, peaks up to 1.27 GB.
  - 40 restarts today, 20 of each. The worker restarted every 2–10 minutes between 17:15 and 20:11 UTC.
- **Effect on in-memory state:**
  - The outcome tracker starts 2 minutes after boot (`server/background-jobs.ts`), then runs every 5 minutes. With the worker living 2–10 minutes, most passes were first-after-boot sweeps. That is how exit stamps cluster.
  - The trigger observer (2-minute loop), dedup windows, GEX aggregates (60-second shared cache), journal mark caches and the heavy-job gate queue all reset on every restart.
  - Setups can be observed late: first pass after boot, as in 5.5.
  - Any intraday state that is not persisted (e.g. ORB ranges, intraday highs and lows between polls) is lost.
- **Research-run disclosure:**
  - One web restart (21:59:39 UTC) happened while this review's first read-only script was starting. The script is a separate process; its contribution to web memory cannot be excluded, and host memory was tight.
  - Later runs (to about 22:25 UTC) coincided with no restarts.

### 5.7 Deploy regression found during this review

- c1980ccb (deployed 17:10 CT) adds, in `server/journal-sources.ts loadDesk`:

  ```
  sql`substring(${tradeIdeas.outcomeNotes} from '\[exit-time:([a-z_]+)\]')`
  ```

- The template's cooked string drops the backslashes. Postgres receives `'[exit-time:([a-z_]+)]'` and rejects it: `invalid regular expression: parentheses () not balanced`.
- `loadDesk` throws, so **the NEXUS ideas book in the journal (and anything that calls `loadJournal(…'desk')`) fails** since the 22:12 UTC web restart.
- The fix is to escape the backslashes as `'\\[exit-time…\\]'` or pass the pattern as a bound parameter.
- The research scripts here load the desk directly through the same pure mapper to stay independent of this bug.

## 6. Replay evidence produced today

Supplied by the operator from `research/flush-reclaim-replay.ts`; not re-run here.

| Hypothesis | Result | Status |
|---|---|---|
| Failed-squeeze short (flush then reclaim fails) | Held in **both halves**, about +0.2R per trade | Measuring. Positive out of sample, but n and costs not yet disclosed; paper-trade before promotion |
| Weekly flag breakouts | Only the version confirmed by volume drying up beat baseline on the +10%-in-4-weeks test. **On real call prices it failed walk-forward** | Not supported as an options strategy |

These follow the signal-lab rule: a short-window win is a regime artifact until it survives a walk-forward on real contract prices.

## 7. Findings register

Owners: **Eng-Outcomes** = outcome tracker and trigger observer; **Eng-Pipeline** = idea producers and ingestion; **Model-GEX** = GEX engine and gex producers; **Bot** = Quantinum Bot; **Ops** = hosting and deploys; **Operator** = Malik.

| ID | Finding | Severity | Owner | Remediation |
|---|---|---|---|---|
| F-0 | Deploy c1980ccb breaks the desk journal loader (regex escaping in a `sql` template) | **Critical** | Ops / Eng-Outcomes | Escape the backslashes or bind the pattern; add a test that runs `loadDesk` against Postgres; redeploy outside 08:30–10:30 ET |
| F-1 | Option stop exits priced at the tracker pass, not at the stop. 17 "hit_stop" rows show gains (+$1,166) | High | Eng-Outcomes | Re-price at the stop bar (contract bar or model) when the hit time is known; flag "premium at sweep" rows and exclude them from stop statistics until repaired |
| F-2 | Trigger observer triggers ideas whose stop is already breached. The exit-time repair then anchors the "hit" to the trigger pass (the Sep 30 11:40 cluster) | High | Eng-Outcomes | Refuse to trigger when price is beyond the stop; mark such ideas "invalidated before trigger" (no P&L); anchor hit time to the first real breach |
| F-3 | `new Date(expiryDate)` parses date-only expiries at 00:00 UTC, so expiry-day options are "expired" at 8 PM ET the evening before (9 rows today, exits before publish) | High | Eng-Outcomes | Parse the expiry as 16:00 ET (or 16:15 for index products); re-grade the 9 rows; 0DTE results are invalid until then |
| F-4 | 374 of 844 ideas are unscorable: `spx_session` and 43 `gex_scanner` options have no entry premium; 108 resolved without an exit premium | High | Eng-Pipeline | Block publish of an option idea without an entry premium; capture the exit premium at resolution or mark it unmeasured |
| F-5 | 83% of exit stamps are batch sweeps; hit time is unknown for most pre-09-30 exits | Medium | Eng-Outcomes | Run `scripts/repair-exit-dates.ts` (dry run first) with the F-2 anchor fix; keep the "hit time unknown" label (deployed today) |
| F-6 | After-close option publishing: −$4,516 (n=72) vs RTH +$1,758 (n=73). 27 of 72 stops first crossed in the opening bar | High ($) | Eng-Pipeline | Stage after-close ideas as candidates and publish or re-price after 10:00 ET; measure for 4 weeks |
| F-7 | `gex_scanner` tags multi-week contracts `holding_period='day'`, so Loss Rules put a noon time stop on 16-DTE puts (the IWM 290P and 275P shakeouts) | Medium | Model-GEX | Derive the holding period from DTE; re-check time-stop coverage |
| F-8 | `gex_scanner` and `gex_magnet` bypass the ingestion gates (ATR floor and others): 33 of 50 recent swing stops are under 1.2 ATR; `gex_scanner` is negative in both halves | Medium | Model-GEX / Eng-Pipeline | Route through `trade-idea-ingestion.ts`; hold `gex_scanner` publication to "measuring" until a replay is positive |
| F-9 | `market_scanner` call swings (8–21 DTE): −$3,738 (n=86), concentrated in the Aug 31 batch | High ($) | Eng-Pipeline | Suspend or re-gate pending a path replay on real call prices, with a halves split |
| F-10 | Any-strike duplicates: 59 ideas, −$2,621 closed; the copies lose about 6× as much per trade as first instances | Medium | Eng-Pipeline | Extend dedup to symbol + side + engine within a session, whatever the strike or expiry |
| F-11 | The conviction band and probability band do not rank outcomes (S worst; B > A) | Medium | Eng-Pipeline (convictions) | Stop displaying the band as a quality signal until it is calibrated; refit on post-fix outcomes with a halves split |
| F-12 | Bot Run 3 is 0/9 (−$4,632); premium stops −$9,080, although holding would have lost more | Medium | Bot | Restrict the bot to `quant` / band-A signals until the other sources replay positive; keep the stops |
| F-13 | 1.25×ATR floor not confirmed on this window (gain driven by one duplicated trade) | Low | Eng-Pipeline | Keep as "measuring"; re-test at n ≥ 150 stop-outs with duplicates removed |
| F-14 | `options_flow_history.sentiment` is always 'unknown'; chain-snapshot flow has no direction | Medium | Eng-Pipeline (flow) | Derive the side from trade-vs-quote or drop directional flow claims; audit the "tape flipped" supersede logic that depends on it |
| F-15 | Tradier key dead; premiums come from CBOE/Alpaca fallbacks without per-row source attribution | Medium | Operator / Ops | Renew the key; store `premium_source` with each entry and exit premium |
| F-16 | 40 memory restarts today; in-memory state (trigger observer, dedup, caches) reset every 2–10 minutes | High | Ops | Raise the limits to match the heap flags or cut the heap (GEX parse, chain loaders); persist trigger and dedup state; alert on more than 3 restarts per hour |
| F-17 | Expired option losses: 20 of 60 were green before the contract's own expiry. The 7-day backstop shortens 8–21 DTE plans | Low | Eng-Outcomes | Align the backstop with the plan's stated horizon or DTE; report both |

## 8. Limitations

- H2 has only 46 closed desk trades and 9 bot fills. Half-split conclusions are indicative only.
- Option re-pricing uses 1-hour trade-print closes from Alpaca's indicative feed. Illiquid contracts can be stale within the hour, and 3 option trades had no prints. No bid/ask or slippage is modelled.
- The desk book is unit-sized (1 contract or $1,000). Dollar rankings over-weight high-premium contracts; per-trade % averages are in the results JSON.
- Pre-09-30 exit times are mostly sweep stamps. Hour-of-exit analyses are not reported for that reason.
- The ATR used is a 14-day simple average of true range from Yahoo daily bars, matching `trade-idea-ingestion.ts`.
- "Green" means the contract (or stock) closed above entry on at least one bar after the stop, within the plan window. It is not a claim that the trade was exitable at that price.
- The replay results in section 6 were not re-run here.

## 9. Ongoing monitoring

Re-run weekly and before any promotion:

- `research/loss-attribution.ts` and `research/shakeout-review.ts`: the halves split, duplicate counts and exit-stamp sharing (target: <10% shared stamps once F-2 and F-5 are fixed).
- The path replay (`research/path-replay.ts`) against the tracker: agreement rate.
- Coverage: scorable ideas as a share of published ideas (target >90% after F-4).
- pm2 restarts per day (target 0).
